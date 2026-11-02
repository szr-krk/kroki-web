# Kroki 2.0 — BT Kurulum ve Güncelleme Rehberi

Teslim sürümü: **2.0** · Tarih: **2 Kasım 2026**

Kroki, tarayıcıda çalışan SVG kroki uygulamasıdır. IIS, Nginx veya Apache üzerinden statik dosya olarak yayımlanır. Sunucuda derleme, paket kurulumu, uygulama servisi ve veritabanı gerekmez.

## Teslim içeriği

| Dosya veya klasör | Görevi |
| --- | --- |
| `index.html` | Ana ekran ve çizim editörü |
| `src/` | Uygulama kodları, kataloglar, simgeler ve yazı tipi |
| `src/version.json` | Sürüm ve güncelleme bilgisi |
| `sw.js` | Doğrulanan çevrimdışı kurulum ve sürüm önbelleği |
| `kilavuz.html` | Uygulama içinden açılan kullanım kılavuzu |
| `00-BT-Kurulum-ve-Guncelleme-Rehberi.md` | Bu kurulum ve bakım rehberi |

`src/` altındaki bütün dosyalar ve klasör yapısı korunmalıdır. `src/arial-narrow.ttf` yazı tipi çıktıların doğru görünmesi için gereklidir. Ham araç görselleri, test dosyaları ve geliştirme araçları sunucuya aktarılmaz. Tek HTML çevrimdışı paket bu web tesliminden ayrıdır; `file://` üzerinden açılan paket sunucu güncellemelerini almaz.

## İlk kurulum

1. Aynı yayına ait teslim dosyalarını boş bir yayın klasörüne çıkarın. Dosyaları düzenlemeden ve yeniden kaydetmeden aktarın.
2. Uygulamayı sabit bir HTTPS adresinde yayımlayın. Örnek: `https://kroki.kurum.local/`. Ana dosya `index.html` olmalıdır. Çevrimdışı kurulum HTTPS gerektirir; geliştirme için localhost istisnadır.
3. HTML, JavaScript, CSS, SVG, JSON ve TTF dosyalarının sunulabildiğini doğrulayın. JSON için `application/json`, JavaScript için `text/javascript` veya `application/javascript`, SVG için `image/svg+xml` MIME türünü kullanın.
4. Sunucunun dosyalara giriş sayfası veya hata sayfası döndürmediğini, dosya içeriklerini değiştirmediğini kontrol edin. `sw.js` uygulamanın yayımlandığı klasörde kalmalıdır.
5. Chrome veya Edge ile uygulamayı açın. Ana ekranda **Versiyon: 2.0** ve **çevrimdışı kullanıma hazır** durumunu bekleyin.
6. Kılavuzu bağlantı varken bir kez açın; daha sonra çevrimdışıyken de açılabildiğini kontrol edin.
7. Aşağıdaki teslim kontrolünü tamamladıktan sonra kullanıcılarla sabit HTTPS adresini paylaşın.

Uygulamanın çalışması için dış internet servisi gerekmez. İlk kurulum ve yeni yayınların indirilmesi için uygulama sunucusuna erişim gerekir.

## Sürüm ve bağlantı düzeni

2.0 tesliminde HTML içindeki `kroki-version` ve `kroki-build`, `src/version.json` içindeki `version`, `build` ve `guideVersion` değerleri **2.0** olarak eşleşir. Dosya adreslerindeki `?v=2.0` etiketi tarayıcı önbelleğini sürümler. Uygulama açılınca adrese eklenen `?_kroki=2.0`, ilgili sekmenin doğru yayın dosyalarını kullanmasını sağlar; hata veya kullanıcıya ait bir kayıt numarası değildir.

Kullanıcılara yalnızca temel adres verilebilir. Uygulama sürüm ekini kendisi yönetir. Dosyaların işlevsel adları ve klasör yolları değiştirilmez.

**Yayımlanmış bir sürüm numarasıyla farklı dosyalar tekrar yayımlanmaz.** Bir sonraki değişiklik ayrı bir yayın olmalıdır; örneğin sürüm ve yayın kimliği **2.1** yapılır. Küçük bir düzeltme için de yeni kimlik gerekir.

## Sunucu önbelleği

`index.html`, `src/version.json` ve `sw.js` için aşağıdaki başlığı kullanın:

```http
Cache-Control: no-cache
```

