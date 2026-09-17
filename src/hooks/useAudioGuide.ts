import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioGuide, type AudioGuideSnapshot } from '../lib/audioGuide';
import type { Geofence } from '../lib/geofences';

const EMPTY_SNAPSHOT: AudioGuideSnapshot = {
  current: null,
  lastPlayed: null,
  queue: [],
  unlocked: false,
  speaking: false,
  error: null,
};

export interface AudioGuideApi extends AudioGuideSnapshot {
  unlock: () => Promise<void>;
  play: (geofence: Geofence) => void;
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

  const stop = useCallback(() => {
    guideRef.current?.stop();
  }, []);

  return useMemo(() => ({ ...snapshot, unlock, play, stop }), [snapshot, unlock, play, stop]);
}
