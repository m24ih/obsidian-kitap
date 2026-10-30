/**
 * obsidian-kitap - Goodreads Metadata Mapper
 * Normalizes raw Goodreads CSV records into strongly-typed BookMetadata and ParsedGoodreadsBook.
 * Zero external runtime dependencies. Zero `: any` or `as any` casts.
 */

import type { BookMetadata, KitapPluginSettings } from '../types';
import type { GoodreadsRawRow, ParsedGoodreadsBook } from './types';
import { cleanIsbn, isIsbn, getAlternateIsbn } from '../providers/matcher';
import { normalizeTurkish } from '../utils/fuzzy';
import { unescapeExcelFormula } from './csvParser';

export { unescapeExcelFormula };

/**
 * Extracts and cleans an ISBN string from a Goodreads CSV cell.
 * Unescapes Excel formula notation, preserves leading zeros, digits, and check-digit 'X'.
 */
export function cleanGoodreadsIsbn(value?: string | null): string {
  const unescaped = unescapeExcelFormula(value);
  return cleanIsbn(unescaped);
}

/**
 * Normalizes Goodreads user rating ('My Rating').
 * Goodreads uses 0 for unrated books.
 * Returns integer 1..5, or undefined for 0 / unrated / invalid ratings.
 */
export function normalizeUserRating(value?: string | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === '0') return undefined;

  const parsed = parseInt(trimmed, 10);
  if (isNaN(parsed) || parsed < 1 || parsed > 5) return undefined;
  return parsed;
}

/**
 * Formats user rating for Obsidian YAML frontmatter (kisisel_puan).
 * Returns integer 1..5 if rated, or empty string "" if unrated.
 * Never outputs 0.
 */
export function formatUserRatingForFrontmatter(rating?: number): number | '' {
  if (rating === undefined || rating === null || rating <= 0 || rating > 5) {
    return '';
  }
  return Math.floor(rating);
}

/**
 * Normalizes Goodreads user rating to frontmatter rating number or empty string.
 * Unrated books (0, empty, invalid) strictly return empty string "".
 */
export function normalizeGoodreadsRating(ratingStr?: string | null): number | '' {
  const userRating = normalizeUserRating(ratingStr);
  return formatUserRatingForFrontmatter(userRating);
}

/**
 * Normalizes Goodreads community average rating ('Average Rating').
 * Returns float rounded to 2 decimal places, or undefined if <= 0 or invalid.
 */
export function normalizeAverageRating(value?: string | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;

  const parsed = parseFloat(trimmed);
  if (isNaN(parsed) || parsed <= 0 || parsed > 5) return undefined;
  return Math.round(parsed * 100) / 100;
}

/**
 * Converts Goodreads dates (YYYY/MM/DD, YYYY/M/D, YYYY-MM-DD, or partial YYYY/MM, YYYY)
 * into ISO 8601 strings (YYYY-MM-DD, YYYY-MM, or YYYY).
 * Returns empty string "" for empty or invalid dates.
 */
