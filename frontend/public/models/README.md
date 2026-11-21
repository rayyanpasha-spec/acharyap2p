# 3D models for City in Motion

**No model is bundled.** The garbage truck on the `/city-in-motion` map is a procedural low-poly model generated in code
(`src/features/city-in-motion/components/truckModel.js`). This folder only exists so a hand-made or licensed model can be dropped in.

## Using your own truck

1. Export a single glTF Binary file and save it as `public/models/vehicles/garbage-truck.glb`.
2. Reload the page. The vehicle layer requests `/models/vehicles/garbage-truck.glb`; if the response starts with the `glTF` magic bytes it is
   parsed with `GLTFLoader` and replaces the procedural truck for all vehicles (stale vehicles get a grey material variant). Any other response
   (missing file, an HTML fallback page, a corrupt file) is ignored and the procedural truck stays.
3. Record the model in `docs/assets/ASSET_CREDITS.md` (source URL, creator, exact licence, download date, whether you modified it) **before committing it**.
   Do not assume "free" means CC0 or allows redistribution; check the asset page.

## Expected orientation and scale

Use the standard glTF convention (what Blender's glTF exporter produces with "+Y Up"):

| Property | Expectation |
|---|---|
| Up axis | +Y (glTF standard) |
| Front of the vehicle | towards +Z (glTF standard "front of the asset") |
| Origin | anywhere; the loader re-centres the model on its footprint and sits it on the ground |
| Scale | any; the loader scales the longest horizontal side to 7.6 m so it matches the procedural truck |
| Materials | one or two reused materials; PBR materials are fine (lights are provided by the layer) |
| Size | aim for well under a few MB; one model is cloned for every vehicle |

The loader performs one documented conversion into the project convention (`MODEL_FORWARD = +Y`, +Z up, metres) in `loadGlbTruck()`; the map
rotation then applies the server's `heading_degrees` (compass bearing, clockwise from north). If your truck drives sideways or backwards,
fix the orientation in Blender (apply transforms, forward = +Z in glTF) rather than adding rotation offsets in code.

## Suggested layout

```
public/models/
  vehicles/garbage-truck.glb     (optional, loaded automatically)
  bins/public-bin.glb            (not used yet; bins are 2D icons)
  props/                         (not used yet)
```
