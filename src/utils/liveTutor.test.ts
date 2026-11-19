import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_SCENARIOS,
  LIVE_VOICES,
  buildTutorSystemInstruction,
  extractCustomVocabHints,
  buildQuickStarters,
  buildReviewAnalysisPrompt,
  hasEnoughTurnsForReview,
  normalizeLiveReviewResponse,
  formatCallDuration,
  removeDcOffset,
  float32ToInt16Pcm,
  downsampleFloat32ToInt16,
  int16ToBase64,
  base64ToInt16,
  pcmInt16ToFloat32,
  buildWavBytesFromPcm16,
  computeOrbEnergy,
  type LiveLessonContext,
} from './liveTutor';

const sampleLesson: LiveLessonContext = {
  level: 'HSK 3',
  numberText: 'BÀI 1',
  titleChinese: '周末你有什么打算？',
  titlePinyin: 'Zhōumò nǐ yǒu shénme dǎsuàn?',
  titleVietnamese: 'Cuối tuần bạn có dự định gì?',
  vocabulary: [
    { hanzi: '周末', pinyin: 'zhōumò', meaning: 'cuối tuần' },
    { hanzi: '打算', pinyin: 'dǎsuàn', meaning: 'dự định' },
    { hanzi: '复习', pinyin: 'fùxí', meaning: 'ôn tập' },
  ],
  grammar: [
    { title: 'Cấu trúc 也/都 + 不/没', formula: '一……也/都 + 不/没……' },
  ],
};

test('LIVE_SCENARIOS and LIVE_VOICES cover freestyle, topic scenarios, and Gemini Live voices', () => {
  const scenarioIds = LIVE_SCENARIOS.map((s) => s.id);
  assert.ok(scenarioIds.includes('freestyle'));
  assert.ok(scenarioIds.includes('lesson'));
  assert.ok(scenarioIds.includes('daily'));
  assert.ok(scenarioIds.includes('travel'));
  assert.ok(scenarioIds.includes('shopping'));
  assert.ok(scenarioIds.includes('work'));
  assert.ok(scenarioIds.includes('health'));

  const voiceIds = LIVE_VOICES.map((v) => v.id);
  assert.deepEqual(voiceIds, ['Zephyr', 'Kore', 'Charon', 'Fenrir', 'Puck']);
});

test('buildTutorSystemInstruction handles freestyle and lesson-synced prompts cleanly', () => {
  const freestylePrompt = buildTutorSystemInstruction({
    lesson: sampleLesson,
    scenarioId: 'freestyle',
    languageMode: 'bilingual',
  });
  assert.match(freestylePrompt, /TRÒ CHUYỆN TỰ DO/);
  assert.match(freestylePrompt, /HSK 3/);

  const bilingualPrompt = buildTutorSystemInstruction({
    lesson: sampleLesson,
    scenarioId: 'lesson',
    languageMode: 'bilingual',
  });
  assert.match(bilingualPrompt, /Tiểu Bối/);
  assert.match(bilingualPrompt, /HSK 3 - BÀI 1/);
  assert.match(bilingualPrompt, /周末 \(zhōumò\): cuối tuần/);
  assert.match(bilingualPrompt, /SONG NGỮ/);

  const chineseOnlyPrompt = buildTutorSystemInstruction({
    lesson: { ...sampleLesson, level: 'HSK 6' },
    scenarioId: 'travel',
    languageMode: 'chinese_only',
    speechPace: 'natural',
  });
  assert.match(chineseOnlyPrompt, /100% TIẾNG TRUNG/);
  assert.match(chineseOnlyPrompt, /Du lịch & Hỏi đường/);
  assert.match(chineseOnlyPrompt, /HSK 6/);
  assert.match(chineseOnlyPrompt, /CHẾ ĐỘ TỐC ĐỘ TỰ NHIÊN/);

  const clearPacePrompt = buildTutorSystemInstruction({
    lesson: sampleLesson,
    scenarioId: 'lesson',
    languageMode: 'bilingual',
    speechPace: 'clear',
  });
  assert.match(clearPacePrompt, /CHẾ ĐỘ PHÁT ÂM RÕ & SƯ PHẠM/);
  assert.match(clearPacePrompt, /4 thanh điệu/);
});

