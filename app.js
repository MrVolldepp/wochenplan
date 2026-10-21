/* Wochenplan – Oberfläche, Speicherung, OneDrive-Abgleich */
(function () {
  'use strict';

  const WP = window.WP;
  const CFG = Object.assign({ clientId: '', oneDriveFolder: 'Wochenplan', oneDriveFile: 'aufgaben.json' }, window.WOCHENPLAN_CONFIG || {});
  const APP_VERSION = '1.1';
  const KEY_DATA = 'wochenplan.daten.v1';
  const KEY_PREFS = 'wochenplan.einstellungen.v1';
  const KEY_SYNC = 'wochenplan.abgleich.v1';
  const SCOPES = ['Files.ReadWrite'];
  const GRAPH = 'https://graph.microsoft.com/v1.0';

  const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const WD_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const MON = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];
  const MON_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const CAT_NAME = { arbeit: 'Arbeit', studium: 'Studium', privat: 'Privat' };
  const GROUPS = [
    { id: 'overdue', name: 'Überfällig' },
    { id: 'kurz', name: 'Kurzfristig' },
    { id: 'mittel', name: 'Mittelfristig' },
    { id: 'lang', name: 'Langfristig' },
    { id: 'done', name: 'Erledigt' }
  ];
  const REPEAT_NAME = { daily: 'täglich', weekly: 'wöchentlich', monthly: 'monatlich' };

  const $ = (id) => document.getElementById(id);
  const today = () => WP.todayStr();

  // ---------- Speicher ----------
  function readJSON(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }

  let doc = WP.normDoc(readJSON(KEY_DATA, { tasks: [] }));
  const prefs = Object.assign({ escalate: true, showDone: true, lastCat: 'arbeit', lastPrio: 'mittel' }, readJSON(KEY_PREFS, {}));
  const syncMeta = Object.assign({ lastSync: 0, dirty: false }, readJSON(KEY_SYNC, {}));
  let changeCounter = 0;

  function saveLocal(markDirty) {
    if (!writeJSON(KEY_DATA, { app: 'wochenplan', version: 1, tasks: doc.tasks })) {
      toast('Speichern auf diesem Gerät fehlgeschlagen. Ist der Speicher voll?');
    }
    if (markDirty) {
      changeCounter++;
      syncMeta.dirty = true;
      writeJSON(KEY_SYNC, syncMeta);
      scheduleSync(1200);
    }
  }
  function savePrefs() { writeJSON(KEY_PREFS, prefs); }

  // ---------- Zustand der Ansicht ----------
  const state = {
    ws: WP.weekStart(today()),
    sel: today(),
    editing: null, // { id, key }
    lastToday: today()
  };

  // ---------- kleine Helfer ----------
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style') el.setAttribute('style', v);
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  function svg(paths, cls) {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    for (const d of paths) { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); s.append(p); }
    return s;
  }
  const ICON_CHECK = ['M5 12.5l4.5 4.5L19 7.5'];
  const ICON_REPEAT = ['M17 2l4 4-4 4', 'M3 11v-1a4 4 0 0 1 4-4h14', 'M7 22l-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3'];

  function dm(s) { const p = s.split('-'); return (+p[2]) + '.' + (+p[1]) + '.'; }
  function dmy(s) { const p = s.split('-'); return (+p[2]) + '.' + (+p[1]) + '.' + p[0]; }
  function wdShort(s) { return WD[WP.weekday(s)]; }
  function plural(n, one, many) { return n === 1 ? one : many; }
  function fmtTime(ms) { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function fmtStamp(ms) {
    if (!ms) return 'noch nie';
    const d = new Date(ms);
    const ds = WP.todayStr(d);
    if (ds === today()) return 'heute, ' + fmtTime(ms);
    if (ds === WP.addDays(today(), -1)) return 'gestern, ' + fmtTime(ms);
    return dmy(ds) + ', ' + fmtTime(ms);
  }

  function weekLabelText(ws) {
    const we = WP.addDays(ws, 6);
    const a = ws.split('-').map(Number), b = we.split('-').map(Number);
    let range;
    if (a[1] === b[1]) range = a[2] + '.–' + b[2] + '. ' + MON[b[1] - 1];
    else range = a[2] + '. ' + MON[a[1] - 1] + ' – ' + b[2] + '. ' + MON[b[1] - 1];
    if (a[0] !== b[0] || a[0] !== new Date().getFullYear()) range += ' ' + b[0];
    return { kw: 'KW ' + WP.isoWeek(ws), range: range };
  }

  function groupOf(item) {
    if (item.done) return 'done';
    if (item.overdue) return 'overdue';
    if (prefs.escalate && item.due <= WP.addDays(today(), 1)) return 'kurz';
    return item.task.prio;
  }
  function sortItems(list) {
    return list.sort((x, y) =>
      (x.due < y.due ? -1 : x.due > y.due ? 1 : 0) ||
      (x.start < y.start ? -1 : x.start > y.start ? 1 : 0) ||
      x.task.title.localeCompare(y.task.title, 'de'));
  }
  function grouped(items) {
    const g = {};
    for (const gr of GROUPS) g[gr.id] = [];
    for (const it of items) g[groupOf(it)].push(it);
    for (const k of Object.keys(g)) sortItems(g[k]);
    return g;
  }
  function itemsFor(from, to) {
    const list = WP.buildItems(doc.tasks, from, to, today());
    return prefs.showDone ? list : list.filter((i) => !i.done);
  }

  // ---------- Darstellung ----------
  function render() {
    const lbl = weekLabelText(state.ws);
    const wl = $('weekLabel');
    wl.replaceChildren(h('b', { text: lbl.kw }), lbl.range);
    $('todayBtn').hidden = state.ws === WP.weekStart(today()) && state.sel === today();
    renderBoard();
    renderMobile();
    updateSyncUI();
  }

  function renderBoard() {
    const board = $('board');
    const ws = state.ws, we = WP.addDays(ws, 6), t = today();
    const days = h('div', { class: 'days' });
    const cols = h('div', { class: 'cols', 'aria-hidden': 'true' });
    for (let i = 0; i < 7; i++) {
      const d = WP.addDays(ws, i);
      const cls = (i >= 5 ? ' weekend' : '') + (d === t ? ' today' : '');
      days.append(h('div', { class: 'day' + cls }, WD[i], h('strong', { text: String(+d.slice(8)) }), d === t ? h('span', { class: 'today-tag', text: 'heute' }) : null));
      const col = h('div', { class: 'col' + cls });
      if (d === t) col.append(h('div', { class: 'now-line', id: 'nowLine', style: 'left:' + nowPct() + '%' }));
      cols.append(col);
    }
    const body = h('div', { class: 'grid-body' }, cols);
    const items = itemsFor(ws, we);
    if (!items.some((i) => !i.done)) {
      body.append(h('div', { class: 'empty' },
        h('strong', { text: items.length ? 'Alles erledigt in dieser Woche.' : 'Für diese Woche ist nichts geplant.' }),
        'Neue Aufgaben legst du oben rechts mit „Neue Aufgabe“ an.'));
    }
    const g = grouped(items);
    for (const gr of GROUPS) {
      const list = g[gr.id];
      if (!list.length) continue;
      // wiederkehrende Aufgaben: alle Vorkommen einer Serie in derselben Zeile
      const rows = [];
      const series = new Map();
      for (const it of list) {
        if (it.task.repeat === 'none') { rows.push([it]); continue; }
        let r = series.get(it.task.id);
        if (!r) { r = []; series.set(it.task.id, r); rows.push(r); }
        r.push(it);
      }
      const sec = h('section', { class: 'group ' + gr.id, 'aria-label': gr.name });
      sec.append(h('div', { class: 'group-head' }, gr.name, h('span', { class: 'count', text: String(rows.length) }),
        gr.id === 'overdue' ? h('span', { class: 'hint', text: 'laufen bis heute weiter, bis du sie abhakst' }) : null));
      for (const r of rows) {
        r.sort((a, b) => (a.start < b.start ? -1 : 1));
        sec.append(h('div', { class: 'row' }, ...r.map((it) => barEl(it, ws, we))));
      }
      body.append(sec);
    }
    board.replaceChildren(days, body);
  }

  function nowPct() {
    const n = new Date();
    return ((n.getHours() * 60 + n.getMinutes()) / 1440 * 100).toFixed(2);
  }

  function barEl(it, ws, we) {
    const t = it.task;
    const visStart = it.start < ws ? ws : it.start;
    const visEnd = it.end > we ? we : it.end;
    const c1 = WP.diffDays(ws, visStart) + 1;
    const c2 = WP.diffDays(ws, visEnd) + 2;
    const cls = ['bar', t.cat];
    if (it.start < ws) cls.push('cut-left');
    if (it.end > we) cls.push('cut-right');
    else if (!it.done && !it.overdue) cls.push('due-end');
    if (it.done) cls.push('is-done');
    if (it.overdue) cls.push('overdue');
    if (it.missed) cls.push('missed');
    let style = 'grid-row:1;grid-column:' + c1 + '/' + c2 + ';';
    if (it.overdue) {
      const span = WP.diffDays(visStart, visEnd) + 1;
      const inDue = it.due < visStart ? 0 : WP.diffDays(visStart, it.due) + 1;
      const pct = Math.max(0, Math.min(100, inDue / span * 100));
      style += '--due-pct:' + pct.toFixed(1) + '%;';
      if (pct === 0) cls.push('all-late');
    }
    let meta = null;
    if (it.overdue) meta = 'fällig ' + dm(it.due);
    else if (it.end > we && !it.done) meta = 'bis ' + wdShort(it.due) + ' ' + dm(it.due);
    const tip = t.title + '\nStart ' + dmy(it.start) + ', fällig ' + dmy(it.due) + (t.repeat !== 'none' ? '\nWiederholt sich ' + REPEAT_NAME[t.repeat] : '');
    return h('div', { class: cls.join(' '), style: style },
      h('button', {
        class: 'check', type: 'button',
        'aria-label': it.done ? '„' + t.title + '“ wieder öffnen' : '„' + t.title + '“ als erledigt markieren',
        onclick: (e) => { e.stopPropagation(); toggleDone(t.id, it.key); }
      }, svg(ICON_CHECK)),
      h('button', {
        class: 'bar-open', type: 'button', title: tip,
        onclick: () => openTask(t.id, it.key)
      },
        t.repeat !== 'none' ? svg(ICON_REPEAT, 'rep') : null,
        h('span', { class: 'title', text: t.title }),
        meta ? h('span', { class: 'meta', text: meta }) : null));
  }

  function renderMobile() {
    const ws = state.ws, t = today(), sel = state.sel;
    const strip = $('dayStrip');
    strip.replaceChildren();
    for (let i = 0; i < 7; i++) {
      const d = WP.addDays(ws, i);
      const open = WP.buildItems(doc.tasks, d, d, t).filter((x) => !x.done);
      const dots = h('span', { class: 'dots', 'aria-hidden': 'true' });
      open.slice(0, 4).forEach((x) => dots.append(h('i', { class: x.overdue ? '' : x.task.cat })));
      strip.append(h('button', {
        class: 'daybtn' + (d === t ? ' today' : ''), type: 'button', role: 'tab',
        'aria-selected': d === sel ? 'true' : 'false',
        'aria-label': WD_LONG[i] + ', ' + dm(d) + (open.length ? ', ' + open.length + ' offen' : ''),
        onclick: () => { state.sel = d; render(); }
      }, h('span', { class: 'wd', text: WD[i] }), h('span', { class: 'dn', text: String(+d.slice(8)) }), dots));
    }

    const rel = sel === t ? 'heute' : sel === WP.addDays(t, 1) ? 'morgen' : sel === WP.addDays(t, -1) ? 'gestern' : null;
    const p = sel.split('-').map(Number);
    $('dayHead').replaceChildren(WD_LONG[WP.weekday(sel)] + ', ' + p[2] + '. ' + MON_LONG[p[1] - 1], rel ? h('small', { text: rel }) : null);

    const list = $('dayList');
    list.replaceChildren();
    const items = itemsFor(sel, sel);
    if (!items.some((i) => !i.done)) {
      list.append(h('div', { class: 'empty' },
        h('strong', { text: items.length ? 'Alles erledigt.' : 'Für diesen Tag ist nichts geplant.' }),
        'Neue Aufgaben legst du oben rechts mit + an.'));
    }
    const g = grouped(items);
    for (const gr of GROUPS) {
      const arr = g[gr.id];
      if (!arr.length) continue;
      list.append(h('h3', { class: 'list-group-head ' + gr.id }, gr.name, h('span', { class: 'count', text: String(arr.length) })));
      for (const it of arr) list.append(cardEl(it, ws, sel, t));
    }
  }

  function dueText(it, t) {
    if (it.done) return { text: 'erledigt' };
    if (it.overdue) {
      const n = WP.diffDays(it.due, t);
      return { text: n === 1 ? 'seit gestern überfällig' : 'seit ' + n + ' Tagen überfällig', cls: 'late' };
    }
    if (it.due === t) return { text: 'fällig heute', cls: 'soon' };
    if (it.due === WP.addDays(t, 1)) return { text: 'fällig morgen', cls: 'soon' };
    return { text: 'fällig ' + wdShort(it.due) + ' ' + dm(it.due) };
  }

  function cardEl(it, ws, sel, t) {
    const task = it.task;
    const cls = ['card', task.cat];
    if (it.done) cls.push('is-done');
    if (it.overdue) cls.push('overdue');
    const due = dueText(it, t);
    const span = h('span', { class: 'span', 'aria-hidden': 'true' });
    for (let i = 0; i < 7; i++) {
      const d = WP.addDays(ws, i);
      const c = [];
      if (d >= it.start && d <= it.end) c.push(d > it.due ? 'late' : 'on');
      if (d === it.due) c.push('due');
      if (d === sel) c.push('sel');
      span.append(h('i', { class: c.join(' ') }));
    }
    const sub = h('span', { class: 'sub' },
      h('span', { text: CAT_NAME[task.cat] }),
      h('span', { class: due.cls || null, text: due.text }),
      task.repeat !== 'none' ? h('span', { class: 'rep-label' }, svg(ICON_REPEAT), REPEAT_NAME[task.repeat]) : null);
    return h('div', { class: cls.join(' ') },
      h('button', {
        class: 'check-wrap', type: 'button',
        'aria-label': it.done ? '„' + task.title + '“ wieder öffnen' : '„' + task.title + '“ als erledigt markieren',
        onclick: () => toggleDone(task.id, it.key)
      }, h('span', { class: 'check' }, svg(ICON_CHECK))),
      h('button', { class: 'body', type: 'button', onclick: () => openTask(task.id, it.key) },
        h('span', { class: 'ttl', text: task.title }), sub,
        task.note && !it.done ? h('span', { class: 'note', text: task.note }) : null,
        span));
  }

  // ---------- Aufgaben ändern ----------
  function findTask(id) { return doc.tasks.find((x) => x.id === id); }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function toggleDone(id, key) {
    const task = findTask(id);
    if (!task) return;
    const now = Date.now();
    if (task.repeat !== 'none' && key) {
      const cur = !!(task.occ[key] && task.occ[key].done);
      task.occ = Object.assign({}, task.occ, { [key]: { done: !cur, t: now } });
    } else {
      task.done = !task.done;
      task.doneAt = task.done ? new Date(now).toISOString() : null;
      task.doneT = now;
    }
    saveLocal(true);
    render();
  }

  function deleteTask(id) {
    const task = findTask(id);
    if (!task) return;
    task.deleted = true;
    task.updated = Date.now();
    saveLocal(true);
    render();
    toast('„' + task.title + '“ gelöscht.', 'Rückgängig', () => {
      task.deleted = false;
      task.updated = Date.now();
      saveLocal(true);
      render();
    }, 7000);
  }

  // ---------- Formular ----------
  const dlg = $('taskDialog');
  const form = $('taskForm');

  function setRadio(name, value) {
    const el = form.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (el) el.checked = true;
  }
  function getRadio(name) {
    const el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }

  function openTask(id, key) {
    const task = id ? findTask(id) : null;
    state.editing = task ? { id: task.id, key: key || null } : null;
    form.reset();
    $('formError').hidden = true;
    $('taskDialogTitle').textContent = task ? 'Aufgabe bearbeiten' : 'Neue Aufgabe';
    $('saveBtn').textContent = task ? 'Speichern' : 'Anlegen';
    $('fTitle').value = task ? task.title : '';
    setRadio('cat', task ? task.cat : prefs.lastCat);
    setRadio('prio', task ? task.prio : (prefs.lastPrio || 'mittel'));
    $('fStart').value = task ? task.start : today();
    $('fDue').value = task ? task.due : '';
    setRadio('repeat', task ? task.repeat : 'none');
    $('fUntil').value = task ? task.until : '';
    $('fNote').value = task ? task.note : '';
    $('untilField').hidden = getRadio('repeat') === 'none';
    $('deleteBtn').hidden = !task;
    const doneBtn = $('toggleDoneBtn');
    doneBtn.hidden = !task;
    if (task) {
      const rec = task.repeat !== 'none' && key;
      const isDone = rec ? !!(task.occ[key] && task.occ[key].done) : task.done;
      doneBtn.textContent = isDone ? 'Wieder öffnen' : (rec ? 'Dieses Mal erledigt' : 'Erledigt');
      const created = task.created ? new Date(task.created) : null;
      let meta = created && !isNaN(created) ? 'Angelegt am ' + dmy(WP.todayStr(created)) + ' um ' + fmtTime(created.getTime()) + ' Uhr.' : '';
      if (task.repeat !== 'none') meta += ' Änderungen gelten für alle Wiederholungen.';
      $('formMeta').textContent = meta.trim();
      $('formMeta').hidden = !meta.trim();
    } else {
      $('formMeta').hidden = true;
    }
    dlg.showModal();
    if (!task) $('fTitle').focus();
  }

  function closeDialog(d) { if (d.open) d.close(); }

  form.addEventListener('change', (e) => {
    if (e.target.name === 'repeat') {
      const r = getRadio('repeat');
      $('untilField').hidden = r === 'none';
      if (r === 'daily' && $('fStart').value) $('fDue').value = $('fStart').value;
    }
    if (e.target.id === 'fStart' && getRadio('repeat') === 'daily') $('fDue').value = $('fStart').value;
  });

  $('dueChips').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-due]');
    if (!b) return;
    const t = today();
    const v = b.dataset.due;
    let d;
    if (v === 'fri') d = WP.addDays(t, (4 - WP.weekday(t) + 7) % 7);
    else if (v === 'month') d = WP.addMonths(t, 1);
    else d = WP.addDays(t, +v);
    $('fDue').value = d;
    if ($('fStart').value && $('fStart').value > d) $('fStart').value = d;
    if (getRadio('repeat') === 'daily') $('fStart').value = d;
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      title: $('fTitle').value.trim(),
      cat: getRadio('cat') || 'privat',
      prio: getRadio('prio') || 'mittel',
      start: $('fStart').value,
      due: $('fDue').value,
      repeat: getRadio('repeat') || 'none',
      until: getRadio('repeat') === 'none' ? '' : $('fUntil').value,
      note: $('fNote').value.trim()
    };
    const err = WP.validateTask(data);
    if (err) {
      $('formError').textContent = err;
      $('formError').hidden = false;
      return;
    }
    const now = Date.now();
    const editing = state.editing;
    if (editing) {
      const task = findTask(editing.id);
      if (task) Object.assign(task, data, { updated: now });
    } else {
      doc.tasks.push(WP.normTask(Object.assign({
        id: uid(), done: false, doneAt: null, doneT: 0, occ: {},
        created: new Date(now).toISOString(), updated: now, deleted: false
      }, data)));
    }
    prefs.lastCat = data.cat;
    prefs.lastPrio = data.prio;
    savePrefs();
    saveLocal(true);
    closeDialog(dlg);
    // neue Aufgabe sichtbar machen, falls sie außerhalb der aktuellen Woche liegt
    if (!editing) {
      const ws = state.ws, we = WP.addDays(ws, 6);
      if (data.start > we || data.due < ws) { state.ws = WP.weekStart(data.start); state.sel = data.start; }
    }
    state.editing = null;
    render();
  });

  $('deleteBtn').addEventListener('click', () => {
    if (!state.editing) return;
    const id = state.editing.id;
    closeDialog(dlg);
    deleteTask(id);
  });
  $('toggleDoneBtn').addEventListener('click', () => {
    if (!state.editing) return;
    const ed = state.editing;
    closeDialog(dlg);
    toggleDone(ed.id, ed.key);
  });

  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeDialog(b.closest('dialog'))));
  dlg.addEventListener('close', () => { state.editing = null; });

  // ---------- Einstellungen ----------
  const setDlg = $('settingsDialog');
  setDlg.addEventListener('click', (e) => { if (e.target === setDlg) closeDialog(setDlg); });
  $('settingsBtn').addEventListener('click', openSettings);
  function openSettings() {
    $('optEscalate').checked = !!prefs.escalate;
    $('optShowDone').checked = !!prefs.showDone;
    $('versionInfo').textContent = 'Wochenplan ' + APP_VERSION + '. ' + doc.tasks.filter((t) => !t.deleted).length + ' Aufgaben auf diesem Gerät gespeichert.';
    updateSyncUI();
    setDlg.showModal();
  }
  $('optEscalate').addEventListener('change', (e) => { prefs.escalate = e.target.checked; savePrefs(); render(); });
  $('optShowDone').addEventListener('change', (e) => { prefs.showDone = e.target.checked; savePrefs(); render(); });

  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'wochenplan', version: 1, saved: new Date().toISOString(), tasks: doc.tasks }, null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'wochenplan-sicherung-' + today() + '.json' });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
  $('importInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const imported = WP.normDoc(JSON.parse(await file.text()));
      const before = doc.tasks.filter((t) => !t.deleted).length;
      doc = WP.mergeDocs(doc, imported);
      saveLocal(true);
      render();
      const after = doc.tasks.filter((t) => !t.deleted).length;
      toast('Sicherung eingelesen. ' + (after - before) + ' ' + plural(after - before, 'Aufgabe', 'Aufgaben') + ' neu dazugekommen.');
    } catch (err) {
      toast('Die Datei ist keine gültige Wochenplan-Sicherung.');
    }
  });

  // ---------- Hinweis-Leiste ----------
  let toastTimer = null;
  function toast(text, actionLabel, action, ms) {
    const el = $('toast');
    $('toastText').textContent = text;
    const btn = $('toastAction');
    btn.textContent = actionLabel || '';
    btn.onclick = action ? () => { el.hidden = true; action(); } : null;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms || 4000);
  }

  // ---------- OneDrive-Abgleich ----------
  const sync = { pca: null, account: null, busy: false, again: false, error: null, needLogin: false, timer: null, ready: false };

  function appBaseUrl() { return new URL('./', location.href).href; }
  function filePath() {
    const parts = [CFG.oneDriveFolder, CFG.oneDriveFile].filter(Boolean).map(encodeURIComponent);
    return parts.join('/');
  }

  class SyncError extends Error {
    constructor(kind, msg) { super(msg || kind); this.kind = kind; }
  }

  async function initAuth() {
    if (!CFG.clientId) { sync.ready = true; updateSyncUI(); return; }
    if (!window.msal) { sync.error = 'Anmelde-Bibliothek konnte nicht geladen werden.'; sync.ready = true; updateSyncUI(); return; }
    try {
      sync.pca = new msal.PublicClientApplication({
        auth: {
          clientId: CFG.clientId,
          authority: 'https://login.microsoftonline.com/consumers',
          redirectUri: appBaseUrl(),
          postLogoutRedirectUri: appBaseUrl(),
          navigateToLoginRequestUrl: false
        },
        cache: { cacheLocation: 'localStorage' }
      });
      await sync.pca.initialize();
      const res = await sync.pca.handleRedirectPromise();
      if (res && res.account) { sync.pca.setActiveAccount(res.account); sync.needLogin = false; }
      const acc = sync.pca.getActiveAccount() || sync.pca.getAllAccounts()[0] || null;
      if (acc) sync.pca.setActiveAccount(acc);
      sync.account = acc;
    } catch (e) {
      sync.error = 'Anmeldung fehlgeschlagen: ' + (e && (e.errorMessage || e.message) || e);
    }
    sync.ready = true;
    updateSyncUI();
    if (sync.account) runSync();
  }

  async function login() {
    if (!sync.pca) return;
    if (!navigator.onLine) { toast('Für die Anmeldung brauchst du Internet.'); return; }
    try {
      await sync.pca.loginRedirect({ scopes: SCOPES, prompt: 'select_account' });
    } catch (e) {
      sync.error = 'Anmeldung fehlgeschlagen: ' + (e.errorMessage || e.message || e);
      updateSyncUI();
    }
  }
  async function logout() {
    if (!sync.pca || !sync.account) return;
    const acc = sync.account;
    sync.account = null;
    sync.pca.setActiveAccount(null);
    try { await sync.pca.clearCache({ account: acc }); } catch (e) { /* egal */ }
    updateSyncUI();
    toast('Abgemeldet. Deine Aufgaben bleiben auf diesem Gerät gespeichert.');
  }

  async function getToken() {
    try {
      const r = await sync.pca.acquireTokenSilent({ scopes: SCOPES, account: sync.account });
      return r.accessToken;
    } catch (e) {
      if (!navigator.onLine) throw new SyncError('offline');
      const code = (e && e.errorCode) || '';
      if ((window.msal && e instanceof msal.InteractionRequiredAuthError) || /interaction_required|login_required|consent_required|no_tokens_found|no_account/i.test(code)) {
        sync.needLogin = true;
        throw new SyncError('signin');
      }
      throw new SyncError('error', 'Anmeldung konnte nicht erneuert werden (' + (code || e.message) + ').');
    }
  }

  async function graph(method, url, token, body, extraHeaders) {
    const headers = Object.assign({ Authorization: 'Bearer ' + token }, extraHeaders || {});
    let res;
    try {
      res = await fetch(url, { method: method, headers: headers, body: body, cache: 'no-store' });
    } catch (e) {
      throw new SyncError(navigator.onLine ? 'error' : 'offline', 'OneDrive nicht erreichbar.');
    }
    if (res.status === 401) { sync.needLogin = true; throw new SyncError('signin'); }
    return res;
  }

  async function httpError(res, what) {
    let detail = '';
    try { const j = await res.json(); detail = j && j.error && (j.error.message || j.error.code) || ''; } catch (e) { /* kein JSON */ }
    return new SyncError('error', what + ' (' + res.status + (detail ? ': ' + detail : '') + ')');
  }

  async function downloadRemote(token) {
    const res = await graph('GET', GRAPH + '/me/drive/root:/' + filePath(), token);
    if (res.status === 404) return { exists: false };
    if (!res.ok) throw await httpError(res, 'Datei in OneDrive konnte nicht gelesen werden');
    const meta = await res.json();
    let file = null;
    const url = meta['@microsoft.graph.downloadUrl'];
    if (url) { try { file = await fetch(url, { cache: 'no-store' }); } catch (e) { file = null; } }
    if (!file || !file.ok) file = await graph('GET', GRAPH + '/me/drive/items/' + encodeURIComponent(meta.id) + '/content', token);
    if (!file.ok) throw await httpError(file, 'Datei in OneDrive konnte nicht geladen werden');
    const text = await file.text();
    let parsed;
    try { parsed = text.trim() ? JSON.parse(text) : { tasks: [] }; } catch (e) {
      throw new SyncError('error', 'Die Datei „' + CFG.oneDriveFile + '“ in OneDrive ist beschädigt. Sie wird nicht überschrieben.');
    }
    if (!parsed || typeof parsed !== 'object' || (parsed.tasks && !Array.isArray(parsed.tasks))) {
      throw new SyncError('error', 'Die Datei „' + CFG.oneDriveFile + '“ in OneDrive hat ein unbekanntes Format. Sie wird nicht überschrieben.');
    }
    return { exists: true, eTag: meta.eTag, doc: WP.normDoc(parsed) };
  }

  async function ensureFolder(token) {
    if (!CFG.oneDriveFolder) return;
    const res = await graph('POST', GRAPH + '/me/drive/root/children', token,
      JSON.stringify({ name: CFG.oneDriveFolder, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
      { 'Content-Type': 'application/json' });
    if (res.ok || res.status === 409) return;
    throw await httpError(res, 'Ordner in OneDrive konnte nicht angelegt werden');
  }

  async function uploadRemote(token, data, eTag) {
    let url = GRAPH + '/me/drive/root:/' + filePath() + ':/content';
    const headers = { 'Content-Type': 'application/json' };
    if (eTag) headers['If-Match'] = eTag;
    else url += '?@microsoft.graph.conflictBehavior=fail';
    const body = JSON.stringify({ app: 'wochenplan', version: 1, saved: new Date().toISOString(), tasks: data.tasks });
    const res = await graph('PUT', url, token, body, headers);
    if (res.status === 412 || res.status === 409) return { conflict: true };
    if (!res.ok) throw await httpError(res, 'Speichern in OneDrive fehlgeschlagen');
    return { conflict: false };
  }

  async function runSync() {
    if (!sync.pca || !sync.account) return;
    if (!navigator.onLine) { updateSyncUI(); return; }
    if (sync.busy) { sync.again = true; return; }
    sync.busy = true;
    sync.error = null;
    updateSyncUI();
    try {
      let done = false;
      for (let attempt = 0; attempt < 4 && !done; attempt++) {
        const token = await getToken();
        const remote = await downloadRemote(token);
        const mark = changeCounter;
        const merged = WP.mergeDocs(doc, remote.exists ? remote.doc : { tasks: [] });
        if (!WP.sameTasks(merged, doc)) {
          doc = merged;
          saveLocal(false);
          render();
        }
        if (!remote.exists || !WP.sameTasks(merged, remote.doc)) {
          if (!remote.exists) await ensureFolder(token);
          const up = await uploadRemote(token, merged, remote.exists ? remote.eTag : null);
          if (up.conflict) continue; // anderes Gerät war schneller → neu laden und zusammenführen
        }
        if (changeCounter === mark) syncMeta.dirty = false;
        else sync.again = true;
        syncMeta.lastSync = Date.now();
        writeJSON(KEY_SYNC, syncMeta);
        sync.needLogin = false;
        done = true;
      }
      if (!done) sync.error = 'Zu viele gleichzeitige Änderungen. Bitte gleich nochmal versuchen.';
    } catch (e) {
      if (e instanceof SyncError) {
        if (e.kind === 'error') sync.error = e.message;
      } else {
        sync.error = 'Unerwarteter Fehler beim Abgleich: ' + (e && e.message || e);
      }
    } finally {
      sync.busy = false;
      updateSyncUI();
      if (sync.again) { sync.again = false; scheduleSync(400); }
    }
  }

  function scheduleSync(ms) {
    clearTimeout(sync.timer);
    sync.timer = setTimeout(runSync, ms || 0);
  }

  function syncStatus() {
    if (!CFG.clientId) return { state: 'local', short: 'Nur auf diesem Gerät', long: 'OneDrive ist noch nicht eingerichtet. Deine Aufgaben werden nur auf diesem Gerät gespeichert. Die Einrichtung steht in der Anleitung (README).' };
    if (!sync.ready) return { state: 'syncing', short: 'Startet …', long: 'Anmeldung wird geprüft …' };
    if (!sync.account) return { state: 'signin', short: 'Nicht angemeldet', long: 'Melde dich mit deinem Microsoft-Konto an, damit Handy und PC denselben Stand haben.' };
    if (sync.busy) return { state: 'syncing', short: 'Gleicht ab …', long: 'Abgleich mit OneDrive läuft …' };
    if (sync.needLogin) return { state: 'signin', short: 'Anmeldung nötig', long: 'Die Anmeldung ist abgelaufen. Bitte neu anmelden, deine Änderungen bleiben erhalten.' };
    if (!navigator.onLine) {
      return syncMeta.dirty
        ? { state: 'pending', short: 'Offline', long: 'Offline. Deine Änderungen sind gespeichert und werden übertragen, sobald du wieder online bist.' }
        : { state: 'offline', short: 'Offline', long: 'Offline. Letzter Abgleich: ' + fmtStamp(syncMeta.lastSync) + '.' };
    }
    if (sync.error) return { state: 'error', short: 'Abgleich fehlgeschlagen', long: sync.error };
    if (syncMeta.dirty) return { state: 'pending', short: 'Noch nicht übertragen', long: 'Änderungen warten auf die Übertragung.' };
    return { state: 'ok', short: 'Abgeglichen ' + fmtTime(syncMeta.lastSync || Date.now()), long: 'Alles abgeglichen. Letzter Abgleich: ' + fmtStamp(syncMeta.lastSync) + '.' };
  }

  function updateSyncUI() {
    const s = syncStatus();
    const btn = $('syncBtn');
    btn.dataset.state = s.state;
    $('syncText').textContent = s.short;
    btn.setAttribute('aria-label', 'Synchronisierung: ' + s.short);
    btn.title = s.long;
    const st = $('odStatus');
    st.replaceChildren(s.long);
    if (sync.account) st.append(h('br'), 'Angemeldet als ', h('strong', { text: sync.account.username || sync.account.name || 'Microsoft-Konto' }), '.');
    if (CFG.clientId && sync.account) st.append(h('br'), 'Datei: OneDrive/' + [CFG.oneDriveFolder, CFG.oneDriveFile].filter(Boolean).join('/'));
    $('loginBtn').hidden = !CFG.clientId || (!!sync.account && !sync.needLogin);
    $('loginBtn').textContent = sync.needLogin ? 'Neu anmelden' : 'Mit Microsoft anmelden';
    $('logoutBtn').hidden = !sync.account;
    $('syncNowBtn').hidden = !sync.account;
    $('syncNowBtn').disabled = sync.busy || !navigator.onLine;
  }

  $('loginBtn').addEventListener('click', login);
  $('logoutBtn').addEventListener('click', logout);
  $('syncNowBtn').addEventListener('click', () => runSync());
  $('syncBtn').addEventListener('click', () => {
    if (sync.account && !sync.needLogin && navigator.onLine && !sync.error) runSync();
    else openSettings();
  });

  window.addEventListener('online', () => { updateSyncUI(); scheduleSync(300); });
  window.addEventListener('offline', updateSyncUI);
  // Zurück aus dem Hintergrund: nach mehr als einer Stunde oder an einem neuen Tag auf „heute“ springen
  let hiddenAt = 0, hiddenDay = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') { hiddenAt = Date.now(); hiddenDay = today(); return; }
    const longAway = hiddenAt && (Date.now() - hiddenAt > 3600000 || today() !== hiddenDay);
    hiddenAt = 0;
    if (longAway && !document.querySelector('dialog[open]')) {
      state.lastToday = today();
      state.ws = WP.weekStart(state.lastToday);
      state.sel = state.lastToday;
      render();
    } else {
      tick();
    }
    if (Date.now() - (syncMeta.lastSync || 0) > 15000 || syncMeta.dirty) scheduleSync(200);
  });
  setInterval(() => { if (document.visibilityState === 'visible') scheduleSync(0); }, 120000);
  // Änderungen aus einem anderen Tab desselben Geräts übernehmen
  window.addEventListener('storage', (e) => {
    if (e.key === KEY_DATA) { doc = WP.normDoc(readJSON(KEY_DATA, { tasks: [] })); render(); }
  });

  // ---------- Bedienung ----------
  $('addBtn').addEventListener('click', () => openTask(null));
  $('prevWeek').addEventListener('click', () => shiftWeek(-1));
  $('nextWeek').addEventListener('click', () => shiftWeek(1));
  $('todayBtn').addEventListener('click', () => { state.ws = WP.weekStart(today()); state.sel = today(); render(); });

  function shiftWeek(n) {
    state.ws = WP.addDays(state.ws, 7 * n);
    state.sel = WP.addDays(state.sel, 7 * n);
    render();
  }
  function shiftDay(n) {
    state.sel = WP.addDays(state.sel, n);
    state.ws = WP.weekStart(state.sel);
    render();
  }

  // Wischen in der Tagesansicht (Handy)
  (function () {
    const area = $('dayList');
    let x0 = null, y0 = null;
    area.addEventListener('touchstart', (e) => { const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
    area.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 50) shiftDay(dx < 0 ? 1 : -1);
    }, { passive: true });
  })();

  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'n' || e.key === '+') { e.preventDefault(); openTask(null); }
    else if (e.key === 'ArrowLeft') shiftWeek(-1);
    else if (e.key === 'ArrowRight') shiftWeek(1);
    else if (e.key === 't' || e.key === 'h') $('todayBtn').click();
  });

  // Höhe der Kopfzeile für die klebende Tageszeile
  function measureTopbar() {
    document.documentElement.style.setProperty('--topbar-h', document.querySelector('.topbar').offsetHeight + 'px');
  }
  window.addEventListener('resize', measureTopbar);

  // Datumswechsel um Mitternacht und „Jetzt“-Linie
  function tick() {
    const t = today();
    if (t !== state.lastToday) {
      if (state.ws === WP.weekStart(state.lastToday)) state.ws = WP.weekStart(t);
      if (state.sel === state.lastToday) state.sel = t;
      state.lastToday = t;
      render();
      return;
    }
    const line = $('nowLine');
    if (line) line.style.left = nowPct() + '%';
  }
  setInterval(tick, 60000);

  // ---------- Start ----------
  render();
  measureTopbar();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  initAuth();

  // nur für Tests und Fehlersuche
  window.__wochenplan = { get doc() { return doc; }, runSync: runSync, sync: sync, syncMeta: syncMeta };
})();
