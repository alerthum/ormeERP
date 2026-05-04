const fs = require('fs');
const path = 'c:/Users/ibrahimyokus/Desktop/convert/Yokus Orme Erp Yazilimi/src/components/pages.tsx';
let content = fs.readFileSync(path, 'utf8');

// Completely rebuild ProductionPage to ensure clean state
const newProductionPage = `export function ProductionPage({ type }: { type: "raw" | "dyehouse" }) {
  const { data, refresh } = useErpData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RawProduction | DyehouseProduction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RawProduction | DyehouseProduction | null>(null);
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "" });
  const setFilter = (key: string, value: string) => setFilters((curr) => ({ ...curr, [key]: value }));
  const isRaw = type === "raw";
  
  const filteredRaw = useMemo(() => data.productionRaw.filter((row) => {
    if (filters.dateFrom && row.date < filters.dateFrom) return false;
    if (filters.dateTo && row.date > filters.dateTo) return false;
    return true;
  }), [data.productionRaw, filters]);
  
  const filteredDyehouse = useMemo(() => data.productionDyehouse.filter((row) => {
    if (filters.dateFrom && row.date < filters.dateFrom) return false;
    if (filters.dateTo && row.date > filters.dateTo) return false;
    return true;
  }), [data.productionDyehouse, filters]);

  async function deleteProductionRecord() {
    if (!deleteTarget) return;
    try {
      await apiDelete(\`/api/production/\${isRaw ? "raw" : "dyehouse"}/\${deleteTarget.id}\`);
      refreshInBackground(refresh);
      toast.success(isRaw ? "Ham üretim kaydı silindi." : "Boyahane üretim kaydı silindi.");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Üretim silinemedi.");
    }
  }

  const rawColumns: Column<RawProduction>[] = [
    { header: "Tarih", cell: (row) => formatDate(row.date) },
    { header: "Sipariş", cell: (row) => data.orders.find((order) => order.id === row.orderId)?.orderNo ?? "-" },
    { header: "Parti", cell: (row) => data.parties.find((party) => party.id === row.partyId)?.partyNo ?? "-" },
    { header: "Fasoncu", cell: (row) => getName(data.partners, row.knitterPartnerId) },
    { header: "Ham kg", cell: (row) => formatKg(row.producedRawKg) },
    { header: "Fire", cell: (row) => <StatusBadge tone={wasteTone(row.wastePercent)}>{formatPercent(row.wastePercent)}</StatusBadge> },
    { header: "İşlem", className: "text-right", cell: (row) => (
      <div className="flex justify-end gap-2">
        <button className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-700 transition-colors" onClick={() => setEditing(row)} type="button">Düzenle</button>
        <button className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors" onClick={() => setDeleteTarget(row)} type="button">Sil</button>
      </div>
    ) },
  ];

  const dyehouseColumns: Column<DyehouseProduction>[] = [
    { header: "Tarih", cell: (row) => formatDate(row.date) },
    { header: "Sipariş", cell: (row) => data.orders.find((order) => order.id === row.orderId)?.orderNo ?? "-" },
    { header: "Parti", cell: (row) => data.parties.find((party) => party.id === row.partyId)?.partyNo ?? "-" },
    { header: "Boyahane", cell: (row) => getName(data.partners, row.dyehousePartnerId) },
    { header: "Giden", cell: (row) => formatKg(row.inputRawKg) },
    { header: "Dönen", cell: (row) => formatKg(row.finishedKg) },
    { header: "Fire", cell: (row) => <StatusBadge tone={wasteTone(row.wastePercent)}>{formatPercent(row.wastePercent)}</StatusBadge> },
    { header: "İşlem", className: "text-right", cell: (row) => (
      <div className="flex justify-end gap-2">
        <button className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-700 transition-colors" onClick={() => setEditing(row)} type="button">Düzenle</button>
        <button className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors" onClick={() => setDeleteTarget(row)} type="button">Sil</button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Üretim" title={isRaw ? "Ham Kumaş Üretimi" : "Boyahane Üretimi"} description={isRaw ? "İplik tüketimi, ham kumaş girişi, fire ve fasoncu depo kapanış mutabakatı." : "Ham çıkışı, mamül girişi, finish özellikleri ve boyahane fire hesaplama."} icon={Factory} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Yeni kayıt</button>} />
      
      <div className="premium-card rounded-2xl p-5 mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Üretim Filtreleri</h2>
            <p className="mt-1 text-sm text-slate-500">Tarihe göre kayıtları daraltın.</p>
          </div>
          <button className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600" onClick={() => setFilters({ dateFrom: "", dateTo: "" })} type="button">Filtreleri temizle</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold text-slate-400">Başlangıç<input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none" type="date" value={filters.dateFrom} onChange={(e) => setFilter("dateFrom", e.target.value)} /></label>
          <label className="space-y-1 text-xs font-semibold text-slate-400">Bitiş<input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none" type="date" value={filters.dateTo} onChange={(e) => setFilter("dateTo", e.target.value)} /></label>
        </div>
      </div>

      {isRaw ? (
        <DataTable rows={filteredRaw} columns={rawColumns} searchPlaceholder="Sipariş, parti, fasoncu veya açıklamada ara" getSearchText={(row) => [data.orders.find((order) => order.id === row.orderId)?.orderNo, data.parties.find((party) => party.id === row.partyId)?.partyNo, getName(data.partners, row.knitterPartnerId), row.description].join(" ")} />
      ) : (
        <DataTable rows={filteredDyehouse} columns={dyehouseColumns} searchPlaceholder="Sipariş, parti, boyahane veya açıklamada ara" getSearchText={(row) => [data.orders.find((order) => order.id === row.orderId)?.orderNo, data.parties.find((party) => party.id === row.partyId)?.partyNo, getName(data.partners, row.dyehousePartnerId), row.description].join(" ")} />
      )}

      <FormDrawer open={open || !!editing} title={editing ? (isRaw ? "Ham Üretimi Düzenle" : "Boyahane Üretimini Düzenle") : (isRaw ? "Yeni Üretim Kaydı" : "Yeni Boyahane Üretimi")} onClose={() => { setOpen(false); setEditing(null); }}>
        {isRaw ? <RawProductionForm initialData={editing as RawProduction} /> : <DyehouseProductionForm initialData={editing as DyehouseProduction} />}
      </FormDrawer>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Üretim kaydı silinsin mi?"
        description="Bu işlem kaydı ve ilgili tüm stok hareketlerini kalıcı olarak siler."
        confirmLabel="Kalıcı olarak sil"
        tone="danger"
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteProductionRecord}
      />
    </div>
  );
}`;

