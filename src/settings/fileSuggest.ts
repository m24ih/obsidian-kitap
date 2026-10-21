import { AbstractInputSuggest, App, TFile } from 'obsidian';

/**
 * Vault içerisindeki Markdown şablon dosyalarını filtreleyerek öneren suggester
 */
export class FileSuggest extends AbstractInputSuggest<TFile> {
  protected inputEl: HTMLInputElement;
  private onSelectCb?: (file: TFile, evt: MouseEvent | KeyboardEvent) => void;

  constructor(app: App, textInputEl: HTMLInputElement) {
    super(app, textInputEl);
    this.inputEl = textInputEl;
  }

  override onSelect(callback: (value: TFile, evt: MouseEvent | KeyboardEvent) => unknown): this {
    this.onSelectCb = callback;
    super.onSelect(callback);
    return this;
  }

  protected getSuggestions(query: string): TFile[] {
    const lowerQuery = query.toLowerCase().trim();
    const vault = this.app.vault;
    if (!vault) {
      return [];
    }

    let files: TFile[] = [];
    if (typeof vault.getMarkdownFiles === 'function') {
      files = vault.getMarkdownFiles();
    } else if (typeof vault.getFiles === 'function') {
      files = vault.getFiles().filter((file) => file.path.endsWith('.md'));
    } else if (typeof vault.getAllLoadedFiles === 'function') {
      files = (vault.getAllLoadedFiles() as unknown[]).filter(
        (file): file is TFile => file instanceof TFile && file.path.endsWith('.md')
      );
    }

    return files.filter((file) => {
      if (!lowerQuery) return true;
      return (
        file.path.toLowerCase().includes(lowerQuery) ||
        file.name.toLowerCase().includes(lowerQuery)
      );
    });
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.setText(file.path);
  }

  selectSuggestion(file: TFile, evt?: MouseEvent | KeyboardEvent): void {
    this.setValue(file.path);
    if (this.onSelectCb) {
      this.onSelectCb(file, evt as MouseEvent | KeyboardEvent);
    }
    this.inputEl?.dispatchEvent(new Event('input', { bubbles: true }));
    this.inputEl?.dispatchEvent(new Event('change', { bubbles: true }));
    this.close();
  }
}
