-- Apply with the chat migration, after explicit backend deployment approval.
-- Expired messages are already invisible in every RPC, even if cron is delayed.
begin;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('nava-miyou-retention','17 * * * *',
  $job$delete from public.miyou_messages where expires_at <= now();$job$);
commit;
