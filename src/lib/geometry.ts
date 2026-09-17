/**
 * Geometrische Hilfsfunktionen für Geofencing.
 *
 * Alle Funktionen rechnen auf WGS84-Koordinaten. Für die kurzen Distanzen,
 * die in einem Audioguide relevant sind (< einige km), ist eine lokale
 * äquidistante Projektion genau genug und deutlich billiger als echte
 * geodätische Verfahren.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Ein Polygonring: erste Ring = Außenkontur, weitere Ringe = Löcher. */
export type Ring = LatLng[];

const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Distanz zweier Punkte in Metern (Haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

interface PlanarPoint {
  x: number;
  y: number;
}

/** Projiziert lat/lng auf ein lokales Meter-Koordinatensystem um `origin`. */
function project(point: LatLng, origin: LatLng): PlanarPoint {
  return {
    x: toRad(point.lng - origin.lng) * Math.cos(toRad(origin.lat)) * EARTH_RADIUS_M,
    y: toRad(point.lat - origin.lat) * EARTH_RADIUS_M,
  };
}

/**
 * Punkt-in-Ring-Test (Ray Casting) auf lng/lat-Ebene.
 * Für Ringe in Stadtgröße ist die Verzerrung durch die Kugelgeometrie
 * irrelevant, da der Test topologisch und nicht metrisch ist.
 */
export function pointInRing(point: LatLng, ring: Ring): boolean {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat;
    const xi = ring[i].lng;
    const yj = ring[j].lat;
    const xj = ring[j].lng;

    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

/** Punkt-in-Polygon inklusive Löcher (Ring 0 außen, alle weiteren Löcher). */
export function pointInPolygon(point: LatLng, rings: Ring[]): boolean {
  if (rings.length === 0) return false;
  if (!pointInRing(point, rings[0])) return false;

  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(point, rings[i])) return false;
  }

  return true;
}

/** Kürzester Abstand eines Punktes zur Strecke a–b, in Metern. */
export function distanceToSegmentMeters(point: LatLng, a: LatLng, b: LatLng): number {
  const p = project(point, point);
  const pa = project(a, point);
  const pb = project(b, point);

  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) return Math.hypot(p.x - pa.x, p.y - pa.y);

  const t = Math.max(
    0,
    Math.min(1, ((p.x - pa.x) * dx + (p.y - pa.y) * dy) / lengthSquared),
  );

  return Math.hypot(p.x - (pa.x + t * dx), p.y - (pa.y + t * dy));
}

/** Kürzester Abstand zum Polygonrand (immer positiv), in Metern. */
export function distanceToPolygonBoundaryMeters(point: LatLng, rings: Ring[]): number {
  let best = Number.POSITIVE_INFINITY;

  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      best = Math.min(best, distanceToSegmentMeters(point, ring[j], ring[i]));
    }
  }

  return best;
}

/**
 * Vorzeichenbehafteter Abstand zum Polygonrand: negativ innerhalb,
 * positiv außerhalb. Wird für die Hysterese beim Verlassen genutzt.
 */
export function signedDistanceToPolygonMeters(point: LatLng, rings: Ring[]): number {
  const distance = distanceToPolygonBoundaryMeters(point, rings);
  return pointInPolygon(point, rings) ? -distance : distance;
}

/** Schwerpunkt (arithmetisches Mittel) eines Rings – reicht als Label-Anker. */
export function ringCentroid(ring: Ring): LatLng {
  // Ein geschlossener Ring wiederholt den Startpunkt am Ende.
  const points =
    ring.length > 1 &&
    ring[0].lat === ring[ring.length - 1].lat &&
    ring[0].lng === ring[ring.length - 1].lng
      ? ring.slice(0, -1)
      : ring;

  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 },
  );

  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}
