import { mount } from 'svelte';
import './hand.css';
import HandPopover from './HandPopover.svelte';

const app = mount(HandPopover, { target: document.getElementById('hand') });

export default app;
