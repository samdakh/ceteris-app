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

    -- Instructor accounts. The first one (the admin) logs in with INSTRUCTOR_PASSWORD
    -- until they choose their own password.
    CREATE TABLE IF NOT EXISTS instructors (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT,
      password_set_at TIMESTAMPTZ,
      use_env_password BOOLEAN NOT NULL DEFAULT false,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- Course sections. Students and instructors can each belong to several.
    CREATE TABLE IF NOT EXISTS sections (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS section_instructors (
      section_id INT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      instructor_id INT NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
      PRIMARY KEY (section_id, instructor_id)
    );
    CREATE TABLE IF NOT EXISTS section_students (
      section_id INT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES roster(student_id) ON DELETE CASCADE,
      added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (section_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS section_students_by_student ON section_students (student_id);
    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS instructor_id INT;
    CREATE TABLE IF NOT EXISTS app_flags (key TEXT PRIMARY KEY);
  `);
  await pool.query('DELETE FROM auth_sessions WHERE expires_at < now()');
  // Sessions from the single-password days have no instructor attached: end them.
  await pool.query(`DELETE FROM auth_sessions WHERE role='instructor' AND instructor_id IS NULL`);

  // First run: the admin account, named after INSTRUCTOR_NAME.
  const count = await pool.query('SELECT COUNT(*)::int AS n FROM instructors');
  if (!count.rows[0].n) {
    await pool.query(`INSERT INTO instructors (username, name, use_env_password, is_admin) VALUES ($1, $2, true, true)`,
      [normalizeUsername(process.env.INSTRUCTOR_USERNAME || 'admin'), INSTRUCTOR_NAME === 'Your instructor' ? 'Instructor' : INSTRUCTOR_NAME]);
  }
  // Locked out? Set RESET_ADMIN_PASSWORD=true on the server and restart: the admin logs in
  // with INSTRUCTOR_PASSWORD again (then remove the setting).
  if (String(process.env.RESET_ADMIN_PASSWORD).toLowerCase() === 'true') {
    await pool.query(`UPDATE instructors SET use_env_password=true, password_hash=NULL, password_set_at=NULL
                      WHERE id = (SELECT id FROM instructors WHERE is_admin ORDER BY id LIMIT 1)`);
    console.log('Ceteris: admin password reset to INSTRUCTOR_PASSWORD (remove RESET_ADMIN_PASSWORD now).');
  }
  // One-time move to sections: everyone already on the roster goes into "My class",
  // taught by the admin.
  const moved = await pool.query(`INSERT INTO app_flags (key) VALUES ('sections_v1') ON CONFLICT DO NOTHING RETURNING key`);
  if (moved.rows[0]) {
    const anyStudents = await pool.query('SELECT 1 FROM roster LIMIT 1');
    const anySections = await pool.query('SELECT 1 FROM sections LIMIT 1');
    if (anyStudents.rows[0] && !anySections.rows[0]) {
      const sec = await pool.query(`INSERT INTO sections (name) VALUES ('My class') RETURNING id`);
      await pool.query(`INSERT INTO section_instructors (section_id, instructor_id) SELECT $1, id FROM instructors WHERE is_admin`, [sec.rows[0].id]);
      await pool.query(`INSERT INTO section_students (section_id, student_id) SELECT $1, student_id FROM roster`, [sec.rows[0].id]);
    }
  }
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

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._@-]{1,59}$/;
function normalizeUsername(raw) {
  return String(raw || '').trim().toLowerCase();
}

// --- Passwords (scrypt, salted; only the hash is stored) ---------------------------
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

async function createSession(role, studentId, days, instructorId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO auth_sessions (token_hash, role, student_id, expires_at, instructor_id)
     VALUES ($1, $2, $3, now() + ($4 || ' days')::interval, $5)`,
    [hashToken(token), role, studentId, String(days), instructorId || null]
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
       WHERE s.token_hash = $1 AND s.role = 'student' AND s.expires_at > now() AND r.password_hash IS NOT NULL
         AND EXISTS (SELECT 1 FROM section_students ss WHERE ss.student_id = r.student_id)`,
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
      `SELECT i.id, i.username, i.name, i.is_admin FROM auth_sessions s JOIN instructors i ON i.id = s.instructor_id
       WHERE s.token_hash = $1 AND s.role = 'instructor' AND s.expires_at > now()`,
      [hashToken(token)]
    );
    if (!result.rows[0]) return res.status(401).json({ error: 'Not authenticated as instructor' });
    const i = result.rows[0];
    req.instructor = { id: i.id, username: i.username, name: i.name, isAdmin: i.is_admin };
    next();
  } catch (e) {
    console.error('Ceteris: instructor auth failed —', e.message);
    res.status(500).json({ error: 'Could not verify login.' });
  }
}

// --- Who may see what -------------------------------------------------------------
// Instructors see only students in sections they teach.
async function teaches(instructorId, sectionId) {
  const r = await pool.query('SELECT 1 FROM section_instructors WHERE instructor_id=$1 AND section_id=$2', [instructorId, sectionId]);
  return !!r.rows[0];
}
async function canSeeStudent(instructorId, studentId) {
  const r = await pool.query(`SELECT 1 FROM section_students ss JOIN section_instructors si ON si.section_id = ss.section_id
                              WHERE si.instructor_id=$1 AND ss.student_id=$2 LIMIT 1`, [instructorId, studentId]);
  return !!r.rows[0];
}
// SQL condition: student column `col` is in one of instructor $i's sections (optionally one section $s).
const visibleTo = (col, i, sec) => `EXISTS (SELECT 1 FROM section_students vss JOIN section_instructors vsi ON vsi.section_id = vss.section_id
  WHERE vss.student_id = ${col} AND vsi.instructor_id = ${i}${sec ? ` AND (${sec}::int IS NULL OR vss.section_id = ${sec}::int)` : ''})`;
// Optional ?section=ID, which must be one of the instructor's sections.
async function sectionFilter(req, res) {
  if (req.query.section == null || req.query.section === '' || req.query.section === 'all') return { id: null };
  const id = parseInt(req.query.section, 10);
  if (!Number.isInteger(id) || !(await teaches(req.instructor.id, id))) { res.status(404).json({ error: 'Section not found.' }); return null; }
  return { id };
}
// Display names of a student's instructors, for notes and the sharing switch.
async function instructorNamesFor(studentId) {
  const r = await pool.query(`SELECT DISTINCT i.name FROM section_students ss JOIN section_instructors si ON si.section_id = ss.section_id
                              JOIN instructors i ON i.id = si.instructor_id WHERE ss.student_id=$1 ORDER BY i.name`, [studentId]);
  return r.rows.map(x => x.name);
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
      notes.push({ id: m.id, day: row.day, content: m.content, at: m.at || null, isNew: m.seen === false, question, author: m.author || null }));
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
  return m.role === 'instructor' ? { role: m.role, content: m.content, author: m.author || null } : { role: m.role, content: m.content };
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
    const r = await pool.query(`SELECT student_id, name, password_hash FROM roster r WHERE student_id=$1
                                AND EXISTS (SELECT 1 FROM section_students ss WHERE ss.student_id = r.student_id)`, [studentId]);
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
    const names = await instructorNamesFor(req.student.id);
    res.json({
      transcript: transcript.map(forStudent),
      panel: studentPanel(summary),
      stats: await studentStats(req.student.id, transcript),
      notes: await earlierNotes(req.student.id, day),
      instructorName: names.length === 1 ? names[0] : names.length ? 'your instructors' : INSTRUCTOR_NAME,
      instructorNames: names,
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

// Instructor login: username + password. Like students, a new instructor (or one whose
// password was reset) creates a password at first login. The admin account uses
// INSTRUCTOR_PASSWORD until they choose their own. A missing username means "admin".
app.post('/api/instructor-login', async (req, res) => {
  if (tooManyFailures(req.ip)) {
    return res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes and try again.' });
  }
  const b = req.body || {};
  const username = normalizeUsername(b.username || process.env.INSTRUCTOR_USERNAME || 'admin');
  const lockKey = 'instructor:' + username;
  try {
    const r = await pool.query('SELECT * FROM instructors WHERE username=$1', [username]);
    const row = r.rows[0];
    const bad = () => { recordFailure(req.ip); recordIdFailure(lockKey); return res.status(401).json({ error: 'Wrong username or password.' }); };
    if (!row) return bad();
    if (idLocked(lockKey)) return res.status(429).json({ error: 'Too many wrong passwords for this account. Wait 15 minutes, or ask the admin to reset it.' });
    if (row.use_env_password) {
      const envPw = process.env.INSTRUCTOR_PASSWORD;
      if (!envPw) return res.status(500).json({ error: 'INSTRUCTOR_PASSWORD is not set on the server.' });
      if (b.password == null || b.password === '') return res.json({ needsPassword: true });
      const a = crypto.createHash('sha256').update(String(b.password)).digest();
      const e = crypto.createHash('sha256').update(envPw).digest();
      if (!crypto.timingSafeEqual(a, e)) return bad();
    } else if (!row.password_hash) {
      if (b.newPassword == null || b.newPassword === '') return res.json({ needsNewPassword: true });
      const problem = instructorPasswordProblem(b.newPassword, username);
      if (problem) return res.status(400).json({ error: problem, needsNewPassword: true });
      const set = await pool.query(`UPDATE instructors SET password_hash=$2, password_set_at=now() WHERE id=$1 AND password_hash IS NULL AND NOT use_env_password`,
        [row.id, await hashPassword(b.newPassword)]);
      if (!set.rowCount) return res.status(409).json({ error: 'A password was just set for this account. Log in with it.', needsPassword: true });
    } else {
      if (b.password == null || b.password === '') return res.json({ needsPassword: true });
      if (!(await checkPassword(String(b.password), row.password_hash))) return bad();
    }
    failedById.delete(lockKey);
    const token = await createSession('instructor', null, 14, row.id);
    res.json({ token, instructor: { id: row.id, username: row.username, name: row.name, isAdmin: row.is_admin } });
  } catch (e) {
    console.error('Ceteris: instructor login failed —', e.message);
    res.status(500).json({ error: 'Login is unavailable right now.' });
  }
});

function instructorPasswordProblem(pw, username) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Choose a password of at least 10 characters.';
  if (pw.length > 200) return 'That password is too long.';
  if (pw.toLowerCase().includes(username) || /^(.)\1+$/.test(pw) || /^(password|1234567890|qwertyuiop)/i.test(pw)) return 'Choose a password that is harder to guess (not your username).';
  return null;
}

// --- The signed-in instructor -------------------------------------------------------

async function mySections(instructorId) {
  const r = await pool.query(`
    SELECT s.id, s.name,
      (SELECT COUNT(*)::int FROM section_students x WHERE x.section_id = s.id) AS students,
      (SELECT json_agg(json_build_object('id', i.id, 'name', i.name) ORDER BY i.name)
         FROM section_instructors y JOIN instructors i ON i.id = y.instructor_id WHERE y.section_id = s.id) AS instructors
    FROM sections s JOIN section_instructors si ON si.section_id = s.id
    WHERE si.instructor_id = $1 ORDER BY s.name, s.id`, [instructorId]);
  return r.rows;
}

app.get('/api/instructor/me', requireInstructor, async (req, res) => {
  try {
    const r = await pool.query('SELECT use_env_password FROM instructors WHERE id=$1', [req.instructor.id]);
    res.json({ ...req.instructor, usesSetupPassword: r.rows[0].use_env_password, sections: await mySections(req.instructor.id) });
  } catch (e) { console.error('Ceteris: me failed —', e.message); res.status(500).json({ error: 'Could not load your account.' }); }
});

// Change your own display name, username or password (the password needs the current one).
app.put('/api/instructor/me', requireInstructor, async (req, res) => {
  const b = req.body || {};
  try {
    const row = (await pool.query('SELECT * FROM instructors WHERE id=$1', [req.instructor.id])).rows[0];
    const name = b.name != null ? String(b.name).trim().slice(0, 80) : row.name;
    const username = b.username != null ? normalizeUsername(b.username) : row.username;
    if (!name) return res.status(400).json({ error: 'Enter the name students will see, e.g. Prof. Dakhlia.' });
    if (!USERNAME_PATTERN.test(username)) return res.status(400).json({ error: 'Usernames are 2–60 characters: letters, digits, and . _ @ -' });
    if (username !== row.username) {
      const taken = await pool.query('SELECT 1 FROM instructors WHERE username=$1 AND id<>$2', [username, row.id]);
      if (taken.rows[0]) return res.status(409).json({ error: 'That username is taken.' });
    }
    let hash = null;
    if (b.newPassword) {
      const current = String(b.currentPassword || '');
      const ok = row.use_env_password
        ? current === process.env.INSTRUCTOR_PASSWORD
        : await checkPassword(current, row.password_hash);
      if (!ok) return res.status(400).json({ error: 'Your current password is not right.' });
      const problem = instructorPasswordProblem(String(b.newPassword), username);
      if (problem) return res.status(400).json({ error: problem });
      hash = await hashPassword(String(b.newPassword));
    }
    await pool.query(`UPDATE instructors SET name=$2, username=$3,
                        password_hash = COALESCE($4, password_hash),
                        password_set_at = CASE WHEN $4::text IS NULL THEN password_set_at ELSE now() END,
                        use_env_password = CASE WHEN $4::text IS NULL THEN use_env_password ELSE false END
                      WHERE id=$1`, [row.id, name, username, hash]);
    res.json({ ok: true, name, username, passwordChanged: !!hash });
  } catch (e) { console.error('Ceteris: account update failed —', e.message); res.status(500).json({ error: 'Could not save your account.' }); }
});

// --- Instructor accounts (admin) -------------------------------------------------------

function requireAdmin(req, res, next) {
  if (!req.instructor || !req.instructor.isAdmin) return res.status(403).json({ error: 'Only an admin can manage instructor accounts.' });
  next();
}

// Everyone can see the list of names (to add a co-instructor to a section); details are admin-only.
app.get('/api/instructors', requireInstructor, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT i.id, i.username, i.name, i.is_admin, i.password_set_at, i.use_env_password,
        (SELECT json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
           FROM section_instructors si JOIN sections s ON s.id = si.section_id WHERE si.instructor_id = i.id) AS sections
      FROM instructors i ORDER BY i.name, i.id`);
    res.json({
      instructors: r.rows.map(i => req.instructor.isAdmin
        ? { id: i.id, username: i.username, name: i.name, isAdmin: i.is_admin, passwordSet: !!i.password_set_at || i.use_env_password, sections: i.sections || [] }
        : { id: i.id, name: i.name })
    });
  } catch (e) { console.error('Ceteris: instructor list failed —', e.message); res.status(500).json({ error: 'Could not load instructors.' }); }
});

