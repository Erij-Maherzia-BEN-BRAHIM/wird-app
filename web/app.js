import { API_URL, VAPID_PUBLIC_KEY } from './config.js';
import {
  MONTHS, WEEKDAYS, addDays, dateParts, indexMarks, markOf, streakAt, dayInfo, buildText,
} from './logic.js';

const $app = document.getElementById('app');

/* ---------- small helpers ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2s5.5 4.6 5.5 10.2A5.5 5.5 0 0 1 12 18a5.5 5.5 0 0 1-5.5-5.8c0-2.1 1-3.7 2.2-4.8.2 1.5 1 2.3 1.8 2.7C10.2 7.8 10.5 4.7 12 2z" fill="currentColor" transform="translate(0 2)"/></svg>';

function b64ToU8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const ERRORS = {
  bad_pin: (e) => `الـ PIN غالط. بقاتلك ${e.data?.left ?? 0} محاولات.`,
  locked: () => 'حاولتي برشا. استنّي 10 دقايق وعاودي.',
  already_claimed: () => 'الاسم هذا عندو PIN من قبل. إذا نسيتيه اطلبي من الأدمين يعاود يفتحه.',
  bad_pin_format: () => 'الـ PIN لازم يكون 4 أرقام.',
  forbidden: () => 'مفتاح الأدمين غالط.',
  exists: () => 'الاسم هذا موجود من قبل.',
  not_started: () => 'الورد مازال ما بدأش.',
};
const errMsg = (e) => (ERRORS[e.code] ? ERRORS[e.code](e) : 'صارت مشكلة، عاودي المحاولة.');

/* ---------- state ---------- */
const S = {
  view: 'loading', // loading | setup | login | home | admin | offline
  token: ls.get('wird.token'),
  loginMembers: [],
  pickId: '',
  err: '',
  busy: false,
  data: null, // result of the `state` action
  idx: {},
  withStreak: true,
  note: '',
  admin: { key: ls.get('wird.admin') || '', members: [], draft: null, day: '', msg: '', loaded: false },
};

async function api(action, body = {}, adminKey) {
  const headers = { 'content-type': 'application/json' };
  if (S.token) headers['x-token'] = S.token;
  if (adminKey) headers['x-admin-key'] = adminKey;
  let res;
  try {
    res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify({ action, ...body }) });
  } catch {
    throw Object.assign(new Error('network'), { code: 'network', status: 0 });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || 'error'), { code: json.error, status: res.status, data: json });
  return json;
}

async function loadState() {
  S.data = await api('state');
  S.idx = indexMarks(S.data.checkins);
}

function logout() {
  ls.del('wird.token');
  S.token = null; S.data = null; S.err = '';
  goLogin();
}

async function goLogin() {
  S.view = 'loading'; render();
  try {
    S.loginMembers = (await api('list_members')).members;
    S.pickId = S.loginMembers[0]?.id || '';
    S.view = 'login';
  } catch { S.view = 'offline'; }
  render();
}

/* ---------- views ---------- */
function viewLogin() {
  const m = S.loginMembers.find((x) => x.id === S.pickId);
  const first = m && !m.claimed;
  const opts = S.loginMembers.map((x) => `<option value="${esc(x.id)}"${x.id === S.pickId ? ' selected' : ''}>@${esc(x.handle)}</option>`).join('');
  return `<form class="login" id="loginForm" autocomplete="off">
    <h1>ورد البقرة</h1>
    <p>${first ? 'أول مرة؟ اختاري PIN من 4 أرقام، وتستعمليه كل مرة.' : 'اختاري اسمك وادخلي الـ PIN.'}</p>
    <div class="field"><label for="who">اسمك في إنستغرام</label>
      <select id="who" class="ltr" data-act-change="pick">${opts}</select></div>
    <div class="field"><label for="pin">${first ? 'الـ PIN الجديد' : 'الـ PIN'}</label>
      <input id="pin" class="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" required autocomplete="${first ? 'new-password' : 'current-password'}"></div>
    ${first ? `<div class="field"><label for="pin2">عاودي الـ PIN</label>
      <input id="pin2" class="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" required autocomplete="new-password"></div>` : ''}
    <div class="err" role="alert">${esc(S.err)}</div>
    <button class="primary" type="submit"${S.busy ? ' disabled' : ''}>${first ? 'إنشاء الـ PIN والدخول' : 'دخول'}</button>
  </form>`;
}

