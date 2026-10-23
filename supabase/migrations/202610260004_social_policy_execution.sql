-- RLS invokes this boolean-only helper as the authenticated caller. The helper
-- derives identity from auth.uid() and never returns content or private records.
grant execute on function private.social_staff(uuid) to authenticated;
notify pgrst,'reload schema';
