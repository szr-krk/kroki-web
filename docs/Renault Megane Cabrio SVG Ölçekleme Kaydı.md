# Renault Mégane Cabrio SVG Ölçekleme Kaydı

Bu belge, kullanıcıdan gelen `top.svg`, `side.svg` ve `reverse.svg` dosyalarının gerçek araç ölçüsüne bağlanırken görüntü oranının bozulmaması için uygulanan yöntemi kaydeder.

## Araç ve ölçü kaynağı

Çizim, dört kişilik Renault Mégane Coupé-Cabriolet olarak ele alınmıştır. Renault'nun resmî model broşüründeki ölçüler kullanılmıştır:

- Uzunluk: 4485 mm
- Gövde genişliği: 1811 mm
- Aynalar açık toplam genişlik: 2072 mm
- Yükseklik: 1434 mm
- Kaynak: https://www.renault.com.gr/additionalFiles/MEGANE_CC.pdf

Üst SVG'de dış aynalar bulunduğu için genişlik hesabında 2072 mm kullanılır.

## Kroki ölçeği

Katalog standardı `3,5 metre = 50 birim`, yani `14,285714 birim/metre` değeridir.

Bu ölçekte dış kutular:

- Uzunluk: `4,485 × 50 / 3,5 = 64,071429 birim`
- Üst/reverse genişliği: `2,072 × 50 / 3,5 = 29,600000 birim`
- Yan görünüş yüksekliği: `1,434 × 50 / 3,5 = 20,485714 birim`

## Oranı koruyan ortak ölçek

Kaynak üst SVG `840 × 424`, yan SVG `840 × 280`, reverse SVG `840 × 424` boyutundadır. X ve Y eksenlerinde farklı katsayı kullanmak görüntüyü ezer veya uzatır. Bu nedenle tek katsayı kullanılır:

`ortak ölçek = 29,6 / 424 = 0,069811320755`

Yuvarlanmış uygulama değeri `0,069811` olur. Her görünüşte matrisin X ve Y katsayıları eşittir.

- Ölçeklenmiş üst görüntü uzunluğu: `840 × 0,069811 = 58,64124 birim`
- Üst ve reverse yatay merkezleme: `(64,071429 - 58,64124) / 2 = 2,715 birim`
- Ölçeklenmiş yan görüntü yüksekliği: `280 × 0,069811 = 19,54708 birim`
- Yan dikey merkezleme: `(20,485714 - 19,54708) / 2 = 0,469 birim`

Kullanılan matrisler:

- Top: `matrix(0.069811 0 0 0.069811 2.715 0)`
- Side: `matrix(0.069811 0 0 0.069811 2.715 0.469)`
- Reverse: `matrix(0.069811 0 0 0.069811 2.715 0)`

## Gelecekte uygulanacak kural

1. Gerçek uzunluk, genişlik ve yükseklik güvenilir üretici kaynağından doğrulanır.
2. Kaynak SVG dış aynaları içeriyorsa aynalar açık genişlik kullanılır.
3. Önce top görünüş gerçek ölçek kutusuna `meet` mantığıyla, tek X/Y katsayısı kullanılarak sığdırılır.
4. Side görünüşün yatay ölçeği yeniden hesaplanmaz; top için bulunan aynı katsayı ve aynı çizim uzunluğu kullanılır.
5. Reverse görünüş top ile aynı dış kutuyu, ölçeği ve yatay ofseti kullanır.
6. `scaleX !== scaleY` olan bir araç dönüşümü oran hatası kabul edilir.
7. Görünüş değişiminde top, side ve reverse dış kutularının uzunluğu aynı kalmalıdır.

İlgili temiz SVG dosyaları `ARAÇLAR/05 Otomobil/Dört Kişilik Üstü Açık Spor Otomobil/` klasöründe saklanır.
