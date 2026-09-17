import type { AudioGuideApi } from '../hooks/useAudioGuide';
import type { GeoPosition, GeoStatus } from '../hooks/useGeolocation';
import type { GeofenceEvaluation, GeofenceTransition } from '../hooks/useGeofenceEngine';

interface StatusPanelProps {
  gpsStatus: GeoStatus;
  position: GeoPosition | null;
  gpsError: string | null;
  evaluations: GeofenceEvaluation[];
  activeIds: string[];
  audio: AudioGuideApi;
  history: GeofenceTransition[];
  warnings: string[];
}

const GPS_LABEL: Record<GeoStatus, string> = {
  idle: 'Nicht aktiv',
  requesting: 'Standort wird angefragt …',
  watching: 'Standort wird verfolgt',
  denied: 'Freigabe abgelehnt',
  error: 'Fehler',
  unsupported: 'Nicht unterstützt',
};

const GPS_TONE: Record<GeoStatus, string> = {
  idle: 'neutral',
  requesting: 'pending',
  watching: 'ok',
  denied: 'error',
  error: 'error',
  unsupported: 'error',
};

function formatDistance(meters: number): string {
  const absolute = Math.abs(meters);
  if (absolute < 1000) return `${Math.round(absolute)} m`;
  return `${(absolute / 1000).toFixed(2)} km`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('de-DE');
}

export function StatusPanel({
  gpsStatus,
  position,
  gpsError,
  evaluations,
  activeIds,
  audio,
  history,
  warnings,
}: StatusPanelProps) {
  const activeSet = new Set(activeIds);
  const activeEvaluations = evaluations.filter((item) => activeSet.has(item.geofence.id));

  return (
    <div className="panel">
      <section className="card">
        <h2>GPS-Status</h2>
        <p>
          <span className={`badge badge--${GPS_TONE[gpsStatus]}`}>{GPS_LABEL[gpsStatus]}</span>
          {position?.source === 'simulation' ? (
            <span className="badge badge--pending">Simulation</span>
          ) : null}
        </p>

        {position ? (
          <dl className="details">
            <dt>Position</dt>
            <dd>
              {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
            </dd>
            <dt>Genauigkeit</dt>
            <dd>± {formatDistance(position.accuracy)}</dd>
            <dt>Letztes Update</dt>
            <dd>{formatTime(position.timestamp)}</dd>
            {position.speed !== null ? (
              <>
                <dt>Geschwindigkeit</dt>
                <dd>{(position.speed * 3.6).toFixed(1)} km/h</dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="muted">Noch keine Position empfangen.</p>
        )}

        {gpsError ? <p className="message message--error">{gpsError}</p> : null}
      </section>

      <section className="card">
        <h2>Aktive Geofences</h2>
        {activeEvaluations.length === 0 ? (
          <p className="muted">Aktuell befindest du dich in keinem Geofence.</p>
        ) : (
          <ul className="list">
            {activeEvaluations.map(({ geofence, signedDistance }) => (
              <li key={geofence.id} className="list__item">
                <span className="dot" style={{ background: geofence.color }} />
                <div>
                  <strong>{geofence.name}</strong>
                  {geofence.description ? (
                    <div className="muted">{geofence.description}</div>
                  ) : null}
                  <div className="muted">
                    {geofence.kind === 'circle' ? 'Punkt-Geofence' : 'Polygon-Geofence'} ·{' '}
                    {formatDistance(signedDistance)} bis zum Rand
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Audio</h2>
        {audio.current ? (
          <p>
            <span className="badge badge--ok">{audio.speaking ? 'Sprachausgabe' : 'Spielt'}</span>{' '}
            {audio.current.name}
            <br />
            <code className="muted">{audio.current.audioUrl.split('/').pop()}</code>
          </p>
        ) : (
          <p className="muted">Keine Wiedergabe aktiv.</p>
        )}

        {audio.queue.length > 0 ? (
          <p className="muted">In Warteschlange: {audio.queue.map((t) => t.name).join(', ')}</p>
        ) : null}

        <dl className="details">
          <dt>Zuletzt ausgelöst</dt>
          <dd>
            {audio.lastPlayed ? (
              <>
                {audio.lastPlayed.name} ·{' '}
                <code>{audio.lastPlayed.audioUrl.split('/').pop()}</code>
                <div className="muted">
                  {formatTime(audio.lastPlayed.finishedAt)}
                  {audio.lastPlayed.viaSpeech ? ' · über Sprachausgabe (Platzhalter-MP3)' : ''}
                </div>
              </>
            ) : (
              <span className="muted">noch nichts abgespielt</span>
            )}
          </dd>
        </dl>

        {!audio.unlocked ? (
          <p className="message message--warn">
            Audio ist noch nicht freigegeben – bitte „Standort freigeben“ oder „Audio aktivieren“
            klicken, sonst blockiert der Browser die automatische Wiedergabe.
          </p>
        ) : null}

        {audio.error ? <p className="message message--warn">{audio.error}</p> : null}
      </section>

      <section className="card">
        <h2>Geofences in der Nähe</h2>
        {evaluations.length === 0 ? (
          <p className="muted">Keine Auswertung – es liegt noch keine Position vor.</p>
        ) : (
          <ul className="list">
            {evaluations.map(({ geofence, inside, signedDistance }) => (
              <li key={geofence.id} className="list__item">
                <span className="dot" style={{ background: geofence.color }} />
                <div>
                  <strong>{geofence.name}</strong>
                  <div className="muted">
                    {inside ? 'innerhalb' : `${formatDistance(signedDistance)} entfernt`} ·{' '}
                    {geofence.kind === 'circle'
                      ? `Radius ${geofence.radiusMeters} m`
                      : 'Polygon'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 ? (
        <section className="card">
          <h2>Verlauf</h2>
          <ul className="list list--compact">
            {history.map((entry) => (
              <li key={`${entry.geofence.id}-${entry.type}-${entry.at}`}>
                <span className={`badge badge--${entry.type === 'enter' ? 'ok' : 'neutral'}`}>
                  {entry.type === 'enter' ? 'betreten' : 'verlassen'}
                </span>{' '}
                {entry.geofence.name} <span className="muted">({formatTime(entry.at)})</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {warnings.length > 0 ? (
        <section className="card">
          <h2>Hinweise zur GeoJSON</h2>
          <ul className="list list--compact">
            {warnings.map((warning) => (
              <li key={warning} className="message message--warn">
                {warning}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
