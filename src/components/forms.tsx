"use client";

import { useState, useMemo, useEffect } from "react";
import { AlertTriangle, Boxes, CheckCircle2, Factory, Layout, PackageCheck, Plus, Search, Users, X, Truck, ShoppingCart, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useErpData } from "@/components/erp-data-provider";
import { calculateDyehouseWaste, calculateRawWaste, getName } from "@/services/erp-service";
import { cn, formatKg, formatPercent, normalizeItems } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { DyehouseProduction, ErpData, NamedEntity, Order, Partner, PurchaseOrder, PurchaseReceipt, RawProduction, Sale, StockCard, Transfer, Warehouse } from "@/types/erp";

const inputClass = "w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";
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
    <button className="rounded-none bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100 disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} type="submit">
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
  const color = colorName.toLocaleUpperCase("tr-TR");
  const fabric = fabricTypeName.toLocaleUpperCase("tr-TR");
  const lyc = hasLycra ? "LYC" : "";
  const poly = hasPolyester ? "POLY" : "";

  if (type === "IP") {
    return [yarnCountName, color, lyc, poly].filter(Boolean).join(" ");
  }
  if (type === "LYC") return ["LYCRA", yarnCountName, color].filter(Boolean).join(" ");
  if (type === "POLY") return ["POLYESTER", yarnCountName, color].filter(Boolean).join(" ");

  if (type === "YM") {
    return [yarnCountName, fabric, color, lyc, poly, "HAM"].filter(Boolean).join(" ");
  }
  if (type === "MM") {
    return [yarnCountName, fabric, color, lyc, poly].filter(Boolean).join(" ");
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
    .filter((item) => {
      if (input.lotNo === undefined) return true;
      return (item.lotNo || "") === (input.lotNo || "");
    })
    .reduce((sum, item) => sum + item.quantity, 0);
}

