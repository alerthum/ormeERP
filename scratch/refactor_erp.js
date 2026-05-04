const fs = require('fs');

const erpWriteServicePath = 'src/services/erp-write-service.ts';
let serviceContent = fs.readFileSync(erpWriteServicePath, 'utf8');

const charMapping = {
    'MamÃ¼l': 'Mamül',
    'MamǬl': 'Mamül',
    'MÃ¼ÅŸteri': 'Müşteri',
    'SipariÅŸ': 'Sipariş',
    'Ãœretim': 'Üretim',
    'Ã–rmede': 'Örmede',
    'Ã‡ıkış': 'Çıkış',
    'Stok adÄ±': 'Stok adı',
    'GeÃ§ersiz': 'Geçersiz',
    'gÃ¼ncellendi': 'güncellendi',
    'gÃ¼ncellenemedi': 'güncellenemedi',
    'oluÅŸturuldu': 'oluşturuldu',
    'aÃ§Ä±ldÄ±': 'açıldı',
    'TÃ¼ketim': 'Tüketim',
    'giriÅŸ': 'giriş'
};

for (const [bad, good] of Object.entries(charMapping)) {
    serviceContent = serviceContent.split(bad).join(good);
}

serviceContent = serviceContent.replace(/async function findOrCreateFabricStock\(tx: Tx, type: "YM" \| "MM",[\s\S]+?return stockId;\n\}/, `async function findOrCreateFabricStock(
  tx: Tx,
  type: "YM" | "MM",
  input: {
    fabricTypeId: string;
    colorId: string;
    yarnCountId: string;
    hasPolyester: boolean;
    hasLycra: boolean;
  },
) {
  const matches = await tx\`
    select id from stock_cards
    where type = \${type}
      and fabric_type_id = \${input.fabricTypeId}
      and color_id = \${input.colorId}
      and yarn_count_id = \${input.yarnCountId}
      and has_polyester = \${input.hasPolyester}
      and has_lycra = \${input.hasLycra}
    limit 1
  \`;

  if (matches[0]?.id) return String(matches[0].id);

  const fabricName = await settingName(tx, "settings_fabric_types", input.fabricTypeId);
  const colorName = await settingName(tx, "settings_colors", input.colorId);
  const yarnName = await settingName(tx, "settings_yarn_counts", input.yarnCountId);
  const stockId = id(type.toLowerCase());
  const code = await nextCode(tx, type);
  const name =
    type === "YM"
      ? \`\${yarnName} \${fabricName} \${colorName} Ham Kumaş\`
      : \`\${yarnName} \${fabricName} \${colorName} Mamül Kumaş\`;

  await tx\`
    insert into stock_cards (
      id, code, type, name, fabric_type_id, color_id, yarn_count_id,
      has_polyester, has_lycra,
      unit, current_stock_kg, critical_stock_kg, created_at, updated_at, is_active
    )
    values (
      \${stockId}, \${code}, \${type}, \${name}, \${input.fabricTypeId}, \${input.colorId}, \${input.yarnCountId},
      \${input.hasPolyester}, \${input.hasLycra},
      'kg', 0, 0, now(), now(), true
    )
  \`;
  return stockId;
}`);

