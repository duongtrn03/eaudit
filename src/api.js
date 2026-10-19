import {readSession} from './session.js';
export async function api(path, body, options = {}) {
  const session = readSession();
  const response = await fetch('/api/student/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    signal: options.signal,
    headers: {'Content-Type': 'application/json'},
    ...(body === undefined ? {} : {body: JSON.stringify({...body, ...(session && path !== 'verify' ? {session_id:session.id} : {})})}),
  });
  const data = await response.json();
  if (!response.ok) {
    const reasons={concurrent_session:'Exam session is no longer active. Please sign in again.',submitted:'This exam has already been submitted.',timeout:'The exam time has expired.',absent_too_long:'The exam session ended after prolonged absence.'};
    const error=new Error(data.error || reasons[data.reason] || 'Request failed. Please try again.');error.status=response.status;error.reason=data.reason;throw error;
  }
  return data;
}
export async function reportViolation(body, shouldContinue) {
  for(let attempt=0;attempt<=5;attempt++) {
    if(!shouldContinue())return {ignored:true};
    try{return await api('violation',body);}catch(error){
      if(error.status===410 || (error.status>=400 && error.status<500) || attempt===5)throw error;
      await new Promise(resolve=>setTimeout(resolve,1000*2**attempt));
    }
  }
}
