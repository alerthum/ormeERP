import { fail, ok, requirePermission } from "@/app/api/_helpers";
import { cancelSale } from "@/services/erp-write-service";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(request, "sales:write");
    const { id } = await params;
    return ok(await cancelSale(id), 200);
  } catch (error) {
    return fail(error);
  }
}
