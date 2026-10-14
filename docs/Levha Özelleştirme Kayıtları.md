# Levha Özelleştirme Kayıtları

Bu dosya, ham trafik levhası SVG'lerine uygulanması gereken proje özelindeki ayarların kalıcı bakım kaydıdır.

`src/data/traffic-signs-*.generated.js` dosyaları ham SVG klasörlerinden Levha Katalog Üretici ile yeniden oluşturulabilir. Bu nedenle generated JS üzerinde yapılan levha bazlı değişiklikler kalıcı kaynak kabul edilmez. Bir levha grubu yeniden üretileceği zaman aşağıdaki kayıtlar ilgili **ham SVG dosyalarına** uygulanmalı, ardından katalog JS dosyası üretilmelidir.

## Kullanılan SVG verileri

Levhanın ana `<g>` öğesi:

```html
data-sign-base-scale="0.08"
```

Düzenlenebilir bir `<text>` öğesi:

```html
data-editable-text="true"
data-text-key="benzersiz-alan-anahtari"
data-text-label="Veri girişinde gösterilecek ad"
data-text-type="number"
data-text-maxlength="2"
```

İsteğe bağlı sayısal sınırlar:

```html
data-text-min="1"
data-text-max="9"
```

Bir sayı birden fazla `<text>` öğesine bölünmüşse bu öğelere aynı `data-text-key` verilmelidir. Böylece veri giriş ekranında tek alan olarak görünür ve girilen değer ilgili SVG text öğelerine dağıtılır.

`data-editable-text="true"` bulunmayan text öğeleri, levhada başka etiketli alanlar bulunduğu sürece değiştirilemez ve veri giriş ekranında gösterilmez.

## Yeniden üretim kontrol listesi

1. Bu dosyada ilgili levha grubuna ait kayıtları bul.
2. Ayarları generated JS dosyasına değil, katalog üreticiye verilecek ham SVG dosyalarına uygula.
3. Levha grubunun katalog JS dosyasını yeniden üret.
4. Üretilen JS dosyasını projedeki karşılığıyla değiştir.
5. `data-sign-base-scale`, düzenlenebilir alanlar, label'lar, sınırlar ve sabit text öğelerini uygulamada kontrol et.
6. Yeni bir levha özel ayarı yapıldıysa aynı değişiklik sırasında bu dosyaya da kaydet.

---

## Tüm Levhalar — Kırmızı Renk Normalizasyonu

- Son kayıt tarihi: 2026-07-29
- Standart kırmızı renk: `#ff001e`
- Dönüştürülen eski gösterimler: `red`, `#ff0000`, `#ee322d`, `#ef0311`, `#ef2525`, `#f22`, `#e33` ve `rgb(100%,0%,0%)`

#### Etkilenen levhalar

| Levha grubu | Levhalar |
|---|---|
| Tanzim levhaları | `TT-2`–`TT-31` aralığındaki kırmızı içeren levhalar ile `TT-38b`, `TT-39b`, `TT-40b`, `TT-42b`, `TT-44b`, `TT-45b` |
| Uyarı levhaları | `T-16`, `T-27a`, `T-27b`, `T-28a`, `T-28b`, `T-29a`, `T-29b`, `T-30a`, `T-30b`, `T-33a`–`T-33f` |
| Bilgi levhaları | `B-2a`–`B-2d`, `B-14c`, `B-14e`, `B-17`, `B-21`, `B-23`, `B-37`, `B-48`, `B-50b`, `B-50d`, iki `B-50f` varyantı, `B-50g`, iki `B-51a` varyantı, `B-57`, `B-61d`–`B-61g`, `B-63c`, `B-63d` |
| Durma ve parketme levhaları | `P-1`, `P-2` |

Yapım-bakım-onarım levhalarındaki kırmızılar zaten `#ff001e` standardındaydı. Panel ve kaplama işareti kataloglarında kırmızı renk bulunmadı.

#### Projedeki mevcut durum

Etkin katalogda standart dışı kırmızı kullanan 83 levha kaydı düzeltildi. Generated JS içindeki SVG, önizleme kopyası ve çalışma zamanında değiştirilen levha tanımları birlikte ele alındığı için toplam 226 renk gösterimi `#ff001e` olarak standartlaştırıldı. Kataloglar yeniden üretilecekse aynı dönüşüm ilgili ham SVG dosyalarına uygulanmalıdır.

---

## B-5a — İçeriğe göre genişleyen yön levhaları

- Son kayıt tarihi: 2026-10-14.
- Kaynak: kullanıcı tarafından verilen `137.pdf`, `138.pdf` ve `139.pdf`, birer sayfa. Ölçü yazıları ve harf kutuları katalog görseline alınmaz.
- Adlar: `KAVŞAK ÖNCESİ YÖN LEVHASI (Oklu - Tek mesaj) 1`, `2`, `3`, `KAVŞAK ÖNCESİ YÖN LEVHASI (Oklu - Çift mesaj) 4`, `5`, `6` ve `KAVŞAK ÖNCESİ YÖN LEVHASI (Parmak) 7`, `8`; sekiz kayıtta kod `B-5a`.
- Anahtarlar: `3-bilgi-levhalari/b-5a-kavsak-oncesi-yon-levhasi-1`–`-8`.
- `1`: sola ok / metin; `2`: yukarı ok / metin; `3`: metin / sağ üst çapraz ok.
- `4`: yukarı ok / çift satır; `5`: çift satır / sağa ok; `6`: çift satır / sağ üst çapraz ok. Oklar 138.pdf'den alınır ve dikey ortalanır; satırlar sola hizalanır, aralarında `4a` boşluk vardır.
- Beyaz zemin, siyah ince konturlar ve içi boş oklar; siyah, düzenlenebilir metin. Tek mesaj alanı `message` (`Yer / yön adı`, başlangıç `MERKEZ`); çift mesaj alanları `message1` ve `message2` (`1. yer / yön adı` / `2. yer / yön adı`, başlangıç `MERKEZ` / `HASTANE`). Her alanın sınırı 120 karakterdir.
- `7`: sağa bakan tek satırlı parmak; `8`: sağa bakan çift satırlı parmak. 139.pdf'ye göre sivri uç `h/2`, iç/dış uç arası `8a`, sağ üst/alt yazı boşluğu `4a` ve ardından `3a` omuz aralığı korunur.
- `a = 100` çizim birimi; sekiz levhanın başlangıç ölçeği `0.02`, önceki `0.04` değerinin yarısıdır. Kaydedilmiş krokilerin açık ölçekleri korunur. Metinle birlikte yalnız genişlik hesaplanır; çift mesajda en uzun satır belirleyicidir, harfler sıkıştırılmaz.
- Kaynak üretimi: `python scripts/generate-direction-sign-data.py <137.pdf-yolu> <138.pdf-yolu> <139.pdf-yolu> <140.pdf-yolu>`. Mevcut `src/arial-narrow.ttf` dosyası kullanılmalıdır. Font veya PDF değişirse ölçü verisi yeniden üretilip tarayıcı testi çalıştırılır.
- Bu sekiz kayıt sabit katalog generator'ına dahil edilmez; `traffic-signs-direction.js` ve `TrafficSignLayout` ortak yerleşimi tarafından üretilir. Ayrıntılar: [[Trafik Levhası Sistemi#İçeriğe göre genişleyen bilgi levhaları (14.10.2026)]].

### Şehir Merkezi Levhası — Sabit parmak levha

- Kaynak: `139.pdf`; anahtar `3-bilgi-levhalari/sehir-merkezi-levhasi`, ad `ŞEHİR MERKEZİ LEVHASI`. Kaynakta ayrı bir kod yoktur.
- Ölçü oranı `1980 × 684`; kaynak `a=24`, katalogda `a=100` için `8250 × 2850` ve başlangıç ölçeği `0.02`.
- Metin, simge ve genişlik sabittir; Abc paneli açılmaz. Kullanıcı isteğiyle Şehir Merkezi yazısı path yerine mevcut KrokiSignNarrow fontunu kullanan iki SVG text öğesidir; ikisinde de `data-editable-text="false"` bulunur. Satırlar 294/540 tabanlarına yerleşir; yazı kalın, harf aralığı 24, sabit genişlikleri 696/1008'dir. Generated veride harf konturları tutulmaz.
- Yuvarlak simge kullanıcı isteğiyle SVG `A` arc komutlarından oluşur: dış çap 300, halka kalınlığı 12, merkez çapı 120. Çerçevenin yuvarlak köşeleri de arc kullanır.
- `traffic-signs-direction.js` içinde, B-5a 8'in ardından kayıtlıdır. Tam SVG art yaklaşık 1 KB; bitmap ve yeni font dosyası eklenmez.

### B-5b — Kavşak İçi Yön Levhası (Turistik Mahal)

- Kaynak: `140.pdf`; anahtar `3-bilgi-levhalari/b-5b-kavsak-ici-yon-levhasi-turistik-mahal`. Net en/boy olmadığından genişlik içeriğe göre hesaplanır; başlangıç ölçeği `0.02`.
- Zemin kaynaktaki `#74352f`, çerçeve ve yazılar beyazdır. Parmak uç ve köşeler kısa path/arc komutlarıdır.
- `message1`: Yer adı, başlangıç `Belkıs`; `message2`: 2. satır / açıklama, başlangıç `(Aspendos)`; her biri 120 karaktere kadar. `distance`: Mesafe (km), başlangıç `4`, 8 karaktere kadar (ondalık virgül kabul edilir).
- Ad satırları ortak kutuda ortalanır; mesafe alt satırla aynı tabanda, en uzun adın 9a sağındadır. Harfler sıkıştırılmaz; ad veya mesafe uzayınca gövde genişler. Bütün yazılar düzenlenebilir SVG text'tir.

### B-5c — Kavşak İçi Yön Levhası (Metro)

- Kaynak: `140.pdf`; anahtar `3-bilgi-levhalari/b-5c-kavsak-ici-yon-levhasi-metro`. Net `1476 × 440` oranı sabittir; `a=16` kaynak ölçüsü `a=100` için `9225 × 2750` olarak çizilir, başlangıç ölçeği `0.02`.
- Siyah/beyaz parmak çerçeve, mavi `#304faa` 280 × 280 P alanı ve `P + METRO` yazısı. Yazılar path yerine mevcut fontla SVG text'tir; üçü de `data-editable-text="false"` ile kilitlenir. Abc paneli açılmaz.
- SVG art yaklaşık 1 KB; yeni font, bitmap veya çalışma zamanı bağımlılığı eklenmez.

## 1 Tanzim Levhaları

### TT-2 — Dur

- Ham SVG dosyası: `(TT-2) DUR.svg`
- Katalog anahtarı: `1-tanzim-levhalari/tt-2-dur`
- Son kayıt tarihi: 2026-07-28
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

Bu levhada değiştirilebilir text alanı yoktur.

#### Ham SVG'ye uygulanacak veriler

`DUR` text öğesine:

```html
data-editable-text="false"
```

#### Sabit text öğeleri

- `DUR` değiştirilemez.

#### Projedeki mevcut durum

TT-2, `src/adapters/trafficSignAdapter.js` içindeki değiştirilemez-text listesine eklenmiştir. `DUR` levha üzerinde görünür fakat text veri giriş paneli açılmaz. Tanzim levhaları yeniden üretilmeden önce `DUR` text öğesine yukarıdaki veri eklenmelidir.

---

### TT-20 — Genişliği ... Metreden Fazla Olan Taşıt Giremez

- Ham SVG dosyası: `(TT-20) GENİŞLİĞİ ..... METREDEN FAZLA OLAN TAŞIT GİREMEZ.svg`
- Katalog anahtarı: `1-tanzim-levhalari/tt-20-genisligi-metreden-fazla-olan-tasit-giremez`
- Son kayıt tarihi: 2026-07-28
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Sınır |
|---|---|---|---|---|---|
| `2` | `M` | `whole` | Sayı | 1 rakam | 1–9 |
| `30` | `Cm` | `decimal` | Sayı | En fazla 2 rakam | Belirtilmedi |

#### Ham SVG'ye uygulanacak veriler

`2` text öğesine:

```html
data-editable-text="true"
data-text-key="whole"
data-text-label="M"
data-text-type="number"
data-text-maxlength="1"
data-text-min="1"
data-text-max="9"
```

`30` değeri ham SVG'de ayrı `3` ve `0` text öğelerinden oluşur. Her iki öğeye de:

```html
data-editable-text="true"
data-text-key="decimal"
data-text-label="Cm"
data-text-type="number"
data-text-maxlength="2"
```

