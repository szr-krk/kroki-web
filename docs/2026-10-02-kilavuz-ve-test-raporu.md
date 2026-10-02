# 2 Ekim 2026 — Kılavuz, tutarlılık ve performans kontrolü

## Sonuç

Kullanım kılavuzu mevcut CSS, renkler, simgeler ve kart düzeni korunarak güncellendi. İlk çizim, seçim, taşıma, dolgu, yol ekleme, kaydetme ve yeniden açma işlemleri somut adımlarla anlatılıyor. Fotoğraf yükleme ve yarım kalan çizimi kurtarma eklendi. Düz uç / 2 kalınlık varsayılanı, dolgulu döndürülmüş şekil ve kalın çizgi seçimi açıklandı. Çoklu seçimin doğrudan taşınabilmesi ve yalnızca düz / yuvarlak uç seçenekleri hakkındaki eski bilgiler düzeltildi.

Ana ekrandaki kılavuz açma işlemi ve kaynak dosyası adresleri sürümlendi; yenilenen sayfa eski kılavuzu önbellekten kullanmaz.

## Çalışma kontrolleri

- `scripts/*smoke.cjs`: 36/36 geçti. Kataloglar, seçim önceliği, döndürülmüş dikdörtgen, yol cebi ve ayrılan yol, ada kırpma, ızgaraya yapışma, metin, fotoğraf, çoklu seçim, dönüşler, çizim türü dönüşümü ve dokunmatik kumanda kapsandı.
- `touch-control-panel-smoke.cjs`: 1 birim hareket, basılı tutma, geri alma, zoom, dışarı tıklayarak kapanma ve otomatik kapanma geçti.
- `import-framing-browser.cjs`: masaüstü / tablet / dikey ekranda 18 fotoğraf yükleme; oran koruma, görünürlük, SVG açma ve kaydedilmiş kamera konumuna dönme geçti.
- `arc-arrow-geometry-browser.cjs`: 126 varyant; dairesel yay, ok ucu hizası, sürükleme, yapışma, geri al / yinele, belge dönüşümü, kopyalama ve silme geçti.
- `island-arc-render-browser.cjs`: 7 ada / kavşak sahnesinde çizim, kırpma, stil, seçim ve hit-test geçti.
- `document-recovery-browser.cjs`: önceki veri biçimi, otomatik kayıt gruplama, iki anlık görüntü, fotoğrafın yeniden kullanımı, kayıt hatası, iptal, canlı sekmeler, tarayıcı çökmesi, önceki kayda geri düşme ve kurtarma / silme yarışı geçti.
- `editor-interaction-browser.cjs`: 12 düzenleme senaryosu, geri al / yinele ve ilgisiz yolların değişmemesi geçti.
- Aynı 12 senaryo `d55fc3f` sürümüyle karşılaştırıldı: geometri, özellik alanları ve tuval pikselleri birebir aynı.
- Yeni `guide-and-selection-browser.cjs`: 1440, 768 ve 390 piksel genişlikte taşma, bölüm bağlantıları, simgeler, açılan yardım kutuları, yazdırma görünümü ve uygulama içinden kılavuz açma geçti. 10 nesne türünde varsayılan 2 / düz uç ve kullanıcının 100 / yuvarlak uç ayarlarının korunması geçti.
- Aynı yeni testte kullanıcı SVG’sindeki taş dolgulu dikdörtgenin ölçüleri ve 100 kalınlıklı çizgi; küçük sahne, 102 nesneli uzamsal indeks ve belge kaydet / yeniden yükle sonrasında doğru seçildi.
- Kılavuz CSS’sinin önceki sürümle birebir aynı olduğu ayrıca kontrol edildi.

İlk taramada eski yol testi, `dash ? butt : round` kaynak ifadesini aradığı için başarısız oldu. Kullanıcının yeni talebine göre bütün yol uçları `butt` olduğundan beklenti güncellendi; ilgili davranış testleri geçti. Eksik Playwright bağımlılığı mevcut Codex çalışma ortamından sağlandı; projeye bağımlılık kurulmadı.

## Performans ölçümleri

Windows, Node.js 24.19.0, headless Chrome / Playwright. Kare ölçümünde CPU 6 kat yavaşlatıldı; her senaryoda 60 hareket karesi kullanıldı.

| Senaryo | İlk çalıştırma p95 kare süresi (ms) |
| --- | ---: |
| Çizgi ucu | 31,9 |
| Yay kavisi | 39,3 |
| Bezier kontrolü | 26,3 |
| Kübik kontrol | 24,6 |
| Dikdörtgen boyutu | 25,1 |
| Dikdörtgen dönüşü | 24,7 |
| Elips boyutu | 24,0 |
| Daire yarıçapı | 24,5 |
| Araç dönüşü | 26,4 |
| Levha dönüşü | 29,0 |
| Sembol dönüşü | 25,9 |
| Kübik eğri taşıma | 23,8 |

Karşılaştırma çalıştırması diğer testlerle aynı anda yürüdü; p95 değerleri 23,1–72,8 ms, önceki sürüm değerleri 23,9–57,9 ms oldu. Bu zamanlar ortam yüküne duyarlıdır; tek ölçümden performans artışı veya düşüşü sonucu çıkarılmadı. Bu çalıştırmada da pikseller ve işlem sonuçları birebir aynı kaldı.

- 303 nesneli otomatik kurtarma sahnesi: belge yakalama 45,7 ms; kayıt 155,1 ms.
- 102 nesneli sahnede 3000 seçim sorgusu: son yerel çalıştırmada toplam 16,5 ms.
- Katalog performans / önbellek denetimi geçti: 353 kayıt; gereksiz SVG kopyaları, kontrolsüz büyüyen önbellekler ve yinelenen render yazımları ilgili testlerle denetlendi.

Bu ölçümler test makinesine aittir. Fiziksel bir tablette FPS, bellek sızıntısı için saatler süren kullanım veya bütün cihaz / tarayıcı kombinasyonları ölçülmedi.

## Tekrar çalıştırma ve kanıtlar

Playwright gerektiren testlerde mevcut runtime paket klasörünü `NODE_PATH`, Chrome yolunu `CHROME_PATH` olarak kullanın. Testler yerel geçici HTTP sunucularını kendileri açıp kapatır.

Yeni kılavuz / seçim testi `TEST_BASE_URL=https://szr-krk.github.io/kroki-web` ile yayınlanan sürümde de çalıştırılabilir.

Ham sonuçlar ve ekran görüntüleri yerel `outputs/` klasöründedir: `comprehensive-smoke-results.json`, `comprehensive-browser-results.json`, tarayıcı test günlükleri ve `guide-1440.png`, `guide-768.png`, `guide-390.png`. Bu test çıktıları yayınlanan uygulamanın parçası değildir.
