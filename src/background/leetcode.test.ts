import { describe, expect, it } from "vitest";
import { isAcceptedSubmission, normalizeSubmission } from "./leetcode";

describe("LeetCode normalization", () => {
  it("keeps accepted submissions syncable", () => {
    const submission = normalizeSubmission({ submissionId: "123", problemNumber: 1, slug: "two-sum", title: "Two Sum", difficulty: "Easy", language: "python3", code: "print(1)", status: "Accepted" });
    expect(submission.status).toBe("Accepted");
    expect(isAcceptedSubmission(submission)).toBe(true);
  });

  it("normalizes non-accepted statuses as rejected", () => {
    const submission = normalizeSubmission({ submissionId: "123", code: "print(1)", status: "Wrong Answer" });
    expect(submission.status).toBe("Rejected");
    expect(isAcceptedSubmission(submission)).toBe(false);
  });
});
