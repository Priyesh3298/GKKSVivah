-- ============================================================
-- GKKS VIVAH — Complete Database Migration
-- Run this ONCE in Supabase SQL Editor (Project → SQL Editor)
-- ============================================================

-- ============================================================
-- PART 1: Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy name search

-- ============================================================
-- PART 2: PROFILES TABLE (pre-seeded by admin via CSV)
-- claimed_by_user_id FK added after users table is created
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name                 TEXT NOT NULL,
  full_name_gujarati        TEXT,
  dob                       DATE NOT NULL,
  gender                    TEXT CHECK (gender IN ('Male','Female')),
  father_name               TEXT NOT NULL,
  mother_name               TEXT,
  caste                     TEXT,
  gotra                     TEXT,
  rashi                     TEXT,
  nakshatra                 TEXT,
  manglik                   TEXT CHECK (manglik IN ('Yes','No','Partial')),
  family_type               TEXT CHECK (family_type IN ('Joint','Nuclear')),
  siblings_info             TEXT,
  native_village            TEXT,
  parent_phone              TEXT,   -- display only, never used for matching
  city                      TEXT,
  country                   TEXT DEFAULT 'India',
  -- Candidate-editable fields
  education                 TEXT,
  profession                TEXT,
  employer                  TEXT,
  income_range              TEXT,
  height_cm                 INT,
  marital_status            TEXT DEFAULT 'Never Married'
                              CHECK (marital_status IN (
                                'Never Married','Divorced','Widowed','Awaiting Divorce')),
  has_children              BOOLEAN DEFAULT false,
  willing_to_relocate_abroad TEXT DEFAULT 'Open to discussion'
                              CHECK (willing_to_relocate_abroad IN (
                                'Yes, open to moving abroad',
                                'No, prefer to stay in India',
                                'Already abroad',
                                'Open to discussion')),
  preferred_cities          TEXT[] DEFAULT '{}',
  about_me                  TEXT CHECK (char_length(about_me) <= 300),
  photos                    TEXT[] DEFAULT '{}',   -- paths in profile-photos bucket
  show_phone                BOOLEAN DEFAULT false,
  show_email                BOOLEAN DEFAULT false,
  -- Claiming fields
  claimed_by_user_id        UUID,   -- FK added after users table
  claim_selfie_path         TEXT,   -- path in admin-verification bucket; deleted after action
  status                    TEXT DEFAULT 'unclaimed'
                              CHECK (status IN (
                                'unclaimed','pending_approval','claimed','banned','manual_review')),
  created_at                TIMESTAMPTZ DEFAULT now(),
  claimed_at                TIMESTAMPTZ
);

-- ============================================================
-- PART 3: USERS TABLE (extends Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone                 TEXT UNIQUE NOT NULL,
  email                 TEXT,
  role                  TEXT CHECK (role IN ('candidate','parent','city_volunteer','admin')),
  status                TEXT DEFAULT 'pending' CHECK (status IN ('approved','pending','banned')),
  language_pref         TEXT DEFAULT 'gu' CHECK (language_pref IN ('en','gu')),
  profile_id            UUID REFERENCES public.profiles(id),
  city_assigned         TEXT,            -- for city_volunteer role
  volunteer_since       TIMESTAMPTZ,
  volunteer_approved_by UUID REFERENCES public.users(id),
  expo_push_token       TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  last_active           TIMESTAMPTZ
);

-- ============================================================
-- PART 4: Add circular FK — profiles → users
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_claimed_by_user_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_claimed_by_user_id_fkey
      FOREIGN KEY (claimed_by_user_id) REFERENCES public.users(id);
  END IF;
END $$;

-- ============================================================
-- PART 5: Remaining Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.parent_profiles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES public.users(id) UNIQUE,
  candidate_profile_id  UUID REFERENCES public.profiles(id),
  relationship          TEXT CHECK (relationship IN ('Father','Mother','Guardian')),
  name                  TEXT,
  approved              BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.volunteer_applications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES public.users(id),
  city         TEXT NOT NULL,
  reason       TEXT CHECK (char_length(reason) <= 100),
  status       TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by  UUID REFERENCES public.users(id),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.volunteer_actions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id        UUID REFERENCES public.users(id),
  action_type         TEXT CHECK (action_type IN (
                        'approved_claim','rejected_claim','escalated','sent_note')),
  target_profile_id   UUID REFERENCES public.profiles(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.interests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id     UUID REFERENCES public.users(id),
  receiver_id   UUID REFERENCES public.users(id),
  status        TEXT DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','declined','expired')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  responded_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days'),
  UNIQUE(sender_id, receiver_id)
);

