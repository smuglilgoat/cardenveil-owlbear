import { mount } from 'svelte';
import '../app.css';
import SheetFullPage from '../lib/SheetFullPage.svelte';
import { initLogging } from '../lib/appLog.js';

initLogging('sheet-tab', { sessionStart: true });

const app = mount(SheetFullPage, { target: document.getElementById('sheet-full') });

export default app;
