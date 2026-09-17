import { useCallback, useEffect, useState } from 'react';
import { MapView } from './components/MapView';
import { StatusPanel } from './components/StatusPanel';
import { useAudioGuide } from './hooks/useAudioGuide';
import { useGeofenceEngine } from './hooks/useGeofenceEngine';
import { useGeolocation } from './hooks/useGeolocation';
import { loadGeofences, type Geofence } from './lib/geofences';
import type { LatLng } from './lib/geometry';

/** Testregion: Gotthard-Müller-Straße, 70794 Filderstadt-Bernhausen. */
const DEFAULT_CENTER: LatLng = { lat: 48.6751, lng: 9.2091 };
const DEFAULT_ZOOM = 16;
const GEOJSON_URL = `${import.meta.env.BASE_URL}geofences.geojson`;

export default function App() {
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [followPosition, setFollowPosition] = useState(true);
  const [simulationMode, setSimulationMode] = useState(false);

  const geo = useGeolocation();
  const audio = useAudioGuide();

  const { evaluations, activeIds, history } = useGeofenceEngine({
    position: geo.position,
    geofences,
    onEnter: audio.play,
  });

  const reloadGeofences = useCallback(() => {
    loadGeofences(GEOJSON_URL)
      .then((result) => {
        setGeofences(result.geofences);
        setWarnings(result.warnings);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : String(error));
      });
  }, []);

  useEffect(reloadGeofences, [reloadGeofences]);

  const startTracking = useCallback(async () => {
    // Das Entsperren muss in der Nutzergeste passieren, sonst blockiert der
    // Browser die automatische Wiedergabe beim Betreten eines Geofence.
    await audio.unlock();
    setSimulationMode(false);
    geo.start();
  }, [audio, geo]);

  const toggleSimulation = useCallback(async () => {
    const next = !simulationMode;
    setSimulationMode(next);

    if (next) {
      await audio.unlock();
      geo.stop();
      if (!geo.position) geo.setSimulatedPosition(DEFAULT_CENTER);
    }
  }, [simulationMode, audio, geo]);

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar__header">
          <h1>Geo-Audioguide</h1>
          <p className="muted">
            Prototyp · Testregion Gotthard-Müller-Straße, 70794 Filderstadt
          </p>
        </header>

        <div className="controls">
          <button type="button" className="button button--primary" onClick={startTracking}>
            Standort freigeben
          </button>
          <button
            type="button"
            className="button"
            onClick={geo.stop}
            disabled={geo.status !== 'watching' && geo.status !== 'requesting'}
          >
            Tracking stoppen
          </button>
          <button type="button" className="button" onClick={audio.unlock} disabled={audio.unlocked}>
            Audio aktivieren
          </button>
          <button
            type="button"
            className="button"
            onClick={audio.stop}
            disabled={!audio.current && audio.queue.length === 0}
          >
            Wiedergabe stoppen
          </button>
          <button type="button" className="button" onClick={reloadGeofences}>
            Geofences neu laden
          </button>
        </div>

        <div className="toggles">
          <label className="toggle">
            <input
              type="checkbox"
              checked={followPosition}
              onChange={(event) => setFollowPosition(event.target.checked)}
            />
            Karte folgt Position
          </label>
          <label className="toggle">
            <input type="checkbox" checked={simulationMode} onChange={toggleSimulation} />
            Simulationsmodus (Position per Klick auf die Karte)
          </label>
        </div>

        {loadError ? <p className="message message--error">{loadError}</p> : null}

        <StatusPanel
          gpsStatus={geo.status}
          position={geo.position}
          gpsError={geo.error}
          evaluations={evaluations}
          activeIds={activeIds}
          audio={audio}
          history={history}
          warnings={warnings}
        />
      </aside>

      <main className="map-area">
        <MapView
          center={geo.position ?? DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          position={geo.position}
          geofences={geofences}
          activeIds={activeIds}
          followPosition={followPosition}
          simulationMode={simulationMode}
          onSimulatedClick={geo.setSimulatedPosition}
        />
        {simulationMode ? (
          <div className="map-hint">Simulationsmodus: Klick auf die Karte setzt die Position.</div>
        ) : null}
      </main>
    </div>
  );
}
