const fs = require('fs');
const path = 'c:/Users/ibrahimyokus/Desktop/convert/Yokus Orme Erp Yazilimi/src/components/forms.tsx';
let content = fs.readFileSync(path, 'utf8');

function replaceFunc(name, newBody) {
    const startStr = 'export function ' + name;
    const startIdx = content.indexOf(startStr);
    if (startIdx === -1) {
        console.log('Could not find ' + startStr);
        return;
    }
    
    let depth = 0;
    let endIdx = -1;
    let foundFirstBrace = false;
    
    for (let i = startIdx; i < content.length; i++) {
        if (content[i] === '{') {
            depth++;
            foundFirstBrace = true;
        }
        if (content[i] === '}') {
            depth--;
            if (foundFirstBrace && depth === 0) {
                endIdx = i + i; // Typo here, should be i+1
                endIdx = i + 1;
                break;
            }
        }
    }
    
    if (endIdx !== -1) {
        content = content.substring(0, startIdx) + newBody + content.substring(endIdx);
        console.log('Replaced ' + name);
    } else {
        console.log('Could not find end of ' + name);
    }
}

const rawProdForm = "export function RawProductionForm({ initialData }: { initialData?: RawProduction }) {\n" +
"  const { data, refresh } = useErpData();\n" +
"  const [loading, setLoading] = useState(false);\n" +
"  const [orderId, setOrderId] = useState(initialData?.orderId || '');\n" +
"  const [partyId, setPartyId] = useState(initialData?.partyId || '');\n" +
"  const [consumedItems, setConsumedItems] = useState<{ stockId: string, warehouseId: string, quantity: number, lotNo?: string }[]>(initialData?.consumedItems || []);\n" +
"  const [producedRawKg, setProducedRawKg] = useState(initialData?.producedRawKg?.toString() || '');\n" +
"  \n" +
"  const selectedOrder = data.orders.find(o => o.id === orderId);\n" +
"  const orderParties = data.parties.filter(p => p.orderId === orderId);\n" +
"  \n" +
"  async function submit(event: React.FormEvent<HTMLFormElement>) {\n" +
"    event.preventDefault();\n" +
"    setLoading(true);\n" +
"    const form = new FormData(event.currentTarget);\n" +
"    try {\n" +
"      const payload = {\n" +
"        date: form.get('date'),\n" +
"        orderId: orderId,\n" +
"        partyId: partyId,\n" +
"        knitterPartnerId: form.get('knitterPartnerId'),\n" +
"        warehouseId: form.get('warehouseId'),\n" +
"        producedRawKg: Number(producedRawKg),\n" +
"        consumedItems: consumedItems,\n" +
"        description: form.get('description'),\n" +
"      };\n" +
"      if (initialData) await patchJson('/api/production/raw/' + initialData.id, payload);\n" +
"      else await postJson('/api/production/raw', payload);\n" +
"      refreshInBackground(refresh);\n" +
"      toast.success(initialData ? 'Üretim güncellendi.' : 'Ham üretim kaydedildi.');\n" +
"    } catch (error) {\n" +
"      toast.error(error instanceof Error ? error.message : 'Hata oluştu');\n" +
"    } finally { setLoading(false); }\n" +
"  }\n" +
"\n" +
"  return (\n" +
"    <form className='grid gap-4' onSubmit={submit}>\n" +
"      <div className='grid gap-4 sm:grid-cols-2'>\n" +
"        <Field label='Tarih'><input className={inputClass} name='date' type='date' defaultValue={initialData?.date || new Date().toISOString().slice(0, 10)} required /></Field>\n" +
"        <Field label='Sipariş'><select className={inputClass} value={orderId} onChange={e => setOrderId(e.target.value)} required><option value=''>Seçiniz</option>{data.orders.map(o => <option key={o.id} value={o.id}>{o.orderNo} - {o.customerName}</option>)}</select></Field>\n" +
"        <Field label='Parti'><select className={inputClass} value={partyId} onChange={e => setPartyId(e.target.value)} required><option value=''>Seçiniz</option>{orderParties.map(p => <option key={p.id} value={p.id}>{p.partyNo}</option>)}</select></Field>\n" +
"        <Field label='Fasoncu (Örmeci)'><select className={inputClass} name='knitterPartnerId' defaultValue={initialData?.knitterPartnerId} required>{data.partners.filter(p => p.type === 'KNITTER').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>\n" +
"        <Field label='Ham Giriş Deposu'><select className={inputClass} name='warehouseId' defaultValue={initialData?.warehouseId} required>{data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>\n" +
"        <Field label='Üretilen Ham (Kg)'><input className={inputClass} type='number' value={producedRawKg} onChange={e => setProducedRawKg(e.target.value)} required /></Field>\n" +
"      </div>\n" +
"      <div className='premium-card p-4 rounded-2xl bg-slate-50'>\n" +
"        <h3 className='text-xs font-bold uppercase text-slate-400 mb-3'>Tüketilen İplikler</h3>\n" +
"        <div className='space-y-3'>\n" +
"           {consumedItems.map((item, idx) => (\n" +
"             <div key={idx} className='flex gap-2 items-center bg-white p-2 rounded-xl shadow-sm'>\n" +
"                <div className='flex-1 text-sm font-medium'>{getName(data.stockCards, item.stockId)} - {getName(data.warehouses, item.warehouseId)} ({item.lotNo})</div>\n" +
"                <div className='w-24 text-right font-bold text-blue-600'>{item.quantity} kg</div>\n" +
"                <button type='button' onClick={() => setConsumedItems(consumedItems.filter((_, i) => i !== idx))} className='text-rose-500 p-1 hover:bg-rose-50 rounded-lg'>&times;</button>\n" +
"             </div>\n" +
"           ))}\n" +
"           <button type='button' onClick={() => {\n" +
"             const stockId = prompt('Stok ID (veya listeden seçilecek yapı)');\n" +
"             if (stockId) setConsumedItems([...consumedItems, { stockId, warehouseId: 'wh-001', quantity: 100, lotNo: 'L123' }]);\n" +
"           }} className='w-full py-2 border-2 border-dashed border-slate-200 rounded-2xl text-xs font-bold text-slate-400 hover:border-blue-200 hover:text-blue-500 transition-colors'>+ Yeni İplik Ekle</button>\n" +
"        </div>\n" +
"      </div>\n" +
"      <Field label='Açıklama'><textarea className={inputClass} name='description' defaultValue={initialData?.description} rows={3} /></Field>\n" +
"      <FormButton loading={loading}>{initialData ? 'Güncellemeyi Kaydet' : 'Ham Üretimi Kaydet'}</FormButton>\n" +
"    </form>\n" +
"  );\n" +
"}";

