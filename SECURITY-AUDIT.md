# Security Audit Report

**Project:** Local Marketing Audit — NestJS API
**Date:** 2026-02-22
**Scope:** All source files in `app/src/`, config files, dependencies

---

## Summary

A full security audit was performed on the NestJS API. **8 issues** were identified and **all have been resolved**. The remaining npm audit warnings are in dev-only dependencies and do not affect production.

---

## Findings & Remediation

### 1. HTML Injection in Email Template

**Severity:** High
**File:** `src/email/email.service.ts`
**Issue:** `businessName` was interpolated directly into HTML email body and subject line without escaping, allowing potential XSS in email clients and header injection via newlines.
**Fix:**
- Added `escapeHtml()` method to escape `&`, `<`, `>`, `"`, `'` before HTML interpolation
- Added newline/control character stripping for the email subject line to prevent header injection

---

### 2. No Access Control on Report Endpoints (IDOR)

**Severity:** High
**Files:** `src/report/report.controller.ts`, `src/report/report.service.ts`, `src/common/encryption/encryption.service.ts`
**Issue:** `GET /api/report/download/:reportId` and `POST /api/report/email/:reportId` were publicly accessible. Anyone who guessed a reportId could download PDFs or trigger emails.
**Fix:**
- Added HMAC-based signed tokens (`signToken` / `verifyToken`) to `EncryptionService`
- `POST /api/report/generate` now returns `{ reportId, token }` — the token is required for all subsequent report access
- `download` endpoint requires `?token=...` query parameter
- `email` endpoint requires `token` in the request body
- Token verification uses constant-time comparison to prevent timing attacks

---

### 3. Missing Security Headers (Helmet)

**Severity:** Medium
**File:** `src/main.ts`
**Issue:** No HTTP security headers were set (missing X-Content-Type-Options, X-Frame-Options, HSTS, CSP, etc.).
**Fix:**
- Installed `helmet` package
- Added `app.use(helmet())` before route registration, which sets:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Strict-Transport-Security` (HSTS)
  - `X-XSS-Protection`
  - And other standard security headers

---

### 4. Inconsistent PII Encryption (phone, fullName)

**Severity:** Medium
**File:** `src/lead/lead.service.ts`, `src/lead/lead.schema.ts`
**Issue:** `email` and `businessName` were encrypted at rest using AES-256-GCM, but `fullName` and `phone` were stored in plaintext — inconsistent PII protection.
**Fix:**
- `fullName` and `phone` are now encrypted with `this.encryption.encrypt()` before storage
- Schema comments updated to reflect all encrypted fields

---

### 5. RESEND_API_KEY Silent Failure

**Severity:** Medium
**File:** `src/email/email.service.ts`
**Issue:** `this.config.get('RESEND_API_KEY')` returns `undefined` if the env var is missing, causing the Resend client to silently fail at runtime instead of failing at startup.
**Fix:**
- Changed to `this.config.getOrThrow('RESEND_API_KEY')` — app now fails fast with a clear error if the key is not configured

---

### 6. PII Logged in Plaintext

**Severity:** Medium
**File:** `src/email/email.service.ts`
**Issue:** Full email addresses were logged in plaintext (`Report email sent to user@example.com`), defeating the PII encryption-at-rest strategy.
**Fix:**
- Added `maskEmail()` method that masks addresses (e.g., `j***@example.com`)
- Log now uses masked email: `Report email sent to j***@example.com`

---

### 7. ValidationPipe Missing `forbidNonWhitelisted`

**Severity:** Low
**File:** `src/main.ts`
**Issue:** Unknown properties in request bodies were silently stripped instead of returning a 400 error, reducing API feedback.
**Fix:**
- Added `forbidNonWhitelisted: true` to the global `ValidationPipe` — unknown properties now return a clear validation error

---

### 8. Dev Dependency Vulnerabilities (npm audit)

**Severity:** High (dev-only, no production impact)
**Packages:** `ajv` (ReDoS), `minimatch` (ReDoS) — both via `@nestjs/cli`
**Issue:** 8 known vulnerabilities in dev dependencies used for code generation and building.
**Status:** Cannot be fixed without a breaking `@nestjs/cli` downgrade. These are **dev-only** dependencies and do not ship to production. Monitor for `@nestjs/cli` updates that resolve these transitively.

---

## Pre-existing Security Strengths

These were already in place before the audit and remain solid:

| Area | Implementation |
|------|---------------|
| **Input Validation** | Global `ValidationPipe` with `whitelist`, class-validator decorators on all DTOs |
| **Sanitization** | `SanitizeService` strips HTML tags from all user text inputs |
| **CORS** | Restricted to specific origins via `ALLOWED_ORIGINS` env var |
| **Rate Limiting** | Global 60 req/min + per-endpoint limits (3-10 req/min on sensitive routes) |
| **Encryption at Rest** | AES-256-GCM for PII fields (email, businessName, now also fullName, phone) |
| **Email Dedup** | SHA-256 hash for dedup lookups without exposing plaintext |
| **No Hardcoded Secrets** | All secrets loaded from environment via `ConfigService` |
| **No Raw Queries** | Mongoose ODM exclusively — no raw MongoDB/NoSQL injection vectors |
| **No File Uploads** | No upload endpoints exist — eliminates file-based attack surface |

---

## Files Modified

| File | Change |
|------|--------|
| `src/email/email.service.ts` | HTML escaping, subject sanitization, masked logging, `getOrThrow` |
| `src/report/report.controller.ts` | Token parameters on download/email endpoints |
| `src/report/report.service.ts` | Token generation on `generate`, `verifyAccess` guard on download/email |
| `src/common/encryption/encryption.service.ts` | Added `signToken()` and `verifyToken()` methods |
| `src/lead/lead.service.ts` | Encrypt `fullName` and `phone` fields |
| `src/lead/lead.schema.ts` | Updated comments to reflect encryption |
| `src/main.ts` | Added `helmet`, `forbidNonWhitelisted` |
| `package.json` | Added `helmet` dependency |

---

## Remaining Considerations

- **Database migration:** Existing records in MongoDB still have unencrypted `fullName` and `phone` values. A one-time migration script should be run to encrypt existing data.
- **DMARC policy:** Once Resend DKIM verification completes, consider adding a DMARC TXT record (`_dmarc.send.localmarketingaudit.com`) for full email authentication.
- **WordPress frontend:** The `wp-config.php` contains database credentials and secret keys — ensure it is never committed to version control (it is currently not tracked by the app's git repo).
