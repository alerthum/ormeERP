<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version may have breaking changes. Before coding, read relevant docs from `node_modules/next/dist/docs/`.
Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Turkish Character Rule

All files must remain UTF-8.

Never corrupt Turkish characters:

ç Ç ğ Ğ ı İ ö Ö ş Ş ü Ü

Do not convert Turkish labels, messages or seed data to ASCII.

Correct examples:

- Müşteri
- Sipariş
- İplik
- Üretim
- Boyahane
- Depo
- Satış
- Fasoncu
- Tedarikçi
- Kumaş
- Mamül
- Hammadde
- Parti
- Lot

---

# Core ERP Principle

This project is a textile ERP for knitted fabric production.

The system must prioritize:

1. data integrity
2. stock accuracy
3. LotNo / PartiNo traceability
4. transaction safety
5. Turkish user-friendly messages
6. existing premium UI protection

Do not add new features before stabilizing core ERP flows.

---

# No False Guarantee Rule

Never say:

- tamamen çözüldü
- bir daha olmayacak
- kusursuz çalışıyor
- her şey sorunsuz
- sistem tamamen stabil

Instead always report:

- what changed
- files changed
- affected modules
- tested scenarios
- untested scenarios
- remaining risks

Only claim what was actually tested.

---

# No Blind Refactor Rule

Before changing code, analyze:

- existing data model
- current services
- current UI usage
- module dependencies
- database schema
- movement logic

Do not rewrite working modules without reason.

Do not change UI unless explicitly requested.

Do not change unrelated business logic.

---

# Operational Data Rule

Operational data either exists completely or does not exist at all.

Soft delete is forbidden for operational stock transactions.

Do NOT use these concepts for operational stock-impacting records:

- deleted
- cancelled
- void
- passive
- isDeleted
- isCancelled
- status=cancelled
- [İPTAL]

This applies to:

- purchase receipts / alış
- warehouse transfers / depo transferi
- raw production / ham üretim
- dyehouse production / boyahane üretimi
- sales / sevkiyat
- stock movements
- balances
- operational timelines
- operational notifications

Customer orders and supplier orders may have business statuses.
But operational stock movements must not use soft delete.

---

# Single Source of Truth Rule

The primary source of truth for operational stock reality is:

stock_movements

All operational summaries must be derived from stock_movements:

- warehouse balances
- lot balances
- party balances
- order production quantities
- shipped quantities
- dashboard KPIs
- party reports
- stock reports
- supplier received quantities

Cached fields are not authoritative.

If a cache exists, it must be rebuilt from stock_movements after every stock-impacting create/update/delete.

---

# Lot / Parti Rule

Raw materials use LotNo.

Examples:

- IP
- LYC
- POLY
- other raw materials

Fabric uses PartiNo.

Examples:

- YM
- MM

A movement must not have both LotNo and PartiNo.

Raw material movements must not use PartiNo.

Fabric movements must not use LotNo.

Same stockId is not enough for traceability.
Same stock can have different supplier lots, tones, prices, mixtures and quality.

---

# Movement-Based Architecture Rule

This ERP does not have a single fixed transaction chain.

Valid flows may include:

- Purchase → Warehouse
- Purchase → Sale
- Purchase → Transfer
- Purchase → Raw Production
- Raw Production → Transfer
- Transfer → Dyehouse
- Dyehouse → Transfer
- Dyehouse → Sale
- Sale → Return
- Return → Warehouse
- Return → Transfer
- Return → Dyehouse Repair

Dependency validation must not rely on module order.

Dependency validation must rely on stock movement identity and later movement usage.

---

# Stock Movement Relationship Rule

Every stock-affecting operation must create stock_movements.

Each stock movement should contain:

- id
- sourceTransactionId
- sourceTransactionType
- parentMovementId nullable
- sourceMovementId nullable
- stockId
- warehouseId
- direction: IN | OUT
- quantity
- movementDate / date
- lotNo nullable
- partyNo nullable
- partyId nullable
- orderId nullable
- supplierOrderId nullable
- description
- createdAt
- createdBy

UI and API must not create stock movements directly.
All stock-impacting operations must go through domain/service logic.

---

# Later Movement Lock Rule

Before deleting or updating any stock-impacting transaction, the system must check whether the same LotNo or PartiNo has any later stock movement in a different transaction.

If later movement exists:

- delete/update must be blocked

This applies to:

- purchase receipt / alış
- warehouse transfer / depo transferi
- raw production / ham üretim
- dyehouse production / boyahane üretimi
- sale / sevkiyat

Use sourceMovementId / parentMovementId when available.

Fallback validation is mandatory:

- LotNo / PartiNo
- movementDate/date
- createdAt
- id ordering
- different sourceTransactionId

Never allow deletion just because movement links are missing.

Older transactions can only be deleted from newest to oldest.

Example:

Sale → Dyehouse → Raw Production → Transfer → Purchase

---

# Delete Rule

Deleting a stock-impacting transaction is not a new stock consumption.

Do not show generic stock errors during delete.

Wrong:

