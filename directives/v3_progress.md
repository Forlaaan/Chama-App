# Chama App — V3 Iteration Progress

> **Iteration Start**: 2026-07-04  
> **Goal**: Address supervisor feedback and elevate the app to a production-ready, real-world system.

---

## Supervisor Feedback Items

| # | Feedback Item | Status | Notes |
|---|--------------|--------|-------|
| F1 | Clearly show the new user onboarding process vs existing user | 🔴 Todo | Login screen conflates new & returning users |
| F2 | Better financial reports (not just old-school ledger) | 🔴 Todo | Visual charts, summaries, trends |
| F3 | CRUD: Request loan flow improvements | 🔴 Todo | Better UX, loan history, status tracking |
| F4 | Super User (manage all users & chamas in the system) | 🔴 Todo | New role: SUPERADMIN, new backend routes |
| F5 | Real-life integration (M-Pesa API) | 🔴 Todo | STK Push for contributions & disbursements |
| F6 | Method to record/make contributions (member-initiated) | 🔴 Todo | Members can initiate, treasurer confirms |
| F7 | Penalty logic (auto-apply after contribution deadline) | 🔴 Todo | Deadline-based auto-penalties with config |
| F8 | Easier to understand data | 🔴 Todo | Plain-language summaries, better data viz |
| F9 | Fix current bugs | 🔴 Todo | API call failures, reCAPTCHA after logout |

---

## Bug Tracker

| # | Bug | Root Cause (suspected) | Status |
|---|-----|------------------------|--------|
| B1 | reCAPTCHA fails after logout, blocks re-login | `window.recaptchaVerifier` not reset on logout | 🔴 Open |
| B2 | API calls failing | Stale token / network / IP config issues | 🔴 Open |
| B3 | Login screen asks for full name even for returning users | No differentiation between new vs existing user flow | 🔴 Open |

---

## V3 Feature Milestones

### Phase 1 — Bug Fixes & Auth UX (Priority: CRITICAL)
- [ ] Fix reCAPTCHA not resetting on logout (B1)
- [ ] Separate "new user" vs "returning user" login flow (F1, B3)
- [ ] Stabilize API calls / error handling (B2)

### Phase 2 — Super User / Platform Admin (Priority: HIGH)
- [ ] Add SUPERADMIN role to DB schema
- [ ] Create superadmin backend routes (`/api/admin/*`)
- [ ] Build super user dashboard (view all chamas, all members, all transactions)
- [ ] Super user can deactivate/manage any chama or member

### Phase 3 — Financial Reports (Priority: HIGH)
- [ ] Contribution trend charts (per member, per month)
- [ ] Group financial summary (total pool, total loans outstanding, total collected)
- [ ] Loan book summary (active, overdue, paid)
- [ ] Member financial health score
- [ ] Export-ready report view

### Phase 4 — Contribution Flow (Priority: HIGH)
- [ ] Member-initiated contribution request
- [ ] Treasurer confirmation/rejection workflow
- [ ] Contribution scheduling & reminders
- [ ] Contribution status tracking per member per cycle

### Phase 5 — Penalty Logic (Priority: MEDIUM)
- [ ] Group-level penalty configuration (amount, grace period days)
- [ ] Auto-penalty cron job (backend scheduled task)
- [ ] Manual penalty override by Treasurer
- [ ] Penalty notification via SMS
- [ ] Penalty visibility on member dashboard

### Phase 6 — M-Pesa Integration (Priority: MEDIUM)
- [ ] M-Pesa STK Push for contributions (member pays via phone)
- [ ] M-Pesa callback handler + webhook
- [ ] Transaction reconciliation (M-Pesa ref <-> ledger entry)
- [ ] M-Pesa disbursement for approved loans (B2B / bulk payment)
- [ ] Sandbox testing harness

### Phase 7 — UX Polish & Data Clarity (Priority: MEDIUM)
- [ ] Plain-language financial summaries
- [ ] Dashboard redesign with visual charts
- [ ] Better loan request UX (step-by-step form, eligibility check)
- [ ] Onboarding redesign (clear flow for new vs existing)

---

## Decisions & Notes

- **M-Pesa**: Will use Daraja API (Safaricom). Requires a paybill/till number. Sandbox first.
- **Penalty formula**: Configurable per group (fixed amount or % of contribution). Requires stakeholder sign-off.
- **SUPERADMIN**: Separate from chama-level ADMIN. Platform-wide, not group-scoped. Seeded via env var or init script.
- **reCAPTCHA fix**: Must clear `window.recaptchaVerifier` and call `.clear()` on logout before re-initializing.

---

## Progress Log

| Date | Done |
|------|------|
| 2026-07-04 | V3 plan created. Codebase audit completed. Implementation plan written. |
