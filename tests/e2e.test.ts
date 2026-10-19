import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KitapyurduProvider } from '../src/providers/kitapyurdu';
import { BinkitapProvider } from '../src/providers/binkitap';
import { BookAggregator } from '../src/providers/aggregator';
import { renderBookTemplate, sanitizeFileName } from '../src/templates/engine';
import { DEFAULT_SETTINGS, DEFAULT_NOTE_TEMPLATE, BookMetadata } from '../src/types';
import { loadKitapyurduFixture, load1000KitapFixture, load1000KitapJsonFixture } from './helpers/fixtureLoader';
import { requestUrl } from 'obsidian';

describe('Tier 3 & Tier 4: E2E Workflows & Real-World Scenarios', () => {
  let kyProvider: KitapyurduProvider;
  let bkProvider: BinkitapProvider;
  let aggregator: BookAggregator;

  beforeEach(() => {
    (requestUrl as any).mockReset?.();
    kyProvider = new KitapyurduProvider();
    bkProvider = new BinkitapProvider();
    aggregator = new BookAggregator(kyProvider, bkProvider);
  });

  describe('Real-World Scenario 1: Dune (Standard Translated Epic)', () => {
    it('executes full pipeline: search -> detail -> 1000Kitap enrichment -> note generation -> filename sanitization', async () => {
      // 1. Mock Search Request
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: loadKitapyurduFixture('search_dune.html'),
      });

      const searchResults = await aggregator.search('dune');
      expect(searchResults.length).toBeGreaterThan(0);
      const selectedItem = searchResults.find((item) => item.id === '375312');
      expect(selectedItem).toBeDefined();

      // 2. Mock Kitapyurdu Detail Request
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: loadKitapyurduFixture('product_dune_375312.html'),
      });

      // 3. Mock 1000Kitap Enrichment Requests (Search + Quotes)
      (requestUrl as any)
        .mockResolvedValueOnce({
          status: 200,
          text: load1000KitapFixture('1000kitap_search_suc_ve_ceza.html'), // mock search response
        })
        .mockResolvedValueOnce({
          status: 200,
          json: load1000KitapJsonFixture('1000kitap_api_quotes_121.json'),
          text: JSON.stringify(load1000KitapJsonFixture('1000kitap_api_quotes_121.json')),
        });

      // 4. Execute Aggregation
      const fullBook = await aggregator.getFullBookData(selectedItem!, DEFAULT_SETTINGS);

      // Verify Bibliographic Accuracy
      expect(fullBook.title).toBe('Dune');
      expect(fullBook.author).toBe('Frank Herbert');
      expect(fullBook.publisher).toBe('İTHAKİ YAYINLARI');
      expect(fullBook.translator).toBe('Dost Körpe');
      expect(fullBook.isbn).toBe('9786053754794');
      expect(fullBook.pages).toBe(712);

      // 5. Generate Note Markdown
      const noteMarkdown = renderBookTemplate(DEFAULT_NOTE_TEMPLATE, fullBook);

      expect(noteMarkdown).toContain('baslik: "Dune"');
      expect(noteMarkdown).toContain('yazar: "Frank Herbert"');
      expect(noteMarkdown).toContain('yayinevi: "İTHAKİ YAYINLARI"');
      expect(noteMarkdown).toContain('cevirmen: "Dost Körpe"');
      expect(noteMarkdown).toContain('isbn: "9786053754794"');
      expect(noteMarkdown).toContain('# Dune');
      expect(noteMarkdown).toContain('Yüzüklerin Efendisi dışında');

      // 6. Generate Sanitized Note Filename
      const filename = sanitizeFileName(`${fullBook.title} - ${fullBook.author}`);
      expect(filename).toBe('Dune - Frank Herbert');
    });
  });

  describe('Real-World Scenario 2: Kürk Mantolu Madonna (Turkish Original Work)', () => {
    it('handles Turkish native work with null translator and rich reader stats', async () => {
      // 1. Kitapyurdu Detail
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: loadKitapyurduFixture('product_kurk_mantolu_569235.html'),
      });

      // 2. 1000Kitap Search
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: load1000KitapFixture('1000kitap_book_kurk_mantolu_madonna.html'),
      });

      const book = await kyProvider.getBookDetails('https://www.kitapyurdu.com/kitap/kurk-mantolu-madonna/569235.html');
      expect(book.title).toBe('Kürk Mantolu Madonna');
      expect(book.author).toBe('Sabahattin Ali');
      expect(book.translator).toBeUndefined();

      const note = renderBookTemplate(DEFAULT_NOTE_TEMPLATE, book);
      expect(note).toContain('baslik: "Kürk Mantolu Madonna"');
      expect(note).toContain('yazar: "Sabahattin Ali"');
      expect(note).not.toContain('undefined');
      expect(note).not.toContain('null');
    });
  });

  describe('Real-World Scenario 3: Ulusların Düşüşü (Multiple Co-Authors)', () => {
    it('preserves both co-authors without truncation in generated note', async () => {
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: loadKitapyurduFixture('product_uluslarin_dususu_325768.html'),
      });

      const book = await kyProvider.getBookDetails('https://www.kitapyurdu.com/kitap/uluslarin-dususu/325768.html');
      expect(book.author).toBe('Daron Acemoğlu, James A. Robinson');
      expect(book.translator).toBe('Solina Silahlı');

      const note = renderBookTemplate(DEFAULT_NOTE_TEMPLATE, book);
      expect(note).toContain('yazar: "Daron Acemoğlu, James A. Robinson"');
      expect(note).toContain('cevirmen: "Solina Silahlı"');

      const filename = sanitizeFileName(`${book.title} - ${book.author}`);
      expect(filename).toBe('Ulusların Düşüşü - Daron Acemoğlu, James A. Robinson');
    });
  });

  describe('Real-World Scenario 4: İki Kule (Multiple Translators)', () => {
    it('aggregates multiple translators into note YAML and body', async () => {
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: loadKitapyurduFixture('product_iki_kule_41789.html'),
      });

      const book = await kyProvider.getBookDetails('https://www.kitapyurdu.com/kitap/iki-kule-yuzuklerin-efendisi-2/41789.html');
      expect(book.translator).toBe('Bülent Somay, Çiğdem Erkal İpek');

      const note = renderBookTemplate(DEFAULT_NOTE_TEMPLATE, book);
      expect(note).toContain('cevirmen: "Bülent Somay, Çiğdem Erkal İpek"');
    });
  });

  describe('Real-World Scenario 5: Suç ve Ceza (1000Kitap Quotes & Zero-Page Handling)', () => {
    it('renders blockquotes and avoids printing "s. 0"', async () => {
      const bookWithQuotes: BookMetadata = {
        id: '121',
        url: 'https://www.kitapyurdu.com/kitap/suc-ve-ceza/121.html',
        title: 'Suç ve Ceza',
        author: 'Fyodor Dostoyevski',
        publisher: 'İş Bankası Kültür Yayınları',
        translator: 'Mazlum Beyhan',
        isbn: '9789754589023',
        pages: 704,
        quotes: [
          {
            text: 'Bence, gerçekten büyük insanlar, büyük acılar çekmek zorundadır.',
            author: 'Fyodor Dostoyevski',
            page: '330',
          },
          {
            text: 'Bir iple intihar da edebilirsin salıncak da kurabilirsin. Hayatın ipleri senin elinde.',
            author: 'Fyodor Dostoyevski',
            // page 0 or undefined
          },
        ],
      };

      const note = renderBookTemplate(DEFAULT_NOTE_TEMPLATE, bookWithQuotes);

      expect(note).toContain('Bence, gerçekten büyük insanlar, büyük acılar çekmek zorundadır.');
      expect(note).toContain('s. 330');
      expect(note).toContain('Bir iple intihar da edebilirsin salıncak da kurabilirsin.');
      expect(note).not.toContain('s. 0');
    });
  });

  describe('Real-World Scenario 6: Veri Yapıları ve Algoritmalar (Out-of-Print Title)', () => {
    it('successfully produces note for out-of-print book missing Product schema', async () => {
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: loadKitapyurduFixture('product_veri_yapilari_33028.html'),
      });

      const book = await kyProvider.getBookDetails('https://www.kitapyurdu.com/kitap/veri-yapilari-ve-algoritmalar/33028.html');
      expect(book.pages).toBe(290);
      expect(book.rating).toBeUndefined();

      const note = renderBookTemplate(DEFAULT_NOTE_TEMPLATE, book);
      expect(note).toContain('sayfa: 290');
      expect(note).not.toContain('undefined');
    });
  });

  describe('BookSearchModal Integration: Debounce, Stale-Response Guard, Folder Creation & Active Note Insertion', () => {
    it('guards against stale search responses when a newer query supersedes an older one', async () => {
      const { BookSearchModal } = await import('../src/modal/searchModal');
      let resolveFirst!: (val: any[]) => void;
      const firstPromise = new Promise<any[]>((r) => {
        resolveFirst = r;
      });

      const mockAggregator = {
        search: vi
          .fn()
          .mockReturnValueOnce(firstPromise)
          .mockResolvedValueOnce([
            {
              id: '2',
              title: 'İkinci Sorgu Kitabı',
              author: 'Yazar 2',
              publisher: 'Yayınevi 2',
              url: 'https://www.kitapyurdu.com/kitap/2.html',
              coverUrl: '',
            },
          ]),
        getFullBookData: vi.fn(),
      };

      const mockPlugin: any = { settings: { ...DEFAULT_SETTINGS } };
      const modal = new BookSearchModal({} as any, mockPlugin, {
        debounceMs: 0,
        aggregator: mockAggregator as any,
      });

      const call1 = modal.getSuggestions('ilk');
      const call2 = modal.getSuggestions('ikinci');

      const res2 = await call2;
      expect(res2).toHaveLength(1);
      expect(res2[0].title).toBe('İkinci Sorgu Kitabı');

      // Now resolve the stale first request; it must be discarded and return []
      resolveFirst([
        {
          id: '1',
          title: 'Eski Sonuç',
          author: 'Yazar 1',
          publisher: 'Yayınevi 1',
          url: 'https://www.kitapyurdu.com/kitap/1.html',
          coverUrl: '',
        },
      ]);
      const res1 = await call1;
      expect(res1).toEqual([]);
    });

    it('creates nested target folders safely and writes note file on book selection', async () => {
      const { BookSearchModal } = await import('../src/modal/searchModal');
      const createdFolders: string[] = [];
      const createdFiles: Record<string, string> = {};
      const openFileMock = vi.fn();

      const mockApp: any = {
        vault: {
          getAbstractFileByPath: vi.fn((p: string) => {
            if (createdFolders.includes(p)) return { path: p };
            if (createdFiles[p]) return { path: p };
            return null;
          }),
          createFolder: vi.fn(async (p: string) => {
            createdFolders.push(p);
          }),
          create: vi.fn(async (p: string, content: string) => {
            createdFiles[p] = content;
            return { path: p };
          }),
        },
        workspace: {
          getLeaf: vi.fn(() => ({ openFile: openFileMock })),
        },
      };

      const mockAggregator = {
        search: vi.fn().mockResolvedValue([]),
        getFullBookData: vi.fn().mockResolvedValue({
          id: '375312',
          url: 'https://www.kitapyurdu.com/kitap/dune/375312.html',
          title: 'Dune: Çöl Gezegeni',
          author: 'Frank Herbert',
          publisher: 'İTHAKİ YAYINLARI',
          isbn: '9786053754794',
          quotes: [],
        }),
      };

      const mockPlugin: any = {
        settings: {
          ...DEFAULT_SETTINGS,
          targetFolder: 'Kitaplar/2026/Bilimkurgu',
        },
      };

      const modal = new BookSearchModal(mockApp, mockPlugin, {
        debounceMs: 0,
        aggregator: mockAggregator as any,
      });

      await modal.processBookSelection({
        id: '375312',
        title: 'Dune: Çöl Gezegeni',
        author: 'Frank Herbert',
        publisher: 'İTHAKİ YAYINLARI',
        url: 'https://www.kitapyurdu.com/kitap/dune/375312.html',
        coverUrl: '',
      });

      expect(createdFolders).toEqual([
        'Kitaplar',
        'Kitaplar/2026',
        'Kitaplar/2026/Bilimkurgu',
      ]);
      const expectedPath = 'Kitaplar/2026/Bilimkurgu/Dune - Çöl Gezegeni - Frank Herbert.md';
      expect(createdFiles[expectedPath]).toBeDefined();
      expect(createdFiles[expectedPath]).toContain('# Dune: Çöl Gezegeni');
      expect(openFileMock).toHaveBeenCalledTimes(1);
    });

    it('inserts rendered book metadata into active note when insertIntoActive is true', async () => {
      const { BookSearchModal } = await import('../src/modal/searchModal');
      const replaceSelectionMock = vi.fn();

      const mockApp: any = {
        workspace: {
          getActiveFile: vi.fn(() => ({ path: 'Gunluk.md' })),
          activeEditor: {
            editor: {
              replaceSelection: replaceSelectionMock,
            },
          },
        },
      };

      const mockAggregator = {
        search: vi.fn().mockResolvedValue([]),
        getFullBookData: vi.fn().mockResolvedValue({
          id: '569235',
          url: 'https://www.kitapyurdu.com/kitap/kurk-mantolu-madonna/569235.html',
          title: 'Kürk Mantolu Madonna',
          author: 'Sabahattin Ali',
          publisher: 'YKY',
          isbn: '9789753638029',
          quotes: [],
        }),
      };

      const mockPlugin: any = { settings: { ...DEFAULT_SETTINGS } };
      const modal = new BookSearchModal(mockApp, mockPlugin, {
        insertIntoActive: true,
        debounceMs: 0,
        aggregator: mockAggregator as any,
      });

      await modal.processBookSelection({
        id: '569235',
        title: 'Kürk Mantolu Madonna',
        author: 'Sabahattin Ali',
        publisher: 'YKY',
        url: 'https://www.kitapyurdu.com/kitap/kurk-mantolu-madonna/569235.html',
        coverUrl: '',
      });

      expect(replaceSelectionMock).toHaveBeenCalledTimes(1);
      expect(replaceSelectionMock.mock.calls[0][0]).toContain('# Kürk Mantolu Madonna');
    });

    it('updates existing note file via vault.modify when book note already exists in target folder', async () => {
      const { BookSearchModal } = await import('../src/modal/searchModal');
      const modifyMock = vi.fn();
      const createMock = vi.fn();
      const openFileMock = vi.fn();
      const existingFileObj = { path: 'Kitaplar/Dune - Frank Herbert.md' };

      const mockApp: any = {
        vault: {
          getAbstractFileByPath: vi.fn((p: string) => {
            if (p === 'Kitaplar') return { path: 'Kitaplar' };
            if (p === 'Kitaplar/Dune - Frank Herbert.md') return existingFileObj;
            return null;
          }),
          createFolder: vi.fn(),
          create: createMock,
          modify: modifyMock,
        },
        workspace: {
          getLeaf: vi.fn(() => ({ openFile: openFileMock })),
        },
      };

      const mockAggregator = {
        search: vi.fn().mockResolvedValue([]),
        getFullBookData: vi.fn().mockResolvedValue({
          id: '375312',
          url: 'https://www.kitapyurdu.com/kitap/dune/375312.html',
          title: 'Dune',
          author: 'Frank Herbert',
          publisher: 'İTHAKİ YAYINLARI',
          isbn: '9786053754794',
          quotes: [],
        }),
      };

      const mockPlugin: any = { settings: { ...DEFAULT_SETTINGS } };
      const modal = new BookSearchModal(mockApp, mockPlugin, {
        debounceMs: 0,
        aggregator: mockAggregator as any,
      });

      const resultFile = await modal.processBookSelection({
        id: '375312',
        title: 'Dune',
        author: 'Frank Herbert',
        publisher: 'İTHAKİ YAYINLARI',
        url: 'https://www.kitapyurdu.com/kitap/dune/375312.html',
        coverUrl: '',
      });

      expect(createMock).not.toHaveBeenCalled();
      expect(modifyMock).toHaveBeenCalledTimes(1);
      expect(modifyMock).toHaveBeenCalledWith(existingFileObj, expect.stringContaining('# Dune'));
      expect(openFileMock).toHaveBeenCalledWith(existingFileObj);
      expect(resultFile).toBe(existingFileObj);
    });
  });
});

