# Yokus Orme ERP

Fason çalışan örme kumaş fabrikaları için Next.js App Router, TypeScript, Tailwind CSS, Supabase PostgreSQL/Auth/Storage/Realtime ve Drizzle migration altyapısıyla hazırlanmış premium ERP MVP.

## Özellikler

- Dashboard, müşteri siparişleri, satıcı siparişleri, stok, depo, transfer, ham üretim, boyahane, parti timeline ve fire analizi ekranları
- Mobilde PWA hissi veren bottom tab navigation, desktopta sidebar + header
- Demo/seed veri seti: kumaş cinsleri, renkler, depolar, fasoncular, boyahaneler, stoklar, siparişler, partiler ve hareketler
- Otomatik YM/MM stok eşleştirme ve kod üretim servis mantığı
- Satıcı siparişi ve kısmi mal kabul veri modeli
- Drizzle PostgreSQL schema ve migration dosyası
- Supabase client, Storage bucket tanımları ve Realtime hook altyapısı

## Kurulum

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Uygulama varsayılan olarak `/dashboard` ekranına yönlenir.

## Supabase

1. Supabase projesi oluşturun.
2. `.env.local` içine `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ve `DATABASE_URL` değerlerini girin.
3. Migration üretildi: `drizzle/0000_chemical_rachel_grey.sql`.
4. Migration çalıştırmak için:

```bash
npm run db:migrate
```

5. Demo veriyi Supabase tablolarına basmak için:

```bash
npm run seed
```

Storage için beklenen bucket isimleri: `erp-documents`, `erp-photos`, `erp-receipts`.

## Vercel

GitHub reposunu Vercel'e bağlayın, environment değişkenlerini ekleyin ve default Next.js build ayarlarıyla deploy edin.
