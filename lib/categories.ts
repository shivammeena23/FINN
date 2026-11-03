import type { Category } from "./types";

/**
 * Tier 0 of the model router: pure rules, zero tokens.
 *
 * NSE's `desc` field is a ~105-value taxonomy that maps mostly cleanly onto ENAM's 17
 * reference categories. Mapping it with rules means most filings never touch an LLM.
 * Where `desc` is genuinely ambiguous ("Outcome of Board Meeting" covers results,
 * dividends, M&A and resignations alike) we refine using the attachment text.
 */

/** Exact NSE desc -> category. Built from the live NSE taxonomy, not guessed. */
const DESC_MAP: Record<string, Category> = {
  // --- results -------------------------------------------------------------
  "Integrated Filing- Financial": "results",
  "Investor Presentation": "results",
  "Clarification - Financial Results": "results",
  "Reply to Clarification- Financial results": "results",
  "Reasons for Delayed/Non-submission of Financial Results": "results",

  // --- earnings call / investor meetings ------------------------------------
  "Analysts/Institutional Investor Meet/Con. Call Updates": "earnings_call",

  // --- management change ----------------------------------------------------
  Appointment: "management_change",
  "Change in Management": "management_change",
  "Resignation of Director/KMP/SMP": "management_change",
  Resignation: "management_change",
  "Change in Director(s)": "management_change",
  Cessation: "management_change",
  Retirement: "management_change",
  Demise: "management_change",
  "Change in Company Secretary/Compliance Officer": "management_change",
  "Change in Auditors": "management_change",
  "Resignation of Statutory Auditor": "management_change",

  // --- M&A ------------------------------------------------------------------
  Acquisition: "M&A",
  "Amalgamation/Merger": "M&A",
  "Scheme of Arrangement": "M&A",
  Demerger: "M&A",
  "Sale or disposal": "M&A",
  "Other Restructuring": "M&A",
  "Diversification/Disinvestment": "M&A",
  "Disclosure under SEBI Takeover Regulations": "M&A",
  "Arrangements for strategic, technical, manufacturing, or marketing tie up": "M&A",
  Agreements: "M&A",

  // --- fund raise -----------------------------------------------------------
  "Allotment of Securities": "fund_raise",
  "Issue of Securities": "fund_raise",
  "Options to purchase securities": "fund_raise",
  "Rights Issue": "fund_raise",
  "Preferential issue": "fund_raise",
  "Offer for sale": "fund_raise",
  Buyback: "fund_raise",
  "Public Announcement - Buyback of Shares": "fund_raise",
  "Post Buyback Public Announcement": "fund_raise",
  "Closure of Buy Back": "fund_raise",
  "Increase in Authorised Capital": "fund_raise",
  "Utilisation of Funds": "fund_raise",
  "Statement of deviation(s) or variation(s) under Reg. 32": "fund_raise",
  "Monitoring Agency Report": "fund_raise",

  // --- dividend / bonus -----------------------------------------------------
  Dividend: "dividend",
  Bonus: "bonus_split",
  "Stock split": "bonus_split",

  // --- credit rating --------------------------------------------------------
  "Credit Rating": "credit_rating",
  "Credit Rating- Revision": "credit_rating",
  "Credit Rating- New": "credit_rating",
  "Credit Rating- Others": "credit_rating",

  // --- litigation / distress ------------------------------------------------
  "Action(s) taken or orders passed": "litigation",
  "Action(s) initiated or orders passed": "litigation",
  "Pendency of Litigation(s)/dispute(s) or the outcome impacting the Company": "litigation",
  "Corporate Insolvency Resolution Process": "litigation",
  "Fraud/Default/Arrest": "litigation",
  "Defaults on Payment of Interest/Principal": "litigation",
  "Final  forensic  audit  report": "litigation",
  "Initiation of Forensic Audit": "litigation",
  "Delay/default in the payment of fines/penalties/dues etc. to authority": "litigation",
  "Granting/withdrawal/surrender/cancellation/suspension of key licenses/ regulatory approvals":
    "litigation",

  // --- meetings -------------------------------------------------------------
  "Shareholders meeting": "agm_egm",

  // --- capex ----------------------------------------------------------------
  "Capacity addition": "capex",
  "Commencement of commercial production/operations": "capex",
  "Postponement of commercial production/operations": "capex",
  "Closure of operations": "capex",

  // --- general news ---------------------------------------------------------
  "Press Release": "press_release",
  "Press Release (Revised)": "press_release",
  Updates: "press_release",
  "Monthly Business Updates": "press_release",
  "Product launch": "press_release",
  "News Verification": "press_release",
  "Rumour Verification - Regulation 30(11)": "press_release",
  "Disclosure of material issue": "press_release",
  "Bagging/Receiving of orders/contracts": "press_release",
  "Awarding of order(s)/contract(s)": "press_release",
  "Spurt in Volume": "press_release",
  "Price movement": "press_release",
  "Strikes/Lockouts/Disturbances": "press_release",
  "Disruption of Operations": "press_release",
  "Giving guarantees/indemnity/ becoming a surety for third party": "press_release",
  "Suspension of Trading": "press_release",
  "Effect(s) on listed entity due to changed regulatory  framework applicable": "press_release",

  // --- routine paperwork ----------------------------------------------------
  "Trading Window": "unclassified",
  "ESOP/ESOS/ESPS": "unclassified",
  "Structural Digital Database": "unclassified",
  "Certificate under SEBI (Depositories and Participants) Regulations, 2018": "unclassified",
  "Copy of Newspaper Publication": "unclassified",
  "Loss of Share Certificates": "unclassified",
  "Issue of Duplicate Share Certificate": "unclassified",
  "Address Change": "unclassified",
  "Name Change": "unclassified",
  "Name and Symbol Change": "unclassified",
  "Amendment to AOA/MOA": "unclassified",
  "Registrar & Share Transfer Agent Update": "unclassified",
  "Quarterly Compliance Report on Corporate governance - within 21 days from the end of the quarter":
    "unclassified",
  "Committee Meeting Updates": "unclassified",
  "Integrated Filing- Governance": "unclassified",
  "Related Party Transactions": "unclassified",
  "Extension  of Financial Year": "unclassified",
  Corrigendum: "unclassified",
  Addendum: "unclassified",
  "Amendment(s)": "unclassified",
  "Alteration/revision(s)": "unclassified",
  Others: "unclassified",
  "Record Date": "unclassified",
};