Yetersiz stok. Mevcut bakiye 0.000 kg, istenen 355.000 kg.

Correct:

Bu alış kaydı silinemez. Çünkü LOT-001 lotu daha sonra 27.05.2026 tarihli Depo Transferi işleminde kullanılmış.

Delete flow:

1. validate later movements
2. block if later movement exists
3. if safe, delete header and related movements/balances/timeline records
4. rebuild summaries from stock_movements
5. commit inside one database transaction
6. rollback if any step fails

Do not mark operational records as cancelled.

---

# Update Rule

Updating a stock-impacting transaction must follow:

1. validate later movements
2. reverse/remove old effects safely
3. create new movements
4. update balances
5. rebuild summaries
6. commit inside one transaction

If the transaction already has later dependent movements, update must be blocked.

---

# Transaction Safety Rule

Every stock-impacting operation must run in one database transaction.

This includes:

- header record
- stock_movements
- warehouse balances
- lot balances
- party balances
- order summaries
- timeline/log
- notifications when relevant

No partial save is acceptable.

If any step fails, the whole operation must rollback.

---

# Zero Orphan Data Rule

The system must never leave:

- transaction header without movements
- movements without transaction header
- balances without movements
- parties without movements
- lots without movements

Do not hide inconsistent data in reports.

Prevent inconsistency at write time.

If inconsistency is detected:

- show admin-level integrity warning
- provide diagnostics/rebuild tools
- report exact issue

---

# Order Status Rule

Order statuses must reflect real movement state.

If movements are deleted, statuses must rollback automatically.

Examples:

- no movement → Taslak / Onaylandı
- purchase movement exists → Hammadde Geldi
- raw production movement exists → Ham Geldi
- dyehouse movement exists → Mamül Hazır
- partial shipment exists → Kısmi Sevk Edildi
- full shipment exists → Sevk Edildi

Do not leave “Ham Geldi” or “Mamül Hazır” after related movements are deleted.

---

# Balance Rule

Balances must be derived from stock_movements.

Required balance levels:

- stock total
- warehouse + stock
- warehouse + stock + LotNo for raw materials
- warehouse + stock + PartiNo for fabrics

If balances are rebuilt, use stock_movements as the only source.

---

# User-Facing Message Rule

All user-facing errors, warnings, validations and notifications must be meaningful Turkish.

Never show:

- Wed / Thu / Fri
- GMT
- UTC
- Coordinated Universal Time
- Universal Time
- raw JavaScript Date
- PostgreSQL params like $1, $4
- stack trace
- raw SQL error

Use date format:

dd.MM.yyyy

Correct example:

27.05.2026 tarihli Depo Transferi

---

# UI Protection Rule

Do not change existing premium UI unless explicitly requested.

Protect:

- white background
- navy/blue accent
- soft shadow
- rounded cards
- sidebar
- mobile bottom navigation
- modal style
- KPI cards
- table style
- typography
- Turkish labels

---

# Read Service Rule

Do not load the whole ERP database for every page.

Page data must be modular.

Preferred functions:

- getDashboardData()
- getOrdersPageData()
- getPurchasePageData()
- getProductionPageData()
- getInventoryPageData()
- getSettingsData()
- getIntegrityData()

Integrity summary must not be attached to every generic read unless the page actually needs it.

---

# Domain Layer Rule

Business rules must not be scattered across UI, pages and generic services.

Stock-impacting operations must be organized into domain services.

Preferred structure:

src/domains/purchase
src/domains/transfer
src/domains/raw-production
src/domains/dyehouse
src/domains/sales
src/domains/inventory
src/domains/integrity

Each domain should own:

- validation
- create
- update
- delete
- movement building
- reverse/delete rules
- summary rebuild hooks

Shared stock movement logic belongs in inventory movement engine.

---

# PostgreSQL Rule

Use explicit PostgreSQL casts when needed:

$1::text
$2::numeric
$3::jsonb
$4::uuid
$5::date

Use explicit casts especially in:

- nullable values
- CASE WHEN
- COALESCE
- numeric calculations
- json/jsonb values

---

# Live Data Safety Rule

Do not test on real business data unless explicitly allowed.

If test data is created:

- mark it clearly
- clean it after testing
- report what was created and deleted

---

# Mandatory Test Chain Rule

After stock-impacting changes, test or clearly mark as untested:

1. Purchase receipt with LotNo
2. Transfer same LotNo
3. Try deleting purchase receipt, must be blocked
4. Raw production consuming LotNo
5. Try deleting purchase receipt, must be blocked
6. YM PartiNo creation
7. Transfer to dyehouse
8. Dyehouse production with same PartiNo
9. Sale / shipment
10. Delete from newest to oldest
11. Verify lot/party/balance/order status cleanup
12. Run integrity diagnostics

If not tested, state clearly:

This chain was not fully tested.

---

# Change Report Rule

After every task, report:

- changed files
- affected modules
- database changes
- tested scenarios
- untested risks
- build result
- rollback plan

Never provide false certainty.

---

