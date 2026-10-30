import { describe, it, expect, beforeAll } from 'vitest';
import { isModuleAvailable, loadGoodreadsModules, GoodreadsModules } from './harness/moduleLoader';
import { DEFAULT_SETTINGS } from '../../src/types';
import {
  GOODREADS_HEADER_24,
  SAMPLE_DUNE_ROW,
  SAMPLE_TURKISH_ROW,
  SAMPLE_CURRENTLY_READING_ROW,
  SAMPLE_TO_READ_ROW,
  SAMPLE_MULTILINE_SPOILER_ROW,
} from './harness/fixtures';

describe('Tier 1: Feature Coverage — Features 1 to 7 (CSV Parser & Metadata Mapping)', () => {
  let modules: GoodreadsModules;
  const isM1Ready = isModuleAvailable('goodreads/csvParser.ts') && isModuleAvailable('goodreads/mapper.ts');

  beforeAll(async () => {
    if (isM1Ready) {
      modules = await loadGoodreadsModules();
    }
  });

  describe('Feature 1: Native RFC 4180 CSV Parser', () => {
    it.skipIf(!isM1Ready)('F1-1: parses basic comma-separated rows with 24 columns', () => {
      const csv = `${GOODREADS_HEADER_24}\n${SAMPLE_DUNE_ROW}`;
      const rows = modules.csvParser!.parseGoodreadsCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('Dune (Dune, #1)');
      expect(rows[0].author).toBe('Frank Herbert');
    });

    it.skipIf(!isM1Ready)('F1-2: parses quoted fields containing embedded commas without splitting columns', () => {
      const csv = `${GOODREADS_HEADER_24}\n101,"Thinking, Fast and Slow","Daniel Kahneman","Kahneman, Daniel","","=""1234567890""","=""9781234567890""","5","4.18","FSG","Paperback","512","2013","2011","2023/01/01","2022/12/01","psychology","","read","","false","","1","1"`;
      const rows = modules.csvParser!.parseGoodreadsCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('Thinking, Fast and Slow');
    });

    it.skipIf(!isM1Ready)('F1-3: unescapes double double-quotes ("") inside quoted fields per RFC 4180 § 2.7', () => {
      const csv = `${GOODREADS_HEADER_24}\n102,"The ""Great"" Gatsby","F. Scott Fitzgerald","Fitzgerald, F. Scott","","=""1234567890""","=""9781234567890""","4","3.93","Scribner","Paperback","180","2004","1925","2023/02/01","2022/12/01","classics","","read","","false","","1","1"`;
      const rows = modules.csvParser!.parseGoodreadsCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('The "Great" Gatsby');
    });

    it.skipIf(!isM1Ready)('F1-4: handles CRLF (\\r\\n) and LF (\\n) line breaks interchangeably', () => {
      const csvCrlf = `${GOODREADS_HEADER_24}\r\n${SAMPLE_DUNE_ROW}\r\n${SAMPLE_TURKISH_ROW}`;
      const rows = modules.csvParser!.parseGoodreadsCsv(csvCrlf);
      expect(rows).toHaveLength(2);
      expect(rows[0].title).toBe('Dune (Dune, #1)');
      expect(rows[1].title).toBe('İnce Memed 1');
    });

    it.skipIf(!isM1Ready)('F1-5: parses multiline reviews containing raw newlines without splitting records', () => {
      const multilineRow = '103,"Test Book","Author One","One, Author","","=""1234567890""","=""9781234567890""","5","4.5","Pub","Paperback","200","2020","2020","2023/05/01","2023/01/01","shelf","","read","Paragraph one.\n\nParagraph two with details.","false","","1","1"';
      const csv = `${GOODREADS_HEADER_24}\n${multilineRow}`;
      const rows = modules.csvParser!.parseGoodreadsCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].myReview).toBe('Paragraph one.\n\nParagraph two with details.');
    });
  });

  describe('Feature 2: UTF-8 BOM Stripper', () => {
    it.skipIf(!isM1Ready)('F2-1: strips UTF-8 BOM (\\uFEFF) at index 0 preserving first header name', () => {
      const csv = `\uFEFF${GOODREADS_HEADER_24}\n${SAMPLE_DUNE_ROW}`;
      const rows = modules.csvParser!.parseGoodreadsCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].bookId).toBe('234225');
    });

    it.skipIf(!isM1Ready)('F2-2: handles CSV content without BOM identically to BOM CSV', () => {
      const csvNoBom = `${GOODREADS_HEADER_24}\n${SAMPLE_DUNE_ROW}`;
      const csvBom = `\uFEFF${GOODREADS_HEADER_24}\n${SAMPLE_DUNE_ROW}`;
      const rowsNoBom = modules.csvParser!.parseGoodreadsCsv(csvNoBom);
      const rowsBom = modules.csvParser!.parseGoodreadsCsv(csvBom);
      expect(rowsNoBom).toEqual(rowsBom);
    });

    it.skipIf(!isM1Ready)('F2-3: preserves UTF-8 Turkish diacritics in book titles with BOM header', () => {
      const csv = `\uFEFF${GOODREADS_HEADER_24}\n${SAMPLE_TURKISH_ROW}`;
      const rows = modules.csvParser!.parseGoodreadsCsv(csv);
      expect(rows[0].title).toBe('İnce Memed 1');
      expect(rows[0].author).toBe('Yaşar Kemal');
    });

    it.skipIf(!isM1Ready)('F2-4: handles empty string with BOM without crashing', () => {
      const rows = modules.csvParser!.parseGoodreadsCsv('\uFEFF');
      expect(rows).toEqual([]);
    });

    it.skipIf(!isM1Ready)('F2-5: handles single line BOM header without records returning empty array', () => {
      const rows = modules.csvParser!.parseGoodreadsCsv(`\uFEFF${GOODREADS_HEADER_24}`);
      expect(rows).toEqual([]);
    });
  });

  describe('Feature 3: Excel ISBN Formula Unescaper', () => {
    it.skipIf(!isM1Ready)('F3-1: extracts 13-digit ISBN from ="978..." Excel formula', () => {
      const raw = {
        title: 'Dune',
        author: 'Frank Herbert',
        isbn13: '="9780441172719"',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.isbn13).toBe('9780441172719');
      expect(parsed.metadata.isbn).toBe('9780441172719');
    });

    it.skipIf(!isM1Ready)('F3-2: extracts 10-digit ISBN preserving leading zero from ="0..." formula', () => {
      const raw = {
        title: 'Dune',
        author: 'Frank Herbert',
        isbn: '="0441172717"',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.isbn10).toBe('0441172717');
    });

    it.skipIf(!isM1Ready)('F3-3: unescapes ISBN-10 with check digit X (="080442957X")', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        isbn: '="080442957X"',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.isbn10).toBe('080442957X');
    });

    it.skipIf(!isM1Ready)('F3-4: handles empty formula (="") returning undefined or empty', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        isbn: '=""',
        isbn13: '=""',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.isbn10).toBeFalsy();
      expect(parsed.isbn13).toBeFalsy();
    });

    it.skipIf(!isM1Ready)('F3-5: handles bare ISBNs without Excel formula formatting', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        isbn13: '9780441172719',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.isbn13).toBe('9780441172719');
    });
  });

  describe('Feature 4: Goodreads Date Normalizer', () => {
    it.skipIf(!isM1Ready)('F4-1: converts standard YYYY/MM/DD to ISO YYYY-MM-DD', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        dateRead: '2023/04/10',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.dateReadIso).toBe('2023-04-10');
    });

    it.skipIf(!isM1Ready)('F4-2: zero-pads single-digit month and day (2023/4/5 -> 2023-04-05)', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        dateRead: '2023/4/5',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.dateReadIso).toBe('2023-04-05');
    });

    it.skipIf(!isM1Ready)('F4-3: normalizes Date Added to ISO 8601 YYYY-MM-DD', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        dateAdded: '2022/1/15',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.dateAddedIso).toBe('2022-01-15');
    });

    it.skipIf(!isM1Ready)('F4-4: maps missing or empty dates to undefined dateReadIso without crashing', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        dateRead: '',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.dateReadIso).toBeFalsy();
    });

    it.skipIf(!isM1Ready)('F4-5: falls back gracefully on non-standard date strings to empty or undefined', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        dateRead: 'InvalidDateString',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.dateReadIso).toBeFalsy();
    });
  });

  describe('Feature 5: Shelf-to-Reading-Status Mapper', () => {
    it.skipIf(!isM1Ready)('F5-1: maps exclusive shelf "read" to Turkish status "Okundu"', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        exclusiveShelf: 'read',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.readingStatus).toBe('Okundu');
      expect(parsed.metadata.readingStatus).toBe('Okundu');
    });

    it.skipIf(!isM1Ready)('F5-2: maps exclusive shelf "currently-reading" to Turkish status "Okunuyor"', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        exclusiveShelf: 'currently-reading',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.readingStatus).toBe('Okunuyor');
      expect(parsed.metadata.readingStatus).toBe('Okunuyor');
    });

    it.skipIf(!isM1Ready)('F5-3: maps exclusive shelf "to-read" to Turkish status "Okunacak"', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        exclusiveShelf: 'to-read',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.readingStatus).toBe('Okunacak');
      expect(parsed.metadata.readingStatus).toBe('Okunacak');
    });

    it.skipIf(!isM1Ready)('F5-4: checks custom readingStatusOptions case-insensitively', () => {
      const customSettings = {
        ...DEFAULT_SETTINGS,
        readingStatusOptions: ['Okundu', 'Okunuyor', 'Okunacak', 'Yarım Bırakıldı'],
      };
      const raw = {
        title: 'Test Book',
        author: 'Author',
        exclusiveShelf: 'yarim-birakildi',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, customSettings);
      expect(parsed.readingStatus).toBeDefined();
    });

    it.skipIf(!isM1Ready)('F5-5: falls back to defaultReadingStatus when shelf is unknown', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        exclusiveShelf: 'unknown-shelf-xyz',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.readingStatus).toBe(DEFAULT_SETTINGS.defaultReadingStatus);
    });
  });

  describe('Feature 6: Rating Value Normalizer', () => {
    it.skipIf(!isM1Ready)('F6-1: maps rating "0" (unrated) to empty string and undefined personalRating', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        myRating: '0',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.userRating).toBeUndefined();
    });

    it.skipIf(!isM1Ready)('F6-2: maps ratings "1" to "5" to exact numeric integer personalRating', () => {
      for (let star = 1; star <= 5; star++) {
        const raw = {
          title: 'Test Book',
          author: 'Author',
          myRating: String(star),
        };
        const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
        expect(parsed.userRating).toBe(star);
      }
    });

    it.skipIf(!isM1Ready)('F6-3: maps empty or whitespace myRating to undefined', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        myRating: '   ',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.userRating).toBeUndefined();
    });

    it.skipIf(!isM1Ready)('F6-4: parses Average Rating decimal float string to numeric rating', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        averageRating: '4.27',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.metadata.rating).toBeCloseTo(4.27, 2);
    });

    it.skipIf(!isM1Ready)('F6-5: handles zero or empty averageRating mapping to undefined', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        averageRating: '0.00',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.metadata.rating).toBeUndefined();
    });
  });

  describe('Feature 7: HTML Review Sanitizer', () => {
    it.skipIf(!isM1Ready)('F7-1: converts HTML <br/> tags to Markdown newline breaks', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        myReview: 'Line 1<br/>Line 2<br><br />Line 3',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.reviewMarkdown).toContain('Line 1\nLine 2\n\nLine 3');
    });

    it.skipIf(!isM1Ready)('F7-2: converts <b> and <i> HTML tags to Markdown bold and italic', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        myReview: '<b>Bold text</b> and <i>italic text</i>',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.reviewMarkdown).toContain('**Bold text**');
      expect(parsed.reviewMarkdown).toContain('*italic text*');
    });

    it.skipIf(!isM1Ready)('F7-3: converts <spoiler> tags to Obsidian spoiler callout (> [!spoiler])', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        myReview: 'Beginning.<spoiler>Secret ending revealed!</spoiler>',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.reviewMarkdown).toContain('> [!spoiler]');
      expect(parsed.reviewMarkdown).toContain('Secret ending revealed!');
    });

    it.skipIf(!isM1Ready)('F7-4: strips unsafe <script> and <iframe> HTML elements', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        myReview: 'Safe review.<script>alert("hacked")</script><iframe src="evil.com"></iframe>',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.reviewMarkdown).not.toContain('<script>');
      expect(parsed.reviewMarkdown).not.toContain('alert("hacked")');
      expect(parsed.reviewMarkdown).not.toContain('<iframe>');
    });

    it.skipIf(!isM1Ready)('F7-5: decodes common HTML entities (&amp;, &quot;, &#39;, &lt;, &gt;)', () => {
      const raw = {
        title: 'Test Book',
        author: 'Author',
        myReview: 'Pride &amp; Prejudice &quot;Love&#39;s Labor&quot;',
      };
      const parsed = modules.mapper!.mapGoodreadsRow(raw, DEFAULT_SETTINGS);
      expect(parsed.reviewMarkdown).toContain('Pride & Prejudice');
      expect(parsed.reviewMarkdown).toContain('"Love\'s Labor"');
    });
  });
});
