import { NextResponse } from "next/server";
import { getTransferPageData } from "@/services/erp-read-service";

export async function GET() {
  try {
    const data = await getTransferPageData();
    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error("Transfer Page API error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Transfer verileri alınamadı.",
      },
      { status: 500 },
    );
  }
}
