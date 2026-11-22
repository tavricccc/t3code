import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import { useGT, useLocale, useMessages } from "gt-react";
import { memo } from "react";

import { formatContextWindowTokens } from "~/lib/contextWindow";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { formatContextWindowCompactionMessage } from "./compaction.logic";
import { deriveContextWindowRingState } from "./ComposerContextWindowRing.logic";

const RING_RADIUS = 5.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export const ComposerContextWindowRing = memo(function ComposerContextWindowRing({
  usage,
  size = "sm",
}: {
  readonly usage: ContextWindowSnapshot | null;
  readonly size?: "sm" | "xs";
}) {
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const state = deriveContextWindowRingState(usage);
  if (!state) return null;

  const usedTokensShort = formatContextWindowTokens(state.usedTokens);
  const ariaLabel =
    state.usedPercentage !== null
      ? gt("Context: {used}% used", { used: state.usedPercentage })
      : gt("Context: {usedTokens} tokens used", { usedTokens: usedTokensShort });

  const strokeClassName =
    state.tone === "error"
      ? "text-error"
      : state.tone === "warning"
        ? "text-warning"
        : "text-muted-foreground/85 group-hover/context-ring:text-foreground";

  const dashOffset =
    state.visualFillRatio !== null ? RING_CIRCUMFERENCE * (1 - state.visualFillRatio) : 0;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="img"
            tabIndex={0}
            aria-label={ariaLabel}
            data-chat-context-window-ring="true"
            className={cn(
              "group/context-ring inline-flex shrink-0 cursor-default items-center justify-center rounded-full outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              size === "xs" ? "size-5.5" : "size-6",
            )}
          />
        }
      >
        <svg
          width={size === "xs" ? 13 : 14}
          height={size === "xs" ? 13 : 14}
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={cn("shrink-0 transition-colors", strokeClassName)}
        >
          <circle
            cx="8"
            cy="8"
            r={RING_RADIUS}
            stroke="currentColor"
            strokeWidth="1.75"
            className="opacity-22"
          />
          {state.visualFillRatio !== null ? (
            <circle
              cx="8"
              cy="8"
              r={RING_RADIUS}
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 8 8)"
            />
          ) : (
            <circle
              cx="8"
              cy="8"
              r={RING_RADIUS}
              stroke="currentColor"
              strokeWidth="1.75"
              strokeDasharray="2.5 2.5"
              transform="rotate(-90 8 8)"
              className="opacity-70"
            />
          )}
        </svg>
      </TooltipTrigger>
      <TooltipPopup side="top">
        <div className="flex flex-col gap-0.5 tabular-nums">
          <span className="text-foreground">{ariaLabel}</span>
          {state.maxTokens !== null ? (
            <span className="text-muted-foreground">
              {gt("{used} of {max} tokens", {
                used: state.usedTokens.toLocaleString(locale),
                max: state.maxTokens.toLocaleString(locale),
              })}
            </span>
          ) : null}
          {state.autoCompactThreshold !== null ? (
            <span className="text-muted-foreground">
              {formatContextWindowCompactionMessage(state.autoCompactThreshold, m)}
            </span>
          ) : null}
        </div>
      </TooltipPopup>
    </Tooltip>
  );
});
