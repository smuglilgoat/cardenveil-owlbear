import { jest } from '@jest/globals';
import { zipSync, strToU8 } from 'fflate';

jest.unstable_mockModule('../../src/lib/supabaseClient.js', () => ({
  supabase: {
    from: jest.fn(),
    channel: jest.fn(),
    removeChannel: jest.fn(),
    storage: {
      from: jest.fn(),
    },
  },
}));

// Import after mocking
const { collectImageRefs, rewriteImagePaths, resolveAssetFile, importSheetArchive, ASSET_BUCKET } = await import('../../src/lib/sheetAssets.js');
const { supabase: mockClient } = await import('../../src/lib/supabaseClient.js');

function mockStorageUpload() {
  const upload = jest.fn().mockResolvedValue({ error: null });
  const getPublicUrl = jest.fn((path) => ({
    data: { publicUrl: `https://supabase.test/storage/v1/object/public/${ASSET_BUCKET}/${path}` },
  }));
  mockClient.storage.from.mockReturnValue({ upload, getPublicUrl });
  return { upload, getPublicUrl };
}

function mockSheetSave() {
  const single = jest.fn().mockResolvedValue({ data: { data: { identity: { nom: 'Test' } } }, error: null });
  const select = jest.fn().mockReturnValue({ single });
  const upsert = jest.fn().mockReturnValue({ select });
  mockClient.from.mockImplementation((table) => (table === 'character_sheets' ? { upsert } : {}));
  return { upsert };
}

const SHEET = {
  identity: { nom: 'Test', race: 'haut-elfe' },
  stats: { force: 10, agilite: 10, esprit: 10, social: 10 },
  portrait: '/assets/test/portrait.png',
  totem: { nom: 'T', description: '', image: '/assets/test/totem.png' },
  capacities: [
    { name: 'A', image: '/assets/test/capacity-1.png' },
    { name: 'B', image: 'https://example.com/remote.png' },
    { name: 'C', image: 'data:image/png;base64,abc' },
    { name: 'D', image: '' },
  ],
};

describe('sheetAssets', () => {
  describe('collectImageRefs', () => {
    it('should collect portrait, totem and capacity image paths', () => {
      const refs = collectImageRefs(SHEET);
      expect(refs).toEqual([
        { kind: 'portrait', index: undefined, zipPath: 'assets/test/portrait.png' },
        { kind: 'totem', index: undefined, zipPath: 'assets/test/totem.png' },
        { kind: 'capacity', index: 0, zipPath: 'assets/test/capacity-1.png' },
      ]);
    });

    it('should skip data URIs, http(s) URLs and empty values', () => {
      const refs = collectImageRefs({
        portrait: 'https://example.com/p.png',
        totem: { image: 'data:image/png;base64,abc' },
        capacities: [{ image: '' }],
      });
      expect(refs).toEqual([]);
    });
  });

  describe('rewriteImagePaths', () => {
    it('should rewrite known paths and count them', () => {
      const urlByZipPath = new Map([['assets/test/portrait.png', 'https://host/portrait.png']]);
      const { sheet, rewritten } = rewriteImagePaths(SHEET, urlByZipPath);
      expect(rewritten).toBe(1);
      expect(sheet.portrait).toBe('https://host/portrait.png');
      // untouched fields keep their original value
      expect(sheet.totem.image).toBe('/assets/test/totem.png');
      expect(sheet.capacities[0].image).toBe('/assets/test/capacity-1.png');
      // the original sheet object is not mutated
      expect(SHEET.portrait).toBe('/assets/test/portrait.png');
    });
  });

  describe('resolveAssetFile', () => {
    const files = { 'x/y/portrait.png': new Uint8Array([1]) };
    it('should match the path verbatim', () => {
      expect(resolveAssetFile({ 'assets/a.png': new Uint8Array([1]) }, 'assets/a.png')).toBe('assets/a.png');
    });
    it('should fall back to basename matching', () => {
      expect(resolveAssetFile(files, '/assets/other-name/portrait.png')).toBe('x/y/portrait.png');
    });
    it('should return null for missing assets and directories', () => {
      expect(resolveAssetFile(files, 'assets/missing.png')).toBeNull();
      expect(resolveAssetFile({ 'assets/': new Uint8Array(0) }, 'assets/')).toBeNull();
    });
  });

  describe('importSheetArchive', () => {
    it('should unzip, upload assets, rewrite paths and save the sheet', async () => {
      const storage = mockStorageUpload();
      const save = mockSheetSave();

      const zip = zipSync({
        'metadata.json': strToU8(JSON.stringify({ loreSummary: 'x' })),
        'afreaux.rpsheet.json': strToU8(JSON.stringify(SHEET)),
        'assets/test/portrait.png': new Uint8Array([1, 2, 3]),
        'assets/test/totem.png': new Uint8Array([4, 5]),
        'assets/test/capacity-1.png': new Uint8Array([6]),
      });

      const result = await importSheetArchive('player-1', 'room-1', zip);

      // 3 uploads to the bucket with the right paths + upsert content type
      expect(storage.upload).toHaveBeenCalledTimes(3);
      expect(storage.upload.mock.calls[0]).toEqual(
        ['room-1/player-1/portrait.png', expect.any(Uint8Array), { upsert: true, contentType: 'image/png' }]
      );
      // saved sheet carries the public URLs with a cache-buster
      const savedJson = save.upsert.mock.calls[0][0].data;
      expect(savedJson.portrait).toMatch(/^https:\/\/supabase\.test\/.*portrait\.png\?v=\d+$/);
      expect(savedJson.totem.image).toContain('totem.png?v=');
      expect(savedJson.capacities[0].image).toContain('capacity-1.png?v=');
      // remote URL and data URI were left alone by the rewriter
      expect(savedJson.capacities[1].image).toBe('https://example.com/remote.png');
      expect(result.data.identity.nom).toBe('Test');
    });

    it('should fail when the archive has no sheet JSON', async () => {
      mockStorageUpload();
      mockSheetSave();
      const zip = zipSync({ 'metadata.json': strToU8('{}') });
      await expect(importSheetArchive('p', 'r', zip)).rejects.toThrow("Aucune fiche JSON");
    });

    it('should fail when the sheet JSON is invalid', async () => {
      mockStorageUpload();
      mockSheetSave();
      const zip = zipSync({ 'bad.rpsheet.json': strToU8('not json') });
      await expect(importSheetArchive('p', 'r', zip)).rejects.toThrow('invalide');
    });
  });
});
