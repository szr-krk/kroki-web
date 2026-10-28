# Editör

Editör, tek bir SVG canvas üzerinde çizim, seçim, kamera hareketi, nesne düzenleme, yol üretimi ve levha ekleme işlemlerini bir araya getirir. DOM iskeleti `index.html` içindedir; davranış küçük UI dosyaları ile `window.Kroki` çekirdeğine dağıtılmıştır.

## İlgili kod dosyaları

- `index.html`: `#editor`, `#editorCanvas`, bütün araç çubukları ve paneller.
- `src/editor-state.js`: aktif çizim aracı, düzenlenen DOM nesnesi ve düzenleme modu.
- `src/editor-camera.js`: pan, zoom, pinch ve viewBox dönüşümleri.
- `src/editor-grid.js`: dinamik ızgara ölçeği ve grid snap.
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

## Izgara, snap ve zoom

Cetvel kaldırılmıştır. Sol altta Grid, Snap, sürekli açık Adım bilgisi ve tam sayılı Zoom göstergesi bulunur. Grid ve Snap ikonlu düğmelerdir; durumları renk ve aria-pressed ile belirtilir. İlk kullanımda Grid açık, Snap kapalıdır. Grid kapanınca Snap kapanır; Snap açılınca Grid açılır. Adım düğmesi yoktur. Adım bilgisi her zaman açıktır; eski görünürlük tercihi kullanılmaz.

Izgara ve snap aynı 1–2–5 ölçeğini kullanır. Yakındaki uç noktaları önceliklidir; aksi durumda küçük ızgara aralığı kullanılır. Adım çizim birimidir. Ctrl/Cmd geçici olarak yapışmayı atlar. Mevcut nesne ve dönüş yakalama kuralları korunur.

Zoom −/+ düğmeleri 10 yüzde puanı ile tam sayı seviyelere geçer ve boş SVG alanları dahil görünen canvas merkezindeki dünya noktasını sabit tutar. Tekerlek ve pinch davranışları değişmez.

Izgara SVG içindeki saydam Canvas 2D katmanında fotoğrafın üstünde, nesnelerin altında kalır. Görünüm kontrolleri belgeye veya çıktıya eklenmez. Son tercihler `kroki.editor.viewPreferences.v1` içinde saklanır; eski cetvel tercihi artık kullanılmaz.

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

## Fotoğraf altlığının görünürlüğü

Fotoğraf içe aktarıldığında sol altta `btnEditorSnap` yanına `btnEditorPhotoVisibility` göz düğmesi eklenir. Düğme, `PhotoBackgroundManager.setVisible()` ile yalnız altlık katmanının görünürlüğünü değiştirir; çizimleri ve fotoğraf verisini korur. Gizleme/gösterme geri alınabilir; kaydedilen belge yeniden açılınca seçilen görünürlük korunur. Fotoğraf gizliyken SVG/PNG ve önizlemelerde görünmez, içeriğe sığdırma ve çıktı alanı hesabına katılmaz. Fotoğrafsız belgeye geçildiğinde düğme kaybolur.

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


### 2026-10-17 — Kamera hareketinden güvenli çıkış
Pan/pinch; capture kaybı, pointercancel, blur, pagehide, gizlenme, yön ve tam ekran değişiminde sıfırlanır. Canvas dışında gelen pointerup da temizlenir. Pinch başlangıcında nesne sürükleme önce tamamlanır, sonra iki parmağın capture sahipliği alınır. Normal pinch → tek parmak pan devam eder. Seçim önizlemeleri pagehide/gizlenmede de tamamlanır; gizlenmiş kaynak ve askıya alınmış kavşak görünümü geri gelir.

`krokiEditorCamera.getGestureDiagnostics()` son 32 hareket/iptal, script hatası ve 200 ms üzeri uzun görev olayını yalnız bellekte tutar. Çizim içeriği veya koordinat kaydı, kalıcı depolama ve ağ aktarımı yoktur. Gerçek tablette bildirilen tüm ekranın kısa süre kaybolmasının kök nedeni henüz doğrulanmamıştır; bu düzeltme bilinen iptal/yakalama açıklarını kapatır.


## Tablet uzun basma (21.10.2026)
Editörün çizim ve kontrol alanlarında yerel bağlam menüsü ile metin seçimi engellenir. Canvas touchstart varsayılanı iptal edilir; çizim ve pan/pinch Pointer Events üzerinden sürer. Metin giriş alanlarında yerel seçim ve düzenleme menüsü korunur. Uygulamada titreşim çağrısı yoktur; fiziksel cihazın işletim sistemi titreşimi masaüstü testinde ölçülemez. Uzun basma, tekrar düğmeleri ve kamera regresyonları tarayıcı testleriyle denetlenir.


## İlk açılış görünümü (21.10.2026)
İlk kullanımda ızgara açık, yapışma kapalıdır. Grid ve Snap tercihleri tarayıcıda saklanır; belgeye eklenmez.
