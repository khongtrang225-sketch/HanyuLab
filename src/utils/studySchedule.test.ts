import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WEEKDAYS,
  allocateCurriculumSessions,
  computeCompletionForecast,
  computeScheduleStats,
  estimateLessonEffortMinutes,
  formatDisplayDate,
  generateStudySchedule,
  parseStoredSchedule,
  toggleSessionCompleted,
  updateSessionNote,
  type ScheduleLessonInput,
} from './studySchedule';

const mockHsk1Lessons: ScheduleLessonInput[] = [
  {
    id: 1001,
    level: 'HSK 1',
    numberText: 'BÀI 1',
    titleChinese: '你好',
    titleVietnamese: 'Xin chào',
    vocabCount: 6,
    grammarCount: 2,
    sceneCount: 2,
  },
  {
    id: 1002,
    level: 'HSK 1',
    numberText: 'BÀI 2',
    titleChinese: '谢谢你',
    titleVietnamese: 'Cảm ơn bạn',
    vocabCount: 8,
    grammarCount: 2,
    sceneCount: 2,
  },
  {
    id: 1003,
    level: 'HSK 1',
    numberText: 'BÀI 3',
    titleChinese: '你叫什么名字',
    titleVietnamese: 'Bạn tên là gì?',
    vocabCount: 12,
    grammarCount: 3,
    sceneCount: 3,
  },
];

const mockLongHskLessons: ScheduleLessonInput[] = [
  {
    id: 4001,
    level: 'HSK 4',
    numberText: 'BÀI 1',
    titleChinese: '简单的爱情',
    titleVietnamese: 'Tình yêu giản đơn',
    vocabCount: 32,
    grammarCount: 5,
    sceneCount: 5,
    textCharCount: 1100,
  },
  {
    id: 6001,
    level: 'HSK 6',
    numberText: 'BÀI 1',
    titleChinese: '孩子给我们的启示',
    titleVietnamese: 'Điều trẻ nhỏ dạy chúng ta',
    vocabCount: 52,
    grammarCount: 4,
    sceneCount: 2,
    textCharCount: 2400,
  },
];

test('estimateLessonEffortMinutes & allocateCurriculumSessions scale upper HSK lessons across 30-120m durations', () => {
  const hsk4Effort = estimateLessonEffortMinutes(mockLongHskLessons[0]);
  const hsk6Effort = estimateLessonEffortMinutes(mockLongHskLessons[1]);
  assert.ok(hsk4Effort >= 200 && hsk4Effort <= 260, `HSK 4 effort ${hsk4Effort}`);
  assert.ok(hsk6Effort >= 350, `HSK 6 effort ${hsk6Effort}`);

  // HSK 4 takes 2 sessions at 120m, 3 sessions at 90m, 4 sessions at 60m, 7+ sessions at 30m
  const hsk4At120 = allocateCurriculumSessions([mockLongHskLessons[0]], 120);
  const hsk4At90 = allocateCurriculumSessions([mockLongHskLessons[0]], 90);
  const hsk4At30 = allocateCurriculumSessions([mockLongHskLessons[0]], 30);
  assert.equal(hsk4At120.slots.length, 2);
  assert.equal(hsk4At90.slots.length, 3);
  assert.ok(hsk4At30.slots.length >= 7, `Expected >=7 parts at 30m, got ${hsk4At30.slots.length}`);
  assert.equal(hsk4At90.multiSessionLessonsCount, 1);
  assert.match(hsk4At90.slots[0].suggestedContent, /Phần 1\/3/);
  assert.match(hsk4At90.slots[2].suggestedContent, /Phần 3\/3/);

  // HSK 6 needs 4-5 sessions at 90m and 3-4 sessions at 120m
  const hsk6At120 = allocateCurriculumSessions([mockLongHskLessons[1]], 120);
  const hsk6At90 = allocateCurriculumSessions([mockLongHskLessons[1]], 90);
  assert.ok(hsk6At120.slots.length >= 3 && hsk6At120.slots.length <= 4);
  assert.ok(hsk6At90.slots.length >= 4 && hsk6At90.slots.length <= 5);
  assert.equal(hsk6At90.maxPartsPerLesson, hsk6At90.slots.length);

  // Short HSK 1 pair combines cleanly at 90m/120m, splits at 30m/session
  const hsk1At90 = allocateCurriculumSessions(mockHsk1Lessons, 90);
  assert.equal(hsk1At90.slots.length, 2); // Bài 1+2 combined + Bài 3
  const hsk1At30 = allocateCurriculumSessions(mockHsk1Lessons, 30);
  assert.ok(hsk1At30.slots.length >= 5);
});

