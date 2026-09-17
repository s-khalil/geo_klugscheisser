import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng } from '../lib/geometry';

export interface GeoPosition extends LatLng {
  /** Genauigkeit in Metern, wie vom Browser gemeldet. */
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
  source: 'gps' | 'simulation';
}

export type GeoStatus = 'idle' | 'requesting' | 'watching' | 'denied' | 'error' | 'unsupported';

export interface GeolocationState {
  status: GeoStatus;
  position: GeoPosition | null;
  error: string | null;
  start: () => void;
  stop: () => void;
  /** Setzt eine simulierte Position (Klick auf die Karte im Simulationsmodus). */
  setSimulatedPosition: (position: LatLng) => void;
}

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15_000,
};

function describeError(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Zugriff auf den Standort wurde abgelehnt.';
    case error.POSITION_UNAVAILABLE:
      return 'Standort ist derzeit nicht verfügbar.';
    case error.TIMEOUT:
      return 'Zeitüberschreitung bei der Standortbestimmung.';
    default:
      return error.message || 'Unbekannter Fehler bei der Standortbestimmung.';
  }
}

export function useGeolocation(): GeolocationState {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setStatus('idle');
  }, []);

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      setError('Dieser Browser unterstützt die Geolocation-API nicht.');
      return;
    }

    if (watchIdRef.current !== null) return;

    setStatus('requesting');
    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus('watching');
        setError(null);
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
          source: 'gps',
        });
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
        setError(describeError(err));
      },
      GEOLOCATION_OPTIONS,
    );
  }, []);

  const setSimulatedPosition = useCallback((next: LatLng) => {
    setPosition({
      ...next,
      accuracy: 5,
      heading: null,
      speed: null,
      timestamp: Date.now(),
      source: 'simulation',
    });
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  return { status, position, error, start, stop, setSimulatedPosition };
}
