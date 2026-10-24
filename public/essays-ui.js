/* Ceteris mini-essays: the student's essay screens and the instructor's Essays tab.
   Loaded before the main script, which calls window.CeterisEssays(helpers) once its
   own helpers exist. */
window.CeterisEssays = function (C) {
  'use strict';
  const { api, escapeHtml, renderMarkdown, store, STUDENT_KEY, state, root } = C;

  const GRACE_MS = 90 * 1000; // the server still accepts autosaves this long after the end time
  const PEN = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M13.6 3.2a1.9 1.9 0 0 1 2.7 2.7L7.2 15l-3.6.9.9-3.6 9.1-9.1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 4.8 15.2 8" stroke="currentColor" stroke-width="1.6"/></svg>';
  const TICK = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.5 6.3 5 8.6l4.5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const LOCK_BIG = '<svg width="28" height="28" viewBox="0 0 12 12" fill="none" aria-hidden="true"><rect x="2" y="5.2" width="8" height="5.8" rx="1.2" fill="currentColor"/><path d="M3.8 5.2V3.8a2.2 2.2 0 0 1 4.4 0v1.4" stroke="currentColor" stroke-width="1.1"/></svg>';
  const DONE = '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="#FDB736"/><path d="M4.8 8.3 7 10.4l4.2-4.6" stroke="#112E51" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fmtClock = d => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const fmtWhen = d => new Date(d).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  function fmtLeft(ms) {
    if (ms >= 36 * 3600 * 1000) { // a take-home due days from now
      const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000);
      return `${d}d ${h}h`;
    }
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  }
  // Same rules as the server, so the word counts agree.
  function htmlToText(html) {
    return String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h\d)>/gi, '\n')
      .replace(/<(p|div|li|h\d)(\s[^>]*)?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .trim();
  }
  const countWords = t => { t = String(t || '').trim(); return t ? t.split(/\s+/).length : 0; };
  const DRAFT_TAGS = { ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'p', 'div', 'br'], ALLOWED_ATTR: [] };
  const cleanDraft = html => window.DOMPurify ? DOMPurify.sanitize(String(html || ''), DRAFT_TAGS) : escapeHtml(htmlToText(html));
  const planList = (stages, plan) => `<dl class="plan-list">${stages.map(s => {
    const v = String((plan || {})[s.key] || '').trim();
    return `<dt>${escapeHtml(s.title)}</dt><dd${v ? '' : ' class="empty"'}>${v ? escapeHtml(v) : 'No notes'}</dd>`;
  }).join('')}</dl>`;

  let toastTimer = null;
  function toast(msg) {
    let t = document.getElementById('ess-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'ess-toast'; t.className = 'ess-toast'; t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }

  // Live countdowns: every element with data-closes (a time in ms on the server's clock)
  // shows the time left, updated each second while any is on screen.
  let skew = 0, cdTimer = null;
  function startCountdowns(serverTime) {
    if (serverTime) skew = new Date(serverTime).getTime() - Date.now();
    const tick = () => {
      const els = document.querySelectorAll('[data-closes]');
      if (!els.length) { clearInterval(cdTimer); cdTimer = null; return; }
      els.forEach(el => {
        const left = +el.dataset.closes - (Date.now() + skew);
        el.textContent = left > 0 ? fmtLeft(left) + (el.dataset.cd === 'bare' ? '' : ' left') : (el.dataset.cd === 'bare' ? '0:00' : 'time’s up');
        el.classList.toggle('cd-warn', left > 60000 && left <= 5 * 60000);
        el.classList.toggle('cd-urgent', left <= 60000);
      });
    };
    tick();
    if (!cdTimer) cdTimer = setInterval(tick, 1000);
  }

  // ===================================================================================
  // Student: entry points on the tutoring screen

  async function loadStudentHome(bannerEl, cardEl) {
    let data;
    try { data = await api('/api/essays/student', { token: store.get(STUDENT_KEY) }); }
    catch (e) { if (e.status === 401) C.logoutStudent(); return; }
    if (!bannerEl || !bannerEl.isConnected) return;
    const open = data.open.filter(e => e.workStatus !== 'submitted');
    bannerEl.innerHTML = open.map(e => `
      <div class="essay-banner">
        <span class="eb-icon">${PEN}</span>
        <span class="eb-text">${e.mode === 'takehome'
          ? (e.workStatus
            ? `<strong>Take-home essay in progress:</strong> ${escapeHtml(e.title)}`
            : `<strong>Take-home essay:</strong> ${escapeHtml(e.title)} · due ${escapeHtml(fmtWhen(e.dueAt))} · ${e.durationMinutes} minutes once you start`)
          : `<strong>In-class essay open now:</strong> ${escapeHtml(e.title)} · until ${escapeHtml(fmtClock(e.closesAt))}`}</span>
        <span class="eb-left" role="timer" data-closes="${new Date(e.closesAt).getTime()}"></span>
        <button class="eb-btn" data-essay="${e.id}">${e.workStatus ? 'Continue' : 'Start'}</button>
      </div>`).join('');
    bannerEl.hidden = !open.length;
    cardEl.innerHTML = data.past.length ? `
      <div class="panel-card essays-card">
        <div class="panel-head"><div class="panel-title">Your essays</div></div>
        <div class="panel-body">${data.past.map(p => `
          <div class="ess-row">
            <div><div class="ess-title">${escapeHtml(p.title)}</div>
              <div class="ess-meta">${p.autoSubmitted ? 'Submitted when time ran out' : p.submittedAt ? 'Submitted ' + escapeHtml(fmtWhen(p.submittedAt)) : 'Closed'}</div></div>
            <button class="link-btn plain" data-essay="${p.id}">View</button>
          </div>`).join('')}
        </div>
      </div>` : '';
    [bannerEl, cardEl].forEach(el => el.querySelectorAll('[data-essay]').forEach(b => { b.onclick = () => openEssay(+b.dataset.essay); }));
    if (open.length) startCountdowns(data.serverTime);
  }

  function openEssay(id) { state.essayId = id; C.go('student-essay'); }

  // ===================================================================================
  // Student: the essay screen

  function essayShell() {
    root.innerHTML = `
      <header class="topbar">
        <div class="brand">Ceteris</div>
        <div class="topbar-right">${C.themeSwitch()}<button class="link-btn" id="essay-back">Back to Ceteris</button></div>
      </header>
      <main class="essay-wrap" id="essay-main"><div class="essay-loading">Loading your essay…</div></main>`;
    C.bindThemeSwitches();
    document.getElementById('essay-back').onclick = () => C.go('student-chat');
    return document.getElementById('essay-main');
  }

  async function renderStudentEssay() {
    const main = essayShell();
    let data;
    try { data = await api(`/api/essays/${state.essayId}/student`, { token: store.get(STUDENT_KEY) }); }
    catch (e) {
      if (e.status === 401) return C.logoutStudent();
      main.innerHTML = `<div class="essay-narrow"><div class="box"><p>${escapeHtml(e.message)}</p><button class="role-btn primary" id="er-home">Back to Ceteris</button></div></div>`;
      document.getElementById('er-home').onclick = () => C.go('student-chat');
      return;
    }
    if (state.view !== 'student-essay' || !main.isConnected) return;
    const offset = new Date(data.serverTime).getTime() - Date.now();
    const closesAt = new Date(data.essay.closesAt).getTime();
    if (!data.work) return renderIntro(main, data);
    if (data.work.status === 'submitted') return renderReadOnly(main, data);
    if (Date.now() + offset >= closesAt) {
      // Time is up and the server will mark it submitted shortly; check back then.
      renderReadOnly(main, data, true);
      const wait = Math.max(5000, closesAt + GRACE_MS + 3000 - (Date.now() + offset));
      const t = setTimeout(() => { if (state.view === 'student-essay') C.go('student-essay'); }, wait);
      C.setCleanup(() => clearTimeout(t));
      return;
    }
    renderWriting(main, data, offset);
  }

  function renderIntro(main, data) {
    const e = data.essay;
    const takehome = e.mode === 'takehome', limit = e.durationMinutes || 20;
    const minsToDue = Math.floor((new Date(e.dueAt || e.closesAt) - new Date(data.serverTime)) / 60000);
    const short = takehome && minsToDue < limit;
    const who = data.instructorName && data.instructorName !== 'Your instructor' ? data.instructorName : 'Your instructor';
    main.innerHTML = `
      <div class="essay-narrow">
        <div class="panel-card">
          <div class="panel-head"><div class="panel-title">${escapeHtml(e.title)}</div></div>
          <div class="panel-body">
            ${takehome
              ? `<div class="ei-clock"><span class="ei-clock-label">Time limit</span><span class="ei-clock-val">${limit}:00</span><span class="ei-clock-end">Due ${escapeHtml(fmtWhen(e.dueAt))}. Your ${limit} minutes start when you click Start, and you get one attempt.${short ? ` <strong>Only ${minsToDue} minutes are left before the due time, so that’s all you’ll get.</strong>` : ''}</span></div>`
              : `<div class="ei-clock"><span class="ei-clock-label">Time left</span><span class="ei-clock-val" role="timer" data-cd="bare" data-closes="${new Date(e.closesAt).getTime()}"></span><span class="ei-clock-end">Ends at ${escapeHtml(fmtClock(e.closesAt))}. The timer stays on screen while you write.</span></div>`}
            <div class="md ei-prompt">${renderMarkdown(e.prompt)}</div>
            <h3>Before you start</h3>
            <ul class="ei-rules">
              <li>You'll plan in ${e.stages.length} short step${e.stages.length === 1 ? '' : 's'}, then write, then check your essay. Writing opens once every planning step has notes. Aim for ${e.targetWords.min}–${e.targetWords.max} words.</li>
              ${e.coachEnabled
                ? '<li>A writing coach is here to help. It asks questions and points to weak spots in your reasoning, but it won’t write any of your essay for you.</li>'
                : '<li>The coach is turned off for this essay, so this one is all you.</li>'}
              <li>Paste is turned off, except that you can copy text from your own plan notes into your essay. Everything else should be typed by you.</li>
              <li>${escapeHtml(who)} will see your plan, your essay, how your draft developed over time (including what you pasted from your plan)${e.coachEnabled ? ', and your conversation with the coach' : ''}.</li>
              ${takehome
                ? `<li><strong>One attempt, ${limit} minutes.</strong> Once you click Start, the clock runs even if you close the page; you can’t pause or start over. Make sure you have ${limit} quiet minutes first.</li>
                   <li>Your work saves as you type. Whatever you’ve written is submitted automatically when your time is up${short ? '' : ' (or at the due time, if that comes first)'}.</li>`
                : `<li>Your work saves as you type. Whatever you’ve written is submitted automatically at ${escapeHtml(fmtClock(e.closesAt))}.</li>`}
              <li>${takehome ? 'If something goes wrong (your device dies or the connection drops), tell your instructor right away.' : 'If your device dies, finish on paper and hand it in.'}</li>
            </ul>
            <div class="ei-actions"><button class="role-btn primary" id="ei-start">${takehome ? `Start my ${short ? minsToDue : limit}-minute essay` : 'Start the essay'}</button></div>
            <div class="ew-error" id="ei-err" hidden></div>
          </div>
        </div>
      </div>`;
    startCountdowns(data.serverTime);
    const btn = document.getElementById('ei-start');
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await api(`/api/essays/${e.id}/start`, { method: 'POST', token: store.get(STUDENT_KEY) });
        C.go('student-essay');
      } catch (err) {
        if (err.status === 401) return C.logoutStudent();
        const box = document.getElementById('ei-err');
        box.textContent = err.message; box.hidden = false; btn.disabled = false;
      }
    };
  }

  function renderReadOnly(main, data, pending) {
    const e = data.essay, w = data.work;
    const html = cleanDraft(w.draftHtml);
    const words = countWords(htmlToText(html));
    const status = pending
      ? 'Time is up. Your work is saved and is being submitted automatically.'
      : w.autoSubmitted ? `Submitted automatically when time ran out (${fmtWhen(w.submittedAt)}).`
      : `Submitted ${fmtWhen(w.submittedAt)}.`;
    main.innerHTML = `
      <div class="essay-narrow">
        <div class="panel-card">
          <div class="panel-head"><div class="panel-title">${escapeHtml(e.title)}</div></div>
          <div class="panel-body">
            <div class="er-status" role="status">${DONE}<span>${escapeHtml(status)}</span></div>
            <h3>Prompt</h3>
            <div class="md ei-prompt">${renderMarkdown(e.prompt)}</div>
            <h3>Your plan</h3>
            ${planList(e.stages, w.plan)}
            <h3>Your essay<span class="wc-tag">${words} word${words === 1 ? '' : 's'}</span></h3>
            <div class="essay-text">${html}</div>
            <div class="ei-actions" style="margin-top:22px"><button class="role-btn primary" id="er-home">Back to Ceteris</button></div>
          </div>
        </div>
      </div>`;
    document.getElementById('er-home').onclick = () => C.go('student-chat');
  }

  function renderWriting(main, data, offset) {
    const token = store.get(STUDENT_KEY);
    const essay = data.essay, id = essay.id;
    const now = () => Date.now() + offset;
    const opensAt = new Date(essay.opensAt).getTime();
    const closesAt = new Date(essay.closesAt).getTime();
    const stages = essay.stages;
    const steps = stages.map(s => ({ key: s.key, title: s.title, minutes: s.minutes, kind: 'plan', stage: s }))
      .concat([{ key: 'draft', title: 'Draft', minutes: essay.draftMinutes, kind: 'draft' },
               { key: 'check', title: 'Check', minutes: essay.checkMinutes, kind: 'check' }]);
    const DRAFT = stages.length, CHECK = stages.length + 1;

    const plan = {};
    stages.forEach(s => { plan[s.key] = String((data.work.plan || {})[s.key] || ''); });
    let draftHtml = cleanDraft(data.work.draftHtml);
    const coach = (data.work.coach || []).slice();
    const ticks = new Set();
    let coachBusy = false, coachNote = null, coachUnread = false;
    let confirming = false, submitErr = null, ending = false;

    const planDone = k => !!String(plan[k] || '').trim();
    const planComplete = () => stages.every(s => planDone(s.key));
    const draftWords = () => countWords(htmlToText(draftHtml));
    const draftUnlocked = () => planComplete() || draftWords() > 0;
    let current = draftWords() ? DRAFT : Math.max(0, stages.findIndex(s => !planDone(s.key)));
    if (stages.every(s => planDone(s.key)) && !draftWords()) current = DRAFT;

    main.innerHTML = `
      <div class="ew-status">
        <div class="ew-title">${escapeHtml(essay.title)}</div>
        <div class="ew-meta">
          <span class="ew-suggest" id="ew-suggest"></span>
          <span class="ew-save" id="ew-save" aria-live="polite"></span>
          <span class="ew-timer" id="ew-timer"><span class="ewt-label">Time left</span><span class="ewt-val" id="ew-timer-val" role="timer"></span></span>
        </div>
        <div class="ew-progress" aria-hidden="true">${steps.map(s => `<span class="ewp-seg" style="flex:${Math.max(s.minutes || 0, 0.5)}" title="${escapeHtml(s.title)}"></span>`).join('')}<span class="ewp-fill" id="ew-progress-fill"></span></div>
      </div>
      ${essay.coachEnabled ? `<div class="ew-tabs" role="tablist" aria-label="Show">
        <button role="tab" data-pane="write" class="active" aria-selected="true">Write</button>
        <button role="tab" data-pane="coach" aria-selected="false">Coach<span class="dot" hidden></span></button>
      </div>` : ''}
      <div class="ew-grid${essay.coachEnabled ? '' : ' no-coach'}" id="ew-grid" data-pane="write">
        <section class="ew-write" aria-label="Your essay">
          <details class="ew-prompt" open><summary>Prompt</summary><div class="md">${renderMarkdown(essay.prompt)}</div></details>
          <nav class="ew-steps" id="ew-steps" aria-label="Steps"></nav>
          <div class="ew-stage" id="ew-stage"></div>
        </section>
        ${essay.coachEnabled ? `<aside class="ew-coach" aria-label="Writing coach">
          <div class="ec-head"><span class="avatar" aria-hidden="true">C</span><div><div class="ec-title">Coach</div><div class="ec-sub">Asks questions. Never writes for you.</div></div></div>
          <div class="ec-scroll" id="ec-scroll" role="log" aria-live="polite"></div>
          <div class="ec-quick" id="ec-quick"></div>
          <form class="composer ec-composer" id="ec-form">
            <label for="ec-input" class="sr-only">Ask the coach</label>
            <textarea id="ec-input" rows="1" placeholder="Ask the coach…"></textarea>
            <button class="send-btn" id="ec-send" type="submit" aria-label="Send">${C.icons.SEND}</button>
          </form>
        </aside>` : ''}
      </div>`;

    const grid = document.getElementById('ew-grid');
    const stepsEl = document.getElementById('ew-steps');
    const stageEl = document.getElementById('ew-stage');
    const timerEl = document.getElementById('ew-timer');
    const suggestEl = document.getElementById('ew-suggest');
    const saveEl = document.getElementById('ew-save');

    // ---- Paste and drop are off everywhere on this screen, with one exception: text copied
    // from the student's own plan notes can be pasted into the draft (as plain text). ----
    const squash = t => String(t || '').replace(/\s+/g, ' ').trim();
    const pendingPastes = [];
    const noPaste = e => { e.preventDefault(); toast('Paste is off for these essays. You can paste only text copied from one of your own plan notes into your essay.'); };
    main.addEventListener('paste', e => {
      const ed = document.getElementById('ew-editor');
      const text = squash(e.clipboardData && e.clipboardData.getData('text/plain'));
      const fromPlan = text && stages.some(s => squash(plan[s.key]).includes(text));
      if (!ed || ending || !ed.contains(e.target) || !fromPlan) return noPaste(e);
      e.preventDefault();
      document.execCommand('insertText', false, text);
      pendingPastes.push({ text });
      draftHtml = ed.innerHTML;
      markDirty();
    }, true);
    main.addEventListener('drop', noPaste, true);
    main.addEventListener('dragover', e => e.preventDefault(), true);
    main.addEventListener('beforeinput', e => {
      if (/^insertFrom(Paste|Drop|Yank|PasteAsQuotation)/.test(e.inputType || '')) noPaste(e);
    }, true);

    // ---- Autosave ----
    let dirty = false, inflight = null, again = false, saveErr = null, lastSaved = null, debounce = null;
    function setSaveStatus() {
      let txt, err = false;
      if (saveErr === 'offline') { txt = 'Offline · will keep trying'; err = true; }
      else if (saveErr) { txt = saveErr; err = true; }
      else if (dirty || inflight) txt = 'Saving…';
      else if (lastSaved) txt = 'Saved ' + fmtClock(lastSaved);
      else txt = 'Saves as you type';
      saveEl.textContent = txt;
      saveEl.classList.toggle('err', err);
    }
    function markDirty() {
      dirty = true; setSaveStatus();
      clearTimeout(debounce);
      debounce = setTimeout(() => save(), 1500);
    }
    function save(keepalive) {
      if (inflight) { again = true; return inflight; }
      if (!dirty) return Promise.resolve();
      inflight = doSave(keepalive).finally(() => {
        inflight = null;
        setSaveStatus();
        if (again) { again = false; if (dirty && !saveErr) save(); }
      });
      return inflight;
    }
    async function doSave(keepalive) {
      dirty = false;
      const sending = pendingPastes.splice(0);
      const body = JSON.stringify({ plan, draftHtml: cleanDraft(draftHtml), pastes: sending });
      try {
        const res = await fetch(`/api/essays/${id}/work`, {
          method: 'PUT', keepalive: !!keepalive, body,
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }
        });
        let out = {};
        try { out = await res.json(); } catch (e) {}
        if (res.ok) { lastSaved = new Date(); saveErr = null; return; }
        if (res.status === 401) { teardown(); C.logoutStudent(); return; }
        if (res.status === 409) { closedByServer(); return; }
        saveErr = out.error || 'Not saved. Retrying…';
        dirty = true; pendingPastes.unshift(...sending);
      } catch (e) {
        saveErr = 'offline'; dirty = true; pendingPastes.unshift(...sending);
      }
    }
    async function flush() {
      clearTimeout(debounce);
      if (inflight) await inflight;
      if (dirty) await save();
    }
    const retryTimer = setInterval(() => { if (dirty && !inflight) save(); }, 10000);
    const onHide = () => { if (document.visibilityState === 'hidden' && dirty) save(true); };
    const onUnload = e => { if (dirty || inflight) { save(true); e.preventDefault(); e.returnValue = ''; } };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    const onOnline = () => { if (dirty) save(); };
    window.addEventListener('online', onOnline);

    // ---- Steps ----
    function suggestedIndex() {
      const elapsed = (now() - opensAt) / 60000;
      let acc = 0;
      for (let i = 0; i < steps.length; i++) { acc += steps[i].minutes || 0; if (elapsed < acc) return i; }
      return steps.length - 1;
    }
    function renderSteps() {
      const sug = suggestedIndex();
      stepsEl.innerHTML = steps.map((s, i) => {
        const done = s.kind === 'plan' ? planDone(s.key) : s.kind === 'draft' ? draftWords() > 0 : false;
        const locked = s.kind !== 'plan' && !draftUnlocked();
        const label = `${s.title}${done ? ', done' : ''}${locked ? ', locked until your plan is complete' : ''}${i === sug ? ', suggested now' : ''}`;
        return `<button class="ew-step${done ? ' done' : ''}${locked ? ' locked' : ''}${i === current ? ' current' : ''}" data-step="${i}" ${i === current ? 'aria-current="step"' : ''} aria-label="${escapeHtml(label)}">
          <span class="es-num">${done ? TICK : locked ? C.icons.LOCK : i + 1}</span><span>${escapeHtml(s.title)}</span>${i === sug ? '<span class="es-now" aria-hidden="true">now</span>' : ''}</button>`;
      }).join('');
      stepsEl.querySelectorAll('[data-step]').forEach(b => { b.onclick = () => goStep(+b.dataset.step); });
    }
    function goStep(i) {
      current = i; confirming = false; submitErr = null;
      renderSteps(); renderStage();
      if (stepsEl.getBoundingClientRect().top < 120) stepsEl.scrollIntoView({ block: 'start' });
      const h = stageEl.querySelector('h2');
      if (h) h.focus({ preventScroll: true });
    }
    function navHtml() {
      const prev = current > 0 ? `<button class="link-btn plain" id="ew-prev">← ${escapeHtml(steps[current - 1].title)}</button>` : '<span></span>';
      const nx = steps[current + 1];
      return `<div class="ew-nav">${prev}${nx ? `<button class="role-btn primary" id="ew-next">Next: ${escapeHtml(nx.title)}</button>` : ''}</div>`;
    }
    function bindNav() {
      const p = document.getElementById('ew-prev'), n = document.getElementById('ew-next');
      if (p) p.onclick = () => goStep(current - 1);
      if (n) n.onclick = () => goStep(current + 1);
    }
    function lockedHtml(title) {
      const missing = stages.map((s, i) => ({ s, i })).filter(x => !planDone(x.s.key));
      return `<div class="ew-kicker">${escapeHtml(title)}</div><h2 tabindex="-1">${title === 'Check' ? 'Check and submit' : 'Write your essay'}</h2>
        <div class="ew-locked">${LOCK_BIG}<p>Writing opens once every planning step has notes.</p>
        <p>Still empty: ${missing.map(x => `<button class="link-btn plain" data-jump="${x.i}">${escapeHtml(x.s.title)}</button>`).join(', ')}</p></div>`;
    }
    function bindJumps() { stageEl.querySelectorAll('[data-jump]').forEach(b => { b.onclick = () => goStep(+b.dataset.jump); }); }

    function renderStage() {
      const s = steps[current];
      if (s.kind === 'plan') renderPlanStage(s);
      else if (!draftUnlocked()) { stageEl.innerHTML = lockedHtml(s.title); bindJumps(); }
      else if (s.kind === 'draft') renderDraftStage();
      else renderCheckStage();
      renderQuick();
    }

    function renderPlanStage(s) {
      stageEl.innerHTML = `
        <div class="ew-kicker">Plan · step ${current + 1} of ${stages.length}${s.minutes ? ` · about ${s.minutes} min` : ''}</div>
        <h2 tabindex="-1">${escapeHtml(s.title)}</h2>
        ${s.stage.task ? `<p class="ew-task">${escapeHtml(s.stage.task)}</p>` : ''}
        ${s.stage.question ? `<p class="ew-question"><span class="eq-label">Think about</span>${escapeHtml(s.stage.question)}</p>` : ''}
        <label for="ew-plan" class="sr-only">Your notes for ${escapeHtml(s.title)}</label>
        <textarea class="ew-plan" id="ew-plan" rows="5" spellcheck="true" placeholder="Your notes, in your own words. Short phrases are fine."></textarea>
        ${navHtml()}`;
      const ta = document.getElementById('ew-plan');
      ta.value = plan[s.key];
      ta.readOnly = ending;
      ta.oninput = () => {
        const was = planDone(s.key);
        plan[s.key] = ta.value;
        markDirty();
        if (was !== planDone(s.key)) renderSteps();
      };
      bindNav();
    }

    function renderDraftStage() {
      stageEl.innerHTML = `
        <div class="ew-kicker">Draft${essay.draftMinutes ? ` · about ${essay.draftMinutes} min` : ''}</div>
        <h2 tabindex="-1">Write your essay</h2>
        <details class="ew-planref" open><summary>Your plan</summary>${planList(stages, plan)}</details>
        <div class="ew-editor-wrap">
          <div class="ew-toolbar" role="toolbar" aria-label="Formatting">
            <button type="button" data-cmd="bold" aria-label="Bold" aria-pressed="false" title="Bold"><b>B</b></button>
            <button type="button" data-cmd="italic" aria-label="Italic" aria-pressed="false" title="Italic"><i>I</i></button>
            <button type="button" data-cmd="underline" aria-label="Underline" aria-pressed="false" title="Underline"><u>U</u></button>
          </div>
          <div class="ew-editor" id="ew-editor" contenteditable="${ending ? 'false' : 'true'}" role="textbox" aria-multiline="true" aria-label="Your essay" spellcheck="true" data-placeholder="Write your essay here, with your plan above as a guide."></div>
          <div class="ew-wc" id="ew-wc" aria-live="off"></div>
        </div>
        ${navHtml()}`;
      const ed = document.getElementById('ew-editor');
      ed.innerHTML = draftHtml;
      try { document.execCommand('defaultParagraphSeparator', false, 'p'); document.execCommand('styleWithCSS', false, false); } catch (e) {}
      const syncEmpty = () => ed.classList.toggle('is-empty', !htmlToText(ed.innerHTML));
      ed.oninput = () => {
        const had = draftWords() > 0;
        draftHtml = ed.innerHTML;
        syncEmpty(); markDirty(); updateWc();
        if (had !== draftWords() > 0) renderSteps();
      };
      stageEl.querySelectorAll('[data-cmd]').forEach(b => {
        b.onmousedown = e => e.preventDefault(); // keep the selection in the editor
        b.onclick = () => {
          if (ending) return;
          ed.focus();
          document.execCommand(b.dataset.cmd);
          draftHtml = ed.innerHTML; markDirty(); updateToolbar();
        };
      });
      ed.addEventListener('keyup', updateToolbar);
      ed.addEventListener('mouseup', updateToolbar);
      ed.addEventListener('focus', updateToolbar);
      syncEmpty(); updateWc();
      bindNav();
    }
    function updateToolbar() {
      document.querySelectorAll('.ew-toolbar [data-cmd]').forEach(b => {
        let on = false;
        try { on = document.queryCommandState(b.dataset.cmd); } catch (e) {}
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    function updateWc() {
      const el = document.getElementById('ew-wc');
      if (!el) return;
      const n = draftWords(), { min, max } = essay.targetWords;
      const pct = min ? Math.min(100, Math.round(n / min * 100)) : 100;
      el.innerHTML = `<span><strong>${n}</strong> word${n === 1 ? '' : 's'}</span><span class="ew-wc-bar" aria-hidden="true"><span class="ew-wc-fill" style="width:${pct}%"></span></span><span>aim for ${min}–${max}${n > max ? ' · a little long; tighten if you can' : ''}</span>`;
    }

    function renderCheckStage() {
      const n = draftWords();
      stageEl.innerHTML = `
        <div class="ew-kicker">Check${essay.checkMinutes ? ` · about ${essay.checkMinutes} min` : ''}</div>
        <h2 tabindex="-1">Check and submit</h2>
        ${essay.rubric.length ? `<p class="ew-task">Reread your essay with each of these in mind. Tick the ones you’ve covered; the ticks are only for you.</p>
        <ul class="ew-rubric">${essay.rubric.map((r, i) => `<li><label><input type="checkbox" data-tick="${i}"${ticks.has(i) ? ' checked' : ''}><span>${escapeHtml(r.criterion)}${r.weight > 1 ? `<span class="ew-weight">${r.weight === 2 ? 'counts double' : `counts ×${r.weight}`}</span>` : ''}</span></label></li>`).join('')}</ul>` : ''}
        <div class="ew-preview-head"><span>Your essay <span class="mono">${n} word${n === 1 ? '' : 's'} · aim for ${essay.targetWords.min}–${essay.targetWords.max}</span></span><button class="link-btn plain" id="ew-edit">Edit</button></div>
        <div class="ew-preview">${draftHtml.trim() ? cleanDraft(draftHtml) : '<p class="muted">Nothing written yet.</p>'}</div>
        <div id="ew-submit-area"></div>`;
      stageEl.querySelectorAll('[data-tick]').forEach(c => { c.onchange = () => { c.checked ? ticks.add(+c.dataset.tick) : ticks.delete(+c.dataset.tick); }; });
      document.getElementById('ew-edit').onclick = () => goStep(DRAFT);
      renderSubmitArea();
    }
    function renderSubmitArea() {
      const area = document.getElementById('ew-submit-area');
      if (!area) return;
      const n = draftWords(), { min, max } = essay.targetWords;
      area.innerHTML = (confirming
        ? `<div class="ew-confirm" role="group" aria-labelledby="ewc-q">
             <span id="ewc-q"><strong>Submit now?</strong> You won’t be able to edit it afterward.${n < min ? ` (Your essay is ${n} words; the target is ${min}–${max}.)` : ''}</span>
             <span class="ew-confirm-btns"><button class="role-btn" id="ew-cancel">Keep writing</button><button class="role-btn primary" id="ew-yes">Yes, submit</button></span>
           </div>`
        : `<div class="ew-nav"><button class="link-btn plain" id="ew-prev">← Draft</button><button class="role-btn primary" id="ew-submit">Submit essay</button></div>`)
        + (submitErr ? `<div class="ew-error" role="alert">${escapeHtml(submitErr)}</div>` : '');
      const p = document.getElementById('ew-prev'); if (p) p.onclick = () => goStep(DRAFT);
      const s = document.getElementById('ew-submit'); if (s) s.onclick = () => { confirming = true; submitErr = null; renderSubmitArea(); document.getElementById('ew-yes').focus(); };
      const c = document.getElementById('ew-cancel'); if (c) c.onclick = () => { confirming = false; renderSubmitArea(); };
      const y = document.getElementById('ew-yes'); if (y) y.onclick = submit;
    }
    async function submit() {
      const y = document.getElementById('ew-yes');
      if (y) { y.disabled = true; y.textContent = 'Submitting…'; }
      await flush();
      if (dirty || saveErr) {
        submitErr = 'Your latest changes haven’t saved yet, so the essay wasn’t submitted. Check your connection and try again.';
        renderSubmitArea(); return;
      }
      try {
        await api(`/api/essays/${id}/submit`, { method: 'POST', token });
      } catch (e) {
        if (e.status === 401) return C.logoutStudent();
        if (e.status === 409) return closedByServer();
        submitErr = e.message; renderSubmitArea(); return;
      }
      dirty = false;
      C.go('student-essay'); // shows the read-only copy
    }

    // ---- Coach ----
    function quickActions() {
      const s = steps[current];
      if (s.kind === 'plan') return ['Can you check my notes for this step?', 'I’m stuck on this step.'];
      if (!draftUnlocked()) return [];
      if (s.kind === 'draft') return ['What’s the weakest link in my argument?', 'Is my draft on track?', 'I’m stuck. What should I explain next?'];
      return ['What should I fix first?', 'Does my essay answer the question?'];
    }
    function renderQuick() {
      const q = document.getElementById('ec-quick');
      if (!q) return;
      const items = quickActions();
      q.innerHTML = items.map(t => `<button class="ec-chip" type="button"${coachBusy || ending ? ' disabled' : ''}>${escapeHtml(t)}</button>`).join('');
      q.hidden = !items.length;
      q.querySelectorAll('.ec-chip').forEach(b => { b.onclick = () => askCoach(b.textContent); });
    }
    function wordingBox(w) {
      return `<div class="ec-wording" aria-label="Example phrasing">
        <div class="ecw-label">Example phrasing · the only one for this essay</div>
        ${w.original ? `<div class="ecw-orig">Your sentence: “${escapeHtml(w.original)}”</div>` : ''}
        <div class="ecw-text">${escapeHtml(w.suggestion)}</div>
        <div class="ecw-note">Now rewrite your sentence in your own words. This box can’t be copied.</div>
      </div>`;
    }
    function renderCoach() {
      const sc = document.getElementById('ec-scroll');
      if (!sc) return;
      sc.innerHTML = (coach.length ? '' : '<p class="ec-empty">Stuck, or want a second look? Ask about the step you’re on. The coach answers with questions and points to gaps in your reasoning; it won’t write sentences for you.</p>')
        + coach.map(m => m.role === 'student'
          ? `<div class="ec-user"><div class="bubble">${escapeHtml(m.content)}</div></div>`
          : `<div class="ec-coach"><span class="avatar" aria-hidden="true">C</span><div><div class="md">${renderMarkdown(m.content)}</div>${m.wording ? wordingBox(m.wording) : ''}</div></div>`).join('')
        + (coachBusy ? '<div class="ec-coach"><span class="avatar" aria-hidden="true">C</span><div class="ec-thinking"><span class="typing" aria-hidden="true"><span></span><span></span><span></span></span>thinking…</div></div>' : '')
        + (coachNote ? `<div class="ec-note" role="alert">${escapeHtml(coachNote)}</div>` : '');
      sc.querySelectorAll('.ec-wording').forEach(w => ['copy', 'cut', 'contextmenu', 'dragstart', 'selectstart'].forEach(ev => w.addEventListener(ev, e => e.preventDefault())));
      sc.scrollTop = sc.scrollHeight;
      document.getElementById('ec-send').disabled = coachBusy || ending;
      renderQuick();
    }
    async function askCoach(text) {
      text = String(text || '').trim();
      if (!text || coachBusy || ending) return;
      const input = document.getElementById('ec-input');
      input.value = ''; autoGrow();
      coachNote = null;
      coach.push({ role: 'student', content: text });
      coachBusy = true; renderCoach();
      await flush(); // the coach reads the saved plan and draft
      // The server already retries a busy API; if it is still busy, wait and try twice more
      // while the student keeps seeing "thinking…".
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await api(`/api/essays/${id}/coach`, { method: 'POST', token, body: { message: text, stage: steps[current].key } });
          coach.push({ role: 'coach', content: r.reply, wording: r.wording || null });
          if (grid.dataset.pane === 'write' && window.matchMedia('(max-width: 900px)').matches) coachUnread = true;
          break;
        } catch (e) {
          if (e.status === 401) { teardown(); return C.logoutStudent(); }
          if (e.status === 409) { coachBusy = false; return closedByServer(); }
          if (e.status === 503 && attempt < 2) { await sleep(4000 * (attempt + 1)); if (!stageEl.isConnected) return; continue; }
          coach.pop();
          if (!input.value) { input.value = text; autoGrow(); }
          coachNote = e.status === 503 ? 'The coach is busy helping many students. Your question is back in the box; send it again in a moment.' : e.message;
          break;
        }
      }
      coachBusy = false;
      if (!stageEl.isConnected) return;
      renderCoach(); updateTabs();
    }
    function autoGrow() {
      const input = document.getElementById('ec-input');
      if (!input) return;
      input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    }
    if (essay.coachEnabled) {
      const input = document.getElementById('ec-input');
      document.getElementById('ec-form').onsubmit = e => { e.preventDefault(); askCoach(input.value); };
      input.addEventListener('input', autoGrow);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); askCoach(input.value); }
      });
    }

    // ---- Write | Coach switch on narrow screens ----
    const tabs = Array.from(document.querySelectorAll('.ew-tabs [data-pane]'));
    function updateTabs() {
      tabs.forEach(b => {
        const on = b.dataset.pane === grid.dataset.pane;
        b.classList.toggle('active', on); b.setAttribute('aria-selected', on);
      });
      const dot = document.querySelector('.ew-tabs .dot');
      if (dot) dot.hidden = !coachUnread;
    }
    tabs.forEach(b => {
      b.onclick = () => {
        grid.dataset.pane = b.dataset.pane;
        if (b.dataset.pane === 'coach') {
          coachUnread = false;
          const sc = document.getElementById('ec-scroll'); if (sc) sc.scrollTop = sc.scrollHeight;
        }
        updateTabs();
      };
    });

    // ---- Clock ----
    let lastSug = -1;
    const left0 = closesAt - now();
    let warned5 = left0 <= 5 * 60000, warned1 = left0 <= 60000;
    function tick() {
      const left = closesAt - now();
      document.getElementById('ew-timer-val').textContent = left > 0 ? fmtLeft(left) : '0:00';
      const fill = document.getElementById('ew-progress-fill');
      if (fill) fill.style.width = Math.min(100, Math.max(0, (now() - opensAt) / (closesAt - opensAt) * 100)) + '%';
      timerEl.className = 'ew-timer' + (left <= 60000 ? ' urgent' : left <= 5 * 60000 ? ' warn' : '');
      if (!warned5 && left <= 5 * 60000) { warned5 = true; toast('5 minutes left. Start wrapping up.'); }
      if (!warned1 && left <= 60000) { warned1 = true; toast('1 minute left. Whatever you’ve written will be submitted automatically.'); }
      const sug = suggestedIndex();
      if (sug !== lastSug) {
        lastSug = sug;
        suggestEl.innerHTML = `Suggested now: <strong>${escapeHtml(steps[sug].title)}</strong>`;
        renderSteps();
      }
      if (left <= 0) timeUp();
    }
    const clock = setInterval(tick, 1000);

    async function timeUp() {
      if (ending) return;
      ending = true;
      clearInterval(clock);
      document.querySelectorAll('#ew-editor').forEach(ed => { ed.contentEditable = 'false'; });
      document.querySelectorAll('.ew-plan, #ec-input').forEach(t => { t.readOnly = true; });
      toast('Time’s up. Saving your work…');
      await flush();
      if (state.view === 'student-essay') C.go('student-essay');
    }
    function closedByServer() {
      if (ending) return;
      ending = true; dirty = false;
      if (state.view === 'student-essay') C.go('student-essay');
    }

    function teardown() {
      clearInterval(clock); clearInterval(retryTimer); clearTimeout(debounce);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('online', onOnline);
      if (dirty && !ending) save(true); // leaving the screen: one last save
    }
    C.setCleanup(teardown);

    renderSteps(); renderStage(); renderCoach(); setSaveStatus(); tick();
  }

  // ===================================================================================
  // Instructor: Essays tab

  const iapi = C.iapi;
  let iTimer = null;
  const stopITimer = () => { if (iTimer) { clearInterval(iTimer); iTimer = null; } };
  const dashBody = () => document.getElementById('dash-body');
  const stageName = (essay, key) => key === 'draft' ? 'Draft' : key === 'check' ? 'Check'
    : ((essay.config.stages.find(s => s.key === key) || {}).title || '');
  const ago = ms => {
    const m = Math.round(ms / 60000);
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : fmtClock(Date.now() - ms);
  };

  // One section's session: { cls, label }.
  function statusInfo(row, nowMs) {
    if (!row || !row.opensAt) return { cls: 'unscheduled', label: 'No time set' };
    const o = new Date(row.opensAt).getTime(), c = new Date(row.closesAt).getTime();
    if (row.mode === 'takehome') {
      const lim = `${row.durationMinutes || 20} min`;
      if (nowMs < o) return { cls: 'scheduled', label: `Take-home · ${lim} · from ${fmtWhen(o)}, due ${fmtWhen(c)}` };
      if (nowMs < c) return { cls: 'open', label: `Take-home open · ${lim} · due ${fmtWhen(c)}` };
      return { cls: 'closed', label: `Take-home closed · was due ${fmtWhen(c)}` };
    }
    if (nowMs < o) return { cls: 'scheduled', label: `${fmtWhen(o)}–${fmtClock(c)}` };
    if (nowMs < c) return { cls: 'open', label: `Open now · until ${fmtClock(c)}` };
    return { cls: 'closed', label: `Closed · ${fmtWhen(o)}` };
  }
  // One pill per section that gets the essay.
  function schedulePills(e, nowMs) {
    if (!e.schedule.length) return `<span class="es-pill es-unscheduled">Not assigned to a section</span>`;
    return e.schedule.map(row => {
      const st = statusInfo(row, nowMs);
      return `<span class="es-sched"><span class="es-sec">${escapeHtml(row.sectionName)}</span><span class="es-pill es-${st.cls}">${escapeHtml(st.label)}</span></span>`;
    }).join('');
  }
  const mySections = () => (state.me && state.me.sections) || [];

  // ---- List ----
  async function renderInstructorEssays(flash) {
    stopITimer();
    C.setCleanup(stopITimer);
    const body = dashBody();
    body.innerHTML = '<div class="empty-state">Loading essays…</div>';
    let d;
    try { d = await iapi('/api/essays'); }
    catch (e) { body.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }
    if (!body.isConnected) return;
    const nowMs = new Date(d.serverTime).getTime();
    body.innerHTML = `
      <div class="dash-controls">
        <button class="role-btn primary es-new" id="es-new">New essay</button>
        <span class="dash-note">${flash ? escapeHtml(flash) : 'In-class mini-essays with the writing coach. Students see an essay only while it’s open.'}</span>
      </div>
      ${d.essays.length ? `<ul class="essay-list">${d.essays.map(e => {
        const c = e.config;
        return `<li class="es-item">
          <div class="es-main">
            <button class="es-title" data-subs="${e.id}">${escapeHtml(e.title)}</button>
            <div class="es-scheds">${schedulePills(e, nowMs)}</div>
            <div class="es-meta"><span>${c.stages.length} stage${c.stages.length === 1 ? '' : 's'} · ${c.targetWords.min}–${c.targetWords.max} words · coach ${e.coachEnabled ? 'on' : 'off'}${e.otherSections ? ` · also used in ${e.otherSections} section${e.otherSections === 1 ? '' : 's'} you don’t teach` : ''}</span></div>
          </div>
          <div class="es-counts">${e.schedule.some(x => x.opensAt) || e.started
            ? `<strong>${e.submitted}</strong> of ${e.students} submitted${e.started - e.submitted ? `<br>${e.started - e.submitted} still writing` : ''}`
            : `<span class="muted">${e.schedule.length ? 'Set a time to open it' : 'Pick sections and times'}</span>`}</div>
          <div class="es-actions">
            <button class="link-btn plain" data-subs="${e.id}">Submissions</button>
            <button class="link-btn plain" data-edit="${e.id}">Edit</button>
            <button class="link-btn plain" data-dup="${e.id}">Duplicate</button>
            ${e.hasWork || e.otherSections ? '' : `<button class="remove-btn" data-del="${e.id}">Delete</button>`}
          </div>
        </li>`;
      }).join('')}</ul>` : '<div class="empty-state">No essays yet. Click New essay to set one up.</div>'}`;
    document.getElementById('es-new').onclick = () => renderEssayForm(null);
    body.querySelectorAll('[data-subs]').forEach(b => { b.onclick = () => renderSubmissions(+b.dataset.subs); });
    body.querySelectorAll('[data-edit]').forEach(b => { b.onclick = () => renderEssayForm(+b.dataset.edit); });
    body.querySelectorAll('[data-dup]').forEach(b => {
      b.onclick = async () => {
        b.disabled = true;
        try { const r = await iapi(`/api/essays/${b.dataset.dup}/duplicate`, { method: 'POST' }); renderEssayForm(r.essay.id, 'Copy made. Pick sections and times, adjust anything you like, and save.'); }
        catch (e) { b.disabled = false; }
      };
    });
    body.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = async () => {
        if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'Confirm delete'; return; }
        b.disabled = true;
        try { await iapi(`/api/essays/${b.dataset.del}`, { method: 'DELETE' }); renderInstructorEssays('Essay deleted.'); }
        catch (e) { renderInstructorEssays(e.message); }
      };
    });
  }

  // ---- Setup form ----
  function blankEssay() {
    return {
      title: '', prompt: '', brief: '', coachEnabled: true, schedule: [],
      config: {
        stages: [{ key: '', title: 'Claim', minutes: 2, task: '', question: '' }],
        draftMinutes: 7, checkMinutes: 2, targetWords: { min: 250, max: 400 },
        rubric: [{ criterion: '', weight: 1, high: '', low: '' }], bonus: null
      }
    };
  }

  async function renderEssayForm(id, flash) {
    stopITimer();
    const body = dashBody();
    let m = blankEssay(), started = 0;
    if (id) {
      body.innerHTML = '<div class="empty-state">Loading…</div>';
      try {
        m = (await iapi(`/api/essays/${id}`)).essay;
        const list = await iapi('/api/essays');
        started = ((list.essays.find(e => e.id === id)) || {}).started || 0;
      } catch (e) { body.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }
    }
    m = JSON.parse(JSON.stringify(m));
    const c = m.config;
    if (!c.bonus) c.bonus = { points: 0, description: '' };
    if (!c.rubric.length) c.rubric.push({ criterion: '', weight: 1, high: '', low: '' });
    const toDate = d => d ? new Date(d).toLocaleDateString('en-CA') : '';
    const toTime = d => d ? new Date(d).toTimeString().slice(0, 5) : '';

    body.innerHTML = `
      <button class="link-btn plain back-link" id="ef-back">← All essays</button>
      <form class="essay-form" id="ef" novalidate>
        <div class="box">
          <h2>${id ? 'Edit essay' : 'New essay'}</h2>
          ${flash ? `<p class="ef-note">${escapeHtml(flash)}</p>` : ''}
          ${started ? `<p class="ef-warn">${started} student${started === 1 ? ' has' : 's have'} already started this essay. Changes apply right away. Renaming or rewording a stage keeps their notes; removing a stage drops its notes from what the coach sees.</p>` : ''}
          <label class="ef-label" for="ef-title">Title</label>
          <input class="ef-input" id="ef-title" maxlength="200">
          <label class="ef-label" for="ef-prompt">Prompt <span class="ef-hint">Students see this exactly as written.</span></label>
          <textarea class="ef-input" id="ef-prompt" rows="5"></textarea>
        </div>
        <div class="box">
          <h2>Sections and session times</h2>
          <p class="help">Tick each section that gets this essay and set its class time (your computer’s time zone). Students in that section can open the essay only during their section’s time, and whatever they’ve written is submitted automatically at its end. Leave the time empty to prepare ahead.</p>
          <div id="ef-sched"></div>
          <p class="ef-timing" id="ef-timing"></p>
          <div class="share-row ef-switch-row">
            <span class="share-label" id="ef-coach-label">Writing coach</span>
            <button type="button" class="switch" id="ef-coach" role="switch" aria-checked="true" aria-labelledby="ef-coach-label"><span class="knob"></span></button>
          </div>
          <p class="share-help" id="ef-coach-help"></p>
        </div>
        <div class="box">
          <h2>Planning stages</h2>
          <p class="help">Students write notes for each stage before drafting unlocks. The task and guiding question appear on their screen, and the coach uses them too. Up to six stages.</p>
          <div id="ef-stages"></div>
          <button type="button" class="link-btn plain ef-add" id="ef-add-stage">+ Add a stage</button>
          <div class="ef-row ef-row-tight">
            <div><label class="ef-label" for="ef-draft">Drafting (min)</label><input type="number" min="0" max="120" class="ef-input ef-num" id="ef-draft"></div>
            <div><label class="ef-label" for="ef-check">Checking (min)</label><input type="number" min="0" max="60" class="ef-input ef-num" id="ef-check"></div>
            <div><label class="ef-label" for="ef-min">Target words, from</label><input type="number" min="0" max="5000" class="ef-input ef-num" id="ef-min"></div>
            <div><label class="ef-label" for="ef-max">to</label><input type="number" min="0" max="5000" class="ef-input ef-num" id="ef-max"></div>
          </div>
        </div>
        <div class="box">
          <h2>Rubric</h2>
          <p class="help">Students see only the criterion names and weights, so the descriptions can’t give the answer away. The coach reads all of it.</p>
          <div id="ef-rubric"></div>
          <button type="button" class="link-btn plain ef-add" id="ef-add-crit">+ Add a criterion</button>
          <div class="ef-bonus">
            <div class="ef-label ef-label-head">Bonus <span class="ef-hint">Optional. Never shown to students, and the coach never prompts for it.</span></div>
            <div class="ef-row ef-row-bonus">
              <div><label class="ef-label" for="ef-bonus-pts">Points</label><input type="number" min="0" max="20" class="ef-input ef-num" id="ef-bonus-pts"></div>
              <div class="grow"><label class="ef-label" for="ef-bonus-desc">What earns it</label><textarea class="ef-input" id="ef-bonus-desc" rows="2"></textarea></div>
            </div>
          </div>
        </div>
        <div class="box">
          <h2>Private brief for the coach</h2>
          <p class="help">Only the coach reads this: the logic you expect, what sets the size of the effect, and weak spots to probe. It never quotes or reveals it to students.</p>
          <label for="ef-brief" class="sr-only">Private brief</label>
          <textarea class="ef-input" id="ef-brief" rows="10"></textarea>
        </div>
        <div class="form-error" id="ef-err" hidden></div>
        <div class="ef-actions">
          <button type="submit" class="role-btn primary" id="ef-save">Save essay</button>
          <button type="button" class="role-btn" id="ef-cancel">Cancel</button>
        </div>
      </form>`;

    const $ = s => document.getElementById(s);
    $('ef-title').value = m.title; $('ef-prompt').value = m.prompt; $('ef-brief').value = m.brief || '';
    $('ef-draft').value = c.draftMinutes; $('ef-check').value = c.checkMinutes;
    $('ef-min').value = c.targetWords.min; $('ef-max').value = c.targetWords.max;
    $('ef-bonus-pts').value = c.bonus.points || ''; $('ef-bonus-desc').value = c.bonus.description || '';
    let coachOn = m.coachEnabled !== false;
    const syncCoach = () => {
      $('ef-coach').setAttribute('aria-checked', coachOn);
      $('ef-coach-help').textContent = coachOn
        ? 'On: students can ask the coach questions while they plan, draft and check. It never writes for them, and you can read every conversation.'
        : 'Off: students plan, draft and check on their own.';
    };
    $('ef-coach').onclick = () => { coachOn = !coachOn; syncCoach(); };
    syncCoach();
    $('ef-back').onclick = $('ef-cancel').onclick = () => renderInstructorEssays();
    ['ef-draft', 'ef-check'].forEach(k => { $(k).addEventListener('input', updateTiming); });

    // One row per section you teach: a checkbox, In class or Take-home, then the times.
    const secs = mySections();
    const sched = new Map((m.schedule || []).map(x => [x.sectionId, x]));
    const toLocal = d => d ? `${toDate(d)}T${toTime(d)}` : '';
    $('ef-sched').innerHTML = secs.length ? secs.map(sec => {
      const row = sched.get(sec.id);
      const th = row && row.mode === 'takehome';
      return `<div class="sched-row${row ? ' on' : ''}${th ? ' takehome' : ''}" data-sec="${sec.id}">
        <div class="sched-top">
          <label class="sched-check"><input type="checkbox" data-on${row ? ' checked' : ''}> <span>${escapeHtml(sec.name)}</span></label>
          <label class="sched-mode"><span class="sr-only">Format for ${escapeHtml(sec.name)}</span>
            <select class="select" data-mode><option value="class"${th ? '' : ' selected'}>In class</option><option value="takehome"${th ? ' selected' : ''}>Take-home (timed)</option></select></label>
        </div>
        <div class="sched-times sched-class">
          <label><span class="sr-only">Date for ${escapeHtml(sec.name)}</span><input type="date" class="ef-input" data-date value="${row && !th ? toDate(row.opensAt) : ''}"></label>
          <label><span class="sched-lbl">from</span><input type="time" class="ef-input" data-start value="${row && !th ? toTime(row.opensAt) : ''}" aria-label="Start time for ${escapeHtml(sec.name)}"></label>
          <label><span class="sched-lbl">to</span><input type="time" class="ef-input" data-end value="${row && !th ? toTime(row.closesAt) : ''}" aria-label="End time for ${escapeHtml(sec.name)}"></label>
          <button type="button" class="link-btn plain" data-clear>Clear time</button>
        </div>
        <div class="sched-times sched-take">
          <label><span class="sched-lbl">available from</span><input type="datetime-local" class="ef-input" data-from value="${th ? toLocal(row.opensAt) : ''}" aria-label="Available from, ${escapeHtml(sec.name)}"></label>
          <label><span class="sched-lbl">due</span><input type="datetime-local" class="ef-input" data-due value="${th ? toLocal(row.closesAt) : ''}" aria-label="Due, ${escapeHtml(sec.name)}"></label>
          <label><span class="sched-lbl">time limit</span><input type="number" min="5" max="240" class="ef-input ef-num sched-mins" data-mins value="${th && row.durationMinutes ? row.durationMinutes : 20}" aria-label="Time limit in minutes, ${escapeHtml(sec.name)}"><span class="sched-lbl">min</span></label>
          <button type="button" class="link-btn plain" data-clear>Clear time</button>
        </div>
        <div class="sched-note" data-note></div>
      </div>`;
    }).join('') : '<p class="ef-warn">You don’t have any sections yet. Create one in <strong>Sections &amp; students</strong>; you can save this essay now and assign it later.</p>';
    $('ef-sched').querySelectorAll('.sched-row').forEach(r => {
      const on = r.querySelector('[data-on]');
      on.onchange = () => { r.classList.toggle('on', on.checked); updateTiming(); };
      r.querySelector('[data-mode]').onchange = e => { r.classList.toggle('takehome', e.target.value === 'takehome'); if (!on.checked) { on.checked = true; r.classList.add('on'); } updateTiming(); };
      r.querySelectorAll('.sched-times input').forEach(inp => inp.addEventListener('input', () => {
        if (!on.checked) { on.checked = true; r.classList.add('on'); }
        updateTiming();
      }));
      r.querySelectorAll('[data-clear]').forEach(b => { b.onclick = () => { r.querySelectorAll('.sched-times input:not([data-mins])').forEach(x => { x.value = ''; }); updateTiming(); }; });
    });

    function updateTiming() {
      const total = c.stages.reduce((a, s) => a + (+s.minutes || 0), 0) + (+$('ef-draft').value || 0) + (+$('ef-check').value || 0);
      $('ef-timing').textContent = `Planning, drafting and checking add up to ${total} minutes.`;
      $('ef-sched').querySelectorAll('.sched-row').forEach(r => {
        const note = r.querySelector('[data-note]');
        let len = 0, empty;
        if (r.classList.contains('takehome')) {
          len = +r.querySelector('[data-mins]').value || 0;
          empty = !r.querySelector('[data-due]').value;
          note.textContent = !r.classList.contains('on') ? '' : empty ? 'No due time yet: hidden from students until you set one'
            : `Each student gets one ${len}-minute attempt, any time before it’s due${total > len ? '; shorter than the stage times, so students will be nudged along faster' : ''}`;
        } else {
          const st = r.querySelector('[data-start]').value, en = r.querySelector('[data-end]').value;
          len = st && en ? (new Date(`2000-01-01T${en}`) - new Date(`2000-01-01T${st}`)) / 60000 : 0;
          empty = !st && !en;
          note.textContent = !r.classList.contains('on') ? '' : len > 0 ? `${len}-minute class session${total > len ? ': shorter than the stage times, so students will be nudged along faster' : ''}` : (empty ? 'No time yet: hidden from students until you set one' : '');
        }
        note.classList.toggle('warn', r.classList.contains('on') && len > 0 && total > len);
      });
    }

    function renderStages() {
      const box = $('ef-stages');
      box.innerHTML = c.stages.map((s, i) => `
        <fieldset class="ef-stage" data-i="${i}">
          <legend>Stage ${i + 1}</legend>
          <div class="ef-row">
            <div class="grow"><label class="ef-label" for="st-title-${i}">Title</label><input class="ef-input" id="st-title-${i}" data-f="title" maxlength="80"></div>
            <div><label class="ef-label" for="st-min-${i}">Minutes</label><input type="number" min="0" max="60" class="ef-input ef-num" id="st-min-${i}" data-f="minutes"></div>
            <div class="ef-row-btn">
              <button type="button" class="remove-btn" data-move="-1"${i === 0 ? ' disabled' : ''} aria-label="Move stage ${i + 1} up">↑</button>
              <button type="button" class="remove-btn" data-move="1"${i === c.stages.length - 1 ? ' disabled' : ''} aria-label="Move stage ${i + 1} down">↓</button>
              <button type="button" class="remove-btn" data-remove${c.stages.length === 1 ? ' disabled' : ''}>Remove</button>
            </div>
          </div>
          <label class="ef-label" for="st-task-${i}">Task</label><input class="ef-input" id="st-task-${i}" data-f="task" maxlength="500">
          <label class="ef-label" for="st-q-${i}">Guiding question</label><input class="ef-input" id="st-q-${i}" data-f="question" maxlength="500">
        </fieldset>`).join('');
      box.querySelectorAll('.ef-stage').forEach(fs => {
        const i = +fs.dataset.i, s = c.stages[i];
        fs.querySelectorAll('[data-f]').forEach(inp => {
          inp.value = s[inp.dataset.f] == null ? '' : s[inp.dataset.f];
          inp.oninput = () => { s[inp.dataset.f] = inp.value; if (inp.dataset.f === 'minutes') updateTiming(); };
        });
        fs.querySelectorAll('[data-move]').forEach(b => {
          b.onclick = () => { const j = i + +b.dataset.move; [c.stages[i], c.stages[j]] = [c.stages[j], c.stages[i]]; renderStages(); };
        });
        fs.querySelector('[data-remove]').onclick = () => { c.stages.splice(i, 1); renderStages(); updateTiming(); };
      });
      $('ef-add-stage').hidden = c.stages.length >= 6;
    }
    $('ef-add-stage').onclick = () => {
      c.stages.push({ key: '', title: '', minutes: 2, task: '', question: '' });
      renderStages(); updateTiming();
      $(`st-title-${c.stages.length - 1}`).focus();
    };

    const WEIGHTS = [0.5, 1, 1.5, 2, 3];
    function renderRubric() {
      const box = $('ef-rubric');
      box.innerHTML = c.rubric.map((r, i) => `
        <fieldset class="ef-stage" data-i="${i}">
          <legend>Criterion ${i + 1}</legend>
          <div class="ef-row">
            <div class="grow"><label class="ef-label" for="rb-c-${i}">Criterion</label><input class="ef-input" id="rb-c-${i}" data-f="criterion" maxlength="120"></div>
            <div><label class="ef-label" for="rb-w-${i}">Weight</label><select class="ef-input" id="rb-w-${i}" data-f="weight">${WEIGHTS.map(w => `<option value="${w}"${+r.weight === w ? ' selected' : ''}>${w === 1 ? '×1' : w === 2 ? '×2 (double)' : '×' + w}</option>`).join('')}</select></div>
            <div class="ef-row-btn"><button type="button" class="remove-btn" data-remove>Remove</button></div>
          </div>
          <label class="ef-label" for="rb-h-${i}">A strong answer</label><textarea class="ef-input" id="rb-h-${i}" data-f="high" rows="2" maxlength="500"></textarea>
          <label class="ef-label" for="rb-l-${i}">A weak answer</label><textarea class="ef-input" id="rb-l-${i}" data-f="low" rows="2" maxlength="500"></textarea>
        </fieldset>`).join('');
      box.querySelectorAll('.ef-stage').forEach(fs => {
        const i = +fs.dataset.i, r = c.rubric[i];
        fs.querySelectorAll('[data-f]').forEach(inp => {
          if (inp.tagName !== 'SELECT') inp.value = r[inp.dataset.f] || '';
          const upd = () => { r[inp.dataset.f] = inp.dataset.f === 'weight' ? +inp.value : inp.value; };
          inp.oninput = upd; inp.onchange = upd;
        });
        fs.querySelector('[data-remove]').onclick = () => { c.rubric.splice(i, 1); renderRubric(); };
      });
      $('ef-add-crit').hidden = c.rubric.length >= 10;
    }
    $('ef-add-crit').onclick = () => {
      c.rubric.push({ criterion: '', weight: 1, high: '', low: '' });
      renderRubric(); $(`rb-c-${c.rubric.length - 1}`).focus();
    };

    renderStages(); renderRubric(); updateTiming();

    $('ef').onsubmit = async ev => {
      ev.preventDefault();
      const err = $('ef-err');
      const showErr = msg => { err.textContent = msg; err.hidden = false; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
      err.hidden = true;
      const schedule = [];
      for (const r of $('ef-sched').querySelectorAll('.sched-row.on')) {
        const name = r.querySelector('.sched-check span').textContent;
        let opensAt = null, closesAt = null, mode = 'class', durationMinutes = null;
        if (r.classList.contains('takehome')) {
          mode = 'takehome';
          const from = r.querySelector('[data-from]').value, due = r.querySelector('[data-due]').value;
          durationMinutes = +r.querySelector('[data-mins]').value || 20;
          if (durationMinutes < 5 || durationMinutes > 240) return showErr(`${name}: the time limit must be between 5 and 240 minutes.`);
          if (from || due) {
            if (!due) return showErr(`${name}: set a due time, or click Clear time.`);
            closesAt = new Date(due);
            opensAt = from ? new Date(from) : new Date();
            if (!(closesAt > opensAt)) return showErr(`${name}: the due time must be after the time it becomes available.`);
          }
        } else {
          const date = r.querySelector('[data-date]').value, st = r.querySelector('[data-start]').value, en = r.querySelector('[data-end]').value;
          if (date || st || en) {
            if (!(date && st && en)) return showErr(`${name}: set a date, a start time and an end time, or click Clear time.`);
            opensAt = new Date(`${date}T${st}`); closesAt = new Date(`${date}T${en}`);
            if (!(closesAt > opensAt)) return showErr(`${name}: the end time must be after the start time.`);
          }
        }
        schedule.push({ sectionId: +r.dataset.sec, mode, durationMinutes, opensAt: opensAt && opensAt.toISOString(), closesAt: closesAt && closesAt.toISOString() });
      }
      const pts = +$('ef-bonus-pts').value || 0, bdesc = $('ef-bonus-desc').value.trim();
      const payload = {
        title: $('ef-title').value, prompt: $('ef-prompt').value, brief: $('ef-brief').value, coachEnabled: coachOn,
        schedule,
        config: {
          stages: c.stages.map(s => ({ key: s.key || '', title: s.title, minutes: +s.minutes || 0, task: s.task || '', question: s.question || '' })),
          draftMinutes: +$('ef-draft').value || 0, checkMinutes: +$('ef-check').value || 0,
          targetWords: { min: +$('ef-min').value || 0, max: +$('ef-max').value || 0 },
          rubric: c.rubric.filter(r => String(r.criterion || '').trim()).map(r => ({ criterion: r.criterion, weight: +r.weight || 1, high: r.high || '', low: r.low || '' })),
          bonus: pts > 0 && bdesc ? { points: pts, description: bdesc } : null
        }
      };
      if (pts > 0 && !bdesc) return showErr('Describe what earns the bonus, or set its points to 0.');
      const btn = $('ef-save'); btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const r = await iapi(id ? `/api/essays/${id}` : '/api/essays', { method: id ? 'PUT' : 'POST', body: payload });
        const timed = r.essay.schedule.filter(x => x.opensAt).length;
        renderInstructorEssays(`Saved “${r.essay.title}”. ${!r.essay.schedule.length ? 'It isn’t assigned to a section yet.' : timed ? `Scheduled for ${timed} section${timed === 1 ? '' : 's'}.` : 'It stays hidden from students until you set a time.'}`);
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Save essay';
        showErr(e.message);
      }
    };
  }

  // ---- Submissions ----
  const STATUS = {
    not_started: ['Not started', 'st-none'], writing: ['Writing', 'st-writing'],
    submitted: ['Submitted', 'st-done'], auto_submitted: ['Submitted at end', 'st-auto']
  };

  let subSection = 'all';
  async function renderSubmissions(id, keepSection) {
    stopITimer();
    if (!keepSection) subSection = 'all';
    const body = dashBody();
    body.innerHTML = `<button class="link-btn plain back-link" id="es-back">← All essays</button><div id="sub-wrap"><div class="empty-state">Loading submissions…</div></div>`;
    document.getElementById('es-back').onclick = () => renderInstructorEssays();
    let live = false;
    async function load() {
      let d;
      try { d = await iapi(`/api/essays/${id}/submissions${subSection !== 'all' ? `?section=${subSection}` : ''}`); }
      catch (e) { const w = document.getElementById('sub-wrap'); if (w) w.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }
      const wrap = document.getElementById('sub-wrap');
      if (!wrap) return stopITimer();
      const nowMs = new Date(d.serverTime).getTime(), skew = nowMs - Date.now();
      const e = d.essay;
      const shown = e.schedule.filter(x => subSection === 'all' || String(x.sectionId) === String(subSection));
      live = shown.some(x => x.opensAt && new Date(x.opensAt).getTime() <= nowMs && nowMs - new Date(x.closesAt).getTime() < 3 * 60000);
      const multi = e.schedule.length > 1;
      const n = k => d.rows.filter(r => k.includes(r.status)).length;
      const order = d.rows.filter(r => r.status !== 'not_started').map(r => r.studentId);
      wrap.innerHTML = `
        <div class="box sub-head">
          <div class="sub-title-row"><h2>${escapeHtml(e.title)}</h2>
            ${multi ? `<label class="sr-only" for="sub-sec">Section</label><select id="sub-sec" class="select section-select"><option value="all">All my sections</option>${e.schedule.map(x => `<option value="${x.sectionId}"${String(x.sectionId) === String(subSection) ? ' selected' : ''}>${escapeHtml(x.sectionName)}</option>`).join('')}</select>` : ''}</div>
          <div class="es-scheds sub-scheds">${shown.length ? shown.map(x => { const st = statusInfo(x, nowMs); return `<span class="es-sched"><span class="es-sec">${escapeHtml(x.sectionName)}</span><span class="es-pill es-${st.cls}">${escapeHtml(st.label)}</span>${st.cls === 'open' ? `<span class="sub-left" role="timer" data-closes="${new Date(x.closesAt).getTime()}"></span>` : ''}</span>`; }).join('') : '<span class="es-pill es-unscheduled">Not assigned to any of your sections</span>'}</div>
          <div class="stats sub-stats">
            <div class="stat"><div class="stat-num">${n(['submitted', 'auto_submitted'])}</div><div class="stat-label">submitted</div></div>
            <div class="stat"><div class="stat-num">${n(['writing'])}</div><div class="stat-label">still writing</div></div>
            <div class="stat"><div class="stat-num">${n(['not_started'])}</div><div class="stat-label">not started</div></div>
          </div>
          <div class="sub-tools">
            <button class="link-btn plain" id="sub-refresh">Refresh</button>
            <span class="dash-note">${live ? 'Updates every 20 seconds while the essay is open.' : 'Updated ' + escapeHtml(fmtClock(Date.now()))}</span>
            <button class="link-btn plain" id="sub-edit">Edit essay</button>
          </div>
        </div>
        ${d.rows.length ? `<div class="table-scroll" id="sub-table-wrap"><table class="data-table sub-table">
          <thead><tr><th>Student</th><th>Status</th><th>Plan</th><th>Words</th><th>Coach</th><th>Last activity</th></tr></thead>
          <tbody>${d.rows.map(r => {
            const [label, cls] = STATUS[r.status];
            const has = r.status !== 'not_started';
            const when = r.submittedAt ? 'Submitted ' + fmtClock(r.submittedAt) : r.updatedAt ? ago(Date.now() + skew - new Date(r.updatedAt).getTime()) : '—';
            return `<tr>
              <td>${has ? `<button class="link-btn plain sub-name" data-paper="${escapeHtml(r.studentId)}">${escapeHtml(r.name || r.studentId)}</button>` : `<span>${escapeHtml(r.name || r.studentId)}</span>`}<div class="mono sub-id">${escapeHtml(r.studentId)}${multi && subSection === 'all' ? ` · ${r.sections.map(x => escapeHtml(x.name)).join(', ')}` : ''}</div></td>
              <td><span class="badge ${cls}">${label}</span></td>
              <td class="num">${has ? `${r.planDone}/${r.planTotal}` : '—'}</td>
              <td class="num">${has ? r.words : '—'}${has && r.pastedWordsKept ? `<div class="sub-id">${r.pastedWordsKept} from plan</div>` : ''}</td>
              <td>${has ? `${r.coachMessages} question${r.coachMessages === 1 ? '' : 's'}${r.wordingUsed ? '<div class="sub-id">wording suggestion used</div>' : ''}` : '—'}</td>
              <td class="sub-when">${escapeHtml(when)}</td>
            </tr>`;
          }).join('')}</tbody></table></div>` : `<div class="empty-state" id="sub-table-wrap">${e.schedule.length ? 'No students in these sections yet. Add them in Sections &amp; students.' : 'Assign this essay to a section (Edit essay) to see its students here.'}</div>`}`;
      document.getElementById('sub-refresh').onclick = load;
      const sel = document.getElementById('sub-sec');
      if (sel) sel.onchange = () => { subSection = sel.value; load(); };
      if (wrap.querySelector('[data-closes]')) startCountdowns(d.serverTime);
      document.getElementById('sub-edit').onclick = () => renderEssayForm(id);
      wrap.querySelectorAll('[data-paper]').forEach(b => { b.onclick = () => renderPaper(id, b.dataset.paper, order); });
    }
    await load();
    C.setCleanup(stopITimer);
    iTimer = setInterval(() => {
      if (!document.getElementById('sub-table-wrap')) return stopITimer();
      if (live && document.visibilityState === 'visible') load();
    }, 20000);
  }

  // ---- One paper ----
  async function renderPaper(id, sid, order) {
    stopITimer();
    const body = dashBody();
    body.innerHTML = '<div class="empty-state">Loading paper…</div>';
    let d;
    try { d = await iapi(`/api/essays/${id}/work/${encodeURIComponent(sid)}`); }
    catch (e) { body.innerHTML = `<button class="link-btn plain back-link" id="pp-back">← Submissions</button><div class="empty-state">${escapeHtml(e.message)}</div>`; document.getElementById('pp-back').onclick = () => renderSubmissions(id); return; }
    const e = d.essay, w = d.work, c = e.config;
    const name = d.student.name || d.student.studentId;
    const i = (order || []).indexOf(sid);
    const prev = i > 0 ? order[i - 1] : null, next = i >= 0 && i < order.length - 1 ? order[i + 1] : null;
    const status = w.status === 'submitted'
      ? (w.autoSubmitted ? `Submitted automatically at the end time (${fmtWhen(w.submittedAt)})` : `Submitted ${fmtWhen(w.submittedAt)}`)
      : `Still writing · last saved ${fmtClock(w.updatedAt)}`;
    const coach = w.coach || [];
    const asked = coach.filter(m => m.role === 'student').length;
    const totalWeight = c.rubric.reduce((a, r) => a + (+r.weight || 0), 0);
    body.innerHTML = `
      <div class="paper-nav no-print">
        <button class="link-btn plain" id="pp-back">← Submissions</button>
        <span class="paper-pager">
          ${prev ? '<button class="link-btn plain" id="pp-prev">← Previous student</button>' : ''}
          ${order && order.length ? `<span class="dash-note">${i + 1} of ${order.length}</span>` : ''}
          ${next ? '<button class="link-btn plain" id="pp-next">Next student →</button>' : ''}
        </span>
        <button class="role-btn" id="pp-print">Print</button>
      </div>
      <div class="paper-layout">
        <article class="box paper">
          <header class="paper-head">
            <h2>${escapeHtml(name)}</h2>
            <div class="t-meta"><span class="mono">${escapeHtml(d.student.studentId)}</span>${d.student.section ? ` · ${escapeHtml(d.student.section)}` : ''} · ${escapeHtml(e.title)}</div>
            <div class="paper-status">${escapeHtml(status)} · started ${escapeHtml(fmtClock(w.startedAt))}</div>
          </header>
          <section><h3>Essay<span class="wc-tag">${w.words} word${w.words === 1 ? '' : 's'} · target ${c.targetWords.min}–${c.targetWords.max}</span></h3>
            <div class="essay-text">${cleanDraft(w.draftHtml)}</div>
            ${w.pastes && w.pastes.length ? `<details class="pp-pastes">
              <summary><strong>${w.pastedWordsKept} of ${w.words} words</strong> pasted from the plan${w.pastedWords !== w.pastedWordsKept ? ` (${w.pastedWords} pasted in all; some were later edited or deleted)` : ''} · ${w.pastes.length} paste${w.pastes.length === 1 ? '' : 's'}</summary>
              <ol>${w.pastes.map(p => `<li><span class="pp-paste-meta">${escapeHtml(fmtClock(p.at))} · ${p.words} word${p.words === 1 ? '' : 's'}${p.stillInEssay ? '' : ' · no longer in the essay as pasted'}</span>“${escapeHtml(p.text)}”</li>`).join('')}</ol>
            </details>` : `<p class="dash-note pp-nopaste">Nothing pasted from the plan; all typed in the draft.</p>`}</section>
          <section><h3>Plan</h3>${planList(c.stages, w.plan)}</section>
          <section class="pp-coach"><h3>Coach conversation<span class="wc-tag">${asked} question${asked === 1 ? '' : 's'}${w.wordingUsed ? ' · wording suggestion used' : ''}</span></h3>
            ${coach.length ? `<ol class="pp-msgs">${coach.map(m => `
              <li class="pp-msg pp-${m.role === 'student' ? 'student' : 'coach'}">
                <div class="pp-meta"><strong>${m.role === 'student' ? escapeHtml(name) : 'Coach'}</strong>${m.stage ? ` · ${escapeHtml(stageName(e, m.stage))}` : ''}${m.at ? ` · ${escapeHtml(fmtClock(m.at))}` : ''}</div>
                ${m.role === 'student' ? `<div class="pp-text">${escapeHtml(m.content)}</div>` : `<div class="md">${renderMarkdown(m.content)}</div>`}
                ${m.wording ? `<div class="pp-wording"><div class="ecw-label">Wording suggestion (the one allowed)</div><div class="ecw-orig">Student’s sentence: “${escapeHtml(m.wording.original)}”</div><div class="ecw-text">${escapeHtml(m.wording.suggestion)}</div></div>` : ''}
              </li>`).join('')}</ol>` : `<p class="dash-note">${e.coachEnabled ? 'This student didn’t use the coach.' : 'The coach was off for this essay.'}</p>`}
          </section>
          <p class="dash-note pp-history">Draft history: ${w.snapshots} snapshot${w.snapshots === 1 ? '' : 's'} saved, about every 30 seconds while writing.</p>
        </article>
        <aside class="paper-aside">
          <div class="box">
            <h3>Rubric</h3>
            <ul class="pp-rubric">${c.rubric.map(r => `
              <li><div class="pp-crit">${escapeHtml(r.criterion)}${+r.weight !== 1 ? `<span class="ew-weight">×${r.weight}</span>` : ''}</div>
                ${r.high ? `<div class="pp-band"><span>Strong</span>${escapeHtml(r.high)}</div>` : ''}
                ${r.low ? `<div class="pp-band"><span>Weak</span>${escapeHtml(r.low)}</div>` : ''}</li>`).join('')}</ul>
            ${totalWeight ? `<p class="dash-note">Weights add up to ${totalWeight}.</p>` : ''}
            ${c.bonus ? `<div class="pp-bonus"><strong>Bonus, ${c.bonus.points} points.</strong> ${escapeHtml(c.bonus.description)}</div>` : ''}
          </div>
          <details class="box pp-prompt"><summary>Prompt</summary><div class="md">${renderMarkdown(e.prompt)}</div></details>
        </aside>
      </div>`;
    document.getElementById('pp-back').onclick = () => renderSubmissions(id, true);
    document.getElementById('pp-print').onclick = () => window.print();
    if (prev) document.getElementById('pp-prev').onclick = () => renderPaper(id, prev, order);
    if (next) document.getElementById('pp-next').onclick = () => renderPaper(id, next, order);
    window.scrollTo(0, 0);
  }

  return { loadStudentHome, renderStudentEssay, openEssay, renderInstructorEssays };
};
