"""Tests for GKKS Vivah CSV import admin endpoints"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
ADMIN_SECRET = 'gkks-admin-2026'

SAMPLE_CSV = b"""Full Name,Date of Birth,Father's Name,Caste,sub_caste,video_url,City
Rajesh Patel,15/03/1998,Mahesh Patel,Kadva Patel,Kanbi,http://video.url,Ahmedabad
Priya Shah,20/07/1995,Dinesh Shah,Leuva Patel,,, Mumbai
"""

SAMPLE_CSV_MISSING_DOB = b"""Full Name,Father's Name,City
Rajesh Patel,Mahesh Patel,Ahmedabad
"""


@pytest.fixture
def session():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    return s


# ─── Health check ─────────────────────────────────────────────
class TestHealth:
    def test_root_returns_gkks_vivah(self, session):
        r = session.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        data = r.json()
        assert 'GKKS Vivah API v1' in data.get('message', '')


# ─── Auth tests ───────────────────────────────────────────────
class TestAdminAuth:
    def test_csv_preview_no_header_returns_403(self, session):
        files = {'file': ('test.csv', io.BytesIO(SAMPLE_CSV), 'text/csv')}
        r = requests.post(f"{BASE_URL}/api/admin/csv-preview", files=files)
        assert r.status_code == 403

    def test_csv_preview_wrong_secret_returns_403(self, session):
        files = {'file': ('test.csv', io.BytesIO(SAMPLE_CSV), 'text/csv')}
        r = requests.post(f"{BASE_URL}/api/admin/csv-preview", files=files,
                          headers={'X-Admin-Secret': 'wrong-secret'})
        assert r.status_code == 403


# ─── CSV Preview tests ────────────────────────────────────────
class TestCSVPreview:
    def _preview(self, csv_bytes=None):
        csv_bytes = csv_bytes or SAMPLE_CSV
        files = {'file': ('test.csv', io.BytesIO(csv_bytes), 'text/csv')}
        r = requests.post(f"{BASE_URL}/api/admin/csv-preview", files=files,
                          headers={'X-Admin-Secret': ADMIN_SECRET})
        return r

    def test_csv_preview_success(self):
        r = self._preview()
        assert r.status_code == 200

    def test_csv_preview_returns_columns(self):
        r = self._preview()
        data = r.json()
        assert 'columns' in data
        assert 'Full Name' in data['columns']

    def test_csv_preview_returns_mapping(self):
        r = self._preview()
        data = r.json()
        assert 'mapping' in data

    def test_csv_preview_returns_preview_rows(self):
        r = self._preview()
        data = r.json()
        assert 'preview' in data
        assert len(data['preview']) > 0

    def test_csv_preview_returns_total_rows(self):
        r = self._preview()
        data = r.json()
        assert 'total_rows' in data
        assert data['total_rows'] == 2

    def test_csv_preview_returns_profile_fields(self):
        r = self._preview()
        data = r.json()
        assert 'profile_fields' in data
        assert len(data['profile_fields']) > 0

    def test_auto_detect_full_name(self):
        r = self._preview()
        mapping = r.json()['mapping']
        assert mapping.get('Full Name') == 'full_name'

    def test_auto_detect_dob(self):
        r = self._preview()
        mapping = r.json()['mapping']
        assert mapping.get("Date of Birth") == 'dob'

    def test_auto_detect_father_name(self):
        r = self._preview()
        mapping = r.json()['mapping']
        assert mapping.get("Father's Name") == 'father_name'

    def test_auto_detect_caste(self):
        r = self._preview()
        mapping = r.json()['mapping']
        assert mapping.get('Caste') == 'caste'

    def test_sub_caste_mapped_to_empty(self):
        r = self._preview()
        mapping = r.json()['mapping']
        assert mapping.get('sub_caste') == ''

    def test_video_url_mapped_to_empty(self):
        r = self._preview()
        mapping = r.json()['mapping']
        assert mapping.get('video_url') == ''


# ─── CSV Import dry-run tests ─────────────────────────────────
class TestCSVImportDryRun:
    import json as _json

    def _import(self, mapping_dict, dry_run='true', csv_bytes=None):
        import json
        csv_bytes = csv_bytes or SAMPLE_CSV
        files = {'file': ('test.csv', io.BytesIO(csv_bytes), 'text/csv')}
        data = {'mapping': json.dumps(mapping_dict), 'dry_run': dry_run}
        r = requests.post(f"{BASE_URL}/api/admin/csv-import", files=files,
                          headers={'X-Admin-Secret': ADMIN_SECRET}, data=data)
        return r

    def test_dry_run_returns_will_import(self):
        mapping = {"Full Name": "full_name", "Date of Birth": "dob",
                   "Father's Name": "father_name", "Caste": "caste",
                   "sub_caste": "", "video_url": "", "City": "city"}
        r = self._import(mapping, dry_run='true')
        assert r.status_code == 200
        data = r.json()
        assert 'will_import' in data
        assert data['will_import'] == 2

    def test_dry_run_does_not_insert(self):
        mapping = {"Full Name": "full_name", "Date of Birth": "dob",
                   "Father's Name": "father_name", "Caste": "caste",
                   "sub_caste": "", "video_url": "", "City": "city"}
        r = self._import(mapping, dry_run='true')
        assert r.json()['dry_run'] is True

    def test_dry_run_returns_duplicates_and_errors(self):
        mapping = {"Full Name": "full_name", "Date of Birth": "dob",
                   "Father's Name": "father_name", "Caste": "caste",
                   "sub_caste": "", "video_url": "", "City": "city"}
        r = self._import(mapping, dry_run='true')
        data = r.json()
        assert 'duplicates' in data
        assert 'errors' in data

    def test_missing_required_field_returns_400(self):
        # mapping without dob
        mapping = {"Full Name": "full_name", "Father's Name": "father_name"}
        r = self._import(mapping, dry_run='true',
                         csv_bytes=SAMPLE_CSV_MISSING_DOB)
        assert r.status_code == 400


# ─── Date and normalization tests ─────────────────────────────
class TestNormalization:
    """Test date parsing and value normalization via dry-run"""

    def _dry_run_with_csv(self, csv_content):
        import json
        files = {'file': ('test.csv', io.BytesIO(csv_content), 'text/csv')}
        mapping = {"Full Name": "full_name", "DOB": "dob",
                   "Father": "father_name", "Manglik": "manglik",
                   "Family Type": "family_type"}
        data = {'mapping': json.dumps(mapping), 'dry_run': 'true'}
        r = requests.post(f"{BASE_URL}/api/admin/csv-import", files=files,
                          headers={'X-Admin-Secret': ADMIN_SECRET}, data=data)
        return r

    def test_date_dd_mm_yyyy_parsed(self):
        csv = b"Full Name,DOB,Father,Manglik,Family Type\nTest User,15/03/1998,Test Father,Yes,Joint\n"
        r = self._dry_run_with_csv(csv)
        assert r.status_code == 200
        assert r.json()['will_import'] == 1

    def test_manglik_yes_normalized(self):
        """Test that manglik 'Yes' is properly normalized - verified via dry_run success"""
        csv = b"Full Name,DOB,Father,Manglik,Family Type\nTest User,15/03/1998,Test Father,Yes,Joint\n"
        r = self._dry_run_with_csv(csv)
        assert r.status_code == 200

    def test_manglik_partial_normalized(self):
        csv = b"Full Name,DOB,Father,Manglik,Family Type\nTest User,16/03/1998,Test Father,Partial,Nuclear\n"
        r = self._dry_run_with_csv(csv)
        assert r.status_code == 200
        assert r.json()['will_import'] == 1

    def test_family_type_joint(self):
        csv = b"Full Name,DOB,Father,Manglik,Family Type\nTest User,17/03/1998,Test Father,No,Joint\n"
        r = self._dry_run_with_csv(csv)
        assert r.status_code == 200

    def test_family_type_nuclear(self):
        csv = b"Full Name,DOB,Father,Manglik,Family Type\nTest User,18/03/1998,Test Father,No,Nuclear\n"
        r = self._dry_run_with_csv(csv)
        assert r.status_code == 200