# ORME ERP — Mobile UX Constitution v1.0

## 1. Temel Prensip

Mobil uygulama masaüstü ERP'nin küçültülmüş hali olmayacak.
Mobil: daha az bilgi, daha doğru bilgi, daha hızlı aksiyon, daha net öncelik sunacak.

## 2. Desktop Koruma Kuralı

Desktop UI bozulmayacak, sadeleştirilmeyecek, mobil uğruna değiştirilmeyecek.
Mobil optimizasyon sadece responsive breakpointlerde yapılacak.
Tailwind: mobil default, md ve üzeri desktop.

## 3. Mobilde Maksimum Primary Action

Bir mobil ekranda aynı anda sadece 1 primary action olabilir.
Aynı seviyede birden fazla büyük mavi buton kullanılmayacak.
Ana işlem tek olacak, diğer işlemler secondary/action menu altında sunulacak.

## 4. Hero Card Standardı

Her operasyon sayfasının üstünde tek büyük hero alanı olacak.
Bu alan kullanıcıya "şu an ne önemli" sorusunun cevabını verecek.

## 5. KPI Card Standardı

Mobil KPI kartları: 2 kolon, compact, eşit yükseklik, yatay taşma yok.
Başlık text-xs muted, değer text-xl bold, açıklama line-clamp-1.
İkon sağ üstte, kart dışına taşmadan.

## 6. Mobil Tablo Yasağı

Mobilde gerçek tablo gösterilmeyecek.
Desktop tablo hidden md:block kalacak.
Mobilde md:hidden card list kullanılacak.

## 7. Mobil Card List Standardı

Her operasyon kartında: belge no, cari adı, durum badge, stok adı, tarih, kg özetleri olacak.
Uzun metinler line-clamp ile kırpılacak.

## 8. Form UX Standardı

Mobil formlar tek devasa form gibi olmayacak.
Section/card yapısına bölünecek: Cari, Teknik, Miktar, Operasyon, Açıklama.

## 9. Input Standardı

Mobil inputlar: min-height 44px, font-size 16px (iOS zoom engeli), touch-friendly spacing.
Mobilde tiny input, sıkışık grid, 4 kolon layout kullanılmayacak.

## 10. Sticky Action Bar

Mobilde Kaydet/Güncelle/Sil butonları ekran altında sticky olacak.
Safe-area destekli olacak. Kullanıcı formun en altına inmek zorunda kalmayacak.

## 11. Drawer Standardı

Mobil drawer: full screen veya bottom sheet olacak.
Mobilde dar sağ panel kullanılmayacak.

## 12. Safe Area Standardı

iPhone notch, Android gesture nav, iOS Safari alt bar desteklenecek.
env(safe-area-inset-bottom) kullanılacak.

## 13. Toast Standardı

Toast ve issue badge: bottom nav üstüne binmeyecek, action butonunu kapatmayacak.

## 14. Loading UX Standardı

Tam ekran spinner yerine skeleton cards / skeleton KPI / skeleton list kullanılacak.

## 15. Empty State Standardı

Boş ekran sadece "Kayıt yok" demeyecek.
Kullanıcıya bir sonraki aksiyonu önerecek ve CTA butonu sunacak.

## 16. Danger Action Standardı

Silme işlemleri: kırmızı tema, iconlu confirm modal, sonuç açıklaması ile yapılacak.
Browser alert kullanılmayacak.

## 17. Bottom Nav Standardı

Bottom nav: CSS variable ile sabit yükseklik (--bottom-nav-h), her sayfada aynı davranış.
İcon + kısa label, maksimum 5 item.

## 18. Mobil Sayfa Yapısı

Mobil sayfa sırası: 1. Hero, 2. Primary Action, 3. KPI, 4. Filters, 5. Content, 6. Secondary Actions.

## 19. ERP Mobil Felsefesi

Mobil ERP veri göstermek için değil, iş bitirmek için vardır.
Kullanıcı eldivenli, ayakta, üretim içinde, tek elle kullanıyor olabilir.
Bütün mobil UX buna göre tasarlanacak.

## 20. Tasarım Felsefesi

Hedef görünüm: Stripe + Linear + modern warehouse ERP hissi.
Yapı: endüstriyel, hızlı, ergonomik, yorucu olmayan.

## 21. Development Checklist

Yeni component veya ekran eklenirken önce şu sorular cevaplanacak:

- Mobilde nasıl davranacak?
- Kart mı tablo mu?
- Sticky action gerekiyor mu?
- Tek elle kullanılabilir mi?
- 360px'de taşar mı?
- Safe-area uyumlu mu?
- Primary action fazla mı?

Bu sorular cevaplanmadan component tamamlanmış sayılmayacak.

---

# Single Source of Truth Rule

Operational truth must only come from stock_movements.

The following tables are projections/cache tables only:
- warehouse_balances
- lot_balances
- party_balances
- stock_cards.current_stock_kg
- order status summaries

These tables must NEVER be manually trusted as the primary operational truth.

All projections must always be regenerated from stock_movements consistency rules.