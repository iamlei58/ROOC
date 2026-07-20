begin;

alter table public.rooc_members
  add column if not exists is_event_only boolean not null default false;

create table if not exists public.raffle_event_members (
  event_id uuid not null references public.raffle_events(id) on delete cascade,
  member_id uuid not null references public.rooc_members(id),
  sort_order integer not null check (sort_order > 0),
  role_name text not null,
  created_at timestamptz not null default now(),
  primary key (event_id, member_id),
  unique (event_id, sort_order),
  check (char_length(role_name) between 1 and 80)
);

create unique index if not exists raffle_event_members_role_name_key
  on public.raffle_event_members (event_id, lower(role_name));

create index if not exists raffle_event_members_member_idx
  on public.raffle_event_members (member_id);

alter table public.raffle_event_members enable row level security;

create or replace function public.raffle_event_candidates(p_event_id uuid)
returns setof public.rooc_members
language sql
stable
set search_path = public, pg_temp
as $$
  select m.*
  from public.raffle_event_members em
  join public.rooc_members m on m.id = em.member_id
  where em.event_id = p_event_id

  union all

  select m.*
  from public.rooc_members m
  where m.is_active
    and not m.is_event_only
    and not exists (
      select 1
      from public.raffle_event_members em
      where em.event_id = p_event_id
    );
$$;

