import { NextRequest, NextResponse } from "next/server";
import { listCustomers } from "@/lib/khata";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() || undefined;
    const customers = await listCustomers(q);
    return NextResponse.json({ ok: true, customers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
