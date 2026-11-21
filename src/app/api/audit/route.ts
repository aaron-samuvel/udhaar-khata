import { NextRequest, NextResponse } from "next/server";
import { listAuditEvents } from "@/lib/khata";

/**
 * GET /api/audit?limit=50
 * Read-only activity log — the append-only audit trail that backs the
 * "Activity log" card in Settings. No mutations here by design: the trail
 * must stay immutable.
 */
export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("limit");
    const parsed = raw ? Number.parseInt(raw, 10) : 50;
    const limit = Number.isFinite(parsed) ? parsed : 50;
    const events = await listAuditEvents(limit);
    return NextResponse.json({ ok: true, events });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load the activity log.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
