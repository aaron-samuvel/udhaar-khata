import { exportTransactionsCsv } from "@/lib/khata";

export async function GET() {
  try {
    const csv = await exportTransactionsCsv();
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response("\ufeff" + csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="udhaar-transactions-${stamp}.csv"`,
      },
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Export failed." },
      { status: 500 }
    );
  }
}

