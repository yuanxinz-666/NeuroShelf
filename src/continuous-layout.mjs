export function pageLayout(sizes, width, gap = 36) {
  let top = 0;
  return sizes.map((size, index) => {
    const height = width * size.height / size.width;
    const row = { number: index + 1, top, height, width, end: top + height + gap };
    top = row.end; return row;
  });
}
export function pageAtOffset(rows, offset) {
  let low = 0, high = rows.length - 1;
  while (low < high) { const mid = (low + high) >> 1; if (rows[mid].end <= offset) low = mid + 1; else high = mid; }
  return rows[low]?.number || 1;
}
export function visiblePages(rows, top, height, overscan = 700) {
  if (!rows.length) return [];
  const first = pageAtOffset(rows, Math.max(0, top - overscan)), last = pageAtOffset(rows, top + height + overscan);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}
