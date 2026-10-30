/**
 * obsidian-kitap - Goodreads CSV Import Modal
 * Interactive modal orchestrating file selection, duplicate detection,
 * non-destructive update confirmation, provider enrichment, and progress reporting.
 * Zero external runtime dependencies. Zero `: any` or `as any` casts.
 */

import { App, Modal, Setting } from 'obsidian';
import type { ToggleComponent } from 'obsidian';
import type KitapPlugin from '../main';
import { parseGoodreadsCsv, stripBom } from '../goodreads/csvParser';
import { mapGoodreadsRow } from '../goodreads/mapper';
import { scanVaultBooks } from '../goodreads/vaultScanner';
import { detectDuplicates } from '../goodreads/duplicateDetector';
import { GoodreadsImporter } from '../goodreads/importer';
import { normalizeTurkish } from '../utils/fuzzy';
import type {
  GoodreadsRawRow,
  ParsedGoodreadsBook,
  ExistingVaultBook,
  DuplicateScanResult,
  ImportOptions,
  ImportResult,
} from '../goodreads/types';

export type ModalStep = 'select' | 'scanning' | 'preview' | 'importing' | 'completed';

export interface GoodreadsImportModalOptions {
  /** Optional callback fired when import finishes */
  onImportComplete?: (result: ImportResult) => void;
  /** Pluggable import runner (enables decoupled testing and custom pipelines) */
  importHandler?: (
    scanResult: DuplicateScanResult,
    options: ImportOptions
  ) => Promise<ImportResult>;
  /** Optional function overrides for unit testing */
  scannerFn?: (app: App, targetFolder?: string) => Promise<ExistingVaultBook[]>;
  detectorFn?: (
    csvBooks: ParsedGoodreadsBook[],
    vaultBooks: ExistingVaultBook[]
  ) => DuplicateScanResult;
  parserFn?: (csvContent: string) => GoodreadsRawRow[];
  mapperFn?: (
    row: GoodreadsRawRow,
    settings: import('../types').KitapPluginSettings
  ) => ParsedGoodreadsBook;
}



export class GoodreadsImportModal extends Modal {
  private readonly plugin: KitapPlugin;
  private readonly options?: GoodreadsImportModalOptions;

  // State Machine
  private currentStep: ModalStep = 'select';
  private selectedFileName = '';
  private rawCsvContent = '';
  private scanResult: DuplicateScanResult | null = null;

  // User Configuration Options
  private updateExisting = false;
  private enrichFromProviders = false;

  // Book Selection & Search State
  private selectedNewBookIndices: Set<number> = new Set();
  private selectedExistingBookIndices: Set<number> = new Set();
  private searchQuery = '';

  // Execution & Progress State
  private abortController: AbortController | null = null;
  private isImportRunning = false;
  private importResult: ImportResult | null = null;
  private errorMessage: string | null = null;

  // Cached DOM elements
  private progressFillEl: HTMLElement | null = null;
  private progressPercentEl: HTMLElement | null = null;
  private progressStatusEl: HTMLElement | null = null;
  private errorBannerEl: HTMLElement | null = null;
  private submitButtonEl: HTMLButtonElement | null = null;
  private updateExistingToggle: ToggleComponent | null = null;
  private searchInputEl: HTMLInputElement | null = null;
  private selectionCounterEl: HTMLElement | null = null;
  private bookListEl: HTMLElement | null = null;
  private bookListEmptyEl: HTMLElement | null = null;
  private currentProgress = { current: 0, total: 0, percent: 0, message: '' };

  constructor(app: App, plugin: KitapPlugin, options?: GoodreadsImportModalOptions) {
    super(app);
    this.plugin = plugin;
    this.options = options;
  }

  override onOpen(): void {
    void super.onOpen?.();
    this.modalEl.addClass('kitap-goodreads-modal');
    this.titleEl.setText('Goodreads Kütüphanesini İçe Aktar');
    this.renderCurrentStep();
  }

