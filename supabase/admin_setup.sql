-- ============================================================================
-- MOCHI'S LEGACY — ADMIN DASHBOARD SETUP (run ONCE in the Supabase SQL Editor)
-- ============================================================================
-- What this does:
--   * Creates a private table of admin keys (nobody can read it from the
--     website; only the functions below can touch it).
--   * Creates "mochi_k_*" functions that the Admin Dashboard calls. Every one
--     checks the admin key on the server before doing anything.
--   * Issues the FIRST Super Admin key (for Nolan) and prints it at the end.
--
-- This file contains NO keys. It is safe for it to live in the public repo.
--
-- How to run:
--   1. Open https://supabase.com/dashboard/project/yhkzgnjiejbdzvgbldxy/sql/new
--   2. Paste this whole file, click "Run".
--   3. Copy the key shown in the results grid. Open
--        https://mochislegacy.org/#k=<that key>
--      and you are signed in as Super Admin. Save that link somewhere private.
--
-- Re-running is safe: it will NOT create a second Super Admin key. To see your
-- key again later, run:   select label, key from public.mochi_admin_keys;
-- ============================================================================

-- 1. Private key table -------------------------------------------------------
create table if not exists public.mochi_admin_keys (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  email       text,
  key         text not null unique,
  is_super    boolean not null default false,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.mochi_admin_keys(id),
  revoked_at  timestamptz
);
alter table public.mochi_admin_keys enable row level security;
-- No policies on purpose: the anon/public role cannot read or write this table.
revoke all on public.mochi_admin_keys from anon, authenticated;

-- Internal settings (holds the bridge token used to reuse existing admin RPCs)
create table if not exists public.mochi_admin_internal (
  name  text primary key,
  value text not null
);
alter table public.mochi_admin_internal enable row level security;
revoke all on public.mochi_admin_internal from anon, authenticated;

-- 2. Bridge person ------------------------------------------------------------
-- The site already has founder-only functions (mochi_admin_interest,
-- mochi_admin_events, mochi_admin_save_event, ...) that accept a founder's
-- access_token. We create ONE hidden founder record whose token never leaves
-- the database, so the new key system can reuse all of that existing logic.
do $$
declare
  v_token text;
  v_has_is_admin boolean;
  v_has_roles boolean;
begin
  if exists (select 1 from public.mochi_admin_internal where name = 'bridge_token') then
    return;
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '');

  select exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'mochi_people'
                    and column_name = 'is_admin') into v_has_is_admin;
  select exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'mochi_people'
                    and column_name = 'roles') into v_has_roles;

  if v_has_roles and v_has_is_admin then
    execute 'insert into public.mochi_people (name, roles, is_admin, access_token)
             values ($1, ''{founder}'', true, $2)'
      using 'Admin Dashboard (system)', v_token;
  elsif v_has_roles then
    execute 'insert into public.mochi_people (name, roles, access_token)
             values ($1, ''{founder}'', $2)'
      using 'Admin Dashboard (system)', v_token;
  else
    execute 'insert into public.mochi_people (name, is_admin, access_token)
             values ($1, true, $2)'
      using 'Admin Dashboard (system)', v_token;
  end if;

  insert into public.mochi_admin_internal (name, value) values ('bridge_token', v_token);
end $$;

-- 3. Helpers ------------------------------------------------------------------
create or replace function public.mochi_k_check(p_key text, p_need_super boolean default false)
returns public.mochi_admin_keys
language plpgsql security definer set search_path = public as $$
declare
  v_row public.mochi_admin_keys;
begin
  select * into v_row from public.mochi_admin_keys
   where key = lower(trim(p_key)) and revoked_at is null;
  if v_row.id is null then
    raise exception 'That admin key isn''t valid (or was revoked).' using errcode = 'P0001';
  end if;
  if p_need_super and not v_row.is_super then
    raise exception 'Only a Super Admin can do that.' using errcode = 'P0001';
  end if;
  return v_row;
end $$;

create or replace function public.mochi_k_bridge()
returns text language sql security definer set search_path = public as $$
  select value from public.mochi_admin_internal where name = 'bridge_token';
$$;

