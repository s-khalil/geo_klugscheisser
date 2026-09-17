import { useEffect } from 'react';
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

function GeofenceShape({ geofence, active }: { geofence: Geofence; active: boolean }) {
  const pathOptions = {
    color: geofence.color,
    weight: active ? 4 : 2,
    opacity: active ? 1 : 0.7,
    fillColor: geofence.color,
    fillOpacity: active ? 0.35 : 0.12,
    dashArray: active ? undefined : '4 6',
  };

  const tooltip = (
    <Tooltip direction="top" sticky>
      <strong>{geofence.name}</strong>
      {geofence.description ? <div>{geofence.description}</div> : null}
      <div>{active ? 'aktiv – Audio ausgelöst' : 'inaktiv'}</div>
    </Tooltip>
  );

  if (geofence.kind === 'circle') {
    return (
      <Circle
        center={toLatLngExpression(geofence.center)}
        radius={geofence.radiusMeters}
        pathOptions={pathOptions}
      >
        {tooltip}
      </Circle>
    );
  }

  return (
    <Polygon
      positions={geofence.rings.map((ring) => ring.map(toLatLngExpression))}
      pathOptions={pathOptions}
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

      <FollowPosition position={position} enabled={followPosition} />
      <SimulationClickHandler enabled={simulationMode} onSimulatedClick={onSimulatedClick} />
    </MapContainer>
  );
}
