-- Sejuk Sejuk Service — Ops System schema
-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query).
-- Safe to re-run: uses IF NOT EXISTS / DROP ... IF EXISTS guards where practical.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Technicians
-- ─────────────────────────────────────────────────────────────
create table if not exists technicians (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Orders
-- ─────────────────────────────────────────────────────────────
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_no text unique not null,
  customer_name text not null,
  phone text,
  address text,
  problem_description text,
  service_type text not null,
  quoted_price numeric(10, 2) not null default 0,
  assigned_technician_id uuid references technicians(id),
  admin_notes text,
  status text not null default 'New'
    check (status in ('New', 'Assigned', 'In Progress', 'Job Done', 'Reviewed', 'Closed')),
  created_by text not null default 'Admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_technician on orders(assigned_technician_id);
create index if not exists idx_orders_created_at on orders(created_at);

-- auto-generate order_no like ORDER1001, ORDER1002, ...
create sequence if not exists order_no_seq start 1001;

create or replace function set_order_no()
returns trigger as $$
begin
  if new.order_no is null or new.order_no = '' then
    new.order_no := 'ORDER' || nextval('order_no_seq');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_order_no on orders;
create trigger trg_set_order_no
  before insert on orders
  for each row execute function set_order_no();

create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_orders_touch on orders;
create trigger trg_orders_touch
  before update on orders
  for each row execute function touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Status history (traceability of key actions)
-- ─────────────────────────────────────────────────────────────
create table if not exists order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by text not null,
  note text,
  changed_at timestamptz not null default now()
);

create index if not exists idx_history_order on order_status_history(order_id);

-- ─────────────────────────────────────────────────────────────
-- Service completions (Module 2)
-- ─────────────────────────────────────────────────────────────
create table if not exists service_completions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  technician_name text not null,
  work_done text,
  extra_charges numeric(10, 2) not null default 0,
  final_amount numeric(10, 2) not null default 0,
  remarks text,
  media_urls text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_completions_order on service_completions(order_id);

-- ─────────────────────────────────────────────────────────────
-- Payments (Module 2 bonus)
-- ─────────────────────────────────────────────────────────────
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  amount numeric(10, 2) not null,
  method text not null,
  receipt_photo_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_order on payments(order_id);

-- ─────────────────────────────────────────────────────────────
-- Notification log (Module 3 — WhatsApp trigger)
-- ─────────────────────────────────────────────────────────────
create table if not exists notifications_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  channel text not null default 'whatsapp',
  recipient_type text not null check (recipient_type in ('technician', 'customer', 'manager')),
  recipient text,
  message text not null,
  deep_link text,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_order on notifications_log(order_id);

-- ─────────────────────────────────────────────────────────────
-- Storage bucket for job photos / video / PDF / receipts
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
--
-- DEMO SHORTCUT: this project uses a mock login / role switch (per the
-- assessment brief), not real Supabase Auth — so there is no auth.uid()
-- to key policies on. RLS is enabled with permissive "allow all to anon"
-- policies so the app (using only the public anon key) can read/write.
-- In a production build, this would be replaced with real Supabase Auth
-- + role-based policies (e.g. only the assigned technician's auth.uid()
-- can update their own job). See README "Limitations".
-- ─────────────────────────────────────────────────────────────
alter table technicians enable row level security;
alter table orders enable row level security;
alter table order_status_history enable row level security;
alter table service_completions enable row level security;
alter table payments enable row level security;
alter table notifications_log enable row level security;

drop policy if exists "anon full access" on technicians;
create policy "anon full access" on technicians for all using (true) with check (true);

drop policy if exists "anon full access" on orders;
create policy "anon full access" on orders for all using (true) with check (true);

drop policy if exists "anon full access" on order_status_history;
create policy "anon full access" on order_status_history for all using (true) with check (true);

drop policy if exists "anon full access" on service_completions;
create policy "anon full access" on service_completions for all using (true) with check (true);

drop policy if exists "anon full access" on payments;
create policy "anon full access" on payments for all using (true) with check (true);

drop policy if exists "anon full access" on notifications_log;
create policy "anon full access" on notifications_log for all using (true) with check (true);

drop policy if exists "anon storage read" on storage.objects;
create policy "anon storage read" on storage.objects for select using (bucket_id = 'attachments');
drop policy if exists "anon storage write" on storage.objects;
create policy "anon storage write" on storage.objects for insert with check (bucket_id = 'attachments');

-- ─────────────────────────────────────────────────────────────
-- Seed data: technicians + sample orders across the last 7 days
-- so the KPI dashboard and AI query module have something to show.
-- ─────────────────────────────────────────────────────────────
insert into technicians (name, phone) values
  ('Ali', '+60123456701'),
  ('John', '+60123456702'),
  ('Bala', '+60123456703'),
  ('Yusoff', '+60123456704')
