const XLSX = require('@e965/xlsx');
const { fail } = require('./helpers');

exports.excelRows = buffer => {
  const isZip = Buffer.isBuffer(buffer) && buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isLegacyExcel = Buffer.isBuffer(buffer) && buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (!isZip && !isLegacyExcel) {
    throw fail(400, 'Invalid Excel workbook.');
  }
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', dense: true, sheetRows: 501 });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) throw fail(400, 'The Excel workbook has no worksheets.');
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
      header: 1, raw: false, defval: '', blankrows: false
    });
    if (!rows.length) throw fail(400, 'The first worksheet is empty.');
    if (rows.length > 501 || rows.some(row => row.length > 50)) {
      throw fail(400, 'Excel files can contain up to 500 data rows and 50 columns.');
    }
    return rows.map(row => row.map(value => String(value).trim()));
  } catch (error) {
    if (error.status) throw error;
    throw fail(400, 'Could not read the Excel workbook. Please upload a valid .xlsx file.');
  }
};

exports.spreadsheetRows = (buffer, extension) => {
  if (extension === '.csv') {
    const text = buffer.toString('utf8').replace(/^\ufeff/, '');
    const delimiter = (() => {
      const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
      let quoted = false;
      for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (char === '"' && quoted && text[index + 1] === '"') index++;
        else if (char === '"') quoted = !quoted;
        else if ((char === '\n' || char === '\r') && !quoted) break;
        else if (!quoted && Object.hasOwn(counts, char)) counts[char]++;
      }
      return Object.keys(counts).reduce((best, candidate) => counts[candidate] > counts[best] ? candidate : best, ',');
    })();
    const rows = [];
    let cells = [], value = '', quoted = false;
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index++; }
      else if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) { cells.push(value); value = ''; }
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[index + 1] === '\n') index++;
        cells.push(value);
        if (cells.some(cell => cell.trim())) rows.push(cells);
        cells = [];
        value = '';
      } else value += char;
    }
    cells.push(value);
    if (cells.some(cell => cell.trim())) rows.push(cells);
    if (!rows.length) throw fail(400, 'The uploaded file is empty.');
    if (rows.some(row => row.length > 200)) throw fail(400, 'Files can contain up to 200 columns to preview or edit.');
    return rows;
  }

  const isZip = Buffer.isBuffer(buffer) && buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isLegacyExcel = Buffer.isBuffer(buffer) && buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (!isZip && !isLegacyExcel) throw fail(400, 'Invalid Excel workbook.');
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', dense: true });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) throw fail(400, 'The Excel workbook has no worksheets.');
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
      header: 1, raw: false, defval: '', blankrows: false
    }).map(row => row.map(value => String(value)));
    if (!rows.length) throw fail(400, 'The first worksheet is empty.');
    if (rows.some(row => row.length > 200)) throw fail(400, 'Files can contain up to 200 columns to preview or edit.');
    return rows;
  } catch (error) {
    if (error.status) throw error;
    throw fail(400, 'Could not read the Excel workbook. Please upload a valid .xls or .xlsx file.');
  }
};

exports.writeSpreadsheetRows = (rows, extension) => {
  if (extension === '.csv') {
    return Buffer.from(rows.map(row => row.map(value => {
      const cell = String(value ?? '');
      return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
    }).join(',')).join('\r\n'), 'utf8');
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(workbook, { type: 'buffer', bookType: extension === '.xls' ? 'xls' : 'xlsx' });
};
