import { NextRequest, NextResponse } from "next/server";
import { listCustomers } from "@/lib/khata";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim() || undefined;
    // ?archived=1 lists ONLY archived customers; default lists active ones.
    const onlyArchived = sp.get("archived") === "1";
    const customers = await listCustomers(q, onlyArchived);
    return NextResponse.json({ ok: true, customers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
