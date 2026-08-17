-- ==============================================================================
-- IBAMI - Ministerio de Alabanza: Supabase Database Schema
-- ==============================================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";

-- 2. TABLA: profiles (Usuarios / Músicos del Ministerio)
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  instrument text not null default 'guitarra',
  secondary_instruments text[] not null default '{}',
  initials text not null,
  role text not null check (role in ('admin', 'musician', 'both')) default 'musician',
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Asegurar constraints flexibles en tablas existentes
alter table public.profiles drop constraint if exists profiles_instrument_check;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'musician', 'both'));
alter table public.profiles add column if not exists secondary_instruments text[] default '{}';

-- 3. TABLA: songs (Repertorio de Canciones de IBAMI)
create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  artist text not null,
  key text not null,
  tempo text not null check (tempo in ('rápida', 'media', 'lenta')) default 'media',
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

-- Asegurar columnas de canciones en tablas existentes
alter table public.songs add column if not exists church_domain text default 'Conocida';
alter table public.songs add column if not exists team_domain text default 'Por practicar';
alter table public.songs add column if not exists musical_type text default 'Worship contemporáneo';
alter table public.songs add column if not exists technical_complexity text default 'Básica';
alter table public.songs add column if not exists is_classic boolean default false;

-- 4. TABLA: service_events (Servicios y Programación)
create table if not exists public.service_events (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  type text not null check (type in ('domingo', 'midweek')),
  label text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. TABLA: service_roster (Asignación de Músicos a Servicios)
create table if not exists public.service_roster (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.service_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('confirmado', 'pendiente', 'rechazado')) default 'pendiente',
  created_at timestamptz not null default now(),
  unique(event_id, user_id)
);

-- 6. TABLA: service_setlists (Canciones programadas por Servicio)
create table if not exists public.service_setlists (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.service_events(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  position integer not null,
  key_override text,
  notes text,
  created_at timestamptz not null default now(),
  unique(event_id, song_id)
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES PERMISIVAS
-- ==============================================================================

alter table public.profiles enable row level security;
alter table public.songs enable row level security;
alter table public.service_events enable row level security;
alter table public.service_roster enable row level security;
alter table public.service_setlists enable row level security;

-- PROFILES POLICIES
drop policy if exists "Permitir lectura de perfiles" on public.profiles;
drop policy if exists "Permitir insercion de perfiles" on public.profiles;
drop policy if exists "Permitir actualizacion de perfiles" on public.profiles;
drop policy if exists "Permitir eliminacion de perfiles" on public.profiles;

create policy "Permitir lectura de perfiles" on public.profiles for select to public using (true);
create policy "Permitir insercion de perfiles" on public.profiles for insert to public with check (true);
create policy "Permitir actualizacion de perfiles" on public.profiles for update to public using (true);
create policy "Permitir eliminacion de perfiles" on public.profiles for delete to public using (true);

-- SONGS POLICIES
drop policy if exists "Permitir lectura de canciones" on public.songs;
drop policy if exists "Permitir insercion de canciones" on public.songs;
drop policy if exists "Permitir actualizacion de canciones" on public.songs;
drop policy if exists "Permitir eliminacion de canciones" on public.songs;

create policy "Permitir lectura de canciones" on public.songs for select to public using (true);
create policy "Permitir insercion de canciones" on public.songs for insert to public with check (true);
create policy "Permitir actualizacion de canciones" on public.songs for update to public using (true);
create policy "Permitir eliminacion de canciones" on public.songs for delete to public using (true);

-- SERVICE EVENTS POLICIES
drop policy if exists "Permitir lectura de eventos" on public.service_events;
drop policy if exists "Permitir insercion de eventos" on public.service_events;
drop policy if exists "Permitir actualizacion de eventos" on public.service_events;
drop policy if exists "Permitir eliminacion de eventos" on public.service_events;

create policy "Permitir lectura de eventos" on public.service_events for select to public using (true);
create policy "Permitir insercion de eventos" on public.service_events for insert to public with check (true);
create policy "Permitir actualizacion de eventos" on public.service_events for update to public using (true);
create policy "Permitir eliminacion de eventos" on public.service_events for delete to public using (true);

-- SERVICE ROSTER POLICIES
drop policy if exists "Permitir lectura de roster" on public.service_roster;
drop policy if exists "Permitir insercion de roster" on public.service_roster;
drop policy if exists "Permitir actualizacion de roster" on public.service_roster;
drop policy if exists "Permitir eliminacion de roster" on public.service_roster;

create policy "Permitir lectura de roster" on public.service_roster for select to public using (true);
create policy "Permitir insercion de roster" on public.service_roster for insert to public with check (true);
create policy "Permitir actualizacion de roster" on public.service_roster for update to public using (true);
create policy "Permitir eliminacion de roster" on public.service_roster for delete to public using (true);

-- SERVICE SETLISTS POLICIES
drop policy if exists "Permitir lectura de setlists" on public.service_setlists;
drop policy if exists "Permitir insercion de setlists" on public.service_setlists;
drop policy if exists "Permitir actualizacion de setlists" on public.service_setlists;
drop policy if exists "Permitir eliminacion de setlists" on public.service_setlists;

create policy "Permitir lectura de setlists" on public.service_setlists for select to public using (true);
create policy "Permitir insercion de setlists" on public.service_setlists for insert to public with check (true);
create policy "Permitir actualizacion de setlists" on public.service_setlists for update to public using (true);
create policy "Permitir eliminacion de setlists" on public.service_setlists for delete to public using (true);
