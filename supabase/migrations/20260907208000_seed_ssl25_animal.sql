-- Seed the first individually-tracked animal: SSL25, a sunflower star housed in
-- Graham's Middle tank.

insert into core.animals (tank_id, species_id, name, tracking_type, quantity, status)
select tanks.id, species.id, 'SSL25', 'individual', 1, 'active'
from core.tanks
join core.systems on systems.id = tanks.system_id
cross join core.species
where systems.slug = 'graham'
  and tanks.name = 'Middle'
  and species.common_name = 'Sunflower star';
