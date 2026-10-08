-- Names and a note shown to family, a private shipping address, and per-person
-- address requests the parent approves.

alter table public.registries
  add column parent_names text not null default '',
  add column baby_name text not null default '',
  add column family_note text not null default '';

-- Never selected by the public share endpoint; released only through an approved request.
create table public.registry_addresses (
  registry_id uuid primary key references public.registries (id) on delete cascade,
  address jsonb not null check (jsonb_typeof(address) = 'object'),
  updated_at timestamptz not null default now()
);

create table public.address_requests (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.registries (id) on delete cascade,
  requester_name text not null check (char_length(requester_name) between 1 and 80),
  contact text not null check (char_length(contact) between 3 and 120),
  message text not null default '' check (char_length(message) <= 300),
  -- sha256 of the secret the requester's browser keeps; the secret itself is never stored.
  token_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index address_requests_registry_idx on public.address_requests (registry_id, created_at desc);

alter table public.registry_addresses enable row level security;
alter table public.address_requests enable row level security;

revoke all on table public.registry_addresses, public.address_requests from public, anon, authenticated;

-- An overload with names. The original signature stays so the running deployment keeps working
-- until the new code ships.
create or replace function public.registry_create(
  p_owner_id uuid,
  p_slug text,
  p_title text,
  p_parent_names text,
  p_baby_name text,
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
  insert into public.registries (owner_id, slug, title, parent_names, baby_name, profile, preferred_retailers, due_date)
  values (
    p_owner_id, p_slug, p_title, coalesce(p_parent_names, ''), coalesce(p_baby_name, ''),
    p_profile, coalesce(p_preferred_retailers, '{}'), p_due_date
  )
  returning * into v_registry;
  perform private.insert_items(v_registry.id, p_items, 0);
  return v_registry;
end;
$$;

create or replace function public.registry_update_details(
  p_registry_id uuid,
  p_owner_id uuid,
  p_title text,
  p_parent_names text,
  p_baby_name text,
  p_family_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_owned_registry(p_registry_id, p_owner_id);
  update public.registries
  set title = p_title, parent_names = p_parent_names, baby_name = p_baby_name, family_note = p_family_note
  where id = p_registry_id;
  perform private.bump_revision(p_registry_id);
end;
$$;

-- p_address null removes the address.
create or replace function public.registry_set_address(
  p_registry_id uuid,
  p_owner_id uuid,
  p_address jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_owned_registry(p_registry_id, p_owner_id);
  if p_address is null then
    delete from public.registry_addresses where registry_id = p_registry_id;
  else
    insert into public.registry_addresses (registry_id, address, updated_at)
    values (p_registry_id, p_address, now())
    on conflict (registry_id) do update set address = excluded.address, updated_at = now();
  end if;
  perform private.bump_revision(p_registry_id);
end;
$$;

create or replace function public.address_request_create(
  p_slug text,
  p_name text,
  p_contact text,
  p_message text,
  p_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registry_id uuid;
  v_id uuid;
begin
  select r.id into v_registry_id from public.registries r where r.slug = p_slug;
  if not found then
    raise exception 'REGISTRY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.registry_addresses a where a.registry_id = v_registry_id) then
    raise exception 'NO_ADDRESS' using errcode = 'P0001';
  end if;
  if (select count(*) from public.address_requests q where q.registry_id = v_registry_id and q.status = 'pending') >= 50 then
    raise exception 'TOO_MANY_REQUESTS' using errcode = 'P0001';
  end if;
  insert into public.address_requests (registry_id, requester_name, contact, message, token_hash)
  values (v_registry_id, p_name, p_contact, coalesce(p_message, ''), p_token_hash)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.address_request_decide(
  p_registry_id uuid,
  p_owner_id uuid,
  p_request_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('approved', 'declined') then
    raise exception 'BAD_STATUS' using errcode = 'P0001';
  end if;
  perform private.lock_owned_registry(p_registry_id, p_owner_id);
  update public.address_requests set status = p_status, decided_at = now()
  where id = p_request_id and registry_id = p_registry_id;
  if not found then
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function
  public.registry_create(uuid, text, text, text, text, jsonb, text[], date, jsonb),
  public.registry_update_details(uuid, uuid, text, text, text, text),
  public.registry_set_address(uuid, uuid, jsonb),
  public.address_request_create(text, text, text, text, text),
  public.address_request_decide(uuid, uuid, uuid, text)
from public, anon, authenticated;

grant execute on function
  public.registry_create(uuid, text, text, text, text, jsonb, text[], date, jsonb),
  public.registry_update_details(uuid, uuid, text, text, text, text),
  public.registry_set_address(uuid, uuid, jsonb),
  public.address_request_create(text, text, text, text, text),
  public.address_request_decide(uuid, uuid, uuid, text)
to service_role;
