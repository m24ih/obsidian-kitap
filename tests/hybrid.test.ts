import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cleanIsbn,
  isbnsMatch,
  normalizeTitle,
  getAuthorTokens,
  areAuthorsMatching,
  areBooksMatching,
  mergeSearchResults,
  resolveBestValue,
  resolveDefaultSelections,
  mergeBookMetadata,
} from '../src/providers/matcher';
import { HybridProvider } from '../src/providers/hybrid';
import { BookAggregator } from '../src/providers/aggregator';
import { BookMetadata, SearchResultItem } from '../src/types';

describe('Hybrid Metadata Provider & Deduplication Suite', () => {
  describe('ISBN Normalization & Cross-Matching', () => {
    it('cleans ISBN-10 and ISBN-13 correctly', () => {
      expect(cleanIsbn('978-975-21-1999-9')).toBe('9789752119999');
      expect(cleanIsbn('isbn: 975-21-1999-X')).toBe('975211999X');
      expect(cleanIsbn('')).toBe('');
      expect(cleanIsbn(undefined)).toBe('');
    });

    it('matches identical clean ISBNs', () => {
      expect(isbnsMatch('978-975-08-0714-5', '9789750807145')).toBe(true);
    });

    it('matches ISBN-10 with corresponding 978-prefixed ISBN-13', () => {
      // 975080714X (ISBN-10) vs 9789750807145 (ISBN-13)
      expect(isbnsMatch('978-975-08-0714-5', '975-08-0714-X')).toBe(true);
      expect(isbnsMatch('975-08-0714-X', '978-975-08-0714-5')).toBe(true);
    });

    it('returns false for mismatched ISBNs', () => {
      expect(isbnsMatch('9789750807145', '9789750809999')).toBe(false);
      expect(isbnsMatch(undefined, '9789750807145')).toBe(false);
      expect(isbnsMatch('', '')).toBe(false);
    });
  });

  describe('Title Normalization & Suffix Stripping', () => {
    it('normalizes Turkish case and strips punctuation', () => {
      expect(normalizeTitle('Ben, Robot')).toBe('ben robot');
      expect(normalizeTitle('Ben Robot')).toBe('ben robot');
      expect(normalizeTitle('BEN ROBOT!')).toBe('ben robot');
      expect(normalizeTitle('İmparatorluk')).toBe('imparatorluk');
      expect(normalizeTitle('Işık')).toBe('isik');
    });

    it('strips binding and edition format tags', () => {
      expect(normalizeTitle('Dune (Karton Kapak)')).toBe('dune');
      expect(normalizeTitle('Dune [Ciltli]')).toBe('dune');
      expect(normalizeTitle('1984 (Özel Baskı)')).toBe('1984');
      expect(normalizeTitle('Vakıf (Cep Boy)')).toBe('vakif');
    });

    it('handles empty or non-string titles safely', () => {
      expect(normalizeTitle('')).toBe('');
      expect(normalizeTitle(undefined)).toBe('');
    });
  });

  describe('Author Token Matching', () => {
    it('extracts tokens and normalizes Turkish diacritics', () => {
      expect(getAuthorTokens('Isaac Asimov')).toEqual(['isaac', 'asimov']);
      expect(getAuthorTokens('Cixin Liu')).toEqual(['cixin', 'liu']);
      expect(getAuthorTokens('Fyodor Mihayloviç Dostoyevski')).toEqual([
        'fyodor',
        'mihaylovic',
        'dostoyevski',
      ]);
    });

    it('matches authors regardless of word order', () => {
      expect(areAuthorsMatching('Isaac Asimov', 'Isaac Asimov')).toBe(true);
      expect(areAuthorsMatching('Cixin Liu', 'Liu Cixin')).toBe(true);
    });

    it('matches author with middle name or abbreviated name', () => {
      expect(
        areAuthorsMatching('Fyodor Mihayloviç Dostoyevski', 'Fyodor Dostoyevski')
      ).toBe(true);
    });

    it('returns false for completely different authors', () => {
      expect(areAuthorsMatching('Isaac Asimov', 'Frank Herbert')).toBe(false);
      expect(areAuthorsMatching('Franz Kafka', 'Albert Camus')).toBe(false);
      expect(areAuthorsMatching('', 'Isaac Asimov')).toBe(false);
    });
  });

  describe('Book Deduplication & Matching (areBooksMatching)', () => {
    const itemKy: SearchResultItem = {
      id: '12345',
      title: 'Ben, Robot',
      author: 'Isaac Asimov',
      publisher: 'İthaki Yayınları',
      url: 'https://kitapyurdu.com/kitap/ben-robot/12345.html',
      coverUrl: 'https://img.kitapyurdu.com/cover.jpg',
      rating: 4.8,
      provider: 'kitapyurdu',
    };

    const itemDr: SearchResultItem = {
      id: '0001234567',
      title: 'Ben Robot',
      author: 'Isaac Asimov',
      publisher: 'İthaki',
      url: 'https://dr.com.tr/kitap/ben-robot/0001234567',
      coverUrl: 'https://i.dr.com.tr/cover.jpg',
      rating: 4.5,
      provider: 'dr',
    };

    it('matches when titles and authors correspond closely', () => {
      expect(areBooksMatching(itemKy, itemDr)).toBe(true);
    });

    it('matches when ISBNs match even if titles have minor variations', () => {
      const kyWithIsbn: SearchResultItem = {
        ...itemKy,
        isbn: '9789752119999',
      };
      const drWithIsbn: SearchResultItem = {
        ...itemDr,
        title: 'Ben Robot (Koleksiyon)',
        isbn: '978-975-21-1999-9',
      };
      expect(areBooksMatching(kyWithIsbn, drWithIsbn)).toBe(true);
    });

    it('does NOT match different books by the same author', () => {
      const dune1: SearchResultItem = {
        id: '1',
        title: 'Dune',
        author: 'Frank Herbert',
        publisher: 'İthaki',
        url: '',
        coverUrl: '',
      };
      const duneMessiah: SearchResultItem = {
        id: '2',
        title: 'Dune Mesihi',
        author: 'Frank Herbert',
        publisher: 'İthaki',
        url: '',
        coverUrl: '',
      };
      expect(areBooksMatching(dune1, duneMessiah)).toBe(false);
    });

    it('does NOT match same title by different authors', () => {
      const bookA: SearchResultItem = {
        id: '1',
        title: 'Dönüşüm',
        author: 'Franz Kafka',
        publisher: 'Can Yayınları',
        url: '',
        coverUrl: '',
      };
      const bookB: SearchResultItem = {
        id: '2',
        title: 'Dönüşüm',
        author: 'Farklı Bir Yazar',
        publisher: 'Başka Yayın',
        url: '',
        coverUrl: '',
      };
      expect(areBooksMatching(bookA, bookB)).toBe(false);
    });
  });

  describe('Search Result Merging (mergeSearchResults)', () => {
    it('merges matching books into unified item with dual provider badges', () => {
      const kyList: SearchResultItem[] = [
        {
          id: 'ky1',
          title: 'Ben, Robot',
          author: 'Isaac Asimov',
          publisher: 'İthaki Yayınları',
          url: 'https://ky.test/1',
          coverUrl: 'https://ky.test/img1.jpg',
          rating: 4.8,
          provider: 'kitapyurdu',
        },
        {
          id: 'ky2',
          title: 'Karamazov Kardeşler',
          author: 'Dostoyevski',
          publisher: 'İş Bankası',
          url: 'https://ky.test/2',
          coverUrl: 'https://ky.test/img2.jpg',
          provider: 'kitapyurdu',
        },
      ];

      const drList: SearchResultItem[] = [
        {
          id: 'dr1',
          title: 'Ben Robot',
          author: 'Isaac Asimov',
          publisher: 'İthaki',
          url: 'https://dr.test/1',
          coverUrl: 'https://dr.test/img1.jpg',
          rating: 4.5,
          provider: 'dr',
        },
        {
          id: 'dr3',
          title: 'Vakıf',
          author: 'Isaac Asimov',
          publisher: 'İthaki',
          url: 'https://dr.test/3',
          coverUrl: 'https://dr.test/img3.jpg',
          provider: 'dr',
        },
      ];

      const merged = mergeSearchResults(kyList, drList);

      // Total 3 unique books:
      // 1. Ben Robot (merged: ky + dr)
      // 2. Karamazov Kardeşler (ky only)
      // 3. Vakıf (dr only)
      expect(merged).toHaveLength(3);

      const benRobot = merged.find((item) => item.title.includes('Ben'));
      expect(benRobot).toBeDefined();
      expect(benRobot?.providers).toEqual(['kitapyurdu', 'dr']);
      expect(benRobot?.provider).toBe('hybrid');
      expect(benRobot?.sources?.kitapyurdu).toBeDefined();
      expect(benRobot?.sources?.dr).toBeDefined();

      const karamazov = merged.find((item) => item.title.includes('Karamazov'));
      expect(karamazov).toBeDefined();
      expect(karamazov?.providers).toEqual(['kitapyurdu']);
      expect(karamazov?.provider).toBe('kitapyurdu');

      const vakif = merged.find((item) => item.title.includes('Vakıf'));
      expect(vakif).toBeDefined();
      expect(vakif?.providers).toEqual(['dr']);
      expect(vakif?.provider).toBe('dr');
    });
  });

  describe('Default Metadata Selection & Value Heuristics (resolveBestValue)', () => {
    it('picks valid page count when one provider has 0 or undefined', () => {
      // Prompt example: "D&R da ben robot için sayfa bilgisi bulunmazken Kitapyurdunda bulunuyor"
      const res = resolveBestValue(240, 0, 'pages');
      expect(res.value).toBe(240);
      expect(res.source).toBe('kitapyurdu');

      const res2 = resolveBestValue(undefined, 320, 'pages');
      expect(res2.value).toBe(320);
      expect(res2.source).toBe('dr');
    });

    it('prefers full date over year only for publishDate', () => {
      const res = resolveBestValue('2022-01-12', '2016', 'publishDate');
      expect(res.value).toBe('2022-01-12');
      expect(res.source).toBe('kitapyurdu');

      const res2 = resolveBestValue('2016', '2016-05-20', 'publishDate');
      expect(res2.value).toBe('2016-05-20');
      expect(res2.source).toBe('dr');
    });

    it('prefers longer description synopsis', () => {
      const shortDesc = 'Kısa tanıtım.';
      const longDesc =
        'Isaac Asimov tarafından kaleme alınan Ben, Robot bilimkurgunun mihenk taşlarındandır...';
      const res = resolveBestValue(longDesc, shortDesc, 'description');
      expect(res.value).toBe(longDesc);
      expect(res.source).toBe('kitapyurdu');
    });

    it('defaults to provider with defined rating', () => {
      const res = resolveBestValue(4.8, undefined, 'rating');
      expect(res.value).toBe(4.8);
      expect(res.source).toBe('kitapyurdu');
    });

    it('resolves defaults across all metadata fields', () => {
      const kyData: BookMetadata = {
        id: '123',
        url: 'https://ky.test/123',
        title: 'Ben, Robot',
        author: 'Isaac Asimov',
        publisher: 'İthaki Yayınları',
        isbn: '9789752119999',
        pages: 240,
        publishDate: '2022-01-12',
        rating: 4.8,
        description: 'Çok detaylı açıklama...',
      };

      const drData: BookMetadata = {
        id: '987',
        url: 'https://dr.test/987',
        title: 'Ben Robot',
        author: 'Isaac Asimov',
        publisher: 'İthaki',
        isbn: '9789752119999',
        pages: 0,
        publishDate: '2016',
        rating: undefined,
        description: '',
      };

      const selections = resolveDefaultSelections(kyData, drData);
      expect(selections.pages).toBe('kitapyurdu');
      expect(selections.publishDate).toBe('kitapyurdu');
      expect(selections.description).toBe('kitapyurdu');

      const merged = mergeBookMetadata(kyData, drData, selections);
      expect(merged.pages).toBe(240);
      expect(merged.publishDate).toBe('2022-01-12');
      expect(merged.rating).toBe(4.8);
      expect(merged.title).toBe('Ben, Robot');
    });

    it('honors user custom column selection over defaults', () => {
      const kyData: BookMetadata = {
        id: '123',
        url: 'https://ky.test/123',
        title: 'Ben, Robot',
        author: 'Isaac Asimov',
        publisher: 'İthaki Yayınları',
        isbn: '9789752119999',
        pages: 240,
        publishDate: '2022-01-12',
      };

      const drData: BookMetadata = {
        id: '987',
        url: 'https://dr.test/987',
        title: 'Ben Robot',
        author: 'Isaac Asimov',
        publisher: 'İthaki',
        isbn: '9789752119999',
        pages: 238,
        publishDate: '2016',
      };

      // User chooses D&R for publishDate and title, Kitapyurdu for pages
      const merged = mergeBookMetadata(kyData, drData, {
        title: 'dr',
        publishDate: 'dr',
        pages: 'kitapyurdu',
      });

      expect(merged.title).toBe('Ben Robot');
      expect(merged.publishDate).toBe('2016');
      expect(merged.pages).toBe(240);
    });
  });

  describe('HybridProvider Parallel Execution & Resilience', () => {
    let mockKyProvider: {
      id: string;
      name: string;
      search: any;
      getBookDetails: any;
    };
    let mockDrProvider: {
      id: string;
      name: string;
      search: any;
      getBookDetails: any;
    };
    let hybridProvider: HybridProvider;

    beforeEach(() => {
      mockKyProvider = {
        id: 'kitapyurdu',
        name: 'Kitapyurdu',
        search: vi.fn(),
        getBookDetails: vi.fn(),
      };
      mockDrProvider = {
        id: 'dr',
        name: 'D&R',
        search: vi.fn(),
        getBookDetails: vi.fn(),
      };

      const deps = {
        getProvider: (id: string) => {
          if (id === 'kitapyurdu') return mockKyProvider;
          if (id === 'dr') return mockDrProvider;
          throw new Error(`Unknown provider: ${id}`);
        },
      };

      hybridProvider = new HybridProvider(deps);
    });

    it('queries Kitapyurdu and D&R in parallel and merges results', async () => {
      mockKyProvider.search.mockResolvedValue([
        {
          id: 'ky1',
          title: 'Ben, Robot',
          author: 'Isaac Asimov',
          publisher: 'İthaki',
          url: 'https://ky.test/1',
          coverUrl: '',
        },
      ]);
      mockDrProvider.search.mockResolvedValue([
        {
          id: 'dr1',
          title: 'Ben Robot',
          author: 'Isaac Asimov',
          publisher: 'İthaki',
          url: 'https://dr.test/1',
          coverUrl: '',
        },
      ]);

      const results = await hybridProvider.search('ben robot');
      expect(mockKyProvider.search).toHaveBeenCalledWith('ben robot');
      expect(mockDrProvider.search).toHaveBeenCalledWith('ben robot');

      expect(results).toHaveLength(1);
      expect(results[0].provider).toBe('hybrid');
      expect(results[0].providers).toEqual(['kitapyurdu', 'dr']);
    });

    it('gracefully handles failure of one provider without breaking the other', async () => {
      mockKyProvider.search.mockResolvedValue([
        {
          id: 'ky1',
          title: 'Dune',
          author: 'Frank Herbert',
          publisher: 'İthaki',
          url: 'https://ky.test/dune',
          coverUrl: '',
        },
      ]);
      mockDrProvider.search.mockRejectedValue(new Error('D&R API rate limit or offline'));

      const results = await hybridProvider.search('dune');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Dune');
      expect(results[0].providers).toEqual(['kitapyurdu']);
    });

    it('returns empty array when query is empty string', async () => {
      const results = await hybridProvider.search('   ');
      expect(results).toEqual([]);
      expect(mockKyProvider.search).not.toHaveBeenCalled();
      expect(mockDrProvider.search).not.toHaveBeenCalled();
    });

    it('getFullBookData fetches and merges details from both providers', async () => {
      mockKyProvider.getBookDetails.mockResolvedValue({
        id: 'ky1',
        url: 'https://ky.test/1',
        title: 'Ben, Robot',
        author: 'Isaac Asimov',
        publisher: 'İthaki Yayınları',
        isbn: '9789752119999',
        pages: 240,
        publishDate: '2022-01-12',
      });

      mockDrProvider.getBookDetails.mockResolvedValue({
        id: 'dr1',
        url: 'https://dr.test/1',
        title: 'Ben Robot',
        author: 'Isaac Asimov',
        publisher: 'İthaki',
        isbn: '9789752119999',
        pages: 0,
        publishDate: '2016',
      });

      const mergedItem: SearchResultItem = {
        id: 'ky_1__dr_1',
        title: 'Ben, Robot',
        author: 'Isaac Asimov',
        publisher: 'İthaki',
        url: 'https://ky.test/1',
        coverUrl: '',
        provider: 'hybrid',
        providers: ['kitapyurdu', 'dr'],
        sources: {
          kitapyurdu: {
            id: 'ky1',
            title: 'Ben, Robot',
            author: 'Isaac Asimov',
            publisher: 'İthaki',
            url: 'https://ky.test/1',
            coverUrl: '',
          },
          dr: {
            id: 'dr1',
            title: 'Ben Robot',
            author: 'Isaac Asimov',
            publisher: 'İthaki',
            url: 'https://dr.test/1',
            coverUrl: '',
          },
        },
      };

      const fullData = await hybridProvider.getFullBookData(mergedItem);
      expect(fullData.title).toBe('Ben, Robot');
      expect(fullData.pages).toBe(240); // Picked from Kitapyurdu because DR was 0
      expect(fullData.publishDate).toBe('2022-01-12'); // Picked full date
    });
  });

  describe('BookAggregator Integration with Hybrid Mode', () => {
    it('switches defaultProvider to hybrid and executes hybrid search', async () => {
      const aggregator = new BookAggregator();
      aggregator.setDefaultProvider('hybrid');
      expect(aggregator.getDefaultProviderId()).toBe('hybrid');

      const mockKy = {
        id: 'kitapyurdu',
        name: 'Kitapyurdu',
        search: vi.fn().mockResolvedValue([
          {
            id: 'ky10',
            title: 'Vakıf',
            author: 'Isaac Asimov',
            publisher: 'İthaki',
            url: 'https://ky.test/v',
            coverUrl: '',
          },
        ]),
        getBookDetails: vi.fn(),
      };

      const mockDr = {
        id: 'dr',
        name: 'D&R',
        search: vi.fn().mockResolvedValue([
          {
            id: 'dr10',
            title: 'Vakıf',
            author: 'Isaac Asimov',
            publisher: 'İthaki',
            url: 'https://dr.test/v',
            coverUrl: '',
          },
        ]),
        getBookDetails: vi.fn(),
      };

      aggregator.registerProvider(mockKy);
      aggregator.registerProvider(mockDr);

      const results = await aggregator.search('vakıf');
      expect(mockKy.search).toHaveBeenCalledWith('vakıf');
      expect(mockDr.search).toHaveBeenCalledWith('vakıf');

      expect(results).toHaveLength(1);
      expect(results[0].providers).toEqual(['kitapyurdu', 'dr']);
    });

    it('lists hybrid provider when includeComposite is true', () => {
      const aggregator = new BookAggregator();
      const baseProviders = aggregator.getAvailableProviders();
      expect(baseProviders.map((p) => p.id)).toEqual(['kitapyurdu', 'dr']);

      const allProviders = aggregator.getAvailableProviders({ includeComposite: true });
      expect(allProviders.map((p) => p.id)).toEqual(['kitapyurdu', 'dr', 'hybrid']);
    });
  });

  describe('BookSearchModal Hybrid Mode Integration', () => {
    it('renders multiple provider badges for merged books', async () => {
      const { BookSearchModal } = await import('../src/modal/searchModal');
      const { App } = await import('./setup');
      const app = new App();

      const pluginMock: any = {
        settings: { defaultProvider: 'hybrid' },
      };

      const modal = new BookSearchModal(app as any, pluginMock);
      const container = document.createElement('div');

      const mergedItem: SearchResultItem = {
        id: 'ky1__dr1',
        title: 'Ben, Robot',
        author: 'Isaac Asimov',
        publisher: 'İthaki',
        url: 'https://ky.test/1',
        coverUrl: 'https://ky.test/cover.jpg',
        rating: 4.8,
        provider: 'hybrid',
        providers: ['kitapyurdu', 'dr'],
      };

      modal.renderSuggestion(mergedItem, container);

      const badges = container.querySelectorAll('.kitap-badge-provider');
      expect(badges).toHaveLength(2);
      expect(badges[0].textContent).toBe('Kitapyurdu');
      expect(badges[1].textContent).toBe('D&R');
    });

    it('opens MetadataComparisonModal when multi-provider book is selected', async () => {
      const { BookSearchModal } = await import('../src/modal/searchModal');
      const { App, TFile } = await import('./setup');
      const app = new App();

      const createdFiles: Record<string, string> = {};
      app.vault = {
        getAbstractFileByPath: vi.fn().mockReturnValue(null),
        create: vi.fn().mockImplementation((path: string, content: string) => {
          createdFiles[path] = content;
          return Object.assign(new TFile(), { path });
        }),
      } as any;

      const mockKy = {
        id: 'kitapyurdu',
        name: 'Kitapyurdu',
        search: vi.fn(),
        getBookDetails: vi.fn().mockResolvedValue({
          id: 'ky1',
          url: 'https://ky.test/1',
          title: 'Ben, Robot',
          author: 'Isaac Asimov',
          publisher: 'İthaki',
          isbn: '9789752119999',
          pages: 240,
          publishDate: '2022-01-12',
        }),
      };

      const mockDr = {
        id: 'dr',
        name: 'D&R',
        search: vi.fn(),
        getBookDetails: vi.fn().mockResolvedValue({
          id: 'dr1',
          url: 'https://dr.test/1',
          title: 'Ben Robot',
          author: 'Isaac Asimov',
          publisher: 'İthaki',
          isbn: '9789752119999',
          pages: 0,
          publishDate: '2016',
        }),
      };

      const aggregator = new BookAggregator();
      aggregator.registerProvider(mockKy);
      aggregator.registerProvider(mockDr);

      const pluginMock: any = {
        settings: {
          defaultProvider: 'hybrid',
          targetFolder: 'Kitaplar',
          fileNameTemplate: '{{title}}',
          noteTemplate: '# {{title}}\nSayfa: {{pages}}',
        },
      };

      const modal = new BookSearchModal(app as any, pluginMock, { aggregator });

      const mergedItem: SearchResultItem = {
        id: 'ky1__dr1',
        title: 'Ben, Robot',
        author: 'Isaac Asimov',
        publisher: 'İthaki',
        url: 'https://ky.test/1',
        coverUrl: '',
        provider: 'hybrid',
        providers: ['kitapyurdu', 'dr'],
        sources: {
          kitapyurdu: {
            id: 'ky1',
            title: 'Ben, Robot',
            author: 'Isaac Asimov',
            publisher: 'İthaki',
            url: 'https://ky.test/1',
            coverUrl: '',
          },
          dr: {
            id: 'dr1',
            title: 'Ben Robot',
            author: 'Isaac Asimov',
            publisher: 'İthaki',
            url: 'https://dr.test/1',
            coverUrl: '',
          },
        },
      };

      const selectionPromise = modal.processBookSelection(mergedItem);

      // Yield event loop so comparison modal opens and DOM is rendered
      await new Promise((r) => setTimeout(r, 10));

      const compModalEl = document.querySelector('.kitap-comparison-modal');
      expect(compModalEl).not.toBeNull();

      // Submit modal
      const ctaBtn = compModalEl?.querySelector('.mod-cta') as HTMLButtonElement;
      expect(ctaBtn).toBeDefined();
      ctaBtn.click();

      const createdFile = await selectionPromise;
      expect(createdFile).toBeDefined();

      const createdPath = Object.keys(createdFiles)[0];
      expect(createdFiles[createdPath]).toContain('Sayfa: 240');
    });
  });
});

