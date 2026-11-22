import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createExerciseGroups } from './clips.mjs';

const bytes = Uint8Array.from(await readFile(new URL('./anatomy.glb', import.meta.url)));
const load = () => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer, '');
const catalog = JSON.parse(await readFile(new URL('../../apps/client/lib/data/exercise-catalog.json', import.meta.url)));
const full = createExerciseGroups(await load());
assert.deepEqual(full.flatMap(([, entries]) => Object.keys(entries)).sort(), catalog.map(({ id }) => id).sort());

function withoutClipIds({ clip, propClip, secondPropClip, ...entry }) {
  const motion = [clip, propClip, secondPropClip].map((clip) =>
    clip && [clip.name, clip.duration, clip.blendMode, clip.tracks]);
  return { ...entry, motion };
}

const rig = await load();
for (const [label, entries] of full) {
  for (const [id, entry] of Object.entries(entries)) {
    const [[, selected]] = createExerciseGroups(rig, label, id);
    assert.deepEqual(Object.keys(selected), [id]);
    assert.deepEqual(withoutClipIds(selected[id]), withoutClipIds(entry), id);
  }
}
console.log(`Verified all ${catalog.length} exercise clips against the full catalog.`);
