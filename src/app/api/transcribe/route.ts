import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Voice-input fallback for browsers without the Web Speech API.
 * Accepts { audio_base64, mime } and returns the transcribed sentence,
 * which the frontend drops into the entry box for the parser to handle.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const audioBase64: string = body.audio_base64 || "";
    if (!audioBase64) {
      return NextResponse.json(
        { ok: false, error: "No audio provided." },
        { status: 400 }
      );
    }
    if (audioBase64.length * 0.75 > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Recording too long. Keep it under ~60 seconds." },
        { status: 413 }
      );
    }

    const zai = await ZAI.create();
    const response = await zai.audio.asr.create({
      file_base64: audioBase64,
    });

    const text = (response.text ?? "").trim();
    if (!text) {
      return NextResponse.json(
        { ok: false, error: "Could not hear anything clearly. Try again." },
        { status: 422 }
      );
    }
    return NextResponse.json({ ok: true, text });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Transcription failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
