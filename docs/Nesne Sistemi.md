# Nesne Sistemi

Nesne sistemi bütün çizilebilir öğeleri ortak bir model ve adapter sözleşmesinde birleştirir. `EditorObjectManager` belge state'inin çalışma zamanı sahibi, `ShapeRegistry` tip yönlendiricisi, `StyleManager` ise ortak stil/metin normalizasyon katmanıdır.

## İlgili kod dosyaları

- `src/core/shapeRegistry.js`: adapter registry ve ortak SVG/geometri yardımcıları.
- `src/core/editorObjectManager.js`: model/DOM map'leri, CRUD, render, label ve katman sırası.
- `src/core/styleManager.js`: stil, dolgu pattern, ok marker ve metin UI'si.
- `src/editor-stroke-style.js`: stroke/dash/opacity/line-cap temelleri.
- `src/adapters/*.js`: tip davranışları.
- `src/geometry/*.js`: line, circle, ellipse ve rectangle geometri yardımcıları.

Bağlantılar: [[Seçim Sistemi]], [[Kontrol Noktaları]], [[Serializer]], [[Undo Redo]], [[Sembol ve Asset Sistemi]].

## Ortak model

```js
{
  id: "obj_...",
  type: "line" | "road" | ...,
  geometry: {},
  style: {},
  label: {},
  metadata: {}
}
```

`normalizeModel()` bütün alanları plain JSON clone yapar; style ve label tip bilgisiyle normalize edilir. Kimlik yoksa zaman + sayaç tabanlı `obj_...` üretilir.

## Adapter sözleşmesi

Adapter'ların fiilî ortak yüzeyi:

- `elementTag`, `className`, `capabilities`
- `create(initialData)`
- `readFromElement(element)`
- `render(model, element)`
- `hitTest(model, point, tolerance, element)`
- `getControlPoints(model, metrics, mode)`
- isteğe bağlı `beginControlPointMove(...)`
- `moveControlPoint(...)`, `move(model, dx, dy)`
- `getBounds(model)`, `clone(model)`
- `createSelectionElement()`, `renderSelection(...)`

Çizgi benzeri adapter'lar ayrıca `pointAt`, `offsetPathData`, `midpointTangentAngle`; yol adapter'ı çok sayıda yol/kesit yardımcı metodu açar.

`capabilities`, sağ rayın davranışını belirler: `arrows`, `fill`, `curvedLabel`, `ownsLabel`, `textObject`, `textFormatting`, `noText`, `pointEdit`, `roadObject`, `trafficSign`, `otherSymbol`, `catalogObject`.

## Manager davranışları

- `objectMap` modelin, `elementMap` ana SVG elementinin canlı referansını tutar.
- `create` adapter'a model ürettirir; `addRaw` DOM öğesi kurar ve render eder.
- `updateModel` clone → updater → normalize → tam render yapar.
- `updateGeometry` canlı modeli mutator ile değiştirir ve geometri/label render eder.
- `remove` label/defs kalıntılarını, grup üyeliğini ve seçimi temizler.
- `clone` adapter clone'unu üretir, yeni kimlik verir ve nesneyi `(18, 18)` taşır.
- Çoğu mutasyon otomatik [[Undo Redo]] transaction'ı içindedir.

## Katman sırası

Belge sırası SVG DOM sırasıdır. Hit-test önce normal öğe/yol arka-katman sınıfını, sonra ekran-pikseli cinsinden yakınlık kademesini, eşit kademede ise ters DOM sırasını kullanır. Böylece yollar arkada kalır; diğer üst nesneler yalnız aynı yakınlıktaki adaylar arasında önce yakalanır.

- Tek nesne “Öne Getir” ana element ve manager'ın ürettiği label düğümlerini sona append eder.
- “Arkaya Gönder” bunları katmanın başına koyar.
- Ardından grup DOM'u yeniden kurulur ve bütün doğrudan yol düğümleri en arkaya zorlanır.
- Çoklu öne alma DOM sırasıyla, arkaya gönderme ters DOM sırasıyla yapılır; göreli seçim sırası korunmaya çalışılır.
- Kavşak katmanı yolların üstünde, normal nesnelerin altındadır.

