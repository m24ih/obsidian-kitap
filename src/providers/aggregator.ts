import {
  BookMetadata,
  KitapPluginSettings,
  SearchResultItem,
} from '../types';
import { KitapyurduProvider } from './kitapyurdu';
import { DrProvider } from './dr';
import { HybridProvider } from './hybrid';
import { IKitapyurduProvider, IBookProvider, ProviderInfo } from './types';

export interface IBookAggregator {
  search(query: string, providerId?: string): Promise<SearchResultItem[]>;
  getFullBookData(
    searchItem: SearchResultItem,
    settings?: KitapPluginSettings
  ): Promise<BookMetadata>;
  getProvider(providerId?: string): IBookProvider;
  registerProvider(provider: IBookProvider | IKitapyurduProvider): void;
  unregisterProvider?(providerId: string): boolean;
  getAvailableProviders(options?: { includeComposite?: boolean }): ProviderInfo[];
  setDefaultProvider(providerId: string): void;
  getDefaultProviderId(): string;
}

/**
 * Farklı metaveri kaynaklarından bibliyografik verileri çeken toplayıcı servis.
 */
export class BookAggregator implements IBookAggregator {
  private readonly providers: Map<string, IBookProvider> = new Map();
  private defaultProviderId: string = 'hybrid';
  private readonly hybridProvider: HybridProvider;

  constructor(defaultProvider?: IKitapyurduProvider | IBookProvider) {
    this.hybridProvider = new HybridProvider(this);

    if (defaultProvider) {
      this.registerProvider(defaultProvider);
      const id = (defaultProvider as IBookProvider).id || 'kitapyurdu';
      this.defaultProviderId = id;
    } else {
      this.registerProvider(new KitapyurduProvider());
      this.registerProvider(new DrProvider());
      this.defaultProviderId = 'hybrid';
    }
  }

  /**
   * Varsayılan sağlayıcı ID'sini ayarlar.
   */
  setDefaultProvider(providerId: string): void {
    if (providerId && typeof providerId === 'string' && providerId.trim()) {
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
    if (!provider) return;
    const id = (provider as IBookProvider).id?.trim?.() || 'kitapyurdu';
    const name =
      (provider as IBookProvider).name?.trim?.() || (id === 'kitapyurdu' ? 'Kitapyurdu' : id);

    const adapted: IBookProvider = {
      id,
      name,
      search: (q: string) => provider.search(q),
      getBookDetails: (u: string) => provider.getBookDetails(u),
    };
    this.providers.set(id, adapted);
  }

  /**
   * Kayıtlı bir metaveri sağlayıcısını sistemden kaldırır.
   * 'kitapyurdu' çekirdek sağlayıcısının silinmesine izin verilmez.
   */
  unregisterProvider(providerId: string): boolean {
    if (!providerId || providerId.trim() === 'kitapyurdu' || providerId.trim() === 'hybrid') {
      return false;
    }
    return this.providers.delete(providerId.trim());
  }

  /**
   * Belirtilen ID'ye sahip sağlayıcıyı döndürür, yoksa varsayılan sağlayıcıya geri döner.
   */
  getProvider(providerId?: string): IBookProvider {
    const id = (providerId && providerId.trim()) || this.defaultProviderId;
    if (id === 'hybrid') {
      return this.hybridProvider;
    }
    const provider = this.providers.get(id);
    if (!provider) {
      const fallback =
        (this.defaultProviderId === 'hybrid'
          ? this.hybridProvider
          : this.providers.get(this.defaultProviderId)) ||
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
   * includeComposite true verilirse hibrit meta-sağlayıcı da eklenir.
   */
  getAvailableProviders(options?: { includeComposite?: boolean }): ProviderInfo[] {
    const list = Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
    }));

    if (options?.includeComposite) {
      if (!list.some((p) => p.id === 'hybrid')) {
        list.unshift({ id: 'hybrid', name: 'Hibrit (Kitapyurdu + D&R)' });
      }
    }

    return list;
  }

  /**
   * Kitap aramasını seçilen sağlayıcı (veya varsayılan sağlayıcı) üzerinden yürütür.
   * Dönen arama sonuçlarına sağlayıcı kimliğinin (provider) iliştirilmesini garanti eder.
   */
  async search(query: string, providerId?: string): Promise<SearchResultItem[]> {
    const id = (providerId && providerId.trim()) || this.defaultProviderId;
    if (id === 'hybrid') {
      return this.hybridProvider.search(query);
    }

    const provider = this.getProvider(id);
    const results = await provider.search(query);
    return results.map((item) => ({
      ...item,
      provider: item.provider || provider.id,
    }));
  }

  /**
   * Seçilen arama öğesi için ilgili sağlayıcıdan kitap detaylarını çeker.
   * Dönen kitap verisine sağlayıcı kimliğinin (provider) iliştirilmesini garanti eder.
   */
  async getFullBookData(
    searchItem: SearchResultItem,
    settings?: KitapPluginSettings
  ): Promise<BookMetadata> {
    const providerId =
      searchItem.provider || settings?.defaultProvider || this.defaultProviderId;

    if (
      providerId === 'hybrid' ||
      (searchItem.sources && Object.keys(searchItem.sources).length > 1)
    ) {
      return this.hybridProvider.getFullBookData(searchItem);
    }

    const provider = this.getProvider(providerId);
    const targetUrlOrId = searchItem.url || searchItem.id;
    const data = await provider.getBookDetails(targetUrlOrId);
    return {
      ...data,
      provider: data.provider || provider.id,
    };
  }
}
