const CACHE='liftlog-shell-v3';const PHOTO_CACHE='liftlog-demo-images-v1';const ASSETS=['./','./index.html','./style.css','./app.js','./config.js','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>![CACHE,PHOTO_CACHE].includes(key)).map(key=>caches.delete(key)))));self.clients.claim()});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 const isLocal=url.origin===location.origin;
 const isSdk=url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('@supabase/supabase-js');
 const isPhoto=url.hostname==='raw.githubusercontent.com'&&url.pathname.startsWith('/yuhonas/free-exercise-db/main/exercises/');
 if(!isLocal&&!isSdk&&!isPhoto)return;
 event.respondWith((async()=>{
  const cache=await caches.open(isPhoto?PHOTO_CACHE:CACHE);
  if(isPhoto){const cached=await cache.match(request);if(cached)return cached;}
  try{
   const response=await fetch(request);
   if(response.ok||response.type==='opaque')cache.put(request,response.clone());
   return response;
  }catch{
   return (await cache.match(request))||(isLocal&&request.mode==='navigate'?(await cache.match('./index.html')):Response.error());
  }
 })());
});