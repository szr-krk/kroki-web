# Sistem Durumu

Bu sayfa, mevcut sistemlerin hangi seviyede çalıştığını ve hangi alanların düzeltilmesi gerektiğini tek yerde toplar. Kod değişikliği yapmadan önce buradaki durum ile [[Açık Hatalar]] ve [[Yeni Özellikler]] birlikte okunmalıdır.

Bağlantılar: [[AI Devralma Notu]], [[Home]], [[Editör]], [[Menü Sistemi]], [[Yol Sistemi]], [[Kavşak Sistemi]], [[Performans Kriterleri]].

## Düzgün çalışan sistemler

### Home ve geçiş

Home ekranı editöre geçiş, fullscreen, modal aç/kapat, son krokiler ve şablon listesi için bağlıdır. `editor-main-menu.js`, Home'daki `Yeni Kroki`, `Son Krokiler`, `Şablonlarım` ve `SVG Yükle` akışlarının önemli kısmını devralır.

### Ana menü ve yerel kayıt

Ana menüde kaydetme, kaydet ve çık, kaydetmeden çık, yeni kroki, şablona kaydet, SVG export, PNG export ve alan PNG export akışları bağlıdır. Son krokiler ve şablonlar IndexedDB içinde tutulur; fotoğraf altlığı ayrı Blob olarak bir kez saklanır. SVG export içine Kroki Pro metadata'sı yazılır; import yalnız bu imzalı SVG'yi güvenli belge olarak açar.

### SVG editör iskeleti

`#editorCanvas`, `#editorObjects` ve `#editorEditLayer` katmanları çalışır. Nesneler adapter sözleşmesiyle modele eklenir, render edilir, seçilir, taşınır, kopyalanır ve silinir. ViewBox değişiminde viewport'a bağlı label ve kontrol noktaları yeniden senkronize edilir.

### Kamera

Pan, mouse wheel zoom, pinch zoom, space + drag ve fit-to-content akışları çalışır. `editor-camera.js` ana canvas için viewBox yazımını `requestAnimationFrame` ile sınırlar ve aynı viewBox değerini tekrar yazmamaya çalışır.

### Çizim araçları

Line, arc, quadratic/cubic Bezier, circle, ellipse, rectangle, callout, text ve closed shape üretimi bağlıdır. Pointer drag sırasında canlı taslak history üretmez; pointer up tek işlem olarak commit edilir.

### Nesne ve stil sistemi

`ShapeRegistry`, `EditorObjectManager` ve `StyleManager` ortak model sözleşmesini uygular. Stroke, fill, opacity, pattern, dash, ok marker, metin ve adapter capability filtreleri çalışır. Çizgi benzeri yeni nesnelerde varsayılan `strokeWidth` 1'dir.

### Seçim, kontrol noktası, grup

Tekli preselect/edit, çoklu seçim, marquee, grup, iç içe grup, grup taşıma/resize/rotate ve katman işlemleri çalışır. Yollar bilerek çoklu seçim ve gruplama dışında tutulur.

### Undo/Redo

Geçmiş sistemi tam belge snapshot'ı ile çalışır. Create/update/remove, pointer drag transaction'ları, grup işlemleri ve kavşak Q düzenlemeleri undo/redo zincirine girer.

### Yol üretimi

Düz, arc, S viraj ve ada profilleri çalışır. Normal/bölünmüş yol, lane genişliği, banket, su kanalı, boundary segmentleri, cep ve bariyer davranışları `roadAdapter` üzerinden türetilir.

### Otomatik kavşak

Kavşak motoru yol yüzeylerini örnekler, kesişimleri bulur, dış konturu birleştirir, çizgi görünür aralıklarını kırpar ve Q yumuşatma/düzenleme sağlar. Türetilmiş kavşak state'i kaydedilmez; yalnız Q farkları kaydedilir.

### Levha, diğer sembol ve araç kütüphaneleri

