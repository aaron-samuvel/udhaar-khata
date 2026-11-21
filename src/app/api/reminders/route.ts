import { NextRequest, NextResponse } from "next/server";
import { writeReminders, listReminders } from "@/lib/khata";

export async function GET() {
  try {
    const reminders = await listReminders();
    return NextResponse.json({ ok: true, reminders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const raw = body.overdue_days ?? body.overdueDays;
    let overdueDays: number | undefined;
    if (raw !== undefined && raw !== null && raw !== "") {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 365) {
        return NextResponse.json(
          { ok: false, error: "overdue_days must be between 0 and 365." },
          { status: 400 }
        );
      }
      overdueDays = Math.floor(n);
    }
    const reminders = await writeReminders(overdueDays);
    return NextResponse.json({
      ok: true,
      reminders_written: reminders.length,
      reminders,
      status: "SUCCEEDED",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reminder run failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
