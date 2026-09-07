-- Allow unauthenticated (anon) users to call create_pending_verification.
-- The function is security definer so it runs as the DB owner — the grant
-- only controls who can invoke it, not what data it can access.
-- This is safe because the function only inserts a hashed code for the
-- supplied user_id; it never returns sensitive data from other rows.
grant execute on function public.create_pending_verification(uuid, text, text, integer) to anon;
grant execute on function public.create_pending_verification(uuid, text, text, integer) to authenticated;

-- Also ensure verify_pending_code is callable by both roles.
grant execute on function public.verify_pending_code(uuid, text, text) to anon;
grant execute on function public.verify_pending_code(uuid, text, text) to authenticated;
