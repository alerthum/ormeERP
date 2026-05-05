<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions and file structure may differ from your training data.
Before writing code, read relevant documentation from `node_modules/next/dist/docs/`.
Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Turkish Character Rule

All files must be saved with UTF-8 encoding.

NEVER corrupt Turkish characters:

ç Ç ğ Ğ ı İ ö Ö ş Ş ü Ü

Do not convert Turkish strings to ASCII.

Correct Turkish examples:

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

# ERP Project Core Rules

This project is a textile ERP system for knitted fabric production.

The system tracks:

- Customer orders
- Supplier orders
- Purchase receipts
- Raw material lots
- Fabric parties
- Raw fabric production
- Dyehouse production
- Warehouse transfers
- Sales / shipment
- Returns / future repair processes
- Stock movements
- Warehouse balances
- Lot / party traceability

---

# No False Guarantee Rule

Never say:

- “tamamen çözüldü”
- “bir daha olmayacak”
- “kusursuz çalışıyor”
- “her şey sorunsuz”

Instead always report:

- What changed
- Which files changed
- Which modules are affected
- Which scenarios were tested
- Which scenarios were not tested
- What risks remain

---

# No Blind Refactor Rule

Before changing code, analyze:

- Existing data model
- Existing services
- Existing UI components
- Existing module dependencies
- Existing database schema
- Existing movement logic

Do not rewrite working modules without reason.

Do not change UI unless specifically requested.

Do not change business logic unrelated to the request.

---

# Movement-Based ERP Rule

This ERP does NOT have a single fixed transaction chain.

Do not assume a hardcoded flow such as:

Purchase → Transfer → Raw Production → Dyehouse → Transfer → Sale

The real system is flexible.

Valid examples:

- Purchase → Warehouse
- Purchase → Sale
- Purchase → Transfer
- Purchase → Raw Production
- Purchase → Stock
- Raw Production → Transfer
- Transfer → Dyehouse
- Dyehouse → Transfer
- Dyehouse → Sale
- Sale → Return
- Return → Warehouse
- Return → Transfer
- Return → Dyehouse Repair / Reprocess

Therefore dependency validation MUST NOT rely on module order.

Dependency validation must be based on stockMovement relationships.

---

# Stock Identity Rule

stockId alone is NOT enough for traceability.

The same stock can be purchased from different suppliers, on different dates, with different tones, quality, prices or mixture ratios.

Therefore stock tracking must distinguish:

- Same stock card
- Different raw material lots
- Different fabric parties

---

# Lot and Party Rule

A stock item must not be treated as both lot-tracked and party-tracked at the same time.

## Raw materials

For raw materials such as:

- İplik
- Likra
- Polyester
- Other hammaddeler

tracking identity is:

LotNo

Raw materials use supplier-provided lot/serial numbers.

Example:

- IP stock
- LYC stock
- POLY stock

These are tracked by LotNo.

## Fabric

For fabric such as:

- YM Ham Kumaş
- MM Mamül Kumaş

tracking identity is:

PartiNo

Fabric party number is generated internally during raw production.

The same PartiNo continues through:

Ham üretim → Boyahane → Mamül → Transfer → Satış

The stock changes from YM to MM, but PartiNo stays the same.

---

# Traceability Purpose Rule

Lot and party tracking exists for backward traceability.

If customer reports a problem with a fabric party, the system must answer:

- Which yarn lots were used?
- Which supplier lots were consumed?
- Which raw production created this party?
- Which dyehouse process was applied?
- What were the test/lab results?
- Which warehouse transfers happened?
- Which shipment delivered it?

This is similar to serial tracking in Netsis.

---

# Stock Movement Relationship Rule

Every stock-affecting operation must create stockMovement records.

Each stockMovement should contain:

- id
- sourceTransactionId
- sourceTransactionType
- parentMovementId nullable
- sourceMovementId nullable
- stockId
- warehouseId
- direction: IN | OUT
- quantity
- movementDate
- lotNo nullable
- partyNo nullable
- partyId nullable
- orderId nullable
- supplierOrderId nullable
- description
- createdAt
- createdBy

---

# Source / Parent Movement Rule

When one movement consumes or transfers stock created by a previous movement, it must reference the source movement when possible.

Examples:

Transfer:
- OUT movement from source warehouse
- IN movement to target warehouse
- IN movement should reference the OUT movement
- Both movements should belong to the same sourceTransactionId

Raw Production:
- OUT movements consume raw material LotNo
- IN movement creates YM fabric PartiNo
- YM movement should be connected to raw production transaction

Dyehouse Production:
- OUT movement consumes YM with PartiNo
- IN movement creates MM with same PartiNo
- MM movement must preserve the same PartiNo

Sale:
- OUT movement consumes MM with PartiNo

Return:
- IN movement brings back MM with same PartiNo

---

# Dependency Validation Rule

Do not block deletion just because another movement has the same:

- stockId
- lotNo
- partyNo
- partyId

Same stock/lot/party does not automatically mean dependency.

A transaction can only be blocked if a later movement directly depends on the output of the current transaction.

Dependency should be checked using:

- parentMovementId
- sourceMovementId
- sourceTransactionId
- generated movement ids
- actual consumed quantity
- movementDate when needed

Previous movements must never block deletion of a later transaction.

Unrelated later movements must not block deletion.

---

# Delete / Reverse Operation Rule

Deleting a stock-impacting transaction is NOT a new stock consumption.

It is a reverse operation.

Therefore generic stock errors must not be shown during deletion.

Wrong:

“Yetersiz stok. Mevcut bakiye 0.000 kg, istenen 355.000 kg.”

