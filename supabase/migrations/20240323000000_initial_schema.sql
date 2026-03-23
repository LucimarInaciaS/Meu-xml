-- 20240323000000_initial_schema.sql

-- 1. Create Invoices Table
create table if not exists public.invoices (
  id uuid default gen_random_uuid() primary key,
  chNFe text not null,
  nome text not null,
  valor numeric(15, 2) not null,
  data timestamp with time zone not null,
  status text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone default now() not null
);

-- 2. Create Subscriptions Table
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('active', 'canceled', 'past_due', 'trialing')),
  updated_at timestamp with time zone default now() not null
);

-- 3. Enable Row Level Security (RLS)
alter table public.invoices enable row level security;
alter table public.subscriptions enable row level security;

-- 4. Invoices Policies
drop policy if exists "Users can view their own invoices" on public.invoices;
create policy "Users can view their own invoices"
  on public.invoices for select
  using ( auth.uid() = user_id );

drop policy if exists "Users can insert their own invoices" on public.invoices;
create policy "Users can insert their own invoices"
  on public.invoices for insert
  with check ( auth.uid() = user_id );

drop policy if exists "Users can update their own invoices" on public.invoices;
create policy "Users can update their own invoices"
  on public.invoices for update
  using ( auth.uid() = user_id );

drop policy if exists "Users can delete their own invoices" on public.invoices;
create policy "Users can delete their own invoices"
  on public.invoices for delete
  using ( auth.uid() = user_id );

-- 5. Subscriptions Policies
drop policy if exists "Users can view their own subscription status" on public.subscriptions;
create policy "Users can view their own subscription status"
  on public.subscriptions for select
  using ( auth.uid() = user_id );

-- 6. Enable Realtime for Invoices
begin;
  -- remove the table from realtime publication if it exists
  drop publication if exists supabase_realtime;
  -- create the publication and add the table
  create publication supabase_realtime for table public.invoices;
commit;

-- 7. Indexes for performance
create index if not exists invoices_user_id_idx on public.invoices (user_id);
create index if not exists invoices_data_idx on public.invoices (data desc);
