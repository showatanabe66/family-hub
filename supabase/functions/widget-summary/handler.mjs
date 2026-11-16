export function createWidgetHandler({env,fetch:fetcher=fetch,cryptoImpl=crypto}){
  const headers={'Content-Type':'application/json','Cache-Control':'no-store, private','Pragma':'no-cache'};
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  return async request=>{
    if(request.method!=='GET')return reply(405,{error:'GETで取得してください。'});
    const token=request.headers.get('X-Widget-Key')??'';
    if(!/^[a-f0-9]{64}$/.test(token))return reply(401,{error:'ウィジェット用キーを設定してください。'});
    try{
      const digest=await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(token));
      const hash=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
      const service=env('SUPABASE_SERVICE_ROLE_KEY'),base=env('SUPABASE_URL');
      const response=await fetcher(`${base}/rest/v1/rpc/get_widget_summary`,{method:'POST',headers:{'Content-Type':'application/json',apikey:service,Authorization:`Bearer ${service}`},body:JSON.stringify({p_token_hash:hash}),signal:AbortSignal.timeout(10000)});
      if(!response.ok)return reply(503,{error:'予定を取得できませんでした。時間を置いて再実行してください。'});
      const data=await response.json();
      if(!data)return reply(401,{error:'キーが期限切れ、または無効になっています。Hubで発行し直してください。'});
      // Emit a standard millisecond ISO timestamp for iOS JavaScriptCore.
      data.generated_at=new Date(data.generated_at).toISOString();
      return reply(200,data);
    }catch{return reply(503,{error:'Hubに接続できませんでした。通信を確認してください。'});}
  };
}
