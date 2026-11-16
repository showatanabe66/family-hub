const button=document.getElementById('copyWidgetScript');
const code=document.getElementById('widgetScriptSource');
const status=document.getElementById('scriptCopyStatus');
try{
  const response=await fetch('./widgets/Family-Hub.js',{cache:'no-cache'});
  if(!response.ok)throw Error('load');
  code.value=await response.text();
  button.disabled=false;button.textContent='スクリプトをコピー';
}catch{
  button.textContent='読み込みできませんでした';status.textContent='通信を確認して、このページを再読み込みしてください。';
}
button.onclick=async()=>{
  try{await navigator.clipboard.writeText(code.value);status.textContent='コピーしました。Scriptableの新しいスクリプトへ貼り付けてください。';}
  catch{document.getElementById('scriptCodeDetails').open=true;code.focus();code.select();status.textContent='コードを表示しました。選択した内容をコピーしてください。';}
};
