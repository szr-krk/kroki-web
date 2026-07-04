# Kavşak Sistemi

Kavşak sistemi, ayrı bir “kavşak nesnesi” oluşturmaz. Uygun yol modellerinin örneklenmiş yüzeylerini karşılaştırır, çakışma bölgelerini ve birleşik dış sınırı türetir, yol çizgilerinin kavşak içinde görünmeyecek parçalarını keser. Sonuçlar `#roadIntersectionContourLayer` içinde çizilir.

## Devralma özeti

Kavşak motoru yol nesnelerini değiştirmez; yol yüzeylerinden türetilmiş geçici state üretir. Bu state her refresh'te yeniden hesaplanır. Kalıcı belgeye yalnız kullanıcının Q düzenleme farkları girer. Bu yüzden kavşak düzeltmesi yaparken “kavşak nesnesini düzenle” diye bir yer arama; doğru yer ya `roadAdapter`ın yol çizgisi/auxiliary contour üretimi ya da `roadIntersectionEngine`in surface/union/clip zinciridir.

Engine'in ana görevi üç şeyi aynı anda dengede tutmaktır:

- Yol dış edge'lerini kavşakta tek ortak kontura çevirmek.
- Lane, banket ve shoulder çizgilerini sadece görünmesi gereken aralıklarda bırakmak.
- T/Y terminal kavşaklarda yan kolun karşı tarafta sahte yol ağzı üretmesini engellemek.

## İlgili kod dosyaları

- `src/core/roadIntersectionEngine.js`: bütün algılama, union contour, smoothing, Q düzenleme ve state.
- `src/adapters/roadAdapter.js`: yol yüzeyi/offset path verisi, çizgi kırpma çağrısı ve kavşak üyesi dış edge davranışı.
- `src/core/editorObjectManager.js`: kontur katmanının yol/normal nesne sırasını korur.
- `src/core/documentSerializer.js`: Q düzenlemelerini `roadIntersection` alanında kaydeder.
- `src/core/historyManager.js`: Q sürüklemelerini geçmişe alır.

Bağlantılar: [[Yol Sistemi]], [[Şerit Sistemi]], [[Serializer]], [[Undo Redo]], [[Kontrol Noktaları]].

## Hangi yollar katılır

`collectRoads()` bütün `road` modellerini DOM sırasından toplar. Bir yol aşağıdaki durumlarda yüzey üretmez:

- `metadata.road.autoIntersection === false`
- `metadata.road.bridge === true`
- Adapter/model eksik veya örneklenebilir bir merkez çizgisi yok

Bu iki config alanı UI'da görünmez; dışarıdan model/import ile ayarlanabilir.

## Yüzey üretimi

- Her yol merkez çizgisi 96 adımda örneklenir.
- Toplam enkesit genişliği config'ten yeniden hesaplanır.
- Merkez örnekleri normal yönünde `± width / 2` ötelenir.
- Sol noktalar ve ters sağ noktalar kapalı bir polygon oluşturur.
- Ada profili kapalı terminali olmayan halka yolu olarak işaretlenir; mevcut yüzey polygon hesabı dış/sağ örnek dizilerinden yürür.
- Düz/arc/S yollarında başlangıç/bitiş köşeleri ve merkezleri terminal bilgisi olarak saklanır.

## Kavşak algılama davranışı

Her yol çifti için:

1. Önce genişletilmiş bounding box çakışması kontrol edilir.
2. Polygon iç noktaları ve segment kesişimleri toplanır.
3. En az üç nokta varsa convex hull çıkarılır.
4. Terminal bir yol başka yolun kenarında bitiyorsa hull, host yolun açık tarafına kırpılır.
5. Hull merkezden 1.5 SVG birimi genişletilir.
6. İki yol `memberIds` kümesine, hull `lastIntersectionShapes` listesine eklenir.

Algoritma pairwise çalışır. Üç veya daha fazla yolun ortak kavşağı birden çok pair shape ve bunlardan türetilen ortak dış boundary ile temsil edilir.

