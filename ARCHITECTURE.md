# LMA API — Architecture & Backend Logic

## What Is This?

A standalone NestJS API that powers the Dominance Scorecard quiz for Local Marketing Audit. It handles lead capture, quiz scoring, and PDF report generation — designed to be called from any client (WordPress, mobile, etc.) over HTTP.

```
WordPress / Any Client              LMA API (NestJS on Render)
┌────────────────────────┐         ┌────────────────────────────────┐
│                        │  fetch  │                                │
│  quiz.js               ├────────>│  POST /api/lead/capture        │
│  (vanilla JS)          │         │  POST /api/quiz/submit         │
│                        │<────────│  POST /api/report/generate     │
│                        │   JSON  │  GET  /api/report/download/:id │
│                        │         │  GET  /api/health              │
└────────────────────────┘         │                                │
                                   │  MongoDB Atlas                 │
                                   └────────────────────────────────┘
```

---

## The User Flow (Step by Step)

Here's what happens when someone takes the quiz, from first click to PDF download:

### Step 1: Answer 10 Questions (client-side only)

The user answers 10 multiple-choice questions about their local marketing. Each question has three options:
- **A** = 0 points (weak)
- **B** = 5 points (moderate)
- **C** = 10 points (strong)

No API calls happen during this step — the frontend manages question navigation, auto-advance (400ms delay after selecting), and the progress bar entirely in-browser.

### Step 2: Fill Out Lead Form → `POST /api/lead/capture`

After question 10, the user sees a lead capture form. On submit, the frontend sends:

```json
{
  "fullName": "John Smith",
  "email": "john@example.com",
  "phone": "555-123-4567",
  "businessName": "Smith Plumbing",
  "city": "Austin",
  "consentGiven": true
}
```

**What the API does:**

1. **Validate** — `class-validator` decorators on `CreateLeadDto` reject bad input (empty fields, invalid email, `consentGiven` must be `true`)
2. **Sanitize** — Strip HTML tags from all string fields
3. **Hash email** — SHA-256 hash of lowercase email for dedup lookup (`emailHash`)
4. **Dedup check** — Query MongoDB: does a lead with this `emailHash` already exist?
   - **Yes** → return the existing `leadId` (no duplicate created)
   - **No** → continue to step 5
5. **Encrypt PII** — AES-256-GCM encrypt `email` and `businessName` (stored as `iv.tag.ciphertext` in base64)
6. **Generate ID** — 21-character URL-safe nanoid using `crypto.randomBytes`
7. **Store** — Create MongoDB document with encrypted fields, plain-text name/phone/city, and tag `quiz-lead`
8. **Return** — `{ "leadId": "aVGF6dLDrVb2vxO7cLB2O" }`

### Step 3: Submit Answers → `POST /api/quiz/submit`

Immediately after lead capture, the frontend submits the quiz:

```json
{
  "leadId": "aVGF6dLDrVb2vxO7cLB2O",
  "answers": ["c", "b", "c", "a", "c", "b", "c", "c", "b", "c"]
}
```

**What the API does:**

1. **Validate** — Must be exactly 10 answers, each `"a"`, `"b"`, or `"c"`
2. **Score** — Sum points: `a=0, b=5, c=10`. Example: 7 C's + 2 B's + 1 A = 80
3. **Determine tier** based on total score:

   | Score Range | Tier Key            | Name              |
   |-------------|---------------------|-------------------|
   | 0–30        | `at_risk`           | At Risk           |
   | 31–55       | `needs_improvement` | Needs Improvement |
   | 56–75       | `growth_ready`      | Growth Ready      |
   | 76–100      | `market_leader`     | Market Leader     |

4. **Calculate pillar scores** — 5 marketing pillars, each scored from 2 questions:

   | Pillar                  | Questions     | Max Score |
   |-------------------------|---------------|-----------|
   | Local Visibility        | Q1 + Q2       | 20        |
   | Conversion & Contact    | Q3 + Q4       | 20        |
   | Reputation & Trust      | Q5 + Q9       | 20        |
   | Marketing Consistency   | Q6 + Q10      | 20        |
   | Tracking & Performance  | Q7 + Q8       | 20        |

5. **Store** — Create `QuizResponse` document with answers, score, tier, quiz version
6. **Update lead** — Set `scoreTier`, `overallScore`, add tag `tier:{tier_key}`
7. **Return** — `{ "sessionId": "Dy76...", "totalScore": 75, "tier": "growth_ready" }`