function rowHtml(m, today, cfg, me) {
  const st = markOf(S.idx, today, m.id);
  const n = streakAt(S.idx, cfg.start_date, today, m.id, today);
  let dots = '';
  for (let i = 6; i >= 0; i--) {
    const dd = addDays(today, -i); const s = markOf(S.idx, dd, m.id);
    dots += `<i class="${s === 1 ? 'on' : s === 2 ? 'rest' : ''}${dd < cfg.start_date ? ' void' : ''}"></i>`;
  }
  return `<div class="row${m.id === me ? ' me' : ''}">
    <span class="box s${st}">${st === 1 ? ICON_CHECK : st === 2 ? '❄︎' : ''}</span>
    <span class="who">@${esc(m.handle)}</span>
    <span class="dots" aria-hidden="true">${dots}</span>
    <span class="fl num${st ? ' hot' : ''}">${ICON_FLAME}${n}</span></div>`;
}

function notifCard() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let body;
  if (S.data.notifications && supported && Notification.permission === 'granted') {
    body = `<p>التنبيهات مفعّلة. باش توصلك رسالة كي وحدة من صحباتك تكمّل، وتذكير في الليل.</p>
      <button class="link" data-act="push-off" style="align-self:flex-start">إيقاف التنبيهات</button>`;
  } else if (ios && !standalone) {
    body = '<p>في iPhone: افتحي الرابط في Safari، اضغطي على Share ثم «إضافة إلى الشاشة الرئيسية»، وافتحي التطبيق من هناك باش تفعّلي التنبيهات.</p>';
  } else if (!supported) {
    body = '<p>المتصفح هذا ما يدعمش التنبيهات.</p>';
  } else {
    body = `<p>كي وحدة من صحباتك تكمّل ورد اليوم، توصلك رسالة تذكير.</p>
      <button class="primary" data-act="push-on">فعّلي التنبيهات</button>`;
  }
  return `<section class="card"><div class="card-h"><b>التنبيهات</b></div><div class="card-b">${body}</div></section>`;
}

function viewHome() {
  const d = S.data; const cfg = d.config; const today = d.today; const info = dayInfo(cfg, today);
  const members = d.members; const total = members.length;
  const meM = members.find((m) => m.id === d.me);
  const st = markOf(S.idx, today, d.me);
  const myN = streakAt(S.idx, cfg.start_date, today, d.me, today);
  const done = members.filter((m) => markOf(S.idx, today, m.id) === 1).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const p = dateParts(today);
  let h = `<div class="bar-top"><span class="ltr">@${esc(meM?.handle ?? '')}</span><button class="link" data-act="logout">خروج</button></div>`;

  h += `<section class="hero"><span class="date num">${WEEKDAYS[p.wd]} ${p.d} ${MONTHS[p.m - 1]}</span>`;
  if (info.before) h += `<h1>الورد يبدأ يوم ${esc(cfg.start_date)}</h1>`;
  else {
    h += `<h1>${esc(info.label)} من سورة ${esc(cfg.surah || 'البقرة')}</h1>`;
    h += info.range
      ? `<span class="range num">من الآية ${info.range.f} إلى الآية ${info.range.t}</span>`
      : '<span class="range warn">الآيات غير محدّدة بعد</span>';
  }
  h += '</section>';

  const sub = myN === 0 ? 'ابدئي streak جديد اليوم'
    : st ? `${myN} ${myN > 10 ? 'يوم' : 'أيام'} متتالية`
      : `${myN} ${myN > 10 ? 'يوم' : 'أيام'} متتالية. كمّلي اليوم باش ما يضيعش.`;
  h += `<section class="mine"><div class="mine-top">
      <div class="big-fl num${st ? ' hot' : ''}">${ICON_FLAME}<b>${myN}</b></div><small>${sub}</small></div>`;
  if (info.before) h += '<div class="note">ما تنجمش تعلّمي قبل ما يبدأ الورد.</div>';
  else if (st === 1) h += `<button class="primary cta done" disabled>تمّ، بارك الله فيك ${'✓'}</button>
      <div class="after"><button class="link" data-act="unfinish">تراجع</button></div>`;
  else if (st === 2) h += '<div class="note">اليوم محسوب يوم راحة، الـ streak محفوظ.</div>';
  else h += `<button class="primary cta" data-act="finish"${S.busy ? ' disabled' : ''}>كمّلت ورد اليوم ✅</button>`;
  h += '</section>';
  if (S.note) h += `<div class="note">${esc(S.note)}</div>`;

  h += `<section class="prog"><div class="prog-top"><span><b class="num">${done}</b> من <span class="num">${total}</span> كمّلن الورد</span><span class="num">${pct}%</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div></section>`;
  if (total && done === total) h += '<div class="all">كلّهن كمّلن ورد هذا اليوم ✨</div>';

  h += '<section class="card"><div class="card-h"><b>الصحبة</b><span>آخر 7 أيام · streak</span></div>';
  members.forEach((m) => { h += rowHtml(m, today, cfg, d.me); });
  h += '</section>';

  const ranked = members.map((m) => ({ h: m.handle, n: streakAt(S.idx, cfg.start_date, today, m.id, today) }))
    .filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 3);
  if (ranked.length) {
    h += '<section class="card"><div class="card-h"><b>أطول streak</b></div>';
    ranked.forEach((x, i) => { h += `<div class="t3"><span class="rk num">${i + 1}</span><span class="who">@${esc(x.h)}</span><span class="fl hot num">${ICON_FLAME}${x.n}</span></div>`; });
    h += '</section>';
  }

  h += notifCard();

  const text = buildText({ config: cfg, members, idx: S.idx, today, date: today, withStreak: S.withStreak });
  h += `<section class="card"><div class="card-h"><b>نص لمجموعة إنستغرام</b></div><pre class="out" id="out">${esc(text)}</pre>
    <div class="acts"><label class="chk"><input type="checkbox" id="ws"${S.withStreak ? ' checked' : ''}> أضف 🔥 للي عندهم يومين فما فوق</label>
    <button class="ghost" data-act="copy" id="copyBtn">نسخ</button></div></section>`;

  h += '<div class="foot"><button class="link" data-act="admin">الأدمين</button></div>';
  return h;
}

