-- A nickname may be reused after an animal dies or is transferred, but only one
-- active animal may hold it at a time, ignoring case. Existing names are already
-- unique, so the index builds unless two active names differ only by case.

alter table core.animals drop constraint animals_name_key;

create unique index animals_active_name_key
  on core.animals (lower(name))
  where status = 'active';

comment on column core.animals.name is
  'Nickname; unique (case-insensitive) among active animals and reusable after death or transfer.';
