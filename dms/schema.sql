-- Run in Supabase > SQL Editor
create table transporters(id uuid primary key default gen_random_uuid(), name text not null, contact text, phone text, email text, created_at timestamptz default now());
create table dealers(id uuid primary key default gen_random_uuid(), code text unique not null, name text not null, city text, state text, transit_days int not null default 3, default_transporter_id uuid references transporters(id));
create table profiles(id uuid primary key references auth.users(id) on delete cascade, role text not null check(role in('admin','transporter')), name text, transporter_id uuid references transporters(id));
create table invoices(
  id uuid primary key default gen_random_uuid(), invoice_no text unique not null, invoice_date date not null, amount numeric, dealer_id uuid references dealers(id),
  expected_date date, transporter_id uuid references transporters(id), suggested_transporter_id uuid references transporters(id),
  status text not null default 'imported' check(status in('imported','assigned','accepted','dispatched','in_transit','delivered','closed')),
  discrepancy text, lr_no text, lr_url text, delay_reason text, revised_date date, pod_url text, pod_status text default 'none' check(pod_status in('none','pending','approved','rejected')), pod_note text,
  created_at timestamptz default now());
create table activity_log(id bigserial primary key, invoice_id uuid references invoices(id) on delete cascade, actor text, action text, note text, created_at timestamptz default now());

create function is_admin() returns boolean language sql security definer stable as $$ select exists(select 1 from profiles where id=auth.uid() and role='admin') $$;
create function my_transporter() returns uuid language sql security definer stable as $$ select transporter_id from profiles where id=auth.uid() $$;

alter table transporters enable row level security; alter table dealers enable row level security; alter table profiles enable row level security; alter table invoices enable row level security; alter table activity_log enable row level security;
create policy "t_read" on transporters for select to authenticated using(true);
create policy "t_admin" on transporters for all to authenticated using(is_admin()) with check(is_admin());
create policy "d_read" on dealers for select to authenticated using(is_admin() or exists(select 1 from invoices i where i.dealer_id=dealers.id and i.transporter_id=my_transporter()));
create policy "d_admin" on dealers for all to authenticated using(is_admin()) with check(is_admin());
create policy "p_self" on profiles for select to authenticated using(id=auth.uid() or is_admin());
create policy "i_admin" on invoices for all to authenticated using(is_admin()) with check(is_admin());
create policy "i_tr_read" on invoices for select to authenticated using(transporter_id=my_transporter());
create policy "i_tr_upd" on invoices for update to authenticated using(transporter_id=my_transporter()) with check(transporter_id=my_transporter());
create policy "a_read" on activity_log for select to authenticated using(is_admin() or exists(select 1 from invoices i where i.id=invoice_id and i.transporter_id=my_transporter()));
create policy "a_ins" on activity_log for insert to authenticated with check(true);

insert into storage.buckets(id,name,public) values('docs','docs',false) on conflict do nothing;
create policy "docs_rw" on storage.objects for all to authenticated using(bucket_id='docs') with check(bucket_id='docs');

-- AFTER creating users in Authentication > Users, link them:
-- insert into profiles(id,role,name) values('<admin-user-uuid>','admin','HQ Admin');
-- insert into profiles(id,role,name,transporter_id) values('<user-uuid>','transporter','Name','<transporter-uuid>');
