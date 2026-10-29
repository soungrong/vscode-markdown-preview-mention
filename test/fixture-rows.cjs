const EXPECTED_ROW = /^\d+\. (Select|Drag from|Triple-click) "([^"]+)"(?: to "([^"]+)")?.*: `#(\d+)(?:-(\d+))?`\.$/;

function expectedRows(source) {
  return source.split('\n').map((line) => line.match(EXPECTED_ROW)).filter(Boolean).map((match) => ({
    action: match[1],
    from: match[2],
    to: match[3] ?? match[2],
    expected: match[5] ? `#${match[4]}-${match[5]}` : `#${match[4]}`,
  }));
}

module.exports = { expectedRows };
