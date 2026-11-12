import {readForecast,tokyoDate} from './recommend.mjs';
export const MET_SOURCE={source_name:'MET Norway',source_url:'https://www.met.no/en',license_url:'https://creativecommons.org/licenses/by/4.0/',source_note:'MET Norwayの時刻別予報を日本時間で日別集計しています。降水確率が提供されない場合は、予報の天気・降水量と風速で屋内外を判断します。'};
export function readMetForecast(data,date){
  const points=(data?.properties?.timeseries??[]).filter(point=>tokyoDate(new Date(point.time))===date);
  if(points.length<3)throw Error('Forecast date is outside the fallback range');
  const temps=[],winds=[],probs=[],symbols=[];let rain=false;
  for(const point of points){
    const current=point.data?.instant?.details??{};
    if(Number.isFinite(current.air_temperature))temps.push(current.air_temperature);
    if(Number.isFinite(current.wind_speed))winds.push(current.wind_speed*3.6);
    const period=point.data?.next_1_hours??point.data?.next_6_hours??point.data?.next_12_hours;
    const symbol=period?.summary?.symbol_code;if(symbol)symbols.push(symbol);
    const details=period?.details??{};
    if(Number.isFinite(details.probability_of_precipitation))probs.push(details.probability_of_precipitation);
    if(Number.isFinite(details.precipitation_amount)&&details.precipitation_amount>=0.1)rain=true;
  }
  if(!temps.length||!winds.length||!symbols.length)throw Error('Incomplete fallback forecast');
  let code=0,label='晴れ';
  if(symbols.some(s=>s.includes('thunder'))){code=95;label='雷雨';}
  else if(symbols.some(s=>s.includes('snow')||s.includes('sleet'))){code=71;label='雪・みぞれ';}
  else if(rain||symbols.some(s=>s.includes('rain'))){code=61;label='雨';}
  else if(symbols.some(s=>s.includes('fog'))){code=45;label='霧';}
  else if(symbols.some(s=>s==='cloudy')){code=3;label='曇り';}
  else if(symbols.some(s=>s.includes('partlycloudy'))){code=2;label='晴れ時々曇り';}
  const probability=probs.length?Math.max(...probs):null,wind=Math.round(Math.max(...winds)*10)/10;
  return {date,code,label,precipitation_probability:probability,wind_kmh:wind,temperature_max:Math.max(...temps),temperature_min:Math.min(...temps),indoor_only:code>=45||(probability!==null&&probability>=40)||wind>=36,...MET_SOURCE};
}
export function createWeatherClient({fetch:fetcher=fetch,now=()=>new Date(),persistentCache=null}){
  const memory=new Map(),inflight=new Map();
  async function getMet(latitude,longitude,date){
    // The provider requires at most four decimal places and three-hour caching globally.
    const lat=(Math.trunc(latitude*10000)/10000).toFixed(4),lon=(Math.trunc(longitude*10000)/10000).toFixed(4),cacheKey=`met:${lat},${lon}`;
    let saved=memory.get(cacheKey);
    if(!saved&&persistentCache){try{saved=await persistentCache.get(cacheKey);if(saved)memory.set(cacheKey,saved);}catch{/* A cache outage must not fabricate weather. */}}
    if(saved?.expires>now().getTime())return readMetForecast(saved.data,date);
    let loading=inflight.get(cacheKey);
    if(!loading){
      loading=(async()=>{
        const response=await fetcher(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`,{headers:{'User-Agent':'WatanabeFamilyHub/1.0 github.com/showatanabe66/family-hub'},signal:AbortSignal.timeout(8000)});
        if(!response.ok)throw Error('Fallback weather provider failed');
        const data=await response.json();
        const expires=Math.max(now().getTime()+3*3600000,Date.parse(response.headers.get('Expires')||'')||0);
        const record={data,expires};if(memory.size>=100)memory.delete(memory.keys().next().value);memory.set(cacheKey,record);
        if(persistentCache){try{await persistentCache.set(cacheKey,record);}catch{console.warn('ai-outing weather cache write failed');}}
        return data;
      })();inflight.set(cacheKey,loading);
    }
    try{return readMetForecast(await loading,date);}finally{inflight.delete(cacheKey);}
  }
  return async (latitude,longitude,date)=>{
    const key=`open:${latitude},${longitude}:${date}`,saved=memory.get(key);
    if(saved?.expires>now().getTime())return saved.data;
    const url=new URL('https://api.open-meteo.com/v1/forecast');
    url.search=new URLSearchParams({latitude:String(latitude),longitude:String(longitude),daily:'weather_code,precipitation_probability_max,temperature_2m_max,temperature_2m_min,wind_speed_10m_max',start_date:date,end_date:date,timezone:'Asia/Tokyo'});
    try{
      const response=await fetcher(url.toString(),{signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error('Primary weather provider failed');
      const weather={...readForecast(await response.json(),date),source_name:'Open-Meteo',source_url:'https://open-meteo.com/',license_url:'https://creativecommons.org/licenses/by/4.0/'};
      if(memory.size>=100)memory.delete(memory.keys().next().value);memory.set(key,{data:weather,expires:now().getTime()+10*60000});return weather;
    }catch{console.warn('ai-outing primary weather unavailable; trying MET Norway');}
    try{return await getMet(latitude,longitude,date);}catch{throw Error('天気予報を2つのサービスから取得できませんでした。取得できる別の日付を選ぶか、時間を置いて再実行してください。');}
  };
}
