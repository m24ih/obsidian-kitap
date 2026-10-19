import { describe, it, expect, beforeEach } from 'vitest';
import { KitapyurduProvider } from '../src/providers/kitapyurdu';

describe('Milestone 2 Challenger 2: Adversarial & Mutation Stress Suite', () => {
  let provider: KitapyurduProvider;

  beforeEach(() => {
    provider = new KitapyurduProvider();
  });

  describe('Adversarial Test 1: Image CDN URL Replacement & Protocol Upgrades', () => {
    it('upgrades wi:200 to wi:500 in search card cover URLs without URL corruption', () => {
      const html = `
        <div class="ky-product" data-product-id="1001">
          <a class="ky-product-title" href="/kitap/test/1001.html">Test Kitap</a>
          <div class="ky-product-cover">
            <img src="https://img.kitapyurdu.com/v1/getImage/fn:12345/wi:200/wh:abcdef" alt="Test" />
          </div>
        </div>
      `;
      const results = provider.parseSearchResults(html);
      expect(results).toHaveLength(1);
      expect(results[0].coverUrl).toBe('https://img.kitapyurdu.com/v1/getImage/fn:12345/wi:500/wh:abcdef');
    });

    it('upgrades protocol-relative URLs (//) to https: in search card cover URLs', () => {
      const html = `
        <div class="ky-product" data-product-id="1002">
          <a class="ky-product-title" href="/kitap/test/1002.html">Protocol Test</a>
          <div class="ky-product-cover">
            <img src="//img.kitapyurdu.com/v1/getImage/fn:99999/wi:200/wh:112233" />
          </div>
        </div>
      `;
      const results = provider.parseSearchResults(html);
      expect(results).toHaveLength(1);
      expect(results[0].coverUrl).toBe('https://img.kitapyurdu.com/v1/getImage/fn:99999/wi:500/wh:112233');
    });

    it('falls back to data-src if src is absent in search card cover', () => {
      const html = `
        <div class="ky-product" data-product-id="1003">
          <a class="ky-product-title" href="/kitap/test/1003.html">Lazy Image</a>
          <div class="ky-product-cover">
            <img data-src="https://img.kitapyurdu.com/v1/getImage/fn:55555/wi:200/wh:778899" />
          </div>
        </div>
      `;
      const results = provider.parseSearchResults(html);
      expect(results).toHaveLength(1);
      expect(results[0].coverUrl).toBe('https://img.kitapyurdu.com/v1/getImage/fn:55555/wi:500/wh:778899');
    });

    it('preserves non-CDN image URLs without corruption in search card', () => {
      const html = `
        <div class="ky-product" data-product-id="1004">
          <a class="ky-product-title" href="/kitap/test/1004.html">External Image</a>
          <div class="ky-product-cover">
            <img src="https://static.example.com/images/cover.jpg" />
          </div>
        </div>
      `;
      const results = provider.parseSearchResults(html);
      expect(results).toHaveLength(1);
      expect(results[0].coverUrl).toBe('https://static.example.com/images/cover.jpg');
    });

    it('upgrades wi:200 and mh:1000 to wi:800 in book details without corrupting paths', () => {
      const htmlWi = `
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Book",
          "name": "Wi Detail Test",
          "image": "https://img.kitapyurdu.com/v1/getImage/fn:88888/wi:200/wh:fedcba",
          "isbn": "9781234567890"
        }
        </script>
      `;
      const detailsWi = provider.parseBookDetails(htmlWi, 'https://www.kitapyurdu.com/kitap/test/88888.html');
      expect(detailsWi.coverUrl).toBe('https://img.kitapyurdu.com/v1/getImage/fn:88888/wi:800/wh:fedcba');

      const htmlMh = `
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Book",
          "name": "Mh Detail Test",
          "image": "https://img.kitapyurdu.com/v1/getImage/fn:88888/mh:1000/wh:fedcba",
          "isbn": "9781234567890"
        }
        </script>
      `;
      const detailsMh = provider.parseBookDetails(htmlMh, 'https://www.kitapyurdu.com/kitap/test/88888.html');
      expect(detailsMh.coverUrl).toBe('https://img.kitapyurdu.com/v1/getImage/fn:88888/wi:800/wh:fedcba');
    });

    it('preserves already high-resolution wi:800 cover without double replacement', () => {
      const html = `
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Book",
          "name": "Already 800",
          "image": "https://img.kitapyurdu.com/v1/getImage/fn:88888/wi:800/wh:fedcba",
          "isbn": "9781234567890"
        }
        </script>
      `;
      const details = provider.parseBookDetails(html, 'https://www.kitapyurdu.com/kitap/test/88888.html');
      expect(details.coverUrl).toBe('https://img.kitapyurdu.com/v1/getImage/fn:88888/wi:800/wh:fedcba');
    });

    it('upgrades protocol-relative // in book detail coverUrl to https:', () => {
      const html = `
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Book",
          "name": "Protocol Relative Detail",
          "image": "//img.kitapyurdu.com/v1/getImage/fn:77777/wi:200/wh:aaaaaa",
          "isbn": "9781234567890"
        }
        </script>
      `;
      const details = provider.parseBookDetails(html, 'https://www.kitapyurdu.com/kitap/test/77777.html');
      expect(details.coverUrl).toBe('https://img.kitapyurdu.com/v1/getImage/fn:77777/wi:800/wh:aaaaaa');
    });
  });

  describe('Adversarial Test 2: Search Result Card Extraction with Malformed / Extra DOM Nodes', () => {
    it('handles empty .ky-product card without crashing or throwing', () => {
      const html = `
        <div class="ky-product"></div>
      `;
      const results = provider.parseSearchResults(html);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('');
      expect(results[0].title).toBe('');
      expect(results[0].author).toBe('');
      expect(results[0].publisher).toBe('');
      expect(results[0].url).toBe('');
      expect(results[0].coverUrl).toBe('');
      expect(results[0].rating).toBeUndefined();
      expect(results[0].price).toBeUndefined();
    });

    it('extracts ID from canonical URL when data-product-id attribute is missing', () => {
      const html = `
        <div class="ky-product">
          <a class="ky-product-title" href="/kitap/ornek-kitap/481516.html?s_token=abc">Örnek Kitap</a>
        </div>
      `;
      const results = provider.parseSearchResults(html);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('481516');
      expect(results[0].url).toBe('https://www.kitapyurdu.com/kitap/ornek-kitap/481516.html');
      expect(results[0].url).not.toContain('s_token');
    });

    it('strips tracking query params and hash fragments from search result canonical URLs', () => {
      const html = `
        <div class="ky-product" data-product-id="2001">
          <a class="ky-product-title" href="https://www.kitapyurdu.com/kitap/dune/2001.html?filter_name=dune&s_token=xyz#reviews">Dune Tracking</a>
        </div>
      `;
      const results = provider.parseSearchResults(html);
      expect(results[0].url).toBe('https://www.kitapyurdu.com/kitap/dune/2001.html');
    });

    it('extracts multiple authors when formatted with a tags and commas', () => {
      const html = `
        <div class="ky-product" data-product-id="2002">
          <a class="ky-product-title" href="/kitap/test/2002.html">Yazarlar Test</a>
          <div class="ky-product-author">
            <a href="/yazar/yazar-1/1.html">Ahmet Hamdi Tanpınar</a>,
            <a href="/yazar/yazar-2/2.html">Oğuz Atay</a>
          </div>
        </div>
      `;
      const results = provider.parseSearchResults(html);
      expect(results[0].author).toBe('Ahmet Hamdi Tanpınar, Oğuz Atay');
    });

    it('cleans trailing comma and collapses whitespace when author has no a links', () => {
      const html = `
        <div class="ky-product" data-product-id="2003">
          <a class="ky-product-title" href="/kitap/test/2003.html">Yazar No Links</a>
          <div class="ky-product-author">
            \n   Yaşar    Kemal,   \n
          </div>
        </div>
      `;
      const results = provider.parseSearchResults(html);
      expect(results[0].author).toBe('Yaşar Kemal');
    });

    it('extracts publisher from a tag or text fallback', () => {
      const htmlLink = `
        <div class="ky-product" data-product-id="2004">
          <a class="ky-product-title" href="/kitap/test/2004.html">Pub Link</a>
          <div class="ky-product-publisher">
            <a href="/yayinevi/yapi-kredi/1.html">Yapı Kredi Yayınları</a>
          </div>
        </div>
      `;
      const resultsLink = provider.parseSearchResults(htmlLink);
      expect(resultsLink[0].publisher).toBe('Yapı Kredi Yayınları');

      const htmlText = `
        <div class="ky-product" data-product-id="2005">
          <a class="ky-product-title" href="/kitap/test/2005.html">Pub Text</a>
          <div class="ky-product-publisher">
            \n   Can   Yayınları   \n
          </div>
        </div>
      `;
      const resultsText = provider.parseSearchResults(htmlText);
      expect(resultsText[0].publisher).toBe('Can Yayınları');
    });

    it('extracts star ratings accurately from selected SVG count and ignores second responsive container', () => {
      const html = `
        <div class="ky-product" data-product-id="2006">
          <a class="ky-product-title" href="/kitap/test/2006.html">Star Test</a>
          <!-- Desktop rating block: 4 stars -->
          <div class="ky-product-rating">
            <svg class="ky-icon ky-icon__star ky-product-rating-star ky-product-rating-star--selected"></svg>
            <svg class="ky-icon ky-icon__star ky-product-rating-star ky-product-rating-star--selected"></svg>
            <svg class="ky-icon ky-icon__star ky-product-rating-star ky-product-rating-star--selected"></svg>
            <svg class="ky-icon ky-icon__star ky-product-rating-star ky-product-rating-star--selected"></svg>
            <svg class="ky-icon ky-icon__star ky-product-rating-star"></svg>
          </div>
          <!-- Mobile rating block: duplicate with 4 stars -->
          <div class="ky-product-rating">
            <svg class="ky-icon ky-icon__star ky-product-rating-star ky-product-rating-star--selected"></svg>
            <svg class="ky-icon ky-icon__star ky-product-rating-star ky-product-rating-star--selected"></svg>
            <svg class="ky-icon ky-icon__star ky-product-rating-star ky-product-rating-star--selected"></svg>
            <svg class="ky-icon ky-icon__star ky-product-rating-star ky-product-rating-star--selected"></svg>
          </div>
        </div>
      `;
      const results = provider.parseSearchResults(html);
      expect(results[0].rating).toBe(4);
    });

    it('leaves rating undefined when no stars are selected', () => {
      const html = `
        <div class="ky-product" data-product-id="2007">
          <a class="ky-product-title" href="/kitap/test/2007.html">No Stars</a>
          <div class="ky-product-rating">
            <svg class="ky-icon ky-icon__star ky-product-rating-star"></svg>
            <svg class="ky-icon ky-icon__star ky-product-rating-star"></svg>
          </div>
        </div>
      `;
      const results = provider.parseSearchResults(html);
      expect(results[0].rating).toBeUndefined();
    });

    it('tolerates extra advertising cards, banner cards, and sponsored elements interspersed with products', () => {
      const html = `
        <div class="ky-banner-ad">
          <img src="/banner.jpg" />
        </div>
        <div class="ky-product" data-product-id="3001">
          <a class="ky-product-title" href="/kitap/kitap-1/3001.html">Kitap 1</a>
        </div>
        <div class="ky-product sponsored-card" data-product-id="3002">
          <span class="sponsored-badge">Sponsorlu</span>
          <a class="ky-product-title" href="/kitap/kitap-2/3002.html">Kitap 2</a>
        </div>
        <div class="ky-carousel-item">Diğer</div>
        <div class="ky-product" data-product-id="3003">
          <a class="ky-product-title" href="/kitap/kitap-3/3003.html">Kitap 3</a>
        </div>
      `;
      const results = provider.parseSearchResults(html);
      expect(results).toHaveLength(3);
      expect(results.map((r) => r.id)).toEqual(['3001', '3002', '3003']);
    });

    it('returns empty array when HTML contains .empty-products-container', () => {
      const html = `
        <div class="search-page">
          <div class="empty-products-container">
            <p>Aramanızla eşleşen ürün bulunamadı.</p>
          </div>
          <div class="ky-product">Fake Residual Node</div>
        </div>
      `;
      const results = provider.parseSearchResults(html);
      expect(results).toEqual([]);
    });

    it('handles empty string, null-like input, or whitespace HTML without crashing', () => {
      expect(provider.parseSearchResults('')).toEqual([]);
      expect(provider.parseSearchResults('   \n\t  ')).toEqual([]);
      expect(provider.parseSearchResults('<div>No products here</div>')).toEqual([]);
    });

    it('sanitizes script tags or XSS attempts in titles and authors via textContent', () => {
      const html = `
        <div class="ky-product" data-product-id="4001">
          <a class="ky-product-title" href="/kitap/xss/4001.html">&lt;script&gt;alert(1)&lt;/script&gt; Masum Başlık</a>
          <div class="ky-product-author">
            <a href="#"><b>Kritik Yazar</b></a>
          </div>
        </div>
      `;
      const results = provider.parseSearchResults(html);
      expect(results[0].title).toBe('<script>alert(1)</script> Masum Başlık');
      expect(results[0].author).toBe('Kritik Yazar');
    });
  });

  describe('Adversarial Test 3: Book Details Resilience with Corrupt JSON-LD & DOM Fallbacks', () => {
    it('gracefully handles malformed/corrupted JSON-LD script blocks without crashing', () => {
      const html = `
        <script type="application/ld+json">
          { INVALID JSON SYNTAX MISSING BRACKETS
        </script>
        <h1 class="ky-pd-title">Sefiller</h1>
        <div class="ky-pd-heading__authors">
          <a href="/yazar/victor-hugo/10.html">Victor Hugo</a>
          <a href="/yayinevi/iletisim/5.html">İletişim Yayınları</a>
        </div>
        <div class="ky-pd-attributes__item">
          <span class="ky-pd-attributes__label">ISBN:</span>
          <span class="ky-pd-attributes__value">9789750500000</span>
        </div>
        <div class="ky-pd-attributes__item">
          <span class="ky-pd-attributes__label">Sayfa Sayısı:</span>
          <span class="ky-pd-attributes__value">1234</span>
        </div>
        <div class="ky-pd-attributes__item">
          <span class="ky-pd-attributes__label">Yayın Tarihi:</span>
          <span class="ky-pd-attributes__value">15.03.2018</span>
        </div>
      `;
      const details = provider.parseBookDetails(html, 'https://www.kitapyurdu.com/kitap/sefiller/55555.html');
      expect(details.title).toBe('Sefiller');
      expect(details.author).toBe('Victor Hugo');
      expect(details.publisher).toBe('İletişim Yayınları');
      expect(details.isbn).toBe('9789750500000');
      expect(details.pages).toBe(1234);
      expect(details.publishDate).toBe('2018-03-15');
      expect(details.rating).toBeUndefined();
    });

    it('falls back to compiler/editor when primary author link is missing', () => {
      const html = `
        <h1 class="ky-pd-title">Seçme Hikayeler</h1>
        <div class="ky-pd-attributes__item">
          <span class="ky-pd-attributes__label">Derleyen:</span>
          <span class="ky-pd-attributes__value">
            <a href="/yazar/ali-veli/1.html">Ali Veli,</a>
            <a href="/yazar/veli-ali/2.html">Veli Ali</a>
          </span>
        </div>
        <div class="ky-pd-attributes__item">
          <span class="ky-pd-attributes__label">ISBN:</span>
          <span class="ky-pd-attributes__value">9789750000001</span>
        </div>
      `;
      const details = provider.parseBookDetails(html, 'https://www.kitapyurdu.com/kitap/test/12345.html');
      expect(details.author).toBe('Ali Veli, Veli Ali');
    });

    it('normalizes Turkish dot-formatted dates DD.MM.YYYY into ISO YYYY-MM-DD', () => {
      const html = `
        <h1 class="ky-pd-title">Tarih Testi</h1>
        <div class="ky-pd-attributes__item">
          <span class="ky-pd-attributes__label">Yayın Tarihi:</span>
          <span class="ky-pd-attributes__value">05.09.2023</span>
        </div>
      `;
      const details = provider.parseBookDetails(html, '12345');
      expect(details.publishDate).toBe('2023-09-05');
    });

    it('normalizes 4-digit year dates without throwing', () => {
      const html = `
        <h1 class="ky-pd-title">Yıl Testi</h1>
        <div class="ky-pd-attributes__item">
          <span class="ky-pd-attributes__label">Yayın Tarihi:</span>
          <span class="ky-pd-attributes__value">1998</span>
        </div>
      `;
      const details = provider.parseBookDetails(html, '12345');
      expect(details.publishDate).toBe('1998');
    });

    it('resolves product ID from numeric string parameter', () => {
      const html = `
        <h1 class="ky-pd-title">ID Testi</h1>
      `;
      const details = provider.parseBookDetails(html, '998877');
      expect(details.id).toBe('998877');
      expect(details.url).toBe('https://www.kitapyurdu.com/kitap/product/998877.html');
    });
  });
});