## Ana refresh akışı

1. `collectRoads()` DOM sırasındaki bütün uygun yol modellerini toplar.
2. `buildSurface()` her yol için örneklenmiş polygon, left/right edge noktaları, terminal merkezleri ve dış edge stil bilgisini üretir.
3. `findIntersectionShapes()` yol çiftlerini bounding box, polygon iç noktaları ve segment kesişimleriyle değerlendirir.
4. Terminal bağlantı varsa hull host yolun açık tarafına kırpılır.
5. Üye yollar `memberIds` olarak işaretlenir.
6. `buildOuterContours()` üye yol yüzey segmentlerini diğer yüzeylerle bölüp içeride kalanları atar.
7. Start/end cap parçaları dış konturdan çıkarılır; yol ağzı açık kalır.
8. Boundary segmentleri yakın uçlardan path'lere toplanır.
9. Q smoothing uygulanır ve kullanıcı Q edit farkları eşleştirilir.
10. Üye yollar yeniden render edilir; dış edge'ler adapter tarafından atlanır.
11. Cep gibi auxiliary contour'lar toplanır, smoothing ve Q etkileşimi eklenir.
12. Kontur katmanı yol nesnelerinin üstünde, normal nesnelerin altında çizilir.

Bu akışın davranışını değiştiren her çalışma T/Y kavşak, ada, cep, bölünmüş yol, banket ve Q edit senaryolarıyla test edilmelidir.

## Dış kontur üretimi

- Üye yüzey polygonlarının bütün kenarları diğer yüzey polygonlarıyla kesişim noktalarında bölünür.
- Başka bir yolun içinde kalan segmentler atılır.
- Terminal bağlantının kapalı/ters tarafındaki yapay sınırlar atılır.
- Yol başlangıç ve bitiş cap segmentleri özellikle dış konturdan çıkarılır; yol ağzı açık kalır.
- Kalan segmentler yakın uçlardan birleştirilerek açık veya kapalı boundary path'lerine dönüştürülür.
- Gürültü azaltma ve Ramer–Douglas–Peucker benzeri sadeleştirme uygulanır.

`lastOuterBoundarySegments`, kaynak yol kimliği, dış boundary kimliği (`b0` veya son `bN`), kaynak `t` aralığı ve boundary stilini taşır. Böylece birleşik kontur, ilgili yolun edge stil/segment ayarını koruyabilir.

## Köşe yumuşatma ve Q parçaları

Birleşik boundary'nin kavşak köşeleri quadratic Bezier (`Q`) parçalarıyla yumuşatılır.

- Varsayılan yarıçap 18 SVG birimidir.
- Açı filtresi yaklaşık 24°–158° aralığındaki uygun köşeleri kabul eder.
- Gerçek intersection hull noktaları smoothing için ipucudur.
- Yol terminal köşeleri bloklayıcı ipucu olarak kullanılır; her keskin köşe körlemesine yuvarlanmaz.
- Açık ve kapalı konturlar için ayrı smoothing akışları vardır.

Her Q parçası `entry`, `control`, `exit`, travel track/cut bilgisi ve geometri tabanlı `key` taşır.

## Q düzenleme davranışı

- Q çizgisine tap seçim durumunu açar/kapatır.
- Seçili Q için kontrol, giriş ve çıkış tutamaçları görünür.
- Kontrol tutamacı `controlDx/controlDy` farkını değiştirir.
- Giriş/çıkış tutamaçları boundary travel track üzerindeki `entryCut/exitCut` değerini değiştirir.
- Tüketilen boundary parçaları Q çevresinde gizlenir; Q curve ayrı stil ile çizilir.
- ViewBox değişiminde tutamaç yarıçapları ekran pikseli sabit kalacak şekilde yeniden hesaplanır.
- Canvas'ta Q etkileşim hedefi dışına tap Q seçimini bitirir.
- Bir sürükleme tek “Kavsak Q duzenle” geçmiş işlemidir.

