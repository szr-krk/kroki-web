# Şerit Sistemi

Şerit sistemi ayrı nesneler üretmez. Yolun enkesiti `metadata.road` içindeki genişlik dizilerinden hesaplanır; `roadAdapter.crossSection()` lane, banket, iç banket ve su kanalı bölümlerini sağdan sola sıralar ve aralarındaki boundary'leri `b0`, `b1`, ... olarak adlandırır.

## İlgili kod dosyaları

- `src/adapters/roadAdapter.js`: config normalizasyonu, enkesit, lane seçimi ve boundary render.
- `src/ui/roadBuilder.js`: ilk lane sayısı/genişliği.
- `src/ui/roadInspector.js`: lane/kesit genişliği ve çizgi segment UI'si.
- `src/core/roadIntersectionEngine.js`: kavşakta boundary görünür aralıklarını keser ve dış kontur stilini taşır.

Bağlantılar: [[Yol Sistemi]], [[Kavşak Sistemi]], [[Kontrol Noktaları]].

## Road config alanları

- `laneCount`: normal yolda lane dizisi uzunluğu; bölünmüş yolda her yönün lane adedi.
- `laneWidth`: toplu değişikliklerde kullanılan varsayılan/genel genişlik.
- `laneWidths`: normal yolun bölüm genişlikleri.
- `dividedLaneWidths.left`, `dividedLaneWidths.right`: bölünmüş yolun yön bazlı genişlikleri.
- `leftShoulder`, `rightShoulder`: `{ enabled, width }`.
- `innerShoulder`: bölünmüş yolun iki yanında aynı config ile iki ayrı kesit oluşturur.
- `waterChannel`: bölünmüş yolun ortasında tek kesit.
- `marking`: varsayılan iç çizgi `{ style, width }`.
- `edgeLine`: dış/kenar çizgisi `{ enabled, width }`.
- `boundaryStyles`: boundary kimliğine göre override ve segment listesi.

Şerit adedi 1–5, şerit/kesit genişliği 10–180 arasında normalize edilir. Ada lane adedi 1–3'tür; dış çap toplam lane genişliğinin iki katı kadar iç çaptan büyüktür.

## Enkesit üretimi

`crossSection(config)` şu sırayı kullanır:

### Normal yol

1. Etkin sağ banket
2. `laneWidths[0..n]`
3. Etkin sol banket

### Bölünmüş yol

1. Etkin sağ banket
2. `dividedLaneWidths.right[0..n]`
3. Sağ iç banket
4. Su kanalı
5. Sol iç banket
6. `dividedLaneWidths.left[0..n]`
7. Etkin sol banket

Toplam genişliğin negatif yarısından başlayan offset, her kesit genişliği kadar ilerler. Her kesite:

- `id`, `role`, `side`, `laneIndex`
- `startOffset`, `endOffset`, `centerOffset`
- `startBoundaryId`, `endBoundaryId`
- boundary rolleri

atanır.

Lane kimlikleri normal yolda `lane:<index>`, bölünmüş yolda `lane:<side>:<index>` biçimindedir. Banketler `shoulder:<side>`, iç banketler `innerShoulder:<side>`, kanal `waterChannel` olur.

## Boundary rolleri

- İlk ve son boundary: `edge`.
- Banket veya iç banket komşuluğu: `edge`.
- Su kanalı komşuluğu: `channel`.
- Farklı yön taraflarının ayrımı: `median`.
- İki lane arası: `marking`.

Varsayılan render:

- `edge` ve `channel`: düz çizgi, `edgeLine.width`.
- `median`: çift düz, `marking.width`.
- `marking`: global `marking.style` ve `marking.width`.
- Dış `edge`, `edgeLine.enabled === false` ise çizilmez.

## Çizgi stilleri

Desteklenen yol marking stilleri:

- `solid`
- `dash`
- `leftSolidRightDash`
- `rightSolidLeftDash`
- `doubleSolid`
- `doubleDash`
- `none`

Kesik çizgi dash değeri sabit `18 14` olarak render edilir. Çift/karma çizgiler merkez offset'in iki yanında `max(4, width * 2)` toplam ayrımla çizilir.

## Boundary segmentleri

Bir boundary için `boundaryStyles.bN` şu yapıya normalize edilir:

```js
{
  style,
  width,
  segments: [
    { from: 0, to: 0.5, style, width },
    { from: 0.5, to: 1, style, width }
  ]
}
```

- Inspector 1–5 eşit segment oluşturur.
- Her segmentin stili düğmeye basıldıkça desteklenen stiller arasında döner.
- İki segment arasındaki ayrım noktası yol üzerinde bir kontrol noktasıdır; kullanıcı sürükleyince `from/to` güncellenir.
- Ayrım noktaları yol uzunluğuna ve ekran birimine bağlı minimum boşlukla komşularından uzak tutulur.
- Boundary override'ları `bN` kimliğine bağlıdır. Şerit/banket sayısı değişince aynı `bN` fiziksel olarak farklı bir sınıra denk gelebilir; otomatik semantic remap yoktur.

## Kesit seçimi ve genişlik değişimi

Edit modunda yola tap edilince en yakın merkez çizgisi örneği ve signed normal offset bulunur. Offset'i kapsayan kesit `roadSelection` metadata'sına yazılır. Inspector genişlik alanı artık global lane genişliği yerine seçilen kesitin genişliğini değiştirir.

Global genişlik değişikliği tüm normal ve bölünmüş lane dizilerini aynı değere çevirir. Tek kesit değişikliği yalnız kimliği çözülen lane/banket/kanal alanını günceller.

Ada için tek lane seçimi değiştirildiğinde tüm `laneWidths` toplamı dış çapı belirler; global ada lane genişliği değişikliği ise bütün lane'leri eşitler.

## Kavşak davranışı

Yol bir kavşak üyesiyse gerçek dış `edge` çizgileri road adapter içinde atlanır; dış konturu [[Kavşak Sistemi]] yeniden çizer. İç edge/banket çizgileri korunur. Diğer boundary çizgileri kavşak shape'lerinin içinde görünür aralıklara bölünür.

Terminal olarak kavşağa giren yol ile devam eden host yol ayrımında bazı `marking` çizgileri korunur; karar `terminalRoadIds` üzerinden verilir.

## Belirsiz

- “Sol” ve “sağ” kullanıcı anlamı merkez çizgisinin parametre yönüne bağlı normal eksenden türetilir. Yol başlangıç/bitiş yönü ters çevrilirse görsel taraf algısının ürün beklentisiyle nasıl eşleştirileceği ayrıca doğrulanmalıdır.
- Boundary kimliklerinin kesit sayısı değişiminde stilleri semantic olarak taşıması kodda uygulanmamıştır; mevcut indeks tabanlı davranışın istenen ürün kararı olup olmadığı belirsizdir.

