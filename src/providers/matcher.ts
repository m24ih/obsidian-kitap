import { BookMetadata, SearchResultItem } from '../types';

/**
 * Normalizes an ISBN string to uppercase digits/X without hyphens or spaces.
 */
export function cleanIsbn(input?: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/^isbn\s*:?\s*/i, '')
    .replace(/[-\s]/g, '')
    .toUpperCase();
}

/**
 * Compares two ISBNs, accounting for ISBN-10 to ISBN-13 (978 prefix) conversion.
 */
export function isbnsMatch(isbn1?: string, isbn2?: string): boolean {
  const c1 = cleanIsbn(isbn1);
  const c2 = cleanIsbn(isbn2);
  if (!c1 || !c2) return false;
  if (c1 === c2) return true;

  // Compare ISBN-10 and ISBN-13
  if (c1.length === 13 && c2.length === 10) {
    return c1.startsWith('978') && c1.slice(3, 12) === c2.slice(0, 9);
  }
  if (c1.length === 10 && c2.length === 13) {
    return c2.startsWith('978') && c2.slice(3, 12) === c1.slice(0, 9);
  }

  return false;
}

/**
 * Normalizes book title for robust cross-provider deduplication.
 * Strips subtitle/format tags (e.g. "(Karton Kapak)", "(Ciltli)"), punctuation,
 * extra whitespaces, and normalizes Turkish diacritics.
 */
export function normalizeTitle(title?: string): string {
  if (!title || typeof title !== 'string') return '';
  return title
    .toLocaleLowerCase('tr-TR')
    // Remove format suffixes like (Karton Kapak), (Ciltli), (Cep Boy), [Ciltli]
    .replace(/\s*[([](?:karton kapak|ciltli|özel baskı|cep boy|kutulu set|seti|cilt \d+|baskı|e-kitap)[)\]]/gi, '')
    // Remove punctuation
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’“”«»]/g, ' ')
    // Normalize Turkish characters
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/[ğ]/g, 'g')
    .replace(/[ü]/g, 'u')
    .replace(/[ş]/g, 's')
    .replace(/[ö]/g, 'o')
    .replace(/[ç]/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts normalized tokens from an author name string.
 */
export function getAuthorTokens(author?: string): string[] {
  if (!author || typeof author !== 'string') return [];
  const normalized = author
    .toLocaleLowerCase('tr-TR')
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’“”«»]/g, ' ')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/[ğ]/g, 'g')
    .replace(/[ü]/g, 'u')
    .replace(/[ş]/g, 's')
    .replace(/[ö]/g, 'o')
    .replace(/[ç]/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.split(' ').filter((w) => w.length >= 2);
}

/**
 * Compares two author names for similarity.
 * Handles different name orders ("Isaac Asimov" vs "Asimov Isaac"),
 * middle names ("Fyodor Dostoyevski" vs "Fyodor Mihayloviç Dostoyevski"),
 * and multiple contributors.
 */
export function areAuthorsMatching(authorA?: string, authorB?: string): boolean {
  if (!authorA || !authorB) return false;
  const tokensA = getAuthorTokens(authorA);
  const tokensB = getAuthorTokens(authorB);

  if (tokensA.length === 0 || tokensB.length === 0) return false;

  // Check how many tokens overlap
  const setB = new Set(tokensB);
  const overlap = tokensA.filter((t) => setB.has(t));

  // If all tokens of the shorter name are in the longer name (e.g. Dostoyevski)
  const minLen = Math.min(tokensA.length, tokensB.length);
  if (overlap.length >= minLen && minLen > 0) {
    return true;
  }

  // At least one distinctive token (>= 4 chars) and >= 50% overlap of shorter list
  const hasDistinctiveToken = overlap.some((t) => t.length >= 4);
  if (hasDistinctiveToken && overlap.length >= Math.ceil(minLen * 0.5)) {
    return true;
  }

  return false;
}

/**
 * Checks if two search result items from different providers represent the same book.
 */