function viewAdmin() {
  const A = S.admin; const d = S.data;
  let h = '<div class="bar-top"><b>الأدمين</b><button class="link" data-act="home">رجوع</button></div>';
  if (!A.key) {
    return h + `<form class="login" id="adminKeyForm"><div class="field"><label for="akey">مفتاح الأدمين</label>
      <input id="akey" type="password" class="ltr" required></div><div class="err" role="alert">${esc(A.msg)}</div>
      <button class="primary" type="submit">دخول</button></form>`;
  }
  if (!A.loaded || !A.draft) return h + '<div class="state">جاري التحميل…</div>';
  const dr = A.draft;
  if (A.msg) h += `<div class="note">${esc(A.msg)}</div>`;

  h += `<section class="card"><div class="card-h"><b>إعدادات الورد</b></div><div class="card-b">
    <div class="field"><label for="sd">أول يوم في الورد</label><input type="date" id="sd" value="${esc(dr.start_date)}"></div>
    <div class="field"><label for="sn">السورة</label><input type="text" id="sn" value="${esc(dr.surah)}"></div>
    <p>الآيات حسب اليوم (تتكرّر بعد آخر يوم)</p>`;
  dr.ranges.forEach((r, i) => {
    h += `<div class="rr"><span>اليوم ${i + 1}</span>
      <input type="number" inputmode="numeric" min="1" data-r="${i}" data-k="f" value="${r.f ?? ''}" aria-label="من آية">
      <span>إلى</span>
      <input type="number" inputmode="numeric" min="1" data-r="${i}" data-k="t" value="${r.t ?? ''}" aria-label="إلى آية">
      <button class="ghost danger" data-act="del-range" data-i="${i}" aria-label="حذف">×</button></div>`;
  });
  h += `<div><button class="ghost" data-act="add-range">+ يوم زيادة</button></div>
    <button class="primary" data-act="save-config">حفظ الإعدادات</button></div></section>`;

  h += '<section class="card"><div class="card-h"><b>الأعضاء</b><span>PIN: «فتح» يخلّي العضوة تختار PIN جديد</span></div><div class="card-b">';
  A.members.forEach((m) => {
    h += `<div class="mr"><span class="who">@${esc(m.handle)}</span><span class="tag">${m.claimed ? 'عندها PIN' : 'ما دخلتش بعد'}</span>
      ${m.claimed ? `<button class="ghost" data-act="reset-pin" data-id="${esc(m.id)}">فتح</button>` : ''}
      <button class="ghost danger" data-act="rm-member" data-id="${esc(m.id)}" aria-label="حذف">×</button></div>`;
  });
  h += `<form class="mr" id="addMemberForm"><input type="text" id="newm" class="ltr" placeholder="@username" aria-label="عضوة جديدة" required>
    <button class="ghost" type="submit">زيدي</button></form></div></section>`;

  const day = A.day || d.today;
  h += `<section class="card"><div class="card-h"><b>تعليم يدوي</b><span>ضغطة: ✅ ثم ❄︎ ثم رجوع</span></div>
    <div class="card-b"><div class="field"><label for="mday">اليوم</label><input type="date" id="mday" value="${esc(day)}" min="${esc(d.config.start_date)}" max="${esc(d.today)}"></div></div>`;
  d.members.forEach((m) => {
    const st = markOf(S.idx, day, m.id);
    h += `<button class="row" data-act="admin-mark" data-id="${esc(m.id)}" data-day="${esc(day)}" data-st="${st}">
      <span class="box s${st}">${st === 1 ? ICON_CHECK : st === 2 ? '❄︎' : ''}</span><span class="who">@${esc(m.handle)}</span></button>`;
  });
  h += '</section>';
  return h;
}

