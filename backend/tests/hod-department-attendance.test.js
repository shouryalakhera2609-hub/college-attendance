const test = require('node:test');
const assert = require('node:assert/strict');
const { departmentOverall } = require('../utils/hodDepartmentAttendance');

test('department attendance counts only students in the active roster', () => {
  const roster = [
    { _id: 'student-1', rollNo: 'ROLL-1' },
    { _id: 'student-2', rollNo: 'ROLL-2' }
  ];
  const histories = [
    { students: [{ id: 'student-1' }, { id: 'inactive-student' }], totalStudents: 2 },
    { students: [{ id: 'old-id', rollNo: 'roll-2' }], totalStudents: 2 },
    { students: [{ id: 'student-1' }], totalStudents: 2 }
  ];

  assert.deepEqual(departmentOverall(roster, histories), {
    present: 1,
    total: 2,
    percentage: 50
  });
});

test('department attendance is empty when there are no matching histories', () => {
  assert.deepEqual(departmentOverall([], []), {
    present: 0,
    total: 0,
    percentage: null
  });
});
