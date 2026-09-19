import {
  DEFAULT_GROTTO_MODEL_ENVIRONMENT,
  GROTTO_MODEL_DEFAULT_NEGATIVE_PROMPTS,
  GROTTO_MODEL_DEFAULT_PROMPTS,
  grottoModelEnvironment,
  grottoModelEnvironmentAir,
  grottoModelEnvironmentList,
  type GrottoModelEnvironmentId,
} from "./grotto-model-environments.ts";
import {
  grottoAdditionalNetworks,
  grottoLoraList,
  grottoLoraTriggerWords,
  MAX_GROTTO_LORAS,
  resolveGrottoLoras,
  type GrottoLoraSelection,
} from "./grotto-loras.ts";
import { grottoEmbeddingList, grottoEmbeddingNetworks, resolveGrottoEmbeddings } from "./grotto-embeddings.ts";

const ORCHESTRATION_BASE_URL = "https://orchestration.civitai.com";
export type StudioFormat = "Portrait" | "Square" | "Landscape";
export type StudioGenerationInput = {
  environmentId: GrottoModelEnvironmentId;
  prompt: string;
  negativePrompt: string;
  format: StudioFormat;
  quantity: 1 | 4;
  referenceId?: string;
  strength?: number;
  loras?: GrottoLoraSelection[];
  embeddings?: string[];
};
type CivitaiImage = { id?: string; url: string };
export type WorkflowSnapshot = { id: string; status: string; cost?: { total?: number }; transactions?: Array<{ amount?: number; quantity?: number }>; steps?: Array<{ output?: { images?: Array<{ id?: string; url?: string; available?: boolean }>; blobs?: Array<{ url?: string; type?: string; mimeType?: string }> } }>; [key: string]: unknown };

function token() { return process.env.CIVITAI_ORCHESTRATION_TOKEN?.trim() || ""; }
function isCivitaiCheckpointAir(value: string) { return /^urn:air:[^:]+:checkpoint:civitai:\d+@\d+$/.test(value); }
function studioDefaultNegative() { return process.env.CIVITAI_STUDIO_DEFAULT_NEGATIVE?.trim() || "low quality, bad anatomy, extra fingers, extra limbs, text, watermark"; }
function studioSteps() { const value = Number(process.env.CIVITAI_STUDIO_DEFAULT_STEPS ?? 28); return Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 1), 50) : 28; }
function studioCfg() { const value = Number(process.env.CIVITAI_STUDIO_DEFAULT_CFG ?? 5); return Number.isFinite(value) ? Math.min(Math.max(value, 1), 30) : 5; }
function studioMaxImages() { const value = Number(process.env.CIVITAI_STUDIO_MAX_IMAGES ?? 4); return Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 1), 4) : 4; }

export function grottoStudioStatus() {
  const enabled = process.env.GROTTO_GENERATION_ENABLED === "true";
  const providerConfigured = token().length > 0;
  const environments = grottoModelEnvironmentList().map((environment) => ({ ...environment, configured: isCivitaiCheckpointAir(grottoModelEnvironmentAir(environment.id)) }));
  const checkpointConfigured = environments.some((environment) => environment.configured);
  return { enabled, provider: "civitai", providerConfigured, checkpointConfigured, checkpointLabel: grottoModelEnvironment(DEFAULT_GROTTO_MODEL_ENVIRONMENT).label, configured: enabled && providerConfigured && checkpointConfigured, defaultEnvironmentId: DEFAULT_GROTTO_MODEL_ENVIRONMENT, defaultPrompts: GROTTO_MODEL_DEFAULT_PROMPTS, defaultNegativePrompts: { "pony-v6": studioDefaultNegative(), ...GROTTO_MODEL_DEFAULT_NEGATIVE_PROMPTS }, environments, loras: grottoLoraList(), embeddings: grottoEmbeddingList(), maxLoras: MAX_GROTTO_LORAS, defaultNegative: studioDefaultNegative(), maxImages: studioMaxImages() };
}

function studioDimensions(format:StudioFormat){ if(format==="Landscape") return {width:1216,height:832}; if(format==="Square") return {width:1024,height:1024}; return {width:832,height:1216}; }

