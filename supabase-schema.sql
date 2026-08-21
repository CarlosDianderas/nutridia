-- Corre esto en el SQL Editor de tu proyecto de Supabase

create table days (
  user_id uuid references auth.users not null,
  date date not null,
  data jsonb not null,
  updated_at timestamptz default now(),
  primary key (user_id, date)
);

create table profile_data (
  user_id uuid references auth.users primary key,
  goals jsonb,
  favorites jsonb,
  updated_at timestamptz default now()
);

alter table days enable row level security;
alter table profile_data enable row level security;

create policy "cada quien ve solo sus días" on days
  for all using (auth.uid() = user_id);

create policy "cada quien ve solo su perfil" on profile_data
  for all using (auth.uid() = user_id);
