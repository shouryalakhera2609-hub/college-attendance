export function parseCsvRows(text) {
  const delimiters = [',', ';', '\t', '|'];
  const counts = Object.fromEntries(delimiters.map(delimiter => [delimiter, 0]));
  let quotedHeader = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && quotedHeader && text[i + 1] === '"') i++;
    else if (char === '"') quotedHeader = !quotedHeader;
    else if ((char === '\n' || char === '\r') && !quotedHeader) break;
    else if (!quotedHeader && Object.hasOwn(counts, char)) counts[char]++;
  }
  const delimiter = delimiters.reduce((best, candidate) => counts[candidate] > counts[best] ? candidate : best, ',');
  const rows = [];
  let cells = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { cells.push(value.trim()); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      cells.push(value.trim());
      if (cells.some(Boolean)) rows.push(cells);
      cells = [];
      value = '';
    } else value += char;
  }
  cells.push(value.trim());
  if (cells.some(Boolean)) rows.push(cells);
  return rows;
}
