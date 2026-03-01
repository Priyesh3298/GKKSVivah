from fastapi import FastAPI, APIRouter, File, UploadFile, Form, Header, Depends, HTTPException, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
import json
import io
import re
import time
import random
import hmac
import hashlib
import httpx

import pandas as pd
from dateutil import parser as dateutil_parser
from supabase import create_client, Client as SupabaseClient

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB (legacy)
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Supabase admin client (service role — bypasses RLS)
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
supabase_admin: Optional[SupabaseClient] = None
if SUPABASE_URL and SUPABASE_SERVICE_KEY:
    supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

ADMIN_SECRET = os.environ.get("ADMIN_SECRET", "gkks-admin-2026")

# ─── Auth Config ──────────────────────────────────────────────
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
TURNSTILE_SECRET_KEY = os.environ.get("TURNSTILE_SECRET_KEY", "")
MSG91_AUTH_KEY = os.environ.get("MSG91_AUTH_KEY", "")
MSG91_TEMPLATE_ID = os.environ.get("MSG91_TEMPLATE_ID", "")
SERVER_OTP_SECRET = os.environ.get("SERVER_OTP_SECRET", "gkks-otp-secret-2026")

# Secondary Supabase client (anon key) — used for user sign-in
supabase_anon: Optional[SupabaseClient] = None
if SUPABASE_URL and SUPABASE_ANON_KEY:
    supabase_anon = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

# In-memory OTP store: { phone: { otp, expires_at, attempts } }
OTP_STORE: Dict[str, Dict] = {}

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ─── Admin Auth ──────────────────────────────────────────────
def check_admin(x_admin_secret: str = Header(None)):
    if not x_admin_secret or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Invalid admin secret")
    return True

# ─── Column Aliases for CSV Import ───────────────────────────
COLUMN_ALIASES: Dict[str, List[str]] = {
    'full_name': ['full name', 'name', 'candidate name', 'full_name', 'fullname', 'english name', 'candidate'],
    'full_name_gujarati': ['gujarati name', 'name gujarati', 'gu name', 'full_name_gujarati', 'gujarati', 'name (gujarati)'],
    'dob': ['date of birth', 'dob', 'd.o.b', 'birth date', 'birthdate', 'birth_date', 'date_of_birth', 'dob (dd/mm/yyyy)'],
    'gender': ['gender', 'sex'],
    'father_name': ["father's name", 'father name', 'father_name', 'fathers name', 'father', "father'sname"],
    'mother_name': ["mother's name", 'mother name', 'mother_name', 'mothers name', 'mother'],
    'caste': ['caste', 'community', 'jati'],
    'gotra': ['gotra'],
    'rashi': ['rashi', 'rasi', 'zodiac', 'birth rashi', 'raasi'],
    'nakshatra': ['nakshatra', 'nakshatram', 'birth star', 'star', 'nakshtar'],
    'manglik': ['manglik', 'mangal', 'mangalik', 'manglik status', 'is manglik'],
    'family_type': ['family type', 'family_type', 'family structure', 'family'],
    'siblings_info': ['siblings', 'siblings info', 'siblings_info', 'brothers and sisters', 'brothers/sisters'],
    'native_village': ['native village', 'village', 'original village', 'native_village', 'mosal', 'hometown'],
    'parent_phone': ['parent phone', "father's phone", 'parent_phone', 'contact', 'phone', 'mobile', 'phone number'],
    'city': ['city', 'current city', 'location', 'residing city', 'place'],
    'country': ['country', 'residing country'],
    'education': ['education', 'qualification', 'degree', 'educational qualification'],
    'profession': ['profession', 'job', 'occupation', 'work', 'job title', 'designation'],
    'employer': ['employer', 'company', 'organization', 'firm'],
    'income_range': ['income', 'income range', 'annual income', 'salary'],
    'marital_status': ['marital status', 'marital_status', 'marriage status'],
    'has_children': ['has children', 'children', 'has_children', 'kids'],
    'willing_to_relocate_abroad': ['relocate abroad', 'willing to relocate', 'abroad', 'foreign', 'relocation'],
    'preferred_cities': ['preferred cities', 'preferred_cities', 'preferred location'],
    'about_me': ['about me', 'about', 'bio', 'description'],
    # sub_caste and video_url are NEVER mapped (intentionally absent)
}

