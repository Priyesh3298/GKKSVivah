# GKKS Vivah — Step 1: Supabase Setup

## What this step creates

| Component | Details |
|---|---|
| **Tables** | 10 tables — profiles, users, parent_profiles, volunteer_applications, volunteer_actions, interests, shortlist, messages, reports, admin_log |
| **RLS Policies** | Row Level Security on every table — covers all 4 roles (admin, city_volunteer, candidate, parent) |
| **Indexes** | Performance indexes for discovery queries, fuzzy search, status filters |
| **Functions** | `get_my_role()`, `is_admin()`, `is_city_volunteer_for()`, `calculate_age()`, `fuzzy_match_profile()` |
| **Storage Buckets** | `profile-photos` (public) + `admin-verification` (private) |
| **Realtime** | `messages` and `interests` tables published for Supabase Realtime |

## Run Order

### Step A — Apply SQL Schema (run once in Supabase SQL Editor)

1. Open: https://supabase.com/dashboard/project/catrsvkucghsqfxdroan/sql/new
2. Copy the full file: `/app/supabase/migrations/complete_migration.sql`
3. Paste and click **Run**
4. Expected: `Success. No rows returned.`

### Step B — Create Storage Buckets (automated)

```bash
python /app/supabase/setup.py
```

Expected output:
```
✓ Connected to Supabase successfully
✓ Bucket created: profile-photos (public=True)
✓ Bucket created: admin-verification (public=False)
✓ All 10 tables verified
✅ Step 1 Complete
```

### Optional: Automated SQL via Management API

If you have a Supabase Personal Access Token (from https://supabase.com/dashboard/account/tokens):

```bash
SUPABASE_PAT=sbp_xxxx python /app/supabase/setup.py
```

## Key Design Decisions

- **Age is never stored** — always computed at runtime using `calculate_age(dob)` via `EXTRACT(YEAR FROM AGE(NOW(), dob))`
- **No sub_caste field** — intentionally absent from all tables
- **No video field** — intentionally absent from all tables
- **Circular FK resolved** — `profiles.claimed_by_user_id → users` and `users.profile_id → profiles` handled via deferred ALTER TABLE
- **Fuzzy search** — `pg_trgm` extension powers `fuzzy_match_profile()` for the claiming flow
- **claim_selfie_path** — temporary field cleared after claim approval/rejection; file permanently deleted from `admin-verification` bucket

## RLS Summary

| Table | Who can SELECT | Who can INSERT/UPDATE |
|---|---|---|
| profiles | Claimed: all auth users; Pending: admin + city volunteer + owner | Admin (INSERT); candidate (UPDATE own) |
| users | Own record; admin sees all; volunteer sees city users | Self (INSERT own); admin |
| interests | Sender + receiver; parent (child's) | Sender |
| messages | Both parties of accepted interest; parent (child's) | Sender |
| shortlist | Owner only | Owner |
| reports | Reporter + admin + city volunteer | Any authenticated user |
| admin_log | Admin only | Admin only |
