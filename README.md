# Ceteris — Economics Teaching Assistant

A tutoring chat for principles-level micro/macro students, paired with a live instructor dashboard.
Runs as a small Node.js server so students only need the link — no Claude account required.

## What's inside
- `server.js` — Express backend. Holds your Anthropic API key privately, talks to Claude on the student's behalf, and reads/writes a Postgres database.
- `public/index.html` — the frontend (student chat + instructor dashboard), served as static files.
- Data (student roster, logins, transcripts, daily summaries, usage stats) lives in a **Postgres database**, not a local file — this is what makes reports permanent across server restarts.

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

## Optional: skip the API key with Workload Identity Federation
Instead of storing a long-lived `ANTHROPIC_API_KEY` on Render, the server can authenticate with short-lived tokens that Render issues to your service and Anthropic verifies. Nothing secret is stored, so there is nothing to expire, leak, or rotate. The server uses the official Anthropic SDK, which picks federation up automatically from environment variables.

**Requirements:** a Render **Pro** workspace or higher (managed OIDC is not available on the free/Hobby tiers), and an admin, owner, or primary owner role in your Anthropic organization.

**One-time setup in the Claude Console** (platform.claude.com):
1. **Settings → Service accounts** → create a service account with the **Developer** role.
2. **Settings → Workload identity → Issuers** → add a **Custom OIDC** issuer. Issuer URL: `https://oidc.render.com/<WORKSPACE_ID>` (your Render workspace ID starts with `tea-` and is at the top of Render's workspace Settings page). JWKS source: **OIDC Discovery**.
3. **Settings → Workload identity → Rules** → create a federation rule for that issuer and service account. Subject pattern: `workspace:<WORKSPACE_ID>:environment:default:service:<SERVICE_ID>` (the service ID starts with `srv-` and is at the top of your service's Settings page; use your environment's `evm-` ID instead of `default` if the service belongs to a Render project environment). Expected audience: `api.anthropic.com`. Token lifetime: at least 30 minutes.

**On Render** (service → Environment):
1. Add `ANTHROPIC_FEDERATION_RULE_ID` (the rule's `fdrl_...` ID), `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID` (`svac_...`), and `ANTHROPIC_WORKSPACE_ID`.
2. **Delete `ANTHROPIC_API_KEY`.** If it is still set, it takes priority over federation and the app will keep using the key.
3. Do **not** set `ANTHROPIC_IDENTITY_TOKEN_FILE` yourself. Render sets it automatically on deploy once it sees `ANTHROPIC_FEDERATION_RULE_ID`.
4. Redeploy, then ask the tutor a question to confirm it replies. The rule's **Test connection** tab and Settings → Workload identity → authentication history in the Console show whether token exchanges are succeeding.

Local testing still uses an API key in `.env` (federation only works on Render, where the identity token exists). Once federation is confirmed working on Render, delete the old API key in the Console.

## Adding your students
Students log in with their 6-character student ID (letters and/or digits, not case-sensitive). Only IDs on your roster can log in.

1. Open the app, click **I'm the instructor**, and log in. The first time, with an empty roster, the dashboard opens on the **Roster** tab.
2. Paste one student per line: the ID, optionally followed by a comma and the name (`A1B2C3, Jordan Lee`). Two columns copied straight from a spreadsheet also work. Lines without a valid ID (like a header row) are skipped and listed so you can check them.
3. Click **Add to roster**. Pasting an ID that's already there only updates the name, so you can re-paste the full list anytime.
4. **Remove** ends a student's access immediately; their past sessions stay in your reports.

Students stay logged in on their device until they click **Log out**, so remind them to log out on shared lab computers.

## Features
- **Student chat**: Socratic tutoring tuned for principles-level micro/macro. Replies render as formatted text (bold, lists, small tables), and starter questions help first-time students begin.
- **Student side panel**: topics explored, what the student worked through today, and two suggested next questions they can click. It never shows mastery labels or flagged mistakes; those appear only on your dashboard.
- **Instructor password gate**: a single shared password (`INSTRUCTOR_PASSWORD`). Logins now survive server restarts and last 14 days.
- **Conversations tab**: a discussion-board list of every conversation (one per student per day), newest activity first. Filter by period (today, 7 days, 30 days, all) or by student name/ID. Each row shows the student's opening question, how many questions they asked, Ceteris's read (mastery and flags), and whether you've replied. A "watch areas" chart above the list shows the most common misconceptions in the conversations listed.
- **Reading a conversation**: click a row to see the full exchange between the student and Ceteris, with Ceteris's read in the sidebar and a link to all of that student's conversations. This only works for students who have chosen to share (see below).
- **Chiming in**: at the bottom of any conversation, write a note (Markdown works; Cmd/Ctrl + Enter posts it). The student sees it in their chat, or, for an earlier day's conversation, in a "From your instructor" box with a banner the next time they open Ceteris. Ceteris also reads your note and treats it as course guidance, so it can build on it if the student follows up. Each note shows whether the student has seen it, and you can delete a note.
- **Usage & engagement tab**: messages, days active, and first/last use for everyone on the roster, including students who haven't tried it yet.
- **Roster tab**: add and remove student IDs.
- **Dark mode**: a moon/sun switch in every header. It starts out matching the device's own light/dark setting and remembers each person's choice on that device. The dark theme uses the official blue as its main surface with gold accents; its darker blues are shades of the official blue (mixed with black).

## Student privacy: summaries by default
Each student decides what you see, with a switch in their chat's side panel: **Share full conversations with [you]**. It is **off by default**.
- **Off (default):** you see Ceteris's summary of each conversation (topics, mastery read, flagged misconceptions, follow-up suggestion), but none of the student's own words. Their threads are titled by topic and marked "Summary only". The summarizer is instructed to paraphrase, never quote.
- **On:** you can read their full conversations, including earlier ones. Students can switch it off again at any time, which hides them again.
- **Either way** you can post notes, and the Usage tab shows each student's choice.

The switch controls what the app shows you. Full conversations are still stored in your Supabase database (Ceteris needs them to carry on a conversation), so anyone with access to that database could read them. Keep the Supabase login to yourself.

## Settings
- `CLASS_TIMEZONE` (optional, default `America/New_York`): decides when "today" starts and ends, which is when a student's conversation rolls over to a new one. Any IANA zone name works, e.g. `America/Chicago`.
- `INSTRUCTOR_NAME` (optional, default "Your instructor"): how your notes are signed for students, e.g. `Prof. Dakhlia`.

## Before rolling out to a full class
- **Tell students about the sharing switch.** It's off by default and explained in the chat's side panel, but a word in class or on the syllabus helps students make an informed choice, especially if you'd like them to opt in.
- Logging in needs only a student ID, so anyone who knows a classmate's ID could log in as them. Repeated failed logins from one network are slowed down, but treat IDs as semi-private and don't base grades on the dashboard alone.
- Misconception detection depends on the model's read of the conversation — treat the dashboard as a helpful signal, not a grade.

## Planned: levels and progression (not built yet)
Gamify the student experience so students progress through levels as they use Ceteris, like a video game. The groundwork is already in place: the student panel's stats (questions, days visited, topics explored) and the per-day topic history are natural inputs for experience points, streaks, and level thresholds, and the side panel is where a level badge and progress bar would live.

## Customizing the tutor
Edit `TUTOR_SYSTEM_PROMPT` and `SUMMARY_SYSTEM_PROMPT` in `server.js` to match your syllabus, emphasize particular units, or change the tutoring style (more/less Socratic, etc.).
