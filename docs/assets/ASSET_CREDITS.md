# Asset and data credits: City in Motion

This inventory covers the 3D / map feature (`/city-in-motion`). Keep it in version control and update it whenever a model, texture or data source is added.

## 3D models

| File | Source URL | Creator | Licence | Download date | Modified? |
|---|---|---|---|---|---|
| Garbage truck (procedural, no file) | Not downloaded. Generated in code: `frontend/src/features/city-in-motion/components/truckModel.js` | CivicLens team | Original work of the project team; no third-party asset, texture or geometry is used | n/a (not downloaded) | n/a |
| `frontend/public/models/vehicles/garbage-truck.glb` | **Not bundled.** Optional drop-in hook only (see `frontend/public/models/README.md`) | n/a | n/a. If you add one, record its exact licence in this table first | n/a | n/a |

Statement of fact: **no third-party 3D asset is bundled with this project.** The truck seen on the map is a low-poly model (cab, compaction body, rear hopper, wheels, lights, saffron livery stripe) built from Three.js primitives at runtime. The bin, route and complaint markers are 2D icons drawn on a canvas in `components/mapIcons.js`. No Kenney, Poly Haven, Quaternius or Sketchfab content is used.

If the file `/models/vehicles/garbage-truck.glb` exists at runtime it is loaded instead of the procedural truck. Any such file must be added to the table above (source URL, creator, licence, download date, whether modified) before it is committed.

## Map data and basemap

| Component | Provider | Licence / terms | Link |
|---|---|---|---|
| Basemap style and vector tiles (`https://tiles.openfreemap.org/styles/liberty`) | OpenFreeMap | Free public service, no API key; follow the provider's terms and keep the attribution visible | https://openfreemap.org |
| Vector tile schema and building layer (`openmaptiles` source, `building` source-layer) | OpenMapTiles | Schema and styles under CC-BY 4.0; attribution required | https://openmaptiles.org |
| Underlying map data (roads, buildings, water, parks) | OpenStreetMap contributors | Open Database Licence (ODbL) 1.0 | https://www.openstreetmap.org/copyright |

Required on-screen attribution (rendered by the map's attribution control): **OpenFreeMap © OpenMapTiles Data from OpenStreetMap**.

The style URL can be changed with `VITE_CITY_MAP_STYLE_URL`. If you switch provider, update this table and the attribution.

### 2D fallback map

The react-leaflet fallback (shown only when WebGL / MapLibre cannot start) reuses the project's `lib/leaflet.js` raster tiles, which default to the public OpenStreetMap tile server (`VITE_MAP_TILE_URL`). That server is subject to the OpenStreetMap tile usage policy (https://operations.osmfoundation.org/policies/tiles/); use a suitable provider for production traffic. Attribution to OpenStreetMap contributors is shown by the fallback map.

## Software libraries (no assets bundled with them)

| Library | Licence | Link |
|---|---|---|
| MapLibre GL JS 4.7.1 | BSD-3-Clause | https://maplibre.org |
| three.js 0.169.0 | MIT | https://threejs.org |

## Data honesty

Vehicle positions and bin fill levels shown by City in Motion in this prototype are **simulated** and labelled "Simulated GPS" / "Simulated sensor" in the interface, with a persistent "DEMO MODE" banner. Complaint markers come from the CivicLens database; public viewers see coordinates rounded to 3 decimal places.

## Hero photograph

| File | Subject | Source / licence |
|---|---|---|
| `frontend/public/images/vidhana-soudha.jpg` | Vidhana Soudha, Bengaluru (hero background) | Supplied by the project owner. Photographer/licence were not stated - **confirm you have the right to publish this image** and record the credit here. The image has the caption "VIDHANA SOUDHA" baked into it. |
