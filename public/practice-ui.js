/* Ceteris practice: the student's chapter and exercise screens and the instructor's Practice
   tab. Loaded before the main script, which calls window.CeterisPractice(helpers) once its own
   helpers exist. */
window.CeterisPractice = function (C) {
  'use strict';
  const { api, iapi, escapeHtml, renderMarkdown, store, STUDENT_KEY, state, root } = C;
  const md = t => renderMarkdown(t);
  const token = () => store.get(STUDENT_KEY);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const ICON_DONE = '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor"/><path d="M4.8 8.3 7 10.4l4.2-4.6" stroke="var(--card)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_SHOWN = '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="7.2" stroke="currentColor" stroke-width="1.6"/><path d="M3.8 8s1.6-2.6 4.2-2.6S12.2 8 12.2 8 10.6 10.6 8 10.6 3.8 8 3.8 8Z" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/></svg>';
  const ICON_BOOK = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 4.2c2.4-.9 4.8-.9 7 .6v11c-2.2-1.5-4.6-1.5-7-.6v-11Zm14 0c-2.4-.9-4.8-.9-7 .6v11c2.2-1.5 4.6-1.5 7-.6v-11Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  const ICON_DICE = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="3.5" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="7" r="1.3" fill="currentColor"/><circle cx="13" cy="13" r="1.3" fill="currentColor"/><circle cx="10" cy="10" r="1.3" fill="currentColor"/></svg>';

  const isDone = st => st && (st.status === 'solved' || st.status === 'shown');
  const fmtCell = v => (v == null || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : escapeHtml(v));
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const fmtDate = d => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
  const band = s => (s == null ? 'none' : s >= 90 ? 'top' : s >= 75 ? 'good' : s >= 50 ? 'mid' : 'low');

  function givenTable(t) {
    if (t.transpose) {
      return `<div class="pc-tablewrap"><table class="pc-table pc-given pc-wide"><tbody>${t.columns.map((c, i) => `<tr><th scope="row">${escapeHtml(c)}</th>${t.rows.map(r => `<td>${fmtCell(r[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    return `<div class="pc-tablewrap"><table class="pc-table pc-given"><thead><tr>${t.columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map(v => `<td>${fmtCell(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  const bodyHtml = body => body.map(b => b.md ? `<div class="md">${md(b.md)}</div>` : b.table ? givenTable(b.table) : '').join('');

  let toastTimer = null;
  function toast(msg) {
    let t = document.getElementById('pc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'pc-toast'; t.className = 'ess-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }

  function topbar(backLabel) {
    return `<header class="topbar">
        <div class="brand">Ceteris</div>
        <div class="topbar-right">${C.themeSwitch()}<button class="link-btn" id="pc-back">${escapeHtml(backLabel)}</button></div>
      </header>`;
  }

  // Summaries the card, the banner and the chapter page share.
  function chapterSummary(ch) {
    const n = ch.exercises.length, tried = ch.exercises.filter(e => e.best != null);
    const done = ch.exercises.filter(e => e.finished > 0).length;
    const scored = ch.exercises.filter(e => e.best != null);
    const avg = scored.length ? Math.round(scored.reduce((t, e) => t + e.best, 0) / scored.length) : null;
    return { n, done, avg, tried: tried.length, inProgress: ch.exercises.some(e => e.active) };
  }

  // ===================================================================================
  // Student: card (and narrow-screen banner) on the tutoring screen

  async function loadStudentHome(cardEl, bannerEl) {
    let d;
    try { d = await api('/api/practice/student', { token: token() }); }
    catch (e) { if (e.status === 401) C.logoutStudent(); return; }
    if (!cardEl || !cardEl.isConnected) return;
    const chapters = d.courses.flatMap(c => c.chapters.map(ch => ({ ...ch, course: c.title })));
    cardEl.innerHTML = chapters.length ? `
      <div class="panel-card pc-card">
        <div class="panel-head"><div class="panel-title">Practice</div></div>
        <div class="panel-body">${d.courses.map(c => `
          <div class="pc-course">${escapeHtml(c.title)}</div>
          ${c.chapters.map(ch => {
            const s = chapterSummary(ch);
            return `<div class="pc-row">
              <div class="pc-row-main">
                <div class="ess-title">Ch. ${ch.number} · ${escapeHtml(ch.title)}</div>
                <div class="pc-meter" role="img" aria-label="${s.done} of ${s.n} exercises done"><span style="width:${pct(s.done, s.n)}%"></span></div>
                <div class="ess-meta">${s.done} of ${s.n} exercise${s.n === 1 ? '' : 's'} done${s.avg != null ? ` · best scores average ${s.avg}` : ''}</div>
              </div>
              <button class="eb-btn pc-open" data-chapter="${escapeHtml(ch.id)}">${s.tried ? 'Open' : 'Start'}</button>
            </div>`;
          }).join('')}`).join('')}</div>
      </div>` : '';
    cardEl.querySelectorAll('[data-chapter]').forEach(b => { b.onclick = () => openChapter(b.dataset.chapter); });
    if (bannerEl && bannerEl.isConnected) {
      bannerEl.innerHTML = chapters.map(ch => {
        const s = chapterSummary(ch);
        return `<div class="essay-banner pc-banner">
          <span class="eb-icon">${ICON_BOOK}</span>
          <span class="eb-text"><strong>Practice:</strong> Ch. ${ch.number} · ${escapeHtml(ch.title)}${s.tried ? ` · ${s.done} of ${s.n} done` : ''}</span>
          <button class="eb-btn" data-chapter="${escapeHtml(ch.id)}">${s.tried ? 'Open' : 'Start'}</button>
        </div>`;
      }).join('');
      bannerEl.hidden = !chapters.length;
      bannerEl.querySelectorAll('[data-chapter]').forEach(b => { b.onclick = () => openChapter(b.dataset.chapter); });
    }
  }

  function openChapter(id) { state.practiceChapter = id; C.go('student-practice'); }
  function openExercise(id) { state.practiceEx = id; C.go('student-exercise'); }

  // ===================================================================================
  // Student: chapter page (the exercises, best scores, attempt history)

  async function renderStudentPractice() {
    root.innerHTML = `${topbar('Back to Ceteris')}<main class="pc-wrap pc-chapter" id="pc-main"><div class="essay-loading">Loading…</div></main>`;
    C.bindThemeSwitches();
    document.getElementById('pc-back').onclick = () => C.go('student-chat');
    const main = document.getElementById('pc-main');
    let d;
    try { d = await api('/api/practice/student', { token: token() }); }
    catch (e) { if (e.status === 401) return C.logoutStudent(); main.innerHTML = `<div class="box">${escapeHtml(e.message)}</div>`; return; }
    if (state.view !== 'student-practice' || !main.isConnected) return;
    let course = null, ch = null;
    for (const c of d.courses) for (const x of c.chapters) if (!ch && (x.id === state.practiceChapter || !state.practiceChapter)) { course = c; ch = x; }
    if (!ch) { main.innerHTML = `<div class="essay-narrow"><div class="box"><p>Nothing to practice here right now.</p></div></div>`; return; }
    state.practiceChapter = ch.id;
    const s = chapterSummary(ch);
    const cheer = !s.tried ? `${s.n} exercise${s.n === 1 ? '' : 's'}, each with fresh numbers every time you try. Take them in any order; your best score on each one is the one that counts.`
      : s.done === s.n ? `You’ve done every exercise in this chapter. Nice work! Each retake comes with new numbers, if you want to push a score higher.`
      : `Nice progress: ${s.done} of ${s.n} done. Keep going!`;
    main.innerHTML = `
      <div class="pc-chapter-head">
        <div class="pc-course">${escapeHtml(course.title)}</div>
        <h1>Chapter ${ch.number} · ${escapeHtml(ch.title)}</h1>
        <p class="pc-sub">${escapeHtml(ch.subtitle || '')}</p>
        <p class="pc-cheer">${escapeHtml(cheer)}</p>
      </div>
      <ol class="pc-exlist">${ch.exercises.map((e, i) => {
        const status = e.active ? `In progress · step ${Math.min(e.active.done + 1, e.active.total)} of ${e.active.total}${e.active.score ? ` · ${e.active.score} points so far` : ''}`
          : e.attempts ? `${e.attempts} attempt${e.attempts === 1 ? '' : 's'}` : 'Not started yet';
        return `<li class="pc-ex">
          <div class="pc-ex-num">${i + 1}</div>
          <div class="pc-ex-main">
            <h2>${escapeHtml(e.title)}</h2>
            <p>${escapeHtml(e.summary)}</p>
            <div class="pc-ex-status">${escapeHtml(status)}</div>
          </div>
          <div class="pc-ex-side">
            ${e.best != null ? `<div class="pc-best ${band(e.best)}" title="Your best score"><span class="pc-best-num">${e.best}</span><span class="pc-best-label">best</span></div>` : ''}
            <button class="role-btn ${e.active || !e.attempts ? 'primary' : ''} pc-ex-go" data-ex="${escapeHtml(e.id)}">${e.active ? 'Continue' : e.attempts ? `${ICON_DICE} New numbers` : 'Start'}</button>
          </div>
        </li>`;
      }).join('')}</ol>`;
    main.querySelectorAll('[data-ex]').forEach(b => { b.onclick = () => openExercise(b.dataset.ex); });
  }

  // ===================================================================================
  // Student: one exercise, one attempt

  async function renderStudentExercise() {
    root.innerHTML = `${topbar('Back to the chapter')}<main class="pc-wrap" id="pc-main"><div class="essay-loading">Getting your exercise ready…</div></main>`;
    C.bindThemeSwitches();
    document.getElementById('pc-back').onclick = () => C.go('student-practice');
    const main = document.getElementById('pc-main');
    let d;
    try {
      d = await api(`/api/practice/ex/${encodeURIComponent(state.practiceEx)}/student`, { token: token() });
      if (!d.attempt) d = await api(`/api/practice/ex/${encodeURIComponent(state.practiceEx)}/start`, { method: 'POST', token: token(), body: {} });
    } catch (e) {
      if (e.status === 401) return C.logoutStudent();
      main.innerHTML = `<div class="essay-narrow"><div class="box"><p>${escapeHtml(e.message)}</p><button class="role-btn primary" id="pc-home">Back to Ceteris</button></div></div>`;
      document.getElementById('pc-home').onclick = () => C.go('student-chat');
      return;
    }
    if (state.view !== 'student-exercise' || !main.isConnected) return;
    state.practiceChapter = d.exercise.chapter.id;
    runAttempt(main, d);
  }

  function runAttempt(main, d) {
    const ex = d.exercise;
    let att = d.attempt, history = d.history, best = d.best;
    const chat = (d.chat || []).slice();
    let justDone = null, busy = false, coachBusy = false, coachNote = null, coachUnread = false, finished = null;
    const drafts = {};

    main.innerHTML = `
      <div class="pc-status">
        <div>
          <div class="pc-crumb">Ch. ${ex.chapter.number} · ${escapeHtml(ex.chapter.title)} · Exercise ${ex.number}</div>
          <div class="ew-title">${escapeHtml(ex.title)}</div>
          <div class="pc-sub" id="pc-attempt"></div>
        </div>
        <div class="pc-status-right">
          <div class="pc-scorebox" aria-live="polite"><div class="pc-score-now"><span id="pc-score">0</span><small>/100</small></div><div class="pc-score-label" id="pc-score-label">score so far</div></div>
          <div class="pc-status-links">
            <button class="link-btn plain" id="pc-fresh">${ICON_DICE} New numbers</button>
            ${d.isDemo ? '<button class="link-btn plain" id="pc-clear">Erase my history</button>' : ''}
          </div>
        </div>
      </div>
      <div class="ew-tabs pc-tabs" role="tablist" aria-label="Show">
        <button role="tab" data-pane="work" class="active" aria-selected="true">Exercise</button>
        <button role="tab" data-pane="coach" aria-selected="false">Coach<span class="dot" hidden></span></button>
      </div>
      <div class="pc-grid" id="pc-grid" data-pane="work">
        <section class="pc-work" aria-label="Exercise"><div id="pc-problem"></div></section>
        <aside class="ew-coach pc-coach" aria-label="Practice coach">
          <div class="ec-head"><span class="avatar" aria-hidden="true">C</span><div><div class="ec-title">Coach</div><div class="ec-sub" id="pc-coach-sub">Ask about the step you’re on</div></div></div>
          <div class="ec-scroll" id="pc-chat" role="log" aria-live="polite"></div>
          <div class="ec-quick" id="pc-quick"></div>
          <form class="composer ec-composer" id="pc-form">
            <label for="pc-input" class="sr-only">Ask the coach</label>
            <textarea id="pc-input" rows="1" placeholder="Ask about this step…"></textarea>
            <button class="send-btn" id="pc-send" type="submit" aria-label="Send">${C.icons.SEND}</button>
          </form>
        </aside>
      </div>`;

    const grid = document.getElementById('pc-grid');
    const probEl = document.getElementById('pc-problem');
    const steps = () => att.steps;
    const allDone = () => steps().every(s => isDone(s.state));
    const currentStep = () => steps().find(s => !isDone(s.state)) || steps()[steps().length - 1];
    function relock() { let blocked = false; steps().forEach(s => { s.locked = blocked; if (!isDone(s.state)) blocked = true; }); }

    function renderStatus() {
      document.getElementById('pc-score').textContent = att.score;
      document.getElementById('pc-score-label').textContent = allDone() ? 'this attempt' : 'score so far';
      const prev = history.filter(h => h.number !== att.number);
      document.getElementById('pc-attempt').textContent = `Attempt ${att.number}${att.number > 1 ? ' · fresh numbers' : ''}${prev.length ? ` · best so far ${Math.max(...prev.map(h => h.score), att.score)}` : ''} · ${att.done} of ${att.total} steps`;
      const fresh = document.getElementById('pc-fresh');
      fresh.hidden = allDone();
    }

    // ---- One step ----
    function inputHtml(s) {
      const st = s.state, done = isDone(st);
      if (s.kind === 'number') {
        const val = done ? '' : (st.answer == null ? '' : st.answer);
        const pre = s.unit === '$' ? '<span class="pc-affix">$</span>' : '';
        const post = s.unit && s.unit !== '$' ? `<span class="pc-affix">${escapeHtml(s.unit)}</span>` : '';
        return `<div class="pc-answer-row"><label class="pc-num">${pre}<input type="text" inputmode="decimal" autocomplete="off" id="in-${s.id}" value="${escapeHtml(val)}" aria-label="Your answer"${done ? ' disabled' : ''}>${post}</label></div>`;
      }
      if (s.kind === 'choice') {
        const picked = done ? [].concat(s.correct) : [].concat(st.answer || []);
        return `<fieldset class="pc-options${s.multi ? ' multi' : ''}" id="in-${s.id}"${done ? ' disabled' : ''}><legend class="sr-only">Options</legend>${s.multi && !/select all/i.test(s.prompt) ? '<div class="pc-multi-note">Select all that apply.</div>' : ''}
          ${s.options.map(o => `<label class="pc-opt"><input type="${s.multi ? 'checkbox' : 'radio'}" name="opt-${s.id}" value="${escapeHtml(o.id)}"${picked.includes(o.id) ? ' checked' : ''}><span>${escapeHtml(o.label)}</span></label>`).join('')}
        </fieldset>`;
      }
      if (s.kind === 'table') {
        const typed = st.answer || {}, marks = st.cells || {};
        return `<div class="pc-tablewrap"><table class="pc-table pc-fill" id="in-${s.id}"><thead><tr>${s.columns.map(c => `<th${c.given ? '' : ' class="fill"'}>${escapeHtml(c.label)}</th>`).join('')}</tr></thead><tbody>
          ${s.rows.map((r, i) => `<tr>${s.columns.map(c => {
            if (c.given || !r.fill.includes(c.key)) return `<td class="${c.given ? 'given' : 'na'}">${c.given ? fmtCell(r.values[c.key]) : '—'}</td>`;
            const id = `${i}.${c.key}`;
            if (done) return `<td class="ans">${fmtCell((s.solution || {})[id])}</td>`;
            const m = marks[id];
            return `<td class="cell${m === true ? ' ok' : m === false ? ' bad' : ''}"><input type="text" inputmode="decimal" autocomplete="off" data-cell="${id}" value="${escapeHtml(typed[id] == null ? '' : typed[id])}" aria-label="${escapeHtml(c.label)} at quantity ${escapeHtml(String(r.values.Q != null ? r.values.Q : i))}"></td>`;
          }).join('')}</tr>`).join('')}
        </tbody></table></div>`;
      }
      if (s.kind === 'explain') {
        if (done) return st.answer ? `<blockquote class="pc-yours">${escapeHtml(st.answer)}</blockquote>` : '';
        const v = drafts[s.id] != null ? drafts[s.id] : (st.answer || '');
        return `<textarea class="pc-explain" id="in-${s.id}" rows="3" maxlength="1200" placeholder="In your own words…" aria-label="Your explanation">${escapeHtml(v)}</textarea>`;
      }
      return '';
    }

    function creditTag(s) {
      const c = s.state.credit;
      if (c == null) return '';
      return `<span class="pc-credit ${c === 100 ? 'full' : c ? 'part' : 'none'}">${c === 100 ? 'full credit' : c ? `${c}% credit` : 'no credit'}${s.weight > 1 ? ` · counts ×${s.weight}` : ''}</span>`;
    }

    function stepHtml(s, n) {
      const st = s.state, done = isDone(st);
      const icon = st.status === 'solved' ? `<span class="pc-badge ok" title="Solved">${ICON_DONE}</span>`
        : st.status === 'shown' ? `<span class="pc-badge shown" title="Solution shown">${ICON_SHOWN}</span>`
        : `<span class="pc-badge num">${n}</span>`;
      if (done) {
        const fresh = justDone === s.id;
        const cheer = fresh && (st.praise || (st.review && st.review.feedback)) ? `<div class="pc-feedback ok">${escapeHtml(st.status === 'solved' && s.kind === 'explain' && st.review ? st.review.feedback : st.praise)}</div>` : '';
        return `<li class="pc-step done ${st.status}" id="step-${s.id}">
          <div class="pc-step-head">${icon}<div class="pc-prompt md">${md(s.prompt)}</div></div>
          <div class="pc-step-body">
            ${s.kind === 'table' || s.kind === 'explain' ? inputHtml(s) : `<div class="pc-result">${st.status === 'shown' ? '<span class="pc-tag">Solution</span>' : ''}<span class="pc-yourans">${escapeHtml(s.solution)}</span>${creditTag(s)}</div>`}
            ${s.kind === 'table' || s.kind === 'explain' ? `<div class="pc-result">${creditTag(s)}</div>` : ''}
            ${cheer}
            <details class="pc-why"${fresh ? ' open' : ''}><summary>${s.kind === 'explain' ? (st.status === 'solved' ? 'Compare with the model answer' : 'Model answer') : 'Why it works'}</summary>
              <div class="md">${md(s.worked || '')}</div></details>
          </div>
        </li>`;
      }
      if (s.locked) return '';
      const hints = st.hints || [];
      return `<li class="pc-step current" id="step-${s.id}">
        <div class="pc-step-head">${icon}<div class="pc-prompt md">${md(s.prompt)}</div></div>
        <div class="pc-step-body">
          ${inputHtml(s)}
          ${st.feedback ? `<div class="pc-feedback bad" role="alert">${md(st.feedback)}</div>` : '<div class="pc-feedback-slot" aria-live="polite"></div>'}
          ${hints.length ? `<ol class="pc-hints">${hints.map(h => `<li><span class="pc-hint-label">Hint</span>${md(h)}</li>`).join('')}</ol>` : ''}
          <div class="pc-actions">
            <button class="role-btn primary pc-check" data-check="${s.id}">${s.kind === 'explain' ? 'Submit for review' : 'Check'}</button>
            ${st.hintsLeft ? `<button class="link-btn plain" data-hint="${s.id}">${hints.length ? 'Another hint' : 'Hint'}</button>`
              : `<button class="link-btn plain pc-reveal" data-reveal="${s.id}">Show the solution</button>`}
            ${st.attempts ? `<span class="pc-tries">${st.attempts} ${s.kind === 'explain' ? (st.attempts === 1 ? 'review' : 'reviews') : (st.attempts === 1 ? 'try' : 'tries')} so far</span>` : ''}
          </div>
        </div>
      </li>`;
    }

    function resultHtml() {
      const f = finished || { score: att.score, previousBest: history.filter(h => h.number !== att.number).reduce((m, h) => Math.max(m, h.score), -1) };
      const prev = f.previousBest != null && f.previousBest >= 0 ? f.previousBest : null;
      const s = f.score;
      const headline = s >= 90 ? 'Excellent work!' : s >= 75 ? 'Nicely done!' : s >= 50 ? 'Good effort!' : 'You stuck with it. That counts!';
      const line = prev == null
        ? (s >= 90 ? 'That’s a strong first attempt.' : 'Every retake comes with fresh numbers: a great way to lock it in, and only your best score counts.')
        : s > prev ? `That’s a new personal best, up ${s - prev} point${s - prev === 1 ? '' : 's'} from ${prev}.`
        : s === prev ? `That ties your best score (${prev}).` : `Your best is still ${prev}, and that’s the one that counts. Fresh numbers make good practice.`;
      const all = history.map(h => h.number === att.number ? Object.assign({}, h, { score: s, status: 'done' }) : h);
      return `<section class="pc-result-card ${band(s)}" id="pc-result" tabindex="-1">
        <div class="pc-result-score"><span>${s}</span><small>/100</small></div>
        <div class="pc-result-text">
          <h2>${escapeHtml(headline)}</h2>
          <p>${escapeHtml(line)}</p>
          ${all.length > 1 ? `<ol class="pc-history">${all.map(h => `<li class="${h.number === att.number ? 'now' : ''}"><span>#${h.number}</span><b>${h.score}</b>${h.status === 'ended' ? '<em>unfinished</em>' : ''}</li>`).join('')}</ol>` : ''}
          <div class="pc-result-actions">
            <button class="role-btn primary" id="pc-again">${ICON_DICE} Try again with new numbers</button>
            ${ex.next ? `<button class="role-btn" id="pc-nextex">Next: ${escapeHtml(ex.next.title)} →</button>` : ''}
            <button class="link-btn plain" id="pc-tochapter">Back to the chapter</button>
          </div>
        </div>
      </section>`;
    }

    function renderProblem() {
      relock();
      const remaining = steps().filter(s => s.locked).length;
      const first = att.number === 1 && !steps().some(s => s.state.attempts || isDone(s.state));
      probEl.innerHTML = `
        ${allDone() ? resultHtml() : ''}
        <article class="pc-problem">
          <div class="pc-statement">${bodyHtml(att.body)}</div>
          ${first ? '<p class="pc-intro">One step at a time: check each answer as you go, and ask for a hint whenever you’re stuck. After every step, you’ll see why the answer works. Your score counts full credit for steps you get without help and partial credit for the rest.</p>' : ''}
          <ol class="pc-steps">${steps().map((s, i) => stepHtml(s, i + 1)).join('')}</ol>
          ${remaining ? `<div class="pc-more">${remaining} more step${remaining === 1 ? '' : 's'} to go</div>` : ''}
        </article>`;
      bindProblem();
    }

    function bindProblem() {
      probEl.querySelectorAll('[data-check]').forEach(b => { b.onclick = () => submit(b.dataset.check); });
      probEl.querySelectorAll('[data-hint]').forEach(b => { b.onclick = () => hint(b.dataset.hint, false); });
      probEl.querySelectorAll('[data-reveal]').forEach(b => {
        b.onclick = () => {
          if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'Show it? (no credit for this step)'; return; }
          hint(b.dataset.reveal, true);
        };
      });
      const cur = steps().find(s => !s.locked && !isDone(s.state));
      if (cur) {
        const el = document.getElementById('in-' + cur.id);
        if (cur.kind === 'number' && el) el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(cur.id); } });
        if (cur.kind === 'explain' && el) el.addEventListener('input', () => { drafts[cur.id] = el.value; });
        if (cur.kind === 'table' && el) el.querySelectorAll('input').forEach(inp => {
          inp.addEventListener('input', () => inp.parentElement.classList.remove('ok', 'bad'));
          inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(cur.id); } });
        });
      }
      const again = document.getElementById('pc-again');
      if (again) again.onclick = () => fresh(true);
      const nx = document.getElementById('pc-nextex');
      if (nx) nx.onclick = () => openExercise(ex.next.id);
      const tc = document.getElementById('pc-tochapter');
      if (tc) tc.onclick = () => C.go('student-practice');
    }

    function focusCurrent() {
      const cur = steps().find(s => !s.locked && !isDone(s.state));
      if (!cur) return;
      const el = document.getElementById('in-' + cur.id);
      const li = document.getElementById('step-' + cur.id);
      if (li && li.getBoundingClientRect().top > window.innerHeight - 120) li.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (!el) return;
      const target = cur.kind === 'table' ? (el.querySelector('td.bad input') || Array.from(el.querySelectorAll('input')).find(i => !i.value) || el.querySelector('input'))
        : cur.kind === 'choice' ? null : el;
      if (target) target.focus({ preventScroll: true });
    }

    function apply(r) {
      if (r.step) { const i = steps().findIndex(s => s.id === r.step.id); if (i >= 0) steps()[i] = Object.assign({}, r.step, { locked: false }); }
      if (r.progress) Object.assign(att, r.progress);
      if (r.finished) {
        finished = r.finished;
        const h = history.find(x => x.number === att.number);
        if (h) { h.score = r.finished.score; h.status = 'done'; }
        best = Math.max(best == null ? 0 : best, r.finished.score);
      } else {
        const h = history.find(x => x.number === att.number);
        if (h) h.score = att.score;
      }
    }
    function afterFinish() {
      const card = document.getElementById('pc-result');
      if (card) { card.scrollIntoView({ block: 'start', behavior: 'smooth' }); card.focus({ preventScroll: true }); }
    }

    function gather(s) {
      const el = document.getElementById('in-' + s.id);
      if (s.kind === 'number') return { answer: el ? el.value : '' };
      if (s.kind === 'choice') { const vals = Array.from(el.querySelectorAll('input:checked')).map(i => i.value); return s.multi ? { choices: vals } : { choice: vals[0] || '' }; }
      if (s.kind === 'table') { const cells = {}; el.querySelectorAll('input[data-cell]').forEach(i => { cells[i.dataset.cell] = i.value; }); return { cells }; }
      return { text: el ? el.value : '' };
    }
    function inlineNote(s, msg) {
      const li = document.getElementById('step-' + s.id);
      const slot = li && (li.querySelector('.pc-feedback-slot') || li.querySelector('.pc-feedback'));
      if (slot) { slot.className = 'pc-feedback bad'; slot.innerHTML = escapeHtml(msg); }
    }
    const url = what => `/api/practice/ex/${encodeURIComponent(ex.id)}/${what}`;

    async function submit(id) {
      const s = steps().find(x => x.id === id);
      if (!s || busy) return;
      const btn = probEl.querySelector(`[data-check="${CSS.escape(id)}"]`);
      busy = true; if (btn) { btn.disabled = true; btn.textContent = s.kind === 'explain' ? 'Reviewing…' : 'Checking…'; }
      try {
        const r = await api(url(s.kind === 'explain' ? 'explain' : 'check'), { method: 'POST', token: token(), body: Object.assign({ step: id, attempt: att.id }, gather(s)) });
        busy = false;
        if (r.invalid) { if (btn) { btn.disabled = false; btn.textContent = 'Check'; } return inlineNote(s, r.message); }
        if (r.correct) { justDone = id; delete drafts[id]; }
        apply(r); renderAll();
        if (r.correct) { const li = document.getElementById('step-' + id); if (li) li.classList.add('flash'); }
        if (r.finished) afterFinish(); else focusCurrent();
      } catch (e) {
        busy = false;
        if (e.status === 401) return C.logoutStudent();
        if (e.status === 409 && /attempt/i.test(e.message)) return C.go('student-exercise');
        if (btn) { btn.disabled = false; btn.textContent = s.kind === 'explain' ? 'Submit for review' : 'Check'; }
        inlineNote(s, e.message);
      }
    }

    async function hint(id, reveal) {
      if (busy) return;
      busy = true;
      try {
        const r = await api(url('hint'), { method: 'POST', token: token(), body: { step: id, reveal, attempt: att.id } });
        busy = false;
        if (reveal) justDone = id;
        apply(r); renderAll();
        if (!reveal) { const last = document.querySelector(`#step-${CSS.escape(id)} .pc-hints li:last-child`); if (last) last.classList.add('flash'); }
        if (r.finished) afterFinish(); else focusCurrent();
      } catch (e) {
        busy = false;
        if (e.status === 401) return C.logoutStudent();
        toast(e.message);
      }
    }

    // New numbers: mid-attempt it asks first, since the current attempt ends with its score as it stands.
    const freshBtn = document.getElementById('pc-fresh');
    freshBtn.onclick = () => {
      if (!freshBtn.classList.contains('confirm')) {
        freshBtn.classList.add('confirm');
        freshBtn.innerHTML = `End this attempt at ${att.score} and start fresh?`;
        setTimeout(() => { if (freshBtn.isConnected) { freshBtn.classList.remove('confirm'); freshBtn.innerHTML = `${ICON_DICE} New numbers`; } }, 6000);
        return;
      }
      fresh(true);
    };
    async function fresh() {
      try {
        const r = await api(url('start'), { method: 'POST', token: token(), body: { fresh: true } });
        window.scrollTo({ top: 0 });
        runAttempt(main, Object.assign(r, { chat: [] }));
        toast(`Attempt ${r.attempt.number}: fresh numbers. Good luck!`);
      } catch (e) { if (e.status === 401) return C.logoutStudent(); toast(e.message); }
    }
    const clear = document.getElementById('pc-clear');
    if (clear) clear.onclick = async () => {
      if (!clear.classList.contains('confirm')) { clear.classList.add('confirm'); clear.textContent = 'Erase every attempt?'; return; }
      try { await api(url('clear'), { method: 'POST', token: token() }); C.go('student-exercise'); } catch (e) { toast(e.message); }
    };

    // ---- Coach ----
    const chatEl = document.getElementById('pc-chat');
    const input = document.getElementById('pc-input');
    function renderCoach() {
      const cur = currentStep();
      document.getElementById('pc-coach-sub').textContent = allDone() ? 'Questions about any step are welcome' : `Step ${steps().indexOf(cur) + 1} of ${steps().length}`;
      chatEl.innerHTML = (chat.length ? '' : `<p class="ec-empty">Stuck? Ask about the step you’re on. The coach knows this exercise and what you’ve tried, and will help you reason it out. It won’t hand you the answer, though: that’s what “Show the solution” is for.</p>`)
        + chat.map(m => m.role === 'student'
          ? `<div class="ec-user"><div class="bubble">${escapeHtml(m.content)}</div></div>`
          : `<div class="ec-coach"><span class="avatar" aria-hidden="true">C</span><div class="md">${md(m.content)}</div></div>`).join('')
        + (coachBusy ? '<div class="ec-coach"><span class="avatar" aria-hidden="true">C</span><div class="ec-thinking"><span class="typing" aria-hidden="true"><span></span><span></span><span></span></span>thinking…</div></div>' : '')
        + (coachNote ? `<div class="ec-note" role="alert">${escapeHtml(coachNote)}</div>` : '');
      chatEl.scrollTop = chatEl.scrollHeight;
      document.getElementById('pc-send').disabled = coachBusy;
      const q = document.getElementById('pc-quick');
      const chips = isDone(cur.state) ? ['Can you explain why this works?'] : cur.state.attempts ? ['Why is my answer wrong?', 'What should I compare here?'] : ['Where do I start?', 'What does this term mean?'];
      q.innerHTML = chips.map(c => `<button class="ec-chip" type="button"${coachBusy ? ' disabled' : ''}>${escapeHtml(c)}</button>`).join('');
      q.querySelectorAll('.ec-chip').forEach(b => { b.onclick = () => ask(b.textContent); });
    }
    async function ask(text) {
      text = String(text || '').trim();
      if (!text || coachBusy) return;
      const cur = currentStep();
      input.value = ''; autoGrow(); coachNote = null;
      chat.push({ role: 'student', content: text, step: cur.id });
      coachBusy = true; renderCoach();
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await api(url('ask'), { method: 'POST', token: token(), body: { step: cur.id, message: text, attempt: att.id } });
          chat.push({ role: 'coach', content: r.reply, step: cur.id });
          if (grid.dataset.pane === 'work' && window.matchMedia('(max-width: 900px)').matches) coachUnread = true;
          break;
        } catch (e) {
          if (e.status === 401) return C.logoutStudent();
          if (e.status === 503 && attempt < 2) { await sleep(4000 * (attempt + 1)); if (!chatEl.isConnected) return; continue; }
          chat.pop();
          if (!input.value) { input.value = text; autoGrow(); }
          coachNote = e.status === 503 ? 'The coach is busy helping many students. Your question is back in the box; send it again in a moment.' : e.message;
          break;
        }
      }
      coachBusy = false;
      if (!chatEl.isConnected) return;
      renderCoach(); updateTabs();
    }
    function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; }
    document.getElementById('pc-form').onsubmit = e => { e.preventDefault(); ask(input.value); };
    input.addEventListener('input', autoGrow);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); } });

    const tabs = Array.from(document.querySelectorAll('.pc-tabs [data-pane]'));
    function updateTabs() {
      tabs.forEach(b => {
        const on = b.dataset.pane === grid.dataset.pane;
        b.classList.toggle('active', on); b.setAttribute('aria-selected', on);
        const dot = b.querySelector('.dot'); if (dot) dot.hidden = !(b.dataset.pane === 'coach' && coachUnread);
      });
    }
    tabs.forEach(b => { b.onclick = () => { grid.dataset.pane = b.dataset.pane; if (b.dataset.pane === 'coach') coachUnread = false; updateTabs(); }; });

    function renderAll() { renderStatus(); renderProblem(); renderCoach(); }
    renderAll();
    focusCurrent();
  }

  // ===================================================================================
  // Instructor: Practice tab

  const dashBody = () => document.getElementById('dash-body');
  let progSection = 'all';

  async function renderInstructorPractice(flash) {
    const body = dashBody();
    body.innerHTML = '<div class="empty-state">Loading practice exercises…</div>';
    let d;
    try { d = await iapi('/api/practice'); }
    catch (e) { body.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }
    if (!body.isConnected) return;
    const secs = d.sections;
    body.innerHTML = `
      <div class="dash-controls"><span class="dash-note">${flash ? escapeHtml(flash) : 'Step-by-step exercises, by course and chapter. Every attempt gets new numbers and a score out of 100; a student’s best score on each exercise is the one that counts.'}</span></div>
      ${d.courses.map(c => `
        <div class="pc-course pc-course-head">${escapeHtml(c.title)}</div>
        ${c.chapters.map(ch => `
        <div class="box pc-setbox" data-chapterbox="${escapeHtml(ch.id)}">
          <div class="pc-setbox-head">
            <div class="pc-setbox-icon">${ICON_BOOK}</div>
            <div class="pc-setbox-title"><h2>Chapter ${ch.number} · ${escapeHtml(ch.title)}</h2><div class="pc-sub">${escapeHtml(ch.subtitle || '')} · ${ch.exercises.length} exercises</div></div>
            <div class="pc-setbox-actions"><button class="role-btn primary" data-progress="${escapeHtml(ch.id)}">Progress &amp; scores</button></div>
          </div>
          ${secs.length ? `<div class="table-scroll"><table class="data-table pc-openmx">
            <thead><tr><th>Exercise</th>${secs.map(s => `<th class="pc-mx-sec"><div>${escapeHtml(s.name)}</div><div class="pc-mx-n">${s.students} student${s.students === 1 ? '' : 's'}</div>
              <button class="link-btn plain pc-mx-all" data-all="${s.id}" data-ch="${escapeHtml(ch.id)}">${ch.exercises.every(e => e.openIn.includes(s.id)) ? 'Close all' : 'Open all'}</button></th>`).join('')}</tr></thead>
            <tbody>${ch.exercises.map((e, i) => `<tr>
              <td><div class="pc-mx-title">${i + 1}. ${escapeHtml(e.title)}</div><div class="pc-mx-sum">${escapeHtml(e.summary)} · ${e.steps} steps${e.started ? ` · ${e.started} started` : ''}</div>
                <button class="link-btn plain" data-key="${escapeHtml(e.id)}">Answer key</button></td>
              ${secs.map(s => `<td class="pc-mx-cell"><label class="pc-switch"><input type="checkbox" data-sec="${s.id}" data-ex="${escapeHtml(e.id)}"${e.openIn.includes(s.id) ? ' checked' : ''} aria-label="${escapeHtml(e.title)} open in ${escapeHtml(s.name)}"><span>${e.openIn.includes(s.id) ? 'Open' : 'Closed'}</span></label></td>`).join('')}
            </tr>`).join('')}</tbody></table></div>
            <div class="pc-assign-status" aria-live="polite"></div>`
          : '<p class="dash-note">Create a section in Sections &amp; students to open these exercises for your students.</p>'}
        </div>`).join('')}`).join('')}`;
    body.querySelectorAll('[data-progress]').forEach(b => { b.onclick = () => { progSection = 'all'; renderProgress(b.dataset.progress); }; });
    body.querySelectorAll('[data-key]').forEach(b => { b.onclick = () => renderKey(b.dataset.key, 0); });
    const save = async (box, sectionId, ids, open) => {
      const status = box.querySelector('.pc-assign-status');
      status.textContent = 'Saving…';
      try {
        const r = await iapi('/api/practice/open', { method: 'PUT', body: { sectionId, exerciseIds: ids, open } });
        box.querySelectorAll(`input[data-sec="${sectionId}"]`).forEach(cb => {
          cb.checked = r.open.includes(cb.dataset.ex);
          cb.nextElementSibling.textContent = cb.checked ? 'Open' : 'Closed';
        });
        const all = box.querySelector(`[data-all="${sectionId}"]`);
        if (all) all.textContent = Array.from(box.querySelectorAll(`input[data-sec="${sectionId}"]`)).every(cb => cb.checked) ? 'Close all' : 'Open all';
        status.textContent = 'Saved';
      } catch (e) { status.textContent = e.message; }
    };
    body.querySelectorAll('.pc-setbox').forEach(box => {
      box.querySelectorAll('input[data-sec]').forEach(cb => { cb.onchange = () => save(box, +cb.dataset.sec, [cb.dataset.ex], cb.checked); });
      box.querySelectorAll('[data-all]').forEach(b => {
        b.onclick = () => {
          const cbs = Array.from(box.querySelectorAll(`input[data-sec="${b.dataset.all}"]`));
          save(box, +b.dataset.all, cbs.map(cb => cb.dataset.ex), !cbs.every(cb => cb.checked));
        };
      });
    });
  }

  async function renderProgress(chId) {
    const body = dashBody();
    body.innerHTML = `<button class="link-btn plain back-link" id="pg-back">← Practice</button><div id="pg-wrap"><div class="empty-state">Loading scores…</div></div>`;
    document.getElementById('pg-back').onclick = () => renderInstructorPractice();
    let d;
    try { d = await iapi(`/api/practice/chapter/${encodeURIComponent(chId)}/progress${progSection !== 'all' ? `?section=${progSection}` : ''}`); }
    catch (e) { const w = document.getElementById('pg-wrap'); if (w) w.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }
    const wrap = document.getElementById('pg-wrap');
    if (!wrap) return;
    const exs = d.exercises;
    const title = Object.fromEntries(exs.map(e => [e.id, e]));
    const secs = [];
    d.rows.forEach(r => r.sections.forEach(s => { if (!secs.some(x => x.id === s.id)) secs.push(s); }));
    const started = d.rows.filter(r => Object.keys(r.ex).length).length;
    const cell = c => {
      if (!c) return '<td class="pg-cell pg-score none"></td>';
      if (c.best == null) return `<td class="pg-cell pg-score inprog" title="First attempt in progress: ${c.active.done} of ${c.active.total} steps, ${c.active.score} points so far">…<span class="pg-live" aria-label="in progress"></span></td>`;
      const tip = `Best ${c.best} · attempts: ${c.scores.map(s => `${s.score}${s.status === 'active' ? ' (in progress)' : s.status === 'ended' ? ' (unfinished)' : ''}`).join(', ')}`;
      return `<td class="pg-cell pg-score ${band(c.best)}" title="${escapeHtml(tip)}"><b>${c.best}</b>${c.attempts > 1 ? `<span class="pg-att">×${c.attempts}</span>` : ''}${c.active ? '<span class="pg-live" aria-label="in progress"></span>' : ''}</td>`;
    };
    wrap.innerHTML = `
      <div class="box sub-head">
        <div class="sub-title-row"><h2>Chapter ${d.chapter.number} · ${escapeHtml(d.chapter.title)}</h2>
          ${secs.length > 1 || progSection !== 'all' ? `<label class="sr-only" for="pg-sec">Section</label><select id="pg-sec" class="select section-select"><option value="all">All my sections</option>${secs.map(x => `<option value="${x.id}"${String(x.id) === String(progSection) ? ' selected' : ''}>${escapeHtml(x.name)}</option>`).join('')}</select>` : ''}</div>
        <div class="stats sub-stats">
          <div class="stat"><div class="stat-num">${d.rows.length}</div><div class="stat-label">students</div></div>
          <div class="stat"><div class="stat-num">${started}</div><div class="stat-label">started</div></div>
          <div class="stat"><div class="stat-num">${exs.reduce((t, e) => t + (d.stats[e.id].attempts || 0), 0)}</div><div class="stat-label">attempts</div></div>
        </div>
      </div>
      ${d.stuck.length ? `<div class="box"><h2>Where students get stuck</h2><ol class="pg-stuck">${d.stuck.map(x => `
        <li><span class="pg-stuck-name">Ex. ${title[x.exercise].number}, step ${x.n} · ${escapeHtml(x.label)}</span>
        <span class="pg-stuck-nums">${x.wrong} wrong ${x.wrong === 1 ? 'try' : 'tries'} · ${x.hints} hint${x.hints === 1 ? '' : 's'} · solution shown ${x.shown}× in ${x.reached} attempt${x.reached === 1 ? '' : 's'}</span></li>`).join('')}</ol></div>` : ''}
      ${d.rows.length ? `<div class="pg-legend"><span>Each cell is the student’s <strong>best</strong> score on attempts that are over; ×3 = three attempts; a dot = an attempt in progress (… if it’s the first). Hover for every score.</span></div>
      <div class="table-scroll"><table class="data-table pg-table pg-scores">
        <thead><tr><th class="pg-name">Student</th>${exs.map(e => `<th class="pg-ex" title="${escapeHtml(e.title)}">${e.number}. ${escapeHtml(e.title)}</th>`).join('')}</tr></thead>
        <tbody>${d.rows.map(r => `<tr>
          <td class="pg-name">${Object.keys(r.ex).length ? `<button class="link-btn plain sub-name" data-stu="${escapeHtml(r.studentId)}">${escapeHtml(r.name || r.studentId)}</button>` : escapeHtml(r.name || r.studentId)}<div class="mono sub-id">${escapeHtml(r.studentId)}</div></td>
          ${exs.map(e => cell(r.ex[e.id])).join('')}</tr>`).join('')}
        </tbody>
        <tfoot><tr><td class="pg-name">Average best</td>${exs.map(e => `<td class="pg-cell foot">${d.stats[e.id].avgBest != null ? `${d.stats[e.id].avgBest}<div>${d.stats[e.id].started} started</div>` : '—'}</td>`).join('')}</tr></tfoot>
      </table></div>` : '<div class="empty-state">Open an exercise from this chapter in one of your sections to see its students here.</div>'}`;
    const sel = document.getElementById('pg-sec');
    if (sel) sel.onchange = () => { progSection = sel.value; renderProgress(chId); };
    wrap.querySelectorAll('[data-stu]').forEach(b => { b.onclick = () => renderStudentWork(chId, b.dataset.stu); });
  }

  async function renderStudentWork(chId, sid) {
    const body = dashBody();
    body.innerHTML = `<button class="link-btn plain back-link" id="sw-back">← Progress &amp; scores</button><div id="sw-wrap"><div class="empty-state">Loading…</div></div>`;
    document.getElementById('sw-back').onclick = () => renderProgress(chId);
    let d;
    try { d = await iapi(`/api/practice/chapter/${encodeURIComponent(chId)}/work/${encodeURIComponent(sid)}`); }
    catch (e) { document.getElementById('sw-wrap').innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }
    const wrap = document.getElementById('sw-wrap');
    if (!wrap) return;
    const fmtAns = a => typeof a === 'string' ? escapeHtml(a) : Array.isArray(a) ? escapeHtml(a.join(', ')) : a && typeof a === 'object' ? `${Object.keys(a).length} cells` : '';
    wrap.innerHTML = `
      <div class="box"><h2>${escapeHtml(d.student.name || d.student.studentId)} <span class="mono sub-id">${escapeHtml(d.student.studentId)}</span></h2>
        <p class="dash-note">Chapter ${d.chapter.number} · ${escapeHtml(d.chapter.title)}. Every attempt below has its own numbers; the best score per exercise is the one that counts.</p></div>
      ${d.exercises.filter(e => e.attempts.length).map(e => `<div class="box sw-prob">
        <div class="sw-ex-head"><h2>${e.number}. ${escapeHtml(e.title)}</h2>${e.best != null ? `<div class="pc-best ${band(e.best)} small"><span class="pc-best-num">${e.best}</span><span class="pc-best-label">best</span></div>` : '<span class="dash-note">first attempt in progress</span>'}</div>
        ${e.attempts.slice().reverse().map(a => `<details class="sw-attempt">
          <summary><span class="sw-att-n">Attempt ${a.number}</span><span class="sw-att-score ${band(a.score)}">${a.score}</span>
            <span class="dash-note">${a.status === 'active' ? 'in progress' : a.status === 'ended' ? 'unfinished' : 'finished'} · ${escapeHtml(fmtDate(a.startedAt))}</span></summary>
          <div class="sw-statement md">${md(a.statement)}</div>
          <ol class="sw-steps">${a.steps.map(s => `
            <li class="sw-step ${s.status || 'none'}">
              <div class="sw-head"><span class="sw-label">${escapeHtml(s.label)}</span>
                <span class="badge ${s.status === 'solved' ? 'badge-ok' : s.status === 'shown' ? 'badge-flag' : ''}">${s.status === 'solved' ? `${s.credit}% credit` : s.status === 'shown' ? 'solution shown' : s.attempts || s.hints ? 'in progress' : 'not reached'}</span>
                ${s.attempts || s.hints ? `<span class="dash-note">${s.attempts} wrong · ${s.hints} hint${s.hints === 1 ? '' : 's'}</span>` : ''}</div>
              ${s.log.length ? `<ul class="sw-log">${s.log.map(l => l.shown ? '<li class="shown">Showed the solution</li>' : `<li class="${l.ok ? 'ok' : 'bad'}">${s.kind === 'explain' ? `“${fmtAns(l.answer)}”${l.feedback ? `<div class="sw-fb">Coach: ${escapeHtml(l.feedback)}</div>` : ''}` : fmtAns(l.answer)}</li>`).join('')}</ul>` : ''}
              ${s.answerKey && s.log.length ? `<div class="sw-key">Key: ${escapeHtml(s.answerKey.length > 160 ? s.answerKey.slice(0, 160) + '…' : s.answerKey)}</div>` : ''}
              ${s.chat.length ? `<div class="sw-chat">${s.chat.map(m => `<div class="sw-msg ${m.role}"><span>${m.role === 'student' ? 'Student' : 'Coach'}</span>${m.role === 'coach' ? `<div class="md">${md(m.content)}</div>` : escapeHtml(m.content)}</div>`).join('')}</div>` : ''}
            </li>`).join('')}</ol>
        </details>`).join('')}
      </div>`).join('') || '<div class="empty-state">No attempts yet.</div>'}`;
    const first = wrap.querySelector('.sw-attempt');
    if (first) first.open = true;
  }

  async function renderKey(exId, seed) {
    const body = dashBody();
    body.innerHTML = `<button class="link-btn plain back-link" id="ak-back">← Practice</button><div id="ak-wrap"><div class="empty-state">Loading…</div></div>`;
    document.getElementById('ak-back').onclick = () => renderInstructorPractice();
    let d;
    try { d = await iapi(`/api/practice/ex/${encodeURIComponent(exId)}/key${seed === 'new' ? '?seed=new' : ''}`); }
    catch (e) { document.getElementById('ak-wrap').innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }
    const wrap = document.getElementById('ak-wrap');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="box ak-head">
        <div><h2>${escapeHtml(d.exercise.title)}: answer key</h2>
        <p class="dash-note">${d.worksheet ? '<strong>Worksheet numbers.</strong> Students never get exactly these: every attempt draws its own.' : '<strong>One of the versions students might get.</strong>'} Below: what the coach checks against, the hints, the feedback for common mistakes, and the explanation each student sees after a step. Students never see this page.</p></div>
        <div class="ak-versions"><button class="role-btn primary" id="ak-new">${ICON_DICE} Show another version</button>${d.worksheet ? '' : '<button class="link-btn plain" id="ak-ws">Worksheet numbers</button>'}</div>
      </div>
      <div class="box ak-prob">
        <div class="pc-statement">${bodyHtml(d.body)}</div>
        <ol class="ak-steps">${d.steps.map(s => `<li>
          <div class="md ak-prompt">${md(s.prompt)}</div>
          ${s.kind === 'table' ? givenTable({ columns: s.columns.map(c => c.label), rows: s.rows.map((r, i) => s.columns.map(c => c.given ? r.values[c.key] : r.fill.includes(c.key) ? s.solution[`${i}.${c.key}`] : '—')) })
            : `<div class="ak-answer"><span class="pc-tag">${s.kind === 'explain' ? 'Model answer' : 'Answer'}</span> ${escapeHtml(s.solution)}</div>`}
          ${s.weight > 1 ? `<div class="ak-sub">Counts ×${s.weight} in the score.</div>` : ''}
          ${s.mustHave ? `<div class="ak-sub"><strong>Accepted when it:</strong><ul>${s.mustHave.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul></div>` : ''}
          ${s.kind !== 'explain' ? `<details class="pc-why"><summary>Why it works (shown after the step)</summary><div class="md">${md(s.worked)}</div></details>` : ''}
          ${s.hints.length ? `<div class="ak-sub"><strong>Hints:</strong><ol>${s.hints.map(h => `<li>${md(h)}</li>`).join('')}</ol></div>` : ''}
          ${s.mistakes.length || s.optionMsgs.length || s.patterns.length ? `<div class="ak-sub"><strong>Feedback for common mistakes:</strong><ul>
            ${s.mistakes.map(m => `<li><span class="mono">${escapeHtml(String(Math.round(m.value * 100) / 100))}</span>: ${md(m.msg)}</li>`).join('')}
            ${s.optionMsgs.map(o => `<li>${o.msg ? `<em>${escapeHtml(o.label)}</em> picked: ${md(o.msg)}` : ''}${o.missMsg ? `<em>${escapeHtml(o.label)}</em> left out: ${md(o.missMsg)}` : ''}</li>`).join('')}
            ${s.patterns.map(w => `<li><span class="mono">${escapeHtml(w.col)}</span> column: ${md(w.msg)}</li>`).join('')}
          </ul></div>` : ''}
        </li>`).join('')}</ol></div>`;
    document.getElementById('ak-new').onclick = () => renderKey(exId, 'new');
    const ws = document.getElementById('ak-ws');
    if (ws) ws.onclick = () => renderKey(exId, 0);
  }

  return { loadStudentHome, renderStudentPractice, renderStudentExercise, renderInstructorPractice };
};
