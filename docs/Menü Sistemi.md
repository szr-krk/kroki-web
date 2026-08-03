# Menü Sistemi

Menü sistemi üç ayrı UI katmanından oluşur: normal durumda görünen sağ ana ray, seçim sırasında onun yerini alan sağ özellik rayı ve canvas üstünde açılan nesne işlem çubuğu. Sol üstteki Undo/Redo grubu ayrı bir yüzen araç çubuğudur.

## İlgili kod dosyaları

- `index.html`: bütün düğme ve panel DOM'u.
- `src/editor-rail.js`: sağ ray panel açma/kapama, çizim aracı seçimi, tam ekran ve viewBox sıfırlama.
- `src/editor-main-menu.js`: ana menü kayıt/export/import/yeni belge komutları, Home son kayıt/şablon listeleri ve alan export aracı.
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

Ray ve kütüphane içindeki etkileşimli seçenekler ortak bir görsel dil kullanır: seçili durumda dolu vurgu rengi ve hafif gölge, klavye odağında ise kalın iç strok yerine zarif dış gölge gösterilir. Çizim araçları, yol seçenekleri, araç tür/varyant listeleri ve sembol kategorileri bu ortak davranışı paylaşır.

## Ana menü

DOM'da şu komutlar vardır ve `editor-main-menu.js` tarafından bağlanır:

- Tam Ekran
- Resim Olarak Kaydet
- Alanı Resim Kaydet
- Kaydet
- Kaydet ve Çık
- Kaydetmeden Çık
- Şablonlarıma Kaydet
- SVG Olarak Kaydet
- Yeni Kroki

- **Tam Ekran:** document fullscreen API'si.
- **Resim Olarak Kaydet:** belge varsa içeriğe fit eder, recent kaydı alır, PNG indirir ve Home'a döner.
- **Alanı Resim Kaydet:** canvas üzerinde sürüklenebilir/resize edilebilir alan kutusu açar ve seçilen viewBox'ı PNG indirir.
- **Kaydet:** belgeyi `localStorage` recent listesine yazar.
- **Kaydet ve Çık:** recent kaydı alır, belgeyi sıfırlar ve Home'a döner.
- **Kaydetmeden Çık:** onay alır, belgeyi sıfırlar ve Home'a döner.
- **Şablonlarıma Kaydet:** ad ister, belgeyi template listesine yazar ve Home'a döner.
- **SVG Olarak Kaydet:** content bounds'a göre SVG indirir; içine Kroki Pro belge metadata'sı gömer.
- **Yeni Kroki:** onay alır, belgeyi sıfırlar ve editörde boş belge açar.

Kalıcılık formatı için [[Serializer]], Home listeleri için [[Home]].

## Çizim araçları paneli

Araçlar: çizgi, arc, quadratic Bezier, cubic Bezier, daire, elips, dikdörtgen, metin, callout ve kapalı quadratic şekil. Seçilen aracın ikonu raydaki “Çizim Araçları” düğmesine taşınır ve aktif araç global state'e yazılır. Yeni araç seçimi mevcut tekli seçimi temizler.

Çizim davranışı: [[Editör#Çizim akışı]].

## Kütüphane panelleri

- **Yol Ekle:** çalışan `RoadBuilder` formu; profil, yön, normal/bölünmüş tür, banket, bariyer ve şerit sayısı sunar. [[Yol Sistemi#Road Builder]].
- **Levha Ekle:** çalışan kategori ve levha grid'i. [[Trafik Levhası Sistemi]].
- **Araç Ekle:** araç katalog grid'i; seçilen araç canvas merkezine eklenir.
- **Diğer Sembol Ekle:** insan, hayvan ve çevre elemanları katalog grid'i; seçilen sembol `otherSymbol` nesnesi olarak eklenir ve levha ile aynı seçim/düzenleme kontrollerini kullanır.

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
- Trafik levhası ve diğer sembol: yüzde ölçek ve derece dönüş; varsa katalog art'ı içindeki metin alanı.

Grup veya grup birimleri seçildiğinde sağ ray `is-empty` olur ve stil panelleri kapatılır. Saf çoklu nesne seçiminde ortak uygulanabilir stil, adapter yeteneklerine göre filtrelenerek uygulanabilir.

## Yüzen geçmiş çubuğu

Sol üstte yalnız Undo ve Redo vardır. Düğmeler `HistoryManager.onChange` ile etkin/pasif olur. Ayrıntı: [[Undo Redo]].

## Belirsiz

- PNG export büyük viewBox'larda RAM tüketebilir; çıktı boyutu `editor-main-menu.js` içinde sınırlandırılır.
- Hazır yol/kavşak Home modalları hâlâ ürün akışı olarak bağlı değildir.