export function areBooksMatching(itemA: SearchResultItem, itemB: SearchResultItem): boolean {
  // 1. ISBN match takes highest priority
  if (itemA.isbn && itemB.isbn) {
    if (isbnsMatch(itemA.isbn, itemB.isbn)) {
      return true;
    }
  }

  const titleA = normalizeTitle(itemA.title);
  const titleB = normalizeTitle(itemB.title);

  if (!titleA || !titleB) return false;

  // Title must match exactly or be highly similar
  const titlesExact = titleA === titleB;

  if (titlesExact) {
    // If authors match, confident match!
    if (areAuthorsMatching(itemA.author, itemB.author)) {
      return true;
    }
    // If one of the authors is empty or missing, check if title is long enough (>= 8 chars)
    if ((!itemA.author || !itemB.author) && titleA.length >= 8) {
      return true;
    }
  }

  return false;
}

/**
 * Merges search results from Kitapyurdu and D&R into a unified list.
 * Deduplicates books matching across providers, attaching provider badges and sources.
 */
export function mergeSearchResults(
  kyResults: SearchResultItem[],
  drResults: SearchResultItem[]
): SearchResultItem[] {
  const merged: SearchResultItem[] = [];
  const matchedDrIndices = new Set<number>();

  for (const kyItem of kyResults) {
    let matchedDrIndex = -1;
    for (let i = 0; i < drResults.length; i++) {
      if (matchedDrIndices.has(i)) continue;
      if (areBooksMatching(kyItem, drResults[i])) {
        matchedDrIndex = i;
        break;
      }
    }

    if (matchedDrIndex !== -1) {
      matchedDrIndices.add(matchedDrIndex);
      const drItem = drResults[matchedDrIndex];

      // Form unified merged item
      const mergedItem: SearchResultItem = {
        id: `ky_${kyItem.id}__dr_${drItem.id}`,
        title: kyItem.title || drItem.title,
        author: kyItem.author || drItem.author,
        publisher: kyItem.publisher || drItem.publisher,
        url: kyItem.url || drItem.url,
        coverUrl: kyItem.coverUrl || drItem.coverUrl,
        rating: kyItem.rating ?? drItem.rating,
        provider: 'hybrid',
        providers: ['kitapyurdu', 'dr'],
        sources: {
          kitapyurdu: kyItem,
          dr: drItem,
        },
        isbn: kyItem.isbn || drItem.isbn,
      };
      merged.push(mergedItem);
    } else {
      // Kitapyurdu-only item
      merged.push({
        ...kyItem,
        provider: 'kitapyurdu',
        providers: ['kitapyurdu'],
        sources: {
          kitapyurdu: kyItem,
        },
      });
    }
  }

  // Add unmatched D&R items
  for (let i = 0; i < drResults.length; i++) {
    if (!matchedDrIndices.has(i)) {
      const drItem = drResults[i];
      merged.push({
        ...drItem,
        provider: 'dr',
        providers: ['dr'],
        sources: {
          dr: drItem,
        },
      });
    }
  }

  return merged;
}

/**
 * Resolves the optimal default value between two providers for a given metadata field.
 */
export function resolveBestValue<T>(
  valA: T | undefined,
  valB: T | undefined,
  field: keyof BookMetadata
): { value: T | undefined; source: 'kitapyurdu' | 'dr' } {
  const isPresent = (v: unknown): boolean => {
    if (v === undefined || v === null) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (typeof v === 'number') return !isNaN(v) && v > 0;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  };

  const aPresent = isPresent(valA);
  const bPresent = isPresent(valB);

  if (aPresent && !bPresent) return { value: valA, source: 'kitapyurdu' };
  if (!aPresent && bPresent) return { value: valB, source: 'dr' };
  if (!aPresent && !bPresent) return { value: valA, source: 'kitapyurdu' };

  // Both are present — apply domain heuristics
  if (field === 'pages') {
    const numA = typeof valA === 'number' ? valA : parseInt(String(valA), 10);
    const numB = typeof valB === 'number' ? valB : parseInt(String(valB), 10);
    if (numA > 0 && (!numB || numB <= 0)) return { value: valA, source: 'kitapyurdu' };
    if (numB > 0 && (!numA || numA <= 0)) return { value: valB, source: 'dr' };
  }

  if (field === 'publishDate') {
    const strA = String(valA || '');
    const strB = String(valB || '');
    // Prefer full YYYY-MM-DD over just 4-digit YYYY
    if (strA.length === 10 && strB.length === 4) return { value: valA, source: 'kitapyurdu' };
    if (strB.length === 10 && strA.length === 4) return { value: valB, source: 'dr' };
  }

  if (field === 'description') {
    const strA = String(valA || '');
    const strB = String(valB || '');
    // Prefer longer, more comprehensive blurb
    if (strA.length >= strB.length) return { value: valA, source: 'kitapyurdu' };
    return { value: valB, source: 'dr' };
  }

  if (field === 'genres') {
    const arrA = Array.isArray(valA) ? valA : [];
    const arrB = Array.isArray(valB) ? valB : [];
    if (arrA.length >= arrB.length) return { value: valA, source: 'kitapyurdu' };
    return { value: valB, source: 'dr' };
  }

  // Default to Kitapyurdu as primary
  return { value: valA, source: 'kitapyurdu' };
}

