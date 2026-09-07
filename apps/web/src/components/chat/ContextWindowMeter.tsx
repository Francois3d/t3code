import { Button } from "../ui/button";
import { type ContextWindowSnapshot, formatContextWindowTokens } from "~/lib/contextWindow";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { cn } from "~/lib/utils";
import {
  formatContextWindowCompactionMessage,
  formatContextWindowMeterLabel,
  formatContextWindowPercentage,
  resolveContextWindowUsageLevel,
} from "./ContextWindowMeter.logic";
import { Minimize2Icon } from "lucide-react";
import { composerFloatingLayerProps } from "./composerEventScope";

const USAGE_LEVEL_COLORS = {
  normal: "color-mix(in oklab, var(--color-muted-foreground) 72%, transparent)",
  elevated: "var(--color-warning)",
  high: "var(--color-error)",
} as const;

const USAGE_LEVEL_TEXT_CLASSES = {
  normal: null,
  elevated: "text-warning hover:text-warning data-pressed:text-warning",
  high: "text-error hover:text-error data-pressed:text-error",
} as const;

/**
 * Context usage as a number rather than a ring: `14k/258k` where the composer
 * has room, the percentage alone once the footer goes compact. `compact` comes
 * from the composer's footer breakpoint, because the right action group is
 * `flex-nowrap shrink-0` and any width this takes comes out of the model picker.
 */
export function ContextWindowMeter(props: {
  usage: ContextWindowSnapshot;
  modelDisplayName?: string | null;
  compact?: boolean;
  onCompact?: (() => void) | undefined;
  compactDisabled?: boolean | undefined;
  compactDisabledReason?: string | null | undefined;
}) {
  const { usage, modelDisplayName, onCompact, compactDisabled, compactDisabledReason } = props;
  const usedPercentage = formatContextWindowPercentage(usage.usedPercentage);
  const normalizedPercentage = Math.max(0, Math.min(100, usage.usedPercentage ?? 0));
  const totalProcessedTokens = usage.totalProcessedTokens ?? null;
  const showTotalProcessed = totalProcessedTokens !== null && totalProcessedTokens > 0;
  const usageLevel = resolveContextWindowUsageLevel(usage.usedTokens);
  const usageColor = USAGE_LEVEL_COLORS[usageLevel];
  const meterLabel = formatContextWindowMeterLabel(usage, {
    compact: props.compact ?? false,
    formatTokens: formatContextWindowTokens,
  });

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={onCompact ? 150 : 0}
        render={
          <Button
            size="micro"
            variant="ghost-muted"
            className={cn(
              "shrink-0 rounded-full px-1.5 font-medium tabular-nums",
              USAGE_LEVEL_TEXT_CLASSES[usageLevel],
            )}
            aria-label={meterLabel.ariaLabel}
          >
            {meterLabel.text}
          </Button>
        }
      />
      <PopoverPopup
        {...composerFloatingLayerProps}
        tooltipStyle
        side="top"
        align="end"
        viewportClassName="p-0"
        className="w-64 max-w-none text-left whitespace-normal"
      >
        <div className="flex flex-col gap-2 p-[var(--floating-content-inset)]">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-muted-foreground text-xs">Context Window</div>
            {usage.maxTokens !== null && usedPercentage ? (
              <div className="text-secondary-label text-[11px] tabular-nums">
                <span>{usedPercentage}</span>
                <span className="mx-1">·</span>
                <span>
                  {formatContextWindowTokens(usage.usedTokens)}/
                  {formatContextWindowTokens(usage.maxTokens ?? null)}
                </span>
              </div>
            ) : (
              <div className="text-secondary-label text-[11px] tabular-nums">
                {formatContextWindowTokens(usage.usedTokens)}
              </div>
            )}
          </div>
          {usage.maxTokens !== null ? (
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(normalizedPercentage)}
              aria-label="Context window usage"
            >
              <div
                className="h-full rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${normalizedPercentage}%`, backgroundColor: usageColor }}
              />
            </div>
          ) : null}
          {showTotalProcessed ? (
            <div className="flex items-center justify-between gap-3 text-[11px] leading-4">
              <span className="text-secondary-label">Total processed</span>
              <span className="font-medium tabular-nums text-secondary-label">
                {formatContextWindowTokens(totalProcessedTokens)}
              </span>
            </div>
          ) : null}
          {usage.compactsAutomatically ? (
            <div className="mt-1 text-pretty text-secondary-label text-[11px] font-medium">
              {formatContextWindowCompactionMessage(modelDisplayName, usage.autoCompactThreshold)}
            </div>
          ) : null}
          {onCompact ? (
            <>
              <Button
                size="xs"
                variant="outline"
                className="mt-1 w-full justify-center"
                disabled={compactDisabled}
                onClick={onCompact}
              >
                <Minimize2Icon aria-hidden="true" />
                Compact context
              </Button>
              {compactDisabled && compactDisabledReason ? (
                <div className="text-pretty text-secondary-label text-[11px]">
                  {compactDisabledReason}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
