# Ceteris — Economics Teaching Assistant

A tutoring chat for principles-level micro/macro students, paired with a live instructor dashboard.
Runs as a small Node.js server so students only need the link — no Claude account required.

## What's inside
- `server.js` — Express backend. Holds your Anthropic API key privately, talks to Claude on the student's behalf, and reads/writes a Postgres database.
- `public/index.html` — the frontend (student chat + instructor dashboard), served as static files.
- `essays.js` — the in-class mini-essay writing coach (server side: tables, routes, the coach).
- `public/essays-ui.js` and `public/essays.css` — the essay screens for students and the instructor's Essays tab.
- `public/admin-ui.js` and `public/admin.css` — instructor accounts, sections and their students.
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

## Instructors and sections
**Instructor accounts.** Each instructor has their own username and password.
- The first account is the **admin**: username `admin` (or `INSTRUCTOR_USERNAME` if you set it), password `INSTRUCTOR_PASSWORD`. The first time you log in, Ceteris opens **Account** and asks you to choose your own password; after that, `INSTRUCTOR_PASSWORD` no longer works for your account. On **Account** you can also change your username and the name students see on your notes.
- **Adding instructors** (admin → **Instructors** tab): enter a username (an email address works) and the name students see. Send them the link and their username; they create their password at first login. You can make someone an admin, reset their password (they create a new one at next login), or remove the account (their sections and students stay).
- **Locked out of the admin account?** On Render, add `RESET_ADMIN_PASSWORD=true`, redeploy, log in with `INSTRUCTOR_PASSWORD`, choose a new password, then delete `RESET_ADMIN_PASSWORD`.

**Sections** (tab **Sections & students**). Each instructor creates their own sections and adds students to them.
- A student can be in several sections (micro and macro, say), and a section can have several instructors. Any instructor of a section can add a co-instructor to it; the admin can assign anyone to any section from the **Instructors** tab.
- **Instructors see only their own sections' students**: conversations, notes, usage, essays and papers. Conversations and Usage have a section filter when you teach more than one.
- Students can log in only while they're in at least one section.
- Students who were already on the roster before this update were placed in a section called **My class**, taught by the admin. Rename it, or create new sections and move students.

## Adding your students
Students log in with their 6-character student ID (letters and/or digits, not case-sensitive) and a password.

1. In **Sections & students**, pick a section (or create one).
2. Paste one student per line: the ID, optionally followed by a comma and the name (`A1B2C3, Jordan Lee`). Two columns copied straight from a spreadsheet also work. Lines without a valid ID (like a header row) are skipped and listed so you can check them.
3. Click **Add to [section]**. Pasting an ID that's already there only updates the name, so you can re-paste the full list anytime. A student already in another section is added to this one too.
4. **Remove** takes a student out of that section; a student left in no section can't log in. Their past sessions stay in your reports.

**Passwords**: the first time a student logs in, Ceteris asks them to create a password (at least 8 characters, not their student ID). After that they log in with their ID and password. Only a salted hash of the password is stored, so nobody, including you, can read it.
- **Forgotten password**: in **Sections & students**, click **Reset password** next to the student (then confirm). It logs them out everywhere, and the next time they log in they create a new password. Until they do, anyone who knows their ID could set it, so reset only when they ask and tell them to log in right away.
- The section's student list shows whether each student has set a password yet. If a student finds their ID already has a password they never set, reset it.
- Eight wrong passwords for one ID pause logins for that ID for 15 minutes (a reset clears the pause).
- When you first deploy this version, students who were already logged in are asked to log in again and create a password.

Students stay logged in on their device until they click **Log out**, so remind them to log out on shared lab computers.

