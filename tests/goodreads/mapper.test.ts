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

describe('Goodreads Metadata Mapper (mapper.ts)', () => {
  describe('cleanGoodreadsIsbn (TV-ISBN-01 to TV-ISBN-20)', () => {
    it('TV-ISBN-01: handles single quotes inside Excel formula', () => {
      expect(cleanGoodreadsIsbn("='0143127748'")).toBe('0143127748');
    });

    it('TV-ISBN-02: preserves leading zero in double-quoted formula', () => {
      expect(cleanGoodreadsIsbn('="0143127748"')).toBe('0143127748');
    });

    it('TV-ISBN-03: standard 13-digit ISBN formula', () => {
      expect(cleanGoodreadsIsbn('="9780143127741"')).toBe('9780143127741');
    });

    it('TV-ISBN-04: preserves multiple leading zeros', () => {
      expect(cleanGoodreadsIsbn('="0001234567"')).toBe('0001234567');
    });

    it('TV-ISBN-05: preserves ISBN-10 check digit X', () => {
      expect(cleanGoodreadsIsbn('="080442957X"')).toBe('080442957X');
    });

    it('TV-ISBN-06: normalizes lowercase x to uppercase X', () => {
      expect(cleanGoodreadsIsbn('="080442957x"')).toBe('080442957X');
    });

    it('TV-ISBN-07: empty formula returns empty string', () => {
      expect(cleanGoodreadsIsbn('=""')).toBe('');
    });

    it('TV-ISBN-08: bare empty string returns empty string', () => {
      expect(cleanGoodreadsIsbn('')).toBe('');
    });

    it('TV-ISBN-09 & 10: handles null and undefined safely', () => {
      expect(cleanGoodreadsIsbn(null)).toBe('');
      expect(cleanGoodreadsIsbn(undefined)).toBe('');
    });

    it('TV-ISBN-11 & 12: handles bare unformula ISBN strings', () => {
      expect(cleanGoodreadsIsbn('0143127748')).toBe('0143127748');
      expect(cleanGoodreadsIsbn('9780143127741')).toBe('9780143127741');
    });

    it('TV-ISBN-13 & 14: trims internal and surrounding whitespace', () => {
      expect(cleanGoodreadsIsbn('=" 0143127748 "')).toBe('0143127748');
      expect(cleanGoodreadsIsbn(' ="0143127748" ')).toBe('0143127748');
    });

    it('TV-ISBN-15: handles double-escaped CSV quotes', () => {
      expect(cleanGoodreadsIsbn('"=""0143127748"""')).toBe('0143127748');
    });

    it('TV-ISBN-16 & 17: strips hyphens from ISBN string', () => {
      expect(cleanGoodreadsIsbn('="978-0-14-312774-1"')).toBe('9780143127741');
      expect(cleanGoodreadsIsbn('978-0-14-312774-1')).toBe('9780143127741');
    });

    it('TV-ISBN-18 & 19: handles malformed or unquoted formulas', () => {
      expect(cleanGoodreadsIsbn('="9780143127741')).toBe('9780143127741');
      expect(cleanGoodreadsIsbn('=9780143127741')).toBe('9780143127741');
    });

    it('TV-ISBN-20: non-numeric string cleaned to empty', () => {
      expect(cleanGoodreadsIsbn('="N/A"')).toBe('');
      expect(cleanGoodreadsIsbn('unknown')).toBe('');
    });
  });

  describe('Rating Normalizer (TV-RAT-01 to TV-RAT-20)', () => {
    it('TV-RAT-01 & 02: 0 represents unrated and maps to undefined and empty frontmatter string', () => {
      expect(normalizeUserRating('0')).toBeUndefined();
      expect(formatUserRatingForFrontmatter(normalizeUserRating('0'))).toBe('');
      expect(normalizeGoodreadsRating('0')).toBe('');
    });

    it('TV-RAT-03 & 04: boundary star rating 1', () => {
      expect(normalizeUserRating('1')).toBe(1);
      expect(formatUserRatingForFrontmatter(1)).toBe(1);
      expect(normalizeGoodreadsRating('1')).toBe(1);
    });

    it('TV-RAT-05 & 06: boundary star rating 5', () => {
      expect(normalizeUserRating('5')).toBe(5);
      expect(formatUserRatingForFrontmatter(5)).toBe(5);
      expect(normalizeGoodreadsRating('5')).toBe(5);
    });

    it('TV-RAT-07 to 10: empty, whitespace, null, and undefined ratings', () => {
      expect(normalizeUserRating('')).toBeUndefined();
      expect(normalizeUserRating('   ')).toBeUndefined();
      expect(normalizeUserRating(null)).toBeUndefined();
      expect(normalizeUserRating(undefined)).toBeUndefined();
      expect(normalizeGoodreadsRating('')).toBe('');
    });

    it('TV-RAT-11 to 13: out of bounds and non-numeric ratings', () => {
      expect(normalizeUserRating('6')).toBeUndefined();
      expect(normalizeUserRating('-1')).toBeUndefined();
      expect(normalizeUserRating('abc')).toBeUndefined();
      expect(normalizeGoodreadsRating('6')).toBe('');
    });

    it('TV-RAT-14 & 15: float community average rating', () => {
      expect(normalizeAverageRating('4.24')).toBe(4.24);
      expect(normalizeAverageRating('3.89')).toBe(3.89);
    });

    it('TV-RAT-16 & 17: integer and trailing zero average ratings', () => {
      expect(normalizeAverageRating('4')).toBe(4);
      expect(normalizeAverageRating('4.0')).toBe(4);
    });

    it('TV-RAT-18 to 20: 0.00 or empty average ratings map to undefined', () => {
      expect(normalizeAverageRating('0.00')).toBeUndefined();
      expect(normalizeAverageRating('0')).toBeUndefined();
      expect(normalizeAverageRating('')).toBeUndefined();
      expect(normalizeAverageRating(null)).toBeUndefined();
    });
  });

  describe('Date Normalizer (TV-DAT-01 to TV-DAT-18)', () => {
    it('TV-DAT-01: standard Goodreads date format YYYY/MM/DD', () => {
      expect(normalizeGoodreadsDate('2023/04/15')).toBe('2023-04-15');
    });

    it('TV-DAT-02 to 04: single-digit month and day zero-padding', () => {
      expect(normalizeGoodreadsDate('2023/4/5')).toBe('2023-04-05');
      expect(normalizeGoodreadsDate('2023/04/5')).toBe('2023-04-05');
      expect(normalizeGoodreadsDate('2023/4/15')).toBe('2023-04-15');
    });

    it('TV-DAT-05: already ISO format preserved', () => {
      expect(normalizeGoodreadsDate('2023-04-15')).toBe('2023-04-15');
    });

    it('TV-DAT-06 & 07: partial year-month with trailing slash', () => {
      expect(normalizeGoodreadsDate('2023/04')).toBe('2023-04');
      expect(normalizeGoodreadsDate('2023/04/')).toBe('2023-04');
    });

    it('TV-DAT-08 & 09: 4-digit year only with trailing slashes', () => {
      expect(normalizeGoodreadsDate('2023')).toBe('2023');
      expect(normalizeGoodreadsDate('2023//')).toBe('2023');
    });

    it('TV-DAT-10 to 13: empty, whitespace, null, and undefined dates return empty string', () => {
      expect(normalizeGoodreadsDate('')).toBe('');
      expect(normalizeGoodreadsDate('   ')).toBe('');
      expect(normalizeGoodreadsDate(null)).toBe('');
      expect(normalizeGoodreadsDate(undefined)).toBe('');
    });

    it('TV-DAT-14 to 17: invalid dates rejected to empty string', () => {
      expect(normalizeGoodreadsDate('2023/13/01')).toBe('');
      expect(normalizeGoodreadsDate('2023/04/32')).toBe('');
      expect(normalizeGoodreadsDate('2023/00/00')).toBe('');
      expect(normalizeGoodreadsDate('invalid-date')).toBe('');
    });

    it('TV-DAT-18: strips time component from timestamp date', () => {
      expect(normalizeGoodreadsDate('2023-04-15 14:30:00')).toBe('2023-04-15');
    });
  });

  describe('Review HTML Cleaner (TV-HTML-01 to TV-HTML-22)', () => {
    it('TV-HTML-01 to 03: converts <br> tags to newlines and paragraph breaks', () => {
      expect(cleanReviewHtml('Line 1<br/>Line 2')).toBe('Line 1\nLine 2');
      expect(cleanReviewHtml('Line 1<br><br>Line 2')).toBe('Line 1\n\nLine 2');
      expect(cleanReviewHtml('Line 1<br /><br />Line 2')).toBe('Line 1\n\nLine 2');
    });

    it('TV-HTML-04 to 08: converts bold, italic, and strikethrough tags', () => {
      expect(cleanReviewHtml('<b>Great!</b>')).toBe('**Great!**');
      expect(cleanReviewHtml('<strong>Excellent</strong>')).toBe('**Excellent**');
      expect(cleanReviewHtml('<i>Loved it</i>')).toBe('*Loved it*');
      expect(cleanReviewHtml('<em>Masterpiece</em>')).toBe('*Masterpiece*');
      expect(cleanReviewHtml('<s>Old</s> and <del>Cut</del>')).toBe('~~Old~~ and ~~Cut~~');
    });

    it('TV-HTML-09 & 10: converts <spoiler> blocks into Obsidian callouts', () => {
      expect(cleanReviewHtml('<spoiler>Ending revealed</spoiler>')).toBe(
        '> [!spoiler]\n> Ending revealed'
      );
      expect(cleanReviewHtml('<spoiler>Line 1<br/>Line 2</spoiler>')).toBe(
        '> [!spoiler]\n> Line 1\n> Line 2'
      );
    });

    it('TV-HTML-11 & 12: converts links and blockquotes', () => {
      expect(cleanReviewHtml('<a href="https://goodreads.com">Review</a>')).toBe(
        '[Review](https://goodreads.com)'
      );
      expect(cleanReviewHtml('<blockquote>Inspiring words</blockquote>')).toBe(
        '> Inspiring words'
      );
    });

    it('TV-HTML-13 & 14: completely strips unsafe <script> and <iframe> tags', () => {
      expect(cleanReviewHtml('<script>malicious()</script>Valid review')).toBe('Valid review');
      expect(cleanReviewHtml('<iframe src="evil.html"></iframe>Clean text')).toBe('Clean text');
    });

    it('TV-HTML-15 to 19: decodes HTML entities correctly', () => {
      expect(cleanReviewHtml('Pride &amp; Prejudice')).toBe('Pride & Prejudice');
      expect(cleanReviewHtml('He said &quot;Hello&quot;')).toBe('He said "Hello"');
      expect(cleanReviewHtml("It&#39;s a book")).toBe("It's a book");
      expect(cleanReviewHtml('5 &gt; 3 and 2 &lt; 4')).toBe('5 > 3 and 2 < 4');
      expect(cleanReviewHtml('Space&nbsp;&nbsp;Test')).toBe('Space  Test');
    });

    it('TV-HTML-20 & 21: handles empty and null inputs safely', () => {
      expect(cleanReviewHtml('')).toBe('');
      expect(cleanReviewHtml(null)).toBe('');
      expect(cleanReviewHtml(undefined)).toBe('');
    });

    it('TV-HTML-22: handles complex combined review with tags, breaks, and spoilers', () => {
      const complex = '<b>Great!</b><br/>Loved it.<spoiler>End</spoiler>';
      expect(cleanReviewHtml(complex)).toBe('**Great!**\nLoved it.\n\n> [!spoiler]\n> End');
    });

    it('formats review section with optional spoiler indicator', () => {
      const review = 'Harika bir bilimkurgu kitabı.';
      expect(formatReviewSection(review, false)).toBe(
        '\n\n## 📝 Kişisel İnceleme\n\nHarika bir bilimkurgu kitabı.\n'
      );
      expect(formatReviewSection(review, true)).toBe(
        '\n\n## 📝 Kişisel İnceleme\n\n> [!warning] Spoiler İçerir\n> Harika bir bilimkurgu kitabı.\n'
      );
      expect(formatReviewSection('', false)).toBe('');
    });
  });

  describe('Title & Series Extractor (TV-TIT-01 to TV-TIT-07)', () => {
    it('TV-TIT-01: extracts standard series suffix with volume', () => {
      const res = cleanBookTitle('Dune (Dune Chronicles, #1)');
      expect(res.cleanTitle).toBe('Dune');
      expect(res.seriesTitle).toBe('Dune Chronicles, #1');
    });

    it('TV-TIT-02: extracts series with comma', () => {
      const res = cleanBookTitle('The Way of Kings (The Stormlight Archive, #1)');
      expect(res.cleanTitle).toBe('The Way of Kings');
      expect(res.seriesTitle).toBe('The Stormlight Archive, #1');
    });

    it('TV-TIT-03: extracts series without comma', () => {
      const res = cleanBookTitle('Foundation (Foundation #1)');
      expect(res.cleanTitle).toBe('Foundation');
      expect(res.seriesTitle).toBe('Foundation #1');
    });

    it('TV-TIT-04: extracts series with decimal volume number', () => {
      const res = cleanBookTitle('Words of Radiance (The Stormlight Archive, #2.1)');
      expect(res.cleanTitle).toBe('Words of Radiance');
      expect(res.seriesTitle).toBe('The Stormlight Archive, #2.1');
    });

    it('TV-TIT-05: standalone title without series', () => {
      const res = cleanBookTitle('The Hobbit');
      expect(res.cleanTitle).toBe('The Hobbit');
      expect(res.seriesTitle).toBeUndefined();
    });

    it('TV-TIT-06 & 07: empty, null, and undefined titles', () => {
      expect(cleanBookTitle('')).toEqual({ cleanTitle: '' });
      expect(cleanBookTitle(null)).toEqual({ cleanTitle: '' });
      expect(cleanBookTitle(undefined)).toEqual({ cleanTitle: '' });
    });
  });

  describe('Shelf-to-Reading-Status Mapping', () => {
    const defaultOptions = ['Okunacak', 'Okunuyor', 'Okundu'];

    it('maps default exclusive shelves to Turkish status', () => {
      expect(mapGoodreadsShelf('read', defaultOptions, 'Okunacak').status).toBe('Okundu');
      expect(mapGoodreadsShelf('currently-reading', defaultOptions, 'Okunacak').status).toBe('Okunuyor');
      expect(mapGoodreadsShelf('to-read', defaultOptions, 'Okunacak').status).toBe('Okunacak');
      expect(mapShelfToReadingStatus('read', defaultOptions, 'Okunacak')).toBe('Okundu');
    });

    it('matches case-insensitively and diacritic-agnostically', () => {
      expect(mapGoodreadsShelf('READ', defaultOptions, 'Okunacak').status).toBe('Okundu');
      expect(mapGoodreadsShelf('Currently-Reading', defaultOptions, 'Okunacak').status).toBe('Okunuyor');
      expect(mapGoodreadsShelf('TO-READ', defaultOptions, 'Okunacak').status).toBe('Okunacak');
    });

    it('maps to custom configured options (e.g. English TBR/Reading/Finished)', () => {
      const customOptions = ['TBR', 'Reading', 'Finished'];
      expect(mapGoodreadsShelf('read', customOptions, 'TBR').status).toBe('Finished');
      expect(mapGoodreadsShelf('currently-reading', customOptions, 'TBR').status).toBe('Reading');
      expect(mapGoodreadsShelf('to-read', customOptions, 'TBR').status).toBe('TBR');
    });

    it('handles custom unmapped shelf by falling back to default status and marking isCustomShelf', () => {
      const res = mapGoodreadsShelf('dnf', defaultOptions, 'Okunacak');
      expect(res.status).toBe('Okunacak');
      expect(res.isCustomShelf).toBe(true);
      expect(res.customShelfName).toBe('dnf');
    });

    it('direct-matches custom option if user added it to readingStatusOptions', () => {
      const optionsWithDnf = ['Okunacak', 'Okunuyor', 'Okundu', 'DNF'];
      const res = mapGoodreadsShelf('dnf', optionsWithDnf, 'Okunacak');
      expect(res.status).toBe('DNF');
      expect(res.isCustomShelf).toBe(false);
    });

    it('falls back to default status on empty shelf string', () => {
      expect(mapGoodreadsShelf('', defaultOptions, 'Okunacak').status).toBe('Okunacak');
      expect(mapGoodreadsShelf(undefined, defaultOptions, 'Okunacak').status).toBe('Okunacak');
    });
  });

  describe('parseBookshelves', () => {
    it('splits, trims, and deduplicates bookshelves', () => {
      const result = parseBookshelves('sci-fi, space-opera, classic, , sci-fi');
      expect(result).toEqual(['sci-fi', 'space-opera', 'classic']);
    });

    it('filters out canonical exclusive shelves (read, to-read, currently-reading)', () => {
      const result = parseBookshelves('sci-fi, favorites, to-read, read');
      expect(result).toEqual(['sci-fi', 'favorites']);
    });

    it('appends custom shelf if passed', () => {
      const result = parseBookshelves('sci-fi, favorites', 'dnf');
      expect(result).toEqual(['sci-fi', 'favorites', 'dnf']);
    });

    it('returns undefined if bookshelves are empty', () => {
      expect(parseBookshelves('')).toBeUndefined();
      expect(parseBookshelves(' , , ')).toBeUndefined();
      expect(parseBookshelves(undefined)).toBeUndefined();
    });
  });

  describe('parseAuthorList', () => {
    it('extracts primary author and additional authors', () => {
      const res = parseAuthorList('Brian Herbert', undefined, 'Kevin J. Anderson');
      expect(res.primaryAuthor).toBe('Brian Herbert');
      expect(res.additionalAuthors).toEqual(['Kevin J. Anderson']);
      expect(res.combinedAuthor).toBe('Brian Herbert, Kevin J. Anderson');
    });

    it('protects generational suffixes (Jr., III) from improper splitting', () => {
      const res = parseAuthorList('Kurt Vonnegut, Jr.', undefined, 'Terry Pratchett');
      expect(res.combinedAuthor).toBe('Kurt Vonnegut, Jr., Terry Pratchett');
    });

    it('falls back to Author l-f when primary author is missing', () => {
      const res = parseAuthorList('', 'Asimov, Isaac', undefined);
      expect(res.primaryAuthor).toBe('Isaac Asimov');
      expect(res.combinedAuthor).toBe('Isaac Asimov');
    });

    it('defaults to Bilinmeyen Yazar when all author fields are empty', () => {
      const res = parseAuthorList('', '', '');
      expect(res.primaryAuthor).toBe('Bilinmeyen Yazar');
      expect(res.combinedAuthor).toBe('Bilinmeyen Yazar');
    });
  });

  describe('parsePageCount', () => {
    it('parses valid positive integer', () => {
      expect(parsePageCount('412')).toBe(412);
      expect(parsePageCount(' 750 ')).toBe(750);
    });

    it('maps zero, negative, empty, or non-numeric strings to undefined', () => {
      expect(parsePageCount('0')).toBeUndefined();
      expect(parsePageCount('-5')).toBeUndefined();
      expect(parsePageCount('')).toBeUndefined();
      expect(parsePageCount('N/A')).toBeUndefined();
      expect(parsePageCount(undefined)).toBeUndefined();
    });
  });

  describe('parsePublicationYear', () => {
    it('prefers Year Published over Original Publication Year', () => {
      const res = parsePublicationYear('2021', '1965');
      expect(res.publishDate).toBe('2021');
      expect(res.originalYear).toBe('1965');
    });

    it('falls back to Original Publication Year when Year Published is empty', () => {
      const res = parsePublicationYear('', '1965');
      expect(res.publishDate).toBe('1965');
      expect(res.originalYear).toBe('1965');
    });

    it('handles BC/historical negative years', () => {
      const res = parsePublicationYear('-400', '-400');
      expect(res.publishDate).toBe('-400');
    });
  });

  describe('localizeBinding', () => {
    it('localizes standard Goodreads binding names to Turkish', () => {
      expect(localizeBinding('Hardcover')).toBe('Ciltli');
      expect(localizeBinding('Paperback')).toBe('Karton Kapak');
      expect(localizeBinding('Mass Market Paperback')).toBe('Karton Kapak');
      expect(localizeBinding('Kindle Edition')).toBe('E-kitap');
      expect(localizeBinding('Audiobook')).toBe('Sesli Kitap');
    });

    it('preserves unrecognized binding names as-is', () => {
      expect(localizeBinding('Leather Bound')).toBe('Leather Bound');
      expect(localizeBinding('')).toBeUndefined();
    });
  });

  describe('mapGoodreadsRow (Full Integration)', () => {
    const sampleRow: GoodreadsRawRow = {
      bookId: '2767052',
      title: 'The Hunger Games (The Hunger Games, #1)',
      author: 'Suzanne Collins',
      authorLf: 'Collins, Suzanne',
      additionalAuthors: '',
      isbn: '="0439023483"',
      isbn13: '="9780439023481"',
      myRating: '5',
      averageRating: '4.32',
      publisher: 'Scholastic Press',
      binding: 'Hardcover',
      numberOfPages: '374',
      yearPublished: '2008',
      originalPublicationYear: '2008',
      dateRead: '2018/10/21',
      dateAdded: '2018/10/15',
      bookshelves: 'favorites, ya-dystopia',
      exclusiveShelf: 'read',
      myReview: 'Unputdownable book!<spoiler>Prim gets reaped.</spoiler>',
      spoiler: 'false',
    };

    it('maps complete 24-column row into ParsedGoodreadsBook and BookMetadata', () => {
      const parsed = mapGoodreadsRow(sampleRow, DEFAULT_SETTINGS);

      // Parsed fields
      expect(parsed.cleanTitle).toBe('The Hunger Games');
      expect(parsed.seriesTitle).toBe('The Hunger Games, #1');
      expect(parsed.isbn10).toBe('0439023483');
      expect(parsed.isbn13).toBe('9780439023481');
      expect(parsed.userRating).toBe(5);
      expect(parsed.readingStatus).toBe('Okundu');
      expect(parsed.dateReadIso).toBe('2018-10-21');
      expect(parsed.dateAddedIso).toBe('2018-10-15');
      expect(parsed.reviewMarkdown).toContain('> [!spoiler]');

      // Metadata model
      const meta = parsed.metadata;
      expect(meta.id).toBe('goodreads_2767052');
      expect(meta.title).toBe('The Hunger Games (The Hunger Games, #1)');
      expect(meta.author).toBe('Suzanne Collins');
      expect(meta.publisher).toBe('Scholastic Press');
      expect(meta.isbn).toBe('9780439023481');
      expect(meta.pages).toBe(374);
      expect(meta.publishDate).toBe('2008');
      expect(meta.rating).toBe(4.32);
      expect(meta.readingStatus).toBe('Okundu');
      expect(meta.format).toBe('Ciltli');
      expect(meta.genres).toEqual(['favorites', 'ya-dystopia']);
      expect(meta.provider).toBe('goodreads');
    });

    it('handles unrated book with 0 rating (maps to undefined, never 0 stars)', () => {
      const unratedRow: GoodreadsRawRow = {
        ...sampleRow,
        myRating: '0',
        exclusiveShelf: 'to-read',
        dateRead: '',
      };

      const parsed = mapGoodreadsRow(unratedRow, DEFAULT_SETTINGS);
      expect(parsed.userRating).toBeUndefined();
      expect(parsed.readingStatus).toBe('Okunacak');
      expect(parsed.dateReadIso).toBeUndefined();

      const fm = buildGoodreadsFrontmatterProperties(parsed, DEFAULT_SETTINGS);
      expect(fm.kisisel_puan).toBe('');
      expect(fm.okuma_durumu).toBe('Okunacak');
      expect(fm.okunma_tarihi).toBe('');
    });

    it('appends unmapped custom shelf to genres array', () => {
      const customShelfRow: GoodreadsRawRow = {
        ...sampleRow,
        exclusiveShelf: 'abandoned',
        bookshelves: 'sci-fi',
      };

      const parsed = mapGoodreadsRow(customShelfRow, DEFAULT_SETTINGS);
      expect(parsed.readingStatus).toBe('Okunacak'); // default fallback
      expect(parsed.metadata.genres).toEqual(['sci-fi', 'abandoned']);
    });

    it('calculates complementary alternate ISBN when only one is provided', () => {
      const onlyIsbn10Row: GoodreadsRawRow = {
        ...sampleRow,
        isbn: '0441172717',
        isbn13: '',
      };

      const parsed = mapGoodreadsRow(onlyIsbn10Row, DEFAULT_SETTINGS);
      expect(parsed.isbn10).toBe('0441172717');
      expect(parsed.isbn13).toBe('9780441172719');
      expect(parsed.metadata.isbn).toBe('9780441172719');
    });

    it('builds valid frontmatter properties object', () => {
      const parsed = mapGoodreadsRow(sampleRow, DEFAULT_SETTINGS);
      const fm = buildGoodreadsFrontmatterProperties(parsed, DEFAULT_SETTINGS);

      expect(fm.tip).toBe('kitap');
      expect(fm.baslik).toBe('The Hunger Games (The Hunger Games, #1)');
      expect(fm.yazar).toBe('Suzanne Collins');
      expect(fm.sayfa).toBe(374);
      expect(fm.okuma_durumu).toBe('Okundu');
      expect(fm.okunma_tarihi).toBe('2018-10-21');
      expect(fm.kisisel_puan).toBe(5);
      expect(fm.puan).toBe(4.32);
      expect(fm.format).toBe('Ciltli');
    });
  });
});
