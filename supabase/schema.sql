-- ==============================================================================
-- IBAMI - Ministerio de Alabanza: Supabase Database Schema
-- ==============================================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";

-- 2. ENUMS & DOMAINS
-- Instrumentos: guitarra, piano, bajo, voz, batería
-- Roles: admin, musician
-- Status: confirmado, pendiente, rechazado
-- Tempos: rápida, media, lenta
-- Tipos de servicio: domingo, midweek

-- 3. TABLA: profiles (Usuarios / Músicos vinculados con auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  instrument text not null check (instrument in ('guitarra', 'piano', 'bajo', 'voz', 'batería')),
  initials text not null,
  role text not null check (role in ('admin', 'musician')) default 'musician',
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. TABLA: songs (Repertorio de Canciones)
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. TABLA: service_events (Servicios y Programación)
create table if not exists public.service_events (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  type text not null check (type in ('domingo', 'midweek')),
  label text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6. TABLA: service_roster (Asignación de Músicos a Servicios)
create table if not exists public.service_roster (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.service_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('confirmado', 'pendiente', 'rechazado')) default 'pendiente',
  created_at timestamptz not null default now(),
  unique(event_id, user_id)
);

-- 7. TABLA: service_setlists (Canciones programadas por Servicio)
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
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

alter table public.profiles enable row level security;
alter table public.songs enable row level security;
alter table public.service_events enable row level security;
alter table public.service_roster enable row level security;
alter table public.service_setlists enable row level security;

-- PROFILES POLICIES
create policy "Cualquier usuario autenticado puede ver perfiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Los usuarios pueden actualizar su propio perfil"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "Admins pueden insertar y modificar cualquier perfil"
  on public.profiles for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- SONGS POLICIES
create policy "Cualquier usuario puede ver canciones"
  on public.songs for select
  to public
  using (true);

create policy "Permitir creación de canciones"
  on public.songs for insert
  to public
  with check (true);

create policy "Permitir actualización de letras y acordes"
  on public.songs for update
  to public
  using (true);

create policy "Solo admins pueden eliminar canciones"
  on public.songs for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- SERVICE EVENTS POLICIES
create policy "Cualquier usuario autenticado puede ver eventos"
  on public.service_events for select
  to authenticated
  using (true);

create policy "Admins pueden gestionar eventos"
  on public.service_events for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- SERVICE ROSTER POLICIES
create policy "Cualquier usuario autenticado puede ver el roster"
  on public.service_roster for select
  to authenticated
  using (true);

create policy "Músicos pueden actualizar su propio estado de asistencia"
  on public.service_roster for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Admins pueden gestionar todo el roster"
  on public.service_roster for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- SERVICE SETLISTS POLICIES
create policy "Cualquier usuario autenticado puede ver setlists"
  on public.service_setlists for select
  to authenticated
  using (true);

create policy "Admins pueden gestionar setlists"
  on public.service_setlists for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- ==============================================================================
-- AUTH TRIGGER: Auto-crear perfil al registrarse un usuario en Supabase Auth
-- ==============================================================================

create or replace function public.handle_new_user()
returns trigger as $$
declare
  user_name text;
  user_role text;
  user_instrument text;
  user_initials text;
begin
  user_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  user_role := coalesce(new.raw_user_meta_data->>'role', 'musician');
  user_instrument := coalesce(new.raw_user_meta_data->>'instrument', 'voz');
  
  -- Generar iniciales (primeras letras de las dos primeras palabras)
  user_initials := upper(
    substring(split_part(user_name, ' ', 1) from 1 for 1) ||
    coalesce(substring(split_part(user_name, ' ', 2) from 1 for 1), '')
  );
  if length(user_initials) = 0 then
    user_initials := 'IB';
  end if;

  insert into public.profiles (id, name, instrument, initials, role, email)
  values (
    new.id,
    user_name,
    user_instrument,
    user_initials,
    user_role,
    new.email
  )
  on conflict (id) do update
  set name = excluded.name,
      email = excluded.email;

  return new;
end;
$$ language plpgsql security definer;

-- Trigger tras registro en auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==============================================================================
-- SEED DATA (Datos Iniciales)
-- ==============================================================================

insert into public.songs (id, title, artist, key, tempo, tags, lyrics) values
(
  'a0000000-0000-0000-0000-000000000001',
  'Grande es tu Amor',
  'Hillsong en Español',
  'G',
  'lenta',
  array['adoración', 'amor'],
  '[
    {"label": "Verso 1", "segments": [{"chord": "G", "text": "Grande es "}, {"chord": "D", "text": "tu amor, "}, {"chord": "Em", "text": "grande es "}, {"chord": "C", "text": "tu gracia"}]},
    {"segments": [{"chord": "G", "text": "Tu misericordia "}, {"chord": "D", "text": "no tiene fin"}]},
    {"label": "Coro", "segments": [{"chord": "Em", "text": "Canto de "}, {"chord": "C", "text": "alabanza "}, {"chord": "G", "text": "a ti, mi Rey"}]},
    {"segments": [{"chord": "D", "text": "Por siempre "}, {"chord": "G", "text": "alabaré tu nombre"}]},
    {"label": "Puente", "segments": [{"chord": "C", "text": "Con todo mi ser "}, {"chord": "G", "text": "te alabaré"}]},
    {"segments": [{"chord": "D", "text": "Eterno "}, {"chord": "Em", "text": "Salvador, "}, {"chord": "C", "text": "mi Dios fiel"}]}
  ]'::jsonb
),
(
  'a0000000-0000-0000-0000-000000000002',
  'Rey de Reyes',
  'Hillsong Worship',
  'D',
  'rápida',
  array['alabanza', 'exaltación'],
  '[
    {"label": "Verso 1", "segments": [{"chord": "D", "text": "Rey de reyes, "}, {"chord": "A", "text": "Señor de señores"}]},
    {"segments": [{"chord": "Bm", "text": "Gloria, "}, {"chord": "G", "text": "gloria, "}, {"chord": "D", "text": "aleluya"}]},
    {"label": "Coro", "segments": [{"chord": "A", "text": "Por siempre "}, {"chord": "D", "text": "es su amor,"}, {"chord": "G", "text": " eterno"}]},
    {"segments": [{"chord": "Bm", "text": "Su gracia "}, {"chord": "A", "text": "es sin igual"}]}
  ]'::jsonb
),
(
  'a0000000-0000-0000-0000-000000000003',
  'En tu Presencia',
  'Marco Barrientos',
  'E',
  'lenta',
  array['adoración', 'presencia'],
  '[
    {"label": "Verso 1", "segments": [{"chord": "E", "text": "En tu presencia "}, {"chord": "B", "text": "es donde quiero estar"}]},
    {"segments": [{"chord": "C#m", "text": "Guardado "}, {"chord": "A", "text": "bajo la sombra "}, {"chord": "E", "text": "de tus alas"}]},
    {"label": "Coro", "segments": [{"chord": "A", "text": "Aquí me rindo, "}, {"chord": "E", "text": "aquí me entrego"}]},
    {"segments": [{"chord": "B", "text": "A ti, "}, {"chord": "C#m", "text": "Señor, "}, {"chord": "A", "text": "mi todo eres"}]}
  ]'::jsonb
),
(
  'a0000000-0000-0000-0000-000000000004',
  'Poderoso',
  'Elevation Worship',
  'C',
  'rápida',
  array['alabanza', 'poder'],
  '[
    {"label": "Verso 1", "segments": [{"chord": "C", "text": "Eres poderoso, "}, {"chord": "G", "text": "eres victorioso"}]},
    {"segments": [{"chord": "Am", "text": "Tu nombre "}, {"chord": "F", "text": "es exaltado "}, {"chord": "C", "text": "sobre todo"}]},
    {"label": "Coro", "segments": [{"chord": "F", "text": "Poderoso, "}, {"chord": "C", "text": "poderoso eres"}]},
    {"segments": [{"chord": "G", "text": "Rey eterno, "}, {"chord": "Am", "text": "soberano "}, {"chord": "F", "text": "Dios"}]}
  ]'::jsonb
),
(
  'a0000000-0000-0000-0000-000000000005',
  'Maravilloso',
  'Redimi2',
  'A',
  'media',
  array['adoración', 'maravilla'],
  '[
    {"label": "Verso 1", "segments": [{"chord": "A", "text": "Maravilloso, "}, {"chord": "E", "text": "Dios "}, {"chord": "F#m", "text": "maravilloso"}]},
    {"segments": [{"chord": "D", "text": "No hay otro "}, {"chord": "A", "text": "como tú, mi Dios"}]},
    {"label": "Coro", "segments": [{"chord": "E", "text": "Eres digno "}, {"chord": "D", "text": "de toda gloria"}]},
    {"segments": [{"chord": "A", "text": "Maravilloso "}, {"chord": "E", "text": "eres, "}, {"chord": "D", "text": "Señor"}]}
  ]'::jsonb
)
on conflict (id) do nothing;
