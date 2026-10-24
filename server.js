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
    ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    -- Each student decides whether the instructor may read full conversations. Off by default.
    ALTER TABLE roster ADD COLUMN IF NOT EXISTS share_transcripts BOOLEAN NOT NULL DEFAULT false;
    -- Each student creates a password at first login; the instructor can reset it (back to NULL).
    ALTER TABLE roster ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE roster ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMPTZ;
  `);
  await pool.query('DELETE FROM auth_sessions WHERE expires_at < now()');
}

// Name shown to students on notes the instructor posts, e.g. "Prof. Dakhlia".
const INSTRUCTOR_NAME = (process.env.INSTRUCTOR_NAME || '').trim() || 'Your instructor';
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

// YYYY-MM-DD for `days` days before the given YYYY-MM-DD.
function daysBefore(day, days) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function firstQuestion(transcript) {
  const first = transcript.find(m => m.role === 'user');
  return first ? first.content : '';
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

// --- Student passwords (scrypt, salted; only the hash is stored) -------------------
const MIN_PASSWORD = 8;
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(`scrypt$${salt.toString('hex')}$${key.toString('hex')}`));
  });
}
function checkPassword(password, stored) {
  return new Promise(resolve => {
    const [kind, saltHex, keyHex] = String(stored || '').split('$');
    if (kind !== 'scrypt' || !saltHex || !keyHex) return resolve(false);
    const expected = Buffer.from(keyHex, 'hex');
    crypto.scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, (err, key) =>
      resolve(!err && key.length === expected.length && crypto.timingSafeEqual(key, expected)));
  });
}
function passwordProblem(pw, studentId) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) return `Choose a password of at least ${MIN_PASSWORD} characters.`;
  if (pw.length > 200) return 'That password is too long.';
  if (pw.toUpperCase().includes(studentId) || /^(.)\1+$/.test(pw) || /^(password|12345678|123456789|qwertyui)/i.test(pw)) return 'Choose a password that is harder to guess (not your student ID).';
  return null;
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
      `SELECT r.student_id, r.name, r.share_transcripts FROM auth_sessions s
       JOIN roster r ON r.student_id = s.student_id
       WHERE s.token_hash = $1 AND s.role = 'student' AND s.expires_at > now() AND r.password_hash IS NOT NULL`,
      [hashToken(token)]
    );
    if (!result.rows[0]) return res.status(401).json({ error: 'Your session has ended. Please log in again.' });
    req.student = { id: result.rows[0].student_id, name: result.rows[0].name, shareTranscripts: result.rows[0].share_transcripts };
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
// Separately, 8 wrong passwords for one student ID in 15 minutes pauses that ID (from any network).
const MAX_FAILED_PER_ID = 8;
const failedById = new Map();
function idLocked(id) {
  const entry = failedById.get(id);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) { failedById.delete(id); return false; }
  return entry.count >= MAX_FAILED_PER_ID;
}
function recordIdFailure(id) {
  const entry = failedById.get(id);
  if (!entry || Date.now() > entry.resetAt) failedById.set(id, { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
  else entry.count += 1;
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
- The course instructor can read these conversations and sometimes adds a note, marked as a note from the instructor. Treat instructor notes as authoritative guidance for this course: build on them, never contradict them, and refer to them naturally when relevant (e.g. "As your instructor pointed out…").

Formatting (your replies are rendered as Markdown):
- Use **bold** for a key term the first time it appears, and *italics* sparingly for emphasis.
- Use a short numbered list for steps in a calculation and a bulleted list for parallel ideas; keep lists to about five items.
- When numbers are easier to compare side by side (a demand schedule, before/after values), use a small Markdown table.
- Don't use headings in short replies, and don't use LaTeX. Write formulas in plain text, for example: Price elasticity = %ΔQd ÷ %ΔP.
- End with at most one question for the student, on its own line.`;

