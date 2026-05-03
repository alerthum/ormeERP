import { fail, ok, readJson } from "@/app/api/_helpers";
import { createRawProduction } from "@/services/erp-write-service";

export async function POST(request: Request) {
  try {
    const data = await createRawProduction(await readJson(request));
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
