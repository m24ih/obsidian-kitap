import { BookMetadata, SearchResultItem, BookQuote } from '../types';

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
}

/**
 * Kitapyurdu sağlayıcı arayüzü
 */
export interface IKitapyurduProvider {
  search(query: string): Promise<KitapyurduSearchResult[]>;
  getBookDetails(urlOrId: string): Promise<KitapyurduBookDetails>;
}

/**
 * 1000Kitap sağlayıcı arayüzü (Milestone 3 entegrasyonu için)
 */
export interface IBinkitapProvider {
  enrich(title: string, author: string, maxQuotes: number): Promise<Partial<BookMetadata>>;
  search?(query: string): Promise<SearchResultItem[]>;
  getBookDetails?(url: string): Promise<Partial<BookMetadata>>;
  getQuotes?(url: string, maxQuotes: number): Promise<BookQuote[]>;
}
