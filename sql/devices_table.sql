-- Device-based (not user-based) note-visibility permission.
-- Deny-by-default. The anon key can NOT read or write the table directly:
-- it can only call device_check_in(), which registers/touches the caller's own
-- device and returns ONLY a boolean about that one device_id.
-- notes_visible can only be changed by an admin (Supabase dashboard / service role).

create table if not exists public.devices (
    id uuid primary key default gen_random_uuid(),
    device_id text not null unique,
    device_name text,
    notes_visible boolean not null default false,
    created_at timestamptz not null default now(),
    last_seen timestamptz not null default now()
);

alter table public.devices enable row level security;

-- Remove the old permissive policies if you ran the first version of this file
drop policy if exists "devices_select_own" on public.devices;
drop policy if exists "devices_insert_new_default_denied" on public.devices;
drop policy if exists "devices_update_last_seen_only" on public.devices;

-- No policies = anon/authenticated cannot touch the table directly.
revoke all on public.devices from anon, authenticated;

create or replace function public.device_check_in(
    p_device_id text,
    p_device_name text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_visible boolean;
begin
    -- malformed ids are denied
    if p_device_id is null or length(p_device_id) < 16 or length(p_device_id) > 64 then
        return false;
    end if;

    insert into public.devices (device_id, device_name)
    values (p_device_id, left(p_device_name, 64))
    on conflict (device_id) do update
        set last_seen = now(),
            device_name = coalesce(excluded.device_name, public.devices.device_name)
    returning notes_visible into v_visible;

    return coalesce(v_visible, false);
end;
$$;

revoke all on function public.device_check_in(text, text) from public;
grant execute on function public.device_check_in(text, text) to anon, authenticated;

-- ADMIN (run in the Supabase SQL editor, never from the website):
--   select device_id, device_name, last_seen, notes_visible from public.devices order by last_seen desc;
--   update public.devices set notes_visible = true  where device_id = '<id>';
--   update public.devices set notes_visible = false where device_id = '<id>';
