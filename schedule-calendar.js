export function tokyoToday(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Tokyo'}).format(now);
}
export function monthDates(year, month) {
  const days=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  return Array.from({length:days},(_,index)=>`${year}-${String(month+1).padStart(2,'0')}-${String(index+1).padStart(2,'0')}`);
}
function sourceName(item) { return item.imported ? item.source_name || '同期した予定' : item.person || '家族全員'; }
function tone(name) { return [...name].reduce((hash,c)=>(hash+c.codePointAt(0))%5,0); }
function element(tag, className, text) {
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=text;
  return node;
}
export function createScheduleCalendar(root, renderItem) {
  let today=tokyoToday(), year=Number(today.slice(0,4)), month=Number(today.slice(5,7))-1;
  let items=[], signature=null;
  const toolbar=element('div','calendar-toolbar');
  const previous=element('button','calendar-arrow','‹'), next=element('button','calendar-arrow','›');
  const title=element('h3','calendar-month'), todayButton=element('button','secondary calendar-today','今日');
  previous.type=next.type=todayButton.type='button';
  previous.setAttribute('aria-label','前の月');next.setAttribute('aria-label','次の月');
  title.setAttribute('aria-live','polite');
  toolbar.append(previous,title,next,todayButton);
  const table=element('table','schedule-table');
  const caption=element('caption','schedule-caption');
  const thead=element('thead'), header=element('tr');
  for(const text of ['日付','時刻・予定']) {
    const th=element('th','',text);th.setAttribute('scope','col');header.append(th);
  }
  thead.append(header);
  const tbody=element('tbody');table.append(caption,thead,tbody);
  const note=element('p','muted calendar-note','Apple連携の予定は、ショートカットで取得した期間のみ表示されます。');
  root.replaceChildren(toolbar,table,note);root.classList.add('schedule-calendar');
  function draw() {
    title.textContent=`${year}年 ${month+1}月`;
    const dates=monthDates(year,month), byDate=new Map(dates.map(date=>[date,[]]));
    items.forEach(item=>byDate.get(item.date)?.push(item));
    const count=[...byDate.values()].reduce((sum,rows)=>sum+rows.length,0);
    caption.textContent=`${title.textContent}の予定・${count}件`;
    tbody.replaceChildren();
    for(const date of dates) {
      const day=new Date(`${date}T00:00:00Z`), weekday=day.getUTCDay();
      const row=element('tr',date===today?'schedule-today':'');row.dataset.date=date;
      const dayCell=element('th','schedule-date');dayCell.setAttribute('scope','row');
      if(weekday===0)dayCell.classList.add('is-sunday');
      if(weekday===6)dayCell.classList.add('is-saturday');
      dayCell.append(element('span','schedule-date-number',String(day.getUTCDate())),element('span','schedule-weekday',`（${['日','月','火','水','木','金','土'][weekday]}）`));
      if(date===today){dayCell.append(element('span','schedule-today-label','今日'));dayCell.setAttribute('aria-current','date');}
      const cell=element('td','schedule-entries');
      const events=byDate.get(date).sort((a,b)=>(a.time||'').localeCompare(b.time||'') || a.name.localeCompare(b.name,'ja'));
      if(!events.length)cell.append(element('span','schedule-no-events','予定なし'));
      for(const item of events) {
        const event=element('div','schedule-entry');
        event.append(element('span','schedule-time',item.time ? item.time.slice(0,5) : '終日'));
        const content=element('div','schedule-entry-content');
        content.append(element('strong','schedule-entry-title',item.name));
        content.append(element('span',`calendar-source calendar-tone-${tone(sourceName(item))}`,sourceName(item)));
        if(item.memo || !item.imported) {
          const details=element('details','schedule-event-details');
          details.append(element('summary','','詳細'),renderItem(item));content.append(details);
        }
        event.append(content);cell.append(event);
      }
      row.append(dayCell,cell);tbody.append(row);
    }
  }
  function move(delta) {
    const date=new Date(Date.UTC(year,month+delta,1));year=date.getUTCFullYear();month=date.getUTCMonth();draw();
  }
  previous.onclick=()=>move(-1);next.onclick=()=>move(1);
  todayButton.onclick=()=>{
    today=tokyoToday();year=Number(today.slice(0,4));month=Number(today.slice(5,7))-1;draw();
    [...tbody.children].find(row=>row.dataset.date===today)?.scrollIntoView?.({block:'center',behavior:'smooth'});
  };
  draw();
  return {
    update(nextItems) {
      const nextSignature=JSON.stringify(nextItems),newToday=tokyoToday();
      if(signature===nextSignature && newToday===today)return;
      signature=nextSignature;today=newToday;items=nextItems;draw();
    },
    reset(){items=[];signature=null;today=tokyoToday();year=Number(today.slice(0,4));month=Number(today.slice(5,7))-1;draw();},
  };
}
