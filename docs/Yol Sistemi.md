# Yol Sistemi

Yol sistemi üç parçaya ayrılır: `RoadBuilder` yeni yolun başlangıç verisini kurar, `roadAdapter` yol modelini normalize/render/düzenler, `RoadInspector` seçili yolun bağlamsal UI'sini yönetir. Otomatik kavşak davranışı ayrı [[Kavşak Sistemi]] içindedir.

## Devralma özeti

Yol sistemini “çizilmiş path listesi” gibi düşünme. Kalıcı gerçek, tek bir merkez geometri ve `metadata.road` config'idir. Görülen sınır çizgileri, şerit çizgileri, banket çizgileri, cepler, bariyerler, seçim yüzeyi ve hit-test bu modelden her renderda türetilir.

Güvenli değişiklik için ana kural şudur: merkez çizgisinin `pointAt/tangentAt` davranışı, `crossSection(config)` sırası ve kavşak motoruna verilen dış yüzey mantığı korunmalıdır. Görsel bir çizgiyi düzeltirken bile önce o çizginin boundary mi, segment mi, cep auxiliary contour'u mu, yoksa kavşak motorunun ortak dış contour'u mu olduğunu bul.

## İlgili kod dosyaları

- `src/ui/roadBuilder.js`: yeni yol formu ve başlangıç geometrisi/config'i.
- `src/adapters/roadAdapter.js`: yol geometrisi, kesit, çizgiler, bariyerler, hit-test ve kontrol noktaları.
- `src/ui/roadInspector.js`: seçili yolun profil, kesit, çizgi ve bariyer kontrolleri.
- `src/core/roadIntersectionEngine.js`: yollar arası otomatik kavşak ve kontur.
- `src/core/editorObjectManager.js`: yol katmanlarını arkada tutar.
- `index.html`: Road Builder ve Inspector kontrolleri.

Bağlantılar: [[Şerit Sistemi]], [[Kavşak Sistemi]], [[Kontrol Noktaları]], [[Seçim Sistemi]], [[Undo Redo]].

## Yol modeli

Yol da ortak nesne modelidir:

```js
{
  type: "road",
  geometry: { ... },
  metadata: {
    road: { version: 1, laneCount, laneWidth, ... }
  }
}
```

`style` ve `label` ortak model gereği bulunur; adapter `noText`, `ownsLabel` ve `roadObject` yetenekleriyle standart stil/metin kontrollerini devre dışı bırakır. Görsel yol tanımı `metadata.road` içindedir.

## Geometri profilleri

### Düz (`straight`)

`start` ve `end` arasında doğrusal enterpolasyon yapılır. Başlangıç/bitiş kontrol noktaları ortak ızgara snap sistemini kullanır. Bağlı ayrılma yolunun ana yola tutunan başlangıcı mevcut bağlantı kısıtını korur.

### Viraj (`arc`)

Geometri `start`, `end` ve `ratio` taşır. `ratio`, chord orta noktasına normal yöndeki sagitta oranıdır. Adapter bu değerden kontrol noktası ve üç noktadan çember geometrisi çıkarır. Hesap geçersiz/kollinear olursa doğrusal davranışa düşer.

### S viraj (`sCurve`)

- `start`, `end` ve 2–5 `controls` noktası taşır.
- Eski uyumluluk için ilk iki kontrol ayrıca `c1`, `c2`; adet `controlCount` alanına yazılır.
- Eğri, uçlar ve kontrol noktalarından geçen Catmull–Rom parçalarıyla hesaplanır.
- Global `t`, ardışık kontrol noktaları arasındaki chord uzunluklarına göre parçalara dağıtılır.
- Kontrol adedi değiştirildiğinde yeni noktalar mevcut eğri üzerindeki eşit `t` konumlarından örneklenir.

### Ada (`islandRing`)

- `center`, `innerDiameter`, `outerDiameter` taşır.
- Merkez çizgisi iç/dış yarıçap ortasındaki tam çemberdir ve saat yönünde örneklenir.
- Şerit sayısı 1–3'tür; ada için bölünmüş yol, banket, su kanalı ve bariyerler normalize sırasında kapatılır.
- İç/dış çap ayrı kontrol noktalarıyla değiştirilir.
- Inspector profil değiştirme düğmesini ada için gizler; ada normal profil döngüsüne dahil değildir.

