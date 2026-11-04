exports.averageAttendance = ({ presentTotal, studentTotal, totalDays }) => {
  if (!totalDays || !studentTotal) return null;
  return {
    present: Math.round(presentTotal / totalDays * 10) / 10,
    total: Math.round(studentTotal / totalDays * 10) / 10,
    percentage: Math.round(presentTotal / studentTotal * 1000) / 10
  };
};
exports.averageRecentAttendance = (histories, legacyRosterSize, limit = 5) => {
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
