import { describe, it, expect } from 'vitest';
import {
  stripSeriesInfo,
  normalizeTitleForMatching,
  extractTitleAndAuthorFromBasename,
  extractDirectVaultIsbns,
  extractDirectCsvIsbns,
  evaluateAuthorMatch,
  detectDuplicates,
} from '../../src/goodreads/duplicateDetector';
import type { ParsedGoodreadsBook, ExistingVaultBook } from '../../src/goodreads/types';
import { createMockObsidianApp } from '../e2e/harness/mockVault';

describe('Goodreads Duplicate Detection Engine (duplicateDetector.ts)', () => {
  describe('stripSeriesInfo', () => {
    it('strips simple series number in parentheses (#1)', () => {
      expect(stripSeriesInfo('The Way of Kings (#1)')).toBe('The Way of Kings');
      expect(stripSeriesInfo('Words of Radiance (#2)')).toBe('Words of Radiance');
    });

    it('strips series title with number in parentheses', () => {
      expect(stripSeriesInfo('Dune (Dune Chronicles, #1)')).toBe('Dune');
      expect(stripSeriesInfo('Dune Messiah (Dune Chronicles, #2)')).toBe('Dune Messiah');
    });

    it('strips "Book N" indicators in parentheses', () => {
      expect(stripSeriesInfo('The Final Empire (Mistborn, Book 1)')).toBe('The Final Empire');
      expect(stripSeriesInfo('The Well of Ascension (Mistborn, Book 2)')).toBe('The Well of Ascension');
      expect(stripSeriesInfo('Fahrenheit 451 (Book 1)')).toBe('Fahrenheit 451');
    });

    it('strips "Vol. N" and "Volume N" indicators in parentheses', () => {
      expect(stripSeriesInfo('Berserk (Vol. 1)')).toBe('Berserk');
      expect(stripSeriesInfo('Akira (Volume 1)')).toBe('Akira');
      expect(stripSeriesInfo('Sandman (Vol 3)')).toBe('Sandman');
    });

    it('strips series number ranges like #1-3 and #1–3', () => {
      expect(stripSeriesInfo('The Lord of the Rings (#1-3)')).toBe('The Lord of the Rings');
      expect(stripSeriesInfo('The Lord of the Rings (#1–3)')).toBe('The Lord of the Rings');
      expect(stripSeriesInfo('Mistborn Trilogy (Books 1-3)')).toBe('Mistborn Trilogy');
      expect(stripSeriesInfo('Manga Collection (Volumes 1-5)')).toBe('Manga Collection');
      expect(stripSeriesInfo('Epic Tale (Parts 1-2)')).toBe('Epic Tale');
    });

    it('strips bracketed series notations [Series, #1]', () => {
      expect(stripSeriesInfo('Dune [Dune Chronicles, #1]')).toBe('Dune');
      expect(stripSeriesInfo('Harry Potter [Books 1-7]')).toBe('Harry Potter');
    });

    it('preserves non-series parenthetical subtitles', () => {
      expect(stripSeriesInfo('Hamlet (Turkish Edition)')).toBe('Hamlet (Turkish Edition)');
      expect(stripSeriesInfo('Körlük (Roman)')).toBe('Körlük (Roman)');
      expect(stripSeriesInfo('Clean Code (A Handbook of Agile Craftsmanship)')).toBe(
        'Clean Code (A Handbook of Agile Craftsmanship)'
      );
    });

    it('handles null, undefined, empty, and whitespace strings safely', () => {
      expect(stripSeriesInfo(null)).toBe('');
      expect(stripSeriesInfo(undefined)).toBe('');
      expect(stripSeriesInfo('')).toBe('');
      expect(stripSeriesInfo('   ')).toBe('');
    });

    it('does not strip if title consists solely of parenthetical indicator', () => {
      expect(stripSeriesInfo('(#1)')).toBe('(#1)');
      expect(stripSeriesInfo('(Book 1)')).toBe('(Book 1)');
    });
  });

  describe('normalizeTitleForMatching', () => {
    it('normalizes Turkish diacritics including dotted and dotless I', () => {
      expect(normalizeTitleForMatching('İnce Memed')).toBe('ince memed');
      expect(normalizeTitleForMatching('Isparta')).toBe('isparta');
      expect(normalizeTitleForMatching('Şeker Portakalı')).toBe('seker portakali');
      expect(normalizeTitleForMatching('Körlük')).toBe('korluk');
      expect(normalizeTitleForMatching('Çalıkuşu')).toBe('calikusu');
      expect(normalizeTitleForMatching('Dağlar')).toBe('daglar');
    });

    it('strips physical format tags in parentheses or brackets', () => {
      expect(normalizeTitleForMatching('Dune (Karton Kapak)')).toBe('dune');
      expect(normalizeTitleForMatching('Dune (Ciltli)')).toBe('dune');
      expect(normalizeTitleForMatching('Dune (Özel Baskı)')).toBe('dune');
      expect(normalizeTitleForMatching('Dune [Kutulu Set]')).toBe('dune');
      expect(normalizeTitleForMatching('Dune (Cep Boy)')).toBe('dune');
    });

    it('strips format tags following hyphen or colon', () => {
      expect(normalizeTitleForMatching('Dune - Ciltli')).toBe('dune');
      expect(normalizeTitleForMatching('Dune - Karton Kapak')).toBe('dune');
      expect(normalizeTitleForMatching('Dune: Özel Baskı')).toBe('dune');
    });

    it('normalizes subtitle delimiters (: vs - vs —)', () => {
      const colon = normalizeTitleForMatching('Sapiens: Hayvanlardan Tanrılara');
      const hyphen = normalizeTitleForMatching('Sapiens - Hayvanlardan Tanrılara');
      const emDash = normalizeTitleForMatching('Sapiens — Hayvanlardan Tanrılara');

      expect(colon).toBe('sapiens hayvanlardan tanrilara');
      expect(colon).toBe(hyphen);
      expect(colon).toBe(emDash);
    });

    it('removes punctuation and extra whitespace', () => {
      expect(normalizeTitleForMatching('Fahrenheit 451!')).toBe('fahrenheit 451');
      expect(normalizeTitleForMatching('Where Are You Going, Where Have You Been?')).toBe(
        'where are you going where have you been'
      );
      expect(normalizeTitleForMatching('  Multiple    Spaces   Inside  ')).toBe(
        'multiple spaces inside'
      );
    });

    it('handles empty and null values safely', () => {
      expect(normalizeTitleForMatching(null)).toBe('');
      expect(normalizeTitleForMatching(undefined)).toBe('');
      expect(normalizeTitleForMatching('')).toBe('');
    });
  });

  describe('extractTitleAndAuthorFromBasename', () => {
    it('extracts title and author separated by hyphen with spaces', () => {
      const res = extractTitleAndAuthorFromBasename('Dune - Frank Herbert');
      expect(res.title).toBe('Dune');
      expect(res.author).toBe('Frank Herbert');
    });

    it('extracts title and author separated by en-dash or em-dash', () => {
      const resEn = extractTitleAndAuthorFromBasename('Körlük – José Saramago');
      expect(resEn.title).toBe('Körlük');
      expect(resEn.author).toBe('José Saramago');

      const resEm = extractTitleAndAuthorFromBasename('Vakıf — Isaac Asimov');
      expect(resEm.title).toBe('Vakıf');
      expect(resEm.author).toBe('Isaac Asimov');
    });

    it('handles basenames without author separator', () => {
      const res = extractTitleAndAuthorFromBasename('Dune');
      expect(res.title).toBe('Dune');
      expect(res.author).toBeUndefined();
    });

    it('handles empty strings safely', () => {
      expect(extractTitleAndAuthorFromBasename('')).toEqual({ title: '' });
    });
  });

  describe('extractDirectVaultIsbns and extractDirectCsvIsbns', () => {
    const mockEnv = createMockObsidianApp();

    it('extracts valid direct ISBNs from vault note frontmatter', () => {
      const file = mockEnv.vault.createFile('TestBook.md', '', {
        isbn: '9780441172719',
        isbn10: '0441172717',
      });
      const vaultBook: ExistingVaultBook = {
        file,
        path: file.path,
        title: 'Dune',
        author: 'Frank Herbert',
        frontmatter: {
          isbn: '9780441172719',
          isbn10: '0441172717',
        },
      };

      const isbns = extractDirectVaultIsbns(vaultBook);
      expect(isbns).toContain('9780441172719');
      expect(isbns).toContain('0441172717');
    });

    it('extracts valid direct ISBNs from CSV book raw fields and unescapes Excel formulas', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: {
          title: 'Dune',
          author: 'Frank Herbert',
          isbn13: '="9780441172719"',
          isbn: '="0441172717"',
        },
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
      };

      const isbns = extractDirectCsvIsbns(csvBook);
      expect(isbns).toContain('9780441172719');
      expect(isbns).toContain('0441172717');
    });
  });

  describe('evaluateAuthorMatch', () => {
    const mockEnv = createMockObsidianApp();

    const createVaultBook = (author: string, title = 'Sample Title', basename = 'Sample Title'): ExistingVaultBook => {
      const file = mockEnv.vault.createFile(`${basename}.md`, '', { yazar: author, baslik: title });
      return {
        file,
        path: file.path,
        title,
        author,
        frontmatter: { yazar: author, baslik: title },
      };
    };

    const createCsvBook = (
      author: string,
      additionalAuthors?: string,
      authorLf?: string
    ): ParsedGoodreadsBook => ({
      raw: {
        title: 'Sample Title',
        author,
        ...(additionalAuthors ? { additionalAuthors } : {}),
        ...(authorLf ? { authorLf } : {}),
      },
      metadata: {
        id: '1',
        url: '',
        title: 'Sample Title',
        author,
        publisher: 'Pub',
        isbn: '',
      },
      cleanTitle: 'Sample Title',
      readingStatus: 'Okundu',
    });

    it('matches identical authors', () => {
      const csv = createCsvBook('Frank Herbert');
      const vault = createVaultBook('Frank Herbert');
      expect(evaluateAuthorMatch(csv, vault, 'sample title')).toBe('match');
    });

    it('matches "Last, First" in CSV with "First Last" in vault', () => {
      const csv = createCsvBook('Fyodor Dostoevsky', undefined, 'Dostoevsky, Fyodor');
      const vault = createVaultBook('Fyodor Dostoevsky');
      expect(evaluateAuthorMatch(csv, vault, 'sample title')).toBe('match');
    });

    it('matches "First Last" in CSV with "Last, First" in vault', () => {
      const csv = createCsvBook('Fyodor Dostoevsky');
      const vault = createVaultBook('Dostoevsky, Fyodor');
      expect(evaluateAuthorMatch(csv, vault, 'sample title')).toBe('match');
    });

    it('matches middle names and initials', () => {
      const csv1 = createCsvBook('Arthur Conan Doyle');
      const vault1 = createVaultBook('Arthur Doyle');
      expect(evaluateAuthorMatch(csv1, vault1, 'sample title')).toBe('match');

      const csv2 = createCsvBook('George R. R. Martin');
      const vault2 = createVaultBook('George Martin');
      expect(evaluateAuthorMatch(csv2, vault2, 'sample title')).toBe('match');
    });

    it('matches wikilink wrapped authors in vault note', () => {
      const csv = createCsvBook('Frank Herbert');
      const vaultWiki = createVaultBook('[[Frank Herbert]]');
      expect(evaluateAuthorMatch(csv, vaultWiki, 'sample title')).toBe('match');

      const vaultAlias = createVaultBook('[[Authors/Frank Herbert|Herbert]]');
      expect(evaluateAuthorMatch(csv, vaultAlias, 'sample title')).toBe('match');
    });

    it('matches when vault author is an array or comma-separated list of authors', () => {
      const csv = createCsvBook('Terry Pratchett');
      const vault = createVaultBook('Neil Gaiman, Terry Pratchett');
      expect(evaluateAuthorMatch(csv, vault, 'sample title')).toBe('match');
    });

    it('matches when CSV author list includes additional authors', () => {
      const csv = createCsvBook('Neil Gaiman', 'Terry Pratchett');
      const vault = createVaultBook('Terry Pratchett');
      expect(evaluateAuthorMatch(csv, vault, 'sample title')).toBe('match');
    });

    it('strictly guards against false-positive match when authors conflict completely', () => {
      const csv = createCsvBook('Franz Kafka');
      const vault = createVaultBook('Ovidius');
      expect(evaluateAuthorMatch(csv, vault, 'donusum')).toBe('conflict');
    });

    it('strictly guards against false-positive match when authors share only surname', () => {
      const csv = createCsvBook('Brian Herbert');
      const vault = createVaultBook('Frank Herbert');
      expect(evaluateAuthorMatch(csv, vault, 'dune')).toBe('conflict');
    });

    it('falls back to filename basename when vault frontmatter author is absent', () => {
      const csv = createCsvBook('Yuval Noah Harari');
      const vault = createVaultBook('', 'Sapiens', 'Sapiens - Yuval Noah Harari');
      expect(evaluateAuthorMatch(csv, vault, 'sapiens')).toBe('match');
    });

    it('matches distinctive titles (>= 8 chars) when author is missing on one side', () => {
      const csv = createCsvBook('');
      const vault = createVaultBook('');
      expect(evaluateAuthorMatch(csv, vault, 'karamazov kardesler')).toBe('match');
    });

    it('returns "no-author-match" for short non-distinctive titles (< 8 chars) when author is missing', () => {
      const csv = createCsvBook('');
      const vault = createVaultBook('');
      expect(evaluateAuthorMatch(csv, vault, 'dune')).toBe('no-author-match');
      expect(evaluateAuthorMatch(csv, vault, '1984')).toBe('no-author-match');
    });
  });

  describe('detectDuplicates (Partitioning & Match Reasons)', () => {
    const mockEnv = createMockObsidianApp();

    it('partitions exact ISBN-13 match with reason "isbn-exact"', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Dune', author: 'Frank Herbert', isbn13: '9780441172719' },
        metadata: { id: '1', url: '', title: 'Dune', author: 'Frank Herbert', publisher: 'Ace', isbn: '9780441172719' },
        cleanTitle: 'Dune',
        readingStatus: 'Okundu',
        isbn13: '9780441172719',
      };
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Kitaplar/Dune13.md', '', { isbn: '9780441172719' }),
        path: 'Kitaplar/Dune13.md',
        title: 'Dune',
        author: 'Frank Herbert',
        isbn13: '9780441172719',
        frontmatter: { isbn: '9780441172719' },
      };

      const result = detectDuplicates([csvBook], [vaultBook]);
      expect(result.newBooks).toHaveLength(0);
      expect(result.existingBooks).toHaveLength(1);
      expect(result.existingBooks[0].matchReason).toBe('isbn-exact');
      expect(result.existingBooks[0].csvBook.cleanTitle).toBe('Dune');
      expect(result.existingBooks[0].existingNote.path).toBe('Kitaplar/Dune13.md');
    });

    it('partitions converted ISBN match (ISBN-10 in CSV vs ISBN-13 in vault) with reason "isbn-converted"', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Dune', author: 'Frank Herbert', isbn: '0441172717' },
        metadata: { id: '2', url: '', title: 'Dune', author: 'Frank Herbert', publisher: 'Ace', isbn: '0441172717' },
        cleanTitle: 'Dune',
        readingStatus: 'Okundu',
        isbn10: '0441172717',
      };
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Kitaplar/DuneConverted.md', '', { isbn: '9780441172719' }),
        path: 'Kitaplar/DuneConverted.md',
        title: 'Dune',
        author: 'Frank Herbert',
        isbn13: '9780441172719',
        frontmatter: { isbn: '9780441172719' },
      };

      const result = detectDuplicates([csvBook], [vaultBook]);
      expect(result.newBooks).toHaveLength(0);
      expect(result.existingBooks).toHaveLength(1);
      expect(result.existingBooks[0].matchReason).toBe('isbn-converted');
    });

    it('partitions Title + Author match with reason "title-author-normalized" when ISBN is absent', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Dune (Dune Chronicles, #1)', author: 'Frank Herbert' },
        metadata: { id: '3', url: '', title: 'Dune (Dune Chronicles, #1)', author: 'Frank Herbert', publisher: 'Ace', isbn: '' },
        cleanTitle: 'Dune',
        readingStatus: 'Okundu',
      };
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Kitaplar/DuneSeries.md', '', { baslik: 'Dune', yazar: 'Frank Herbert' }),
        path: 'Kitaplar/DuneSeries.md',
        title: 'Dune',
        author: 'Frank Herbert',
        frontmatter: { baslik: 'Dune', yazar: 'Frank Herbert' },
      };

      const result = detectDuplicates([csvBook], [vaultBook]);
      expect(result.newBooks).toHaveLength(0);
      expect(result.existingBooks).toHaveLength(1);
      expect(result.existingBooks[0].matchReason).toBe('title-author-normalized');
    });

    it('rejects duplicate match when title is identical but authors conflict (treats as newBook)', () => {
      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Dönüşüm', author: 'Franz Kafka' },
        metadata: { id: '4', url: '', title: 'Dönüşüm', author: 'Franz Kafka', publisher: 'Can', isbn: '' },
        cleanTitle: 'Dönüşüm',
        readingStatus: 'Okundu',
      };
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Kitaplar/DonusumOvidius.md', '', { baslik: 'Dönüşüm', yazar: 'Ovidius' }),
        path: 'Kitaplar/DonusumOvidius.md',
        title: 'Dönüşüm',
        author: 'Ovidius',
        frontmatter: { baslik: 'Dönüşüm', yazar: 'Ovidius' },
      };

      const result = detectDuplicates([csvBook], [vaultBook]);
      expect(result.newBooks).toHaveLength(1);
      expect(result.existingBooks).toHaveLength(0);
      expect(result.newBooks[0].cleanTitle).toBe('Dönüşüm');
    });

    it('handles multiple CSV books cleanly dividing between newBooks and existingBooks', () => {
      const book1: ParsedGoodreadsBook = {
        raw: { title: 'Existing 1', author: 'Author 1', isbn13: '9781111111111' },
        metadata: { id: '5', url: '', title: 'Existing 1', author: 'Author 1', publisher: 'P', isbn: '9781111111111' },
        cleanTitle: 'Existing 1',
        readingStatus: 'Okundu',
        isbn13: '9781111111111',
      };
      const book2: ParsedGoodreadsBook = {
        raw: { title: 'Brand New', author: 'New Author', isbn13: '9782222222222' },
        metadata: { id: '6', url: '', title: 'Brand New', author: 'New Author', publisher: 'P', isbn: '9782222222222' },
        cleanTitle: 'Brand New',
        readingStatus: 'Okunacak',
        isbn13: '9782222222222',
      };
      const book3: ParsedGoodreadsBook = {
        raw: { title: 'Körlük', author: 'José Saramago' },
        metadata: { id: '7', url: '', title: 'Körlük', author: 'José Saramago', publisher: 'Kırmızı Kedi', isbn: '' },
        cleanTitle: 'Körlük',
        readingStatus: 'Okundu',
      };

      const vaultBook1: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Kitaplar/V1.md', '', { isbn: '9781111111111' }),
        path: 'Kitaplar/V1.md',
        title: 'Existing 1',
        author: 'Author 1',
        isbn13: '9781111111111',
        frontmatter: { isbn: '9781111111111' },
      };
      const vaultBook3: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Kitaplar/Korluk.md', '', { baslik: 'Körlük', yazar: 'José Saramago' }),
        path: 'Kitaplar/Korluk.md',
        title: 'Körlük',
        author: 'José Saramago',
        frontmatter: { baslik: 'Körlük', yazar: 'José Saramago' },
      };

      const result = detectDuplicates([book1, book2, book3], [vaultBook1, vaultBook3]);
      expect(result.existingBooks).toHaveLength(2);
      expect(result.newBooks).toHaveLength(1);
      expect(result.newBooks[0].cleanTitle).toBe('Brand New');
      expect(result.existingBooks.some((b) => b.csvBook.cleanTitle === 'Existing 1')).toBe(true);
      expect(result.existingBooks.some((b) => b.csvBook.cleanTitle === 'Körlük')).toBe(true);
    });

    it('preserves input order of newBooks', () => {
      const books: ParsedGoodreadsBook[] = [
        { raw: { title: 'Book C', author: 'Author C' }, metadata: { id: '10', url: '', title: 'Book C', author: 'Author C', publisher: 'P', isbn: '' }, cleanTitle: 'Book C', readingStatus: 'Okundu' },
        { raw: { title: 'Book A', author: 'Author A' }, metadata: { id: '11', url: '', title: 'Book A', author: 'Author A', publisher: 'P', isbn: '' }, cleanTitle: 'Book A', readingStatus: 'Okundu' },
        { raw: { title: 'Book B', author: 'Author B' }, metadata: { id: '12', url: '', title: 'Book B', author: 'Author B', publisher: 'P', isbn: '' }, cleanTitle: 'Book B', readingStatus: 'Okundu' },
      ];

      const result = detectDuplicates(books, []);
      expect(result.newBooks.map((b) => b.cleanTitle)).toEqual(['Book C', 'Book A', 'Book B']);
    });

    it('returns empty partitions when csvBooks is empty', () => {
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Kitaplar/VEmpty.md', '', {}),
        path: 'Kitaplar/VEmpty.md',
        title: 'Title',
        author: 'Author',
        frontmatter: {},
      };
      const result = detectDuplicates([], [vaultBook]);
      expect(result.newBooks).toHaveLength(0);
      expect(result.existingBooks).toHaveLength(0);
    });

    it('returns all books as newBooks when vaultBooks is empty', () => {
      const books: ParsedGoodreadsBook[] = [
        { raw: { title: 'Book 1', author: 'Author 1' }, metadata: { id: '13', url: '', title: 'Book 1', author: 'Author 1', publisher: 'P', isbn: '' }, cleanTitle: 'Book 1', readingStatus: 'Okundu' },
      ];
      const result = detectDuplicates(books, []);
      expect(result.newBooks).toHaveLength(1);
      expect(result.existingBooks).toHaveLength(0);
    });
  });
});
