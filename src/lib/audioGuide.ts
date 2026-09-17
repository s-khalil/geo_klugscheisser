/**
 * Abspiel-Logik des Audioguides.
 *
 * Ein einzelnes <audio>-Element spielt die Tracks nacheinander ab. Betritt
 * der Nutzer mehrere Geofences kurz hintereinander, werden die Tracks in
 * eine Warteschlange gestellt statt sich gegenseitig abzuschneiden.
 *
 * Fallback: Liegt (noch) keine echte MP3 vor – im Prototyp sind die Dateien
 * unter public/audio/ stumme Platzhalter – oder schlägt das Laden fehl,
 * wird der Text des Geofence über die Sprachausgabe des Browsers ausgegeben,
 * damit die Auslösung hörbar bleibt.
 */

import type { Geofence } from './geofences';

export interface AudioTrack {
  id: string;
  name: string;
  description?: string;
  audioUrl: string;
  startedAt: number;
}

export interface PlayedTrack extends AudioTrack {
  finishedAt: number;
  /** true, wenn statt der MP3 die Sprachausgabe verwendet wurde. */
  viaSpeech: boolean;
}

export interface AudioGuideSnapshot {
  current: AudioTrack | null;
  lastPlayed: PlayedTrack | null;
  queue: AudioTrack[];
  unlocked: boolean;
  speaking: boolean;
  error: string | null;
}

/** 50 ms Stille – entsperrt die Wiedergabe innerhalb einer Nutzergeste. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICA';

/** Dateien unter dieser Länge gelten als Platzhalter ohne echten Inhalt. */
const PLACEHOLDER_MAX_SECONDS = 1;

export class AudioGuide {
  private readonly audio: HTMLAudioElement;
  private readonly emit: () => void;

  private queue: AudioTrack[] = [];
  private current: AudioTrack | null = null;
  private lastPlayed: PlayedTrack | null = null;
  private unlocked = false;
  private speaking = false;
  private error: string | null = null;
  private currentUsedSpeech = false;

  constructor(onChange: (snapshot: AudioGuideSnapshot) => void) {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.emit = () => onChange(this.snapshot());

    this.audio.addEventListener('ended', this.handleEnded);
    this.audio.addEventListener('error', this.handleError);
    this.audio.addEventListener('loadedmetadata', this.handleLoadedMetadata);
  }

  snapshot(): AudioGuideSnapshot {
    return {
      current: this.current,
      lastPlayed: this.lastPlayed,
      queue: [...this.queue],
      unlocked: this.unlocked,
      speaking: this.speaking,
      error: this.error,
    };
  }

  /**
   * Muss innerhalb einer Nutzergeste (Klick) aufgerufen werden, sonst
   * blockieren Browser die automatische Wiedergabe beim Geofence-Eintritt.
   */
  async unlock(): Promise<void> {
    if (this.unlocked) return;

    const previousSrc = this.audio.src;
    try {
      this.audio.muted = true;
      this.audio.src = SILENT_WAV;
      await this.audio.play();
      this.audio.pause();
      this.unlocked = true;
      this.error = null;
    } catch {
      this.error = 'Automatische Wiedergabe ist blockiert. Bitte Audio manuell aktivieren.';
    } finally {
      this.audio.muted = false;
      this.audio.src = previousSrc;
      this.emit();
    }
  }

  /** Stellt den Track eines betretenen Geofence in die Warteschlange. */
  enqueue(geofence: Geofence): void {
    const track: AudioTrack = {
      id: geofence.id,
      name: geofence.name,
      description: geofence.description,
      audioUrl: geofence.audioUrl,
      startedAt: Date.now(),
    };

    const alreadyQueued =
      this.current?.id === geofence.id || this.queue.some((item) => item.id === geofence.id);

    if (alreadyQueued) return;

    this.queue.push(track);
    this.emit();

    if (!this.current) this.playNext();
  }

  /** Bricht den laufenden Track ab und leert die Warteschlange. */
  stop(): void {
    this.queue = [];
    this.cancelSpeech();
    this.audio.pause();
    this.current = null;
    this.emit();
  }

  dispose(): void {
    this.audio.removeEventListener('ended', this.handleEnded);
    this.audio.removeEventListener('error', this.handleError);
    this.audio.removeEventListener('loadedmetadata', this.handleLoadedMetadata);
    this.stop();
  }

  private playNext(): void {
    const next = this.queue.shift();

    if (!next) {
      this.current = null;
      this.emit();
      return;
    }

    this.current = next;
    this.currentUsedSpeech = false;
    this.emit();

    this.audio.src = next.audioUrl;
    this.audio.currentTime = 0;
    void this.audio.play().catch((err: unknown) => {
      this.fallbackToSpeech(err instanceof Error ? err.message : 'Wiedergabe fehlgeschlagen.');
    });
  }

  private finishCurrent(): void {
    if (!this.current) return;

    this.lastPlayed = {
      ...this.current,
      finishedAt: Date.now(),
      viaSpeech: this.currentUsedSpeech,
    };
    this.current = null;
    this.emit();
    this.playNext();
  }

  private handleEnded = (): void => {
    if (this.speaking) return;
    this.finishCurrent();
  };

  private handleError = (): void => {
    this.fallbackToSpeech(`Audiodatei konnte nicht geladen werden: ${this.current?.audioUrl ?? ''}`);
  };

  private handleLoadedMetadata = (): void => {
    const duration = this.audio.duration;
    const isPlaceholder = !Number.isFinite(duration) || duration < PLACEHOLDER_MAX_SECONDS;

    if (this.current && isPlaceholder) {
      this.audio.pause();
      this.fallbackToSpeech(null);
    }
  };

  private fallbackToSpeech(message: string | null): void {
    const track = this.current;
    if (!track || this.speaking) return;

    this.error = message;
    this.currentUsedSpeech = true;

    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

    if (!synth) {
      this.finishCurrent();
      return;
    }

    const text = track.description ? `${track.name}. ${track.description}` : track.name;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.onend = () => {
      this.speaking = false;
      this.finishCurrent();
    };
    utterance.onerror = () => {
      this.speaking = false;
      this.finishCurrent();
    };

    this.speaking = true;
    this.emit();
    synth.cancel();
    synth.speak(utterance);
  }

  private cancelSpeech(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.speaking = false;
  }
}
