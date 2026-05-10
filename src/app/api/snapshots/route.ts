import { ok, fail, readJson, requirePermission } from "../_helpers";
import { createFullSnapshot } from "@/services/snapshot.service";
import { getSnapshotPageData } from "@/services/erp-read-service";

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, "settings:write");
    const body = await readJson(request);
    const snapshotDate = body.snapshotDate as string;
    if (!snapshotDate) throw new Error("Snapshot tarihi zorunlu.");
    
    const data = await createFullSnapshot(snapshotDate);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

export async function GET(request: Request) {
  try {
    await requirePermission(request, "reports:read");
    const data = await getSnapshotPageData();
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
