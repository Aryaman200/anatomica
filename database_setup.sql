-- Run this in the Supabase SQL Editor once your project is ready

-- 1. Create subscriptions table
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  tier text not null default 'free',
  status text not null default 'active',
  razorpay_sub_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Create usage table
create table public.usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null default current_date,
  week_start date not null,
  messages_used int default 0,
  quizzes_used int default 0,
  updated_at timestamptz default now(),
  unique(user_id, date)
);

-- 3. Create events table (for analytics)
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  event text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- 4. Enable Row Level Security (RLS)
alter table public.subscriptions enable row level security;
alter table public.usage enable row level security;
alter table public.events enable row level security;

-- 5. Create Policies (Users can only read their own data)
create policy "Users can view own subscription" on public.subscriptions for select using (auth.uid() = user_id);
create policy "Users can view own usage" on public.usage for select using (auth.uid() = user_id);

-- Note: Inserts and Updates will be handled securely by our Vercel Edge Functions using the SERVICE_ROLE key,
-- so we don't need to allow insert/update from the client.
