import { NextResponse } from "next/server";
import { listReminders } from "@/lib/khata";

export async function GET() {
  try {
    const reminders = await listReminders();
    return NextResponse.json({ ok: true, reminders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
