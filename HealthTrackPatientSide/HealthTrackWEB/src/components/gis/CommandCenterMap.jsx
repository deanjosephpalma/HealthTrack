import DeckGL from '@deck.gl/react'
import { ContourLayer, HeatmapLayer, HexagonLayer } from '@deck.gl/aggregation-layers'
import { AmbientLight, LightingEffect, PointLight } from '@deck.gl/core'
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map from 'react-map-gl/maplibre'
import { lookupBarangayCount, normalizeBarangayName } from '../../lib/gis/barangayHeat'

const DEFAULT_CENTER = [121.3644, 14.2338]
const DEFAULT_ZOOM = 12.8

const CARTO_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const CARTO_LIGHT = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'

function getRasterStyle({ imagery, labels }) {
  const sources = {
    imagery: {
      type: 'raster',
      tiles: [imagery],
      tileSize: 256,
      attribution: 'Tiles © Esri',
    },
  }
  const layers = [{ id: 'imagery', type: 'raster', source: 'imagery' }]

  if (labels) {
    sources.labels = { type: 'raster', tiles: [labels], tileSize: 256, attribution: '© OpenStreetMap contributors' }
    layers.push({ id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.55 } })
  }

  return { version: 8, sources, layers }
}

function getMapStyle(mode) {
  if (mode === 'satellite') {
    return getRasterStyle({
      imagery: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      labels: null,
    })
  }

  if (mode === 'hybrid') {
    return getRasterStyle({
      imagery: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      labels: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    })
  }

  if (mode === 'map') return CARTO_LIGHT
  return CARTO_DARK
}

function getHotspotColor(count) {
  if (count >= 15) return [239, 68, 68, 240]
  if (count >= 8) return [249, 115, 22, 230]
  if (count >= 3) return [245, 158, 11, 220]
  return [16, 185, 129, 210]
}

