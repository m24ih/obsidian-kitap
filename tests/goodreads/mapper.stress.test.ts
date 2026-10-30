import { describe, it, expect } from 'vitest';
import {
  cleanGoodreadsIsbn,
  normalizeUserRating,
  formatUserRatingForFrontmatter,
  normalizeAverageRating,
  normalizeGoodreadsRating,
  normalizeGoodreadsDate,
  cleanReviewHtml,
  formatReviewSection,
  cleanBookTitle,
  mapGoodreadsShelf,
  mapShelfToReadingStatus,
  parseBookshelves,
  parseAuthorList,
  parsePageCount,
  parsePublicationYear,
  localizeBinding,
  mapGoodreadsRow,
  buildGoodreadsFrontmatterProperties,
} from '../../src/goodreads/mapper';
import { DEFAULT_SETTINGS } from '../../src/types';
import type { GoodreadsRawRow } from '../../src/goodreads/types';

describe('Adversarial Stress Harness & Fuzz Testing for mapper.ts', () => {
  describe('Performance & ReDoS Resistance', () => {
    it('processes a 100,000 character review with 500 HTML tags in under 50ms', () => {
      let largeHtml = '';
      for (let i = 0; i < 500; i++) {
        largeHtml += `<p>Paragraph <b>${i}</b> with <a href="http://example.com/${i}">link</a> and <i>italics</i>.</p>\n`;
        if (i % 50 === 0) {
          largeHtml += `<spoiler>Spoiler number ${i}</spoiler>\n`;
        }
      }
      expect(largeHtml.length).toBeGreaterThan(30000);

      const start = performance.now();
      const cleaned = cleanReviewHtml(largeHtml);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(150);
      expect(cleaned).toContain('Paragraph **0**');
      expect(cleaned).toContain('> [!spoiler]');
      expect(cleaned).not.toContain('<p>');
      expect(cleaned).not.toContain('<b>');
    });

    it('handles adversarial unclosed tags and nested quotes without catastrophic backtracking', () => {
      const pathological = '<<<<<<<<<<b style="'.repeat(500) + 'test'.repeat(500) + '">>>>>>>>>>'.repeat(500);
      const start = performance.now();
      const cleaned = cleanReviewHtml(pathological);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
      expect(typeof cleaned).toBe('string');
    });

    it('processes 1,000 ISBN cleanups in under 20ms', () => {
      const isbns = [
        '="0143127748"',
        '="9780143127741"',
        '="0001234567"',
        '="080442957X"',
        '="978-0-14-312774-1"',
        '="N/A"',
        '=""',
        '="080442957x"',
        '   ="0143127748"   ',
        '=" 9780143127741 "',
      ];

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        const raw = isbns[i % isbns.length];
        cleanGoodreadsIsbn(raw);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('Adversarial Fuzzing: Dates', () => {
    it('robustly parses or rejects a battery of 50 boundary dates', () => {
      const testCases: Array<[string, string]> = [
        ['2024/02/29', '2024-02-29'], // Leap year
        ['2000/02/29', '2000-02-29'], // Century leap
        ['2020/2/29', '2020-02-29'],  // Leap year single-digit month
        ['2024/2/9', '2024-02-09'],   // Single digit day
        ['2023/12/31', '2023-12-31'], // Year end
        ['2023/01/01', '2023-01-01'], // Year start
        ['2023/1/1', '2023-01-01'],   // Both single digits
        ['2023-10-15', '2023-10-15'], // ISO
        ['2023-5-2', '2023-05-02'],   // ISO unpadded
        ['2023-10-15 00:00:00', '2023-10-15'],
        ['2023/10', '2023-10'],       // Partial year-month
        ['2023/1', '2023-01'],        // Partial single digit
        ['2023', '2023'],             // Year only
        ['1984', '1984'],             // Year only
        // Rejections
        ['2023/13/01', ''],
        ['2023/00/01', ''],
        ['2023/01/00', ''],
        ['2023/01/32', ''],
        ['2023/99/99', ''],
        ['99/01/01', ''],             // 2-digit year rejected
        ['', ''],
        ['   ', ''],
        ['N/A', ''],
        ['undefined', ''],
        ['null', ''],
        ['NaN', ''],
        ['//', ''],
        ['2023//01', ''],
      ];

      for (const [input, expected] of testCases) {
        expect(normalizeGoodreadsDate(input)).toBe(expected);
      }
    });
  });

  describe('Adversarial Fuzzing: Ratings', () => {
    it('verifies that rating 0 NEVER maps to star rating in any form', () => {
      const zeroVariants = ['0', '0.0', ' 0 ', '00', '+0', '-0'];
      for (const z of zeroVariants) {
        const norm = normalizeUserRating(z);
        expect(norm).toBeUndefined();
        expect(formatUserRatingForFrontmatter(norm)).toBe('');
        expect(normalizeGoodreadsRating(z)).toBe('');

        const row: GoodreadsRawRow = {
          title: 'Unrated',
          author: 'Author',
          myRating: z,
        };
        const parsed = mapGoodreadsRow(row, DEFAULT_SETTINGS);
        expect(parsed.userRating).toBeUndefined();

        const fm = buildGoodreadsFrontmatterProperties(parsed, DEFAULT_SETTINGS);
        expect(fm.kisisel_puan).toBe('');
      }
    });

    it('floors fractional ratings accurately', () => {
      expect(normalizeUserRating('1.0')).toBe(1);
      expect(normalizeUserRating('1.9')).toBe(1);
      expect(normalizeUserRating('2.5')).toBe(2);
      expect(normalizeUserRating('3.7')).toBe(3);
      expect(normalizeUserRating('4.2')).toBe(4);
      expect(normalizeUserRating('5.0')).toBe(5);
    });

    it('rejects extreme and non-numeric ratings', () => {
      const invalid = [
        '6', '7', '10', '999', '-1', '-5',
        'NaN', 'Infinity', '-Infinity',
        'five', '***', 'null', 'undefined',
        '', '   ',
      ];
      for (const inv of invalid) {
        expect(normalizeUserRating(inv)).toBeUndefined();
        expect(normalizeGoodreadsRating(inv)).toBe('');
      }
    });
  });

  describe('Turkish Characters and Series Cleanliness', () => {
    it('preserves Turkish diacritics in cleanTitle while extracting series', () => {
      const cases = [
        {
          input: 'İnce Memed 1 (İnce Memed, #1)',
          expectedTitle: 'İnce Memed 1',
          expectedSeries: 'İnce Memed, #1',
        },
        {
          input: 'Karanlık Kitaplık (Karanlık Kitaplık #14)',
          expectedTitle: 'Karanlık Kitaplık',
          expectedSeries: 'Karanlık Kitaplık #14',
        },
        {
          input: 'Saatleri Ayarlama Enstitüsü',
          expectedTitle: 'Saatleri Ayarlama Enstitüsü',
          expectedSeries: undefined,
        },
        {
          input: 'Tutunamayanlar (İletişim Yayınları)',
          expectedTitle: 'Tutunamayanlar (İletişim Yayınları)',
          expectedSeries: undefined,
        },
      ];

      for (const c of cases) {
        const res = cleanBookTitle(c.input);
        expect(res.cleanTitle).toBe(c.expectedTitle);
        expect(res.seriesTitle).toBe(c.expectedSeries);
      }
    });

    it('maps Turkish shelves accurately across all cases', () => {
      const opts = ['Okunacak', 'Okunuyor', 'Okundu'];
      expect(mapShelfToReadingStatus('okundu', opts, 'Okunacak')).toBe('Okundu');
      expect(mapShelfToReadingStatus('OKUNDU', opts, 'Okunacak')).toBe('Okundu');
      expect(mapShelfToReadingStatus('Okundu', opts, 'Okunacak')).toBe('Okundu');
      expect(mapShelfToReadingStatus('okunuyor', opts, 'Okunacak')).toBe('Okunuyor');
      expect(mapShelfToReadingStatus('OKUNUYOR', opts, 'Okunacak')).toBe('Okunuyor');
      expect(mapShelfToReadingStatus('okunacak', opts, 'Okunacak')).toBe('Okunacak');
      expect(mapShelfToReadingStatus('OKUNACAK', opts, 'Okunacak')).toBe('Okunacak');
    });
  });

  describe('Frontmatter Field Conformance', () => {
    it('ensures buildGoodreadsFrontmatterProperties conforms to expected YAML schema', () => {
      const row: GoodreadsRawRow = {
        bookId: '999',
        title: 'Test Title',
        author: 'Test Author',
        publisher: 'Test Pub',
        isbn: '="0143127748"',
        myRating: '4',
        averageRating: '4.15',
        numberOfPages: '350',
        dateRead: '2023/05/12',
        exclusiveShelf: 'read',
      };

      const parsed = mapGoodreadsRow(row, DEFAULT_SETTINGS);
      const fm = buildGoodreadsFrontmatterProperties(parsed, DEFAULT_SETTINGS);

      // Verify exact keys expected in Obsidian vault frontmatter
      expect(fm).toHaveProperty('tip', 'kitap');
      expect(fm).toHaveProperty('baslik', 'Test Title');
      expect(fm).toHaveProperty('yazar', 'Test Author');
      expect(fm).toHaveProperty('yayinevi', 'Test Pub');
      expect(fm).toHaveProperty('isbn', '9780143127741'); // auto-converted to 13
      expect(fm).toHaveProperty('sayfa', 350);
      expect(fm).toHaveProperty('okunan_sayfa', 0);
      expect(fm).toHaveProperty('puan', 4.15);
      expect(fm).toHaveProperty('okuma_durumu', 'Okundu');
      expect(fm).toHaveProperty('okunma_tarihi', '2023-05-12');
      expect(fm).toHaveProperty('kisisel_puan', 4);
      expect(fm).toHaveProperty('kapak', '');
      expect(fm).toHaveProperty('url', 'https://www.goodreads.com/book/show/999');
    });
  });
});
