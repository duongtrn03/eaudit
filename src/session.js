const key = 'eaudit.exam';
export function readSession() {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null'); }
  catch { return null; }
}
export function writeSession(value) { sessionStorage.setItem(key, JSON.stringify(value)); }
export function startSession(duration = 3600, recordingMode='s3',capture='mock') {
  const value = {id: crypto.randomUUID(), deadline: Date.now() + duration * 1000,
    recordingMode,capture, answers: {}, language: 'java', index: 0, violations: 0, initialized: false, submitted: false, locked: false};
  writeSession(value);
  return value;
}
export function clearSession() { sessionStorage.removeItem(key); }
export function readStudent() {
  try { return JSON.parse(sessionStorage.getItem('student') || 'null'); }
  catch { return null; }
}
