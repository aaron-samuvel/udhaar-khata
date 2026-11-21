import { exportBackupJson } from "@/lib/khata";

export async function GET() {
  try {
    const backup = await exportBackupJson();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return Response.json(backup, {
      headers: {
        "content-disposition": `attachment; filename="udhaar-khata-backup-${stamp}.json"`,
      },
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Backup failed." },
      { status: 500 }
    );
  }
}
