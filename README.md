# FINN

**A filtered view of your portfolio.** Push tells you what changed and why you should care.
Pull audits management against their own words.

Built for the ENAM Holdings AI Engineer Build Challenge.

---

## The opinion

> An investor's inbox should be a **triage queue**, not a feed.

The brief says the scarce skill is not aggregating information, it's filtering it. So the
product is built around a claim most dashboards refuse to make: **most filings do not matter,
and the app should say so out loud.**

Every announcement is scored and sorted into one of three buckets:

| | |
|---|---|
| **Act** | Needs a decision today |
| **Watch** | Relevant, read when you can |
| **Buried** | Collapsed to one line: *"41 routine filings buried"* |

Nothing is deleted. Tap any score and you see exactly which rules fired and why — triage is a
claim the investor can audit, never a black box.

## Three surfaces

**The Brief** (push, windowed digest) — every portfolio filing in a window you pick (24h → 30d),
triaged. Results filings render Revenue / EBITDA / PBT / PAT with QoQ and YoY. Management changes
render who is arriving and where from.

**Signals** (push, triggered alerts) — volume above *N×* its 20-day average, price moves beyond
*±X%*, and "always alert me on these categories". You move the sliders; the list recomputes as you
drag. The point is that *you* define unusual.

**Research** (pull) — enter any NSE symbol. Grounded in annual reports and concall transcripts only.
The centrepiece is the **Promised vs Delivered** ledger. Seven companies ship with a pre-built
dossier (91 adjudicated commitments); the index marks which, and any other symbol degrades
honestly rather than inventing one.

### Promised vs Delivered

The brief calls this "the difference between summarising management and analysing them". FINN
extracts every explicit forward-looking commitment from management's past earnings calls, then
checks each against the most recent call and the company's own reported figures.

Real output for RELIANCE:

```
✕ MISSED   Achieve 40-GWh battery manufacturing capacity this year     said Jul 2026
           → "cell will come sometime late next year"
✕ MISSED   Start supplying power from Kutch this year                  said Jul 2026
           → connectivity now guided to Q1 of next year
✓ KEPT     Enter Australia and African markets next quarter            said Jul 2026
           → now in Coles and Woolworths
· OPEN     Double beverage capacity during the year                    said Jan 2026
           → not addressed in the latest call
```

Each row expands to **two verbatim quotes** — the promise, and the evidence — each linking to the
source PDF. `OPEN` is returned whenever the documents do not actually settle the question; the
prompt is explicit that guessing is worse than abstaining.

---

## Architecture

```
worker/   (runs on a residential IP or GitHub Actions — never on Vercel)
  sources.ts   NSE announcements · Yahoo EOD · screener.in docs
  run.ts       ingest → data/corpus/*.json        (Tier 0: rules only, zero tokens)
  rescore.ts   re-triage offline without refetching 23MB
  enrich.ts    Tier 1 + Tier 2 LLM passes
  dossier.ts   Tier 2 + Tier 3, the promised-vs-delivered ledger
                              │
                     data/corpus/*.json  ──▶  Next.js on Vercel
                       (committed, 954KB)       (reads the corpus; never scrapes)
```

**Ingestion and serving are decoupled on purpose.** NSE and screener.in throttle datacenter
traffic, so a deployed app that scrapes on request is a demo that dies in the room. The corpus is
committed, so a fresh clone runs with no API key and no network.

### Data sources

| Source | What | Note |
|---|---|---|
| `nseindia.com/api/corporate-announcements` | filings | Date-ranged, all equities in **one call** — 7,500 filings across 1,780 symbols. Adding a holding costs zero extra requests. |
| `query1.finance.yahoo.com/v8/finance/chart` | EOD price + volume | Plain JSON, no key, no `yfinance` |
| `screener.in/company/{SYM}` | annual reports, concall transcripts | We follow its links to the issuer's own PDFs, never its commentary |

Gemini reads PDFs natively, which deleted the entire `pdfplumber`/OCR layer. Combined with every
source being plain HTTP, there was no reason to run Python — the whole repo is one TypeScript
toolchain and one `npm install`.

### Model routing

The brief rewards spending less for the same result, so routing is explicit and measured:

| Tier | Model | Job | Volume |
|---|---|---|---|
| **0** | *none — rules* | NSE's 105-value taxonomy → the 17 reference categories, + triage scoring | **170 of 438 filings never reach a model** |
| **1** | `flash-lite` | One-line "why it matters", batched 25/call | 268 filings in **11 calls** |
| **2** | `flash-lite` | Results PDF → Revenue/EBITDA/PBT/PAT; executive backgrounds | 13 results filings, 5 bios |
| **3** | `flash` + 8k thinking | Promised-vs-delivered adjudication, once per company | 7 companies, 91 commitments |

Plus a **content-hash cache** (`sha256` of model + prompt + input bytes) so re-runs cost nothing —
re-running `enrich` after a prompt-unchanged edit is **$0.00**.