The frontend then shows a 2.5-second "calculating" animation before revealing results.

### Step 4: Download Report → `POST /api/report/generate`

When the user clicks "Download Report", the frontend sends:

```json
{
  "sessionId": "Dy76vIPfYtLnogo52ZWJj"
}
```

**What the API does:**

1. **Dedup** — Check if a report already exists for this `sessionId`
   - **Yes** → return existing `reportId`
   - **No** → continue
2. **Fetch data** — Load the `QuizResponse` and linked `Lead` from MongoDB
3. **Decrypt** — Decrypt `businessName` from the lead (needed for the PDF)
4. **Recalculate pillar scores** — From stored answers (server is source of truth)
5. **Generate PDF** — Load template `dominance-playbook.pdf` and replace all `{{placeholders}}`:
   - Business name, city, date, total score, tier name, tier description
   - All 5 pillar scores, lowest pillar name + impact statement
6. **Store** — Save the raw PDF buffer to MongoDB (as `Buffer` type), ~5.8 MB
7. **Return** — `{ "reportId": "xeXibDA_XgPV" }`

### Step 5: Download PDF → `GET /api/report/download/:reportId`

The frontend opens this URL in a new tab. The API:

1. Fetches the report from MongoDB
2. Increments `downloadCount`
3. Sends the raw PDF buffer with `Content-Type: application/pdf`

---

## Module Architecture

NestJS organizes code into modules. Here's how they connect:

```
AppModule (root)
├── ConfigModule          — reads .env variables
├── MongooseModule         — connects to MongoDB
├── ThrottlerModule        — rate limiting (60 req/min global)
├── CommonModule (global)  — shared services available everywhere
│   ├── EncryptionService  — AES-256-GCM encrypt/decrypt + SHA-256 hash
│   ├── ScoringService     — score calculation + tier + pillar logic
│   ├── IdService          — nanoid generation (21-char and 12-char)
│   └── SanitizeService    — HTML tag stripping
├── LeadModule
│   ├── LeadController     — POST /api/lead/capture
│   ├── LeadService        — sanitize → encrypt → dedup → store
│   └── Lead (schema)      — MongoDB model
├── QuizModule
│   ├── QuizController     — POST /api/quiz/submit
│   ├── QuizService        — score → store → update lead
│   └── QuizResponse (schema)
├── ReportModule
│   ├── ReportController   — POST /api/report/generate + GET /download/:id
│   ├── ReportService      — dedup → fetch data → decrypt → generate → store
│   ├── PdfService         — template loading + placeholder replacement
│   └── Report (schema)
└── HealthModule
    └── HealthController   — GET /api/health
```

### Why CommonModule is `@Global()`

The 4 shared services (encryption, scoring, ID, sanitize) are used by multiple feature modules. Making CommonModule global means any module can inject these services without explicitly importing CommonModule.

---

## Security Layers

### PII Encryption (EncryptionService)

Two fields are encrypted at rest: `email` and `businessName`. Everything else (name, phone, city) is stored in plain text.

**Algorithm:** AES-256-GCM (authenticated encryption)

```
encrypt("john@example.com")
→ "dGhpcyBpcyBhbiBpdg==.dGFnLi4u.Y2lwaGVydGV4dA=="
    ↑ IV (12 bytes)       ↑ Auth Tag   ↑ Ciphertext
```

The format is `base64(iv).base64(tag).base64(ciphertext)`. The auth tag ensures no one can tamper with the ciphertext without the key — `decrypt()` will throw if the tag doesn't match.

**Dedup without exposing emails:** Instead of searching encrypted emails (which would require decrypting every record), we store a SHA-256 hash (`emailHash`) alongside the encrypted email. Same email = same hash = same lead.

### Rate Limiting (ThrottlerModule)

Global: 60 requests/minute per IP. Specific endpoints have tighter limits:

| Endpoint             | Limit          |
|----------------------|----------------|
| `POST /lead/capture` | 10 req/min/IP  |
| `POST /quiz/submit`  | 10 req/min/IP  |
| `POST /report/generate` | 5 req/min/IP |
| Everything else      | 60 req/min/IP  |

### Input Validation (ValidationPipe + DTOs)

Every POST body is validated by `class-validator` decorators before reaching the service layer:

