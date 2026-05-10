import { NextResponse } from "next/server";
import { getPartyPageData } from "@/services/erp-read-service";

export async function GET() {
  try {
    const data = await getPartyPageData();
    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error("Party Page API error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Parti verileri alınamadı.",
      },
      { status: 500 },
    );
  }
}
