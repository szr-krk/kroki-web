# Undo Redo

Geçmiş sistemi komut farkı değil, bütün belge + seçim snapshot'ı saklar. Her işlem “önce” ve “sonra” state'ini içerir; undo/redo serializer importuyla tam state restore eder.

## İlgili kod dosyaları

- `src/core/historyManager.js`: stack, transaction, shortcut ve restore.
- `src/core/documentSerializer.js`: snapshot belge formatı.
- `src/core/editorObjectManager.js`: mutasyonları otomatik transaction ile sarar.
- `src/core/selectionManager.js`, `src/core/multiSelectManager.js`: drag ve toplu işlem transaction'ları.
- `src/core/roadIntersectionEngine.js`: Q düzenleme transaction'ı.
- `index.html`: Undo/Redo düğmeleri.

Bağlantılar: [[Serializer]], [[Nesne Sistemi]], [[Seçim Sistemi]], [[Kavşak Sistemi]].

## Snapshot içeriği

```js
{
  document: DocumentSerializer.exportDocument({ stableTimestamps: true }),
  selection: SelectionManager.getState(),
  multiSelection: MultiSelectManager.getState()
}
```

Belge nesneleri, gruplar, viewBox ve kavşak Q farkları dahildir. Aktif çizim aracı ve açık menu/panel state'i dahil değildir.

## Transaction API'si

- `begin(label)`: önce snapshot'ı.
- `commit(transaction, label)`: sonra snapshot'ı alıp stack'e iter.
- `record(label, fn)`: begin → fonksiyon → commit kısayolu.
- `push({ before, after, label })`: doğrudan komut ekleme.
- `suspend(fn)`: iç işlemlerin geçmiş üretmesini engeller.

Önce/sonra JSON olarak eşitse kayıt eklenmez. Yeni kayıt redo stack'ini temizler.

## Kapasite

Undo stack en fazla 120 komut tutar; sınır aşılırsa en eski işlem atılır. Redo için ayrıca sabit sınır uygulanmaz, fakat yalnız undo stack'ten taşınan mevcut komutları içerir.

## Restore davranışı

Undo/redo restore sırasında history suspend edilir:

1. Tekli ve çoklu seçim temizlenir.
2. Belge `importDocument(..., { skipHistory: true })` ile tamamen yeniden kurulur.
3. Multi selection id içeriyorsa multi state; yoksa tekli selection restore edilir.
4. Seçim yoksa kontrol noktaları ve stil UI'si temiz/senkron hale getirilir.

Bu tasarım bütün çapraz modül state'ini tutarlı restore eder; maliyeti her işlemde tüm belgeyi JSON clone/karşılaştırma ve import etmektir.

## UI ve kısayollar

- Sol üst Undo/Redo düğmeleri `onChange` listener'ıyla aktif/pasif olur.
- `Ctrl+Z`: undo.
- `Ctrl+Shift+Z`: redo.
- `Ctrl+Y`: redo.
- `input`, `textarea`, `select` veya contenteditable odağındayken kısayol manager tarafından ele alınmaz.
- Kod yalnız `ctrlKey` kontrol eder; `metaKey` kullanılmaz.

## İşlem sınırları

- Manager'ın tek çağrılık create/update/remove/layer işlemleri otomatik geçmişe girer.
- Pointer drag'ları canlı güncellemelerde `skipHistory` kullanır, pointer up'ta tek işlem commit eder.
- Yol ekleme, çoklu kopyalama/silme/katman, grup işlemleri ve Q düzenleme kendi transaction'larını kurar.
- Metin panelindeki sürekli yazma, özel `textInputTransaction` ile focus/input başlangıcından change/blur'a kadar birleştirilir.
- Import varsayılan olarak geçmişi temizler.

## Bağlı modüller

- Belge snapshot formatı: [[Serializer]].
- Tekli/çoklu state: [[Seçim Sistemi]].
- Q state: [[Kavşak Sistemi]].

## Belirsiz

- Büyük belge boyutlarında tam snapshot yaklaşımının performans/bellek hedefi için ölçüm veya test yoktur.
- macOS hedefleniyorsa `Cmd+Z` desteği mevcut değildir; hedef platform belirtilmemiştir.
- Trafik levhası ölçek/derece number input'ları `input` olayında her değer için manager güncellemesi yapar; bunların tek kullanıcı işlemi olarak birleştirilmesi için özel transaction yoktur.

