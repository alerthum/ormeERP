import { fail, ok, readJson } from "@/app/api/_helpers";
import { createStockCard } from "@/services/erp-write-service";

export async function POST(request: Request) {
  try {
    const data = await createStockCard(await readJson(request));
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
