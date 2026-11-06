/* Ceteris problem-set coach: the student's problem-set screens and the instructor's
   Problem sets tab. Loaded before the main script, which calls
   window.CeterisPractice(helpers) once its own helpers exist. */
window.CeterisPractice = function (C) {
  'use strict';
  const { api, iapi, escapeHtml, renderMarkdown, store, STUDENT_KEY, state, root } = C;
  const md = t => renderMarkdown(t);
  const token = () => store.get(STUDENT_KEY);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const ICON_DONE = '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor"/><path d="M4.8 8.3 7 10.4l4.2-4.6" stroke="var(--card)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_SHOWN = '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="7.2" stroke="currentColor" stroke-width="1.6"/><path d="M3.8 8s1.6-2.6 4.2-2.6S12.2 8 12.2 8 10.6 10.6 8 10.6 3.8 8 3.8 8Z" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/></svg>';
  const ICON_BOOK = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 4.2c2.4-.9 4.8-.9 7 .6v11c-2.2-1.5-4.6-1.5-7-.6v-11Zm14 0c-2.4-.9-4.8-.9-7 .6v11c2.2-1.5 4.6-1.5 7-.6v-11Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';

  const isDone = st => st && (st.status === 'solved' || st.status === 'shown');
  const fmtCell = v => (v == null || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : escapeHtml(v));
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

  // A given table from a problem statement (the demand schedule is shown sideways, as in the worksheet).
  function givenTable(t) {
    if (t.transpose) {
      return `<div class="pc-tablewrap"><table class="pc-table pc-given pc-wide"><tbody>${t.columns.map((c, i) => `<tr><th scope="row">${escapeHtml(c)}</th>${t.rows.map(r => `<td>${fmtCell(r[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    return `<div class="pc-tablewrap"><table class="pc-table pc-given"><thead><tr>${t.columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map(v => `<td>${fmtCell(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  const problemBody = p => p.body.map(b => b.md ? `<div class="md">${md(b.md)}</div>` : b.table ? givenTable(b.table) : '').join('');

  let toastTimer = null;
  function toast(msg) {
    let t = document.getElementById('pc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'pc-toast'; t.className = 'ess-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }

  // ===================================================================================
  // Student: card on the tutoring screen

  async function loadStudentHome(cardEl) {
    let d;
    try { d = await api('/api/practice/student', { token: token() }); }
    catch (e) { if (e.status === 401) C.logoutStudent(); return; }
    if (!cardEl || !cardEl.isConnected) return;
    cardEl.innerHTML = d.sets.length ? `
      <div class="panel-card pc-card">
        <div class="panel-head"><div class="panel-title">Problem sets</div></div>
        <div class="panel-body">${d.sets.map(s => {
          const done = s.solved + s.shown;
          return `<div class="pc-row">
            <div class="pc-row-main">
              <div class="ess-title">${escapeHtml(s.title)}</div>
              <div class="ess-meta">${escapeHtml(s.subtitle || '')}</div>
              <div class="pc-meter" role="img" aria-label="${done} of ${s.total} steps done"><span style="width:${pct(done, s.total)}%"></span></div>
              <div class="ess-meta">${done ? `${done} of ${s.total} steps` : `${s.total} steps`}</div>
            </div>
            <button class="eb-btn pc-open" data-set="${escapeHtml(s.id)}">${done >= s.total ? 'Review' : done ? 'Continue' : 'Start'}</button>
          </div>`;
        }).join('')}</div>
      </div>` : '';
    cardEl.querySelectorAll('[data-set]').forEach(b => { b.onclick = () => openSet(b.dataset.set); });
  }

  function openSet(id) { state.practiceId = id; C.go('student-practice'); }

  // ===================================================================================
  // Student: the problem-set screen

  async function renderStudentPractice() {
    root.innerHTML = `
      <header class="topbar">
        <div class="brand">Ceteris</div>
        <div class="topbar-right">${C.themeSwitch()}<button class="link-btn" id="pc-back">Back to Ceteris</button></div>
      </header>
      <main class="pc-wrap" id="pc-main"><div class="essay-loading">Loading your problem set…</div></main>`;
    C.bindThemeSwitches();
    document.getElementById('pc-back').onclick = () => C.go('student-chat');
    const main = document.getElementById('pc-main');
    let d;
    try { d = await api(`/api/practice/${encodeURIComponent(state.practiceId)}/student`, { token: token() }); }
    catch (e) {
      if (e.status === 401) return C.logoutStudent();
      main.innerHTML = `<div class="essay-narrow"><div class="box"><p>${escapeHtml(e.message)}</p><button class="role-btn primary" id="pc-home">Back to Ceteris</button></div></div>`;
      document.getElementById('pc-home').onclick = () => C.go('student-chat');
      return;
    }
    if (state.view !== 'student-practice' || !main.isConnected) return;
    runSet(main, d);
  }

  function runSet(main, d) {
    const set = d.set;
    let progress = d.progress;
    const chat = d.chat.slice();
    let sel = Math.max(0, set.problems.findIndex(p => p.steps.some(s => !isDone(s.state))));
    let justDone = null; // the step whose "why it works" opens automatically
    let busy = false, coachBusy = false, coachNote = null, coachUnread = false;
    const drafts = {}; // explanation drafts per step, kept while the student moves around

    main.innerHTML = `
      <div class="pc-status">
        <div>
          <div class="ew-title">${escapeHtml(set.title)}</div>
          <div class="pc-sub">${escapeHtml(set.subtitle || '')}</div>
        </div>
        <div class="pc-status-right">
          <div class="pc-overall"><div class="pc-meter wide" aria-hidden="true"><span id="pc-meter"></span></div><span id="pc-count" class="pc-count"></span></div>
          ${d.isDemo ? '<button class="link-btn plain" id="pc-restart">Start over</button>' : ''}
        </div>
      </div>
      <div class="ew-tabs pc-tabs" role="tablist" aria-label="Show">
        <button role="tab" data-pane="work" class="active" aria-selected="true">Problems</button>
        <button role="tab" data-pane="coach" aria-selected="false">Coach<span class="dot" hidden></span></button>
      </div>
      <div class="pc-grid" id="pc-grid" data-pane="work">
        <section class="pc-work" aria-label="Problems">
          <nav class="pc-probs" id="pc-probs" aria-label="Problems in this set"></nav>
          <div id="pc-problem"></div>
        </section>
        <aside class="ew-coach pc-coach" aria-label="Problem-set coach">
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
    const navEl = document.getElementById('pc-probs');

    function relock(p) {
      let blocked = false;
      p.steps.forEach(s => { s.locked = blocked; if (!isDone(s.state)) blocked = true; });
    }
    const currentStep = p => p.steps.find(s => !isDone(s.state)) || p.steps[p.steps.length - 1];
    const problemDone = p => p.steps.every(s => isDone(s.state));

    function renderStatus() {
      const done = progress.solved + progress.shown;
      document.getElementById('pc-meter').style.width = pct(done, progress.total) + '%';
      document.getElementById('pc-count').textContent = `${done} of ${progress.total} steps${progress.shown ? ` · ${progress.shown} with the solution shown` : ''}`;
    }

    function renderNav() {
      navEl.innerHTML = set.problems.map((p, i) => {
        const n = p.steps.filter(s => isDone(s.state)).length;
        return `<button class="pc-prob${i === sel ? ' active' : ''}${n === p.steps.length ? ' done' : ''}" data-prob="${i}" aria-current="${i === sel ? 'true' : 'false'}">
          <span class="pc-prob-num">${i + 1}</span>
          <span class="pc-prob-text"><span class="pc-prob-title">${escapeHtml(p.title)}</span><span class="pc-prob-meta">${n === p.steps.length ? 'Done' : `${n} of ${p.steps.length}`}</span></span>
        </button>`;
      }).join('');
      navEl.querySelectorAll('[data-prob]').forEach(b => { b.onclick = () => { sel = +b.dataset.prob; justDone = null; renderAll(); window.scrollTo({ top: 0 }); }; });
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

    function stepHtml(s, n) {
      const st = s.state, done = isDone(st);
      const statusIcon = st.status === 'solved' ? `<span class="pc-badge ok" title="Solved">${ICON_DONE}</span>`
        : st.status === 'shown' ? `<span class="pc-badge shown" title="Solution shown">${ICON_SHOWN}</span>`
        : `<span class="pc-badge num">${n}</span>`;
      if (done) {
        const yours = `<span class="pc-yourans">${escapeHtml(s.solution)}</span>`;
        return `<li class="pc-step done ${st.status}" id="step-${s.id}">
          <div class="pc-step-head">${statusIcon}<div class="pc-prompt md">${md(s.prompt)}</div></div>
          <div class="pc-step-body">
            ${s.kind === 'table' || s.kind === 'explain' ? inputHtml(s) : `<div class="pc-result">${st.status === 'shown' ? '<span class="pc-tag">Solution</span>' : ''}${yours}</div>`}
            <details class="pc-why"${justDone === s.id ? ' open' : ''}><summary>${s.kind === 'explain' ? (st.status === 'solved' ? 'Compare with the model answer' : 'Model answer') : 'Why it works'}</summary>
              <div class="md">${md(s.kind === 'explain' ? s.solution : s.worked)}</div></details>
            ${st.status === 'solved' && s.kind === 'explain' && st.review && st.review.feedback ? `<div class="pc-feedback ok">${escapeHtml(st.review.feedback)}</div>` : ''}
          </div>
        </li>`;
      }
      if (s.locked) return '';
      const hints = st.hints || [];
      return `<li class="pc-step current" id="step-${s.id}">
        <div class="pc-step-head">${statusIcon}<div class="pc-prompt md">${md(s.prompt)}</div></div>
        <div class="pc-step-body">
          ${inputHtml(s)}
          ${st.feedback ? `<div class="pc-feedback bad" role="alert">${md(st.feedback)}</div>` : '<div class="pc-feedback-slot" aria-live="polite"></div>'}
          ${hints.length ? `<ol class="pc-hints">${hints.map(h => `<li><span class="pc-hint-label">Hint</span>${md(h)}</li>`).join('')}</ol>` : ''}
          <div class="pc-actions">
            <button class="role-btn primary pc-check" data-check="${s.id}">${s.kind === 'explain' ? 'Submit for review' : 'Check'}</button>
            ${st.hintsLeft ? `<button class="link-btn plain" data-hint="${s.id}">${hints.length ? 'Another hint' : 'Hint'}</button>`
              : `<button class="link-btn plain pc-reveal" data-reveal="${s.id}">Show the solution</button>`}
            ${st.attempts ? `<span class="pc-tries">${st.attempts} ${s.kind === 'explain' ? (st.attempts === 1 ? 'review' : 'reviews') : (st.attempts === 1 ? 'wrong try' : 'wrong tries')}</span>` : ''}
          </div>
        </div>
      </li>`;
    }

    function renderProblem() {
      const p = set.problems[sel];
      relock(p);
      const remaining = p.steps.filter(s => s.locked).length;
      const nextIdx = set.problems.findIndex((q, i) => i > sel && !problemDone(q));
      const firstOpen = set.problems.findIndex(q => !problemDone(q));
      probEl.innerHTML = `
        <article class="pc-problem">
          <header class="pc-problem-head"><span class="pc-problem-num">Problem ${sel + 1}</span><h2>${escapeHtml(p.title)}</h2></header>
          <div class="pc-statement">${problemBody(p)}</div>
          ${sel === 0 && !p.steps.some(s => s.state.attempts || isDone(s.state)) ? `<p class="pc-intro">${escapeHtml(set.intro || '')}</p>` : ''}
          <ol class="pc-steps">${p.steps.map((s, i) => stepHtml(s, i + 1)).join('')}</ol>
          ${remaining ? `<div class="pc-more">${remaining} more step${remaining === 1 ? '' : 's'} in this problem</div>` : ''}
          ${problemDone(p) ? `<div class="pc-complete">${ICON_DONE}<div><strong>Problem ${sel + 1} done.</strong> ${nextIdx >= 0 || firstOpen >= 0 ? '' : 'That’s the whole problem set. Well done.'}</div>
            ${nextIdx >= 0 ? `<button class="role-btn primary" id="pc-next">Problem ${nextIdx + 1} →</button>` : firstOpen >= 0 ? `<button class="role-btn primary" id="pc-next" data-to="${firstOpen}">Back to problem ${firstOpen + 1}</button>` : ''}</div>` : ''}
        </article>`;
      bindProblem(p);
    }

    function bindProblem(p) {
      probEl.querySelectorAll('[data-check]').forEach(b => { b.onclick = () => submit(p, b.dataset.check); });
      probEl.querySelectorAll('[data-hint]').forEach(b => { b.onclick = () => hint(p, b.dataset.hint, false); });
      probEl.querySelectorAll('[data-reveal]').forEach(b => {
        b.onclick = () => {
          if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'Show it? (counts as shown, not solved)'; return; }
          hint(p, b.dataset.reveal, true);
        };
      });
      const cur = p.steps.find(s => !s.locked && !isDone(s.state));
      if (cur) {
        const el = document.getElementById('in-' + cur.id);
        if (cur.kind === 'number' && el) el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(p, cur.id); } });
        if (cur.kind === 'explain' && el) el.addEventListener('input', () => { drafts[cur.id] = el.value; });
        if (cur.kind === 'table' && el) {
          el.querySelectorAll('input').forEach(inp => {
            inp.addEventListener('input', () => inp.parentElement.classList.remove('ok', 'bad'));
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(p, cur.id); } });
          });
        }
      }
      const next = document.getElementById('pc-next');
      if (next) next.onclick = () => {
        const to = next.dataset.to != null ? +next.dataset.to : set.problems.findIndex((q, i) => i > sel && !problemDone(q));
        sel = to; justDone = null; renderAll(); window.scrollTo({ top: 0 });
      };
    }

    function focusCurrent() {
      const p = set.problems[sel];
      const cur = p.steps.find(s => !s.locked && !isDone(s.state));
      if (!cur) return;
      const el = document.getElementById('in-' + cur.id);
      const li = document.getElementById('step-' + cur.id);
      if (li && li.getBoundingClientRect().top > window.innerHeight - 120) li.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (!el) return;
      const target = cur.kind === 'table' ? (el.querySelector('td.bad input') || Array.from(el.querySelectorAll('input')).find(i => !i.value) || el.querySelector('input'))
        : cur.kind === 'choice' ? null : el;
      if (target) target.focus({ preventScroll: true });
    }

    function applyStep(p, step) {
      const i = p.steps.findIndex(s => s.id === step.id);
      if (i >= 0) p.steps[i] = Object.assign({}, step, { locked: false });
    }

    function gather(s) {
      const el = document.getElementById('in-' + s.id);
      if (s.kind === 'number') return { answer: el ? el.value : '' };
      if (s.kind === 'choice') {
        const vals = Array.from(el.querySelectorAll('input:checked')).map(i => i.value);
        return s.multi ? { choices: vals } : { choice: vals[0] || '' };
      }
      if (s.kind === 'table') { const cells = {}; el.querySelectorAll('input[data-cell]').forEach(i => { cells[i.dataset.cell] = i.value; }); return { cells }; }
      return { text: el ? el.value : '' };
    }

    function inlineNote(s, msg) {
      const li = document.getElementById('step-' + s.id);
      const slot = li && (li.querySelector('.pc-feedback-slot') || li.querySelector('.pc-feedback'));
      if (slot) { slot.className = 'pc-feedback bad'; slot.innerHTML = escapeHtml(msg); }
    }

    async function submit(p, id) {
      const s = p.steps.find(x => x.id === id);
      if (!s || busy) return;
      const body = Object.assign({ step: id }, gather(s));
      const btn = probEl.querySelector(`[data-check="${id}"]`);
      busy = true; if (btn) { btn.disabled = true; btn.textContent = s.kind === 'explain' ? 'Reviewing…' : 'Checking…'; }
      try {
        const r = await api(`/api/practice/${encodeURIComponent(set.id)}/${s.kind === 'explain' ? 'explain' : 'check'}`, { method: 'POST', token: token(), body });
        if (r.invalid) { busy = false; if (btn) { btn.disabled = false; btn.textContent = 'Check'; } return inlineNote(s, r.message); }
        applyStep(p, r.step);
        if (r.progress) progress = r.progress;
        if (r.correct) { justDone = id; delete drafts[id]; }
        busy = false;
        renderAll();
        if (r.correct) {
          const li = document.getElementById('step-' + id);
          if (li) { li.classList.add('flash'); }
        }
        focusCurrent();
      } catch (e) {
        busy = false;
        if (e.status === 401) return C.logoutStudent();
        if (btn) { btn.disabled = false; btn.textContent = s.kind === 'explain' ? 'Submit for review' : 'Check'; }
        inlineNote(s, e.message);
      }
    }

    async function hint(p, id, reveal) {
      if (busy) return;
      busy = true;
      try {
        const r = await api(`/api/practice/${encodeURIComponent(set.id)}/hint`, { method: 'POST', token: token(), body: { step: id, reveal } });
        applyStep(p, r.step);
        if (r.progress) progress = r.progress;
        if (reveal) justDone = id;
        busy = false;
        renderAll();
        if (!reveal) {
          const last = document.querySelector(`#step-${CSS.escape(id)} .pc-hints li:last-child`);
          if (last) last.classList.add('flash');
        }
        focusCurrent();
      } catch (e) {
        busy = false;
        if (e.status === 401) return C.logoutStudent();
        toast(e.message);
      }
    }

    // ---- Coach ----
    const chatEl = document.getElementById('pc-chat');
    const input = document.getElementById('pc-input');
    function renderCoach() {
      const p = set.problems[sel], cur = currentStep(p);
      const n = p.steps.indexOf(cur) + 1;
      document.getElementById('pc-coach-sub').textContent = `Problem ${sel + 1} · step ${n}`;
      const mine = chat.filter(m => String(m.step || '').startsWith(p.key + '.'));
      chatEl.innerHTML = (mine.length ? '' : `<p class="ec-empty">Stuck? Ask about the step you’re on. The coach knows the problem and what you’ve tried, and helps you reason it out. It won’t hand you the answer: that’s what “Show the solution” is for.</p>`)
        + mine.map(m => m.role === 'student'
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
      const p = set.problems[sel], cur = currentStep(p);
      input.value = ''; autoGrow();
      coachNote = null;
      chat.push({ role: 'student', content: text, step: cur.id });
      coachBusy = true; renderCoach();
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await api(`/api/practice/${encodeURIComponent(set.id)}/ask`, { method: 'POST', token: token(), body: { step: cur.id, message: text } });
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

    // ---- Problems | Coach on narrow screens ----
    const tabs = Array.from(document.querySelectorAll('.pc-tabs [data-pane]'));
    function updateTabs() {
      tabs.forEach(b => {
        const on = b.dataset.pane === grid.dataset.pane;
        b.classList.toggle('active', on); b.setAttribute('aria-selected', on);
        const dot = b.querySelector('.dot'); if (dot) dot.hidden = !(b.dataset.pane === 'coach' && coachUnread);
      });
    }
    tabs.forEach(b => { b.onclick = () => { grid.dataset.pane = b.dataset.pane; if (b.dataset.pane === 'coach') coachUnread = false; updateTabs(); }; });

    const restart = document.getElementById('pc-restart');
    if (restart) restart.onclick = async () => {
      if (!restart.classList.contains('confirm')) { restart.classList.add('confirm'); restart.textContent = 'Erase all progress?'; return; }
      try { await api(`/api/practice/${encodeURIComponent(set.id)}/restart`, { method: 'POST', token: token() }); C.go('student-practice'); }
      catch (e) { toast(e.message); }
    };

    function renderAll() { renderStatus(); renderNav(); renderProblem(); renderCoach(); }
    renderAll();
    focusCurrent();
  }

  // ===================================================================================
  // Instructor: Problem sets tab

  const dashBody = () => document.getElementById('dash-body');
  let progSection = 'all';

  async function renderInstructorPractice(flash) {
    const body = dashBody();
    body.innerHTML = '<div class="empty-state">Loading problem sets…</div>';
    let d;
    try { d = await iapi('/api/practice'); }
    catch (e) { body.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }
    if (!body.isConnected) return;
    body.innerHTML = `
      <div class="dash-controls"><span class="dash-note">${flash ? escapeHtml(flash) : 'Step-by-step coaching through a problem set. Students see a set once it’s open for one of their sections, and keep it until you close it.'}</span></div>
      ${d.sets.map(s => `
        <div class="box pc-setbox">
          <div class="pc-setbox-head">
            <div class="pc-setbox-icon">${ICON_BOOK}</div>
            <div class="pc-setbox-title"><h2>${escapeHtml(s.title)}</h2><div class="pc-sub">${escapeHtml(s.subtitle || '')} · ${s.problems} problems · ${s.steps} steps</div></div>
            <div class="pc-setbox-actions">
              <button class="link-btn plain" data-progress="${escapeHtml(s.id)}">Progress${s.started ? ` (${s.started} started)` : ''}</button>
              <button class="link-btn plain" data-key="${escapeHtml(s.id)}">Answer key</button>
            </div>
          </div>
          ${s.sections.length ? `<fieldset class="pc-assign"><legend>Open for</legend>${s.sections.map(x => `
            <label class="pc-assign-opt"><input type="checkbox" data-set="${escapeHtml(s.id)}" value="${x.id}"${x.assigned ? ' checked' : ''}><span>${escapeHtml(x.name)}</span><span class="pc-assign-n">${x.students} student${x.students === 1 ? '' : 's'}</span></label>`).join('')}
            <span class="pc-assign-status" aria-live="polite"></span></fieldset>`
            : '<p class="dash-note">Create a section in Sections &amp; students to open this set for your students.</p>'}
        </div>`).join('')}`;
    body.querySelectorAll('[data-progress]').forEach(b => { b.onclick = () => { progSection = 'all'; renderProgress(b.dataset.progress); }; });
    body.querySelectorAll('[data-key]').forEach(b => { b.onclick = () => renderKey(b.dataset.key); });
    body.querySelectorAll('.pc-assign').forEach(fs => {
      const status = fs.querySelector('.pc-assign-status');
      fs.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.onchange = async () => {
          const ids = Array.from(fs.querySelectorAll('input:checked')).map(x => +x.value);
          status.textContent = 'Saving…';
          try { await iapi(`/api/practice/${encodeURIComponent(cb.dataset.set)}/sections`, { method: 'PUT', body: { sectionIds: ids } }); status.textContent = 'Saved'; }
          catch (e) { status.textContent = e.message; cb.checked = !cb.checked; }
        };
      });
    });
  }

  function cellMark(c) {
    if (!c) return '<td class="pg-cell" aria-label="not reached"></td>';
    if (c.s === 'solved') return `<td class="pg-cell ${c.f ? 'first' : 'later'}" title="${c.f ? 'Solved on the first try' : `Solved after ${c.a} wrong ${c.a === 1 ? 'try' : 'tries'}${c.h ? `, ${c.h} hint${c.h === 1 ? '' : 's'}` : ''}`}">${c.f ? '✓' : `✓<sup>${c.a || ''}${c.h ? 'h' : ''}</sup>`}</td>`;
    if (c.s === 'shown') return `<td class="pg-cell shown" title="Solution shown after ${c.a} wrong ${c.a === 1 ? 'try' : 'tries'} and ${c.h} hint${c.h === 1 ? '' : 's'}">S</td>`;
    return `<td class="pg-cell trying" title="Working on it: ${c.a} wrong ${c.a === 1 ? 'try' : 'tries'}, ${c.h} hint${c.h === 1 ? '' : 's'}">${c.a || '·'}</td>`;
  }

  async function renderProgress(setId) {
    const body = dashBody();
    body.innerHTML = `<button class="link-btn plain back-link" id="pg-back">← All problem sets</button><div id="pg-wrap"><div class="empty-state">Loading progress…</div></div>`;
    document.getElementById('pg-back').onclick = () => renderInstructorPractice();
    let d;
    try { d = await iapi(`/api/practice/${encodeURIComponent(setId)}/progress${progSection !== 'all' ? `?section=${progSection}` : ''}`); }
    catch (e) { const w = document.getElementById('pg-wrap'); if (w) w.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }
    const wrap = document.getElementById('pg-wrap');
    if (!wrap) return;
    const ol = d.set.problems, ids = ol.flatMap(p => p.steps.map(s => s.id));
    const label = Object.fromEntries(ol.flatMap((p, pi) => p.steps.map((s, si) => [s.id, { p: pi + 1, n: si + 1, label: s.label, problem: p.title }])));
    const started = d.rows.filter(r => r.startedAt).length;
    const finished = d.rows.filter(r => r.solved + r.shown === r.total).length;
    const secs = [];
    d.rows.forEach(r => r.sections.forEach(s => { if (!secs.some(x => x.id === s.id)) secs.push(s); }));
    // Where students get stuck: wrong tries plus (heavily) solutions shown, among students who reached the step.
    const stuck = ids.map(id => ({ id, ...d.stats[id], score: d.stats[id].wrong + 3 * d.stats[id].shown + d.stats[id].hints }))
      .filter(x => x.reached && x.score).sort((a, b) => b.score - a.score).slice(0, 5);
    wrap.innerHTML = `
      <div class="box sub-head">
        <div class="sub-title-row"><h2>${escapeHtml(d.set.title)}</h2>
          ${secs.length > 1 || progSection !== 'all' ? `<label class="sr-only" for="pg-sec">Section</label><select id="pg-sec" class="select section-select"><option value="all">All my sections</option>${(secs.length ? secs : []).map(x => `<option value="${x.id}"${String(x.id) === String(progSection) ? ' selected' : ''}>${escapeHtml(x.name)}</option>`).join('')}</select>` : ''}</div>
        <div class="stats sub-stats">
          <div class="stat"><div class="stat-num">${started}</div><div class="stat-label">started</div></div>
          <div class="stat"><div class="stat-num">${finished}</div><div class="stat-label">finished</div></div>
          <div class="stat"><div class="stat-num">${d.rows.length - started}</div><div class="stat-label">not started</div></div>
        </div>
      </div>
      ${stuck.length ? `<div class="box"><h2>Where students get stuck</h2><ol class="pg-stuck">${stuck.map(x => `
        <li><span class="pg-stuck-name">Problem ${label[x.id].p}, step ${label[x.id].n} · ${escapeHtml(label[x.id].label)}</span>
        <span class="pg-stuck-nums">${x.wrong} wrong ${x.wrong === 1 ? 'try' : 'tries'} · ${x.hints} hint${x.hints === 1 ? '' : 's'} · solution shown to ${x.shown} of ${x.reached}</span></li>`).join('')}</ol></div>` : ''}
      ${d.rows.length ? `<div class="pg-legend"><span><b class="pg-cell first">✓</b> first try</span><span><b class="pg-cell later">✓<sup>2</sup></b> after 2 wrong tries (h = used hints)</span><span><b class="pg-cell shown">S</b> solution shown</span><span><b class="pg-cell trying">1</b> working on it</span></div>
      <div class="table-scroll"><table class="data-table pg-table">
        <thead><tr><th rowspan="2" class="pg-name">Student</th>${ol.map((p, i) => `<th colspan="${p.steps.length}" class="pg-prob" title="${escapeHtml(p.title)}">${i + 1}. ${escapeHtml(p.title)}</th>`).join('')}<th rowspan="2">Done</th><th rowspan="2" title="Questions to the coach">Qs</th></tr>
        <tr>${ol.map(p => p.steps.map((s, i) => `<th class="pg-step${i === 0 ? ' first' : ''}" title="${escapeHtml(s.label)}">${i + 1}</th>`).join('')).join('')}</tr></thead>
        <tbody>${d.rows.map(r => `<tr>
          <td class="pg-name">${r.startedAt ? `<button class="link-btn plain sub-name" data-stu="${escapeHtml(r.studentId)}">${escapeHtml(r.name || r.studentId)}</button>` : escapeHtml(r.name || r.studentId)}<div class="mono sub-id">${escapeHtml(r.studentId)}</div></td>
          ${ol.map(p => p.steps.map((s, i) => cellMark(r.steps[s.id]).replace('class="pg-cell', `class="pg-cell${i === 0 ? ' first-col' : ''}`)).join('')).join('')}
          <td class="num">${r.solved + r.shown}/${r.total}</td><td class="num">${r.questions || ''}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><td class="pg-name">Solved first try</td>${ids.map(id => `<td class="pg-cell foot">${d.stats[id].reached ? pct(d.stats[id].firstTry, d.stats[id].reached) + '%' : ''}</td>`).join('')}<td></td><td></td></tr></tfoot>
      </table></div>` : '<div class="empty-state">Open this set for one of your sections to see its students here.</div>'}`;
    const sel = document.getElementById('pg-sec');
    if (sel) sel.onchange = () => { progSection = sel.value; renderProgress(setId); };
    wrap.querySelectorAll('[data-stu]').forEach(b => { b.onclick = () => renderStudentWork(setId, b.dataset.stu); });
  }

  async function renderStudentWork(setId, sid) {
    const body = dashBody();
    body.innerHTML = `<button class="link-btn plain back-link" id="sw-back">← Progress</button><div id="sw-wrap"><div class="empty-state">Loading…</div></div>`;
    document.getElementById('sw-back').onclick = () => renderProgress(setId);
    let d;
    try { d = await iapi(`/api/practice/${encodeURIComponent(setId)}/work/${encodeURIComponent(sid)}`); }
    catch (e) { document.getElementById('sw-wrap').innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }
    const wrap = document.getElementById('sw-wrap');
    if (!wrap) return;
    const fmtAns = a => typeof a === 'string' ? escapeHtml(a) : Array.isArray(a) ? escapeHtml(a.join(', ')) : a && typeof a === 'object' ? `${Object.keys(a).length} cells` : '';
    wrap.innerHTML = `
      <div class="box"><h2>${escapeHtml(d.student.name || d.student.studentId)} <span class="mono sub-id">${escapeHtml(d.student.studentId)}</span></h2>
        <p class="dash-note">${escapeHtml(d.set.title)} · ${d.progress.solved} solved · ${d.progress.shown} shown · ${d.progress.total - d.progress.solved - d.progress.shown} to go</p></div>
      ${d.problems.map((p, pi) => `<div class="box sw-prob"><h2>${pi + 1}. ${escapeHtml(p.title)}</h2><ol class="sw-steps">${p.steps.map(s => `
        <li class="sw-step ${s.status || 'none'}">
          <div class="sw-head"><span class="sw-label">${escapeHtml(s.label)}</span>
            <span class="badge ${s.status === 'solved' ? 'badge-ok' : s.status === 'shown' ? 'badge-flag' : ''}">${s.status === 'solved' ? (s.firstTry ? 'first try' : 'solved') : s.status === 'shown' ? 'solution shown' : s.attempts || s.hints ? 'in progress' : 'not reached'}</span>
            ${s.attempts || s.hints ? `<span class="dash-note">${s.attempts} wrong · ${s.hints} hint${s.hints === 1 ? '' : 's'}</span>` : ''}</div>
          ${s.log.length ? `<ul class="sw-log">${s.log.map(l => l.shown ? '<li class="shown">Showed the solution</li>' : `<li class="${l.ok ? 'ok' : 'bad'}">${s.kind === 'explain' ? `“${fmtAns(l.answer)}”${l.feedback ? `<div class="sw-fb">Coach: ${escapeHtml(l.feedback)}</div>` : ''}` : fmtAns(l.answer)}</li>`).join('')}</ul>` : ''}
          ${s.key && s.log.length ? `<div class="sw-key">Key: ${escapeHtml(s.key.length > 140 ? s.key.slice(0, 140) + '…' : s.key)}</div>` : ''}
          ${s.chat.length ? `<div class="sw-chat">${s.chat.map(m => `<div class="sw-msg ${m.role}"><span>${m.role === 'student' ? 'Student' : 'Coach'}</span>${m.role === 'coach' ? `<div class="md">${md(m.content)}</div>` : escapeHtml(m.content)}</div>`).join('')}</div>` : ''}
        </li>`).join('')}</ol></div>`).join('')}`;
  }

  async function renderKey(setId) {
    const body = dashBody();
    body.innerHTML = `<button class="link-btn plain back-link" id="ak-back">← All problem sets</button><div id="ak-wrap"><div class="empty-state">Loading…</div></div>`;
    document.getElementById('ak-back').onclick = () => renderInstructorPractice();
    let d;
    try { d = await iapi(`/api/practice/${encodeURIComponent(setId)}/key`); }
    catch (e) { document.getElementById('ak-wrap').innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }
    const wrap = document.getElementById('ak-wrap');
    if (!wrap) return;
    const set = d.set;
    wrap.innerHTML = `
      <div class="box"><h2>${escapeHtml(set.title)}: answer key</h2><p class="dash-note">What the coach checks against, with the hints, the feedback for common mistakes, and the explanation each student sees after a step. Students never see this page.</p></div>
      ${set.problems.map((p, pi) => `<div class="box ak-prob">
        <h2>${pi + 1}. ${escapeHtml(p.title)}</h2>
        <div class="pc-statement">${problemBody(p)}</div>
        <ol class="ak-steps">${p.steps.map(s => `<li>
          <div class="md ak-prompt">${md(s.prompt)}</div>
          ${s.kind === 'table' ? (() => {
            const t = { columns: s.columns.map(c => c.label), rows: s.rows.map((r, i) => s.columns.map(c => c.given ? r.values[c.key] : r.fill.includes(c.key) ? s.solution[`${i}.${c.key}`] : '—')) };
            return givenTable(t);
          })() : `<div class="ak-answer"><span class="pc-tag">${s.kind === 'explain' ? 'Model answer' : 'Answer'}</span> ${escapeHtml(s.solution)}</div>`}
          ${s.mustHave ? `<div class="ak-sub"><strong>Accepted when it:</strong><ul>${s.mustHave.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul></div>` : ''}
          ${s.kind !== 'explain' ? `<details class="pc-why"><summary>Why it works (shown after the step)</summary><div class="md">${md(s.worked)}</div></details>` : ''}
          ${s.hints.length ? `<div class="ak-sub"><strong>Hints:</strong><ol>${s.hints.map(h => `<li>${md(h)}</li>`).join('')}</ol></div>` : ''}
          ${s.mistakes.length || s.optionMsgs.length || s.patterns.length ? `<div class="ak-sub"><strong>Feedback for common mistakes:</strong><ul>
            ${s.mistakes.map(m => `<li><span class="mono">${escapeHtml(String(m.value))}</span>: ${md(m.msg)}</li>`).join('')}
            ${s.optionMsgs.map(o => `<li>${o.msg ? `<em>${escapeHtml(o.label)}</em> picked: ${md(o.msg)}` : ''}${o.missMsg ? `<em>${escapeHtml(o.label)}</em> left out: ${md(o.missMsg)}` : ''}</li>`).join('')}
            ${s.patterns.map(w => `<li><span class="mono">${escapeHtml(w.col)}</span> column: ${md(w.msg)}</li>`).join('')}
          </ul></div>` : ''}
        </li>`).join('')}</ol></div>`).join('')}`;
  }

  return { loadStudentHome, renderStudentPractice, openSet, renderInstructorPractice };
};
