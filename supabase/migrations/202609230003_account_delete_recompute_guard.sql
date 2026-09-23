-- Auth cascade deletes must not enqueue work referencing an account being removed.
create or replace function public.nava_enqueue_fdnb_recompute()
returns trigger language plpgsql security definer set search_path=public as $$
declare target_user uuid; target_date date;
begin
  target_user:=coalesce(new.user_id,old.user_id);
  target_date:=coalesce(new.record_date,old.record_date,current_date);
  if not exists(select 1 from auth.users where id=target_user) then return coalesce(new,old);end if;
  insert into public.fdnb_recompute_jobs(user_id,requested_date,source_table,status,updated_at,completed_at)
  values(target_user,target_date,TG_TABLE_NAME,'pending',now(),null)
  on conflict(user_id,requested_date) do update set source_table=excluded.source_table,status='pending',updated_at=now(),completed_at=null,last_error=null;
  return coalesce(new,old);
end $$;
