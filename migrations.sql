-- ============================================================
-- CONTOUR ADMIN PANEL — ALL 14 MIGRATIONS
-- Run this on your self-hosted Supabase Postgres instance
-- Paste into SQL Editor and execute
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Migration 1: Bootstrap Superadmin
-- ────────────────────────────────────────────────────────────
INSERT INTO public.user_roles (user_id, role)
VALUES ('bf437c99-2cb5-44da-920a-69f49935155b', 'superadmin')
ON CONFLICT (user_id) DO UPDATE SET role = 'superadmin';


-- ────────────────────────────────────────────────────────────
-- Migration 2: Admin RLS — Profiles
-- ────────────────────────────────────────────────────────────
CREATE POLICY "admins_read_all_profiles" ON public.profiles
  FOR SELECT
  USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'));

CREATE POLICY "admins_update_profile_status" ON public.profiles
  FOR UPDATE
  USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'superadmin'));


-- ────────────────────────────────────────────────────────────
-- Migration 3: Admin RLS — User Roles
-- ────────────────────────────────────────────────────────────
CREATE POLICY "superadmin_read_all_roles" ON public.user_roles
  FOR SELECT USING (get_user_role(auth.uid()) = 'superadmin');

CREATE POLICY "superadmin_manage_roles" ON public.user_roles
  FOR ALL
  USING (get_user_role(auth.uid()) = 'superadmin')
  WITH CHECK (get_user_role(auth.uid()) = 'superadmin');