#### Sabit text öğeleri

- Ondalık ayırıcı `,` değiştirilemez.
- Birim metni `m` değiştirilemez.
- Bu iki öğeye `data-editable-text` eklenmemelidir.

#### Projedeki mevcut durum

Bu ayarlar şu anda `src/data/traffic-signs-1-tanzim-levhalari.generated.js` içindeki TT-20 kaydına uygulanmıştır. İlgili grup yeniden üretildiğinde, yukarıdaki veriler önce ham SVG'ye eklenmezse generated JS içindeki ayarlar kaybolur.

---

### TT-21 — Yüksekliği ... Metreden Fazla Olan Taşıt Giremez

- Ham SVG dosyası: `(TT-21) YÜKSEKLİĞİ ..... METREDEN FAZLA OLAN TAŞIT GİREMEZ.svg`
- Katalog anahtarı: `1-tanzim-levhalari/tt-21-yuksekligi-metreden-fazla-olan-tasit-giremez`
- Son kayıt tarihi: 2026-07-28
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Sınır |
|---|---|---|---|---|---|
| `3` | `M` | `whole` | Sayı | 1 rakam | 1–9 |
| `50` | `Cm` | `decimal` | Sayı | En fazla 2 rakam | Belirtilmedi |

#### Ham SVG'ye uygulanacak veriler

`3` text öğesine:

```html
data-editable-text="true"
data-text-key="whole"
data-text-label="M"
data-text-type="number"
data-text-maxlength="1"
data-text-min="1"
data-text-max="9"
```

`50` değeri ham SVG'de ayrı `5` ve `0` text öğelerinden oluşur. Her iki öğeye de:

```html
data-editable-text="true"
data-text-key="decimal"
data-text-label="Cm"
data-text-type="number"
data-text-maxlength="2"
```

#### Sabit text öğeleri

- Ondalık ayırıcı `,` değiştirilemez.
- Birim metni `m` değiştirilemez.
- Bu iki öğeye `data-editable-text` eklenmemelidir.

#### Projedeki mevcut durum

TT-21 alanları şu anda `src/adapters/trafficSignAdapter.js` içindeki uyumluluk tanımıyla `M` ve `Cm` olarak sınırlandırılmıştır. Tanzim levhaları yeniden üretilmeden önce yukarıdaki veriler ham SVG'ye eklenmelidir; böylece sonraki katalog JS dosyası aynı davranışı doğrudan SVG verisinden taşır.

---

### TT-22 — Uzunluğu ... Metreden Fazla Olan Taşıt Giremez

- Ham SVG dosyası: `(TT-22) UZUNLUĞU ..... METREDEN FAZLA OLAN TAŞIT GİREMEZ.svg`
- Katalog anahtarı: `1-tanzim-levhalari/tt-22-uzunlugu-metreden-fazla-olan-tasit-giremez`
- Son kayıt tarihi: 2026-07-28
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Sınır |
|---|---|---|---|---|---|
| `10` | `Metre` | `length` | Sayı | En fazla 3 rakam | Belirtilmedi |

#### Ham SVG'ye uygulanacak veriler

Ham SVG'de `10` ve `m` aynı `<text>` öğesinin içindedir. Sayısal değer değişirken `m` biriminin sabit kalması için bu text öğesine:

```html
data-editable-text="true"
data-text-key="length"
data-text-label="Metre"
data-text-type="number"
data-text-maxlength="3"
data-text-suffix=" m"
data-text-fit-width="145"
data-text-fit-center-x="300"
```

Text öğesinin varsayılan görünen içeriği `10 m` olarak korunmalıdır. `data-text-suffix=" m"` sayesinde kullanıcı yalnızca sayısal kısmı girer; birim render sırasında sabit olarak eklenir.

`data-text-fit-width="145"` ve `data-text-fit-center-x="300"` yalnızca değer varsayılandan uzun olduğunda devreye girer. Üç haneli değer, iki yatay okun arasındaki boşluğa ortalanır ve sağdaki okla üst üste gelmez. İki haneli varsayılan görünüm korunur.

#### Sabit text öğeleri

- `m` birimi değiştirilemez.
- Veri giriş alanında `m` yazılmaz; yalnızca en fazla üç haneli metre değeri girilir.

#### Projedeki mevcut durum

TT-22 alanı şu anda `src/adapters/trafficSignAdapter.js` içindeki uyumluluk tanımıyla `Metre` label'ına, sayısal girişe ve 3 rakam sınırına sahiptir. `m` birimi sabit suffix olarak korunur. Tanzim levhaları yeniden üretilmeden önce yukarıdaki veriler ham SVG'ye eklenmelidir.

Üç haneli değerlerde text genişliği hesaplanırken ham SVG içindeki satır sonu ve girinti boşlukları hesaba katılmamalıdır. Genişlik için biçimlendirilmiş kaynak text yerine kompakt varsayılan `10 m` değeri esas alınır. Üç haneli text 145 birim genişliğe sığdırılıp `x=300` merkezine alınır; böylece örneğin `100 m` ne gereksiz yere uzar ne de sağdaki okla çakışır.

---

### TT-23 — Dingil Başına ... Tondan Fazla Yük Düşen Taşıt Giremez

- Ham SVG dosyası: `(TT-23) DİNGİL BAŞINA ..... TONDAN FAZLA YÜK DÜŞEN TAŞIT GİREMEZ.svg`
- Katalog anahtarı: `1-tanzim-levhalari/tt-23-dingil-basina-tondan-fazla-yuk-dusen-tasit-giremez`
- Son kayıt tarihi: 2026-07-28
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Sınır |
|---|---|---|---|---|---|
| `6` | `Ton` | `load` | Sayı | 1 rakam | Belirtilmedi |

#### Ham SVG'ye uygulanacak veriler

`6` text öğesine:

```html
data-editable-text="true"
data-text-key="load"
data-text-label="Ton"
data-text-type="number"
data-text-maxlength="1"
```

#### Sabit text öğeleri

- Birim texti `t` değiştirilemez.
- `t` öğesine `data-editable-text` eklenmemelidir.
- Levhadaki diğer bütün textler sabit kalmalıdır.

#### Projedeki mevcut durum

TT-23 alanı şu anda `src/adapters/trafficSignAdapter.js` içindeki uyumluluk tanımıyla `Ton` label'ına, sayısal girişe ve tek rakam sınırına sahiptir. Yalnızca `6` texti değiştirilir; `t` sabit kalır. Tanzim levhaları yeniden üretilmeden önce yukarıdaki veriler ham SVG'ye eklenmelidir.

---

### TT-24 — Yüklü Ağırlığı ... Tondan Fazla Yük Düşen Taşıt Giremez

- Ham SVG dosyası: `(TT-24) YÜKLÜ AĞIRLIĞI ..... TONDAN FAZLA YÜK DÜŞEN TAŞIT GİREMEZ.svg`
- Katalog anahtarı: `1-tanzim-levhalari/tt-24-yuklu-agirligi-tondan-fazla-yuk-dusen-tasit-giremez`
- Son kayıt tarihi: 2026-07-28
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Sınır |
|---|---|---|---|---|---|
| `7` | `Ton` | `whole` | Sayı | 1 rakam | Belirtilmedi |
| `00` | `Ton küsuratı` | `decimal` | Sayı | 2 rakam | Belirtilmedi |

`00` alanı kilogram olarak etiketlenmez. Girilen iki rakam doğrudan virgülden sonra gösterildiği için bu alan ton değerinin ondalık/küsurat bölümüdür. Örneğin `7,50 t`, 7 ton 500 kg anlamına gelir; alana girilen `50` doğrudan 50 kg değildir.

#### Ham SVG'ye uygulanacak veriler

`7` text öğesine:

```html
data-editable-text="true"
data-text-key="whole"
data-text-label="Ton"
data-text-type="number"
data-text-maxlength="1"
```

`00` değeri ham SVG'de iki ayrı `0` text öğesinden oluşur. Her iki öğeye de:

```html
data-editable-text="true"
data-text-key="decimal"
data-text-label="Ton küsuratı"
data-text-type="number"
data-text-maxlength="2"
```

#### Sabit text öğeleri

- Ondalık ayırıcı `,` değiştirilemez.
- Birim texti `t` değiştirilemez.
- Bu öğelere `data-editable-text` eklenmemelidir.

#### Projedeki mevcut durum

TT-24 alanları şu anda `src/adapters/trafficSignAdapter.js` içindeki uyumluluk tanımıyla sınırlandırılmıştır. `7` tek rakamlı `Ton`, `00` iki rakamlı `Ton küsuratı` alanıdır. Virgül ve `t` sabit kalır. Tanzim levhaları yeniden üretilmeden önce yukarıdaki veriler ham SVG'ye eklenmelidir.

---

### TT-25 — Öndeki Taşıt ... Metreden Daha Yakın Takip Edilemez

- Ham SVG dosyası: `(TT-25) ÖNDEKİ TAŞIT ..... METREDEN DAHA YAKIN TAKİP EDİLEMEZ.svg`
- Katalog anahtarı: `1-tanzim-levhalari/tt-25-ondeki-tasit-metreden-daha-yakin-takip-edilemez`
- Son kayıt tarihi: 2026-07-28
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Sınır |
|---|---|---|---|---|---|
| `70` | `Metre` | `distance` | Sayı | En fazla 3 rakam | Belirtilmedi |

#### Ham SVG'ye uygulanacak veriler

Ham SVG'de `70` ve `m` aynı `<text>` öğesinin içindedir. Sayısal değer değişirken birimin sabit ve üç haneli metnin kontrollü genişlikte kalması için bu text öğesine:

```html
data-editable-text="true"
data-text-key="distance"
data-text-label="Metre"
data-text-type="number"
data-text-maxlength="3"
data-text-suffix=" m"
data-text-fit-width="190"
data-text-fit-center-x="300"
```

Text öğesinin varsayılan içeriği `70 m` olarak korunmalıdır. Değer üç haneye çıktığında bütün `sayı + m` metni 190 birim genişliğe sığdırılır ve `x=300` merkezine alınır. Böylece üç haneli değer gereksiz yere yatay olarak uzamaz. İki haneli varsayılan görünüm değişmez.

#### Sabit text öğeleri

- `m` birimi değiştirilemez.
- Veri giriş alanında yalnızca metre sayısı değiştirilir.

#### Projedeki mevcut durum

TT-25 alanı şu anda `src/adapters/trafficSignAdapter.js` içindeki uyumluluk tanımıyla `Metre` label'ına ve en fazla üç rakamlık sayısal girişe sahiptir. Üç haneli görünüm 190 birim genişlikte ortalanır, `m` sabit kalır. Tanzim levhaları yeniden üretilmeden önce yukarıdaki veriler ham SVG'ye eklenmelidir.

---

### TT-29a — Azami Hız Sınırlaması

- Ham SVG dosyası: `(TT-29a) AZAMİ HIZ SINIRLAMASI.svg`
- Katalog anahtarı: `1-tanzim-levhalari/tt-29a-azami-hiz-sinirlamasi`
- Son kayıt tarihi: 2026-07-28
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Sınır |
|---|---|---|---|---|---|
| `50` | `Km/s` | `speed` | Sayı | En fazla 3 rakam | Belirtilmedi |

#### Ham SVG'ye uygulanacak veriler

`50` text öğesine:

```html
data-editable-text="true"
data-text-key="speed"
data-text-label="Km/s"
data-text-type="number"
data-text-maxlength="3"
```

#### Text yerleşimi

Ham SVG'deki `50` text öğesi zaten `x="300"`, `text-anchor="middle"` ve `textLength="346"` özelliklerine sahiptir. Üç haneli değer aynı `textLength` içine sığdırılır; genişlik büyütülmez ve levhanın merkez hizası korunur.

#### Sabit text öğeleri

- `50` dışındaki bütün SVG öğeleri sabittir.

#### Projedeki mevcut durum

TT-29a daha önce genel levha text mekanizması nedeniyle düzenlenebilir görünüyordu. Alan şimdi `src/adapters/trafficSignAdapter.js` içinde açıkça `Km/s` label'ına, sayısal girişe ve en fazla üç rakama sınırlandırılmıştır. Tanzim levhaları yeniden üretilmeden önce yukarıdaki veriler ham SVG'ye eklenmelidir.

---

### TT-29b — Azami Hız Bölgesi

