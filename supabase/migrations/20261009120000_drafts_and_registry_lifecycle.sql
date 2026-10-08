-- Unfinished intake answers saved to the account, plus starting a registry over and deleting it.

-- registry_id null means the answers are for a new registry; otherwise they will rebuild that registry.
create table public.intake_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  registry_id uuid references public.registries (id) on delete cascade,
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  chips jsonb not null default '[]'::jsonb check (jsonb_typeof(chips) = 'array'),
  -- Set once the chat is finished and the parent is checking their answers.
  profile jsonb check (profile is null or jsonb_typeof(profile) = 'object'),
  -- Answers carried over from another registry, for the assistant to confirm instead of re-asking.
  seed jsonb check (seed is null or jsonb_typeof(seed) = 'object'),
  updated_at timestamptz not null default now()
);

-- One draft per target, so "Start my registry" always resumes rather than piling up drafts.
create unique index intake_drafts_target_idx on public.intake_drafts (owner_id, registry_id) nulls not distinct;

alter table public.intake_drafts enable row level security;
revoke all on table public.intake_drafts from public, anon, authenticated;

-- Replaces every item nobody has bought. Title, names, note, address, and purchases stay.
create or replace function public.registry_rebuild(
  p_registry_id uuid,
  p_owner_id uuid,
  p_profile jsonb,
  p_preferred_retailers text[],
  p_due_date date,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next integer;
begin
  perform private.lock_owned_registry(p_registry_id, p_owner_id);

  delete from public.registry_items
  where registry_id = p_registry_id
    and not exists (select 1 from public.purchases p where p.item_id = registry_items.id);

  update public.registries
  set profile = p_profile, preferred_retailers = coalesce(p_preferred_retailers, '{}'), due_date = p_due_date
  where id = p_registry_id;

  select coalesce(max(position), -1) + 1 into v_next
  from public.registry_items where registry_id = p_registry_id;
  perform private.insert_items(p_registry_id, p_items, v_next);

  perform private.bump_revision(p_registry_id);
end;
$$;

create or replace function public.registry_update_profile(
  p_registry_id uuid,
  p_owner_id uuid,
  p_profile jsonb,
  p_preferred_retailers text[],
  p_due_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_owned_registry(p_registry_id, p_owner_id);
  update public.registries
  set profile = p_profile, preferred_retailers = coalesce(p_preferred_retailers, '{}'), due_date = p_due_date
  where id = p_registry_id;
  perform private.bump_revision(p_registry_id);
end;
$$;

-- Cascades to items, offers, purchases, the address, address requests, and drafts.
create or replace function public.registry_delete(p_registry_id uuid, p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_owned_registry(p_registry_id, p_owner_id);
  delete from public.registries where id = p_registry_id;
end;
$$;

revoke all on function
  public.registry_rebuild(uuid, uuid, jsonb, text[], date, jsonb),
  public.registry_update_profile(uuid, uuid, jsonb, text[], date),
  public.registry_delete(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.registry_rebuild(uuid, uuid, jsonb, text[], date, jsonb),
  public.registry_update_profile(uuid, uuid, jsonb, text[], date),
  public.registry_delete(uuid, uuid)
to service_role;
