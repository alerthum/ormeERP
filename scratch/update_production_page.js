const fs = require('fs');
const path = 'c:/Users/ibrahimyokus/Desktop/convert/Yokus Orme Erp Yazilimi/src/components/pages.tsx';
let content = fs.readFileSync(path, 'utf8');

// Helper for POST
const postJsonSnippet = `async function postJson(endpoint: string, payload: Record<string, unknown>) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify(payload),
    signal: requestSignal(),
  });
  const result = (await response.json()) as { ok: boolean; error?: string };
  if (!response.ok || !result.ok) throw new Error(result.error ?? "İşlem tamamlanamadı.");
  return result;
}`;

if (!content.includes('function postJson')) {
    content = content.replace('async function apiPatch', postJsonSnippet + '\n\nasync function apiPatch');
}

// 2. Update ProductionPage
const oldProdLogic = `const [open, setOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<RawProduction | DyehouseProduction | null>(null);
  const [filters, setFilters] = useState({ status: "ALL", dateFrom: "", dateTo: "" });
  const setFilter = (key: string, value: string) => setFilters((curr) => ({ ...curr, [key]: value }));
  const isRaw = type === "raw";
  const cancelledIds = useMemo(() => new Set(data.stockMovements.filter((movement) => movement.referenceType === (isRaw ? "production_raw_cancel" : "production_dyehouse_cancel")).map((movement) => movement.referenceId)), [data.stockMovements, isRaw]);
  const filteredRaw = useMemo(() => data.productionRaw.filter((row) => {
    if (filters.status !== "ALL") {
      const isCancelled = cancelledIds.has(row.id);
      if (filters.status === "İptal" && !isCancelled) return false;
      if (filters.status === "Aktif" && isCancelled) return false;
    }
    if (filters.dateFrom && row.date < filters.dateFrom) return false;
    if (filters.dateTo && row.date > filters.dateTo) return false;
    return true;
  }), [data.productionRaw, filters, cancelledIds]);
  const filteredDyehouse = useMemo(() => data.productionDyehouse.filter((row) => {
    if (filters.status !== "ALL") {
      const isCancelled = cancelledIds.has(row.id);
      if (filters.status === "İptal" && !isCancelled) return false;
      if (filters.status === "Aktif" && isCancelled) return false;
    }
    if (filters.dateFrom && row.date < filters.dateFrom) return false;
    if (filters.dateTo && row.date > filters.dateTo) return false;
    return true;
  }), [data.productionDyehouse, filters, cancelledIds]);
  async function cancelProduction() {
    if (!cancelTarget) return;
    try {
      await apiDelete(\`/api/production/\${isRaw ? "raw" : "dyehouse"}/\${cancelTarget.id}\`);
      refreshInBackground(refresh);
      toast.success(isRaw ? "Ham üretim iptal edildi ve stoklar geri alındı." : "Boyahane üretimi iptal edildi ve stoklar geri alındı.");
      setCancelTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Üretim kaydı iptal edilemedi.");
    }
  }`;

const newProdLogic = `const [open, setOpen] = useState(false);
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
      await postJson("/api/production/" + (isRaw ? "raw" : "dyehouse") + "/" + deleteTarget.id + "/delete", {});
      refreshInBackground(refresh);
      toast.success(isRaw ? "Ham üretim kaydı silindi." : "Boyahane üretim kaydı silindi.");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Üretim silinemedi.");
    }
  }`;

content = content.replace(oldProdLogic, newProdLogic);

// 3. Update Table Columns (Düzenle & Sil)
const oldRawCols = `{ header: "İşlem", className: "text-right", cell: (row) => <div className="flex justify-end"><button className={dangerButton} disabled={cancelledIds.has(row.id)} onClick={() => setCancelTarget(row)} type="button">{cancelledIds.has(row.id) ? "İptal edildi" : "İptal et"}</button></div> },`;
const newRawCols = `{ header: "İşlem", className: "text-right", cell: (row) => (
      <div className="flex justify-end gap-2">
        <button className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-700 transition-colors" onClick={() => setEditing(row)} type="button">Düzenle</button>
        <button className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors" onClick={() => setDeleteTarget(row)} type="button">Sil</button>
      </div>
    ) },`;

content = content.replace(oldRawCols, newRawCols);

const oldDyeCols = `{ header: "İşlem", className: "text-right", cell: (row) => <div className="flex justify-end"><button className={dangerButton} disabled={cancelledIds.has(row.id)} onClick={() => setCancelTarget(row)} type="button">{cancelledIds.has(row.id) ? "İptal edildi" : "İptal et"}</button></div> },`;
const newDyeCols = `{ header: "İşlem", className: "text-right", cell: (row) => (
      <div className="flex justify-end gap-2">
        <button className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-700 transition-colors" onClick={() => setEditing(row)} type="button">Düzenle</button>
        <button className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors" onClick={() => setDeleteTarget(row)} type="button">Sil</button>
      </div>
    ) },`;

content = content.replace(oldDyeCols, newDyeCols);

// 4. Update FormDrawer and ConfirmModal
const oldProdModals = `<FormDrawer open={open} title={isRaw ? "Yeni Ham Üretim" : "Yeni Boyahane Üretimi"} onClose={() => setOpen(false)}>
        {isRaw ? <RawProductionForm /> : <DyehouseProductionForm />}
      </FormDrawer>
      <ConfirmModal
        open={Boolean(cancelTarget)}
        title="Üretim kaydı iptal edilsin mi?"
        description="Bu işlem stok hareketlerini tersine çevirerek bakiye tutarlılığını korur."
        confirmLabel="İptal et"
        tone="danger"
        onClose={() => setCancelTarget(null)}
        onConfirm={cancelProduction}
      />`;

const newProdModals = `<FormDrawer open={open || !!editing} title={editing ? (isRaw ? "Ham Üretimi Düzenle" : "Boyahane Üretimini Düzenle") : (isRaw ? "Yeni Ham Üretim" : "Yeni Boyahane Üretimi")} onClose={() => { setOpen(false); setEditing(null); }}>
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
      />`;

content = content.replace(oldProdModals, newProdModals);

fs.writeFileSync(path, content, 'utf8');
console.log('Production update complete');
