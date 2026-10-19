import test from 'node:test';
import assert from 'node:assert/strict';
import {eventGate,shortcutViolation,insertionMonitor,EVENTS} from '../src/anti-cheat.js';
import {createMockApi} from '../mock-api.mjs';
test('per-type cooldown, ten-second devtools cooldown and exempt events',()=>{
 let now=0;const gate=eventGate(()=>now);
 assert.equal(gate('copy_attempt'),true);assert.equal(gate('copy_attempt'),false);
 assert.equal(gate('paste_attempt'),true);now=3000;assert.equal(gate('copy_attempt'),true);
 assert.equal(gate('devtools_open'),true);now=7000;assert.equal(gate('devtools_open'),false);now=13000;assert.equal(gate('devtools_open'),true);
 for(const type of ['recording_stopped','suspicious_paste','extension_panel']){assert.equal(gate(type),true);assert.equal(gate(type),true);}
});
test('all shortcut groups are classified without flagging ordinary typing',()=>{
 for(const [event,type] of [[{key:'F12'},'devtools_open'],[{key:'I',metaKey:true,altKey:true},'devtools_open'],[{key:'u',ctrlKey:true},'view_source'],[{key:'4',metaKey:true,shiftKey:true},'screenshot_attempt'],[{key:'p',ctrlKey:true},'print_attempt']])assert.equal(shortcutViolation(event),type);
 assert.equal(shortcutViolation({key:'k',ctrlKey:true,altKey:true,shiftKey:true}),null);
});
test('rapid small insertions hit 300 in 2.5s and do not repeat for 10s',()=>{
 let time=0;const reports=[];const monitor=insertionMonitor((...args)=>reports.push(args),()=>time);
 monitor(['x'.repeat(150)],1);time=2000;monitor(['x'.repeat(150)],1);assert.equal(reports.length,1);
 monitor(['x'],1);assert.equal(reports.length,1);time=15000;monitor(['x'.repeat(300)],1);assert.equal(reports.length,1);
});
test('mock backend deduplicates event IDs, locks on any second violation and preserves first submission',()=>{
 const mock=createMockApi();const call=(path,body)=>mock('POST','/api/student/'+path,{session_id:'test',...body},()=>{});
 call('exam/start',{student_id:1});
 const first=call('violation',{type:'tab_switch',eventId:'a'});assert.equal(first.body.violation_count,1);
 assert.deepEqual(call('violation',{type:'tab_switch',eventId:'a'}).body,first.body);
 const second=call('violation',{type:'focus_lost',eventId:'b'});assert.equal(second.body.locked,true);assert.equal(second.body.violation_count,2);
 call('exam/submit',{answers:[{question_order:1,answer:'latest'}],reason:'anti_cheat_violation'});
 assert.equal(call('exam/submit',{answers:[],reason:'manual'}).body.answers[0].answer,'latest');
});
test('all 15 detectors have backend policy and simultaneous sessions return 410',()=>{
 for(const type of EVENTS){const mock=createMockApi();mock('POST','/api/student/exam/start',{session_id:'a',student_id:1},()=>{});assert.equal(mock('POST','/api/student/violation',{session_id:'a',eventId:'id',type},()=>{}).body.violation_count,1);}
 const mock=createMockApi();for(const sid of ['a','b'])mock('POST','/api/student/exam/start',{session_id:sid,student_id:1},()=>{});
 assert.equal(mock('POST','/api/student/exam/heartbeat',{session_id:'a',present:true},()=>{}).body.reason,'concurrent_session');
});

test('browser detectors honor fullscreen grace, focus delay, panel threshold and extended-screen transitions',async t=>{
 const {installDetectors}=await import('../src/anti-cheat.js');
 t.mock.timers.enable({apis:['setInterval','setTimeout','Date'],now:1000});
 const storage=new Map();globalThis.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 const doc=new EventTarget();Object.assign(doc,{fullscreenElement:{},hidden:false,hasFocus:()=>false});
 const target=new EventTarget();Object.assign(target,{innerWidth:1460,screen:{width:1920,height:1080,isExtended:false},devicePixelRatio:2});
 const reports=[];const dispose=installDetectors({active:()=>true,report:(type,data)=>reports.push({type,data}),target,doc});
 target.innerWidth=1320;t.mock.timers.tick(3000);assert.equal(reports.filter(r=>r.type==='extension_panel').length,1);
 target.screen.isExtended=true;t.mock.timers.tick(3000);assert.equal(reports.filter(r=>r.type==='multiple_display_detected').length,1);
 target.dispatchEvent(new Event('blur'));t.mock.timers.tick(3000);assert.ok(reports.some(r=>r.type==='focus_lost'));
 doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.ok(reports.some(r=>r.type==='tab_switch'));
 doc.fullscreenElement=null;doc.dispatchEvent(new Event('fullscreenchange'));t.mock.timers.tick(4000);assert.equal(reports.filter(r=>r.type==='fullscreen_exit').length,0);
 t.mock.timers.tick(1000);assert.equal(reports.filter(r=>r.type==='fullscreen_exit').length,1);
 t.mock.timers.tick(5000);assert.equal(reports.filter(r=>r.type==='fullscreen_exit').length,2);
 dispose();delete globalThis.sessionStorage;
});
