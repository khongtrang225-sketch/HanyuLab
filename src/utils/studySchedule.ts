export type WeekdayNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ScheduleLessonInput {
  id: number;
  level: string;
  numberText: string;
  titleChinese: string;
  titlePinyin?: string;
  titleVietnamese: string;
  vocabCount: number;
  grammarCount: number;
  sceneCount?: number;
  textCharCount?: number;
}

export type ScheduleTargetTab =
  | 'dialogue'
  | 'vocabulary'
  | 'grammar'
  | 'writing'
  | 'practice'
  | 'exercises'
  | 'live';

export interface StudySessionItem {
  id: string;
  sessionNumber: number;
  weekNumber: number;
  dateIso: string; // YYYY-MM-DD local
  weekday: WeekdayNumber;
  weekdayLabel: string;
  displayDate: string; // DD/MM/YYYY
  title: string;
  suggestedContent: string;
  suggestedTab: ScheduleTargetTab;
  suggestedTabLabel: string;
  primaryLessonId: number;
  lessonIds: number[];
  lessonLabels: string[];
  estimatedMinutes: number;
  partIndex: number; // 1-based within lesson
  totalPartsForLesson: number;
  note: string;
  completed: boolean;
  updatedAt?: string;
}

export interface StudyScheduleConfig {
  weekdays: WeekdayNumber[]; // JS Date.getDay() 0=CN, 1=T2 ... 6=T7
  level: string; // 'ALL' | 'HSK 1' ... 'HSK 6'
  fromLessonId: number;
  toLessonId: number;
  startDate: string; // YYYY-MM-DD
  weeks: number; // Auto-calculated span in weeks
  studyTime: string; // HH:MM 24h e.g. '20:00'
  durationMinutes: number; // 30..120 (default 90)
}

export interface StoredStudyScheduleState {
  version: 1;
  config: StudyScheduleConfig;
  sessions: StudySessionItem[];
  lastGeneratedAt: string;
}

export interface StudyScheduleStats {
  total: number;
  completed: number;
  remaining: number;
  percent: number;
}

export interface StudyCompletionForecast {
  totalPlannedSessions: number;
  completedSessions: number;
  remainingSessions: number;
  sessionsPerWeek: number;
  selectedWeekdays: WeekdayNumber[];
  durationMinutes: number;
  estimatedTotalMinutes: number;
  estimatedRemainingMinutes: number;
  estimatedWeeks: number; // e.g. 4.3
  estimatedDays: number; // calendar/estimated days for remainingSessions (or total when 0 done)
  startDateIso: string;
  projectedEndDateIso: string | null;
  projectedEndDisplay: string;
  totalLessonsCount: number;
  multiSessionLessonsCount: number;
  maxPartsPerLesson: number;
}

export const WEEKDAY_OPTIONS: Array<{
  day: WeekdayNumber;
  shortLabel: string;
  fullLabel: string;
}> = [
  { day: 1, shortLabel: 'T2', fullLabel: 'Thứ 2' },
  { day: 2, shortLabel: 'T3', fullLabel: 'Thứ 3' },
  { day: 3, shortLabel: 'T4', fullLabel: 'Thứ 4' },
  { day: 4, shortLabel: 'T5', fullLabel: 'Thứ 5' },
  { day: 5, shortLabel: 'T6', fullLabel: 'Thứ 6' },
  { day: 6, shortLabel: 'T7', fullLabel: 'Thứ 7' },
  { day: 0, shortLabel: 'CN', fullLabel: 'Chủ Nhật' },
];

export const DEFAULT_WEEKDAYS: WeekdayNumber[] = [2, 4, 6]; // T3, T5, T7
export const DEFAULT_STUDY_TIME = '20:00';
export const DEFAULT_DURATION_MINUTES = 90;

export const SCHEDULE_STORAGE_KEY = 'hanyulab_weekly_schedule_v1';

export function getWeekdayLabel(day: WeekdayNumber): string {
  return WEEKDAY_OPTIONS.find((w) => w.day === day)?.fullLabel ?? 'Thứ 2';
}

export function getWeekdayShortLabel(day: WeekdayNumber): string {
  return WEEKDAY_OPTIONS.find((w) => w.day === day)?.shortLabel ?? 'T2';
}

