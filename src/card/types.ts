import { App, TFile } from 'obsidian';
import { normalizeToIsbn13 } from './barcode';

export interface KitapCardData {
  title: string;
  originalTitle?: string;
  author: string;
  authorNationality?: string;
  translator?: string;
  publisher: string;
  series?: string;
  isbn: string;
  isbn13: string;
  format: string;
  edition: string;
  pagesRead: number;
  totalPages: number;
  readingPercent: number;
  readingStatus: string;
  rating?: number;
  ratingCount?: number;
  genres: string[];
  coverUrl?: string;
  rawCover?: string;
  deweyCode: string;
  catalogCode: string;
  publishDate?: string;
  dateAdded?: string;
}

/**
 * Safely converts an unknown value to a string without producing '[object Object]'.
 */
export function toSafeString(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return val.toString();
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (typeof obj.name === 'string') return obj.name;
    if (typeof obj.title === 'string') return obj.title;
    if (typeof obj.value === 'string') return obj.value;
    if (typeof obj.label === 'string') return obj.label;
    if (typeof obj.url === 'string') return obj.url;
    if (typeof obj.link === 'string') return obj.link;
  }
  return '';
}

/**
 * Strips wikilink brackets [[...]], ![[...]], aliases [[target|alias]], and markdown links [text](url).
 */
export function cleanWikilink(val: unknown): string {
  if (val == null) return '';
  if (Array.isArray(val)) {
    return val.map(item => cleanWikilink(item)).filter(Boolean).join(', ');
  }
  const str = toSafeString(val).trim();
  if (!str) return '';
  const unquoted = str.replace(/^["']|["']$/g, '').trim();
  return unquoted
    // 1. Markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // 2. Wikilinks ![[target|alias]] or [[target|alias]]
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) => {
      return (alias || target || '').trim();
    })
    .trim();
}

/**
 * Normalizes lists of strings (e.g. genres, tags) from array or comma/newline separated string.
 */
export function cleanStringList(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val
      .map(item => cleanWikilink(item))
      .filter(Boolean);
  }
  if (typeof val === 'string') {
    return val
      .split(/[,;\n]/)
      .map(s => cleanWikilink(s.trim()))
      .filter(Boolean);
  }
  return [];
}

/**
 * Formats an ISBN-13 into standard hyphenated book display format: 978-975-07-3891-3
 */
export function formatIsbnDisplay(isbn: string): string {
  if (!isbn) return '—';
  const clean = isbn.replace(/[^0-9X]/gi, '').toUpperCase();
  if (isbn.includes('-') && (clean.length === 10 || clean.length === 13)) {
    return isbn.trim();
  }
  if (clean.length === 13) {
    // 3 - 3 - 2 - 4 - 1 (Turkish standard) or fallback grouping
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 8)}-${clean.slice(8, 12)}-${clean.slice(12)}`;
  }
  if (clean.length === 10) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 5)}-${clean.slice(5, 9)}-${clean.slice(9)}`;
  }
  return isbn || '—';
}

/**
 * Resolves a book cover path or URL to a renderable image source in Obsidian.
 */
export function resolveCoverUrl(rawCover: unknown, app?: App, sourcePath?: string): string | null {
  let target: unknown = rawCover;
  if (Array.isArray(target)) {
    target = (target as unknown[])[0];
  }
  if (typeof target === 'object' && target !== null) {
    const obj = target as Record<string, unknown>;
    target = obj.url ?? obj.link ?? obj.path ?? obj.name ?? '';
  }
  if (!target || typeof target !== 'string') return null;

  const trimmed = target.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return null;

  // 1. Direct Web URLs or data URIs
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) {
    return trimmed;
  }

  // 2. Wikilink format (![[image.jpg]] or [[image.jpg]])
  const cleanPath = trimmed
    .replace(/^!?\[\[/, '')
    .replace(/\]\]$/, '')
    .split('|')[0]
    .trim();

  if (!cleanPath) return null;

  if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://') || cleanPath.startsWith('data:image/')) {
    return cleanPath;
  }

  // 3. Obsidian Vault Resolution
  if (app?.metadataCache && app?.vault) {
    const file = app.metadataCache.getFirstLinkpathDest(cleanPath, sourcePath || '');
    if (file instanceof TFile) {
      return app.vault.getResourcePath(file);
    }

    const directFile = app.vault.getAbstractFileByPath(cleanPath);
    if (directFile instanceof TFile) {
      return app.vault.getResourcePath(directFile);
    }
  }

  return cleanPath;
}

