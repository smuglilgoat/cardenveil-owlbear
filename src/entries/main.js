import { mount } from 'svelte'
import '../app.css'
import App from '../lib/App.svelte'
import { initLogging } from '../lib/appLog.js'

initLogging('main', { sessionStart: true })

const app = mount(App, {
  target: document.getElementById('app'),
})

export default app
