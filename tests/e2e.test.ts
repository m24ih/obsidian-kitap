import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KitapyurduProvider } from '../src/providers/kitapyurdu';
import { BookAggregator } from '../src/providers/aggregator';
import { renderBookTemplate, sanitizeFileName } from '../src/templates/engine';
import { DEFAULT_SETTINGS, DEFAULT_NOTE_TEMPLATE, BookMetadata } from '../src/types';
import { loadKitapyurduFixture } from './helpers/fixtureLoader';
import { requestUrl } from 'obsidian';

describe('Tier 3 & Tier 4: E2E Workflows & Real-World Scenarios', () => {
  let kyProvider: KitapyurduProvider;
  let aggregator: BookAggregator;

  beforeEach(() => {
    (requestUrl as any).mockReset?.();
    kyProvider = new KitapyurduProvider();
    aggregator = new BookAggregator(kyProvider);
  });

  describe('Real-World Scenario 1: Dune (Standard Translated Epic)', () => {
    it('executes full pipeline: search -> detail -> note generation -> filename sanitization', async () => {
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

      // 3. Execute Aggregation
      const fullBook = await aggregator.getFullBookData(selectedItem!, DEFAULT_SETTINGS);

      // Verify Bibliographic Accuracy
      expect(fullBook.title).toBe('Dune');
      expect(fullBook.author).toBe('Frank Herbert');
      expect(fullBook.publisher).toBe('İTHAKİ YAYINLARI');
      expect(fullBook.translator).toBe('Dost Körpe');
      expect(fullBook.isbn).toBe('9786053754794');
      expect(fullBook.pages).toBe(712);

      // 4. Generate Note Markdown
      const noteMarkdown = renderBookTemplate(DEFAULT_NOTE_TEMPLATE, fullBook);

      expect(noteMarkdown).toContain('baslik: "Dune"');
      expect(noteMarkdown).toContain('yazar: "Frank Herbert"');
      expect(noteMarkdown).toContain('yayinevi: "İTHAKİ YAYINLARI"');
      expect(noteMarkdown).toContain('cevirmen: "Dost Körpe"');
      expect(noteMarkdown).toContain('isbn: "9786053754794"');
      expect(noteMarkdown).toContain('# Dune');
      expect(noteMarkdown).toContain('Yüzüklerin Efendisi dışında');

      // 5. Generate Sanitized Note Filename
      const filename = sanitizeFileName(`${fullBook.title} - ${fullBook.author}`);
      expect(filename).toBe('Dune - Frank Herbert');
    });
  });

  describe('Real-World Scenario 2: Kürk Mantolu Madonna (Turkish Original Work)', () => {
    it('handles Turkish native work with null translator', async () => {
      // 1. Kitapyurdu Detail
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: loadKitapyurduFixture('product_kurk_mantolu_569235.html'),
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

  describe('Real-World Scenario 5: Suç ve Ceza (Full Bibliographic Details)', () => {
    it('renders note correctly without legacy quotes', async () => {
      const bookData: BookMetadata = {
        id: '121',
        url: 'https://www.kitapyurdu.com/kitap/suc-ve-ceza/121.html',
        title: 'Suç ve Ceza',
        author: 'Fyodor Dostoyevski',
        publisher: 'İş Bankası Kültür Yayınları',
        translator: 'Mazlum Beyhan',
        isbn: '9789754589023',
        pages: 704,
        rating: 4.9,
      };

      const note = renderBookTemplate(DEFAULT_NOTE_TEMPLATE, bookData);

      expect(note).toContain('baslik: "Suç ve Ceza"');
      expect(note).toContain('yazar: "Fyodor Dostoyevski"');
      expect(note).toContain('yayinevi: "İş Bankası Kültür Yayınları"');
      expect(note).toContain('cevirmen: "Mazlum Beyhan"');
      expect(note).toContain('sayfa: 704');
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

    it('performs debounced automatic search and sorts results with fuzzy relevance', async () => {
      const { BookSearchModal } = await import('../src/modal/searchModal');
      const searchMock = vi.fn().mockResolvedValue([
        {
          id: '1',
          title: 'Alplerin Son Üç Problemi',
          author: 'Yazar A',
          publisher: 'Yayınevi A',
          url: 'https://www.kitapyurdu.com/kitap/1.html',
          coverUrl: '',
        },
        {
          id: '2',
          title: 'Üç Cisim Problemi',
          author: 'Cixin Liu',
          publisher: 'İthaki',
          url: 'https://www.kitapyurdu.com/kitap/2.html',
          coverUrl: '',
        },
      ]);
      const mockAggregator = { search: searchMock, getFullBookData: vi.fn() };
      const mockPlugin: any = { settings: { ...DEFAULT_SETTINGS } };
      const mockApp: any = { vault: {}, workspace: {} };

      const modal = new BookSearchModal(mockApp, mockPlugin, {
        debounceMs: 50,
        aggregator: mockAggregator as any,
      });

      // Query with case-insensitive and unaccented letters
      const suggestionsPromise = modal.getSuggestions('uc cisim problemi');
      const results = await suggestionsPromise;

      expect(searchMock).toHaveBeenCalledWith('uc cisim problemi');
      expect(results).toHaveLength(2);
      // Fuzzy relevance puts exact match at the top
      expect(results[0].title).toBe('Üç Cisim Problemi');
      expect(results[1].title).toBe('Alplerin Son Üç Problemi');
    });

    it('flushes debounce and executes search immediately when Enter key is pressed', async () => {
      const { BookSearchModal } = await import('../src/modal/searchModal');
      const searchMock = vi.fn().mockResolvedValue([
        {
          id: '100',
          title: 'Aytozu Faciası',
          author: 'Arthur C. Clarke',
          publisher: 'İthaki',
          url: 'https://www.kitapyurdu.com/kitap/aytozu/100.html',
          coverUrl: '',
        },
      ]);
      const mockAggregator = { search: searchMock, getFullBookData: vi.fn() };
      const mockPlugin: any = { settings: { ...DEFAULT_SETTINGS } };
      const mockApp: any = { vault: {}, workspace: {} };

      const modal = new BookSearchModal(mockApp, mockPlugin, {
        debounceMs: 5000, // Very long debounce
        aggregator: mockAggregator as any,
      });
      modal.open();

      const searchPromise = modal.getSuggestions('aytozu');

      // Immediate Enter via scope or input keydown flushes debounce without waiting 5 seconds
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
      (modal as any).scope.handleKey(enterEvent);

      const results = await searchPromise;
      expect(searchMock).toHaveBeenCalledWith('aytozu');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Aytozu Faciası');
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

    it('downloads cover locally and embeds wikilink image in note when downloadCovers is enabled', async () => {
      const { BookSearchModal } = await import('../src/modal/searchModal');
      const fakeBuffer = new ArrayBuffer(16);
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
        arrayBuffer: fakeBuffer,
      });

      let createdNoteContent = '';
      const createdBinaries: Record<string, ArrayBuffer> = {};

      const mockApp: any = {
        vault: {
          getAbstractFileByPath: vi.fn().mockReturnValue(null),
          createFolder: vi.fn().mockResolvedValue(undefined),
          createBinary: vi.fn(async (p: string, buf: ArrayBuffer) => {
            createdBinaries[p] = buf;
          }),
          create: vi.fn(async (_p: string, content: string) => {
            createdNoteContent = content;
            return { path: _p };
          }),
        },
        workspace: {
          getLeaf: vi.fn(() => ({ openFile: vi.fn() })),
        },
      };

      const mockAggregator = {
        search: vi.fn().mockResolvedValue([]),
        getFullBookData: vi.fn().mockResolvedValue({
          id: '375312',
          url: 'https://www.kitapyurdu.com/kitap/dune/375312.html',
          title: 'Dune',
          author: 'Frank Herbert',
          publisher: 'İthaki Yayınları',
          isbn: '9786053754794',
          coverUrl: 'https://img.kitapyurdu.com/covers/dune.jpg',
        }),
      };

      const mockPlugin: any = {
        settings: {
          ...DEFAULT_SETTINGS,
          downloadCovers: true,
          coverFolder: 'Kitaplar/Kapaklar',
        },
      };

      const modal = new BookSearchModal(mockApp, mockPlugin, {
        debounceMs: 0,
        aggregator: mockAggregator as any,
      });

      await modal.processBookSelection({
        id: '375312',
        title: 'Dune',
        author: 'Frank Herbert',
        publisher: 'İthaki Yayınları',
        url: 'https://www.kitapyurdu.com/kitap/dune/375312.html',
        coverUrl: 'https://img.kitapyurdu.com/covers/dune.jpg',
      });

      // Kapak binary dosyası indirilip kaydedilmeli
      expect(createdBinaries['Kitaplar/Kapaklar/Dune - Frank Herbert.jpg']).toBe(fakeBuffer);

      // Not içeriğinde hem frontmatter'da hem gövdede yerel kapak olmalı
      expect(createdNoteContent).toContain('kapak: "[[Kitaplar/Kapaklar/Dune - Frank Herbert.jpg]]"');
      expect(createdNoteContent).toContain('![[Kitaplar/Kapaklar/Dune - Frank Herbert.jpg|200]]');
      expect(createdNoteContent).not.toContain('https://img.kitapyurdu.com/covers/dune.jpg');
    });
  });
});

