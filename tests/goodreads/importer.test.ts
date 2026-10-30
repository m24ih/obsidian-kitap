import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoodreadsImporter, buildExistingNoteUpdatePatch } from '../../src/goodreads/importer';
import { GoodreadsEnrichmentService } from '../../src/goodreads/enrichmentService';
import { parseGoodreadsCsv } from '../../src/goodreads/csvParser';
import { mapGoodreadsRow } from '../../src/goodreads/mapper';
import { scanVaultBooks } from '../../src/goodreads/vaultScanner';
import { detectDuplicates } from '../../src/goodreads/duplicateDetector';
import { createMockObsidianApp } from '../e2e/harness/mockVault';
import {
  SAMPLE_CSV_STANDARD,
  SAMPLE_EXISTING_VAULT_NOTE_DUNE,
} from '../e2e/harness/fixtures';
import { DEFAULT_SETTINGS, type KitapPluginSettings, type SearchResultItem } from '../../src/types';
import type KitapPlugin from '../../src/main';
import type { IBookAggregator } from '../../src/providers/aggregator';

describe('GoodreadsImporter Orchestration Suite (Milestone 4)', () => {
  let mockEnv: ReturnType<typeof createMockObsidianApp>;
  let mockPlugin: KitapPlugin;
  let mockAggregator: IBookAggregator;
  let searchSpy: ReturnType<typeof vi.fn<IBookAggregator['search']>>;
  let getFullBookDataSpy: ReturnType<typeof vi.fn<IBookAggregator['getFullBookData']>>;

  beforeEach(() => {
    mockEnv = createMockObsidianApp();
    searchSpy = vi.fn<IBookAggregator['search']>().mockResolvedValue([]);
    getFullBookDataSpy = vi.fn<IBookAggregator['getFullBookData']>();

    mockAggregator = {
      search: searchSpy,
      getFullBookData: getFullBookDataSpy,
      getProvider: vi.fn<IBookAggregator['getProvider']>(),
      registerProvider: vi.fn<IBookAggregator['registerProvider']>(),
      getAvailableProviders: vi.fn<IBookAggregator['getAvailableProviders']>().mockReturnValue([]),
      setDefaultProvider: vi.fn<IBookAggregator['setDefaultProvider']>(),
      getDefaultProviderId: vi.fn<IBookAggregator['getDefaultProviderId']>().mockReturnValue('hybrid'),
    };

    const pluginMock = {
      app: mockEnv.app,
      settings: {
        ...DEFAULT_SETTINGS,
        targetFolder: 'Kitaplar',
        downloadCovers: false,
      } as KitapPluginSettings,
      aggregator: mockAggregator,
      activeImportModal: null,
    };

    mockPlugin = pluginMock as unknown as KitapPlugin;
  });

  it('imports new books completely offline with zero provider network calls when enrichFromProviders is false', async () => {
    const rows = parseGoodreadsCsv(SAMPLE_CSV_STANDARD);
    const parsedBooks = rows.map((r) => mapGoodreadsRow(r, mockPlugin.settings));
    const vaultBooks = await scanVaultBooks(mockEnv.app, 'Kitaplar');
    const scanResult = detectDuplicates(parsedBooks, vaultBooks);

    const importer = new GoodreadsImporter(mockEnv.app, mockPlugin);
    const result = await importer.importBooks(scanResult, {
      updateExisting: false,
      enrichFromProviders: false,
    });

    expect(searchSpy).not.toHaveBeenCalled();
    expect(getFullBookDataSpy).not.toHaveBeenCalled();
    expect(result.importedCount).toBe(scanResult.newBooks.length);
    expect(result.updatedCount).toBe(0);
    expect(result.errors).toHaveLength(0);

    const mdFiles = mockEnv.vault.getMarkdownFiles();
    expect(mdFiles.length).toBe(scanResult.newBooks.length);
  });

  it('skips existing books without modifying them when updateExisting is false', async () => {
    const duneFile = mockEnv.vault.createFile(
      'Kitaplar/Dune.md',
      SAMPLE_EXISTING_VAULT_NOTE_DUNE,
      {
        isbn: '9780441172719',
        baslik: 'Dune',
        yazar: 'Frank Herbert',
      }
    );

    const modifySpy = vi.spyOn(mockEnv.app.vault, 'modify');

    const rows = parseGoodreadsCsv(SAMPLE_CSV_STANDARD);
    const parsedBooks = rows.map((r) => mapGoodreadsRow(r, mockPlugin.settings));
    const vaultBooks = await scanVaultBooks(mockEnv.app, 'Kitaplar');
    const scanResult = detectDuplicates(parsedBooks, vaultBooks);

    expect(scanResult.existingBooks.length).toBeGreaterThanOrEqual(1);

    const importer = new GoodreadsImporter(mockEnv.app, mockPlugin);
    const result = await importer.importBooks(scanResult, {
      updateExisting: false,
      enrichFromProviders: false,
    });

    expect(modifySpy).not.toHaveBeenCalled();
    expect(result.updatedCount).toBe(0);
    expect(result.skippedCount).toBe(scanResult.existingBooks.length);
    expect(result.importedCount).toBe(scanResult.newBooks.length);

    const currentDuneContent = await mockEnv.vault.read(duneFile);
    expect(currentDuneContent).toBe(SAMPLE_EXISTING_VAULT_NOTE_DUNE);
  });

  it('updates existing book YAML frontmatter non-destructively while preserving body and kitap-kart block when updateExisting is true', async () => {
    const duneFile = mockEnv.vault.createFile(
      'Kitaplar/Dune.md',
      SAMPLE_EXISTING_VAULT_NOTE_DUNE,
      {
        isbn: '9780441172719',
        baslik: 'Dune',
        yazar: 'Frank Herbert',
      }
    );

    const rows = parseGoodreadsCsv(SAMPLE_CSV_STANDARD);
    const parsedBooks = rows.map((r) => mapGoodreadsRow(r, mockPlugin.settings));
    const vaultBooks = await scanVaultBooks(mockEnv.app, 'Kitaplar');
    const scanResult = detectDuplicates(parsedBooks, vaultBooks);

    const importer = new GoodreadsImporter(mockEnv.app, mockPlugin);
    const result = await importer.importBooks(scanResult, {
      updateExisting: true,
      enrichFromProviders: false,
    });

    expect(result.updatedCount).toBe(scanResult.existingBooks.length);
    expect(result.skippedCount).toBe(0);
    expect(result.importedCount).toBe(scanResult.newBooks.length);

    const updatedDuneContent = await mockEnv.vault.read(duneFile);
    expect(updatedDuneContent).toContain('```kitap-kart');
    expect(updatedDuneContent).toContain('okuma_durumu: "Okundu"');
    expect(updatedDuneContent).toContain('kisisel_puan: 5');
    expect(updatedDuneContent).toContain('okunma_tarihi: "2023-04-10"');
    expect(updatedDuneContent).toContain('ozel_etiket: "favori-bilimkurgu" # Kullanıcı özel etiketi');
  });

  it('enriches metadata from active providers when enrichFromProviders is true', async () => {
    const searchItem: SearchResultItem = {
      id: 'ky-dune',
      title: 'Dune',
      author: 'Frank Herbert',
      publisher: 'İthaki Yayınları',
      isbn: '9780441172719',
      url: 'https://www.kitapyurdu.com/kitap/dune/1.html',
      coverUrl: 'https://img.kitapyurdu.com/dune-cover.jpg',
      provider: 'kitapyurdu',
    };

    searchSpy.mockResolvedValue([searchItem]);
    getFullBookDataSpy.mockResolvedValue({
      ...searchItem,
      isbn: '9780441172719',
      translator: 'Dost Körpe',
    });

    const rows = parseGoodreadsCsv(SAMPLE_CSV_STANDARD).slice(0, 1);
    const parsedBooks = rows.map((r) => mapGoodreadsRow(r, mockPlugin.settings));
    const scanResult = { newBooks: parsedBooks, existingBooks: [] };

    const fastEnricher = new GoodreadsEnrichmentService(
      mockAggregator,
      mockPlugin.settings,
      0
    );
    const importer = new GoodreadsImporter(mockEnv.app, mockPlugin, fastEnricher);

    const result = await importer.importBooks(scanResult, {
      updateExisting: false,
      enrichFromProviders: true,
    });

    expect(result.importedCount).toBe(1);
    expect(searchSpy).toHaveBeenCalled();

    const createdFiles = mockEnv.vault.getMarkdownFiles();
    expect(createdFiles).toHaveLength(1);
    const content = await mockEnv.vault.read(createdFiles[0]);
    expect(content).toContain('https://img.kitapyurdu.com/dune-cover.jpg');
  });

  it('reports progress accurately and respects AbortSignal cancellation mid-batch', async () => {
    const rows = parseGoodreadsCsv(SAMPLE_CSV_STANDARD);
    const parsedBooks = rows.map((r) => mapGoodreadsRow(r, mockPlugin.settings));
    const scanResult = { newBooks: parsedBooks, existingBooks: [] };

    const controller = new AbortController();
    const progressEvents: Array<{ current: number; total: number; message: string }> = [];

    const importer = new GoodreadsImporter(mockEnv.app, mockPlugin);
    const result = await importer.importBooks(scanResult, {
      updateExisting: false,
      enrichFromProviders: false,
      abortSignal: controller.signal,
      onProgress: (current, total, message) => {
        progressEvents.push({ current, total, message });
        if (current === 1) {
          controller.abort();
        }
      },
    });

    expect(progressEvents.length).toBe(1);
    expect(result.importedCount).toBe(1);
  });

  it('isolates individual file creation errors without aborting remaining books in batch', async () => {
    const rows = parseGoodreadsCsv(SAMPLE_CSV_STANDARD);
    const parsedBooks = rows.map((r) => mapGoodreadsRow(r, mockPlugin.settings));
    const scanResult = { newBooks: parsedBooks, existingBooks: [] };

    let callCount = 0;
    const origCreate = mockEnv.app.vault.create.bind(mockEnv.app.vault);
    mockEnv.app.vault.create = vi.fn().mockImplementation(async (p: string, c: string) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Simulated disk write error');
      }
      return origCreate(p, c);
    });

    const importer = new GoodreadsImporter(mockEnv.app, mockPlugin);
    const result = await importer.importBooks(scanResult, {
      updateExisting: false,
      enrichFromProviders: false,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('Simulated disk write error');
    expect(result.importedCount).toBe(scanResult.newBooks.length - 1);
  });

  describe('buildExistingNoteUpdatePatch (existing note field preservation)', () => {
    it('preserves existing non-empty yayinevi and kapak while updating okuma_durumu and okunan_sayfa', () => {
      const parsed = mapGoodreadsRow(
        {
          title: 'Dune',
          author: 'Frank Herbert',
          isbn13: '="9780441172719"',
          numberOfPages: '712',
          exclusiveShelf: 'read',
          dateRead: '2021/02/05',
        },
        DEFAULT_SETTINGS
      );

      const book = {
        ...parsed,
        metadata: {
          ...parsed.metadata,
          publisher: 'İthaki Yayınları',
          coverUrl: 'https://img.kitapyurdu.com/dune-cover.jpg',
        },
      };

      const existingFrontmatter = {
        yayinevi: 'Kullanıcının Kendi Yayınevi',
        kapak: '[[Kitaplar/Kapaklar/Dune - Frank Herbert.jpg]]',
        sayfa: 712,
        okuma_durumu: 'Okunuyor',
      };

      const patch = buildExistingNoteUpdatePatch(book, DEFAULT_SETTINGS, existingFrontmatter);

      expect(patch.okuma_durumu).toBe('Okundu');
      expect(patch.okunan_sayfa).toBe(712);
      expect(patch).not.toHaveProperty('yayinevi');
      expect(patch).not.toHaveProperty('kapak');
    });

    it('fills yayinevi and kapak only when the existing note leaves them empty', () => {
      const parsed = mapGoodreadsRow(
        {
          title: 'Dune',
          author: 'Frank Herbert',
          numberOfPages: '712',
          exclusiveShelf: 'read',
        },
        DEFAULT_SETTINGS
      );

      const book = {
        ...parsed,
        metadata: {
          ...parsed.metadata,
          publisher: 'İthaki Yayınları',
          coverUrl: 'https://img.kitapyurdu.com/dune-cover.jpg',
        },
      };

      const patch = buildExistingNoteUpdatePatch(book, DEFAULT_SETTINGS, {
        yayinevi: '',
        kapak: '',
        sayfa: 712,
      });

      expect(patch.yayinevi).toBe('İthaki Yayınları');
      expect(patch.kapak).toBe('https://img.kitapyurdu.com/dune-cover.jpg');
      expect(patch.okuma_durumu).toBe('Okundu');
      expect(patch.okunan_sayfa).toBe(712);
    });
  });
});
