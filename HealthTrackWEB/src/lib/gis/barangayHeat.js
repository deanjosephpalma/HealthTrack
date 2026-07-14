/** Official Pila, Laguna barangays with reference centers (lat, lng). */
export const PILA_BARANGAYS = [
  { name: 'Aplaya', lat: 14.2579, lng: 121.3531 },
  { name: 'Bagong Pook', lat: 14.2389, lng: 121.3713 },
  { name: 'Bukal', lat: 14.2123, lng: 121.3673 },
  { name: 'Bulilan Norte', lat: 14.2381, lng: 121.3654 },
  { name: 'Bulilan Sur', lat: 14.2317, lng: 121.3654 },
  { name: 'Concepcion', lat: 14.2281, lng: 121.3778 },
  { name: 'Labuin', lat: 14.2463, lng: 121.3714 },
  { name: 'Linga', lat: 14.2556, lng: 121.3587 },
  { name: 'Masico', lat: 14.2066, lng: 121.3804 },
  { name: 'Mojon', lat: 14.2206, lng: 121.3817 },
  { name: 'Pansol', lat: 14.2179, lng: 121.3727 },
  { name: 'Pinagbayanan', lat: 14.2504, lng: 121.3605 },
  { name: 'San Antonio', lat: 14.2198, lng: 121.3597 },
  { name: 'San Miguel', lat: 14.2038, lng: 121.3729 },
  { name: 'Santa Clara Norte', lat: 14.2357, lng: 121.3614 },
  { name: 'Santa Clara Sur', lat: 14.2279, lng: 121.3649 },
  { name: 'Tubuan', lat: 14.2296, lng: 121.3486 },
]

