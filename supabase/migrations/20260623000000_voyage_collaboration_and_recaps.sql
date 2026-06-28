-- Voyage collaboration and recap sharing.
-- Apply this to the Supabase project before relying on multi-contributor trips.

create table if not exists public.wl_trip_members (
  id text primary key,
  trip_id uuid not null references public.wl_trips(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text not null,
  display_name text,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (trip_id, invited_email)
);

create table if not exists public.wl_recap_shares (
  trip_id uuid primary key references public.wl_trips(id) on delete cascade,
  token text not null unique,
  snapshot jsonb not null,
  owner uuid not null default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.wl_trip_members enable row level security;
alter table public.wl_recap_shares enable row level security;

create or replace function public.wl_can_read_trip(_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.wl_trips t
    where t.id = _trip_id and t.owner = auth.uid()
  )
  or exists (
    select 1 from public.wl_trip_members m
    where m.trip_id = _trip_id
      and (
        m.user_id = auth.uid()
        or lower(m.invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  );
$$;

create or replace function public.wl_can_edit_trip(_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.wl_trips t
    where t.id = _trip_id and t.owner = auth.uid()
  )
  or exists (
    select 1 from public.wl_trip_members m
    where m.trip_id = _trip_id
      and m.role in ('owner', 'editor')
      and (
        m.user_id = auth.uid()
        or lower(m.invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  );
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wl_trip_members' and policyname = 'members_read_trip_members') then
    create policy members_read_trip_members on public.wl_trip_members for select using (public.wl_can_read_trip(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wl_trip_members' and policyname = 'owners_invite_trip_members') then
    create policy owners_invite_trip_members on public.wl_trip_members for insert with check (public.wl_can_edit_trip(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wl_trip_members' and policyname = 'members_claim_own_invites') then
    create policy members_claim_own_invites on public.wl_trip_members for update using (
      public.wl_can_edit_trip(trip_id)
      or lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    ) with check (
      public.wl_can_edit_trip(trip_id)
      or lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wl_trip_members' and policyname = 'owners_remove_trip_members') then
    create policy owners_remove_trip_members on public.wl_trip_members for delete using (public.wl_can_edit_trip(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wl_recap_shares' and policyname = 'public_read_recap_shares') then
    create policy public_read_recap_shares on public.wl_recap_shares for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wl_recap_shares' and policyname = 'members_write_recap_shares') then
    create policy members_write_recap_shares on public.wl_recap_shares for all using (public.wl_can_edit_trip(trip_id)) with check (public.wl_can_edit_trip(trip_id));
  end if;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['wl_trips','wl_legs','wl_places','wl_place_status','wl_journal_entries','wl_journal_photos','wl_private_notes']
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wl_trips' and policyname = 'members_read_trips') then
    create policy members_read_trips on public.wl_trips for select using (public.wl_can_read_trip(id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wl_legs' and policyname = 'members_read_legs') then
    create policy members_read_legs on public.wl_legs for select using (public.wl_can_read_trip(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wl_places' and policyname = 'members_manage_places') then
    create policy members_manage_places on public.wl_places for all using (public.wl_can_edit_trip(trip_id)) with check (public.wl_can_edit_trip(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wl_place_status' and policyname = 'members_manage_place_status') then
    create policy members_manage_place_status on public.wl_place_status for all using (public.wl_can_edit_trip(trip_id)) with check (public.wl_can_edit_trip(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wl_journal_entries' and policyname = 'members_manage_journal_entries') then
    create policy members_manage_journal_entries on public.wl_journal_entries for all using (public.wl_can_edit_trip(trip_id)) with check (public.wl_can_edit_trip(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wl_journal_photos' and policyname = 'members_manage_journal_photos') then
    create policy members_manage_journal_photos on public.wl_journal_photos for all using (public.wl_can_edit_trip(trip_id)) with check (public.wl_can_edit_trip(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wl_private_notes' and policyname = 'members_manage_private_notes') then
    create policy members_manage_private_notes on public.wl_private_notes for all using (public.wl_can_edit_trip(trip_id)) with check (public.wl_can_edit_trip(trip_id));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'authenticated_wl_photo_uploads') then
    create policy authenticated_wl_photo_uploads on storage.objects for insert to authenticated with check (bucket_id = 'wl-photos');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'authenticated_wl_photo_updates') then
    create policy authenticated_wl_photo_updates on storage.objects for update to authenticated using (bucket_id = 'wl-photos') with check (bucket_id = 'wl-photos');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'authenticated_wl_photo_deletes') then
    create policy authenticated_wl_photo_deletes on storage.objects for delete to authenticated using (bucket_id = 'wl-photos');
  end if;
end $$;
