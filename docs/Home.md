# Home

Home, uygulamanın başlangıç ekranıdır. Görevi editöre geçiş, tam ekran kontrolü ve gelecekte bağlanmak üzere yerleştirilmiş hızlı başlangıç girişlerini göstermektir.

## İlgili kod dosyaları

- `index.html`: `#home` DOM'u, hızlı başlangıç düğmeleri ve üç modal.
- `src/home.js`: modal açma/kapama, tam ekran ve “Yeni Kroki” geçişi.
- `src/home.css`: Home yerleşimi, kartlar ve modal görünümü.
- Editöre geçişin devamı: [[Editör]].

## Mevcut davranışlar

- “Yeni Kroki”, açık modalleri kapatır, `#home` öğesine `gizli` ekler ve `#editor` öğesinden `gizli` sınıfını kaldırır.
- Home tam ekran düğmesi `document.documentElement.requestFullscreen()` ve `document.exitFullscreen()` kullanır. `fullscreenchange` ile etiket ve `aria-pressed` senkronize edilir.
- `data-modal-target` taşıyan düğmeler hedef paneli açar; yeni modal açılırken diğerleri kapanır.
- `data-modal-close` düğmeleri ve `Escape` tüm Home modallarını kapatır.
- “Kılavuz” ve “SVG Yükle” şu anda yalnız `alert` gösterir.

## Hızlı başlangıç alanları

- **Şablonlarım:** modal var, içerik boş yer tutucudur.
- **Hazır Kavşaklar:** modal var, içerik boş yer tutucudur.
- **Hazır Yollar:** modal var, içerik boş yer tutucudur.
- **SVG Yükle:** dosya seçimi veya parser bağlı değildir.
- **Son Krokiler:** `#sonKrokilerListesi` yalnız “Henüz kayıt yok” metniyle başlar; kodda listeyi dolduran depolama/okuma akışı yoktur.

Bu eksikler [[Açık Hatalar]] ve [[Yeni Özellikler]] içinde izlenir.

## Bağlı modüller

- [[Editör]]: Home'un tek çalışan ana geçiş hedefi.
- [[Menü Sistemi]]: editörde ayrıca “Yeni Kroki” ve kaydet/çık komutları görünür, ancak çoğu bağlı değildir.
- [[Serializer]]: Home'daki son kayıtlar veya dosya yükleme için kullanılabilecek çekirdek API'yi sağlar; Home şu anda bu API'yi çağırmaz.

## Geliştirici notları

- Yeni krokiye geçiş mevcut belgeyi temizlemez. İlk açılışta sorun yaratmaz; editörden Home'a dönüş/yeni belge akışı bağlandığında açıkça `EditorObjectManager.clear()` veya belge importu kararı verilmelidir.
- Home ve editör aynı sayfada yaşar; route veya ayrı HTML sayfası yoktur.
- Fullscreen başarısızlığı yakalanır fakat kullanıcıya hata verilmez; yalnız düğme etiketi yeniden senkronize edilir.

## Belirsiz

- “Şablonlarım”, “Hazır Yol/Kavşak” ve “Son Krokiler” için veri formatı, saklama yeri ve ürün akışı kodda tanımlı değildir.
- “SVG Yükle”nin düzenlenebilir Kroki nesnelerine mi yoksa tek bir SVG görseline mi dönüşeceği belli değildir.

