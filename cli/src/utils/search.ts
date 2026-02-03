import { readdir } from "node:fs/promises";
import { join } from "node:path";

export interface SearchOptions {
  limit?: number;
  timeoutMs?: number;
  ignore?: string[];
}

export interface SearchResult {
  files: string[];
  truncated: boolean;
}

export function fuzzyScore(text: string, query: string): number {
  if (!query) return 1;
  const target = text.toLowerCase();
  const pattern = query.toLowerCase();
  
  let score = 0;
  let queryIdx = 0;
  
  // Check for exact substring match first (highest priority)
  if (target.includes(pattern)) {
    score += 100;
    // Bonus for matching at start of path segment
    if (target.startsWith(pattern) || target.includes("/" + pattern)) {
      score += 50;
    }
  }

  // Fallback to subsequence matching
  for (let i = 0; i < target.length && queryIdx < pattern.length; i++) {
    if (target[i] === pattern[queryIdx]) {
      queryIdx++;
      if (queryIdx === 1) {
        // Bonus for matching first char at start of segment
        if (i === 0 || target[i-1] === "/" || target[i-1] === "_" || target[i-1] === "-") {
          score += 10;
        }
      }
    }
  }

  return queryIdx === pattern.length ? score + 1 : 0;
}

export function fuzzyMatch(text: string, query: string): boolean {
  return fuzzyScore(text, query) > 0;
}

export async function recursiveSearch(
  dir: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult> {
  const { limit = 20000, timeoutMs = 250, ignore = ["node_modules", ".git", "dist", ".DS_Store"] } = options;
  const start = Date.now();
  const results: { path: string, score: number }[] = [];
  let fileCount = 0;
  let truncated = false;

  async function walk(currentDir: string) {
    if (truncated) return;
    if (Date.now() - start >= timeoutMs) {
      truncated = true;
      return;
    }

    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (truncated) return;
        if (ignore.includes(entry.name)) continue;

        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else {
          fileCount++;
          const relativePath = fullPath.replace(dir + "/", "");
          const score = fuzzyScore(relativePath, query);
          if (score > 0) {
            results.push({ path: fullPath, score });
          }
          if (fileCount >= limit) {
            truncated = true;
            return;
          }
        }
      }
    } catch (err) {
      // Silently ignore
    }
  }

  await walk(dir);

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return { files: results.map(r => r.path), truncated };
}
