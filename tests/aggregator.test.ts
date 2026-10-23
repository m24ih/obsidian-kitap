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
    provider: 'kitapyurdu',
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

  describe('Multi-Provider Architecture & Resolution', () => {
    it('returns default providers list with kitapyurdu', () => {
      const providers = aggregator.getAvailableProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0].id).toBe('kitapyurdu');
      expect(providers[0].name).toBe('Kitapyurdu');
    });

    it('registers new provider and lists it in available providers', () => {
      const mockCustomProvider = {
        id: 'test_provider',
        name: 'Test Kitap Sağlayıcı',
        search: vi.fn().mockResolvedValue([]),
        getBookDetails: vi.fn().mockResolvedValue(sampleBaseMetadata),
      };

      aggregator.registerProvider(mockCustomProvider);

      const providers = aggregator.getAvailableProviders();
      expect(providers).toHaveLength(2);
      expect(providers.find((p) => p.id === 'test_provider')).toEqual({
        id: 'test_provider',
        name: 'Test Kitap Sağlayıcı',
      });
    });

    it('searches using specified provider ID', async () => {
      const customItem: SearchResultItem = {
        ...sampleSearchItem,
        id: 'custom-123',
        provider: 'test_provider',
      };
      const mockCustomProvider = {
        id: 'test_provider',
        name: 'Test Kitap Sağlayıcı',
        search: vi.fn().mockResolvedValue([customItem]),
        getBookDetails: vi.fn().mockResolvedValue(sampleBaseMetadata),
      };

      aggregator.registerProvider(mockCustomProvider);

      const results = await aggregator.search('bilimkurgu', 'test_provider');
      expect(mockCustomProvider.search).toHaveBeenCalledWith('bilimkurgu');
      expect(mockKyProvider.search).not.toHaveBeenCalled();
      expect(results).toEqual([customItem]);
    });

    it('falls back to default provider when searching with unknown provider ID', async () => {
      const results = await aggregator.search('dune', 'nonexistent_provider');
      expect(mockKyProvider.search).toHaveBeenCalledWith('dune');
      expect(results).toEqual([sampleSearchItem]);
    });

    it('routes getFullBookData based on searchItem.provider tag', async () => {
      const customBook: BookMetadata = {
        ...sampleBaseMetadata,
        title: 'Custom Provider Book',
        provider: 'test_provider',
      };
      const mockCustomProvider = {
        id: 'test_provider',
        name: 'Test Kitap Sağlayıcı',
        search: vi.fn().mockResolvedValue([]),
        getBookDetails: vi.fn().mockResolvedValue(customBook),
      };

      aggregator.registerProvider(mockCustomProvider);

      const itemWithProvider: SearchResultItem = {
        ...sampleSearchItem,
        provider: 'test_provider',
      };

      const result = await aggregator.getFullBookData(itemWithProvider);
      expect(mockCustomProvider.getBookDetails).toHaveBeenCalledWith(sampleSearchItem.url);
      expect(mockKyProvider.getBookDetails).not.toHaveBeenCalled();
      expect(result.title).toBe('Custom Provider Book');
    });

    it('initializes with hybrid default provider when constructed without arguments', () => {
      const defaultAggregator = new BookAggregator();
      expect(defaultAggregator.getDefaultProviderId()).toBe('hybrid');
    });

    it('updates and retrieves default provider correctly', () => {
      expect(aggregator.getDefaultProviderId()).toBe('kitapyurdu');
      aggregator.setDefaultProvider('new_provider');
      expect(aggregator.getDefaultProviderId()).toBe('new_provider');
    });

    it('ignores invalid or empty whitespace in setDefaultProvider', () => {
      aggregator.setDefaultProvider('   ');
      expect(aggregator.getDefaultProviderId()).toBe('kitapyurdu');
      aggregator.setDefaultProvider(null as any);
      expect(aggregator.getDefaultProviderId()).toBe('kitapyurdu');
    });

    it('automatically tags provider ID on search results if provider omitted it', async () => {
      const mockCustomProvider = {
        id: 'external_site',
        name: 'External Book Site',
        search: vi.fn().mockResolvedValue([
          {
            id: 'ext-1',
            title: 'External Book',
            author: 'External Author',
            publisher: 'External Pub',
            url: 'https://external.test/book/1',
            coverUrl: '',
          },
        ]),
        getBookDetails: vi.fn(),
      };

      aggregator.registerProvider(mockCustomProvider);
      const results = await aggregator.search('query', 'external_site');

      expect(results[0].provider).toBe('external_site');
    });

    it('automatically tags provider ID on getFullBookData if provider details omitted it', async () => {
      const mockCustomProvider = {
        id: 'external_site',
        name: 'External Book Site',
        search: vi.fn().mockResolvedValue([]),
        getBookDetails: vi.fn().mockResolvedValue({
          id: 'ext-1',
          title: 'External Detail Book',
          author: 'External Author',
          url: 'https://external.test/book/1',
          coverUrl: '',
        }),
      };

      aggregator.registerProvider(mockCustomProvider);
      const data = await aggregator.getFullBookData({
        id: 'ext-1',
        title: 'External Detail Book',
        author: 'External Author',
        publisher: '',
        url: 'https://external.test/book/1',
        coverUrl: '',
        provider: 'external_site',
      });

      expect(data.provider).toBe('external_site');
    });

    it('allows unregistering custom providers while protecting kitapyurdu core provider', () => {
      const mockProvider = {
        id: 'temporary',
        name: 'Temporary Provider',
        search: vi.fn().mockResolvedValue([]),
        getBookDetails: vi.fn().mockResolvedValue(sampleBaseMetadata),
      };
      aggregator.registerProvider(mockProvider);
      expect(aggregator.getAvailableProviders()).toHaveLength(2);

      const unregisterResult = aggregator.unregisterProvider?.('temporary');
      expect(unregisterResult).toBe(true);
      expect(aggregator.getAvailableProviders()).toHaveLength(1);

      const cannotRemoveCore = aggregator.unregisterProvider?.('kitapyurdu');
      expect(cannotRemoveCore).toBe(false);
      expect(aggregator.getAvailableProviders()).toHaveLength(1);
    });

    it('safely handles null/undefined provider registration', () => {
      expect(() => aggregator.registerProvider(null as any)).not.toThrow();
      expect(aggregator.getAvailableProviders()).toHaveLength(1);
    });
  });
});
