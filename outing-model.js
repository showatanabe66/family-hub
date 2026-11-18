export const hasCoordinates=p=>p.latitude!=null&&p.longitude!=null&&Number.isFinite(Number(p.latitude))&&Number.isFinite(Number(p.longitude));
export function scoreSpot(place,weather){
  const reasons=[];let score=0;
  if(weather){
    const wet=weather.code>=45||weather.precipProb>=40;const cloudy=weather.code>=2&&!wet;
    score=(wet?{'屋内':40,'両方':20,'屋外':-10}:cloudy?{'屋内':15,'両方':25,'屋外':25}:{'屋内':10,'両方':25,'屋外':40})[place.type]||0;
    if(wet&&place.type==='屋外')score-=(weather.precipProb||0)/10;
    reasons.push(wet?(place.type==='屋内'?'雨でも天気を気にせず楽しめる屋内施設':place.type==='両方'?'雨の場合は屋内エリアを中心に':'雨予報のため屋外での遊びは慎重に'):cloudy?'曇り予報。屋内外の過ごし方を選んで':place.type==='屋外'?'晴れ予報で外遊びにぴったり':place.type==='両方'?'屋外も屋内も楽しめる':'天気を気にせず楽しめる屋内施設');
    if(weather.windKmh>=30&&place.type==='屋外'){score-=5;reasons.unshift('強風の予報。小さい子連れは風対策を');}
  }
  const drive=place.drive_minutes;
  if(drive!=null){score+=drive<=20?10:drive<=30?5:0;if(drive<=30)reasons.push(`東戸塚から車で約${Math.round(drive/5)*5}分と近場`);}
  if(Number.isFinite(place.rating)){score+=place.rating*2;reasons.push(`口コミ評価 ${place.rating.toFixed(1)}`);}
  if(!weather)reasons.unshift('天気未取得のため、近さを参考に表示');
  return {score,reasons:reasons.slice(0,3)};
}
export function rankSpots(items,forecasts={},origin=null){return items.map(p=>{const weather=forecasts[p.id]||null;return {...p,...scoreSpot(p,weather||origin),weather,usesOriginWeather:!weather&&!!origin};}).sort((a,b)=>b.score-a.score||(a.drive_minutes??Infinity)-(b.drive_minutes??Infinity)||a.name.localeCompare(b.name,'ja'));}
export function mergeSpots(catalog,saved,marks={}){
  const key=s=>s.normalize('NFKC').replace(/\s/g,'');const used=new Set();
  const all=catalog.map(p=>{const match=saved.find(s=>key(s.name)===key(p.name));if(match){used.add(match.id);return {...p,...Object.fromEntries(Object.entries(match).filter(([,v])=>v!=null&&v!=='')),catalogId:p.id};}return {...p,...marks[p.id],catalogOnly:true};});
  return [...all,...saved.filter(p=>!used.has(p.id))];
}
