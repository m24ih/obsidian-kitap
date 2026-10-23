import { BookMetadata, SearchResultItem } from '../types';

/**
 * Genel kitap metaveri sağlayıcı arayüzü
 */
export interface IBookProvider {
  readonly id: string;
  readonly name: string;
  search(query: string): Promise<SearchResultItem[]>;
  getBookDetails(urlOrId: string): Promise<BookMetadata>;
}

/**
 * Sağlayıcı temel bilgi modeli
 */
export interface ProviderInfo {
  id: string;
  name: string;
  description?: string;
}

/**
 * Varsayılan sağlayıcı tanımları
 */
export const DEFAULT_PROVIDERS: ProviderInfo[] = [
  { id: 'kitapyurdu', name: 'Kitapyurdu' },
];

/**
 * Kitapyurdu arama sonuç kartı veri modeli
 */
export interface KitapyurduSearchResult extends SearchResultItem {
  price?: string;
  details?: {
    pages?: number;
    publishDate?: string;
    binding?: string;
  };
}

/**
 * Kitapyurdu kitap detay veri modeli
 * Not: Opsiyonel alanlar null yerine undefined olmalıdır.
 */
export interface KitapyurduBookDetails extends BookMetadata {
  reviewCount?: number;
  binding?: string;
  paperType?: string;
  language?: string;
  price?: string;
  genres?: string[];
  originalTitle?: string;
  format?: string;
}

/**
 * Kitapyurdu sağlayıcı arayüzü
 */
export interface IKitapyurduProvider {
  search(query: string): Promise<KitapyurduSearchResult[]>;
  getBookDetails(urlOrId: string): Promise<KitapyurduBookDetails>;
}