app.post('/api/instructors', requireInstructor, requireAdmin, async (req, res) => {
  const b = req.body || {};
  const username = normalizeUsername(b.username);
  const name = String(b.name || '').trim().slice(0, 80);
  if (!USERNAME_PATTERN.test(username)) return res.status(400).json({ error: 'Usernames are 2–60 characters: letters, digits, and . _ @ - (an email address works).' });
  if (!name) return res.status(400).json({ error: 'Enter the name students will see, e.g. Prof. Rivera.' });
  try {
    const r = await pool.query(`INSERT INTO instructors (username, name, is_admin) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING RETURNING id`,
      [username, name, !!b.isAdmin]);
    if (!r.rows[0]) return res.status(409).json({ error: 'That username is taken.' });
    res.json({ id: r.rows[0].id });
  } catch (e) { console.error('Ceteris: add instructor failed —', e.message); res.status(500).json({ error: 'Could not add the instructor.' }); }
});

app.post('/api/instructors/:id/reset-password', requireInstructor, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const r = await pool.query(`UPDATE instructors SET password_hash=NULL, password_set_at=NULL, use_env_password=false WHERE id=$1 RETURNING username`, [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Instructor not found.' });
    await pool.query(`DELETE FROM auth_sessions WHERE role='instructor' AND instructor_id=$1`, [id]);
    failedById.delete('instructor:' + r.rows[0].username);
    res.json({ ok: true });
  } catch (e) { console.error('Ceteris: instructor reset failed —', e.message); res.status(500).json({ error: 'Could not reset that password.' }); }
});

