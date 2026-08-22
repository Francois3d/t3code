import { ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { formatContextWindowTokens } from "~/lib/contextWindow";
import {
  formatContextWindowCompactionMessage,
  formatContextWindowMeterLabel,
  formatContextWindowPercentage,
  resolveContextWindowModelDisplayName,
  resolveContextWindowUsageLevel,
} from "./ContextWindowMeter.logic";

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