serviceContent = serviceContent.replace(/export async function createStockCard\(payload: Record<string, unknown>\) \{[\s\S]+?\}\);\n\}/, `export async function createStockCard(payload: Record<string, unknown>) {
  const category = payload.category as "RAW" | "FABRIC";
  
  if (category === "FABRIC") {
    return sql.begin(async (tx) => {
      const fabricTypeId = optionalString(payload.fabricTypeId);
      const colorId = optionalString(payload.colorId);
      const yarnCountId = optionalString(payload.yarnCountId);
      const hasPolyester = boolValue(payload.hasPolyester);
      const hasLycra = boolValue(payload.hasLycra);
      
      const fabricName = await settingName(tx, "settings_fabric_types", fabricTypeId);
      const colorName = await settingName(tx, "settings_colors", colorId);
      const yarnName = await settingName(tx, "settings_yarn_counts", yarnCountId);
      
      const baseName = payload.name ? String(payload.name).trim() : \`\${yarnName} \${fabricName} \${colorName}\`;
      
      const ymId = id("stock");
      const ymCode = await nextCode(tx, "YM");
      await tx\`
        insert into stock_cards (
          id, code, type, name, fabric_type_id, color_id, yarn_count_id, has_polyester, has_lycra,
          unit, current_stock_kg, critical_stock_kg, created_at, updated_at, is_active
        )
        values (
          \${ymId}, \${ymCode}, 'YM', \${baseName + " Ham Kumaş"},
          \${fabricTypeId}, \${colorId}, \${yarnCountId},
          \${hasPolyester}, \${hasLycra},
          'kg', 0, \${payload.criticalStockKg ? numberValue(payload.criticalStockKg, "Kritik stok") : 0},
          now(), now(), true
        )
      \`;
      
      const mmId = id("stock");
      const mmCode = await nextCode(tx, "MM");
      await tx\`
        insert into stock_cards (
          id, code, type, name, fabric_type_id, color_id, yarn_count_id, has_polyester, has_lycra,
          unit, current_stock_kg, critical_stock_kg, created_at, updated_at, is_active
        )
        values (
          \${mmId}, \${mmCode}, 'MM', \${baseName + " Mamül Kumaş"},
          \${fabricTypeId}, \${colorId}, \${yarnCountId},
          \${hasPolyester}, \${hasLycra},
          'kg', 0, \${payload.criticalStockKg ? numberValue(payload.criticalStockKg, "Kritik stok") : 0},
          now(), now(), true
        )
      \`;
      
      return { id: ymId, code: ymCode };
    });
  }

  const type = requireString(payload.type, "Stok tipi") as StockType;
  if (!["YM", "MM", "IP", "LYC", "POLY"].includes(type)) throw new Error("Geçersiz stok tipi.");

  return sql.begin(async (tx) => {
    const code = typeof payload.code === "string" && payload.code.trim() ? payload.code.trim() : await nextCode(tx, type);
    const recordId = id("stock");
    await tx\`
      insert into stock_cards (
        id, code, type, name, fabric_type_id, color_id, yarn_count_id, has_polyester, has_lycra,
        unit, current_stock_kg, critical_stock_kg, created_at, updated_at, is_active
      )
      values (
        \${recordId}, \${code}, \${type}, \${requireString(payload.name, "Stok adı")},
        \${optionalString(payload.fabricTypeId)}, \${optionalString(payload.colorId)}, \${optionalString(payload.yarnCountId)},
        \${boolValue(payload.hasPolyester)}, \${boolValue(payload.hasLycra)},
        \${optionalString(payload.unit) ?? "kg"}, 0, \${payload.criticalStockKg ? numberValue(payload.criticalStockKg, "Kritik stok") : 0},
        now(), now(), true
      )
    \`;
    return { id: recordId, code };
  });
}`);

serviceContent = serviceContent.replace(/export async function updateStockCard\(recordId: string, payload: Record<string, unknown>\) \{[\s\S]+?return \{ id: recordId \};\n\}/, `export async function updateStockCard(recordId: string, payload: Record<string, unknown>) {
  const type = requireString(payload.type, "Stok tipi") as StockType;
  if (!["YM", "MM", "IP", "LYC", "POLY"].includes(type)) throw new Error("Geçersiz stok tipi.");
  await sql\`
    update stock_cards
    set type = \${type},
        name = \${requireString(payload.name, "Stok adı")},
        fabric_type_id = \${optionalString(payload.fabricTypeId)},
        color_id = \${optionalString(payload.colorId)},
        yarn_count_id = \${optionalString(payload.yarnCountId)},
        has_polyester = \${boolValue(payload.hasPolyester)},
        has_lycra = \${boolValue(payload.hasLycra)},
        critical_stock_kg = \${payload.criticalStockKg ? numberValue(payload.criticalStockKg, "Kritik stok") : 0},
        updated_at = now()
    where id = \${recordId}
  \`;
  return { id: recordId };
}`);

