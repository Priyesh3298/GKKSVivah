# GKKS Vivah — PRD & Build Tracker

## Project Overview
Private, invite-only matrimonial app for a closed Gujarati community (400–600 members).
Non-profit. No subscriptions. No in-app purchases.
Languages: English + Gujarati (full bilingual UI)

## Architecture
- Mobile: React Native + Expo SDK 54
- Backend: Supabase (PostgreSQL + Auth + Storage + Realtime)
- Middleware: FastAPI (Python) — for MSG91 OTP, CSV processing, business logic
- Admin Panel: React.js + Tailwind (planned, Step 22)
- Auth: Supabase Auth + MSG91 WhatsApp OTP (OTP once at registration only)

## Credentials Configured
- Supabase URL: https://catrsvkucghsqfxdroan.supabase.co
- Supabase Anon Key: sb_publishable_WkWIumO9v8imL956-h8aOg_hdrXk4Nr
- Supabase Service Role Key: stored in /app/backend/.env
- Env files: /app/backend/.env, /app/frontend/.env

## User Roles
1. admin — full access
2. city_volunteer — manage city-specific claims/reports
3. parent — read-only, linked to child candidate
4. candidate — browse, interest, chat

## Core Design Decisions
- Age NEVER stored — always computed from dob via calculate_age()
- No sub_caste, no video feature anywhere
- All profiles pre-seeded by admin; users "claim" their profile
- Selfie for claiming is stored temporarily in admin-verification bucket; deleted after action
- Photos blurred until mutual interest accepted (app-level enforcement)
- Screenshot prevention via expo-screen-capture on all authenticated screens
- Language default: Gujarati (gu)

## Database Schema (10 tables)
profiles, users, parent_profiles, volunteer_applications, volunteer_actions,
interests, shortlist, messages, reports, admin_log

## ✅ Completed Steps

### Step 1 — Supabase Setup (Feb 2026)
- [x] Complete SQL migration written: /app/supabase/migrations/complete_migration.sql
  - 10 tables with all constraints and CHECK rules
  - pg_trgm extension for fuzzy profile-claiming search
  - Helper functions: get_my_role(), is_admin(), is_city_volunteer_for(), calculate_age(), fuzzy_match_profile()
  - RLS policies on all 10 tables (all 4 roles covered)
  - Performance indexes (name trigram, status, gender+status, dob, etc.)
  - Realtime publication for messages + interests tables
  - Storage bucket policies for profile-photos + admin-verification
- [x] Storage buckets created:
  - profile-photos (public: true, max 5MB, JPEG/PNG/WEBP)
  - admin-verification (public: false, strictly private, selfies only)
- [x] Setup script: /app/supabase/setup.py (verify + bucket creation)
- [x] /app/supabase/README.md with full setup instructions
- [x] Backend .env updated with SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
- [ ] SQL migration PENDING manual execution in Supabase SQL Editor

### Step 2 — Admin CSV Import Tool (Feb 2026)
- [x] Backend: `POST /api/admin/csv-preview` — parses CSV, auto-detects all 27 field mappings, returns preview rows
- [x] Backend: `POST /api/admin/csv-import` — bulk inserts profiles as 'unclaimed', batch of 50, duplicate detection
- [x] Smart column alias matching (handles: "Full Name", "Date of Birth", "Father's Name", etc.)
- [x] sub_caste and video_url are NEVER imported (explicitly blocked in COLUMN_ALIASES)
- [x] Admin auth via X-Admin-Secret header (secret: stored in .env as ADMIN_SECRET)
- [x] Date parsing: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD and more
- [x] Value normalization: Manglik (Yes/No/Partial), family_type (Joint/Nuclear), gender, marital_status, relocation, preferred_cities
- [x] Duplicate detection: exact match on (full_name, dob, father_name) — checks existing DB + intra-CSV
- [x] Dry-run mode (dry_run=true) for preview without DB writes
- [x] Frontend: 4-step admin import UI (Select → Map → Preview → Done)
- [x] Auth gate with admin secret input
- [x] Column mapping with custom bottom sheet picker (27 profile fields)
- [x] Saffron/gold theme with step indicator bar
- [x] Import summary cards (total, imported, duplicates, errors)
- [x] expo-document-picker 14.0.8 installed (SDK 54 compatible)

## 📋 Build Order — Status

| Step | Feature | Status |
|------|---------|--------|
| 1 | Supabase setup — tables, RLS, storage buckets | ✅ Done (SQL pending manual run) |
| 2 | Admin CSV import tool | ✅ Done |
| 3 | Registration screen — phone input, MSG91 OTP, Cloudflare Turnstile | ⏳ Pending |
| 4 | Role selection screen | ⏳ Pending |
| 5 | Candidate profile claiming — fuzzy search, selfie, claim review | ⏳ Pending |
| 6 | Parent linking flow | ⏳ Pending |
| 7 | City volunteer application | ⏳ Pending |
| 8 | Volunteer Dashboard tab | ⏳ Pending |
| 9 | Profile view + edit screen | ⏳ Pending |
| 10 | Photo upload + expo-screen-capture | ⏳ Pending |
| 11 | Discovery screen — gender toggle, swipe + list | ⏳ Pending |
| 12 | Filters | ⏳ Pending |
| 13 | Two-stage reveal | ⏳ Pending |
| 14 | Daily suggestions algorithm | ⏳ Pending |
| 15 | Interest flow | ⏳ Pending |
| 16 | My Connections screen | ⏳ Pending |
| 17 | Real-time chat | ⏳ Pending |
| 18 | Block and Report | ⏳ Pending |
| 19 | Automation Edge Functions | ⏳ Pending |
| 20 | Push notifications | ⏳ Pending |
| 21 | Bilingual i18n (English + Gujarati) | ⏳ Pending |
| 22 | Admin web panel | ⏳ Pending |
| 23 | Sentry error monitoring | ⏳ Pending |
| 24 | RLS policies audit | ⏳ Pending |
| 25 | Expo EAS build | ⏳ Pending |

## Key Files
- /app/supabase/migrations/complete_migration.sql — Full DB schema + RLS
- /app/supabase/setup.py — Bucket creation + verification
- /app/supabase/README.md — Manual setup instructions
- /app/backend/.env — Supabase credentials
- /app/frontend/.env — Public Supabase credentials (to be added in Step 3)
- /app/backend/server.py — FastAPI middleware
- /app/frontend/app/index.tsx — Entry screen
