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

create table if not exists public.guide_posts (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null default '一般',
  summary text,
  content text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  check (char_length(slug) between 3 and 96),
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  check (char_length(title) between 1 and 160),
  check (char_length(category) between 1 and 80),
  check (summary is null or char_length(summary) <= 500)
);

create table if not exists public.guide_image_upload_paths (
  object_path text primary key,
  original_name text,
  content_type text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (char_length(object_path) between 16 and 260),
  check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif'))
);

create table if not exists public.guide_image_delete_paths (
  object_path text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (char_length(object_path) between 16 and 260)
);

do $$
begin
  if to_regclass('storage.buckets') is not null then
    execute $storage$
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values (
        'rooc-guide-images',
        'rooc-guide-images',
        true,
        5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      )
      on conflict (id) do update
      set
        public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types
    $storage$;
  end if;
end;
$$;

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

create table if not exists public.raffle_draw_audits (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null references public.raffle_events(id) on delete cascade,
  prize_id uuid not null references public.raffle_prizes(id) on delete cascade,
  draw_id uuid not null unique references public.raffle_draws(id) on delete cascade,
  round_id uuid not null,
  round_draw_count integer not null check (round_draw_count between 1 and 50),
  round_index integer not null check (round_index > 0),
  active_member_count integer not null check (active_member_count >= 0),
  excluded_count_before integer not null check (excluded_count_before >= 0),
  provider_member_id uuid references public.rooc_members(id),
  provider_excluded boolean not null default false,
  eligible_count integer not null check (eligible_count > 0),
  step_probability numeric(14, 10) not null,
  round_probability numeric(14, 10) not null,
  prize_remaining_before integer not null check (prize_remaining_before > 0),
  random_seed text not null,
  eligible_members jsonb not null,
  eligible_manifest text not null,
  eligible_manifest_hash text not null,
  selector_hash text not null,
  selected_index integer not null check (selected_index > 0),
  algorithm text not null default 'rooc-sha256-index-v1',
  created_at timestamptz not null default now(),
  check (char_length(random_seed) between 32 and 128),
  check (char_length(eligible_manifest_hash) = 64),
  check (char_length(selector_hash) = 64)
);

