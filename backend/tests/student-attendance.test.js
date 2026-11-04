const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeFacultySubjectHistory } = require('../utils/studentAttendance');

test('faculty subject history contributes present and absent classes to student summaries', () => {
  const summary = {
    threshold: 75,
    overall: { present: 2, absent: 0, total: 2, percentage: 100 },
    subjects: [{
      id: 'existing-subject',
      code: 'CD-501',
      name: 'Existing subject',
      present: 2,
      absent: 0,
      excused: 0,
      total: 2,
      percentage: 100,
      low: false
    }]
  };
  const histories = [
    { code: 'CD-501', date: '2026-10-31', students: [{ id: 'student-1' }] },
    { code: 'CD-501', date: '2026-10-30', students: [] },
    { code: 'CD-502', date: '2026-11-01', students: [] },
    { code: 'CD-999', date: '2026-11-02', students: [] }
  ];
  const uploadedSubjects = [
    { code: 'CD-501', name: 'Existing subject' },
    { code: 'CD-502', name: 'New subject' }
  ];

  mergeFacultySubjectHistory(
    summary,
    histories,
    uploadedSubjects,
    'student-1'
  );

  assert.deepEqual(summary.overall, { present: 3, absent: 2, total: 5, percentage: 60 });
  assert.equal(summary.subjects.length, 2);
  assert.equal(uploadedSubjects[0].presentClasses, 3);
  assert.equal(uploadedSubjects[0].totalClasses, 4);
  assert.equal(uploadedSubjects[1].presentClasses, 0);
  assert.equal(uploadedSubjects[1].totalClasses, 1);
  assert.equal(summary.subjects.find(subject => subject.code === 'CD-501').total, 4);
  assert.equal(summary.subjects.find(subject => subject.code === 'CD-501').percentage, 75);
  assert.deepEqual(
    summary.subjects.find(subject => subject.code === 'CD-502'),
    {
      id: 'CD-502',
      code: 'CD-502',
      name: 'New subject',
      present: 0,
      absent: 1,
      excused: 0,
      total: 1,
      percentage: 0,
      low: true
    }
  );
});

test('faculty history is included in recent attendance with the matching status', () => {
  const summary = { threshold: 75, overall: { present: 0, absent: 0, total: 0, percentage: null }, subjects: [], recent: [] };

  mergeFacultySubjectHistory(
    summary,
    [{ code: 'CD-501', date: '2026-11-01', students: [{ id: 'student-1' }] }],
    [{ code: 'CD-501', name: 'Subject 501' }],
    'student-1'
  );

  assert.equal(summary.recent.length, 1);
  assert.equal(summary.recent[0].status, 'present');
  assert.equal(summary.recent[0].subject.code, 'CD-501');
});
