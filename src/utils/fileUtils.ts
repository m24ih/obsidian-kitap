import { normalizePath, Vault } from 'obsidian';

/**
 * İç içe klasör yollarını (ör. "Kitaplar/Kapaklar/2026") kademeli ve güvenli olarak oluşturur.
 */
export async function ensureFolderExists(vault: Vault, folderPath: string): Promise<void> {
  if (!vault || typeof vault.createFolder !== 'function') return;

  const normalized = normalizePath(folderPath).replace(/^\/+|\/+$/g, '');
  if (!normalized || normalized === '.') return;

  const segments = normalized.split('/').filter(Boolean);
  let currentPath = '';

  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    const existing = vault.getAbstractFileByPath?.(currentPath);
    if (!existing) {
      try {
        await vault.createFolder(currentPath);
      } catch {
        // Klasör eşzamanlı oluşturulmuşsa hatayı yoksay
      }
    }
  }
}
