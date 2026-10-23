import { BookMetadata, SearchResultItem } from '../types';
import { fetchJson } from '../utils/http';
import {
  DrAttribute,
  DrPerson,
  DrProductDetailsData,
  DrSearchProduct,
  DrSpecification,
  IBookProvider,
  IDrProvider,
} from './types';

export interface DrSearchResponse {
  Result?: {
    Products?: DrSearchProduct[];
    TotalCount?: number;
  };
  data?: {
    Products?: DrSearchProduct[];
  };
  Products?: DrSearchProduct[];
}

export interface DrDetailsResponse {
  data?: DrProductDetailsData;
  Data?: DrProductDetailsData;
  Result?: DrProductDetailsData;
}

/**
 * Checks whether an input string looks like an ISBN-10 or ISBN-13 (with optional hyphens/spaces/prefix).
 */
export function isIsbn(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  const stripped = input.trim().replace(/^isbn\s*:?\s*/i, '').replace(/[-\s]/g, '');
  return (
    (stripped.length === 13 && /^97[89]\d{10}$/.test(stripped)) ||
    (stripped.length === 10 && /^\d{9}[\dX]$/i.test(stripped))
  );
}

/**
 * Normalizes an ISBN string to uppercase digits/X without hyphens or prefix.
 */
export function cleanIsbn(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/^isbn\s*:?\s*/i, '')
    .replace(/[-\s]/g, '')
    .toUpperCase();
}

/**
 * Extracts internal D&R StockCode from a given URL, barcode, or ID string.
 */
