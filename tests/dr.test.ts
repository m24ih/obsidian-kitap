import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DrProvider,
  extractStockCode,
  parseDrPersons,
  parseDrAttributes,
  cleanHtml,
  normalizeDrRating,
  formatDrPrice,
  normalizeDrDate,
  isIsbn,
  cleanIsbn,
} from '../src/providers/dr';
import { BookAggregator } from '../src/providers/aggregator';
import { requestUrl } from 'obsidian';
import { SearchResultItem } from '../src/types';

describe('D&R Provider Suite (DrProvider)', () => {
  let provider: DrProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new DrProvider();
  });

  describe('ISBN Utilities', () => {
    it('identifies valid ISBN-10 and ISBN-13 strings with various formatting', () => {
      expect(isIsbn('9786053754794')).toBe(true);
      expect(isIsbn('978-605-375-479-4')).toBe(true);
      expect(isIsbn('978 605 375 479 4')).toBe(true);
      expect(isIsbn('isbn: 978-605-375-479-4')).toBe(true);
      expect(isIsbn('ISBN: 9786053754794')).toBe(true);
      expect(isIsbn('043942089X')).toBe(true);
      expect(isIsbn('0-306-40615-2')).toBe(true);
    });

    it('rejects non-ISBN strings', () => {
      expect(isIsbn('0000000662978')).toBe(false); // D&R stock code
      expect(isIsbn('Dune')).toBe(false);
      expect(isIsbn('')).toBe(false);
      expect(isIsbn('https://www.dr.com.tr/kitap/dune')).toBe(false);
    });

    it('cleans ISBN strings correctly', () => {
      expect(cleanIsbn('978-605-375-479-4')).toBe('9786053754794');
      expect(cleanIsbn('isbn: 0-306-40615-2')).toBe('0306406152');
      expect(cleanIsbn('043942089x')).toBe('043942089X');
    });
  });

  describe('extractStockCode Utility', () => {
    it('extracts direct stock code', () => {
      expect(extractStockCode('0000000662978')).toBe('0000000662978');
      expect(extractStockCode('0001894757001')).toBe('0001894757001');
    });

    it('extracts stock code from urunno URL parameter', () => {
      const url =
        'https://www.dr.com.tr/Kitap/Dune/Frank-Herbert/Edebiyat/Bilim-Kurgu/urunno=0000000662978';
      expect(extractStockCode(url)).toBe('0000000662978');
    });

    it('extracts stock code from query string urunno', () => {
      const url = 'https://www.dr.com.tr/kitap/detay?urunno=0001894757001&ref=search';
      expect(extractStockCode(url)).toBe('0001894757001');
    });

    it('extracts stock code from CDN originals image URL', () => {
      const cdnUrl =
        'https://i.dr.com.tr/cache/600x600-0/originals/0000000662978-1.jpg';
      expect(extractStockCode(cdnUrl)).toBe('0000000662978');
    });

    it('extracts stock code from /urun/ path', () => {
      const pathUrl = 'https://www.dr.com.tr/kitap/urun/0000000662978';
      expect(extractStockCode(pathUrl)).toBe('0000000662978');
    });

    it('extracts stock code from modern slug -k- format and -digits format', () => {
      expect(extractStockCode('https://www.dr.com.tr/kitap/dune-k-0000000662978')).toBe('0000000662978');
      expect(extractStockCode('https://www.dr.com.tr/dune-k-0000000662978')).toBe('0000000662978');
      expect(extractStockCode('https://www.dr.com.tr/kitap/dune-0000000662978')).toBe('0000000662978');
      expect(extractStockCode('https://www.dr.com.tr/kitap/dune-k-0000000662978.html')).toBe('0000000662978');
    });

    it('extracts stock code from .html path', () => {
      const htmlUrl = 'https://www.dr.com.tr/kitap/0000000662978.html';
      expect(extractStockCode(htmlUrl)).toBe('0000000662978');
    });

    it('returns empty string for empty input', () => {
      expect(extractStockCode('')).toBe('');
      expect(extractStockCode('   ')).toBe('');
    });
  });

  describe('parseDrPersons Utility', () => {
    it('parses authors and translators from Person array', () => {
      const raw = {
        Person: [
          { Group: 'Yazar', GroupCode: 1, FullName: 'Frank Herbert' },
          { Group: 'Çevirmen', GroupCode: 2, FullName: 'Dost Körpe' },
        ],
      };
      const result = parseDrPersons(raw);
      expect(result.authors).toEqual(['Frank Herbert']);
      expect(result.translators).toEqual(['Dost Körpe']);
    });

    it('parses multiple authors and translators with various casing and string GroupCodes', () => {
      const raw = [
        { Group: 'yazar', Name: 'Yazar Bir' },
        { GroupCode: '1' as any, PersonName: 'Yazar İki' },
        { Group: 'CEVIRMEN', Name: 'Çevirmen Bir' },
        { GroupCode: '2' as any, FullName: 'Çevirmen İki' },
      ];
      const result = parseDrPersons(raw);
      expect(result.authors).toEqual(['Yazar Bir', 'Yazar İki']);
      expect(result.translators).toEqual(['Çevirmen Bir', 'Çevirmen İki']);
    });

    it('handles single Person object gracefully', () => {
      const raw = {
        Person: { Group: 'Yazar', FullName: 'Tek Yazar' },
      };
      const result = parseDrPersons(raw);
      expect(result.authors).toEqual(['Tek Yazar']);
      expect(result.translators).toEqual([]);
    });

    it('handles Persons wrapper gracefully', () => {
      const raw = {
        Persons: [{ Group: 'Yazar', FullName: 'Sarmal Yazar' }],
      };
      const result = parseDrPersons(raw);
      expect(result.authors).toEqual(['Sarmal Yazar']);
    });

    it('deduplicates persons in list', () => {
      const raw = [
        { GroupCode: 1, Name: 'Aynı Yazar' },
        { GroupCode: 1, Name: 'Aynı Yazar' },
      ];
      const result = parseDrPersons(raw);
      expect(result.authors).toEqual(['Aynı Yazar']);
    });

    it('defaults to author when group is not specified', () => {
      const raw = [{ FullName: 'Bilinmeyen Rol' }];
      const result = parseDrPersons(raw);
      expect(result.authors).toEqual(['Bilinmeyen Rol']);
    });

    it('handles null and undefined gracefully', () => {
      expect(parseDrPersons(null)).toEqual({ authors: [], translators: [] });
      expect(parseDrPersons(undefined)).toEqual({ authors: [], translators: [] });
    });
  });

  describe('parseDrAttributes Utility', () => {
    it('extracts technical specifications correctly', () => {
      const attrs = [
        { Name: 'Sayfa Sayısı', Value: '712 Sayfa' },
        { Name: 'Dil', Value: 'Türkçe' },
        { Name: 'İlk Baskı Yılı', Value: '2021' },
        { Name: 'Medya Cinsi', Value: 'Ciltsiz' },
        { Name: 'Kağıt Cinsi', Value: '2. Hamur' },
        { Name: 'Ebat', Value: '13,5 x 21' },
        { Name: 'Baskı Sayısı', Value: '15. Baskı' },
        { Name: 'Orijinal Adı', Value: 'Dune' },
        { Name: 'Tür', Value: 'Bilim Kurgu > Edebiyat' },
        { Name: 'Barkod', Value: '9786053754794' },
      ];

      const parsed = parseDrAttributes(attrs);
      expect(parsed.pages).toBe(712);
      expect(parsed.language).toBe('Türkçe');
      expect(parsed.publishDate).toBe('2021');
      expect(parsed.format).toBe('Ciltsiz');
      expect(parsed.paperType).toBe('2. Hamur');
      expect(parsed.dimensions).toBe('13,5 x 21');
      expect(parsed.edition).toBe('15. Baskı');
      expect(parsed.originalTitle).toBe('Dune');
      expect(parsed.genres).toEqual(['Bilim Kurgu', 'Edebiyat']);
      expect(parsed.isbn).toBe('9786053754794');
    });

    it('extracts attributes from SpecificationAttributeName structure', () => {
      const specs = [
        { SpecificationAttributeName: 'Sayfa Sayısı', Value: '840' },
        { SpecificationAttributeName: 'Cilt Tipi', Value: 'Ciltli' },
        { SpecificationAttributeName: 'Basım Yılı', Value: '2023-05-10' },
      ];

      const parsed = parseDrAttributes(specs);
      expect(parsed.pages).toBe(840);
      expect(parsed.format).toBe('Ciltli');
      expect(parsed.publishDate).toBe('2023-05-10');
    });

    it('safely handles non-array or empty inputs', () => {
      expect(parseDrAttributes(undefined)).toEqual({});
      expect(parseDrAttributes([])).toEqual({});
    });
  });

  describe('cleanHtml & Formatting Utilities', () => {
    it('cleans HTML tags and entities from description', () => {
      const html = '<p>Dune efsanesi devam ediyor.<br>Bu bir &quot;başyapıt&quot;tır &amp; klasiktir.</p>';
      const cleaned = cleanHtml(html);
      expect(cleaned).toContain('Dune efsanesi devam ediyor.');
      expect(cleaned).toContain('Bu bir "başyapıt"tır & klasiktir.');
      expect(cleaned).not.toContain('<p>');
      expect(cleaned).not.toContain('<br>');
    });

    it('strips script and style tags completely', () => {
      const html = '<script>alert("hack");</script><style>body { color: red; }</style><p>Temiz Metin</p>';
      const cleaned = cleanHtml(html);
      expect(cleaned).toBe('Temiz Metin');
      expect(cleaned).not.toContain('alert');
      expect(cleaned).not.toContain('body {');
    });

    it('normalizes ratings from 10-scale to 5-scale', () => {
      expect(normalizeDrRating(9.6)).toBe(4.8);
      expect(normalizeDrRating(10)).toBe(5.0);
      expect(normalizeDrRating(8.5)).toBe(4.3);
      expect(normalizeDrRating('7,4')).toBe(3.7);
      expect(normalizeDrRating(0)).toBeUndefined();
      expect(normalizeDrRating(undefined)).toBeUndefined();
    });

    it('formats price correctly with TL in locale-independent way', () => {
      expect(formatDrPrice(145.5)).toBe('145,50 TL');
      expect(formatDrPrice('220')).toBe('220,00 TL');
      expect(formatDrPrice('180,00 TL')).toBe('180,00 TL');
      expect(formatDrPrice(1250.75)).toBe('1.250,75 TL');
      expect(formatDrPrice(undefined)).toBeUndefined();
    });

    it('normalizes date formats including ISO datetime with timestamps', () => {
      expect(normalizeDrDate('15.09.2021')).toBe('2021-09-15');
      expect(normalizeDrDate('15/09/2021')).toBe('2021-09-15');
      expect(normalizeDrDate('2021-09-15')).toBe('2021-09-15');
      expect(normalizeDrDate('2021-09-15T00:00:00')).toBe('2021-09-15');
      expect(normalizeDrDate('2021')).toBe('2021');
    });
  });

  describe('DrProvider.search', () => {
    it('sends correct POST request and parses product search results', async () => {
      const mockApiResponse = {
        Result: {
          Products: [
            {
              StockCode: '0000000662978',
              Barcode: '9786053754794',
              Name: 'Dune',
              Manufacturer: 'İthaki Yayınları',
              Price: 245.0,
              Rating: 9.6,
              RatingCount: 520,
              Persons: {
                Person: [
                  { Group: 'Yazar', GroupCode: 1, FullName: 'Frank Herbert' },
                  { Group: 'Çevirmen', GroupCode: 2, FullName: 'Dost Körpe' },
                ],
              },
              Attributes: [
                { Name: 'Sayfa Sayısı', Value: '712' },
                { Name: 'Dil', Value: 'Türkçe' },
              ],
              Url: '/kitap/dune/frank-herbert/urunno=0000000662978',
            },
          ],
        },
      };

      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json: mockApiResponse,
      });

      const results = await provider.search('dune');

      expect(requestUrl).toHaveBeenCalledTimes(1);
      const requestArg = (requestUrl as any).mock.calls[0][0];
      expect(requestArg.url).toBe('https://www.dr.com.tr/Catalog/AsyncSearch');
      expect(requestArg.method).toBe('POST');
      expect(JSON.parse(requestArg.body)).toMatchObject({
        Q: 'dune',
        Page: 1,
        PageSize: 20,
        CategoryId: 10001,
      });

      expect(results).toHaveLength(1);
      const book = results[0];
      expect(book.id).toBe('0000000662978');
      expect(book.title).toBe('Dune');
      expect(book.author).toBe('Frank Herbert');
      expect(book.publisher).toBe('İthaki Yayınları');
      expect(book.coverUrl).toBe(
        'https://i.dr.com.tr/cache/600x600-0/originals/0000000662978-1.jpg'
      );
      expect(book.url).toBe(
        'https://www.dr.com.tr/kitap/dune/frank-herbert/urunno=0000000662978'
      );
      expect(book.rating).toBe(4.8);
      expect(book.provider).toBe('dr');
    });

    it('normalizes formatted ISBN in search query', async () => {
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json: { Result: { Products: [] } },
      });

      await provider.search('978-605-375-479-4');

      const requestArg = (requestUrl as any).mock.calls[0][0];
      expect(JSON.parse(requestArg.body).Q).toBe('9786053754794');
    });

    it('returns empty array when query is empty', async () => {
      const results = await provider.search('   ');
      expect(results).toEqual([]);
      expect(requestUrl).not.toHaveBeenCalled();
    });

    it('gracefully handles network errors in search', async () => {
      (requestUrl as any).mockRejectedValueOnce(new Error('Network offline'));
      const results = await provider.search('dune');
      expect(results).toEqual([]);
    });
  });

  describe('DrProvider.getBookDetails', () => {
    it('fetches details and merges search cached metadata with AsyncProductDetails', async () => {
      // 1. Initial search
      const mockSearchResponse = {
        Result: {
          Products: [
            {
              StockCode: '0000000662978',
              Barcode: '9786053754794',
              Name: 'Dune',
              Manufacturer: 'İthaki Yayınları',
              Price: 245.0,
              Rating: 9.6,
              RatingCount: 520,
              Persons: {
                Person: [
                  { Group: 'Yazar', GroupCode: 1, FullName: 'Frank Herbert' },
                  { Group: 'Çevirmen', GroupCode: 2, FullName: 'Dost Körpe' },
                ],
              },
              Attributes: [
                { Name: 'Sayfa Sayısı', Value: '712' },
                { Name: 'Dil', Value: 'Türkçe' },
                { Name: 'İlk Baskı Yılı', Value: '2021' },
              ],
              Url: '/kitap/dune/frank-herbert/urunno=0000000662978',
            },
          ],
        },
      };

      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json: mockSearchResponse,
      });

      await provider.search('dune');

      // 2. Product details response
      const mockDetailsResponse = {
        data: {
          FullDescription:
            '<p>Modern edebiyatın en büyük bilimkurgu destanlarından biri.</p>',
          ProductSpecifications: [
            { SpecificationAttributeName: 'Kağıt Cinsi', Value: '2. Hamur' },
            { SpecificationAttributeName: 'Cilt Tipi', Value: 'Ciltsiz' },
            { SpecificationAttributeName: 'Ebat', Value: '13,5 x 21' },
          ],
        },
      };

      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json: mockDetailsResponse,
      });

      const details = await provider.getBookDetails(
        'https://www.dr.com.tr/kitap/dune/frank-herbert/urunno=0000000662978'
      );

      expect(details.id).toBe('0000000662978');
      expect(details.title).toBe('Dune');
      expect(details.author).toBe('Frank Herbert');
      expect(details.publisher).toBe('İthaki Yayınları');
      expect(details.translator).toBe('Dost Körpe');
      expect(details.isbn).toBe('9786053754794');
      expect(details.pages).toBe(712);
      expect(details.language).toBe('Türkçe');
      expect(details.format).toBe('Ciltsiz');
      expect(details.publishDate).toBe('2021');
      expect(details.description).toBe(
        'Modern edebiyatın en büyük bilimkurgu destanlarından biri.'
      );
      expect(details.coverUrl).toBe(
        'https://i.dr.com.tr/cache/600x600-0/originals/0000000662978-1.jpg'
      );
      expect(details.rating).toBe(4.8);
      expect(details.ratingCount).toBe(520);
      expect(details.price).toBe('245,00 TL');
      expect(details.provider).toBe('dr');
    });

    it('fetches full metadata on DIRECT URL query without prior search', async () => {
      // Direct call with URL where details response does NOT contain Barcode, Rating, or Attributes
      const mockDetailsResponse = {
        data: {
          ProductName: 'Dune',
          FullDescription: '<p>Destan.</p>',
          ProductSpecifications: [{ Name: 'Medya Cinsi', Value: 'Ciltsiz' }],
          ProductPersons: [{ GroupCode: 1, FullName: 'Frank Herbert' }],
        },
      };

      const mockSearchResponse = {
        Result: {
          Products: [
            {
              StockCode: '0000000662978',
              Barcode: '9786053754794',
              Name: 'Dune',
              Manufacturer: 'İthaki Yayınları',
              Price: 245.0,
              Rating: 9.6,
              Attributes: [
                { Name: 'Sayfa Sayısı', Value: '712' },
                { Name: 'Dil', Value: 'Türkçe' },
                { Name: 'İlk Baskı Yılı', Value: '2021' },
              ],
            },
          ],
        },
      };

      (requestUrl as any)
        .mockResolvedValueOnce({ status: 200, json: mockDetailsResponse }) // AsyncProductDetails
        .mockResolvedValueOnce({ status: 200, json: mockSearchResponse });  // Catalog/AsyncSearch fallback

      const details = await provider.getBookDetails('https://www.dr.com.tr/kitap/dune-k-0000000662978');

      expect(details.id).toBe('0000000662978');
      expect(details.title).toBe('Dune');
      expect(details.isbn).toBe('9786053754794');
      expect(details.publisher).toBe('İthaki Yayınları');
      expect(details.pages).toBe(712);
      expect(details.language).toBe('Türkçe');
      expect(details.publishDate).toBe('2021');
      expect(details.price).toBe('245,00 TL');
      expect(details.rating).toBe(4.8);
    });

    it('resolves book details when queried with a formatted ISBN directly', async () => {
      // Direct call with formatted ISBN: provider normalizes and searches to get StockCode
      const mockSearchResponse = {
        Result: {
          Products: [
            {
              StockCode: '0000000662978',
              Barcode: '9786053754794',
              Name: 'Dune',
              Manufacturer: 'İthaki Yayınları',
              Persons: {
                Person: [{ GroupCode: 1, FullName: 'Frank Herbert' }],
              },
            },
          ],
        },
      };

      const mockDetailsResponse = {
        data: {
          FullDescription: '<p>Çöl gezegeni Arrakis...</p>',
          ProductSpecifications: [{ Name: 'Sayfa Sayısı', Value: '712' }],
        },
      };

      (requestUrl as any)
        .mockResolvedValueOnce({ status: 200, json: mockSearchResponse })
        .mockResolvedValueOnce({ status: 200, json: mockDetailsResponse });

      const details = await provider.getBookDetails('isbn: 978-605-375-479-4');
      expect(details.id).toBe('0000000662978');
      expect(details.title).toBe('Dune');
      expect(details.isbn).toBe('9786053754794');
      expect(details.pages).toBe(712);
      expect(details.description).toBe('Çöl gezegeni Arrakis...');
    });

    it('throws error when ISBN search yields no results', async () => {
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json: { Result: { Products: [] } },
      });

      await expect(provider.getBookDetails('978-000-000-000-0')).rejects.toThrow(
        /bu ISBN ile kitap bulunamadı/
      );
    });

    it('throws error when input is invalid or yields empty metadata', async () => {
      await expect(provider.getBookDetails('')).rejects.toThrow(/Geçersiz D&R kitap bağlantısı/);
    });
  });

  describe('Integration with BookAggregator', () => {
    it('registers both Kitapyurdu and D&R by default in BookAggregator', () => {
      const aggregator = new BookAggregator();
      const providers = aggregator.getAvailableProviders();
      expect(providers).toHaveLength(2);
      expect(providers.map((p) => p.id)).toEqual(['kitapyurdu', 'dr']);
    });

    it('routes search to D&R when providerId is dr', async () => {
      const aggregator = new BookAggregator();

      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json: {
          Result: {
            Products: [
              {
                StockCode: '0001234567890',
                Name: 'Vakıf',
                Manufacturer: 'İthaki',
                Persons: {
                  Person: [{ GroupCode: 1, FullName: 'Isaac Asimov' }],
                },
              },
            ],
          },
        },
      });

      const results = await aggregator.search('vakıf', 'dr');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Vakıf');
      expect(results[0].provider).toBe('dr');
    });

    it('routes getFullBookData to D&R provider when item provider is dr', async () => {
      const aggregator = new BookAggregator();

      const searchItem: SearchResultItem = {
        id: '0001234567890',
        title: 'Vakıf',
        author: 'Isaac Asimov',
        publisher: 'İthaki',
        url: 'https://www.dr.com.tr/kitap/vakif-k-0001234567890',
        coverUrl: '',
        provider: 'dr',
      };

      (requestUrl as any)
        .mockResolvedValueOnce({
          status: 200,
          json: {
            data: {
              ProductName: 'Vakıf',
              Barcode: '9789756902783',
              PublisherName: 'İthaki',
              FullDescription: '<p>Galaktik İmparatorluk çöküyor.</p>',
              ProductSpecifications: [{ Name: 'Sayfa Sayısı', Value: '256' }],
              ProductPersons: [{ GroupCode: 1, FullName: 'Isaac Asimov' }],
            },
          },
        })
        .mockResolvedValueOnce({
          status: 200,
          json: {
            Result: {
              Products: [
                {
                  StockCode: '0001234567890',
                  Barcode: '9789756902783',
                  Name: 'Vakıf',
                  Manufacturer: 'İthaki',
                  Attributes: [{ Name: 'Dil', Value: 'Türkçe' }],
                },
              ],
            },
          },
        });

      const fullBook = await aggregator.getFullBookData(searchItem);
      expect(fullBook.title).toBe('Vakıf');
      expect(fullBook.author).toBe('Isaac Asimov');
      expect(fullBook.isbn).toBe('9789756902783');
      expect(fullBook.pages).toBe(256);
      expect(fullBook.description).toBe('Galaktik İmparatorluk çöküyor.');
      expect(fullBook.provider).toBe('dr');
    });
  });
});
