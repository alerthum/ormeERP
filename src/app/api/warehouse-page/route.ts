import { NextResponse } from "next/server";
import { getWarehousePageData } from "@/services/erp-read-service";

export async function GET() {
  try {
    const data = await getWarehousePageData();
    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error("Warehouse Page API error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Depo verileri alınamadı.",
      },
      { status: 500 },
    );
  }
}
