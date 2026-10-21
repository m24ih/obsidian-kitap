import { BookMetadata } from '../types';
import { sanitizeFileName } from '../utils/sanitizer';

export { sanitizeFileName };

/**
 * Kitap şablonundaki tüm `{{degisken}}` yer tutucularını BookMetadata değerleriyle doldurur.
 * Eksik veya undefined olan opsiyonel alanlar "undefined" veya "null" yerine boş dize ("") olarak işlenir.
 */
export function renderBookTemplate(template: string, data: BookMetadata): string {
  if (!template) return '';

  const strValue = (val: unknown): string => {
    if (val === undefined || val === null) return '';
    return String(val);
  };

  const rawCover = strValue(data.coverUrl);
  const isWikilink = rawCover.startsWith('[[') && rawCover.endsWith(']]');
  const innerCoverPath = isWikilink ? rawCover.slice(2, -2).trim() : rawCover;

  let processedTemplate = template;

  if (isWikilink && innerCoverPath) {
    // 1. ![[ {{coverUrl}} ]] veya ![[ {{coverUrl}} | 200 ]] wikilink embed kalıpları
    processedTemplate = processedTemplate.replace(
      /!\[\[\s*\{\{\s*coverUrl\s*\}\}\s*(?:\|([^\]]+))?\]\]/g,
      (_match, extra) => (extra ? `![[${innerCoverPath}|${extra.trim()}]]` : `![[${innerCoverPath}]]`)
    );

    // 2. ![Kapak|200]({{coverUrl}}) veya ![alt]({{coverUrl}}) standart markdown imaj kalıpları
    // Yerel wikilink durumunda Obsidian'ın doğal ![[resim.jpg|200]] formatına dönüştürülür
    processedTemplate = processedTemplate.replace(
      /!\[(.*?)\]\(\{\{\s*coverUrl\s*\}\}\)/g,
      (_match, alt) => {
        const trimmedAlt = alt.trim();
        const sizeMatch = trimmedAlt.match(/(?:^|\|)(\d+(?:x\d+)?)$/);
        if (sizeMatch) {
          return `![[${innerCoverPath}|${sizeMatch[1]}]]`;
        }
        return `![[${innerCoverPath}]]`;
      }
    );
  }

  const replacements: Record<string, string> = {
    title: strValue(data.title),
    author: strValue(data.author),
    publisher: strValue(data.publisher),
    translator: strValue(data.translator),
    isbn: strValue(data.isbn),
    pages: data.pages !== undefined && data.pages !== null ? String(data.pages) : '',
    publishDate: strValue(data.publishDate),
    coverUrl: rawCover,
    coverPath: innerCoverPath,
    rating: data.rating !== undefined && data.rating !== null ? String(data.rating) : '',
    ratingCount:
      data.ratingCount !== undefined && data.ratingCount !== null
        ? String(data.ratingCount)
        : '',
    description: strValue(data.description),
    url: strValue(data.url),
    readingStatus: strValue(data.readingStatus || 'Okunacak'),
    status: strValue(data.readingStatus || 'Okunacak'),
    okumaDurumu: strValue(data.readingStatus || 'Okunacak'),
    durum: strValue(data.readingStatus || 'Okunacak'),

    // Eski şablonlarla geriye dönük uyumluluk için güvenli boş değerler
    binkitapRating: '',
    binkitapReadCount: '',
    binkitapUrl: '',
    quotes: '',
  };

  return processedTemplate.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (fullMatch, key: string) => {
    if (Object.prototype.hasOwnProperty.call(replacements, key)) {
      return replacements[key];
    }
    return fullMatch;
  });
}
