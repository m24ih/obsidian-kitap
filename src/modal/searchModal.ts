import { App, Notice, SuggestModal, TFile, normalizePath } from 'obsidian';
import type KitapPlugin from '../main';
import { BookAggregator, IBookAggregator } from '../providers/aggregator';
import { renderBookTemplate, sanitizeFileName } from '../templates/engine';
import { buildBookNoteContent } from '../templates/noteBuilder';
import { BookMetadata, ProviderSearchMetric, SearchResultItem } from '../types';
import { fuzzySortBooks } from '../utils/fuzzy';
import { useTemplaterPluginInFile } from '../utils/templater';
import { downloadBookCover } from '../utils/coverDownloader';
import { ensureFolderExists } from '../utils/fileUtils';
import { MetadataComparisonModal } from './comparisonModal';

export interface SearchModalOptions {
  insertIntoActive?: boolean;
  debounceMs?: number;
  aggregator?: IBookAggregator;
}

/**
 * Türkçe Kitap Arama ve Seçim Modalı
 * Gecikmeli (debounced) otomatik arama, Enter ile anında tetikleme,
 * skeleton loading animasyonu, sağlayıcı bazlı süre ve durum (ms & ✅/❌) rozetleri,
 * sonuç içi sağlayıcı filtreleme (Tümü/Kitapyurdu/D&R/OpenLibrary/Hardcover),
 * ISBN numarası gösterimi, Türkçe fuzzy sıralama ve karşılaştırma modalı özelliklerini içerir.
 */
export class BookSearchModal extends SuggestModal<SearchResultItem> {
  private readonly plugin: KitapPlugin;
  private readonly aggregator: IBookAggregator;
  private readonly insertIntoActive: boolean;
  private readonly debounceMs: number;
  private debounceTimer: number | null = null;
  private debounceResolver: ((value: boolean) => void) | null = null;
  private requestSeq = 0;
  private isSearching = false;
  private currentResults: SearchResultItem[] = [];
  private selectedProviderFilter = 'all';

  private statusBarEl: HTMLElement | null = null;
  private noticeEl: HTMLElement | null = null;
  private metricsContainerEl: HTMLElement | null = null;
  private filterBarEl: HTMLElement | null = null;
  private skeletonEl: HTMLElement | null = null;
  private activeMetrics: Map<string, ProviderSearchMetric> = new Map();

