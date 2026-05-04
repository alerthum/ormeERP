"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useErpData } from "@/components/erp-data-provider";
import { calculateDyehouseWaste, calculateRawWaste, getName } from "@/services/erp-service";
import { formatKg, formatPercent, normalizeItems } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { ErpData, NamedEntity, Order, Partner, PurchaseOrder, PurchaseReceipt, StockCard, Warehouse } from "@/types/erp";

const inputClass = "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";
const labelClass = "text-xs font-bold uppercase tracking-[0.14em] text-slate-400";

interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function requestSignal(ms = 8000) {
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(new DOMException("Sunucu yanıtı gecikti.", "TimeoutError")), ms);
  return controller.signal;
}

function refreshInBackground(refresh: () => Promise<void>) {
  void refresh().catch(() => undefined);
}

type SettingEntity = "fabricTypes" | "colors" | "yarnCounts" | "yarnTypes" | "processTypes" | "warehouses" | "partners";

interface SettingResult {
  id: string;
  name: string;
  code?: string;
  isActive?: boolean;
  kind?: Warehouse["kind"];
  type?: Partner["type"];
}

function isSettingResult(value: unknown): value is SettingResult {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "name" in value &&
      typeof value.id === "string" &&
      typeof value.name === "string",
  );
}

function upsertById<T extends { id: string }>(items: T[], item: T) {
  return items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? item : current))
    : [...items, item];
}

function applySettingResult(current: ErpData, entity: SettingEntity, value: unknown): ErpData {
  if (!isSettingResult(value)) return current;
  const base: NamedEntity = { id: value.id, name: value.name, isActive: true };

  switch (entity) {
    case "fabricTypes":
      return { ...current, fabricTypes: upsertById(current.fabricTypes, base) };
    case "colors":
      return { ...current, colors: upsertById(current.colors, base) };
    case "yarnCounts":
      return { ...current, yarnCounts: upsertById(current.yarnCounts, base) };
    case "yarnTypes":
      return { ...current, yarnTypes: upsertById(current.yarnTypes, { ...base, code: value.code ?? "" }) };
    case "processTypes":
      return { ...current, processTypes: upsertById(current.processTypes, base) };
    case "warehouses":
      return {
        ...current,
        warehouses: upsertById(current.warehouses, { ...base, kind: value.kind ?? "RAW" }),
      };
    case "partners":
      return {
        ...current,
        partners: upsertById(current.partners, { ...base, type: value.type ?? "SUPPLIER", riskScore: 0 }),
      };
  }
}

async function postJson(endpoint: string, payload: Record<string, unknown>) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
    signal: requestSignal(),
  });
  const result = (await response.json()) as ApiResponse;
  if (!response.ok || !result.ok) throw new Error(result.error ?? "Kayıt tamamlanamadı.");
  return result.data;
}

async function patchJson(endpoint: string, payload: Record<string, unknown>) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
    signal: requestSignal(),
  });
  const result = (await response.json()) as ApiResponse;
  if (!response.ok || !result.ok) throw new Error(result.error ?? "Güncelleme tamamlanamadı.");
  return result.data;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function FormButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100 disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} type="submit">
      {loading ? "Kaydediliyor..." : children}
    </button>
  );
}

function buildStockNamePreview(
  type: string,
  yarnCountName: string,
  colorName: string,
  yarnTypeCode: string,
  hasPolyester: boolean,
  hasLycra: boolean,
  fabricTypeName = "",
) {
  const yarnTypePart = yarnTypeCode && yarnTypeCode.toUpperCase() !== "OE" ? yarnTypeCode.toUpperCase() : "";
  if (type === "IP") {
    return ["IPLIK", yarnTypePart, yarnCountName, colorName, hasPolyester ? "POLY" : "", hasLycra ? "LYC" : ""]
      .filter(Boolean)
      .join(" ");
  }
  if (type === "LYC") return ["LYCRA", yarnCountName, colorName].filter(Boolean).join(" ");
  if (type === "POLY") return ["POLYESTER", yarnCountName, colorName].filter(Boolean).join(" ");
  if (type === "YM" || type === "MM") {
    return [
      yarnCountName,
      fabricTypeName.toLocaleUpperCase("tr-TR"),
      colorName,
      type,
      type === "YM" ? "HAM" : "MAMÜL",
      hasLycra ? "LYC" : "",
      hasPolyester ? "POLY" : "",
    ].filter(Boolean).join(" ");
  }
  return "";
}

type QuickLookupStockOption = {
  label: string;
  stockId: string;
  type: "YM" | "MM";
};

type QuickLookupResult = {
  label: string;
  helper: string;
  orderId?: string;
  partyId?: string;
  stockId?: string;
  lotNo?: string;
  warehouseId?: string;
  stockOptions?: QuickLookupStockOption[];
};

function getAvailableBalance(data: ErpData, input: { stockId?: string; warehouseId?: string; partyId?: string; lotNo?: string }) {
  if (!input.stockId || !input.warehouseId) return 0;
  return data.warehouseBalances
    .filter((item) => item.stockId === input.stockId && item.warehouseId === input.warehouseId)
    .filter((item) => input.partyId ? item.partyId === input.partyId : true)
    .filter((item) => input.lotNo ? item.lotNo === input.lotNo : true)
    .reduce((sum, item) => sum + item.quantity, 0);
}

