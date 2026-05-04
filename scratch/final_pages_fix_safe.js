const fs = require('fs');
const path = 'c:/Users/ibrahimyokus/Desktop/convert/Yokus Orme Erp Yazilimi/src/components/pages.tsx';
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

const prodPage = "export function ProductionPage({ type }: { type: 'raw' | 'dyehouse' }) {\n" +
"  const { data, refresh } = useErpData();\n" +
"  const [open, setOpen] = useState(false);\n" +
"  const [editing, setEditing] = useState<RawProduction | DyehouseProduction | null>(null);\n" +
"  const [deleteTarget, setDeleteTarget] = useState<RawProduction | DyehouseProduction | null>(null);\n" +
"  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '' });\n" +
"  const setFilter = (key: string, value: string) => setFilters((curr) => ({ ...curr, [key]: value }));\n" +
"  const isRaw = type === 'raw';\n" +
"  \n" +
"  const filteredRaw = useMemo(() => data.productionRaw.filter((row) => {\n" +
"    if (filters.dateFrom && row.date < filters.dateFrom) return false;\n" +
"    if (filters.dateTo && row.date > filters.dateTo) return false;\n" +
"    return true;\n" +
"  }), [data.productionRaw, filters]);\n" +
"  \n" +
"  const filteredDyehouse = useMemo(() => data.productionDyehouse.filter((row) => {\n" +
"    if (filters.dateFrom && row.date < filters.dateFrom) return false;\n" +
"    if (filters.dateTo && row.date > filters.dateTo) return false;\n" +
"    return true;\n" +
"  }), [data.productionDyehouse, filters]);\n" +
"\n" +
"  async function deleteProductionRecord() {\n" +
"    if (!deleteTarget) return;\n" +
"    try {\n" +
"      await apiDelete('/api/production/' + (isRaw ? 'raw' : 'dyehouse') + '/' + deleteTarget.id);\n" +
"      refreshInBackground(refresh);\n" +
"      toast.success(isRaw ? 'Ham üretim kaydı silindi.' : 'Boyahane üretim kaydı silindi.');\n" +
"      setDeleteTarget(null);\n" +
"    } catch (error) {\n" +
"      toast.error(error instanceof Error ? error.message : 'Üretim silinemedi.');\n" +
"    }\n" +
"  }\n" +
"\n" +
"  const rawColumns: Column<RawProduction>[] = [\n" +
"    { header: 'Tarih', cell: (row) => formatDate(row.date) },\n" +
"    { header: 'Sipariş', cell: (row) => data.orders.find((order) => order.id === row.orderId)?.orderNo ?? '-' },\n" +
"    { header: 'Parti', cell: (row) => data.parties.find((party) => party.id === row.partyId)?.partyNo ?? '-' },\n" +
"    { header: 'Fasoncu', cell: (row) => getName(data.partners, row.knitterPartnerId) },\n" +
"    { header: 'Ham kg', cell: (row) => formatKg(row.producedRawKg) },\n" +
"    { header: 'Fire', cell: (row) => <StatusBadge tone={wasteTone(row.wastePercent)}>{formatPercent(row.wastePercent)}</StatusBadge> },\n" +
"    { header: 'İşlem', className: 'text-right', cell: (row) => (\n" +
"      <div className='flex justify-end gap-2'>\n" +
"        <button className='rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-700 transition-colors' onClick={() => setEditing(row)} type='button'>Düzenle</button>\n" +
"        <button className='rounded-xl border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors' onClick={() => setDeleteTarget(row)} type='button'>Sil</button>\n" +
"      </div>\n" +
"    ) },\n" +
"  ];\n" +
"\n" +
"  const dyehouseColumns: Column<DyehouseProduction>[] = [\n" +
"    { header: 'Tarih', cell: (row) => formatDate(row.date) },\n" +
"    { header: 'Sipariş', cell: (row) => data.orders.find((order) => order.id === row.orderId)?.orderNo ?? '-' },\n" +
"    { header: 'Parti', cell: (row) => data.parties.find((party) => party.id === row.partyId)?.partyNo ?? '-' },\n" +
"    { header: 'Boyahane', cell: (row) => getName(data.partners, row.dyehousePartnerId) },\n" +
"    { header: 'Giden', cell: (row) => formatKg(row.inputRawKg) },\n" +
"    { header: 'Dönen', cell: (row) => formatKg(row.finishedKg) },\n" +
"    { header: 'Fire', cell: (row) => <StatusBadge tone={wasteTone(row.wastePercent)}>{formatPercent(row.wastePercent)}</StatusBadge> },\n" +
"    { header: 'İşlem', className: 'text-right', cell: (row) => (\n" +
"      <div className='flex justify-end gap-2'>\n" +
"        <button className='rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-700 transition-colors' onClick={() => setEditing(row)} type='button'>Düzenle</button>\n" +
"        <button className='rounded-xl border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors' onClick={() => setDeleteTarget(row)} type='button'>Sil</button>\n" +
"      </div>\n" +
"    ) },\n" +
"  ];\n" +
"\n" +
"  return (\n" +
"    <div className='space-y-6'>\n" +
"      <PageHeader eyebrow='Üretim' title={isRaw ? 'Ham Kumaş Üretimi' : 'Boyahane Üretimi'} description={isRaw ? 'İplik tüketimi, ham kumaş girişi, fire ve fasoncu depo kapanış mutabakatı.' : 'Ham çıkışı, mamül girişi, finish özellikleri ve boyahane fire hesaplama.'} icon={Factory} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className='size-4' />Yeni kayıt</button>} />\n" +
"      \n" +
"      <div className='premium-card rounded-2xl p-5 mb-6'>\n" +
"        <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>\n" +
"          <div>\n" +
"            <h2 className='font-semibold text-slate-950'>Üretim Filtreleri</h2>\n" +
"            <p className='mt-1 text-sm text-slate-500'>Tarihe göre kayıtları daraltın.</p>\n" +
"          </div>\n" +
"          <button className='rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600' onClick={() => setFilters({ dateFrom: '', dateTo: '' })} type='button'>Filtreleri temizle</button>\n" +
"        </div>\n" +
"        <div className='mt-4 grid gap-3 md:grid-cols-2'>\n" +
"          <label className='space-y-1 text-xs font-semibold text-slate-400'>Başlangıç<input className='w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none' type='date' value={filters.dateFrom} onChange={(e) => setFilter('dateFrom', e.target.value)} /></label>\n" +
"          <label className='space-y-1 text-xs font-semibold text-slate-400'>Bitiş<input className='w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none' type='date' value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)} /></label>\n" +
"        </div>\n" +
"      </div>\n" +
"\n" +
"      {isRaw ? (\n" +
"        <DataTable rows={filteredRaw} columns={rawColumns} searchPlaceholder='Sipariş, parti, fasoncu veya açıklamada ara' getSearchText={(row) => [data.orders.find((order) => order.id === row.orderId)?.orderNo, data.parties.find((party) => party.id === row.partyId)?.partyNo, getName(data.partners, row.knitterPartnerId), row.description].join(' ')} />\n" +
"      ) : (\n" +
"        <DataTable rows={filteredDyehouse} columns={dyehouseColumns} searchPlaceholder='Sipariş, parti, boyahane veya açıklamada ara' getSearchText={(row) => [data.orders.find((order) => order.id === row.orderId)?.orderNo, data.parties.find((party) => party.id === row.partyId)?.partyNo, getName(data.partners, row.dyehousePartnerId), row.description].join(' ')} />\n" +
"      )}\n" +
"\n" +
"      <FormDrawer open={open || !!editing} title={editing ? (isRaw ? 'Ham Üretimi Düzenle' : 'Boyahane Üretimini Düzenle') : (isRaw ? 'Yeni Üretim Kaydı' : 'Yeni Boyahane Üretimi')} onClose={() => { setOpen(false); setEditing(null); }}>\n" +
"        {isRaw ? <RawProductionForm initialData={editing as RawProduction} /> : <DyehouseProductionForm initialData={editing as DyehouseProduction} />}\n" +
"      </FormDrawer>\n" +
"\n" +
"      <ConfirmModal\n" +
"        open={Boolean(deleteTarget)}\n" +
"        title='Üretim kaydı silinsin mi?'\n" +
"        description='Bu işlem kaydı ve ilgili tüm stok hareketlerini kalıcı olarak siler.'\n" +
"        confirmLabel='Kalıcı olarak sil'\n" +
"        tone='danger'\n" +
"        onClose={() => setDeleteTarget(null)}\n" +
"        onConfirm={deleteProductionRecord}\n" +
"      />\n" +
"    </div>\n" +
"  );\n" +
"}";

