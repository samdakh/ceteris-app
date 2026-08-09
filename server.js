require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Database (Postgres) -----------------------------------------------
// Data now lives in a real database instead of a local file, so it survives
// server restarts/redeploys — the problem the old file-based storage had.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
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
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// --- Instructor auth -----------------------------------------------------
// Simple in-memory session store. Tokens reset if the server restarts —
// fine for a pilot; swap for a real session store before wider deployment.
const instructorTokens = new Set();

function requireInstructor(req, res, next) {
  const token = req.headers['x-instructor-token'];
  if (!token || !instructorTokens.has(token)) {
    return res.status(401).json({ error: 'Not authenticated as instructor' });
  }
  next();
}

// --- Claude API ------------------------------------------------------------
const TUTOR_SYSTEM_PROMPT = `You are Ceteris, a warm and patient economics teaching assistant for an introductory (principles-level) micro and macroeconomics course.

Your approach:
- Meet the student exactly where they are. Ask a diagnostic question before launching into an explanation if you're unsure what they already understand.
- Favor guiding questions over handing over answers outright — help them reason their way to the concept, especially for homework-style problems.
- When they have a misconception (e.g. confusing movement along a curve with a shift of the curve, confusing nominal vs real, average vs marginal), gently surface and correct it rather than just marking it wrong.
- Keep explanations concrete: use simple numeric examples or everyday scenarios (coffee shops, part-time jobs, a national economy) rather than abstract jargon.
- Keep responses focused — a few short paragraphs at most, not a lecture.
- Be encouraging without being saccharine.`;

const SUMMARY_SYSTEM_PROMPT = `You analyze a tutoring transcript between an economics student and a tutor. Output ONLY valid JSON, no markdown fences, no preamble, matching exactly this shape:
{"topics": string[], "misconceptions": string[], "masteryLevel": "struggling" | "developing" | "solid", "recommendedFollowUp": string}
"topics" are specific econ concepts discussed (e.g. "price elasticity of demand", "opportunity cost"). "misconceptions" are specific errors the student showed evidence of, in plain language a professor can scan quickly (empty array if none). "masteryLevel" is your holistic read of how solid their understanding seems today. "recommendedFollowUp" is one sentence of advice for the instructor.`;

async function callAnthropic(system, messages, maxTokens) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, system, messages })
  });
  const data = await resp.json();
  if (!resp.ok || data.type === 'error') {
    const detail = data.error ? `${data.error.type}: ${data.error.message}` : `HTTP ${resp.status}`;
    throw new Error(detail);
  }
  return data.content.map(b => b.text || '').join('\n').trim();
}

// --- Routes ----------------------------------------------------------------

