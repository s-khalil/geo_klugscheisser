/**
 * Laden und Validieren der Geofences aus einer GeoJSON-FeatureCollection.
 *
 * Unterstützt werden zunächst:
 *  - Point   + properties.radius (Meter)  -> Kreis-Geofence
 *  - Polygon (inkl. Löcher)               -> Polygon-Geofence
 */

import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';
import {
  distanceMeters,
  pointInPolygon,
  ringCentroid,
  signedDistanceToPolygonMeters,
  type LatLng,
  type Ring,
} from './geometry';

interface GeofenceBase {
  id: string;
  name: string;
  description?: string;
  /** Pfad oder URL der MP3-Datei, die beim Betreten abgespielt wird. */
  audioUrl: string;
  color: string;
}

export interface CircleGeofence extends GeofenceBase {
  kind: 'circle';
  center: LatLng;
  radiusMeters: number;
}

export interface PolygonGeofence extends GeofenceBase {
  kind: 'polygon';
  /** Ring 0 ist die Außenkontur, weitere Ringe sind Löcher. */
  rings: Ring[];
  center: LatLng;
}

export type Geofence = CircleGeofence | PolygonGeofence;

export interface ParseResult {
  geofences: Geofence[];
  /** Nicht unterstützte oder fehlerhafte Features – werden im UI angezeigt. */
  warnings: string[];
}

const DEFAULT_COLOR = '#2d6cdf';

const toLatLng = (position: Position): LatLng => ({
  lng: position[0],
  lat: position[1],
});

const toRing = (positions: Position[]): Ring => positions.map(toLatLng);

/**
 * Relative Audiopfade aus der GeoJSON werden gegen die Basis-URL der Seite
 * aufgelöst, damit der Prototyp auch unter einem Unterpfad funktioniert.
 */
function resolveAudioUrl(raw: string): string {
  if (/^[a-z]+:\/\//i.test(raw) || raw.startsWith('/')) return raw;
  if (typeof document === 'undefined') return raw;
  return new URL(raw, document.baseURI).toString();
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function parseFeature(
  feature: Feature<Geometry | null>,
  index: number,
  warnings: string[],
): Geofence | null {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const label = readString(props.name) ?? `Geofence #${index + 1}`;
  const id = readString(props.id) ?? readString(feature.id as string) ?? `geofence-${index}`;
  const audioUrl = readString(props.audio) ?? readString(props.audioUrl);
  const geometry = feature.geometry;

  if (!geometry) {
    warnings.push(`"${label}": Feature ohne Geometrie – übersprungen.`);
    return null;
  }

  if (!audioUrl) {
    warnings.push(`"${label}": keine Audiodatei in properties.audio – übersprungen.`);
    return null;
  }

  const base: GeofenceBase = {
    id,
    name: label,
    description: readString(props.description),
    audioUrl: resolveAudioUrl(audioUrl),
    color: readString(props.color) ?? DEFAULT_COLOR,
  };

  if (geometry.type === 'Point') {
    const radius = Number(props.radius);

    if (!Number.isFinite(radius) || radius <= 0) {
      warnings.push(
        `"${label}": Point-Geofence ohne gültigen properties.radius (Meter) – übersprungen.`,
      );
      return null;
    }

    return {
      ...base,
      kind: 'circle',
      center: toLatLng(geometry.coordinates),
      radiusMeters: radius,
    };
  }

  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates.map(toRing).filter((ring) => ring.length >= 4);

    if (rings.length === 0) {
      warnings.push(`"${label}": Polygon ohne gültigen Ring – übersprungen.`);
      return null;
    }

    return {
      ...base,
      kind: 'polygon',
      rings,
      center: ringCentroid(rings[0]),
    };
  }

  warnings.push(
    `"${label}": Geometrietyp ${geometry.type} wird noch nicht unterstützt – übersprungen.`,
  );
  return null;
}

export function parseGeofenceCollection(data: unknown): ParseResult {
  const warnings: string[] = [];
  const collection = data as FeatureCollection;

  if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    return { geofences: [], warnings: ['Die Datei ist keine gültige GeoJSON-FeatureCollection.'] };
  }

  const geofences: Geofence[] = [];
  const seenIds = new Set<string>();

  collection.features.forEach((feature, index) => {
    const geofence = parseFeature(feature, index, warnings);
    if (!geofence) return;

    if (seenIds.has(geofence.id)) {
      warnings.push(`"${geofence.name}": doppelte id "${geofence.id}" – übersprungen.`);
      return;
    }

    seenIds.add(geofence.id);
    geofences.push(geofence);
  });

  return { geofences, warnings };
}

export async function loadGeofences(url: string): Promise<ParseResult> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`GeoJSON konnte nicht geladen werden (HTTP ${response.status}).`);
  }

  return parseGeofenceCollection(await response.json());
}

/**
 * Vorzeichenbehafteter Abstand zur Geofence-Grenze in Metern:
 * negativ = innerhalb, positiv = außerhalb.
 */
export function signedDistanceMeters(geofence: Geofence, position: LatLng): number {
  if (geofence.kind === 'circle') {
    return distanceMeters(position, geofence.center) - geofence.radiusMeters;
  }

  return signedDistanceToPolygonMeters(position, geofence.rings);
}

export function isInside(geofence: Geofence, position: LatLng): boolean {
  if (geofence.kind === 'circle') {
    return distanceMeters(position, geofence.center) <= geofence.radiusMeters;
  }

  return pointInPolygon(position, geofence.rings);
}
