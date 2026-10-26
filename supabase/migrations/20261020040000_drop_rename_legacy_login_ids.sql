-- The one-shot D69 rename ran in 20260930000000. Current manager codes are any two letters or
-- digits with no prefix, so its pattern '^t[0-9]+(-[0-9]+)?$' now matches valid accounts
-- (manager t6, learner t61234) and a second call would rename them, or fail on a t-6 collision.
drop function if exists public.rename_legacy_login_ids();
