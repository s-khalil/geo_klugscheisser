/**
 * Zerlegt einen Sprechtext in Sätze.
 *
 * Grund: `speechSynthesis.pause()` ist auf Android Chrome unzuverlässig.
 * Wird Satz für Satz gesprochen, lässt sich "Pause" als Abbruch mit
 * gemerktem Satzindex umsetzen – und nebenbei entstehen Fortschritts-
 * anzeige, Sprungmarken und ein mitlaufendes Transkript.
 */

/** Abkürzungen, nach deren Punkt kein Satz endet. */
const ABBREVIATIONS = new Set([
  'z', 'b', 'bzw', 'ca', 'd', 'h', 'ggf', 'inkl', 'usw', 'u', 'a', 'vgl',
  'nr', 'dr', 'prof', 'st', 'mio', 'mrd', 'jh', 'evtl', 'bspw', 'etc',
]);

function endsWithAbbreviation(text: string): boolean {
  const match = /([A-Za-zÄÖÜäöüß]+)\.$/.exec(text.trimEnd());
  return match ? ABBREVIATIONS.has(match[1].toLowerCase()) : false;
}

/** Ein Punkt direkt hinter einer Ziffer ist meist ein Datum ("4. September"). */
function endsWithOrdinal(text: string): boolean {
  return /\d\.$/.test(text.trimEnd());
}

export function splitIntoSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized === '') return [];

  const sentences: string[] = [];
  let current = '';

  // Kandidaten: Satzzeichen, gefolgt von Leerzeichen und Großbuchstabe.
  const parts = normalized.split(/(?<=[.!?])\s+(?=[„"'(]?[A-ZÄÖÜ0-9])/);

  for (const part of parts) {
    current = current === '' ? part : `${current} ${part}`;

    if (endsWithAbbreviation(current) || endsWithOrdinal(current)) continue;

    sentences.push(current);
    current = '';
  }

  if (current !== '') sentences.push(current);

  return sentences;
}

/** Grobe Schätzung der Sprechdauer: 150 Wörter pro Minute. */
export function estimateSpeechSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((words / 150) * 60);
}
