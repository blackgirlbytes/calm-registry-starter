-- Parents can change how many of an item they're registering for.

create or replace function public.registry_set_item_qty(
  p_registry_id uuid,
  p_owner_id uuid,
  p_item_id uuid,
  p_qty integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_owned_registry(p_registry_id, p_owner_id);
  update public.registry_items set qty = p_qty
  where id = p_item_id and registry_id = p_registry_id;
  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.bump_revision(p_registry_id);
end;
$$;

revoke all on function public.registry_set_item_qty(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.registry_set_item_qty(uuid, uuid, uuid, integer) to service_role;
