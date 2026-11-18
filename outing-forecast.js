const FIELDS='weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max';
export function parseDaily(data,date){const d=data?.daily,i=d?.time?.indexOf(date);if(i==null||i<0||!Number.isFinite(d.weather_code?.[i]))return null;const n=k=>Number.isFinite(d[k]?.[i])?d[k][i]:null;const code=n('weather_code');return {date,code,label:code===0?'快晴':code===1?'晴れ':code<=3?'曇り':code<=48?'霧':code>=95?'雷雨':code>=71&&code<=86?'雪':'雨',high:n('temperature_2m_max'),low:n('temperature_2m_min'),precipMm:n('precipitation_sum'),precipProb:n('precipitation_probability_max'),windKmh:n('wind_speed_10m_max')};}
export function createForecastClient(fetcher=fetch){
 const memory=new Map();let pending=new Map();
 return async function forecast(points,{refresh=false}={}){
  const result={},missing=[];const now=Date.now();
  for(const p of points){const key=`${Number(p.latitude).toFixed(4)},${Number(p.longitude).toFixed(4)}`;let cached=memory.get(key);if(!cached)try{cached=JSON.parse(localStorage.getItem(`outing-forecast-v1:${key}`));}catch{}if(!refresh&&cached?.expires>now){result[p.id]=cached;continue;}missing.push({...p,key});}
  for(let start=0;start<missing.length;start+=12){const batch=missing.slice(start,start+12);const key=batch.map(p=>p.key).join(';');
   try{
    let request=pending.get(key);if(!request){const url=new URL('https://api.open-meteo.com/v1/forecast');url.search=new URLSearchParams({latitude:batch.map(p=>p.latitude).join(','),longitude:batch.map(p=>p.longitude).join(','),daily:FIELDS,timezone:'Asia/Tokyo',forecast_days:'16'});request=fetcher(url,{signal:AbortSignal.timeout(12000)}).then(async r=>{if(!r.ok)throw Error('forecast');return r.json();});pending.set(key,request);}
    const payload=await request;const rows=Array.isArray(payload)?payload:[payload];
    batch.forEach((p,i)=>{if(!Array.isArray(rows[i]?.daily?.time))return;const value={data:rows[i],checkedAt:new Date().toISOString(),expires:now+30*60000};memory.set(p.key,value);result[p.id]=value;try{localStorage.setItem(`outing-forecast-v1:${p.key}`,JSON.stringify(value));}catch{}});
   }catch{/* Missing forecasts remain explicitly unavailable. */}finally{pending.delete(key);}
  }
  return result;
 };
}
