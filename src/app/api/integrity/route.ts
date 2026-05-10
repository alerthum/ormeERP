import { fail, ok } from "@/app/api/_helpers";
import { rebuildBalancesFromMovements, cleanOrphanData } from "@/services/erp-write-service";
import { assertNoOrphanOperationalData } from "@/services/write/integrity-validation.service";
import { rebuildOrderStatuses, rebuildPurchaseOrderStatuses } from "@/services/write/integrity-rebuild.service";
import { rebuildAllReportingAggregates } from "@/services/reporting-aggregate.service";

import { sql } from "@/db/client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { action } = await req.json();
    
    if (action === "rebuild") {
      await rebuildBalancesFromMovements();
      return ok({ success: true, message: "Bakiyeler ve özetler başarıyla yeniden oluşturuldu." });
    }
    
    if (action === "clean") {
      await cleanOrphanData();
      return ok({ success: true, message: "Yetim veriler temizlendi ve bakiyeler güncellendi." });
    }

    if (action === "rebuild_orders") {
      await sql.begin(async tx => {
        await rebuildOrderStatuses(tx);
        await rebuildPurchaseOrderStatuses(tx);
      });
      return ok({ success: true, message: "Sipariş durumları başarıyla yeniden hesaplandı." });
    }

    if (action === "rebuild_reporting") {
      await sql.begin(tx => rebuildAllReportingAggregates(tx));
      return ok({ success: true, message: "Rapor özetleri (reporting aggregates) başarıyla yenilendi." });
    }

    if (action === "full_maintenance") {
      await sql.begin(async tx => {
        // 1. Clean orphans
        await cleanOrphanData(); 
        // 2. Rebuild balances
        await rebuildBalancesFromMovements(); 
        // 3. Rebuild order statuses
        await rebuildOrderStatuses(tx);
        await rebuildPurchaseOrderStatuses(tx);
        // 4. Rebuild reporting
        await rebuildAllReportingAggregates(tx);
      });
      return ok({ success: true, message: "Tam sistem bakımı (veri katmanı) tamamlandı." });
    }

    if (action === "check") {
       try {
         await sql.begin(tx => assertNoOrphanOperationalData(tx));
         return ok({ success: true, message: "Veri bütünlüğü tam. Herhangi bir tutarsızlık bulunamadı." });
       } catch (err: any) {
         return ok({ 
           success: false, 
           error: err.message,
           details: err.details || []
         });
       }
    }

    throw new Error("Geçersiz işlem.");
  } catch (error) {
    return fail(error, 500);
  }
}
