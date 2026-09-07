import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { formatContextWindowTokens } from "~/lib/contextWindow";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import {
  formatContextWindowCompactionMessage,
  formatContextWindowMeterLabel,
  formatContextWindowPercentage,
  hasAvailableCompactionProvider,
  hasDismissedResumeCompaction,
  resolveContextWindowModelDisplayName,
  resolveContextWindowUsageLevel,
  shouldOfferResumeCompaction,
} from "./ContextWindowMeter.logic";

function claudeProvider(input: {
  instanceId: string;
  continuationGroupKey: string;
  enabled?: boolean;
}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: ProviderDriverKind.make("claudeAgent"),
    continuation: { groupKey: input.continuationGroupKey },
    enabled: input.enabled ?? true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-08-24T12:00:00.000Z",
    models: [],
    slashCommands: [{ name: "compact", description: "" }],
    skills: [],
  };
}

describe("hasAvailableCompactionProvider", () => {
  const originalInstanceId = ProviderInstanceId.make("claude_original");

  it("rejects a fallback in a different locked continuation group", () => {
    const providers = deriveProviderInstanceEntries([
      claudeProvider({
        instanceId: originalInstanceId,
        continuationGroupKey: "claude:home:/original",
        enabled: false,
      }),
      claudeProvider({
        instanceId: "claude_other",
        continuationGroupKey: "claude:home:/other",
      }),
    ]);

    expect(
      hasAvailableCompactionProvider({
        providers,
        driverKind: ProviderDriverKind.make("claudeAgent"),
        instanceId: originalInstanceId,
        lockedInstanceId: originalInstanceId,
      }),
    ).toBe(false);
  });

  it("accepts an enabled fallback in the locked continuation group", () => {
    const providers = deriveProviderInstanceEntries([
      claudeProvider({
        instanceId: originalInstanceId,
        continuationGroupKey: "claude:home:/original",
        enabled: false,
      }),
      claudeProvider({
        instanceId: "claude_fallback",
        continuationGroupKey: "claude:home:/original",
      }),
    ]);

    expect(
      hasAvailableCompactionProvider({
        providers,
        driverKind: ProviderDriverKind.make("claudeAgent"),
        instanceId: originalInstanceId,
        lockedInstanceId: originalInstanceId,
      }),
    ).toBe(true);
  });
});

describe("resolveContextWindowModelDisplayName", () => {
  it("uses the selected model from the exact provider instance", () => {
    const primaryInstanceId = ProviderInstanceId.make("codex");
    const selectedInstanceId = ProviderInstanceId.make("codex-work");
    const modelOptionsByInstance = new Map([
      [
        primaryInstanceId,
        [{ slug: "gpt-5.6-sol", name: "Primary profile model", shortName: "Primary" }],
      ],
      [selectedInstanceId, [{ slug: "gpt-5.6-sol", name: "GPT-5.6 Sol", shortName: "5.6 Sol" }]],
    ]);

    expect(
      resolveContextWindowModelDisplayName(
        {
          instanceId: selectedInstanceId,
          model: "gpt-5.6-sol",
        },
        modelOptionsByInstance,
      ),
    ).toBe("5.6 Sol");
  });

  it("falls back to the selected model slug when model metadata is unavailable", () => {
    const selectedInstanceId = ProviderInstanceId.make("codex-work");

    expect(
      resolveContextWindowModelDisplayName(
        {
          instanceId: selectedInstanceId,
          model: "custom-model",
        },
        new Map(),
      ),
    ).toBe("custom-model");
  });
});

describe("formatContextWindowCompactionMessage", () => {
  it("describes compaction in terms of the selected model", () => {
    expect(formatContextWindowCompactionMessage("GPT-5.6 Sol")).toBe(
      "Context for GPT-5.6 Sol compacts automatically when needed.",
    );
  });

  it("uses neutral copy when the model is unavailable", () => {
    expect(formatContextWindowCompactionMessage(null)).toBe(
      "Context compacts automatically when needed.",
    );
  });

  it("shows the configured auto-compaction threshold", () => {
    expect(formatContextWindowCompactionMessage("Claude Sonnet 5", 300_000)).toBe(
      "Compacts automatically at 300,000 tokens.",
    );
  });
});

describe("shouldOfferResumeCompaction", () => {
  const now = "2026-08-24T12:00:00.000Z";

  it("matches Claude's old-session age and context thresholds", () => {
    expect(
      shouldOfferResumeCompaction({
        provider: "claudeAgent",
        usedTokens: 100_000,
        updatedAt: "2026-08-24T10:50:00.000Z",
        now,
      }),
    ).toBe(true);
  });

  it("does not prompt for recent or smaller sessions", () => {
    expect(
      shouldOfferResumeCompaction({
        provider: "claudeAgent",
        usedTokens: 99_999,
        updatedAt: "2026-08-24T10:00:00.000Z",
        now,
      }),
    ).toBe(false);
    expect(
      shouldOfferResumeCompaction({
        provider: "claudeAgent",
        usedTokens: 200_000,
        updatedAt: "2026-08-24T10:51:00.000Z",
        now,
      }),
    ).toBe(false);
  });

  it("does not show Claude's resume prompt for another provider", () => {
    expect(
      shouldOfferResumeCompaction({
        provider: "codex",
        usedTokens: 300_000,
        updatedAt: "2026-08-24T09:00:00.000Z",
        now,
      }),
    ).toBe(false);
  });
});