const dyehouseProdForm = "export function DyehouseProductionForm({ initialData }: { initialData?: DyehouseProduction }) {\n" +
"  const { data, refresh } = useErpData();\n" +
"  const [loading, setLoading] = useState(false);\n" +
"  const [partyId, setPartyId] = useState(initialData?.partyId || '');\n" +
"  const [inputWarehouseId, setInputWarehouseId] = useState(initialData?.inputWarehouseId || '');\n" +
"  const [inputRawKg, setInputRawKg] = useState(initialData?.inputRawKg?.toString() || '');\n" +
"  \n" +
"  const selectedParty = data.parties.find(p => p.id === partyId);\n" +
"  \n" +
"  async function submit(event: React.FormEvent<HTMLFormElement>) {\n" +
"    event.preventDefault();\n" +
"    setLoading(true);\n" +
"    const form = new FormData(event.currentTarget);\n" +
"    try {\n" +
"      const payload = {\n" +
"        date: form.get('date'),\n" +
"        partyId: partyId,\n" +
"        dyehousePartnerId: form.get('dyehousePartnerId'),\n" +
"        inputWarehouseId: inputWarehouseId,\n" +
"        outputWarehouseId: form.get('outputWarehouseId'),\n" +
"        inputRawKg: Number(inputRawKg),\n" +
"        finishedKg: Number(form.get('finishedKg')),\n" +
"        finishWidth: Number(form.get('finishWidth')),\n" +
"        finishGsm: Number(form.get('finishGsm')),\n" +
"        description: form.get('description'),\n" +
"        orderId: selectedParty?.orderId\n" +
"      };\n" +
"      if (initialData) await patchJson('/api/production/dyehouse/' + initialData.id, payload);\n" +
"      else await postJson('/api/production/dyehouse', payload);\n" +
"      refreshInBackground(refresh);\n" +
"      toast.success(initialData ? 'Güncellendi' : 'Kaydedildi');\n" +
"    } catch (error) { toast.error(error instanceof Error ? error.message : 'Hata'); }\n" +
"    finally { setLoading(false); }\n" +
"  }\n" +
"\n" +
"  return (\n" +
"    <form className='grid gap-4' onSubmit={submit}>\n" +
"      <div className='grid gap-4 sm:grid-cols-2'>\n" +
"        <Field label='Tarih'><input className={inputClass} name='date' type='date' defaultValue={initialData?.date || new Date().toISOString().slice(0, 10)} required /></Field>\n" +
"        <Field label='Parti'><select className={inputClass} value={partyId} onChange={e => setPartyId(e.target.value)} required><option value=''>Seçiniz</option>{data.parties.map(p => <option key={p.id} value={p.id}>{p.partyNo}</option>)}</select></Field>\n" +
"        <Field label='Boyahane'><select className={inputClass} name='dyehousePartnerId' defaultValue={initialData?.dyehousePartnerId} required>{data.partners.filter(p => p.type === 'DYEHOUSE').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>\n" +
"        <Field label='Ham Çıkış Deposu'><select className={inputClass} value={inputWarehouseId} onChange={e => setInputWarehouseId(e.target.value)} required><option value=''>Seçiniz</option>{data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>\n" +
"        <Field label='Mamül Giriş Deposu'><select className={inputClass} name='outputWarehouseId' defaultValue={initialData?.outputWarehouseId} required>{data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>\n" +
"        <Field label='Giden Ham (Kg)'><input className={inputClass} type='number' value={inputRawKg} onChange={e => setInputRawKg(e.target.value)} required /></Field>\n" +
"        <Field label='Dönen Mamül (Kg)'><input className={inputClass} name='finishedKg' type='number' defaultValue={initialData?.finishedKg} required /></Field>\n" +
"        <Field label='Finish En'><input className={inputClass} name='finishWidth' type='number' defaultValue={initialData?.finishWidth} required /></Field>\n" +
"        <Field label='Finish Gramaj'><input className={inputClass} name='finishGsm' type='number' defaultValue={initialData?.finishGsm} required /></Field>\n" +
"      </div>\n" +
"      <Field label='Açıklama'><textarea className={inputClass} name='description' defaultValue={initialData?.description} rows={3} /></textarea></Field>\n" +
"      <FormButton loading={loading}>{initialData ? 'Güncelle' : 'Kaydet'}</FormButton>\n" +
"    </form>\n" +
"  );\n" +
"}";

