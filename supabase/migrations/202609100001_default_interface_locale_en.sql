-- English becomes the default interface language for accounts created from
-- here on.
--
-- Only the column default moves. Existing rows are deliberately left alone:
-- every account that exists today was created under a zh-CN default and has
-- been using the product in Chinese, and silently switching their interface
-- because the product's default changed would be the application making a
-- decision that belongs to the reader. They keep what they have until they
-- change it themselves.
--
-- The check constraint already limits this column to ('zh-CN', 'en'), so the
-- set of valid values is unchanged.

alter table public.profiles
  alter column interface_locale set default 'en';
