begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.raffles (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open', 'closed', 'drawn')),
  winners_count integer not null default 1 check (winners_count between 1 and 100),
  starts_at timestamptz,
  ends_at timestamptz,
  admin_pin_hash text not null,
  created_at timestamptz not null default now(),
  drawn_at timestamptz,
  check (char_length(slug) between 3 and 80),
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table if not exists public.participants (
  id uuid primary key default extensions.gen_random_uuid(),
  raffle_id uuid not null references public.raffles(id) on delete cascade,
  display_name text not null,
  email text,
  note text,
  created_at timestamptz not null default now(),
  check (char_length(display_name) between 1 and 80),
  check (email is null or char_length(email) <= 160),
  check (note is null or char_length(note) <= 240)
);

create unique index if not exists participants_unique_email_per_raffle
  on public.participants (raffle_id, lower(email))
  where email is not null and email <> '';

create table if not exists public.winners (
  id uuid primary key default extensions.gen_random_uuid(),
  raffle_id uuid not null references public.raffles(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  unique (raffle_id, participant_id),
  unique (raffle_id, position)
);

alter table public.raffles enable row level security;
alter table public.participants enable row level security;
alter table public.winners enable row level security;

create or replace function public.slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from lower(regexp_replace(regexp_replace(coalesce(input, ''), '[^a-zA-Z0-9]+', '-', 'g'), '-+', '-', 'g')));
$$;

create or replace function public.create_raffle(
  p_title text,
  p_slug text,
  p_description text,
  p_winners_count integer,
  p_admin_pin text,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
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
  p_winners_count := coalesce(p_winners_count, 1);

  if p_title is null then
    raise exception 'Title is required.';
  end if;

  if p_admin_pin is null or char_length(p_admin_pin) < 4 then
    raise exception 'Admin PIN must be at least 4 characters.';
  end if;

  if p_winners_count < 1 or p_winners_count > 100 then
    raise exception 'Winners count must be between 1 and 100.';
  end if;

  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'End time must be later than start time.';
  end if;

  v_base := public.slugify(coalesce(p_slug, p_title));
  if v_base = '' then
    v_base := 'raffle';
  end if;

  v_base := trim(both '-' from left(v_base, 72));
  v_slug := v_base;

  while exists (select 1 from public.raffles r where r.slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := trim(both '-' from left(v_base, 68)) || '-' || v_suffix::text;
  end loop;

  insert into public.raffles (
    slug,
    title,
    description,
    winners_count,
    starts_at,
    ends_at,
    admin_pin_hash
  )
  values (
    v_slug,
    p_title,
    p_description,
    p_winners_count,
    p_starts_at,
    p_ends_at,
    extensions.crypt(p_admin_pin, extensions.gen_salt('bf'))
  )
  returning public.raffles.id into v_id;

  return query
  select r.id, r.slug
  from public.raffles r
  where r.id = v_id;
end;
$$;

create or replace function public.get_raffle_public(p_slug text)
returns table(
  id uuid,
  slug text,
  title text,
  description text,
  status text,
  winners_count integer,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz,
  drawn_at timestamptz,
  participant_count bigint,
  winners jsonb
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select
    r.id,
    r.slug,
    r.title,
    r.description,
    r.status,
    r.winners_count,
    r.starts_at,
    r.ends_at,
    r.created_at,
    r.drawn_at,
    (select count(*) from public.participants p where p.raffle_id = r.id) as participant_count,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'position', winner_rows.position,
            'display_name', winner_rows.display_name
          )
          order by winner_rows.position
        )
        from (
          select w.position, p.display_name
          from public.winners w
          join public.participants p on p.id = w.participant_id
          where w.raffle_id = r.id
          order by w.position
        ) as winner_rows
      ),
      '[]'::jsonb
    ) as winners
  from public.raffles r
  where r.slug = lower(trim(p_slug));
$$;

create or replace function public.join_raffle(
  p_slug text,
  p_display_name text,
  p_email text default null,
  p_note text default null
)
returns table(participant_id uuid, participant_count bigint)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_raffle public.raffles%rowtype;
  v_name text;
  v_email text;
  v_note text;
  v_id uuid;
begin
  select *
  into v_raffle
  from public.raffles r
  where r.slug = lower(trim(p_slug));

  if not found then
    raise exception 'Raffle not found.';
  end if;

  if v_raffle.status <> 'open' then
    raise exception 'Raffle is not open.';
  end if;

  if v_raffle.starts_at is not null and now() < v_raffle.starts_at then
    raise exception 'Raffle has not started.';
  end if;

  if v_raffle.ends_at is not null and now() > v_raffle.ends_at then
    raise exception 'Raffle has ended.';
  end if;

  v_name := nullif(trim(p_display_name), '');
  v_email := lower(nullif(trim(p_email), ''));
  v_note := nullif(trim(p_note), '');

  if v_name is null then
    raise exception 'Display name is required.';
  end if;

  if char_length(v_name) > 80 then
    raise exception 'Display name is too long.';
  end if;

  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email format is invalid.';
  end if;

  if v_email is not null and exists (
    select 1
    from public.participants p
    where p.raffle_id = v_raffle.id
      and lower(p.email) = v_email
  ) then
    raise exception 'This email has already joined.';
  end if;

  insert into public.participants (raffle_id, display_name, email, note)
  values (v_raffle.id, v_name, v_email, v_note)
  returning id into v_id;

  return query
  select
    v_id,
    (select count(*) from public.participants p where p.raffle_id = v_raffle.id);
