let snapshots = [];
export function importedItems(source) {
  return (snapshots.find(row => row.source === source)?.items ?? []).map(item => ({...item, imported:true}));
}
export function clearImports() { snapshots = []; }
export async function refreshImports(client) {
  const {data:{session}} = await client.auth.getSession();
  if (!session) { clearImports(); return; }
  const {data,error} = await client.from('apple_sync_snapshots').select('source,items,synced_at').eq('owner_id',session.user.id);
  const {data:{session:currentSession}} = await client.auth.getSession();
  if (currentSession?.user.id !== session.user.id) { clearImports(); return; }
  snapshots = error ? [] : data ?? [];
  const status = document.getElementById('appleSyncStatus');
  status.textContent = error ? '同期は未設定、または読み込みできません。設定手順を確認してください。' :
    snapshots.length ? snapshots.map(row => `${({schedules:'予定',shopping:'買い物',tasks:'タスク'})[row.source]}：${row.items.length}件（${new Date(row.synced_at).toLocaleString('ja-JP')}）`).join(' ／ ') : 'まだ同期されていません。iPhoneからショートカットを実行してください。';
}
export function initAppleSync(client) {
  const keyOutput = document.getElementById('appleSyncKey');
  const status = document.getElementById('appleSyncStatus');
  document.getElementById('appleSyncEndpoint').value = `${client.supabaseUrl}/functions/v1/apple-sync`;
  for (const [id,action] of [
    ['appleSyncCreate', async () => {
      if (!confirm('同期キーを発行します。既存のキーがある場合は使えなくなります。続けますか？')) return;
      keyOutput.textContent = '';
      const {data:{session}} = await client.auth.getSession();
      if (!session) throw new Error('ログインしてください。');
      const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,'0')).join('');
      const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
      const hash = Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,'0')).join('');
      const {error} = await client.from('apple_sync_devices').upsert({owner_id:session.user.id,token_hash:hash,expires_at:new Date(Date.now()+90*86400000).toISOString()});
      if (error) throw new Error('発行できません。Supabaseの同期設定と通信状態を確認してください。');
      keyOutput.textContent = key;
      status.textContent = 'キーを発行しました（有効期間90日）。今だけ表示されます。iPhoneのショートカットに保存してください。';
    }],
    ['appleSyncRevoke', async () => {
      const {data:{session}} = await client.auth.getSession();
      if (!session) throw new Error('ログインしてください。');
      const {error} = await client.from('apple_sync_devices').delete().eq('owner_id',session.user.id);
      if (error) throw new Error('解除できませんでした。');
      keyOutput.textContent = ''; status.textContent = '同期キーを無効にしました。受信済みの情報は残ります。';
    }],
    ['appleSyncRefresh', async () => { document.dispatchEvent(new Event('apple-sync-refresh')); }],
  ]) {
    const button = document.getElementById(id);
    button.onclick = async () => {
      button.disabled=true;
      try { await action(); } catch(error) { status.textContent=error.message; }
      finally { button.disabled=false; }
    };
  }
  client.auth.onAuthStateChange(() => { clearImports(); keyOutput.textContent=''; status.textContent=''; });
}
