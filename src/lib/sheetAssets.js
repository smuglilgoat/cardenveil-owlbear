import { unzipSync } from 'fflate';
import { strFromU8 } from 'fflate';
import { supabase } from './supabaseClient.js';
import { importCharacterSheet } from './characterSheet.js';

/**
 * Zip-archive character sheet import.
 *
 * An archive contains:
 *   <sheetId>.rpsheet.json   — the character sheet (image fields are paths
 *                              like "/assets/<sheetId>/portrait.png")
 *   metadata.json            — optional lore/summary (ignored here)
 *   assets/<sheetId>/…       — portrait.png, totem.png, capacity-N.png
 *
 * Every referenced image is uploaded to the Supabase Storage bucket
 * (character-assets, path {roomId}/{playerId}/{fileName}, upsert) and the
 * sheet's image fields are rewritten to public URLs before the regular
 * JSON import (merge/strip/save) runs.
 */

export const ASSET_BUCKET = 'character-assets';

/**
 * Collect every image reference in a sheet JSON.
 * @param {object} sheet - Parsed sheet JSON
 * @returns {{kind: string, index?: number, zipPath: string}[]} References
 *   (zipPath = the referenced path without its leading slash)
 */
export function collectImageRefs(sheet) {
  const refs = [];
  const add = (kind, index, value) => {
    if (typeof value === 'string' && value && !value.startsWith('data:') && !/^https?:\/\//i.test(value)) {
      refs.push({ kind, index, zipPath: value.replace(/^\/+/, '') });
    }
  };
  add('portrait', undefined, sheet?.portrait);
  add('totem', undefined, sheet?.totem?.image);
  (sheet?.capacities ?? []).forEach((capacity, i) => add('capacity', i, capacity?.image));
  return refs;
}

/**
 * Rewrite the sheet's image fields with hosted URLs.
 * @param {object} sheet - Parsed sheet JSON (mutated copy returned)
 * @param {Map<string, string>} urlByZipPath - zipPath → public URL
 * @returns {{ sheet: object, rewritten: number }}
 */
export function rewriteImagePaths(sheet, urlByZipPath) {
  const out = JSON.parse(JSON.stringify(sheet));
  let rewritten = 0;
  const set = (kind, index, value) => {
    if (typeof value !== 'string' || !value) return;
    const zipPath = value.replace(/^\/+/, '');
    const url = urlByZipPath.get(zipPath);
    if (url) {
      rewritten++;
      if (kind === 'portrait') out.portrait = url;
      else if (kind === 'totem') out.totem.image = url;
      else out.capacities[index].image = url;
    }
  };
  set('portrait', undefined, sheet?.portrait);
  set('totem', undefined, sheet?.totem?.image);
  (sheet?.capacities ?? []).forEach((capacity, i) => set('capacity', i, capacity?.image));
  return { sheet: out, rewritten };
}

/**
 * Import a character sheet from a .zip archive.
 * @param {string} playerId - OBR player ID
 * @param {string} roomId - OBR room ID
 * @param {ArrayBuffer|Uint8Array} buffer - Zip archive contents
 * @returns {Promise<Object>} Saved character sheet (see importCharacterSheet)
 */
export async function importSheetArchive(playerId, roomId, buffer) {
  const files = unzipSync(new Uint8Array(buffer));

  // The sheet JSON: the only *.json that is not metadata.json
  const jsonName = Object.keys(files).find(
    (name) => name.endsWith('.json') && !name.endsWith('metadata.json') && !name.includes('__MACOSX')
  );
  if (!jsonName) {
    throw new Error("Aucune fiche JSON trouvée dans l'archive.");
  }

  let parsed;
  try {
    parsed = JSON.parse(strFromU8(files[jsonName]));
  } catch {
    throw new Error('La fiche JSON de l\'archive est invalide.');
  }

  const refs = collectImageRefs(parsed);
  if (refs.length) {
    const urlByZipPath = new Map();
    for (const ref of refs) {
      const entryName = resolveAssetFile(files, ref.zipPath);
      if (!entryName) {
        console.warn(`Asset introuvable dans l'archive : ${ref.zipPath}`);
        continue;
      }
      urlByZipPath.set(ref.zipPath, await uploadAsset(playerId, roomId, ref.zipPath, files[entryName]));
    }
    const { sheet, rewritten } = rewriteImagePaths(parsed, urlByZipPath);
    console.warn(`Uploaded ${urlByZipPath.size} asset(s), rewrote ${rewritten} image field(s)`);
    parsed = sheet;
  }

  return importCharacterSheet(playerId, roomId, JSON.stringify(parsed));
}

/**
 * Locate a zip entry for a referenced asset path. Tries the path verbatim,
 * then falls back to matching the basename anywhere in the archive.
 * @param {Record<string, Uint8Array>} files - unzipSync output
 * @param {string} zipPath - Referenced path without leading slash
 * @returns {string|null} Zip entry name
 */
export function resolveAssetFile(files, zipPath) {
  const names = Object.keys(files).filter((n) => !n.endsWith('/') && !n.includes('__MACOSX'));
  const verbatim = names.find((n) => n === zipPath);
  if (verbatim) return verbatim;
  const base = zipPath.split('/').pop();
  return names.find((n) => n.split('/').pop() === base) ?? null;
}

/**
 * Upload one asset file to the storage bucket.
 * @param {string} playerId
 * @param {string} roomId
 * @param {string} zipPath - Source path (basename becomes the storage key)
 * @param {Uint8Array} bytes - File content
 * @returns {Promise<string>} Public URL (cache-busted)
 */
export async function uploadAsset(playerId, roomId, zipPath, bytes) {
  const fileName = zipPath.split('/').pop();
  const path = `${roomId}/${playerId}/${fileName}`;
  const { error } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(path, bytes, { upsert: true, contentType: contentTypeMap(fileName) });
  if (error) throw error;
  const { data } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(path);
  return `${data?.publicUrl ?? ''}?v=${Date.now()}`;
}

function contentTypeMap(fileName) {
  const ext = fileName.toLowerCase().split('.').pop();
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext] ?? 'application/octet-stream';
}