Yol nesneleri gruplamaya alınmadığı için grup ağacı ile zorunlu yol-arka kuralı çakışmaz.

## Ortak stil sistemi

Normalize edilen stil alanları:

```js
{
  stroke, fill, strokeWidth,
  opacity, strokeOpacity, fillOpacity,
  fillPattern,
  dash, dashSize, dashGap,
  lineCap,
  arrowStart, arrowEnd
}
```

- Genel dash: `solid`, `dash`, `dot`.
- Line cap: `round`, `butt`.
- Ok marker: `none`, `triangle`, `triangle2`, `bar`, `trianglewithbar`, `circle`.
- Dolgu pattern: `none`, `paver`, `paverTexture`, `pavement`, `grass`, `grassFine`, `grassDense`, `grassPatch`, `median`, `gravel`, `soil`, `soilRocky`.
- Marker ve pattern `<defs>` düğümleri model kimliği/stil ile üretilir; kullanılmayan tanımlar temizlenir.

Çoklu seçimde stil patch'i her adapter'ın capability'lerine göre filtrelenir. Grup birimi içeren seçimlerde ortak stil uygulanmaz.

## Ortak label sistemi

Label alanları: `text`, `size`, `color`, `opacity`, `position`, `bold`, `italic`, `underline`; çizgi ailesinde ayrıca `colorLinked`.

- Trafik levhası ve diğer sembol dışındaki metinler Türkçe locale ile büyük harfe normalize edilir.
- Line/arc/bezier label'ı çizgi üstü/üstünde/altında ve başlangıç/orta/son konum alır. Eğri label'lar gizli path üzerinde `textPath` kullanır.
- Çizgi ailesi label rengi varsayılan olarak stroke rengini takip eder. Kullanıcı metin rengini farklı seçerse `colorLinked` kapanır; metin tekrar stroke rengine ayarlanırsa bağ yeniden kurulur. Bu durum `data-label-color-linked` ve belge modeliyle kalıcıdır.
- Circle/ellipse/rectangle label'ları şekil içine satır kırarak, clip path ile taşmayı keserek yerleştirilir; sol/orta/sağ hizalama, kalın, italik ve altı çizili biçimleri belgeyle birlikte kalıcıdır.
- Circle label'ı şekille dönebilir veya yatay kalabilir.
- `text`, `callout`, `trafficSign` ve `otherSymbol` kendi label render'ını adapter içinde yapar (`textObject` veya `ownsLabel`).
- `road` ve `closedShape` `noText` nedeniyle ortak label üretmez.

## Tip davranışları

### Line

`start/end` doğrusu; iki endpoint kontrolü, snap, oklar, dash/stroke ve düz label destekler.

### Arc

`start/end/ratio` ile dairesel yay; endpoint + curve kontrolü, oklar ve eğri label destekler. Geçersiz çember hesabında doğrusal fallback kullanır.

### Bezier

Quadratic (`q`) veya cubic (`c1/c2`); endpoint ve curve kontrolleri, oklar ve eğri label destekler.

### Circle

`cx/cy/r/rotation`; radius handle'ı hem radius hem yön açısını değiştirir. Dolgu, pattern ve iç label destekler.

### Ellipse

`cx/cy/rx/ry/rotation`; dört köşe resize + rotate. Dolgu varsa iç alan, yoksa stroke bandı hit-test edilir.

### Rectangle

Ellipse ile aynı merkez-yarıçap-rotation modelini kullanır. Köşe handle'ları görsel sınırın dışına offsetlidir. Dolgu/pattern ve iç label destekler.

### Metin

`geometry: { x, y, rotation }`; label asıl içerik/stildir. Çok satır, sol/orta/sağ hizalama ve kalın/italik/altı çizili destekler. Bounding box gerçek font ölçümü yerine karakter sayısı × boyut katsayısıyla yaklaşık hesaplanır. Yalnız rotate kontrol noktası vardır. IP sırası metin girişi, metin özellikleri, metin boyutu ve dönüş şeklindedir; ortadaki composer yalnızca metin girişini taşır.

