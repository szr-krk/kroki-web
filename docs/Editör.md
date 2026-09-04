# Editör

Editör, tek bir SVG canvas üzerinde çizim, seçim, kamera hareketi, nesne düzenleme, yol üretimi ve levha ekleme işlemlerini bir araya getirir. DOM iskeleti `index.html` içindedir; davranış küçük UI dosyaları ile `window.Kroki` çekirdeğine dağıtılmıştır.

## İlgili kod dosyaları

- `index.html`: `#editor`, `#editorCanvas`, bütün araç çubukları ve paneller.
- `src/editor-state.js`: aktif çizim aracı, düzenlenen DOM nesnesi ve düzenleme modu.
- `src/editor-camera.js`: pan, zoom, pinch ve viewBox dönüşümleri.
- `src/editor-grid.js`: ortak dinamik cetvel/ızgara ölçeği ve grid snap.
- `src/editor-object-edit.js`: üst/yan araç çubuğu referansları ve ortak UI yardımcıları.
- `src/editor-main-menu.js`: kayıt, export, yeni belge, Home dönüşü ve alan export akışları.
- `src/ui/editorBindings.js`: çizim araçlarını pointer taslağına ve nesne oluşturmaya bağlar.
- `src/ui/editorTextComposer.js`: serbest metin oluşturma/düzenleme paneli.
- `src/editor.css`, `src/editor-line.css`: yerleşim ve nesne/düzenleme stilleri.

Bağlantılar: [[Menü Sistemi]], [[Nesne Sistemi]], [[Seçim Sistemi]], [[Kontrol Noktaları]].

## Canvas ve katmanlar

Canvas başlangıç viewBox'ı `0 0 1200 800` değeridir.

- `#editorObjects`: belge nesneleri ve onların etiketleri. Grup yöneticisi bu katmanda iç içe `<g>` düğümleri kurar.
- `#editorEditLayer`: tekli/çoklu seçim görselleri ve kontrol noktaları.
- `#roadIntersectionContourLayer`: gerektiğinde `RoadIntersectionEngine` tarafından `#editorObjects` içine eklenir; yol düğümlerinin üstünde, diğer nesnelerin altında tutulur.
- `#editorObjectDefs`, `#editorLineDefs`, `#editorFillPatternDefs`: etiket path/clip, ok marker ve dolgu pattern ihtiyaçlarında dinamik oluşturulur.

## Kamera davranışları

- Mouse tekerleği pointer konumunu sabit tutarak üstel zoom yapar.
- Kamera viewport ölçüsü pencere/canvas boyutu değişene kadar önbellekte kalır; pan/pinch sırasında her pointer hareketinde layout ölçülmez.
- Orta mouse veya `Space` + sol mouse pan başlatır.
- Boş canvas üzerinde tek parmak pan; iki pointer pinch-zoom yapar.
- Ölçek sınırı `0.05`–`64` arasındadır.
- Kamera değişimi `kroki:viewboxchange` olayı üretir; kontrol noktaları, seçim ve viewport'a bağlı metin etiketleri bu olayla yeniden senkronize edilir.
- Sağ raydaki ekrana sığdır düğmesi önce `EditorObjectManager.getContentBounds()` ile belge içeriğine fit eder; içerik yoksa başlangıç viewBox'ına döner.
- Kamera hareketi başladığında aktif nesne çizim taslağı veya seçim sürüklemesi sonlandırılır.

## Cetvel, ızgara ve snap

Üst ve sol cetvel, ızgara ve snap aynı 1–2–5 ölçeğini kullanır. Ana aralık yaklaşık 85 ekran pikseli hedefler; snap öncelikle yakındaki mevcut uç noktasına, uygun uç yoksa görünen küçük ızgara aralığına oturur. Ölçek gerçek SVG/piksel oranından hesaplanır; pan, pinch, mouse zoom, ekrana sığdırma ve dikey tablette `xMidYMid` boşlukları hesaba katılır. Gösterilen sayılar SVG birimidir, metre değildir.

Sol altta üç bağımsız düğme vardır: cetvel görünürlüğü, ızgara görünürlüğü ve mıknatıs simgeli snap. Başlangıçta üçü de açıktır. Izgara gizlenince snap kapanır; ızgarayı geri açmak snap'i açmaz. Snap açılırsa ızgara da görünür olur. Cetvel gizlemek snap durumunu değiştirmez. Ctrl/Cmd basılı çizim veya sürükleme geçici olarak snap'i atlar.

Yeni çizim noktaları ve çizim araçlarının döndürme dışındaki bütün kontrol noktaları grid'e veya yakındaki mevcut uçlara oturur. Ekranda şekilden uzakta gösterilen tutamaçlarda snap, tutamacın merkezine değil gerçek geometri köşesine/ucuna uygulanır. Çizgi uç tutamacı sürüklenirken başlangıç geometrisi ve parmağın tutamacı kavradığı konum saklanır; bu konuma göre gerçek uç taşınır ve snap edilir. Tekli taşımada başlangıç/merkez veya bounds köşesi; çoklu/grup taşımada ortak bounds köşesi referanstır. Bütün nesne aynı miktarda taşınır; boyut ve iç mesafeler korunur.

Döndürme kontrol noktaları, çizim nesnelerinin yanında levha, araç ve diğer sembollerde de 0°, 90°, 180° ve 270° açılarına 5° tolerans içinde yardımcı snap uygular. Katalog nesnelerinin taşıması serbest kalır; taşıma snap'ini kapatan `gridSnap: false` açı yardımını kapatmaz. Ctrl/Cmd diğer snap işlemlerinde olduğu gibi bu yardımı da geçici olarak atlar. Sağ IP'deki nesne ve grup döndürme picker'ları kontrol noktası yolunu kullanmaz; 1° adımla serbest dönmeye devam eder. Oransal grup boyutlandırması ve yola bağlı geometrik kısıtlar kendi kurallarını korur.

