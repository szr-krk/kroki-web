# Kroki — BT Kurulum ve Güncelleme Rehberi

Kroki 2.0, kurum içi ağda bir web sunucusundan yayımlanabilen çizim uygulamasıdır. Aşağıdaki notlar kurulum ve bakım için yardımcı olabilir.

## İlk kurulum

1. GitHub deposunun güncel dosyalarını indirin. Klasör yapısını koruyun.
2. Dosyaları IIS, Nginx veya Apache üzerindeki bir uygulama klasörüne yerleştirin. Açılış dosyası `index.html` olur.
3. Kullanıcılara sabit bir adres verin. Örnek: `https://kroki.kurum.local/`. Çevrimdışı kurulum için HTTPS gereklidir (geliştirmede localhost istisnadır). HTTP üzerinden çevrimiçi editör çalışır, çevrimdışı kurulum yapılmaz.
4. JavaScript, CSS, SVG, JSON ve TTF dosyalarının sunulabildiğini kontrol edin. IIS'te JSON için gerekirse `application/json` MIME türünü ekleyin.
5. Chrome veya Edge ile açın. Bir hazır çizimi düzenleyin; SVG kaydedip yeniden açmayı deneyin.

Derleme, paket kurulumu, uygulama sunucusu ve sunucu veritabanı gerekmez. Kurum içindeki dosyalara erişim yeterlidir; dış internet servisi kullanılmaz.

## Önbellek ve veri tasarrufu

HTML ve sürüm dosyası için aşağıdaki HTTP başlığı kullanılabilir:

```http
Cache-Control: no-cache
```

Bu başlık dosyayı her seferinde bütünüyle indirmek anlamına gelmez. ETag veya Last-Modified açıksa değişmeyen dosya yeniden kullanılabilir. Sunucunun bunları üretmesi faydalıdır. HTML içindeki meta etiketleri HTTP sunucu ayarının yerine geçmez.

JS/CSS ve font dosyaları önbellekte tutulabilir. Adreslerdeki `?v=` değeri yeni yayında değiştirilir. Hazır çizimler yalnız ilgili liste ilk açıldığında çalıştırılır; çevrimdışı kurulum dosyayı önceden indirir. Sunucuda gzip veya Brotli sıkıştırması açılması da veri aktarımını azaltabilir.

## Çevrimdışı kullanım — 24.10.2026

İlk çevrimiçi açılışta `sw.js` uygulamanın bütün çalışma dosyalarını cihazdaki ayrı bir uygulama önbelleğine indirir: HTML, kılavuz, JS/CSS, hazır çizimler, kataloglar, ikon ve font. Her dosya yayın listesindeki SHA-256 özetiyle doğrulanır. Tamamlanmadan “çevrimdışı kullanıma hazır” yazılmaz. İndirme başarısızsa mevcut tamamlanmış sürüm korunur; bağlantı dönünce veya sonraki açılışta yeniden denenir.

Ana ekrandaki Kroki ikonu çevrimiçiyken yeşil, çevrimdışıyken gridir. Altındaki metin kurulumun sürüp sürmediğini veya çevrimdışı kullanıma hazır olduğunu belirtir. Editörde ek bir durum satırı yoktur; zoom kutusunun çerçevesi çevrimiçiyken koyu yeşil, arka planı açık yeşildir. Çevrimdışıyken kutunun mevcut gri çerçeve/beyaz arka plan görünümü korunur. Ayrıntı kutunun üzerine gelindiğinde okunabilir. Bağlantı bilgisi tarayıcının ağ olayları ve sürüm sunucusuna yapılan kontrollerden gelir; sunucuya erişim kaybı bir sonraki kontrol sırasında anlaşılır. Yerel tek HTML dosyasında “Yerel dosya” gösterilir.

Kurulum tamamlandıktan sonra aynı adres internet olmadan yeniden açılabilir. Tarayıcıyı kapatıp açmak kayıtları veya kurulan sürümü silmez. Ana ekrana ekleme zorunlu değildir. Tarayıcı/site verilerinin kullanıcı tarafından silinmesi bu kurulumu da kaldırır. Kalıcı depolama izni uygun tarayıcılarda en iyi çabayla istenir.

Uygulama önbelleği IndexedDB belgelerinden ayrıdır. Güncelleme krokileri, şablonları, kurtarma kayıtlarını ve tercihleri silmez; veri tabanı şeması değişmez. Birden fazla açık sekmede eski sürümün dosyaları o sekmeler kapanana kadar korunur. Başka klasördeki kurulumlar için önbellek adları yayın yolu ile ayrılır.

## Yeni sürüm yayımlama