## Yol çizgilerinin kırpılması

`roadAdapter.addStyledLine()` her çizgi segmenti için `visibleRangesForLine()` çağırır. Engine yolu 120 örnek temelinde kavşak shape'lerinin içinde/dışında sınar; geçişleri binary refinement ile yaklaşıklar ve yalnız dışarıda kalan `t` aralıklarını döndürür.

Kavşak üyesi yolun gerçek dış edge'leri adapter tarafından tamamen atlanır; ortak dış kontur engine tarafından çizilir. Banket ile taşıt yolu arasındaki iç `edge` çizgileri korunur.

Cep gibi auxiliary contour'lar da kavşakla uyumlu kalmalıdır. Cep dış konturu ana yolun dış edge'ini kullanıyorsa, host edge parçası engine'in `visibleRangesForLine()` sonucuyla aynı görünür aralıklara uymalıdır; aksi halde cep eklenince kavşak içinde karşı yola taşan eski dış edge parçaları görülebilir.

## Yenileme ve manager entegrasyonu

Engine yüklenirken `EditorObjectManager`ın `create`, `add`, `updateModel`, `updateGeometry`, `remove`, `clear`, `replaceAll` metotlarını wrapper ile sarar. Mutasyonlar `requestAnimationFrame` üzerinden tek refresh zamanlar. Engine kendi road rerender'ı sırasında tekrar refresh üretmemek için `renderingRoads` bayrağı kullanır.

Yol sürüklenirken `setSuspended(true)` katmanı ve üye sınıflarını temizleyebilir; sürükleme bittiğinde refresh edilir. Bu, canlı sürüklemede pahalı pairwise hesabı engeller.

## Kaydedilen durum

`exportState()` yalnız manuel Q farklarını kaydeder:

```js
{
  version: 1,
  qEndpointEdits: [
    { key, entryCut?, exitCut?, controlDx?, controlDy? }
  ]
}
```

Türetilmiş surface, shape, contour ve üyelik verileri kaydedilmez; importtan sonra yeniden hesaplanır. Ayrıntı: [[Serializer#Kavşak durumu]].

## Tanılama API'si

`RoadIntersectionEngine` son hesapları okumak için `getLastRoadSurfaces`, `getLastOuterContours`, `getLastIntersectionShapes`, `getLastSmoothedContours`, `getLastQSegments` metotlarını sunar. `setDebug(true)` raw contour ve intersection shape çizimlerini açar. UI'da debug anahtarı yoktur.

## Belirsiz

- Q düzenleme anahtarı yuvarlanmış geometri noktalarından üretilir. Yol geometrisi önemli ölçüde değiştiğinde eski edit kaydının yeni Q ile eşleşip eşleşmemesi garanti edilmez; eşleşmeyen kayıtlar state içinde kalabilir.
- Pairwise hull yaklaşımının çok yakın paralel yollar, yoğun çoklu kavşaklar ve ada halkasıyla tüm topolojik sonuçları ürün beklentisine göre doğrulanmamıştır.
- Kavşak için ayrı semantic nesne/kimlik yoktur; “hazır kavşak”, seçme, kopyalama veya tek başına silme davranışı mevcut mimaride tanımlı değildir.

## Kullanıcı Davranış Kuralları

### Y / T Kavşak Kuralı

Yandan gelen yol kolu, diğer yolun karşısına tamamen geçmediği sürece 4 kollu kavşak sayılmaz.

Bu durumda yan kolun uzantıları yalnızca:

- Yaklaştığı taraftaki yol kenar çizgisini
- Varsa yaklaştığı taraftaki banket çizgisini

etkileyebilir.

Yan kol:

- Karşı taraftaki dış konturu etkilememelidir.
- Karşı taraftaki banket çizgisini etkilememelidir.
- Karşı tarafta yeni yol ağzı oluşturmamalıdır.

Bu davranış sağlanmıyorsa hata kabul edilir.