create table if not exists public.raffle_live_draws (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null unique references public.raffle_events(id) on delete cascade,
  prize_id uuid references public.raffle_prizes(id) on delete set null,
  prize_name text not null,
  provider text not null,
  draw_count integer not null check (draw_count between 1 and 50),
  status text not null default 'drawing' check (status in ('drawing', 'completed', 'failed')),
  result_draw_ids uuid[] not null default '{}',
  error_message text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (char_length(prize_name) between 1 and 120),
  check (char_length(provider) between 1 and 220),
  check (error_message is null or char_length(error_message) <= 500)
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

create index if not exists raffle_draw_audits_event_created_idx
  on public.raffle_draw_audits (event_id, created_at desc);

create index if not exists raffle_draw_audits_round_idx
  on public.raffle_draw_audits (round_id, round_index);

create index if not exists raffle_live_draws_event_status_idx
  on public.raffle_live_draws (event_id, status, updated_at desc);

create index if not exists guide_posts_admin_order_idx
  on public.guide_posts (updated_at desc);

create index if not exists guide_posts_public_order_idx
  on public.guide_posts (status, is_pinned desc, updated_at desc, published_at desc);

create index if not exists guide_posts_category_idx
  on public.guide_posts (category);

alter table public.raffle_app_config enable row level security;
alter table public.rooc_members enable row level security;
alter table public.rooc_occupations enable row level security;
alter table public.guide_posts enable row level security;
alter table public.guide_image_upload_paths enable row level security;
alter table public.guide_image_delete_paths enable row level security;
alter table public.raffle_events enable row level security;
alter table public.raffle_prizes enable row level security;
alter table public.raffle_draws enable row level security;
alter table public.raffle_exclusions enable row level security;
alter table public.raffle_draw_audits enable row level security;
alter table public.raffle_live_draws enable row level security;

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

create or replace function public.hex_prefix_to_bigint(
  p_hex text,
  p_chars integer default 12
)
returns bigint
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_clean text := lower(regexp_replace(coalesce(p_hex, ''), '[^0-9a-f]', '', 'g'));
  v_length integer := least(greatest(coalesce(p_chars, 12), 0), length(v_clean));
  v_result numeric := 0;
  v_char text;
  v_digit integer;
  v_pos integer;
begin
  if v_length <= 0 then
    return 0;
  end if;

  for v_pos in 1..v_length loop
    v_char := substr(v_clean, v_pos, 1);
    v_digit := position(v_char in '0123456789abcdef') - 1;
    if v_digit < 0 then
      v_digit := 0;
    end if;
    v_result := v_result * 16 + v_digit;
  end loop;

  return v_result::bigint;
end;
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

create or replace function public.list_guide_posts_admin(
  p_app_admin_pin text,
  p_query text default null,
  p_status text default null
)
returns table(
  id uuid,
  slug text,
  title text,
  category text,
  summary text,
  content text,
  status text,
  is_pinned boolean,
  created_at timestamptz,
  updated_at timestamptz,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_query text := nullif(trim(p_query), '');
  v_status text := nullif(trim(p_status), '');
begin
  perform public.assert_app_admin(p_app_admin_pin);

  return query
  select
    g.id,
    g.slug,
    g.title,
    g.category,
    g.summary,
    g.content,
    g.status,
    g.is_pinned,
    g.created_at,
    g.updated_at,
    g.published_at
  from public.guide_posts g
  where (v_status is null or g.status = v_status)
    and (
      v_query is null
      or g.title ilike '%' || v_query || '%'
      or g.category ilike '%' || v_query || '%'
      or coalesce(g.summary, '') ilike '%' || v_query || '%'
      or g.content ilike '%' || v_query || '%'
    )
  order by g.is_pinned desc, g.updated_at desc, g.created_at desc;
end;
$$;

create or replace function public.upsert_guide_post(
  p_app_admin_pin text,
  p_id uuid,
  p_title text,
  p_slug text,
  p_category text,
  p_summary text,
  p_content text,
  p_status text,
  p_is_pinned boolean default false
)
returns table(
  id uuid,
  slug text,
  title text,
  category text,
  summary text,
  content text,
  status text,
  is_pinned boolean,
  created_at timestamptz,
  updated_at timestamptz,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_title text := nullif(trim(p_title), '');
  v_slug_base text := public.slugify(coalesce(nullif(trim(p_slug), ''), p_title));
  v_slug text;
  v_suffix integer := 1;
  v_category text := coalesce(nullif(trim(p_category), ''), '一般');
  v_summary text := nullif(trim(p_summary), '');
  v_content text := coalesce(p_content, '');
  v_status text := coalesce(nullif(trim(p_status), ''), 'draft');
  v_existing public.guide_posts%rowtype;
  v_id uuid;
begin
  perform public.assert_app_admin(p_app_admin_pin);

  if v_title is null then
    raise exception '請輸入攻略標題。';
  end if;

  if v_status not in ('draft', 'published') then
    raise exception '攻略狀態不正確。';
  end if;

  if v_slug_base = '' then
    v_slug_base := 'guide';
  end if;
  v_slug_base := trim(both '-' from left(v_slug_base, 88));
  if char_length(v_slug_base) < 3 then
    v_slug_base := 'guide-' || v_slug_base;
  end if;
  v_slug := v_slug_base;

  while exists (
    select 1
    from public.guide_posts g
    where g.slug = v_slug
      and (p_id is null or g.id <> p_id)
  ) loop
    v_suffix := v_suffix + 1;
    v_slug := trim(both '-' from left(v_slug_base, 84)) || '-' || v_suffix::text;
  end loop;

  if p_id is not null then
    select *
    into v_existing
    from public.guide_posts g
    where g.id = p_id;

    if not found then
      raise exception '找不到攻略。';
    end if;

    update public.guide_posts
    set
      slug = v_slug,
      title = v_title,
      category = v_category,
      summary = v_summary,
      content = v_content,
      status = v_status,
      is_pinned = coalesce(p_is_pinned, false),
      updated_at = now(),
      published_at = case
        when v_status = 'published' and v_existing.published_at is null then now()
        when v_status = 'published' then v_existing.published_at
        else null
      end
    where public.guide_posts.id = p_id
    returning public.guide_posts.id into v_id;
  else
    insert into public.guide_posts (
      slug,
      title,
      category,
      summary,
      content,
      status,
      is_pinned,
      published_at
    )
    values (
      v_slug,
      v_title,
      v_category,
      v_summary,
      v_content,
      v_status,
      coalesce(p_is_pinned, false),
      case when v_status = 'published' then now() else null end
    )
    returning public.guide_posts.id into v_id;
  end if;

  return query
  select
    g.id,
    g.slug,
    g.title,
    g.category,
    g.summary,
    g.content,
    g.status,
    g.is_pinned,
    g.created_at,
    g.updated_at,
    g.published_at
  from public.guide_posts g
  where g.id = v_id;
end;
$$;

create or replace function public.delete_guide_post(
  p_app_admin_pin text,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public.assert_app_admin(p_app_admin_pin);

  delete from public.guide_posts g
  where g.id = p_id;

  if not found then
    raise exception '找不到攻略。';
  end if;
end;
$$;

create or replace function public.create_guide_image_upload_path(
  p_app_admin_pin text,
  p_file_name text,
  p_content_type text
)
returns table(
  bucket_name text,
  object_path text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_file_name text := nullif(trim(p_file_name), '');
  v_content_type text := lower(nullif(trim(p_content_type), ''));
  v_extension text;
  v_object_path text;
begin
  perform public.assert_app_admin(p_app_admin_pin);

  if v_content_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif') then
    raise exception '圖片格式只支援 JPG、PNG、WEBP 或 GIF。';
  end if;

  v_extension := case v_content_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'image/gif' then 'gif'
  end;
  v_object_path := 'guides/' || to_char(now(), 'YYYY/MM') || '/' || replace(extensions.gen_random_uuid()::text, '-', '') || '.' || v_extension;

  insert into public.guide_image_upload_paths (
    object_path,
    original_name,
    content_type,
    expires_at
  )
  values (
    v_object_path,
    left(v_file_name, 220),
    v_content_type,
    now() + interval '15 minutes'
  );

  return query select 'rooc-guide-images'::text, v_object_path;
end;
$$;

create or replace function public.can_upload_guide_image(
  p_object_path text
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.guide_image_upload_paths upload_path
    where upload_path.object_path = p_object_path
      and upload_path.expires_at > now()
  );
$$;

create or replace function public.create_guide_image_delete_paths(
  p_app_admin_pin text,
  p_object_paths text[]
)
returns table(
  bucket_name text,
  object_path text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public.assert_app_admin(p_app_admin_pin);

  delete from public.guide_image_delete_paths delete_path
  where delete_path.expires_at <= now();

  insert into public.guide_image_delete_paths (
    object_path,
    expires_at
  )
  select distinct upload_path.object_path, now() + interval '15 minutes'
  from unnest(coalesce(p_object_paths, array[]::text[])) requested_path(object_path)
  join public.guide_image_upload_paths upload_path
    on upload_path.object_path = requested_path.object_path
  where requested_path.object_path like 'guides/%'
    and not exists (
      select 1
      from public.guide_posts guide
      where guide.content like '%' || upload_path.object_path || '%'
    )
  on conflict on constraint guide_image_delete_paths_pkey do update
  set
    created_at = now(),
    expires_at = excluded.expires_at;

  return query
  select 'rooc-guide-images'::text, delete_path.object_path
  from public.guide_image_delete_paths delete_path
  where delete_path.expires_at > now()
    and delete_path.object_path = any(coalesce(p_object_paths, array[]::text[]))
    and not exists (
      select 1
      from public.guide_posts guide
      where guide.content like '%' || delete_path.object_path || '%'
    );
end;
$$;

create or replace function public.list_unused_guide_images(
  p_app_admin_pin text
)
returns table(
  bucket_name text,
  object_path text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public.assert_app_admin(p_app_admin_pin);

  delete from public.guide_image_delete_paths delete_path
  where delete_path.expires_at <= now();

  insert into public.guide_image_delete_paths (
    object_path,
    expires_at
  )
  select upload_path.object_path, now() + interval '15 minutes'
  from public.guide_image_upload_paths upload_path
  where upload_path.expires_at <= now()
    and not exists (
      select 1
      from public.guide_posts guide
      where guide.content like '%' || upload_path.object_path || '%'
    )
  on conflict on constraint guide_image_delete_paths_pkey do update
  set
    created_at = now(),
    expires_at = excluded.expires_at;

  return query
  select 'rooc-guide-images'::text, delete_path.object_path
  from public.guide_image_delete_paths delete_path
  where delete_path.expires_at > now()
    and not exists (
      select 1
      from public.guide_posts guide
      where guide.content like '%' || delete_path.object_path || '%'
    );
end;
$$;

create or replace function public.finalize_guide_image_deletes(
  p_app_admin_pin text,
  p_object_paths text[]
)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_count integer := 0;
begin
  perform public.assert_app_admin(p_app_admin_pin);

  delete from public.guide_image_delete_paths delete_path
  where delete_path.object_path = any(coalesce(p_object_paths, array[]::text[]));

  delete from public.guide_image_upload_paths upload_path
  where upload_path.object_path = any(coalesce(p_object_paths, array[]::text[]));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.can_delete_guide_image(
  p_object_path text
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.guide_image_delete_paths delete_path
    where delete_path.object_path = p_object_path
      and delete_path.expires_at > now()
      and not exists (
        select 1
        from public.guide_posts guide
        where guide.content like '%' || delete_path.object_path || '%'
      )
  );
$$;

do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "rooc guide images upload with admin path" on storage.objects';
    execute 'drop policy if exists "rooc guide images delete with admin path" on storage.objects';
    execute $storage$
      create policy "rooc guide images upload with admin path"
      on storage.objects
      for insert
      to anon, authenticated
      with check (
        bucket_id = 'rooc-guide-images'
        and public.can_upload_guide_image(name)
      )
    $storage$;
    execute $storage$
      create policy "rooc guide images delete with admin path"
      on storage.objects
      for delete
      to anon, authenticated
      using (
        bucket_id = 'rooc-guide-images'
        and public.can_delete_guide_image(name)
      )
    $storage$;
  end if;
end;
$$;

create or replace function public.list_public_guide_posts(
  p_query text default null,
  p_category text default null
)
returns table(
  slug text,
  title text,
  category text,
  summary text,
  is_pinned boolean,
  updated_at timestamptz,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_query text := nullif(trim(p_query), '');
  v_category text := nullif(trim(p_category), '');
begin
  return query
  select
    g.slug,
    g.title,
    g.category,
    g.summary,
    g.is_pinned,
    g.updated_at,
    g.published_at
  from public.guide_posts g
  where g.status = 'published'
    and (v_category is null or g.category = v_category)
    and (
      v_query is null
      or g.title ilike '%' || v_query || '%'
      or g.category ilike '%' || v_query || '%'
      or coalesce(g.summary, '') ilike '%' || v_query || '%'
      or g.content ilike '%' || v_query || '%'
    )
  order by g.is_pinned desc, g.updated_at desc, g.published_at desc nulls last;
end;
$$;

create or replace function public.get_public_guide_post(
  p_slug text
)
returns table(
  slug text,
  title text,
  category text,
  summary text,
  content text,
  is_pinned boolean,
  updated_at timestamptz,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  return query
  select
    g.slug,
    g.title,
    g.category,
    g.summary,
    g.content,
    g.is_pinned,
    g.updated_at,
    g.published_at
  from public.guide_posts g
  where g.status = 'published'
    and g.slug = lower(trim(p_slug));
end;
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
  if char_length(v_base) < 3 then
    v_base := 'raffle-' || v_base;
  end if;
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

create or replace function public.set_raffle_prize_quantity(
  p_slug text,
  p_admin_pin text,
  p_prize_id uuid,
  p_quantity integer
)
returns table(id uuid, name text, provider text, quantity integer)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event public.raffle_events%rowtype;
  v_prize public.raffle_prizes%rowtype;
  v_used_count integer;
begin
  select *
  into v_event
  from public.raffle_events e
  where e.id = public.validate_event_admin(p_slug, p_admin_pin)
  for update;

  if v_event.status <> 'live' then
    raise exception '活動已關閉，不能調整獎項名額。';
  end if;

  if p_prize_id is null then
    raise exception '請選擇要調整的獎項。';
  end if;

  p_quantity := coalesce(p_quantity, 1);

  if p_quantity < 1 or p_quantity > 200 then
    raise exception '獎項名額必須介於 1 到 200。';
  end if;

  select *
  into v_prize
  from public.raffle_prizes p
  where p.id = p_prize_id
    and p.event_id = v_event.id
    and p.is_active
  for update;

  if not found then
    raise exception '找不到要調整的獎項。';
  end if;

  select count(*)::integer
  into v_used_count
  from public.raffle_draws d
  where d.prize_id = v_prize.id
    and d.status in ('pending', 'accepted', 'transferred');

  if p_quantity < v_used_count then
    raise exception '名額不能低於已抽出或待處理數量。';
  end if;

  update public.raffle_prizes p
  set quantity = p_quantity
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
            exists (
              select 1
              from public.rooc_members pm
              where pm.id = p.provider_member_id
                and pm.is_active
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
        from public.rooc_members m
        where m.is_active
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
        from public.rooc_members m
        where m.is_active
          and not exists (
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

create or replace function public.list_public_raffle_events()
returns table(
  slug text,
  title text,
  status text,
  created_at timestamptz,
  closed_at timestamptz,
  prize_count bigint,
  draw_count bigint,
  award_count bigint,
  last_draw_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  return query
  select
    e.slug,
    e.title,
    e.status,
    e.created_at,
    e.closed_at,
    count(distinct p.id) as prize_count,
    count(distinct d.id) as draw_count,
    count(distinct d.id) filter (where d.status in ('accepted', 'transferred')) as award_count,
    coalesce(greatest(max(d.created_at), max(l.updated_at)), max(d.created_at), max(l.updated_at)) as last_draw_at
  from public.raffle_events e
  left join public.raffle_prizes p on p.event_id = e.id
  left join public.raffle_draws d on d.event_id = e.id
  left join public.raffle_live_draws l on l.event_id = e.id
  where e.status = 'live'
    or exists (
    select 1
    from public.raffle_draws existing_draws
    where existing_draws.event_id = e.id
  )
    or e.status = 'closed'
  group by e.id
  order by coalesce(greatest(max(d.created_at), max(l.updated_at)), e.closed_at, e.created_at) desc;
end;
$$;

create or replace function public.get_public_raffle_event(
  p_slug text
)
returns table(
  id uuid,
  slug text,
  title text,
  description text,
  status text,
  created_at timestamptz,
  closed_at timestamptz,
  prize_count bigint,
  draw_count bigint,
  award_count bigint,
  prizes jsonb,
  awards jsonb,
  draws jsonb
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_slug text := nullif(trim(p_slug), '');
  v_event public.raffle_events%rowtype;
begin
  if v_slug is null then
    raise exception '請選擇活動。';
  end if;

  select *
  into v_event
  from public.raffle_events e
  where e.slug = v_slug;

  if not found then
    raise exception '找不到活動。';
  end if;

  return query
  select
    v_event.id,
    v_event.slug,
    v_event.title,
    v_event.description,
    v_event.status,
    v_event.created_at,
    v_event.closed_at,
    (select count(*) from public.raffle_prizes p where p.event_id = v_event.id) as prize_count,
    (select count(*) from public.raffle_draws d where d.event_id = v_event.id) as draw_count,
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
            'quantity', prize_rows.quantity,
            'draw_count', prize_rows.draw_count,
            'filled_count', prize_rows.filled_count,
            'pending_count', prize_rows.pending_count,
            'remaining_count', greatest(prize_rows.quantity - prize_rows.filled_count - prize_rows.pending_count, 0)
          )
          order by prize_rows.sort_order, prize_rows.created_at
        )
        from (
          select
            p.id,
            p.name,
            p.provider,
            p.quantity,
            p.sort_order,
            p.created_at,
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
            'id', award_rows.id,
            'prize_name', award_rows.prize_name,
            'provider', award_rows.provider,
            'slot_number', award_rows.slot_number,
            'drawn_member_no', award_rows.drawn_member_no,
            'drawn_role_name', award_rows.drawn_role_name,
            'final_member_no', award_rows.final_member_no,
            'final_role_name', award_rows.final_role_name,
            'status', award_rows.status,
            'resolved_at', award_rows.resolved_at
          )
          order by award_rows.resolved_at desc
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
            d.resolved_at
          from public.raffle_draws d
          join public.raffle_prizes p on p.id = d.prize_id
          join public.rooc_members dm on dm.id = d.drawn_member_id
          join public.rooc_members fm on fm.id = d.final_member_id
          where d.event_id = v_event.id
            and d.status in ('accepted', 'transferred')
          order by d.resolved_at desc
        ) as award_rows
      ),
      '[]'::jsonb
    ) as awards,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', draw_rows.id,
            'event_id', v_event.id,
            'prize_id', draw_rows.prize_id,
            'prize_name', draw_rows.prize_name,
            'provider', draw_rows.provider,
            'slot_number', draw_rows.slot_number,
            'drawn_member_no', draw_rows.drawn_member_no,
            'drawn_role_name', draw_rows.drawn_role_name,
            'final_member_no', draw_rows.final_member_no,
            'final_role_name', draw_rows.final_role_name,
            'status', draw_rows.status,
            'created_at', draw_rows.created_at,
            'resolved_at', draw_rows.resolved_at,
            'audit', case
              when draw_rows.audit_id is null then null
              else jsonb_build_object(
                'id', draw_rows.audit_id,
                'algorithm', draw_rows.algorithm,
                'round_id', draw_rows.round_id,
                'round_draw_count', draw_rows.round_draw_count,
                'round_index', draw_rows.round_index,
                'active_member_count', draw_rows.active_member_count,
                'excluded_count_before', draw_rows.excluded_count_before,
                'provider_excluded', draw_rows.provider_excluded,
                'eligible_count', draw_rows.eligible_count,
                'step_probability', draw_rows.step_probability,
                'round_probability', draw_rows.round_probability,
                'prize_remaining_before', draw_rows.prize_remaining_before,
                'random_seed', draw_rows.random_seed,
                'eligible_manifest', draw_rows.eligible_manifest,
                'eligible_manifest_hash', draw_rows.eligible_manifest_hash,
                'selector_hash', draw_rows.selector_hash,
                'selected_index', draw_rows.selected_index,
                'eligible_members', coalesce(
                  (
                    select jsonb_agg(
                      jsonb_build_object(
                        'position', eligible.ordinality,
                        'member_no', eligible.item ->> 'member_no',
                        'role_name', eligible.item ->> 'role_name',
                        'occupation', eligible.item ->> 'occupation',
                        'joined_dc', (eligible.item ->> 'joined_dc')::boolean
                      )
                      order by eligible.ordinality
                    )
                    from jsonb_array_elements(draw_rows.eligible_members) with ordinality as eligible(item, ordinality)
                  ),
                  '[]'::jsonb
                )
              )
            end
          )
          order by draw_rows.created_at desc
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
            d.created_at,
            d.resolved_at,
            a.id as audit_id,
            a.algorithm,
            a.round_id,
            a.round_draw_count,
            a.round_index,
            a.active_member_count,
            a.excluded_count_before,
            a.provider_excluded,
            a.eligible_count,
            a.step_probability,
            a.round_probability,
            a.prize_remaining_before,
            a.random_seed,
            a.eligible_members,
            a.eligible_manifest,
            a.eligible_manifest_hash,
            a.selector_hash,
            a.selected_index
          from public.raffle_draws d
          join public.raffle_prizes p on p.id = d.prize_id
          join public.rooc_members dm on dm.id = d.drawn_member_id
          left join public.rooc_members fm on fm.id = d.final_member_id
          left join public.raffle_draw_audits a on a.draw_id = d.id
          where d.event_id = v_event.id
          order by d.created_at desc
        ) as draw_rows
      ),
      '[]'::jsonb
    ) as draws;
end;
$$;

create or replace function public.get_public_raffle_live_draw(
  p_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_slug text := nullif(trim(p_slug), '');
  v_event_id uuid;
begin
  if v_slug is null then
    raise exception '請選擇活動。';
  end if;

  select e.id
  into v_event_id
  from public.raffle_events e
  where e.slug = v_slug;

  if not found then
    raise exception '找不到活動。';
  end if;

  return (
    select jsonb_build_object(
      'id', l.id,
      'event_id', l.event_id,
      'prize_id', l.prize_id,
      'prize_name', l.prize_name,
      'provider', l.provider,
      'draw_count', l.draw_count,
      'status', l.status,
      'result_draw_ids', l.result_draw_ids,
      'error_message', l.error_message,
      'started_at', l.started_at,
      'updated_at', l.updated_at,
      'completed_at', l.completed_at
    )
    from public.raffle_live_draws l
    where l.event_id = v_event_id
      and (
        (l.status = 'drawing' and l.updated_at > now() - interval '5 minutes')
        or (l.status in ('completed', 'failed') and l.updated_at > now() - interval '45 seconds')
      )
    limit 1
  );
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
  from public.rooc_members m
  where m.is_active
    and (v_prize.provider_member_id is null or m.id <> v_prize.provider_member_id)
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

create or replace function public.finish_raffle_live_draw(
  p_slug text,
  p_admin_pin text,
  p_live_id uuid,
  p_status text,
  p_draw_ids uuid[] default '{}',
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event_id uuid;
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  v_event_id := public.validate_event_admin(p_slug, p_admin_pin);

  if p_live_id is null then
    raise exception '找不到直播抽獎狀態。';
  end if;

  if v_status not in ('completed', 'failed') then
    raise exception '直播抽獎狀態不正確。';
  end if;

  update public.raffle_live_draws l
  set
    status = v_status,
    result_draw_ids = coalesce(p_draw_ids, '{}'::uuid[]),
    error_message = left(nullif(trim(coalesce(p_error_message, '')), ''), 500),
    updated_at = now(),
    completed_at = now()
  where l.event_id = v_event_id
    and l.id = p_live_id;

  if not found then
    raise exception '找不到直播抽獎狀態。';
  end if;
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
    from public.rooc_members m
    where m.is_active;

    select count(*)::integer
    into v_excluded_count
    from public.raffle_exclusions x
    join public.rooc_members m on m.id = x.member_id
    where x.event_id = v_event.id
      and m.is_active;

    v_provider_excluded := exists (
      select 1
      from public.rooc_members pm
      where pm.id = v_prize.provider_member_id
        and pm.is_active
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
      from public.rooc_members m
      where m.is_active
        and (v_prize.provider_member_id is null or m.id <> v_prize.provider_member_id)
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
revoke all on public.guide_posts from anon, authenticated;
revoke all on public.guide_image_upload_paths from anon, authenticated;
revoke all on public.guide_image_delete_paths from anon, authenticated;
revoke all on public.raffle_events from anon, authenticated;
revoke all on public.raffle_prizes from anon, authenticated;
revoke all on public.raffle_draws from anon, authenticated;
revoke all on public.raffle_exclusions from anon, authenticated;
revoke all on public.raffle_draw_audits from anon, authenticated;
revoke all on public.raffle_live_draws from anon, authenticated;

revoke execute on function public.slugify(text) from public, anon, authenticated;
revoke execute on function public.member_label(public.rooc_members) from public, anon, authenticated;
revoke execute on function public.hex_prefix_to_bigint(text, integer) from public, anon, authenticated;
revoke execute on function public.assert_app_admin(text) from public, anon, authenticated;
revoke execute on function public.validate_event_admin(text, text) from public, anon, authenticated;
revoke execute on function public.initialize_app_admin(text) from public;
revoke execute on function public.change_app_admin_pin(text, text) from public;
revoke execute on function public.list_guide_posts_admin(text, text, text) from public;
revoke execute on function public.upsert_guide_post(text, uuid, text, text, text, text, text, text, boolean) from public;
revoke execute on function public.delete_guide_post(text, uuid) from public;
revoke execute on function public.create_guide_image_upload_path(text, text, text) from public;
revoke execute on function public.can_upload_guide_image(text) from public;
revoke execute on function public.create_guide_image_delete_paths(text, text[]) from public;
revoke execute on function public.list_unused_guide_images(text) from public;
revoke execute on function public.finalize_guide_image_deletes(text, text[]) from public;
revoke execute on function public.can_delete_guide_image(text) from public;
revoke execute on function public.list_public_guide_posts(text, text) from public;
revoke execute on function public.get_public_guide_post(text) from public;
revoke execute on function public.list_public_rooc_members(text, text) from public;
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
revoke execute on function public.set_raffle_prize_quantity(text, text, uuid, integer) from public;
revoke execute on function public.delete_raffle_prize(text, text, uuid) from public;
revoke execute on function public.get_raffle_event_admin(text, text) from public;
revoke execute on function public.get_raffle_event_admin_by_title(text, text) from public;
revoke execute on function public.get_raffle_event_rosters(text, text) from public;
revoke execute on function public.list_public_raffle_events() from public;
revoke execute on function public.get_public_raffle_event(text) from public;
revoke execute on function public.get_public_raffle_live_draw(text) from public;
revoke execute on function public.start_raffle_live_draw(text, text, uuid, integer) from public;
revoke execute on function public.finish_raffle_live_draw(text, text, uuid, text, uuid[], text) from public;
revoke execute on function public.get_raffle_transfer_candidates(text, text) from public;
revoke execute on function public.draw_raffle_prize(text, text, uuid, integer) from public;
revoke execute on function public.resolve_raffle_draw(text, text, uuid, text, text, text) from public;

grant usage on schema public to anon, authenticated;
grant execute on function public.initialize_app_admin(text) to anon, authenticated;
grant execute on function public.change_app_admin_pin(text, text) to anon, authenticated;
grant execute on function public.list_guide_posts_admin(text, text, text) to anon, authenticated;
grant execute on function public.upsert_guide_post(text, uuid, text, text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.delete_guide_post(text, uuid) to anon, authenticated;
grant execute on function public.create_guide_image_upload_path(text, text, text) to anon, authenticated;
grant execute on function public.can_upload_guide_image(text) to anon, authenticated;
grant execute on function public.create_guide_image_delete_paths(text, text[]) to anon, authenticated;
grant execute on function public.list_unused_guide_images(text) to anon, authenticated;
grant execute on function public.finalize_guide_image_deletes(text, text[]) to anon, authenticated;
grant execute on function public.can_delete_guide_image(text) to anon, authenticated;
grant execute on function public.list_public_guide_posts(text, text) to anon, authenticated;
grant execute on function public.get_public_guide_post(text) to anon, authenticated;
grant execute on function public.list_public_rooc_members(text, text) to anon, authenticated;
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
grant execute on function public.set_raffle_prize_quantity(text, text, uuid, integer) to anon, authenticated;
grant execute on function public.delete_raffle_prize(text, text, uuid) to anon, authenticated;
grant execute on function public.get_raffle_event_admin(text, text) to anon, authenticated;
grant execute on function public.get_raffle_event_admin_by_title(text, text) to anon, authenticated;
grant execute on function public.get_raffle_event_rosters(text, text) to anon, authenticated;
grant execute on function public.list_public_raffle_events() to anon, authenticated;
grant execute on function public.get_public_raffle_event(text) to anon, authenticated;
grant execute on function public.get_public_raffle_live_draw(text) to anon, authenticated;
grant execute on function public.start_raffle_live_draw(text, text, uuid, integer) to anon, authenticated;
grant execute on function public.finish_raffle_live_draw(text, text, uuid, text, uuid[], text) to anon, authenticated;
grant execute on function public.get_raffle_transfer_candidates(text, text) to anon, authenticated;
grant execute on function public.draw_raffle_prize(text, text, uuid, integer) to anon, authenticated;
grant execute on function public.resolve_raffle_draw(text, text, uuid, text, text, text) to anon, authenticated;

commit;
