export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function pad(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s.padEnd(w);
}
