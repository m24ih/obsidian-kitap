import { describe, it, expect, vi } from 'vitest';
import {
  scanVaultBooks,
  isInTargetFolder,
  extractFrontmatter,
  extractTitleFromFrontmatter,
  extractAuthorFromFrontmatter,
  extractIsbnsFromFrontmatter,
  BookPropertyMapping,
} from '../../src/goodreads/vaultScanner';
import { createMockObsidianApp } from '../e2e/harness/mockVault';
import { PropertyMappingOption } from '../../src/settings/propertyMapping';

describe('Vault Book Scanner (vaultScanner.ts)', () => {
  describe('isInTargetFolder', () => {
    it('matches files directly inside the target folder', () => {
      expect(isInTargetFolder('Kitaplar/Dune.md', 'Kitaplar')).toBe(true);
    });

    it('matches files in nested subfolders of the target folder', () => {
      expect(isInTargetFolder('Kitaplar/BilimKurgu/Dune.md', 'Kitaplar')).toBe(true);
    });

    it('rejects files in unrelated folders', () => {
      expect(isInTargetFolder('Gunluk/2026-10-30.md', 'Kitaplar')).toBe(false);
    });

    it('rejects folders with shared prefix but distinct boundary', () => {
      expect(isInTargetFolder('KitaplarArsiv/Old.md', 'Kitaplar')).toBe(false);
    });

    it('normalizes leading and trailing slashes and backslashes', () => {
      expect(isInTargetFolder('/Kitaplar/Dune.md', '/Kitaplar/')).toBe(true);
      expect(isInTargetFolder('Kitaplar\\Dune.md', 'Kitaplar')).toBe(true);
    });

    it('matches all files when targetFolder is undefined, empty, root, or dot', () => {
      expect(isInTargetFolder('Anywhere/Note.md', undefined)).toBe(true);
      expect(isInTargetFolder('Anywhere/Note.md', '')).toBe(true);
      expect(isInTargetFolder('Anywhere/Note.md', '/')).toBe(true);
      expect(isInTargetFolder('Anywhere/Note.md', '.')).toBe(true);
    });
  });

  describe('extractFrontmatter', () => {
    it('extracts YAML frontmatter from valid markdown', () => {
      const content = '---\nbaslik: "Dune"\nyazar: "Frank Herbert"\nisbn: "9780441172719"\n---\n# Body\n';
      const fm = extractFrontmatter(content);
      expect(fm.baslik).toBe('Dune');
      expect(fm.yazar).toBe('Frank Herbert');
      expect(fm.isbn).toBe('9780441172719');
    });

    it('returns empty object when content has no frontmatter delimiter', () => {
      const content = '# Title without frontmatter\nSome content.';
      expect(extractFrontmatter(content)).toEqual({});
    });

    it('returns empty object when content is empty or malformed', () => {
      expect(extractFrontmatter('')).toEqual({});
      expect(extractFrontmatter('---\n: bad yaml\n---\n')).toEqual({});
    });
  });

  describe('extractTitleFromFrontmatter', () => {
    it('extracts Turkish and English standard keys', () => {
      expect(extractTitleFromFrontmatter({ baslik: 'Dune' }, 'Fallback')).toBe('Dune');
      expect(extractTitleFromFrontmatter({ title: 'Foundation' }, 'Fallback')).toBe('Foundation');
      expect(extractTitleFromFrontmatter({ name: 'Solaris' }, 'Fallback')).toBe('Solaris');
      expect(extractTitleFromFrontmatter({ kitap_adi: 'Körlük' }, 'Fallback')).toBe('Körlük');
    });

    it('unwraps wikilinks and aliases in title', () => {
      expect(extractTitleFromFrontmatter({ baslik: '[[Dune]]' }, 'Fallback')).toBe('Dune');
      expect(extractTitleFromFrontmatter({ baslik: '[[Dune (roman)|Dune]]' }, 'Fallback')).toBe('Dune');
    });

    it('falls back to basename when frontmatter title is missing or empty', () => {
      expect(extractTitleFromFrontmatter({}, 'Dune Basename')).toBe('Dune Basename');
      expect(extractTitleFromFrontmatter({ baslik: '   ' }, 'Dune Basename')).toBe('Dune Basename');
    });

    it('respects user-configured propertyMappings for title', () => {
      const mappings: BookPropertyMapping[] = [
        {
          property: 'baslik',
          newProperty: 'ozel_baslik',
          mapping: PropertyMappingOption.Map,
        },
      ];
      const fm = { ozel_baslik: 'Özel Dune Başlığı', baslik: 'Standart Başlık' };
      expect(extractTitleFromFrontmatter(fm, 'Fallback', mappings)).toBe('Özel Dune Başlığı');
    });
  });

  describe('extractAuthorFromFrontmatter', () => {
    it('extracts single author string and unwraps wikilinks', () => {
      expect(extractAuthorFromFrontmatter({ yazar: 'Frank Herbert' })).toBe('Frank Herbert');
      expect(extractAuthorFromFrontmatter({ author: '[[Frank Herbert]]' })).toBe('Frank Herbert');
      expect(extractAuthorFromFrontmatter({ author: '[[Authors/Frank Herbert|Herbert]]' })).toBe('Herbert');
    });

    it('extracts YAML author lists into comma-separated string', () => {
      const fm = { yazarlar: ['[[Neil Gaiman]]', '[[Terry Pratchett]]'] };
      expect(extractAuthorFromFrontmatter(fm)).toBe('Neil Gaiman, Terry Pratchett');
    });

    it('returns empty string if author is absent', () => {
      expect(extractAuthorFromFrontmatter({})).toBe('');
      expect(extractAuthorFromFrontmatter({ yazar: '   ' })).toBe('');
    });

    it('respects user-configured propertyMappings for author', () => {
      const mappings: BookPropertyMapping[] = [
        {
          property: 'yazar',
          newProperty: 'kitap_yazari',
          mapping: PropertyMappingOption.Map,
        },
      ];
      const fm = { kitap_yazari: 'Isaac Asimov', yazar: 'Frank Herbert' };
      expect(extractAuthorFromFrontmatter(fm, mappings)).toBe('Isaac Asimov');
    });
  });

  describe('extractIsbnsFromFrontmatter', () => {
    it('extracts clean ISBN-13 and computes complementary ISBN-10', () => {
      const result = extractIsbnsFromFrontmatter({ isbn: '978-0-441-17271-9' });
      expect(result.isbn13).toBe('9780441172719');
      expect(result.isbn10).toBe('0441172717');
    });

    it('extracts clean ISBN-10 with check digit X and computes ISBN-13', () => {
      const result = extractIsbnsFromFrontmatter({ isbn: '0-8044-2957-X' });
      expect(result.isbn10).toBe('080442957X');
      expect(result.isbn13).toBe('9780804429573');
    });

    it('handles numeric ISBN values in frontmatter', () => {
      const result = extractIsbnsFromFrontmatter({ isbn: 9780441172719 });
      expect(result.isbn13).toBe('9780441172719');
      expect(result.isbn10).toBe('0441172717');
    });

    it('extracts separate explicit isbn10 and isbn13 properties', () => {
      const result = extractIsbnsFromFrontmatter({
        isbn10: '0441172717',
        isbn13: '9780441172719',
      });
      expect(result.isbn10).toBe('0441172717');
      expect(result.isbn13).toBe('9780441172719');
    });

    it('does not generate invalid ISBN-10 for 979 prefix ISBN-13', () => {
      const result = extractIsbnsFromFrontmatter({ isbn13: '9791090636079' });
      expect(result.isbn13).toBe('9791090636079');
      expect(result.isbn10).toBeUndefined();
    });

    it('ignores invalid or empty ISBNs', () => {
      expect(extractIsbnsFromFrontmatter({ isbn: '12345' })).toEqual({});
      expect(extractIsbnsFromFrontmatter({ isbn: 'N/A' })).toEqual({});
      expect(extractIsbnsFromFrontmatter({})).toEqual({});
    });

    it('respects user-configured propertyMappings for isbn', () => {
      const mappings: BookPropertyMapping[] = [
        {
          property: 'isbn',
          newProperty: 'barkod_no',
          mapping: PropertyMappingOption.Map,
        },
      ];
      const result = extractIsbnsFromFrontmatter({ barkod_no: '9780441172719' }, mappings);
      expect(result.isbn13).toBe('9780441172719');
    });
  });

  describe('scanVaultBooks (End-to-End Vault Scanning)', () => {
    it('scans notes inside target folder using in-memory metadataCache fast-path', async () => {
      const mockEnv = createMockObsidianApp();
      mockEnv.vault.createFile(
        'Kitaplar/Dune.md',
        '# Dune',
        {
          baslik: 'Dune',
          yazar: 'Frank Herbert',
          isbn: '9780441172719',
        }
      );

      const spyRead = vi.spyOn(mockEnv.app.vault, 'read');

      const books = await scanVaultBooks(mockEnv.app, 'Kitaplar');
      expect(books).toHaveLength(1);
      expect(books[0].title).toBe('Dune');
      expect(books[0].author).toBe('Frank Herbert');
      expect(books[0].isbn13).toBe('9780441172719');
      expect(books[0].isbn10).toBe('0441172717');

      // Assert 0 disk reads occurred for cached file
      expect(spyRead).not.toHaveBeenCalled();
    });

    it('falls back to vault.read when metadataCache is unpopulated', async () => {
      const mockEnv = createMockObsidianApp();
      mockEnv.vault.createFile(
        'Kitaplar/Uncached.md',
        '---\nbaslik: "Vakıf"\nyazar: "Isaac Asimov"\nisbn: "9789752100183"\n---\n# Vakıf\n'
      );

      const books = await scanVaultBooks(mockEnv.app, 'Kitaplar');
      expect(books).toHaveLength(1);
      expect(books[0].title).toBe('Vakıf');
      expect(books[0].author).toBe('Isaac Asimov');
      expect(books[0].isbn13).toBe('9789752100183');
    });

    it('gracefully handles unreadable or corrupted files', async () => {
      const mockEnv = createMockObsidianApp();
      mockEnv.vault.createFile(
        'Kitaplar/Corrupt.md',
        '---\n: bad yaml syntax\n---\nCorrupted content.'
      );

      const books = await scanVaultBooks(mockEnv.app, 'Kitaplar');
      expect(books).toHaveLength(1);
      expect(books[0].title).toBe('Corrupt');
      expect(books[0].author).toBe('');
      expect(books[0].frontmatter).toEqual({});
    });

    it('handles empty frontmatter in cached notes without throwing', async () => {
      const mockEnv = createMockObsidianApp();
      mockEnv.vault.createFile('Kitaplar/EmptyFm.md', '# Just content', {});

      const books = await scanVaultBooks(mockEnv.app, 'Kitaplar');
      expect(books).toHaveLength(1);
      expect(books[0].title).toBe('EmptyFm');
    });

    it('scans whole vault when targetFolder is omitted or undefined', async () => {
      const mockEnv = createMockObsidianApp();
      mockEnv.vault.createFile('Kitaplar/Book1.md', '', { title: 'Book 1' });
      mockEnv.vault.createFile('Diger/Book2.md', '', { title: 'Book 2' });

      const books = await scanVaultBooks(mockEnv.app);
      expect(books).toHaveLength(2);
    });

    it('handles empty vault gracefully', async () => {
      const mockEnv = createMockObsidianApp();
      const books = await scanVaultBooks(mockEnv.app, 'Kitaplar');
      expect(books).toEqual([]);
    });

    it('scales to hundreds of cached files without performance bottlenecks', async () => {
      const mockEnv = createMockObsidianApp();
      for (let i = 0; i < 200; i++) {
        mockEnv.vault.createFile(
          `Kitaplar/Book_${i}.md`,
          `# Book ${i}`,
          {
            baslik: `Book ${i}`,
            yazar: `Author ${i}`,
            isbn: '9780441172719',
          }
        );
      }

      const start = performance.now();
      const books = await scanVaultBooks(mockEnv.app, 'Kitaplar');
      const duration = performance.now() - start;

      expect(books).toHaveLength(200);
      expect(duration).toBeLessThan(100); // Executed in under 100ms
    });

    it('processes uncached files in bounded batches', async () => {
      const mockEnv = createMockObsidianApp();
      for (let i = 0; i < 35; i++) {
        mockEnv.vault.createFile(
          `Kitaplar/Batch_${i}.md`,
          `---\nbaslik: "Batch Book ${i}"\n---\n`
        );
      }

      const books = await scanVaultBooks(mockEnv.app, 'Kitaplar');
      expect(books).toHaveLength(35);
      expect(books[0].title).toBe('Batch Book 0');
      expect(books[34].title).toBe('Batch Book 34');
    });
  });
});
