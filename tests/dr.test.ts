import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DrProvider,
  extractStockCode,
  parseDrPersons,
  parseDrAttributes,
  extractGenresFromDrUrl,
  cleanHtml,
  normalizeDrRating,
  formatDrPrice,
  normalizeDrDate,
  isIsbn,
  cleanIsbn,
} from '../src/providers/dr';
import { BookAggregator } from '../src/providers/aggregator';
import { buildBookNoteContent } from '../src/templates/noteBuilder';
import { DEFAULT_SETTINGS } from '../src/types';
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

    it('correctly handles Ben Robot D&R payload with PersonGroupName and GroupNameCode', () => {
      const benRobotPersons = [
        { PersonGroupName: 'Yazar', GroupNameCode: '1', FullName: 'Isaac Asimov' },
        { PersonGroupName: 'Çevirmen', GroupNameCode: '2', FullName: 'Ekin Odabaş' },
        { PersonGroupName: 'Dizi Editörü', GroupNameCode: '68', FullName: 'Tuğçe Nida Sevin' },
        { PersonGroupName: 'Yayın Koordinatörü', GroupNameCode: '1622', FullName: 'Saygı Ortanca' },
        { PersonGroupName: 'Kapak Tasarımı', GroupNameCode: '66', FullName: 'Şükrü Karakoç' },
        { PersonGroupName: 'Grafik Tasarım', GroupNameCode: '67', FullName: 'Emre Aygün' },
      ];
      const result = parseDrPersons(benRobotPersons);
      expect(result.authors).toEqual(['Isaac Asimov']);
      expect(result.translators).toEqual(['Ekin Odabaş']);
    });

    it('never treats editors, coordinators, proofreaders, or designers as authors', () => {
      const variousRoles = [
        { PersonGroupName: 'Editör', FullName: 'Ali Editör' },
        { PersonGroupName: 'Kapak', FullName: 'Veli Tasarim' },
        { PersonGroupName: 'Son Okuma', FullName: 'Ayşe Kontrol' },
        { PersonGroupName: 'Redaksiyon', FullName: 'Fatma Düzelti' },
        { Role: 'Yayın Koordinatörü', FullName: 'Hasan Koordinatör' },
        { Duty: 'İllüstratör', FullName: 'Mehmet Çizer' },
      ];
      const result = parseDrPersons(variousRoles);
      expect(result.authors).toEqual([]);
      expect(result.translators).toEqual([]);
    });

    it('handles null and undefined gracefully', () => {
      expect(parseDrPersons(null)).toEqual({ authors: [], translators: [] });
      expect(parseDrPersons(undefined)).toEqual({ authors: [], translators: [] });
    });

    it('correctly handles uppercase Turkish characters and executive editorial roles', () => {
      const persons = [
        { PersonGroupName: 'YAZAR', FullName: 'Orhan Pamuk' },
        { PersonGroupName: 'ÇEVİRMEN', FullName: 'Can Belge' },
        { PersonGroupName: 'GENEL YAYIN YÖNETMENİ', FullName: 'Ahmet Yönetici' },
        { PersonGroupName: 'DİZGİ', FullName: 'Mehmet Dizgici' },
      ];
      const result = parseDrPersons(persons);
      expect(result.authors).toEqual(['Orhan Pamuk']);
      expect(result.translators).toEqual(['Can Belge']);
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

    it('extracts attributes from Ben Robot actual ProductSpecifications using ValueRaw', () => {
      const benRobotSpecs = [
        { SpecificationAttributeName: 'Dil', ValueRaw: 'Türkçe' },
        { SpecificationAttributeName: 'İlk Baskı Yılı', ValueRaw: '2016' },
        { SpecificationAttributeName: 'Medya Cinsi', ValueRaw: 'Ciltsiz' },
        { SpecificationAttributeName: 'Baskı Sayısı', ValueRaw: '10. Baskı' },
        { SpecificationAttributeName: 'Ebat', ValueRaw: '13,5 x 21' },
        { SpecificationAttributeName: 'Kağıt Cinsi', ValueRaw: '2. Hamur' },
        { SpecificationAttributeName: 'Orijinal Adı', ValueRaw: 'I, Robot' },
      ];

      const parsed = parseDrAttributes(benRobotSpecs);
      expect(parsed.language).toBe('Türkçe');
      expect(parsed.publishDate).toBe('2016');
      expect(parsed.format).toBe('Ciltsiz');
      expect(parsed.edition).toBe('10. Baskı');
      expect(parsed.dimensions).toBe('13,5 x 21');
      expect(parsed.paperType).toBe('2. Hamur');
      expect(parsed.originalTitle).toBe('I, Robot');
    });

    it('extracts attributes from D&R search Attributes structure using Text and Option.ValueText', () => {
      const searchAttrs = [
        { Text: 'Medya Cinsi', Option: { ValueText: 'Ciltsiz' } },
        { Text: 'Dil', Option: { ValueText: 'Türkçe' } },
        { Text: 'İlk Baskı Yılı', Option: { ValueText: '2016' } },
        { Text: 'Sayfa Sayısı', Option: { ValueText: '350' } },
      ];

      const parsed = parseDrAttributes(searchAttrs);
      expect(parsed.format).toBe('Ciltsiz');
      expect(parsed.language).toBe('Türkçe');
      expect(parsed.publishDate).toBe('2016');
      expect(parsed.pages).toBe(350);
    });

    it('correctly handles uppercase Turkish attribute names with İ and I', () => {
      const uppercaseAttrs = [
        { SpecificationAttributeName: 'DİLİ', ValueRaw: 'Türkçe' },
        { SpecificationAttributeName: 'İLK BASKI YILI', ValueRaw: '2016' },
        { SpecificationAttributeName: 'MEDYA CİNSİ', ValueRaw: 'Ciltsiz' },
        { SpecificationAttributeName: 'SAYFA SAYISI', ValueRaw: '420' },
        { SpecificationAttributeName: 'ORİJİNAL ADI', ValueRaw: 'Foundation' },
        { SpecificationAttributeName: 'BASKI SAYISI', ValueRaw: '5. Baskı' },
      ];
      const parsed = parseDrAttributes(uppercaseAttrs);
      expect(parsed.language).toBe('Türkçe');
      expect(parsed.publishDate).toBe('2016');
      expect(parsed.format).toBe('Ciltsiz');
      expect(parsed.pages).toBe(420);
      expect(parsed.originalTitle).toBe('Foundation');
      expect(parsed.edition).toBe('5. Baskı');
    });

    it('safely handles non-array or empty inputs', () => {
      expect(parseDrAttributes(undefined)).toEqual({});
      expect(parseDrAttributes([])).toEqual({});
    });
  });

  describe('extractGenresFromDrUrl Utility', () => {
    it('extracts categories from standard D&R URL path segments', () => {
      const url =
        'https://www.dr.com.tr/Kitap/Ben-Robot/Edebiyat/Roman/Bilim-Kurgu/urunno=0000000373808';
      const genres = extractGenresFromDrUrl(url, 'Ben Robot', 'Isaac Asimov');
      expect(genres).toEqual(['Edebiyat', 'Roman', 'Bilim Kurgu']);
    });

    it('filters out author segment when present in URL', () => {
      const url =
        'https://www.dr.com.tr/Kitap/Dune/Frank-Herbert/Edebiyat/Bilim-Kurgu/urunno=0000000662978';
      const genres = extractGenresFromDrUrl(url, 'Dune', 'Frank Herbert');
      expect(genres).toEqual(['Edebiyat', 'Bilim Kurgu']);
    });

    it('filters out author with middle name and decodes URL percent-encoding', () => {
      const url =
        'https://www.dr.com.tr/Kitap/Suc-ve-Ceza/Fyodor-Mihaylovic-Dostoyevski/Edebiyat/%C3%87ocuk-Kitaplar%C4%B1/urunno=0000000063853';
      const genres = extractGenresFromDrUrl(url, 'Suç ve Ceza (Özel Cilt)', 'Fyodor Dostoyevski');
      expect(genres).toEqual(['Edebiyat', 'Çocuk Kitapları']);
    });

    it('strips query parameters and anchors cleanly', () => {
      const url =
        '/Kitap/Vakif/Isaac-Asimov/Edebiyat/Bilim-Kurgu/urunno=0000000063853?ref=search#details';
      const genres = extractGenresFromDrUrl(url, 'Vakıf', 'Isaac Asimov');
      expect(genres).toEqual(['Edebiyat', 'Bilim Kurgu']);
    });

    it('returns empty array when no categories are in modern slug URL', () => {
      const url = 'https://www.dr.com.tr/kitap/dune-k-0000000662978';
      const genres = extractGenresFromDrUrl(url, 'Dune', 'Frank Herbert');
      expect(genres).toEqual([]);
    });

    it('handles empty or non-string inputs safely', () => {
      expect(extractGenresFromDrUrl('')).toEqual([]);
      expect(extractGenresFromDrUrl(undefined)).toEqual([]);
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

    it('accurately resolves Ben Robot end-to-end with real D&R payload structure', async () => {
      const mockDetailsResponse = {
        data: {
          ProductName: 'Ben Robot',
          Barcode: '9786053756200',
          PublisherName: 'İthaki Yayınları',
          FullDescription: '<p>2058 yılında Susan Calvin emekli olurken...</p>',
          Url: '/Kitap/Ben-Robot/Edebiyat/Roman/Bilim-Kurgu/urunno=0000000373808',
          Rating: 8.0,
          ProductSpecifications: [
            { SpecificationAttributeName: 'Dil', ValueRaw: 'Türkçe' },
            { SpecificationAttributeName: 'İlk Baskı Yılı', ValueRaw: '2016' },
            { SpecificationAttributeName: 'Medya Cinsi', ValueRaw: 'Ciltsiz' },
            { SpecificationAttributeName: 'Baskı Sayısı', ValueRaw: '10. Baskı' },
            { SpecificationAttributeName: 'Ebat', ValueRaw: '13,5 x 21' },
            { SpecificationAttributeName: 'Kağıt Cinsi', ValueRaw: '2. Hamur' },
            { SpecificationAttributeName: 'Orijinal Adı', ValueRaw: 'I, Robot' },
          ],
          ProductPersons: [
            { PersonGroupName: 'Yazar', GroupNameCode: '1', FullName: 'Isaac Asimov' },
            { PersonGroupName: 'Çevirmen', GroupNameCode: '2', FullName: 'Ekin Odabaş' },
            { PersonGroupName: 'Dizi Editörü', GroupNameCode: '68', FullName: 'Tuğçe Nida Sevin' },
            { PersonGroupName: 'Yayın Koordinatörü', GroupNameCode: '1622', FullName: 'Saygı Ortanca' },
            { PersonGroupName: 'Kapak Tasarımı', GroupNameCode: '66', FullName: 'Şükrü Karakoç' },
            { PersonGroupName: 'Grafik Tasarım', GroupNameCode: '67', FullName: 'Emre Aygün' },
          ],
        },
      };

      const mockSearchResponse = {
        Result: {
          Products: [
            {
              StockCode: '0000000373808',
              Barcode: '9786053756200',
              Name: 'Ben Robot',
              Manufacturer: 'İthaki Yayınları',
              Price: 195.0,
              Rating: 8.0,
            },
          ],
        },
      };

      (requestUrl as any)
        .mockResolvedValueOnce({
          status: 200,
          json: mockDetailsResponse,
        })
        .mockResolvedValueOnce({
          status: 200,
          json: mockSearchResponse,
        });

      const book = await provider.getBookDetails(
        'https://www.dr.com.tr/Kitap/Ben-Robot/Edebiyat/Roman/Bilim-Kurgu/urunno=0000000373808'
      );

      expect(book.title).toBe('Ben Robot');
      expect(book.author).toBe('Isaac Asimov');
      expect(book.translator).toBe('Ekin Odabaş');
      expect(book.publisher).toBe('İthaki Yayınları');
      expect(book.isbn).toBe('9786053756200');
      expect(book.language).toBe('Türkçe');
      expect(book.publishDate).toBe('2016');
      expect(book.format).toBe('Ciltsiz');
      expect(book.originalTitle).toBe('I, Robot');
      expect(book.genres).toEqual(['Edebiyat', 'Roman', 'Bilim Kurgu']);
      expect(book.rating).toBe(4.0);
      expect(book.provider).toBe('dr');

      // Check note building: frontmatter should contain puan: 4 and NOT puan_kitapyurdu: 4
      const noteContent = await buildBookNoteContent({
        book,
        settings: DEFAULT_SETTINGS,
      });

      expect(noteContent).toContain('puan: 4');
      expect(noteContent).not.toContain('puan_kitapyurdu:');
      expect(noteContent).toContain('dil: "Türkçe"');
      expect(noteContent).toContain('yayin_tarihi: "2016"');
      expect(noteContent).toContain('format: "Ciltsiz"');
      expect(noteContent).toContain('orijinal_baslik: "I, Robot"');
      expect(noteContent).toContain('yazar: "Isaac Asimov"');
      expect(noteContent).toContain('cevirmen: "Ekin Odabaş"');
    });
  });
});