end;
$$;

create or replace function public.get_raffle_admin(
  p_slug text,
  p_admin_pin text
)
returns table(
  id uuid,
  slug text,
  title text,
  description text,
  status text,
  winners_count integer,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz,
  drawn_at timestamptz,
  participant_count bigint,
  participants jsonb,
  winners jsonb
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_raffle public.raffles%rowtype;
begin
  select *
  into v_raffle
  from public.raffles r
  where r.slug = lower(trim(p_slug));

  if not found then
    return;
  end if;

  if p_admin_pin is null or extensions.crypt(p_admin_pin, v_raffle.admin_pin_hash) <> v_raffle.admin_pin_hash then
    return;
  end if;

  return query
  select
    v_raffle.id,
    v_raffle.slug,
    v_raffle.title,
    v_raffle.description,
    v_raffle.status,
    v_raffle.winners_count,
    v_raffle.starts_at,
    v_raffle.ends_at,
    v_raffle.created_at,
    v_raffle.drawn_at,
    (select count(*) from public.participants p where p.raffle_id = v_raffle.id) as participant_count,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'display_name', p.display_name,
            'email', p.email,
            'note', p.note,
            'created_at', p.created_at
          )
          order by p.created_at desc
        )
        from public.participants p
        where p.raffle_id = v_raffle.id
      ),
      '[]'::jsonb
    ) as participants,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'position', winner_rows.position,
            'display_name', winner_rows.display_name,
            'email', winner_rows.email
          )
          order by winner_rows.position
        )
        from (
          select w.position, p.display_name, p.email
          from public.winners w
          join public.participants p on p.id = w.participant_id
          where w.raffle_id = v_raffle.id
          order by w.position
        ) as winner_rows
      ),
      '[]'::jsonb
    ) as winners;
end;
$$;

create or replace function public.set_raffle_status(
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
  v_raffle public.raffles%rowtype;
begin
  select *
  into v_raffle
  from public.raffles r
  where r.slug = lower(trim(p_slug));

  if not found then
    raise exception 'Raffle not found.';
  end if;

  if p_admin_pin is null or extensions.crypt(p_admin_pin, v_raffle.admin_pin_hash) <> v_raffle.admin_pin_hash then
    raise exception 'Admin PIN is invalid.';
  end if;

  if v_raffle.status = 'drawn' then
    raise exception 'Drawn raffle cannot be changed.';
  end if;

  if p_status not in ('open', 'closed') then
    raise exception 'Status must be open or closed.';
  end if;

  update public.raffles
  set status = p_status
  where id = v_raffle.id;
end;
$$;

create or replace function public.draw_raffle(
  p_slug text,
  p_admin_pin text,
  p_winners_count integer default null
)
returns table(winners jsonb)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_raffle public.raffles%rowtype;
  v_total integer;
  v_requested integer;
  v_pick_count integer;
begin
  select *
  into v_raffle
  from public.raffles r
  where r.slug = lower(trim(p_slug));

  if not found then
    raise exception 'Raffle not found.';
  end if;

  if p_admin_pin is null or extensions.crypt(p_admin_pin, v_raffle.admin_pin_hash) <> v_raffle.admin_pin_hash then
    raise exception 'Admin PIN is invalid.';
  end if;

  if v_raffle.status = 'drawn' then
    raise exception 'Raffle has already been drawn.';
  end if;

  select count(*)::integer
  into v_total
  from public.participants p
  where p.raffle_id = v_raffle.id;

  if v_total = 0 then
    raise exception 'No participants to draw.';
  end if;

  v_requested := coalesce(p_winners_count, v_raffle.winners_count);
  if v_requested < 1 or v_requested > 100 then
    raise exception 'Winners count must be between 1 and 100.';
  end if;

  v_pick_count := least(v_requested, v_total);

  with shuffled as (
    select p.id, random() as sort_key
    from public.participants p
    where p.raffle_id = v_raffle.id
  ),
  picked as (
    select
      s.id,
      row_number() over (order by s.sort_key)::integer as position
    from shuffled s
    order by s.sort_key
    limit v_pick_count
  )
  insert into public.winners (raffle_id, participant_id, position)
  select v_raffle.id, p.id, p.position
  from picked p;

  update public.raffles
  set
    status = 'drawn',
    winners_count = v_pick_count,
    drawn_at = now()
  where id = v_raffle.id;

  return query
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'position', winner_rows.position,
          'display_name', winner_rows.display_name,
          'email', winner_rows.email
        )
        order by winner_rows.position
      )
      from (
        select w.position, p.display_name, p.email
        from public.winners w
        join public.participants p on p.id = w.participant_id
        where w.raffle_id = v_raffle.id
        order by w.position
      ) as winner_rows
    ),
    '[]'::jsonb
  ) as winners;
end;
$$;

revoke all on public.raffles from anon, authenticated;
revoke all on public.participants from anon, authenticated;
revoke all on public.winners from anon, authenticated;

grant usage on schema public to anon, authenticated;
grant execute on function public.create_raffle(text, text, text, integer, text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.get_raffle_public(text) to anon, authenticated;
grant execute on function public.join_raffle(text, text, text, text) to anon, authenticated;
grant execute on function public.get_raffle_admin(text, text) to anon, authenticated;
grant execute on function public.set_raffle_status(text, text, text) to anon, authenticated;
grant execute on function public.draw_raffle(text, text, integer) to anon, authenticated;

commit;
