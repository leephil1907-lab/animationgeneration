import { ToolDefinition } from './types';

export const TOOL_REGISTRY: ToolDefinition[] = [
  { name:'comfyui_generate', description:'Generate an image via the local ComfyUI character workflow', parameters:{type:'object',properties:{prompt:{type:'string'},characterId:{type:'string'},width:{type:'number'},height:{type:'number'}},required:['prompt']} },
  { name:'web_search', description:'Search the public web for current information', parameters:{type:'object',properties:{query:{type:'string'},num_results:{type:'number'}},required:['query']} },
  { name:'open_page', description:'Fetch and summarize the text content of a public URL', parameters:{type:'object',properties:{url:{type:'string'}},required:['url']} },
  { name:'x_search', description:'Search recent posts on X', parameters:{type:'object',properties:{query:{type:'string'},limit:{type:'number'}},required:['query']} },
  { name:'code_exec', description:'Execute a short JavaScript snippet in a sandboxed context (demo)', parameters:{type:'object',properties:{code:{type:'string'}},required:['code']} },
];

export async function executeTool(name:string,args:Record<string,unknown>,baseUrl:string):Promise<{result:string;status:'completed'|'error'}>{
  try{
    switch(name){
      case 'comfyui_generate':{
        const body=new FormData();
        body.append('scene',String(args.prompt||'')); body.append('mode','image');
        body.append('settings',JSON.stringify({width:args.width||768,height:args.height||1024,steps:28,cfg:7}));
        body.append('character',JSON.stringify({name:'Chat character',role:'',age:'Adult',style:'Cinematic',traits:'',notes:''}));
        const r=await fetch(baseUrl+'/api/comfyui/character',{method:'POST',body}); const data=await r.json();
        if(!r.ok)return {result:'ComfyUI error: '+(data.details||data.error||r.statusText),status:'error'};
        return {result:'Queued ComfyUI job. Prompt ID: '+data.promptId+'. Poll /api/comfyui/job/'+data.promptId+' for results.',status:'completed'};
      }
      case 'web_search':{
        if(!process.env.SEARCH_API_KEY)return {result:'web_search is not configured. Set SEARCH_API_KEY in .env (SerpAPI, Tavily, or Brave) to enable live results.',status:'error'};
        return {result:'Would search for "'+String(args.query||'')+'" with live API (key present).',status:'completed'};
      }
      case 'open_page':{
        try{
          const raw=String(args.url||''); const parsed=new URL(raw);
          if(!['http:','https:'].includes(parsed.protocol))return {result:'Invalid URL protocol',status:'error'};
          const r=await fetch(parsed.toString(),{headers:{'User-Agent':'AnimationGenerationStudio/1.0'},signal:AbortSignal.timeout(10000)});
          const text=await r.text();
          const cleaned=text.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,4000);
          return {result:cleaned||'No readable text extracted.',status:r.ok?'completed':'error'};
        }catch(e){return {result:'Failed to open page: '+(e instanceof Error?e.message:String(e)),status:'error'};}
      }
      case 'x_search': return {result:'x_search requires X API credentials. Set X_BEARER_TOKEN in .env to enable live post search.',status:'error'};
      case 'code_exec': return {result:'code_exec is disabled in this build for safety. Wire to a real sandbox before enabling.',status:'error'};
      default:return {result:'Unknown tool: '+name,status:'error'};
    }
  }catch(e){return {result:e instanceof Error?e.message:String(e),status:'error'};}
}

export function detectTools(userMessage:string):{name:string;args:Record<string,unknown>}[]{
  const lower=userMessage.toLowerCase(); const calls:{name:string;args:Record<string,unknown>}[]=[];
  if(/(generate|create|draw|image|comfy|animate)/i.test(lower))calls.push({name:'comfyui_generate',args:{prompt:userMessage}});
  if(/(search the web|google|look up|web search)/i.test(lower)){
    const q=userMessage.replace(/.*(search|look up|google)\s+/i,'').trim()||userMessage; calls.push({name:'web_search',args:{query:q}});
  }
  const m=userMessage.match(/https?:\/\/\S+/i); if(/(open |fetch |read )https?:\/\/\S+/i.test(lower)&&m)calls.push({name:'open_page',args:{url:m[0]}});
  if(/(search (on )?x|twitter|posts about)/i.test(lower))calls.push({name:'x_search',args:{query:userMessage}});
  return calls;
}
