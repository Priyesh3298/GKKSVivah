#!/usr/bin/env python3
"""
GKKS Vivah — Supabase Setup Script
Runs Step 1: Creates storage buckets and verifies database connectivity.

Usage:
  python /app/supabase/setup.py
"""

import os
import sys
import json
import httpx
from supabase import create_client, Client

# ─── Credentials ─────────────────────────────────────────────
SUPABASE_URL          = "https://catrsvkucghsqfxdroan.supabase.co"
SUPABASE_SERVICE_KEY  = "sb_secret_lbQQ5AeLcvtRjCw0vC09gQ_EiSDRlW2"
PROJECT_REF           = "catrsvkucghsqfxdroan"

COLORS = {
    "green":  "\033[92m",
    "yellow": "\033[93m",
    "red":    "\033[91m",
    "cyan":   "\033[96m",
    "bold":   "\033[1m",
    "reset":  "\033[0m",
}
def c(color, text): return f"{COLORS[color]}{text}{COLORS['reset']}"


# ─── 1. Connectivity Test ─────────────────────────────────────
def test_connectivity():
    print(c("cyan", "\n▶  Testing Supabase connectivity..."))
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        # A simple auth admin call that works with service role key
        res = supabase.auth.get_user("invalid-token-just-testing")
    except Exception as e:
        # Even an error means we reached Supabase — connectivity is fine
        err = str(e)
        if "invalid" in err.lower() or "jwt" in err.lower() or "token" in err.lower() or "AuthApiError" in err:
            print(c("green", "  ✓  Connected to Supabase successfully"))
            return True
        print(c("red", f"  ✗  Connection failed: {e}"))
        return False
    print(c("green", "  ✓  Connected to Supabase successfully"))
    return True


# ─── 2. Create Storage Buckets ───────────────────────────────
def create_storage_buckets(supabase: Client):
    print(c("cyan", "\n▶  Creating storage buckets..."))

    buckets = [
        {
            "id": "profile-photos",
            "name": "profile-photos",
            "public": True,
            "options": {
                "allowedMimeTypes": ["image/jpeg", "image/jpg", "image/png", "image/webp"],
                "fileSizeLimit": 5242880,   # 5 MB max (after client-side compression)
            }
        },
        {
            "id": "admin-verification",
            "name": "admin-verification",
            "public": False,
            "options": {
                "allowedMimeTypes": ["image/jpeg", "image/jpg", "image/png"],
                "fileSizeLimit": 5242880,
            }
        },
    ]

    results = {}
    for b in buckets:
        try:
            supabase.storage.create_bucket(b["id"], options={
                "public": b["public"],
                "allowed_mime_types": b["options"]["allowedMimeTypes"],
                "file_size_limit": b["options"]["fileSizeLimit"],
            })
            print(c("green", f"  ✓  Bucket created: {b['name']} (public={b['public']})"))
            results[b["id"]] = "created"
        except Exception as e:
            msg = str(e).lower()
            if "already exists" in msg or "duplicate" in msg or "409" in msg:
                print(c("yellow", f"  ℹ  Bucket already exists: {b['name']}"))
                results[b["id"]] = "exists"
            else:
                print(c("red", f"  ✗  Error creating {b['name']}: {e}"))
                results[b["id"]] = f"error: {e}"
    return results


# ─── 3. Try Management API for SQL ───────────────────────────
def try_management_api_sql():
    """
    The Supabase Management API (api.supabase.com) requires a PERSONAL ACCESS TOKEN
    (starts with sbp_...), NOT the project service role key.

    To apply the migration automatically:
      1. Go to https://supabase.com/dashboard/account/tokens
      2. Create a Personal Access Token
      3. Re-run this script with:
         SUPABASE_PAT=sbp_xxxx python /app/supabase/setup.py
    """
    pat = os.environ.get("SUPABASE_PAT", "")
    if not pat:
        return None

    print(c("cyan", "\n▶  Attempting SQL migration via Management API..."))
    sql_path = "/app/supabase/migrations/complete_migration.sql"
    if not os.path.exists(sql_path):
        print(c("red", "  ✗  Migration file not found"))
        return False

    with open(sql_path, "r") as f:
        sql = f.read()

    try:
        r = httpx.post(
            f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
            headers={
                "Authorization": f"Bearer {pat}",
                "Content-Type": "application/json",
            },
            json={"query": sql},
            timeout=60,
        )
        if r.status_code == 200:
            print(c("green", "  ✓  SQL migration applied successfully via Management API!"))
            return True
        else:
            print(c("red", f"  ✗  Management API error {r.status_code}: {r.text[:200]}"))
            return False
    except Exception as e:
        print(c("red", f"  ✗  Management API exception: {e}"))
        return False


