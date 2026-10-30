/**
 * obsidian-kitap - Controlled Optional Provider Enrichment Service (Milestone 4 — R4)
 * Enriches Goodreads CSV books with missing cover URLs and bibliographic metadata
 * via active providers (Kitapyurdu, D&R, OpenLibrary, Hardcover) with rate limiting
 * and graceful fallback.
 * Zero external runtime dependencies. Zero `: any` or `as any` casts.
 */

import type { BookMetadata, KitapPluginSettings, SearchResultItem } from '../types';
import type { IBookAggregator } from '../providers/aggregator';
import type { ParsedGoodreadsBook } from './types';

export const DEFAULT_ENRICHMENT_DELAY_MS = 350;

/**
 * Merges enriched metadata from an external provider into a CSV-parsed book non-destructively.
 * Preserves CSV fields that are already populated while filling in missing covers and details.
 */
export function mergeEnrichedMetadata(
  csvBook: ParsedGoodreadsBook,
  providerMeta: Partial<BookMetadata>
): ParsedGoodreadsBook {
  const base = csvBook.metadata;

  const isPlaceholderOriginalTitle =
    typeof base.originalTitle === 'string' && /^\(\d{1,4}\)$/.test(base.originalTitle.trim());

  const mergedMetadata: BookMetadata = {
    ...base,
    title: base.title || providerMeta.title || csvBook.cleanTitle,
    author:
      base.author && base.author !== 'Bilinmeyen Yazar'
        ? base.author
        : providerMeta.author || base.author,
    publisher: base.publisher || providerMeta.publisher || '',
    translator: base.translator || providerMeta.translator,
    isbn: base.isbn || providerMeta.isbn || '',
    pages: base.pages !== undefined && base.pages > 0 ? base.pages : providerMeta.pages,
    publishDate: base.publishDate || providerMeta.publishDate,
    coverUrl: base.coverUrl || providerMeta.coverUrl,
    rating: base.rating !== undefined && base.rating > 0 ? base.rating : providerMeta.rating,
    ratingCount: base.ratingCount ?? providerMeta.ratingCount,
    description: base.description || providerMeta.description,
    url: base.url || providerMeta.url || '',
    readingStatus: csvBook.readingStatus || base.readingStatus,
    price: base.price || providerMeta.price,
    format: base.format || providerMeta.format,
    genres:
      base.genres && base.genres.length > 0
        ? base.genres
        : providerMeta.genres && providerMeta.genres.length > 0
        ? providerMeta.genres
        : base.genres,
    originalTitle: isPlaceholderOriginalTitle
      ? providerMeta.originalTitle || base.originalTitle
      : base.originalTitle || providerMeta.originalTitle,
    language: base.language || providerMeta.language,
    provider: providerMeta.provider || base.provider,
  };

  return {
    ...csvBook,
    metadata: mergedMetadata,
  };
}

/**
 * Controlled optional provider enrichment service with rate-limiting and abort support.
 */
export class GoodreadsEnrichmentService {
  private readonly aggregator?: IBookAggregator;
  private readonly settings?: KitapPluginSettings;
  private readonly minDelayMs: number;
  private lastRequestTimestamp = 0;

  constructor(
    aggregator?: IBookAggregator,
    settings?: KitapPluginSettings,
    minDelayMs: number = DEFAULT_ENRICHMENT_DELAY_MS
  ) {
    this.aggregator = aggregator;
    this.settings = settings;
    this.minDelayMs = Math.max(0, minDelayMs);
  }

  /**
   * Waits if needed to enforce the minimum delay between consecutive provider requests.
   * Respects AbortSignal for immediate cancellation.
   */
  private async waitForRateLimit(signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) {
      return false;
    }

    const now = Date.now();
    const elapsed = now - this.lastRequestTimestamp;
    const remaining = this.lastRequestTimestamp > 0 ? this.minDelayMs - elapsed : 0;

