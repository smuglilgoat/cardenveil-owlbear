import { jest } from '@jest/globals';

// The standalone sheet tab (issue #14) is a top-level page while the room's
// frames are embedded in www.owlbear.rodeo: Chrome partitions BroadcastChannel
// AND localStorage by top-level site, so the tab can reach neither the room's
// broadcast nor its credential. The tab's roll therefore goes through the
// command channel (Supabase), and the room's background page relays it.
const sendMessage = jest.fn(() => Promise.reject(new Error('Unable to send message: not ready')));
jest.unstable_mockModule('@owlbear-rodeo/sdk', () => ({
  default: {
    isAvailable: false,
    player: { getName: jest.fn(() => Promise.reject(new Error('not ready'))) },
    broadcast: { sendMessage },
  },
}));

const publishCommand = jest.fn(() => Promise.resolve({ id: 'cmd-1' }));
jest.unstable_mockModule('../../src/lib/roomBridge.js', () => ({
  publishCommand,
  discardCommand: jest.fn(() => Promise.resolve()),
  COMMAND_ROLL: 'roll',
  COMMAND_ACTION: 'action',
}));

const { broadcastRoll, ROLL_CHANNEL } = await import('../../src/lib/rollBroadcast.js');

describe('broadcastRoll outside Owlbear', () => {
  beforeEach(() => {
    publishCommand.mockClear();
    sendMessage.mockClear();
  });

  it('falls back to the command channel when OBR.broadcast is not ready', async () => {
    const rollId = await broadcastRoll(
      {
        label: 'Athlétisme',
        playerId: 'p1',
        diceSpec: [{ count: 1, sides: 20 }],
        modifier: 3,
        seed: 42,
      },
      'room-1',
      'secret-1'
    );

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(publishCommand).toHaveBeenCalledTimes(1);
    const [roomId, kind, payload, secret] = publishCommand.mock.calls[0];
    expect(secret).toBe('secret-1');
    expect(roomId).toBe('room-1');
    expect(kind).toBe('roll');
    expect(payload.rollId).toBe(rollId);
    expect(payload.label).toBe('Athlétisme');
    expect(payload.playerId).toBe('p1');
    expect(payload.diceSpec).toEqual([{ count: 1, sides: 20 }]);
  });

  it('uses the room broadcast when it works, and never the command channel', async () => {
    sendMessage.mockResolvedValueOnce(undefined);

    const rollId = await broadcastRoll({ label: 'Test', playerId: 'p1' }, 'room-1');

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toBe(ROLL_CHANNEL);
    expect(publishCommand).not.toHaveBeenCalled();
    expect(rollId).toEqual(expect.any(String));
  });
});