/**
 * Generates Cutter-Sanborn style 3-letter author code.
 */
function extractAuthorCutter(author: string): string {
  if (!author || author === 'Bilinmeyen Yazar') return 'KIT';
  // Use first author if multiple are listed
  const firstAuthor = author.split(/[,;&]/)[0].trim();
  const clean = firstAuthor.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ\s]/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'KIT';
  // Use last name of first author
  const lastName = words[words.length - 1];
  return lastName.slice(0, 3).toLocaleUpperCase('tr-TR');
}

/**
 * Derives Dewey code and full library catalog code.
 */
export function generateDeweyAndCatalogCode(
  author: string,
  genres: string[],
  publishDate?: string,
  isbn13?: string,
  userDewey?: string,
  userCatalog?: string,
  authorNationality?: string
): { deweyCode: string; catalogCode: string } {
  let dewey = (userDewey || '').trim();

  if (!dewey) {
    const matchPool = [authorNationality, ...genres]
      .filter(Boolean)
      .map(g => String(g).toLocaleLowerCase('tr-TR'))
      .join(' ');

    if (matchPool.includes('türk') || matchPool.includes('turk')) {
      dewey = '894.35';
    } else if (matchPool.includes('alman') || matchPool.includes('avusturya')) {
      dewey = '833.912';
    } else if (matchPool.includes('ingiliz') || matchPool.includes('amerikan')) {
      dewey = '823';
    } else if (matchPool.includes('fransız') || matchPool.includes('fransiz')) {
      dewey = '843';
    } else if (matchPool.includes('rus')) {
      dewey = '891.7';
    } else if (matchPool.includes('felsefe')) {
      dewey = '100';
    } else if (matchPool.includes('tarih')) {
      dewey = '900';
    } else if (matchPool.includes('şiir') || matchPool.includes('siir')) {
      dewey = '894.351';
    } else {
      dewey = '800';
    }
  }

  if (userCatalog && userCatalog.trim()) {
    return { deweyCode: dewey, catalogCode: userCatalog.trim() };
  }

  const cutter = extractAuthorCutter(author);

  // Year extraction
  let year = '';
  if (publishDate) {
    const match = String(publishDate).match(/\b(19\d\d|20\d\d)\b/);
    if (match) year = match[1];
  }
  if (!year) {
    year = String(new Date().getFullYear());
  }

  const accessionSuffix = (isbn13 && isbn13.length >= 4) ? isbn13.slice(-4) : '0001';
  const accession = `ACC-${year}-TR-${accessionSuffix}`;

  const catalogCode = `Dewey: ${dewey} ${cutter} ${year} · ${accession}`;
  return { deweyCode: dewey, catalogCode };
}

/**
 * Normalizes reading status into standard Turkish user labels.
 */
export function normalizeReadingStatus(status: unknown, pagesRead: number, totalPages: number): string {
  if (typeof status === 'string' && status.trim()) {
    const s = status.trim().toLowerCase();
    if (['okunuyor', 'reading', 'devam ediyor', 'devam'].includes(s)) return 'Okunuyor';
    if (['okundu', 'completed', 'read', 'tamamlandı', 'tamamlandi', 'bitti'].includes(s)) return 'Okundu';
    if (['okunacak', 'to-read', 'plan-to-read', 'unread', 'başlanmadı', 'baslanmadi'].includes(s)) return 'Okunacak';
    if (['bırakıldı', 'birakildi', 'dropped', 'abandoned'].includes(s)) return 'Bırakıldı';
    return status.trim();
  }

  if (totalPages > 0 && pagesRead >= totalPages) return 'Okundu';
  if (pagesRead > 0) return 'Okunuyor';
  return 'Okunacak';
}

