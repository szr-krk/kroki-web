# Home

Home, Kroki'nin başlangıç ve belge kitaplığı ekranıdır. Görünüm ve gezinme düzeni önceki arayüz referansından uyarlanmıştır; uygulama saf HTML, CSS ve JavaScript ile çalışır.

## İlgili dosyalar

- `index.html`: başlık, sol menü, liste panelleri, yükleme ve kılavuz pencereleri.
- `src/home.css`: ana ekran, kartlar, önizleme ve pencereler.
- `src/home.js`: sekme seçimi, sayaç, hazır çizimler, dosya/kod yükleme arayüzü, kılavuz ve tam ekran.
- `src/editor-main-menu.js`: mevcut editör geçişleri, kayıt listeleri, önizleme işlemleri ve import.
- `src/core/documentStorage.js`: değiştirilmeden korunan IndexedDB katmanı.

## Ekran ve gezinme

Üstte uygulama adı, Tam Ekran ve Kılavuz bulunur. Sol menü sırasıyla Yeni Kroki, Son Krokiler, Şablonlarım, Hazır Çizimler, SVG Yükle ve Fotoğraf Yükle işlemlerini içerir.

Son Krokiler, Şablonlarım ve Hazır Çizimler aynı sağ panelde açılır. Seçili düğme ve kayıt sayacı birlikte güncellenir. Listenin ve sol menünün kendi düşey kaydırması vardır; bütün ekran kaydırılmaz. İlk açılış ve editörden dönüş Son Krokiler'e gider. Şablon kaydetme tamamlandığında Şablonlarım seçilir.

Ana ekran, editörün orantılı `rem` ölçeğinden bağımsız okunabilir boyutlar kullanır. Yatay tablette üç, daha dar ekranda iki kart sütunu vardır. Telefon boyutunda menü üstte iki satıra geçer.

## Kart ve önizleme akışı

- Kartta çizim, ad ve son güncelleme zamanı gösterilir.
- Kart seçimi büyük önizleme açar; tek başına editördeki belgeyi değiştirmez.
- **Düzenle:** son krokiyi kendi kayıt kimliğiyle açar. Şablon/hazır çizim boş kayıt kimliğiyle açılır; daha sonraki normal kayıt kaynak şablonu değiştirmez.
- **Şablon Yap:** son kroki veya hazır çizimin kopyasını, istenen adla mevcut şablon deposuna yazar.
- **Yeniden Adlandır:** yalnız kullanıcı şablonları için vardır.
- **Sil:** yalnız kullanıcı kayıtları için vardır ve onay ister. Hazır çizimler silinemez.
- **Paylaş:** cihazın dosya paylaşımı, imzalı SVG indirme veya SVG kodunu kopyalama seçenekleri sunar. Yerel kayda erişmeyen bir URL paylaşılmaz.
- Kapat, pencere dışına dokunma ve Escape önizlemeyi kapatır. Odak açan karta döner; Tab pencerede tutulur.

## Yükleme ve kılavuz

SVG Yükle, dosya seç/sürükle ve SVG kodu yapıştır seçeneklerini açar. Fotoğraf Yükle desteklenen görselleri seçtirir. Dosya seçildikten sonra Aç ve Düzenle ile mevcut import akışına geçilir. Ana ekrana dosya bırakmak da aynı seçili dosya onayını açar.

Seçilen fotoğraf veya SVG, `homeUploadSelected` kartında oranı korunmuş ve kırpılmamış önizlemeyle gösterilir; altında dosya adı, boyutu ve açma/değiştirme düğmeleri bulunur. Önizleme yerel Blob URL'sini bir `img` içinde kullanır; SVG içeriği sayfa DOM'una eklenmez. Dosya değiştirilince veya pencere kapanınca önceki önizleme ve Blob URL'si bırakılır. Önizleme çözülemezse kartta bilgi gösterilir; dosya değiştirme ve mevcut import doğrulaması kullanılabilir kalır.

SVG kodu ve dosyası aynı `importKrokiSvgText` doğrulamasını kullanır: yalnız Kroki imzalı belge metadata'sı içeren SVG açılır. Genel SVG parser eklenmemiştir; dış SVG markup'ı doğrudan sayfaya yerleştirilmez.

Fotoğraf mevcut `PhotoBackgroundManager.stateFromFile` üzerinden etkileşimsiz altlığa dönüştürülür. Kaynak dosya değiştirilmez. Kaydetme mevcut editör akışında kullanıcı komutuyla yapılır.

