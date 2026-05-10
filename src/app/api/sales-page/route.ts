import { NextResponse } from "next/server";
import { getSalesPageData } from "@/services/erp-read-service";

export async function GET() {
  try {
    const data = await getSalesPageData();
    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error("Sales Page API error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Satış verileri alınamadı.",
      },
      { status: 500 },
    );
  }
}
