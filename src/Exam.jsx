import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Navigate, useNavigate} from 'react-router-dom';
import CodeEditor from './CodeEditor';
import {recorderSession} from './exam-recorder';
import {api, reportViolation} from './api';
import {eventGate, installDetectors} from './anti-cheat';
import {Icon} from './Icons';
import {answerPayload, clipboardAction} from './exam-rules';
import {readSession, readStudent, writeSession} from './session';

export default function Exam() {
 const navigate = useNavigate();
 const [session, setSession] = useState(readSession);
 const student = readStudent();
 const latest = useRef(session);
 const [questions, setQuestions] = useState([]);
 const [loadingError, setLoadingError] = useState('');
 const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil(((session?.deadline || Date.now()) - Date.now()) / 1000)));
 const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
 const [fullscreenError, setFullscreenError] = useState('');
 const [notice, setNotice] = useState('');
 const [saveStatus, setSaveStatus] = useState('');
 const [submitting, setSubmitting] = useState(false);
 const [submitError, setSubmitError] = useState('');
 const submitInFlight = useRef(false);
 const submitRef = useRef();
 const clipboardRef = useRef();
 const reportRef = useRef();
 const gate = useRef(eventGate());
 const reportQueue = useRef(Promise.resolve());
 const [recordingInterrupted,setRecordingInterrupted] = useState(false);
 const [recordingMode,setRecordingMode] = useState('s3');
 const active = useRef(false);
 const saveTimer = useRef();
 const noticeTimer = useRef();
 const partIndex = useRef(session?.recordingPart || 1);
 const mounted = useRef(true);

 const updateSession = useCallback(patch => {
  const next = {...latest.current, ...patch};
  latest.current = next;
  writeSession(next);
  if (mounted.current) setSession(next);
  return next;
 }, []);

 const submit = useCallback(async (reason = 'manual') => {
  if (submitInFlight.current || latest.current?.submitted) return;
  submitInFlight.current = true;
  active.current = false;
  clearTimeout(saveTimer.current);
  clearTimeout(noticeTimer.current);
  setSubmitError('');
  setSubmitting(true);
  const snapshot = updateSession({locked: true, reason});
  const payload = answerPayload(snapshot.answers);
  try {
   // Freeze edits and submit the full latest payload immediately, without a confirmation or save round-trip.
   await api('exam/submit', {answers: payload, reason, violations: snapshot.violations});
   const recorder=recorderSession.current;
   if(recorder){await recorder.stop().catch(()=>{});recorderSession.current=null;}
   updateSession({submitted: true});
   try {
    await api('exam/recording-seal', {parts: [], mode: 'mock'});
   } catch (error) {console.error('[MOCK RECORDING]', error.message);}
   if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
   navigate('/submit', {replace: true});
  } catch (error) {
   submitInFlight.current = false;
   setSubmitting(false);
   setSubmitError('Could not submit the exam. Please retry. Your answers are retained.');
   if (reason === 'manual') {updateSession({locked: false}); active.current = true;}
  }
 }, [navigate, updateSession]);
 submitRef.current = submit;

 const onViolation = useCallback((type, metadata = {}) => {
  if (!active.current || latest.current?.locked || latest.current?.submitted || !gate.current(type)) return;
  const eventId = crypto.randomUUID();
  const event = {type,eventId,event_id:eventId,question_id:questions[latest.current.index]?.id,metadata};
  reportQueue.current = reportQueue.current.then(async () => {
   if(!active.current || latest.current.locked)return;
   try {
    const response = await reportViolation(event,()=>active.current&&!latest.current.locked);
    if(response.ignored||response.forensic_only||latest.current.submitted)return;
    updateSession({violations:response.violation_count, ...(response.locked?{locked:true,reason:type.endsWith('_attempt')&&['copy_attempt','cut_attempt','paste_attempt'].includes(type)?'clipboard_violation':'anti_cheat_violation'}:{})});
    if(response.locked){
     setNotice('Your exam is being automatically submitted after two violations.');
     void submitRef.current(latest.current.reason);
    } else {
     setNotice(`Warning: ${type.replaceAll('_',' ')}. This is violation ${response.violation_count}. After 2 violations, your exam will be locked and submitted.`);
     clearTimeout(noticeTimer.current);noticeTimer.current=setTimeout(()=>setNotice(''),5000);
    }
   } catch(error) {
    if(error.status===410)void submitRef.current(error.reason || 'anti_cheat_violation');
    else setNotice('Could not report violation after retries. Check the connection; this event has not been acknowledged.');
   }
  });
 },[questions,updateSession]);
 reportRef.current=onViolation;
 const onClipboard=useCallback(action=>reportRef.current(action+'_attempt'),[]);
 clipboardRef.current=onClipboard;

 useEffect(() => {
  mounted.current = true;
  if (!latest.current || !student || latest.current.submitted) return;
  let cancelled = false;
  (async () => {
   const first = await api('exam/questions');
   if (cancelled || latest.current.initialized) return first;
   const started=await api('exam/start', {student_id: student.studentId,recording_mode:latest.current.recordingMode,capture:latest.current.capture});
   if(!cancelled)setRecordingMode(started.recording_mode || 's3');
   const [data] = await Promise.all([api('exam/questions'), api('live/session', {mode: 'mock'})]);
   await api('exam/recording-url', {partIndex: 0, contentType: 'video/webm', mode: 'mock'});
   if (!cancelled) updateSession({initialized: true});
   return data;
  })().then(data => {
   if (cancelled) return;
   if (!data) return;
   setQuestions(data.questions);
   active.current = !latest.current.locked;
   if(recorderSession.current){recorderSession.current.report=(...args)=>reportRef.current(...args);recorderSession.current.onState=state=>{if(state==='interrupted')setRecordingInterrupted(true);};}
   if (latest.current.locked) void submitRef.current(latest.current.reason || 'clipboard_violation');
  }).catch(error => {if (!cancelled) setLoadingError(error.message);});
  return () => {recorderSession.current?.dispose();cancelled = true; mounted.current = false; active.current = false; clearTimeout(saveTimer.current); clearTimeout(noticeTimer.current);};
 }, []);

 useEffect(() => {
  if (!session || session.submitted) return;
  const tick = () => {
   const remaining = Math.max(0, Math.ceil((latest.current.deadline - Date.now()) / 1000));
   setSeconds(remaining);
   if (remaining === 0 && questions.length && !submitInFlight.current && !latest.current.locked) void submitRef.current('timeout');
  };
  tick();
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
 }, [questions.length, session?.id]);

 useEffect(() => {
  function clipboard(event) {
   if(!event.target?.closest?.('.monaco-editor'))return;
   const action = clipboardAction(event);
   if (!action) return;
   // Capture before Monaco, and suppress the native clipboard event so one shortcut counts exactly once.
   event.preventDefault();
   event.stopImmediatePropagation();
   if (!event.repeat) clipboardRef.current(action);
  }
  const fullscreenChanged = () => setFullscreen(!!document.fullscreenElement);
  const contextMenu = event => event.preventDefault();
  for (const type of ['keydown','copy','cut','paste']) document.addEventListener(type, clipboard, true);
  document.addEventListener('fullscreenchange', fullscreenChanged);
  document.addEventListener('contextmenu', contextMenu);
  return () => {
   for (const type of ['keydown','copy','cut','paste']) document.removeEventListener(type, clipboard, true);
   document.removeEventListener('fullscreenchange', fullscreenChanged);
   document.removeEventListener('contextmenu', contextMenu);
  };
 }, []);

 useEffect(() => {
  if (!questions.length) return;
  const timer = setInterval(async () => {
   if (!active.current || latest.current.locked || submitInFlight.current || recorderSession.current?.capture==='screen' || ['none','live'].includes(recordingMode)) return;
   const part = partIndex.current++;
   updateSession({recordingPart: partIndex.current});
   try {
    await api('exam/recording-url', {partIndex: part, contentType: 'video/webm', mode: 'mock'});
    await api('exam/recording-complete', {partIndex: part, byteSize: 0, protocolVersion: 2, mode: 'mock'});
   } catch (error) {console.error('[MOCK RECORDING]', error.message);}
  }, 300000);
  return () => clearInterval(timer);
 }, [questions.length, updateSession, recordingMode]);

 useEffect(()=>installDetectors({active:()=>active.current&&!latest.current?.locked, report:(...args)=>reportRef.current(...args)}),[]);
 useEffect(()=>{
  const timer=setInterval(async()=>{
   if(!active.current||latest.current.locked)return;
   try {
    const data=await api('exam/heartbeat',{present:!document.hidden&&document.hasFocus()});
    if(typeof data.time_remaining==='number')updateSession({deadline:Date.now()+data.time_remaining*1000});
    if(data.locked)void submitRef.current('anti_cheat_violation');
   }catch(error){if(error.status===410)void submitRef.current(error.reason || 'anti_cheat_violation');}
  },10000);
  return()=>clearInterval(timer);
 },[updateSession]);
 function stopRecording(){if(!active.current||recordingInterrupted)return;setRecordingInterrupted(true);if(recorderSession.current?.capture==='screen')recorderSession.current.dispose();reportRef.current('recording_stopped',{mode:recordingMode,capture:'mock'});}
 async function resumeRecording(){try{if(recorderSession.current?.capture==='screen'){recorderSession.current.dispose();await recorderSession.current.start();}await api('exam/recording-url',{partIndex:partIndex.current,mode:recordingMode,resumed:true});setRecordingInterrupted(false);}catch(error){setNotice(error.message);}}

 function changeAnswer(value) {
  if (!active.current || latest.current.locked || !document.fullscreenElement) return;
  const question = questions[latest.current.index];
  const answers = {...latest.current.answers, [question.id]: value};
  updateSession({answers});
  setSaveStatus('Saving...');
  clearTimeout(saveTimer.current);
  saveTimer.current = setTimeout(async () => {
   if (submitInFlight.current || latest.current.locked) return;
   try {await api('exam/answers', {answers: answerPayload(latest.current.answers)}); if (mounted.current) setSaveStatus('');}
   catch (error) {if (mounted.current) setSaveStatus(error.message);}
  }, 1000);
 }
 function move(index) {
  if (!active.current || latest.current.locked || !document.fullscreenElement || index < 0 || index >= questions.length) return;
  updateSession({index});
  window.scrollTo({top: 0});
 }
 async function resumeFullscreen() {
  setFullscreenError('');
  try {
   await document.documentElement.requestFullscreen();
   if (!document.fullscreenElement) throw new Error('Fullscreen was not activated.');
  } catch {setFullscreenError('Fullscreen is required. Allow fullscreen access to continue.');}
 }

 if (!student || !session) return <Navigate to={student ? '/confirm' : '/'} replace/>;
 if (session.submitted) return <Navigate to="/submit" replace/>;
 const index = session.index < questions.length ? session.index : 0;
 const question = questions[index];
 const disabled = session.locked || submitting || !fullscreen || recordingInterrupted;
 const buttonStyle = 'inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50';

 return <div className="min-h-screen bg-slate-50 select-none pb-20">
  <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
   <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
    <div className="flex items-center gap-4"><div role="timer" className={'flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-lg font-mono tracking-wider shadow-md ' + (seconds < 300 ? 'bg-red-100 text-red-700' : 'bg-slate-900 text-white')}>
     <Icon name="clock" className="w-5 h-5 opacity-80"/>{Math.floor(seconds / 60).toString().padStart(2,'0')}:{(seconds % 60).toString().padStart(2,'0')}
    </div></div>
    <button disabled={disabled || !question} onClick={() => {if (window.confirm('Are you sure you want to submit?')) void submit('manual');}}
     className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">
     {submitting ? 'Submitting...' : 'Submit Exam'}
    </button>
   </div>
  </header>
  {notice && <div role="alert" className="exam-notice bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 shadow-lg text-sm">{notice}</div>}
  {submitError && <div role="alert" className="exam-notice bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 shadow-lg text-sm">
   {submitError} <button className="underline font-semibold ml-2" onClick={() => void submit(session.reason || 'manual')}>Retry submission</button>
  </div>}
  {question && <div className="max-w-7xl mx-auto px-8 pt-4 flex items-center justify-between text-xs text-slate-500">
   <span>Screen recording · {session.capture==='screen'?'Entire Screen':'simulated'} {recordingMode} · {recordingInterrupted?'Interrupted':'Active'} · Violations {session.violations}/2</span>
   <button disabled={session.locked||recordingInterrupted} onClick={stopRecording} className="underline">{session.capture==='screen'?'Stop sharing':'Stop sharing (simulation)'}</button>
  </div>}
  {question ? <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
   <div className="mb-8"><div className="flex items-center gap-3 mb-2">
    <span className="text-sm font-bold text-blue-600 tracking-wider uppercase">Question</span>
    <span className="bg-slate-200 text-slate-700 py-1 px-3 rounded-full text-sm font-bold">{index + 1} <span className="opacity-50 font-normal mx-1">of</span> {questions.length}</span>
   </div></div>
   <article className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
    <div className="p-8 border-b border-slate-100 bg-slate-50/30"><div className="question-content prose prose-slate max-w-none prose-pre:bg-slate-800 prose-pre:text-slate-50" dangerouslySetInnerHTML={{__html: question.html}}/></div>
    <div className="p-8">
     <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-6 flex items-center gap-2"><Icon name="edit" className="w-4 h-4 text-blue-500"/>Your Answer</h3>
     <div className="rounded-xl overflow-hidden border border-slate-200 shadow-inner bg-slate-50">
      <CodeEditor sessionId={session.id} questionId={question.id} value={session.answers[question.id] || ''}
       language={session.language || 'java'} disabled={disabled} onClipboard={action => clipboardRef.current(action)}
       onViolation={(...args)=>reportRef.current(...args)} onChange={changeAnswer} onLanguage={language => {if (!disabled) updateSession({language});}}/>
     </div>
     {saveStatus && <p role="status" className="text-xs text-slate-500 mt-3">{saveStatus}</p>}
    </div>
   </article>
  </main> : <div className="min-h-[70vh] flex items-center justify-center">
   <div className="flex flex-col items-center gap-4">{!loadingError && <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"/>}
    <p role="status" className="text-slate-600 font-medium">{loadingError || 'Loading questions...'}</p>
    {loadingError && <button onClick={() => window.location.reload()} className={buttonStyle}>Retry</button>}
   </div>
  </div>}
  {question && <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
   <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
    <button disabled={disabled || index === 0} onClick={() => move(index - 1)} className={'hidden md:inline-flex ' + buttonStyle}><Icon name="previous"/>Previous</button>
    <div className="flex-1 overflow-x-auto pb-2 md:pb-0 hide-scrollbar flex justify-center w-full"><div className="flex gap-2 mx-auto p-1">
     {questions.map((q,i) => <button key={q.id} aria-label={'Question ' + (i+1)} aria-current={i === index ? 'step' : undefined}
      disabled={disabled} onClick={() => move(i)} className={'flex-shrink-0 w-10 h-10 rounded-lg text-sm font-bold transition-all ' +
       (i === index ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-600 ring-offset-2 scale-110' : session.answers[q.id] ?
        'bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100')}>{i+1}</button>)}
    </div></div>
    <div className="flex w-full md:w-auto gap-2 justify-between">
     <button disabled={disabled || index === 0} onClick={() => move(index - 1)} className={'md:hidden flex-1 justify-center ' + buttonStyle}><Icon name="previous"/>Prev</button>
     <button disabled={disabled || index === questions.length - 1} onClick={() => move(index + 1)} className={'flex-1 md:flex-none justify-center ' + buttonStyle}>Next<Icon name="next"/></button>
    </div>
   </div>
  </footer>}
  {recordingInterrupted && !submitting && !session.locked && <div className="fullscreen-gate"><div className="max-w-md bg-white rounded-2xl p-8 text-center shadow-xl">
   <h2 className="text-xl font-bold mb-3">Screen Sharing Interrupted</h2><p className="text-slate-500 mb-6">Share your Entire Screen again to continue. {session.capture==='screen'?'Real screen capture is enabled.':'Recording is simulated in this local exam.'}</p>
   <button onClick={resumeRecording} className="bg-blue-600 text-white rounded-xl px-6 py-3">Share Entire Screen Again</button>
  </div></div>}
  {!fullscreen && !submitting && !session.locked && <div className="fullscreen-gate">
   <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center shadow-xl">
    <div className="text-4xl mb-4">🛡️</div><h2 className="text-xl font-bold mb-3">Fullscreen Required</h2>
    <p className="text-slate-500 mb-6">You must stay in fullscreen to take the assessment. Return to fullscreen to continue. The exam timer keeps running.</p>
    {fullscreenError && <p role="alert" className="text-red-600 text-sm mb-4">{fullscreenError}</p>}
    <button onClick={resumeFullscreen} className="w-full bg-blue-600 text-white font-medium py-3 rounded-xl hover:bg-blue-700">Return to Fullscreen</button>
   </div>
  </div>}
  {submitting && <div className="fullscreen-gate"><div role="status" className="bg-white rounded-2xl p-8 text-center shadow-xl">
   <div className="w-8 h-8 mx-auto mb-4 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"/>
   <p className="font-semibold">{['clipboard_violation','anti_cheat_violation'].includes(session.reason) ? 'Exam locked. Submitting automatically...' : 'Submitting exam...'}</p>
  </div></div>}
 </div>;
}
