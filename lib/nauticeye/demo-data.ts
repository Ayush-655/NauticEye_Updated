import type { Spill, Vessel } from './types'

// Historical reconstruction window for the MSC ELSA 3 incident.
export const INCIDENT_START = Date.UTC(2025, 4, 25, 10, 0, 0)
export const NOW = Date.UTC(2025, 4, 27, 18, 0, 0)
export const WINDOW_HOURS = 56
const T = (hAgo: number) => NOW - hAgo * 3600000

export const SPILLS: Spill[] = [
  {
    id: 'S1',
    name: 'MSC ELSA 3 — Kerala Oil Spill',
    lat: 10.12,
    lng: 75.72,
    detectedAt: Date.UTC(2025, 4, 26, 6, 0, 0),
    confidence: 92,
    area: 5.8,
    severity: 'high',
    status: 'active',
    satellite: 'SAR acquisition (reconstruction)',
    desc: 'Historical reconstruction of the MSC ELSA 3 sinking and subsequent oil-slick detection off the Kerala coast. The visual drift is a demonstration of the documented east-southeast movement, not an exact particle-level historical trajectory.',
  },
]

// Only the incident vessel is shown in the historical reconstruction.
// Track headings are derived from movement between points by the map renderer.
export const VESSELS: Vessel[] = [
  {
    id: 'V1',
    name: 'MSC ELSA 3',
    mmsi: '353000000',
    flag: 'Panama',
    type: 'Container Ship',
    flagged: true,
    // Offshore approach from the south-south-east, staying in open water all the way to
    // the loss position (previous coordinates started over the Kerala mainland).
    track: [
      { t: T(54), lat: 9.15, lng: 75.98, course: 349, speed: 7 },
      { t: T(48), lat: 9.45, lng: 75.92, course: 347, speed: 7 },
      { t: T(42), lat: 9.78, lng: 75.83, course: 344, speed: 6 },
      { t: T(36), lat: 10.12, lng: 75.72, course: 342, speed: 0 },
      { t: T(30), lat: 10.12, lng: 75.72, course: 342, speed: 0 },
    ],
  },
]

export const PLACE_LABELS = [
  { name: 'Kochi', lat: 9.93, lng: 76.27 },
  { name: 'Kerala Coast', lat: 10.55, lng: 75.72 },
  { name: 'Arabian Sea', lat: 11.15, lng: 74.55 },
]