/**
 * Extracts and normalizes book data from YAML frontmatter and optional overrides.
 */
export function parseCardData(
  frontmatter?: Record<string, unknown> | null,
  options?: { sourcePath?: string; app?: App; overrides?: Record<string, unknown> }
): KitapCardData {
  const fm = frontmatter || {};
  const ovr = options?.overrides || {};

  // Prioritize overrides over frontmatter across multiple alias keys
  const getField = <T = unknown>(...keys: string[]): T | undefined => {
    for (const k of keys) {
      if (ovr[k] !== undefined && ovr[k] !== null && ovr[k] !== '') {
        return ovr[k] as T;
      }
    }
    for (const k of keys) {
      if (fm[k] !== undefined && fm[k] !== null && fm[k] !== '') {
        return fm[k] as T;
      }
    }
    return undefined;
  };

  // 1. Title
  const rawTitle = getField('baslik', 'title', 'name', 'kitap_adi', 'book_title');
  let title = cleanWikilink(rawTitle);
  if (!title && options?.sourcePath) {
    const parts = options.sourcePath.split('/');
    const filename = parts[parts.length - 1] || '';
    title = filename.replace(/\.md$/i, '').trim();
  }
  if (!title) {
    title = 'İsimsiz Kitap';
  }

  // 2. Original Title
  const rawOrigTitle = getField('orijinal_baslik', 'original_title', 'originalTitle', 'ozgun_adi');
  const originalTitle = rawOrigTitle ? cleanWikilink(rawOrigTitle) : undefined;

  // 3. Author & Nationality
  const rawAuthor = getField('yazar', 'author', 'authors', 'yazarlar');
  const author = cleanWikilink(rawAuthor) || 'Bilinmeyen Yazar';

  const rawNat = getField('uyruk', 'nationality', 'yazar_bilgi', 'author_info');
  const authorNationality = rawNat ? cleanWikilink(rawNat) : undefined;

  // 4. Translator
  const rawTrans = getField('cevirmen', 'translator', 'ceviren', 'translators');
  const translator = rawTrans ? cleanWikilink(rawTrans) : undefined;

  // 5. Publisher & Series
  const rawPub = getField('yayinevi', 'publisher', 'yayin_evi', 'yayin');
  const publisher = cleanWikilink(rawPub) || 'Bilinmeyen Yayınevi';

  const rawSeries = getField('dizi', 'series', 'kitap_dizisi');
  const series = rawSeries ? cleanWikilink(rawSeries) : undefined;

  // 6. ISBN & Barcode
  const rawIsbn = getField('isbn', 'isbn13', 'isbn10', 'barkod', 'barcode') ?? '';
  const isbn = toSafeString(rawIsbn).trim();
  const isbn13 = normalizeToIsbn13(isbn);

  // 7. Pages & Progress
  const rawTotal = getField('toplam_sayfa', 'sayfa', 'total_pages', 'pages', 'sayfa_sayisi') ?? 0;
  const totalPages = typeof rawTotal === 'number'
    ? Math.max(0, Math.floor(rawTotal))
    : Math.max(0, parseInt(toSafeString(rawTotal), 10) || 0);

  const rawRead = getField('okunan_sayfa', 'current_page', 'pages_read', 'okunan', 'read_pages') ?? 0;
  let pagesRead = typeof rawRead === 'number'
    ? Math.max(0, Math.floor(rawRead))
    : Math.max(0, parseInt(toSafeString(rawRead), 10) || 0);

  // 8. Reading Status
  const rawStatus = getField('okuma_durumu', 'durum', 'status', 'reading_status');
  const readingStatus = normalizeReadingStatus(rawStatus, pagesRead, totalPages);

  // If status is "Okundu", ensure progress reflects completion
  if (readingStatus === 'Okundu') {
    if (totalPages > 0 && pagesRead === 0) {
      pagesRead = totalPages;
    }
  }

  const readingPercent = totalPages > 0
    ? Math.min(100, Math.max(0, Math.round((pagesRead / totalPages) * 100)))
    : (readingStatus === 'Okundu' ? 100 : (pagesRead > 0 ? 100 : 0));

  // 9. Rating & Count
  const rawRating = getField('puan', 'rating', 'puan_kitapyurdu', 'puan_dr', 'kisisel_puan', 'score');
  let rating: number | undefined;
  if (typeof rawRating === 'number') {
    rating = rawRating;
  } else if (rawRating != null && rawRating !== '') {
    const num = parseFloat(toSafeString(rawRating).replace(',', '.'));
    if (!isNaN(num)) rating = num;
  }

  const rawRatingCount = getField('oy_sayisi', 'rating_count', 'ratingCount', 'degerlendirme_sayisi');
  let ratingCount: number | undefined;
  if (typeof rawRatingCount === 'number') {
    ratingCount = Math.floor(rawRatingCount);
  } else if (rawRatingCount != null && rawRatingCount !== '') {
    const cnt = parseInt(toSafeString(rawRatingCount).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(cnt)) ratingCount = cnt;
  }

  // 10. Format & Edition
  const rawFormat = getField('format', 'cilt', 'binding');
  const rawEdition = getField('baski', 'edition', 'basim');
  const format = rawFormat ? cleanWikilink(rawFormat) : 'Karton Kapak';
  const edition = rawEdition ? cleanWikilink(rawEdition) : 'Standart Baskı';

  // 11. Genres
  const rawGenres = getField('tur', 'genres', 'kategori', 'category', 'etiketler', 'tags');
  const genres = cleanStringList(rawGenres);

  // 12. Publish Date & Date Added
  const rawPubDate = getField('yayin_tarihi', 'publishDate', 'publish_date', 'year', 'yil', 'date');
  const pubDateStr = toSafeString(rawPubDate).trim();
  const publishDate = pubDateStr || undefined;

  const rawAdded = getField('date_added', 'eklenme_tarihi', 'created', 'kayit_tarihi');
  const addedStr = toSafeString(rawAdded).trim();
  const dateAdded = addedStr || undefined;

  // 13. Cover URL
  const rawCover = getField('kapak', 'cover', 'coverUrl', 'image');
  const coverUrl = resolveCoverUrl(rawCover, options?.app, options?.sourcePath) || undefined;
  const rawCoverStr = rawCover != null ? toSafeString(rawCover) : undefined;

  // 14. Dewey & Catalog Code
  const rawDewey = getField('dewey', 'dewey_kodu');
  const rawCatalog = getField('katalog_kodu', 'catalog_code', 'call_number', 'demirbas_no');
  const deweyInput = rawDewey != null ? toSafeString(rawDewey) : undefined;
  const catalogInput = rawCatalog != null ? toSafeString(rawCatalog) : undefined;
  const { deweyCode, catalogCode } = generateDeweyAndCatalogCode(
    author,
    genres,
    publishDate,
    isbn13,
    deweyInput,
    catalogInput,
    authorNationality
  );

  return {
    title,
    originalTitle,
    author,
    authorNationality,
    translator,
    publisher,
    series,
    isbn,
    isbn13,
    format,
    edition,
    pagesRead,
    totalPages,
    readingPercent,
    readingStatus,
    rating,
    ratingCount,
    genres,
    coverUrl,
    rawCover: rawCoverStr,
    deweyCode,
    catalogCode,
    publishDate,
    dateAdded,
  };
}
