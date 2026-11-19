export type LiveLanguageMode = 'bilingual' | 'chinese_only';

export type LiveSpeechPace = 'clear' | 'natural';

export type LiveScenarioId =
  | 'freestyle'
  | 'lesson'
  | 'daily'
  | 'travel'
  | 'shopping'
  | 'work'
  | 'health';

export type LiveVoiceId = 'Zephyr' | 'Kore' | 'Charon' | 'Fenrir' | 'Puck';

export type LiveOrbState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'speaking'
  | 'muted'
  | 'error';

export interface LessonVocabBrief {
  hanzi: string;
  pinyin?: string;
  meaning?: string;
}

export interface LessonGrammarBrief {
  title: string;
  formula?: string;
}

export interface LiveLessonContext {
  level: string;
  numberText: string;
  titleChinese: string;
  titlePinyin?: string;
  titleVietnamese: string;
  vocabulary: LessonVocabBrief[];
  grammar?: LessonGrammarBrief[];
}

export interface LiveScenarioOption {
  id: LiveScenarioId;
  label: string;
  shortDesc: string;
  promptFocus: string;
}

export interface LiveVoiceOption {
  id: LiveVoiceId;
  label: string;
  toneDesc: string;
}

export interface LiveQuickStarter {
  hanzi: string;
  pinyin: string;
  vietnamese: string;
}

export interface LiveTranscriptTurnInput {
  role: 'user' | 'ai' | 'system';
  text: string;
}

export interface LiveReviewMistake {
  original: string;
  corrected: string;
  pinyin: string;
  explanation: string;
}

export interface LiveReviewSuggestion {
  hanzi: string;
  pinyin: string;
  vietnamese: string;
  usageNote: string;
}

export interface LiveConversationReview {
  overallScore: number;
  pronunciationScore: number;
  grammarScore: number;
  fluencyScore: number;
  summary: string;
  pronunciationFeedback: string[];
  mistakes: LiveReviewMistake[];
  attentionPoints: string[];
  suggestedPhrases: LiveReviewSuggestion[];
}

export const LIVE_SCENARIOS: LiveScenarioOption[] = [
  {
    id: 'freestyle',
    label: 'Trò chuyện trực tiếp (Tự do)',
    shortDesc: 'Không cố định chủ đề — Tiểu Bối phát triển mạch nói tự nhiên theo câu chuyện của bạn.',
    promptFocus:
      'TRÒ CHUYỆN TỰ DO KHÔNG CỐ ĐỊNH CHỦ ĐỀ. Đừng ép theo một kịch bản có sẵn; hãy mở đầu tự nhiên bằng câu hỏi gần gũi, sau đó lắng nghe chủ đề, cảm xúc hoặc câu chuyện mà người học nhắc tới để nối tiếp, đào sâu và gợi mở tự nhiên theo đúng mạch giao tiếp thực tế.',
  },
  {
    id: 'lesson',
    label: 'Theo bài học hiện tại',
    shortDesc: 'Luyện phản xạ trực tiếp với từ vựng và mẫu câu trong bài HSK đang mở.',
    promptFocus:
      'Ưu tiên lồng ghép tự nhiên các từ vựng và cấu trúc ngữ pháp của bài học hiện tại vào câu hỏi và phản hồi để học viên thực hành ngay.',
  },
  {
    id: 'daily',
    label: 'Giao tiếp hàng ngày tự nhiên',
    shortDesc: 'Trò chuyện đời thường, hỏi thăm, thói quen, sở thích và bạn bè.',
    promptFocus:
      'Đóng vai người bạn bản xứ thân thiện trò chuyện đời thường (thời tiết, cuối tuần, thói quen, gia đình, sở thích) nhưng vẫn giữ độ khó phù hợp cấp độ HSK của học viên.',
  },
  {
    id: 'travel',
    label: 'Du lịch & Hỏi đường',
    shortDesc: 'Đặt phòng khách sạn, hỏi đường, tàu xe, sân bay và điểm tham quan.',
    promptFocus:
      'Đóng vai nhân viên hướng dẫn / người dân địa phương tại Trung Quốc giúp học viên thực hành hỏi đường, đặt phòng, đi tàu cao tốc, mua vé tham quan.',
  },
  {
    id: 'shopping',
    label: 'Nhà hàng & Mua sắm',
    shortDesc: 'Gọi món ăn, thanh toán, trả giá, chọn kích cỡ và đổi trả hàng.',
    promptFocus:
      'Đóng vai nhân viên nhà hàng hoặc chủ cửa hàng để học viên luyện gọi món, hỏi giá, mặc cả lịch sự và thanh toán.',
  },
  {
    id: 'work',
    label: 'Công việc & Công sở',
    shortDesc: 'Phỏng vấn, trao đổi công việc, họp nhóm và giao tiếp với đồng nghiệp.',
    promptFocus:
      'Đóng vai đồng nghiệp hoặc nhà tuyển dụng thân thiện để luyện giới thiệu kinh nghiệm, hẹn lịch họp, báo cáo tiến độ công việc.',
  },
  {
    id: 'health',
    label: 'Sức khỏe & Cuộc sống',
    shortDesc: 'Mô tả triệu chứng, khám bệnh, mua thuốc và lối sống lành mạnh.',
    promptFocus:
      'Đóng vai bác sĩ hoặc dược sĩ ân cần để học viên luyện mô tả tình trạng sức khỏe, thói quen sinh hoạt và lắng nghe lời khuyên.',
  },
];

