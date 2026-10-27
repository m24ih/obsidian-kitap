import {
  BookMetadata,
  KitapPluginSettings,
  ProviderSearchMetric,
  SearchResultItem,
} from '../types';
import { KitapyurduProvider } from './kitapyurdu';
import { DrProvider } from './dr';
import { OpenLibraryProvider } from './openlibrary';
import { HardcoverProvider } from './hardcover';
import { HybridProvider, IHybridProviderDeps, SearchExecutionOptions } from './hybrid';
import { IKitapyurduProvider, IBookProvider, ProviderInfo } from './types';

export interface IBookAggregator {
  search(
    query: string,
    providerId?: string,
    options?: SearchExecutionOptions
  ): Promise<SearchResultItem[]>;
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
  setSettings?(settings: KitapPluginSettings): void;
  getSettings?(): KitapPluginSettings | undefined;
  setApp?(app: unknown): void;
  getLastMetrics?(): ProviderSearchMetric[];
}

/**
 * Farklı metaveri kaynaklarından bibliyografik verileri çeken toplayıcı servis.
 */
export class BookAggregator implements IBookAggregator, IHybridProviderDeps {
  private readonly providers: Map<string, IBookProvider> = new Map();
  private defaultProviderId: string = 'hybrid';
  private readonly hybridProvider: HybridProvider;
  private settings?: KitapPluginSettings;
  private app?: unknown;

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
   * Obsidian App örneğini bağlar (Secret Storage erişimi için).
   */
  setApp(app: unknown): void {
    this.app = app;
  }

  /**
   * Hardcover API anahtarını çözer.
   * Öncelikle açık metin hardcoverApiKey kontrol edilir,
   * ardından Obsidian Secret Storage (hardcoverApiKeyId) sorgulanır.
   */
  private resolveHardcoverApiKey(): string {
    // 1. Açık metin anahtar önceliği (kullanıcının doğrudan girdiği)
    if (
      this.settings?.hardcoverApiKey &&
      typeof this.settings.hardcoverApiKey === 'string' &&
      this.settings.hardcoverApiKey.trim()
    ) {
      return this.settings.hardcoverApiKey.trim();
    }

    // 2. Obsidian Secret Storage
    if (this.settings?.hardcoverApiKeyId && this.app) {
      try {
        const secretStorage = (this.app as { secretStorage?: { getSecret?: (id: string) => string | null } }).secretStorage;
        if (secretStorage && typeof secretStorage.getSecret === 'function') {
          const secret = secretStorage.getSecret(this.settings.hardcoverApiKeyId);
          if (typeof secret === 'string' && secret.trim()) {
            return secret.trim();
          }
        }
      } catch (err) {
        console.warn('Secret storage üzerinden Hardcover anahtarı alınamadı:', err);
      }
    }
    return '';
  }

  /**
   * Eklenti ayarlarını toplayıcıya aktarır ve sağlayıcı kayıtlarını günceller.
   */
  setSettings(settings: KitapPluginSettings): void {
    this.settings = settings;

    // Kitapyurdu dinamik kayıt yönetimi
    if (settings.enableKitapyurdu !== false) {
      if (!this.providers.has('kitapyurdu')) {
        this.registerProvider(new KitapyurduProvider());
      }
    } else {
      this.providers.delete('kitapyurdu');
    }

    // D&R dinamik kayıt yönetimi
    if (settings.enableDr !== false) {
      if (!this.providers.has('dr')) {
        this.registerProvider(new DrProvider());
      }
    } else {
      this.providers.delete('dr');
    }

    // OpenLibrary dinamik kayıt yönetimi
    if (settings.enableOpenLibrary) {
      if (!this.providers.has('openlibrary')) {
        this.registerProvider(new OpenLibraryProvider());
      }
    } else {
      this.providers.delete('openlibrary');
    }

    // Hardcover dinamik kayıt yönetimi
    if (settings.enableHardcover) {
      const existingHc = this.providers.get('hardcover') as HardcoverProvider | undefined;
      if (!existingHc) {
        this.registerProvider(
          new HardcoverProvider(() => this.resolveHardcoverApiKey())
        );
      } else if (typeof existingHc.setApiKey === 'function') {
        existingHc.setApiKey(() => this.resolveHardcoverApiKey());
      }
    } else {
      this.providers.delete('hardcover');
    }

    // Aktif sağlayıcı durumuna göre varsayılan sağlayıcıyı denetle
    const activeIds = this.getActiveProviderIds();
    const isCurrentValid =
      this.defaultProviderId === 'hybrid'
        ? activeIds.length >= 2
        : this.isProviderEnabled(this.defaultProviderId);

    if (!isCurrentValid) {
      if (activeIds.length >= 2) {
        this.defaultProviderId = 'hybrid';
        settings.defaultProvider = 'hybrid';
      } else if (activeIds.length === 1) {
        this.defaultProviderId = activeIds[0];
        settings.defaultProvider = activeIds[0];
      }
    }
  }

