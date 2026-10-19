import {
  BookMetadata,
  DEFAULT_SETTINGS,
  KitapPluginSettings,
  SearchResultItem,
} from '../types';
import { BinkitapProvider } from './binkitap';
import { KitapyurduProvider } from './kitapyurdu';
import { IBinkitapProvider, IKitapyurduProvider } from './types';

export interface IBookAggregator {
  search(query: string): Promise<SearchResultItem[]>;
  getFullBookData(
    searchItem: SearchResultItem,
    settings?: KitapPluginSettings
  ): Promise<BookMetadata>;
}

/**
 * Kitapyurdu birincil bibliyografik verisi ile 1000Kitap ikincil okur verilerini
 * (puan, okunma sayısı, popüler alıntılar) birleştiren hibrit toplayıcı servis.
 */
export class BookAggregator implements IBookAggregator {
  private readonly kyProvider: IKitapyurduProvider;
  private readonly bkProvider: IBinkitapProvider;

  constructor(
    kyProvider: IKitapyurduProvider = new KitapyurduProvider(),
    bkProvider: IBinkitapProvider = new BinkitapProvider()
  ) {
    this.kyProvider = kyProvider;
    this.bkProvider = bkProvider;
  }

  /**
   * Kitap aramasını birincil sağlayıcı (Kitapyurdu) üzerinden yürütür.
   */
  async search(query: string): Promise<SearchResultItem[]> {
    return this.kyProvider.search(query);
  }

  /**
   * Seçilen arama öğesi için Kitapyurdu detaylarını çeker ve 1000Kitap verileriyle zenginleştirir.
   * 1000Kitap hata verirse veya sonuç bulamazsa asla çökmez; saf Kitapyurdu verisini döndürür.
   */
  async getFullBookData(
    searchItem: SearchResultItem,
    settings: KitapPluginSettings = DEFAULT_SETTINGS
  ): Promise<BookMetadata> {
    const targetUrlOrId = searchItem.url || searchItem.id;
    const baseMetadata = await this.kyProvider.getBookDetails(targetUrlOrId);

    let enrichment: Partial<BookMetadata> = {
      binkitapRating: undefined,
      quotes: [],
    };

    try {
      const result = await this.bkProvider.enrich(
        baseMetadata.title || searchItem.title,
        baseMetadata.author || searchItem.author,
        settings.maxQuotes
      );
      if (result && typeof result === 'object') {
        enrichment = result;
      }
    } catch {
      // 1000Kitap hataları not üretimini asla durdurmamalıdır (Graceful Degradation)
      enrichment = {
        binkitapRating: undefined,
        quotes: [],
      };
    }

    const quotes = settings.includeQuotes
      ? (enrichment.quotes ?? []).slice(0, settings.maxQuotes)
      : [];

    return {
      ...baseMetadata,
      binkitapRating: enrichment.binkitapRating,
      ...(enrichment.binkitapReadCount
        ? { binkitapReadCount: enrichment.binkitapReadCount }
        : {}),
      ...(enrichment.binkitapUrl ? { binkitapUrl: enrichment.binkitapUrl } : {}),
      quotes,
    };
  }
}