// Register / update a student's display name against their id.
app.post('/api/register', async (req, res) => {
  const { studentId, name } = req.body || {};
  if (!studentId || !name) return res.status(400).json({ error: 'studentId and name required' });
  try {
    await pool.query(
      `INSERT INTO students (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [studentId, name]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('Ceteris: register failed —', e.message);
    res.status(500).json({ error: 'Could not register student' });
  }
});

// Fetch today's (or a given date's) transcript + summary for one student.
app.get('/api/session/:studentId', async (req, res) => {
  const day = req.query.date || todayKey();
  try {
    const t = await pool.query('SELECT transcript FROM transcripts WHERE student_id=$1 AND day=$2', [req.params.studentId, day]);
    const s = await pool.query('SELECT summary FROM summaries WHERE student_id=$1 AND day=$2', [req.params.studentId, day]);
    res.json({
      transcript: t.rows[0] ? t.rows[0].transcript : [],
      summary: s.rows[0] ? s.rows[0].summary : null
    });
  } catch (e) {
    console.error('Ceteris: session fetch failed —', e.message);
    res.status(500).json({ error: 'Could not load session' });
  }
});

// Main tutor turn: send a student message, get a reply, update the running summary.
app.post('/api/tutor', async (req, res) => {
  try {
    const { studentId, message } = req.body || {};
    if (!studentId || !message) return res.status(400).json({ error: 'studentId and message required' });

    const day = todayKey();
    const existing = await pool.query('SELECT transcript FROM transcripts WHERE student_id=$1 AND day=$2', [studentId, day]);
    const transcript = existing.rows[0] ? existing.rows[0].transcript : [];
    transcript.push({ role: 'user', content: message });

    const reply = await callAnthropic(TUTOR_SYSTEM_PROMPT, transcript.map(m => ({ role: m.role, content: m.content })), 1000);
    transcript.push({ role: 'assistant', content: reply });

    await pool.query(
      `INSERT INTO transcripts (student_id, day, transcript) VALUES ($1, $2, $3)
       ON CONFLICT (student_id, day) DO UPDATE SET transcript = EXCLUDED.transcript`,
      [studentId, day, JSON.stringify(transcript)]
    );

    // Update usage stats.
    const usageRow = await pool.query('SELECT * FROM usage_stats WHERE student_id=$1', [studentId]);
    const u = usageRow.rows[0]
      ? { messageCount: usageRow.rows[0].message_count, daysActive: usageRow.rows[0].days_active, firstSeen: usageRow.rows[0].first_seen, lastSeen: usageRow.rows[0].last_seen }
      : { messageCount: 0, daysActive: [], firstSeen: day, lastSeen: day };
    u.messageCount += 1;
    if (!u.daysActive.includes(day)) u.daysActive.push(day);
    u.lastSeen = day;
    await pool.query(
      `INSERT INTO usage_stats (student_id, message_count, days_active, first_seen, last_seen)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (student_id) DO UPDATE SET message_count=EXCLUDED.message_count, days_active=EXCLUDED.days_active, last_seen=EXCLUDED.last_seen`,
      [studentId, u.messageCount, JSON.stringify(u.daysActive), u.firstSeen, u.lastSeen]
    );

    // Regenerate the running summary. If this step fails, the tutor reply still succeeds —
    // the dashboard will just show "analysis pending" for this session until it catches up.
    try {
      const transcriptText = transcript.map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`).join('\n');
      const summaryText = await callAnthropic(SUMMARY_SYSTEM_PROMPT, [{ role: 'user', content: transcriptText }], 500);
      const match = summaryText.replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : summaryText);
      const summary = {
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        misconceptions: Array.isArray(parsed.misconceptions) ? parsed.misconceptions : [],
        masteryLevel: parsed.masteryLevel || 'developing',
        recommendedFollowUp: parsed.recommendedFollowUp || ''
      };
      await pool.query(
        `INSERT INTO summaries (student_id, day, summary) VALUES ($1, $2, $3)
         ON CONFLICT (student_id, day) DO UPDATE SET summary = EXCLUDED.summary`,
        [studentId, day, JSON.stringify(summary)]
      );
    } catch (summaryErr) {
      console.error('Ceteris: summary generation failed —', summaryErr.message);
    }

    res.json({ reply });
  } catch (e) {
    console.error('Ceteris: tutor call failed —', e.message);
    res.status(500).json({ error: e.message || 'Unknown error' });
  }
});

// Instructor login. Checks the password against INSTRUCTOR_PASSWORD and issues a token
// that must be sent as the x-instructor-token header on subsequent instructor requests.
app.post('/api/instructor-login', (req, res) => {
  const { password } = req.body || {};
  if (!process.env.INSTRUCTOR_PASSWORD) {
    return res.status(500).json({ error: 'INSTRUCTOR_PASSWORD is not set on the server' });
  }
  if (password !== process.env.INSTRUCTOR_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  instructorTokens.add(token);
  res.json({ token });
});

// Full history for one student across every day they've used the tool, plus their usage stats.
app.get('/api/student/:studentId/history', requireInstructor, async (req, res) => {
  const { studentId } = req.params;
  try {
    const studentRow = await pool.query('SELECT * FROM students WHERE id=$1', [studentId]);
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

// Class-wide engagement: how much each student is actually using the tool.
app.get('/api/usage', requireInstructor, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.id AS student_id, s.name, u.message_count, u.days_active, u.first_seen, u.last_seen
      FROM students s LEFT JOIN usage_stats u ON s.id = u.student_id
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

// Instructor dashboard data for a given date (defaults to today).
app.get('/api/dashboard', requireInstructor, async (req, res) => {
  const day = req.query.date || todayKey();
  try {
    const students = await pool.query('SELECT * FROM students');
    const records = [];
    for (const student of students.rows) {
      const summaryRow = await pool.query('SELECT summary FROM summaries WHERE student_id=$1 AND day=$2', [student.id, day]);
      const transcriptRow = await pool.query('SELECT transcript FROM transcripts WHERE student_id=$1 AND day=$2', [student.id, day]);
      if (summaryRow.rows[0]) {
        records.push({ studentId: student.id, name: student.name, summary: summaryRow.rows[0].summary });
      } else if (transcriptRow.rows[0] && transcriptRow.rows[0].transcript.length > 0) {
        records.push({
          studentId: student.id,
          name: student.name,
          summary: { topics: [], misconceptions: [], masteryLevel: 'developing', recommendedFollowUp: 'Session logged, analysis still pending — refresh in a moment.', pending: true }
        });
      }
    }
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
    console.error('Ceteris: failed to initialize database —', e.message);
    process.exit(1);
  });
