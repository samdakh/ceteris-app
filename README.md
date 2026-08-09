# Ceteris — Economics Teaching Assistant

A tutoring chat for principles-level micro/macro students, paired with a live instructor dashboard.
Runs as a small Node.js server so students only need the link — no Claude account required.

## What's inside
- `server.js` — Express backend. Holds your Anthropic API key privately, talks to Claude on the student's behalf, and reads/writes a Postgres database.
- `public/index.html` — the frontend (student chat + instructor dashboard), served as static files.
- Data (student roster, transcripts, daily summaries, usage stats) lives in a **Postgres database**, not a local file — this is what makes reports permanent across server restarts.

## 1. Get an API key
Create one at [console.anthropic.com](https://console.anthropic.com) → **API Keys**. This is a different account from claude.ai — it's billed per use (small, usage-based cost), separate from any Claude subscription.

## 2. Set up a free Postgres database (Supabase)
Reports need somewhere durable to live. [Supabase](https://supabase.com) has a free tier that doesn't expire.

1. Go to [supabase.com](https://supabase.com) → sign up → **New project**. Pick any name/region, set a database password (save it somewhere).
2. Once the project finishes setting up, click **Connect** in the top bar of the dashboard. In the panel that opens, use the **Session pooler** (or **Direct connection**) string — avoid "Transaction pooler," which is tuned for serverless functions rather than a persistent server like this one.
3. That string will look like `postgresql://postgres.[your-project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres`. Replace the `[YOUR-PASSWORD]` placeholder with the actual database password you set in step 1.
That completed string is your `DATABASE_URL`. (Supabase has moved this connection panel before, so if "Connect" isn't where you expect it, search their dashboard for "connection string.")

## 3. Run it locally first (recommended)
```bash
npm install
cp .env.example .env
# edit .env:
#   ANTHROPIC_API_KEY      → your real Anthropic key
#   INSTRUCTOR_PASSWORD    → a password you choose
#   DATABASE_URL           → the Supabase connection string from step 2
npm start
```
On first run, the server automatically creates the tables it needs in your Supabase database. Open `http://localhost:3000` — try it as a student, then check the instructor dashboard (password-protected). Confirm both work before deploying.

## 4. Deploy so students can reach it
1. Push this folder to GitHub (`git init`, `git add .`, `git commit`, then push — `.env` is excluded via `.gitignore`, your key never leaves your machine this way).
2. Go to [render.com](https://render.com) → **New** → **Web Service** → connect your repo.
3. Build command: `npm install`  Start command: `npm start`
4. Under **Environment**, add all three variables: `ANTHROPIC_API_KEY`, `INSTRUCTOR_PASSWORD`, `DATABASE_URL` (same values as your local `.env`).
5. Deploy. You'll get a URL like `ceteris-xxxx.onrender.com` — share that with students.

Render's free web service tier still spins down after inactivity and loses anything stored on its own local disk — but since all your data now lives in Supabase instead, that no longer matters. The web service can restart as often as it likes; your reports stay put.

## Features
- **Student chat**: Socratic tutoring tuned for principles-level micro/macro, diagnosing misconceptions rather than just answering.
- **Instructor password gate**: clicking "I'm the instructor" requires `INSTRUCTOR_PASSWORD`. This is a single shared password, not per-user accounts — good enough to keep casual visitors out, not a substitute for real authentication if the dashboard will ever hold sensitive data.
- **Daily report tab**: today's (or any past date's) per-student summary, plus a class-wide "watch areas" chart of the most common misconceptions.
- **Progress over time**: each student card has a "view history over time" link showing every day they've used the tool.
- **Usage & engagement tab**: total messages, distinct days active, and first/last use per student — who's actually using it.

## Before rolling out to a full class
- No student-side login exists — anyone with the link can type any name. Fine for a trusted pilot group; add real student auth before this touches actual grades.
- Misconception detection depends on the model's read of the conversation — treat the dashboard as a helpful signal, not a grade.
- Consider a short honor-code note on the entry screen asking students to use their real roster name.

## Customizing the tutor
Edit `TUTOR_SYSTEM_PROMPT` and `SUMMARY_SYSTEM_PROMPT` in `server.js` to match your syllabus, emphasize particular units, or change the tutoring style (more/less Socratic, etc.).