- Ham SVG dosyası: `(TT-29b)  AZAMİ HIZ BÖLGESİ.svg`
- Katalog anahtarı: `1-tanzim-levhalari/tt-29b-azami-hiz-bolgesi`
- Son kayıt tarihi: 2026-07-28
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Sınır |
|---|---|---|---|---|---|
| `30` | `Km/s` | `speed` | Sayı | En fazla 3 rakam | Belirtilmedi |

#### Ham SVG'ye uygulanacak veriler

`30` text öğesine:

```html
data-editable-text="true"
data-text-key="speed"
data-text-label="Km/s"
data-text-type="number"
data-text-maxlength="3"
```

#### Sabit text öğeleri

- `AZAMİ HIZ` değiştirilemez.
- `BÖLGESİ` değiştirilemez.
- Yalnızca `30` text öğesine `data-editable-text` eklenmelidir.

#### Projedeki mevcut durum

TT-29b için yalnızca `30` değeri düzenlenebilir ve alan label'ı `Km/s` olarak tanımlıdır. Tanzim levhaları yeniden üretilmeden önce yukarıdaki text verileri ham SVG'ye eklenmelidir.

---

### TT-31 — Gümrük, Durmadan Geçmek Yasaktır

- Ham SVG dosyası: `(TT-31) GÜMRÜK-DURMADAN GEÇMEK YASAKTIR.svg`
- Katalog anahtarı: `1-tanzim-levhalari/tt-31-gumruk-durmadan-gecmek-yasaktir`
- Son kayıt tarihi: 2026-07-28
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

Bu levhada değiştirilebilir text alanı yoktur.

#### Ham SVG'ye uygulanacak veriler

`GÜMRÜK` ve `DOUANE` text öğelerinin her ikisine de:

```html
data-editable-text="false"
```

Bir levhada en az bir text öğesinde `data-editable-text` verisi bulunduğunda yalnızca değeri `"true"` olan öğeler veri girişine açılır. TT-31'de bütün textler `"false"` olduğu için text veri giriş paneli gösterilmez.

#### Sabit text öğeleri

- `GÜMRÜK` değiştirilemez.
- `DOUANE` değiştirilemez.

#### Projedeki mevcut durum

TT-31, `src/adapters/trafficSignAdapter.js` içindeki değiştirilemez-text listesine eklenmiştir. Levha üzerinde textler görünür fakat text düzenleme alanı açılmaz. Tanzim levhaları yeniden üretilmeden önce her iki text öğesine de yukarıdaki veri eklenmelidir.

---

### TT-33a — Hız Sınırlaması Sonu

- Ham SVG dosyası: `(TT-33a) HIZ SINIRLAMASI SONU.svg`
- Katalog anahtarı: `1-tanzim-levhalari/tt-33a-hiz-sinirlamasi-sonu`
- Son kayıt tarihi: 2026-07-28
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Sınır |
|---|---|---|---|---|---|
| `50` | `Km/s` | `speed` | Sayı | En fazla 3 rakam | Belirtilmedi |

Kullanıcı arayüzünde yalnızca tek bir `Km/s` giriş alanı bulunur. Ham SVG'deki ayrı `5` ve `0` text öğeleri aynı mantıksal alanın iki parçasıdır.

#### Ham SVG'ye uygulanacak veriler

`5` ve `0` text öğelerinin her ikisine de:

```html
data-editable-text="true"
data-text-key="speed"
data-text-label="Km/s"
data-text-type="number"
data-text-maxlength="3"
data-text-mode="splitTwoNaturalThree"
data-text-merge-center-x="300"
```

#### Text yerleşimi

- Değer iki haneliyse ilk rakam mevcut sol text konumuna, ikinci rakam mevcut sağ text konumuna yazılır. Böylece siyah eğik şerit için bırakılmış özgün rakam aralığı aynen korunur.
- Değer üç haneliyse iki parçalı görünüm bırakılır. Üç rakam ilk text öğesinde tek ve normal bir sayı olarak `x=300` merkezine yerleştirilir; ikinci text öğesi gizlenir.
- Üç haneli görünümde `font-size="260"` korunur. `textLength` ve `lengthAdjust` kaldırıldığı için sayı yapay biçimde yatay olarak uzatılmaz veya sıkıştırılmaz.
- Tek haneli bir değer girilirse o da levhanın merkezinde normal text olarak gösterilir.

#### Sabit SVG öğeleri

- Siyah eğik şerit ve levhanın diğer grafik öğeleri değiştirilemez.

#### Projedeki mevcut durum

TT-33a şu anda tek `Km/s` veri giriş alanına ve en fazla üç rakam sınırına sahiptir. İki haneli değerlerde özgün ayrı-rakam aralığı, üç haneli değerlerde ise aynı puntoyla merkezlenmiş doğal sayı görünümü kullanılır. Tanzim levhaları yeniden üretilmeden önce yukarıdaki veriler iki ham SVG text öğesine de eklenmelidir.

---

### TT-33b — Azami Hız Bölgesi Sonu

- Ham SVG dosyası: `(TT-33b)  AZAMİ HIZ BÖLGESİ SONU.svg`
- Katalog anahtarı: `1-tanzim-levhalari/tt-33b-azami-hiz-bolgesi-sonu`
- Son kayıt tarihi: 2026-07-28
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Sınır |
|---|---|---|---|---|---|
| `30` | `Km/s` | `speed` | Sayı | En fazla 3 rakam | Belirtilmedi |

Kullanıcı arayüzünde yalnızca tek bir `Km/s` giriş alanı bulunur. `AZAMİ HIZ` ve `BÖLGESİ` textleri bu alana dahil değildir.

#### Ham SVG'ye uygulanacak veriler

Ayrı `3` ve `0` text öğelerinin her ikisine de:

```html
data-editable-text="true"
data-text-key="speed"
data-text-label="Km/s"
data-text-type="number"
data-text-maxlength="3"
data-text-mode="splitTwoNaturalThree"
data-text-merge-center-x="300"
```

#### Text yerleşimi

- İki haneli değerde rakamlar mevcut ayrı sol ve sağ konumlarında gösterilir; eğik siyah şerit için bırakılmış özgün aralık korunur.
- Üç haneli değerde sayı tek parça olarak `x=300` merkezinde gösterilir ve ikinci text öğesi gizlenir.
- Üç haneli görünümde özgün `font-size="220"` korunur; `textLength` ve `lengthAdjust` kullanılmadığı için sayı yapay biçimde uzatılmaz veya sıkıştırılmaz.
- Tek haneli değer merkezde normal text olarak gösterilir.

#### Sabit text öğeleri

- `AZAMİ HIZ` değiştirilemez.
- `BÖLGESİ` değiştirilemez.
- Levhanın eğik siyah şeridi ve diğer grafik öğeleri sabittir.

#### Projedeki mevcut durum

TT-33b şu anda yalnızca `30` değerini temsil eden tek `Km/s` giriş alanına sahiptir. İki haneli değerlerde ayrı-rakam aralığı, üç haneli değerlerde aynı puntoyla merkezlenmiş doğal sayı görünümü kullanılır. Tanzim levhaları yeniden üretilmeden önce yukarıdaki text verileri `3` ve `0` ham SVG text öğelerine eklenmelidir.

---

### TT-41a — Mecburi Asgari Hız

- Ham SVG dosyası: `(TT-41a) MECBURİ ASGARİ HIZ.svg`
- Katalog anahtarı: `1-tanzim-levhalari/tt-41a-mecburi-asgari-hiz`
- Son kayıt tarihi: 2026-07-28
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Sınır |
|---|---|---|---|---|---|
| `30` | `Km/s` | `speed` | Sayı | En fazla 3 rakam | Belirtilmedi |

#### Ham SVG'ye uygulanacak veriler

`30` text öğesine:

```html
data-editable-text="true"
data-text-key="speed"
data-text-label="Km/s"
data-text-type="number"
data-text-maxlength="3"
```

#### Text yerleşimi

Ham SVG'deki text öğesi `textLength="380"` ve `lengthAdjust="spacingAndGlyphs"` özelliklerine sahiptir. Üç haneli değer mevcut 380 birim genişliğe sığdırılır; text levhadan taşmaz ve gereksiz yatay büyüme oluşmaz.

#### Sabit SVG öğeleri

- Mavi zemin, beyaz çerçeve ve diğer grafik öğeleri değiştirilemez.
- Yalnızca hız sayısı düzenlenebilir.

#### Projedeki mevcut durum

TT-41a şu anda `Km/s` label'ına ve en fazla üç rakamlık sayısal girişe sahiptir. Mevcut sabit text genişliği üç haneli değerlerde de korunur. Tanzim levhaları yeniden üretilmeden önce yukarıdaki veriler ham SVG text öğesine eklenmelidir.

---

### Tanzim Levhaları — Mavi Renk Normalizasyonu

- Son kayıt tarihi: 2026-07-29
- Standart mavi renk: `#2255a6`
- Eski mavi renk: `#00408c`

#### Etkilenen levhalar

| Levha kodu | Katalog anahtarı / kapsam |
|---|---|
| `TT-35a`–`TT-35h` | Mecburi yön levhalarının sekiz varyantı |
| `TT-36a`–`TT-36c` | Sağdan, soldan ve her iki yandan gidiniz |
| `TT-37` | Ada etrafında dönünüz |
| `TT-38a`, `TT-38b` | Mecburi bisiklet yolu ve sonu |
| `TT-39a`, `TT-39b` | Mecburi yaya yolu ve sonu |
| `TT-40a`, `TT-40b` | Mecburi atlı yolu ve sonu |
| `TT-41a` | Mecburi asgari hız |
| `TT-42a`, `TT-42b` | Zincir takma mecburiyeti ve sonu |
| `TT-43` | Ağır taşıtlar ve tehlikeli madde taşıyan taşıtlar için mecburi yönün dört katalog varyantı |
| `TT-44a`, `TT-44b` | Yayalar ve bisikletliler tarafından kullanılabilen yol ve sonu |
| `TT-45a`, `TT-45b` | Yayalar ve bisikletliler için ayrı ayrı kullanılabilen yol ve sonu |

#### Projedeki mevcut durum

Yukarıdaki 29 katalog kaydında bulunan bütün `#00408c` mavi dolgular `#2255a6` olarak standartlaştırıldı. Katalog yeniden üretilecekse aynı renk dönüşümü ilgili ham SVG dosyalarına uygulanmalıdır.

---

## 2 Uyarı Levhaları

### T-3a — Tehlikeli Eğim (İniş)

- Ham SVG dosyası: `(T-3a) TEHLİKELİ EĞİM (İniş).svg`
- Katalog anahtarı: `2-uyari-levhalari/t-3a-tehlikeli-egim-inis`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Sınır |
|---|---|---|---|---|---|
| `10` | `Eğim %` | `slope` | Sayı | En fazla 2 rakam | Belirtilmedi |

#### Ham SVG'ye uygulanacak veriler

`%10` text öğesine:

```html
data-editable-text="true"
data-text-key="slope"
data-text-label="Eğim %"
data-text-type="number"
data-text-maxlength="2"
data-text-prefix="%"
```

`%` işareti sabit prefix'tir. Kullanıcı giriş alanında yalnızca `10` değerini değiştirir; levhada değer `%10` biçiminde gösterilir.

#### Sabit SVG öğeleri

- `%` işareti değiştirilemez.
- Yalnızca eğim sayısı düzenlenebilir.

#### Projedeki mevcut durum

T-3a şu anda tek `Eğim %` alanına ve en fazla iki rakamlık sayısal girişe sahiptir. `%` işareti sabit tutulur. Uyarı levhaları yeniden üretilmeden önce yukarıdaki veriler ham SVG text öğesine eklenmelidir.

---

### T-3b — Tehlikeli Eğim (Çıkış)

- Ham SVG dosyası: `(T-3b) TEHLİKELİ EĞİM (Çıkış).svg`
- Katalog anahtarı: `2-uyari-levhalari/t-3b-tehlikeli-egim-cikis`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Sınır |
|---|---|---|---|---|---|
| `10` | `Eğim %` | `slope` | Sayı | En fazla 2 rakam | Belirtilmedi |

#### Ham SVG'ye uygulanacak veriler

`%10` text öğesine:

```html
data-editable-text="true"
data-text-key="slope"
data-text-label="Eğim %"
data-text-type="number"
data-text-maxlength="2"
data-text-prefix="%"
```

`%` işareti sabit prefix'tir. Kullanıcı giriş alanında yalnızca `10` değerini değiştirir; levhada değer `%10` biçiminde gösterilir.

#### Sabit SVG öğeleri

- `%` işareti değiştirilemez.
- Yalnızca eğim sayısı düzenlenebilir.

#### Projedeki mevcut durum

