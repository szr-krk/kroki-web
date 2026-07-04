# Serializer

`DocumentSerializer`, çalışma zamanı modellerini JSON uyumlu belgeye dönüştürür ve belgeyi yeniden manager/group/viewport/kavşak state'ine kurar. Çekirdek; `editor-main-menu-pro.js` üzerinden localStorage kayıtları, şablonlar, SVG metadata export/import ve history snapshot'ları tarafından kullanılır.

## İlgili kod dosyaları

- `src/core/documentSerializer.js`: export/import ve JSON dönüşümü.
- `src/core/editorObjectManager.js`: nesne sırası ve replace.
- `src/core/groupManager.js`: grup export/import.
- `src/core/styleManager.js`: tip bazlı style/label normalizasyonu.
- `src/core/roadIntersectionEngine.js`: Q düzenleme state'i.
- `src/core/historyManager.js`: serializer snapshot'larını geçmiş olarak kullanır.

Bağlantılar: [[Nesne Sistemi]], [[Undo Redo]], [[Kavşak Sistemi]], [[Menü Sistemi]].

## Belge şeması

Mevcut sürüm `schemaVersion: 1`, uygulama adı `Kroki Pro`dur.

```js
{
  schemaVersion: 1,
  app: "Kroki Pro",
  createdAt,
  updatedAt,
  viewport: { viewBox },
  objects: [
    { id, type, geometry, style, label, metadata }
  ],
  groups: [
    { id, name, children, metadata }
  ],
  roadIntersection: {
    version: 1,
    qEndpointEdits: []
  }
}
```

Nesneler SVG DOM sırasıyla export edilir; bu sıra katman sırasıdır.

## Export davranışı

- `createdAt` ve `updatedAt` her export çağrısında aynı “şimdi” ISO değeriyle yazılır.
- History snapshot'ı `stableTimestamps: true` kullanır; iki timestamp boş string olur ve JSON karşılaştırması kararlı kalır.
- Geometri plain clone edilir.
- Style ve label tip adapter'ından bağımsız olarak `StyleManager` ile normalize edilir.
- `metadata` içinden `draft`, `pointEdit`, `roadSelection`, `roadBarrierEdit` silinir.
- Gruplar `GroupManager.getAll()` ile alınır.
- Kavşak için yalnız manuel Q farkları alınır; türetilmiş contour kaydedilmez.

`toJson()` iki boşluk girintili JSON üretir.

## Import davranışı

1. `objects` dizisi taranır.
2. Registry'de olmayan tip atlanır ve warning eklenir.
3. Kimlikler yalnız harf/rakam/`_`/`-` kalacak şekilde temizlenir, 80 karakterle sınırlandırılır; çakışma varsa yeni id üretilir.
4. Modeller manager normalizasyonundan geçirilir.
5. Seçimler temizlenir, bütün nesneler geçmiş atlanarak replace edilir.
6. `viewport.viewBox` doğrudan canvas attribute'una yazılır.
7. Grup id/çocuk referansları yeni nesne id map'ine göre normalize edilir; en az iki geçerli çocuğu olmayan grup atılır.
8. Nesneler grup DOM'u kurulduktan sonra tekrar render edilir.
9. Kavşak Q state'i import edilir ve refresh zamanlanır.
10. Kontrol noktaları ve stil UI'si senkronize edilir.
11. `skipHistory` verilmediyse geçmiş tamamen temizlenir.

`fromJson()` parse hatasında `{ ok: false, warnings: ["JSON okunamadi"] }`; başarılı importta `{ ok: true, warnings }` döner.

## Kavşak durumu

`roadIntersection.qEndpointEdits` her Q için yalnız `entryCut`, `exitCut`, `controlDx`, `controlDy` değerlerini saklar. Import sonrası yol yüzeyleri ve Q'lar yeniden türetilir; key eşleşirse fark uygulanır. Ayrıntı: [[Kavşak Sistemi#Kaydedilen durum]].

## Güvenlik ve normalizasyon sınırları

- Bilinmeyen tip güvenli biçimde atlanır.
- Bozuk/tekrarlı id'ler yeniden eşlenir.
- Grup referansları yalnız canlı object/group id'leriyle tutulur.
- Adapter'ların geometri normalizasyonu çoğunlukla render/create sırasında devreye girer; serializer kendi başına her tipin sayısal alanlarını kapsamlı doğrulamaz.
- `signArt` gibi trafik levhası SVG içeriği metadata içinde taşınabilir ve adapter renderında `innerHTML` ile parse edilir. Import belgesinin güven kaynağı ürün düzeyinde ayrıca ele alınmalıdır.

## UI ile bağlantı durumu

`editor-main-menu-pro.js` serializer'ı şu işler için kullanır:

- Son kroki kaydı: `localStorage` `krokiPro.recentDocuments.v1`
- Şablon kaydı: `localStorage` `krokiPro.templates.v1`
- Son snapshot: `krokiPro.lastDocument.v1`
- SVG export metadata'sı
- Kroki Pro imzalı SVG import
- PNG export öncesi preview/kayıt snapshot'ı

Genel JSON dosya import/export UI'si yoktur. Genel SVG import yoktur; yalnız Kroki Pro imzalı SVG içindeki document payload açılır.

## Bilinen tutarsızlıklar

- `cleanMetadata()` `roadSelection` ve `roadBarrierEdit` alanlarını silerken `roadBoundaryEdit`, `roadPocketEdit` ve `roadPocketIslandEdit` alanlarını silmez. Bu alanlar da seçime bağlı geçici UI state'i gibi kullanılır; kayda sızabilir. [[Açık Hatalar]].
- Import `schemaVersion` veya `app` değerini doğrulamaz ve migration uygulamaz.
- ViewBox doğrudan `setAttribute` ile değişir; `kroki:viewboxchange` olayı yayınlanmaz. Viewport'a bağlı label offset'lerinin ilk import renderından sonra hemen yeniden hesaplanması garanti değildir.

## Belirsiz

- Belge timestamp'lerinin her kayıtta yenilenmesi mi, ilk `createdAt` değerinin korunması mı istendiği belli değildir.
- Gelecek schema sürümleri için geriye uyumluluk/migration politikası tanımlı değildir.
- JSON'un güvenilir yerel belge mi, kullanıcıdan veya ağdan gelen içerik mi olacağı belli değildir; levha SVG metadata'sı nedeniyle güven modeli önemlidir.