    if (remaining > 0) {
      const completed = await new Promise<boolean>((resolve) => {
        const timer = window.setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve(true);
        }, remaining);

        const onAbort = (): void => {
          window.clearTimeout(timer);
          resolve(false);
        };

        if (signal) {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      });

      if (!completed || signal?.aborted) {
        return false;
      }
    }

    this.lastRequestTimestamp = Date.now();
    return true;
  }

  /**
   * Builds ordered candidate search queries for a book:
   * 1. ISBN-13
   * 2. ISBN-10
   * 3. Clean Title + Author
   */
  private buildSearchQueries(book: ParsedGoodreadsBook): string[] {
    const queries: string[] = [];

    const isbn13 = book.isbn13?.trim();
    if (isbn13) {
      queries.push(isbn13);
    }

    const isbn10 = book.isbn10?.trim();
    if (isbn10 && isbn10 !== isbn13) {
      queries.push(isbn10);
    }

    const primaryIsbn = book.metadata.isbn?.trim();
    if (primaryIsbn && !queries.includes(primaryIsbn)) {
      queries.push(primaryIsbn);
    }

    const title = (book.cleanTitle || book.metadata.title || '').trim();
    const author =
      book.metadata.author && book.metadata.author !== 'Bilinmeyen Yazar'
        ? book.metadata.author.split(',')[0].trim()
        : '';

    const titleAuthorQuery = author ? `${title} ${author}`.trim() : title;
    if (titleAuthorQuery && !queries.includes(titleAuthorQuery)) {
      queries.push(titleAuthorQuery);
    }

    return queries;
  }

  /**
   * Queries active providers for missing cover URL and bibliographic metadata.
   * Never throws; falls back gracefully to the original CSV book on any failure.
   */
  async enrichBook(
    book: ParsedGoodreadsBook,
    signal?: AbortSignal
  ): Promise<ParsedGoodreadsBook> {
    if (!this.aggregator || signal?.aborted) {
      return book;
    }

    const queries = this.buildSearchQueries(book);
    if (queries.length === 0) {
      return book;
    }

    const providerId = this.settings?.defaultProvider;

    for (const query of queries) {
      if (signal?.aborted) {
        return book;
      }

      const canProceed = await this.waitForRateLimit(signal);
      if (!canProceed || signal?.aborted) {
        return book;
      }

      try {
        const results = await this.aggregator.search(query, providerId);
        if (signal?.aborted) {
          return book;
        }

        if (Array.isArray(results) && results.length > 0) {
          const match: SearchResultItem = results[0];
          const detailsData = await this.resolveBookDetails(match, signal);
          if (signal?.aborted) {
            return book;
          }
          return mergeEnrichedMetadata(book, detailsData);
        }
      } catch {
        // Continue to next fallback query or return original CSV book
      }
    }

    return book;
  }

  /**
   * Fetches full details for a matched search result item, falling back to search item fields if details fail.
   */
  private async resolveBookDetails(
    item: SearchResultItem,
    signal?: AbortSignal
  ): Promise<Partial<BookMetadata>> {
    if (!this.aggregator || typeof this.aggregator.getFullBookData !== 'function') {
      return {
        title: item.title,
        author: item.author,
        publisher: item.publisher,
        isbn: item.isbn,
        coverUrl: item.coverUrl,
        url: item.url,
        provider: item.provider,
      };
    }

    if (signal?.aborted) {
      return {};
    }

    try {
      const fullData = await this.aggregator.getFullBookData(item, this.settings);
      return {
        ...fullData,
        coverUrl: fullData.coverUrl || item.coverUrl,
        publisher: fullData.publisher || item.publisher || '',
        isbn: fullData.isbn || item.isbn || '',
      };
    } catch {
      return {
        title: item.title,
        author: item.author,
        publisher: item.publisher,
        isbn: item.isbn,
        coverUrl: item.coverUrl,
        url: item.url,
        provider: item.provider,
      };
    }
  }
}