  /**
   * Aktif sağlayıcı ID'lerinin listesini döndürür.
   */
  private getActiveProviderIds(): string[] {
    const ids: string[] = [];
    if (this.isProviderEnabled('kitapyurdu')) ids.push('kitapyurdu');
    if (this.isProviderEnabled('dr')) ids.push('dr');
    if (this.isProviderEnabled('openlibrary')) ids.push('openlibrary');
    if (this.isProviderEnabled('hardcover')) ids.push('hardcover');
    return ids;
  }

  /**
   * Aktif eklenti ayarlarını döndürür.
   */
  getSettings(): KitapPluginSettings | undefined {
    return this.settings;
  }

  /**
   * Bir sağlayıcının aktif olup olmadığını belirler.
   */
  isProviderEnabled(id: string): boolean {
    if (this.settings) {
      if (id === 'kitapyurdu') return this.settings.enableKitapyurdu !== false;
      if (id === 'dr') return this.settings.enableDr !== false;
      if (id === 'openlibrary') return Boolean(this.settings.enableOpenLibrary);
      if (id === 'hardcover') return Boolean(this.settings.enableHardcover);
    }
    return this.providers.has(id);
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
    Object.assign(adapted, provider);
    (adapted as { id: string }).id = id;
    (adapted as { name: string }).name = name;
    this.providers.set(id, adapted);
  }

  /**
   * Kayıtlı bir metaveri sağlayıcısını sistemden kaldırır.
   * 'kitapyurdu' ve 'hybrid' çekirdek sağlayıcılarının silinmesine izin verilmez.
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
   * includeComposite true verilirse ve 2+ sağlayıcı varsa hibrit meta-sağlayıcı dinamik etiketle eklenir.
   */
  getAvailableProviders(options?: { includeComposite?: boolean }): ProviderInfo[] {
    const list = Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
    }));

    if (options?.includeComposite) {
      if (!list.some((p) => p.id === 'hybrid')) {
        const activeNames = list.map((p) => p.name);
        const hybridLabel =
          activeNames.length >= 2
            ? `Hibrit (${activeNames.join(' + ')})`
            : 'Hibrit';
        if (list.length >= 2) {
          list.unshift({ id: 'hybrid', name: hybridLabel });
        }
      }
    }

    return list;
  }

  /**
   * En son gerçekleştirilen aramanın sağlayıcı metriklerini döndürür.
   */
  getLastMetrics(): ProviderSearchMetric[] {
    return this.hybridProvider.getLastMetrics();
  }

  /**
   * Kitap aramasını seçilen sağlayıcı (veya varsayılan sağlayıcı) üzerinden yürütür.
   * Dönen arama sonuçlarına sağlayıcı kimliğinin (provider) iliştirilmesini garanti eder.
   */
  async search(
    query: string,
    providerId?: string,
    options?: SearchExecutionOptions
  ): Promise<SearchResultItem[]> {
    const id = (providerId && providerId.trim()) || this.defaultProviderId;
    if (id === 'hybrid') {
      return this.hybridProvider.search(query, options);
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