Bu başlık dosyanın değişip değişmediğini yeniden kontrol ettirir; ETag veya Last-Modified açıksa değişmeyen içerik yeniden kullanılabilir. HTML meta etiketleri HTTP sunucu ayarının yerine geçmez.

JS, CSS, SVG ve font dosyaları önbelleğe alınabilir. Yeni yayında dosya sürüm etiketleri değiştirilir. Gzip veya Brotli sıkıştırması kullanılabilir; açılmış dosya içeriği teslimdekiyle aynı kalmalıdır.

## Çevrimdışı kullanım ve kullanıcı verileri

İlk açılışta uygulamanın bütün çalışma dosyaları cihazdaki ayrı bir önbelleğe indirilir. Her dosya yayın listesindeki SHA-256 özetiyle doğrulanır. Kurulum tamamlanmadan hazır durumu gösterilmez. İndirme başarısız olursa mevcut tamamlanmış sürüm korunur.

Kılavuz ilk kurulumun parçası olarak indirilmez. Kılavuz düğmesine basılınca o yayına ait dosya indirilir, doğrulanır ve saklanır. Bağlantı yokken daha önce açılmamış kılavuz için açıklama gösterilir. Bağlantı sağlandığında düğmeye yeniden basılabilir. Yeni yayın eski kılavuzu güncelmiş gibi göstermez.

Ana ekrandaki Kroki simgesi çevrimiçiyken yeşil, çevrimdışıyken gridir. Editörde yakınlaştırma kutusunun rengi ve açıklaması bağlantı durumunu gösterir. Aynı adres, kurulum tamamlandıktan sonra bağlantı olmadan açılabilir; ana ekrana ekleme zorunlu değildir.

Krokiler, şablonlar, tercihler ve kurtarma kayıtları kullanıcının tarayıcısında tutulur; sunucuya gönderilmez ve kullanıcılar arasında ortak değildir. Uygulama önbelleği bu kayıtlardan ayrıdır. Tarayıcıyı kapatıp açmak kayıtları silmez. **Site verilerini silmek çizim ve şablonları da silebilir.** Önemli çalışmalar ayrıca SVG dosyası olarak dışarı kaydedilmelidir.

Yayın adresini, protokolünü veya portunu değiştirmek önceki yerel kayıtlara erişimi etkiler. Normal güncelleme için tarayıcı verilerini temizlemeyin. Tasarım sürümünden 2.0'a geçişte tek seferlik temiz kurulum yapılacaksa önce gerekli krokileri SVG olarak dışarı alın; mümkünse yalnızca uygulama önbelleğini ve service worker kaydını sıfırlayın.

## Yeni sürüm yayımlama

1. Önceki teslimi yedekleyin ve yeni bir yayın numarası belirleyin; örneğin **2.1**.
2. `index.html` içindeki `kroki-version`, `kroki-build` ve dosya adreslerindeki `?v=` etiketlerini yeni sürüme taşıyın. `data-guide-source` adresinin sürümünü de güncelleyin.
3. `src/version.json` içindeki `version`, `build` ve `guideVersion` alanlarını aynı yeni sürüm olarak kaydedin. `app` değeri `Kroki` kalır. Güncel kılavuzu ve rehberi aynı teslimde bulundurun.
4. Son değişiklikten sonra geliştirici yayın envanterini ve dosya özetlerini yeniden üretmelidir. Geliştirme çalışma alanındaki bakım komutu: `python Yerel-Araclar/pwa_release.py online-repair`. Başka klasör kullanılıyorsa son argümanı o klasörle değiştirin. BT'ye hazırlanan teslimde `sw.js` önceden üretilmiş olmalıdır; sunucuda Python gerekmez.
5. Dosyaların LF satır sonlarını koruyun. Yayın dosyalarını aktarırken içerik dönüştürmeyin. Geliştirme deposundaki `.gitattributes` ayarı ve özet üreticisinin satır sonu kontrolü kaldırılmamalıdır.
6. Bütün uygulama dosyalarını, kılavuzu, `index.html`, `sw.js` ve `src/version.json` dosyalarını tek yayın olarak aktarın. Mümkünse atomik klasör değişimi kullanın. Sıralı aktarımda uygulama dosyaları ve kılavuz → `index.html` → `sw.js` → en son `src/version.json` sırasını izleyin.
7. Aşağıdaki teslim kontrolünü uygulayın. Eksik veya karışmış dosyaları olan yayın, çevrimdışı doğrulama tarafından reddedilir; önceki tamamlanmış sürüm korunur.