## Features
- **Student chat**: Socratic tutoring tuned for principles-level micro/macro. Replies render as formatted text (bold, lists, small tables), and starter questions help first-time students begin.
- **Student side panel**: topics explored, what the student worked through today, and two suggested next questions they can click. It never shows mastery labels or flagged mistakes; those appear only on your dashboard.
- **Instructor accounts**: one per instructor, with an admin who manages them (see above). Logins survive server restarts and last 14 days.
- **Conversations tab**: a discussion-board list of every conversation (one per student per day), newest activity first. Filter by period (today, 7 days, 30 days, all) or by student name/ID. Each row shows the student's opening question, how many questions they asked, Ceteris's read (mastery and flags), and whether you've replied. A "watch areas" chart above the list shows the most common misconceptions in the conversations listed.
- **Reading a conversation**: click a row to see the full exchange between the student and Ceteris, with Ceteris's read in the sidebar and a link to all of that student's conversations. This only works for students who have chosen to share (see below).
- **Chiming in**: at the bottom of any conversation, write a note (Markdown works; Cmd/Ctrl + Enter posts it). The student sees it in their chat, or, for an earlier day's conversation, in a "From your instructor" box with a banner the next time they open Ceteris. Ceteris also reads your note and treats it as course guidance, so it can build on it if the student follows up. Each note shows whether the student has seen it, and you can delete a note.
- **Usage & engagement tab**: messages, days active, and first/last use for every student in your sections, including those who haven't tried it yet.
- **Sections & students tab**: your sections, their students and co-instructors.
- **Instructors tab** (admins): instructor accounts and who teaches which section.
- **Essays tab**: in-class mini-essays with a writing coach (see below).
- **Dark mode**: a moon/sun switch in every header. It starts out matching the device's own light/dark setting and remembers each person's choice on that device. The dark theme uses the official blue as its main surface with gold accents; its darker blues are shades of the official blue (mixed with black).

## In-class mini-essays
Students write a short essay inside Ceteris during class, guided through planning stages by a writing coach that asks questions but never writes for them. Whatever they've written is submitted automatically at the end time.

