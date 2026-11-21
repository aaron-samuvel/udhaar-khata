"use client";

/**
 * Voice input for the entry card — PRESERVED feature from the original build.
 *
 * 1. Web Speech API (window.SpeechRecognition / webkitSpeechRecognition,
 *    lang "en-IN", interimResults false) when the browser supports it; the
 *    final transcript is delivered to `onText`.
 * 2. Otherwise MediaRecorder records the mic, the blob is base64-encoded and
 *    POSTed to /api/transcribe { audio_base64 } — the returned text is
 *    delivered to `onText` the same way.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { khataPost, errOf } from "./api";

/* ---------- minimal Web Speech API types ---------- */
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  0: SpeechRecognitionAlternative;
  isFinal: boolean;
}
interface SpeechRecognitionResultList {
  0: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognition;

export interface VoiceInputState {
  /** true while the mic is live. */
  listening: boolean;
  /** true when the browser has the Web Speech API (false = recorder fallback). */
  speechSupported: boolean;
  /** Last voice-input error message, or null. Clear on the next attempt. */
  error: string | null;
  /** Start/stop listening. */
  toggle: () => void;
}

export function useVoiceInput(onText: (text: string) => void): VoiceInputState {
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    // Check for Web Speech API support once on mount (client only).
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    setSpeechSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const stopListening = useCallback(() => {
    setListening(false);
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const transcribeBlob = useCallback(async (blob: Blob) => {
    try {
      const buf = await blob.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const result = await khataPost<{ ok: boolean; text?: string; error?: string }>(
        "/api/transcribe",
        { audio_base64: btoa(binary) }
      );
      if (!result.ok || !result.data.text) {
        throw new Error(errOf(result, "Could not transcribe the audio."));
      }
      onTextRef.current(result.data.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not transcribe the audio.");
    }
  }, []);

  const toggle = useCallback(() => {
    setError(null);
    if (listening) {
      stopListening();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (Ctor) {
      const rec = new Ctor();
      rec.lang = "en-IN";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (event) => {
        onTextRef.current(event.results[0][0].transcript);
      };
      rec.onerror = () => {
        setListening(false);
        setError("Could not capture speech. You can type the line instead.");
      };
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
      try {
        rec.start();
        setListening(true);
      } catch {
        setListening(false);
        setError("Could not start the microphone. You can type the line instead.");
      }
      return;
    }

    // Fallback: record with MediaRecorder and transcribe via /api/transcribe.
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";
        const recorder = new MediaRecorder(stream, { mimeType: mime });
        chunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          setListening(false);
          void transcribeBlob(new Blob(chunksRef.current, { type: mime }));
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
        setListening(true);
      } catch {
        setListening(false);
        setError("Voice input is not supported here. Please type the line instead.");
      }
    })();
  }, [listening, stopListening, transcribeBlob]);

  return { listening, speechSupported, error, toggle };
}
