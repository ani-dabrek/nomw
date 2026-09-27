(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const S = { hour12: localStorage.getItem('nomw-hour12') === '1', watch: { run: false, start: 0, elapsed: 0, laps: [] }, timers: [], zones: [], offset: 0, calcFixed: null, alarms: [], audio: null, zoneTarget: null, entry: '', editId: null };
  const zones = Intl.supportedValuesOf?.('timeZone') || ['America/New_York', 'Europe/London', 'Asia/Kolkata', 'Asia/Tokyo'];
  const pad = n => String(n).padStart(2, '0');
  const now = () => new Date(Date.now() + S.offset);
  const zoneName = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
  const clock = (d, z, o = {}) => new Intl.DateTimeFormat(undefined, { timeZone: z, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: S.hour12, ...o }).format(d);
  const dateLabel = (d, z) => new Intl.DateTimeFormat(undefined, { timeZone: z, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(d);
  const longDate = d => new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(d);
  const inputValue = d => String(d.getFullYear()) + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  const dateKey = d => String(d.getFullYear()) + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const duration = (ms, cs = true) => { ms = Math.max(0, ms); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, c = Math.floor(ms / 10) % 100; return h ? pad(h) + ':' + pad(m) + ':' + pad(s) + (cs ? '.' + pad(c) : '') : pad(m) + ':' + pad(s) + (cs ? '.' + pad(c) : ''); };
  const toast = msg => { const e = $('#toast'); e.textContent = msg; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 1800); };
  const play = kind => { S.audio?.pause(); const a = new Audio(kind === 'alarm' ? 'assets/sounds/alarm.wav' : 'assets/sounds/timer.wav'); S.audio = a; a.play().catch(() => {}); };
  const copy = async value => { try { await navigator.clipboard.writeText(value); toast('Copied'); } catch { toast('Copy unavailable in this browser'); } };

  function setupShell() {
    if (localStorage.getItem('nomw-light') === '1') document.body.classList.add('lightmode');
    const theme = $('#theme-toggle');
    const syncFormat = () => { $('#format-toggle').textContent = S.hour12 ? '12' : '24'; };
    theme.textContent = document.body.classList.contains('lightmode') ? '☀' : '☾';
    theme.onclick = () => { document.body.classList.toggle('lightmode'); localStorage.setItem('nomw-light', document.body.classList.contains('lightmode') ? '1' : '0'); theme.textContent = document.body.classList.contains('lightmode') ? '☀' : '☾'; };
    const toggleFormat = () => { S.hour12 = !S.hour12; localStorage.setItem('nomw-hour12', S.hour12 ? '1' : '0'); syncFormat(); renderAlarms(); };
    $('#format-toggle').onclick = toggleFormat; syncFormat();
    const mobile = $('.mobile-nav'); $$('.nav-links button').forEach(b => mobile.append(b.cloneNode(true)));
    $$('[data-panel]').forEach(b => b.onclick = () => showPanel(b.dataset.panel));
    $('#menu-toggle').onclick = () => { const m = $('#mobile-menu'), open = m.classList.toggle('open'); $('#menu-toggle').setAttribute('aria-expanded', open); };
    $$('.close-modal').forEach(button => button.onclick = () => button.closest('dialog').close());
  }
  function showPanel(id) { $$('.panel').forEach(p => p.classList.toggle('active', p.id === id + '-panel')); $$('[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === id)); $('#mobile-menu').classList.remove('open'); $('#menu-toggle').setAttribute('aria-expanded', 'false'); }
  function updateHeader(d) { const z = zoneName(); $('#header-clock').textContent = clock(d, z); $('#mobile-clock').textContent = clock(d, z); $('#header-date').textContent = dateLabel(d, z); $('#mobile-date').textContent = dateLabel(d, z); }

  const stopwatchValue = () => S.watch.elapsed + (S.watch.run ? performance.now() - S.watch.start : 0);
  function setupStopwatch() {
    $('#stopwatch-start').onclick = () => {
      if (S.watch.run) { S.watch.elapsed = stopwatchValue(); S.watch.run = false; $('#stopwatch-start').textContent = 'Start'; }
      else { S.watch.start = performance.now(); S.watch.run = true; $('#stopwatch-start').textContent = 'Stop'; }
      $('#stopwatch-lap').disabled = !S.watch.run; $('#stopwatch-reset').disabled = !S.watch.elapsed && !S.watch.run;
    };
    $('#stopwatch-lap').onclick = () => { S.watch.laps.unshift(stopwatchValue()); renderLaps(); };
    $('#stopwatch-reset').onclick = () => { S.watch = { run: false, start: 0, elapsed: 0, laps: [] }; $('#stopwatch-display').innerHTML = '00:00<span>.00</span>'; $('#stopwatch-start').textContent = 'Start'; $('#stopwatch-lap').disabled = true; $('#stopwatch-reset').disabled = true; requestAnimationFrame(renderLaps); };
  }
  function renderLaps() { $('#lap-list').innerHTML = S.watch.laps.map(v => '<li>' + duration(v) + '</li>').join(''); }
  function updateStopwatch() { $('#stopwatch-display').innerHTML = duration(stopwatchValue()).replace(/(\.\d+)$/, '<span>$1</span>'); }

  function saveTimers() { sessionStorage.setItem('nomw-timers', JSON.stringify(S.timers)); }
  function setupTimers() {
    try { S.timers = JSON.parse(sessionStorage.getItem('nomw-timers') || '[]'); } catch { S.timers = []; }
    $('#timer-keypad').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'].map(k => '<button type="button" data-key="' + k + '">' + k + '</button>').join('');
    $('#timer-keypad').onclick = e => { const k = e.target.dataset.key; if (!k) return; S.entry = k === '⌫' ? S.entry.slice(0, -1) : (S.entry + k).slice(0, 6); renderTimerEntry(); };
    $$('.preset-row button').forEach(b => b.onclick = () => setTimerEntry(+b.dataset.preset));
    $('#timer-start').onclick = () => createTimer(readTimerEntry());
    $('#timer-add').onclick = () => timerHome(true, true);
    $('#timer-cancel').onclick = () => { S.entry = ''; renderTimerEntry(); timerHome(false); };
    $('#timer-list').onclick = e => { const b = e.target.closest('[data-remove]'); if (b) removeTimer(b.dataset.remove); };
    renderTimerEntry(); timerHome(!S.timers.length); renderTimers();
  }
  function setTimerEntry(seconds) { S.entry = pad(Math.floor(seconds / 3600)) + pad(Math.floor(seconds / 60) % 60) + pad(seconds % 60); renderTimerEntry(); }
  function readTimerEntry() { const v = S.entry.padStart(6, '0'); return +v.slice(0, 2) * 3600 + +v.slice(2, 4) * 60 + +v.slice(4); }
  function renderTimerEntry() { const v = S.entry.padStart(6, '0'); $('#timer-entry').innerHTML = v.slice(0, 2) + 'h <i>:</i> ' + v.slice(2, 4) + 'm <i>:</i> ' + v.slice(4) + 's'; }
  function createTimer(seconds) { if (!seconds || seconds > 86400) return toast(seconds ? 'Maximum timer is 24 hours.' : 'Enter a duration first.'); S.timers.push({ id: crypto.randomUUID(), duration: seconds * 1000, end: Date.now() + seconds * 1000, done: false }); S.entry = ''; renderTimerEntry(); saveTimers(); timerHome(false); renderTimers(); }
  function removeTimer(id) { S.timers = S.timers.filter(t => t.id !== id); saveTimers(); renderTimers(); if (!S.timers.length) timerHome(true); }
  function timerHome(show, adding = false) { $('#timer-empty').hidden = !show; $('#timer-empty').classList.toggle('is-adding', adding); $('#timer-list').hidden = show; $('#timer-add').hidden = show; $('#timer-cancel').hidden = !adding; }
  function renderTimers() { $('#timer-list').innerHTML = S.timers.map(t => { const left = t.done ? 0 : Math.max(0, t.end - Date.now()); return '<article class="timer-card ' + (t.done ? 'expired' : '') + '" style="--progress:' + Math.min(100, left / t.duration * 100) + '%"><p>' + (t.done ? 'TIME IS UP' : 'COUNTING DOWN') + '</p><div class="digital-display time">' + duration(left, false) + '</div><button type="button" data-remove="' + t.id + '" aria-label="Remove timer">⌫</button></article>'; }).join(''); }
  function updateTimers() { let changed = false; S.timers.forEach(t => { if (!t.done && Date.now() >= t.end) { t.done = true; changed = true; play('timer'); toast('Timer complete'); } }); const second = Math.floor(Date.now() / 1000); if (changed) saveTimers(); if (S.timers.length && (changed || second !== lastTimerRender)) { renderTimers(); lastTimerRender = second; } }

  function selectedDays() { return $$('#alarm-days button.selected').map(b => +b.dataset.day); }
  function setDays(days) { $$('#alarm-days button').forEach(b => b.classList.toggle('selected', days.includes(+b.dataset.day))); $('#alarm-select-all').textContent = days.length === 7 ? 'Clear all' : 'Select all'; }
  function saveAlarms() { localStorage.setItem('nomw-alarms', JSON.stringify(S.alarms)); }
  function setupAlarms() {
    try { S.alarms = JSON.parse(localStorage.getItem('nomw-alarms') || '[]'); } catch { S.alarms = []; } renderAlarms();
    $$('#alarm-days button').forEach(b => b.onclick = () => { b.classList.toggle('selected'); setDays(selectedDays()); });
    $('#alarm-select-all').onclick = () => setDays(selectedDays().length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6]);
    $('#add-alarm').onclick = () => openAlarm();
    $('#alarm-list').onclick = e => { const edit = e.target.closest('[data-edit]'), remove = e.target.closest('[data-remove-alarm]'); if (edit) openAlarm(S.alarms.find(a => a.id === edit.dataset.edit)); if (remove) { S.alarms = S.alarms.filter(a => a.id !== remove.dataset.removeAlarm); saveAlarms(); renderAlarms(); } };
    $('#alarm-form').onsubmit = e => {
      e.preventDefault(); const time = $('#alarm-time').value, start = $('#alarm-date').value, days = selectedDays(), today = dateKey(now()), oneDate = start || (days.length ? '' : today);
      if (!time) return; if (start && start < today) return toast('Choose today or a future start date.'); if (!days.length && new Date(oneDate + 'T' + time) <= now()) return toast('Choose a future time.');
      const alarm = { id: S.editId || crypto.randomUUID(), time, startDate: oneDate, days, last: '' };
      S.alarms = S.editId ? S.alarms.map(a => a.id === S.editId ? alarm : a) : [...S.alarms, alarm]; saveAlarms(); renderAlarms(); $('#alarm-dialog').close(); toast(S.editId ? 'Alarm updated' : 'Alarm saved');
    };
  }
  function openAlarm(alarm = null) { S.editId = alarm?.id || null; const d = now(); $('#alarm-dialog-title').textContent = alarm ? 'Edit alarm' : 'Set alarm'; $('#alarm-time').value = alarm?.time || pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); $('#alarm-date').value = alarm?.startDate || ''; setDays(alarm?.days || []); $('#alarm-dialog').showModal(); }
  function renderAlarms() {
    $('#alarm-empty').hidden = !!S.alarms.length;
    $('#alarm-list').innerHTML = S.alarms.map(a => { const parts = a.time.split(':').map(Number), display = S.hour12 ? (parts[0] % 12 || 12) + ':' + pad(parts[1]) + ':' + pad(parts[2] || 0) + ' ' + (parts[0] >= 12 ? 'PM' : 'AM') : a.time; const schedule = a.days.length === 7 ? 'Every day' : a.days.length ? a.days.sort().map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(' · ') + (a.startDate ? ' from ' + longDate(new Date(a.startDate + 'T00:00')) : '') : longDate(new Date(a.startDate + 'T00:00')); return '<article class="alarm-card"><div class="alarm-actions"><button type="button" data-edit="' + a.id + '">Edit</button><button class="delete-alarm" type="button" data-remove-alarm="' + a.id + '" aria-label="Delete alarm">×</button></div><p>' + schedule + '</p><div class="digital-display alarm-time">' + display + '</div></article>'; }).join('');
  }
  function updateAlarms(d) {
    const today = dateKey(d), key = today + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()), day = d.getDay(); let changed = false;
    S.alarms.forEach(a => { const started = !a.startDate || a.startDate <= today, repeat = a.days.length > 0, dueDay = repeat ? a.days.includes(day) : a.startDate === today, alarmTime = a.time.length === 5 ? a.time + ':00' : a.time; if (started && dueDay && alarmTime === key.slice(11) && a.last !== key) { a.last = key; changed = true; play('alarm'); toast('Alarm: ' + alarmTime); if (!repeat) setTimeout(() => { const count = S.alarms.length; S.alarms = S.alarms.filter(x => x.id !== a.id); if (S.alarms.length !== count) { saveAlarms(); renderAlarms(); } }, 7000); } });
    if (changed) saveAlarms();
  }

  function setupWorld() {
    $('#local-zone').textContent = zoneName().replace('_', ' ').toUpperCase(); $('#main-clock-card').onclick = e => { if (e.target.id !== 'adjust-main-clock') openTime(); }; $('#adjust-main-clock').onclick = () => openTime();
    $('#timezone-search').oninput = () => renderZoneChoices($('#timezone-search').value);
    $('#add-fixed-zone').onclick = e => { e.preventDefault(); const v = $('#fixed-offset').value.trim(), m = v.match(/^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/i); if (!m) return toast('Use a value like UTC+05:30.'); S.zones.push({ id: crypto.randomUUID(), name: v.toUpperCase(), offset: (+m[2] * 60 + (+m[3] || 0)) * (m[1] === '-' ? -1 : 1) }); $('#timezone-dialog').close(); renderWorld(); };
    renderZoneChoices(); renderWorld();
  }
  function renderZoneChoices(q = '') { $('#timezone-list').innerHTML = zones.filter(z => z.toLowerCase().includes(q.toLowerCase())).slice(0, 70).map(z => '<button type="button" value="' + z + '">' + z.replace(/_/g, ' ') + '</button>').join(''); $$('#timezone-list button').forEach(b => b.onclick = () => { S.zones.push({ id: crypto.randomUUID(), name: b.value.replace(/_/g, ' '), zone: b.value }); $('#timezone-dialog').close(); renderWorld(); }); }
  function renderWorld() {
    $('#world-grid').innerHTML = S.zones.map(z => '<article class="world-card"><button class="remove-zone" type="button" data-remove-zone="' + z.id + '" aria-label="Remove ' + z.name + '">×</button><p>' + z.name + '</p><div class="digital-display time" data-zone-time="' + z.id + '">—</div><p data-zone-date="' + z.id + '">—</p><button type="button" data-adjust-zone="' + z.id + '">Adjust this time</button></article>').join('') + '<button class="add-world-card" id="add-zone" type="button"><span>+</span>Add a time zone</button>';
    $('#add-zone').onclick = () => { $('#timezone-search').value = ''; renderZoneChoices(); $('#timezone-dialog').showModal(); };
    $$('[data-remove-zone]').forEach(b => b.onclick = () => { S.zones = S.zones.filter(z => z.id !== b.dataset.removeZone); renderWorld(); });
    $$('[data-adjust-zone]').forEach(b => b.onclick = () => openTime(S.zones.find(z => z.id === b.dataset.adjustZone)));
  }
  function zoneMoment(z, d) { return z?.offset === undefined ? d : new Date(d.getTime() + z.offset * 60000); }
  function updateWorld(d) { const local = zoneName(); $('#world-main-time').textContent = clock(d, local); $('#world-main-date').textContent = dateLabel(d, local); S.zones.forEach(z => { const shown = zoneMoment(z, d), tz = z.offset === undefined ? z.zone : 'UTC', t = $('[data-zone-time="' + z.id + '"]'), label = $('[data-zone-date="' + z.id + '"]'); if (t) t.textContent = clock(shown, tz); if (label) label.textContent = dateLabel(shown, tz); }); }
  function zoneInputValue(z, d) {
    if (!z) return inputValue(d);
    if (z.offset !== undefined) { const shown = zoneMoment(z, d); return shown.getUTCFullYear() + '-' + pad(shown.getUTCMonth() + 1) + '-' + pad(shown.getUTCDate()) + 'T' + pad(shown.getUTCHours()) + ':' + pad(shown.getUTCMinutes()) + ':' + pad(shown.getUTCSeconds()); }
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: z.zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
    return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':' + p.second;
  }
  function openTime(z = null) { S.zoneTarget = z; $('#set-time-input').value = zoneInputValue(z, now()); $('#time-dialog').showModal(); }
  function setupTimeDialog() { $('#save-time').onclick = e => { e.preventDefault(); const target = new Date($('#set-time-input').value); if (isNaN(target)) return; S.offset += target - new Date(zoneInputValue(S.zoneTarget, now())); $('#time-dialog').close(); toast('Reference time updated'); }; $('#reset-time').onclick = e => { e.preventDefault(); S.offset = 0; S.calcFixed = null; $('#time-dialog').close(); toast('Live time restored'); }; }

  function setupUnix() {
    const value = inputValue(now()); $('#unix-date-input').value = value; $('#discord-date-input').value = value; $('#unix-now').onclick = () => copy($('#unix-now').textContent); $('#unix-result').onclick = () => { if ($('#unix-result').textContent !== '—') copy($('#unix-result').textContent); };
    $('#unix-convert-form').onsubmit = e => { e.preventDefault(); $('#unix-result').textContent = Math.floor(new Date($('#unix-date-input').value) / 1000); };
    $('#unix-reverse-form').onsubmit = e => { e.preventDefault(); const d = new Date(+$('#unix-number-input').value * 1000); $('#unix-reverse-result').textContent = isNaN(d) ? 'Enter a valid timestamp.' : longDate(d) + ', ' + clock(d); };
    $('#discord-date-input').oninput = renderDiscord; $('#discord-formats').onclick = e => { const b = e.target.closest('[data-discord]'); if (b) copy(b.dataset.discord); }; renderDiscord();
  }
  function updateUnix(d) { $('#unix-now').textContent = Math.floor(d / 1000); $('#unix-now-readable').textContent = dateLabel(d) + ' · ' + clock(d); }
  function renderDiscord() {
    const d = $('#discord-date-input').value ? new Date($('#discord-date-input').value) : now(), stamp = Math.floor(d / 1000), time = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).format(d).toLowerCase(), seconds = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(d).toLowerCase(), full = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d), short = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(d), numeric = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
    const forms = [['F', full + ' at ' + time], ['f', short + ' at ' + time], ['D', short], ['d', numeric], ['t', time], ['T', seconds], ['R', '0 seconds ago'], ['s', numeric + ', ' + time], ['S', numeric + ', ' + seconds]];
    $('#discord-formats').innerHTML = forms.map(x => { const code = '<t:' + stamp + ':' + x[0] + '>'; return '<button type="button" class="discord-format" data-discord="' + code + '"><code>' + code.replace(/</g, '&lt;') + '</code>' + x[1] + '</button>'; }).join('');
  }

  function setupCalculator() {
    const value = inputValue(now()); $('#diff-start').value = value; $('#diff-end').value = value; $('#longitude-date').value = value; $('#calc-clock').onclick = () => openTime(); let dir = 1;
    $('#time-math-form').onclick = e => { const b = e.target.closest('[data-direction]'); if (b) dir = +b.dataset.direction; };
    $('#time-math-form').onsubmit = e => { e.preventDefault(); const amount = (+$('#time-amount').value || 0) * dir, unit = $('#time-unit').value, d = new Date(S.calcFixed || now()), map = { milliseconds: 'Milliseconds', seconds: 'Seconds', minutes: 'Minutes', hours: 'Hours', days: 'Date', months: 'Month', years: 'FullYear' }; if (unit === 'weeks') d.setDate(d.getDate() + amount * 7); else if (unit === 'decades') d.setFullYear(d.getFullYear() + amount * 10); else if (unit === 'centuries') d.setFullYear(d.getFullYear() + amount * 100); else d['set' + map[unit]](d['get' + map[unit]]() + amount); S.calcFixed = d; toast((dir === 1 ? 'Added ' : 'Subtracted ') + Math.abs(amount) + ' ' + unit); };
    $('#difference-form').onsubmit = e => { e.preventDefault(); const ms = Math.abs(new Date($('#diff-end').value) - new Date($('#diff-start').value)); if (isNaN(ms)) return; const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; $('#difference-result').textContent = [d && d + ' days', h && h + ' hours', m && m + ' minutes', s && s + ' seconds'].filter(Boolean).join(', ') || '0 seconds'; };
    $('#longitude-form').onsubmit = e => { e.preventDefault(); const d = new Date($('#longitude-date').value), x = Math.max(-180, Math.min(180, +$('#longitude-value').value || 0)), r = new Date(+d + x * 240000); $('#longitude-result').textContent = (x >= 0 ? 'East ' : 'West ') + Math.abs(x) + '° → ' + r.toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  }
  function updateCalculator(d) { const value = S.calcFixed || d; $('#calc-clock-time').textContent = clock(value); $('#calc-clock-date').textContent = dateLabel(value); }
  let lastSecond = -1, lastTimer = 0, lastTimerRender = -1, lastAlarmSecond = '';
  function tick() { const real = Date.now(), d = now(), sec = Math.floor(real / 1000), alarmSecond = dateKey(d) + '-' + d.getHours() + '-' + d.getMinutes() + '-' + d.getSeconds(); if (S.watch.run || sec !== lastSecond) updateStopwatch(); if (sec !== lastSecond) { updateHeader(d); updateWorld(d); updateUnix(d); updateCalculator(d); lastSecond = sec; } if (real - lastTimer >= 100) { updateTimers(); lastTimer = real; } if (alarmSecond !== lastAlarmSecond) { updateAlarms(d); lastAlarmSecond = alarmSecond; } requestAnimationFrame(tick); }
  setupShell(); setupStopwatch(); setupTimers(); setupAlarms(); setupWorld(); setupTimeDialog(); setupUnix(); setupCalculator(); requestAnimationFrame(tick);
})();
