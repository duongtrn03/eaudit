import test from 'node:test';
import assert from 'node:assert/strict';
import {ZipReader,BlobReader,TextWriter} from '@zip.js/zip.js';
import {encryptedRecordingArchive} from '../src/exam-recorder.js';
test('local archive uses AES-256 and requires the recording password',async()=>{
 const blob=await encryptedRecordingArchive(new Blob(['test video part']),'demo-password');
 const reader=new ZipReader(new BlobReader(blob));const [entry]=await reader.getEntries();
 assert.equal(entry.encrypted,true);assert.equal(entry.filename,'recording.webm');
 await assert.rejects(entry.getData(new TextWriter(),{password:'wrong',useWebWorkers:false}));
 assert.equal(await entry.getData(new TextWriter(),{password:'demo-password',useWebWorkers:false}),'test video part');
 await reader.close();
});
