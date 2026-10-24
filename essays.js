// Mini-essay writing coach: students write a short in-class essay inside Ceteris,
// guided through planning stages by a coach that never writes for them, and submit
// before the end of class. The instructor sets up each essay and reads every paper
// with its plan and coach conversation.

const STAGE_KEY = /^[a-z0-9_-]{1,40}$/;
const GRACE_SECONDS = 90; // late autosaves still land this long after the end time
const MAX_COACH_MESSAGES = 60; // per student per essay, to bound cost
const SNAPSHOT_EVERY_SECONDS = 30;

// The first essay, from the design doc's "Mini-essay 1: Airbnb taxes" tab. Seeded once,
// unscheduled, so the instructor only has to set a time to open it.
const AIRBNB_ESSAY = {
  title: 'Airbnb taxes and housing',
  prompt: 'Some of the taxes imposed on tourists, notably Airbnb taxes, are purportedly intended to offset their impact on housing for residents, in spite of the fact that the funds go into the general treasury. Thinking in terms of externalities, can these taxes still have an impact on housing availability if none of the revenues go toward building new homes?',
  config: {
    stages: [
      { key: 'claim', title: 'Claim', minutes: 2,
        task: 'Answer the question in one sentence: yes, no, or it depends on what.',
        question: 'Can the tax matter even if the money goes elsewhere?' },
      { key: 'externality', title: 'The externality', minutes: 3,
        task: 'Name the cost short-term rentals impose on residents, and who bears it.',
        question: "When a unit becomes an Airbnb, who loses something, and why doesn't the host account for it?" },
      { key: 'mechanism', title: 'Mechanism', minutes: 4,
        task: "Explain how the tax changes a host's choice, and what that does to housing.",
        question: 'Picture a landlord choosing between Airbnb and a yearly lease. What does the tax change in that comparison?' },
      { key: 'limits', title: 'Limits', minutes: 2,
        task: 'Name when the effect would be small, or one side effect.',
        question: 'What if tourists barely change their plans when prices rise? Who pays the tax then?' }
    ],
    draftMinutes: 7,
    checkMinutes: 2,
    targetWords: { min: 250, max: 400 },
    rubric: [
      { criterion: 'Direct answer', weight: 1,
        high: 'A clear position, stated early, that the rest of the essay supports. "It depends" earns full marks when a valid condition is stated.',
        low: 'No position, or one the essay later contradicts.' },
      { criterion: 'The externality', weight: 1,
        high: 'Names a specific cost to residents (fewer long-term units, higher rents, or noise and congestion) and why hosts ignore it.',
        low: '"Airbnb is bad for housing," with no cost or bearer named.' },
      { criterion: 'Mechanism', weight: 2,
        high: 'Traces the tax to a lower payoff from short-term renting, to units returning to long-term leases, to more availability. Says outright that this works wherever the revenue goes.',
        low: 'Argues only through what the government does with the money, or gives no causal chain.' },
      { criterion: 'Limits and side effects', weight: 1,
        high: 'At least one condition that weakens the effect (tourists insensitive to price, a tax small next to the Airbnb premium, hosts moving or evading), or a side effect, with a reason.',
        low: 'None, or a limit asserted without a reason.' },
      { criterion: 'Clarity', weight: 1,
        high: 'Concise and logically ordered, with economic terms used correctly.',
        low: 'Hard to follow, or terms misused.' }
    ],
    bonus: {
      points: 6,
      description: 'Distinguishes the rent effect (a pecuniary externality, working through prices) from technological externalities such as noise and congestion. Not expected, and never prompted.'
    }
  },
  brief: [
    'Core logic: a per-night tax lowers what a host keeps from short-term renting compared with a yearly lease. At the margin, some owners switch to long-term tenants, and fewer investors convert units. Long-term supply rises a little and rents ease. What the revenue funds is a separate, second effect.',
    'What sets the size: (1) Incidence: if tourists barely respond to price, hosts pass most of the tax on, their payoff hardly falls, and few units move; if tourists are price-sensitive, hosts absorb more of it and more units switch. (2) The premium: a small tax will not flip a unit that earns far more on Airbnb than on a lease. (3) Spare-room hosts in their own homes free up no housing either way.',
    'Bonus, not expected: the rent effect is a pecuniary externality, working through prices, which economists distinguish from technological ones like noise, trash and congestion. Never prompt for it.',
    'Side effects: fewer or shorter tourist stays and less spending at local businesses; hotels gain; unregistered listings and evasion; listings moving to untaxed neighboring towns; income lost by hosts who depend on it.',
    'Weak spots to probe: "the money goes to the general fund, so it cannot help housing" (misses the price effect, which is the point of the prompt); "the tax raises prices, so fewer tourists come" (stops before housing); confusing the tax with rent control or a price ceiling; an externality named but never connected to residents; assuming every taxed unit goes back to the long-term market.'
  ].join('\n\n')
};

