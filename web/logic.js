// Pure helpers shared by the UI (and tested with node). Dates are "YYYY-MM-DD" strings in Tunisia time.
export const MONTHS = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'اكتوبر', 'نوفمبر', 'ديسمبر'];
export const WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const ORDINALS = ['الاول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];

const toUTC = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const addDays = (s, n) => new Date(toUTC(s) + n * 864e5).toISOString().slice(0, 10);
export const diffDays = (a, b) => Math.round((toUTC(a) - toUTC(b)) / 864e5);
export function dateParts(s) {
  const [y, m, d] = s.split('-').map(Number);
  return { d, m, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** checkins: [{m, d, s}] -> { "2026-10-06": { memberId: 1|2 } } */
export function indexMarks(checkins) {
  const idx = {};
  for (const c of checkins) (idx[c.d] ??= {})[c.m] = c.s;
  return idx;
}
export const markOf = (idx, day, id) => idx[day]?.[id] || 0;

/**
 * Current streak of a member as of `date`.
 * Finished days (1) add one, rest days (2) keep it alive without adding.
 * If `date` is today and not marked yet, the streak counts up to yesterday (it is still alive).
 */
export function streakAt(idx, startDate, today, id, date) {
  let d = date;
  if (!markOf(idx, d, id)) {
    if (date !== today) return 0;
    d = addDays(date, -1);
  }
  let n = 0;
  while (d >= startDate) {
    const s = markOf(idx, d, id);
    if (s === 1) n++;
    else if (s !== 2) break;
    d = addDays(d, -1);
  }
  return n;
}

/** What the group reads on this date: ordinal label and verse range (null when not set). */
export function dayInfo(config, date) {
  const k = diffDays(date, config.start_date);
  if (k < 0) return { before: true };
  const ranges = config.ranges || [];
  const n = ranges.length || 1;
  const idx = k % n;
  const r = ranges[idx];
  return {
    idx,
    label: 'اليوم ' + (ORDINALS[idx] || idx + 1),
    range: r && r.f && r.t ? r : null,
  };
}

/** Text for the Instagram group, same format the admin used to write by hand. */
export function buildText({ config, members, idx, today, date, withStreak = true }) {
  const info = dayInfo(config, date);
  const p = dateParts(date);
  const surah = config.surah || 'البقرة';
  const lines = [`${p.d} ${MONTHS[p.m - 1]} ان شاء الله 🌸`];
  if (!info.before) {
    lines.push(`${info.label} من سورة ${surah}💖`);
    if (info.range) lines.push(`من الٱية ${info.range.f} الى  الٱية ${info.range.t} من  سورة ${surah}💗`);
  }
  for (const m of members) {
    const s = markOf(idx, date, m.id);
    const sym = s === 1 ? '✅' : s === 2 ? '❄️' : '☑️';
    const n = withStreak ? streakAt(idx, config.start_date, today, m.id, date) : 0;
    lines.push(`@${m.handle} ${sym}${n >= 2 ? ' 🔥' + n : ''}`);
  }
  return lines.join('\n');
}
