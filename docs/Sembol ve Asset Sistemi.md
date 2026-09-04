# Sembol ve Asset Sistemi

Bu sayfa trafik levhaları dışındaki katalog varlıklarını da kapsayan genel asset kılavuzudur. Amaç, yeni levha, araç veya sembol eklerken düşük performanslı Android tablet hedefini bozmadan aynı adapter/katalog mimarisini sürdürmektir.

Bağlantılar: [[Trafik Levhası Sistemi]], [[Nesne Sistemi]], [[Menü Sistemi]], [[Serializer]], [[Performans Kriterleri]].

## Katalog nesnesi modeli

Katalog tabanlı nesneler canvas'a ham SVG olarak değil, ortak model olarak eklenir:

```js
{
  type: "trafficSign" | "otherSymbol" | "vehicle",
  geometry: { cx, cy, scale, rotation },
  metadata: { ...catalogIdentityAndArt }
}
```

`trafficSign` ve `otherSymbol` adapter'ları SVG art'ı metadata içinde taşır. `vehicle` ise generated JS içindeki path tanımlarını variant metadata'sı ile eşleştirir.

Üç katalog tipi de adapter'da `gridSnap: false` bildirir. Snap açık olsa da tekil veya henüz gruplanmamış çoklu seçim içinde serbest hareket ederler. Semantic gruba alındıklarında grup bağımsız bir dönüşüm birimidir; grup taşıma ve CP resize snap'i kullanırken üyelerin göreli konumları korunur. Bu izin belge modeline veya kayıt formatına eklenmez.

## Trafik levhaları

Dosyalar:

- `src/data/traffic-signs-1-tanzim-levhalari.generated.js`
- `src/data/traffic-signs-2-uyari-levhalari.generated.js`
- `src/data/traffic-signs-3-bilgi-levhalari.generated.js`
- `src/data/traffic-signs-4-durma-ve-parketme.generated.js`
- `src/data/traffic-signs-5-yapim-bakim-ve-onarim.generated.js`
- `src/data/traffic-signs-6-paneller.generated.js`
- `src/data/traffic-signs-7-kaplama-isaretleri.generated.js`
- `src/data/traffic-signs-kontrol-kesimi-custom.js`
- `src/core/trafficSignCatalog.js`
- `src/ui/trafficSignLibrary.js`
- `src/adapters/trafficSignAdapter.js`

Mevcut katalog toplam 314 levha kaydı taşır.

Her kayıt şu alanları taşımalıdır:

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

`art`, dış `<svg>` yerine iç render grubudur. Adapter önce canlı katalogda `signKey` arar, bulamazsa metadata içindeki `signArt` ile render eder. Bu sayede kayıtlı belge, katalog dosyası değişse bile kendi art'ını taşıyabilir.

## Diğer semboller

Kütüphanedeki seçim geribildirimi trafik levhalarıyla ortaktır: seçilen `.catalog-tile`, `is-selected` sınıfı ve `aria-pressed="true"` durumu ile açık zemin, ince vurgu halkası ve sağ alttaki onay rozeti kazanır. Bu durum JavaScript'te yeni bir seçim modeli oluşturulmadan, `src/editor.css` içindeki trafik levhası/sembol ortak kurallarıyla çizilir.

Dosyalar:

- `svg diğer semboller kaynağı.xml`
- `scripts/generate-other-symbol-catalog.mjs`
- `src/data/other-symbols.generated.js`
- `src/core/otherSymbolCatalog.js`
- `src/ui/otherSymbolLibrary.js`
- `src/adapters/otherSymbolAdapter.js`

Mevcut generated katalog 40 semboldür. Kategoriler insan, hayvan ve çevre elemanlarıdır.

Generator kaynak XML içindeki SVG tanımlarını okur, her sembole şu metadata'yı verir:

- `data-other-symbol-key`
- `data-other-symbol-name`
- `data-other-symbol-category`
- `data-other-symbol-base-scale`
- `data-source-var`
- `data-source-index`
- `shape-rendering="geometricPrecision"`

