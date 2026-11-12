import test from 'node:test';
import assert from 'node:assert/strict';
import {monthCells,tokyoToday,createScheduleCalendar} from '../schedule-calendar.js';
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.dataset={};this.className='';this.textContent='';this.classList={add:(name)=>{this.className+=' '+name;}};}
 append(...children){this.children.push(...children);}
 prepend(...children){this.children.unshift(...children);}
 replaceChildren(...children){this.children=[...children];}
 setAttribute(key,value){this.attributes[key]=value;}
 focus(){this.focused=true;}
}
globalThis.document={createElement:tag=>new Element(tag)};
const flatten=node=>[node,...node.children.flatMap(flatten)];
const find=(root,className)=>flatten(root).filter(node=>node.className.split(' ').includes(className));
test('month cells cover leap day and Sunday-first boundaries',()=>{
 const cells=monthCells(2028,1);
 assert.equal(cells.filter(day=>day.inMonth).length,29);
 assert.ok(cells.some(day=>day.date==='2028-02-29'));
 assert.equal(new Date(cells[0].date).getUTCDay(),0);
 assert.equal(cells.length%7,0);
 assert.ok(monthCells(2026,0).some(day=>day.date==='2025-12-31'));
 assert.ok(monthCells(2026,11).some(day=>day.date==='2027-01-01'));
});
test('today uses Japan time across UTC date boundary',()=>{
 assert.equal(tokyoToday(new Date('2026-11-11T15:00:00Z')),'2026-11-12');
 assert.equal(tokyoToday(new Date('2026-11-11T14:59:00Z')),'2026-11-11');
});
test('selection, agenda sorting, safe titles, refresh, navigation and sign-out reset',()=>{
 const root=new Element('div');
 const renderItem=item=>{const el=new Element('article');el.textContent=item.name;return el;};
 const calendar=createScheduleCalendar(root,renderItem);
 const today=tokyoToday();
 const items=[{name:'夕方',date:today,time:'18:00',imported:true,source_name:'家族'},{name:'<img onerror=alert(1)>',date:today,time:'09:00',imported:true,source_name:'仕事'},{name:'終日',date:today,time:''}];
 calendar.update(items);
 const grid=find(root,'calendar-grid')[0];
 const todayButton=grid.children.find(day=>day.dataset.date===today);
 assert.equal(todayButton.attributes['aria-current'],'date');
 assert.ok(todayButton.attributes['aria-label'].includes('予定3件'));
 const agenda=find(root,'calendar-agenda')[0];
 assert.deepEqual(agenda.children.map(row=>row.textContent),['終日','<img onerror=alert(1)>','夕方']);
 assert.equal(find(root,'calendar-chip').filter(row=>row.textContent.includes('<img')).length,1);
 const other=grid.children.find(day=>day.dataset.date!==today && !day.className.includes('outside-month'));
 other.onclick();
 assert.ok(find(root,'calendar-detail-title')[0].textContent.endsWith('0件'));
 calendar.update([...items,{name:'追加予定',date:other.dataset.date,time:'12:00'}]);
 assert.ok(find(root,'calendar-detail-title')[0].textContent.endsWith('1件'));
 const monthTitle=find(root,'calendar-month')[0].textContent;
 find(root,'calendar-arrow')[1].onclick();
 assert.notEqual(find(root,'calendar-month')[0].textContent,monthTitle);
 find(root,'calendar-arrow')[0].onclick();
 assert.equal(find(root,'calendar-month')[0].textContent,monthTitle);
 find(root,'calendar-today')[0].onclick();
 assert.ok(find(root,'calendar-detail-title')[0].textContent.endsWith('3件'));
 calendar.reset();
 assert.equal(find(root,'calendar-chip').length,0);
 assert.ok(find(root,'calendar-detail-title')[0].textContent.endsWith('0件'));
});