-- ────────────────────────────────────────────────────────────
-- Migration 4: Admin Get User Emails RPC
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_user_emails(user_ids uuid[])
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY
  SELECT u.id, u.email::text FROM auth.users u WHERE u.id = ANY(user_ids);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- Migration 5: Dashboard Stats RPC
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN jsonb_build_object(
    'total_users',        (SELECT count(*) FROM profiles),
    'pending_users',      (SELECT count(*) FROM profiles WHERE access_status = 'pending'),
    'approved_users',     (SELECT count(*) FROM profiles WHERE access_status = 'approved'),
    'rejected_users',     (SELECT count(*) FROM profiles WHERE access_status = 'rejected'),
    'signups_today',      (SELECT count(*) FROM profiles WHERE created_at >= CURRENT_DATE),
    'signups_this_week',  (SELECT count(*) FROM profiles WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'),
    'complete_profiles',  (SELECT count(*) FROM profiles WHERE is_complete = true),
    'public_profiles',    (SELECT count(*) FROM profiles WHERE is_public = true),
    'total_contacts',     (SELECT count(*) FROM contacts),
    'total_tasks',        (SELECT count(*) FROM tasks),
    'total_meetings',     (SELECT count(*) FROM meetings),
    'total_transactions', (SELECT count(*) FROM transactions),
    'active_offers',      (SELECT count(*) FROM user_offers WHERE is_active = true),
    'active_wants',       (SELECT count(*) FROM user_wants WHERE is_active = true),
    'total_messages',     (SELECT count(*) FROM profile_messages),
    'total_match_runs',   (SELECT count(*) FROM match_logs),
    'total_events',       (SELECT count(*) FROM user_events),
    'total_errors',       (SELECT count(*) FROM app_error_logs),
    'flagged_listings',   (SELECT count(*) FROM listing_flags WHERE reviewed = false)
  );
END;
$$;


-- ────────────────────────────────────────────────────────────
-- Migration 6: Admin Read All User Data
-- ────────────────────────────────────────────────────────────
CREATE POLICY "admins_read_all_contacts" ON public.contacts
  FOR SELECT USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'));

CREATE POLICY "admins_read_all_tasks" ON public.tasks
  FOR SELECT USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'));

CREATE POLICY "admins_read_all_meetings" ON public.meetings
  FOR SELECT USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'));

CREATE POLICY "admins_read_all_transactions" ON public.transactions
  FOR SELECT USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'));

CREATE POLICY "admins_read_all_profile_tags" ON public.profile_tags
  FOR SELECT USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'));


-- ────────────────────────────────────────────────────────────
-- Migration 7: Admin RLS — Marketplace
-- ────────────────────────────────────────────────────────────
CREATE POLICY "admins_read_all_offers" ON public.user_offers
  FOR SELECT USING (get_user_role(auth.uid()) IN ('admin', 'superadmin', 'moderator'));

CREATE POLICY "admins_update_offers" ON public.user_offers
  FOR UPDATE USING (get_user_role(auth.uid()) IN ('admin', 'superadmin', 'moderator'));

CREATE POLICY "admins_delete_offers" ON public.user_offers
  FOR DELETE USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'));

CREATE POLICY "admins_read_all_wants" ON public.user_wants
  FOR SELECT USING (get_user_role(auth.uid()) IN ('admin', 'superadmin', 'moderator'));

CREATE POLICY "admins_update_wants" ON public.user_wants
  FOR UPDATE USING (get_user_role(auth.uid()) IN ('admin', 'superadmin', 'moderator'));

CREATE POLICY "admins_delete_wants" ON public.user_wants
  FOR DELETE USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'));


-- ────────────────────────────────────────────────────────────
-- Migration 8: Admin Update Listing Flags
-- ────────────────────────────────────────────────────────────
CREATE POLICY "admins_update_listing_flags" ON public.listing_flags
  FOR UPDATE
  USING (get_user_role(auth.uid()) IN ('admin', 'superadmin', 'moderator'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'superadmin', 'moderator'));


-- ────────────────────────────────────────────────────────────
-- Migration 9: Admin RLS — Messages
-- ────────────────────────────────────────────────────────────
CREATE POLICY "admins_read_all_messages" ON public.profile_messages
  FOR SELECT USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'));

CREATE POLICY "admins_delete_messages" ON public.profile_messages
  FOR DELETE USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'));


-- ────────────────────────────────────────────────────────────
-- Migration 10: Admin RLS — Match Feedback
-- ────────────────────────────────────────────────────────────
CREATE POLICY "admins_read_all_match_feedback" ON public.match_feedback
  FOR SELECT USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'));


-- ────────────────────────────────────────────────────────────
-- Migration 11: Match Analytics RPCs
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_match_usage(days_back int DEFAULT 30)
RETURNS TABLE(day date, match_runs bigint, avg_results numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY
  SELECT DATE(ml.created_at) AS day,
         COUNT(*) AS match_runs,
         ROUND(AVG(ml.results_count), 1) AS avg_results
  FROM match_logs ml
  WHERE ml.created_at >= CURRENT_DATE - (days_back || ' days')::interval
  GROUP BY DATE(ml.created_at)
  ORDER BY day DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_match_feedback_stats()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'total_feedback', (SELECT count(*) FROM match_feedback),
      'clicked',  (SELECT count(*) FROM match_feedback WHERE action = 'clicked'),
      'accepted', (SELECT count(*) FROM match_feedback WHERE action = 'accepted'),
      'rejected', (SELECT count(*) FROM match_feedback WHERE action = 'rejected'),
      'ignored',  (SELECT count(*) FROM match_feedback WHERE action = 'ignored'),
      'avg_score_accepted', (SELECT ROUND(AVG(match_score), 2) FROM match_feedback WHERE action = 'accepted'),
      'avg_score_rejected', (SELECT ROUND(AVG(match_score), 2) FROM match_feedback WHERE action = 'rejected')
    )
  );
END;
$$;


-- ────────────────────────────────────────────────────────────
-- Migration 12: Admin Catalog Management RLS
-- ────────────────────────────────────────────────────────────
CREATE POLICY "admins_manage_categories" ON public.marketplace_categories
  FOR ALL USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'superadmin'));

CREATE POLICY "admins_manage_subcategories" ON public.marketplace_subcategories
  FOR ALL USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'superadmin'));

CREATE POLICY "admins_manage_category_intents" ON public.marketplace_category_intents
  FOR ALL USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'superadmin'));

CREATE POLICY "admins_manage_marketplace_tags" ON public.marketplace_tags
  FOR ALL USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'superadmin'));

CREATE POLICY "admins_manage_tags" ON public.tags
  FOR ALL USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'superadmin'));

