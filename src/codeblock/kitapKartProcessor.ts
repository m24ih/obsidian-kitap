import { App, MarkdownPostProcessorContext, TFile, parseYaml } from 'obsidian';
import { parseCardData } from '../card/types';
import { renderKitapCard } from '../card/cardRenderer';

/**
 * Creates the codeblock processor callback for ```kitap-kart.
 */
export function createKitapKartProcessor(app: App) {
  return async (
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): Promise<void> => {
    el.empty();

    try {
      // 1. Parse optional codeblock YAML / parameter overrides
      let overrides: Record<string, unknown> = {};
      const trimmedSource = (source || '').trim();
      if (trimmedSource) {
        try {
          const parsed: unknown = parseYaml(trimmedSource);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            overrides = parsed as Record<string, unknown>;
          }
        } catch (yamlErr) {
          console.warn('[obsidian-kitap] kitap-kart YAML override parsing warning:', yamlErr);
        }
      }

      // 2. Read frontmatter from active note
      let frontmatter: Record<string, unknown> | null = null;
      if (ctx?.sourcePath) {
        const cache = app.metadataCache.getCache(ctx.sourcePath);
        frontmatter = (cache?.frontmatter as Record<string, unknown>) || null;

        if (!frontmatter) {
          const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
          if (file instanceof TFile) {
            const fileCache = app.metadataCache.getFileCache(file);
            frontmatter = (fileCache?.frontmatter as Record<string, unknown>) || null;
          }
        }
      }

      // 3. Normalise card data
      const cardData = parseCardData(frontmatter, {
        sourcePath: ctx?.sourcePath,
        app,
        overrides,
      });

      // 4. Render visually
      renderKitapCard(el, cardData);
    } catch (err) {
      console.error('[obsidian-kitap] kitap-kart render error:', err);
      const errorContainer = el.createDiv({ cls: 'kitap-kart-error' });
      errorContainer.createDiv({
        cls: 'kitap-kart-error-title',
        text: 'Kütüphane Kartı oluşturulurken bir hata oluştu.',
      });
      errorContainer.createDiv({
        cls: 'kitap-kart-error-desc',
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
