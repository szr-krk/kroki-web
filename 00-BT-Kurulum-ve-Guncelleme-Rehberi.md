# Kroki — BT Kurulum ve Güncelleme Rehberi

Kroki 2.0, kurum içi ağda bir web sunucusundan yayımlanabilen çizim uygulamasıdır. Aşağıdaki notlar kurulum ve bakım için yardımcı olabilir.

## İlk kurulum

1. GitHub deposunun güncel dosyalarını indirin. Klasör yapısını koruyun.
2. Dosyaları IIS, Nginx veya Apache üzerindeki bir uygulama klasörüne yerleştirin. Açılış dosyası `index.html` olur.
3. Kullanıcılara sabit bir adres verin. Örnek: `https://kroki.kurum.local/`. HTTPS kullanılması önerilir.
4. JavaScript, CSS, SVG, JSON ve TTF dosyalarının sunulabildiğini kontrol edin. IIS'te JSON için gerekirse `application/json` MIME türünü ekleyin.
5. Chrome veya Edge ile açın. Bir hazır çizimi düzenleyin; SVG kaydedip yeniden açmayı deneyin.

Derleme, paket kurulumu, uygulama sunucusu ve sunucu veritabanı gerekmez. Kurum içindeki dosyalara erişim yeterlidir; dış internet servisi kullanılmaz.

## Önbellek ve veri tasarrufu

HTML ve sürüm dosyası için aşağıdaki HTTP başlığı kullanılabilir:

```http
Cache-Control: no-cache
```

Bu başlık dosyayı her seferinde bütünüyle indirmek anlamına gelmez. ETag veya Last-Modified açıksa değişmeyen dosya yeniden kullanılabilir. Sunucunun bunları üretmesi faydalıdır. HTML içindeki meta etiketleri HTTP sunucu ayarının yerine geçmez.

JS/CSS ve font dosyaları önbellekte tutulabilir. Adreslerdeki `?v=` değeri yeni yayında değiştirilir. Hazır çizimler yalnız ilgili liste ilk açıldığında yüklenir. Sunucuda gzip veya Brotli sıkıştırması açılması da veri aktarımını azaltabilir.

## Yeni sürüm yayımlama

1. `index.html` içindeki `kroki-version` değerini örneğin `2.1` yapın. `kroki-build` değerini yeni ve artan bir yayın kimliğiyle değiştirin; biçim `YYYYMMDD.sıra` şeklindedir. Örnek: `20261105.1`.
2. Aynı dosyadaki `src/` dosya adreslerinin `?v=` değerlerini yeni build ile değiştirin. Eski build metni bu alanlarda ortak olduğu için dosya içinde bul/değiştir kullanılabilir. Gerekirse `src/home.js` içindeki kılavuz adresini de güncelleyin.
3. `src/version.json` içindeki `version` ve `build`, HTML ile aynı olmalıdır. `app` değeri `Kroki` olarak kalır.
4. Önce uygulama dosyalarını, sonra `index.html` dosyasını, **en son `src/version.json` dosyasını** yayımlayın. Mümkünse bütün yayını tek seferde değiştirin. Böylece sürüm duyurusu dosyalardan önce gitmez.
5. Yeni bir tarayıcı sekmesinde ana ekrandaki sürümü ve temel kaydetme/açma işlemini kontrol edin.

Kurum sunucusu GitHub değişikliklerini kendiliğinden indirmez. İstenirse BT'nin mevcut dağıtım aracıyla aktarım otomatikleştirilebilir.

## Kullanıcıya güncelleme nasıl ulaşır?

Uygulama açık ve görünürken yaklaşık beş dakikada bir küçük sürüm dosyası kontrol edilir. Sekmeye dönüldüğünde de kontrol yapılır; sık kontroller sınırlandırılır. Ağ hatası çizimi durdurmaz.

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

Bu işlevleri günlük kullanımda çağırmak gerekmez. Kontrol veya sorun incelemesi sırasında yardımcı olabilirler.

Tek HTML çevrimdışı sürüm ayrı bir teslimdir. `file://` üzerinden açıldığında sunucu güncelleme kontrolü yapılmaz; yeni dosya ayrıca üretilip dağıtılır.
