import test from 'node:test';
import assert from 'node:assert/strict';
import {clipboardAction, violationDecision, answerPayload} from '../src/exam-rules.js';
const keyboard = (key, extra = {}) => ({type:'keydown',key,ctrlKey:true,metaKey:false,altKey:false,shiftKey:false,...extra});
test('clipboard shortcuts are recognized on Ctrl and Cmd without swallowing normal typing', () => {
 for(const [key, action] of [['c','copy'],['v','paste'],['x','cut']]) {
  assert.equal(clipboardAction(keyboard(key)),action);
  assert.equal(clipboardAction(keyboard(key,{ctrlKey:false,metaKey:true})),action);
  assert.equal(clipboardAction(keyboard(key,{ctrlKey:false})),null);
 }
 assert.equal(clipboardAction(keyboard('c',{shiftKey:true})),null);
 assert.equal(clipboardAction(keyboard('a')),null);
 assert.equal(clipboardAction({type:'paste'}),'paste');
});
test('the combined second violation triggers submission', () => {
 const first = violationDecision(0); assert.deepEqual(first,{count:1,shouldSubmit:false});
 assert.deepEqual(violationDecision(first.count),{count:2,shouldSubmit:true});
});
test('submission payload retains all answers in recorded API format', () => {
 assert.deepEqual(answerPayload({'1':'code','10':'text'}),[{question_order:1,answer:'code'},{question_order:10,answer:'text'}]);
});