## Örnekleme ve path üretimi

`roadAdapter` merkez çizgisini 64 eşit parametre parçasıyla örnekler. Her örnekte tangent ve normal hesaplanır. Yol çizgileri normal yönünde offset path olarak, kesitler iki offset arasındaki kapalı band olarak türetilir. Ada path'i dış ve ters yönlü iç çemberden oluşur.

Ada için yalnız SVG çizim üretimi analitik daire yaylarını kullanır: tam çember iki `A` komutu ve `Z`, kırpılmış/stil parçası tek `A` komutudur. İç/dış kenar, şerit çizgisi, seçili kesit, seçim halkası ve önizleme aynı yay üretimini kullanır. Kısmi yaylar kapatılmaz; ters yönlü iç halka seçim alanındaki deliği korur. Kavşak, görünür aralık, Q, hit-test ve merkez çizgisi örnekleme hesapları değişmez. Her görünür/stil aralığı ayrı path olmaya devam eder; çift/karma çizgilerin offset'leri, genişlikleri ve kesik çizgi başlangıçları korunur.

`scripts/island-arc-render-browser.cjs --baseline <git-ref>` eski adapter ile güncel adapter'ı aynı Chrome sahnelerinde karşılaştırır. Tek ada, kesişen yollar, terminal bağlantı, arc/S yolları, parçalı/çift/karma/sıfır genişlikli çizgiler ve çakışan adalar için hesap geometri ve Q durumu eşitliğini denetler. Üç şeritli tek adada path sayısı 4 kalırken SVG komut sayısı 264'ten 16'ya, path verisi 9474'ten 251 karaktere indi (`2e2c3a9` karşılaştırması). Bu ölçüm çizim verisinin azalmasını gösterir; fiziksel Android cihaz FPS ölçümü değildir.

Normal render sırasında beyaz yol yüzeyi DOM'a eklenmez; `renderSurface()` bilinçli olarak `null` döner. Yüzey geometrisi hit-test, seçim ve kavşak hesaplarında yine üretilir. Görünen ana yol öğeleri sınır/şerit çizgileri, seçili kesit vurgusu ve bariyerlerdir.

## Çekirdek algoritma sırası

1. Geometri normalize edilir: düz/arc/S/ada profili tek `pointAt/tangentAt` sözleşmesine indirilir.
2. Road config normalize edilir: lane, banket, bölünmüş yol, su kanalı, boundary style, cep ve bariyer değerleri clamp edilir.
3. Merkez çizgisi örneklenir ve her örnekte tangent/normal hesaplanır.
4. `crossSection(config)` sağdan sola kesitleri ve `b0..bN` boundary'leri üretir.
5. Her boundary offset path'e dönüştürülür.
6. Boundary style ve segmentler uygulanır.
7. Kavşak motoru varsa görünür `t` aralıkları ile çizgiler kırpılır.
8. Cep varsa dış edge adapter tarafından atlanır, cep için auxiliary contour üretilir.
9. Bariyerler kendi edge/boundary offset'inden veya serbest Bezier yolundan çizilir.

Bu sıralamada özellikle 4, 7 ve 8. adımlar birbirine bağlıdır. Cep veya kavşak düzeltirken yalnız path `d` üretimini değiştirmek kolayca karşı kenar taşması, T kavşakta yanlış ağız veya banket çizgisi kaybı oluşturabilir.

## Road Builder

Yeni yol görünür viewBox'ın merkezine eklenir. Düz/viraj/S profillerinde eksen uzunluğu görünür alanın `%55`i, en az 260 ve en fazla 520 SVG birimidir.

- Profil: düz, viraj, S viraj, ada.
- Yerleşim: yatay/dikey; ada seçiliyken gizlenir.
- Tür: normal/bölünmüş; ada seçiliyken gizlenir.
- Normal şerit sayısı: 1–20.
- Bölünmüş yol: `laneCount` sabit 2 olur ve form alanı devre dışıdır. Bu sayı her yön için kullanılan `dividedLaneWidths.left/right` dizilerinin uzunluğudur; sonuçta iki yönün her birinde iki lane bölümü oluşur.
- Ada şerit sayısı: 1–3.
- Başlangıç şerit genişliği 50, banket genişliği 20, bariyer direk aralığı 42'dir.
- Bölünmüş yola geçildiğinde sol/sağ banket zorunlu etkinleşir; iç banket ve su kanalı da config'te etkin kurulur. İlk geçişte iki dış bariyer checkbox'ı işaretlenir.
- Yol, ilk normal nesneden önce eklenir ve hemen edit modunda seçilir.

