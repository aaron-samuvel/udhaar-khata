import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { customerReminder } from "@/lib/khata";

const bodySchema = z.object({ name: z.string().trim().min(1).max(60) });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }
    const reminder = await customerReminder(parsed.data.name);
    if (!reminder) {
      return NextResponse.json(
        { ok: false, error: `No customer named ${parsed.data.name}.` },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, reminder }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reminder failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

