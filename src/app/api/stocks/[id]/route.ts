import { fail, ok, readJson, requirePermission } from "@/app/api/_helpers";
import { deleteStockCard, updateStockCard } from "@/services/erp-write-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(request, "stocks:write");
    const { id } = await params;
    return ok(await updateStockCard(id, await readJson(request)), 200);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(request, "stocks:write");
    const { id } = await params;
    return ok(await deleteStockCard(id), 200);
  } catch (error) {
    return fail(error);
  }
}
