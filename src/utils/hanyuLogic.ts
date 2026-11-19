/**
 * Pure logic utilities for HanyuLab Chinese Learning Platform
 */

export interface LessonWord {
  id: string;
  hanzi: string;
  traditional?: string;
  pinyin: string;
  pinyinRaw: string;
  pos: string; // Part of speech (danh từ, động từ, v.v.)
  meaning: string;
  collocations?: string[];
  exampleHanzi?: string;
  examplePinyin?: string;
  exampleMeaning?: string;
}

export interface SentenceItem {
  id: string;
  speaker: string;
  hanzi: string;
  pinyin: string;
  meaning: string;
}

/**
 * Normalizes pinyin text by stripping diacritics for search matching
 */
export function normalizePinyin(pinyin: string): string {
  return pinyin
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ü/g, 'u')
    .replace(/v/g, 'u')
    .trim();
}

/**
 * Filter words by search query matching Hanzi, Pinyin, or Vietnamese meaning
 */
export function filterWords(words: LessonWord[], query: string): LessonWord[] {
  if (!query || !query.trim()) return words;
  const cleanQ = query.trim().toLowerCase();
  const normalizedQ = normalizePinyin(cleanQ);

  return words.filter(word => {
    const matchHanzi = word.hanzi.includes(cleanQ) || (word.traditional && word.traditional.includes(cleanQ));
    const matchPinyin = normalizePinyin(word.pinyin).includes(normalizedQ) || word.pinyinRaw.toLowerCase().includes(normalizedQ);
    const matchMeaning = word.meaning.toLowerCase().includes(cleanQ);
    return matchHanzi || matchPinyin || matchMeaning;
  });
}

/**
 * Calculate similarity score between spoken input and expected Chinese text (0-100)
 */
export function calculateSpeechScore(spoken: string, expected: string): { score: number; feedback: string } {
  const cleanSpoken = spoken.replace(/[^\u4e00-\u9fa5]/g, '');
  const cleanExpected = expected.replace(/[^\u4e00-\u9fa5]/g, '');

  if (!cleanExpected) return { score: 100, feedback: 'Tuyệt vời!' };
  if (!cleanSpoken) return { score: 0, feedback: 'Chưa nhận diện được giọng nói, vui lòng thử lại.' };

  if (cleanSpoken === cleanExpected) {
    return { score: 100, feedback: 'Xuất sắc! Phát âm và âm điệu hoàn hảo!' };
  }

  // Count matching characters
  let matchCount = 0;
  for (let i = 0; i < cleanExpected.length; i++) {
    const char = cleanExpected[i];
    if (cleanSpoken.includes(char)) {
      matchCount++;
    }
  }

  const lengthPenalty = Math.abs(cleanSpoken.length - cleanExpected.length);
  const rawRatio = matchCount / Math.max(cleanExpected.length, cleanSpoken.length);
  const score = Math.max(0, Math.min(100, Math.round(rawRatio * 100 - lengthPenalty * 5)));

  let feedback = 'Cần luyện tập thêm. Hãy chú ý thanh điệu và ngữ điệu.';
  if (score >= 85) {
    feedback = 'Rất tốt! Phát âm chuẩn xác, trôi chảy gần như người bản xứ.';
  } else if (score >= 60) {
    feedback = 'Khá tốt! Hãy chú ý phát âm rõ nét các âm đầu và thanh 4.';
  }

  return { score, feedback };
}

/**
 * Formats Chinese text with pinyin ruby annotations
 */
export function formatRubyAnnotation(hanzi: string, pinyin: string): { char: string; py: string }[] {
  const chars = hanzi.split('');
  const pinyins = pinyin.split(/\s+/);
  
  return chars.map((char, idx) => ({
    char,
    py: pinyins[idx] || ''
  }));
}
