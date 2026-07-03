begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.raffle_app_config (
  id boolean primary key default true,
  admin_pin_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (id)
);

create table if not exists public.rooc_members (
  id uuid primary key default extensions.gen_random_uuid(),
  member_no text not null unique,
  role_name text not null,
  occupation text,
  joined_dc boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(member_no) between 1 and 80),
  check (char_length(role_name) between 1 and 120),
  check (occupation is null or char_length(occupation) <= 120)
);

create table if not exists public.rooc_occupations (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(name) between 1 and 120)
);

insert into public.rooc_occupations (name, sort_order)
select occupation, row_number() over (order by occupation)::integer
from (
  select distinct trim(occupation) as occupation
  from public.rooc_members
  where nullif(trim(occupation), '') is not null
) existing_occupations
on conflict on constraint rooc_occupations_name_key do nothing;

create table if not exists public.raffle_events (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  status text not null default 'live' check (status in ('live', 'closed')),
  admin_pin_hash text not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (char_length(slug) between 3 and 80),
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table if not exists public.raffle_prizes (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null references public.raffle_events(id) on delete cascade,
  name text not null,
  provider text not null,
  provider_member_id uuid references public.rooc_members(id),
  quantity integer not null default 1 check (quantity between 1 and 200),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (char_length(name) between 1 and 120),
  constraint raffle_prizes_provider_check check (char_length(provider) between 1 and 220)
);

alter table public.raffle_prizes
  add column if not exists provider_member_id uuid references public.rooc_members(id);

update public.raffle_prizes p
set provider_member_id = m.id
from public.rooc_members m
where p.provider_member_id is null
  and m.member_no = coalesce(
    substring(p.provider from '（([^（）]+)）$'),
    substring(p.provider from '\(([^()]+)\)$')
  );

create table if not exists public.raffle_draws (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null references public.raffle_events(id) on delete cascade,
  prize_id uuid not null references public.raffle_prizes(id) on delete cascade,
  slot_number integer not null check (slot_number > 0),
  drawn_member_id uuid not null references public.rooc_members(id),
  final_member_id uuid references public.rooc_members(id),
  transfer_member_id uuid references public.rooc_members(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'transferred')),
  note text,
  random_token text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (note is null or char_length(note) <= 500)
);

drop index if exists public.raffle_draws_one_pending_per_event;

create index if not exists raffle_events_title_lookup_idx
  on public.raffle_events (lower(trim(title)));

create unique index if not exists raffle_draws_unique_final_member_per_event
  on public.raffle_draws (event_id, final_member_id)
  where final_member_id is not null and status in ('accepted', 'transferred');

create table if not exists public.raffle_exclusions (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null references public.raffle_events(id) on delete cascade,
  member_id uuid not null references public.rooc_members(id),
  reason text not null check (reason in ('pending', 'accepted', 'declined', 'transferred_from', 'transferred_to')),
  source_draw_id uuid references public.raffle_draws(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, member_id)
);

create index if not exists raffle_prizes_event_order_idx
  on public.raffle_prizes (event_id, sort_order, created_at);

create index if not exists raffle_prizes_provider_member_idx
  on public.raffle_prizes (event_id, provider_member_id)
  where provider_member_id is not null;

create index if not exists raffle_draws_event_created_idx
  on public.raffle_draws (event_id, created_at desc);

create index if not exists raffle_exclusions_event_member_idx
  on public.raffle_exclusions (event_id, member_id);

alter table public.raffle_app_config enable row level security;
alter table public.rooc_members enable row level security;
alter table public.rooc_occupations enable row level security;
alter table public.raffle_events enable row level security;
alter table public.raffle_prizes enable row level security;
alter table public.raffle_draws enable row level security;
alter table public.raffle_exclusions enable row level security;

