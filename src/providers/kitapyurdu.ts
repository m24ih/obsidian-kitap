import { fetchHtml } from '../utils/http';
import { IKitapyurduProvider, KitapyurduSearchResult, KitapyurduBookDetails } from './types';

/**
 * Normalizes user search queries before sending them to Kitapyurdu.
 * Strips hyphens, spaces, and non-digits from ISBN-10/ISBN-13 queries
 * (preserving ISBN-10 'X' check digit) while leaving book titles intact.
 */
export function normalizeSearchQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return '';

  // Strip optional "isbn:" or "ISBN:" prefix
  const strippedPrefix = trimmed.replace(/^isbn\s*:?\s*/i, '');
  const digitsOnly = strippedPrefix.replace(/\D/g, '');
  const isbnChars = strippedPrefix.replace(/[^0-9xX]/g, '').toUpperCase();

  // Check if it starts with 978 or 979 followed by digits/hyphens/spaces
  if (/^97[89][\d\s-]+$/.test(strippedPrefix)) {
    return digitsOnly;
  }

  // Check if it is a standard 10 or 13 character ISBN composed only of digits, spaces, hyphens, and optional trailing X
  if (
    /^[\d\s-]+[xX]?$/.test(strippedPrefix) &&
    ((isbnChars.length === 10 && /^\d{9}[\dX]$/.test(isbnChars)) ||
      (isbnChars.length === 13 && /^\d{13}$/.test(isbnChars)))
  ) {
    return isbnChars;
  }

  return trimmed;
}

export const normalizeQuery = normalizeSearchQuery;

interface JsonLdAuthor {
  '@type'?: string;
  name?: string;
  url?: string;
}

interface JsonLdPublisher {
  '@type'?: string;
  name?: string;
  url?: string;
}

interface JsonLdBook {
  '@type'?: string | string[];
  name?: string;
  alternateName?: string;
  image?: string | { url?: string };
  url?: string;
  description?: string;
  isbn?: string;
  numberOfPages?: number | string;
  datePublished?: string;
  author?: JsonLdAuthor | JsonLdAuthor[] | string;
  publisher?: JsonLdPublisher | string;
  inLanguage?: string;
  bookFormat?: string;
}

interface JsonLdAggregateRating {
  '@type'?: string;
  ratingValue?: number | string;
  ratingCount?: number | string;
  reviewCount?: number | string;
}

interface JsonLdProduct {
  '@type'?: string | string[];
  name?: string;
  sku?: string;
  productID?: string;
  image?: string | { url?: string };
  url?: string;
  gtin13?: string;
  description?: string;
  aggregateRating?: JsonLdAggregateRating;
}

export class KitapyurduProvider implements IKitapyurduProvider {
  private readonly baseUrl = 'https://www.kitapyurdu.com';

  /**
   * Kitap araması yapar ve arama sonuçlarını liste olarak döndürür.
   */
  async search(query: string): Promise<KitapyurduSearchResult[]> {
    const normalized = normalizeSearchQuery(query);
    if (!normalized) return [];

    const url = `${this.baseUrl}/index.php?route=product/list&filter_name=${encodeURIComponent(normalized)}`;

    try {
      const html = await fetchHtml(url);
      return this.parseSearchResults(html);
    } catch (error) {
      console.error('Kitapyurdu arama hatası:', error);
      return [];
    }
  }

