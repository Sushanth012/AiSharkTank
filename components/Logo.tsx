import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="logo" href="/" aria-label="PitchTank home">
      <svg className="logo-mark" viewBox="0 0 44 44" aria-hidden="true">
        <path className="logo-frame" d="M4 4h23c8.2 0 13 4.8 13 12s-4.8 12-13 12H15v12H4V4Z" />
        <path className="logo-cut" d="M15 13h12.2c2.2 0 3.8 1.3 3.8 3.4s-1.6 3.6-3.8 3.6H15v-7Z" />
        <path className="logo-play" d="m19 14 7 2.8-7 2.8V14Z" />
        <path className="logo-verdict" d="M29 31h11v9H29z" />
      </svg>
      {compact ? null : <span className="logo-word">PITCHTANK</span>}
    </Link>
  );
}
