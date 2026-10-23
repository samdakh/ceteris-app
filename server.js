require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy; needed so req.ip is the student's real IP
app.use(cors());
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Markdown renderer + sanitizer for the browser, served from our own node_modules
// so the app doesn't depend on an outside CDN being up.
app.get('/vendor/marked.js', (req, res) =>
  res.sendFile(path.join(__dirname, 'node_modules', 'marked', 'lib', 'marked.umd.js')));
app.get('/vendor/purify.js', (req, res) =>
  res.sendFile(path.join(__dirname, 'node_modules', 'dompurify', 'dist', 'purify.min.js')));

// --- Database (Postgres) -----------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS roster (
      student_id TEXT PRIMARY KEY,
      name TEXT,
      added_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      student_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transcripts (
      student_id TEXT NOT NULL,
      day TEXT NOT NULL,
      transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
      PRIMARY KEY (student_id, day)
    );
    CREATE TABLE IF NOT EXISTS summaries (
      student_id TEXT NOT NULL,
      day TEXT NOT NULL,
      summary JSONB NOT NULL,
      PRIMARY KEY (student_id, day)
    );
    CREATE TABLE IF NOT EXISTS usage_stats (
      student_id TEXT PRIMARY KEY,
      message_count INT NOT NULL DEFAULT 0,
      days_active JSONB NOT NULL DEFAULT '[]'::jsonb,
      first_seen TEXT,
      last_seen TEXT
    );
  `);
  await pool.query('DELETE FROM auth_sessions WHERE expires_at < now()');
}

// "Today" in the class's time zone, so an 9pm session in New York counts as today,
// not tomorrow (which is what UTC would say).
const CLASS_TIMEZONE = process.env.CLASS_TIMEZONE || 'America/New_York';
function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLASS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

// --- Student IDs ---------------------------------------------------------------
const STUDENT_ID_PATTERN = /^[A-Z0-9]{6}$/;
function normalizeId(raw) {
  return String(raw || '').trim().toUpperCase();
}

// --- Sessions (stored in the database so logins survive server restarts) --------
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createSession(role, studentId, days) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO auth_sessions (token_hash, role, student_id, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' days')::interval)`,
    [hashToken(token), role, studentId, String(days)]
  );
  return token;
}

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

async function requireStudent(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Please log in with your student ID.' });
  try {
    // Joining the roster means a student removed from the roster loses access right away.
    const result = await pool.query(
      `SELECT r.student_id, r.name FROM auth_sessions s
       JOIN roster r ON r.student_id = s.student_id
       WHERE s.token_hash = $1 AND s.role = 'student' AND s.expires_at > now()`,
      [hashToken(token)]
    );
    if (!result.rows[0]) return res.status(401).json({ error: 'Your session has ended. Please log in again.' });
    req.student = { id: result.rows[0].student_id, name: result.rows[0].name };
    next();
  } catch (e) {
    console.error('Ceteris: student auth failed —', e.message);
    res.status(500).json({ error: 'Could not verify your login.' });
  }
}

async function requireInstructor(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated as instructor' });
  try {
    const result = await pool.query(
      `SELECT 1 FROM auth_sessions WHERE token_hash = $1 AND role = 'instructor' AND expires_at > now()`,
      [hashToken(token)]
    );
    if (!result.rows[0]) return res.status(401).json({ error: 'Not authenticated as instructor' });
    next();
  } catch (e) {
    console.error('Ceteris: instructor auth failed —', e.message);
    res.status(500).json({ error: 'Could not verify login.' });
  }
}

