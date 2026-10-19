import http from 'node:http';
import path from 'node:path';
import {readFile,stat,realpath} from 'node:fs/promises';
const root=await realpath('_site');
const config=JSON.parse(await readFile('site.config.json','utf8'));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8'};
const port=Number(process.env.PORT||8765);
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://localhost');
    if(u.pathname==='/'){res.writeHead(302,{Location:config.basePath});res.end();return;}
    if(!u.pathname.startsWith(config.basePath)){res.writeHead(404);res.end('Not found');return;}
    const relative=decodeURIComponent(u.pathname.slice(config.basePath.length));
    let file=path.resolve(root,relative);
    if(file!==root&&!file.startsWith(root+path.sep))throw new Error('Invalid path');
    const info=await stat(file);
    if(info.isDirectory()){
      if(!u.pathname.endsWith('/')){res.writeHead(301,{Location:u.pathname+'/'+u.search});res.end();return;}
      file=path.join(file,'index.html');
    }
    if(!(await realpath(file)).startsWith(root+path.sep))throw new Error('Invalid path');
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);
  }catch{res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});res.end(await readFile(path.join(root,'404.html')));}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}${config.basePath}`));