// Completely rebuild TransfersPage
const newTransfersPage = `export function TransfersPage() {
  const { data, refresh } = useErpData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transfer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transfer | null>(null);
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "" });
  const setFilter = (key: string, value: string) => setFilters((curr) => ({ ...curr, [key]: value }));

  const filteredTransfers = useMemo(() => data.transfers.filter((row) => {
    if (filters.dateFrom && row.date < filters.dateFrom) return false;
    if (filters.dateTo && row.date > filters.dateTo) return false;
    return true;
  }), [data.transfers, filters]);

  async function deleteTransferRecord() {
    if (!deleteTarget) return;
    try {
      await apiDelete(\`/api/transfers/\${deleteTarget.id}\`);
      refreshInBackground(refresh);
      toast.success("Transfer kaydı silindi.");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transfer silinemedi.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Stok" title="Depolar Arası Transfer" description="İplik, ham veya mamül kumaşların depolar arası sevkiyat kaydı." icon={Truck} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Yeni transfer</button>} />
      
      <div className="premium-card rounded-2xl p-5 mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Transfer Filtreleri</h2>
            <p className="mt-1 text-sm text-slate-500">Tarihe göre kayıtları daraltın.</p>
          </div>
          <button className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600" onClick={() => setFilters({ dateFrom: "", dateTo: "" })} type="button">Filtreleri temizle</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold text-slate-400">Başlangıç<input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none" type="date" value={filters.dateFrom} onChange={(e) => setFilter("dateFrom", e.target.value)} /></label>
          <label className="space-y-1 text-xs font-semibold text-slate-400">Bitiş<input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none" type="date" value={filters.dateTo} onChange={(e) => setFilter("dateTo", e.target.value)} /></label>
        </div>
      </div>

      <DataTable rows={filteredTransfers} columns={[
        { header: "Tarih", cell: (row) => formatDate(row.date) },
        { header: "Kaynak", cell: (row) => getName(data.warehouses, row.fromWarehouseId) },
        { header: "Hedef", cell: (row) => getName(data.warehouses, row.toWarehouseId) },
        { header: "Miktar", cell: (row) => formatKg(normalizeItems(row.items).reduce((sum, item) => sum + (item.quantity || 0), 0)) },
        { header: "İşlem", className: "text-right", cell: (row) => (
          <div className="flex justify-end gap-2">
            <button className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-700 transition-colors" onClick={() => setEditing(row)} type="button">Düzenle</button>
            <button className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors" onClick={() => setDeleteTarget(row)} type="button">Sil</button>
          </div>
        )},
      ]} searchPlaceholder="Kaynak depo, hedef depo veya açıklamada ara" getSearchText={(row) => [getName(data.warehouses, row.fromWarehouseId), getName(data.warehouses, row.toWarehouseId), row.description].join(" ")} />
      
      <FormDrawer open={open || !!editing} title={editing ? "Transferi Düzenle" : "Yeni Transfer"} onClose={() => { setOpen(false); setEditing(null); }}>
        <TransferForm initialData={editing || undefined} />
      </FormDrawer>
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Transfer silinsin mi?"
        description="Bu işlem kaydı ve ilgili tüm stok hareketlerini kalıcı olarak siler."
        confirmLabel="Kalıcı olarak sil"
        tone="danger"
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteTransferRecord}
      />
    </div>
  );
}`;

// Helper to replace full function content
function replaceFunction(original, name, newBody) {
    const startIdx = original.indexOf(`export function \${name}`);
    if (startIdx === -1) return original;
    
    // Find matching closing brace
    let depth = 0;
    let endIdx = -1;
    for (let i = startIdx; i < original.length; i++) {
        if (original[i] === '{') depth++;
        if (original[i] === '}') {
            depth--;
            if (depth === 0) {
                endIdx = i + 1;
                break;
            }
        }
    }
    
    if (endIdx === -1) return original;
    return original.substring(0, startIdx) + newBody + original.substring(endIdx);
}

content = replaceFunction(content, 'ProductionPage', newProductionPage);
content = replaceFunction(content, 'TransfersPage', newTransfersPage);

fs.writeFileSync(path, content, 'utf8');
console.log('Pages fully cleaned up');