export function parseLocalDateIso(dateIso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateIso || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    Number.isNaN(d.getTime()) ||
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

export function formatLocalDateIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDisplayDate(dateIso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!match) return dateIso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function getTodayLocalIso(now = new Date()): string {
  return formatLocalDateIso(now);
}

export function normalizeStudyTime(timeStr?: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr || '').trim());
  if (!match) return DEFAULT_STUDY_TIME;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return DEFAULT_STUDY_TIME;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function normalizeDurationMinutes(mins?: number): number {
  const raw = Math.round(Number(mins) || DEFAULT_DURATION_MINUTES);
  return Math.max(30, Math.min(180, raw));
}

export function normalizeWeekdays(days: number[]): WeekdayNumber[] {
  const allowed = new Set<WeekdayNumber>();
  for (const d of days) {
    if (Number.isInteger(d) && d >= 0 && d <= 6) {
      allowed.add(d as WeekdayNumber);
    }
  }
  return WEEKDAY_OPTIONS.map((o) => o.day).filter((d) => allowed.has(d));
}

export function filterLessonsForLevel(
  allLessons: ScheduleLessonInput[],
  level: string
): ScheduleLessonInput[] {
  if (!level || level === 'ALL') return allLessons;
  return allLessons.filter((l) => l.level === level);
}

export function selectLessonsInRange(
  allLessons: ScheduleLessonInput[],
  level: string,
  fromLessonId: number,
  toLessonId: number
): ScheduleLessonInput[] {
  const levelPool = filterLessonsForLevel(allLessons, level);
  if (levelPool.length === 0) return [];
  let fromIdx = levelPool.findIndex((l) => l.id === Number(fromLessonId));
  let toIdx = levelPool.findIndex((l) => l.id === Number(toLessonId));
  if (fromIdx === -1) fromIdx = 0;
  if (toIdx === -1) toIdx = levelPool.length - 1;
  if (fromIdx > toIdx) {
    const tmp = fromIdx;
    fromIdx = toIdx;
    toIdx = tmp;
  }
  return levelPool.slice(fromIdx, toIdx + 1);
}

/**
 * Estimate realistic study duration (in minutes) for a single HSK lesson
 * based on HSK level, vocabulary count, grammar points, scenes, and dialogue/reading length.
 * Upper HSK levels carry denser vocabulary, longer essays/dialogues, and heavier exercises,
 * requiring progressively more sessions to finish 1 lesson cleanly.
 */
export function estimateLessonEffortMinutes(lesson: ScheduleLessonInput): number {
  const vocab = Math.max(0, Number(lesson.vocabCount) || 0);
  const grammar = Math.max(0, Number(lesson.grammarCount) || 0);
  const scenes = Math.max(1, Number(lesson.sceneCount ?? 3) || 3);
  const textChars = Math.max(0, Number(lesson.textCharCount) || 0);

  const lvl = String(lesson.level || '').toUpperCase();
  if (lvl.includes('HSK 6')) {
    return Math.round(52 + vocab * 4.3 + grammar * 10.0 + scenes * 8.5 + textChars * 0.038);
  }
  if (lvl.includes('HSK 5')) {
    return Math.round(44 + vocab * 3.8 + grammar * 8.5 + scenes * 7.0 + textChars * 0.035);
  }
  if (lvl.includes('HSK 4')) {
    return Math.round(36 + vocab * 3.3 + grammar * 7.5 + scenes * 5.5 + textChars * 0.03);
  }
  if (lvl.includes('HSK 3')) {
    return Math.round(24 + vocab * 2.6 + grammar * 5.5 + scenes * 4.5 + textChars * 0.03);
  }
  if (lvl.includes('HSK 2')) {
    return Math.round(18 + vocab * 2.0 + grammar * 4.5 + scenes * 4.0 + textChars * 0.025);
  }
  return Math.round(14 + vocab * 1.7 + grammar * 3.5 + scenes * 3.0 + textChars * 0.02);
}

export interface PlannedSessionSlotTemplate {
  lessons: ScheduleLessonInput[];
  primaryLesson: ScheduleLessonInput;
  partIndex: number; // 1-based
  totalPartsForLesson: number;
  estimatedMinutes: number;
  suggestedTab: ScheduleTargetTab;
  suggestedTabLabel: string;
  titleSuffix: string;
  suggestedContent: string;
}

