/**
 * obsidian-kitap - Adversarial Challenge Suite for Milestone 2
 * Tests edge cases, boundaries, stress-scaling, and integrity invariants for:
 *   - src/goodreads/vaultScanner.ts
 *   - src/goodreads/duplicateDetector.ts
 */

import { describe, it, expect, vi } from 'vitest';
import {
  scanVaultBooks,
  isInTargetFolder,
  extractFrontmatter,
  extractTitleFromFrontmatter,
  extractAuthorFromFrontmatter,
  extractIsbnsFromFrontmatter,
  buildVaultBookRecord,
  getEffectiveKey,
  BookPropertyMapping,
} from '../../src/goodreads/vaultScanner';
import {
  stripSeriesInfo,
  normalizeTitleForMatching,
  extractTitleAndAuthorFromBasename,
  extractDirectVaultIsbns,
  extractDirectCsvIsbns,
  buildVaultIndices,
  evaluateAuthorMatch,
  detectDuplicates,
} from '../../src/goodreads/duplicateDetector';
import { cleanIsbn, isIsbn, getAlternateIsbn } from '../../src/providers/matcher';
import type { ParsedGoodreadsBook, ExistingVaultBook } from '../../src/goodreads/types';
import { PropertyMappingOption } from '../../src/settings/propertyMapping';
import { createMockObsidianApp } from '../e2e/harness/mockVault';

