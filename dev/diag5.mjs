import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 1.25 })).newPage()
await p.goto('http://127.0.0.1:5173/#/dashboard'); await p.waitForTimeout(2600)
await p.goto('http://127.0.0.1:5173/#/parts?filter=low'); await p.waitForTimeout(1400)
const info = await p.evaluate(() => {
  const btn = document.querySelector('.n-data-table-tbody .mini-btn')
  const cs = btn ? getComputedStyle(btn) : null
  const td = btn?.closest('td')
  return {
    btnTag: btn?.tagName, cls: btn?.className,
    border: cs?.border, bg: cs?.backgroundColor, color: cs?.color, w: cs?.width, h: cs?.height,
    tdCls: td?.className, tdBg: td ? getComputedStyle(td).backgroundColor : null,
    tableW: document.querySelector('.n-data-table')?.getBoundingClientRect().width,
    opColW: document.querySelector('.n-data-table-th--fixed-right')?.getBoundingClientRect().width
  }
})
console.log(JSON.stringify(info, null, 2))
await b.close()
