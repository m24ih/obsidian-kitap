import { describe, it, expect } from 'vitest';
import {
  stripBom,
  toCamelCase,
  unescapeExcelFormula,
  parseCsv,
  parseGoodreadsCsv,
  GOODREADS_HEADER_MAP,
} from '../../src/goodreads/csvParser';

const STANDARD_HEADER =
  'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with Positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies';

describe('Adversarial Stress Suite: csvParser.ts', () => {
  describe('1. Excel Formula Variations & Edge Cases', () => {
    it('handles standard unquoted formula ="0123456789"', () => {
      expect(unescapeExcelFormula('="0123456789"')).toBe('0123456789');
    });

    it('handles standard CSV-quoted formula "=""9780123456789"""', () => {
      expect(unescapeExcelFormula('"=""9780123456789"""')).toBe('9780123456789');
    });

    it('handles triple quote variant ="""9780123456789"""', () => {
      expect(unescapeExcelFormula('="""9780123456789"""')).toBe('9780123456789');
    });

    it('handles ISBN-10 with check digit X and x in formula', () => {
      expect(unescapeExcelFormula('="080442957X"')).toBe('080442957X');
      expect(unescapeExcelFormula('="080442957x"')).toBe('080442957x');
    });

    it('preserves leading zeros: ="0000000001" and ="0001234567890"', () => {
      expect(unescapeExcelFormula('="0000000001"')).toBe('0000000001');
      expect(unescapeExcelFormula('="0001234567890"')).toBe('0001234567890');
    });

    it('handles spaces inside and outside formula', () => {
      expect(unescapeExcelFormula('=" 0123456789 "')).toBe('0123456789');
      expect(unescapeExcelFormula('   ="0123456789"   ')).toBe('0123456789');
      expect(unescapeExcelFormula(' =" 0123456789 " ')).toBe('0123456789');
    });

    it('handles empty and whitespace-only formulas', () => {
      expect(unescapeExcelFormula('=""')).toBe('');
      expect(unescapeExcelFormula('=" "')).toBe('');
      expect(unescapeExcelFormula('"="" """')).toBe('');
      expect(unescapeExcelFormula('=')).toBe('');
    });

    it('handles malformed formula: missing closing quote, unquoted formula', () => {
      expect(unescapeExcelFormula('="0123456789')).toBe('0123456789');
      expect(unescapeExcelFormula('=0123456789')).toBe('0123456789');
      expect(unescapeExcelFormula("='0123456789")).toBe('0123456789');
    });

    it('handles hyphenated ISBNs in formula', () => {
      expect(unescapeExcelFormula('="978-0-14-312774-1"')).toBe('978-0-14-312774-1');
    });

    it('handles null, undefined, empty string, and non-formula inputs', () => {
      expect(unescapeExcelFormula(null)).toBe('');
      expect(unescapeExcelFormula(undefined)).toBe('');
      expect(unescapeExcelFormula('')).toBe('');
      expect(unescapeExcelFormula('   ')).toBe('');
      expect(unescapeExcelFormula('9780123456789')).toBe('9780123456789');
    });

    it('unescapes formulas via parseGoodreadsCsv in full row', () => {
      // 0: Book Id, 1: Title, 2: Author, 3: Author l-f, 4: Add Authors, 5: ISBN, 6: ISBN13
      const csv = `${STANDARD_HEADER}\n1,Dune,Frank Herbert,,,"="0123456789"","="9780123456789"",,,,,,,,,,,,,,,,,`;
      const rows = parseGoodreadsCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].isbn).toBe('0123456789');
      expect(rows[0].isbn13).toBe('9780123456789');
    });
  });

  describe('2. RFC 4180 Escaped Quotes & Quoted Field Boundaries', () => {
    it('parses empty quoted field ""', () => {
      const res = parseCsv('a,"",b');
      expect(res).toEqual([['a', '', 'b']]);
    });

    it('parses single escaped double quote """" -> "', () => {
      const res = parseCsv('a,"""",b');
      expect(res).toEqual([['a', '"', 'b']]);
    });

    it('parses two escaped double quotes """""" -> ""', () => {
      const res = parseCsv('a,"""""",b');
      expect(res).toEqual([['a', '""', 'b']]);
    });

    it('parses escaped quote at field start: """quote start"', () => {
      const res = parseCsv('"""quote start",b');
      expect(res).toEqual([['"quote start', 'b']]);
    });

    it('parses escaped quote at field end: "quote end"""', () => {
      const res = parseCsv('"quote end""",b');
      expect(res).toEqual([['quote end"', 'b']]);
    });

    it('parses escaped quotes at both ends: """both"""', () => {
      const res = parseCsv('"""both""",b');
      expect(res).toEqual([['"both"', 'b']]);
    });

    it('handles trailing whitespace after closing quote', () => {
      const res = parseCsv('"Dune"   ,Frank Herbert');
      expect(res).toEqual([['Dune', 'Frank Herbert']]);
    });

    it('handles mid-field quotes in unquoted field (e.g. 12" Vinyl)', () => {
      const res = parseCsv('12" Vinyl,Album');
      expect(res).toEqual([['12" Vinyl', 'Album']]);
    });

    it('handles unterminated quote gracefully at EOF without infinite loop', () => {
      const res = parseCsv('1,Dune,"unterminated field at eof');
      expect(res).toEqual([['1', 'Dune', 'unterminated field at eof']]);
    });

    it('handles complex quotes and commas combined', () => {
      const res = parseCsv('"He said, ""Wait, who\'s there?"", and ran",Second');
      expect(res).toEqual([['He said, "Wait, who\'s there?", and ran', 'Second']]);
    });
  });

  describe('3. CRLF, LF, CR Mixed Newlines Inside and Outside Quoted Fields', () => {
    it('handles Windows CRLF outer delimiters with LF inside quoted fields', () => {
      const csv = '"Line 1\nLine 2",Author\r\n"Row 2",Author 2\r\n';
      const res = parseCsv(csv);
      expect(res).toEqual([
        ['Line 1\nLine 2', 'Author'],
        ['Row 2', 'Author 2'],
      ]);
    });

    it('handles Unix LF outer delimiters with CRLF inside quoted fields', () => {
      const csv = '"Line 1\r\nLine 2",Author\n"Row 2",Author 2\n';
      const res = parseCsv(csv);
      expect(res).toEqual([
        ['Line 1\r\nLine 2', 'Author'],
        ['Row 2', 'Author 2'],
      ]);
    });

    it('handles mixed CRLF, LF, and CR in the SAME quoted multiline field', () => {
      const csv = '"CRLF:\r\nLF:\nCR:\rEnd",Author\n';
      const res = parseCsv(csv);
      expect(res.length).toBe(1);
      expect(res[0][0]).toBe('CRLF:\r\nLF:\nCR:\rEnd');
      expect(res[0][1]).toBe('Author');
    });

    it('handles multiple consecutive empty lines (CRLF, LF, mixed)', () => {
      const csv = 'row1,col1\r\n\r\n\n\r\n\n\nrow2,col2';
      const res = parseCsv(csv);
      expect(res).toEqual([
        ['row1', 'col1'],
        ['row2', 'col2'],
      ]);
    });

    it('handles quoted field consisting purely of newlines', () => {
      const csv = '"\r\n\n\r",Author';
      const res = parseCsv(csv);
      expect(res).toEqual([['\r\n\n\r', 'Author']]);
    });
  });

  describe('4. UTF-8 BOM Handling', () => {
    it('strips BOM from plain header', () => {
      const csv = '\uFEFFBook Id,Title\n1,Dune';
      const res = parseCsv(csv);
      expect(res[0][0]).toBe('Book Id');
    });

    it('strips BOM from quoted first field', () => {
      const csv = '\uFEFF"Book Id","Title"\n1,Dune';
      const res = parseCsv(csv);
      expect(res[0][0]).toBe('Book Id');
      expect(res[0][1]).toBe('Title');
    });

    it('handles empty string or string containing only BOM', () => {
      expect(stripBom('\uFEFF')).toBe('');
      expect(parseCsv('\uFEFF')).toEqual([]);
    });

    it('preserves Goodreads parsing when BOM is present', () => {
      const csv = `\uFEFF${STANDARD_HEADER}\n1,Dune,Frank Herbert,,,,="0441172717",="9780441172719",,,,,,,,,,,,,,,,`;
      const rows = parseGoodreadsCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].bookId).toBe('1');
      expect(rows[0].title).toBe('Dune');
    });
  });

  describe('5. Ragged Lines, Missing Columns & Trailing Boundaries', () => {
    it('handles row with fewer columns than header', () => {
      const csv = `${STANDARD_HEADER}\n1,Short Row Book,Short Author`;
      const rows = parseGoodreadsCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].bookId).toBe('1');
      expect(rows[0].title).toBe('Short Row Book');
      expect(rows[0].author).toBe('Short Author');
      expect(rows[0].isbn13).toBe('');
      expect(rows[0].exclusiveShelf).toBe('');
    });

    it('handles row with more columns than header without throwing', () => {
      const csv = 'Title,Author\nDune,Frank Herbert,Extra1,Extra2,Extra3';
      const rows = parseGoodreadsCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].title).toBe('Dune');
      expect(rows[0].author).toBe('Frank Herbert');
    });

    it('handles lines with trailing empty fields', () => {
      const csv = 'a,b,c,\n1,2,,';
      const res = parseCsv(csv);
      expect(res).toEqual([
        ['a', 'b', 'c', ''],
        ['1', '2', '', ''],
      ]);
    });

    it('handles lines with leading empty fields', () => {
      const csv = ',b,c\n,2,3';
      const res = parseCsv(csv);
      expect(res).toEqual([
        ['', 'b', 'c'],
        ['', '2', '3'],
      ]);
    });

    it('ignores rows where all cells are commas/empty', () => {
      const csv = `${STANDARD_HEADER}\n1,Dune,Frank Herbert,,,,,,,,,,,,,,,,,,,\n,,,,,,,,,,,,,,,,,,,,,,,\n2,Neuromancer,William Gibson,,,,,,,,,,,,,,,,,,,`;
      const rows = parseGoodreadsCsv(csv);
      expect(rows.length).toBe(2);
      expect(rows[0].title).toBe('Dune');
      expect(rows[1].title).toBe('Neuromancer');
    });

    it('handles EOF without trailing newline', () => {
      const csv = 'a,b\n1,2';
      const res = parseCsv(csv);
      expect(res).toEqual([
        ['a', 'b'],
        ['1', '2'],
      ]);
    });
  });

  describe('6. Massive Multiline Reviews & High Volume Stress', () => {
    it('parses massive multiline review (100,000 characters) accurately', () => {
      const paragraph =
        'This is a very long and detailed analysis of Dune by Frank Herbert. It touches upon ecology, politics, and religion.<br/><br/>';
      const massiveReview = paragraph.repeat(800) + '<spoiler>The spice must flow!</spoiler>';
      expect(massiveReview.length).toBeGreaterThan(100000);

      const csv = `${STANDARD_HEADER}\n1,Dune,Frank Herbert,,,,,,,,,,,,,,,,,"${massiveReview.replace(/"/g, '""')}",,,,`;
      const start = performance.now();
      const rows = parseGoodreadsCsv(csv);
      const elapsed = performance.now() - start;

      expect(rows.length).toBe(1);
      expect(rows[0].myReview?.length).toBe(massiveReview.length);
      expect(rows[0].myReview?.endsWith('<spoiler>The spice must flow!</spoiler>')).toBe(true);
      expect(elapsed).toBeLessThan(100); // Must be fast (< 100ms)
    });

    it('scales linearly on 10,000 rows library export', () => {
      const rows: string[] = [STANDARD_HEADER];
      for (let i = 1; i <= 10000; i++) {
        const isbn10 = String(i).padStart(10, '0');
        const isbn13 = `978${String(i).padStart(10, '0')}`;
        rows.push(
          `${i},"Book Title ${i} (Series, #${i % 10})","Author ${i}","Author ${i}, First",,"=""${isbn10}""","=""${isbn13}""",${(i % 5) + 1},4.25,"Publisher",Paperback,300,2020,2020,2023/01/01,2022/01/01,shelf,shelf (#1),read,"Multiline review\nfor book ${i}",false,,1,0`
        );
      }
      const massiveCsv = rows.join('\r\n');

      const start = performance.now();
      const parsed = parseGoodreadsCsv(massiveCsv);
      const elapsed = performance.now() - start;

      expect(parsed.length).toBe(10000);
      expect(parsed[0].isbn).toBe('0000000001');
      expect(parsed[0].isbn13).toBe('9780000000001');
      expect(parsed[9999].isbn).toBe('0000010000');
      expect(parsed[9999].isbn13).toBe('9780000010000');
      expect(parsed[9999].myReview).toBe('Multiline review\nfor book 10000');
      // Performance check: 10,000 rows with 24 columns should easily parse in under 1.5 seconds in V8
      expect(elapsed).toBeLessThan(1500);
    });
  });

  describe('7. Internationalization, Unicode & Diacritics', () => {
    it('preserves Turkish diacritics and casing accurately', () => {
      const csv = `${STANDARD_HEADER}\n1,Şiirler ve Hikâyeler,Ömer Seyfettin,"Seyfettin, Ömer",,="9750800001",="9789750800009",5,4.50,Yapı Kredi Yayınları,Karton,250,1919,1919,2023/05/01,2023/01/01,öykü,öykü (#1),read,"Harika bir Türkçe klasiği. Çeviri değil, özbeöz Türkçe.",false,,1,0`;
      const rows = parseGoodreadsCsv(csv);
      expect(rows.length).toBe(1);
      const row = rows[0];
      expect(row.title).toBe('Şiirler ve Hikâyeler');
      expect(row.author).toBe('Ömer Seyfettin');
      expect(row.publisher).toBe('Yapı Kredi Yayınları');
      expect(row.myReview).toContain('Harika bir Türkçe klasiği. Çeviri değil, özbeöz Türkçe.');
    });

    it('preserves emojis, CJK, Arabic, and Cyrillic text', () => {
      const row = new Array(24).fill('');
      row[0] = '1';
      row[1] = '🧙‍♂️ The Hobbit 🚀';
      row[2] = 'J.R.R. Tolkien';
      row[19] = 'Arabic: ألف ليلة وليلة / CJK: 吾輩は猫である';
      const csv = `${STANDARD_HEADER}\n${row.map(c => `"${c.replace(/"/g, '""')}"`).join(',')}`;
      const rows = parseGoodreadsCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].title).toBe('🧙‍♂️ The Hobbit 🚀');
      expect(rows[0].myReview).toBe('Arabic: ألف ليلة وليلة / CJK: 吾輩は猫である');
    });
  });

  describe('8. Security & Adversarial Injections', () => {
    it('safely handles CSV injection formulas without execution or loss', () => {
      const row = new Array(24).fill('');
      row[0] = '1';
      row[1] = '@SUM(1+1)';
      row[2] = '-1+1';
      row[5] = '="0123456789"';
      row[6] = '="9780123456789"';
      const csv = `${STANDARD_HEADER}\n${row.join(',')}`;
      const rows = parseGoodreadsCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].title).toBe('@SUM(1+1)');
      expect(rows[0].author).toBe('-1+1');
    });

    it('safely handles script tags and HTML inside reviews and titles', () => {
      const row = new Array(24).fill('');
      row[0] = '1';
      row[1] = "<script>alert('xss')</script>";
      row[2] = '<img src=x onerror=alert(1)>';
      row[19] = '<b onmouseover=evil()>review</b>';
      const csv = `${STANDARD_HEADER}\n${row.map(c => `"${c.replace(/"/g, '""')}"`).join(',')}`;
      const rows = parseGoodreadsCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].title).toBe("<script>alert('xss')</script>");
      expect(rows[0].author).toBe('<img src=x onerror=alert(1)>');
      expect(rows[0].myReview).toBe('<b onmouseover=evil()>review</b>');
    });
  });

  describe('9. Header Case Sensitivity & Unmapped Fallbacks', () => {
    it('maps all uppercase headers BOOK ID, TITLE, AUTHOR, ISBN, ISBN13', () => {
      const upperHeader = 'BOOK ID,TITLE,AUTHOR,ISBN,ISBN13';
      const csv = `${upperHeader}\n1,Dune,Frank Herbert,="0143127748",="9780143127741"`;
      const rows = parseGoodreadsCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].bookId).toBe('1');
      expect(rows[0].title).toBe('Dune');
      expect(rows[0].author).toBe('Frank Herbert');
      expect(rows[0].isbn).toBe('0143127748');
      expect(rows[0].isbn13).toBe('9780143127741');
    });

    it('falls back to camelCase for unrecognized custom columns', () => {
      const customHeader = 'Title,Author,Custom Rating 2024,User Notes';
      const csv = `${customHeader}\nDune,Frank Herbert,4.5,My favorite`;
      const rows = parseGoodreadsCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0]['customRating2024']).toBe('4.5');
      expect(rows[0]['userNotes']).toBe('My favorite');
      expect(rows[0]['Custom Rating 2024']).toBe('4.5');
    });
  });

  describe('10. Pathological Edge Cases & Boundary Violence', () => {
    it('handles 10,000 consecutive double quotes without stack overflow or hang', () => {
      const crazyQuotes = '"'.repeat(10000);
      const start = performance.now();
      const res = parseCsv(crazyQuotes);
      const elapsed = performance.now() - start;
      // Must not crash or hang, must finish in under 50ms
      expect(elapsed).toBeLessThan(50);
      expect(Array.isArray(res)).toBe(true);
    });

    it('handles 1,000,000 character single continuous field', () => {
      const hugeField = 'A'.repeat(1000000);
      const csv = `Title,Author\n"${hugeField}",Frank Herbert`;
      const start = performance.now();
      const rows = parseGoodreadsCsv(csv);
      const elapsed = performance.now() - start;
      expect(rows.length).toBe(1);
      expect(rows[0].title.length).toBe(1000000);
      expect(rows[0].author).toBe('Frank Herbert');
      expect(elapsed).toBeLessThan(200);
    });

    it('safely handles binary control chars, null bytes and ANSI escapes', () => {
      const csv = 'Title,Author\n"Dune\x00\x01\x1b[31mRed\x1b[0m","Frank\tHerbert"';
      const rows = parseGoodreadsCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].title).toBe('Dune\x00\x01\x1b[31mRed\x1b[0m');
      expect(rows[0].author).toBe('Frank\tHerbert');
    });

    it('handles rapid alternating quotes and commas: ",",",",","', () => {
      const csv = '","\n",",",",","';
      const res = parseCsv(csv);
      expect(res.length).toBe(2);
      expect(res[0]).toEqual([',']);
      expect(res[1]).toEqual([',', ',', ',']);
    });
  });
});

