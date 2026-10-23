# Trafik Levhası Sistemi

> Teslim notu — 23.10.2026: Bu sayfada anılan test/üretim scriptleri, ham asset kaynakları ve yerel araçlar çevrimiçi teslim ağacında bulunmaz; yerel geliştirme kopyasında korunur. Çalışan kataloglar `src/data/` içindedir.

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

Mevcut katalog toplam 344 levha kaydı taşır. PDF'de en ve boy birlikte açıkça verilmemiş levhalar içeriğe göre genişleyen, açık ölçü çifti verilenler sabit olarak uygulanır. Kullanıcının kilitli Havalimanı ve minimum genişlikli İl Sınırı istisnaları aşağıdaki bilgi levhası profillerinde korunur.

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
- `src/core/trafficSignLayout.js`: `arrow-single-message-v1`, `arrow-double-message-v1`, `finger-single-message-v1`, `finger-double-message-v1` ve `tourist-finger-v1` ailelerinin ortak genişlik hesabı ve SVG yerleşimi.
- `src/data/traffic-signs-direction.js`: sekiz dinamik B-5a, sabit Şehir Merkezi, dinamik B-5b Turistik Mahal ve sabit B-5c Metro kaydı; B-4 sonrasına yerleşir.
- `scripts/generate-direction-sign-data.py`: dört PDF ve font verisinden kaynak veriyi yeniden üretir; geliştirme ortamında pdfplumber/fonttools gerekir. Kullanım: `python scripts/generate-direction-sign-data.py <137.pdf-yolu> <138.pdf-yolu> <139.pdf-yolu> <140.pdf-yolu>`.

`a = 100` yalnız çizim birimidir; fiziksel cm/mm karşılığı tanımlanmaz. Kenar + çerçeve `a + a`, içerik boşlukları ve ok/metin aralığı `4a` tutulur. Yazı yüksekliği PDF kutularından, ok biçimleri PDF vektörlerinden alınır. Beyaz gövde, ince siyah çizgiler ve içi boş oklar korunur; kutuların yerine siyah KrokiSignNarrow metni çizilir. İç/dış çerçeve köşe yarıçapları `2a`/`3a`, harf aralığı `a`dır.

Oklu levhalarda genişlik = en uzun satırın görünür genişliği + okun yatay genişliği + `16a`. Çift mesajda satırlar sola hizalanır, satır aralığı `4a`, üst/alt dış kenar boşluğu `6a`dır; ok dikey ortalanır. Her PDF'nin kendi ok vektörleri kullanılır. Harf yüksekliği, ok, çerçeve ve boşluklar metin değişiminde aynı kalır. Sağa ve sağ üst çapraz okta metin önce, ok sonra gelir. Parmak levhalarda toplam genişlik = en uzun satır + `13a + h/2`; dış sivri ucun boyu `h/2`, iç uç ile dış uç arası `8a`, yazı ile iç konturun üst/alt omzu arası `4a`dır. Çerçeveler kısa SVG path ve arc komutlarıyla oluşturulur. En/boy, seçim, hit-test, döndürme tutamacı ve çıktı sınırları aynı hesap üzerinden güncellenir. Sekiz levhanın başlangıç ölçeği `0.02` olup önceki `0.04` değerinin yarısıdır; mevcut yüzde ölçek kontrolüyle değişir. Kaydedilmiş nesnelerin açık `geometry.scale` değeri korunur, eski krokiler otomatik küçültülmez.

Yazı ölçüsü gömülü font tablosuyla hesaplanır; font yüklenmeden de belge geometrisi kararlıdır. Kerning/ligatür kapalıdır, harfler `textLength` ile sıkıştırılmaz. Sürükleme sırasında yeniden SVG parse veya DOM ölçümü yapılmaz. Dinamik yerleşim yalnız bu beş aileye uygulanır; mevcut sabit levhalar kendi davranışlarını korur.

Katalog `layout` tanımı modelde `metadata.signLayout` olarak saklanır. Metin, tek mesajda `metadata.signTextFields.message`, çift mesajda `message1` ve `message2` alanlarındadır. JSON/SVG açılışında en yeniden hesaplanır; katalog kaydı bulunmazsa gömülü art ve yerleşim tanımı kullanılır. Mevcut SVG/PNG dışa aktarımı levha fontunu dosyaya gömer.

