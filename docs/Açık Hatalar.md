# Açık Hatalar

Bu liste yalnız kaynak kod incelemesinde görülen eksik bağlantıları ve somut tutarsızlıkları içerir. Çalıştırma/test ile doğrulanmamış maddeler “Olası risk” olarak işaretlenmiştir.

## İlgili kod dosyaları

- `index.html`, `src/home.js`, `src/editor-rail.js`, `src/editor-main-menu.js`: bağlı veya yer tutucu UI girişleri.
- `src/core/documentSerializer.js`: metadata ve import davranışı.
- `src/core/roadIntersectionEngine.js`: geometriye bağlı Q state.
- `src/core/historyManager.js`: platform shortcut sınırı.

Bağlantılar: [[Home]], [[Menü Sistemi]], [[Serializer]], [[Kavşak Sistemi]], [[Sistem Durumu]], [[Yeni Özellikler]].

## Doğrulanmış eksik bağlantılar

### Hazır yol ve hazır kavşak Home içerikleri bağlı değil

Home içinde Hazır Kavşaklar ve Hazır Yollar modalları bulunur, fakat gerçek şablon/veri ve canvas'a yerleştirme akışı yoktur. Kavşak ayrı nesne olmadığı için hazır kavşak özelliği birden çok yol + Q state + konumlandırma/id eşleme olarak tasarlanmalıdır.

### Kılavuz içerik olarak bağlı değil

Home Kılavuz düğmesi yalnız özel dialog ile sonraki aşamada bağlanacağını söyler. Gerçek kılavuz sayfası/paneli yoktur.

### Genel JSON dosya import/export UI'si yok

Serializer localStorage, history ve imzalı SVG import/export tarafından kullanılır. Buna karşılık doğrudan `.json` indir/yükle UI'si yoktur.

## Somut veri tutarsızlıkları

### `roadBoundaryEdit` serialize edilebilir

`documentSerializer.cleanMetadata()` şu geçici alanları siler: `draft`, `pointEdit`, `roadSelection`, `roadBarrierEdit`. `SelectionManager.resetPointEdit()` ise bunlara ek olarak `roadBoundaryEdit`, `roadPocketEdit` ve `roadPocketIslandEdit` alanlarını da geçici edit state'i olarak temizler. Serializer'ın bu alanları silmemesi, seçimden kopuk yol edit metadata'sının belgeye yazılmasına izin verebilir.

Etkilenen: [[Serializer]], [[Yol Sistemi#Road Inspector]].

### Schema sürümü okunuyor ama doğrulanmıyor

Export `schemaVersion: 1` yazar; import sürümü ve `app` alanını kontrol etmez, migration yapmaz. Farklı şema biçimi sessizce boş/kısmi belge olarak `ok: true` dönebilir.

## Olası riskler — çalışma zamanı doğrulaması gerekli

### Import viewBox olayı yayınlamıyor

Import, canvas viewBox'ını doğrudan `setAttribute` ile değiştirir; kamera `writeViewBox` yolundaki `kroki:viewboxchange` olayını üretmez. Viewport'a göre ekran-sabit offset hesaplayan curved/line label'lar eski viewBox ile render edilmiş kalabilir; sonraki resize/zoom bunu düzeltebilir.

### Edit modunda aktif nesne dışından drag başlatma

`SelectionManager.handlePointerDown`, aktif nesne edit modundayken hit sonucunu zorunlu kılmadan aktif nesne için object drag başlatır. Kullanıcı canvas'ın başka noktasına basıp sürüklediğinde seçili nesne hareket edebilir. Bu bilinçli dokunmatik davranış olabilir; ürün beklentisiyle doğrulanmalıdır.

### Q edit anahtarlarının geometri değişiminde eşleşmemesi

Q state anahtarı boundary kimliği ve geometri çevresinden türetilir. Engine artık canlı Q listesinde olmayan kayıtları prune eder ve bazı alias'ları migrate etmeye çalışır; yine de yol/kavşak topolojisi büyük ölçüde değişirse eski Q farkının yeni Q'ya semantik olarak denk gelmesi garanti değildir.

### Boundary stilleri lane sayısı değişince başka sınıra kayabilir

Yol çizgi override'ları `bN` indeksine bağlıdır. Lane/banket yapısı değiştiğinde eski `bN` yeni fiziksel/semantic boundary'ye denk gelebilir. Normalize kodu semantic migration yapmaz.

### Dış belgedeki `signArt` HTML olarak parse edilir

Traffic sign adapter metadata'daki SVG art string'ini `innerHTML` ile parse eder. Katalog build-time güvenilir olsa da kullanıcıdan alınan JSON için sanitizasyon yoktur. Uygulamanın import güven modeli belirlenmeden dış belge açma özelliği eklenmemelidir.

### macOS geçmiş kısayolu yok

History shortcut yalnız `ctrlKey` kullanır; `metaKey` kontrol edilmez. macOS hedefleniyorsa Cmd+Z/Cmd+Shift+Z çalışmaz.

## Test kapsamı eksikliği

Depoda test dosyası, test koşucusu veya package/build tanımı bulunmuyor. Özellikle aşağıdaki davranışlar regresyona açıktır:

- Üçten fazla yol ve terminal bağlantılarda kavşak union/Q üretimi.
- Lane/banket adedi değişiminde boundary style eşleşmesi.
- İç içe grup copy/ungroup/undo.
- Import sonrası viewBox, label ve Q state senkronizasyonu.
- Levha içi çoklu text run düzenleme.

## Belirsiz

- Yukarıdaki “Olası riskler” tarayıcı etkileşim testi yapılmadan kesin hata sayılmamalıdır.
- Kodda issue numarası veya resmi hata takip sistemi referansı yoktur.