function BalanceHint({ available, quantity, label = "Kullanılabilir bakiye" }: { available: number; quantity?: number; label?: string }) {
  const requested = Number(quantity ?? 0);
  const isNegative = requested > 0 && requested > available;
  return (
    <div className={`rounded-none p-4 text-sm ${isNegative ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}>
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
    <div className="rounded-none border border-blue-100 bg-blue-50 p-4">
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
        <button className="rounded-none bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100" onClick={runLookup} type="button">
          Getir
        </button>
      </div>
      {result ? (
        <div className="mt-3 rounded-none bg-white px-4 py-3 text-sm text-blue-800 shadow-sm">
          <strong>{result.label}</strong>
          <span className="ml-2 text-blue-500">{result.helper}</span>
          {(result.stockOptions?.length ?? 0) > 1 ? (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {result.stockOptions?.map((option) => (
                <button
                  key={`${option.type}-${option.stockId}`}
                  className="rounded-none border border-blue-100 bg-blue-50 px-4 py-3 text-left text-sm font-semibold text-blue-800 transition hover:border-blue-200 hover:bg-blue-100"
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
        <div className="rounded-none bg-blue-50 p-4 text-sm text-blue-800">
          <strong>Stok adı önizleme</strong>
          <p className="mt-1 font-semibold">{previewName || "Ne, renk ve iplik cinsi seçildiğinde otomatik oluşur."}</p>
        </div>
      ) : null}
      {category === "FABRIC" ? (
        <div className="rounded-none bg-blue-50 p-4 text-sm text-blue-800">
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
        dyehouseProcessTypeIds: Array.from(formElement.querySelectorAll('input[name="dyehouseProcessTypeIds"]:checked')).map((el: any) => el.value),
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

  const isWide = data.uiSettings.modalPosition === "center";

  return (
    <form className={cn("grid gap-8", isWide ? "lg:grid-cols-2 xl:grid-cols-4" : "grid-cols-1")} onSubmit={submit}>
      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
          <div className="grid size-8 place-items-center rounded-none bg-blue-50 text-blue-600">
            <Users className="size-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Müşteri & Tarih</h3>
        </div>
        <div className="grid gap-4">
          <Field label="Müşteri"><select className={inputClass} name="customerName" required><option value="">Cari seçiniz</option>{customers.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></Field>
          <Field label="Sipariş tarihi"><input className={inputClass} name="orderDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
          <Field label="Termin"><input className={inputClass} name="dueDate" type="date" required /></Field>
          <Field label="Sipariş kg"><input className={inputClass} name="quantityKg" type="number" required /></Field>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
          <div className="grid size-8 place-items-center rounded-none bg-purple-50 text-purple-600">
            <Layout className="size-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Kumaş & Renk</h3>
        </div>
        <div className="grid gap-4">
          <Field label="Kumaş cinsi"><select className={inputClass} name="fabricTypeId" required>{data.fabricTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Renk"><select className={inputClass} name="colorId" required>{data.colors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Ne (İplik No)"><select className={inputClass} name="yarnCountId" required>{data.yarnCounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
          <div className="grid size-8 place-items-center rounded-none bg-amber-50 text-amber-600">
            <Factory className="size-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Teknik Değerler</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ham En"><input className={inputClass} name="rawWidth" type="number" required /></Field>
          <Field label="Ham Grm"><input className={inputClass} name="rawGsm" type="number" required /></Field>
          <Field label="Finish En"><input className={inputClass} name="finishWidth" type="number" required /></Field>
          <Field label="Finish Grm"><input className={inputClass} name="finishGsm" type="number" required /></Field>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
          <div className="grid size-8 place-items-center rounded-none bg-indigo-50 text-indigo-600">
            <SlidersHorizontal className="size-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Boyahane İşlemleri</h3>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 border border-slate-100 rounded-none max-h-[160px] overflow-y-auto">
          {data.processTypes.map(pt => (
            <label key={pt.id} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-white transition-colors">
              <input name="dyehouseProcessTypeIds" type="checkbox" value={pt.id} className="size-4 rounded border-slate-300" />
              <span className="text-[11px] font-semibold text-slate-700">{pt.name}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-4 p-3 bg-slate-50 rounded-none border border-slate-100 text-[11px] font-bold">
          <label className="flex items-center gap-2 cursor-pointer"><input name="hasPolyester" type="checkbox" className="size-4 rounded border-slate-300" /> POLY</label>
          <label className="flex items-center gap-2 cursor-pointer"><input name="hasLycra" type="checkbox" className="size-4 rounded border-slate-300" /> LYC</label>
        </div>
        <Field label="Açıklama"><textarea className={cn(inputClass, "h-24 resize-none")} name="description" placeholder="Notlar..." /></Field>
        <div className="pt-2">
          <FormButton loading={loading}>Siparişi Kaydet</FormButton>
        </div>
      </div>
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
      await patchJson(`/api/orders/${order.id}`, {
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
        status: form.get("status"),
        description: form.get("description"),
        dyehouseProcessTypeIds: Array.from(formElement.querySelectorAll('input[name="dyehouseProcessTypeIds"]:checked')).map((el: any) => el.value),
      });
      refreshInBackground(refresh);
      onDone();
      toast.success("Sipariş güncellendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sipariş güncellenemedi.");
    } finally {
      setLoading(false);
    }
  }

  const isWide = data.uiSettings.modalPosition === "center";

  return (
    <form className={cn("grid gap-8", isWide ? "lg:grid-cols-2 xl:grid-cols-4" : "grid-cols-1")} onSubmit={submit}>
      <div className="space-y-6 min-w-0 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
          <div className="grid size-8 place-items-center rounded-none bg-blue-50 text-blue-600">
            <Users className="size-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Müşteri & Tarih</h3>
        </div>
        <div className="grid gap-4">
          <Field label="Müşteri"><select className={inputClass} name="customerName" defaultValue={order.customerName} required><option value="">Cari seçiniz</option>{customers.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></Field>
          <Field label="Sipariş tarihi"><input className={inputClass} name="orderDate" type="date" defaultValue={order.orderDate} required /></Field>
          <Field label="Termin"><input className={inputClass} name="dueDate" type="date" defaultValue={order.dueDate} required /></Field>
          <Field label="Sipariş kg"><input className={inputClass} name="quantityKg" type="number" defaultValue={order.quantityKg} required /></Field>
        </div>
      </div>

      <div className="space-y-6 min-w-0 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
          <div className="grid size-8 place-items-center rounded-none bg-purple-50 text-purple-600">
            <Layout className="size-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Kumaş & Renk</h3>
        </div>
        <div className="grid gap-4">
          <Field label="Kumaş cinsi"><select className={inputClass} name="fabricTypeId" defaultValue={order.fabricTypeId} required>{data.fabricTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Renk"><select className={inputClass} name="colorId" defaultValue={order.colorId} required>{data.colors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Ne (İplik No)"><select className={inputClass} name="yarnCountId" defaultValue={order.yarnCountId} required>{data.yarnCounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Durum"><select className={inputClass} name="status" defaultValue={order.status}><option>Taslak</option><option>Onaylandı</option><option>İplik Bekliyor</option><option>Örmede</option><option>Ham Geldi</option><option>Boyahanede</option><option>Mamül Hazır</option><option>Sevk Edildi</option><option>Kapandı</option><option>İptal</option></select></Field>
        </div>
      </div>

      <div className="space-y-6 min-w-0 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
          <div className="grid size-8 place-items-center rounded-none bg-amber-50 text-amber-600">
            <Factory className="size-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Teknik Değerler</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ham En"><input className={inputClass} name="rawWidth" type="number" defaultValue={order.rawWidth} required /></Field>
          <Field label="Ham Grm"><input className={inputClass} name="rawGsm" type="number" defaultValue={order.rawGsm} required /></Field>
          <Field label="Finish En"><input className={inputClass} name="finishWidth" type="number" defaultValue={order.finishWidth} required /></Field>
          <Field label="Finish Grm"><input className={inputClass} name="finishGsm" type="number" defaultValue={order.finishGsm} required /></Field>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
          <div className="grid size-8 place-items-center rounded-none bg-indigo-50 text-indigo-600">
            <SlidersHorizontal className="size-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Boyahane İşlemleri</h3>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 border border-slate-100 rounded-none max-h-[160px] overflow-y-auto">
          {data.processTypes.map(pt => (
            <label key={pt.id} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-white transition-colors">
              <input name="dyehouseProcessTypeIds" type="checkbox" value={pt.id} defaultChecked={order.dyehouseProcessTypeIds?.includes(pt.id)} className="size-4 rounded border-slate-300" />
              <span className="text-[11px] font-semibold text-slate-700">{pt.name}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-4 p-3 bg-slate-50 rounded-none border border-slate-100 text-[11px] font-bold">
          <label className="flex items-center gap-2 cursor-pointer"><input name="hasPolyester" type="checkbox" defaultChecked={order.hasPolyester} className="size-4 rounded border-slate-300" /> POLY</label>
          <label className="flex items-center gap-2 cursor-pointer"><input name="hasLycra" type="checkbox" defaultChecked={order.hasLycra} className="size-4 rounded border-slate-300" /> LYC</label>
        </div>
        <Field label="Açıklama"><textarea className={cn(inputClass, "h-24 resize-none")} name="description" defaultValue={order.description} placeholder="Notlar..." /></Field>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="flex-1 rounded-none bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100 hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Güncelleniyor...' : 'Güncelle'}
          </button>
          <button type="button" onClick={onDone} className="flex-1 rounded-none bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200">
            İptal
          </button>
        </div>
      </div>
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
        <Field label="Lot no (Girmek zorunludur)"><input className={inputClass} name="lotNo" required /></Field>
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
      <div className="rounded-none bg-blue-50 p-4 text-sm text-blue-800">
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
        <Field label="Lot no (Girmek zorunludur)"><input className={inputClass} name="lotNo" required /></Field>
      </div>
      <Field label="Açıklama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>Hammadde alışını kaydet</FormButton>
    </form>
  );
}

export function TransferForm({ initialData }: { initialData?: Transfer }) {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>(initialData?.items ? normalizeItems(initialData.items) : []);
  const [formState, setFormState] = useState({ fromWarehouseId: initialData?.fromWarehouseId || '' });
  const [tempItem, setTempItem] = useState({ stockId: '', lotNo: '', partyId: '', quantity: '' });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (items.length === 0) { toast.error('En az bir ürün ekleyin'); return; }
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        date: form.get('date'),
        fromWarehouseId: form.get('fromWarehouseId'),
        toWarehouseId: form.get('toWarehouseId'),
        items: items,
        description: form.get('description')
      };
      if (initialData) await patchJson('/api/transfers/' + initialData.id, payload);
      else await postJson('/api/transfers', payload);
      refreshInBackground(refresh);
      toast.success(initialData ? 'Transfer güncellendi' : 'Transfer kaydedildi');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Hata'); }
    finally { setLoading(false); }
  }

  return (
    <form className='grid gap-4' onSubmit={submit}>
      <div className='grid gap-4 sm:grid-cols-2'>
        <Field label='Tarih'><input className={inputClass} name='date' type='date' defaultValue={initialData?.date || new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label='Kaynak Depo'><select className={inputClass} name='fromWarehouseId' value={formState.fromWarehouseId} onChange={e => setFormState({...formState, fromWarehouseId: e.target.value})} required>{data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        <Field label='Hedef Depo'><select className={inputClass} name='toWarehouseId' defaultValue={initialData?.toWarehouseId} required>{data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
      </div>
      <div className='premium-card p-4 rounded-none bg-slate-50 border border-slate-100'>
         <h3 className='text-xs font-bold uppercase text-slate-400 mb-3 tracking-wider'>Transfer Kalemleri</h3>
         <div className='space-y-2'>
            {items.map((it, idx) => (
              <div key={idx} className='flex gap-3 items-center bg-white p-3 rounded-none shadow-sm border border-slate-100'>
                <div className='flex-1'>
                  <div className='text-sm font-bold text-slate-900'>{getName(data.stockCards, it.stockId)}</div>
                  <div className='text-[10px] font-bold text-slate-400 uppercase mt-0.5'>
                    {it.partyId ? `Parti: ${data.parties.find(p => p.id === it.partyId)?.partyNo}` : (it.lotNo ? `Lot: ${it.lotNo}` : 'Genel Stok')}
                  </div>
                </div>
                <div className='text-right'>
                  <div className='font-bold text-blue-600'>{formatKg(it.quantity)}</div>
                  <button type='button' onClick={() => setItems(items.filter((_, i) => i !== idx))} className='text-[10px] font-bold text-rose-500 uppercase mt-1 hover:text-rose-700'>Kaldır</button>
                </div>
              </div>
            ))}
            
            <div className='mt-4 p-4 rounded-none bg-white border border-blue-100 border-dashed'>
              <p className='text-xs font-bold text-blue-900 mb-3'>Yeni Kalem Ekle</p>
              <div className='grid gap-3'>
                <BalanceSelect 
                  warehouseId={formState.fromWarehouseId} 
                  stockId={tempItem.stockId} 
                  lotNo={tempItem.lotNo} 
                  partyId={tempItem.partyId}
                  onChange={(val) => setTempItem({ ...tempItem, ...val })} 
                />
                <div className='flex gap-2'>
                  <input className={inputClass} type='number' placeholder='Miktar kg' value={tempItem.quantity} onChange={e => setTempItem({...tempItem, quantity: e.target.value})} />
                  <button 
                    type='button' 
                    disabled={!tempItem.stockId || !tempItem.quantity}
                    onClick={() => {
                      setItems([...items, { ...tempItem, quantity: Number(tempItem.quantity) }]);
                      setTempItem({ stockId: '', lotNo: '', partyId: '', quantity: '' });
                    }} 
                    className='px-6 rounded-none bg-blue-600 text-white font-bold text-sm disabled:opacity-50'
                  >
                    Ekle
                  </button>
                </div>
              </div>
            </div>
         </div>
      </div>
      <Field label='Açıklama'><textarea className={inputClass} name='description' defaultValue={initialData?.description} rows={2} /></Field>
      <FormButton loading={loading}>{initialData ? 'Güncelle' : 'Transferi Başlat'}</FormButton>
    </form>
  );
}

function OrderSelectorModal({ value, onChange, open, onOpenChange }: { value: string; onChange: (id: string) => void; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data } = useErpData();
  const [search, setSearch] = useState("");
  const filtered = data.orders.filter((item) => 
    !search || 
    `${item.orderNo} ${item.customerName} ${getName(data.fabricTypes, item.fabricTypeId)} ${getName(data.colors, item.colorId)}`
      .toLocaleLowerCase("tr-TR")
      .includes(search.toLocaleLowerCase("tr-TR"))
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm">
      <div className="flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-none bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-none bg-blue-50 text-blue-600">
              <ShoppingCart className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-950">Müşteri Siparişi Seç</h2>
              <p className="text-xs text-slate-500">Üretim yapılacak aktif siparişi listeden seçin.</p>
            </div>
          </div>
          <button className="grid size-10 place-items-center rounded-none bg-slate-50 text-slate-500 hover:bg-slate-100" onClick={() => onOpenChange(false)} type="button">
            <X className="size-5" />
          </button>
        </div>
        <div className="border-b border-slate-100 p-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <input 
              autoFocus 
              className="w-full rounded-none border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" 
              placeholder="Sipariş no, cari adı, kumaş veya renk ile ara..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-bold uppercase tracking-wider text-slate-400">
                <th className="pb-3 pl-2">Sipariş No</th>
                <th className="pb-3">Cari</th>
                <th className="pb-3">Kumaş</th>
                <th className="pb-3">Renk</th>
                <th className="pb-3 text-right">Miktar (Kg)</th>
                <th className="pb-3 text-right pr-2">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((item) => (
                <tr key={item.id} className="group hover:bg-blue-50/50">
                  <td className="py-4 pl-2 font-bold text-blue-600">{item.orderNo}</td>
                  <td className="py-4 font-semibold text-slate-900">{item.customerName}</td>
                  <td className="py-4 text-slate-600">{getName(data.fabricTypes, item.fabricTypeId)}</td>
                  <td className="py-4 text-slate-600">{getName(data.colors, item.colorId)}</td>
                  <td className="py-4 text-right font-mono font-bold text-slate-900">{formatKg(item.quantityKg)}</td>
                  <td className="py-4 text-right pr-2">
                    <button 
                      onClick={() => { onChange(item.id); onOpenChange(false); }}
                      className="rounded-none bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 active:transform active:scale-95"
                    >
                      Seç
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="py-20 text-center text-slate-400">Aradığınız kriterlere uygun aktif sipariş bulunamadı.</div>}
        </div>
      </div>
    </div>
  );
}

function OrderSelect({ value, onChange, required }: { value: string; onChange: (id: string) => void; required?: boolean }) {
  const { data } = useErpData();
  const [open, setOpen] = useState(false);
  const selected = data.orders.find((item) => item.id === value);

  return (
    <>
      <button 
        className={cn(inputClass, "flex items-center justify-between text-left h-auto py-3")} 
        type="button" 
        onClick={() => setOpen(true)}
      >
        {selected ? (
          <div>
            <div className="text-sm font-bold text-slate-950">{selected.orderNo} - {selected.customerName}</div>
            <div className="text-[10px] uppercase font-bold text-slate-500 mt-0.5">
              {getName(data.fabricTypes, selected.fabricTypeId)} · {getName(data.colors, selected.colorId)}
            </div>
          </div>
        ) : (
          <span className="text-slate-400 italic">Sipariş seçmek için tıklayın...</span>
        )}
      </button>
      {required && !value && <input type="hidden" required />}
      {value && <input type="hidden" name="orderId" value={value} />}
      {open && <OrderSelectorModal value={value} onChange={onChange} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function BalanceSelect({ 
  warehouseId, 
  stockId, 
  lotNo, 
  partyId,
  onChange, 
  required 
}: { 
  warehouseId: string; 
  stockId: string; 
  lotNo: string; 
  partyId?: string;
  onChange: (info: { stockId: string; lotNo: string; partyId: string }) => void; 
  required?: boolean 
}) {
  const { data } = useErpData();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  
  const balances = useMemo(() => {
    if (!warehouseId) return [];
    return data.warehouseBalances
      .filter((b) => b.warehouseId === warehouseId && b.quantity > 0)
      .map((b) => ({ 
        ...b, 
        stock: data.stockCards.find(s => s.id === b.stockId),
        party: b.partyId ? data.parties.find(p => p.id === b.partyId) : null
      }));
  }, [data, warehouseId]);

  const filtered = balances.filter((item) => {
    if (categoryFilter !== "ALL" && item.stock?.type !== categoryFilter) return false;
    const s = search.toLocaleLowerCase("tr-TR");
    if (!s) return true;
    return (
      item.stock?.code.toLocaleLowerCase("tr-TR").includes(s) ||
      item.stock?.name.toLocaleLowerCase("tr-TR").includes(s) ||
      (item.lotNo || "").toLocaleLowerCase("tr-TR").includes(s) ||
      (item.party?.partyNo || "").toLocaleLowerCase("tr-TR").includes(s)
    );
  });

  const selectedStock = data.stockCards.find((item) => item.id === stockId);
  const selectedParty = partyId ? data.parties.find(p => p.id === partyId) : null;
  
  const selectedLabel = selectedStock 
    ? `${selectedStock.code} - ${selectedStock.name}${lotNo ? ` (Lot: ${lotNo})` : ""}${selectedParty ? ` (Parti: ${selectedParty.partyNo})` : ""}` 
    : "Seçiniz";

  return (
    <>
      <button className={cn(inputClass, "flex items-center justify-between disabled:opacity-50 min-w-0")} type="button" onClick={() => setOpen(true)} disabled={!warehouseId}>
        <span className={cn("truncate", stockId ? "text-slate-950 text-xs sm:text-sm" : "text-slate-500")}>
          {stockId ? selectedLabel : (warehouseId ? "Stok ve Lot/Parti seçiniz" : "Önce depo seçiniz")}
        </span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm">
          <div className="flex h-full max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-none bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <h2 className="text-lg font-semibold text-slate-950">Depodaki Bakiye Listesi</h2>
              <button className="grid size-9 place-items-center rounded-none bg-slate-50 text-slate-500" onClick={() => setOpen(false)} type="button">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex flex-col border-b border-slate-100 p-4 gap-4">
              <div className="flex flex-wrap gap-2">
                {["ALL", "IP", "LYC", "POLY", "YM", "MM"].map(type => {
                  const count = type === "ALL" ? balances.length : balances.filter(b => b.stock?.type === type).length;
                  if (count === 0 && type !== "ALL") return null;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setCategoryFilter(type)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${categoryFilter === type ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    >
                      {type} {count > 0 && `(${count})`}
                    </button>
                  );
                })}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input autoFocus className="w-full rounded-none border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" placeholder="Kod, isim, lot veya parti no ile ara..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-500">Bu depoda uygun bakiye bulunamadı.</div>
              ) : (
                <div className="grid gap-1">
                  {filtered.map((item, i) => (
                    <button key={i} className="flex items-center justify-between rounded-none p-3 text-left hover:bg-slate-50 border border-transparent hover:border-slate-200" onClick={() => { 
                      onChange({ stockId: item.stockId, lotNo: item.lotNo || "", partyId: item.partyId || "" }); 
                      setOpen(false); 
                    }} type="button">
                      <div className="flex flex-col gap-0.5">
                        <div className="font-bold text-slate-900">{item.stock?.code} - {item.stock?.name}</div>
                        <div className="flex gap-3 text-xs font-medium text-slate-500">
                           {item.lotNo && <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700">Lot: {item.lotNo}</span>}
                           {item.party?.partyNo && <span className="px-1.5 py-0.5 bg-blue-50 rounded text-blue-700">Parti: {item.party.partyNo}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-emerald-600">{formatKg(item.quantity)}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Mevcut</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function RawProductionForm({ initialData }: { initialData?: RawProduction }) {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState(initialData?.orderId || '');
  const [partyNo, setPartyNo] = useState(initialData?.partyId ? data.parties.find(p => p.id === initialData.partyId)?.partyNo || '' : '');
  const [consumedItems, setConsumedItems] = useState<{ stockId: string, warehouseId: string, quantityKg: number, lotNo?: string }[]>(initialData?.consumedItems || []);
  const [tempConsumed, setTempConsumed] = useState({ stockId: '', warehouseId: '', lotNo: '', partyId: '', quantityKg: '' });
  const [producedRawKg, setProducedRawKg] = useState(initialData?.producedRawKg?.toString() || '');
  const [rawWidth, setRawWidth] = useState(initialData?.rawWidth?.toString() || '');
  const [rawGsm, setRawGsm] = useState(initialData?.rawGsm?.toString() || '');
  
  const selectedOrder = data.orders.find(o => o.id === orderId);

  // Sync width/gsm with order defaults if not set
  useEffect(() => {
    if (selectedOrder && !rawWidth) setRawWidth(selectedOrder.rawWidth.toString());
    if (selectedOrder && !rawGsm) setRawGsm(selectedOrder.rawGsm.toString());
  }, [selectedOrder]);
  
  // Auto-calculate consumption (+5%)
  useEffect(() => {
    if (tempConsumed.stockId && producedRawKg && !tempConsumed.quantityKg) {
      const autoQty = Number(producedRawKg) * 1.05;
      setTempConsumed(prev => ({ ...prev, quantityKg: autoQty.toFixed(2) }));
    }
  }, [tempConsumed.stockId, producedRawKg]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        date: form.get('date'),
        orderId: orderId,
        partyNo: partyNo,
        knitterPartnerId: form.get('knitterPartnerId'),
        warehouseId: form.get('warehouseId'),
        producedRawKg: Number(producedRawKg),
        rawWidth: Number(rawWidth),
        rawGsm: Number(rawGsm),
        consumedItems: consumedItems,
        description: form.get('description'),
      };
      if (initialData) await patchJson('/api/production/raw/' + initialData.id, payload);
      else await postJson('/api/production/raw', payload);
      refreshInBackground(refresh);
      toast.success(initialData ? 'Üretim güncellendi.' : 'Ham üretim kaydedildi.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Hata oluştu');
    } finally { setLoading(false); }
  }

  const isWide = data.uiSettings.modalPosition === "center";

  return (
    <form className={cn("grid gap-8 w-full", isWide ? "lg:grid-cols-2 xl:grid-cols-4" : "grid-cols-1")} onSubmit={submit}>
      {/* 1. Kolon: Temel Üretim Bilgileri */}
      <div className='space-y-6 min-w-0 overflow-hidden'>
        <div className='flex items-center gap-3 border-b border-slate-50 pb-3'>
          <div className='grid size-8 place-items-center rounded-none bg-blue-50 text-blue-600'>
            <Factory className='size-4' />
          </div>
          <h3 className='text-sm font-bold text-slate-900'>Üretim Kaydı</h3>
        </div>
        
        <div className='grid gap-4'>
          <Field label='Tarih'><input className={inputClass} name='date' type='date' defaultValue={initialData?.date || new Date().toISOString().slice(0, 10)} required /></Field>
          <Field label='Sipariş'><OrderSelect value={orderId} onChange={setOrderId} required /></Field>
          <Field label='Parti No (Manuel)'><input className={inputClass} value={partyNo} onChange={e => setPartyNo(e.target.value)} placeholder="Parti No yazınız..." required /></Field>
          <Field label='Fasoncu (Örmeci)'><select className={inputClass} name='knitterPartnerId' defaultValue={initialData?.knitterPartnerId} required>{data.partners.filter(p => p.type === 'KNITTER').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label='Ham Giriş Deposu'><select className={inputClass} name='warehouseId' defaultValue={initialData?.warehouseId} required>{data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label='Ham En'><input className={inputClass} type='number' value={rawWidth} onChange={e => setRawWidth(e.target.value)} required /></Field>
            <Field label='Ham Gr.'><input className={inputClass} type='number' value={rawGsm} onChange={e => setRawGsm(e.target.value)} required /></Field>
          </div>
          <Field label='Üretilen Ham (Kg)'><input className={inputClass} type='number' value={producedRawKg} onChange={e => setProducedRawKg(e.target.value)} required /></Field>
        </div>
      </div>

      {/* 2. Kolon: Tüketilen Kalemler Listesi */}
      <div className='space-y-6 min-w-0 overflow-hidden'>
        <div className='flex items-center gap-3 border-b border-slate-50 pb-3'>
          <div className='grid size-8 place-items-center rounded-none bg-emerald-50 text-emerald-600'>
            <Boxes className='size-4' />
          </div>
          <h3 className='text-sm font-bold text-slate-900'>Mevcut Tüketimler</h3>
        </div>

        <div className='premium-card p-4 rounded-none bg-slate-50 border border-slate-100 h-full max-h-[500px] overflow-y-auto custom-scrollbar space-y-3'>
          {consumedItems.length === 0 ? (
            <div className='flex flex-col items-center justify-center h-40 text-slate-400'>
              <Boxes className='size-8 opacity-20 mb-2' />
              <p className='text-xs font-medium'>Tüketim eklenmedi</p>
            </div>
          ) : (
            consumedItems.map((item, idx) => (
              <div key={idx} className='flex gap-3 items-center bg-white p-3 shadow-sm border border-slate-100'>
                <div className='flex-1'>
                  <div className='text-xs font-bold text-slate-900'>{getName(data.stockCards, item.stockId)}</div>
                  <div className='text-[9px] font-bold text-slate-400 uppercase mt-0.5'>
                    {getName(data.warehouses, item.warehouseId)} {item.lotNo ? `· ${item.lotNo}` : ''}
                  </div>
                </div>
                <div className='text-right'>
                  <div className='text-xs font-bold text-blue-600'>{formatKg(item.quantityKg)}</div>
                  <button type='button' onClick={() => setConsumedItems(consumedItems.filter((_, i) => i !== idx))} className='text-[9px] font-bold text-rose-500 uppercase mt-1 hover:underline'>Sil</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. Kolon: Tüketim Ekle */}
      <div className='space-y-6 min-w-0 overflow-hidden'>
        <div className='flex items-center gap-3 border-b border-slate-50 pb-3'>
          <div className='grid size-8 place-items-center rounded-none bg-amber-50 text-amber-600'>
            <Plus className='size-4' />
          </div>
          <h3 className='text-sm font-bold text-slate-900'>Yeni Tüketim</h3>
        </div>

        <div className='p-5 bg-white border border-blue-100 shadow-sm space-y-4 overflow-hidden'>
          <div className='grid gap-3'>
            <Field label='Kaynak Depo'>
              <select className={inputClass} value={tempConsumed.warehouseId} onChange={e => setTempConsumed({...tempConsumed, warehouseId: e.target.value})}>
                <option value=''>Depo Seçiniz</option>
                {data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            <BalanceSelect 
              warehouseId={tempConsumed.warehouseId} 
              stockId={tempConsumed.stockId} 
              lotNo={tempConsumed.lotNo} 
              partyId={tempConsumed.partyId}
              onChange={(val) => setTempConsumed({ ...tempConsumed, ...val })} 
            />
            <div className='flex gap-2 pt-2'>
              <input className={cn(inputClass, "min-w-0 flex-1")} type='number' placeholder='Miktar kg' value={tempConsumed.quantityKg} onChange={e => setTempConsumed({...tempConsumed, quantityKg: e.target.value})} />
              <button 
                type='button' 
                disabled={!tempConsumed.stockId || !tempConsumed.quantityKg || !tempConsumed.warehouseId}
                onClick={() => {
                  const qty = Number(tempConsumed.quantityKg);
                  const balance = data.warehouseBalances.find(b => 
                    b.warehouseId === tempConsumed.warehouseId && 
                    b.stockId === tempConsumed.stockId && 
                    (tempConsumed.lotNo ? b.lotNo === tempConsumed.lotNo : true) &&
                    (tempConsumed.partyId ? b.partyId === tempConsumed.partyId : true)
                  );
                  const currentInForm = consumedItems
                    .filter(it => it.stockId === tempConsumed.stockId && it.warehouseId === tempConsumed.warehouseId && it.lotNo === tempConsumed.lotNo)
                    .reduce((sum, it) => sum + it.quantityKg, 0);
                  
                  const available = (balance?.quantity || 0) - currentInForm;

                  if (qty > available) {
                    toast.error(`Yetersiz stok. Mevcut bakiye: ${available} kg`);
                    return;
                  }

                  setConsumedItems([...consumedItems, { ...tempConsumed, quantityKg: qty }]);
                  setTempConsumed({ stockId: '', warehouseId: tempConsumed.warehouseId, lotNo: '', partyId: '', quantityKg: '' });
                }} 
                className='px-6 bg-slate-900 text-white font-bold text-xs disabled:opacity-50 hover:bg-black transition-colors shrink-0'
              >
                Ekle
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Kolon: Notlar & Kayıt */}
      <div className='space-y-6 min-w-0 overflow-hidden'>
        <div className='flex items-center gap-3 border-b border-slate-50 pb-3'>
          <div className='grid size-8 place-items-center rounded-none bg-slate-50 text-slate-600'>
            <Layout className='size-4' />
          </div>
          <h3 className='text-sm font-bold text-slate-900'>Açıklama & Onay</h3>
        </div>
        <Field label='Üretim Notları'>
          <textarea className={cn(inputClass, 'h-40 resize-none')} name='description' defaultValue={initialData?.description} placeholder='Notlar...' />
        </Field>
        <div className='pt-4'>
          <FormButton loading={loading}>{initialData ? 'Güncelle' : 'Üretimi Kaydet'}</FormButton>
        </div>
      </div>
    </form>
  );
}

export function DyehouseProductionForm({ initialData }: { initialData?: DyehouseProduction }) {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const [partyId, setPartyId] = useState(initialData?.partyId || '');
  const [inputWarehouseId, setInputWarehouseId] = useState(initialData?.inputWarehouseId || '');
  const [inputRawKg, setInputRawKg] = useState(initialData?.inputRawKg?.toString() || '');
  const [selectedProcessIds, setSelectedProcessIds] = useState<string[]>(initialData?.processTypeIds || []);
  
  const selectedParty = data.parties.find(p => p.id === partyId);
  const selectedOrder = data.orders.find(o => o.id === selectedParty?.orderId);

  useEffect(() => {
    if (!initialData && selectedOrder?.dyehouseProcessTypeIds) {
      setSelectedProcessIds(selectedOrder.dyehouseProcessTypeIds);
    }
  }, [selectedOrder, initialData]);
  
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        date: form.get('date'),
        partyId: partyId,
        dyehousePartnerId: form.get('dyehousePartnerId'),
        inputWarehouseId: inputWarehouseId,
        outputWarehouseId: form.get('outputWarehouseId'),
        inputRawKg: Number(inputRawKg),
        finishedKg: Number(form.get('finishedKg')),
        finishWidth: Number(form.get('finishWidth')),
        finishGsm: Number(form.get('finishGsm')),
        description: form.get('description'),
        orderId: selectedParty?.orderId,
        processTypeIds: selectedProcessIds
      };
      if (initialData) await patchJson('/api/production/dyehouse/' + initialData.id, payload);
      else await postJson('/api/production/dyehouse', payload);
      refreshInBackground(refresh);
      toast.success(initialData ? 'Güncellendi' : 'Kaydedildi');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Hata'); }
    finally { setLoading(false); }
  }

  const isWide = data.uiSettings.modalPosition === "center";

  return (
    <form className={cn("grid gap-8", isWide ? "lg:grid-cols-2 xl:grid-cols-3" : "grid-cols-1")} onSubmit={submit}>
      {/* 1. Kolon: Operasyon Temelleri */}
      <div className='space-y-6 min-w-0'>
        <div className='flex items-center gap-3 border-b border-slate-50 pb-3'>
          <div className='grid size-8 place-items-center rounded-none bg-indigo-50 text-indigo-600'>
            <Factory className='size-4' />
          </div>
          <h3 className='text-sm font-bold text-slate-900'>Operasyon Bilgileri</h3>
        </div>
        <div className='grid gap-4'>
          <Field label='Tarih'><input className={inputClass} name='date' type='date' defaultValue={initialData?.date || new Date().toISOString().slice(0, 10)} required /></Field>
          <Field label='Parti'><select className={inputClass} value={partyId} onChange={e => setPartyId(e.target.value)} required><option value=''>Seçiniz</option>{data.parties.map(p => <option key={p.id} value={p.id}>{p.partyNo}</option>)}</select></Field>
          <Field label='Boyahane'><select className={inputClass} name='dyehousePartnerId' defaultValue={initialData?.dyehousePartnerId} required>{data.partners.filter(p => p.type === 'DYEHOUSE').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        </div>
      </div>

      {/* 2. Kolon: Depo ve Giriş Miktarı */}
      <div className='space-y-6 min-w-0'>
        <div className='flex items-center gap-3 border-b border-slate-50 pb-3'>
          <div className='grid size-8 place-items-center rounded-none bg-amber-50 text-amber-600'>
            <Boxes className='size-4' />
          </div>
          <h3 className='text-sm font-bold text-slate-900'>Depo & Giriş</h3>
        </div>
        <div className='grid gap-4'>
          <Field label='Ham Çıkış Deposu'><select className={inputClass} value={inputWarehouseId} onChange={e => setInputWarehouseId(e.target.value)} required><option value=''>Seçiniz</option>{data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
          <Field label='Mamül Giriş Deposu'><select className={inputClass} name='outputWarehouseId' defaultValue={initialData?.outputWarehouseId} required>{data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
          <Field label='Giden Ham (Kg)'><input className={inputClass} type='number' value={inputRawKg} onChange={e => setInputRawKg(e.target.value)} required /></Field>
        </div>
      </div>

      {/* 3. Kolon: Teknik Sonuçlar ve Kayıt */}
      <div className='space-y-6 min-w-0'>
        <div className='flex items-center gap-3 border-b border-slate-50 pb-3'>
          <div className='grid size-8 place-items-center rounded-none bg-emerald-50 text-emerald-600'>
            <PackageCheck className='size-4' />
          </div>
          <h3 className='text-sm font-bold text-slate-900'>Sonuç & Onay</h3>
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field label='Dönen Mamül (Kg)'><input className={inputClass} name='finishedKg' type='number' defaultValue={initialData?.finishedKg} required /></Field>
          <Field label='Finish En'><input className={inputClass} name='finishWidth' type='number' defaultValue={initialData?.finishWidth} required /></Field>
          <Field label='Finish Gramaj'><input className={inputClass} name='finishGsm' type='number' defaultValue={initialData?.finishGsm} required /></Field>
        </div>
        <div className='space-y-3'>
          <h4 className='text-xs font-bold text-slate-400 uppercase tracking-widest'>Uygulanan İşlemler</h4>
          <div className='grid grid-cols-2 gap-2 p-3 bg-slate-50 border border-slate-100 rounded-none max-h-[120px] overflow-y-auto'>
            {data.processTypes.map(pt => (
              <label key={pt.id} className='flex items-center gap-2 cursor-pointer p-1 hover:bg-white transition-colors'>
                <input 
                  type='checkbox' 
                  checked={selectedProcessIds.includes(pt.id)}
                  onChange={e => {
                    if (e.target.checked) setSelectedProcessIds([...selectedProcessIds, pt.id]);
                    else setSelectedProcessIds(selectedProcessIds.filter(id => id !== pt.id));
                  }} 
                  className='size-4 rounded border-slate-300' 
                />
                <span className='text-[11px] font-semibold text-slate-700'>{pt.name}</span>
              </label>
            ))}
          </div>
        </div>
        <Field label='Açıklama'><textarea className={cn(inputClass, "h-24 resize-none")} name='description' defaultValue={initialData?.description} placeholder='Boyahane notları...' /></Field>
        <div className='pt-2'>
          <FormButton loading={loading}>{initialData ? 'Güncelle' : 'Kaydet'}</FormButton>
        </div>
      </div>
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

  const isWide = data.uiSettings.modalPosition === "center";

  return (
    <form className={cn("grid gap-8", isWide ? "lg:grid-cols-2 xl:grid-cols-3" : "grid-cols-1")} onSubmit={submit}>
      {/* 1. Sütun: Sevkiyat Temelleri */}
      <div className="space-y-6 min-w-0">
        <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
          <div className="grid size-8 place-items-center rounded-none bg-blue-50 text-blue-600">
            <Truck className="size-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Sevkiyat Bilgileri</h3>
        </div>
        <div className="grid gap-4">
          <Field label="Tarih"><input className={inputClass} name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
          <Field label="Müşteri"><select className={inputClass} name="customerName" value={customerName} onChange={(event) => setCustomerName(event.target.value)} required><option value="">Cari seçiniz</option>{customers.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></Field>
          <Field label="Açıklama"><textarea className={cn(inputClass, "h-32 resize-none")} name="description" placeholder="Sevkiyat notları..." /></Field>
        </div>
      </div>

      {/* 2. Sütun: Stok & Parti Seçimi */}
      <div className="space-y-6 min-w-0">
        <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
          <div className="grid size-8 place-items-center rounded-none bg-purple-50 text-purple-600">
            <Boxes className="size-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Ürün & Depo</h3>
        </div>
        <QuickLookupBox
          label="Hızlı Getir (Sipariş/Parti/Lot)"
          placeholder="Sipariş no, parti no veya lot..."
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
        <div className="grid gap-4">
          <Field label="Mamül stok"><select className={inputClass} name="stockId" value={stockId} onChange={(event) => setStockId(event.target.value)} required><option value="">Seçiniz</option>{finishedStocks.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
          <Field label="Parti"><select className={inputClass} name="partyId" value={partyId} onChange={(event) => {
            const party = data.parties.find((item) => item.id === event.target.value);
            setPartyId(event.target.value);
            setStockId(party?.mmStockId ?? stockId);
            setWarehouseId(party?.currentWarehouseId ?? warehouseId);
            setCustomerName(data.orders.find((item) => item.id === party?.orderId)?.customerName ?? customerName);
          }} required><option value="">Seçiniz</option>{data.parties.map((item) => <option key={item.id} value={item.id}>{item.partyNo}</option>)}</select></Field>
          <Field label="Çıkış deposu"><select className={inputClass} name="warehouseId" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} required><option value="">Seçiniz</option>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        </div>
      </div>

      {/* 3. Sütun: Miktar & Onay */}
      <div className="space-y-6 min-w-0">
        <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
          <div className="grid size-8 place-items-center rounded-none bg-emerald-50 text-emerald-600">
            <PackageCheck className="size-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Miktar & Fiyat</h3>
        </div>
        <div className="grid gap-4">
          <Field label="Sevk kg"><input className={inputClass} name="quantityKg" type="number" value={quantityKg} onChange={(event) => setQuantityKg(event.target.value)} required /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Birim fiyat"><input className={inputClass} name="unitPrice" type="number" step="0.01" /></Field>
            <Field label="Para birimi"><select className={inputClass} name="currency" defaultValue="TRY"><option>TRY</option><option>USD</option><option>EUR</option></select></Field>
          </div>
        </div>

        {selectedParty ? (
          <div className="rounded-none bg-blue-50/50 border border-blue-100 p-3 text-[11px] text-blue-700 leading-relaxed">
            <strong>Parti Eşleşmesi:</strong>
            <p className="mt-1 opacity-80">{selectedParty.partyNo} · {selectedOrder?.customerName ?? "-"} · {getStockLabel(data, selectedParty.mmStockId)}</p>
          </div>
        ) : null}

        {(stockId && warehouseId && partyId) ? <BalanceHint available={saleAvailable} quantity={Number(quantityKg)} label="Bakiye" /> : null}

        <div className="pt-4">
          <FormButton loading={loading}>Sevkiyatı Tamamla</FormButton>
        </div>
      </div>
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
          <label key={permission} className="flex items-center gap-2 rounded-none border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
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
