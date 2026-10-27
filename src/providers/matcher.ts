import { BookMetadata, SearchResultItem } from '../types';

/**
 * Normalizes an ISBN string to uppercase digits/X without hyphens, spaces, or extraneous punctuation.
 */
export function cleanIsbn(input?: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/^isbn\s*:?\s*/i, '')
    .replace(/[^0-9X]/gi, '')
    .toUpperCase();
}

/**
 * Checks whether an input string looks like an ISBN-10 or ISBN-13 (with optional hyphens/spaces/prefix).
 */
export function isIsbn(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  const stripped = input.trim().replace(/^isbn\s*:?\s*/i, '').replace(/[-\s]/g, '');
  return (
    (stripped.length === 13 && /^97[89]\d{10}$/.test(stripped)) ||
    (stripped.length === 10 && /^\d{9}[\dX]$/i.test(stripped))
  );
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
 * Calculates the complementary ISBN representation:
 * - If given an ISBN-13 starting with 978, returns the corresponding ISBN-10 with valid check digit.
 * - If given an ISBN-10, returns the corresponding 978-prefixed ISBN-13 with valid check digit.
 */
export function getAlternateIsbn(isbn?: string): string | undefined {
  const clean = cleanIsbn(isbn);
  if (!clean) return undefined;

  if (clean.length === 13 && clean.startsWith('978')) {
    const nine = clean.slice(3, 12);
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(nine[i], 10) * (10 - i);
    }
    const rem = (11 - (sum % 11)) % 11;
    const check = rem === 10 ? 'X' : String(rem);
    return `${nine}${check}`;
  }

  if (clean.length === 10) {
    const nine = clean.slice(0, 9);
    let sum = 9 * 1 + 7 * 3 + 8 * 1;
    for (let i = 0; i < 9; i++) {
      const weight = i % 2 === 0 ? 3 : 1;
      sum += parseInt(nine[i], 10) * weight;
    }
    const rem = (10 - (sum % 10)) % 10;
    return `978${nine}${rem}`;
  }

  return undefined;
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
    // Remove format suffixes in brackets/parentheses
    .replace(/\s*[([](?:karton kapak|ciltli|özel baskı|ozel baski|cep boy|kutulu set|seti|cilt \d+|baskı|baski|e-kitap)[)\]]/gi, '')
    // Remove format suffixes after hyphen or colon, e.g. " - Ciltli", " - Karton Kapak"
    .replace(/\s*[-–—:]\s*(?:karton kapak|ciltli|özel baskı|ozel baski|cep boy|kutulu set|e-kitap)\s*$/gi, '')
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
 * and prevents false positives between distinct authors sharing a common first name.
 */
export function areAuthorsMatching(authorA?: string, authorB?: string): boolean {
  if (!authorA || !authorB) return false;
  const tokensA = getAuthorTokens(authorA);
  const tokensB = getAuthorTokens(authorB);

  if (tokensA.length === 0 || tokensB.length === 0) return false;

  // Check how many tokens overlap
  const setB = new Set(tokensB);
  const overlap = tokensA.filter((t) => setB.has(t));

  const minLen = Math.min(tokensA.length, tokensB.length);

  // If all tokens of the shorter name are in the longer name (e.g. Dostoyevski in Fyodor Dostoyevski)
  if (overlap.length >= minLen && minLen > 0) {
    return true;
  }

  // If names have 3+ tokens, allow match if at least 2 tokens match and >= 60% of shorter name
  if (overlap.length >= 2 && overlap.length / minLen >= 0.6) {
    return true;
  }

  return false;
}

const PUBLISHER_NOISE_WORDS = new Set([
  'yayinlari',
  'yayinevi',
  'yayincilik',
  'yayin',
  'yayinlar',
  'kitap',
  'kitapligi',
  'kitaplari',
  'basim',
  'dagitim',
  'medya',
  'as',
  'ltd',
  'sti',
  'ticaret',
  'sanayi',
  've',
  'ile',
]);

/**
 * Extracts distinctive tokens from a publisher name string.
 */
export function normalizePublisherTokens(pub?: string): string[] {
  if (!pub || typeof pub !== 'string') return [];
  const normalized = pub
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

  const words = normalized.split(' ').filter(Boolean);
  const result: string[] = [];

  for (const w of words) {
    if (w === 'yky') {
      result.push('yapi', 'kredi');
      continue;
    }
    if (PUBLISHER_NOISE_WORDS.has(w)) {
      continue;
    }
    if (w.length >= 2) {
      result.push(w);
    }
  }

  return result;
}

/**
 * Determines whether two publisher names refer to the same publishing house.
 * If one or both are missing, assumes compatibility.
 * If both are present with distinctive words and have zero token overlap, returns false.
 */
export function arePublishersMatching(pubA?: string, pubB?: string): boolean {
  if (!pubA || !pubB) return true;
  const tokensA = normalizePublisherTokens(pubA);
  const tokensB = normalizePublisherTokens(pubB);

  if (tokensA.length === 0 || tokensB.length === 0) return true;

  const setB = new Set(tokensB);
  return tokensA.some((t) => setB.has(t));
}

/**
 * Extracts binding/format tag from a title.
 */
export function extractFormatHint(title?: string): 'ciltli' | 'karton' | 'cep' | 'ekitap' | null {
  if (!title) return null;
  const s = title.toLocaleLowerCase('tr-TR');
  if (s.includes('ciltli') || s.includes('özel baskı') || s.includes('ozel baski')) return 'ciltli';
  if (s.includes('karton kapak') || s.includes('ciltsiz') || s.includes('ince kapak')) return 'karton';
  if (s.includes('cep boy')) return 'cep';
  if (s.includes('e-kitap') || s.includes('ekitap')) return 'ekitap';
  return null;
}

/**
 * Verifies whether formats from titles are compatible (e.g. rejects merging Ciltli with Karton Kapak).
 */
export function areFormatsCompatible(titleA?: string, titleB?: string): boolean {
  const fA = extractFormatHint(titleA);
  const fB = extractFormatHint(titleB);
  if (!fA || !fB) return true;
  return fA === fB;
}

/**
 * Checks if two search result items from different providers represent the same book.
 */
export function areBooksMatching(itemA: SearchResultItem, itemB: SearchResultItem): boolean {
  // 1. ISBN match check if both items carry valid ISBNs
  const c1 = cleanIsbn(itemA.isbn);
  const c2 = cleanIsbn(itemB.isbn);
  if (c1.length >= 10 && c2.length >= 10) {
    return isbnsMatch(c1, c2);
  }

  // 2. Reject mismatched physical formats (e.g. Ciltli vs Karton Kapak)
  if (!areFormatsCompatible(itemA.title, itemB.title)) {
    return false;
  }

  // 3. Reject different publishers for the same title
  if (!arePublishersMatching(itemA.publisher, itemB.publisher)) {
    return false;
  }

  const titleA = normalizeTitle(itemA.title);
  const titleB = normalizeTitle(itemB.title);

  if (!titleA || !titleB) return false;

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
  drResults: SearchResultItem[],
  ...additionalResults: SearchResultItem[][]
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

  // Merge additional provider results (e.g. OpenLibrary, Hardcover)
  for (const extraList of additionalResults) {
    if (!Array.isArray(extraList) || extraList.length === 0) continue;

    for (const extraItem of extraList) {
      if (!extraItem) continue;
      const extraProvider = extraItem.provider || 'unknown';

      let matchedIndex = -1;
      for (let i = 0; i < merged.length; i++) {
        if (areBooksMatching(merged[i], extraItem)) {
          matchedIndex = i;
          break;
        }
      }

      if (matchedIndex !== -1) {
        const target = merged[matchedIndex];
        const existingProviders = target.providers || (target.provider ? [target.provider] : []);
        const newProviders = existingProviders.includes(extraProvider)
          ? existingProviders
          : [...existingProviders, extraProvider];

        const existingSources = target.sources || {};
        const newSources = {
          ...existingSources,
          [extraProvider]: extraItem,
        };

        target.id = `${target.id}__${extraProvider}_${extraItem.id}`;
        target.provider = 'hybrid';
        target.providers = newProviders;
        target.sources = newSources;
        target.title = target.title || extraItem.title;
        target.author = target.author || extraItem.author;
        target.publisher = target.publisher || extraItem.publisher;
        target.coverUrl = target.coverUrl || extraItem.coverUrl;
        target.isbn = target.isbn || extraItem.isbn;
        if (target.rating === undefined && extraItem.rating !== undefined) {
          target.rating = extraItem.rating;
        }
      } else {
        merged.push({
          ...extraItem,
          provider: extraProvider,
          providers: [extraProvider],
          sources: {
            [extraProvider]: extraItem,
          },
        });
      }
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
 * Combines metadata from two providers based on chosen provider per field.
 */
export function mergeBookMetadata(
  kyData: BookMetadata,
  drData: BookMetadata,
  selections?: Record<string, 'kitapyurdu' | 'dr'> | Record<string, string>
): BookMetadata {
  const effectiveSelections = (selections as Record<string, string>) || resolveDefaultSelections(kyData, drData);

  const getChosen = <T>(field: keyof BookMetadata): T | undefined => {
    const source = effectiveSelections[field] || 'kitapyurdu';
    let chosenVal: unknown;
    if (source === drData.provider) {
      chosenVal = drData[field];
    } else if (source === kyData.provider) {
      chosenVal = kyData[field];
    } else if (source === 'dr' && drData.provider === 'dr') {
      chosenVal = drData[field];
    } else if (source === 'kitapyurdu' && kyData.provider === 'kitapyurdu') {
      chosenVal = kyData[field];
    } else if (source === 'dr') {
      chosenVal = drData[field];
    } else {
      chosenVal = kyData[field];
    }

    if (chosenVal !== undefined && chosenVal !== null && chosenVal !== '') {
      return chosenVal as T | undefined;
    }
    const fallback = kyData[field] ?? drData[field];
    return fallback as T | undefined;
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
  const ratingSource = effectiveSelections['rating'];
  const ratingCount =
    (ratingSource === drData.provider || (ratingSource === 'dr' && drData.provider === 'dr')
      ? drData.ratingCount
      : ratingSource === kyData.provider || (ratingSource === 'kitapyurdu' && kyData.provider === 'kitapyurdu')
      ? kyData.ratingCount
      : undefined) ??
    kyData.ratingCount ??
    drData.ratingCount ??
    undefined;
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
