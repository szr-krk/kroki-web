# AI Devralma Notu

Bu not, projeyi yeni devralan bir yapay zekanın veya geliştiricinin önce resmi haritayı, sonra kodu bozmadan ilerlemesi için yazılmıştır. Kroki Pro, tek sayfalı, build adımı olmayan, offline çalışması hedeflenen bir SVG kroki editörüdür. En kritik ürün hedefi, düşük performanslı Android tabletlerde bile akıcı kalmasıdır.

Bağlantılar: [[Proje Haritası]], [[Sistem Durumu]], [[Performans Kriterleri]], [[Yol Sistemi]], [[Kavşak Sistemi]], [[Sembol ve Asset Sistemi]], [[Codex Talimatları]].

## Önce bunları oku

1. [[AI Devralma Notu]]
2. [[Proje Haritası]]
3. [[Sistem Durumu]]
4. [[Performans Kriterleri]]
5. Yol veya kavşakla ilgili her işte [[Yol Sistemi]], [[Şerit Sistemi]], [[Kavşak Sistemi]]
6. Nesne, seçim veya çizim işinde [[Nesne Sistemi]], [[Seçim Sistemi]], [[Kontrol Noktaları]], [[Editör]]
7. Kaydetme, açma, şablon veya export işinde [[Home]], [[Menü Sistemi]], [[Serializer]], [[Undo Redo]]
8. Levha, araç veya sembol işinde [[Trafik Levhası Sistemi]], [[Sembol ve Asset Sistemi]]
9. Kod değiştirmeden önce [[Açık Hatalar]], [[Yeni Özellikler]], [[Mimari Kararlar]], [[Codex Talimatları]]

## Proje özeti

Uygulama `index.html` tarafından yüklenen klasik JavaScript dosyalarından oluşur. Modüller IIFE biçimindedir ve ortak API çoğunlukla `window.Kroki` altındadır. Build sistemi, paket yöneticisi veya test koşucusu yoktur; dosyalar doğrudan tarayıcıda çalışacak şekilde düzenlenmiştir.

Ana ekran `#home`, editör `#editor` içinde yaşar. Editörde tek SVG canvas vardır: `#editorCanvas`. Kalıcı belge nesneleri `#editorObjects` katmanına, seçim ve kontrol noktaları `#editorEditLayer` katmanına çizilir. Kavşak konturu, yol nesneleri ile normal nesneler arasındaki özel `#roadIntersectionContourLayer` katmanında tutulur.

## Korunması gereken ana gerçekler

- Yollar ayrı ayrı çizgi parçaları değildir; bir merkez çizgisi ve `metadata.road` enkesit config'inden türetilir.
- Kavşak ayrı bir nesne değildir; yol yüzeylerinden her refresh'te yeniden hesaplanan türetilmiş görünümdür.
- Undo/redo delta değil, tam belge snapshot'ı kullanır.
- Seçim sistemi tekli, çoklu ve grup state'ini ayrı yöneticilerde tutar.
- Yollar çoklu seçime ve gruba alınmaz.
- SVG DOM sırası katman sırasıdır; yol düğümleri sürekli arkaya zorlanır.
- Trafik levhası, diğer sembol ve araçlar katalog tabanlı nesnelerdir; art/metadata modelde taşınır.
- Home ve editör aynı sayfadadır; gerçek route yoktur.

## Kesin performans hedefi

Bu projenin performans çıtası masaüstü değil, 4 GB RAM seviyesinde düşük Android tabletlerdir. Offline kullanımda pan, pinch zoom, mouse wheel zoom, nesne taşıma ve yol düzenleme sırasında frame düşüşü belirgin olmamalıdır.

Bu nedenle:

- Kamera hareketinde yalnız viewBox değişmelidir.
- Aynı viewBox veya aynı transform DOM'a tekrar yazılmamalıdır.
- Pointer move sırasında gereksiz `replaceChildren`, `getBBox`, katalog SVG parse, serializer export veya tüm belge renderı yapılmamalıdır.
- Kavşak ve yol algoritmasına performans bahanesiyle davranış değiştiren müdahale yapılmamalıdır.
- Ağ, CDN veya harici asset bağımlılığı eklenmemelidir.

Ayrıntı: [[Performans Kriterleri]].

## Yol ve kavşak işlerinde kırmızı çizgi

Yol ve otomatik kavşak projenin kalbidir. Bu alanda küçük bir görsel düzeltme bile şu davranışları bozabilir:

- T/Y kavşaklarda yan kolun karşı kenara ağız açmaması
- Dış kenarın kavşakta engine tarafından ortak kontura dönüşmesi
- İç banket ve lane çizgilerinin doğru aralıkta kalması
- Q yumuşatma noktalarının seçilip sürüklenebilmesi
- Cep, bariyer, ada ve bölünmüş yol kombinasyonları
- Undo/redo ve serializer round-trip sonrası kavşağın yeniden kurulması

Bu yüzden yol/kavşak değişikliğinde yalnız tek dosyaya bakma. En az şu zinciri oku: `src/ui/roadBuilder.js`, `src/adapters/roadAdapter.js`, `src/ui/roadInspector.js`, `src/core/roadIntersectionEngine.js`.

## Bir değişiklik yaparken güvenli sıra

1. İlgili Obsidian notunu oku.
2. `index.html` script sırasını kontrol et.
3. Adapter capability alanlarını ve manager/selection çağrı zincirini bul.
4. Değişikliği en dar fonksiyon veya UI bağlama noktasında yap.
5. Pointer hareketinde çalışan yolu ayrıca değerlendir.
6. `node --check` ile dokunulan JS dosyalarını kontrol et.
7. Yol/kavşak değişikliğinde tarayıcı smoke testi yap.
8. Dokümantasyon gerçek davranıştan saptıysa ilgili notu güncelle.

## Yeni yapay zeka için hızlı zihinsel model

Kroki Pro bir çizim programı gibi görünür ama mimarisi “model -> adapter render -> SVG DOM” hattıdır. DOM tek başına kaynak değildir. Bir nesneyi değiştirmek için doğrudan SVG path attribute'u yazmak yerine `EditorObjectManager.updateModel` veya `updateGeometry` kullanılır. Bu, history, selection, style panel, control point ve kavşak refresh zincirlerini çalıştırır.

Yollar bu genel sistemin özel bir üyesidir. Yol adapter'ı merkez çizgisi, enkesit, lane/banket boundary'leri, cep ve bariyerleri üretir. Kavşak motoru bu yollardan yüzey polygonları çıkarır, çakışma bölgelerini bulur, dış konturu birleştirir, çizgi görünür aralıklarını keser ve Q yumuşatma parçalarını yönetir.

Sembol/levha/araç tarafında gerçek görsel art katalogdan gelir. Canvas'a eklenen nesne yalnız merkez, ölçek, dönüş ve katalog metadata'sını taşır. Yeni sembol ailesi eklenirken generic çizim nesnesi üretmek yerine katalog + catalog API + adapter + library panel sözleşmesi izlenmelidir.

