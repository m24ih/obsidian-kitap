import { Plugin, Notice } from 'obsidian';
import { KitapPluginSettings, DEFAULT_SETTINGS } from './types';
import { KitapSettingTab } from './settings';
import { BookAggregator } from './providers/aggregator';
import { BookSearchModal } from './modal/searchModal';

export default class KitapPlugin extends Plugin {
  declare settings: KitapPluginSettings;
  aggregator: BookAggregator = new BookAggregator();

  async onload(): Promise<void> {
    console.log('obsidian-kitap eklentisi yükleniyor...');

    // 1. Ayarları diskten oku veya varsayılanlarla başlat
    await this.loadSettings();

    // 2. Türkçe Ayarlar Sekmesini Kaydet
    this.addSettingTab(new KitapSettingTab(this.app, this));

    // 3. Sol Şerit (Ribbon) İkonunu Kaydet
    this.registerRibbonIcons();

    // 4. Komut Paleti Komutlarını Kaydet
    this.registerCommands();
  }

  onunload(): void {
    console.log('obsidian-kitap eklentisi kaldırıldı.');
  }

  /**
   * Ayarları diskten yükler ve eksik alanları DEFAULT_SETTINGS ile tamamlar.
   * Bozuk veya sınır dışı ayar değerlerine karşı savunmacı sanitizasyon uygular.
   */
  async loadSettings(): Promise<void> {
    const loadedData = (await this.loadData()) as Partial<KitapPluginSettings> | null;
    const rawSettings =
      loadedData && typeof loadedData === 'object' && !Array.isArray(loadedData)
        ? loadedData
        : {};

    this.settings = Object.assign({}, DEFAULT_SETTINGS, rawSettings);

    // 1. targetFolder: Boş olmayan geçerli bir metin olmasını sağla
    const trimmedFolder =
      typeof this.settings.targetFolder === 'string' ? this.settings.targetFolder.trim() : '';
    this.settings.targetFolder = trimmedFolder || DEFAULT_SETTINGS.targetFolder;

    // 2. fileNameTemplate: Boş olmayan geçerli bir şablon metni olmasını sağla
    const trimmedFileTemplate =
      typeof this.settings.fileNameTemplate === 'string' ? this.settings.fileNameTemplate.trim() : '';
    this.settings.fileNameTemplate = trimmedFileTemplate || DEFAULT_SETTINGS.fileNameTemplate;

    // 3. templateFile tip doğrulaması
    this.settings.templateFile =
      typeof this.settings.templateFile === 'string' ? this.settings.templateFile.trim() : '';

    // 4. noteTemplate tip doğrulaması
    if (typeof this.settings.noteTemplate !== 'string') {
      this.settings.noteTemplate = DEFAULT_SETTINGS.noteTemplate;
    }

    // 5. useDefaultFrontMatter doğrulaması
    this.settings.useDefaultFrontMatter =
      typeof this.settings.useDefaultFrontMatter === 'boolean'
        ? this.settings.useDefaultFrontMatter
        : true;

    // 6. enableTemplaterIntegration doğrulaması
    this.settings.enableTemplaterIntegration =
      typeof this.settings.enableTemplaterIntegration === 'boolean'
        ? this.settings.enableTemplaterIntegration
        : false;

    // 7. downloadCovers doğrulaması (media-db uyumluluğu için imageDownload fallback)
    const rawDownload = (rawSettings as any).downloadCovers ?? (rawSettings as any).imageDownload;
    this.settings.downloadCovers =
      typeof rawDownload === 'boolean' ? rawDownload : DEFAULT_SETTINGS.downloadCovers;

    // 8. coverFolder doğrulaması (media-db uyumluluğu için imageFolder fallback)
    const rawCoverFolder = (rawSettings as any).coverFolder ?? (rawSettings as any).imageFolder;
    const trimmedCoverFolder =
      typeof rawCoverFolder === 'string' ? rawCoverFolder.trim() : '';
    this.settings.coverFolder = trimmedCoverFolder || DEFAULT_SETTINGS.coverFolder;

    // 9. propertyMappings migrasyonu
    const { migratePropertyMappings } = await import('./settings/propertyMapping');
    this.settings.propertyMappings = migratePropertyMappings(this.settings.propertyMappings);
  }

  /**
   * Güncel ayarları diske kaydeder.
   */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Kitap Arama ve Ekleme modal arayüzünü açar.
   */
  openSearchModal(options?: { insertIntoActive?: boolean }): BookSearchModal {
    const message = options?.insertIntoActive
      ? 'Aktif nota kitap bilgisi ekleme aracı açılıyor...'
      : 'Kitap arama penceresi açılıyor...';
    new Notice(message);

    const modal = new BookSearchModal(this.app, this, {
      insertIntoActive: options?.insertIntoActive,
      aggregator: this.aggregator,
    });
    modal.open();
    return modal;
  }

  /**
   * Sol şeritte yer alan kitap ikonunu kaydeder.
   */
  private registerRibbonIcons(): void {
    const ribbonIconEl = this.addRibbonIcon(
      'book-open',
      'Kitap Ara ve Ekle',
      (_evt: MouseEvent) => {
        this.openSearchModal();
      }
    );
    ribbonIconEl.addClass('obsidian-kitap-ribbon-class');
  }

  /**
   * Eklentiye ait tüm komutları Obsidian komut paletine kaydeder.
   */
  private registerCommands(): void {
    // 1. Ana Komut: Yeni Kitap Notu Oluştur
    this.addCommand({
      id: 'search-and-add-book',
      name: 'Kitap Ara ve Ekle',
      callback: () => {
        this.openSearchModal();
      },
    });

    // 2. İkincil Komut: Açık Olan Nota Kitap Bilgilerini Ekle
    this.addCommand({
      id: 'insert-book-into-active-note',
      name: 'Aktif Nota Kitap Bilgilerini Ekle',
      checkCallback: (checking: boolean) => {
        const activeFile = (this.app as any).workspace?.getActiveFile?.();
        if (!activeFile) {
          return false;
        }
        if (!checking) {
          this.openSearchModal({ insertIntoActive: true });
        }
        return true;
      },
    });
  }
}