function render() {
  if (S.view === 'loading') $app.innerHTML = '<div class="state">جاري التحميل…</div>';
  else if (S.view === 'setup') $app.innerHTML = '<div class="state">التطبيق مازال ما تربطش بالسيرفر. عمّري API_URL و VAPID_PUBLIC_KEY في web/config.js.</div>';
  else if (S.view === 'offline') $app.innerHTML = '<div class="state">ما نجمتش نوصل للسيرفر. تأكدي من الإنترنت وعاودي.<br><br><button class="ghost" data-act="retry">عاودي</button></div>';
  else if (S.view === 'login') $app.innerHTML = viewLogin();
  else if (S.view === 'home') $app.innerHTML = viewHome();
  else if (S.view === 'admin') $app.innerHTML = viewAdmin();
}

/* ---------- actions ---------- */
async function finish(status) {
  const d = S.data; const today = d.today;
  S.note = '';
  const before = d.checkins.slice();
  d.checkins = d.checkins.filter((c) => !(c.m === d.me && c.d === today));
  if (status === 1) d.checkins.push({ m: d.me, d: today, s: 1 });
  S.idx = indexMarks(d.checkins); render();
  try {
    await api('mark', { status });
    await loadState();
  } catch (e) {
    d.checkins = before; S.idx = indexMarks(before);
    S.note = e.code === 'network' ? 'ما فماش إنترنت، ما تسجّلتش.' : errMsg(e);
    if (e.status === 401) return logout();
  }
  render();
}

async function enablePush() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { S.note = 'ما عطيتيش الإذن للتنبيهات. تنجمي تفعّليها من إعدادات المتصفح.'; render(); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription())
      || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUBLIC_KEY) });
    await api('push_subscribe', { subscription: sub.toJSON() });
    S.data.notifications = true; S.note = '';
  } catch { S.note = 'ما نجمناش نفعّلو التنبيهات. عاودي المحاولة.'; }
  render();
}

async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await api('push_unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
    S.data.notifications = false;
  } catch { S.note = 'ما نجمناش نوقفو التنبيهات.'; }
  render();
}

function copyOut() {
  const d = S.data;
  const text = buildText({ config: d.config, members: d.members, idx: S.idx, today: d.today, date: d.today, withStreak: S.withStreak });
  const btn = document.getElementById('copyBtn');
  const flash = (m) => { if (btn) { btn.textContent = m; setTimeout(() => { const b = document.getElementById('copyBtn'); if (b) b.textContent = 'نسخ'; }, 1800); } };
  const fallback = () => {
    const el = document.getElementById('out');
    if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    flash('حدّدت النص، انسخيه');
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => flash('تمّ النسخ ✓'), fallback); else fallback();
}

async function openAdmin() {
  S.view = 'admin'; S.admin.msg = ''; render();
  if (S.admin.key) await loadAdmin();
}

async function loadAdmin() {
  const A = S.admin;
  try {
    A.members = (await api('admin_members', {}, A.key)).members;
    const c = S.data.config;
    A.draft = { start_date: c.start_date, surah: c.surah, ranges: JSON.parse(JSON.stringify(c.ranges || [])) };
    A.loaded = true; A.msg = '';
  } catch (e) {
    if (e.code === 'forbidden') { A.key = ''; ls.del('wird.admin'); }
    A.msg = errMsg(e);
  }
  render();
}

async function adminCall(action, body, okMsg) {
  const A = S.admin;
  try {
    await api(action, body, A.key);
    await loadState();
    A.members = (await api('admin_members', {}, A.key)).members;
    A.msg = okMsg || '';
  } catch (e) { A.msg = errMsg(e); }
  render();
}

