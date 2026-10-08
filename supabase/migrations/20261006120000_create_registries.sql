create extension if not exists pgcrypto;

create table public.registries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{4,64}$'),
  title text not null,
  profile jsonb not null check (jsonb_typeof(profile) = 'object'),
  preferred_retailers text[] not null default '{}',
  due_date date,
  revision bigint not null default 0,
  created_at timestamptz not null default now()
);

create index registries_owner_idx on public.registries (owner_id);

create table public.registry_items (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.registries (id) on delete cascade,
  name text not null,
  category text not null,
  priority text not null check (priority in ('must-have', 'nice-to-have', 'later')),
  reason text not null default '',
  qty integer not null default 1 check (qty between 1 and 20),
  status text not null default 'pending' check (status in ('pending', 'keep', 'skip')),
  search_query text not null default '',
  position integer not null default 0
);

create index registry_items_registry_idx on public.registry_items (registry_id, position);

create table public.item_offers (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.registry_items (id) on delete cascade,
  retailer text not null check (retailer in ('amazon', 'walmart', 'target')),
  external_id text not null,
  title text not null,
  price numeric(10, 2),
  image_url text,
  url text not null,
  rating numeric(3, 2),
  in_stock boolean not null default true,
  is_primary boolean not null default false
);

create index item_offers_item_idx on public.item_offers (item_id);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null unique references public.registry_items (id) on delete cascade,
  buyer_name text,
  retailer text check (retailer in ('amazon', 'walmart', 'target')),
  created_at timestamptz not null default now()
);

alter table public.registries enable row level security;
alter table public.registry_items enable row level security;
alter table public.item_offers enable row level security;
alter table public.purchases enable row level security;

revoke all on table public.registries, public.registry_items, public.item_offers, public.purchases
  from public, anon, authenticated;

-- Internal helpers -----------------------------------------------------------

create schema if not exists private;

