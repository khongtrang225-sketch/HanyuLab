import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePinyin, filterWords, calculateSpeechScore, formatRubyAnnotation, LessonWord } from './hanyuLogic';

test('normalizePinyin strips tones and normalizes properly', () => {
  assert.equal(normalizePinyin('dǎsuàn'), 'dasuan');
  assert.equal(normalizePinyin('yīqǐ'), 'yiqi');
  assert.equal(normalizePinyin('lǚxíng'), 'luxing');
  assert.equal(normalizePinyin('Nihao'), 'nihao');
});

test('filterWords matches by Hanzi, Pinyin, or Meaning', () => {
  const words: LessonWord[] = [
    {
      id: 'w1',
      hanzi: '打算',
      traditional: '打算',
      pinyin: 'dǎsuàn',
      pinyinRaw: 'dasuan',
      pos: 'Động từ / Danh từ',
      meaning: 'Dự định, tính toán'
    },
    {
      id: 'w2',
      hanzi: '周末',
      traditional: '週末',
      pinyin: 'zhōumò',
      pinyinRaw: 'zhoumo',
      pos: 'Danh từ',
      meaning: 'Cuối tuần'
    },
    {
      id: 'w3',
      hanzi: '跟',
      traditional: '跟',
      pinyin: 'gēn',
      pinyinRaw: 'gen',
      pos: 'Giới từ',
      meaning: 'Cùng, với'
    }
  ];

  // Match by Hanzi
  const r1 = filterWords(words, '周末');
  assert.equal(r1.length, 1);
  assert.equal(r1[0].hanzi, '周末');

  // Match by Pinyin with tone
  const r2 = filterWords(words, 'dǎsuàn');
  assert.equal(r2.length, 1);
  assert.equal(r2[0].hanzi, '打算');

  // Match by Pinyin without tone
  const r3 = filterWords(words, 'dasuan');
  assert.equal(r3.length, 1);
  assert.equal(r3[0].hanzi, '打算');

  // Match by Meaning
  const r4 = filterWords(words, 'cuối tuần');
  assert.equal(r4.length, 1);
  assert.equal(r4[0].hanzi, '周末');

  // Empty query returns all
  assert.equal(filterWords(words, '').length, 3);
});

test('calculateSpeechScore evaluates match accuracy', () => {
  const perfect = calculateSpeechScore('周末你有什么打算', '周末你有什么打算');
  assert.equal(perfect.score, 100);
  assert.ok(perfect.feedback.includes('Xuất sắc'));

  const empty = calculateSpeechScore('', '周末你有什么打算');
  assert.equal(empty.score, 0);

  const partial = calculateSpeechScore('周末有什么打算', '周末你有什么打算');
  assert.ok(partial.score >= 80);
});

test('formatRubyAnnotation splits characters and pinyin', () => {
  const pairs = formatRubyAnnotation('周末', 'zhōu mò');
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].char, '周');
  assert.equal(pairs[0].py, 'zhōu');
  assert.equal(pairs[1].char, '末');
  assert.equal(pairs[1].py, 'mò');
});