test('extractCustomVocabHints deduplicates hanzi terms and includes lesson title within cap', () => {
  const manyVocab = Array.from({ length: 30 }, (_, idx) => ({
    hanzi: idx === 1 ? '周末' : `词${idx}`,
    pinyin: 'p',
    meaning: 'm',
  }));
  const hints = extractCustomVocabHints({
    ...sampleLesson,
    vocabulary: manyVocab,
  });
  assert.ok(hints.length <= 25);
  assert.equal(new Set(hints).size, hints.length);
  assert.ok(hints.includes('词0'));
  assert.ok(hints.includes('周末'));
  assert.ok(hints.includes(sampleLesson.titleChinese));
});

test('buildQuickStarters supports freestyle and lesson-specific vocabulary', () => {
  const freestyleStarters = buildQuickStarters(sampleLesson, 'freestyle');
  assert.equal(freestyleStarters.length, 4);
  assert.ok(freestyleStarters[0].hanzi.includes('随便聊聊'));

  const starters = buildQuickStarters(sampleLesson, 'lesson');
  assert.equal(starters.length, 4);
  assert.ok(starters[0].hanzi.includes('周末'));
  assert.ok(starters[1].hanzi.includes('周末'));
  assert.ok(starters[2].hanzi.includes('打算'));

  const travelStarters = buildQuickStarters(sampleLesson, 'travel');
  assert.equal(travelStarters.length, 4);
  assert.ok(travelStarters.some((s) => s.hanzi.includes('地铁站')));
});

test('post-conversation review helpers validate turns, build prompt, and normalize scores', () => {
  assert.equal(hasEnoughTurnsForReview([]), false);
  assert.equal(
    hasEnoughTurnsForReview([{ role: 'ai', text: '你好！' }]),
    false
  );
  assert.equal(
    hasEnoughTurnsForReview([
      { role: 'ai', text: '你好！' },
      { role: 'user', text: '我昨天去超市买东西。' },
    ]),
    true
  );

  const reviewPrompt = buildReviewAnalysisPrompt({
    lesson: sampleLesson,
    scenarioId: 'freestyle',
    transcripts: [
      { role: 'ai', text: '你好！最近怎么样？' },
      { role: 'user', text: '我昨天去买苹果，很贵。' },
    ],
  });
  assert.match(reviewPrompt, /Học viên: 我昨天去买苹果/);
  assert.match(reviewPrompt, /Trò chuyện trực tiếp/);

  const normalized = normalizeLiveReviewResponse({
    overallScore: 120,
    pronunciationScore: -5,
    grammarScore: '86',
    fluencyScore: 91.4,
    summary: '  Bạn phản xạ rất tự nhiên.  ',
    pronunciationFeedback: ['Chú ý thanh 3 ở từ 买 (mǎi)', ''],
    mistakes: [
      {
        original: '我去买东西昨天',
        corrected: '我昨天去买东西了',
        pinyin: 'Wǒ zuótiān qù mǎi dōngxi le',
        explanation: 'Trạng ngữ chỉ thời gian đặt trước động từ.',
      },
    ],
    attentionPoints: ['Đặt trạng ngữ thời gian trước động từ'],
    suggestedPhrases: [
      {
        hanzi: '我觉得价格有点贵。',
        pinyin: 'Wǒ juéde jiàgé yǒudiǎn guì.',
        vietnamese: 'Tôi thấy giá hơi đắt một chút.',
        usageNote: 'Dùng khi nhận xét giá cả tự nhiên hơn.',
      },
    ],
  });

  assert.equal(normalized.overallScore, 100);
  assert.equal(normalized.pronunciationScore, 0);
  assert.equal(normalized.grammarScore, 86);
  assert.equal(normalized.fluencyScore, 91);
  assert.equal(normalized.summary, 'Bạn phản xạ rất tự nhiên.');
  assert.equal(normalized.pronunciationFeedback.length, 1);
  assert.equal(normalized.mistakes.length, 1);
  assert.equal(normalized.suggestedPhrases[0].hanzi, '我觉得价格有点贵。');
});