// ---------------------------------------------------------------------------------
// Helpers

function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<(p|div|li|h\d)(\s[^>]*)?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const squash = t => String(t || '').replace(/\s+/g, ' ').trim();

// Of the student's pastes from their plan, how many words are still in the final essay.
function pasteSummary(pastes, draftText) {
  const essay = squash(draftText);
  const list = (pastes || []).map(p => ({ at: p.at, text: p.text, words: wordCount(p.text), stillInEssay: essay.includes(squash(p.text)) }));
  return {
    pastes: list,
    pastedWords: list.reduce((a, p) => a + p.words, 0),
    pastedWordsKept: list.filter(p => p.stillInEssay).reduce((a, p) => a + p.words, 0)
  };
}

function wordCount(text) {
  const t = String(text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

function str(v, max) {
  return String(v == null ? '' : v).slice(0, max);
}

function int(v, lo, hi, dflt) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

// Validates an essay sent by the instructor's setup form. Returns { essay } or { error }.
function cleanEssay(body) {
  const b = body || {};
  const title = str(b.title, 200).trim();
  const prompt = str(b.prompt, 5000).trim();
  if (!title) return { error: 'Give the essay a title.' };
  if (!prompt) return { error: 'Write the prompt students will answer.' };

  const c = b.config || {};
  const rawStages = Array.isArray(c.stages) ? c.stages.slice(0, 6) : [];
  if (!rawStages.length) return { error: 'Add at least one planning stage.' };
  const keys = new Set();
  const stages = [];
  for (const s of rawStages) {
    const stitle = str(s.title, 80).trim();
    if (!stitle) return { error: 'Every planning stage needs a title.' };
    let key = STAGE_KEY.test(String(s.key || '')) ? s.key : 's' + Math.random().toString(36).slice(2, 8);
    while (keys.has(key)) key = 's' + Math.random().toString(36).slice(2, 8);
    keys.add(key);
    stages.push({ key, title: stitle, minutes: int(s.minutes, 0, 60, 2), task: str(s.task, 500).trim(), question: str(s.question, 500).trim() });
  }

  const rubric = (Array.isArray(c.rubric) ? c.rubric.slice(0, 10) : [])
    .map(r => ({ criterion: str(r.criterion, 120).trim(), weight: Math.min(3, Math.max(0.5, Number(r.weight) || 1)), high: str(r.high, 500).trim(), low: str(r.low, 500).trim() }))
    .filter(r => r.criterion);

  const bonus = c.bonus && Number(c.bonus.points) > 0 && str(c.bonus.description, 1000).trim()
    ? { points: int(c.bonus.points, 1, 20, 1), description: str(c.bonus.description, 1000).trim() }
    : null;

  const tw = c.targetWords || {};
  const min = int(tw.min, 0, 5000, 250), max = int(tw.max, 0, 5000, 400);

  let opensAt = b.opensAt ? new Date(b.opensAt) : null;
  let closesAt = b.closesAt ? new Date(b.closesAt) : null;
  if ((opensAt && isNaN(opensAt)) || (closesAt && isNaN(closesAt))) return { error: 'The session time is not a valid date.' };
  if (!!opensAt !== !!closesAt) return { error: 'Set both a start and an end time, or neither.' };
  if (opensAt && closesAt <= opensAt) return { error: 'The end time must be after the start time.' };

  return {
    essay: {
      title, prompt,
      config: {
        stages,
        draftMinutes: int(c.draftMinutes, 0, 120, 7),
        checkMinutes: int(c.checkMinutes, 0, 60, 2),
        targetWords: { min: Math.min(min, max), max: Math.max(min, max) },
        rubric, bonus
      },
      brief: str(b.brief, 10000),
      opensAt, closesAt,
      coachEnabled: b.coachEnabled !== false
    }
  };
}

function essayStatus(e, now) {
  if (!e.opens_at) return 'unscheduled';
  if (now < new Date(e.opens_at)) return 'scheduled';
  if (now < new Date(e.closes_at)) return 'open';
  return 'closed';
}

// What a student may see of an essay: no private brief, no bonus.
function essayForStudent(e) {
  const c = e.config;
  return {
    id: e.id, title: e.title, prompt: e.prompt,
    stages: c.stages, draftMinutes: c.draftMinutes, checkMinutes: c.checkMinutes, targetWords: c.targetWords,
    // Criterion names and weights only: the "strong answer" descriptions can give the answer away mid-essay.
    rubric: c.rubric.map(r => ({ criterion: r.criterion, weight: r.weight })),
    coachEnabled: e.coach_enabled, opensAt: e.opens_at, closesAt: e.closes_at
  };
}

function essayForInstructor(e, now) {
  return {
    id: e.id, title: e.title, prompt: e.prompt, config: e.config, brief: e.brief,
    coachEnabled: e.coach_enabled, opensAt: e.opens_at, closesAt: e.closes_at,
    status: essayStatus(e, now || new Date()), updatedAt: e.updated_at
  };
}

function workForStudent(w) {
  if (!w) return null;
  return {
    plan: w.plan, draftHtml: w.draft_html, wordingUsed: w.wording_used,
    coach: (w.coach || []).map(m => ({ role: m.role, content: m.content, wording: m.wording || null })),
    status: w.status, autoSubmitted: w.auto_submitted, startedAt: w.started_at, submittedAt: w.submitted_at
  };
}

// ---------------------------------------------------------------------------------
// The coach

function coachSystemPrompt(e, w, stage, instructorName, now) {
  const c = e.config;
  const minutesLeft = Math.max(0, Math.round((new Date(e.closes_at) - now) / 60000));
  const stageLines = c.stages.map((s, i) => `${i + 1}. ${s.title} (about ${s.minutes} min). Student's task: ${s.task}${s.question ? ` Guiding question: ${s.question}` : ''}`);
  stageLines.push(`${c.stages.length + 1}. Draft (about ${c.draftMinutes} min): write the essay with the plan alongside.`);
  stageLines.push(`${c.stages.length + 2}. Check and submit (about ${c.checkMinutes} min): compare the essay with the rubric, then submit.`);
  const stageName = stage === 'draft' ? 'Draft' : stage === 'check' ? 'Check and submit'
    : (c.stages.find(s => s.key === stage) || {}).title || 'Planning';
  const planLines = c.stages.map(s => `- ${s.title}: ${(w.plan && w.plan[s.key]) ? String(w.plan[s.key]).trim() : '(empty)'}`);
  const draft = htmlToText(w.draft_html);
  const rubricLines = c.rubric.map(r => `- ${r.criterion}${r.weight !== 1 ? ` (weight ${r.weight})` : ''}: a strong answer: ${r.high}`);

  return `You are the writing coach inside Ceteris, guiding one student through a short in-class economics essay (principles level). The student writes the essay; you never do.

Hard rules:
- Never write, rewrite or outline any part of the essay: no model sentences, no thesis statements, no paragraphs, no lists of points the student could copy. If asked to write something, decline kindly in one sentence and ask a question that helps them write it themselves.
- Never name the economic concept, mechanism or answer before the student does, and never reveal, quote or hint at the instructor's private notes below, including any bonus.
- Ask one question at a time. Keep replies to two sentences, three at most when you point to a specific problem.
- Feedback order: the logic of the argument first, then structure, then clarity. Mention grammar only when it hides the meaning. Raise one issue per reply, the most important one.
- When pointing to a problem, quote the student's own words briefly.
- Never give a grade, a score or a prediction of one.
- Keep time: if the student lingers past a stage's suggested minutes, nudge them to move on. With little time left, focus on finishing.
- If the draft is short of the target length, ask about the next link in their reasoning; never supply text.
- Plain conversational text. Bold sparingly. No headings.

Wording suggestion: ${w.wording_used
    ? 'already used for this paper. Never offer example phrasing again; if a sentence is unclear, ask what the student meant.'
    : 'available once for this paper. Only when one of the student\'s sentences is genuinely unintelligible, first ask what they meant. Only if it is still unclear after their answer, you may offer ONE example phrasing in exactly this form: <wording original="the student\'s sentence, quoted exactly">your example phrasing</wording>. Then tell them to rewrite the sentence in their own words. Never use this for style, only for meaning.'}

The assignment: "${e.title}"
Prompt: ${e.prompt}
Target length: ${c.targetWords.min} to ${c.targetWords.max} words.
Stages:
${stageLines.join('\n')}

Rubric (the student sees only the criterion names and weights, not these descriptions):
${rubricLines.join('\n') || '(none)'}

Instructor's private notes, for you only (never reveal or quote):
${e.brief || '(none)'}${c.bonus ? `\nBonus (never mention or prompt for it): ${c.bonus.description}` : ''}

Right now: the student is on the "${stageName}" stage, with about ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} left in class. The instructor is ${instructorName}.
Their plan so far:
${planLines.join('\n')}
Their draft (${wordCount(draft)} words):
${draft || '(not started)'}`;
}

const WORDING_TAG = /<wording\s+original="([^"]*)"\s*>([\s\S]*?)<\/wording>/i;

