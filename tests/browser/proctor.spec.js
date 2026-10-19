import {test,expect} from '@playwright/test';
async function start(page){await page.goto('/');await page.getByRole('textbox',{name:'Access code'}).fill('ABC123');await page.getByRole('button',{name:'Begin Assessment'}).click();await page.getByRole('button',{name:'Start Exam'}).click();await expect(page.locator('.monaco-editor')).toBeVisible();}
test('two distinct non-clipboard violations submit once with the latest answer',async({page})=>{
 await start(page);await page.locator('.monaco-editor .view-lines').click();await page.keyboard.type('saved answer');
 const submissions=[];page.on('request',r=>{if(r.url().endsWith('/exam/submit'))submissions.push(r.postDataJSON());});
 await page.keyboard.press('F12');await expect(page.locator('.exam-notice')).toContainText('violation 1');
 await page.keyboard.press('Control+u');await expect(page).toHaveURL(/\/submit$/);
 expect(submissions).toHaveLength(1);expect(submissions[0]).toMatchObject({violations:2,reason:'anti_cheat_violation',answers:[{question_order:1,answer:'saved answer'}]});
});
test('fullscreen grace reports at 5s and locks on the second report',async({page})=>{
 await page.clock.install();await start(page);await page.evaluate(()=>document.exitFullscreen());
 await expect(page.getByRole('heading',{name:'Fullscreen Required'})).toBeVisible();
 await page.clock.fastForward(6000);
 await expect(page.locator('.exam-notice')).toContainText('violation 1');
 await page.clock.fastForward(5000);
 await expect(page).toHaveURL(/\/submit$/,{timeout:8000});
});
test('stopping and resuming simulated screen sharing counts two violations',async({page})=>{
 await start(page);await page.getByRole('button',{name:'Stop sharing (simulation)'}).click();
 await expect(page.getByRole('heading',{name:'Screen Sharing Interrupted'})).toBeVisible();
 await expect(page.locator('.exam-notice')).toContainText('violation 1');
 await page.getByRole('button',{name:'Share Entire Screen Again'}).click();await page.getByRole('button',{name:'Stop sharing (simulation)'}).click();
 await expect(page).toHaveURL(/\/submit$/);
});
test('large insert is undone; another large insert locks without saving the blocked content',async({page})=>{
 await start(page);await page.locator('.monaco-editor .view-lines').click();
 await page.evaluate(async()=>{const monaco=await import('/node_modules/.vite/deps/monaco-editor.js');const model=monaco.editor.getModels()[0];model.pushStackElement();model.pushEditOperations([],[{range:model.getFullModelRange(),text:'x'.repeat(300)}],()=>null);model.pushStackElement();});await expect(page.locator('.exam-notice')).toContainText('suspicious paste');
 await expect.poll(()=>page.evaluate(()=>window.__MOCK_EXAM_READONLY__.read().answer)).toBe('');
 await page.evaluate(async()=>{const monaco=await import('/node_modules/.vite/deps/monaco-editor.js');const model=monaco.editor.getModels()[0];model.pushStackElement();model.pushEditOperations([],[{range:model.getFullModelRange(),text:'y'.repeat(300)}],()=>null);model.pushStackElement();});await expect(page).toHaveURL(/\/submit$/);
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('eaudit.exam')).answers[1]||'')).toBe('');
});

test('many small fast insertions are reported without undoing the answer',async({page})=>{
 await start(page);await page.locator('.monaco-editor .view-lines').click();
 await page.keyboard.insertText('x'.repeat(300));await expect(page.locator('.exam-notice')).toContainText('rapid text insertion');
 expect(await page.evaluate(()=>window.__MOCK_EXAM_READONLY__.read().answer)).toBe('x'.repeat(300));
 await page.keyboard.press('Control+c');await expect(page).toHaveURL(/\/submit$/);
});

test('real capture rejects a window capture before starting the assessment',async({page})=>{
 await page.addInitScript(()=>{navigator.mediaDevices.getDisplayMedia=async()=>{const canvas=document.createElement('canvas');const stream=canvas.captureStream(5);const track=stream.getVideoTracks()[0];track.getSettings=()=>({displaySurface:'window'});return stream;};});
 await page.goto('/');await page.getByRole('textbox',{name:'Access code'}).fill('ABC123');await page.getByRole('button',{name:'Begin Assessment'}).click();
 await page.getByRole('checkbox',{name:'Capture real screen'}).check();await page.getByRole('button',{name:'Start Exam'}).click();
 await expect(page.getByRole('alert')).toContainText('Select Entire Screen');await expect(page).toHaveURL(/\/confirm$/);
});
test('stopped capture track reports recording_stopped and displays recovery overlay',async({page})=>{
 await page.addInitScript(()=>{navigator.mediaDevices.getDisplayMedia=async()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const stream=canvas.captureStream(5);const track=stream.getVideoTracks()[0];track.getSettings=()=>({displaySurface:'monitor'});window.testCaptureTrack=track;return stream;};});
 await page.goto('/');await page.getByRole('textbox',{name:'Access code'}).fill('ABC123');await page.getByRole('button',{name:'Begin Assessment'}).click();await page.getByRole('checkbox',{name:'Capture real screen'}).check();await page.getByRole('button',{name:'Start Exam'}).click();
 await expect(page.locator('.monaco-editor')).toBeVisible();
 await page.evaluate(()=>{window.testCaptureTrack.stop();window.testCaptureTrack.dispatchEvent(new Event('ended'));});
 await expect(page.getByRole('heading',{name:'Screen Sharing Interrupted'})).toBeVisible();await expect(page.locator('.exam-notice')).toContainText('recording stopped');
});
