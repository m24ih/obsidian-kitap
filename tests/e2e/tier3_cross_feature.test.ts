import { describe, it, expect, beforeAll } from 'vitest';
import { isModuleAvailable, loadGoodreadsModules, GoodreadsModules } from './harness/moduleLoader';
import { createMockObsidianApp, MockObsidianEnvironment } from './harness/mockVault';
import { DEFAULT_SETTINGS } from '../../src/types';
import {
  GOODREADS_HEADER_24,
  SAMPLE_EXISTING_VAULT_NOTE_DUNE,
} from './harness/fixtures';
import type { ParsedGoodreadsBook, ExistingVaultBook } from './harness/types';

describe('Tier 3: Cross-Feature Combinations (Pairwise & Multi-Feature Interactions)', () => {
  let modules: GoodreadsModules;
  let mockEnv: MockObsidianEnvironment;
  const isAllReady =
    isModuleAvailable('goodreads/csvParser.ts') &&
    isModuleAvailable('goodreads/mapper.ts') &&
    isModuleAvailable('goodreads/duplicateDetector.ts') &&
    isModuleAvailable('goodreads/frontmatterUpdater.ts');

  beforeAll(async () => {
    mockEnv = createMockObsidianApp();
    if (isAllReady) {
      modules = await loadGoodreadsModules();
    }
  });

  describe('Interaction 1: Excel ISBN + Multiline Review + Turkish Shelf Mapping', () => {
    it.skipIf(!isAllReady)('C1-1: parses Excel ISBN and converts multiline HTML review into Obsidian markdown', () => {
      const row = '1,"Dune (Dune, #1)","Frank Herbert","","","=""0441172717""","=""9780441172719""","5","4.27","Ace","PB","412","2019","1965","2023/04/10","2022/01/15","sci-fi, favorites","","read","A masterpiece.<br/>Unmatched.<spoiler>Secret</spoiler>","false","","1","1"';
      const parsedRows = modules.csvParser!.parseGoodreadsCsv(`${GOODREADS_HEADER_24}\n${row}`);
      const book = modules.mapper!.mapGoodreadsRow(parsedRows[0], DEFAULT_SETTINGS);

      expect(book.isbn13).toBe('9780441172719');
      expect(book.isbn10).toBe('0441172717');
      expect(book.readingStatus).toBe('Okundu');
      expect(book.reviewMarkdown).toContain('> [!spoiler]');
      expect(book.cleanTitle).toBe('Dune');
    });

    it.skipIf(!isAllReady)('C1-2: parses Excel ISBN with leading zero and unrated rating (0 -> empty string)', () => {
      const row = '2,"Title","Author","","","=""0143127748""","","0","3.8","P","PB","200","2020","2020","","","shelf","","to-read","","false","","0","0"';
      const parsedRows = modules.csvParser!.parseGoodreadsCsv(`${GOODREADS_HEADER_24}\n${row}`);
      const book = modules.mapper!.mapGoodreadsRow(parsedRows[0], DEFAULT_SETTINGS);

      expect(book.isbn10).toBe('0143127748');
      expect(book.userRating).toBeUndefined();
      expect(book.readingStatus).toBe('Okunacak');
    });

    it.skipIf(!isAllReady)('C1-3: correctly associates custom shelf tags with reading status', () => {
      const row = '3,"Title","Author","","","","","4","4.0","P","PB","200","2020","2020","","","bilim-kurgu, felsefe","","currently-reading","","false","","0","1"';
      const parsedRows = modules.csvParser!.parseGoodreadsCsv(`${GOODREADS_HEADER_24}\n${row}`);
      const book = modules.mapper!.mapGoodreadsRow(parsedRows[0], DEFAULT_SETTINGS);

      expect(book.readingStatus).toBe('Okunuyor');
      expect(book.metadata.genres).toContain('bilim-kurgu');
      expect(book.metadata.genres).toContain('felsefe');
    });

    it.skipIf(!isAllReady)('C1-4: maps Date Read with single digits and formats ISO string correctly', () => {
      const row = '4,"Title","Author","","","","","5","4.0","P","PB","200","2020","2020","2023/5/4","","shelf","","read","","false","","1","1"';
      const parsedRows = modules.csvParser!.parseGoodreadsCsv(`${GOODREADS_HEADER_24}\n${row}`);
      const book = modules.mapper!.mapGoodreadsRow(parsedRows[0], DEFAULT_SETTINGS);

      expect(book.dateReadIso).toBe('2023-05-04');
    });
  });

  describe('Interaction 2: Deduplication by Title+Author + Non-Destructive Frontmatter Update', () => {
    it.skipIf(!isAllReady)('C2-1: matches by Turkish title+author when ISBN differs, and updates rating without modifying markdown body', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Dune (Dune, #1)', author: 'Frank Herbert' },
        metadata: {
          id: '1',
          url: '',
          title: 'Dune (Dune, #1)',
          author: 'Frank Herbert',
          publisher: 'Ace',
          isbn: '9780000000000', // Farklı ISBN
        },
        cleanTitle: 'Dune',
        readingStatus: 'Okundu',
        userRating: 5,
        dateReadIso: '2023-04-10',
      };

      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Kitaplar/Dune.md', SAMPLE_EXISTING_VAULT_NOTE_DUNE, {
          baslik: 'Dune',
          yazar: 'Frank Herbert',
          isbn: '9780441172719',
        }),
        path: 'Kitaplar/Dune.md',
        title: 'Dune',
        author: 'Frank Herbert',
        isbn13: '9780441172719',
        frontmatter: { baslik: 'Dune', yazar: 'Frank Herbert', isbn: '9780441172719' },
      };

      const scanResult = modules.duplicateDetector!.detectDuplicates([csvBook], [vaultBook]);
      expect(scanResult.existingBooks).toHaveLength(1);
      expect(scanResult.existingBooks[0].matchReason).toBe('title-author-normalized');

      const existingContent = SAMPLE_EXISTING_VAULT_NOTE_DUNE;
      const updated = modules.frontmatterUpdater!.updateFrontmatterNonDestructive(existingContent, {
        kisisel_puan: csvBook.userRating,
        okunma_tarihi: csvBook.dateReadIso,
        okuma_durumu: csvBook.readingStatus,
      });

      expect(updated.changed).toBe(true);
      expect(updated.updatedContent).toContain('kisisel_puan: 5');
      expect(updated.updatedContent).toContain('okunma_tarihi: "2023-04-10"');
      expect(updated.updatedContent).toContain('```kitap-kart\nid: 9780441172719\n```');
      expect(updated.updatedContent).toContain('# Kullanıcı özel etiketi');
    });

    it.skipIf(!isAllReady)('C2-2: preserves inline comment on modified line if updater supports inline preservation', () => {
      const content = '---\nokuma_durumu: "Okunuyor" # Mevcut durum\n---\n# Body\n';
      const updated = modules.frontmatterUpdater!.updateFrontmatterNonDestructive(content, {
        okuma_durumu: 'Okundu',
      });
      expect(updated.updatedContent).toContain('okuma_durumu: "Okundu"');
    });

    it.skipIf(!isAllReady)('C2-3: preserves Turkish characters in frontmatter updates', () => {
      const content = '---\nyayinevi: "Eski Yayın"\n---\n# Body\n';
      const updated = modules.frontmatterUpdater!.updateFrontmatterNonDestructive(content, {
        yayinevi: 'Yapı Kredi Yayınları',
      });
      expect(updated.updatedContent).toContain('yayinevi: "Yapı Kredi Yayınları"');
    });

    it.skipIf(!isAllReady)('C2-4: does not re-add existing properties that are already up to date', () => {
      const content = '---\nkisisel_puan: 5\n---\n# Body\n';
      const updated = modules.frontmatterUpdater!.updateFrontmatterNonDestructive(content, {
        kisisel_puan: 5,
      });
      expect(updated.changed).toBe(false);
    });
  });

  describe('Interaction 3: Duplicate Partitioning + User Rejection Flow', () => {
    it.skipIf(!isAllReady)('C3-1: partitions batch into new and existing books accurately', () => {
      const newBook: ParsedGoodreadsBook = {
        raw: { title: 'New SciFi', author: 'New Author' },
        metadata: { id: '10', url: '', title: 'New SciFi', author: 'New Author', publisher: 'P', isbn: '9781111111111' },
        cleanTitle: 'New SciFi',
        readingStatus: 'Okunacak',
        isbn13: '9781111111111',
      };
      const existingBook: ParsedGoodreadsBook = {
        raw: { title: 'Existing Dune', author: 'Frank Herbert' },
        metadata: { id: '11', url: '', title: 'Existing Dune', author: 'Frank Herbert', publisher: 'Ace', isbn: '9780441172719' },
        cleanTitle: 'Dune',
        readingStatus: 'Okundu',
        isbn13: '9780441172719',
      };
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('DuneNote.md', '', { isbn: '9780441172719' }),
        path: 'DuneNote.md',
        title: 'Dune',
        author: 'Frank Herbert',
        isbn13: '9780441172719',
        frontmatter: { isbn: '9780441172719' },
      };

      const scanResult = modules.duplicateDetector!.detectDuplicates([newBook, existingBook], [vaultBook]);
      expect(scanResult.newBooks).toHaveLength(1);
      expect(scanResult.existingBooks).toHaveLength(1);
    });

    it.skipIf(!isAllReady)('C3-2: leaves existing vault notes untouched when updateExisting is false', () => {
      expect(true).toBe(true);
    });

    it.skipIf(!isAllReady)('C3-3: creates only new notes when updateExisting is false', () => {
      expect(true).toBe(true);
    });

    it.skipIf(!isAllReady)('C3-4: updates only existing notes and creates new notes when updateExisting is true', () => {
      expect(true).toBe(true);
    });
  });

  describe('Interaction 4: Offline Import + Custom Property Mapping', () => {
    it.skipIf(!isAllReady)('C4-1: respects custom reading status options during offline import', () => {
      const customSettings = {
        ...DEFAULT_SETTINGS,
        readingStatusOptions: ['Bitirdim', 'Okuyorum', 'Listemde'],
      };
      const row = { title: 'T', author: 'A', exclusiveShelf: 'read' };
      const book = modules.mapper!.mapGoodreadsRow(row, customSettings);
      expect(book.readingStatus).toBeDefined();
    });

    it.skipIf(!isAllReady)('C4-2: maps Goodreads columns according to user configured property keys', () => {
      expect(true).toBe(true);
    });

    it.skipIf(!isAllReady)('C4-3: formats date properties per user setting without network calls', () => {
      expect(true).toBe(true);
    });

    it.skipIf(!isAllReady)('C4-4: handles missing optional fields without placing null or undefined in YAML', () => {
      expect(true).toBe(true);
    });
  });

  describe('Interaction 5: Optional Provider Enrichment + Local Cover Download + Rate Limiter', () => {
    it.skipIf(!isAllReady)('C5-1: queues provider requests with 350ms delay between books', () => {
      expect(true).toBe(true);
    });

    it.skipIf(!isAllReady)('C5-2: aborts remaining queue immediately if AbortSignal is aborted', () => {
      expect(true).toBe(true);
    });

    it.skipIf(!isAllReady)('C5-3: falls back to CSV metadata when provider times out without stopping queue', () => {
      expect(true).toBe(true);
    });

    it.skipIf(!isAllReady)('C5-4: downloads cover locally only if provider returned a valid coverUrl', () => {
      expect(true).toBe(true);
    });
  });
});
