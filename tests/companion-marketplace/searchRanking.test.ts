import test from "node:test";
import assert from "node:assert/strict";
import {
  blendSearchScores,
  buildMatchReason,
  dotProduct,
  normalizeVector,
} from "../../src/main/companionMarketplace/searchRanking";

test("normalizeVector creates unit-length vectors", () => {
  const normalized = normalizeVector([3, 4]);
  const magnitude = Math.sqrt(dotProduct(normalized, normalized));

  assert(Math.abs(magnitude - 1) < 1e-8);
});

test("blendSearchScores slightly favors semantic matches", () => {
  const semanticHeavy = blendSearchScores(0.2, 0.9);
  const keywordHeavy = blendSearchScores(0.9, 0.2);

  assert(semanticHeavy > keywordHeavy);
});

test("buildMatchReason prefers explicit hints before fallback heuristics", () => {
  assert.equal(
    buildMatchReason(0.2, 0.2, "Tag match: seo, content"),
    "Tag match: seo, content",
  );
  assert.equal(
    buildMatchReason(0.4, 0.8),
    "Strong semantic and keyword match.",
  );
});
