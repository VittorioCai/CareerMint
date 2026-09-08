-- Let a user delete one uploaded resume.
--
-- Deleting the file must not delete the work built on top of it. Every table
-- that points at a source asset uses ON DELETE SET NULL, so confirmed career
-- facts, past difference analyses and the applications that used it all
-- survive and simply lose the pointer back to the file.
--
-- One reference does not: `source_assets_duplicate_owner_fkey` is RESTRICT, so
-- a canonical asset with duplicate rows pointing at it cannot be deleted
-- directly. Mapping that error to a message would be useless — `list_assets`
-- hides duplicates, so the user cannot see or clear the thing blocking them,
-- and the duplicates each hold their own byte-identical storage object that
-- the user just asked to be rid of. So this clears them first, the same way
-- `delete_owned_application` clears `resume_versions`.
--
-- Callers must collect the duplicates' storage paths BEFORE calling this, or
-- those objects are orphaned in the bucket with no row left to find them by.
--
-- The row is locked before the delete so this matches the lock order
-- `set_application_resume_source` was written to (source first, then the
-- referencing application), which is what keeps the two from deadlocking.

create function public.delete_owned_source_asset(target_asset_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_asset_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  select id
  into owned_asset_id
  from public.source_assets
  where id = target_asset_id
    and user_id = current_user_id
  for update;

  if owned_asset_id is null then
    raise exception 'source-asset-not-found' using errcode = 'P0002';
  end if;

  delete from public.source_assets
  where user_id = current_user_id
    and duplicate_of_id = owned_asset_id;

  delete from public.source_assets
  where id = owned_asset_id
    and user_id = current_user_id;

  return true;
end;
$$;

revoke all on function public.delete_owned_source_asset(uuid) from public;
grant execute on function public.delete_owned_source_asset(uuid) to authenticated;