  constructor(app: App, plugin: KitapPlugin, options?: SearchModalOptions) {
    super(app);
    this.plugin = plugin;
    this.aggregator = options?.aggregator ?? new BookAggregator();
    if (this.plugin?.settings?.defaultProvider) {
      this.aggregator.setDefaultProvider?.(this.plugin.settings.defaultProvider);
    }
    this.insertIntoActive = options?.insertIntoActive ?? false;
    this.debounceMs = options?.debounceMs ?? 500;

    this.emptyStateText = 'Kitap adı, yazar veya ISBN girin (örn. Üç Cisim Problemi, Dune)...';

    this.setPlaceholder?.(
      'Kitap adı, yazar veya ISBN girin (örn. Üç Cisim Problemi, Dune)...'
    );
    this.setInstructions?.([
      { command: '↑↓', purpose: 'Gezin' },
      { command: '↵ Enter', purpose: this.insertIntoActive ? 'Aktif Nota Ekle' : 'Not Oluştur' },
      { command: 'esc', purpose: 'Kapat' },
    ]);

    // Kullanıcı beklemeden hemen Enter tuşuna basarsa bekleyen debounce'ı anında tetikle
    if (this.inputEl) {
      this.inputEl.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
          this.flushDebounce();
        }
      });
    }
  }

  override onOpen(): void {
    void super.onOpen?.();
    this.setupHeaderPanels();

    if (this.scope && typeof this.scope.register === 'function') {
      this.scope.register([], 'Enter', (_evt: KeyboardEvent) => {
        if (this.currentResults.length === 0) {
          this.flushDebounce();
          return false;
        }
        const modalWithChooser = this as unknown as {
          chooser?: { useSelectedItem?: (evt: KeyboardEvent) => void };
        };
        const chooser = modalWithChooser.chooser;
        if (chooser && typeof chooser.useSelectedItem === 'function') {
          chooser.useSelectedItem(_evt);
          return false;
        }
        return true;
      });
    }
  }

  /**
   * Durum çubuğu, bilgi notu, sağlayıcı metrikleri ve filtre panellerini kurar.
   */
  private setupHeaderPanels(): void {
    if (this.statusBarEl) return;

    const hostEl =
      this.modalEl ||
      this.containerEl ||
      (this.resultContainerEl && this.resultContainerEl.parentElement);

    if (hostEl && typeof hostEl.createDiv === 'function') {
      this.statusBarEl = hostEl.createDiv({
        cls: 'kitap-search-status-bar is-hidden',
      });
    } else {
      this.statusBarEl = document.createElement('div');
      this.statusBarEl.className = 'kitap-search-status-bar is-hidden';
    }

    // Bilgilendirme notu
    this.noticeEl = this.statusBarEl.createDiv({
      cls: 'kitap-search-notice',
      text: '💡 Çok fazla metaveri sağlayıcısı seçmek arama süresini uzatabilir.',
    });

    // Süre / durum rozetleri konteyneri
    this.metricsContainerEl = this.statusBarEl.createDiv({
      cls: 'kitap-search-metrics',
    });

    // Sonuç içi sağlayıcı filtreleme çubuğu
    this.filterBarEl = this.statusBarEl.createDiv({
      cls: 'kitap-search-filter-bar',
    });

    // Arama kutusu ile sonuç konteyneri arasına ekle
    if (this.resultContainerEl && this.resultContainerEl.parentElement) {
      this.resultContainerEl.parentElement.insertBefore(
        this.statusBarEl,
        this.resultContainerEl
      );
    }
  }

  /**
   * Arama esnasında modern ve animasyonlu skeleton loading kartları çizer.
   */
  private showSkeletonLoading(): void {
    this.hideSkeletonLoading();
    if (!this.resultContainerEl) return;

    if (this.statusBarEl) {
      this.statusBarEl.classList.remove('is-hidden');
    }
    if (this.filterBarEl) {
      this.filterBarEl.classList.add('is-hidden');
    }

    // Aktif sağlayıcılar için başlangıç pending rozetlerini oluştur
    this.initPendingBadges();

    this.skeletonEl = this.resultContainerEl.createDiv({
      cls: 'kitap-skeleton-container',
    });

    for (let i = 0; i < 3; i++) {
      const card = this.skeletonEl.createDiv({ cls: 'kitap-skeleton-card' });
      card.createDiv({ cls: 'kitap-skeleton-cover' });
      const content = card.createDiv({ cls: 'kitap-skeleton-content' });
      content.createDiv({ cls: 'kitap-skeleton-line kitap-skeleton-title' });
      content.createDiv({ cls: 'kitap-skeleton-line kitap-skeleton-author' });
      content.createDiv({ cls: 'kitap-skeleton-line kitap-skeleton-meta' });
    }
  }

  /**
   * Skeleton loading kartlarını DOM'dan kaldırır.
   */
  private hideSkeletonLoading(): void {
    if (this.skeletonEl) {
      this.skeletonEl.remove();
      this.skeletonEl = null;
    }
  }

  /**
   * Arama başladığında aktif olan sağlayıcıların pending rozetlerini hazırlar.
   */
  private initPendingBadges(): void {
    if (!this.metricsContainerEl) return;
    this.metricsContainerEl.empty();
    this.activeMetrics.clear();

    const available = this.aggregator.getAvailableProviders?.() ?? [];
    const activeProviders = available.filter((p) => p.id !== 'hybrid');

    for (const p of activeProviders) {
      const metric: ProviderSearchMetric = {
        providerId: p.id,
        name: p.name,
        durationMs: 0,
        status: 'pending',
        resultCount: 0,
      };
      this.activeMetrics.set(p.id, metric);
      this.renderMetricBadge(metric);
    }
  }

  /**
   * Tek bir sağlayıcının süre ve başarı metriğini rozet olarak çizer veya günceller.
   */
  private updateMetricBadge(metric: ProviderSearchMetric): void {
    this.activeMetrics.set(metric.providerId, metric);
    this.renderMetricBadge(metric);
  }

  /**
   * Sağlayıcı rozetini güncel durumuna göre DOM'a yansıtır.
   */
  private renderMetricBadge(metric: ProviderSearchMetric): void {
    if (!this.metricsContainerEl) return;

    let badge = this.metricsContainerEl.querySelector<HTMLElement>(
      `[data-provider-metric="${metric.providerId}"]`
    );

    if (!badge) {
      badge = this.metricsContainerEl.createSpan({
        cls: 'kitap-metric-badge',
        attr: { 'data-provider-metric': metric.providerId },
      });
    }

    badge.className = `kitap-metric-badge kitap-metric-${metric.providerId} is-${metric.status}`;

    let statusIcon = '⏳';
    if (metric.status === 'success') statusIcon = '✅';
    if (metric.status === 'empty') statusIcon = '⚪';
    if (metric.status === 'error') statusIcon = '❌';

    const textContent =
      metric.status === 'pending'
        ? `${metric.name} ${statusIcon}`
        : `${metric.name} ${metric.durationMs}ms ${statusIcon}`;

    badge.setText(textContent);
  }

  /**
   * Arama sonuçlarına göre sağlayıcı bazlı filtre butonlarını çizer.
   */
  private renderFilterBar(results: SearchResultItem[]): void {
    if (!this.filterBarEl) return;
    this.filterBarEl.empty();

    if (!results || results.length === 0) {
      this.filterBarEl.classList.add('is-hidden');
      return;
    }

    this.filterBarEl.classList.remove('is-hidden');

    // Her sağlayıcının sonuç sayısını hesapla
    const providerCounts: Record<string, number> = {};
    for (const item of results) {
      const pList =
        item.providers && item.providers.length > 0
          ? item.providers
          : item.provider
          ? [item.provider]
          : [];
      for (const p of pList) {
        providerCounts[p] = (providerCounts[p] || 0) + 1;
      }
    }

    const available = this.aggregator.getAvailableProviders?.() ?? [];
    const getProviderName = (id: string): string => {
      if (id === 'kitapyurdu') return 'Kitapyurdu';
      if (id === 'dr') return 'D&R';
      if (id === 'openlibrary') return 'OpenLibrary';
      if (id === 'hardcover') return 'Hardcover';
      return available.find((p) => p.id === id)?.name ?? id;
    };

    // "Tümü" Filtre Butonu
    const allChip = this.filterBarEl.createSpan({
      cls: `kitap-filter-chip ${this.selectedProviderFilter === 'all' ? 'is-active' : ''}`,
      text: `Tümü (${results.length})`,
    });
    allChip.onclick = () => {
      this.selectedProviderFilter = 'all';
      this.applyFilterSelection();
    };

    // Her bir sağlayıcı için filtre butonu
    for (const [pId, count] of Object.entries(providerCounts)) {
      const chip = this.filterBarEl.createSpan({
        cls: `kitap-filter-chip kitap-filter-${pId} ${
          this.selectedProviderFilter === pId ? 'is-active' : ''
        }`,
        text: `${getProviderName(pId)} (${count})`,
      });
      chip.onclick = () => {
        this.selectedProviderFilter =
          this.selectedProviderFilter === pId ? 'all' : pId;
        this.applyFilterSelection();
      };
    }
  }

  /**
   * Seçilen sağlayıcı filtresine göre sonuçları filtreler ve modal listesini günceller.
   */
  private applyFilterSelection(): void {
    if (this.filterBarEl) {
      const chips = this.filterBarEl.querySelectorAll('.kitap-filter-chip');
      chips.forEach((c) => c.classList.remove('is-active'));

      if (this.selectedProviderFilter === 'all') {
        chips[0]?.classList.add('is-active');
      } else {
        const activeChip = this.filterBarEl.querySelector(
          `.kitap-filter-${this.selectedProviderFilter}`
        );
        activeChip?.classList.add('is-active');
      }
    }

    const filtered = this.getFilteredResults();
    const chooser = (this as unknown as { chooser?: { setSuggestions?: (items: SearchResultItem[]) => void } }).chooser;
    if (chooser && typeof chooser.setSuggestions === 'function') {
      chooser.setSuggestions(filtered);
    }
  }

  /**
   * Aktif filtreye göre filtrelenmiş arama sonuçlarını döndürür.
   */
  private getFilteredResults(): SearchResultItem[] {
    if (this.selectedProviderFilter === 'all') {
      return this.currentResults;
    }
    return this.currentResults.filter((item) => {
      if (item.providers && item.providers.includes(this.selectedProviderFilter)) {
        return true;
      }
      return item.provider === this.selectedProviderFilter;
    });
  }

  /**
   * Bekleyen gecikmeli arama sayacını anında çözümler ve aramayı hemen başlatır.
   */
  private flushDebounce(): void {
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.debounceResolver) {
      const resolve = this.debounceResolver;
      this.debounceResolver = null;
      resolve(true);
    }
  }

  /**
   * SuggestModal önerilerini sağlar.
   * Kullanıcı yazdıkça gecikmeli (debounced) olarak arar,
   * skeleton animasyonu gösterir, sonuçları fuzzy benzerliğe göre sıralar.
   */
  async getSuggestions(query: string): Promise<SearchResultItem[]> {
    const trimmed = query.trim();

    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.debounceResolver) {
      this.debounceResolver(false);
      this.debounceResolver = null;
    }

    if (trimmed.length < 2) {
      this.requestSeq++;
      this.currentResults = [];
      this.hideSkeletonLoading();
      if (this.statusBarEl) this.statusBarEl.classList.add('is-hidden');
      this.emptyStateText = 'Aramak için en az 2 karakter girin...';
      return [];
    }

    const currentSeq = ++this.requestSeq;

    if (this.debounceMs > 0) {
      const shouldContinue = await new Promise<boolean>((resolve) => {
        this.debounceResolver = resolve;
        this.debounceTimer = window.setTimeout(() => {
          this.debounceTimer = null;
          this.debounceResolver = null;
          resolve(currentSeq === this.requestSeq);
        }, this.debounceMs);
      });

      if (!shouldContinue || currentSeq !== this.requestSeq) {
        return [];
      }
    }

    this.isSearching = true;
    this.emptyStateText = 'Kitaplar aranıyor, lütfen bekleyin...';
    this.showSkeletonLoading();

    try {
      let rawResults: SearchResultItem[];
      const isCustomSingleArgMock =
        typeof (this.aggregator as unknown as { setSettings?: unknown }).setSettings !== 'function';

      if (isCustomSingleArgMock) {
        rawResults = await this.aggregator.search(trimmed);
      } else {
        const performSearch = (q: string, opt: { onProgress: (m: ProviderSearchMetric) => void }) =>
          this.aggregator.search(q, undefined, opt);
        rawResults = await performSearch(trimmed, {
          onProgress: (metric) => {
            if (currentSeq === this.requestSeq) {
              this.updateMetricBadge(metric);
            }
          },
        });
      }

      // Arama sonrasında aggregator'dan güncel metrikleri de alıp senkronize et
      const finishedMetrics = this.aggregator.getLastMetrics?.() ?? [];
      for (const m of finishedMetrics) {
        this.updateMetricBadge(m);
      }

      if (currentSeq !== this.requestSeq) {
        return [];
      }

      // Case-insensitive & fuzzy sıralama uygula
      const sortedResults = fuzzySortBooks(trimmed, rawResults);
      this.currentResults = sortedResults;
      this.emptyStateText =
        sortedResults.length === 0 ? 'Aramanızla eşleşen kitap bulunamadı.' : '';

      this.renderFilterBar(sortedResults);
      return this.getFilteredResults();
    } catch (error) {
      console.error('Kitap arama hatası:', error);
      this.currentResults = [];
      this.emptyStateText = 'Arama sırasında bir hata oluştu.';
      return [];
    } finally {
      this.isSearching = false;
      this.hideSkeletonLoading();
    }
  }

  /**
   * Her bir kitap arama sonucunu kapak görseli, başlık, yazar, yayınevi, ISBN ve puan ile çizer.
   */
  renderSuggestion(item: SearchResultItem, el: HTMLElement): void {
    const container = el.createDiv({ cls: 'kitap-suggest-item' });

    const coverWrapper = container.createDiv({ cls: 'kitap-cover-wrapper' });
    if (item.coverUrl) {
      coverWrapper.createEl('img', {
        cls: 'kitap-cover-image',
        attr: { src: item.coverUrl, alt: item.title },
      });
    } else {
      coverWrapper.createDiv({ cls: 'kitap-cover-placeholder', text: '📚' });
    }

    const details = container.createDiv({ cls: 'kitap-details' });
    details.createDiv({ cls: 'kitap-title', text: item.title });

    const meta = details.createDiv({ cls: 'kitap-meta' });
    if (item.author) {
      meta.createSpan({ cls: 'kitap-meta-author', text: item.author });
    }
    if (item.author && item.publisher) {
      meta.createSpan({ cls: 'kitap-meta-separator', text: '•' });
    }
    if (item.publisher) {
      meta.createSpan({ cls: 'kitap-meta-publisher', text: item.publisher });
    }
    if (item.isbn) {
      meta.createSpan({ cls: 'kitap-meta-separator', text: '•' });
      meta.createSpan({ cls: 'kitap-meta-isbn', text: `ISBN: ${item.isbn}` });
    }

    const providerIds =
      item.providers && item.providers.length > 0
        ? item.providers
        : item.provider
        ? [item.provider]
        : [];

    if (item.rating !== undefined || providerIds.length > 0) {
      const badges = details.createDiv({ cls: 'kitap-badges' });
      if (item.rating !== undefined) {
        badges.createSpan({
          cls: 'kitap-badge kitap-badge-rating',
          text: `★ ${item.rating}/5`,
        });
      }
      for (const pId of providerIds) {
        const providerName =
          pId === 'kitapyurdu'
            ? 'Kitapyurdu'
            : pId === 'dr'
            ? 'D&R'
            : pId === 'openlibrary'
            ? 'OpenLibrary'
            : pId === 'hardcover'
            ? 'Hardcover'
            : this.aggregator.getAvailableProviders?.({ includeComposite: true })?.find((p) => p.id === pId)?.name ?? pId;

        badges.createSpan({
          cls: `kitap-badge kitap-badge-provider kitap-badge-${pId}`,
          text: providerName,
        });
      }
    }
  }

  /**
   * Kullanıcı bir kitabı seçtiğinde tetiklenir.
   */
  onChooseSuggestion(
    item: SearchResultItem,
    _evt: MouseEvent | KeyboardEvent
  ): void {
    void this.processBookSelection(item);
  }

  /**
   * Seçilen kitabın tüm detaylarını çekerek yeni not oluşturur veya aktif nota ekler.
   * Eğer öğe birden fazla sağlayıcıdan (Hibrit) geliyorsa, detayları çekip karşılaştırma modalını açar.
   */
  async processBookSelection(item: SearchResultItem): Promise<TFile | null> {
    const multiProviders =
      item.sources && Object.keys(item.sources).length > 1
        ? Object.entries(item.sources)
        : null;

    if (multiProviders && multiProviders.length > 1) {
      const providerNames = multiProviders
        .map(([pId]) =>
          pId === 'kitapyurdu'
            ? 'Kitapyurdu'
            : pId === 'dr'
            ? 'D&R'
            : pId === 'openlibrary'
            ? 'OpenLibrary'
            : pId === 'hardcover'
            ? 'Hardcover'
            : pId
        )
        .join(' & ');
      new Notice(`"${item.title}" için metaveriler getiriliyor (${providerNames})...`);

      const promises = multiProviders.map(async ([pId, srcItem]) => {
        try {
          const provider = this.aggregator.getProvider(pId);
          const data = await provider.getBookDetails(srcItem.url || srcItem.id);
          const pName =
            pId === 'kitapyurdu'
              ? 'Kitapyurdu'
              : pId === 'dr'
              ? 'D&R'
              : pId === 'openlibrary'
              ? 'OpenLibrary'
              : pId === 'hardcover'
              ? 'Hardcover'
              : provider.name;
          return { id: pId, name: pName, data: { ...data, provider: pId } };
        } catch (err) {
          console.warn(`Sağlayıcı veri çekme hatası (${pId}):`, err);
          return null;
        }
      });

      const settled = (await Promise.all(promises)).filter(Boolean) as {
        id: string;
        name: string;
        data: BookMetadata;
      }[];

      if (settled.length >= 2) {
        return new Promise<TFile | null>((resolve) => {
          const modal = new MetadataComparisonModal(this.app, {
            providers: settled,
            insertIntoActive: this.insertIntoActive,
            onConfirm: async (selectedData) => {
              const file = await this.finalizeBookCreation(selectedData);
              resolve(file);
            },
            onCancel: () => {
              resolve(null);
            },
          });
          modal.open();
        });
      } else if (settled.length === 1) {
        return await this.finalizeBookCreation(settled[0].data);
      } else {
        new Notice(`"${item.title}" için sağlayıcılardan metaveri alınamadı.`);
        return null;
      }
    }

    new Notice(`"${item.title}" için kitap bilgileri getiriliyor...`);

    try {
      const bookData = await this.aggregator.getFullBookData(item, this.plugin.settings);
      return await this.finalizeBookCreation(bookData);
    } catch (error) {
      console.error('Kitap notu oluşturma hatası:', error);
      new Notice(`Kitap bilgileri alınırken bir hata oluştu: "${item.title}"`);
      return null;
    }
  }

  /**
   * Kitap metaverisini işleyip notu oluşturur veya aktif nota ekler.
   */
  async finalizeBookCreation(bookData: BookMetadata): Promise<TFile | null> {
    try {
      bookData.readingStatus = this.plugin.settings.defaultReadingStatus || 'Okunacak';

      // Kapak indirme ayarı etkinse görseli indir ve bookData'yı güncelle
      if (this.plugin.settings.downloadCovers) {
        new Notice(`"${bookData.title}" kapak görseli indiriliyor...`);
        const coverResult = await downloadBookCover(this.app, bookData, this.plugin.settings);
        if (!coverResult.success && coverResult.error) {
          new Notice(`"${bookData.title}" kapak görseli indirilemedi, harici bağlantı kullanılacak.`);
        }
      }

      const renderedContent = await buildBookNoteContent({
        book: bookData,
        settings: this.plugin.settings,
        app: this.app,
      });

      if (this.insertIntoActive) {
        return await this.insertContentIntoActiveNote(renderedContent, bookData);
      }

      return await this.createBookNote(renderedContent, bookData);
    } catch (error) {
      console.error('Kitap tamamlama hatası:', error);
      new Notice(`Kitap notu oluşturulamadı: "${bookData.title}"`);
      return null;
    }
  }

  /**
   * Hedef klasörü (iç içe alt klasörler dahil) güvenli şekilde oluşturur ve kitap notunu kaydeder.
   */
  private async createBookNote(
    content: string,
    bookData: BookMetadata
  ): Promise<TFile | null> {
    const vault = this.app.vault;
    if (!vault) {
      new Notice('Vault erişimi bulunamadı.');
      return null;
    }

    const folderPath = (this.plugin.settings.targetFolder || 'Kitaplar').trim();
    await this.ensureFolderExists(folderPath);

    const rawFileName = renderBookTemplate(
      this.plugin.settings.fileNameTemplate || '{{title}} - {{author}}',
      bookData
    );
    const safeFileName = sanitizeFileName(rawFileName);

    const normalizedFolder = normalizePath(folderPath).replace(/^\/+|\/+$/g, '');
    const fullPath = normalizedFolder
      ? normalizePath(`${normalizedFolder}/${safeFileName}.md`)
      : normalizePath(`${safeFileName}.md`);

    const abstractFile = vault.getAbstractFileByPath?.(fullPath);
    let file: TFile | null = abstractFile instanceof TFile ? abstractFile : null;

    if (file && typeof vault.modify === 'function') {
      await vault.modify(file, content);
      new Notice(`"${bookData.title}" notu güncellendi: ${fullPath}`);
    } else if (typeof vault.create === 'function') {
      const createdFile = await vault.create(fullPath, content);
      file = createdFile instanceof TFile ? createdFile : null;
      new Notice(`"${bookData.title}" notu oluşturuldu: ${fullPath}`);
    }

    if (file && this.plugin.settings.enableTemplaterIntegration) {
      try {
        await useTemplaterPluginInFile(this.app, file);
      } catch (templaterErr) {
        console.warn('Templater çalıştırma hatası:', templaterErr);
      }
    }

    const workspace = this.app.workspace;
    if (file && workspace?.getLeaf) {
      const leaf = workspace.getLeaf(false);
      if (leaf && typeof leaf.openFile === 'function') {
        await leaf.openFile(file);
      }
    }

    return file ?? null;
  }

  /**
   * Açık olan aktif nota kitap içeriğini ekler.
   */
  private async insertContentIntoActiveNote(
    content: string,
    bookData: BookMetadata
  ): Promise<TFile | null> {
    const workspace = this.app.workspace;
    const vault = this.app.vault;
    const activeFile = workspace?.getActiveFile?.();

    if (!activeFile) {
      new Notice('Aktif bir not bulunamadı.');
      return null;
    }

    const activeEditor = (workspace as unknown as { activeEditor?: { editor?: { replaceSelection?: (s: string) => void } } })
      ?.activeEditor?.editor;
    if (activeEditor && typeof activeEditor.replaceSelection === 'function') {
      activeEditor.replaceSelection(content);
      new Notice(`"${bookData.title}" bilgileri aktif nota eklendi.`);
      return activeFile;
    }

    if (vault && typeof vault.append === 'function') {
      await vault.append(activeFile, `\n${content}`);
    } else if (vault && typeof vault.read === 'function' && typeof vault.modify === 'function') {
      const existing = await vault.read(activeFile);
      const separator = existing.endsWith('\n') ? '' : '\n';
      await vault.modify(activeFile, `${existing}${separator}${content}`);
    }

    new Notice(`"${bookData.title}" bilgileri aktif nota eklendi.`);
    return activeFile;
  }

  /**
   * İç içe klasör yollarını (ör. "Kitaplar/2026/Roman") kademeli ve güvenli olarak oluşturur.
   */
  async ensureFolderExists(folderPath: string): Promise<void> {
    const vault = this.app.vault;
    await ensureFolderExists(vault, folderPath);
  }

  onClose(): void {
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.requestSeq++;
  }
}
