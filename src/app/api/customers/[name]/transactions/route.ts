import { NextRequest, NextResponse } from "next/server";
import { getCustomerWithTxns } from "@/lib/khata";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await ctx.params;
    const decoded = decodeURIComponent(name);
    const result = await getCustomerWithTxns(decoded);
    if (!result) {
      return NextResponse.json(
        { ok: false, error: `No customer named ${decoded}.` },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

