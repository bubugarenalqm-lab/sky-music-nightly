-- Admin layer for Device Management. Run AFTER devices_table.sql.
-- Only users listed in public.admins can list devices or change permissions.

create table if not exists public.admins (
    user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_device_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

create or replace function public.admin_list_devices()
returns table (
    device_id text,
    device_name text,
    notes_visible boolean,
    created_at timestamptz,
    last_seen timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_device_admin() then
        raise exception 'not authorized' using errcode = '42501';
    end if;
    return query
        select d.device_id, d.device_name, d.notes_visible, d.created_at, d.last_seen
        from public.devices d
        order by d.last_seen desc;
end;
$$;

create or replace function public.admin_set_notes_visible(p_device_id text, p_visible boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_device_admin() then
        raise exception 'not authorized' using errcode = '42501';
    end if;
    update public.devices set notes_visible = coalesce(p_visible, false) where device_id = p_device_id;
end;
$$;

create or replace function public.admin_rename_device(p_device_id text, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_device_admin() then
        raise exception 'not authorized' using errcode = '42501';
    end if;
    update public.devices set device_name = left(p_name, 64) where device_id = p_device_id;
end;
$$;

create or replace function public.admin_delete_device(p_device_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_device_admin() then
        raise exception 'not authorized' using errcode = '42501';
    end if;
    delete from public.devices where device_id = p_device_id;
end;
$$;

revoke all on function public.is_device_admin() from public;
revoke all on function public.admin_list_devices() from public;
revoke all on function public.admin_set_notes_visible(text, boolean) from public;
revoke all on function public.admin_rename_device(text, text) from public;
revoke all on function public.admin_delete_device(text) from public;
grant execute on function public.is_device_admin() to authenticated;
grant execute on function public.admin_list_devices() to authenticated;
grant execute on function public.admin_set_notes_visible(text, boolean) to authenticated;
grant execute on function public.admin_rename_device(text, text) to authenticated;
grant execute on function public.admin_delete_device(text) to authenticated;

-- After creating your admin user in Authentication > Users, run (replace the email):
--   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
