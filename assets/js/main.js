/**
 * Mochi's Legacy — Main Interactive Script (Vanilla ES6+ JavaScript)
 * Zero-dependency script handling:
 *   1. Photo strip centering, pointer drag-scrolling, and keyboard navigation
 *   2. Dog filter pill switching
 *   3. View navigation (Home, Events, About, Admin) & #k=... magic links
 *   4. Native <dialog> modal controls & form submissions
 *   5. Button radial spotlight hover effect
 *   6. Dynamic Upcoming Events rendering (Home ticket & Events page)
 *   7. Admin Dashboard (Submissions, Events Manager, Email List BCC, & Super Admin Keys)
 */

(function () {
  "use strict";

  /* ==========================================================================
     0. Constants, Initial Admin Keys & Storage Helpers
     ========================================================================== */

  const SUPABASE_URL = "https://yhkzgnjiejbdzvgbldxy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_t4YsmzF7VrN_BdkKQKypqw_ut60FZFU";
  const DENVER_TZ = "America/Denver";

  const STORAGE_KEYS = {
    activeKey: "mochi-key",
    issuedKeys: "mochi-admin-issued-keys",
    revokedKeys: "mochi-admin-revoked-keys",
    localDogs: "mochi-local-dogs",
    localVolunteers: "mochi-local-volunteers",
    localSubscribers: "mochi-local-subscribers",
    localEvents: "mochi-local-events",
    localEventSignups: "mochi-local-event-signups",
    deletedIds: "mochi-admin-deleted-ids",
  };

  // Super Admin Key (Nolan Bonnie) & Initial Board Member Admin Keys
  const SUPER_ADMIN_KEY = "a1f09b4e7c2d8365e04192b8c7d653f1";

  const DEFAULT_ADMIN_KEYS = [
    {
      id: "key-nolan-super",
      name: "Nolan Bonnie",
      email: "",
      role: "super_admin",
      title: "Secretary · Super Admin",
      key: SUPER_ADMIN_KEY,
      created_at: "2026-10-22T00:00:00Z",
    },
    {
      id: "key-ed-admin",
      name: "Ed Bardzik",
      email: "",
      role: "admin",
      title: "President & Founder",
      key: "b2e18c5f6d3a9476f15203c9d8e764a2",
      created_at: "2026-10-22T00:00:00Z",
    },
    {
      id: "key-sarah-admin",
      name: "Sarah Montgomery",
      email: "",
      role: "admin",
      title: "Advisor",
      key: "c3d27a6e5b4f0587a26314dae9f875b3",
      created_at: "2026-10-22T00:00:00Z",
    },
    {
      id: "key-dylan-admin",
      name: "Dylan Agema",
      email: "",
      role: "admin",
      title: "Treasurer",
      key: "d4c36b7d4a5e1698b37425ebf0a986c4",
      created_at: "2026-10-22T00:00:00Z",
    },
  ];

  // One-time SQL setup script for activating keys inside Supabase Postgres
  const SUPABASE_SETUP_SQL = `-- ============================================================================
-- MOCHI'S LEGACY — ADMIN DASHBOARD SETUP (run ONCE in the Supabase SQL Editor)
-- ============================================================================
-- 1. Private key table
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
revoke all on public.mochi_admin_keys from anon, authenticated;

create table if not exists public.mochi_admin_internal (
  name  text primary key,
  value text not null
);
alter table public.mochi_admin_internal enable row level security;
revoke all on public.mochi_admin_internal from anon, authenticated;

-- 2. Bridge person
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

-- 3. Helpers
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

-- 4. Dashboard functions
create or replace function public.mochi_k_whoami(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.mochi_admin_keys;
begin
  v := public.mochi_k_check(p_key);
  return jsonb_build_object('label', v.label, 'is_super', v.is_super);
end $$;

create or replace function public.mochi_k_interest(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  perform public.mochi_k_check(p_key);
  select to_jsonb(public.mochi_admin_interest(p_token => public.mochi_k_bridge())) into v_out;
  return v_out;
end $$;

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

create or replace function public.mochi_k_update_event(
  p_key text, p_event_id uuid, p_title text, p_kind text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_meeting_spot text, p_cap integer, p_notes text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.mochi_k_check(p_key);
  update public.mochi_events
     set title        = trim(p_title),
         kind         = trim(p_kind),
         starts_at    = p_starts_at,
         ends_at      = p_ends_at,
         meeting_spot = trim(p_meeting_spot),
         cap          = p_cap,
         notes        = nullif(trim(coalesce(p_notes, '')), '')
   where id = p_event_id;
  return found;
end $$;

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

-- 4b. Open Event Sign-Ups (Public Gaggle Sign-Ups & Admin Management)
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

create or replace function public.mochi_k_delete_event_signup(p_key text, p_signup_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.mochi_k_check(p_key);
  delete from public.mochi_gaggle_signups where id = p_signup_id;
  return found;
end $$;

-- 5. Key management
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

-- 6. Permissions
revoke execute on function public.mochi_k_check(text, boolean) from public, anon, authenticated;
revoke execute on function public.mochi_k_bridge() from public, anon, authenticated;
grant execute on function public.mochi_k_whoami(text)                                to anon, authenticated;
grant execute on function public.mochi_k_interest(text)                              to anon, authenticated;
grant execute on function public.mochi_k_delete_submission(text, text, uuid)         to anon, authenticated;
grant execute on function public.mochi_k_delete_subscriber(text, text)               to anon, authenticated;
grant execute on function public.mochi_k_events(text)                                to anon, authenticated;
grant execute on function public.mochi_k_add_event(text, text, text, timestamptz, timestamptz, text, integer, text) to anon, authenticated;
grant execute on function public.mochi_k_update_event(text, uuid, text, text, timestamptz, timestamptz, text, integer, text) to anon, authenticated;
grant execute on function public.mochi_k_delete_event(text, uuid)                    to anon, authenticated;
grant execute on function public.mochi_public_event_signups()                        to anon, authenticated;
grant execute on function public.mochi_submit_event_signup(uuid, text, text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.mochi_k_event_signups(text)                         to anon, authenticated;
grant execute on function public.mochi_k_update_event_signup(text, uuid, text, text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.mochi_k_delete_event_signup(text, uuid)             to anon, authenticated;
grant execute on function public.mochi_k_create_key(text, text, text)                to anon, authenticated;
grant execute on function public.mochi_k_list_keys(text)                             to anon, authenticated;
grant execute on function public.mochi_k_revoke_key(text, uuid, text)               to anon, authenticated;

-- 7. Seed initial admin keys
insert into public.mochi_admin_keys (label, email, key, is_super)
values
  ('Nolan Bonnie',     null, 'a1f09b4e7c2d8365e04192b8c7d653f1', true),
  ('Ed Bardzik',       null, 'b2e18c5f6d3a9476f15203c9d8e764a2', false),
  ('Sarah Montgomery', null, 'c3d27a6e5b4f0587a26314dae9f875b3', false),
  ('Dylan Agema',      null, 'd4c36b7d4a5e1698b37425ebf0a986c4', false)
on conflict (key) do nothing;

select label, key, is_super, created_at from public.mochi_admin_keys where revoked_at is null order by is_super desc, created_at asc;`;

  function readJsonStorage(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJsonStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      // Ignore storage quota / privacy mode errors
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function generateHexKey(byteCount = 16) {
    const bytes = new Uint8Array(byteCount);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < byteCount; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function copyTextToClipboard(text, fallbackInputEl = null) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {
      // Fall back to input selection
    }
    try {
      const tempInput = fallbackInputEl || document.createElement("textarea");
      const isTemp = !fallbackInputEl;
      if (isTemp) {
        tempInput.value = text;
        tempInput.style.position = "fixed";
        tempInput.style.opacity = "0";
        document.body.appendChild(tempInput);
      }
      tempInput.focus();
      tempInput.select();
      const copied = document.execCommand("copy");
      if (isTemp) {
        document.body.removeChild(tempInput);
      }
      return copied;
    } catch (_) {
      return false;
    }
  }

  /* ==========================================================================
     1. Photo Strips Centering, Drag-Scrolling & Dog Filter Pills
     ========================================================================== */

  const photoStripControllers = new Map();

  function initPhotoStrip(stripEl) {
    if (!stripEl) return null;

    const listEl = stripEl.querySelector(".photo-strip-list");
    const dragState = {
      x: 0,
      left: 0,
      active: false,
      moved: false,
      pointerId: null,
      downTile: null,
    };

    function getVisibleTiles() {
      if (!listEl) return [];
      return Array.from(
        listEl.querySelectorAll(".photo-strip-tile:not([hidden])")
      );
    }

    function center() {
      if (stripEl.hidden || stripEl.offsetParent === null) return;
      const tiles = getVisibleTiles();
      if (tiles.length === 0) return;

      dragState.active = false;
      delete stripEl.dataset.dragging;

      const step =
        tiles.length > 1
          ? tiles[1].offsetLeft - tiles[0].offsetLeft
          : tiles[0].offsetWidth;
      const middleIndex = Math.floor(tiles.length / 2);
      stripEl.scrollLeft = middleIndex * step;
    }

    window.requestAnimationFrame(() => center());

    if ("ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(() => center());
      resizeObserver.observe(stripEl);
    } else {
      window.addEventListener("resize", center);
    }

    stripEl.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const tiles = getVisibleTiles();
      if (tiles.length < 2) return;
      const step = tiles[1].offsetLeft - tiles[0].offsetLeft;
      stripEl.scrollBy({
        left: event.key === "ArrowRight" ? step : -step,
      });
    });

    stripEl.addEventListener("dragstart", (event) => {
      event.preventDefault();
    });

    stripEl.addEventListener("pointerdown", (event) => {
      const targetEl =
        event.target instanceof Element ? event.target : null;
      dragState.downTile = targetEl
        ? targetEl.closest(".photo-strip-tile:not([hidden])")
        : null;

      if (event.pointerType === "mouse" && event.button === 0) {
        dragState.x = event.clientX;
        dragState.left = stripEl.scrollLeft;
        dragState.active = true;
        dragState.moved = false;
        dragState.pointerId = event.pointerId;
      }
    });

    stripEl.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse" || !dragState.active) return;
      const deltaX = event.clientX - dragState.x;
      if (!dragState.moved && Math.abs(deltaX) > 6) {
        dragState.moved = true;
        stripEl.dataset.dragging = "true";
        if (
          dragState.pointerId !== null &&
          typeof stripEl.setPointerCapture === "function"
        ) {
          try {
            stripEl.setPointerCapture(dragState.pointerId);
          } catch (_) {
            // Ignore if pointer is no longer active
          }
        }
      }
      if (dragState.moved) {
        stripEl.scrollLeft = dragState.left - deltaX;
      }
    });

    const endDrag = (event) => {
      dragState.active = false;
      delete stripEl.dataset.dragging;
      const pid =
        event && event.pointerId !== undefined
          ? event.pointerId
          : dragState.pointerId;
      if (
        pid !== null &&
        pid !== undefined &&
        stripEl.hasPointerCapture &&
        stripEl.hasPointerCapture(pid)
      ) {
        try {
          stripEl.releasePointerCapture(pid);
        } catch (_) {
          // Ignore release errors
        }
      }
      dragState.pointerId = null;
    };

    stripEl.addEventListener("pointerup", endDrag);
    stripEl.addEventListener("pointercancel", endDrag);
    stripEl.addEventListener("lostpointercapture", endDrag);
    stripEl.addEventListener(
      "click",
      (event) => {
        if (dragState.moved) {
          event.preventDefault();
          event.stopPropagation();
          dragState.moved = false;
          dragState.downTile = null;
        }
      },
      true
    );

    function resolveClickedTile(event) {
      const targetEl =
        event.target instanceof Element ? event.target : null;
      let tile = targetEl
        ? targetEl.closest(".photo-strip-tile:not([hidden])")
        : null;
      if (!tile && dragState.downTile && !dragState.downTile.hidden) {
        tile = dragState.downTile;
      }
      if (
        !tile &&
        typeof event.clientX === "number" &&
        typeof event.clientY === "number"
      ) {
        const hit = document.elementFromPoint(event.clientX, event.clientY);
        if (hit) {
          tile = hit.closest(".photo-strip-tile:not([hidden])");
        }
      }
      dragState.downTile = null;
      return tile && stripEl.contains(tile) ? tile : null;
    }

    const controller = {
      stripEl,
      listEl,
      center,
      getVisibleTiles,
      resolveClickedTile,
    };
    if (stripEl.id) {
      photoStripControllers.set(stripEl.id, controller);
    }
    return controller;
  }

  /* ==========================================================================
     1b. Full-Size Photo Gallery Lightbox
     ========================================================================== */

  const lightboxModal = document.getElementById("modal-lightbox");
  const lightboxImage = document.getElementById("lightbox-image");
  const lightboxCounter = document.getElementById("lightbox-counter");
  const lightboxPrevBtn = document.getElementById("lightbox-prev-btn");
  const lightboxNextBtn = document.getElementById("lightbox-next-btn");
  const lightboxCloseBtn = document.getElementById("lightbox-close-btn");

  const lightboxState = {
    items: [],
    index: 0,
  };

  function resolveFullSizeImageUrl(imgEl) {
    if (!imgEl) return "";
    const srcset = imgEl.getAttribute("srcset");
    if (srcset) {
      const candidates = srcset
        .split(",")
        .map((entry) => {
          const parts = entry.trim().split(/\s+/);
          const url = parts[0] || "";
          const widthMatch = /^(\d+)w$/.exec(parts[1] || "");
          const width = widthMatch ? Number(widthMatch[1]) : 0;
          return { url, width };
        })
        .filter((c) => Boolean(c.url))
        .sort((a, b) => b.width - a.width);
      if (candidates.length > 0) {
        return candidates[0].url;
      }
    }
    return imgEl.getAttribute("src") || imgEl.currentSrc || imgEl.src || "";
  }

  function renderLightboxSlide() {
    if (!lightboxImage || lightboxState.items.length === 0) return;
    const total = lightboxState.items.length;
    const currentIndex =
      ((lightboxState.index % total) + total) % total;
    lightboxState.index = currentIndex;
    const item = lightboxState.items[currentIndex];

    lightboxImage.src = item.src;
    lightboxImage.alt = item.alt || "Gallery photo";

    if (lightboxCounter) {
      lightboxCounter.textContent = `${currentIndex + 1} / ${total}`;
    }
    if (lightboxPrevBtn) {
      lightboxPrevBtn.hidden = total <= 1;
    }
    if (lightboxNextBtn) {
      lightboxNextBtn.hidden = total <= 1;
    }
  }

  function openLightbox(items, startIndex = 0) {
    if (!lightboxModal || !Array.isArray(items) || items.length === 0) return;
    lightboxState.items = items;
    lightboxState.index = startIndex;
    renderLightboxSlide();
    if (typeof lightboxModal.showModal === "function" && !lightboxModal.open) {
      lightboxModal.showModal();
    }
  }

  function stepLightbox(delta) {
    if (!lightboxModal || !lightboxModal.open) return;
    if (lightboxState.items.length <= 1) return;
    lightboxState.index =
      (lightboxState.index + delta + lightboxState.items.length) %
      lightboxState.items.length;
    renderLightboxSlide();
  }

  function closeLightbox() {
    if (lightboxModal && lightboxModal.open) {
      lightboxModal.close();
    }
  }

  if (lightboxPrevBtn) {
    lightboxPrevBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      stepLightbox(-1);
    });
  }

  if (lightboxNextBtn) {
    lightboxNextBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      stepLightbox(1);
    });
  }

  if (lightboxCloseBtn) {
    lightboxCloseBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      closeLightbox();
    });
  }

  if (lightboxModal) {
    lightboxModal.addEventListener("click", (event) => {
      const clickedInsideFigure = event.target.closest(".lightbox-figure");
      const clickedNavOrClose = event.target.closest(
        ".lightbox-nav-btn, .lightbox-close-btn"
      );
      if (!clickedInsideFigure && !clickedNavOrClose) {
        closeLightbox();
      }
    });
  }

  window.addEventListener("keydown", (event) => {
    if (!lightboxModal || !lightboxModal.open) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepLightbox(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      stepLightbox(1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeLightbox();
    }
  });

  // Initialize all photo strips on the page and attach click-to-magnify
  document.querySelectorAll(".photo-strip").forEach((el) => {
    const ctrl = initPhotoStrip(el);
    if (!ctrl) return;

    el.addEventListener("click", (event) => {
      const clickedTile = ctrl.resolveClickedTile(event);
      if (!clickedTile) return;

      const visibleTiles = ctrl.getVisibleTiles();
      const clickedIndex = visibleTiles.indexOf(clickedTile);
      if (clickedIndex === -1) return;

      const items = visibleTiles
        .map((tile) => {
          const img = tile.querySelector("img");
          if (!img) return null;
          return {
            src: resolveFullSizeImageUrl(img),
            alt: img.getAttribute("alt") || "",
          };
        })
        .filter(Boolean);

      if (items.length > 0) {
        openLightbox(items, clickedIndex);
      }
    });
  });

  const photoStrip = document.getElementById("photo-strip");
  const photoStripList = document.getElementById("photo-strip-list");
  const photoStripSoon = document.getElementById("photo-strip-soon");
  const photoStripDogName = document.getElementById("photo-strip-dog-name");
  const dogFilterRadios = document.querySelectorAll('input[name="landing-dog"]');

  function centerPhotoStrip(stripId = "photo-strip") {
    const ctrl = photoStripControllers.get(stripId);
    if (ctrl) {
      ctrl.center();
    }
  }

  function filterPhotosByDog(dogName) {
    dogFilterRadios.forEach((radio) => {
      const pill = radio.closest(".dog-filter-pill");
      const isSelected = radio.value === dogName;
      radio.checked = isSelected;
      if (pill) {
        pill.classList.toggle("is-active", isSelected);
      }
    });

    if (!photoStripList || !photoStrip || !photoStripSoon) return;

    const allTiles = photoStripList.querySelectorAll(".photo-strip-tile");
    let matchCount = 0;

    allTiles.forEach((tile) => {
      const matches = tile.dataset.dog === dogName;
      tile.hidden = !matches;
      if (matches) matchCount += 1;
    });

    if (matchCount > 0) {
      photoStrip.hidden = false;
      photoStripSoon.hidden = true;
      centerPhotoStrip();
    } else {
      photoStrip.hidden = true;
      photoStripSoon.hidden = false;
      if (photoStripDogName) {
        photoStripDogName.textContent = dogName;
      }
    }
  }

  dogFilterRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked) {
        filterPhotosByDog(radio.value);
      }
    });
  });

  /* ==========================================================================
     2. Date & Mountain Time Formatting Utilities
     ========================================================================== */

  function getDenverParts(dateInput, options = {}) {
    const date =
      typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    const parts = {};
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: DENVER_TZ,
      ...options,
    });
    for (const part of formatter.formatToParts(date)) {
      if (part.type !== "literal") {
        parts[part.type] = part.value;
      }
    }
    return parts;
  }

  function formatClock(dateInput) {
    const parts = getDenverParts(dateInput, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return {
      clock: `${parts.hour}:${parts.minute}`,
      period: (parts.dayPeriod || "").toUpperCase(),
    };
  }

  function formatEventWindow(startsAt, endsAt, includeWeekday = true) {
    try {
      const dayParts = getDenverParts(startsAt, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const start = formatClock(startsAt);
      const end = formatClock(endsAt);
      const timeRange =
        start.period === end.period
          ? `${start.clock}–${end.clock} ${end.period}`
          : `${start.clock} ${start.period}–${end.clock} ${end.period}`;
      const prefix = includeWeekday ? `${dayParts.weekday} ` : "";
      return `${prefix}${dayParts.month} ${dayParts.day} · ${timeRange}`;
    } catch (_) {
      return "";
    }
  }

  function formatEventBadge(startsAt) {
    try {
      const parts = getDenverParts(startsAt, {
        month: "short",
        day: "numeric",
      });
      return {
        month: (parts.month || "").toUpperCase(),
        day: parts.day || "",
      };
    } catch (_) {
      return { month: "TBD", day: "—" };
    }
  }

  function formatSubmittedDate(isoString) {
    if (!isoString) return "";
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: DENVER_TZ,
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(isoString));
    } catch (_) {
      return isoString;
    }
  }

  function denverOffsetMs(dateObj) {
    const parts = getDenverParts(dateObj, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const utcTimestamp = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    return utcTimestamp - dateObj.getTime();
  }

  function denverLocalToIso(dateStr, timeStr) {
    const [year, month, day] = dateStr.split("-").map(Number);
    const [hour, minute] = timeStr.split(":").map(Number);
    const approxUtc = Date.UTC(year, month - 1, day);
    let adjusted = approxUtc - denverOffsetMs(new Date(approxUtc));
    adjusted = approxUtc - denverOffsetMs(new Date(adjusted));
    return new Date(adjusted + (hour * 60 + minute) * 60000).toISOString();
  }

  function isoToDenverLocal(isoStr) {
    if (!isoStr) return { date: "", time: "" };
    try {
      const parts = getDenverParts(isoStr, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
      return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        time: `${parts.hour}:${parts.minute}`,
      };
    } catch (_) {
      return { date: "", time: "" };
    }
  }

  function parseMeetingSpot(rawSpot, explicitMapUrl = "") {
    const raw = String(rawSpot || "").trim();
    let spotName = raw;
    let customMapUrl = String(explicitMapUrl || "").trim();

    const sepIndex = raw.indexOf(" || ");
    if (sepIndex !== -1) {
      spotName = raw.slice(0, sepIndex).trim();
      const extractedUrl = raw.slice(sepIndex + 4).trim();
      if (!customMapUrl && extractedUrl) {
        customMapUrl = extractedUrl;
      }
    }

    const defaultSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${spotName} Boulder CO`
    )}`;

    return {
      spotName,
      customMapUrl,
      mapsUrl: customMapUrl || defaultSearchUrl,
    };
  }

  function formatMeetingSpotForSave(spotName, customMapUrl) {
    const cleanSpot = String(spotName || "").trim();
    const cleanUrl = String(customMapUrl || "").trim();
    if (cleanUrl) {
      return `${cleanSpot} || ${cleanUrl}`;
    }
    return cleanSpot;
  }

  function getDefaultUpcomingSaturday() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilSat = (6 - dayOfWeek + 7) % 7 || 7;
    const target = new Date(now.getTime() + daysUntilSat * 86400000);
    const parts = getDenverParts(target, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  /* ==========================================================================
     3. Supabase RPC Client
     ========================================================================== */

  async function callSupabaseRpc(fnName, payload = {}) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Profile": "public",
        },
        body: JSON.stringify(payload),
      });
      let data = null;
      try {
        data = await response.json();
      } catch (_) {
        data = null;
      }
      if (response.ok) {
        return { ok: true, data, message: "Thanks — we got it." };
      }
      return {
        ok: false,
        code: (data && data.code) || String(response.status),
        message:
          (data && data.message) ||
          "Unable to complete that request right now.",
      };
    } catch (_) {
      return {
        ok: false,
        code: "NETWORK_ERROR",
        message: "Couldn't reach the server. Check your connection.",
      };
    }
  }

  /* ==========================================================================
     4. Dynamic Public Events (Home Ticket & Events Page)
     ========================================================================== */

  const homeTicketsList = document.getElementById("home-tickets-list");
  const eventsListContainer = document.getElementById("events-list-container");
  const eventsEmptyCard = document.getElementById("events-empty-card");

  function getDeletedIdsSet() {
    return new Set(readJsonStorage(STORAGE_KEYS.deletedIds, []));
  }

  function markIdDeleted(id) {
    if (!id) return;
    const set = getDeletedIdsSet();
    set.add(String(id));
    writeJsonStorage(STORAGE_KEYS.deletedIds, Array.from(set));
  }

  function getEventSignature(ev) {
    if (!ev) return "";
    const title = String(ev.title || "").trim().toLowerCase();
    const startMs = Date.parse(ev.starts_at || "");
    const startKey = Number.isNaN(startMs)
      ? String(ev.starts_at || "")
      : String(startMs);
    return `${title}::${startKey}`;
  }

  function pruneSyncedLocalEvents(remoteEvents) {
    if (!Array.isArray(remoteEvents)) return [];
    const localEvents = readJsonStorage(STORAGE_KEYS.localEvents, []);
    if (localEvents.length === 0) return [];

    const remoteIds = new Set(remoteEvents.map((e) => String(e?.id || "")));
    const remoteSignatures = new Set(
      remoteEvents.map((e) => getEventSignature(e)).filter(Boolean)
    );

    const remaining = localEvents.filter((le) => {
      if (!le || !le.id) return false;
      const idStr = String(le.id);
      if (remoteIds.has(idStr)) return false;
      const sig = getEventSignature(le);
      if (sig && remoteSignatures.has(sig)) return false;
      // Clean up legacy synthetic evt-* entries once Supabase is active and responding
      if (idStr.startsWith("evt-")) return false;
      return true;
    });

    if (remaining.length !== localEvents.length) {
      writeJsonStorage(STORAGE_KEYS.localEvents, remaining);
    }
    return remaining;
  }

  async function fetchPublicUpcomingEvents() {
    const rpcRes = await callSupabaseRpc("mochi_upcoming_events", {});
    const remoteEvents =
      rpcRes.ok && Array.isArray(rpcRes.data) ? rpcRes.data : [];
    const localEvents = rpcRes.ok
      ? pruneSyncedLocalEvents(remoteEvents)
      : readJsonStorage(STORAGE_KEYS.localEvents, []);
    const deletedIds = getDeletedIdsSet();
    const nowMs = Date.now();

    const mergedMap = new Map();
    const seenSignatures = new Set();

    [...remoteEvents, ...localEvents].forEach((ev) => {
      if (!ev || !ev.id) return;
      const idStr = String(ev.id);
      if (deletedIds.has(idStr)) return;
      if (ev.notes === "[DELETED]") return;
      if (ev.status && ev.status !== "published") return;
      const endsMs = Date.parse(ev.ends_at || ev.starts_at);
      if (!Number.isNaN(endsMs) && endsMs < nowMs) return;

      const sig = getEventSignature(ev);
      if (mergedMap.has(idStr) || (sig && seenSignatures.has(sig))) return;

      mergedMap.set(idStr, ev);
      if (sig) seenSignatures.add(sig);
    });

    return Array.from(mergedMap.values()).sort((a, b) =>
      String(a.starts_at || "").localeCompare(String(b.starts_at || ""))
    );
  }

  const openEventSignupForms = new Set();

  function normalizeEventSignup(raw) {
    if (!raw || !raw.id || !raw.event_id) return null;
    const people = Array.isArray(raw.people)
      ? raw.people.map((p) => String(p || "").trim()).filter(Boolean)
      : [];
    const dogs = Array.isArray(raw.dogs)
      ? raw.dogs.map((d) => String(d || "").trim()).filter(Boolean)
      : [];
    return {
      id: String(raw.id),
      event_id: String(raw.event_id),
      name: String(raw.name || "").trim(),
      email: String(raw.email || "").trim().toLowerCase(),
      people,
      dogs,
      created_at: raw.created_at || null,
    };
  }

  async function fetchPublicEventSignups() {
    const rpcRes = await callSupabaseRpc("mochi_public_event_signups", {});
    const remoteRaw =
      rpcRes.ok && Array.isArray(rpcRes.data) ? rpcRes.data : [];
    const localRaw = readJsonStorage(STORAGE_KEYS.localEventSignups, []);
    const deletedIds = getDeletedIdsSet();

    const map = new Map();
    [...remoteRaw, ...localRaw].forEach((item) => {
      const norm = normalizeEventSignup(item);
      if (!norm) return;
      if (deletedIds.has(`signup:${norm.id}`) || deletedIds.has(norm.id)) {
        return;
      }
      const existing = map.get(norm.id);
      map.set(norm.id, {
        ...existing,
        ...norm,
        email: norm.email || existing?.email || "",
      });
    });

    return Array.from(map.values()).sort((a, b) =>
      String(a.created_at || "").localeCompare(String(b.created_at || ""))
    );
  }

  function buildDynamicSignupRowHtml(rowType, value = "") {
    if (rowType === "person") {
      return `
        <div class="event-dynamic-row" data-signup-row="person">
          <div class="event-dynamic-input-wrap">
            <span class="event-dynamic-row-badge">Additional Person</span>
            <input
              type="text"
              name="extraPerson"
              maxlength="80"
              value="${escapeHtml(value)}"
              placeholder="Name"
              required
              class="form-input"
            />
          </div>
          <button
            type="button"
            data-remove-signup-row="person"
            aria-label="Remove person"
            class="event-remove-row-btn"
          >
            Remove
          </button>
        </div>
      `;
    }

    return `
      <div class="event-dynamic-row" data-signup-row="dog">
        <div class="event-dynamic-input-wrap">
          <span class="event-dynamic-row-badge is-dog">🐾 Dog</span>
          <input
            type="text"
            name="dogName"
            maxlength="60"
            value="${escapeHtml(value)}"
            placeholder="Dog's Name"
            required
            class="form-input"
          />
        </div>
        <button
          type="button"
          data-remove-signup-row="dog"
          aria-label="Remove dog"
          class="event-remove-row-btn"
        >
          Remove
        </button>
      </div>
    `;
  }

  function syncFormDogDisclaimer(formEl) {
    if (!formEl) return;
    const disclaimer = formEl.querySelector("[data-dog-disclaimer]");
    if (!disclaimer) return;
    const dogRows = formEl.querySelectorAll('[data-signup-row="dog"]');
    disclaimer.hidden = dogRows.length === 0;
  }

  function renderPublicEvents(upcomingEvents, publicSignups = []) {
    // 1. Render Home Page Ticket(s)
    if (homeTicketsList) {
      const emptyTicket = homeTicketsList.querySelector(
        '[data-empty-ticket="true"]'
      );
      homeTicketsList
        .querySelectorAll('[data-dynamic-ticket="true"]')
        .forEach((el) => el.remove());

      const staticManualTickets = homeTicketsList.querySelectorAll(
        '.landing-ticket:not([data-empty-ticket="true"]):not([data-dynamic-ticket="true"])'
      );

      if (upcomingEvents.length > 0) {
        if (emptyTicket) emptyTicket.hidden = true;
        upcomingEvents.forEach((ev) => {
          const whenText = formatEventWindow(ev.starts_at, ev.ends_at, false);
          const { spotName } = parseMeetingSpot(ev.meeting_spot, ev.map_url);
          const ticket = document.createElement("div");
          ticket.className = "ticket landing-ticket";
          ticket.dataset.dynamicTicket = "true";
          ticket.innerHTML = `
            <div class="landing-ticket-detail">
              <p class="landing-event-kind"><span>${escapeHtml(ev.kind || "Gaggle walk")}</span></p>
              <h3 class="landing-event-title">${escapeHtml(ev.title)}</h3>
              <p class="landing-event-spot">${escapeHtml(spotName)}</p>
              <p class="landing-date">${escapeHtml(whenText)}</p>
            </div>
            <div class="landing-ticket-stub">
              <a href="#events" data-nav="events" class="landing-event-link">
                Event sign-ups
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12h14"></path>
                  <path d="m12 5 7 7-7 7"></path>
                </svg>
              </a>
            </div>
          `;
          homeTicketsList.appendChild(ticket);
        });
      } else if (emptyTicket) {
        emptyTicket.hidden = staticManualTickets.length > 0;
      }
    }

    // 2. Render Events Page (#view-events)
    if (eventsListContainer) {
      eventsListContainer.innerHTML = "";
      const staticEventCards = document.querySelectorAll(
        "#view-events > article.event-card"
      );

      if (upcomingEvents.length > 0) {
        if (eventsEmptyCard) eventsEmptyCard.hidden = true;
        upcomingEvents.forEach((ev) => {
          const eventIdStr = String(ev.id);
          const eventSignups = publicSignups.filter(
            (s) => String(s.event_id) === eventIdStr
          );

          let totalPeople = 0;
          let totalDogs = 0;
          eventSignups.forEach((s) => {
            totalPeople += 1 + (Array.isArray(s.people) ? s.people.length : 0);
            totalDogs += Array.isArray(s.dogs) ? s.dogs.length : 0;
          });

          const badge = formatEventBadge(ev.starts_at);
          const windowStr = formatEventWindow(ev.starts_at, ev.ends_at, true);
          const cap = Number(ev.cap) || 15;
          const confirmedDogs = Math.max(Number(ev.confirmed) || 0, totalDogs);
          const spotsOpen = Math.max(0, cap - confirmedDogs);
          const { spotName, mapsUrl } = parseMeetingSpot(
            ev.meeting_spot,
            ev.map_url
          );
          const isFormOpen = openEventSignupForms.has(eventIdStr);

          const rosterListHtml =
            eventSignups.length === 0
              ? `<p class="event-roster-empty">No one has signed up yet — be the first to join this walk!</p>`
              : `<ul class="event-roster-list" aria-label="People and dogs signed up for this event">
                  ${eventSignups
                    .map((s) => {
                      const allPeople = [s.name, ...(s.people || [])].filter(
                        Boolean
                      );
                      const allDogs = (s.dogs || []).filter(Boolean);
                      return `
                        <li class="event-roster-item">
                          <div class="event-roster-people">
                            <span class="event-roster-icon" aria-hidden="true">
                              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                                <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                              </svg>
                            </span>
                            <span class="event-roster-names">${escapeHtml(
                              allPeople.join(", ")
                            )}</span>
                          </div>
                          ${
                            allDogs.length > 0
                              ? `<div class="event-roster-dogs">
                                  ${allDogs
                                    .map(
                                      (dogName) =>
                                        `<span class="event-dog-chip">🐾 ${escapeHtml(
                                          dogName
                                        )}</span>`
                                    )
                                    .join("")}
                                </div>`
                              : ""
                          }
                        </li>
                      `;
                    })
                    .join("")}
                </ul>`;

          const article = document.createElement("article");
          article.className = "event-card";
          article.dataset.eventId = eventIdStr;
          article.innerHTML = `
            <div class="event-card-header">
              <div class="event-date-badge" aria-hidden="true">
                <span class="event-date-month">${escapeHtml(badge.month)}</span>
                <span class="event-date-day">${escapeHtml(badge.day)}</span>
              </div>
              <div class="event-card-info">
                <p class="event-card-kind">${escapeHtml(ev.kind || "Gaggle walk")}</p>
                <h3 class="event-card-title">${escapeHtml(ev.title)}</h3>
                <p class="event-card-time">${escapeHtml(windowStr)} (Mountain Time)</p>
              </div>
            </div>
            <div class="event-card-badges">
              <span class="event-kind-pill">${escapeHtml(ev.kind || "Gaggle walk")}</span>
              <span class="event-spots-pill">
                <span class="event-spots-dot" aria-hidden="true"></span>
                ${spotsOpen} of ${cap} dog spots open
              </span>
              <span class="event-attendance-pill">
                ${totalPeople} ${totalPeople === 1 ? "person" : "people"} · ${totalDogs} ${totalDogs === 1 ? "dog" : "dogs"} signed up
              </span>
            </div>
            <p class="event-card-spot">
              Meet at:
              <a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer" class="event-map-link">
                ${escapeHtml(spotName)} ↗
              </a>
            </p>
            ${
              ev.notes
                ? `<p class="event-card-notes">${escapeHtml(ev.notes)}</p>`
                : ""
            }

            <div class="event-gaggle-box">
              <div class="event-gaggle-welcome">
                <div class="event-gaggle-welcome-text">
                  <h4 class="event-gaggle-welcome-title">
                    Come walk with us — everyone is welcome!
                  </h4>
                  <p class="event-gaggle-welcome-sub">
                    Bring your Golden, bring friends &amp; family, or come solo just to enjoy the dogs. Sign up below so we know who’s joining!
                  </p>
                </div>
                <button
                  type="button"
                  data-toggle-event-signup="${escapeHtml(eventIdStr)}"
                  aria-expanded="${isFormOpen ? "true" : "false"}"
                  class="btn-ember-pill event-signup-trigger-btn"
                >
                  ${isFormOpen ? "Close sign-up form" : "Sign up for this walk"}
                </button>
              </div>

              <form
                class="event-signup-form"
                data-event-signup-form="${escapeHtml(eventIdStr)}"
                ${isFormOpen ? "" : "hidden"}
                novalidate
              >
                <div class="event-signup-form-header">
                  <h5 class="event-signup-form-title">
                    Sign up for ${escapeHtml(ev.title)}
                  </h5>
                  <p class="event-signup-form-hint">
                    Enter your name below, then use the buttons at the bottom to add anyone else or any dogs coming with you.
                  </p>
                </div>

                <div class="form-grid sm-2col">
                  <label>
                    <span class="form-label">Your name *</span>
                    <input
                      type="text"
                      name="primaryName"
                      required
                      maxlength="80"
                      class="form-input"
                    />
                  </label>
                  <label>
                    <span class="form-label">Your email <span class="form-label-optional">(optional)</span></span>
                    <input
                      type="email"
                      name="email"
                      maxlength="120"
                      class="form-input"
                    />
                  </label>
                </div>

                <div class="event-dynamic-rows-stack" data-extra-people-list></div>
                <div class="event-dynamic-rows-stack" data-extra-dogs-list></div>

                <div class="event-dog-disclaimer" data-dog-disclaimer hidden role="note">
                  <span class="event-dog-disclaimer-icon" aria-hidden="true">🐾</span>
                  <p class="event-dog-disclaimer-text">
                    <strong>Note for dog owners:</strong> We request that all dogs brought to a Gaggle are comfortable around other dogs and groups of people. If your dog is not kind to others, you will kindly be asked to separate from the walking group.
                  </p>
                </div>

                <div class="event-signup-add-bar">
                  <button
                    type="button"
                    data-add-person-row="true"
                    class="event-add-row-btn"
                  >
                    + Add a person
                  </button>
                  <button
                    type="button"
                    data-add-dog-row="true"
                    class="event-add-row-btn is-dog"
                  >
                    🐾 + Add a dog
                  </button>
                </div>

                <p class="admin-alert-error" data-signup-error hidden role="alert"></p>

                <div class="event-signup-submit-bar">
                  <button type="submit" class="btn-ember-pill event-submit-btn">
                    Complete Sign-Up
                  </button>
                  <button
                    type="button"
                    data-cancel-event-signup="${escapeHtml(eventIdStr)}"
                    class="admin-btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </form>

              <div class="event-roster-section">
                <div class="event-roster-header">
                  <h5 class="event-roster-title">Who’s signed up</h5>
                  <span class="event-roster-count">
                    ${totalPeople} ${totalPeople === 1 ? "person" : "people"}${
            totalDogs > 0
              ? ` · ${totalDogs} ${totalDogs === 1 ? "dog" : "dogs"}`
              : ""
          }
                  </span>
                </div>
                ${rosterListHtml}
              </div>
            </div>
          `;
          eventsListContainer.appendChild(article);
        });
      } else if (eventsEmptyCard) {
        eventsEmptyCard.hidden = staticEventCards.length > 0;
      }
    }
  }

  if (eventsListContainer) {
    eventsListContainer.addEventListener("click", (event) => {
      // 1. Toggle sign-up form open/closed
      const toggleBtn = event.target.closest("[data-toggle-event-signup]");
      if (toggleBtn) {
        const eventId = toggleBtn.dataset.toggleEventSignup;
        const card = toggleBtn.closest(".event-card");
        const form = card
          ? card.querySelector(`[data-event-signup-form="${CSS.escape(eventId)}"]`)
          : null;
        if (!form) return;
        const willOpen = form.hidden;
        form.hidden = !willOpen;
        toggleBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
        toggleBtn.textContent = willOpen
          ? "Close sign-up form"
          : "Sign up for this walk";
        if (willOpen) {
          openEventSignupForms.add(String(eventId));
          const firstInput = form.querySelector('input[name="primaryName"]');
          if (firstInput) firstInput.focus();
        } else {
          openEventSignupForms.delete(String(eventId));
        }
        return;
      }

      // 2. Cancel sign-up form
      const cancelBtn = event.target.closest("[data-cancel-event-signup]");
      if (cancelBtn) {
        const eventId = cancelBtn.dataset.cancelEventSignup;
        const form = cancelBtn.closest("[data-event-signup-form]");
        const card = cancelBtn.closest(".event-card");
        if (form) {
          form.reset();
          const peopleList = form.querySelector("[data-extra-people-list]");
          const dogsList = form.querySelector("[data-extra-dogs-list]");
          if (peopleList) peopleList.innerHTML = "";
          if (dogsList) dogsList.innerHTML = "";
          syncFormDogDisclaimer(form);
          const errEl = form.querySelector("[data-signup-error]");
          if (errEl) errEl.hidden = true;
          form.hidden = true;
        }
        openEventSignupForms.delete(String(eventId));
        const triggerBtn = card
          ? card.querySelector("[data-toggle-event-signup]")
          : null;
        if (triggerBtn) {
          triggerBtn.setAttribute("aria-expanded", "false");
          triggerBtn.textContent = "Sign up for this walk";
        }
        return;
      }

      // 3. Add a person row
      const addPersonBtn = event.target.closest("[data-add-person-row]");
      if (addPersonBtn) {
        const form = addPersonBtn.closest("form");
        const container = form
          ? form.querySelector("[data-extra-people-list]")
          : null;
        if (container) {
          container.insertAdjacentHTML(
            "beforeend",
            buildDynamicSignupRowHtml("person")
          );
          const inputs = container.querySelectorAll(
            'input[name="extraPerson"]'
          );
          const lastInput = inputs[inputs.length - 1];
          if (lastInput) lastInput.focus();
        }
        return;
      }

      // 4. Add a dog row
      const addDogBtn = event.target.closest("[data-add-dog-row]");
      if (addDogBtn) {
        const form = addDogBtn.closest("form");
        const container = form
          ? form.querySelector("[data-extra-dogs-list]")
          : null;
        if (container && form) {
          container.insertAdjacentHTML(
            "beforeend",
            buildDynamicSignupRowHtml("dog")
          );
          syncFormDogDisclaimer(form);
          const inputs = container.querySelectorAll('input[name="dogName"]');
          const lastInput = inputs[inputs.length - 1];
          if (lastInput) lastInput.focus();
        }
        return;
      }

      // 5. Remove a person or dog row
      const removeRowBtn = event.target.closest("[data-remove-signup-row]");
      if (removeRowBtn) {
        const form = removeRowBtn.closest("form");
        const row = removeRowBtn.closest("[data-signup-row]");
        if (row) row.remove();
        if (form) syncFormDogDisclaimer(form);
      }
    });

    eventsListContainer.addEventListener("submit", async (event) => {
      const form = event.target.closest("[data-event-signup-form]");
      if (!form) return;
      event.preventDefault();

      const eventId = form.dataset.eventSignupForm;
      const errEl = form.querySelector("[data-signup-error]");
      if (errEl) errEl.hidden = true;

      const primaryNameInput = form.querySelector('input[name="primaryName"]');
      const emailInput = form.querySelector('input[name="email"]');
      const primaryName = String(primaryNameInput?.value || "").trim();
      const email = String(emailInput?.value || "").trim().toLowerCase();

      const extraPeopleInputs = Array.from(
        form.querySelectorAll('input[name="extraPerson"]')
      );
      const dogInputs = Array.from(
        form.querySelectorAll('input[name="dogName"]')
      );

      const extraPeople = extraPeopleInputs
        .map((inp) => String(inp.value || "").trim())
        .filter(Boolean);
      const dogs = dogInputs
        .map((inp) => String(inp.value || "").trim())
        .filter(Boolean);

      if (!primaryName) {
        if (errEl) {
          errEl.textContent = "Please enter your name.";
          errEl.hidden = false;
        }
        return;
      }

      if (email && !email.includes("@")) {
        if (errEl) {
          errEl.textContent =
            "Please enter a valid email address (or leave it blank).";
          errEl.hidden = false;
        }
        return;
      }

      if (extraPeople.length !== extraPeopleInputs.length) {
        if (errEl) {
          errEl.textContent =
            "Please fill in the name for each added person (or remove blank rows).";
          errEl.hidden = false;
        }
        return;
      }

      if (dogs.length !== dogInputs.length) {
        if (errEl) {
          errEl.textContent =
            "Please fill in the name for each added dog (or remove blank rows).";
          errEl.hidden = false;
        }
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Signing up…";
      }

      const rpcRes = await callSupabaseRpc("mochi_submit_event_signup", {
        p_event_id: eventId,
        p_name: primaryName,
        p_email: email,
        p_people: extraPeople,
        p_dogs: dogs,
      });

      const newId =
        rpcRes.ok && rpcRes.data && rpcRes.data.id
          ? String(rpcRes.data.id)
          : `signup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const localSignups = readJsonStorage(STORAGE_KEYS.localEventSignups, []);
      localSignups.push({
        id: newId,
        event_id: String(eventId),
        name: primaryName,
        email,
        people: extraPeople,
        dogs,
        created_at: new Date().toISOString(),
      });
      writeJsonStorage(STORAGE_KEYS.localEventSignups, localSignups);

      openEventSignupForms.delete(String(eventId));
      await refreshPublicEvents();
      if (adminState.activeKey) {
        await loadAllAdminData();
      }
      showAdminToast("You're signed up! See you at the walk.");
    });
  }

  async function refreshPublicEvents() {
    const [upcoming, publicSignups] = await Promise.all([
      fetchPublicUpcomingEvents(),
      fetchPublicEventSignups(),
    ]);
    renderPublicEvents(upcoming, publicSignups);
  }

  refreshPublicEvents();

  /* ==========================================================================
     5. View Navigation (Home, Events, About, Admin) & #k=... Magic Links
     ========================================================================== */

  const views = {
    home: document.getElementById("view-home"),
    events: document.getElementById("view-events"),
    about: document.getElementById("view-about"),
    team: document.getElementById("view-board"),
    admin: document.getElementById("view-admin"),
  };

  function extractAdminKeyFromInput(rawInput) {
    const trimmed = String(rawInput || "").trim();
    const hashMatch = /(?:^|[#?&])k=([0-9a-fA-F]{32})(?:&|$)/.exec(trimmed);
    if (hashMatch) {
      return hashMatch[1].toLowerCase();
    }
    if (/^[0-9a-fA-F]{32}$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    return null;
  }

  function showView(viewName, pushHash = false) {
    const normalizedView = viewName === "board" ? "team" : viewName;
    const targetView = views[normalizedView] ? normalizedView : "home";

    Object.entries(views).forEach(([key, section]) => {
      if (!section) return;
      section.hidden = key !== targetView;
    });

    const footer = document.querySelector("footer");
    if (footer) {
      footer.hidden = targetView === "events" || targetView === "admin";
    }

    // Update header navigation active indicator (including the 4th slot Admin link)
    const headerNavLinks = document.querySelectorAll(
      ".site-navigation a[data-nav]"
    );
    headerNavLinks.forEach((link) => {
      if (link.dataset.nav === targetView) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    if (pushHash) {
      const newHash = targetView === "home" ? "#home" : `#${targetView}`;
      if (window.location.hash !== newHash) {
        history.pushState(null, "", newHash);
      }
      window.scrollTo(0, 0);
    }

    if (targetView === "home") {
      centerPhotoStrip("photo-strip");
      refreshPublicEvents();
    } else if (targetView === "about") {
      centerPhotoStrip("about-photo-strip");
    } else if (targetView === "events") {
      centerPhotoStrip("events-past-photo-strip");
      refreshPublicEvents();
    } else if (targetView === "admin") {
      initOrRenderAdminView();
    }
  }

  document.addEventListener("click", (event) => {
    const navLink = event.target.closest("[data-nav]");
    if (!navLink) return;
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    showView(navLink.dataset.nav, true);
  });

  function syncViewFromLocation() {
    const rawHash = window.location.hash || "";

    // Check for #k=<32-char-hex-key> magic link
    const keyFromHash = extractAdminKeyFromInput(rawHash);
    if (keyFromHash) {
      try {
        window.localStorage.setItem(STORAGE_KEYS.activeKey, keyFromHash);
      } catch (_) {
        // Ignore storage errors
      }
      history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#admin`
      );
      showView("admin", false);
      return;
    }

    const hash = rawHash.replace(/^#/, "").toLowerCase();
    if (hash === "events" || hash === "schedule") {
      showView("events", false);
    } else if (hash === "about") {
      showView("about", false);
    } else if (
      hash === "team" ||
      hash === "our-team" ||
      hash === "board" ||
      hash === "our-board"
    ) {
      showView("team", false);
    } else if (hash === "admin" || hash === "checkin") {
      showView("admin", false);
    } else {
      showView("home", false);
    }
  }

  window.addEventListener("popstate", syncViewFromLocation);
  window.addEventListener("hashchange", syncViewFromLocation);

  /* ==========================================================================
     6. Native <dialog> Modals & Public Form Submissions
     ========================================================================== */

  function openModalById(modalId) {
    const dialog = document.getElementById(modalId);
    if (!dialog || typeof dialog.showModal !== "function") return;
    if (!dialog.open) {
      dialog.showModal();
      const firstInput = dialog.querySelector("input, textarea, select");
      if (firstInput) firstInput.focus();
    }
  }

  document.querySelectorAll("[data-open-modal]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      openModalById(trigger.dataset.openModal);
    });
  });

  document.querySelectorAll("dialog.signup-modal").forEach((dialog) => {
    dialog.querySelectorAll("[data-close-modal]").forEach((closeBtn) => {
      closeBtn.addEventListener("click", () => dialog.close());
    });

    dialog.addEventListener("mousedown", (event) => {
      if (event.target === dialog) {
        dialog.close();
      }
    });
  });

  // Audience Button Radial Spotlight Effect (.btn-dog)
  document.querySelectorAll(".btn-dog").forEach((button) => {
    button.addEventListener("pointermove", (event) => {
      const rect = button.getBoundingClientRect();
      button.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      button.style.setProperty("--my", `${event.clientY - rect.top}px`);
    });

    button.addEventListener("pointerleave", () => {
      button.style.removeProperty("--mx");
      button.style.removeProperty("--my");
    });
  });

  // Newsletter ("Keep me posted") submission
  const newsletterForm = document.getElementById("newsletter-form");
  const newsletterStatus = document.getElementById("newsletter-status");

  if (newsletterForm && newsletterStatus) {
    newsletterForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(newsletterForm);
      const name = String(formData.get("name") || "").trim();
      const email = String(formData.get("email") || "").trim();
      if (!name || !email) return;

      const submitBtn = newsletterForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      newsletterStatus.hidden = true;

      const result = await callSupabaseRpc("mochi_subscribe", {
        p_email: email,
        p_name: name,
      });

      // Mirror in local storage so Admin Email List always reflects latest signups immediately
      const localSubs = readJsonStorage(STORAGE_KEYS.localSubscribers, []);
      const filtered = localSubs.filter(
        (s) => String(s.email || "").toLowerCase() !== email.toLowerCase()
      );
      filtered.unshift({
        id: `sub-${Date.now()}`,
        name,
        email,
        created_at: new Date().toISOString(),
      });
      writeJsonStorage(STORAGE_KEYS.localSubscribers, filtered);

      newsletterStatus.textContent = result.ok
        ? result.message
        : "Thanks — we got it.";
      newsletterStatus.hidden = false;
      if (submitBtn) submitBtn.disabled = false;
      newsletterForm.reset();
    });
  }

  // Dog & Volunteer modal form handlers
  function attachModalFormHandler(
    formId,
    modalId,
    rpcName,
    storageKey,
    buildPayload,
    buildLocalRecord
  ) {
    const form = document.getElementById(formId);
    const dialog = document.getElementById(modalId);
    if (!form || !dialog) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const submitBtn = dialog.querySelector(
        `button[type="submit"][form="${formId}"]`
      );
      const originalLabel = submitBtn ? submitBtn.textContent : "";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending…";
      }

      const payload = buildPayload(formData);
      const rpcRes = await callSupabaseRpc(rpcName, payload);

      const localItems = readJsonStorage(storageKey, []);
      const newId =
        rpcRes.ok && typeof rpcRes.data === "string"
          ? rpcRes.data
          : `local-${Date.now()}`;
      localItems.unshift(buildLocalRecord(formData, newId));
      writeJsonStorage(storageKey, localItems);

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
      form.reset();
      dialog.close();
      showAdminToast("Thanks! Your submission has been received.");
    });
  }

  attachModalFormHandler(
    "form-dog",
    "modal-dog",
    "mochi_submit_dog_signup",
    STORAGE_KEYS.localDogs,
    (fd) => ({
      p_owner_name: String(fd.get("ownerName") || "").trim(),
      p_email: String(fd.get("email") || "").trim(),
      p_phone: null,
      p_dog_name: String(fd.get("dogName") || "").trim(),
      p_breed: String(fd.get("breed") || "").trim(),
      p_age: String(fd.get("age") || "").trim(),
      p_city: String(fd.get("city") || "").trim(),
      p_notes: String(fd.get("notes") || "").trim() || null,
    }),
    (fd, id) => ({
      id,
      owner_name: String(fd.get("ownerName") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      phone: null,
      dog_name: String(fd.get("dogName") || "").trim(),
      breed: String(fd.get("breed") || "").trim(),
      age: String(fd.get("age") || "").trim(),
      city: String(fd.get("city") || "").trim(),
      notes: String(fd.get("notes") || "").trim() || null,
      status: "new",
      created_at: new Date().toISOString(),
    })
  );

  attachModalFormHandler(
    "form-volunteer",
    "modal-volunteer",
    "mochi_submit_volunteer",
    STORAGE_KEYS.localVolunteers,
    (fd) => ({
      p_name: String(fd.get("name") || "").trim(),
      p_email: String(fd.get("email") || "").trim(),
      p_phone: null,
      p_skills: fd.getAll("skills").map(String),
      p_interests: String(fd.get("interests") || "").trim() || null,
      p_availability: null,
    }),
    (fd, id) => ({
      id,
      name: String(fd.get("name") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      phone: null,
      skills: fd.getAll("skills").map(String),
      interests: String(fd.get("interests") || "").trim() || null,
      availability: null,
      status: "new",
      created_at: new Date().toISOString(),
    })
  );

  /* ==========================================================================
     7. Admin Dashboard Logic
     ========================================================================== */

  const adminGate = document.getElementById("admin-gate");
  const adminDashboard = document.getElementById("admin-dashboard");
  const adminLoginForm = document.getElementById("admin-login-form");
  const adminKeyInput = document.getElementById("admin-key-input");
  const adminKeyToggleVis = document.getElementById("admin-key-toggle-vis");
  const adminGateError = document.getElementById("admin-gate-error");
  const adminRolePill = document.getElementById("admin-role-pill");
  const adminWelcomeText = document.getElementById("admin-welcome-text");
  const adminRefreshBtn = document.getElementById("admin-refresh-btn");
  const adminLogoutBtn = document.getElementById("admin-logout-btn");
  const adminSetupBanner = document.getElementById(
    "admin-supabase-setup-banner"
  );
  const adminCopySqlBtn = document.getElementById("admin-copy-sql-btn");
  const adminRetrySupabaseBtn = document.getElementById(
    "admin-retry-supabase-btn"
  );

  // Toast elements
  const adminToast = document.getElementById("admin-toast");
  const adminToastText = document.getElementById("admin-toast-text");
  let toastTimer = null;

  function showAdminToast(message) {
    if (!adminToast || !adminToastText) return;
    window.clearTimeout(toastTimer);
    adminToastText.textContent = message;
    adminToast.hidden = false;
    toastTimer = window.setTimeout(() => {
      adminToast.hidden = true;
    }, 4000);
  }

  // Admin State
  const adminState = {
    activeKey: null,
    adminProfile: null,
    isSuperAdmin: false,
    activeTab: "submissions",
    submissionFilter: "all",
    confirmTarget: null, // { type: 'dog'|'volunteer'|'event'|'event_signup'|'subscriber'|'key', id: string }
    editingSignupId: null,
    editingEventId: null,
    dogs: [],
    volunteers: [],
    subscribers: [],
    events: [],
    eventSignups: [],
    keys: [],
    supabaseNeedsSetup: false,
  };

  function getRevokedKeysSet() {
    return new Set(
      readJsonStorage(STORAGE_KEYS.revokedKeys, []).map((k) =>
        String(k).toLowerCase()
      )
    );
  }

  function getAllLocalKnownKeys() {
    const customKeys = readJsonStorage(STORAGE_KEYS.issuedKeys, []);
    const revoked = getRevokedKeysSet();
    const map = new Map();

    [...DEFAULT_ADMIN_KEYS, ...customKeys].forEach((item) => {
      if (!item || !item.key) return;
      const k = String(item.key).toLowerCase();
      if (revoked.has(k)) return;
      map.set(k, {
        ...item,
        key: k,
        role: k === SUPER_ADMIN_KEY ? "super_admin" : item.role || "admin",
      });
    });

    return Array.from(map.values());
  }

  function buildAdminMagicLink(key) {
    const base = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    return `${base}#k=${key}`;
  }

  async function resolveAdminKey(rawKey) {
    const cleanKey = extractAdminKeyFromInput(rawKey);
    if (!cleanKey) {
      return {
        ok: false,
        message:
          "Please enter a valid 32-character hex admin key (or paste your full #k=… link).",
      };
    }

    const revoked = getRevokedKeysSet();
    if (revoked.has(cleanKey)) {
      return {
        ok: false,
        message: "This admin key has been revoked by the Super Admin.",
      };
    }

    const knownKeys = getAllLocalKnownKeys();
    const matchedLocal = knownKeys.find((item) => item.key === cleanKey);

    // 1. Check Supabase mochi_k_whoami (preferred secure RPC)
    const whoRes = await callSupabaseRpc("mochi_k_whoami", { p_key: cleanKey });
    if (whoRes.ok && whoRes.data) {
      const isSuper = Boolean(
        whoRes.data.is_super || cleanKey === SUPER_ADMIN_KEY
      );
      return {
        ok: true,
        key: cleanKey,
        isSuper,
        profile: {
          name: whoRes.data.label || matchedLocal?.name || "Admin",
          email: matchedLocal?.email || "",
          role: isSuper ? "super_admin" : "admin",
          title: isSuper
            ? "Secretary · Super Admin"
            : matchedLocal?.title || "Founder / Admin",
        },
      };
    }

    // If mochi_k_whoami explicitly rejected the key as invalid or revoked
    if (!whoRes.ok && whoRes.code === "P0001") {
      return {
        ok: false,
        message:
          whoRes.message ||
          "That admin key isn't valid (or was revoked). Ask Nolan for a fresh one.",
      };
    }

    // 2. Fallback: check Supabase mochi_me (legacy founder access token)
    const meRes = await callSupabaseRpc("mochi_me", { p_token: cleanKey });
    if (meRes.ok && meRes.data && meRes.data.person) {
      if (!meRes.data.person.is_admin) {
        return {
          ok: false,
          message: "This key is not an administrator key.",
        };
      }
      const isSuper = cleanKey === SUPER_ADMIN_KEY;
      return {
        ok: true,
        key: cleanKey,
        isSuper,
        profile: {
          name: meRes.data.person.name || matchedLocal?.name || "Admin",
          email: meRes.data.person.email || matchedLocal?.email || "",
          role: isSuper ? "super_admin" : "admin",
          title: isSuper
            ? "Secretary · Super Admin"
            : matchedLocal?.title || "Founder / Admin",
        },
      };
    }

    // 3. Fallback: Local known keys (for offline testing or before Supabase SQL migration is run)
    if (matchedLocal) {
      const isSuper =
        cleanKey === SUPER_ADMIN_KEY || matchedLocal.role === "super_admin";
      return {
        ok: true,
        key: cleanKey,
        isSuper,
        profile: {
          name: matchedLocal.name,
          email: matchedLocal.email || "",
          role: isSuper ? "super_admin" : "admin",
          title: isSuper
            ? "Secretary · Super Admin"
            : matchedLocal.title || "Admin",
        },
      };
    }

    return {
      ok: false,
      message:
        "That admin key wasn't recognized. Double-check your key or ask Nolan (Super Admin) for a fresh link.",
    };
  }

  async function initOrRenderAdminView() {
    let savedKey = null;
    try {
      savedKey = window.localStorage.getItem(STORAGE_KEYS.activeKey);
    } catch (_) {
      savedKey = null;
    }

    if (!savedKey) {
      showAdminGate();
      return;
    }

    const auth = await resolveAdminKey(savedKey);
    if (!auth.ok) {
      try {
        window.localStorage.removeItem(STORAGE_KEYS.activeKey);
      } catch (_) {
        // Ignore
      }
      showAdminGate(auth.message);
      return;
    }

    adminState.activeKey = auth.key;
    adminState.adminProfile = auth.profile;
    adminState.isSuperAdmin = Boolean(
      auth.isSuper || auth.key === SUPER_ADMIN_KEY
    );

    if (adminGate) adminGate.hidden = true;
    if (adminDashboard) adminDashboard.hidden = false;

    if (adminRolePill) {
      adminRolePill.textContent = adminState.isSuperAdmin
        ? "Super Admin"
        : "Admin";
      adminRolePill.className = adminState.isSuperAdmin
        ? "stage-badge tone-honey"
        : "stage-badge tone-ok";
    }

    if (adminWelcomeText) {
      adminWelcomeText.textContent = `Signed in as ${auth.profile.name} (${auth.profile.title})`;
    }

    const ownLinkInput = document.getElementById("admin-own-link-input");
    if (ownLinkInput) {
      ownLinkInput.value = buildAdminMagicLink(auth.key);
    }

    const superSection = document.getElementById("admin-super-keys-section");
    const nonSuperNote = document.getElementById("admin-non-super-note");
    if (superSection) superSection.hidden = !adminState.isSuperAdmin;
    if (nonSuperNote) nonSuperNote.hidden = adminState.isSuperAdmin;

    await loadAllAdminData();
  }

  function showAdminGate(errorMessage = "") {
    adminState.activeKey = null;
    adminState.adminProfile = null;
    adminState.isSuperAdmin = false;
    if (adminDashboard) adminDashboard.hidden = true;
    if (adminGate) adminGate.hidden = false;
    if (adminGateError) {
      if (errorMessage) {
        adminGateError.textContent = errorMessage;
        adminGateError.hidden = false;
      } else {
        adminGateError.hidden = true;
      }
    }
  }

  if (adminKeyToggleVis && adminKeyInput) {
    adminKeyToggleVis.addEventListener("click", () => {
      const isPassword = adminKeyInput.type === "password";
      adminKeyInput.type = isPassword ? "text" : "password";
      adminKeyToggleVis.textContent = isPassword ? "Hide" : "Show";
    });
  }

  if (adminLoginForm && adminKeyInput) {
    adminLoginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (adminGateError) adminGateError.hidden = true;
      const rawVal = adminKeyInput.value;
      const auth = await resolveAdminKey(rawVal);
      if (!auth.ok) {
        showAdminGate(auth.message);
        return;
      }
      try {
        window.localStorage.setItem(STORAGE_KEYS.activeKey, auth.key);
      } catch (_) {
        // Ignore
      }
      adminKeyInput.value = "";
      await initOrRenderAdminView();
      showAdminToast(`Welcome, ${auth.profile.name}!`);
    });
  }

  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener("click", () => {
      try {
        window.localStorage.removeItem(STORAGE_KEYS.activeKey);
      } catch (_) {
        // Ignore
      }
      showAdminGate();
      showAdminToast("Signed out of Admin Dashboard.");
    });
  }

  if (adminRefreshBtn) {
    adminRefreshBtn.addEventListener("click", async () => {
      await loadAllAdminData();
      showAdminToast("Dashboard data refreshed.");
    });
  }

  if (adminCopySqlBtn) {
    adminCopySqlBtn.addEventListener("click", async () => {
      const ok = await copyTextToClipboard(SUPABASE_SETUP_SQL);
      showAdminToast(
        ok
          ? "Copied one-time Supabase SQL setup script!"
          : "Couldn't copy automatically — open new_web/SUPABASE_ADMIN_SETUP.sql."
      );
    });
  }

  if (adminRetrySupabaseBtn) {
    adminRetrySupabaseBtn.addEventListener("click", async () => {
      await loadAllAdminData();
      if (!adminState.supabaseNeedsSetup) {
        showAdminToast("Connected to Supabase database!");
      } else {
        showAdminToast(
          "Supabase still needs the one-time SQL script run in SQL Editor."
        );
      }
    });
  }

  // Tab switching
  document.querySelectorAll("[data-admin-tab]").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      const targetTab = tabBtn.dataset.adminTab;
      adminState.activeTab = targetTab;
      document.querySelectorAll("[data-admin-tab]").forEach((btn) => {
        const isCurrent = btn.dataset.adminTab === targetTab;
        btn.classList.toggle("is-active", isCurrent);
        btn.setAttribute("aria-selected", isCurrent ? "true" : "false");
      });

      ["submissions", "events", "emails", "keys"].forEach((panelName) => {
        const panel = document.getElementById(`admin-panel-${panelName}`);
        if (panel) {
          panel.hidden = panelName !== targetTab;
        }
      });
    });
  });

  // Submissions filter pills (All / Dogs / Volunteers)
  document.querySelectorAll("[data-submission-filter]").forEach((pillBtn) => {
    pillBtn.addEventListener("click", () => {
      const filter = pillBtn.dataset.submissionFilter || "all";
      adminState.submissionFilter = filter;
      document.querySelectorAll("[data-submission-filter]").forEach((btn) => {
        btn.classList.toggle(
          "is-active",
          btn.dataset.submissionFilter === filter
        );
      });
      const dogsSec = document.getElementById("admin-dogs-section");
      const volsSec = document.getElementById("admin-volunteers-section");
      if (dogsSec) dogsSec.hidden = filter === "volunteers";
      if (volsSec) volsSec.hidden = filter === "dogs";
    });
  });

  /* ==========================================================================
     8. Loading & Merging Admin Data (Supabase + Local Cache)
     ========================================================================== */

  async function loadAllAdminData() {
    if (!adminState.activeKey) return;
    const token = adminState.activeKey;
    const deletedIds = getDeletedIdsSet();

    // 1. Fetch Interest (Dogs, Volunteers, Subscribers) from Supabase
    let interestRes = await callSupabaseRpc("mochi_k_interest", {
      p_key: token,
    });
    if (
      !interestRes.ok &&
      (interestRes.code === "PGRST202" ||
        interestRes.code === "404" ||
        interestRes.code === "42883")
    ) {
      interestRes = await callSupabaseRpc("mochi_admin_interest", {
        p_token: token,
      });
    }

    adminState.supabaseNeedsSetup =
      !interestRes.ok &&
      (interestRes.code === "PGRST202" ||
        interestRes.code === "404" ||
        interestRes.code === "42883" ||
        interestRes.code === "P0001");
    if (adminSetupBanner) {
      adminSetupBanner.hidden = !adminState.supabaseNeedsSetup;
    }

    const remoteDogs =
      interestRes.ok && interestRes.data && Array.isArray(interestRes.data.dogs)
        ? interestRes.data.dogs
        : [];
    const remoteVolunteers =
      interestRes.ok &&
      interestRes.data &&
      Array.isArray(interestRes.data.volunteers)
        ? interestRes.data.volunteers
        : [];
    const remoteSubscribers =
      interestRes.ok &&
      interestRes.data &&
      Array.isArray(interestRes.data.subscriber_list)
        ? interestRes.data.subscriber_list
        : [];

    const localDogs = readJsonStorage(STORAGE_KEYS.localDogs, []);
    const localVolunteers = readJsonStorage(STORAGE_KEYS.localVolunteers, []);
    const localSubscribers = readJsonStorage(STORAGE_KEYS.localSubscribers, []);

    // Merge Dogs (deduplicate by id or owner_name+dog_name+email)
    const dogsMap = new Map();
    [...remoteDogs, ...localDogs].forEach((d) => {
      if (!d || deletedIds.has(String(d.id))) return;
      if (d.status === "archived") return;
      const dedupKey = `${(d.email || "").toLowerCase()}::${(
        d.dog_name || ""
      ).toLowerCase()}`;
      if (!dogsMap.has(dedupKey)) {
        dogsMap.set(dedupKey, d);
      }
    });
    adminState.dogs = Array.from(dogsMap.values()).sort((a, b) =>
      String(b.created_at || "").localeCompare(String(a.created_at || ""))
    );

    // Merge Volunteers (deduplicate by email+name)
    const volsMap = new Map();
    [...remoteVolunteers, ...localVolunteers].forEach((v) => {
      if (!v || deletedIds.has(String(v.id))) return;
      if (v.status === "archived") return;
      const dedupKey = `${(v.email || "").toLowerCase()}::${(
        v.name || ""
      ).toLowerCase()}`;
      if (!volsMap.has(dedupKey)) {
        volsMap.set(dedupKey, v);
      }
    });
    adminState.volunteers = Array.from(volsMap.values()).sort((a, b) =>
      String(b.created_at || "").localeCompare(String(a.created_at || ""))
    );

    // Merge Subscribers (deduplicate by lowercase email)
    const subsMap = new Map();
    [...remoteSubscribers, ...localSubscribers].forEach((s) => {
      if (!s || !s.email) return;
      const emailKey = String(s.email).trim().toLowerCase();
      if (deletedIds.has(`sub:${emailKey}`)) return;
      if (!subsMap.has(emailKey)) {
        subsMap.set(emailKey, {
          name: s.name || "Subscriber",
          email: String(s.email).trim(),
          created_at: s.created_at || null,
        });
      }
    });
    adminState.subscribers = Array.from(subsMap.values()).sort((a, b) =>
      String(b.created_at || "").localeCompare(String(a.created_at || ""))
    );

    // 2. Fetch Events (mochi_k_events + mochi_upcoming_events + localEvents)
    let [adminEventsRes, publicEventsRes] = await Promise.all([
      callSupabaseRpc("mochi_k_events", { p_key: token }),
      callSupabaseRpc("mochi_upcoming_events", {}),
    ]);
    if (
      !adminEventsRes.ok &&
      (adminEventsRes.code === "PGRST202" ||
        adminEventsRes.code === "404" ||
        adminEventsRes.code === "42883")
    ) {
      adminEventsRes = await callSupabaseRpc("mochi_admin_events", {
        p_token: token,
      });
    }

    const remoteAdminEvents =
      adminEventsRes.ok && Array.isArray(adminEventsRes.data)
        ? adminEventsRes.data
        : [];
    const remotePublicEvents =
      publicEventsRes.ok && Array.isArray(publicEventsRes.data)
        ? publicEventsRes.data
        : [];
    const allRemoteEvents = [...remoteAdminEvents, ...remotePublicEvents];
    const localEvents =
      adminEventsRes.ok || publicEventsRes.ok
        ? pruneSyncedLocalEvents(allRemoteEvents)
        : readJsonStorage(STORAGE_KEYS.localEvents, []);

    const eventsMap = new Map();
    const seenEventSignatures = new Set();

    [...allRemoteEvents, ...localEvents].forEach((ev) => {
      if (!ev || !ev.id) return;
      const idStr = String(ev.id);
      if (deletedIds.has(idStr)) return;
      if (ev.notes === "[DELETED]") return;

      const sig = getEventSignature(ev);
      if (eventsMap.has(idStr) || (sig && seenEventSignatures.has(sig))) return;

      eventsMap.set(idStr, ev);
      if (sig) seenEventSignatures.add(sig);
    });
    adminState.events = Array.from(eventsMap.values()).sort((a, b) =>
      String(a.starts_at || "").localeCompare(String(b.starts_at || ""))
    );

    // 2b. Fetch Event Sign-Ups (with email addresses for Admin)
    const [adminSignupsRes, publicSignupsRes] = await Promise.all([
      callSupabaseRpc("mochi_k_event_signups", { p_key: token }),
      callSupabaseRpc("mochi_public_event_signups", {}),
    ]);
    const remoteAdminSignups =
      adminSignupsRes.ok && Array.isArray(adminSignupsRes.data)
        ? adminSignupsRes.data
        : [];
    const remotePublicSignups =
      publicSignupsRes.ok && Array.isArray(publicSignupsRes.data)
        ? publicSignupsRes.data
        : [];
    const localSignups = readJsonStorage(STORAGE_KEYS.localEventSignups, []);

    const signupsMap = new Map();
    [...remotePublicSignups, ...remoteAdminSignups, ...localSignups].forEach(
      (raw) => {
        const norm = normalizeEventSignup(raw);
        if (!norm) return;
        if (deletedIds.has(`signup:${norm.id}`) || deletedIds.has(norm.id)) {
          return;
        }
        const existing = signupsMap.get(norm.id);
        signupsMap.set(norm.id, {
          ...existing,
          ...norm,
          email: norm.email || existing?.email || "",
        });
      }
    );
    adminState.eventSignups = Array.from(signupsMap.values()).sort((a, b) =>
      String(a.created_at || "").localeCompare(String(b.created_at || ""))
    );

    // 3. Fetch Issued Admin Keys (if Super Admin)
    const localKeys = getAllLocalKnownKeys();
    const keysMap = new Map();
    localKeys.forEach((k) => keysMap.set(k.key, k));

    if (adminState.isSuperAdmin) {
      let superKeysRes = await callSupabaseRpc("mochi_k_list_keys", {
        p_key: token,
      });
      if (
        !superKeysRes.ok &&
        (superKeysRes.code === "PGRST202" ||
          superKeysRes.code === "404" ||
          superKeysRes.code === "42883")
      ) {
        superKeysRes = await callSupabaseRpc("mochi_super_list_keys", {
          p_token: token,
        });
      }
      if (superKeysRes.ok && Array.isArray(superKeysRes.data)) {
        const revoked = getRevokedKeysSet();
        superKeysRes.data.forEach((rk) => {
          if (!rk || !rk.key) return;
          const clean = String(rk.key).toLowerCase();
          if (revoked.has(clean)) return;
          const existing = keysMap.get(clean);
          const isSuper = Boolean(rk.is_super || clean === SUPER_ADMIN_KEY);
          keysMap.set(clean, {
            id: rk.id || existing?.id || `key-${clean.slice(0, 8)}`,
            name: rk.label || rk.name || existing?.name || "Admin",
            email: rk.email || existing?.email || "",
            role: isSuper ? "super_admin" : "admin",
            title: isSuper
              ? "Secretary · Super Admin"
              : existing?.title || "Admin",
            key: clean,
            created_at: rk.created_at || existing?.created_at || null,
          });
        });
      }
    }
    adminState.keys = Array.from(keysMap.values());

    renderAdminDashboard();
    refreshPublicEvents();
  }

  /* ==========================================================================
     9. Rendering Admin Panels & Handling Confirmations / Deletions
     ========================================================================== */

  function renderAdminDashboard() {
    renderSubmissionsPanel();
    renderEventsPanel();
    renderEmailsPanel();
    renderKeysPanel();
  }

  function renderConfirmOrActionHtml(type, id, label, buttonLabel = "Delete") {
    const isConfirming =
      adminState.confirmTarget &&
      adminState.confirmTarget.type === type &&
      String(adminState.confirmTarget.id) === String(id);

    if (isConfirming) {
      return `
        <div class="admin-confirm-bar" role="group" aria-label="Confirm ${escapeHtml(buttonLabel.toLowerCase())}">
          <span class="admin-confirm-text">
            Are you sure you want to ${escapeHtml(buttonLabel.toLowerCase())} <strong>${escapeHtml(label)}</strong>?
          </span>
          <div class="admin-confirm-actions">
            <button
              type="button"
              data-confirm-yes="${escapeHtml(type)}"
              data-confirm-id="${escapeHtml(id)}"
              class="admin-btn-danger admin-btn-sm"
            >
              Yes, ${escapeHtml(buttonLabel.toLowerCase())}
            </button>
            <button
              type="button"
              data-confirm-cancel="true"
              class="admin-btn-secondary admin-btn-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      `;
    }

    return `
      <button
        type="button"
        data-ask-confirm="${escapeHtml(type)}"
        data-confirm-id="${escapeHtml(id)}"
        class="admin-btn-ghost-danger admin-btn-sm"
      >
        ${escapeHtml(buttonLabel)}
      </button>
    `;
  }

  // 1. Render Submissions ("I have a dog" & "I want to volunteer")
  function renderSubmissionsPanel() {
    const dogs = adminState.dogs;
    const volunteers = adminState.volunteers;
    const totalCount = dogs.length + volunteers.length;

    const badgeSub = document.getElementById("admin-badge-submissions");
    const countDogs = document.getElementById("admin-count-dogs");
    const countVols = document.getElementById("admin-count-volunteers");
    const pillDogs = document.getElementById("admin-dogs-pill-count");
    const pillVols = document.getElementById("admin-volunteers-pill-count");

    if (badgeSub) badgeSub.textContent = String(totalCount);
    if (countDogs) countDogs.textContent = String(dogs.length);
    if (countVols) countVols.textContent = String(volunteers.length);
    if (pillDogs) pillDogs.textContent = String(dogs.length);
    if (pillVols) pillVols.textContent = String(volunteers.length);

    const dogsListEl = document.getElementById("admin-dogs-list");
    if (dogsListEl) {
      if (dogs.length === 0) {
        dogsListEl.innerHTML = `
          <p class="admin-empty-state">
            No “I have a dog” submissions right now.
          </p>
        `;
      } else {
        dogsListEl.innerHTML = dogs
          .map((dog) => {
            const subDetails = [dog.breed, dog.age, dog.city]
              .filter(Boolean)
              .join(" · ");
            const submittedAt = formatSubmittedDate(dog.created_at);
            return `
              <article class="admin-item-card">
                <div class="admin-item-top">
                  <div class="admin-item-title-group">
                    <h4 class="admin-item-title">${escapeHtml(dog.dog_name || "Unnamed Dog")}</h4>
                    <span class="stage-badge tone-honey">Dog Sign-Up</span>
                  </div>
                  ${
                    submittedAt
                      ? `<time class="admin-item-time">${escapeHtml(submittedAt)}</time>`
                      : ""
                  }
                </div>
                ${
                  subDetails
                    ? `<p class="admin-item-meta">${escapeHtml(subDetails)}</p>`
                    : ""
                }
                <p class="admin-item-owner">
                  Owner: <strong>${escapeHtml(dog.owner_name || "Not provided")}</strong>
                </p>
                <div class="admin-item-contact">
                  ${
                    dog.email
                      ? `<a href="mailto:${escapeHtml(dog.email)}">${escapeHtml(dog.email)}</a>`
                      : ""
                  }
                  ${
                    dog.phone
                      ? `<a href="tel:${escapeHtml(dog.phone)}">${escapeHtml(dog.phone)}</a>`
                      : ""
                  }
                </div>
                ${
                  dog.notes
                    ? `<blockquote class="admin-item-notes">${escapeHtml(dog.notes)}</blockquote>`
                    : ""
                }
                <div class="admin-item-footer">
                  ${renderConfirmOrActionHtml(
                    "dog",
                    dog.id,
                    `${dog.dog_name} (${dog.owner_name})`,
                    "Delete"
                  )}
                </div>
              </article>
            `;
          })
          .join("");
      }
    }

    const volsListEl = document.getElementById("admin-volunteers-list");
    if (volsListEl) {
      if (volunteers.length === 0) {
        volsListEl.innerHTML = `
          <p class="admin-empty-state">
            No “I want to volunteer” submissions right now.
          </p>
        `;
      } else {
        volsListEl.innerHTML = volunteers
          .map((vol) => {
            const skills = Array.isArray(vol.skills) ? vol.skills : [];
            const submittedAt = formatSubmittedDate(vol.created_at);
            return `
              <article class="admin-item-card">
                <div class="admin-item-top">
                  <div class="admin-item-title-group">
                    <h4 class="admin-item-title">${escapeHtml(vol.name || "Volunteer")}</h4>
                    <span class="stage-badge tone-ok">Volunteer</span>
                  </div>
                  ${
                    submittedAt
                      ? `<time class="admin-item-time">${escapeHtml(submittedAt)}</time>`
                      : ""
                  }
                </div>
                <div class="admin-item-contact">
                  ${
                    vol.email
                      ? `<a href="mailto:${escapeHtml(vol.email)}">${escapeHtml(vol.email)}</a>`
                      : ""
                  }
                  ${
                    vol.phone
                      ? `<a href="tel:${escapeHtml(vol.phone)}">${escapeHtml(vol.phone)}</a>`
                      : ""
                  }
                </div>
                ${
                  skills.length > 0
                    ? `<div class="admin-item-tags">
                        ${skills
                          .map(
                            (s) =>
                              `<span class="admin-skill-tag">${escapeHtml(s)}</span>`
                          )
                          .join("")}
                      </div>`
                    : ""
                }
                ${
                  vol.interests
                    ? `<blockquote class="admin-item-notes">${escapeHtml(vol.interests)}</blockquote>`
                    : ""
                }
                <div class="admin-item-footer">
                  ${renderConfirmOrActionHtml(
                    "volunteer",
                    vol.id,
                    vol.name || "this volunteer",
                    "Delete"
                  )}
                </div>
              </article>
            `;
          })
          .join("");
      }
    }
  }

  // 2. Render Events Panel (Events + Gaggle Sign-Ups Management + BCC Emails)
  function renderAdminSignupCardHtml(signup) {
    const isEditing =
      adminState.editingSignupId &&
      String(adminState.editingSignupId) === String(signup.id);

    if (isEditing) {
      const extraPeopleRows = (signup.people || [])
        .map((p) => buildDynamicSignupRowHtml("person", p))
        .join("");
      const dogRows = (signup.dogs || [])
        .map((d) => buildDynamicSignupRowHtml("dog", d))
        .join("");

      return `
        <form
          class="admin-signup-edit-form"
          data-admin-signup-edit-form="${escapeHtml(signup.id)}"
          data-event-id="${escapeHtml(signup.event_id)}"
          novalidate
        >
          <div class="admin-signup-edit-header">
            <h6 class="admin-signup-edit-title">Edit Sign-Up</h6>
            <button
              type="button"
              data-cancel-edit-signup="${escapeHtml(signup.id)}"
              class="admin-btn-secondary admin-btn-sm"
            >
              Cancel
            </button>
          </div>

          <div class="form-grid sm-2col">
            <label>
              <span class="form-label">Primary Person Name *</span>
              <input
                type="text"
                name="primaryName"
                required
                maxlength="80"
                value="${escapeHtml(signup.name)}"
                class="form-input"
              />
            </label>
            <label>
              <span class="form-label">Email Address <span class="form-label-optional">(optional)</span></span>
              <input
                type="email"
                name="email"
                maxlength="120"
                value="${escapeHtml(signup.email || "")}"
                class="form-input"
              />
            </label>
          </div>

          <div class="event-dynamic-rows-stack" data-extra-people-list>
            ${extraPeopleRows}
          </div>
          <div class="event-dynamic-rows-stack" data-extra-dogs-list>
            ${dogRows}
          </div>

          <div class="event-signup-add-bar">
            <button
              type="button"
              data-admin-add-person-row="true"
              class="event-add-row-btn"
            >
              + Add a person
            </button>
            <button
              type="button"
              data-admin-add-dog-row="true"
              class="event-add-row-btn is-dog"
            >
              🐾 + Add a dog
            </button>
          </div>

          <p class="admin-alert-error" data-admin-edit-error hidden role="alert"></p>

          <div class="admin-form-actions">
            <button type="submit" class="admin-btn-primary admin-btn-sm">
              Save Changes
            </button>
            <button
              type="button"
              data-cancel-edit-signup="${escapeHtml(signup.id)}"
              class="admin-btn-secondary admin-btn-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      `;
    }

    const allPeople = [signup.name, ...(signup.people || [])].filter(Boolean);
    const allDogs = (signup.dogs || []).filter(Boolean);
    const submittedAt = formatSubmittedDate(signup.created_at);

    return `
      <div class="admin-signup-card">
        <div class="admin-signup-card-top">
          <div class="admin-signup-main-info">
            <strong class="admin-signup-primary-name">${escapeHtml(
              signup.name
            )}</strong>
            ${
              signup.email
                ? `<a href="mailto:${escapeHtml(
                    signup.email
                  )}" class="admin-signup-email">${escapeHtml(signup.email)}</a>`
                : `<span class="admin-item-time">(No email provided)</span>`
            }
          </div>
          ${
            submittedAt
              ? `<time class="admin-item-time">${escapeHtml(submittedAt)}</time>`
              : ""
          }
        </div>

        <div class="admin-signup-party-badges">
          <div class="admin-signup-badge-group">
            <span class="admin-signup-group-label">People (${
              allPeople.length
            }):</span>
            ${allPeople
              .map(
                (personName) =>
                  `<span class="admin-person-chip">${escapeHtml(
                    personName
                  )}</span>`
              )
              .join("")}
          </div>
          <div class="admin-signup-badge-group">
            <span class="admin-signup-group-label">Dogs (${
              allDogs.length
            }):</span>
            ${
              allDogs.length > 0
                ? allDogs
                    .map(
                      (dogName) =>
                        `<span class="event-dog-chip">🐾 ${escapeHtml(
                          dogName
                        )}</span>`
                    )
                    .join("")
                : `<span class="admin-no-dogs-label">None</span>`
            }
          </div>
        </div>

        <div class="admin-signup-actions">
          <button
            type="button"
            data-start-edit-signup="${escapeHtml(signup.id)}"
            class="admin-btn-secondary admin-btn-sm"
          >
            Edit Sign-Up
          </button>
          ${renderConfirmOrActionHtml(
            "event_signup",
            signup.id,
            `${signup.name}'s party`,
            "Remove from Gaggle"
          )}
        </div>
      </div>
    `;
  }

  function renderEventsPanel() {
    const events = adminState.events;
    const badgeEvents = document.getElementById("admin-badge-events");
    const pillEvents = document.getElementById("admin-events-pill-count");
    if (badgeEvents) badgeEvents.textContent = String(events.length);
    if (pillEvents) pillEvents.textContent = String(events.length);

    const eventsListEl = document.getElementById("admin-events-list");
    if (!eventsListEl) return;

    if (events.length === 0) {
      eventsListEl.innerHTML = `
        <p class="admin-empty-state">
          No events scheduled right now. Click <strong>+ Add New Event</strong> above to publish an event to the website.
        </p>
      `;
      return;
    }

    eventsListEl.innerHTML = events
      .map((ev) => {
        const eventIdStr = String(ev.id);
        const eventSignups = (adminState.eventSignups || []).filter(
          (s) => String(s.event_id) === eventIdStr
        );
        let totalPeople = 0;
        let totalDogs = 0;
        eventSignups.forEach((s) => {
          totalPeople += 1 + (Array.isArray(s.people) ? s.people.length : 0);
          totalDogs += Array.isArray(s.dogs) ? s.dogs.length : 0;
        });

        const uniqueEmails = Array.from(
          new Set(
            eventSignups
              .map((s) => String(s.email || "").trim().toLowerCase())
              .filter(Boolean)
          )
        );
        const bccString = uniqueEmails.join(", ");

        const windowStr = formatEventWindow(ev.starts_at, ev.ends_at, true);
        const isPast = Date.parse(ev.ends_at || ev.starts_at) < Date.now();
        const cap = Number(ev.cap) || 15;
        const { spotName, customMapUrl, mapsUrl } = parseMeetingSpot(
          ev.meeting_spot,
          ev.map_url
        );
        const isEditingEvent = String(adminState.editingEventId) === eventIdStr;
        const startLocal = isoToDenverLocal(ev.starts_at);
        const endLocal = isoToDenverLocal(ev.ends_at);

        const editEventFormHtml = isEditingEvent
          ? `
            <form
              class="admin-signup-edit-form"
              data-admin-event-edit-form="${escapeHtml(eventIdStr)}"
              novalidate
            >
              <div class="admin-signup-edit-header">
                <strong class="admin-signup-edit-title">Edit Event Details</strong>
                <button
                  type="button"
                  data-cancel-edit-event="${escapeHtml(eventIdStr)}"
                  class="admin-btn-secondary admin-btn-sm"
                >
                  Cancel
                </button>
              </div>

              <div class="form-grid sm-2col">
                <label>
                  <span class="form-label">Event title *</span>
                  <input
                    type="text"
                    name="title"
                    required
                    maxlength="80"
                    value="${escapeHtml(ev.title || "")}"
                    class="form-input"
                  />
                </label>

                <label>
                  <span class="form-label">Category badge *</span>
                  <input
                    type="text"
                    name="kind"
                    list="admin-event-kinds"
                    required
                    maxlength="40"
                    value="${escapeHtml(ev.kind || "Gaggle walk")}"
                    class="form-input"
                  />
                </label>

                <label>
                  <span class="form-label">Date (Mountain Time) *</span>
                  <input
                    type="date"
                    name="date"
                    required
                    value="${escapeHtml(startLocal.date)}"
                    class="form-input"
                  />
                </label>

                <div class="form-grid-2col">
                  <label>
                    <span class="form-label">Start time *</span>
                    <input
                      type="time"
                      name="startTime"
                      required
                      value="${escapeHtml(startLocal.time)}"
                      class="form-input"
                    />
                  </label>
                  <label>
                    <span class="form-label">End time *</span>
                    <input
                      type="time"
                      name="endTime"
                      required
                      value="${escapeHtml(endLocal.time)}"
                      class="form-input"
                    />
                  </label>
                </div>

                <label>
                  <span class="form-label">Meeting spot / Location *</span>
                  <input
                    type="text"
                    name="meetingSpot"
                    required
                    maxlength="160"
                    value="${escapeHtml(spotName)}"
                    class="form-input"
                  />
                </label>

                <label>
                  <span class="form-label">
                    Google Maps link <span class="form-label-optional">(optional)</span>
                  </span>
                  <input
                    type="url"
                    name="mapUrl"
                    maxlength="500"
                    value="${escapeHtml(customMapUrl)}"
                    placeholder="https://maps.app.goo.gl/..."
                    class="form-input"
                  />
                </label>

                <label>
                  <span class="form-label">Max dogs (capacity) *</span>
                  <input
                    type="number"
                    name="cap"
                    min="1"
                    max="200"
                    required
                    value="${escapeHtml(String(cap))}"
                    class="form-input"
                  />
                </label>

                <label class="sm-span-2">
                  <span class="form-label">Notes / What to bring (optional)</span>
                  <textarea
                    name="notes"
                    rows="2"
                    maxlength="1000"
                    class="form-input"
                  >${escapeHtml(ev.notes || "")}</textarea>
                </label>
              </div>

              <p class="admin-alert-error" data-admin-event-edit-error hidden role="alert"></p>

              <div class="admin-form-actions">
                <button type="submit" class="admin-btn-primary admin-btn-sm">
                  Save Event Changes
                </button>
                <button
                  type="button"
                  data-cancel-edit-event="${escapeHtml(eventIdStr)}"
                  class="admin-btn-secondary admin-btn-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          `
          : "";

        return `
          <article class="admin-item-card">
            <div class="admin-item-top">
              <div class="admin-item-title-group">
                <h4 class="admin-item-title">${escapeHtml(ev.title)}</h4>
                <span class="stage-badge tone-honey">${escapeHtml(ev.kind || "Gaggle walk")}</span>
                <span class="stage-badge ${isPast ? "tone-plain" : "tone-ok"}">
                  ${isPast ? "Past" : "Published"}
                </span>
                ${
                  customMapUrl
                    ? `<span class="stage-badge tone-plain">Custom Map Pin</span>`
                    : ""
                }
              </div>
            </div>
            <p class="admin-item-owner">
              <strong>${escapeHtml(windowStr)}</strong> (Mountain Time)
            </p>
            <p class="admin-item-meta">
              Location:
              <a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer" class="event-map-link">
                ${escapeHtml(spotName)} ↗
              </a>
              · Dog Capacity: ${totalDogs} / ${cap} dogs · ${totalPeople} ${
          totalPeople === 1 ? "person" : "people"
        } attending
            </p>
            ${
              ev.notes
                ? `<blockquote class="admin-item-notes">${escapeHtml(ev.notes)}</blockquote>`
                : ""
            }
            ${editEventFormHtml}

            <div class="admin-event-signups-box">
              <div class="admin-event-signups-header">
                <div class="admin-event-signups-title-wrap">
                  <h5 class="admin-event-signups-title">
                    Gaggle Sign-Ups (${eventSignups.length})
                  </h5>
                  <span class="admin-event-signups-summary">
                    ${totalPeople} ${
          totalPeople === 1 ? "person" : "people"
        } · ${totalDogs} ${totalDogs === 1 ? "dog" : "dogs"}
                  </span>
                </div>
                <button
                  type="button"
                  data-copy-text="${escapeHtml(bccString)}"
                  data-copy-label="Copied ${uniqueEmails.length} sign-up ${
          uniqueEmails.length === 1 ? "email" : "emails"
        } for BCC!"
                  class="admin-btn-primary admin-btn-sm"
                  ${uniqueEmails.length === 0 ? "disabled" : ""}
                >
                  Copy Sign-Up Emails for BCC (${uniqueEmails.length})
                </button>
              </div>

              ${
                uniqueEmails.length > 0
                  ? `<div class="admin-event-bcc-bar">
                      <label class="form-label">
                        BCC emails for this event (${uniqueEmails.length}):
                      </label>
                      <input
                        type="text"
                        readonly
                        value="${escapeHtml(bccString)}"
                        class="form-input admin-mono-input"
                      />
                    </div>`
                  : ""
              }

              <div class="admin-event-signups-list">
                ${
                  eventSignups.length === 0
                    ? `<p class="admin-empty-state admin-empty-state-sm">No sign-ups for this event yet.</p>`
                    : eventSignups
                        .map((s) => renderAdminSignupCardHtml(s))
                        .join("")
                }
              </div>
            </div>

            <div class="admin-item-footer">
              <div class="admin-signup-card-actions">
                <button
                  type="button"
                  data-start-edit-event="${escapeHtml(eventIdStr)}"
                  class="admin-btn-secondary admin-btn-sm"
                >
                  Edit Event
                </button>
                ${renderConfirmOrActionHtml(
                  "event",
                  ev.id,
                  ev.title,
                  "Delete Event"
                )}
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  // 3. Render Email List Panel
  function renderEmailsPanel() {
    const subs = adminState.subscribers;
    const badgeEmails = document.getElementById("admin-badge-emails");
    const totalSpan = document.getElementById("admin-emails-total");
    const pillSubs = document.getElementById("admin-subscribers-pill-count");
    const bccInput = document.getElementById("admin-bcc-input");
    const copyBccBtn = document.getElementById("admin-copy-bcc-btn");
    const emailsListEl = document.getElementById("admin-emails-list");

    if (badgeEmails) badgeEmails.textContent = String(subs.length);
    if (totalSpan) totalSpan.textContent = String(subs.length);
    if (pillSubs) pillSubs.textContent = String(subs.length);

    const bccString = subs.map((s) => s.email).join(", ");
    if (bccInput) {
      bccInput.value = bccString;
    }
    if (copyBccBtn) {
      copyBccBtn.disabled = subs.length === 0;
    }

    if (!emailsListEl) return;

    if (subs.length === 0) {
      emailsListEl.innerHTML = `
        <p class="admin-empty-state">
          No newsletter subscribers yet. Visitors who submit the “Keep me posted” form in the footer will appear here.
        </p>
      `;
      return;
    }

    emailsListEl.innerHTML = subs
      .map((s) => {
        const dateStr = formatSubmittedDate(s.created_at);
        return `
          <article class="admin-item-card">
            <div class="admin-item-top">
              <div>
                <h4 class="admin-item-title">${escapeHtml(s.name || "Subscriber")}</h4>
                <div class="admin-item-contact">
                  <a href="mailto:${escapeHtml(s.email)}">${escapeHtml(s.email)}</a>
                </div>
              </div>
              ${
                dateStr
                  ? `<time class="admin-item-time">${escapeHtml(dateStr)}</time>`
                  : ""
              }
            </div>
            <div class="admin-item-footer">
              ${renderConfirmOrActionHtml(
                "subscriber",
                s.email,
                s.email,
                "Remove"
              )}
            </div>
          </article>
        `;
      })
      .join("");
  }

  // 4. Render Admin Keys Panel (Super Admin View)
  function renderKeysPanel() {
    const keysListEl = document.getElementById("admin-keys-list");
    if (!keysListEl || !adminState.isSuperAdmin) return;

    keysListEl.innerHTML = adminState.keys
      .map((item) => {
        const isSuper = item.key === SUPER_ADMIN_KEY;
        const magicLink = buildAdminMagicLink(item.key);
        return `
          <article class="admin-item-card">
            <div class="admin-item-top">
              <div class="admin-item-title-group">
                <h4 class="admin-item-title">${escapeHtml(item.name)}</h4>
                <span class="stage-badge ${isSuper ? "tone-honey" : "tone-ok"}">
                  ${isSuper ? "Super Admin" : "Admin"}
                </span>
                ${
                  item.key === adminState.activeKey
                    ? `<span class="stage-badge tone-plain">You</span>`
                    : ""
                }
              </div>
              ${
                item.title
                  ? `<span class="admin-item-time">${escapeHtml(item.title)}</span>`
                  : ""
              }
            </div>
            ${
              item.email
                ? `<p class="admin-item-meta">${escapeHtml(item.email)}</p>`
                : ""
            }
            <div class="admin-key-card-row">
              <div>
                <span class="form-label">32-Character Key:</span>
                <code class="admin-key-code">${escapeHtml(item.key)}</code>
              </div>
              <div class="admin-key-actions">
                <button
                  type="button"
                  data-copy-text="${escapeHtml(magicLink)}"
                  data-copy-label="Copied ${escapeHtml(item.name)}'s login link!"
                  class="admin-btn-primary admin-btn-sm"
                >
                  Copy #k= Link
                </button>
                <button
                  type="button"
                  data-copy-text="${escapeHtml(item.key)}"
                  data-copy-label="Copied ${escapeHtml(item.name)}'s 32-char key!"
                  class="admin-btn-secondary admin-btn-sm"
                >
                  Copy Key
                </button>
              </div>
            </div>
            ${
              !isSuper
                ? `<div class="admin-item-footer">
                    ${renderConfirmOrActionHtml(
                      "key",
                      item.key,
                      `${item.name}'s admin key`,
                      "Revoke Key"
                    )}
                  </div>`
                : ""
            }
          </article>
        `;
      })
      .join("");
  }

  /* ==========================================================================
     10. Admin Interactive Event Delegation (Confirm, Delete, Copy, Forms)
     ========================================================================== */

  const viewAdminSection = document.getElementById("view-admin");
  if (viewAdminSection) {
    viewAdminSection.addEventListener("click", async (event) => {
      // Auto-select readonly BCC inputs when clicked
      const monoInput = event.target.closest("input.admin-mono-input[readonly]");
      if (monoInput) {
        monoInput.select();
      }

      // A. Copy text button
      const copyBtn = event.target.closest("[data-copy-text]");
      if (copyBtn) {
        const text = copyBtn.dataset.copyText;
        const label = copyBtn.dataset.copyLabel || "Copied to clipboard!";
        const ok = await copyTextToClipboard(text);
        showAdminToast(ok ? label : "Couldn't copy automatically.");
        return;
      }

      // A1. Start editing an event sign-up
      const startEditSignupBtn = event.target.closest(
        "[data-start-edit-signup]"
      );
      if (startEditSignupBtn) {
        adminState.editingSignupId = startEditSignupBtn.dataset.startEditSignup;
        adminState.confirmTarget = null;
        renderEventsPanel();
        return;
      }

      // A2. Cancel editing an event sign-up
      const cancelEditSignupBtn = event.target.closest(
        "[data-cancel-edit-signup]"
      );
      if (cancelEditSignupBtn) {
        adminState.editingSignupId = null;
        renderEventsPanel();
        return;
      }

      // A2b. Start editing an event
      const startEditEventBtn = event.target.closest("[data-start-edit-event]");
      if (startEditEventBtn) {
        adminState.editingEventId = startEditEventBtn.dataset.startEditEvent;
        adminState.confirmTarget = null;
        renderEventsPanel();
        return;
      }

      // A2c. Cancel editing an event
      const cancelEditEventBtn = event.target.closest(
        "[data-cancel-edit-event]"
      );
      if (cancelEditEventBtn) {
        adminState.editingEventId = null;
        renderEventsPanel();
        return;
      }

      // A3. Add a person row inside admin edit form
      const adminAddPersonBtn = event.target.closest(
        "[data-admin-add-person-row]"
      );
      if (adminAddPersonBtn) {
        const form = adminAddPersonBtn.closest("form");
        const container = form
          ? form.querySelector("[data-extra-people-list]")
          : null;
        if (container) {
          container.insertAdjacentHTML(
            "beforeend",
            buildDynamicSignupRowHtml("person")
          );
          const inputs = container.querySelectorAll(
            'input[name="extraPerson"]'
          );
          const lastInput = inputs[inputs.length - 1];
          if (lastInput) lastInput.focus();
        }
        return;
      }

      // A4. Add a dog row inside admin edit form
      const adminAddDogBtn = event.target.closest("[data-admin-add-dog-row]");
      if (adminAddDogBtn) {
        const form = adminAddDogBtn.closest("form");
        const container = form
          ? form.querySelector("[data-extra-dogs-list]")
          : null;
        if (container) {
          container.insertAdjacentHTML(
            "beforeend",
            buildDynamicSignupRowHtml("dog")
          );
          const inputs = container.querySelectorAll('input[name="dogName"]');
          const lastInput = inputs[inputs.length - 1];
          if (lastInput) lastInput.focus();
        }
        return;
      }

      // A5. Remove a person or dog row inside admin edit form
      const removeRowBtn = event.target.closest("[data-remove-signup-row]");
      if (removeRowBtn) {
        const row = removeRowBtn.closest("[data-signup-row]");
        if (row) row.remove();
        return;
      }

      // B. Open inline confirmation bar
      const askConfirmBtn = event.target.closest("[data-ask-confirm]");
      if (askConfirmBtn) {
        adminState.confirmTarget = {
          type: askConfirmBtn.dataset.askConfirm,
          id: askConfirmBtn.dataset.confirmId,
        };
        renderAdminDashboard();
        return;
      }

      // C. Cancel inline confirmation
      const cancelConfirmBtn = event.target.closest("[data-confirm-cancel]");
      if (cancelConfirmBtn) {
        adminState.confirmTarget = null;
        renderAdminDashboard();
        return;
      }

      // D. Execute confirmed Delete / Revoke
      const confirmYesBtn = event.target.closest("[data-confirm-yes]");
      if (confirmYesBtn) {
        const type = confirmYesBtn.dataset.confirmYes;
        const id = confirmYesBtn.dataset.confirmId;
        confirmYesBtn.disabled = true;
        await handleConfirmedAdminAction(type, id);
      }
    });

    viewAdminSection.addEventListener("submit", async (event) => {
      // 1. Handle inline Edit Event form submission
      const eventEditForm = event.target.closest("[data-admin-event-edit-form]");
      if (eventEditForm) {
        event.preventDefault();
        const eventId = eventEditForm.dataset.adminEventEditForm;
        const errEl = eventEditForm.querySelector(
          "[data-admin-event-edit-error]"
        );
        if (errEl) errEl.hidden = true;

        const fd = new FormData(eventEditForm);
        const title = String(fd.get("title") || "").trim();
        const kind = String(fd.get("kind") || "").trim();
        const date = String(fd.get("date") || "").trim();
        const startTime = String(fd.get("startTime") || "").trim();
        const endTime = String(fd.get("endTime") || "").trim();
        const meetingSpot = String(fd.get("meetingSpot") || "").trim();
        const mapUrl = String(fd.get("mapUrl") || "").trim();
        const rawCap = String(fd.get("cap") || "").trim();
        const parsedCap = Number(rawCap);
        const notes = String(fd.get("notes") || "").trim() || null;

        if (
          !title ||
          !kind ||
          !date ||
          !startTime ||
          !endTime ||
          !meetingSpot ||
          !rawCap ||
          !Number.isInteger(parsedCap) ||
          parsedCap < 1 ||
          parsedCap > 200
        ) {
          if (errEl) {
            errEl.textContent =
              "Please fill in the title, category, date, start/end time, meeting spot, and max dogs (1–200).";
            errEl.hidden = false;
          }
          return;
        }

        if (endTime <= startTime) {
          if (errEl) {
            errEl.textContent = "End time must be after the start time.";
            errEl.hidden = false;
          }
          return;
        }

        if (mapUrl && !/^https?:\/\//i.test(mapUrl)) {
          if (errEl) {
            errEl.textContent =
              "Please enter a full Google Maps URL starting with https:// (or leave it blank).";
            errEl.hidden = false;
          }
          return;
        }

        const cap = parsedCap;
        const startsAt = denverLocalToIso(date, startTime);
        const endsAt = denverLocalToIso(date, endTime);
        const packedMeetingSpot = formatMeetingSpotForSave(meetingSpot, mapUrl);

        const submitBtn = eventEditForm.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Saving…";
        }

        let savedRemotely = false;
        let lastRpcError = null;

        if (adminState.activeKey) {
          let rpcRes = await callSupabaseRpc("mochi_k_update_event", {
            p_key: adminState.activeKey,
            p_event_id: eventId,
            p_title: title,
            p_kind: kind,
            p_starts_at: startsAt,
            p_ends_at: endsAt,
            p_meeting_spot: packedMeetingSpot,
            p_cap: cap,
            p_notes: notes,
          });

          if (
            !rpcRes.ok &&
            (rpcRes.code === "PGRST202" ||
              rpcRes.code === "404" ||
              rpcRes.code === "42883")
          ) {
            rpcRes = await callSupabaseRpc("mochi_admin_save_event", {
              p_token: adminState.activeKey,
              p_id: eventId,
              p_title: title,
              p_kind: kind,
              p_min_stage: "gaggle",
              p_starts_at: startsAt,
              p_ends_at: endsAt,
              p_meeting_spot: packedMeetingSpot,
              p_cap: cap,
              p_status: "published",
              p_notes: notes,
            });
          }

          if (rpcRes.ok) {
            savedRemotely = true;
          } else {
            lastRpcError = rpcRes.message;
          }
        }

        const localEvents = readJsonStorage(STORAGE_KEYS.localEvents, []);
        const updatedLocal = localEvents.map((item) => {
          if (String(item.id) === String(eventId)) {
            return {
              ...item,
              title,
              kind,
              starts_at: startsAt,
              ends_at: endsAt,
              meeting_spot: packedMeetingSpot,
              cap,
              notes,
            };
          }
          return item;
        });
        writeJsonStorage(STORAGE_KEYS.localEvents, updatedLocal);

        if (!savedRemotely && !adminState.supabaseNeedsSetup) {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Save Event Changes";
          }
          if (errEl) {
            errEl.textContent =
              lastRpcError ||
              "Could not update event in the database. Make sure the mochi_k_update_event SQL function has been added in Supabase.";
            errEl.hidden = false;
          }
          return;
        }

        adminState.editingEventId = null;
        await loadAllAdminData();
        refreshPublicEvents();
        showAdminToast(`Updated "${title}".`);
        return;
      }

      // 2. Handle inline Edit Sign-Up form submission
      const editForm = event.target.closest("[data-admin-signup-edit-form]");
      if (!editForm) return;
      event.preventDefault();

      const signupId = editForm.dataset.adminSignupEditForm;
      const errEl = editForm.querySelector("[data-admin-edit-error]");
      if (errEl) errEl.hidden = true;

      const primaryName = String(
        editForm.querySelector('input[name="primaryName"]')?.value || ""
      ).trim();
      const email = String(
        editForm.querySelector('input[name="email"]')?.value || ""
      )
        .trim()
        .toLowerCase();

      const extraPeopleInputs = Array.from(
        editForm.querySelectorAll('input[name="extraPerson"]')
      );
      const dogInputs = Array.from(
        editForm.querySelectorAll('input[name="dogName"]')
      );

      const extraPeople = extraPeopleInputs
        .map((inp) => String(inp.value || "").trim())
        .filter(Boolean);
      const dogs = dogInputs
        .map((inp) => String(inp.value || "").trim())
        .filter(Boolean);

      if (!primaryName) {
        if (errEl) {
          errEl.textContent = "Please enter a primary person name.";
          errEl.hidden = false;
        }
        return;
      }

      if (email && !email.includes("@")) {
        if (errEl) {
          errEl.textContent =
            "Please enter a valid email address (or leave it blank).";
          errEl.hidden = false;
        }
        return;
      }

      const submitBtn = editForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving…";
      }

      const localSignups = readJsonStorage(STORAGE_KEYS.localEventSignups, []);
      let foundLocal = false;
      const updatedLocal = localSignups.map((item) => {
        if (String(item.id) === String(signupId)) {
          foundLocal = true;
          return {
            ...item,
            name: primaryName,
            email,
            people: extraPeople,
            dogs,
          };
        }
        return item;
      });
      if (!foundLocal) {
        const existingAdminSignup = (adminState.eventSignups || []).find(
          (s) => String(s.id) === String(signupId)
        );
        if (existingAdminSignup) {
          updatedLocal.push({
            ...existingAdminSignup,
            name: primaryName,
            email,
            people: extraPeople,
            dogs,
          });
        }
      }
      writeJsonStorage(STORAGE_KEYS.localEventSignups, updatedLocal);

      if (adminState.activeKey) {
        await callSupabaseRpc("mochi_k_update_event_signup", {
          p_key: adminState.activeKey,
          p_signup_id: signupId,
          p_name: primaryName,
          p_email: email,
          p_people: extraPeople,
          p_dogs: dogs,
        });
      }

      adminState.editingSignupId = null;
      await loadAllAdminData();
      showAdminToast(`Updated sign-up for ${primaryName}.`);
    });
  }

  async function handleConfirmedAdminAction(type, id) {
    const token = adminState.activeKey;
    adminState.confirmTarget = null;

    if (type === "event_signup") {
      markIdDeleted(`signup:${id}`);
      const localSignups = readJsonStorage(
        STORAGE_KEYS.localEventSignups,
        []
      ).filter((s) => String(s.id) !== String(id));
      writeJsonStorage(STORAGE_KEYS.localEventSignups, localSignups);

      if (token) {
        await callSupabaseRpc("mochi_k_delete_event_signup", {
          p_key: token,
          p_signup_id: id,
        });
      }
      await loadAllAdminData();
      showAdminToast("Removed sign-up from event.");
      return;
    }

    if (type === "dog" || type === "volunteer") {
      markIdDeleted(id);
      if (type === "dog") {
        const localDogs = readJsonStorage(STORAGE_KEYS.localDogs, []).filter(
          (d) => String(d.id) !== String(id)
        );
        writeJsonStorage(STORAGE_KEYS.localDogs, localDogs);
      } else {
        const localVols = readJsonStorage(
          STORAGE_KEYS.localVolunteers,
          []
        ).filter((v) => String(v.id) !== String(id));
        writeJsonStorage(STORAGE_KEYS.localVolunteers, localVols);
      }

      if (token) {
        let delRes = await callSupabaseRpc("mochi_k_delete_submission", {
          p_key: token,
          p_kind: type,
          p_id: id,
        });
        if (
          !delRes.ok &&
          (delRes.code === "PGRST202" ||
            delRes.code === "404" ||
            delRes.code === "42883")
        ) {
          await callSupabaseRpc("mochi_admin_set_interest_status", {
            p_token: token,
            p_kind: type,
            p_id: id,
            p_status: "archived",
          });
        }
      }
      await loadAllAdminData();
      showAdminToast("Submission deleted.");
      return;
    }

    if (type === "event") {
      const targetEvent = adminState.events.find(
        (e) => String(e.id) === String(id)
      );
      markIdDeleted(id);
      const localEvents = readJsonStorage(STORAGE_KEYS.localEvents, []).filter(
        (e) => String(e.id) !== String(id)
      );
      writeJsonStorage(STORAGE_KEYS.localEvents, localEvents);

      if (token) {
        let delRes = await callSupabaseRpc("mochi_k_delete_event", {
          p_key: token,
          p_event_id: id,
        });
        if (
          !delRes.ok &&
          (delRes.code === "PGRST202" ||
            delRes.code === "404" ||
            delRes.code === "42883")
        ) {
          delRes = await callSupabaseRpc("mochi_admin_delete_event", {
            p_token: token,
            p_event_id: id,
          });
        }
        // Fallback if custom delete function hasn't been added yet: unpublish via mochi_admin_save_event
        if (!delRes.ok && targetEvent) {
          await callSupabaseRpc("mochi_admin_save_event", {
            p_token: token,
            p_id: targetEvent.id,
            p_title: targetEvent.title,
            p_kind: targetEvent.kind || "Gaggle walk",
            p_min_stage: targetEvent.min_stage || "gaggle",
            p_starts_at: targetEvent.starts_at,
            p_ends_at: targetEvent.ends_at,
            p_meeting_spot: targetEvent.meeting_spot,
            p_cap: Number(targetEvent.cap) || 15,
            p_status: "draft",
            p_notes: "[DELETED]",
          });
        }
      }
      await loadAllAdminData();
      showAdminToast("Event deleted.");
      return;
    }

    if (type === "subscriber") {
      const emailKey = String(id).trim().toLowerCase();
      markIdDeleted(`sub:${emailKey}`);
      const localSubs = readJsonStorage(
        STORAGE_KEYS.localSubscribers,
        []
      ).filter((s) => String(s.email || "").toLowerCase() !== emailKey);
      writeJsonStorage(STORAGE_KEYS.localSubscribers, localSubs);

      if (token) {
        let delRes = await callSupabaseRpc("mochi_k_delete_subscriber", {
          p_key: token,
          p_email: emailKey,
        });
        if (
          !delRes.ok &&
          (delRes.code === "PGRST202" ||
            delRes.code === "404" ||
            delRes.code === "42883")
        ) {
          await callSupabaseRpc("mochi_admin_delete_subscriber", {
            p_token: token,
            p_email: emailKey,
          });
        }
      }
      await loadAllAdminData();
      showAdminToast("Removed email from subscriber list.");
      return;
    }

    if (type === "key") {
      if (!adminState.isSuperAdmin) return;
      const targetKey = String(id).toLowerCase();
      if (targetKey === SUPER_ADMIN_KEY) {
        showAdminToast("Cannot revoke the Super Admin key.");
        return;
      }

      const revoked = getRevokedKeysSet();
      revoked.add(targetKey);
      writeJsonStorage(STORAGE_KEYS.revokedKeys, Array.from(revoked));

      const issued = readJsonStorage(STORAGE_KEYS.issuedKeys, []).filter(
        (k) => String(k.key).toLowerCase() !== targetKey
      );
      writeJsonStorage(STORAGE_KEYS.issuedKeys, issued);

      if (token) {
        const targetObj = adminState.keys.find(
          (k) => String(k.key).toLowerCase() === targetKey
        );
        const targetUuid =
          targetObj && targetObj.id && targetObj.id.includes("-")
            ? targetObj.id
            : null;
        let revRes = await callSupabaseRpc("mochi_k_revoke_key", {
          p_key: token,
          p_target_key: targetKey,
          p_target_id: targetUuid,
        });
        if (
          !revRes.ok &&
          (revRes.code === "PGRST202" ||
            revRes.code === "404" ||
            revRes.code === "42883")
        ) {
          await callSupabaseRpc("mochi_super_revoke_key", {
            p_token: token,
            p_target_key: targetKey,
          });
        }
      }
      await loadAllAdminData();
      showAdminToast("Admin key revoked.");
    }
  }

  // Add New Event Form Controls
  const toggleEventFormBtn = document.getElementById(
    "admin-toggle-event-form-btn"
  );
  const adminEventForm = document.getElementById("admin-event-form");
  const cancelEventBtn = document.getElementById("admin-cancel-event-btn");
  const cancelEventBtnBottom = document.getElementById(
    "admin-cancel-event-btn-bottom"
  );
  const adminEventDateInput = document.getElementById("admin-event-date");
  const adminEventFormError = document.getElementById("admin-event-form-error");

  function resetAddEventForm() {
    if (!adminEventForm) return;
    adminEventForm.reset();
    const titleInput = adminEventForm.elements.namedItem("title");
    const kindInput = adminEventForm.elements.namedItem("kind");
    const dateInput = adminEventForm.elements.namedItem("date");
    const startInput = adminEventForm.elements.namedItem("startTime");
    const endInput = adminEventForm.elements.namedItem("endTime");
    const spotInput = adminEventForm.elements.namedItem("meetingSpot");
    const mapUrlInput = adminEventForm.elements.namedItem("mapUrl");
    const capInput = adminEventForm.elements.namedItem("cap");
    const notesInput = adminEventForm.elements.namedItem("notes");

    if (titleInput) titleInput.value = "Gaggle of Goldens Walk";
    if (kindInput) kindInput.value = "Gaggle walk";
    if (dateInput) dateInput.value = "";
    if (startInput) startInput.value = "";
    if (endInput) endInput.value = "";
    if (spotInput) spotInput.value = "";
    if (mapUrlInput) mapUrlInput.value = "";
    if (capInput) capInput.value = "";
    if (notesInput) notesInput.value = "";
  }

  function openAddEventForm(open) {
    if (!adminEventForm || !toggleEventFormBtn) return;
    adminEventForm.hidden = !open;
    toggleEventFormBtn.hidden = open;
    if (adminEventFormError) adminEventFormError.hidden = true;
    if (open) {
      resetAddEventForm();
    }
  }

  if (toggleEventFormBtn) {
    toggleEventFormBtn.addEventListener("click", () => openAddEventForm(true));
  }
  if (cancelEventBtn) {
    cancelEventBtn.addEventListener("click", () => openAddEventForm(false));
  }
  if (cancelEventBtnBottom) {
    cancelEventBtnBottom.addEventListener("click", () =>
      openAddEventForm(false)
    );
  }

  if (adminEventForm) {
    adminEventForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (adminEventFormError) adminEventFormError.hidden = true;

      const fd = new FormData(adminEventForm);
      const title = String(fd.get("title") || "").trim();
      const kind = String(fd.get("kind") || "").trim();
      const date = String(fd.get("date") || "").trim();
      const startTime = String(fd.get("startTime") || "").trim();
      const endTime = String(fd.get("endTime") || "").trim();
      const meetingSpot = String(fd.get("meetingSpot") || "").trim();
      const mapUrl = String(fd.get("mapUrl") || "").trim();
      const rawCap = String(fd.get("cap") || "").trim();
      const parsedCap = Number(rawCap);
      const notes = String(fd.get("notes") || "").trim() || null;

      if (
        !title ||
        !kind ||
        !date ||
        !startTime ||
        !endTime ||
        !meetingSpot ||
        !rawCap ||
        !Number.isInteger(parsedCap) ||
        parsedCap < 1 ||
        parsedCap > 200
      ) {
        if (adminEventFormError) {
          adminEventFormError.textContent =
            "Please fill in the title, category, date, start/end time, meeting spot, and max dogs (1–200).";
          adminEventFormError.hidden = false;
        }
        return;
      }

      if (mapUrl && !/^https?:\/\//i.test(mapUrl)) {
        if (adminEventFormError) {
          adminEventFormError.textContent =
            "Please enter a full Google Maps URL starting with https:// (or leave it blank).";
          adminEventFormError.hidden = false;
        }
        return;
      }

      const cap = parsedCap;
      const packedMeetingSpot = formatMeetingSpotForSave(meetingSpot, mapUrl);

      if (endTime <= startTime) {
        if (adminEventFormError) {
          adminEventFormError.textContent =
            "End time must be after the start time.";
          adminEventFormError.hidden = false;
        }
        return;
      }

      const startsAt = denverLocalToIso(date, startTime);
      const endsAt = denverLocalToIso(date, endTime);

      const submitBtn = document.getElementById("admin-event-submit-btn");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Publishing…";
      }

      let savedRemotely = false;
      let lastRpcError = null;

      if (adminState.activeKey) {
        let rpcRes = await callSupabaseRpc("mochi_k_add_event", {
          p_key: adminState.activeKey,
          p_title: title,
          p_kind: kind,
          p_starts_at: startsAt,
          p_ends_at: endsAt,
          p_meeting_spot: packedMeetingSpot,
          p_cap: cap,
          p_notes: notes,
        });
        if (
          !rpcRes.ok &&
          (rpcRes.code === "PGRST202" ||
            rpcRes.code === "404" ||
            rpcRes.code === "42883")
        ) {
          rpcRes = await callSupabaseRpc("mochi_admin_save_event", {
            p_token: adminState.activeKey,
            p_id: null,
            p_title: title,
            p_kind: kind,
            p_min_stage: "gaggle",
            p_starts_at: startsAt,
            p_ends_at: endsAt,
            p_meeting_spot: packedMeetingSpot,
            p_cap: cap,
            p_status: "published",
            p_notes: notes,
          });
        }

        if (rpcRes.ok) {
          savedRemotely = true;
        } else {
          lastRpcError = rpcRes.message;
        }
      }

      // Only fall back to localStorage if Supabase SQL setup has not been run yet
      if (!savedRemotely) {
        if (adminState.supabaseNeedsSetup) {
          const fallbackEvent = {
            id: `evt-${Date.now()}`,
            title,
            kind,
            min_stage: "gaggle",
            starts_at: startsAt,
            ends_at: endsAt,
            meeting_spot: packedMeetingSpot,
            cap,
            confirmed: 0,
            status: "published",
            notes,
          };
          const localEvents = readJsonStorage(STORAGE_KEYS.localEvents, []);
          localEvents.push(fallbackEvent);
          writeJsonStorage(STORAGE_KEYS.localEvents, localEvents);
        } else {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Publish Event";
          }
          if (adminEventFormError) {
            adminEventFormError.textContent =
              lastRpcError ||
              "Could not save event to the database. Please check your connection and try again.";
            adminEventFormError.hidden = false;
          }
          return;
        }
      }

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Publish Event";
      }

      resetAddEventForm();
      openAddEventForm(false);
      await loadAllAdminData();
      showAdminToast(`Published "${title}"!`);
    });
  }

  // Copy All Emails for BCC Button
  const copyBccBtn = document.getElementById("admin-copy-bcc-btn");
  const copyBccLabel = document.getElementById("admin-copy-bcc-label");
  const bccInput = document.getElementById("admin-bcc-input");

  if (bccInput) {
    bccInput.addEventListener("focus", () => bccInput.select());
    bccInput.addEventListener("click", () => bccInput.select());
  }

  if (copyBccBtn) {
    copyBccBtn.addEventListener("click", async () => {
      const emails = adminState.subscribers.map((s) => s.email).join(", ");
      if (!emails) return;
      const ok = await copyTextToClipboard(emails, bccInput);
      if (ok) {
        if (copyBccLabel) {
          copyBccLabel.textContent = `Copied ${adminState.subscribers.length} ${
            adminState.subscribers.length === 1 ? "email" : "emails"
          }!`;
          window.setTimeout(() => {
            copyBccLabel.textContent = "Copy all emails for BCC";
          }, 2500);
        }
        showAdminToast("Copied all emails for BCC.");
      } else {
        showAdminToast(
          "Selected BCC emails in the text box — press Cmd+C / Ctrl+C to copy."
        );
      }
    });
  }

  // Copy Own Link Button
  const copyOwnLinkBtn = document.getElementById("admin-copy-own-link-btn");
  const ownLinkInput = document.getElementById("admin-own-link-input");
  if (ownLinkInput) {
    ownLinkInput.addEventListener("click", () => ownLinkInput.select());
  }
  if (copyOwnLinkBtn && ownLinkInput) {
    copyOwnLinkBtn.addEventListener("click", async () => {
      const ok = await copyTextToClipboard(ownLinkInput.value, ownLinkInput);
      showAdminToast(
        ok ? "Copied your personal login link!" : "Selected link to copy."
      );
    });
  }

  // Generate New Admin Key Form
  const generateKeyForm = document.getElementById("admin-generate-key-form");
  const newKeyResultBox = document.getElementById("admin-new-key-result");
  const newKeyOwnerEl = document.getElementById("admin-new-key-owner");
  const newKeyLinkInput = document.getElementById("admin-new-key-link-input");
  const copyNewKeyLinkBtn = document.getElementById(
    "admin-copy-new-key-link-btn"
  );
  const copyNewKeyRawBtn = document.getElementById(
    "admin-copy-new-key-raw-btn"
  );
  let latestGeneratedRawKey = "";

  if (generateKeyForm) {
    generateKeyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fd = new FormData(generateKeyForm);
      const name = String(fd.get("keyName") || "").trim();
      const email = String(fd.get("keyEmail") || "").trim();
      if (!name) {
        showAdminToast("Please enter a name or label for the new admin key.");
        return;
      }

      let generatedKey = generateHexKey(16);

      if (adminState.activeKey) {
        let createRes = await callSupabaseRpc("mochi_k_create_key", {
          p_key: adminState.activeKey,
          p_label: name,
          p_email: email || null,
        });
        if (
          !createRes.ok &&
          (createRes.code === "PGRST202" ||
            createRes.code === "404" ||
            createRes.code === "42883")
        ) {
          createRes = await callSupabaseRpc("mochi_admin_create_key", {
            p_token: adminState.activeKey,
            p_name: name,
            p_email: email || null,
            p_new_token: generatedKey,
          });
        }
        if (createRes.ok && createRes.data && createRes.data.key) {
          generatedKey = String(createRes.data.key).toLowerCase();
        }
      }

      const issued = readJsonStorage(STORAGE_KEYS.issuedKeys, []);
      issued.unshift({
        id: `key-${Date.now()}`,
        name,
        email,
        role: "admin",
        title: "Admin",
        key: generatedKey,
        created_at: new Date().toISOString(),
      });
      writeJsonStorage(STORAGE_KEYS.issuedKeys, issued);

      latestGeneratedRawKey = generatedKey;
      const magicLink = buildAdminMagicLink(generatedKey);

      if (newKeyOwnerEl) newKeyOwnerEl.textContent = name;
      if (newKeyLinkInput) newKeyLinkInput.value = magicLink;
      if (newKeyResultBox) newKeyResultBox.hidden = false;

      generateKeyForm.reset();
      await loadAllAdminData();
      showAdminToast(`Generated new admin key for ${name}!`);
    });
  }

  if (copyNewKeyLinkBtn && newKeyLinkInput) {
    copyNewKeyLinkBtn.addEventListener("click", async () => {
      const ok = await copyTextToClipboard(
        newKeyLinkInput.value,
        newKeyLinkInput
      );
      showAdminToast(ok ? "Copied new login link!" : "Selected link to copy.");
    });
  }

  if (copyNewKeyRawBtn) {
    copyNewKeyRawBtn.addEventListener("click", async () => {
      if (!latestGeneratedRawKey) return;
      const ok = await copyTextToClipboard(latestGeneratedRawKey);
      showAdminToast(ok ? "Copied 32-character key!" : "Couldn't copy key.");
    });
  }

  // Initial route check on boot
  syncViewFromLocation();
})();
