# Obsidian Kitap Eklentisi (`obsidian-kitap`)

**Obsidian Kitap**, Türkçe kitap okurları için geliştirilmiş, tamamen istemci taraflı çalışan bir Obsidian eklentisidir. **Kitapyurdu** üzerinden birincil bibliyografik kitap verilerini (başlık, yazarlar, çevirmenler, yayınevi, ISBN, sayfa sayısı, yayın tarihi, yüksek çözünürlüklü kapak görseli ve arka kapak açıklaması) çeker; **1000Kitap** üzerinden okur puanı, okunma istatistiği ve en popüler okur alıntılarıyla zenginleştirerek özelleştirilebilir şablonlarla Markdown notuna dönüştürür.

---

## ✨ Temel Özellikler

- **Çift Kaynaklı Hibrit Zenginleştirme**:
  - **Kitapyurdu (Birincil Kaynak)**: `schema.org/Book` JSON-LD yapısal verisi ve `.ky-pd-attributes__item` DOM yedekleriyle eksiksiz bibliyografik doğruluk.
  - **1000Kitap (İkincil Kaynak)**: Topluluk puanı (`9.2/10`), okunma sayısı ve sayfa numaralı popüler okur alıntıları.
- **Kesintisiz Hata Toleransı (Graceful Degradation)**: 1000Kitap'a erişilemediğinde, Cloudflare engeline takıldığında veya kitap 1000Kitap'ta bulunamadığında eklenti asla çökmez; Kitapyurdu verileriyle notunuzu sorunsuz şekilde oluşturur.
- **API Anahtarı veya Sunucu Gerektirmez**: Tüm istekler Obsidian'ın yerel `requestUrl` API'si üzerinden doğrudan yapılır.
- **Çoklu Yazar ve Çoklu Çevirmen Desteği**: Ortak yazarlı veya birden fazla çevirmeni olan eserlerde isimleri kırpmadan virgülle birleştirir.
- **Yüksek Çözünürlüklü Kapak Görselleri**: Kitapyurdu CDN görsellerini otomatik olarak yüksek çözünürlüğe (`wi:800`) yükseltir.
- **Özelleştirilebilir Şablon Motoru**: YAML Frontmatter ve gövde metnini 13+ şablon değişkeniyle dilediğiniz gibi biçimlendirin.
- **Güvenli Dosya ve Klasör Yönetimi**: İşletim sistemi ve Obsidian için geçersiz karakterleri (`/\:*?"<>|`) otomatik temizler, iç içe hedef klasörleri (`Kitaplar/2026/Roman` vb.) otomatik oluşturur.

---

## 📦 Kurulum

### Manuel Kurulum
1. Bu depoyu indirin veya klonlayın:
   ```bash
   git clone https://github.com/m24ih/obsidian-kitap.git
   cd obsidian-kitap
   ```
2. Bağımlılıkları yükleyin ve derleyin:
   ```bash
   npm install
   npm run build
   ```
3. Oluşan `main.js`, `manifest.json` ve `styles.css` dosyalarını Obsidian kasanızın (vault) eklenti klasörüne kopyalayın:
   ```text
   <VaultKlasörünüz>/.obsidian/plugins/obsidian-kitap/
   ```
4. Obsidian'da **Ayarlar → Topluluk Eklentileri (Community Plugins)** bölümünden **Kitap** eklentisini etkinleştirin.

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
- **1000Kitap Alıntılarını Ekle**: Popüler 1000Kitap okur alıntılarının nota dahil edilip edilmeyeceğini belirler (Varsayılan: `Açık`).
- **Maksimum Alıntı Sayısı**: 1000Kitap'tan çekilecek maksimum alıntı adedi (`1` ile `20` arası, Varsayılan: `5`).
- **Not Şablonu**: Oluşturulacak kitap notunun Markdown ve YAML Frontmatter içeriği.
- **Varsayılan Şablona Sıfırla**: Şablonu eklentinin orijinal Türkçe varsayılan şablonuna geri döndürür.

---

## 🧩 Kullanılabilir Şablon Değişkenleri

Hem **Not Şablonu** hem de **Dosya Adı Şablonu** içinde aşağıdaki yer tutucuları kullanabilirsiniz. Değer bulunamadığında `"undefined"` veya `"null"` yazılmaz, boş metin olarak bırakılır:

| Değişken | Açıklama | Örnek Değer |
|----------|----------|-------------|
| `{{title}}` | Kitap başlığı | `Dune` |
| `{{author}}` | Yazar(lar) veya derleyen | `Frank Herbert` |
| `{{publisher}}` | Yayınevi | `İTHAKİ YAYINLARI` |
| `{{translator}}` | Çevirmen(ler) (telif eserlerde boş kalır) | `Dost Körpe` |
| `{{isbn}}` | 10 veya 13 haneli ISBN numarası | `9786053754794` |
| `{{pages}}` | Toplam sayfa sayısı | `712` |
| `{{publishDate}}` | Yayın tarihi (`YYYY-MM-DD` formatında) | `2021-09-08` |
| `{{coverUrl}}` | Yüksek çözünürlüklü kapak görseli adresi | `https://img.kitapyurdu.com/.../wi:800/...` |
| `{{rating}}` | Kitapyurdu okur puanı (5 üzerinden) | `5` |
| `{{binkitapRating}}` | 1000Kitap okur puanı (10 üzerinden) | `9.2/10` |
| `{{binkitapReadCount}}` | 1000Kitap okunma istatistiği | `169,8bin` |
| `{{description}}` | Kitap açıklaması / arka kapak bülteni | `Yüzüklerin Efendisi dışında...` |
| `{{quotes}}` | 1000Kitap alıntıları (Markdown `>` blokları) | `> “Korku katildir.”` |
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