İşlem tek bir “Yol ekle” geçmiş kaydıdır.

## Road Inspector

Inspector üç bağlama geçer:

### Genel yol modu

- Şerit adedi ve genel şerit genişliği.
- Profil döngüsü: düz → viraj → S viraj → düz.
- Sol veya sağ tarafa ayrılan yol ekleme. Bir host yol her tarafında en fazla bir ayrılan yol taşıyabilir; dolu taraf panelde devre dışı kalır, iki taraf da dolunca ekleme girişi gizlenir ve çekirdek doğrulaması aynı tarafa ikinci üretimi reddeder. Bir dal silinirse yalnız o tarafın hakkı belge ilişkisinden otomatik geri açılır.
- S viraj kontrol adedi (yalnız S profili, 2–5).
- Yol sınırlarının X veya Y ekseninde simetrisi; ada için gizlidir.
- Sol/sağ banket aç/kapat.
- Global marking stilini döndürme.

Simetri yalnız geometriyi yansıtmaz: sol/sağ banketleri, şerit genişlik sırasını, bölünmüş yön dizilerini, boundary style anahtarlarını ve bariyer kenarlarını da aynalar; geçici yol seçim metadata'sı temizlenir.

### Kesit modu

Edit modundaki yola tap edilince `sectionAtPoint` signed offset ile lane/banket/iç banket/su kanalı kesitini seçer. Inspector:

- Yalnız seçilen kesitin genişliğini değiştirebilir.
- Seçilen kesitin üst/alt boundary panelini açabilir.
- Uygun dış/İç kenara bariyer ekleyebilir.
- “Kesit tamam” ile `roadSelection`, `roadBoundaryEdit`, `roadBarrierEdit` temizlenir.

### Bariyer modu

