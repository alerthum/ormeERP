import { fail, ok } from "@/app/api/_helpers";
import { rebuildBalancesFromMovements, cleanOrphanData } from "@/services/erp-write-service";
import { assertNoOrphanOperationalData } from "@/services/write/integrity-validation.service";

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