### Callout

`center` metin kutusu, `tip` ok ucudur. Kırmızı leader/çerçeve, normal çizgideki `triangle2` (kırık üçgen) ok ucu ve daima beyaz, hafif yuvarlatılmış kutu varsayılandır. Yeni callout stroke kalınlığı `2` ile başlar. Leader, kalın stroke değerlerinde ok dolgusunun arkasından taşmaması için gerçek uçtan önce ve üçgenin içinde biter. Adapter metni ölçmek için geçici gizli SVG text kullanır; ölçümü `metadata.calloutBox` ile metin ve stroke kalınlığına bağlı signature üzerinden cache'ler. Stroke büyüdüğünde kutunun iç boşluğu da yarım stroke kadar genişleyerek çerçevenin metni örtmesini engeller. Leader ve kutu çerçevesi aynı `vector-effect` kuralını kullandığından zoom ve export ölçeğinde eşit kalınlıkta kalır. İki kontrol noktası kutu merkezini ve oku taşır; ayrı bir rotate picker kullanılmaz. Leader dash stili, yuvarlak/küt çizgi ucu ve metin biçimleme desteklenir.

### Kapalı şekil

Bir dizi `points`; her segment için quadratic `controls`; `closed` ve döndürülmüş `frame` taşır. Normal modda resize/rotate, nokta düzenleme modunda tüm `pN/qN` noktaları görünür. Ortak metin desteklemez. IP’deki nokta düzenleme düğmesi etkin durumda onay tikine dönüşür ve ikinci tıklama `metadata.pointEdit` durumunu kapatır. Üretim akışı: [[Editör#Kapalı şekil taslağı]].

### Yol

Kendi config/kesit ve kontrol davranışına sahiptir. [[Yol Sistemi]], [[Şerit Sistemi]].

### Trafik levhası

Katalog SVG art'ını kendi `<g>` öğesi içinde render eder; `cx/cy/scale/rotation` geometrisidir. [[Trafik Levhası Sistemi]].

### Diğer sembol

İnsan, hayvan ve çevre elemanları katalog art'ını kendi `<g>` öğesi içinde render eder; `cx/cy/scale/rotation` geometrisidir. Teknik tipi `otherSymbol` olarak ayrıdır, ancak sağ panelde levha ile aynı katalog ölçek/dönüş kontrollerini paylaşır.

Katalog asset sözleşmeleri ve yeni sembol ekleme kuralları: [[Sembol ve Asset Sistemi]].

## Grup sistemi

`GroupManager` grup kayıtlarını ayrı `Map` içinde tutar:

```js
{ id: "grp_...", name, children: [objectId | groupId], metadata }
```

- Grup en az iki doğrudan çocuk gerektirir.
- Yol grup çocuğu olamaz.
- İç içe grup desteklenir; döngü ve kendini içerme engellenir.
- Bir çocuk yeni gruba taşınırken diğer gruplardan ayrılır; iki çocuğun altına düşen grup otomatik kaldırılır.
- Nesne silinince grup üyeliği temizlenir ve geçersiz üst gruplar zincirleme kaldırılabilir.
- `metadata.frame` grup merkez/genişlik/yükseklik/rotation bilgisini saklar.
- DOM grupları model kayıtlarından yeniden kurulur; grup kayıtları serialize edilir.

Grup etkileşimi: [[Seçim Sistemi#Gruplar]].

## Belirsiz

- Text bounding box font metriklerini yaklaşıklar; `Arial Narrow` dosyası depoda olsa da text adapter `Roboto, Arial, sans-serif` kullanır. Font dosyasının mevcut rolü koddan görünmüyor.
- Manager `syncFromDom()` legacy SVG öğelerini modele alabilir; bunun kullanıcıya açık SVG import özelliğiyle nasıl bağlanacağı henüz tanımlı değildir.
