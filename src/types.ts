/**
 * obsidian-kitap - Core Data Types & Interfaces
 */

/**
 * 1000Kitap okur alıntısı veri yapısı
 */
export interface BookQuote {
  text: string;
  author?: string;
  page?: string;
  likes?: number;
}

/**
 * Kitap arama sonucu öğesi (Kitapyurdu ve Aggregator için ortak)
 */
export interface SearchResultItem {
  id: string;
  title: string;
  author: string;
  publisher: string;
  url: string;
  coverUrl: string;
  rating?: number;
}

export type SearchResult = SearchResultItem;

/**
 * Kitabın tüm bibliyografik ve zenginleştirilmiş metaveri modeli
 */
export interface BookMetadata {
  id: string;
  url: string;
  title: string;
  author: string;
  publisher: string;
  translator?: string;
  isbn: string;
  pages?: number;
  publishDate?: string;
  coverUrl?: string;
  description?: string;
  rating?: number; // Kitapyurdu 0-5 puanı
  ratingCount?: number;

  // 1000Kitap zenginleştirmeleri
  binkitapRating?: string; // Örnek: "9.2/10" veya "9.2"
  binkitapReadCount?: string; // Örnek: "335 bin"
  binkitapUrl?: string;
  quotes?: BookQuote[];
}

/**
 * Eklenti kullanıcı yapılandırma ayarları
 */
export interface KitapPluginSettings {
  targetFolder: string;
  fileNameTemplate: string;
  noteTemplate: string;
  includeQuotes: boolean;
  maxQuotes: number;
}

/**
 * Varsayılan Markdown ve YAML Frontmatter kitap notu şablonu
 */
export const DEFAULT_NOTE_TEMPLATE = `---
baslik: "{{title}}"
yazar: "{{author}}"
yayinevi: "{{publisher}}"
cevirmen: "{{translator}}"
isbn: "{{isbn}}"
sayfa: {{pages}}
yayin_tarihi: "{{publishDate}}"
puan_kitapyurdu: {{rating}}
puan_1000kitap: "{{binkitapRating}}"
kapak: "{{coverUrl}}"
url: "{{url}}"
durum: Okunacak
okunma_tarihi:
kisisel_puan:
---

# {{title}}

> **Yazar:** {{author}}  
> **Yayınevi:** {{publisher}}  
> **Çevirmen:** {{translator}}  
> **ISBN:** {{isbn}} | **Sayfa:** {{pages}}  
> **Kitapyurdu Puanı:** {{rating}} / 5 | **1000Kitap Puanı:** {{binkitapRating}}  

![Kapak|200]({{coverUrl}})

## Açıklama
{{description}}

## 1000Kitap Alıntıları
{{quotes}}

## Notlarım
- 
`;

/**
 * Eklenti başlangıç varsayılan ayarları
 */
export const DEFAULT_SETTINGS: KitapPluginSettings = {
  targetFolder: 'Kitaplar',
  fileNameTemplate: '{{title}} - {{author}}',
  noteTemplate: DEFAULT_NOTE_TEMPLATE,
  includeQuotes: true,
  maxQuotes: 5,
};
