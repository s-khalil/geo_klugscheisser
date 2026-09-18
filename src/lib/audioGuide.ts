/**
 * Wiedergabe der Stationen.
 *
 * Zwei gleichberechtigte Quellen hinter einer Schnittstelle:
 *  - `tts`: der Sprechtext der Station, Satz für Satz über die
 *    Sprachausgabe des Browsers. Pausieren heißt: laufenden Satz abbrechen
 *    und Satzindex merken; Weiter setzt ab diesem Satz neu an. Das ist der
 *    verlässliche Weg, weil `speechSynthesis.pause()` auf Android Chrome
 *    nicht zuverlässig funktioniert.
 *  - `mp3`: eine vorgerenderte oder eingesprochene Datei über ein
 *    <audio>-Element, das Pausieren und Spulen nativ beherrscht.
 *
 * Liegen beide vor, gewinnt die MP3.
 */

import type { Geofence } from './geofences';
import { splitIntoSentences } from './sentences';

export type PlaybackMode = 'tts' | 'mp3';

export interface PlayingStation {
  id: string;
  name: string;
  mode: PlaybackMode;
  /** Bei 'tts' die Sätze des Sprechtexts, bei 'mp3' leer. */
  sentences: string[];
  sentenceIndex: number;
  paused: boolean;
  audioUrl?: string;
  startedAt: number;
}

export interface PlayedStation {
  id: string;
  name: string;
  mode: PlaybackMode;
  finishedAt: number;
  /** true, wenn die Wiedergabe abgebrochen statt zu Ende gehört wurde. */
  aborted: boolean;
}

export interface AudioGuideSnapshot {
  current: PlayingStation | null;
  lastPlayed: PlayedStation | null;
  queue: { id: string; name: string }[];
  unlocked: boolean;
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

export class AudioGuide {
  private readonly audio: HTMLAudioElement;
  private readonly emit: () => void;

  private queue: Geofence[] = [];
  private current: PlayingStation | null = null;
  private lastPlayed: PlayedStation | null = null;
  private unlocked = false;
  private error: string | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private keepAlive: number | null = null;

  constructor(onChange: (snapshot: AudioGuideSnapshot) => void) {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.emit = () => onChange(this.snapshot());

    this.audio.addEventListener('ended', this.handleAudioEnded);
    this.audio.addEventListener('error', this.handleAudioError);
    this.loadVoice();
  }

  snapshot(): AudioGuideSnapshot {
    return {
      current: this.current ? { ...this.current } : null,
      lastPlayed: this.lastPlayed,
      queue: this.queue.map((geofence) => ({ id: geofence.id, name: geofence.name })),
      unlocked: this.unlocked,
      error: this.error,
    };
  }

  /** Muss in einer Nutzergeste laufen, sonst blockieren Browser die Wiedergabe. */
  async unlock(): Promise<void> {
    if (this.unlocked) return;

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
      this.audio.removeAttribute('src');
    }

    // Die Sprachausgabe braucht ihre eigene Freigabe in derselben Geste,
    // sonst schweigt sie auf iOS beim automatischen Start. Schlägt das fehl,
    // darf es die Standortfreigabe nicht mitreißen – deshalb abgesichert.
    try {
      const synth = this.synth();
      if (synth) {
        const primer = new SpeechSynthesisUtterance(' ');
        primer.volume = 0;
        synth.speak(primer);
        synth.cancel();
      }
    } catch {
      this.error = 'Sprachausgabe konnte nicht vorbereitet werden.';
    }

    this.emit();
  }

  /** Stellt eine Station in die Warteschlange (Geofence betreten). */
  enqueue(geofence: Geofence): void {
    if (this.current?.id === geofence.id) return;
    if (this.queue.some((item) => item.id === geofence.id)) return;

    this.queue.push(geofence);
    this.emit();

    if (!this.current) this.startNext();
  }

  /** Startet eine Station sofort (Antippen auf der Karte). */
  playNow(geofence: Geofence): void {
    this.stopPlayback(true);
    this.queue = this.queue.filter((item) => item.id !== geofence.id);
    this.queue.unshift(geofence);
    this.startNext();
  }

  pause(): void {
    if (!this.current || this.current.paused) return;

    if (this.current.mode === 'mp3') {
      this.audio.pause();
    } else {
      this.synth()?.cancel();
      this.stopKeepAlive();
    }

    this.current.paused = true;
    this.emit();
  }

  resume(): void {
    if (!this.current || !this.current.paused) return;

    this.current.paused = false;
    this.emit();

    if (this.current.mode === 'mp3') {
      void this.audio.play().catch(() => this.failCurrent('Wiedergabe fehlgeschlagen.'));
    } else {
      this.speakFrom(this.current.sentenceIndex);
    }
  }

  /** Nächster Satz (nur bei Sprachausgabe sinnvoll). */
  next(): void {
    this.jump(1);
  }

  previous(): void {
    this.jump(-1);
  }

