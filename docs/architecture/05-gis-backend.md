# 05 — GIS backend

**Status:** every spatial surface in the platform is illustrative by explicit design, not by oversight — but it is the dependency both the Digital Twin ambition and the ward fair-comparison work actually sit on top of.

## What exists today

- `src/data/geography.ts` — `WARD_GEOMETRY`, `ZONE_SPECS`: normalised 0–100 map-space polygons, generated, not surveyed.
- `src/config/municipality.config.ts` — `mapConfiguration.provenanceStatement` is rendered on every spatial surface and says so outright: *"Illustrative spatial representation... boundaries are generated for demonstration and are not official GIS boundaries."* This is a deliberate, correct disclosure, not a gap to hide — the gap is that there is nothing behind it to disclose *away from*.
- `src/components/map/CityMap.tsx` — the single map component every domain page (Ward Intelligence, Water, Monsoon, Roads, the Digital Twin, …) renders through, already parameterised by layer.
- `src/pages/strategic/DigitalTwinPage.tsx` — a real, working composite of 9 services over this same illustrative geometry, self-labelled "not a photorealistic/surveyed 3D model."

## Decision: which real GIS source

For a Maharashtra ULB, the realistic options, in order of fit:

1. **The corporation's own GIS cell**, where one exists (BMC's Development Plan department maintains parcel-level GIS for DCPR enforcement — this is very plausibly the actual authoritative source for ward and parcel boundaries, not a new acquisition).
2. **Bhuvan / Survey of India** open geospatial data, for anything the corporation's own GIS cell doesn't hold at the needed resolution (broader terrain, satellite basemaps).
3. **A commercial provider (Google Maps Platform, Mapbox)** only as a basemap/tile layer underneath the corporation's own authoritative vector boundaries — never as the source of the boundaries themselves, which must stay sovereign.

Serve real boundaries through a standard **WFS (vector features) / WMS (raster tiles) / vector-tile** endpoint rather than baking survey data into the frontend bundle — this is what lets the same `CityMap` component swap its data source without a rewrite.

## Migration steps

1. Confirm whether the corporation's own GIS cell already holds ward/zone boundary shapefiles — if so, this is a data-acquisition and licensing conversation, not a technical build.
2. Stand up a tile/feature server in front of that data (GeoServer is the standard open-source choice for WFS/WMS from shapefile or PostGIS sources).
3. Replace `WARD_GEOMETRY`/`ZONE_SPECS` generation in `geography.ts` with a fetch against the new server, keeping the exact `Array<[number, number]>` polygon shape `Ward.polygon` already expects — `CityMap` and every page consuming it are unaffected.
4. Remove the "illustrative" provenance statement once real boundaries are in place — replace it with real survey metadata (survey date, source authority) instead of deleting the disclosure pattern itself.
5. Only after ward/zone-level boundaries are real, consider parcel-level geometry — which is also the dependency the canonical Building/Property identifier work (item 02) would need to actually place a building on a map rather than only within a ward.

## What stays exactly as it is

- `CityMap.tsx`'s layer architecture and every page's map integration — the swap is in what geometry it's fed, not how it renders.
- The provenance-disclosure pattern itself (a spatial surface should always state what its geometry actually is) — only the specific claim changes, from "illustrative" to real survey metadata.