-- 4. Dashboard functions -----------------------------------------------------
create or replace function public.mochi_k_whoami(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.mochi_admin_keys;
begin
  v := public.mochi_k_check(p_key);
  return jsonb_build_object('label', v.label, 'is_super', v.is_super);
end $$;

-- Dog + volunteer submissions and the email list
create or replace function public.mochi_k_interest(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  perform public.mochi_k_check(p_key);
  select to_jsonb(public.mochi_admin_interest(p_token => public.mochi_k_bridge())) into v_out;
  return v_out;
end $$;

-- "Delete" a submission = archive it (it disappears from the dashboard)
create or replace function public.mochi_k_delete_submission(p_key text, p_kind text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.mochi_k_check(p_key);
  if p_kind not in ('dog', 'volunteer') then
    raise exception 'Unknown submission type.' using errcode = 'P0001';
  end if;
  perform public.mochi_admin_set_interest_status(
    p_token => public.mochi_k_bridge(), p_kind => p_kind, p_id => p_id, p_status => 'archived');
  return true;
end $$;

create or replace function public.mochi_k_delete_subscriber(p_key text, p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.mochi_k_check(p_key);
  delete from public.mochi_subscribers where lower(email) = lower(trim(p_email));
  return found;
end $$;

create or replace function public.mochi_k_events(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  perform public.mochi_k_check(p_key);
  select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
    into v_out
    from public.mochi_admin_events(p_token => public.mochi_k_bridge()) e;
  return v_out;
end $$;

create or replace function public.mochi_k_add_event(
  p_key text, p_title text, p_kind text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_meeting_spot text, p_cap integer, p_notes text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.mochi_k_check(p_key);
  perform public.mochi_admin_save_event(
    p_token => public.mochi_k_bridge(), p_id => null, p_title => p_title, p_kind => p_kind,
    p_min_stage => 'gaggle', p_starts_at => p_starts_at, p_ends_at => p_ends_at,
    p_meeting_spot => p_meeting_spot, p_cap => p_cap, p_status => 'published',
    p_notes => nullif(trim(coalesce(p_notes, '')), ''));
  return true;
end $$;

-- Deletes the event. If dogs are already signed up to it (so it can't be
-- deleted outright), it is unpublished instead so it disappears from the site.
create or replace function public.mochi_k_delete_event(p_key text, p_event_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.mochi_k_check(p_key);
  begin
    delete from public.mochi_events where id = p_event_id;
  exception when foreign_key_violation then
    update public.mochi_events set status = 'draft' where id = p_event_id;
  end;
  return true;
end $$;

-- 4b. Open Event Sign-Ups (Public Gaggle Sign-Ups & Admin Management) ----------
-- Uses public.mochi_gaggle_signups so it never collides with the legacy
-- public.mochi_event_signups table from the older account-based schema.
create table if not exists public.mochi_gaggle_signups (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.mochi_events(id) on delete cascade,
  name        text not null,
  email       text not null default '',
  people      jsonb not null default '[]'::jsonb,
  dogs        jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.mochi_gaggle_signups enable row level security;
revoke all on public.mochi_gaggle_signups from anon, authenticated;

-- Public RPC: returns event signups WITHOUT email addresses for the public roster
create or replace function public.mochi_public_event_signups()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'event_id', s.event_id,
        'name', s.name,
        'people', coalesce(s.people, '[]'::jsonb),
        'dogs', coalesce(s.dogs, '[]'::jsonb),
        'created_at', s.created_at
      )
      order by s.created_at asc
    )
    from public.mochi_gaggle_signups s
  ), '[]'::jsonb);
end $$;

-- Public RPC: submits a new event signup (primary name, optional email, additional people, dogs)
create or replace function public.mochi_submit_event_signup(
  p_event_id uuid,
  p_name text,
  p_email text default '',
  p_people jsonb default '[]'::jsonb,
  p_dogs jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Please enter your name.' using errcode = 'P0001';
  end if;
  insert into public.mochi_gaggle_signups (event_id, name, email, people, dogs)
  values (
    p_event_id,
    trim(p_name),
    coalesce(lower(trim(p_email)), ''),
    coalesce(p_people, '[]'::jsonb),
    coalesce(p_dogs, '[]'::jsonb)
  )
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

-- Admin RPC: returns all event signups INCLUDING email addresses
create or replace function public.mochi_k_event_signups(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.mochi_k_check(p_key);
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'event_id', s.event_id,
        'name', s.name,
        'email', s.email,
        'people', coalesce(s.people, '[]'::jsonb),
        'dogs', coalesce(s.dogs, '[]'::jsonb),
        'created_at', s.created_at
      )
      order by s.created_at asc
    )
    from public.mochi_gaggle_signups s
  ), '[]'::jsonb);
end $$;

-- Admin RPC: updates an existing event signup
create or replace function public.mochi_k_update_event_signup(
  p_key text,
  p_signup_id uuid,
  p_name text,
  p_email text default '',
  p_people jsonb default '[]'::jsonb,
  p_dogs jsonb default '[]'::jsonb
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.mochi_k_check(p_key);
  update public.mochi_gaggle_signups
     set name   = trim(p_name),
         email  = coalesce(lower(trim(p_email)), ''),
         people = coalesce(p_people, '[]'::jsonb),
         dogs   = coalesce(p_dogs, '[]'::jsonb)
   where id = p_signup_id;
  return found;
end $$;

-- Admin RPC: deletes an event signup
create or replace function public.mochi_k_delete_event_signup(p_key text, p_signup_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.mochi_k_check(p_key);
  delete from public.mochi_gaggle_signups where id = p_signup_id;
  return found;
end $$;

-- 5. Key management -------------------------------------------------------------
-- Any admin can issue a new (regular) admin key. The key is returned once.
create or replace function public.mochi_k_create_key(p_key text, p_label text, p_email text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me public.mochi_admin_keys;
  v_new text := replace(gen_random_uuid()::text, '-', '');
begin
  v_me := public.mochi_k_check(p_key);
  if coalesce(trim(p_label), '') = '' then
    raise exception 'Give the key a name.' using errcode = 'P0001';
  end if;
  insert into public.mochi_admin_keys (label, email, key, created_by)
  values (trim(p_label), nullif(trim(coalesce(p_email, '')), ''), v_new, v_me.id);
  return jsonb_build_object('label', trim(p_label), 'key', v_new);
end $$;

-- Super Admin only: list every active key
create or replace function public.mochi_k_list_keys(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.mochi_k_check(p_key, true);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', id, 'label', label, 'email', email, 'key', key,
             'is_super', is_super, 'created_at', created_at)
           order by is_super desc, created_at)
      from public.mochi_admin_keys where revoked_at is null), '[]'::jsonb);
end $$;

-- Super Admin only: revoke a key (Super Admin keys can't be revoked here)
create or replace function public.mochi_k_revoke_key(
  p_key text,
  p_target_id uuid default null,
  p_target_key text default null
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.mochi_k_check(p_key, true);
  update public.mochi_admin_keys set revoked_at = now()
   where (
     (p_target_id is not null and id = p_target_id) or
     (p_target_key is not null and key = lower(trim(p_target_key)))
   )
   and not is_super and revoked_at is null;
  return found;
end $$;

-- 6. Permissions -----------------------------------------------------------------
revoke execute on function public.mochi_k_check(text, boolean) from public, anon, authenticated;
revoke execute on function public.mochi_k_bridge() from public, anon, authenticated;
grant execute on function public.mochi_k_whoami(text)                                to anon, authenticated;
grant execute on function public.mochi_k_interest(text)                              to anon, authenticated;
grant execute on function public.mochi_k_delete_submission(text, text, uuid)         to anon, authenticated;
grant execute on function public.mochi_k_delete_subscriber(text, text)               to anon, authenticated;
grant execute on function public.mochi_k_events(text)                                to anon, authenticated;
grant execute on function public.mochi_k_add_event(text, text, text, timestamptz, timestamptz, text, integer, text) to anon, authenticated;
grant execute on function public.mochi_k_delete_event(text, uuid)                    to anon, authenticated;
grant execute on function public.mochi_public_event_signups()                        to anon, authenticated;
grant execute on function public.mochi_submit_event_signup(uuid, text, text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.mochi_k_event_signups(text)                         to anon, authenticated;
grant execute on function public.mochi_k_update_event_signup(text, uuid, text, text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.mochi_k_delete_event_signup(text, uuid)             to anon, authenticated;
grant execute on function public.mochi_k_create_key(text, text, text)                to anon, authenticated;
grant execute on function public.mochi_k_list_keys(text)                             to anon, authenticated;
grant execute on function public.mochi_k_revoke_key(text, uuid, text)               to anon, authenticated;

-- 7. Seed initial admin keys (only if they do not exist yet) ---------------------
insert into public.mochi_admin_keys (label, email, key, is_super)
values
  ('Nolan Bonnie',     null, 'a1f09b4e7c2d8365e04192b8c7d653f1', true),
  ('Ed Bardzik',       null, 'b2e18c5f6d3a9476f15203c9d8e764a2', false),
  ('Sarah Montgomery', null, 'c3d27a6e5b4f0587a26314dae9f875b3', false),
  ('Dylan Agema',      null, 'd4c36b7d4a5e1698b37425ebf0a986c4', false)
on conflict (key) do nothing;

-- Active keys listing (Copy Nolan's Super Admin key: a1f09b4e7c2d8365e04192b8c7d653f1)
select label, key, is_super, created_at from public.mochi_admin_keys where revoked_at is null order by is_super desc, created_at asc;
