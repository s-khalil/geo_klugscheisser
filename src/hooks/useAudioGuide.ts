import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioGuide, type AudioGuideSnapshot } from '../lib/audioGuide';
import type { Geofence } from '../lib/geofences';

const EMPTY_SNAPSHOT: AudioGuideSnapshot = {
  current: null,
  lastPlayed: null,
  queue: [],
  unlocked: false,
  error: null,
};

export interface AudioGuideApi extends AudioGuideSnapshot {
  unlock: () => Promise<void>;
  /** Station beim Betreten eines Geofence einreihen. */
  play: (geofence: Geofence) => void;
  /** Station sofort starten (Antippen auf der Karte). */
  playNow: (geofence: Geofence) => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  previous: () => void;
  stop: () => void;
}

export function useAudioGuide(): AudioGuideApi {
  const [snapshot, setSnapshot] = useState<AudioGuideSnapshot>(EMPTY_SNAPSHOT);
  const guideRef = useRef<AudioGuide | null>(null);

  useEffect(() => {
    const guide = new AudioGuide(setSnapshot);
    guideRef.current = guide;

    return () => {
      guide.dispose();
      guideRef.current = null;
    };
  }, []);

  const unlock = useCallback(async () => {
    await guideRef.current?.unlock();
  }, []);

  const play = useCallback((geofence: Geofence) => {
    guideRef.current?.enqueue(geofence);
  }, []);

  const playNow = useCallback((geofence: Geofence) => {
    guideRef.current?.playNow(geofence);
  }, []);

  const pause = useCallback(() => guideRef.current?.pause(), []);
  const resume = useCallback(() => guideRef.current?.resume(), []);
  const next = useCallback(() => guideRef.current?.next(), []);
  const previous = useCallback(() => guideRef.current?.previous(), []);
  const stop = useCallback(() => guideRef.current?.stop(), []);

  return useMemo(
    () => ({ ...snapshot, unlock, play, playNow, pause, resume, next, previous, stop }),
    [snapshot, unlock, play, playNow, pause, resume, next, previous, stop],
  );
}
