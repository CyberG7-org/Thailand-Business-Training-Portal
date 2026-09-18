-- Hardening from the Supabase security advisor on the staging project (2026-09-18).
-- Supabase grants EXECUTE on new functions to anon/authenticated by default privilege, so
-- `revoke ... from public` alone leaves security-definer functions callable through
-- /rest/v1/rpc. Only is_admin() (used inside RLS policies) and set_my_preferred_language()
-- (called by signed-in learners) stay executable by signed-in users; nothing is callable
-- anonymously.

revoke execute on function public.compute_eligibility_snapshot(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.recompute_eligibility_snapshots(text) from public, anon, authenticated;
revoke execute on function public.finalize_attempt(uuid, integer, integer, text, jsonb) from public, anon, authenticated;
revoke execute on function public.claim_notifications(integer) from public, anon, authenticated;
revoke execute on function public.policy_int(text) from public, anon, authenticated;
revoke execute on function public.set_my_preferred_language(text) from anon;
revoke execute on function public.is_admin() from anon;

-- Trigger functions cannot be invoked through RPC in practice, but the grants are noise.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.sync_profile_role_from_app_metadata() from public, anon, authenticated;
revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.assignment_before_insert() from public, anon, authenticated;
revoke execute on function public.assignment_after_insert() from public, anon, authenticated;
revoke execute on function public.dbd_issue_date_changed() from public, anon, authenticated;
revoke execute on function public.questions_check_approval() from public, anon, authenticated;
revoke execute on function public.policy_config_after_update() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

alter function public.set_updated_at() set search_path = public;

-- Server-side code (service role) still needs the two helpers that had no explicit grant before.
grant execute on function public.compute_eligibility_snapshot(uuid, uuid, text) to service_role;
grant execute on function public.policy_int(text) to service_role;
