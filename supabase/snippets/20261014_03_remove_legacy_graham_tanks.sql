-- Run manually in the linked project's Supabase SQL Editor.
-- Moves the SSL25 test animal into Graham's Lower-9L tank (created if missing), then deletes
-- the retired seed tanks (Small, Middle, Large, Cone-bottom). Tanks are now created by
-- Settings > Animal setup and named from position and size.
-- animals.tank_id cascades on delete, so only tanks with no animals and no logs, treatments or
-- batch requests are deleted; a tank still in use is left in place.

begin;

insert into core.tanks (system_id, name, tank_type, shelf_position, size_liters)
select id, 'Lower-9L', 'shelf', 'lower', 9
from core.systems
where slug = 'graham'
on conflict (system_id, name) do nothing;

update core.animals a
set tank_id = t.id
from core.tanks t
join core.systems s on s.id = t.system_id
where s.slug = 'graham'
	and t.name = 'Lower-9L'
	and a.name = 'SSL25';

delete from core.tanks t
using core.systems s
where s.id = t.system_id
	and s.slug = 'graham'
	and t.name in ('Small', 'Middle', 'Large', 'Cone-bottom')
	and not exists (select 1 from core.animals a where a.tank_id = t.id)
	and not exists (select 1 from core.feeding_logs f where f.tank_id = t.id)
	and not exists (select 1 from core.health_observations h where h.tank_id = t.id)
	and not exists (select 1 from core.star_treatments st where st.tank_id = t.id)
	and not exists (select 1 from core.operational_batch_requests b where b.scope_tank_id = t.id);

select t.id, t.name, t.shelf_position, t.size_liters,
	(select count(*) from core.animals a where a.tank_id = t.id) as animals
from core.tanks t
join core.systems s on s.id = t.system_id
where s.slug = 'graham'
order by t.name;

commit;
