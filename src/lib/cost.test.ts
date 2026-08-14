import { describe, expect, it } from "vitest";
import {
  costEstimateLabel,
  estimateCostUsd,
  formatCostUsd,
  parseRatePer1k,
} from "./cost";

describe("parseRatePer1k", () => {
  it("reads the rate out of the display string", () => {
    expect(parseRatePer1k("~$0.015")).toBe(0.015);
    expect(parseRatePer1k("~$0.10")).toBe(0.1);
    expect(parseRatePer1k("$2")).toBe(2);
  });

  it("returns null when there is no number", () => {
    expect(parseRatePer1k("free")).toBeNull();
    expect(parseRatePer1k("")).toBeNull();
  });
});

describe("estimateCostUsd", () => {
  it("scales the rate by input length", () => {
    // 27,489 chars at $0.02/1k ~= $0.55
    expect(estimateCostUsd(27489, "~$0.02")).toBeCloseTo(0.54978, 5);
    expect(estimateCostUsd(1000, "~$0.015")).toBeCloseTo(0.015, 5);
  });

  it("returns null for empty input or an unparseable rate", () => {
    expect(estimateCostUsd(0, "~$0.02")).toBeNull();
    expect(estimateCostUsd(-5, "~$0.02")).toBeNull();
    expect(estimateCostUsd(1000, "n/a")).toBeNull();
  });
});

describe("formatCostUsd", () => {
  it("rounds to cents", () => {
    expect(formatCostUsd(0.549)).toBe("$0.55");
    expect(formatCostUsd(2.75)).toBe("$2.75");
  });

  it("shows a floor for tiny nonzero amounts", () => {
    expect(formatCostUsd(0.003)).toBe("< $0.01");
  });

  it("shows $0.00 only for an actual zero", () => {
    expect(formatCostUsd(0)).toBe("$0.00");
  });
});

describe("costEstimateLabel", () => {
  it("returns a display label with the approximate prefix", () => {
    expect(costEstimateLabel(27489, "~$0.10")).toBe("~ $2.75");
    expect(costEstimateLabel(200, "~$0.015")).toBe("~ < $0.01");
  });

  it("returns null when no estimate is possible", () => {
    expect(costEstimateLabel(0, "~$0.02")).toBeNull();
    expect(costEstimateLabel(1000, "unknown")).toBeNull();
  });
});
