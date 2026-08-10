import { jest } from '@jest/globals';
import '@testing-library/jest-dom';

// Mock OBR SDK
global.OBR = {
  onReady: jest.fn((callback) => callback()),
  player: {
    getId: jest.fn(() => Promise.resolve('test-player-id')),
    getName: jest.fn(() => Promise.resolve('Test Player')),
    getRole: jest.fn(() => Promise.resolve('PLAYER'))
  },
  room: {
    id: 'test-room-id'
  },
  party: {
    getPlayers: jest.fn(() => Promise.resolve([])),
    onChange: jest.fn(() => jest.fn())
  },
  popover: {
    open: jest.fn(() => Promise.resolve()),
    close: jest.fn(() => Promise.resolve())
  },
  viewport: {
    getWidth: jest.fn(() => Promise.resolve(1920)),
    getHeight: jest.fn(() => Promise.resolve(1080))
  }
};

// Mock fetch
global.fetch = jest.fn();

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
