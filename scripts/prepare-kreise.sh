#!/usr/bin/env bash
# Regenerates packages/geo/data/stadtkreise.json from Open Data Zürich
# (CC0). Only needed if the city changes its Kreis boundaries.
#
# mapshaper simplifies with shared-boundary topology, so neighbouring Kreise
# never get slivers or gaps. The committed file was made by an equivalent
# per-polygon simplification (~4 m tolerance); rerun this to swap it for the
# topology-aware version. Then run `pnpm test` — the geo and seed tests check all 12
# Kreise exist and every station still sits in its Kreis.
set -euo pipefail
cd "$(dirname "$0")/.."

URL='https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Stadtkreise?service=WFS&version=1.1.0&request=GetFeature&outputFormat=GeoJSON&typename=adm_stadtkreise_a&srsName=EPSG:4326'
TMP="$(mktemp -d)"
curl -fsSL "$URL" -o "$TMP/raw.geojson"

npx --yes mapshaper@0.6 "$TMP/raw.geojson" \
  -proj wgs84 \
  -simplify 12% keep-shapes \
  -each 'kreis=Number(name), name="Kreis "+kreis' \
  -filter-fields kreis,name \
  -sort kreis \
  -o precision=0.00001 format=geojson packages/geo/data/stadtkreise.json

ls -l packages/geo/data/stadtkreise.json
