import { NextRequest, NextResponse } from "next/server";
import { customerStatement } from "@/lib/khata";

/**
 * POST /api/customers/[name]/statement
 * Build a WhatsApp-ready statement (last ledger lines + balance) for one
 * customer. Works for settled customers too — it doubles as a receipt.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await ctx.params;
    const decoded = decodeURIComponent(name);
    const result = await customerStatement(decoded);
    if (!result) {
      return NextResponse.json(
        { ok: false, error: `No customer named ${decoded}.` },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, statement: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not build the statement.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