  override onClose(): void {
    if (this.isImportRunning && this.abortController) {
      this.abortController.abort();
    }
    if (this.plugin && this.plugin.activeImportModal === this) {
      this.plugin.activeImportModal = null;
    }
    this.contentEl.empty();
  }

  // --- Public State Accessors for Testing & Coordination ---

  getCurrentStep(): ModalStep {
    return this.currentStep;
  }

  getScanResult(): DuplicateScanResult | null {
    return this.scanResult;
  }

  getUpdateExisting(): boolean {
    return this.updateExisting;
  }

  setUpdateExisting(val: boolean): void {
    this.updateExisting = val;
    this.updateExistingToggle?.setValue(val);
    if (this.scanResult) {
      // Mevcut kitap seçimi her zaman updateExisting ile senkronize edilir
      this.selectedExistingBookIndices = val
        ? new Set(this.scanResult.existingBooks.map((_book, index) => index))
        : new Set<number>();
    } else if (!val) {
      this.selectedExistingBookIndices.clear();
    }
    this.syncCheckboxStates();
    this.refreshSelectionUi();
  }

  getSearchQuery(): string {
    return this.searchQuery;
  }

  getSelectedNewBookIndices(): number[] {
    return Array.from(this.selectedNewBookIndices).sort((a, b) => a - b);
  }

  getSelectedExistingBookIndices(): number[] {
    return Array.from(this.selectedExistingBookIndices).sort((a, b) => a - b);
  }

  getEnrichFromProviders(): boolean {
    return this.enrichFromProviders;
  }

  setEnrichFromProviders(val: boolean): void {
    this.enrichFromProviders = val;
  }

  getImportResult(): ImportResult | null {
    return this.importResult;
  }

  // --- Step Rendering ---

  private renderCurrentStep(): void {
    this.contentEl.empty();
    switch (this.currentStep) {
      case 'select':
        this.renderSelectStep();
        break;
      case 'scanning':
        this.renderScanningStep();
        break;
      case 'preview':
        this.renderPreviewStep();
        break;
      case 'importing':
        this.renderImportingStep();
        break;
      case 'completed':
        this.renderCompletedStep();
        break;
    }
  }