function buildSplitLessonPartDetails(
  lesson: ScheduleLessonInput,
  partIndex: number,
  totalParts: number,
  perSessionMinutes: number
): {
  suggestedTab: ScheduleTargetTab;
  suggestedTabLabel: string;
  titleSuffix: string;
  suggestedContent: string;
} {
  const vocab = Math.max(0, lesson.vocabCount || 0);
  const grammar = Math.max(0, lesson.grammarCount || 0);
  const approxText = `~${perSessionMinutes} phút`;

  if (totalParts === 2) {
    const splitPoint = Math.max(1, Math.ceil(vocab / 2));
    if (partIndex === 1) {
      return {
        suggestedTab: 'vocabulary',
        suggestedTabLabel: 'Từ vựng & Bài khóa',
        titleSuffix: `(Phần 1/2)`,
        suggestedContent: `${lesson.numberText} (${lesson.titleChinese}) - Phần 1/2: Học ${
          vocab > 1 ? `từ vựng 1–${splitPoint}/${vocab}` : 'từ vựng trọng tâm'
        }, nghe đọc & hiểu bài khóa (${approxText})`,
      };
    }
    return {
      suggestedTab: 'exercises',
      suggestedTabLabel: 'Ngữ pháp & Ôn luyện',
      titleSuffix: `(Phần 2/2)`,
      suggestedContent: `${lesson.numberText} (${lesson.titleChinese}) - Phần 2/2: Học nốt ${
        vocab > splitPoint ? `từ vựng ${splitPoint + 1}–${vocab}/${vocab}` : 'từ vựng mở rộng'
      }, nắm ${grammar > 0 ? `${grammar} điểm ngữ pháp` : 'ngữ pháp'}, luyện viết & làm bài tập (${approxText})`,
    };
  }

  // 3+ parts (upper levels HSK 4–6 or shorter 30-60 min session duration)
  const vocabBuckets = Math.max(1, totalParts - 1);
  if (partIndex === 1) {
    const endV = vocab > 0 ? Math.max(1, Math.ceil(vocab / vocabBuckets)) : 0;
    return {
      suggestedTab: 'vocabulary',
      suggestedTabLabel: 'Từ vựng & Bài khóa',
      titleSuffix: `(Phần 1/${totalParts})`,
      suggestedContent: `${lesson.numberText} (${lesson.titleChinese}) - Phần 1/${totalParts}: Học ${
        endV > 0 ? `từ vựng 1–${endV}/${vocab}` : 'từ mới phần đầu'
      } & luyện đọc bài khóa đoạn đầu (${approxText})`,
    };
  }

  if (partIndex < totalParts) {
    const chunk = vocab / vocabBuckets;
    const startV = Math.floor((partIndex - 1) * chunk) + 1;
    const endV = Math.min(vocab, Math.ceil(partIndex * chunk));
    const phaseIdx = (partIndex - 2) % 3;
    const vocabSlice = vocab >= startV ? `Từ vựng ${startV}–${endV}/${vocab}, ` : '';

    if (phaseIdx === 0) {
      return {
        suggestedTab: 'grammar',
        suggestedTabLabel: 'Ngữ pháp & Phân tích câu',
        titleSuffix: `(Phần ${partIndex}/${totalParts})`,
        suggestedContent: `${lesson.numberText} (${lesson.titleChinese}) - Phần ${partIndex}/${totalParts}: ${vocabSlice}phân tích ${
          grammar > 0 ? `${grammar} điểm ngữ pháp trọng tâm` : 'cấu trúc câu'
        } & đọc hiểu bài khóa (${approxText})`,
      };
    }
    if (phaseIdx === 1) {
      return {
        suggestedTab: 'writing',
        suggestedTabLabel: 'Luyện viết & Bài khóa',
        titleSuffix: `(Phần ${partIndex}/${totalParts})`,
        suggestedContent: `${lesson.numberText} (${lesson.titleChinese}) - Phần ${partIndex}/${totalParts}: ${vocabSlice}tập viết Hán tự khó & đọc trôi chảy đoạn tiếp theo (${approxText})`,
      };
    }
    return {
      suggestedTab: 'practice',
      suggestedTabLabel: 'Luyện nói & Vận dụng',
      titleSuffix: `(Phần ${partIndex}/${totalParts})`,
      suggestedContent: `${lesson.numberText} (${lesson.titleChinese}) - Phần ${partIndex}/${totalParts}: ${vocabSlice}đặt câu ứng dụng, luyện phát âm & phản xạ mẫu câu (${approxText})`,
    };
  }

  // Final part (totalParts)
  return {
    suggestedTab: 'live',
    suggestedTabLabel: 'Ôn luyện & Hội thoại AI Live',
    titleSuffix: `(Phần ${totalParts}/${totalParts})`,
    suggestedContent: `${lesson.numberText} (${lesson.titleChinese}) - Phần ${totalParts}/${totalParts}: Ôn tổng hợp từ vựng & ngữ pháp, làm bài tập + thực hành Hội thoại AI Live (${approxText})`,
  };
}