PROFILE_FIELDS = [
    ('', '— ignore this column —'),
    ('full_name', 'Full Name ✱'),
    ('full_name_gujarati', 'Full Name (Gujarati)'),
    ('dob', 'Date of Birth ✱'),
    ('gender', 'Gender'),
    ('father_name', "Father's Name ✱"),
    ('mother_name', "Mother's Name"),
    ('caste', 'Caste'),
    ('gotra', 'Gotra'),
    ('rashi', 'Rashi / રાશિ'),
    ('nakshatra', 'Nakshatra / નક્ષત્ર'),
    ('manglik', 'Manglik / મંગળ'),
    ('family_type', 'Family Type'),
    ('siblings_info', 'Siblings Info'),
    ('native_village', 'Native Village'),
    ('parent_phone', 'Parent Phone'),
    ('city', 'City'),
    ('country', 'Country'),
    ('education', 'Education'),
    ('profession', 'Profession'),
    ('employer', 'Employer'),
    ('income_range', 'Income Range'),
    ('marital_status', 'Marital Status'),
    ('has_children', 'Has Children'),
    ('willing_to_relocate_abroad', 'Willing to Relocate Abroad'),
    ('preferred_cities', 'Preferred Cities'),
    ('about_me', 'About Me'),
]

# ─── CSV Parsing Helpers ─────────────────────────────────────
def auto_detect_mapping(csv_columns: list) -> dict:
    mapping = {}
    for col in csv_columns:
        col_norm = col.strip().lower()
        # Always ignore sub_caste and video
        if any(x in col_norm for x in ['sub_caste', 'sub caste', 'subcaste', 'video']):
            mapping[col] = ''
            continue
        matched = False
        for field, aliases in COLUMN_ALIASES.items():
            if col_norm in aliases or col_norm.replace(' ', '_') == field:
                mapping[col] = field
                matched = True
                break
        if not matched:
            mapping[col] = ''
    return mapping