Yeni fotoğrafın sınırları doğal en-boy oranında, `(0,0)` başlangıçlı ve önceki belgenin pan/zoom durumundan bağımsızdır. Fotoğraf ve imzalı SVG dosyaları, editör görünür olduktan sonra içeriğin tamamı kırpılmadan, oranı korunarak, merkezlenmiş ve ek kadraj payı olmadan açılır. Farklı ekran/içerik oranından kalan boşluk iki yana eşit dağılır. Son Krokiler'den açılan belgenin kayıtlı kamera konumu korunur. Eski fotoğrafların saklanan koordinatları değiştirilmez; kadraj hesabında yalnız fotoğrafın gerçek görünen sınırları kullanılır.

Kılavuz, mevcut `kilavuz.html` içeriğini aynı sayfadaki pencerede gösterir. İçerik ilk açılışta yüklenir. Tam ekran düğmesi mevcut tarayıcı API'leriyle çalışır; desteklenmeyen cihazda uygulama kullanılabilir kalır.

## Değişmeyen kayıt sözleşmesi

- IndexedDB adı: `kroki.documents.v1`; sürüm: `1`.
- Depolar: `documents` ve `assets`.
- Kayıt türleri: `recent` ve `template`.
- Son krokiler sınırı: `10`.
- Fotoğraf verisi aynı Blob/asset düzeninde saklanır.
- `saveRecent`, `saveTemplate`, serializer, depolama çekirdeği ve fotoğraf çekirdeği korunur.
- Yeni kroki açmak veya bir şablonu düzenlemek kendiliğinden yeni kalıcı kayıt oluşturmaz.
- Yayın aynı GitHub Pages adresinde kalır; tarayıcının mevcut kayıtlarının origin'i değiştirilmez.

## Performans ve uyumluluk

Hazır çizim kartları ilk kez ilgili sekme açılınca hazırlanır. Kayıtlı kartların SVG önizlemesi `IntersectionObserver` ile görünür alana yaklaştığında üretilir; resim çözümü `loading="lazy"` ve `decoding="async"` kullanır. Liste yenilenirken eski gözlemler bırakılır. Önizleme SVG'leri `img` içinde gösterilir.

React, paket yöneticisi, derleme adımı, CDN veya başka bir çalışma zamanı kütüphanesi yoktur. Yeni kod Chrome 90 tabanına uygun API ve CSS kullanır. Kart oranı için Chrome 88'den beri desteklenen `aspect-ratio` kullanılır; Chrome 90 sonrası API'lere bağımlılık eklenmez.

Bağlantılar: [[Editör]], [[Menü Sistemi]], [[Serializer]], [[Performans Kriterleri]].


### 2026-10-17 — Hazır çizimleri gerektiğinde yükleme
`ready-drawings.js` ilk sayfa açılışında indirilmez. Home scriptinin `data-ready-source` adresi yalnız Hazır Çizimler sekmesi ilk açıldığında yüklenir; aynı oturumda yeniden indirilmez. Ağ hatasında yeniden deneme düğmesi sunulur. Paket henüz yüklenmediyse bu bölüm için bağlantı gerekir; HTTP önbelleğinin kullanılabilirliği tarayıcıya bağlıdır. GitHub Pages gzip sıkıştırması ve `max-age=600` HTTP önbelleği canlı yanıtlarla doğrulanmıştır; özel açma kodu veya servis çalışanı eklenmemiştir.


## 21.10.2026 — Güncel kullanım kılavuzu
Kılavuz 16 bölüm halinde güncellendi; 16 dolgu seçeneği ve 7 çizgi deseni seçeneği gerçek SVG örnekleriyle belgelenir. Ada/cep dolguları, fren genişliği, desen-ok dışlaması, şekil dönüştürme, levha metin alanları, paylaşma/kod yükleme, merkezleme ve görünüm tercihleri kapsanır. Home iframe URL sürümü ve home.js yükleme sürümü birlikte güncellenir. Yazdırma öncesi kapalı soru yanıtları açılır, sonrasında eski durumuna döner. `guide-and-selection-browser.cjs` mobil/tablet/masaüstü, gerçek desen envanteri, SVG boya referansları, bağlantı/ikon kimlikleri ve gömülü açılışı doğrular.


## 23.10.2026 — Hazır çizim listesinin yenilenmesi
Önceki altı hazır çizim kaldırıldı; kullanıcının verdiği beş imzalı SVG dosyası içerikleri değiştirilmeden gömüldü. Türkçe alfabetik ve sayı sırası: Diğer Kavşak 1, Diğer Kavşak 2, Dörtlü Kontrolsüz Kavşak 1, Dörtlü Kontrolsüz Kavşak 2, T Kavşak. Dosya adları başlık olarak korunur. Kartlar ve Düzenle işlemi bu beş kaydı kullanır; kişisel Son Krokiler/Şablonlarım kayıtları değişmez. Lazy yükleme korunur; hazır çizim paketinin URL sürümü yenilendi.


