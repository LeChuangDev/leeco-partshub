import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
await p.goto('http://127.0.0.1:5173/#/dashboard'); await p.waitForTimeout(2000)
const ids = await p.evaluate(async () => {
  const r = await fetch('/api/parts?pageSize=3'); const j = await r.json()
  return j.data.list.map(x => x.id)
})
await p.goto('http://127.0.0.1:5173/#/labels?ids=' + ids.join(',')); await p.waitForTimeout(2200)
const res = await p.evaluate(async () => {
  if (!('BarcodeDetector' in window)) return { supported: false }
  const src = document.querySelector('.lb-qr img')?.src
  if (!src) return { supported: true, error: 'no img' }
  const img = new Image(); img.src = src; await img.decode()
  const det = new BarcodeDetector({ formats: ['qr_code'] })
  const codes = await det.detect(img)
  return { supported: true, count: codes.length, text: codes[0]?.rawValue || '' }
})
console.log(JSON.stringify(res, null, 2))
await b.close()