  private jump(delta: number): void {
    if (!this.current || this.current.mode !== 'tts') return;

    const target = this.current.sentenceIndex + delta;
    if (target < 0 || target >= this.current.sentences.length) return;

    this.current.sentenceIndex = target;
    this.synth()?.cancel();

    if (this.current.paused) {
      this.emit();
      return;
    }

    this.speakFrom(target);
    this.emit();
  }

  /** Bricht ab und leert die Warteschlange. */
  stop(): void {
    this.queue = [];
    this.stopPlayback(true);
    this.emit();
  }

  dispose(): void {
    this.audio.removeEventListener('ended', this.handleAudioEnded);
    this.audio.removeEventListener('error', this.handleAudioError);
    this.stop();
  }

  private synth(): SpeechSynthesis | null {
    return typeof window !== 'undefined' && window.speechSynthesis
      ? window.speechSynthesis
      : null;
  }

  private loadVoice(): void {
    const synth = this.synth();
    if (!synth) return;

    const pick = () => {
      const german = synth.getVoices().filter((voice) => voice.lang.startsWith('de'));
      // Lokale Stimmen starten ohne Netzverzögerung – unterwegs der bessere Weg.
      this.voice = german.find((voice) => voice.localService) ?? german[0] ?? null;
    };

    pick();
    synth.addEventListener?.('voiceschanged', pick);
  }

  private startNext(): void {
    const geofence = this.queue.shift();

    if (!geofence) {
      this.current = null;
      this.emit();
      return;
    }

    const useAudioFile = Boolean(geofence.audioUrl);
    const sentences = useAudioFile ? [] : splitIntoSentences(geofence.text ?? '');

    if (!useAudioFile && sentences.length === 0) {
      this.error = `Station "${geofence.name}" hat weder Audiodatei noch Text.`;
      this.emit();
      this.startNext();
      return;
    }

    this.current = {
      id: geofence.id,
      name: geofence.name,
      mode: useAudioFile ? 'mp3' : 'tts',
      sentences,
      sentenceIndex: 0,
      paused: false,
      audioUrl: geofence.audioUrl,
      startedAt: Date.now(),
    };
    this.error = null;
    this.emit();

    if (useAudioFile) {
      this.audio.src = geofence.audioUrl as string;
      this.audio.currentTime = 0;
      void this.audio.play().catch(() => this.failCurrent('Audiodatei konnte nicht abgespielt werden.'));
    } else {
      this.speakFrom(0);
    }
  }

  private speakFrom(index: number): void {
    const synth = this.synth();
    const station = this.current;

    if (!station) return;

    if (!synth) {
      this.failCurrent('Dieser Browser kann keine Sprachausgabe.');
      return;
    }

    if (index >= station.sentences.length) {
      this.finishCurrent(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(station.sentences[index]);
    utterance.lang = 'de-DE';
    if (this.voice) utterance.voice = this.voice;
    utterance.rate = 0.98;

    utterance.onend = () => {
      // Nach einem Abbruch (Pause, Sprung, Stopp) darf hier nichts mehr laufen.
      if (this.current !== station || station.paused) return;
      if (station.sentenceIndex !== index) return;

      if (index + 1 >= station.sentences.length) {
        this.finishCurrent(false);
        return;
      }

      station.sentenceIndex = index + 1;
      this.emit();
      this.speakFrom(index + 1);
    };

    utterance.onerror = () => {
      if (this.current !== station || station.paused) return;
      this.failCurrent('Sprachausgabe fehlgeschlagen.');
    };

    synth.cancel();
    synth.speak(utterance);
    this.startKeepAlive();
  }

  /**
   * Chrome pausiert die Sprachausgabe nach einigen Sekunden von selbst.
   * Ein regelmäßiges resume() hält sie am Laufen; bei kurzen Sätzen ist das
   * selten nötig, schadet aber nicht.
   */
  private startKeepAlive(): void {
    this.stopKeepAlive();
    const synth = this.synth();
    if (!synth) return;

    this.keepAlive = window.setInterval(() => {
      if (synth.speaking && !synth.paused) synth.resume();
    }, 5000);
  }

  private stopKeepAlive(): void {
    if (this.keepAlive !== null) {
      window.clearInterval(this.keepAlive);
      this.keepAlive = null;
    }
  }

  private stopPlayback(aborted: boolean): void {
    if (!this.current) return;

    this.audio.pause();
    this.synth()?.cancel();
    this.stopKeepAlive();
    this.finishCurrent(aborted, false);
  }

  private finishCurrent(aborted: boolean, continueQueue = true): void {
    if (!this.current) return;

    this.lastPlayed = {
      id: this.current.id,
      name: this.current.name,
      mode: this.current.mode,
      finishedAt: Date.now(),
      aborted,
    };
    this.current = null;
    this.stopKeepAlive();
    this.emit();

    if (continueQueue) this.startNext();
  }

  private failCurrent(message: string): void {
    this.error = message;
    this.finishCurrent(true);
  }

  private handleAudioEnded = (): void => {
    if (this.current?.mode === 'mp3') this.finishCurrent(false);
  };

  private handleAudioError = (): void => {
    if (this.current?.mode === 'mp3') {
      this.failCurrent(`Audiodatei konnte nicht geladen werden: ${this.current.audioUrl ?? ''}`);
    }
  };
}
