# Testing Guide

Cardenveil includes comprehensive testing for game logic, API endpoints, and utilities.

## Quick Start

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Types

### 1. Unit Tests (JEST)

Located in `tests/unit/`, these test individual functions and modules:

- **gameLogic.test.js** - Core game actions (DRAW, DISCARD, CRYSTALLIZE, USE_CAPACITY, race passives, etc.)
- **deck.test.js** - Card utilities, sorting, pending placeholders
- **api.test.js** - API client (realtime subscriptions, dispatch fallback)
- **characterSheet.test.js** - Dice parsing/rolling, combat formulas, sheet import/export helpers

**Run unit tests:**
```bash
npm run test:unit
```

### 2. HTTPie API Tests

Located in `tests/httpie/`, these are manual API test files for testing the Supabase flow:

```bash
# Install HTTPie
brew install httpie  # macOS
sudo apt install httpie  # Linux

# Test GET state
http GET http://localhost:8888/.netlify/functions/state roomId==test-room-123

# Test DRAW action
http POST http://localhost:8888/.netlify/functions/state \
  roomId=test-room-123 \
  action:='{"type":"DRAW","playerId":"player-1"}'
```

See `tests/httpie/README.md` for complete API test documentation.

## Test Coverage

Current coverage:
- ✅ 117 unit tests passing (4 suites)
- ✅ Game logic (all 34 actions)
- ✅ Deck utilities
- ✅ API client (realtime + dispatch fallback)
- ✅ State hydration/dehydration
- ✅ Optimistic updates
- ✅ Character sheet: dice formulas, combat formulas, imports, color helpers

## Writing Tests

### Example: Testing a Game Action

```javascript
import { applyAction, createInitialGameState } from '../../netlify/functions/_gameLogic.js';

describe('DRAW action', () => {
  it('should add a card to player hand', () => {
    const state = createInitialGameState();
    state.players = {
      'player-1': { hand: [], maxHandSize: 3 }
    };
    
    const { state: newState } = applyAction(state, {
      type: 'DRAW',
      playerId: 'player-1',
    });
    
    expect(newState.players['player-1'].hand.length).toBe(1);
  });
});
```

### Example: Testing API Client

```javascript
import { jest } from '@jest/globals';

// Mock fetch
global.fetch = jest.fn();

describe('fetchState', () => {
  it('should fetch state successfully', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ version: 1, state: {} }),
    });
    
    const result = await fetchState('test-room');
    expect(result).toBeDefined();
  });
});
```

## CI/CD Integration

Add to your CI pipeline:

```yaml
# Example GitHub Actions
- name: Run tests
  run: npm test

- name: Build
  run: npm run build
```

## Troubleshooting

### Tests fail with "jest is not defined"
Import jest from `@jest/globals`:
```javascript
import { jest } from '@jest/globals';
```

### Module import errors
Ensure `package.json` has `"type": "module"` and use `.js` extensions in imports.

### Mock not working
Use `jest.unstable_mockModule()` for ES modules before importing.

## Resources

- [JEST Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/docs/svelte-testing-library/intro/)
- [HTTPie Documentation](https://httpie.io/docs/cli)

## Contributing

When adding new features:
1. Write unit tests for new functions
2. Add HTTPie tests for new API endpoints
3. Ensure all tests pass before committing
4. Update test documentation if needed

Run `npm test` before committing to ensure nothing is broken.
