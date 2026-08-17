-- ==============================================================================
-- IBAMI - MINISTERIO DE ALABANZA: SUPABASE DATABASE SCHEMA (CORRECTED & PERMISSIVE)
-- ==============================================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";

-- 2. ELIMINAR POLÍTICAS ANTERIORES QUE PUEDAN BLOQUEAR CAMBIOS DE COLUMNA
do $$
declare
  r record;
begin
  for r in (select schemaname, tablename, policyname from pg_policies where schemaname = 'public') loop
    execute format('drop policy if exists %I on %I.%I;', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- 3. TABLA: profiles (Usuarios / Músicos del Ministerio)
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  instrument text not null default 'guitarra',
  secondary_instruments text[] not null default '{}',
  initials text not null,
  role text not null default 'musician',
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Quitar restricciones rígidas y dependencias hacia auth.users para login directo por celular/correo
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles drop constraint if exists profiles_instrument_check;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles add column if not exists secondary_instruments text[] default '{}';

-- 4. TABLA: songs (Repertorio de Canciones)
create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null,
  key text not null,
  tempo text not null default 'media',
  tags text[] not null default '{}',
  lyrics jsonb not null default '[]'::jsonb,
  chordpro text,
  media_url text,
  notion_id text,
  is_classic boolean default false,
  church_domain text default 'Conocida',
  team_domain text default 'Por practicar',
  musical_type text default 'Worship contemporáneo',
  technical_complexity text default 'Básica',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.songs drop constraint if exists songs_tempo_check;
alter table public.songs add column if not exists church_domain text default 'Conocida';
alter table public.songs add column if not exists team_domain text default 'Por practicar';
alter table public.songs add column if not exists musical_type text default 'Worship contemporáneo';
alter table public.songs add column if not exists technical_complexity text default 'Básica';
alter table public.songs add column if not exists is_classic boolean default false;

-- 5. TABLA: service_events (Servicios y Programación)
create table if not exists public.service_events (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  type text not null default 'domingo',
  label text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_events drop constraint if exists service_events_type_check;
alter table public.service_events alter column id set default gen_random_uuid();

-- 6. TABLA: service_roster (Asignación de Músicos a Servicios)
create table if not exists public.service_roster (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.service_events(id) on delete cascade,
  user_id text not null,
  status text not null default 'pendiente',
  instrument text,
  secondary_instruments text[] default '{}',
  created_at timestamptz not null default now(),
  unique(event_id, user_id)
);

alter table public.service_roster drop constraint if exists service_roster_user_id_fkey;
alter table public.service_roster alter column user_id type text;
alter table public.service_roster add column if not exists instrument text;
alter table public.service_roster add column if not exists secondary_instruments text[] default '{}';

-- 7. TABLA: service_setlists (Canciones programadas por Servicio)
create table if not exists public.service_setlists (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.service_events(id) on delete cascade,
  song_id text not null,
  position integer not null default 1,
  key_override text,
  notes text,
  created_at timestamptz not null default now(),
  unique(event_id, song_id)
);

alter table public.service_setlists drop constraint if exists service_setlists_song_id_fkey;
alter table public.service_setlists alter column song_id type text;

-- 8. DESACTIVAR RLS Y OTORGAR ACCESO TOTAL
alter table public.profiles disable row level security;
alter table public.songs disable row level security;
alter table public.service_events disable row level security;
alter table public.service_roster disable row level security;
alter table public.service_setlists disable row level security;

-- Otorgar permisos globales a todos los roles
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all on all routines in schema public to postgres, anon, authenticated, service_role;
