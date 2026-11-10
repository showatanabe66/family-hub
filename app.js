import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/*
 * Supabase Dashboard > Project Settings > API
 * URL と Publishable key を設定してください。
 * service_role key は絶対にここへ貼らないでください。
 */
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";
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

function renderOutings(items) {
  $("outingList").innerHTML = "";
  $("weatherPlace").innerHTML = "";
  for (const p of items) {
    const option = document.createElement("option");
    option.value = p.id;
    option.textContent = p.name;
    $("weatherPlace").append(option);

    const div = document.createElement("div");
    div.className = "item";
    const title = document.createElement("strong");
    title.textContent = `${p.favorite ? "★ " : ""}${p.name}`;
    const details = document.createElement("div");
    details.className = "muted";
    details.textContent = `${p.area || "エリア未登録"} ・ ${p.type} ・ 車${p.drive_minutes}分 ${p.visited ? "・訪問済み" : ""}`;
    const links = document.createElement("div");
    links.className = "links";
    const map = document.createElement("a");
    map.href = mapSearchUrl(p); map.target = "_blank"; map.rel = "noopener"; map.textContent = "地図を見る";
    const route = document.createElement("a");
    route.href = mapDirectionsUrl(p); route.target = "_blank"; route.rel = "noopener"; route.textContent = "ルート";
    const fav = document.createElement("button");
    fav.className = "secondary"; fav.textContent = p.favorite ? "お気に入り解除" : "お気に入り";
    fav.onclick = async () => {
      const { error } = await supabase.from("outings").update({favorite: !p.favorite}).eq("id", p.id);
      if (error) alert(error.message); else await refreshOutings();
    };
    const visited = document.createElement("button");
    visited.className = "secondary"; visited.textContent = p.visited ? "未訪問に戻す" : "訪問済みにする";
    visited.onclick = async () => {
      const { error } = await supabase.from("outings").update({visited: !p.visited}).eq("id", p.id);
      if (error) alert(error.message); else await refreshOutings();
    };
    const del = document.createElement("button");
    del.className = "secondary"; del.textContent = "削除";
    del.onclick = async () => {
      if (!confirm(`${p.name}を削除しますか？`)) return;
      const { error } = await supabase.from("outings").delete().eq("id", p.id);
      if (error) alert(error.message); else await refreshOutings();
    };
    links.append(map, route);
    div.append(title, details, links, fav, visited, del);
    $("outingList").append(div);
  }
  if (!items.length) $("outingList").textContent = "まだ登録がありません。上から候補を登録してください。";
}

async function savePlace() {
  const name = $("placeName").value.trim();
  if (!name) return message("saveMessage", "施設名を入力してください。");
  const budgetText = $("placeBudget").value;
  const latText = $("placeLat").value;
  const lonText = $("placeLon").value;
  const row = {
    name, area: $("placeArea").value.trim(),
    address: $("placeAddress").value.trim(),
    drive_minutes: Number($("driveMinutes").value || 60),
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
  const place = items.find(p => p.id === $("weatherPlace").value);
  if (!place) return message("weatherResult", "先にお出かけ先を登録してください。");
  if (place.latitude == null || place.longitude == null) {
    return message("weatherResult", "この施設には緯度・経度がありません。施設情報に追加してください。");
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
      line.className = "item";
      line.textContent = `${d}：${labels(data.daily.weather_code[i])}／${data.daily.temperature_2m_min[i]}〜${data.daily.temperature_2m_max[i]}℃／降水確率 ${data.daily.precipitation_probability_max[i] ?? "不明"}%`;
      $("weatherResult").append(line);
    });
  } catch (e) { message("weatherResult", `取得できませんでした：${e.message}`); }
}

async function askAI() {
  $("aiBtn").disabled = true;
  message("aiStatus", "候補と条件を確認してAIに依頼しています...");
  $("aiResult").textContent = "";
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("ログインし直してください。");
    const { data, error } = await supabase.functions.invoke("ai-outing", {
      body: {
        date: $("outingDate").value,
        weather: $("outingWeather").value,
        maxDriveMinutes: Number($("maxDrive").value || 120),
        budget: $("maxBudget").value === "" ? null : Number($("maxBudget").value)
      }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    $("aiResult").innerHTML = "";
    const pre = document.createElement("pre");
    pre.textContent = data.result;
    $("aiResult").append(pre);
    message("aiStatus", "提案ができました。");
  } catch (e) {
    message("aiStatus", `AI提案を利用できません：${e.message || "設定を確認してください。"}`);
  } finally { $("aiBtn").disabled = false; }
}

async function start() {
  const { data: { session } } = await supabase.auth.getSession();
  loginBox.classList.toggle("hidden", !!session);
  appBox.classList.toggle("hidden", !session);
  if (session) {
    try { await refreshOutings(); } catch (e) { alert(`データ読込エラー：${e.message}`); }
  }
}

$("loginBtn").onclick = async () => {
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
  if (session) refreshOutings().catch(e => console.error(e));
});

$("outingDate").value = new Date().toISOString().slice(0,10);
await start();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(console.warn));
}
