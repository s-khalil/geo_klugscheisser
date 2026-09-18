import type { AudioGuideApi } from '../hooks/useAudioGuide';
import type { Geofence } from '../lib/geofences';

interface PlayerPanelProps {
  audio: AudioGuideApi;
  /** Die gerade laufende Station, für Transkript und Quellen. */
  station: Geofence | null;
}

/**
 * Wiedergabe-Oberfläche: Transkript mit hervorgehobenem Satz, Steuerung und
 * Quellenangaben. Das Transkript ist kein Extra – es macht die Station auch
 * dort nutzbar, wo Zuhören nicht geht.
 */
export function PlayerPanel({ audio, station }: PlayerPanelProps) {
  const current = audio.current;

  if (!current) return null;

  const isSpeech = current.mode === 'tts';
  const progress = isSpeech
    ? `Satz ${current.sentenceIndex + 1} von ${current.sentences.length}`
    : 'Audiodatei';

  return (
    <section className="card card--player">
      <h2>Läuft gerade</h2>
      <p className="player__title">
        <strong>{current.name}</strong>
        <span className="muted"> · {progress}</span>
      </p>

      <div className="player__controls">
        <button
          type="button"
          className="button"
          onClick={audio.previous}
          disabled={!isSpeech || current.sentenceIndex === 0}
          aria-label="Vorheriger Satz"
        >
          ◀◀
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={current.paused ? audio.resume : audio.pause}
        >
          {current.paused ? 'Weiter' : 'Pause'}
        </button>
        <button
          type="button"
          className="button"
          onClick={audio.next}
          disabled={!isSpeech || current.sentenceIndex >= current.sentences.length - 1}
          aria-label="Nächster Satz"
        >
          ▶▶
        </button>
        <button type="button" className="button" onClick={audio.stop}>
          Stopp
        </button>
      </div>

      {isSpeech ? (
        <ol className="transcript">
          {current.sentences.map((sentence, index) => (
            <li
              key={`${current.id}-${index}`}
              className={index === current.sentenceIndex ? 'transcript__line transcript__line--active' : 'transcript__line'}
            >
              {sentence}
            </li>
          ))}
        </ol>
      ) : null}

      {station && station.sources.length > 0 ? (
        <details className="sources">
          <summary>Quellen ({station.sources.length})</summary>
          <ul className="list list--compact">
            {station.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer noopener">
                  {source.title}
                </a>
                {source.retrieved ? <span className="muted"> · abgerufen {source.retrieved}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
