export type StoryPattern = "FLASH" | "DEVELOPING" | "LONG-STANDING" | "PEAK-FADE" | "STABLE";

export function classifyStoryShape(counts: number[]): StoryPattern {
  if (counts.length < 2) return "DEVELOPING";

  const total = counts.reduce((a, b) => a + b, 0);
  const days = counts.length;
  const peak = Math.max(...counts);
  const peakIdx = counts.indexOf(peak);
  const mean = total / days;
  const last3mean = counts.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, days);

  // FLASH: ≤3 days AND peak is clearly elevated (spike pattern)
  if (days <= 3 && peak >= mean * 1.5) return "FLASH";

  // LONG-STANDING: ≥21 days with no single day dominating
  if (days >= 21 && peak < mean * 3) return "LONG-STANDING";

  // PEAK-FADE: peak was early (first half) and recent volume is much lower
  if (peakIdx < days * 0.4 && last3mean < peak * 0.35 && days >= 5) return "PEAK-FADE";

  // STABLE: recent ~= average (no strong direction)
  if (Math.abs(last3mean - mean) < mean * 0.3) return "STABLE";

  return "DEVELOPING";
}

export const PATTERN_STYLE: Record<StoryPattern, { label: string; color: string }> = {
  FLASH: { label: "⚡ FLASH", color: "var(--status-fading)" },
  DEVELOPING: { label: "↗ DEVELOPING", color: "var(--status-active)" },
  "LONG-STANDING": { label: "◆ LONG-STANDING", color: "var(--ink-2)" },
  "PEAK-FADE": { label: "↘ PEAKED", color: "var(--status-fading)" },
  STABLE: { label: "— STABLE", color: "var(--ink-muted)" },
};