// Enforces the one-suggestion rule on the coach's reply.
function applyWordingRule(rawReply, alreadyUsed) {
  const tidy = s => s.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:!?])/g, '$1');
  const reply = String(rawReply || '');
  const m = reply.match(WORDING_TAG);
  const out = applyWordingRuleInner(reply, m, alreadyUsed);
  return { content: tidy(out.content), wording: out.wording };
}

function applyWordingRuleInner(reply, m, alreadyUsed) {
  if (!m) return { content: reply.replace(/<\/?wording[^>]*>/gi, '').trim(), wording: null };
  if (alreadyUsed) {
    return { content: reply.replace(WORDING_TAG, '').replace(/<\/?wording[^>]*>/gi, '').trim() || 'Try rewriting that sentence in your own words.', wording: null };
  }
  return {
    content: reply.replace(WORDING_TAG, '').replace(/<\/?wording[^>]*>/gi, '').trim() || 'Here is one way it could read. Now write your own version.',
    wording: { original: m[1].slice(0, 600), suggestion: m[2].trim().slice(0, 600) }
  };
}

// ---------------------------------------------------------------------------------

module.exports = function registerEssays(app, deps) {
  const { pool, requireStudent, requireInstructor, callAnthropic, normalizeId, STUDENT_ID_PATTERN, instructorName } = deps;

  async function init() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS essays (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        prompt TEXT NOT NULL,
        config JSONB NOT NULL,
        brief TEXT NOT NULL DEFAULT '',
        opens_at TIMESTAMPTZ,
        closes_at TIMESTAMPTZ,
        coach_enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS essay_work (
        essay_id INT NOT NULL REFERENCES essays(id) ON DELETE CASCADE,
        student_id TEXT NOT NULL,
        plan JSONB NOT NULL DEFAULT '{}'::jsonb,
        draft_html TEXT NOT NULL DEFAULT '',
        draft_text TEXT NOT NULL DEFAULT '',
        coach JSONB NOT NULL DEFAULT '[]'::jsonb,
        wording_used BOOLEAN NOT NULL DEFAULT false,
        status TEXT NOT NULL DEFAULT 'in_progress',
        auto_submitted BOOLEAN NOT NULL DEFAULT false,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        submitted_at TIMESTAMPTZ,
        PRIMARY KEY (essay_id, student_id)
      );
      CREATE TABLE IF NOT EXISTS essay_snapshots (
        id BIGSERIAL PRIMARY KEY,
        essay_id INT NOT NULL,
        student_id TEXT NOT NULL,
        at TIMESTAMPTZ NOT NULL DEFAULT now(),
        plan JSONB NOT NULL,
        draft_html TEXT NOT NULL,
        word_count INT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS essay_snapshots_by_work ON essay_snapshots (essay_id, student_id, at);
      -- Text a student pasted from their own plan notes into the draft (the only paste allowed).
      ALTER TABLE essay_work ADD COLUMN IF NOT EXISTS plan_pastes JSONB NOT NULL DEFAULT '[]'::jsonb;
      CREATE TABLE IF NOT EXISTS app_flags (key TEXT PRIMARY KEY);
    `);
    // Seed the first essay exactly once, even if it is later deleted.
    const seeded = await pool.query(`INSERT INTO app_flags (key) VALUES ('essay_seed_airbnb') ON CONFLICT DO NOTHING RETURNING key`);
    if (seeded.rows[0]) {
      await pool.query('INSERT INTO essays (title, prompt, config, brief) VALUES ($1, $2, $3, $4)',
        [AIRBNB_ESSAY.title, AIRBNB_ESSAY.prompt, JSON.stringify(AIRBNB_ESSAY.config), AIRBNB_ESSAY.brief]);
    }
    await autoSubmit();
    setInterval(() => autoSubmit().catch(e => console.error('Ceteris: auto-submit failed —', e.message)), 30000);
  }

  // Whatever a student has written is submitted automatically once the end time (plus grace) passes.
  async function autoSubmit() {
    await pool.query(`
      UPDATE essay_work w SET status = 'submitted', auto_submitted = true, submitted_at = e.closes_at
      FROM essays e
      WHERE w.essay_id = e.id AND w.status = 'in_progress' AND e.closes_at IS NOT NULL
        AND e.closes_at + ($1 || ' seconds')::interval < now()`, [String(GRACE_SECONDS)]);
  }

  async function loadEssay(id) {
    const n = parseInt(id, 10);
    if (!Number.isInteger(n) || n < 1) return null;
    const r = await pool.query('SELECT * FROM essays WHERE id=$1', [n]);
    return r.rows[0] || null;
  }

  async function loadWork(essayId, studentId) {
    const r = await pool.query('SELECT * FROM essay_work WHERE essay_id=$1 AND student_id=$2', [essayId, studentId]);
    return r.rows[0] || null;
  }

  function writable(e, now) {
    return e.opens_at && now >= new Date(e.opens_at) && now <= new Date(new Date(e.closes_at).getTime() + GRACE_SECONDS * 1000);
  }

  const fail = (res, where) => e => {
    console.error(`Ceteris: ${where} failed —`, e.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  };

  // ---- Student routes -------------------------------------------------------------

  // Essays open right now, plus the student's earlier essays (read-only copies).
  app.get('/api/essays/student', requireStudent, async (req, res) => {
    try {
      await autoSubmit();
      const now = new Date();
      const open = await pool.query(`
        SELECT e.*, w.status AS work_status FROM essays e
        LEFT JOIN essay_work w ON w.essay_id = e.id AND w.student_id = $1
        WHERE e.opens_at <= now() AND e.closes_at > now()
        ORDER BY e.closes_at`, [req.student.id]);
      const past = await pool.query(`
        SELECT e.id, e.title, w.status, w.auto_submitted, w.submitted_at FROM essay_work w
        JOIN essays e ON e.id = w.essay_id
        WHERE w.student_id = $1 AND (w.status = 'submitted' OR e.closes_at <= now())
        ORDER BY COALESCE(w.submitted_at, e.closes_at) DESC LIMIT 20`, [req.student.id]);
      res.json({
        serverTime: now.toISOString(),
        open: open.rows.map(e => ({ id: e.id, title: e.title, closesAt: e.closes_at, workStatus: e.work_status || null })),
        past: past.rows.map(r => ({ id: r.id, title: r.title, autoSubmitted: r.auto_submitted, submittedAt: r.submitted_at }))
      });
    } catch (e) { fail(res, 'essay list')(e); }
  });

  app.get('/api/essays/:id/student', requireStudent, async (req, res) => {
    try {
      await autoSubmit();
      const e = await loadEssay(req.params.id);
      if (!e) return res.status(404).json({ error: 'Essay not found.' });
      const w = await loadWork(e.id, req.student.id);
      const now = new Date();
      if (!w && essayStatus(e, now) !== 'open') return res.status(404).json({ error: 'This essay is not open right now.' });
      res.json({ serverTime: now.toISOString(), instructorName, essay: essayForStudent(e), work: workForStudent(w) });
    } catch (err) { fail(res, 'essay fetch')(err); }
  });

  // Starting = the student has read the rules (what the instructor will see) and begins.
  app.post('/api/essays/:id/start', requireStudent, async (req, res) => {
    try {
      const e = await loadEssay(req.params.id);
      if (!e || essayStatus(e, new Date()) !== 'open') return res.status(400).json({ error: 'This essay is not open right now.' });
      await pool.query(`INSERT INTO essay_work (essay_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [e.id, req.student.id]);
      res.json({ work: workForStudent(await loadWork(e.id, req.student.id)) });
    } catch (err) { fail(res, 'essay start')(err); }
  });

  // Autosave of the plan and draft.
  app.put('/api/essays/:id/work', requireStudent, async (req, res) => {
    try {
      const e = await loadEssay(req.params.id);
      if (!e) return res.status(404).json({ error: 'Essay not found.' });
      const now = new Date();
      if (!writable(e, now)) return res.status(409).json({ error: 'Time is up for this essay.', closed: true });
      const w = await loadWork(e.id, req.student.id);
      if (!w) return res.status(400).json({ error: 'Start the essay first.' });
      if (w.status !== 'in_progress') return res.status(409).json({ error: 'This essay has already been submitted.', closed: true });

      const keys = e.config.stages.map(s => s.key);
      const plan = {};
      const raw = (req.body && req.body.plan) || {};
      keys.forEach(k => { if (raw[k] != null) plan[k] = str(raw[k], 2000); });
      const draftHtml = str(req.body && req.body.draftHtml, 100000);
      const draftText = htmlToText(draftHtml);
      const planDone = keys.every(k => String(plan[k] || '').trim());
      if (draftText && !planDone) return res.status(400).json({ error: 'Finish each planning step before drafting.' });

      // Pastes from the plan: kept only if the text really is part of one of the plan notes.
      const planNotes = keys.map(k => squash(plan[k]));
      const pastes = (Array.isArray(req.body && req.body.pastes) ? req.body.pastes.slice(0, 50) : [])
        .map(p => ({ at: new Date().toISOString(), text: squash(str(p && p.text, 2000)) }))
        .filter(p => p.text && planNotes.some(n => n.includes(p.text)));

      await pool.query(`UPDATE essay_work SET plan=$3, draft_html=$4, draft_text=$5, updated_at=now(),
                          plan_pastes = CASE WHEN jsonb_array_length(plan_pastes) < 500 THEN plan_pastes || $6::jsonb ELSE plan_pastes END
                        WHERE essay_id=$1 AND student_id=$2`,
        [e.id, req.student.id, JSON.stringify(plan), draftHtml, draftText, JSON.stringify(pastes)]);

      // Draft history: a snapshot at most every 30 seconds, only when something changed.
      const last = await pool.query(`SELECT at, plan, draft_html FROM essay_snapshots WHERE essay_id=$1 AND student_id=$2 ORDER BY at DESC LIMIT 1`, [e.id, req.student.id]);
      const prev = last.rows[0];
      const changed = !prev || prev.draft_html !== draftHtml || JSON.stringify(prev.plan) !== JSON.stringify(plan);
      if (changed && (!prev || now - new Date(prev.at) >= SNAPSHOT_EVERY_SECONDS * 1000)) {
        await pool.query(`INSERT INTO essay_snapshots (essay_id, student_id, plan, draft_html, word_count) VALUES ($1, $2, $3, $4, $5)`,
          [e.id, req.student.id, JSON.stringify(plan), draftHtml, wordCount(draftText)]);
      }
      res.json({ savedAt: now.toISOString(), words: wordCount(draftText) });
    } catch (err) { fail(res, 'essay save')(err); }
  });

  app.post('/api/essays/:id/coach', requireStudent, async (req, res) => {
    try {
      const e = await loadEssay(req.params.id);
      if (!e) return res.status(404).json({ error: 'Essay not found.' });
      if (!e.coach_enabled) return res.status(400).json({ error: 'The coach is turned off for this essay.' });
      const now = new Date();
      if (!writable(e, now)) return res.status(409).json({ error: 'Time is up for this essay.', closed: true });
      const w = await loadWork(e.id, req.student.id);
      if (!w || w.status !== 'in_progress') return res.status(409).json({ error: 'This essay is not in progress.', closed: true });
      const message = str(req.body && req.body.message, 1500).trim();
      if (!message) return res.status(400).json({ error: 'Type a question for the coach.' });
      if ((w.coach || []).filter(m => m.role === 'student').length >= MAX_COACH_MESSAGES) {
        return res.status(429).json({ error: "You've reached the coach's limit for this essay. Keep going on your own; you're close." });
      }
      const stage = str(req.body && req.body.stage, 40);

      const history = (w.coach || []).map(m => ({ role: m.role === 'student' ? 'user' : 'assistant', content: m.content + (m.wording ? `\n(Example phrasing offered: "${m.wording.suggestion}")` : '') }));
      history.push({ role: 'user', content: message });
      const system = coachSystemPrompt(e, w, stage, instructorName, now);

      let reply;
      try {
        reply = await callAnthropic(system, history, 500);
      } catch (err) {
        console.error('Ceteris: coach call failed —', err.message);
        const busy = err.status === 429 || err.status === 529 || err.status === 503;
        return res.status(503).json({ error: busy ? 'The coach is busy helping many students. Try again in a few seconds.' : 'The coach could not answer just now. Try again in a moment.', retry: true });
      }

      const fresh = await loadWork(e.id, req.student.id); // re-check the once-only rule
      const { content, wording } = applyWordingRule(reply, fresh.wording_used);
      const at = new Date().toISOString();
      const entries = [
        { role: 'student', content: message, stage, at },
        { role: 'coach', content, stage, at, ...(wording ? { wording } : {}) }
      ];
      await pool.query(`UPDATE essay_work SET coach = coach || $3::jsonb, wording_used = wording_used OR $4, updated_at = now()
                        WHERE essay_id=$1 AND student_id=$2`, [e.id, req.student.id, JSON.stringify(entries), !!wording]);
      res.json({ reply: content, wording, wordingUsed: fresh.wording_used || !!wording });
    } catch (err) { fail(res, 'coach')(err); }
  });

  app.post('/api/essays/:id/submit', requireStudent, async (req, res) => {
    try {
      const e = await loadEssay(req.params.id);
      if (!e) return res.status(404).json({ error: 'Essay not found.' });
      if (!writable(e, new Date())) return res.status(409).json({ error: 'Time is up; your essay was submitted automatically.', closed: true });
      const r = await pool.query(`UPDATE essay_work SET status='submitted', submitted_at=now(), updated_at=now()
                                  WHERE essay_id=$1 AND student_id=$2 AND status='in_progress' RETURNING *`, [e.id, req.student.id]);
      if (!r.rows[0]) return res.status(409).json({ error: 'This essay has already been submitted.' });
      res.json({ work: workForStudent(r.rows[0]) });
    } catch (err) { fail(res, 'essay submit')(err); }
  });

  // ---- Instructor routes ------------------------------------------------------------

  app.get('/api/essays', requireInstructor, async (req, res) => {
    try {
      await autoSubmit();
      const now = new Date();
      const r = await pool.query(`
        SELECT e.*, COUNT(w.student_id)::int AS started,
               COUNT(w.student_id) FILTER (WHERE w.status = 'submitted')::int AS submitted
        FROM essays e LEFT JOIN essay_work w ON w.essay_id = e.id
        GROUP BY e.id ORDER BY COALESCE(e.opens_at, e.created_at) DESC`);
      const roster = await pool.query('SELECT COUNT(*)::int AS n FROM roster');
      res.json({
        serverTime: now.toISOString(), rosterSize: roster.rows[0].n,
        essays: r.rows.map(e => ({ ...essayForInstructor(e, now), started: e.started, submitted: e.submitted }))
      });
    } catch (err) { fail(res, 'essay list')(err); }
  });

  app.get('/api/essays/:id', requireInstructor, async (req, res) => {
    try {
      const e = await loadEssay(req.params.id);
      if (!e) return res.status(404).json({ error: 'Essay not found.' });
      res.json({ essay: essayForInstructor(e) });
    } catch (err) { fail(res, 'essay fetch')(err); }
  });

  app.post('/api/essays', requireInstructor, async (req, res) => {
    const { essay, error } = cleanEssay(req.body);
    if (error) return res.status(400).json({ error });
    try {
      const r = await pool.query(`INSERT INTO essays (title, prompt, config, brief, opens_at, closes_at, coach_enabled)
                                  VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [essay.title, essay.prompt, JSON.stringify(essay.config), essay.brief, essay.opensAt, essay.closesAt, essay.coachEnabled]);
      res.json({ essay: essayForInstructor(r.rows[0]) });
    } catch (err) { fail(res, 'essay create')(err); }
  });

  app.put('/api/essays/:id', requireInstructor, async (req, res) => {
    const { essay, error } = cleanEssay(req.body);
    if (error) return res.status(400).json({ error });
    try {
      const r = await pool.query(`UPDATE essays SET title=$2, prompt=$3, config=$4, brief=$5, opens_at=$6, closes_at=$7, coach_enabled=$8, updated_at=now()
                                  WHERE id=$1 RETURNING *`,
        [parseInt(req.params.id, 10), essay.title, essay.prompt, JSON.stringify(essay.config), essay.brief, essay.opensAt, essay.closesAt, essay.coachEnabled]);
      if (!r.rows[0]) return res.status(404).json({ error: 'Essay not found.' });
      res.json({ essay: essayForInstructor(r.rows[0]) });
    } catch (err) { fail(res, 'essay update')(err); }
  });

  // Reuse an essay in another section or year: same content, no session time.
  app.post('/api/essays/:id/duplicate', requireInstructor, async (req, res) => {
    try {
      const e = await loadEssay(req.params.id);
      if (!e) return res.status(404).json({ error: 'Essay not found.' });
      const r = await pool.query(`INSERT INTO essays (title, prompt, config, brief, coach_enabled) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [`${e.title} (copy)`.slice(0, 200), e.prompt, JSON.stringify(e.config), e.brief, e.coach_enabled]);
      res.json({ essay: essayForInstructor(r.rows[0]) });
    } catch (err) { fail(res, 'essay duplicate')(err); }
  });

  // Deleting is only allowed before any student has started, so no paper is ever lost.
  app.delete('/api/essays/:id', requireInstructor, async (req, res) => {
    try {
      const e = await loadEssay(req.params.id);
      if (!e) return res.status(404).json({ error: 'Essay not found.' });
      const w = await pool.query('SELECT 1 FROM essay_work WHERE essay_id=$1 LIMIT 1', [e.id]);
      if (w.rows[0]) return res.status(409).json({ error: 'Students have already worked on this essay, so it can’t be deleted.' });
      await pool.query('DELETE FROM essays WHERE id=$1', [e.id]);
      res.json({ ok: true });
    } catch (err) { fail(res, 'essay delete')(err); }
  });

  // Every roster student with their status, for the live view and the submissions list.
  app.get('/api/essays/:id/submissions', requireInstructor, async (req, res) => {
    try {
      await autoSubmit();
      const e = await loadEssay(req.params.id);
      if (!e) return res.status(404).json({ error: 'Essay not found.' });
      const keys = e.config.stages.map(s => s.key);
      const r = await pool.query(`
        SELECT COALESCE(r.student_id, w.student_id) AS student_id, r.name, w.plan, w.draft_text, w.coach, w.wording_used, w.plan_pastes,
               w.status, w.auto_submitted, w.started_at, w.updated_at, w.submitted_at
        FROM roster r FULL OUTER JOIN (SELECT * FROM essay_work WHERE essay_id = $1) w ON w.student_id = r.student_id
        ORDER BY r.name NULLS LAST, 1`, [e.id]);
      const rows = r.rows.map(x => ({
        studentId: x.student_id, name: x.name,
        status: !x.status ? 'not_started' : x.status === 'submitted' ? (x.auto_submitted ? 'auto_submitted' : 'submitted') : 'writing',
        planDone: x.plan ? keys.filter(k => String(x.plan[k] || '').trim()).length : 0,
        planTotal: keys.length,
        words: wordCount(x.draft_text),
        pastedWordsKept: x.plan_pastes ? pasteSummary(x.plan_pastes, x.draft_text).pastedWordsKept : 0,
        coachMessages: x.coach ? x.coach.filter(m => m.role === 'student').length : 0,
        wordingUsed: !!x.wording_used,
        startedAt: x.started_at, updatedAt: x.updated_at, submittedAt: x.submitted_at
      }));
      res.json({ serverTime: new Date().toISOString(), essay: essayForInstructor(e), rows });
    } catch (err) { fail(res, 'submissions')(err); }
  });

  // One student's paper, plan and coach conversation.
  app.get('/api/essays/:id/work/:studentId', requireInstructor, async (req, res) => {
    try {
      const e = await loadEssay(req.params.id);
      if (!e) return res.status(404).json({ error: 'Essay not found.' });
      const sid = normalizeId(req.params.studentId);
      if (!STUDENT_ID_PATTERN.test(sid)) return res.status(400).json({ error: 'Invalid student ID.' });
      const w = await loadWork(e.id, sid);
      if (!w) return res.status(404).json({ error: 'This student has not started the essay.' });
      const name = await pool.query('SELECT name FROM roster WHERE student_id=$1', [sid]);
      const snaps = await pool.query('SELECT COUNT(*)::int AS n FROM essay_snapshots WHERE essay_id=$1 AND student_id=$2', [e.id, sid]);
      res.json({
        essay: essayForInstructor(e),
        student: { studentId: sid, name: name.rows[0] ? name.rows[0].name : null },
        work: {
          plan: w.plan, draftHtml: w.draft_html, words: wordCount(w.draft_text), coach: w.coach, wordingUsed: w.wording_used,
          ...pasteSummary(w.plan_pastes, w.draft_text),
          status: w.status, autoSubmitted: w.auto_submitted, startedAt: w.started_at, updatedAt: w.updated_at, submittedAt: w.submitted_at,
          snapshots: snaps.rows[0].n
        }
      });
    } catch (err) { fail(res, 'paper fetch')(err); }
  });

  // An essay open right now that this student has not submitted (pauses the tutoring chat).
  async function essayInProgress(studentId) {
    const r = await pool.query(`
      SELECT e.title FROM essays e
      LEFT JOIN essay_work w ON w.essay_id = e.id AND w.student_id = $1
      WHERE e.opens_at <= now() AND e.closes_at > now() AND (w.status IS NULL OR w.status <> 'submitted')
      ORDER BY e.closes_at LIMIT 1`, [studentId]);
    return r.rows[0] ? r.rows[0].title : null;
  }

  return { init, essayInProgress, _test: { htmlToText, wordCount, applyWordingRule, cleanEssay, coachSystemPrompt } };
};
