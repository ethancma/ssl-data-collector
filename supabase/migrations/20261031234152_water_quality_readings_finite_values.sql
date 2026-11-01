alter table core.water_quality_readings
  add constraint water_quality_readings_measurements_finite_check check (
    (ph is null or ph not in ('-Infinity'::numeric, 'Infinity'::numeric, 'NaN'::numeric))
    and (magnesium is null or magnesium not in ('-Infinity'::numeric, 'Infinity'::numeric, 'NaN'::numeric))
    and (ammonia is null or ammonia not in ('-Infinity'::numeric, 'Infinity'::numeric, 'NaN'::numeric))
    and (alkalinity is null or alkalinity not in ('-Infinity'::numeric, 'Infinity'::numeric, 'NaN'::numeric))
    and (calcium is null or calcium not in ('-Infinity'::numeric, 'Infinity'::numeric, 'NaN'::numeric))
    and (phosphate is null or phosphate not in ('-Infinity'::numeric, 'Infinity'::numeric, 'NaN'::numeric))
    and (salinity is null or salinity not in ('-Infinity'::numeric, 'Infinity'::numeric, 'NaN'::numeric))
    and (nitrate is null or nitrate not in ('-Infinity'::numeric, 'Infinity'::numeric, 'NaN'::numeric))
    and (nitrite is null or nitrite not in ('-Infinity'::numeric, 'Infinity'::numeric, 'NaN'::numeric))
  );