describe('Milestone 2 Empirical Challenge: Vault Scanner & Deduplication', () => {
  // =========================================================================
  // SUITE 1: Missing, Empty, and Malformed Frontmatter
  // =========================================================================
  describe('C1: Missing, Empty, and Malformed Frontmatter Handling', () => {
    it('C1.1: extracts empty frontmatter from empty string or non-string content', () => {
      expect(extractFrontmatter('')).toEqual({});
      expect(extractFrontmatter('   \n\r\n   ')).toEqual({});
      // @ts-expect-error test non-string input resilience
      expect(extractFrontmatter(null)).toEqual({});
      // @ts-expect-error test non-string input resilience
      expect(extractFrontmatter(undefined)).toEqual({});
      // @ts-expect-error test non-string input resilience
      expect(extractFrontmatter(12345)).toEqual({});
    });

    it('C1.2: handles markdown with no frontmatter delimiters', () => {
      const content = '# Dune\n\nBu bir bilimkurgu romanıdır.\nYazar: Frank Herbert';
      expect(extractFrontmatter(content)).toEqual({});
    });

    it('C1.3: handles empty frontmatter delimiters (---\\n---)', () => {
      const content = '---\n---\n# Dune\n';
      expect(extractFrontmatter(content)).toEqual({});

      const crlfContent = '---\r\n\r\n---\r\n# Dune\r\n';
      expect(extractFrontmatter(crlfContent)).toEqual({});
    });

    it('C1.4: recovers safely from severely corrupted YAML syntax without crashing', () => {
      const malformedYaml = [
        '---\n: invalid: yaml: [unclosed\n---\n',
        '---\n{ key without closing brace\n---\n',
        '---\n*bad_alias\n---\n',
        '---\n[unclosed array\n---\n',
      ];

      for (const snippet of malformedYaml) {
        expect(() => extractFrontmatter(snippet)).not.toThrow();
        expect(extractFrontmatter(snippet)).toEqual({});
      }
    });

    it('C1.5: handles non-string frontmatter data types (numbers, booleans, arrays, nulls)', () => {
      const fm: Record<string, unknown> = {
        baslik: 1984, // Numeric title
        yazar: true, // Boolean author
        isbn: 9780441172719, // Numeric ISBN
        sayfa: null,
        diger: undefined,
      };

      const title = extractTitleFromFrontmatter(fm, 'FallbackBasename');
      expect(title).toBe('1984');

      const isbns = extractIsbnsFromFrontmatter(fm);
      expect(isbns.isbn13).toBe('9780441172719');
      expect(isbns.isbn10).toBe('0441172717');
    });

    it('C1.6: falls back to filename basename when frontmatter is entirely missing', () => {
      const mockEnv = createMockObsidianApp();
      const file = mockEnv.vault.createFile('Kitaplar/Frank Herbert - Dune.md', 'No frontmatter here');

      const record = buildVaultBookRecord(file, {});
      expect(record.title).toBe('Frank Herbert - Dune');
      expect(record.author).toBe('');
      expect(record.isbn10).toBeUndefined();
      expect(record.isbn13).toBeUndefined();
    });

    it('C1.7: gracefully handles null or missing metadataCache and empty app.vault', async () => {
      // @ts-expect-error test uninitialized app instance
      const emptyResult = await scanVaultBooks({});
      expect(emptyResult).toEqual([]);

      // @ts-expect-error test null app instance
      const nullResult = await scanVaultBooks(null);
      expect(nullResult).toEqual([]);
    });
  });

  // =========================================================================
  // SUITE 2: Non-Standard and User Remapped Frontmatter Properties
  // =========================================================================
  describe('C2: Non-Standard Frontmatter and Property Remappings', () => {
    it('C2.1: resolves custom mapped property key for canonical baslik, yazar, isbn', () => {
      const mappings: BookPropertyMapping[] = [
        { property: 'baslik', newProperty: 'kitap_adi', mapping: PropertyMappingOption.Map },
        { property: 'yazar', newProperty: 'yazarlar', mapping: PropertyMappingOption.Map },
        { property: 'isbn', newProperty: 'barkod_no', mapping: PropertyMappingOption.Map },
      ];

      expect(getEffectiveKey('baslik', mappings)).toBe('kitap_adi');
      expect(getEffectiveKey('yazar', mappings)).toBe('yazarlar');
      expect(getEffectiveKey('isbn', mappings)).toBe('barkod_no');
    });

    it('C2.2: trims whitespace from custom remapped property names', () => {
      const mappings: BookPropertyMapping[] = [
        { property: 'baslik', newProperty: '   ozel_baslik   ', mapping: PropertyMappingOption.Map },
      ];
      expect(getEffectiveKey('baslik', mappings)).toBe('ozel_baslik');
    });

    it('C2.3: ignores remapping when option is Default or Remove', () => {
      const mappings: BookPropertyMapping[] = [
        { property: 'baslik', newProperty: 'ignored_key', mapping: PropertyMappingOption.Default },
        { property: 'yazar', newProperty: 'ignored_key', mapping: PropertyMappingOption.Remove },
      ];
      expect(getEffectiveKey('baslik', mappings)).toBeUndefined();
      expect(getEffectiveKey('yazar', mappings)).toBeUndefined();
    });

    it('C2.4: extracts title, author, and ISBN using user-remapped properties', () => {
      const mappings: BookPropertyMapping[] = [
        { property: 'baslik', newProperty: 'kitap_adi', mapping: PropertyMappingOption.Map },
        { property: 'yazar', newProperty: 'muellif', mapping: PropertyMappingOption.Map },
        { property: 'isbn', newProperty: 'barkod', mapping: PropertyMappingOption.Map },
      ];

      const fm = {
        kitap_adi: 'Vakıf',
        muellif: 'Isaac Asimov',
        barkod: '9789752100183',
      };

      expect(extractTitleFromFrontmatter(fm, 'Fallback', mappings)).toBe('Vakıf');
      expect(extractAuthorFromFrontmatter(fm, mappings)).toBe('Isaac Asimov');

      const isbns = extractIsbnsFromFrontmatter(fm, mappings);
      expect(isbns.isbn13).toBe('9789752100183');
    });

    it('C2.5: falls back through standard English & Turkish alternate keys if remapped key is missing', () => {
      const mappings: BookPropertyMapping[] = [
        { property: 'baslik', newProperty: 'custom_title', mapping: PropertyMappingOption.Map },
      ];

      // Note does not contain custom_title, but contains English "title"
      const fm1 = { title: 'Foundation' };
      expect(extractTitleFromFrontmatter(fm1, 'Fallback', mappings)).toBe('Foundation');

      // Note contains "name"
      const fm2 = { name: 'Solaris' };
      expect(extractTitleFromFrontmatter(fm2, 'Fallback', mappings)).toBe('Solaris');

      // Note contains author in "writer"
      const fm3 = { writer: 'Stanislaw Lem' };
      expect(extractAuthorFromFrontmatter(fm3)).toBe('Stanislaw Lem');
    });
  });

  // =========================================================================
  // SUITE 3: Wikilink Variations in Author and Title
  // =========================================================================
  describe('C3: Wikilink-wrapped Author and Title Strings', () => {
    it('C3.1: unwraps standard wikilinks in author: [[Frank Herbert]]', () => {
      const fm = { yazar: '[[Frank Herbert]]' };
      expect(extractAuthorFromFrontmatter(fm)).toBe('Frank Herbert');
    });

    it('C3.2: unwraps aliased wikilinks in author: [[Authors/Frank Herbert|Herbert]]', () => {
      const fm = { yazar: '[[Authors/Frank Herbert|Herbert]]' };
      expect(extractAuthorFromFrontmatter(fm)).toBe('Herbert');
    });

    it('C3.3: unwraps and matches path-based wikilink author without alias [[Yazarlar/Frank Herbert]]', () => {
      const fm = { yazar: '[[Yazarlar/Frank Herbert]]' };
      const extracted = extractAuthorFromFrontmatter(fm);
      expect(extracted).toBe('Yazarlar/Frank Herbert');

      // Match against CSV author "Frank Herbert"
      const mockEnv = createMockObsidianApp();
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Kitaplar/Dune.md', '', fm),
        path: 'Kitaplar/Dune.md',
        title: 'Dune',
        author: extracted,
        frontmatter: fm,
      };

      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Dune', author: 'Frank Herbert' },
        metadata: { id: '1', url: '', title: 'Dune', author: 'Frank Herbert', publisher: '', isbn: '' },
        cleanTitle: 'Dune',
        readingStatus: 'Okundu',
      };

      const evalRes = evaluateAuthorMatch(csvBook, vaultBook, 'dune');
      expect(evalRes).toBe('match');
    });

    it('C3.4: extracts YAML array of wikilink authors: ["[[Neil Gaiman]]", "[[Terry Pratchett]]"]', () => {
      const fm = {
        yazarlar: ['[[Neil Gaiman]]', '[[Terry Pratchett]]'],
      };
      const extracted = extractAuthorFromFrontmatter(fm);
      expect(extracted).toBe('Neil Gaiman, Terry Pratchett');
    });

    it('C3.5: unwraps aliased wikilink in title: [[Dune|Çöl Gezegeni]]', () => {
      const fm = { baslik: '[[Dune|Çöl Gezegeni]]' };
      const title = extractTitleFromFrontmatter(fm, 'Fallback');
      expect(title).toBe('Çöl Gezegeni');
    });

    it('C3.6: matches aliased title wikilink [[Dune|Çöl Gezegeni]] against CSV title "Çöl Gezegeni"', () => {
      const mockEnv = createMockObsidianApp();
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Kitaplar/ColGezegeni.md', '', {
          baslik: '[[Dune|Çöl Gezegeni]]',
          yazar: '[[Frank Herbert]]',
        }),
        path: 'Kitaplar/ColGezegeni.md',
        title: 'Çöl Gezegeni',
        author: 'Frank Herbert',
        frontmatter: {
          baslik: '[[Dune|Çöl Gezegeni]]',
          yazar: '[[Frank Herbert]]',
        },
      };

      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Çöl Gezegeni', author: 'Frank Herbert' },
        metadata: { id: '1', url: '', title: 'Çöl Gezegeni', author: 'Frank Herbert', publisher: '', isbn: '' },
        cleanTitle: 'Çöl Gezegeni',
        readingStatus: 'Okundu',
      };

      const result = detectDuplicates([csvBook], [vaultBook]);
      expect(result.newBooks).toHaveLength(0);
      expect(result.existingBooks).toHaveLength(1);
      expect(result.existingBooks[0].matchReason).toBe('title-author-normalized');
    });

    it('C3.7: unwraps Markdown links in title and author: [Dune](https://example.com)', () => {
      const fm = {
        baslik: '[Dune](https://example.com/books/dune)',
        yazar: '[Frank Herbert](https://example.com/authors/frank)',
      };
      expect(extractTitleFromFrontmatter(fm, 'Fallback')).toBe('Dune');
      expect(extractAuthorFromFrontmatter(fm)).toBe('Frank Herbert');
    });

    it('C3.8: challenges whether aliased title wikilink [[Dune|Çöl Gezegeni]] matches CSV title "Dune" (target title)', () => {
      const mockEnv = createMockObsidianApp();
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Kitaplar/ColGezegeni.md', '', {
          baslik: '[[Dune|Çöl Gezegeni]]',
          yazar: '[[Frank Herbert]]',
        }),
        path: 'Kitaplar/ColGezegeni.md',
        title: 'Çöl Gezegeni',
        author: 'Frank Herbert',
        frontmatter: {
          baslik: '[[Dune|Çöl Gezegeni]]',
          yazar: '[[Frank Herbert]]',
        },
      };

      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Dune', author: 'Frank Herbert' },
        metadata: { id: '1', url: '', title: 'Dune', author: 'Frank Herbert', publisher: '', isbn: '' },
        cleanTitle: 'Dune',
        readingStatus: 'Okundu',
      };

      const result = detectDuplicates([csvBook], [vaultBook]);
      // If title was "Çöl Gezegeni" and file was "ColGezegeni.md", does CSV "Dune" match?
      // Without ISBN, "Dune" != "Çöl Gezegeni", so it's treated as new book:
      expect(result.newBooks).toHaveLength(1);
      expect(result.existingBooks).toHaveLength(0);
    });
  });

  // =========================================================================
  // SUITE 4: ISBN-10 to ISBN-13 Bidirectional Matching & Check Digit X
  // =========================================================================
  describe('C4: ISBN-10 to ISBN-13 Bidirectional Matching with Check Digit X', () => {
    // Known valid ISBN-10 with check digit X and their valid ISBN-13 counterparts:
    const testIsbnPairs = [
      { isbn10: '080442957X', isbn13: '9780804429573', desc: '080442957X <-> 9780804429573' },
      { isbn10: '039304002X', isbn13: '9780393040029', desc: '039304002X <-> 9780393040029' },
      { isbn10: '155860832X', isbn13: '9781558608320', desc: '155860832X <-> 9781558608320' },
      { isbn10: '0123456789', isbn13: '9780123456786', desc: 'standard digit check' },
      { isbn10: '0441172717', isbn13: '9780441172719', desc: 'Dune Ace PB' },
    ];

    it('C4.1: verifies getAlternateIsbn calculates check digit X correctly for all test pairs', () => {
      for (const pair of testIsbnPairs) {
        expect(getAlternateIsbn(pair.isbn13)).toBe(pair.isbn10);
        expect(getAlternateIsbn(pair.isbn10)).toBe(pair.isbn13);
      }
    });

    it('C4.2: matches CSV ISBN-10 with check digit X against Vault note with ISBN-13', () => {
      const mockEnv = createMockObsidianApp();

      for (const pair of testIsbnPairs.filter((p) => p.isbn10.endsWith('X'))) {
        const vaultBook: ExistingVaultBook = {
          file: mockEnv.vault.createFile(`Kitaplar/Note_${pair.isbn13}.md`, '', {
            isbn: pair.isbn13,
          }),
          path: `Kitaplar/Note_${pair.isbn13}.md`,
          title: `Book ${pair.isbn13}`,
          author: 'Author',
          isbn13: pair.isbn13,
          frontmatter: { isbn: pair.isbn13 },
        };

        const csvBook: ParsedGoodreadsBook = {
          raw: { title: `Book ${pair.isbn13}`, author: 'Author', isbn: pair.isbn10 },
          metadata: { id: '1', url: '', title: `Book ${pair.isbn13}`, author: 'Author', publisher: '', isbn: pair.isbn10 },
          cleanTitle: `Book ${pair.isbn13}`,
          readingStatus: 'Okundu',
          isbn10: pair.isbn10,
        };

        const result = detectDuplicates([csvBook], [vaultBook]);
        expect(result.newBooks).toHaveLength(0);
        expect(result.existingBooks).toHaveLength(1);
        expect(result.existingBooks[0].matchReason).toBe('isbn-converted');
      }
    });

    it('C4.3: matches CSV ISBN-13 against Vault note with ISBN-10 having check digit X', () => {
      const mockEnv = createMockObsidianApp();

      for (const pair of testIsbnPairs.filter((p) => p.isbn10.endsWith('X'))) {
        const vaultBook: ExistingVaultBook = {
          file: mockEnv.vault.createFile(`Kitaplar/Vault_${pair.isbn10}.md`, '', {
            isbn: pair.isbn10,
          }),
          path: `Kitaplar/Vault_${pair.isbn10}.md`,
          title: `Book ${pair.isbn10}`,
          author: 'Author',
          isbn10: pair.isbn10,
          frontmatter: { isbn: pair.isbn10 },
        };

        const csvBook: ParsedGoodreadsBook = {
          raw: { title: `Book ${pair.isbn10}`, author: 'Author', isbn13: pair.isbn13 },
          metadata: { id: '1', url: '', title: `Book ${pair.isbn10}`, author: 'Author', publisher: '', isbn: pair.isbn13 },
          cleanTitle: `Book ${pair.isbn10}`,
          readingStatus: 'Okundu',
          isbn13: pair.isbn13,
        };

        const result = detectDuplicates([csvBook], [vaultBook]);
        expect(result.newBooks).toHaveLength(0);
        expect(result.existingBooks).toHaveLength(1);
        expect(result.existingBooks[0].matchReason).toBe('isbn-converted');
      }
    });

    it('C4.4: handles lowercase x in ISBN-10 seamlessly in both CSV and Vault note', () => {
      const mockEnv = createMockObsidianApp();
      const lowerIsbn10 = '080442957x';

      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Kitaplar/LowerVault.md', '', {
          isbn: lowerIsbn10,
        }),
        path: 'Kitaplar/LowerVault.md',
        title: 'Title',
        author: 'Author',
        frontmatter: { isbn: lowerIsbn10 },
      };

      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Title', author: 'Author', isbn: '="080442957X"' },
        metadata: { id: '1', url: '', title: 'Title', author: 'Author', publisher: '', isbn: '080442957X' },
        cleanTitle: 'Title',
        readingStatus: 'Okundu',
        isbn10: '080442957X',
      };

      const result = detectDuplicates([csvBook], [vaultBook]);
      expect(result.newBooks).toHaveLength(0);
      expect(result.existingBooks).toHaveLength(1);
      // Both had ISBN-10 directly (normalized case), so reason is exact
      expect(result.existingBooks[0].matchReason).toBe('isbn-exact');
    });

    it('C4.5: preserves 979 prefix ISBN-13 without converting to invalid ISBN-10', () => {
      const isbn979 = '9791090636079';
      expect(getAlternateIsbn(isbn979)).toBeUndefined();

      const extracted = extractIsbnsFromFrontmatter({ isbn: isbn979 });
      expect(extracted.isbn13).toBe(isbn979);
      expect(extracted.isbn10).toBeUndefined();
    });

    it('C4.6: distinguishes isbn-exact from isbn-converted based on direct note presence', () => {
      const mockEnv = createMockObsidianApp();

      // Note has both ISBN-13 and ISBN-10 explicitly
      const vaultBookDual: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Kitaplar/Dual.md', '', {
          isbn13: '9780441172719',
          isbn10: '0441172717',
        }),
        path: 'Kitaplar/Dual.md',
        title: 'Dune',
        author: 'Frank Herbert',
        frontmatter: {
          isbn13: '9780441172719',
          isbn10: '0441172717',
        },
      };

      const csvBook10: ParsedGoodreadsBook = {
        raw: { title: 'Dune', author: 'Frank Herbert', isbn: '0441172717' },
        metadata: { id: '1', url: '', title: 'Dune', author: 'Frank Herbert', publisher: '', isbn: '0441172717' },
        cleanTitle: 'Dune',
        readingStatus: 'Okundu',
        isbn10: '0441172717',
      };

      const result = detectDuplicates([csvBook10], [vaultBookDual]);
      expect(result.existingBooks).toHaveLength(1);
      expect(result.existingBooks[0].matchReason).toBe('isbn-exact');
    });
  });

  // =========================================================================
  // SUITE 5: Target Folder Path Variations and Directory Boundary Safety
  // =========================================================================
  describe('C5: Target Folder Variations & Directory Boundary Safety', () => {
    it('C5.1: matches nested subfolders of configured book folder', () => {
      expect(isInTargetFolder('Kitaplar/BilimKurgu/Dune.md', 'Kitaplar')).toBe(true);
      expect(isInTargetFolder('Kitaplar/Kurgu/Klasikler/1984.md', 'Kitaplar')).toBe(true);
      expect(isInTargetFolder('Kitap/A/B/C/D.md', 'Kitap')).toBe(true);
    });

    it('C5.2: normalizes leading, trailing, and duplicate slashes in targetFolder', () => {
      expect(isInTargetFolder('Kitaplar/Dune.md', '/Kitaplar')).toBe(true);
      expect(isInTargetFolder('Kitaplar/Dune.md', 'Kitaplar/')).toBe(true);
      expect(isInTargetFolder('Kitaplar/Dune.md', '///Kitaplar///')).toBe(true);
      expect(isInTargetFolder('Kitaplar/Sub/Dune.md', '/Kitaplar/Sub/')).toBe(true);
    });

    it('C5.3: handles Windows backslashes in both filePath and targetFolder', () => {
      expect(isInTargetFolder('Kitaplar\\Dune.md', 'Kitaplar')).toBe(true);
      expect(isInTargetFolder('Kitaplar/Dune.md', 'Kitaplar\\')).toBe(true);
      expect(isInTargetFolder('Kitaplar\\Sub\\Dune.md', 'Kitaplar\\Sub')).toBe(true);
    });

    it('C5.4: prevents prefix-boundary false matches (Kitaplar vs KitaplarArsiv)', () => {
      expect(isInTargetFolder('KitaplarArsiv/Old.md', 'Kitaplar')).toBe(false);
      expect(isInTargetFolder('Kitaplar_2025/Book.md', 'Kitaplar')).toBe(false);
      expect(isInTargetFolder('Kitaplar-Okunanlar/Book.md', 'Kitaplar')).toBe(false);
      expect(isInTargetFolder('Kitap/Dune.md', 'Kitaplar')).toBe(false);
    });

    it('C5.5: matches all files when targetFolder is root, dot, empty, or whitespace', () => {
      const paths = ['Kitaplar/Dune.md', 'Arsiv/Old.md', 'RootNote.md'];

      for (const p of paths) {
        expect(isInTargetFolder(p, undefined)).toBe(true);
        expect(isInTargetFolder(p, '')).toBe(true);
        expect(isInTargetFolder(p, '   ')).toBe(true);
        expect(isInTargetFolder(p, '/')).toBe(true);
        expect(isInTargetFolder(p, '.')).toBe(true);
      }
    });

    it('C5.6: filters vault scan results strictly to target folder', async () => {
      const mockEnv = createMockObsidianApp();
      mockEnv.vault.createFile('Kitaplar/Inside.md', '', { title: 'Inside' });
      mockEnv.vault.createFile('Gunluk/2026-10-30.md', '', { title: 'Journal' });
      mockEnv.vault.createFile('KitaplarArsiv/Old.md', '', { title: 'Archive' });

      const books = await scanVaultBooks(mockEnv.app, 'Kitaplar');
      expect(books).toHaveLength(1);
      expect(books[0].title).toBe('Inside');
    });
  });

  // =========================================================================
  // SUITE 6: Turkish Diacritics, Series Stripping, and Author Conflict Defense
  // =========================================================================
  describe('C6: Title + Author Normalization & False-Positive Defense', () => {
    it('C6.1: matches Turkish dotted and dotless I correctly', () => {
      expect(normalizeTitleForMatching('İnce Memed')).toBe('ince memed');
      expect(normalizeTitleForMatching('Isparta Gülleri')).toBe('isparta gulleri');
      expect(normalizeTitleForMatching('Şeker Portakalı')).toBe('seker portakali');
      expect(normalizeTitleForMatching('Körlük')).toBe('korluk');
    });

    it('C6.2: strips Goodreads series patterns in parentheses and brackets', () => {
      expect(stripSeriesInfo('Dune (Dune Chronicles, #1)')).toBe('Dune');
      expect(stripSeriesInfo('The Way of Kings (The Stormlight Archive, #1)')).toBe('The Way of Kings');
      expect(stripSeriesInfo('Harry Potter and the Sorcerer\'s Stone (Harry Potter, #1)')).toBe(
        'Harry Potter and the Sorcerer\'s Stone'
      );
      expect(stripSeriesInfo('Sandman [Vol. 1]')).toBe('Sandman');
    });

    it('C6.3: preserves subtitles that are NOT series indicators', () => {
      expect(stripSeriesInfo('Hamlet (Turkish Edition)')).toBe('Hamlet (Turkish Edition)');
      expect(stripSeriesInfo('Körlük (Roman)')).toBe('Körlük (Roman)');
    });

    it('C6.4: strictly rejects duplicate match when titles match but authors conflict', () => {
      const mockEnv = createMockObsidianApp();
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Kitaplar/DonusumOvidius.md', '', {
          baslik: 'Dönüşüm',
          yazar: 'Ovidius',
        }),
        path: 'Kitaplar/DonusumOvidius.md',
        title: 'Dönüşüm',
        author: 'Ovidius',
        frontmatter: { baslik: 'Dönüşüm', yazar: 'Ovidius' },
      };

      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Dönüşüm', author: 'Franz Kafka' },
        metadata: { id: '1', url: '', title: 'Dönüşüm', author: 'Franz Kafka', publisher: 'Can', isbn: '' },
        cleanTitle: 'Dönüşüm',
        readingStatus: 'Okundu',
      };

      const result = detectDuplicates([csvBook], [vaultBook]);
      expect(result.existingBooks).toHaveLength(0);
      expect(result.newBooks).toHaveLength(1);
      expect(result.newBooks[0].cleanTitle).toBe('Dönüşüm');
    });

    it('C6.5: strictly rejects duplicate match when authors share only surname', () => {
      const mockEnv = createMockObsidianApp();
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Kitaplar/DuneFrank.md', '', {
          baslik: 'Dune',
          yazar: 'Frank Herbert',
        }),
        path: 'Kitaplar/DuneFrank.md',
        title: 'Dune',
        author: 'Frank Herbert',
        frontmatter: { baslik: 'Dune', yazar: 'Frank Herbert' },
      };

      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Dune', author: 'Brian Herbert' },
        metadata: { id: '1', url: '', title: 'Dune', author: 'Brian Herbert', publisher: '', isbn: '' },
        cleanTitle: 'Dune',
        readingStatus: 'Okundu',
      };

      const result = detectDuplicates([csvBook], [vaultBook]);
      expect(result.existingBooks).toHaveLength(0);
      expect(result.newBooks).toHaveLength(1);
    });

    it('C6.6: matches author when name order is inverted (First Last vs Last, First)', () => {
      const mockEnv = createMockObsidianApp();
      const vaultBook: ExistingVaultBook = {
        file: mockEnv.vault.createFile('Kitaplar/Dostoyevski.md', '', {
          baslik: 'Karamazov Kardeşler',
          yazar: 'Dostoyevski, Fyodor',
        }),
        path: 'Kitaplar/Dostoyevski.md',
        title: 'Karamazov Kardeşler',
        author: 'Dostoyevski, Fyodor',
        frontmatter: { baslik: 'Karamazov Kardeşler', yazar: 'Dostoyevski, Fyodor' },
      };

      const csvBook: ParsedGoodreadsBook = {
        raw: { title: 'Karamazov Kardeşler', author: 'Fyodor Dostoyevski' },
        metadata: { id: '1', url: '', title: 'Karamazov Kardeşler', author: 'Fyodor Dostoyevski', publisher: '', isbn: '' },
        cleanTitle: 'Karamazov Kardeşler',
        readingStatus: 'Okundu',
      };

      const result = detectDuplicates([csvBook], [vaultBook]);
      expect(result.existingBooks).toHaveLength(1);
      expect(result.existingBooks[0].matchReason).toBe('title-author-normalized');
    });
  });

  // =========================================================================
  // SUITE 7: Large Mock Vault Scale & Performance Stress Testing
  // =========================================================================
  describe('C7: Scale & Performance Stress Testing', () => {
    it('C7.1: scans 1,000 cached vault notes in under 200 milliseconds', async () => {
      const mockEnv = createMockObsidianApp();

      for (let i = 0; i < 1000; i++) {
        mockEnv.vault.createFile(
          `Kitaplar/Book_${i}.md`,
          `# Book ${i}`,
          {
            baslik: `Kitap Başlığı ${i}`,
            yazar: `Yazar Adı ${i % 100}`,
            isbn: `9780000000000`,
          }
        );
      }

      const t0 = performance.now();
      const scanned = await scanVaultBooks(mockEnv.app, 'Kitaplar');
      const durationMs = performance.now() - t0;

      expect(scanned).toHaveLength(1000);
      expect(durationMs).toBeLessThan(200);
    });

    it('C7.2: indexes and detects duplicates across 1,000 CSV books and 1,000 Vault books in under 150ms', () => {
      const mockEnv = createMockObsidianApp();
      const vaultBooks: ExistingVaultBook[] = [];
      const csvBooks: ParsedGoodreadsBook[] = [];

      for (let i = 0; i < 1000; i++) {
        const file = mockEnv.vault.createFile(`Kitaplar/Note_${i}.md`, '', {
          baslik: `Benchmark Book ${i}`,
          yazar: `Author ${i}`,
          isbn: `9780000000${String(i).padStart(3, '0')}`,
        });

        vaultBooks.push({
          file,
          path: file.path,
          title: `Benchmark Book ${i}`,
          author: `Author ${i}`,
          isbn13: `9780000000${String(i).padStart(3, '0')}`,
          frontmatter: { isbn: `9780000000${String(i).padStart(3, '0')}` },
        });

        // 50% duplicates, 50% brand new
        const isDuplicate = i % 2 === 0;
        csvBooks.push({
          raw: {
            title: isDuplicate ? `Benchmark Book ${i}` : `New Book ${i}`,
            author: isDuplicate ? `Author ${i}` : `New Author ${i}`,
            isbn13: isDuplicate ? `9780000000${String(i).padStart(3, '0')}` : `9789999999${String(i).padStart(3, '0')}`,
          },
          metadata: {
            id: String(i),
            url: '',
            title: isDuplicate ? `Benchmark Book ${i}` : `New Book ${i}`,
            author: isDuplicate ? `Author ${i}` : `New Author ${i}`,
            publisher: 'Benchmark Pub',
            isbn: isDuplicate ? `9780000000${String(i).padStart(3, '0')}` : `9789999999${String(i).padStart(3, '0')}`,
          },
          cleanTitle: isDuplicate ? `Benchmark Book ${i}` : `New Book ${i}`,
          readingStatus: 'Okundu',
          isbn13: isDuplicate ? `9780000000${String(i).padStart(3, '0')}` : `9789999999${String(i).padStart(3, '0')}`,
        });
      }

      const t0 = performance.now();
      const result = detectDuplicates(csvBooks, vaultBooks);
      const durationMs = performance.now() - t0;

      expect(result.existingBooks).toHaveLength(500);
      expect(result.newBooks).toHaveLength(500);
      expect(durationMs).toBeLessThan(150);
    });

    it('C7.3: processes 75 uncached notes with bounded batch disk reads', async () => {
      const mockEnv = createMockObsidianApp();

      for (let i = 0; i < 75; i++) {
        mockEnv.vault.createFile(
          `Kitaplar/Uncached_${i}.md`,
          `---\nbaslik: "Uncached Title ${i}"\nyazar: "Author ${i}"\n---\nBody content.`
        );
      }

      const readSpy = vi.spyOn(mockEnv.app.vault, 'read');

      const books = await scanVaultBooks(mockEnv.app, 'Kitaplar');
      expect(books).toHaveLength(75);
      expect(readSpy).toHaveBeenCalledTimes(75);
      expect(books[0].title).toBe('Uncached Title 0');
      expect(books[74].title).toBe('Uncached Title 74');
    });
  });

  // =========================================================================
  // SUITE 8: Invariants and Partitioning Integrity
  // =========================================================================
  describe('C8: Partitioning Invariant and Edge Case Integrity', () => {
    it('C8.1: guarantees newBooks.length + existingBooks.length === csvBooks.length under all scenarios', () => {
      const mockEnv = createMockObsidianApp();
      const vaultBooks: ExistingVaultBook[] = [
        {
          file: mockEnv.vault.createFile('Kitaplar/V1.md', '', { isbn: '9780441172719' }),
          path: 'Kitaplar/V1.md',
          title: 'Dune',
          author: 'Frank Herbert',
          isbn13: '9780441172719',
          frontmatter: { isbn: '9780441172719' },
        },
      ];

      const testScenarios: ParsedGoodreadsBook[][] = [
        [], // Empty
        [
          {
            raw: { title: 'Dune', author: 'Frank Herbert', isbn13: '9780441172719' },
            metadata: { id: '1', url: '', title: 'Dune', author: 'Frank Herbert', publisher: '', isbn: '9780441172719' },
            cleanTitle: 'Dune',
            readingStatus: 'Okundu',
            isbn13: '9780441172719',
          },
        ],
        [
          {
            raw: { title: 'Unknown Book', author: 'Unknown Author' },
            metadata: { id: '2', url: '', title: 'Unknown Book', author: 'Unknown Author', publisher: '', isbn: '' },
            cleanTitle: 'Unknown Book',
            readingStatus: 'Okunacak',
          },
        ],
      ];

      for (const batch of testScenarios) {
        const result = detectDuplicates(batch, vaultBooks);
        expect(result.newBooks.length + result.existingBooks.length).toBe(batch.length);
      }
    });

    it('C8.2: returns empty partitions when csvBooks is empty', () => {
      const result = detectDuplicates([], []);
      expect(result.newBooks).toEqual([]);
      expect(result.existingBooks).toEqual([]);
    });

    it('C8.3: partitions all books as new when vault is empty', () => {
      const csvBooks: ParsedGoodreadsBook[] = [
        {
          raw: { title: 'Book 1', author: 'Author 1' },
          metadata: { id: '1', url: '', title: 'Book 1', author: 'Author 1', publisher: '', isbn: '' },
          cleanTitle: 'Book 1',
          readingStatus: 'Okundu',
        },
      ];
      const result = detectDuplicates(csvBooks, []);
      expect(result.newBooks).toHaveLength(1);
      expect(result.existingBooks).toHaveLength(0);
    });
  });
});
