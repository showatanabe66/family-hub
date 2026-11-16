// Watanabe Family Hub — Scriptable widget, version 1
// Run once inside Scriptable to enter a read-only widget key.
// Passwords, Apple sync keys and OpenAI API keys are not used here.
const HUB = 'https://showatanabe66.github.io/family-hub/';
const ENDPOINT = 'https://aaozokleopirgsuaubnz.supabase.co/functions/v1/widget-summary';
const KEY_SLOT = 'watanabe.familyhub.widget.v1';
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.libraryDirectory(), 'watanabe-family-hub-widget.json');
const colors = {
  background: Color.dynamic(new Color('f4f7ef'), new Color('18231e')),
  text: Color.dynamic(new Color('294737'), new Color('e6f0e3')),
  muted: Color.dynamic(new Color('74836b'), new Color('a1b19a')),
  accent: Color.dynamic(new Color('2d6552'), new Color('b4d6a1')),
};
function todayJapan() { return new Date(Date.now() + 9*3600000).toISOString().slice(0,10); }
function clockJapan(iso) {
  const date = new Date(Date.parse(iso) + 9*3600000);
  return `${String(date.getUTCHours()).padStart(2,'0')}:${String(date.getUTCMinutes()).padStart(2,'0')}`;
}
function readSettings() {
  try { const settings = JSON.parse(Keychain.get(KEY_SLOT)); return /^[a-f0-9]{64}$/.test(settings.key) && settings.cacheId ? settings : null; }
  catch { return null; }
}
function clearCache() { if(fm.fileExists(cachePath)) fm.remove(cachePath); }
function clearSettings() { if(Keychain.contains(KEY_SLOT)) Keychain.remove(KEY_SLOT); clearCache(); }
function cacheData(settings, data) { try { fm.writeString(cachePath, JSON.stringify({cacheId:settings.cacheId, data})); } catch {} }
function cachedData(settings) {
  try {
    const saved = JSON.parse(fm.readString(cachePath));
    const age = Date.now() - Date.parse(saved.data.generated_at);
    if(saved.cacheId === settings.cacheId && saved.data.date === todayJapan() && age >= 0 && age <= 6*3600000) return saved.data;
  } catch {}
  return null;
}
function problem(message, status) { const error = new Error(message); error.status = status; return error; }
async function requestSummary(key) {
  const request = new Request(ENDPOINT);
  request.method = 'GET';
  request.headers = {'X-Widget-Key':key};
  request.timeoutInterval = 15;
  request.onRedirect = () => null;
  let data;
  try { data = await request.loadJSON(); }
  catch {
    if(request.response && request.response.statusCode === 401) throw problem('ウィジェット用キーを再設定してください。',401);
    throw problem('Hubに接続できませんでした。',503);
  }
  if(request.response && request.response.statusCode === 401) throw problem('キーが期限切れ・無効です。Scriptableで再設定してください。',401);
  if((request.response && request.response.statusCode >= 400) || data.error) throw problem('Hubの情報を取得できませんでした。',503);
  if(data.version !== 1 || data.date !== todayJapan() || !Array.isArray(data.schedules) || !Number.isFinite(data.task_count) || !Number.isFinite(data.shopping_count) || !Number.isFinite(data.schedule_count)) throw problem('今日の情報を確認できませんでした。',503);
  return data;
}
async function notice(title,message) {
  const alert = new Alert(); alert.title=title; alert.message=message; alert.addAction('OK'); await alert.presentAlert();
}
async function pair() {
  const alert = new Alert();
  alert.title='Family Hubと連携';
  alert.message='Hubの「＋ 追加」→「iPhoneウィジェット」で発行した専用キーを貼り付けてください。Apple同期キーやOpenAI APIキーではありません。';
  alert.addSecureTextField('ウィジェット用キー（64文字）','');
  alert.addAction('接続する'); alert.addCancelAction('キャンセル');
  if(await alert.presentAlert() < 0) return null;
  const key=alert.textFieldValue(0).trim().toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(key)) { await notice('入力を確認してください','ウィジェット用キーの64文字だけを貼り付けてください。'); return null; }
  try {
    const data=await requestSummary(key);
    const settings={key,cacheId:UUID.string()};
    clearCache(); Keychain.set(KEY_SLOT,JSON.stringify(settings));cacheData(settings,data);
    return settings;
  } catch(error) { await notice('接続できませんでした',error.message);return null; }
}
function text(parent,value,size,color=colors.text,bold=false) {
  const node=parent.addText(String(value));node.font=bold?Font.semiboldSystemFont(size):Font.systemFont(size);node.textColor=color;node.lineLimit=1;node.minimumScaleFactor=0.75;return node;
}
function baseWidget() {
  const widget=new ListWidget();widget.backgroundColor=colors.background;widget.setPadding(14,14,12,14);widget.url=HUB+'?view=schedules';widget.refreshAfterDate=new Date(Date.now()+15*60000);return widget;
}
function errorWidget(message) {
  const widget=baseWidget();text(widget,'Watanabe Hub',13,colors.accent,true);widget.addSpacer(10);
  const line=text(widget,message,12,colors.muted);line.lineLimit=3;
  widget.url=URLScheme.forRunningScript();return widget;
}
function makeWidget(data,isCached) {
  const widget=baseWidget(), family=config.widgetFamily || 'medium', small=family==='small';
  const day=new Date(data.date+'T00:00:00Z');
  const dateLabel=`${Number(data.date.slice(5,7))}/${Number(data.date.slice(8))}（${['日','月','火','水','木','金','土'][day.getUTCDay()]}）`;
  const header=widget.addStack();header.centerAlignContent();
  text(header,'Watanabe Hub',small?11:13,colors.accent,true);header.addSpacer();
  if(!small)text(header,dateLabel,11,colors.muted);
  if(small){widget.addSpacer(4);text(widget,dateLabel,10,colors.muted);}
  widget.addSpacer(small?7:9);
  const body=widget.addStack();
  const events=body.addStack();events.layoutVertically();
  text(events,`今日の予定 ${data.schedule_count}件`,11,colors.muted,true);events.addSpacer(5);
  const maximum=small?1:family==='large'?7:3;
  if(!data.schedules.length)text(events,'予定はありません',12,colors.text);
  for(const event of data.schedules.slice(0,maximum)){
    const line=events.addStack();
    text(line,event.time || '終日',small?10:11,colors.accent,true);line.addSpacer(6);
    text(line,event.name,small?11:12,colors.text);
    events.addSpacer(small?0:4);
  }
  if(data.schedule_count>maximum)text(events,`ほか${data.schedule_count-maximum}件`,9,colors.muted);
  if(!small){
    body.addSpacer(12);const counts=body.addStack();counts.layoutVertically();counts.size=new Size(76,0);
    text(counts,`タスク ${data.task_count}`,15,colors.accent,true);counts.addSpacer(8);text(counts,`買い物 ${data.shopping_count}`,15,colors.accent,true);
  }else{
    widget.addSpacer(7);text(widget,`タスク ${data.task_count}  ·  買い物 ${data.shopping_count}`,11,colors.accent,true);
  }
  widget.addSpacer();
  text(widget,`${isCached?'保存分 · ':''}Hub取得 ${clockJapan(data.generated_at)}`,9,colors.muted);
  return widget;
}
async function main() {
  let settings=readSettings();
  if(config.runsInApp && settings){
    const menu=new Alert();menu.title='Family Hubウィジェット';
    menu.addAction('プレビュー');menu.addAction('専用キーを設定・変更');menu.addAction('Family Hubを開く');menu.addDestructiveAction('この端末の設定を削除');menu.addCancelAction('キャンセル');
    const choice=await menu.presentSheet();
    if(choice<0){Script.complete();return;}
    if(choice===1){const next=await pair();if(!next){Script.complete();return;}settings=next;}
    if(choice===2){await Safari.open(HUB+'?view=schedules');Script.complete();return;}
    if(choice===3){
      const confirm=new Alert();confirm.title='端末のキーと保存分を削除しますか？';confirm.addDestructiveAction('削除する');confirm.addCancelAction('キャンセル');
      if(await confirm.presentAlert()===0)clearSettings();Script.complete();return;
    }
  }else if(config.runsInApp && !settings){settings=await pair();if(!settings){Script.complete();return;}}
  let widget;
  if(!settings)widget=errorWidget('Scriptableで一度実行し、専用キーを設定してください。');
  else{
    let data=null,isCached=false;
    try {data=await requestSummary(settings.key);cacheData(settings,data);}
    catch(error){
      if(error.status===401){clearSettings();widget=errorWidget(error.message);}
      else{data=cachedData(settings);isCached=!!data;if(!data)widget=errorWidget('通信を確認して、Scriptableで再実行してください。');}
    }
    if(data)widget=makeWidget(data,isCached);
  }
  Script.setWidget(widget);
  if(config.runsInApp)await widget.presentMedium();
  Script.complete();
}
await main();