app.put('/api/instructors/:id', requireInstructor, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body || {};
  try {
    if (b.isAdmin === false) {
      const admins = await pool.query('SELECT COUNT(*)::int AS n FROM instructors WHERE is_admin AND id<>$1', [id]);
      if (!admins.rows[0].n) return res.status(400).json({ error: 'Keep at least one admin.' });
    }
    const name = b.name != null ? String(b.name).trim().slice(0, 80) : null;
    const r = await pool.query(`UPDATE instructors SET name = COALESCE(NULLIF($2, ''), name), is_admin = COALESCE($3, is_admin) WHERE id=$1 RETURNING id`,
      [id, name, typeof b.isAdmin === 'boolean' ? b.isAdmin : null]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Instructor not found.' });
    res.json({ ok: true });
  } catch (e) { console.error('Ceteris: instructor update failed —', e.message); res.status(500).json({ error: 'Could not update the instructor.' }); }
});

// Removing an account takes the instructor off their sections. A section left with no
// instructor stays (with its students), and the admin can assign someone to it.
app.delete('/api/instructors/:id', requireInstructor, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.instructor.id) return res.status(400).json({ error: 'You can’t remove your own account.' });
  try {
    await pool.query(`DELETE FROM auth_sessions WHERE role='instructor' AND instructor_id=$1`, [id]);
    const r = await pool.query('DELETE FROM instructors WHERE id=$1 RETURNING id', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Instructor not found.' });
    res.json({ ok: true });
  } catch (e) { console.error('Ceteris: instructor delete failed —', e.message); res.status(500).json({ error: 'Could not remove the instructor.' }); }
});

