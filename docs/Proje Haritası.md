# Proje Haritası

Bu vault, Kroki Pro'nun mevcut kaynak kodundan çıkarılan geliştirici haritasıdır. Uygulama derleme adımı olmayan, `index.html` tarafından sırayla yüklenen klasik JavaScript IIFE modüllerinden oluşur. Ortak çalışma alanı `window.Kroki`; eski/arayüz yardımcıları için ayrıca `window.krokiEditorState`, `window.krokiEditorRail`, `window.krokiEditorCamera` ve `window.krokiObjectEditCore` kullanılır.

## İlk okuma sırası

1. [[AI Devralma Notu]]
2. [[Proje Haritası]]
3. [[Sistem Durumu]]
4. [[Performans Kriterleri]]
5. [[Editör]]
6. [[Nesne Sistemi]]
7. [[Seçim Sistemi]] ve [[Kontrol Noktaları]]
8. Yol işi yapılacaksa [[Yol Sistemi]], [[Şerit Sistemi]] ve [[Kavşak Sistemi]]
9. Kalıcı veri veya geçmiş işi yapılacaksa [[Home]], [[Menü Sistemi]], [[Serializer]] ve [[Undo Redo]]
10. Katalog/asset işi yapılacaksa [[Trafik Levhası Sistemi]] ve [[Sembol ve Asset Sistemi]]
11. Değişiklikten önce [[Mimari Kararlar]], [[Açık Hatalar]] ve [[Codex Talimatları]]

## Çalışma zamanı katmanları

- **Ekran ve DOM iskeleti:** `index.html`, `src/home.js`, `src/editor-rail.js`, `src/editor-camera.js`, `src/editor-main-menu-pro.js` → [[Home]], [[Editör]], [[Menü Sistemi]].
- **Ortak nesne çekirdeği:** `src/core/shapeRegistry.js`, `src/core/editorObjectManager.js`, `src/core/styleManager.js` → [[Nesne Sistemi]].
- **Etkileşim:** `src/core/hitTestManager.js`, `src/core/selectionManager.js`, `src/core/multiSelectManager.js`, `src/core/controlPointManager.js`, `src/core/groupManager.js` → [[Seçim Sistemi]], [[Kontrol Noktaları]].
- **Adapter'lar:** `src/adapters/*.js` her nesne tipinin geometri, render, hit-test ve düzenleme sözleşmesini uygular → [[Nesne Sistemi]].
- **Yollar:** `src/ui/roadBuilder.js`, `src/ui/roadInspector.js`, `src/adapters/roadAdapter.js` → [[Yol Sistemi]], [[Şerit Sistemi]].
- **Kavşaklar:** `src/core/roadIntersectionEngine.js` → [[Kavşak Sistemi]].
- **Belge ve geçmiş:** `src/core/documentSerializer.js`, `src/core/historyManager.js` → [[Serializer]], [[Undo Redo]].
- **Trafik levhaları:** üretilmiş kataloglar, `trafficSignCatalog`, kitaplık UI'si ve adapter → [[Trafik Levhası Sistemi]].
- **Diğer semboller ve araçlar:** üretilmiş kataloglar, `otherSymbolCatalog`, `vehicleCatalog`, kitaplık UI'leri ve adapter'lar → [[Sembol ve Asset Sistemi]].

## Ekran akışı

`index.html` iki ana `<section>` içerir:

- `#home`: başlangıç ekranı. “Yeni Kroki”, son kayıtlar, şablonlar ve Kroki imzalı SVG yükleme `editor-main-menu-pro.js` ile bağlıdır.
- `#editor`: SVG çalışma alanı, geçmiş araç çubuğu, sağ ray, nesne araç çubukları ve açılır paneller.

Editör SVG'sinin temel sırası:

1. Dinamik `<defs>` düğümleri gerektiğinde canvas başına eklenir.
2. `#editorObjects`: kalıcı belge nesneleri, grup `<g>` düğümleri ve kavşak kontur katmanı.
3. `#editorEditLayer`: seçim çerçeveleri ve kontrol noktaları.

Yollar `#editorObjects` içinde her zaman diğer belge nesnelerinin arkasına taşınır. Kavşak kontur katmanı yol düğümlerinden sonra, normal nesnelerden önce tutulur. Ayrıntı: [[Yol Sistemi#Katman davranışı]].

## Ortak nesne modeli

Her kayıt aşağıdaki ana alanlara normalize edilir:

```js
{
  id,
  type,
  geometry,
  style,
  label,
  metadata
}
```

`type`, `ShapeRegistry` içindeki bir adapter'a karşılık gelir. Mevcut tipler: `line`, `arc`, `bezier`, `circle`, `ellipse`, `rectangle`, `closedShape`, `callout`, `road`, `text`, `trafficSign`, `otherSymbol`, `vehicle`. Ayrıntı: [[Nesne Sistemi#Adapter sözleşmesi]].

## Temel veri akışı

1. UI veya pointer olayı `EditorObjectManager.create/updateModel/updateGeometry` çağırır.
2. Manager modeli normalize eder ve tip adapter'ına `render` yaptırır.
3. `StyleManager` SVG stilini ve tipin sahip olmadığı metin etiketlerini uygular.
4. Seçim varsa `ControlPointManager` adapter'dan kontrol noktalarını yeniden ister.
5. Manager mutasyonları varsayılan olarak [[Undo Redo]] işlemi üretir.
6. Yol mutasyonları `RoadIntersectionEngine` tarafından sarılmış manager metotları üzerinden kavşak yenilemesi zamanlar.

## Önemli yükleme sırası

`index.html` içindeki script sırası bağımlılık çözümünün kendisidir. Örneğin registry ve style manager adapter'lardan; `roadAdapter` da `roadIntersectionEngine`den önce yüklenir. Yeni bir dosya eklenirse yalnız dosyayı oluşturmak yetmez, doğru sırada `<script>` etiketi de gerekir.

## Bağlantılı notlar

- Devralma: [[AI Devralma Notu]], [[Sistem Durumu]], [[Performans Kriterleri]]
- Ekranlar: [[Home]], [[Editör]], [[Menü Sistemi]]
- Yol alanı: [[Yol Sistemi]], [[Kavşak Sistemi]], [[Şerit Sistemi]]
- Nesneler ve etkileşim: [[Nesne Sistemi]], [[Seçim Sistemi]], [[Kontrol Noktaları]]
- Kalıcılık: [[Serializer]], [[Undo Redo]]
- Katalog: [[Trafik Levhası Sistemi]], [[Sembol ve Asset Sistemi]]
- Bakım: [[Mimari Kararlar]], [[Açık Hatalar]], [[Yeni Özellikler]], [[Codex Talimatları]]

## Belirsiz

- Depoda `package.json`, test koşucusu veya build tanımı yoktur. Uygulamanın hedef dağıtım ortamı kaynak koddan anlaşılmıyor; mevcut yapı doğrudan tarayıcıda çalışmaya yöneliktir.
- LocalStorage tabanlı son krokiler/şablonlar bağlıdır; uzun vadeli dosya sistemi, quota yönetimi ve migration politikası hâlâ ürün kararı gerektirir.
