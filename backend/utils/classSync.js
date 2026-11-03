const sectionKey = section => JSON.stringify([
  section.name,
  String(section.department),
  String(section.semester),
  section.campus || ''
]);

exports.planClassSync = (existing, desired) => {
  const available = new Map();
  for (const section of existing) {
    const key = sectionKey(section);
    if (!available.has(key)) available.set(key, []);
    available.get(key).push(section._id);
  }

  const toCreate = [], desiredSectionIds = [];
  let retained = 0;
  for (const section of desired) {
    const matches = available.get(sectionKey(section));
    if (matches?.length) {
      desiredSectionIds.push(matches.pop());
      retained++;
    } else {
      toCreate.push({
        name: section.name,
        department: section.department,
        semester: section.semester,
        ...(section.campus ? { campus: section.campus } : {})
      });
      desiredSectionIds.push(null);
    }
  }

  return { retained, toCreate, desiredSectionIds, obsoleteIds: [...available.values()].flat() };
};
