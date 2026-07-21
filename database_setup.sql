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

-- 4. Create orders table — server-side record of every Razorpay order.
--    verify.js trusts THIS table for tier/amount, never the client request body.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_id text unique not null,          -- Razorpay order id
  user_id uuid references auth.users not null,
  tier text not null,                     -- 'plus' | 'pro' — the tier that was paid for
  amount int not null,                    -- expected amount in paise
  currency text not null default 'INR',
  status text not null default 'created', -- 'created' | 'paid'
  payment_id text unique,                 -- unique => a payment can settle at most one order (replay guard)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4a. Create user_progress table (for Spaced Repetition)
create table public.user_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  topic text not null,
  correct_count int default 0,
  total_attempts int default 0,
  interval_days real default 1.0,
  ease_factor real default 2.5,
  next_review_date timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, topic)
);

-- 4b. Create user_bookmarks table
create table public.user_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  part_id text not null,
  note text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, part_id)
);

-- 5. Enable Row Level Security (RLS)
alter table public.subscriptions enable row level security;
alter table public.usage enable row level security;
alter table public.events enable row level security;
alter table public.orders enable row level security;
alter table public.user_progress enable row level security;
alter table public.user_bookmarks enable row level security;

-- 6. Create Policies (Users can only read their own data)
create policy "Users can view own subscription" on public.subscriptions for select using (auth.uid() = user_id);
create policy "Users can view own usage" on public.usage for select using (auth.uid() = user_id);
create policy "Users can view own progress" on public.user_progress for select using (auth.uid() = user_id);
create policy "Users can view own bookmarks" on public.user_bookmarks for select using (auth.uid() = user_id);
-- orders: no client policy on purpose => only the Edge/Node functions (service_role) touch it.

-- Note: Inserts and Updates are handled server-side by our Vercel functions using the
-- SERVICE_ROLE key, so we don't allow insert/update from the browser.

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Atomic usage counters — close the check-then-write race so concurrent
--    requests can't blow past a tier's limit.
-- ────────────────────────────────────────────────────────────────────────────

-- consume_message: atomically increments today's messages_used only while it is
-- below p_limit. Returns the new count, or -1 when the limit is already reached.
create or replace function public.consume_message(
  p_user uuid, p_date date, p_week date, p_limit int
) returns int language plpgsql as $$
declare new_count int;
begin
  insert into public.usage (user_id, date, week_start, messages_used, quizzes_used)
  values (p_user, p_date, p_week, 0, 0)
  on conflict (user_id, date) do nothing;

  -- The WHERE clause is the atomic guard: concurrent callers serialize on the
  -- row lock, and only those still under the limit succeed.
  update public.usage
     set messages_used = messages_used + 1, updated_at = now()
   where user_id = p_user and date = p_date and messages_used < p_limit
  returning messages_used into new_count;

  if new_count is null then
    return -1; -- limit reached
  end if;
  return new_count;
end; $$;

-- refund_message: give back one message when the upstream AI call fails.
create or replace function public.refund_message(p_user uuid, p_date date)
returns void language plpgsql as $$
begin
  update public.usage
     set messages_used = greatest(0, messages_used - 1), updated_at = now()
   where user_id = p_user and date = p_date;
end; $$;

-- consume_quiz: atomically enforces the WEEKLY quiz limit across all day-rows.
-- A per-user advisory lock serializes callers even before any row exists.
-- Returns true if the quiz was granted (and counted), false if over limit.
create or replace function public.consume_quiz(
  p_user uuid, p_date date, p_week date, p_limit int
) returns boolean language plpgsql as $$
declare week_total int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  select coalesce(sum(quizzes_used), 0) into week_total
    from public.usage
   where user_id = p_user and week_start = p_week;

  if week_total >= p_limit then
    return false;
  end if;

  insert into public.usage (user_id, date, week_start, quizzes_used, messages_used)
  values (p_user, p_date, p_week, 1, 0)
  on conflict (user_id, date)
  do update set quizzes_used = public.usage.quizzes_used + 1, updated_at = now();

  return true;
end; $$;