export function normalizeGoodreadsDate(dateStr?: string | null): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const trimmed = dateStr.trim();
  if (!trimmed) return '';

  const cleaned = trimmed.replace(/\/+$/, '');

  // 1. Full date with slashes: YYYY/M/D or YYYY/MM/DD
  const slashMatch = cleaned.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    const [, y, m, d] = slashMatch;
    const month = parseInt(m, 10);
    const day = parseInt(d, 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // 2. Full ISO date: YYYY-MM-DD or YYYY-M-D
  const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const month = parseInt(m, 10);
    const day = parseInt(d, 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // 3. Partial date: YYYY/M or YYYY-M
  const ymMatch = cleaned.match(/^(\d{4})[/-](\d{1,2})$/);
  if (ymMatch) {
    const [, y, m] = ymMatch;
    const month = parseInt(m, 10);
    if (month < 1 || month > 12) return '';
    return `${y}-${String(month).padStart(2, '0')}`;
  }

  // 4. 4-digit Year only: YYYY
  const yearMatch = cleaned.match(/^(\d{4})$/);
  if (yearMatch) {
    return yearMatch[1];
  }

  return '';
}

/**
 * Cleans Goodreads review HTML content and converts it into standard Markdown.
 * - Converts <br> tags to newlines
 * - Converts <b>, <strong> to **bold**
 * - Converts <i>, <em> to *italic*
 * - Converts <s>, <del>, <strike> to ~~strikethrough~~
 * - Converts <spoiler> to native Obsidian callout (> [!spoiler])
 * - Converts <a href="..."> to [text](href)
 * - Converts <blockquote> to > quote
 * - Decodes HTML entities
 * - Strips dangerous tags (<script>, <iframe>, <style>, etc.)
 */
export function cleanReviewHtml(html?: string | null): string {
  if (!html || typeof html !== 'string') return '';
  let text = html.trim();
  if (!text) return '';

  // 1. Strip dangerous tags
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<object[\s\S]*?<\/object>/gi, '');
  text = text.replace(/<embed[\s\S]*?<\/embed>/gi, '');

  // 2. Convert <spoiler> blocks into Obsidian callouts
  text = text.replace(/<spoiler>([\s\S]*?)<\/spoiler>/gi, (_match: string, content: string) => {
    const innerCleaned = cleanReviewHtml(content);
    const calloutLines = innerCleaned
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    return `\n\n> [!spoiler]\n${calloutLines}\n\n`;
  });

  // 3. Convert <blockquote> blocks into Markdown quotes
  text = text.replace(/<blockquote>([\s\S]*?)<\/blockquote>/gi, (_match: string, content: string) => {
    const innerCleaned = cleanReviewHtml(content);
    const quoteLines = innerCleaned
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    return `\n\n${quoteLines}\n\n`;
  });

  // 4. Handle paragraph and line break tags
  text = text.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '\n\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<br\s*\/?>\s*<br\s*\/?>+/gi, '\n\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // 5. Convert links
  text = text.replace(
    /<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match: string, href: string, anchor: string) => {
      const cleanAnchor = anchor.replace(/<[^>]+>/g, '').trim();
      const cleanHref = href.trim();
      if (/^javascript:/i.test(cleanHref)) return cleanAnchor;
      if (!cleanAnchor) return cleanHref;
      return `[${cleanAnchor}](${cleanHref})`;
    }
  );

  // 6. Convert inline styling
  text = text.replace(/<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/gi, '**$1**');
  text = text.replace(/<(?:i|em)>([\s\S]*?)<\/(?:i|em)>/gi, '*$1*');
  text = text.replace(/<(?:s|strike|del)>([\s\S]*?)<\/(?:s|strike|del)>/gi, '~~$1~~');
  text = text.replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`');

  // 7. Convert list items
  text = text.replace(/<li>([\s\S]*?)<\/li>/gi, '- $1\n');
  text = text.replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n');

  // 8. Strip any remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // 9. Decode HTML character entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_match: string, dec: string) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match: string, hex: string) => String.fromCharCode(parseInt(hex, 16)));

  // 10. Normalize whitespace and newlines
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Alias for cleanReviewHtml matching e2e contracts.
 */
export const sanitizeGoodreadsReview = cleanReviewHtml;

/**
 * Formats review for book note body, handling top-level spoiler column indicator.
 */
export function formatReviewSection(reviewMarkdown?: string, isSpoilerRow?: boolean): string {
  if (!reviewMarkdown || !reviewMarkdown.trim()) return '';
  const trimmed = reviewMarkdown.trim();

  if (isSpoilerRow && !trimmed.startsWith('> [!')) {
    const quoted = trimmed
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n');
    return `\n\n## 📝 Kişisel İnceleme\n\n> [!warning] Spoiler İçerir\n${quoted}\n`;
  }

  return `\n\n## 📝 Kişisel İnceleme\n\n${trimmed}\n`;
}

