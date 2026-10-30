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
  getField,
  unescapeExcelFormula,
} from '../../src/goodreads/mapper';
import { DEFAULT_SETTINGS } from '../../src/types';
import type { GoodreadsRawRow } from '../../src/goodreads/types';

describe('Adversarial Empirical Challenge — Goodreads Mapper (mapper.ts)', () => {
  describe('1. Excel ISBN Unescaping & Leading Zeros & Conversions', () => {
    it('preserves single and multiple leading zeros in Excel formulas', () => {
      expect(cleanGoodreadsIsbn('="0143127748"')).toBe('0143127748');
      expect(cleanGoodreadsIsbn('="0014312774"')).toBe('0014312774');
      expect(cleanGoodreadsIsbn('="0000000001"')).toBe('0000000001');
      expect(cleanGoodreadsIsbn("='0143127748'")).toBe('0143127748');
      expect(cleanGoodreadsIsbn("='0014312774'")).toBe('0014312774');
    });

    it('handles formula with nested or mismatched quotes and spaces', () => {
      expect(cleanGoodreadsIsbn('=" 0143127748 "')).toBe('0143127748');
      expect(cleanGoodreadsIsbn(' = "0143127748" ')).toBe('0143127748');
      expect(cleanGoodreadsIsbn('="0143127748')).toBe('0143127748');
      expect(cleanGoodreadsIsbn('0143127748"')).toBe('0143127748');
      expect(cleanGoodreadsIsbn('"""0143127748"""')).toBe('0143127748');
      expect(cleanGoodreadsIsbn('"=""0143127748"""')).toBe('0143127748');
    });

    it('handles empty, null, whitespace, and symbol-only formulas', () => {
      expect(cleanGoodreadsIsbn('=""')).toBe('');
      expect(cleanGoodreadsIsbn('=" "')).toBe('');
      expect(cleanGoodreadsIsbn('=')).toBe('');
      expect(cleanGoodreadsIsbn('=""')).toBe('');
      expect(cleanGoodreadsIsbn('')).toBe('');
      expect(cleanGoodreadsIsbn('   ')).toBe('');
      expect(cleanGoodreadsIsbn(null)).toBe('');
      expect(cleanGoodreadsIsbn(undefined)).toBe('');
      expect(cleanGoodreadsIsbn('="N/A"')).toBe('');
      expect(cleanGoodreadsIsbn('="---"')).toBe('');
      expect(cleanGoodreadsIsbn('unknown')).toBe('');
    });

    it('preserves and normalizes ISBN-10 check digit X to uppercase', () => {
      expect(cleanGoodreadsIsbn('="080442957X"')).toBe('080442957X');
      expect(cleanGoodreadsIsbn('="080442957x"')).toBe('080442957X');
      expect(cleanGoodreadsIsbn('080442957x')).toBe('080442957X');
      expect(cleanGoodreadsIsbn('="99921-58-10-7"')).toBe('9992158107');
    });

    it('correctly calculates alternate ISBN-13 from ISBN-10 in mapGoodreadsRow', () => {
      const row: GoodreadsRawRow = {
        title: 'Dune',
        author: 'Frank Herbert',
        isbn: '="0441172717"',
        isbn13: '',
      };
      const parsed = mapGoodreadsRow(row, DEFAULT_SETTINGS);
      expect(parsed.isbn10).toBe('0441172717');
      expect(parsed.isbn13).toBe('9780441172719');
      expect(parsed.metadata.isbn).toBe('9780441172719');
    });

    it('correctly calculates alternate ISBN-10 from ISBN-13 in mapGoodreadsRow', () => {
      const row: GoodreadsRawRow = {
        title: 'Dune',
        author: 'Frank Herbert',
        isbn: '',
        isbn13: '="9780441172719"',
      };
      const parsed = mapGoodreadsRow(row, DEFAULT_SETTINGS);
      expect(parsed.isbn13).toBe('9780441172719');
      expect(parsed.isbn10).toBe('0441172717');
      expect(parsed.metadata.isbn).toBe('9780441172719');
    });

    it('correctly converts ISBN-13 to ISBN-10 with check digit X', () => {
      // 978-0-8044-2957-3 corresponds to ISBN-10 080442957X
      const row: GoodreadsRawRow = {
        title: 'Test',
        author: 'Author',
        isbn: '',
        isbn13: '="9780804429573"',
      };
      const parsed = mapGoodreadsRow(row, DEFAULT_SETTINGS);
      expect(parsed.isbn13).toBe('9780804429573');
      expect(parsed.isbn10).toBe('080442957X');
    });

    it('handles 979-prefix ISBN-13 without fabricating invalid ISBN-10', () => {
      const row: GoodreadsRawRow = {
        title: 'French Book',
        author: 'Author',
        isbn: '',
        isbn13: '="9791090636071"',
      };
      const parsed = mapGoodreadsRow(row, DEFAULT_SETTINGS);
      expect(parsed.isbn13).toBe('9791090636071');
      expect(parsed.isbn10).toBeUndefined();
      expect(parsed.metadata.isbn).toBe('9791090636071');
    });

    it('handles inverted/swapped ISBN columns (ISBN-13 in isbn col, ISBN-10 in isbn13 col)', () => {
      const row: GoodreadsRawRow = {
        title: 'Swapped ISBNs',
        author: 'Author',
        isbn: '="9780441172719"',
        isbn13: '="0441172717"',
      };
      const parsed = mapGoodreadsRow(row, DEFAULT_SETTINGS);
      expect(parsed.isbn10).toBe('0441172717');
      expect(parsed.isbn13).toBe('9780441172719');
      expect(parsed.metadata.isbn).toBe('9780441172719');
    });

    it('handles completely missing ISBNs gracefully', () => {
      const row: GoodreadsRawRow = {
        title: 'No ISBN Book',
        author: 'Author',
        isbn: '',
        isbn13: '',
      };
      const parsed = mapGoodreadsRow(row, DEFAULT_SETTINGS);
      expect(parsed.isbn10).toBeUndefined();
      expect(parsed.isbn13).toBeUndefined();
      expect(parsed.metadata.isbn).toBe('');
    });
  });

  describe('2. Date Normalization', () => {
    it('normalizes standard Goodreads YYYY/MM/DD dates', () => {
      expect(normalizeGoodreadsDate('2023/10/30')).toBe('2023-10-30');
      expect(normalizeGoodreadsDate('1999/12/31')).toBe('1999-12-31');
      expect(normalizeGoodreadsDate('2001/01/01')).toBe('2001-01-01');
    });

    it('pads single-digit month and day', () => {
      expect(normalizeGoodreadsDate('2023/1/5')).toBe('2023-01-05');
      expect(normalizeGoodreadsDate('2023/01/5')).toBe('2023-01-05');
      expect(normalizeGoodreadsDate('2023/1/05')).toBe('2023-01-05');
      expect(normalizeGoodreadsDate('2023/12/9')).toBe('2023-12-09');
    });

    it('handles leap year dates accurately', () => {
      // 2024 is a leap year
      expect(normalizeGoodreadsDate('2024/02/29')).toBe('2024-02-29');
      expect(normalizeGoodreadsDate('2024/2/29')).toBe('2024-02-29');
      // 2000 was a century leap year
      expect(normalizeGoodreadsDate('2000/02/29')).toBe('2000-02-29');
      // 2020 leap year
      expect(normalizeGoodreadsDate('2020/02/29')).toBe('2020-02-29');
    });

    it('rejects out of range months or days', () => {
      expect(normalizeGoodreadsDate('2023/00/15')).toBe('');
      expect(normalizeGoodreadsDate('2023/13/15')).toBe('');
      expect(normalizeGoodreadsDate('2023/05/00')).toBe('');
      expect(normalizeGoodreadsDate('2023/05/32')).toBe('');
      expect(normalizeGoodreadsDate('2023/99/99')).toBe('');
    });

    it('handles partial dates (year/month and year-only)', () => {
      expect(normalizeGoodreadsDate('2023/4')).toBe('2023-04');
      expect(normalizeGoodreadsDate('2023/11')).toBe('2023-11');
      expect(normalizeGoodreadsDate('2023/04/')).toBe('2023-04');
      expect(normalizeGoodreadsDate('2023')).toBe('2023');
      expect(normalizeGoodreadsDate('2023//')).toBe('2023');
      expect(normalizeGoodreadsDate('1984')).toBe('1984');
    });

    it('handles already-ISO dates and timestamps', () => {
      expect(normalizeGoodreadsDate('2023-05-20')).toBe('2023-05-20');
      expect(normalizeGoodreadsDate('2023-5-4')).toBe('2023-05-04');
      expect(normalizeGoodreadsDate('2023-05-20 18:45:00')).toBe('2023-05-20');
      expect(normalizeGoodreadsDate('2023-05-20T18:45:00.000Z')).toBe('2023-05-20');
    });

    it('returns empty string for empty, whitespace, null, undefined, or garbage inputs', () => {
      expect(normalizeGoodreadsDate('')).toBe('');
      expect(normalizeGoodreadsDate('   ')).toBe('');
      expect(normalizeGoodreadsDate(null)).toBe('');
      expect(normalizeGoodreadsDate(undefined)).toBe('');
      expect(normalizeGoodreadsDate('invalid-date')).toBe('');
      expect(normalizeGoodreadsDate('N/A')).toBe('');
      expect(normalizeGoodreadsDate('Not a date')).toBe('');
    });
  });

  describe('3. Rating Normalization', () => {
    it('CRITICAL: 0 rating MUST map to undefined (never 0 stars) and empty frontmatter string', () => {
      expect(normalizeUserRating('0')).toBeUndefined();
      expect(normalizeUserRating(0 as unknown as string)).toBeUndefined();
      expect(normalizeUserRating(' 0 ')).toBeUndefined();
      expect(formatUserRatingForFrontmatter(normalizeUserRating('0'))).toBe('');
      expect(normalizeGoodreadsRating('0')).toBe('');

      const parsed = mapGoodreadsRow(
        { title: 'T', author: 'A', myRating: '0' },
        DEFAULT_SETTINGS
      );
      expect(parsed.userRating).toBeUndefined();

      const fm = buildGoodreadsFrontmatterProperties(parsed, DEFAULT_SETTINGS);
      expect(fm.kisisel_puan).toBe('');
    });

    it('maps valid integer ratings 1 through 5', () => {
      for (let r = 1; r <= 5; r++) {
        expect(normalizeUserRating(String(r))).toBe(r);
        expect(formatUserRatingForFrontmatter(r)).toBe(r);
        expect(normalizeGoodreadsRating(String(r))).toBe(r);

        const parsed = mapGoodreadsRow(
          { title: 'T', author: 'A', myRating: String(r) },
          DEFAULT_SETTINGS
        );
        expect(parsed.userRating).toBe(r);

        const fm = buildGoodreadsFrontmatterProperties(parsed, DEFAULT_SETTINGS);
        expect(fm.kisisel_puan).toBe(r);
      }
    });

    it('handles fractional ratings by flooring to integer', () => {
      expect(normalizeUserRating('4.5')).toBe(4);
      expect(normalizeUserRating('4.9')).toBe(4);
      expect(normalizeUserRating('4.0')).toBe(4);
      expect(normalizeUserRating('0.9')).toBeUndefined(); // floors to 0 -> < 1 -> undefined
      expect(normalizeUserRating('5.2')).toBe(5);
    });

    it('rejects out-of-range, negative, non-numeric ratings', () => {
      expect(normalizeUserRating('6')).toBeUndefined();
      expect(normalizeUserRating('-1')).toBeUndefined();
      expect(normalizeUserRating('100')).toBeUndefined();
      expect(normalizeUserRating('five')).toBeUndefined();
      expect(normalizeUserRating('')).toBeUndefined();
      expect(normalizeUserRating('   ')).toBeUndefined();
      expect(normalizeUserRating(null)).toBeUndefined();
      expect(normalizeUserRating(undefined)).toBeUndefined();
    });

    it('normalizes community average rating with rounding to 2 decimal places', () => {
      expect(normalizeAverageRating('4.25')).toBe(4.25);
      expect(normalizeAverageRating('4.23456')).toBe(4.23);
      expect(normalizeAverageRating('4.235')).toBe(4.24);
      expect(normalizeAverageRating('5.00')).toBe(5);
      expect(normalizeAverageRating('4.0')).toBe(4);
      expect(normalizeAverageRating('0.00')).toBeUndefined();
      expect(normalizeAverageRating('0')).toBeUndefined();
      expect(normalizeAverageRating('-3.5')).toBeUndefined();
      expect(normalizeAverageRating('5.5')).toBeUndefined();
      expect(normalizeAverageRating('')).toBeUndefined();
      expect(normalizeAverageRating(null)).toBeUndefined();
    });
  });

  describe('4. Shelf Normalization & Case Insensitivity', () => {
    const defaultOptions = ['Okunacak', 'Okunuyor', 'Okundu'];

    it('maps canonical exclusive shelves to Turkish status accurately', () => {
      expect(mapGoodreadsShelf('read', defaultOptions, 'Okunacak').status).toBe('Okundu');
      expect(mapGoodreadsShelf('currently-reading', defaultOptions, 'Okunacak').status).toBe('Okunuyor');
      expect(mapGoodreadsShelf('to-read', defaultOptions, 'Okunacak').status).toBe('Okunacak');

      expect(mapShelfToReadingStatus('read', defaultOptions, 'Okunacak')).toBe('Okundu');
      expect(mapShelfToReadingStatus('currently-reading', defaultOptions, 'Okunacak')).toBe('Okunuyor');
      expect(mapShelfToReadingStatus('to-read', defaultOptions, 'Okunacak')).toBe('Okunacak');
    });

    it('handles case-insensitivity and punctuation variations', () => {
      expect(mapGoodreadsShelf('READ', defaultOptions, 'Okunacak').status).toBe('Okundu');
      expect(mapGoodreadsShelf('Read', defaultOptions, 'Okunacak').status).toBe('Okundu');
      expect(mapGoodreadsShelf('CURRENTLY-READING', defaultOptions, 'Okunacak').status).toBe('Okunuyor');
      expect(mapGoodreadsShelf('currentlyreading', defaultOptions, 'Okunacak').status).toBe('Okunuyor');
      expect(mapGoodreadsShelf('Currently-Reading', defaultOptions, 'Okunacak').status).toBe('Okunuyor');
      expect(mapGoodreadsShelf('TO-READ', defaultOptions, 'Okunacak').status).toBe('Okunacak');
      expect(mapGoodreadsShelf('toread', defaultOptions, 'Okunacak').status).toBe('Okunacak');
      expect(mapGoodreadsShelf('To-Read', defaultOptions, 'Okunacak').status).toBe('Okunacak');
    });

    it('handles Turkish status synonyms (okundu, okunuyor, okunacak, bitti, sirada)', () => {
      expect(mapGoodreadsShelf('okundu', defaultOptions, 'Okunacak').status).toBe('Okundu');
      expect(mapGoodreadsShelf('OKUNDU', defaultOptions, 'Okunacak').status).toBe('Okundu');
      expect(mapGoodreadsShelf('okunuyor', defaultOptions, 'Okunacak').status).toBe('Okunuyor');
      expect(mapGoodreadsShelf('okunacak', defaultOptions, 'Okunacak').status).toBe('Okunacak');
      expect(mapGoodreadsShelf('bitti', defaultOptions, 'Okunacak').status).toBe('Okundu');
      expect(mapGoodreadsShelf('sirada', defaultOptions, 'Okunacak').status).toBe('Okunacak');
    });

    it('maps to custom configured options (e.g. English TBR / Reading / Finished)', () => {
      const customOptions = ['TBR', 'Reading', 'Finished'];
      expect(mapGoodreadsShelf('read', customOptions, 'TBR').status).toBe('Finished');
      expect(mapGoodreadsShelf('currently-reading', customOptions, 'TBR').status).toBe('Reading');
      expect(mapGoodreadsShelf('to-read', customOptions, 'TBR').status).toBe('TBR');
    });

    it('identifies custom shelf, falls back to defaultStatus, and marks isCustomShelf', () => {
      const res = mapGoodreadsShelf('dnf', defaultOptions, 'Okunacak');
      expect(res.status).toBe('Okunacak');
      expect(res.isCustomShelf).toBe(true);
      expect(res.customShelfName).toBe('dnf');

      const res2 = mapGoodreadsShelf('favorites', defaultOptions, 'Okunacak');
      expect(res2.status).toBe('Okunacak');
      expect(res2.isCustomShelf).toBe(true);
      expect(res2.customShelfName).toBe('favorites');
    });

    it('appends custom shelf to genres array in mapGoodreadsRow', () => {
      const row: GoodreadsRawRow = {
        title: 'Abandoned Book',
        author: 'Author',
        exclusiveShelf: 'dnf',
        bookshelves: 'sci-fi, thriller',
      };
      const parsed = mapGoodreadsRow(row, DEFAULT_SETTINGS);
      expect(parsed.readingStatus).toBe('Okunacak');
      expect(parsed.metadata.genres).toEqual(['sci-fi', 'thriller', 'dnf']);
    });

    it('filters out canonical exclusive shelves (read, to-read, currently-reading) from bookshelves', () => {
      const genres = parseBookshelves('favorites, to-read, classic, read, currently-reading');
      expect(genres).toEqual(['favorites', 'classic']);
    });

    it('handles empty, undefined, or whitespace shelf inputs', () => {
      expect(mapGoodreadsShelf('', defaultOptions, 'Okunacak').status).toBe('Okunacak');
      expect(mapGoodreadsShelf('   ', defaultOptions, 'Okunacak').status).toBe('Okunacak');
      expect(mapGoodreadsShelf(undefined, defaultOptions, 'Okunacak').status).toBe('Okunacak');
    });
  });

  describe('5. HTML Review Cleanup & Security Sanitization', () => {
    it('converts <spoiler> blocks into Obsidian callouts (> [!spoiler])', () => {
      const review = 'Beginning.<spoiler>The hero dies at the end.</spoiler>Ending.';
      const cleaned = cleanReviewHtml(review);
      expect(cleaned).toContain('> [!spoiler]');
      expect(cleaned).toContain('> The hero dies at the end.');
    });

    it('handles multiline spoiler blocks with line breaks', () => {
      const review = '<spoiler>Point 1<br/>Point 2<br><br>Point 3</spoiler>';
      const cleaned = cleanReviewHtml(review);
      expect(cleaned).toBe('> [!spoiler]\n> Point 1\n> Point 2\n> \n> Point 3');
    });

    it('handles multiple spoiler tags in the same review', () => {
      const review = 'Intro.<spoiler>First secret</spoiler>Middle.<spoiler>Second secret</spoiler>Outro.';
      const cleaned = cleanReviewHtml(review);
      expect(cleaned).toContain('> [!spoiler]\n> First secret');
      expect(cleaned).toContain('> [!spoiler]\n> Second secret');
    });

    it('converts bold, italic, and strikethrough tags', () => {
      expect(cleanReviewHtml('<b>bold text</b>')).toBe('**bold text**');
      expect(cleanReviewHtml('<strong>strong text</strong>')).toBe('**strong text**');
      expect(cleanReviewHtml('<i>italic text</i>')).toBe('*italic text*');
      expect(cleanReviewHtml('<em>emphasized text</em>')).toBe('*emphasized text*');
      expect(cleanReviewHtml('<s>strike</s>')).toBe('~~strike~~');
      expect(cleanReviewHtml('<del>delete</del>')).toBe('~~delete~~');
      expect(cleanReviewHtml('<strike>strike</strike>')).toBe('~~strike~~');
      expect(cleanReviewHtml('<code>console.log()</code>')).toBe('`console.log()`');
    });

    it('converts paragraph and break tags into clean markdown newlines', () => {
      expect(cleanReviewHtml('P1<p>P2</p>P3')).toBe('P1\n\nP2\n\nP3');
      expect(cleanReviewHtml('Line 1<br/>Line 2<br><br />Line 3')).toBe('Line 1\nLine 2\n\nLine 3');
    });

    it('converts links and sanitizes javascript: protocol', () => {
      expect(cleanReviewHtml('<a href="https://example.com">Website</a>')).toBe(
        '[Website](https://example.com)'
      );
      expect(cleanReviewHtml('<a href="javascript:alert(1)">Evil Link</a>')).toBe('Evil Link');
    });

    it('converts blockquotes to markdown blockquotes', () => {
      expect(cleanReviewHtml('<blockquote>A witty quote</blockquote>')).toBe(
        '> A witty quote'
      );
    });

    it('strips unsafe script, iframe, style, object, embed tags', () => {
      const unsafe =
        'Good review.<script>evil()</script><iframe src="evil.com"></iframe><style>body{display:none;}</style>';
      const cleaned = cleanReviewHtml(unsafe);
      expect(cleaned).toBe('Good review.');
      expect(cleaned).not.toContain('<script>');
      expect(cleaned).not.toContain('<iframe>');
      expect(cleaned).not.toContain('<style>');
    });

    it('decodes standard HTML entities', () => {
      expect(cleanReviewHtml('Romeo &amp; Juliet')).toBe('Romeo & Juliet');
      expect(cleanReviewHtml('&quot;Hello World&quot;')).toBe('"Hello World"');
      expect(cleanReviewHtml('It&#39;s complicated')).toBe("It's complicated");
      expect(cleanReviewHtml('It&apos;s complicated')).toBe("It's complicated");
      expect(cleanReviewHtml('3 &lt; 5 &amp;&amp; 5 &gt; 3')).toBe('3 < 5 && 5 > 3');
      expect(cleanReviewHtml('&mdash;&ndash;&hellip;')).toBe('—–…');
      expect(cleanReviewHtml('&#65;&#66;&#67;')).toBe('ABC');
      expect(cleanReviewHtml('&#x44;&#x45;&#x46;')).toBe('DEF');
    });

    it('formats review section with spoiler row indicator', () => {
      const review = 'Overall a decent read.';
      expect(formatReviewSection(review, false)).toBe(
        '\n\n## 📝 Kişisel İnceleme\n\nOverall a decent read.\n'
      );
      expect(formatReviewSection(review, true)).toBe(
        '\n\n## 📝 Kişisel İnceleme\n\n> [!warning] Spoiler İçerir\n> Overall a decent read.\n'
      );
      expect(formatReviewSection('', false)).toBe('');
      expect(formatReviewSection(undefined, true)).toBe('');
    });
  });

  describe('6. Title, Series & Author Parsing', () => {
    it('extracts series title with comma and # volume number', () => {
      const res = cleanBookTitle('Dune (Dune Chronicles, #1)');
      expect(res.cleanTitle).toBe('Dune');
      expect(res.seriesTitle).toBe('Dune Chronicles, #1');
    });

    it('extracts series title without comma (# volume number)', () => {
      const res = cleanBookTitle('Foundation (Foundation #1)');
      expect(res.cleanTitle).toBe('Foundation');
      expect(res.seriesTitle).toBe('Foundation #1');
    });

    it('extracts decimal volume numbers (#2.5)', () => {
      const res = cleanBookTitle('Edgedancer (The Stormlight Archive, #2.5)');
      expect(res.cleanTitle).toBe('Edgedancer');
      expect(res.seriesTitle).toBe('The Stormlight Archive, #2.5');
    });

    it('preserves parenthetical subtitles that are not series volumes', () => {
      const res = cleanBookTitle('Thinking, Fast and Slow (General Edition)');
      expect(res.cleanTitle).toBe('Thinking, Fast and Slow (General Edition)');
      expect(res.seriesTitle).toBeUndefined();
    });

    it('protects generational suffixes (Jr., III) when splitting author lists', () => {
      const res = parseAuthorList('Kurt Vonnegut, Jr.', undefined, 'Terry Pratchett');
      expect(res.primaryAuthor).toBe('Kurt Vonnegut, Jr.');
      expect(res.combinedAuthor).toBe('Kurt Vonnegut, Jr., Terry Pratchett');
    });

    it('reverses Author l-f format when primary author is missing', () => {
      const res = parseAuthorList('', 'Herbert, Frank', '');
      expect(res.primaryAuthor).toBe('Frank Herbert');
      expect(res.combinedAuthor).toBe('Frank Herbert');
    });

    it('falls back to Bilinmeyen Yazar when author is completely empty', () => {
      const res = parseAuthorList('', '', '');
      expect(res.primaryAuthor).toBe('Bilinmeyen Yazar');
      expect(res.combinedAuthor).toBe('Bilinmeyen Yazar');
    });
  });

  describe('7. Page Count, Year, and Binding Parsing', () => {
    it('parses valid positive page counts', () => {
      expect(parsePageCount('412')).toBe(412);
      expect(parsePageCount(' 800 ')).toBe(800);
      expect(parsePageCount('0')).toBeUndefined();
      expect(parsePageCount('-10')).toBeUndefined();
      expect(parsePageCount('N/A')).toBeUndefined();
      expect(parsePageCount('')).toBeUndefined();
      expect(parsePageCount(undefined)).toBeUndefined();
    });

    it('parses publication year preferring Year Published over Original Year', () => {
      expect(parsePublicationYear('2021', '1965')).toEqual({
        publishDate: '2021',
        originalYear: '1965',
      });
      expect(parsePublicationYear('', '1965')).toEqual({
        publishDate: '1965',
        originalYear: '1965',
      });
      expect(parsePublicationYear('2021', '')).toEqual({
        publishDate: '2021',
        originalYear: undefined,
      });
      expect(parsePublicationYear('-400', '-400')).toEqual({
        publishDate: '-400',
        originalYear: '-400',
      });
    });

    it('localizes Goodreads binding names to Turkish conventions', () => {
      expect(localizeBinding('Hardcover')).toBe('Ciltli');
      expect(localizeBinding('Paperback')).toBe('Karton Kapak');
      expect(localizeBinding('Mass Market Paperback')).toBe('Karton Kapak');
      expect(localizeBinding('Kindle Edition')).toBe('E-kitap');
      expect(localizeBinding('ebook')).toBe('E-kitap');
      expect(localizeBinding('Audiobook')).toBe('Sesli Kitap');
      expect(localizeBinding('Audio CD')).toBe('Sesli Kitap');
      expect(localizeBinding('Custom Binding')).toBe('Custom Binding');
      expect(localizeBinding('')).toBeUndefined();
      expect(localizeBinding(undefined)).toBeUndefined();
    });
  });

  describe('8. Full Row Mapping & Frontmatter Properties Assembly', () => {
    it('maps complete Goodreads raw row to ParsedGoodreadsBook and BookMetadata', () => {
      const row: GoodreadsRawRow = {
        bookId: '12345',
        title: 'Dune (Dune Chronicles, #1)',
        author: 'Frank Herbert',
        authorLf: 'Herbert, Frank',
        additionalAuthors: '',
        isbn: '="0441172717"',
        isbn13: '="9780441172719"',
        myRating: '5',
        averageRating: '4.25',
        publisher: 'Ace Books',
        binding: 'Paperback',
        numberOfPages: '412',
        yearPublished: '1965',
        originalPublicationYear: '1965',
        dateRead: '2023/08/15',
        dateAdded: '2023/08/01',
        bookshelves: 'sci-fi, classics',
        exclusiveShelf: 'read',
        myReview: 'Masterpiece!<spoiler>Arrakis awakens.</spoiler>',
      };

      const parsed = mapGoodreadsRow(row, DEFAULT_SETTINGS);

      expect(parsed.cleanTitle).toBe('Dune');
      expect(parsed.seriesTitle).toBe('Dune Chronicles, #1');
      expect(parsed.isbn10).toBe('0441172717');
      expect(parsed.isbn13).toBe('9780441172719');
      expect(parsed.userRating).toBe(5);
      expect(parsed.readingStatus).toBe('Okundu');
      expect(parsed.dateReadIso).toBe('2023-08-15');
      expect(parsed.dateAddedIso).toBe('2023-08-01');
      expect(parsed.reviewMarkdown).toContain('> [!spoiler]');

      const fm = buildGoodreadsFrontmatterProperties(parsed, DEFAULT_SETTINGS);
      expect(fm.tip).toBe('kitap');
      expect(fm.baslik).toBe('Dune (Dune Chronicles, #1)');
      expect(fm.yazar).toBe('Frank Herbert');
      expect(fm.yayinevi).toBe('Ace Books');
      expect(fm.isbn).toBe('9780441172719');
      expect(fm.sayfa).toBe(412);
      expect(fm.format).toBe('Karton Kapak');
      expect(fm.okuma_durumu).toBe('Okundu');
      expect(fm.okunma_tarihi).toBe('2023-08-15');
      expect(fm.kisisel_puan).toBe(5);
      expect(fm.puan).toBe(4.25);
    });

    it('maps minimal row with missing optional fields safely', () => {
      const row: GoodreadsRawRow = {
        title: 'Minimal Book',
        author: 'Unknown Author',
      };

      const parsed = mapGoodreadsRow(row, DEFAULT_SETTINGS);
      expect(parsed.cleanTitle).toBe('Minimal Book');
      expect(parsed.metadata.author).toBe('Unknown Author');
      expect(parsed.userRating).toBeUndefined();
      expect(parsed.readingStatus).toBe('Okunacak');
      expect(parsed.dateReadIso).toBeUndefined();
      expect(parsed.isbn10).toBeUndefined();
      expect(parsed.isbn13).toBeUndefined();

      const fm = buildGoodreadsFrontmatterProperties(parsed, DEFAULT_SETTINGS);
      expect(fm.kisisel_puan).toBe('');
      expect(fm.okunma_tarihi).toBe('');
      expect(fm.sayfa).toBe('');
      expect(fm.puan).toBe('');
    });
  });
});
