import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "udhaar-khata",
    shop_id: "default",
  });
}