export const LIVE_VOICES: LiveVoiceOption[] = [
  { id: 'Zephyr', label: 'Gió nhẹ', toneDesc: 'Tự nhiên, ấm áp' },
  { id: 'Kore', label: 'Rõ ràng', toneDesc: 'Nữ chuẩn sư phạm' },
  { id: 'Charon', label: 'Trầm ấm', toneDesc: 'Điềm đạm, sâu lắng' },
  { id: 'Fenrir', label: 'Nam tính', toneDesc: 'Nam trầm, mạch lạc' },
  { id: 'Puck', label: 'Năng động', toneDesc: 'Trẻ trung, vui tươi' },
];

export interface BuildInstructionParams {
  lesson: LiveLessonContext;
  scenarioId: LiveScenarioId;
  languageMode: LiveLanguageMode;
  speechPace?: LiveSpeechPace;
}

export function extractCustomVocabHints(lesson: LiveLessonContext): string[] {
  const seen = new Set<string>();
  const hints: string[] = [];
  const pushClean = (raw?: string) => {
    const val = String(raw || '').trim();
    if (!val || seen.has(val)) return;
    seen.add(val);
    hints.push(val);
  };

  for (const v of lesson.vocabulary || []) {
    pushClean(v.hanzi);
    if (hints.length >= 24) break;
  }
  pushClean(lesson.titleChinese);
  return hints;
}