serviceContent = serviceContent.replace(/export async function createRawProduction\(payload: Record<string, unknown>\) \{[\s\S]+?\}\);\n\}/, `export async function createRawProduction(payload: Record<string, unknown>) {
  return sql.begin(async (tx) => {
    const productionId = id("raw");
    const date = requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Üretim tarihi");
    const orderId = requireString(payload.orderId, "Sipariş");
    const orderRows = await tx\`select ym_stock_id, mm_stock_id from orders where id = \${orderId} limit 1\`;
    if (!orderRows[0]) throw new Error("Sipariş bulunamadı.");
    const partyId = optionalString(payload.partyId) ?? id("party");
    let partyNo = optionalString(payload.partyNo);
    
    const rawWidth = numberValue(payload.rawWidth, "Ham en");
    const rawGsm = numberValue(payload.rawGsm, "Ham gramaj");

    if (!optionalString(payload.partyId)) {
      partyNo = await nextPartyNo(tx);
      await tx\`
        insert into parties (id, party_no, order_id, ym_stock_id, mm_stock_id, status, current_warehouse_id, raw_width, raw_gsm, timeline, created_at, updated_at)
        values (
          \${partyId}, \${partyNo}, \${orderId}, \${String(orderRows[0].ym_stock_id)}, \${String(orderRows[0].mm_stock_id)},
          'Örmede', \${requireString(payload.warehouseId, "Ham depo")}, \${rawWidth}, \${rawGsm},
          \${JSON.stringify([{ date, title: "Parti oluşturuldu", description: "Ham üretim kaydı ile otomatik açıldı.", tone: "blue" }])},
          now(), now()
        )
      \`;
    }

    const consumedItems = (payload.consumedItems as Array<Record<string, unknown>> | undefined) ?? [];
    const consumedKg = consumedItems.reduce((sum, item) => sum + numberValue(item.quantityKg, "Tüketim kg"), 0);
    const producedRawKg = numberValue(payload.producedRawKg, "Üretilen ham kg");
    const waste = calculateRawWaste(consumedKg, producedRawKg);
    await tx\`
      insert into production_raw (
        id, date, order_id, party_id, knitter_partner_id, warehouse_id, ym_stock_id, produced_raw_kg,
        raw_width, raw_gsm, consumed_items, waste_kg, waste_percent, description, created_at
      )
      values (
        \${productionId}, \${date}, \${orderId}, \${partyId}, \${requireString(payload.knitterPartnerId, "Fason örmeci")},
        \${requireString(payload.warehouseId, "Ham depo")}, \${String(orderRows[0].ym_stock_id)}, \${producedRawKg},
        \${rawWidth}, \${rawGsm}, \${JSON.stringify(consumedItems)}, \${waste.wasteKg}, \${waste.wastePercent}, \${optionalString(payload.description) ?? ""}, now()
      )
    \`;
    for (const item of consumedItems) {
      await addMovement(tx, {
        date,
        stockId: requireString(item.stockId, "Tüketilen stok"),
        warehouseId: requireString(item.warehouseId, "Tüketim deposu"),
        partyId,
        orderId,
        movementType: "Üretim tüketim",
        direction: "OUT",
        quantity: numberValue(item.quantityKg, "Tüketim kg"),
        description: "Ham üretimde iplik tüketimi",
        referenceType: "production_raw",
        referenceId: productionId,
      });
    }
    await addMovement(tx, {
      date,
      stockId: String(orderRows[0].ym_stock_id),
      warehouseId: requireString(payload.warehouseId, "Ham depo"),
      partyId,
      orderId,
      movementType: "Üretim giriş",
      direction: "IN",
      quantity: producedRawKg,
      description: "Ham üretimden ham kumaş girişi",
      referenceType: "production_raw",
      referenceId: productionId,
    });
    await tx\`
      update parties
      set raw_produced_kg = raw_produced_kg + \${producedRawKg},
          raw_consumed_kg = raw_consumed_kg + \${consumedKg},
          raw_waste_kg = raw_waste_kg + \${waste.wasteKg},
          raw_waste_percent = case when raw_consumed_kg + \${consumedKg} > 0 then ((raw_waste_kg + \${waste.wasteKg}) / (raw_consumed_kg + \${consumedKg})) * 100 else 0 end,
          updated_at = now()
      where id = \${partyId}
    \`;
    return { id: productionId, partyNo, waste };
  });
}`);

