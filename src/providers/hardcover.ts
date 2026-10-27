import { BookMetadata, SearchResultItem } from '../types';
import { fetchJson } from '../utils/http';
import { IBookProvider, IHardcoverProvider } from './types';
import { cleanIsbn, isIsbn } from './matcher';

export interface HardcoverAuthor {
  id?: number;
  name?: string;
  slug?: string;
}

export interface HardcoverContribution {
  author?: HardcoverAuthor;
}

export interface HardcoverPublisher {
  id?: number;
  name?: string;
}

export interface HardcoverEdition {
  id?: number;
  title?: string;
  isbn_10?: string;
  isbn_13?: string;
  pages?: number;
  publisher?: HardcoverPublisher;
  image?: { url?: string };
}

export interface HardcoverTag {
  tag?: string;
}

export interface HardcoverTagging {
  tag?: HardcoverTag;
}

export interface HardcoverBook {
  id: number;
  title: string;
  slug?: string;
  description?: string;
  pages?: number;
  release_date?: string;
  release_year?: number;
  rating?: number;
  ratings_count?: number;
  users_count?: number;
  image?: { url?: string };
  cached_contributors?: unknown;
  contributions?: HardcoverContribution[];
  editions?: HardcoverEdition[];
  taggings?: HardcoverTagging[];
}

export interface HardcoverGraphQLResponse<T = unknown> {
  data?: T;
  errors?: { message: string }[];
}

/**
 * Extracts author names from Hardcover contributions or cached_contributors.
 */
export function formatHardcoverAuthors(
  contributions?: HardcoverContribution[],
  cached?: unknown
): string {
  if (Array.isArray(contributions) && contributions.length > 0) {
    const names = contributions
      .map((c) => c.author?.name?.trim())
      .filter((n): n is string => Boolean(n));
    if (names.length > 0) {
      return names.join(', ');
    }
  }

  if (Array.isArray(cached) && cached.length > 0) {
    const names = cached
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (typeof item === 'object' && item !== null && 'name' in item) {
          return String((item as { name?: string }).name || '').trim();
        }
        if (typeof item === 'object' && item !== null && 'author' in item) {
          const auth = (item as { author?: { name?: string } }).author;
          return String(auth?.name || '').trim();
        }
        return '';
      })
      .filter(Boolean);
    if (names.length > 0) {
      return names.join(', ');
    }
  }

  return '';
}

/**
 * Extracts numeric ID, slug, or ISBN from a given Hardcover identifier or URL.
 */
export function extractHardcoverSlugOrId(urlOrId: string): {
  id?: number;
  slug?: string;
  isbn?: string;
} {
  const trimmed = (urlOrId || '').trim();
  if (!trimmed) return {};

  if (isIsbn(trimmed)) {
    return { isbn: cleanIsbn(trimmed) };
  }

  // Pure integer ID
  if (/^\d+$/.test(trimmed)) {
    return { id: parseInt(trimmed, 10) };
  }

  // hardcover:ID format
  const prefixMatch = trimmed.match(/^hardcover:(\d+)$/i);
  if (prefixMatch) {
    return { id: parseInt(prefixMatch[1], 10) };
  }

  // URL matching: https://hardcover.app/books/project-hail-mary or /books/12345
  const urlMatch = trimmed.match(/(?:hardcover\.app\/books\/|^books\/|^\/books\/)([a-zA-Z0-9_-]+)/i);
  if (urlMatch) {
    const segment = urlMatch[1];
    if (/^\d+$/.test(segment)) {
      return { id: parseInt(segment, 10) };
    }
    return { slug: segment };
  }

  // Default slug fallback
  return { slug: trimmed };
}

/**
 * Hardcover Kitap Metaveri Sağlayıcısı
 * api.hardcover.app resmi GraphQL API üzerinden global kitap araması ve metaveri çekimi sağlar.
 */
export class HardcoverProvider implements IBookProvider, IHardcoverProvider {
  readonly id: string = 'hardcover';
  readonly name: string = 'Hardcover';
  private readonly endpoint = 'https://api.hardcover.app/v1/graphql';
  private apiKey: string = '';
  private readonly apiKeyGetter?: () => string | undefined;