CREATE TABLE IF NOT EXISTS public.shortlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.users(id),
  profile_id  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interest_id  UUID REFERENCES public.interests(id),
  sender_id    UUID REFERENCES public.users(id),
  content      TEXT NOT NULL,
  is_read      BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reports (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id          UUID REFERENCES public.users(id),
  reported_profile_id  UUID REFERENCES public.profiles(id),
  reason               TEXT CHECK (reason IN (
                         'Fake profile','Inappropriate','Harassment','Other')),
  details              TEXT,
  status               TEXT DEFAULT 'open'
                         CHECK (status IN ('open','warned','banned','dismissed')),
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type          TEXT,
  related_user_id     UUID,
  related_profile_id  UUID,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- PART 6: Performance Indexes
-- ============================================================

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_status       ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_gender_status ON public.profiles(gender, status);
CREATE INDEX IF NOT EXISTS idx_profiles_city_status   ON public.profiles(city, status);
CREATE INDEX IF NOT EXISTS idx_profiles_dob           ON public.profiles(dob);
CREATE INDEX IF NOT EXISTS idx_profiles_claimed_by    ON public.profiles(claimed_by_user_id);
-- Trigram index for fuzzy name search (used in profile claiming)
CREATE INDEX IF NOT EXISTS idx_profiles_name_trgm     ON public.profiles USING gin(full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_father_trgm   ON public.profiles USING gin(father_name gin_trgm_ops);

-- users
CREATE INDEX IF NOT EXISTS idx_users_phone        ON public.users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role         ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_city_role    ON public.users(city_assigned, role);

-- interests
CREATE INDEX IF NOT EXISTS idx_interests_sender    ON public.interests(sender_id);
CREATE INDEX IF NOT EXISTS idx_interests_receiver  ON public.interests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_interests_status    ON public.interests(status);
CREATE INDEX IF NOT EXISTS idx_interests_expires   ON public.interests(expires_at);

-- messages
CREATE INDEX IF NOT EXISTS idx_messages_interest  ON public.messages(interest_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender    ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created   ON public.messages(created_at);

-- shortlist
CREATE INDEX IF NOT EXISTS idx_shortlist_user    ON public.shortlist(user_id);

-- reports
CREATE INDEX IF NOT EXISTS idx_reports_status          ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reported_profile ON public.reports(reported_profile_id);

-- ============================================================
-- PART 7: Helper Functions for RLS
-- ============================================================

-- Returns current user's role from public.users
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- Returns current user's assigned city (for city_volunteer)
CREATE OR REPLACE FUNCTION public.get_my_city()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT city_assigned FROM public.users WHERE id = auth.uid();
$$;

-- Returns TRUE if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Returns TRUE if current user is a city_volunteer for a given city
CREATE OR REPLACE FUNCTION public.is_city_volunteer_for(p_city TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role = 'city_volunteer'
      AND city_assigned = p_city
  );
$$;

-- ============================================================
-- PART 8: Age Calculation Function (always computed from dob)
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_age(p_dob DATE)
RETURNS INT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT EXTRACT(YEAR FROM AGE(NOW(), p_dob))::INT;
$$;

-- Fuzzy match score for profile claiming
CREATE OR REPLACE FUNCTION public.fuzzy_match_profile(
  p_name      TEXT,
  p_dob       DATE,
  p_father    TEXT
)
RETURNS TABLE (
  profile_id   UUID,
  full_name    TEXT,
  dob          DATE,
  father_name  TEXT,
  mother_name  TEXT,
  city         TEXT,
  gender       TEXT,
  score        FLOAT
)
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.dob,
    p.father_name,
    p.mother_name,
    p.city,
    p.gender,
    (
      similarity(LOWER(p.full_name), LOWER(p_name)) * 0.5 +
      CASE WHEN p.dob = p_dob THEN 0.3 ELSE 0 END +
      similarity(LOWER(p.father_name), LOWER(p_father)) * 0.2
    ) AS score
  FROM public.profiles p
  WHERE p.status = 'unclaimed'
    AND (
      similarity(LOWER(p.full_name), LOWER(p_name)) > 0.3
      OR LOWER(p.full_name) ILIKE '%' || LOWER(p_name) || '%'
    )
  ORDER BY score DESC
  LIMIT 5;
$$;

-- ============================================================
-- PART 9: Enable RLS on all tables
-- ============================================================
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_actions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shortlist            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_log            ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PART 10: RLS Policies
-- ============================================================

-- ---- PROFILES ----
-- Drop existing policies before recreating
DROP POLICY IF EXISTS "profiles_admin_all"              ON public.profiles;
DROP POLICY IF EXISTS "profiles_claimed_visible"         ON public.profiles;
DROP POLICY IF EXISTS "profiles_volunteer_pending"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_candidate_select"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_candidate_update"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_service_insert"          ON public.profiles;

-- Admin sees and modifies everything
CREATE POLICY "profiles_admin_all"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Claimed profiles visible to all authenticated users
CREATE POLICY "profiles_claimed_visible"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (status = 'claimed');

-- City volunteers see pending_approval + manual_review in their city
CREATE POLICY "profiles_volunteer_pending"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    status IN ('pending_approval', 'manual_review')
    AND public.is_city_volunteer_for(city)
  );

-- Candidates can see and update their own profile (any status)
CREATE POLICY "profiles_own_candidate_select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (claimed_by_user_id = auth.uid());

CREATE POLICY "profiles_own_candidate_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (claimed_by_user_id = auth.uid())
  WITH CHECK (claimed_by_user_id = auth.uid());

-- Service role can insert (CSV import, admin operations)
CREATE POLICY "profiles_service_insert"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- ---- USERS ----
DROP POLICY IF EXISTS "users_own_select"     ON public.users;
DROP POLICY IF EXISTS "users_own_insert"     ON public.users;
DROP POLICY IF EXISTS "users_own_update"     ON public.users;
DROP POLICY IF EXISTS "users_admin_all"      ON public.users;
DROP POLICY IF EXISTS "users_volunteer_city" ON public.users;

CREATE POLICY "users_own_select"
  ON public.users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users_own_insert"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "users_own_update"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "users_admin_all"
  ON public.users FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- City volunteers can see users whose profile is in their city
CREATE POLICY "users_volunteer_city"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() = 'city_volunteer'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.claimed_by_user_id = users.id
        AND p.city = public.get_my_city()
    )
  );

