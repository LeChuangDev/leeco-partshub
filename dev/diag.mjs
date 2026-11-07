import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 } })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:5173/#/dashboard')
await page.waitForTimeout(2600)
await page.goto('http://127.0.0.1:5173/#/bom')
await page.waitForTimeout(1200)
const info = await page.evaluate(() => {
  const wrap = document.querySelector('.import-wrap')
  const help = document.querySelector('.help-col')
  const card = document.querySelector('.paste-card')
  const g = (el) => el ? getComputedStyle(el) : null
  return {
    viewport: window.innerWidth,
    wrapCols: g(wrap).gridTemplateColumns,
    wrapDisplay: g(wrap).display,
    wrapWidth: wrap?.getBoundingClientRect().width,
    pasteWidth: card?.getBoundingClientRect().width,
    helpWidth: help?.getBoundingClientRect().width,
    helpDisplay: g(help).display,
    helpFlexDir: g(help).flexDirection,
    firstCardWidth: help?.children[0]?.getBoundingClientRect().width,
    firstCardDisplay: help?.children[0] ? g(help.children[0]).width : null
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
