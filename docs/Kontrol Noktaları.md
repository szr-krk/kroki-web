# Kontrol Noktaları

Kontrol noktaları seçili nesnenin adapter'ı tarafından tarif edilir, `ControlPointManager` tarafından `#editorEditLayer` içine SVG tutamaçları olarak çizilir ve `SelectionManager` üzerinden geometri mutasyonuna bağlanır.

## İlgili kod dosyaları

- `src/core/controlPointManager.js`: tutamaç lifecycle'ı, ekran-sabit metrikler ve pointerdown bağlantısı.
- `src/core/selectionManager.js`: kontrol noktası drag transaction'ı.
- `src/adapters/*.js`: tipe özgü `getControlPoints`, `beginControlPointMove`, `moveControlPoint`.
- `src/core/multiSelectManager.js`: grup resize/rotate tutamaçlarını ayrı yönetir.
- `src/core/roadIntersectionEngine.js`: kavşak Q tutamaçlarını ayrı katmanda yönetir.
- `src/geometry/*.js`: temel geometri dönüşümleri.

Bağlantılar: [[Seçim Sistemi]], [[Nesne Sistemi]], [[Yol Sistemi]], [[Kavşak Sistemi]].

## Ekran-sabit metrikler

`svgUnitsPerScreenPx()` ile viewBox ölçeği SVG birimine çevrilir:

- Görsel çap: 48 ekran pikseli.
- Hit çapı: 72 ekran pikseli.
- Endpoint offset: 48 ekran pikseline karşılık gelen SVG değeri.
- Handle gap: 48 ekran pikseline karşılık gelen SVG değeri.

ViewBox veya pencere boyutu değişince seçim senkronizasyonu tutamaçları yeniden boyutlandırır. Tutamaçlar `circle`; segment ayırıcılar daha ince `rect` görseli kullanabilir.

Kontrol noktalarının görünürlüğü normal seçim, edit, yeniden render veya viewBox senkronizasyonunda kamerayı değiştirmez. Yalnız kullanıcı **Ekrana Sığdır** düğmesine bastığında sonraki `preselect` için tek kullanımlık bir görünürlük kontrolü hazırlanır. O seçimde kontrol noktaları viewport dışında kalıyorsa kamera bir kez düzeltilir; izin tüketilir. Kullanıcının arada pan/zoom hareketi yapması bekleyen izni iptal eder.

## Genel drag akışı

1. Handle `pointerdown` ile `SelectionManager.startControlPointDrag` çağırır.
2. Seçim `edit` moduna yükseltilir.
3. Adapter varsa başlangıç snapshot'ı için `beginControlPointMove` çağrılır.
4. Pointer hareketinde döndürme dışındaki gerçek geometri noktası ortak grid/uç snap'inden geçirilir; ekranda offsetli gösterilen tutamaçların offset'i önce çıkarılır.
5. Döndürme tutamacı çizim nesnesi, levha, araç ve diğer sembollerde 0°/90°/180°/270° açılarına ±10° içinde yardım uygular. Bu açı yardımı katalog nesnelerinin serbest taşıma kuralından bağımsızdır. IP döndürme picker'ı bu yoldan geçmez ve 1° serbest adımını korur.
6. Manager `updateGeometry(..., { skipHistory: true })` ile adapter'ın `moveControlPoint` metodunu çalıştırır.
7. Pointer up'ta tek “Geometri duzenle” geçmiş kaydı commit edilir.

## Tip bazında kontrol noktaları

- **Line:** başlangıç ve bitiş; handle çizgi ucunun dışındadır; kavrama noktası ile başlangıç geometrisi saklanır ve gerçek uç bu farkla taşınır. Yakındaki mevcut uç grid'den önceliklidir; bu nedenle zoom değiştirmeden tam birleştirme yapılabilir.
- **Arc:** başlangıç, bitiş ve sagitta/arc kontrolü; üçü de ortak snap'i kullanır.
- **Bezier:** başlangıç, bitiş; quadratic için `q`, cubic için `c1/c2`.
- **Circle:** tek radius/rotation handle'ı; gerçek çember noktası grid'e, yönü ana açılara snap edilir.
- **Ellipse:** dört köşe resize grid'e, rotate ana açılara snap edilir.
- **Rectangle:** şekil dışına taşınmış dört köşenin gerçek geometri noktası grid'e, rotate ana açılara snap edilir.
- **Text:** metin bounding box'ının sağındaki rotate ana açılara snap edilir.
- **Callout:** kutu/metin merkezi ve ok ucu.
- **Traffic sign:** rotate; ölçek yan Inspector'dan değiştirilir.
- **Closed shape:** normal modda dört resize grid'e ve rotate ana açılara; `pointEdit` modunda her köşe `pN` ve her quadratic kontrol `qN` ortak snap'e bağlıdır.
- **Road:** profile göre başlangıç/bitiş, arc kontrolü veya 2–5 S kontrolü; ada iç/dış çap; ayrıca aktif boundary segment ayırıcıları ve seçili bariyer noktaları.

## Yol özel noktaları

- Başlangıç/bitiş handle'ları tangent doğrultusunda yol ağzının dışına offset edilir.
- S kontrol noktaları doğrudan `geometry.controls[index]` değerini değiştirir.
- Arc kontrol noktası `ratio`yu yeniden hesaplar.
- Boundary segment tutamacı yol üzerindeki `t` ayrımını değiştirir.
- Yapışık bariyerde `from/to` yol parametresini; serbest bariyerde `start/end/c1/c2` dünya koordinatlarını değiştirir.
- Ada `island-inner` ve `island-outer` noktaları çap değiştirir.

## Grup ve kavşak noktaları

Grup tutamaçları `ControlPointManager` içinde değildir. `MultiSelectManager` döndürülmüş bir frame, dört köşe ve rotate handle üretir; resize uniform scale uygular. Çizim nesnelerinden oluşan grubun gerçek resize köşesi grid'e, rotate tutamacı ana açılara snap edilir. İçinde `gridSnap: false` bildiren katalog nesnesi bulunan karma grup mevcut serbest dönüşüm kuralını korur. [[Seçim Sistemi#Grup dönüşümleri]].

Kavşak Q tutamaçları da engine tarafından `roadIntersectionContourLayer` içine doğrudan eklenir. Görsel/hit yarıçapları viewBox değişiminde ayrıca senkronize edilir. [[Kavşak Sistemi#Q düzenleme davranışı]].

## Belirsiz

- Genel kontrol noktaları 48/72 px gibi dokunmatik odaklı büyük boyutlardadır. Mouse kullanımında beklenen ürün ölçüsü koddan ayrı bir ayarla tanımlanmamıştır.
- Ellipse köşe tutamaçları sınırın tam köşesinde, rectangle tutamaçları sınırdan ek offset ile çizilir; bu farkın bilinçli UX kararı olup olmadığı belirtilmemiştir.
