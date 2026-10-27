import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cleanIsbn,
  getAlternateIsbn,
  isbnsMatch,
  normalizeTitle,
  getAuthorTokens,
  areAuthorsMatching,
  arePublishersMatching,
  areFormatsCompatible,
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

    it('computes alternate ISBN-10 and ISBN-13 accurately', () => {
      expect(getAlternateIsbn('978-0441172719')).toBe('0441172717');
      expect(getAlternateIsbn('0441172717')).toBe('9780441172719');
      // ISBN with check digit X
      expect(getAlternateIsbn('975-08-0714-X')).toBe('9789750807145');
      expect(getAlternateIsbn('invalid')).toBeUndefined();
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

    it('does NOT match different authors who merely share a common first name', () => {
      expect(areAuthorsMatching('Ahmet Ümit', 'Ahmet Hamdi Tanpınar')).toBe(false);
      expect(areAuthorsMatching('Ahmet Yılmaz', 'Ahmet Kaya')).toBe(false);
      expect(areAuthorsMatching('Mehmet Ali', 'Mehmet Akif')).toBe(false);
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

    it('does NOT match same title and author when published by different publishers (e.g. 1984)', () => {
      const orwellCan: SearchResultItem = {
        id: '1',
        title: '1984',
        author: 'George Orwell',
        publisher: 'Can Yayınları',
        url: '',
        coverUrl: '',
      };
      const orwellIsBankasi: SearchResultItem = {
        id: '2',
        title: '1984',
        author: 'George Orwell',
        publisher: 'Türkiye İş Bankası Kültür Yayınları',
        url: '',
        coverUrl: '',
      };
      const orwellIthaki: SearchResultItem = {
        id: '3',
        title: '1984',
        author: 'George Orwell',
        publisher: 'İthaki Yayınları',
        url: '',
        coverUrl: '',
      };

      expect(areBooksMatching(orwellCan, orwellIsBankasi)).toBe(false);
      expect(areBooksMatching(orwellCan, orwellIthaki)).toBe(false);
      expect(areBooksMatching(orwellIsBankasi, orwellIthaki)).toBe(false);
    });

    it('matches same book when publishers correspond with slight name variations', () => {
      const book1: SearchResultItem = {
        id: '1',
        title: 'Ben, Robot',
        author: 'Isaac Asimov',
        publisher: 'İthaki Yayınları',
        url: '',
        coverUrl: '',
      };
      const book2: SearchResultItem = {
        id: '2',
        title: 'Ben Robot',
        author: 'Isaac Asimov',
        publisher: 'İthaki',
        url: '',
        coverUrl: '',
      };
      expect(areBooksMatching(book1, book2)).toBe(true);
      expect(arePublishersMatching('YKY', 'Yapı Kredi Yayınları')).toBe(true);
    });

    it('rejects merging incompatible physical formats (Ciltli vs Karton Kapak)', () => {
      const ciltli: SearchResultItem = {
        id: '1',
        title: 'Ben, Robot (Ciltli)',
        author: 'Isaac Asimov',
        publisher: 'İthaki',
        url: '',
        coverUrl: '',
      };
      const karton: SearchResultItem = {
        id: '2',
        title: 'Ben Robot (Karton Kapak)',
        author: 'Isaac Asimov',
        publisher: 'İthaki',
        url: '',
        coverUrl: '',
      };
      expect(areBooksMatching(ciltli, karton)).toBe(false);
      expect(areFormatsCompatible(ciltli.title, karton.title)).toBe(false);
    });

    it('strips hyphen-separated format suffixes and matches correctly', () => {
      const hyphenCiltli: SearchResultItem = {
        id: '1',
        title: 'Ben, Robot - Ciltli',
        author: 'Isaac Asimov',
        publisher: 'İthaki',
        url: '',
        coverUrl: '',
      };
      const bracketCiltli: SearchResultItem = {
        id: '2',
        title: 'Ben Robot (Ciltli)',
        author: 'Isaac Asimov',
        publisher: 'İthaki',
        url: '',
        coverUrl: '',
      };
      expect(areBooksMatching(hyphenCiltli, bracketCiltli)).toBe(true);
    });

    it('cleans ISBN with trailing punctuation and matches', () => {
      expect(cleanIsbn('978-975-21-1999-9.')).toBe('9789752119999');
      expect(isbnsMatch('978-975-21-1999-9.', '9789752119999')).toBe(true);
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
      expect(allProviders.map((p) => p.id)).toEqual(['hybrid', 'kitapyurdu', 'dr']);
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

  describe('Global Book Providers Integration (OpenLibrary & Hardcover)', () => {
    let mockKy: any;
    let mockDr: any;
    let mockOl: any;
    let mockHc: any;

    beforeEach(() => {
      mockKy = {
        id: 'kitapyurdu',
        name: 'Kitapyurdu',
        search: vi.fn().mockResolvedValue([
          {
            id: 'ky1',
            title: 'Dune',
            author: 'Frank Herbert',
            publisher: 'İthaki Yayınları',
            isbn: '9786053754794',
            url: 'https://ky.test/dune',
            coverUrl: '',
            provider: 'kitapyurdu',
          },
        ]),
        getBookDetails: vi.fn().mockResolvedValue({
          id: 'ky1',
          title: 'Dune',
          author: 'Frank Herbert',
          publisher: 'İthaki Yayınları',
          isbn: '9786053754794',
          pages: 712,
          provider: 'kitapyurdu',
        }),
      };

      mockDr = {
        id: 'dr',
        name: 'D&R',
        search: vi.fn().mockResolvedValue([]),
        getBookDetails: vi.fn().mockResolvedValue({
          id: 'dr1',
          title: 'Dune',
          author: 'Frank Herbert',
          publisher: 'İthaki',
          isbn: '9786053754794',
          provider: 'dr',
        }),
      };

      mockOl = {
        id: 'openlibrary',
        name: 'OpenLibrary',
        search: vi.fn().mockResolvedValue([
          {
            id: '/works/OL893414W',
            title: 'Dune',
            author: 'Frank Herbert',
            publisher: 'Chilton',
            isbn: '9786053754794',
            url: 'https://openlibrary.org/works/OL893414W',
            coverUrl: 'https://covers.openlibrary.org/b/id/980253-L.jpg',
            provider: 'openlibrary',
          },
        ]),
        getBookDetails: vi.fn().mockResolvedValue({
          id: '/works/OL893414W',
          title: 'Dune',
          author: 'Frank Herbert',
          publisher: 'Chilton',
          isbn: '9786053754794',
          description: 'A masterpiece of science fiction.',
          provider: 'openlibrary',
        }),
      };

      mockHc = {
        id: 'hardcover',
        name: 'Hardcover',
        search: vi.fn().mockResolvedValue([
          {
            id: '4242',
            title: 'Project Hail Mary',
            author: 'Andy Weir',
            publisher: 'Ballantine Books',
            isbn: '9780593135203',
            url: 'https://hardcover.app/books/project-hail-mary',
            coverUrl: '',
            provider: 'hardcover',
          },
        ]),
        getBookDetails: vi.fn().mockResolvedValue({
          id: '4242',
          title: 'Project Hail Mary',
          author: 'Andy Weir',
          publisher: 'Ballantine Books',
          isbn: '9780593135203',
          pages: 496,
          provider: 'hardcover',
        }),
      };
    });

    it('ignores OpenLibrary and Hardcover by default when toggles are disabled', async () => {
      const deps = {
        getProvider: (id: string) => {
          if (id === 'kitapyurdu') return mockKy;
          if (id === 'dr') return mockDr;
          if (id === 'openlibrary') return mockOl;
          if (id === 'hardcover') return mockHc;
          throw new Error(`Unknown provider: ${id}`);
        },
        getSettings: () => ({
          enableOpenLibrary: false,
          enableHardcover: false,
        } as any),
      };

      const hybrid = new HybridProvider(deps);
      const results = await hybrid.search('Dune');

      expect(mockKy.search).toHaveBeenCalledWith('Dune');
      expect(mockDr.search).toHaveBeenCalledWith('Dune');
      expect(mockOl.search).not.toHaveBeenCalled();
      expect(mockHc.search).not.toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].providers).toEqual(['kitapyurdu']);
    });

    it('queries OpenLibrary when enableOpenLibrary is true and deduplicates by ISBN', async () => {
      const deps = {
        getProvider: (id: string) => {
          if (id === 'kitapyurdu') return mockKy;
          if (id === 'dr') return mockDr;
          if (id === 'openlibrary') return mockOl;
          throw new Error(`Unknown provider: ${id}`);
        },
        getSettings: () => ({
          enableOpenLibrary: true,
          enableHardcover: false,
        } as any),
      };

      const hybrid = new HybridProvider(deps);
      const results = await hybrid.search('Dune');

      expect(mockKy.search).toHaveBeenCalledWith('Dune');
      expect(mockOl.search).toHaveBeenCalledWith('Dune');

      // Matching ISBN (9786053754794) unifies into a single merged result!
      expect(results).toHaveLength(1);
      expect(results[0].provider).toBe('hybrid');
      expect(results[0].providers).toEqual(['kitapyurdu', 'openlibrary']);
      expect(results[0].sources?.kitapyurdu).toBeDefined();
      expect(results[0].sources?.openlibrary).toBeDefined();
      expect(results[0].coverUrl).toBe(
        'https://covers.openlibrary.org/b/id/980253-L.jpg'
      );
    });

    it('queries Hardcover when enableHardcover is true and includes foreign books in results', async () => {
      const deps = {
        getProvider: (id: string) => {
          if (id === 'kitapyurdu') return mockKy;
          if (id === 'dr') return mockDr;
          if (id === 'hardcover') return mockHc;
          throw new Error(`Unknown provider: ${id}`);
        },
        getSettings: () => ({
          enableOpenLibrary: false,
          enableHardcover: true,
        } as any),
      };

      const hybrid = new HybridProvider(deps);
      const results = await hybrid.search('Hail Mary');

      expect(mockHc.search).toHaveBeenCalledWith('Hail Mary');
      const hcItem = results.find((r) => r.title === 'Project Hail Mary');
      expect(hcItem).toBeDefined();
      expect(hcItem?.provider).toBe('hardcover');
      expect(hcItem?.providers).toEqual(['hardcover']);
    });

    it('getFullBookData combines details across 3 providers (Kitapyurdu, D&R, OpenLibrary)', async () => {
      const deps = {
        getProvider: (id: string) => {
          if (id === 'kitapyurdu') return mockKy;
          if (id === 'dr') return mockDr;
          if (id === 'openlibrary') return mockOl;
          throw new Error(`Unknown provider: ${id}`);
        },
      };

      const hybrid = new HybridProvider(deps);

      const multiItem: SearchResultItem = {
        id: 'multi_dune',
        title: 'Dune',
        author: 'Frank Herbert',
        publisher: 'İthaki',
        url: 'https://ky.test/dune',
        coverUrl: '',
        provider: 'hybrid',
        providers: ['kitapyurdu', 'dr', 'openlibrary'],
        sources: {
          kitapyurdu: {
            id: 'ky1',
            title: 'Dune',
            author: 'Frank Herbert',
            publisher: 'İthaki Yayınları',
            url: 'https://ky.test/dune',
            coverUrl: '',
          },
          dr: {
            id: 'dr1',
            title: 'Dune',
            author: 'Frank Herbert',
            publisher: 'İthaki',
            url: 'https://dr.test/dune',
            coverUrl: '',
          },
          openlibrary: {
            id: '/works/OL893414W',
            title: 'Dune',
            author: 'Frank Herbert',
            publisher: 'Chilton',
            url: 'https://openlibrary.org/works/OL893414W',
            coverUrl: '',
          },
        },
      };

      const book = await hybrid.getFullBookData(multiItem);

      expect(mockKy.getBookDetails).toHaveBeenCalled();
      expect(mockDr.getBookDetails).toHaveBeenCalled();
      expect(mockOl.getBookDetails).toHaveBeenCalled();

      expect(book.title).toBe('Dune');
      expect(book.pages).toBe(712); // from Kitapyurdu
      expect(book.description).toBe('A masterpiece of science fiction.'); // from OpenLibrary
      expect(book.provider).toBe('hybrid');
    });

    it('BookAggregator dynamically registers and unregisters global providers via setSettings', () => {
      const aggregator = new BookAggregator();

      // Default: kitapyurdu, dr
      expect(aggregator.getAvailableProviders().map((p) => p.id)).toEqual([
        'kitapyurdu',
        'dr',
      ]);

      // Enable OpenLibrary
      aggregator.setSettings({
        enableOpenLibrary: true,
        enableHardcover: false,
        hardcoverApiKey: '',
      } as any);

      expect(aggregator.getAvailableProviders().map((p) => p.id)).toEqual([
        'kitapyurdu',
        'dr',
        'openlibrary',
      ]);
      expect(aggregator.isProviderEnabled('openlibrary')).toBe(true);
      expect(aggregator.isProviderEnabled('hardcover')).toBe(false);

      // Enable Hardcover too
      aggregator.setSettings({
        enableOpenLibrary: true,
        enableHardcover: true,
        hardcoverApiKey: 'hc_token_xyz',
      } as any);

      expect(aggregator.getAvailableProviders().map((p) => p.id)).toEqual([
        'kitapyurdu',
        'dr',
        'openlibrary',
        'hardcover',
      ]);
      expect(aggregator.isProviderEnabled('hardcover')).toBe(true);

      // Disable both
      aggregator.setSettings({
        enableOpenLibrary: false,
        enableHardcover: false,
        hardcoverApiKey: '',
      } as any);

      expect(aggregator.getAvailableProviders().map((p) => p.id)).toEqual([
        'kitapyurdu',
        'dr',
      ]);
    });

    it('mergeBookMetadata correctly selects fields when dr is first argument or when combining global providers', () => {
      const drBook: BookMetadata = {
        id: 'dr_1',
        title: 'Dune (D&R Title)',
        author: 'Frank Herbert',
        publisher: 'İthaki',
        isbn: '9780441172719',
        description: 'D&R Turkish blurb',
        rating: 4.8,
        ratingCount: 150,
        url: 'https://dr.test/dune',
        provider: 'dr',
      };

      const olBook: BookMetadata = {
        id: '/works/OL893414W',
        title: 'Dune (OpenLibrary Title)',
        author: 'Frank Herbert',
        publisher: 'Chilton',
        isbn: '9780441172719',
        description: 'OpenLibrary English synopsis',
        url: 'https://openlibrary.org/works/OL893414W',
        provider: 'openlibrary',
      };

      // Select D&R description specifically
      const merged = mergeBookMetadata(drBook, olBook, {
        description: 'dr',
        title: 'openlibrary',
      });

      expect(merged.description).toBe('D&R Turkish blurb');
      expect(merged.title).toBe('Dune (OpenLibrary Title)');

      // Combine OpenLibrary and Hardcover
      const hcBook: BookMetadata = {
        id: 'hc_10',
        title: 'Dune (Hardcover Title)',
        author: 'Frank Herbert',
        publisher: 'Ace',
        isbn: '9780441172719',
        description: 'Hardcover community synopsis',
        rating: 4.6,
        ratingCount: 9500,
        url: 'https://hardcover.app/books/dune',
        provider: 'hardcover',
      };

      const globalMerged = mergeBookMetadata(olBook, hcBook, {
        description: 'hardcover',
        title: 'openlibrary',
        rating: 'hardcover',
      });

      expect(globalMerged.description).toBe('Hardcover community synopsis');
      expect(globalMerged.title).toBe('Dune (OpenLibrary Title)');
      expect(globalMerged.rating).toBe(4.6);
      expect(globalMerged.ratingCount).toBe(9500);
    });

    it('BookAggregator resets defaultProvider to hybrid if selected global provider is disabled', () => {
      const aggregator = new BookAggregator();

      aggregator.setSettings({
        enableOpenLibrary: true,
        enableHardcover: false,
        hardcoverApiKey: '',
        defaultProvider: 'openlibrary',
      } as any);

      aggregator.setDefaultProvider('openlibrary');
      expect(aggregator.getDefaultProviderId()).toBe('openlibrary');

      // Now disable OpenLibrary
      const newSettings = {
        enableOpenLibrary: false,
        enableHardcover: false,
        hardcoverApiKey: '',
        defaultProvider: 'openlibrary',
      } as any;

      aggregator.setSettings(newSettings);

      expect(aggregator.getDefaultProviderId()).toBe('hybrid');
      expect(newSettings.defaultProvider).toBe('hybrid');
    });

    it('matches books using allIsbns and allPublishers when primary isbn differs or is absent', () => {
      const kyItem: SearchResultItem = {
        id: 'ky-dunyalar-savasi',
        title: 'Dünyalar Savaşı',
        author: 'H. G. Wells',
        publisher: 'İthaki Yayınları',
        isbn: '9786053757412',
        url: 'https://kitapyurdu.com/kitap/1',
        coverUrl: 'https://img.kitapyurdu.com/1.jpg',
      };

      // OpenLibrary item representing a Work with multiple ISBNs and multiple publishers
      const olWorkItem: SearchResultItem = {
        id: '/works/OL26160451W',
        title: 'Dünyalar Savasi',
        author: 'H. G. Wells',
        publisher: 'Dorlion Yayinevi',
        isbn: '9786052499115', // Dorlion ISBN as primary
        allIsbns: ['9786053757412', '9786052398739', '9786052499115'],
        allPublishers: ['Dorlion Yayinevi', 'Ithaki Yayinlari', 'Ren Kitap'],
        url: 'https://openlibrary.org/works/OL26160451W',
        coverUrl: 'https://covers.openlibrary.org/1.jpg',
        provider: 'openlibrary',
      };

      expect(areBooksMatching(kyItem, olWorkItem)).toBe(true);

      const merged = mergeSearchResults([kyItem], [], [olWorkItem]);
      expect(merged).toHaveLength(1);
      expect(merged[0].providers).toContain('kitapyurdu');
      expect(merged[0].providers).toContain('openlibrary');
      expect(merged[0].sources?.openlibrary?.isbn).toBe('9786053757412');
    });

    it('merges metadata cleanly across 3 and 4 providers using allProviders map', () => {
      const kyBook: BookMetadata = {
        id: 'ky_1',
        title: 'Dünyalar Savaşı (KY)',
        author: 'H. G. Wells',
        publisher: 'İthaki Yayınları',
        isbn: '9786053757412',
        pages: 256,
        publishDate: '2024-11-13',
        format: 'Karton Kapak',
        price: '157.30 TRY',
        rating: 5,
        ratingCount: 120,
        provider: 'kitapyurdu',
        url: 'https://kitapyurdu.com/1',
      };

      const drBook: BookMetadata = {
        id: 'dr_1',
        title: 'Dünyalar Savaşı (DR)',
        author: 'H. G. Wells',
        publisher: 'İthaki',
        isbn: '9786053757412',
        genres: ['Bilimkurgu', 'Roman'],
        price: '260.00 TL',
        provider: 'dr',
        url: 'https://dr.com.tr/1',
      };

      const olBook: BookMetadata = {
        id: 'ol_1',
        title: 'The War of the Worlds (OL)',
        author: 'H. G. Wells',
        publisher: 'Ithaki Yayinlari',
        isbn: '9786053757412',
        description: 'Comprehensive OpenLibrary summary...',
        provider: 'openlibrary',
        url: 'https://openlibrary.org/1',
      };

      const hcBook: BookMetadata = {
        id: 'hc_1',
        title: 'The War of the Worlds (HC)',
        author: 'H. G. Wells',
        publisher: 'Penguin',
        isbn: '9786053757412',
        rating: 4.8,
        ratingCount: 15400,
        provider: 'hardcover',
        url: 'https://hardcover.app/1',
      };

      const allProviders = [
        { id: 'kitapyurdu', data: kyBook },
        { id: 'dr', data: drBook },
        { id: 'openlibrary', data: olBook },
        { id: 'hardcover', data: hcBook },
      ];

      const merged = mergeBookMetadata(
        kyBook,
        drBook,
        {
          title: 'kitapyurdu',
          genres: 'dr',
          description: 'openlibrary',
          rating: 'hardcover',
        },
        allProviders
      );

      expect(merged.title).toBe('Dünyalar Savaşı (KY)');
      expect(merged.genres).toEqual(['Bilimkurgu', 'Roman']);
      expect(merged.description).toBe('Comprehensive OpenLibrary summary...');
      expect(merged.rating).toBe(4.8);
      expect(merged.ratingCount).toBe(15400);
      expect(merged.pages).toBe(256);
      expect(merged.price).toBe('157.30 TRY');
    });
  });
});


