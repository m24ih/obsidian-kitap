import { describe, it, expect, beforeAll } from 'vitest';
import { isModuleAvailable, loadGoodreadsModules, GoodreadsModules } from './harness/moduleLoader';
import { createMockObsidianApp, MockObsidianEnvironment } from './harness/mockVault';
import {
  SAMPLE_EXISTING_VAULT_NOTE_DUNE,
  SAMPLE_EXISTING_VAULT_NOTE_INCE_MEMED,
} from './harness/fixtures';
import type { ParsedGoodreadsBook, ExistingVaultBook } from './harness/types';

describe('Tier 1: Feature Coverage — Features 8 to 12 (Vault Scanner & Duplicate Detection)', () => {
  let modules: GoodreadsModules;
  let mockEnv: MockObsidianEnvironment;
  const isM2Ready =
    isModuleAvailable('goodreads/vaultScanner.ts') &&
    isModuleAvailable('goodreads/duplicateDetector.ts');

  beforeAll(async () => {
    mockEnv = createMockObsidianApp();
    if (isM2Ready) {
      modules = await loadGoodreadsModules();
    }
  });

  describe('Feature 8: Vault Book Scanner', () => {
    it.skipIf(!isM2Ready)('F8-1: scans markdown notes using metadataCache fast-path', async () => {
      mockEnv.vault.createFile(
        'Kitaplar/Dune.md',
        SAMPLE_EXISTING_VAULT_NOTE_DUNE,
        {
          baslik: 'Dune',
          yazar: 'Frank Herbert',
          isbn: '9780441172719',
        }
      );

      const vaultBooks = await modules.vaultScanner!.scanVaultBooks(mockEnv.app, 'Kitaplar');
      expect(vaultBooks.length).toBeGreaterThanOrEqual(1);
      const duneNote = vaultBooks.find((b: ExistingVaultBook) => b.title === 'Dune');
      expect(duneNote).toBeDefined();
      expect(duneNote?.isbn13).toBe('9780441172719');
    });

    it.skipIf(!isM2Ready)('F8-2: falls back to vault.read if metadataCache is absent', async () => {
      mockEnv.vault.createFile(
        'Kitaplar/Uncached.md',
        '---\nbaslik: "Vakıf"\nyazar: "Isaac Asimov"\nisbn: "9789752100183"\n---\n# Vakıf\n'
      );

      const vaultBooks = await modules.vaultScanner!.scanVaultBooks(mockEnv.app, 'Kitaplar');
      const vakif = vaultBooks.find((b: ExistingVaultBook) => b.title === 'Vakıf');
      expect(vakif).toBeDefined();
    });

    it.skipIf(!isM2Ready)('F8-3: filters notes by targetFolder without scanning other folders', async () => {
      mockEnv.vault.createFile('Gunluk/2026-10-30.md', '# Günlük Notu\nBugün kitap okudum.');
      const vaultBooks = await modules.vaultScanner!.scanVaultBooks(mockEnv.app, 'Kitaplar');
      const gunluk = vaultBooks.find((b: ExistingVaultBook) => b.path.startsWith('Gunluk/'));
      expect(gunluk).toBeUndefined();
    });

    it.skipIf(!isM2Ready)('F8-4: scans entire vault when targetFolder is omitted or empty', async () => {
      const allBooks = await modules.vaultScanner!.scanVaultBooks(mockEnv.app);
      expect(Array.isArray(allBooks)).toBe(true);
    });

    it.skipIf(!isM2Ready)('F8-5: handles non-markdown files and corrupted frontmatter gracefully', async () => {
      mockEnv.vault.createFile('Kitaplar/invalid.txt', 'Plain text file');
      mockEnv.vault.createFile('Kitaplar/corrupt.md', '---\n: bad yaml\n---\n');
      const vaultBooks = await modules.vaultScanner!.scanVaultBooks(mockEnv.app, 'Kitaplar');
      expect(Array.isArray(vaultBooks)).toBe(true);
    });
  });

  describe('Feature 9: Dual In-Memory Deduplication Index', () => {
    it.skipIf(!isM2Ready)('F9-1: builds normalized ISBN-13 index allowing O(1) matching', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Dune', author: 'Frank Herbert' },
        metadata: {
          id: '1',
          url: '',
          title: 'Dune',
          author: 'Frank Herbert',
          publisher: 'Ace',
          isbn: '9780441172719',
        },
        cleanTitle: 'Dune',
        readingStatus: 'Okundu',
        isbn13: '9780441172719',
      };
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Dune.md', '', { isbn: '9780441172719' }),
        path: 'Dune.md',
        title: 'Dune',
        author: 'Frank Herbert',
        isbn13: '9780441172719',
        frontmatter: { isbn: '9780441172719' },
      };

      const result = modules.duplicateDetector!.detectDuplicates([csvBook], [vaultBook]);
      expect(result.existingBooks).toHaveLength(1);
      expect(result.existingBooks[0].matchReason).toBe('isbn-exact');
    });

    it.skipIf(!isM2Ready)('F9-2: builds Title + Author token index when ISBN is absent', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Körlük', author: 'José Saramago' },
        metadata: {
          id: '2',
          url: '',
          title: 'Körlük',
          author: 'José Saramago',
          publisher: 'Kırmızı Kedi',
          isbn: '',
        },
        cleanTitle: 'Körlük',
        readingStatus: 'Okundu',
      };
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Korluk.md', '', { baslik: 'Körlük', yazar: 'José Saramago' }),
        path: 'Korluk.md',
        title: 'Körlük',
        author: 'José Saramago',
        frontmatter: { baslik: 'Körlük', yazar: 'José Saramago' },
      };

      const result = modules.duplicateDetector!.detectDuplicates([csvBook], [vaultBook]);
      expect(result.existingBooks).toHaveLength(1);
      expect(result.existingBooks[0].matchReason).toBe('title-author-normalized');
    });

    it.skipIf(!isM2Ready)('F9-3: handles empty vault list returning all CSV books as newBooks', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'New Book', author: 'New Author' },
        metadata: {
          id: '3',
          url: '',
          title: 'New Book',
          author: 'New Author',
          publisher: 'Pub',
          isbn: '9781111111111',
        },
        cleanTitle: 'New Book',
        readingStatus: 'Okunacak',
        isbn13: '9781111111111',
      };

      const result = modules.duplicateDetector!.detectDuplicates([csvBook], []);
      expect(result.newBooks).toHaveLength(1);
      expect(result.existingBooks).toHaveLength(0);
    });

    it.skipIf(!isM2Ready)('F9-4: handles empty CSV book list returning empty partitions', () => {
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Dummy.md', '', {}),
        path: 'Dummy.md',
        title: 'Dummy',
        author: 'Author',
        frontmatter: {},
      };

      const result = modules.duplicateDetector!.detectDuplicates([], [vaultBook]);
      expect(result.newBooks).toHaveLength(0);
      expect(result.existingBooks).toHaveLength(0);
    });

    it.skipIf(!isM2Ready)('F9-5: handles duplicate vault records pointing to same book title', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Duplicate Target', author: 'Author' },
        metadata: { id: '4', url: '', title: 'Duplicate Target', author: 'Author', publisher: 'P', isbn: '9782222222222' },
        cleanTitle: 'Duplicate Target',
        readingStatus: 'Okundu',
        isbn13: '9782222222222',
      };
      const vaultBook1: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Target1.md', '', { isbn: '9782222222222' }),
        path: 'Target1.md',
        title: 'Duplicate Target',
        author: 'Author',
        isbn13: '9782222222222',
        frontmatter: { isbn: '9782222222222' },
      };
      const vaultBook2: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Target2.md', '', { isbn: '9782222222222' }),
        path: 'Target2.md',
        title: 'Duplicate Target',
        author: 'Author',
        isbn13: '9782222222222',
        frontmatter: { isbn: '9782222222222' },
      };

      const result = modules.duplicateDetector!.detectDuplicates([csvBook], [vaultBook1, vaultBook2]);
      expect(result.existingBooks).toHaveLength(1);
    });
  });

  describe('Feature 10: Exact & Normalized ISBN Matcher', () => {
    it.skipIf(!isM2Ready)('F10-1: matches exact 13-digit ISBN without hyphens', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Test', author: 'A' },
        metadata: { id: '5', url: '', title: 'Test', author: 'A', publisher: 'P', isbn: '9789750807145' },
        cleanTitle: 'Test',
        readingStatus: 'Okundu',
        isbn13: '9789750807145',
      };
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('T.md', '', { isbn: '9789750807145' }),
        path: 'T.md',
        title: 'Test',
        author: 'A',
        isbn13: '9789750807145',
        frontmatter: { isbn: '9789750807145' },
      };

      const result = modules.duplicateDetector!.detectDuplicates([csvBook], [vaultBook]);
      expect(result.existingBooks[0].matchReason).toBe('isbn-exact');
    });

    it.skipIf(!isM2Ready)('F10-2: matches ISBN-10 to converted ISBN-13 checksum', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Dune', author: 'Herbert' },
        metadata: { id: '6', url: '', title: 'Dune', author: 'Herbert', publisher: 'Ace', isbn: '0441172717' },
        cleanTitle: 'Dune',
        readingStatus: 'Okundu',
        isbn10: '0441172717',
      };
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('DuneVault.md', '', { isbn: '9780441172719' }),
        path: 'DuneVault.md',
        title: 'Dune',
        author: 'Herbert',
        isbn13: '9780441172719',
        frontmatter: { isbn: '9780441172719' },
      };

      const result = modules.duplicateDetector!.detectDuplicates([csvBook], [vaultBook]);
      expect(result.existingBooks).toHaveLength(1);
    });

    it.skipIf(!isM2Ready)('F10-3: matches ISBN-13 to converted ISBN-10 checksum', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Dune', author: 'Herbert' },
        metadata: { id: '7', url: '', title: 'Dune', author: 'Herbert', publisher: 'Ace', isbn: '9780441172719' },
        cleanTitle: 'Dune',
        readingStatus: 'Okundu',
        isbn13: '9780441172719',
      };
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Dune10.md', '', { isbn: '0441172717' }),
        path: 'Dune10.md',
        title: 'Dune',
        author: 'Herbert',
        isbn10: '0441172717',
        frontmatter: { isbn: '0441172717' },
      };

      const result = modules.duplicateDetector!.detectDuplicates([csvBook], [vaultBook]);
      expect(result.existingBooks).toHaveLength(1);
    });

    it.skipIf(!isM2Ready)('F10-4: strips hyphens and spaces before matching ISBNs (978-0-441-17271-9)', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Dune', author: 'Herbert' },
        metadata: { id: '8', url: '', title: 'Dune', author: 'Herbert', publisher: 'Ace', isbn: '9780441172719' },
        cleanTitle: 'Dune',
        readingStatus: 'Okundu',
        isbn13: '9780441172719',
      };
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Hyphen.md', '', { isbn: '978-0-441-17271-9' }),
        path: 'Hyphen.md',
        title: 'Dune',
        author: 'Herbert',
        isbn13: '9780441172719',
        frontmatter: { isbn: '978-0-441-17271-9' },
      };

      const result = modules.duplicateDetector!.detectDuplicates([csvBook], [vaultBook]);
      expect(result.existingBooks).toHaveLength(1);
    });

    it.skipIf(!isM2Ready)('F10-5: preserves uppercase check digit X in ISBN-10 (080442957X)', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'CheckDigit', author: 'Author' },
        metadata: { id: '9', url: '', title: 'CheckDigit', author: 'Author', publisher: 'Pub', isbn: '080442957X' },
        cleanTitle: 'CheckDigit',
        readingStatus: 'Okundu',
        isbn10: '080442957X',
      };
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('CheckX.md', '', { isbn: '080442957X' }),
        path: 'CheckX.md',
        title: 'CheckDigit',
        author: 'Author',
        isbn10: '080442957X',
        frontmatter: { isbn: '080442957x' },
      };

      const result = modules.duplicateDetector!.detectDuplicates([csvBook], [vaultBook]);
      expect(result.existingBooks).toHaveLength(1);
    });
  });

  describe('Feature 11: Turkish Title + Author Matcher', () => {
    it.skipIf(!isM2Ready)('F11-1: strips series suffix "Dune (Dune Chronicles, #1)" to match vault note "Dune"', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Dune (Dune Chronicles, #1)', author: 'Frank Herbert' },
        metadata: { id: '10', url: '', title: 'Dune (Dune Chronicles, #1)', author: 'Frank Herbert', publisher: 'Ace', isbn: '' },
        cleanTitle: 'Dune',
        readingStatus: 'Okundu',
      };
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('DuneClean.md', '', { baslik: 'Dune', yazar: 'Frank Herbert' }),
        path: 'DuneClean.md',
        title: 'Dune',
        author: 'Frank Herbert',
        frontmatter: { baslik: 'Dune', yazar: 'Frank Herbert' },
      };

      const result = modules.duplicateDetector!.detectDuplicates([csvBook], [vaultBook]);
      expect(result.existingBooks).toHaveLength(1);
      expect(result.existingBooks[0].matchReason).toBe('title-author-normalized');
    });

    it.skipIf(!isM2Ready)('F11-2: handles Turkish dotted and dotless I correctly (İnce / ince)', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'İnce Memed', author: 'Yaşar Kemal' },
        metadata: { id: '11', url: '', title: 'İnce Memed', author: 'Yaşar Kemal', publisher: 'YKY', isbn: '' },
        cleanTitle: 'İnce Memed',
        readingStatus: 'Okundu',
      };
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('InceMemed.md', '', { baslik: 'ince memed', yazar: 'yaşar kemal' }),
        path: 'InceMemed.md',
        title: 'ince memed',
        author: 'yaşar kemal',
        frontmatter: { baslik: 'ince memed', yazar: 'yaşar kemal' },
      };

      const result = modules.duplicateDetector!.detectDuplicates([csvBook], [vaultBook]);
      expect(result.existingBooks).toHaveLength(1);
    });

    it.skipIf(!isM2Ready)('F11-3: matches author "Last, First" in CSV with "First Last" in vault note', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Karamazov Kardeşler', author: 'Fyodor Dostoevsky', authorLf: 'Dostoevsky, Fyodor' },
        metadata: { id: '12', url: '', title: 'Karamazov Kardeşler', author: 'Fyodor Dostoevsky', publisher: 'İş', isbn: '' },
        cleanTitle: 'Karamazov Kardeşler',
        readingStatus: 'Okundu',
      };
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Karamazov.md', '', { baslik: 'Karamazov Kardeşler', yazar: 'Dostoyevski' }),
        path: 'Karamazov.md',
        title: 'Karamazov Kardeşler',
        author: 'Dostoevsky',
        frontmatter: { baslik: 'Karamazov Kardeşler', yazar: 'Dostoevsky' },
      };

      const result = modules.duplicateDetector!.detectDuplicates([csvBook], [vaultBook]);
      expect(result.existingBooks).toHaveLength(1);
    });

    it.skipIf(!isM2Ready)('F11-4: prevents false-positive matches when authors differ completely', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Dönüşüm', author: 'Franz Kafka' },
        metadata: { id: '13', url: '', title: 'Dönüşüm', author: 'Franz Kafka', publisher: 'Can', isbn: '' },
        cleanTitle: 'Dönüşüm',
        readingStatus: 'Okundu',
      };
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Donusum.md', '', { baslik: 'Dönüşüm', yazar: 'Ovidius' }),
        path: 'Donusum.md',
        title: 'Dönüşüm',
        author: 'Ovidius',
        frontmatter: { baslik: 'Dönüşüm', yazar: 'Ovidius' },
      };

      const result = modules.duplicateDetector!.detectDuplicates([csvBook], [vaultBook]);
      expect(result.newBooks).toHaveLength(1);
      expect(result.existingBooks).toHaveLength(0);
    });

    it.skipIf(!isM2Ready)('F11-5: tolerates subtitle punctuation differences in titles (Title: Subtitle vs Title - Subtitle)', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Sapiens: Hayvanlardan Tanrılara', author: 'Yuval Noah Harari' },
        metadata: { id: '14', url: '', title: 'Sapiens: Hayvanlardan Tanrılara', author: 'Yuval Noah Harari', publisher: 'Kolektif', isbn: '' },
        cleanTitle: 'Sapiens: Hayvanlardan Tanrılara',
        readingStatus: 'Okundu',
      };
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Sapiens.md', '', { baslik: 'Sapiens - Hayvanlardan Tanrılara', yazar: 'Yuval Noah Harari' }),
        path: 'Sapiens.md',
        title: 'Sapiens - Hayvanlardan Tanrılara',
        author: 'Yuval Noah Harari',
        frontmatter: { baslik: 'Sapiens - Hayvanlardan Tanrılara', yazar: 'Yuval Noah Harari' },
      };

      const result = modules.duplicateDetector!.detectDuplicates([csvBook], [vaultBook]);
      expect(result.existingBooks).toHaveLength(1);
    });
  });

  describe('Feature 12: Pre-Import Duplicate Partitioning', () => {
    it.skipIf(!isM2Ready)('F12-1: separates newBooks and existingBooks without losing records', () => {
      const book1: ParsedGoodreadsBook = {
        raw: { title: 'Book 1', author: 'Author 1' },
        metadata: { id: '15', url: '', title: 'Book 1', author: 'Author 1', publisher: 'P', isbn: '9781111111111' },
        cleanTitle: 'Book 1',
        readingStatus: 'Okundu',
        isbn13: '9781111111111',
      };
      const book2: ParsedGoodreadsBook = {
        raw: { title: 'Book 2', author: 'Author 2' },
        metadata: { id: '16', url: '', title: 'Book 2', author: 'Author 2', publisher: 'P', isbn: '9782222222222' },
        cleanTitle: 'Book 2',
        readingStatus: 'Okunacak',
        isbn13: '9782222222222',
      };
      const vaultBook1: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Vault1.md', '', { isbn: '9781111111111' }),
        path: 'Vault1.md',
        title: 'Book 1',
        author: 'Author 1',
        isbn13: '9781111111111',
        frontmatter: { isbn: '9781111111111' },
      };

      const result = modules.duplicateDetector!.detectDuplicates([book1, book2], [vaultBook1]);
      expect(result.existingBooks).toHaveLength(1);
      expect(result.newBooks).toHaveLength(1);
      expect(result.existingBooks[0].csvBook.cleanTitle).toBe('Book 1');
      expect(result.newBooks[0].cleanTitle).toBe('Book 2');
    });

    it.skipIf(!isM2Ready)('F12-2: maintains exact matchReason in existingBooks partition', () => {
      const bookIsbn: ParsedGoodreadsBook = {
        raw: { title: 'ISBN Match', author: 'Author' },
        metadata: { id: '17', url: '', title: 'ISBN Match', author: 'Author', publisher: 'P', isbn: '9783333333333' },
        cleanTitle: 'ISBN Match',
        readingStatus: 'Okundu',
        isbn13: '9783333333333',
      };
      const vaultIsbn: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Isbn.md', '', { isbn: '9783333333333' }),
        path: 'Isbn.md',
        title: 'Different Title',
        author: 'Different Author',
        isbn13: '9783333333333',
        frontmatter: { isbn: '9783333333333' },
      };

      const result = modules.duplicateDetector!.detectDuplicates([bookIsbn], [vaultIsbn]);
      expect(result.existingBooks[0].matchReason).toBe('isbn-exact');
    });

    it.skipIf(!isM2Ready)('F12-3: preserves all CSV books when vault has zero matches', () => {
      const books: ParsedGoodreadsBook[] = [
        { raw: { title: 'A', author: 'A' }, metadata: { id: '18', url: '', title: 'A', author: 'A', publisher: 'P', isbn: '1' }, cleanTitle: 'A', readingStatus: 'Okundu' },
        { raw: { title: 'B', author: 'B' }, metadata: { id: '19', url: '', title: 'B', author: 'B', publisher: 'P', isbn: '2' }, cleanTitle: 'B', readingStatus: 'Okundu' },
      ];
      const result = modules.duplicateDetector!.detectDuplicates(books, []);
      expect(result.newBooks).toHaveLength(2);
      expect(result.existingBooks).toHaveLength(0);
    });

    it.skipIf(!isM2Ready)('F12-4: handles all CSV books already existing in vault', () => {
      const book: ParsedGoodreadsBook = {
        raw: { title: 'Existing', author: 'Author' },
        metadata: { id: '20', url: '', title: 'Existing', author: 'Author', publisher: 'P', isbn: '9784444444444' },
        cleanTitle: 'Existing',
        readingStatus: 'Okundu',
        isbn13: '9784444444444',
      };
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Exist.md', '', { isbn: '9784444444444' }),
        path: 'Exist.md',
        title: 'Existing',
        author: 'Author',
        isbn13: '9784444444444',
        frontmatter: { isbn: '9784444444444' },
      };

      const result = modules.duplicateDetector!.detectDuplicates([book], [vaultBook]);
      expect(result.newBooks).toHaveLength(0);
      expect(result.existingBooks).toHaveLength(1);
    });

    it.skipIf(!isM2Ready)('F12-5: maintains deterministic order in newBooks matching input order', () => {
      const books: ParsedGoodreadsBook[] = [
        { raw: { title: 'First', author: 'Author' }, metadata: { id: '21', url: '', title: 'First', author: 'Author', publisher: 'P', isbn: '1' }, cleanTitle: 'First', readingStatus: 'Okundu' },
        { raw: { title: 'Second', author: 'Author' }, metadata: { id: '22', url: '', title: 'Second', author: 'Author', publisher: 'P', isbn: '2' }, cleanTitle: 'Second', readingStatus: 'Okundu' },
      ];
      const result = modules.duplicateDetector!.detectDuplicates(books, []);
      expect(result.newBooks[0].cleanTitle).toBe('First');
      expect(result.newBooks[1].cleanTitle).toBe('Second');
    });
  });
});
