'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Crosshair, Minus, Plus, RotateCcw, Ruler, Maximize2, Minimize2, X, LocateFixed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { blobPoints, hashStr, interpAt, closestApproach, haversineKm } from '@/lib/nauticeye/engine'
import { PLACE_LABELS } from '@/lib/nauticeye/demo-data'
import type { Layers, MaritimeDataset, Spill, Vessel } from '@/lib/nauticeye/types'
import { escapeHtml } from '@/lib/nauticeye/report'

const colors = { high: '#e8541f', medium: '#e0a11b', low: '#3f8f86' }
const region: L.LatLngTuple = [10.35, 75.85]
// The wreck position is exactly where the ship stops, so the incident pin (with its "01" text)
// is drawn offset up-right with a short leader line and never sits on top of the hull.
const PIN_OFFSET = 40
type Rect = { l: number; t: number; r: number; b: number }
const rectOverlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t))
const padRect = (a: Rect, p: number): Rect => ({ l: a.l - p, t: a.t - p, r: a.r + p, b: a.b + p })
const shipIcon = (course: number) => {
  const safeCourse = ((course % 360) + 360) % 360
  return L.divIcon({
    className: 'vessel-marker',
    html: `<span class="ship-ripple"></span><span class="ship-shape" style="transform:rotate(${safeCourse}deg)" aria-hidden="true"><img class="ship-img" src="/ship.png" alt="" draggable="false" width="9" height="22" /></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}
// Ship scales gently with zoom so it is small on the regional view and readable up close.
const shipScale = (zoom: number) => Math.min(1.5, Math.max(0.75, 0.75 + (zoom - 7) * 0.2))
// Metres per screen pixel at a latitude/zoom (Leaflet 256px tiles).
const metresPerPixel = (lat: number, zoom: number) => 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom)

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smoothstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const seededRand = (seed: number) => { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x) }

const bearingBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const p1 = a.lat * Math.PI / 180
  const p2 = b.lat * Math.PI / 180
  const dl = (b.lng - a.lng) * Math.PI / 180
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// AIS course can occasionally be stale/noisy in demonstration data. For the map
// icon, use the actual movement between adjacent track points when available so
// the bow always follows the visible track.
const visualCourse = (v: Vessel, simMs: number, fallback: number) => {
  const tr = v.track
  if (tr.length < 2) return fallback
  let index = tr.findIndex(p => p.t >= simMs)
  if (index < 0) index = tr.length - 1
  const next = tr[index]
  const prev = tr[Math.max(0, index - 1)]
  const ref = index === 0 ? tr[1] : next
  const a = index === 0 ? next : prev
  const b = index === 0 ? ref : next
  if (a.lat === b.lat && a.lng === b.lng) return fallback
  return bearingBetween(a, b)
}
const formatCoordinate = (lat: number, lng: number) => `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'} / ${Math.abs(lng).toFixed(3)}° ${lng >= 0 ? 'E' : 'W'}`

type Props = { dataset: MaritimeDataset; spill: Spill | null; vessel: Vessel | null; time: number; layers: Layers; highlights: string[]; overview: boolean; reducedMotion: boolean; onSpill: (id: string) => void; onVessel: (id: string) => void; focusVersion: number; expanded: boolean; onExpand: () => void }
type VesselLayers = { marker: L.Marker; track: L.Polyline; points: L.LayerGroup; selected: boolean; pointKey: string; course: number; tipKey: string }
type OilParticle = { rho: number; v: number; jit: number; wob: number; r: number; a: number; marker: L.CircleMarker; lastOpacity: number; lastRadius: number }
type OilField = { spillId: string; particles: OilParticle[]; body: L.Polygon; head: L.CircleMarker; fx: L.Marker; source: L.Marker; hitFired: boolean }

export default function IntelligenceMap({ dataset, spill, vessel, time, layers, highlights, overview, reducedMotion, onSpill, onVessel, focusVersion, expanded, onExpand }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const incidentGroup = useRef<L.LayerGroup | null>(null)
  const evidenceGroup = useRef<L.LayerGroup | null>(null)
  const driftGroup = useRef<L.LayerGroup | null>(null)
  const sarGroup = useRef<L.LayerGroup | null>(null)
  const measurementGroup = useRef<L.LayerGroup | null>(null)
  const fleet = useRef(new Map<string, VesselLayers>())
  const incidents = useRef(new Map<string, { marker: L.Marker; polygon: L.Polygon; selected: boolean; entered: boolean; placement: string }>())
  const oil = useRef<OilField | null>(null)
  const placeMarkers = useRef<L.Marker[]>([])
  const zooming = useRef(false)
  const pendingResize = useRef(false)
  const cam = useRef<{ spill?: string; vessel?: string; overview?: boolean; focus?: number; ready?: boolean }>({})
  const shown = useRef(time)
  const target = useRef(time)
  const dirty = useRef(true)
  const latest = useRef({ dataset, spill, vessel, layers, highlights, reducedMotion })
  const handlers = useRef({ onSpill, onVessel })
  handlers.current = { onSpill, onVessel }
  target.current = time
  latest.current = { dataset, spill, vessel, layers, highlights, reducedMotion }
  const measuring = useRef(false)
  const measurementPoints = useRef<L.LatLng[]>([])
  const [measure, setMeasure] = useState(false)
  const [measurement, setMeasurement] = useState<string | null>(null)
  const [coords, setCoords] = useState(formatCoordinate(region[0], region[1]))
  const [tileStatus, setTileStatus] = useState<'loading' | 'ready' | 'fallback' | 'error'>('loading')
  const [retry, setRetry] = useState(0)
  const [ready, setReady] = useState(false)
  const [zoom, setZoom] = useState(7)
  const simTime = dataset.referenceTime - (56 - time) * 3600000
  const stageIndex = time < 10 ? 0 : time < 20 ? 1 : time < 28 ? 2 : time < 38 ? 3 : time < 48 ? 4 : time < 56 ? 5 : 6
  const approach = useMemo(() => spill && vessel && vessel.track.length >= 2 ? closestApproach(vessel, spill) : null, [spill, vessel])
  const evidenceVisible = !!(approach && spill && spill.detectedAt <= simTime && approach.atTime <= simTime && vessel && highlights.includes(vessel.id) && layers.tracks)

  useEffect(() => {
    if (!host.current || map.current) return
    const m = L.map(host.current, { zoomControl: false, minZoom: 4, maxZoom: 17, attributionControl: true, scrollWheelZoom: !L.Browser.mobile, zoomSnap: .5 }).setView(region, 7.0)
    map.current = m
    incidentGroup.current = L.layerGroup().addTo(m)
    evidenceGroup.current = L.layerGroup().addTo(m)
    driftGroup.current = L.layerGroup().addTo(m)
    sarGroup.current = L.layerGroup().addTo(m)
    measurementGroup.current = L.layerGroup().addTo(m)
    m.createPane('placeLabels')
    m.getPane('placeLabels')!.style.pointerEvents = 'none'
    m.getPane('placeLabels')!.style.zIndex = '350'
    PLACE_LABELS.forEach(p => placeMarkers.current.push(L.marker([p.lat, p.lng], { interactive: false, keyboard: false, pane: 'placeLabels', icon: L.divIcon({ className: 'place-label', html: `<span>· ${escapeHtml(p.name)}</span>`, iconSize: [130, 16], iconAnchor: [-7, 8] }) }).addTo(m)))
    L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 90 }).addTo(m)
    let last = 0
    m.on('mousemove', (e: L.LeafletMouseEvent) => {
      if (Date.now() - last < 150) return
      last = Date.now()
      setCoords(formatCoordinate(e.latlng.lat, e.latlng.lng))
    })
    m.on('moveend', () => { const c = m.getCenter(); setCoords(formatCoordinate(c.lat, c.lng)) })
    const applyZoom = () => { host.current?.style.setProperty('--zs', shipScale(m.getZoom()).toFixed(2)) }
    applyZoom()
    m.on('zoom', applyZoom)
    m.on('zoomend', () => { setZoom(m.getZoom()); dirty.current = true })
    m.on('click', (event: L.LeafletMouseEvent) => {
      if (!measuring.current || !measurementGroup.current) return
      const group = measurementGroup.current
      if (measurementPoints.current.length === 2) { measurementPoints.current = []; group.clearLayers() }
      measurementPoints.current.push(event.latlng)
      L.circleMarker(event.latlng, { radius: 4, color: '#5eead4', fillOpacity: 1 }).addTo(group)
      if (measurementPoints.current.length === 2) {
        const [a, b] = measurementPoints.current
        const distance = haversineKm(a.lat, a.lng, b.lat, b.lng)
        const text = `${distance.toFixed(2)} km / ${(distance / 1.852).toFixed(2)} nm`
        L.polyline([a, b], { color: '#5eead4', weight: 2, dashArray: '5 5' }).bindTooltip(text, { permanent: true, direction: 'center' }).addTo(group)
        setMeasurement(text)
      } else setMeasurement('Select an end point on the map')
    })
    // Vector layers (oil, tracks) must not be redrawn while Leaflet is scaling them
    // during a zoom/fly animation, otherwise they flicker or jump. Freeze them until it ends.
    m.on('zoomstart', () => { zooming.current = true })
    m.on('zoomend', () => { zooming.current = false; if (pendingResize.current) { pendingResize.current = false; m.invalidateSize({ pan: false }) } dirty.current = true })
    const resize = new ResizeObserver(() => { if (zooming.current) pendingResize.current = true; else m.invalidateSize({ pan: false }) })
    resize.observe(host.current)
    setReady(true)
    return () => { resize.disconnect(); m.remove(); map.current = null; fleet.current.clear(); incidents.current.clear(); placeMarkers.current = []; oil.current = null }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    let disposed = false, successes = 0, failures = 0, fallback = false
    let layer: L.TileLayer
    let timeout: ReturnType<typeof setTimeout>
    setTileStatus('loading')
    // Dark basemap with real coastline data (Esri Dark Gray Canvas, no API key needed). If it
    // cannot load, fall back to darkened OpenStreetMap tiles. Satellite imagery is an optional basemap
    // (Layers panel) and falls back to the dark map.
    type Source = 'satellite' | 'dark' | 'dark-fallback'
    const sources: Record<Source, { url: string; options: L.TileLayerOptions }> = {
      satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', options: { maxZoom: 19, className: 'satellite-tiles', attribution: 'Tiles © Esri, Maxar, Earthstar Geographics' } },
      dark: { url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', options: { maxZoom: 19, maxNativeZoom: 16, className: 'cartographic-tiles', attribution: 'Tiles © Esri — Esri, DeLorme, HERE, OpenStreetMap contributors' } },
      // Keyless backup: standard OpenStreetMap tiles, darkened with CSS.
      'dark-fallback': { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', options: { maxZoom: 19, className: 'osm-dark-tiles', attribution: '© OpenStreetMap contributors' } },
    }
    const attach = (source: Source) => {
      successes = 0; failures = 0
      const { url, options } = sources[source]
      layer = L.tileLayer(url, { ...options, keepBuffer: 2 })
      const fail = () => {
        if (disposed) return
        const next: Source | null = source === 'satellite' ? 'dark' : source === 'dark' ? 'dark-fallback' : null
        if (next && successes === 0) {
          fallback = true; layer.off(); layer.remove(); clearTimeout(timeout); setTileStatus('fallback'); attach(next)
        } else setTileStatus('error')
      }
      layer.on('tileload', () => { if (disposed) return; successes++; clearTimeout(timeout); setTileStatus(fallback && source === 'dark' ? 'fallback' : 'ready') })
      layer.on('tileerror', () => { failures++; if (failures >= 3 && successes === 0) fail() })
      timeout = setTimeout(() => { if (!successes) fail() }, 10000)
      layer.addTo(m)
    }
    attach(layers.satellite ? 'satellite' : 'dark')
    return () => { disposed = true; clearTimeout(timeout); layer.off(); layer.remove() }
  }, [layers.satellite, ready, retry])

  useEffect(() => {
    const group = incidentGroup.current
    if (!group || !ready) return
    const visible = new Set<string>()
    if (layers.spills && stageIndex >= 3) dataset.spills.filter(s => s.detectedAt <= simTime).forEach(s => {
      visible.add(s.id)
      const active = spill?.id === s.id
      const color = s.status === 'resolved' ? '#78c987' : colors[s.severity]
      let entry = incidents.current.get(s.id)
      if (!entry) {
        const polygon = L.polygon(blobPoints(s.lat, s.lng, Math.sqrt(s.area) * 1.3 + 1.5, hashStr(s.id)), { color, weight: 1.6, fillOpacity: .16, dashArray: '6 5', className: 'incident-footprint' }).addTo(group)
        polygon.bindTooltip('Illustrative footprint · not survey geometry')
        polygon.on('click', () => { if (!measuring.current) handlers.current.onSpill(s.id) })
        const marker = L.marker([s.lat, s.lng], { title: s.name, alt: s.name, icon: L.divIcon({ className: 'incident-marker' }) }).addTo(group)
        marker.on('click', () => { if (!measuring.current) handlers.current.onSpill(s.id) })
        entry = { marker, polygon, selected: !active, entered: false, placement: '' }
        incidents.current.set(s.id, entry)
      }
      let labelPlacement = entry.placement || 'label-right'
      if (active && map.current) {
        const zoomNow = map.current.getZoom()
        const c = map.current.project([s.lat, s.lng], zoomNow)
        // Pin centre is offset from the wreck so it never covers the ship.
        const P = { x: c.x + PIN_OFFSET, y: c.y - PIN_OFFSET }
        const ships = dataset.vessels
          .filter(v => v.track.length)
          .map(v => { const pos = interpAt(v, 56 - time, dataset.referenceTime); return map.current!.project([pos.lat, pos.lng], zoomNow) })
        // Exact card rectangles for each CSS placement (card is 198 x ~72 px), relative to the pin centre.
        const box = (l: number, t: number): Rect => ({ l: P.x + l, t: P.y + t, r: P.x + l + 198, b: P.y + t + 72 })
        const candidates: { name: string; rect: Rect }[] = [
          { name: 'label-right', rect: box(159, -52) },
          { name: 'label-left', rect: box(-349, -52) },
          { name: 'label-top', rect: box(-115, -168) },
          { name: 'label-bottom', rect: box(-115, 104) },
        ]
        // Clearance = smallest gap between any ship and the card (0 means the ship is under it).
        const clearance = (r: Rect) => ships.length === 0 ? Infinity : Math.min(...ships.map(v => Math.hypot(Math.max(r.l - v.x, 0, v.x - r.r), Math.max(r.t - v.y, 0, v.y - r.b))))
        const scored = candidates.map(cand => ({ ...cand, gap: clearance(cand.rect) }))
        const current = scored.find(cand => cand.name === entry!.placement)
        // Keep the current placement while it stays clear of every ship (no flicker); otherwise
        // take the first comfortable one, or the roomiest if none is comfortable.
        if (!current || current.gap < 60) labelPlacement = (scored.find(cand => cand.gap >= 60) ?? scored.sort((a, b) => b.gap - a.gap)[0]).name
      }
      if (entry.selected !== active || (active && entry.placement !== labelPlacement)) {
        const label = `<span class="incident-pin ${active ? 'is-selected' : ''}" style="--pin:${color}"><i></i><b>${escapeHtml(s.id.replace('S', '0'))}</b></span>${active ? `<span class="map-incident-label ${labelPlacement}"><small>DETECTION ${escapeHtml(s.id.replace('S', '0'))} / ${s.confidence}% CONFIDENCE</small><strong>${escapeHtml(s.name)}</strong><em>${s.area} km² · ${s.status.toUpperCase()}</em></span>` : ''}`
        entry.marker.setIcon(L.divIcon({ className: entry.entered ? 'incident-marker' : 'incident-marker is-entering', html: label, iconSize: [40, 40], iconAnchor: [16 - PIN_OFFSET, 16 + PIN_OFFSET] })).setZIndexOffset(active ? 600 : 400)
        entry.polygon.setStyle({ weight: active ? 2.2 : 1.6, fillOpacity: active ? .28 : .16 })
        entry.selected = active
        entry.placement = labelPlacement
        entry.entered = true
      }
    })
    incidents.current.forEach((entry, id) => { if (!visible.has(id)) { group.removeLayer(entry.marker); group.removeLayer(entry.polygon); incidents.current.delete(id) } })
  }, [dataset, spill, simTime, time, stageIndex, layers.spills, ready, zoom])

  // ---------------------------------------------------------------------------
  // Smooth animation loop.
  // React only delivers `time` a few times per second. Instead of rebuilding the
  // map layers on every tick (which made vessels jump and the oil field flicker),
  // this loop eases a displayed clock toward the target and updates persistent
  // Leaflet layers in place every frame. Stage changes fade instead of popping.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!ready) return
    let raf = 0
    let last = performance.now()
    let lastAmbient = 0

    const renderFrame = (h: number, now: number) => {
      const m = map.current
      const group = driftGroup.current
      const sar = sarGroup.current
      if (!m || !group || !sar) return
      const { dataset: ds, spill: sp, vessel: selectedVessel, layers: lay, highlights: hl, reducedMotion: reduced } = latest.current
      const hoursAgo = 56 - h
      const simMs = ds.referenceTime - hoursAgo * 3600000

      // ---- Vessels: always present. After the sinking they stay as a ghosted
      // "last AIS position" instead of disappearing between steps.
      const sink = smoothstep(16, 21, h)
      const trackAlpha = clamp01(1 - smoothstep(19, 24, h) + smoothstep(44, 50, h))
      const available = new Set<string>()
      ds.vessels.forEach(v => {
        if (!v.track.length) return
        available.add(v.id)
        const pos = interpAt(v, hoursAgo, ds.referenceTime)
        const targetCourse = visualCourse(v, simMs, pos.course)
        const selected = selectedVessel?.id === v.id || hl.includes(v.id)
        const color = selected ? '#5eead4' : '#9db7c4'
        let entry = fleet.current.get(v.id)
        if (!entry) {
          const marker = L.marker([pos.lat, pos.lng], { icon: shipIcon(targetCourse), title: v.name, alt: `Inspect ${v.name}`, riseOnHover: true, zIndexOffset: 1000 })
          marker.bindTooltip('', { direction: 'top', offset: [0, -14] })
          marker.on('click', () => { if (!measuring.current) handlers.current.onVessel(v.id) })
          entry = { marker, track: L.polyline([], { weight: 1 }), points: L.layerGroup(), selected: !selected, pointKey: '', course: targetCourse, tipKey: '' }
          fleet.current.set(v.id, entry)
        }
        // Shortest-arc heading smoothing so the bow never spins the long way round.
        const dCourse = ((targetCourse - entry.course + 540) % 360) - 180
        entry.course = reduced ? targetCourse : (entry.course + dCourse * 0.3 + 360) % 360

        entry.marker.setLatLng([pos.lat, pos.lng]).setOpacity((selectedVessel && !selected ? 0.75 : 1) * (1 - 0.12 * sink))
        if (entry.selected !== selected) { entry.marker.setZIndexOffset(selected ? 1100 : 1000); entry.selected = selected }
        const el = entry.marker.getElement()
        if (el) {
          el.classList.toggle('is-selected', selected)
          el.classList.toggle('is-sunk', sink > 0.98)
          el.style.setProperty('--sink', sink.toFixed(3))
          const shape = el.querySelector<HTMLElement>('.ship-shape')
          if (shape) shape.style.transform = `rotate(${entry.course.toFixed(1)}deg)`
        }
        const tipKey = `${Math.floor(simMs / 60000)}:${sink > 0.98}`
        if (entry.tipKey !== tipKey) {
          entry.tipKey = tipKey
          entry.marker.setTooltipContent(`<b>${escapeHtml(v.name)}</b><br/>MMSI ${escapeHtml(v.mmsi)} · ${escapeHtml(v.flag)}<br/>${sink > 0.98 ? 'Last AIS position · vessel lost' : `${pos.speed.toFixed(1)} kn · ${Math.round(entry.course)}°`}<br/>${new Date(simMs).toISOString().slice(11, 16)} UTC · simulated position`)
        }
        if (lay.vessels) { if (!m.hasLayer(entry.marker)) entry.marker.addTo(m) } else entry.marker.remove()

        if (!zooming.current) {
          const observed = v.track.filter(p => p.t <= simMs)
          const past: L.LatLngTuple[] = observed.map(p => [p.lat, p.lng])
          past.push([pos.lat, pos.lng])
          entry.track.setLatLngs(past).setStyle({ color, weight: selected ? 2.6 : 1.4, opacity: (selected ? 0.95 : 0.55) * trackAlpha, dashArray: selected ? undefined : '3 6' })
          if (lay.tracks && past.length > 1 && trackAlpha > 0.02) { if (!m.hasLayer(entry.track)) entry.track.addTo(m) } else entry.track.remove()
          const showPoints = selected && lay.tracks && trackAlpha > 0.5
          const pointKey = `${showPoints}:${observed.length}`
          if (entry.pointKey !== pointKey) {
            entry.points.clearLayers()
            if (showPoints) observed.forEach(p => L.circleMarker([p.lat, p.lng], { radius: 2.5, color, fillOpacity: 1, weight: 1 }).bindTooltip(`${new Date(p.t).toUTCString()} · ${p.speed} kn`).addTo(entry!.points))
            entry.pointKey = pointKey
          }
          if (!m.hasLayer(entry.points)) entry.points.addTo(m)
        }
      })
      fleet.current.forEach((entry, id) => { if (!available.has(id)) { entry.marker.remove(); entry.track.remove(); entry.points.remove(); fleet.current.delete(id) } })

      // ---- Oil drift + SAR scan.
      if (!sp) {
        if (oil.current) { group.clearLayers(); sar.clearLayers(); oil.current = null }
        return
      }
      const detected = simMs >= sp.detectedAt
      const fadeIn = detected ? smoothstep(28, 31.5, h) : 0
      const sarAlpha = detected ? smoothstep(19.5, 21.5, h) * (1 - smoothstep(36, 38, h)) : 0
      if (fadeIn <= 0.002 && sarAlpha <= 0.002) {
        if (oil.current) { group.clearLayers(); sar.clearLayers(); oil.current = null }
        return
      }

      const cosLat = Math.cos(sp.lat * Math.PI / 180)
      const bearing = 112.5 * Math.PI / 180 // east-south-east, per public reporting
      const toLatLng = (alongKm: number, sideKm: number): L.LatLngTuple => {
        const n = Math.cos(bearing) * alongKm - Math.sin(bearing) * sideKm
        const e = Math.sin(bearing) * alongKm + Math.cos(bearing) * sideKm
        return [sp.lat + n / 111.32, sp.lng + e / (111.32 * cosLat)]
      }

      if (!oil.current || oil.current.spillId !== sp.id) {
        group.clearLayers(); sar.clearLayers()
        const particles = Array.from({ length: 160 }, (_, i) => {
          const marker = L.circleMarker(toLatLng(0, 0), { radius: 2, stroke: false, fillColor: i % 6 === 0 ? '#f59e42' : i % 11 === 0 ? '#7c2d12' : '#d9531e', fillOpacity: 0, interactive: false, className: 'oil-particle' }).addTo(group)
          return { rho: seededRand(i + 1), v: seededRand(i + 91), jit: seededRand(i + 190) - 0.5, wob: seededRand(i + 260) * Math.PI * 2, r: 1.4 + seededRand(i + 310) * 3, a: 0.2 + seededRand(i + 420) * 0.3, marker, lastOpacity: -1, lastRadius: -1 }
        })
        const body = L.polygon([toLatLng(0, 0), toLatLng(0, 0), toLatLng(0, 0)], { stroke: false, fillColor: '#e2622a', fillOpacity: 0, interactive: false, className: 'oil-body' }).addTo(group)
        const head = L.circleMarker(toLatLng(0, 0), { radius: 4, color: '#ffffff', weight: 1.5, fillColor: '#d9531e', fillOpacity: 0, opacity: 0, interactive: false }).addTo(group)
        const source = L.marker(toLatLng(0, 0), { interactive: false, keyboard: false, zIndexOffset: 100, icon: L.divIcon({ className: 'spill-source-host', iconSize: [0, 0], html: '<div class="spill-source"><i></i><i></i><i></i><b></b></div>' }) }).addTo(group)
        const label = (t: string, sub: string, cls: string) => `<span class="${cls}"><em>${t}</em><small>${sub}</small></span>`
        const fx = L.marker(toLatLng(0, 0), { interactive: false, keyboard: false, zIndexOffset: 300, icon: L.divIcon({ className: 'scan-fx-host', iconSize: [0, 0], html: `<div class="scan-fx"><div class="scan-disc"><i class="scan-grid"></i><i class="scan-sweep"></i><i class="scan-pulse"></i><i class="scan-pulse"></i><i class="scan-pulse"></i></div><div class="scan-zone"><b></b><b></b><b></b><b></b></div><div class="scan-tag"><div class="scan-tag-text">${label('SAR SATELLITE PASS', 'Scanning the sea surface', 't-acq')}${label('ANALYSING IMAGE', 'Isolating the oil signature', 't-seg')}${label('OIL SLICK DETECTED', `${sp.area} km² · ${sp.confidence}% confidence`, 't-det')}</div><div class="scan-bar"><i></i></div></div></div>` }) }).addTo(group)
        oil.current = { spillId: sp.id, particles, body, head, fx, source, hitFired: false }
      }
      const o = oil.current

      // Continuous drift: the slick travels ESE at ~1.75 kn (capped), and the
      // visible extent eases from a compact slick into the full reconstruction
      // rather than jumping between three fixed scales.
      const elapsedHours = Math.max(0, (simMs - sp.detectedAt) / 3600000)
      const driftKm = Math.min(elapsedHours * 1.75 * 1.852, 32)
      const D = driftKm * (0.18 + 0.82 * smoothstep(28, 50, h))

      const headPoint = toLatLng(D, 0)
      if (!zooming.current) {
        o.particles.forEach(p => {
          // Particles released earlier (small rho) sit further downwind; newer oil
          // stays near the wreck, giving a continuous plume with a leading edge.
          const age = 1 - p.rho
          const idle = now / 1000
          const along = D * (0.04 + age * 1.02) + p.jit * (0.35 + D * 0.02) + Math.cos(h * 0.4 + p.wob * 1.7) * 0.18 + Math.sin(idle * 0.5 + p.wob * 1.7) * (0.12 + age * 0.22)
          const width = 1 + 0.42 * Math.sqrt(age * D + 0.5)
          const side = (p.v - 0.5) * width * 1.6 + Math.sin(h * 0.55 + p.wob) * 0.22 * (0.4 + age) + Math.cos(idle * 0.42 + p.wob) * (0.14 + age * 0.2)
          p.marker.setLatLng(toLatLng(along, side))
          const opacity = p.a * fadeIn * (1 - 0.3 * age * age)
          if (Math.abs(opacity - p.lastOpacity) > 0.004) { p.marker.setStyle({ fillOpacity: opacity }); p.lastOpacity = opacity }
          const radius = p.r * (0.85 + 0.35 * age)
          if (Math.abs(radius - p.lastRadius) > 0.05) { p.marker.setRadius(radius); p.lastRadius = radius }
        })
        const bodyLength = Math.max(1.4, D * 0.72)
        const bodyWidth = Math.max(1.6, 2.5 + D * 0.045)
        o.body.setLatLngs([
          toLatLng(-bodyLength * 0.35, -bodyWidth),
          toLatLng(bodyLength * 0.95, -bodyWidth * 0.55),
          toLatLng(bodyLength * 1.15, 0),
          toLatLng(bodyLength * 0.95, bodyWidth * 0.55),
          toLatLng(-bodyLength * 0.35, bodyWidth),
        ]).setStyle({ fillOpacity: 0.1 * fadeIn })
        o.head.setLatLng(headPoint).setStyle({ fillOpacity: 0.25 * fadeIn, opacity: fadeIn })
      }

      // Scan → lock-on → detection zone. One continuous instrument: a wide sweep
      // during acquisition that contracts onto the slick during segmentation and
      // settles into a persistent detection zone.
      const lock = smoothstep(27, 32, h)
      const scanKm = 42 + Math.min(18, elapsedHours * 2.2)
      const zoneKm = Math.max(11, D * 0.62 + 7)
      const radiusKm = scanKm + (zoneKm - scanKm) * lock
      const centre = toLatLng(D * 0.5 * lock, 0)
      const zoom = m.getZoom()
      const diameter = Math.max(72, (radiusKm * 2000) / metresPerPixel(sp.lat, zoom))
      const sweepAlpha = sarAlpha * (1 - smoothstep(28.5, 32, h))
      const zoneAlpha = detected ? smoothstep(27.5, 30.5, h) : 0
      const labelA = 1 - smoothstep(27.4, 28.4, h)
      const labelC = smoothstep(37, 38.4, h)
      const labelB = clamp01(1 - labelA - labelC)
      const progress = h < 28 ? (h - 20) / 8 : h < 38 ? (h - 28) / 10 : 1
      o.fx.setLatLng(centre)
      o.source.setLatLng(toLatLng(0, 0))
      const fxEl = o.fx.getElement()
      if (fxEl) {
        const st = fxEl.style
        st.setProperty('--d', `${diameter.toFixed(1)}px`)
        st.setProperty('--sa', sweepAlpha.toFixed(3))
        st.setProperty('--za', zoneAlpha.toFixed(3))
        st.setProperty('--ta', Math.max(sarAlpha, zoneAlpha).toFixed(3))
        st.setProperty('--la', labelA.toFixed(3)); st.setProperty('--lb', labelB.toFixed(3)); st.setProperty('--lc', labelC.toFixed(3))
        st.setProperty('--p', clamp01(progress).toFixed(3))
        // Highlight the moment "OIL SLICK DETECTED" first becomes visible —
        // fires once per detection pass, and rearms if the operator scrubs
        // back before the stage and forward through it again.
        if (labelC > 0.5 && !o.hitFired) {
          o.hitFired = true
          const zoneEl = fxEl.querySelector<HTMLElement>('.scan-zone')
          const tagEl = fxEl.querySelector<HTMLElement>('.scan-tag')
          zoneEl?.classList.add('zone-hit'); tagEl?.classList.add('tag-hit')
          window.setTimeout(() => { zoneEl?.classList.remove('zone-hit'); tagEl?.classList.remove('tag-hit') }, 950)
        } else if (labelC < 0.25) {
          o.hitFired = false
        }
      }
      o.source.getElement()?.style.setProperty('--fa', fadeIn.toFixed(3))
    }

    // Text never sits on the ship: the SAR caption flips above/below the detection zone and
    // map place names fade out whenever the hull (or the incident card) would be underneath.
    let lastDeclutter = 0
    const declutter = (now: number) => {
      if (now - lastDeclutter < 120) return
      lastDeclutter = now
      const m = map.current
      const hostEl = host.current
      if (!m || !hostEl) return
      const b = hostEl.getBoundingClientRect()
      const rel = (r: DOMRect): Rect => ({ l: r.left - b.left, t: r.top - b.top, r: r.right - b.left, b: r.bottom - b.top })
      const ships: Rect[] = []
      if (latest.current.layers.vessels) fleet.current.forEach(e => {
        const hull = e.marker.getElement()?.querySelector('.ship-shape')
        if (hull) ships.push(padRect(rel(hull.getBoundingClientRect()), 8))
      })
      const card = hostEl.querySelector('.map-incident-label')
      const pin = hostEl.querySelector('.incident-pin')
      const cardRects = [card, pin].filter((el): el is Element => !!el).map(el => padRect(rel(el.getBoundingClientRect()), 6))

      const fxEl = oil.current?.fx.getElement()
      const tag = fxEl?.querySelector<HTMLElement>('.scan-tag')
      if (fxEl && tag && parseFloat(fxEl.style.getPropertyValue('--ta') || '0') > 0.05) {
        const cur = rel(tag.getBoundingClientRect())
        const height = cur.b - cur.t
        const shift = height + (parseFloat(fxEl.style.getPropertyValue('--d') || '0') || 0) + 28
        const flipped = tag.classList.contains('flip')
        const alt: Rect = flipped ? { ...cur, t: cur.t - shift, b: cur.b - shift } : { ...cur, t: cur.t + shift, b: cur.b + shift }
        const cost = (r: Rect) => [...ships, ...cardRects].reduce((sum, o) => sum + rectOverlap(r, o), 0)
        if (cost(cur) > 0 && cost(alt) < cost(cur)) tag.classList.toggle('flip', !flipped)
      }

      placeMarkers.current.forEach(mk => {
        const el = mk.getElement()
        const text = el?.querySelector('span')
        if (!el || !text) return
        const r = padRect(rel(text.getBoundingClientRect()), 6)
        el.classList.toggle('is-covered', [...ships, ...cardRects].some(o => rectOverlap(r, o) > 0))
      })
    }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(now - last, 100)
      last = now
      if (document.hidden) return
      declutter(now)
      const diff = target.current - shown.current
      if (Math.abs(diff) > 0.0005) {
        shown.current = latest.current.reducedMotion ? target.current : shown.current + diff * (1 - Math.exp(-dt / 90))
        if (Math.abs(target.current - shown.current) < 0.002) shown.current = target.current
      } else if (!dirty.current) {
        // Keep the oil gently alive while paused (about 30 fps).
        if (!oil.current || latest.current.reducedMotion || now - lastAmbient < 33) return
      }
      lastAmbient = now
      dirty.current = false
      renderFrame(shown.current, now)
    }
    dirty.current = true
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ready])

  useEffect(() => { dirty.current = true }, [dataset, spill, vessel, layers, highlights, reducedMotion, ready])


  useEffect(() => {
    const group = evidenceGroup.current
    if (!group || !ready) return
    group.clearLayers()
    if (!evidenceVisible || !approach || !spill) return
    L.polyline([[approach.lat, approach.lng], [spill.lat, spill.lng]], { color: '#d9531e', weight: 2, dashArray: '5 5', className: 'evidence-line' }).addTo(group)
    L.circleMarker([approach.lat, approach.lng], { color: '#d9531e', radius: 5, fillColor: '#0a1a20', fillOpacity: 1, weight: 2.5 }).bindTooltip(`${approach.distKm.toFixed(1)} km · ${new Date(approach.atTime).toISOString().slice(11, 16)} UTC`, { permanent: false, direction: 'bottom', offset: [0, 8], className: 'evidence-tooltip' }).addTo(group)
    const r = approach.course * Math.PI / 180
    L.polyline([[approach.lat, approach.lng], [approach.lat + Math.cos(r) * 8 / 111.32, approach.lng + Math.sin(r) * 8 / (111.32 * Math.cos(approach.lat * Math.PI / 180))]], { color: '#5eead4', weight: 2.5, opacity: .9 }).bindTooltip(`Heading ${Math.round(approach.course)}° · vector shown at 8 km`).addTo(group)
  }, [approach, evidenceVisible, spill, overview, ready])

  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const prev = cam.current
    const first = !prev.ready
    cam.current = { spill: spill?.id, vessel: vessel?.id, overview, focus: focusVersion, ready }
    const spillChanged = prev.spill !== spill?.id
    const vesselChanged = prev.vessel !== vessel?.id
    const overviewChanged = prev.overview !== overview
    const focusChanged = prev.focus !== focusVersion
    if (!first && !spillChanged && !vesselChanged && !overviewChanged && !focusChanged) return
    const options = { animate: !reducedMotion && !first, duration: 1.2, easeLinearity: 0.2 }
    // Only move the camera for deliberate navigation. Timeline playback or scrubbing
    // (which selects/deselects the vessel automatically) must not swing the view around.
    if (overview) {
      if (first || overviewChanged || spillChanged || focusChanged) { m.stop(); m.flyTo(region, 7.0, options) }
    } else if (spill && vessel && vessel.track.length) {
      if (vesselChanged || spillChanged || focusChanged || overviewChanged) {
        m.stop()
        m.flyToBounds(L.latLngBounds([[spill.lat, spill.lng], ...vessel.track.map(p => [p.lat, p.lng] as L.LatLngTuple)]), { ...options, paddingTopLeft: [45, 85], paddingBottomRight: [65, 100], maxZoom: 9 })
      }
    } else if (spill) {
      if (spillChanged || focusChanged || overviewChanged) { m.stop(); m.flyTo([spill.lat, spill.lng], 8.5, options) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spill?.id, vessel?.id, overview, reducedMotion, ready, focusVersion])

  const toggleMeasure = () => {
    const next = !measure
    measuring.current = next; setMeasure(next); setMeasurement(null)
    measurementPoints.current = []; measurementGroup.current?.clearLayers()
  }
  const fitRegion = () => {
    const bounds = L.latLngBounds([[9.1, 74.2], [11.8, 78.0]])
    if (bounds.isValid()) map.current?.flyToBounds(bounds, { padding: [75, 95], maxZoom: 8, animate: !reducedMotion })
  }
  return <div className="intelligence-map" data-map-ready={ready} data-measuring={measure}>
    <div ref={host} className="leaflet-host" aria-label="Interactive Kerala and Arabian Sea investigation map. MSC ELSA 3 historical reconstruction with oil drift, SAR detection and AIS vessels." />
    <div className="map-coordinate"><Crosshair size={12} /><span>{coords}</span><span className="coordinate-datum">WGS 84</span></div>
    <div className="map-zoom">
      <Button size="icon" variant="outline" aria-label={expanded ? 'Restore workspace' : 'Expand map'} title={expanded ? 'Restore workspace (Esc)' : 'Expand map'} onClick={onExpand}>{expanded ? <Minimize2 /> : <Maximize2 />}</Button>
      <Button size="icon" variant="outline" aria-label="Measure map distance" title="Measure distance between two points" aria-pressed={measure} onClick={toggleMeasure}><Ruler /></Button>
      <Button size="icon" variant="outline" aria-label="Focus selected incident" title="Focus selected incident" disabled={!spill} onClick={() => spill && map.current?.flyTo([spill.lat, spill.lng], 10, { animate: !reducedMotion })}><LocateFixed /></Button>
      <Button size="icon" variant="outline" aria-label="Zoom in" disabled={zoom >= 17} onClick={() => map.current?.zoomIn()}><Plus /></Button>
      <Button size="icon" variant="outline" aria-label="Zoom out" disabled={zoom <= 4} onClick={() => map.current?.zoomOut()}><Minus /></Button>
      <Button size="icon" variant="outline" aria-label="Fit all incidents" title="Fit all incidents" onClick={fitRegion}><RotateCcw /></Button>
    </div>
    {measure && <div className="measurement-status" role="status"><Ruler size={14} /><span>{measurement ?? 'Select a start point on the map'}<small>Geodesic distance · two points · click again to restart</small></span><button aria-label="Close measurement" onClick={toggleMeasure}><X size={16} /></button></div>}
    {tileStatus === 'loading' && <span className="basemap-loading" role="status">Loading basemap…</span>}
    {(tileStatus === 'error' || tileStatus === 'fallback') && <div className="tile-warning" role="status">{tileStatus === 'fallback' ? 'Basemap unavailable. Showing fallback map.' : 'Basemap connection interrupted. Evidence remains available.'} <button onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
  </div>
}
