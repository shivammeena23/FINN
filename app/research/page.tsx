import { ResearchIndex } from "@/components/ResearchIndex";
import { PORTFOLIO, ADHOC } from "@/lib/portfolio";
import { dossierSymbols } from "@/lib/store";

export default function Page() {
  return <ResearchIndex portfolio={PORTFOLIO} adhoc={ADHOC} ready={dossierSymbols()} />;
}
