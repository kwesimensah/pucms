# PUCMS — AI-Driven Public Utility Complaint Management System

An undergraduate IT prototype for citizens to submit, track, and manage public
utility complaints (Electricity, Water, Sanitation, Telecommunications), with
automated AI/NLP classification and a full administrator review workflow.

This is a **working, end-to-end system** — not a static mockup. Every button,
form, and dashboard is backed by a real Express API and a real (rule-based)
NLP classification engine.

## Tech stack

- **Frontend:** Vanilla HTML / CSS / JavaScript (multi-page, no build step)
- **Backend:** Node.js + Express (REST API, JWT auth, role-based access control)
- **AI/NLP classification:** A standalone, swappable JavaScript module
  (`services/aiService.js`) implementing a keyword/rule-based NLP pipeline
  (preprocessing → feature extraction → scoring → classification → confidence
  → priority detection). It is isolated behind one function,
  `classifyComplaint(text)`, so it can later be replaced with a trained
  Python ML microservice without touching any other code.
- **Database:** JSON-file data layer (`services/db.js`) that mimics a
  relational store (collections + IDs + foreign keys). It exposes the same
  find/insert/update interface a real database wrapper would, so it can be
  swapped for PostgreSQL later without rewriting the services that use it.

## Project structure

```
pucms/
  server.js              # Express app entrypoint, mounts routes + static frontend
  config.js               # Port, JWT secret, bcrypt rounds
  services/
    db.js                 # JSON-file data layer (the "database")
    aiService.js           # AI/NLP classification engine (swappable)
    authService.js          # Registration, login, password hashing, JWT
    complaintService.js      # Core complaint lifecycle, status workflow, history
    notificationService.js    # In-app notifications
    reportService.js          # Analytics + CSV export
  middleware/auth.js       # JWT auth + role-based access control middleware
  routes/
    auth.js                # /api/auth/* — register, login (citizen + admin)
    complaints.js            # /api/complaints/* — citizen-facing
    admin.js                 # /api/admin/* — admin complaint management
    reports.js                # /api/admin/reports/* — analytics + CSV export
  data/                    # JSON "database" files (seeded with demo data)
  public/                  # Frontend (citizen + admin pages), served statically
  scripts/seed.js           # Populates demo accounts + ~40 realistic complaints
  tests/test.js              # 44 integration tests covering the full workflow
```

## How to run

```bash
npm install
npm run seed     # populates demo accounts and ~40 sample complaints
npm start         # starts the server on http://localhost:4000
```

Then open **http://localhost:4000** in your browser.

To re-run the automated tests (server must already be running in another
terminal):

```bash
npm test
```

## Demo credentials

**Administrator** (administrator accounts are not publicly registrable —
only citizens can self-register):
```
email:    admin@pucms.gov.gh
password: Admin@2026
```

**Citizen:**
```
email:    yaw.boateng@example.com
password: Citizen@123
```
(4 other seeded citizens follow the same `Citizen@123` password — see
`scripts/seed.js` for the full list.)

Or register your own citizen account from the login page.

## What's implemented

- **Auth:** registration, login/logout, bcrypt password hashing, JWT
  sessions, role-based access control (citizens can only ever see their own
  complaints; admins can see everything).
- **Citizen flow:** dashboard with summary stats, complaint submission form
  (with client- and server-side validation), "My Complaints" list, and a
  complaint detail page with a visual status timeline, the AI classification
  result, and administrator responses/resolution notes.
- **AI/NLP classification:** every complaint description is run through
  `aiService.classifyComplaint()` on submission. It returns a category, a
  utility, a confidence score, a priority level, and extracted keywords. If
  classification throws, the complaint is still saved (category defaults to
  "General", flagged for manual review) — a complaint is never lost.
- **Admin flow:** dashboard with aggregate stats and bar-chart analytics
  (by utility / category / status / priority), a filterable/searchable
  complaint management table, and a complaint review page where admins can
  accept or **correct** the AI's classification (with the original AI
  category/confidence and the correction preserved for audit), override
  priority, assign a team, advance status (illegal/backward transitions are
  rejected), respond to the citizen, and resolve with notes.
- **Status workflow:** Submitted → Under Review → Assigned → In Progress →
  Resolved → Closed, enforced server-side, with a full timestamped history
  visible to both citizen and admin.
- **Notifications:** stored per-citizen and created automatically at each
  workflow event (submission, classification, assignment, status change,
  response, resolution).
- **Reports:** date-range/utility/category/status/priority filtering,
  aggregate stats, average response/resolution time, and CSV export. All
  report output is explicitly labeled as simulated/demo data.
- **Error handling:** validation errors, duplicate registration, invalid
  login, invalid status transitions, not-found, and unauthorized access all
  return clear JSON errors that the frontend surfaces as readable messages.

## Testing

`tests/test.js` runs 44 integration tests against the live API, covering:
registration + duplicate-email rejection, login (valid/invalid), role-based
access control, complaint validation, AI classification accuracy against the
example inputs from the project brief (including the Low/Medium/High priority
examples), citizen tracking, unauthorized-access rejection, the full admin
review workflow (AI correction with audit trail, priority override,
assignment, status transitions, invalid-transition rejection, responses,
resolution), notifications, dashboard stats, filtering/search, analytics,
CSV export, and the AI failure-fallback path.

All 44 tests currently pass.

## Notes on the AI classification approach

Per the project brief, the initial implementation uses lightweight
keyword/rule-based NLP (weighted keyword scoring per category, plus
phrase-based priority signal detection for Critical/High/Low cases) rather
than a trained model — this matches the brief's own proposal and demo
dataset approach. Because it lives behind a single `classifyComplaint(text)`
function in its own module, it can be swapped for a real supervised model
(e.g. a Python microservice called over HTTP) later without any changes to
`complaintService.js`, the routes, or the frontend.

## Notes on the data layer

The JSON-file store in `services/db.js` is used so the prototype runs with
zero external dependencies. It's structured as clearly-separated collections
(`users`, `administrators`, `complaints`, `statusHistory`,
`aiClassifications`, `responses`, `notifications`, `auditLog`) with UUID
primary keys and foreign-key-style references (e.g. `complaint.userId`),
mirroring a relational schema so it can be migrated to PostgreSQL by
reimplementing `db.js`'s five functions (`find`, `findById`, `insert`,
`updateById`, `removeById`) against real tables.
