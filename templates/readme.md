# obsidian-kitap Şablonları

Bu dizin, `obsidian-kitap` eklentisi için hazırlanmış hazır şablonları içerir.

## 1. Statik Şablon (`staticTemplate.md`)
- **Gereksinim:** Ek bir eklenti (Dataview veya Templater) gerektirmez.
- **Özellikler:** Kitabın tüm metaverilerini temiz, okunabilir ve kalıcı standart Markdown olarak işler. Her Obsidian kurulumunda sorunsuz çalışır.

## 2. Reaktif Şablon (`reactiveTemplate.md`)
- **Gereksinim:** [Obsidian Dataview](https://github.com/blacksmithgu/obsidian-dataview) (isteğe bağlı [Templater](https://github.com/SilentVoid13/Templater)).
- **Özellikler:**
  - Frontmatter'dan canlı beslenen Dataview inline sorguları (`$= dv.current()...`).
  - Dinamik **Okuma İlerlemesi** (sayfa hesabı ve HTML5 `<progress>` çubuğu).
  - Alıntılar ve Notlar tablosu.
  - Okuma oturumlarını takip edebileceğiniz **Okuma Günlüğü** log tablosu.

## Nasıl Kullanılır?
1. **Eklenti Ayarlarından:** **Not Şablonu ve Biçimlendirme** bölümünden **Şablon Modu**nu `Statik` veya `Reaktif` olarak seçebilirsiniz.
2. **Özelleştirme:** İster ayarlar üzerinden tek tıkla şablonu kopyalayıp düzenleyebilir, isterseniz bu dosyalardan birini kasanız içine (`Vault/Sablonlar/...`) kaydedip **Özel Şablon** olarak seçebilirsiniz.
