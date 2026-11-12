import { dateLimits, renderAiRecommendations } from "./ai-outing-ui.js";
import { createOutingBrowser } from "./outing-browser.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/*
 * Supabase Dashboard > Project Settings > API
 * URL と Publishable key を設定してください。
 * service_role key は絶対にここへ貼らないでください。
 */
const SUPABASE_URL = "https://aaozokleopirgsuaubnz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_5jE4ze4_hRxTIT0ybKEImQ_OvKGt5S5";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const loginBox = $("login");
const appBox = $("app");

function message(id, text) { $(id).textContent = text; }

function mapSearchUrl(place) {
  const q = place.address || place.name;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
function mapDirectionsUrl(place) {
  const q = place.address || place.name;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}&travelmode=driving`;
}

async function refreshOutings() {
  const { data, error } = await supabase.from("outings")
    .select("*").order("favorite", { ascending: false }).order("name");
  if (error) throw error;
  renderOutings(data || []);
  return data || [];
}

function addOuting() {
  document.querySelector('[data-view="add"]').click();
  $("placeName").closest("details").open = true;
  $("placeName").focus();
}
function openOutingSection(id) {
  const section = $(id);
  section.querySelector("details").open = true;
  section.scrollIntoView({behavior:"smooth",block:"start"});
}
const outingBrowser = createOutingBrowser($("outingList"), {
  map:mapSearchUrl, route:mapDirectionsUrl, add:addOuting,
  error:text=>message("outingMessage",text),
  update:async (place,field,value)=>{
    message("outingMessage", "");
    const {error} = await supabase.from("outings").update({[field]:value}).eq("id",place.id);
    if(error)throw error;
    await refreshOutings();
  },
  remove:async place=>{
    if(!confirm(`${place.name}を削除しますか？`))return;
    const {error} = await supabase.from("outings").delete().eq("id",place.id);
    if(error)throw error;
    await refreshOutings();
  },
  weather:async place=>{
    $("weatherPlace").value=String(place.id);
    openOutingSection("outingWeatherPanel");
    $("weatherBtn").click();
  },
});
$("outingAdd").onclick=addOuting;
$("outingWeatherShortcut").onclick=()=>openOutingSection("outingWeatherPanel");
$("outingAiShortcut").onclick=()=>openOutingSection("outingAiPanel");
function renderOutings(items) {
  const selected = $("weatherPlace").value;
  $("weatherPlace").replaceChildren();
  for(const place of items){
    const option=document.createElement("option");option.value=String(place.id);option.textContent=place.name;$("weatherPlace").append(option);
  }
  if(items.some(place=>String(place.id)===selected))$("weatherPlace").value=selected;
  outingBrowser.update(items);
}

async function savePlace() {
  const name = $("placeName").value.trim();
  if (!name) return message("saveMessage", "施設名を入力してください。");
  const numericIds = ["driveMinutes", "placeBudget", "placeLat", "placeLon"];
  if (numericIds.some(id => !$(id).reportValidity())) return;
  const lat = $("placeLat").value, lon = $("placeLon").value;
  if ((lat === "") !== (lon === "")) return message("saveMessage", "緯度と経度は両方入力してください。");
  const budgetText = $("placeBudget").value;
  const latText = $("placeLat").value;
  const lonText = $("placeLon").value;
  const row = {
    name, area: $("placeArea").value.trim(),
    address: $("placeAddress").value.trim(),
    drive_minutes: Number($("driveMinutes").value === "" ? 60 : $("driveMinutes").value),
    type: $("placeType").value, category: $("placeCategory").value,
    budget_per_person: budgetText === "" ? null : Number(budgetText),
    latitude: latText === "" ? null : Number(latText),
    longitude: lonText === "" ? null : Number(lonText),
    memo: $("placeMemo").value.trim()
  };
  const { error } = await supabase.from("outings").insert(row);
  if (error) return message("saveMessage", `保存エラー：${error.message}`);
  ["placeName","placeArea","placeAddress","placeBudget","placeLat","placeLon","placeMemo"].forEach(id => $(id).value = "");
  message("saveMessage", "保存しました。家族の端末にも同期されます。");
  await refreshOutings();
}

async function getWeather() {
  const items = await refreshOutings();
  const place = items.find(p => String(p.id) === $("weatherPlace").value);
  if (!place) return message("weatherResult", "先にお出かけ先を登録してください。");
  if (place.latitude == null || place.longitude == null) {
    return message("weatherResult", "この施設には緯度・経度が登録されていないため、天気を取得できません。");
  }
  message("weatherResult", "天気を取得中...");
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: place.latitude, longitude: place.longitude,
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    forecast_days: "7", timezone: "Asia/Tokyo"
  });
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("天気サービスから応答がありません。");
    const data = await res.json();
    const labels = (c) => c === 0 ? "快晴" : [1,2].includes(c) ? "晴れ" : c === 3 ? "くもり" :
      [45,48].includes(c) ? "霧" : [71,73,75,77,85,86].includes(c) ? "雪" :
      [95,96,99].includes(c) ? "雷雨" : "雨";
    $("weatherResult").innerHTML = "";
    data.daily.time.forEach((d,i) => {
      const line = document.createElement("div");
      line.className = "weather-day";
      line.textContent = `${d}：${labels(data.daily.weather_code[i])}／${data.daily.temperature_2m_min[i]}〜${data.daily.temperature_2m_max[i]}℃／降水確率 ${data.daily.precipitation_probability_max[i] ?? "不明"}%`;
      $("weatherResult").append(line);
    });
  } catch (e) { message("weatherResult", `取得できませんでした：${e.message}`); }
}

async function saveAiCandidate(place) {
  const items=await refreshOutings();
  if(items.some(item=>item.name.normalize("NFKC").trim()===place.name.normalize("NFKC").trim()))return "同じ名前の候補が登録されています。";
  const {error}=await supabase.from("outings").insert({name:place.name,area:place.area,address:place.address,type:place.type,category:"その他",drive_minutes:place.drive_minutes,budget_per_person:place.budget_per_person,latitude:place.latitude,longitude:place.longitude,memo:[place.child_reason,place.age_notes,place.official_url].filter(Boolean).join("\n")});
  if(error)throw error;
  await refreshOutings();return "家族のお出かけ候補に保存しました。";
}
async function askAI() {
  if(!$("outingDate").reportValidity()||!$("outingDate").value||!$("maxBudget").reportValidity())return;
  $("aiBtn").disabled=true;
  $("aiResult").setAttribute("aria-busy","true");
  $("aiResult").replaceChildren();
  message("aiStatus","ネットで施設情報を検索し、現地の天気と車の所要時間を確認しています。1〜2分ほどかかることがあります。");
  try {
    const {data,error}=await supabase.functions.invoke("ai-outing",{body:{date:$("outingDate").value,budget:$("maxBudget").value===""?null:Number($("maxBudget").value)}});
    if(error){
      let detail;
      try{detail=await error.context?.json();}catch{/* Use the normal connection error below. */}
      throw new Error(detail?.error||"AI提案に接続できませんでした。ログイン状態と通信を確認して、再実行してください。");
    }
    if(data?.error)throw new Error(data.error);
    if(!Array.isArray(data?.recommendations))throw new Error("検索結果を読み取れませんでした。");
    renderAiRecommendations($("aiResult"),data,saveAiCandidate);
    message("aiStatus",data.message);
  }catch(error){message("aiStatus",error.message||"提案を作成できませんでした。");}
  finally{$("aiBtn").disabled=false;$("aiResult").setAttribute("aria-busy","false");}
}

async function start() {
  const { data: { session } } = await supabase.auth.getSession();
  loginBox.classList.toggle("hidden", !!session);
  appBox.classList.toggle("hidden", !session);
  $("logoutBtn").hidden = !session;
  if (session) {
    try { await refreshOutings(); } catch (e) { alert(`データ読込エラー：${e.message}`); }
  }
}

$("loginBtn").onclick = async () => {
  if (!$("email").reportValidity() || !$("email").value || !$("password").value) return message("loginMessage", "メールアドレスとパスワードを入力してください。");
  message("loginMessage", "ログイン中...");
  const { error } = await supabase.auth.signInWithPassword({
    email: $("email").value.trim(), password: $("password").value
  });
  if (error) return message("loginMessage", error.message);
  await start();
};
$("logoutBtn").onclick = async () => { await supabase.auth.signOut(); await start(); };
$("savePlace").onclick = savePlace;
$("weatherBtn").onclick = getWeather;
$("aiBtn").onclick = askAI;

supabase.auth.onAuthStateChange((_event, session) => {
  loginBox.classList.toggle("hidden", !!session);
  appBox.classList.toggle("hidden", !session);
  $("logoutBtn").hidden = !session;
  if (session) setTimeout(() => refreshOutings().catch(e => console.error(e)), 0);
  else { renderOutings([]); message("weatherResult", ""); message("aiResult", ""); message("outingMessage", ""); }
});

const outingDateLimits = dateLimits();
$("outingDate").min = outingDateLimits.min;
$("outingDate").max = outingDateLimits.max;
$("outingDate").value = outingDateLimits.min;
$("outingDate").required = true;
["loginBtn", "logoutBtn", "savePlace", "weatherBtn"].forEach(id => {
  const button = $(id), action = button.onclick;
  button.onclick = async () => {
    button.disabled = true;
    try { await action(); }
    catch (error) { message(({loginBtn:"loginMessage", logoutBtn:"loginMessage", savePlace:"saveMessage", weatherBtn:"weatherResult"})[id], `通信できませんでした：${error.message}`); }
    finally { button.disabled = false; }
  };
});
$("password").addEventListener("keydown", event => { if (event.key === "Enter") $("loginBtn").click(); });
await start();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(console.warn));
}
import("./family-extra.js").then(m => m.initExtra(supabase)).catch(console.error);