serviceContent = serviceContent.replace(/export async function createDyehouseProduction\(payload: Record<string, unknown>\) \{[\s\S]+?\}\);\n\}/, `export async function createDyehouseProduction(payload: Record<string, unknown>) {
  return sql.begin(async (tx) => {
    const productionId = id("dye");
    const date = requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Boyahane tarihi");
    const partyId = requireString(payload.partyId, "Parti");
    const partyRows = await tx\`select order_id, ym_stock_id, mm_stock_id from parties where id = \${partyId} limit 1\`;
    if (!partyRows[0]) throw new Error("Parti bulunamadı.");
    const inputRawKg = numberValue(payload.inputRawKg, "Giden ham kg");
    const finishedKg = numberValue(payload.finishedKg, "Dönen mamül kg");
    const waste = calculateDyehouseWaste(inputRawKg, finishedKg);
    
    const finishWidth = numberValue(payload.finishWidth, "Finish en");
    const finishGsm = numberValue(payload.finishGsm, "Finish gramaj");

    await tx\`
      insert into production_dyehouse (
        id, date, order_id, party_id, dyehouse_partner_id, input_warehouse_id, output_warehouse_id,
        ym_stock_id, mm_stock_id, input_raw_kg, finished_kg, waste_kg, waste_percent,
        process_type_ids, finish_width, finish_gsm, description, created_at
      )
      values (
        \${productionId}, \${date}, \${String(partyRows[0].order_id)}, \${partyId}, \${requireString(payload.dyehousePartnerId, "Boyahane")},
        \${requireString(payload.inputWarehouseId, "Giriş deposu")}, \${requireString(payload.outputWarehouseId, "Çıkış deposu")},
        \${String(partyRows[0].ym_stock_id)}, \${String(partyRows[0].mm_stock_id)}, \${inputRawKg}, \${finishedKg}, \${waste.wasteKg}, \${waste.wastePercent},
        \${JSON.stringify(payload.processTypeIds ?? [])}, \${finishWidth}, \${finishGsm},
        \${optionalString(payload.description) ?? ""}, now()
      )
    \`;
    await addMovement(tx, { date, stockId: String(partyRows[0].ym_stock_id), warehouseId: requireString(payload.inputWarehouseId, "Giriş deposu"), partyId, orderId: String(partyRows[0].order_id), movementType: "Üretim tüketim", direction: "OUT", quantity: inputRawKg, description: "Boyahanede ham kumaş tüketimi", referenceType: "production_dyehouse", referenceId: productionId });
    await addMovement(tx, { date, stockId: String(partyRows[0].mm_stock_id), warehouseId: requireString(payload.outputWarehouseId, "Çıkış deposu"), partyId, orderId: String(partyRows[0].order_id), movementType: "Üretim giriş", direction: "IN", quantity: finishedKg, description: "Boyahaneden mamül kumaş girişi", referenceType: "production_dyehouse", referenceId: productionId });
    await tx\`
      update parties
      set dyehouse_input_kg = dyehouse_input_kg + \${inputRawKg},
          finished_kg = finished_kg + \${finishedKg},
          dyehouse_waste_kg = dyehouse_waste_kg + \${waste.wasteKg},
          dyehouse_waste_percent = case when dyehouse_input_kg + \${inputRawKg} > 0 then ((\${waste.wasteKg}) / (dyehouse_input_kg + \${inputRawKg})) * 100 else 0 end,
          finish_width = \${finishWidth},
          finish_gsm = \${finishGsm},
          status = 'Mamül Hazır',
          updated_at = now()
      where id = \${partyId}
    \`;
    await tx\`update orders set status = 'Mamül Hazır', updated_at = now() where id = \${String(partyRows[0].order_id)}\`;
    return { id: productionId, waste };
  });
}`);

fs.writeFileSync(erpWriteServicePath, serviceContent, 'utf8');

