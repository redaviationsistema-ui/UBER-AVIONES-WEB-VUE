/* global process */
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const fixture = JSON.parse(fs.readFileSync('/private/tmp/postflight-fixture/workflow.json'))
const appStyles = fs.readFileSync(root + 'src/App.vue', 'utf8').split('<style>')[1].split('</style>')[0].replace(/@import[^;]+;/g, '')
let count = 3
let failMedia = 0
let revision = 0
const incidents = [1, 2, 3].map((id) => ({id, crew_operation_id: id === 1 ? fixture.other.operation_id : fixture.snapshots[3].admin.operation_id, category: 'catering', priority: 'baja', status: 'open', description: `Incidencia de prueba ${id}`, crew_name: 'Tripulación de prueba', files: []}))
const server = await createServer({root, configFile: false, plugins:[vue(), {name:'postflight-test', configureServer(server) {
 server.middlewares.use((req,res,next) => {
   const url = new URL(req.url, 'http://localhost')
   if (url.pathname === '/test-state') {count = Number(url.searchParams.get('count') ?? 3); failMedia = Number(url.searchParams.get('status') ?? 0); res.end('ok'); return}
   if (url.pathname === '/renta/admin/incidencias') {res.setHeader('Content-Type','text/html');res.end('<style>'+appStyles+'</style><body class="body-light-route"><div id="app"></div><script type="module" src="/postflight-entry.js"></script></body>');return}
   if (url.pathname === '/postflight-entry.js') {res.setHeader('Content-Type','application/javascript');res.end(`import {createApp} from '/node_modules/.vite/deps/vue.js'; import Page from '/src/features/admin/AdminIncidenciasPage.vue'; createApp(Page).mount('#app');`);return}
   if (url.pathname.endsWith('/crew-operation-incidents')) {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({incidents}));return}
   if (url.pathname.includes('/crew/operations/') && url.pathname.endsWith('/workflow')) {const id = url.pathname.split('/').at(-2);res.setHeader('Content-Type','application/json');const payload = structuredClone(String(fixture.other.operation_id)===id ? fixture.other : fixture.snapshots[count].admin); revision++; for(const group of payload.checklists) for(const item of group.items) for(const file of item.evidence_files) if(file.file_url) file.file_url += '&revision='+revision; res.end(JSON.stringify(payload));return}
   if (url.pathname.startsWith('/media/')) {const file = '/private/tmp/postflight-fixture/'+url.pathname.split('/').pop();res.statusCode=failMedia || (fs.existsSync(file)?200:404); res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','image/png');res.end(res.statusCode===200 ? fs.readFileSync(file) : '');return}
   next()
 })
 }}], server:{host:'127.0.0.1',port:4178,strictPort:true}, optimizeDeps:{include:['vue']}})
await server.listen()
console.log('Postflight validation ready on 4178')
