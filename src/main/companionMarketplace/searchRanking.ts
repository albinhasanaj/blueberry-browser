import type { CompanionSearchResult } from "../../shared/companionMarketplace";

export interface SearchCandidate {
  companionId: string;
  keywordScore: number;
  semanticScore: number;
  matchHint?: string;
}

export function dotProduct(a: number[], b: number[]): number {
  const size = Math.min(a.length, b.length);
  let total = 0;
  for (let i = 0; i < size; i++) {
    total += a[i] * b[i];
  }
  return total;
}

export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return vector.map(() => 0);
  return vector.map((value) => value / magnitude);
}

export function blendSearchScores(
  keywordScore: number,
  semanticScore: number,
): number {
  return keywordScore * 0.45 + semanticScore * 0.55;
}

export function buildMatchReason(
  keywordScore: number,
  semanticScore: number,
  matchHint?: string,
): string {
  if (matchHint?.trim()) return matchHint.trim();
  if (semanticScore > 0.7 && keywordScore > 0.3) {
    return "Strong semantic and keyword match.";
  }
  if (semanticScore > 0.7) {
    return "Strong semantic match.";
  }
  if (keywordScore > 0.3) {
    return "Strong keyword match.";
  }
  return "Matched on blended semantic and keyword signals.";
}

export function sortSearchResults<T extends CompanionSearchResult>(
  results: T[],
): T[] {
  return [...results].sort((left, right) => right.score - left.score);
}