export function buildTutorSystemInstruction({
  lesson,
  scenarioId,
  languageMode,
  speechPace = 'clear',
}: BuildInstructionParams): string {
  const scenario =
    LIVE_SCENARIOS.find((s) => s.id === scenarioId) ?? LIVE_SCENARIOS[0];

  const vocabPreview = (lesson.vocabulary || [])
    .slice(0, 16)
    .map((v) => `${v.hanzi}${v.pinyin ? ` (${v.pinyin})` : ''}${v.meaning ? `: ${v.meaning}` : ''}`)
    .join('; ');

  const grammarPreview = (lesson.grammar || [])
    .slice(0, 5)
    .map((g) => `${g.title}${g.formula ? ` [${g.formula}]` : ''}`)
    .join('; ');

  const levelRule = getHskPacingGuideline(lesson.level, speechPace);

  const languageRule =
    languageMode === 'chinese_only'
      ? [
          'CHẾ ĐỘ NGÔN NGỮ: 100% TIẾNG TRUNG.',
          '- Luôn nói hoàn toàn bằng tiếng Trung phổ thông chuẩn (普通话), tuyệt đối không chuyển sang tiếng Việt hay tiếng Anh.',
          '- Nếu học viên nói sai từ, sai ngữ pháp hoặc phát âm chưa chuẩn thanh điệu: hãy nhẹ nhàng lặp lại câu/từ đúng bằng tiếng Trung chậm rãi, nhấn rõ thanh điệu và mời học viên đọc theo (跟读).',
        ].join('\n')
      : [
          'CHẾ ĐỘ NGÔN NGỮ: SONG NGỮ (TIẾNG TRUNG + SỬA LỖI TIẾNG VIỆT).',
          '- Giao tiếp chính bằng tiếng Trung phổ thông chuẩn phù hợp cấp độ HSK hiện tại.',
          '- Khi học viên phát âm sai thanh điệu, nhầm âm bật hơi/uốn lưỡi hoặc sai ngữ pháp: chỉ ra ngắn gọn bằng tiếng Việt (1 câu chỉ rõ lỗi thanh điệu hoặc cách phát âm đúng), đọc mẫu lại từ/câu tiếng Trung thật rõ ràng rồi tiếp tục hội thoại.',
          '- Khi nói tiếng Trung, tuyệt đối giữ phát âm tiếng Trung chuẩn, không pha trộn ngữ điệu tiếng Việt vào âm tiết tiếng Trung.',
        ].join('\n');

  const paceRule =
    speechPace === 'clear'
      ? [
          'CHẾ ĐỘ PHÁT ÂM RÕ & SƯ PHẠM (MẶC ĐỊNH):',
          '- Nói chậm hơn nhịp giao tiếp thông thường khoảng 15–20%, tách rõ từng âm tiết và giữ nguyên độ cao chuẩn của cả 4 thanh điệu + thanh nhẹ.',
          '- Khi đọc từ vựng mới, từ khóa của bài hoặc từ vừa sửa cho học viên: ngắt nhịp nhẹ 0.2 giây trước và sau từ đó, phát âm tròn vành rõ chữ (đặc biệt các âm dễ nhầm với người Việt như zh/ch/sh vs z/c/s, j/q/x, p/t/k bật hơi, vần ü, vần cuối -n/-ng và biến điệu 一 / 不 / 3+3).',
          '- Nếu học viên yêu cầu luyện phát âm một từ cụ thể, hãy đọc mẫu từ đó 1–2 lần chậm rõ rồi nghe học viên đọc lại và nhận xét cụ thể.',
        ].join('\n')
      : [
          'CHẾ ĐỘ TỐC ĐỘ TỰ NHIÊN:',
          '- Giữ nhịp nói tự nhiên trôi chảy đúng trình độ HSK đang chọn, nhưng vẫn phát âm chuẩn thanh điệu phổ thông và đọc rõ các từ vựng trọng tâm khi nhấn ý.',
        ].join('\n');

  return [
    'Bạn là Tiểu Bối (小贝), gia sư AI dạy phát âm và giao tiếp tiếng Trung phổ thông chuẩn (普通话) cho người Việt tại HanyuLab.',
    'Phong cách đàm thoại: tự nhiên như cuộc gọi trực tiếp, phản hồi ngắn gọn mỗi lượt (2–4 câu), kết thúc bằng 1 câu hỏi mở nhẹ nhàng để người học nói nhiều nhất.',
    '',
    `BÀI HỌC ĐANG ĐỒNG BỘ: ${lesson.level} - ${lesson.numberText}: ${lesson.titleChinese} (${lesson.titleVietnamese})`,
    levelRule,
    scenarioId === 'freestyle'
      ? 'Lưu ý ngữ cảnh tự do: Chỉ dùng trình độ HSK đang chọn làm chuẩn độ khó từ vựng/tốc độ, không bắt buộc gò bó vào từ vựng cố định nếu người học muốn nói về chủ đề khác.'
      : vocabPreview
      ? `Từ vựng trọng tâm của bài: ${vocabPreview}.`
      : '',
    scenarioId !== 'freestyle' && grammarPreview
      ? `Ngữ pháp trọng tâm: ${grammarPreview}.`
      : '',
    '',
    `TÌNH HUỐNG THỰC HÀNH (${scenario.label}): ${scenario.promptFocus}`,
    '',
    paceRule,
    '',
    languageRule,
    '',
    'NGUYÊN TẮC NHẬN DIỆN & HỘI THOẠI TRỰC TIẾP:',
    '- Người học là người Việt đang luyện nói tiếng Trung; nếu âm thanh đầu vào có phát âm gần giống từ tiếng Trung trong ngữ cảnh (kể cả khi thanh điệu hơi lệch hoặc nói ngắt quãng), hãy hiểu đúng ý định và khéo léo xác nhận/chỉnh âm nhẹ nhàng.',
    '- Không ngắt lời khi người học đang suy nghĩ ngắn; chỉ trả lời bằng văn nói tự nhiên (không đọc ký tự markdown, dấu sao, gạch đầu dòng).',
    '- Nếu vừa bắt đầu cuộc gọi hoặc nhận tín hiệu chào đầu phiên, hãy chào ngắn gọn bằng tiếng Trung phổ thông chuẩn (đọc rõ từng chữ) và mở lời câu hỏi đầu tiên tự nhiên.',
  ]
    .filter(Boolean)
    .join('\n');
}