  private renderSelectStep(): void {
    const container = this.contentEl.createDiv({ cls: 'kitap-import-container' });

    container.createEl('p', {
      cls: 'kitap-import-desc',
      text: 'Goodreads hesabınızdan dışa aktardığınız goodreads_library_export.csv dosyasını seçin. Kitaplarınız kasanızdaki mevcut kitaplarla karşılaştırılacak ve mükerrer kayıtlar tespit edilecektir.',
    });

    this.errorBannerEl = container.createDiv({
      cls: `kitap-import-error-banner ${this.errorMessage ? '' : 'is-hidden'}`,
      text: this.errorMessage || '',
    });

    const dropzone = container.createDiv({ cls: 'kitap-import-dropzone' });
    dropzone.createDiv({ cls: 'kitap-import-dropzone-icon', text: '📄' });
    dropzone.createDiv({
      cls: 'kitap-import-dropzone-text',
      text: 'Goodreads CSV dosyasını seçin veya buraya sürükleyin',
    });
    dropzone.createDiv({
      cls: 'kitap-import-dropzone-subtext',
      text: 'goodreads_library_export.csv dosyası desteklenir',
    });

    const fileInput = container.createEl('input', {
      cls: 'kitap-import-file-input',
      attr: { type: 'file', accept: '.csv,text/csv' },
    });
    fileInput.type = 'file';
    fileInput.accept = '.csv,text/csv';

    dropzone.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) {
        void this.processFile(file);
      }
    });

    dropzone.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      dropzone.addClass('is-dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.removeClass('is-dragover');
    });

    dropzone.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      dropzone.removeClass('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        void this.processFile(file);
      }
    });
  }

  private renderScanningStep(): void {
    const container = this.contentEl.createDiv({ cls: 'kitap-import-container' });
    const loadingBox = container.createDiv({ cls: 'kitap-loading-container' });
    loadingBox.createDiv({ cls: 'kitap-spinner' });
    loadingBox.createDiv({
      cls: 'kitap-import-desc',
      text: 'Kasadaki mevcut kitaplar taranıyor ve mükerrer kayıtlar tespit ediliyor...',
    });
  }

  private renderPreviewStep(): void {
    if (!this.scanResult) return;

    const container = this.contentEl.createDiv({ cls: 'kitap-import-container' });

    // 1. File Badge
    const fileBadge = container.createDiv({ cls: 'kitap-import-file-info' });
    fileBadge.createDiv({
      cls: 'kitap-import-file-name',
      text: this.selectedFileName || 'goodreads_library_export.csv',
    });
    const totalCount =
      this.scanResult.newBooks.length + this.scanResult.existingBooks.length;
    fileBadge.createDiv({
      cls: 'kitap-import-stat-label',
      text: `${totalCount} kitap kaydı okundu`,
    });

    // 2. Statistics Grid
    const statsGrid = container.createDiv({ cls: 'kitap-import-stats-grid' });

    const newCard = statsGrid.createDiv({
      cls: 'kitap-import-stat-card kitap-stat-new',
    });
    newCard.createDiv({
      cls: 'kitap-import-stat-num',
      text: String(this.scanResult.newBooks.length),
    });
    newCard.createDiv({ cls: 'kitap-import-stat-label', text: 'Yeni Kitaplar' });

    const existingCard = statsGrid.createDiv({
      cls: 'kitap-import-stat-card kitap-stat-existing',
    });
    existingCard.createDiv({
      cls: 'kitap-import-stat-num',
      text: String(this.scanResult.existingBooks.length),
    });
    existingCard.createDiv({ cls: 'kitap-import-stat-label', text: 'Mevcut Kitaplar' });

    const totalCard = statsGrid.createDiv({
      cls: 'kitap-import-stat-card kitap-stat-total',
    });
    totalCard.createDiv({
      cls: 'kitap-import-stat-num',
      text: String(totalCount),
    });
    totalCard.createDiv({ cls: 'kitap-import-stat-label', text: 'Toplam Kitap' });

    // 3. Existing Books Interactive Confirmation
    this.updateExistingToggle = null;
    if (this.scanResult.existingBooks.length > 0) {
      const confirmBox = container.createDiv({ cls: 'kitap-import-confirm-box' });
      confirmBox.createDiv({
        cls: 'kitap-import-confirm-header',
        text: '⚠️ Mevcut Kitap Notları Tespit Edildi',
      });
      confirmBox.createEl('p', {
        cls: 'kitap-import-confirm-desc',
        text: `Kasanızda zaten ${this.scanResult.existingBooks.length} adet kitap notu bulunmaktadır. Bu mevcut notların okuma durumu, kişisel puan, okunma tarihi gibi frontmatter metaverilerini güncellemek ister misiniz? Not içeriğiniz, kişisel düşünceleriniz ve kitap-kart bloklarınız kesinlikle korunur.`,
      });

      new Setting(confirmBox)
        .setName('Mevcut Kitap Notlarını Güncelle')
        .setDesc(
          'Açık: Mevcut notların YAML frontmatter değerleri güncellenir. Kapalı: Mevcut notlar atlanır, yalnızca yeni kitaplar eklenir. Seçimi aşağıdaki listeden tek tek de değiştirebilirsiniz.'
        )
        .addToggle((toggle) => {
          this.updateExistingToggle = toggle;
          toggle.setValue(this.updateExisting).onChange((val) => {
            this.setUpdateExisting(val);
          });
        });
    }

    // 4. Searchable & Checkable Book Selection List
    this.renderBookSelectionSection(container);


    const optionsSection = container.createDiv({ cls: 'kitap-import-options-section' });
    new Setting(optionsSection)
      .setName('Eksik kapak ve künye bilgilerini sağlayıcılardan zenginleştir')
      .setDesc(
        'Etkinleştirildiğinde eksik kapak görselleri ve bibliyografik detaylar Kitapyurdu, D&R, OpenLibrary ve Hardcover sağlayıcılarından sorgulanır. Kapalıyken (önerilen) aktarım tamamen yerel ve çevrimdışı gerçekleşir.'
      )
      .addToggle((toggle) => {
        toggle.setValue(this.enrichFromProviders).onChange((val) => {
          this.setEnrichFromProviders(val);
        });
      });

    // 5. Action Footer
    const footer = container.createDiv({ cls: 'kitap-import-footer' });
    const backBtn = footer.createEl('button', {
      cls: 'mod-cancel',
      text: 'Geri',
    });
    backBtn.addEventListener('click', () => {
      this.currentStep = 'select';
      this.renderCurrentStep();
    });

    this.submitButtonEl = footer.createEl('button', {
      cls: 'mod-cta',
      text: this.getSubmitButtonText(),
    });
    this.submitButtonEl.addEventListener('click', () => {
      void this.startImport();
    });
    this.refreshSelectionUi();
  }

  private renderImportingStep(): void {
    const container = this.contentEl.createDiv({ cls: 'kitap-import-container' });
    const progressContainer = container.createDiv({
      cls: 'kitap-import-progress-container',
    });

    progressContainer.createEl('h3', {
      cls: 'kitap-import-progress-title',
      text: 'Kitaplar İçe Aktarılıyor...',
    });

    const barWrap = progressContainer.createDiv({
      cls: 'kitap-import-progress-bar-wrap',
    });
    this.progressFillEl = barWrap.createDiv({ cls: 'kitap-import-progress-fill' });
    this.progressFillEl.style.width = `${this.currentProgress.percent}%`;

    const meta = progressContainer.createDiv({ cls: 'kitap-import-progress-meta' });
    this.progressPercentEl = meta.createDiv({
      cls: 'kitap-import-progress-percent',
      text: `%${this.currentProgress.percent} (${this.currentProgress.current} / ${this.currentProgress.total})`,
    });

    this.progressStatusEl = meta.createDiv({
      cls: 'kitap-import-status-text',
      text: this.currentProgress.message || 'Hazırlanıyor...',
    });

    const footer = container.createDiv({ cls: 'kitap-import-footer' });
    const cancelBtn = footer.createEl('button', {
      cls: 'mod-warning',
      text: 'İptal Et',
    });
    cancelBtn.addEventListener('click', () => {
      this.cancelImport();
    });
  }

  private renderCompletedStep(): void {
    const container = this.contentEl.createDiv({ cls: 'kitap-import-container' });

    const isAborted = this.abortController?.signal.aborted ?? false;
    const hasErrors = (this.importResult?.errors.length ?? 0) > 0;

    const titleText = isAborted
      ? '⚠️ İçe Aktarma Durduruldu'
      : hasErrors
      ? '⚠️ İçe Aktarma Kısmen Tamamlandı'
      : '🎉 İçe Aktarma Başarıyla Tamamlandı';

    container.createEl('h3', { text: titleText });

    const statsGrid = container.createDiv({ cls: 'kitap-import-stats-grid' });

    const newCard = statsGrid.createDiv({
      cls: 'kitap-import-stat-card kitap-stat-new',
    });
    newCard.createDiv({
      cls: 'kitap-import-stat-num',
      text: String(this.importResult?.importedCount ?? 0),
    });
    newCard.createDiv({ cls: 'kitap-import-stat-label', text: 'Oluşturulan Notlar' });

    const updateCard = statsGrid.createDiv({
      cls: 'kitap-import-stat-card kitap-stat-existing',
    });
    updateCard.createDiv({
      cls: 'kitap-import-stat-num',
      text: String(this.importResult?.updatedCount ?? 0),
    });
    updateCard.createDiv({ cls: 'kitap-import-stat-label', text: 'Güncellenen Notlar' });

    const skippedCard = statsGrid.createDiv({
      cls: 'kitap-import-stat-card kitap-stat-total',
    });
    skippedCard.createDiv({
      cls: 'kitap-import-stat-num',
      text: String(this.importResult?.skippedCount ?? 0),
    });
    skippedCard.createDiv({ cls: 'kitap-import-stat-label', text: 'Atlanan Notlar' });

    if (hasErrors && this.importResult) {
      const errorDetails = container.createEl('details', {
        cls: 'kitap-import-existing-details',
      });
      errorDetails.createEl('summary', {
        cls: 'kitap-import-existing-summary',
        text: `Hatalar (${this.importResult.errors.length})`,
      });
      const errorList = errorDetails.createDiv({ cls: 'kitap-import-existing-list' });
      for (const err of this.importResult.errors) {
        const item = errorList.createDiv({ cls: 'kitap-import-existing-item' });
        item.createSpan({ text: err.title });
        item.createSpan({ cls: 'kitap-import-error-banner', text: err.error });
      }
    }

    const footer = container.createDiv({ cls: 'kitap-import-footer' });
    const closeBtn = footer.createEl('button', {
      cls: 'mod-cta',
      text: 'Kapat',
    });
    closeBtn.addEventListener('click', () => {
      this.close();
    });
  }

  private renderBookSelectionSection(container: HTMLElement): void {
    if (!this.scanResult) return;

    const section = container.createDiv({ cls: 'kitap-import-selection-section' });
    const toolbar = section.createDiv({ cls: 'kitap-import-search-toolbar' });
    this.searchInputEl = toolbar.createEl('input', {
      cls: 'kitap-import-search-input',
      attr: { type: 'search', placeholder: 'Kitap adı, yazar veya ISBN ile ara...' },
    });
    this.searchInputEl.value = this.searchQuery;
    this.searchInputEl.addEventListener('input', () => {
      this.searchQuery = this.searchInputEl?.value ?? '';
      this.filterBookListDom();
    });

    const actionsRow = toolbar.createDiv({ cls: 'kitap-import-selection-actions' });
    const selectVisibleBooks = (selected: boolean): void => {
      if (!this.bookListEl) return;
      for (const item of Array.from(this.bookListEl.children)) {
        const el = item as HTMLElement;
        if (el.style.display === 'none') continue;
        const index = Number(el.dataset.bookIndex);
        if (el.dataset.bookKind === 'new') {
          selected ? this.selectedNewBookIndices.add(index) : this.selectedNewBookIndices.delete(index);
        } else if (el.dataset.bookKind === 'existing') {
          selected
            ? this.selectedExistingBookIndices.add(index)
            : this.selectedExistingBookIndices.delete(index);
        }
      }
      if (selected && this.selectedExistingBookIndices.size > 0) {
        this.updateExisting = true;
        this.updateExistingToggle?.setValue(true);
      } else if (!selected && this.selectedExistingBookIndices.size === 0) {
        this.updateExisting = false;
        this.updateExistingToggle?.setValue(false);
      }
      this.syncCheckboxStates();
      this.refreshSelectionUi();
    };

    const selectAllButton = actionsRow.createEl('button', {
      cls: 'kitap-import-select-btn',
      text: 'Tümünü Seç',
      attr: { type: 'button', 'data-action': 'select-all' },
    });
    selectAllButton.addEventListener('click', () => selectVisibleBooks(true));
    const deselectAllButton = actionsRow.createEl('button', {
      cls: 'kitap-import-select-btn',
      text: 'Seçimi Kaldır',
      attr: { type: 'button', 'data-action': 'deselect-all' },
    });
    deselectAllButton.addEventListener('click', () => selectVisibleBooks(false));
    this.selectionCounterEl = actionsRow.createSpan({ cls: 'kitap-import-selection-counter' });

    this.bookListEl = section.createDiv({ cls: 'kitap-import-book-list' });
    const addBookItem = (
      book: ParsedGoodreadsBook,
      kind: 'new' | 'existing',
      index: number,
      badgeText: string
    ): void => {
      const item = this.bookListEl?.createDiv({
        cls: `kitap-import-book-item${kind === 'existing' ? ' kitap-existing-item kitap-import-existing-item' : ''}`,
        attr: { 'data-book-kind': kind, 'data-book-index': String(index) },
      });
      if (!item) return;
      const checkbox = item.createEl('input', {
        cls: 'kitap-import-book-checkbox',
        attr: { type: 'checkbox' },
      });
      checkbox.checked = kind === 'new'
        ? this.selectedNewBookIndices.has(index)
        : this.selectedExistingBookIndices.has(index);
      checkbox.addEventListener('change', () => {
        const selectedIndices = kind === 'new'
          ? this.selectedNewBookIndices
          : this.selectedExistingBookIndices;
        checkbox.checked ? selectedIndices.add(index) : selectedIndices.delete(index);
        if (kind === 'existing') {
          this.updateExisting = this.selectedExistingBookIndices.size > 0;
          this.updateExistingToggle?.setValue(this.updateExisting);
        }
        this.refreshSelectionUi();
      });
      const info = item.createDiv({ cls: 'kitap-import-book-info' });
      info.createDiv({
        cls: 'kitap-import-book-title',
        text: kind === 'existing' ? `${book.cleanTitle} - ${book.metadata.author}` : book.cleanTitle,
      });
      info.createDiv({
        cls: 'kitap-import-book-author',
        text: book.metadata.author || 'Bilinmeyen Yazar',
      });
      item.createSpan({
        cls: kind === 'new' ? 'kitap-import-badge-new' : 'kitap-import-match-badge',
        text: badgeText,
      });
    };

    this.scanResult.newBooks.forEach((book, index) => addBookItem(book, 'new', index, 'Yeni Kitap'));
    this.scanResult.existingBooks.forEach((match, index) => {
      addBookItem(
        match.csvBook,
        'existing',
        index,
        match.matchReason === 'title-author-normalized'
          ? 'Başlık & Yazar Eşleşmesi'
          : 'ISBN Eşleşmesi'
      );
    });
    this.bookListEmptyEl = section.createDiv({
      cls: 'kitap-import-book-empty',
      text: 'Aramanızla eşleşen kitap bulunamadı.',
    });
    this.filterBookListDom();
    this.refreshSelectionUi();
  }

  private matchesSearchQuery(book: ParsedGoodreadsBook): boolean {
    if (!this.searchQuery.trim()) return true;
    const query = normalizeTurkish(this.searchQuery);
    return [book.cleanTitle, book.metadata.title, book.metadata.author, book.isbn13 || '', book.isbn10 || '']
      .some((value) => normalizeTurkish(value || '').includes(query));
  }

  private filterBookListDom(): void {
    if (!this.bookListEl || !this.scanResult) return;
    let visibleCount = 0;
    for (const item of Array.from(this.bookListEl.children)) {
      const el = item as HTMLElement;
      const index = Number(el.dataset.bookIndex);
      const book = el.dataset.bookKind === 'new'
        ? this.scanResult.newBooks[index]
        : this.scanResult.existingBooks[index]?.csvBook;
      const matches = book ? this.matchesSearchQuery(book) : false;
      el.style.display = matches ? '' : 'none';
      if (matches) visibleCount++;
    }
    if (this.bookListEmptyEl) this.bookListEmptyEl.style.display = visibleCount ? 'none' : '';
  }

  private syncCheckboxStates(): void {
    if (!this.bookListEl) return;
    for (const item of Array.from(this.bookListEl.querySelectorAll<HTMLElement>('.kitap-import-book-item'))) {
      const checkbox = item.querySelector<HTMLInputElement>('.kitap-import-book-checkbox');
      const index = Number(item.dataset.bookIndex);
      if (!checkbox) continue;
      checkbox.checked = item.dataset.bookKind === 'new'
        ? this.selectedNewBookIndices.has(index)
        : this.selectedExistingBookIndices.has(index);
    }
  }

  private refreshSelectionUi(): void {
    const selectedCount = this.selectedNewBookIndices.size + this.selectedExistingBookIndices.size;
    const totalCount = this.scanResult
      ? this.scanResult.newBooks.length + this.scanResult.existingBooks.length
      : 0;
    if (this.selectionCounterEl) {
      this.selectionCounterEl.setText(
        `${selectedCount} / ${totalCount} seçili (${this.selectedNewBookIndices.size} yeni, ${this.selectedExistingBookIndices.size} güncelleme)`
      );
    }
    if (this.submitButtonEl) {
      this.submitButtonEl.setText(this.getSubmitButtonText());
      this.submitButtonEl.disabled = selectedCount === 0;
    }
  }

  // --- Logic Helpers ---

  private getSubmitButtonText(): string {
    if (!this.scanResult) return 'İçe Aktarmayı Başlat';
    const newCount = this.selectedNewBookIndices.size;
    const existingCount = this.selectedExistingBookIndices.size;
    if (newCount === 0 && existingCount === 0) return 'En Az Bir Kitap Seçin';
    if (existingCount > 0) {
      return `İçe Aktar ve Güncelle (${newCount} Yeni, ${existingCount} Güncelleme)`;
    }
    return `Yalnızca Yeni Kitapları Aktar (${newCount} Kitap)`;
  }

  private validateGoodreadsCsv(content: string): string | null {
    if (!content || !content.trim()) {
      return 'Seçilen CSV dosyası boş.';
    }

    const clean = stripBom(content);
    const firstLineEnd = clean.search(/\r?\n/);
    const firstLine = firstLineEnd !== -1 ? clean.slice(0, firstLineEnd) : clean;
    const lowerFirstLine = firstLine.toLowerCase();

    const hasTitle = lowerFirstLine.includes('title');
    const hasAuthorOrId =
      lowerFirstLine.includes('author') ||
      lowerFirstLine.includes('book id') ||
      lowerFirstLine.includes('bookid');

    if (!hasTitle || !hasAuthorOrId) {
      return "Geçersiz Goodreads CSV formatı. Dosya 'Title' ve 'Author' (veya 'Book Id') sütunlarını içermelidir.";
    }

    const parser = this.options?.parserFn ?? parseGoodreadsCsv;
    const rawRows = parser(clean);
    if (rawRows.length === 0) {
      return 'CSV dosyasında okunabilecek kitap kaydı bulunamadı.';
    }

    return null;
  }

  private async processFile(file: File): Promise<void> {
    this.selectedFileName = file.name;
    try {
      const text = await file.text();
      await this.handleFileSelected(text, file.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errorMessage = 'Dosya okunamadı: ' + msg;
      this.currentStep = 'select';
      this.renderCurrentStep();
    }
  }

  async handleFileSelected(content: string, fileName: string): Promise<void> {
    this.errorMessage = null;
    const validationError = this.validateGoodreadsCsv(content);
    if (validationError) {
      this.errorMessage = validationError;
      this.currentStep = 'select';
      this.renderCurrentStep();
      return;
    }

    this.selectedFileName = fileName;
    this.rawCsvContent = stripBom(content);
    this.currentStep = 'scanning';
    this.renderCurrentStep();

    try {
      const parser = this.options?.parserFn ?? parseGoodreadsCsv;
      const rawRows = parser(this.rawCsvContent);
      const mapper = this.options?.mapperFn ?? mapGoodreadsRow;
      const parsedBooks = rawRows.map((r) => mapper(r, this.plugin.settings));

      const scanner = this.options?.scannerFn ?? scanVaultBooks;
      const vaultBooks = await scanner(this.app, this.plugin.settings?.targetFolder);

      const detector = this.options?.detectorFn ?? detectDuplicates;
      this.scanResult = detector(parsedBooks, vaultBooks);
      this.selectedNewBookIndices = new Set(this.scanResult.newBooks.map((_book, index) => index));
      this.selectedExistingBookIndices = this.updateExisting
        ? new Set(this.scanResult.existingBooks.map((_book, index) => index))
        : new Set();
      this.searchQuery = '';

      this.currentStep = 'preview';
      this.renderCurrentStep();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errorMessage = 'Tarama sırasında hata oluştu: ' + msg;
      this.currentStep = 'select';
      this.renderCurrentStep();
    }
  }

  updateProgressUI(current: number, total: number, message: string): void {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    this.currentProgress = { current, total, percent, message };
    if (this.progressFillEl) {
      this.progressFillEl.style.width = `${percent}%`;
    }
    if (this.progressPercentEl) {
      this.progressPercentEl.setText(`%${percent} (${current} / ${total})`);
    }
    if (this.progressStatusEl) {
      this.progressStatusEl.setText(message);
    }
  }
  async startImport(): Promise<ImportResult> {
    if (!this.scanResult) {
      throw new Error('İçe aktarma başlatılamadı: Tarama sonucu bulunamadı.');
    }

    this.currentStep = 'importing';
    this.isImportRunning = true;
    this.abortController = new AbortController();
    this.renderCurrentStep();

    const filteredNewBooks = this.scanResult.newBooks.filter((_book, index) =>
      this.selectedNewBookIndices.has(index)
    );
    const selectedExistingBooks = this.scanResult.existingBooks.filter((_book, index) =>
      this.selectedExistingBookIndices.has(index)
    );
    const effectiveUpdateExisting = this.updateExisting && selectedExistingBooks.length > 0;
    const filteredExistingBooks = effectiveUpdateExisting ? selectedExistingBooks : this.scanResult.existingBooks;
    const unselectedNewCount = this.scanResult.newBooks.length - filteredNewBooks.length;
    const unselectedExistingCount = effectiveUpdateExisting
      ? this.scanResult.existingBooks.length - selectedExistingBooks.length
      : 0;
    const filteredScanResult: DuplicateScanResult = {
      newBooks: filteredNewBooks,
      existingBooks: filteredExistingBooks,
    };
    const total = filteredNewBooks.length + (effectiveUpdateExisting ? filteredExistingBooks.length : 0);
    this.updateProgressUI(0, total, 'İçe aktarma başlatılıyor...');

    const importOptions: ImportOptions = {
      updateExisting: effectiveUpdateExisting,
      enrichFromProviders: this.enrichFromProviders,
      targetFolder: this.plugin.settings?.targetFolder,
      abortSignal: this.abortController.signal,
      onProgress: (current: number, tot: number, message: string) => {
        this.updateProgressUI(current, tot, message);
      },
    };

    try {
      let result: ImportResult;
      if (this.options?.importHandler) {
        result = await this.options.importHandler(filteredScanResult, importOptions);
      } else {
        const importer = new GoodreadsImporter(this.app, this.plugin);
        result = await importer.importBooks(filteredScanResult, importOptions);
      }

      result.skippedCount = (result.skippedCount ?? 0) + unselectedNewCount + unselectedExistingCount;

      this.importResult = result;
      this.currentStep = 'completed';
      this.isImportRunning = false;
      this.renderCurrentStep();
      this.options?.onImportComplete?.(result);
      return result;
    } catch (err) {
      this.isImportRunning = false;
      const msg = err instanceof Error ? err.message : String(err);
      this.importResult = {
        importedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errors: [{ title: 'İçe Aktarma', error: msg }],
      };
      this.currentStep = 'completed';
      this.renderCurrentStep();
      return this.importResult;
    }
  }

  cancelImport(): void {
    if (this.abortController && !this.abortController.signal.aborted) {
      this.abortController.abort();
    }
    if (this.progressStatusEl) {
      this.progressStatusEl.setText('İçe aktarma durduruldu...');
    }
  }
}