const SUMMARY_SYSTEM_PROMPT = `You analyze a tutoring transcript between an economics student and a tutor. Output ONLY valid JSON, no markdown fences, no preamble, matching exactly this shape:
{"topics": string[], "misconceptions": string[], "masteryLevel": "struggling" | "developing" | "solid", "recommendedFollowUp": string, "takeaways": string[], "suggestedQuestions": string[]}
Lines starting "Instructor:" are notes the course instructor added; treat them as context, not as the student's own work.
Many students share only this summary with the instructor, not the conversation, so paraphrase everything: never quote the student's own words, and leave out personal details unrelated to economics.

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
// maxRetries: when a whole class asks at once and the API answers "too many requests"
// (429) or "overloaded" (529), the SDK waits as the API asks and retries before giving up.
const client = new Anthropic({ maxRetries: 4 });

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

// Turns a stored conversation into Claude API messages. Instructor notes become clearly
// labeled text inside the user turn, and consecutive same-role turns are merged.
function toApiMessages(transcript) {
  const out = [];
  for (const m of transcript) {
    let role, content;
    if (m.role === 'assistant') { role = 'assistant'; content = m.content; }
    else if (m.role === 'instructor') { role = 'user'; content = `[Note from the instructor, posted in this conversation and visible to the student]\n${m.content}`; }
    else if (m.role === 'user') { role = 'user'; content = m.content; }
    else continue;
    const last = out[out.length - 1];
    if (last && last.role === role) {
      if (m.role === 'user' && last.hasNote) content = `[Student]\n${content}`;
      last.content += '\n\n' + content;
      last.hasNote = last.hasNote || m.role === 'instructor';
    } else {
      out.push({ role, content, hasNote: m.role === 'instructor' });
    }
  }
  return out.map(({ role, content }) => ({ role, content }));
}

function transcriptAsText(transcript) {
  const label = { user: 'Student', assistant: 'Tutor', instructor: 'Instructor' };
  return transcript.filter(m => label[m.role]).map(m => `${label[m.role]}: ${m.content}`).join('\n');
}

// Notes the instructor left on this student's other recent conversations, so Ceteris
// can follow up on them today.
async function recentNotesContext(studentId, today) {
  const r = await pool.query(
    `SELECT day, transcript FROM transcripts
     WHERE student_id=$1 AND day <> $2 AND day >= $3 AND transcript @> '[{"role":"instructor"}]'
     ORDER BY day`,
    [studentId, today, daysBefore(today, 14)]
  );
  const lines = [];
  r.rows.forEach(row => row.transcript.filter(m => m.role === 'instructor')
    .forEach(m => lines.push(`- On ${row.day}, about "${firstQuestion(row.transcript).slice(0, 120)}": ${m.content}`)));
  return lines.length
    ? `\n\nNotes the instructor left on this student's recent earlier conversations (context; the student has been shown these):\n${lines.join('\n')}`
    : '';
}

// Instructor notes from earlier days (the last 30), shown in the student's side panel.
async function earlierNotes(studentId, today) {
  const r = await pool.query(
    `SELECT day, transcript FROM transcripts
     WHERE student_id=$1 AND day < $2 AND day >= $3 AND transcript @> '[{"role":"instructor"}]'
     ORDER BY day DESC`,
    [studentId, today, daysBefore(today, 30)]
  );
  const notes = [];
  r.rows.forEach(row => {
    const question = firstQuestion(row.transcript);
    row.transcript.filter(m => m.role === 'instructor').reverse().forEach(m =>
      notes.push({ id: m.id, day: row.day, content: m.content, at: m.at || null, isNew: m.seen === false, question }));
  });
  return notes;
}

async function markNotesSeen(studentId) {
  await pool.query(
    `UPDATE transcripts SET transcript = (
       SELECT jsonb_agg(CASE WHEN m->>'role' = 'instructor' THEN m || '{"seen": true}'::jsonb ELSE m END ORDER BY ord)
       FROM jsonb_array_elements(transcripts.transcript) WITH ORDINALITY AS t(m, ord))
     WHERE student_id = $1 AND transcript @> '[{"role":"instructor","seen":false}]'`,
    [studentId]
  );
}

