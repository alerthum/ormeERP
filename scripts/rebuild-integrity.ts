import * as dotenv from "dotenv";
import * as path from "path";
import postgres from "postgres";

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ DATABASE_URL is not configured in .env.local");
  process.exit(1);
}

const sql = postgres(databaseUrl, { ssl: "require", prepare: false });

async function runRebuild() {
  console.log("🛠️ ERP Bütünlük Yeniden Oluşturma Başlatılıyor...");
  
  try {
    const { rebuildAllIntegrityProjections } = await import("../src/services/write/integrity-rebuild.service");

    const summary = await sql.begin(async (tx) => {
      return await rebuildAllIntegrityProjections(tx);
    });

    console.log("\n✅ Yeniden Oluşturma Başarıyla Tamamlandı!");
    console.log("------------------------------------------");
    console.log(`📦 Depo Bakiyeleri Yeniden Kuruldu: ${summary.warehouseBalancesRebuilt} kayıt`);
    console.log(`🏷️ Stok Kartı Toplamları Güncellendi: ${summary.stockCardsUpdated} kart`);
    console.log(`📝 Müşteri Siparişi Durumları Hesaplandı: ${summary.ordersRecalculated} sipariş`);
    console.log(`🛒 Satıcı Siparişi Durumları Hesaplandı: ${summary.purchaseOrdersRecalculated} sipariş`);
    console.log(`🧹 Temizlenen Yetim Partiler: ${summary.orphanPartiesCleaned} parti`);
    console.log("------------------------------------------");

  } catch (error: any) {
    console.error("\n❌ Yeniden oluşturma sırasında hata oluştu:");
    console.error(error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runRebuild();
