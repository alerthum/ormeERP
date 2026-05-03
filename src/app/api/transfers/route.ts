import { fail, ok, readJson, requirePermission } from "@/app/api/_helpers";
import { createTransfer } from "@/services/erp-write-service";

export async function POST(request: Request) {
  try {
    await requirePermission(request, "stocks:write");
    const data = await createTransfer(await readJson(request));
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