## 23.10.2026 — Kılavuz bölüm listesinin bağımsız kaydırılması
Masaüstünde sol bölüm listesi pencere yüksekliğinden 32 piksel kısa olacak biçimde sınırlandırılır; kendi içinde dikey kayar. Liste sonundaki kaydırma ana metne aktarılmaz. Klavyeyle odaklanabilir. Dar ekranlarda mevcut yatay bölüm şeridi korunur; dikey yükseklik sınırı uygulanmaz. Gömülü kılavuz ve home script URL sürümleri yenilendi.


## 24.10.2026 — Tam çevrimdışı kurulum ve bağlantı durumu

HTTPS üzerinde `offlineManager.js` ve kökteki `sw.js` çekirdek çalışma dosyalarını önceden indirir; SHA-256 doğrulaması tamamlanınca “çevrimdışı kullanıma hazır” gösterilir. Hazır çizimler ilk kez çevrimdışıyken de açılır; kılavuz ise yeni davranışta yalnız ilk tıklamada çevrimiçi indirilir ve sonrasında çevrimdışı açılır; paket indirilmiş olsa da katalogların ve kartların gerektiğinde çalıştırılması korunur. 17.10.2026 notundaki bağlantı gereksinimi, çevrimdışı kurulum tamamlanmışsa artık geçerli değildir.

Kroki ikonu çevrimiçiyken yeşil, bağlantı yokken gridir; altında okunabilir durum metni vardır. Editörün sol alt zoom kutusunda ek ikon veya metin satırı yoktur; çevrimiçiyken koyu yeşil çerçeve ve açık yeşil arka plan, çevrimdışıyken mevcut gri/beyaz görünüm kullanılır. Kutu eski yüksekliğini korur; ayrıntılı durum title bilgisinde bulunur. Sunucu erişimi sürüm kontrolleriyle doğrulanır. Çevrimdışı yönetici önizleme iframe'lerinde çalışmaz. HTTPS olmayan kurulumlarda neden hazır olunamadığı belirtilir; file:// tek dosya teslimi “Yerel dosya” gösterir.

Güncelleme bildirimi artık tüm yeni sürüm doğrulanana kadar bekler. Kullanıcı kabul ederse mevcut kayıt/doğrulama/geri açma akışı korunarak bekleyen worker etkinleşir. İndirme veya doğrulama hatasında aktif önbellek ve kişisel kayıtlar silinmez. Her sekme kendi build'ini URL'de `_kroki` ile taşır; güncellenmeyen sekmenin tembel yüklenen dosyaları ve önizleme iframe'i kendi sürümünde kalır. BT rehberinde yayın listesi üretme ve dağıtım sırası belgelenir.

## Kroki 2.0 — Ad, ikon, sürüm ve güncelleme
Görünen marka Kroki olarak yenilendi; ana ekran ve tarayıcı ikonu gönye/kalem görseli kullanır. Ana ekrandaki sürüm meta verisinden okunur. BT rehberi depo kökündeki 00-BT-Kurulum-ve-Guncelleme-Rehberi.md dosyasıdır. updateManager.js yalnız HTTP(S) açılışında yaklaşık beş dakikada bir version.json kontrol eder. Etkin sürükleme, metin girişi ve açık pencere sırasında bildirim bekletilir. Kullanıcı isterse çizimi yerelde doğrulanan bir güncelleme kaydından yeni sürümde açılır; isterse ana ekrana dönüşe kadar güncelleme ertelenir. Tamam düğmesi güncelleme başlatmaz.


### 24.10.2026 — Kılavuz isteğe bağlı ve sürümlü
Kılavuz 168.704 bayttır; çekirdek kurulumda indirilmez. `data-guide-source` URL'si yalnız düğmeye basınca iframe'e atanır. `guideVersion` ve yayın SHA-256 değeri ile doğru kopya doğrulanır; aynı yayının sonraki açılışları önbellekten karşılanır. Yeni uygulama yayını eski kılavuzu güncelmiş gibi sunmaz. İlk açılışta bağlantı yoksa açıklama gösterilir; tekrar tıklama yeniden dener. Harici iframe erişimi hata vermesin diye klavye olay bağlama korumalıdır. Bağlantı adresi BT tarafından ayarlanabilir; harici sunucunun iframe izni ve kendi sürüm/saklama düzeni gerekir.
