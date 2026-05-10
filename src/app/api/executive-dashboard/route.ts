import { NextResponse } from "next/server";
import { getExecutiveDashboardData } from "@/services/erp-read-service";

export async function GET() {
  try {
    const data = await getExecutiveDashboardData();
    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error("Executive Dashboard API error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Patron özeti verileri alınamadı.",
      },
      { status: 500 },
    );
  }
}
