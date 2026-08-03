# Trafik Levhası Sistemi

Trafik levhası sistemi üretilmiş SVG katalog verisini kategori grid'inde gösterir, seçilen levhayı canvas merkezine `trafficSign` nesnesi olarak ekler ve levhanın kendi SVG art'ını model metadata'sıyla birlikte render eder.

## İlgili kod dosyaları

- `src/data/traffic-signs-1-tanzim-levhalari.generated.js`: tanzim levhaları.
- `src/data/traffic-signs-2-uyari-levhalari.generated.js`: uyarı levhaları.
- `src/data/traffic-signs-3-bilgi-levhalari.generated.js`: bilgi levhaları.
- `src/data/traffic-signs-4-durma-ve-parketme.generated.js`: durma ve park etme levhaları.
- `src/data/traffic-signs-5-yapim-bakim-ve-onarim.generated.js`: yapım, bakım ve onarım levhaları.
- `src/data/traffic-signs-6-paneller.generated.js`: paneller.
- `src/data/traffic-signs-7-kaplama-isaretleri.generated.js`: kaplama işaretleri.
- `src/data/traffic-signs-kontrol-kesimi-custom.js`: yedekten geri alınan Kontrol Kesimi Levhası.
- `src/core/trafficSignCatalog.js`: normalize, ara, kategorize ve metadata üret.
- `src/ui/trafficSignLibrary.js`: kategori/list/grid/seçim/ekleme UI'si.
- `src/adapters/trafficSignAdapter.js`: model, SVG art, hit-test, dönüş ve metin uyarlaması.
- `src/core/styleManager.js`: levha ölçeği, dönüş açısı ve varsa metin UI'si.
- `index.html`: levha kütüphanesi ve sağ ray kontrolleri.

Bağlantılar: [[Menü Sistemi]], [[Nesne Sistemi]], [[Seçim Sistemi]], [[Serializer]], [[Sembol ve Asset Sistemi]].

## Katalog yükleme

Yedi generated dosya `window.KrokiTrafficSignCatalog` dizisine kayıtlarını push eder. Her kayıt tipik olarak:

```js
{
  key, code, name,
  category, categoryKey,
  file, width, height, viewBox,
  baseScale,
  svg,
  art
}
```

taşır. `art`, dış `<svg>` olmadan iç SVG grubu; `svg` tam kaynak string'idir. Çalışma zamanı katalog API'si yalnız `key` ve `art` olan kayıtları döndürür.

Mevcut katalog toplam 314 levha kaydı taşır.

## Kütüphane davranışı

- Kategoriler katalog sırasıyla listelenir ve levha adedi gösterir.
- Aktif kategorinin levhaları button grid'inde SVG önizleme olarak render edilir.
- Levha seçildiğinde tile state, footer adı ve “Tamam” düğmesi güncellenir.
- “Tamam”, canvas'ın mevcut viewBox merkezine nesne ekler.
- Ölçek başlangıcı kaydın `baseScale` değeridir.
- Ekleme sonrası nesne edit modunda seçilir, ray paneli kapanır ve kütüphane seçimi temizlenir.

## Model ve metadata

```js
{
  type: "trafficSign",
  geometry: { cx, cy, scale, rotation },
  label: { ... },
  metadata: {
    signKey, signCode, signName,
    signCategory, signCategoryKey,
    signFile, signViewBox,
    signWidth, signHeight,
    signBaseScale, signArt,
    signTextInitialized
  }
}
```

Adapter önce canlı katalogda `signKey` arar; modelin metadata'sı bağımsız render için gerekli art ve ölçüleri de taşır. Bu nedenle serialize edilen levha, generated katalog bulunmasa dahi metadata'daki `signArt` ile render edilebilir.

## Render ve geometri

- `signArt` bir geçici SVG gruba `innerHTML` ile parse edilir ve levha `<g>` öğesine taşınır.
- ViewBox/width/height kullanılarak art merkeze alınır; model `translate + rotate + scale + translate` dönüşümü alır.
- Hit-test gerçek SVG path geometrisi yerine levha ölçülerinden türetilen dairesel yarıçapla yapılır.
- Seçim de dairesel görseldir.
- Tek kontrol noktası rotation içindir; nesne taşıma merkezi değiştirir.

## Ölçek ve dönüş UI'si

- Sağ ray yüzde ölçek input'u gösterir; `100`, `signBaseScale` değeridir.
- +/- yüzdeyi 1 puan değiştirir; en az `%1`.
- Geometri scale'i genel olarak `0.005`–`4` aralığında clamp edilir.
- Dönüş +/- 1 derece ve `-180..180` normalize edilmiş input ile yönetilir.
- Bu kontroller tekli levha için çalışır; `StyleManager` çoklu seçimde güncellemeyi reddeder.

## Düzenlenebilir levha metni

Adapter levha art'ındaki `<text>` öğelerini tarar. Tek glyph olmayan metin run'larını birleştirerek varsayılan label metnini çıkarır. Model label metni render sırasında mevcut text run'larına dağıtılır. Trafik levhası metni diğer nesnelerden farklı olarak otomatik büyük harfe çevrilmez.

Levha text içermiyorsa metin düğmesi gizlenir. Varsa yalnız ilgili levha metni paneli açılır; standart text size/hizalama/renk kontrollerinin bir kısmı levha için gizlenmiştir.

## Serializer ilişkisi

Katalog art'ı metadata içinde bulunduğu için belge JSON'u büyük olabilir. Serializer metadata'yı genel plain clone ile taşır; levhaya özel küçültme/dedup yapmaz. Ayrıntı: [[Serializer]].

## Belirsiz

- Generated katalogların hangi script/iş akışıyla yeniden üretildiği depoda görünmüyor.
- Levha içi `<text>` değiştirme, birden çok farklı semantik text alanı olan levhalarda bütün run'ları tek label metni olarak ele alır. Katalogdaki tüm levhalar için beklenen düzenleme davranışı doğrulanmamıştır.
- Katalog SVG'sinin güvenilir build-time veri olduğu varsayılıyor. Dış belge importunda `signArt` güven modeli tanımlı değildir.
