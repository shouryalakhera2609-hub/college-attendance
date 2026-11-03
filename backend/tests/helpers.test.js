const test = require('node:test'), assert = require('node:assert');
const { csvCell, pct } = require('../utils/helpers');
const XLSX = require('@e965/xlsx'), { excelRows, spreadsheetRows, writeSpreadsheetRows } = require('../utils/excel');
const { planClassSync } = require('../utils/classSync');
const { planSubjectSync } = require('../utils/subjectSync');
test('csv escapes quotes and blocks formula injection', () => { assert.strictEqual(csvCell('=1+1'), "'=1+1"); assert.strictEqual(csvCell('a,"b"'), '"a,""b"""'); });
test('percentage ignores zero totals', () => { assert.strictEqual(pct(0, 0), null); assert.strictEqual(pct(3, 1), 75); });
test('Excel upload parser reads the first worksheet as rows', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Class', 'Department'], ['A', 'Science']]), 'Classes');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  assert.deepStrictEqual(excelRows(buffer), [['Class', 'Department'], ['A', 'Science']]);
});
test('Excel upload parser reads legacy XLS workbooks', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Code', 'Subject'], ['CS1', 'Computer Science']]), 'Subjects');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xls' });
  assert.deepStrictEqual(excelRows(buffer), [['Code', 'Subject'], ['CS1', 'Computer Science']]);
});
test('Excel upload parser rejects non-workbook data', () => {
  assert.throws(() => excelRows(Buffer.from('not an Excel file')), /Invalid Excel workbook/);
});
test('generic CSV preview and edit preserve quoted delimiters and whitespace', () => {
  const rows = spreadsheetRows(Buffer.from('"A; B"; C\r\n"  keep spaces  ";"a,b"\r\n'), '.csv');
  assert.deepStrictEqual(rows, [['A; B', ' C'], ['  keep spaces  ', 'a,b']]);
  const updated = writeSpreadsheetRows(rows, '.csv');
  assert.deepStrictEqual(spreadsheetRows(updated, '.csv'), rows);
});
test('generic spreadsheet editing round-trips XLS and XLSX', () => {
  for (const extension of ['.xls', '.xlsx']) {
    const updated = writeSpreadsheetRows([['Column 1', 'Column 2'], ['Value', 'Edited']], extension);
    assert.deepStrictEqual(spreadsheetRows(updated, extension), [['Column 1', 'Column 2'], ['Value', 'Edited']]);
  }
});
test('class CSV sync preserves duplicate rows and removes only excess copies', () => {
  const existing = [
    { _id: 'one', name: 'A', department: 'dept', semester: 'sem' },
    { _id: 'two', name: 'A', department: 'dept', semester: 'sem' },
    { _id: 'old', name: 'B', department: 'dept', semester: 'sem' }
  ];
  const desired = [
    { name: 'A', department: 'dept', semester: 'sem' },
    { name: 'A', department: 'dept', semester: 'sem' },
    { name: 'C', department: 'dept', semester: 'sem' }
  ];
  const plan = planClassSync(existing, desired);
  assert.strictEqual(plan.retained, 2);
  assert.deepStrictEqual(plan.toCreate, [{ name: 'C', department: 'dept', semester: 'sem' }]);
  assert.deepStrictEqual(plan.desiredSectionIds, ['two', 'one', null]);
  assert.deepStrictEqual(plan.obsoleteIds, ['old']);
});
test('class CSV sync marks removed duplicate class rows for deletion', () => {
  const existing = [
    { _id: 'linked', name: 'A', department: 'dept', semester: 'sem' },
    { _id: 'unlinked', name: 'A', department: 'dept', semester: 'sem' }
  ];
  const plan = planClassSync(existing, [{ name: 'A', department: 'dept', semester: 'sem' }]);
  assert.strictEqual(plan.retained, 1);
  assert.deepStrictEqual(plan.desiredSectionIds, ['unlinked']);
  assert.deepStrictEqual(plan.obsoleteIds, ['linked']);
});
test('class CSV sync keys otherwise identical classes by campus', () => {
  const existing = [{ _id: 'birt', name: 'CSE-A', department: 'dept', semester: 'sem', campus: 'BIRT' }];
  const plan = planClassSync(existing, [{ name: 'CSE-A', department: 'dept', semester: 'sem', campus: 'BIST' }]);
  assert.deepStrictEqual(plan.toCreate, [{ name: 'CSE-A', department: 'dept', semester: 'sem', campus: 'BIST' }]);
  assert.deepStrictEqual(plan.obsoleteIds, ['birt']);
});
test('subject CSV sync preserves duplicate rows and removes subjects missing from the file', () => {
  const existing = [
    { _id: 'one', code: 'CS1', name: 'Programming', semester: 'sem1' },
    { _id: 'two', code: 'CS1', name: 'Programming', semester: 'sem1' },
    { _id: 'old', code: 'CS2', name: 'Math', semester: 'sem1' }
  ];
  const desired = [
    { code: 'CS1', name: 'Programming', department: 'dept', semester: 'sem1' },
    { code: 'CS1', name: 'Programming', department: 'dept', semester: 'sem1' },
    { code: 'CS3', name: 'Data', department: 'dept', semester: 'sem1' }
  ];
  const plan = planSubjectSync(existing, desired);
  assert.strictEqual(plan.retained, 2);
  assert.deepStrictEqual(plan.desiredSubjectIds, ['two', 'one', null]);
  assert.deepStrictEqual(plan.toCreate, [{ code: 'CS3', name: 'Data', department: 'dept', semester: 'sem1' }]);
  assert.deepStrictEqual(plan.obsoleteIds, ['old']);
});
test('subject CSV sync marks removed duplicate subject rows for deletion', () => {
  const existing = [
    { _id: 'linked', code: 'CS1', name: 'Programming', semester: 'sem1' },
    { _id: 'unlinked', code: 'CS1', name: 'Programming', semester: 'sem1' }
  ];
  const plan = planSubjectSync(existing, [{ code: 'CS1', name: 'Programming', department: 'dept', semester: 'sem1' }]);
  assert.strictEqual(plan.retained, 1);
  assert.deepStrictEqual(plan.desiredSubjectIds, ['unlinked']);
  assert.deepStrictEqual(plan.obsoleteIds, ['linked']);
});
