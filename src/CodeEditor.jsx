import React, {useState, useRef} from 'react';
import {installReadonlyAdapter} from '../extendsion/website/readonly-adapter';
import Editor, {loader} from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import {registerRecordedSnippets, knownSnippetPattern} from './recorded-snippets';
import {insertionMonitor} from './anti-cheat';
import groups from './snippet-guide.json';
self.MonacoEnvironment = {getWorker(_id, label) {
 if (['javascript', 'typescript'].includes(label)) return new TsWorker();
 if (label === 'html') return new HtmlWorker();
 if (label === 'css') return new CssWorker();
 if (label === 'json') return new JsonWorker();
 return new EditorWorker();
}};
loader.config({monaco});
const languages = [['java','Java'], ['sql','SQL'], ['html','HTML / Bootstrap 5'],
 ['css','CSS'], ['javascript','JavaScript'], ['plaintext','Plain Text']];
const options = {
 fontSize: 16, lineHeight: 1.8,
 fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, 'Courier New', monospace",
 fontLigatures: true, minimap: {enabled: false}, wordWrap: 'on',
 quickSuggestions: {other: true, comments: false, strings: true},
 suggestOnTriggerCharacters: true, acceptSuggestionOnEnter: 'on', tabCompletion: 'on',
 parameterHints: {enabled: true}, fixedOverflowWidgets: true, tabSize: 4, insertSpaces: true,
 formatOnType: true, formatOnPaste: false, autoIndent: 'full', scrollBeyondLastLine: false,
 smoothScrolling: true, cursorBlinking: 'smooth', cursorSmoothCaretAnimation: 'on',
 renderLineHighlight: 'all', bracketPairColorization: {enabled: true},
 guides: {bracketPairs: true, indentation: true}, emptySelectionClipboard: false,
 copyWithSyntaxHighlighting: false, dragAndDrop: false, lineNumbers: 'on', glyphMargin: false, folding: true,
};
export default function CodeEditor({sessionId, questionId, language, onLanguage, value, onChange, disabled, onClipboard, onViolation}) {
 const [guide, setGuide] = useState(false);
 const currentQuestion = useRef(questionId);
 currentQuestion.current = questionId;
 const violationCallback = useRef(onViolation);
 violationCallback.current=onViolation;
 function mount(editor, instance) {
  const controlKey = /Mac/.test(navigator.platform) ? instance.KeyMod.WinCtrl : instance.KeyMod.CtrlCmd;
  editor.addCommand(controlKey | instance.KeyMod.Alt | instance.KeyMod.Shift | instance.KeyCode.KeyL,
   () => editor.trigger('mock-exam-input', 'hideSuggestWidget', null));
  installReadonlyAdapter(editor, () => currentQuestion.current, {dismissSuggestionsHotkey: 'ctrl+option+shift+l'});
  for (const [key, action] of [['KeyC','copy'], ['KeyX','cut'], ['KeyV','paste']]) {
   editor.addCommand(instance.KeyMod.CtrlCmd | instance.KeyCode[key], () => onClipboard(action));
  }
  for (const action of ['Copy', 'Cut', 'Paste']) {
   editor.addAction({id: 'editor.action.clipboard' + action + 'Action', label: action + ' (disabled)', run: () => onClipboard(action.toLowerCase())});
  }
  for(const [binding,action] of [[instance.KeyMod.Shift|instance.KeyCode.Delete,'cut'],[instance.KeyMod.CtrlCmd|instance.KeyCode.Insert,'copy'],[instance.KeyMod.Shift|instance.KeyCode.Insert,'paste']])editor.addCommand(binding,()=>onClipboard(action));
  const monitor=insertionMonitor((...args)=>violationCallback.current?.(...args));
  let undoing=false;
  editor.onDidChangeModelContent(event=>{
   if(undoing||event.isFlush||event.isUndoing||event.isRedoing||editor.getRawOptions().readOnly)return;
   const texts=event.changes.map(change=>change.text).filter(Boolean);
   const large=texts.find(text=>text.length>=300&&!knownSnippetPattern(text,instance));
   if(large){
    undoing=true;editor.trigger('anti-cheat','undo',null);undoing=false;
    violationCallback.current?.('suspicious_paste',{contentPreview:large.slice(0,500),textLength:large.length,questionId:currentQuestion.current});
    return;
   }
   monitor(texts.filter(text=>!knownSnippetPattern(text,instance)),currentQuestion.current);
  });
  editor.focus();
 }
 return <div className="code-editor-wrapper">
  <div className="code-editor-toolbar">
   <label htmlFor="editor-language" className="code-editor-toolbar-label">Language:</label>
   <select id="editor-language" className="code-editor-lang-select" title="Select coding language for syntax highlighting"
    disabled={disabled} value={language} onChange={e => onLanguage(e.target.value)}>
    {languages.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
   </select>
   <button type="button" className={'code-editor-guide-btn' + (guide ? ' active' : '')}
    title="IntelliSense Prefix Reference — click to toggle" aria-expanded={guide} onClick={() => setGuide(!guide)}>📖 IntelliSense Guide</button>
   <span className="code-editor-hint">💡 Press <kbd>Ctrl</kbd>+<kbd>Space</kbd> to trigger suggestions</span>
  </div>
  {guide && <div className="code-editor-guide">
   <div className="code-editor-guide-header"><strong>📖 IntelliSense Prefix Reference</strong>
    <p className="code-editor-guide-desc">Type the correct <strong>prefix</strong> below, then press <kbd>Ctrl</kbd>+<kbd>Space</kbd> to see suggestions.<br/>
     <strong>Java:</strong> <code>str.</code>, <code>list.</code>, <code>ldt.</code>, <code>ScannerStdin</code>, <code>JDBC Connect</code>...<br/>
     <strong>HTML/BS5:</strong> <code>html5</code>, <code>navbar</code>, <code>card</code>, <code>modal</code>, <code>form-bs</code>, <code>table-bs</code>...<br/>
     <strong>CSS:</strong> <code>flex-center</code>, <code>grid-2col</code>, <code>@media-md</code>...<br/>
     <strong>JavaScript:</strong> <code>querySelector</code>, <code>addEventListener</code>, <code>Array-map</code>, <code>fetch-get</code>...</p>
   </div>
   <div className="code-editor-guide-groups">{groups.map(group => <div key={group.group} className="code-editor-guide-group">
    <div className="code-editor-guide-group-title">{group.group}</div>
    <table className="code-editor-guide-table"><thead><tr><th>Prefix / Snippet</th><th>Represents</th></tr></thead>
     <tbody>{group.rows.map(([prefix,description]) => <tr key={prefix}><td><code>{prefix}</code></td><td>{description}</td></tr>)}</tbody>
    </table>
   </div>)}</div>
  </div>}
  <div className="code-editor-container" onDrop={e => {e.preventDefault(); onClipboard('paste');}} onDragOver={e => e.preventDefault()}>
   <Editor height="550px" theme="vs-dark" path={`exam-${sessionId}/question-${questionId}`} language={language}
    defaultValue={value} onChange={v => onChange(v || '')} beforeMount={registerRecordedSnippets} onMount={mount}
    options={{...options, readOnly: disabled}} loading={<div className="code-editor-loading"><span>Loading editor...</span></div>}/>
  </div>
 </div>;
}
