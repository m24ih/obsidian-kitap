import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BookSearchModal } from '../src/modal/searchModal';
import { DEFAULT_SETTINGS, SearchResultItem } from '../src/types';

describe('BookSearchModal UI, Skeleton, Badges and Filtering Suite', () => {
  let mockApp: any;
  let mockPlugin: any;
  let mockAggregator: any;

  const sampleResults: SearchResultItem[] = [
    {
      id: 'ky-1',
      title: 'Dune',
      author: 'Frank Herbert',
      publisher: 'İthaki',
      url: 'https://kitapyurdu.com/dune',
      coverUrl: 'https://kitapyurdu.com/dune.jpg',
      provider: 'kitapyurdu',
      providers: ['kitapyurdu', 'dr'],
      isbn: '9786053754794',
    },
    {
      id: 'ol-1',
      title: 'Dune Messiah',
      author: 'Frank Herbert',
      publisher: 'Berkley',
      url: 'https://openlibrary.org/works/OL1',
      coverUrl: 'https://openlibrary.org/cover.jpg',
      provider: 'openlibrary',
      providers: ['openlibrary'],
      isbn: '9780441172696',
    },
  ];

  beforeEach(() => {
    mockApp = {
      vault: {},
      workspace: {},
    };
    mockPlugin = {
      settings: { ...DEFAULT_SETTINGS },
    };
    mockAggregator = {
      setSettings: vi.fn(),
      search: vi.fn().mockImplementation(async (_query: string, _pId?: string, options?: any) => {
        options?.onProgress?.({
          providerId: 'kitapyurdu',
          name: 'Kitapyurdu',
          durationMs: 15,
          status: 'success',
          resultCount: 1,
        });
        options?.onProgress?.({
          providerId: 'openlibrary',
          name: 'OpenLibrary',
          durationMs: 120,
          status: 'success',
          resultCount: 1,
        });
        return sampleResults;
      }),
      getFullBookData: vi.fn(),
      getAvailableProviders: vi.fn().mockReturnValue([
        { id: 'kitapyurdu', name: 'Kitapyurdu' },
        { id: 'dr', name: 'D&R' },
        { id: 'openlibrary', name: 'OpenLibrary' },
      ]),
    };
  });

  it('renders notice, metrics badges and filter chips correctly', async () => {
    const modal = new BookSearchModal(mockApp, mockPlugin, {
      aggregator: mockAggregator,
      debounceMs: 0,
    });
    modal.open();

    const suggestions = await modal.getSuggestions('dune');
    expect(suggestions).toHaveLength(2);

    const statusBar = (modal as any).statusBarEl as HTMLElement;
    expect(statusBar).toBeDefined();

    // 1. Bilgilendirme notu
    const notice = statusBar.querySelector('.kitap-search-notice');
    expect(notice?.textContent).toContain('Çok fazla metaveri sağlayıcısı seçmek');

    // 2. Metrik rozetleri
    const badges = Array.from(statusBar.querySelectorAll('.kitap-metric-badge'));
    expect(badges.length).toBeGreaterThanOrEqual(2);

    const kyBadge = statusBar.querySelector('.kitap-metric-kitapyurdu');
    expect(kyBadge?.textContent).toContain('15ms');
    expect(kyBadge?.textContent).toContain('✅');

    // 3. Filtre çipleri
    const filterChips = Array.from(statusBar.querySelectorAll('.kitap-filter-chip'));
    expect(filterChips.length).toBeGreaterThanOrEqual(2);
    expect(filterChips[0].textContent).toContain('Tümü (2)');
  });

  it('renders suggestion with ISBN label when present', () => {
    const modal = new BookSearchModal(mockApp, mockPlugin, {
      aggregator: mockAggregator,
    });

    const itemEl = document.createElement('div');
    modal.renderSuggestion(sampleResults[0], itemEl);

    const isbnEl = itemEl.querySelector('.kitap-meta-isbn');
    expect(isbnEl).toBeDefined();
    expect(isbnEl?.textContent).toBe('ISBN: 9786053754794');
  });

  it('filters results when provider chip is clicked', async () => {
    const modal = new BookSearchModal(mockApp, mockPlugin, {
      aggregator: mockAggregator,
      debounceMs: 0,
    });
    modal.open();

    await modal.getSuggestions('dune');

    // Select openlibrary filter
    (modal as any).selectedProviderFilter = 'openlibrary';
    const filtered = (modal as any).getFilteredResults();

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('ol-1');
  });

  it('triggers on-demand lookup for missing active providers on selection and opens comparison modal', async () => {
    const kyOnlyItem: SearchResultItem = {
      id: 'ky-99',
      title: 'Dünyalar Savaşı',
      author: 'H. G. Wells',
      publisher: 'İthaki Yayınları',
      isbn: '9786053757412',
      url: 'https://kitapyurdu.com/kitap/dunyalar-savasi/99',
      coverUrl: 'https://img.kitapyurdu.com/cover.jpg',
      provider: 'kitapyurdu',
      providers: ['kitapyurdu'],
      sources: {
        kitapyurdu: {
          id: 'ky-99',
          title: 'Dünyalar Savaşı',
          author: 'H. G. Wells',
          publisher: 'İthaki Yayınları',
          isbn: '9786053757412',
          url: 'https://kitapyurdu.com/kitap/dunyalar-savasi/99',
          coverUrl: 'https://img.kitapyurdu.com/cover.jpg',
          provider: 'kitapyurdu',
        },
      },
    };

    const mockKyProvider = {
      name: 'Kitapyurdu',
      id: 'kitapyurdu',
      getBookDetails: vi.fn().mockResolvedValue({
        id: 'ky-99',
        title: 'Dünyalar Savaşı (KY)',
        author: 'H. G. Wells',
        publisher: 'İthaki Yayınları',
        isbn: '9786053757412',
        provider: 'kitapyurdu',
      }),
    };

    const mockOlProvider = {
      name: 'OpenLibrary',
      id: 'openlibrary',
      getBookDetails: vi.fn().mockResolvedValue({
        id: '/isbn/9786053757412',
        title: 'Dünyalar Savasi (OL)',
        author: 'H. G. Wells',
        publisher: 'Ithaki Yayinlari',
        isbn: '9786053757412',
        provider: 'openlibrary',
      }),
    };

    const mockDrProvider = {
      name: 'D&R',
      id: 'dr',
      getBookDetails: vi.fn().mockResolvedValue({
        id: 'dr-99',
        title: 'Dünyalar Savaşı (DR)',
        author: 'H. G. Wells',
        publisher: 'İthaki',
        isbn: '9786053757412',
        provider: 'dr',
      }),
    };

    mockAggregator.getAvailableProviders = vi.fn().mockReturnValue([
      { id: 'kitapyurdu', name: 'Kitapyurdu' },
      { id: 'dr', name: 'D&R' },
      { id: 'openlibrary', name: 'OpenLibrary' },
    ]);
    mockAggregator.getDefaultProviderId = vi.fn().mockReturnValue('hybrid');
    mockAggregator.getProvider = vi.fn().mockImplementation((id: string) => {
      if (id === 'kitapyurdu') return mockKyProvider;
      if (id === 'openlibrary') return mockOlProvider;
      if (id === 'dr') return mockDrProvider;
      throw new Error(`Unknown provider: ${id}`);
    });

    const modal = new BookSearchModal(mockApp, mockPlugin, {
      aggregator: mockAggregator,
    });

    // Spy on finalizeBookCreation
    const finalizeSpy = vi.spyOn(modal, 'finalizeBookCreation').mockResolvedValue(null);

    // Call processBookSelection
    const promise = modal.processBookSelection(kyOnlyItem);

    // Wait a tick for async promises to resolve and modal to be instantiated
    await new Promise((r) => setTimeout(r, 50));

    expect(mockKyProvider.getBookDetails).toHaveBeenCalled();
    expect(mockOlProvider.getBookDetails).toHaveBeenCalledWith('/isbn/9786053757412');
    expect(mockDrProvider.getBookDetails).toHaveBeenCalledWith('9786053757412');
  });
});