function getHskPacingGuideline(level: string, speechPace: LiveSpeechPace): string {
  const clarityTag =
    speechPace === 'clear' ? 'Ưu tiên phát âm tròn âm, ngắt nghỉ rõ giữa các cụm từ. ' : '';
  switch (level) {
    case 'HSK 1':
      return `${clarityTag}Nhịp độ HSK 1: Nói chậm, rõ từng âm tiết, dùng câu ngắn 4–8 chữ với từ vựng sơ cấp nhất.`;
    case 'HSK 2':
      return `${clarityTag}Nhịp độ HSK 2: Nói chậm vừa phải, câu đơn giản dễ nghe, ưu tiên từ vựng sinh hoạt cơ bản.`;
    case 'HSK 3':
      return `${clarityTag}Nhịp độ HSK 3: Tốc độ vừa phải rõ chữ, dùng câu ghép cơ bản và mẫu câu thông dụng.`;
    case 'HSK 4':
      return `${clarityTag}Nhịp độ HSK 4: Tốc độ giao tiếp đời thực mạch lạc, sử dụng từ nối và cấu trúc trung cấp tự nhiên.`;
    case 'HSK 5':
      return `${clarityTag}Nhịp độ HSK 5: Giao tiếp lưu loát rõ ý, có thể lồng ghép thành ngữ thông dụng và diễn đạt sâu.`;
    case 'HSK 6':
      return `${clarityTag}Nhịp độ HSK 6: Tốc độ bản xứ chuẩn xác, từ vựng phong phú, thảo luận sắc thái và quan điểm tinh tế.`;
    default:
      return `${clarityTag}Điều chỉnh tốc độ và từ vựng phù hợp trình độ hiện tại của học viên.`;
  }
}