test('generateStudySchedule places all sessions on selected weekdays and computes full completion forecast', () => {
  const res = generateStudySchedule({
    allLessons: [
      mockLongHskLessons[0],
      { ...mockLongHskLessons[0], id: 4002, numberText: 'BÀI 2' },
      { ...mockLongHskLessons[0], id: 4003, numberText: 'BÀI 3' },
    ],
    config: {
      weekdays: DEFAULT_WEEKDAYS, // T3, T5, T7 (3 sessions/week)
      level: 'HSK 4',
      fromLessonId: 4001,
      toLessonId: 4003,
      startDate: '2026-11-18',
      durationMinutes: 120,
    },
  });

  assert.equal(res.ok, true);
  if (!res.ok) return;

  // 3 long HSK 4 lessons x 2 sessions/lesson at 120m = 6 sessions total
  assert.equal(res.sessions.length, 6);
  for (const s of res.sessions) {
    assert.ok([2, 4, 6].includes(s.weekday), `Unexpected weekday ${s.weekday}`);
  }
  assert.equal(res.sessions[0].dateIso, '2026-11-19');
  assert.equal(res.sessions[0].weekdayLabel, 'Thứ 5');
  assert.equal(formatDisplayDate(res.sessions[0].dateIso), '19/11/2026');
  assert.equal(res.sessions[5].dateIso, '2026-12-01');

  assert.equal(res.forecast.totalPlannedSessions, 6);
  assert.equal(res.forecast.sessionsPerWeek, 3);
  assert.equal(res.forecast.durationMinutes, 120);
  assert.equal(res.forecast.estimatedWeeks, 2);
  assert.equal(res.forecast.projectedEndDateIso, '2026-12-01');
  assert.equal(res.forecast.estimatedDays, 14);
  assert.equal(res.forecast.multiSessionLessonsCount, 3);
});

test('computeCompletionForecast recalculates dynamically when ticking completed or changing weekdays', () => {
  const lessons = [
    mockLongHskLessons[0],
    { ...mockLongHskLessons[0], id: 4002, numberText: 'BÀI 2' },
    { ...mockLongHskLessons[0], id: 4003, numberText: 'BÀI 3' },
  ];
  const res = generateStudySchedule({
    allLessons: lessons,
    config: {
      weekdays: [2, 4, 6], // 3/week
      level: 'HSK 4',
      fromLessonId: 4001,
      toLessonId: 4003,
      startDate: '2026-11-18',
      durationMinutes: 120,
    },
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;

  // Tick first 3 sessions complete -> 3 remaining at 3/week = 1.0 week
  let updated = toggleSessionCompleted(res.sessions, res.sessions[0].id, true);
  updated = toggleSessionCompleted(updated, res.sessions[1].id, true);
  updated = toggleSessionCompleted(updated, res.sessions[2].id, true);

  const afterTickForecast = computeCompletionForecast({
    allLessons: lessons,
    config: res.normalizedConfig,
    existingSessions: updated,
    matchesActiveRange: true,
  });
  assert.equal(afterTickForecast.completedSessions, 3);
  assert.equal(afterTickForecast.remainingSessions, 3);
  assert.equal(afterTickForecast.estimatedWeeks, 1);

  // Increase frequency from 3 days/week -> 6 days/week -> remaining 3 sessions drop to 0.5 weeks
  const afterWeekdayChange = computeCompletionForecast({
    allLessons: lessons,
    config: {
      ...res.normalizedConfig,
      weekdays: [1, 2, 3, 4, 5, 6],
    },
    existingSessions: updated,
    matchesActiveRange: true,
  });
  assert.equal(afterWeekdayChange.sessionsPerWeek, 6);
  assert.equal(afterWeekdayChange.remainingSessions, 3);
  assert.equal(afterWeekdayChange.estimatedWeeks, 0.5);
  assert.ok(afterWeekdayChange.estimatedDays < afterTickForecast.estimatedDays);
});

test('generateStudySchedule validates empty weekdays and invalid dates', () => {
  const noDays = generateStudySchedule({
    allLessons: mockHsk1Lessons,
    config: {
      weekdays: [],
      level: 'HSK 1',
      fromLessonId: 1001,
      toLessonId: 1003,
      startDate: '2026-11-18',
    },
  });
  assert.equal(noDays.ok, false);

  const badDate = generateStudySchedule({
    allLessons: mockHsk1Lessons,
    config: {
      weekdays: [1],
      level: 'HSK 1',
      fromLessonId: 1001,
      toLessonId: 1003,
      startDate: '2026-02-31',
    },
  });
  assert.equal(badDate.ok, false);
});

test('Session notes, completion toggles & localStorage persistence work accurately', () => {
  const res = generateStudySchedule({
    allLessons: mockLongHskLessons.slice(0, 1),
    config: {
      weekdays: [2, 4, 6],
      level: 'HSK 4',
      fromLessonId: 4001,
      toLessonId: 4001,
      startDate: '2026-11-18',
      durationMinutes: 90,
    },
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;

  const firstId = res.sessions[0].id;
  let updated = updateSessionNote(res.sessions, firstId, 'Học 16 từ đầu, chép 3 lần');
  updated = toggleSessionCompleted(updated, firstId, true);

  const stats = computeScheduleStats(updated);
  assert.equal(stats.total, 3);
  assert.equal(stats.completed, 1);
  assert.equal(stats.percent, 33);

  const parsed = parseStoredSchedule(
    JSON.stringify({
      version: 1,
      config: res.normalizedConfig,
      sessions: updated,
      lastGeneratedAt: '2026-11-18T07:05:00.000Z',
    })
  );
  assert.ok(parsed);
  assert.equal(parsed?.config.durationMinutes, 90);
  assert.equal(parsed?.sessions[0].note, 'Học 16 từ đầu, chép 3 lần');
  assert.equal(parsed?.sessions[0].completed, true);
});
