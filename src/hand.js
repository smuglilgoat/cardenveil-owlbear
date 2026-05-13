import { mount } from 'svelte';
import './app.css';
import HandPopover from './HandPopover.svelte';

const app = mount(HandPopover, { target: document.getElementById('hand') });

export default app;