export function buildQuickStarters(
  lesson: LiveLessonContext,
  scenarioId: LiveScenarioId
): LiveQuickStarter[] {
  const firstVocab = lesson.vocabulary?.[0];
  const secondVocab = lesson.vocabulary?.[1];

  const lessonStarter: LiveQuickStarter = {
    hanzi: `小贝老师好！我们今天用“${firstVocab?.hanzi || lesson.titleChinese}”练习对话吧。`,
    pinyin: 'Xiǎobèi lǎoshī hǎo! Wǒmen jīntiān yòng zhège cí liànxí duìhuà ba.',
    vietnamese: `Chào cô Tiểu Bối! Hôm nay mình luyện hội thoại với bài "${lesson.titleVietnamese}" nhé.`,
  };

  const scenarioMap: Record<LiveScenarioId, LiveQuickStarter[]> = {
    freestyle: [
      {
        hanzi: '小贝你好！今天我想随便聊聊，你最近怎么样？',
        pinyin: 'Xiǎobèi nǐ hǎo! Jīntiān wǒ xiǎng suíbiàn liáoliao, nǐ zuìjìn zěnmeyàng?',
        vietnamese: 'Chào Tiểu Bối! Hôm nay mình muốn tán gẫu tự do, dạo này bạn thế nào?',
      },
      {
        hanzi: '我今天发生了一件很有意思的事情，想跟你分享。',
        pinyin: 'Wǒ jīntiān fāshēng le yī jiàn hěn yǒuyìsi de shìqing, xiǎng gēn nǐ fēnxiǎng.',
        vietnamese: 'Hôm nay mình có một chuyện rất thú vị muốn kể cho bạn nghe.',
      },
      {
        hanzi: '你有什么推荐的话题吗？我们用中文聊吧！',
        pinyin: 'Nǐ yǒu shénme tuījiàn de huàtí ma? Wǒmen yòng Zhōngwén liáo ba!',
        vietnamese: 'Bạn có chủ đề nào gợi ý không? Chúng ta cùng trò chuyện bằng tiếng Trung nhé!',
      },
      {
        hanzi: '如果我刚才有说错的地方，请帮我指出来并教我怎么说更好。',
        pinyin: 'Rúguǒ wǒ gāngcái yǒu shuōcuò de dìfang, qǐng bāng wǒ zhǐchūlái.',
        vietnamese: 'Nếu vừa rồi mình nói chỗ nào chưa đúng, nhờ bạn chỉ giúp cách nói hay hơn nhé.',
      },
    ],
    lesson: [
      lessonStarter,
      {
        hanzi: firstVocab
          ? `请问“${firstVocab.hanzi}”在日常生活中怎么用？`
          : '请问这一课的重点语法怎么用？',
        pinyin: firstVocab?.pinyin || 'Qǐngwèn zhè yī kè de zhòngdiǎn yǔfǎ zěnme yòng?',
        vietnamese: firstVocab
          ? `Xin hỏi từ "${firstVocab.hanzi}" (${firstVocab.meaning || ''}) dùng thế nào trong đời sống?`
          : 'Xin hỏi ngữ pháp trọng tâm bài này dùng như thế nào?',
      },
      {
        hanzi: secondVocab
          ? `我想用“${secondVocab.hanzi}”造一个句子，请你帮我听一下。`
          : '我想练习课文里的对话，请你当我的搭档。',
        pinyin: secondVocab?.pinyin || 'Wǒ xiǎng liànxí kèwén lǐ de duìhuà.',
        vietnamese: secondVocab
          ? `Em muốn đặt câu với từ "${secondVocab.hanzi}", thầy/cô nghe giúp em nhé.`
          : 'Em muốn đóng vai luyện hội thoại theo bài khóa.',
      },
      {
        hanzi: '请用慢一点的速度和我对话，好吗？',
        pinyin: 'Qǐng yòng màn yīdiǎn de sùdù hé wǒ duìhuà, hǎo ma?',
        vietnamese: 'Xin hãy nói chậm một chút với em nhé, được không ạ?',
      },
    ],
    daily: [
      {
        hanzi: '你好小贝！你今天过得怎么样？',
        pinyin: 'Nǐ hǎo Xiǎobèi! Nǐ jīntiān guò de zěnmeyàng?',
        vietnamese: 'Chào Tiểu Bối! Hôm nay bạn thế nào?',
      },
      {
        hanzi: '这个周末你有什么打算？',
        pinyin: 'Zhège zhōumò nǐ yǒu shénme dǎsuàn?',
        vietnamese: 'Cuối tuần này bạn có dự định gì không?',
      },
      {
        hanzi: '我最近在努力学习中文，每天练习口语。',
        pinyin: 'Wǒ zuìjìn zài nǔlì xuéxí Zhōngwén, měitiān liànxí kǒuyǔ.',
        vietnamese: 'Dạo này mình đang chăm chỉ học tiếng Trung, luyện nói mỗi ngày.',
      },
      lessonStarter,
    ],
    travel: [
      {
        hanzi: '请问，去地铁站怎么走？',
        pinyin: 'Qǐngwèn, qù dìtiězhàn zěnme zǒu?',
        vietnamese: 'Xin hỏi, đi đến ga tàu điện ngầm đi đường nào ạ?',
      },
      {
        hanzi: '我想预订一间安静一点的房间。',
        pinyin: 'Wǒ xiǎng yùdìng yī jiān ānjìng yīdiǎn de fángjiān.',
        vietnamese: 'Tôi muốn đặt một phòng yên tĩnh một chút.',
      },
      {
        hanzi: '这附近有什么好玩的地方或者特色小吃吗？',
        pinyin: 'Zhè fùjìn yǒu shénme hǎowán de dìfang huòzhě tèsè xiǎochī ma?',
        vietnamese: 'Gần đây có địa điểm nào vui hoặc món ăn đặc sản nào không?',
      },
      lessonStarter,
    ],
    shopping: [
      {
        hanzi: '服务员，请问你们这里有什么招牌菜？',
        pinyin: 'Fúwùyuán, qǐngwèn nǐmen zhèlǐ yǒu shénme zhāopáicài?',
        vietnamese: 'Phục vụ ơi, xin hỏi quán mình có món đặc trưng nào ạ?',
      },
      {
        hanzi: '这件衣服很好看，可以便宜一点吗？',
        pinyin: 'Zhè jiàn yīfu hěn hǎokàn, kěyǐ piányi yīdiǎn ma?',
        vietnamese: 'Bộ quần áo này đẹp quá, có thể bớt giá một chút không?',
      },
      {
        hanzi: '我想点菜，不要太辣的，谢谢。',
        pinyin: 'Wǒ xiǎng diǎncài, bùyào tài là de, xièxie.',
        vietnamese: 'Tôi muốn gọi món, đừng cay quá nhé, cảm ơn.',
      },
      lessonStarter,
    ],
    work: [
      {
        hanzi: '你好！请允许我简单介绍一下我的工作经验。',
        pinyin: 'Nǐ hǎo! Qǐng yǔnxǔ wǒ jiǎndān jièshào yīxià wǒ de gōngzuò jīngyàn.',
        vietnamese: 'Xin chào! Cho phép tôi giới thiệu ngắn gọn kinh nghiệm làm việc của mình.',
      },
      {
        hanzi: '今天的会议安排在下午两点，我们可以先准备一下。',
        pinyin: 'Jīntiān de huìyì ānpái zài xiàwǔ liǎng diǎn.',
        vietnamese: 'Cuộc họp hôm nay xếp lúc 2 giờ chiều, chúng ta chuẩn bị trước nhé.',
      },
      {
        hanzi: '关于这个项目，你有什么建议吗？',
        pinyin: 'Guānyú zhège xiàngmù, nǐ yǒu shénme jiànyì ma?',
        vietnamese: 'Về dự án này, bạn có đề xuất gì không?',
      },
      lessonStarter,
    ],
    health: [
      {
        hanzi: '医生，我最近觉得有点累，晚上睡不好。',
        pinyin: 'Yīshēng, wǒ zuìjìn juéde yǒudiǎn lèi, wǎnshang shuì bù hǎo.',
        vietnamese: 'Bác sĩ ơi, dạo này tôi thấy hơi mệt, buổi tối ngủ không ngon.',
      },
      {
        hanzi: '这个药一天吃几次，饭前还是饭后吃？',
        pinyin: 'Zhège yào yī tiān chī jǐ cì, fànqián háishi fànhòu chī?',
        vietnamese: 'Thuốc này mỗi ngày uống mấy lần, trước hay sau bữa ăn ạ?',
      },
      {
        hanzi: '你平时喜欢做什么运动来保持健康？',
        pinyin: 'Nǐ píngshí xǐhuan zuò shénme yùndòng lái bǎochí jiànkāng?',
        vietnamese: 'Bình thường bạn thích tập môn thể thao nào để giữ sức khỏe?',
      },
      lessonStarter,
    ],
  };

  return scenarioMap[scenarioId] || scenarioMap.freestyle;
}

