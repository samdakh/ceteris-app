require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory instructor session store. Tokens reset if the server restarts —
// fine for a pilot; swap for a real session store before wider deployment.
const instructorTokens = new Set();

function requireInstructor(req, res, next) {
  const token = req.headers['x-instructor-token'];
  if (!token || !instructorTokens.has(token)) {
    return res.status(401).json({ error: 'Not authenticated as instructor' });
  }
  next();
}

const DB_PATH = path.join(__dirname, 'data', 'db.json');

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify({ students: {}, transcripts: {}, summaries: {}, usage: {} }, null, 2));
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  if (!db.usage) db.usage = {}; // migrate older db.json files that predate usage tracking
  return db;
}

function trackUsage(db, studentId, day) {
  const u = db.usage[studentId] || { messageCount: 0, daysActive: [], firstSeen: day, lastSeen: day };
  u.messageCount += 1;
  if (!u.daysActive.includes(day)) u.daysActive.push(day);
  u.lastSeen = day;
  db.usage[studentId] = u;
}
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

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
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages
    })
  });
  const data = await resp.json();
  if (!resp.ok || data.type === 'error') {
    const detail = data.error ? `${data.error.type}: ${data.error.message}` : `HTTP ${resp.status}`;
    throw new Error(detail);
  }
  return data.content.map(b => b.text || '').join('\n').trim();
}

// Register / update a student's display name against their id.
app.post('/api/register', (req, res) => {
  const { studentId, name } = req.body || {};
  if (!studentId || !name) return res.status(400).json({ error: 'studentId and name required' });
  const db = loadDB();
  db.students[studentId] = { id: studentId, name };
  saveDB(db);
  res.json({ ok: true });
});

// Fetch today's (or a given date's) transcript + summary for one student.
app.get('/api/session/:studentId', (req, res) => {
  const db = loadDB();
  const day = req.query.date || todayKey();
  const key = `${req.params.studentId}:${day}`;
  res.json({
    transcript: db.transcripts[key] || [],
    summary: db.summaries[key] || null
  });
});

// Main tutor turn: send a student message, get a reply, update the running summary.
app.post('/api/tutor', async (req, res) => {
  try {
    const { studentId, message } = req.body || {};
    if (!studentId || !message) return res.status(400).json({ error: 'studentId and message required' });

    const db = loadDB();
    const day = todayKey();
    const key = `${studentId}:${day}`;
    const transcript = db.transcripts[key] || [];
    transcript.push({ role: 'user', content: message });

    const reply = await callAnthropic(
      TUTOR_SYSTEM_PROMPT,
      transcript.map(m => ({ role: m.role, content: m.content })),
      1000
    );
    transcript.push({ role: 'assistant', content: reply });
    db.transcripts[key] = transcript;
    trackUsage(db, studentId, day);
    saveDB(db);

    // Regenerate the running summary. If this step fails, the tutor reply still succeeds —
    // the dashboard will just show "analysis pending" for this session until it catches up.
    try {
      const transcriptText = transcript.map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`).join('\n');
      const summaryText = await callAnthropic(SUMMARY_SYSTEM_PROMPT, [{ role: 'user', content: transcriptText }], 500);
      const match = summaryText.replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : summaryText);
      db.summaries[key] = {
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        misconceptions: Array.isArray(parsed.misconceptions) ? parsed.misconceptions : [],
        masteryLevel: parsed.masteryLevel || 'developing',
        recommendedFollowUp: parsed.recommendedFollowUp || ''
      };
      saveDB(db);
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
app.get('/api/student/:studentId/history', requireInstructor, (req, res) => {
  const db = loadDB();
  const { studentId } = req.params;
  const info = db.students[studentId];
  if (!info) return res.status(404).json({ error: 'Student not found' });

  const days = Object.keys(db.summaries)
    .filter(k => k.startsWith(`${studentId}:`))
    .map(k => ({ date: k.split(':')[1], summary: db.summaries[k] }))
    .sort((a, b) => a.date.localeCompare(b.date));

  res.json({ studentId, name: info.name, days, usage: db.usage[studentId] || null });
});

// Class-wide engagement: how much each student is actually using the tool.
app.get('/api/usage', requireInstructor, (req, res) => {
  const db = loadDB();
  const rows = Object.entries(db.students).map(([studentId, info]) => {
    const u = db.usage[studentId] || { messageCount: 0, daysActive: [], firstSeen: null, lastSeen: null };
    return {
      studentId,
      name: info.name,
      messageCount: u.messageCount,
      daysActive: u.daysActive.length,
      firstSeen: u.firstSeen,
      lastSeen: u.lastSeen
    };
  });
  res.json({ rows });
});

// Instructor dashboard data for a given date (defaults to today).
app.get('/api/dashboard', requireInstructor, (req, res) => {
  const db = loadDB();
  const day = req.query.date || todayKey();
  const records = [];
  for (const [studentId, info] of Object.entries(db.students)) {
    const key = `${studentId}:${day}`;
    const summary = db.summaries[key];
    const transcript = db.transcripts[key];
    if (summary) {
      records.push({ studentId, name: info.name, summary });
    } else if (transcript && transcript.length > 0) {
      records.push({
        studentId,
        name: info.name,
        summary: { topics: [], misconceptions: [], masteryLevel: 'developing', recommendedFollowUp: 'Session logged, analysis still pending — refresh in a moment.', pending: true }
      });
    }
  }
  res.json({ date: day, records });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ceteris server listening on port ${PORT}`));
