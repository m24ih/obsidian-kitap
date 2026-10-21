import { BookMetadata } from '../types';
import { sanitizeFileName } from '../utils/sanitizer';
import { PropertyMappingData, PropertyMappingOption } from '../settings/propertyMapping';
import { adaptTemplateToPropertyMappings } from './templateAdapter';

export { sanitizeFileName, adaptTemplateToPropertyMappings };

/**
 * Kitap şablonundaki tüm `{{degisken}}` yer tutucularını BookMetadata değerleriyle doldurur.
 * Eksik veya undefined olan opsiyonel alanlar "undefined" veya "null" yerine boş dize ("") olarak işlenir.
 * Eğer özellik eşlemeleri (mappings) sağlanırsa, şablon gövdesi bu eşlemelere göre otomatik uyarlanır.
 */
export function renderBookTemplate(
  template: string,
  data: BookMetadata,
  mappings?: PropertyMappingData[]
): string {
  if (!template) return '';

  // Şablon gövdesini kullanıcının eşlemelerine göre adapte et
  let processedTemplate = mappings && mappings.length > 0
    ? adaptTemplateToPropertyMappings(template, mappings)
    : template;

  const strValue = (val: unknown): string => {
    if (val === undefined || val === null) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    return '';
  };

  const rawCover = strValue(data.coverUrl);
  const isWikilink = rawCover.startsWith('[[') && rawCover.endsWith(']]');
  const innerCoverPath = isWikilink ? rawCover.slice(2, -2).trim() : rawCover;

  if (isWikilink && innerCoverPath) {
    // 1. ![[ {{coverUrl}} ]] veya ![[ {{coverUrl}} | 200 ]] wikilink embed kalıpları
    processedTemplate = processedTemplate.replace(
      /!\[\[\s*\{\{\s*coverUrl\s*\}\}\s*(?:\|([^\]]+))?\]\]/g,
      (_match: string, extra?: string) => (extra ? `![[${innerCoverPath}|${extra.trim()}]]` : `![[${innerCoverPath}]]`)
    );

    // 2. ![Kapak|200]({{coverUrl}}) veya ![alt]({{coverUrl}}) standart markdown imaj kalıpları
    // Yerel wikilink durumunda Obsidian'ın doğal ![[resim.jpg|200]] formatına dönüştürülür
    processedTemplate = processedTemplate.replace(
      /!\[(.*?)\]\(\{\{\s*coverUrl\s*\}\}\)/g,
      (_match: string, alt: string) => {
        const trimmedAlt = typeof alt === 'string' ? alt.trim() : '';
        const sizeMatch = trimmedAlt.match(/(?:^|\|)(\d+(?:x\d+)?)$/);
        if (sizeMatch && sizeMatch[1]) {
          return `![[${innerCoverPath}|${sizeMatch[1]}]]`;
        }
        return `![[${innerCoverPath}]]`;
      }
    );
  }

  const replacements: Record<string, string> = {
    // Türkçe temel alanlar
    tip: 'kitap',
    baslik: strValue(data.title),
    yazar: strValue(data.author),
    yayinevi: strValue(data.publisher),
    cevirmen: strValue(data.translator),
    isbn: strValue(data.isbn),
    sayfa: data.pages !== undefined && data.pages !== null ? String(data.pages) : '',
    okunan_sayfa: '0',
    toplam_sayfa: data.pages !== undefined && data.pages !== null ? String(data.pages) : '',
    yayin_tarihi: strValue(data.publishDate),
    yayinTarihi: strValue(data.publishDate),
    kapak: rawCover,
    puan: data.rating !== undefined && data.rating !== null ? String(data.rating) : '',
    puan_kitapyurdu: data.rating !== undefined && data.rating !== null ? String(data.rating) : '',

    // İngilizce uyumluluk takma adları
    title: strValue(data.title),
    author: strValue(data.author),
    publisher: strValue(data.publisher),
    translator: strValue(data.translator),
    pages: data.pages !== undefined && data.pages !== null ? String(data.pages) : '',
    current_page: '0',
    total_pages: data.pages !== undefined && data.pages !== null ? String(data.pages) : '',
    publishDate: strValue(data.publishDate),
    coverUrl: rawCover,
    coverPath: innerCoverPath,
    rating: data.rating !== undefined && data.rating !== null ? String(data.rating) : '',
    ratingCount:
      data.ratingCount !== undefined && data.ratingCount !== null
        ? String(data.ratingCount)
        : '',
    description: strValue(data.description),
    aciklama: strValue(data.description),
    url: strValue(data.url),
    readingStatus: strValue(data.readingStatus || 'Okunacak'),
    status: strValue(data.readingStatus || 'Okunacak'),
    okumaDurumu: strValue(data.readingStatus || 'Okunacak'),
    okuma_durumu: strValue(data.readingStatus || 'Okunacak'),
    durum: strValue(data.readingStatus || 'Okunacak'),

    // Yeni bibliyografik alanlar
    price: strValue(data.price),
    fiyat: strValue(data.price),
    format: strValue(data.format),
    ciltTipi: strValue(data.format),
    binding: strValue(data.format),
    genres: Array.isArray(data.genres) ? data.genres.join(', ') : strValue(data.genres),
    tur: Array.isArray(data.genres) ? data.genres.join(', ') : strValue(data.genres),
    category: Array.isArray(data.genres) ? data.genres.join(', ') : strValue(data.genres),
    genresList:
      Array.isArray(data.genres) && data.genres.length > 0
        ? data.genres.map((g) => `  - ${JSON.stringify(g)}`).join('\n')
        : '  - ""',
    originalTitle: strValue(data.originalTitle),
    orijinalAdi: strValue(data.originalTitle),
    orijinalBaslik: strValue(data.originalTitle),
    language: strValue(data.language),
    dil: strValue(data.language),

    // media-db ve şablon uyumluluk takma adları
    image: rawCover,

    // Eski şablonlarla geriye dönük uyumluluk için güvenli boş değerler
    binkitapRating: '',
    binkitapReadCount: '',
    binkitapUrl: '',
    quotes: '',
  };

  // Kullanıcı tarafından yeniden adlandırılan (remap) alanları da yer tutucu sözlüğüne ekle
  if (mappings && mappings.length > 0) {
    for (const m of mappings) {
      if (m.mapping === PropertyMappingOption.Map && m.newProperty?.trim()) {
        const target = m.newProperty.trim();
        const origVal = replacements[m.property];
        if (origVal !== undefined && !Object.prototype.hasOwnProperty.call(replacements, target)) {
          replacements[target] = origVal;
        }
      }
    }
  }

  // 1. Standart {{değişken}} yer tutucularını çöz
  let rendered = processedTemplate.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (fullMatch, key: string) => {
    if (Object.prototype.hasOwnProperty.call(replacements, key)) {
      return replacements[key];
    }
    return fullMatch;
  });

  // 2. Basit <% degisken %> kalıpları (tp.* veya kod blokları hariç saf kitap değişkenleri için tolerans)
  rendered = rendered.replace(/<%\s*([a-zA-Z0-9_]+)\s*%>/g, (fullMatch, key: string) => {
    if (Object.prototype.hasOwnProperty.call(replacements, key)) {
      return replacements[key];
    }
    return fullMatch;
  });

  return rendered;
}