const transPage = "export function TransfersPage() {\n" +
"  const { data, refresh } = useErpData();\n" +
"  const [open, setOpen] = useState(false);\n" +
"  const [editing, setEditing] = useState<Transfer | null>(null);\n" +
"  const [deleteTarget, setDeleteTarget] = useState<Transfer | null>(null);\n" +
"  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '' });\n" +
"  const setFilter = (key: string, value: string) => setFilters((curr) => ({ ...curr, [key]: value }));\n" +
"\n" +
"  const filteredTransfers = useMemo(() => data.transfers.filter((row) => {\n" +
"    if (filters.dateFrom && row.date < filters.dateFrom) return false;\n" +
"    if (filters.dateTo && row.date > filters.dateTo) return false;\n" +
"    return true;\n" +
"  }), [data.transfers, filters]);\n" +
"\n" +
"  async function deleteTransferRecord() {\n" +
"    if (!deleteTarget) return;\n" +
"    try {\n" +
"      await apiDelete('/api/transfers/' + deleteTarget.id);\n" +
"      refreshInBackground(refresh);\n" +
"      toast.success('Transfer kaydı silindi.');\n" +
"      setDeleteTarget(null);\n" +
"    } catch (error) {\n" +
"      toast.error(error instanceof Error ? error.message : 'Transfer silinemedi.');\n" +
"    }\n" +
"  }\n" +
"\n" +
"  return (\n" +
"    <div className='space-y-6'>\n" +
"      <PageHeader eyebrow='Stok' title='Depolar Arası Transfer' description='İplik, ham veya mamül kumaşların depolar arası sevkiyat kaydı.' icon={Truck} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className='size-4' />Yeni transfer</button>} />\n" +
"      \n" +
"      <div className='premium-card rounded-2xl p-5 mb-6'>\n" +
"        <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>\n" +
"          <div>\n" +
"            <h2 className='font-semibold text-slate-950'>Transfer Filtreleri</h2>\n" +
"            <p className='mt-1 text-sm text-slate-500'>Tarihe göre kayıtları daraltın.</p>\n" +
"          </div>\n" +
"          <button className='rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600' onClick={() => setFilters({ dateFrom: '', dateTo: '' })} type='button'>Filtreleri temizle</button>\n" +
"        </div>\n" +
"        <div className='mt-4 grid gap-3 md:grid-cols-2'>\n" +
"          <label className='space-y-1 text-xs font-semibold text-slate-400'>Başlangıç<input className='w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none' type='date' value={filters.dateFrom} onChange={(e) => setFilter('dateFrom', e.target.value)} /></label>\n" +
"          <label className='space-y-1 text-xs font-semibold text-slate-400'>Bitiş<input className='w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none' type='date' value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)} /></label>\n" +
"        </div>\n" +
"      </div>\n" +
"\n" +
"      <DataTable rows={filteredTransfers} columns={[\n" +
"        { header: 'Tarih', cell: (row) => formatDate(row.date) },\n" +
"        { header: 'Kaynak', cell: (row) => getName(data.warehouses, row.fromWarehouseId) },\n" +
"        { header: 'Hedef', cell: (row) => getName(data.warehouses, row.toWarehouseId) },\n" +
"        { header: 'Miktar', cell: (row) => formatKg(normalizeItems(row.items).reduce((sum, item) => sum + (item.quantity || 0), 0)) },\n" +
"        { header: 'İşlem', className: 'text-right', cell: (row) => (\n" +
"          <div className='flex justify-end gap-2'>\n" +
"            <button className='rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-700 transition-colors' onClick={() => setEditing(row)} type='button'>Düzenle</button>\n" +
"            <button className='rounded-xl border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors' onClick={() => setDeleteTarget(row)} type='button'>Sil</button>\n" +
"          </div>\n" +
"        )},\n" +
"      ]} searchPlaceholder='Kaynak depo, hedef depo veya açıklamada ara' getSearchText={(row) => [getName(data.warehouses, row.fromWarehouseId), getName(data.warehouses, row.toWarehouseId), row.description].join(' ')} />\n" +
"      \n" +
"      <FormDrawer open={open || !!editing} title={editing ? 'Transferi Düzenle' : 'Yeni Transfer'} onClose={() => { setOpen(false); setEditing(null); }}>\n" +
"        <TransferForm initialData={editing || undefined} />\n" +
"      </FormDrawer>\n" +
"      <ConfirmModal\n" +
"        open={Boolean(deleteTarget)}\n" +
"        title='Transfer silinsin mi?'\n" +
"        description='Bu işlem kaydı ve ilgili tüm stok hareketlerini kalıcı olarak siler.'\n" +
"        confirmLabel='Kalıcı olarak sil'\n" +
"        tone='danger'\n" +
"        onClose={() => setDeleteTarget(null)}\n" +
"        onConfirm={deleteTransferRecord}\n" +
"      />\n" +
"    </div>\n" +
"  );\n" +
"}";