// What a student's browser receives for a stored message: no internal bookkeeping fields.
function forStudent(m) {
  return { role: m.role, content: m.content };
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
  // Two steps: the ID alone tells the page which password box to show; then the password.
  const password = req.body && req.body.password;
  const newPassword = req.body && req.body.newPassword;
  try {
    const r = await pool.query('SELECT student_id, name, password_hash FROM roster WHERE student_id=$1', [studentId]);
    const row = r.rows[0];
    if (!row) {
      recordFailure(req.ip);
      return res.status(401).json({ error: "That ID isn't on the class roster. Check it, or ask your instructor to add you." });
    }
    if (idLocked(studentId)) {
      return res.status(429).json({ error: 'Too many wrong passwords for this ID. Wait 15 minutes, or ask your instructor to reset your password.' });
    }
    if (!row.password_hash) {
      // First login (or after a reset): the student creates a password.
      if (newPassword == null || newPassword === '') return res.json({ needsNewPassword: true });
      const problem = passwordProblem(newPassword, studentId);
      if (problem) return res.status(400).json({ error: problem, needsNewPassword: true });
      const set = await pool.query(`UPDATE roster SET password_hash=$2, password_set_at=now() WHERE student_id=$1 AND password_hash IS NULL`,
        [studentId, await hashPassword(newPassword)]);
      if (!set.rowCount) return res.status(409).json({ error: 'A password was just set for this ID. Log in with it.', needsPassword: true });
    } else {
      if (password == null || password === '') return res.json({ needsPassword: true });
      if (!(await checkPassword(String(password), row.password_hash))) {
        recordFailure(req.ip); recordIdFailure(studentId);
        return res.status(401).json({ error: "That password doesn't match. If you've forgotten it, ask your instructor to reset it.", needsPassword: true });
      }
      failedById.delete(studentId);
    }
    const token = await createSession('student', studentId, 120);
    res.json({ token, studentId, name: row.name });
  } catch (e) {
    console.error('Ceteris: student login failed —', e.message);
    res.status(500).json({ error: 'Login is unavailable right now. Please try again shortly.' });
  }
});

app.get('/api/me', requireStudent, (req, res) => {
  res.json({ studentId: req.student.id, name: req.student.name, shareTranscripts: req.student.shareTranscripts });
});

// The student's choice: share full conversations with the instructor, or only summaries.
// It applies to all of their conversations, past and future, and can be changed any time.
app.post('/api/settings', requireStudent, async (req, res) => {
  const share = req.body && req.body.shareTranscripts;
  if (typeof share !== 'boolean') return res.status(400).json({ error: 'shareTranscripts must be true or false.' });
  try {
    await pool.query('UPDATE roster SET share_transcripts=$2 WHERE student_id=$1', [req.student.id, share]);
    res.json({ shareTranscripts: share });
  } catch (e) {
    console.error('Ceteris: settings update failed —', e.message);
    res.status(500).json({ error: 'Could not save your setting.' });
  }
});

