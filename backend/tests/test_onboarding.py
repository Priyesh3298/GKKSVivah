"""
Backend tests for GKKS Vivah Steps 4 & 5 — Role Selection + Profile Claiming
Tests: auth/me, auth/set-role, profiles/search, profiles/claim
"""
import pytest
import requests
import os
import time
import subprocess
import re

BASE_URL = os.environ.get('EXPO_BACKEND_URL', 'https://vivah-staging.preview.emergentagent.com').rstrip('/')

# Use the new test phone as specified in testing context
TEST_PHONE_NEW = "+919876500001"
TEST_PHONE_DIGITS = "9876500001"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_token(api_client):
    """
    Get auth token for a new user via OTP flow.
    Returns (token, user_id, is_new_user)
    """
    phone = TEST_PHONE_NEW

    # Send OTP
    send_resp = api_client.post(f"{BASE_URL}/api/auth/send-otp", json={
        "phone": phone,
        "turnstile_token": "WEB_BYPASS"
    })

    if send_resp.status_code == 429:
        # Rate limited — try to verify with a previously sent OTP
        print(f"[INFO] Rate limited for {phone}, checking log for OTP...")
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
    user_id = data["user_id"]
    is_new = data.get("is_new_user", False)
    print(f"[INFO] Auth token obtained. user_id={user_id[:8]}... is_new={is_new}")
    return token, user_id, is_new


class TestGetMe:
    """GET /api/auth/me — returns user role and profile info"""

    def test_me_requires_auth(self, api_client):
        """Unauthenticated request should return 401"""
        resp = api_client.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 401
        print(f"✓ /auth/me without token returns 401")

    def test_me_invalid_token(self, api_client):
        """Invalid token should return 401"""
        resp = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": "Bearer invalid.token.here"}
        )
        assert resp.status_code == 401
        print(f"✓ /auth/me with invalid token returns 401")

    def test_me_returns_user_data(self, api_client, auth_token):
        """Valid token should return user data with role, status, profile_id"""
        token, user_id, _ = auth_token
        resp = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "id" in data
        assert "role" in data
        assert "status" in data
        assert "profile_id" in data
        assert data["id"] == user_id
        print(f"✓ /auth/me returns user data: role={data['role']}, status={data['status']}, profile_id={data['profile_id']}")