CREATE POLICY "admins_manage_skill_ontology" ON public.skill_ontology
  FOR ALL USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'superadmin'));

CREATE POLICY "admins_manage_category_siblings" ON public.category_siblings
  FOR ALL USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'superadmin'));


-- ────────────────────────────────────────────────────────────
-- Migration 13: Analytics RPCs
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_dau(days_back int DEFAULT 30)
RETURNS TABLE(day date, active_users bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
  SELECT DATE(created_at), COUNT(DISTINCT user_id)
  FROM user_events
  WHERE created_at >= CURRENT_DATE - (days_back || ' days')::interval
  GROUP BY DATE(created_at) ORDER BY 1 DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_top_events(days_back int DEFAULT 7, lim int DEFAULT 20)
RETURNS TABLE(event_name text, event_count bigint, unique_users bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
  SELECT ue.event_name, COUNT(*), COUNT(DISTINCT ue.user_id)
  FROM user_events ue
  WHERE ue.created_at >= CURRENT_DATE - (days_back || ' days')::interval
  GROUP BY ue.event_name ORDER BY 2 DESC LIMIT lim;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_signup_trend(days_back int DEFAULT 30)
RETURNS TABLE(day date, signups bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
  SELECT DATE(created_at), COUNT(*)
  FROM profiles
  WHERE created_at >= CURRENT_DATE - (days_back || ' days')::interval
  GROUP BY DATE(created_at) ORDER BY 1 DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_recent_errors(lim int DEFAULT 50)
RETURNS TABLE(id uuid, user_id uuid, error_name text, error_message text, stack_trace text,
              metadata jsonb, app_version text, platform text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
  SELECT e.id, e.user_id, e.error_name, e.error_message, e.stack_trace,
         e.metadata, e.app_version, e.platform, e.created_at
  FROM app_error_logs e ORDER BY e.created_at DESC LIMIT lim;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_error_summary(days_back int DEFAULT 7)
RETURNS TABLE(error_name text, occurrences bigint, affected_users bigint, latest timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
  SELECT e.error_name, COUNT(*), COUNT(DISTINCT e.user_id), MAX(e.created_at)
  FROM app_error_logs e
  WHERE e.created_at >= CURRENT_DATE - (days_back || ' days')::interval
  GROUP BY e.error_name ORDER BY 2 DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_perf_summary(days_back int DEFAULT 7)
RETURNS TABLE(endpoint text, avg_ms numeric, p95_ms numeric, total_calls bigint, error_rate numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
  SELECT p.endpoint,
         ROUND(AVG(p.duration_ms), 1),
         ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY p.duration_ms), 1),
         COUNT(*),
         ROUND(100.0 * COUNT(*) FILTER (WHERE p.success = false) / GREATEST(COUNT(*), 1), 2)
  FROM app_performance_logs p
  WHERE p.created_at >= CURRENT_DATE - (days_back || ' days')::interval
  GROUP BY p.endpoint ORDER BY 2 DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_search_analytics(days_back int DEFAULT 7)
RETURNS TABLE(day date, total_searches bigint, avg_results numeric, zero_result_pct numeric, avg_time_ms numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
  SELECT DATE(s.created_at),
         COUNT(*),
         ROUND(AVG(s.result_count), 1),
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.result_count = 0) / GREATEST(COUNT(*), 1), 2),
         ROUND(AVG(s.time_to_result_ms), 1)
  FROM search_logs s
  WHERE s.created_at >= CURRENT_DATE - (days_back || ' days')::interval
  GROUP BY DATE(s.created_at) ORDER BY 1 DESC;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- Migration 14: Audit Log View with Admin Names
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.admin_audit_logs_with_admin AS
SELECT aal.*, p.display_name AS admin_name, p.avatar_url AS admin_avatar
FROM admin_audit_logs aal
LEFT JOIN profiles p ON p.id = aal.admin_id;


-- ────────────────────────────────────────────────────────────
-- Migration 15: Self-Role Lookup (CRITICAL for admin panel auth)
-- Without this, users cannot discover their own role via the
-- Supabase client because user_roles RLS only allows superadmin.
-- ────────────────────────────────────────────────────────────

-- 15a: RPC to get current user's own role (bypasses RLS)
CREATE OR REPLACE FUNCTION public.admin_get_my_role()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _role text;
BEGIN
  SELECT role INTO _role
  FROM user_roles
  WHERE user_id = auth.uid();
  RETURN _role;
END;
$$;

-- 15b: Allow users to read their OWN role via direct query (fallback)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'users_read_own_role'
      AND tablename = 'user_roles'
  ) THEN
    EXECUTE 'CREATE POLICY "users_read_own_role" ON public.user_roles
      FOR SELECT USING (user_id = auth.uid())';
  END IF;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- Migration 16: Re-link intents to subcategories
-- Previously marketplace_category_intents had category_id.
-- Now we add subcategory_id so intents belong to subcategories.
-- Hierarchy: categories → subcategories → intents
-- ────────────────────────────────────────────────────────────

-- 16a: Add subcategory_id column to marketplace_category_intents
ALTER TABLE public.marketplace_category_intents
  ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES public.marketplace_subcategories(id) ON DELETE CASCADE;

-- 16b: Drop the old category_id column (intents no longer link to categories directly)
ALTER TABLE public.marketplace_category_intents
  DROP COLUMN IF EXISTS category_id;


-- ────────────────────────────────────────────────────────────
-- Migration 17: Onboarding — Tour + Profile-prompt state on profiles
-- Tour: track when a user starts/skips/completes the in-app guided tour
-- Profile prompts: track the nag system so we can throttle reminders
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tour_started_at        timestamptz,
  ADD COLUMN IF NOT EXISTS tour_completed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS tour_skipped_at        timestamptz,
  ADD COLUMN IF NOT EXISTS tour_last_step         text,
  ADD COLUMN IF NOT EXISTS profile_prompt_count          int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_prompt_last_shown_at  timestamptz,
  ADD COLUMN IF NOT EXISTS profile_prompt_snoozed_until  timestamptz,
  ADD COLUMN IF NOT EXISTS profile_prompt_dismissed      boolean NOT NULL DEFAULT false,
  -- Optional profile fields used by the completion score
  ADD COLUMN IF NOT EXISTS headline text,
  ADD COLUMN IF NOT EXISTS city     text,
  ADD COLUMN IF NOT EXISTS country  text,
  ADD COLUMN IF NOT EXISTS website  text;


-- ────────────────────────────────────────────────────────────
-- Migration 18: Admin Onboarding RPCs
-- Funnel + profile-completion buckets, used by the admin panel.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_onboarding_funnel(days_back int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  _since timestamptz := now() - (days_back || ' days')::interval;
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN jsonb_build_object(
    'window_days',        days_back,
    'signups',            (SELECT count(*) FROM profiles WHERE created_at >= _since),
    'tour_started',       (SELECT count(*) FROM profiles WHERE tour_started_at   >= _since),
    'tour_completed',     (SELECT count(*) FROM profiles WHERE tour_completed_at >= _since),
    'tour_skipped',       (SELECT count(*) FROM profiles WHERE tour_skipped_at   >= _since),
    'profile_complete',   (SELECT count(*) FROM profiles WHERE is_complete = true AND created_at >= _since),
    'has_offer',          (SELECT count(DISTINCT uo.user_id) FROM user_offers uo
                             JOIN profiles p ON p.id = uo.user_id
                             WHERE p.created_at >= _since AND uo.is_active = true),
    'has_want',           (SELECT count(DISTINCT uw.user_id) FROM user_wants uw
                             JOIN profiles p ON p.id = uw.user_id
                             WHERE p.created_at >= _since AND uw.is_active = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_profile_completion_buckets()
RETURNS TABLE(bucket text, user_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY
  WITH scored AS (
    SELECT id,
      (CASE WHEN coalesce(display_name,'') <> '' THEN 1 ELSE 0 END
     + CASE WHEN coalesce(username,'')     <> '' THEN 1 ELSE 0 END
     + CASE WHEN coalesce(bio,'')          <> '' THEN 1 ELSE 0 END
     + CASE WHEN coalesce(avatar_url,'')   <> '' THEN 1 ELSE 0 END
     + CASE WHEN coalesce(phone,'')        <> '' THEN 1 ELSE 0 END
     + CASE WHEN coalesce(headline,'')     <> '' THEN 1 ELSE 0 END
     + CASE WHEN coalesce(city,'')         <> '' THEN 1 ELSE 0 END
     + CASE WHEN coalesce(country,'')      <> '' THEN 1 ELSE 0 END
     + CASE WHEN EXISTS (SELECT 1 FROM user_offers uo WHERE uo.user_id = profiles.id AND uo.is_active) THEN 1 ELSE 0 END
     + CASE WHEN EXISTS (SELECT 1 FROM user_wants uw WHERE uw.user_id = profiles.id AND uw.is_active) THEN 1 ELSE 0 END
      ) AS score
    FROM profiles
  )
  SELECT
    CASE
      WHEN score = 0       THEN '0%'
      WHEN score <= 3      THEN '1-30%'
      WHEN score <= 6      THEN '31-60%'
      WHEN score <= 9      THEN '61-90%'
      ELSE '100%'
    END AS bucket,
    count(*)
  FROM scored
  GROUP BY 1
  ORDER BY MIN(score);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_recent_events(
  lim int DEFAULT 100,
  filter_name text DEFAULT NULL,
  filter_user uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid, user_id uuid, event_name text,
  metadata jsonb, app_version text, platform text, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY
  SELECT ue.id, ue.user_id, ue.event_name, ue.metadata, ue.app_version, ue.platform, ue.created_at
  FROM user_events ue
  WHERE (filter_name IS NULL OR ue.event_name = filter_name)
    AND (filter_user IS NULL OR ue.user_id = filter_user)
  ORDER BY ue.created_at DESC
  LIMIT lim;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- Migration 19: Index for event lookups (admin panel speed)
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS user_events_name_created_idx
  ON public.user_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS user_events_user_created_idx
  ON public.user_events (user_id, created_at DESC);


-- ────────────────────────────────────────────────────────────
-- Migration 20: OTA rollout RPCs
-- Stallion (primary) + expo-updates (fallback) both emit ota.*
-- events. These RPCs roll them up into per-version rollout health.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_ota_summary(days_back int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  _since timestamptz := now() - (days_back || ' days')::interval;
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN jsonb_build_object(
    'window_days',     days_back,
    'checks',          (SELECT count(*) FROM user_events WHERE event_name = 'ota.checked'    AND created_at >= _since),
    'available_seen',  (SELECT count(*) FROM user_events WHERE event_name = 'ota.available'  AND created_at >= _since),
    'downloaded',      (SELECT count(*) FROM user_events WHERE event_name = 'ota.downloaded' AND created_at >= _since),
    'applied',         (SELECT count(*) FROM user_events WHERE event_name = 'ota.applied'    AND created_at >= _since),
    'deferred',        (SELECT count(*) FROM user_events WHERE event_name = 'ota.deferred'   AND created_at >= _since),
    'failed',          (SELECT count(*) FROM user_events WHERE event_name = 'ota.failed'     AND created_at >= _since),
    'unique_users_applied', (
       SELECT count(DISTINCT user_id) FROM user_events
       WHERE event_name = 'ota.applied' AND created_at >= _since
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_ota_by_version(days_back int DEFAULT 30)
RETURNS TABLE(
  app_version text,
  applied bigint,
  available_seen bigint,
  failed bigint,
  unique_users bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  _since timestamptz := now() - (days_back || ' days')::interval;
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    coalesce(ue.app_version, 'unknown') AS app_version,
    count(*) FILTER (WHERE ue.event_name = 'ota.applied')    AS applied,
    count(*) FILTER (WHERE ue.event_name = 'ota.available')  AS available_seen,
    count(*) FILTER (WHERE ue.event_name = 'ota.failed')     AS failed,
    count(DISTINCT ue.user_id)                               AS unique_users
  FROM user_events ue
  WHERE ue.event_name IN ('ota.applied', 'ota.available', 'ota.failed')
    AND ue.created_at >= _since
  GROUP BY 1
  ORDER BY applied DESC, app_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_ota_failures(lim int DEFAULT 50)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  app_version text,
  platform text,
  stage text,
  error text,
  provider text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    ue.id,
    ue.user_id,
    ue.app_version,
    ue.platform,
    (ue.metadata ->> 'stage')    AS stage,
    (ue.metadata ->> 'error')    AS error,
    (ue.metadata ->> 'provider') AS provider,
    ue.created_at
  FROM user_events ue
  WHERE ue.event_name = 'ota.failed'
  ORDER BY ue.created_at DESC
  LIMIT lim;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- Migration 21: Push notifications + admin composer
-- Stores Expo push tokens per device and admin-composed broadcast
-- campaigns. The Edge Function `send-notification-campaign` picks up
-- 'pending' rows, resolves the audience to a token list, and fans out
-- to the Expo Push API in batches.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token        text NOT NULL,
  platform     text NOT NULL CHECK (platform IN ('ios','android','web')),
  device_id    text,
  app_version  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_id   ON public.user_push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_last_seen ON public.user_push_tokens(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by       uuid REFERENCES auth.users(id),
  title            text NOT NULL,
  body             text NOT NULL,
  audience         text NOT NULL DEFAULT 'all'
                     CHECK (audience IN ('all','approved','active_7d','active_30d','user_ids')),
  user_ids         uuid[],
  deep_link        text,
  data             jsonb,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','sending','sent','failed','cancelled')),
  scheduled_for    timestamptz,
  sent_at          timestamptz,
  recipients_count int NOT NULL DEFAULT 0,
  delivered_count  int NOT NULL DEFAULT 0,
  failed_count     int NOT NULL DEFAULT 0,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_status     ON public.notification_campaigns(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_campaigns_created_at ON public.notification_campaigns(created_at DESC);

ALTER TABLE public.user_push_tokens         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_campaigns   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own tokens"     ON public.user_push_tokens;
DROP POLICY IF EXISTS "Admins read all tokens"      ON public.user_push_tokens;
DROP POLICY IF EXISTS "Admins manage campaigns"     ON public.notification_campaigns;

CREATE POLICY "Users manage own tokens"
  ON public.user_push_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read all tokens"
  ON public.user_push_tokens FOR SELECT
  USING (get_user_role(auth.uid()) IN ('admin','superadmin','analyst'));

CREATE POLICY "Admins manage campaigns"
  ON public.notification_campaigns FOR ALL
  USING (get_user_role(auth.uid()) IN ('admin','superadmin'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','superadmin'));

-- App-side: idempotent token registration
CREATE OR REPLACE FUNCTION public.register_push_token(
  p_token       text,
  p_platform    text,
  p_device_id   text DEFAULT NULL,
  p_app_version text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.user_push_tokens (user_id, token, platform, device_id, app_version)
  VALUES (auth.uid(), p_token, p_platform, p_device_id, p_app_version)
  ON CONFLICT (user_id, token) DO UPDATE SET
    last_seen_at = now(),
    app_version  = COALESCE(EXCLUDED.app_version, public.user_push_tokens.app_version),
    device_id    = COALESCE(EXCLUDED.device_id,   public.user_push_tokens.device_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_push_token TO authenticated;

-- Admin: high-level stats for the Notifications page
CREATE OR REPLACE FUNCTION public.admin_get_notification_stats(days_back int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  _since timestamptz := now() - (days_back || ' days')::interval;
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin', 'analyst') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN jsonb_build_object(
    'window_days',         days_back,
    'campaigns_sent',      (SELECT count(*) FROM notification_campaigns WHERE status = 'sent'     AND created_at >= _since),
    'campaigns_pending',   (SELECT count(*) FROM notification_campaigns WHERE status IN ('pending','sending') AND created_at >= _since),
    'campaigns_failed',    (SELECT count(*) FROM notification_campaigns WHERE status = 'failed'   AND created_at >= _since),
    'total_delivered',     (SELECT coalesce(sum(delivered_count), 0) FROM notification_campaigns WHERE created_at >= _since),
    'total_failed',        (SELECT coalesce(sum(failed_count),    0) FROM notification_campaigns WHERE created_at >= _since),
    'active_tokens',       (SELECT count(*)           FROM user_push_tokens WHERE last_seen_at >= _since),
    'active_users',        (SELECT count(DISTINCT user_id) FROM user_push_tokens WHERE last_seen_at >= _since),
    'opens_in_window',     (SELECT count(*) FROM user_events WHERE event_name = 'push.opened'   AND created_at >= _since),
    'received_in_window',  (SELECT count(*) FROM user_events WHERE event_name = 'push.received' AND created_at >= _since)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_notification_stats TO authenticated;

-- Admin: list recent campaigns
CREATE OR REPLACE FUNCTION public.admin_get_notification_campaigns(lim int DEFAULT 50)
RETURNS SETOF notification_campaigns
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin', 'analyst') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT * FROM notification_campaigns
  ORDER BY created_at DESC
  LIMIT lim;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_notification_campaigns TO authenticated;

-- Admin: live count of recipients for a given audience target.
-- Drives the "Will reach N users" preview in the composer.
CREATE OR REPLACE FUNCTION public.admin_count_notification_audience(
  p_audience text,
  p_user_ids uuid[] DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_count int;
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin', 'analyst') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_audience = 'user_ids' THEN
    SELECT count(DISTINCT t.user_id) INTO v_count
    FROM user_push_tokens t
    WHERE t.user_id = ANY(p_user_ids);

  ELSIF p_audience = 'active_7d' THEN
    SELECT count(DISTINCT t.user_id) INTO v_count
    FROM user_push_tokens t
    WHERE EXISTS (
      SELECT 1 FROM user_events e
      WHERE e.user_id = t.user_id AND e.created_at > now() - interval '7 days'
    );

  ELSIF p_audience = 'active_30d' THEN
    SELECT count(DISTINCT t.user_id) INTO v_count
    FROM user_push_tokens t
    WHERE EXISTS (
      SELECT 1 FROM user_events e
      WHERE e.user_id = t.user_id AND e.created_at > now() - interval '30 days'
    );

  ELSIF p_audience = 'approved' THEN
    SELECT count(DISTINCT t.user_id) INTO v_count
    FROM user_push_tokens t
    JOIN profiles p ON p.id = t.user_id
    WHERE p.access_status = 'approved';

  ELSE -- 'all'
    SELECT count(DISTINCT user_id) INTO v_count FROM user_push_tokens;
  END IF;

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_count_notification_audience TO authenticated;

-- Admin: create a campaign row. The Edge Function picks it up by polling
-- 'pending' rows or you can invoke the function directly with the new id.
CREATE OR REPLACE FUNCTION public.admin_create_notification_campaign(
  p_title       text,
  p_body        text,
  p_audience    text DEFAULT 'all',
  p_user_ids    uuid[] DEFAULT NULL,
  p_deep_link   text DEFAULT NULL,
  p_data        jsonb DEFAULT NULL,
  p_scheduled_for timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF length(p_title) = 0 OR length(p_body) = 0 THEN
    RAISE EXCEPTION 'title and body are required';
  END IF;

  INSERT INTO public.notification_campaigns (
    created_by, title, body, audience, user_ids, deep_link, data, scheduled_for
  ) VALUES (
    auth.uid(), p_title, p_body, p_audience, p_user_ids, p_deep_link, p_data, p_scheduled_for
  ) RETURNING id INTO v_id;

  INSERT INTO public.admin_audit_logs (admin_id, action, entity, entity_id, metadata)
  VALUES (auth.uid(), 'create_notification_campaign', 'notification_campaigns', v_id,
          jsonb_build_object('audience', p_audience, 'title', p_title));

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_notification_campaign TO authenticated;

-- Admin: cancel a pending campaign before the worker picks it up.
CREATE OR REPLACE FUNCTION public.admin_cancel_notification_campaign(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.notification_campaigns
     SET status = 'cancelled'
   WHERE id = p_id
     AND status = 'pending';

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cancel_notification_campaign TO authenticated;


-- ============================================================
-- ✅ ALL 21 MIGRATIONS COMPLETE
-- Run on your self-hosted Supabase SQL editor or via psql
-- ============================================================
