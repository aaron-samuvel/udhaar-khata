import { NextResponse } from "next/server";
import { listCustomers } from "@/lib/khata";

export async function GET() {
  try {
    const customers = await listCustomers();
    return NextResponse.json({ ok: true, customers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
