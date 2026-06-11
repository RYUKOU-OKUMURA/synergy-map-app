import { describe, expect, it } from "vitest";

import { formatTime } from "@/lib/appFormatters";

describe("formatTime", () => {
  it("returns a placeholder for missing values", () => {
    expect(formatTime(null)).toBe("-");
    expect(formatTime(undefined)).toBe("-");
  });

  it("formats a valid timestamp with date and time parts", () => {
    expect(formatTime("2026-06-11T09:30:00Z")).toMatch(/\d{2}\/\d{2}.*\d{2}:\d{2}/);
  });
});
