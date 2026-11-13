export function FantasyCalcAttribution({ className = "" }: { className?: string }) {
  return (
    <a
      href="https://fantasycalc.com"
      target="_blank"
      rel="noopener"
      className={`inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-sky-300 ring-1 ring-slate-700 hover:text-sky-200 ${className}`}
    >
      Values from FantasyCalc.com
    </a>
  );
}