`baseScale`, sembolün büyük boyutunu yaklaşık 50 SVG birimine oturtacak şekilde hesaplanır. Yeni sembol eklenirken bu ölçü mantığı korunmalıdır; elle key/scale yazmak yerine generator tercih edilmelidir.

## Araçlar

Dosyalar:

- `ARAÇLAR/.../top.svg`
- `ARAÇLAR/.../side.svg`
- `ARAÇLAR/.../upsideDown.svg`
- `scripts/generate-vehicle-catalog-data-from-assets.mjs`
- `src/data/vehicle-catalog-data.js`
- `src/core/vehicleCatalog.js`
- `src/ui/vehicleLibrary.js`
- `src/adapters/vehicleAdapter.js`

Araç asset klasörü tür ve varyant klasörlerinden oluşur. Her varyant en az `top.svg` taşımalıdır. `side.svg` ve `upsideDown.svg` varsa ilgili görünüm desteklenir.

Araç SVG path'lerinde kullanılan önemli attribute'lar:

- `data-kroki-role`: `body`, `frame`, `window`, `wheel`, `solid`, `detail` gibi render rolü.
- `data-kroki-fill="vehicle"`: kullanıcı araç renginin bu path'e uygulanacağını belirtir.
- `data-kroki-default-color`: varyant varsayılan rengi.
- `data-kroki-length-m`, `data-kroki-width-m`, `data-kroki-height-m`: nominal gerçek ölçüler.
- `data-kroki-ghost`: temsili görünümde korunacak veya değişecek path davranışı.

Generator, SVG path'lerini JS nesnelerine çevirir. Runtime'da adapter bu path'leri yeniden SVG olarak üretir; dış dosya yüklemez.

## Yeni sembol ekleme ilkeleri

- Katalog nesnesi yeni bir generic `closedShape` veya `path` yığını olarak eklenmemelidir.
- Her sembol kararlı `key`, insan okunur `name`, kategori ve `viewBox` taşımalıdır.
- Ölçek varsayılanı `baseScale` üzerinden gelmelidir.
- Canvas üzerinde nesne `cx/cy/scale/rotation` ile yönetilmelidir.
- Hit-test mümkünse karmaşık path üzerinden değil, adapter'ın basit bounds/radius yaklaşımıyla yapılmalıdır.
- Preview DOM'u panel açılınca üretilmeli ve cache'lenmelidir.
- Generated dosyalar elle düzenlenmemeli; kaynak asset + generator yolu tercih edilmelidir.

## SVG karmaşıklık sınırı

Düşük Android tablet hedefi nedeniyle yeni asset'lerde şu kurallar tercih edilmelidir:

- Çok sayıda ayrı path yerine mantıklı birleşik path kullan.
- Gereksiz metadata, editor-specific export artıkları, görünmez path ve clip/filter bırakma.
- `filter`, blur, mask, pattern, embedded image ve dış URL kullanma.
- Gereksiz transform zincirlerini sadeleştir.
- Path koordinatlarını aşırı ondalıkla şişirme.
- Sembol başına yüzlerce node üretmekten kaçın.
- Renkleri mümkün olduğunca sabit fill/stroke veya araçlarda `vehicle` rolüyle yönet.

## Metin içeren semboller

Traffic sign ve other symbol adapter'ları art içindeki `<text>` öğelerini bulabilir. Bu metinler tek label metnine indirgenir ve render sırasında text run'larına dağıtılır.

Sınırlamalar:

- Birden çok semantik metin alanı olan levhada tüm alanlar tek label gibi davranabilir.
- Dış belgeden gelen `signArt` veya `symbolArt` güvenilir kabul edilmemelidir.
- Metin düzenleme desteklenecekse katalogdaki text yapısı sade ve öngörülebilir olmalıdır.

## Offline paket kuralı

Uygulama offline çalışmalıdır. Yeni asset veya ikon için CDN, remote image, web font, API veya runtime network fetch eklenmemelidir. Tüm görsel kaynaklar repo içinde ya generated JS'e gömülü ya da local dosya olarak paketlenmiş olmalıdır.