  constructor(apiKeyOrGetter?: string | (() => string | undefined)) {
    if (typeof apiKeyOrGetter === 'function') {
      this.apiKeyGetter = apiKeyOrGetter;
    } else if (typeof apiKeyOrGetter === 'string') {
      this.apiKey = apiKeyOrGetter.trim();
    }
  }

  /**
   * API anahtarını günceller.
   */
  setApiKey(key: string): void {
    this.apiKey = (key || '').trim();
  }

  /**
   * Aktif API anahtarını döndürür.
   */
  getApiKey(): string {
    const fromGetter = this.apiKeyGetter?.();
    if (typeof fromGetter === 'string' && fromGetter.trim()) {
      return fromGetter.trim();
    }
    return this.apiKey;
  }

  /**
   * Hardcover GraphQL API üzerinden arama yapar.
   */
  async search(query: string): Promise<SearchResultItem[]> {
    const trimmed = (query || '').trim();
    if (!trimmed) return [];

    const apiKey = this.getApiKey();
    if (!apiKey) {
      console.warn('Hardcover API anahtarı ayarlanmamış.');
      return [];
    }

    const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    };

    try {
      if (isIsbn(trimmed)) {
        return await this.searchByIsbn(cleanIsbn(trimmed), headers);
      }

      return await this.searchByText(trimmed, headers);
    } catch (error) {
      console.error('Hardcover arama hatası:', error);
      return [];
    }
  }

  /**
   * Metin / başlık ile kitap araması yürütür.
   */
  private async searchByText(
    queryText: string,
    headers: Record<string, string>
  ): Promise<SearchResultItem[]> {
    const graphqlQuery = `
      query SearchBooks($searchTerm: String!) {
        books(
          where: { title: { _ilike: $searchTerm } }
          limit: 20
          order_by: { users_count: desc }
        ) {
          id
          title
          slug
          description
          pages
          release_date
          release_year
          rating
          ratings_count
          image {
            url
          }
          cached_contributors
          contributions {
            author {
              name
            }
          }
          editions(limit: 1) {
            isbn_10
            isbn_13
            publisher {
              name
            }
          }
        }
      }
    `;

    const body = JSON.stringify({
      query: graphqlQuery,
      variables: { searchTerm: `%${queryText}%` },
    });

    const response = await fetchJson<
      HardcoverGraphQLResponse<{ books?: HardcoverBook[] }>
    >(this.endpoint, {
      method: 'POST',
      headers,
      contentType: 'application/json',
      body,
    });

    if (response.errors && response.errors.length > 0) {
      console.warn('Hardcover GraphQL hatası:', response.errors[0].message);
      return [];
    }

    const books = response?.data?.books;
    if (!Array.isArray(books)) return [];

    return books.map((book) => this.mapBookToSearchResult(book));
  }

  /**
   * ISBN numarası ile arama yürütür.
   */
  private async searchByIsbn(
    isbn: string,
    headers: Record<string, string>
  ): Promise<SearchResultItem[]> {
    const graphqlQuery = `
      query SearchByISBN($isbn: String!) {
        editions(
          where: {
            _or: [
              { isbn_13: { _eq: $isbn } },
              { isbn_10: { _eq: $isbn } }
            ]
          }
          limit: 10
        ) {
          isbn_10
          isbn_13
          publisher {
            name
          }
          book {
            id
            title
            slug
            description
            pages
            release_date
            release_year
            rating
            ratings_count
            image {
              url
            }
            cached_contributors
            contributions {
              author {
                name
              }
            }
          }
        }
      }
    `;

    const body = JSON.stringify({
      query: graphqlQuery,
      variables: { isbn },
    });

    const response = await fetchJson<
      HardcoverGraphQLResponse<{
        editions?: {
          isbn_10?: string;
          isbn_13?: string;
          publisher?: HardcoverPublisher;
          book?: HardcoverBook;
        }[];
      }>
    >(this.endpoint, {
      method: 'POST',
      headers,
      contentType: 'application/json',
      body,
    });

    const editions = response?.data?.editions;
    if (!Array.isArray(editions)) return [];

    const items: SearchResultItem[] = [];
    const seenIds = new Set<number>();

    for (const ed of editions) {
      if (!ed.book || seenIds.has(ed.book.id)) continue;
      seenIds.add(ed.book.id);

      const bookWithEdition: HardcoverBook = {
        ...ed.book,
        editions: [
          {
            isbn_10: ed.isbn_10,
            isbn_13: ed.isbn_13,
            publisher: ed.publisher,
          },
        ],
      };

      items.push(this.mapBookToSearchResult(bookWithEdition));
    }

    return items;
  }

  /**
   * Hardcover kitap modelini standart SearchResultItem formatına dönüştürür.
   */
  private mapBookToSearchResult(book: HardcoverBook): SearchResultItem {
    const id = String(book.id);
    const title = (book.title || '').trim();
    const author = formatHardcoverAuthors(book.contributions, book.cached_contributors);
    const publisher = book.editions?.[0]?.publisher?.name || '';
    const url = `https://hardcover.app/books/${book.slug || book.id}`;
    const coverUrl = book.image?.url || '';
    const rating =
      typeof book.rating === 'number' && book.rating > 0
        ? Math.round(book.rating * 10) / 10
        : undefined;

    const rawIsbn = book.editions?.[0]?.isbn_13 || book.editions?.[0]?.isbn_10 || '';
    const isbn = rawIsbn ? cleanIsbn(rawIsbn) : undefined;

    return {
      id,
      title,
      author,
      publisher,
      url,
      coverUrl,
      ...(rating !== undefined ? { rating } : {}),
      ...(isbn ? { isbn } : {}),
      provider: 'hardcover',
      providers: ['hardcover'],
      sources: {
        hardcover: {
          id,
          title,
          author,
          publisher,
          url,
          coverUrl,
          rating,
          isbn,
          provider: 'hardcover',
        },
      },
    };
  }

  /**
   * Kitap ID'si, slug'ı veya URL'si ile detaylı metaveri çeker.
   */
  async getBookDetails(urlOrId: string): Promise<BookMetadata> {
    const trimmed = (urlOrId || '').trim();
    if (!trimmed) {
      throw new Error('Geçersiz Hardcover kitap bağlantısı veya ID.');
    }

    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'Hardcover API anahtarı ayarlanmamış. Lütfen eklenti ayarlarından Hardcover API anahtarınızı girin.'
      );
    }

    const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    };

    const parsed = extractHardcoverSlugOrId(trimmed);

    if (parsed.id !== undefined) {
      return this.getBookDetailsById(parsed.id, headers);
    }

    if (parsed.slug) {
      return this.getBookDetailsBySlug(parsed.slug, headers);
    }

    if (parsed.isbn) {
      return this.getBookDetailsByIsbn(parsed.isbn, headers);
    }

    throw new Error(`Hardcover tanımlayıcısı çözümlenemedi: ${trimmed}`);
  }

  /**
   * Numeric ID ile kitap detaylarını çeker.
   */
  private async getBookDetailsById(
    id: number,
    headers: Record<string, string>
  ): Promise<BookMetadata> {
    const graphqlQuery = `
      query GetBookById($id: Int!) {
        books_by_pk(id: $id) {
          id
          title
          slug
          description
          pages
          release_date
          release_year
          rating
          ratings_count
          image {
            url
          }
          cached_contributors
          contributions {
            author {
              name
            }
          }
          taggings {
            tag {
              tag
            }
          }
          editions(limit: 5) {
            id
            isbn_10
            isbn_13
            pages
            publisher {
              name
            }
          }
        }
      }
    `;

    const body = JSON.stringify({
      query: graphqlQuery,
      variables: { id },
    });

    const response = await fetchJson<
      HardcoverGraphQLResponse<{ books_by_pk?: HardcoverBook }>
    >(this.endpoint, {
      method: 'POST',
      headers,
      contentType: 'application/json',
      body,
    });

    const book = response?.data?.books_by_pk;
    if (!book) {
      throw new Error(`Hardcover üzerinde kitap bulunamadı (ID: ${id})`);
    }

    return this.mapBookToMetadata(book);
  }

  /**
   * Slug ile kitap detaylarını çeker.
   */
  private async getBookDetailsBySlug(
    slug: string,
    headers: Record<string, string>
  ): Promise<BookMetadata> {
    const graphqlQuery = `
      query GetBookBySlug($slug: String!) {
        books(where: { slug: { _eq: $slug } }, limit: 1) {
          id
          title
          slug
          description
          pages
          release_date
          release_year
          rating
          ratings_count
          image {
            url
          }
          cached_contributors
          contributions {
            author {
              name
            }
          }
          taggings {
            tag {
              tag
            }
          }
          editions(limit: 5) {
            id
            isbn_10
            isbn_13
            pages
            publisher {
              name
            }
          }
        }
      }
    `;

    const body = JSON.stringify({
      query: graphqlQuery,
      variables: { slug },
    });

    const response = await fetchJson<
      HardcoverGraphQLResponse<{ books?: HardcoverBook[] }>
    >(this.endpoint, {
      method: 'POST',
      headers,
      contentType: 'application/json',
      body,
    });

    const book = response?.data?.books?.[0];
    if (!book) {
      throw new Error(`Hardcover üzerinde kitap bulunamadı (Slug: ${slug})`);
    }

    return this.mapBookToMetadata(book);
  }

  /**
   * ISBN numarası ile kitap detaylarını çeker.
   */
  private async getBookDetailsByIsbn(
    isbn: string,
    headers: Record<string, string>
  ): Promise<BookMetadata> {
    const searchResults = await this.searchByIsbn(isbn, headers);
    if (searchResults.length === 0 || !searchResults[0].id) {
      throw new Error(`Hardcover üzerinde bu ISBN ile kitap bulunamadı: ${isbn}`);
    }

    const id = parseInt(searchResults[0].id, 10);
    return this.getBookDetailsById(id, headers);
  }

  /**
   * HardcoverBook nesnesini BookMetadata modeline eşler.
   */
  private mapBookToMetadata(book: HardcoverBook): BookMetadata {
    const id = String(book.id);
    const title = (book.title || '').trim();
    const author = formatHardcoverAuthors(book.contributions, book.cached_contributors);

    const firstEdition = book.editions?.[0];
    const publisher = firstEdition?.publisher?.name || '';
    const url = `https://hardcover.app/books/${book.slug || book.id}`;
    const coverUrl = book.image?.url || '';
    const description = book.description?.trim() || undefined;

    const pages = book.pages || firstEdition?.pages || undefined;
    const publishDate =
      book.release_date || (book.release_year ? String(book.release_year) : undefined);

    const rawIsbn = firstEdition?.isbn_13 || firstEdition?.isbn_10 || '';
    const isbn = rawIsbn ? cleanIsbn(rawIsbn) : '';

    const rating =
      typeof book.rating === 'number' && book.rating > 0
        ? Math.round(book.rating * 10) / 10
        : undefined;
    const ratingCount = book.ratings_count || undefined;

    const genres = Array.isArray(book.taggings)
      ? book.taggings
          .map((t) => t.tag?.tag?.trim())
          .filter((t): t is string => Boolean(t))
          .slice(0, 10)
      : undefined;

    return {
      id,
      url,
      title,
      author,
      publisher,
      isbn,
      ...(pages !== undefined && pages > 0 ? { pages } : {}),
      ...(publishDate ? { publishDate } : {}),
      coverUrl,
      ...(description ? { description } : {}),
      ...(rating !== undefined ? { rating } : {}),
      ...(ratingCount !== undefined ? { ratingCount } : {}),
      ...(genres && genres.length > 0 ? { genres } : {}),
      provider: 'hardcover',
    };
  }
}
