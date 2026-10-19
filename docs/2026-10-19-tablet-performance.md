# Tablet performans doğrulaması — 19.10.2026

Başlangıç: `654ca08`. Yerel yedek değiştirilmedi. Süreler masaüstü Chrome testinde beş segment stilinin rebuild medyanıdır; fiziksel tablet gecikmesi/FPS ölçümü değildir. CPU_RATE=1. 6x testte süreler çok dalgalandığı için hız oranı olarak kullanılmadı.

| Sahne | Önce (ms) | Sonra (ms) |
|---|---:|---:|
| standalone | 4.7 | 7.7 |
| cross | 72.4 | 35.9 |
| terminal | 38.2 | 26.6 |
| curves | 275.0 | 85.4 |
| styled | 79.4 | 32.6 |
| overlap | 112.3 | 46.8 |
| detached-junction | 6.3 | 4.0 |
| straight | 1.7 | 1.8 |
| t | 9.0 | 14.5 |
| three | 26.9 | 11.1 |
| divided | 10.2 | 9.0 |

Küçük sahnelerde sabit hızlanma yok; kazanç karmaşık kontur/Q hesaplarında belirgin. Süreler ortam yükü/JIT/GC etkisi taşır; işlem sayıları ve çıktı eşitliği daha kararlı kabul ölçütleridir.

- 11 sahnede eski/yeni yüzey, kontur, kırpma, segment stili, Q düzenleme/reset, taşıma ve serializer round-trip sonuçları eşit.
- 12 nesne düzenleme senaryosunda geometri, panel değerleri ve piksel çıktıları eşit; undo/redo geçti.
- 30 yazılı nesneyle 40 pan: yazı DOM değişikliği 15000 → 0, aktif CP değişikliği 240 → 0. Zoom çıktısı eşit; Q hit ölçüsü zoom ile güncelleniyor.
- Segment düğmesi ve odak korunuyor; segment stili undo/redo geçti.
- 300 deterministik parça kümesinde sıralama/tie-break eşit. 1000 parçalık zincirde mesafe hesabı 1998999 → 6035.
- Bölünmüş ada (12 kombinasyon), ada ağzı (12 kombinasyon), Q, cep, ayrılan yol, kamera toparlanması, hazır çizim lazy load ve SVG yazım smoke kontrolleri geçti.

Gerçek zayıf tablette akıcılık ve özgün Windows tam ekran kilitlenmesinin ortadan kalktığı henüz doğrulanmış değildir.
