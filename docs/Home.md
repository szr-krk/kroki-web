# Home

Home, Kroki Pro'nun başlangıç ve belge kitaplığı ekranıdır. Görünüm ve gezinme düzeni `kroki-pro` referansından uyarlanmıştır; uygulama saf HTML, CSS ve JavaScript ile çalışır.

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

SVG kodu ve dosyası aynı `importKrokiSvgText` doğrulamasını kullanır: yalnız Kroki Pro imzalı belge metadata'sı içeren SVG açılır. Genel SVG parser eklenmemiştir; dış SVG markup'ı doğrudan sayfaya yerleştirilmez.

Fotoğraf mevcut `PhotoBackgroundManager.stateFromFile` üzerinden etkileşimsiz altlığa dönüştürülür. Kaynak dosya değiştirilmez. Kaydetme mevcut editör akışında kullanıcı komutuyla yapılır.

Yeni fotoğrafın sınırları doğal en-boy oranında, `(0,0)` başlangıçlı ve önceki belgenin pan/zoom durumundan bağımsızdır. Fotoğraf ve imzalı SVG dosyaları, editör görünür olduktan sonra içeriğin tamamı kırpılmadan, oranı korunarak, merkezlenmiş ve ek kadraj payı olmadan açılır. Farklı ekran/içerik oranından kalan boşluk iki yana eşit dağılır. Son Krokiler'den açılan belgenin kayıtlı kamera konumu korunur. Eski fotoğrafların saklanan koordinatları değiştirilmez; kadraj hesabında yalnız fotoğrafın gerçek görünen sınırları kullanılır.

Kılavuz, mevcut `kilavuz.html` içeriğini aynı sayfadaki pencerede gösterir. İçerik ilk açılışta yüklenir. Tam ekran düğmesi mevcut tarayıcı API'leriyle çalışır; desteklenmeyen cihazda uygulama kullanılabilir kalır.

## Değişmeyen kayıt sözleşmesi

- IndexedDB adı: `krokiPro.documents.v1`; sürüm: `1`.
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
