import { AbstractInputSuggest, App, TFile } from 'obsidian';

/**
 * Vault içerisindeki Markdown şablon dosyalarını filtreleyerek öneren suggester
 */
export class FileSuggest extends AbstractInputSuggest<TFile> {
  constructor(app: App, textInputEl: HTMLInputElement) {
    super(app, textInputEl);
  }

  protected getSuggestions(query: string): TFile[] {
    const lowerQuery = query.toLowerCase().trim();
    const vault = (this.app as any)?.vault;
    if (!vault || typeof vault.getFiles !== 'function') {
      return [];
    }

    const files = vault.getFiles() as TFile[];
    return files.filter((file) => {
      const isMd = file.path.endsWith('.md');
      if (!isMd) return false;
      if (!lowerQuery) return true;
      return file.path.toLowerCase().includes(lowerQuery) || file.name.toLowerCase().includes(lowerQuery);
    });
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.setText(file.path);
  }

  selectSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent): void {
    this.setValue(file.path);
    this.close();
  }
}
