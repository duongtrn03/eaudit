import express from 'express';
import {createServer as createHttpServer} from 'node:http';
import {createServer} from 'vite';
import {mockResponse} from './mock-api.mjs';
const app=express();
const httpServer=createHttpServer(app);
httpServer.on('error',error=>{console.error('Local server failed:',error.message);process.exit(1)});
app.put('/api/mock-recording/:session/:part',express.raw({type:'video/webm',limit:'64mb'}),(req,res)=>res.json({ok:true,mock:true,byteSize:req.body?.length||0}));
app.use(express.json({limit:'2mb'}));
app.use('/api',(req,res)=>{const result=mockResponse(req.method,req.originalUrl.split('?')[0],req.body);res.status(result.status).json(result.body)});
if(process.env.NODE_ENV==='production'){
 app.use(express.static('dist'));app.get('/{*path}',(_req,res)=>res.sendFile(new URL('./dist/index.html',import.meta.url).pathname));
}else{const vite=await createServer({server:{middlewareMode:true,hmr:{server:httpServer}},appType:'spa'});app.use(vite.middlewares)}
httpServer.listen(Number(process.env.PORT)||5173,process.env.HOST||'0.0.0.0',()=>console.log('E-Audit listening on port '+(process.env.PORT||5173)));
