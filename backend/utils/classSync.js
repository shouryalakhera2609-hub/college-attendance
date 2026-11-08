const sectionKey = section => JSON.stringify([
  section.name,
  String(section.department),
  String(section.semester),
  section.branch || '',
  section.campus || ''
]);
const sectionGroupKey = section => JSON.stringify([
  section.name,
  String(section.department),
  String(section.semester),
  section.campus || ''
]);

exports.planClassSync = (existing, desired) => {
  const available = new Map();
  const sectionsById = new Map();
  for (const section of existing) {
    const key = sectionKey(section);
    if (!available.has(key)) available.set(key, []);
    available.get(key).push(section._id);
    sectionsById.set(String(section._id), section);
  }

  const desiredBranchesByGroup = new Map();
  for (const section of desired) {
    const key = sectionGroupKey(section);
    if (!desiredBranchesByGroup.has(key)) desiredBranchesByGroup.set(key, new Set());
    desiredBranchesByGroup.get(key).add(section.branch || '');
  }

  const toCreate = [], toUpdate = [], desiredSectionIds = [], retainedIds = new Set();
  let retained = 0;
  for (const section of desired) {
    const matches = available.get(sectionKey(section));
    let matchedId = matches?.pop();
    if (!matchedId && section.branch && desiredBranchesByGroup.get(sectionGroupKey(section)).size === 1) {
      const groupKey = sectionGroupKey(section);
      const fallbackMatches = existing.filter(candidate =>
        sectionGroupKey(candidate) === groupKey
        && !candidate.branch
        && !retainedIds.has(String(candidate._id))
        && (available.get(sectionKey(candidate)) || []).includes(candidate._id)
      );
      if (fallbackMatches.length) {
        const fallback = fallbackMatches[0];
        matchedId = fallback._id;
        const fallbackKey = sectionKey(fallback);
        available.set(fallbackKey, available.get(fallbackKey).filter(id => String(id) !== String(matchedId)));
        if ((fallback.branch || '') !== (section.branch || '')) {
          toUpdate.push({ _id: matchedId, branch: section.branch || '' });
        }
      }
    }

    if (matchedId) {
      retainedIds.add(String(matchedId));
      desiredSectionIds.push(matchedId);
      retained++;
    } else {
      toCreate.push({
        name: section.name,
        department: section.department,
        semester: section.semester,
        ...(section.branch ? { branch: section.branch } : {}),
        ...(section.campus ? { campus: section.campus } : {})
      });
      desiredSectionIds.push(null);
    }
  }

  return {
    retained,
    toCreate,
    toUpdate,
    desiredSectionIds,
    obsoleteIds: existing.filter(section => !retainedIds.has(String(section._id))).map(section => section._id)
  };
};
