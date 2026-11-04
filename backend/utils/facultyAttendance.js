exports.averageAttendance = ({ presentTotal, studentTotal, totalDays }) => {
  if (!totalDays || !studentTotal) return null;
  return {
    present: Math.round(presentTotal / totalDays * 10) / 10,
    total: Math.round(studentTotal / totalDays * 10) / 10,
    percentage: Math.round(presentTotal / studentTotal * 1000) / 10
  };
};
