import { NextRequest, NextResponse } from "next/server";
import { getReports, type ReportRange } from "@/lib/khata";

const VALID: ReportRange[] = ["today", "7d", "30d", "all", "custom"];

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const range = (sp.get("range") ?? "30d") as ReportRange;
    if (!VALID.includes(range)) {
      return NextResponse.json(
        { ok: false, error: "range must be one of: today, 7d, 30d, all, custom." },
        { status: 400 }
      );
    }
    const report = await getReports(
      range,
      sp.get("from") ?? undefined,
      sp.get("to") ?? undefined
    );
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Report failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

