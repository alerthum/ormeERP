const fs = require('fs');
const path = 'c:/Users/ibrahimyokus/Desktop/convert/Yokus Orme Erp Yazilimi/src/components/pages.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Update TransferPage
const oldTransferLogic = `const [open, setOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Transfer | null>(null);

  async function cancelTransferRecord() {
    if (!cancelTarget) return;
    try {
      await postJson(\`/api/transfer/\${cancelTarget.id}/cancel\`, {});
      refreshInBackground(refresh);
      toast.success("Transfer iptal edildi ve stoklar kaynak depoya iade edildi.");
      setCancelTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transfer iptal edilemedi.");
    }
  }`;

const newTransferLogic = `const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transfer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transfer | null>(null);

  async function deleteTransferRecord() {
    if (!deleteTarget) return;
    try {
      await postJson(\`/api/transfer/\${deleteTarget.id}/delete\`, {});
      refreshInBackground(refresh);
      toast.success("Transfer kaydı ve tüm hareketleri silindi.");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transfer silinemedi.");
    }
  }`;

content = content.replace(oldTransferLogic, newTransferLogic);

const oldTransferTable = `<DataTable rows={filteredTransfers} columns={[
        { header: "Tarih", cell: (row) => formatDate(row.date) },
        { header: "Kaynak", cell: (row) => getName(data.warehouses, row.fromWarehouseId) },
        { header: "Hedef", cell: (row) => getName(data.warehouses, row.toWarehouseId) },
        { header: "Miktar", cell: (row) => formatKg(normalizeItems(row.items).reduce((sum, item) => sum + (item.quantity || 0), 0)) },
        { header: "Durum", cell: (row) => <StatusBadge tone={cancelledTransferIds.has(row.id) ? "red" : "green"}>{cancelledTransferIds.has(row.id) ? "İptal" : "Aktif"}</StatusBadge> },
        { header: "İşlem", className: "text-right", cell: (row) => <div className="flex justify-end"><button className={dangerButton} disabled={cancelledTransferIds.has(row.id)} onClick={() => setCancelTarget(row)} type="button">{cancelledTransferIds.has(row.id) ? "İptal edildi" : "İptal et"}</button></div> },
      ]} searchPlaceholder="Kaynak depo, hedef depo veya açıklamada ara" getSearchText={(row) => [getName(data.warehouses, row.fromWarehouseId), getName(data.warehouses, row.toWarehouseId), row.description].join(" ")} />
      <FormDrawer open={open} title="Yeni Transfer" onClose={() => setOpen(false)}><TransferForm /></FormDrawer>
      <ConfirmModal
        open={Boolean(cancelTarget)}
        title="Transfer iptal edilsin mi?"
        description="Bu işlem hedef depodan çıkış, kaynak depoya giriş ters hareketi oluşturur. Hedef depoda yeterli stok yoksa işlem yapılmaz."
        confirmLabel="İptal et"
        tone="danger"
        onClose={() => setCancelTarget(null)}
        onConfirm={cancelTransferRecord}
      />`;

const newTransferTable = `<DataTable rows={filteredTransfers} columns={[
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
        description="Bu işlem kaydı ve ilgili tüm stok hareketlerini kalıcı olarak siler. Eğer bu işlemden sonra bir çıkış yapıldıysa ve bakiye eksiye düşecekse silmeye izin verilmez."
        confirmLabel="Kalıcı olarak sil"
        tone="danger"
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteTransferRecord}
      />`;

content = content.replace(oldTransferTable, newTransferTable);

fs.writeFileSync(path, content, 'utf8');
console.log('Transfer update complete');
