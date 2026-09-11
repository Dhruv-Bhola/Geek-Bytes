# Secure DMS — Frontend

Frontend for the Secure Digital Document Management System (SIH PS 26190), built with
Next.js + React + TypeScript + Tailwind CSS, matching `Secure_DMS_Frontend_Complete_Specification.docx`.

"ICJS connects the justice ecosystem; Secure DMS secures the documents flowing through it."

## Running it locally

Two new packages were added for the animated UI (Framer Motion for motion, Recharts for
the dashboard chart) — run `npm install` again even if you already ran it before, to pull
those in.

```bash
npm install
npm run dev
```

## What's new in the polished pass

- `/` is now a real pitch/landing page (hero, USP, differentiators) instead of an instant
  redirect — this is what a panelist sees first.
- Page transitions on every dashboard route (fade + slide), driven from `app/dashboard/layout.tsx`.
- Animated, count-up dashboard stats and a weekly activity trend chart.
- A spring-animated "active" pill in the sidebar.
- Chain of Custody is now shown as a connected visual chain (`components/CustodyChain.tsx`),
  used on both the Chain of Custody page and inside the document viewer.
- Audit Ledger has a blockchain-style visual strip (`components/AuditChainStrip.tsx`) above
  the searchable table — visual flourish on top, real functional table underneath.

Open http://localhost:3000 — it redirects to `/login`. Any User ID + password logs you in
(mock auth), then any 6 digits complete MFA (mock), landing you on `/dashboard`.

## Project structure

```
app/                    Next.js App Router pages (one folder = one route)
components/             Reusable UI pieces (tables, cards, badges, timelines...)
lib/types.ts            The API contract — shapes every backend response must match
lib/api.ts              Every backend call goes through here (currently mocked)
lib/mockData.ts         Fake data used until the real backend exists
lib/auth.tsx            Mock session (who's logged in)
lib/permissions.ts      Role → nav item visibility (UI convenience only)
```

## Handing this off to the backend team

1. Backend implements the REST API. Response shapes should match `lib/types.ts`.
2. In `lib/api.ts`, each function has a `USE_MOCK_DATA` branch and a real
   `apiFetch(...)` branch already written. Backend teammate flips
   `USE_MOCK_DATA` to `false` once endpoints exist, and fixes up any field
   name mismatches — that's the only file that should need backend-driven changes.
3. Copy `.env.local.example` to `.env.local` and set `NEXT_PUBLIC_API_BASE_URL`
   to wherever the backend runs.
4. No other file in `app/` or `components/` should need to change for a normal
   backend integration — they all read data through `lib/api.ts`.

## Security notes carried over from the spec

- This frontend never talks to PostgreSQL, object storage, TEE or the blockchain
  directly — only to the backend's REST API.
- Role-based navigation (`lib/permissions.ts`) hides/disables things in the UI,
  but it is **not** the real authorization boundary — the backend must check
  permissions on every request regardless of what the UI allowed the user to click.
- No secrets, API keys, or credentials belong in this codebase.