create or replace function public.list_public_rooc_members(
  p_query text default null,
  p_occupation text default null
)
returns table(
  member_no text,
  role_name text,
  occupation text,
  joined_dc boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_query text := nullif(trim(p_query), '');
  v_occupation text := nullif(trim(p_occupation), '');
begin
  return query
  select
    m.member_no,
    m.role_name,
    m.occupation,
    m.joined_dc,
    m.updated_at
  from public.rooc_members m
  where m.is_active
    and not m.is_event_only
    and (v_occupation is null or m.occupation = v_occupation)
    and (
      v_query is null
      or m.member_no ilike '%' || v_query || '%'
      or m.role_name ilike '%' || v_query || '%'
      or coalesce(m.occupation, '') ilike '%' || v_query || '%'
    )
  order by coalesce(m.occupation, '未分類'), m.member_no;
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
  where not m.is_event_only
    and (coalesce(p_include_inactive, false) or m.is_active)
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

create or replace function public.set_raffle_event_roster(
  p_slug text,
  p_admin_pin text,
  p_member_names text[]
)
returns table(member_count integer)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event public.raffle_events%rowtype;
  v_item record;
  v_name text;
  v_member_id uuid;
  v_seen_names text[] := '{}'::text[];
  v_old_member_ids uuid[];
  v_count integer := 0;
begin
  select *
  into v_event
  from public.raffle_events e
  where e.id = public.validate_event_admin(p_slug, p_admin_pin)
  for update;

  if v_event.status <> 'live' then
    raise exception '活動已結束，不能修改本場名單。';
  end if;

  if exists (
    select 1 from public.raffle_prizes p where p.event_id = v_event.id
  ) or exists (
    select 1 from public.raffle_draws d where d.event_id = v_event.id
  ) then
    raise exception '本場名單已鎖定；請在新增獎項前完成修改。';
  end if;

  if coalesce(cardinality(p_member_names), 0) = 0 then
    raise exception '請貼上至少一個角色名稱。';
  end if;

  if cardinality(p_member_names) > 2000 then
    raise exception '單場名單最多 2000 人。';
  end if;

  select array_agg(em.member_id)
  into v_old_member_ids
  from public.raffle_event_members em
  where em.event_id = v_event.id;

  delete from public.raffle_event_members em
  where em.event_id = v_event.id;

  if v_old_member_ids is not null then
    delete from public.rooc_members m
    where m.id = any(v_old_member_ids)
      and m.is_event_only
      and not exists (
        select 1 from public.raffle_event_members em where em.member_id = m.id
      );
  end if;

  for v_item in
    select item.name, item.ordinality::integer as sort_order
    from unnest(p_member_names) with ordinality as item(name, ordinality)
  loop
    v_name := nullif(trim(v_item.name), '');
    if v_name is null then
      continue;
    end if;

    if char_length(v_name) > 80 then
      raise exception '角色名稱「%」超過 80 個字元。', left(v_name, 20);
    end if;

    if lower(v_name) = any(v_seen_names) then
      continue;
    end if;
    v_seen_names := array_append(v_seen_names, lower(v_name));

    select m.id
    into v_member_id
    from public.rooc_members m
    where m.is_event_only
      and m.member_no = v_name
      and m.role_name = v_name;

    if not found then
      if exists (
        select 1 from public.rooc_members m where m.member_no = v_name
      ) then
        raise exception '角色名稱「%」與既有會員編號相同，請調整名稱後再試。', v_name;
      end if;

      insert into public.rooc_members (
        member_no,
        role_name,
        occupation,
        joined_dc,
        is_active,
        is_event_only
      )
      values (v_name, v_name, null, false, false, true)
      returning id into v_member_id;
    end if;

    v_count := v_count + 1;
    insert into public.raffle_event_members (
      event_id,
      member_id,
      sort_order,
      role_name
    )
    values (v_event.id, v_member_id, v_count, v_name);
  end loop;

  if v_count = 0 then
    raise exception '請貼上至少一個有效的角色名稱。';
  end if;

  return query select v_count;
end;
$$;

create or replace function public.create_raffle_event_with_roster(
  p_title text,
  p_slug text,
  p_description text,
  p_admin_pin text,
  p_member_names text[]
)
returns table(id uuid, slug text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
  v_slug text;
begin
  select created.id, created.slug
  into v_id, v_slug
  from public.create_raffle_event(p_title, p_slug, p_description, p_admin_pin) created;

  perform public.set_raffle_event_roster(v_slug, p_admin_pin, p_member_names);

  return query select v_id, v_slug;
end;
$$;

create or replace function public.get_raffle_event_members(
  p_slug text,
  p_admin_pin text
)
returns table(
  id uuid,
  member_no text,
  role_name text,
  occupation text,
  joined_dc boolean,
  roster_mode text,
  editable boolean
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event public.raffle_events%rowtype;
  v_has_snapshot boolean;
  v_editable boolean;
begin
  select *
  into v_event
  from public.raffle_events e
  where e.id = public.validate_event_admin(p_slug, p_admin_pin);

  v_has_snapshot := exists (
    select 1 from public.raffle_event_members em where em.event_id = v_event.id
  );
  v_editable := v_event.status = 'live'
    and not exists (select 1 from public.raffle_prizes p where p.event_id = v_event.id)
    and not exists (select 1 from public.raffle_draws d where d.event_id = v_event.id);

  if v_has_snapshot then
    return query
    select
      m.id,
      em.role_name as member_no,
      em.role_name,
      null::text as occupation,
      null::boolean as joined_dc,
      'event'::text as roster_mode,
      v_editable as editable
    from public.raffle_event_members em
    join public.rooc_members m on m.id = em.member_id
    where em.event_id = v_event.id
    order by em.sort_order;
    return;
  end if;

  return query
  select
    m.id,
    m.member_no,
    public.member_label(m) as role_name,
    m.occupation,
    m.joined_dc,
    'global'::text as roster_mode,
    v_editable as editable
  from public.rooc_members m
  where m.is_active
    and not m.is_event_only
  order by m.member_no;
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
  from public.raffle_event_candidates(v_event.id) m
  where m.member_no = p_provider;

  if not found then
    raise exception '獎項提供者必須在本場名單中。';
  end if;

  v_provider_label := case
    when public.member_label(v_provider_member) = v_provider_member.member_no
      then public.member_label(v_provider_member)
    else public.member_label(v_provider_member) || '（' || v_provider_member.member_no || '）'
  end;

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
    (select count(*) from public.raffle_event_candidates(v_event.id)) as total_active_members,
    (select count(*) from public.raffle_exclusions x where x.event_id = v_event.id) as excluded_count,
    (
      select count(*)
      from public.raffle_event_candidates(v_event.id) m
      where not exists (
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
            'provider_excluded', prize_rows.provider_excluded,
            'draw_count', prize_rows.draw_count,
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
              from public.raffle_event_candidates(v_event.id) m
              where (p.provider_member_id is null or m.id <> p.provider_member_id)
                and not exists (
                  select 1
                  from public.raffle_exclusions x
                  where x.event_id = v_event.id
                    and x.member_id = m.id
                )
            ) as eligible_count,
            exists (
              select 1
              from public.raffle_event_candidates(v_event.id) pm
              where pm.id = p.provider_member_id
                and not exists (
                  select 1
                  from public.raffle_exclusions x
                  where x.event_id = v_event.id
                    and x.member_id = pm.id
                )
            ) as provider_excluded,
            (
              select count(*)::integer
              from public.raffle_draws d
              where d.prize_id = p.id
            ) as draw_count,
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
          order by pending_rows.slot_number, pending_rows.created_at
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
          order by d.slot_number, d.created_at
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
            'prize_id', log_rows.prize_id,
            'prize_name', log_rows.prize_name,
            'provider', log_rows.provider,
            'slot_number', log_rows.slot_number,
            'drawn_member_no', log_rows.drawn_member_no,
            'drawn_role_name', log_rows.drawn_role_name,
            'final_member_no', log_rows.final_member_no,
            'final_role_name', log_rows.final_role_name,
            'status', log_rows.status,
            'random_token', log_rows.random_token,
            'eligible_count', log_rows.eligible_count,
            'step_probability', log_rows.step_probability,
            'round_probability', log_rows.round_probability,
            'selected_index', log_rows.selected_index,
            'eligible_manifest_hash', log_rows.eligible_manifest_hash,
            'created_at', log_rows.created_at,
            'resolved_at', log_rows.resolved_at
          )
          order by log_rows.created_at desc
        )
        from (
          select
            d.id,
            d.prize_id,
            p.name as prize_name,
            p.provider,
            d.slot_number,
            dm.member_no as drawn_member_no,
            public.member_label(dm) as drawn_role_name,
            fm.member_no as final_member_no,
            case when fm.id is null then null else public.member_label(fm) end as final_role_name,
            d.status,
            d.random_token,
            a.eligible_count,
            a.step_probability,
            a.round_probability,
            a.selected_index,
            a.eligible_manifest_hash,
            d.created_at,
            d.resolved_at
          from public.raffle_draws d
          join public.raffle_prizes p on p.id = d.prize_id
          join public.rooc_members dm on dm.id = d.drawn_member_id
          left join public.rooc_members fm on fm.id = d.final_member_id
          left join public.raffle_draw_audits a on a.draw_id = d.id
          where d.event_id = v_event.id
          order by d.created_at desc
          limit 100
        ) as log_rows
      ),
      '[]'::jsonb
    ) as recent_draws;
