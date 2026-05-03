import { fail, ok } from "@/app/api/_helpers";
import { getErpDataFromDb } from "@/services/erp-read-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await getErpDataFromDb(), 200);
  } catch (error) {
    return fail(error, 500);
  }
}
