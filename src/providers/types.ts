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
  { id: 'hybrid', name: 'Hibrit (Kitapyurdu + D&R)' },
  { id: 'kitapyurdu', name: 'Kitapyurdu' },
  { id: 'dr', name: 'D&R' },
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

/**
 * D&R kişi / katkıda bulunan veri modeli
 */
export interface DrPerson {
  Group?: string;
  GroupCode?: number | string;
  PersonGroupName?: string;
  GroupNameCode?: number | string;
  Role?: string;
  Duty?: string;
  Name?: string;
  FullName?: string;
  PersonName?: string;
  AuthorName?: string;
  Title?: string;
}

/**
 * D&R ürün nitelik / attribute veri modeli
 */
export interface DrAttribute {
  Name?: string;
  Key?: string;
  Definition?: string;
  AttributeName?: string;
  Text?: string;
  Value?: string | number;
  AttributeValue?: string | number;
  Val?: string | number;
  ValueRaw?: string | number;
  Option?: {
    ValueText?: string;
    Text?: string;
    Value?: string;
    Name?: string;
  } | string;
}

/**
 * D&R ürün teknik özellikleri veri modeli
 */
export interface DrSpecification {
  SpecificationAttributeName?: string;
  Name?: string;
  Key?: string;
  Text?: string;
  Value?: string | number;
  AttributeValue?: string | number;
  ValueRaw?: string | number;
  Option?: {
    ValueText?: string;
    Text?: string;
    Value?: string;
    Name?: string;
  } | string;
}

/**
 * D&R arama sonucu ürün veri modeli
 */
export interface DrSearchProduct {
  StockCode: string;
  Barcode?: string;
  Name: string;
  Manufacturer?: string;
  PublisherName?: string;
  BrandName?: string;
  Price?: number | string;
  Rating?: number;
  RatingCount?: number;
  Persons?: { Person?: DrPerson | DrPerson[] } | DrPerson[];
  Attributes?: DrAttribute[];
  Url?: string;
  SeoLink?: string;
  DefaultPictureModel?: { ImageUrl?: string };
  ImageUrl?: string;
}

/**
 * D&R ürün detay yanıt veri modeli
 */
export interface DrProductDetailsData {
  StockCode?: string;
  Name?: string;
  ProductName?: string;
  Barcode?: string;
  Manufacturer?: string;
  PublisherName?: string;
  Price?: number | string;
  Rating?: number;
  RatingCount?: number;
  FullDescription?: string;
  Description?: string;
  ShortDescription?: string;
  ProductSpecifications?: DrSpecification[];
  ProductPersons?: { Person?: DrPerson | DrPerson[] } | DrPerson[];
  DefaultPictureModel?: { ImageUrl?: string };
  Url?: string;
}

/**
 * D&R sağlayıcı arayüzü
 */
export interface IDrProvider extends IBookProvider {
  search(query: string): Promise<SearchResultItem[]>;
  getBookDetails(urlOrId: string): Promise<BookMetadata>;
}

/**
 * OpenLibrary sağlayıcı arayüzü
 */
export interface IOpenLibraryProvider extends IBookProvider {
  search(query: string): Promise<SearchResultItem[]>;
  getBookDetails(urlOrId: string): Promise<BookMetadata>;
}

/**
 * Hardcover sağlayıcı arayüzü
 */
export interface IHardcoverProvider extends IBookProvider {
  search(query: string): Promise<SearchResultItem[]>;
  getBookDetails(urlOrId: string): Promise<BookMetadata>;
}

