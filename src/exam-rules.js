export function clipboardAction(event) {
  if (event.type !== 'keydown') return ['copy', 'cut', 'paste'].includes(event.type) ? event.type : null;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
    return {c: 'copy', x: 'cut', v: 'paste', insert: 'copy'}[key] || null;
  }
  if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    return {insert: 'paste', delete: 'cut'}[key] || null;
  }
  return null;
}
export function violationDecision(previousCount) {
  const count = previousCount + 1;
  return {count, shouldSubmit: count > 1};
}
export function answerPayload(answers) {
  return Object.entries(answers).map(([question_order, answer]) => ({question_order: Number(question_order), answer}));
}