/**
 * Balanced lesson allocation based on target session duration (30~120 min/session).
 * - Long lessons (effort > target * 1.2) split proportionally across 2..16 sessions.
 * - Short consecutive lessons (effort <= target * 0.72) combine up to 3 lessons when combined <= target * 1.18.
 */
export function allocateCurriculumSessions(
  selectedLessons: ScheduleLessonInput[],
  durationMinutes = DEFAULT_DURATION_MINUTES
): { slots: PlannedSessionSlotTemplate[]; multiSessionLessonsCount: number; maxPartsPerLesson: number } {
  const target = normalizeDurationMinutes(durationMinutes);
  const slots: PlannedSessionSlotTemplate[] = [];
  let multiSessionLessonsCount = 0;
  let maxPartsPerLesson = 1;

  let i = 0;
  while (i < selectedLessons.length) {
    const current = selectedLessons[i];
    const effort = estimateLessonEffortMinutes(current);

    if (effort > target * 1.2) {
      // Split long lesson into balanced sessions scaled by chosen session duration
      const rawParts = Math.ceil((effort - target * 0.12) / target);
      const parts = Math.max(2, Math.min(16, rawParts));
      multiSessionLessonsCount++;
      if (parts > maxPartsPerLesson) maxPartsPerLesson = parts;
      const perSessionMins = Math.max(25, Math.min(target, Math.round(effort / parts)));

      for (let p = 1; p <= parts; p++) {
        const detail = buildSplitLessonPartDetails(current, p, parts, perSessionMins);
        slots.push({
          lessons: [current],
          primaryLesson: current,
          partIndex: p,
          totalPartsForLesson: parts,
          estimatedMinutes: perSessionMins,
          suggestedTab: detail.suggestedTab,
          suggestedTabLabel: detail.suggestedTabLabel,
          titleSuffix: detail.titleSuffix,
          suggestedContent: detail.suggestedContent,
        });
      }
      i++;
      continue;
    }

    // Check if current is short enough to pair with subsequent short lesson(s)
    const bucket: ScheduleLessonInput[] = [current];
    let accEffort = effort;

    while (
      accEffort <= target * 0.72 &&
      bucket.length < 3 &&
      i + bucket.length < selectedLessons.length
    ) {
      const nextLesson = selectedLessons[i + bucket.length];
      const nextEffort = estimateLessonEffortMinutes(nextLesson);
      if (nextEffort <= target * 0.85 && accEffort + nextEffort <= target * 1.18) {
        bucket.push(nextLesson);
        accEffort += nextEffort;
      } else {
        break;
      }
    }

    if (bucket.length === 1) {
      const clampedMins = Math.max(25, Math.min(target, effort));
      slots.push({
        lessons: [current],
        primaryLesson: current,
        partIndex: 1,
        totalPartsForLesson: 1,
        estimatedMinutes: clampedMins,
        suggestedTab: 'vocabulary',
        suggestedTabLabel: 'Trọn bài HSK',
        titleSuffix: '',
        suggestedContent: `${current.numberText} (${current.titleChinese}) - Học ${
          current.vocabCount
        } từ vựng, đọc bài khóa, nắm ${
          current.grammarCount > 0 ? `${current.grammarCount} điểm ngữ pháp` : 'ngữ pháp'
        } & làm bài tập (~${clampedMins} phút)`,
      });
    } else {
      const clampedMins = Math.max(25, Math.min(target, Math.round(accEffort)));
      const first = bucket[0];
      const last = bucket[bucket.length - 1];
      const names = bucket.map((l) => `${l.numberText} (${l.titleChinese})`).join(', ');
      slots.push({
        lessons: bucket,
        primaryLesson: first,
        partIndex: 1,
        totalPartsForLesson: 1,
        estimatedMinutes: clampedMins,
        suggestedTab: 'dialogue',
        suggestedTabLabel: 'Học ghép bài ngắn',
        titleSuffix: `(${first.numberText} – ${last.numberText})`,
        suggestedContent: `Học kết hợp từ vựng, đọc bài khóa & ôn tập cho ${bucket.length} bài ngắn: ${names} (~${clampedMins} phút)`,
      });
    }

    i += bucket.length;
  }

  return { slots, multiSessionLessonsCount, maxPartsPerLesson };
}