// Simple brute-force guard: 30 failed logins per IP per 15 minutes. Deliberately generous,
// because a whole lecture hall on campus Wi-Fi can share one IP address.
const MAX_FAILED_LOGINS = 30;
const failedLogins = new Map();
function tooManyFailures(ip) {
  const entry = failedLogins.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) { failedLogins.delete(ip); return false; }
  return entry.count >= MAX_FAILED_LOGINS;
}
function recordFailure(ip) {
  const entry = failedLogins.get(ip);
  if (!entry || Date.now() > entry.resetAt) {
    failedLogins.set(ip, { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
  } else {
    entry.count += 1;
  }
}

// --- Claude API ------------------------------------------------------------------
const TUTOR_SYSTEM_PROMPT = `You are Ceteris, a warm and patient economics teaching assistant for an introductory (principles-level) micro and macroeconomics course.

Your approach:
- Meet the student exactly where they are. Ask a diagnostic question before launching into an explanation if you're unsure what they already understand.
- Favor guiding questions over handing over answers outright — help them reason their way to the concept, especially for homework-style problems.
- When they have a misconception (e.g. confusing movement along a curve with a shift of the curve, confusing nominal vs real, average vs marginal), gently surface and correct it rather than just marking it wrong.
- Keep explanations concrete: use simple numeric examples or everyday scenarios (coffee shops, part-time jobs, a national economy) rather than abstract jargon.
- Keep responses focused — a few short paragraphs at most, not a lecture.
- Be encouraging without being saccharine.

Formatting (your replies are rendered as Markdown):
- Use **bold** for a key term the first time it appears, and *italics* sparingly for emphasis.
- Use a short numbered list for steps in a calculation and a bulleted list for parallel ideas; keep lists to about five items.
- When numbers are easier to compare side by side (a demand schedule, before/after values), use a small Markdown table.
- Don't use headings in short replies, and don't use LaTeX. Write formulas in plain text, for example: Price elasticity = %ΔQd ÷ %ΔP.
- End with at most one question for the student, on its own line.`;

const SUMMARY_SYSTEM_PROMPT = `You analyze a tutoring transcript between an economics student and a tutor. Output ONLY valid JSON, no markdown fences, no preamble, matching exactly this shape:
{"topics": string[], "misconceptions": string[], "masteryLevel": "struggling" | "developing" | "solid", "recommendedFollowUp": string, "takeaways": string[], "suggestedQuestions": string[]}

Fields for the INSTRUCTOR only (the student never sees these):
- "topics": specific econ concepts discussed, short lowercase noun phrases (e.g. "price elasticity of demand", "opportunity cost").
- "misconceptions": specific errors the student showed evidence of, in plain language a professor can scan quickly (empty array if none).
- "masteryLevel": your holistic read of how solid their understanding seems today.
- "recommendedFollowUp": one sentence of advice for the instructor.

Fields shown to the STUDENT, so keep them warm, specific, and free of any grading or judgment:
- "takeaways": 1 to 3 short statements in the second person about ideas the student worked through today, e.g. "You connected a price ceiling below equilibrium to a shortage." Describe what they figured out or practiced, never what they got wrong. Empty array if the student hasn't engaged with economics content yet.
- "suggestedQuestions": exactly 2 questions the student could ask next, written in the student's own voice, each under 12 words, building naturally on today's conversation.`;

// The official SDK resolves credentials on its own: an explicit ANTHROPIC_API_KEY first,
// then the Workload Identity Federation variables. See README.
const client = new Anthropic();

async function callAnthropic(system, messages, maxTokens) {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system,
    messages
  });
  return message.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
}

function parseSummary(text) {
  const match = text.replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match ? match[0] : text);
  const strings = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
  return {
    topics: strings(parsed.topics),
    misconceptions: strings(parsed.misconceptions),
    masteryLevel: ['struggling', 'developing', 'solid'].includes(parsed.masteryLevel) ? parsed.masteryLevel : 'developing',
    recommendedFollowUp: typeof parsed.recommendedFollowUp === 'string' ? parsed.recommendedFollowUp : '',
    takeaways: strings(parsed.takeaways).slice(0, 3),
    suggestedQuestions: strings(parsed.suggestedQuestions).slice(0, 2)
  };
}

// Only the encouraging, student-facing parts of a summary ever leave the server for a student.
function studentPanel(summary) {
  if (!summary) return null;
  return {
    topics: summary.topics || [],
    takeaways: summary.takeaways || [],
    suggestedQuestions: summary.suggestedQuestions || []
  };
}

async function studentStats(studentId, transcript) {
  const usage = await pool.query('SELECT days_active FROM usage_stats WHERE student_id=$1', [studentId]);
  const topicRows = await pool.query('SELECT summary FROM summaries WHERE student_id=$1', [studentId]);
  const topics = new Set();
  topicRows.rows.forEach(r => (r.summary.topics || []).forEach(t => topics.add(String(t).toLowerCase().trim())));
  return {
    questionsToday: transcript.filter(m => m.role === 'user').length,
    daysActive: usage.rows[0] ? usage.rows[0].days_active.length : 0,
    topicsExplored: topics.size
  };
}

