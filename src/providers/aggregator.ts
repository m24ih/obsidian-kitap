import {
  BookMetadata,
  KitapPluginSettings,
  SearchResultItem,
} from '../types';
import { KitapyurduProvider } from './kitapyurdu';
import { IKitapyurduProvider, IBookProvider, ProviderInfo } from './types';

export interface IBookAggregator {
  search(query: string, providerId?: string): Promise<SearchResultItem[]>;
  getFullBookData(
    searchItem: SearchResultItem,
    settings?: KitapPluginSettings
  ): Promise<BookMetadata>;
  getProvider(providerId?: string): IBookProvider;
  registerProvider(provider: IBookProvider | IKitapyurduProvider): void;
  getAvailableProviders(): ProviderInfo[];
  setDefaultProvider(providerId: string): void;
  getDefaultProviderId(): string;
}

/**
 * Farklı metaveri kaynaklarından bibliyografik verileri çeken toplayıcı servis.
 */
export class BookAggregator implements IBookAggregator {
  private readonly providers: Map<string, IBookProvider> = new Map();
  private defaultProviderId: string = 'kitapyurdu';

  constructor(defaultProvider?: IKitapyurduProvider | IBookProvider) {
    if (defaultProvider) {
      const id = (defaultProvider as IBookProvider).id || 'kitapyurdu';
      const name =
        (defaultProvider as IBookProvider).name ||
        (id === 'kitapyurdu' ? 'Kitapyurdu' : id);

      this.registerProvider({
        id,
        name,
        search: (q: string) => defaultProvider.search(q),
        getBookDetails: (u: string) => defaultProvider.getBookDetails(u),
      });
      this.defaultProviderId = id;
    } else {
      this.registerProvider(new KitapyurduProvider());
    }
  }

  /**
   * Varsayılan sağlayıcı ID'sini ayarlar.
   */
  setDefaultProvider(providerId: string): void {
    if (providerId && providerId.trim()) {
      this.defaultProviderId = providerId.trim();
    }
  }

  /**
   * Varsayılan sağlayıcı ID'sini döndürür.
   */
  getDefaultProviderId(): string {
    return this.defaultProviderId;
  }

  /**
   * Yeni bir metaveri sağlayıcısını sisteme kaydeder.
   */
  registerProvider(provider: IBookProvider | IKitapyurduProvider): void {
    const id = (provider as IBookProvider).id || 'kitapyurdu';
    const name =
      (provider as IBookProvider).name || (id === 'kitapyurdu' ? 'Kitapyurdu' : id);

    const adapted: IBookProvider = {
      id,
      name,
      search: (q: string) => provider.search(q),
      getBookDetails: (u: string) => provider.getBookDetails(u),
    };
    this.providers.set(id, adapted);
  }

  /**
   * Belirtilen ID'ye sahip sağlayıcıyı döndürür, yoksa varsayılan sağlayıcıya geri döner.
   */
  getProvider(providerId?: string): IBookProvider {
    const id = providerId || this.defaultProviderId;
    const provider = this.providers.get(id);
    if (!provider) {
      const fallback =
        this.providers.get(this.defaultProviderId) ||
        this.providers.get('kitapyurdu') ||
        this.providers.values().next().value;
      if (!fallback) {
        throw new Error(`Kayıtlı metaveri sağlayıcısı bulunamadı: ${id}`);
      }
      return fallback;
    }
    return provider;
  }

  /**
   * Sisteme kayıtlı tüm metaveri sağlayıcılarının listesini döndürür.
   */
  getAvailableProviders(): ProviderInfo[] {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
    }));
  }

  /**
   * Kitap aramasını seçilen sağlayıcı (veya varsayılan sağlayıcı) üzerinden yürütür.
   */
  async search(query: string, providerId?: string): Promise<SearchResultItem[]> {
    const provider = this.getProvider(providerId);
    return provider.search(query);
  }

  /**
   * Seçilen arama öğesi için ilgili sağlayıcıdan kitap detaylarını çeker.
   */
  async getFullBookData(
    searchItem: SearchResultItem,
    settings?: KitapPluginSettings
  ): Promise<BookMetadata> {
    const providerId =
      searchItem.provider || settings?.defaultProvider || this.defaultProviderId;
    const provider = this.getProvider(providerId);
    const targetUrlOrId = searchItem.url || searchItem.id;
    return provider.getBookDetails(targetUrlOrId);
  }
}
