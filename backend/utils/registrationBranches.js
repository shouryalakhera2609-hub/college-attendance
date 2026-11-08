module.exports = sections => {
  const branchesByName = new Map();
  for (const section of sections) {
    const name = typeof section?.branch === 'string' ? section.branch.trim() : '';
    const key = name.toLowerCase();
    if (name && !branchesByName.has(key)) branchesByName.set(key, name);
  }
  return [...branchesByName.values()].sort((a, b) => a.localeCompare(b));
};