T-3b şu anda tek `Eğim %` alanına ve en fazla iki rakamlık sayısal girişe sahiptir. `%` işareti sabit tutulur. Uyarı levhaları yeniden üretilmeden önce yukarıdaki veriler ham SVG text öğesine eklenmelidir.

---

### T-28a–T-30b — Demiryolu Geçidi Yaklaşım Levhaları

Bu gruptaki mesafe textleri levhanın standart ve sabit içeriğidir; kullanıcı tarafından değiştirilemez.

| Kod | Yön | Ham SVG dosyası | Katalog anahtarı | Sabit text |
|---|---|---|---|---|
| T-28a | Sağ | `(T-28a) DEMİRYOLU GEÇİDİ YAKLAŞIM LEVHALARI (Sağ).svg` | `2-uyari-levhalari/t-28a-demiryolu-gecidi-yaklasim-levhalari-sag` | `300 m` |
| T-28b | Sol | `(T-28b) DEMİRYOLU GEÇİDİ YAKLAŞIM LEVHALARI (Sol).svg` | `2-uyari-levhalari/t-28b-demiryolu-gecidi-yaklasim-levhalari-sol` | `300 m` |
| T-29a | Sağ | `(T-29a) DEMİRYOLU GEÇİDİ YAKLAŞIM LEVHALARI (Sağ).svg` | `2-uyari-levhalari/t-29a-demiryolu-gecidi-yaklasim-levhalari-sag` | `200 m` |
| T-29b | Sol | `(T-29b) DEMİRYOLU GEÇİDİ YAKLAŞIM LEVHALARI (Sol).svg` | `2-uyari-levhalari/t-29b-demiryolu-gecidi-yaklasim-levhalari-sol` | `200 m` |
| T-30a | Sağ | `(T-30a) DEMİRYOLU GEÇİDİ YAKLAŞIM LEVHALARI (Sağ).svg` | `2-uyari-levhalari/t-30a-demiryolu-gecidi-yaklasim-levhalari-sag` | `100 m` |
| T-30b | Sol | `(T-30b) DEMİRYOLU GEÇİDİ YAKLAŞIM LEVHALARI (Sol).svg` | `2-uyari-levhalari/t-30b-demiryolu-gecidi-yaklasim-levhalari-sol` | `100 m` |

- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: bütün levhalarda `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

Bu altı levhada değiştirilebilir text alanı yoktur.

#### Ham SVG'lere uygulanacak veri

Her levhanın mesafe text öğesine:

```html
data-editable-text="false"
```

#### Sabit text öğeleri

- T-28a ve T-28b içindeki `300 m` sabittir.
- T-29a ve T-29b içindeki `200 m` sabittir.
- T-30a ve T-30b içindeki `100 m` sabittir.

#### Projedeki mevcut durum

Altı levha da `src/adapters/trafficSignAdapter.js` içindeki değiştirilemez-text listesine eklenmiştir. Mesafe textleri levha üzerinde görünür fakat text veri giriş paneli açılmaz. Uyarı levhaları yeniden üretilmeden önce ilgili ham SVG text öğelerine `data-editable-text="false"` eklenmelidir.

---

## 3 Bilgi Levhaları

### B-14c — Yaya Bölgesi

- Ham SVG dosyası: `(B-14c) YAYA BÖLGESİ.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-14c-yaya-bolgesi`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk |
|---|---|---|---|---|
| `08,00` | `Başlangıç saati` | `start` | Saat | 5 karakter |
| `15,00` | `Bitiş saati` | `end` | Saat | 5 karakter |

#### Ham SVG'ye uygulanacak veriler

Başlangıç saati ham SVG'de ayrı `08,` ve `00` text öğelerinden oluşur. Her iki öğeye de:

```html
data-editable-text="true"
data-text-key="start"
data-text-label="Başlangıç saati"
data-text-type="clock"
data-text-mode="clock"
data-text-maxlength="5"
```

Bitiş saati ham SVG'de ayrı `15,` ve `00` text öğelerinden oluşur. Her iki öğeye de:

```html
data-editable-text="true"
data-text-key="end"
data-text-label="Bitiş saati"
data-text-type="clock"
data-text-mode="clock"
data-text-maxlength="5"
```

Saat girişinde `.` veya `:` kullanılırsa sistem bunu virgüle dönüştürür. Değer levhada `08,00` biçiminde iki SVG text öğesine dağıtılır.

#### Sabit text öğeleri

- `YAYA` değiştirilemez.
- `BÖLGESİ` değiştirilemez.
- `Taşıt Giremez` değiştirilemez.
- Başlangıç ve bitiş saatleri arasındaki `-` değiştirilemez.
- Bu sabit text öğelerine `data-editable-text` eklenmemelidir.

#### Projedeki mevcut durum

B-14c şu anda yalnızca `Başlangıç saati` ve `Bitiş saati` alanlarını düzenlemeye açar. Diğer bütün textler levhada görünür fakat veri giriş paneline dahil edilmez. Bilgi levhaları yeniden üretilmeden önce yukarıdaki veriler ilgili dört ham SVG saat text öğesine eklenmelidir.

---

### B-14d — Yaya Bölgesi

- Ham SVG dosyası: `(B-14d) YAYA BÖLGESİ.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-14d-yaya-bolgesi`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk |
|---|---|---|---|---|
| `08,00` | `Başlangıç saati` | `start` | Saat | 5 karakter |
| `15,00` | `Bitiş saati` | `end` | Saat | 5 karakter |

#### Ham SVG'ye uygulanacak veriler

Başlangıç saatini oluşturan `08,` ve `00` text öğelerinin her ikisine:

```html
data-editable-text="true"
data-text-key="start"
data-text-label="Başlangıç saati"
data-text-type="clock"
data-text-mode="clock"
data-text-maxlength="5"
```

Bitiş saatini oluşturan `15,` ve `00` text öğelerinin her ikisine:

```html
data-editable-text="true"
data-text-key="end"
data-text-label="Bitiş saati"
data-text-type="clock"
data-text-mode="clock"
data-text-maxlength="5"
```

Saat girişinde `.` veya `:` kullanılırsa sistem bunu virgüle dönüştürür. Değer levhada iki SVG text öğesine dağıtılır.

#### Sabit text öğeleri

- `YAYA` değiştirilemez.
- `BÖLGESİ` değiştirilemez.
- Başlangıç ve bitiş saatleri arasındaki `-` değiştirilemez.
- Bu sabit text öğelerine `data-editable-text` eklenmemelidir.

#### Projedeki mevcut durum

B-14d yalnızca `Başlangıç saati` ve `Bitiş saati` alanlarını düzenlemeye açar. Diğer textler veri giriş paneline dahil edilmez.

---

### B-14e ve B-14f — Yaya Bölgesi

- Ham SVG dosyaları: `(B-14e) YAYA BÖLGESİ.svg`, `(B-14f) YAYA BÖLGESİ.svg`
- Katalog anahtarları: `3-bilgi-levhalari/b-14e-yaya-bolgesi`, `3-bilgi-levhalari/b-14f-yaya-bolgesi`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçekleri değiştirilmedi.

#### Değiştirilebilir alanlar

Yoktur. Bu iki levhada bulunan bütün text öğeleri sabittir ve veri giriş paneli açılmamalıdır.

#### Ham SVG'ye uygulanacak veriler

B-14e ve B-14f içindeki bütün text öğelerine:

```html
data-editable-text="false"
```

#### Sabit text öğeleri

- B-14e: `YAYA`, `BÖLGESİ`, `Taşıt Giremez`, `Yükleme`, `Araçları Hariç`
- B-14f: `YAYA`, `BÖLGESİ`, `Yükleme`, `Araçları Hariç`

#### Projedeki mevcut durum

B-14e ve B-14f için düzenlenebilir text tanımı yoktur. Levhalardaki yazılar görünür kalır ancak veri giriş paneline dahil edilmez.

---

### B-16a ve B-16b — Tek Yönlü Yol

- Ham SVG dosyaları: `(B-16a) TEK YÖNLÜ YOL.svg`, `(B-16b) İLERİ TEK YÖNLÜ YOL.svg`
- Katalog anahtarları: `3-bilgi-levhalari/b-16a-tek-yonlu-yol`, `3-bilgi-levhalari/b-16b-ileri-tek-yonlu-yol`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçekleri değiştirilmedi.

#### Değiştirilebilir alanlar

Yoktur. Her iki levhadaki `TEK YÖN` texti sabittir ve veri giriş paneli açılmamalıdır.

#### Ham SVG'ye uygulanacak veriler

B-16a ve B-16b içindeki `TEK YÖN` text öğesine:

```html
data-editable-text="false"
```

#### Projedeki mevcut durum

B-16a ve B-16b için düzenlenebilir text tanımı yoktur. `TEK YÖN` yazısı levhada görünür kalır ancak veri giriş paneline dahil edilmez.

---

### B-23 — İlk Yardım

- Ham SVG dosyası: `(B-23) İLK YARDIM.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-23-ilk-yardim`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

Yoktur. Levhadaki acil çağrı numarasını oluşturan `1`, `1` ve `2` text öğeleri sabittir; veri giriş paneli açılmamalıdır.

#### Ham SVG'ye uygulanacak veriler

Acil çağrı numarasını oluşturan üç text öğesinin her birine:

```html
data-editable-text="false"
```

#### Projedeki mevcut durum

B-23 için düzenlenebilir text tanımı yoktur. `112` numarası levhada görünür kalır ancak veri giriş paneline dahil edilmez.

---

### B-49a — Tünel

- Ham SVG dosyası: `(B-49a) TÜNEL.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-49a-tunel`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

Yoktur. Levhadaki `TÜNEL` texti sabittir ve veri giriş paneli açılmamalıdır.

#### Ham SVG'ye uygulanacak veriler

`TÜNEL` text öğesine:

```html
data-editable-text="false"
```

#### Projedeki mevcut durum

B-49a için düzenlenebilir text tanımı yoktur. `TÜNEL` yazısı levhada görünür kalır ancak veri giriş paneline dahil edilmez.

---

### B-50a — Şerit Düzenleme Levhaları 2

- Ham SVG dosyası: `(B-50a) ŞERİT DÜZENLEME LEVHALARI 2.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-50a-serit-duzenleme-levhalari-2`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk |
|---|---|---|---|---|
| `50` | `Km/s` | `speed` | Sayı | En fazla 3 hane |

#### Ham SVG'ye uygulanacak veriler

`50` text öğesine:

```html
data-editable-text="true"
data-text-key="speed"
data-text-label="Km/s"
data-text-type="number"
data-text-maxlength="3"
data-text-fit-width="240"
data-text-fit-center-x="640"
```

#### Görünüm davranışı

- İki haneli varsayılan `50` değeri ham SVG'deki mevcut görünümünü korur.
- Üç haneli değer girildiğinde text genişliği `240` SVG birimiyle sınırlandırılır.
- Text merkezi `x="640"` konumunda tutulur; böylece sayı yuvarlak çerçeveyle üst üste binmez.

#### Projedeki mevcut durum

B-50a'nın text içermeyen `ŞERİT DÜZENLEME LEVHALARI 1` varyantı etkilenmez. Yalnızca ikinci varyanttaki `50` sayısı `Km/s` etiketiyle düzenlenebilir.

---

### B-50b — Şerit Düzenleme Levhaları 2

- Ham SVG dosyası: `(B-50b) ŞERİT DÜZENLEME LEVHALARI 2.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-50b-serit-duzenleme-levhalari-2`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk |
|---|---|---|---|---|
| `50` | `Km/s` | `speed` | Sayı | En fazla 3 hane |

Ham SVG'deki ayrı `5` ve `0` textleri veri giriş panelinde tek textbox olarak gösterilir.

#### Ham SVG'ye uygulanacak veriler

`5` ve `0` text öğelerinin her ikisine:

```html
data-editable-text="true"
data-text-key="speed"
data-text-label="Km/s"
data-text-type="number"
data-text-maxlength="3"
data-text-mode="splitTwoNaturalThree"
data-text-merge-center-x="600"
data-text-fit-width="240"
```

#### Görünüm davranışı

- İki haneli değerde rakamlar iki ayrı text öğesine dağıtılır. Ham SVG'deki `x="528"` ve `x="672"` konumları korunarak kırmızı şerit için mevcut boşluk bırakılır.
- Üç haneli değerde ilk text öğesi tek ve normal üç haneli sayıya dönüşür; ikinci text gizlenir.
- Üç haneli sayı `x="600"` merkezinde ve `240` SVG birimi genişliğinde gösterilerek yuvarlak çerçevenin içine sığdırılır.

#### Projedeki mevcut durum

B-50b'nin text içermeyen `ŞERİT DÜZENLEME LEVHALARI 1` varyantı etkilenmez. İkinci varyanttaki iki ayrı rakam tek `Km/s` alanı üzerinden birlikte değiştirilir.

---

### B-50c — Şerit Düzenleme Levhaları 2

- Ham SVG dosyası: `(B-50c) ŞERİT DÜZENLEME LEVHALARI 2.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-50c-serit-duzenleme-levhalari-2`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk |
|---|---|---|---|---|
| `50` | `Km/s` | `speed` | Sayı | En fazla 3 hane |

#### Ham SVG'ye uygulanacak veriler

`50` text öğesine:

```html
data-editable-text="true"
data-text-key="speed"
data-text-label="Km/s"
data-text-type="number"
data-text-maxlength="3"
data-text-fit-width="240"
data-text-fit-center-x="752"
```

#### Görünüm davranışı

- İki haneli varsayılan `50` değeri yeni ham SVG'deki görünümünü korur.
- Üç haneli değer `240` SVG birimi genişliğinde ve yeni hız çemberinin `x="752"` merkezinde gösterilir.
- Böylece üç haneli sayı 290 birim çaplı yuvarlak çerçevenin içine sığar.

#### Projedeki mevcut durum

B-50c'nin text içermeyen `ŞERİT DÜZENLEME LEVHALARI 1` varyantı etkilenmez. İkinci varyantın katalog geometrisi kullanıcı tarafından sağlanan yeni ham SVG ile değiştirilmiştir. Ham SVG de kaynak klasörde güncel olduğundan bu görsel değişim gelecekte elle tekrarlanacak bir bakım işlemi değildir; kaydın yeniden uygulanması gereken kısmı yalnızca yukarıdaki text verileridir.

---

### B-50d — Şerit Düzenleme Levhaları 2

- Ham SVG dosyası: `(B-50d) ŞERİT DÜZENLEME LEVHALARI 2.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-50d-serit-duzenleme-levhalari-2`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk |
|---|---|---|---|---|
| `50` | `Km/s` | `speed` | Sayı | En fazla 3 hane |

Ham SVG'deki `5 0` tek text öğesidir ve veri giriş panelinde tek textbox olarak gösterilir.

#### Ham SVG'ye uygulanacak veriler

`5 0` text öğesine:

```html
data-editable-text="true"
data-text-key="speed"
data-text-label="Km/s"
data-text-type="number"
data-text-maxlength="3"
data-text-mode="spacedTwoNaturalThree"
data-text-merge-center-x="940"
data-text-fit-width="240"
```

#### Görünüm davranışı

- İki haneli değerde rakamların arasına otomatik olarak bir boşluk konur; kırmızı şerit için mevcut açıklık korunur.
- Üç haneli değerde rakamlar boşluksuz, normal sayı biçiminde gösterilir.
- Üç haneli sayı `x="940"` merkezinde ve `240` SVG birimi genişliğinde gösterilerek yuvarlak çerçevenin içine sığdırılır.

#### Projedeki mevcut durum

B-50d'nin text içermeyen `ŞERİT DÜZENLEME LEVHALARI 1` varyantı etkilenmez. İkinci varyanttaki hız değeri tek `Km/s` alanı üzerinden değiştirilir.

---

### B-50f — Şerit Düzenleme Levhaları 3

- Ham SVG dosyası: `(B-50f) ŞERİT DÜZENLEME LEVHALARI 3.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-50f-serit-duzenleme-levhalari-3`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.
- Text davranışı TT-20 ile aynıdır.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Sınır |
|---|---|---|---|---|---|
| `2` | `M` | `whole` | Sayı | 1 rakam | 1–9 |
| `30` | `Cm` | `decimal` | Sayı | En fazla 2 rakam | Belirtilmedi |

#### Ham SVG'ye uygulanacak veriler

`2` text öğesine:

```html
data-editable-text="true"
data-text-key="whole"
data-text-label="M"
data-text-type="number"
data-text-maxlength="1"
data-text-min="1"
data-text-max="9"
```

`30` değeri ayrı `3` ve `0` text öğelerinden oluşur. Her iki öğeye de:

```html
data-editable-text="true"
data-text-key="decimal"
data-text-label="Cm"
data-text-type="number"
data-text-maxlength="2"
```

#### Sabit text öğeleri

- Ondalık ayırıcı `,` değiştirilemez.
- Birim metni `m` değiştirilemez.
- Bu iki text öğesine `data-editable-text` eklenmemelidir.

#### Projedeki mevcut durum

B-50f/3 yalnızca `M` ve `Cm` alanlarını düzenlemeye açar. B-50f/1’in şekil yapısı ve diğer B-50f varyantları bu değişiklikten etkilenmez.

---

### B-50f — Şerit Düzenleme Levhaları 4

- Ham SVG dosyası: `(B-50f) ŞERİT DÜZENLEME LEVHALARI 4.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-50f-serit-duzenleme-levhalari-4`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk |
|---|---|---|---|---|
| `80` | `Km/s(sol)` | `speed80` | Sayı | En fazla 3 hane |
| `50` | `Km/s(orta)` | `speed50` | Sayı | En fazla 3 hane |

Her hız değeri ham SVG'de iki ayrı rakam textinden oluşur fakat veri giriş panelinde tek textbox olarak gösterilir.

#### Ham SVG'ye uygulanacak veriler

Sol çemberdeki `8` ve `0` text öğelerinin her ikisine:

```html
data-editable-text="true"
data-text-key="speed80"
data-text-label="Km/s(sol)"
data-text-type="number"
data-text-maxlength="3"
data-text-mode="splitTwoNaturalThree"
data-text-merge-center-x="240"
data-text-fit-width="240"
```

Orta çemberdeki `5` ve `0` text öğelerinin her ikisine:

```html
data-editable-text="true"
data-text-key="speed50"
data-text-label="Km/s(orta)"
data-text-type="number"
data-text-maxlength="3"
data-text-mode="splitTwoNaturalThree"
data-text-merge-center-x="600"
data-text-fit-width="240"
```

#### Görünüm davranışı

- İki haneli değerlerde ham SVG'deki ayrı rakam konumları korunur.
- Üç haneli değerde ilgili iki text tek sayıya dönüşür ve ikinci text gizlenir.
- Sol sayı `x="240"`, orta sayı `x="600"` merkezinde; ikisi de `240` SVG birimi genişliğinde gösterilir.

#### Projedeki mevcut durum

B-50f/4 yalnızca sol `80` ve orta `50` hızlarını iki ayrı textbox ile düzenlemeye açar. Diğer B-50f varyantları etkilenmez.

---

### B-50g — Şerit Düzenleme Levhaları 2

- Ham SVG dosyası: `(B-50g) ŞERİT DÜZENLEME LEVHALARI 2.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-50g-serit-duzenleme-levhalari-2`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk |
|---|---|---|---|---|
| `50` | `Km/s` | `speed` | Sayı | En fazla 3 hane |

Ham SVG'deki `5 0` tek text öğesidir ve veri giriş panelinde tek textbox olarak gösterilir.

#### Ham SVG'ye uygulanacak veriler

`5 0` text öğesine:

```html
data-editable-text="true"
data-text-key="speed"
data-text-label="Km/s"
data-text-type="number"
data-text-maxlength="3"
data-text-mode="spacedTwoNaturalThree"
data-text-merge-center-x="260"
data-text-fit-width="240"
```

#### Görünüm davranışı

- İki haneli değerlerde rakamların arasına otomatik olarak bir boşluk konur; kırmızı şerit ile çakışmaları önlenir.
- Üç haneli değer boşluksuz, normal sayı biçiminde gösterilir.
- Üç haneli sayı `x="260"` merkezinde ve `240` SVG birimi genişliğinde gösterilerek yuvarlak çerçeveye sığdırılır.

#### Projedeki mevcut durum

B-50g'nin text içermeyen `ŞERİT DÜZENLEME LEVHALARI 1` varyantı etkilenmez. İkinci varyanttaki hız değeri tek `Km/s` alanı üzerinden değiştirilir.

---

### B-51a — Şerit Düzenleme Levhaları 3

- Ham SVG dosyası: `(B-51a) ŞERİT DÜZENLEME LEVHALARI 3.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-51a-serit-duzenleme-levhalari-3`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.
- Text davranışı TT-20 ve B-50f/3 ile aynıdır.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Sınır |
|---|---|---|---|---|---|
| `2` | `M` | `whole` | Sayı | 1 rakam | 1–9 |
| `30` | `Cm` | `decimal` | Sayı | En fazla 2 rakam | Belirtilmedi |

#### Ham SVG'ye uygulanacak veriler

`2` text öğesine:

```html
data-editable-text="true"
data-text-key="whole"
data-text-label="M"
data-text-type="number"
data-text-maxlength="1"
data-text-min="1"
data-text-max="9"
```

`30` değeri ayrı `3` ve `0` text öğelerinden oluşur. Her iki öğeye de:

```html
data-editable-text="true"
data-text-key="decimal"
data-text-label="Cm"
data-text-type="number"
data-text-maxlength="2"
```

#### Sabit text öğeleri

- Ondalık ayırıcı `,` değiştirilemez.
- Birim metni `m` değiştirilemez.
- Bu iki text öğesine `data-editable-text` eklenmemelidir.

#### Projedeki mevcut durum

B-51a/3 yalnızca `M` ve `Cm` alanlarını düzenlemeye açar. Diğer B-51a varyantları etkilenmez.

---

### B-51a — Şerit Düzenleme Levhaları 4

- Ham SVG dosyası: `(B-51a) ŞERİT DÜZENLEME LEVHALARI 4.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-51a-serit-duzenleme-levhalari-4`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk |
|---|---|---|---|---|
| `50` | `Km/s` | `speed` | Sayı | En fazla 3 hane |

Ham SVG'deki ayrı `5` ve `0` textleri veri giriş panelinde tek textbox olarak gösterilir.

#### Ham SVG'ye uygulanacak veriler

`5` ve `0` text öğelerinin her ikisine:

```html
data-editable-text="true"
data-text-key="speed"
data-text-label="Km/s"
data-text-type="number"
data-text-maxlength="3"
data-text-mode="splitTwoNaturalThree"
data-text-merge-center-x="600"
data-text-fit-width="240"
```

#### Görünüm davranışı

- İki haneli değerde ham SVG'deki ayrı rakam konumları korunur.
- Üç haneli değerde iki text tek sayıya dönüşür ve ikinci text gizlenir.
- Üç haneli sayı `x="600"` merkezinde ve `240` SVG birimi genişliğinde gösterilerek yuvarlak çerçeveye sığdırılır.

#### Projedeki mevcut durum

B-51a/4 yalnızca `50` hız değerini tek `Km/s` alanı üzerinden düzenlemeye açar. Diğer B-51a varyantları etkilenmez.

---

### B-51c — Şerit Düzenleme Levhaları 2

- Ham SVG dosyası: `(B-51c) ŞERİT DÜZENLEME LEVHALARI 2 .svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-51c-serit-duzenleme-levhalari-2`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk |
|---|---|---|---|---|
| `50` | `Km/s` | `speed` | Sayı | En fazla 3 hane |

Ham SVG'deki ayrı `5` ve `0` textleri veri giriş panelinde tek textbox olarak gösterilir.

#### Ham SVG'ye uygulanacak veriler

`5` ve `0` text öğelerinin her ikisine:

```html
data-editable-text="true"
data-text-key="speed"
data-text-label="Km/s"
data-text-type="number"
data-text-maxlength="3"
data-text-mode="splitTwoNaturalThree"
data-text-merge-center-x="900"
data-text-fit-width="240"
```

#### Görünüm davranışı

- İki haneli değerde ham SVG'deki ayrı rakam konumları korunur.
- Üç haneli değerde iki text tek sayıya dönüşür ve ikinci text gizlenir.
- Üç haneli sayı `x="900"` merkezinde ve `240` SVG birimi genişliğinde gösterilerek yuvarlak çerçeveye sığdırılır.

#### Projedeki mevcut durum

B-51c'nin text içermeyen `ŞERİT DÜZENLEME LEVHALARI 1` varyantı etkilenmez. İkinci varyanttaki `50` değeri tek `Km/s` alanı üzerinden değiştirilir.

---

### B-51d — Şerit Düzenleme Levhaları 2

- Ham SVG dosyası: `(B-51d) ŞERİT DÜZENLEME LEVHALARI 2.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-51d-serit-duzenleme-levhalari-2`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk |
|---|---|---|---|---|
| `80` | `Km/s(sol)` | `speed80` | Sayı | En fazla 3 hane |
| `50` | `Km/s(orta)` | `speed50` | Sayı | En fazla 3 hane |

Her hız değeri ham SVG'de ayrı bir text öğesidir ve veri giriş panelinde ayrı textbox olarak gösterilir.

#### Ham SVG'ye uygulanacak veriler

Sol çemberdeki `80` text öğesine:

```html
data-editable-text="true"
data-text-key="speed80"
data-text-label="Km/s(sol)"
data-text-type="number"
data-text-maxlength="3"
data-text-fit-width="240"
data-text-fit-center-x="280"
```

Orta çemberdeki `50` text öğesine:

```html
data-editable-text="true"
data-text-key="speed50"
data-text-label="Km/s(orta)"
data-text-type="number"
data-text-maxlength="3"
data-text-fit-width="240"
data-text-fit-center-x="600"
```

#### Görünüm davranışı

- İki haneli varsayılan değerler ham SVG'deki görünümlerini korur.
- Üç haneli sol değer `x="280"`, orta değer `x="600"` merkezinde gösterilir.
- Üç haneli değerlerin genişliği `240` SVG birimiyle sınırlandırılarak çemberlere sığdırılır.

#### Projedeki mevcut durum

B-51d'nin text içermeyen `ŞERİT DÜZENLEME LEVHALARI 1` varyantı etkilenmez. İkinci varyantta sol `80` ve orta `50` iki ayrı textbox üzerinden değiştirilir.

---

### B-53b — U Dönüşü Levhaları

- Ham SVG dosyası: `(B-53b) U DÖNÜŞÜ LEVHALARI.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-53b-u-donusu-levhalari`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

Yoktur. `U` ve `Dönüşü` textleri sabittir; veri giriş paneli açılmamalıdır.

#### Ham SVG'ye uygulanacak veriler

`U` ve `Dönüşü` text öğelerinin her birine:

```html
data-editable-text="false"
```

#### Sabit text öğeleri

- `U` değiştirilemez.
- `Dönüşü` değiştirilemez.
- Her iki textin `fill` değeri doğrudan text öğesi üzerinde `#fff` olmalıdır.

