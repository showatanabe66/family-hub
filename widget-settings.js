export function initWidgetSettings(client){
  const keyOutput=document.getElementById('widgetKey'),status=document.getElementById('widgetStatus'),copy=document.getElementById('widgetCopy');
  function clearKey(){keyOutput.textContent='';copy.hidden=true;}
  for(const [id,action] of [
    ['widgetCreate',async()=>{
      if(!confirm('読み取り専用のウィジェット用キーを発行します。再発行すると、以前のウィジェット用キーは使えなくなります。'))return;
      clearKey();
      const {data:{session}}=await client.auth.getSession();if(!session)throw Error('ログインしてください。');
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
      const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
      const {error}=await client.from('widget_devices').upsert({owner_id:session.user.id,token_hash:hash,expires_at:new Date(Date.now()+90*86400000).toISOString()});
      if(error)throw Error('キーを発行できませんでした。ログイン状態と通信を確認してください。');
      const {data:{session:current}}=await client.auth.getSession();if(current?.user.id!==session.user.id)return;
      keyOutput.textContent=token;copy.hidden=false;status.textContent='発行しました。有効期間は90日です。コピーしてScriptableの初回設定に貼り付けてください。';
    }],
    ['widgetRevoke',async()=>{
      if(!confirm('ウィジェット用キーを無効にしますか？ iPhone上の表示済みデータは、次にウィジェットが更新されるまで残る場合があります。'))return;
      const {data:{session}}=await client.auth.getSession();if(!session)throw Error('ログインしてください。');
      const {error}=await client.from('widget_devices').delete().eq('owner_id',session.user.id);if(error)throw Error('無効化できませんでした。通信を確認してください。');
      clearKey();status.textContent='ウィジェット用キーを無効にしました。Apple同期のキーは引き続き使えます。';
    }],
    ['widgetCopy',async()=>{
      if(!keyOutput.textContent)return;
      try{await navigator.clipboard.writeText(keyOutput.textContent);status.textContent='コピーしました。Scriptableで初回実行し、キー入力欄に貼り付けてください。';}
      catch{status.textContent='自動コピーできませんでした。表示されたキーを長押ししてコピーしてください。';}
    }],
  ]){
    const button=document.getElementById(id);button.onclick=async()=>{button.disabled=true;try{await action();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
  }
  client.auth.onAuthStateChange(()=>{clearKey();status.textContent='';});
}
