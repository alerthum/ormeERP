import { NextResponse } from "next/server";
import { getOrdersPageData } from "@/services/erp-read-service";

export async function GET() {
  try {
    const data = await getOrdersPageData();

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error("Orders Page API error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Sipariş verileri alınamadı.",
      },
      { status: 500 },
    );
  }
}