#### Projedeki mevcut durum

B-53b için düzenlenebilir text tanımı yoktur. Proje, eski generated kayıtta `#000000` olarak bulunan iki text fill değerini yalnızca bu levhada `#fff` olarak normalleştirir. Kullanıcıya verilen güncel ham SVG'de textler ortak `<g>` öğesinden çıkarılmış ve beyaz stilleri doğrudan üzerlerine yazılmıştır.

---

### B-53c–B-53g — U Dönüşü Levhaları

- Ham SVG dosyaları:
  - `(B-53c) U DÖNÜŞÜ LEVHALARI.svg`
  - `(B-53d) U DÖNÜŞÜ (Alt Geçit).svg`
  - `(B-53e) U DÖNÜŞÜ (Alt Geçit).svg`
  - `(B-53f) U DÖNÜŞÜ (Alt Geçit).svg`
  - `(B-53g) U DÖNÜŞÜ (Üst Geçit).svg`
- Katalog anahtarları:
  - `3-bilgi-levhalari/b-53c-u-donusu-levhalari`
  - `3-bilgi-levhalari/b-53d-u-donusu-alt-gecit`
  - `3-bilgi-levhalari/b-53e-u-donusu-alt-gecit`
  - `3-bilgi-levhalari/b-53f-u-donusu-alt-gecit`
  - `3-bilgi-levhalari/b-53g-u-donusu-ust-gecit`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçekleri değiştirilmedi.

#### Değiştirilebilir alanlar

Yoktur. Beş levhadaki `U` ve `Dönüşü` textleri sabittir; veri giriş paneli açılmamalıdır.

#### Ham SVG'ye uygulanacak veriler

Her levhadaki `U` ve `Dönüşü` text öğelerine:

```html
data-editable-text="false"
```

#### Sabit text öğeleri

- `U` değiştirilemez.
- `Dönüşü` değiştirilemez.
- Her iki textin `fill` değeri doğrudan text öğesi üzerinde `#fff` olmalıdır.

#### Projedeki mevcut durum

B-53c, B-53d, B-53e, B-53f ve B-53g için düzenlenebilir text tanımı yoktur. Proje renk düzeltmesini yalnızca bu levhalardaki `<text>` etiketlerine uygular; siyah yol ve şekiller etkilenmez. Kullanıcıya verilen ham SVG'lerde textleri saran ortak `<g>` kaldırılmış, beyaz stil ve değiştirilemez metadata doğrudan iki text öğesine taşınmıştır.

---

### B-56 ve B-57 — Yaya Öncelikli Yol

- Ham SVG dosyaları: `(B-56) YAYA ÖNCELİKLİ YOL.svg`, `(B-57) YAYA ÖNCELİKLİ YOLUN SONU.svg`
- Katalog anahtarları: `3-bilgi-levhalari/b-56-yaya-oncelikli-yol`, `3-bilgi-levhalari/b-57-yaya-oncelikli-yolun-sonu`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçekleri: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

Yoktur. Her iki levhadaki `Yaya Öncelikli Yol` texti sabittir ve veri giriş paneli açılmamalıdır.

#### Ham SVG'ye uygulanacak veriler

B-56 ve B-57 içindeki `Yaya Öncelikli Yol` text öğesine:

```html
data-editable-text="false"
```

#### Projedeki mevcut durum

B-56 ve B-57 için düzenlenebilir text tanımı yoktur. Yazı levhada görünür kalır ancak veri giriş paneline dahil edilmez.

---

### B-61b — Elektronik Denetleme Sistemi

- Ham SVG dosyası: `(B-61b) ELEKTRONİK DENETLEME SİSTEMİ.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-61b-elektronik-denetleme-sistemi`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

Yoktur. `Elektronik`, `Denetleme` ve `Sistemi` textleri sabittir; veri giriş paneli açılmamalıdır.

#### Ham SVG'ye uygulanacak veriler

Üç text öğesinin her birine:

```html
data-editable-text="false"
```

#### Sabit text öğeleri

- `Elektronik` değiştirilemez.
- `Denetleme` değiştirilemez.
- `Sistemi` değiştirilemez.
- Üç textin `fill` değeri doğrudan text öğesi üzerinde `#fff` olmalıdır.

#### Projedeki mevcut durum

B-61b için düzenlenebilir text tanımı yoktur. Proje eski generated kayıttaki siyah rengi yalnızca bu üç `<text>` etiketi için beyaza normalleştirir; diğer şekiller etkilenmez. Kullanıcıya verilen güncel ham SVG'de ortak text `<g>` öğesi kaldırılmış, grup stilleri ve değiştirilemez metadata doğrudan textlere taşınmıştır.

---

### B-61c — Elektronik Denetleme Sistemi

- Ham SVG dosyası: `(B-61c) ELEKTRONİK DENETLEME SİSTEMİ.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-61c-elektronik-denetleme-sistemi`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

Yoktur. `Elektronik`, `Denetleme` ve `Sistemi` textleri sabittir; veri giriş paneli açılmamalıdır.

#### Ham SVG'ye uygulanacak veriler

Üç text öğesinin her birine:

```html
data-editable-text="false"
```

#### Sabit text öğeleri

- `Elektronik` değiştirilemez.
- `Denetleme` değiştirilemez.
- `Sistemi` değiştirilemez.

#### Projedeki mevcut durum

B-61c için düzenlenebilir text tanımı yoktur. Üç yazı levhada görünür kalır ancak veri giriş paneline dahil edilmez.

---

### B-61d — Elektronik Denetleme Sistemi

- Ham SVG dosyası: `(B-61d) ELEKTRONİK DENETLEME SİSTEMİ.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-61d-elektronik-denetleme-sistemi`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Text sırası |
|---|---|---|---|---|---|
| `110` | `Otomobil (Km/s)` | `carSpeed` | Sayı | En fazla 3 hane | 1 |
| `100` | `Panelvan (Km/s)` | `panelVanSpeed` | Sayı | En fazla 3 hane | 2 |
| `90` | `Otobüs (Km/s)` | `busSpeed` | Sayı | En fazla 3 hane | 3 |
| `85` | `Kamyon (Km/s)` | `truckSpeed` | Sayı | En fazla 3 hane | 4 |

#### Ham SVG'ye uygulanacak veriler

Soldan sağa dört hız textine sırasıyla aşağıdaki metadata uygulanmalıdır:

```html
data-editable-text="true"
data-text-key="carSpeed"
data-text-label="Otomobil (Km/s)"
data-text-type="number"
data-text-maxlength="3"
```

```html
data-editable-text="true"
data-text-key="panelVanSpeed"
data-text-label="Panelvan (Km/s)"
data-text-type="number"
data-text-maxlength="3"
```

```html
data-editable-text="true"
data-text-key="busSpeed"
data-text-label="Otobüs (Km/s)"
data-text-type="number"
data-text-maxlength="3"
```

```html
data-editable-text="true"
data-text-key="truckSpeed"
data-text-label="Kamyon (Km/s)"
data-text-type="number"
data-text-maxlength="3"
```

#### Sabit text öğeleri

Yoktur.

#### Projedeki mevcut durum

B-61d içindeki `110`, `100`, `90` ve `85` hız değerleri birbirinden bağımsız olarak düzenlenebilir. Her alan en fazla üç rakam kabul eder. Üç haneli değerler kendi hız çemberlerinin merkezinde kalacak ve çerçeveye taşmayacak şekilde genişlikleri sınırlandırılarak gösterilir.

---

### B-61e — Elektronik Denetleme Sistemi

- Ham SVG dosyası: `(B-61e) ELEKTRONİK DENETLEME SİSTEMİ.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-61e-elektronik-denetleme-sistemi`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Text sırası |
|---|---|---|---|---|---|
| `Ortalama Hız Tespiti 3km` | `Ortalama hız tespiti metni` | `averageSpeedText` | Metin | En fazla 40 karakter | 1 |
| `82` | `Otomobil (Km/s)` | `carSpeed` | Sayı | En fazla 3 hane | 2 |
| `70` | `Otobüs (Km/s)` | `busSpeed` | Sayı | En fazla 3 hane | 3 |
| `70` | `Kamyon (Km/s)` | `truckSpeed` | Sayı | En fazla 3 hane | 4 |

#### Ham SVG'ye uygulanacak veriler

Üstteki uzun text:

```html
data-editable-text="true"
data-text-key="averageSpeedText"
data-text-label="Ortalama hız tespiti metni"
data-text-type="text"
data-text-maxlength="40"
```

Soldan sağa üç hız textine:

```html
data-editable-text="true"
data-text-key="carSpeed"
data-text-label="Otomobil (Km/s)"
data-text-type="number"
data-text-maxlength="3"
data-text-fit-width="70"
data-text-fit-center-x="230"
```

```html
data-editable-text="true"
data-text-key="busSpeed"
data-text-label="Otobüs (Km/s)"
data-text-type="number"
data-text-maxlength="3"
data-text-fit-width="70"
data-text-fit-center-x="350.3"
```

```html
data-editable-text="true"
data-text-key="truckSpeed"
data-text-label="Kamyon (Km/s)"
data-text-type="number"
data-text-maxlength="3"
data-text-fit-width="70"
data-text-fit-center-x="470.3"
```

#### Sabit text öğeleri

Yoktur.

#### Projedeki mevcut durum

B-61e içindeki üst açıklama ile `82`, `70` ve `70` hız değerleri birbirinden bağımsız olarak düzenlenebilir. Hız alanları en fazla üç rakam kabul eder; üç haneli değerler ilgili çemberin merkezinde ve çerçeve içinde tutulur. Üst açıklama mevcut `textLength="670"` genişliğini kullanarak levha içinde kalır. Metin alanında yazım sırasında girilen boşluklar korunur.

---

### B-61f — Elektronik Denetleme Sistemi

- Ham SVG dosyası: `(B-61f) ELEKTRONİK DENETLEME SİSTEMİ.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-61f-elektronik-denetleme-sistemi`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.12"`; eski `0.08` değerine göre %50 artırıldı.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Text sırası |
|---|---|---|---|---|---|
| `90` | `Otomobil (Km/s)` | `carSpeed` | Sayı | En fazla 3 hane | 2 |
| `85` | `Panelvan (Km/s)` | `panelVanSpeed` | Sayı | En fazla 3 hane | 3 |
| `80` | `Kamyon (Km/s)` | `truckSpeed` | Sayı | En fazla 3 hane | 4 |