Kurum sunucusu GitHub değişikliklerini kendiliğinden indirmez. Her yeni teslim BT tarafından aynı yayın adresine aktarılmalıdır.

## Güncellemenin kullanıcıya ulaşması

Uygulama açık ve görünürken yaklaşık beş dakikada bir sürüm kontrol edilir. Sekmeye dönüldüğünde de kontrol yapılır. Ağ hatası çizimi durdurmaz. HTTPS kurulumunda yeni dosyalar indirilip doğrulanmadan güncelleme sunulmaz.

- **Evet, güncelle:** Açık çizim tarayıcıya kaydedilir ve okunarak doğrulanır. Yeni sürüm açılınca çizim geri yüklenir. Ana sayfada ayrıca çizim kaydı oluşturulmaz.
- **Hayır, bu çizim bittikten sonra güncelle:** Kullanıcı çalışmaya devam eder; ana ekrana dönünce güncelleme uygulanır. “Tamam” düğmesi düzenlemeyi bitirir, tek başına ana ekrana dönmek anlamına gelmez.
- Kayıt veya güncelleme hazırlığı başarısız olursa sayfa yenilenmez. İndirme yarım kalırsa önceki sürüm kullanılabilir.

Tam indirilmiş bir güncelleme bağlantı kesildikten sonra da uygulanabilir. Bütün sekmeler kapanınca bekleyen sürüm tarayıcının normal yaşam döngüsüyle etkinleşebilir. Açık eski sekmelerin dosyaları bu sekmeler kapanana kadar korunur. Güncelleme yerel krokileri ve şablonları silmez; geri alma geçmişi sayfa yenilendiğinde yeniden başlar.

## Teslim kontrolü

- Ana ekranda **Versiyon: 2.0**, adres çubuğunda `?_kroki=2.0` ve çevrimdışı hazır durumu görünür.
- Yeni kroki açılır; araç, levha ve sembol eklenir. SVG kaydedilir ve yeniden açılır.
- **13 Özel Amaçlı → Özel Amaçlı Araç** ile **19 Diğer → Diğer Araç** üzerinde kenar tutamaçları genişliği ve yüksekliği ayrı değiştirir; köşeler mevcut oranı korur. Diğer araçlara bu ek tutamaçlar uygulanmaz.
- Bağımsız boyutlandırma geri alınır, yinelenir ve SVG kaydedilip açılınca korunur.
- Çizim Araçları listesinin sonundaki boş düğme, “Tamam” işlemini yapar ve paneli kapatır.
- İtfaiye yeni eklendiğinde kırmızıdır. Güncellenen araçların ters görünümleri renk seçiminden etkilenmez.
- Kılavuz çevrimiçiyken bir kez açılır; ardından bağlantı kesilip uygulama ve kılavuz yeniden açılır.
- Son Krokiler ve Şablonlarım kayıtları, uygulama yeniden açıldığında kullanılabilir.
- Yeni yayın denemesinde güncelleme sırasında açık çizimin ve şablonların korunduğu doğrulanır.

## Sorun giderme

| Belirti | Kontrol |
| --- | --- |
| Çevrimdışı kurulum başlamıyor | HTTPS, tarayıcı desteği, service worker kaydı ve `sw.js` erişimi |
| Kurulum tekrar deneniyor veya güncelleme hazır olmuyor | Aynı yayına ait bütün dosyaların aktarılması, MIME türleri, içerik değiştiren sunucu ayarları ve SHA-256 eşleşmesi |
| Kılavuz çevrimdışı açılmıyor | İlgili sürümün kılavuzunu bağlantı varken bir kez açın |
| Eski sürüm görünmeye devam ediyor | Sunucuda `src/version.json` ve `sw.js` dosyalarını, yeni yayın numarasını ve bekleyen sekmeleri kontrol edin |
| Yerel kayıtlar görünmüyor | Aynı tarayıcı profili, yayın adresi, protokol ve portun kullanıldığını kontrol edin |

Destek için tarayıcı geliştirici konsolunda `Kroki.UpdateManager.getState()` ile etkin ve bekleyen sürüm; `Kroki.OfflineManager.getState()` ile çevrimdışı durum okunabilir. Elle sürüm kontrolü `Kroki.UpdateManager.check({ force: true })` ile yapılır. Bu komutlar normal kullanıcı işlemleri için gerekli değildir.
