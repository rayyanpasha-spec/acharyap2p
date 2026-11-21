# Boundary data (not included)

CivicLens does **not** ship boundary polygons and never invents them. Until you import official data, the API uses a
coarse radius check around the map centre (`FALLBACK_SERVICE_AREA_RADIUS_KM`) and reports
`boundary_source: "fallback_approximate"`, with corporation / ward left empty.

## Where to get official data

Use the latest official Greater Bengaluru Authority (GBA) / City Corporation delimitation data (see
`docs/SPECIFICATION.md`, section 1 "Local governance model"):

- Greater Bengaluru Authority - City Corporation delimitation maps: https://www.bbmp.gov.in/maps/
- Government of Karnataka - Bengaluru West City Corporation / About GBA: https://bengaluruwest.karnataka.gov.in/about-gba
- Greater Bengaluru Governance Act: https://indiacode.gov.in/server/api/core/bitstreams/fddb33e7-b5e3-40b5-9ff1-d274de327607/content

Legacy BBMP ward files may be useful historically but must not be assumed to match the current corporations. Check the
licence of whatever you download and convert it to GeoJSON in WGS84 (EPSG:4326, coordinates `[longitude, latitude]`).

## Expected files

Place `*.geojson` FeatureCollections in this folder (or the folder in `BOUNDARY_DATA_DIR`). The level of a feature is
read from its `level` property, else from the `--level` argument, else from the file name when it is one of
`service_area.geojson`, `corporation.geojson`, `zone.geojson`, `ward.geojson`.

| Property | Meaning |
|---|---|
| `level` | `service_area`, `corporation`, `zone` or `ward` |
| `code` (or `<level>_code`, `id`) | stable code, e.g. a corporation or ward code from the source data. If missing, a slug of `name` is used |
| `name` | display name |
| `parent_code` | optional parent (ward -> corporation) |
| `dataset_version` | optional; otherwise `--dataset-version` or file name + file date |
| `source` | optional; otherwise `--source` or the file name |

Geometries must be `Polygon` or `MultiPolygon` (holes supported). Features without a usable level, code or geometry
are skipped and counted.

## Import

```
cd backend
python scripts/import_boundaries.py --dataset-version gba-2025-09 --source "https://www.bbmp.gov.in/maps/"
```

Previously imported rows are kept but marked inactive, so tickets keep the `boundary_dataset_version` they were
resolved against. When a `service_area` file is present it defines "inside the pilot area"; otherwise the union of the
`corporation` polygons is used.