139.pdf'deki `ŞEHİR MERKEZİ LEVHASI` sabittir; metin paneli açılmaz. Kaynak ölçü oranı `1980 × 684`, `a=24` değerinden diğer levhalarla aynı `a=100` birimine aktarılmış katalog boyutu `8250 × 2850`, başlangıç ölçeği `0.02`dir. Şehir Merkezi yazısı mevcut KrokiSignNarrow fontuyla iki SVG `<text data-editable-text="false">` öğesi olarak çizilir; harf path verisi kullanılmaz. Yazı kalındır, harf aralığı 24, sabit satır genişlikleri 696/1008 ve tabanları 294/540'tır. Simgenin 300 dış çapı, 12 halka kalınlığı ve 120 merkez çapı altı SVG `A` komutuyla çizilir. Sabit SVG art yaklaşık 1 KB'dır; yeni font veya bitmap dosyası içermez.

140.pdf'deki B-5b `KAVŞAK İÇİ YÖN LEVHASI (Turistik Mahal)` net en/boy vermediği için genişler. Kahverengi zemin `#74352f`, çerçeve ve yazılar beyazdır. `message1` (`Yer adı`, `Belkıs`) ve `message2` (`2. satır / açıklama`, `(Aspendos)`) alanları en fazla 120 karakter, `distance` (`Mesafe (km)`, `4`) 8 karakterdir. Ad satırları en uzun adın kutusunda ortalanır. Mesafe ikinci satır tabanındadır; en uzun ad ile mesafe arasında `9a` bulunur. Toplam en = ad genişliği + mesafe genişliği + `22a + h/2`; yükseklik ve harf boyu sabittir. Kaynak metindeki büyük/küçük harf ve parantezler korunur, tüm alanlar SVG text'tir.

140.pdf'deki B-5c `KAVŞAK İÇİ YÖN LEVHASI (Metro)` sabit `1476 × 440` oranındadır. `a=16` değerinden `a=100` birimine aktarılmış katalog boyutu `9225 × 2750`, başlangıç ölçeği `0.02`dir. Siyah/beyaz çerçeve kısa path ve arc; kaynak mavi `#304faa` P alanı rect olarak çizilir. `P`, `+`, `METRO` mevcut fontla SVG text'tir ve `data-editable-text="false"` ile kilitlidir. SVG art yaklaşık 1 KB'dır.

Doğrulama: `scripts/direction-sign-browser.cjs` kütüphane/UI, dokuz dinamik levhada 73 metin senaryosu, turistik levhanın ad ortalaması ve mesafe boşluğu, bağımsız alanlar, en uzun satıra göre genişleme, parmak uç ölçüleri, sabit şehir/metro yazılarının düzenlenememesi, arc simgesi, ekleme ölçeği, eski kayıtların ölçülerini koruma, Türkçe karakterler, kısa/uzun/boş metin, 120 karakter, gerçek harf genişliği, boşluklar, hit-test, dönüş, kopya, sürüklemede DOM yeniden kullanımını, undo/redo, JSON ve SVG round-trip, font gömme ve tablet düzenini kontrol eder. `TEST_BASE_URL` verilirse aynı kontrol yayında çalışır. Görseller ve dışa aktarılan örnek `.tmp/direction-signs/` altındadır.

## Belirsiz

- Generated katalogların hangi script/iş akışıyla yeniden üretildiği depoda görünmüyor.
- Levha içi `<text>` değiştirme, birden çok farklı semantik text alanı olan levhalarda bütün run'ları tek label metni olarak ele alır. Katalogdaki tüm levhalar için beklenen düzenleme davranışı doğrulanmamıştır.
- Katalog SVG'sinin güvenilir build-time veri olduğu varsayılıyor. Dış belge importunda `signArt` güven modeli tanımlı değildir.


### B-5d–B-12d bilgi levhaları