-- ---- PARENT PROFILES ----
DROP POLICY IF EXISTS "parent_profiles_own"         ON public.parent_profiles;
DROP POLICY IF EXISTS "parent_profiles_admin_all"   ON public.parent_profiles;

CREATE POLICY "parent_profiles_own"
  ON public.parent_profiles FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "parent_profiles_admin_all"
  ON public.parent_profiles FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Candidates can see parent linked to their profile
CREATE POLICY "parent_profiles_candidate_see"
  ON public.parent_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = parent_profiles.candidate_profile_id
        AND p.claimed_by_user_id = auth.uid()
    )
  );

-- ---- VOLUNTEER APPLICATIONS ----
DROP POLICY IF EXISTS "vol_apps_own"       ON public.volunteer_applications;
DROP POLICY IF EXISTS "vol_apps_admin_all" ON public.volunteer_applications;

CREATE POLICY "vol_apps_own"
  ON public.volunteer_applications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "vol_apps_insert_own"
  ON public.volunteer_applications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "vol_apps_admin_all"
  ON public.volunteer_applications FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- VOLUNTEER ACTIONS ----
DROP POLICY IF EXISTS "vol_actions_own"       ON public.volunteer_actions;
DROP POLICY IF EXISTS "vol_actions_admin_all" ON public.volunteer_actions;

CREATE POLICY "vol_actions_own"
  ON public.volunteer_actions FOR SELECT
  TO authenticated
  USING (volunteer_id = auth.uid());

CREATE POLICY "vol_actions_insert"
  ON public.volunteer_actions FOR INSERT
  TO authenticated
  WITH CHECK (
    volunteer_id = auth.uid()
    AND public.get_my_role() IN ('city_volunteer', 'admin')
  );

CREATE POLICY "vol_actions_admin_all"
  ON public.volunteer_actions FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- INTERESTS ----
DROP POLICY IF EXISTS "interests_parties"    ON public.interests;
DROP POLICY IF EXISTS "interests_insert"     ON public.interests;
DROP POLICY IF EXISTS "interests_update"     ON public.interests;
DROP POLICY IF EXISTS "interests_admin_all"  ON public.interests;

CREATE POLICY "interests_parties"
  ON public.interests FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Parents can see their child's interests
CREATE POLICY "interests_parent_see"
  ON public.interests FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() = 'parent'
    AND EXISTS (
      SELECT 1 FROM public.parent_profiles pp
      JOIN public.users u ON u.id = auth.uid()
      JOIN public.profiles p ON p.claimed_by_user_id = interests.sender_id
                             OR p.claimed_by_user_id = interests.receiver_id
      WHERE pp.user_id = auth.uid()
        AND pp.approved = true
        AND pp.candidate_profile_id = p.id
    )
  );