  /**
   * HTML arama sonuç sayfasını parse eder.
   */
  parseSearchResults(html: string): KitapyurduSearchResult[] {
    if (!html || !html.trim()) return [];

    const doc = new DOMParser().parseFromString(html, 'text/html');

    const emptyContainer = doc.querySelector('.empty-products-container');
    const hasEmptyMessage = Boolean(emptyContainer?.textContent?.trim());
    const cards = Array.from(doc.querySelectorAll('.ky-product'));
    if (hasEmptyMessage || cards.length === 0) {
      return [];
    }

    const results: KitapyurduSearchResult[] = [];

    for (const card of cards) {
      // 1. Başlık & URL
      const titleEl = card.querySelector('.ky-product-title');
      const title = titleEl?.textContent?.trim().replace(/\s+/g, ' ') || '';

      const rawHref = titleEl?.getAttribute('href') || '';
      let canonicalUrl = rawHref.split('?')[0].split('#')[0].trim();
      if (canonicalUrl && !canonicalUrl.startsWith('http')) {
        canonicalUrl = this.baseUrl + (canonicalUrl.startsWith('/') ? '' : '/') + canonicalUrl;
      }

      // 2. Ürün ID
      let id = card.getAttribute('data-product-id') || '';
      if (!id && canonicalUrl) {
        const match = canonicalUrl.match(/\/(\d+)\.html/);
        if (match) id = match[1];
      }

      // 3. Yazar (Tekil veya çoklu yazarlar, baştaki/sondaki virgüllerin temizlenmesi)
      const authorEl = card.querySelector('.ky-product-author');
      let author = '';
      if (authorEl) {
        const authorLinks = Array.from(authorEl.querySelectorAll('a'))
          .map((a) =>
            (a.textContent || '')
              .replace(/\s+/g, ' ')
              .trim()
              .replace(/^[,;\s]+|[,;\s]+$/g, '')
              .trim()
          )
          .filter(Boolean);
        if (authorLinks.length > 0) {
          author = authorLinks.join(', ');
        } else {
          author =
            (authorEl.textContent || '')
              .replace(/\s+/g, ' ')
              .trim()
              .replace(/^[,;\s]+|[,;\s]+$/g, '')
              .trim() || '';
        }
      }

      // 4. Yayınevi
      const publisherEl = card.querySelector('.ky-product-publisher');
      let publisher = '';
      if (publisherEl) {
        const pubLink = publisherEl.querySelector('a');
        publisher = pubLink
          ? pubLink.textContent?.trim() || ''
          : publisherEl.textContent?.trim().replace(/\s+/g, ' ') || '';
      }

      // 5. Kapak Resmi (wi:200 -> wi:500 CDN yükseltmesi)
      const imgEl = card.querySelector('.ky-product-cover img');
      let coverUrl = '';
      if (imgEl) {
        const rawSrc = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
        if (rawSrc) {
          coverUrl = rawSrc.replace(/wi:\d+/g, 'wi:500');
          if (coverUrl.startsWith('//')) {
            coverUrl = 'https:' + coverUrl;
          }
        }
      }

      // 6. Yıldız Puanı (Responsive çift rating konteynerinden sadece ilkini kullan)
      const firstRatingContainer = card.querySelector('.ky-product-rating');
      let rating: number | undefined = undefined;
      if (firstRatingContainer) {
        const selectedStars = firstRatingContainer.querySelectorAll('svg.ky-product-rating-star--selected').length;
        if (selectedStars > 0) {
          rating = selectedStars;
        }
      }

      // 7. Fiyat
      const priceEl = card.querySelector('.ky-product-sell-price');
      const price = priceEl?.textContent?.trim() || undefined;

      results.push({
        id,
        title,
        author,
        publisher,
        url: canonicalUrl,
        coverUrl,
        ...(rating !== undefined ? { rating } : {}),
        ...(price ? { price } : {}),
      });
    }

    return results;
  }

  /**
   * Kitap URL'si veya ürün ID'si ile tam kitap metaverisini getirir.
   */
  async getBookDetails(urlOrId: string): Promise<KitapyurduBookDetails> {
    const targetUrl = this.resolveBookUrl(urlOrId);
    const html = await fetchHtml(targetUrl);
    return this.parseBookDetails(html, targetUrl);
  }

  /**
   * Kitapyurdu ürün sayfası HTML içeriğini parse ederek BookMetadata nesnesine dönüştürür.
   */
  parseBookDetails(html: string, inputUrlOrId: string): KitapyurduBookDetails {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // 1. JSON-LD varlıklarını çıkar
    const { bookNode, productNode } = this.extractJsonLd(doc);

    // 2. ID ve Kanonik URL tespiti
    const { id, url } = this.resolveIdAndUrl(doc, inputUrlOrId, bookNode, productNode);

    // 3. Başlık
    const title = this.extractTitle(doc, bookNode, productNode);

    // 4. Yazarlar (Çoklu yazar, derleyici fallback)
    const author = this.extractAuthors(doc, bookNode);

    // 5. Yayınevi
    const publisher = this.extractPublisher(doc, bookNode);

    // 6. Çevirmenler (DOM özniteliklerinden, yoksa undefined)
    const translator = this.extractTranslators(doc);

    // 7. ISBN
    const isbn = this.extractIsbn(doc, bookNode, productNode);

    // 8. Sayfa sayısı
    const pages = this.extractPages(doc, bookNode);

    // 9. Yayın tarihi (ISO YYYY-MM-DD standardına normalize edilmiş)
    const publishDate = this.extractPublishDate(doc, bookNode);

    // 10. Kapak görseli (wi:800 yüksek çözünürlük)
    const coverUrl = this.extractCoverUrl(doc, bookNode, productNode);

    // 11. Açıklama
    const description = this.extractDescription(doc, bookNode, productNode);

    // 12. Puan ve değerlendirme sayısı (Baskısı tükenmiş veya puansız ise undefined)
    const { rating, ratingCount } = this.extractRatings(doc, productNode);

    return {
      id,
      url,
      title,
      author,
      publisher,
      ...(translator ? { translator } : {}),
      isbn,
      ...(pages !== undefined ? { pages } : {}),
      ...(publishDate ? { publishDate } : {}),
      ...(coverUrl ? { coverUrl } : {}),
      ...(description ? { description } : {}),
      ...(rating !== undefined ? { rating } : {}),
      ...(ratingCount !== undefined ? { ratingCount } : {}),
    };
  }