/** Ordered text rules applied when `desc` is ambiguous or unmapped. First match wins. */
const TEXT_RULES: Array<[RegExp, Category]> = [
  // Meetings first: "Results of Postal Ballot" is a vote outcome, not financial results,
  // and a loose /results/ rule swallows it.
  [/postal ballot/i, "postal_ballot"],
  [/(annual|extraordinary) general meeting|\bAGM\b|\bEGM\b/i, "agm_egm"],
  // Require financial context so only actual results filings land here.
  [
    /(financial|unaudited|audited|quarterly|half[- ]year(ly)?|annual) results?|results? for the (quarter|period|year|half)|financial statements?|standalone and consolidated results?/i,
    "results",
  ],
  [/transcript|audio recording|con(f(erence)?)?[ .]?call|earnings call/i, "earnings_call"],
  [/pledg/i, "pledging"],
  [/insider trading|\bSAST\b|PIT Regulations|Regulation 7\(2\)/i, "insider_trading"],
  [/dividend/i, "dividend"],
  [/bonus (issue|share)|stock split|sub-?division of (equity )?shares?/i, "bonus_split"],
  [/buy-?back|rights issue|\bQIP\b|qualified institution/i, "fund_raise"],
  [/commercial paper|non-?convertible debenture|\bNCDs?\b/i, "fund_raise"],
  [/acqui(re|sition)|merger|demerger|joint venture|divest/i, "M&A"],
  [/resign|appoint|cessation|stepping down|re-?designat/i, "management_change"],
  [/credit rating/i, "credit_rating"],
  [/capex|capacity expansion|new plant|greenfield|brownfield/i, "capex"],
  [/litigation|penalt|show cause|\bNCLT\b|tribunal|fine of/i, "litigation"],
];

/** Signals that a board-meeting outcome is really just routine paperwork. */
const ROUTINE =
  /trading window|closure of trading|\bESOP\b|allotment of [\d,]+ equity shares? under/i;

export interface Classified {
  category: Category;
  /** Human-readable explanation of why this category was chosen. */
  reason: string;
}

/**
 * Classify one announcement using rules alone.
 * `desc` is NSE's label; `text` is the attachment description.
 */
export function classify(desc: string, text: string): Classified {
  const d = (desc ?? "").trim();
  const t = text ?? "";
  const blob = `${d} ${t}`;

  // Ambiguous containers: NSE files a lot under these, so always refine on text.
  const ambiguous =
    d === "Outcome of Board Meeting" || d === "General Updates" || d === "Updates" || d === "";

  if (!ambiguous) {
    const mapped = DESC_MAP[d];
    if (mapped) {
      // "Analysts/... Con. Call Updates" covers both transcripts and 1:1 investor meets.
      if (
        mapped === "earnings_call" &&
        !/transcript|audio|con(f(erence)?)?[ .]?call|earnings call/i.test(blob)
      ) {
        return { category: "investor_meetings", reason: `NSE "${d}", no transcript or call reference` };
      }
      // "Record Date" is routine unless it attaches to a cash or share event.
      if (d === "Record Date") {
        if (/dividend/i.test(t)) return { category: "dividend", reason: "record date for a dividend" };
        if (/bonus|split/i.test(t)) return { category: "bonus_split", reason: "record date for a bonus or split" };
      }
      return { category: mapped, reason: `NSE category "${d}"` };
    }
  }

  if (ROUTINE.test(blob)) {
    return { category: "unclassified", reason: "routine compliance paperwork" };
  }

  for (const [re, category] of TEXT_RULES) {
    if (re.test(blob)) {
      return { category, reason: `"${d || "unlabelled"}" refined from filing text` };
    }
  }

  // Unmapped desc with no text signal: treat as general news rather than hiding it.
  return {
    category: d ? "press_release" : "unclassified",
    reason: d ? `unmapped NSE category "${d}"` : "no NSE category",
  };
}

export const CATEGORY_LABEL: Record<Category, string> = {
  results: "Results",
  "M&A": "M&A",
  fund_raise: "Fund raise",
  management_change: "Management",
  litigation: "Litigation",
  insider_trading: "Insider",
  earnings_call: "Earnings call",
  investor_meetings: "Investor meet",
  credit_rating: "Credit rating",
  dividend: "Dividend",
  bonus_split: "Bonus / split",
  capex: "Capex",
  press_release: "News",
  postal_ballot: "Postal ballot",
  agm_egm: "AGM / EGM",
  pledging: "Pledging",
  unclassified: "Routine",
};