/**
 * Returns default column selections for all metadata fields comparing Kitapyurdu and D&R data.
 */
export function resolveDefaultSelections(
  kyData: BookMetadata,
  drData: BookMetadata
): Record<string, 'kitapyurdu' | 'dr'> {
  const fields: (keyof BookMetadata)[] = [
    'title',
    'author',
    'publisher',
    'translator',
    'isbn',
    'pages',
    'publishDate',
    'format',
    'language',
    'genres',
    'price',
    'rating',
    'coverUrl',
    'description',
  ];

  const selections: Record<string, 'kitapyurdu' | 'dr'> = {};
  for (const f of fields) {
    const res = resolveBestValue(kyData[f], drData[f], f);
    selections[f] = res.source;
  }

  return selections;
}

/**
 * Combines metadata from Kitapyurdu and D&R based on chosen provider per field.
 */
export function mergeBookMetadata(
  kyData: BookMetadata,
  drData: BookMetadata,
  selections?: Record<string, 'kitapyurdu' | 'dr'>
): BookMetadata {
  const effectiveSelections = selections || resolveDefaultSelections(kyData, drData);

  const getChosen = <T>(field: keyof BookMetadata): T | undefined => {
    const source = effectiveSelections[field] || 'kitapyurdu';
    const val = source === 'dr' ? drData[field] : kyData[field];
    return val as T | undefined;
  };

  const id = kyData.id || drData.id;
  const url = kyData.url || drData.url;
  const title = (getChosen<string>('title') || kyData.title || drData.title || '').trim();
  const author = (getChosen<string>('author') || kyData.author || drData.author || '').trim();
  const publisher = (getChosen<string>('publisher') || kyData.publisher || drData.publisher || '').trim();
  const translator = getChosen<string>('translator') || undefined;
  const isbn = (getChosen<string>('isbn') || kyData.isbn || drData.isbn || '').trim();
  const pages = getChosen<number>('pages');
  const publishDate = getChosen<string>('publishDate') || undefined;
  const format = getChosen<string>('format') || undefined;
  const language = getChosen<string>('language') || undefined;
  const genres = getChosen<string[]>('genres') || undefined;
  const price = getChosen<string>('price') || undefined;
  const rating = getChosen<number>('rating');
  const ratingCount = kyData.ratingCount ?? drData.ratingCount ?? undefined;
  const coverUrl = getChosen<string>('coverUrl') || kyData.coverUrl || drData.coverUrl || '';
  const description = getChosen<string>('description') || undefined;

  return {
    id,
    url,
    title,
    author,
    publisher,
    ...(translator ? { translator } : {}),
    isbn,
    ...(pages !== undefined ? { pages } : {}),
    ...(publishDate ? { publishDate } : {}),
    coverUrl,
    ...(description ? { description } : {}),
    ...(rating !== undefined ? { rating } : {}),
    ...(ratingCount !== undefined ? { ratingCount } : {}),
    ...(price ? { price } : {}),
    ...(format ? { format } : {}),
    ...(genres && genres.length > 0 ? { genres } : {}),
    ...(language ? { language } : {}),
    provider: 'hybrid',
  };
}