describe("hasDismissedResumeCompaction", () => {
  it("recognizes the native resume dialog's permanent dismissal", () => {
    expect(
      hasDismissedResumeCompaction([
        {
          kind: "user-input.resolved",
          payload: {
            answers: {
              "This session is 2h 0m old and uses 250,000 tokens. Compact it before continuing?":
                "Don't ask again",
            },
          },
        },
      ]),
    ).toBe(true);
  });

  it("ignores the same answer on an unrelated question", () => {
    expect(
      hasDismissedResumeCompaction([
        {
          kind: "user-input.resolved",
          payload: { answers: { "Show this setup reminder?": "Don't ask again" } },
        },
      ]),
    ).toBe(false);
  });

  it("ignores unrelated questions that end with Claude's compaction prompt", () => {
    expect(
      hasDismissedResumeCompaction([
        {
          kind: "user-input.resolved",
          payload: {
            answers: {
              "The build cache is large. Compact it before continuing?": "Don't ask again",
            },
          },
        },
      ]),
    ).toBe(false);
  });

  it("ignores pending questions and malformed resolved payloads", () => {
    expect(
      hasDismissedResumeCompaction([
        { kind: "user-input.requested", payload: { answers: { question: "Don't ask again" } } },
        { kind: "user-input.resolved", payload: null },
        { kind: "user-input.resolved", payload: { answers: ["Don't ask again"] } },
      ]),
    ).toBe(false);
  });
});

describe("formatContextWindowPercentage", () => {
  it("keeps one decimal below ten percent and rounds above it", () => {
    expect(formatContextWindowPercentage(3.14)).toBe("3.1%");
    expect(formatContextWindowPercentage(4)).toBe("4%");
    expect(formatContextWindowPercentage(87.4)).toBe("87%");
  });

  it("has nothing to show without a denominator", () => {
    expect(formatContextWindowPercentage(null)).toBe(null);
  });
});

describe("formatContextWindowMeterLabel", () => {
  const format = { compact: false, formatTokens: formatContextWindowTokens };

  it("shows used over max when the composer has room", () => {
    expect(
      formatContextWindowMeterLabel(
        { usedTokens: 14_200, maxTokens: 258_000, usedPercentage: 5.5 },
        format,
      ),
    ).toEqual({
      text: "14k/258k",
      ariaLabel: "Context window: 5.5% used, 14k of 258k tokens",
    });
  });

  it("drops to the percentage alone in the compact footer", () => {
    expect(
      formatContextWindowMeterLabel(
        { usedTokens: 224_000, maxTokens: 258_000, usedPercentage: 86.8 },
        { ...format, compact: true },
      ).text,
    ).toBe("87%");
  });

  it("shows the used tokens alone when the provider reports no context window", () => {
    expect(
      formatContextWindowMeterLabel(
        { usedTokens: 81_659, maxTokens: null, usedPercentage: null },
        format,
      ),
    ).toEqual({
      text: "82k",
      ariaLabel: "Context window: 82k tokens used",
    });
  });

  it("prints the provider's unclamped token count even past the window", () => {
    expect(
      formatContextWindowMeterLabel(
        { usedTokens: 260_000, maxTokens: 258_000, usedPercentage: 100 },
        format,
      ).text,
    ).toBe("260k/258k");
  });
});

describe("resolveContextWindowUsageLevel", () => {
  it("stays neutral up to and including 150k tokens", () => {
    expect(resolveContextWindowUsageLevel(0)).toBe("normal");
    expect(resolveContextWindowUsageLevel(149_999)).toBe("normal");
    expect(resolveContextWindowUsageLevel(150_000)).toBe("normal");
  });

  it("goes elevated past 150k and stays there through 250k", () => {
    expect(resolveContextWindowUsageLevel(150_001)).toBe("elevated");
    expect(resolveContextWindowUsageLevel(250_000)).toBe("elevated");
  });

  it("goes high past 250k", () => {
    expect(resolveContextWindowUsageLevel(250_001)).toBe("high");
    expect(resolveContextWindowUsageLevel(900_000)).toBe("high");
  });

  it("treats a non-finite count as neutral", () => {
    expect(resolveContextWindowUsageLevel(Number.NaN)).toBe("normal");
  });
});
