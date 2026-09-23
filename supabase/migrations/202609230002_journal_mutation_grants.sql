-- Supabase's default privileges grant table DML; explicitly remove bypasses.
revoke insert, update on public.journal_entries from authenticated;
revoke all on public.journal_entries, public.journal_preferences, public.journal_ai_runs from anon;
