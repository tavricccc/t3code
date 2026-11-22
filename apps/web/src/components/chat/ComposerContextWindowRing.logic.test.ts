import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import { describe, expect, it } from "vite-plus/test";

import { deriveContextWindowRingState } from "./ComposerContextWindowRing.logic";

function makeSnapshot(overrides: Partial<ContextWindowSnapshot>): ContextWindowSnapshot {
  return {
    usedTokens: 0,
    totalProcessedTokens: null,
    maxTokens: 200_000,
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    reasoningOutputTokens: null,
    lastUsedTokens: null,
    lastInputTokens: null,
    lastCachedInputTokens: null,
    lastOutputTokens: null,
    lastReasoningOutputTokens: null,
    compactsAutomatically: null,
    autoCompactThreshold: null,
    remainingTokens: null,
    usedPercentage: null,
    remainingPercentage: null,
    updatedAt: "2026-11-22T00:00:00.000Z",
    ...overrides,
  };
}

describe("deriveContextWindowRingState", () => {
  it("hides the ring when usage is missing or zero", () => {
    expect(deriveContextWindowRingState(null)).toBeNull();
    expect(deriveContextWindowRingState(makeSnapshot({ usedTokens: 0 }))).toBeNull();
  });

  it("derives normal, warning, and error states with clamped fill ratios", () => {
    const low = deriveContextWindowRingState(
      makeSnapshot({ usedTokens: 1_000, usedPercentage: 0.5, autoCompactThreshold: 160_000 }),
    );
    expect(low).toEqual({
      usedTokens: 1_000,
      maxTokens: 200_000,
      usedPercentage: 1,
      visualFillRatio: 0.04,
      tone: "default",
      autoCompactThreshold: 160_000,
    });

    const warning = deriveContextWindowRingState(
      makeSnapshot({ usedTokens: 164_000, usedPercentage: 82 }),
    );
    expect(warning?.tone).toBe("warning");
    expect(warning?.usedPercentage).toBe(82);
    expect(warning?.visualFillRatio).toBeCloseTo(0.82);

    const error = deriveContextWindowRingState(
      makeSnapshot({ usedTokens: 210_000, usedPercentage: 105 }),
    );
    expect(error?.tone).toBe("error");
    expect(error?.usedPercentage).toBe(100);
    expect(error?.visualFillRatio).toBe(1);
  });

  it("handles snapshots without a known maxTokens limit", () => {
    const state = deriveContextWindowRingState(
      makeSnapshot({ usedTokens: 42_000, maxTokens: null, usedPercentage: null }),
    );
    expect(state).toEqual({
      usedTokens: 42_000,
      maxTokens: null,
      usedPercentage: null,
      visualFillRatio: null,
      tone: "default",
      autoCompactThreshold: null,
    });
  });
});
