import { mount } from 'svelte';
import '../sheetPopover.css';
import SheetPopover from '../lib/SheetPopover.svelte';
import { initLogging } from '../lib/appLog.js';

initLogging('sheet');

const app = mount(SheetPopover, { target: document.getElementById('sheet-popover') });

export default app;