#### Ham SVG'ye uygulanacak veriler

Kök levha grubundaki ölçek:

```html
data-sign-base-scale="0.12"
```

Soldan sağa üç hız textine:

```html
data-editable-text="true"
data-text-key="carSpeed"
data-text-label="Otomobil (Km/s)"
data-text-type="number"
data-text-maxlength="3"
data-text-fit-width="44"
data-text-fit-center-x="67"
```

```html
data-editable-text="true"
data-text-key="panelVanSpeed"
data-text-label="Panelvan (Km/s)"
data-text-type="number"
data-text-maxlength="3"
data-text-fit-width="44"
data-text-fit-center-x="167"
```

```html
data-editable-text="true"
data-text-key="truckSpeed"
data-text-label="Kamyon (Km/s)"
data-text-type="number"
data-text-maxlength="3"
data-text-fit-width="44"
data-text-fit-center-x="267"
```

#### Sabit text öğeleri

- `EDS` değiştirilemez.

#### Projedeki mevcut durum

B-61f krokiye `0.12` başlangıç ölçeğiyle eklenir. `90`, `85` ve `80` hız değerleri birbirinden bağımsız olarak düzenlenebilir ve en fazla üç rakam kabul eder. Üç haneli değerler küçük hız çemberlerinin içinde kalacak şekilde 44 birim genişliğe sığdırılır. `EDS` yazısı sabit kalır.

---

### B-61g — Elektronik Denetleme Sistemi

- Ham SVG dosyası: `(B-61g) ELEKTRONİK DENETLEME SİSTEMİ.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-61g-elektronik-denetleme-sistemi`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Text sırası |
|---|---|---|---|---|---|
| `3 Km` | `Mesafe` | `distance` | Metin | En fazla 20 karakter | 3 |
| `90` | `Otomobil (Km/s)` | `carSpeed` | Sayı | En fazla 3 hane | 5 |
| `85` | `Panelvan (Km/s)` | `panelVanSpeed` | Sayı | En fazla 3 hane | 6 |
| `80` | `Kamyon (Km/s)` | `truckSpeed` | Sayı | En fazla 3 hane | 7 |

#### Ham SVG'ye uygulanacak veriler

`3 Km` textine:

```html
data-editable-text="true"
data-text-key="distance"
data-text-label="Mesafe"
data-text-type="text"
data-text-maxlength="20"
data-text-mode="fitLongText"
data-text-fit-width="280"
data-text-fit-center-x="167"
data-text-fit-threshold="8"
```

Soldan sağa üç hız textine B-61f ile aynı şekilde:

```html
data-editable-text="true"
data-text-key="carSpeed"
data-text-label="Otomobil (Km/s)"
data-text-type="number"
data-text-maxlength="3"
data-text-fit-width="44"
data-text-fit-center-x="67"
```

```html
data-editable-text="true"
data-text-key="panelVanSpeed"
data-text-label="Panelvan (Km/s)"
data-text-type="number"
data-text-maxlength="3"
data-text-fit-width="44"
data-text-fit-center-x="167"
```

```html
data-editable-text="true"
data-text-key="truckSpeed"
data-text-label="Kamyon (Km/s)"
data-text-type="number"
data-text-maxlength="3"
data-text-fit-width="44"
data-text-fit-center-x="267"
```

#### Sabit text öğeleri

- `Ortalama` değiştirilemez.
- `Hız Tespiti` değiştirilemez.
- `EDS` değiştirilemez.

#### Projedeki mevcut durum

B-61g’de yalnızca `3 Km` mesafe texti ile `90`, `85` ve `80` hız değerleri düzenlenebilir. Mesafe alanı sayı ve birimi birlikte kabul eder; örneğin `49567 Metre` yazılabilir. Sekiz karakteri aşan mesafe metinleri levha içinde kalmaları için 280 birim genişliğe sığdırılır. Hız alanları B-61f’deki otomobil, panelvan ve kamyon sırasını kullanır ve en fazla üç rakam kabul eder.

---

### B-63a — Karayolu Denetim İstasyonu Bilgi Levhaları

- Ham SVG dosyası: `(B-63a) KARAYOLU DENETİM İSTASYONU BİLGİ LEVHALARI.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-63a-karayolu-denetim-istasyonu-bilgi-levhalari`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.04"`; eski `0.08` değerine göre %50 azaltıldı.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Text sırası |
|---|---|---|---|---|---|
| `300 m` | `Mesafe` | `distance` | Metin | En fazla 20 karakter | 3 |

#### Ham SVG'ye uygulanacak veriler

`300 m` textine:

```html
data-editable-text="true"
data-text-key="distance"
data-text-label="Mesafe"
data-text-type="text"
data-text-maxlength="20"
```

#### Sabit text öğeleri

- `Denetim` değiştirilemez ve `data-editable-text="false"` olmalıdır.
- `İstasyonu` değiştirilemez ve `data-editable-text="false"` olmalıdır.

#### Projedeki mevcut durum

B-63a krokiye `0.04` başlangıç ölçeğiyle eklenir. Yalnızca `300 m` mesafe texti düzenlenebilir. Mesafe alanı sayı ve birimi birlikte kabul eder. `Denetim` ve `İstasyonu` yazıları levhada görünür kalır ancak veri giriş paneline dahil edilmez.

---

### B-63b — Karayolu Denetim İstasyonu Bilgi Levhaları

- Ham SVG dosyası: `(B-63b) KARAYOLU DENETİM İSTASYONU BİLGİ LEVHALARI.svg`
- Katalog anahtarı: `3-bilgi-levhalari/b-63b-karayolu-denetim-istasyonu-bilgi-levhalari`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.04"`; eski `0.08` değerine göre %50 azaltıldı.

#### Değiştirilebilir alanlar

Yoktur. Veri giriş paneli açılmamalıdır.

#### Ham SVG'ye uygulanacak veriler

`Denetim` ve `İstasyonu` textleri B-63a’daki aynı adlı textlerin stil özelliklerini kullanmalıdır. Her iki text öğesine:

```html
data-editable-text="false"
```

Kök levha grubuna:

```html
data-sign-base-scale="0.04"
```

#### Sabit text öğeleri

- `Denetim` değiştirilemez.
- `İstasyonu` değiştirilemez.

#### Projedeki mevcut durum

B-63b krokiye `0.04` başlangıç ölçeğiyle eklenir. İki textin stili B-63a ile aynıdır ve düzenlenebilir text tanımı yoktur. Güncellenmiş ham SVG, katalog yeniden üretildiğinde kullanılmak üzere Masaüstüne verilmiştir.

---

### B-63c ve B-63d — Karayolu Denetim İstasyonu Bilgi Levhaları

- Ham SVG dosyaları: `(B-63c) KARAYOLU DENETİM İSTASYONU BİLGİ LEVHALARI.svg`, `(B-63d) KARAYOLU DENETİM İSTASYONU BİLGİ LEVHALARI.svg`
- Katalog anahtarları: `3-bilgi-levhalari/b-63c-karayolu-denetim-istasyonu-bilgi-levhalari`, `3-bilgi-levhalari/b-63d-karayolu-denetim-istasyonu-bilgi-levhalari`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçekleri: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Levha | Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk |
|---|---|---|---|---|---|
| B-63c | `70` | `Km/s` | `speed` | Sayı | En fazla 3 hane |
| B-63d | `50` | `Km/s` | `speed` | Sayı | En fazla 3 hane |

#### Ham SVG'ye uygulanacak veriler

Her levhadaki hız textine:

```html
data-editable-text="true"
data-text-key="speed"
data-text-label="Km/s"
data-text-type="number"
data-text-maxlength="3"
data-text-fit-width="210"
data-text-fit-center-x="376"
```

#### Sabit text öğeleri

Yoktur.

#### Projedeki mevcut durum

B-63c’deki `70` ve B-63d’deki kaynak değeri olan `50` ayrı levhalarda `Km/s` label’ıyla düzenlenebilir. Her iki alan en fazla üç rakam kabul eder. Üç haneli değerler hız çemberinde ortalanır ve 210 birim genişliğe sığdırılır.

---

### Bilgi Levhaları — Mavi Renk Normalizasyonu

- Son kayıt tarihi: 2026-07-29
- Standart mavi renk: `#2255a6`

#### Güncellenen levhalar

| Levha | Katalog anahtarı | Eski renk | Yeni renk |
|---|---|---|---|
| B-15 | `3-bilgi-levhalari/b-15-hastane` | `#285bab` | `#2255a6` |
| B-16a | `3-bilgi-levhalari/b-16a-tek-yonlu-yol` | `#285bab` | `#2255a6` |
| B-16b | `3-bilgi-levhalari/b-16b-ileri-tek-yonlu-yol` | `#285bab` | `#2255a6` |
| B-17 | `3-bilgi-levhalari/b-17-ileri-cikmaz-yol` | `#285bab` | `#2255a6` |
| B-20 | `3-bilgi-levhalari/b-20-motorlu-tasit-yolu-baslangici` | `#285bab` | `#2255a6` |
| B-21 | `3-bilgi-levhalari/b-21-motorlu-tasit-yolu-sonu` | `#285bab` | `#2255a6` |
| B-61c | `3-bilgi-levhalari/b-61c-elektronik-denetleme-sistemi` | `#00408c` | `#2255a6` |
| B-61d | `3-bilgi-levhalari/b-61d-elektronik-denetleme-sistemi` | `#00408c` | `#2255a6` |
| B-61e | `3-bilgi-levhalari/b-61e-elektronik-denetleme-sistemi` | `#00408c` | `#2255a6` |
| B-61f | `3-bilgi-levhalari/b-61f-elektronik-denetleme-sistemi` | `#00408c` | `#2255a6` |
| B-61g | `3-bilgi-levhalari/b-61g-elektronik-denetleme-sistemi` | `#00408c` | `#2255a6` |
| B-63a | `3-bilgi-levhalari/b-63a-karayolu-denetim-istasyonu-bilgi-levhalari` | `#00408c` | `#2255a6` |
| B-63b | `3-bilgi-levhalari/b-63b-karayolu-denetim-istasyonu-bilgi-levhalari` | `#00408c` | `#2255a6` |
| B-63c | `3-bilgi-levhalari/b-63c-karayolu-denetim-istasyonu-bilgi-levhalari` | `#00408c` | `#2255a6` |
| B-63d | `3-bilgi-levhalari/b-63d-karayolu-denetim-istasyonu-bilgi-levhalari` | `#00408c` | `#2255a6` |

#### Projedeki mevcut durum

Bilgi levhaları kataloğundaki `#285bab` ve `#00408c` mavi kullanımları `#2255a6` olarak birleştirilmiştir. Diğer renkler değiştirilmemiştir.

---

## 4 Durma ve Parketme Levhaları

### P-3 grubu — Mavi Renk Normalizasyonu

- Son kayıt tarihi: 2026-07-29
- Standart mavi renk: `#2255a6`
- P-1 ve P-2 kapsam dışıdır; renkleri değiştirilmemiştir.

#### Güncellenen levhalar

| Levha | Katalog anahtarı | Eski renk | Yeni renk |
|---|---|---|---|
| P-3c | `4-durma-ve-parketme/p-3c-park-yeri` | `#00408c` | `#2255a6` |
| P-3e | `4-durma-ve-parketme/p-3e-park-yeri` | `#00408c` | `#2255a6` |
| P-3f | `4-durma-ve-parketme/p-3f-kapali-park-yeri` | `#00408c` | `#2255a6` |
| P-3g | `4-durma-ve-parketme/p-3g-park-yeri-metrodan-yararlanacaklar-icin` | `#00408c` | `#2255a6` |
| P-3h | `4-durma-ve-parketme/p-3h-park-yeri-tramvaydan-yararlanacaklar-icin` | `#00408c` | `#2255a6` |

#### Projedeki mevcut durum

P-1 ve P-2 hariç Durma ve Parketme grubundaki bütün mavi renk kullanımları `#2255a6` olarak birleştirilmiştir. P-3a, P-3b ve P-3d zaten doğru renk kodunu kullandığı için değiştirilmemiştir.

---

## 5 Yapım, Bakım ve Onarım Levhaları

### YB-1a, YB-1b, YB-1c, YB-1d ve YB-3 — Tek Satırlı Metinler

