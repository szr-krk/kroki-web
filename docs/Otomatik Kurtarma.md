# Otomatik kurtarma

Online uygulama, tamamlanan çizim değişikliklerini cihazdaki IndexedDB'ye kaydeder. Undo geçmişi ve önizleme kaydedilmez. Ana sayfada **Yarım kalan çizimler → Çizimi Kurtar** ile devam edilir. Son kayıt okunamazsa önceki kayıt denenir.

- Değişiklikten yaklaşık 1 saniye sonra boşta çalışma fırsatı beklenir (en fazla 500 ms). En sık 2 saniyede bir yazılır. Sürekli tamamlanan işlemler kaydı en fazla 8 saniye erteler; devam eden dokunma/sürükleme bitmeden kayıt alınmaz.
- Değişiklik yoksa zamanlayıcı, çizim serileştirmesi veya periyodik disk yazması çalışmaz. Fotoğraf verisi yalnızca değiştiğinde yazılır.
- Her çizim oturumu için son iki tamamlanmış kayıt tutulur. Fotoğraf ve çizim aynı atomik işlemle yazılır; başarısız yazma eski kaydı bozmaz. Kullanılmayan fotoğraflar temizlenir.
- Sekme arka plana geçerken/kapanırken ek kayıt denenir. Ani kapanışta yalnızca tamamlanan kayıt garanti edilebilir; son işlem veya uzun süren henüz tamamlanmamış sürükleme kaybolabilir.
- Yeni krokiye geçme, kaydetmeden çıkma ve normal kaydet-çık akışları terk edilen oturumun kurtarma kayıtlarını siler. Yalnızca Kaydet, açık çizimin kurtarma korumasını sürdürür.
- Sekmelerin kayıtları ayrıdır. Web Locks desteklendiğinde halen açık sekmeler kurtarma listesinde gösterilmez. Kurtarılan eski oturum ancak yeni oturumun ilk kaydı başarılı olduğunda kaldırılır.
- Depolama hatası kullanıcıya bildirilir; yeniden denemeler seyrekleştirilir. Tarayıcı/site verilerinin silinmesi veya özel oturumun kapanması kayıtları silebilir. Eski uygulama sekmesi veri tabanı yükseltmesini engelliyorsa onu kapatıp sayfayı yenileyin.

Doğrulama: `scripts/document-recovery-browser.cjs` gerçek Chromium ve IndexedDB ile eski kayıt göçünü, boşta/sürüklemede gereksiz çalışma olmamasını, fotoğraf tekrar kullanımını, işlem iptalini, iki sekmeyi, renderer çökmesini, bozuk son kayıttan önceki kayda dönüşü ve kayıt/çıkış yarışını kontrol eder. 6 kat CPU yavaşlatma ölçümü gerçek düşük donanımlı tablet testi yerine geçmez.
