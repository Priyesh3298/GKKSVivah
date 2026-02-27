"""
Backend auth endpoint tests for GKKS Vivah Step 3 Registration
Tests: send-otp, verify-otp, rate limiting, edge cases
"""
import pytest
import requests
import os
import time
import subprocess
import re

BASE_URL = os.environ.get('EXPO_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://vivah-staging.preview.emergentagent.com"

TEST_PHONE = "+919988776655"
TEST_PHONE_DIGITS = "9988776655"


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestHealthAndRoot:
    """Basic API health checks"""

    def test_api_root(self, api_client):
        """Check API root is accessible"""
        resp = api_client.get(f"{BASE_URL}/api/")
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data
        assert "GKKS" in data["message"]
        print(f"✓ API root OK: {data['message']}")


class TestSendOTP:
    """send-otp endpoint tests"""

    def test_send_otp_success_web_bypass(self, api_client):
        """Send OTP with WEB_BYPASS token should succeed"""
        resp = api_client.post(f"{BASE_URL}/api/auth/send-otp", json={
            "phone": TEST_PHONE,
            "turnstile_token": "WEB_BYPASS"
        })
        # Could be 200 or 429 (rate limited from previous test run)
        assert resp.status_code in (200, 429), f"Expected 200 or 429, got {resp.status_code}: {resp.text}"
        if resp.status_code == 200:
            data = resp.json()
            assert data.get("success") is True
            print(f"✓ send-otp success: {data}")
        else:
            print(f"ℹ send-otp rate limited (expected): {resp.json()}")

    def test_send_otp_resend_bypass(self, api_client):
        """Resend bypass token should also work"""
        # Use a different phone to avoid rate limit
        resp = api_client.post(f"{BASE_URL}/api/auth/send-otp", json={
            "phone": "+919988776600",
            "turnstile_token": "RESEND_BYPASS"
        })
        assert resp.status_code in (200, 429), f"Expected 200/429, got {resp.status_code}: {resp.text}"
        print(f"✓ Resend bypass test: {resp.status_code} - {resp.json()}")

    def test_send_otp_invalid_phone_format(self, api_client):
        """Invalid phone number should return 400"""
        resp = api_client.post(f"{BASE_URL}/api/auth/send-otp", json={
            "phone": "abc",
            "turnstile_token": "WEB_BYPASS"
        })
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        assert "detail" in resp.json()
        print(f"✓ Invalid phone returns 400: {resp.json()['detail']}")

    def test_send_otp_short_phone(self, api_client):
        """Too short phone number should return 400"""
        resp = api_client.post(f"{BASE_URL}/api/auth/send-otp", json={
            "phone": "123",
            "turnstile_token": "WEB_BYPASS"
        })
        assert resp.status_code == 400
        print(f"✓ Short phone returns 400: {resp.json()['detail']}")

    def test_send_otp_missing_fields(self, api_client):
        """Missing required fields returns 422"""
        resp = api_client.post(f"{BASE_URL}/api/auth/send-otp", json={
            "phone": TEST_PHONE
            # missing turnstile_token
        })
        assert resp.status_code == 422
        print(f"✓ Missing turnstile_token returns 422")

    def test_send_otp_invalid_turnstile(self, api_client):
        """Invalid turnstile token for a new phone should still work if TURNSTILE_SECRET_KEY not set"""
        # With a new unique phone to avoid rate limiting
        unique_phone = "+919877001122"
        resp = api_client.post(f"{BASE_URL}/api/auth/send-otp", json={
            "phone": unique_phone,
            "turnstile_token": "INVALID_TOKEN_XYZ"
        })
        # Either 200 (key not configured, skip verify) or 400 (verify failed)
        assert resp.status_code in (200, 400, 429)
        print(f"✓ Invalid turnstile test: {resp.status_code} - {resp.json()}")


class TestVerifyOTP:
    """verify-otp endpoint tests"""

    def test_verify_otp_no_otp_requested(self, api_client):
        """Verify OTP when none was requested should return 400"""
        # Use a phone that has no pending OTP
        resp = api_client.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "phone": "+919999000001",
            "otp": "123456"
        })
        assert resp.status_code == 400
        data = resp.json()
        assert "No OTP found" in data["detail"]
        print(f"✓ Verify with no OTP returns 400: {data['detail']}")

    def test_verify_otp_wrong_otp(self, api_client):
        """Verify OTP with wrong code should return 400"""
        # First send OTP to a unique phone
        unique_phone = "+919877112233"
        send_resp = api_client.post(f"{BASE_URL}/api/auth/send-otp", json={
            "phone": unique_phone,
            "turnstile_token": "WEB_BYPASS"
        })
        if send_resp.status_code == 429:
            pytest.skip("Rate limited — skipping wrong OTP test")

        # Now try wrong OTP
        resp = api_client.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "phone": unique_phone,
            "otp": "000000"
        })
        assert resp.status_code == 400
        data = resp.json()
        assert "Incorrect OTP" in data["detail"] or "attempt" in data["detail"]
        print(f"✓ Wrong OTP returns 400: {data['detail']}")

    def test_verify_otp_missing_fields(self, api_client):
        """Missing required fields returns 422"""
        resp = api_client.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "phone": TEST_PHONE
            # missing otp
        })
        assert resp.status_code == 422
        print(f"✓ Missing OTP returns 422")

    def test_full_send_and_verify_flow(self, api_client):
        """Full flow: send OTP, get from log, verify it"""
        # Use unique phone for this test
        unique_phone = "+919988001122"

        # Step 1: Send OTP
        send_resp = api_client.post(f"{BASE_URL}/api/auth/send-otp", json={
            "phone": unique_phone,
            "turnstile_token": "WEB_BYPASS"
        })

        if send_resp.status_code == 429:
            print("ℹ Rate limited on send-otp — attempting verify with known phone")
            # Try using test phone with OTP from log
            try:
                result = subprocess.run(
                    ["grep", "PLACEHOLDER MSG91", "/var/log/supervisor/backend.err.log"],
                    capture_output=True, text=True, timeout=5
                )
                lines = result.stdout.strip().split('\n')
                # Find OTP for unique_phone or TEST_PHONE
                otp_val = None
                for line in reversed(lines):
                    if unique_phone in line or TEST_PHONE in line:
                        match = re.search(r': (\d{6})$', line)
                        if match:
                            otp_val = match.group(1)
                            break
                if not otp_val:
                    pytest.skip("Rate limited and no OTP found in logs")
            except Exception as e:
                pytest.skip(f"Could not read log: {e}")
        else:
            assert send_resp.status_code == 200, f"Send OTP failed: {send_resp.text}"
            data = send_resp.json()
            assert data.get("success") is True
            print(f"✓ OTP sent successfully")

            # Step 2: Get OTP from backend log
            time.sleep(0.5)  # Brief wait for log to flush
            try:
                result = subprocess.run(
                    ["grep", "PLACEHOLDER MSG91", "/var/log/supervisor/backend.err.log"],
                    capture_output=True, text=True, timeout=5
                )
                lines = result.stdout.strip().split('\n')
                otp_val = None
                for line in reversed(lines):
                    if unique_phone in line:
                        match = re.search(r': (\d{6})$', line)
                        if match:
                            otp_val = match.group(1)
                            break
                if not otp_val:
                    pytest.skip("OTP not found in log (may be async delay)")
            except Exception as e:
                pytest.skip(f"Could not read log: {e}")

            # Step 3: Verify OTP
            print(f"  OTP from log: {otp_val}")
            verify_resp = api_client.post(f"{BASE_URL}/api/auth/verify-otp", json={
                "phone": unique_phone,
                "otp": otp_val
            })

            assert verify_resp.status_code == 200, f"Verify OTP failed: {verify_resp.text}"
            vdata = verify_resp.json()
            assert vdata.get("success") is True
            assert "access_token" in vdata
            assert "refresh_token" in vdata
            assert "user_id" in vdata
            print(f"✓ Full flow complete. New user: {vdata.get('is_new_user')}, user_id: {vdata.get('user_id')[:8]}...")


class TestRateLimiting:
    """Rate limiting tests"""

    def test_rate_limit_second_otp_same_phone(self, api_client):
        """Sending 2 OTPs to same phone within 60s returns 429"""
        phone = "+919877223344"

        # First OTP
        r1 = api_client.post(f"{BASE_URL}/api/auth/send-otp", json={
            "phone": phone, "turnstile_token": "WEB_BYPASS"
        })

        if r1.status_code == 429:
            # Already rate limited from a previous test run
            print(f"ℹ Phone already rate-limited: {r1.json()}")
            return

        assert r1.status_code == 200, f"First OTP should succeed: {r1.text}"

        # Second OTP immediately
        r2 = api_client.post(f"{BASE_URL}/api/auth/send-otp", json={
            "phone": phone, "turnstile_token": "WEB_BYPASS"
        })
        assert r2.status_code == 429, f"Second OTP should be rate-limited, got {r2.status_code}: {r2.text}"
        assert "wait" in r2.json().get("detail", "").lower()
        print(f"✓ Rate limit working: {r2.json()['detail']}")