- **CreateLeadDto** — `@IsEmail()`, `@MinLength(1)`, `@MaxLength(150)`, `@Equals(true)` for consent
- **SubmitQuizDto** — `@ArrayMinSize(10)`, `@ArrayMaxSize(10)`, `@IsIn(['a','b','c'])` for each answer
- **GenerateReportDto** — `@IsString()`, `@MinLength(1)` for sessionId

The `whitelist: true` option strips any extra fields not in the DTO — so attackers can't sneak in extra MongoDB operators.

### Input Sanitization (SanitizeService)

All string inputs are stripped of HTML tags (`<script>`, etc.) before storage. This prevents stored XSS if values are ever rendered somewhere.

### CORS

Only allowed origins can call the API:
- **Development:** `localhost:8888`, `localhost:3000`
- **Production:** `localmarketingaudit.com`, `www.localmarketingaudit.com`

Controlled via `ALLOWED_ORIGINS` env variable.

---

## PDF Generation Deep Dive

This is the most complex part of the backend. The PDF template (`dominance-playbook.pdf`) was designed in Adobe Illustrator with placeholder text like `{{Business_Name}}`, `{{Total_Score}}`, etc.

### The Problem

Illustrator doesn't store text as simple strings in PDF. It uses **TJ/Tj operators** with kerning-adjusted arrays:

```
[({{T)101.9(otal_Scor)9.6(e}})]TJ
```

This means `{{Total_Score}}` is split across multiple string fragments with kerning values between them.

### The Solution (PdfService)

1. **Load template** with `pdf-lib`
2. **Iterate every PDF stream object** — these contain the drawing instructions
3. **Decompress** — Most streams use FlateDecode (zlib). Inflate them to get the raw PostScript-like commands
4. **Regex match TJ arrays** — `\[([^\]]*)\]\s*TJ` captures the array content
5. **Concatenate string parts** — Join all `(text)` fragments, ignoring kerning numbers
6. **Find placeholder** — If the concatenated string contains `{{Business_Name}}`, replace it
7. **Collapse to simple Tj** — Replace the complex TJ array with a simple `(replaced text) Tj` (kerning is sacrificed, but the text renders correctly)
8. **Also handle simple Tj** — Some placeholders weren't split by kerning
9. **Re-compress** — `flateStream()` re-compresses the modified stream
10. **Preserve dictionary** — Copy BBox, Subtype, Resources from the original stream object
11. **Save** — `pdfDoc.save()` produces the final bytes

### WinAnsiEncoding

PDFs use WinAnsiEncoding for text, not UTF-8. The `escapePdfString()` method maps Unicode characters (curly quotes, em dashes, etc.) to their WinAnsi byte values. Characters outside this encoding become `?`.

---

## MongoDB Collections

### leads

```
{
  _id:              "aVGF6dLDrVb2vxO7cLB2O",  // nanoid(21)
  fullName:         "John Smith",               // plain text
  email:            "iv.tag.ciphertext",        // AES-256-GCM encrypted
  emailHash:        "a1b2c3d4...",              // SHA-256 (for dedup)
  phone:            "555-123-4567",             // plain text
  businessName:     "iv.tag.ciphertext",        // AES-256-GCM encrypted
  city:             "Austin",                   // plain text
  consentGiven:     true,
  scoreTier:        "growth_ready",             // set after quiz submit
  overallScore:     75,                         // set after quiz submit
  tags:             ["quiz-lead", "tier:growth_ready"],
  createdAt:        "2026-02-18T...",
  updatedAt:        "2026-02-18T..."
}
```

### quizresponses

```
{
  _id:           "Dy76vIPfYtLnogo52ZWJj",   // nanoid(21) = sessionId
  leadId:        "aVGF6dLDrVb2vxO7cLB2O",
  answers:       ["c","b","c","a","c","b","c","c","b","c"],
  totalScore:    75,
  tier:          "growth_ready",
  quizVersion:   "1.0",
  completedAt:   "2026-02-18T...",
  createdAt:     "2026-02-18T...",
  updatedAt:     "2026-02-18T..."
}
```

### reports

```
{
  _id:            "xeXibDA_XgPV",     // nanoid(12) = reportId
  sessionId:      "Dy76vIPfYtLnogo52ZWJj",
  leadId:         "aVGF6dLDrVb2vxO7cLB2O",
  pdfData:        <Buffer ...>,       // raw PDF bytes (~5.8 MB)
  fileSizeBytes:  5829154,
  generatedAt:    "2026-02-18T...",
  emailStatus:    "skipped",
  downloadCount:  0,
  createdAt:      "2026-02-18T...",
  updatedAt:      "2026-02-18T..."
}
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://...` |
| `PII_ENCRYPTION_KEY` | 64-char hex string (32 bytes for AES-256) | `0123456789abcdef...` |
| `PORT` | HTTP port | `3000` |
| `NODE_ENV` | Environment | `development` or `production` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `https://localmarketingaudit.com` |

