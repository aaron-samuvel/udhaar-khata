import { NextRequest, NextResponse } from "next/server";
import { writeReminders } from "@/lib/khata";

const DEFAULT_OVERDUE_DAYS = 7;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const raw = body.overdue_days ?? body.overdueDays;
    let overdueDays = DEFAULT_OVERDUE_DAYS;
    if (raw !== undefined && raw !== null && raw !== "") {
      const n = Number(raw);
      if (Number.isFinite(n)) overdueDays = n;
    }

    const reminders = await writeReminders(overdueDays);
    return NextResponse.json({
      ok: true,
      overdue_days: overdueDays,
      reminders_written: reminders.length,
      reminders,
      status: "SUCCEEDED",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
