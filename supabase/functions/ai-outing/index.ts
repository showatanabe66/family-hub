import { createHandler } from './handler.mjs';
console.info('ai-outing configuration',JSON.stringify({openai_configured:!!Deno.env.get('OPENAI_API_KEY')}));
Deno.serve(createHandler({env:(name:string)=>Deno.env.get(name)}));
