const validCampuses = new Set(['BIRT', 'BIRTS', 'BIST']);

exports.inferDepartmentCampus = campuses => {
  const unique = [...new Set(campuses.filter(campus => validCampuses.has(campus)))];
  return unique.length === 1 ? unique[0] : undefined;
};
