import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const OUT_BOUNDARY = path.join(ROOT, 'src', 'data', 'pila.geojson')
const OUT_BARANGAYS = path.join(ROOT, 'src', 'data', 'pila-barangays.geojson')

const PILA_BARANGAYS = [
  'Aplaya',
  'Bagong Pook',
  'Bukal',
  'Bulilan Norte (Pob.)',
  'Bulilan Sur (Pob.)',
  'Concepcion',
  'Labuin',
  'Linga',
  'Masico',
  'Mojon',
  'Pansol',
  'Pinagbayanan',
  'San Antonio',
  'San Miguel',
  'Sta. Clara Norte (Pob.)',
  'Sta. Clara Sur (Pob.)',
  'Tubuan',
]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'HealthTrackRHU/1.0 (local-development)',
      Referer: 'http://localhost',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return res.json()
}

async function fetchBoundary(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&polygon_geojson=1&countrycodes=ph&q=${encodeURIComponent(
    query,
  )}`
  const data = await fetchJson(url)
  const first = Array.isArray(data) ? data[0] : null
  const geo = first?.geojson
  if (!geo || !['Polygon', 'MultiPolygon'].includes(String(geo.type))) return null
  return {
    type: 'FeatureCollection',
    generator: 'nominatim.openstreetmap.org',
    features: [
      {
        type: 'Feature',
        properties: {
          name: first?.display_name ?? query,
          osm_type: first?.osm_type ?? null,
          osm_id: first?.osm_id ?? null,
          boundingbox: first?.boundingbox ?? null,
        },
        geometry: geo,
      },
    ],
  }
}

async function fetchBarangayPolygon(barangay) {
  const viewbox = '121.3243388,14.2938285,121.3880950,14.1946802'
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&polygon_geojson=1&countrycodes=ph&bounded=1&viewbox=${encodeURIComponent(
    viewbox,
  )}&q=${encodeURIComponent(`${barangay}, Pila, Laguna, Philippines`)}`
  const data = await fetchJson(url)
  const first = Array.isArray(data) ? data[0] : null
  const geo = first?.geojson
  if (!geo || !['Polygon', 'MultiPolygon'].includes(String(geo.type))) return null
  return {
    type: 'Feature',
    properties: { name: barangay },
    geometry: geo,
  }
}

async function main() {
  fs.mkdirSync(path.dirname(OUT_BOUNDARY), { recursive: true })

  const boundary = await fetchBoundary('Pila, Laguna, Philippines')
  if (!boundary) throw new Error('Failed to fetch Pila boundary')
  fs.writeFileSync(OUT_BOUNDARY, JSON.stringify(boundary, null, 2), 'utf8')
  console.log(`Saved: ${OUT_BOUNDARY}`)

  const barangayFeatures = []
  for (const barangay of PILA_BARANGAYS) {
    try {
      const feature = await fetchBarangayPolygon(barangay)
      if (feature) barangayFeatures.push(feature)
      console.log(`Barangay: ${barangay} ${feature ? 'OK' : 'NO_POLYGON'}`)
    } catch (e) {
      console.log(`Barangay: ${barangay} ERROR ${(e?.message ?? '').toString()}`)
    }
    await sleep(250)
  }

  const barangays = {
    type: 'FeatureCollection',
    generator: 'nominatim.openstreetmap.org',
    features: barangayFeatures,
  }
  fs.writeFileSync(OUT_BARANGAYS, JSON.stringify(barangays, null, 2), 'utf8')
  console.log(`Saved: ${OUT_BARANGAYS}`)
  console.log(`Barangay polygons: ${barangayFeatures.length}/${PILA_BARANGAYS.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
