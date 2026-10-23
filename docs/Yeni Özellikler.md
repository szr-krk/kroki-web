# Yeni Özellikler

Bu sayfa mevcut UI'da açıkça yer tutucu olarak bulunan veya çekirdeği olup entegrasyonu eksik kalan işleri toplar. Aşağıdakiler mevcut özellik gibi değerlendirilmemelidir.

## İlgili kod dosyaları

- `index.html`, `src/home.js`, `src/editor-rail.js`, `src/editor-main-menu.js`: görünür girişler, kayıt/export ve Home liste akışları.
- `src/core/documentSerializer.js`: kaydet/yükle için kullanılan çekirdek.
- `src/ui/roadBuilder.js`, `src/core/roadIntersectionEngine.js`: hazır yol/kavşak fikrinin temel modelleri.
- `src/ui/trafficSignLibrary.js`: gelecekteki katalog panelleri için çalışan örnek.

Bağlantılar: [[Açık Hatalar]], [[Home]], [[Menü Sistemi]], [[Serializer]].

## Kodda açıkça bekleyen özellikler

### Kalıcı belge kaydet/yükle geliştirmeleri

Ana menü ve Home IndexedDB üzerinden son kroki/şablon kaydı yapar. Eksik olanlar: dosya sistemi veya kullanıcı seçimli kayıt yeri, quota görünümü/temizleme aracı, schema migration, doğrudan `.json` indir/yükle UI'si ve uzun vadeli kayıt kimliği politikasıdır.

### SVG içe/dışa aktarma

Home'da SVG Yükle, editör ana menüsünde SVG Olarak Kaydet vardır. Mevcut import yalnız Kroki imzalı SVG içindeki belge metadata'sını açar; genel SVG parser, adapter'a dönüşüm politikası ve desteklenmeyen öğe akışı yoktur.

### Resim dışa aktarma geliştirmeleri

“Resim Olarak Kaydet” ve “Alanı Resim Kaydet” bağlıdır. Geliştirilecek alanlar: çıktı kalite seçenekleri, büyük belgelerde RAM uyarısı, alan aracının mobil ergonomisi ve export sonrası kullanıcı geri bildirimi.

### Şablonlarım geliştirmeleri

Şablon kaydetme, adlandırma, listeleme, önizleme, silme ve düzenle açışı IndexedDB ile bağlıdır. Eksik olanlar: kategori/etiket, sıralama, dışa aktarma, cihazlar arası taşıma ve hazır şablon setidir.

### Hazır yollar ve hazır kavşaklar

Home modalları yer tutucudur. Yol için `RoadBuilder` model üretimi mevcut; kavşak ise ayrı nesne değil türetilmiş yol ilişkisidir. Hazır kavşak özelliği tasarlanırken birden çok yol + Q edit state'ini şablon olarak konumlandırma ve id eşleme gerekir.

### Araç ve diğer sembol kütüphaneleri

Araç ve diğer sembol sağ ray panelleri katalog verisiyle çalışır. Diğer semboller teknik olarak ayrı `otherSymbol` nesne tipidir; seçim, kopyalama, gruplama, ratiolu ölçek ve döndürme akışında levha ile aynı `catalogObject` kontrol davranışını paylaşır.

### Kılavuz

Kılavuz Home penceresine bağlıdır. 21.10.2026 güncellemesi 16 bölüm, bütün dolgu/çizgi desenleri, ada/cep dolguları, paylaşma ve güncel kullanım adımlarını kapsar; artık bekleyen bağlantı değildir.

## Çekirdekte olup UI'da görünmeyen seçenekler

### Yol kavşak katılımı ve köprü

Road config `autoIntersection` ve `bridge` alanlarını destekler; Intersection Engine bunlara göre yolu dışlar. Road Builder/Inspector kontrolü yoktur.

### Kavşak debug ve Q sıfırlama

Engine `setDebug` ve `resetQEndpointEdits` API'lerini açar. UI düğmesi yoktur.

### JSON import/export

`toJson/fromJson` API'si mevcuttur; geliştirici konsolu dışında görünür giriş yoktur.

## Özellik eklerken mimari sınırlar

