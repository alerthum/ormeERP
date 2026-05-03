"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useErpData } from "@/components/erp-data-provider";
import { calculateDyehouseWaste, calculateRawWaste } from "@/services/erp-service";
import { formatKg, formatPercent } from "@/lib/utils";
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
  window.setTimeout(() => controller.abort(new DOMException("Sunucu yanÄ±tÄ± gecikti.", "TimeoutError")), ms);
  return controller.signal;
}

function refreshInBackground(refresh: () => Promise<void>) {
  void refresh().catch(() => undefined);
}

type SettingEntity = "fabricTypes" | "colors" | "yarnCounts" | "processTypes" | "warehouses" | "partners";

interface SettingResult {
  id: string;
  name: string;
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
  if (!response.ok || !result.ok) throw new Error(result.error ?? "KayÄ±t tamamlanamadÄ±.");
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
  if (!response.ok || !result.ok) throw new Error(result.error ?? "GÃ¼ncelleme tamamlanamadÄ±.");
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
        name: String(form.get("name") ?? ""),
        kind: form.get("kind"),
        type: form.get("type"),
      });
      formElement.reset();
      mutateData((current) => applySettingResult(current, entity, saved));
      refreshInBackground(refresh);
      onDone?.();
      toast.success("TanÄ±m kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "TanÄ±m kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto]" onSubmit={submit}>
      <Field label="Ad">
        <input className={inputClass} name="name" placeholder="Yeni tanÄ±m adÄ±" required />
      </Field>
      {extra === "warehouse" ? (
        <Field label="Tip">
          <select className={inputClass} name="kind" defaultValue="RAW">
            <option value="YARN">Ä°plik deposu</option>
            <option value="KNITTER">Fasoncu deposu</option>
            <option value="RAW">Ham kumaÅŸ deposu</option>
            <option value="DYEHOUSE">Boyahane deposu</option>
            <option value="FINISHED">MamÃ¼l depo</option>
            <option value="STORE">SatÄ±ÅŸ maÄŸazasÄ±</option>
            <option value="WASTE">Fire deposu</option>
          </select>
        </Field>
      ) : null}
      {extra === "partner" ? (
        <Field label="Tip">
          <select className={inputClass} name="type" defaultValue="SUPPLIER">
            <option value="KNITTER">Fason Ã¶rmeci</option>
            <option value="DYEHOUSE">Boyahane</option>
            <option value="SUPPLIER">SatÄ±cÄ±</option>
            <option value="CUSTOMER">MÃ¼ÅŸteri</option>
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
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await postJson("/api/stocks", Object.fromEntries(form.entries()));
      formElement.reset();
      refreshInBackground(refresh);
      toast.success("Stok kartÄ± kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Stok kartÄ± kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Stok tipi">
          <select className={inputClass} name="type" required>
            <option value="IP">IP</option>
            <option value="LYC">LYC</option>
            <option value="POLY">POLY</option>
            <option value="YM">YM</option>
            <option value="MM">MM</option>
          </select>
        </Field>
        <Field label="Stok adÄ±"><input className={inputClass} name="name" required /></Field>
        <Field label="Ne"><select className={inputClass} name="yarnCountId"><option value="">SeÃ§iniz</option>{data.yarnCounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Renk"><select className={inputClass} name="colorId"><option value="">SeÃ§iniz</option>{data.colors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="KumaÅŸ cinsi"><select className={inputClass} name="fabricTypeId"><option value="">SeÃ§iniz</option>{data.fabricTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Kritik stok kg"><input className={inputClass} name="criticalStockKg" type="number" defaultValue={0} /></Field>
      </div>
      <FormButton loading={loading}>Stok kartÄ±nÄ± kaydet</FormButton>
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
      toast.success("Stok kartÄ± gÃ¼ncellendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Stok kartÄ± gÃ¼ncellenemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Stok tipi"><select className={inputClass} name="type" defaultValue={stock.type} required><option value="IP">IP</option><option value="LYC">LYC</option><option value="POLY">POLY</option><option value="YM">YM</option><option value="MM">MM</option></select></Field>
        <Field label="Stok adÄ±"><input className={inputClass} name="name" defaultValue={stock.name} required /></Field>
        <Field label="Ne"><select className={inputClass} name="yarnCountId" defaultValue={stock.yarnCountId ?? ""}><option value="">SeÃ§iniz</option>{data.yarnCounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Renk"><select className={inputClass} name="colorId" defaultValue={stock.colorId ?? ""}><option value="">SeÃ§iniz</option>{data.colors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="KumaÅŸ cinsi"><select className={inputClass} name="fabricTypeId" defaultValue={stock.fabricTypeId ?? ""}><option value="">SeÃ§iniz</option>{data.fabricTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Kritik stok kg"><input className={inputClass} name="criticalStockKg" type="number" defaultValue={stock.criticalStockKg} /></Field>
        <Field label="Ham en"><input className={inputClass} name="rawWidth" type="number" defaultValue={stock.rawWidth ?? ""} /></Field>
        <Field label="Ham gramaj"><input className={inputClass} name="rawGsm" type="number" defaultValue={stock.rawGsm ?? ""} /></Field>
        <Field label="Finish en"><input className={inputClass} name="finishWidth" type="number" defaultValue={stock.finishWidth ?? ""} /></Field>
        <Field label="Finish gramaj"><input className={inputClass} name="finishGsm" type="number" defaultValue={stock.finishGsm ?? ""} /></Field>
      </div>
      <div className="flex gap-4 text-sm text-slate-600">
        <label className="flex items-center gap-2"><input defaultChecked={stock.hasPolyester} name="hasPolyester" type="checkbox" /> Polyesterli</label>
        <label className="flex items-center gap-2"><input defaultChecked={stock.hasLycra} name="hasLycra" type="checkbox" /> LikralÄ±</label>
      </div>
      <FormButton loading={loading}>Stok kartÄ±nÄ± gÃ¼ncelle</FormButton>
    </form>
  );
}

export function OrderForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
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
      toast.success("SipariÅŸ kaydedildi; YM/MM stok eÅŸleÅŸmesi tamamlandÄ±.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "SipariÅŸ kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="MÃ¼ÅŸteri"><input className={inputClass} name="customerName" required /></Field>
        <Field label="SipariÅŸ tarihi"><input className={inputClass} name="orderDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="Termin"><input className={inputClass} name="dueDate" type="date" required /></Field>
        <Field label="KumaÅŸ cinsi"><select className={inputClass} name="fabricTypeId" required>{data.fabricTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Renk"><select className={inputClass} name="colorId" required>{data.colors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Ne"><select className={inputClass} name="yarnCountId" required>{data.yarnCounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="SipariÅŸ kg"><input className={inputClass} name="quantityKg" type="number" required /></Field>
        <Field label="Ham en"><input className={inputClass} name="rawWidth" type="number" required /></Field>
        <Field label="Ham gramaj"><input className={inputClass} name="rawGsm" type="number" required /></Field>
        <Field label="Finish en"><input className={inputClass} name="finishWidth" type="number" required /></Field>
        <Field label="Finish gramaj"><input className={inputClass} name="finishGsm" type="number" required /></Field>
      </div>
      <div className="flex gap-4 text-sm text-slate-600">
        <label className="flex items-center gap-2"><input name="hasPolyester" type="checkbox" /> Polyesterli</label>
        <label className="flex items-center gap-2"><input name="hasLycra" type="checkbox" /> LikralÄ±</label>
      </div>
      <Field label="AÃ§Ä±klama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <div className="grid gap-3 rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
        <strong>Otomatik stok eÅŸleÅŸtirme</strong>
        <span>AynÄ± Ã¶zelliklerde YM/MM yoksa sistem transaction iÃ§inde yeni stok kartÄ± ve kod aÃ§ar.</span>
      </div>
      <FormButton loading={loading}>SipariÅŸi kaydet</FormButton>
    </form>
  );
}

export function OrderEditForm({ order, onDone }: { order: Order; onDone: () => void }) {
  const { refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await patchJson(`/api/orders/${order.id}`, Object.fromEntries(form.entries()));
      refreshInBackground(refresh);
      onDone();
      toast.success("SipariÅŸ gÃ¼ncellendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "SipariÅŸ gÃ¼ncellenemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="MÃ¼ÅŸteri"><input className={inputClass} name="customerName" defaultValue={order.customerName} required /></Field>
        <Field label="SipariÅŸ tarihi"><input className={inputClass} name="orderDate" type="date" defaultValue={order.orderDate} required /></Field>
        <Field label="Termin"><input className={inputClass} name="dueDate" type="date" defaultValue={order.dueDate} required /></Field>
        <Field label="SipariÅŸ kg"><input className={inputClass} name="quantityKg" type="number" defaultValue={order.quantityKg} required /></Field>
        <Field label="Durum"><select className={inputClass} name="status" defaultValue={order.status}><option>Taslak</option><option>OnaylandÄ±</option><option>Ä°plik Bekliyor</option><option>Ã–rmede</option><option>Ham Geldi</option><option>Boyahanede</option><option>MamÃ¼l HazÄ±r</option><option>Sevk Edildi</option><option>KapandÄ±</option><option>Ä°ptal</option></select></Field>
      </div>
      <Field label="AÃ§Ä±klama"><textarea className={inputClass} name="description" rows={3} defaultValue={order.description} /></Field>
      <FormButton loading={loading}>SipariÅŸi gÃ¼ncelle</FormButton>
    </form>
  );
}

export function PurchaseOrderForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const rawMaterialStocks = data.stockCards.filter((item) => ["IP", "LYC", "POLY"].includes(item.type) && item.isActive !== false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const stock = data.stockCards.find((item) => item.id === form.get("stockId"));
    try {
      if (!stock) throw new Error("Hammadde stok kartÄ± seÃ§ilmelidir.");
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
      toast.success("SatÄ±cÄ± sipariÅŸi kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "SatÄ±cÄ± sipariÅŸi kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="SatÄ±cÄ±"><select className={inputClass} name="supplierId" required>{data.partners.filter((item) => item.type === "SUPPLIER").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Hammadde"><select className={inputClass} name="stockId" required>{rawMaterialStocks.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
        <Field label="SipariÅŸ tarihi"><input className={inputClass} name="orderDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="Termin"><input className={inputClass} name="dueDate" type="date" required /></Field>
        <Field label="Miktar kg"><input className={inputClass} name="orderedKg" type="number" required /></Field>
        <Field label="Birim fiyat"><input className={inputClass} name="unitPrice" type="number" step="0.01" /></Field>
        <Field label="Para birimi"><select className={inputClass} name="currency" defaultValue="TRY"><option>TRY</option><option>USD</option><option>EUR</option></select></Field>
      </div>
      <Field label="AÃ§Ä±klama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>SatÄ±cÄ± sipariÅŸini kaydet</FormButton>
    </form>
  );
}

export function PurchaseOrderEditForm({ order, onDone }: { order: PurchaseOrder; onDone: () => void }) {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const item = order.items[0];
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await patchJson(`/api/purchase-orders/${order.id}`, Object.fromEntries(form.entries()));
      refreshInBackground(refresh);
      onDone();
      toast.success("SatÄ±cÄ± sipariÅŸi gÃ¼ncellendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "SatÄ±cÄ± sipariÅŸi gÃ¼ncellenemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="SatÄ±cÄ±"><select className={inputClass} name="supplierId" defaultValue={order.supplierId} required>{data.partners.filter((partner) => partner.type === "SUPPLIER").map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></Field>
        <Field label="SipariÅŸ tarihi"><input className={inputClass} name="orderDate" type="date" defaultValue={order.orderDate} required /></Field>
        <Field label="Termin"><input className={inputClass} name="dueDate" type="date" defaultValue={order.dueDate} required /></Field>
        <Field label="SipariÅŸ kg"><input className={inputClass} name="orderedKg" type="number" defaultValue={item?.orderedKg ?? order.totalOrderedKg} required /></Field>
        <Field label="Birim fiyat"><input className={inputClass} name="unitPrice" type="number" step="0.01" defaultValue={item?.unitPrice ?? ""} /></Field>
        <Field label="Para birimi"><select className={inputClass} name="currency" defaultValue={item?.currency ?? "TRY"}><option>TRY</option><option>USD</option><option>EUR</option></select></Field>
        <Field label="Durum"><select className={inputClass} name="status" defaultValue={order.status}><option>Taslak</option><option>OnaylandÄ±</option><option>KÄ±smi Geldi</option><option>TamamlandÄ±</option><option>Ä°ptal</option></select></Field>
      </div>
      <Field label="AÃ§Ä±klama"><textarea className={inputClass} name="description" rows={3} defaultValue={order.description} /></Field>
      <FormButton loading={loading}>SatÄ±cÄ± sipariÅŸini gÃ¼ncelle</FormButton>
    </form>
  );
}

export function PurchaseReceiptForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const order = data.purchaseOrders.find((item) => item.id === form.get("purchaseOrderId"));
    const item = order?.items[0];
    try {
      if (!order || !item) throw new Error("SatÄ±cÄ± sipariÅŸi seÃ§ilmelidir.");
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
      <Field label="SatÄ±cÄ± sipariÅŸi"><select className={inputClass} name="purchaseOrderId" required>{data.purchaseOrders.filter((item) => item.status !== "TamamlandÄ±").map((item) => <option key={item.id} value={item.id}>{item.purchaseOrderNo} - {formatKg(item.totalRemainingKg)} kalan</option>)}</select></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mal kabul tarihi"><input className={inputClass} name="receiptDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="Depo"><select className={inputClass} name="warehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Gelen kg"><input className={inputClass} name="receivedKg" type="number" required /></Field>
        <Field label="Lot no"><input className={inputClass} name="lotNo" /></Field>
      </div>
      <Field label="AÃ§Ä±klama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>Mal kabul kaydet</FormButton>
    </form>
  );
}

export function DirectPurchaseForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const rawMaterialStocks = data.stockCards.filter((item) => ["IP", "LYC", "POLY"].includes(item.type) && item.isActive !== false);
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
      toast.success("Hammadde alÄ±ÅŸÄ± kaydedildi ve stok giriÅŸi iÅŸlendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Hammadde alÄ±ÅŸÄ± kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
        Bu ekran mÃ¼ÅŸteri sipariÅŸinden baÄŸÄ±msÄ±z IP, LYC ve POLY alÄ±ÅŸÄ± iÃ§indir. KaydettiÄŸinde sistem tamamlanmÄ±ÅŸ satÄ±cÄ± sipariÅŸi, mal kabul ve stok giriÅŸ hareketini birlikte oluÅŸturur.
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="SatÄ±cÄ±"><select className={inputClass} name="supplierId" required>{data.partners.filter((item) => item.type === "SUPPLIER").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Hammadde"><select className={inputClass} name="stockId" required>{rawMaterialStocks.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
        <Field label="AlÄ±ÅŸ tarihi"><input className={inputClass} name="receiptDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="GiriÅŸ deposu"><select className={inputClass} name="warehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Gelen kg"><input className={inputClass} name="quantityKg" type="number" required /></Field>
        <Field label="Birim fiyat"><input className={inputClass} name="unitPrice" type="number" step="0.01" /></Field>
        <Field label="Para birimi"><select className={inputClass} name="currency" defaultValue="TRY"><option>TRY</option><option>USD</option><option>EUR</option></select></Field>
        <Field label="Lot no"><input className={inputClass} name="lotNo" /></Field>
      </div>
      <Field label="AÃ§Ä±klama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>Hammadde alÄ±ÅŸÄ±nÄ± kaydet</FormButton>
    </form>
  );
}

export function TransferForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
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
        items: [{ stockId: form.get("stockId"), partyId: form.get("partyId") || null, quantity: form.get("quantity") }],
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tarih"><input className={inputClass} name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="Kaynak depo"><select className={inputClass} name="fromWarehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Hedef depo"><select className={inputClass} name="toWarehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Stok kartÄ±"><select className={inputClass} name="stockId" required>{data.stockCards.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
        <Field label="Parti"><select className={inputClass} name="partyId"><option value="">Partisiz</option>{data.parties.map((item) => <option key={item.id} value={item.id}>{item.partyNo}</option>)}</select></Field>
        <Field label="Miktar kg"><input className={inputClass} name="quantity" type="number" required /></Field>
      </div>
      <Field label="AÃ§Ä±klama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>Transfer oluÅŸtur</FormButton>
    </form>
  );
}

export function RawProductionForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const waste = calculateRawWaste(930, 860);
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
        consumedItems: [{ stockId: form.get("consumedStockId"), warehouseId: form.get("consumedWarehouseId"), quantityKg: form.get("consumedKg") }],
        description: form.get("description"),
      });
      formElement.reset();
      refreshInBackground(refresh);
      toast.success("Ham Ã¼retim kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ham Ã¼retim kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tarih"><input className={inputClass} name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="SipariÅŸ"><select className={inputClass} name="orderId" required>{data.orders.map((item) => <option key={item.id} value={item.id}>{item.orderNo} - {item.customerName}</option>)}</select></Field>
        <Field label="Mevcut parti"><select className={inputClass} name="partyId"><option value="">Yeni parti aÃ§</option>{data.parties.map((item) => <option key={item.id} value={item.id}>{item.partyNo}</option>)}</select></Field>
        <Field label="Fason Ã¶rmeci"><select className={inputClass} name="knitterPartnerId" required>{data.partners.filter((item) => item.type === "KNITTER").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Ham giriÅŸ deposu"><select className={inputClass} name="warehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Ãœretilen ham kg"><input className={inputClass} name="producedRawKg" type="number" required /></Field>
        <Field label="TÃ¼ketilen stok"><select className={inputClass} name="consumedStockId" required>{data.stockCards.filter((item) => ["IP", "LYC", "POLY"].includes(item.type)).map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
        <Field label="TÃ¼ketim deposu"><select className={inputClass} name="consumedWarehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="TÃ¼ketilen kg"><input className={inputClass} name="consumedKg" type="number" required /></Field>
      </div>
      <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
        Ã–rnek fire hesabÄ±: <strong>{formatKg(waste.wasteKg)} / {formatPercent(waste.wastePercent)}</strong>. KayÄ±tta gerÃ§ek tÃ¼ketim ve Ã¼retim kg deÄŸerleriyle hesaplanÄ±r.
      </div>
      <Field label="AÃ§Ä±klama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>Ham Ã¼retimi kaydet</FormButton>
    </form>
  );
}

export function DyehouseProductionForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const waste = calculateDyehouseWaste(2900, 2720);
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
      toast.success("Boyahane Ã¼retimi kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Boyahane Ã¼retimi kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tarih"><input className={inputClass} name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="Parti"><select className={inputClass} name="partyId" required>{data.parties.map((item) => <option key={item.id} value={item.id}>{item.partyNo}</option>)}</select></Field>
        <Field label="Boyahane"><select className={inputClass} name="dyehousePartnerId" required>{data.partners.filter((item) => item.type === "DYEHOUSE").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Ham Ã§Ä±kÄ±ÅŸ deposu"><select className={inputClass} name="inputWarehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="MamÃ¼l giriÅŸ deposu"><select className={inputClass} name="outputWarehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Giden ham kg"><input className={inputClass} name="inputRawKg" type="number" required /></Field>
        <Field label="DÃ¶nen mamÃ¼l kg"><input className={inputClass} name="finishedKg" type="number" required /></Field>
        <Field label="Finish en"><input className={inputClass} name="finishWidth" type="number" required /></Field>
        <Field label="Finish gramaj"><input className={inputClass} name="finishGsm" type="number" required /></Field>
      </div>
      <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
        Ã–rnek boyahane fire: <strong>{formatKg(waste.wasteKg)} / {formatPercent(waste.wastePercent)}</strong>. KayÄ±tta gerÃ§ek ham/mamÃ¼l kg deÄŸerleriyle hesaplanÄ±r.
      </div>
      <Field label="AÃ§Ä±klama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>Boyahane iÅŸlemini kaydet</FormButton>
    </form>
  );
}

export function SaleForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const finishedStocks = data.stockCards.filter((item) => item.type === "MM" && item.isActive !== false);

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
      toast.success("SatÄ±ÅŸ / sevkiyat kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "SatÄ±ÅŸ kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tarih"><input className={inputClass} name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="MÃ¼ÅŸteri"><input className={inputClass} name="customerName" required /></Field>
        <Field label="MamÃ¼l stok"><select className={inputClass} name="stockId" required>{finishedStocks.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
        <Field label="Parti"><select className={inputClass} name="partyId" required>{data.parties.map((item) => <option key={item.id} value={item.id}>{item.partyNo}</option>)}</select></Field>
        <Field label="Ã‡Ä±kÄ±ÅŸ deposu"><select className={inputClass} name="warehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Sevk kg"><input className={inputClass} name="quantityKg" type="number" required /></Field>
        <Field label="Birim fiyat"><input className={inputClass} name="unitPrice" type="number" step="0.01" /></Field>
        <Field label="Para birimi"><select className={inputClass} name="currency" defaultValue="TRY"><option>TRY</option><option>USD</option><option>EUR</option></select></Field>
      </div>
      <Field label="AÃ§Ä±klama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>Sevkiyat kaydet</FormButton>
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
      <Field label="Rol adÄ±"><input className={inputClass} name="name" required /></Field>
      <Field label="AÃ§Ä±klama"><textarea className={inputClass} name="description" rows={2} /></Field>
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
      toast.success("KullanÄ±cÄ± profili kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "KullanÄ±cÄ± kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <Field label="Ad soyad"><input className={inputClass} name="fullName" required /></Field>
      <Field label="E-posta"><input className={inputClass} name="email" type="email" required /></Field>
      <Field label="Rol"><select className={inputClass} name="roleId" required>{data.roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <FormButton loading={loading}>KullanÄ±cÄ± kaydet</FormButton>
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
        <Field label="Stok"><select className={inputClass} name="stockId" defaultValue={item?.stockId} disabled={!isDirect} required>{data.stockCards.filter(s => ["IP", "LYC", "POLY"].includes(s.type)).map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
        <Field label="Gelen kg"><input className={inputClass} name="receivedKg" type="number" defaultValue={item?.receivedKg} required /></Field>
        {isDirect && <Field label="Birim Fiyat (₺)"><input className={inputClass} name="unitPrice" type="number" step="0.01" defaultValue={item?.unitPrice} required /></Field>}
        <Field label="Lot no"><input className={inputClass} name="lotNo" defaultValue={item?.lotNo ?? ""} /></Field>
      </div>
      <Field label="Açıklama"><textarea className={inputClass} name="description" rows={3} defaultValue={receipt.description} /></Field>
      <FormButton loading={loading}>Mal kabul güncelle</FormButton>
    </form>
  );
}
