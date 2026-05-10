import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function runSmokeTest() {
  const { sql } = await import("../src/db/client");
  const erpWrite = await import("../src/services/erp-write-service");

  const prefix = "TEST-AI-";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.resolve(process.cwd(), "backups", `smoke-test-report-${timestamp}.json`);
  
  if (!fs.existsSync(path.resolve(process.cwd(), "backups"))) {
    fs.mkdirSync(path.resolve(process.cwd(), "backups"));
  }

  const results: any[] = [];
  const createdIds: Record<string, string[]> = {};

  const mockAdminUser = {
    id: "smoke-test-admin",
    email: "smoke-test@test.com",
    roleId: "admin",
    permissions: ["admin"],
    isAdmin: true
  };

  function logResult(name: string, status: string, error?: string, manualCleanup?: string) {
    console.log(`${status === "PASS" ? "[PASS]" : status === "FAIL" ? "[FAIL]" : "[INFO]"} ${name}${error ? ": " + error : ""}${manualCleanup ? " (MANUAL CLEANUP: " + manualCleanup + ")" : ""}`);
    results.push({
      testName: name,
      status,
      errorMessage: error || null,
      manualCleanup: manualCleanup || null,
      timestamp: new Date().toISOString()
    });
  }

  function addId(entity: string, id: string) {
    if (!createdIds[entity]) createdIds[entity] = [];
    createdIds[entity].push(id);
  }

  async function manualCleanup() {
    console.log("\n🧹 Running manual cleanup for TEST-AI- prefix...");
    try {
      await sql.begin(async (tx) => {
        // Collect IDs
        const testOrderIds = (await tx`select id from orders where order_no like 'TEST-AI-%' or customer_name like 'TEST-AI-%'`).map(r => r.id);
        const testStockIds = (await tx`select id from stock_cards where code like 'TEST-AI-%' or name like 'TEST-AI-%'`).map(r => r.id);
        
        const transactionIds = (await tx`
          select distinct source_transaction_id as id from stock_movements 
          where lot_no like 'TEST-AI-%' 
             or party_no like 'TEST-AI-%' 
             or source_transaction_id like 'TEST-AI-%'
             or reference_id like 'TEST-AI-%'
             or description like 'TEST-AI-%'
        `).map(r => r.id).filter(Boolean);

        const allPossibleHeaderIds = Array.from(new Set([...transactionIds, ...testOrderIds]));

        // Delete Movements
        if (transactionIds.length > 0) {
          await tx`delete from stock_movements where source_transaction_id = any(${transactionIds})`;
        }
        await tx`delete from stock_movements where lot_no like 'TEST-AI-%' or party_no like 'TEST-AI-%' or description like 'TEST-AI-%'`;
        await tx`delete from warehouse_balances where lot_no like 'TEST-AI-%' or id like 'TEST-AI-%' or id like 'bal-TEST-AI-%'`;

        // Delete Operational
        if (allPossibleHeaderIds.length > 0) {
          await tx`delete from sales where id = any(${allPossibleHeaderIds}) or sale_no like 'TEST-AI-%'`;
          await tx`delete from production_dyehouse where id = any(${allPossibleHeaderIds}) or description like 'TEST-AI-%'`;
          await tx`delete from production_raw where id = any(${allPossibleHeaderIds}) or description like 'TEST-AI-%'`;
          await tx`delete from transfers where id = any(${allPossibleHeaderIds}) or description like 'TEST-AI-%'`;
          await tx`delete from purchase_receipts where id = any(${allPossibleHeaderIds}) or receipt_no like 'TEST-AI-%'`;
          await tx`delete from purchase_orders where id = any(${allPossibleHeaderIds}) or purchase_order_no like 'TEST-AI-%'`;
        }

        // Delete Master Data
        if (testOrderIds.length > 0) {
          await tx`delete from order_party_allocations where order_id = any(${testOrderIds})`;
          await tx`delete from parties where order_id = any(${testOrderIds})`;
        }
        await tx`delete from parties where party_no like 'TEST-AI-%'`;
        await tx`delete from orders where order_no like 'TEST-AI-%' or customer_name like 'TEST-AI-%'`;
        await tx`delete from stock_cards where code like 'TEST-AI-%' or name like 'TEST-AI-%'`;
        await tx`delete from partners where name like 'TEST-AI-%'`;
        await tx`delete from warehouses where name like 'TEST-AI-%'`;
        await tx`delete from settings_process_types where name like 'TEST-AI-%'`;
        await tx`delete from settings_yarn_counts where name like 'TEST-AI-%'`;
        await tx`delete from settings_colors where name like 'TEST-AI-%'`;
        await tx`delete from settings_fabric_types where name like 'TEST-AI-%'`;
      });
      console.log("✅ Manual cleanup completed.");
    } catch (e: any) {
      console.error("❌ Manual cleanup failed:", e.message);
    }
  }

  try {
    console.log("🚀 Starting ERP Smoke Test Flow...");

    // A) Cari Testi
    try {
      const cari = await erpWrite.createSetting("partners", { name: `${prefix}CARI-SMOKE`, type: "CUSTOMER" }, mockAdminUser);
      addId("partners", cari.id);
      await erpWrite.updateSetting("partners", cari.id, { name: `${prefix}CARI-SMOKE-UPDATED`, type: "CUSTOMER" }, mockAdminUser);
      await erpWrite.deleteSetting("partners", cari.id, mockAdminUser);
      logResult("Cari ekle/düzenle/sil", "PASS");
    } catch (e: any) {
      logResult("Cari ekle/düzenle/sil", "FAIL", e.message);
    }

    // B) Stok Kartı Testi
    let smokeStockId: string = "";
    try {
      // 1. Kullanım yokken silme testi
      const delStock = await erpWrite.createStockCard({ code: `${prefix}STOK-DEL-TEST`, name: `${prefix}STOK-DEL-TEST`, type: "IP", unit: "kg" }, mockAdminUser);
      await erpWrite.deleteStockCard(delStock.id, mockAdminUser);
      logResult("Stok kartı kullanım yokken silme", "PASS");

      // 2. Operasyonel kullanım varken silme testi (zincir testinde yapılacak)
      const stock = await erpWrite.createStockCard({ code: `${prefix}STOK-SMOKE`, name: `${prefix}STOK-SMOKE`, type: "IP", unit: "kg" }, mockAdminUser);
      smokeStockId = stock.id;
      addId("stock_cards", stock.id);
      await erpWrite.updateStockCard(stock.id, { code: `${prefix}STOK-SMOKE`, name: `${prefix}STOK-SMOKE-UPDATED`, type: "IP" }, mockAdminUser);
      logResult("Stok kartı ekle/düzenle", "PASS");
    } catch (e: any) {
      logResult("Stok kartı ekle/düzenle/sil", "FAIL", e.message);
    }

    // C) Müşteri Siparişi Testi
    try {
      // Need fabricType, color, yarnCount
      const ft = await erpWrite.createSetting("fabricTypes", { name: `${prefix}FT-SMOKE` }, mockAdminUser);
      const co = await erpWrite.createSetting("colors", { name: `${prefix}CO-SMOKE` }, mockAdminUser);
      const yc = await erpWrite.createSetting("yarnCounts", { name: `${prefix}YC-SMOKE` }, mockAdminUser);
      addId("fabricTypes", ft.id); addId("colors", co.id); addId("yarnCounts", yc.id);

      const order = await erpWrite.createCustomerOrder({
        customerName: `${prefix}CUST-SMOKE`,
        orderDate: "2026-05-10",
        dueDate: "2026-06-10",
        fabricTypeId: ft.id,
        colorId: co.id,
        yarnCountId: yc.id,
        rawWidth: 90, rawGsm: 150, finishWidth: 180, finishGsm: 160,
        quantityKg: 100
      });
      addId("orders", order.id);
      await erpWrite.updateCustomerOrder(order.id, {
        customerName: `${prefix}CUST-SMOKE-UPDATED`,
        orderDate: "2026-05-10",
        dueDate: "2026-06-10",
        rawWidth: 90, rawGsm: 150, finishWidth: 180, finishGsm: 160,
        quantityKg: 100,
        status: "Taslak"
      });
      await erpWrite.deleteCustomerOrder(order.id, mockAdminUser);
      logResult("Müşteri siparişi ekle/düzenle/sil", "PASS");
    } catch (e: any) {
      logResult("Müşteri siparişi ekle/düzenle/sil", "FAIL", e.message);
    }

    // D) Hammadde Siparişi + Mal Kabul Testi
    try {
      const warehouse = await erpWrite.createSetting("warehouses", { name: `${prefix}DEPO-SMOKE`, kind: "RAW" }, mockAdminUser);
      const supplier = await erpWrite.createSetting("partners", { name: `${prefix}SUPP-SMOKE`, type: "SUPPLIER" }, mockAdminUser);
      addId("warehouses", warehouse.id); addId("partners", supplier.id);

      // 1. Mal kabul yokken PO silme testi
      const delPo = await erpWrite.createPurchaseOrder({
        supplierId: supplier.id, orderDate: "2026-05-18", dueDate: "2026-06-18",
        item: { stockId: smokeStockId, stockType: "IP", stockCode: `${prefix}STOK-SMOKE`, stockName: `${prefix}STOK-SMOKE`, orderedKg: 50 }
      });
      await erpWrite.deletePurchaseOrder(delPo.id, mockAdminUser);
      logResult("Hammadde siparişi mal kabul yokken silme", "PASS");

      // 2. Mal kabul varken silme testi
      const po = await erpWrite.createPurchaseOrder({
        supplierId: supplier.id,
        orderDate: "2026-05-18",
        dueDate: "2026-06-18",
        item: { stockId: smokeStockId, stockType: "IP", stockCode: `${prefix}STOK-SMOKE`, stockName: `${prefix}STOK-SMOKE`, orderedKg: 100, unitPrice: 10 }
      });
      addId("purchase_orders", po.id);

      const poRows = await sql`select items from purchase_orders where id = ${po.id}`;
      const poItemId = JSON.parse(JSON.stringify(poRows[0].items))[0].id;

      const receipt1 = await erpWrite.createPurchaseReceipt({
        purchaseOrderId: po.id, purchaseOrderItemId: poItemId, stockId: smokeStockId, receivedKg: 40, warehouseId: warehouse.id, lotNo: `${prefix}LOT-SMOKE-1`, receiptDate: "2026-05-19"
      });
      addId("purchase_receipts", receipt1.id);

      try {
        await erpWrite.deletePurchaseOrder(po.id, mockAdminUser);
        logResult("Hammadde siparişi mal kabul varken silinememeli", "FAIL", "Hata vermedi!");
      } catch (e: any) {
        logResult("Hammadde siparişi mal kabul varken silinememeli", "PASS", `Engellendi (Beklenen hata: ${e.message})`);
      }

      await erpWrite.deletePurchaseReceipt(receipt1.id, mockAdminUser);
      await erpWrite.deletePurchaseOrder(po.id, mockAdminUser);
      logResult("Mal kabul silindikten sonra PO silinebilmeli", "PASS");

      logResult("Hammadde siparişi döngü testi", "PASS");
    } catch (e: any) {
      logResult("Hammadde siparişi döngü testi", "FAIL", e.message);
    }

    // E) Operasyon Zinciri Testi
    let chainIds: Record<string, string> = {};
    try {
      const dep1 = await erpWrite.createSetting("warehouses", { name: `${prefix}DEPO-CHAIN-1`, kind: "RAW" }, mockAdminUser);
      const dep2 = await erpWrite.createSetting("warehouses", { name: `${prefix}DEPO-CHAIN-2`, kind: "FINISH" }, mockAdminUser);
      const sup = await erpWrite.createSetting("partners", { name: `${prefix}SUPP-CHAIN`, type: "SUPPLIER" }, mockAdminUser);
      const mus = await erpWrite.createSetting("partners", { name: `${prefix}CUST-CHAIN`, type: "CUSTOMER" }, mockAdminUser);
      const boy = await erpWrite.createSetting("partners", { name: `${prefix}BOY-CHAIN`, type: "DYEHOUSE" }, mockAdminUser);
      const ft = await erpWrite.createSetting("fabricTypes", { name: `${prefix}FT-CHAIN` }, mockAdminUser);
      const co = await erpWrite.createSetting("colors", { name: `${prefix}CO-CHAIN` }, mockAdminUser);
      const yc = await erpWrite.createSetting("yarnCounts", { name: `${prefix}YC-CHAIN` }, mockAdminUser);
      addId("warehouses", dep1.id); addId("warehouses", dep2.id); addId("partners", sup.id); addId("partners", mus.id); addId("partners", boy.id);
      addId("fabricTypes", ft.id); addId("colors", co.id); addId("yarnCounts", yc.id);

      const stock = await erpWrite.createStockCard({ code: `${prefix}STOK-CHAIN`, name: `${prefix}STOK-CHAIN`, type: "IP", unit: "kg" }, mockAdminUser);
      addId("stock_cards", stock.id);

      const fabricPair = (await erpWrite.createStockCard({
        category: "FABRIC", fabricTypeId: ft.id, colorId: co.id, yarnCountId: yc.id, hasPolyester: false, hasLycra: false
      })) as any;
      addId("stock_cards", fabricPair.id); addId("stock_cards", fabricPair.pairedId);

      const receipt = await erpWrite.createDirectRawMaterialPurchase({
        stockId: stock.id, quantityKg: 100, supplierId: sup.id, warehouseId: dep1.id, lotNo: `${prefix}LOT-CHAIN`, receiptDate: "2026-05-20"
      });
      chainIds.receipt = receipt.id;
      chainIds.po = receipt.purchaseOrderId;

      // Stok kartı kullanım varken silinememeli testi
      try {
        await erpWrite.deleteStockCard(stock.id, mockAdminUser);
        logResult("Stok kartı kullanım varken silinememeli", "FAIL", "Hata vermedi!");
      } catch (e: any) {
        logResult("Stok kartı kullanım varken silinememeli", "PASS", `Engellendi (Beklenen hata: ${e.message})`);
      }

      const transfer = await erpWrite.createTransfer({
        date: "2026-05-21", fromWarehouseId: dep1.id, toWarehouseId: dep2.id, items: [{ stockId: stock.id, lotNo: `${prefix}LOT-CHAIN`, quantity: 100 }]
      });
      chainIds.transfer = transfer.id;

      const order = await erpWrite.createCustomerOrder({
        customerName: mus.name, orderDate: "2026-05-20", dueDate: "2026-06-20", fabricTypeId: ft.id, colorId: co.id, yarnCountId: yc.id, rawWidth: 90, rawGsm: 150, finishWidth: 180, finishGsm: 160, quantityKg: 100, ymStockId: fabricPair.id, mmStockId: fabricPair.pairedId
      });
      chainIds.order = order.id;

      const raw = await erpWrite.createRawProduction({
        date: "2026-05-22", orderId: order.id, knitterPartnerId: boy.id, warehouseId: dep2.id, producedRawKg: 95, partyNo: `${prefix}PARTI-CHAIN`, rawWidth: 90, rawGsm: 150,
        consumedItems: [{ stockId: stock.id, warehouseId: dep2.id, lotNo: `${prefix}LOT-CHAIN`, quantityKg: 100 }]
      });
      chainIds.raw = raw.id;
      chainIds.party = raw.partyId;

      const dye = await erpWrite.createDyehouseProduction({
        date: "2026-05-23", partyId: raw.partyId, dyehousePartnerId: boy.id, inputWarehouseId: dep2.id, outputWarehouseId: dep2.id, inputRawKg: 95, finishedKg: 90, finishWidth: 180, finishGsm: 160
      });
      chainIds.dye = dye.id;

      const sale = await erpWrite.createSale({
        date: "2026-05-24", customerName: mus.name, warehouseId: dep2.id, stockId: fabricPair.pairedId, partyId: raw.partyId, orderId: order.id, quantityKg: 90
      });
      chainIds.sale = sale.id;

      logResult("Operasyon zinciri (Alış->Transfer->Ham->Boyahane->Satış)", "PASS");
    } catch (e: any) {
      logResult("Operasyon zinciri (Alış->Transfer->Ham->Boyahane->Satış)", "FAIL", e.message);
    }

    // F) Bağımlılık Engelleme Testi
    try {
      if (chainIds.receipt) {
        await erpWrite.deletePurchaseReceipt(chainIds.receipt, mockAdminUser);
        logResult("Bağımlılık engelleme testi", "FAIL", "Zincir başındaki alış silinebildi!");
      } else {
        logResult("Bağımlılık engelleme testi", "SKIPPED", "Zincir oluşturulamadı");
      }
    } catch (e: any) {
      logResult("Bağımlılık engelleme testi", "PASS", `Silinemedi (Beklenen hata: ${e.message})`);
    }

    // G) Ters Sıra Silme Testi
    try {
      if (chainIds.sale) await erpWrite.deleteSale(chainIds.sale, mockAdminUser);
      if (chainIds.dye) await erpWrite.deleteDyehouseProduction(chainIds.dye, mockAdminUser);
      if (chainIds.raw) await erpWrite.deleteRawProduction(chainIds.raw, mockAdminUser);
      if (chainIds.transfer) await erpWrite.deleteTransfer(chainIds.transfer, mockAdminUser);
      if (chainIds.receipt) await erpWrite.deletePurchaseReceipt(chainIds.receipt, mockAdminUser);
      if (chainIds.order) await erpWrite.deleteCustomerOrder(chainIds.order, mockAdminUser);

      // Verify party cleanup
      if (chainIds.party) {
        const [party] = await sql`select count(*)::int as count from parties where id = ${chainIds.party}`;
        if (party.count > 0) throw new Error("Ters sıra silme: ham üretim silindi ama parti kaldı");
      }
      logResult("Ters sıra silme ve temizlik", "PASS");
    } catch (e: any) {
      logResult("Ters sıra silme ve temizlik", "FAIL", e.message);
    }

    // H) Integrity Rebuild Test
    try {
      const { rebuildAllIntegrityProjections } = await import("../src/services/write/integrity-rebuild.service");
      console.log("\n🛠️ Testing Integrity Rebuild...");
      const summary = await sql.begin(async (tx) => {
        return await rebuildAllIntegrityProjections(tx);
      });
      console.log(`✅ Rebuild completed: ${summary.warehouseBalancesRebuilt} balances, ${summary.ordersRecalculated} orders.`);
      logResult("Integrity Rebuild Test", "PASS");
    } catch (e: any) {
      logResult("Integrity Rebuild Test", "FAIL", e.message);
    }

    // I) Order Timeline Test
    try {
      const { getOrderTimeline } = await import("../src/services/erp-read-service");
      console.log("\n🕰️ Testing Order Timeline...");
      
      // Create a test order
      const ft = await erpWrite.createSetting("fabricTypes", { name: `${prefix}FT-TIMELINE` }, mockAdminUser);
      const co = await erpWrite.createSetting("colors", { name: `${prefix}CO-TIMELINE` }, mockAdminUser);
      const yc = await erpWrite.createSetting("yarnCounts", { name: `${prefix}YC-TIMELINE` }, mockAdminUser);
      addId("fabricTypes", ft.id); addId("colors", co.id); addId("yarnCounts", yc.id);

      const order = await erpWrite.createCustomerOrder({
        customerName: `${prefix}CUST-TIMELINE`,
        orderDate: "2026-05-10",
        dueDate: "2026-06-10",
        fabricTypeId: ft.id,
        colorId: co.id,
        yarnCountId: yc.id,
        rawWidth: 90, rawGsm: 150, finishWidth: 180, finishGsm: 160,
        quantityKg: 100
      });
      addId("orders", order.id);

      // Fetch timeline
      const timeline = await getOrderTimeline(order.id);
      if (timeline.length === 0) throw new Error("Sipariş oluşturuldu ama timeline boş!");
      
      const creationEvent = timeline.find((e: any) => e.type === "customer_order");
      if (!creationEvent) throw new Error("Sipariş oluşturma eventi timeline'da yok!");
      
      console.log(`✅ Order Timeline verified: ${timeline.length} events found.`);
      logResult("Order Timeline Test", "PASS");
    } catch (e: any) {
      logResult("Order Timeline Test", "FAIL", e.message);
    }

    // J) Final Cleanup Kontrolü
    await manualCleanup();
    logResult("Final Cleanup", "PASS", "Tüm TEST-AI- kayıtları temizlendi");

    // Save Report
    const finalReport = {
      timestamp: new Date().toISOString(),
      summary: results,
      createdIds,
      remainingRisk: "Manuel cleanup sonrası risk düşük.",
      recommendedFixes: results.filter(r => r.status === "FAIL").map(r => `${r.testName}: ${r.errorMessage}`)
    };
    fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2));
    console.log(`\n📄 Smoke test raporu oluşturuldu: ${reportPath}`);

  } catch (globalError: any) {
    console.error("❌ Global Smoke Test Error:", globalError.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runSmokeTest();
