import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GoodreadsEnrichmentService,
  mergeEnrichedMetadata,
  DEFAULT_ENRICHMENT_DELAY_MS,
} from '../../src/goodreads/enrichmentService';
import { mapGoodreadsRow } from '../../src/goodreads/mapper';
import { DEFAULT_SETTINGS, type BookMetadata, type SearchResultItem } from '../../src/types';
import type { IBookAggregator } from '../../src/providers/aggregator';
import type { GoodreadsRawRow } from '../../src/goodreads/types';

function createSampleRow(overrides: Partial<GoodreadsRawRow> = {}): GoodreadsRawRow {
  return {
    bookId: '101',
    title: 'Sabırsız Yürek',
    author: 'Stefan Zweig',
    isbn: '="9750738910"',
    isbn13: '="9789750738913"',
    myRating: '5',
    averageRating: '4.35',
    publisher: '',
    binding: 'Paperback',
    numberOfPages: '368',
    yearPublished: '2018',
    originalPublicationYear: '1939',
    dateRead: '2025/11/10',
    dateAdded: '2025/11/01',
    bookshelves: 'klasikler, roman',
    exclusiveShelf: 'read',
    myReview: 'Muazzam bir psikolojik roman.',
    ...overrides,
  };
}

describe('GoodreadsEnrichmentService & mergeEnrichedMetadata (Milestone 4)', () => {
  let mockAggregator: IBookAggregator;
  let searchMock: ReturnType<typeof vi.fn<IBookAggregator['search']>>;
  let getFullBookDataMock: ReturnType<typeof vi.fn<IBookAggregator['getFullBookData']>>;

  beforeEach(() => {
    searchMock = vi.fn<IBookAggregator['search']>().mockResolvedValue([]);
    getFullBookDataMock = vi.fn<IBookAggregator['getFullBookData']>();

    mockAggregator = {
      search: searchMock,
      getFullBookData: getFullBookDataMock,
      getProvider: vi.fn<IBookAggregator['getProvider']>(),
      registerProvider: vi.fn<IBookAggregator['registerProvider']>(),
      getAvailableProviders: vi.fn<IBookAggregator['getAvailableProviders']>().mockReturnValue([]),
      setDefaultProvider: vi.fn<IBookAggregator['setDefaultProvider']>(),
      getDefaultProviderId: vi.fn<IBookAggregator['getDefaultProviderId']>().mockReturnValue('hybrid'),
    };
  });

  describe('mergeEnrichedMetadata', () => {
    it('fills missing coverUrl, publisher, translator, description, and originalTitle while preserving CSV values', () => {
      const parsed = mapGoodreadsRow(createSampleRow(), DEFAULT_SETTINGS);
      expect(parsed.metadata.coverUrl).toBeUndefined();
      expect(parsed.metadata.publisher).toBe('');

      const providerData: Partial<BookMetadata> = {
        title: 'Sabırsız Yürek (Sağlayıcı)',
        author: 'Stefan Zweig (Sağlayıcı)',
        publisher: 'Can Yayınları',
        translator: 'Gülperi Sert',
        coverUrl: 'https://img.kitapyurdu.com/sabirsiz-yurek.jpg',
        description: 'Stefan Zweig tek uzun romanı.',
        originalTitle: 'Ungeduld des Herzens',
        language: 'Türkçe',
        pages: 400,
        rating: 4.9,
      };

      const merged = mergeEnrichedMetadata(parsed, providerData);

      // Enriched missing fields
      expect(merged.metadata.coverUrl).toBe('https://img.kitapyurdu.com/sabirsiz-yurek.jpg');
      expect(merged.metadata.publisher).toBe('Can Yayınları');
      expect(merged.metadata.translator).toBe('Gülperi Sert');
      expect(merged.metadata.description).toBe('Stefan Zweig tek uzun romanı.');
      expect(merged.metadata.originalTitle).toBe('Ungeduld des Herzens');
      expect(merged.metadata.language).toBe('Türkçe');

      // Preserved existing CSV fields
      expect(merged.metadata.title).toBe('Sabırsız Yürek');
      expect(merged.metadata.author).toBe('Stefan Zweig');
      expect(merged.metadata.pages).toBe(368);
      expect(merged.metadata.rating).toBe(4.35);
      expect(merged.userRating).toBe(5);
      expect(merged.dateReadIso).toBe('2025-11-10');
      expect(merged.readingStatus).toBe('Okundu');
    });

    it('normalizes ISO language codes (TUR -> Türkçe, ENG -> İngilizce) while leaving unknown values untouched', () => {
      const turkish = mapGoodreadsRow(createSampleRow(), DEFAULT_SETTINGS);
      turkish.metadata.language = 'TUR';
      expect(mergeEnrichedMetadata(turkish, {}).metadata.language).toBe('Türkçe');

      // Sağlayıcıdan gelen kod da normalize edilir (CSV'de dil alanı yok).
      const fromProvider = mapGoodreadsRow(createSampleRow(), DEFAULT_SETTINGS);
      expect(fromProvider.metadata.language).toBeUndefined();
      expect(mergeEnrichedMetadata(fromProvider, { language: 'ENG' }).metadata.language).toBe(
        'İngilizce'
      );

      const alreadyLabeled = mapGoodreadsRow(createSampleRow(), DEFAULT_SETTINGS);
      alreadyLabeled.metadata.language = 'Türkçe';
      expect(mergeEnrichedMetadata(alreadyLabeled, {}).metadata.language).toBe('Türkçe');

      const unknown = mapGoodreadsRow(createSampleRow(), DEFAULT_SETTINGS);
      unknown.metadata.language = 'Klingon';
      expect(mergeEnrichedMetadata(unknown, {}).metadata.language).toBe('Klingon');
    });

    it('falls back to Goodreads additionalAuthors as translator when CSV has no translator', () => {
      const parsed = mapGoodreadsRow(
        createSampleRow({ additionalAuthors: 'Dost Körpe' }),
        DEFAULT_SETTINGS
      );
      expect(parsed.metadata.translator).toBeUndefined();

      const merged = mergeEnrichedMetadata(parsed, { author: 'Frank Herbert' });
      expect(merged.metadata.translator).toBe('Dost Körpe');
    });

    it('does not use additionalAuthors as translator when the provider author already includes that person', () => {
      const parsed = mapGoodreadsRow(
        createSampleRow({ additionalAuthors: 'Dost Körpe' }),
        DEFAULT_SETTINGS
      );

      const merged = mergeEnrichedMetadata(parsed, {
        author: 'Frank Herbert, Dost Körpe',
      });
      expect(merged.metadata.translator).toBeUndefined();
    });
  });

  describe('enrichBook query strategy & fallback', () => {
    it('queries by ISBN-13 first and merges full book details', async () => {
      const parsed = mapGoodreadsRow(createSampleRow(), DEFAULT_SETTINGS);
      const searchItem: SearchResultItem = {
        id: 'ky-1',
        title: 'Sabırsız Yürek',
        author: 'Stefan Zweig',
        publisher: 'Can Yayınları',
        isbn: '9789750738913',
        url: 'https://www.kitapyurdu.com/kitap/sabirsiz-yurek/1.html',
        coverUrl: 'https://img.kitapyurdu.com/cover.jpg',
        provider: 'kitapyurdu',
      };

      searchMock.mockResolvedValueOnce([searchItem]);
      getFullBookDataMock.mockResolvedValueOnce({
        ...searchItem,
        isbn: '9789750738913',
        translator: 'Gülperi Sert',
        description: 'Detaylı açıklama',
      });

      const service = new GoodreadsEnrichmentService(mockAggregator, DEFAULT_SETTINGS, 0);
      const enriched = await service.enrichBook(parsed);

      expect(searchMock).toHaveBeenCalledTimes(1);
      expect(searchMock).toHaveBeenCalledWith('9789750738913', DEFAULT_SETTINGS.defaultProvider);
      expect(getFullBookDataMock).toHaveBeenCalledTimes(1);
      expect(enriched.metadata.coverUrl).toBe('https://img.kitapyurdu.com/cover.jpg');
      expect(enriched.metadata.publisher).toBe('Can Yayınları');
      expect(enriched.metadata.translator).toBe('Gülperi Sert');
    });

    it('falls back to title + author query when ISBN search returns empty', async () => {
      const parsed = mapGoodreadsRow(
        createSampleRow({ isbn: '=""', isbn13: '=""' }),
        DEFAULT_SETTINGS
      );

      const searchItem: SearchResultItem = {
        id: 'dr-1',
        title: 'Sabırsız Yürek',
        author: 'Stefan Zweig',
        publisher: 'Türkiye İş Bankası Kültür Yayınları',
        url: 'https://www.dr.com.tr/kitap/sabirsiz-yurek',
        coverUrl: 'https://i.dr.com.tr/cover.jpg',
        provider: 'dr',
      };

      searchMock.mockResolvedValueOnce([searchItem]);
      getFullBookDataMock.mockResolvedValueOnce({
        ...searchItem,
        isbn: '9786052951234',
      });

      const service = new GoodreadsEnrichmentService(mockAggregator, DEFAULT_SETTINGS, 0);
      const enriched = await service.enrichBook(parsed);

      expect(searchMock).toHaveBeenCalledWith(
        'Sabırsız Yürek Stefan Zweig',
        DEFAULT_SETTINGS.defaultProvider
      );
      expect(enriched.metadata.coverUrl).toBe('https://i.dr.com.tr/cover.jpg');
      expect(enriched.metadata.isbn).toBe('9786052951234');
    });

    it('falls back gracefully to original CSV metadata when provider throws an error', async () => {
      const parsed = mapGoodreadsRow(createSampleRow(), DEFAULT_SETTINGS);
      searchMock.mockRejectedValue(new Error('Network offline 503'));

      const service = new GoodreadsEnrichmentService(mockAggregator, DEFAULT_SETTINGS, 0);
      const result = await service.enrichBook(parsed);

      expect(result).toEqual(parsed);
      expect(result.metadata.title).toBe('Sabırsız Yürek');
    });

    it('falls back to search result item fields if getFullBookData fails', async () => {
      const parsed = mapGoodreadsRow(createSampleRow(), DEFAULT_SETTINGS);
      const searchItem: SearchResultItem = {
        id: 'ol-1',
        title: 'Sabırsız Yürek',
        author: 'Stefan Zweig',
        publisher: 'Can Yayınları',
        url: 'https://openlibrary.org/works/OL1W',
        coverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg',
        provider: 'openlibrary',
      };

      searchMock.mockResolvedValueOnce([searchItem]);
      getFullBookDataMock.mockRejectedValueOnce(new Error('Detail endpoint timeout'));

      const service = new GoodreadsEnrichmentService(mockAggregator, DEFAULT_SETTINGS, 0);
      const enriched = await service.enrichBook(parsed);

      expect(enriched.metadata.coverUrl).toBe('https://covers.openlibrary.org/b/id/1-L.jpg');
      expect(enriched.metadata.publisher).toBe('Can Yayınları');
    });

    it('enforces minimum rate-limit delay between consecutive provider requests', async () => {
      const parsed1 = mapGoodreadsRow(createSampleRow({ bookId: '1' }), DEFAULT_SETTINGS);
      const parsed2 = mapGoodreadsRow(createSampleRow({ bookId: '2' }), DEFAULT_SETTINGS);

      const timestamps: number[] = [];
      searchMock.mockImplementation(async (q: string) => {
        timestamps.push(Date.now());
        return [
          {
            id: q,
            title: 'Sabırsız Yürek',
            author: 'Stefan Zweig',
            publisher: 'Can',
            isbn: '9789750738913',
            url: 'https://example.com',
            coverUrl: 'https://example.com/c.jpg',
          },
        ];
      });
      getFullBookDataMock.mockImplementation(async (item: SearchResultItem) => ({
        ...item,
        publisher: 'Can',
        isbn: item.isbn || '9789750738913',
      }));

      const delayMs = 60;
      const service = new GoodreadsEnrichmentService(mockAggregator, DEFAULT_SETTINGS, delayMs);

      await service.enrichBook(parsed1);
      await service.enrichBook(parsed2);

      expect(timestamps.length).toBe(2);
      expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(delayMs - 10);
      expect(DEFAULT_ENRICHMENT_DELAY_MS).toBe(350);
    });

    it('respects AbortSignal before and during rate-limited enrichment', async () => {
      const parsed = mapGoodreadsRow(createSampleRow(), DEFAULT_SETTINGS);
      const controller = new AbortController();
      controller.abort();

      const service = new GoodreadsEnrichmentService(mockAggregator, DEFAULT_SETTINGS, 50);
      const res = await service.enrichBook(parsed, controller.signal);

      expect(searchMock).not.toHaveBeenCalled();
      expect(res).toBe(parsed);
    });
  });
});