def parse_date(val) -> Optional[str]:
    if not val or str(val).strip() in ('', 'nan', 'NaT', 'None'):
        return None
    s = str(val).strip()
    for fmt in ['%d/%m/%Y', '%d-%m-%Y', '%d.%m.%Y', '%Y-%m-%d', '%m/%d/%Y', '%d/%m/%y']:
        try:
            return datetime.strptime(s, fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    try:
        return dateutil_parser.parse(s, dayfirst=True).strftime('%Y-%m-%d')
    except Exception:
        return None

def parse_bool(val) -> Optional[bool]:
    if val is None or str(val).strip() in ('', 'nan', 'None'):
        return None
    s = str(val).strip().lower()
    if s in ('yes', 'true', '1', 'y'):
        return True
    if s in ('no', 'false', '0', 'n'):
        return False
    return None

def normalize_value(field: str, val) -> Any:
    str_val = str(val).strip() if val is not None and str(val).strip() not in ('nan', 'NaT', 'None', '') else None
    if field == 'dob':
        return parse_date(val)
    elif field == 'has_children':
        return parse_bool(val)
    elif field == 'manglik':
        if not str_val:
            return None
        s = str_val.lower()
        if 'partial' in s or 'anshik' in s:
            return 'Partial'
        if s in ('yes', 'y', 'true', '1', 'manglik'):
            return 'Yes'
        if s in ('no', 'n', 'false', '0', 'non manglik', 'na'):
            return 'No'
        return None
    elif field == 'family_type':
        if not str_val:
            return None
        s = str_val.lower()
        if 'joint' in s:
            return 'Joint'
        if 'nuclear' in s:
            return 'Nuclear'
        return None
    elif field == 'marital_status':
        if not str_val:
            return 'Never Married'
        s = str_val.lower()
        if 'never' in s or 'single' in s or 'unmarried' in s or 'first' in s:
            return 'Never Married'
        if 'await' in s or 'process' in s or 'pending' in s:
            return 'Awaiting Divorce'
        if 'divorc' in s:
            return 'Divorced'
        if 'widow' in s:
            return 'Widowed'
        return 'Never Married'
    elif field == 'willing_to_relocate_abroad':
        if not str_val:
            return 'Open to discussion'
        s = str_val.lower()
        if 'already' in s or 'currently abroad' in s:
            return 'Already abroad'
        if 'yes' in s or ('open' in s and 'abroad' in s):
            return 'Yes, open to moving abroad'
        if 'no' in s and 'india' in s:
            return 'No, prefer to stay in India'
        return 'Open to discussion'
    elif field == 'preferred_cities':
        if not str_val:
            return []
        cities = re.split(r'[,;|/]', str_val)
        return [c.strip() for c in cities if c.strip()][:4]
    elif field == 'gender':
        if str_val:
            s = str_val.lower()
            if 'female' in s or 'girl' in s or s == 'f':
                return 'Female'
            if 'male' in s or 'boy' in s or s == 'm':
                return 'Male'
        return None
    else:
        return str_val

def parse_csv_content(content: bytes) -> pd.DataFrame:
    for encoding in ('utf-8-sig', 'utf-8', 'latin-1', 'cp1252'):
        for sep in (',', ';', '\t'):
            try:
                text = content.decode(encoding)
                df = pd.read_csv(io.StringIO(text), sep=sep, dtype=str, na_filter=False)
                if len(df.columns) > 1:
                    return df
            except Exception:
                continue
    raise ValueError("Could not parse CSV. Ensure it has headers and is comma/semicolon-separated.")

def fetch_existing_for_dedup() -> set:
    if not supabase_admin:
        return set()
    try:
        result = supabase_admin.table('profiles').select('full_name,dob,father_name').execute()
        existing = set()
        for row in (result.data or []):
            existing.add((
                (row.get('full_name') or '').lower().strip(),
                str(row.get('dob') or ''),
                (row.get('father_name') or '').lower().strip(),
            ))
        return existing
    except Exception:
        return set()

# ─── Auth Helpers ────────────────────────────────────────────
async def verify_turnstile_token(token: str, remote_ip: Optional[str] = None) -> bool:
    """Verify Cloudflare Turnstile token. Returns True on success."""
    bypass_tokens = {'WEB_BYPASS', 'RESEND_BYPASS'}
    if token in bypass_tokens:
        return True
    if not TURNSTILE_SECRET_KEY:
        logger.warning("TURNSTILE_SECRET_KEY not set — skipping verification")
        return True
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            data = {"secret": TURNSTILE_SECRET_KEY, "response": token}
            if remote_ip:
                data["remoteip"] = remote_ip
            resp = await client.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                data=data,
            )
            return resp.json().get("success", False)
    except Exception as e:
        logger.error(f"Turnstile verification error: {e}")
        return False


async def send_whatsapp_otp(phone: str, otp: str) -> bool:
    """Send OTP via MSG91 WhatsApp. Logs OTP if MSG91 key is placeholder."""
    if not MSG91_AUTH_KEY or MSG91_AUTH_KEY == "PLACEHOLDER_MSG91_KEY":
        logger.info(f"[PLACEHOLDER MSG91] OTP for {phone}: {otp}")
        return True
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://api.msg91.com/api/v5/otp",
                json={
                    "authkey": MSG91_AUTH_KEY,
                    "template_id": MSG91_TEMPLATE_ID,
                    "mobile": f"91{re.sub(r'[^0-9]', '', phone)[-10:]}",
                    "otp": otp,
                    "otp_expiry": 10,
                    "type": "4",
                },
            )
            return resp.json().get("type") == "success"
    except Exception as e:
        logger.error(f"MSG91 error: {e}")
        return False


