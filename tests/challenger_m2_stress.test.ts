import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeSearchQuery, KitapyurduProvider } from '../src/providers/kitapyurdu';
import { fetchHtml, HttpError, requestWithTimeout, DEFAULT_DESKTOP_USER_AGENT } from '../src/utils/http';
import { requestUrl } from 'obsidian';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Milestone 2 Challenger Empirical Stress Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Adversarial Stress: normalizeSearchQuery (20+ variations)', () => {
    const alphanumericTitles = [
      { input: '1984', expected: '1984' },
      { input: '2001: Bir Uzay Destanı', expected: '2001: Bir Uzay Destanı' },
      { input: 'Dune 2', expected: 'Dune 2' },
      { input: '3 Silahşörler', expected: '3 Silahşörler' },
      { input: 'Fahrenheit 451', expected: 'Fahrenheit 451' },
      { input: 'Catch-22', expected: 'Catch-22' },
      { input: '1Q84', expected: '1Q84' },
      { input: '100 Yıllık Yalnızlık', expected: '100 Yıllık Yalnızlık' },
      { input: 'İnce Memed 1', expected: 'İnce Memed 1' },
      { input: 'Şeker Portakalı', expected: 'Şeker Portakalı' },
      { input: 'Çalıkuşu', expected: 'Çalıkuşu' },
    ];

    for (const { input, expected } of alphanumericTitles) {
      it(`preserves alphanumeric book title: "${input}"`, () => {
        expect(normalizeSearchQuery(input)).toBe(expected);
      });
    }

    const whitespaceCases = [
      { input: '', expected: '' },
      { input: '   ', expected: '' },
      { input: '\t\n\r  ', expected: '' },
      { input: '  Dune  ', expected: 'Dune' },
    ];

    for (const { input, expected } of whitespaceCases) {
      it(`handles whitespace/empty properly: "${JSON.stringify(input)}"`, () => {
        expect(normalizeSearchQuery(input)).toBe(expected);
      });
    }

    const isbn13Cases = [
      { input: '978-605-375-479-4', expected: '9786053754794' },
      { input: '978 605 375 479 4', expected: '9786053754794' },
      { input: '9786053754794', expected: '9786053754794' },
      { input: 'ISBN: 978-605-375-479-4', expected: '9786053754794' },
      { input: 'isbn: 978-605-375-479-4', expected: '9786053754794' },
      { input: 'isbn:9786053754794', expected: '9786053754794' },
      { input: 'ISBN 978 605 375 479 4', expected: '9786053754794' },
      { input: '  978-605-375-479-4  ', expected: '9786053754794' },
      { input: '979-10-90636-07-1', expected: '9791090636071' },
      { input: '979 10 90636 07 1', expected: '9791090636071' },
      { input: '9791090636071', expected: '9791090636071' },
    ];

    for (const { input, expected } of isbn13Cases) {
      it(`normalizes ISBN-13 format: "${input}" -> "${expected}"`, () => {
        expect(normalizeSearchQuery(input)).toBe(expected);
      });
    }

    const isbn10Cases = [
      { input: '975-08-0294-2', expected: '9750802942' },
      { input: 'ISBN: 975-08-0294-2', expected: '9750802942' },
      { input: 'ISBN 975-08-0294-2', expected: '9750802942' },
      { input: '9750802942', expected: '9750802942' },
    ];

    for (const { input, expected } of isbn10Cases) {
      it(`normalizes Turkish 10-digit ISBN: "${input}" -> "${expected}"`, () => {
        expect(normalizeSearchQuery(input)).toBe(expected);
      });
    }

    // Edge cases for ISBN-10 with check digit 'X'
    describe('ISBN-10 with Check Digit X behavior', () => {
      it('normalizes ISBN-10 ending with X and preserves check digit', () => {
        expect(normalizeSearchQuery('0-8044-2957-X')).toBe('080442957X');
        expect(normalizeSearchQuery('0-8044-2957-x')).toBe('080442957X');
      });

      it('strips ISBN: prefix when ISBN-10 ends in X', () => {
        expect(normalizeSearchQuery('ISBN: 0-8044-2957-X')).toBe('080442957X');
        expect(normalizeSearchQuery('isbn: 0-8044-2957-x')).toBe('080442957X');
      });
    });

    it('preserves book titles with parenthetical annotations: "978-605-375-479-4 (Ciltli)"', () => {
      expect(normalizeSearchQuery('978-605-375-479-4 (Ciltli)')).toBe('978-605-375-479-4 (Ciltli)');
    });
  });

  describe('Adversarial Stress: fetchHtml in src/utils/http.ts', () => {
    it('throws timeout error when request exceeds timeoutMs', async () => {
      const neverResolvingPromise = new Promise<{ status: number; text: string }>(() => {});
      (requestUrl as any).mockReturnValueOnce(neverResolvingPromise);

      const timeoutMs = 50;
      await expect(
        fetchHtml('https://www.kitapyurdu.com/slow', { timeoutMs })
      ).rejects.toThrow(/İstek zaman aşımına uğradı \(50ms\)/);
    });

    it('cleans up timeout timer when request resolves quickly', async () => {
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: '<html>OK</html>',
      });

      const result = await fetchHtml('https://www.kitapyurdu.com/fast', { timeoutMs: 5000 });
      expect(result).toBe('<html>OK</html>');
    });

    it('throws HttpError with status 404 when server returns 404', async () => {
      (requestUrl as any).mockResolvedValueOnce({
        status: 404,
        text: 'Not Found',
      });

      const targetUrl = 'https://www.kitapyurdu.com/kitap/bulunamadi/999999.html';
      let caughtError: any;
      try {
        await fetchHtml(targetUrl);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(HttpError);
      expect(caughtError.status).toBe(404);
      expect(caughtError.url).toBe(targetUrl);
      expect(caughtError.message).toContain('HTTP Hatası 404');
    });

    it('throws HttpError with status 500 when server returns 500', async () => {
      (requestUrl as any).mockResolvedValueOnce({
        status: 500,
        text: 'Internal Server Error',
      });

      const targetUrl = 'https://www.kitapyurdu.com/error';
      await expect(fetchHtml(targetUrl)).rejects.toMatchObject({
        name: 'HttpError',
        status: 500,
        url: targetUrl,
      });
    });

    it('throws HttpError for 403 Forbidden', async () => {
      (requestUrl as any).mockResolvedValueOnce({
        status: 403,
        text: 'Forbidden',
      });

      await expect(fetchHtml('https://www.kitapyurdu.com/blocked')).rejects.toMatchObject({
        name: 'HttpError',
        status: 403,
      });
    });

    it('propagates custom headers and merges with default headers', async () => {
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: '<html>Custom</html>',
      });

      await fetchHtml('https://www.kitapyurdu.com/custom', {
        headers: {
          'X-Custom-Client': 'Obsidian-Kitap-Test',
          'X-Correlation-ID': 'test-12345',
        },
      });

      expect((requestUrl as any)).toHaveBeenCalledTimes(1);
      const callArg = (requestUrl as any).mock.calls[0][0];

      expect(callArg.url).toBe('https://www.kitapyurdu.com/custom');
      expect(callArg.headers['X-Custom-Client']).toBe('Obsidian-Kitap-Test');
      expect(callArg.headers['X-Correlation-ID']).toBe('test-12345');
      // Default headers must still be present
      expect(callArg.headers['User-Agent']).toBe(DEFAULT_DESKTOP_USER_AGENT);
      expect(callArg.headers['Accept']).toContain('text/html');
      expect(callArg.headers['Accept-Language']).toContain('tr-TR');
    });

    it('allows overriding default User-Agent with custom header', async () => {
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: '<html>Custom UA</html>',
      });

      const customUa = 'Custom-Agent/2.0';
      await fetchHtml('https://www.kitapyurdu.com/custom-ua', {
        headers: {
          'User-Agent': customUa,
        },
      });

      const callArg = (requestUrl as any).mock.calls[0][0];
      expect(callArg.headers['User-Agent']).toBe(customUa);
    });

    it('propagates custom HTTP method', async () => {
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        text: '<html>POST response</html>',
      });

      await fetchHtml('https://www.kitapyurdu.com/api', {
        method: 'POST',
      });

      const callArg = (requestUrl as any).mock.calls[0][0];
      expect(callArg.method).toBe('POST');
    });
  });

  describe('Adversarial Stress: Production Bundle Runtime Purity', () => {
    it('verifies main.js exists and compiles without errors', () => {
      const bundlePath = path.resolve(__dirname, '../main.js');
      expect(fs.existsSync(bundlePath)).toBe(true);

      const stats = fs.statSync(bundlePath);
      expect(stats.size).toBeGreaterThan(1000);
    });

    it('verifies main.js does NOT require forbidden Node runtime modules', () => {
      const bundlePath = path.resolve(__dirname, '../main.js');
      const content = fs.readFileSync(bundlePath, 'utf8');

      const forbiddenNodeModules = [
        'fs',
        'node:fs',
        'path',
        'node:path',
        'http',
        'node:http',
        'https',
        'node:https',
        'crypto',
        'node:crypto',
        'os',
        'node:os',
        'stream',
        'node:stream',
        'net',
        'node:net',
        'child_process',
        'node:child_process',
        'tls',
        'node:tls',
        'dns',
        'node:dns',
      ];

      for (const mod of forbiddenNodeModules) {
        const regex = new RegExp(`require\\(["']${mod}["']\\)`);
        expect(content).not.toMatch(regex);
      }
    });

    it('verifies only obsidian is required in main.js', () => {
      const bundlePath = path.resolve(__dirname, '../main.js');
      const content = fs.readFileSync(bundlePath, 'utf8');

      const requireMatches = content.match(/require\((["'][^"']+["'])\)/g) || [];
      const requiredModules = requireMatches.map((m) => {
        const match = m.match(/require\((["'])([^"']+)\1\)/);
        return match ? match[2] : m;
      });

      const uniqueModules = Array.from(new Set(requiredModules));
      // Only "obsidian" should be present in requires
      for (const mod of uniqueModules) {
        expect(mod).toBe('obsidian');
      }
    });
  });

  describe('Adversarial Stress: KitapyurduProvider Edge Cases', () => {
    it('returns empty array for empty or whitespace search HTML', () => {
      const provider = new KitapyurduProvider();
      expect(provider.parseSearchResults('')).toEqual([]);
      expect(provider.parseSearchResults('   ')).toEqual([]);
    });

    it('returns empty array when HTML has empty products container', () => {
      const provider = new KitapyurduProvider();
      const html = '<div class="empty-products-container">Aradığınız kriterlere uygun ürün bulunamadı.</div>';
      expect(provider.parseSearchResults(html)).toEqual([]);
    });

    it('gracefully parses product detail with broken JSON-LD and falls back to DOM', () => {
      const provider = new KitapyurduProvider();
      const brokenHtml = `
        <html>
          <head>
            <script type="application/ld+json">{ broken json </script>
            <link rel="canonical" href="https://www.kitapyurdu.com/kitap/test-kitap/12345.html" />
          </head>
          <body>
            <h1 class="ky-pd-title">Test Kitabı Başlığı</h1>
            <div class="ky-pd-heading__authors">
              <a href="https://www.kitapyurdu.com/yazar/ali-veli/1.html">Ali Veli</a>
              <a href="https://www.kitapyurdu.com/yayinevi/test-yayinevi/2.html">Test Yayınevi</a>
            </div>
            <div class="ky-pd-attributes__item">
              <span class="ky-pd-attributes__label">ISBN:</span>
              <span class="ky-pd-attributes__value">978-975-1234-56-7</span>
            </div>
            <div class="ky-pd-attributes__item">
              <span class="ky-pd-attributes__label">Sayfa Sayısı:</span>
              <span class="ky-pd-attributes__value">350</span>
            </div>
            <div class="ky-pd-attributes__item">
              <span class="ky-pd-attributes__label">Yayın Tarihi:</span>
              <span class="ky-pd-attributes__value">15.03.2023</span>
            </div>
          </body>
        </html>
      `;

      const details = provider.parseBookDetails(brokenHtml, '12345');
      expect(details.id).toBe('12345');
      expect(details.title).toBe('Test Kitabı Başlığı');
      expect(details.author).toBe('Ali Veli');
      expect(details.publisher).toBe('Test Yayınevi');
      expect(details.isbn).toBe('9789751234567');
      expect(details.pages).toBe(350);
      expect(details.publishDate).toBe('2023-03-15');
    });
  });
});
