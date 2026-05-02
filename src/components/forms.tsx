import { calculateDyehouseWaste, calculateRawWaste, getErpData, getName } from "@/services/erp-service";
import { formatKg, formatPercent } from "@/lib/utils";

const inputClass = "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";
const labelClass = "text-xs font-bold uppercase tracking-[0.14em] text-slate-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export function OrderForm() {
  const data = getErpData();
  return (
    <form className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Müşteri"><input className={inputClass} defaultValue="Yeni Müşteri" /></Field>
        <Field label="Termin"><input className={inputClass} type="date" defaultValue="2026-06-12" /></Field>
        <Field label="Kumaş cinsi"><select className={inputClass}>{data.fabricTypes.map((item) => <option key={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Renk"><select className={inputClass}>{data.colors.map((item) => <option key={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Ne"><select className={inputClass}>{data.yarnCounts.map((item) => <option key={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Sipariş kg"><input className={inputClass} type="number" defaultValue={2500} /></Field>
        <Field label="Ham en"><input className={inputClass} type="number" defaultValue={185} /></Field>
        <Field label="Ham gramaj"><input className={inputClass} type="number" defaultValue={155} /></Field>
        <Field label="Finish en"><input className={inputClass} type="number" defaultValue={175} /></Field>
        <Field label="Finish gramaj"><input className={inputClass} type="number" defaultValue={170} /></Field>
      </div>
      <div className="grid gap-3 rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
        <strong>Otomatik stok eşleştirme hazır</strong>
        <span>Aynı özelliklerde YM/MM yoksa servis katmanı yeni kodu transaction-safe sayaç mantığıyla üretecek.</span>
      </div>
      <button className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100" type="button">Siparişi kaydet</button>
    </form>
  );
}

export function TransferForm() {
  const data = getErpData();
  return (
    <form className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kaynak depo"><select className={inputClass}>{data.warehouses.map((item) => <option key={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Hedef depo"><select className={inputClass}>{data.warehouses.map((item) => <option key={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Stok kartı"><select className={inputClass}>{data.stockCards.map((item) => <option key={item.id}>{item.code} - {item.name}</option>)}</select></Field>
        <Field label="Miktar kg"><input className={inputClass} type="number" defaultValue={500} /></Field>
      </div>
      <button className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100" type="button">Transfer oluştur</button>
    </form>
  );
}

export function RawProductionForm() {
  const data = getErpData();
  const waste = calculateRawWaste(930, 860);
  return (
    <form className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sipariş"><select className={inputClass}>{data.orders.map((item) => <option key={item.id}>{item.orderNo} - {item.customerName}</option>)}</select></Field>
        <Field label="Fason örmeci"><select className={inputClass}>{data.partners.filter((item) => item.type === "KNITTER").map((item) => <option key={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Üretilen ham kg"><input className={inputClass} type="number" defaultValue={860} /></Field>
        <Field label="Tüketilen iplik kg"><input className={inputClass} type="number" defaultValue={930} /></Field>
      </div>
      <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
        Hesaplanan ham fire: <strong>{formatKg(waste.wasteKg)} / {formatPercent(waste.wastePercent)}</strong>. Fasoncu depo kapanışında kalan iplikler üretim kg oranına göre dağıtılabilir.
      </div>
      <button className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100" type="button">Ham üretimi kaydet</button>
    </form>
  );
}

export function DyehouseProductionForm() {
  const data = getErpData();
  const waste = calculateDyehouseWaste(2900, 2720);
  return (
    <form className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Parti"><select className={inputClass}>{data.parties.map((item) => <option key={item.id}>{item.partyNo}</option>)}</select></Field>
        <Field label="Boyahane"><select className={inputClass}>{data.partners.filter((item) => item.type === "DYEHOUSE").map((item) => <option key={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Giden ham kg"><input className={inputClass} type="number" defaultValue={2900} /></Field>
        <Field label="Dönen mamül kg"><input className={inputClass} type="number" defaultValue={2720} /></Field>
        <Field label="Finish en"><input className={inputClass} type="number" defaultValue={175} /></Field>
        <Field label="Finish gramaj"><input className={inputClass} type="number" defaultValue={170} /></Field>
      </div>
      <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
        Boyahane fire: <strong>{formatKg(waste.wasteKg)} / {formatPercent(waste.wastePercent)}</strong>. MM stok {getName(data.colors, "color-3")} final özelliklerine göre eşleşir veya açılır.
      </div>
      <button className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100" type="button">Boyahane işlemini kaydet</button>
    </form>
  );
}
