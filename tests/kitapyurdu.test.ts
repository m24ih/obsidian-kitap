import { describe, it, expect, beforeEach } from 'vitest';
import { KitapyurduProvider } from '../src/providers/kitapyurdu';
import { loadKitapyurduFixture } from './helpers/fixtureLoader';
import { requestUrl } from 'obsidian';

describe('Kitapyurdu Provider Tests', () => {
  let provider: KitapyurduProvider;

  beforeEach(() => {
    (requestUrl as any).mockReset?.();
    provider = new KitapyurduProvider();
  });

  describe('Tier 1: Feature Coverage — Search Parsing', () => {
    it('parses search results accurately from search_dune.html', async () => {
      const html = loadKitapyurduFixture('search_dune.html');
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: html,
      });

      const results = await provider.search('dune');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(20);

      const first = results[0];
      expect(first.id).toBe('375312');
      expect(first.title).toBe('Dune');
      expect(first.author).toBe('Frank Herbert');
      expect(first.publisher).toBe('İTHAKİ YAYINLARI');
      expect(first.url).toContain('375312');
      // Canonical URL should not contain tracking query params
      expect(first.url).not.toContain('s_token');
      // High-resolution image upgrade (wi:500)
      expect(first.coverUrl).toContain('wi:500');
    });

    it('extracts star rating from product cards', async () => {
      const html = loadKitapyurduFixture('search_dune.html');
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: html,
      });

      const results = await provider.search('dune');
      const first = results[0];
      expect(first.rating).toBeGreaterThanOrEqual(1);
      expect(first.rating).toBeLessThanOrEqual(5);
    });
  });

  describe('Tier 1: Feature Coverage — Standard Book Details', () => {
    it('extracts complete bibliographic metadata for Dune (product_dune_375312.html)', async () => {
      const html = loadKitapyurduFixture('product_dune_375312.html');
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: html,
      });

      const book = await provider.getBookDetails('https://www.kitapyurdu.com/kitap/dune/375312.html');

      expect(book.id).toBe('375312');
      expect(book.title).toBe('Dune');
      expect(book.author).toBe('Frank Herbert');
      expect(book.publisher).toBe('İTHAKİ YAYINLARI');
      expect(book.translator).toBe('Dost Körpe');
      expect(book.isbn).toBe('9786053754794');
      expect(book.pages).toBe(712);
      expect(book.publishDate).toBe('2021-09-08');
      expect(book.coverUrl).toBeDefined();
      expect(book.coverUrl).toContain('kitapyurdu.com');
      expect(book.description).toBeDefined();
      expect(book.description).toContain('Yüzüklerin Efendisi dışında');
      expect(book.rating).toBe(5);
      expect(book.ratingCount).toBeGreaterThan(0);
    });
  });

  describe('Tier 2: Boundary & Corner Cases', () => {
    it('strips punctuation, hyphens, and whitespace from ISBN queries', async () => {
      const html = loadKitapyurduFixture('search_dune.html');
      const mockRequest = (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: html,
      });

      await provider.search('978-605-375-479-4');

      expect(mockRequest).toHaveBeenCalledTimes(1);
      const calledUrl = mockRequest.mock.calls[0][0].url;
      expect(calledUrl).toContain('filter_name=9786053754794');
      expect(calledUrl).not.toContain('-');
    });

    it('returns empty array when search yields 0 matches (search_empty.html)', async () => {
      const html = loadKitapyurduFixture('search_empty.html');
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: html,
      });

      const results = await provider.search('asldkfjalskdfj1234');
      expect(results).toEqual([]);
    });

    it('handles Turkish original books with null/undefined translator (product_kurk_mantolu_569235.html)', async () => {
      const html = loadKitapyurduFixture('product_kurk_mantolu_569235.html');
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: html,
      });

      const book = await provider.getBookDetails('https://www.kitapyurdu.com/kitap/kurk-mantolu-madonna/569235.html');

      expect(book.title).toBe('Kürk Mantolu Madonna');
      expect(book.author).toBe('Sabahattin Ali');
      expect(book.translator).toBeUndefined();
      expect(book.isbn).toBeDefined();
    });

    it('correctly parses multiple co-authors and trims trailing commas (product_uluslarin_dususu_325768.html)', async () => {
      const html = loadKitapyurduFixture('product_uluslarin_dususu_325768.html');
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: html,
      });

      const book = await provider.getBookDetails('https://www.kitapyurdu.com/kitap/uluslarin-dususu/325768.html');

      // Crucial requirement: Co-authors must NOT be truncated to only Daron Acemoğlu
      expect(book.author).toContain('Daron Acemoğlu');
      expect(book.author).toContain('James A. Robinson');
      expect(book.author).not.toContain('Acemoğlu,,');
      expect(book.author).toBe('Daron Acemoğlu, James A. Robinson');
      expect(book.translator).toBe('Solina Silahlı');
    });

    it('correctly aggregates multiple translators from separate DOM items (product_iki_kule_41789.html)', async () => {
      const html = loadKitapyurduFixture('product_iki_kule_41789.html');
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: html,
      });

      const book = await provider.getBookDetails('https://www.kitapyurdu.com/kitap/iki-kule-yuzuklerin-efendisi-2/41789.html');

      expect(book.title).toContain('İki Kule');
      expect(book.author).toContain('Tolkien');
      // Multiple translators aggregated
      expect(book.translator).toContain('Bülent Somay');
      expect(book.translator).toContain('Çiğdem Erkal İpek');
      expect(book.translator).toBe('Bülent Somay, Çiğdem Erkal İpek');
    });

    it('gracefully parses out-of-print titles missing Product schema without throwing (product_veri_yapilari_33028.html)', async () => {
      const html = loadKitapyurduFixture('product_veri_yapilari_33028.html');
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: html,
      });

      const book = await provider.getBookDetails('https://www.kitapyurdu.com/kitap/veri-yapilari-ve-algoritmalar/33028.html');

      expect(book.id).toBe('33028');
      expect(book.title).toContain('Veri Yapıları');
      expect(book.author).toContain('M. Ümit Karakaş');
      expect(book.rating).toBeUndefined();
      expect(book.pages).toBe(290);
    });
  });
});
