export const LANGUAGE_EXTENSIONS: Record<string, string> = {
  python: "py",
  python3: "py",
  cpp: "cpp",
  "c++": "cpp",
  java: "java",
  javascript: "js",
  typescript: "ts",
  c: "c",
  csharp: "cs",
  "c#": "cs",
  go: "go",
  rust: "rs",
  kotlin: "kt",
  swift: "swift",
  ruby: "rb",
  php: "php",
  scala: "scala"
};

export function extensionForLanguage(language: string): string | undefined {
  return LANGUAGE_EXTENSIONS[language.trim().toLowerCase()];
}

export function sanitizeSlug(slug: string): string {
  return slug
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 100) || "problem";
}

export function sanitizeDirectory(directory: string): string {
  return directory
    .split("/")
    .map((part) => part.trim())
    .filter((part) => Boolean(part) && part !== "." && part !== "..")
    .map((part) => part.replace(/[^a-zA-Z0-9._-]/g, "-"))
    .join("/")
    .replace(/^\/+|\/+$/g, "");
}

export function solutionPath(input: {
  problemNumber: number;
  slug: string;
  language: string;
  submissionId: string;
}): string {
  const extension = extensionForLanguage(input.language);
  if (!extension) throw new Error(`Unsupported LeetCode language: ${input.language}`);
  const number = String(input.problemNumber).padStart(4, "0");
  const language = sanitizeDirectory(input.language.toLowerCase()) || "unknown";
  const submissionId = String(input.submissionId).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!submissionId) throw new Error("Submission ID is required for versioned sync.");
  return ["problems", `${number}-${sanitizeSlug(input.slug)}`, language, `${submissionId}.${extension}`].join("/");
}
