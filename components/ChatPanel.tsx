'use client';

import { useEffect,useRef,useState } from 'react';
import { MessageSquare,Send,Sparkles,Bot,User,ChevronDown,Plus,Wrench } from 'lucide-react';
import type { Conversation,Message,ToolCall } from '@/lib/types';

const STORAGE_KEY='ags-conversations';
function loadConversations():Conversation[]{try{const raw=localStorage.getItem(STORAGE_KEY);return raw?JSON.parse(raw):[]}catch{return[]}}
function saveConversations(list:Conversation[]){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(list))}catch{}}

function ToolCard({tool}:{tool:ToolCall}){
  const [open,setOpen]=useState(tool.status!=='completed');
  return <div className="toolCard"><button type="button" className="toolHead" onClick={()=>setOpen(v=>!v)}><Wrench size={14}/><span className="toolName">{tool.name}</span><span className={'toolStatus '+tool.status}>{tool.status}</span><ChevronDown size={14} className={open?'rot':''}/></button>{open&&tool.result&&<pre className="toolResult">{tool.result}</pre>}</div>;
}

export default function ChatPanel(){
  const [conversations,setConversations]=useState<Conversation[]>([]),[activeId,setActiveId]=useState(''),[input,setInput]=useState(''),[sending,setSending]=useState(false);
  const bottomRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{const list=loadConversations();setConversations(list);if(list.length)setActiveId(list[0].id)},[]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'})},[conversations,activeId,sending]);
  const active=conversations.find(c=>c.id===activeId);
  function createConversation(){const now=new Date().toISOString();const c:Conversation={id:crypto.randomUUID(),title:'New conversation',createdAt:now,updatedAt:now,messages:[]};const next=[c,...conversations];setConversations(next);saveConversations(next);setActiveId(c.id)}
  async function send(){
    if(!input.trim()||sending)return; let conv=active;
    if(!conv){const now=new Date().toISOString();conv={id:crypto.randomUUID(),title:input.trim().slice(0,40),createdAt:now,updatedAt:now,messages:[]};setConversations(prev=>{const next=[conv!,...prev];saveConversations(next);return next});setActiveId(conv.id)}
    const userMsg:Message={id:crypto.randomUUID(),role:'user',content:input.trim(),createdAt:new Date().toISOString()};
    setInput('');setSending(true);
    setConversations(prev=>{const next=prev.map(c=>c.id===conv!.id?{...c,title:c.messages.length===0?userMsg.content.slice(0,40):c.title,updatedAt:new Date().toISOString(),messages:[...c.messages,userMsg]}:c);saveConversations(next);return next});
    try{
      const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:userMsg.content,conversationId:conv.id})});
      const data=await res.json();if(!res.ok)throw new Error(data.error||'Chat failed');
      const assistantMsg=data.message as Message;
      setConversations(prev=>{const next=prev.map(c=>c.id===conv!.id?{...c,updatedAt:new Date().toISOString(),messages:[...c.messages,assistantMsg]}:c);saveConversations(next);return next});
    }catch(e){const errMsg:Message={id:crypto.randomUUID(),role:'assistant',content:'Error: '+(e instanceof Error?e.message:String(e)),createdAt:new Date().toISOString()};setConversations(prev=>{const next=prev.map(c=>c.id===conv!.id?{...c,messages:[...c.messages,errMsg]}:c);saveConversations(next);return next})}
    finally{setSending(false)}
  }
  return <section className="chatWorkspace">
    <aside className="chatSidebar"><button className="primary newChat" onClick={createConversation}><Plus size={16}/> New chat</button>
      <div className="chatList">{conversations.map(c=><button key={c.id} className={c.id===activeId?'chatItem active':'chatItem'} onClick={()=>setActiveId(c.id)}><MessageSquare size={14}/><span>{c.title||'Untitled'}</span></button>)}{!conversations.length&&<p className="emptyHint">No conversations yet. Start one below.</p>}</div>
      <div className="toolLegend"><b>Available tools</b><span>comfyui_generate</span><span>web_search</span><span>open_page</span><span>x_search</span><span>code_exec</span></div>
    </aside>
    <div className="chatMain"><div className="chatMessages">
      {!active||!active.messages.length?<div className="chatEmpty"><Sparkles size={28}/><h2>Agent conversation</h2><p>Persistent threads with real tool execution. Generate with ComfyUI, open pages, or search once API keys are set.</p></div>:
      active.messages.map(m=><div key={m.id} className={'msg '+m.role}><div className="msgAvatar">{m.role==='user'?<User size={16}/>:<Bot size={16}/>}</div><div className="msgBody"><div className="msgContent">{m.content}</div>{m.toolCalls?.map(t=><ToolCard key={t.id} tool={t}/>)}<div className="msgTime">{new Date(m.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div></div></div>)}
      {sending&&<div className="msg assistant"><div className="msgAvatar"><Bot size={16}/></div><div className="msgBody"><div className="typing">Thinking / running tools…</div></div></div>}<div ref={bottomRef}/>
    </div><div className="chatInputBar"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Ask to generate, search, or open a URL…" rows={1}/><button className="primary sendBtn" disabled={!input.trim()||sending} onClick={send}><Send size={16}/></button></div></div>
  </section>;
}