export function extractStockCode(urlOrId: string): string {
  const trimmed = (urlOrId || '').trim();
  if (!trimmed) return '';

  // If it's a formatted or raw ISBN, do not treat it as a direct StockCode
  if (isIsbn(trimmed)) {
    return cleanIsbn(trimmed);
  }

  // 1. Direct StockCode (typically 6-20 alphanumeric characters, no slashes or dots or colons)
  if (/^[a-zA-Z0-9_-]{6,20}$/.test(trimmed) && !trimmed.includes('/') && !trimmed.includes(':')) {
    return trimmed;
  }

  // 2. URL parameter: urunno=0000000662978
  const urunNoMatch = trimmed.match(/urunno=([a-zA-Z0-9]+)/i);
  if (urunNoMatch) {
    return urunNoMatch[1];
  }

  // 3. CDN image URL: originals/0000000662978-1.jpg
  const cdnMatch = trimmed.match(/originals\/([a-zA-Z0-9]+)-/i);
  if (cdnMatch) {
    return cdnMatch[1];
  }

  // 4. URL path segment: /urun/0000000662978
  const productPathMatch = trimmed.match(/\/urun\/([a-zA-Z0-9]+)/i);
  if (productPathMatch) {
    return productPathMatch[1];
  }

  // 5. Product slug ending with -k-0000000662978 or -0000000662978 (e.g. /dune-k-0000000662978)
  const slugDigitsMatch = trimmed.match(/[-/_](?:k[-_]?)?(\d{7,15})(?:\.html|[/?#]|$)/i);
  if (slugDigitsMatch) {
    return slugDigitsMatch[1];
  }

  // 6. .html path match /0000000662978.html
  const htmlMatch = trimmed.match(/\/([a-zA-Z0-9]+)\.html/i);
  if (htmlMatch) {
    return htmlMatch[1];
  }

  // 7. Trailing digits match (e.g. /dune/0000000662978)
  const trailingDigitsMatch = trimmed.match(/\/(\d{7,15})(?:\/|\?|#|$)/);
  if (trailingDigitsMatch) {
    return trailingDigitsMatch[1];
  }

  // 8. Any 000xxxxxx pattern in the string (classic D&R stock code format)
  const tripleZeroMatch = trimmed.match(/\b(000\d{6,12})\b/);
  if (tripleZeroMatch) {
    return tripleZeroMatch[1];
  }

  return trimmed;
}

/**
 * Normalizes D&R contributors (authors and translators) from various API payload shapes.
 */
export function parseDrPersons(
  rawPersons?: { Person?: DrPerson | DrPerson[]; Persons?: DrPerson | DrPerson[] } | DrPerson[] | null
): { authors: string[]; translators: string[] } {
  if (!rawPersons) return { authors: [], translators: [] };

  let list: DrPerson[] = [];
  if (Array.isArray(rawPersons)) {
    list = rawPersons;
  } else if (rawPersons.Person) {
    list = Array.isArray(rawPersons.Person) ? rawPersons.Person : [rawPersons.Person];
  } else if (rawPersons.Persons) {
    list = Array.isArray(rawPersons.Persons) ? rawPersons.Persons : [rawPersons.Persons];
  }

  const authors: string[] = [];
  const translators: string[] = [];

  for (const p of list) {
    if (!p || typeof p !== 'object') continue;
    const name: string = (p.FullName || p.Name || p.PersonName || p.AuthorName || p.Title || '').trim();
    if (!name) continue;

    const group = (p.Group || '').toLowerCase();
    const groupCode = p.GroupCode !== undefined ? Number(p.GroupCode) : undefined;

    if (groupCode === 1 || group.includes('yazar') || group.includes('author')) {
      if (!authors.includes(name)) authors.push(name);
    } else if (
      groupCode === 2 ||
      group.includes('çevirmen') ||
      group.includes('cevirmen') ||
      group.includes('translator')
    ) {
      if (!translators.includes(name)) translators.push(name);
    } else {
      // Default to author if group is unspecified or generic
      if (!group && !groupCode) {
        if (!authors.includes(name)) authors.push(name);
      }
    }
  }

  return { authors, translators };
}

/**
 * Parses and extracts known book attributes and specifications from D&R items.
 */
export function parseDrAttributes(attrs?: (DrAttribute | DrSpecification)[]): {
  pages?: number;
  language?: string;
  publishDate?: string;
  format?: string;
  paperType?: string;
  dimensions?: string;
  edition?: string;
  originalTitle?: string;
  genres?: string[];
  isbn?: string;
} {
  if (!Array.isArray(attrs)) return {};

  let pages: number | undefined;
  let language: string | undefined;
  let publishDate: string | undefined;
  let format: string | undefined;
  let paperType: string | undefined;
  let dimensions: string | undefined;
  let edition: string | undefined;
  let originalTitle: string | undefined;
  let genres: string[] | undefined;
  let isbn: string | undefined;

  for (const item of attrs) {
    if (!item || typeof item !== 'object') continue;
    const name = (
      item.Name ||
      item.Key ||
      (item as DrAttribute).Definition ||
      (item as DrAttribute).AttributeName ||
      (item as DrSpecification).SpecificationAttributeName ||
      ''
    )
      .trim()
      .toLowerCase();

    const value = (
      item.Value ||
      (item as DrAttribute).AttributeValue ||
      (item as DrAttribute).Val ||
      ''
    ).trim();

    if (!value) continue;

    if (name.includes('sayfa')) {
      const digits = value.replace(/\D/g, '');
      const parsed = parseInt(digits, 10);
      if (!isNaN(parsed) && parsed > 0 && pages === undefined) {
        pages = parsed;
      }
    } else if (name === 'dil' || name.includes('dili')) {
      if (!language) language = value;
    } else if (
      name.includes('baskı yılı') ||
      name.includes('baski yili') ||
      name.includes('basım yılı') ||
      name.includes('basim yili') ||
      name.includes('yayın tarihi') ||
      name.includes('yayin tarihi') ||
      name.includes('yayın yılı') ||
      name.includes('yayin yili') ||
      name.includes('ilk baskı yılı') ||
      name.includes('ilk baski yili')
    ) {
      if (!publishDate) publishDate = normalizeDrDate(value);
    } else if (
      name.includes('medya cinsi') ||
      name.includes('cilt tipi') ||
      name.includes('kapak türü') ||
      name.includes('format')
    ) {
      if (!format) format = value;
    } else if (name.includes('kağıt') || name.includes('kagit') || name.includes('hamur')) {
      if (!paperType) paperType = value;
    } else if (name.includes('ebat') || name.includes('boyut')) {
      if (!dimensions) dimensions = value;
    } else if (name.includes('baskı sayısı') || name.includes('basım sayısı')) {
      if (!edition) edition = value;
    } else if (
      name.includes('orijinal adı') ||
      name.includes('orijinal adi') ||
      name.includes('özgün adı') ||
      name.includes('original title') ||
      name.includes('original name')
    ) {
      if (!originalTitle) originalTitle = value;
    } else if (
      name === 'kategori' ||
      name === 'tür' ||
      name === 'türü' ||
      name === 'kategori adı' ||
      name === 'alt kategori'
    ) {
      if (!genres) genres = [];
      const parts = value.split(/[/>,]/).map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        if (!genres.includes(part)) genres.push(part);
      }
    } else if (name === 'barkod' || name === 'barcode' || name === 'isbn') {
      const clean = value.replace(/[^\dX]/gi, '');
      if (clean && !isbn) isbn = clean;
    }
  }

  return {
    pages,
    language,
    publishDate,
    format,
    paperType,
    dimensions,
    edition,
    originalTitle,
    genres,
    isbn,
  };
}

/**
 * Normalizes publication date strings to YYYY-MM-DD or 4-digit YYYY.
 * Handles ISO strings with time components gracefully.
 */
export function normalizeDrDate(dateStr?: string): string | undefined {
  if (!dateStr || typeof dateStr !== 'string') return undefined;
  const trimmed = dateStr.trim();
  if (!trimmed) return undefined;

  // DD.MM.YYYY
  const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const [, d, m, y] = dotMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD/MM/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, d, m, y] = slashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // 4-digit year (e.g. 2021)
  const yearMatch = trimmed.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    return yearMatch[1];
  }

  return trimmed;
}

/**
 * Cleans HTML tags, breaks, entities, scripts, and styles from book synopsis/blurb.
 */
export function cleanHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  const prepared = html
    .replace(/\r/g, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n');

  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(prepared, 'text/html');
      const text = doc.body.textContent || '';
      return text
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    } catch {
      // Fallback below
    }
  }

  return prepared
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Normalizes D&R ratings (0-10 scale) to 5-scale.
 */
export function normalizeDrRating(rating: unknown): number | undefined {
  if (rating === undefined || rating === null) return undefined;
  let num: number;
  if (typeof rating === 'number') {
    num = rating;
  } else if (typeof rating === 'string') {
    num = parseFloat(rating.replace(',', '.'));
  } else {
    return undefined;
  }
  if (isNaN(num) || num <= 0) return undefined;
  const normalized = Math.min(5, num / 2);
  return Math.round(normalized * 10) / 10;
}

/**
 * Helper to format a number into Turkish Lira currency format (e.g. 245,50 TL).
 * Avoids locale differences across Node/Electron environments.
 */
function formatTurkishCurrency(num: number): string {
  const fixed = num.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formattedInt},${decPart} TL`;
}

/**
 * Formats book prices cleanly with TL suffix.
 */
export function formatDrPrice(price: unknown): string | undefined {
  if (price === undefined || price === null || price === '') return undefined;
  if (typeof price === 'number') {
    if (price <= 0) return undefined;
    return formatTurkishCurrency(price);
  }
  if (typeof price !== 'string') return undefined;
  const str = price.trim();
  if (!str) return undefined;
  if (/^\d+(?:[.,]\d+)?$/.test(str)) {
    const num = parseFloat(str.replace(',', '.'));
    if (!isNaN(num) && num > 0) {
      return formatTurkishCurrency(num);
    }
  }
  return str.endsWith('TL') ? str : `${str} TL`;
}

/**
 * D&R (dr.com.tr) Kitap Metaveri Sağlayıcısı
 */
export class DrProvider implements IDrProvider, IBookProvider {
  readonly id: string = 'dr';
  readonly name: string = 'D&R';
  private readonly baseUrl = 'https://www.dr.com.tr';
  private readonly searchCache: Map<string, DrSearchProduct> = new Map();
  private readonly maxCacheEntries = 100;

  /**
   * Caches product metadata with bounded size eviction.
   */
  private setCache(key: string, product: DrSearchProduct): void {
    if (this.searchCache.size >= this.maxCacheEntries) {
      const firstKey = this.searchCache.keys().next().value;
      if (firstKey) this.searchCache.delete(firstKey);
    }
    this.searchCache.set(key, product);
  }

  /**
   * D&R arama servisi üzerinden kitap arar.
   */
  async search(query: string): Promise<SearchResultItem[]> {
    const trimmed = (query || '').trim();
    if (!trimmed) return [];

    // Normalize ISBN queries to digits for clean barcode search
    const searchQuery = isIsbn(trimmed) ? cleanIsbn(trimmed) : trimmed;

    const payload = {
      Q: searchQuery,
      Page: 1,
      PageSize: 20,
      SortType: 1,
      SortOrder: 1,
      ShowNotForSale: true,
      CategoryId: 10001,
    };

    try {
      const response = await fetchJson<DrSearchResponse>(
        `${this.baseUrl}/Catalog/AsyncSearch`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          contentType: 'application/json',
          body: JSON.stringify(payload),
        }
      );

      return this.parseSearchResults(response);
    } catch (error) {
      console.error('D&R arama hatası:', error);
      return [];
    }
  }

  /**
   * D&R AsyncSearch yanıtını ayrıştırarak SearchResultItem listesine dönüştürür.
   */
  parseSearchResults(response: DrSearchResponse): SearchResultItem[] {
    const products =
      response?.Result?.Products ||
      response?.data?.Products ||
      response?.Products ||
      [];

    if (!Array.isArray(products)) {
      return [];
    }

    const items: SearchResultItem[] = [];

    for (const product of products) {
      if (!product || typeof product !== 'object') continue;

      const stockCode = product.StockCode ? String(product.StockCode).trim() : '';
      const barcode = product.Barcode ? String(product.Barcode).replace(/[^\dX]/gi, '') : '';
      const id = stockCode || barcode;
      if (!id) continue;

      // Cache product for getBookDetails
      if (stockCode) {
        this.setCache(stockCode, product);
      }
      if (barcode) {
        this.setCache(barcode, product);
      }

      const title = (product.Name || '').trim();
      const publisher = (
        product.Manufacturer ||
        product.PublisherName ||
        product.BrandName ||
        ''
      ).trim();
      const { authors } = parseDrPersons(product.Persons);
      const author = authors.join(', ');

      const coverUrl = stockCode
        ? `https://i.dr.com.tr/cache/600x600-0/originals/${stockCode}-1.jpg`
        : (product.DefaultPictureModel?.ImageUrl || product.ImageUrl || '');

      let url = '';
      if (product.Url) {
        url = product.Url.startsWith('http')
          ? product.Url
          : `${this.baseUrl}${product.Url.startsWith('/') ? '' : '/'}${product.Url}`;
      } else if (stockCode) {
        url = `${this.baseUrl}/kitap/urun/${stockCode}`;
      }

      const rating = normalizeDrRating(product.Rating);

      items.push({
        id,
        title,
        author,
        publisher,
        url,
        coverUrl,
        rating,
        provider: this.id,
      });
    }

    return items;
  }

  /**
   * Kitap URL'si veya StockCode kodu ile detaylı kitap metaverilerini çeker.
   */
  async getBookDetails(urlOrId: string): Promise<BookMetadata> {
    const trimmed = (urlOrId || '').trim();
    if (!trimmed) {
      throw new Error('Geçersiz D&R kitap bağlantısı veya ürün kodu.');
    }

    let stockCode = '';

    // Handle ISBN input: D&R AsyncProductDetails accepts StockCode only, NOT ISBN.
    // Query Catalog/AsyncSearch to find corresponding StockCode if not cached.
    if (isIsbn(trimmed)) {
      const targetIsbn = cleanIsbn(trimmed);
      const cached = this.searchCache.get(targetIsbn);
      if (cached?.StockCode) {
        stockCode = String(cached.StockCode);
      } else {
        const searchResults = await this.search(targetIsbn);
        if (searchResults.length > 0 && searchResults[0].id) {
          stockCode = searchResults[0].id;
        } else {
          throw new Error(`D&R üzerinde bu ISBN ile kitap bulunamadı: ${trimmed}`);
        }
      }
    } else {
      stockCode = extractStockCode(trimmed);
    }

    if (!stockCode) {
      throw new Error('Geçersiz D&R kitap bağlantısı veya ürün kodu.');
    }

    // Call Details Endpoint
    let detailsData: DrProductDetailsData = {};
    try {
      const response = await fetchJson<DrDetailsResponse>(
        `${this.baseUrl}/Product/AsyncProductDetails`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          contentType: 'application/json',
          body: JSON.stringify({
            code: stockCode,
            bookId: '',
          }),
        }
      );
      detailsData = response?.data || response?.Data || response?.Result || {};
    } catch (error) {
      console.warn('D&R ürün detay isteği başarısız oldu:', error);
    }

    // Ensure we have search metadata for fields not provided by AsyncProductDetails
    // (e.g. Barcode, Rating, RatingCount, Price, Attributes like Sayfa Sayısı / Dil)
    let cached = this.searchCache.get(stockCode);
    if (!cached) {
      const searchRes = await this.search(stockCode);
      if (searchRes.length > 0) {
        cached = this.searchCache.get(stockCode) || cached;
      }
    }

    const metadata = this.buildBookMetadata(stockCode, detailsData, cached, trimmed);

    if (!metadata.title) {
      throw new Error(`D&R üzerinde kitap bilgileri alınamadı: ${trimmed}`);
    }

    return metadata;
  }

  /**
   * Ürün detay ve arama verilerini birleştirerek standart BookMetadata nesnesi oluşturur.
   */
  buildBookMetadata(
    stockCode: string,
    details: DrProductDetailsData,
    cached?: DrSearchProduct,
    originalInput = ''
  ): BookMetadata {
    const title = (details.ProductName || details.Name || cached?.Name || '').trim();

    // Attributes & Specifications
    const specs = parseDrAttributes([
      ...(cached?.Attributes || []),
      ...(details.ProductSpecifications || []),
    ]);

    const isbn = (
      details.Barcode ||
      cached?.Barcode ||
      specs.isbn ||
      (isIsbn(originalInput) ? cleanIsbn(originalInput) : '')
    ).replace(/[^\dX]/gi, '');

    const publisher = (
      details.PublisherName ||
      details.Manufacturer ||
      cached?.PublisherName ||
      cached?.Manufacturer ||
      cached?.BrandName ||
      ''
    ).trim();

    // Persons: Details takes precedence, fallback to search persons
    const { authors: detailAuthors, translators: detailTranslators } = parseDrPersons(
      details.ProductPersons
    );
    const { authors: cachedAuthors, translators: cachedTranslators } = parseDrPersons(
      cached?.Persons
    );

    const author = (detailAuthors.length > 0 ? detailAuthors : cachedAuthors).join(', ');
    const translatorList = detailTranslators.length > 0 ? detailTranslators : cachedTranslators;
    const translator = translatorList.length > 0 ? translatorList.join(', ') : undefined;

    // High resolution CDN cover
    const coverUrl = stockCode
      ? `https://i.dr.com.tr/cache/600x600-0/originals/${stockCode}-1.jpg`
      : (details.DefaultPictureModel?.ImageUrl || cached?.DefaultPictureModel?.ImageUrl || '');

    // Canonical URL
    let url = '';
    if (cached?.Url) {
      url = cached.Url.startsWith('http')
        ? cached.Url
        : `${this.baseUrl}${cached.Url.startsWith('/') ? '' : '/'}${cached.Url}`;
    } else if (details.Url) {
      url = details.Url.startsWith('http')
        ? details.Url
        : `${this.baseUrl}${details.Url.startsWith('/') ? '' : '/'}${details.Url}`;
    } else if (originalInput.startsWith('http')) {
      url = originalInput;
    } else if (stockCode) {
      url = `${this.baseUrl}/kitap/urun/${stockCode}`;
    }

    // Description: Clean HTML
    const rawDesc =
      details.FullDescription || details.Description || details.ShortDescription || '';
    const description = cleanHtml(rawDesc) || undefined;

    // Rating
    const rawRating = details.Rating ?? cached?.Rating;
    const rating = normalizeDrRating(rawRating);

    // Rating Count
    const ratingCount = details.RatingCount ?? cached?.RatingCount ?? undefined;

    // Price
    const rawPrice = details.Price ?? cached?.Price;
    const price = formatDrPrice(rawPrice);

    return {
      id: stockCode,
      url,
      title,
      author,
      publisher,
      ...(translator ? { translator } : {}),
      isbn,
      ...(specs.pages !== undefined ? { pages: specs.pages } : {}),
      ...(specs.publishDate ? { publishDate: specs.publishDate } : {}),
      coverUrl,
      ...(description ? { description } : {}),
      ...(rating !== undefined ? { rating } : {}),
      ...(ratingCount !== undefined ? { ratingCount } : {}),
      ...(price ? { price } : {}),
      ...(specs.format ? { format: specs.format } : {}),
      ...(specs.language ? { language: specs.language } : {}),
      ...(specs.originalTitle ? { originalTitle: specs.originalTitle } : {}),
      ...(specs.genres && specs.genres.length > 0 ? { genres: specs.genres } : {}),
      provider: this.id,
    };
  }
}
