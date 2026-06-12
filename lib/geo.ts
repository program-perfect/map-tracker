import type { Direction, LatLng } from "./types"

// Saint Petersburg center
export const SPB_CENTER: LatLng = [59.9386, 30.3141]

const DIRECTION_BEARING: Record<Direction, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
}

const EARTH_RADIUS = 6378137 // meters

// Move a lat/lng point by `distance` meters along a `bearing` (degrees)
export function moveByDistance(
  [lat, lng]: LatLng,
  distanceMeters: number,
  bearingDeg: number,
): LatLng {
  const bearing = (bearingDeg * Math.PI) / 180
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180
  const angular = distanceMeters / EARTH_RADIUS

  const newLat = Math.asin(
    Math.sin(latRad) * Math.cos(angular) +
      Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing),
  )
  const newLng =
    lngRad +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
      Math.cos(angular) - Math.sin(latRad) * Math.sin(newLat),
    )

  return [(newLat * 180) / Math.PI, (newLng * 180) / Math.PI]
}

export function bearingFromDirection(d: Direction): number {
  return DIRECTION_BEARING[d]
}

export function distanceMeters([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Meters-per-pixel at a given latitude and Yandex/Web-Mercator zoom level
export function metersPerPixel(lat: number, zoom: number): number {
  return (
    (Math.cos((lat * Math.PI) / 180) * 2 * Math.PI * EARTH_RADIUS) /
    (256 * Math.pow(2, zoom))
  )
}

// A looping route through central Saint Petersburg streets for the simulation.
export const SPB_ROUTE: LatLng[] = [
  [59.9343, 30.3351], // Nevsky Prospekt
  [59.9357, 30.3256],
  [59.9375, 30.3165],
  [59.9398, 30.3088],
  [59.9421, 30.302], // Dvortsovaya
  [59.9457, 30.3009],
  [59.9489, 30.3081],
  [59.9501, 30.3185],
  [59.9486, 30.3289],
  [59.9451, 30.3344],
  [59.9412, 30.3372],
  [59.9377, 30.3399], // Ploshchad Vosstaniya
  [59.9343, 30.3351],
]

export function formatScale(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000
    return `${km % 1 === 0 ? km : km.toFixed(km < 10 ? 1 : 0)} км`
  }
  return `${Math.round(meters)} м`
}

// Choose a "nice" round scale-bar length close to the target pixel width
export function niceScaleLength(mpp: number, targetPx = 80): { meters: number; px: number } {
  const targetMeters = mpp * targetPx
  const pow = Math.pow(10, Math.floor(Math.log10(targetMeters)))
  const candidates = [1, 2, 5, 10].map((m) => m * pow)
  let best = candidates[0]
  for (const c of candidates) {
    if (Math.abs(c - targetMeters) < Math.abs(best - targetMeters)) best = c
  }
  return { meters: best, px: best / mpp }
}
