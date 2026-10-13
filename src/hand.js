import { mount } from 'svelte';
import './hand.css';
import HandPopover from './HandPopover.svelte';
import { initLogging } from './lib/appLog.js';

initLogging('hand', { sessionStart: true });

const app = mount(HandPopover, { target: document.getElementById('hand') });

export default app;