Correct:

“Bu depo transferi silinemez. Çünkü transfer edilen kumaş daha sonra boyahane üretiminde kullanılmış.”

If there is no true downstream dependency, delete/reverse must be allowed.

---

# Current Known Delete Logic Rule

If the flow is:

Depo Transferi → Boyahane Üretimi

Deleting Boyahane Üretimi:

- Previous transfer is NOT a blocker
- It should be deleted if there is no later sale, transfer or consumption after the dyehouse production

Deleting Depo Transferi:

- If transferred stock was later used in dyehouse production, sale or another transfer, deletion must be blocked
- Message must explain the later transaction

---

# User-Facing Message Rule

All user-facing errors, warnings, validations and notifications must be meaningful Turkish.

Never show:

- Wed / Thu / Fri
- GMT
- UTC
- Coordinated Universal Time
- Universal Time
- JavaScript raw Date string
- PostgreSQL parameter names like $1, $4
- Stack trace
- Technical SQL details

Use date format:

dd.MM.yyyy

Correct example:

27.05.2026 tarihli Depo Transferi

---

# Validation Message Standard

User-facing validation messages must follow this structure:

Title:

İşlem yapılamıyor

Description:

Bu kayıt silinemez. Çünkü bu işlemden sonra aşağıdaki işlemler yapılmış:

List:

- 27.05.2026 tarihli Boyahane Üretimi, 355 kg
- 28.05.2026 tarihli Satış Sevkiyatı, 120 kg

Suggestion:

Önce sonraki işlemleri silin veya düzeltin.

Technical details may be logged to console/server logs, but must not be shown to the user.

---

# Transaction Rule

All stock-impacting operations must run in a single database transaction.

This includes:

- Main transaction record
- Stock movements
- Warehouse balances
- Lot balances
- Party balances
- Order summaries
- Timeline records
- Notifications/log records

Never leave partial data.

---

# Update Rule

Updating stock-impacting transactions must follow this pattern:

1. Validate downstream dependencies
2. Reverse previous movements safely
3. Apply new movements
4. Update balances
5. Update summaries
6. Commit everything in one transaction

---

# Delete Rule

Deleting stock-impacting transactions must follow this pattern:

1. Find movements created by this transaction
2. Check whether those movement outputs were used by later movements
3. If used, block with meaningful Turkish message
4. If not used, reverse movements safely
5. Update balances
6. Delete or mark transaction as cancelled
7. Commit everything in one transaction

---

# Balance Rule

Stock balance must be tracked at these levels:

- Total stock balance
- Warehouse stock balance
- Lot balance for raw materials
- Party balance for fabrics
- Warehouse + Lot balance
- Warehouse + Party balance

Raw materials use LotNo.

Fabric uses PartiNo.

Do not use LotNo for fabric.

Do not use PartiNo for raw material.

---

# Supplier Lot Rule

When purchasing raw material:

- LotNo comes from supplier
- LotNo must be stored
- Same stockId can have many LotNo records
- Production must consume selected LotNo records

---

# Fabric Party Rule

When producing raw fabric:

- System creates PartiNo
- PartiNo belongs to fabric flow
- YM and MM can share the same PartiNo
- Boyahane changes stock from YM to MM but must preserve PartiNo

---

# UI Protection Rule

Do not change existing premium UI unless specifically requested.

Protect:

- White background
- Navy/blue accent
- Soft shadow
- Rounded cards
- Sidebar
- Mobile bottom navigation
- Modal style
- KPI cards
- Table style
- Typography
- Turkish labels

---

# PostgreSQL Rule

Always use explicit PostgreSQL parameter casts when needed.

Examples:

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

If temporary test data is created:

- Clearly mark it
- Clean it after testing
- Report what was created and deleted

---

# Mandatory Test Chain Rule

After stock-impacting changes, test or clearly mark as untested:

1. Purchase receipt with LotNo
2. Warehouse transfer
3. Raw production consuming raw material lots
4. YM fabric party creation
5. Transfer to dyehouse
6. Dyehouse production consuming YM and creating MM with same PartiNo
7. Transfer
8. Sale / shipment
9. Reverse delete from last step backward
10. Try deleting a middle transaction and verify meaningful blocking

If not tested, state clearly:

“This chain was not fully tested.”

---

# Change Report Rule

After every change, report:

- Changed files
- Affected modules
- Database changes
- Tested scenarios
- Untested risks
- Rollback plan

---

# Development Log Rule

Long-term improvements must be written into development log when requested.

Do not implement future features unless requested.

---

# Current Stability Goal

The project must move from fragile party/lot/date-only validation to movement-based validation.

Long-term correct model:

- LotNo for raw materials
- PartiNo for fabric
- stockMovement relationship tracking
- parentMovementId/sourceMovementId where needed
- dependency validation based on actual movement usage, not generic same stock/party/lot matching


# Zero Orphan Data Rule

Operational orphan data is not acceptable.

The system must never leave a transaction header without its stock_movements, balances, summaries and timeline records.

The system must never leave balances or summaries that do not match stock_movements.

All stock-impacting create/update/delete operations must run inside one database transaction.

If any part of the operation fails, the whole operation must rollback.

Do not hide inconsistent data in reports. Prevent inconsistency at write time.

If inconsistency is detected, show an admin-level critical integrity warning and provide diagnostics/rebuild tools.

# Data Consistency Rule

Veri tutarsızlığını raporda saklama. Tutarsız veri oluşmasını engelle. Her stok etkileyen işlem transaction içinde header + movements + balances + summaries + timeline kayıtlarını birlikte oluşturmalı veya birlikte rollback etmelidir.