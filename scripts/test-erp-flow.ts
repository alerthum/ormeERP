import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function runTest() {
  const { sql } = await import("../src/db/client");
  const { 
    createSetting, 
    createStockCard, 
    createCustomerOrder, 
    deleteCustomerOrder,
    createPurchaseOrder, 
    createPurchaseReceipt, 
    deletePurchaseReceipt,
    createTransfer, 
    deleteTransfer,
    createRawProduction, 
    deleteRawProduction,
    createDyehouseProduction, 
    deleteDyehouseProduction,
    createSale, 
    deleteSale 
  } = await import("../src/services/erp-write-service");

  console.log("🚀 Starting ERP End-to-End Test Flow (Operational Lifecycle Focus)...");
  const prefix = "TEST-AI-";
  const results: string[] = [];

  const mockAdminUser = {
    id: "test-flow-admin",
    email: "test-flow@test.com",
    roleId: "admin",
    permissions: ["admin"],
    isAdmin: true
  };

  function pass(msg: string) {
    console.log(`[PASS] ${msg}`);
    results.push(`PASS: ${msg}`);
  }

  function fail(msg: string) {
    console.log(`[FAIL] ${msg}`);
    results.push(`FAIL: ${msg}`);
    process.exit(1);
  }

  async function checkOrderStatus(orderId: string, expectedStatus: string) {
    const [order] = await sql`select status from orders where id = ${orderId}`;
    if (order.status === expectedStatus) {
      pass(`Sipariş status ${expectedStatus} oldu`);
    } else {
      fail(`Sipariş status beklenen ${expectedStatus}, gelen ${order.status}`);
    }
  }

  try {
    console.log("\n--- PREPARATION: Master Data ---");
    const dep1 = await createSetting("warehouses", { name: `${prefix}Depo-1`, kind: "RAW" }, mockAdminUser);
    const dep2 = await createSetting("warehouses", { name: `${prefix}Depo-2`, kind: "FINISH" }, mockAdminUser);
    const ted = await createSetting("partners", { name: `${prefix}Tedarikci`, type: "SUPPLIER" }, mockAdminUser);
    const mus = await createSetting("partners", { name: `${prefix}Musteri`, type: "CUSTOMER" }, mockAdminUser);
    const boy = await createSetting("partners", { name: `${prefix}Boyahane`, type: "DYEHOUSE" }, mockAdminUser);
    const kumaş = await createSetting("fabricTypes", { name: `${prefix}Süprem` }, mockAdminUser);
    const renk = await createSetting("colors", { name: `${prefix}Siyah` }, mockAdminUser);
    const ne = await createSetting("yarnCounts", { name: `${prefix}30/1` }, mockAdminUser);
    
    const ipName = `${prefix}30/1 Penye Pamuk`;
    const ipStok = await createStockCard({
      code: `${prefix}IP-301-PAM`,
      name: ipName,
      type: "IP",
      yarnCountId: ne.id,
      unit: "kg"
    }, mockAdminUser);
    
    const fabricPair = (await createStockCard({
      category: "FABRIC",
      fabricTypeId: kumaş.id,
      colorId: renk.id,
      yarnCountId: ne.id,
      hasPolyester: false,
      hasLycra: false
    }, mockAdminUser)) as { id: string; pairedId: string };
    
    const ymStockId = fabricPair.id;
    const mmStockId = fabricPair.pairedId;
    pass("Altyapı verileri hazırlandı");

    console.log("\n--- TEST A: Orphan Party Cleanup ---");
    const testAOrder = await createCustomerOrder({
      customerName: mus.name,
      orderDate: "2026-05-10",
      dueDate: "2026-06-10",
      fabricTypeId: kumaş.id,
      colorId: renk.id,
      yarnCountId: ne.id,
      rawWidth: 90, rawGsm: 150, finishWidth: 180, finishGsm: 160,
      quantityKg: 100,
      price: 5.5, currency: "USD"
    }, mockAdminUser);

    const testARaw = await createRawProduction({
      date: "2026-05-11",
      orderId: testAOrder.id,
      knitterPartnerId: boy.id,
      warehouseId: dep2.id,
      producedRawKg: 50,
      partyNo: `${prefix}PARTI-TEST-A`,
      rawWidth: 90, rawGsm: 150
    });
    
    const [partyBefore] = await sql`select count(*)::int as count from parties where id = ${testARaw.partyId}`;
    if (Number(partyBefore?.count ?? 0) === 0) fail("Parti oluşturulamadı");

    await deleteRawProduction(testARaw.id, mockAdminUser);
    pass("Ham üretim silindi");

    const [partyAfter] = await sql`select count(*)::int as count from parties where id = ${testARaw.partyId}`;
    if (Number(partyAfter?.count ?? 0) > 0) fail("Ham üretim silindiği halde parti temizlenmedi");
    pass("Yetim parti başarıyla temizlendi");

    await deleteCustomerOrder(testAOrder.id, mockAdminUser);
    pass("Sipariş başarıyla silinebildi");

    console.log("\n--- TEST B: Order Status Recalculation ---");
    const testBOrder = await createCustomerOrder({
      customerName: mus.name,
      orderDate: "2026-05-12",
      dueDate: "2026-06-12",
      fabricTypeId: kumaş.id,
      colorId: renk.id,
      yarnCountId: ne.id,
      rawWidth: 90, rawGsm: 150, finishWidth: 180, finishGsm: 160,
      quantityKg: 500,
      ymStockId, mmStockId
    });
    await checkOrderStatus(testBOrder.id, "Taslak");

    const testBRaw = await createRawProduction({
      date: "2026-05-13",
      orderId: testBOrder.id,
      knitterPartnerId: boy.id,
      warehouseId: dep2.id,
      producedRawKg: 500,
      partyNo: `${prefix}PARTI-TEST-B`,
      rawWidth: 90, rawGsm: 150
    });
    await checkOrderStatus(testBOrder.id, "Ham Geldi");

    const testBDye = await createDyehouseProduction({
      date: "2026-05-14",
      partyId: testBRaw.partyId,
      dyehousePartnerId: boy.id,
      inputWarehouseId: dep2.id,
      outputWarehouseId: dep2.id,
      inputRawKg: 500,
      finishedKg: 490,
      finishWidth: 180,
      finishGsm: 160,
    });
    await checkOrderStatus(testBOrder.id, "Mamül Hazır");

    const testBSale = await createSale({
      date: "2026-05-15",
      customerName: mus.name,
      warehouseId: dep2.id,
      stockId: mmStockId,
      partyId: testBRaw.partyId,
      orderId: testBOrder.id,
      quantityKg: 490,
    });
    await checkOrderStatus(testBOrder.id, "Kısmi Sevk Edildi");

    await deleteSale(testBSale.id, mockAdminUser);
    await checkOrderStatus(testBOrder.id, "Mamül Hazır");

    await deleteDyehouseProduction(testBDye.id, mockAdminUser);
    await checkOrderStatus(testBOrder.id, "Ham Geldi");

    await deleteRawProduction(testBRaw.id, mockAdminUser);
    await checkOrderStatus(testBOrder.id, "Onaylandı");

    console.log("\n--- TEST C: Reverse Delete & Chain Test ---");
    const po = await createPurchaseOrder({
      supplierId: ted.id,
      orderDate: "2026-05-18",
      dueDate: "2026-06-18",
      item: { stockId: ipStok.id, stockType: "IP", stockCode: (ipStok as any).code, stockName: ipName, orderedKg: 100, unitPrice: 10 }
    });
    const poRows = await sql`select items from purchase_orders where id = ${po.id}`;
    const poItems = JSON.parse(JSON.stringify(poRows[0].items));
    const poItemId = poItems[0].id;

    const receipt = await createPurchaseReceipt({
      purchaseOrderId: po.id,
      purchaseOrderItemId: poItemId,
      stockId: ipStok.id,
      receivedKg: 100,
      warehouseId: dep1.id,
      lotNo: `${prefix}CHAIN-LOT`,
      receiptDate: "2026-05-19"
    });

    const transfer = await createTransfer({
      date: "2026-05-20",
      fromWarehouseId: dep1.id,
      toWarehouseId: dep2.id,
      items: [{ stockId: ipStok.id, lotNo: `${prefix}CHAIN-LOT`, quantity: 100 }]
    });

    const order = await createCustomerOrder({
      customerName: mus.name,
      orderDate: "2026-05-19",
      dueDate: "2026-06-19",
      fabricTypeId: kumaş.id,
      colorId: renk.id,
      yarnCountId: ne.id,
      rawWidth: 90, rawGsm: 150, finishWidth: 180, finishGsm: 160,
      quantityKg: 100,
      ymStockId, mmStockId
    });

    const raw = await createRawProduction({
      date: "2026-05-21",
      orderId: order.id,
      knitterPartnerId: boy.id,
      warehouseId: dep2.id,
      producedRawKg: 90,
      partyNo: `${prefix}CHAIN-PARTI`,
      rawWidth: 90, rawGsm: 150,
      consumedItems: [{ stockId: ipStok.id, warehouseId: dep2.id, lotNo: `${prefix}CHAIN-LOT`, quantityKg: 100 }]
    });

    const dye = await createDyehouseProduction({
      date: "2026-05-22",
      partyId: raw.partyId,
      dyehousePartnerId: boy.id,
      inputWarehouseId: dep2.id,
      outputWarehouseId: dep2.id,
      inputRawKg: 90,
      finishedKg: 85,
      finishWidth: 180, finishGsm: 160,
    });

    const sale = await createSale({
      date: "2026-05-23",
      customerName: mus.name,
      warehouseId: dep2.id,
      stockId: mmStockId,
      partyId: raw.partyId,
      orderId: order.id,
      quantityKg: 85,
    });
    pass("Test zinciri oluşturuldu");

    try {
      await deletePurchaseReceipt(receipt.id, mockAdminUser);
      fail("Zincir başındaki alış silinebildi!");
    } catch (e: any) {
      pass("Alış silinemedi (Beklenen bloklama: " + e.message + ")");
    }

    await deleteSale(sale.id, mockAdminUser);
    await deleteDyehouseProduction(dye.id, mockAdminUser);
    await deleteRawProduction(raw.id, mockAdminUser);
    await deleteTransfer(transfer.id, mockAdminUser);
    await deletePurchaseReceipt(receipt.id, mockAdminUser);
    await deleteCustomerOrder(order.id, mockAdminUser);
    pass("Zincir başarıyla sondan başa silindi");

    console.log("\n--- TEST D: Purchase Order Status Recalculation ---");
    const testDPO = await createPurchaseOrder({
      supplierId: ted.id,
      orderDate: "2026-05-25",
      dueDate: "2026-06-25",
      item: { stockId: ipStok.id, stockType: "IP", stockCode: (ipStok as any).code, stockName: ipName, orderedKg: 100, unitPrice: 10 }
    });
    
    async function checkPOStatus(poId: string, expectedStatus: string) {
      const [po] = await sql`select status, total_received_kg, total_remaining_kg from purchase_orders where id = ${poId}`;
      if (po.status === expectedStatus) {
        pass(`PO status ${expectedStatus} oldu`);
      } else {
        fail(`PO status beklenen ${expectedStatus}, gelen ${po.status}`);
      }
    }

    await checkPOStatus(testDPO.id, "Taslak");

    const poRowsD = await sql`select items from purchase_orders where id = ${testDPO.id}`;
    const poItemsD = JSON.parse(JSON.stringify(poRowsD[0].items));
    const poItemIdD = poItemsD[0].id;

    const receiptD1 = await createPurchaseReceipt({
      purchaseOrderId: testDPO.id,
      purchaseOrderItemId: poItemIdD,
      stockId: ipStok.id,
      receivedKg: 40,
      warehouseId: dep1.id,
      lotNo: `${prefix}LOT-D1`,
      receiptDate: "2026-05-26"
    });
    await checkPOStatus(testDPO.id, "Kısmi Geldi");

    const receiptD2 = await createPurchaseReceipt({
      purchaseOrderId: testDPO.id,
      purchaseOrderItemId: poItemIdD,
      stockId: ipStok.id,
      receivedKg: 60,
      warehouseId: dep1.id,
      lotNo: `${prefix}LOT-D2`,
      receiptDate: "2026-05-27"
    });
    await checkPOStatus(testDPO.id, "Tamamlandı");

    await deletePurchaseReceipt(receiptD2.id, mockAdminUser);
    await checkPOStatus(testDPO.id, "Kısmi Geldi");

    await deletePurchaseReceipt(receiptD1.id, mockAdminUser);
    await checkPOStatus(testDPO.id, "Onaylandı");

    const [finalPO] = await sql`select total_received_kg, total_remaining_kg, items from purchase_orders where id = ${testDPO.id}`;
    if (Number(finalPO.total_received_kg) === 0 && Number(finalPO.total_remaining_kg) === 100) {
      pass("PO toplamları sıfırlandı");
    } else {
      fail(`PO toplamları hatalı: Received=${finalPO.total_received_kg}, Remaining=${finalPO.total_remaining_kg}`);
    }
    
    const finalItems = JSON.parse(JSON.stringify(finalPO.items));
    if (Number(finalItems[0].receivedKg) === 0 && Number(finalItems[0].remainingKg) === 100) {
      pass("PO kalem miktarları sıfırlandı");
    } else {
      fail(`PO kalem miktarları hatalı: Received=${finalItems[0].receivedKg}, Remaining=${finalItems[0].remainingKg}`);
    }

    console.log("\n--- TEST E: Precise Status Thresholds ---");
    const testEOrder = await createCustomerOrder({
      customerName: mus.name,
      orderDate: "2026-05-30",
      dueDate: "2026-06-30",
      fabricTypeId: kumaş.id,
      colorId: renk.id,
      yarnCountId: ne.id,
      rawWidth: 90, rawGsm: 150, finishWidth: 180, finishGsm: 160,
      quantityKg: 100,
      ymStockId, mmStockId
    });
    
    // 1. Produced 100kg raw
    const testERaw = await createRawProduction({
      date: "2026-06-01",
      orderId: testEOrder.id,
      knitterPartnerId: boy.id,
      warehouseId: dep2.id,
      producedRawKg: 100,
      partyNo: `${prefix}PARTI-TEST-E`,
      rawWidth: 90, rawGsm: 150
    });
    await checkOrderStatus(testEOrder.id, "Ham Geldi");

    // 2. Finished 100kg
    const testEDye = await createDyehouseProduction({
      date: "2026-06-02",
      partyId: testERaw.partyId,
      dyehousePartnerId: boy.id,
      inputWarehouseId: dep2.id,
      outputWarehouseId: dep2.id,
      inputRawKg: 100,
      finishedKg: 100,
      finishWidth: 180, finishGsm: 160,
    });
    await checkOrderStatus(testEOrder.id, "Mamül Hazır");

    // 3. Shipped 99.9 kg (Partial)
    const testESale1 = await createSale({
      date: "2026-06-03",
      customerName: mus.name,
      warehouseId: dep2.id,
      stockId: mmStockId,
      partyId: testERaw.partyId,
      orderId: testEOrder.id,
      quantityKg: 99.9,
    });
    await checkOrderStatus(testEOrder.id, "Kısmi Sevk Edildi");

    // 4. Shipped remaining 0.1 kg (Full)
    const testESale2 = await createSale({
      date: "2026-06-04",
      customerName: mus.name,
      warehouseId: dep2.id,
      stockId: mmStockId,
      partyId: testERaw.partyId,
      orderId: testEOrder.id,
      quantityKg: 0.1,
    });
    await checkOrderStatus(testEOrder.id, "Sevk Edildi");

    // Cleanup E
    await deleteSale(testESale2.id, mockAdminUser);
    await checkOrderStatus(testEOrder.id, "Kısmi Sevk Edildi");
    await deleteSale(testESale1.id, mockAdminUser);
    await deleteDyehouseProduction(testEDye.id, mockAdminUser);
    await deleteRawProduction(testERaw.id, mockAdminUser);
    await deleteCustomerOrder(testEOrder.id, mockAdminUser);

    console.log("\n✅ ALL LIFECYCLE TESTS PASSED!");

  } catch (error: any) {
    console.error("\n❌ TEST FAILED!");
    console.error(error);
    process.exit(1);
  }
}

runTest();
