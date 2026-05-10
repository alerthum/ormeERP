import { ok, fail, requirePermission } from "../../_helpers";
import { getSnapshotReportData } from "@/services/erp-read-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    await requirePermission(request, "reports:read");
    const { date } = await params;
    const data = await getSnapshotReportData(date);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