export function buildStudioWorkflow(input:StudioGenerationInput,sourceImage?:string){
  const {width,height}=studioDimensions(input.format);
  const environmentId=input.environmentId ?? DEFAULT_GROTTO_MODEL_ENVIRONMENT;
  const environment=grottoModelEnvironment(environmentId);
  const model=grottoModelEnvironmentAir(environmentId);
  if(!isCivitaiCheckpointAir(model)) throw new Error(`${environment.label} is not configured with a valid Civitai checkpoint AIR.`);
  const resolvedLoras=resolveGrottoLoras(input.loras,environmentId);
  const resolvedEmbeddings=resolveGrottoEmbeddings(input.embeddings,environmentId);
  const triggerWords=[...grottoLoraTriggerWords(resolvedLoras),...resolvedEmbeddings.map((embedding)=>embedding.triggerWord)];
  const prompt=[input.prompt.trim(),...new Set(triggerWords)].filter(Boolean).join(", ");
  const additionalNetworks={...grottoAdditionalNetworks(resolvedLoras),...grottoEmbeddingNetworks(resolvedEmbeddings)};
  const networkInput=Object.keys(additionalNetworks).length?{additionalNetworks}:{};
  const loras=resolvedLoras.map(({id,label,air,weight})=>({id,label,air,weight}));
  const embeddings=resolvedEmbeddings.map(({id,label,air,triggerWord})=>({id,label,air,triggerWord}));
  return { environment:{ id:environment.id,label:environment.label,family:environment.family,air:model }, loras, embeddings, prompt, body:{tags:["wizard-os","grotto","studio","pony",environment.id],steps:[{$type:"textToImage",name:"studio",timeout:"00:20:00",input:{model,...networkInput,...(sourceImage?{sourceImage,sourceImageDenoiseStrenght:input.strength??0.35}:{}),prompt,negativePrompt:input.negativePrompt.trim(),quantity:input.quantity,width,height,steps:studioSteps(),cfgScale:studioCfg(),scheduler:"EulerA",clipSkip:2}}]}};
}

export function civitaiOutputHeaders(){ const accessToken=token(); if(!accessToken) throw new Error("Civitai is not configured."); return {Accept:"image/*",Authorization:`Bearer ${accessToken}`}; }
export function authenticatedCivitaiOutputUrl(raw:string){ const url=new URL(raw); if(url.protocol!=="https:") throw new Error("Civitai returned an invalid image URL."); if(url.hostname!=="civitai.com"&&!url.hostname.endsWith(".civitai.com")) throw new Error("Civitai returned an unexpected image host."); url.search=""; return url.toString(); }
function describeCivitaiError(payload:unknown,status:number){ if(!payload||typeof payload!=="object") return `Civitai request failed (${status}).`; const record=payload as Record<string,unknown>; if(typeof record.message==="string"&&record.message.trim()) return `Civitai: ${record.message.trim()}`; if(typeof record.detail==="string"&&record.detail.trim()) return `Civitai: ${record.detail.trim()}`; const errors=record.errors; if(errors&&typeof errors==="object"){ const details=Object.entries(errors as Record<string,unknown>).flatMap(([field,value])=>(Array.isArray(value)?value:[value]).filter((item):item is string=>typeof item==="string"&&item.trim().length>0).map(item=>`${field}: ${item.trim()}`)); if(details.length) return `Civitai ${status}: ${details.slice(0,3).join("; ")}`; } if(typeof record.title==="string"&&record.title.trim()) return `Civitai ${status}: ${record.title.trim()}`; return `Civitai request failed (${status}).`; }
async function callOrchestrator(path:string,init:RequestInit={}){ const accessToken=token(); if(!accessToken) throw new Error("Civitai is not configured."); const response=await fetch(`${ORCHESTRATION_BASE_URL}${path}`,{...init,headers:{"content-type":"application/json",Authorization:`Bearer ${accessToken}`,...(init.headers??{})},cache:"no-store"}); const text=await response.text(); let payload:unknown=null; try{payload=text?JSON.parse(text):null}catch{payload=text} if(!response.ok) throw new Error(describeCivitaiError(payload,response.status)); return payload as WorkflowSnapshot; }
export function estimateStudioGeneration(input:StudioGenerationInput,sourceImage?:string){ const {body}=buildStudioWorkflow(input,sourceImage); return callOrchestrator("/v2/consumer/workflows?whatif=true",{method:"POST",body:JSON.stringify(body)}); }
export function submitStudioGeneration(input:StudioGenerationInput,sourceImage?:string){ const {body}=buildStudioWorkflow(input,sourceImage); return callOrchestrator("/v2/consumer/workflows",{method:"POST",body:JSON.stringify(body)}); }
export function getGeneration(workflowId:string,waitSeconds=0){ const wait=Math.min(Math.max(Math.floor(waitSeconds),0),30); const suffix=wait?`?wait=${wait}`:""; return callOrchestrator(`/v2/consumer/workflows/${encodeURIComponent(workflowId)}${suffix}`,{method:"GET"}); }
export function isTerminalWorkflow(status:string){ return ["succeeded","failed","expired","canceled","cancelled"].includes(status.toLowerCase()); }
export function extractWorkflowImages(snapshot:WorkflowSnapshot):CivitaiImage[]{ const images:CivitaiImage[]=[]; snapshot.steps?.forEach(step=>{ step.output?.images?.forEach(image=>{if(image.url&&image.available!==false) images.push({id:image.id,url:image.url})}); step.output?.blobs?.forEach(blob=>{if(blob.url&&(!blob.mimeType||blob.mimeType.startsWith("image/"))) images.push({url:blob.url})}); }); return images; }
