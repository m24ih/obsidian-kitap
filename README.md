# Obsidian Kitap (`obsidian-kitap`)

[![Obsidian Downloads](https://img.shields.io/badge/Obsidian-Community%20Plugins-7b3fe4?logo=obsidian&logoColor=white)](https://community.obsidian.md/plugins/kitap)
[![Release](https://img.shields.io/github/v/release/m24ih/obsidian-kitap?label=Release&color=blue)](https://github.com/m24ih/obsidian-kitap/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An Obsidian plugin to search Turkish books and metadata from **Kitapyurdu** and **D&R**, deduplicating and merging records with an interactive hybrid comparison modal, customizable templates, Dataview reactive progress tracking, and Templater integration.

*(Aşağıda Türkçe detaylı rehber ve kullanım dokümantasyonu yer almaktadır.)*

---

## English Overview

### ✨ Features
- **Multi-Provider Architecture**: Search Turkish book metadata seamlessly from **Kitapyurdu** and **D&R**.
- **Smart Hybrid Mode (Default)**:
  - Queries Kitapyurdu and D&R concurrently in parallel.
  - Intelligent cross-provider deduplication using 13-digit ISBN and robust fuzzy title/author normalization.
  - Dual-provider badges in search results (`Kitapyurdu` orange `#ff9436` and `D&R` blue `#4da3ff`).
- **Interactive Metadata Comparison Modal (MediaDB-inspired)**:
  - When selecting a merged book from hybrid search, a clean side-by-side comparison modal opens.
  - Field-by-field interactive radio selection: Choose title from D&R and description from Kitapyurdu, or vice versa.
  - Smart automatic defaults favoring the richer metadata provider per field.
  - Collapsible 5-line synopsis preview with a clean *Show more* toggle.
- **Rich Bibliographic Metadata**:
  - Title, author(s), translator(s), publisher(s), 13-digit ISBN, page count, and publication date.
  - List price (`{{price}}`), binding/format (`{{format}}`), categories/genres (`{{genres}}`, `{{genresList}}`), original title (`{{originalTitle}}`), and language (`{{language}}`).
  - Reader ratings (`{{rating}}`), rating count (`{{ratingCount}}`), synopsis (`{{description}}`), and cover image.
  - Active provider identifier (`{{provider}}` / `{{saglayici}}`).
- **Flexible Template Modes**:
  - **Static Template**: Clean YAML frontmatter and standard Markdown layout.
  - **Reactive Template (DataviewJS)**: Built-in visual reading progress bar, quotes table, and reading log.
  - **Custom Template**: Select any `.md` template from your vault or edit custom template markdown directly in settings.
- **Local Cover Image Download**:
  - Automatically downloads high-resolution cover images locally to your vault (e.g. `Kitaplar/Kapaklar/`).
  - Embedded as native Obsidian wikilinks (`![[cover.jpg]]`).
- **Templater Integration**:
  - Automatically evaluates Templater syntax upon note creation and exposes the raw `book` object (`<%* const b = book; %>`).
- **Customizable Property Mappings & Reading Statuses**:
  - Map bibliographic fields to your preferred Obsidian Properties (YAML frontmatter).
  - Configure custom reading statuses (`To Read`, `Reading`, `Finished`, etc.) and set default starting values.
- **Client-Side & Offline-Friendly**:
  - All network communication is executed locally using Obsidian's native `requestUrl` API. No external servers or API keys required.

### 📦 Installation

#### Method 1: Community Plugins (Recommended)
1. In Obsidian, open **Settings → Community Plugins**.
2. Click **Browse** and search for **Kitap** (or visit [Kitap on Obsidian Community Plugins](https://community.obsidian.md/plugins/kitap)).
3. Click **Install**, then **Enable**.

#### Method 2: Beta Versions via BRAT
For early access to pre-release features and automated beta builds:
1. Install and enable the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin in Obsidian.
2. In BRAT settings, click **Add Beta plugin**.
3. Enter `m24ih/obsidian-kitap`.
4. BRAT will automatically fetch the latest beta release and keep it updated.

#### Method 3: Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [Release](https://github.com/m24ih/obsidian-kitap/releases).
2. Place them into your vault:
   ```text
   <Vault>/.obsidian/plugins/obsidian-kitap/
   ```
3. Reload Obsidian and enable **Kitap** under Community Plugins.

### 🔒 Privacy & Network Disclosures
- **External Services**:
  - **Kitapyurdu**: `https://www.kitapyurdu.com` (search and metadata) and `https://img.kitapyurdu.com` (covers).
  - **D&R**: `https://www.dr.com.tr` (catalog and details API) and `https://i.dr.com.tr` (covers).
- **Client-Side Only**: Requests are sent strictly from your device using Obsidian's `requestUrl` API. No telemetry, user data, or search history is ever collected, proxied, or stored on third-party servers.

---

# Türkçe Dokümantasyon

**Obsidian Kitap**, Türkçe kitap okurları ve araştırmacılar için tasarlanmış, tamamen istemci taraflı çalışan modern bir Obsidian eklentisidir. **Kitapyurdu** ve **D&R** üzerinden bibliyografik kitap verilerini çeker, çift kaynaklı **Hibrit Mod** ile akıllıca tekilleştirir ve MediaDB tarzı interaktif karşılaştırma arayüzü ile dilediğiniz alanları birleştirerek zengin Markdown notlarına dönüştürür.

---

## ✨ Temel Özellikler

### 1. Çoklu Sağlayıcı & Hibrit Arama (Varsayılan)
- **Kitapyurdu & D&R**: İki büyük Türkçe kitap platformu doğrudan desteklenir.
- **Hibrit Mod**: Arama yaptığınızda her iki servis arka planda paralel olarak taranır.
- **Akıllı Tekilleştirme**: 13 haneli ISBN ve gelişmiş başlık/yazar normalizasyonu sayesinde aynı kitap tek bir kartta birleştirilir ve çift sağlayıcı rozeti (`Kitapyurdu` turuncu, `D&R` mavi) ile gösterilir.
- **Dilediğiniz Sağlayıcıyı Seçebilme**: Dilerseniz ayarlardan yalnızca Kitapyurdu veya yalnızca D&R'ı varsayılan yapabilirsiniz.

### 2. İnteraktif Karşılaştırma & Birleştirme Modalı (MediaDB Tarzı)
- Hibrit arama sonucunda iki kaynaktan da bulunan bir kitabı seçtiğinizde interaktif bir karşılaştırma tablosu açılır.
- **Satır Bazlı Seçim**: Başlığı D&R'dan, arka kapak bültenini Kitapyurdu'ndan tek tıkla seçebilirsiniz.
- **Akıllı Varsayılanlar**: Hangi kaynakta veri daha zengin veya eksiksizse sistem o alanı sizin için otomatik olarak önceden seçer.
- **Açıklama Önizlemesi**: Uzun arka kapak yazıları modalı taşırmaz; ilk 5 satır gösterilir ve istenirse *Daha fazla göster* butonuyla genişletilebilir.
- **Tümünü Seç Kısayolları**: Tek tıkla tüm alanları Kitapyurdu veya D&R lehine çevirebilirsiniz.

### 3. Zengin Bibliyografik Metaveri Desteği
- Başlık, yazar(lar), çevirmen(ler) ve yayınevi
- 13 haneli ISBN, toplam sayfa sayısı ve yayın tarihi
- Etiket/liste fiyatı (`{{price}}`), baskı formatı/cilt tipi (`{{format}}`)
- Kategoriler/türler (`{{genres}}`, `{{genresList}}`), orijinal başlık (`{{originalTitle}}`) ve basım dili (`{{language}}`)
- Okur puanı (`{{rating}}`), değerlendirme sayısı (`{{ratingCount}}`) ve arka kapak açıklaması (`{{description}}`)
- Sağlayıcı kimliği (`{{provider}}` / `{{saglayici}}`)

### 4. Esnek Şablon Modları
- **Statik Şablon**: Ek eklenti gerektirmeyen, temiz YAML Frontmatter ve sade Markdown düzeni.
- **Reaktif Şablon (Dataview Destekli)**: Yerleşik DataviewJS görsel okuma ilerleme çubuğu (`progress bar`), alıntılar tablosu ve okuma günlüğü.
- **Özel Şablon**: Kasanızdaki herhangi bir `.md` şablon dosyasını seçebilme veya ayarlar ekranındaki metin kutusundan şablonu özelleştirebilme.

### 5. Yerel Kapak Görseli İndirme & Wikilink Önbelleği
- Kapak görsellerini vault içerisindeki klasöre (örn. `Kitaplar/Kapaklar`) yerel olarak indirir.
- Not içerisine otomatik olarak Obsidian wikilink (`![[kapak.jpg]]`) formatında yerleştirir.
- Aynı kapak tekrar indirilmez, diskteki yerel önbellekten kullanılır.

### 6. Templater Entegrasyonu
- Not oluşturulduğunda Templater sözdizimini otomatik tetikler.
- Şablon içinde ham `book` nesnesine (`<%* const b = book; %>`) tam erişim sağlar.

### 7. Özelleştirilebilir YAML Eşlemeleri & Okuma Durumları
- Bibliyografik verilerin hangi Obsidian Properties (YAML frontmatter) alanlarına yazılacağını serbestçe eşleyin.
- `Okunacak`, `Okunuyor`, `Okundu` (veya `TBR`, `Reading`, `Completed`) gibi okuma durumlarını yapılandırın.

---

## 📦 Kurulum

### Yöntem 1: Obsidian Topluluk Eklentileri (Önerilen)
Eklenti resmi Obsidian Community Plugins dizininde yer almaktadır:
1. Obsidian'da **Ayarlar → Topluluk Eklentileri (Community Plugins)** bölümünü açın.
2. **Eklentilere Göz At (Browse)** butonuna tıklayın ve **Kitap** araması yapın (veya [Kitap Topluluk Sayfasını](https://community.obsidian.md/plugins/kitap) ziyaret edin).
3. **Kur (Install)** ve ardından **Etkinleştir (Enable)** butonlarına tıklayın.

### Yöntem 2: BRAT ile Beta Sürümleri Kurma
Yeni özellikleri ve geliştirme sürümlerini henüz resmi mağazaya girmeden anında test etmek için:
1. Obsidian'da [BRAT](https://github.com/TfTHacker/obsidian42-brat) eklentisini kurun ve etkinleştirin.
2. BRAT ayarlarına girip **Add Beta plugin** seçeneğine tıklayın.
3. Depo adresi olarak `m24ih/obsidian-kitap` girin.
4. BRAT her yeni beta sürümünü otomatik olarak takip edip güncelleyecektir.

### Yöntem 3: Manuel Kurulum
1. [Releases](https://github.com/m24ih/obsidian-kitap/releases) sayfasından en son sürümün `main.js`, `manifest.json` ve `styles.css` dosyalarını indirin.
2. Obsidian kasanızın eklenti dizinine kopyalayın:
   ```text
   <VaultKlasörünüz>/.obsidian/plugins/obsidian-kitap/
   ```
3. Obsidian'ı yeniden başlatın veya eklenti listesini yenileyip **Kitap** eklentisini etkinleştirin.

---

## 🚀 Kullanım ve Komutlar

Sol şeritteki (Ribbon) **Kitap Ara ve Ekle** (`book-open`) ikonuna tıklayarak veya Komut Paletini (`Ctrl/Cmd + P`) açarak eklentiyi kullanabilirsiniz:

| Komut Adı | Açıklama |
|-----------|----------|
| **Kitap Ara ve Ekle** | Kitap adı, yazar veya ISBN (10 veya 13 haneli, tireli/tiresiz) ile arama yapar; seçilen kitap için yeni bir Markdown notu oluşturur. |
| **Aktif Nota Kitap Bilgilerini Ekle** | Açık olan aktif nota seçilen kitabın şablon çıktısını (imleç konumuna veya not sonuna) ekler. |

---

## 🧩 Kullanılabilir Şablon Değişkenleri

Hem **Not Şablonu** hem de **Dosya Adı Şablonu** içinde aşağıdaki değişkenleri kullanabilirsiniz. Değer bulunamadığında boş bırakılır (`"undefined"` veya `"null"` basılmaz):

| Değişken | Açıklama | Örnek Değer |
|----------|----------|-------------|
| `{{title}}` | Kitap başlığı | `Dune` |
| `{{author}}` | Yazar(lar) | `Frank Herbert` |
| `{{publisher}}` | Yayınevi | `İTHAKİ YAYINLARI` |
| `{{translator}}` | Çevirmen(ler) | `Dost Körpe` |
| `{{isbn}}` | 13 haneli ISBN | `9786053754794` |
| `{{pages}}` | Toplam sayfa sayısı | `712` |
| `{{publishDate}}` | Yayın tarihi (`YYYY-MM-DD`) | `2021-09-08` |
| `{{price}}` | Liste / satış fiyatı | `477.95 TL` |
| `{{format}}` | Baskı / cilt tipi | `Karton Kapak` |
| `{{genres}}` | Kategoriler / türler (virgülle ayrılmış) | `Edebiyat, Bilimkurgu` |
| `{{genresList}}` | YAML listesi formatında türler | `  - "Bilimkurgu"` |
| `{{originalTitle}}`| Orijinal kitap başlığı | `Dune` |
| `{{language}}` | Basım dili | `TÜRKÇE` |
| `{{coverUrl}}` | Kapak adresi (yerel indirmede wikilink) | `https://img.kitapyurdu.com/...` |
| `{{coverPath}}` | İndirilen kapağın vault içi dosya yolu | `Kitaplar/Kapaklar/Dune - Frank Herbert.jpg` |
| `{{rating}}` | Okur değerlendirme puanı (0-5) | `4.8` |
| `{{ratingCount}}`| Değerlendirme / oy sayısı | `142` |
| `{{readingStatus}}`| Kitabın okuma durumu | `Okunacak` |
| `{{description}}`| Arka kapak bülteni / açıklama | `Frank Herbert'ın muazzam bilimkurgu evreni...` |
| `{{provider}}` / `{{saglayici}}`| Verinin alındığı sağlayıcı kimliği | `hybrid`, `kitapyurdu`, `dr` |
| `{{url}}` | Kitabın ürün sayfası bağlantısı | `https://www.kitapyurdu.com/kitap/dune/375312.html` |

---

## 🔒 Gizlilik ve Ağ Erişimi (Privacy & Disclosures)

- **Harici Servis Kullanımı**: Eklenti yalnızca kullanıcı aktif arama yaptığında veya kitap eklediğinde aşağıdaki servislere bağlanır:
  - **Kitapyurdu**: `https://www.kitapyurdu.com` ve kapak görsel sunucusu `https://img.kitapyurdu.com`
  - **D&R**: `https://www.dr.com.tr` ve kapak görsel sunucusu `https://i.dr.com.tr`
- **İstemci Taraflı & Doğrudan**: İstekler Obsidian'ın yerel `requestUrl` mekanizması ile doğrudan kullanıcının cihazından yürütülür; harici sunucu veya aracı proxy bulunmaz.
- **Sıfır Telemetri**: Hiçbir kullanıcı verisi, okuma alışkanlığı veya arama geçmişi kaydedilmez ya da üçüncü şahıslara aktarılmaz.

---

## 🛠️ Geliştirme ve Test

```bash
# Bağımlılıkları yükle
npm install

# TypeScript tip kontrolü
npm run typecheck

# Obsidian ESLint kontrolü
npm run lint

# Üretim derlemesi
npm run build

# Kapsamlı test paketini çalıştır (304 test)
npm test
```

---

## 📄 Lisans

MIT © Melih
