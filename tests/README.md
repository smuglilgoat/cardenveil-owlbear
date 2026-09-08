# Testing Documentation

This directory contains all tests for the Cardenveil application.

## Test Structure

```
tests/
├── api/              # API integration tests (future)
├── httpie/           # HTTPie test files for manual API testing
├── integration/      # Integration tests (future)
├── unit/             # Unit tests for game logic and utilities
├── setup.js          # JEST setup file with global mocks
└── README.md         # This file
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with coverage
```bash
npm run test:coverage
```

### Run specific test suites
```bash
# Unit tests only
npm run test:unit

# API tests only
npm run test:api
```

## Test Suites

### Unit Tests (`tests/unit/`)

#### `gameLogic.test.js`
Tests for the core game logic in `netlify/functions/_gameLogic.js`:
- `createInitialGameState()` - Initial state creation
- `createEmptyPlayer()` - Player creation with defaults
- `drawNormal()` / `drawSpecialized()` - Card drawing functions
- `makeCard()` - Card creation utility
- `handCap()` - Hand size calculation with racial bonuses
- `hydrateState()` / `dehydrateState()` - State serialization
- `applyAction()` - All game actions (DRAW, DISCARD, CRYSTALLIZE, etc.)
- `addLog()` - Action logging

#### `deck.test.js`
Tests for deck utilities in `src/lib/deck.js`:
- `sortCards()` - Card sorting by suit and value
- `makePendingCard()` - Pending card creation
- `handCap()` - Hand capacity calculation
- Constants (GM_CHAR_ID, RACES, FATIGUE_PENALTY)

#### `api.test.js`
Tests for the API client in `src/lib/api.js`:
- `fetchState()` - State fetching with ETag support
- `startRealtime()` / `stopRealtime()` - Realtime subscription management
- `dispatch()` - Action dispatching with fallback logic

### HTTPie Tests (`tests/httpie/`)

HTTPie test files for manual API testing. See `tests/httpie/README.md` for usage instructions.

#### Available test files:
- `get-state.http` - GET game state
- `draw-card.http` - DRAW action
- `discard-card.http` - DISCARD action

## Test Coverage

Current test coverage:
- **Game Logic**: 53 tests covering all major actions and utilities
- **Deck Utilities**: Card sorting, shuffling, pending cards
- **API Client**: State fetching, realtime subscriptions, action dispatching

## Mocking

### OBR SDK
The OBR SDK is mocked in `tests/setup.js` with common methods:
- `OBR.player.getId()`, `getName()`, `getRole()`
- `OBR.room.id`
- `OBR.party.getPlayers()`, `onChange()`
- `OBR.popover.open()`, `close()`
- `OBR.viewport.getWidth()`, `getHeight()`

### Supabase
Supabase client is mocked in API tests using `jest.unstable_mockModule()`.

### Fetch
Global `fetch` is mocked for API testing.

## Writing New Tests

### Unit Test Template
```javascript
import { functionToTest } from '../../path/to/module.js';

describe('Module Name', () => {
  describe('functionToTest', () => {
    it('should do something', () => {
      const result = functionToTest(input);
      expect(result).toBe(expected);
    });
  });
});
```

### API Test Template
```javascript
import { jest } from '@jest/globals';

// Mock dependencies
jest.unstable_mockModule('../../src/lib/supabaseClient.js', () => ({
  supabase: mockSupabase,
}));

// Import after mocking
const { apiFunction } = await import('../../src/lib/api.js');

describe('API Function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should work correctly', async () => {
    // Setup mocks
    // Call function
    // Assert results
  });
});
```

## Continuous Integration

Tests should be run before committing:
```bash
npm test && npm run build
```

## Troubleshooting

### "jest is not defined"
Make sure to import jest from `@jest/globals` in test files:
```javascript
import { jest } from '@jest/globals';
```

### Module import errors
The project uses ES modules. Make sure:
- `package.json` has `"type": "module"`
- JEST config uses `NODE_OPTIONS=--experimental-vm-modules`
- Imports use `.js` extensions

### Mock not working
For ES modules, use `jest.unstable_mockModule()` before importing:
```javascript
jest.unstable_mockModule('./module.js', () => ({
  export: mockValue,
}));
const { export } = await import('./module.js');
```

## Future Improvements

- [ ] Add integration tests for Svelte components
- [ ] Add E2E tests with Playwright
- [ ] Increase test coverage for edge cases
- [ ] Add performance benchmarks
- [ ] Add visual regression tests for UI components
