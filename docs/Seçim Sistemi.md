# Seçim Sistemi

Seçim sistemi tekli seçim, çoklu seçim, marquee, grup seçimi, taşıma, dönüşüm, kopyalama, silme ve katman işlemlerini yönetir. Tekli ve çoklu state ayrı yöneticilerdedir ve birbirini temizleyerek çalışır.

## İlgili kod dosyaları

- `src/core/hitTestManager.js`: üstten alta nesne bulma.
- `src/core/selectionManager.js`: tekli preselect/edit ve drag.
- `src/core/multiSelectManager.js`: çoklu seçim, marquee, grup frame ve toplu işlemler.
- `src/core/groupManager.js`: semantic grup ağacı.
- `src/core/controlPointManager.js`: tekli seçim görseli ve kontrol noktaları.
- `src/core/editorObjectManager.js`: DOM/model sırası, CRUD ve katman.
- `src/editor-object-edit.js`: üst araç çubuğu bağlantıları.

Bağlantılar: [[Nesne Sistemi]], [[Kontrol Noktaları]], [[Undo Redo]], [[Yol Sistemi]].

## Hit-test

`HitTestManager` nesneleri `#editorObjects` DOM sırasının tersinden dolaşır. Tolerans 24 ekran pikselidir ve mevcut SVG ölçeğine çevrilir. Her tip kendi adapter `hitTest` metodunu uygular.

Aktif çizim aracı varken kamera için “canvas üzerinde nesne var mı?” testi false döner; böylece araç akışı öncelik kazanır.

## Tekli seçim durumları

- **preselect:** ilk tap sonrası kırmızı/önseçim görünümü ve bağlamsal araçlar.
- **edit:** aynı nesneye ikinci tap, sürükleme veya özellik düğmesi etkileşimi sonrası yeşil/düzenleme görünümü ve kontrol noktaları.

Başka nesne seçilince önceki nesnenin `pointEdit`, `roadSelection`, `roadBoundaryEdit`, `roadBarrierEdit` geçici metadata'sı temizlenir. Seçimi temizlemek üst/yan araç çubuklarını gizler; çoklu seçim varsa araçlar açık kalabilir.

## Tekli pointer davranışı

- Sol pointer dışındaki mouse düğmeleri seçim sürüklemesi başlatmaz.
- Kamera gesture/pan istendiğinde veya blocking overlay açıkken seçim akışı durur.
- Boş alana tap seçim temizler.
- Preselect nesneye yeniden basmak edit ve object drag başlatır.
- Edit modunda pointerdown aktif nesne drag adayını başlatır; 3 ekran pikseli aşılınca geometri taşınır.
- Hareket olmadıysa adapter `handleEditTap` çağrılabilir; yol kesit/bariyer seçimi bunu kullanır.
- Drag sırasında canlı değişiklikler geçmişi atlar, pointer up'ta tek “Nesne tasi” işlemi commit edilir.

## Çoklu seçim

Yol nesneleri çoklu seçime alınmaz. `GroupManager.canGroupObject()` aynı kuralı grup için de uygular.

Çoklu seçim yolları:

- `Ctrl` veya `Shift` + tap: nesneyi ya da içinde bulunduğu üst grubu toggle eder.
- “Çoklu Seç” modu: tek tap'lerle öğe/grup ekleyip çıkarır.
- Çoklu seçim modunda boş alandan sürükleme: marquee. Bir nesnenin görsel bounds'u marquee ile **kesişiyorsa** seçilir; tamamen içeride olma şartı yoktur.
- Bir grup içindeki nesneye tap, `groupForObject()` üzerinden üst grubu seçer.

Seçili öğeler adapter seçim path'leriyle ayrı ayrı gösterilir. Aktif semantic grup için tek döndürülmüş frame ve grup kontrol noktaları gösterilir.

## Toplu işlemler

- **Taşıma:** bütün adapter'larda `move`; tek geçmiş işlemi.
- **Silme:** seçili id'ler kaldırılır, grup üyelikleri temizlenir; tek işlem.
- **Kopyalama:** DOM sırasına göre her nesne 18/18 offset ile klonlanır. Seçimde grup birimleri varsa grup ağacı yeni id map'iyle klonlanır.
- **Öne Getir/Arkaya Gönder:** toplu göreli DOM sırasını koruyacak yönde uygulanır; yollar zaten seçilemez.
- **Stil:** yalnız saf nesne seçiminde ve her adapter'ın desteklediği alanlar için uygulanır. Grup/grup-birimi seçimi stil uygulamasını kapatır.

## Gruplar

Gruplama için en az iki seçim birimi gerekir. Seçili leaf id'ler önce mevcut tam grup eşleşmelerine dönüştürülür; kalan nesnelerle birlikte DOM sırasına göre yeni grubun doğrudan çocukları olur. Böylece iç içe grup korunabilir.

Yeni grup `metadata.frame` alanına seçim bounds'undan türetilen frame yazar ve edit modunda seçilir. Grubu çözmek yalnız aktif grup kaydını kaldırır; tek doğrudan alt grup kalırsa o grup preselect edilir, aksi halde leaf nesneler edit çoklu seçim olarak kalır.

## Grup dönüşümleri

- Grup taşıma bütün leaf modelleri ve iç grup frame'lerini taşır.
- Dört köşe resize **uniform** scale hesaplar; en-boy ayrı ölçeklenmez.
- Rotate handle bütün nesne noktalarını frame merkezi çevresinde döndürür.
- Line/arc/bezier noktaları doğrudan map edilir.
- Circle radius, ellipse/rectangle yarıçapları ve traffic sign scale büyütülür.
- Text/callout label boyutu scale edilir.
- Closed shape noktaları, kontrolleri ve frame'i dönüştürülür.
- Callout cache kutusu ölçeklenir ve signature güncellenir.

Yol dönüşümü için kod dalı yoktur; zaten yol grup/çoklu seçime alınmaz.

## Seçim state'i ve geçmiş

Tekli state `{ id, mode }`; çoklu state `{ ids, mode, activeGroupId }` olarak capture edilir. [[Undo Redo]] belge snapshot'ıyla birlikte bu state'i restore eder. Multi state'te id varsa tekli state restore edilmez.

## Katman işlemleri

Üst araç çubuğundaki komutlar önce çoklu seçim olup olmadığını kontrol eder; yoksa tekli seçime yönlenir. Manager her katman işleminden sonra grup DOM'unu tekrar kurar ve yolları arkaya alır. Ayrıntı: [[Nesne Sistemi#Katman sırası]].

## Belirsiz

- Edit modunda aktif nesne dışındaki canvas noktasına basmak da aktif nesne için drag adayı başlatır. Bunun dokunmatik “nesneyi her yerden sürükle” kararı mı yoksa istenmeyen davranış mı olduğu koddan kesinleşmiyor.
- Marquee “kesişim” seçimi yapar. Ürün beklentisinin tam kapsama olup olmadığı belirtilmemiştir.
- `groupForObject()` çakışan üst grup üyeliği bulursa warning verip null döner; normal API çakışmayı önlemeye çalışsa da dışarıdan bozuk import için kullanıcıya görünür bir çözüm yoktur.

