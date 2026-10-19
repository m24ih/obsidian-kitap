import { BookMetadata, BookQuote, SearchResultItem } from '../types';
import { fetchHtml, fetchJson } from '../utils/http';
import { IBinkitapProvider } from './types';

export class BinkitapProvider implements IBinkitapProvider {
  private readonly webBaseUrl = 'https://1000kitap.com';
  private readonly apiBaseUrl = 'https://api.1000kitap.com/v2';

  /**
   * 1000Kitap üzerinde kitap araması yapar.
   * Önce web sayfasındaki __NEXT_DATA__ verisini, yoksa HTML DOM kartlarını,
   * Cloudflare 403 vb. hata durumunda ise mobil v2 API uç noktasını kullanır.
   */
  async search(query: string): Promise<SearchResultItem[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const webUrl = `${this.webBaseUrl}/ara?q=${encodeURIComponent(trimmed)}`;

    try {
      const html = await fetchHtml(webUrl);
      return this.parseSearchResults(html);
    } catch {
      // Web uç noktası başarısız olursa (ör. Cloudflare 403), mobil v2 API yedeğini dene
      try {
        const apiUrl = `${this.apiBaseUrl}/arama/ara?q=${encodeURIComponent(trimmed)}`;
        const json = await fetchJson<any>(apiUrl);
        return this.parseApiSearchResults(json);
      } catch {
        return [];
      }
    }
  }

