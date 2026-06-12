/* PDF Fusion Smart Pro Worker v6 */
'use strict';
let pdfReady = false;
async function ensurePdfLib(){
  if (pdfReady && self.PDFLib) return self.PDFLib;
  importScripts('https://unpkg.com/pdf-lib/dist/pdf-lib.min.js');
  pdfReady = true;
  return self.PDFLib;
}
function post(id, type, payload){ self.postMessage({id, type, ...payload}); }
function cleanName(name){ return String(name||'file').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\-_]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase() || 'file'; }
function parseRange(str,total){
  if(!str || !String(str).trim()) return [...Array(total).keys()];
  const set = new Set();
  String(str).split(',').map(x=>x.trim()).filter(Boolean).forEach(p=>{ const m=p.match(/^(\d+)(?:-(\d+))?$/); if(!m) return; let a=+m[1], b=+(m[2]||m[1]); if(a>b)[a,b]=[b,a]; for(let i=Math.max(1,a); i<=Math.min(total,b); i++) set.add(i-1); });
  return [...set].sort((a,b)=>a-b);
}
async function safeCompress(file, opts, id){
  const {PDFDocument} = await ensurePdfLib();
  const src = await PDFDocument.load(file.bytes, {ignoreEncryption:true});
  const out = await PDFDocument.create();
  const total = src.getPageCount();
  const pages = parseRange(opts.pages || '', total);
  for(let i=0;i<pages.length;i++){
    const [p] = await out.copyPages(src,[pages[i]]); out.addPage(p);
    post(id,'progress',{progress:Math.round(((i+1)/Math.max(1,pages.length))*90), message:`${file.name}: copy page ${i+1}/${pages.length}`});
  }
  try { out.setTitle(file.name.replace(/\.pdf$/i,'')); out.setProducer('PDF Fusion Smart Pro Worker Compress'); out.setCreator('PDF Fusion Smart Pro'); } catch {}
  return await out.save({useObjectStreams:true, addDefaultPage:false, objectsPerTick:24});
}
async function merge(files, opts, id){
  const {PDFDocument, degrees, StandardFonts, rgb} = await ensurePdfLib();
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  let done = 0, totalWork = files.reduce((a,f)=>a+(f.pages||1),0) || files.length || 1;
  for(const f of files){
    const src = await PDFDocument.load(f.bytes, {ignoreEncryption:true});
    const pages = parseRange(f.range || '', src.getPageCount());
    const copied = await out.copyPages(src, pages);
    for(const p of copied){
      if(f.rotate) p.setRotation(degrees(f.rotate));
      out.addPage(p); done++;
      post(id,'progress',{progress:Math.round(done/totalWork*92), message:`merge: ${f.name}`});
    }
  }
  if(opts.pageNo){
    const pages = out.getPages();
    pages.forEach((p,i)=>{ const s = `${i+1}/${pages.length}`; const w=p.getSize().width; p.drawText(s,{x:w/2-12,y:18,size:10,font,color:rgb(.25,.25,.25)}); });
  }
  try { out.setProducer('PDF Fusion Smart Pro Worker Merge'); } catch {}
  return await out.save({useObjectStreams:true, addDefaultPage:false, objectsPerTick:24});
}
async function watermarkFile(file, opts, id){
  const {PDFDocument, degrees, StandardFonts, rgb} = await ensurePdfLib();
  const doc = await PDFDocument.load(file.bytes, {ignoreEncryption:true});
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const text = String(opts.text || 'CONFIDENTIAL');
  const size = +opts.size || 42;
  const opacity = Math.max(0, Math.min(1, +opts.opacity || .18));
  const angle = +opts.angle || -35;
  const pages = doc.getPages();
  pages.forEach((p,i)=>{ const {width,height}=p.getSize(); const tw = font.widthOfTextAtSize(text,size); p.drawText(text,{x:(width-tw)/2,y:height/2,size,font,color:rgb(.07,.07,.07),opacity,rotate:degrees(angle)}); post(id,'progress',{progress:Math.round((i+1)/pages.length*90), message:`watermark: ${file.name} page ${i+1}/${pages.length}`}); });
  try { doc.setProducer('PDF Fusion Smart Pro Worker Watermark'); } catch {}
  return await doc.save({useObjectStreams:true, addDefaultPage:false, objectsPerTick:24});
}
async function splitFile(file, opts, id){
  const {PDFDocument} = await ensurePdfLib();
  const src = await PDFDocument.load(file.bytes, {ignoreEncryption:true});
  const total = src.getPageCount();
  const pages = parseRange(opts.pages || '', total);
  const out = [];
  for(let i=0;i<pages.length;i++){
    const doc = await PDFDocument.create();
    const [p] = await doc.copyPages(src,[pages[i]]); doc.addPage(p);
    const bytes = await doc.save({useObjectStreams:true, addDefaultPage:false});
    out.push({name:`${cleanName(file.name.replace(/\.pdf$/i,''))}-page-${pages[i]+1}.pdf`, bytes});
    post(id,'progress',{progress:Math.round((i+1)/pages.length*94), message:`split: page ${pages[i]+1}/${total}`});
  }
  return out;
}
async function runTask(id, task, payload){
  if(task === 'compressOne') return {file:{name:cleanName(payload.file.name.replace(/\.pdf$/i,''))+'-compressed.pdf', bytes:await safeCompress(payload.file, payload.options||{}, id)}};
  if(task === 'compressMany'){
    const files=[];
    for(let i=0;i<payload.files.length;i++){ const f=payload.files[i]; const bytes=await safeCompress(f, payload.options||{}, id); files.push({name:cleanName(f.name.replace(/\.pdf$/i,''))+'-compressed.pdf', bytes}); post(id,'progress',{progress:Math.round((i+1)/payload.files.length*95), message:`compressed ${i+1}/${payload.files.length}`}); }
    return {files};
  }
  if(task === 'merge') return {file:{name:(cleanName(payload.name)||'merged')+'.pdf', bytes:await merge(payload.files, payload.options||{}, id)}};
  if(task === 'watermarkMany'){
    const files=[];
    for(let i=0;i<payload.files.length;i++){ const f=payload.files[i]; const bytes=await watermarkFile(f, payload.options||{}, id); files.push({name:cleanName(f.name.replace(/\.pdf$/i,''))+'-watermarked.pdf', bytes}); post(id,'progress',{progress:Math.round((i+1)/payload.files.length*95), message:`watermarked ${i+1}/${payload.files.length}`}); }
    return {files};
  }
  if(task === 'splitOne') return {files: await splitFile(payload.file, payload.options||{}, id)};
  throw new Error('Unknown worker task: '+task);
}
self.addEventListener('message', async ev => {
  const {id, task, payload} = ev.data || {};
  try { post(id,'progress',{progress:2, message:'Worker started'}); const result = await runTask(id, task, payload || {}); post(id,'done',{result}); }
  catch(err){ post(id,'error',{message:err && err.message ? err.message : String(err)}); }
});
