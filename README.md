# Geo-Audioguide (Prototyp)

React-+-TypeScript-Prototyp eines standortbasierten Audioguides: Die App zeigt
eine OpenStreetMap-Karte, verfolgt nach Freigabe die Position des Nutzers und
spielt automatisch die MP3 ab, die dem betretenen Geofence zugeordnet ist.

**Testregion:** Gotthard-Müller-Straße, 70794 Filderstadt-Bernhausen
(Kartenmittelpunkt 48.6751 / 9.2091).

## Funktionsumfang

- **OpenStreetMap-Karte** über Leaflet / react-leaflet (keine API-Keys nötig).
- **Eigene Position** inkl. Genauigkeitsradius, laufend aktualisiert über
  `navigator.geolocation.watchPosition`.
- **Geofences aus GeoJSON** (`public/geofences.geojson`):
  - `Point` + `properties.radius` (Meter) → Kreis-Geofence
  - `Polygon` (inkl. Löcher) → Flächen-Geofence
  - Nicht unterstützte oder unvollständige Features werden übersprungen und als
    Hinweis im UI angezeigt.
- **Automatische Wiedergabe** beim Betreten eines Geofence; mehrere gleichzeitig
  betretene Geofences werden nacheinander abgespielt (Warteschlange).
- **Kein wiederholtes Auslösen**, solange sich der Nutzer im Geofence befindet.
  Erst nach dem Verlassen ist der Geofence wieder „scharf“. Eine Hysterese von
  10 m verhindert Flattern durch GPS-Rauschen am Rand.
- **Visualisierung**: aktive Geofences werden kräftig und gefüllt gezeichnet,
  inaktive gestrichelt und transparent.
- **Statusoberfläche**: GPS-Status, Position, Genauigkeit, aktive Geofences,
  Abstand zu allen Geofences, laufende und zuletzt ausgelöste Audiodatei sowie
  ein Verlauf der Ein-/Austritte.
- **Simulationsmodus** zum Testen am Schreibtisch: Position per Klick auf die
  Karte setzen, ohne echtes GPS.

## Schnellstart

```bash
npm install
npm run dev      # http://localhost:5173
```

Weitere Skripte:

| Skript | Zweck |
| --- | --- |
| `npm run build` | Typprüfung (`tsc -b`) und Produktionsbuild |
| `npm run preview` | Produktionsbuild lokal servieren |
| `npm run lint` | oxlint |
| `npm run audio:placeholders` | stumme Platzhalter-MP3s neu erzeugen |

**Hinweis zu Browsern:** Die Geolocation-API funktioniert nur über `https://`
oder `http://localhost`. Für einen Test auf dem Smartphone im lokalen Netz
daher `npm run dev -- --host` mit HTTPS-Tunnel verwenden oder den Build auf
einen Server mit TLS legen.

**Hinweis zum Audio:** Browser blockieren automatische Wiedergabe ohne
Nutzerinteraktion. Der Klick auf „Standort freigeben“ (bzw. „Audio aktivieren“)
entsperrt die Wiedergabe – danach startet das Audio beim Geofence-Eintritt
selbstständig.

## Geofences pflegen

`public/geofences.geojson` ist eine normale GeoJSON-FeatureCollection:

```jsonc
{
  "type": "Feature",
  "properties": {
    "id": "station-1",              // optional, sonst automatisch
    "name": "Gotthard-Müller-Straße West",
    "description": "Startpunkt des Rundgangs.",
    "audio": "audio/station-1.mp3", // Pfad relativ zur Basis-URL oder absolute URL
    "radius": 60,                   // nur bei Point: Radius in Metern
    "color": "#d9534f"              // optional, Darstellung auf der Karte
  },
  "geometry": { "type": "Point", "coordinates": [9.2055, 48.67525] }
}
```

Enthalten sind drei Punkt-Geofences (Gotthard-Müller-Straße West/Ost,
Bernhausen Ortsmitte) und ein Polygon-Geofence („Testzone Nord“) nördlich der
Gotthard-Müller-Straße. Die Datei wird zur Laufzeit geladen – „Geofences neu
laden“ im UI genügt nach einer Änderung, kein Neustart nötig.

## Audiodateien

Unter `public/audio/` liegen **stumme Platzhalter-MP3s** (~0,5 s), damit der
Prototyp ohne echte Aufnahmen vollständig durchläuft. Dateien unter einer
Sekunde erkennt die App als Platzhalter und liest stattdessen Name und
Beschreibung des Geofence über die Sprachausgabe des Browsers vor – so ist die
Auslösung hörbar. Echte MP3s einfach unter gleichem Namen ablegen; sie werden
dann ganz normal abgespielt. Details: `public/audio/README.md`.

## Aufbau

```
src/
  lib/geometry.ts        Haversine, Punkt-in-Polygon, Abstand zum Polygonrand
  lib/geofences.ts       GeoJSON laden, validieren, in Geofence-Modelle wandeln
  lib/audioGuide.ts      Wiedergabe, Warteschlange, Autoplay-Freigabe, Fallback
  hooks/useGeolocation   watchPosition-Wrapper inkl. Simulationsmodus
  hooks/useGeofenceEngine Auswertung pro Positionsupdate, Enter-/Exit-Events
  hooks/useAudioGuide    React-Anbindung von lib/audioGuide.ts
  components/MapView     Leaflet-Karte, Geofence-Darstellung, Klick-Simulation
  components/StatusPanel GPS-, Geofence- und Audio-Status
public/
  geofences.geojson      Testdaten
  audio/*.mp3            Platzhalter-Audios
```

### Wie die Auslöselogik arbeitet

Bei jedem Positionsupdate berechnet `useGeofenceEngine` für jeden Geofence den
vorzeichenbehafteten Abstand zur Grenze (negativ = innerhalb). Ein Geofence
wird **aktiv**, sobald die Position strikt innerhalb liegt, und **inaktiv**,
sobald sie mehr als 10 m außerhalb liegt. Nur der Übergang inaktiv → aktiv
löst die Wiedergabe aus; das Set der aktiven Geofences liegt in einer Ref, ist
also unabhängig von Render-Zyklen.

## Bekannte Grenzen des Prototyps

- Kein `MultiPolygon`/`LineString`-Support (wird als Hinweis gemeldet).
- Die GPS-Genauigkeit fließt nicht in die Auslöseentscheidung ein; bei großen
  Genauigkeitsradien kann es zu frühen Auslösungen kommen.
- Kein Hintergrundbetrieb: Die Auswertung läuft nur, solange die Seite im
  Vordergrund geöffnet ist.
- Keine Persistenz (bereits gehörte Stationen werden nicht gespeichert).
