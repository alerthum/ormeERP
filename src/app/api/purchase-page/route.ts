import { NextResponse } from "next/server";
import { getPurchasePageData } from "@/services/erp-read-service";

export async function GET() {
  try {
    const data = await getPurchasePageData();

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error("Purchase Page API error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Satın alma verileri alınamadı.",
      },
      { status: 500 },
    );
  }
}