Bariyere tap edilince yol kesiti yerine bariyer kontrolleri öne çıkar: yola yapışık/serbest, uç durumları, direk aralığı, sil ve tamam. Ayrıntı: [[Yol Sistemi#Bariyerler]].

## Bariyerler

Her bariyer şunları taşır:

```js
{
  id, edgeKey, side, boundaryId, boundaryKey, sectionId,
  from, to, attached, spacing,
  endCaps: { start, end },
  free: { start, end, c1, c2 } | null
}
```

- Kenarlar: `rightOuter`, `rightInner`, `leftInner`, `leftOuter`.
- Normal yolda yalnız dış kenarlar geçerlidir; bölünmüş yolda iç kenarlar da kullanılabilir.
- Aynı kenarda en fazla iki bariyer normalize edilir/eklenir.
- `from`/`to` merkez çizgisi parametresidir ve en az yaklaşık `%2` aralık korunur.
- Yapışık bariyer seçilen boundary offset'ini takip eder.
- Serbest bariyer cubic Bezier'dir; başlangıç, bitiş, `c1`, `c2` ayrı kontrol noktalarıdır.
- Direk aralığı 18–180 aralığında clamp edilir.
- Uç durumu dört kombinasyon arasında döner: ikisi açık, yalnız bitiş kapalı, yalnız başlangıç kapalı, ikisi kapalı.
- Render üst ray ve direkleri ayrı path'ler olarak üretir; seçili bariyere kalın vurgu eklenir.

## Seçim ve hit-test

- Yol hit-test'i merkez çizgisine olan en yakın mesafeyi toplam kesit genişliğinin yarısı ve genel hit toleransıyla karşılaştırır; ada halka yarıçap aralığıyla test edilir.
- Bariyer hit-test'i yol yüzeyinden önce değerlendirilir.
- Yol edit modunda kısa tap kesit/bariyer seçimini değiştirir; sürükleme tüm yol geometrisini taşır.
- Yol sürüklenirken [[Kavşak Sistemi]] geçici olarak suspend edilir; sürükleme sonunda yeniden kurulur.
- Yollar çoklu seçime ve gruplamaya alınmaz. Ayrıntı: [[Seçim Sistemi#Çoklu seçim]].

## Katman davranışı

`EditorObjectManager.keepRoadLayersAtBack()` her ekleme, render sırası veya öne/arkaya alma sonrasında doğrudan yol nesne düğümlerini `#editorObjects` başına taşır. Bu nedenle yol için “Öne Getir” çağrısı kalıcı bir üst katman sonucu vermez. Kavşak kontur katmanı yol nesnelerinden sonra ama diğer nesnelerden önce yerleştirilir.

## Belirsiz

- `metadata.road.barrier` tekil legacy alanı normalize ediliyor, fakat güncel render `barriers` dizisini kullanıyor. Bu alanın gelecekteki amacı koddan kesinleşmiyor.
- `segments` genel yol segment listesi normalize ediliyor; güncel boundary render esas olarak `boundaryStyles[boundaryId].segments` kullanıyor. Legacy/gelecek uyumluluk rolü belirsiz.
- `bridge` ve `autoIntersection` config alanları destekleniyor, ancak mevcut Inspector/Builder bunları kullanıcıya açmıyor.


## Ekran merkezi ve taşıma hizalaması — 15.10.2026

- Çizim alanı ortasında 20 px kırmızı + bulunur. Bu, ekrana bağlı geçici (0,0) referansıdır; belge koordinatları ve kamera değiştirilmez. Pan/zoom ile dünya koordinatı değişir, ekrandaki konumu değişmez.
- Yardımcı HTML katmanı `editorCanvas` dışındadır; nesne/CP önizlemelerinin üstünde, tıklamaları geçiren katmandadır. SVG/PNG/JSON dışa aktarıma veya içerik bbox hesabına girmez.
- Yalnız bütün `road` nesnesi (ada `islandRing` dahil) sürüklenirken bbox merkezi kullanılır. Kontrol noktaları, diğer nesneler, gruplar, boyutlandırma, simetri ve döndürme etkilenmez. Sadece tıklama yakalamayı başlatmaz.
- Farede 12 px, dokunmada 18 px yaklaşım eşiği. X/Y bağımsız yakalanır; ikisi yakalanınca merkez + üzerindedir. Yakalanan eksende kırmızı kesikli çizgi gösterilir, hareket bitince veya yakalamadan çıkınca gizlenir.
- Merkez snap'i normal grid/uç snap hesabından sonra uygulanır; karar ham pointer hareketinden alınır. Yakalanan eksenlerde öncelik merkezdedir. Diğer eksen normal snap davranışını korur. Bu yardımcı grid görünürlüğünden bağımsızdır.
- Bbox ve kamera dönüşümü gesture başında bir kez hesaplanır. Kamera/alan boyutu gesture ortasında değişirse eski referansa snap edilmez, çizgiler temizlenir; sonraki sürükleme yeni referansı alır.
- Yeni yol/adanın bbox X merkezi ekranın Y ekseni üzerine yerleşir. Toolbar güvenliği için mevcut dikey yerleşim ve CP sığdırma korunur. Asimetrik virajlarda bbox X merkezi ile uçların orta noktası farklı olabileceğinden aday geometri, sığdırma kontrolünden önce X yönünde düzeltilir.
- Kaynaklar: `src/core/editorCenterGuide.js`, `selectionManager.js`, `roadBuilder.js`, `index.html`, `editor.css`.
- Test: `scripts/road-center-guide-browser.cjs`; pan/zoom/letterbox, portre/yatay, gerçek düz/arc/S/ada sürüklemeleri, snap önceliği, tek hesaplanan bbox, undo/redo, kayıt ve export. Eski CP/yol/kavşak testleri de korunur. Geri dönüş sürümü: `36cf256aceb1eabbfbf31453d833961eb3c6c063`.


### 2026-10-16 — hizalama snap önceliği
- Yol, çizgi, yay ve Bezier uç noktası taşınırken karşı uca yatay/dikey yaklaşma toleransı ekranda 10 pikseldir. Yakalanan eksende hizalama, ızgara/uç nokta snap değerini ezer; serbest eksen normal snap kullanır. Ctrl/Meta geçici olarak devre dışı bırakır. Bağlı çıkış yolunun bağlantı başlangıcı kendi host kuralını korur.
- Görünür ekran merkezi snap kapsamı bütün olarak taşınan daire, elips, dikdörtgen ve gerçekten kapalı çokgenleri de içerir. Açık şekiller ve kontrol noktası hareketleri dahil değildir.
- Merkezde tek eksen yakalanınca kesikli çizgi kırmızı; iki eksen birlikte yakalanınca iki çizgi mavi olur. Merkez artısı kırmızı kalır. Yardımcılar kayda veya SVG çıktısına girmez.


### 2026-10-16 — Ada girişlerinde otomatik kesikli banket çizgisi
Ada dış çapıyla örtüşme, normal yolun iç boundary çizgilerini artık silmez. Fiziksel ada iç çapının içinde kalan çizgiler gizlenir. Dış banket (`shoulder`) ile taşıt şeridi (`lane`) arasındaki edge çizgisi, ada iç/dış çapları arasındaki örtüşmede otomatik kesikli gösterilir. Şerit ayırıcı, orta refüj ve iç banket bu otomatik stil değişimine dahil değildir; banketsiz yolda şerit ayırıcı yanlışlıkla seçilmez.

Bu görünüm `islandMouthDashedRangesForLine` ile türetilir; kalıcı boundary segmentlerine yazılmaz. Kullanıcının `none` segmentleri, çizgi kalınlıkları ve örtüşme dışındaki stilleri korunur. Ada taşındığında/çapı değiştiğinde ve undo/redo/import sonrasında yeniden hesaplanır. Normal yol–yol kesişimleri ve Q dış kontur birleşimleri korunur; ada içeren karma kümelerde normal yol çiftlerinin kırpma kuralları ayrıca geçerlidir.

Doğrulama: `scripts/island-mouth-browser.cjs` (isteğe bağlı `KROKI_FIXTURE` imzalı SVG yolu), Q/cep/ayrılan yol smoke kontrolleri.


### 2026-10-17 — Kullanıcının seçtiği döner kavşak türü
Yeni eklenen ada `metadata.road.islandMode = "modern"` ile başlar. Eski kayıtta alan yoksa `classic` kabul edilir. Yan panelde yol profili düğmesi adada Modern/Döner tür geçişi yapar; geometri ve çaplar değişmez, işlem geçmişe girer. Tür çap/ölçek ile otomatik değişmez.

Modern mod önceki ada-yol kesişim temizliğini ve gerçek dış çemberi kullanır. Döner (`classic`) modunda iç yol çizgileri korunur; yalnız adaya bakan dış banket/şerit sınırı örtüşmede kesikli gösterilir. Karşı kenar korunur. Bağlı yolların örneklenmiş yüzeylerinden oluşturulan dış zarfın dışında kalan ada çizgileri kırpılır; fiziksel ada sınırı korunur. Bağlantısız ada düzenlenebilir tam halka olarak görünür. Seçim çemberi ve çap kontrol noktaları gerçek çapı göstermeye devam eder; bunlar çizim çıktısına dahil değildir. `classicEnvelope` ve taraf eşlemesi yalnız yeniden hesaplanan yüzey state'idir, belgeye yazılmaz.

Test: `scripts/roundabout-modes-browser.cjs`, `scripts/island-mouth-browser.cjs` ve Q/cep/ayrılan yol regresyonları.

## 19.10.2026 — Inspector performansı
Segment paneli mevcut düğmeleri ve odağı korur; değişen stil ikonu/başlığı güncellenir. Geçici yol seçim metadata değişiklikleri kavşak hesabını baştan çalıştırmaz. Yol modeli, şerit/segment davranışı ve kalıcı format değişmez. Ayrıntılar: [[Şerit Sistemi]], [[Performans Kriterleri]].

## 19.10.2026 — Normal yol şerit sınırı
Normal yol oluşturma ve düzenleme sınırı 20 oldu. Bölünmüş yolun mevcut düzenleme sayısı da her yön için en fazla 20 kabul eder. Ada (3) ve bağlı ayrılma yolu (2) özel sınırları korunur.
