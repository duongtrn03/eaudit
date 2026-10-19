import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter, Navigate, Route, Routes, useNavigate} from 'react-router-dom';
import loginTemplate from '../login.html?raw';
import confirmTemplate from '../confirm.html?raw';
import {api} from './api';
import {readStudent, readSession, startSession, clearSession} from './session';
import Exam from './Exam';
import {ExamRecorder,recorderSession} from './exam-recorder';
import './styles.css';
import './recorded.css';

function Template({html, onReady}) {
 const ref = useRef();
 useEffect(() => onReady(ref.current), []);
 return <div ref={ref} dangerouslySetInnerHTML={{__html: html}}/>;
}
function inlineError(root, text) {
 let error = root.querySelector('[role="alert"]');
 if (!error) {
  error = document.createElement('div');
  error.setAttribute('role', 'alert');
  error.className = 'bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl mb-6 text-sm font-medium text-center';
  const container = root.querySelector('.p-8');
  container.prepend(error);
 }
 error.textContent = text;
}
function Login() {
 const nav = useNavigate();
 return <Template html={loginTemplate} onReady={root => {
  const input = root.querySelector('input'), button = root.querySelector('button'), form = root.querySelector('form');
  input.setAttribute('aria-label', 'Access code');
  input.oninput = () => {input.value = input.value.toUpperCase(); button.disabled = ![6,8].includes(input.value.trim().length);};
  form.onsubmit = async event => {
   event.preventDefault(); if (![6,8].includes(input.value.trim().length)) return;
   button.disabled = true; button.textContent = 'Verifying...';
   try {
    const student = await api('verify', {access_code: input.value.trim()});
    sessionStorage.setItem('student', JSON.stringify(student)); clearSession(); nav('/confirm');
   } catch (error) {inlineError(root, error.message); button.disabled = false; button.textContent = 'Begin Assessment';}
  };
 }}/>;
}
function Confirm() {
 const nav = useNavigate();
 if (!readStudent()) return <Navigate to="/" replace/>;
 return <Template html={confirmTemplate} onReady={root => {
  const student = readStudent(); root.querySelector('.break-all').textContent = student.email;
  const note = document.createElement('p');
  note.className = 'text-slate-500 text-xs mb-6 text-center';
  note.textContent = 'Local mock APIs: screen capture is simulated unless you enable real Entire Screen capture. Fullscreen is required. Fullscreen, focus, clipboard, keyboard, editor insertion and screen signals are monitored; a second violation locks and submits the exam.';
  root.querySelector('.space-y-3').before(note);
  const controls=document.createElement('div');controls.className='text-sm text-slate-600 mb-6 space-y-3';
  controls.innerHTML='<label class="block">Recording mode <select aria-label="Recording mode" class="border rounded p-2 ml-2"><option value="s3">S3 (mock upload)</option><option value="local">Local (AES-256 ZIP)</option><option value="live">Live (mock session)</option><option value="none">None</option></select></label><label class="block"><input type="checkbox" aria-label="Capture real screen"> Capture real Entire Screen (optional)</label>';
  root.querySelector('.space-y-3').before(controls);
  const [start, cancel] = root.querySelectorAll('button');
  let directory=null;
  const localControls=document.createElement('div');localControls.className='space-y-2';
  localControls.innerHTML='<label class="block">Local recording password <input type="password" aria-label="Local recording password" class="border rounded p-2 w-full" autocomplete="new-password"></label><button type="button" class="underline text-blue-600">Choose recording directory</button><p class="text-xs text-slate-500">Required for real Local recording; simulated mode does not write files.</p>';
  controls.append(localControls);
  localControls.querySelector('button').onclick=async()=>{try{if(!window.showDirectoryPicker)throw Error('Directory access requires Chrome or Edge.');directory=await window.showDirectoryPicker({mode:'readwrite'});localControls.querySelector('button').textContent='Directory: '+directory.name;}catch(error){inlineError(root,error.message);}};
  cancel.onclick = () => {sessionStorage.removeItem('student'); clearSession(); nav('/');};
  start.onclick = async () => {
   start.disabled = true; start.textContent = 'Preparing screen recording...';
   try {
    if (!document.fullscreenElement) {
     if (!document.documentElement.requestFullscreen) throw new Error('Fullscreen is required. Please use Google Chrome or Microsoft Edge.');
     await document.documentElement.requestFullscreen();
    }
    if (!document.fullscreenElement) throw new Error('Fullscreen is required. Allow fullscreen access to start the exam.');
    const mode=controls.querySelector('select').value,capture=controls.querySelector('input').checked?'screen':'mock';
    const password=localControls.querySelector('input').value;
    if(capture==='screen'&&mode==='local'&&password)localStorage.setItem('recordingPassword',password);
    const recorder=new ExamRecorder({mode,capture,directory,password:password||localStorage.getItem('recordingPassword')});
    if(capture==='screen'){try{await recorder.start();}catch(error){recorder.dispose();throw error;}}
    recorderSession.current=recorder;
    startSession(student.duration || 3600,mode,capture); nav('/exam');
   } catch (error) {
    inlineError(root, error.message); start.disabled = false; start.textContent = 'Start Exam';
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
   }
  };
 }}/>;
}
function Submitted() {
 const nav = useNavigate();
 const session = readSession();
 const [finalizing, setFinalizing] = useState(session?.submitted && !session?.recordingFinalized);
 useEffect(() => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (!session?.submitted || session.recordingFinalized) return;
  let active = true;
  (async () => {
   try {
    await api('exam/recording-url', {partIndex: session.recordingPart || 1, contentType: 'video/webm', final: true, mode: 'mock'});
    await api('exam/recording-complete', {partIndex: session.recordingPart || 1, byteSize: 0, protocolVersion: 2, mode: 'mock'});
    await api('exam/recording-finalize', {});
    const current = readSession();
    if (current?.id === session.id) sessionStorage.setItem('eaudit.exam', JSON.stringify({...current, recordingFinalized: true}));
   } finally {if (active) setFinalizing(false);}
  })();
  return () => {active = false;};
 }, []);
 if (!session?.submitted) return <Navigate to="/" replace/>;
 return <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
  <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-8 text-center">
   <div className={'text-5xl mb-4 ' + (['clipboard_violation','anti_cheat_violation','concurrent_session','absent_too_long'].includes(session.reason) ? 'text-red-500' : 'text-emerald-500')}>
    {['clipboard_violation','anti_cheat_violation','concurrent_session','absent_too_long'].includes(session.reason) ? '🛡️' : '✓'}
   </div>
   <h1 className="text-2xl font-bold mb-3">{['clipboard_violation','anti_cheat_violation','concurrent_session','absent_too_long'].includes(session.reason) ? 'Exam Locked and Submitted' : 'Exam Submitted'}</h1>
   <p className="text-slate-500 mb-6">{['clipboard_violation','anti_cheat_violation','concurrent_session','absent_too_long'].includes(session.reason)
    ? 'Your exam has been automatically submitted after two violations or a session lock.'
    : session.reason === 'timeout' ? 'Time is up. Your exam has been automatically submitted.' : 'Your assessment has been submitted successfully.'}</p>
   <p role="status" className="text-sm text-slate-500 mb-6">{finalizing ? 'Finalizing recording...' : 'Local mock submission logged.'}</p>
   <button className="bg-blue-600 text-white rounded-xl px-6 py-3" onClick={() => nav('/')}>Back to Home</button>
  </div>
 </div>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><Routes>
 <Route path="/" element={<Login/>}/><Route path="/confirm" element={<Confirm/>}/>
 <Route path="/exam" element={<Exam/>}/><Route path="/submit" element={<Submitted/>}/>
 <Route path="*" element={<Navigate to="/" replace/>}/>
</Routes></BrowserRouter>);