const formsPath = 'src/components/forms.tsx';
let formsContent = fs.readFileSync(formsPath, 'utf8');

for (const [bad, good] of Object.entries(charMapping)) {
    formsContent = formsContent.split(bad).join(good);
}

formsContent = formsContent.replace(/export function StockCardForm\(\) \{[\s\S]+?return \([\s\S]+?\n  \);\n\}/, `export function StockCardForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<"RAW" | "FABRIC">("RAW");
  const [type, setType] = useState<string>("IP");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries());
    (payload as any).category = category;
    
    try {
      await postJson("/api/stocks", payload);
      formElement.reset();
      refreshInBackground(refresh);
      toast.success(category === "FABRIC" ? "YM ve MM stok kartları başarıyla oluşturuldu." : "Hammadde stok kartı kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Stok kartı kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="flex gap-4 p-1 bg-slate-100 rounded-2xl mb-2">
        <button 
          type="button" 
          className={\`flex-1 py-2 rounded-xl text-sm font-semibold transition \${category === 'RAW' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}\`}
          onClick={() => { setCategory('RAW'); setType('IP'); }}
        >
          Hammadde
        </button>
        <button 
          type="button" 
          className={\`flex-1 py-2 rounded-xl text-sm font-semibold transition \${category === 'FABRIC' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}\`}
          onClick={() => { setCategory('FABRIC'); setType('YM'); }}
        >
          Kumaş (YM/MM)
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {category === 'RAW' ? (
          <Field label="Tür">
            <select className={inputClass} name="type" value={type} onChange={(e) => setType(e.target.value)} required>
              <option value="IP">İplik (IP)</option>
              <option value="LYC">Likra (LYC)</option>
              <option value="POLY">Polyester (POLY)</option>
            </select>
          </Field>
        ) : (
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 sm:col-span-2">
            <p className="text-xs text-blue-700 font-medium">Bu işlem ile sistemde aynı özelliklere sahip birer adet <b>Ham (YM)</b> ve <b>Mamül (MM)</b> stok kartı otomatik açılacaktır.</p>
          </div>
        )}

        <Field label={category === 'RAW' ? "Hammadde Adı" : "Kumaş Temel Adı"}>
          <input className={inputClass} name="name" placeholder={category === 'RAW' ? "Örn: 20/1 Siyah" : "Örn: 20/10 İki İplik Siyah"} required />
        </Field>

        <Field label="Ne (İplik No)">
          <select className={inputClass} name="yarnCountId">
            <option value="">Seçiniz</option>
            {data.yarnCounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>

        <Field label="Renk">
          <select className={inputClass} name="colorId">
            <option value="">Seçiniz</option>
            {data.colors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>

        {category === 'FABRIC' && (
          <Field label="Kumaş cinsi">
            <select className={inputClass} name="fabricTypeId" required>
              <option value="">Seçiniz</option>
              {data.fabricTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        )}

        <Field label="Kritik stok kg">
          <input className={inputClass} name="criticalStockKg" type="number" defaultValue={0} />
        </Field>

        {category === 'FABRIC' && (
          <div className="flex gap-4 text-sm text-slate-600 sm:col-span-2 mt-2">
            <label className="flex items-center gap-2"><input name="hasPolyester" type="checkbox" /> Polyesterli</label>
            <label className="flex items-center gap-2"><input name="hasLycra" type="checkbox" /> Likralı</label>
          </div>
        )}
      </div>
      <FormButton loading={loading}>Stok kartlarını oluştur</FormButton>
    </form>
  );
}`);

