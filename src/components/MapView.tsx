import { useEffect, useRef } from 'react';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polygon,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import type { Geofence } from '../lib/geofences';
import type { LatLng } from '../lib/geometry';
import type { GeoPosition } from '../hooks/useGeolocation';

import 'leaflet/dist/leaflet.css';

interface MapViewProps {
  center: LatLng;
  zoom: number;
  position: GeoPosition | null;
  geofences: Geofence[];
  activeIds: string[];
  followPosition: boolean;
  simulationMode: boolean;
  onSimulatedClick: (position: LatLng) => void;
  /** Antippen einer Station startet ihre Geschichte sofort. */
  onSelectGeofence: (geofence: Geofence) => void;
}

const toLatLngExpression = (point: LatLng): LatLngExpression => [point.lat, point.lng];

/** Zentriert die Karte auf die aktuelle Position, solange "Folgen" aktiv ist. */
function FollowPosition({
  position,
  enabled,
}: {
  position: GeoPosition | null;
  enabled: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || !position) return;
    map.setView([position.lat, position.lng], map.getZoom(), { animate: true });
  }, [map, position, enabled]);

  return null;
}

/**
 * Zeigt beim ersten Laden alle Stationen, solange noch keine Position
 * vorliegt – so landet der Nutzer nicht auf einer leeren Karte, egal in
 * welcher Region die Daten liegen.
 */
function FitToGeofences({
  geofences,
  active,
}: {
  geofences: Geofence[];
  active: boolean;
}) {
  const map = useMap();
  const done = useRef(false);

  useEffect(() => {
    if (!active || done.current || geofences.length === 0) return;

    // Liegen mehrere Regionen in den Daten, würde ein gemeinsamer Ausschnitt
    // halb Deutschland zeigen. Also nur die Region der ersten Station.
    const region = geofences[0].region;
    const inRegion = region
      ? geofences.filter((geofence) => geofence.region === region)
      : geofences;

    const points = inRegion.flatMap((geofence) =>
      geofence.kind === 'circle'
        ? [toLatLngExpression(geofence.center)]
        : geofence.rings[0].map(toLatLngExpression),
    );

    map.fitBounds(points as [number, number][], { padding: [40, 40] });
    done.current = true;
  }, [map, geofences, active]);

  return null;
}

/** Im Simulationsmodus setzt ein Klick auf die Karte die Position. */
function SimulationClickHandler({
  enabled,
  onSimulatedClick,
}: {
  enabled: boolean;
  onSimulatedClick: (position: LatLng) => void;
}) {
  useMapEvents({
    click(event) {
      if (!enabled) return;
      onSimulatedClick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });

  return null;
}

function GeofenceShape({
  geofence,
  active,
  onSelect,
}: {
  geofence: Geofence;
  active: boolean;
  onSelect: (geofence: Geofence) => void;
}) {
  const pathOptions = {
    color: geofence.color,
    weight: active ? 4 : 2,
    opacity: active ? 1 : 0.7,
    fillColor: geofence.color,
    fillOpacity: active ? 0.35 : 0.12,
    dashArray: active ? undefined : '4 6',
  };

  const eventHandlers = { click: () => onSelect(geofence) };

  const tooltip = (
    <Tooltip direction="top" sticky>
      <strong>{geofence.name}</strong>
      {geofence.description ? <div>{geofence.description}</div> : null}
      <div>{active ? 'aktiv – Geschichte ausgelöst' : 'Antippen zum Anhören'}</div>
    </Tooltip>
  );

  if (geofence.kind === 'circle') {
    return (
      <Circle
        center={toLatLngExpression(geofence.center)}
        radius={geofence.radiusMeters}
        pathOptions={pathOptions}
        eventHandlers={eventHandlers}
      >
        {tooltip}
      </Circle>
    );
  }

  return (
    <Polygon
      positions={geofence.rings.map((ring) => ring.map(toLatLngExpression))}
      pathOptions={pathOptions}
      eventHandlers={eventHandlers}
    >
      {tooltip}
    </Polygon>
  );
}

export function MapView({
  center,
  zoom,
  position,
  geofences,
  activeIds,
  followPosition,
  simulationMode,
  onSimulatedClick,
  onSelectGeofence,
}: MapViewProps) {
  const activeSet = new Set(activeIds);

  return (
    <MapContainer
      center={toLatLngExpression(center)}
      zoom={zoom}
      scrollWheelZoom
      className="map"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende'
        maxZoom={19}
      />

      {geofences.map((geofence) => (
        <GeofenceShape
          key={geofence.id}
          geofence={geofence}
          active={activeSet.has(geofence.id)}
          onSelect={onSelectGeofence}
        />
      ))}

      {position ? (
        <>
          <Circle
            center={toLatLngExpression(position)}
            radius={Math.max(position.accuracy, 1)}
            pathOptions={{
              color: '#1a73e8',
              weight: 1,
              fillColor: '#1a73e8',
              fillOpacity: 0.12,
            }}
          />
          <CircleMarker
            center={toLatLngExpression(position)}
            radius={8}
            pathOptions={{
              color: '#ffffff',
              weight: 2,
              fillColor: position.source === 'simulation' ? '#e6a020' : '#1a73e8',
              fillOpacity: 1,
            }}
          >
            <Tooltip direction="top">
              {position.source === 'simulation' ? 'Simulierte Position' : 'Deine Position'}
            </Tooltip>
          </CircleMarker>
        </>
      ) : null}

      <FitToGeofences geofences={geofences} active={position === null} />
      <FollowPosition position={position} enabled={followPosition} />
      <SimulationClickHandler enabled={simulationMode} onSimulatedClick={onSimulatedClick} />
    </MapContainer>
  );
}
