import { NextRequest, NextResponse } from "next/server";
import { parse } from "@/lib/parser";
import { saveParsedTransaction } from "@/lib/khata";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text: string = body.text || body.sentence || "";
    const phone: string | undefined = body.phone || undefined;

    const parsed = parse(text);
    if (!parsed.ok) {
      return NextResponse.json(
        { ok: false, error: parsed.error, parsed },
        { status: 400 }
      );
    }

    const saved = await saveParsedTransaction(parsed, phone);
    return NextResponse.json(
      { ok: true, parsed, ...saved },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