Trafik levhaları üç generated katalog dosyasından toplam 198 kayıtla gelir. Diğer semboller 40 kayıtla insan/hayvan/çevre elemanları kategorilerindedir. Araç kataloğu `ARAÇLAR` asset klasöründen generated data'ya dönüştürülür; top/side/upsideDown görünümleri, renk, temsili görünüm ve etiket desteklenir.

## Düzeltilmesi gereken sistemler

### Serializer geçici yol metadata'sını eksik temizliyor

`DocumentSerializer.cleanMetadata()` şu anda `draft`, `pointEdit`, `roadSelection`, `roadBarrierEdit` alanlarını temizler. Fakat `roadBoundaryEdit`, `roadPocketEdit` ve `roadPocketIslandEdit` de seçim/düzenleme state'i gibi kullanılır. Bunların kayda sızması olasıdır.

### Import viewBox olayını doğrudan yayınlamıyor

Serializer import sırasında viewBox'ı doğrudan `setAttribute` ile yazar. Sonrasında bazı akışlar `dispatchViewBoxChange()` çağırsa da çekirdek import fonksiyonu kendi başına `kroki:viewboxchange` üretmez. Viewport'a bağlı label veya handle hesaplarında kenar durum oluşabilir.

### Schema doğrulama yok

Belge export `schemaVersion: 1` ve `app: "Kroki Pro"` yazar; import bunları doğrulamaz ve migration yapmaz. İleride format büyürse explicit migration gerekir.

### SVG import güven modeli dar

Genel SVG import yoktur. Güvenli import yalnız Kroki Pro'nun export ettiği ve metadata imzası taşıyan SVG dosyasını belgeye geri çevirir. Dış SVG'yi düzenlenebilir nesnelere dönüştürme sistemi tasarlanmamıştır.

### Katalog SVG içeriği innerHTML ile parse ediliyor

Traffic sign ve other symbol art string'leri render sırasında DOMParser/innerHTML hattından geçer. Build-time generated katalog güvenilir kabul edilir. Kullanıcıdan gelen JSON/SVG'de bu güven modeli ayrıca çözülmeden dış içerik açılmamalıdır.

### Boundary style kimliği indeks tabanlı

Yol boundary stilleri `b0`, `b1`, ... kimliğine bağlıdır. Lane/banket sayısı değişince eski `bN` farklı fiziksel sınıra denk gelebilir. Semantic remap yoktur.

### Büyük belgede history maliyeti ölçülmemiş

Undo/redo tam belge snapshot'ı saklar. Küçük ve orta kroki için güvenli bir tasarım olsa da büyük katalog nesneleri ve yoğun yol/kavşak senaryolarında bellek/CPU maliyeti ölçülmelidir.

### macOS kısayol desteği yok

History kısayolları `ctrlKey` ile çalışır; `metaKey` desteği yoktur. Hedef platform Android/Windows ise sorun olmayabilir, macOS hedeflenirse eklenmelidir.

### Hazır yol/kavşak ürün akışı tanımlı değil

Home'da hazır yollar ve hazır kavşaklar modalı vardır, fakat gerçek şablon içerikleri ve yerleştirme akışı tanımlı değildir. Hazır kavşak, tek nesne değil birden çok yol + Q state kombinasyonu olarak düşünülmelidir.

### Performans regresyon testleri resmi değil

`.tmp` içinde bazı benchmark/smoke dosyaları bulunur, fakat depoda standart test komutu yoktur. Düşük Android tablet hedefi için sistematik senaryo listesi ve ölçüm eşiği yazılmalıdır.

## Öncelik sırası

1. Düşük Android tablet performansını bozan DOM/render tekrarları.
2. Yol/kavşak görsel doğruluğu ve T/Y kavşak edge kuralları.
3. Serializer geçici metadata temizliği ve import viewBox olayı.
4. Kayıt/import güven modeli.
5. Hazır yol/kavşak ve kılavuz gibi ürün akışı eksikleri.