function BalanceHint({ available, quantity, label = "Kullanılabilir bakiye" }: { available: number; quantity?: number; label?: string }) {
  const requested = Number(quantity ?? 0);
  const isNegative = requested > 0 && requested > available;
  return (
    <div className={`rounded-2xl p-4 text-sm ${isNegative ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}>
      <strong>{label}: {formatKg(available)}</strong>
      {requested > 0 ? <p className="mt-1">{isNegative ? "Bu miktar kaydedilirse negatif stok oluşur; sistem kaydı engeller." : "Seçilen miktar mevcut kırılım bakiyesi içinde."}</p> : null}
    </div>
  );
}

function findQuickLookup(data: ErpData, query: string): QuickLookupResult | null {
  const normalized = query.trim().toLocaleLowerCase("tr-TR");
  if (!normalized) return null;

  const order = data.orders.find((item) => item.orderNo.toLocaleLowerCase("tr-TR") === normalized);
  if (order) {
    return {
      label: `Sipariş ${order.orderNo}`,
      helper: `${order.customerName} · ${formatKg(order.quantityKg)}`,
      orderId: order.id,
      stockId: order.ymStockId,
    };
  }

  const party = data.parties.find((item) => item.partyNo.toLocaleLowerCase("tr-TR") === normalized);
  if (party) {
    const orderForParty = data.orders.find((item) => item.id === party.orderId);
    const stockOptions: QuickLookupStockOption[] = [
      { type: "YM" as const, stockId: party.ymStockId, label: `YM ham kumaş · ${getStockLabel(data, party.ymStockId)}` },
      { type: "MM" as const, stockId: party.mmStockId, label: `MM mamül kumaş · ${getStockLabel(data, party.mmStockId)}` },
    ].filter((option, index, list) => option.stockId && list.findIndex((item) => item.stockId === option.stockId) === index);
    return {
      label: `Parti ${party.partyNo}`,
      helper: `${orderForParty?.orderNo ?? "Siparişsiz"} · ${party.status}`,
      orderId: party.orderId,
      partyId: party.id,
      stockId: party.finishedKg > 0 ? party.mmStockId : party.ymStockId,
      warehouseId: party.currentWarehouseId,
      stockOptions,
    };
  }

  const receiptItem = data.purchaseReceipts
    .flatMap((receipt) => normalizeItems(receipt.items).map((item) => ({ receipt, item })))
    .find(({ item }) => String(item.lotNo ?? "").toLocaleLowerCase("tr-TR") === normalized);
  if (receiptItem) {
    const stock = data.stockCards.find((item) => item.id === receiptItem.item.stockId);
    return {
      label: `Lot ${receiptItem.item.lotNo}`,
      helper: `${stock?.code ?? "Stok"} · ${formatKg(Number(receiptItem.item.receivedKg ?? 0))}`,
      lotNo: String(receiptItem.item.lotNo),
      stockId: String(receiptItem.item.stockId),
      warehouseId: receiptItem.receipt.warehouseId,
    };
  }

  return null;
}

function QuickLookupBox({ label = "Sipariş / parti / lot ile hızlı getir", placeholder = "Sipariş no, parti no veya lot no yazıp Enter'a bas", onApply }: { label?: string; placeholder?: string; onApply: (result: QuickLookupResult) => void }) {
  const { data } = useErpData();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<QuickLookupResult | null>(null);

  function runLookup() {
    const next = findQuickLookup(data, query);
    setResult(next);
    if (!next) {
      toast.error("Sipariş, parti veya lot bulunamadı.");
      return;
    }
    if ((next.stockOptions?.length ?? 0) <= 1) onApply(next);
  }

  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
      <p className="mb-3 text-sm font-semibold text-blue-900">{label}</p>
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <input
          className={inputClass}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              runLookup();
            }
          }}
          placeholder={placeholder}
          value={query}
        />
        <button className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100" onClick={runLookup} type="button">
          Getir
        </button>
      </div>
      {result ? (
        <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm text-blue-800 shadow-sm">
          <strong>{result.label}</strong>
          <span className="ml-2 text-blue-500">{result.helper}</span>
          {(result.stockOptions?.length ?? 0) > 1 ? (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {result.stockOptions?.map((option) => (
                <button
                  key={`${option.type}-${option.stockId}`}
                  className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-left text-sm font-semibold text-blue-800 transition hover:border-blue-200 hover:bg-blue-100"
                  onClick={() => onApply({ ...result, stockId: option.stockId })}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function getStockLabel(data: ErpData, stockId?: string) {
  const stock = data.stockCards.find((item) => item.id === stockId);
  return stock ? `${stock.code} - ${stock.name}` : "-";
}

export function SettingForm({ entity, extra, onDone }: { entity: SettingEntity; extra?: "warehouse" | "partner"; onDone?: () => void }) {
  const { refresh, mutateData } = useErpData();
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const saved = await postJson(`/api/settings/${entity}`, {
        code: form.get("code"),
        name: String(form.get("name") ?? ""),
        kind: form.get("kind"),
        type: form.get("type"),
      });
      formElement.reset();
      mutateData((current) => applySettingResult(current, entity, saved));
      refreshInBackground(refresh);
      onDone?.();
      toast.success("Tanım kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tanım kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto]" onSubmit={submit}>
      {entity === "yarnTypes" ? (
        <Field label="Kod">
          <input className={inputClass} name="code" placeholder="OE" required />
        </Field>
      ) : null}
      <Field label="Ad">
        <input className={inputClass} name="name" placeholder="Yeni tanım adı" required />
      </Field>
      {extra === "warehouse" ? (
        <Field label="Tip">
          <select className={inputClass} name="kind" defaultValue="RAW">
            <option value="YARN">İplik deposu</option>
            <option value="KNITTER">Fasoncu deposu</option>
            <option value="RAW">Ham kumaş deposu</option>
            <option value="DYEHOUSE">Boyahane deposu</option>
            <option value="FINISHED">Mamül depo</option>
            <option value="STORE">Satış mağazası</option>
            <option value="WASTE">Fire deposu</option>
          </select>
        </Field>
      ) : null}
      {extra === "partner" ? (
        <Field label="Tip">
          <select className={inputClass} name="type" defaultValue="SUPPLIER">
            <option value="KNITTER">Fason örmeci</option>
            <option value="DYEHOUSE">Boyahane</option>
            <option value="SUPPLIER">Satıcı</option>
            <option value="CUSTOMER">Müşteri</option>
          </select>
        </Field>
      ) : null}
      <div className="flex items-end">
        <FormButton loading={loading}>Kaydet</FormButton>
      </div>
    </form>
  );
}

export function StockCardForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<"RAW" | "FABRIC">("RAW");
  const [stockType, setStockType] = useState("IP");
  const [yarnCountId, setYarnCountId] = useState("");
  const [colorId, setColorId] = useState("");
  const [fabricTypeId, setFabricTypeId] = useState("");
  const [yarnTypeId, setYarnTypeId] = useState(data.yarnTypes.find((item) => item.code === "OE")?.id ?? "");
  const [hasPolyester, setHasPolyester] = useState(false);
  const [hasLycra, setHasLycra] = useState(false);
  const previewName = buildStockNamePreview(
    stockType,
    data.yarnCounts.find((item) => item.id === yarnCountId)?.name ?? "",
    data.colors.find((item) => item.id === colorId)?.name.toUpperCase() ?? "",
    data.yarnTypes.find((item) => item.id === yarnTypeId)?.code ?? "OE",
    hasPolyester,
    hasLycra,
  );
  const ymPreviewName = buildStockNamePreview(
    "YM",
    data.yarnCounts.find((item) => item.id === yarnCountId)?.name ?? "",
    data.colors.find((item) => item.id === colorId)?.name.toLocaleUpperCase("tr-TR") ?? "",
    "OE",
    hasPolyester,
    hasLycra,
    data.fabricTypes.find((item) => item.id === fabricTypeId)?.name ?? "",
  );
  const mmPreviewName = buildStockNamePreview(
    "MM",
    data.yarnCounts.find((item) => item.id === yarnCountId)?.name ?? "",
    data.colors.find((item) => item.id === colorId)?.name.toLocaleUpperCase("tr-TR") ?? "",
    "OE",
    hasPolyester,
    hasLycra,
    data.fabricTypes.find((item) => item.id === fabricTypeId)?.name ?? "",
  );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await postJson("/api/stocks", Object.fromEntries(form.entries()));
      formElement.reset();
      refreshInBackground(refresh);
      toast.success("Stok kartı kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Stok kartı kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kategori">
          <select className={inputClass} name="category" value={category} onChange={(event) => setCategory(event.target.value as "RAW" | "FABRIC")} required>
            <option value="RAW">Hammadde</option>
            <option value="FABRIC">Kumaş</option>
          </select>
        </Field>
        {category === "RAW" ? (
        <Field label="Hammadde tipi">
          <select className={inputClass} name="type" value={stockType} onChange={(event) => setStockType(event.target.value)} required={category === "RAW"}>
            <option value="IP">IP</option>
            <option value="LYC">LYC</option>
            <option value="POLY">POLY</option>
          </select>
        </Field>
        ) : null}
        {category === "RAW" ? (
          <Field label="İplik cinsi"><select className={inputClass} name="yarnTypeId" value={yarnTypeId} onChange={(event) => setYarnTypeId(event.target.value)}><option value="">Seçiniz</option>{data.yarnTypes.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
        ) : null}
        <Field label="Stok adı"><input className={inputClass} name="name" value={category === "RAW" ? previewName : `${ymPreviewName || "YM otomatik oluşur"} / ${mmPreviewName || "MM otomatik oluşur"}`} readOnly required={category === "RAW"} /></Field>
        <Field label="Ne"><select className={inputClass} name="yarnCountId" value={yarnCountId} onChange={(event) => setYarnCountId(event.target.value)} required={category === "FABRIC" || category === "RAW"}><option value="">Seçiniz</option>{data.yarnCounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Renk"><select className={inputClass} name="colorId" value={colorId} onChange={(event) => setColorId(event.target.value)} required={category === "FABRIC" || category === "RAW"}><option value="">Seçiniz</option>{data.colors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        {category === "FABRIC" ? (
          <Field label="Kumaş cinsi"><select className={inputClass} name="fabricTypeId" value={fabricTypeId} onChange={(event) => setFabricTypeId(event.target.value)} required><option value="">Seçiniz</option>{data.fabricTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        ) : null}
        <Field label="Kritik stok kg"><input className={inputClass} name="criticalStockKg" type="number" defaultValue={0} /></Field>
      </div>
      {category === "FABRIC" || category === "RAW" ? (
        <div className="flex gap-4 text-sm text-slate-600">
          <label className="flex items-center gap-2"><input checked={hasPolyester} name="hasPolyester" onChange={(event) => setHasPolyester(event.target.checked)} type="checkbox" /> Polyesterli</label>
          <label className="flex items-center gap-2"><input checked={hasLycra} name="hasLycra" onChange={(event) => setHasLycra(event.target.checked)} type="checkbox" /> Likralı</label>
        </div>
      ) : null}
      {category === "RAW" ? (
        <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
          <strong>Stok adı önizleme</strong>
          <p className="mt-1 font-semibold">{previewName || "Ne, renk ve iplik cinsi seçildiğinde otomatik oluşur."}</p>
        </div>
      ) : null}
      {category === "FABRIC" ? (
        <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
          <strong>YM/MM stok adı önizleme</strong>
          <p className="mt-1 font-semibold">YM: {ymPreviewName || "Ne, kumaş cinsi ve renk seçildiğinde oluşur."}</p>
          <p className="mt-1 font-semibold">MM: {mmPreviewName || "Ne, kumaş cinsi ve renk seçildiğinde oluşur."}</p>
        </div>
      ) : null}
      <FormButton loading={loading}>Stok kartını kaydet</FormButton>
    </form>
  );
}

export function StockCardEditForm({ stock, onDone }: { stock: StockCard; onDone: () => void }) {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await patchJson(`/api/stocks/${stock.id}`, {
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
        <Field label="Kategori"><select className={inputClass} value={["YM", "MM"].includes(stock.type) ? "Kumaş" : "Hammadde"} disabled><option>Hammadde</option><option>Kumaş</option></select></Field>
        <Field label="Stok tipi"><select className={inputClass} name="type" defaultValue={stock.type} required><option value="IP">IP</option><option value="LYC">LYC</option><option value="POLY">POLY</option><option value="YM">YM</option><option value="MM">MM</option></select></Field>
        <Field label="Stok adı"><input className={inputClass} name="name" defaultValue={stock.name} required /></Field>
        <Field label="İplik cinsi"><select className={inputClass} name="yarnTypeId" defaultValue={stock.yarnTypeId ?? ""}><option value="">Seçiniz</option>{data.yarnTypes.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
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
}

export function OrderForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const customers = data.partners.filter((item) => item.type === "CUSTOMER" && item.isActive !== false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await postJson("/api/orders", {
        customerName: form.get("customerName"),
        orderDate: form.get("orderDate"),
        dueDate: form.get("dueDate"),
        fabricTypeId: form.get("fabricTypeId"),
        colorId: form.get("colorId"),
        yarnCountId: form.get("yarnCountId"),
        hasPolyester: form.get("hasPolyester") === "on",
        hasLycra: form.get("hasLycra") === "on",
        rawWidth: form.get("rawWidth"),
        rawGsm: form.get("rawGsm"),
        finishWidth: form.get("finishWidth"),
        finishGsm: form.get("finishGsm"),
        quantityKg: form.get("quantityKg"),
        description: form.get("description"),
      });
      formElement.reset();
      refreshInBackground(refresh);
      toast.success("Sipariş kaydedildi; YM/MM stok eşleşmesi tamamlandı.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sipariş kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Müşteri"><select className={inputClass} name="customerName" required><option value="">Cari seçiniz</option>{customers.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></Field>
        <Field label="Sipariş tarihi"><input className={inputClass} name="orderDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="Termin"><input className={inputClass} name="dueDate" type="date" required /></Field>
        <Field label="Kumaş cinsi"><select className={inputClass} name="fabricTypeId" required>{data.fabricTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Renk"><select className={inputClass} name="colorId" required>{data.colors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Ne"><select className={inputClass} name="yarnCountId" required>{data.yarnCounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Sipariş kg"><input className={inputClass} name="quantityKg" type="number" required /></Field>
        <Field label="Ham en"><input className={inputClass} name="rawWidth" type="number" required /></Field>
        <Field label="Ham gramaj"><input className={inputClass} name="rawGsm" type="number" required /></Field>
        <Field label="Finish en"><input className={inputClass} name="finishWidth" type="number" required /></Field>
        <Field label="Finish gramaj"><input className={inputClass} name="finishGsm" type="number" required /></Field>
      </div>
      <div className="flex gap-4 text-sm text-slate-600">
        <label className="flex items-center gap-2"><input name="hasPolyester" type="checkbox" /> Polyesterli</label>
        <label className="flex items-center gap-2"><input name="hasLycra" type="checkbox" /> Likralı</label>
      </div>
      <Field label="Açıklama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <div className="grid gap-3 rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
        <strong>Otomatik stok eşleştirme</strong>
        <span>Aynı özelliklerde YM/MM yoksa sistem transaction içinde yeni stok kartı ve kod açar.</span>
      </div>
      <FormButton loading={loading}>Siparişi kaydet</FormButton>
    </form>
  );
}

export function OrderEditForm({ order, onDone }: { order: Order; onDone: () => void }) {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const customers = data.partners.filter((item) => item.type === "CUSTOMER" && item.isActive !== false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await patchJson(`/api/orders/${order.id}`, Object.fromEntries(form.entries()));
      refreshInBackground(refresh);
      onDone();
      toast.success("Sipariş güncellendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sipariş güncellenemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Müşteri"><select className={inputClass} name="customerName" defaultValue={order.customerName} required><option value="">Cari seçiniz</option>{customers.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></Field>
        <Field label="Sipariş tarihi"><input className={inputClass} name="orderDate" type="date" defaultValue={order.orderDate} required /></Field>
        <Field label="Termin"><input className={inputClass} name="dueDate" type="date" defaultValue={order.dueDate} required /></Field>
        <Field label="Sipariş kg"><input className={inputClass} name="quantityKg" type="number" defaultValue={order.quantityKg} required /></Field>
        <Field label="Durum"><select className={inputClass} name="status" defaultValue={order.status}><option>Taslak</option><option>Onaylandı</option><option>İplik Bekliyor</option><option>Örmede</option><option>Ham Geldi</option><option>Boyahanede</option><option>Mamül Hazır</option><option>Sevk Edildi</option><option>Kapandı</option><option>İptal</option></select></Field>
      </div>
      <Field label="Açıklama"><textarea className={inputClass} name="description" rows={3} defaultValue={order.description} /></Field>
      <FormButton loading={loading}>Siparişi güncelle</FormButton>
    </form>
  );
}

export function PurchaseOrderForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const rawMaterialStocks = data.stockCards.filter((item) => ["IP", "LYC", "POLY", "YM"].includes(item.type) && item.isActive !== false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const stock = data.stockCards.find((item) => item.id === form.get("stockId"));
    try {
      if (!stock) throw new Error("Hammadde stok kartı seçilmelidir.");
      await postJson("/api/purchase-orders", {
        supplierId: form.get("supplierId"),
        orderDate: form.get("orderDate"),
        dueDate: form.get("dueDate"),
        description: form.get("description"),
        item: {
          stockId: stock.id,
          stockCode: stock.code,
          stockName: stock.name,
          stockType: stock.type,
          yarnCountId: stock.yarnCountId,
          colorId: stock.colorId,
          orderedKg: form.get("orderedKg"),
          unitPrice: form.get("unitPrice"),
          currency: form.get("currency"),
        },
      });
      formElement.reset();
      refreshInBackground(refresh);
      toast.success("Satıcı siparişi kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Satıcı siparişi kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Satıcı"><select className={inputClass} name="supplierId" required>{data.partners.filter((item) => item.type === "SUPPLIER").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Stok"><select className={inputClass} name="stockId" required>{rawMaterialStocks.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
        <Field label="Sipariş tarihi"><input className={inputClass} name="orderDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="Termin"><input className={inputClass} name="dueDate" type="date" required /></Field>
        <Field label="Miktar kg"><input className={inputClass} name="orderedKg" type="number" required /></Field>
        <Field label="Birim fiyat"><input className={inputClass} name="unitPrice" type="number" step="0.01" /></Field>
        <Field label="Para birimi"><select className={inputClass} name="currency" defaultValue="TRY"><option>TRY</option><option>USD</option><option>EUR</option></select></Field>
      </div>
      <Field label="Açıklama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>Satıcı siparişini kaydet</FormButton>
    </form>
  );
}

export function PurchaseOrderEditForm({ order, onDone }: { order: PurchaseOrder; onDone: () => void }) {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const item = normalizeItems(order.items)[0];
  const rawMaterialStocks = data.stockCards.filter((stock) => ["IP", "LYC", "POLY", "YM"].includes(stock.type) && stock.isActive !== false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const stock = data.stockCards.find((row) => row.id === form.get("stockId"));
    try {
      if (!stock) throw new Error("Stok seçilmelidir.");
      await patchJson(`/api/purchase-orders/${order.id}`, {
        ...Object.fromEntries(form.entries()),
        stockCode: stock.code,
        stockName: stock.name,
        stockType: stock.type,
        yarnCountId: stock.yarnCountId,
        colorId: stock.colorId,
      });
      refreshInBackground(refresh);
      onDone();
      toast.success("Satıcı siparişi güncellendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Satıcı siparişi güncellenemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Satıcı"><select className={inputClass} name="supplierId" defaultValue={order.supplierId} required>{data.partners.filter((partner) => partner.type === "SUPPLIER").map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></Field>
        <Field label="Stok"><select className={inputClass} name="stockId" defaultValue={item?.stockId ?? ""} required>{rawMaterialStocks.map((stock) => <option key={stock.id} value={stock.id}>{stock.code} - {stock.name}</option>)}</select></Field>
        <Field label="Sipariş tarihi"><input className={inputClass} name="orderDate" type="date" defaultValue={order.orderDate} required /></Field>
        <Field label="Termin"><input className={inputClass} name="dueDate" type="date" defaultValue={order.dueDate} required /></Field>
        <Field label="Sipariş kg"><input className={inputClass} name="orderedKg" type="number" defaultValue={item?.orderedKg ?? order.totalOrderedKg} required /></Field>
        <Field label="Birim fiyat"><input className={inputClass} name="unitPrice" type="number" step="0.01" defaultValue={item?.unitPrice ?? ""} /></Field>
        <Field label="Para birimi"><select className={inputClass} name="currency" defaultValue={item?.currency ?? "TRY"}><option>TRY</option><option>USD</option><option>EUR</option></select></Field>
        <Field label="Durum"><select className={inputClass} name="status" defaultValue={order.status}><option>Taslak</option><option>Onaylandı</option><option>Kısmi Geldi</option><option>Tamamlandı</option><option>İptal</option></select></Field>
      </div>
      <Field label="Açıklama"><textarea className={inputClass} name="description" rows={3} defaultValue={order.description} /></Field>
      <FormButton loading={loading}>Satıcı siparişini güncelle</FormButton>
    </form>
  );
}

export function PurchaseReceiptForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const getPurchaseReceiptOptionLabel = (order: PurchaseOrder) => {
    const item = normalizeItems(order.items)[0];
    const stockName = item?.stockName || data.stockCards.find((stock) => stock.id === item?.stockId)?.name || "Stok seçilmemiş";
    const supplierName = getName(data.partners, order.supplierId);
    return `${order.purchaseOrderNo} · ${supplierName} · ${stockName} · ${formatKg(order.totalRemainingKg)} kalan`;
  };
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const order = data.purchaseOrders.find((item) => item.id === form.get("purchaseOrderId"));
    const item = normalizeItems(order?.items)[0];
    try {
      if (!order || !item) throw new Error("Satıcı siparişi seçilmelidir.");
      await postJson("/api/purchase-receipts", {
        purchaseOrderId: order.id,
        purchaseOrderItemId: item.id,
        stockId: item.stockId,
        receiptDate: form.get("receiptDate"),
        warehouseId: form.get("warehouseId"),
        receivedKg: form.get("receivedKg"),
        lotNo: form.get("lotNo"),
        description: form.get("description"),
      });
      formElement.reset();
      refreshInBackground(refresh);
      toast.success("Mal kabul kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mal kabul kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <Field label="Satıcı siparişi"><select className={inputClass} name="purchaseOrderId" required>{data.purchaseOrders.filter((item) => item.status !== "Tamamlandı").map((item) => <option key={item.id} value={item.id}>{getPurchaseReceiptOptionLabel(item)}</option>)}</select></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mal kabul tarihi"><input className={inputClass} name="receiptDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="Depo"><select className={inputClass} name="warehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Gelen kg"><input className={inputClass} name="receivedKg" type="number" required /></Field>
        <Field label="Lot no"><input className={inputClass} name="lotNo" /></Field>
      </div>
      <Field label="Açıklama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>Mal kabul kaydet</FormButton>
    </form>
  );
}

export function DirectPurchaseForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const rawMaterialStocks = data.stockCards.filter((item) => ["IP", "LYC", "POLY", "YM"].includes(item.type) && item.isActive !== false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await postJson("/api/direct-purchases", {
        supplierId: form.get("supplierId"),
        stockId: form.get("stockId"),
        receiptDate: form.get("receiptDate"),
        warehouseId: form.get("warehouseId"),
        quantityKg: form.get("quantityKg"),
        unitPrice: form.get("unitPrice"),
        currency: form.get("currency"),
        lotNo: form.get("lotNo"),
        description: form.get("description"),
      });
      formElement.reset();
      refreshInBackground(refresh);
      toast.success("Hammadde alışı kaydedildi ve stok girişi işlendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Hammadde alışı kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
        Bu ekran müşteri siparişinden bağımsız IP, LYC, POLY veya YM ham kumaş alışı içindir. Kaydettiğinde sistem tamamlanmış satıcı siparişi, mal kabul ve stok giriş hareketini birlikte oluşturur.
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Satıcı"><select className={inputClass} name="supplierId" required>{data.partners.filter((item) => item.type === "SUPPLIER").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Stok"><select className={inputClass} name="stockId" required>{rawMaterialStocks.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
        <Field label="Alış tarihi"><input className={inputClass} name="receiptDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="Giriş deposu"><select className={inputClass} name="warehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Gelen kg"><input className={inputClass} name="quantityKg" type="number" required /></Field>
        <Field label="Birim fiyat"><input className={inputClass} name="unitPrice" type="number" step="0.01" /></Field>
        <Field label="Para birimi"><select className={inputClass} name="currency" defaultValue="TRY"><option>TRY</option><option>USD</option><option>EUR</option></select></Field>
        <Field label="Lot no"><input className={inputClass} name="lotNo" /></Field>
      </div>
      <Field label="Açıklama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>Hammadde alışını kaydet</FormButton>
    </form>
  );
}

export function TransferForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const [stockId, setStockId] = useState("");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [quantity, setQuantity] = useState("");
  const lotOptions = Array.from(new Set(data.purchaseReceipts.flatMap((receipt) => normalizeItems(receipt.items).map((item) => item.lotNo).filter(Boolean) as string[])));
  const transferPartyId = data.parties.some((item) => item.id === trackingId) ? trackingId : undefined;
  const transferLotNo = trackingId && !transferPartyId ? trackingId : undefined;
  const transferAvailable = getAvailableBalance(data, { stockId, warehouseId: fromWarehouseId, partyId: transferPartyId, lotNo: transferLotNo });
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await postJson("/api/transfers", {
        date: form.get("date"),
        fromWarehouseId: form.get("fromWarehouseId"),
        toWarehouseId: form.get("toWarehouseId"),
        description: form.get("description"),
        items: [{ stockId: form.get("stockId"), partyId: form.get("trackingId") || null, quantity: form.get("quantity") }],
      });
      formElement.reset();
      refreshInBackground(refresh);
      toast.success("Transfer kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transfer kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <QuickLookupBox onApply={(result) => {
        if (result.stockId) setStockId(result.stockId);
        if (result.warehouseId) setFromWarehouseId(result.warehouseId);
        setTrackingId(result.partyId ?? result.lotNo ?? "");
      }} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tarih"><input className={inputClass} name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="Kaynak depo"><select className={inputClass} name="fromWarehouseId" value={fromWarehouseId} onChange={(event) => setFromWarehouseId(event.target.value)} required><option value="">Seçiniz</option>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Hedef depo"><select className={inputClass} name="toWarehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Stok kartı"><select className={inputClass} name="stockId" value={stockId} onChange={(event) => setStockId(event.target.value)} required><option value="">Seçiniz</option>{data.stockCards.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
        <Field label="Parti / lot"><select className={inputClass} name="trackingId" value={trackingId} onChange={(event) => setTrackingId(event.target.value)}><option value="">Takipsiz</option>{data.parties.map((item) => <option key={item.id} value={item.id}>Parti {item.partyNo}</option>)}{lotOptions.map((lotNo) => <option key={lotNo} value={lotNo}>Lot {lotNo}</option>)}</select></Field>
        <Field label="Miktar kg"><input className={inputClass} name="quantity" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></Field>
      </div>
      {(stockId && fromWarehouseId) ? <BalanceHint available={transferAvailable} quantity={Number(quantity)} /> : null}
      <Field label="Açıklama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>Transfer oluştur</FormButton>
    </form>
  );
}

export function RawProductionForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [consumedLotNo, setConsumedLotNo] = useState("");
  const [consumedStockId, setConsumedStockId] = useState("");
  const [consumedWarehouseId, setConsumedWarehouseId] = useState("");
  const [consumedKg, setConsumedKg] = useState("");
  const waste = calculateRawWaste(930, 860);
  const lotOptions = Array.from(new Set(data.purchaseReceipts.flatMap((receipt) => normalizeItems(receipt.items).map((item) => item.lotNo).filter(Boolean) as string[])));
  const selectedOrder = data.orders.find((item) => item.id === orderId);
  const selectedParty = data.parties.find((item) => item.id === partyId);
  const consumedAvailable = getAvailableBalance(data, { stockId: consumedStockId, warehouseId: consumedWarehouseId, lotNo: consumedLotNo });
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
        consumedItems: [{ stockId: form.get("consumedStockId"), warehouseId: form.get("consumedWarehouseId"), lotNo: form.get("consumedLotNo") || null, quantityKg: form.get("consumedKg") }],
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
      <QuickLookupBox onApply={(result) => {
        if (result.orderId) setOrderId(result.orderId);
        if (result.partyId) setPartyId(result.partyId);
        if (result.lotNo) setConsumedLotNo(result.lotNo);
        if (result.stockId) setConsumedStockId(result.stockId);
        if (result.warehouseId) setConsumedWarehouseId(result.warehouseId);
      }} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tarih"><input className={inputClass} name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="Sipariş"><select className={inputClass} name="orderId" value={orderId} onChange={(event) => setOrderId(event.target.value)} required><option value="">Seçiniz</option>{data.orders.map((item) => <option key={item.id} value={item.id}>{item.orderNo} - {item.customerName}</option>)}</select></Field>
        <Field label="Mevcut parti"><select className={inputClass} name="partyId" value={partyId} onChange={(event) => setPartyId(event.target.value)}><option value="">Yeni parti aç</option>{data.parties.map((item) => <option key={item.id} value={item.id}>{item.partyNo}</option>)}</select></Field>
        <Field label="Fason örmeci"><select className={inputClass} name="knitterPartnerId" required>{data.partners.filter((item) => item.type === "KNITTER").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Ham giriş deposu"><select className={inputClass} name="warehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Üretilen ham kg"><input className={inputClass} name="producedRawKg" type="number" required /></Field>
        <Field label="Ham en"><input className={inputClass} name="rawWidth" type="number" required /></Field>
        <Field label="Ham gramaj"><input className={inputClass} name="rawGsm" type="number" required /></Field>
        <Field label="Tüketilen stok"><select className={inputClass} name="consumedStockId" value={consumedStockId} onChange={(event) => setConsumedStockId(event.target.value)} required><option value="">Seçiniz</option>{data.stockCards.filter((item) => ["IP", "LYC", "POLY"].includes(item.type)).map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
        <Field label="Tüketim deposu"><select className={inputClass} name="consumedWarehouseId" value={consumedWarehouseId} onChange={(event) => setConsumedWarehouseId(event.target.value)} required><option value="">Seçiniz</option>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Tüketilen lot"><select className={inputClass} name="consumedLotNo" value={consumedLotNo} onChange={(event) => setConsumedLotNo(event.target.value)} required><option value="">Lot seçiniz</option>{lotOptions.map((lotNo) => <option key={lotNo} value={lotNo}>{lotNo}</option>)}</select></Field>
        <Field label="Tüketilen kg"><input className={inputClass} name="consumedKg" type="number" value={consumedKg} onChange={(event) => setConsumedKg(event.target.value)} required /></Field>
      </div>
      {(consumedStockId && consumedWarehouseId && consumedLotNo) ? <BalanceHint available={consumedAvailable} quantity={Number(consumedKg)} label="Lot kullanılabilir bakiye" /> : null}
      <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
        Örnek fire hesabı: <strong>{formatKg(waste.wasteKg)} / {formatPercent(waste.wastePercent)}</strong>. Kayıtta gerçek tüketim ve üretim kg değerleriyle hesaplanır.
      </div>
      {(selectedOrder || selectedParty) ? (
        <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
          <strong>Otomatik eşleşme</strong>
          <p className="mt-1">YM: {getStockLabel(data, selectedParty?.ymStockId ?? selectedOrder?.ymStockId)} · Parti: {selectedParty?.partyNo ?? "Yeni parti"}</p>
        </div>
      ) : null}
      <Field label="Açıklama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>Ham üretimi kaydet</FormButton>
    </form>
  );
}

export function DyehouseProductionForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const [partyId, setPartyId] = useState("");
  const [inputWarehouseId, setInputWarehouseId] = useState("");
  const [inputRawKg, setInputRawKg] = useState("");
  const waste = calculateDyehouseWaste(2900, 2720);
  const selectedParty = data.parties.find((item) => item.id === partyId);
  const rawAvailable = getAvailableBalance(data, { stockId: selectedParty?.ymStockId, warehouseId: inputWarehouseId, partyId });
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await postJson("/api/production/dyehouse", {
        date: form.get("date"),
        partyId: form.get("partyId"),
        dyehousePartnerId: form.get("dyehousePartnerId"),
        inputWarehouseId: form.get("inputWarehouseId"),
        outputWarehouseId: form.get("outputWarehouseId"),
        inputRawKg: form.get("inputRawKg"),
        finishedKg: form.get("finishedKg"),
        finishWidth: form.get("finishWidth"),
        finishGsm: form.get("finishGsm"),
        description: form.get("description"),
      });
      formElement.reset();
      refreshInBackground(refresh);
      toast.success("Boyahane üretimi kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Boyahane üretimi kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <QuickLookupBox onApply={(result) => {
        if (result.partyId) {
          setPartyId(result.partyId);
          if (result.warehouseId) setInputWarehouseId(result.warehouseId);
        }
        else if (result.orderId) {
          const party = data.parties.find((item) => item.orderId === result.orderId);
          if (party) {
            setPartyId(party.id);
            setInputWarehouseId(party.currentWarehouseId);
          }
        }
      }} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tarih"><input className={inputClass} name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="Parti"><select className={inputClass} name="partyId" value={partyId} onChange={(event) => setPartyId(event.target.value)} required><option value="">Seçiniz</option>{data.parties.map((item) => <option key={item.id} value={item.id}>{item.partyNo}</option>)}</select></Field>
        <Field label="Boyahane"><select className={inputClass} name="dyehousePartnerId" required>{data.partners.filter((item) => item.type === "DYEHOUSE").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Ham çıkış deposu"><select className={inputClass} name="inputWarehouseId" value={inputWarehouseId} onChange={(event) => setInputWarehouseId(event.target.value)} required><option value="">Seçiniz</option>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Mamül giriş deposu"><select className={inputClass} name="outputWarehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Giden ham kg"><input className={inputClass} name="inputRawKg" type="number" value={inputRawKg} onChange={(event) => setInputRawKg(event.target.value)} required /></Field>
        <Field label="Dönen mamül kg"><input className={inputClass} name="finishedKg" type="number" required /></Field>
        <Field label="Finish en"><input className={inputClass} name="finishWidth" type="number" required /></Field>
        <Field label="Finish gramaj"><input className={inputClass} name="finishGsm" type="number" required /></Field>
      </div>
      <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
        Örnek boyahane fire: <strong>{formatKg(waste.wasteKg)} / {formatPercent(waste.wastePercent)}</strong>. Kayıtta gerçek ham/mamül kg değerleriyle hesaplanır.
      </div>
      {(selectedParty && inputWarehouseId) ? <BalanceHint available={rawAvailable} quantity={Number(inputRawKg)} label="Parti YM kullanılabilir bakiye" /> : null}
      {selectedParty ? (
        <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
          <strong>Otomatik eşleşme</strong>
          <p className="mt-1">YM: {getStockLabel(data, selectedParty.ymStockId)} · MM: {getStockLabel(data, selectedParty.mmStockId)}</p>
        </div>
      ) : null}
      <Field label="Açıklama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>Boyahane işlemini kaydet</FormButton>
    </form>
  );
}

export function SaleForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const [partyId, setPartyId] = useState("");
  const [stockId, setStockId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [quantityKg, setQuantityKg] = useState("");
  const finishedStocks = data.stockCards.filter((item) => item.type === "MM" && item.isActive !== false);
  const customers = data.partners.filter((item) => item.type === "CUSTOMER" && item.isActive !== false);
  const selectedParty = data.parties.find((item) => item.id === partyId);
  const selectedOrder = data.orders.find((item) => item.id === selectedParty?.orderId);
  const saleAvailable = getAvailableBalance(data, { stockId, warehouseId, partyId });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const party = data.parties.find((item) => item.id === form.get("partyId"));
    try {
      await postJson("/api/sales", {
        date: form.get("date"),
        customerName: form.get("customerName"),
        warehouseId: form.get("warehouseId"),
        stockId: form.get("stockId"),
        partyId: form.get("partyId"),
        orderId: party?.orderId,
        quantityKg: form.get("quantityKg"),
        unitPrice: form.get("unitPrice"),
        currency: form.get("currency"),
        description: form.get("description"),
      });
      formElement.reset();
      refreshInBackground(refresh);
      toast.success("Satış / sevkiyat kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Satış kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tarih"><input className={inputClass} name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="Müşteri"><select className={inputClass} name="customerName" value={customerName} onChange={(event) => setCustomerName(event.target.value)} required><option value="">Cari seçiniz</option>{customers.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></Field>
      </div>
      <QuickLookupBox
        label="Sipariş / parti / lot ile hızlı getir"
        placeholder="Sipariş no, parti no veya lot no yazıp Enter'a basın"
        onApply={(result) => {
          if (result.partyId) {
            const party = data.parties.find((item) => item.id === result.partyId);
            setPartyId(result.partyId);
            setStockId(party?.mmStockId ?? result.stockId ?? "");
            setWarehouseId(result.warehouseId ?? party?.currentWarehouseId ?? "");
            setCustomerName(data.orders.find((item) => item.id === party?.orderId)?.customerName ?? customerName);
            return;
          }
          if (result.stockId) setStockId(result.stockId);
          if (result.warehouseId) setWarehouseId(result.warehouseId);
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mamül stok"><select className={inputClass} name="stockId" value={stockId} onChange={(event) => setStockId(event.target.value)} required><option value="">Seçiniz</option>{finishedStocks.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
        <Field label="Parti"><select className={inputClass} name="partyId" value={partyId} onChange={(event) => {
          const party = data.parties.find((item) => item.id === event.target.value);
          setPartyId(event.target.value);
          setStockId(party?.mmStockId ?? stockId);
          setWarehouseId(party?.currentWarehouseId ?? warehouseId);
          setCustomerName(data.orders.find((item) => item.id === party?.orderId)?.customerName ?? customerName);
        }} required><option value="">Seçiniz</option>{data.parties.map((item) => <option key={item.id} value={item.id}>{item.partyNo}</option>)}</select></Field>
        <Field label="Çıkış deposu"><select className={inputClass} name="warehouseId" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} required><option value="">Seçiniz</option>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Sevk kg"><input className={inputClass} name="quantityKg" type="number" value={quantityKg} onChange={(event) => setQuantityKg(event.target.value)} required /></Field>
        <Field label="Birim fiyat"><input className={inputClass} name="unitPrice" type="number" step="0.01" /></Field>
        <Field label="Para birimi"><select className={inputClass} name="currency" defaultValue="TRY"><option>TRY</option><option>USD</option><option>EUR</option></select></Field>
      </div>
      {selectedParty ? (
        <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
          <strong>Otomatik eşleşme</strong>
          <p className="mt-1">Parti: {selectedParty.partyNo} · Müşteri: {selectedOrder?.customerName ?? "-"} · MM: {getStockLabel(data, selectedParty.mmStockId)} · Depo: {getName(data.warehouses, selectedParty.currentWarehouseId)}</p>
        </div>
      ) : null}
      {(stockId && warehouseId && partyId) ? <BalanceHint available={saleAvailable} quantity={Number(quantityKg)} label="Sevkiyat kullanılabilir bakiye" /> : null}
      <Field label="Açıklama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>Sevkiyat kaydet</FormButton>
    </form>
  );
}

export function PartyShiftForm({ onDone }: { onDone?: () => void }) {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await postJson("/api/party-shifts", {
        sourceOrderId: form.get("sourceOrderId"),
        partyId: form.get("partyId"),
        quantityKg: form.get("quantityKg"),
        targetOrderId: form.get("targetOrderId"),
        mode: form.get("mode"),
      });
      formElement.reset();
      refreshInBackground(refresh);
      onDone?.();
      toast.success("Parti kaydırma kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Parti kaydırma kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kaynak sipariş"><select className={inputClass} name="sourceOrderId" required>{data.orders.map((item) => <option key={item.id} value={item.id}>{item.orderNo} - {item.customerName}</option>)}</select></Field>
        <Field label="Parti"><select className={inputClass} name="partyId" required>{data.parties.map((item) => <option key={item.id} value={item.id}>{item.partyNo}</option>)}</select></Field>
        <Field label="Kaydırılacak kg"><input className={inputClass} name="quantityKg" type="number" required /></Field>
        <Field label="Hedef sipariş"><select className={inputClass} name="targetOrderId" required>{data.orders.map((item) => <option key={item.id} value={item.id}>{item.orderNo} - {item.customerName}</option>)}</select></Field>
        <Field label="Kaydırma tipi"><select className={inputClass} name="mode" defaultValue="partial"><option value="partial">Belirli kg</option><option value="all">Partinin tamamı</option></select></Field>
      </div>
      <FormButton loading={loading}>Parti kaydır</FormButton>
    </form>
  );
}

const rolePermissions = [
  "dashboard:read",
  "orders:write",
  "stocks:write",
  "production:write",
  "purchase:write",
  "sales:write",
  "settings:write",
  "reports:read",
];

export function RoleForm() {
  const { refresh } = useErpData();
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await postJson("/api/roles", {
        name: form.get("name"),
        description: form.get("description"),
        permissions: form.getAll("permissions"),
      });
      formElement.reset();
      refreshInBackground(refresh);
      toast.success("Rol kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rol kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <Field label="Rol adı"><input className={inputClass} name="name" required /></Field>
      <Field label="Açıklama"><textarea className={inputClass} name="description" rows={2} /></Field>
      <div className="grid gap-2 sm:grid-cols-2">
        {rolePermissions.map((permission) => (
          <label key={permission} className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <input name="permissions" type="checkbox" value={permission} />
            {permission}
          </label>
        ))}
      </div>
      <FormButton loading={loading}>Rol kaydet</FormButton>
    </form>
  );
}

export function UserProfileForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await postJson("/api/users", {
        email: form.get("email"),
        fullName: form.get("fullName"),
        roleId: form.get("roleId"),
      });
      formElement.reset();
      refreshInBackground(refresh);
      toast.success("Kullanıcı profili kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kullanıcı kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <Field label="Ad soyad"><input className={inputClass} name="fullName" required /></Field>
      <Field label="E-posta"><input className={inputClass} name="email" type="email" required /></Field>
      <Field label="Rol"><select className={inputClass} name="roleId" required>{data.roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <FormButton loading={loading}>Kullanıcı kaydet</FormButton>
    </form>
  );
}
export function PurchaseReceiptEditForm({ receipt, onDone }: { receipt: PurchaseReceipt; onDone: () => void }) {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const item = receipt.items[0];
  const isDirect = !receipt.purchaseOrderId;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await patchJson(`/api/purchase-receipts/${receipt.id}`, Object.fromEntries(form.entries()));
      refreshInBackground(refresh);
      onDone();
      toast.success("Mal kabul güncellendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mal kabul güncellenemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mal kabul tarihi"><input className={inputClass} name="receiptDate" type="date" defaultValue={receipt.receiptDate} required /></Field>
        <Field label="Satıcı"><select className={inputClass} name="supplierId" defaultValue={receipt.supplierId} disabled={!isDirect} required>{data.partners.filter(p => p.type === "SUPPLIER").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Depo"><select className={inputClass} name="warehouseId" defaultValue={receipt.warehouseId} required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Stok"><select className={inputClass} name="stockId" defaultValue={item?.stockId} disabled={!isDirect} required>{data.stockCards.filter(s => ["IP", "LYC", "POLY", "YM"].includes(s.type)).map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
        <Field label="Gelen kg"><input className={inputClass} name="receivedKg" type="number" defaultValue={item?.receivedKg} required /></Field>
        {isDirect && <Field label="Birim Fiyat (₺)"><input className={inputClass} name="unitPrice" type="number" step="0.01" defaultValue={item?.unitPrice} required /></Field>}
        <Field label="Lot no"><input className={inputClass} name="lotNo" defaultValue={item?.lotNo ?? ""} /></Field>
      </div>
      <Field label="Açıklama"><textarea className={inputClass} name="description" rows={3} defaultValue={receipt.description} /></Field>
      <FormButton loading={loading}>Mal kabul güncelle</FormButton>
    </form>
  );
}
