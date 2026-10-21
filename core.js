/* Wochenplan – Kernlogik: Datum, Wiederholungen, Abgleich (ohne Oberfläche, auch in Node testbar) */
(function (root) {
  'use strict';

  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');

  // ---------- Datum (immer als 'JJJJ-MM-TT', ohne Uhrzeit) ----------
  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function toUTC(s) {
    const p = s.split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }
  function fromUTC(t) {
    const d = new Date(t);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function addDays(s, n) { return fromUTC(toUTC(s) + n * DAY); }
  /** Anzahl Tage von a nach b (b − a) */
  function diffDays(a, b) { return Math.round((toUTC(b) - toUTC(a)) / DAY); }
  function addMonths(s, n) {
    const p = s.split('-').map(Number);
    const first = new Date(Date.UTC(p[0], p[1] - 1 + n, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(p[2], last));
    return fromUTC(first.getTime());
  }
  /** 0 = Montag … 6 = Sonntag */
  function weekday(s) { return (new Date(toUTC(s)).getUTCDay() + 6) % 7; }
  function weekStart(s) { return addDays(s, -weekday(s)); }
  function isoWeek(s) {
    const t = new Date(toUTC(s));
    t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7)); // Donnerstag dieser Woche
    const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
    return Math.floor((t.getTime() - yearStart) / DAY / 7) + 1;
  }
  function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

  // ---------- Aufgaben ----------
  const CATS = ['arbeit', 'studium', 'privat'];
  const PRIOS = ['kurz', 'mittel', 'lang'];
  const REPEATS = ['none', 'daily', 'weekly', 'monthly'];
  const PERIOD = { daily: 1, weekly: 7 };
  /** größte erlaubte Dauer (Fällig − Start in Tagen) je Wiederholung */
  const MAX_SPAN = { daily: 0, weekly: 6, monthly: 27 };

  function normTask(t) {
    if (!t || typeof t !== 'object' || typeof t.id !== 'string') return null;
    const start = isDate(t.start) ? t.start : (isDate(t.due) ? t.due : null);
    const due = isDate(t.due) ? t.due : start;
    if (!start || !due) {
      if (t.deleted) return { id: t.id, deleted: true, updated: +t.updated || 0, doneT: 0, occ: {} };
      return null;
    }
    const occ = {};
    if (t.occ && typeof t.occ === 'object') {
      for (const k of Object.keys(t.occ)) {
        const v = t.occ[k];
        if (isDate(k) && v && typeof v === 'object') occ[k] = { done: !!v.done, t: +v.t || 0 };
      }
    }
    return {
      id: t.id,
      title: String(t.title || '').slice(0, 200),
      note: String(t.note || '').slice(0, 2000),
      cat: CATS.includes(t.cat) ? t.cat : 'privat',
      prio: PRIOS.includes(t.prio) ? t.prio : 'mittel',
      start: start,
      due: due < start ? start : due,
      repeat: REPEATS.includes(t.repeat) ? t.repeat : 'none',
      until: isDate(t.until) ? t.until : '',
      done: !!t.done,
      doneAt: t.doneAt || null,
      doneT: +t.doneT || 0,
      occ: occ,
      created: t.created || new Date().toISOString(),
      updated: +t.updated || 0,
      deleted: !!t.deleted
    };
  }

  function normDoc(d) {
    const list = d && Array.isArray(d.tasks) ? d.tasks : [];
    const tasks = [];
    for (const t of list) { const n = normTask(t); if (n) tasks.push(n); }
    return { tasks: tasks };
  }

  // ---------- Wiederholungen ----------
  function occAt(task, k) {
    const dur = diffDays(task.start, task.due);
    const s = task.repeat === 'monthly' ? addMonths(task.start, k) : addDays(task.start, k * PERIOD[task.repeat]);
    return { key: s, start: s, due: addDays(s, dur) };
  }

  /** alle Vorkommen, die den Zeitraum [from, to] berühren */
  function occurrencesBetween(task, from, to) {
    const res = [];
    if (!task.repeat || task.repeat === 'none') return res;
    const dur = diffDays(task.start, task.due);
    if (task.repeat === 'monthly') {
      const f = from.split('-').map(Number), s = task.start.split('-').map(Number);
      let k = Math.max(0, (f[0] - s[0]) * 12 + (f[1] - s[1]) - 2);
      for (let guard = 0; guard < 200; guard++, k++) {
        const o = occAt(task, k);
        if (o.start > to) break;
        if (task.until && o.start > task.until) break;
        if (o.due >= from) res.push(o);
      }
    } else {
      const p = PERIOD[task.repeat];
      const k0 = Math.max(0, Math.ceil((diffDays(task.start, from) - dur) / p));
      const k1 = Math.floor(diffDays(task.start, to) / p);
      for (let k = k0; k <= k1; k++) {
        const o = occAt(task, k);
        if (task.until && o.start > task.until) break;
        if (o.due >= from && o.start <= to) res.push(o);
      }
    }
    return res;
  }

  /** das letzte Vorkommen, dessen Fälligkeit vor 'today' liegt (oder null) */
  function lastPastOcc(task, today) {
    if (!task.repeat || task.repeat === 'none') return null;
    const dur = diffDays(task.start, task.due);
    const yesterday = addDays(today, -1);
    if (task.due > yesterday) return null;
    let k;
    if (task.repeat === 'monthly') {
      const t = today.split('-').map(Number), s = task.start.split('-').map(Number);
      k = Math.max(0, (t[0] - s[0]) * 12 + (t[1] - s[1]) - 3);
      let last = null;
      for (let guard = 0; guard < 200; guard++, k++) {
        const o = occAt(task, k);
        if (o.due > yesterday) break;
        if (task.until && o.start > task.until) break;
        last = o;
      }
      return last;
    }
    const p = PERIOD[task.repeat];
    k = Math.floor((diffDays(task.start, yesterday) - dur) / p);
    if (task.until) k = Math.min(k, Math.floor(diffDays(task.start, task.until) / p));
    if (k < 0) return null;
    return occAt(task, k);
  }

  /**
   * Alle Einträge, die im Zeitraum [from, to] sichtbar sind.
   * Offene, überfällige Aufgaben laufen bis heute weiter.
   */
  function buildItems(tasks, from, to, today) {
    const out = [];
    for (const task of tasks) {
      if (task.deleted) continue;
      if (!task.repeat || task.repeat === 'none') {
        const done = !!task.done;
        const overdue = !done && task.due < today;
        const end = overdue ? today : task.due;
        if (task.start <= to && end >= from) {
          out.push({ task: task, key: null, start: task.start, due: task.due, end: end, done: done, overdue: overdue, missed: false });
        }
        continue;
      }
      const occ = task.occ || {};
      const last = lastPastOcc(task, today);
      const seen = {};
      for (const o of occurrencesBetween(task, from, to)) {
        const done = !!(occ[o.key] && occ[o.key].done);
        const isLast = !!last && last.key === o.key;
        const overdue = isLast && !done;
        out.push({
          task: task, key: o.key, start: o.start, due: o.due, end: overdue ? today : o.due,
          done: done, overdue: overdue, missed: !done && !isLast && o.due < today
        });
        seen[o.key] = true;
      }
      if (last && !seen[last.key] && !(occ[last.key] && occ[last.key].done) && last.start <= to && today >= from) {
        out.push({ task: task, key: last.key, start: last.start, due: last.due, end: today, done: false, overdue: true, missed: false });
      }
    }
    return out;
  }

  function validateTask(t) {
    if (!t.title || !t.title.trim()) return 'Bitte gib der Aufgabe einen Namen.';
    if (!isDate(t.start)) return 'Bitte ein Startdatum wählen.';
    if (!isDate(t.due)) return 'Bitte ein Fälligkeitsdatum wählen.';
    if (t.due < t.start) return 'Fällig darf nicht vor dem Start liegen.';
    if (t.repeat && t.repeat !== 'none') {
      const span = diffDays(t.start, t.due);
      if (t.repeat === 'daily' && span > MAX_SPAN.daily) return 'Bei täglicher Wiederholung müssen Start und Fällig auf denselben Tag fallen.';
      if (t.repeat === 'weekly' && span > MAX_SPAN.weekly) return 'Bei wöchentlicher Wiederholung darf eine Aufgabe höchstens 7 Tage dauern.';
      if (t.repeat === 'monthly' && span > MAX_SPAN.monthly) return 'Bei monatlicher Wiederholung darf eine Aufgabe höchstens 28 Tage dauern.';
      if (t.until && t.until < t.start) return '„Wiederholen bis“ darf nicht vor dem Start liegen.';
    }
    return null;
  }

  // ---------- Abgleich zwischen Geräten ----------
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }
  const MAIN_FIELDS = ['title', 'note', 'cat', 'prio', 'start', 'due', 'repeat', 'until', 'created', 'updated', 'deleted'];

  /** Zusammenführen einer Aufgabe: Inhalt nach letzter Änderung, Erledigt-Status und Wiederholungen getrennt */
  function mergeTask(a, b) {
    let base;
    if ((b.updated || 0) !== (a.updated || 0)) base = (b.updated || 0) > (a.updated || 0) ? b : a;
    else {
      const sa = stable(MAIN_FIELDS.map((f) => a[f])), sb = stable(MAIN_FIELDS.map((f) => b[f]));
      base = sb > sa ? b : a;
    }
    const out = Object.assign({}, base);
    const s = (b.doneT || 0) > (a.doneT || 0) ? b : a;
    out.done = !!s.done;
    out.doneAt = s.doneAt || null;
    out.doneT = Math.max(a.doneT || 0, b.doneT || 0);
    const occ = Object.assign({}, a.occ || {});
    const bo = b.occ || {};
    for (const k of Object.keys(bo)) {
      if (!occ[k] || (bo[k].t || 0) > (occ[k].t || 0)) occ[k] = bo[k];
    }
    out.occ = occ;
    return out;
  }

  const TOMBSTONE_DAYS = 120;

  function mergeDocs(local, remote, nowMs) {
    nowMs = nowMs || Date.now();
    const map = new Map();
    for (const t of local.tasks) map.set(t.id, t);
    for (const t of remote.tasks) {
      const l = map.get(t.id);
      map.set(t.id, l ? mergeTask(l, t) : t);
    }
    const cutoff = nowMs - TOMBSTONE_DAYS * DAY;
    const tasks = [];
    for (const t of map.values()) {
      if (t.deleted && (t.updated || 0) < cutoff) continue;
      tasks.push(t);
    }
    tasks.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    return { tasks: tasks };
  }

  function sameTasks(a, b) {
    const sa = a.tasks.slice().sort((x, y) => (x.id < y.id ? -1 : 1));
    const sb = b.tasks.slice().sort((x, y) => (x.id < y.id ? -1 : 1));
    return stable(sa) === stable(sb);
  }

  const api = {
    DAY, todayStr, toUTC, fromUTC, addDays, diffDays, addMonths, weekday, weekStart, isoWeek, isDate,
    CATS, PRIOS, REPEATS, MAX_SPAN, normTask, normDoc, occAt, occurrencesBetween, lastPastOcc, buildItems,
    validateTask, stable, mergeTask, mergeDocs, sameTasks
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WP = api;
})(typeof self !== 'undefined' ? self : this);
