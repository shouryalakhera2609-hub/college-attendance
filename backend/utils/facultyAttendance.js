exports.averageAttendance = ({ presentTotal, studentTotal, totalDays }) => {
  if (!totalDays || !studentTotal) return null;
  return {
    present: Math.round(presentTotal / totalDays * 10) / 10,
    total: Math.round(studentTotal / totalDays * 10) / 10,
    percentage: Math.round(presentTotal / studentTotal * 1000) / 10
  };
};
exports.averageRecentAttendance = (histories, legacyRosterSize, limit = 3) => {
  const recent = [...histories]
    .sort((a, b) => String(b.date).localeCompare(String(a.date))
      || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
  const presentTotal = recent.reduce((total, history) => total + history.students.length, 0);
  const studentTotal = recent.reduce(
    (total, history) => total + (history.totalStudents ?? legacyRosterSize),
    0
  );
  return exports.averageAttendance({
    presentTotal,
    studentTotal,
    totalDays: recent.length
  });
};
exports.averageOfSubjectPercentages = percentages => {
  const values = percentages.filter(value => Number.isFinite(value));
  if (!values.length) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length * 10) / 10;
};
exports.averageAttendanceBySection = (histories, roster, limit = 3) => {
  const recent = [...histories]
    .sort((a, b) => String(b.date).localeCompare(String(a.date))
      || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
  const rosterById = new Map(roster.map(student => [String(student.id || student._id), student]));
  const sectionsByRollNo = new Map();
  roster.forEach(student => {
    const rollNo = String(student.rollNo || '').trim().toLowerCase();
    if (!rollNo) return;
    if (!sectionsByRollNo.has(rollNo)) sectionsByRollNo.set(rollNo, new Set());
    sectionsByRollNo.get(rollNo).add(student.attendanceSection);
  });
  return Object.fromEntries(['Birt', 'Birts'].map(section => {
    const sectionSize = roster.filter(student => student.attendanceSection === section).length;
    if (!recent.length || !sectionSize) return [section, null];
    const presentTotal = recent.reduce((total, history) => total + history.students.filter(student => {
      const currentStudent = rosterById.get(String(student.id));
      const rollNo = String(student.rollNo || '').trim().toLowerCase();
      const rollSections = rollNo ? sectionsByRollNo.get(rollNo) : null;
      const sectionFromRollNo = rollSections?.size === 1 ? [...rollSections][0] : undefined;
      return (student.attendanceSection || currentStudent?.attendanceSection || sectionFromRollNo) === section;
    }).length, 0);
    return [section, exports.averageAttendance({
      presentTotal,
      studentTotal: sectionSize * recent.length,
      totalDays: recent.length
    })];
  }));
};
