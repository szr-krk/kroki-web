# Codex Talimatları

Bu proje üzerinde çalışacak Codex önce mevcut davranışı korumalı, sonra görev kapsamındaki en küçük modül kümesini değiştirmelidir. Kodda olmayan özelliği varmış gibi kabul etme; bağlı olmayan UI'ları [[Açık Hatalar]] ve [[Yeni Özellikler]] ile karşılaştır.

## Kullanıcının geçerli koşulları

- Saf HTML, CSS ve JavaScript kullan; React veya başka bir çalışma zamanı kütüphanesi ekleme.
- En düşük tarayıcı hedefi Chrome 90'dır. Yeni API ve CSS için bu sürümü esas al.
- Düşük donanımlı Android tablette performansı koru; kullanılmayan önizlemeleri başlangıçta hazırlama.
- IndexedDB kayıt düzenini koru; bu ana ekran değişikliği için veritabanı adı, sürümü, şeması veya kayıt akışını değiştirme.
- Deneme dosyası, kurulum artığı, geçici kopya ve gereksiz bağımlılıkları teslim edilen projede bırakma.
- Yereldeki temiz geri dönüş kopyasını değiştirme; geliştirmeyi ayrı çalışma kopyasında yap ve doğrulanan değişiklikleri mevcut GitHub Pages yayınına aktar.

## Zorunlu ilk okuma sırası

1. [[AI Devralma Notu]] — projenin devralma özeti ve kırmızı çizgileri.
2. [[Proje Haritası]] — dosya ve çalışma zamanı katmanları.
3. [[Sistem Durumu]] — çalışan ve düzeltilmesi gereken sistemler.
4. [[Performans Kriterleri]] — düşük Android tablet hedefi.
5. [[Mimari Kararlar]] — fiilî tasarım sınırları.
6. [[Açık Hatalar]] — bilinen eksik/tutarsız noktalar.
7. Göreve göre ilgili alan notları:
   - UI/Home: [[Home]], [[Editör]], [[Menü Sistemi]]
   - Generic nesne: [[Nesne Sistemi]], [[Seçim Sistemi]], [[Kontrol Noktaları]]
   - Yol: [[Yol Sistemi]], [[Şerit Sistemi]], [[Kavşak Sistemi]]
   - Veri/geçmiş: [[Serializer]], [[Undo Redo]]
   - Levha/araç/sembol: [[Trafik Levhası Sistemi]], [[Sembol ve Asset Sistemi]]
8. Özellik talebinde [[Yeni Özellikler]].

## Kod okumaya başlama noktaları

- Her zaman `index.html` sonundaki `<script>` sırasını kontrol et.
- Nesne tipinde önce adapter `capabilities` ve adapter nesnesinin export edilen metotlarını oku.
- Bir UI düğmesinin görünmesi çalıştığı anlamına gelmez; listener zincirini ara.
- Yol işinde tek dosyayla yetinme: `roadBuilder.js` → `roadAdapter.js` → `roadInspector.js` → `roadIntersectionEngine.js` akışını birlikte izle.
- Seçim işinde `selectionManager`, `multiSelectManager`, `groupManager`, `controlPointManager` ve manager katman senkronizasyonunu birlikte değerlendir.
- Kaydetme/geçmiş işinde serializer'ın temizlediği metadata ile seçim yöneticilerinin geçici metadata'sını karşılaştır.

## Değişiklik kuralları

- Global IIFE mimarisinde yeni bağımlılığı doğru script sırasına yerleştir.
- Common model alanlarını (`geometry`, `style`, `label`, `metadata`) plain JSON serialize edilebilir tut.
- Yeni nesne tipi ekleniyorsa adapter şu temel davranışları sağlamalı: create, render, hit-test, move, bounds, clone, selection; düzenlenebiliyorsa kontrol noktaları.
- UI görünürlüğünü tip adıyla dağınık kontroller yerine mümkün olduğunca adapter `capabilities` ile bağla.
- Canlı pointer hareketinde `skipHistory`; gesture sonunda tek transaction kullan.
- Yol modelini generic gruba veya çoklu seçime sessizce dahil etme; mevcut kod bunu özellikle engeller.
- Yol katmanlarının arkada tutulması ve kavşak kontur katmanının normal nesneler altında kalması kuralını koru.
- Boundary stilini değiştirirken `bN` indeksinin lane/banket yapısına bağımlı olduğunu hesaba kat.
- Kavşakta türetilmiş contour'u belgeye kopyalama; mevcut format yalnız Q edit farklarını saklar.
- Import edilecek SVG/JSON için `signArt` ve `innerHTML` güvenini açıkça çözmeden dış içeriği kabul etme.
- Performans için algoritma davranışını değiştirme; önce gereksiz DOM yazımı, cache, `requestAnimationFrame` ve render kapsamını daralt.
- Düşük Android tablet hedefini varsay: kamera, sürükleme ve kavşak rebuild akışında pahalı işlemi pointer move dışına al.
- Yeni sembol/asset eklerken generated katalog mimarisini izle; CDN, remote image veya runtime network fetch ekleme.

## Doğrulama kontrol listesi

- Kaynak dosya syntax kontrolü.
- Home → Editör geçişi ve sağ ray panel aç/kapat.
- Eklenen/değişen nesnede create, select, edit, move, copy, delete, undo, redo.
- Çoklu seçim ve grup davranışı; görev etkiliyorsa nested group copy/ungroup.
- Serializer round-trip: nesne sırası, grup, viewBox, yol metadata ve Q state.
- Yol görevinde en az düz, arc, S ve ada; normal/bölünmüş; banket; boundary segment; bariyer.
- Kavşak görevinde kesişen, T-terminal ve üçlü yol; Q seçme/sürükleme; yol sürükleme sonrası rebuild.
- Zoom sonrası selection/control handle ekran boyutu.
- Trafik levhasında kategori, ekleme, ölçek, dönüş ve varsa iç metin.

Depoda otomatik test altyapısı yoktur; test eklenmedikçe tarayıcı smoke/regresyon kontrolü gerekir.
Performans işi yapıldıysa [[Performans Kriterleri#Kabul kontrol listesi]] maddelerini de uygula.

## Dokümantasyon güncelleme eşlemesi

- `home.js`, Home DOM/CSS → [[Home]]
- `editor-rail.js`, toolbar/panel DOM → [[Menü Sistemi]], [[Editör]]
- registry/manager/style/adapter → [[Nesne Sistemi]]
- selection/multi/group → [[Seçim Sistemi]]
- control point davranışı → [[Kontrol Noktaları]]
- road builder/adapter/inspector → [[Yol Sistemi]], [[Şerit Sistemi]]
- intersection engine → [[Kavşak Sistemi]]
- serializer schema → [[Serializer]] ve gerekirse [[Mimari Kararlar]]
- history sınırları → [[Undo Redo]]
- katalog/levha adapter → [[Trafik Levhası Sistemi]]
- araç/diğer sembol/generator → [[Sembol ve Asset Sistemi]]
- bağlı olmayan yeni UI/iş → [[Açık Hatalar]] veya [[Yeni Özellikler]]

## Çalışma ağacı uyarısı

Projede kullanıcıya ait commit edilmemiş değişiklikler bulunabilir. Görevle ilgisiz dosyaları resetleme, formatlama veya yeniden üretme. Özellikle generated trafik levhası dosyalarını yalnız açık istekle değiştir.

## Belirsiz

- Hedef tarayıcı/işletim sistemi ve resmi test matrisi kodda tanımlı değildir.
- Dağıtım, versiyonlama ve generated katalog üretim komutları depoda belgelenmemiştir.
