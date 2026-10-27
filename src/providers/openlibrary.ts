import { BookMetadata, SearchResultItem } from '../types';
import { fetchJson } from '../utils/http';
import { IBookProvider, IOpenLibraryProvider } from './types';
import { cleanIsbn, isIsbn } from './matcher';

export interface OpenLibrarySearchDoc {
  key: string;
  title?: string;
  author_name?: string[];
  publisher?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
  subject?: string[];
  number_of_pages_median?: number;
  number_of_pages?: number;
  ratings_average?: number;
  ratings_count?: number;
  language?: string[];
}

export interface OpenLibrarySearchResponse {
  numFound?: number;
  docs?: OpenLibrarySearchDoc[];
}

export interface OpenLibraryWorkResponse {
  title?: string;
  key?: string;
  description?: string | { type?: string; value?: string };
  covers?: number[];
  subjects?: string[];
  subject_places?: string[];
  authors?: { author?: { key?: string }; type?: { key?: string }; key?: string }[];
  first_publish_date?: string;
}

export interface OpenLibraryBookResponse {
  title?: string;
  key?: string;
  description?: string | { type?: string; value?: string };
  covers?: number[];
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  pagination?: string;
  isbn_10?: string[];
  isbn_13?: string[];
  works?: { key?: string }[];
  authors?: { key?: string }[];
  subjects?: string[];
  languages?: { key?: string }[];
}

export interface OpenLibraryAuthorResponse {
  name?: string;
  personal_name?: string;
  key?: string;
}

/**
 * Normalizes OpenLibrary keys from full URLs, relative paths, or raw identifiers.
 */
export function cleanOpenLibraryKey(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return '';

  let path = trimmed;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      path = new URL(path).pathname;
    } catch {
      path = trimmed.replace(/^https?:\/\/[^/]+/i, '');
    }
  }

  // Remove .json extension if present
  path = path.replace(/\.json$/i, '');

  // Strip trailing slashes
  path = path.replace(/\/+$/, '');

  const workMatch = path.match(/\/(works)\/(OL\d+W)(?:\/.*)?$/i);
  if (workMatch) {
    return `/works/${workMatch[2].toUpperCase()}`;
  }

  const bookMatch = path.match(/\/(books)\/(OL\d+M)(?:\/.*)?$/i);
  if (bookMatch) {
    return `/books/${bookMatch[2].toUpperCase()}`;
  }

  const authorMatch = path.match(/\/(authors)\/(OL\d+A)(?:\/.*)?$/i);
  if (authorMatch) {
    return `/authors/${authorMatch[2].toUpperCase()}`;
  }

  const isbnMatch = path.match(/\/(isbn)\/([0-9X-]+)(?:\/.*)?$/i);
  if (isbnMatch) {
    return `/isbn/${cleanIsbn(isbnMatch[2])}`;
  }

  if (path.startsWith('/works/') || path.startsWith('/books/') || path.startsWith('/authors/') || path.startsWith('/isbn/')) {
    return path;
  }

  if (/^OL\d+W$/i.test(path)) {
    return `/works/${path.toUpperCase()}`;
  }

  if (/^OL\d+M$/i.test(path)) {
    return `/books/${path.toUpperCase()}`;
  }

  if (/^OL\d+A$/i.test(path)) {
    return `/authors/${path.toUpperCase()}`;
  }

  if (isIsbn(path)) {
    return `/isbn/${cleanIsbn(path)}`;
  }

  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Extracts a readable string description from OpenLibrary description formats.
 */
