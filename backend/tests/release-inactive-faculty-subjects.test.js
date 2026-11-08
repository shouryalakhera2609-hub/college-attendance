const test = require('node:test');
const assert = require('node:assert/strict');
const releaseInactiveFacultySubjects = require('../utils/releaseInactiveFacultySubjects');

test('claimed database and uploaded subjects are removed from inactive faculty', () => {
  const member = {
    campus: 'BIRT',
    savedSubjects: ['subject-a', 'subject-b'],
    savedSubjectCampuses: [
      { catalogId: 'BIRT:subject:subject-a', campus: 'BIRT' },
      { catalogId: 'BIRT:subject:subject-b', campus: 'BIRT' }
    ],
    savedUploadedSubjects: [
      { catalogId: 'BIRT:upload:cd-501', campus: 'BIRT', code: 'CD-501' },
      { catalogId: 'BIRT:upload:cd-502', campus: 'BIRT', code: 'CD-502' }
    ]
  };

  const updated = releaseInactiveFacultySubjects(member, 'BIRT', [
    'BIRT:subject:subject-a',
    'BIRT:upload:cd-501'
  ]);

  assert.deepEqual(updated.savedSubjectCampuses, [
    { catalogId: 'BIRT:subject:subject-b', campus: 'BIRT' }
  ]);
  assert.deepEqual(updated.savedSubjects, ['subject-b']);
  assert.deepEqual(updated.savedUploadedSubjects.map(subject => subject.catalogId), ['BIRT:upload:cd-502']);
  assert.equal(updated.changed, true);
});

test('claiming one campus mapping preserves the same database subject in another campus', () => {
  const member = {
    campus: 'BIRT',
    savedSubjects: ['subject-a'],
    savedSubjectCampuses: [
      { catalogId: 'BIRT:subject:subject-a', campus: 'BIRT' },
      { catalogId: 'BIRTS:subject:subject-a', campus: 'BIRTS' }
    ],
    savedUploadedSubjects: []
  };

  const updated = releaseInactiveFacultySubjects(member, 'BIRT', ['BIRT:subject:subject-a']);

  assert.deepEqual(updated.savedSubjectCampuses, [
    { catalogId: 'BIRTS:subject:subject-a', campus: 'BIRTS' }
  ]);
  assert.deepEqual(updated.savedSubjects, ['subject-a']);
});

test('unclaimed subjects remain saved and reactivation has no restoration behavior', () => {
  const member = {
    campus: 'BIST',
    savedSubjects: ['subject-a'],
    savedSubjectCampuses: [{ catalogId: 'BIST:subject:subject-a', campus: 'BIST' }],
    savedUploadedSubjects: [{ catalogId: 'BIST:upload:cd-501', campus: 'BIST' }]
  };

  const updated = releaseInactiveFacultySubjects(member, 'BIST', ['BIST:upload:cd-502']);

  assert.equal(updated.changed, false);
  assert.deepEqual(updated.savedSubjects, member.savedSubjects);
  assert.deepEqual(updated.savedUploadedSubjects, member.savedUploadedSubjects);
});
