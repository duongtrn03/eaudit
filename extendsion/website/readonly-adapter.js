export function installReadonlyAdapter(editor, getQuestionId, options = {}) {
  if (!editor || typeof editor.updateOptions !== 'function') {
    return () => {};
  }

  const {dismissSuggestionsHotkey = 'ctrl+option+shift+l'} = options;

  const applyReadOnlyState = () => {
    const questionId = typeof getQuestionId === 'function' ? getQuestionId() : undefined;
    const isReadOnly = questionId === undefined || questionId === null || questionId === '';
    editor.updateOptions({readOnly: isReadOnly});
  };

  const dismissSuggestions = () => {
    if (typeof editor.trigger === 'function') {
      editor.trigger('readonly-adapter', 'hideSuggestWidget', null);
    }
  };

  const handleEditorChange = () => {
    if (!editor.getRawOptions || typeof editor.getRawOptions !== 'function') {
      return;
    }
    const rawOptions = editor.getRawOptions();
    if (rawOptions && rawOptions.readOnly) {
      return;
    }
    applyReadOnlyState();
  };

  const listeners = [
    typeof editor.onDidChangeModelContent === 'function' ? editor.onDidChangeModelContent(handleEditorChange) : null,
    typeof editor.onDidFocusEditorText === 'function' ? editor.onDidFocusEditorText(applyReadOnlyState) : null,
    typeof editor.onDidBlurEditorText === 'function' ? editor.onDidBlurEditorText(applyReadOnlyState) : null,
  ].filter(Boolean);

  if (typeof editor.addCommand === 'function' && dismissSuggestionsHotkey) {
    const parsed = String(dismissSuggestionsHotkey).toLowerCase();
    const isCtrlOptionShiftL = parsed.includes('ctrl') && parsed.includes('option') && parsed.includes('shift') && parsed.includes('l');
    if (isCtrlOptionShiftL) {
      editor.addCommand(0, dismissSuggestions);
    }
  }

  applyReadOnlyState();

  return () => {
    listeners.forEach((listener) => listener && typeof listener.dispose === 'function' && listener.dispose());
  };
}

export default installReadonlyAdapter;