- Yeni çizilebilir tip için adapter + registry + doğru script sırası gerekir. [[Nesne Sistemi#Adapter sözleşmesi]].
- Yol/kavşak şablonu generic grup değildir; yollar çoklu seçim ve gruplama dışındadır.
- Kaydetme, serializer JSON'u ile SVG/resim exportunu birbirinden ayırmalıdır.
- Dış JSON/SVG alımında trafik levhası `signArt` ve SVG `innerHTML` güveni ele alınmalıdır.
- Yeni mutasyonlar [[Undo Redo]] transaction sınırına bağlanmalıdır.

## Belirsiz

- Öncelik, hedef platform ve kullanıcı seçimli dosya API'si kararı netleşmemiştir; tarayıcı içi kalıcılık IndexedDB ile sağlanır.
- Hazır yol/kavşak içeriklerinin ürün formatı tanımlı değildir.

## Çekici-dorse eşleştirme ve çekici açısı

- Araç kataloğunda iki çekici ile üç dorse, her iki seçim yönünden eşleştirilebilir (6 kombinasyon).
- Tır tek `vehicle` nesnesidir; `metadata.vehicleTrailerVariantKey` dorseyi, `geometry.articulationAngle` çekici açısını tutar.
- `VehicleCatalog.rigParts/rigLayout` ortak bağlantıyı hesaplar. Öndeki dönüş tutamacı ±120° aralığında döner; dorse sabit kalır.
- Yan görünüm düz gösterilir; plan açısı korunur. Üst ve ters görünümde çekici dönüş kontrolü bulunur.
- Seçim, sınırlar, aynalama, kopyalama, geri alma ve SVG kaydı her iki parçayı birlikte destekler.
- Eski tek görselli “Çekici Ve Dorse” katalog seçeneği de iki parçalı çizilir.

### Ayrı parçaları birleştirme / birleşik tırı ayırma

- Sağdaki araç özelliklerinde birleşik tır için **Ayır**, ayrı çekici veya dorse için **Birleştir** bulunur.
- Ayırma, her parçanın ekrandaki yerini, dönüşünü ve aynalamasını korur; parçalar bağımsız düzenlenebilir.
- Birleştirme, çizimdeki karşı parçanın seçilip Tamam ile onaylanmasıyla yapılır. Seçili parça sabit kalır; birleşik araç üst görünümde düz kurulur ve seçili parçanın ölçeğini kullanır.
- İşlemler tek adımlı belge geçmişiyle geri alınır. Renkler ve etiketler korunur; yan görünümün yatay yerleşimi korunur ve lastiklerin gerçek alt kenarları aynı çizgiye hizalanır; araya dolgu eklenmez.
- İşlem ve eş seçme arayüzü: `src/ui/vehicleCoupling.js`; parça dönüşümleri: `VehicleRenderer.componentModelsFor()`.

### Araç düzenlemede akıcılık

- Çekici açısı değişirken SVG parçaları yeniden üretilmez; mevcut çekici grubunun dönüşümü güncellenir.
- Araç kataloğu bir kez indekslenir. Etiket konumları için her karede tam parça modeli / stil kopyası oluşturulmaz.
- Renk, temsili görünüm, görünüş veya dorse türü değiştiğinde görsel gerektiği gibi yeniden çizilir.
- Lastik hizası için ilk kullanımda yapılan SVG ölçümü saklanır; hareket boyunca `getBBox()` tekrarlanmaz.
- 4 kat yavaşlatılmış Chrome ölçümünde 120 çekici açısı güncellemesinin ortanca süresi yaklaşık 305 ms'den 85 ms'ye düştü (yaklaşık %72). Bu ölçüm tüm uygulama için genel hız garantisi değildir.

### İkinci akıcılık incelemesi ve güncelleme kaydı önizlemesi

- Düzenleyici ölçeği kamera hesaplamasından alınır; sık `getScreenCTM()` okumaları azaltılmıştır.
- Küçük çizimlerde seçim sınırları sahne/ölçek değişene kadar saklanır. Araç seçim köşeleri; konum, dönüş, görünüm veya boyut değiştiğinde yenilenen model önbelleğini kullanır.
- Ana ekran listelerinin özetleri alınırken tüm belge verisinin gereksiz JSON kopyası oluşturulmaz.
- Yeni güncelleme kontrol kayıtları gerçek SVG önizlemesi içerir. Önizleme başarısızlığı doğrulanmış çizim kaydını engellemez.
- Eski `update_` kayıtlarında boş önizleme, ana ekranda görünür olduğunda sırayla ve aynı çizim motoruyla ayrı bir görünmeyen çerçevede oluşturulur; sonuç kayda yazılır. Düzenleyici açılırsa işlem durdurulur. Açık belge/geçmiş değiştirilmez.
- `_krokiPreview=1` yalnız iç önizleme çerçevesinde kullanılır. Bu çerçeve güncelleme kontrolünü, oturum geri yüklemesini ve ana ekran kayıt taramasını çalıştırmaz.
