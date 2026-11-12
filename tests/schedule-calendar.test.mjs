import test from 'node:test';
import assert from 'node:assert/strict';
import {monthDates,tokyoToday,createScheduleCalendar} from '../schedule-calendar.js';
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.dataset={};this.className='';this.textContent='';this.classList={add:name=>{this.className+=' '+name;}};}
 append(...children){this.children.push(...children);}
 prepend(...children){this.children.unshift(...children);}
 replaceChildren(...children){this.children=[...children];}
 setAttribute(key,value){this.attributes[key]=value;}
}
globalThis.document={createElement:tag=>new Element(tag)};
const flatten=node=>[node,...node.children.flatMap(flatten)];
const find=(root,name)=>flatten(root).filter(node=>node.className.split(' ').includes(name));
test('month dates cover leap years and exact month boundaries',()=>{
 assert.equal(monthDates(2028,1).length,29);
 assert.equal(monthDates(2028,1).at(-1),'2028-02-29');
 assert.equal(monthDates(2026,1).length,28);
 assert.equal(monthDates(2026,11).at(-1),'2026-12-31');
});
test('today uses Japan time across UTC date boundary',()=>{
 assert.equal(tokyoToday(new Date('2026-11-11T15:00:00Z')),'2026-11-12');
 assert.equal(tokyoToday(new Date('2026-11-11T14:59:00Z')),'2026-11-11');
});
test('two columns, grouped dates, time order, safe text, month navigation and reset',()=>{
 const root=new Element('div');
 const calendar=createScheduleCalendar(root,item=>{const el=new Element('article');el.textContent=item.name;return el;});
 const today=tokyoToday();
 calendar.update([{name:'夕方',date:today,time:'18:00',imported:true,source_name:'家族'},{name:'<img onerror=alert(1)>',date:today,time:'09:00',imported:true,source_name:'仕事'},{name:'終日',date:today,time:''}]);
 const table=find(root,'schedule-table')[0];
 const body=table.children.find(node=>node.tag==='tbody');
 const todayRow=body.children.find(row=>row.dataset.date===today);
 assert.ok(body.children.every(row=>row.children.length===2));
 assert.equal(todayRow.children[0].attributes.scope,'row');
 assert.equal(todayRow.children[0].attributes['aria-current'],'date');
 assert.deepEqual(find(todayRow,'schedule-time').map(node=>node.textContent),['終日','09:00','18:00']);
 assert.deepEqual(find(todayRow,'schedule-entry-title').map(node=>node.textContent),['終日','<img onerror=alert(1)>','夕方']);
 assert.equal(find(root,'schedule-entry').length,3);
 assert.equal(find(root,'schedule-event-details').length,1);
 assert.ok(find(root,'schedule-no-events').length>0);
 const title=find(root,'calendar-month')[0].textContent;
 find(root,'calendar-arrow')[1].onclick();assert.notEqual(find(root,'calendar-month')[0].textContent,title);
 calendar.update([{name:'更新',date:today,time:'12:00',imported:true}]);
 assert.notEqual(find(root,'calendar-month')[0].textContent,title);
 find(root,'calendar-today')[0].onclick();assert.equal(find(root,'calendar-month')[0].textContent,title);
 assert.equal(find(root,'schedule-entry').length,1);
 calendar.reset();assert.equal(find(root,'schedule-entry').length,0);
});
