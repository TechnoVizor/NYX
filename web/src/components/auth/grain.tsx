const NOISE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;

export function Grain() {
  return <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: NOISE }} />;
}
