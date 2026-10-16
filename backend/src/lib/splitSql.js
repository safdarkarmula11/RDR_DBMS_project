// Splits a .sql file into single statements. Understands "DELIMITER xx" lines
// (needed for stored procedures, functions, triggers, events) like the mysql CLI does.
export function splitSql(text) {
  const out = [];
  let delimiter = ';';
  let buf = [];

  const flush = () => {
    const stmt = buf.join('\n').trim();
    if (stmt) out.push(stmt);
    buf = [];
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = line.match(/^DELIMITER\s+(\S+)\s*$/i);
    if (m) { flush(); delimiter = m[1]; continue; }
    if (buf.length === 0 && (line === '' || line.startsWith('--'))) continue;

    if (line.startsWith('--')) { buf.push(rawLine); continue; }   // comment line inside a statement
    buf.push(rawLine);
    // strip trailing line comment before checking the delimiter
    const noComment = line.replace(/\s+--\s.*$/, '').trimEnd();
    if (noComment.endsWith(delimiter)) {
      const joined = buf.join('\n');
      const idx = joined.lastIndexOf(delimiter);
      const stmt = joined.slice(0, idx).trim();
      buf = [];
      if (stmt) out.push(stmt);
    }
  }
  flush();
  return out;
}
