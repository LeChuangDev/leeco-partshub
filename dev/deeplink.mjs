import { chromium } from 'playwright'
const BASE='http://127.0.0.1:5173'
const b=await chromium.launch({channel:'chrome',headless:true})
for (const path of ['/#/parts?filter=low','/#/bom','/#/locations']) {
  const ctx=await b.newContext({viewport:{width:1280,height:900}})
  const p=await ctx.newPage()
  await p.goto(BASE+path); await p.waitForTimeout(2000)
  console.log(path, '=>', p.url(), '| title:', await p.title())
  await ctx.close()
}
const ctx=await b.newContext({viewport:{width:1280,height:900}})
const p=await ctx.newPage()
await p.goto(BASE+'/#/dashboard'); await p.waitForTimeout(1800)
const ids=await p.evaluate(async()=>{const r=await fetch('/api/parts?pageSize=2');const j=await r.json();return j.data.list.map(x=>x.id)})
await ctx.close()
const ctx2=await b.newContext({viewport:{width:1280,height:900}})
const p2=await ctx2.newPage()
await p2.goto(`${BASE}/#/labels?ids=${ids.join(',')}`); await p2.waitForTimeout(2200)
console.log('labels direct =>', p2.url(), 'labels:', await p2.locator('.label').count())
await b.close()