/**
 * Generates exact calendar dates falling on `weekdays` starting from `startDateObj`
 * until `count` sessions are placed.
 */
export function generateMatchedDatesForCount(
  startDateObj: Date,
  weekdays: WeekdayNumber[],
  count: number
): Array<{ dateIso: string; weekday: WeekdayNumber; weekNumber: number }> {
  const normalizedDays = normalizeWeekdays(weekdays);
  if (normalizedDays.length === 0 || count <= 0) return [];

  const weekdaySet = new Set<WeekdayNumber>(normalizedDays);
  const result: Array<{ dateIso: string; weekday: WeekdayNumber; weekNumber: number }> = [];

  // Maximum horizon safety: count * 7 + 14 days covers even 1 session/week cleanly
  const maxOffset = Math.max(14, count * 7 + 14);
  for (let offset = 0; offset < maxOffset && result.length < count; offset++) {
    const cursor = new Date(
      startDateObj.getFullYear(),
      startDateObj.getMonth(),
      startDateObj.getDate() + offset,
      12,
      0,
      0,
      0
    );
    const wd = cursor.getDay() as WeekdayNumber;
    if (weekdaySet.has(wd)) {
      result.push({
        dateIso: formatLocalDateIso(cursor),
        weekday: wd,
        weekNumber: Math.floor(offset / 7) + 1,
      });
    }
  }
  return result;
}

