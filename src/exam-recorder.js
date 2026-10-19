import {api} from './api.js';
export const RECORDING_CONFIG={frameRate:5,videoBitsPerSecond:600000,timesliceMs:1000,partMs:300000};
export async function encryptedRecordingArchive(blob,password) {
 const {ZipWriter,BlobWriter,BlobReader}=await import('@zip.js/zip.js');
 const zip=new ZipWriter(new BlobWriter('application/zip'));
 await zip.add('recording.webm',new BlobReader(blob),{password,encryptionStrength:3,level:0,useWebWorkers:false});
 return zip.close();
}
async function retryRecording(operation) {
 for(let attempt=0;attempt<=5;attempt++){
  try{return await operation();}catch(error){if(attempt===5)throw error;await new Promise(resolve=>setTimeout(resolve,3000*2**attempt));}
 }
}
const recordingApi=(path,body)=>retryRecording(()=>api(path,body,{signal:AbortSignal.timeout(25000)}));
export class ExamRecorder {
 constructor({mode='s3',capture='mock',report,onState,directory,password}){this.mode=mode;this.capture=capture;this.directory=directory;this.password=password;this.report=report;this.onState=onState;this.parts=[];this.index=0;this.chunks=[];this.finalizing=false;this.pending=Promise.resolve();}
 state(value){this.onState?.(value);}
 async start(){
  this.finalizing=false;
  const pending=sessionStorage.getItem('eaudit.recording.pending');
  if(pending){const ack=JSON.parse(pending);await recordingApi('exam/recording-complete',ack);this.parts.push(ack);sessionStorage.removeItem('eaudit.recording.pending');}
  if(this.capture==='screen'){
   if(this.mode==='local'&&(!this.directory||!this.password))throw Error('Select a recording directory and set a password first.');
   const stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:5,displaySurface:'monitor'},audio:false});
   const track=stream.getVideoTracks()[0];
   if(track.getSettings().displaySurface!=='monitor'){stream.getTracks().forEach(t=>t.stop());throw Error('Select Entire Screen, not a tab or window.');}
   this.stream=stream;
   track.onended=()=>{if(!this.finalizing){this.state('interrupted');this.report?.('recording_stopped',{mode:this.mode,capture:this.capture});}};
   if(['s3','local'].includes(this.mode)){
    const mimeType=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    this.recorder=new MediaRecorder(stream,{...(mimeType?{mimeType}:{}),videoBitsPerSecond:600000});
    this.recorder.ondataavailable=e=>{if(e.data.size)this.chunks.push(e.data);};
    this.recorder.start(1000);
   }
  }
  this.state('recording');
  this.timer=setInterval(()=>{this.pending=this.pending.then(()=>this.part()).catch(()=>this.state('upload_failed'));},300000);
 }
 async part(){
  if(['none','live'].includes(this.mode))return;
  const partIndex=this.index++,chunks=this.chunks.splice(0),blob=new Blob(chunks,{type:'video/webm'});
  const data=await recordingApi('exam/recording-url',{partIndex,contentType:'video/webm',mode:this.mode,capture:this.capture});
  if(this.mode==='local'&&this.capture==='screen'){
   const zip=await encryptedRecordingArchive(blob,this.password);
   const timestamp=new Date().toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15);
   const handle=await this.directory.getFileHandle(`exam_${timestamp}_part${String(partIndex).padStart(3,'0')}.zip`,{create:true});
   const writer=await handle.createWritable();await writer.write(zip);await writer.close();
  }
  if(this.mode==='s3'&&data.uploadUrl){
   await retryRecording(async()=>{const response=await fetch(data.uploadUrl,{method:'PUT',headers:{'Content-Type':'video/webm'},body:blob,signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('Recording upload failed');});
  }
  const acknowledgement={partIndex,byteSize:blob.size,uploadId:data.uploadId,mode:this.mode,capture:this.capture};
  sessionStorage.setItem('eaudit.recording.pending',JSON.stringify(acknowledgement));
  await recordingApi('exam/recording-complete',acknowledgement);sessionStorage.removeItem('eaudit.recording.pending');
  this.parts.push(acknowledgement);
 }
 async stop(){
  this.finalizing=true;clearInterval(this.timer);
  if(this.recorder&&this.recorder.state!=='inactive')await new Promise(resolve=>{this.recorder.addEventListener('stop',resolve,{once:true});this.recorder.stop();});
  this.stream?.getTracks().forEach(track=>track.stop());
  await this.pending;await this.part();await recordingApi('exam/recording-seal',{parts:this.parts,mode:this.mode});await recordingApi('exam/recording-finalize',{parts:this.parts,mode:this.mode});this.state('finalized');
 }
 dispose(){this.finalizing=true;clearInterval(this.timer);if(this.recorder?.state==='recording')this.recorder.stop();this.stream?.getTracks().forEach(t=>t.stop());}
}

export const recorderSession={current:null};
