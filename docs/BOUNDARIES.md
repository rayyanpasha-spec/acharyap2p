# Importing official boundaries

CivicLens does **not** bundle boundary polygons and never invents them. Until you import official data:

* the service-area check uses a coarse radius around the map centre (`FALLBACK_SERVICE_AREA_RADIUS_KM`, default 35 km);
* the result is flagged `boundary_source: "fallback_approximate"` and shows a notice that official boundary data is not imported;
* inside points get `service_area_status = needs_manual_routing`; outside points are flagged `outside_service_area`;
* `city_corporation_code`, `division_code`, `ward_code` and `boundary_dataset_version` stay empty. Nothing is inferred from
  locality names.

Once boundaries are imported, new complaints are resolved by point-in-polygon (pure Python ray casting with a bounding-box
prefilter) and store the dataset version they were resolved against. See `docs/API_CONTRACT.md` section 4
(`GET /locations/service-area-check`, `GET /locations/boundaries`).

> The seeded demo complaints are created with `needs_manual_routing` and no corporation/ward. Importing boundaries later does
> not rewrite them.

## 1. Get official data

Use the latest official Greater Bengaluru Authority (GBA) / City Corporation delimitation data. Starting points (also in
`backend/data/boundaries/README.md` and `docs/SPECIFICATION.md` section 1):

* GBA City Corporation delimitation maps: <https://www.bbmp.gov.in/maps/>
* Bengaluru West City Corporation / About GBA: <https://bengaluruwest.karnataka.gov.in/about-gba>

Check the licence/terms of whatever you download. Old BBMP ward files may not match the current corporations; do not assume
they do. Convert the data to **GeoJSON in WGS84 (EPSG:4326)** with coordinates in `[longitude, latitude]` order.

## 2. Prepare the files

Put one or more `*.geojson` FeatureCollections in `backend/data/boundaries/` (or in the folder named by
`BOUNDARY_DATA_DIR`). Geometries must be `Polygon` or `MultiPolygon`.

Each feature needs a level, a code and a polygon:

| Property | Meaning |
|---|---|
| `level` | `service_area`, `corporation`, `zone` or `ward`. If absent, `--level` is used, else the file name when it is one of `service_area.geojson`, `corporation.geojson`, `zone.geojson`, `ward.geojson` |
| `code` (or `<level>_code`, `id`) | Stable code from the source data. If missing, a slug of `name` is used |
| `name` | Display name |
| `parent_code` | Optional parent, e.g. ward to corporation |
| `dataset_version`, `source` | Optional; otherwise taken from `--dataset-version` / `--source` |

When a `service_area` file is present it defines "inside the pilot area"; otherwise the union of the `corporation`
polygons is used. Features without a usable level, code or geometry are skipped and counted.

## 3. Import

Run from `backend/` (with the virtual environment active and `DATABASE_URL` pointing at the target database):

```bash
cd backend
python scripts/import_boundaries.py --dir ./data/boundaries --dataset-version <label> --source "<url>"
```

Examples of the options (**always check `python scripts/import_boundaries.py --help` first**; this document was written
against its help output at the time of writing and the script is maintained separately):

```bash
# every *.geojson in BOUNDARY_DATA_DIR
python scripts/import_boundaries.py --dataset-version gba-2025-09 --source "https://www.bbmp.gov.in/maps/"

# a folder whose files carry no `level` property: the level comes from --level (or from the file name)
python scripts/import_boundaries.py --dir ./data/boundaries --level corporation --dataset-version <label> --source <url>

# keep previously imported rows active instead of deactivating them
python scripts/import_boundaries.py --keep-existing --dataset-version <label>
```

Notes:

* The help output lists these options: `--dir`, `--level {service_area,corporation,zone,ward}`, `--code`,
  `--dataset-version`, `--source`, `--keep-existing`. There is no single-file `--file` or `--version` option; place the file
  in the folder you pass with `--dir`. If your copy of the script differs, trust `--help`.
* By default previously imported rows are kept but marked inactive, so existing tickets keep the dataset version they were
  resolved against.
* The script creates tables if they do not exist (`init_db()`), then loads the files and prints a summary (directory, number of files read and further counts).

### Importing into the hosted (Render) database

The free Render web service has no shell. Run the script from your own machine against the database's **External** connection
string:

```bash
cd backend
DATABASE_URL="<external connection string>" python scripts/import_boundaries.py --dir ./data/boundaries --dataset-version <label> --source "<url>"
```

In PowerShell set `$env:DATABASE_URL = "<external connection string>"` first. Render databases can restrict external access by IP.

## 4. Verify

```bash
curl "https://<api>/api/v1/locations/boundaries"
curl "https://<api>/api/v1/locations/service-area-check?lat=12.9716&lng=77.5946"
```

* `boundaries` should report `imported: true`, the `dataset_version` and the list of corporations.
* `service-area-check` should return `boundary_source: "official_import"` with the corporation/ward codes from your data.

Spot-check a few known points against the official map yourself: this project has not validated any boundary dataset.

## 5. Updating

Import the new files with a new `--dataset-version`. Older rows are deactivated (unless `--keep-existing`), and new tickets record the
new version. Re-routing of tickets created earlier is not automatic.
