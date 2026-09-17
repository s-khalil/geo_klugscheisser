/**
 * Erzeugt stumme Platzhalter-MP3s für die Geofences aus public/geofences.geojson.
 *
 * Damit lässt sich der Prototyp ohne echte Aufnahmen testen: die Wiedergabe-
 * Kette (Geofence betreten -> Track laden -> abspielen) läuft vollständig durch.
 * Da die Dateien keinen hörbaren Inhalt haben, weicht die App zusätzlich auf die
 * Sprachausgabe des Browsers aus (siehe src/lib/audioGuide.ts).
 *
 * Aufruf: npm run audio:placeholders -- [Sekunden] (Default: 0,5 s)
 * Echte MP3s einfach unter demselben Namen in public/audio/ ablegen.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const geojsonPath = join(projectRoot, 'public', 'geofences.geojson');

// MPEG-1 Layer III, 128 kbit/s, 44,1 kHz, Mono: 26,12 ms pro Frame.
const FRAME_HEADER = [0xff, 0xfb, 0x90, 0x64];
const FRAME_SIZE = 417;
const FRAMES_PER_SECOND = 44100 / 1152;

function silentMp3(seconds) {
  const frameCount = Math.max(1, Math.round(seconds * FRAMES_PER_SECOND));
  const buffer = Buffer.alloc(frameCount * FRAME_SIZE);

  for (let i = 0; i < frameCount; i++) {
    buffer.set(FRAME_HEADER, i * FRAME_SIZE);
  }

  return buffer;
}

const seconds = Number(process.argv[2] ?? 0.5);

if (!Number.isFinite(seconds) || seconds <= 0) {
  console.error(`Ungültige Dauer: ${process.argv[2]}`);
  process.exit(1);
}

const geojson = JSON.parse(await readFile(geojsonPath, 'utf8'));
const audioPaths = new Set(
  geojson.features
    .map((feature) => feature.properties?.audio)
    .filter((value) => typeof value === 'string' && value.endsWith('.mp3')),
);

if (audioPaths.size === 0) {
  console.error('Keine Audiodateien in der GeoJSON gefunden.');
  process.exit(1);
}

const data = silentMp3(seconds);

for (const relativePath of audioPaths) {
  const target = join(projectRoot, 'public', relativePath.replace(/^\//, ''));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
  console.log(`Platzhalter geschrieben: public/${relativePath} (${data.length} Bytes)`);
}
