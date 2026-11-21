import { NextRequest, NextResponse } from "next/server";
import { reverseTransaction, publicTxn, publicCustomer } from "@/lib/khata";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const result = await reverseTransaction(id);
    return NextResponse.json(
      { ok: true, transaction: result.transaction, customer: result.customer },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reversal failed.";
    const status = message === "Transaction not found." ? 404 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

// Serialization helpers are exported for tests elsewhere; keep them referenced.
export const _internal = { publicTxn, publicCustomer };
