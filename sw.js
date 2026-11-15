const CACHE='liftlog-shell-v2';
const ASSETS=['./','./index.html','./style.css','./app.js','./config.js','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);
 const local=u.origin===location.origin;
 const sdk=u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('@supabase/supabase-js');
 if(!local&&!sdk)return;
 e.respondWith(fetch(e.request).then(response=>{
  if(response.ok||response.type==='opaque'){const copy=response.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}
  return response;
 }).catch(()=>caches.match(e.request).then(c=>c||(local&&e.request.mode==='navigate'?caches.match('./index.html'):Response.error()))));
});