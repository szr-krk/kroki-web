# Performans Kriterleri

Bu projenin performans hedefi, offline çalışan ve düşük donanımlı Android tabletlerde kullanılabilen bir kroki editörüdür. Masaüstünde iyi çalışması yeterli değildir; 4 GB RAM seviyesindeki Android cihazlarda pan, pinch zoom, nesne sürükleme ve yol düzenleme akıcı kalmalıdır.

Bağlantılar: [[AI Devralma Notu]], [[Editör]], [[Yol Sistemi]], [[Kavşak Sistemi]], [[Nesne Sistemi]], [[Sembol ve Asset Sistemi]].

## Temel hedef

Kullanıcı kamera hareketi, seçili nesne sürükleme veya kontrol noktası sürükleme sırasında sistemin her pointer olayında bütün belgeyi yeniden kurduğunu hissetmemelidir. Çizim ve düzenleme akışları anlık tepki vermeli; pahalı hesaplar mümkünse gesture sonuna, `requestAnimationFrame` sınırına veya gerçek değişiklik anına alınmalıdır.

## Kamera performansı

Mevcut kamera çekirdeği `src/editor-camera.js` içindedir.

- Ana canvas viewBox yazımı `writeViewBox(..., { defer: true })` ile `requestAnimationFrame` üzerinden sınırlandırılır.
- `currentViewBox` bellekte tutulur; sürekli `getAttribute("viewBox")` parse etmekten kaçınılır.
- Aynı viewBox tekrar DOM'a yazılmaz.
- `kroki:viewboxchange` yalnız gerçek viewBox değişiminde yayınlanmalıdır.
- Harici viewBox yazan eski kod varsa mümkünse `krokiEditorCamera.writeViewBox` kullanmalıdır.

Riskli davranışlar:

- Her pointer move'da `getBBox()` ile bütün belge bounds'u almak.
- ViewBox değişiminde tüm nesneleri render etmek.
- Kamera sırasında katalog SVG parse etmek.
- Pan/pinch içinde serializer export veya history snapshot almak.

## Nesne sürükleme performansı

Pointer move sırasında doğru yol `EditorObjectManager.updateGeometry(..., { skipHistory: true })` veya ilgili manager'ın canlı mutasyon yoludur. Gesture sonunda tek transaction commit edilmelidir.

Korunması gerekenler:

- Canlı sürüklemede history kaydı üretilmez.
- Sürüklenen nesne dışındaki DOM mümkün olduğunca dokunulmaz.
- Style panel ve kontrol noktaları yalnız gerekli olduğunda sync edilir.
- Araç, levha ve diğer sembol sürüklenirken art yeniden parse edilmemelidir; adapter'lar art key/cache kullanmalıdır.

## Yol performansı

Yol adapter'ı yoğun geometri üretir. Mevcut önemli optimizasyonlar:

- Yol merkez çizgisi örnekleri `sampleCache` ile model/geometri key'ine göre cache'lenir.
- Normal render görünmeyen beyaz `editor-road-surface` path'i üretmez.
- Yol çizgileri boundary ve görünür aralıklara bölünür; kavşak üyesi dış edge çizgileri adapter'da atlanır.
- Cep ve bariyer geometri hesapları sadece ilgili render/hit/control path'lerinde yapılır.

Dikkat:

- `samplesFor`, `crossSection`, `activePocketGeometries`, `barrierSamples` gibi fonksiyonlar pointer move'da sık çağrılabilir.
- Lane veya boundary değişikliği tüm yol renderını gerektirir; kamera hareketi gerektirmez.
- Yol sürüklenirken kavşak motoru suspend edilir; bu davranış bozulmamalıdır.

## Kavşak performansı

Kavşak motoru `src/core/roadIntersectionEngine.js` içinde pairwise çalışır. Refresh:

- Manager mutasyon wrapper'larıyla zamanlanır.
- `scheduleRefresh()` aynı frame içinde tek render planlar.
- Yol sürüklenirken `setSuspended(true)` pahalı rebuild'i durdurur.
- `renderingRoads` bayrağı, engine'in kendi road rerender'ının tekrar refresh üretmesini engeller.

Kaçınılması gerekenler:

- Her pointer move'da bütün yol çiftlerini yeniden hesaplamak.
- Kavşak dış konturunu normal nesne gibi serialize etmek.
- Q handle boyutlarını her mouse move'da yeniden hesaplamak.
- Debug shape'leri açık unutmak.

## Katalog ve sembol performansı

Levha, diğer sembol ve araç katalogları generated data kullanır. Düşük cihazlarda önemli kurallar:

- Katalog grid'i panel açılınca render edilmeli; uygulama açılışında bütün preview DOM'u basılmamalıdır.
- Preview SVG'leri cache'lenip clone edilmelidir.
- Canvas üzerindeki katalog nesnesi her renderda art parse etmemeli; `dataset` art key veya metrics cache kullanmalıdır.
- Çok karmaşık SVG path sayıları düşük tutulmalıdır.
- Bitmap veya dış URL kullanılmamalıdır; offline paket içinde kalmalıdır.

Ayrıntı: [[Sembol ve Asset Sistemi]].

## Export ve kayıt performansı

SVG/PNG export, localStorage kayıt ve preview üretimi pahalı olabilir. Bunlar kullanıcı komutu ile çalışmalı, pointer move veya kamera olayına bağlanmamalıdır.

Riskler:

- `localStorage` büyük JSON/SVG preview ile hızla quota'ya yaklaşabilir.
- PNG export canvas rasterizasyonu RAM tüketir; özellikle büyük viewBox için çıktı boyutu sınırlanmalıdır.
- Recents preview SVG'leri Home'da `img` olarak lazy yüklenmelidir.

## Kabul kontrol listesi

Bir performans değişikliği sonrası en az şu davranışlar elle veya smoke ile kontrol edilmelidir:

- Boş canvas pan/pinch/wheel.
- 20+ nesneli canvas pan/pinch/wheel.
- Araç, levha ve diğer sembol sürükleme.
- Düz yol, S yol ve ada sürükleme.
- İki yol kavşağı ve T kavşak sürükleme sonrası rebuild.
- Cep ekli yolun kavşakta dış kenar davranışı.
- Undo/redo sonrası selection ve kavşak state'i.
- Home recents/template preview açma.

## Ölçüm önerisi

Resmi test altyapısı yoksa bile `.tmp` altında geçici benchmark HTML'i ile şu metrikler izlenebilir:

- 60 saniyelik pan/zoom senaryosunda ortalama frame süresi.
- Yol sürükleme sırasında kavşak rebuild sayısı.
- Aynı viewBox yazımının tekrar sayısı.
- Canvas üzerindeki toplam SVG node sayısı.
- localStorage kayıt boyutu.

Bu ölçümler depoya kalıcı test olarak eklenecekse [[Codex Talimatları]] güncellenmelidir.

