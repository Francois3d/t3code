import type { ModelSelection, ProviderInstanceId } from "@t3tools/contracts";
import {
  CLAUDE_RESUME_COMPACTION_NEVER_ANSWER,
  isClaudeResumeCompactionQuestion,
} from "@t3tools/shared/claudeCompaction";
import {
  resolveSelectableProviderInstanceEntry,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { getTriggerDisplayModelName, type ModelEsque } from "./providerIconUtils";

export const CLAUDE_RESUME_COMPACTION_MINUTES = 70;
export const CLAUDE_RESUME_COMPACTION_TOKENS = 100_000;

export function hasAvailableClaudeCompactionProvider(input: {
  readonly providers: ReadonlyArray<ProviderInstanceEntry>;
  readonly instanceId: ProviderInstanceId | null;
  readonly lockedInstanceId: ProviderInstanceId | null;
}): boolean {
  const claudeProviders = input.providers.filter(
    (provider) => provider.driverKind === "claudeAgent",
  );
  const lockedContinuationGroupKey = input.lockedInstanceId
    ? claudeProviders.find((provider) => provider.instanceId === input.lockedInstanceId)
        ?.continuationGroupKey
    : undefined;
  const compatibleProviders = lockedContinuationGroupKey
    ? claudeProviders.filter(
        (provider) => provider.continuationGroupKey === lockedContinuationGroupKey,
      )
    : claudeProviders;

  return (
    resolveSelectableProviderInstanceEntry(compatibleProviders, input.instanceId ?? undefined) !==
    undefined
  );
}

export function hasDismissedResumeCompaction(
  activities: ReadonlyArray<{ readonly kind: string; readonly payload: unknown }>,
): boolean {
  return activities.some((activity) => {
    if (activity.kind !== "user-input.resolved") return false;
    const payload = activity.payload;
    if (!payload || typeof payload !== "object") return false;
    const answers = (payload as { readonly answers?: unknown }).answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) return false;

    return Object.entries(answers).some(
      ([question, answer]) =>
        isClaudeResumeCompactionQuestion(question) &&
        answer === CLAUDE_RESUME_COMPACTION_NEVER_ANSWER,
    );
  });
}

export function shouldOfferResumeCompaction(input: {
  readonly provider: string | null | undefined;
  readonly usedTokens: number | null | undefined;
  readonly updatedAt: string | null | undefined;
  readonly now: string;
}): boolean {
  if (
    input.provider !== "claudeAgent" ||
    (input.usedTokens ?? 0) < CLAUDE_RESUME_COMPACTION_TOKENS
  ) {
    return false;
  }

  const updatedAt = Date.parse(input.updatedAt ?? "");
  const now = Date.parse(input.now);
  return (
    Number.isFinite(updatedAt) &&
    Number.isFinite(now) &&
    now - updatedAt >= CLAUDE_RESUME_COMPACTION_MINUTES * 60_000
  );
}

export function resolveContextWindowModelDisplayName(
  selection: ModelSelection | null | undefined,
  modelOptionsByInstance: ReadonlyMap<ProviderInstanceId, ReadonlyArray<ModelEsque>>,
): string | null {
  if (!selection) {
    return null;
  }

  const selectedModel = modelOptionsByInstance
    .get(selection.instanceId)
    ?.find((model) => model.slug === selection.model);

  return selectedModel ? getTriggerDisplayModelName(selectedModel) : selection.model;
}

export function formatContextWindowCompactionMessage(
  modelDisplayName: string | null | undefined,
  autoCompactThreshold?: number | null,
): string {
  if (typeof autoCompactThreshold === "number" && autoCompactThreshold > 0) {
    return `Compacts automatically at ${autoCompactThreshold.toLocaleString("en-US")} tokens.`;
  }
  return modelDisplayName
    ? `Context for ${modelDisplayName} compacts automatically when needed.`
    : "Context compacts automatically when needed.";
}

/** Percentage as shown in the meter: one decimal below 10%, whole numbers above. */
export function formatContextWindowPercentage(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  if (value < 10) {
    return `${value.toFixed(1).replace(/\.0$/, "")}%`;
  }
  return `${Math.round(value)}%`;
}

/**
 * Text the composer's context pill shows, plus the label screen readers get.
 * The pill reads `used/max` when there is room and a denominator; it falls back
 * to the percentage alone in the compact footer, and to the used tokens alone
 * when the provider has not reported a context window yet.
 */
export function formatContextWindowMeterLabel(
  usage: {
    usedTokens: number;
    maxTokens?: number | null;
    usedPercentage: number | null;
  },
  options: { compact: boolean; formatTokens: (value: number | null) => string },
): { text: string; ariaLabel: string } {
  const { formatTokens } = options;
  const percentage = formatContextWindowPercentage(usage.usedPercentage);
  const used = formatTokens(usage.usedTokens);

  const maxTokens = usage.maxTokens ?? null;
  if (maxTokens === null || percentage === null) {
    return { text: used, ariaLabel: `Context window: ${used} tokens used` };
  }

  const ariaLabel = `Context window: ${percentage} used, ${used} of ${formatTokens(maxTokens)} tokens`;
  return {
    text: options.compact ? percentage : `${used}/${formatTokens(maxTokens)}`,
    ariaLabel,
  };
}

/** Token counts at which the composer's context pill changes colour. */
export const CONTEXT_WINDOW_ELEVATED_TOKENS = 150_000;
export const CONTEXT_WINDOW_HIGH_TOKENS = 250_000;

export type ContextWindowUsageLevel = "normal" | "elevated" | "high";

/**
 * Colour band for a token count. These are absolute costs, not a fraction of
 * the window, so a large context window does not hide an expensive turn.
 */
export function resolveContextWindowUsageLevel(usedTokens: number): ContextWindowUsageLevel {
  if (!Number.isFinite(usedTokens)) {
    return "normal";
  }
  if (usedTokens > CONTEXT_WINDOW_HIGH_TOKENS) {
    return "high";
  }
  if (usedTokens > CONTEXT_WINDOW_ELEVATED_TOKENS) {
    return "elevated";
  }
  return "normal";
}
