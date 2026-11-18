export function offsetIndex(offsets: number[], target: number): number {
  let low = 0, high = Math.max(0, offsets.length - 2);
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (offsets[mid] <= target) low = mid;
    else high = mid - 1;
  }
  return low;
}
export function trackWindow(offsets: number[], top: number, height: number) {
  const count = Math.max(0, offsets.length - 1);
  if (!count) return {start: 0, end: 0, before: 0, after: 0};
  const start = Math.max(0, offsetIndex(offsets, Math.max(0, top)) - 8);
  const end = Math.min(count, offsetIndex(offsets, Math.max(0, top) + height) + 10);
  return {start, end, before: offsets[start], after: offsets[count] - offsets[end]};
}
