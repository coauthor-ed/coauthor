# vendor/geo - map data layers (SimGeo.loadLayer)

Built by tools/geo-data/fetch.sh + build.py (downloaded 2026-09-29). Lon/lat (WGS84).
Load with `SimGeo.loadLayer(name)`; never copy coordinates into a scene.

| Layer | File | Source | Licence | Processing |
|---|---|---|---|---|
| india | india-soi.json | Survey of India, "International Boundary of India, vector format" (OUTLINE_OF_INDIA.zip, ABDB 2.0, 2025-12-11), surveyofindia.gov.in/pages/downloads | SoI copyright. Free for "Individual, Internal, Educational, Research, website purposes". No commercial use. | LCC -> lon/lat, Douglas-Peucker 0.008 deg (~0.9 km), every island kept, 3 decimals |
| plates | plates.json | P. Bird (2003) PB2002, G-cubed 4(3) 1027, doi:10.1029/2001GC000252; digital files via github.com/fraxen/tectonicplates (H. Ahlenius, Nordpil) | ODC-By 1.0: credit "Plate boundaries: Bird (2003), PB2002; Ahlenius/Nordpil" | Steps grouped by class: diverge (OSR, CRB), converge (OCB, CCB), subduct (SUB), transform (OTF, CTF). Plate label points; vEU = plate velocity at the label relative to Eurasia (mm/yr east, north) from the PB2002 Euler poles |
| quakes | quakes.json | USGS ANSS ComCat, M >= 6.0, 2000-2024 | US public domain | lon, lat, depth km, magnitude, year |
| volcanoes | volcanoes.json | NOAA NCEI / WDS volcano locations database | US public domain | lon, lat, elevation m, recent (last eruption 1900 or later), name |
| elevation | elevation-1deg.json | NOAA ETOPO1 ice surface (Amante and Eakins 2009) | US public domain | 1-degree cells (360x180, centres from 179.5W / 89.5N), 1 byte per cell, see `decode` |
| rivers | rivers.json | Natural Earth 1:50m rivers + lake centrelines | Public domain | scalerank <= 6, simplified 0.05 deg |

## India boundary rule (legal)

Criminal Law (Amendment) Act 1990, s.2: publishing a map of India not in conformity with Survey of
India maps is an offence. So:
- Any line that shows India's border comes from `india` (this SoI file) and nothing else.
- Never draw `countries` (world-atlas 110m, de facto borders) where India or its neighbours show.
  World views use `land` (no borders) and overlay `india` when India matters.
- Credit on the slide or scene: "Boundary of India: Survey of India".
- Do not edit, reshape or re-simplify india-soi.json by hand. Commercial use needs SoI permission.
