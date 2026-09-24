# Graham CSV import

These files are ready for direct upload in the Supabase Table Editor:

| File | Current rows | Destination |
|---|---:|---|
| `graham_water_quality.csv` | 270 | `core.water_quality_readings` |
| `graham_chemical_additions.csv` | 242 | `core.chemical_additions` |

Both files use Graham `system_id = 3`, Admin `recorded_by = 2`, `data_source = import`,
and UTC timestamps converted from the original `America/Los_Angeles` wall times. They are
specific to the current rebuilt hosted database; verify those two IDs after another rebuild.

## Upload

1. Open **Table Editor** and select the `core` schema.
2. Open `water_quality_readings`, choose **Insert > Import data from CSV**, and upload
   `graham_water_quality.csv`.
3. Open `chemical_additions`, choose **Insert > Import data from CSV**, and upload
   `graham_chemical_additions.csv`.
4. Confirm the imported counts are 270 and 242.

The chemical file contains no Probiotics rows.