test('formatCallDuration formats elapsed seconds in MM:SS', () => {
  assert.equal(formatCallDuration(0), '00:00');
  assert.equal(formatCallDuration(9), '00:09');
  assert.equal(formatCallDuration(65), '01:05');
  assert.equal(formatCallDuration(-5), '00:00');
  assert.equal(formatCallDuration(NaN), '00:00');
});

test('PCM Int16 <-> Base64 <-> Float32 roundtrip and downsampling work accurately', () => {
  const floatInput = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const pcm = float32ToInt16Pcm(floatInput);
  assert.equal(pcm[0], 0);
  assert.equal(pcm[3], 32767);
  assert.equal(pcm[4], -32768);

  const b64 = int16ToBase64(pcm);
  const decoded = base64ToInt16(b64);
  assert.deepEqual(Array.from(decoded), Array.from(pcm));

  const floatBack = pcmInt16ToFloat32(decoded);
  assert.ok(Math.abs(floatBack[1] - 0.5) < 0.001);

  // Downsample 48kHz (480 samples = 10ms) -> 16kHz (160 samples = 10ms)
  const buf48k = new Float32Array(480).fill(0.25);
  const down16k = downsampleFloat32ToInt16(buf48k, 48000, 16000);
  assert.equal(down16k.length, 160);
  // Constant input has uniform DC mean removed so steady DC bias is eliminated cleanly
  assert.equal(down16k[0], 0);

  // DC offset removal centers biased oscillating signal around zero
  const biasedWave = new Float32Array(441);
  for (let i = 0; i < biasedWave.length; i++) {
    biasedWave[i] = 0.2 + 0.3 * Math.sin((2 * Math.PI * i) / 44.1);
  }
  const centered = removeDcOffset(biasedWave);
  const meanCentered = centered.reduce((a, b) => a + b, 0) / centered.length;
  assert.ok(Math.abs(meanCentered) < 0.01);

  // Anti-aliased 44.1kHz -> 16kHz downsampling keeps non-constant signal bounded and accurate
  const downFrom441 = downsampleFloat32ToInt16(biasedWave, 44100, 16000);
  assert.equal(downFrom441.length, 160);
  const maxAbs = downFrom441.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(maxAbs > 5000 && maxAbs < 15000);
});

test('buildWavBytesFromPcm16 writes valid RIFF/WAVE header and sample payload', () => {
  const c1 = new Int16Array([100, -100]);
  const c2 = new Int16Array([200]);
  const wav = buildWavBytesFromPcm16([c1, c2], 24000);
  assert.equal(wav.byteLength, 44 + 6);
  const header = Buffer.from(wav.slice(0, 12)).toString('ascii');
  assert.equal(header.slice(0, 4), 'RIFF');
  assert.equal(header.slice(8, 12), 'WAVE');
  const view = new DataView(wav.buffer);
  assert.equal(view.getUint32(24, true), 24000);
  assert.equal(view.getUint32(40, true), 6);
});

test('computeOrbEnergy reflects state and clamps audio amplitudes cleanly', () => {
  assert.ok(computeOrbEnergy(0.8, 0, 'listening') > 0.7);
  assert.ok(computeOrbEnergy(0, 0.9, 'speaking') > 0.85);
  assert.equal(computeOrbEnergy(1, 1, 'muted'), 0.05);
  assert.equal(computeOrbEnergy(5, 5, 'speaking'), 1);
});