**Setting one up** (instructor dashboard → **Essays**):
1. The first essay, "Airbnb taxes and housing," is already loaded with its stages, rubric, bonus and private brief. It stays hidden from students until you assign it to a section and give it a time. Each instructor sees the essays they created or that are assigned to their sections; times and submissions are per section, and you see only your own sections'.
2. Click **Edit** (or **New essay**). Under **Sections and session times**, tick each of your sections that gets the essay and choose its format (your computer's time zone is used):
   - **In class**: a date with start and end times. Students in that section can open it only then, and whatever they've written is submitted automatically at the end.
   - **Take-home (timed)**: an "available from" time (blank means now), a due time, and a time limit (20 minutes by default). Each student gets **one attempt**: their clock starts when they click Start, can't be paused or restarted, and their work is submitted automatically when the time limit runs out (or at the due time, if that comes first). Moving the due time earlier also cuts any attempt in progress.
   Each section has its own time, so one essay (one rubric, one submissions page) serves sections that meet at different times. Then check the planning stages (title, minutes, task, guiding question), drafting and checking minutes, and target length.
3. **Rubric**: students see only the criterion names and weights (so the descriptions can't give the answer away); the coach sees everything. The **bonus** is never shown to students, and the coach never prompts for it.
4. **Private brief**: notes only the coach reads (the logic you expect, what sets the size of the effect, weak spots to probe).
5. **Writing coach** on/off: with it off, students plan, draft and check on their own.

**What students see**: while an essay is open, a banner in their Ceteris chat says "In-class essay open now" with a Start button. Before starting, a short screen tells them what you will see (plan, essay, draft history, coach conversation), that paste is off, that work submits automatically at the end, and that a dead device means finishing on paper. Then:
- Planning stages, one at a time, with the task and guiding question. Drafting unlocks once every stage has notes.
- A draft editor with bold, italic and underline, a word count against the target, and their plan alongside.
- A Check step: the rubric criteria as a private checklist, a preview of the essay, and a two-step Submit.
- A countdown that stays pinned at the top of the essay screen (from the server's clock), a bar showing how far through the session they are, and a "Suggested now" step based on the stage minutes; warnings at 5 minutes and 1 minute. The countdown also shows on the chat banner and on the start screen, and on your Submissions page while the essay is open.
- Autosave as they type (and every 10 seconds while offline, until it reconnects). Paste and drag-and-drop are blocked everywhere on the essay screen, with one exception: text copied from one of their own plan notes can be pasted into the essay (as plain text). Since paste is also blocked in the plan boxes, everything in the plan was typed by the student. Each such paste is recorded.
- The coach panel beside the essay (a Write | Coach switch on tablets). One example phrasing per paper, only for a sentence that stays unintelligible after the coach asks what the student meant; it can't be selected or copied. If the API is busy, the server retries and the student just sees "thinking…" a little longer.
- After submitting (or at the end time), a read-only copy of their plan and essay, also listed later under "Your in-class essays" in the chat's side panel.

While an in-class essay is open and a student hasn't submitted, the regular tutoring chat is paused for that student, so it can't be used to write the essay. For a take-home, the tutor is paused only during the student's own timed attempt.

**Reading submissions**: **Submissions** shows every student on the roster (not started, writing, submitted, submitted automatically) with plan progress, word count and how many questions they asked the coach. It refreshes every 20 seconds while the essay is open. The Words column notes how many words came from the plan. Click a name to read the paper: the essay (with how many of its words were pasted from the plan, and each paste listed), the plan, the full coach conversation (with stage and time), and the rubric with its strong/weak descriptions alongside for grading. **Previous/Next student** steps through papers, and **Print** prints a clean copy (in light colors even in dark mode).

**Details**: autosaves that arrive up to 90 seconds after the end time still count (for a slow connection), then everything still in progress is submitted automatically. A snapshot of the draft is kept about every 30 seconds for the draft history. Each student can ask the coach up to 60 questions per essay. An essay can be deleted only before any student has started it; **Duplicate** copies one (without its time) for another section.

## Student privacy: summaries by default
Each student decides what you see, with a switch in their chat's side panel: **Share full conversations with [you]**. It is **off by default**.
- **Off (default):** you see Ceteris's summary of each conversation (topics, mastery read, flagged misconceptions, follow-up suggestion), but none of the student's own words. Their threads are titled by topic and marked "Summary only". The summarizer is instructed to paraphrase, never quote.
- **On:** you can read their full conversations, including earlier ones. Students can switch it off again at any time, which hides them again.
- **Either way** you can post notes, and the Usage tab shows each student's choice.

The switch controls what the app shows you. Full conversations are still stored in your Supabase database (Ceteris needs them to carry on a conversation), so anyone with access to that database could read them. Keep the Supabase login to yourself.

## Settings
- `CLASS_TIMEZONE` (optional, default `America/New_York`): decides when "today" starts and ends, which is when a student's conversation rolls over to a new one. Any IANA zone name works, e.g. `America/Chicago`.
- `INSTRUCTOR_NAME` (optional): the admin account's display name the first time Ceteris starts, e.g. `Prof. Dakhlia`. After that, each instructor sets their own name under **Account**.
- `INSTRUCTOR_USERNAME` (optional, default `admin`): the admin account's username the first time Ceteris starts.
- `RESET_ADMIN_PASSWORD` (only when locked out): see Instructors and sections.

## Before rolling out to a full class
- **Tell students about the sharing switch.** It's off by default and explained in the chat's side panel, but a word in class or on the syllabus helps students make an informed choice, especially if you'd like them to opt in.
- Each student's first login sets their password, so ask students to log in early in the term (before anyone else could claim their ID). Repeated failed logins are slowed down.
- Misconception detection depends on the model's read of the conversation — treat the dashboard as a helpful signal, not a grade.

## Planned: levels and progression (not built yet)
Gamify the student experience so students progress through levels as they use Ceteris, like a video game. The groundwork is already in place: the student panel's stats (questions, days visited, topics explored) and the per-day topic history are natural inputs for experience points, streaks, and level thresholds, and the side panel is where a level badge and progress bar would live.

## Customizing the tutor
Edit `TUTOR_SYSTEM_PROMPT` and `SUMMARY_SYSTEM_PROMPT` in `server.js` to match your syllabus, emphasize particular units, or change the tutoring style (more/less Socratic, etc.).