export function hasEnoughTurnsForReview(
  turns: LiveTranscriptTurnInput[]
): boolean {
  if (!Array.isArray(turns)) return false;
  const meaningful = turns.filter(
    (t) => (t.role === 'user' || t.role === 'ai') && typeof t.text === 'string' && t.text.trim().length > 0
  );
  const userTurns = meaningful.filter((t) => t.role === 'user');
  return userTurns.length >= 1 && meaningful.length >= 1;
}

export function buildReviewAnalysisPrompt(params: {
  lesson: LiveLessonContext;
  scenarioId: LiveScenarioId;
  transcripts: LiveTranscriptTurnInput[];
}): string {
  const scenario =
    LIVE_SCENARIOS.find((s) => s.id === params.scenarioId) ?? LIVE_SCENARIOS[0];
  const dialogueLines = params.transcripts
    .filter((t) => (t.role === 'user' || t.role === 'ai') && t.text.trim().length > 0)
    .slice(-40)
    .map((t) => `${t.role === 'user' ? 'Học viên' : 'Tiểu Bối'}: ${t.text.trim()}`)
    .join('\n');

  return [
    'Bạn là chuyên gia sư phạm tiếng Trung (giáo trình HSK) đang tổng kết đánh giá chi tiết cho học viên Việt Nam ngay sau cuộc gọi Hội Thoại AI Live.',
    `Bối cảnh học tập: ${params.lesson.level} - ${params.lesson.numberText}: ${params.lesson.titleChinese} (${params.lesson.titleVietnamese}).`,
    `Tình huống hội thoại: ${scenario.label}.`,
    '',
    'NỘI DUNG HỘI THOẠI ĐÃ DIỄN RA:',
    dialogueLines,
    '',
    'YÊU CẦU PHÂN TÍCH (trả về JSON đúng schema, viết phần giải thích bằng tiếng Việt tự nhiên, khích lệ, rõ ràng):',
    '1. Chấm điểm 0-100 cho 4 tiêu chí: overallScore, pronunciationScore (dựa trên dấu hiệu nhận diện âm/thanh điệu/từ đồng âm trong bản chép lời và phản hồi sửa âm của Tiểu Bối), grammarScore, fluencyScore.',
    '2. summary: Nhận xét tổng quan ngắn gọn 2-3 câu về buổi nói chuyện.',
    '3. pronunciationFeedback: 2-4 gạch đầu dòng chỉ rõ âm đầu/vận mẫu/thanh điệu/biến điệu hoặc ngữ điệu học viên cần rèn thêm (hoặc điểm làm tốt).',
    '4. mistakes: Liệt kê các câu nói chưa chuẩn, lỗi dùng từ/ngữ pháp hoặc diễn đạt còn cứng của học viên (nếu không có lỗi lớn, đưa ra câu có thể nâng cấp tự nhiên hơn) gồm original, corrected (chữ Hán chuẩn), pinyin, explanation (tiếng Việt).',
    '5. attentionPoints: 2-4 điểm ngữ pháp/từ vựng/thói quen giao tiếp cần chú ý ghi nhớ.',
    '6. suggestedPhrases: 3-4 mẫu câu nói hay, tự nhiên để học viên áp dụng cho lần nói tiếp theo (gồm hanzi, pinyin, vietnamese, usageNote).',
  ].join('\n');
}

