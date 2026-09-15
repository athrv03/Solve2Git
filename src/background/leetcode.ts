import type { Difficulty, LeetCodeSubmission } from "../types";

export interface LeetCodeClient {
  getCurrentProblem(): Promise<{ number: number; slug: string; title: string; difficulty: Difficulty }>;
  getRecentSubmissions(slug: string): Promise<LeetCodeSubmission[]>;
  getSubmissionCode(submissionId: string): Promise<string>;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface QuestionData {
  question: {
    questionFrontendId: string;
    title: string;
    titleSlug: string;
    difficulty: Difficulty;
  };
}

interface RecentSubmission {
  id: string;
  statusDisplay: string;
  lang: { name: string };
  timestamp: string;
  runtime?: string;
  memory?: string;
}

interface RecentSubmissionData {
  recentSubmissionList: RecentSubmission[] | { submissions?: RecentSubmission[] };
}

interface SubmissionDetailData {
  submissionDetails: RecentSubmission & {
    code: string;
    runtimePercentile?: number;
    memoryPercentile?: number;
  };
}

const QUESTION_QUERY = `query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) { questionFrontendId title titleSlug difficulty }
}`;

const RECENT_SUBMISSIONS_QUERY = `query recentSubmissionList($questionSlug: String!, $limit: Int, $offset: Int) {
  recentSubmissionList(questionSlug: $questionSlug, limit: $limit, offset: $offset) {
    id statusDisplay lang { name } timestamp runtime memory
  }
}`;

const SUBMISSION_DETAILS_QUERY = `query submissionDetails($submissionId: Int!) {
  submissionDetails(submissionId: $submissionId) {
    id statusDisplay lang { name } timestamp runtime memory code runtimePercentile memoryPercentile
  }
}`;

export class BrowserLeetCodeClient implements LeetCodeClient {
  private async query<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables })
    });
    const responseBody = await response.text();
    if (!response.ok) {
      let detail = "";
      try {
        const errorPayload = JSON.parse(responseBody) as GraphQLResponse<T>;
        detail = errorPayload.errors?.[0]?.message ?? "";
      } catch {
        detail = responseBody.slice(0, 160);
      }
      throw new Error(`LeetCode request failed (${response.status})${detail ? `: ${detail}` : "."}`);
    }
    const payload = JSON.parse(responseBody) as GraphQLResponse<T>;
    if (payload.errors?.length || !payload.data) throw new Error(payload.errors?.[0]?.message ?? "LeetCode returned no data.");
    return payload.data;
  }

  async getCurrentProblem(): Promise<{ number: number; slug: string; title: string; difficulty: Difficulty }> {
    const problem = extractProblemFromUrl();
    if (!problem) throw new Error("Not on a LeetCode problem page.");
    const data = await this.query<QuestionData>(QUESTION_QUERY, { titleSlug: problem.slug });
    return {
      number: Number(data.question.questionFrontendId),
      slug: data.question.titleSlug,
      title: data.question.title,
      difficulty: data.question.difficulty
    };
  }

  async getRecentSubmissions(slug: string): Promise<LeetCodeSubmission[]> {
    const data = await this.query<RecentSubmissionData>(RECENT_SUBMISSIONS_QUERY, { questionSlug: slug, limit: 10, offset: 0 });
    const submissions = Array.isArray(data.recentSubmissionList) ? data.recentSubmissionList : data.recentSubmissionList.submissions ?? [];
    return submissions.map((submission) => normalizeSubmission({
      submissionId: submission.id,
      language: submission.lang.name,
      code: "",
      status: submission.statusDisplay,
      timestamp: new Date(Number(submission.timestamp) * 1000).toISOString(),
      runtime: submission.runtime,
      memory: submission.memory,
      slug,
      title: slug,
      problemNumber: 0,
      difficulty: "Easy"
    }));
  }

  async getSubmissionCode(submissionId: string): Promise<string> {
    const data = await this.query<SubmissionDetailData>(SUBMISSION_DETAILS_QUERY, { submissionId: Number(submissionId) });
    return data.submissionDetails.code;
  }

  async getSubmission(submission: LeetCodeSubmission): Promise<LeetCodeSubmission> {
    const detail = await this.query<SubmissionDetailData>(SUBMISSION_DETAILS_QUERY, { submissionId: Number(submission.submissionId) });
    return normalizeSubmission({
      ...submission,
      ...detail.submissionDetails,
      language: detail.submissionDetails.lang.name ?? submission.language,
      code: detail.submissionDetails.code,
      status: detail.submissionDetails.statusDisplay
    });
  }
}

export function normalizeSubmission(input: Omit<Partial<LeetCodeSubmission>, "status"> & { status: string }): LeetCodeSubmission {
  const status: LeetCodeSubmission["status"] = input.status === "Accepted" ? "Accepted" : "Rejected";
  return {
    submissionId: String(input.submissionId ?? ""),
    problemNumber: Number(input.problemNumber ?? 0),
    slug: String(input.slug ?? ""),
    title: String(input.title ?? ""),
    difficulty: input.difficulty === "Hard" || input.difficulty === "Medium" ? input.difficulty : "Easy",
    language: String(input.language ?? ""),
    code: String(input.code ?? ""),
    status,
    timestamp: input.timestamp ?? new Date().toISOString(),
    runtime: input.runtime,
    memory: input.memory,
    runtimePercentile: input.runtimePercentile,
    memoryPercentile: input.memoryPercentile
  };
}

export function isAcceptedSubmission(submission: LeetCodeSubmission): boolean {
  return submission.status === "Accepted" && Boolean(submission.submissionId && submission.code);
}

export function extractProblemFromUrl(url = location.href): { slug: string } | null {
  const match = new URL(url).pathname.match(/^\/problems\/([^/]+)/);
  return match ? { slug: match[1] } : null;
}

export function extractSubmissionIdFromUrl(url = location.href): string | null {
  const match = new URL(url).pathname.match(/\/submissions\/(\d+)/);
  return match?.[1] ?? null;
}
