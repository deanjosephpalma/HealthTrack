-- Atomically move a queue forward so all staff and patient screens share one state.
create or replace function public.advance_queue_status(
  p_queue_id uuid,
  p_status text
) returns setof public.queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.queue;
  v_candidate uuid;
  v_next uuid;
  v_changed uuid[] := array[]::uuid[];
begin
  if auth.uid() is null or coalesce(public.current_user_role(), '') not in ('Admin', 'Nurse', 'Doctor', 'BHW', 'Volunteer') then
    raise exception 'Only authorized staff can update the queue';
  end if;
  if lower(coalesce(p_status, '')) not in ('waiting', 'next', 'called', 'skipped', 'completed', 'done', 'cancelled') then
    raise exception 'Invalid queue status';
  end if;

  select * into v_current from public.queue where id = p_queue_id for update;
  if not found or v_current.archived_at is not null then
    raise exception 'Queue ticket no longer exists';
  end if;
  -- Serialize changes in one service counter, preventing two staff screens
  -- from calling different patients at the same time.
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_current.counter_room, ''), 0));

  update public.queue set status = lower(p_status), updated_at = now() where id = p_queue_id;
  v_changed := array_append(v_changed, p_queue_id);

  if lower(p_status) = 'called' then
    update public.queue
      set status = 'waiting', updated_at = now()
      where counter_room is not distinct from v_current.counter_room
        and id <> p_queue_id and archived_at is null and status = 'next';
    select id into v_next from public.queue
      where counter_room is not distinct from v_current.counter_room
        and id <> p_queue_id and archived_at is null and status = 'waiting'
      order by coalesce(is_priority, false) desc, created_at asc, id asc
      limit 1 for update;
    if v_next is not null then
      update public.queue set status = 'next', updated_at = now() where id = v_next;
      v_changed := array_append(v_changed, v_next);
    end if;
  elsif lower(p_status) in ('completed', 'done') and lower(v_current.status) = 'called' then
    update public.queue
      set status = 'waiting', updated_at = now()
      where counter_room is not distinct from v_current.counter_room
        and id <> p_queue_id and archived_at is null and status = 'next';
    select id into v_candidate from public.queue
      where counter_room is not distinct from v_current.counter_room
        and id <> p_queue_id and archived_at is null and status = 'waiting'
      order by coalesce(is_priority, false) desc, created_at asc, id asc
      limit 1 for update;
    if v_candidate is not null then
      update public.queue set status = 'called', updated_at = now() where id = v_candidate;
      v_changed := array_append(v_changed, v_candidate);
      select id into v_next from public.queue
        where counter_room is not distinct from v_current.counter_room
          and id <> p_queue_id and id <> v_candidate and archived_at is null and status = 'waiting'
        order by coalesce(is_priority, false) desc, created_at asc, id asc
        limit 1 for update;
      if v_next is not null then
        update public.queue set status = 'next', updated_at = now() where id = v_next;
        v_changed := array_append(v_changed, v_next);
      end if;
    end if;
  end if;

  -- Return the complete lane so every open staff screen can refresh each
  -- affected ticket, including a formerly marked Next ticket set back to Waiting.
  return query
    select * from public.queue
    where counter_room is not distinct from v_current.counter_room
      and archived_at is null;
end;
$$;

revoke all on function public.advance_queue_status(uuid, text) from public, anon;
grant execute on function public.advance_queue_status(uuid, text) to authenticated;
