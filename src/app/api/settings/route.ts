import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSettings, publicSettings, updateSettings } from "@/lib/khata";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ ok: true, settings: publicSettings(settings) });
}

const putSchema = z.object({
  shopName: z.string().trim().min(1).max(60).optional(),
  overdueDays: z.number().int().min(0).max(365).optional(),
  reminderTemplate: z.string().min(10).max(500).optional(),
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
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
    }
    const settings = await updateSettings(parsed.data);
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