/* ---------- events ---------- */
$app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act; const A = S.admin;
  if (a === 'finish') { S.busy = true; await finish(1); S.busy = false; render(); }
  else if (a === 'unfinish') await finish(0);
  else if (a === 'logout') logout();
  else if (a === 'push-on') enablePush();
  else if (a === 'push-off') disablePush();
  else if (a === 'copy') copyOut();
  else if (a === 'admin') openAdmin();
  else if (a === 'home') { S.view = 'home'; render(); }
  else if (a === 'retry') boot();
  else if (a === 'add-range') { A.draft.ranges.push({ f: null, t: null }); render(); }
  else if (a === 'del-range') { A.draft.ranges.splice(+el.dataset.i, 1); render(); }
  else if (a === 'save-config') {
    const dr = A.draft;
    await adminCall('admin_save_config', { start_date: dr.start_date, surah: dr.surah, ranges: dr.ranges }, 'تمّ الحفظ ✓');
    A.draft = null; await loadAdmin(); A.msg = 'تمّ الحفظ ✓'; render();
  }
  else if (a === 'reset-pin') { if (confirm('تفتحي الـ PIN لهالعضوة؟ تختار PIN جديد في دخولها الجاي.')) await adminCall('admin_reset_pin', { id: el.dataset.id }, 'تمّ فتح الـ PIN ✓'); }
  else if (a === 'rm-member') { if (confirm('تحذفي العضوة وكل علاماتها؟')) await adminCall('admin_remove_member', { id: el.dataset.id }, 'تمّ الحذف'); }
  else if (a === 'admin-mark') {
    const next = (Number(el.dataset.st) + 1) % 3;
    await adminCall('admin_mark', { id: el.dataset.id, day: el.dataset.day, status: next }, '');
  }
});

$app.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'who') { S.pickId = t.value; S.err = ''; render(); }
  else if (t.id === 'ws') { S.withStreak = t.checked; render(); }
  else if (t.id === 'mday') { S.admin.day = t.value; render(); }
});

$app.addEventListener('input', (e) => {
  const t = e.target; const dr = S.admin.draft; if (!dr) return;
  if (t.id === 'sd') dr.start_date = t.value;
  else if (t.id === 'sn') dr.surah = t.value;
  else if (t.dataset.r !== undefined) { const v = parseInt(t.value, 10); dr.ranges[+t.dataset.r][t.dataset.k] = Number.isNaN(v) ? null : v; }
});

$app.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'loginForm') {
    const m = S.loginMembers.find((x) => x.id === S.pickId); const pin = f.pin.value;
    if (!/^\d{4}$/.test(pin)) { S.err = ERRORS.bad_pin_format(); render(); return; }
    if (m && !m.claimed && f.pin2 && f.pin2.value !== pin) { S.err = 'الـ PIN ما يتطابقش.'; render(); return; }
    S.busy = true; S.err = ''; render();
    try {
      const res = await api(m && !m.claimed ? 'claim' : 'login', { member_id: S.pickId, pin });
      S.token = res.token; ls.set('wird.token', res.token);
      await loadState(); S.view = 'home';
    } catch (er) {
      S.err = er.code === 'network' ? 'ما فماش إنترنت.' : errMsg(er);
      if (er.code === 'already_claimed') { S.loginMembers = (await api('list_members').catch(() => ({ members: S.loginMembers }))).members; }
    }
    S.busy = false; render();
  } else if (f.id === 'adminKeyForm') {
    S.admin.key = f.akey.value.trim(); ls.set('wird.admin', S.admin.key); S.admin.msg = '';
    await loadAdmin();
  } else if (f.id === 'addMemberForm') {
    const handle = f.newm.value.trim();
    if (handle) await adminCall('admin_add_member', { handle }, 'تمّت الإضافة ✓');
  }
});

/* ---------- boot ---------- */
async function refreshIfVisible() {
  if (document.hidden || S.view !== 'home' || S.busy) return;
  try { await loadState(); render(); } catch (e) { if (e.status === 401) logout(); }
}
document.addEventListener('visibilitychange', refreshIfVisible);
setInterval(refreshIfVisible, 45_000);

async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (API_URL.includes('YOUR-PROJECT')) { S.view = 'setup'; render(); return; }
  S.view = 'loading'; render();
  if (S.token) {
    try { await loadState(); S.view = 'home'; render(); return; } catch (e) {
      if (e.status === 401) { ls.del('wird.token'); S.token = null; } else { S.view = 'offline'; render(); return; }
    }
  }
  await goLogin();
}
boot();
