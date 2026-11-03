# The email

**To:** assessment@enam.com
**Subject:** ENAM - IIT screening - 2027
**Attach:** `docs/ai-build-history.txt`

The brief asks for a *short* writeup covering four things: what you built, key decisions and
trade-offs, what you left out, and where you'd take it next. This hits those four and stops.
The long-form version lives in the repo README, which is where a reader who wants depth will go.

---

Hi,

FINN — my submission for the AI Engineer Build Challenge.

**Prototype (mobile-first, open on a phone):** https://finn-dusky-zeta.vercel.app
**Repository:** https://github.com/shivammeena23/FINN
**AI build history:** attached, and in the repo at `docs/ai-build-history.txt`

### What I built

An investor's inbox should be a triage queue, not a feed. FINN takes that literally.

**Push — The Brief.** Every filing across an 18-stock NSE portfolio, over a window you pick, sorted
into **Act / Watch / Buried**. Routine paperwork collapses into one line telling you how much was
hidden; nothing is deleted, and tapping any score shows precisely which rules buried it. Results
filings render Revenue/EBITDA/PBT/PAT with QoQ and YoY pulled from the filing itself; management
changes render who is arriving and where from.

**Push — Signals.** Volume above *N×* its 20-day average, price beyond *±X%*, plus per-category
rules. You drag the sliders and the list recomputes live — you define "unusual", not me.

**Pull — Research.** Any NSE symbol, grounded only in annual reports and concall transcripts. The
centrepiece is a **Promised vs Delivered** ledger: every explicit commitment management made on
past earnings calls, adjudicated against the latest call and the company's own reported numbers.
Reliance comes out **6 kept / 6 missed** — the battery and solar timelines promised in Jan and Jul
2026 have all slipped to "late next year", in management's own quoted words.

### Key decisions and trade-offs

**Ingestion is decoupled from serving.** NSE and screener.in throttle datacenter IPs, so a demo
that scrapes on request is a demo that dies in the room. A worker runs locally and commits a 954KB
JSON corpus; the deployed app only reads it. A fresh clone runs with no API key and no network.

**Grounding is enforced, not requested.** `npm run audit` re-extracts every cited PDF and asserts
each quote appears in it — currently 143/143. The first run came back 143/148 and caught five
"evidence" quotes that were investor-deck phrasings the model had reshaped into quote form: right
numbers, invented quotation marks. Those are now dropped automatically. That failure mode is
invisible unless you test for it, which is why I did.

**Routing is measured, not asserted.** Rules handle 39% of filings at zero tokens; flash-lite does
bulk judgement and PDF extraction; only the adjudication pass gets a real thinking budget. The
whole corpus — 438 filings, 7 dossiers, 91 commitments — cost **57 calls, ~$0.09 notional, $0.00
actual** on the free tier. I *demoted* PDF extraction a tier on evidence: flash-lite returned
Reliance's PAT as ₹29,550cr, matching the company's own press release, where flash said ₹29,250cr.
Cheaper and more accurate, so it won.

**No Python.** Every source is plain HTTP and Gemini reads PDFs natively, which deleted the whole
OCR layer. One toolchain, one `npm install`.

### What I deliberately left out

Six of the eight pull views — balance sheet, cash quality, trajectory, guidance. Thin-but-working
beats broad-but-broken, so Promised-vs-Delivered got the time instead. Also: Postgres (committed
JSON instead, so the deploy can't fail because a scrape did), live scraping from the deployed app
(unknown tickers degrade honestly rather than fetching and losing), and annual reports as model
input (10–30MB, and the guidance is in the transcripts anyway — they're linked, not parsed).
Dossiers are pre-built for 7 of 23 companies; free-tier quota throttled the rest, and the index
marks which are ready rather than pretending.

### Where I'd take it next

Compound the ledger across every call rather than just the latest — whether a management team
*systematically* slips timelines is a far stronger signal than any single miss, and it isn't
available from a broker note. Then let the investor argue with the triage weights: the scoring
table is my opinion, and it should become theirs.

One thing worth flagging regardless: ticker drift is silent and dangerous. Validating symbols
against both NSE and Yahoo before fixing the portfolio caught that ZOMATO is now ETERNAL and that
TATAMOTORS has split into TMCV and TMPV. Either would have produced a confidently empty dashboard.

Happy to walk through any of it.

Best,
Shivam Meena
230969