async function loadToday(studentId) {
  const day = todayKey();
  const t = await pool.query('SELECT transcript FROM transcripts WHERE student_id=$1 AND day=$2', [studentId, day]);
  const s = await pool.query('SELECT summary FROM summaries WHERE student_id=$1 AND day=$2', [studentId, day]);
  const transcript = t.rows[0] ? t.rows[0].transcript : [];
  return { day, transcript, summary: s.rows[0] ? s.rows[0].summary : null };
}

// --- Student routes ----------------------------------------------------------------

app.post('/api/student-login', async (req, res) => {
  if (tooManyFailures(req.ip)) {
    return res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes and try again.' });
  }
  const studentId = normalizeId(req.body && req.body.studentId);
  if (!STUDENT_ID_PATTERN.test(studentId)) {
    // Not counted toward the lockout: a malformed ID can't be a successful guess anyway.
    return res.status(400).json({ error: 'Student IDs are 6 letters or digits. Check yours and try again.' });
  }
  try {
    const r = await pool.query('SELECT student_id, name FROM roster WHERE student_id=$1', [studentId]);
    if (!r.rows[0]) {
      recordFailure(req.ip);
      return res.status(401).json({ error: "That ID isn't on the class roster. Check it, or ask your instructor to add you." });
    }
    const token = await createSession('student', studentId, 120);
    res.json({ token, studentId, name: r.rows[0].name });
  } catch (e) {
    console.error('Ceteris: student login failed —', e.message);
    res.status(500).json({ error: 'Login is unavailable right now. Please try again shortly.' });
  }
});

app.get('/api/me', requireStudent, (req, res) => {
  res.json({ studentId: req.student.id, name: req.student.name });
});