export function computeCompletionForecast(params: {
  allLessons: ScheduleLessonInput[];
  config: Pick<
    StudyScheduleConfig,
    'weekdays' | 'level' | 'fromLessonId' | 'toLessonId' | 'startDate' | 'durationMinutes'
  >;
  existingSessions?: StudySessionItem[];
  matchesActiveRange?: boolean;
}): StudyCompletionForecast {
  const weekdays = normalizeWeekdays(params.config.weekdays);
  const sessionsPerWeek = weekdays.length;
  const durationMinutes = normalizeDurationMinutes(params.config.durationMinutes);
  const selectedLessons = selectLessonsInRange(
    params.allLessons,
    params.config.level,
    params.config.fromLessonId,
    params.config.toLessonId
  );

  const allocation = allocateCurriculumSessions(selectedLessons, durationMinutes);
  const activeSessions = params.matchesActiveRange ? params.existingSessions || [] : [];
  const hasGenerated = activeSessions.length > 0;

  const totalPlannedSessions = hasGenerated ? activeSessions.length : allocation.slots.length;
  const completedSessions = hasGenerated
    ? activeSessions.filter((s) => s.completed).length
    : 0;
  const remainingSessions = Math.max(0, totalPlannedSessions - completedSessions);

  const estimatedTotalMinutes = hasGenerated
    ? activeSessions.reduce((sum, s) => sum + (s.estimatedMinutes || durationMinutes), 0)
    : allocation.slots.reduce((sum, s) => sum + s.estimatedMinutes, 0);

  const estimatedRemainingMinutes = hasGenerated
    ? activeSessions
        .filter((s) => !s.completed)
        .reduce((sum, s) => sum + (s.estimatedMinutes || durationMinutes), 0)
    : estimatedTotalMinutes;

  const multiSessionLessonsCount = hasGenerated
    ? new Set(
        activeSessions.filter((s) => (s.totalPartsForLesson || 1) > 1).map((s) => s.primaryLessonId)
      ).size
    : allocation.multiSessionLessonsCount;

  const maxPartsPerLesson = hasGenerated
    ? activeSessions.reduce((max, s) => Math.max(max, s.totalPartsForLesson || 1), 1)
    : allocation.maxPartsPerLesson;

  const startDateObj = parseLocalDateIso(params.config.startDate) ?? new Date();
  const startDateIso = formatLocalDateIso(startDateObj);

  if (sessionsPerWeek === 0 || totalPlannedSessions === 0) {
    return {
      totalPlannedSessions,
      completedSessions,
      remainingSessions,
      sessionsPerWeek,
      selectedWeekdays: weekdays,
      durationMinutes,
      estimatedTotalMinutes,
      estimatedRemainingMinutes,
      estimatedWeeks: 0,
      estimatedDays: 0,
      startDateIso,
      projectedEndDateIso: null,
      projectedEndDisplay: sessionsPerWeek === 0 ? 'Chưa chọn thứ học' : 'Chưa có bài học',
      totalLessonsCount: selectedLessons.length,
      multiSessionLessonsCount,
      maxPartsPerLesson,
    };
  }

  if (remainingSessions === 0) {
    return {
      totalPlannedSessions,
      completedSessions,
      remainingSessions: 0,
      sessionsPerWeek,
      selectedWeekdays: weekdays,
      durationMinutes,
      estimatedTotalMinutes,
      estimatedRemainingMinutes: 0,
      estimatedWeeks: 0,
      estimatedDays: 0,
      startDateIso,
      projectedEndDateIso: null,
      projectedEndDisplay: 'Đã hoàn thành toàn bộ!',
      totalLessonsCount: selectedLessons.length,
      multiSessionLessonsCount,
      maxPartsPerLesson,
    };
  }

  // Weeks needed for remainingSessions at sessionsPerWeek pace (e.g. 6 / 3 = 2.0 weeks)
  const rawWeeks = remainingSessions / sessionsPerWeek;
  const estimatedWeeks = Math.round(rawWeeks * 10) / 10;

  // Check if active uncompleted sessions already sit consecutively on the exact selected weekdays
  const weekdaySet = new Set<WeekdayNumber>(weekdays);
  const uncompletedActive = activeSessions.filter((s) => !s.completed);
  const firstUncompletedDate = parseLocalDateIso(uncompletedActive[0]?.dateIso || '');
  const expectedDatesFromFirst = firstUncompletedDate
    ? generateMatchedDatesForCount(firstUncompletedDate, weekdays, uncompletedActive.length)
    : [];
  const canReuseExistingDates =
    hasGenerated &&
    uncompletedActive.length === remainingSessions &&
    expectedDatesFromFirst.length === uncompletedActive.length &&
    uncompletedActive.every(
      (s, idx) => weekdaySet.has(s.weekday) && s.dateIso === expectedDatesFromFirst[idx]?.dateIso
    ) &&
    activeSessions[0]?.dateIso >= startDateIso;

  let projectedEndDateIso: string | null = null;
  let estimatedDays = Math.max(1, Math.round(rawWeeks * 7));

  if (canReuseExistingDates) {
    const firstIso = uncompletedActive[0].dateIso;
    const lastIso = uncompletedActive[uncompletedActive.length - 1].dateIso;
    projectedEndDateIso = lastIso;
    const firstDate = parseLocalDateIso(firstIso);
    const lastDate = parseLocalDateIso(lastIso);
    if (firstDate && lastDate) {
      const span = Math.round((lastDate.getTime() - firstDate.getTime()) / 86400000) + 1;
      // When no sessions done yet, count from configured startDate if earlier
      if (completedSessions === 0 && startDateObj < firstDate) {
        const fromStartSpan = Math.round((lastDate.getTime() - startDateObj.getTime()) / 86400000) + 1;
        estimatedDays = Math.max(1, fromStartSpan);
      } else {
        estimatedDays = Math.max(1, span);
      }
    }
  } else {
    // Re-project remainingSessions onto the currently selected weekdays starting from anchor
    let anchorDate = startDateObj;
    if (hasGenerated && completedSessions > 0) {
      const completedDates = activeSessions
        .filter((s) => s.completed)
        .map((s) => parseLocalDateIso(s.dateIso))
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime());
      if (completedDates.length > 0) {
        const lastDone = completedDates[completedDates.length - 1];
        const nextDay = new Date(
          lastDone.getFullYear(),
          lastDone.getMonth(),
          lastDone.getDate() + 1,
          12,
          0,
          0,
          0
        );
        if (nextDay > anchorDate) anchorDate = nextDay;
      }
    }

    const projectedDates = generateMatchedDatesForCount(anchorDate, weekdays, remainingSessions);
    if (projectedDates.length > 0) {
      projectedEndDateIso = projectedDates[projectedDates.length - 1].dateIso;
      const lastDate = parseLocalDateIso(projectedEndDateIso);
      if (lastDate) {
        estimatedDays = Math.max(
          1,
          Math.round((lastDate.getTime() - anchorDate.getTime()) / 86400000) + 1
        );
      }
    }
  }

  let projectedEndDisplay = '—';
  if (projectedEndDateIso) {
    const endDateObj = parseLocalDateIso(projectedEndDateIso);
    const wdLabel = endDateObj ? getWeekdayLabel(endDateObj.getDay() as WeekdayNumber) : '';
    projectedEndDisplay = wdLabel
      ? `${formatDisplayDate(projectedEndDateIso)} (${wdLabel})`
      : formatDisplayDate(projectedEndDateIso);
  }

  return {
    totalPlannedSessions,
    completedSessions,
    remainingSessions,
    sessionsPerWeek,
    selectedWeekdays: weekdays,
    durationMinutes,
    estimatedTotalMinutes,
    estimatedRemainingMinutes,
    estimatedWeeks,
    estimatedDays,
    startDateIso,
    projectedEndDateIso,
    projectedEndDisplay,
    totalLessonsCount: selectedLessons.length,
    multiSessionLessonsCount,
    maxPartsPerLesson,
  };
}

