import type{IncomingMessage,ServerResponse}from'node:http'
import type{Context}from'@deepseek-ai/cordis'
import type{}from'@deepseek-ai/dsh-host-webserver'
import{StoryProjectionStore,type SaveSummary}from'./host-store.ts'
import{StoryRuntimeStore}from'./runtime-store.ts'
import{StoryCatalogStore}from'./catalog-store.ts'

export const inject=['webServer']
export interface Config{runtimeRoot?:string;storyRuntimeRoot?:string;packsRoot?:string}
const SAVE_BASE='/story-engine/api/saves/'
const RUNTIME_CLONE='/story-engine/api/runtime/clone'
const CATALOG='/story-engine/api/catalog'

async function body(req:IncomingMessage):Promise<unknown>{
  const chunks:Buffer[]=[];let size=0
  for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>2_000_000)throw new Error('请求体超过 2 MB');chunks.push(bytes)}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
function json(res:ServerResponse,status:number,value:unknown):void{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value))}
function sameOrigin(req:IncomingMessage):boolean{const origin=req.headers.origin;return origin===undefined||origin===`http://${req.headers.host}`||origin===`https://${req.headers.host}`}
function message(error:unknown):string{return error instanceof Error?error.message:String(error)}

export function apply(ctx:Context,config:Config={}):void{
  const saves=new StoryProjectionStore(config.runtimeRoot??'D:/DSH-Story-Engine/runtime-ui')
  const runtime=new StoryRuntimeStore(config.storyRuntimeRoot??'D:/DSH-Story-Engine/runtime')
  const catalog=new StoryCatalogStore(config.packsRoot??'D:/DSH-Story-Engine/packs')

  ctx.effect(()=>ctx.webServer.register({kind:'prefix',path:SAVE_BASE.slice(0,-1),async handler(req,res){
    try{
      const url=new URL(req.url??'/','http://localhost')
      const id=decodeURIComponent(url.pathname.slice(SAVE_BASE.length))
      if(id===''){
        if(req.method==='GET'){const list:SaveSummary[]=await saves.list();json(res,200,{saves:list});return}
        json(res,405,{error:'方法不允许'});return
      }
      if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id)){json(res,400,{error:'存档 ID 无效'});return}
      if(req.method==='GET'){
        const value=await saves.read(id)
        if(value===undefined){res.writeHead(204,{'cache-control':'no-store'});res.end();return}
        json(res,200,value);return
      }
      if(req.method==='PUT'){
        if(!sameOrigin(req)){json(res,403,{error:'拒绝跨站写入'});return}
        const payload=await body(req)as{expectedRevision?:unknown;projection?:unknown}
        if(!Number.isInteger(payload.expectedRevision)||!payload.projection||typeof payload.projection!=='object'){json(res,400,{error:'请求格式无效'});return}
        json(res,200,await saves.write(id,Number(payload.expectedRevision),payload.projection as Record<string,any>));return
      }
      if(req.method==='DELETE'){
        if(!sameOrigin(req)){json(res,403,{error:'拒绝跨站写入'});return}
        const removed=await saves.remove(id)
        if(!removed){res.writeHead(204,{'cache-control':'no-store'});res.end();return}
        json(res,200,{removed:true});return
      }
      res.setHeader('allow','GET, PUT, DELETE');json(res,405,{error:'方法不允许'})
    }catch(error){const detail=message(error);json(res,detail.includes('版本冲突')?409:400,{error:detail})}
  }}),'story-ui: projection API')

  ctx.effect(()=>ctx.webServer.register({kind:'exact',path:RUNTIME_CLONE,async handler(req,res){
    try{
      if(req.method!=='POST'){res.setHeader('allow','POST');json(res,405,{error:'方法不允许'});return}
      if(!sameOrigin(req)){json(res,403,{error:'拒绝跨站写入'});return}
      const payload=await body(req)as{packId?:unknown;sourceSessionId?:unknown;targetSessionId?:unknown}
      if(typeof payload.packId!=='string'||typeof payload.sourceSessionId!=='string'||typeof payload.targetSessionId!=='string'){json(res,400,{error:'请求格式无效'});return}
      const cloned=await runtime.clone(payload.packId,payload.sourceSessionId,payload.targetSessionId)
      json(res,200,{cloned})
    }catch(error){json(res,400,{error:message(error)})}
  }}),'story-ui: runtime clone API')

  ctx.effect(()=>ctx.webServer.register({kind:'exact',path:CATALOG,async handler(req,res){
    try{
      if(req.method!=='GET'){res.setHeader('allow','GET');json(res,405,{error:'方法不允许'});return}
      json(res,200,{packs:await catalog.list()})
    }catch(error){json(res,400,{error:message(error)})}
  }}),'story-ui: content pack catalog API')
}
