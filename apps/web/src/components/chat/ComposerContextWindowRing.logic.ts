import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";

export type ContextWindowRingTone = "default" | "warning" | "error";

export interface ContextWindowRingState {
  readonly usedTokens: number;
  readonly maxTokens: number | null;
  readonly usedPercentage: number | null;
  readonly visualFillRatio: number | null;
  readonly tone: ContextWindowRingTone;
  readonly autoCompactThreshold: number | null;
}

const MIN_VISIBLE_ARC_RATIO = 0.04;

export function deriveContextWindowRingState(
  usage: ContextWindowSnapshot | null,
): ContextWindowRingState | null {
  if (usage === null || !Number.isFinite(usage.usedTokens) || usage.usedTokens <= 0) {
    return null;
  }

  const maxTokens =
    usage.maxTokens != null && Number.isFinite(usage.maxTokens) && usage.maxTokens > 0
      ? usage.maxTokens
      : null;

  const rawPercentage =
    maxTokens !== null && usage.usedPercentage !== null && Number.isFinite(usage.usedPercentage)
      ? Math.max(0, Math.min(100, usage.usedPercentage))
      : null;

  const usedPercentage = rawPercentage !== null ? Math.round(rawPercentage) : null;
  const visualFillRatio =
    rawPercentage !== null ? Math.max(MIN_VISIBLE_ARC_RATIO, rawPercentage / 100) : null;

  const tone: ContextWindowRingTone =
    usedPercentage === null
      ? "default"
      : usedPercentage >= 90
        ? "error"
        : usedPercentage >= 80
          ? "warning"
          : "default";

  const autoCompactThreshold =
    usage.autoCompactThreshold != null &&
    Number.isFinite(usage.autoCompactThreshold) &&
    usage.autoCompactThreshold > 0
      ? usage.autoCompactThreshold
      : null;

  return {
    usedTokens: usage.usedTokens,
    maxTokens,
    usedPercentage,
    visualFillRatio,
    tone,
    autoCompactThreshold,
  };
}
