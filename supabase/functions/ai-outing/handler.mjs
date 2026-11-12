import {ORIGIN,tokyoDate,validateRequest,readForecast,parseCandidates,selectRecommendations,SEARCH_FORMAT,searchPrompt} from './recommend.mjs';
class ServiceError extends Error{constructor(message,status=503,code='service_error'){super(message);this.status=status;this.code=code;}}
export function createHandler({env,fetch:fetcher=fetch,now=()=>new Date()}){
  const cache=new Map();
  async function json(url,options={},timeout=15000){
    let response;
    try{response=await fetcher(url,{...options,signal:AbortSignal.timeout(timeout)});}catch{throw new ServiceError('外部サービスに接続できませんでした。時間を置いて再実行してください。');}
    let data;try{data=await response.json();}catch{throw new ServiceError('外部サービスの応答を読み取れませんでした。');}
    if(!response.ok){
      if(url.startsWith('https://api.openai.com/')){
        if(response.status===401||response.status===403)throw new ServiceError('OpenAI APIキーまたはモデルの利用権限をSupabaseのSecretsで確認してください。',503,'ai_configuration');
        if(response.status===429)throw new ServiceError('OpenAI APIの残高または利用上限に達しています。API側の請求設定を確認してください。',503,'ai_capacity');
        console.error('ai-outing provider failure',response.status,String(data?.error?.code||'unknown'));
      }
      throw new ServiceError('外部サービスでエラーが発生しました。時間を置いて再実行してください。');
    }
    return data;
  }
  async function forecast(latitude,longitude,date){
    const url=new URL('https://api.open-meteo.com/v1/forecast');
    url.search=new URLSearchParams({latitude:String(latitude),longitude:String(longitude),daily:'weather_code,precipitation_probability_max,temperature_2m_max,temperature_2m_min,wind_speed_10m_max',start_date:date,end_date:date,timezone:'Asia/Tokyo'});
    try{return readForecast(await json(url.toString()),date);}catch{throw new ServiceError('天気予報を取得できないため、天候を考慮した提案を作成できません。時間を置いて再実行してください。',503,'weather_unavailable');}
  }
  return async request=>{
    const origin=request.headers.get('Origin');
    const allowed=!origin||origin==='https://showatanabe66.github.io';
    const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'https://showatanabe66.github.io','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
    const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
    if(!allowed)return reply(403,{error:'このサイトからのアクセスは許可されていません。'});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return reply(405,{error:'POSTで送信してください。'});
    const authorization=request.headers.get('Authorization')??'';
    if(!authorization.startsWith('Bearer '))return reply(401,{error:'ログインし直してください。'});
    try{
      const base=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY');
      const authHeaders={apikey:anon,Authorization:authorization,'Content-Type':'application/json'};
      const authResponse=await fetcher(`${base}/auth/v1/user`,{headers:authHeaders,signal:AbortSignal.timeout(10000)});
      if(!authResponse.ok)return reply(401,{error:'ログインし直してください。'});
      const user=await authResponse.json();if(!user?.id)return reply(401,{error:'ログインし直してください。'});
      let body;
      try{const text=await request.text();if(text.length>4096)return reply(413,{error:'リクエストが大きすぎます。'});body=JSON.parse(text);}catch{return reply(400,{error:'日付と予算の設定を確認してください。'});}
      if(body.action==='status')return reply(200,{configured:!!env('OPENAI_API_KEY')});
      let params;try{params=validateRequest(body,now());}catch(error){return reply(400,{error:error.message});}
      const apiKey=env('OPENAI_API_KEY');
      if(!apiKey)return reply(503,{error:'AI提案の初期設定が必要です。SupabaseのEdge Functions → SecretsにOPENAI_API_KEYを登録してください。',code:'setup_required'});
      const cacheKey=JSON.stringify([user.id,params]);
      const saved=cache.get(cacheKey);if(saved&&saved.expires>now().getTime())return reply(200,{...saved.value,cached:true});
      const originWeather=await forecast(ORIGIN.latitude,ORIGIN.longitude,params.date);
      const quota=await json(`${base}/rest/v1/rpc/consume_ai_request`,{method:'POST',headers:authHeaders,body:'{}'});
      if(quota!==true)return reply(429,{error:'本日のAI検索は10回までです。明日またお試しください。'});
      let registered=[];
      try{registered=await json(`${base}/rest/v1/outings?select=name,area&limit=40`,{headers:authHeaders});if(!Array.isArray(registered))registered=[];}catch{/* Web search works independently of saved candidates. */}
      const response=await json('https://api.openai.com/v1/responses',{
        method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
        body:JSON.stringify({model:env('OPENAI_OUTING_MODEL')||'gpt-5.4-mini-2026-03-17',store:false,reasoning:{effort:'low'},tools:[{type:'web_search',search_context_size:'medium',user_location:{type:'approximate',country:'JP',region:'Kanagawa',city:'Yokohama',timezone:'Asia/Tokyo'}}],tool_choice:'required',include:['web_search_call.action.sources'],max_output_tokens:8000,text:{format:SEARCH_FORMAT},input:searchPrompt(params,originWeather,registered)}),
      },75000);
      let candidates;try{candidates=parseCandidates(response);}catch(error){throw new ServiceError(error.message,503,'search_failed');}
      let durations=[],forecasts=[];
      if(candidates.length){
        const coordinates=[ORIGIN,...candidates].map(p=>`${p.longitude},${p.latitude}`).join(';');
        const destinations=candidates.map((_,index)=>index+1).join(';');
        const routeUrl=`https://router.project-osrm.org/table/v1/driving/${coordinates}?sources=0&destinations=${destinations}&annotations=duration`;
        const results=await Promise.all([
          json(routeUrl,{},15000),
          Promise.all(candidates.map(candidate=>forecast(candidate.latitude,candidate.longitude,params.date).catch(()=>null))),
        ]);
        if(results[0].code!=='Ok'||!Array.isArray(results[0].durations?.[0]))throw new ServiceError('車の所要時間を確認できませんでした。時間を置いて再実行してください。',503,'route_unavailable');
        durations=results[0].durations[0];forecasts=results[1];
      }
      const recommendations=selectRecommendations(candidates,durations,forecasts,originWeather,params);
      const result={date:params.date,origin:ORIGIN.name,ages:[4,6],max_drive_minutes:120,origin_weather:originWeather,checked_at:now().toISOString(),recommendations,
        message:recommendations.length===3?'条件に合う候補を3件見つけました。':`営業・年齢・天気・移動時間の条件を確認できた候補は${recommendations.length}件です。条件を満たさない候補は表示していません。`,
        travel_note:'車の時間はOSRM / OpenStreetMapによる渋滞を含まない目安です。有料道路・駐車場への移動も含め、出発前にGoogleマップで確認してください。',weather_note:'天気はOpen-Meteoの予報です。降水確率40%以上、雨・雪・霧・雷雨、最大風速36km/h以上の予報では屋内施設に絞っています。',cached:false};
      if(cache.size>=100)cache.delete(cache.keys().next().value);
      cache.set(cacheKey,{expires:now().getTime()+15*60000,value:result});
      return reply(200,result);
    }catch(error){
      if(error instanceof ServiceError)return reply(error.status,{error:error.message,code:error.code});
      console.error('ai-outing request failed');return reply(503,{error:'提案を作成できませんでした。時間を置いて再実行してください。'});
    }
  };
}