const wastePage = "export function WasteAnalysisPage() {\n" +
"  const { data } = useErpData();\n" +
"  const [filters, setFilters] = useState({ customer: '', dateFrom: '', dateTo: '' });\n" +
"  const metrics = getDashboardMetrics(data);\n" +
"\n" +
"  const groupedRows = useMemo(() => {\n" +
"    const result: Array<{\n" +
"      orderId: string;\n" +
"      orderNo: string;\n" +
"      customerName: string;\n" +
"      totalConsumedKg: number;\n" +
"      totalRawKg: number;\n" +
"      totalDyeInputKg: number;\n" +
"      totalFinishedKg: number;\n" +
"      totalRawWasteKg: number;\n" +
"      totalDyeWasteKg: number;\n" +
"      avgRawWastePercent: number;\n" +
"      avgDyeWastePercent: number;\n" +
"      parties: any[];\n" +
"    }> = [];\n" +
"\n" +
"    data.orders.forEach(order => {\n" +
"      const orderParties = data.parties.filter(p => p.orderId === order.id);\n" +
"      if (orderParties.length === 0) return;\n" +
"\n" +
"      const consumed = orderParties.reduce((s, p) => s + (p.rawConsumedKg || 0), 0);\n" +
"      const raw = orderParties.reduce((s, p) => s + (p.rawProducedKg || 0), 0);\n" +
"      const dyeInput = orderParties.reduce((s, p) => s + (p.dyehouseInputKg || 0), 0);\n" +
"      const finished = orderParties.reduce((s, p) => s + (p.finishedKg || 0), 0);\n" +
"      const rawWaste = orderParties.reduce((s, p) => s + (p.rawWasteKg || 0), 0);\n" +
"      const dyeWaste = orderParties.reduce((s, p) => s + (p.dyehouseWasteKg || 0), 0);\n" +
"\n" +
"      result.push({\n" +
"        orderId: order.id,\n" +
"        orderNo: order.orderNo,\n" +
"        customerName: order.customerName,\n" +
"        totalConsumedKg: consumed,\n" +
"        totalRawKg: raw,\n" +
"        totalDyeInputKg: dyeInput,\n" +
"        totalFinishedKg: finished,\n" +
"        totalRawWasteKg: rawWaste,\n" +
"        totalDyeWasteKg: dyeWaste,\n" +
"        avgRawWastePercent: consumed > 0 ? (rawWaste / consumed) * 100 : 0,\n" +
"        avgDyeWastePercent: dyeInput > 0 ? (dyeWaste / dyeInput) * 100 : 0,\n" +
"        parties: orderParties\n" +
"      });\n" +
"    });\n" +
"\n" +
"    return result.filter(r => {\n" +
"        if (filters.customer && !r.customerName.toLowerCase().includes(filters.customer.toLowerCase())) return false;\n" +
"        return true;\n" +
"    });\n" +
"  }, [data, filters]);\n" +
"\n" +
"  return (\n" +
"    <div className='space-y-6'>\n" +
"      <PageHeader eyebrow='Fire' title='Fire Analizi Dashboard' description='Sipariş bazlı toplam üretim, tüketim ve fire oranları.' icon={BarChart3} />\n" +
"      \n" +
"      <div className='grid gap-4 md:grid-cols-4'>\n" +
"        <StatCard title='Ham fire ort.' value={formatPercent(metrics.avgRawWaste)} helper='Tüm üretimler toplamı' icon={BarChart3} tone='red' />\n" +
"        <StatCard title='Boyahane fire ort.' value={formatPercent(metrics.avgDyeWaste)} helper='Tüm boyahaneler toplamı' icon={BarChart3} tone='amber' />\n" +
"        <StatCard title='Toplam Fire kg' value={formatKg(metrics.wasteKg)} helper='Ham + Boyahane' icon={Factory} tone='red' />\n" +
"        <StatCard title='Toplam Üretim' value={formatKg(metrics.monthlyProductionKg)} helper='Ham + Mamül' icon={Boxes} tone='blue' />\n" +
"      </div>\n" +
"\n" +
"      <div className='premium-card rounded-2xl p-5 mb-6'>\n" +
"        <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>\n" +
"           <h2 className='font-semibold text-slate-950'>Analiz Filtreleri</h2>\n" +
"           <button className='text-xs font-bold text-slate-400 uppercase tracking-wider' onClick={() => setFilters({ customer: '', dateFrom: '', dateTo: '' })}>Sıfırla</button>\n" +
"        </div>\n" +
"        <div className='mt-4 grid gap-4 md:grid-cols-1'>\n" +
"            <input className='rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500' placeholder='Müşteri ara...' value={filters.customer} onChange={e => setFilters({...filters, customer: e.target.value})} />\n" +
"        </div>\n" +
"      </div>\n" +
"\n" +
"      <div className='space-y-4'>\n" +
"        {groupedRows.map(row => (\n" +
"            <div key={row.orderId} className='premium-card rounded-3xl overflow-hidden border border-slate-100 shadow-sm'>\n" +
"                <div className='bg-slate-50/50 p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4'>\n" +
"                    <div>\n" +
"                        <h3 className='text-sm font-bold text-slate-400 uppercase tracking-[0.15em] mb-1'>Sipariş: {row.orderNo}</h3>\n" +
"                        <div className='text-lg font-bold text-slate-950'>{row.customerName}</div>\n" +
"                    </div>\n" +
"                    <div className='flex gap-6'>\n" +
"                        <div className='text-right'>\n" +
"                            <div className='text-[10px] font-bold text-slate-400 uppercase'>Tüketim</div>\n" +
"                            <div className='font-bold text-slate-900'>{formatKg(row.totalConsumedKg)}</div>\n" +
"                        </div>\n" +
"                        <div className='text-right'>\n" +
"                            <div className='text-[10px] font-bold text-slate-400 uppercase'>Ham Fire</div>\n" +
"                            <div className='font-bold text-rose-600'>{formatPercent(row.avgRawWastePercent)}</div>\n" +
"                        </div>\n" +
"                        <div className='text-right'>\n" +
"                            <div className='text-[10px] font-bold text-slate-400 uppercase'>Boya Fire</div>\n" +
"                            <div className='font-bold text-amber-600'>{formatPercent(row.avgDyeWastePercent)}</div>\n" +
"                        </div>\n" +
"                    </div>\n" +
"                </div>\n" +
"                <div className='p-2'>\n" +
"                    <DataTable \n" +
"                        rows={row.parties} \n" +
"                        columns={[\n" +
"                            { header: 'Parti No', cell: (p) => <Link className='font-bold text-blue-600' href={'/parties/' + p.id}>{p.partyNo}</Link> },\n" +
"                            { header: 'Tüketim', cell: (p) => formatKg(p.rawConsumedKg) },\n" +
"                            { header: 'Ham Üretim', cell: (p) => formatKg(p.rawProducedKg) },\n" +
"                            { header: 'Ham Fire %', cell: (p) => <StatusBadge tone={wasteTone(p.rawWastePercent)}>{formatPercent(p.rawWastePercent)}</StatusBadge> },\n" +
"                            { header: 'Boya Giriş', cell: (p) => formatKg(p.dyehouseInputKg) },\n" +
"                            { header: 'Mamül Giriş', cell: (p) => formatKg(p.finishedKg) },\n" +
"                            { header: 'Boya Fire %', cell: (p) => <StatusBadge tone={wasteTone(p.dyehouseWastePercent)}>{formatPercent(p.dyehouseWastePercent)}</StatusBadge> },\n" +
"                        ]} \n" +
"                    />\n" +
"                </div>\n" +
"            </div>\n" +
"        ))}\n" +
"      </div>\n" +
"    </div>\n" +
"  );\n" +
"}";

replaceFunc('ProductionPage', prodPage);
replaceFunc('TransfersPage', transPage);
replaceFunc('WasteAnalysisPage', wastePage);

fs.writeFileSync(path, content, 'utf8');
console.log('Update finished');
