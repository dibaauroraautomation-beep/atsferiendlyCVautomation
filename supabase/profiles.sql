-- Creates the "profiles" table the app reads (AuthContext, login page, userData).
-- Run once: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.

create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text,
  first_name        text,
  last_name         text,
  language          text,
  registration_type text,
  cv_path           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Copies the sign-up metadata into "profiles" for every new user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, language, registration_type)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'language',
    new.raw_user_meta_data ->> 'registration_type'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Rows for users that already exist.
insert into public.profiles (id, email, first_name, last_name, language, registration_type)
select u.id, u.email,
       u.raw_user_meta_data ->> 'first_name',
       u.raw_user_meta_data ->> 'last_name',
       u.raw_user_meta_data ->> 'language',
       u.raw_user_meta_data ->> 'registration_type'
from auth.users u
on conflict (id) do nothing;

-- Make the new table visible to the API right away.
notify pgrst, 'reload schema';
