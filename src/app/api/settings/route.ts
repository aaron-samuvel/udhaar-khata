import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSettings, isValidUpiId, publicSettings, updateSettings } from "@/lib/khata";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ ok: true, settings: publicSettings(settings) });
}

const putSchema = z.object({
  shopName: z.string().trim().min(1).max(60).optional(),
  overdueDays: z.number().int().min(0).max(365).optional(),
  reminderTemplate: z.string().min(10).max(500).optional(),
  /** Empty string clears the UPI ID; a non-empty value must be a valid VPA. */
  upiId: z.string().max(100).nullable().optional(),
  demoData: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings." },
        { status: 400 }
      );
    }
    const { upiId, ...rest } = parsed.data;
    if (upiId !== undefined && upiId !== null && upiId.trim() !== "" && !isValidUpiId(upiId)) {
      return NextResponse.json(
        { ok: false, error: "UPI ID must look like yourname@bank (e.g. shop@okicici)." },
        { status: 400 }
      );
    }
    const patch = { ...rest, ...(upiId !== undefined ? { upiId } : {}) };
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
    }
    const settings = await updateSettings(patch);
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
