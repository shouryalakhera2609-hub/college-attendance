const catalogIdFor = (campus, source) => `${campus}:${source}`;

const sourceForDatabaseSubject = subjectId => `subject:${subjectId}`;
const parseCatalogId = catalogId => {
  const match = /^(BIRT|BIRTS|BIST):(subject|upload):(.+)$/i.exec(catalogId);
  return match
    ? { campus: match[1].toUpperCase(), source: `${match[2].toLowerCase()}:${match[3]}` }
    : null;
};

module.exports = (member, campus, claimedCatalogIds) => {
  const claimed = new Set(claimedCatalogIds);
  const mappings = [...(member.savedSubjectCampuses || [])];
  const subjects = [...(member.savedSubjects || [])];

  for (const subject of subjects) {
    const source = sourceForDatabaseSubject(subject._id || subject);
    if (!mappings.some(item => item.catalogId.endsWith(`:${source}`) || item.catalogId === source)) {
      if (member.campus) mappings.push({ catalogId: catalogIdFor(member.campus, source), campus: member.campus });
    }
  }

  const savedSubjectCampuses = mappings.filter(item => {
    const parsed = parseCatalogId(item.catalogId);
    const source = parsed?.source || item.catalogId;
    const mappingCampus = item.campus || parsed?.campus || member.campus;
    return !claimed.has(catalogIdFor(mappingCampus, source));
  });
  const savedSubjects = subjects.filter(subject => {
    const source = sourceForDatabaseSubject(subject._id || subject);
    return savedSubjectCampuses.some(item =>
      (item.catalogId.endsWith(`:${source}`) || item.catalogId === source)
    );
  });

  const savedUploadedSubjects = (member.savedUploadedSubjects || []).flatMap(subject => {
    const savedCampus = subject.campus || member.campus;
    if (!savedCampus) return [subject];
    const parsed = parseCatalogId(subject.catalogId);
    const catalogId = parsed?.campus === savedCampus
      ? subject.catalogId
      : catalogIdFor(savedCampus, subject.catalogId);
    if (claimed.has(catalogId)) return [];
    return [{ ...subject, campus: savedCampus, catalogId }];
  });

  return {
    savedSubjectCampuses,
    savedSubjects,
    savedUploadedSubjects,
    changed: savedSubjectCampuses.length !== mappings.length
      || savedSubjects.length !== subjects.length
      || savedUploadedSubjects.length !== (member.savedUploadedSubjects || []).length
  };
};