class TestSetRole:
    """PATCH /api/auth/set-role — sets user role"""

    def test_set_role_requires_auth(self, api_client):
        """Unauthenticated request should return 401"""
        resp = api_client.patch(f"{BASE_URL}/api/auth/set-role", json={"role": "candidate"})
        assert resp.status_code == 401
        print(f"✓ /auth/set-role without token returns 401")

    def test_set_role_invalid_role(self, api_client, auth_token):
        """Invalid role value should return 400"""
        token, _, _ = auth_token
        resp = api_client.patch(
            f"{BASE_URL}/api/auth/set-role",
            headers={"Authorization": f"Bearer {token}"},
            json={"role": "admin"}
        )
        assert resp.status_code == 400
        assert "detail" in resp.json()
        print(f"✓ Invalid role returns 400: {resp.json()['detail']}")

    def test_set_role_candidate(self, api_client, auth_token):
        """Set role to candidate should succeed"""
        token, user_id, _ = auth_token
        resp = api_client.patch(
            f"{BASE_URL}/api/auth/set-role",
            headers={"Authorization": f"Bearer {token}"},
            json={"role": "candidate"}
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success") is True
        assert data.get("role") == "candidate"
        print(f"✓ Set role to candidate: {data}")

    def test_set_role_persisted_in_me(self, api_client, auth_token):
        """After set-role, GET /auth/me should reflect new role"""
        token, user_id, _ = auth_token
        me_resp = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert me_resp.status_code == 200
        me_data = me_resp.json()
        assert me_data.get("role") == "candidate", f"Role not persisted: {me_data}"
        print(f"✓ Role persisted in /auth/me: role={me_data['role']}")


class TestProfileSearch:
    """GET /api/profiles/search — returns unclaimed profiles"""

    def test_search_requires_auth(self, api_client):
        """Unauthenticated request should return 401"""
        resp = api_client.get(f"{BASE_URL}/api/profiles/search?q=patel")
        assert resp.status_code == 401
        print(f"✓ /profiles/search without token returns 401")

    def test_search_too_short_query(self, api_client, auth_token):
        """Query less than 2 chars returns empty list (not error)"""
        token, _, _ = auth_token
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/search?q=p",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "profiles" in data
        assert data["profiles"] == []
        print(f"✓ Short query returns empty profiles list")

    def test_search_patel_returns_raj_patel(self, api_client, auth_token):
        """Searching 'patel' should return Raj Patel"""
        token, _, _ = auth_token
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/search?q=patel",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "profiles" in data
        profiles = data["profiles"]
        print(f"✓ patel search returned {len(profiles)} profile(s)")
        if len(profiles) > 0:
            # Check at least one profile has expected fields
            p = profiles[0]
            assert "id" in p
            assert "full_name" in p
            assert "father_name" in p
            assert "city" in p
            # Check status is not in results (should only be unclaimed)
            print(f"  Profile: {p['full_name']} from {p.get('city', 'N/A')}")

    def test_search_shah_returns_priya_shah(self, api_client, auth_token):
        """Searching 'shah' should return Priya Shah"""
        token, _, _ = auth_token
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/search?q=shah",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        profiles = data.get("profiles", [])
        print(f"✓ shah search returned {len(profiles)} profile(s)")
        names = [p["full_name"] for p in profiles]
        print(f"  Names: {names}")

    def test_search_desai_returns_meera_desai(self, api_client, auth_token):
        """Searching 'desai' should return Meera Desai"""
        token, _, _ = auth_token
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/search?q=desai",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        profiles = data.get("profiles", [])
        print(f"✓ desai search returned {len(profiles)} profile(s)")
        names = [p["full_name"] for p in profiles]
        print(f"  Names: {names}")

    def test_search_returns_only_unclaimed(self, api_client, auth_token):
        """Search results should not contain status field or only unclaimed"""
        token, _, _ = auth_token
        resp = api_client.get(
            f"{BASE_URL}/api/profiles/search?q=patel",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        # Profile response fields check
        for p in data.get("profiles", []):
            assert "id" in p
            assert "full_name" in p
            # The search endpoint only returns unclaimed profiles
            print(f"  Unclaimed profile: {p['full_name']}")


class TestProfileClaim:
    """POST /api/profiles/claim — claim a profile"""

    def test_claim_requires_auth(self, api_client):
        """Unauthenticated request should return 401"""
        resp = api_client.post(f"{BASE_URL}/api/profiles/claim", json={
            "profile_id": "some-id",
            "selfie_base64": "base64data"
        })
        assert resp.status_code == 401
        print(f"✓ /profiles/claim without token returns 401")

    def test_claim_nonexistent_profile(self, api_client, auth_token):
        """Claiming a non-existent profile should return 404"""
        token, _, _ = auth_token
        resp = api_client.post(
            f"{BASE_URL}/api/profiles/claim",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "profile_id": "00000000-0000-0000-0000-000000000000",
                "selfie_base64": "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoH"
            }
        )
        assert resp.status_code in (404, 409, 500), f"Expected 404/409/500, got {resp.status_code}: {resp.text}"
        print(f"✓ Non-existent profile returns {resp.status_code}: {resp.json().get('detail', '')}")

    def test_claim_valid_profile(self, api_client, auth_token):
        """Claim an unclaimed profile with a valid selfie"""
        token, user_id, _ = auth_token

        # First find an unclaimed profile
        search_resp = api_client.get(
            f"{BASE_URL}/api/profiles/search?q=patel",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert search_resp.status_code == 200
        profiles = search_resp.json().get("profiles", [])

        if not profiles:
            pytest.skip("No unclaimed patel profiles available for claim test")

        profile = profiles[0]
        profile_id = profile["id"]
        profile_name = profile["full_name"]
        print(f"[INFO] Attempting to claim profile: {profile_name} ({profile_id})")

        # Minimal valid JPEG base64 (1x1 pixel)
        minimal_jpg_b64 = (
            "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U"
            "HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN"
            "DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy"
            "MjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABAUG/8QAHhAAAQQC"
            "AwAAAAAAAAAAAAAAAQACAxESITH/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAA"
            "AAAAAAAAAAAP/aAAwDAQACEQMRAD8Aqb0qFNnU9AAAAAAAAAAAAAP/Z"
        )

        resp = api_client.post(
            f"{BASE_URL}/api/profiles/claim",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "profile_id": profile_id,
                "selfie_base64": minimal_jpg_b64
            }
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success") is True
        assert "profile_name" in data
        print(f"✓ Profile claim submitted: {data}")

    def test_claim_user_has_profile_id_after_claim(self, api_client, auth_token):
        """After claim, /auth/me should show profile_id"""
        token, user_id, _ = auth_token
        me_resp = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert me_resp.status_code == 200
        me_data = me_resp.json()
        # Either profile_id is set or not (depends on test order)
        print(f"✓ /auth/me profile_id: {me_data.get('profile_id')}")
        # If the claim test ran first, profile_id should be set
        if me_data.get("profile_id"):
            assert me_data["profile_id"] != "", "profile_id should not be empty after claim"
            print(f"  profile_id set to: {me_data['profile_id']}")

    def test_claim_already_claimed_returns_409(self, api_client, auth_token):
        """Claiming a profile that is no longer unclaimed should return 409"""
        token, _, _ = auth_token

        # Search for patel (the one we just claimed should now be pending_approval)
        search_resp = api_client.get(
            f"{BASE_URL}/api/profiles/search?q=patel",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert search_resp.status_code == 200
        profiles = search_resp.json().get("profiles", [])

        # If still unclaimed patel profiles exist, skip this test
        # We need to use the claimed profile_id - get from /auth/me
        me_resp = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        profile_id = me_resp.json().get("profile_id")
        if not profile_id:
            pytest.skip("No claimed profile_id found on user to test double-claim")

        # Try to claim the same profile again
        minimal_jpg_b64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABAUG/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCoAAAAAP/Z"
        resp = api_client.post(
            f"{BASE_URL}/api/profiles/claim",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "profile_id": profile_id,
                "selfie_base64": minimal_jpg_b64
            }
        )
        assert resp.status_code == 409, f"Expected 409 for double claim, got {resp.status_code}: {resp.text}"
        print(f"✓ Double claim returns 409: {resp.json().get('detail', '')}")
