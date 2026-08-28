import{readdir,readFile}from'node:fs/promises'
import{dirname,join}from'node:path'
import{validateStoryUiDescriptor}from'./story-ui-descriptor.ts'

type JsonObject=Record<string,any>
export interface CatalogPack{
  packId:string;title:string;author:string;version:string;status:'ready'|'diagnostic';description:string;agentPreset:string;diagnostic?:string;template?:JsonObject
}

async function manifests(root:string):Promise<string[]>{
  const found:string[]=[]
  async function visit(directory:string):Promise<void>{
    const entries=await readdir(directory,{withFileTypes:true}).catch(error=>{if((error as NodeJS.ErrnoException).code==='ENOENT')return[];throw error})
    for(const entry of entries){
      const path=join(directory,entry.name)
      if(entry.isDirectory())await visit(path)
      else if(entry.isFile()&&entry.name==='pack.json')found.push(path)
    }
  }
  await visit(root);return found.sort()
}

export class StoryCatalogStore{
  constructor(private readonly root:string){}
  async list():Promise<CatalogPack[]>{
    const packs:CatalogPack[]=[]
    for(const manifestPath of await manifests(this.root)){
      try{
        const manifest=JSON.parse(await readFile(manifestPath,'utf8'))as JsonObject
        if(typeof manifest.id!=='string'||typeof manifest.name!=='string'||typeof manifest.version!=='string')continue
        const directory=dirname(manifestPath)
        let template:JsonObject|undefined;let diagnostic='缺少 ui/story-ui.json，暂不能从游戏库新建存档'
        try{const candidate=JSON.parse(await readFile(join(directory,'ui','story-ui.json'),'utf8'))as unknown;template=validateStoryUiDescriptor(candidate)}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')diagnostic=`ui/story-ui.json 无效：${error instanceof Error?error.message:String(error)}`}
        packs.push({
          packId:manifest.id,
          title:manifest.name,
          author:manifest.license==='Private-Use-Only'?'私人内容包':'本地内容包',
          version:manifest.version,
          status:template===undefined?'diagnostic':'ready',
          description:String(manifest.description??''),
          agentPreset:`story-${manifest.id}`,
          ...(template===undefined?{diagnostic}:{template}),
        })
      }catch{/* unreadable manifests are omitted */}
    }
    return packs
  }
}