export function pickOpenLibraryDescription(desc: unknown): string | undefined {
  if (!desc) return undefined;
  if (typeof desc === 'string') {
    const trimmed = desc.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof desc === 'object' && desc !== null && 'value' in desc) {
    const val = (desc as { value?: unknown }).value;
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  return undefined;
}

/**
 * Generates high-resolution cover image URL from OpenLibrary cover ID.
 */
export function extractOpenLibraryCoverUrl(coverId?: number): string | undefined {
  if (typeof coverId === 'number' && coverId > 0) {
    return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
  }
  return undefined;
}

/**
 * OpenLibrary Kitap Metaveri Sağlayıcısı
 * openlibrary.org resmi REST API üzerinden global kitap araması ve metaveri çekimi sağlar.
 */
export class OpenLibraryProvider implements IBookProvider, IOpenLibraryProvider {
  readonly id: string = 'openlibrary';
  readonly name: string = 'OpenLibrary';
  private readonly baseUrl = 'https://openlibrary.org';

  /**
   * OpenLibrary search.json uç noktası üzerinden arama yapar.
   */
  async search(query: string): Promise<SearchResultItem[]> {
    const trimmed = (query || '').trim();
    if (!trimmed) return [];

    const searchQuery = isIsbn(trimmed) ? cleanIsbn(trimmed) : trimmed;
    const url = `${this.baseUrl}/search.json?q=${encodeURIComponent(
      searchQuery
    )}&limit=20&fields=key,title,author_name,publisher,first_publish_year,cover_i,subject,number_of_pages_median,number_of_pages,ratings_average,ratings_count,isbn,language`;

    try {
      const response = await fetchJson<OpenLibrarySearchResponse>(url);
      return this.parseSearchResults(response);
    } catch (error) {
      console.error('OpenLibrary arama hatası:', error);
      return [];
    }
  }

  /**
   * Search yanıtını ayrıştırarak standart SearchResultItem listesine dönüştürür.
   */
  parseSearchResults(response: OpenLibrarySearchResponse): SearchResultItem[] {
    const docs = response?.docs;
    if (!Array.isArray(docs)) return [];

    const items: SearchResultItem[] = [];

    for (const doc of docs) {
      if (!doc || !doc.key) continue;

      const key = cleanOpenLibraryKey(doc.key);
      const title = (doc.title || '').trim();
      if (!title) continue;

      const author = Array.isArray(doc.author_name)
        ? doc.author_name.join(', ').trim()
        : '';
      const publisher = Array.isArray(doc.publisher) && doc.publisher.length > 0
        ? doc.publisher[0].trim()
        : '';
      const coverUrl = extractOpenLibraryCoverUrl(doc.cover_i) || '';
      const rating =
        typeof doc.ratings_average === 'number' && doc.ratings_average > 0
          ? Math.round(doc.ratings_average * 10) / 10
          : undefined;

      const isbn13 = doc.isbn?.find((i) => cleanIsbn(i).length === 13);
      const isbn10 = doc.isbn?.find((i) => cleanIsbn(i).length === 10);
      const isbn = isbn13 || isbn10 || doc.isbn?.[0] || '';

      const item: SearchResultItem = {
        id: key,
        title,
        author,
        publisher,
        url: `${this.baseUrl}${key}`,
        coverUrl,
        ...(rating !== undefined ? { rating } : {}),
        ...(isbn ? { isbn: cleanIsbn(isbn) } : {}),
        provider: 'openlibrary',
        providers: ['openlibrary'],
        sources: {
          openlibrary: {
            id: key,
            title,
            author,
            publisher,
            url: `${this.baseUrl}${key}`,
            coverUrl,
            rating,
            isbn: cleanIsbn(isbn),
            provider: 'openlibrary',
          },
        },
      };

      items.push(item);
    }

    return items;
  }

  /**
   * OpenLibrary üzerinden kitap detaylarını çeker.
   * Works, Books (Edition) veya ISBN kayıtlarını destekler.
   */
  async getBookDetails(urlOrId: string): Promise<BookMetadata> {
    const trimmed = (urlOrId || '').trim();
    if (!trimmed) {
      throw new Error('Geçersiz OpenLibrary kitap bağlantısı veya ID.');
    }

    const key = cleanOpenLibraryKey(trimmed);

    // 1. ISBN ile doğrudan getirme
    if (key.startsWith('/isbn/')) {
      const isbn = key.replace(/^\/isbn\//, '');
      return this.getBookDetailsByIsbn(isbn);
    }

    // 2. Edition (/books/OL...M) ile getirme
    if (key.startsWith('/books/')) {
      return this.getBookDetailsByEditionKey(key);
    }

    // 3. Work (/works/OL...W) ile getirme
    return this.getBookDetailsByWorkKey(key);
  }

  /**
   * ISBN numarası ile kitap detaylarını çeker.
   */
  private async getBookDetailsByIsbn(isbn: string): Promise<BookMetadata> {
    const clean = cleanIsbn(isbn);
    const url = `${this.baseUrl}/isbn/${clean}.json`;
    const bookData = await fetchJson<OpenLibraryBookResponse>(url);
    return this.mapEditionToMetadata(bookData, `/isbn/${clean}`);
  }

  /**
   * Edition (/books/OL...M) verilerini BookMetadata'ya dönüştürür.
   */
  private async getBookDetailsByEditionKey(editionKey: string): Promise<BookMetadata> {
    const url = `${this.baseUrl}${editionKey}.json`;
    const bookData = await fetchJson<OpenLibraryBookResponse>(url);
    return this.mapEditionToMetadata(bookData, editionKey);
  }

  /**
   * Work (/works/OL...W) verilerini BookMetadata'ya dönüştürür.
   */
  private async getBookDetailsByWorkKey(workKey: string): Promise<BookMetadata> {
    const url = `${this.baseUrl}${workKey}.json`;
    const workData = await fetchJson<OpenLibraryWorkResponse>(url);

    const title = (workData.title || '').trim();
    const description = pickOpenLibraryDescription(workData.description);
    const coverUrl =
      Array.isArray(workData.covers) && workData.covers.length > 0
        ? extractOpenLibraryCoverUrl(workData.covers[0]) || ''
        : '';
    const genres = Array.isArray(workData.subjects)
      ? workData.subjects.slice(0, 10).map((s) => s.trim()).filter(Boolean)
      : undefined;

    // Yazar isimlerini çekmeyi dene
    let author = '';
    if (Array.isArray(workData.authors) && workData.authors.length > 0) {
      const authorPromises = workData.authors.slice(0, 3).map(async (a) => {
        const aKey = a.author?.key || a.key;
        if (!aKey) return '';
        try {
          const aData = await fetchJson<OpenLibraryAuthorResponse>(
            `${this.baseUrl}${aKey.startsWith('/') ? aKey : '/' + aKey}.json`
          );
          return aData.name || aData.personal_name || '';
        } catch {
          return '';
        }
      });
      const names = (await Promise.all(authorPromises)).filter(Boolean);
      author = names.join(', ');
    }

    // Work kaydına ait ek bibliyografik verileri (yayıncı, sayfa, isbn vb.)
    // arama servisi üzerinden çekerek tamamla
    let publisher = '';
    let isbn = '';
    let pages: number | undefined;
    let publishDate = workData.first_publish_date || undefined;
    let rating: number | undefined;
    let ratingCount: number | undefined;
    let language: string | undefined;

    try {
      const searchUrl = `${this.baseUrl}/search.json?q=key:${encodeURIComponent(
        workKey
      )}&limit=1&fields=publisher,isbn,number_of_pages_median,number_of_pages,first_publish_year,ratings_average,ratings_count,language,author_name`;
      const searchRes = await fetchJson<OpenLibrarySearchResponse>(searchUrl);
      const doc = searchRes?.docs?.[0];
      if (doc) {
        if (!author && Array.isArray(doc.author_name)) {
          author = doc.author_name.join(', ').trim();
        }
        if (Array.isArray(doc.publisher) && doc.publisher.length > 0) {
          publisher = doc.publisher[0].trim();
        }
        const isbn13 = doc.isbn?.find((i) => cleanIsbn(i).length === 13);
        const isbn10 = doc.isbn?.find((i) => cleanIsbn(i).length === 10);
        isbn = isbn13 || isbn10 || doc.isbn?.[0] || '';
        pages = doc.number_of_pages_median || doc.number_of_pages || undefined;
        if (!publishDate && doc.first_publish_year) {
          publishDate = String(doc.first_publish_year);
        }
        if (typeof doc.ratings_average === 'number' && doc.ratings_average > 0) {
          rating = Math.round(doc.ratings_average * 10) / 10;
        }
        if (typeof doc.ratings_count === 'number' && doc.ratings_count > 0) {
          ratingCount = doc.ratings_count;
        }
        if (Array.isArray(doc.language) && doc.language.length > 0) {
          language = doc.language[0].toUpperCase();
        }
      }
    } catch {
      // Arama zenginleştirmesi başarısız olsa bile eldeki temel verilerle devam et
    }

    return {
      id: workKey,
      url: `${this.baseUrl}${workKey}`,
      title,
      author,
      publisher,
      isbn: cleanIsbn(isbn),
      ...(pages !== undefined && pages > 0 ? { pages } : {}),
      ...(publishDate ? { publishDate } : {}),
      coverUrl,
      ...(description ? { description } : {}),
      ...(rating !== undefined ? { rating } : {}),
      ...(ratingCount !== undefined ? { ratingCount } : {}),
      ...(genres && genres.length > 0 ? { genres } : {}),
      ...(language ? { language } : {}),
      provider: 'openlibrary',
    };
  }

  /**
   * Edition JSON nesnesini BookMetadata modeline eşler.
   */
  private async mapEditionToMetadata(
    bookData: OpenLibraryBookResponse,
    key: string
  ): Promise<BookMetadata> {
    const title = (bookData.title || '').trim();
    let description = pickOpenLibraryDescription(bookData.description);
    const publisher =
      Array.isArray(bookData.publishers) && bookData.publishers.length > 0
        ? bookData.publishers[0].trim()
        : '';
    const publishDate = bookData.publish_date || undefined;

    let pages: number | undefined;
    if (typeof bookData.number_of_pages === 'number' && bookData.number_of_pages > 0) {
      pages = bookData.number_of_pages;
    } else if (bookData.pagination) {
      const parsed = parseInt(bookData.pagination, 10);
      if (!isNaN(parsed) && parsed > 0) {
        pages = parsed;
      }
    }

    const isbn13 = bookData.isbn_13?.[0];
    const isbn10 = bookData.isbn_10?.[0];
    const rawIsbn =
      isbn13 ||
      isbn10 ||
      (key.startsWith('/isbn/') ? key.replace(/^\/isbn\//, '') : '');

    const coverUrl =
      Array.isArray(bookData.covers) && bookData.covers.length > 0
        ? extractOpenLibraryCoverUrl(bookData.covers[0]) || ''
        : '';

    // Yazar isimlerini çekmeyi dene
    let author = '';
    if (Array.isArray(bookData.authors) && bookData.authors.length > 0) {
      const authorPromises = bookData.authors.slice(0, 3).map(async (a) => {
        const aKey = a.key;
        if (!aKey) return '';
        try {
          const aData = await fetchJson<OpenLibraryAuthorResponse>(
            `${this.baseUrl}${aKey.startsWith('/') ? aKey : '/' + aKey}.json`
          );
          return aData.name || aData.personal_name || '';
        } catch {
          return '';
        }
      });
      const names = (await Promise.all(authorPromises)).filter(Boolean);
      author = names.join(', ');
    }

    // Eğer açıklama veya yazar bilgisi edition'da yoksa ve works referansı varsa Work kaydından tamamla
    if ((!description || !author) && Array.isArray(bookData.works) && bookData.works.length > 0) {
      const workKeyRef = bookData.works[0]?.key;
      if (workKeyRef) {
        try {
          const workPath = cleanOpenLibraryKey(workKeyRef);
          const workData = await fetchJson<OpenLibraryWorkResponse>(
            `${this.baseUrl}${workPath}.json`
          );
          if (!description) {
            description = pickOpenLibraryDescription(workData.description);
          }
          if (!author && Array.isArray(workData.authors) && workData.authors.length > 0) {
            const authorPromises = workData.authors.slice(0, 3).map(async (a) => {
              const aKey = a.author?.key || a.key;
              if (!aKey) return '';
              try {
                const aData = await fetchJson<OpenLibraryAuthorResponse>(
                  `${this.baseUrl}${aKey.startsWith('/') ? aKey : '/' + aKey}.json`
                );
                return aData.name || aData.personal_name || '';
              } catch {
                return '';
              }
            });
            const names = (await Promise.all(authorPromises)).filter(Boolean);
            author = names.join(', ');
          }
        } catch {
          // Work zenginleştirmesi başarısız olursa mevcut verilerle devam et
        }
      }
    }

    const genres = Array.isArray(bookData.subjects)
      ? bookData.subjects.slice(0, 10).map((s) => s.trim()).filter(Boolean)
      : undefined;

    const language =
      Array.isArray(bookData.languages) && bookData.languages.length > 0
        ? bookData.languages[0].key?.replace(/^\/languages\//, '').toUpperCase()
        : undefined;

    const canonicalKey = bookData.key ? cleanOpenLibraryKey(bookData.key) : key;

    return {
      id: canonicalKey,
      url: `${this.baseUrl}${canonicalKey}`,
      title,
      author,
      publisher,
      isbn: cleanIsbn(rawIsbn),
      ...(pages !== undefined && pages > 0 ? { pages } : {}),
      ...(publishDate ? { publishDate } : {}),
      coverUrl,
      ...(description ? { description } : {}),
      ...(genres && genres.length > 0 ? { genres } : {}),
      ...(language ? { language } : {}),
      provider: 'openlibrary',
    };
  }
}