app.post('/api/logout', async (req, res) => {
  const token = readToken(req);
  if (token) {
    try { await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1', [hashToken(token)]); } catch (e) { /* ignore */ }
  }
  res.json({ ok: true });
});

// Today's conversation, the student-facing side panel, and recent notes from the instructor.
// Loading it counts as the student having seen any instructor notes.
app.get('/api/session', requireStudent, async (req, res) => {
  try {
    const { day, transcript, summary } = await loadToday(req.student.id);
    res.json({
      transcript: transcript.map(forStudent),
      panel: studentPanel(summary),
      stats: await studentStats(req.student.id, transcript),
      notes: await earlierNotes(req.student.id, day),
      instructorName: INSTRUCTOR_NAME,
      shareTranscripts: req.student.shareTranscripts
    });
    markNotesSeen(req.student.id).catch(e => console.error('Ceteris: mark seen failed —', e.message));
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
    // During an in-class essay the tutor steps aside, so it can't write the essay for anyone.
    const essayTitle = await essays.essayInProgress(studentId);
    if (essayTitle) return res.status(423).json({ error: `The tutor is paused while your in-class essay ("${essayTitle}") is open. The essay's coach can help in the meantime, and the tutor is back as soon as you submit.`, essayOpen: true });

    const { day, transcript } = await loadToday(studentId);
    const question = { id: newId(), role: 'user', content: message, at: new Date().toISOString() };

    const system = TUTOR_SYSTEM_PROMPT + await recentNotesContext(studentId, day);
    const reply = await callAnthropic(system, toApiMessages([...transcript, question]), 1200);
    const answer = { id: newId(), role: 'assistant', content: reply, at: new Date().toISOString() };

    // Append rather than overwrite, so a note the instructor posts while Claude is
    // still answering isn't lost.
    await pool.query(
      `INSERT INTO transcripts (student_id, day, transcript, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (student_id, day) DO UPDATE
         SET transcript = transcripts.transcript || EXCLUDED.transcript, updated_at = now()`,
      [studentId, day, JSON.stringify([question, answer])]
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
      summary = parseSummary(await callAnthropic(SUMMARY_SYSTEM_PROMPT, [{ role: 'user', content: transcriptAsText(transcript) }], 800));
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
      SELECT r.student_id, r.name, r.password_set_at, u.last_seen
      FROM roster r LEFT JOIN usage_stats u ON u.student_id = r.student_id
      ORDER BY r.name NULLS LAST, r.student_id
    `);
    res.json({ rows: result.rows.map(r => ({ studentId: r.student_id, name: r.name, lastSeen: r.last_seen, passwordSetAt: r.password_set_at })) });
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

// Password reset: the student creates a new password the next time they log in.
// Their open sessions end too, in case someone else had their password.
app.post('/api/roster/:studentId/reset-password', requireInstructor, async (req, res) => {
  const id = normalizeId(req.params.studentId);
  try {
    const r = await pool.query('UPDATE roster SET password_hash=NULL, password_set_at=NULL WHERE student_id=$1', [id]);
    if (!r.rowCount) return res.status(404).json({ error: 'That student is not on the roster.' });
    await pool.query(`DELETE FROM auth_sessions WHERE role='student' AND student_id=$1`, [id]);
    failedById.delete(id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Ceteris: password reset failed —', e.message);
    res.status(500).json({ error: 'Could not reset that password.' });
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

// Every roster student, including those who have never used the tool.
app.get('/api/usage', requireInstructor, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.student_id, r.name, r.share_transcripts, u.message_count, u.days_active, u.first_seen, u.last_seen
      FROM roster r LEFT JOIN usage_stats u ON r.student_id = u.student_id
    `);
    const rows = result.rows.map(r => ({
      studentId: r.student_id,
      name: r.name,
      shareTranscripts: r.share_transcripts,
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

// --- Conversations (discussion-board view) -------------------------------------
// A "thread" is one student's conversation on one day.

const PENDING_SUMMARY = {
  topics: [], misconceptions: [], masteryLevel: null,
  recommendedFollowUp: 'Analysis still pending. It updates after the student\'s next reply.', pending: true
};

// Thread list, newest activity first. ?range=7|30|all (days), optional ?student=ID.
app.get('/api/threads', requireInstructor, async (req, res) => {
  const range = String(req.query.range || '7');
  const cutoff = range === 'all' ? null : daysBefore(todayKey(), Math.max(0, (parseInt(range, 10) || 7) - 1));
  const student = req.query.student ? normalizeId(req.query.student) : null;
  try {
    const result = await pool.query(`
      SELECT t.student_id, r.name, COALESCE(r.share_transcripts, false) AS shared, t.day, t.updated_at, t.transcript, s.summary
      FROM transcripts t
      LEFT JOIN roster r ON r.student_id = t.student_id
      LEFT JOIN summaries s ON s.student_id = t.student_id AND s.day = t.day
      WHERE t.student_id ~ '^[A-Z0-9]{6}$'
        AND jsonb_array_length(t.transcript) > 0
        AND ($1::text IS NULL OR t.day >= $1)
        AND ($2::text IS NULL OR t.student_id = $2)
      ORDER BY COALESCE(t.updated_at, t.day::date::timestamptz) DESC
      LIMIT 300
    `, [cutoff, student]);
    const threads = result.rows.map(r => {
      const t = r.transcript;
      const notes = t.filter(m => m.role === 'instructor');
      return {
        studentId: r.student_id,
        name: r.name,
        day: r.day,
        updatedAt: r.updated_at,
        shared: r.shared,
        // The opening question is the student's own words, so it's only shown if they share.
        title: r.shared ? firstQuestion(t) : null,
        studentMessages: t.filter(m => m.role === 'user').length,
        tutorMessages: t.filter(m => m.role === 'assistant').length,
        instructorNotes: notes.length,
        unseenNotes: notes.filter(m => m.seen === false).length,
        lastFromStudent: t.length > 0 && t[t.length - 1].role !== 'instructor',
        summary: r.summary || PENDING_SUMMARY
      };
    });
    res.json({ threads });
  } catch (e) {
    console.error('Ceteris: thread list failed —', e.message);
    res.status(500).json({ error: 'Could not load conversations.' });
  }
});

async function loadThread(studentId, day) {
  const r = await pool.query(`
    SELECT t.transcript, t.updated_at, r.name, COALESCE(r.share_transcripts, false) AS shared, s.summary
    FROM transcripts t
    LEFT JOIN roster r ON r.student_id = t.student_id
    LEFT JOIN summaries s ON s.student_id = t.student_id AND s.day = t.day
    WHERE t.student_id = $1 AND t.day = $2
  `, [studentId, day]);
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  return {
    studentId, day, name: row.name, updatedAt: row.updated_at,
    shared: row.shared,
    // Without the student's consent, the instructor gets the summary and their own notes only.
    transcript: row.shared ? row.transcript : row.transcript.filter(m => m.role === 'instructor'),
    questionCount: row.transcript.filter(m => m.role === 'user').length,
    summary: row.summary || PENDING_SUMMARY
  };
}

function threadParams(req, res) {
  const studentId = normalizeId(req.params.studentId);
  const day = String(req.params.day || '');
  if (!STUDENT_ID_PATTERN.test(studentId) || !DAY_PATTERN.test(day)) {
    res.status(400).json({ error: 'Invalid conversation reference.' });
    return null;
  }
  return { studentId, day };
}

app.get('/api/threads/:studentId/:day', requireInstructor, async (req, res) => {
  const p = threadParams(req, res);
  if (!p) return;
  try {
    const thread = await loadThread(p.studentId, p.day);
    if (!thread) return res.status(404).json({ error: 'Conversation not found.' });
    res.json(thread);
  } catch (e) {
    console.error('Ceteris: thread fetch failed —', e.message);
    res.status(500).json({ error: 'Could not load the conversation.' });
  }
});

// The instructor chimes in. The note is appended to the conversation; the student sees it
// next time they open Ceteris, and Ceteris reads it as course guidance.
app.post('/api/threads/:studentId/:day/notes', requireInstructor, async (req, res) => {
  const p = threadParams(req, res);
  if (!p) return;
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ error: 'Write a note first.' });
  if (text.length > 4000) return res.status(400).json({ error: 'That note is too long (4,000 characters max).' });
  const note = { id: newId(), role: 'instructor', content: text, at: new Date().toISOString(), seen: false, author: INSTRUCTOR_NAME };
  try {
    const r = await pool.query(
      `UPDATE transcripts SET transcript = transcript || $3::jsonb, updated_at = now()
       WHERE student_id = $1 AND day = $2 RETURNING student_id`,
      [p.studentId, p.day, JSON.stringify([note])]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Conversation not found.' });
    res.json(await loadThread(p.studentId, p.day));
  } catch (e) {
    console.error('Ceteris: posting note failed —', e.message);
    res.status(500).json({ error: 'Could not post the note.' });
  }
});

app.delete('/api/threads/:studentId/:day/notes/:noteId', requireInstructor, async (req, res) => {
  const p = threadParams(req, res);
  if (!p) return;
  try {
    await pool.query(
      `UPDATE transcripts SET transcript = COALESCE((
         SELECT jsonb_agg(m ORDER BY ord) FROM jsonb_array_elements(transcripts.transcript) WITH ORDINALITY AS t(m, ord)
         WHERE NOT (m->>'role' = 'instructor' AND m->>'id' = $3)), '[]'::jsonb)
       WHERE student_id = $1 AND day = $2`,
      [p.studentId, p.day, String(req.params.noteId)]
    );
    const thread = await loadThread(p.studentId, p.day);
    if (!thread) return res.status(404).json({ error: 'Conversation not found.' });
    res.json(thread);
  } catch (e) {
    console.error('Ceteris: deleting note failed —', e.message);
    res.status(500).json({ error: 'Could not delete the note.' });
  }
});

// --- In-class mini-essays (see essays.js) -----------------------------------------
const essays = require('./essays')(app, {
  pool, requireStudent, requireInstructor, callAnthropic, normalizeId, STUDENT_ID_PATTERN,
  instructorName: INSTRUCTOR_NAME
});

const PORT = process.env.PORT || 3000;
initDB()
  .then(() => essays.init())
  .then(() => {
    app.listen(PORT, () => console.log(`Ceteris server listening on port ${PORT}`));
  })
  .catch(e => {
    console.error('Ceteris: failed to initialize database —', e.message || e);
    process.exit(1);
  });
