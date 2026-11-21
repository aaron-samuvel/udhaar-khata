import { NextRequest, NextResponse } from "next/server";
import { restoreBackup } from "@/lib/khata";

/**
 * POST /api/import
 * Restore a ledger from a backup produced by /api/export/backup.json.
 * Body: { mode: "replace" | "merge", backup: <parsed backup object> }
 *
 * - "replace": wipe the current ledger and rebuild from the backup.
 * - "merge":   add only new customers/transactions; never clobber edits.
 *
 * Balances are recomputed from the imported ledger lines server-side — the
 * numbers in the file are never trusted.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      mode?: string;
      backup?: unknown;
    } | null;

    if (!body || (body.mode !== "replace" && body.mode !== "merge")) {
      return NextResponse.json(
        { ok: false, error: 'Choose a restore mode: "merge" or "replace".' },
        { status: 400 }
      );
    }
    if (!body.backup) {
      return NextResponse.json(
        { ok: false, error: "No backup content was provided." },
        { status: 400 }
      );
    }

    const result = await restoreBackup(body.backup, body.mode);
    return NextResponse.json({ ok: true, result }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "The backup could not be restored.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

