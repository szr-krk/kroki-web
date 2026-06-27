# Menü Sistemi

Menü sistemi üç ayrı UI katmanından oluşur: normal durumda görünen sağ ana ray, seçim sırasında onun yerini alan sağ özellik rayı ve canvas üstünde açılan nesne işlem çubuğu. Sol üstteki Undo/Redo grubu ayrı bir yüzen araç çubuğudur.

## İlgili kod dosyaları

- `index.html`: bütün düğme ve panel DOM'u.
- `src/editor-rail.js`: sağ ray panel açma/kapama, çizim aracı seçimi, tam ekran ve viewBox sıfırlama.
- `src/editor-object-edit.js`: üst ve yan bağlamsal araç çubuğu referansları.
- `src/core/styleManager.js`: seçili adapter yeteneklerine göre sağ özellik kontrolleri.
- `src/ui/roadInspector.js`: yol bağlamsal kontrolleri.
- `src/editor.css`, `src/editor-line.css`: ray, panel ve araç çubuğu yerleşimi.

Bağlantılar: [[Editör]], [[Seçim Sistemi]], [[Yol Sistemi]], [[Trafik Levhası Sistemi]].

## Sağ ana ray

`.editor-rail` ekranın sağında 76 px genişliğindedir. Düğmeler:

1. Ana Menü (`railMenuAna`)
2. Çizim Araçları (`railMenuCizim`)
3. Yol Ekle (`railMenuYol`)
4. Araç Ekle (`railMenuArac`)
5. Levha Ekle (`railMenuLevha`)
6. Diğer Sembol Ekle (`railMenuDiger`)
7. Ekrana Sığdır

Bir panel açıldığında diğer ray panelleri kapanır. `Escape` bütün ray panellerini kapatır. Ana menü ve çizim panelinde dışarı tıklama da kapatır; kütüphane panelleri kendi “Kapat” düğmelerini kullanır.

## Ana menü

DOM'da şu komutlar vardır:

- Tam Ekran
- Resim Olarak Kaydet
- Alanı Resim Kaydet
- Kaydet
- Kaydet ve Çık
- Kaydetmeden Çık
- Şablonlarıma Kaydet
- SVG Olarak Kaydet
- Yeni Kroki

Yalnız **Tam Ekran** için gerçek işlem dinleyicisi vardır. Diğer düğmeler `editor-rail.js` tarafından yalnız paneli kapatacak şekilde dinlenir; kaydetme/çıkış/yeni belge davranışı bağlı değildir. Kalıcılık çekirdeği için [[Serializer]] bölümüne bakın.

## Çizim araçları paneli

Araçlar: çizgi, arc, quadratic Bezier, cubic Bezier, daire, elips, dikdörtgen, metin, callout ve kapalı quadratic şekil. Seçilen aracın ikonu raydaki “Çizim Araçları” düğmesine taşınır ve aktif araç global state'e yazılır. Yeni araç seçimi mevcut tekli seçimi temizler.

Çizim davranışı: [[Editör#Çizim akışı]].

## Kütüphane panelleri

- **Yol Ekle:** çalışan `RoadBuilder` formu; profil, yön, normal/bölünmüş tür, banket, bariyer ve şerit sayısı sunar. [[Yol Sistemi#Road Builder]].
- **Levha Ekle:** çalışan kategori ve levha grid'i. [[Trafik Levhası Sistemi]].
- **Araç Ekle:** boş yer tutucu.
- **Diğer Sembol Ekle:** boş yer tutucu.

## Üst araç çubuğu

`#editorTopIp` bir seçim varken görünür. İşlemler:

- Tamam: seçimi/düzenlemeyi bitirir ve aktif çizim aracını sıfırlar.
- Kopyala
- Çoklu Seç
- Grupla: en az iki seçim birimi olduğunda görünür.
- Grubu Çöz: aktif grup seçiliyken görünür.
- Öne Getir
- Arkaya Gönder
- Sil

İşlemlerin tekli/çoklu davranışları için [[Seçim Sistemi]], katman kuralları için [[Nesne Sistemi#Katman sırası]] bölümüne bakın.

## Sağ özellik rayı

`#editorSideIp`, seçim sırasında aynı sağ alanı ve daha yüksek `z-index`i kullanarak ana rayın üstüne gelir. `StyleManager`, adapter `capabilities` alanına göre kontrolleri gösterir:

- Çizgi/şekil: stroke rengi, kalınlık, opaklık, çizgi stili ve uç tipi.
- Dolgulu şekil: dolgu rengi, dolgu opaklığı ve pattern.
- Ok destekleyen tip: başlangıç/bitiş oku ve snap düğmesi.
- Metin destekleyen tip: metin paneli ve hizalama/biçim kontrolleri.
- Kapalı şekil: nokta düzenleme modu.
- Yol: Road Inspector kontrolleri; genel, kesit ve bariyer modları birbirini dışlar.
- Trafik levhası: yüzde ölçek ve derece dönüş; varsa levha içi metin alanı.

Grup veya grup birimleri seçildiğinde sağ ray `is-empty` olur ve stil panelleri kapatılır. Saf çoklu nesne seçiminde ortak uygulanabilir stil, adapter yeteneklerine göre filtrelenerek uygulanabilir.

## Yüzen geçmiş çubuğu

Sol üstte yalnız Undo ve Redo vardır. Düğmeler `HistoryManager.onChange` ile etkin/pasif olur. Ayrıntı: [[Undo Redo]].

## Belirsiz

- Ana menüdeki bağlı olmayan komutların hedef dosya formatı ve çıkış davranışı tanımlı değildir.
- “Araç Ekle” ve “Diğer Sembol Ekle” kataloglarının veri kaynağı belli değildir.

