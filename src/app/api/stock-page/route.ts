import { NextResponse } from "next/server";
import { getStockPageData } from "@/services/erp-read-service";

export async function GET() {
  try {
    const data = await getStockPageData();
    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error("Stock Page API error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Stok verileri alınamadı.",
      },
      { status: 500 },
    );
  }
}