function clampScore(val: unknown, fallback: number): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function normalizeLiveReviewResponse(raw: unknown): LiveConversationReview {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pronunciationFeedback = Array.isArray(obj.pronunciationFeedback)
    ? obj.pronunciationFeedback.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  const attentionPoints = Array.isArray(obj.attentionPoints)
    ? obj.attentionPoints.map((s) => String(s || '').trim()).filter(Boolean)
    : [];

  const mistakes: LiveReviewMistake[] = Array.isArray(obj.mistakes)
    ? obj.mistakes
        .map((item) => {
          const m = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
          return {
            original: String(m.original || '').trim(),
            corrected: String(m.corrected || '').trim(),
            pinyin: String(m.pinyin || '').trim(),
            explanation: String(m.explanation || '').trim(),
          };
        })
        .filter((m) => m.corrected || m.explanation)
    : [];

  const suggestedPhrases: LiveReviewSuggestion[] = Array.isArray(obj.suggestedPhrases)
    ? obj.suggestedPhrases
        .map((item) => {
          const p = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
          return {
            hanzi: String(p.hanzi || '').trim(),
            pinyin: String(p.pinyin || '').trim(),
            vietnamese: String(p.vietnamese || '').trim(),
            usageNote: String(p.usageNote || '').trim(),
          };
        })
        .filter((p) => p.hanzi)
    : [];

  return {
    overallScore: clampScore(obj.overallScore, 80),
    pronunciationScore: clampScore(obj.pronunciationScore, 78),
    grammarScore: clampScore(obj.grammarScore, 80),
    fluencyScore: clampScore(obj.fluencyScore, 80),
    summary: String(obj.summary || '').trim(),
    pronunciationFeedback,
    mistakes,
    attentionPoints,
    suggestedPhrases,
  };
}