Mevcut uçlar, zoom nedeniyle yeni grid aralığının dışında kalsalar bile birleştirilebilir. Uç yakalama mesafesi mouse/kalemde 12, dokunmada 18 CSS pikselidir. Hedefler sürükleme başında yalnız koordinatlarıyla bir uzamsal indekse alınır; hareket eden nesne(ler) dışarıda tutulur. Pointer move sırasında sahne taranmaz veya modeller kopyalanmaz. Yeni çizim aynı snapped noktada kaldıysa gereksiz geometri güncellemesi atlanır.

Araç, trafik levhası ve diğer sembol adapter'ları `gridSnap: false` bildirir; snap düğmesi açıkken de serbest taşınırlar ve uç noktalara yapışmazlar. Bu tiplerden biri çoklu seçime veya gruba dahilse bütün seçim serbest taşınır; göreli konumlar korunur. İzin kontrolü yalnız gesture başında yapılır; bu seçimler için snap hedef indeksi hazırlanmaz. Sonraki çizim/taşıma kendi adapter izinleriyle yeniden değerlendirilir, genel snap düğmesinin durumu değişmez.

Eski yatay/dikey çizim yardımcısı, API'si, Inspector düğmesi, ikonu, dinleyicisi ve CSS'i kaldırılmıştır. Mevcut Inspector sistemi korunur.

Izgara ve cetveller belge SVG'sinin kardeş elemanlarıdır; SVG/PNG çıktısına, kayıtlı önizlemeye veya IndexedDB şemasına dahil olmaz. Görünüm tercihleri yalnız oturum belleğindedir. Izgara ayrı bir Canvas 2D katmanında tutulur; backing store 1 CSS pikseli ölçeğiyle sınırlıdır ve yalnız kamera/boyut/görünürlük değiştiğinde boyanır. Cetvel görünür işaretleri üretir; etiket düğümleri zoom/pan sırasında yeniden kullanılır. Ekran ölçüsü yalnız workspace boyutu değişince okunur. Dokunma hareketi cetvel imlecini güncellemez; mouse/kalem takibi değişen konumla sınırlıdır. Kamera yazımıyla aynı karede güncellenir. Chrome 90 hedefiyle kütüphanesiz çalışır.

## Çizim akışı

`editor-rail.js` bir çizim aracını aktif eder ve `kroki:active-tool-change` olayı yayınlar. `editorBindings.js` canvas pointer olaylarını aşağıdaki tiplere çevirir:

- `cizgi` → `line`
- `arc` → `arc`
- `curve`, `cubic` → `bezier` (`quadratic` veya `cubic`)
- `daire` → `circle`
- `elips` → `ellipse`
- `dikdortgen` → `rectangle`
- `kapali` → `closedShape`
- `olcu` → `callout`
- `metin` → pointer taslağı yerine `FreeTextComposer`

Pointer ile sürüklenen taslaklar geçmiş kaydı atlanarak canlı güncellenir. Boyut 2 SVG biriminden küçükse nesne silinir; aksi halde tek bir “Nesne ekle” geçmiş işlemi commit edilir ve nesne düzenleme modunda seçilir.

## Kapalı şekil taslağı

- Her tap bir köşe ekler; en az üç nokta olunca “Şekli Kapat” etkinleşir.
- Her segment başlangıçta iki noktanın ortasındaki quadratic kontrol noktasıyla temsil edilir.
- Kapatma `closed: true`, `draft: false`, `pointEdit: false` yazar.
- Araç değiştirmek veya iptal etmek tamamlanmamış taslağı geçmişe eklemeden kaldırır.

## Metin oluşturma

Serbest metin aracı canvas merkezine yakın (`viewBox` merkezinin yatay merkezi, yüksekliğin `%46` noktası) bir `text` nesnesi ekler. Ortadaki composer yalnızca metin girişidir; kutu dışına dokunmak, `Abc` düğmesine yeniden basmak veya `Ctrl/Cmd+Enter` metni tamamlar. `Escape` iptal eder. Yeni metin boşsa nesne oluşturulmaz; mevcut metin boş bırakılırsa önceki içerik geri yüklenir. Boyut, dönüş ve diğer metin stilleri seçili nesnenin sağ rayından yönetilir. Ayrıntı: [[Nesne Sistemi#Metin]].

## Etkileşim önceliği

1. Kamera capture-phase dinleyicileri pan/pinch koşullarını değerlendirir.
2. `SelectionManager` hit-test ve tekli/çoklu seçimi değerlendirir.
3. Aktif çizim aracı varsa `editorBindings` taslak üretir.

Modal, açık ray paneli veya serbest metin composer görünürken `krokiEditorState.isBlockingOverlayOpen()` canvas etkileşimini engeller.

## Bağlı modüller

- Nesne üretimi ve render: [[Nesne Sistemi]].
- Seçim ve grup etkileşimi: [[Seçim Sistemi]].
- Tutamaçlar: [[Kontrol Noktaları]].
- Sağ ray ve üst araç çubukları: [[Menü Sistemi]].
- Yol ve kavşak: [[Yol Sistemi]], [[Kavşak Sistemi]].
- Geçmiş: [[Undo Redo]].

## Belirsiz

- Canvas ölçü biriminin gerçek dünya karşılığı yoktur; tüm genişlik ve mesafeler SVG birimi olarak ele alınır.
- Kamera davranışında eski `editor-rail.js` viewBox yazan yardımcılar da vardır; yeni değişikliklerde mümkün olduğunca `krokiEditorCamera.writeViewBox/fitToContent` hattı kullanılmalıdır.
