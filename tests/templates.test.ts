import { describe, it, expect } from 'vitest';
import { renderBookTemplate, sanitizeFileName, formatQuotes } from '../src/templates/engine';
import { BookMetadata, BookQuote, DEFAULT_NOTE_TEMPLATE } from '../src/types';

describe('Template Engine & Filename Sanitizer Tests', () => {
  const sampleBook: BookMetadata = {
    id: '375312',
    url: 'https://www.kitapyurdu.com/kitap/dune/375312.html',
    title: 'Dune',
    author: 'Frank Herbert',
    publisher: 'İTHAKİ YAYINLARI',
    translator: 'Dost Körpe',
    isbn: '9786053754794',
    pages: 712,
    publishDate: '2021-09-08',
    coverUrl: 'https://img.kitapyurdu.com/v1/getImage/fn:11494736/wi:800/wh:9d3c3c37e',
    description: 'Yüzüklerin Efendisi dışında bu kitapla kıyaslanacak başka bir kitap yok.',
    rating: 5,
    ratingCount: 819,
    binkitapRating: '9.2/10',
    binkitapReadCount: '150 bin',
    binkitapUrl: 'https://1000kitap.com/kitap/dune--123',
    quotes: [
      {
        text: 'Korku katildir.',
        author: 'Frank Herbert',
        page: '15',
        likes: 120,
      },
      {
        text: 'Gözlerimi kapatıp rüzgarı dinledim.',
        author: 'Frank Herbert',
        // Quote without page
      },
    ],
  };

  describe('Tier 1: Feature Coverage — Variable Interpolation', () => {
    it('accurately interpolates all 13 placeholders into note templates', () => {
      const template = `Title: {{title}}
Author: {{author}}
Publisher: {{publisher}}
Translator: {{translator}}
ISBN: {{isbn}}
Pages: {{pages}}
Date: {{publishDate}}
Rating: {{rating}}
1000Kitap: {{binkitapRating}}
ReadCount: {{binkitapReadCount}}
Cover: {{coverUrl}}
Desc: {{description}}
URL: {{url}}
Quotes:
{{quotes}}`;

      const rendered = renderBookTemplate(template, sampleBook);

      expect(rendered).toContain('Title: Dune');
      expect(rendered).toContain('Author: Frank Herbert');
      expect(rendered).toContain('Publisher: İTHAKİ YAYINLARI');
      expect(rendered).toContain('Translator: Dost Körpe');
      expect(rendered).toContain('ISBN: 9786053754794');
      expect(rendered).toContain('Pages: 712');
      expect(rendered).toContain('Date: 2021-09-08');
      expect(rendered).toContain('Rating: 5');
      expect(rendered).toContain('1000Kitap: 9.2/10');
      expect(rendered).toContain('ReadCount: 150 bin');
      expect(rendered).toContain('Cover: https://img.kitapyurdu.com');
      expect(rendered).toContain('Desc: Yüzüklerin Efendisi dışında');
      expect(rendered).toContain('URL: https://www.kitapyurdu.com/kitap/dune/375312.html');
      expect(rendered).toContain('Korku katildir.');
    });

    it('formats quotes as standard Markdown blockquotes with attribution', () => {
      const formatted = formatQuotes(sampleBook.quotes);

      expect(formatted).toContain('> “Korku katildir.”');
      expect(formatted).toContain('— *Frank Herbert*');
      expect(formatted).toContain('s. 15');
      // Second quote without page citation
      expect(formatted).toContain('> “Gözlerimi kapatıp rüzgarı dinledim.”');
      expect(formatted).not.toContain('s. 0');
    });

    it('renders cleanly using DEFAULT_NOTE_TEMPLATE', () => {
      const rendered = renderBookTemplate(DEFAULT_NOTE_TEMPLATE, sampleBook);

      expect(rendered.startsWith('---')).toBe(true);
      expect(rendered).toContain('baslik: "Dune"');
      expect(rendered).toContain('yazar: "Frank Herbert"');
      expect(rendered).toContain('# Dune');
      expect(rendered).toContain('## 1000Kitap Alıntıları');
    });
  });

  describe('Tier 2: Boundary & Corner Cases — Missing & Undefined Fields', () => {
    it('replaces missing optional fields with empty strings instead of "undefined" literals', () => {
      const bookWithMissingFields: BookMetadata = {
        id: '999',
        url: 'https://www.kitapyurdu.com/kitap/test/999.html',
        title: 'Örnek Kitap',
        author: 'Yerli Yazar',
        publisher: 'Kültür Yayınları',
        isbn: '9781234567890',
        // Optional properties omitted
        translator: undefined,
        rating: undefined,
        binkitapRating: undefined,
        quotes: undefined,
      };

      const template = `Translator: {{translator}}, Rating: {{rating}}, 1000K: {{binkitapRating}}, Quotes: {{quotes}}`;
      const rendered = renderBookTemplate(template, bookWithMissingFields);

      expect(rendered).not.toContain('undefined');
      expect(rendered).not.toContain('null');
      expect(rendered).toBe('Translator: , Rating: , 1000K: , Quotes: ');
    });

    it('handles empty quotes array gracefully', () => {
      const formatted = formatQuotes([]);
      expect(formatted).toBe('');
    });
  });

  describe('Tier 3: Filename Sanitizer', () => {
    it('strips all characters illegal in Obsidian and OS paths (\\ / : * ? " < > |)', () => {
      const illegalFilename = 'Dune: Çöl Gezegeni / Cilt 1 *Özel Baskı*? <Harika> | "İthaki"';
      const sanitized = sanitizeFileName(illegalFilename);

      expect(sanitized).not.toMatch(/[\\/:*?"<>|]/);
      expect(sanitized).toBe('Dune - Çöl Gezegeni - Cilt 1 - Özel Baskı - Harika - İthaki');
    });

    it('trims leading, trailing whitespace and control characters', () => {
      const messyFilename = '   \t  Kürk Mantolu Madonna   \n  ';
      const sanitized = sanitizeFileName(messyFilename);
      expect(sanitized).toBe('Kürk Mantolu Madonna');
    });

    it('falls back to default title when sanitized string is completely empty', () => {
      const onlyIllegal = ':/*?"<>|';
      const sanitized = sanitizeFileName(onlyIllegal);
      expect(sanitized.length).toBeGreaterThan(0);
      expect(sanitized).toBe('Kitap Notu');
    });

    it('prefixes every line of multi-line quotes with "> "', () => {
      const multiLineQuotes: BookQuote[] = [
        {
          text: 'Bir iple intihar da edebilirsin salıncak da kurabilirsin.\nHayatın ipleri senin elinde.',
          author: 'Fyodor Dostoyevski',
          page: '0',
        },
      ];
      const formatted = formatQuotes(multiLineQuotes);
      const lines = formatted.split('\n');
      for (const line of lines) {
        expect(line.startsWith('> ')).toBe(true);
      }
      expect(formatted).not.toContain('s. 0');
    });

    it('handles Windows reserved filenames (CON, NUL, COM1, LPT1) safely', () => {
      expect(sanitizeFileName('CON')).toBe('Kitap Notu');
      expect(sanitizeFileName('nul.md')).toBe('Kitap Notu');
      expect(sanitizeFileName('COM1')).toBe('Kitap Notu');
      expect(sanitizeFileName('LPT9')).toBe('Kitap Notu');
    });
  });
});