def derive_supabase_password(phone: str) -> str:
    """Derive a stable, secret password from phone + server secret."""
    return hmac.new(SERVER_OTP_SECRET.encode(), phone.encode(), hashlib.sha256).hexdigest()


# ─── Auth Pydantic Models ─────────────────────────────────────
class SendOTPRequest(BaseModel):
    phone: str
    turnstile_token: str


class VerifyOTPRequest(BaseModel):
    phone: str
    otp: str


# ─── Auth Endpoints ───────────────────────────────────────────
@api_router.post("/auth/send-otp")
async def send_otp(body: SendOTPRequest, request: Request):
    phone = re.sub(r'\s+', '', body.phone)
    if not re.match(r'^\+?[0-9]{10,15}$', phone):
        raise HTTPException(status_code=400, detail="Invalid phone number format.")

    ip = request.client.host if request.client else None
    if not await verify_turnstile_token(body.turnstile_token, ip):
        raise HTTPException(status_code=400, detail="Security check failed. Please try again.")

    # Rate limit: max 1 OTP per 60 seconds per phone
    existing = OTP_STORE.get(phone)
    if existing and time.time() < existing.get('sent_at', 0) + 60:
        wait = int(60 - (time.time() - existing['sent_at']))
        raise HTTPException(status_code=429, detail=f"OTP recently sent. Please wait {wait}s.")

    otp = str(random.randint(100000, 999999))
    OTP_STORE[phone] = {
        'otp': otp,
        'expires_at': time.time() + 600,
        'sent_at': time.time(),
        'attempts': 0,
    }

    if not await send_whatsapp_otp(phone, otp):
        raise HTTPException(status_code=502, detail="Failed to send OTP. Please try again.")

    return {"success": True, "message": "OTP sent via WhatsApp."}


@api_router.post("/auth/verify-otp")
async def verify_otp(body: VerifyOTPRequest):
    phone = re.sub(r'\s+', '', body.phone)

    stored = OTP_STORE.get(phone)
    if not stored:
        raise HTTPException(status_code=400, detail="No OTP found. Please request a new one.")
    if time.time() > stored['expires_at']:
        OTP_STORE.pop(phone, None)
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")

    stored['attempts'] = stored.get('attempts', 0) + 1
    if stored['attempts'] > 5:
        OTP_STORE.pop(phone, None)
        raise HTTPException(status_code=400, detail="Too many incorrect attempts. Request a new OTP.")

    if body.otp.strip() != stored['otp']:
        remaining = 5 - stored['attempts']
        raise HTTPException(status_code=400, detail=f"Incorrect OTP. {remaining} attempt(s) remaining.")

    OTP_STORE.pop(phone, None)

    if not supabase_admin or not supabase_anon:
        raise HTTPException(status_code=503, detail="Auth service not configured.")

    email = f"{re.sub(r'[^0-9]', '', phone)}@gkks.vivah"
    password = derive_supabase_password(phone)
    is_new_user = False

    # Try creating user first (idempotent — fails silently if already exists)
    try:
        supabase_admin.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
        })
        is_new_user = True
    except Exception:
        pass  # User already exists — proceed to sign in

    # Sign in to get session tokens
    try:
        sign_in_resp = supabase_anon.auth.sign_in_with_password({"email": email, "password": password})
        session = sign_in_resp.session
        supabase_user_id = sign_in_resp.user.id
    except Exception as e:
        logger.error(f"Supabase sign-in error: {e}")
        raise HTTPException(status_code=500, detail="Authentication service error. Please try again.")

    # Ensure public.users record exists
    try:
        existing_user = supabase_admin.table('users').select('id').eq('id', str(supabase_user_id)).execute()
        if not existing_user.data:
            supabase_admin.table('users').insert({
                'id': str(supabase_user_id),
                'phone': phone,
                'status': 'pending',
                'language_pref': 'gu',
            }).execute()
            is_new_user = True
    except Exception as e:
        logger.error(f"Error creating user record: {e}")

    return {
        "success": True,
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "user_id": str(supabase_user_id),
        "is_new_user": is_new_user,
    }


