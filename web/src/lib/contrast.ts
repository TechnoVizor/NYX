// WCAG 2.x contrast and sRGB mixing, shared by the theme derivation and its tests.

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map((c) => c / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `b` mixed into `a` by share `p` (0..1), per sRGB channel, like CSS `color-mix(in srgb, a, b p%)`. */
export function mix(a: string, b: string, p: number): string {
  const [x, y] = [channels(a), channels(b)];
  return "#" + x.map((c, i) => Math.round(c + (y[i] - c) * p).toString(16).padStart(2, "0")).join("");
}
