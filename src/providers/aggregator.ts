import {
  BookMetadata,
  KitapPluginSettings,
  SearchResultItem,
} from '../types';
import { KitapyurduProvider } from './kitapyurdu';
import { IKitapyurduProvider } from './types';

export interface IBookAggregator {
  search(query: string): Promise<SearchResultItem[]>;
  getFullBookData(
    searchItem: SearchResultItem,
    settings?: KitapPluginSettings
  ): Promise<BookMetadata>;
}

/**
 * Kitapyurdu bibliyografik verilerini çeken toplayıcı servis.
 */
export class BookAggregator implements IBookAggregator {
  private readonly kyProvider: IKitapyurduProvider;

  constructor(kyProvider: IKitapyurduProvider = new KitapyurduProvider()) {
    this.kyProvider = kyProvider;
  }

  /**
   * Kitap aramasını birincil sağlayıcı (Kitapyurdu) üzerinden yürütür.
   */
  async search(query: string): Promise<SearchResultItem[]> {
    return this.kyProvider.search(query);
  }

  /**
   * Seçilen arama öğesi için Kitapyurdu kitap detaylarını çeker.
   */
  async getFullBookData(
    searchItem: SearchResultItem,
    _settings?: KitapPluginSettings
  ): Promise<BookMetadata> {
    const targetUrlOrId = searchItem.url || searchItem.id;
    return this.kyProvider.getBookDetails(targetUrlOrId);
  }
}