/**
 * Extracts series information from Goodreads title format, e.g. "Dune (Dune Chronicles, #1)".
 * Returns clean title and optional series title.
 */
export function cleanBookTitle(title?: string | null): { cleanTitle: string; seriesTitle?: string } {
  if (!title || typeof title !== 'string') return { cleanTitle: '' };
  const trimmed = title.trim();
  if (!trimmed) return { cleanTitle: '' };

  const seriesRegex = /\s*\(([^()]+,\s*#\d+(?:\.\d+)?|\b[^()]+\s+#\d+(?:\.\d+)?)\)\s*$/i;
  const match = trimmed.match(seriesRegex);

  if (match && match.index !== undefined) {
    const seriesTitle = match[1].trim();
    const clean = trimmed.slice(0, match.index).trim();
    return { cleanTitle: clean, seriesTitle };
  }

  return { cleanTitle: trimmed };
}

export interface ShelfMappingResult {
  status: string;
  isCustomShelf: boolean;
  customShelfName?: string;
}

/**
 * Maps Goodreads exclusive shelf to plugin reading status.
 * Supports case-insensitive matching across Turkish and English defaults.
 */
export function mapGoodreadsShelf(
  shelfRaw: string | undefined,
  options: string[],
  defaultStatus: string
): ShelfMappingResult {
  if (!shelfRaw || !shelfRaw.trim()) {
    return {
      status: defaultStatus || (options.length > 0 ? options[0] : 'Okunacak'),
      isCustomShelf: false,
    };
  }

  const rawTrimmed = shelfRaw.trim();
  const norm = normalizeTurkish(rawTrimmed).replace(/[\s_-]+/g, '');

  // 1. Direct match with configured options
  for (const opt of options) {
    if (normalizeTurkish(opt).replace(/[\s_-]+/g, '') === norm) {
      return { status: opt, isCustomShelf: false };
    }
  }

  // 2. Canonical mapping tables
  const READ_TARGETS = new Set(['okundu', 'read', 'finished', 'bitti', 'tamamlandi']);
  const CURRENT_TARGETS = new Set(['okunuyor', 'currentlyreading', 'reading', 'devamediyor']);
  const TO_READ_TARGETS = new Set(['okunacak', 'toread', 'wanttoread', 'tbr', 'sirada']);

  if (READ_TARGETS.has(norm)) {
    const matched = options.find((o) => READ_TARGETS.has(normalizeTurkish(o).replace(/[\s_-]+/g, '')));
    return { status: matched || 'Okundu', isCustomShelf: false };
  }

  if (CURRENT_TARGETS.has(norm)) {
    const matched = options.find((o) => CURRENT_TARGETS.has(normalizeTurkish(o).replace(/[\s_-]+/g, '')));
    return { status: matched || 'Okunuyor', isCustomShelf: false };
  }

  if (TO_READ_TARGETS.has(norm)) {
    const matched = options.find((o) => TO_READ_TARGETS.has(normalizeTurkish(o).replace(/[\s_-]+/g, '')));
    return { status: matched || defaultStatus || 'Okunacak', isCustomShelf: false };
  }

  // 3. Custom shelf fallback
  return {
    status: defaultStatus || (options.length > 0 ? options[0] : 'Okunacak'),
    isCustomShelf: true,
    customShelfName: rawTrimmed,
  };
}

/**
 * Simplified shelf mapper returning status string matching e2e contracts.
 */
export function mapShelfToReadingStatus(
  shelf: string,
  options: string[],
  defaultStatus: string
): string {
  return mapGoodreadsShelf(shelf, options, defaultStatus).status;
}

const EXCLUSIVE_SHELVES = new Set([
  'read',
  'currently-reading',
  'currentlyreading',
  'to-read',
  'toread',
]);

/**
 * Parses Goodreads bookshelves into a deduplicated genres array.
 * Filters out canonical exclusive shelves and appends custom shelf if applicable.
 */
export function parseBookshelves(
  bookshelvesRaw: string | undefined,
  extraShelf?: string
): string[] | undefined {
  const rawList: string[] = [];

  if (bookshelvesRaw && bookshelvesRaw.trim()) {
    const parts = bookshelvesRaw.split(',');
    for (const p of parts) {
      const trimmed = p.trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      if (EXCLUSIVE_SHELVES.has(lower)) continue;
      rawList.push(trimmed);
    }
  }

  if (extraShelf && extraShelf.trim()) {
    const trimmed = extraShelf.trim();
    if (!EXCLUSIVE_SHELVES.has(trimmed.toLowerCase())) {
      rawList.push(trimmed);
    }
  }

  if (rawList.length === 0) return undefined;

  // Case-insensitive deduplication preserving original casing of first occurrence
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const item of rawList) {
    const key = item.toLocaleLowerCase('tr-TR');
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  return deduped.length > 0 ? deduped : undefined;
}

const GENERATIONAL_SUFFIXES = new Set(['jr.', 'jr', 'sr.', 'sr', 'ii', 'iii', 'iv', 'v']);

/**
 * Extracts authors from primary Author, Author l-f, and Additional Authors columns.
 * Protects generational suffixes (Jr., III) from improper splitting.
 */
export function parseAuthorList(
  primaryAuthorRaw: string | undefined,
  authorLfRaw: string | undefined,
  additionalAuthorsRaw: string | undefined
): { primaryAuthor: string; additionalAuthors: string[]; combinedAuthor: string } {
  let primary = (primaryAuthorRaw || '').trim().replace(/\s+/g, ' ');

  if (!primary && authorLfRaw && authorLfRaw.trim()) {
    const commaIdx = authorLfRaw.indexOf(',');
    if (commaIdx !== -1) {
      const last = authorLfRaw.slice(0, commaIdx).trim();
      const first = authorLfRaw.slice(commaIdx + 1).trim();
      primary = `${first} ${last}`.trim().replace(/\s+/g, ' ');
    } else {
      primary = authorLfRaw.trim().replace(/\s+/g, ' ');
    }
  }

  const additionals: string[] = [];
  if (additionalAuthorsRaw && additionalAuthorsRaw.trim()) {
    const parts = additionalAuthorsRaw.split(',');
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim().replace(/\s+/g, ' ');
      if (!part) continue;

      if (GENERATIONAL_SUFFIXES.has(part.toLowerCase()) && additionals.length > 0) {
        additionals[additionals.length - 1] += `, ${part}`;
      } else {
        additionals.push(part);
      }
    }
  }

  const allAuthors: string[] = [];
  if (primary) allAuthors.push(primary);
  for (const a of additionals) {
    if (!allAuthors.some((existing) => existing.toLowerCase() === a.toLowerCase())) {
      allAuthors.push(a);
    }
  }

  const combinedAuthor = allAuthors.join(', ') || 'Bilinmeyen Yazar';

  return {
    primaryAuthor: primary || 'Bilinmeyen Yazar',
    additionalAuthors: additionals,
    combinedAuthor,
  };
}

/**
 * Parses Number of Pages string to positive integer.
 * Zero, negative numbers, or invalid strings return undefined.
 */
export function parsePageCount(rawPages: string | undefined): number | undefined {
  if (!rawPages || typeof rawPages !== 'string') return undefined;
  const cleaned = rawPages.trim();
  if (!cleaned) return undefined;

  const parsed = parseInt(cleaned, 10);
  if (!Number.isFinite(parsed) || isNaN(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

/**
 * Parses publication year from Year Published or Original Publication Year.
 */
export function parsePublicationYear(
  yearPublishedRaw: string | undefined,
  originalYearRaw: string | undefined
): { publishDate?: string; originalYear?: string } {
  const cleanYear = (val: string | undefined): string | undefined => {
    if (!val || typeof val !== 'string') return undefined;
    const trimmed = val.trim();
    if (!trimmed) return undefined;

    const yearMatch = trimmed.match(/^-?\d{1,4}/);
    if (yearMatch) {
      return yearMatch[0];
    }
    return undefined;
  };

  const pub = cleanYear(yearPublishedRaw);
  const orig = cleanYear(originalYearRaw);

  return {
    publishDate: pub || orig,
    originalYear: orig,
  };
}

/**
 * Localizes Goodreads Binding names to Turkish book formats.
 */
export function localizeBinding(bindingRaw?: string): string | undefined {
  if (!bindingRaw || typeof bindingRaw !== 'string') return undefined;
  const trimmed = bindingRaw.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();
  if (lower.includes('hardcover')) return 'Ciltli';
  if (lower.includes('paperback')) return 'Karton Kapak';
  if (lower.includes('kindle') || lower.includes('ebook') || lower.includes('nook')) return 'E-kitap';
  if (lower.includes('audiobook') || lower.includes('audio')) return 'Sesli Kitap';

  return trimmed;
}

/**
 * Internal defensive accessor for row fields supporting camelCase or CSV headers.
 */
export function getField(
  row: GoodreadsRawRow,
  camelKey: keyof GoodreadsRawRow,
  ...headerKeys: string[]
): string {
  const camelVal = row[camelKey];
  if (typeof camelVal === 'string' && camelVal.trim().length > 0) {
    return camelVal.trim();
  }
  for (const h of headerKeys) {
    const val = row[h];
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  return '';
}

/**
 * Maps a single raw Goodreads CSV row into a strongly-typed ParsedGoodreadsBook.
 * Adheres to PROJECT.md § Interface Contracts.
 */
export function mapGoodreadsRow(
  row: GoodreadsRawRow,
  settings?: KitapPluginSettings
): ParsedGoodreadsBook {
  // 1. Title and Series
  const rawTitle = getField(row, 'title', 'Title') || 'İsimsiz Kitap';
  const { cleanTitle, seriesTitle } = cleanBookTitle(rawTitle);

  // 2. Authors
  const rawAuthor = getField(row, 'author', 'Author');
  const rawAuthorLf = getField(row, 'authorLf', 'Author l-f', 'Author l/f');
  const rawAdditionalAuthors = getField(row, 'additionalAuthors', 'Additional Authors');
  const { primaryAuthor } = parseAuthorList(rawAuthor, rawAuthorLf, rawAdditionalAuthors);

  // 3. ISBN Resolution
  const rawIsbn = cleanGoodreadsIsbn(getField(row, 'isbn', 'ISBN'));
  const rawIsbn13 = cleanGoodreadsIsbn(getField(row, 'isbn13', 'ISBN13'));

  let finalIsbn13: string | undefined =
    isIsbn(rawIsbn13) && rawIsbn13.length === 13 ? rawIsbn13 : undefined;
  let finalIsbn10: string | undefined =
    isIsbn(rawIsbn) && rawIsbn.length === 10 ? rawIsbn : undefined;

  if (!finalIsbn10 && isIsbn(rawIsbn13) && rawIsbn13.length === 10) {
    finalIsbn10 = rawIsbn13;
  }
  if (!finalIsbn13 && isIsbn(rawIsbn) && rawIsbn.length === 13) {
    finalIsbn13 = rawIsbn;
  }

  if (finalIsbn13 && !finalIsbn10) {
    finalIsbn10 = getAlternateIsbn(finalIsbn13);
  } else if (finalIsbn10 && !finalIsbn13) {
    finalIsbn13 = getAlternateIsbn(finalIsbn10);
  }

  const primaryIsbn = finalIsbn13 || finalIsbn10 || rawIsbn13 || rawIsbn || '';

  // 4. Shelf to Reading Status
  const rawShelf = getField(row, 'exclusiveShelf', 'Exclusive Shelf');
  const readingStatusOptions =
    settings?.readingStatusOptions && settings.readingStatusOptions.length > 0
      ? settings.readingStatusOptions
      : ['Okunacak', 'Okunuyor', 'Okundu'];
  const defaultReadingStatus = settings?.defaultReadingStatus || 'Okunacak';

  const shelfResult = mapGoodreadsShelf(
    rawShelf,
    readingStatusOptions,
    defaultReadingStatus
  );

  // 5. Bookshelves to Genres
  const rawBookshelves = getField(row, 'bookshelves', 'Bookshelves');
  const genres = parseBookshelves(
    rawBookshelves,
    shelfResult.isCustomShelf ? shelfResult.customShelfName : undefined
  );

  // 6. Page Count
  const rawPages = getField(row, 'numberOfPages', 'Number of Pages');
  const pages = parsePageCount(rawPages);

  // 7. Publication Year
  const rawYear = getField(row, 'yearPublished', 'Year Published');
  const rawOrigYear = getField(row, 'originalPublicationYear', 'Original Publication Year');
  const { publishDate } = parsePublicationYear(rawYear, rawOrigYear);

  // 8. Ratings
  const rawMyRating = getField(row, 'myRating', 'My Rating');
  const userRating = normalizeUserRating(rawMyRating);

  const rawAvgRating = getField(row, 'averageRating', 'Average Rating');
  const avgRating = normalizeAverageRating(rawAvgRating);

  // 9. Dates
  const rawDateRead = getField(row, 'dateRead', 'Date Read');
  const dateReadIso = normalizeGoodreadsDate(rawDateRead) || undefined;

  const rawDateAdded = getField(row, 'dateAdded', 'Date Added');
  const dateAddedIso = normalizeGoodreadsDate(rawDateAdded) || undefined;

  // 10. Review & Format
  const rawReview = getField(row, 'myReview', 'My Review');
  const reviewMarkdown = cleanReviewHtml(rawReview) || undefined;

  const rawBinding = getField(row, 'binding', 'Binding');
  const format = localizeBinding(rawBinding);

  // 11. Book Id & URL
  const bookId = getField(row, 'bookId', 'Book Id') || String(Date.now());
  const url = `https://www.goodreads.com/book/show/${bookId}`;

  // Assemble BookMetadata
  const metadata: BookMetadata = {
    id: `goodreads_${bookId}`,
    url,
    title: rawTitle,
    author: primaryAuthor,
    publisher: getField(row, 'publisher', 'Publisher'),
    isbn: primaryIsbn,
    pages,
    publishDate,
    rating: avgRating,
    readingStatus: shelfResult.status,
    format,
    genres,
    originalTitle: undefined,
    provider: 'goodreads',
  };

  return {
    raw: row,
    metadata,
    isbn10: finalIsbn10,
    isbn13: finalIsbn13,
    cleanTitle,
    seriesTitle,
    userRating,
    dateReadIso,
    dateAddedIso,
    readingStatus: shelfResult.status,
    reviewMarkdown,
  };
}

/**
 * Builds standard frontmatter key-value pairs from a ParsedGoodreadsBook.
 */
export function buildGoodreadsFrontmatterProperties(
  parsed: ParsedGoodreadsBook,
  settings?: KitapPluginSettings
): Record<string, unknown> {
  const meta = parsed.metadata;
  return {
    tip: 'kitap',
    baslik: meta.title,
    yazar: meta.author,
    yayinevi: meta.publisher || '',
    cevirmen: meta.translator || '',
    isbn: meta.isbn,
    sayfa: meta.pages !== undefined ? meta.pages : '',
    okunan_sayfa: 0,
    yayin_tarihi: meta.publishDate || '',
    fiyat: meta.price || '',
    format: meta.format || '',
    tur: meta.genres && meta.genres.length > 0 ? meta.genres : '',
    orijinal_baslik: meta.originalTitle || '',
    dil: meta.language || '',
    puan: meta.rating !== undefined ? meta.rating : '',
    kapak: meta.coverUrl || '',
    url: meta.url || '',
    okuma_durumu: parsed.readingStatus || settings?.defaultReadingStatus || 'Okunacak',
    okunma_tarihi: parsed.dateReadIso || '',
    kisisel_puan: parsed.userRating !== undefined ? parsed.userRating : '',
  };
}
