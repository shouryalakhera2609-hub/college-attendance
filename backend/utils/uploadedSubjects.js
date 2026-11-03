const { spreadsheetRows } = require('./excel');

const normalize = value => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const branchTokens = value => {
  const tokens = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(token => token === 'ds' ? 'datascience' : token === 'aiml' ? 'aiml' : token);
  return tokens.flatMap((token, index) => token === 'data' && tokens[index + 1] === 'science'
    ? (tokens[index - 1] === 'data' ? [] : ['datascience'])
    : token === 'science' && tokens[index - 1] === 'data' ? [] : [token]);
};

const semesterNumber = value => {
  const match = String(value ?? '').match(/\d+/);
  return match ? Number(match[0]) : NaN;
};

const branchMatches = (rowBranch, branch) => {
  const rowTokens = branchTokens(rowBranch);
  const studentBranchTokens = branchTokens(branch);
  if (!studentBranchTokens.length || studentBranchTokens.length > rowTokens.length) return false;
  return rowTokens.some((_, index) =>
    studentBranchTokens.every((token, offset) => rowTokens[index + offset] === token)
  );
};

exports.uploadedSubjectsFromFiles = ({ files, branch, semester } = {}) => {
  const subjects = new Map();
  for (const file of files) {
    const extension = file.fileName.slice(file.fileName.lastIndexOf('.')).toLowerCase();
    let rows;
    try {
      rows = spreadsheetRows(file.content, extension);
    } catch (error) {
      if (error.status !== 400) throw error;
      console.warn(`Skipping unreadable HOD upload "${file.fileName}" in the student subject list: ${error.message}`);
      continue;
    }
    if (!rows.length) continue;

    const headerIndex = rows.slice(0, 10).findIndex(row => {
      const headers = row.map(value => normalize(value));
      return headers.some(value => ['code', 'subjectcode', 'coursecode', 'papercode'].includes(value))
        && headers.some(value => ['semester', 'semesternumber', 'sem', 'term'].includes(value));
    });
    if (headerIndex < 0) continue;

    const headers = rows[headerIndex].map(value => normalize(value));
    const codeIndex = headers.findIndex(value => ['code', 'subjectcode', 'coursecode', 'papercode'].includes(value));
    const semesterIndex = headers.findIndex(value => ['semester', 'semesternumber', 'sem', 'term'].includes(value));
    const branchIndex = headers.findIndex(value => ['branch', 'department', 'departmentname', 'course', 'stream'].includes(value));
    const nameIndex = headers.findIndex(value => ['name', 'subject', 'subjectname', 'coursename', 'title'].includes(value));
    if (codeIndex < 0 || semesterIndex < 0) continue;

    for (const row of rows.slice(headerIndex + 1)) {
      const code = String(row[codeIndex] ?? '').trim();
      const rowBranch = branchIndex < 0 ? '' : String(row[branchIndex] ?? '').trim();
      const rowSemester = semesterNumber(row[semesterIndex]);
      if (!code || (semester != null && rowSemester !== semester) || (branch && branchIndex >= 0 && !branchMatches(rowBranch, branch))) continue;
      const key = normalize(code);
      if (!subjects.has(key)) subjects.set(key, {
        code,
        name: nameIndex < 0 ? '' : String(row[nameIndex] ?? '').trim(),
        ...(file.department?.name ? { department: file.department.name } : {}),
        semester: rowSemester
      });
    }
  }
  return [...subjects.values()].sort((a, b) => a.code.localeCompare(b.code));
};

exports.uploadedSubjectsForStudent = exports.uploadedSubjectsFromFiles;
