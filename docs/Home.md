# Home

Home, uygulamanın başlangıç ekranıdır. Görevi editöre geçiş, tam ekran kontrolü, yerel son krokiler/şablonlar, Kroki imzalı SVG yükleme ve hızlı başlangıç girişlerini göstermektir.

## İlgili kod dosyaları

- `index.html`: `#home` DOM'u, hızlı başlangıç düğmeleri ve üç modal.
- `src/home.js`: modal açma/kapama, tam ekran ve Home düğmelerinin ilk bağları.
- `src/editor-main-menu.js`: yeni belge, son krokiler, şablonlar, IndexedDB kayıtları, SVG import/export ve Home liste renderı.
- `src/core/documentStorage.js`: son kroki/şablon kayıtları ile fotoğraf Blob'larını yöneten IndexedDB katmanı.
- `src/home.css`: Home yerleşimi, kartlar ve modal görünümü.
- Editöre geçişin devamı: [[Editör]].

## Mevcut davranışlar

- “Yeni Kroki” artık `editor-main-menu.js` tarafından capture fazında devralınır; mevcut içerik varsa onay ister, belgeyi sıfırlar ve editörü gösterir.
- Home tam ekran düğmesi `document.documentElement.requestFullscreen()` ve `document.exitFullscreen()` kullanır. `fullscreenchange` ile etiket ve `aria-pressed` senkronize edilir.
- `data-modal-target` taşıyan düğmeler hedef paneli açar; yeni modal açılırken diğerleri kapanır.
- `data-modal-close` düğmeleri ve `Escape` tüm Home modallarını kapatır.
- “Kılavuz” özel dialog ile “sonraki aşamada bağlanacak” mesajı verir.
- “SVG Yükle”, `KrokiMainMenu.importSvgFile()` varsa dosya seçici açar; yalnız Kroki Pro imzalı SVG içindeki belge metadata'sını import eder.
- “Fotoğraf Yükle”, seçilen görselin bir kopyasını etkileşimsiz SVG altlığı olarak belgeye ekler; kaynak dosyayı değiştirmez.

## Hızlı başlangıç alanları

- **Şablonlarım:** IndexedDB `documents` deposundaki şablon kayıtlarından kartlar render edilir.
- **Hazır Kavşaklar:** modal var, içerik boş yer tutucudur.
- **Hazır Yollar:** modal var, içerik boş yer tutucudur.
- **SVG Yükle:** Kroki Pro export metadata'sı taşıyan SVG dosyasını belge olarak açar; genel SVG parser değildir.
- **Fotoğraf Yükle:** JPEG, PNG, WebP, GIF, BMP veya AVIF görselini SVG altlığı olarak açar.
- **Son Krokiler:** IndexedDB `documents` deposundan en fazla 10 kayıt gösterilir.

Bu eksikler [[Açık Hatalar]] ve [[Yeni Özellikler]] içinde izlenir.

## Bağlı modüller

- [[Editör]]: Home'un tek çalışan ana geçiş hedefi.
- [[Menü Sistemi]]: editördeki kayıt, export, çıkış ve yeni belge komutları Home listeleriyle aynı IndexedDB akışına bağlıdır.
- [[Serializer]]: IndexedDB kayıtları, şablonlar ve imzalı SVG import/export için belge formatını sağlar.

## Geliştirici notları

- Yeni krokiye geçiş `resetDocument()` ile manager, seçim, kavşak state'i, kamera ve history'yi temizler.
- Home ve editör aynı sayfada yaşar; route veya ayrı HTML sayfası yoktur.
- Fullscreen başarısızlığı yakalanır fakat kullanıcıya hata verilmez; yalnız düğme etiketi yeniden senkronize edilir.
- Fotoğraf altlığı IndexedDB `assets` deposunda tek Blob olarak saklanır. Belge ve önizleme kayıtları aynı veriyi tekrar etmez; okuma sırasında altlık yeniden bağlanır.

## Belirsiz

- “Hazır Yol/Kavşak” için veri formatı ve yerleştirme akışı hâlâ tanımlı değildir.
- Genel SVG import yoktur; mevcut SVG yükleme yalnız Kroki Pro imzalı export'u belgeye geri çevirir.