  // ==========================================
  // Dahili Ayrıştırma Alt Yöntemleri
  // ==========================================

  private resolveBookUrl(urlOrId: string): string {
    const trimmed = urlOrId.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed.split('?')[0];
    }
    const cleanId = trimmed.replace(/\D/g, '');
    return `${this.baseUrl}/kitap/product/${cleanId}.html`;
  }

  private extractJsonLd(doc: Document): {
    bookNode?: JsonLdBook;
    productNode?: JsonLdProduct;
  } {
    let bookNode: JsonLdBook | undefined;
    let productNode: JsonLdProduct | undefined;

    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
      const content = scripts[i].textContent?.trim();
      if (!content) continue;

      try {
        const parsed = JSON.parse(content);
        const nodes = Array.isArray(parsed['@graph'])
          ? parsed['@graph']
          : Array.isArray(parsed)
          ? parsed
          : [parsed];

        for (const node of nodes) {
          if (!node || typeof node !== 'object') continue;
          const rawType = node['@type'];
          const types = Array.isArray(rawType) ? rawType : [rawType];

          if (types.includes('Book') && !bookNode) {
            bookNode = node as JsonLdBook;
          }
          if (types.includes('Product') && !productNode) {
            productNode = node as JsonLdProduct;
          }
        }
      } catch {
        // Hatalı JSON bloklarını yoksay
      }
    }

    return { bookNode, productNode };
  }

  private resolveIdAndUrl(
    doc: Document,
    input: string,
    bookNode?: JsonLdBook,
    productNode?: JsonLdProduct
  ): { id: string; url: string } {
    let url =
      bookNode?.url ||
      productNode?.url ||
      doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ||
      (input.startsWith('http') ? input.split('?')[0] : '');

    let id = productNode?.sku || productNode?.productID || '';

    if (!id && url) {
      const idMatch = url.match(/\/(\d+)\.html/);
      if (idMatch) id = idMatch[1];
    }

    if (!id && !input.startsWith('http')) {
      id = input.replace(/\D/g, '');
    }

    if (!id) {
      const elWithId = doc.querySelector('[data-product-id]');
      id = elWithId?.getAttribute('data-product-id') || '';
    }

    if (!url && id) {
      url = `${this.baseUrl}/kitap/product/${id}.html`;
    }

    return { id, url };
  }

  private extractTitle(
    doc: Document,
    bookNode?: JsonLdBook,
    productNode?: JsonLdProduct
  ): string {
    const raw =
      bookNode?.name ||
      productNode?.name ||
      doc.querySelector('h1.ky-pd-title')?.textContent ||
      doc.querySelector('.ky-pd-heading h1')?.textContent ||
      '';
    return raw.trim();
  }

  private extractAuthors(doc: Document, bookNode?: JsonLdBook): string {
    // 1. DOM başlık yazarları (Çoklu yazar desteği ve sondaki virgülün temizlenmesi)
    const authorLinks = doc.querySelectorAll('.ky-pd-heading__authors a[href*="/yazar/"]');
    const authors: string[] = [];

    authorLinks.forEach((el) => {
      const name = (el.textContent || '').trim().replace(/,+$/, '').trim();
      if (name && !authors.includes(name)) {
        authors.push(name);
      }
    });

    if (authors.length > 0) {
      return authors.join(', ');
    }

    // 2. DOM özniteliklerinde derleyici / editör kontrolü
    const compilerLabels = ['derleyici:', 'hazırlayan:', 'editör:', 'derleyen:'];
    const compilerNames: string[] = [];
    const attributeItems = doc.querySelectorAll('.ky-pd-attributes__item');

    attributeItems.forEach((item) => {
      const label = item.querySelector('.ky-pd-attributes__label')?.textContent?.trim().toLowerCase() || '';
      if (compilerLabels.some((cl) => label.includes(cl))) {
        const valEl = item.querySelector('.ky-pd-attributes__value');
        const links = valEl?.querySelectorAll('a');
        if (links && links.length > 0) {
          links.forEach((a) => {
            const name = (a.textContent || '').trim().replace(/,+$/, '').trim();
            if (name && !compilerNames.includes(name)) compilerNames.push(name);
          });
        } else {
          const raw = (valEl?.textContent || '').trim().replace(/,+$/, '').trim();
          if (raw && !compilerNames.includes(raw)) compilerNames.push(raw);
        }
      }
    });

    if (compilerNames.length > 0) {
      return compilerNames.join(', ');
    }

    // 3. JSON-LD Book.author yedeği
    if (bookNode?.author) {
      if (typeof bookNode.author === 'string') {
        return bookNode.author.trim();
      }
      if (Array.isArray(bookNode.author)) {
        return bookNode.author
          .map((a) => (typeof a === 'string' ? a : a.name || ''))
          .filter(Boolean)
          .join(', ');
      }
      if (bookNode.author.name) {
        return bookNode.author.name.trim();
      }
    }

    return '';
  }

  private extractTranslators(doc: Document): string | undefined {
    const translators: string[] = [];
    const attributeItems = doc.querySelectorAll('.ky-pd-attributes__item');

    attributeItems.forEach((item) => {
      const label = item.querySelector('.ky-pd-attributes__label')?.textContent?.trim().toLowerCase() || '';
      if (label.includes('çevirmen') || label.includes('cevirmen')) {
        const valEl = item.querySelector('.ky-pd-attributes__value');
        const links = valEl?.querySelectorAll('a');
        if (links && links.length > 0) {
          links.forEach((a) => {
            const name = (a.textContent || '').trim().replace(/,+$/, '').trim();
            if (name && !translators.includes(name)) {
              translators.push(name);
            }
          });
        } else {
          const raw = (valEl?.textContent || '').trim();
          const splitNames = raw.split(',').map((s) => s.trim().replace(/,+$/, '').trim()).filter(Boolean);
          splitNames.forEach((n) => {
            if (!translators.includes(n)) translators.push(n);
          });
        }
      }
    });

    return translators.length > 0 ? translators.join(', ') : undefined;
  }

  private extractPublisher(doc: Document, bookNode?: JsonLdBook): string {
    if (bookNode?.publisher) {
      if (typeof bookNode.publisher === 'string') {
        return bookNode.publisher.trim();
      }
      if (bookNode.publisher.name) {
        return bookNode.publisher.name.trim();
      }
    }

    const pubLink = doc.querySelector('.ky-pd-heading__authors a[href*="/yayinevi/"]');
    if (pubLink?.textContent) {
      return pubLink.textContent.trim();
    }

    const attributeItems = doc.querySelectorAll('.ky-pd-attributes__item');
    for (let i = 0; i < attributeItems.length; i++) {
      const item = attributeItems[i];
      const label = item.querySelector('.ky-pd-attributes__label')?.textContent?.trim().toLowerCase() || '';
      if (label.includes('yayın evi') || label.includes('yayınevi')) {
        return (item.querySelector('.ky-pd-attributes__value')?.textContent || '').trim();
      }
    }

    return '';
  }

  private extractIsbn(
    doc: Document,
    bookNode?: JsonLdBook,
    productNode?: JsonLdProduct
  ): string {
    const raw = bookNode?.isbn || productNode?.gtin13;
    if (raw) {
      return String(raw).trim().replace(/[^\dX]/gi, '');
    }

    const attributeItems = doc.querySelectorAll('.ky-pd-attributes__item');
    for (let i = 0; i < attributeItems.length; i++) {
      const item = attributeItems[i];
      const label = item.querySelector('.ky-pd-attributes__label')?.textContent?.trim().toLowerCase() || '';
      if (label.includes('isbn')) {
        return (item.querySelector('.ky-pd-attributes__value')?.textContent || '')
          .trim()
          .replace(/[^\dX]/gi, '');
      }
    }

    return '';
  }

  private extractPages(doc: Document, bookNode?: JsonLdBook): number | undefined {
    if (bookNode?.numberOfPages) {
      const parsed = parseInt(String(bookNode.numberOfPages), 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    const attributeItems = doc.querySelectorAll('.ky-pd-attributes__item');
    for (let i = 0; i < attributeItems.length; i++) {
      const item = attributeItems[i];
      const label = item.querySelector('.ky-pd-attributes__label')?.textContent?.trim().toLowerCase() || '';
      if (label.includes('sayfa')) {
        const valText = item.querySelector('.ky-pd-attributes__value')?.textContent || '';
        const digits = valText.replace(/\D/g, '');
        const parsed = parseInt(digits, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    }

    return undefined;
  }

  private extractPublishDate(doc: Document, bookNode?: JsonLdBook): string | undefined {
    if (bookNode?.datePublished) {
      return this.normalizeDate(bookNode.datePublished);
    }

    const attributeItems = doc.querySelectorAll('.ky-pd-attributes__item');
    for (let i = 0; i < attributeItems.length; i++) {
      const item = attributeItems[i];
      const label = item.querySelector('.ky-pd-attributes__label')?.textContent?.trim().toLowerCase() || '';
      if (label.includes('yayın tarihi') || label.includes('yayin tarihi')) {
        const valText = item.querySelector('.ky-pd-attributes__value')?.textContent?.trim();
        return this.normalizeDate(valText);
      }
    }

    return undefined;
  }

  private normalizeDate(rawDate?: string): string | undefined {
    if (!rawDate) return undefined;
    const trimmed = rawDate.trim();

    // ISO formatı YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    // Türkçe nokta formatı DD.MM.YYYY -> YYYY-MM-DD
    const dotParts = trimmed.split('.');
    if (dotParts.length === 3) {
      const [d, m, y] = dotParts;
      if (y.length === 4) {
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }

    // Sadece yıl
    if (/^\d{4}$/.test(trimmed)) {
      return trimmed;
    }

    return trimmed || undefined;
  }

  private extractCoverUrl(
    doc: Document,
    bookNode?: JsonLdBook,
    productNode?: JsonLdProduct
  ): string | undefined {
    let cover: string | undefined;

    const rawImg = bookNode?.image || productNode?.image;
    if (typeof rawImg === 'string') {
      cover = rawImg;
    } else if (rawImg && typeof rawImg === 'object' && rawImg.url) {
      cover = rawImg.url;
    }

    if (!cover) {
      const bookCoverEl = doc.querySelector('#js-book-cover img') || doc.querySelector('#js-book-cover');
      cover =
        bookCoverEl?.getAttribute('data-zoom-image') ||
        bookCoverEl?.getAttribute('data-popup-image') ||
        bookCoverEl?.getAttribute('src') ||
        undefined;
    }

    if (!cover) {
      cover = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || undefined;
    }

    if (!cover) return undefined;

    if (cover.startsWith('//')) {
      cover = 'https:' + cover;
    }

    // wi:800 yüksek çözünürlüklü CDN görseli yükseltmesi
    return cover.replace(/\/wi:\d+\//, '/wi:800/').replace(/\/mh:\d+\//, '/wi:800/');
  }

  private extractDescription(
    doc: Document,
    bookNode?: JsonLdBook,
    productNode?: JsonLdProduct
  ): string | undefined {
    const raw =
      bookNode?.description ||
      productNode?.description ||
      doc.querySelector('.ky-pd-about__description-content')?.textContent ||
      doc.querySelector('#description_text')?.textContent ||
      '';
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private extractRatings(
    doc: Document,
    productNode?: JsonLdProduct
  ): { rating?: number; ratingCount?: number } {
    let rating: number | undefined;
    let ratingCount: number | undefined;

    if (productNode?.aggregateRating) {
      const agg = productNode.aggregateRating;
      if (agg.ratingValue !== undefined && agg.ratingValue !== null) {
        const val = parseFloat(String(agg.ratingValue));
        if (!isNaN(val) && val > 0) rating = val;
      }
      if (agg.ratingCount !== undefined && agg.ratingCount !== null) {
        const count = parseInt(String(agg.ratingCount), 10);
        if (!isNaN(count) && count > 0) ratingCount = count;
      }
    }

    // aggregateRating yoksa DOM başlık sarı yıldız kontrolü
    if (rating === undefined) {
      const yellowStars = doc.querySelectorAll('.ky-pd-heading__rating svg.text-yellow, .ky-pd-heading__rating svg.ky-icon__star.text-yellow').length;
      if (yellowStars > 0) {
        rating = yellowStars;
      }
    }

    if (ratingCount === undefined) {
      const reviewText = doc.querySelector('.ky-pd-heading__review-count')?.textContent || '';
      const match = reviewText.match(/(\d+)/);
      if (match) {
        const count = parseInt(match[1], 10);
        if (!isNaN(count) && count > 0) ratingCount = count;
      }
    }

    return { rating, ratingCount };
  }
}