# ─── 4. Verify tables exist ──────────────────────────────────
def verify_tables():
    """Check which tables exist via direct PostgREST HTTP calls."""
    print(c("cyan", "\n▶  Verifying tables..."))
    tables = [
        "profiles", "users", "parent_profiles", "volunteer_applications",
        "volunteer_actions", "interests", "shortlist", "messages",
        "reports", "admin_log",
    ]
    all_ok = True
    with httpx.Client(timeout=15) as client:
        for table in tables:
            r = client.get(
                f"{SUPABASE_URL}/rest/v1/{table}?select=id&limit=1",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
            )
            if r.status_code == 200:
                print(c("green", f"  ✓  {table}"))
            else:
                body = r.text[:100]
                if "PGRST205" in body or "not exist" in body or r.status_code == 404:
                    print(c("red", f"  ✗  {table}  ← NOT FOUND (run SQL migration first)"))
                    all_ok = False
                else:
                    print(c("yellow", f"  ?  {table}  (status {r.status_code}: {body[:60]})"))
                    all_ok = False
    return all_ok


# ─── 5. Print SQL Instructions ───────────────────────────────
def print_sql_instructions():
    print(c("bold", """
╔══════════════════════════════════════════════════════════════╗
║   MANUAL SQL STEP REQUIRED                                   ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  1. Open your Supabase dashboard:                            ║
║     https://supabase.com/dashboard/project/catrsvkucghsqfxdroan
║                                                              ║
║  2. Go to:  SQL Editor → New Query                           ║
║                                                              ║
║  3. Copy the full contents of:                               ║
║     /app/supabase/migrations/complete_migration.sql          ║
║                                                              ║
║  4. Paste into the SQL Editor and click  ▶ Run               ║
║                                                              ║
║  5. Re-run this script to verify:                            ║
║     python /app/supabase/setup.py                            ║
║                                                              ║
║  Alternatively, provide your Personal Access Token:          ║
║  SUPABASE_PAT=sbp_xxxx python /app/supabase/setup.py         ║
╚══════════════════════════════════════════════════════════════╝
"""))


# ─── Main ────────────────────────────────────────────────────
if __name__ == "__main__":
    print(c("bold", "\n🕉  GKKS Vivah — Supabase Setup (Step 1)\n"))

    # 1. Test connectivity
    connected = test_connectivity()
    if not connected:
        print(c("red", "\n✗ Cannot reach Supabase. Check your credentials and network."))
        sys.exit(1)

    # 2. Initialise client
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # 3. Try automated SQL migration (only if PAT provided)
    sql_applied = try_management_api_sql()

    # 4. Create storage buckets (always works with service role key)
    bucket_results = create_storage_buckets(supabase)

    # 5. Verify tables
    tables_ok = verify_tables()

    # 6. Summary
    print(c("cyan", "\n─── Summary ─────────────────────────────────────────────"))
    buckets_ok = all(v in ("created", "exists") for v in bucket_results.values())
    print(c("green" if buckets_ok else "red",
            f"  Storage Buckets : {'✓ Ready' if buckets_ok else '✗ Issues found'}"))
    print(c("green" if tables_ok  else "yellow",
            f"  Database Tables : {'✓ All 10 tables verified' if tables_ok else '⚠  Tables not yet created'}"))

    if not tables_ok:
        if not sql_applied:
            print_sql_instructions()
            print(c("yellow", "  ⚠  Please run the SQL migration manually, then re-run this script.\n"))
        sys.exit(0 if buckets_ok else 1)
    else:
        print(c("green", c("bold", "\n  ✅  Step 1 Complete — Supabase is ready!\n")))