- Ham SVG dosyaları: `(YB-1a) YAPIM-BAKIM BİLGİ LEVHASI (Yol Yapımı).svg`, `(YB-1b) YAPIM-BAKIM BİLGİ LEVHASI (Asfalt Yapımı).svg`, `(YB-1c) YAPIM-BAKIM BİLGİ LEVHASI (Yol Bakımı).svg`, `(YB-1d) YAPIM-BAKIM BİLGİ LEVHASI (Köprü Bakımı).svg`, `(YB-3) YAYA YÖNLENDİRME LEVHASI.svg`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçekleri: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Levha | Katalog anahtarı | Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Uzunluk | Kullanılabilir genişlik |
|---|---|---|---|---|---|---|
| YB-1a | `5-yapim-bakim-ve-onarim/yb-1a-yapim-bakim-bilgi-levhasi-yol-yapimi` | `Yol Yapımı` | `Metin` | `text` | En fazla 60 karakter | `1400`, merkez `760` |
| YB-1b | `5-yapim-bakim-ve-onarim/yb-1b-yapim-bakim-bilgi-levhasi-asfalt-yapimi` | `Asfalt Yapımı` | `Metin` | `text` | En fazla 60 karakter | `1690`, merkez `915` |
| YB-1c | `5-yapim-bakim-ve-onarim/yb-1c-yapim-bakim-bilgi-levhasi-yol-bakimi` | `Yol Onarımı` | `Metin` | `text` | En fazla 60 karakter | `1500`, merkez `817.5` |
| YB-1d | `5-yapim-bakim-ve-onarim/yb-1d-yapim-bakim-bilgi-levhasi-kopru-bakimi` | `Köprü Onarımı` | `Metin` | `text` | En fazla 60 karakter | `1800`, merkez `965` |
| YB-3 | `5-yapim-bakim-ve-onarim/yb-3-yaya-yonlendirme-levhasi` | `Yayalar` | `Metin` | `text` | En fazla 60 karakter | `830`, merkez `500` |

#### Ham SVG'ye uygulanacak veriler

Her levhadaki tek text öğesine aşağıdaki metadata uygulanmalı; `data-text-fit-width` ve `data-text-fit-center-x` değerleri yukarıdaki tabloya göre levha bazında kullanılmalıdır:

```html
data-editable-text="true"
data-text-key="text"
data-text-label="Metin"
data-text-type="text"
data-text-maxlength="60"
data-text-fit-width="LEVHAYA_ÖZEL_GENİŞLİK"
data-text-fit-center-x="LEVHAYA_ÖZEL_MERKEZ"
```

#### Sabit text öğeleri

Yoktur.

#### Projedeki mevcut durum

Beş levhanın her birinde tek bir `Metin` veri giriş alanı bulunur. Giriş tek satırlıdır ve boşluk kabul eder. Varsayılan metinden uzun girişler, levhanın siyah dış çerçevesine taşmadan ilgili levha için ayrılan genişliğe sığdırılır ve yatay merkezde tutulur.

---

## 6 Paneller

### Kontrol Kesimi Levhası

- Ham SVG dosyası: `KONTROL KESİMİ LEVHASI.svg`
- Katalog anahtarı: `6-paneller/kontrol-kesimi-levhasi`
- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçeği: `data-sign-base-scale="0.08"`; değiştirilmedi.

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk |
|---|---|---|---|---|
| `D110-03` | `Yol- Kesim No` | `roadNumber` | Metin | En fazla 12 karakter |
| `001` | `Kilometre` | `sectionNumber` | Sayı | En fazla 8 rakam |

#### Text yerleşimi

Alt bölümdeki `001` text öğesi görsel merkezleme için `y="285"` konumundan `y="300"` konumuna indirildi. Üst textin konumu değiştirilmedi.

#### Projedeki mevcut durum

Levha, `traffic-signs-kontrol-kesimi-custom.js` içindeki kurtarılmış özel katalog kaydından yüklenmektedir. İki text öğesine düzenlenebilir alan verileri eklendi ve aynı verileri içeren yeniden oluşturulmuş ham SVG `ham-svg-ciktilari` klasörüne kaydedildi.

---

### Panel Levhaları — Toplu Text Alanları

- Son kayıt tarihi: 2026-07-29
- Başlangıç ölçekleri değiştirilmedi.

#### Değiştirilebilir alanlar

| Levha | Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür / sınır |
|---|---|---|---|---|
| `PL-1` | `444m` | `Mesafe` | `distance` | Metin, en fazla 12 karakter |
| `PL-2` | `200m` | `Mesafe` | `distance` | Metin, en fazla 12 karakter |
| `PL-3` — Yön Panelleri 3 | `100m` | `Mesafe` | `distance` | Metin, en fazla 12 karakter |
| `PL-5` | `150m` | `Mesafe` | `distance` | Metin, en fazla 12 karakter |
| `PL-8` — Park Panelleri 1 | `100m` | `Mesafe` | `distance` | Metin, en fazla 12 karakter |
| `PL-8` — Park Panelleri 2 | `100m` | `Mesafe` | `distance` | Metin, en fazla 12 karakter |
| `PL-8` — Park Panelleri 3, üst | `100m` | `Mesafe` | `topDistance` | Metin, en fazla 12 karakter |
| `PL-8` — Park Panelleri 3, alt | `100m` | `Mesafe` | `bottomDistance` | Metin, en fazla 12 karakter |
| `PL-9` — Süre Panelleri | `30 Dakika` | `Metin` | `text` | Tek satır metin, en fazla 40 karakter |
| `PL-9` — Süre Panelleri 2, başlangıç | `08,00` | `Saat,Dakika` | `startTime` | Saat, en fazla 5 karakter |
| `PL-9` — Süre Panelleri 2, bitiş | `19,00` | `Saat,Dakika` | `endTime` | Saat, en fazla 5 karakter |
| `PL-15` — İki Yönlü Trafik 2 | `200m` | `Mesafe` | `distance` | Metin, en fazla 12 karakter |
| `PL-17` | `4,50m` | `Yükseklik` | `height` | Metin, en fazla 12 karakter; virgül kabul edilir |

#### PL-9 yerleşimi

`30 Dakika` text öğesindeki sürekli `textLength="450"` kullanımı kaldırıldı. Font boyutu `88` ve yatay merkez `x="300"` korunur. Dokuz karaktere kadar girilen kısa metinler doğal harf genişliğinde gösterilir; daha uzun metinler tek satırda kalacak ve 450 birimlik azami genişliğe sığacak şekilde ayarlanır.

`08,00-19,00` birleşik texti iki ayrı veri alanı oluşturmak için `08,00`, sabit `-` ve `19,00` olarak üç SVG text öğesine ayrıldı. Başlangıç ve bitiş saatleri birbirinden bağımsızdır.

#### Sabit text öğeleri

- `PL-5` içindeki `DUR` sabittir.
- `PL-9` — Süre Panelleri 2 içindeki `Taşıt`, `Giremez` ve iki saat arasındaki `-` sabittir.
- `PL-10` varyantlarındaki `Hariç` textleri sabittir.
- `PL-18` içindeki `Radar` texti sabittir.
- Yukarıda düzenlenebilir olarak listelenmeyen bütün panel textlerine `data-editable-text="false"` uygulanmalıdır.
- Özel katalogdan yüklenen Kontrol Kesimi Levhası, bir önceki kayıtta tanımlanan iki düzenlenebilir alanını korur.

#### Projedeki mevcut durum

Panel kataloğundaki 40 levhanın tamamı tarandı. SVG içinde text bulunan 14 levhadaki alanlar etiketlendi; saat aralığının ayrılmasıyla katalogda 20 text öğesi bulunur. Bunların 13'ü düzenlenebilir, 7'si sabittir.

---

## Yeni levha kaydı şablonu

```md
### LEVHA KODU — Levha Adı

- Ham SVG dosyası:
- Katalog anahtarı:
- Son kayıt tarihi:
- Başlangıç ölçeği:

#### Değiştirilebilir alanlar

| Varsayılan değer | Veri giriş label'ı | Alan anahtarı | Tür | Uzunluk | Sınır |
|---|---|---|---|---|---|

#### Ham SVG'ye uygulanacak veriler

#### Sabit text öğeleri

#### Projedeki mevcut durum
```


## PDF 141–151 bilgi levhaları — 14.10.2026

13 kayıt `src/data/traffic-signs-information.js`, geometri `src/core/trafficSignInformationLayout.js` içindedir. Başlangıç ölçeği 0.02; kaynak a değeri 100'e normalize edilir. Harfler SVG text, daireler arc; hareket sırasında DOM ölçümü yapılmaz.

| PDF / kod | Alanlar ve davranış |
|---|---|
| 141 / B-5d 1–2 | Beşbıçak/Büyükavşar tek parmak levha, Hamitler ayrı oklu levha. Yer adı ve isteğe bağlı sayısal mesafe; boş mesafe kendi genişliğini ve 9a boşluğu kaldırır. |
| 142 / B-6 1–2 | Havalimanı sabit beyaz dolgulu siyah konturlu text; iki yön biçimi. |
| 142 / B-7 | Sabit 1580×500; yalnız 500 m metni değişir, uzun metin kullanılabilir alana sığar. |
| 143 / B-8a | Sabit 2450×1700; bayrak ve kilitli TÜRKİYE. |
| 144 / B-8b | Minimum 1587×600; yalnız il adı değişir ve gerektiğinde genişler, İl sınırı kilitli. |
| 146 / B-9 | Üç örnek yerine tek yer adı profili, içerikle genişler. |
| 147 / B-10 | Aynı profil, kırmızı 3a çizgi metnin arkasında; genişlik değişince iç çerçevenin köşegenini takip eder. |
| 150 / B-12a–b | Sabit 1752×800; yalnız bölge/şube numarası değişir. Nokta ve tüm kelimeler kilitli. |
| 151 / B-12c | Sabit 2062×800; KARAYOLLARI kilitli, diğer iki satır değişir. |
| 151 / B-12d | Sabit 2320×1300; KARAYOLLARI kilitli, diğer dört satır değişir. |

Satır sayıları sabittir; boş satır silinmez ve yükseklik daralmaz. Sayısal alanlar 8, metin alanları 120 karakterdir. Çok uzun metinler sabit levhalarda yatay olarak sığdırılır. B-5b Turistik Mahal için de boş mesafe artık gereksiz genişlik bırakmaz.

Kaynak SHA-256:
- `141.pdf`: `8cbd6a2cbf998d2fe0708235365da34d648a46ecd408a42bf50d155df3d93237`
- `142.pdf`: `1c8113ce265008ae37b56022ac72e520fa8c55534e904d9ab328682673665ac6`
- `143.pdf`: `750329c294cd58cbf563f2151c82476a25bc9c628797178df4aa136f6bdc5d22`
- `144.pdf`: `3125c1995cf54bd9d777f7ae90052961de194ab4193f730dedbbc60bc5ac5686`
- `146.pdf`: `7d4ed18b7bdc9460d0ba5c400e0a36538919de0af9bc0e291c2624dd85676d2e`
- `147.pdf`: `c9df23d351d97cdeb463f460a2795a0aa6df85328fb48fd56b79b3c31cbd4744`
- `150.pdf`: `e6facabf0e7fcab4fbe85e2900b3a6b5332265d0e51e35b69cae90af29c4c4a7`
- `151.pdf`: `d7b51c174f4761739d49667605f1b1b635117851d3ca8b3704b0d8b0370689f0`


## B-12e–i ve B-13b — 14.10.2026

- B-12e: `line2=Köroğlu`, `line3=Dinlenme Parkı`; KARAYOLLARI kilitli.
- B-12f: `line2=6. Bölge Sınırı`, `line3=64. Şube Sınırı`; KARAYOLLARI kilitli.
- B-12g: `number=64` (8 rakam); nokta, Şube, Sınırı ve KARAYOLLARI kilitli.
- B-12h: KARAYOLLARI / Sorumluluk Sahası / Başlangıcı; bütün satırlar kilitli.
- B-12i: KARAYOLLARI / Sorumluluk Sahası / Sonu; bütün satırlar kilitli.
- B-13a: iptal; hiçbir varyantı eklenmez.
- B-13b: `place1=Bolu`, `distance1=28`, `place2=İstanbul`, `distance2=290`; dört ayrı metin alanı (120 karakter). İçeriğe göre genişler, minimum genişlik 48a; iki satır sabittir.
- Başlangıç ölçeği 0.02; sabit levhalarda uzun metin sığdırılır, satırlar artırılmaz.
- Kaynak: `152 153 154 155.pdf`, SHA-256: `7244ca70e6362758928672c44ed9c075bafc95703b833b6d9d37ba836eebad35`.
