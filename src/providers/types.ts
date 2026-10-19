import { BookMetadata, SearchResultItem } from '../types';

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
