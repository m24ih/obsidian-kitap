import { BookMetadata, BookQuote } from '../types';
import { sanitizeFileName } from '../utils/sanitizer';

export { sanitizeFileName };

/**
 * 1000Kitap okur alıntılarını standart Markdown alıntı bloklarına (blockquote) dönüştürür.
 * Çok satırlı alıntılarda her satırın başına `> ` ekler.
 * Sayfa numarası 0 veya tanımsız ise `s. 0` yazılmasını engeller.
 */
export function formatQuotes(quotes?: BookQuote[]): string {
  if (!quotes || !Array.isArray(quotes) || quotes.length === 0) {
    return '';
  }

  const formattedBlocks: string[] = [];

  for (const quote of quotes) {
    if (!quote || typeof quote.text !== 'string') continue;

    const cleanText = quote.text
      .replace(/^[•\s]+|[•\s]+$/g, '')
      .replace(/^[“"«]+|[”"»]+$/g, '')
      .trim();

    if (!cleanText) continue;

    // Çok satırlı alıntılarda her satırı "> " ile başlat
    const wrappedText = `“${cleanText}”`;
    const rawLines = wrappedText.split(/\r?\n/);
    const blockquoteLines = rawLines.map((line) => `> ${line.trim()}`).join('\n');

    // Yazar ve sayfa atfı
    const cleanAuthor = quote.author ? quote.author.trim() : '';
    let validPage = '';
    if (quote.page !== undefined && quote.page !== null) {
      const pageDigits = String(quote.page)
        .replace(/^s\.\s*/i, '')
        .trim();
      const pageNum = parseInt(pageDigits, 10);
      if (pageDigits && pageDigits !== '0' && !isNaN(pageNum) && pageNum > 0) {
        validPage = String(pageNum);
      }
    }

    let attribution = '';
    if (cleanAuthor && validPage) {
      attribution = `\n> — *${cleanAuthor}*, s. ${validPage}`;
    } else if (cleanAuthor) {
      attribution = `\n> — *${cleanAuthor}*`;
    } else if (validPage) {
      attribution = `\n> — s. ${validPage}`;
    }

    formattedBlocks.push(`${blockquoteLines}${attribution}`);
  }

  return formattedBlocks.join('\n\n');
}

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
    binkitapRating: strValue(data.binkitapRating),
    binkitapReadCount: strValue(data.binkitapReadCount),
    binkitapUrl: strValue(data.binkitapUrl),
    description: strValue(data.description),
    quotes: formatQuotes(data.quotes),
    url: strValue(data.url),
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (fullMatch, key: string) => {
    if (Object.prototype.hasOwnProperty.call(replacements, key)) {
      return replacements[key];
    }
    return fullMatch;
  });
}
