import { fail, ok, readJson, requirePermission } from "@/app/api/_helpers";
import { shiftPartyAllocation } from "@/services/erp-write-service";

export async function POST(request: Request) {
  try {
    await requirePermission(request, "orders:write");
    return ok(await shiftPartyAllocation(await readJson(request)));
  } catch (error) {
    return fail(error);
  }
}
