# Audiodateien

Die MP3s in diesem Ordner sind **stumme Platzhalter** (ca. 0,5 s), erzeugt mit:

```bash
npm run audio:placeholders
```

Sie existieren nur, damit die Wiedergabekette des Prototyps ohne echte
Aufnahmen vollständig durchläuft. Weil sie kürzer als eine Sekunde sind,
erkennt die App sie als Platzhalter und liest stattdessen Name und
Beschreibung des Geofence über die Sprachausgabe des Browsers vor.

Für echte Inhalte einfach die Dateien mit gleichem Namen überschreiben
(oder `properties.audio` in `public/geofences.geojson` anpassen) – Dateien
ab einer Sekunde Länge werden normal abgespielt.