create or replace function public.slugify(input text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select trim(both '-' from lower(regexp_replace(regexp_replace(coalesce(input, ''), '[^a-zA-Z0-9]+', '-', 'g'), '-+', '-', 'g')));
$$;

create or replace function public.member_label(p_member public.rooc_members)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select p_member.role_name;
$$;

create or replace function public.assert_app_admin(p_admin_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash text;
begin
  select admin_pin_hash
  into v_hash
  from public.raffle_app_config
  where id = true;

  if not found then
    raise exception '尚未設定管理密碼。';
  end if;

  if p_admin_pin is null or extensions.crypt(p_admin_pin, v_hash) <> v_hash then
    raise exception '管理密碼不正確。';
  end if;
end;
$$;

create or replace function public.validate_event_admin(p_slug text, p_admin_pin text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event_id uuid;
begin
  perform public.assert_app_admin(p_admin_pin);

  select id
  into v_event_id
  from public.raffle_events
  where slug = lower(trim(p_slug));

  if not found then
    raise exception '找不到活動。';
  end if;

  return v_event_id;
end;
$$;

create or replace function public.initialize_app_admin(p_admin_pin text)
returns table(configured boolean, message text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash text;
begin
  p_admin_pin := nullif(trim(p_admin_pin), '');

  if p_admin_pin is null or char_length(p_admin_pin) < 4 then
    raise exception '管理密碼至少需要 4 個字元。';
  end if;

  select admin_pin_hash
  into v_hash
  from public.raffle_app_config
  where id = true;

  if found then
    if extensions.crypt(p_admin_pin, v_hash) <> v_hash then
      raise exception '管理密碼不正確。';
    end if;

    return query select true, '管理密碼驗證成功。';
    return;
  end if;

  insert into public.raffle_app_config (id, admin_pin_hash)
  values (true, extensions.crypt(p_admin_pin, extensions.gen_salt('bf')));

  return query select true, '管理密碼已設定。';
end;
$$;

create or replace function public.change_app_admin_pin(
  p_current_pin text,
  p_new_pin text
)
returns table(configured boolean, message text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  p_current_pin := nullif(trim(p_current_pin), '');
  p_new_pin := nullif(trim(p_new_pin), '');

  if p_new_pin is null or char_length(p_new_pin) < 4 then
    raise exception '管理密碼至少需要 4 個字元。';
  end if;

  perform public.assert_app_admin(p_current_pin);

  update public.raffle_app_config
  set
    admin_pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf')),
    updated_at = now()
  where id = true;

  return query select true, '管理密碼已更新。';
end;
$$;

create or replace function public.get_rooc_occupations(
  p_app_admin_pin text,
  p_include_inactive boolean default false
)
returns table(
  id uuid,
  name text,
  is_active boolean,
  sort_order integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public.assert_app_admin(p_app_admin_pin);

  return query
  select
    o.id,
    o.name,
    o.is_active,
    o.sort_order,
    o.updated_at
  from public.rooc_occupations o
  where coalesce(p_include_inactive, false) or o.is_active
  order by o.is_active desc, o.sort_order, o.name;
end;
$$;

create or replace function public.upsert_rooc_occupation(
  p_app_admin_pin text,
  p_name text,
  p_original_name text default null,
  p_is_active boolean default true
)
returns table(
  id uuid,
  name text,
  is_active boolean,
  sort_order integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_name text := nullif(trim(p_name), '');
  v_original_name text := nullif(trim(p_original_name), '');
  v_sort_order integer;
begin
  perform public.assert_app_admin(p_app_admin_pin);

  if v_name is null then
    raise exception '請輸入職業名稱。';
  end if;

  if v_original_name is not null and v_original_name <> v_name then
    update public.rooc_occupations
    set
      name = v_name,
      is_active = coalesce(p_is_active, true),
      updated_at = now()
    where public.rooc_occupations.name = v_original_name;

    if not found then
      raise exception '找不到原本的職業。';
    end if;

    update public.rooc_members
    set
      occupation = v_name,
      updated_at = now()
    where public.rooc_members.occupation = v_original_name;
  else
    select coalesce(max(o.sort_order), 0) + 1
    into v_sort_order
    from public.rooc_occupations o;

    insert into public.rooc_occupations (name, is_active, sort_order, updated_at)
    values (v_name, coalesce(p_is_active, true), v_sort_order, now())
    on conflict on constraint rooc_occupations_name_key do update
    set
      is_active = excluded.is_active,
      updated_at = now();
  end if;

  return query
  select
    o.id,
    o.name,
    o.is_active,
    o.sort_order,
    o.updated_at
  from public.rooc_occupations o
  where o.name = v_name;
end;
$$;

create or replace function public.upsert_rooc_member(
  p_app_admin_pin text,
  p_member_no text,
  p_original_member_no text default null,
  p_role_name text default null,
  p_occupation text default null,
  p_joined_dc boolean default false,
  p_is_active boolean default true
)
returns table(
  id uuid,
  member_no text,
  role_name text,
  occupation text,
  joined_dc boolean,
  is_active boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_member_no text;
  v_original_member_no text;
  v_occupation text;
  v_member_id uuid;
begin
  perform public.assert_app_admin(p_app_admin_pin);

  v_member_no := nullif(trim(p_member_no), '');
  v_original_member_no := nullif(trim(p_original_member_no), '');
  v_occupation := nullif(trim(p_occupation), '');
  if v_member_no is null then
    raise exception '請輸入成員編號。';
  end if;

  p_role_name := nullif(trim(p_role_name), '');
  if p_role_name is null then
    raise exception '請輸入角色名稱。';
  end if;

  if v_occupation is not null and not exists (
    select 1
    from public.rooc_occupations o
    where o.name = v_occupation
      and o.is_active
  ) then
    raise exception '此職業目前未啟用。';
  end if;

  if v_original_member_no is not null then
    select m.id
    into v_member_id
    from public.rooc_members m
    where m.member_no = v_original_member_no;

    if not found then
      raise exception '找不到成員。';
    end if;

    if exists (
      select 1
      from public.rooc_members m
      where m.member_no = v_member_no
        and m.id <> v_member_id
    ) then
      raise exception '成員編號已存在。';
    end if;

    update public.rooc_members
    set
      member_no = v_member_no,
      role_name = p_role_name,
      occupation = v_occupation,
      joined_dc = coalesce(p_joined_dc, false),
      is_active = coalesce(p_is_active, true),
      updated_at = now()
    where public.rooc_members.id = v_member_id;
  else
    if exists (
      select 1
      from public.rooc_members m
      where m.member_no = v_member_no
    ) then
      raise exception '成員編號已存在。';
    end if;

    insert into public.rooc_members (
      member_no,
      role_name,
      occupation,
      joined_dc,
      is_active,
      updated_at
    )
    values (
      v_member_no,
      p_role_name,
      v_occupation,
      coalesce(p_joined_dc, false),
      coalesce(p_is_active, true),
      now()
    );
  end if;

  return query
  select
    m.id,
    m.member_no,
    m.role_name,
    m.occupation,
    m.joined_dc,
    m.is_active,
    m.updated_at
  from public.rooc_members m
  where m.member_no = v_member_no;
end;
$$;

create or replace function public.set_rooc_member_active(
  p_app_admin_pin text,
  p_member_no text,
  p_is_active boolean
)
returns table(member_no text, is_active boolean)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_member_no text;
begin
  perform public.assert_app_admin(p_app_admin_pin);

  v_member_no := nullif(trim(p_member_no), '');
  if v_member_no is null then
    raise exception '請輸入成員編號。';
  end if;

  update public.rooc_members
  set
    is_active = coalesce(p_is_active, false),
    updated_at = now()
  where public.rooc_members.member_no = v_member_no;

  if not found then
    raise exception '找不到成員。';
  end if;

  return query
  select m.member_no, m.is_active
  from public.rooc_members m
  where m.member_no = v_member_no;
end;
$$;

create or replace function public.get_rooc_members(
  p_app_admin_pin text,
  p_query text default null,
  p_include_inactive boolean default false
)
returns table(
  id uuid,
  member_no text,
  role_name text,
  occupation text,
  joined_dc boolean,
  is_active boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_query text := nullif(trim(p_query), '');
begin
  perform public.assert_app_admin(p_app_admin_pin);

  return query
  select
    m.id,
    m.member_no,
    public.member_label(m) as role_name,
    m.occupation,
    m.joined_dc,
    m.is_active,
    m.updated_at
  from public.rooc_members m
  where (coalesce(p_include_inactive, false) or m.is_active)
    and (
      v_query is null
      or m.member_no ilike '%' || v_query || '%'
      or coalesce(m.role_name, '') ilike '%' || v_query || '%'
      or coalesce(m.occupation, '') ilike '%' || v_query || '%'
    )
  order by m.member_no
  limit 200;
end;
$$;

create or replace function public.list_open_raffle_events(
  p_app_admin_pin text
)
returns table(
  id uuid,
  slug text,
  title text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public.assert_app_admin(p_app_admin_pin);

  return query
  select
    e.id,
    e.slug,
    e.title,
    e.status,
    e.created_at
  from public.raffle_events e
  where e.status = 'live'
  order by e.created_at desc;
end;
$$;

create or replace function public.list_closed_raffle_events(
  p_app_admin_pin text
)
returns table(
  id uuid,
  slug text,
  title text,
  status text,
  created_at timestamptz,
  closed_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public.assert_app_admin(p_app_admin_pin);

  return query
  select
    e.id,
    e.slug,
    e.title,
    e.status,
    e.created_at,
    e.closed_at
  from public.raffle_events e
  where e.status = 'closed'
  order by e.closed_at desc nulls last, e.created_at desc;
end;
$$;

create or replace function public.create_raffle_event(
  p_title text,
  p_slug text,
  p_description text,
  p_admin_pin text
)
returns table(id uuid, slug text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_base text;
  v_slug text;
  v_suffix integer := 1;
  v_id uuid;
begin
  p_title := nullif(trim(p_title), '');
  p_slug := nullif(trim(p_slug), '');
  p_description := nullif(trim(p_description), '');
  p_admin_pin := nullif(trim(p_admin_pin), '');

  if p_title is null then
    raise exception '請輸入活動名稱。';
  end if;

  perform public.assert_app_admin(p_admin_pin);

  if exists (
    select 1
    from public.raffle_events e
    where lower(trim(e.title)) = lower(p_title)
  ) then
    raise exception '活動名稱已存在。';
  end if;

  v_base := public.slugify(coalesce(p_slug, p_title));
  if v_base = '' then
    v_base := 'raffle';
  end if;

  v_base := trim(both '-' from left(v_base, 72));
  v_slug := v_base;

  while exists (select 1 from public.raffle_events e where e.slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := trim(both '-' from left(v_base, 68)) || '-' || v_suffix::text;
  end loop;

  insert into public.raffle_events (slug, title, description, admin_pin_hash)
  values (
    v_slug,
    p_title,
    p_description,
    extensions.crypt(p_admin_pin, extensions.gen_salt('bf'))
  )
  returning public.raffle_events.id into v_id;

  return query
  select e.id, e.slug
  from public.raffle_events e
  where e.id = v_id;
end;
$$;

create or replace function public.set_raffle_event_status(
  p_slug text,
  p_admin_pin text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event_id uuid;
begin
  v_event_id := public.validate_event_admin(p_slug, p_admin_pin);

  if p_status not in ('live', 'closed') then
    raise exception '活動狀態只能是進行中或已關閉。';
  end if;

  update public.raffle_events
  set
    status = p_status,
    closed_at = case when p_status = 'closed' then now() else null end
  where id = v_event_id;
end;
$$;

create or replace function public.delete_raffle_event(
  p_slug text,
  p_admin_pin text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event_id uuid;
begin
  v_event_id := public.validate_event_admin(p_slug, p_admin_pin);

  delete from public.raffle_events e
  where e.id = v_event_id;
end;
$$;

create or replace function public.add_raffle_prize(
  p_slug text,
  p_admin_pin text,
  p_name text,
  p_provider text,
  p_quantity integer default 1
)
returns table(id uuid, name text, provider text, quantity integer)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event public.raffle_events%rowtype;
  v_provider_member public.rooc_members%rowtype;
  v_provider_label text;
  v_sort integer;
  v_prize_id uuid;
begin
  select *
  into v_event
  from public.raffle_events e
  where e.id = public.validate_event_admin(p_slug, p_admin_pin)
  for update;

  if v_event.status <> 'live' then
    raise exception '活動已關閉，不能新增獎項。';
  end if;

  p_name := nullif(trim(p_name), '');
  p_provider := nullif(trim(p_provider), '');
  p_quantity := coalesce(p_quantity, 1);

  if p_name is null then
    raise exception '請輸入獎項名稱。';
  end if;

  if p_provider is null then
    raise exception '請輸入獎項提供者。';
  end if;

  select *
  into v_provider_member
  from public.rooc_members m
  where m.member_no = p_provider
    and m.is_active;

  if not found then
    raise exception '獎項提供者必須是公會中成員。';
  end if;

  v_provider_label := public.member_label(v_provider_member) || '（' || v_provider_member.member_no || '）';

  if p_quantity < 1 or p_quantity > 200 then
    raise exception '獎項名額必須介於 1 到 200。';
  end if;

  select coalesce(max(sort_order), 0) + 1
  into v_sort
  from public.raffle_prizes
  where event_id = v_event.id;

  insert into public.raffle_prizes (event_id, name, provider, provider_member_id, quantity, sort_order)
  values (v_event.id, p_name, v_provider_label, v_provider_member.id, p_quantity, v_sort)
  returning public.raffle_prizes.id into v_prize_id;

  return query
  select p.id, p.name, p.provider, p.quantity
  from public.raffle_prizes p
  where p.id = v_prize_id;
end;
$$;

create or replace function public.bonus_raffle_prize_quantity(
  p_slug text,
  p_admin_pin text,
  p_prize_id uuid,
  p_quantity integer default 1
)
returns table(id uuid, name text, provider text, quantity integer)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event public.raffle_events%rowtype;
  v_prize public.raffle_prizes%rowtype;
begin
  select *
  into v_event
  from public.raffle_events e
  where e.id = public.validate_event_admin(p_slug, p_admin_pin)
  for update;

  if v_event.status <> 'live' then
    raise exception '活動已關閉，不能加碼獎項。';
  end if;

  if p_prize_id is null then
    raise exception '請選擇要加碼的獎項。';
  end if;

  p_quantity := coalesce(p_quantity, 1);

  if p_quantity < 1 or p_quantity > 200 then
    raise exception '加碼名額必須介於 1 到 200。';
  end if;

  select *
  into v_prize
  from public.raffle_prizes p
  where p.id = p_prize_id
    and p.event_id = v_event.id
    and p.is_active
  for update;

  if not found then
    raise exception '找不到要加碼的獎項。';
  end if;

  if v_prize.quantity + p_quantity > 200 then
    raise exception '獎項名額加碼後不能超過 200。';
  end if;

  update public.raffle_prizes p
  set quantity = p.quantity + p_quantity
  where p.id = v_prize.id
  returning p.* into v_prize;

  return query
  select p.id, p.name, p.provider, p.quantity
  from public.raffle_prizes p
  where p.id = v_prize.id;
end;
$$;

create or replace function public.delete_raffle_prize(
  p_slug text,
  p_admin_pin text,
  p_prize_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event public.raffle_events%rowtype;
  v_prize public.raffle_prizes%rowtype;
begin
  select *
  into v_event
  from public.raffle_events e
  where e.id = public.validate_event_admin(p_slug, p_admin_pin)
  for update;

  if v_event.status <> 'live' then
    raise exception '活動已關閉，不能刪除獎項。';
  end if;

  if p_prize_id is null then
    raise exception '請選擇要刪除的獎項。';
  end if;

  select *
  into v_prize
  from public.raffle_prizes p
  where p.id = p_prize_id
    and p.event_id = v_event.id
    and p.is_active
  for update;

  if not found then
    raise exception '找不到要刪除的獎項。';
  end if;

  if exists (
    select 1
    from public.raffle_draws d
    where d.prize_id = v_prize.id
  ) then
    raise exception '此獎項已有抽獎紀錄，不能刪除。';
  end if;

  delete from public.raffle_prizes p
  where p.id = v_prize.id;
end;
$$;

create or replace function public.get_raffle_event_admin(
  p_slug text,
  p_admin_pin text
)
returns table(
  id uuid,
  slug text,
  title text,
  description text,
  status text,
  created_at timestamptz,
  closed_at timestamptz,
  total_active_members bigint,
  excluded_count bigint,
  eligible_count bigint,
  award_count bigint,
  prizes jsonb,
  pending_draw jsonb,
  awards jsonb,
  recent_draws jsonb
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event public.raffle_events%rowtype;
begin
  select *
  into v_event
  from public.raffle_events e
  where e.id = public.validate_event_admin(p_slug, p_admin_pin);

  return query
  select
    v_event.id,
    v_event.slug,
    v_event.title,
    v_event.description,
    v_event.status,
    v_event.created_at,
    v_event.closed_at,
    (select count(*) from public.rooc_members m where m.is_active) as total_active_members,
    (select count(*) from public.raffle_exclusions x where x.event_id = v_event.id) as excluded_count,
    (
      select count(*)
      from public.rooc_members m
      where m.is_active
        and not exists (
          select 1
          from public.raffle_exclusions x
          where x.event_id = v_event.id
            and x.member_id = m.id
        )
    ) as eligible_count,
    (
      select count(*)
      from public.raffle_draws d
      where d.event_id = v_event.id
        and d.status in ('accepted', 'transferred')
    ) as award_count,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', prize_rows.id,
            'name', prize_rows.name,
            'provider', prize_rows.provider,
            'provider_member_id', prize_rows.provider_member_id,
            'quantity', prize_rows.quantity,
            'eligible_count', prize_rows.eligible_count,
            'filled_count', prize_rows.filled_count,
            'pending_count', prize_rows.pending_count,
            'remaining_count', greatest(prize_rows.quantity - prize_rows.filled_count - prize_rows.pending_count, 0),
            'sort_order', prize_rows.sort_order
          )
          order by prize_rows.sort_order, prize_rows.created_at
        )
        from (
          select
            p.id,
            p.name,
            p.provider,
            p.provider_member_id,
            p.quantity,
            p.sort_order,
            p.created_at,
            (
              select count(*)::integer
              from public.rooc_members m
              where m.is_active
                and (p.provider_member_id is null or m.id <> p.provider_member_id)
                and not exists (
                  select 1
                  from public.raffle_exclusions x
                  where x.event_id = v_event.id
                    and x.member_id = m.id
                )
            ) as eligible_count,
            (
              select count(*)::integer
              from public.raffle_draws d
              where d.prize_id = p.id
                and d.status in ('accepted', 'transferred')
            ) as filled_count,
            (
              select count(*)::integer
              from public.raffle_draws d
              where d.prize_id = p.id
                and d.status = 'pending'
            ) as pending_count
          from public.raffle_prizes p
          where p.event_id = v_event.id
            and p.is_active
        ) as prize_rows
      ),
      '[]'::jsonb
    ) as prizes,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', pending_rows.id,
            'prize_id', pending_rows.prize_id,
            'prize_name', pending_rows.prize_name,
            'provider', pending_rows.provider,
            'slot_number', pending_rows.slot_number,
            'drawn_member_id', pending_rows.drawn_member_id,
            'member_no', pending_rows.member_no,
            'role_name', pending_rows.role_name,
            'occupation', pending_rows.occupation,
            'joined_dc', pending_rows.joined_dc,
            'random_token', pending_rows.random_token,
            'created_at', pending_rows.created_at
          )
          order by pending_rows.created_at, pending_rows.slot_number
        )
        from (
          select
            d.id,
            d.prize_id,
            p.name as prize_name,
            p.provider,
            d.slot_number,
            m.id as drawn_member_id,
            m.member_no,
            public.member_label(m) as role_name,
            m.occupation,
            m.joined_dc,
            d.random_token,
            d.created_at
          from public.raffle_draws d
          join public.raffle_prizes p on p.id = d.prize_id
          join public.rooc_members m on m.id = d.drawn_member_id
          where d.event_id = v_event.id
            and d.status = 'pending'
          order by d.created_at, d.slot_number
        ) as pending_rows
      ),
      '[]'::jsonb
    ) as pending_draw,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', draw_rows.id,
            'prize_name', draw_rows.prize_name,
            'provider', draw_rows.provider,
            'slot_number', draw_rows.slot_number,
            'drawn_member_no', draw_rows.drawn_member_no,
            'drawn_role_name', draw_rows.drawn_role_name,
            'final_member_no', draw_rows.final_member_no,
            'final_role_name', draw_rows.final_role_name,
            'status', draw_rows.status,
            'note', draw_rows.note,
            'resolved_at', draw_rows.resolved_at
          )
          order by draw_rows.resolved_at desc
        )
        from (
          select
            d.id,
            p.name as prize_name,
            p.provider,
            d.slot_number,
            dm.member_no as drawn_member_no,
            public.member_label(dm) as drawn_role_name,
            fm.member_no as final_member_no,
            public.member_label(fm) as final_role_name,
            d.status,
            d.note,
            d.resolved_at
          from public.raffle_draws d
          join public.raffle_prizes p on p.id = d.prize_id
          join public.rooc_members dm on dm.id = d.drawn_member_id
          join public.rooc_members fm on fm.id = d.final_member_id
          where d.event_id = v_event.id
            and d.status in ('accepted', 'transferred')
          order by d.resolved_at desc
        ) as draw_rows
      ),
      '[]'::jsonb
    ) as awards,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', log_rows.id,
            'prize_name', log_rows.prize_name,
            'slot_number', log_rows.slot_number,
            'drawn_member_no', log_rows.drawn_member_no,
            'drawn_role_name', log_rows.drawn_role_name,
            'final_member_no', log_rows.final_member_no,
            'final_role_name', log_rows.final_role_name,
            'status', log_rows.status,
            'random_token', log_rows.random_token,
            'created_at', log_rows.created_at,
            'resolved_at', log_rows.resolved_at
          )
          order by log_rows.created_at desc
        )
        from (
          select
            d.id,
            p.name as prize_name,
            d.slot_number,
            dm.member_no as drawn_member_no,
            public.member_label(dm) as drawn_role_name,
            fm.member_no as final_member_no,
            case when fm.id is null then null else public.member_label(fm) end as final_role_name,
            d.status,
            d.random_token,
            d.created_at,
            d.resolved_at
          from public.raffle_draws d
          join public.raffle_prizes p on p.id = d.prize_id
          join public.rooc_members dm on dm.id = d.drawn_member_id
          left join public.rooc_members fm on fm.id = d.final_member_id
          where d.event_id = v_event.id
          order by d.created_at desc
          limit 100
        ) as log_rows
      ),
      '[]'::jsonb
    ) as recent_draws;
end;
$$;

create or replace function public.get_raffle_event_admin_by_title(
  p_title text,
  p_app_admin_pin text
)
returns table(
  id uuid,
  slug text,
  title text,
  description text,
  status text,
  created_at timestamptz,
  closed_at timestamptz,
  total_active_members bigint,
  excluded_count bigint,
  eligible_count bigint,
  award_count bigint,
  prizes jsonb,
  pending_draw jsonb,
  awards jsonb,
  recent_draws jsonb
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_title text := nullif(trim(p_title), '');
  v_slug text;
begin
  perform public.assert_app_admin(p_app_admin_pin);

  if v_title is null then
    raise exception '請輸入活動名稱。';
  end if;

  select e.slug
  into v_slug
  from public.raffle_events e
  where lower(trim(e.title)) = lower(v_title)
  order by e.created_at desc
  limit 1;

  if not found then
    raise exception '找不到活動。';
  end if;

  return query
  select *
  from public.get_raffle_event_admin(v_slug, p_app_admin_pin);
end;
$$;

create or replace function public.get_raffle_transfer_candidates(
  p_slug text,
  p_admin_pin text
)
returns table(
  id uuid,
  member_no text,
  role_name text,
  occupation text,
  joined_dc boolean
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event_id uuid;
begin
  v_event_id := public.validate_event_admin(p_slug, p_admin_pin);

  return query
  select
    m.id,
    m.member_no,
    public.member_label(m) as role_name,
    m.occupation,
    m.joined_dc
  from public.rooc_members m
  where m.is_active
    and not exists (
      select 1
      from public.raffle_exclusions x
      where x.event_id = v_event_id
        and x.member_id = m.id
    )
  order by m.member_no;
end;
$$;

create or replace function public.draw_raffle_prize(
  p_slug text,
  p_admin_pin text,
  p_prize_id uuid,
  p_draw_count integer default 1
)
returns table(
  draw_id uuid,
  member_no text,
  role_name text,
  prize_name text,
  slot_number integer,
  random_token text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event public.raffle_events%rowtype;
  v_prize public.raffle_prizes%rowtype;
  v_member public.rooc_members%rowtype;
  v_draw_count integer;
  v_filled integer;
  v_pending integer;
  v_remaining integer;
  v_eligible integer;
  v_slot integer;
  v_draw_id uuid;
  v_token text;
  v_index integer;
begin
  select *
  into v_event
  from public.raffle_events e
  where e.id = public.validate_event_admin(p_slug, p_admin_pin)
  for update;

  if v_event.status <> 'live' then
    raise exception '活動已關閉。';
  end if;

  v_draw_count := coalesce(p_draw_count, 1);

  select *
  into v_prize
  from public.raffle_prizes p
  where p.id = p_prize_id
    and p.event_id = v_event.id
    and p.is_active
  for update;

  if not found then
    raise exception '找不到獎項。';
  end if;

  if v_draw_count < 1 or v_draw_count > 50 then
    raise exception '本次抽出人數必須介於 1 到 50。';
  end if;

  select count(*)::integer
  into v_filled
  from public.raffle_draws d
  where d.prize_id = v_prize.id
    and d.status in ('accepted', 'transferred');

  select count(*)::integer
  into v_pending
  from public.raffle_draws d
  where d.prize_id = v_prize.id
    and d.status = 'pending';

  v_remaining := v_prize.quantity - v_filled - v_pending;

  if v_remaining <= 0 then
    raise exception '此獎項已沒有剩餘名額。';
  end if;

  if v_draw_count > v_remaining then
    raise exception '本次抽出人數超過此獎項剩餘名額。';
  end if;

  select count(*)::integer
  into v_eligible
  from public.rooc_members m
  where m.is_active
    and (v_prize.provider_member_id is null or m.id <> v_prize.provider_member_id)
    and not exists (
      select 1
      from public.raffle_exclusions x
      where x.event_id = v_event.id
        and x.member_id = m.id
    )
  ;

  if v_eligible <= 0 then
    raise exception '沒有可抽選的成員了；獎項提供者不會抽中自己的獎。';
  end if;

  if v_draw_count > v_eligible then
    raise exception '本次抽出人數超過可抽選成員數。';
  end if;

  for v_index in 1..v_draw_count loop
    select *
    into v_member
    from public.rooc_members m
    where m.is_active
      and (v_prize.provider_member_id is null or m.id <> v_prize.provider_member_id)
      and not exists (
        select 1
        from public.raffle_exclusions x
        where x.event_id = v_event.id
          and x.member_id = m.id
      )
    order by extensions.gen_random_uuid()
    limit 1;

    if not found then
      raise exception '沒有可抽選的成員了；獎項提供者不會抽中自己的獎。';
    end if;

    select open_slots.slot_number
    into v_slot
    from generate_series(1, v_prize.quantity) as open_slots(slot_number)
    where not exists (
      select 1
      from public.raffle_draws d
      where d.prize_id = v_prize.id
        and d.slot_number = open_slots.slot_number
        and d.status in ('pending', 'accepted', 'transferred')
    )
    order by open_slots.slot_number
    limit 1;

    if not found then
      raise exception '此獎項已沒有剩餘名額。';
    end if;

    v_token := encode(extensions.gen_random_bytes(16), 'hex');

    insert into public.raffle_draws (
      event_id,
      prize_id,
      slot_number,
      drawn_member_id,
      random_token
    )
    values (
      v_event.id,
      v_prize.id,
      v_slot,
      v_member.id,
      v_token
    )
    returning id into v_draw_id;

    insert into public.raffle_exclusions (event_id, member_id, reason, source_draw_id)
    values (v_event.id, v_member.id, 'pending', v_draw_id);

    return query
    select
      v_draw_id,
      v_member.member_no,
      public.member_label(v_member),
      v_prize.name,
      v_slot,
      v_token;
  end loop;
end;
$$;

create or replace function public.resolve_raffle_draw(
  p_slug text,
  p_admin_pin text,
  p_draw_id uuid,
  p_action text,
  p_transfer_member_no text default null,
  p_note text default null
)
returns table(draw_id uuid, status text, final_member_no text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event_id uuid;
  v_draw public.raffle_draws%rowtype;
  v_target public.rooc_members%rowtype;
  v_note text := nullif(trim(p_note), '');
begin
  v_event_id := public.validate_event_admin(p_slug, p_admin_pin);
  p_action := lower(trim(p_action));

  select *
  into v_draw
  from public.raffle_draws d
  where d.id = p_draw_id
    and d.event_id = v_event_id
    and d.status = 'pending'
  for update;

  if not found then
    raise exception '找不到待確認的抽獎結果。';
  end if;

  if p_action = 'accept' then
    update public.raffle_draws
    set
      status = 'accepted',
      final_member_id = v_draw.drawn_member_id,
      note = v_note,
      resolved_at = now()
    where id = v_draw.id;

    update public.raffle_exclusions
    set reason = 'accepted'
    where event_id = v_event_id
      and member_id = v_draw.drawn_member_id;

    return query
    select v_draw.id, 'accepted'::text, m.member_no
    from public.rooc_members m
    where m.id = v_draw.drawn_member_id;
    return;
  end if;

  if p_action = 'decline' then
    update public.raffle_draws
    set
      status = 'declined',
      final_member_id = null,
      note = v_note,
      resolved_at = now()
    where id = v_draw.id;

    update public.raffle_exclusions
    set reason = 'declined'
    where event_id = v_event_id
      and member_id = v_draw.drawn_member_id;

    return query select v_draw.id, 'declined'::text, null::text;
    return;
  end if;

  if p_action = 'transfer' then
    select *
    into v_target
    from public.rooc_members m
    where m.member_no = nullif(trim(p_transfer_member_no), '')
      and m.is_active;

    if not found then
      raise exception '指定轉讓對象不在公會中。';
    end if;

    if v_target.id = v_draw.drawn_member_id then
      raise exception '不能轉讓給原本被抽中的成員。';
    end if;

    if exists (
      select 1
      from public.raffle_exclusions x
      where x.event_id = v_event_id
        and x.member_id = v_target.id
    ) then
      raise exception '指定轉讓對象本場已不可再得獎。';
    end if;

    insert into public.raffle_exclusions (event_id, member_id, reason, source_draw_id)
    values (v_event_id, v_target.id, 'transferred_to', v_draw.id);

    update public.raffle_exclusions
    set reason = 'transferred_from'
    where event_id = v_event_id
      and member_id = v_draw.drawn_member_id;

    update public.raffle_draws
    set
      status = 'transferred',
      transfer_member_id = v_target.id,
      final_member_id = v_target.id,
      note = v_note,
      resolved_at = now()
    where id = v_draw.id;

    return query select v_draw.id, 'transferred'::text, v_target.member_no;
    return;
  end if;

  raise exception '抽獎處理動作不正確。';
end;
$$;

revoke all on public.raffle_app_config from anon, authenticated;
revoke all on public.rooc_members from anon, authenticated;
revoke all on public.rooc_occupations from anon, authenticated;
revoke all on public.raffle_events from anon, authenticated;
revoke all on public.raffle_prizes from anon, authenticated;
revoke all on public.raffle_draws from anon, authenticated;
revoke all on public.raffle_exclusions from anon, authenticated;

revoke execute on function public.slugify(text) from public, anon, authenticated;
revoke execute on function public.member_label(public.rooc_members) from public, anon, authenticated;
revoke execute on function public.assert_app_admin(text) from public, anon, authenticated;
revoke execute on function public.validate_event_admin(text, text) from public, anon, authenticated;
revoke execute on function public.initialize_app_admin(text) from public;
revoke execute on function public.change_app_admin_pin(text, text) from public;
revoke execute on function public.get_rooc_occupations(text, boolean) from public;
revoke execute on function public.upsert_rooc_occupation(text, text, text, boolean) from public;
revoke execute on function public.upsert_rooc_member(text, text, text, text, text, boolean, boolean) from public;
revoke execute on function public.set_rooc_member_active(text, text, boolean) from public;
revoke execute on function public.get_rooc_members(text, text, boolean) from public;
revoke execute on function public.list_open_raffle_events(text) from public;
revoke execute on function public.list_closed_raffle_events(text) from public;
revoke execute on function public.create_raffle_event(text, text, text, text) from public;
revoke execute on function public.set_raffle_event_status(text, text, text) from public;
revoke execute on function public.delete_raffle_event(text, text) from public;
revoke execute on function public.add_raffle_prize(text, text, text, text, integer) from public;
revoke execute on function public.bonus_raffle_prize_quantity(text, text, uuid, integer) from public;
revoke execute on function public.delete_raffle_prize(text, text, uuid) from public;
revoke execute on function public.get_raffle_event_admin(text, text) from public;
revoke execute on function public.get_raffle_event_admin_by_title(text, text) from public;
revoke execute on function public.get_raffle_transfer_candidates(text, text) from public;
revoke execute on function public.draw_raffle_prize(text, text, uuid, integer) from public;
revoke execute on function public.resolve_raffle_draw(text, text, uuid, text, text, text) from public;

grant usage on schema public to anon, authenticated;
grant execute on function public.initialize_app_admin(text) to anon, authenticated;
grant execute on function public.change_app_admin_pin(text, text) to anon, authenticated;
grant execute on function public.get_rooc_occupations(text, boolean) to anon, authenticated;
grant execute on function public.upsert_rooc_occupation(text, text, text, boolean) to anon, authenticated;
grant execute on function public.upsert_rooc_member(text, text, text, text, text, boolean, boolean) to anon, authenticated;
grant execute on function public.set_rooc_member_active(text, text, boolean) to anon, authenticated;
grant execute on function public.get_rooc_members(text, text, boolean) to anon, authenticated;
grant execute on function public.list_open_raffle_events(text) to anon, authenticated;
grant execute on function public.list_closed_raffle_events(text) to anon, authenticated;
grant execute on function public.create_raffle_event(text, text, text, text) to anon, authenticated;
grant execute on function public.set_raffle_event_status(text, text, text) to anon, authenticated;
grant execute on function public.delete_raffle_event(text, text) to anon, authenticated;
grant execute on function public.add_raffle_prize(text, text, text, text, integer) to anon, authenticated;
grant execute on function public.bonus_raffle_prize_quantity(text, text, uuid, integer) to anon, authenticated;
grant execute on function public.delete_raffle_prize(text, text, uuid) to anon, authenticated;
grant execute on function public.get_raffle_event_admin(text, text) to anon, authenticated;
grant execute on function public.get_raffle_event_admin_by_title(text, text) to anon, authenticated;
grant execute on function public.get_raffle_transfer_candidates(text, text) to anon, authenticated;
grant execute on function public.draw_raffle_prize(text, text, uuid, integer) to anon, authenticated;
grant execute on function public.resolve_raffle_draw(text, text, uuid, text, text, text) to anon, authenticated;

commit;
