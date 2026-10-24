# Kroki

[BT Kurulum ve Güncelleme Rehberi](00-BT-Kurulum-ve-Guncelleme-Rehberi.md)

Güncel uygulama sürümü: **2.0**.

Tarayıcıda çalışan SVG kroki editörü. Saf HTML, CSS ve JavaScript kullanır; uygulamayı çalıştırmak için paket kurulumu veya derleme gerekmez.

- [Canlı uygulama](https://szr-krk.github.io/kroki-web/)
- [Güncel kullanım kılavuzu](https://szr-krk.github.io/kroki-web/kilavuz.html)

## Çevrimiçi teslim içeriği

- `index.html`: ana ekran ve editör.
- `kilavuz.html`: görsel kullanım kılavuzu.
- `sw.js`: tüm çalışma dosyalarını doğrulayarak cihazda saklayan çevrimdışı kurulum ve güncelleme katmanı.
- `src/`: uygulama kodları, gömülü araç/levha/sembol katalogları ve gereken yazı tipi.
- `docs/*.md`: teknik dokümantasyon; tarihli raporlarda ölçüm tarihi ayrıca belirtilir.
- `.gitignore`: yerel geliştirme dosyalarının yeniden yayımlanmasını engeller.

Araç ve sembol görselleri `src/data/` içindeki kataloglarda gömülüdür. `src/arial-narrow.ttf`, levha yazıları ve çıktı için gereken uygulama varlığıdır; kaldırılmamalıdır.

## Teslim dışındaki yerel dosyalar

23 Ekim 2026 kontrolünde yedek ZIP/diff dosyaları, Obsidian çalışma ayarları, test/üretim scriptleri, ham SVG/XML kaynakları ve yerel sunucu yardımcıları çevrimiçi dosya ağacından çıkarılmıştır. Yerel çalışma kopyasında korunurlar. Teknik notlarda geçen `scripts/`, `ARAÇLAR/` ve XML kaynak yolları bu yerel geliştirme araçlarına aittir; uygulama bunları çalışma sırasında yüklemez.

Son krokiler, şablonlar ve kurtarma kayıtları kullanıcının cihazındaki tarayıcıda tutulur; sunucuya gönderilmez. Başka cihazda düzenlemek için SVG çalışma dosyasını saklayın.

HTTPS üzerinden ilk açılışta “çevrimdışı kullanıma hazır” yazısını bekleyin. Ardından aynı adres internet olmadan da açılır. Kroki ikonu çevrimdışıyken gri olur; güncellemeler tüm dosyalar indirilip doğrulandıktan sonra kişisel veriler silinmeden uygulanır. Her yayında `sw.js` yayın listesi yeniden üretilmelidir; bakım komutu ve dağıtım sırası BT rehberindedir.
