import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BinkitapProvider } from '../src/providers/binkitap';
import { load1000KitapFixture, load1000KitapJsonFixture } from './helpers/fixtureLoader';
import { requestUrl } from 'obsidian';

describe('1000Kitap Provider Tests', () => {
  let provider: BinkitapProvider;

  beforeEach(() => {
    (requestUrl as any).mockReset?.();
    provider = new BinkitapProvider();
  });

  describe('Tier 1: Feature Coverage — Search & Payload Parsing', () => {
    it('parses search results from __NEXT_DATA__ payload (1000kitap_search_suc_ve_ceza.html)', async () => {
      const html = load1000KitapFixture('1000kitap_search_suc_ve_ceza.html');
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: html,
      });

      const results = await provider.search('suc ve ceza');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(1);

      const first = results[0];
      expect(first.id).toBe('121');
      expect(first.title).toBe('Suç ve Ceza');
      expect(first.author).toContain('Dostoyevski');
      expect(first.url).toContain('/kitap/suc-ve-ceza--121');
    });

    it('falls back to HTML DOM search cards when __NEXT_DATA__ script is stripped', async () => {
      let html = load1000KitapFixture('1000kitap_search_suc_ve_ceza.html');
      // Strip __NEXT_DATA__
      html = html.replace(/<script id="__NEXT_DATA__"[\s\S]*?<\/script>/, '');

      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: html,
      });

      const results = await provider.search('suc ve ceza');

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].title).toBe('Suç ve Ceza');
      expect(results[0].url).toContain('121');
    });

    it('extracts rating and read counts from book detail page (1000kitap_book_kurk_mantolu_madonna.html)', async () => {
      const html = load1000KitapFixture('1000kitap_book_kurk_mantolu_madonna.html');
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: html,
      });

      const details = await provider.getBookDetails('https://1000kitap.com/kitap/kurk-mantolu-madonna--557');

      expect(details.binkitapRating).toBeDefined();
      expect(details.binkitapRating).toMatch(/9(\.2)?(\/10)?/);
      expect(details.binkitapReadCount).toBeDefined();
    });

    it('extracts community quotes from HTML quotes page (1000kitap_quotes_kurk_mantolu_madonna.html)', async () => {
      const html = load1000KitapFixture('1000kitap_quotes_kurk_mantolu_madonna.html');
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: html,
      });

      const quotes = await provider.getQuotes('https://1000kitap.com/kitap/kurk-mantolu-madonna--557/alintilar', 5);

      expect(Array.isArray(quotes)).toBe(true);
      expect(quotes.length).toBe(3);
      expect(quotes[0].text).toContain('İnsanın en büyük hatası');
      expect(quotes[0].author).toBe('Sabahattin Ali');
      expect(quotes[0].page).toBe('64');
    });

    it('extracts rating and reader stats from direct mobile API (1000kitap_api_kitap_cek_121.json)', async () => {
      const json = load1000KitapJsonFixture('1000kitap_api_kitap_cek_121.json');
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json,
        text: JSON.stringify(json),
      });

      const details = await provider.getApiBookDetails('121');

      expect(details.binkitapRating).toBeDefined();
      expect(details.binkitapReadCount).toBeDefined();
    });
  });

  describe('Tier 2: Boundary & Corner Cases', () => {
    it('returns empty array when search finds no matches (1000kitap_search_empty.html)', async () => {
      const html = load1000KitapFixture('1000kitap_search_empty.html');
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: html,
      });

      const results = await provider.search('nonexistentbook12345xyz');
      expect(results).toEqual([]);
    });

    it('handles quotes with page number 0 without displaying "s. 0" (1000kitap_api_quotes_121.json)', async () => {
      const json = load1000KitapJsonFixture<any>('1000kitap_api_quotes_121.json');
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json,
        text: JSON.stringify(json),
      });

      const quotes = await provider.getApiQuotes('121', 10);

      expect(quotes.length).toBeGreaterThan(0);
      const zeroPageQuote = quotes.find((q) => q.text.includes('Bir iple intihar da edebilirsin'));
      expect(zeroPageQuote).toBeDefined();
      // Should not format as page 0
      expect(zeroPageQuote?.page === undefined || zeroPageQuote?.page === '' || zeroPageQuote?.page === null).toBe(true);
    });

    it('strictly limits returned quotes to user-specified maxQuotes', async () => {
      const json = load1000KitapJsonFixture<any>('1000kitap_api_quotes_121.json');
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json,
        text: JSON.stringify(json),
      });

      const quotes = await provider.getApiQuotes('121', 2);
      expect(quotes.length).toBe(2);
    });

    it('falls back to mobile API or graceful return when Cloudflare returns 403 on web endpoint', async () => {
      // First request (web) fails with 403
      (requestUrl as any)
        .mockRejectedValueOnce({ status: 403, message: 'Cloudflare Turnstile challenge' })
        // Second request (mobile API fallback) succeeds
        .mockResolvedValueOnce({
          status: 200,
          json: load1000KitapJsonFixture('1000kitap_api_kitap_cek_121.json'),
        });

      const result = await provider.enrich('Suç ve Ceza', 'Fyodor Dostoyevski', 3);
      expect(result).toBeDefined();
    });

    it('returns empty enrichment object without crashing when book is not found on 1000Kitap', async () => {
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: load1000KitapFixture('1000kitap_search_empty.html'),
      });

      const result = await provider.enrich('Kayıp Kitap 99999', 'Bilinmeyen Yazar', 3);
      expect(result.binkitapRating).toBeUndefined();
      expect(result.quotes).toEqual([]);
    });

    it('falls back to web book detail and HTML quotes pages when mobile API quotes endpoint fails during enrich()', async () => {
      (requestUrl as any)
        // 1. Web search succeeds
        .mockResolvedValueOnce({
          status: 200,
          text: load1000KitapFixture('1000kitap_search_suc_ve_ceza.html'),
        })
        // 2. Mobile API quotes endpoint fails
        .mockRejectedValueOnce(new Error('API endpoint unreachable'))
        // 3. Web book detail page fallback succeeds
        .mockResolvedValueOnce({
          status: 200,
          text: load1000KitapFixture('1000kitap_book_kurk_mantolu_madonna.html'),
        })
        // 4. Web quotes HTML page fallback succeeds
        .mockResolvedValueOnce({
          status: 200,
          text: load1000KitapFixture('1000kitap_quotes_kurk_mantolu_madonna.html'),
        });

      const result = await provider.enrich('Suç ve Ceza', 'Fyodor Dostoyevski', 2);
      expect(result.binkitapRating).toBe('9.2/10');
      expect(result.binkitapReadCount).toBe('335 bin');
      expect(result.quotes).toHaveLength(2);
      expect(result.quotes?.[0].text).toContain('İnsanın en büyük hatası');
    });
  });
});