end;
$$;

create or replace function public.get_raffle_event_rosters(
  p_slug text,
  p_admin_pin text
)
returns table(
  active_members jsonb,
  eligible_members jsonb,
  excluded_members jsonb,
  awarded_members jsonb
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
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'member_no', m.member_no,
            'role_name', public.member_label(m),
            'occupation', m.occupation,
            'joined_dc', m.joined_dc
          )
          order by m.member_no
        )
        from public.raffle_event_candidates(v_event_id) m
      ),
      '[]'::jsonb
    ) as active_members,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'member_no', m.member_no,
            'role_name', public.member_label(m),
            'occupation', m.occupation,
            'joined_dc', m.joined_dc
          )
          order by m.member_no
        )
        from public.raffle_event_candidates(v_event_id) m
        where not exists (
            select 1
            from public.raffle_exclusions x
            where x.event_id = v_event_id
              and x.member_id = m.id
          )
      ),
      '[]'::jsonb
    ) as eligible_members,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'member_no', m.member_no,
            'role_name', public.member_label(m),
            'occupation', m.occupation,
            'joined_dc', m.joined_dc,
            'reason', x.reason
          )
          order by x.created_at desc, m.member_no
        )
        from public.raffle_exclusions x
        join public.rooc_members m on m.id = x.member_id
        where x.event_id = v_event_id
      ),
      '[]'::jsonb
    ) as excluded_members,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'member_no', fm.member_no,
            'role_name', public.member_label(fm),
            'occupation', fm.occupation,
            'joined_dc', fm.joined_dc,
            'prize_name', p.name,
            'status', d.status
          )
          order by d.resolved_at desc, d.created_at desc
        )
        from public.raffle_draws d
        join public.raffle_prizes p on p.id = d.prize_id
        join public.rooc_members fm on fm.id = d.final_member_id
        where d.event_id = v_event_id
          and d.status in ('accepted', 'transferred')
      ),
      '[]'::jsonb
    ) as awarded_members;
