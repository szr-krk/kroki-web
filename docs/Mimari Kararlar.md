# Mimari Kararlar

Bu sayfa resmi ADR kayıtları değil, mevcut koddan çıkarılabilen fiilî tasarım kararlarıdır. Yeni çalışma bu kararları değiştirecekse etkilediği bütün bağlı notlar ve modüller birlikte değerlendirilmelidir.

## İlgili kod dosyaları

- `index.html`: çalışma zamanı kompozisyonu ve script sırası.
- `src/core/shapeRegistry.js`, `src/core/editorObjectManager.js`: nesne mimarisi.
- `src/core/styleManager.js`: ortak stil capability yaklaşımı.
- `src/core/selectionManager.js`, `src/core/multiSelectManager.js`, `src/core/groupManager.js`: etkileşim ve grup state'i.
- `src/core/documentSerializer.js`, `src/core/historyManager.js`: belgeyi sistem sınırı kabul eden kalıcılık/geçmiş yaklaşımı.
- `src/adapters/roadAdapter.js`, `src/core/roadIntersectionEngine.js`: türetilmiş yol/kavşak geometrisi.

## 1. Build'siz klasik script mimarisi

Uygulama ES module veya bundler kullanmaz. Modüller IIFE olarak yüklenir ve `window.Kroki`/diğer `window.*` namespace'leri üzerinden bağlanır. Bağımlılık enjeksiyonu script sırasıdır. Sonuç: yeni çekirdek/adapter dosyası `index.html` içinde doğru sırada yüklenmelidir.

