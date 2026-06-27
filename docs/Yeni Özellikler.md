# Yeni Özellikler

Bu sayfa mevcut UI'da açıkça yer tutucu olarak bulunan veya çekirdeği olup entegrasyonu eksik kalan işleri toplar. Aşağıdakiler mevcut özellik gibi değerlendirilmemelidir.

## İlgili kod dosyaları

- `index.html`, `src/home.js`, `src/editor-rail.js`: görünür fakat bağlı olmayan girişler.
- `src/core/documentSerializer.js`: kaydet/yükle için hazır çekirdek.
- `src/ui/roadBuilder.js`, `src/core/roadIntersectionEngine.js`: hazır yol/kavşak fikrinin temel modelleri.
- `src/ui/trafficSignLibrary.js`: gelecekteki katalog panelleri için çalışan örnek.

Bağlantılar: [[Açık Hatalar]], [[Home]], [[Menü Sistemi]], [[Serializer]].

## Kodda açıkça bekleyen özellikler

### Kalıcı belge kaydet/yükle

Ana menüde Kaydet/Kaydet ve Çık; Home'da Son Krokiler görünür. `DocumentSerializer` JSON API'si hazırdır. Eksik olanlar: kullanıcı depolama seçimi, dosya/yerel kayıt kimliği, hata UX'i, açma akışı ve Home listesinin beslenmesi.

### SVG içe/dışa aktarma

Home'da SVG Yükle, editör ana menüsünde SVG Olarak Kaydet vardır. `EditorObjectManager.syncFromDom/readFromElement` bazı bilinen SVG öğelerini modele okuyabilir; buna rağmen genel SVG parser, adapter'a dönüşüm politikası, desteklenmeyen öğeler ve export uygulaması yoktur.

### Resim dışa aktarma

“Resim Olarak Kaydet” ve “Alanı Resim Kaydet” UI'si var; rasterizasyon, alan seçimi ve indirme bağlı değildir.

### Şablonlarım

Home modalı ve “Şablonlarıma Kaydet” komutu var. Şablon veri formatı, adlandırma, listeleme, kopya id eşleme ve depolama yoktur.

### Hazır yollar ve hazır kavşaklar

Home modalları yer tutucudur. Yol için `RoadBuilder` model üretimi mevcut; kavşak ise ayrı nesne değil türetilmiş yol ilişkisidir. Hazır kavşak özelliği tasarlanırken birden çok yol + Q edit state'ini şablon olarak konumlandırma ve id eşleme gerekir.

### Araç ve diğer sembol kütüphaneleri

Sağ ray panelleri vardır fakat içerik boştur. [[Trafik Levhası Sistemi]] kategori/grid/add akışı benzer katalog UI'si için mevcut referanstır; veri ve adapter tipi henüz yoktur.

### Kılavuz

Home Kılavuz düğmesi yalnız alert verir. İçerik/route/panel tanımlı değildir.

## Çekirdekte olup UI'da görünmeyen seçenekler

### Yol kavşak katılımı ve köprü

Road config `autoIntersection` ve `bridge` alanlarını destekler; Intersection Engine bunlara göre yolu dışlar. Road Builder/Inspector kontrolü yoktur.

### Kavşak debug ve Q sıfırlama

Engine `setDebug` ve `resetQEndpointEdits` API'lerini açar. UI düğmesi yoktur.

### JSON import/export

`toJson/fromJson` API'si mevcuttur; geliştirici konsolu dışında görünür giriş yoktur.

## Özellik eklerken mimari sınırlar

- Yeni çizilebilir tip için adapter + registry + doğru script sırası gerekir. [[Nesne Sistemi#Adapter sözleşmesi]].
- Yol/kavşak şablonu generic grup değildir; yollar çoklu seçim ve gruplama dışındadır.
- Kaydetme, serializer JSON'u ile SVG/resim exportunu birbirinden ayırmalıdır.
- Dış JSON/SVG alımında trafik levhası `signArt` ve SVG `innerHTML` güveni ele alınmalıdır.
- Yeni mutasyonlar [[Undo Redo]] transaction sınırına bağlanmalıdır.

## Belirsiz

- Öncelik, hedef platform, dosya API'si ve şablon depolama kararı kodda yoktur.
- “Alanı Resim Kaydet” için alanın kullanıcı seçimi mi, mevcut viewBox mı, yoksa nesne bounds'u mu olacağı tanımlı değildir.