export function formatCallDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function removeDcOffset(input: Float32Array): Float32Array {
  if (input.length === 0) return input;
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    sum += input[i];
  }
  const mean = sum / input.length;
  if (Math.abs(mean) < 1e-5) return input;
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = Math.max(-1, Math.min(1, input[i] - mean));
  }
  return out;
}

export function float32ToInt16Pcm(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    out[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }
  return out;
}

export function downsampleFloat32ToInt16(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000
): Int16Array {
  const clean = removeDcOffset(input);
  if (!inputSampleRate || inputSampleRate <= targetSampleRate) {
    return float32ToInt16Pcm(clean);
  }

  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.max(1, Math.floor(clean.length / ratio));
  const result = new Int16Array(newLength);

  // Anti-aliased weighted window averaging + linear fractional edge interpolation
  for (let i = 0; i < newLength; i++) {
    const start = i * ratio;
    const end = Math.min(clean.length, (i + 1) * ratio);
    const startIdx = Math.floor(start);
    const endIdx = Math.min(clean.length - 1, Math.floor(end));

    let sample = 0;
    if (startIdx === endIdx) {
      const frac = start - startIdx;
      const nextIdx = Math.min(clean.length - 1, startIdx + 1);
      sample = clean[startIdx] * (1 - frac) + clean[nextIdx] * frac;
    } else {
      let weightSum = 0;
      let valSum = 0;
      for (let j = startIdx; j <= endIdx; j++) {
        let weight = 1;
        if (j === startIdx) weight = Math.min(1, j + 1 - start);
        else if (j === endIdx) weight = Math.max(0.01, end - j);
        valSum += clean[j] * weight;
        weightSum += weight;
      }
      sample = weightSum > 0 ? valSum / weightSum : clean[startIdx];
    }

    const clamped = Math.max(-1, Math.min(1, sample));
    result[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }
  return result;
}

export function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64ToInt16(base64: string): Int16Array {
  if (!base64) return new Int16Array(0);
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    const alignedLen = buf.byteLength - (buf.byteLength % 2);
    const out = new Int16Array(alignedLen / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = buf.readInt16LE(i * 2);
    }
    return out;
  }
  const binary = atob(base64);
  const byteLength = binary.length - (binary.length % 2);
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

export function pcmInt16ToFloat32(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    out[i] = pcm[i] / 32768;
  }
  return out;
}

export function buildWavBytesFromPcm16(
  chunks: Int16Array[],
  sampleRate = 24000
): Uint8Array {
  const totalSamples = chunks.reduce((acc, c) => acc + c.length, 0);
  const dataByteLength = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataByteLength, true);

  let byteOffset = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      view.setInt16(byteOffset, chunk[i], true);
      byteOffset += 2;
    }
  }
  return new Uint8Array(buffer);
}

export function computeOrbEnergy(
  inputAmp: number,
  outputAmp: number,
  state: LiveOrbState
): number {
  const clampedIn = Math.max(0, Math.min(1, inputAmp));
  const clampedOut = Math.max(0, Math.min(1, outputAmp));
  if (state === 'speaking') {
    return Math.min(1, 0.25 + clampedOut * 0.75);
  }
  if (state === 'listening') {
    return Math.min(1, 0.14 + clampedIn * 0.86);
  }
  if (state === 'connecting') {
    return 0.22;
  }
  if (state === 'muted' || state === 'error') {
    return 0.05;
  }
  return 0.08;
}
