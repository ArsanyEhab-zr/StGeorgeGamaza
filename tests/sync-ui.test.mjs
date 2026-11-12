// Isolated real-browser UI smoke test. All data/network hooks are stubbed; this
// harness cannot read or write production Firebase data.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const profile = await mkdtemp(path.join(tmpdir(), 'mr-gergs-sync-ui-'));
const stubs = {
    childSync: "export const scopedSyncKeys=()=>['class-0']; export const syncScopedClassesFromCloud=()=>new Promise(()=>{});",
    sync: 'export const restoreChildEverywhere=()=>new Promise(()=>{}); export const syncDataWithCloud=()=>new Promise(()=>{});',
    database: 'export const db={children:{toArray:async()=>[]}};',
    'dexie-react-hooks': 'export const useLiveQuery=()=>[];',
    useSyncStatus: 'export default ()=>({dirtyCount:0});',
    useNetworkStatus: 'export default ()=>({isOnline:true});'
};
const server = await createServer({ root, configFile:false, optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime']}, server:{host:'127.0.0.1',port:4175,strictPort:true,hmr:false,cors:true}, plugins:[{
    name:'isolated-sync-ui-stubs', enforce:'pre',
    resolveId(source) { const name=source.split('/').at(-1).replace(/\.js$/,''); if(name in stubs) return '\0sync-ui:'+name; },
    load(id) { if(id.startsWith('\0sync-ui:')) return stubs[id.slice(9)]; }
},react(),tailwind()] });
let chrome;
let ws;
try {
    await server.listen();
    const response=await fetch('http://127.0.0.1:4175/tests/fixtures/sync-ui.html');
    assert.equal(response.status,200);
    await response.text();
    chrome=spawn(process.env.CHROME_BIN || '/usr/bin/google-chrome', ['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--no-proxy-server','--disable-dev-shm-usage','--remote-debugging-port=9228',`--user-data-dir=${profile}`,'about:blank'], {stdio:'ignore'});
    let pages;
    for(let i=0;i<60;i++) {
        try { pages=(await (await fetch('http://127.0.0.1:9228/json')).json()).filter(page=>page.type==='page'); if(pages.length) break; } catch {}
        await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(pages?.length,'Chrome debugging endpoint must start');
    ws=new WebSocket(pages[0].webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    let next=1;
    const pending=new Map(), listeners=new Map();
    ws.onmessage=event=>{
        const message=JSON.parse(event.data);
        if(message.id) {const task=pending.get(message.id); pending.delete(message.id); message.error?task.reject(new Error(JSON.stringify(message.error))):task.resolve(message.result);}
        else for(const callback of listeners.get(message.method)||[]) callback(message.params);
    };
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=next++;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{
        const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
        assert.ok(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));
        return result.result.value;
    };
    const errors=[];
    listeners.set('Runtime.exceptionThrown',[event=>errors.push(event.exceptionDetails)]);
    listeners.set('Log.entryAdded',[event=>errors.push(event.entry)]);
    listeners.set('Network.loadingFailed',[event=>errors.push(event)]);
    await send('Network.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});
    await new Promise(resolve=>setTimeout(resolve,500));
    const navigation=await send('Page.navigate',{url:'http://127.0.0.1:4175/tests/fixtures/sync-ui.html'});
    assert.ok(!navigation.errorText,JSON.stringify(navigation));
    let ready=false;
    for(let i=0;i<100;i++) {
        ready=await evaluate("!!document.querySelector('#root button')");
        if(ready) break;
        await new Promise(r=>setTimeout(r,100));
    }
    if(!ready) console.error(JSON.stringify(errors), await evaluate('JSON.stringify({url:location.href,html:document.documentElement.outerHTML,resources:performance.getEntriesByType("resource").map(r=>r.name)})'));
    assert.ok(ready,'React test harness renders');
    const advance=async budget=>{
        const finished=new Promise(resolve=>listeners.set('Emulation.virtualTimeBudgetExpired',[resolve]));
        await send('Emulation.setVirtualTimePolicy',{policy:'advance',budget});
        await finished;
    };
    assert.equal(await evaluate("document.querySelector('#root button').disabled"),false,'mount sync is silent');
    await evaluate("document.querySelector('#root button').click()");
    await advance(50);
    assert.equal(await evaluate("document.querySelector('#root button').disabled"),true,'manual click starts spinner');
    await advance(6100);
    assert.equal(await evaluate("document.querySelector('#root button').disabled"),false,'6 second safety reset releases button even with a hung service');
    assert.equal(await evaluate("document.documentElement.scrollWidth > window.innerWidth"),false,'mobile action bar does not overflow');
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    await advance(50);
    assert.equal(await evaluate("[...document.querySelectorAll('#root button')].every(button=>button.getBoundingClientRect().width<600)"),true,'desktop actions stay compact');
    await evaluate("window.dispatchEvent(new CustomEvent('global-sync-status',{detail:{status:'syncing'}}))");
    await advance(50);
    assert.equal(await evaluate("!!document.querySelector('.fixed.bottom-4.left-4')"),true,'badge is at bottom left');
    await evaluate("window.dispatchEvent(new CustomEvent('global-sync-status',{detail:{status:'idle',outcome:'success'}}))");
    await advance(2100);
    assert.equal(await evaluate("!!document.querySelector('.fixed.bottom-4.left-4')"),false,'idle badge hides after two seconds');
    await evaluate("window.dispatchEvent(new CustomEvent('global-sync-status',{detail:{status:'syncing'}}))");
    await advance(10100);
    assert.equal(await evaluate("!!document.querySelector('.fixed.bottom-4.left-4')"),false,'badge watchdog handles a missing completion event');
    console.log('PASS: Chrome mobile UI — silent mount, manual spinner, 6s release, no mobile overflow, compact desktop actions, bottom-left badge, idle hide, missing-event watchdog.');
} finally {
    ws?.close();
    if(chrome && chrome.exitCode === null) { chrome.kill(); await new Promise(resolve=>chrome.once('exit',resolve)); }
    await server.close();
    await rm(profile,{recursive:true,force:true});
}
