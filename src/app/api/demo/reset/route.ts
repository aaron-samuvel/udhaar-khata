import { NextResponse } from "next/server";
import { resetDemoData } from "@/lib/khata";

/**
 * Resets the ledger to a clearly-labeled demo dataset.
 * The UI confirms before calling this; never run against real business data.
 */
export async function POST() {
  try {
    const result = await resetDemoData();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reset failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