const transForm = "export function TransferForm({ initialData }: { initialData?: Transfer }) {\n" +
"  const { data, refresh } = useErpData();\n" +
"  const [loading, setLoading] = useState(false);\n" +
"  const [items, setItems] = useState<any[]>(initialData?.items ? normalizeItems(initialData.items) : []);\n" +
"\n" +
"  async function submit(event: React.FormEvent<HTMLFormElement>) {\n" +
"    event.preventDefault();\n" +
"    if (items.length === 0) { toast.error('En az bir ürün ekleyin'); return; }\n" +
"    setLoading(true);\n" +
"    const form = new FormData(event.currentTarget);\n" +
"    try {\n" +
"      const payload = {\n" +
"        date: form.get('date'),\n" +
"        fromWarehouseId: form.get('fromWarehouseId'),\n" +
"        toWarehouseId: form.get('toWarehouseId'),\n" +
"        items: items,\n" +
"        description: form.get('description')\n" +
"      };\n" +
"      if (initialData) await patchJson('/api/transfers/' + initialData.id, payload);\n" +
"      else await postJson('/api/transfers', payload);\n" +
"      refreshInBackground(refresh);\n" +
"      toast.success(initialData ? 'Transfer güncellendi' : 'Transfer kaydedildi');\n" +
"    } catch (error) { toast.error(error instanceof Error ? error.message : 'Hata'); }\n" +
"    finally { setLoading(false); }\n" +
"  }\n" +
"\n" +
"  return (\n" +
"    <form className='grid gap-4' onSubmit={submit}>\n" +
"      <div className='grid gap-4 sm:grid-cols-2'>\n" +
"        <Field label='Tarih'><input className={inputClass} name='date' type='date' defaultValue={initialData?.date || new Date().toISOString().slice(0, 10)} required /></Field>\n" +
"        <Field label='Kaynak Depo'><select className={inputClass} name='fromWarehouseId' defaultValue={initialData?.fromWarehouseId} required>{data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>\n" +
"        <Field label='Hedef Depo'><select className={inputClass} name='toWarehouseId' defaultValue={initialData?.toWarehouseId} required>{data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>\n" +
"      </div>\n" +
"      <div className='premium-card p-4 rounded-2xl bg-slate-50'>\n" +
"         <h3 className='text-xs font-bold uppercase text-slate-400 mb-3'>Ürün Listesi</h3>\n" +
"         <div className='space-y-2'>\n" +
"            {items.map((it, idx) => (\n" +
"              <div key={idx} className='flex gap-2 items-center bg-white p-2 rounded-xl shadow-sm'>\n" +
"                <div className='flex-1 text-sm'>{getName(data.stockCards, it.stockId)} ({it.lotNo || it.partyNo})</div>\n" +
"                <div className='font-bold text-blue-600'>{it.quantity} kg</div>\n" +
"                <button type='button' onClick={() => setItems(items.filter((_, i) => i !== idx))} className='text-rose-500 p-1'>&times;</button>\n" +
"              </div>\n" +
"            ))}\n" +
"            <button type='button' onClick={() => setItems([...items, { stockId: 'st-001', quantity: 50 }])} className='w-full py-2 border-2 border-dashed border-slate-200 rounded-2xl text-xs font-bold text-slate-400'>+ Ürün Ekle</button>\n" +
"         </div>\n" +
"      </div>\n" +
"      <Field label='Açıklama'><textarea className={inputClass} name='description' defaultValue={initialData?.description} rows={2} /></Field>\n" +
"      <FormButton loading={loading}>{initialData ? 'Güncelle' : 'Transferi Başlat'}</FormButton>\n" +
"    </form>\n" +
"  );\n" +
"}";

replaceFunc('RawProductionForm', rawProdForm);
replaceFunc('DyehouseProductionForm', dyehouseProdForm);
replaceFunc('TransferForm', transForm);

fs.writeFileSync(path, content, 'utf8');
console.log('Update finished');
