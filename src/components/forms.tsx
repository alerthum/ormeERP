"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useErpData } from "@/components/erp-data-provider";
import { calculateDyehouseWaste, calculateRawWaste } from "@/services/erp-service";
import { formatKg, formatPercent } from "@/lib/utils";

const inputClass = "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";
const labelClass = "text-xs font-bold uppercase tracking-[0.14em] text-slate-400";

interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function postJson(endpoint: string, payload: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = (await response.json()) as ApiResponse;
  if (!response.ok || !result.ok) throw new Error(result.error ?? "Kayıt tamamlanamadı.");
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

export function SettingForm({ entity, extra }: { entity: "fabricTypes" | "colors" | "yarnCounts" | "processTypes" | "warehouses" | "partners"; extra?: "warehouse" | "partner" }) {
  const { refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      await postJson(`/api/settings/${entity}`, {
        name: String(form.get("name") ?? ""),
        kind: form.get("kind"),
        type: form.get("type"),
      });
      event.currentTarget.reset();
      await refresh();
      toast.success("Tanım kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tanım kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto]" onSubmit={submit}>
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
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      await postJson("/api/stocks", Object.fromEntries(form.entries()));
      event.currentTarget.reset();
      await refresh();
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
        <Field label="Stok tipi">
          <select className={inputClass} name="type" required>
            <option value="IP">IP</option>
            <option value="LYC">LYC</option>
            <option value="POLY">POLY</option>
            <option value="YM">YM</option>
            <option value="MM">MM</option>
          </select>
        </Field>
        <Field label="Stok adı"><input className={inputClass} name="name" required /></Field>
        <Field label="Ne"><select className={inputClass} name="yarnCountId"><option value="">Seçiniz</option>{data.yarnCounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Renk"><select className={inputClass} name="colorId"><option value="">Seçiniz</option>{data.colors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Kumaş cinsi"><select className={inputClass} name="fabricTypeId"><option value="">Seçiniz</option>{data.fabricTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Kritik stok kg"><input className={inputClass} name="criticalStockKg" type="number" defaultValue={0} /></Field>
      </div>
      <FormButton loading={loading}>Stok kartını kaydet</FormButton>
    </form>
  );
}

export function OrderForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
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
      event.currentTarget.reset();
      await refresh();
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
        <Field label="Müşteri"><input className={inputClass} name="customerName" required /></Field>
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

export function PurchaseOrderForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const rawMaterialStocks = data.stockCards.filter((item) => ["IP", "LYC", "POLY"].includes(item.type));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
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
      event.currentTarget.reset();
      await refresh();
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
        <Field label="Hammadde"><select className={inputClass} name="stockId" required>{rawMaterialStocks.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
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

export function PurchaseReceiptForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const order = data.purchaseOrders.find((item) => item.id === form.get("purchaseOrderId"));
    const item = order?.items[0];
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
      event.currentTarget.reset();
      await refresh();
      toast.success("Mal kabul kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mal kabul kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <Field label="Satıcı siparişi"><select className={inputClass} name="purchaseOrderId" required>{data.purchaseOrders.filter((item) => item.status !== "Tamamlandı").map((item) => <option key={item.id} value={item.id}>{item.purchaseOrderNo} - {formatKg(item.totalRemainingKg)} kalan</option>)}</select></Field>
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

export function TransferForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      await postJson("/api/transfers", {
        date: form.get("date"),
        fromWarehouseId: form.get("fromWarehouseId"),
        toWarehouseId: form.get("toWarehouseId"),
        description: form.get("description"),
        items: [{ stockId: form.get("stockId"), partyId: form.get("partyId") || null, quantity: form.get("quantity") }],
      });
      event.currentTarget.reset();
      await refresh();
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
        <Field label="Stok kartı"><select className={inputClass} name="stockId" required>{data.stockCards.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
        <Field label="Parti"><select className={inputClass} name="partyId"><option value="">Partisiz</option>{data.parties.map((item) => <option key={item.id} value={item.id}>{item.partyNo}</option>)}</select></Field>
        <Field label="Miktar kg"><input className={inputClass} name="quantity" type="number" required /></Field>
      </div>
      <Field label="Açıklama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>Transfer oluştur</FormButton>
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
    const form = new FormData(event.currentTarget);
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
      event.currentTarget.reset();
      await refresh();
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
        <Field label="Tüketilen stok"><select className={inputClass} name="consumedStockId" required>{data.stockCards.filter((item) => ["IP", "LYC", "POLY"].includes(item.type)).map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
        <Field label="Tüketim deposu"><select className={inputClass} name="consumedWarehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Tüketilen kg"><input className={inputClass} name="consumedKg" type="number" required /></Field>
      </div>
      <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
        Örnek fire hesabı: <strong>{formatKg(waste.wasteKg)} / {formatPercent(waste.wastePercent)}</strong>. Kayıtta gerçek tüketim ve üretim kg değerleriyle hesaplanır.
      </div>
      <Field label="Açıklama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>Ham üretimi kaydet</FormButton>
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
    const form = new FormData(event.currentTarget);
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
      event.currentTarget.reset();
      await refresh();
      toast.success("Boyahane üretimi kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Boyahane üretimi kaydedilemedi.");
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
        <Field label="Ham çıkış deposu"><select className={inputClass} name="inputWarehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Mamül giriş deposu"><select className={inputClass} name="outputWarehouseId" required>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Giden ham kg"><input className={inputClass} name="inputRawKg" type="number" required /></Field>
        <Field label="Dönen mamül kg"><input className={inputClass} name="finishedKg" type="number" required /></Field>
        <Field label="Finish en"><input className={inputClass} name="finishWidth" type="number" required /></Field>
        <Field label="Finish gramaj"><input className={inputClass} name="finishGsm" type="number" required /></Field>
      </div>
      <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
        Örnek boyahane fire: <strong>{formatKg(waste.wasteKg)} / {formatPercent(waste.wastePercent)}</strong>. Kayıtta gerçek ham/mamül kg değerleriyle hesaplanır.
      </div>
      <Field label="Açıklama"><textarea className={inputClass} name="description" rows={3} /></Field>
      <FormButton loading={loading}>Boyahane işlemini kaydet</FormButton>
    </form>
  );
}
