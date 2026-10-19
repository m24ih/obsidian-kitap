/**
 * obsidian-kitap - Core Data Types & Interfaces
 */

/**
 * Kitap arama sonucu öğesi (Kitapyurdu)
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
 * Kitabın tüm bibliyografik metaveri modeli
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
}

/**
 * Eklenti kullanıcı yapılandırma ayarları
 */
export interface KitapPluginSettings {
  targetFolder: string;
  fileNameTemplate: string;
  noteTemplate: string;
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
> **Puan:** {{rating}} / 5  

![Kapak|200]({{coverUrl}})

## Açıklama
{{description}}

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
};
