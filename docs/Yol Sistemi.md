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

`start` ve `end` arasında doğrusal enterpolasyon yapılır. Başlangıç/bitiş kontrol noktaları çizgi snap sistemini kullanır.

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
- Normal şerit sayısı: 1–5.
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
