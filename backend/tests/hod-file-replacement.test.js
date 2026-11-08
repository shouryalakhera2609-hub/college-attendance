const test = require('node:test');
const assert = require('node:assert/strict');
const spreadsheetDiff = require('../utils/spreadsheetDiff');

test('replacement diff identifies added, removed, and changed rows', () => {
  const previous = [
    ['Branch', 'Semester', 'Subject Code'],
    ['CSE', '5th', 'CD-501'],
    ['CSE', '5th', 'CD-502']
  ];
  const next = [
    ['Branch', 'Semester', 'Subject Code'],
    ['CSE', '5th', 'CD-501'],
    ['CSE', '6th', 'CD-503']
  ];

  assert.deepEqual(spreadsheetDiff(previous, next), { added: 1, removed: 1 });
});

test('replacement diff accounts for duplicate rows without losing retained copies', () => {
  assert.deepEqual(spreadsheetDiff(
    [['Header'], ['A'], ['A'], ['B']],
    [['Header'], ['A'], ['C'], ['C']]
  ), { added: 2, removed: 2 });
});
