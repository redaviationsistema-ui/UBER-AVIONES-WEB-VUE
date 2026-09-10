/* global process */
const { chromium } = await import(process.env.POSTFLIGHT_PLAYWRIGHT_MODULE || '/private/tmp/postflight-browser/node_modules/playwright/index.mjs')
import assert from 'node:assert/strict'
import fs from 'node:fs'
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const page = await browser.newPage()
const errors=[]
page.on('pageerror', e => errors.push(e.message))
await page.goto('http://127.0.0.1:4178/renta/admin/incidencias')
await page.getByRole('heading',{name:'Evidencias de cierre 3/3'}).waitFor()
const section = page.getByRole('region',{name:'Evidencias de cierre'})
await section.locator('img').first().waitFor()
await page.waitForFunction(() => [...document.querySelectorAll('.closure-grid img')].length===3 && [...document.querySelectorAll('.closure-grid img')].every(i=>i.complete&&i.naturalWidth>0))
const results=[]
for(const width of [1440,1200,1024,900,768,600,390]) {
 await page.setViewportSize({width,height:1000})
 await page.screenshot({path:`/private/tmp/postflight-browser/admin-${width}.png`,fullPage:true})
 const layout=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth, section:document.querySelector('.closure-evidence').getBoundingClientRect().width, images:[...document.querySelectorAll('.closure-grid img')].map(i=>({width:i.clientWidth,natural:i.naturalWidth}))}))
 assert(layout.document<=width,`overflow at ${width}: ${JSON.stringify(layout)}`)
 results.push({width,pass:true})
}
for (const button of await section.getByRole('button',{name:'Ver evidencia',exact:true}).all()) {
 await button.click()
 await page.locator('dialog[open] img').waitFor()
 await page.waitForFunction(()=>document.querySelector('dialog[open] img')?.naturalWidth>0)
 await page.locator('dialog').getByRole('button',{name:'Cerrar',exact:true}).click()
 assert.equal(await page.locator('dialog[open]').count(),0)
}
for (let count=0;count<=3;count++) {
 await page.request.get(`http://127.0.0.1:4178/test-state?count=${count}`)
 await section.getByRole('button',{name:'Actualizar evidencias'}).click()
 await page.getByRole('heading',{name:`Evidencias de cierre ${count}/3`}).waitFor()
 assert.equal(await section.locator('img').count(),count)
}
for (const status of [403,404]) {
 await page.request.get(`http://127.0.0.1:4178/test-state?count=3&status=${status}`)
 await section.getByRole('button',{name:'Actualizar evidencias'}).click()
 await section.getByText('Vista previa no disponible').first().waitFor()
 await page.waitForFunction(()=>document.querySelectorAll('.closure-grid img').length===0)
 assert.equal(await section.getByRole('button',{name:'Ver evidencia',exact:true}).count(),0)
}
await page.request.get('http://127.0.0.1:4178/test-state?count=3')
await section.getByRole('button',{name:'Actualizar evidencias'}).click()
await page.waitForFunction(()=>document.querySelectorAll('.closure-grid img').length===3&&[...document.querySelectorAll('.closure-grid img')].every(i=>i.naturalWidth>0))
await page.setViewportSize({width:1440,height:1000})
await page.locator('tbody tr').filter({hasText:'Incidencia de prueba 1'}).click()
await page.getByRole('heading',{name:'Evidencias de cierre 0/3'}).waitFor()
assert.equal(await section.locator('img').count(),0)
await page.locator('tbody tr').filter({hasText:'Incidencia de prueba 2'}).click()
await page.getByRole('heading',{name:'Evidencias de cierre 3/3'}).waitFor()
await page.waitForFunction(()=>[...document.querySelectorAll('.closure-grid img')].every(i=>i.naturalWidth>0))
await page.locator('tbody tr').filter({hasText:'Incidencia de prueba 3'}).click()
assert.equal(await section.locator('img').count(),3)
assert.deepEqual(errors,[])
fs.writeFileSync('/private/tmp/postflight-browser/result.json',JSON.stringify({responsive:results,slots:['Catering','Equipaje','Cabina final'],counts:[0,1,2,3],modal:true,fallbacks:[403,404],renewal:true,operationSwitch:true,sameOperationIncidents:true,errors},null,2))
console.log('PASS browser: three loaded images, seven widths, 0–3, modal close, 403/404 and renewal')
await browser.close()
