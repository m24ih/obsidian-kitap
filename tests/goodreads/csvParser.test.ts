import { describe, it, expect } from 'vitest';
import {
  stripBom,
  toCamelCase,
  unescapeExcelFormula,
  parseCsv,
  parseGoodreadsCsv,
} from '../../src/goodreads/csvParser';

describe('Goodreads CSV Parser (csvParser.ts)', () => {
  describe('stripBom', () => {
    it('removes UTF-8 BOM (\\uFEFF) from start of string', () => {
      const withBom = '\uFEFFBook Id,Title,Author';
      expect(stripBom(withBom)).toBe('Book Id,Title,Author');
    });

    it('leaves strings without BOM untouched', () => {
      const normal = 'Book Id,Title,Author';
      expect(stripBom(normal)).toBe('Book Id,Title,Author');
    });

    it('handles empty string gracefully', () => {
      expect(stripBom('')).toBe('');
    });
  });

  describe('toCamelCase', () => {
    it('converts space-separated words to camelCase', () => {
      expect(toCamelCase('Book Id')).toBe('bookId');
      expect(toCamelCase('Exclusive Shelf')).toBe('exclusiveShelf');
      expect(toCamelCase('Recommended For')).toBe('recommendedFor');
    });

    it('converts punctuation and dashes properly', () => {
      expect(toCamelCase('author l-f')).toBe('authorLF');
      expect(toCamelCase('custom_field_name')).toBe('customFieldName');
    });
  });

  describe('unescapeExcelFormula', () => {
    it('unescapes double-quoted Excel formula preserving leading zeros', () => {
      expect(unescapeExcelFormula('="0143127748"')).toBe('0143127748');
      expect(unescapeExcelFormula('="0001234567"')).toBe('0001234567');
      expect(unescapeExcelFormula('="9780143127741"')).toBe('9780143127741');
    });

    it('unescapes single-quoted Excel formula', () => {
      expect(unescapeExcelFormula("='0143127748'")).toBe('0143127748');
    });

    it('handles check digit X in ISBN-10 formulas', () => {
      expect(unescapeExcelFormula('="080442957X"')).toBe('080442957X');
    });

    it('handles empty formula =""', () => {
      expect(unescapeExcelFormula('=""')).toBe('');
    });

    it('handles bare unformula strings without alteration', () => {
      expect(unescapeExcelFormula('0143127748')).toBe('0143127748');
      expect(unescapeExcelFormula('9780143127741')).toBe('9780143127741');
    });

    it('trims internal and surrounding whitespace', () => {
      expect(unescapeExcelFormula('=" 0143127748 "')).toBe('0143127748');
      expect(unescapeExcelFormula(' ="0143127748" ')).toBe('0143127748');
    });

    it('handles double-escaped CSV quotes', () => {
      expect(unescapeExcelFormula('"=""0143127748"""')).toBe('0143127748');
    });

    it('handles malformed formula with missing quote', () => {
      expect(unescapeExcelFormula('="9780143127741')).toBe('9780143127741');
    });

    it('handles formula without quotes', () => {
      expect(unescapeExcelFormula('=9780143127741')).toBe('9780143127741');
    });

    it('handles null and undefined safely', () => {
      expect(unescapeExcelFormula(null)).toBe('');
      expect(unescapeExcelFormula(undefined)).toBe('');
    });
  });

  describe('parseCsv (RFC 4180 Streaming FSM)', () => {
    it('parses simple comma-separated fields', () => {
      const csv = 'a,b,c\n1,2,3';
      expect(parseCsv(csv)).toEqual([
        ['a', 'b', 'c'],
        ['1', '2', '3'],
      ]);
    });

    it('preserves embedded commas in quoted fields', () => {
      const csv = '"Dune, Part 1",Frank Herbert,4.24';
      expect(parseCsv(csv)).toEqual([['Dune, Part 1', 'Frank Herbert', '4.24']]);
    });

    it('unescapes doubled quotes ("")', () => {
      const csv = '"He said, ""Hello world!""",Author';
      expect(parseCsv(csv)).toEqual([['He said, "Hello world!"', 'Author']]);
    });

    it('preserves multiline fields with CRLF and LF newlines', () => {
      const csv = '"Line 1\r\nLine 2\nLine 3",Frank Herbert';
      const result = parseCsv(csv);
      expect(result.length).toBe(1);
      expect(result[0][0]).toBe('Line 1\r\nLine 2\nLine 3');
      expect(result[0][1]).toBe('Frank Herbert');
    });

    it('parses empty fields and trailing commas', () => {
      const csv = '1,"",,4\na,b,';
      expect(parseCsv(csv)).toEqual([
        ['1', '', '', '4'],
        ['a', 'b', ''],
      ]);
    });

    it('handles Windows CRLF and Unix LF transparently', () => {
      const csv = 'a,b\r\nc,d\ne,f';
      expect(parseCsv(csv)).toEqual([
        ['a', 'b'],
        ['c', 'd'],
        ['e', 'f'],
      ]);
    });

    it('skips empty lines between records', () => {
      const csv = 'a,b\n\n\nc,d';
      expect(parseCsv(csv)).toEqual([
        ['a', 'b'],
        ['c', 'd'],
      ]);
    });

    it('handles unclosed quote at EOF without crashing or hanging', () => {
      const csv = 'a,b,"unclosed string';
      expect(parseCsv(csv)).toEqual([['a', 'b', 'unclosed string']]);
    });

    it('handles unquoted Excel ISBN formula', () => {
      const csv = '1,Dune,="0441172717"';
      expect(parseCsv(csv)).toEqual([['1', 'Dune', '="0441172717"']]);
    });

    it('handles quoted Excel ISBN formula', () => {
      const csv = '1,Dune,"=""0441172717"""';
      expect(parseCsv(csv)).toEqual([['1', 'Dune', '="0441172717"']]);
    });

    it('handles whitespace padding after closing quote', () => {
      const csv = '"Dune" ,Frank Herbert';
      expect(parseCsv(csv)).toEqual([['Dune', 'Frank Herbert']]);
    });

    it('returns empty array on empty input or whitespace only', () => {
      expect(parseCsv('')).toEqual([]);
      expect(parseCsv('   \n\n  ')).toEqual([]);
    });

    it('preserves UTF-8 Turkish diacritics', () => {
      const csv = '"İnce Memed","Yaşar Kemal","Yapı Kredi Yayınları"';
      expect(parseCsv(csv)).toEqual([['İnce Memed', 'Yaşar Kemal', 'Yapı Kredi Yayınları']]);
    });
  });

  describe('parseGoodreadsCsv', () => {
    const STANDARD_HEADER =
      'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with Positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies';

    it('parses standard 24-column Goodreads export header and book row', () => {
      const csv = `${STANDARD_HEADER}\n2767052,The Hunger Games,Suzanne Collins,"Collins, Suzanne",,"=""0439023483""","=""9780439023481""",5,4.32,Scholastic Press,Hardcover,374,2008,2008,2018/10/21,2018/10/15,favorites,favorites (#1),read,"Great book!",false,,1,0`;

      const rows = parseGoodreadsCsv(csv);
      expect(rows.length).toBe(1);

      const row = rows[0];
      expect(row.bookId).toBe('2767052');
      expect(row.title).toBe('The Hunger Games');
      expect(row.author).toBe('Suzanne Collins');
      expect(row.authorLf).toBe('Collins, Suzanne');
      expect(row.myRating).toBe('5');
      expect(row.averageRating).toBe('4.32');
      expect(row.publisher).toBe('Scholastic Press');
      expect(row.binding).toBe('Hardcover');
      expect(row.numberOfPages).toBe('374');
      expect(row.yearPublished).toBe('2008');
      expect(row.dateRead).toBe('2018/10/21');
      expect(row.exclusiveShelf).toBe('read');
      expect(row.myReview).toBe('Great book!');
    });

    it('supports dual-access via camelCase and raw CSV header names', () => {
      const csv = `${STANDARD_HEADER}\n123,Dune,Frank Herbert,"Herbert, Frank",,="0441172717",="9780441172719",5,4.24,Ace,Paperback,412,1965,1965,2023/05/14,2023/05/01,sci-fi,sci-fi (#1),read,"Classic sci-fi",false,,1,0`;

      const rows = parseGoodreadsCsv(csv);
      const row = rows[0];

      // camelCase access
      expect(row.title).toBe('Dune');
      expect(row.author).toBe('Frank Herbert');
      expect(row.isbn13).toBe('9780441172719');
      expect(row.exclusiveShelf).toBe('read');

      // raw header access
      expect(row['Title']).toBe('Dune');
      expect(row['Author']).toBe('Frank Herbert');
      expect(row['ISBN13']).toBe('9780441172719');
      expect(row['Exclusive Shelf']).toBe('read');
    });

    it('automatically unescapes Excel formula notation from ISBN columns', () => {
      const csv = `${STANDARD_HEADER}\n123,Dune,Frank Herbert,"Herbert, Frank",,="0143127748",="9780143127741",5,4.24,Ace,Paperback,412,1965,1965,2023/05/14,2023/05/01,sci-fi,sci-fi (#1),read,"Classic",false,,1,0`;

      const rows = parseGoodreadsCsv(csv);
      const row = rows[0];

      expect(row.isbn).toBe('0143127748');
      expect(row.isbn13).toBe('9780143127741');
      expect(row['ISBN']).toBe('0143127748');
      expect(row['ISBN13']).toBe('9780143127741');
    });

    it('pads truncated rows with empty strings without throwing', () => {
      const csv = `${STANDARD_HEADER}\n123,Short Row Book,Short Author`;

      const rows = parseGoodreadsCsv(csv);
      expect(rows.length).toBe(1);
      const row = rows[0];
      expect(row.bookId).toBe('123');
      expect(row.title).toBe('Short Row Book');
      expect(row.author).toBe('Short Author');
      expect(row.isbn13).toBe('');
      expect(row.exclusiveShelf).toBe('');
    });

    it('preserves legacy pre-2022 extra columns like Recommended For', () => {
      const legacyHeader = `${STANDARD_HEADER},Recommended For,Recommended By`;
      const csv = `${legacyHeader}\n123,Dune,Frank Herbert,"Herbert, Frank",,="0441172717",="9780441172719",5,4.24,Ace,Paperback,412,1965,1965,2023/05/14,2023/05/01,sci-fi,sci-fi (#1),read,"Classic",false,,1,0,Sci-Fi Fans,My Friend`;

      const rows = parseGoodreadsCsv(csv);
      const row = rows[0];
      expect(row['Recommended For']).toBe('Sci-Fi Fans');
      expect(row['recommendedFor']).toBe('Sci-Fi Fans');
      expect(row['Recommended By']).toBe('My Friend');
    });

    it('returns empty array when CSV is empty or has headers only', () => {
      expect(parseGoodreadsCsv('')).toEqual([]);
      expect(parseGoodreadsCsv(STANDARD_HEADER)).toEqual([]);
      expect(parseGoodreadsCsv(`${STANDARD_HEADER}\n`)).toEqual([]);
    });

    it('skips rows where all cells are empty', () => {
      const csv = `${STANDARD_HEADER}\n123,Dune,Frank Herbert,"Herbert, Frank",,="0441172717",="9780441172719",5,4.24,Ace,Paperback,412,1965,1965,2023/05/14,2023/05/01,sci-fi,sci-fi (#1),read,"Classic",false,,1,0\n,,,,,,,,,,,,,,,,,,,,,,,\n`;

      const rows = parseGoodreadsCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].title).toBe('Dune');
    });

    it('handles multiline reviews in Goodreads CSV export', () => {
      const csv = `${STANDARD_HEADER}\n123,Dune,Frank Herbert,"Herbert, Frank",,="0441172717",="9780441172719",5,4.24,Ace,Paperback,412,1965,1965,2023/05/14,2023/05/01,sci-fi,sci-fi (#1),read,"First paragraph of review.<br/><br/>Second paragraph.<spoiler>Paul is the Kwisatz Haderach.</spoiler>",false,,1,0`;

      const rows = parseGoodreadsCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].myReview).toBe(
        'First paragraph of review.<br/><br/>Second paragraph.<spoiler>Paul is the Kwisatz Haderach.</spoiler>'
      );
    });

    it('preserves UTF-8 BOM if present at file start', () => {
      const csv = `\uFEFF${STANDARD_HEADER}\n123,İnce Memed,Yaşar Kemal,"Kemal, Yaşar",,="9750800001",="9789750800009",5,4.50,YKY,Karton Kapak,436,1955,1955,2023/01/10,2023/01/01,klasikler,klasikler (#1),read,"Şaheser bir roman.",false,,1,0`;

      const rows = parseGoodreadsCsv(csv);
      expect(rows.length).toBe(1);
      expect(rows[0].title).toBe('İnce Memed');
      expect(rows[0].author).toBe('Yaşar Kemal');
      expect(rows[0].isbn13).toBe('9789750800009');
    });
  });
});
