/**
 * The brand mark: a C for Career, and in its opening a dot — the buddy who
 * fills the gap. Mint and cream are the two colours of the mark it replaced.
 *
 * The colours are literal, like the plate `.logo-mark` paints behind them: a
 * logo that re-grades itself with the theme is two logos. The same geometry
 * is in `src/app/icon.svg`, which the browser tab and the home-screen icon are
 * generated from; change both together.
 */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      className={`logo-mark ${className}`}
    >
      <path
        d="M43.61 22.15A16 16 0 1 0 43.61 41.85"
        fill="none"
        stroke="#bdebd7"
        strokeWidth={8}
        strokeLinecap="round"
      />
      <circle cx={47} cy={32} r={4.6} fill="#fff2a8" />
    </svg>
  );
}
