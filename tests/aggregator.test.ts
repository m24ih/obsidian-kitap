import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BookAggregator } from '../src/providers/aggregator';
import { IKitapyurduProvider, IBinkitapProvider } from '../src/providers/types';
import { BookMetadata, SearchResultItem, DEFAULT_SETTINGS } from '../src/types';

describe('Aggregator Service Tests', () => {
  let mockKyProvider: IKitapyurduProvider;
  let mockBkProvider: IBinkitapProvider;
  let aggregator: BookAggregator;

  const sampleSearchItem: SearchResultItem = {
    id: '375312',
    title: 'Dune',
    author: 'Frank Herbert',
    publisher: 'İTHAKİ YAYINLARI',
    url: 'https://www.kitapyurdu.com/kitap/dune/375312.html',
    coverUrl: 'https://img.kitapyurdu.com/wi:500/cover.jpg',
    rating: 5,
  };

  const sampleBaseMetadata: BookMetadata = {
    id: '375312',
    url: 'https://www.kitapyurdu.com/kitap/dune/375312.html',
    title: 'Dune',
    author: 'Frank Herbert',
    publisher: 'İTHAKİ YAYINLARI',
    translator: 'Dost Körpe',
    isbn: '9786053754794',
    pages: 712,
    publishDate: '2021-09-08',
    coverUrl: 'https://img.kitapyurdu.com/wi:800/cover.jpg',
    description: 'Yüzüklerin Efendisi dışında...',
    rating: 5,
    ratingCount: 819,
  };

  beforeEach(() => {
    mockKyProvider = {
      search: vi.fn().mockResolvedValue([sampleSearchItem]),
      getBookDetails: vi.fn().mockResolvedValue({ ...sampleBaseMetadata }),
    };

    mockBkProvider = {
      enrich: vi.fn().mockResolvedValue({
        binkitapRating: '9.2/10',
        binkitapReadCount: '150 bin',
        binkitapUrl: 'https://1000kitap.com/kitap/dune--123',
        quotes: [
          { text: 'Korku katildir.', author: 'Frank Herbert', page: '15' },
        ],
      }),
    };

    aggregator = new BookAggregator(mockKyProvider, mockBkProvider);
  });

  describe('Tier 1: Feature Coverage — Delegation & Merging', () => {
    it('delegates search directly to Kitapyurdu provider', async () => {
      const results = await aggregator.search('dune');
      expect(mockKyProvider.search).toHaveBeenCalledWith('dune');
      expect(results).toEqual([sampleSearchItem]);
    });

    it('merges primary Kitapyurdu metadata with secondary 1000Kitap enrichment', async () => {
      const book = await aggregator.getFullBookData(sampleSearchItem, DEFAULT_SETTINGS);

      expect(mockKyProvider.getBookDetails).toHaveBeenCalledWith(sampleSearchItem.url);
      expect(mockBkProvider.enrich).toHaveBeenCalledWith(
        sampleBaseMetadata.title,
        sampleBaseMetadata.author,
        DEFAULT_SETTINGS.maxQuotes
      );

      // Primary Kitapyurdu data intact
      expect(book.title).toBe('Dune');
      expect(book.author).toBe('Frank Herbert');
      expect(book.translator).toBe('Dost Körpe');
      expect(book.isbn).toBe('9786053754794');
      // Secondary 1000Kitap data merged
      expect(book.binkitapRating).toBe('9.2/10');
      expect(book.quotes?.length).toBe(1);
      expect(book.quotes?.[0].text).toBe('Korku katildir.');
    });
  });

  describe('Tier 2: Boundary & Corner Cases — Resilience & Graceful Fallback', () => {
    it('never crashes note generation when 1000Kitap throws network error (R3 Acceptance Criteria)', async () => {
      // 1000Kitap network connection times out or fails
      mockBkProvider.enrich = vi.fn().mockRejectedValue(new Error('Network timeout: 1000kitap.com is unreachable'));

      let book: BookMetadata | null = null;
      let error: any = null;

      try {
        book = await aggregator.getFullBookData(sampleSearchItem, DEFAULT_SETTINGS);
      } catch (e) {
        error = e;
      }

      // Zero-crash contract: error MUST NOT bubble up
      expect(error).toBeNull();
      expect(book).toBeDefined();
      expect(book?.title).toBe('Dune');
      expect(book?.isbn).toBe('9786053754794');
      // Graceful fallback values
      expect(book?.quotes).toEqual([]);
      expect(book?.binkitapRating).toBeUndefined();
    });

    it('gracefully degrades when 1000Kitap throws HTTP 403 Forbidden', async () => {
      mockBkProvider.enrich = vi.fn().mockRejectedValue({ status: 403, message: 'Cloudflare Turnstile challenge' });

      const book = await aggregator.getFullBookData(sampleSearchItem, DEFAULT_SETTINGS);

      expect(book.title).toBe('Dune');
      expect(book.quotes).toEqual([]);
    });

    it('gracefully degrades when 1000Kitap finds no match for a book', async () => {
      mockBkProvider.enrich = vi.fn().mockResolvedValue({
        binkitapRating: undefined,
        quotes: [],
      });

      const book = await aggregator.getFullBookData(sampleSearchItem, DEFAULT_SETTINGS);

      expect(book.title).toBe('Dune');
      expect(book.quotes).toEqual([]);
      expect(book.binkitapRating).toBeUndefined();
    });

    it('respects includeQuotes = false setting by skipping or suppressing quotes', async () => {
      const customSettings = {
        ...DEFAULT_SETTINGS,
        includeQuotes: false,
      };

      const book = await aggregator.getFullBookData(sampleSearchItem, customSettings);

      expect(book.quotes).toEqual([]);
    });
  });
});