/** Normalize Pila barangay name variants for matching. */
export function normalizeBarangayName(name) {
  return (name ?? '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s*\(pob\.\s*\)/gi, '')
    .replace(/\s*\(poblacion\)/gi, '')
    .replace(/\s*\(población\)/gi, '')
    .replace(/\s*\(\s*\)/gi, '')
    .replace(/^sta\.?\s+/i, 'santa ')
    .replace(/^sto\.?\s+/i, 'santo ')
    .replace(/\s+/g, ' ')
    .trim()
}

function pointInRing(lng, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function getOuterRing(geometry) {
  if (!geometry) return null
  if (geometry.type === 'Polygon') return geometry.coordinates?.[0] ?? null
  if (geometry.type === 'MultiPolygon') {
    let best = null
    let bestLen = 0
    for (const poly of geometry.coordinates ?? []) {
      const ring = poly?.[0]
      if (ring && ring.length > bestLen) {
        best = ring
        bestLen = ring.length
      }
    }
    return best
  }
  return null
}

function ringBounds(ring) {
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return { minLng, maxLng, minLat, maxLat }
}

function ringCentroid(ring) {
  let sx = 0
  let sy = 0
  for (const [lng, lat] of ring) {
    sx += lng
    sy += lat
  }
  const n = ring.length || 1
  return { lat: sy / n, lng: sx / n }
}

export function hashSeed(str) {
  let h = 2166136261
  const s = String(str ?? '')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** Approximate barangay footprint as ellipse polygon around a center. */
export function makeApproxBarangayPolygon(lat, lng, radiusLat = 0.0038, steps = 28) {
  const cosLat = Math.cos((lat * Math.PI) / 180) || 0.97
  const radiusLng = radiusLat / cosLat
  const coords = []
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2
    coords.push([lng + Math.cos(a) * radiusLng, lat + Math.sin(a) * radiusLat])
  }
  return { type: 'Polygon', coordinates: [coords] }
}

/**
 * Ensure all 17 Pila barangays have polygons.
 * Existing OSM polygons are kept; missing ones get approximate footprints.
 * Feature names are normalized to clean official labels.
 */
export function completePilaBarangayGeoJson(sourceGeoJson) {
  const byKey = new Map()

  for (const feature of sourceGeoJson?.features ?? []) {
    const props = feature.properties || {}
    const raw = props.NAME_3 || props.name || props.brgy || ''
    const key = normalizeBarangayName(raw)
    if (!key || !feature.geometry) continue
    const official = PILA_BARANGAYS.find((b) => normalizeBarangayName(b.name) === key)
    byKey.set(key, {
      type: 'Feature',
      properties: {
        ...props,
        name: official?.name || raw.replace(/\s*\(pob\.?\s*\)/gi, '').trim(),
        source: props.source || 'osm',
      },
      geometry: feature.geometry,
    })
  }

  for (const b of PILA_BARANGAYS) {
    const key = normalizeBarangayName(b.name)
    if (byKey.has(key)) continue
    byKey.set(key, {
      type: 'Feature',
      properties: { name: b.name, source: 'approx-center' },
      geometry: makeApproxBarangayPolygon(b.lat, b.lng),
    })
  }

  // Stable order matching official list
  const features = PILA_BARANGAYS.map((b) => byKey.get(normalizeBarangayName(b.name))).filter(Boolean)

  return {
    type: 'FeatureCollection',
    generator: 'healthtrack-pila-barangays',
    features,
  }
}

/** Prefer polygon centroids so heat aligns with drawn boundaries. */
export function buildBarangayCentersFromGeoJson(barangayGeoJson, fallbackCenters = {}) {
  const map = { ...fallbackCenters }
  for (const feature of barangayGeoJson?.features ?? []) {
    const props = feature.properties || {}
    const key = normalizeBarangayName(props.NAME_3 || props.name || props.brgy || '')
    if (!key) continue
    const ring = getOuterRing(feature.geometry)
    if (!ring) continue
    map[key] = ringCentroid(ring)
  }
  return map
}

export function samplePointInFeature(feature, rng = Math.random) {
  const ring = getOuterRing(feature?.geometry)
  if (!ring || ring.length < 3) return null
  const { minLng, maxLng, minLat, maxLat } = ringBounds(ring)
  for (let attempt = 0; attempt < 50; attempt++) {
    const lng = minLng + rng() * (maxLng - minLng)
    const lat = minLat + rng() * (maxLat - minLat)
    if (pointInRing(lng, lat, ring)) return { lat, lng }
  }
  return ringCentroid(ring)
}

export function buildBarangayFeatureIndex(barangayGeoJson) {
  const map = new Map()
  for (const feature of barangayGeoJson?.features ?? []) {
    const props = feature.properties || {}
    const raw = props.NAME_3 || props.name || props.brgy || ''
    const key = normalizeBarangayName(raw)
    if (key) map.set(key, feature)
  }
  return map
}

/**
 * Samples stay inside the barangay polygon so heat lines up with boundaries.
 * Only use raw lat/lng when the point is already inside that barangay.
 */
export function expandCasesToHeatSamples(records, { featureIndex, centers = {}, maxSamplesPerCase = 22 } = {}) {
  const samples = []
  for (const record of records ?? []) {
    const cases = Math.max(1, Number(record.isEstimated ? record.count : 1) || 1)
    const sampleCount = Math.min(maxSamplesPerCase, Math.max(8, Math.round(6 + Math.sqrt(cases) * 5)))
    const weightEach = cases / sampleCount
    const brgyKey = normalizeBarangayName(record.barangay)
    const feature = featureIndex?.get?.(brgyKey) ?? null
    const center = centers[brgyKey] ?? null
    const rng = mulberry32(hashSeed(`${record.id}|${brgyKey}|${record.disease}`))

    const ring = feature ? getOuterRing(feature.geometry) : null
    const pointInsideBarangay =
      ring &&
      Number.isFinite(record.lat) &&
      Number.isFinite(record.lng) &&
      pointInRing(record.lng, record.lat, ring)

    for (let i = 0; i < sampleCount; i++) {
      let lat
      let lng
      if (pointInsideBarangay && i < Math.ceil(sampleCount * 0.35)) {
        // Keep a portion near the recorded residence, still inside barangay
        const angle = rng() * Math.PI * 2
        const radius = 0.0002 + rng() * 0.00045
        lat = record.lat + Math.cos(angle) * radius
        lng = record.lng + Math.sin(angle) * radius
        if (!pointInRing(lng, lat, ring)) {
          const pt = samplePointInFeature(feature, rng)
          lat = pt?.lat ?? record.lat
          lng = pt?.lng ?? record.lng
        }
      } else if (feature) {
        const pt = samplePointInFeature(feature, rng)
        lat = pt?.lat ?? center?.lat ?? record.lat
        lng = pt?.lng ?? center?.lng ?? record.lng
      } else if (center) {
        const angle = rng() * Math.PI * 2
        const radius = 0.0008 + rng() * 0.0016
        lat = center.lat + Math.cos(angle) * radius
        lng = center.lng + Math.sin(angle) * radius
      } else {
        lat = record.lat
        lng = record.lng
      }

      samples.push({
        id: `${record.id}-h${i}`,
        lat,
        lng,
        disease: record.disease,
        barangay: record.barangay,
        tbClassification: record.tbClassification,
        cases,
        weight: weightEach,
        isEstimated: !!record.isEstimated,
        ts: record.createdAt?.toISOString?.() ?? record.ts ?? null,
        sourceId: record.id,
      })
    }
  }
  return samples
}

export function lookupBarangayCount(counts, featureName) {
  if (!counts) return 0
  const raw = (featureName ?? '').toString().trim()
  if (raw && counts[raw] != null) return Number(counts[raw]) || 0
  const key = normalizeBarangayName(raw)
  if (key && counts[key] != null) return Number(counts[key]) || 0
  for (const [k, v] of Object.entries(counts)) {
    if (normalizeBarangayName(k) === key) return Number(v) || 0
  }
  return 0
}
