import { App, TFile } from 'obsidian';

export interface TemplaterPlugin {
  settings?: {
    trigger_on_file_creation?: boolean;
  };
  templater?: {
    overwrite_file_commands: (file: TFile) => Promise<void>;
  };
}

/**
 * Obsidian içerisinde Templater eklentisinin kurulu ve aktif olup olmadığını kontrol eder.
 */
export function getTemplaterPlugin(app: App): TemplaterPlugin | null {
  const pluginContainer = (app as any)?.plugins;
  const candidate = pluginContainer?.plugins?.['templater-obsidian'];

  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  return candidate as TemplaterPlugin;
}

/**
 * Templater eklentisi mevcut mu?
 */
export function hasTemplaterPlugin(app: App): boolean {
  return Boolean(getTemplaterPlugin(app));
}

/**
 * Oluşturulan not dosyasındaki Templater komutlarını (<% ... %>) çalıştırır.
 * Eğer Templater'ın "trigger_on_file_creation" ayarı zaten açıksa mükerrer çalıştırmaz.
 */
export async function useTemplaterPluginInFile(app: App, file: TFile): Promise<void> {
  const templater = getTemplaterPlugin(app);
  if (templater && !templater.settings?.trigger_on_file_creation && templater.templater?.overwrite_file_commands) {
    await templater.templater.overwrite_file_commands(file);
  }
}
