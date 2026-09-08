// The reducer's source of truth is src/lib/deck.js — the client imports it
// directly for optimistic replay, and this shim keeps the /api/state import
// path (and the gameLogic tests) stable while serving the same code.
// ponytail: server imports client code; move the module to a neutral dir if that grates
export * from '../../src/lib/deck.js';