İlgili: [[Proje Haritası#Önemli yükleme sırası]].

## 2. Model, DOM'dan ayrı çalışma zamanı kaynağıdır

`EditorObjectManager` model ve SVG elementini ayrı map'lerde tutar. Mutasyon önce modele, render sonra DOM'a uygulanır. `readFromElement/syncFromDom` legacy/başlangıç DOM'unu modele alma yolu olsa da normal çalışma model odaklıdır.

İlgili: [[Nesne Sistemi#Manager davranışları]].

## 3. Tip davranışı adapter ile genişletilir

Her nesne geometri, render, hit-test, kontrol noktası, taşıma, bounds ve seçim görünümünü kendi adapter'ında uygular. Çekirdek tip özel `if`lerden mümkün olduğunca kaçınır; capability alanları UI'yi yönlendirir.

İlgili: [[Nesne Sistemi#Adapter sözleşmesi]].

## 4. Style ve label ortak, geometri tipe özeldir

Stroke, dolgu, pattern, ok ve label normalizasyonu `StyleManager`da merkezileştirilmiştir. `ownsLabel`, `textObject` ve `noText` capability'leriyle callout/text/trafficSign/road gibi istisnalar açıkça ayrılır.

## 5. SVG DOM sırası katman sırasıdır

Ayrı bir sayısal z-index alanı yoktur. Nesne sırası serialize edilen object sırası ve SVG child sırasıdır. Grup manager semantic kayıtları DOM `<g>` hiyerarşisine yeniden kurar. Yollar global kural olarak arkada tutulur.

İlgili: [[Nesne Sistemi#Katman sırası]].

## 6. Kontrol noktaları ekran pikseli sabitidir

Tutamaç boyutları zoom ile büyüyüp küçülmez; ekran pikselinden SVG birimine çevrilir. Aynı yaklaşım genel kontrol noktaları ve kavşak Q tutamaçlarında ayrı uygulanır.

İlgili: [[Kontrol Noktaları#Ekran-sabit metrikler]].

## 7. Tekli seçim iki aşamalıdır

İlk tap `preselect`, ikinci etkileşim `edit` durumuna geçirir. Üst/yan UI her iki durumda görünür; kontrol noktası görünümü mode'a göre değişir. Çoklu seçim state'i tekli seçimden ayrı yönetilir.

İlgili: [[Seçim Sistemi]].

## 8. Yollar çoklu seçim ve gruplama dışındadır

`GroupManager.canGroupObject` ve `MultiSelectManager.canSelectId` yol tipini reddeder. Bu karar, karmaşık yol/kavşak state'inin generic grup dönüşümlerine girmemesini ve yolların arkada kalma kuralını korur.

## 9. Yol görseli enkesitten türetilir

Şeritler ayrı nesneler değildir. Bir merkez çizgisi + enkesit config'i, bütün offset boundary'leri, hit yüzeyini ve kesit seçimini üretir. Düz, arc, S ve ada aynı adapter sözleşmesinde `pointAt/tangentAt` ile birleşir.

İlgili: [[Yol Sistemi]], [[Şerit Sistemi]].

## 10. Kavşaklar kalıcı nesne değil, türetilmiş görünümdür

Kavşak geometrisi yol yüzeylerinden her refresh'te yeniden hesaplanır. Yalnız kullanıcının Q farkları serialize edilir. Böylece yol mutasyonu kavşağı otomatik günceller; karşılığında bağımsız kavşak kimliği/nesnesi yoktur.

İlgili: [[Kavşak Sistemi]].

## 11. Yol renderı yüzey dolgusu üretmez

Normal `roadAdapter.render` görünmeyen beyaz yüzey path'i eklemeyi bırakmıştır. Yol yüzeyi hesap amaçlıdır; görünen çizgiler boundary path'leri ve kavşak dış konturudur. Bu karar DOM yükünü azaltmaya yöneliktir.

## 12. Geçmiş tam snapshot'tır

Undo/redo command delta yerine serializer belgesi + seçim state'ini saklar. Restore bütün belgeyi yeniden import eder. Sınır 120 undo kaydıdır.

İlgili: [[Undo Redo]].

## 13. Belge formatı normalize edilmiş uygulama modelidir

Serializer raw SVG yerine nesne modelleri, gruplar, viewBox ve kavşak edit state'i yazar. Bilinmeyen adapter tipi atlanır; id'ler normalize edilir. Menüdeki “SVG olarak kaydet” bu belge serializer'ından ayrı ve henüz uygulanmamış bir ihtiyaçtır.

İlgili: [[Serializer]].

## 14. Etkileşim transaction sınırı pointer gesture'dır

Canlı drag güncellemeleri `skipHistory` ile yürür; pointer up tek transaction commit eder. Aynı ilke nesne, kontrol noktası, grup ve kavşak Q hareketinde kullanılır.

## 15. Trafik levhası art'ı modele gömülür

Levha metadata'sı `signArt` taşır. Bu, belgenin katalogdan bağımsız render edilebilmesini sağlar; JSON boyutu ve dış içerik güveni maliyetidir.

İlgili: [[Trafik Levhası Sistemi]], [[Serializer#Güvenlik ve normalizasyon sınırları]].

## 16. Offline ve düşük cihaz performansı önceliklidir

Uygulama harici servis veya runtime network bağımlılığı olmadan çalışmalıdır. Performans hedefi düşük Android tabletlerdir; bu nedenle gereksiz DOM yazımı, görünmeyen SVG yüzeyleri, tekrar parse edilen katalog art'ı ve pointer move sırasında pahalı rebuild işlemleri mimari borç sayılır.

İlgili: [[Performans Kriterleri]].

## 17. Katalog asset'leri generated veriyle taşınır

Trafik levhaları, diğer semboller ve araçlar runtime'da dış dosya fetch etmez. Generated JS katalogları, metadata ve SVG/path art bilgisini taşır; kütüphane panelleri bu veriden preview üretir, adapter'lar da canvas nesnesini merkez/ölçek/dönüş modeliyle render eder.

İlgili: [[Sembol ve Asset Sistemi]], [[Trafik Levhası Sistemi]].

## 18. Belge geometrisi krokiyle birlikte ölçeklenir

`#editorObjects` içindeki gerçek kroki geometrisi `vector-effect: none` kullanır. `non-scaling-stroke` yalnız seçim, çoklu seçim, seçim alanı ve aktif yol kesiti gibi editör vurgularına ayrılmıştır. SVG/PNG ve Son Krokiler/Şablonlar önizlemeleri dışa aktarılırken bütün belge geometrisi ayrıca `none` değerine normalize edilir; böylece kalın stroke'lar küçük önizlemeyi bastırmaz.

## 19. Levha fontu canlı görünüm ve çıktıda aynı dosyadır

`KrokiSignNarrow` sistemde kurulu yerel fontlardan değil, izlenen `src/arial-narrow.ttf` dosyasından yüklenir. Bu fontu kullanan bir kroki SVG/PNG veya önizlemeye dönüştürülürken aynı TTF verisi SVG içine gömülür ve export özel font ailesine bağlanır. Font hazırlanamazsa farklı fontla sessizce çıktı üretilmez.

## 20. Etkileşim maliyeti belge boyutuyla gereksiz yere büyütülmez

Tek nesne ekleme ve güncellemeleri tüm belge anlık görüntüsü yerine `HistoryManager` nesne deltalarını kullanır; çok nesneli işlemler tam belge geçmişini korumaya devam eder. İşaretçi hareketleri ekran karesi başına bir geometri güncellemesinde birleştirilir. SVG pattern/marker temizliği aynı kare içindeki stil işlemleri için ortaklaştırılır ve değişmeyen pattern DOM'u yeniden kurulmaz. Katalog kayıtları yalnız çalışma zamanında kullanılan `art` içeriğini taşır; kullanılmayan ikinci tam SVG kopyası üretilmez.

## Belirsiz

- Bu kararlar için ayrı ADR/tarihçe bulunmadığından gerekçelerin bir kısmı kod davranışından çıkarımdır.
- Global namespace ve manager method patching yaklaşımının uzun vadede korunacağına ilişkin açık bir hedef yoktur.