1. Küçük geliştirme güncellemelerinde `index.html` içindeki `kroki-version` değeri `2.0` kalabilir; yeni bir sürüm kararı verildiğinde örneğin `2.1` yapılır. Her yayında `kroki-build` değerini yeni ve artan bir yayın kimliğiyle değiştirin; biçim `YYYYMMDD.sıra` şeklindedir. Örnek: `20261105.1`.
2. Aynı dosyadaki değişen JS/CSS dosyalarının `?v=` değerlerini yeni build ile değiştirin. Değişmeyen dosyaların adresleri korunabilir; böylece tarayıcı önbelleği kullanılmaya devam eder. Kılavuz değiştiyse `src/home.js` içindeki kılavuz adresini ve `index.html` içindeki `home.js` adresini de güncelleyin.
3. `src/version.json` içindeki `version` ve `build`, HTML ile aynı olmalıdır. `app` değeri `Kroki` olarak kalır.
4. Son dosya değişikliğinden sonra yerel bakım aracını çalıştırın: `python Yerel-Araclar/pwa_release.py online-repair` (geliştirme çalışma alanında). Araç HTML ile `src/version.json` eşleşmesini kontrol edip `sw.js` içindeki tam dosya listesini ve özetlerini üretir. Kaynak farklıysa klasörün tam yolunu verin. Python veya bu bakım aracı sunucuya yüklenmez. Her değişen yayına yeni build verin; tamamlanmış bir build aynı kimlikle yeniden yazılmaz.
5. **`sw.js` dahil tüm dosyaları aynı yayın olarak** aktarın. Mümkünse atomik dağıtım kullanın. Sıralı aktarım gerekiyorsa uygulama dosyaları → `index.html` → `sw.js` → en son `src/version.json` sırasını kullanın. Karışmış veya eksik dosyalı bir yayın çevrimdışı kurucu tarafından reddedilir; çalışan eski sürüm korunur. `sw.js` için JavaScript MIME türü ve `Cache-Control: no-cache` kullanın. Service worker kapsamı uygulama klasörüdür; kök alan adı yetkisi gerekmez.
6. Ana ekrandaki sürümü, “çevrimdışı kullanıma hazır” durumunu ve kaydetme/açma işlemini kontrol edin. Bağlantıyı kapatıp sayfayı yeniden açın; kılavuz ve Hazır Çizimler'i de deneyin. Güncelleme için tarayıcı verilerini temizlemeyin.

Kurum sunucusu GitHub değişikliklerini kendiliğinden indirmez. İstenirse BT'nin mevcut dağıtım aracıyla aktarım otomatikleştirilebilir.

## Kullanıcıya güncelleme nasıl ulaşır?

Yayın dosyalarının satır sonları `.gitattributes` ile LF olarak sabitlenir. Çevrimdışı özet üreticisi CRLF dosyayı reddeder; böylece Windows çalışma kopyası ile GitHub Pages'in sunduğu dosyaların SHA-256 değerleri farklılaşmaz. Bu ayarı kaldırmayın.

Uygulama açık ve görünürken yaklaşık beş dakikada bir küçük sürüm dosyası kontrol edilir. Sekmeye dönüldüğünde de kontrol yapılır; sık kontroller sınırlandırılır. Ağ hatası çizimi durdurmaz. HTTPS kurulumunda yeni sürümün tüm dosyaları arka planda indirilip doğrulanmadan kullanıcıya güncelleme sunulmaz. İndirme yarıda kalırsa eski sürüm çalışır. Tam indirilmiş bir güncelleme bağlantı kesildikten sonra da uygulanabilir. Bütün sekmeler kapanınca hazır bekleyen sürüm tarayıcının normal yaşam döngüsüyle etkinleşebilir.

- **Evet, güncelle:** Çizimin ayrı bir kopyası cihazdaki tarayıcıya yazılır ve okunarak doğrulanır. Yeni sürüm açılınca bu kopya otomatik yüklenir.
- **Hayır, bu çizim bittikten sonra güncelle:** Çalışmaya devam edilir. Kullanıcı çizimi bitirip ana ekrana dönünce güncelleme uygulanır. Üstteki “Tamam” düğmesi tek başına çizimin bittiği anlamına gelmez.
- Kayıt veya güncelleme hazırlığı başarısız olursa sayfa yenilenmez. Yarım kalmış bir dağıtım algılanırsa da çizim açık kalır.

Güncelleme öncesi kopya Son Krokiler'de tutulur. Geri alma geçmişi sayfa yenilenmesinden sonra yeniden başlar. Güncelleme sekmeyi veya devam eden sürükleme/metin girişini zorla kesmez.

## Verilerin yeri

Krokiler, şablonlar ve kurtarma kayıtları kullanıcının tarayıcısında IndexedDB'de tutulur. Sunucuya gönderilmez ve kullanıcılar arasında ortak değildir. Yayın adresini/protokolünü/portunu değiştirmek veya tarayıcı verilerini temizlemek kayıtlara erişimi etkileyebilir. Önemli çalışmalar ayrıca SVG çalışma dosyası olarak saklanabilir.

## Gerekirse incelenebilecek kod noktaları

| İşlev | Yer |
| --- | --- |
| Sürümü elle kontrol etmek | `Kroki.UpdateManager.check({ force: true })` |
| Mevcut sürüm ve bekleyen güncellemeyi görmek | `Kroki.UpdateManager.getState()` |
| Güncelleme kaydını hazırlamak ve doğrulamak | `KrokiMainMenu.prepareUpdate()` — normalde güncelleme yöneticisi çağırır |
| Güncelleme kaydını yeniden açmak | `KrokiMainMenu.restoreUpdate(id)` — normalde açılışta çağrılır |
| Kayıt katmanı | `src/core/documentStorage.js` |
| Güncelleme akışı | `src/core/updateManager.js` |
| Çevrimdışı durum / hazırlama / etkinleştirme | `src/core/offlineManager.js` |
| Sürümlü ve doğrulanan uygulama önbelleği | `sw.js` |

Bu işlevleri günlük kullanımda çağırmak gerekmez. Kontrol veya sorun incelemesi sırasında yardımcı olabilirler.

Tek HTML çevrimdışı sürüm ayrı bir teslimdir. `file://` üzerinden açıldığında sunucu güncelleme kontrolü yapılmaz; yeni dosya ayrıca üretilip dağıtılır.
