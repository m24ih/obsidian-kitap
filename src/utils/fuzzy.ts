/**
 * Türkçe Karakter ve Case-Insensitive Fuzzy Arama Yardımcısı
 */

/**
 * Türkçe karakterleri küçük harfe ve diyakritiksiz standart Latin karşılıklarına dönüştürür.
 * Örnek: "Üç Cisim Problemi" -> "uc cisim problemi"
 */
export function normalizeTurkish(text: string): string {
  if (!text) return '';
  return text
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * İki metin arasında case-insensitive ve Türkçe normalizasyonlu fuzzy benzerlik skoru hesaplar.
 * Skor ne kadar yüksekse eşleşme o kadar güçlüdür. 0 = eşleşme yok.
 */
export function calculateFuzzyScore(query: string, target: string): number {
  const normQuery = normalizeTurkish(query);
  const normTarget = normalizeTurkish(target);

  if (!normQuery || !normTarget) return 0;

  // 1. Tam birebir eşleşme
  if (normTarget === normQuery) {
    return 1000;
  }

  // 2. Başlangıç eşleşmesi (prefix match)
  if (normTarget.startsWith(normQuery)) {
    return 800 + (normQuery.length / normTarget.length) * 100;
  }

  // 3. Alt dize eşleşmesi (substring match)
  const substrIndex = normTarget.indexOf(normQuery);
  if (substrIndex !== -1) {
    return 600 - substrIndex * 2 + (normQuery.length / normTarget.length) * 100;
  }

  // 4. Kelime bazlı eşleşme (kullanıcının yazdığı her kelime hedefte var mı?)
  const queryWords = normQuery.split(' ').filter(Boolean);
  if (queryWords.length > 1) {
    let allWordsFound = true;
    let matchedWordCount = 0;
    for (const word of queryWords) {
      if (normTarget.includes(word)) {
        matchedWordCount++;
      } else {
        allWordsFound = false;
      }
    }
    if (allWordsFound) {
      return 500 + matchedWordCount * 20;
    }
    if (matchedWordCount > 0) {
      return (matchedWordCount / queryWords.length) * 300;
    }
  }

  // 5. Sıralı karakter eşleşmesi (subsequence fuzzy match)
  let qIdx = 0;
  let matches = 0;
  let prevMatchIdx = -1;
  let consecutiveBonus = 0;

  for (let tIdx = 0; tIdx < normTarget.length && qIdx < normQuery.length; tIdx++) {
    if (normTarget[tIdx] === normQuery[qIdx]) {
      matches++;
      if (prevMatchIdx !== -1 && tIdx === prevMatchIdx + 1) {
        consecutiveBonus += 5;
      }
      prevMatchIdx = tIdx;
      qIdx++;
    }
  }

  if (qIdx === normQuery.length) {
    return 200 + consecutiveBonus + (matches / normTarget.length) * 50;
  }

  return 0;
}

/**
 * Kitap arama sonuçlarını başlık, yazar ve yayınevi ağırlıklarına göre sıralar.
 */
export function fuzzySortBooks<T extends { title: string; author?: string; publisher?: string }>(
  query: string,
  items: T[]
): T[] {
  if (!query || !query.trim() || !items || items.length === 0) {
    return items;
  }

  const scoredItems = items.map((item, originalIndex) => {
    const titleScore = calculateFuzzyScore(query, item.title) * 2.0;
    const authorScore = item.author ? calculateFuzzyScore(query, item.author) * 1.5 : 0;
    const publisherScore = item.publisher ? calculateFuzzyScore(query, item.publisher) * 0.8 : 0;
    const totalScore = Math.max(titleScore, authorScore, publisherScore);

    return {
      item,
      score: totalScore,
      originalIndex,
    };
  });

  // Skoru yüksek olanları öne al, skor eşitse orijinal sırayı koru
  scoredItems.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.originalIndex - b.originalIndex;
  });

  return scoredItems.map((s) => s.item);
}