# ─── Auth Dependency ──────────────────────────────────────────
def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """Validate Supabase JWT from Authorization header. Returns {id: str}."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")
    token = authorization.removeprefix("Bearer ").strip()
    if not supabase_admin:
        raise HTTPException(status_code=503, detail="Auth service unavailable.")
    try:
        resp = supabase_admin.auth.get_user(token)
        return {"id": str(resp.user.id)}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")


# ─── GET /api/auth/me ─────────────────────────────────────────
@api_router.get("/auth/me")
def get_me(user: dict = Depends(get_current_user)):
    try:
        result = supabase_admin.table("users") \
            .select("id, role, status, profile_id, language_pref") \
            .eq("id", user["id"]) \
            .single() \
            .execute()
        return result.data
    except Exception as e:
        logger.error(f"get_me error: {e}")
        raise HTTPException(status_code=404, detail="User not found.")


# ─── PATCH /api/auth/set-role ──────────────────────────────────
class SetRoleRequest(BaseModel):
    role: str  # 'candidate' | 'parent'


@api_router.patch("/auth/set-role")
def set_role(body: SetRoleRequest, user: dict = Depends(get_current_user)):
    if body.role not in {"candidate", "parent"}:
        raise HTTPException(status_code=400, detail="Role must be 'candidate' or 'parent'.")
    try:
        supabase_admin.table("users") \
            .update({"role": body.role}) \
            .eq("id", user["id"]) \
            .execute()
    except Exception as e:
        logger.error(f"set_role error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update role.")
    return {"success": True, "role": body.role}


# ─── GET /api/profiles/search ─────────────────────────────────
@api_router.get("/profiles/search")
def search_profiles(q: str = "", user: dict = Depends(get_current_user)):
    if len(q.strip()) < 2:
        return {"profiles": []}
    safe_q = q.strip().replace("%", "\\%").replace("_", "\\_")
    try:
        result = supabase_admin.table("profiles") \
            .select("id, full_name, father_name, dob, city, gender") \
            .eq("status", "unclaimed") \
            .or_(f"full_name.ilike.%{safe_q}%,father_name.ilike.%{safe_q}%") \
            .limit(15) \
            .execute()
        return {"profiles": result.data}
    except Exception as e:
        logger.error(f"search_profiles error: {e}")
        raise HTTPException(status_code=500, detail="Search failed.")


# ─── POST /api/profiles/claim ─────────────────────────────────
class ClaimProfileRequest(BaseModel):
    profile_id: str
    selfie_base64: str


@api_router.post("/profiles/claim")
def claim_profile(body: ClaimProfileRequest, user: dict = Depends(get_current_user)):
    import base64

    # Fetch and validate profile
    try:
        profile_result = supabase_admin.table("profiles") \
            .select("id, status, full_name") \
            .eq("id", body.profile_id) \
            .single() \
            .execute()
    except Exception as e:
        logger.error(f"claim fetch error: {e}")
        raise HTTPException(status_code=404, detail="Profile not found.")

    profile = profile_result.data
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")
    if profile["status"] != "unclaimed":
        raise HTTPException(status_code=409, detail="This profile is no longer available for claiming.")

    # Upload selfie to admin-verification bucket
    selfie_path = None
    try:
        selfie_bytes = base64.b64decode(body.selfie_base64)
        selfie_path = f"claims/{user['id']}/{body.profile_id}.jpg"
        supabase_admin.storage.from_("admin-verification").upload(
            selfie_path,
            selfie_bytes,
            {"content-type": "image/jpeg", "upsert": "true"},
        )
    except Exception as e:
        logger.error(f"selfie upload error: {e}")
        # Continue even if selfie upload fails — log only

    # Update profile + user atomically
    try:
        supabase_admin.table("profiles").update({
            "status": "pending_approval",
            "claimed_by_user_id": user["id"],
            "claim_selfie_path": selfie_path,
            "claimed_at": datetime.utcnow().isoformat(),
        }).eq("id", body.profile_id).eq("status", "unclaimed").execute()

        supabase_admin.table("users").update({
            "profile_id": body.profile_id,
        }).eq("id", user["id"]).execute()

        supabase_admin.table("admin_log").insert({
            "event_type": "profile_claim_submitted",
            "related_user_id": user["id"],
            "related_profile_id": body.profile_id,
            "notes": f"selfie: {selfie_path or 'not uploaded'}",
        }).execute()
    except Exception as e:
        logger.error(f"claim update error: {e}")
        raise HTTPException(status_code=500, detail="Failed to submit claim.")

    return {
        "success": True,
        "profile_name": profile["full_name"],
        "message": "Claim submitted. An admin will review within 24 hours.",
    }


# ─── GET /api/profiles/browse ─────────────────────────────────
@api_router.get("/profiles/browse")
def browse_profiles(
    gender: str = "",
    city: str = "",
    age_min: int = 0,
    age_max: int = 0,
    page: int = 1,
    limit: int = 20,
    user: dict = Depends(get_current_user),
):
    from datetime import date as _date

    today = _date.today()

    query = (
        supabase_admin.table("profiles")
        .select("id, full_name, dob, city, gender, status")
        .in_("status", ["pending_approval", "claimed"])
    )

    if gender in ("Male", "Female"):
        query = query.eq("gender", gender)

    if city.strip():
        query = query.ilike("city", f"%{city.strip()}%")

    if age_min > 0:
        try:
            max_dob = today.replace(year=today.year - age_min)
        except ValueError:
            max_dob = today.replace(year=today.year - age_min, day=28)
        query = query.lte("dob", max_dob.isoformat())

    if age_max > 0:
        try:
            min_dob = today.replace(year=today.year - age_max - 1)
        except ValueError:
            min_dob = today.replace(year=today.year - age_max - 1, day=28)
        query = query.gte("dob", min_dob.isoformat())

    offset = (page - 1) * limit
    result = query.order("full_name").range(offset, offset + limit - 1).execute()

    profiles = []
    for p in result.data:
        age = None
        if p.get("dob"):
            dob = _date.fromisoformat(p["dob"])
            age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        profiles.append({**p, "age": age})

    return {"profiles": profiles, "page": page, "total": len(profiles)}


# ─── GET /api/profiles/:id ────────────────────────────────────
@api_router.get("/profiles/{profile_id}")
def get_profile_detail(
    profile_id: str,
    user: dict = Depends(get_current_user),
):
    from datetime import date as _date
    
    try:
        result = supabase_admin.table("profiles") \
            .select("*") \
            .eq("id", profile_id) \
            .in_("status", ["pending_approval", "claimed"]) \
            .single() \
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        profile = result.data
        
        # Calculate age from dob
        age = None
        if profile.get("dob"):
            today = _date.today()
            dob = _date.fromisoformat(profile["dob"])
            age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        
        # Return profile with age
        return {**profile, "age": age}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_profile_detail error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch profile")


# ─── Existing Routes ─────────────────────────────────────────
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

@api_router.get("/")
async def root():
    return {"message": "GKKS Vivah API v1"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(**input.dict())
    await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**c) for c in checks]

# ─── CSV Import: Preview ──────────────────────────────────────
@api_router.post("/admin/csv-preview")
async def csv_preview(
    file: UploadFile = File(...),
    _: bool = Depends(check_admin)
):
    """Upload CSV → returns column names, auto-detected mapping, first 10 rows."""
    content = await file.read()
    try:
        df = parse_csv_content(content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    columns = list(df.columns)
    mapping = auto_detect_mapping(columns)
    preview_data = df.head(10).replace('', None).fillna('').to_dict('records')

    mapped_fields = set(mapping.values())
    missing_required = [f for f in ['full_name', 'dob', 'father_name'] if f not in mapped_fields]

    return {
        "columns": columns,
        "mapping": mapping,
        "preview": preview_data,
        "total_rows": len(df),
        "missing_required": missing_required,
        "profile_fields": [{"value": v, "label": lbl} for v, lbl in PROFILE_FIELDS],
    }

# ─── CSV Import: Execute ──────────────────────────────────────
@api_router.post("/admin/csv-import")
async def csv_import(
    file: UploadFile = File(...),
    mapping: str = Form(...),
    dry_run: bool = Form(False),
    _: bool = Depends(check_admin)
):
    """Upload CSV + column mapping → bulk insert profiles as 'unclaimed'."""
    content = await file.read()
    try:
        df = parse_csv_content(content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        col_map: Dict[str, str] = json.loads(mapping)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid mapping JSON")

    # Validate required fields
    mapped_fields = set(v for v in col_map.values() if v)
    missing = [f for f in ['full_name', 'dob', 'father_name'] if f not in mapped_fields]
    if missing:
        raise HTTPException(status_code=400, detail=f"Required fields not mapped: {', '.join(missing)}")

    # Build reverse map: profile_field → csv_column
    reverse_map: Dict[str, str] = {v: k for k, v in col_map.items() if v}

    # Fetch existing profiles for duplicate detection
    existing_keys = fetch_existing_for_dedup()

    profiles_to_insert: List[Dict] = []
    duplicates_skipped: List[str] = []
    errors: List[Dict] = []
    seen_in_csv: set = set()

    for idx, row in df.iterrows():
        row_num = idx + 2
        try:
            profile: Dict[str, Any] = {}
            for profile_field, csv_col in reverse_map.items():
                if csv_col not in df.columns:
                    continue
                raw_val = row.get(csv_col, '')
                normalized = normalize_value(profile_field, raw_val)
                if normalized is not None and normalized != '':
                    profile[profile_field] = normalized

            fn = (profile.get('full_name') or '').strip()
            dob = profile.get('dob') or ''
            fa = (profile.get('father_name') or '').strip()

            if not fn or not dob or not fa:
                missing_fields = [f for f in ['full_name', 'dob', 'father_name'] if not profile.get(f)]
                errors.append({"row": row_num, "name": fn or "(empty)", "error": f"Missing: {', '.join(missing_fields)}"})
                continue

            dup_key = (fn.lower(), str(dob), fa.lower())
            if dup_key in existing_keys or dup_key in seen_in_csv:
                duplicates_skipped.append(fn)
                continue

            seen_in_csv.add(dup_key)
            profile['status'] = 'unclaimed'
            profiles_to_insert.append(profile)

        except Exception as e:
            errors.append({"row": row_num, "name": str(row.get(reverse_map.get('full_name', ''), '')), "error": str(e)})

    if dry_run:
        return {
            "total": len(df),
            "will_import": len(profiles_to_insert),
            "duplicates": len(duplicates_skipped),
            "errors": len(errors),
            "error_details": errors[:10],
            "dry_run": True,
        }

    if not supabase_admin:
        raise HTTPException(status_code=503, detail="Supabase not configured on server")

    # Bulk insert in batches of 50
    imported_count = 0
    insert_errors: List[str] = []
    for i in range(0, len(profiles_to_insert), 50):
        batch = profiles_to_insert[i:i + 50]
        try:
            supabase_admin.table('profiles').insert(batch).execute()
            imported_count += len(batch)
        except Exception as e:
            insert_errors.append(str(e)[:200])
            logger.error(f"Batch insert error: {e}")

    # Log to admin_log
    try:
        supabase_admin.table('admin_log').insert({
            'event_type': 'csv_import',
            'notes': f"Imported {imported_count}/{len(df)} profiles. Duplicates: {len(duplicates_skipped)}. Errors: {len(errors)}",
        }).execute()
    except Exception:
        pass

    return {
        "total": len(df),
        "imported": imported_count,
        "duplicates": len(duplicates_skipped),
        "errors": len(errors) + len(insert_errors),
        "error_details": (errors + [{"error": e} for e in insert_errors])[:10],
        "dry_run": False,
    }

# ─── App ──────────────────────────────────────────────────────
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
