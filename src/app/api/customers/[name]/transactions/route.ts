import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nameKey, listTransactions } from "@/lib/khata";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await ctx.params;
    const decoded = decodeURIComponent(name);
    const customer = await db.customer.findUnique({
      where: { nameKey: nameKey(decoded) },
    });
    if (!customer) {
      return NextResponse.json(
        { ok: false, error: `No customer named ${decoded}.` },
        { status: 404 }
      );
    }
    const transactions = await listTransactions(decoded);
    return NextResponse.json({
      ok: true,
      customer: {
        name: customer.name,
        nameKey: customer.nameKey,
        balance: customer.balance,
        phone: customer.phone,
        firstDueAt: customer.firstDueAt?.toISOString() ?? null,
        lastTxnAt: customer.lastTxnAt?.toISOString() ?? null,
        createdAt: customer.createdAt.toISOString(),
      },
      transactions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