export function generateStudySchedule(params: {
  allLessons: ScheduleLessonInput[];
  config: Partial<StudyScheduleConfig> &
    Pick<StudyScheduleConfig, 'weekdays' | 'level' | 'fromLessonId' | 'toLessonId' | 'startDate'>;
  previousSessions?: StudySessionItem[];
}):
  | {
      ok: true;
      sessions: StudySessionItem[];
      normalizedConfig: StudyScheduleConfig;
      forecast: StudyCompletionForecast;
    }
  | { ok: false; error: string } {
  const weekdays = normalizeWeekdays(params.config.weekdays);
  if (weekdays.length === 0) {
    return {
      ok: false,
      error: 'Vui lòng tick chọn ít nhất 1 thứ trong tuần để tạo lịch học.',
    };
  }

  const startDateObj = parseLocalDateIso(params.config.startDate);
  if (!startDateObj) {
    return {
      ok: false,
      error: 'Ngày bắt đầu không hợp lệ. Vui lòng chọn lại ngày bắt đầu.',
    };
  }

  const selectedLessons = selectLessonsInRange(
    params.allLessons,
    params.config.level,
    params.config.fromLessonId,
    params.config.toLessonId
  );
  if (selectedLessons.length === 0) {
    return {
      ok: false,
      error: 'Không tìm thấy bài học nào trong khoảng bài đã chọn.',
    };
  }

  const studyTime = normalizeStudyTime(params.config.studyTime);
  const durationMinutes = normalizeDurationMinutes(params.config.durationMinutes);

  // 1. Allocate selected lessons cleanly into balanced sessions (long lessons split into 2-3+ parts)
  const { slots } = allocateCurriculumSessions(selectedLessons, durationMinutes);

  // 2. Match exact dates falling on selected weekdays starting from startDate
  const matchedDates = generateMatchedDatesForCount(startDateObj, weekdays, slots.length);
  if (matchedDates.length === 0) {
    return {
      ok: false,
      error: 'Không thể sắp xếp ngày học phù hợp. Vui lòng kiểm tra lại thứ học và ngày bắt đầu.',
    };
  }

  // 3. Preserve existing notes and completion checkmarks cleanly
  const prevByPartKey = new Map<string, StudySessionItem>();
  const prevByExactKey = new Map<string, StudySessionItem>();
  for (const prev of params.previousSessions || []) {
    const part = prev.partIndex || 1;
    const total = prev.totalPartsForLesson || 1;
    prevByPartKey.set(`${prev.primaryLessonId}|${part}|${total}`, prev);
    prevByExactKey.set(`${prev.dateIso}|${prev.primaryLessonId}|${prev.suggestedTab}`, prev);
  }

  const sessions: StudySessionItem[] = slots.map((slot, idx) => {
    const dateSlot = matchedDates[idx];
    const primary = slot.primaryLesson;
    const title = slot.titleSuffix
      ? `Buổi ${idx + 1}: ${primary.level} • ${primary.numberText} ${slot.titleSuffix} — ${primary.titleChinese}`
      : `Buổi ${idx + 1}: ${primary.level} • ${primary.numberText} — ${primary.titleChinese}`;

    const prev =
      prevByPartKey.get(`${primary.id}|${slot.partIndex}|${slot.totalPartsForLesson}`) ||
      prevByExactKey.get(`${dateSlot.dateIso}|${primary.id}|${slot.suggestedTab}`);

    return {
      id: `sess-${dateSlot.dateIso}-${idx + 1}-${primary.id}-p${slot.partIndex}`,
      sessionNumber: idx + 1,
      weekNumber: dateSlot.weekNumber,
      dateIso: dateSlot.dateIso,
      weekday: dateSlot.weekday,
      weekdayLabel: getWeekdayLabel(dateSlot.weekday),
      displayDate: formatDisplayDate(dateSlot.dateIso),
      title,
      suggestedContent: slot.suggestedContent,
      suggestedTab: slot.suggestedTab,
      suggestedTabLabel: slot.suggestedTabLabel,
      primaryLessonId: primary.id,
      lessonIds: slot.lessons.map((l) => l.id),
      lessonLabels: slot.lessons.map((l) => `${l.level} • ${l.numberText}: ${l.titleChinese}`),
      estimatedMinutes: slot.estimatedMinutes,
      partIndex: slot.partIndex,
      totalPartsForLesson: slot.totalPartsForLesson,
      note: prev?.note ?? '',
      completed: prev?.completed ?? false,
      updatedAt: prev?.updatedAt,
    };
  });

  const lastWeekNumber = matchedDates[matchedDates.length - 1]?.weekNumber ?? 1;
  const normalizedConfig: StudyScheduleConfig = {
    weekdays,
    level: params.config.level || 'ALL',
    fromLessonId: selectedLessons[0].id,
    toLessonId: selectedLessons[selectedLessons.length - 1].id,
    startDate: formatLocalDateIso(startDateObj),
    weeks: Math.max(1, lastWeekNumber),
    studyTime,
    durationMinutes,
  };

  const forecast = computeCompletionForecast({
    allLessons: params.allLessons,
    config: normalizedConfig,
    existingSessions: sessions,
    matchesActiveRange: true,
  });

  return {
    ok: true,
    sessions,
    normalizedConfig,
    forecast,
  };
}

