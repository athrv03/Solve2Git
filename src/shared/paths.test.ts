import { describe, expect, it } from "vitest";
import { extensionForLanguage, sanitizeSlug, solutionPath } from "./paths";

describe("solution paths", () => {
  it("maps supported languages", () => {
    expect(extensionForLanguage("Python3")).toBe("py");
    expect(extensionForLanguage("c++")).toBe("cpp");
  });

  it("rejects unknown languages", () => {
    expect(extensionForLanguage("brainfuck")).toBeUndefined();
  });

  it("creates versioned paths grouped by problem and language", () => {
    expect(sanitizeSlug("Longest Substring / Unsafe!")).toBe("longest-substring-unsafe");
    expect(solutionPath({ problemNumber: 1, slug: "two-sum", language: "Python3", submissionId: "123" })).toBe("problems/0001-two-sum/python3/123.py");
  });

  it("rejects an unsafe or missing submission identifier", () => {
    expect(() => solutionPath({ problemNumber: 1, slug: "two-sum", language: "python", submissionId: "" })).toThrow("Submission ID");
    expect(solutionPath({ problemNumber: 1, slug: "two-sum", language: "python", submissionId: "../123" })).toBe("problems/0001-two-sum/python/123.py");
  });
});
