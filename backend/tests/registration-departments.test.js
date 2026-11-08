const test = require('node:test');
const assert = require('node:assert/strict');
const uniqueUploadedDepartments = require('../utils/registrationDepartments');
const uniqueUploadedBranches = require('../utils/registrationBranches');

test('registration departments come from campus sections and duplicate names appear once', () => {
  const sections = [
    { department: { _id: 'dept-1', name: 'Computer Science', code: 'CS' } },
    { department: { _id: 'dept-1', name: 'Computer Science', code: 'CS' } },
    { department: { _id: 'dept-2', name: ' computer science ', code: 'CSE' } },
    { department: { _id: 'dept-3', name: 'Mechanical', code: 'ME' } }
  ];

  assert.deepEqual(uniqueUploadedDepartments(sections), [
    { _id: 'dept-1', name: 'Computer Science', code: 'CS' },
    { _id: 'dept-3', name: 'Mechanical', code: 'ME' }
  ]);
});

test('registration departments are empty when there are no uploaded classes', () => {
  assert.deepEqual(uniqueUploadedDepartments([]), []);
});

test('registration branches come from uploaded classes and duplicate names appear once', () => {
  assert.deepEqual(uniqueUploadedBranches([
    { branch: 'Mechanical (MECHANICAL)' },
    { branch: 'Mechanical (MECHANICAL)' },
    { branch: ' mechanical (mechanical) ' },
    { branch: 'DataScience' },
    { branch: '' },
    {}
  ]), ['DataScience', 'Mechanical (MECHANICAL)']);
});
