import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BookAggregator } from '../src/providers/aggregator';
import { IKitapyurduProvider } from '../src/providers/types';
import { BookMetadata, SearchResultItem } from '../src/types';

describe('Aggregator Service Tests', () => {
  let mockKyProvider: IKitapyurduProvider;
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

    aggregator = new BookAggregator(mockKyProvider);
  });

  describe('Feature Coverage — Delegation', () => {
    it('delegates search directly to Kitapyurdu provider', async () => {
      const results = await aggregator.search('dune');
      expect(mockKyProvider.search).toHaveBeenCalledWith('dune');
      expect(results).toEqual([sampleSearchItem]);
    });

    it('delegates getFullBookData directly to Kitapyurdu getBookDetails', async () => {
      const book = await aggregator.getFullBookData(sampleSearchItem);

      expect(mockKyProvider.getBookDetails).toHaveBeenCalledWith(sampleSearchItem.url);
      expect(book.title).toBe('Dune');
      expect(book.author).toBe('Frank Herbert');
      expect(book.translator).toBe('Dost Körpe');
      expect(book.isbn).toBe('9786053754794');
      expect(book.rating).toBe(5);
    });

    it('uses item id if url is not present', async () => {
      const itemWithoutUrl: SearchResultItem = {
        ...sampleSearchItem,
        url: '',
      };
      await aggregator.getFullBookData(itemWithoutUrl);
      expect(mockKyProvider.getBookDetails).toHaveBeenCalledWith('375312');
    });
  });
});