---

## File Map

```
lma-api/
├── src/
│   ├── main.ts                              # Bootstrap: CORS, validation, prefix
│   ├── app.module.ts                        # Root module: wires everything together
│   ├── common/
│   │   ├── common.module.ts                 # Global shared services
│   │   ├── encryption/
│   │   │   └── encryption.service.ts        # AES-256-GCM + SHA-256
│   │   ├── scoring/
│   │   │   └── scoring.service.ts           # Score calc, tier lookup, pillar scores
│   │   ├── id/
│   │   │   └── id.service.ts                # URL-safe ID generation (crypto.randomBytes)
│   │   ├── sanitize/
│   │   │   └── sanitize.service.ts          # HTML tag stripping
│   │   ├── config/
│   │   │   ├── quiz-questions.ts            # 10 questions with options
│   │   │   ├── tiers.ts                     # 4 tier definitions + CTAs
│   │   │   └── pillars.ts                   # 5 pillar names + impact statements
│   │   └── types/
│   │       ├── quiz.ts                      # AnswerKey, Question types
│   │       └── scoring.ts                   # TierKey, PillarKey, ScoringResult
│   ├── lead/
│   │   ├── lead.module.ts
│   │   ├── lead.controller.ts               # POST /api/lead/capture
│   │   ├── lead.service.ts                  # Sanitize → encrypt → dedup → store
│   │   ├── lead.schema.ts                   # Mongoose: _id, encrypted email, emailHash
│   │   └── dto/
│   │       └── create-lead.dto.ts           # Validation: email, lengths, consent=true
│   ├── quiz/
│   │   ├── quiz.module.ts
│   │   ├── quiz.controller.ts               # POST /api/quiz/submit
│   │   ├── quiz.service.ts                  # Score → store → update lead
│   │   ├── quiz-response.schema.ts          # Mongoose: answers, score, tier
│   │   └── dto/
│   │       └── submit-quiz.dto.ts           # Validation: 10 answers, each a/b/c
│   ├── report/
│   │   ├── report.module.ts
│   │   ├── report.controller.ts             # POST /generate + GET /download/:id
│   │   ├── report.service.ts                # Dedup → fetch → decrypt → PDF → store
│   │   ├── pdf.service.ts                   # Template replacement (TJ/Tj operators)
│   │   ├── report.schema.ts                 # Mongoose: pdfData (Buffer), downloadCount
│   │   ├── dto/
│   │   │   └── generate-report.dto.ts
│   │   └── templates/
│   │       └── dominance-playbook.pdf       # Illustrator template with {{placeholders}}
│   └── health/
│       ├── health.module.ts
│       └── health.controller.ts             # GET /api/health
├── .env                                     # Local environment variables
├── .env.example                             # Template for new developers
├── Dockerfile                               # Multi-stage build for Render
├── nest-cli.json
├── tsconfig.json
└── package.json
```

---

## Deployment (Render)

The Dockerfile uses a multi-stage build:

1. **Builder stage** — Install all deps, compile TypeScript → `dist/`
2. **Runner stage** — Install production deps only, copy compiled code + PDF template
3. **Result** — Slim Alpine image, ~150 MB

On Render, set the 5 environment variables and point the service to the Dockerfile. The API runs on port 3000.

---

## Data Flow Summary

```
User answers 10 questions (client-side)
         │
         ▼
POST /api/lead/capture
  → validate → sanitize → hash email → dedup check
  → encrypt email + businessName → store Lead → return leadId
         │
         ▼
POST /api/quiz/submit
  → validate 10 answers → score (a=0, b=5, c=10) → determine tier
  → calculate 5 pillar scores → store QuizResponse → update Lead
  → return { sessionId, totalScore, tier }
         │
         ▼
POST /api/report/generate
  → dedup by sessionId → fetch QuizResponse + Lead
  → decrypt businessName → recalculate pillar scores
  → load PDF template → replace {{placeholders}} in TJ/Tj operators
  → store PDF buffer in MongoDB → return reportId
         │
         ▼
GET /api/report/download/:reportId
  → fetch Report → increment downloadCount → stream PDF to browser
```
