export function extractProductUrl(log = '') {
  if (!log) return null;
  const matches = [...log.matchAll(/Product URL:\s*(https?:\/\/\S+)/gi)];
  const m = matches[matches.length - 1];
  return m ? m[1].trim() : null;
}

export function extractPrintifyUrl(status = '') {
  if (!status) return null;
  const m = status.match(/Printify URL:\s*(\S+)/i);
  return m ? m[1].trim() : null;
}

export function extractUpdatedTitle(log = '') {
  if (!log) return null;
  // use a global regex so matchAll retrieves all occurrences
  const matches = [...log.matchAll(/Updated Title:\s*(.+)/gi)];
  const m = matches[matches.length - 1];
  return m ? m[1].trim() : null;
}