Measured on the runs that built the committed corpus:

| Pass | Live calls | Tokens in | Tokens out + thinking | Notional |
|---|---|---|---|---|
| Enrich (Tiers 1–2, 438 filings) | 27 | 198,466 | 33,090 | ~$0.033 |
| Dossiers (Tier 3, 7 companies) | 30 | 388,640 | 51,884 | ~$0.060 |
| **Total to build everything** | **57** | **587k** | **85k** | **~$0.09** |

Actual spend: **$0.00** — it fits inside the free tier. Re-running after a prompt-unchanged edit
is **$0.00 notional too**, because every call is a cache hit. Each run rewrites
[`data/cost-report.json`](data/cost-report.json).

**Three routing decisions worth naming:**

1. **Tier 3 was meant to be Pro.** Every Pro model returns 429 on the free tier, so Tier 3 is Flash
   with a raised thinking budget. That is the honest version of "pick the right tool" when the best
   tool isn't on the menu.
2. **PDF extraction was demoted from `flash` to `flash-lite` on evidence, not vibes.** On a
   benchmark filing, flash-lite returned Reliance's PAT as ₹29,550cr — matching the company's own
   press release — where flash returned ₹29,250cr, and flash-lite also filled the QoQ and YoY
   columns flash left empty. Cheaper *and* better, so it won.
3. **Quota exhaustion falls back a tier** rather than failing. A degraded answer beats an empty card.

### Grounding discipline — enforced, not requested

The pull side touches primary sources only — the company's own transcripts and its own reported
figures. No news, no broker notes, and the prompts forbid the model from drawing on what it knows
about the company from elsewhere. Where a dossier cannot be grounded, the app says so instead of
inventing one.

But asking a model not to fabricate quotes is a request, so FINN checks instead:

```
$ npm run audit
[audit] 143/143 quotes verified verbatim in their cited PDF
```

Every quote is re-extracted from the PDF it cites and matched against it — at build time in
`worker/dossier.ts`, and as a regression test in `worker/audit.ts` that exits non-zero on failure.

**This caught a real failure.** The first audit run came back 143/148: five Asian Paints "evidence"
quotes — *"PBDIT margin at 20.6%; higher by 240 bps yoy"* and similar — were investor-deck
phrasings the model had paraphrased into quote form. The underlying figures were right; the
quotation marks were not. They are now discarded automatically, and any verdict that loses its
quote is labelled as such in the UI rather than shown with an invented one.

That failure mode — facts reshaped into sentences nobody said — is precisely the "AI slop" the
brief warns about, and it is invisible unless you check.

(Push-side enrichment — an incoming executive's professional background — uses outside knowledge,
which the brief explicitly permits.)

---

## How this was built

The complete Claude Code session that produced this repo is committed at
[`docs/ai-build-history.txt`](docs/ai-build-history.txt) — including the live source probing, the
classifier bugs found and fixed (postal-ballot *results* mis-tagged as financial results; a
post-demerger stub rendering a true-but-useless `+44,120%` YoY), the benchmark that demoted PDF
extraction a model tier, and the audit run that caught five fabricated quotes.

## Running it

```bash
npm install
npm run dev              # works immediately — corpus is committed, no key needed
```

To rebuild the data (needs a residential IP for NSE/screener):

```bash
npm run ingest                      # Tier 0 — rules only, no API key, no cost
npm run rescore                     # re-triage offline after tuning rules
cp .env.example .env.local          # add a free key: aistudio.google.com/apikey
npm run enrich                      # Tiers 1–2
npm run dossier -- RELIANCE DIXON   # Tier 3
npm run audit                       # verify every quote resolves to its source
```

---

## What I deliberately left out

- **Supabase.** The plan called for Postgres; stage 0 writes a committed JSON corpus instead.
  824KB, zero provisioning, and the deploy cannot fail because a scrape failed. `lib/store.ts` is
  the single swap point.
- **Six of the eight pull views.** Balance sheet, cash quality, trajectory and guidance are not
  built. Thin-but-working beats broad-but-broken, and Promised-vs-Delivered is the one the brief
  says it values most.
- **Live scraping from the deployed app.** `/research/<unknown>` degrades honestly rather than
  attempting a fetch that datacenter IPs usually lose.
- **Annual reports as model input.** Transcripts are ~500KB and carry the guidance; annual reports
  are 10–30MB and mostly wouldn't change a verdict. They're linked, not parsed.
- **Push notifications.** "Push" here means the app surfaces things unasked, not OS notifications.

## Where I'd take it next

1. **Per-company guidance tracking over time** — the ledger currently compares against the latest
   call. Compounding it across every call would show whether a management team *systematically*
   slips timelines, which is a far stronger signal than any single miss.
2. **Move triage weights into the UI.** The scoring table is the product's opinion; an investor
   should be able to disagree with it and have the app learn from what they actually open.
3. **Postgres + a nightly GitHub Action**, so the corpus refreshes without anyone's laptop.
