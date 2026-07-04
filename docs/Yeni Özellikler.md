# Yeni Özellikler

Bu sayfa mevcut UI'da açıkça yer tutucu olarak bulunan veya çekirdeği olup entegrasyonu eksik kalan işleri toplar. Aşağıdakiler mevcut özellik gibi değerlendirilmemelidir.

## İlgili kod dosyaları

- `index.html`, `src/home.js`, `src/editor-rail.js`, `src/editor-main-menu-pro.js`: görünür girişler, kayıt/export ve Home liste akışları.
- `src/core/documentSerializer.js`: kaydet/yükle için kullanılan çekirdek.
- `src/ui/roadBuilder.js`, `src/core/roadIntersectionEngine.js`: hazır yol/kavşak fikrinin temel modelleri.
- `src/ui/trafficSignLibrary.js`: gelecekteki katalog panelleri için çalışan örnek.

Bağlantılar: [[Açık Hatalar]], [[Home]], [[Menü Sistemi]], [[Serializer]].

## Kodda açıkça bekleyen özellikler

### Kalıcı belge kaydet/yükle geliştirmeleri

Ana menü ve Home localStorage üzerinden son kroki/şablon kaydı yapar. Eksik olanlar: dosya sistemi veya kullanıcı seçimli kayıt yeri, quota yönetimi, schema migration, doğrudan `.json` indir/yükle UI'si ve uzun vadeli kayıt kimliği politikasıdır.

### SVG içe/dışa aktarma

Home'da SVG Yükle, editör ana menüsünde SVG Olarak Kaydet vardır. Mevcut import yalnız Kroki Pro imzalı SVG içindeki belge metadata'sını açar; genel SVG parser, adapter'a dönüşüm politikası ve desteklenmeyen öğe akışı yoktur.

### Resim dışa aktarma geliştirmeleri

“Resim Olarak Kaydet” ve “Alanı Resim Kaydet” bağlıdır. Geliştirilecek alanlar: çıktı kalite seçenekleri, büyük belgelerde RAM uyarısı, alan aracının mobil ergonomisi ve export sonrası kullanıcı geri bildirimi.

### Şablonlarım geliştirmeleri

Şablon kaydetme, adlandırma, listeleme, önizleme, silme ve düzenle açışı localStorage ile bağlıdır. Eksik olanlar: kategori/etiket, sıralama, dışa aktarma, cihazlar arası taşıma ve hazır şablon setidir.

### Hazır yollar ve hazır kavşaklar

Home modalları yer tutucudur. Yol için `RoadBuilder` model üretimi mevcut; kavşak ise ayrı nesne değil türetilmiş yol ilişkisidir. Hazır kavşak özelliği tasarlanırken birden çok yol + Q edit state'ini şablon olarak konumlandırma ve id eşleme gerekir.

### Araç ve diğer sembol kütüphaneleri

Araç ve diğer sembol sağ ray panelleri katalog verisiyle çalışır. Diğer semboller teknik olarak ayrı `otherSymbol` nesne tipidir; seçim, kopyalama, gruplama, ratiolu ölçek ve döndürme akışında levha ile aynı `catalogObject` kontrol davranışını paylaşır.

### Kılavuz

Home Kılavuz düğmesi yalnız dialog mesajı verir. İçerik/route/panel tanımlı değildir.

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

- Öncelik, hedef platform, dosya API'si ve localStorage dışı depolama kararı kodda yoktur.
- Hazır yol/kavşak içeriklerinin ürün formatı tanımlı değildir.