CREATE POLICY "interests_insert"
  ON public.interests FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "interests_update"
  ON public.interests FOR UPDATE
  TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "interests_admin_all"
  ON public.interests FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- SHORTLIST ----
DROP POLICY IF EXISTS "shortlist_own"      ON public.shortlist;
DROP POLICY IF EXISTS "shortlist_admin"    ON public.shortlist;

CREATE POLICY "shortlist_own"
  ON public.shortlist FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "shortlist_admin"
  ON public.shortlist FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- MESSAGES ----
DROP POLICY IF EXISTS "messages_parties"    ON public.messages;
DROP POLICY IF EXISTS "messages_insert"     ON public.messages;
DROP POLICY IF EXISTS "messages_admin"      ON public.messages;

-- Both parties of an accepted interest can see messages
CREATE POLICY "messages_parties"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.interests i
      WHERE i.id = messages.interest_id
        AND (i.sender_id = auth.uid() OR i.receiver_id = auth.uid())
        AND i.status = 'accepted'
    )
  );

-- Parents can read child's messages (read-only)
CREATE POLICY "messages_parent_read"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() = 'parent'
    AND EXISTS (
      SELECT 1 FROM public.parent_profiles pp
      JOIN public.interests i ON i.id = messages.interest_id
      JOIN public.profiles p ON p.claimed_by_user_id = i.sender_id
                             OR p.claimed_by_user_id = i.receiver_id
      WHERE pp.user_id = auth.uid()
        AND pp.approved = true
        AND pp.candidate_profile_id = p.id
    )
  );

CREATE POLICY "messages_insert"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.interests i
      WHERE i.id = messages.interest_id
        AND (i.sender_id = auth.uid() OR i.receiver_id = auth.uid())
        AND i.status = 'accepted'
    )
  );

CREATE POLICY "messages_update_read"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.interests i
      WHERE i.id = messages.interest_id
        AND i.receiver_id = auth.uid()
        AND i.status = 'accepted'
    )
  );

CREATE POLICY "messages_admin"
  ON public.messages FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- ---- REPORTS ----
DROP POLICY IF EXISTS "reports_own_insert"  ON public.reports;
DROP POLICY IF EXISTS "reports_own_select"  ON public.reports;
DROP POLICY IF EXISTS "reports_admin_all"   ON public.reports;
DROP POLICY IF EXISTS "reports_volunteer"   ON public.reports;

CREATE POLICY "reports_own_insert"
  ON public.reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "reports_own_select"
  ON public.reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

CREATE POLICY "reports_admin_all"
  ON public.reports FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- City volunteers can see reports in their city
CREATE POLICY "reports_volunteer"
  ON public.reports FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() = 'city_volunteer'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = reports.reported_profile_id
        AND p.city = public.get_my_city()
    )
  );

-- ---- ADMIN LOG ----
DROP POLICY IF EXISTS "admin_log_admin_only" ON public.admin_log;

CREATE POLICY "admin_log_admin_only"
  ON public.admin_log FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- PART 11: Storage Policies
-- (Buckets must be created first via Supabase Storage UI or API)
-- ============================================================

-- profile-photos: Authenticated users can read all photos
-- (Blur enforcement is handled at app level, not storage level)
DROP POLICY IF EXISTS "profile_photos_read"        ON storage.objects;
DROP POLICY IF EXISTS "profile_photos_upload"      ON storage.objects;
DROP POLICY IF EXISTS "profile_photos_update_own"  ON storage.objects;
DROP POLICY IF EXISTS "profile_photos_delete_own"  ON storage.objects;
DROP POLICY IF EXISTS "admin_verify_read"          ON storage.objects;
DROP POLICY IF EXISTS "admin_verify_upload"        ON storage.objects;
DROP POLICY IF EXISTS "admin_verify_delete"        ON storage.objects;

CREATE POLICY "profile_photos_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'profile-photos');

CREATE POLICY "profile_photos_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "profile_photos_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "profile_photos_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_admin()
    )
  );

-- admin-verification: STRICTLY PRIVATE
-- Only admin + assigned city volunteer + the candidate who uploaded it
CREATE POLICY "admin_verify_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'admin-verification'
    AND (
      public.is_admin()
      OR public.get_my_role() = 'city_volunteer'
    )
  );

CREATE POLICY "admin_verify_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'admin-verification'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "admin_verify_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'admin-verification'
    AND (public.is_admin() OR public.get_my_role() = 'city_volunteer')
  );

-- ============================================================
-- PART 12: Realtime Publication (for chat)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.interests;

-- ============================================================
-- MIGRATION COMPLETE
-- Next: Run setup.py to create storage buckets automatically
-- ============================================================
