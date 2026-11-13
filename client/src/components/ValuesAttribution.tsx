import { fantasyCalcEnabled } from "../config";

export function ValuesAttribution({
  source,
  className = "",
}: {
  source: { name: string; url: string };
  className?: string;
}) {
  if (!fantasyCalcEnabled && source.url.includes("fantasycalc.com")) return null;
  const label = source.url.includes("fantasycalc.com") ? "Values from FantasyCalc.com" : `Values from ${source.name}`;
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener"
      className={`inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-sky-300 ring-1 ring-slate-700 hover:text-sky-200 ${className}`}
    >
      {label}
    </a>
  );
}
