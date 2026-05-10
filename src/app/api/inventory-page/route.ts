import { NextResponse } from "next/server";
import { getInventoryPageData } from "@/services/erp-read-service";

export async function GET() {
  try {
    const data = await getInventoryPageData();

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error("Inventory Page API error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Stok verileri alınamadı.",
      },
      { status: 500 },
    );
  }
}
