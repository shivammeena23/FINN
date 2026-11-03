# Submission

**To:** assessment@enam.com
**Subject:** `ENAM - IIT screening - 2027`

Fill the three bracketed links before sending.

---

## Covering note (paste into the email body)

Hi,

Thanks for the brief — here's FINN.

**Live (mobile-first):** [VERCEL URL]
**Repo:** [GITHUB URL]
**AI build history:** [CLAUDE CODE SHARE LINK / EXPORT]

Submitting after the Nov 1 deadline — apologies for that, and thank you for still looking.

### What I built

The brief's hard problem isn't aggregation, it's filtering. So FINN is built around a claim most
dashboards avoid making: **most filings don't matter, and the app should say so out loud.**

Three surfaces, all mobile-first:

- **The Brief** (push digest) — every filing across an 18-stock portfolio in a window you choose,
  triaged into **Act / Watch / Buried**. 39% of the corpus gets buried, collapsed to a single line
  that tells you how much was hidden. Nothing is deleted, and tapping any score shows exactly which
  rules fired — triage is auditable, not a black box. Results filings render Revenue/EBITDA/PBT/PAT
  with QoQ and YoY; management changes render who's arriving and where from.
- **Signals** (triggered alerts) — volume above *N×* its 20-day average, price beyond *±X%*, plus
  per-category rules. You move the sliders and the list recomputes as you drag; the point is that
  you define "unusual", not me.
- **Research** (pull) — any NSE symbol, grounded strictly in annual reports and concall transcripts.

### The bit I'd point you at

**Promised vs Delivered.** FINN extracts every explicit forward-looking commitment from
management's past earnings calls, then adjudicates each against the most recent call and the
company's own reported figures. For Reliance it found 6 kept and 6 missed across three quarters —
the battery and solar capacity timelines it committed to in Jan and Jul 2026 have all slipped to
"late next year", in management's own words. Deepak Nitrite comes out 3 kept / 7 missed.

Every row expands to **two verbatim quotes** — the promise and the evidence — each linking to the
source PDF. Where the documents don't actually settle a question, the verdict is `OPEN`; the prompt
is explicit that abstaining beats guessing. KPIT's entire ledger is `OPEN`, correctly, because its
guidance is FY27/FY29 targets that haven't matured.

**And the quotes are checked, not trusted.** `npm run audit` re-extracts every cited PDF and asserts
each quote appears in it — currently 143/143. That check earned its keep immediately: the first run
came back 143/148, having caught five Asian Paints "evidence" quotes that were investor-deck
phrasings the model had paraphrased into quote form. Right numbers, invented quotation marks. They
are now dropped automatically at build time, and a verdict that loses its quote says so in the UI.
That failure mode is exactly the slop you warned about, and it is invisible unless you test for it.

### Key decisions and trade-offs

**Ingestion is decoupled from serving.** NSE and screener.in throttle datacenter IPs, so an app
that scrapes on request is a demo that dies in the room. A worker runs on a residential IP and
writes a committed 954KB JSON corpus; the deployed app only reads it. A fresh clone runs with no
API key and no network.

**No Python.** Every source turned out to be plain HTTP (Yahoo's chart endpoint is open JSON — no
`yfinance` needed), and Gemini reads PDFs natively, which deleted the whole `pdfplumber`/OCR layer.
One TypeScript toolchain, one `npm install`.

**NSE's own taxonomy does most of the classification for free.** Its `desc` field is a ~105-value
vocabulary that maps mostly cleanly onto your reference categories, so rules handle it at zero
tokens and the LLM only sees what survives triage.

**Model routing, measured not asserted.** Rules → `flash-lite` (bulk, batched 25/call) →
`flash-lite` (PDF→numbers) → `flash` + 8k thinking (adjudication only). Building the entire
corpus — 438 filings enriched, 7 dossiers, 91 commitments adjudicated — took **57 live calls and
~$0.09 notional**, and **$0.00 actual** on the free tier. A content-hash cache makes re-runs free.
`data/cost-report.json` has the numbers.

Two routing decisions worth flagging: Tier 3 was meant to be Pro, but every Pro model 429s on the
free tier, so it's Flash with a raised thinking budget instead. And I **demoted** PDF extraction
from `flash` to `flash-lite` on evidence — on a benchmark filing flash-lite returned Reliance's PAT
as ₹29,550cr, matching the company's own press release, where flash returned ₹29,250cr and left
the QoQ/YoY columns empty. Cheaper and better, so it won.

### What I deliberately left out

- **Six of the eight pull views.** Balance sheet, cash quality, trajectory, guidance aren't built.
  Thin-but-working beats broad-but-broken, and Promised-vs-Delivered is the one you said you value
  most, so it got the time.
- **Postgres.** The corpus is committed JSON. 954KB, zero provisioning, and the deploy can't fail
  because a scrape failed. `lib/store.ts` is the single swap point when it needs to be real.
- **Live scraping from the deployed app.** An unknown ticker degrades with an honest message rather
  than attempting a fetch that datacenter IPs usually lose.
- **Annual reports as model input.** Transcripts are ~500KB and carry the guidance; annual reports
  are 10–30MB and wouldn't change a verdict. They're linked, not parsed.
- **Dossiers for all 23 companies.** Seven are pre-built; free-tier quota throttled the rest. The
  index marks which are ready instead of pretending.

### Where I'd take it next

1. **Compound the ledger across every call, not just the latest.** Whether a management team
   *systematically* slips timelines is a far stronger signal than any single miss — and it's the
   thing you can't get from a broker note.
2. **Let the investor argue with the triage weights.** The scoring table is my opinion; it should
   be theirs, and the app should learn from what they actually open.
3. Nightly GitHub Action for ingestion, so the corpus refreshes without anyone's laptop.

One thing the build surfaced that I'd flag regardless: ticker drift is real and silent. Validating
symbols against both NSE and Yahoo before committing the portfolio caught that ZOMATO is now
ETERNAL and that TATAMOTORS has split into TMCV and TMPV — either would have produced a
confidently empty dashboard.

Happy to walk through any of it.

Best,
[YOUR NAME]

---

## Deploy checklist

```bash
cd FINN

# 1. GitHub — create an empty repo named `finn` at https://github.com/new (no README)
git remote add origin https://github.com/<YOUR-USERNAME>/finn.git
git branch -M main
git push -u origin main

# 2. Vercel — opens a browser once to log in, then deploys
npx -y vercel@latest --prod
#    Framework: Next.js (auto-detected). No env vars needed — the corpus is committed.
```

Then open the Vercel URL **on an actual phone** and check: the Brief's window pills, the Signals
sliders, and one dossier (`/research/RELIANCE`) expanded to its quotes.

## Export the AI build history

In this Claude Code session, `/export` writes the full transcript to a file you can attach, or use
the share link if you prefer a URL.