`trafficSignInformationLayout.js`, `TrafficSignLayout.registerFamily` üzerinden `information-v1` ailesini bağlar. Native ölçülerle hesaplanan düğümler yalnız metin değiştiğinde güncellenir; WeakMap önbelleği hareket sırasında tekrar hesaplamayı engeller. `traffic-signs-information.js` 13 kaydı B-5c sonrasına ekler. Alan kuralları ve kaynak hashleri [[Levha Özelleştirme Kayıtları]] içindedir.

Doğrulama: `node scripts/information-sign-browser.cjs`; isteğe bağlı `TEST_BASE_URL` ile canlı yayına karşı çalışır. 13 kayıt, boş mesafenin kapanması, il adı minimum genişliği, sabit yazılar/satırlar, uzun metnin çerçeveye sığması, kırmızı çizginin sırası ve boyut değişimi, sürüklemede DOM yeniden kullanımı, kopya, JSON/SVG aktarımı ve font gömme kontrol edilir.


### PDF 152–155 ekleri (14.10.2026)

B-12e/f: KARAYOLLARI kilitli, diğer iki satır bağımsız. B-12g: yalnız şube numarası. B-12h/i: bütün yazılar kilitli. Sabit levha ölçüleri sırasıyla 1984×800, 1955×800, 1752×800 ve 1970×800'dür. B-12h için PDF başlığındaki Sonu yerine çizimdeki Başlangıcı esas alınır.

B-13a kullanıcının isteğiyle eklenmedi. B-13b iki yer adı ve iki mesafe için dört bağımsız text alanı içerir; mesafeler sağa hizalıdır. a=100, minimum genişlik 4800, yükseklik 2950, sütun arası en az 9a; genişlik en uzun ad ve en uzun mesafeye göre hesaplanır. Satır sayısı sabittir. `information-sign-browser.cjs` artık 19 profili, B-13a yokluğunu ve B-13b'nin dört alanının bağımsızlığını/genişlemesini de doğrular.


### Grup oranlı boyutlandırma düzeltmesi — 15.10.2026

Grup dönüşümünde levha ölçeğinin ayrı ayrı 0.005–4 aralığına sıkıştırılması kaldırıldı. Özellikle başlangıç ölçeği 0.02 olan yeni levhalar %25 altında sabit alt sınıra takılırken grup çerçevesi küçülmeye devam ediyordu. Adapter geçerli pozitif ölçeği çizim, kopyalama ve yüklemede korur; tek levha boyut panelinin styleManager sınırları değişmedi. Diğer sembol/araç dönüşümleri değiştirilmedi.

Regresyon testi: `scripts/traffic-sign-group-resize-browser.cjs`. Eski TT-1 ile yeni B-5a/B-12h/B-13b aynı grupta %1/%10/%50/%100/%400 oranlarında denenir; ölçü, grup çerçevesi, geri dönüş, undo/redo ve JSON yükleme kontrol edilir. Ayrı senaryo 4 üstü ölçeğin grup/kopya/yüklemede korunmasını doğrular. Düzeltme öncesi B-13b %10 genişliği 13.46099 yerine 33.652475 olarak ölçüldü. Geri dönüş commit'i: d96b8283a147cf202f1cb8effa625c9ddff2bab0.


### Kütüphane kontrol noktalarında zoom — 15.10.2026

Levha ve diğer sembollerin rotate CP uzaklığı seçim çerçevesinden hesaplanır; ekranda 48 px boşluk korunur. Üçgende merkezden sağa giden ışının çerçeve kesişimi kullanılır; daire/dikdörtgende ilgili kenar esas alınır. Araçların mevcut uzaklık hesabı korunur. Kütüphane nesneleri `catalogControl` ile işaretlenir: rotate ikon kutusu 36 yerine 42 px, opaklık .50 yerine .85; dokunma alanı 72 px kalır. Çizim araçları ve yollar bu görsel değişikliğe dahil değildir. Yeni resize CP eklenmez; mevcut boyut butonları korunur.

Test: `scripts/catalog-control-zoom-browser.cjs`; dört zoom düzeyinde gerçek DOM ekran ölçüleri, çerçeve boşluğu, döndürülmüş nesne, ön seçim/düzenleme ve çizim araçlarının kapsam dışında kalması kontrol edilir.
