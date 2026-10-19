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

  const replacements: Record<string, string> = {
    title: strValue(data.title),
    author: strValue(data.author),
    publisher: strValue(data.publisher),
    translator: strValue(data.translator),
    isbn: strValue(data.isbn),
    pages: data.pages !== undefined && data.pages !== null ? String(data.pages) : '',
    publishDate: strValue(data.publishDate),
    coverUrl: strValue(data.coverUrl),
    rating: data.rating !== undefined && data.rating !== null ? String(data.rating) : '',
    ratingCount:
      data.ratingCount !== undefined && data.ratingCount !== null
        ? String(data.ratingCount)
        : '',
    description: strValue(data.description),
    url: strValue(data.url),

    // Eski şablonlarla geriye dönük uyumluluk için güvenli boş değerler
    binkitapRating: '',
    binkitapReadCount: '',
    binkitapUrl: '',
    quotes: '',
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (fullMatch, key: string) => {
    if (Object.prototype.hasOwnProperty.call(replacements, key)) {
      return replacements[key];
    }
    return fullMatch;
  });
}