app.post('/api/logout', async (req, res) => {
  const token = readToken(req);
  if (token) {
    try { await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1', [hashToken(token)]); } catch (e) { /* ignore */ }
  }
  res.json({ ok: true });
});

// Today's conversation plus the student-facing side panel.
app.get('/api/session', requireStudent, async (req, res) => {
  try {
    const { transcript, summary } = await loadToday(req.student.id);
    res.json({
      transcript,
      panel: studentPanel(summary),
      stats: await studentStats(req.student.id, transcript)
    });
  } catch (e) {
    console.error('Ceteris: session fetch failed —', e.message);
    res.status(500).json({ error: 'Could not load your session.' });
  }
});

// One tutor turn. Returns as soon as the reply is ready; the side panel is refreshed
// by a separate call so students aren't kept waiting on the analysis step.
app.post('/api/tutor', requireStudent, async (req, res) => {
  const studentId = req.student.id;
  const message = String((req.body && req.body.message) || '').trim();
  if (!message) return res.status(400).json({ error: 'Type a question first.' });
  if (message.length > 4000) return res.status(400).json({ error: 'That message is too long. Try breaking it into smaller questions.' });

  try {
    const { day, transcript } = await loadToday(studentId);
    transcript.push({ role: 'user', content: message });

    const reply = await callAnthropic(TUTOR_SYSTEM_PROMPT, transcript.map(m => ({ role: m.role, content: m.content })), 1200);
    transcript.push({ role: 'assistant', content: reply });

    await pool.query(
      `INSERT INTO transcripts (student_id, day, transcript) VALUES ($1, $2, $3)
       ON CONFLICT (student_id, day) DO UPDATE SET transcript = EXCLUDED.transcript`,
      [studentId, day, JSON.stringify(transcript)]
    );

    const usageRow = await pool.query('SELECT * FROM usage_stats WHERE student_id=$1', [studentId]);
    const u = usageRow.rows[0]
      ? { messageCount: usageRow.rows[0].message_count, daysActive: usageRow.rows[0].days_active, firstSeen: usageRow.rows[0].first_seen }
      : { messageCount: 0, daysActive: [], firstSeen: day };
    u.messageCount += 1;
    if (!u.daysActive.includes(day)) u.daysActive.push(day);
    await pool.query(
      `INSERT INTO usage_stats (student_id, message_count, days_active, first_seen, last_seen)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (student_id) DO UPDATE SET message_count=EXCLUDED.message_count, days_active=EXCLUDED.days_active, last_seen=EXCLUDED.last_seen`,
      [studentId, u.messageCount, JSON.stringify(u.daysActive), u.firstSeen, day]
    );

    res.json({ reply });
  } catch (e) {
    console.error('Ceteris: tutor call failed —', e.message);
    res.status(500).json({ error: 'The tutor could not respond just now. Please try again.' });
  }
});

// Re-analyze today's conversation: updates the instructor's report and returns the
// student's (encouraging) side panel.
app.post('/api/session/summarize', requireStudent, async (req, res) => {
  const studentId = req.student.id;
  try {
    const { day, transcript, summary: previous } = await loadToday(studentId);
    if (transcript.length === 0) return res.json({ panel: null, stats: await studentStats(studentId, transcript) });

    let summary = previous;
    try {
      const transcriptText = transcript.map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`).join('\n');
      summary = parseSummary(await callAnthropic(SUMMARY_SYSTEM_PROMPT, [{ role: 'user', content: transcriptText }], 800));
      await pool.query(
        `INSERT INTO summaries (student_id, day, summary) VALUES ($1, $2, $3)
         ON CONFLICT (student_id, day) DO UPDATE SET summary = EXCLUDED.summary`,
        [studentId, day, JSON.stringify(summary)]
      );
    } catch (summaryErr) {
      console.error('Ceteris: summary generation failed —', summaryErr.message);
    }

    res.json({ panel: studentPanel(summary), stats: await studentStats(studentId, transcript) });
  } catch (e) {
    console.error('Ceteris: summarize failed —', e.message);
    res.status(500).json({ error: 'Could not update your session summary.' });
  }
});

// --- Instructor routes ------------------------------------------------------------

app.post('/api/instructor-login', async (req, res) => {
  if (tooManyFailures(req.ip)) {
    return res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes and try again.' });
  }
  const { password } = req.body || {};
  if (!process.env.INSTRUCTOR_PASSWORD) {
    return res.status(500).json({ error: 'INSTRUCTOR_PASSWORD is not set on the server' });
  }
  if (password !== process.env.INSTRUCTOR_PASSWORD) {
    recordFailure(req.ip);
    return res.status(401).json({ error: 'Incorrect password' });
  }
  try {
    const token = await createSession('instructor', null, 14);
    res.json({ token });
  } catch (e) {
    console.error('Ceteris: instructor login failed —', e.message);
    res.status(500).json({ error: 'Login is unavailable right now.' });
  }
});

app.get('/api/roster', requireInstructor, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.student_id, r.name, u.last_seen
      FROM roster r LEFT JOIN usage_stats u ON u.student_id = r.student_id
      ORDER BY r.name NULLS LAST, r.student_id
    `);
    res.json({ rows: result.rows.map(r => ({ studentId: r.student_id, name: r.name, lastSeen: r.last_seen })) });
  } catch (e) {
    console.error('Ceteris: roster fetch failed —', e.message);
    res.status(500).json({ error: 'Could not load the roster.' });
  }
});

// Accepts pasted text: one student per line, "ID" or "ID, Name" (comma, tab, or semicolon).
// Pasting a column (or two columns) straight from a spreadsheet works.
app.post('/api/roster', requireInstructor, async (req, res) => {
  const text = String((req.body && req.body.text) || '');
  const entries = new Map();
  const invalid = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const [idPart, ...rest] = line.split(/[,\t;]/);
    const id = normalizeId(idPart.replace(/^"|"$/g, ''));
    const name = rest.join(' ').replace(/"/g, '').replace(/\s+/g, ' ').trim() || null;
    if (!STUDENT_ID_PATTERN.test(id)) { invalid.push(line); continue; }
    entries.set(id, name);
  }
  try {
    let added = 0, updated = 0;
    for (const [id, name] of entries) {
      const r = await pool.query(
        `INSERT INTO roster (student_id, name) VALUES ($1, $2)
         ON CONFLICT (student_id) DO UPDATE SET name = COALESCE(EXCLUDED.name, roster.name)
         RETURNING (xmax = 0) AS inserted`,
        [id, name]
      );
      if (r.rows[0].inserted) added += 1; else updated += 1;
    }
    res.json({ added, updated, invalid });
  } catch (e) {
    console.error('Ceteris: roster import failed —', e.message);
    res.status(500).json({ error: 'Could not save the roster.' });
  }
});

// Removing a student revokes their access immediately; their past sessions stay in the database.
app.delete('/api/roster/:studentId', requireInstructor, async (req, res) => {
  const id = normalizeId(req.params.studentId);
  try {
    await pool.query('DELETE FROM roster WHERE student_id=$1', [id]);
    await pool.query(`DELETE FROM auth_sessions WHERE role='student' AND student_id=$1`, [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Ceteris: roster delete failed —', e.message);
    res.status(500).json({ error: 'Could not remove that student.' });
  }
});

app.get('/api/student/:studentId/history', requireInstructor, async (req, res) => {
  const studentId = normalizeId(req.params.studentId);
  try {
    const studentRow = await pool.query('SELECT * FROM roster WHERE student_id=$1', [studentId]);
    if (!studentRow.rows[0]) return res.status(404).json({ error: 'Student not found' });

    const summaryRows = await pool.query('SELECT day, summary FROM summaries WHERE student_id=$1 ORDER BY day ASC', [studentId]);
    const days = summaryRows.rows.map(r => ({ date: r.day, summary: r.summary }));

    const usageRow = await pool.query('SELECT * FROM usage_stats WHERE student_id=$1', [studentId]);
    const usage = usageRow.rows[0]
      ? { messageCount: usageRow.rows[0].message_count, daysActive: usageRow.rows[0].days_active, firstSeen: usageRow.rows[0].first_seen, lastSeen: usageRow.rows[0].last_seen }
      : null;

    res.json({ studentId, name: studentRow.rows[0].name, days, usage });
  } catch (e) {
    console.error('Ceteris: history fetch failed —', e.message);
    res.status(500).json({ error: 'Could not load history' });
  }
});

// Every roster student, including those who have never used the tool.
app.get('/api/usage', requireInstructor, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.student_id, r.name, u.message_count, u.days_active, u.first_seen, u.last_seen
      FROM roster r LEFT JOIN usage_stats u ON r.student_id = u.student_id
    `);
    const rows = result.rows.map(r => ({
      studentId: r.student_id,
      name: r.name,
      messageCount: r.message_count || 0,
      daysActive: r.days_active ? r.days_active.length : 0,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen
    }));
    res.json({ rows });
  } catch (e) {
    console.error('Ceteris: usage fetch failed —', e.message);
    res.status(500).json({ error: 'Could not load usage data' });
  }
});

app.get('/api/dashboard', requireInstructor, async (req, res) => {
  const day = req.query.date || todayKey();
  try {
    const result = await pool.query(`
      SELECT r.student_id, r.name, s.summary,
             COALESCE(jsonb_array_length(t.transcript), 0) AS message_count
      FROM roster r
      LEFT JOIN summaries s ON s.student_id = r.student_id AND s.day = $1
      LEFT JOIN transcripts t ON t.student_id = r.student_id AND t.day = $1
      WHERE s.summary IS NOT NULL OR COALESCE(jsonb_array_length(t.transcript), 0) > 0
      ORDER BY r.name NULLS LAST, r.student_id
    `, [day]);
    const records = result.rows.map(r => ({
      studentId: r.student_id,
      name: r.name,
      summary: r.summary || {
        topics: [], misconceptions: [], masteryLevel: 'developing',
        recommendedFollowUp: 'Session logged, analysis still pending — refresh in a moment.', pending: true
      }
    }));
    res.json({ date: day, records });
  } catch (e) {
    console.error('Ceteris: dashboard fetch failed —', e.message);
    res.status(500).json({ error: 'Could not load dashboard' });
  }
});

const PORT = process.env.PORT || 3000;
initDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Ceteris server listening on port ${PORT}`));
  })
  .catch(e => {
    console.error('Ceteris: failed to initialize database —', e.message || e);
    process.exit(1);
  });