export function updateSessionNote(
  sessions: StudySessionItem[],
  sessionId: string,
  note: string,
  nowIso = new Date().toISOString()
): StudySessionItem[] {
  return sessions.map((s) => (s.id === sessionId ? { ...s, note, updatedAt: nowIso } : s));
}

export function toggleSessionCompleted(
  sessions: StudySessionItem[],
  sessionId: string,
  completed?: boolean,
  nowIso = new Date().toISOString()
): StudySessionItem[] {
  return sessions.map((s) =>
    s.id === sessionId
      ? {
          ...s,
          completed: typeof completed === 'boolean' ? completed : !s.completed,
          updatedAt: nowIso,
        }
      : s
  );
}

export function computeScheduleStats(sessions: StudySessionItem[]): StudyScheduleStats {
  const total = sessions.length;
  const completed = sessions.filter((s) => s.completed).length;
  const remaining = Math.max(0, total - completed);
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, remaining, percent };
}

export function parseStoredSchedule(rawJson: string | null): StoredStudyScheduleState | null {
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson) as Partial<StoredStudyScheduleState>;
    if (!parsed || parsed.version !== 1 || !parsed.config || !Array.isArray(parsed.sessions)) {
      return null;
    }
    const normalizedSessions: StudySessionItem[] = parsed.sessions.map((s) => ({
      ...s,
      estimatedMinutes: s.estimatedMinutes || DEFAULT_DURATION_MINUTES,
      partIndex: s.partIndex || 1,
      totalPartsForLesson: s.totalPartsForLesson || 1,
    }));
    return {
      version: 1,
      config: {
        weekdays: normalizeWeekdays(parsed.config.weekdays || DEFAULT_WEEKDAYS),
        level: String(parsed.config.level || 'HSK 1'),
        fromLessonId: Number(parsed.config.fromLessonId) || 0,
        toLessonId: Number(parsed.config.toLessonId) || 0,
        startDate: String(parsed.config.startDate || getTodayLocalIso()),
        weeks: Math.max(1, Math.min(200, Number(parsed.config.weeks) || 4)),
        studyTime: normalizeStudyTime(parsed.config.studyTime),
        durationMinutes: normalizeDurationMinutes(parsed.config.durationMinutes),
      },
      sessions: normalizedSessions,
      lastGeneratedAt: String(parsed.lastGeneratedAt || ''),
    };
  } catch {
    return null;
  }
}
