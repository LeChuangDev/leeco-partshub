import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 1.25 })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:5173/#/dashboard')
await page.waitForTimeout(2600)
await page.goto('http://127.0.0.1:5173/#/bom')
await page.waitForTimeout(1500)
const info = await page.evaluate(() => {
  const q = (s) => document.querySelector(s)
  const rect = (el) => el ? { w: Math.round(el.getBoundingClientRect().width), x: Math.round(el.getBoundingClientRect().x) } : null
  return {
    viewport: window.innerWidth,
    dpr: window.devicePixelRatio,
    helpCol: rect(q('.help-col')),
    helpCard: rect(q('.help-col .help-card')),
    steps: rect(q('.steps')),
    li: rect(q('.steps li')),
    liSpan: rect(q('.steps li span')),
    stepsDisplay: q('.steps') ? getComputedStyle(q('.steps')).display : null,
    liCols: q('.steps li') ? getComputedStyle(q('.steps li')).gridTemplateColumns : null,
    cardPad: q('.help-card') ? getComputedStyle(q('.help-card')).padding : null
  }
})
console.log(JSON.stringify(info, null, 2))
await page.screenshot({ path: 'dev/.shots/diag-help.png', clip: { x: 1050, y: 80, width: 380, height: 560 } })
await browser.close()
