# Ceteris — Economics Teaching Assistant

A tutoring chat for principles-level micro/macro students, paired with a live instructor dashboard.
Runs as a small Node.js server so students only need the link — no Claude account required.

## What's inside
- `server.js` — Express backend. Holds your Anthropic API key privately and talks to Claude on the student's behalf.
- `public/index.html` — the frontend (student chat + instructor dashboard), served as static files.
- `data/db.json` — created automatically on first run. Stores student roster, transcripts, and daily summaries as plain JSON.

## 1. Get an API key
Create one at [console.anthropic.com](https://console.anthropic.com) → **API Keys**. This is a different account from claude.ai — it's billed per use (small, usage-based cost), separate from any Claude subscription.

## 2. Run it locally first (recommended)
```bash
npm install
cp .env.example .env
# edit .env — paste your real key in place of sk-ant-your-key-here,
# and choose your own instructor password in place of choose-a-password-here
npm start
```

### New: instructor password
Clicking "I'm the instructor" now prompts for a password before showing the dashboard, checked against `INSTRUCTOR_PASSWORD` in `.env`. This is intentionally simple (a shared password, not per-user accounts) — good enough to keep casual visitors out, not a substitute for real authentication if the dashboard will ever hold sensitive data. The login session is remembered in the browser (so you won't be asked every time) but resets whenever the server restarts.

### New: progress over time + usage tracking
- Each student's dashboard card now has a **"view history over time"** link showing every day they've used the tool, with that day's topics and mastery level — useful for spotting whether a student is improving or stuck over the semester.
- A second dashboard tab, **Usage & engagement**, shows every student's total messages sent, number of distinct days active, and first/last use dates — so you can see who's actually using the tool and who isn't.
Open `http://localhost:3000` — try it as a student, then open a new tab and check the instructor dashboard. Confirm both work before deploying.

## 3. Deploy so students can reach it
**Render.com** is the simplest option for this project (free tier available, keeps a persistent disk so `data/db.json` survives between requests):

1. Push this folder to a GitHub repo (`git init`, commit, push — data/db.json and .env are already excluded via `.gitignore`).
2. Go to [render.com](https://render.com) → **New** → **Web Service** → connect your repo.
3. Build command: `npm install`  Start command: `npm start`
4. Under **Environment**, add `ANTHROPIC_API_KEY` with your real key.
5. Deploy. You'll get a URL like `ceteris-xxxx.onrender.com` — that's the link you share with students.

**A note on persistence**: Render's free tier spins the service down after inactivity and can lose local file data on restart. Fine for a pilot; for a real semester-long rollout, swap `data/db.json` for a proper database (Render's own free Postgres add-on works well) — ask me and I'll do that migration when you're ready.

**Vercel** works too but its serverless functions don't have a writable disk at all — you'd need an external database (e.g. Vercel KV or Supabase) from day one. Render is the faster path to something working today.

## 4. Before rolling out to a full class
- No login/authentication exists yet — anyone with the link can type any name. Fine for a trusted pilot group; add real auth before this touches actual grades.
- Misconception detection depends on the model's read of the conversation — treat the dashboard as a helpful signal, not a grade.
- Consider a short honor-code note on the entry screen asking students to use their real roster name.

## Customizing the tutor
Edit `TUTOR_SYSTEM_PROMPT` and `SUMMARY_SYSTEM_PROMPT` in `server.js` to match your syllabus, emphasize particular units, or change the tutoring style (more/less Socratic, etc.).
# ceteris-app
