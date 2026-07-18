import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Square, Volume2 } from "lucide-react";

type SpeechState = "idle" | "starting" | "speaking";

interface SpeechSnapshot {
  ownerKey: string | null;
  state: SpeechState;
  message: string;
}

const speechListeners = new Set<() => void>();
let speechSnapshot: SpeechSnapshot = { ownerKey: null, state: "idle", message: "Ready to read aloud." };
let speechSequence = 0;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let speechQueue: string[] = [];

const MAX_UTTERANCE_LENGTH = 900;

function subscribeToSpeech(listener: () => void): () => void {
  speechListeners.add(listener);
  return () => speechListeners.delete(listener);
}

function getSpeechSnapshot(): SpeechSnapshot {
  return speechSnapshot;
}

function publishSpeech(next: SpeechSnapshot): void {
  speechSnapshot = next;
  speechListeners.forEach((listener) => listener());
}

function speechIsSupported(): boolean {
  return typeof window !== "undefined"
    && "speechSynthesis" in window
    && "SpeechSynthesisUtterance" in window;
}

/** Prefer Ghanaian English, then nearby English voices, then the browser default. */
function preferredVoice(synthesis: SpeechSynthesis): SpeechSynthesisVoice | undefined {
  const voices = synthesis.getVoices();
  const byLanguage = (language: string) => voices.find((voice) => voice.lang.toLocaleLowerCase() === language);
  return byLanguage("en-gh")
    ?? byLanguage("en-gb")
    ?? byLanguage("en-us")
    ?? voices.find((voice) => voice.lang.toLocaleLowerCase().startsWith("en-"))
    ?? voices[0];
}

/** Keep long handbook narration reliable across Safari, Chrome and OS voices. */
function speechChunks(text: string): string[] {
  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((part) => part.trim()).filter(Boolean) ?? [];
  const chunks: string[] = [];
  let current = "";

  const pushLongSentence = (sentence: string) => {
    let remaining = sentence;
    while (remaining.length > MAX_UTTERANCE_LENGTH) {
      const space = remaining.lastIndexOf(" ", MAX_UTTERANCE_LENGTH);
      const splitAt = space > MAX_UTTERANCE_LENGTH / 2 ? space : MAX_UTTERANCE_LENGTH;
      chunks.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trim();
    }
    current = remaining;
  };

  for (const sentence of sentences.length > 0 ? sentences : [text.trim()]) {
    if (!sentence) continue;
    if (sentence.length > MAX_UTTERANCE_LENGTH) {
      if (current) chunks.push(current);
      current = "";
      pushLongSentence(sentence);
      continue;
    }
    const combined = current ? `${current} ${sentence}` : sentence;
    if (combined.length <= MAX_UTTERANCE_LENGTH) {
      current = combined;
    } else {
      chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function speakNext(
  ownerKey: string,
  sequence: number,
  synthesis: SpeechSynthesis,
  voice: SpeechSynthesisVoice | undefined,
): void {
  if (sequence !== speechSequence || speechSnapshot.ownerKey !== ownerKey) return;
  const text = speechQueue.shift();
  if (!text) {
    activeUtterance = null;
    publishSpeech({ ownerKey, state: "idle", message: "Finished reading." });
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  activeUtterance = utterance;
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-GH";
  utterance.rate = 0.96;
  utterance.pitch = 1;
  utterance.onstart = () => {
    if (sequence !== speechSequence || activeUtterance !== utterance) return;
    publishSpeech({ ownerKey, state: "speaking", message: "Reading aloud now." });
  };
  utterance.onend = () => {
    if (sequence !== speechSequence || activeUtterance !== utterance) return;
    activeUtterance = null;
    speakNext(ownerKey, sequence, synthesis, voice);
  };
  utterance.onerror = (event) => {
    if (sequence !== speechSequence || activeUtterance !== utterance) return;
    activeUtterance = null;
    speechQueue = [];
    const cancelled = event.error === "canceled" || event.error === "interrupted";
    publishSpeech({
      ownerKey,
      state: "idle",
      message: cancelled ? "Reading stopped." : "This browser could not read the guide aloud.",
    });
  };
  synthesis.speak(utterance);
}

function stopSpeech(ownerKey: string, message = "Reading stopped."): void {
  if (!speechIsSupported() || speechSnapshot.ownerKey !== ownerKey) return;
  speechSequence += 1;
  activeUtterance = null;
  speechQueue = [];
  window.speechSynthesis.cancel();
  publishSpeech({ ownerKey, state: "idle", message });
}

function startSpeech(ownerKey: string, text: string): void {
  if (!speechIsSupported() || !text.trim()) return;
  const synthesis = window.speechSynthesis;
  const sequence = ++speechSequence;
  activeUtterance = null;
  speechQueue = speechChunks(text);
  synthesis.cancel();
  const voice = preferredVoice(synthesis);
  publishSpeech({ ownerKey, state: "starting", message: "Starting the reader…" });
  speakNext(ownerKey, sequence, synthesis, voice);
}

function useReadAloud(resetKey: string) {
  const supported = speechIsSupported();
  const snapshot = useSyncExternalStore(subscribeToSpeech, getSpeechSnapshot, getSpeechSnapshot);
  const active = snapshot.ownerKey === resetKey
    ? snapshot
    : { ownerKey: resetKey, state: "idle" as const, message: "Ready to read aloud." };

  useEffect(() => {
    const onPageHide = () => stopSpeech(resetKey);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      stopSpeech(resetKey);
    };
  }, [resetKey]);

  const listen = useCallback((text: string) => {
    if (supported) startSpeech(resetKey, text);
  }, [resetKey, supported]);

  const stop = useCallback(() => {
    if (supported) stopSpeech(resetKey);
  }, [resetKey, supported]);

  return {
    supported,
    state: active.state,
    message: supported ? active.message : "Read aloud is not available in this browser.",
    listen,
    stop,
  };
}

export function ReadAloudControls({
  text,
  label,
  resetKey,
  compact = false,
  className = "",
}: Readonly<{
  text: string;
  label: string;
  resetKey: string;
  compact?: boolean;
  className?: string;
}>) {
  const reader = useReadAloud(resetKey);
  const reading = reader.state === "starting" || reader.state === "speaking";
  const hasText = text.trim().length > 0;
  const buttonSize = compact ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm";

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => reader.listen(text)}
          disabled={!reader.supported || reading || !hasText}
          aria-label={`Listen to ${label}`}
          aria-pressed={reading}
          className={`inline-flex items-center justify-center gap-2 rounded-full bg-green font-semibold text-on-green transition-colors hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-45 ${buttonSize}`}
        >
          <Volume2 size={compact ? 15 : 17} aria-hidden />
          {reading ? "Listening…" : "Listen"}
        </button>
        <button
          type="button"
          onClick={reader.stop}
          disabled={!reader.supported || !reading}
          aria-label={`Stop reading ${label}`}
          className={`inline-flex items-center justify-center gap-2 rounded-full border border-sand bg-paper font-semibold text-ink-muted transition-colors hover:border-gold-border hover:text-ink disabled:cursor-not-allowed disabled:opacity-45 ${buttonSize}`}
        >
          <Square size={compact ? 13 : 15} fill="currentColor" aria-hidden />
          Stop
        </button>
      </div>
      <p className={`mt-2 leading-relaxed text-ink-faint ${compact ? "text-[0.7rem]" : "text-xs"}`} role="status" aria-live="polite">
        {hasText ? reader.message : "No matching guide topics to read."}
      </p>
    </div>
  );
}
