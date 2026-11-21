import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateCustomer } from "@/lib/khata";

const patchSchema = z.object({
  phone: z.string().max(20).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await ctx.params;
    const decoded = decodeURIComponent(name);
    const body = await req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }
    if (parsed.data.phone === undefined && parsed.data.notes === undefined) {
      return NextResponse.json(
        { ok: false, error: "Nothing to update." },
        { status: 400 }
      );
    }
    const customer = await updateCustomer(decoded, parsed.data);
    if (!customer) {
      return NextResponse.json(
        { ok: false, error: `No customer named ${decoded}.` },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, customer });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
