# Gelişim Raporu - Yokuş Örme ERP

## [2026-05-04] - Modernizasyon ve Veri Bütünlüğü Güncellemesi

### 🎨 Kullanıcı Arayüzü (UI) İyileştirmeleri
- **Yüksek Yoğunluklu Formlar**: Müşteri siparişi, ham üretim ve boyahane üretim formları 4 sütunlu (ızgara) yapısına geçirildi.
- **Mobil/Masaüstü Uyumu**: Modalların sağa yaslı veya orta konumda çözünürlüğe göre otomatik ölçeklenmesi sağlandı.
- **Köşeli Tasarım**: Tüm bileşenlerin köşeleri (`rounded-none`) keskinleştirilerek kurumsal kimliğe uygun hale getirildi.
- **Sidebar Kararlılığı**: Menülerin kullanıcı tercihine göre açık/kapalı kalması sağlandı, React DevTools uyarıları giderildi.

### 🏷️ Stok ve İsimlendirme Standartları
- **Yeni İsim Şablonu**:
    - **İplik (IP)**: `[Ne] [RENK]` (Örn: 20/1 SİYAH)
    - **Ham Kumaş (YM)**: `[Ne] [Kumaş] [RENK] [LYC/POLY] HAM`
    - **Mamül Kumaş (MM)**: `[Ne] [Kumaş] [RENK] [LYC/POLY]`
- **Büyük Harf Standartı**: Tüm stok isimleri kaydedilirken otomatik olarak Türkçe karakter duyarlı büyük harfe (`tr-TR`) çevrilmektedir.
- **Toplu Güncelleme**: Mevcut 7 stok kartının ismi yeni şablona toplu olarak taşındı.

### ⚖️ Üretim ve Envanter Kontrolü
- **Bakiye Doğrulaması**: Ham üretim kayıtlarında, seçilen depodaki lot bakiyesi kontrolü eklendi. Mevcut bakiyeden fazla tüketim girilmesi engellendi.
- **Otomatik YM/MM Eşleşmesi**: Sipariş oluşturulduğunda Ham (YM) ve Mamül (MM) stok kartlarının otomatik oluşturulması ve birbirine bağlanması mantığı güçlendirildi.

### 🛠️ Teknik Düzenlemeler
- **Layout Stabilization**: Grid yapılarında kolon çakışmalarını önlemek için `min-w-0` ve `overflow-hidden` stratejisi uygulandı.
- **Migration API**: Stok isimlerini toplu güncellemek için `/api/migrate-stocks` altyapısı kuruldu ve çalıştırıldı.
