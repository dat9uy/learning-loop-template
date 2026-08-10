/**
 * gap-analyzer.js
 *
 * Pure function: compute coverage of a contract surface.
 *
 * @param {{ name: string, items: string[] }} surface
 * @param {Array<{ file: string, source: string }>} testFiles
 * @returns {{ surface, total, covered, percent, missing }}
 */

// fallow-ignore-next-line complexity -- per-surface coverage accumulator with term-matching against every test file; the nested scan is the canonical shape
export function analyzeGaps(surface, testFiles) {
  if (!surface || !Array.isArray(surface.items)) {
    return { surface: surface?.name || "unknown", total: 0, covered: 0, percent: 100, missing: [] };
  }
  const total = surface.items.length;
  const covered = new Set();
  for (const tf of testFiles) {
    if (!tf.source) continue;
    for (const item of surface.items) {
      if (tf.source.includes(item)) covered.add(item);
    }
  }
  const coveredCount = covered.size;
  const missing = surface.items.filter((i) => !covered.has(i));
  const percent = total === 0 ? 100 : (coveredCount / total) * 100;
  return {
    surface: surface.name,
    total,
    covered: coveredCount,
    percent: Math.round(percent * 100) / 100,
    missing,
  };
}