// --- Sections -------------------------------------------------------------------------

// Your sections; for an admin, ?all=1 lists every section (to assign instructors).
app.get('/api/sections', requireInstructor, async (req, res) => {
  try {
    if (req.query.all === '1' && req.instructor.isAdmin) {
      const r = await pool.query(`
        SELECT s.id, s.name,
          (SELECT COUNT(*)::int FROM section_students x WHERE x.section_id = s.id) AS students,
          (SELECT json_agg(json_build_object('id', i.id, 'name', i.name) ORDER BY i.name)
             FROM section_instructors y JOIN instructors i ON i.id = y.instructor_id WHERE y.section_id = s.id) AS instructors
        FROM sections s ORDER BY s.name, s.id`);
      return res.json({ sections: r.rows.map(x => ({ ...x, instructors: x.instructors || [] })) });
    }
    res.json({ sections: (await mySections(req.instructor.id)).map(x => ({ ...x, instructors: x.instructors || [] })) });
  } catch (e) { console.error('Ceteris: sections failed —', e.message); res.status(500).json({ error: 'Could not load sections.' }); }
});

app.post('/api/sections', requireInstructor, async (req, res) => {
  const name = String((req.body && req.body.name) || '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'Name the section, e.g. ECO 201-01 (Fall 2026).' });
  try {
    const r = await pool.query('INSERT INTO sections (name) VALUES ($1) RETURNING id', [name]);
    await pool.query('INSERT INTO section_instructors (section_id, instructor_id) VALUES ($1, $2)', [r.rows[0].id, req.instructor.id]);
    res.json({ id: r.rows[0].id, name });
  } catch (e) { console.error('Ceteris: add section failed —', e.message); res.status(500).json({ error: 'Could not create the section.' }); }
});

// A section's instructors (or an admin) can rename it and change who teaches it.
async function canManageSection(req, sectionId) {
  return req.instructor.isAdmin || teaches(req.instructor.id, sectionId);
}

app.put('/api/sections/:id', requireInstructor, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const name = String((req.body && req.body.name) || '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'The section needs a name.' });
  try {
    if (!(await canManageSection(req, id))) return res.status(404).json({ error: 'Section not found.' });
    await pool.query('UPDATE sections SET name=$2 WHERE id=$1', [id, name]);
    res.json({ ok: true });
  } catch (e) { console.error('Ceteris: rename section failed —', e.message); res.status(500).json({ error: 'Could not rename the section.' }); }
});

// Only an empty section can be deleted, so no student loses access by accident.
app.delete('/api/sections/:id', requireInstructor, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    if (!(await canManageSection(req, id))) return res.status(404).json({ error: 'Section not found.' });
    const n = await pool.query('SELECT COUNT(*)::int AS n FROM section_students WHERE section_id=$1', [id]);
    if (n.rows[0].n) return res.status(409).json({ error: 'Remove the students from this section first.' });
    await pool.query('DELETE FROM sections WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (e) { console.error('Ceteris: delete section failed —', e.message); res.status(500).json({ error: 'Could not delete the section.' }); }
});

app.post('/api/sections/:id/instructors', requireInstructor, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const instructorId = parseInt(req.body && req.body.instructorId, 10);
  try {
    if (!(await canManageSection(req, id))) return res.status(404).json({ error: 'Section not found.' });
    const i = await pool.query('SELECT 1 FROM instructors WHERE id=$1', [instructorId]);
    if (!i.rows[0]) return res.status(404).json({ error: 'Instructor not found.' });
    await pool.query('INSERT INTO section_instructors (section_id, instructor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, instructorId]);
    res.json({ ok: true });
  } catch (e) { console.error('Ceteris: add co-instructor failed —', e.message); res.status(500).json({ error: 'Could not add the instructor.' }); }
});

app.delete('/api/sections/:id/instructors/:instructorId', requireInstructor, async (req, res) => {
  const id = parseInt(req.params.id, 10), instructorId = parseInt(req.params.instructorId, 10);
  try {
    if (!(await canManageSection(req, id))) return res.status(404).json({ error: 'Section not found.' });
    const n = await pool.query('SELECT COUNT(*)::int AS n FROM section_instructors WHERE section_id=$1', [id]);
    if (n.rows[0].n <= 1 && !req.instructor.isAdmin) return res.status(400).json({ error: 'A section needs at least one instructor.' });
    await pool.query('DELETE FROM section_instructors WHERE section_id=$1 AND instructor_id=$2', [id, instructorId]);
    res.json({ ok: true });
  } catch (e) { console.error('Ceteris: remove co-instructor failed —', e.message); res.status(500).json({ error: 'Could not remove the instructor.' }); }
});

// --- Roster (students, by section) ----------------------------------------------------

// Students in your sections (or one section with ?section=ID), with the sections of yours they're in.
app.get('/api/roster', requireInstructor, async (req, res) => {
  const f = await sectionFilter(req, res);
  if (!f) return;
  try {
    const result = await pool.query(`
      SELECT r.student_id, r.name, r.password_set_at, u.last_seen,
        (SELECT json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
           FROM section_students ss JOIN sections s ON s.id = ss.section_id
           JOIN section_instructors si ON si.section_id = s.id AND si.instructor_id = $1
          WHERE ss.student_id = r.student_id) AS sections
      FROM roster r LEFT JOIN usage_stats u ON u.student_id = r.student_id
      WHERE ${visibleTo('r.student_id', '$1', '$2')}
      ORDER BY r.name NULLS LAST, r.student_id
    `, [req.instructor.id, f.id]);
    res.json({ rows: result.rows.map(r => ({ studentId: r.student_id, name: r.name, lastSeen: r.last_seen, passwordSetAt: r.password_set_at, sections: r.sections || [] })) });
  } catch (e) {
    console.error('Ceteris: roster fetch failed —', e.message);
    res.status(500).json({ error: 'Could not load the roster.' });
  }
});

// Accepts pasted text: one student per line, "ID" or "ID, Name" (comma, tab, or semicolon),
// and adds them to one of your sections. Pasting columns straight from a spreadsheet works.
app.post('/api/roster', requireInstructor, async (req, res) => {
  const sectionId = parseInt(req.body && req.body.sectionId, 10);
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
    if (!Number.isInteger(sectionId) || !(await teaches(req.instructor.id, sectionId))) {
      return res.status(400).json({ error: 'Choose one of your sections to add these students to.' });
    }
    let added = 0, already = 0;
    for (const [id, name] of entries) {
      await pool.query(
        `INSERT INTO roster (student_id, name) VALUES ($1, $2)
         ON CONFLICT (student_id) DO UPDATE SET name = COALESCE(EXCLUDED.name, roster.name)`, [id, name]);
      const m = await pool.query(`INSERT INTO section_students (section_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING student_id`, [sectionId, id]);
      if (m.rows[0]) added += 1; else already += 1;
    }
    res.json({ added, updated: already, invalid });
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
    if (!(await canSeeStudent(req.instructor.id, id))) return res.status(404).json({ error: 'That student is not in your sections.' });
    await pool.query('UPDATE roster SET password_hash=NULL, password_set_at=NULL WHERE student_id=$1', [id]);
    await pool.query(`DELETE FROM auth_sessions WHERE role='student' AND student_id=$1`, [id]);
    failedById.delete(id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Ceteris: password reset failed —', e.message);
    res.status(500).json({ error: 'Could not reset that password.' });
  }
});

// Taking a student out of a section. A student in no section can no longer log in;
// their past work stays in the database.
app.delete('/api/sections/:id/students/:studentId', requireInstructor, async (req, res) => {
  const sectionId = parseInt(req.params.id, 10);
  const id = normalizeId(req.params.studentId);
  try {
    if (!(await teaches(req.instructor.id, sectionId))) return res.status(404).json({ error: 'Section not found.' });
    await pool.query('DELETE FROM section_students WHERE section_id=$1 AND student_id=$2', [sectionId, id]);
    const left = await pool.query('SELECT 1 FROM section_students WHERE student_id=$1 LIMIT 1', [id]);
    if (!left.rows[0]) await pool.query(`DELETE FROM auth_sessions WHERE role='student' AND student_id=$1`, [id]);
    res.json({ ok: true, stillEnrolled: !!left.rows[0] });
  } catch (e) {
    console.error('Ceteris: remove from section failed —', e.message);
    res.status(500).json({ error: 'Could not remove that student.' });
  }
});

// Every student in your sections (or one section), including those who have never used the tool.
app.get('/api/usage', requireInstructor, async (req, res) => {
  const f = await sectionFilter(req, res);
  if (!f) return;
  try {
    const result = await pool.query(`
      SELECT r.student_id, r.name, r.share_transcripts, u.message_count, u.days_active, u.first_seen, u.last_seen
      FROM roster r LEFT JOIN usage_stats u ON r.student_id = u.student_id
      WHERE ${visibleTo('r.student_id', '$1', '$2')}
    `, [req.instructor.id, f.id]);
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
  const f = await sectionFilter(req, res);
  if (!f) return;
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
        AND ${visibleTo('t.student_id', '$3', '$4')}
      ORDER BY COALESCE(t.updated_at, t.day::date::timestamptz) DESC
      LIMIT 300
    `, [cutoff, student, req.instructor.id, f.id]);
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

// Also checks that the student is in one of the instructor's sections.
async function threadParams(req, res) {
  const studentId = normalizeId(req.params.studentId);
  const day = String(req.params.day || '');
  if (!STUDENT_ID_PATTERN.test(studentId) || !DAY_PATTERN.test(day)) {
    res.status(400).json({ error: 'Invalid conversation reference.' });
    return null;
  }
  if (!(await canSeeStudent(req.instructor.id, studentId))) {
    res.status(404).json({ error: 'Conversation not found.' });
    return null;
  }
  return { studentId, day };
}

app.get('/api/threads/:studentId/:day', requireInstructor, async (req, res) => {
  const p = await threadParams(req, res);
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
  const p = await threadParams(req, res);
  if (!p) return;
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ error: 'Write a note first.' });
  if (text.length > 4000) return res.status(400).json({ error: 'That note is too long (4,000 characters max).' });
  const note = { id: newId(), role: 'instructor', content: text, at: new Date().toISOString(), seen: false, author: req.instructor.name, authorId: req.instructor.id };
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
  const p = await threadParams(req, res);
  if (!p) return;
  try {
    await pool.query(
      `UPDATE transcripts SET transcript = COALESCE((
         SELECT jsonb_agg(m ORDER BY ord) FROM jsonb_array_elements(transcripts.transcript) WITH ORDINALITY AS t(m, ord)
         WHERE NOT (m->>'role' = 'instructor' AND m->>'id' = $3 AND (m->>'authorId' IS NULL OR m->>'authorId' = $4))), '[]'::jsonb)
       WHERE student_id = $1 AND day = $2`,
      [p.studentId, p.day, String(req.params.noteId), String(req.instructor.id)]
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
  instructorName: INSTRUCTOR_NAME, teaches, canSeeStudent, visibleTo, sectionFilter, instructorNamesFor
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
