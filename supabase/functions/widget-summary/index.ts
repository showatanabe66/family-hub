import {createWidgetHandler} from './handler.mjs';
Deno.serve(createWidgetHandler({env:(name:string)=>Deno.env.get(name)}));
