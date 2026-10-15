-- Animal setup (Lab setup): tanks are created from a shelf position and size, so
-- the position check gains Left and Right, and animals record the date they were
-- retired (deceased or transferred).

alter table core.tanks
	drop constraint tanks_shelf_position_check,
	add constraint tanks_shelf_position_check
		check (shelf_position in ('lower', 'upper', 'left', 'right'));

comment on column core.tanks.shelf_position is
	'Standard position prefix of the tank name (lower, upper, left, right); NULL for a size-only name or a custom label such as Middle.';

alter table core.animals add column retired_on date;

update core.animals
set retired_on = greatest(date_added, (updated_at at time zone 'America/Los_Angeles')::date)
where status <> 'active';

alter table core.animals
	add constraint animals_retired_on_status_check
		check ((status = 'active') = (retired_on is null)),
	add constraint animals_retired_on_after_added_check
		check (retired_on >= date_added);

comment on column core.animals.retired_on is
	'Date the animal died or left the lab; NULL while active.';
