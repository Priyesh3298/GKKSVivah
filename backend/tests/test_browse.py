"""
Backend tests for GKKS Vivah Step 6 — Browse Profiles
Tests: GET /api/profiles/browse with gender, city, age filters
Expected seed data: 8 profiles (4M, 4F):
  Raj Patel(M,Surat,27), Kavya Joshi(F,Surat,24), Priya Shah(F,Ahmedabad,26),
  Meera Desai(F,Vadodara,26), Nisha Patel(F,Rajkot,26), Arjun Mehta(M,Mumbai,28),
  Dev Shah(M,Vadodara,29), Rohan Trivedi(M,Ahmedabad,30)
"""
import pytest
import requests
import os
import re
import time
import subprocess

BASE_URL = os.environ.get('EXPO_BACKEND_URL', 'https://vivah-staging.preview.emergentagent.com').rstrip('/')

TEST_PHONE = "+919876543210"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get auth token via OTP flow."""
    phone = TEST_PHONE

    # Send OTP
    send_resp = api_client.post(f"{BASE_URL}/api/auth/send-otp", json={
        "phone": phone,
        "turnstile_token": "WEB_BYPASS"
    })

    if send_resp.status_code == 429:
        print(f"[INFO] Rate limited for {phone}, checking log for existing OTP...")
    elif send_resp.status_code == 200:
        print(f"[INFO] OTP sent to {phone}")
        time.sleep(0.5)
    else:
        pytest.skip(f"Cannot send OTP: {send_resp.status_code} {send_resp.text}")

    # Get OTP from backend log
    try:
        result = subprocess.run(
            ["grep", f"OTP for {phone}", "/var/log/supervisor/backend.err.log"],
            capture_output=True, text=True, timeout=5
        )
        lines = result.stdout.strip().split('\n')
        otp_val = None
        for line in reversed(lines):
            if phone in line:
                match = re.search(r': (\d{6})$', line)
                if match:
                    otp_val = match.group(1)
                    break
        if not otp_val:
            pytest.skip("OTP not found in log")
    except Exception as e:
        pytest.skip(f"Could not read log: {e}")

    # Verify OTP
    verify_resp = api_client.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "phone": phone,
        "otp": otp_val
    })
    if verify_resp.status_code != 200:
        pytest.skip(f"OTP verify failed: {verify_resp.text}")

    data = verify_resp.json()
    token = data["access_token"]
    print(f"[INFO] Auth token obtained for browse tests. user_id={data['user_id'][:8]}...")
    return token


# ─── Auth checks ────────────────────────────────────────────────

class TestBrowseAuth:
    """Browse endpoint authentication tests"""

    def test_browse_requires_auth(self, api_client):
        """Unauthenticated request returns 401"""
        resp = api_client.get(f"{BASE_URL}/api/profiles/browse")
        assert resp.status_code == 401
        assert "Authentication required" in resp.json().get("detail", "")
        print("✓ Browse without token returns 401")

    def test_browse_invalid_token(self, api_client):
        """Invalid token returns 401"""
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse",
            headers={"Authorization": "Bearer invalid.token.here"}
        )
        assert resp.status_code == 401
        print("✓ Browse with invalid token returns 401")


# ─── Basic browse ────────────────────────────────────────────────

class TestBrowseAll:
    """Browse all profiles — no filters"""

    def test_browse_returns_8_profiles(self, api_client, auth_token):
        """GET /api/profiles/browse (no filters) returns all 8 seeded profiles"""
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "profiles" in data
        profiles = data["profiles"]
        assert len(profiles) == 8, f"Expected 8 profiles, got {len(profiles)}: {[p['full_name'] for p in profiles]}"
        print(f"✓ All 8 profiles returned: {[p['full_name'] for p in profiles]}")

    def test_browse_response_structure(self, api_client, auth_token):
        """Each profile has required fields: id, full_name, age, city, gender"""
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200
        profiles = resp.json()["profiles"]
        for p in profiles:
            assert "id" in p, f"Missing 'id' in {p}"
            assert "full_name" in p, f"Missing 'full_name' in {p}"
            assert "age" in p, f"Missing 'age' in {p}"
            assert "city" in p, f"Missing 'city' in {p}"
            assert "gender" in p, f"Missing 'gender' in {p}"
        print(f"✓ All profiles have required fields (id, full_name, age, city, gender)")

    def test_browse_age_is_calculated(self, api_client, auth_token):
        """Age field should be an integer (calculated from dob)"""
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200
        profiles = resp.json()["profiles"]
        for p in profiles:
            if p.get("age") is not None:
                assert isinstance(p["age"], int), f"Age should be int, got {type(p['age'])} for {p['full_name']}"
                assert 18 <= p["age"] <= 60, f"Age {p['age']} out of range for {p['full_name']}"
        print(f"✓ Ages calculated correctly: {[(p['full_name'], p['age']) for p in profiles]}")

    def test_browse_response_has_page_field(self, api_client, auth_token):
        """Response should have 'page' and 'total' fields"""
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "page" in data
        assert "total" in data
        print(f"✓ Response has page={data['page']}, total={data['total']}")


# ─── Gender filter ────────────────────────────────────────────────

class TestBrowseGenderFilter:
    """Gender filter tests"""

    def test_browse_female_returns_4(self, api_client, auth_token):
        """gender=Female returns exactly 4 profiles"""
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?gender=Female&limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200
        profiles = resp.json()["profiles"]
        assert len(profiles) == 4, f"Expected 4 female profiles, got {len(profiles)}: {[p['full_name'] for p in profiles]}"
        for p in profiles:
            assert p["gender"] == "Female", f"Non-female profile in result: {p}"
        print(f"✓ 4 female profiles: {[p['full_name'] for p in profiles]}")

    def test_browse_male_returns_4(self, api_client, auth_token):
        """gender=Male returns exactly 4 profiles"""
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?gender=Male&limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200
        profiles = resp.json()["profiles"]
        assert len(profiles) == 4, f"Expected 4 male profiles, got {len(profiles)}: {[p['full_name'] for p in profiles]}"
        for p in profiles:
            assert p["gender"] == "Male", f"Non-male profile in result: {p}"
        print(f"✓ 4 male profiles: {[p['full_name'] for p in profiles]}")

    def test_browse_male_plus_female_equals_all(self, api_client, auth_token):
        """Male count + Female count should equal total count"""
        all_resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        male_resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?gender=Male&limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        female_resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?gender=Female&limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        total = len(all_resp.json()["profiles"])
        males = len(male_resp.json()["profiles"])
        females = len(female_resp.json()["profiles"])
        assert males + females == total, f"Male({males}) + Female({females}) != Total({total})"
        print(f"✓ Male({males}) + Female({females}) = Total({total})")

    def test_browse_female_names(self, api_client, auth_token):
        """Female profiles should include Kavya, Meera, Nisha, Priya"""
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?gender=Female&limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        profiles = resp.json()["profiles"]
        names = [p["full_name"] for p in profiles]
        expected = ["Kavya Joshi", "Meera Desai", "Nisha Patel", "Priya Shah"]
        for expected_name in expected:
            assert any(expected_name in n for n in names), f"{expected_name} not in female results: {names}"
        print(f"✓ Female names match: {names}")

    def test_browse_male_names(self, api_client, auth_token):
        """Male profiles should include Arjun, Dev, Raj, Rohan"""
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?gender=Male&limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        profiles = resp.json()["profiles"]
        names = [p["full_name"] for p in profiles]
        expected = ["Arjun Mehta", "Dev Shah", "Raj Patel", "Rohan Trivedi"]
        for expected_name in expected:
            assert any(expected_name in n for n in names), f"{expected_name} not in male results: {names}"
        print(f"✓ Male names match: {names}")


# ─── City filter ──────────────────────────────────────────────────

class TestBrowseCityFilter:
    """City filter tests"""

    def test_browse_city_surat_returns_2(self, api_client, auth_token):
        """city=Surat returns 2 profiles: Raj Patel, Kavya Joshi"""
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?city=Surat&limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200
        profiles = resp.json()["profiles"]
        assert len(profiles) == 2, f"Expected 2 Surat profiles, got {len(profiles)}: {[p['full_name'] for p in profiles]}"
        names = [p["full_name"] for p in profiles]
        assert "Raj Patel" in names, f"Raj Patel not in Surat results: {names}"
        assert "Kavya Joshi" in names, f"Kavya Joshi not in Surat results: {names}"
        print(f"✓ 2 Surat profiles: {names}")

    def test_browse_city_bangalore_returns_0(self, api_client, auth_token):
        """city=Bangalore returns empty list"""
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?city=Bangalore&limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200
        profiles = resp.json()["profiles"]
        assert len(profiles) == 0, f"Expected 0 Bangalore profiles, got {len(profiles)}"
        print("✓ Bangalore returns 0 profiles (empty result)")

    def test_browse_city_ahmedabad_returns_2(self, api_client, auth_token):
        """city=Ahmedabad returns 2 profiles: Priya Shah, Rohan Trivedi"""
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?city=Ahmedabad&limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200
        profiles = resp.json()["profiles"]
        assert len(profiles) == 2, f"Expected 2 Ahmedabad profiles, got {len(profiles)}: {[p['full_name'] for p in profiles]}"
        names = [p["full_name"] for p in profiles]
        print(f"✓ 2 Ahmedabad profiles: {names}")

    def test_browse_city_case_insensitive(self, api_client, auth_token):
        """City filter should be case-insensitive (ilike)"""
        resp_lower = api_client.get(
            f"{BASE_URL}/api/profiles/browse?city=surat&limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        resp_upper = api_client.get(
            f"{BASE_URL}/api/profiles/browse?city=SURAT&limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp_lower.status_code == 200
        assert resp_upper.status_code == 200
        lower_count = len(resp_lower.json()["profiles"])
        upper_count = len(resp_upper.json()["profiles"])
        assert lower_count == upper_count, f"Case sensitivity mismatch: lower={lower_count}, upper={upper_count}"
        print(f"✓ City filter is case-insensitive: 'surat'={lower_count}, 'SURAT'={upper_count}")


# ─── Age filter ───────────────────────────────────────────────────

class TestBrowseAgeFilter:
    """Age range filter tests"""

    def test_browse_age_25_28_returns_5(self, api_client, auth_token):
        """age_min=25&age_max=28 returns 5 profiles"""
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?age_min=25&age_max=28&limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200
        profiles = resp.json()["profiles"]
        assert len(profiles) == 5, f"Expected 5 profiles age 25-28, got {len(profiles)}: {[(p['full_name'], p.get('age')) for p in profiles]}"
        for p in profiles:
            assert p.get("age") is not None, f"Age is None for {p['full_name']}"
            assert 25 <= p["age"] <= 28, f"{p['full_name']} age {p['age']} not in 25-28"
        print(f"✓ 5 profiles age 25-28: {[(p['full_name'], p.get('age')) for p in profiles]}")

    def test_browse_age_min_only(self, api_client, auth_token):
        """age_min=29 returns profiles aged 29 or older"""
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?age_min=29&limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200
        profiles = resp.json()["profiles"]
        for p in profiles:
            if p.get("age") is not None:
                assert p["age"] >= 29, f"{p['full_name']} age {p['age']} < 29"
        print(f"✓ age_min=29 returns {len(profiles)} profiles: {[(p['full_name'], p.get('age')) for p in profiles]}")

    def test_browse_age_max_only(self, api_client, auth_token):
        """age_max=25 returns profiles aged 25 or younger"""
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?age_max=25&limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200
        profiles = resp.json()["profiles"]
        for p in profiles:
            if p.get("age") is not None:
                assert p["age"] <= 25, f"{p['full_name']} age {p['age']} > 25"
        print(f"✓ age_max=25 returns {len(profiles)} profiles: {[(p['full_name'], p.get('age')) for p in profiles]}")


# ─── Combination filters ─────────────────────────────────────────

class TestBrowseCombinedFilters:
    """Combined filter tests"""

    def test_browse_female_surat_returns_kavya(self, api_client, auth_token):
        """gender=Female + city=Surat returns 1 profile: Kavya Joshi"""
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?gender=Female&city=Surat&limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200
        profiles = resp.json()["profiles"]
        assert len(profiles) == 1, f"Expected 1 profile (Female+Surat), got {len(profiles)}: {[p['full_name'] for p in profiles]}"
        assert profiles[0]["full_name"] == "Kavya Joshi", f"Expected Kavya Joshi, got {profiles[0]['full_name']}"
        assert profiles[0]["gender"] == "Female"
        assert "Surat" in profiles[0]["city"]
        print(f"✓ Female+Surat returns Kavya Joshi")

    def test_browse_male_ahmedabad(self, api_client, auth_token):
        """gender=Male + city=Ahmedabad returns 1 profile: Rohan Trivedi"""
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?gender=Male&city=Ahmedabad&limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200
        profiles = resp.json()["profiles"]
        assert len(profiles) == 1, f"Expected 1 profile (Male+Ahmedabad), got {len(profiles)}"
        assert profiles[0]["full_name"] == "Rohan Trivedi"
        print(f"✓ Male+Ahmedabad returns Rohan Trivedi")

    def test_browse_female_age_25_28(self, api_client, auth_token):
        """gender=Female + age 25-28 should return 3 profiles (Priya, Meera, Nisha, all 26)"""
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/browse?gender=Female&age_min=25&age_max=28&limit=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200
        profiles = resp.json()["profiles"]
        # Expected: Priya Shah (26), Meera Desai (26), Nisha Patel (26) = 3 females in 25-28
        assert len(profiles) == 3, f"Expected 3 female profiles age 25-28, got {len(profiles)}: {[(p['full_name'], p.get('age')) for p in profiles]}"
        for p in profiles:
            assert p["gender"] == "Female"
            assert 25 <= p["age"] <= 28
        print(f"✓ Female + age 25-28 returns 3 profiles: {[p['full_name'] for p in profiles]}")
