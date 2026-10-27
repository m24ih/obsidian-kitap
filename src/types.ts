/**
 * obsidian-kitap - Core Data Types & Interfaces
 */

import {
  PropertyMappingData,
  DEFAULT_BOOK_PROPERTY_MAPPINGS,
} from './settings/propertyMapping';

export type { PropertyMappingData };
export { DEFAULT_BOOK_PROPERTY_MAPPINGS };

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
  provider?: string;
  providers?: string[];
  sources?: Record<string, SearchResultItem>;
  isbn?: string;
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
  readingStatus?: string;
  price?: string;
  format?: string;
  genres?: string[];
  originalTitle?: string;
  language?: string;
  provider?: string;
}

export type TemplateMode = 'static' | 'reactive' | 'custom';

/**
 * Eklenti kullanıcı yapılandırma ayarları
 */
export interface KitapPluginSettings {
  targetFolder: string;
  fileNameTemplate: string;
  templateFile: string;
  noteTemplate: string;
  templateMode: TemplateMode;
  useDefaultFrontMatter: boolean;
  propertyMappings: PropertyMappingData[];
  enableTemplaterIntegration: boolean;
  downloadCovers: boolean;
  coverFolder: string;
  readingStatusOptions: string[];
  defaultReadingStatus: string;
  defaultProvider: string;
  enableKitapyurdu: boolean;
  enableDr: boolean;
  enableOpenLibrary: boolean;
  enableHardcover: boolean;
  hardcoverApiKey: string;
  hardcoverApiKeyId: string;
}

/**
 * Varsayılan Statik Markdown ve YAML Frontmatter kitap notu şablonu
 */
export const DEFAULT_STATIC_TEMPLATE = `---
tip: kitap
baslik: "{{title}}"
yazar: "{{author}}"
yayinevi: "{{publisher}}"
cevirmen: "{{translator}}"
isbn: "{{isbn}}"
sayfa: {{pages}}
okunan_sayfa: 0
toplam_sayfa: {{pages}}
yayin_tarihi: "{{publishDate}}"
fiyat: "{{price}}"
format: "{{format}}"
tur:
{{genresList}}
orijinal_baslik: "{{originalTitle}}"
dil: "{{language}}"
puan_kitapyurdu: {{rating}}
kapak: "{{coverUrl}}"
url: "{{url}}"
okuma_durumu: "{{readingStatus}}"
okunma_tarihi:
kisisel_puan:
---

# {{title}}

> **Yazar:** {{author}}  
> **Yayınevi:** {{publisher}}  
> **Çevirmen:** {{translator}}  
> **ISBN:** {{isbn}} | **Sayfa:** {{pages}}  
> **Format:** {{format}} | **Fiyat:** {{price}}  
> **Puan:** {{rating}} / 5  

![Kapak|200]({{coverUrl}})

## 📝 Notlar & Alıntılar

| **Alıntı / Not** | **Sayfa** | **Tarih** |
| :--------------: | :-------: | :-------: |
|                  |           |           |

## ⏳ Okuma Günlüğü

| **Tarih** | **Başlangıç** | **Bitiş** | **Okunan Sayfa** | **Notlar** |
| :-------: | :-----------: | :-------: | :--------------: | :--------: |
|           |               |           |                  |            |

## Açıklama
{{description}}
`;

/**
 * Varsayılan Reaktif (Dataview & Templater uyumlu) kitap notu şablonu
 */
