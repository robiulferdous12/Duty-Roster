-- ─────────────────────────────────────────────────────────────
-- Duty Roster — Supabase Relational Schema
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run
-- ─────────────────────────────────────────────────────────────

-- Enable UUID extension if not enabled
create extension if not exists "pgcrypto";

-- Automatic updated_at timestamp trigger function
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ─────────────────────────────────────────────────────────────
-- 1. App Settings (singleton table for current viewing month/year)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.app_settings (
  id smallint primary key default 1,
  year integer not null default 2026,
  month integer not null default 6, -- 0-indexed (0 = Jan, 6 = Jul, etc.)
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2. Employees Table
-- ─────────────────────────────────────────────────────────────
create table if not exists public.employees (
  id text primary key,
  name text not null,
  designation text not null,
  team text,
  phone text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists employees_set_updated_at on public.employees;
create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 3. Public Holidays Table
-- ─────────────────────────────────────────────────────────────
create table if not exists public.public_holidays (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists public_holidays_set_updated_at on public.public_holidays;
create trigger public_holidays_set_updated_at
  before update on public.public_holidays
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4. CEP (Contact/Emergency Personnel) Directory Table
-- ─────────────────────────────────────────────────────────────
create table if not exists public.cep_directory (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  number text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists cep_directory_set_updated_at on public.cep_directory;
create trigger cep_directory_set_updated_at
  before update on public.cep_directory
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 5. Roster Entries (Daily Shift & Leave per employee per date)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.roster_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references public.employees(id) on delete cascade on update cascade,
  date date not null,
  duty text,
  leave text,
  short_leave numeric(4, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roster_entries_emp_date_unique unique (employee_id, date)
);

create index if not exists idx_roster_entries_date on public.roster_entries(date);
create index if not exists idx_roster_entries_emp_date on public.roster_entries(employee_id, date);

drop trigger if exists roster_entries_set_updated_at on public.roster_entries;
create trigger roster_entries_set_updated_at
  before update on public.roster_entries
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 6. Overtime Entries Table
-- ─────────────────────────────────────────────────────────────
create table if not exists public.overtime_entries (
  id text primary key default gen_random_uuid()::text,
  employee_id text references public.employees(id) on delete set null on update cascade,
  date date not null,
  from_time text not null,
  to_time text not null,
  total_hours numeric(5, 2) not null,
  cep_id text references public.cep_directory(id) on delete set null on update cascade,
  cep_name text,
  cep_number text,
  lunch_break boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_overtime_entries_date on public.overtime_entries(date);
create index if not exists idx_overtime_entries_emp on public.overtime_entries(employee_id);

drop trigger if exists overtime_entries_set_updated_at on public.overtime_entries;
create trigger overtime_entries_set_updated_at
  before update on public.overtime_entries
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 7. Short Leave Entries Table (Clock-time list records)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.short_leave_entries (
  id text primary key default gen_random_uuid()::text,
  employee_id text not null references public.employees(id) on delete cascade on update cascade,
  date date not null,
  from_time text not null,
  to_time text not null,
  total_hours numeric(5, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_short_leave_entries_date on public.short_leave_entries(date);
create index if not exists idx_short_leave_entries_emp on public.short_leave_entries(employee_id);

drop trigger if exists short_leave_entries_set_updated_at on public.short_leave_entries;
create trigger short_leave_entries_set_updated_at
  before update on public.short_leave_entries
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Row Level Security (RLS)
-- ─────────────────────────────────────────────────────────────
alter table public.app_settings enable row level security;
alter table public.employees enable row level security;
alter table public.public_holidays enable row level security;
alter table public.cep_directory enable row level security;
alter table public.roster_entries enable row level security;
alter table public.overtime_entries enable row level security;
alter table public.short_leave_entries enable row level security;

-- App Settings policies
drop policy if exists "app_settings_select" on public.app_settings;
create policy "app_settings_select" on public.app_settings for select using (true);
drop policy if exists "app_settings_insert" on public.app_settings;
create policy "app_settings_insert" on public.app_settings for insert with check (true);
drop policy if exists "app_settings_update" on public.app_settings;
create policy "app_settings_update" on public.app_settings for update using (true);

-- Employees policies
drop policy if exists "employees_select" on public.employees;
create policy "employees_select" on public.employees for select using (true);
drop policy if exists "employees_insert" on public.employees;
create policy "employees_insert" on public.employees for insert with check (true);
drop policy if exists "employees_update" on public.employees;
create policy "employees_update" on public.employees for update using (true);
drop policy if exists "employees_delete" on public.employees;
create policy "employees_delete" on public.employees for delete using (true);

-- Public Holidays policies
drop policy if exists "public_holidays_select" on public.public_holidays;
create policy "public_holidays_select" on public.public_holidays for select using (true);
drop policy if exists "public_holidays_insert" on public.public_holidays;
create policy "public_holidays_insert" on public.public_holidays for insert with check (true);
drop policy if exists "public_holidays_update" on public.public_holidays;
create policy "public_holidays_update" on public.public_holidays for update using (true);
drop policy if exists "public_holidays_delete" on public.public_holidays;
create policy "public_holidays_delete" on public.public_holidays for delete using (true);

-- CEP Directory policies
drop policy if exists "cep_directory_select" on public.cep_directory;
create policy "cep_directory_select" on public.cep_directory for select using (true);
drop policy if exists "cep_directory_insert" on public.cep_directory;
create policy "cep_directory_insert" on public.cep_directory for insert with check (true);
drop policy if exists "cep_directory_update" on public.cep_directory;
create policy "cep_directory_update" on public.cep_directory for update using (true);
drop policy if exists "cep_directory_delete" on public.cep_directory;
create policy "cep_directory_delete" on public.cep_directory for delete using (true);

-- Roster Entries policies
drop policy if exists "roster_entries_select" on public.roster_entries;
create policy "roster_entries_select" on public.roster_entries for select using (true);
drop policy if exists "roster_entries_insert" on public.roster_entries;
create policy "roster_entries_insert" on public.roster_entries for insert with check (true);
drop policy if exists "roster_entries_update" on public.roster_entries;
create policy "roster_entries_update" on public.roster_entries for update using (true);
drop policy if exists "roster_entries_delete" on public.roster_entries;
create policy "roster_entries_delete" on public.roster_entries for delete using (true);

-- Overtime Entries policies
drop policy if exists "overtime_entries_select" on public.overtime_entries;
create policy "overtime_entries_select" on public.overtime_entries for select using (true);
drop policy if exists "overtime_entries_insert" on public.overtime_entries;
create policy "overtime_entries_insert" on public.overtime_entries for insert with check (true);
drop policy if exists "overtime_entries_update" on public.overtime_entries;
create policy "overtime_entries_update" on public.overtime_entries for update using (true);
drop policy if exists "overtime_entries_delete" on public.overtime_entries;
create policy "overtime_entries_delete" on public.overtime_entries for delete using (true);

-- Short Leave Entries policies
drop policy if exists "short_leave_entries_select" on public.short_leave_entries;
create policy "short_leave_entries_select" on public.short_leave_entries for select using (true);
drop policy if exists "short_leave_entries_insert" on public.short_leave_entries;
create policy "short_leave_entries_insert" on public.short_leave_entries for insert with check (true);
drop policy if exists "short_leave_entries_update" on public.short_leave_entries;
create policy "short_leave_entries_update" on public.short_leave_entries for update using (true);
drop policy if exists "short_leave_entries_delete" on public.short_leave_entries;
create policy "short_leave_entries_delete" on public.short_leave_entries for delete using (true);

-- ─────────────────────────────────────────────────────────────
-- Seed Initial Data
-- ─────────────────────────────────────────────────────────────
insert into public.app_settings (id, year, month)
values (1, 2026, 6)
on conflict (id) do nothing;

insert into public.employees (id, name, designation, team, display_order)
values
  ('3405', 'Joyonta Debroy', 'Maint. Supervisor', 'Electrical', 1),
  ('3649', 'Kazi Likkhon', 'Sr. Electrician', 'Electrical', 2),
  ('5864', 'Amdadul Haque', 'Sr. Electrician', 'Electrical', 3),
  ('6529', 'Jamal Uddin', 'Electrician', 'Electrical', 4),
  ('7657', 'Mamun Ur Rashid', 'Electrician', 'Electrical', 5),
  ('9474', 'Motiur Rahman', 'Electrician', 'Electrical', 6),
  ('9475', 'Saiful Islam', 'Electrician', 'Electrical', 7),
  ('37978', 'Ashraful Islam', 'Electrician', 'Electrical', 8),
  ('38000', 'Aktaruzzaman', 'Asst. Electrician', 'Electrical', 9),
  ('38027', 'Delwar Hossain', 'Asst. Electrician', 'Electrical', 10),
  ('7653', 'Solaiman Mia', 'Generator Operator', 'Substation', 11),
  ('7654', 'Obaidul Haque', 'Generator Operator', 'Substation', 12),
  ('37965', 'Mofazzal Hossain', 'Asst. Electrician', 'Substation', 13),
  ('37999', 'Sumon Hossain', 'Asst. Electrician', 'Substation', 14),
  ('4693', 'Abul Kalam', 'Sr. Technician', 'Mechanical', 15),
  ('6525', 'Shafiqul Islam', 'Technician', 'Mechanical', 16),
  ('6526', 'Abu Bakkor', 'Technician', 'Mechanical', 17),
  ('9472', 'Topesh Kumar', 'Technician', 'Mechanical', 18),
  ('37946', 'Khushi Mohon', 'Technician', 'Mechanical', 19),
  ('37943', 'Ridoy Bachchu', 'Fabricator', 'Mechanical', 20),
  ('37944', 'Mahmudul Hasan', 'Technician', 'Mechanical', 21),
  ('38022', 'Saidul Islam', 'Asst. Technician', 'Mechanical', 22),
  ('38019', 'Ziaul Haque', 'Painter', 'Paints', 23),
  ('4692', 'Marafat Ali', 'Store Keeper', 'Store', 24),
  ('6530', 'Abdul Mannan', 'Store Keeper', 'Store', 25),
  ('37967', 'Unus Ali', 'Asst. Machine Oper.', 'Store', 26),
  ('1270', 'Anisur Rahman', 'Maint. Supervisor', 'Mechanical', 27),
  ('6528', 'Mohor Ali', 'Sr. Technician', 'Electrical', 28),
  ('2824', 'Mir Rabiul Azam', 'Sr. Technician', 'Mechanical', 29),
  ('3404', 'Samol Chandra', 'Sr. Technician', 'Mechanical', 30),
  ('24367', 'Ruhul Amin', 'Sr. Technician', 'Mechanical', 31),
  ('15450', 'Sumon Morol', 'Asst. Technician', 'Paints', 32),
  ('21482', 'Ashik', 'Asst. Technician', 'Paints', 33),
  ('21498', 'Abdul Bari', 'Technician', 'Mechanical', 34)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 8. App Users Table (Authentication and Roles)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password text not null,
  role text not null check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

-- Insert default accounts
insert into public.app_users (username, password, role)
values 
  ('admin', 'admin123', 'admin'),
  ('user', 'user123', 'user')
on conflict (username) do nothing;

-- Enable RLS but allow all operations via anon key (internal app)
alter table public.app_users enable row level security;

create policy "Allow public read access on app_users"
  on public.app_users for select
  using (true);

create policy "Allow public insert on app_users"
  on public.app_users for insert
  with check (true);

create policy "Allow public update on app_users"
  on public.app_users for update
  using (true);

create policy "Allow public delete on app_users"
  on public.app_users for delete
  using (true);