function getSeverityColor(count, alpha = 150) {
  const c = Number(count ?? 0)
  if (c >= 15) return [239, 68, 68, alpha]
  if (c >= 8) return [249, 115, 22, alpha]
  if (c >= 3) return [245, 158, 11, alpha]
  return [16, 185, 129, alpha]
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default function CommandCenterMap({
  points,
  hotspots,
  boundaryGeoJson,
  barangayGeoJson,
  barangayCounts,
  barangayHoverStats,
  showBoundaries,
  mapMode,
  densityMode,
  overlayMode,
  onHotspotSelect,
  onViewportChange,
  selectedHotspotKey,
  onMapReady,
}) {
  const animationFrameRef = useRef(null)
  const mapRef = useRef(null)
  const deckRef = useRef(null)
  const [viewState, setViewState] = useState({
    longitude: DEFAULT_CENTER[0],
    latitude: DEFAULT_CENTER[1],
    zoom: 13.2,
    minZoom: 12.8,
    maxZoom: 18,
    pitch: 50,
    bearing: -18,
  })
  const [pulse, setPulse] = useState(0)

  const mapStyle = useMemo(() => getMapStyle(mapMode), [mapMode])
  const effects = useMemo(() => {
    const ambient = new AmbientLight({ color: [255, 255, 255], intensity: 0.55 })
    const key = new PointLight({ color: [56, 189, 248], intensity: 0.8, position: [DEFAULT_CENTER[0], DEFAULT_CENTER[1], 8000] })
    return [new LightingEffect({ ambient, key })]
  }, [])

  useEffect(() => {
    const animate = (t) => {
      const phase = (t ?? 0) / 1000
      setPulse(phase)
      animationFrameRef.current = window.requestAnimationFrame(animate)
    }

    animationFrameRef.current = window.requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current)
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current?.getMap?.()
    const deck = deckRef.current?.deck
    if (!deck && !map) return
    onMapReady?.({ map: map ?? null, deck: deck ?? null })
  }, [onMapReady])

  useEffect(() => {
    const map = mapRef.current?.getMap?.()
    if (!map) return
    const mode = mapMode
    if (mode !== 'terrain') {
      try {
        map.setTerrain?.(null)
      } catch (_err) {
        void _err
      }
      return
    }

    const srcId = 'cc-dem'
    try {
      if (!map.getSource?.(srcId)) {
        map.addSource?.(srcId, {
          type: 'raster-dem',
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          tileSize: 256,
          encoding: 'terrarium',
          maxzoom: 14,
        })
      }
      if (!map.getLayer?.('cc-hillshade')) {
        map.addLayer?.({
          id: 'cc-hillshade',
          type: 'hillshade',
          source: srcId,
          paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': 'rgba(0,0,0,0.55)' },
        })
      }
      map.setTerrain?.({ source: srcId, exaggeration: 1.15 })
    } catch (_err) {
      void _err
    }
  }, [mapMode])

  const heatRadiusPixels = useMemo(() => {
    const z = Number(viewState.zoom) || DEFAULT_ZOOM
    // Keep heat glow tight so it stays inside barangay footprints
    const base = 16 + (z - 12) * 3.5
    const wave = 1 + Math.sin(pulse * 2.2) * 0.04
    return Math.max(12, Math.min(30, Math.round(base * wave)))
  }, [pulse, viewState.zoom])

  const heatIntensity = useMemo(() => {
    const z = Number(viewState.zoom) || DEFAULT_ZOOM
    const base = 0.55 + (z - 12) * 0.06
    const wave = 1 + Math.sin(pulse * 2.4) * 0.05
    return Math.max(0.4, Math.min(1.1, base * wave))
  }, [pulse, viewState.zoom])

  const layers = useMemo(() => {
    const list = []

    if (boundaryGeoJson) {
      list.push(
        new GeoJsonLayer({
          id: 'boundary-line',
          data: boundaryGeoJson,
          stroked: true,
          filled: false,
          getLineColor: [45, 212, 191, 220],
          getLineWidth: 2,
          lineWidthMinPixels: 2,
          pickable: false,
        }),
      )
    }

    if (barangayGeoJson) {
      list.push(
        new GeoJsonLayer({
          id: 'barangay-fill',
          data: barangayGeoJson,
          stroked: true,
          filled: true,
          extruded: mapMode === 'intel',
          wireframe: false,
          getElevation: (f) => {
            if (mapMode !== 'intel') return 0
            const name = f?.properties?.name || f?.properties?.NAME_3
            const v = lookupBarangayCount(barangayCounts, name)
            return Math.min(520, Math.round(Math.log10(v + 1) * 260))
          },
          getFillColor: (f) => {
            const name = f?.properties?.name || f?.properties?.NAME_3
            const v = lookupBarangayCount(barangayCounts, name)
            // Exact barangay heat (clipped to polygon) — primary density signal
            if (v <= 0) return [15, 23, 42, showBoundaries || densityMode === 'heat' ? 28 : 12]
            if (densityMode === 'heat') {
              if (v >= 15) return [239, 68, 68, 175]
              if (v >= 8) return [249, 115, 22, 165]
              if (v >= 3) return [245, 158, 11, 155]
              return [34, 197, 94, 140]
            }
            const baseAlpha = showBoundaries ? 38 : 22
            const heatAlpha = Math.min(150, 48 + v * 12)
            const alpha = mapMode === 'intel' ? Math.max(heatAlpha, showBoundaries ? 86 : heatAlpha) : heatAlpha
            return getSeverityColor(v, Math.max(baseAlpha, alpha))
          },
          getLineColor: [248, 250, 252, showBoundaries || densityMode === 'heat' ? 170 : 50],
          getLineWidth: densityMode === 'heat' ? 2 : 1,
          lineWidthMinPixels: densityMode === 'heat' ? 2 : 1,
          pickable: true,
          autoHighlight: true,
          highlightColor: [56, 189, 248, 70],
          updateTriggers: {
            getFillColor: [barangayCounts, showBoundaries, mapMode, densityMode],
            getElevation: [barangayCounts, mapMode],
            getLineColor: [showBoundaries, densityMode],
          },
        }),
      )
    }

    if (densityMode === 'heat') {
      list.push(
        new HeatmapLayer({
          id: 'heat',
          data: points ?? [],
          getPosition: (d) => [d.lng, d.lat],
          getWeight: (d) => Number(d.weight ?? 1),
          // Soft interior glow only — barangay polygons carry the accurate heat
          radiusPixels: heatRadiusPixels,
          intensity: heatIntensity,
          threshold: 0.08,
          aggregation: 'SUM',
          colorRange: [
            [16, 185, 129, 0],
            [34, 197, 94, 70],
            [245, 158, 11, 110],
            [249, 115, 22, 150],
            [239, 68, 68, 180],
          ],
          updateTriggers: {
            radiusPixels: heatRadiusPixels,
            intensity: heatIntensity,
            getWeight: points,
          },
          pickable: false,
        }),
      )
    }

    if (overlayMode === 'hex') {
      list.push(
        new HexagonLayer({
          id: 'hex',
          data: points ?? [],
          getPosition: (d) => [d.lng, d.lat],
          getElevationWeight: (d) => Number(d.weight ?? 1),
          getColorWeight: (d) => Number(d.weight ?? 1),
          elevationAggregation: 'SUM',
          colorAggregation: 'SUM',
          radius: 220,
          coverage: 0.9,
          extruded: true,
          elevationScale: 16 * (1 + Math.sin(pulse * 1.6) * 0.08),
          opacity: 0.5,
          upperPercentile: 98,
          material: true,
          pickable: true,
          autoHighlight: true,
        }),
      )
    }

    if (overlayMode === 'contours') {
      list.push(
        new ContourLayer({
          id: 'contours',
          data: points ?? [],
          getPosition: (d) => [d.lng, d.lat],
          getWeight: (d) => Number(d.weight ?? 1),
          contours: [
            { threshold: 2, color: [16, 185, 129, 120] },
            { threshold: 6, color: [245, 158, 11, 140] },
            { threshold: 12, color: [249, 115, 22, 160] },
            { threshold: 18, color: [239, 68, 68, 180] },
          ],
          cellSize: 160,
          opacity: 0.9,
        }),
      )
    }

    if (densityMode === 'points') {
      list.push(
        new ScatterplotLayer({
          id: 'points',
          data: points ?? [],
          getPosition: (d) => [d.lng, d.lat],
          getRadius: (d) => (d.isEstimated ? 8 * (1 + Math.sin(pulse * 3) * 0.2) : 6),
          radiusMinPixels: 2,
          radiusMaxPixels: 15,
          getFillColor: (d) => (d.isEstimated ? [245, 158, 11, 220] : [56, 189, 248, 190]),
          getLineColor: (d) => (d.isEstimated ? [245, 158, 11, 100] : [56, 189, 248, 80]),
          lineWidthMinPixels: 1,
          opacity: 0.95,
          pickable: false,
          updateTriggers: { getRadius: pulse, getFillColor: pulse },
        }),
      )
    }

    // Hotspot pins only in points mode (or selected) so density heat reads as area spread
    const showHotspotPins = densityMode === 'points' || Boolean(selectedHotspotKey)
    const hotspotData = showHotspotPins
      ? densityMode === 'points'
        ? hotspots ?? []
        : (hotspots ?? []).filter((h) => h.key === selectedHotspotKey)
      : []
    const hotspotRings = showHotspotPins
      ? hotspotData.flatMap((h) => [
          { ...h, _ring: 0 },
          { ...h, _ring: 1 },
        ])
      : []

    if (hotspotData.length) {
      list.push(
        new ScatterplotLayer({
          id: 'hotspot-glow',
          data: hotspotData,
          getPosition: (d) => [d.lng, d.lat],
          getRadius: (d) => Math.min(60, 16 + Number(d.count ?? 0) * 2.4) * (1 + Math.sin(pulse * 2.25) * 0.08),
          radiusMinPixels: 10,
          radiusMaxPixels: 70,
          getFillColor: (d) => {
            const [r, g, b] = getHotspotColor(Number(d.count ?? 0))
            return [r, g, b, 68]
          },
          opacity: 0.9,
          pickable: false,
          updateTriggers: { getRadius: pulse },
        }),
      )

      list.push(
        new ScatterplotLayer({
          id: 'hotspot-rings',
          data: hotspotRings,
          getPosition: (d) => [d.lng, d.lat],
          filled: false,
          stroked: true,
          getRadius: (d) => {
            const base = 18 + Math.min(110, Number(d.count ?? 0) * 6)
            const phase = (d._ring ? 1.1 : 0) + pulse * 1.25
            return base * (1.05 + (Math.sin(phase) * 0.18 + 0.18))
          },
          radiusMinPixels: 14,
          radiusMaxPixels: 120,
          getLineColor: (d) => {
            const [r, g, b] = getHotspotColor(Number(d.count ?? 0))
            return [r, g, b, 130]
          },
          lineWidthMinPixels: 2,
          opacity: 0.95,
          pickable: false,
          updateTriggers: { getRadius: pulse },
        }),
      )

      list.push(
        new ScatterplotLayer({
          id: 'hotspot-core',
          data: hotspotData,
          pickable: true,
          autoHighlight: true,
          highlightColor: [56, 189, 248, 120],
          getPosition: (d) => [d.lng, d.lat],
          getRadius: (d) => Math.min(18, 6 + Number(d.count ?? 0) * 0.5),
          radiusMinPixels: 4,
          radiusMaxPixels: 14,
          getFillColor: (d) => getHotspotColor(Number(d.count ?? 0)),
          getLineColor: (d) => (d.key === selectedHotspotKey ? [56, 189, 248, 220] : [56, 189, 248, 130]),
          lineWidthMinPixels: 2,
          opacity: 0.98,
          updateTriggers: {
            getLineColor: selectedHotspotKey,
          },
        }),
      )
    }

    return list
  }, [
    barangayCounts,
    barangayGeoJson,
    barangayHoverStats,
    boundaryGeoJson,
    densityMode,
    heatIntensity,
    heatRadiusPixels,
    hotspots,
    mapMode,
    overlayMode,
    points,
    pulse,
    selectedHotspotKey,
    showBoundaries,
  ])

  const getTooltip = useCallback(
    ({ object, layer }) => {
      if (!object) return null

      const tipStyle = {
        background: 'rgba(2, 6, 23, 0.94)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '12px',
        padding: '10px 12px',
        maxWidth: '280px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
      }

      if (layer?.id === 'barangay-fill') {
        const name = object?.properties?.name || object?.properties?.NAME_3 || 'Barangay'
        const key = normalizeBarangayName(name)
        const resolved =
          barangayHoverStats?.[key] ||
          Object.values(barangayHoverStats || {}).find(
            (row) => normalizeBarangayName(row.label) === key || row.key === key,
          ) ||
          null

        const total = resolved?.total ?? lookupBarangayCount(barangayCounts, name)
        const diseases = resolved?.diseases ?? []
        const diseaseRows =
          diseases.length > 0
            ? diseases
                .slice(0, 6)
                .map(
                  (d) =>
                    `<div style="display:flex;justify-content:space-between;gap:12px;margin-top:3px;"><span style="color:#cbd5e1;">${escapeHtml(d.name)}</span><span style="font-weight:800;color:#f8fafc;">${d.count}</span></div>`,
                )
                .join('')
            : `<div style="margin-top:4px;color:#94a3b8;">No reported cases in this barangay</div>`

        const more =
          diseases.length > 6
            ? `<div style="margin-top:4px;font-size:11px;color:#64748b;">+${diseases.length - 6} more diseases</div>`
            : ''

        return {
          html: `<div style="font-family:Manrope,system-ui,sans-serif;">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">Barangay · Pila, Laguna</div>
            <div style="margin-top:4px;font-weight:800;font-size:14px;color:#f8fafc;">${escapeHtml(resolved?.label || name)}</div>
            <div style="margin-top:8px;font-size:12px;color:#94a3b8;">Patients / cases: <span style="font-weight:800;color:#38bdf8;">${total}</span></div>
            ${
              resolved
                ? `<div style="margin-top:2px;font-size:11px;color:#64748b;">Clinical ${resolved.clinical} · Reported ${resolved.estimated}</div>`
                : ''
            }
            <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(148,163,184,0.25);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">By disease</div>
            <div style="font-size:12px;">${diseaseRows}${more}</div>
          </div>`,
          style: tipStyle,
        }
      }

      if (layer?.id === 'hotspot-core') {
        const label = object.label ?? 'Hotspot'
        const count = object.count ?? 0
        const diseases = object.raw?.diseases ?? []
        const barangays = object.raw?.barangays ?? []
        const diseaseLine =
          diseases.length > 0
            ? `<div style="margin-top:6px;font-size:12px;color:#cbd5e1;">${escapeHtml(diseases.slice(0, 3).join(', '))}</div>`
            : ''
        const placeLine =
          barangays.length > 0
            ? `<div style="margin-top:2px;font-size:11px;color:#64748b;">${escapeHtml(barangays.join(', '))}</div>`
            : ''
        return {
          html: `<div style="font-family:Manrope,system-ui,sans-serif;"><div style="font-weight:800;font-size:12px;color:#e2e8f0;">${escapeHtml(label)}</div>${placeLine}${diseaseLine}<div style="margin-top:4px;font-size:12px;color:#94a3b8;">Cases: <span style="font-weight:800;color:#38bdf8;">${count}</span></div></div>`,
          style: tipStyle,
        }
      }

      if (layer?.id === 'hex') {
        const count = object.elevationValue ?? object.colorValue ?? object.points?.length ?? 0
        return {
          html: `<div style="font-family:Manrope,system-ui,sans-serif;"><div style="font-weight:800;font-size:12px;color:#e2e8f0;">Hex cluster</div><div style="margin-top:4px;font-size:12px;color:#94a3b8;">Weighted cases: <span style="font-weight:800;color:#38bdf8;">${Math.round(count)}</span></div></div>`,
          style: tipStyle,
        }
      }

      return null
    },
    [barangayCounts, barangayHoverStats],
  )

  const handleViewStateChange = useCallback(
    ({ viewState: next }) => {
      // Restrict panning strictly to Pila's vicinity to hide the rest of Laguna
      const P_MIN_LNG = 121.30
      const P_MAX_LNG = 121.42
      const P_MIN_LAT = 14.18
      const P_MAX_LAT = 14.30

      const clampedLng = Math.min(Math.max(next.longitude, P_MIN_LNG), P_MAX_LNG)
      const clampedLat = Math.min(Math.max(next.latitude, P_MIN_LAT), P_MAX_LAT)

      const clampedViewState = {
        ...next,
        longitude: clampedLng,
        latitude: clampedLat,
      }

      setViewState(clampedViewState)
      const map = mapRef.current?.getMap?.()
      if (!map) return
      const bounds = map.getBounds?.()
      if (!bounds) return
      const sw = bounds.getSouthWest()
      const ne = bounds.getNorthEast()
      onViewportChange?.({
        sw: { lat: sw.lat, lng: sw.lng },
        ne: { lat: ne.lat, lng: ne.lng },
        center: { lat: clampedViewState.latitude, lng: clampedViewState.longitude },
        zoom: clampedViewState.zoom,
        bearing: clampedViewState.bearing,
        pitch: clampedViewState.pitch,
      })
    },
    [onViewportChange],
  )

  const handleClick = useCallback(
    (info) => {
      if (info?.layer?.id !== 'hotspot-core') return
      const obj = info?.object
      if (!obj?.key) return
      onHotspotSelect?.({ key: obj.key, lng: obj.lng, lat: obj.lat })
    },
    [onHotspotSelect],
  )

  useEffect(() => {
    if (!selectedHotspotKey) return
    const hotspot = (hotspots ?? []).find((h) => h.key === selectedHotspotKey)
    if (!hotspot) return
    const id = window.requestAnimationFrame(() => {
      setViewState((prev) => ({
        ...prev,
        longitude: hotspot.lng,
        latitude: hotspot.lat,
        zoom: Math.max(prev.zoom, 13.8),
        transitionDuration: 650,
        transitionInterpolator: undefined,
      }))
    })
    return () => window.cancelAnimationFrame(id)
  }, [hotspots, selectedHotspotKey])

  return (
    <div className="cc-map-wrap">
      <DeckGL
        ref={deckRef}
        viewState={viewState}
        onViewStateChange={handleViewStateChange}
        controller
        layers={layers}
        getTooltip={getTooltip}
        onClick={handleClick}
        effects={effects}
        pickingRadius={12}
      >
        <Map ref={mapRef} mapStyle={mapStyle} reuseMaps attributionControl={false} />
      </DeckGL>
      <div className="cc-map-atmosphere" />
      <div className="cc-map-vignette" />
      <div className="cc-map-particles" />
    </div>
  )
}
