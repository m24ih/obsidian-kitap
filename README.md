# Obsidian Kitap (`obsidian-kitap`)

An Obsidian plugin to search Turkish books and metadata from [Kitapyurdu](https://www.kitapyurdu.com) and create structured reading notes with rich bibliographic data, customizable templates, Dataview reactive progress tracking, and Templater integration.

*(Aşağıda Türkçe açıklama ve detaylı rehber yer almaktadır.)*

---

## English Overview

### ✨ Features
- **Direct Kitapyurdu Integration**: Accurate bibliographic metadata using `schema.org/Book` JSON-LD structured data and page DOM parsers.
- **Rich Book Metadata**: Title, author(s), translator(s), publisher, 13-digit ISBN, page count, publish date, list price (`{{price}}`), format/binding (`{{format}}`), categories/genres (`{{genres}}`), original title (`{{originalTitle}}`), language (`{{language}}`), reader rating (`{{rating}}`), rating count (`{{ratingCount}}`), synopsis (`{{description}}`), and cover image.
- **Flexible Template Modes**:
  - **Static Template**: Clean YAML frontmatter and standard Markdown layout.
  - **Reactive Template**: DataviewJS reading progress bar, reading logs, and dynamic inline fields.
  - **Custom Template**: Select any `.md` template from your vault or edit custom template in settings.
- **Local Cover Image Download**: Automatically downloads cover images locally to your vault (e.g. `Kitaplar/Kapaklar/`) and embeds them as Obsidian wikilinks (`![[cover.jpg]]`).
- **Templater Integration**: Automatically triggers Templater syntax upon creation and exposes the raw `book` object (`<%* const b = book; %>`).
- **Customizable Property Mappings & Reading Statuses**: Configure Obsidian Properties and reading statuses (`TBR`, `Reading`, `Read`, etc.).
- **Client-Side & Offline Friendly**: Uses Obsidian's native `requestUrl` without external servers or API keys.

### 📦 Installation
- **Community Plugins**: Search for **Kitap** in Obsidian's Community Plugins list and click Install.
- **BRAT**: Add `m24ih/obsidian-kitap` in the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin settings.
- **Manual**: Download `main.js`, `manifest.json`, and `styles.css` from the latest [Release](https://github.com/m24ih/obsidian-kitap/releases) and place them in `<Vault>/.obsidian/plugins/obsidian-kitap/`.

---

# Türkçe Dokümantasyon

**Obsidian Kitap**, Türkçe kitap okurları için geliştirilmiş, tamamen istemci taraflı çalışan modern bir Obsidian eklentisidir. **Kitapyurdu** üzerinden kapsamlı bibliyografik kitap verilerini (başlık, yazarlar, çevirmenler, yayınevi, ISBN, sayfa sayısı, yayın tarihi, fiyat, cilt/baskı formatı, türler, orijinal başlık, dil, puan ve arka kapak açıklaması) çeker; özelleştirilebilir şablonlar, Dataview reaktif görünümleri ve Templater desteğiyle kişisel kütüphane notlarına dönüştürür.

---

## ✨ Temel Özellikler

- **Doğrudan Kitapyurdu Entegrasyonu**: `schema.org/Book` JSON-LD yapısal verisi ve sayfa DOM ayrıştırıcıları ile eksiksiz bibliyografik doğruluk.
- **Zengin Bibliyografik Metaveri Desteği**:
  - Başlık, yazar(lar), çevirmen(ler) ve yayınevi
  - 13 haneli ISBN, sayfa sayısı ve yayın tarihi
  - Etiket/liste fiyatı (`{{price}}`) ve baskı formatı/cilt tipi (`{{format}}`)
  - Kategori/türler (`{{genres}}`, `{{genresList}}`), orijinal başlık (`{{originalTitle}}`) ve basım dili (`{{language}}`)
  - Kitapyurdu okur puanı (`{{rating}}`), değerlendirme sayısı (`{{ratingCount}}`) ve arka kapak tanıtım bülteni (`{{description}}`)
- **Esnek Şablon Modları**:
  - **Statik Şablon**: Ek eklenti gerektirmeyen, temiz YAML Frontmatter ve sade Markdown düzeni.
  - **Reaktif Şablon (Dataview Destekli)**: Yerleşik DataviewJS okuma ilerleme çubuğu (`progress bar`), okuma günlüğü tablosu ve dinamik inline alanlar (`$= dv.current()...`).
  - **Özel Şablon**: Kasanızdaki (vault) herhangi bir `.md` şablon dosyasını seçebilme veya ayarlar ekranından doğrudan düzenleme olanağı.
- **Kapak Görsellerini Yerel İndirme**:
  - Kitap kapaklarını vault içerisindeki istediğiniz klasöre (örn. `Kitaplar/Kapaklar`) yerel olarak indirir.
  - İndirilen görseller otomatik önbelleğe alınır ve Markdown içerisinde `![[kapak.jpg]]` Obsidian wikilink formatına dönüştürülür.
- **Templater Entegrasyonu**:
  - Not oluşturulduğunda Templater fonksiyonlarının otomatik çalıştırılması.
  - Şablonlar içerisinde `book` objesine (`<%* const b = book; %>`) doğrudan erişim.
- **Özelleştirilebilir YAML Özellik Eşlemeleri (Property Mapping)**:
  - Metaverilerin hangi Obsidian Properties (YAML frontmatter) alanlarına yazılacağını özelleştirebilme.
  - Alan adlarını değiştirme, devre dışı bırakma veya varsayılan değerler atama imkanı.
- **Özelleştirilebilir Okuma Durumları (Reading Status)**:
  - `Okunacak`, `Okunuyor`, `Okundu` (veya `TBR`, `Reading`, `Read`) gibi durumları serbestçe tanımlama ve varsayılan başlangıç durumu seçme.
- **API Anahtarı veya Sunucu Gerektirmez**:
  - Tüm istekler doğrudan Obsidian'ın yerel `requestUrl` API'si üzerinden istemci taraflı yürütülür.
- **Güvenli Dosya & Klasör Yönetimi**:
  - İşletim sistemi ve Obsidian için geçersiz karakterleri (`/\:*?"<>|`) akıllıca temizler, iç içe hedef klasörleri otomatik oluşturur.

---

## 📦 Kurulum

### Yöntem 1: BRAT Eklentisi ile (Önerilen)
1. Obsidian'da [BRAT](https://github.com/TfTHacker/obsidian42-brat) eklentisini kurun ve etkinleştirin.
2. BRAT ayarlarına gidin ve **Add Beta plugin** seçeneğine tıklayın.
3. Depo adresi olarak `m24ih/obsidian-kitap` girin.
4. Eklentiyi etkinleştirin.

### Yöntem 2: Manuel Kurulum
1. [Releases](https://github.com/m24ih/obsidian-kitap/releases) sayfasından en güncel sürümün `main.js`, `manifest.json` ve `styles.css` dosyalarını indirin.
2. Obsidian kasanızın eklenti klasöründe `obsidian-kitap` adında bir dizin oluşturun:
   ```text
   <VaultKlasörünüz>/.obsidian/plugins/obsidian-kitap/
   ```
3. İndirdiğiniz dosyaları bu klasöre yapıştırın.
4. Obsidian'da **Ayarlar → Topluluk Eklentileri (Community Plugins)** bölümünden **Kitap** eklentisini etkinleştirin.

### Yöntem 3: Kaynak Koddan Derleme
```bash
git clone https://github.com/m24ih/obsidian-kitap.git
cd obsidian-kitap
npm install
npm run build
```
Oluşan `main.js`, `manifest.json` ve `styles.css` dosyalarını vault'unuzdaki eklenti klasörüne kopyalayın.

---

## 🚀 Kullanım ve Komutlar

Sol şeritteki (Ribbon) **Kitap Ara ve Ekle** (`book-open`) ikonuna tıklayarak veya Komut Paletini (`Ctrl/Cmd + P`) açarak aşağıdaki komutları çalıştırabilirsiniz:

| Komut Adı | Açıklama |
|-----------|----------|
| **Kitap Ara ve Ekle** | Kitap adı, yazar veya ISBN (10/13 haneli, tireli veya tiresiz) ile arama yapar; seçilen kitap için hedef klasörde yeni bir Markdown notu oluşturur ve açar. |
| **Aktif Nota Kitap Bilgilerini Ekle** | Açık olan aktif Markdown notuna seçilen kitabın şablon çıktısını (imleç konumuna veya not sonuna) ekler. |

---

## ⚙️ Ayarlar

**Ayarlar → Kitap** sekmesinden aşağıdaki yapılandırmaları değiştirebilirsiniz:

- **Hedef Klasör**: Yeni kitap notlarının kaydedileceği klasör yolu (Varsayılan: `Kitaplar`). Klasör mevcut değilse otomatik olarak oluşturulur.
- **Dosya Adı Şablonu**: Oluşturulacak dosyanın adlandırma formatı (Varsayılan: `{{title}} - {{author}}`).
- **Kapak Görsellerini İndir**: Kapak görselinin yerel olarak vault'a indirilip indirilmeyeceğini belirler.
- **Kapak Klasörü**: İndirilen kapak görsellerinin saklanacağı klasör (Varsayılan: `Kitaplar/Kapaklar`).
- **Okuma Durumu Ayarları**: Kullanılabilecek okuma durumu etiketleri ve yeni oluşturulan kitaplara atanacak varsayılan durum.
- **Şablon Modu**:
  - `Statik Şablon`: Sade ve standart Markdown çıktısı.
  - `Reaktif Şablon`: DataviewJS okuma çubuğu, alıntılar tablosu ve okuma günlüğü içeren dinamik şablon.
  - `Özel Şablon`: Vault içindeki bir `.md` şablon dosyası veya doğrudan ayarlar içerisindeki metin kutusu.
- **Templater Entegrasyonu**: Templater eklentisi ile birlikte çalışma ve `book` objesini açığa çıkarma desteği.
- **Varsayılan Frontmatter Oluştur & Özellik Eşlemeleri**: Obsidian Properties alanlarını ve veri eşlemelerini dinamik olarak düzenleyebilme.

---

## 🧩 Kullanılabilir Şablon Değişkenleri

Hem **Not Şablonu** hem de **Dosya Adı Şablonu** içinde aşağıdaki yer tutucuları kullanabilirsiniz. Değer bulunamadığında `"undefined"` veya `"null"` yazılmaz, temiz bir boş metin olarak bırakılır:

| Değişken | Açıklama | Örnek Değer |
|----------|----------|-------------|
| `{{title}}` | Kitap başlığı | `Dune` |
| `{{author}}` | Yazar(lar) | `Frank Herbert` |
| `{{publisher}}` | Yayınevi | `İTHAKİ YAYINLARI` |
| `{{translator}}` | Çevirmen(ler) | `Dost Körpe` |
| `{{isbn}}` | 13 haneli ISBN numarası | `9786053754794` |
| `{{pages}}` | Toplam sayfa sayısı | `712` |
| `{{publishDate}}` | Yayın tarihi (`YYYY-MM-DD` formatında) | `2021-09-08` |
| `{{price}}` | Liste / satış fiyatı | `477.95 TL` |
| `{{format}}` | Baskı / cilt tipi | `Karton Kapak` |
| `{{genres}}` | Kategoriler / Türler (virgülle ayrılmış) | `Edebiyat, Bilimkurgu` |
| `{{genresList}}` | YAML dizi formatında türler | `  - "Bilimkurgu"` |
| `{{originalTitle}}`| Kitabın orijinal başlığı | `Dune` |
| `{{language}}` | Basım dili | `TÜRKÇE` |
| `{{coverUrl}}` | Kapak görseli adresi (yerel indirmede wikilink) | `https://img.kitapyurdu.com/.../wi:800/...` |
| `{{coverPath}}` | İndirilen kapağın vault içi göreceli dosya yolu | `Kitaplar/Kapaklar/Dune - Frank Herbert.jpg` |
| `{{rating}}` | Kitapyurdu okur puanı (0-5) | `4.8` |
| `{{ratingCount}}`| Kitapyurdu değerlendirme / oy sayısı | `142` |
| `{{readingStatus}}`| Kitabın okuma durumu | `Okunacak` |
| `{{description}}`| Kitap açıklaması / arka kapak bülteni | `Frank Herbert'ın muazzam bilimkurgu evreni...` |
| `{{url}}` | Kitapyurdu ürün sayfası bağlantısı | `https://www.kitapyurdu.com/kitap/dune/375312.html` |

---

## 🛠️ Geliştirme ve Test

```bash
# Tip kontrolü (TypeScript)
npm run typecheck

# Üretim derlemesi (main.js)
npm run build

# Tüm birim, entegrasyon, stres ve E2E testlerini çalıştır
npm test
```

---

## 📄 Lisans

MIT © Melih