export const DEFAULT_REACTIVE_TEMPLATE = `---
tip: kitap
baslik: "{{title}}"
yazar: "{{author}}"
yayinevi: "{{publisher}}"
cevirmen: "{{translator}}"
isbn: "{{isbn}}"
sayfa: {{pages}}
okunan_sayfa: 0
toplam_sayfa: {{pages}}
yayin_tarihi: "{{publishDate}}"
fiyat: "{{price}}"
format: "{{format}}"
tur:
{{genresList}}
orijinal_baslik: "{{originalTitle}}"
dil: "{{language}}"
puan_kitapyurdu: {{rating}}
kapak: "{{coverUrl}}"
url: "{{url}}"
okuma_durumu: "{{readingStatus}}"
okunma_tarihi:
kisisel_puan:
---

\`\`\`kitap-kart
\`\`\`

# 📖 \`$= dv.current()?.baslik || dv.current()?.title || "{{title}}"\`

\`$= (() => { const k = dv.current()?.kapak || dv.current()?.cover || dv.current()?.coverUrl || dv.current()?.image || '{{coverUrl}}'; const p = (typeof k === 'object' && k?.path) ? k.path : String(k).replace(/^\\[\\[/, '').replace(/\\]\\]$/, ''); return p.startsWith('http') ? '![Kapak|250](' + p + ')' : '![[' + p + '|250]]'; })()\`

> **Yazar:** \`$= dv.current()?.yazar || dv.current()?.author || "{{author}}"\`  
> **Yayınevi:** \`$= dv.current()?.yayinevi || dv.current()?.publisher || "{{publisher}}"\`  
> **Format:** \`$= dv.current()?.format || "{{format}}"\` | **Fiyat:** \`$= dv.current()?.fiyat || dv.current()?.price || "{{price}}"\`  
> **Puan:** \`$= dv.current()?.puan || dv.current()?.puan_dr || dv.current()?.puan_kitapyurdu || dv.current()?.rating || "{{rating}}"\` / 5  

## 📊 Okuma İlerlemesi
\`\`\`dataviewjs
const p = dv.current();
const current = Number(p?.okunan_sayfa ?? p?.current_page ?? 0);
const total = Number(p?.toplam_sayfa ?? p?.sayfa ?? p?.total_pages ?? 1);
const percent = Math.min(100, Math.round((current / total) * 100));
const status = p?.okuma_durumu ?? p?.durum ?? 'Okunacak';

dv.paragraph(\`**Durum:** \\\`\${status}\\\` | **İlerleme:** \\\`\${current} / \${total} sayfa\\\` (%\${percent})\`);
dv.paragraph(\`<progress value="\${percent}" max="100" style="width: 100%; height: 18px;"></progress>\`);
\`\`\`

## 📝 Notlar & Alıntılar

| **Alıntı / Not** | **Sayfa** | **Tarih** |
| :--------------: | :-------: | :-------: |
|                  |           |           |

## ⏳ Okuma Günlüğü

| **Tarih** | **Başlangıç** | **Bitiş** | **Okunan Sayfa** | **Notlar** |
| :-------: | :-----------: | :-------: | :--------------: | :--------: |
|           |               |           |                  |            |

## 📖 Kitap Açıklaması
{{description}}
`;

export const DEFAULT_NOTE_TEMPLATE = DEFAULT_STATIC_TEMPLATE;

/**
 * Eklenti başlangıç varsayılan ayarları
 */
export const DEFAULT_SETTINGS: KitapPluginSettings = {
  targetFolder: 'Kitaplar',
  fileNameTemplate: '{{baslik}} - {{yazar}}',
  templateFile: '',
  noteTemplate: DEFAULT_NOTE_TEMPLATE,
  templateMode: 'static',
  useDefaultFrontMatter: true,
  propertyMappings: DEFAULT_BOOK_PROPERTY_MAPPINGS,
  enableTemplaterIntegration: false,
  downloadCovers: false,
  coverFolder: 'Kitaplar/Kapaklar',
  readingStatusOptions: ['Okunacak', 'Okunuyor', 'Okundu'],
  defaultReadingStatus: 'Okunacak',
  defaultProvider: 'hybrid',
  enableKitapyurdu: true,
  enableDr: true,
  enableOpenLibrary: false,
  enableHardcover: false,
  hardcoverApiKey: '',
  hardcoverApiKeyId: '',
};