create or replace function private.insert_offers(p_item_id uuid, p_offers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.item_offers (item_id, retailer, external_id, title, price, image_url, url, rating, in_stock, is_primary)
  select
    p_item_id,
    o.value ->> 'retailer',
    o.value ->> 'externalId',
    o.value ->> 'title',
    nullif(o.value ->> 'price', '')::numeric,
    o.value ->> 'imageUrl',
    o.value ->> 'url',
    nullif(o.value ->> 'rating', '')::numeric,
    coalesce((o.value ->> 'inStock')::boolean, true),
    o.ordinality = 1
  from jsonb_array_elements(coalesce(p_offers, '[]'::jsonb)) with ordinality as o(value, ordinality);
end;
$$;

create or replace function private.insert_items(p_registry_id uuid, p_items jsonb, p_start integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_index integer := 0;
  v_item_id uuid;
begin
  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.registry_items (registry_id, name, category, priority, reason, qty, search_query, position)
    values (
      p_registry_id,
      v_item ->> 'name',
      v_item ->> 'category',
      v_item ->> 'priority',
      coalesce(v_item ->> 'reason', ''),
      coalesce((v_item ->> 'qty')::integer, 1),
      coalesce(v_item ->> 'searchQuery', ''),
      p_start + v_index
    )
    returning id into v_item_id;
    perform private.insert_offers(v_item_id, v_item -> 'offers');
    v_index := v_index + 1;
  end loop;
end;
$$;

create or replace function private.lock_owned_registry(p_registry_id uuid, p_owner_id uuid)
returns public.registries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registry public.registries;
begin
  select * into v_registry from public.registries
  where id = p_registry_id and owner_id = p_owner_id
  for update;
  if not found then
    raise exception 'REGISTRY_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_registry;
end;
$$;

create or replace function private.bump_revision(p_registry_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.registries set revision = revision + 1 where id = p_registry_id;
$$;

-- Public RPCs (service role only) -------------------------------------------

create or replace function public.registry_create(
  p_owner_id uuid,
  p_slug text,
  p_title text,
  p_profile jsonb,
  p_preferred_retailers text[],
  p_due_date date,
  p_items jsonb
)
returns public.registries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registry public.registries;
begin
  insert into public.registries (owner_id, slug, title, profile, preferred_retailers, due_date)
  values (p_owner_id, p_slug, p_title, p_profile, coalesce(p_preferred_retailers, '{}'), p_due_date)
  returning * into v_registry;
  perform private.insert_items(v_registry.id, p_items, 0);
  return v_registry;
end;
$$;

create or replace function public.registry_set_item_status(
  p_registry_id uuid,
  p_owner_id uuid,
  p_item_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_owned_registry(p_registry_id, p_owner_id);
  update public.registry_items set status = p_status
  where id = p_item_id and registry_id = p_registry_id;
  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.bump_revision(p_registry_id);
end;
$$;

create or replace function public.registry_set_primary_offer(
  p_registry_id uuid,
  p_owner_id uuid,
  p_item_id uuid,
  p_offer_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_owned_registry(p_registry_id, p_owner_id);
  if not exists (
    select 1 from public.item_offers o
    join public.registry_items i on i.id = o.item_id
    where o.id = p_offer_id and i.id = p_item_id and i.registry_id = p_registry_id
  ) then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.item_offers set is_primary = (id = p_offer_id) where item_id = p_item_id;
  perform private.bump_revision(p_registry_id);
end;
$$;

-- p_replace_offers: [{ "itemId": uuid, "searchQuery": text, "reason": text, "offers": [...] }]
create or replace function public.registry_apply_edits(
  p_registry_id uuid,
  p_owner_id uuid,
  p_remove uuid[],
  p_add jsonb,
  p_replace_offers jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next integer;
  v_swap jsonb;
  v_item_id uuid;
begin
  perform private.lock_owned_registry(p_registry_id, p_owner_id);

  delete from public.registry_items
  where registry_id = p_registry_id and id = any(coalesce(p_remove, '{}'))
    and not exists (select 1 from public.purchases p where p.item_id = registry_items.id);

  for v_swap in select value from jsonb_array_elements(coalesce(p_replace_offers, '[]'::jsonb)) loop
    v_item_id := (v_swap ->> 'itemId')::uuid;
    update public.registry_items
    set search_query = coalesce(v_swap ->> 'searchQuery', search_query),
        reason = coalesce(v_swap ->> 'reason', reason),
        status = 'pending'
    where id = v_item_id and registry_id = p_registry_id;
    if found then
      delete from public.item_offers where item_id = v_item_id;
      perform private.insert_offers(v_item_id, v_swap -> 'offers');
    end if;
  end loop;

  select coalesce(max(position), -1) + 1 into v_next
  from public.registry_items where registry_id = p_registry_id;
  perform private.insert_items(p_registry_id, p_add, v_next);

  perform private.bump_revision(p_registry_id);
end;
$$;

create or replace function public.registry_mark_purchased(
  p_slug text,
  p_item_id uuid,
  p_buyer_name text,
  p_retailer text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registry_id uuid;
begin
  select r.id into v_registry_id
  from public.registries r
  join public.registry_items i on i.registry_id = r.id
  where r.slug = p_slug and i.id = p_item_id and i.status <> 'skip'
  for update of r;
  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  begin
    insert into public.purchases (item_id, buyer_name, retailer)
    values (p_item_id, nullif(trim(p_buyer_name), ''), p_retailer);
  exception when unique_violation then
    raise exception 'ALREADY_PURCHASED' using errcode = 'P0001';
  end;

  perform private.bump_revision(v_registry_id);
end;
$$;

revoke all on function
  private.insert_offers(uuid, jsonb),
  private.insert_items(uuid, jsonb, integer),
  private.lock_owned_registry(uuid, uuid),
  private.bump_revision(uuid),
  public.registry_create(uuid, text, text, jsonb, text[], date, jsonb),
  public.registry_set_item_status(uuid, uuid, uuid, text),
  public.registry_set_primary_offer(uuid, uuid, uuid, uuid),
  public.registry_apply_edits(uuid, uuid, uuid[], jsonb, jsonb),
  public.registry_mark_purchased(text, uuid, text, text)
from public, anon, authenticated;

grant execute on function
  public.registry_create(uuid, text, text, jsonb, text[], date, jsonb),
  public.registry_set_item_status(uuid, uuid, uuid, text),
  public.registry_set_primary_offer(uuid, uuid, uuid, uuid),
  public.registry_apply_edits(uuid, uuid, uuid[], jsonb, jsonb),
  public.registry_mark_purchased(text, uuid, text, text)
to service_role;

-- Live updates for the share page -------------------------------------------

create or replace function private.broadcast_registry_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- A broadcast failure must never roll back the registry write that triggered it.
  begin
    perform realtime.send(
      jsonb_build_object('revision', new.revision),
      'registry_changed',
      'registry:' || new.slug,
      false
    );
  exception when others then
    raise warning 'registry broadcast failed: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function private.broadcast_registry_update() from public, anon, authenticated;
grant execute on function private.broadcast_registry_update() to service_role;

create trigger registries_broadcast_update
after update of revision on public.registries
for each row execute function private.broadcast_registry_update();