end;
$$;

create or replace function public.start_raffle_live_draw(
  p_slug text,
  p_admin_pin text,
  p_prize_id uuid,
  p_draw_count integer default 1
)
returns table(
  id uuid,
  prize_name text,
  provider text,
  draw_count integer,
  started_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event public.raffle_events%rowtype;
  v_prize public.raffle_prizes%rowtype;
  v_draw_count integer;
  v_filled integer;
  v_pending integer;
  v_remaining integer;
  v_eligible integer;
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

  if v_draw_count < 1 or v_draw_count > 50 then
    raise exception '本次抽出人數必須介於 1 到 50。';
  end if;

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
  from public.raffle_event_candidates(v_event.id) m
  where (v_prize.provider_member_id is null or m.id <> v_prize.provider_member_id)
    and not exists (
      select 1
      from public.raffle_exclusions x
      where x.event_id = v_event.id
        and x.member_id = m.id
    );

  if v_eligible <= 0 then
    raise exception '沒有可抽選的成員了；獎項提供者不會抽中自己的獎。';
  end if;

  if v_draw_count > v_eligible then
    raise exception '本次抽出人數超過可抽選成員數。';
  end if;

  return query
  insert into public.raffle_live_draws as live_row (
    event_id,
    prize_id,
    prize_name,
    provider,
    draw_count,
    status,
    result_draw_ids,
    error_message,
    started_at,
    updated_at,
    completed_at
  )
  values (
    v_event.id,
    v_prize.id,
    v_prize.name,
    v_prize.provider,
    v_draw_count,
    'drawing',
    '{}'::uuid[],
    null,
    now(),
    now(),
    null
  )
  on conflict (event_id) do update
  set
    id = extensions.gen_random_uuid(),
    prize_id = excluded.prize_id,
    prize_name = excluded.prize_name,
    provider = excluded.provider,
    draw_count = excluded.draw_count,
    status = 'drawing',
    result_draw_ids = '{}'::uuid[],
    error_message = null,
    started_at = now(),
    updated_at = now(),
    completed_at = null
  returning
    live_row.id,
    live_row.prize_name,
    live_row.provider,
    live_row.draw_count,
    live_row.started_at;
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
  from public.raffle_event_candidates(v_event_id) m
  where not exists (
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
  v_round_eligible integer;
  v_active_member_count integer;
  v_excluded_count integer;
  v_provider_excluded boolean;
  v_prize_remaining_before integer;
  v_slot integer;
  v_draw_id uuid;
  v_round_id uuid := extensions.gen_random_uuid();
  v_seed text;
  v_eligible_members jsonb;
  v_eligible_manifest text;
  v_eligible_manifest_hash text;
  v_selector_input text;
  v_selector_hash text;
  v_selected_index integer;
  v_selected_member_id uuid;
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
  from public.raffle_event_candidates(v_event.id) m
  where (v_prize.provider_member_id is null or m.id <> v_prize.provider_member_id)
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

  v_round_eligible := v_eligible;

  for v_index in 1..v_draw_count loop
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

    select count(*)::integer
    into v_active_member_count
    from public.raffle_event_candidates(v_event.id);

    select count(*)::integer
    into v_excluded_count
    from public.raffle_exclusions x
    join public.raffle_event_candidates(v_event.id) m on m.id = x.member_id
    where x.event_id = v_event.id;

    v_provider_excluded := exists (
      select 1
      from public.raffle_event_candidates(v_event.id) pm
      where pm.id = v_prize.provider_member_id
        and not exists (
          select 1
          from public.raffle_exclusions x
          where x.event_id = v_event.id
            and x.member_id = pm.id
        )
    );

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', candidate.id,
          'member_no', candidate.member_no,
          'role_name', candidate.role_name,
          'occupation', candidate.occupation,
          'joined_dc', candidate.joined_dc
        )
        order by candidate.member_no
      ),
      '[]'::jsonb
    )
    into v_eligible_members
    from (
      select
        m.id,
        m.member_no,
        public.member_label(m) as role_name,
        m.occupation,
        m.joined_dc
      from public.raffle_event_candidates(v_event.id) m
      where (v_prize.provider_member_id is null or m.id <> v_prize.provider_member_id)
        and not exists (
          select 1
          from public.raffle_exclusions x
          where x.event_id = v_event.id
            and x.member_id = m.id
        )
      order by m.member_no
    ) as candidate;

    v_eligible := jsonb_array_length(v_eligible_members);

    if v_eligible <= 0 then
      raise exception '沒有可抽選的成員了；獎項提供者不會抽中自己的獎。';
    end if;

    v_seed := encode(extensions.gen_random_bytes(32), 'hex');
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'member_no', eligible.item ->> 'member_no',
          'role_name', eligible.item ->> 'role_name',
          'occupation', eligible.item ->> 'occupation',
          'joined_dc', (eligible.item ->> 'joined_dc')::boolean
        )
        order by eligible.ordinality
      ),
      '[]'::jsonb
    )::text
    into v_eligible_manifest
    from jsonb_array_elements(v_eligible_members) with ordinality as eligible(item, ordinality);
    v_eligible_manifest_hash := encode(extensions.digest(v_eligible_manifest, 'sha256'), 'hex');
    v_selector_input := v_seed || ':' || v_event.id::text || ':' || v_prize.id::text || ':' || v_slot::text || ':' || v_eligible_manifest_hash;
    v_selector_hash := encode(extensions.digest(v_selector_input, 'sha256'), 'hex');
    v_selected_index := (public.hex_prefix_to_bigint(v_selector_hash, 12) % v_eligible) + 1;
    v_selected_member_id := (v_eligible_members -> (v_selected_index - 1) ->> 'id')::uuid;

    select *
    into v_member
    from public.rooc_members m
    where m.id = v_selected_member_id;

    if not found then
      raise exception '抽獎名單驗證失敗，請重新抽獎。';
    end if;

    v_prize_remaining_before := v_remaining - (v_index - 1);

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
      v_seed
    )
    returning id into v_draw_id;

    insert into public.raffle_draw_audits (
      event_id,
      prize_id,
      draw_id,
      round_id,
      round_draw_count,
      round_index,
      active_member_count,
      excluded_count_before,
      provider_member_id,
      provider_excluded,
      eligible_count,
      step_probability,
      round_probability,
      prize_remaining_before,
      random_seed,
      eligible_members,
      eligible_manifest,
      eligible_manifest_hash,
      selector_hash,
      selected_index
    )
    values (
      v_event.id,
      v_prize.id,
      v_draw_id,
      v_round_id,
      v_draw_count,
      v_index,
      v_active_member_count,
      v_excluded_count,
      v_prize.provider_member_id,
      v_provider_excluded,
      v_eligible,
      round(1::numeric / v_eligible::numeric, 10),
      round(v_draw_count::numeric / v_round_eligible::numeric, 10),
      v_prize_remaining_before,
      v_seed,
      v_eligible_members,
      v_eligible_manifest,
      v_eligible_manifest_hash,
      v_selector_hash,
      v_selected_index
    );

    insert into public.raffle_exclusions (event_id, member_id, reason, source_draw_id)
    values (v_event.id, v_member.id, 'pending', v_draw_id);

    return query
    select
      v_draw_id,
      v_member.member_no,
      public.member_label(v_member),
      v_prize.name,
      v_slot,
      v_seed;
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
    from public.raffle_event_candidates(v_event_id) m
    where m.member_no = nullif(trim(p_transfer_member_no), '');

    if not found then
      raise exception '指定轉讓對象不在本場名單中。';
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

revoke all on public.raffle_event_members from anon, authenticated;
revoke execute on function public.raffle_event_candidates(uuid) from public, anon, authenticated;
revoke execute on function public.create_raffle_event_with_roster(text, text, text, text, text[]) from public;
revoke execute on function public.set_raffle_event_roster(text, text, text[]) from public;
revoke execute on function public.get_raffle_event_members(text, text) from public;

grant execute on function public.create_raffle_event_with_roster(text, text, text, text, text[]) to anon, authenticated;
grant execute on function public.set_raffle_event_roster(text, text, text[]) to anon, authenticated;
grant execute on function public.get_raffle_event_members(text, text) to anon, authenticated;

commit;
