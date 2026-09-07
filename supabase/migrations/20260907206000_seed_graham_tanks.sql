-- Seed Graham's tank types. Each row is a catalog tank-type (not a physical tank
-- instance); animals reference whichever tank-type row they live in via
-- animal.tank_id, and multiple animals can share a tank-type row.

insert into core.tanks (system_id, name, tank_type, size_liters, shelf_position)
select id, t.name, t.tank_type, t.size_liters, t.shelf_position
from core.systems, (
  values
    -- shelf position unconfirmed for these
    ('Small', 'shelf', 3, null),
    ('Middle', 'shelf', 9, 'lower'),
    ('Large', 'shelf', 14, null),
    -- size not yet confirmed
    ('Cone-bottom', 'cone_bottom', null, null)
) as t (name, tank_type, size_liters, shelf_position)
where systems.slug = 'graham';
