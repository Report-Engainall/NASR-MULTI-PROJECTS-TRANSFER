import { createClient } from "npm:@supabase/supabase-js@2";
import { buildGeminiRequestConfig, estimateCost,estimateInputTokens,isSafeProviderBaseUrl,parseProviderResponse,sanitizeAiQuestion,type AiProvider,type AiCostRates } from "./logic.ts";
type Runtime={env:{get(n:string):string|undefined};serve(h:(r:Request)=>Response|Promise<Response>):void};
type Settings={status:string;primary_provider:AiProvider;primary_model:string;primary_base_url:string;fallback_enabled:boolean;fallback_provider:AiProvider;fallback_model:string;fallback_base_url:string};
type Candidate={provider:AiProvider;model:string;baseUrl:string;key:string;rates:AiCostRates;fallback:boolean};
const d=(globalThis as unknown as {Deno?:Runtime}).Deno;
if(!d)throw new Error("Supabase Edge Runtime required.");
const SYSTEM="أجب بالعربية. ليس لديك بيانات مباشرة من قاعدة بيانات متجر الأغبري. لا تخمّن أسعاراً أو طلبات أو أرصدة أو مخزوناً؛ وجّه تلك الأسئلة إلى الشاشات الموثقة. لا تنفذ إجراءات مالية أو تغيّر بيانات. قدّم إرشاداً عاماً وميّز الحقيقة عن الافتراض.";
const SAFE="لم تتوفر إجابة خارجية موثوقة الآن. أستطيع تقديم إرشاد عام، أما الأسعار والطلبات والفواتير والمخزون الفعلي فتأكد منها من الشاشات الموثقة داخل متجر الأغبري.";
function reply(payload:Record<string,unknown>,status=200){return new Response(JSON.stringify(payload),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-headers":"authorization, apikey, x-client-info, content-type","access-control-allow-methods":"POST, OPTIONS"}});}
function rates(provider:AiProvider):AiCostRates|null {
 const p=provider==="gemini"?"AI_GEMINI":"AI_OPENAI_COMPATIBLE",a=d?.env.get(p+"_INPUT_COST_PER_1K"),b=d?.env.get(p+"_OUTPUT_COST_PER_1K");
 if(a===undefined||b===undefined||a.trim()===""||b.trim()==="")return null;
 const inputPerThousand=Number(a),outputPerThousand=Number(b);
 return Number.isFinite(inputPerThousand)&&inputPerThousand>=0&&Number.isFinite(outputPerThousand)&&outputPerThousand>=0?{inputPerThousand,outputPerThousand}:null;
}
function candidate(provider:AiProvider,model:string,baseUrl:string,fallback:boolean):Candidate|null {
 const key=d?.env.get(provider==="gemini"?"AI_GEMINI_API_KEY":"AI_OPENAI_COMPATIBLE_API_KEY")?.trim(),r=rates(provider);
 if(!key||!r||!model.trim()||!isSafeProviderBaseUrl(baseUrl, provider))return null;
 return {provider,model,baseUrl:baseUrl.replace(/\/+$/,""),key,rates:r,fallback};
}
function cleanText(value:string){let out="";for(const c of value){const n=c.charCodeAt(0);if((n<32&&n!==9&&n!==10)||n===127)continue;out+=c;}return out.trim().slice(0,5000);}
async function callProvider(c:Candidate,q:string,signal:AbortSignal){
 let url:URL,headers:Record<string,string>,payload:unknown;
 if(c.provider==="openai_compatible"){
  url=new URL(c.baseUrl+"/chat/completions");headers={"content-type":"application/json",authorization:"Bearer "+c.key};
  payload={model:c.model,messages:[{role:"system",content:SYSTEM},{role:"user",content:q}],temperature:0.2,max_tokens:384};
 }else{
  const request=buildGeminiRequestConfig(c.baseUrl,c.model,c.key);
  url=request.url;headers=request.headers;
  payload={systemInstruction:{parts:[{text:SYSTEM}]},contents:[{role:"user",parts:[{text:q}]}],generationConfig:{temperature:0.2,maxOutputTokens:384}};
 }
 const r=await fetch(url,{method:"POST",headers,body:JSON.stringify(payload),signal});
 if(!r.ok)throw new Error("provider_http_"+r.status);
 return parseProviderResponse(c.provider,await r.json());
}
if(d)d.serve(async(request)=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"authorization, apikey, x-client-info, content-type","access-control-allow-methods":"POST, OPTIONS"}});
 if(request.method!=="POST")return reply({error:"method_not_allowed"},405);
 const bearer=/^Bearer\s+(.+)$/i.exec(request.headers.get("authorization")??"");
 const endpoint=d.env.get("SUPABASE_URL"),serviceKey=d.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!bearer)return reply({error:"unauthorized"},401);
 if(!endpoint||!serviceKey)return reply({error:"gateway_not_configured"},503);
 const db=createClient(endpoint,serviceKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const {data:authData,error:authError}=await db.auth.getUser(bearer[1]);
 if(authError||!authData.user)return reply({error:"unauthorized"},401);
 let raw="";try{raw=await request.text();}catch{return reply({error:"invalid_request"},400);}
 if(raw.length>4096)return reply({error:"request_too_large"},413);
 let parsed:unknown;try{parsed=JSON.parse(raw);}catch{return reply({error:"invalid_json"},400);}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return reply({error:"invalid_request"},400);
 const body=parsed as Record<string,unknown>,action=body.action==="test_connection"?"test_connection":body.action==="ask"?"ask":null;
 if(!action)return reply({error:"unsupported_action"},400);
 const {data:profile,error:profileError}=await db.from("profiles").select("id,organization_id").eq("auth_user_id",authData.user.id).eq("is_active",true).maybeSingle();
 if(profileError||!profile?.id||!profile.organization_id)return reply({error:"active_profile_required"},403);
 if(action==="test_connection"){
  const {data:roles,error}=await db.from("user_roles").select("role").eq("profile_id",profile.id);
  if(error||!Array.isArray(roles)||!roles.some((r:{role?:string})=>r.role==="admin"||r.role==="manager"))return reply({error:"administrator_or_manager_required"},403);
 }
 const input=action==="test_connection"?{ok:true as const,question:"Reply with exactly: Aghbari AI gateway connection confirmed."}:sanitizeAiQuestion(body.question);
 if(!input.ok)return reply({error:input.reason},400);
 const {data:configRaw,error:configError}=await db.rpc("get_ai_gateway_runtime_config",{p_user_id:authData.user.id});
 if(configError){console.error("AI config RPC failed",{code:(configError as {code?:string}).code??"unknown"});return reply({error:"gateway_configuration_failed"},503);}
 const config=configRaw as Settings|null;
 if(!config||config.status!=="enabled")return reply({status:"fallback",reason:"ai_disabled",answer:SAFE});
 const primary=candidate(config.primary_provider,config.primary_model,config.primary_base_url,false);
 const fallback=config.fallback_enabled?candidate(config.fallback_provider,config.fallback_model,config.fallback_base_url,true):null;
 const attempts=action==="test_connection"?(primary?[primary]:[]):[primary,fallback].filter((x):x is Candidate=>x!==null);
 if(!attempts.length)return action==="test_connection"?reply({error:"primary_provider_secret_or_rates_missing"},424):reply({status:"fallback",reason:"provider_not_configured",answer:SAFE});
 const outputEstimate=action==="test_connection"?64:384,inputEstimate=estimateInputTokens(input.question,SYSTEM.length);
 const estimatedCost=attempts.reduce((sum,c)=>sum+estimateCost(inputEstimate,outputEstimate,c.rates),0);
 const requestId=crypto.randomUUID();
 const {data:reservedRaw,error:reserveError}=await db.rpc("reserve_ai_gateway_usage",{p_user_id:authData.user.id,p_request_id:requestId,p_estimated_input_tokens:inputEstimate*attempts.length,p_estimated_output_tokens:outputEstimate*attempts.length,p_estimated_cost:Number(estimatedCost.toFixed(6))});
 if(reserveError){console.error("AI quota reserve failed",{code:(reserveError as {code?:string}).code??"unknown"});return reply({error:"quota_reservation_failed"},503);}
 const reservation=reservedRaw as Record<string,unknown>|null;
 if(!reservation||reservation.status!=="reserved"||typeof reservation.reservation_id!=="string"){
  const reason=reservation?.status==="quota_exceeded"?"quota_exceeded":reservation?.status==="disabled"?"ai_disabled":"request_not_reserved";
  return action==="test_connection"?reply({error:reason},reason==="quota_exceeded"?429:503):reply({status:"fallback",reason,answer:SAFE});
 }
 const started=Date.now();let inputTokens=0,outputTokens=0,actualCost=0,result:ReturnType<typeof parseProviderResponse>|null=null,used:Candidate|null=null;
 for(const c of attempts){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),action==="test_connection"?10000:15000);
  try{result=await callProvider(c,input.question,controller.signal);used=c;inputTokens+=result.usage.inputTokens;outputTokens+=result.usage.outputTokens;actualCost+=estimateCost(result.usage.inputTokens,result.usage.outputTokens,c.rates);break;}
  catch{inputTokens+=inputEstimate;actualCost+=estimateCost(inputEstimate,0,c.rates);}
  finally{clearTimeout(timer);}
 }
 const fallbackUsed=Boolean(used?.fallback),last=used??attempts[attempts.length-1];
 const {error:recordError}=await db.rpc("complete_ai_gateway_usage",{
  p_reservation_id:reservation.reservation_id,p_input_tokens:Math.min(inputTokens,2000000),p_output_tokens:Math.min(outputTokens,100000),
  p_actual_cost:Math.min(Number(actualCost.toFixed(6)),10000),p_execution_time_ms:Math.min(Math.max(0,Date.now()-started),600000),
  p_provider:last.provider,p_model_name:last.model,p_result_status:result?(fallbackUsed?"fallback":"completed"):"failed",
  p_fallback_used:fallbackUsed||(!result&&attempts.length>1),
 });
 if(recordError){console.error("AI usage ledger finalization failed",{code:(recordError as {code?:string}).code??"unknown"});return reply({error:"usage_accounting_failed"},500);}
 if(!result||!used)return action==="test_connection"?reply({error:"provider_connection_failed"},502):reply({status:"fallback",reason:"provider_unavailable",answer:SAFE});
 if(action==="test_connection")return reply({status:"connection_ok",provider:used.provider,model:used.model,fallback_used:fallbackUsed});
 return reply({status:fallbackUsed?"fallback":"completed",answer:cleanText(result.text),provider:used.provider,model:used.model,fallback_used:fallbackUsed});
});
