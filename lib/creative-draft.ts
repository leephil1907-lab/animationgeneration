export type CreationMode='image'|'video'|'scene';
export type CreationDraft={id:string;mode:CreationMode;characterId:string;characterName:string;prompt:string;messages:Array<{role:'user'|'assistant';content:string}>;createdAt:string};
export const CREATION_DRAFT_KEY='motiona-creation-draft';
export function saveCreationDraft(draft:CreationDraft){if(typeof window==='undefined')return;try{localStorage.setItem(CREATION_DRAFT_KEY,JSON.stringify(draft));}catch{}}
export function loadCreationDraft():CreationDraft|null{if(typeof window==='undefined')return null;try{const raw=localStorage.getItem(CREATION_DRAFT_KEY);return raw?JSON.parse(raw):null;}catch{return null;}}
export function clearCreationDraft(){if(typeof window==='undefined')return;try{localStorage.removeItem(CREATION_DRAFT_KEY);}catch{}}