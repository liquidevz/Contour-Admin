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

CREATE POLICY "admins_manage_marketplace_tags" ON public.marketplace_tags
  FOR ALL USING (get_user_role(auth.uid()) IN ('admin', 'superadmin'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'superadmin'));

CREATE POLICY "admins_manage_category_intents" ON public.marketplace_category_intents
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


-- ============================================================
-- ✅ ALL 15 MIGRATIONS COMPLETE
-- Run on your self-hosted Supabase SQL editor or via psql
-- ============================================================
