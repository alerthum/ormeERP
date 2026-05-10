import { NextResponse } from "next/server";
import { getProductionPageData } from "@/services/erp-read-service";

export async function GET() {
  try {
    const data = await getProductionPageData();

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error("Production Page API error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Üretim verileri alınamadı.",
      },
      { status: 500 },
    );
  }
}
