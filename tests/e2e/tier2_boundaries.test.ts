import { describe, it, expect, beforeAll } from 'vitest';
import { isModuleAvailable, loadGoodreadsModules, GoodreadsModules } from './harness/moduleLoader';
import { DEFAULT_SETTINGS } from '../../src/types';
import { GOODREADS_HEADER_24 } from './harness/fixtures';

describe('Tier 2: Boundary & Corner Cases (>=5 test cases per boundary condition)', () => {
  let modules: GoodreadsModules;
  const isM1Ready = isModuleAvailable('goodreads/csvParser.ts') && isModuleAvailable('goodreads/mapper.ts');

  beforeAll(async () => {
    if (isM1Ready) {
      modules = await loadGoodreadsModules();
    }
  });

  describe('Boundary 1: Empty CSV, Whitespace & Trailing Newlines', () => {
    it.skipIf(!isM1Ready)('B1-1: handles completely empty CSV string returning empty array', () => {
      const rows = modules.csvParser!.parseGoodreadsCsv('');
      expect(rows).toEqual([]);
    });

    it.skipIf(!isM1Ready)('B1-2: handles whitespace-only CSV string returning empty array', () => {
      const rows = modules.csvParser!.parseGoodreadsCsv('   \n\t  \r\n   ');
      expect(rows).toEqual([]);
    });

    it.skipIf(!isM1Ready)('B1-3: handles CSV with only header row returning empty array', () => {
      const rows = modules.csvParser!.parseGoodreadsCsv(GOODREADS_HEADER_24);
      expect(rows).toEqual([]);
    });

    it.skipIf(!isM1Ready)('B1-4: handles multiple trailing empty lines at end of file gracefully', () => {
      const csv = `${GOODREADS_HEADER_24}\n1,"Title","Author","A, A","","","","5","4.0","P","B","100","2020","2020","","","shelf","","read","","false","","1","1"\n\n\r\n\n`;
      const rows = modules.csvParser!.parseGoodreadsCsv(csv);
      expect(rows).toHaveLength(1);
    });

    it.skipIf(!isM1Ready)('B1-5: ignores empty lines scattered between valid records', () => {
      const row1 = '1,"Title 1","Author 1","","","","","5","4.0","P","B","100","2020","2020","","","shelf","","read","","false","","1","1"';
      const row2 = '2,"Title 2","Author 2","","","","","5","4.0","P","B","100","2020","2020","","","shelf","","read","","false","","1","1"';
      const csv = `${GOODREADS_HEADER_24}\n${row1}\n\n\n${row2}\n`;
      const rows = modules.csvParser!.parseGoodreadsCsv(csv);
      expect(rows).toHaveLength(2);
    });
  });

  describe('Boundary 2: RFC 4180 Quotes & Embedded Delimiters', () => {
    it.skipIf(!isM1Ready)('B2-1: parses title with embedded commas ("Thinking, Fast and Slow")', () => {
      const row = '1,"Thinking, Fast and Slow","Daniel Kahneman","","","","","5","4.0","P","B","100","2020","2020","","","shelf","","read","","false","","1","1"';
      const rows = modules.csvParser!.parseGoodreadsCsv(`${GOODREADS_HEADER_24}\n${row}`);
      expect(rows[0].title).toBe('Thinking, Fast and Slow');
    });

    it.skipIf(!isM1Ready)('B2-2: parses title with leading and trailing quotes inside quoted field', () => {
      const row = '2,"""Dune""","Frank Herbert","","","","","5","4.0","P","B","100","2020","2020","","","shelf","","read","","false","","1","1"';
      const rows = modules.csvParser!.parseGoodreadsCsv(`${GOODREADS_HEADER_24}\n${row}`);
      expect(rows[0].title).toBe('"Dune"');
    });

    it.skipIf(!isM1Ready)('B2-3: tolerates unclosed quotes at EOF without hanging or throwing unhandled exception', () => {
      const row = '3,"Unclosed quote book title';
      const rows = modules.csvParser!.parseGoodreadsCsv(`${GOODREADS_HEADER_24}\n${row}`);
      expect(Array.isArray(rows)).toBe(true);
    });

    it.skipIf(!isM1Ready)('B2-4: handles single dangling quote at end of field', () => {
      const row = '4,"Title"","Author","","","","","5","4.0","P","B","100","2020","2020","","","shelf","","read","","false","","1","1"';
      const rows = modules.csvParser!.parseGoodreadsCsv(`${GOODREADS_HEADER_24}\n${row}`);
      expect(rows).toHaveLength(1);
    });

    it.skipIf(!isM1Ready)('B2-5: handles consecutive escaped quotes ("""" -> "")', () => {
      const row = '5,"Field with """" four quotes","Author","","","","","5","4.0","P","B","100","2020","2020","","","shelf","","read","","false","","1","1"';
      const rows = modules.csvParser!.parseGoodreadsCsv(`${GOODREADS_HEADER_24}\n${row}`);
      expect(rows[0].title).toContain('""');
    });
  });

  describe('Boundary 3: Multiline Reviews with CRLF and LF', () => {
    it.skipIf(!isM1Ready)('B3-1: preserves CRLF newlines within review body', () => {
      const review = 'Line 1\r\nLine 2\r\nLine 3';
      const row = `1,"Title","Author","","","","","5","4.0","P","B","100","2020","2020","","","shelf","","read","${review}","false","","1","1"`;
      const rows = modules.csvParser!.parseGoodreadsCsv(`${GOODREADS_HEADER_24}\n${row}`);
      expect(rows[0].myReview).toBe(review);
    });

    it.skipIf(!isM1Ready)('B3-2: preserves LF newlines within review body', () => {
      const review = 'Line 1\nLine 2\nLine 3';
      const row = `1,"Title","Author","","","","","5","4.0","P","B","100","2020","2020","","","shelf","","read","${review}","false","","1","1"`;
      const rows = modules.csvParser!.parseGoodreadsCsv(`${GOODREADS_HEADER_24}\n${row}`);
      expect(rows[0].myReview).toBe(review);
    });

    it.skipIf(!isM1Ready)('B3-3: handles empty lines within multiline reviews (paragraphs)', () => {
      const review = 'Paragraph 1\n\nParagraph 2\n\nParagraph 3';
      const row = `1,"Title","Author","","","","","5","4.0","P","B","100","2020","2020","","","shelf","","read","${review}","false","","1","1"`;
      const rows = modules.csvParser!.parseGoodreadsCsv(`${GOODREADS_HEADER_24}\n${row}`);
      expect(rows[0].myReview).toBe(review);
    });

    it.skipIf(!isM1Ready)('B3-4: handles review with quotes and newlines combined', () => {
      const review = 'He said:\n""Do or do not.\nThere is no try.""';
      const row = `1,"Title","Author","","","","","5","4.0","P","B","100","2020","2020","","","shelf","","read","${review}","false","","1","1"`;
      const rows = modules.csvParser!.parseGoodreadsCsv(`${GOODREADS_HEADER_24}\n${row}`);
      expect(rows[0].myReview).toContain('Do or do not.');
    });

    it.skipIf(!isM1Ready)('B3-5: handles reviews exceeding 10,000 characters without memory buffer truncation', () => {
      const longReview = 'A'.repeat(12000);
      const row = `1,"Title","Author","","","","","5","4.0","P","B","100","2020","2020","","","shelf","","read","${longReview}","false","","1","1"`;
      const rows = modules.csvParser!.parseGoodreadsCsv(`${GOODREADS_HEADER_24}\n${row}`);
      expect(rows[0].myReview?.length).toBe(12000);
    });
  });

  describe('Boundary 4: Excel Formula Edge Cases', () => {
    it.skipIf(!isM1Ready)('B4-1: unescapes empty formula (="") to empty string', () => {
      const clean = modules.mapper!.cleanGoodreadsIsbn!('=""');
      expect(clean).toBe('');
    });

    it.skipIf(!isM1Ready)('B4-2: unescapes double quoted formula ("=""9780143127741""") to clean numeric string', () => {
      const clean = modules.mapper!.cleanGoodreadsIsbn!('="""9780143127741"""');
      expect(clean).toBe('9780143127741');
    });

    it.skipIf(!isM1Ready)('B4-3: unescapes formula with leading whitespace (=  "0143127748")', () => {
      const clean = modules.mapper!.cleanGoodreadsIsbn!('=  "0143127748"');
      expect(clean).toBe('0143127748');
    });

    it.skipIf(!isM1Ready)('B4-4: unescapes formula with check-digit X (= "080442957X")', () => {
      const clean = modules.mapper!.cleanGoodreadsIsbn!('="080442957X"');
      expect(clean).toBe('080442957X');
    });

    it.skipIf(!isM1Ready)('B4-5: handles non-formula value with equals sign (=NotAnIsbn) without throwing', () => {
      const clean = modules.mapper!.cleanGoodreadsIsbn!('=NotAnIsbn');
      expect(typeof clean).toBe('string');
    });
  });

  describe('Boundary 5: Incomplete & Boundary Dates', () => {
    it.skipIf(!isM1Ready)('B5-1: normalizes year-only date ("2019") to "2019"', () => {
      const d = modules.mapper!.normalizeGoodreadsDate!('2019');
      expect(d).toBe('2019');
    });

    it.skipIf(!isM1Ready)('B5-2: normalizes year/month partial date ("2023/4") to "2023-04"', () => {
      const d = modules.mapper!.normalizeGoodreadsDate!('2023/4');
      expect(d).toBe('2023-04');
    });

    it.skipIf(!isM1Ready)('B5-3: handles leap year date ("2024/02/29") accurately', () => {
      const d = modules.mapper!.normalizeGoodreadsDate!('2024/02/29');
      expect(d).toBe('2024-02-29');
    });

    it.skipIf(!isM1Ready)('B5-4: handles invalid month/day ("2023/99/99") returning empty string', () => {
      const d = modules.mapper!.normalizeGoodreadsDate!('2023/99/99');
      expect(d).toBe('');
    });

    it.skipIf(!isM1Ready)('B5-5: handles non-date string ("N/A") returning empty string', () => {
      const d = modules.mapper!.normalizeGoodreadsDate!('N/A');
      expect(d).toBe('');
    });
  });

  describe('Boundary 6: Extreme, Float & Negative Ratings', () => {
    it.skipIf(!isM1Ready)('B6-1: maps negative rating ("-1") to undefined userRating', () => {
      const parsed = modules.mapper!.mapGoodreadsRow({ title: 'T', author: 'A', myRating: '-1' }, DEFAULT_SETTINGS);
      expect(parsed.userRating).toBeUndefined();
    });

    it.skipIf(!isM1Ready)('B6-2: maps rating exceeding 5 ("6") to undefined userRating', () => {
      const parsed = modules.mapper!.mapGoodreadsRow({ title: 'T', author: 'A', myRating: '6' }, DEFAULT_SETTINGS);
      expect(parsed.userRating).toBeUndefined();
    });

    it.skipIf(!isM1Ready)('B6-3: handles float in integer rating ("4.5") by flooring or dropping to integer', () => {
      const parsed = modules.mapper!.mapGoodreadsRow({ title: 'T', author: 'A', myRating: '4.5' }, DEFAULT_SETTINGS);
      expect(parsed.userRating).toBe(4);
    });

    it.skipIf(!isM1Ready)('B6-4: maps average rating "5.00" to exactly 5.0', () => {
      const parsed = modules.mapper!.mapGoodreadsRow({ title: 'T', author: 'A', averageRating: '5.00' }, DEFAULT_SETTINGS);
      expect(parsed.metadata.rating).toBe(5);
    });

    it.skipIf(!isM1Ready)('B6-5: handles average rating with extra decimals ("4.23456") by rounding to 2 places (4.23)', () => {
      const parsed = modules.mapper!.mapGoodreadsRow({ title: 'T', author: 'A', averageRating: '4.23456' }, DEFAULT_SETTINGS);
      expect(parsed.metadata.rating).toBe(4.23);
    });
  });

  describe('Boundary 7: Unicode BOM & Turkish Character Sets', () => {
    it.skipIf(!isM1Ready)('B7-1: decodes Turkish lowercase "ı" and uppercase "I" accurately', () => {
      const title = 'Karanlık ve Aydınlık';
      const parsed = modules.mapper!.mapGoodreadsRow({ title, author: 'A' }, DEFAULT_SETTINGS);
      expect(parsed.cleanTitle).toBe(title);
    });

    it.skipIf(!isM1Ready)('B7-2: decodes Turkish lowercase "i" and uppercase "İ" accurately', () => {
      const title = 'İnce Memed';
      const parsed = modules.mapper!.mapGoodreadsRow({ title, author: 'A' }, DEFAULT_SETTINGS);
      expect(parsed.cleanTitle).toBe(title);
    });

    it.skipIf(!isM1Ready)('B7-3: preserves Turkish characters in author names (Oğuz Atay, Halide Edip Adıvar)', () => {
      const author = 'Oğuz Atay';
      const parsed = modules.mapper!.mapGoodreadsRow({ title: 'Tutunamayanlar', author }, DEFAULT_SETTINGS);
      expect(parsed.metadata.author).toBe(author);
    });

    it.skipIf(!isM1Ready)('B7-4: strips BOM without altering internal UTF-8 multibyte characters', () => {
      const csv = `\uFEFF${GOODREADS_HEADER_24}\n1,"Şiirler","Özdemir Asaf","","","","","5","4.0","P","B","100","2020","2020","","","shelf","","read","","false","","1","1"`;
      const rows = modules.csvParser!.parseGoodreadsCsv(csv);
      expect(rows[0].title).toBe('Şiirler');
      expect(rows[0].author).toBe('Özdemir Asaf');
    });

    it.skipIf(!isM1Ready)('B7-5: handles non-Latin scripts (Cyrillic, Greek, CJK) without character corruption', () => {
      const title = 'Война и мир (War and Peace)';
      const author = 'Лев Толстой';
      const parsed = modules.mapper!.mapGoodreadsRow({ title, author }, DEFAULT_SETTINGS);
      expect(parsed.metadata.author).toBe(author);
    });
  });

  describe('Boundary 8: Missing Columns, Extra Columns & Truncated Records', () => {
    it.skipIf(!isM1Ready)('B8-1: handles row with fewer columns than header by padding with empty strings', () => {
      const shortRow = '1,"Short Title","Short Author"';
      const rows = modules.csvParser!.parseGoodreadsCsv(`${GOODREADS_HEADER_24}\n${shortRow}`);
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('Short Title');
      expect(rows[0].author).toBe('Short Author');
      expect(rows[0].isbn).toBe('');
    });

    it.skipIf(!isM1Ready)('B8-2: handles legacy 28-column export safely ignoring extra columns', () => {
      const legacyHeader = `${GOODREADS_HEADER_24},Extra1,Extra2,Extra3,Extra4`;
      const row = '1,"Title","Author","","","","","5","4.0","P","B","100","2020","2020","","","shelf","","read","","false","","1","1","E1","E2","E3","E4"';
      const rows = modules.csvParser!.parseGoodreadsCsv(`${legacyHeader}\n${row}`);
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('Title');
    });

    it.skipIf(!isM1Ready)('B8-3: handles row with missing Book Id by setting empty or generated fallback', () => {
      const row = ',"No Id Title","Author","","","","","5","4.0","P","B","100","2020","2020","","","shelf","","read","","false","","1","1"';
      const rows = modules.csvParser!.parseGoodreadsCsv(`${GOODREADS_HEADER_24}\n${row}`);
      expect(rows[0].title).toBe('No Id Title');
    });

    it.skipIf(!isM1Ready)('B8-4: handles non-numeric page count ("N/A", "Unknown") by mapping to undefined', () => {
      const parsed = modules.mapper!.mapGoodreadsRow({ title: 'T', author: 'A', numberOfPages: 'Unknown' }, DEFAULT_SETTINGS);
      expect(parsed.metadata.pages).toBeUndefined();
    });

    it.skipIf(!isM1Ready)('B8-5: handles zero page count ("0") by mapping to undefined', () => {
      const parsed = modules.mapper!.mapGoodreadsRow({ title: 'T', author: 'A', numberOfPages: '0' }, DEFAULT_SETTINGS);
      expect(parsed.metadata.pages).toBeUndefined();
    });
  });
});
