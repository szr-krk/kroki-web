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

Mevcut katalog toplam 323 levha kaydı taşır.

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

## İçeriğe göre genişleyen bilgi levhaları (14.10.2026)

B-5a, Bilgi Levhaları kategorisinde sekiz ayrı kayıttır. `KAVŞAK ÖNCESİ YÖN LEVHASI (Oklu - Tek mesaj) 1`, `2`, `3`, 137.pdf içindeki sola ok, yukarı ok ve sağ üst çapraz ok sırasını izler. Varsayılan metin `MERKEZ`; mevcut Abc panelindeki `Yer / yön adı` alanı en fazla 120 karakter kabul eder. `KAVŞAK ÖNCESİ YÖN LEVHASI (Oklu - Çift mesaj) 4`, `5`, `6`, 138.pdf içindeki yukarı ok, sağa ok ve sağ üst çapraz ok sırasını izler. İki bağımsız alan `1. yer / yön adı` ve `2. yer / yön adı`, başlangıçta `MERKEZ` ve `HASTANE` içerir; her biri en fazla 120 karakter kabul eder. 139.pdf içindeki `KAVŞAK ÖNCESİ YÖN LEVHASI (Parmak) 7` tek satırlı, `8` çift satırlıdır; aynı alanları ve metin sınırlarını kullanırlar.

- `src/data/traffic-sign-direction-data.generated.js`: PDF'den çıkarılmış ok konturları, kaynak/font SHA-256 değerleri ve mevcut `arial-narrow.ttf` dosyasının karakter ölçüleri. Sabit Şehir Merkezi metni için harf path verisi üretilmez.
- `src/core/trafficSignLayout.js`: `arrow-single-message-v1`, `arrow-double-message-v1`, `finger-single-message-v1` ve `finger-double-message-v1` ailelerinin ortak genişlik hesabı ve SVG yerleşimi.
- `src/data/traffic-signs-direction.js`: sekiz dinamik B-5a ve bir sabit Şehir Merkezi kaydı; B-4 sonrasına yerleşir.
- `scripts/generate-direction-sign-data.py`: üç PDF ve font verisinden kaynak veriyi yeniden üretir; geliştirme ortamında pdfplumber/fonttools gerekir. Kullanım: `python scripts/generate-direction-sign-data.py <137.pdf-yolu> <138.pdf-yolu> <139.pdf-yolu>`.

`a = 100` yalnız çizim birimidir; fiziksel cm/mm karşılığı tanımlanmaz. Kenar + çerçeve `a + a`, içerik boşlukları ve ok/metin aralığı `4a` tutulur. Yazı yüksekliği PDF kutularından, ok biçimleri PDF vektörlerinden alınır. Beyaz gövde, ince siyah çizgiler ve içi boş oklar korunur; kutuların yerine siyah KrokiSignNarrow metni çizilir. İç/dış çerçeve köşe yarıçapları `2a`/`3a`, harf aralığı `a`dır.

Oklu levhalarda genişlik = en uzun satırın görünür genişliği + okun yatay genişliği + `16a`. Çift mesajda satırlar sola hizalanır, satır aralığı `4a`, üst/alt dış kenar boşluğu `6a`dır; ok dikey ortalanır. Her PDF'nin kendi ok vektörleri kullanılır. Harf yüksekliği, ok, çerçeve ve boşluklar metin değişiminde aynı kalır. Sağa ve sağ üst çapraz okta metin önce, ok sonra gelir. Parmak levhalarda toplam genişlik = en uzun satır + `13a + h/2`; dış sivri ucun boyu `h/2`, iç uç ile dış uç arası `8a`, yazı ile iç konturun üst/alt omzu arası `4a`dır. Çerçeveler kısa SVG path ve arc komutlarıyla oluşturulur. En/boy, seçim, hit-test, döndürme tutamacı ve çıktı sınırları aynı hesap üzerinden güncellenir. Sekiz levhanın başlangıç ölçeği `0.02` olup önceki `0.04` değerinin yarısıdır; mevcut yüzde ölçek kontrolüyle değişir. Kaydedilmiş nesnelerin açık `geometry.scale` değeri korunur, eski krokiler otomatik küçültülmez.

Yazı ölçüsü gömülü font tablosuyla hesaplanır; font yüklenmeden de belge geometrisi kararlıdır. Kerning/ligatür kapalıdır, harfler `textLength` ile sıkıştırılmaz. Sürükleme sırasında yeniden SVG parse veya DOM ölçümü yapılmaz. Dinamik yerleşim yalnız bu dört aileye uygulanır; mevcut sabit levhalar kendi davranışlarını korur.

Katalog `layout` tanımı modelde `metadata.signLayout` olarak saklanır. Metin, tek mesajda `metadata.signTextFields.message`, çift mesajda `message1` ve `message2` alanlarındadır. JSON/SVG açılışında en yeniden hesaplanır; katalog kaydı bulunmazsa gömülü art ve yerleşim tanımı kullanılır. Mevcut SVG/PNG dışa aktarımı levha fontunu dosyaya gömer.

139.pdf'deki `ŞEHİR MERKEZİ LEVHASI` sabittir; metin paneli açılmaz. Kaynak ölçü oranı `1980 × 684`, `a=24` değerinden diğer levhalarla aynı `a=100` birimine aktarılmış katalog boyutu `8250 × 2850`, başlangıç ölçeği `0.02`dir. Şehir Merkezi yazısı mevcut KrokiSignNarrow fontuyla iki SVG `<text data-editable-text="false">` öğesi olarak çizilir; harf path verisi kullanılmaz. Yazı kalındır, harf aralığı 24, sabit satır genişlikleri 696/1008 ve tabanları 294/540'tır. Simgenin 300 dış çapı, 12 halka kalınlığı ve 120 merkez çapı altı SVG `A` komutuyla çizilir. Sabit SVG art yaklaşık 1 KB'dır; yeni font veya bitmap dosyası içermez.

Doğrulama: `scripts/direction-sign-browser.cjs` kütüphane/UI, sekiz dinamik levhada 65 metin senaryosu, bağımsız çift satır düzenleme, en uzun satıra göre genişleme, parmak uç ölçüleri, sabit şehir levhasının düzenlenememesi ve arc simgesi, yarıya indirilmiş ekleme ölçeği, eski kayıtların ölçülerini koruma, Türkçe karakterler, kısa/uzun/boş metin, 120 karakter, gerçek harf genişliği, boşluklar, hit-test, dönüş, kopya, sürüklemede DOM yeniden kullanımını, undo/redo, JSON ve SVG round-trip, font gömme ve tablet düzenini kontrol eder. `TEST_BASE_URL` verilirse aynı kontrol yayında çalışır. Görseller ve dışa aktarılan örnek `.tmp/direction-signs/` altındadır.

## Belirsiz

- Generated katalogların hangi script/iş akışıyla yeniden üretildiği depoda görünmüyor.
- Levha içi `<text>` değiştirme, birden çok farklı semantik text alanı olan levhalarda bütün run'ları tek label metni olarak ele alır. Katalogdaki tüm levhalar için beklenen düzenleme davranışı doğrulanmamıştır.
- Katalog SVG'sinin güvenilir build-time veri olduğu varsayılıyor. Dış belge importunda `signArt` güven modeli tanımlı değildir.