formsContent = formsContent.replace(/export function StockCardEditForm\(\{ stock, onDone \}\: \{ stock\: StockCard; onDone\: \(\) => void \}\) \{[\s\S]+?return \([\s\S]+?\n  \);\n\}/, `export function StockCardEditForm({ stock, onDone }: { stock: StockCard; onDone: () => void }) {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await patchJson(\`/api/stocks/\${stock.id}\`, {
        ...Object.fromEntries(form.entries()),
        hasPolyester: form.get("hasPolyester") === "on",
        hasLycra: form.get("hasLycra") === "on",
      });
      refreshInBackground(refresh);
      onDone();
      toast.success("Stok kartı güncellendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Stok kartı güncellenemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Stok tipi"><select className={inputClass} name="type" defaultValue={stock.type} required><option value="IP">IP</option><option value="LYC">LYC</option><option value="POLY">POLY</option><option value="YM">YM</option><option value="MM">MM</option></select></Field>
        <Field label="Stok adı"><input className={inputClass} name="name" defaultValue={stock.name} required /></Field>
        <Field label="Ne"><select className={inputClass} name="yarnCountId" defaultValue={stock.yarnCountId ?? ""}><option value="">Seçiniz</option>{data.yarnCounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Renk"><select className={inputClass} name="colorId" defaultValue={stock.colorId ?? ""}><option value="">Seçiniz</option>{data.colors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Kumaş cinsi"><select className={inputClass} name="fabricTypeId" defaultValue={stock.fabricTypeId ?? ""}><option value="">Seçiniz</option>{data.fabricTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Kritik stok kg"><input className={inputClass} name="criticalStockKg" type="number" defaultValue={stock.criticalStockKg} /></Field>
      </div>
      <div className="flex gap-4 text-sm text-slate-600">
        <label className="flex items-center gap-2"><input defaultChecked={stock.hasPolyester} name="hasPolyester" type="checkbox" /> Polyesterli</label>
        <label className="flex items-center gap-2"><input defaultChecked={stock.hasLycra} name="hasLycra" type="checkbox" /> Likralı</label>
      </div>
      <FormButton loading={loading}>Stok kartını güncelle</FormButton>
    </form>
  );
}`);

formsContent = formsContent.replace(/export function RawProductionForm\(\) \{[\s\S]+?return \([\s\S]+?\n  \);\n\}/, `export function RawProductionForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await postJson("/api/production/raw", {
        date: form.get("date"),
        orderId: form.get("orderId"),
        partyId: form.get("partyId") || null,
        knitterPartnerId: form.get("knitterPartnerId"),
        warehouseId: form.get("warehouseId"),
        producedRawKg: form.get("producedRawKg"),
        rawWidth: form.get("rawWidth"),
        rawGsm: form.get("rawGsm"),
        consumedItems: [{ stockId: form.get("consumedStockId"), warehouseId: form.get("consumedWarehouseId"), quantityKg: form.get("consumedKg") }],
        description: form.get("description"),
      });
      formElement.reset();
      refreshInBackground(refresh);
      toast.success("Ham üretim kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ham üretim kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tarih"><input className={inputClass} name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="Sipariş"><select className={inputClass} name="orderId" required>{data.orders.map((item) => <option key={item.id} value={item.id}>{item.orderNo} - {item.customerName}</option>)}</select></Field>
        <Field label="Mevcut parti"><select className={inputClass} name="partyId"><option value="">Yeni parti aç</option>{data.parties.map((item) => <option key={item.id} value={item.id}>{item.partyNo}</option>)}</select></Field>
        <Field label="Fason örmeci"><select className={inputClass} name="knitterPartnerId" required>{data.partners.filter((item) => item.type === "KNITTER").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Ham giriş deposu"><select className={inputClass} name="warehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Üretilen ham kg"><input className={inputClass} name="producedRawKg" type="number" required /></Field>
        <Field label="Ham en (Çıkış)"><input className={inputClass} name="rawWidth" type="number" required /></Field>
        <Field label="Ham gramaj (Çıkış)"><input className={inputClass} name="rawGsm" type="number" required /></Field>
        <Field label="Tüketilen stok"><select className={inputClass} name="consumedStockId" required>{data.stockCards.filter((item) => ["IP", "LYC", "POLY"].includes(item.type)).map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
        <Field label="Tüketim deposu"><select className={inputClass} name="consumedWarehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Tüketilen kg"><input className={inputClass} name="consumedKg" type="number" required /></Field>
      </div>
      <Field label="Açıklama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>Ham üretimi kaydet</FormButton>
    </form>
  );
}`);

fs.writeFileSync(formsPath, formsContent, 'utf8');

console.log('Refactoring complete.');
