const subjectKey = subject => JSON.stringify([
  subject.code,
  subject.name,
  String(subject.semester)
]);

exports.planSubjectSync = (existing, desired) => {
  const available = new Map();
  for (const subject of existing) {
    const key = subjectKey(subject);
    if (!available.has(key)) available.set(key, []);
    available.get(key).push(subject._id);
  }

  const toCreate = [], desiredSubjectIds = [];
  let retained = 0;
  for (const subject of desired) {
    const matches = available.get(subjectKey(subject));
    if (matches?.length) {
      desiredSubjectIds.push(matches.pop());
      retained++;
    } else {
      toCreate.push({
        code: subject.code,
        name: subject.name,
        department: subject.department,
        semester: subject.semester
      });
      desiredSubjectIds.push(null);
    }
  }

  return { retained, toCreate, desiredSubjectIds, obsoleteIds: [...available.values()].flat() };
};
