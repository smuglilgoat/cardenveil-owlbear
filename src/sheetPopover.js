import { mount } from 'svelte';
import './sheetPopover.css';
import SheetPopover from './SheetPopover.svelte';

const app = mount(SheetPopover, { target: document.getElementById('sheet-popover') });

export default app;