on conflict (name) do nothing;

do $$
declare
  ali uuid; john uuid; bala uuid; yusoff uuid;
  o_id uuid;
begin
  select id into ali from technicians where name = 'Ali';
  select id into john from technicians where name = 'John';
  select id into bala from technicians where name = 'Bala';
  select id into yusoff from technicians where name = 'Yusoff';

  -- only seed orders once
  if not exists (select 1 from orders where order_no = 'ORDER1001') then

    -- Ali: 3 jobs, all completed last week
    insert into orders (order_no, customer_name, phone, address, problem_description, service_type, quoted_price, assigned_technician_id, status, created_at, updated_at)
    values ('ORDER1001','Ahmad','+60111111111','No. 12, Jalan Sejuk, Shah Alam','Aircond not cold','Aircond Cleaning',150,ali,'Reviewed', now() - interval '6 days', now() - interval '6 days')
    returning id into o_id;
    insert into order_status_history (order_id, from_status, to_status, changed_by, changed_at) values
      (o_id, null, 'New', 'Admin', now() - interval '6 days'),
      (o_id, 'New', 'Assigned', 'Admin', now() - interval '6 days'),
      (o_id, 'Assigned', 'In Progress', 'Ali', now() - interval '6 days'),
      (o_id, 'In Progress', 'Job Done', 'Ali', now() - interval '6 days'),
      (o_id, 'Job Done', 'Reviewed', 'Manager', now() - interval '5 days');
    insert into service_completions (order_id, technician_name, work_done, extra_charges, final_amount, remarks, created_at)
    values (o_id, 'Ali', 'Cleaned filter and coil, checked gas pressure', 0, 150, 'No issues found', now() - interval '6 days');

    insert into orders (order_no, customer_name, phone, address, problem_description, service_type, quoted_price, assigned_technician_id, status, created_at, updated_at)
    values ('ORDER1002','Siti','+60111111112','15 Jalan Damai, PJ','Water leaking from unit','Repair',220,ali,'Reviewed', now() - interval '5 days', now() - interval '5 days')
    returning id into o_id;
    insert into order_status_history (order_id, from_status, to_status, changed_by, changed_at) values
      (o_id, null, 'New', 'Admin', now() - interval '5 days'),
      (o_id, 'New', 'Assigned', 'Admin', now() - interval '5 days'),
      (o_id, 'Assigned', 'Job Done', 'Ali', now() - interval '5 days'),
      (o_id, 'Job Done', 'Reviewed', 'Manager', now() - interval '4 days');
    insert into service_completions (order_id, technician_name, work_done, extra_charges, final_amount, remarks, created_at)
    values (o_id, 'Ali', 'Replaced drain pipe', 20, 240, 'Customer requested extra pipe length', now() - interval '5 days');

    insert into orders (order_no, customer_name, phone, address, problem_description, service_type, quoted_price, assigned_technician_id, status, created_at, updated_at)
    values ('ORDER1003','Wei Ling','+60111111113','8 Jalan Kenanga, Subang','Low gas','Gas Refill',180,ali,'Job Done', now() - interval '3 days', now() - interval '3 days')
    returning id into o_id;
    insert into order_status_history (order_id, from_status, to_status, changed_by, changed_at) values
      (o_id, null, 'New', 'Admin', now() - interval '3 days'),
      (o_id, 'New', 'Assigned', 'Admin', now() - interval '3 days'),
      (o_id, 'Assigned', 'Job Done', 'Ali', now() - interval '3 days');
    insert into service_completions (order_id, technician_name, work_done, extra_charges, final_amount, remarks, created_at)
    values (o_id, 'Ali', 'Refilled R32 gas, tested pressure', 0, 180, 'Recommend re-check in 3 months', now() - interval '3 days');

    -- John: 2 jobs this week
    insert into orders (order_no, customer_name, phone, address, problem_description, service_type, quoted_price, assigned_technician_id, status, created_at, updated_at)
    values ('ORDER1004','Kumar','+60111111114','21 Jalan Sri, Klang','New install','Installation',600,john,'Reviewed', now() - interval '4 days', now() - interval '4 days')
    returning id into o_id;
    insert into order_status_history (order_id, from_status, to_status, changed_by, changed_at) values
      (o_id, null, 'New', 'Admin', now() - interval '4 days'),
      (o_id, 'New', 'Assigned', 'Admin', now() - interval '4 days'),
      (o_id, 'Assigned', 'Job Done', 'John', now() - interval '4 days'),
      (o_id, 'Job Done', 'Reviewed', 'Manager', now() - interval '3 days');
    insert into service_completions (order_id, technician_name, work_done, extra_charges, final_amount, remarks, created_at)
    values (o_id, 'John', 'Installed 1.5HP split unit', 50, 650, 'Extra bracket needed', now() - interval '4 days');
    insert into notifications_log (order_id, channel, recipient_type, recipient, message, created_at)
    values (o_id, 'whatsapp', 'manager', 'Manager', 'Job ORDER1004 marked Job Done by John. Final amount: RM650.00. Please review when ready.', now() - interval '4 days');

    insert into orders (order_no, customer_name, phone, address, problem_description, service_type, quoted_price, assigned_technician_id, status, created_at, updated_at)
    values ('ORDER1005','Farah','+60111111115','3 Jalan Aman, Klang','Noise from unit','Repair',200,john,'Job Done', now() - interval '1 days', now() - interval '1 days')
    returning id into o_id;
    insert into order_status_history (order_id, from_status, to_status, changed_by, changed_at) values
      (o_id, null, 'New', 'Admin', now() - interval '1 days'),
      (o_id, 'New', 'Assigned', 'Admin', now() - interval '1 days'),
      (o_id, 'Assigned', 'Job Done', 'John', now() - interval '1 days');
    insert into service_completions (order_id, technician_name, work_done, extra_charges, final_amount, remarks, created_at)
    values (o_id, 'John', 'Tightened fan blade, lubricated motor', 0, 200, null, now() - interval '1 days');
    insert into notifications_log (order_id, channel, recipient_type, recipient, message, created_at)
    values (o_id, 'whatsapp', 'manager', 'Manager', 'Job ORDER1005 marked Job Done by John. Final amount: RM200.00. Please review when ready.', now() - interval '1 days');

    -- Bala: heavy week (11 jobs) to demonstrate "overloaded technician" AI insight
    for i in 1..11 loop
      insert into orders (order_no, customer_name, phone, address, problem_description, service_type, quoted_price, assigned_technician_id, status, created_at, updated_at)
      values (
        'ORDER10' || (10 + i),
        'Customer ' || i,
        '+601111112' || lpad(i::text, 2, '0'),
        i || ' Jalan Bala, Cheras',
        'Routine service',
        'Aircond Cleaning',
        120 + i,
        bala,
        'Job Done',
        now() - interval '1 day' * (i % 6),
        now() - interval '1 day' * (i % 6)
      )
      returning id into o_id;
      insert into order_status_history (order_id, from_status, to_status, changed_by, changed_at) values
        (o_id, null, 'New', 'Admin', now() - interval '1 day' * (i % 6)),
        (o_id, 'New', 'Assigned', 'Admin', now() - interval '1 day' * (i % 6)),
        (o_id, 'Assigned', 'Job Done', 'Bala', now() - interval '1 day' * (i % 6));
      insert into service_completions (order_id, technician_name, work_done, extra_charges, final_amount, remarks, created_at)
      values (o_id, 'Bala', 'Standard cleaning service', 0, 120 + i, null, now() - interval '1 day' * (i % 6));
    end loop;

    -- Yusoff: 1 job, still in progress; 1 new unassigned order
    insert into orders (order_no, customer_name, phone, address, problem_description, service_type, quoted_price, assigned_technician_id, status, created_at, updated_at)
    values ('ORDER1030','Nurul','+60111111130','9 Jalan Bunga, Puchong','AC not turning on','Repair',250,yusoff,'In Progress', now() - interval '2 hours', now() - interval '2 hours')
    returning id into o_id;
    insert into order_status_history (order_id, from_status, to_status, changed_by, changed_at) values
      (o_id, null, 'New', 'Admin', now() - interval '2 hours'),
      (o_id, 'New', 'Assigned', 'Admin', now() - interval '2 hours'),
      (o_id, 'Assigned', 'In Progress', 'Yusoff', now() - interval '1 hours');

    insert into orders (order_no, customer_name, phone, address, problem_description, service_type, quoted_price, assigned_technician_id, status, created_at, updated_at)
    values ('ORDER1031','Bee Choo','+60111111131','5 Jalan Ros, Puchong','New unit install','Installation',700,null,'New', now() - interval '30 minutes', now() - interval '30 minutes')
    returning id into o_id;
    insert into order_status_history (order_id, from_status, to_status, changed_by, changed_at) values
      (o_id, null, 'New', 'Admin', now() - interval '30 minutes');

  end if;
end $$;

-- Keep the order_no sequence ahead of any explicitly-seeded order numbers
-- (safe to re-run any time).
select setval(
  'order_no_seq',
  greatest(1000, (select coalesce(max(substring(order_no from '[0-9]+')::int), 1000) from orders))
);