  /**
   * 1000Kitap arama sonuç HTML sayfasını (__NEXT_DATA__ ve DOM fallback ile) ayrıştırır.
   */
  parseSearchResults(html: string): SearchResultItem[] {
    if (!html || !html.trim()) return [];

    const doc = new DOMParser().parseFromString(html, 'text/html');

    // 1. Birincil Yöntem: __NEXT_DATA__ JSON yükü
    const nextDataEl = doc.querySelector('script#__NEXT_DATA__');
    if (nextDataEl?.textContent) {
      try {
        const parsed = JSON.parse(nextDataEl.textContent.trim());
        const responseData = parsed?.props?.pageProps?.response || parsed;
        if (responseData?._sonuc) {
          return this.parseApiSearchResults(responseData);
        }
      } catch {
        // __NEXT_DATA__ bozuksa DOM ayrıştırmaya düş
      }
    }

    // 2. İkincil Yöntem: HTML DOM Arama Kartları
    if (doc.querySelector('.empty-results')) {
      return [];
    }

    const results: SearchResultItem[] = [];
    const links = Array.from(doc.querySelectorAll('a[href*="/kitap/"]'));

    for (const link of links) {
      const rawHref = link.getAttribute('href') || '';
      if (!rawHref) continue;

      const idMatch =
        rawHref.match(/--(\d+)(?:[/?#]|$)/) ||
        rawHref.match(/\/kitap\/[^/]*?(\d+)(?:[/?#]|$)/);
      const id = idMatch ? idMatch[1] : '';

      const url = rawHref.startsWith('http')
        ? rawHref
        : `${this.webBaseUrl}${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;

      const spans = Array.from(link.querySelectorAll('span'));
      const title = (
        spans[0]?.textContent ||
        link.querySelector('.font-medium, h2, h3')?.textContent ||
        ''
      ).trim();

      const author = (
        spans[1]?.textContent ||
        link.querySelector('.text-silik-v2')?.textContent ||
        ''
      ).trim();

      const coverUrl = link.querySelector('img')?.getAttribute('src') || '';

      if (title) {
        results.push({
          id,
          title,
          author,
          publisher: '',
          url,
          coverUrl,
        });
      }
    }

    return results;
  }

  /**
   * 1000Kitap API veya __NEXT_DATA__ arama JSON yanıtını ayrıştırır.
   */
  parseApiSearchResults(json: any): SearchResultItem[] {
    if (!json || typeof json !== 'object') return [];

    const sonuc = json._sonuc || json?.props?.pageProps?.response?._sonuc || json;
    const results: SearchResultItem[] = [];

    if (Array.isArray(sonuc?.liste)) {
      for (const widget of sonuc.liste) {
        const items = Array.isArray(widget?.sonuclar) ? widget.sonuclar : [widget];
        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          if (item.turu && item.turu !== 'kitap') continue;

          const icerik = item.icerik || item;
          const id = String(icerik.id || item.id || '').trim();
          const title = String(icerik.adi || item.name || item.adi || '').trim();
          if (!id || !title) continue;

          const author = String(icerik.yazarAdi || item.yazarAdi || icerik.ilkYazar || '').trim();
          const seoAdi = String(icerik.seo_adi || item.seo_adi || '').trim();
          const url = seoAdi
            ? `${this.webBaseUrl}/kitap/${seoAdi}--${id}`
            : `${this.webBaseUrl}/kitap/${id}`;
          const coverUrl = String(icerik.resim || item.resim || '').trim();

          results.push({
            id,
            title,
            author,
            publisher: '',
            url,
            coverUrl,
          });
        }
      }
    }

    // Doğrudan kitap nesnesi döndüyse (ör. kitapCek yedek yanıtı)
    if (results.length === 0 && sonuc?.kitap && typeof sonuc.kitap === 'object') {
      const k = sonuc.kitap;
      const id = String(k.id || '').trim();
      const title = String(k.adi || '').trim();
      if (id && title) {
        const seoAdi = String(k.seo_adi || '').trim();
        results.push({
          id,
          title,
          author: String(k.yazarAdi || k.ilkYazar || '').trim(),
          publisher: '',
          url: seoAdi
            ? `${this.webBaseUrl}/kitap/${seoAdi}--${id}`
            : `${this.webBaseUrl}/kitap/${id}`,
          coverUrl: String(k.resim || '').trim(),
        });
      }
    }

    return results;
  }

  /**
   * 1000Kitap kitap detay web sayfasından puan ve okunma istatistiklerini çıkarır.
   */
  async getBookDetails(url: string): Promise<Partial<BookMetadata>> {
    const html = await fetchHtml(url);
    return this.parseBookDetails(html, url);
  }

  /**
   * 1000Kitap kitap detay HTML içeriğini (JSON-LD, __NEXT_DATA__ ve DOM ile) ayrıştırır.
   */
  parseBookDetails(html: string, inputUrl?: string): Partial<BookMetadata> {
    if (!html || !html.trim()) return {};

    // Eğer doğrudan JSON metni geldiyse
    const trimmed = html.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return this.parseApiBookDetails(parsed);
      } catch {
        // HTML olarak devam et
      }
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    let binkitapRating: string | undefined;
    let binkitapReadCount: string | undefined;
    let binkitapUrl: string | undefined = inputUrl;

    // 1. JSON-LD (application/ld+json)
    const ldScripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of ldScripts) {
      const content = script.textContent?.trim();
      if (!content) continue;
      try {
        const parsed = JSON.parse(content);
        const nodes = Array.isArray(parsed) ? parsed : [parsed];
        for (const node of nodes) {
          if (!node || typeof node !== 'object') continue;
          if (node.url && !binkitapUrl) {
            binkitapUrl = String(node.url);
          }
          const agg = node.aggregateRating;
          if (agg && agg.ratingValue !== undefined && agg.ratingValue !== null) {
            const val = parseFloat(String(agg.ratingValue));
            const best = agg.bestRating ? parseInt(String(agg.bestRating), 10) : 10;
            if (!isNaN(val) && val > 0) {
              binkitapRating = `${val}/${best}`;
            }
          }
        }
      } catch {
        // Bozuk JSON-LD'yi yoksay
      }
    }

    // 2. DOM alanları (.rating, .read-count)
    if (!binkitapRating) {
      const ratingText = doc.querySelector('.rating')?.textContent?.trim();
      if (ratingText) {
        binkitapRating = ratingText.replace(/\s*\/\s*/, '/');
      }
    }

    const readCountText = doc.querySelector('.read-count')?.textContent?.trim();
    if (readCountText) {
      binkitapReadCount = readCountText.replace(/\s*okunma.*$/i, '').trim();
    }

    // 3. __NEXT_DATA__ yedeği
    if (!binkitapRating || !binkitapReadCount) {
      const nextDataEl = doc.querySelector('script#__NEXT_DATA__');
      if (nextDataEl?.textContent) {
        try {
          const parsed = JSON.parse(nextDataEl.textContent);
          const apiDetails = this.parseApiBookDetails(parsed?.props?.pageProps?.response || parsed);
          if (!binkitapRating && apiDetails.binkitapRating) {
            binkitapRating = apiDetails.binkitapRating;
          }
          if (!binkitapReadCount && apiDetails.binkitapReadCount) {
            binkitapReadCount = apiDetails.binkitapReadCount;
          }
          if (!binkitapUrl && apiDetails.binkitapUrl) {
            binkitapUrl = apiDetails.binkitapUrl;
          }
        } catch {
          // Yoksay
        }
      }
    }

    return {
      ...(binkitapRating ? { binkitapRating } : {}),
      ...(binkitapReadCount ? { binkitapReadCount } : {}),
      ...(binkitapUrl ? { binkitapUrl } : {}),
    };
  }

  /**
   * 1000Kitap mobil v2 API üzerinden kitap istatistiklerini getirir.
   */
  async getApiBookDetails(bookId: string): Promise<Partial<BookMetadata>> {
    const url = `${this.apiBaseUrl}/kitap/kitapCek?kitapId=${encodeURIComponent(bookId)}`;
    const json = await fetchJson<any>(url);
    return this.parseApiBookDetails(json);
  }

  /**
   * 1000Kitap mobil API JSON verisinden puan ve okunma sayısını çıkarır.
   */
  parseApiBookDetails(json: any): Partial<BookMetadata> {
    if (!json || typeof json !== 'object') return {};

    const kitap = json?._sonuc?.kitap || json?.kitap || json;
    if (!kitap || typeof kitap !== 'object') return {};

    let binkitapRating: string | undefined;
    if (kitap.puan !== undefined && kitap.puan !== null) {
      const val = parseFloat(String(kitap.puan));
      if (!isNaN(val) && val > 0) {
        binkitapRating = `${val}/10`;
      }
    }

    let binkitapReadCount: string | undefined;
    if (kitap.okudu) {
      binkitapReadCount = String(kitap.okudu).trim();
    } else if (kitap.okuduDuz !== undefined && kitap.okuduDuz !== null) {
      binkitapReadCount = String(kitap.okuduDuz);
    }

    let binkitapUrl: string | undefined;
    if (kitap.id) {
      const seo = kitap.seo_adi ? `${kitap.seo_adi}--${kitap.id}` : String(kitap.id);
      binkitapUrl = `${this.webBaseUrl}/kitap/${seo}`;
    }

    return {
      ...(binkitapRating ? { binkitapRating } : {}),
      ...(binkitapReadCount ? { binkitapReadCount } : {}),
      ...(binkitapUrl ? { binkitapUrl } : {}),
    };
  }

  /**
   * 1000Kitap web alıntılar sayfasından popüler alıntıları çeker.
   */
  async getQuotes(url: string, maxQuotes = 5): Promise<BookQuote[]> {
    if (maxQuotes <= 0) return [];
    const html = await fetchHtml(url);
    return this.parseHtmlQuotes(html, maxQuotes);
  }

  /**
   * 1000Kitap HTML alıntılar sayfasını ayrıştırır.
   */
  parseHtmlQuotes(html: string, maxQuotes = 5): BookQuote[] {
    if (!html || !html.trim() || maxQuotes <= 0) return [];

    const trimmed = html.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return this.parseApiQuotes(parsed, maxQuotes);
      } catch {
        // HTML olarak devam et
      }
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const items = Array.from(doc.querySelectorAll('.quote-item, .border-alinti-baskin'));
    const quotes: BookQuote[] = [];

    for (const item of items) {
      if (quotes.length >= maxQuotes) break;

      const rawText =
        item.querySelector('.text, .text-15, blockquote, p')?.textContent || '';
      const text = this.cleanQuoteText(rawText);
      if (!text) continue;

      const author = item.querySelector('.author')?.textContent?.trim() || undefined;
      const rawPage = item.querySelector('.page')?.textContent?.trim() || '';
      const page = this.normalizePageNumber(rawPage);

      quotes.push({
        text,
        ...(author ? { author } : {}),
        ...(page ? { page } : {}),
      });
    }

    return quotes.slice(0, maxQuotes);
  }

  /**
   * 1000Kitap mobil v2 API üzerinden popüler alıntıları çeker.
   */
  async getApiQuotes(bookId: string, maxQuotes = 5): Promise<BookQuote[]> {
    if (maxQuotes <= 0) return [];
    const url = `${this.apiBaseUrl}/kitap/kitapAlintilariCek?kitapId=${encodeURIComponent(bookId)}`;
    const json = await fetchJson<any>(url);
    return this.parseApiQuotes(json, maxQuotes);
  }

  /**
   * 1000Kitap mobil API alıntılar JSON yanıtını ayrıştırır.
   */
  parseApiQuotes(json: any, maxQuotes = 5): BookQuote[] {
    if (!json || typeof json !== 'object' || maxQuotes <= 0) return [];

    const sonuc = json._sonuc || json;
    const liste = Array.isArray(sonuc?.liste) ? sonuc.liste : [];
    const defaultAuthor: string | undefined =
      sonuc?.kitap?.ilkYazar || sonuc?.kitap?.yazarAdi || undefined;

    const quotes: BookQuote[] = [];

    for (const item of liste) {
      if (quotes.length >= maxQuotes) break;
      if (!item || typeof item !== 'object') continue;

      const sozler = item?.alt?.sozler;
      if (item.turu !== 'sozler' && !sozler) continue;

      const parseArr = sozler?.sozParse?.parse;
      let rawText = '';
      if (Array.isArray(parseArr)) {
        rawText = parseArr
          .map((part: any) => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object') return part.item || part.text || '';
            return '';
          })
          .join('');
      } else if (typeof sozler?.soz === 'string') {
        rawText = sozler.soz;
      }

      const text = this.cleanQuoteText(rawText);
      if (!text) continue;

      const author: string | undefined =
        item?.alt?.yazarlar?.adi ||
        item?.alt?.kitaplar?.yazarlar?.[0]?.adi ||
        defaultAuthor;

      const page = this.normalizePageNumber(sozler?.sayfa);
      const likes =
        typeof item.begeniSayisi === 'number' ? item.begeniSayisi : undefined;

      quotes.push({
        text,
        ...(author ? { author } : {}),
        ...(page ? { page } : {}),
        ...(likes !== undefined ? { likes } : {}),
      });
    }

    return quotes.slice(0, maxQuotes);
  }

  /**
   * Kitap başlığı ve yazarına göre 1000Kitap'ta arama yapar, puan, okunma sayısı ve alıntılarla zenginleştirir.
   * Herhangi bir ağ hatası, Cloudflare engeli veya eşleşmeme durumunda asla hata fırlatmaz.
   */
  async enrich(
    title: string,
    author: string,
    maxQuotes = 5
  ): Promise<Partial<BookMetadata>> {
    try {
      const cleanTitle = title.trim();
      const cleanAuthor = author.split(',')[0].trim();
      const searchQuery = `${cleanTitle} ${cleanAuthor}`.trim();
      if (!searchQuery) {
        return { binkitapRating: undefined, quotes: [] };
      }

      let searchResults: SearchResultItem[] = [];
      const webSearchUrl = `${this.webBaseUrl}/ara?q=${encodeURIComponent(searchQuery)}`;

      try {
        const searchHtml = await fetchHtml(webSearchUrl);
        searchResults = this.parseSearchResults(searchHtml);
        if (searchResults.length === 0) {
          const directBookDetails = this.parseBookDetails(searchHtml);
          const directHtmlQuotes = maxQuotes > 0 ? this.parseHtmlQuotes(searchHtml, maxQuotes) : [];
          if (directBookDetails.binkitapRating || directHtmlQuotes.length > 0) {
            return {
              ...directBookDetails,
              quotes: directHtmlQuotes,
            };
          }
        }
      } catch {
        // Web araması başarısız olursa (ör. Cloudflare 403), mobil API'yi dene
        try {
          const apiSearchUrl = `${this.apiBaseUrl}/arama/ara?q=${encodeURIComponent(searchQuery)}`;
          const fallbackJson = await fetchJson<any>(apiSearchUrl);

          // Eğer yedek yanıt doğrudan kitap verisi içeriyorsa (kitapCek vb.)
          const directDetails = this.parseApiBookDetails(fallbackJson);
          const directQuotes = this.parseApiQuotes(fallbackJson, maxQuotes);
          if (directDetails.binkitapRating || directQuotes.length > 0) {
            return {
              ...directDetails,
              quotes: directQuotes,
            };
          }

          searchResults = this.parseApiSearchResults(fallbackJson);
        } catch {
          return { binkitapRating: undefined, quotes: [] };
        }
      }

      if (searchResults.length === 0) {
        return { binkitapRating: undefined, quotes: [] };
      }

      const bestMatch = searchResults[0];
      if (!bestMatch.id) {
        return {
          binkitapRating: undefined,
          binkitapUrl: bestMatch.url || undefined,
          quotes: [],
        };
      }

      // Alıntılar API'si hem _sonuc.kitap (puan, okunma sayısı) hem de _sonuc.liste (alıntılar) döndürür
      try {
        const quotesApiUrl = `${this.apiBaseUrl}/kitap/kitapAlintilariCek?kitapId=${encodeURIComponent(bestMatch.id)}`;
        const apiPayload = await fetchJson<any>(quotesApiUrl);
        const bookDetails = this.parseApiBookDetails(apiPayload);
        const quotes = maxQuotes > 0 ? this.parseApiQuotes(apiPayload, maxQuotes) : [];

        return {
          binkitapRating: bookDetails.binkitapRating,
          ...(bookDetails.binkitapReadCount
            ? { binkitapReadCount: bookDetails.binkitapReadCount }
            : {}),
          binkitapUrl: bookDetails.binkitapUrl || bestMatch.url || undefined,
          quotes,
        };
      } catch {
        // Mobil API başarısız olursa web kitap detay ve alıntılar sayfalarını dene
        const targetBookUrl = bestMatch.url || `${this.webBaseUrl}/kitap/${bestMatch.id}`;
        let webDetails: Partial<BookMetadata> = {};
        let webQuotes: BookQuote[] = [];

        try {
          webDetails = await this.getBookDetails(targetBookUrl);
        } catch {
          // Yoksay
        }

        if (maxQuotes > 0) {
          try {
            webQuotes = await this.getQuotes(`${targetBookUrl}/alintilar`, maxQuotes);
          } catch {
            // Yoksay
          }
        }

        return {
          binkitapRating: webDetails.binkitapRating,
          ...(webDetails.binkitapReadCount
            ? { binkitapReadCount: webDetails.binkitapReadCount }
            : {}),
          binkitapUrl: webDetails.binkitapUrl || bestMatch.url || undefined,
          quotes: webQuotes,
        };
      }
    } catch {
      return { binkitapRating: undefined, quotes: [] };
    }
  }

  private cleanQuoteText(raw: string): string {
    if (!raw) return '';
    return raw
      .replace(/^[•\s]+|[•\s]+$/g, '')
      .replace(/^[“"«]+|[”"»]+$/g, '')
      .trim();
  }

  private normalizePageNumber(rawPage: unknown): string | undefined {
    if (rawPage === undefined || rawPage === null) return undefined;
    const str = String(rawPage).trim();
    if (!str) return undefined;
    const digits = str.replace(/\D/g, '');
    if (!digits) return undefined;
    const num = parseInt(digits, 10);
    if (isNaN(num) || num <= 0) return undefined;
    return String(num);
  }
}
