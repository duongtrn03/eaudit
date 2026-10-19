export const EVENTS = ['fullscreen_exit','tab_switch','focus_lost','devtools_open','view_source','screenshot_attempt','print_attempt','copy_attempt','cut_attempt','paste_attempt','suspicious_paste','rapid_text_insertion','extension_panel','multiple_display_detected','recording_stopped'];
const NO_COOLDOWN = new Set(['recording_stopped','extension_panel','suspicious_paste']);
export function eventGate(now = () => Date.now()) {
 const last = new Map();
 return type => {
  if (!EVENTS.includes(type)) return false;
  const time = now(), cooldown = type === 'devtools_open' ? 10000 : 3000;
  if (!NO_COOLDOWN.has(type) && last.has(type) && time-last.get(type) < cooldown) return false;
  last.set(type,time); return true;
 };
}
export function shortcutViolation(e) {
 const key = e.key.toLowerCase();
 if (key === 'f12' || (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && ['i','j','c','k'].includes(key)) || (e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey && ['i','j','c'].includes(key))) return 'devtools_open';
 if ((e.ctrlKey && key === 'u') || (e.metaKey && e.altKey && key === 'u')) return 'view_source';
 if (['printscreen','snapshot'].includes(key) || (e.metaKey && e.shiftKey && ['3','4','5'].includes(key))) return 'screenshot_attempt';
 if ((e.ctrlKey || e.metaKey) && key === 'p') return 'print_attempt';
 return null;
}
export function insertionMonitor(report, now = () => Date.now()) {
 let changes = [], lastReport = -Infinity;
 return (texts, questionId) => {
  const time=now();
  changes=changes.filter(c=>time-c.time<=2500);
  for(const text of texts) if(text.length) changes.push({time,size:text.length});
  const total=changes.reduce((n,c)=>n+c.size,0), max=Math.max(0,...changes.map(c=>c.size));
  if(total>=300 && max<300 && time-lastReport>=10000) {
   lastReport=time;report('rapid_text_insertion',{totalInsertedChars:total,changeCount:changes.length,windowMs:2500,maxSingleChange:max,questionId});
  }
 };
}
export function installDetectors({active, report, target = window, doc = document}) {
 let lostAt=null, fullscreenReports=0, focusTimer, panelHits=0, panelReports=0, extended=false;
 const key=`eaudit.panel.baseline.${JSON.parse(sessionStorage.getItem('eaudit.exam')||'{}').id}`;
 let baseline=Number(sessionStorage.getItem(key)) || target.innerWidth;
 if(doc.fullscreenElement) sessionStorage.setItem(key,String(baseline));
 const onFullscreen=()=>{
  if(doc.fullscreenElement){lostAt=null;fullscreenReports=0;panelHits=0;baseline=Math.max(baseline,target.innerWidth);sessionStorage.setItem(key,String(baseline));}
  else if(active()) lostAt=Date.now();
 };
 if(!doc.fullscreenElement) lostAt=Date.now();
 const onVisibility=()=>{if(active() && doc.hidden) report('tab_switch',{hidden:true});};
 const onBlur=()=>{clearTimeout(focusTimer);if(active())focusTimer=setTimeout(()=>{if(active()&&!doc.hasFocus())report('focus_lost',{durationMs:3000});},3000);};
 const onFocus=()=>clearTimeout(focusTimer);
 const onKey=e=>{if(!active())return;if(e.key==='F11'){e.preventDefault();(doc.fullscreenElement?doc.exitFullscreen():doc.documentElement.requestFullscreen()).catch(()=>{});return;}const type=shortcutViolation(e);if(type){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)report(type,{key:e.key});}};
 const onPrint=()=>{if(active())report('print_attempt',{source:'beforeprint'});};
 const onUnload=e=>{if(active()){e.preventDefault();e.returnValue='';}};
 doc.addEventListener('fullscreenchange',onFullscreen);doc.addEventListener('visibilitychange',onVisibility);
 target.addEventListener('blur',onBlur);target.addEventListener('focus',onFocus);target.addEventListener('keydown',onKey,true);target.addEventListener('beforeprint',onPrint);target.addEventListener('beforeunload',onUnload);
 const fullTimer=setInterval(()=>{if(!active()||doc.fullscreenElement)return;if(lostAt===null)lostAt=Date.now();if(fullscreenReports<2 && Date.now()-lostAt>=(fullscreenReports+1)*5000){fullscreenReports++;report('fullscreen_exit',{durationMs:Date.now()-lostAt,detectorReportNumber:fullscreenReports});}},1000);
 const panelTimer=setInterval(()=>{if(!active()||!doc.fullscreenElement){panelHits=0;return;}const currentWidth=target.innerWidth,widthShrink=baseline-currentWidth;if(widthShrink>=80){panelHits++;if(panelHits>=2&&panelReports<2){panelReports++;panelHits=0;report('extension_panel',{baselineWidth:baseline,currentWidth,widthShrink,detectorReportNumber:panelReports});}}else panelHits=0;},1500);
 const displayTimer=setInterval(()=>{if(!active())return;if(target.screen.isExtended===true&&!extended){extended=true;report('multiple_display_detected',{screenWidth:target.screen.width,screenHeight:target.screen.height,devicePixelRatio:target.devicePixelRatio});}else if(target.screen.isExtended===false)extended=false;},3000);
 return ()=>{for(const t of [fullTimer,panelTimer,displayTimer])clearInterval(t);clearTimeout(focusTimer);doc.removeEventListener('fullscreenchange',onFullscreen);doc.removeEventListener('visibilitychange',onVisibility);target.removeEventListener('blur',onBlur);target.removeEventListener('focus',onFocus);target.removeEventListener('keydown',onKey,true);target.removeEventListener('beforeprint',onPrint);target.removeEventListener('beforeunload',onUnload);};
}
