import { useEffect, useRef, useState } from 'react';
import type { LatLng } from '../lib/geometry';
import { isInside, signedDistanceMeters, type Geofence } from '../lib/geofences';

export interface GeofenceEvaluation {
  geofence: Geofence;
  inside: boolean;
  /** Negativ = innerhalb, positiv = außerhalb (Meter zur Grenze). */
  signedDistance: number;
}

export interface GeofenceTransition {
  type: 'enter' | 'exit';
  geofence: Geofence;
  at: number;
}

interface EngineOptions {
  position: LatLng | null;
  geofences: Geofence[];
  /**
   * Hysterese in Metern: ein aktiver Geofence gilt erst dann als verlassen,
   * wenn die Position mindestens so weit außerhalb liegt. Das verhindert
   * Flattern (und damit wiederholtes Auslösen) bei GPS-Rauschen am Rand.
   */
  exitBufferMeters?: number;
  onEnter?: (geofence: Geofence) => void;
  onExit?: (geofence: Geofence) => void;
}

export interface EngineState {
  evaluations: GeofenceEvaluation[];
  activeIds: string[];
  history: GeofenceTransition[];
}

const MAX_HISTORY = 20;

/**
 * Wertet bei jeder neuen Position alle Geofences aus und meldet
 * Ein-/Austritte. Solange sich die Position innerhalb eines Geofence
 * befindet, wird `onEnter` genau einmal ausgelöst – erneut erst, nachdem
 * der Geofence (inkl. Hysterese) verlassen wurde.
 */
export function useGeofenceEngine({
  position,
  geofences,
  exitBufferMeters = 10,
  onEnter,
  onExit,
}: EngineOptions): EngineState {
  const [evaluations, setEvaluations] = useState<GeofenceEvaluation[]>([]);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [history, setHistory] = useState<GeofenceTransition[]>([]);

  const activeIdsRef = useRef<Set<string>>(new Set());
  const onEnterRef = useRef(onEnter);
  const onExitRef = useRef(onExit);

  useEffect(() => {
    onEnterRef.current = onEnter;
    onExitRef.current = onExit;
  }, [onEnter, onExit]);

  // Verschwundene Geofences (z. B. nach Neuladen der GeoJSON) aufräumen.
  useEffect(() => {
    const known = new Set(geofences.map((geofence) => geofence.id));
    for (const id of activeIdsRef.current) {
      if (!known.has(id)) activeIdsRef.current.delete(id);
    }
  }, [geofences]);

  useEffect(() => {
    if (!position) {
      // Die Auswertung synchronisiert React mit einer externen Quelle (Geolocation-Watch).
      // oxlint-disable-next-line react/set-state-in-effect
      setEvaluations([]);
      return;
    }

    const now = Date.now();
    const transitions: GeofenceTransition[] = [];
    const nextEvaluations: GeofenceEvaluation[] = [];

    for (const geofence of geofences) {
      const signedDistance = signedDistanceMeters(geofence, position);
      const wasActive = activeIdsRef.current.has(geofence.id);

      // Eintritt: strikt innerhalb. Austritt: erst jenseits der Hysterese.
      const inside = wasActive
        ? signedDistance <= exitBufferMeters
        : isInside(geofence, position);

      if (inside && !wasActive) {
        activeIdsRef.current.add(geofence.id);
        transitions.push({ type: 'enter', geofence, at: now });
        onEnterRef.current?.(geofence);
      } else if (!inside && wasActive) {
        activeIdsRef.current.delete(geofence.id);
        transitions.push({ type: 'exit', geofence, at: now });
        onExitRef.current?.(geofence);
      }

      nextEvaluations.push({ geofence, inside, signedDistance });
    }

    nextEvaluations.sort((a, b) => a.signedDistance - b.signedDistance);
    setEvaluations(nextEvaluations);
    setActiveIds([...activeIdsRef.current]);

    if (transitions.length > 0) {
      setHistory((previous) => [...transitions.reverse(), ...previous].slice(0, MAX_HISTORY));
    }
  }, [position, geofences, exitBufferMeters]);

  return { evaluations, activeIds, history };
}
