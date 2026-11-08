const rowKey = row => JSON.stringify(row.map(cell => String(cell ?? '').trim()));

module.exports = (previousRows, nextRows) => {
  const previousCounts = new Map();
  const nextCounts = new Map();
  for (const row of previousRows) {
    const key = rowKey(row);
    previousCounts.set(key, (previousCounts.get(key) || 0) + 1);
  }
  for (const row of nextRows) {
    const key = rowKey(row);
    nextCounts.set(key, (nextCounts.get(key) || 0) + 1);
  }

  let added = 0, removed = 0;
  for (const [key, count] of nextCounts) added += Math.max(0, count - (previousCounts.get(key) || 0));
  for (const [key, count] of previousCounts) removed += Math.max(0, count - (nextCounts.get(key) || 0));
  return { added, removed };
};
