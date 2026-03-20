-- ============================================================
-- GlucoTrack — Supabase Schema (clean install version)
-- Run this entire file in: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. DROP OLD POLICIES if they exist
drop policy if exists "Patients read own profile" on public.profiles;
drop policy if exists "Patients update own profile" on public.profiles;
drop policy if exists "Patients insert own profile" on public.profiles;
drop policy if exists "Doctors read all profiles" on public.profiles;
drop policy if exists "Patients manage own logs" on public.glucose_logs;
drop policy if exists "Doctors read all logs" on public.glucose_logs;

-- 2. PROFILES TABLE
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('patient', 'doctor')) default 'patient',
  full_name text,
  dob date,
  sex char(1),
  weight_kg numeric(5,2),
  diagnosis_year int,
  regimen text default 'nph_regular',
  physician_name text,
  notes text,
  created_at timestamptz default now()
);

-- 3. GLUCOSE LOGS TABLE
create table if not exists public.glucose_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null,
  -- RBS values in mg/dL
  am_rbs numeric(6,1),
  pm_rbs numeric(6,1),
  -- N&R regimen doses
  am_n_dose numeric(5,1),
  am_r_dose numeric(5,1),
  pm_n_dose numeric(5,1),
  pm_r_dose numeric(5,1),
  -- Basal-bolus / pump doses
  am_basal numeric(5,2),
  am_bolus numeric(5,1),
  pm_basal numeric(5,2),
  pm_bolus numeric(5,1),
  notes text,
  created_at timestamptz default now(),
  unique(patient_id, log_date)
);

-- 4. ENABLE ROW LEVEL SECURITY
alter table public.profiles enable row level security;
alter table public.glucose_logs enable row level security;

-- 5. PROFILES POLICIES
create policy "Patients read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Patients update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Patients insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Doctors read all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'doctor'
    )
  );

-- 6. GLUCOSE LOG POLICIES
create policy "Patients manage own logs"
  on public.glucose_logs for all
  using (auth.uid() = patient_id)
  with check (auth.uid() = patient_id);

create policy "Doctors read all logs"
  on public.glucose_logs for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'doctor'
    )
  );

-- ============================================================
-- SUCCESS: Both tables and all policies are now set up.
--
-- NEXT STEP — create a doctor account:
-- 1. Supabase > Authentication > Users > Invite user (enter doctor email)
-- 2. After they set their password, run this (swap in real details):
--
--    insert into public.profiles (id, role, full_name)
--    select id, 'doctor', 'Dr. Smith'
--    from auth.users where email = 'doctor@clinic.com';
--
-- ============================================================
