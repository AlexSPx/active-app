import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

import { attachDumbbells, createExerciseGroups, dumbbellGripTransform } from './clips.mjs';
import { createBarbell } from './barbell.mjs';
import { createBodyweightSupport } from './bodyweight-support.mjs';
import { createDeclineBench } from './decline-bench-training.mjs';
import { createFinalConditioningFixture } from './final-conditioning-fixtures.mjs';
import { createFinalStrengthFixture } from './final-strength-fixtures.mjs';
import { createFinalApparatusFixture } from './final-apparatus-fixtures.mjs';
import { createMachineGuidedFixture } from './machine-guided-fixtures.mjs';
import { createMachineStrengthFixture } from './machine-strength-fixtures.mjs';
import { createMobilityBallFixture } from './mobility-ball-fixtures.mjs';
import { createSupplementalFixture } from './supplemental-fixtures.mjs';
import { createResistanceFixture } from './resistance-fixtures.mjs';
import { createDipStation } from './dip-station.mjs';
import { createStepPlatform } from './dumbbell-expansion.mjs';
import { createDumbbell } from './dumbbell.mjs';
import { createEzCurlBar } from './ez-curl-bar.mjs';
import { createFlatBench } from './flat-bench.mjs';
import { createInclineBench } from './incline-bench.mjs';
import { createKettlebell } from './kettlebell.mjs';
import { createPullUpBar } from './pull-up-bar.mjs';
import { createSquatRack } from './squat-rack.mjs';

const byId = (id) => document.getElementById(id);
const stage = byId('stage');
const status = byId('status');
const params = new URLSearchParams(location.hash.slice(1));
const mode = params.get('mode');
const initialExercise = params.get('exercise') ?? 'local:exercise:Bodyweight_Squat';
const play = byId('play');
const timeline = byId('timeline');
const speed = byId('speed');
const time = byId('time');
const phase = byId('phase');
const picker = byId('muscle');
const exercisePicker = byId('exercise');
const previousExercise = byId('previous-exercise');
const nextExercise = byId('next-exercise');
const legend = byId('legend');
const cues = byId('cues');
const viewButtons = [...document.querySelectorAll('[data-view]')];
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera();
const context = document.createElement('canvas').getContext('webgl2', { alpha: true, antialias: true });
if (!context) {
  status.textContent = 'The 3D demo is unavailable on this device.';
  throw new Error('WebGL 2 is unavailable');
}
const renderer = new THREE.WebGLRenderer({ canvas: context.canvas, context, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, mode === 'app' ? 1.5 : 2));
renderer.setClearAlpha(0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
renderer.domElement.setAttribute('role', 'img');
renderer.domElement.setAttribute('aria-label',
  'Rotatable anatomical figure. Camera, playback and muscle controls follow.');
stage.insertBefore(renderer.domElement, status);

let renderFrame;
function render() {
  renderFrame ??= requestAnimationFrame(() => {
    renderFrame = undefined;
    renderer.render(scene, camera);
  });
}


const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = mode !== 'app';
controls.enablePan = false;
controls.minZoom = .85;
controls.maxZoom = 2.4;
controls.minPolarAngle = .18;
controls.maxPolarAngle = Math.PI / 2;
const bounds = new THREE.Box3(new THREE.Vector3(-.52, 0, -.30), new THREE.Vector3(.52, 1.9, .30));
bounds.getCenter(controls.target);
let framing;
let setupHeading = 0;
let viewWidth = 1.04;
let viewHeight = 2.35;

const views = {
  angle: [1.62, .36, 2.35],
  front: [0, .14, 2.82],
  side: [2.82, .14, 0],
  back: [0, .14, -2.82],
};

const sideOccluders = new Set([
  'Pulley mast', 'Weight stack', 'Low-pulley steel frame', 'Pulley slot',
  'Smith upright', 'Polished guide rail', 'Guide rail mount', 'Rack notch',
  'Bar carriage', 'Smith hook', 'Smith safety stop',
  'Rack upright', 'Chain suspension mount', 'Overhead band mount',
  'Shaft collar', 'Plate',
]);
const sideMaterials = new Map();

function setView(view) {
  for (const button of viewButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  }
  for (const [mesh, material] of sideMaterials) {
    mesh.material.dispose();
    mesh.material = material;
  }
  sideMaterials.clear();
  if (view === 'side') {
    scene.traverseVisible((mesh) => {
      if (!mesh.isMesh) return;
      const post = mesh.name === 'Upright' &&
        (mesh.parent.name === 'Squat rack' || mesh.parent.children.some(({ name }) => name === 'Shaft collar'));
      if (!post && !sideOccluders.has(mesh.name)) return;
      sideMaterials.set(mesh, mesh.material);
      mesh.material = mesh.material.clone();
      mesh.material.transparent = true;
      mesh.material.opacity = .18;
      mesh.material.depthWrite = false;
    });
  }
  if (!view) {
    render();
    return;
  }
  const [x, y, z] = views[view];
  const cosine = Math.cos(setupHeading);
  const sine = Math.sin(setupHeading);
  camera.position.set(x * cosine + z * sine, y, z * cosine - x * sine);
  if (framing === 'floor' || framing === 'bench') {
    camera.position.y = view === 'angle' ? 1.6 : .68;
  }
  camera.position.add(controls.target);
  camera.zoom = 1;
  controls.update();
  camera.updateMatrixWorld();
  const corner = new THREE.Vector3();
  viewWidth = viewHeight = 0;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        corner.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        viewWidth = Math.max(viewWidth, Math.abs(corner.x) * 2);
        viewHeight = Math.max(viewHeight, Math.abs(corner.y) * 2);
      }
    }
  }
  resize();
}

const key = new THREE.DirectionalLight(0xffffff, 2.6);
key.position.set(2.5, 4.2, 3);
const rim = new THREE.DirectionalLight(0xe6efff, 1.5);
rim.position.set(-2.4, 2.4, -3);
scene.add(new THREE.HemisphereLight(0xf2f7ff, 0xaebbc8, 1.85), key, rim);

const grid = new THREE.GridHelper(1.2, 12, 0x8da0b3, 0x9cafc1);
grid.material.transparent = true;
grid.material.opacity = .39;
grid.position.y = -.01;
scene.add(grid);

const activeMuscles = new Set();
const materials = new Map();
const neckExerciseId = 'local:exercise:Neck-SMR';
const neckHighlight = { value: 0 };
const primaryColor = '#d52f10';
const neckColor = { value: new THREE.Color(primaryColor) };

function localizeNeckHighlight(mesh) {
  mesh.updateWorldMatrix(true, false);
  // The packed GLB uses a mesh transform to decode its bind-pose positions to meters.
  const anatomyRestMatrix = { value: mesh.matrixWorld.clone() };
  mesh.material.onBeforeCompile = (shader) => {
    shader.uniforms.neckHighlight = neckHighlight;
    shader.uniforms.neckColor = neckColor;
    shader.uniforms.anatomyRestMatrix = anatomyRestMatrix;
    shader.vertexShader = 'varying vec3 anatomyPosition;\nuniform mat4 anatomyRestMatrix;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nanatomyPosition = (anatomyRestMatrix * vec4(position, 1.0)).xyz;',
    );
    shader.fragmentShader = 'varying vec3 anatomyPosition;\nuniform float neckHighlight;\nuniform vec3 neckColor;\n' +
      shader.fragmentShader.replace('#include <color_fragment>', `
        // shortcut: mask the neck by bind-pose position until the atlas labels it separately.
        float neck = smoothstep(1.395, 1.425, anatomyPosition.y)
          * (1.0 - smoothstep(1.487, 1.515, anatomyPosition.y))
          * (1.0 - smoothstep(0.065, 0.105, abs(anatomyPosition.x)))
          * (1.0 - smoothstep(0.035, 0.075, anatomyPosition.z));
        diffuseColor.rgb = mix(diffuseColor.rgb, neckColor, neck * neckHighlight);
        #include <color_fragment>
      `);
  };
}

function updateHighlights() {
  for (const button of legend.children) {
    button.setAttribute('aria-pressed', String(!picker.value && activeMuscles.has(button.dataset.muscle)));
  }
  const highlightNeck = exercise === entries[neckExerciseId];
  neckHighlight.value = highlightNeck && !picker.value && activeMuscles.has('Other anatomy') ? 1 : 0;
  for (const [name, { material, gray }] of materials) {
    const color = picker.value === name ? '#226ec0'
      : !picker.value && activeMuscles.has(name) && !(highlightNeck && name === 'Other anatomy')
        ? (exercise.primary.includes(name) ? primaryColor : '#d99515') : null;
    if (color) material.color.set(color);
    else material.color.copy(gray);
  }
  render();
}

legend.addEventListener('click', (event) => {
  const button = event.target.closest('[data-muscle]');
  if (!button) return;
  const name = button.dataset.muscle;
  if (picker.value || !activeMuscles.has(name)) activeMuscles.add(name);
  else activeMuscles.delete(name);
  picker.value = '';
  updateHighlights();
});
picker.addEventListener('change', updateHighlights);
for (const button of viewButtons) {
  button.addEventListener('click', () => setView(button.dataset.view));
}
controls.addEventListener('start', () => setView(null));
controls.addEventListener('change', render);

function resize() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const vertical = Math.max(viewHeight * 1.18, viewWidth * 1.18 * height / width);
  const horizontal = vertical * width / height;
  camera.left = -horizontal / 2;
  camera.right = horizontal / 2;
  camera.top = vertical / 2;
  camera.bottom = -vertical / 2;
  camera.near = .05;
  camera.far = 20;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  render();
}
new ResizeObserver(resize).observe(stage);
setView('angle');

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const embedded = byId('embedded-model');
let modelUrl;
let embeddedBytes;
if (embedded) {
  const base64 = embedded.textContent;
  if (Uint8Array.fromBase64) {
    embeddedBytes = Uint8Array.fromBase64(base64);
  } else {
    const decoded = atob(base64);
    embeddedBytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) embeddedBytes[i] = decoded.charCodeAt(i);
  }
  if (!mode) {
    modelUrl = URL.createObjectURL(new Blob([embeddedBytes], { type: 'model/gltf-binary' }));
    byId('download-model').href = modelUrl;
  }
}
const asset = embeddedBytes
  ? await loader.parseAsync(embeddedBytes.buffer, '')
  : await loader.loadAsync(new URL('./anatomy.glb', import.meta.url).href);
embeddedBytes = undefined;
scene.add(asset.scene);
const boneBounds = new Map();
const point = new THREE.Vector3();
const skinIndices = new THREE.Vector4();
const skinWeights = new THREE.Vector4();
asset.scene.traverse((object) => {
  if (!object.isSkinnedMesh) return;
  object.frustumCulled = false;
  materials.set(object.material.name, { material: object.material, gray: object.material.color.clone() });
  if (object.material.name === 'Other anatomy' || object.material.name === 'Upper back') localizeNeckHighlight(object);
  const { position, skinIndex, skinWeight } = object.geometry.attributes;
  const { bones, boneInverses } = object.skeleton;
  const bindToBone = boneInverses.map((inverse) => inverse.clone().multiply(object.bindMatrix));
  const boxes = bones.map((bone) => {
    if (!boneBounds.has(bone)) boneBounds.set(bone, new THREE.Box3());
    return boneBounds.get(bone);
  });
  for (let vertex = 0; vertex < position.count; vertex++) {
    skinIndices.fromBufferAttribute(skinIndex, vertex);
    skinWeights.fromBufferAttribute(skinWeight, vertex);
    for (let i = 0; i < 4; i++) {
      if (skinWeights.getComponent(i) === 0) continue;
      const joint = skinIndices.getComponent(i);
      boxes[joint].expandByPoint(point.fromBufferAttribute(position, vertex).applyMatrix4(bindToBone[joint]));
    }
  }
});
for (const [bone, box] of boneBounds) {
  if (box.isEmpty()) boneBounds.delete(bone);
}
for (const name of [...materials.keys()].sort()) {
  if (name !== 'Skeleton' && name !== 'Other anatomy') picker.add(new Option(name, name));
}
const groupIndex = mode === 'app' && byId('exercise-group-index');
const selectedGroup = groupIndex
  ? JSON.parse(groupIndex.textContent).find(([, ids]) => ids.includes(initialExercise))?.[0] ?? null
  : undefined;
const groups = createExerciseGroups(asset, selectedGroup, selectedGroup ? initialExercise : undefined);
const entries = Object.assign({}, ...groups.map(([, entries]) => entries));
const [left, right] = attachDumbbells(asset.scene, createDumbbell);
const barbell = createBarbell();
const cradleDumbbell = createDumbbell();
const stepPlatform = createStepPlatform();
const dipStation = createDipStation();
const ezCurlBar = createEzCurlBar();
const bench = createFlatBench();
const declineBench = createDeclineBench();
const kettlebell = createKettlebell();
const secondKettlebell = createKettlebell();
const pullUpBar = createPullUpBar();
scene.add(barbell, bench, declineBench, kettlebell, secondKettlebell, pullUpBar, ezCurlBar, dipStation, cradleDumbbell, stepPlatform);
const propMixers = new Map([barbell, kettlebell, secondKettlebell, ezCurlBar, cradleDumbbell]
  .map((prop) => [prop, new THREE.AnimationMixer(prop)]));
const inclineBenches = new Map();
const racks = new Map();
const bodyweightSupports = new Map();
let inclineBench;
let rack;
let resistanceFixture;
let supplementalFixture;
let trainingFixture;
const trainingFixtureBuilders = [
  ['machineGuidedFixture', createMachineGuidedFixture],
  ['machineStrengthFixture', createMachineStrengthFixture],
  ['mobilityBallFixture', createMobilityBallFixture],
  ['finalConditioningFixture', createFinalConditioningFixture],
  ['finalStrengthFixture', createFinalStrengthFixture],
  ['finalApparatusFixture', createFinalApparatusFixture],
];
let bodyweightSupport;
let propActions = [];
const mixer = new THREE.AnimationMixer(asset.scene);
const exerciseBounds = new Map();
let stopAtFinish;
let clip;
let action;
let exercise;
let seconds = 0;
let frame = 0;
let lastFrame;

function selectFixture(previous, variants, visible, size, create, transform) {
  if (previous) previous.visible = false;
  if (!visible) return;
  if (!variants.has(size)) {
    const fixture = create(size);
    variants.set(size, fixture);
    scene.add(fixture);
  }
  const fixture = variants.get(size);
  fixture.position.fromArray(transform?.position ?? [0, 0, 0]);
  fixture.rotation.y = transform?.yaw ?? 0;
  fixture.visible = true;
  return fixture;
}

function selectExercise(id) {
  stop();
  action?.stop();
  for (const [, action] of propActions) action.stop();
  exercise = entries[id];
  clip = exercise.clip;
  const { equipment = '', benchTransform, rackTransform, platformTransform, dumbbellOffsets, propClip, secondPropClip, oneShot } = exercise;
  if (resistanceFixture) {
    resistanceFixture.root.removeFromParent();
    resistanceFixture.root.traverse((object) => object.geometry?.dispose());
  }
  resistanceFixture = exercise.resistance
    ? createResistanceFixture(exercise.resistance, asset.scene, dumbbellGripTransform) : undefined;
  if (resistanceFixture) scene.add(resistanceFixture.root);
  if (supplementalFixture) {
    supplementalFixture.root.removeFromParent();
    supplementalFixture.root.traverse((object) => object.geometry?.dispose());
  }
  supplementalFixture = exercise.fixtures?.length || exercise.animatedFixture || exercise.barLoad
    ? createSupplementalFixture(exercise, equipment.endsWith('ez-curl-bar') ? ezCurlBar : barbell) : undefined;
  if (supplementalFixture) scene.add(supplementalFixture.root);
  if (trainingFixture) {
    trainingFixture.root.removeFromParent();
    trainingFixture.root.traverse((object) => object.geometry?.dispose());
  }
  const trainingFixtureBuilder = trainingFixtureBuilders.find(([key]) => exercise[key]);
  trainingFixture = trainingFixtureBuilder?.[1](exercise, asset.scene, barbell);
  if (trainingFixture) scene.add(trainingFixture.root);
  declineBench.visible = equipment.startsWith('decline-bench');
  bodyweightSupport = selectFixture(bodyweightSupport, bodyweightSupports, Boolean(exercise.bodyweightSupport),
    exercise.bodyweightSupport, createBodyweightSupport);
  bench.visible = equipment.startsWith('bench');
  bench.position.fromArray((bench.visible && benchTransform?.position) || [0, 0, 0]);
  bench.rotation.y = (bench.visible && benchTransform?.yaw) || 0;
  inclineBench = selectFixture(inclineBench, inclineBenches, equipment.startsWith('incline-bench'),
    benchTransform?.angle, (angle) => createInclineBench({ angle }), benchTransform);
  rack = selectFixture(rack, racks, (equipment === 'rack-barbell' || Boolean(rackTransform)), rackTransform?.hookHeight, (hookHeight) => {
    const fixture = createSquatRack({ hookHeight });
    fixture.getObjectByName('Barbell').removeFromParent();
    return fixture;
  }, rackTransform);
  stepPlatform.visible = equipment.startsWith('step-platform-') || equipment === 'bench-platform-dumbbell-right';
  stepPlatform.position.fromArray(platformTransform?.position ?? [0, 0, 0]);
  stepPlatform.rotation.y = platformTransform?.yaw ?? 0;
  cradleDumbbell.visible = equipment.endsWith('cradle-dumbbell');
  dipStation.visible = equipment === 'dip-station';
  pullUpBar.visible = equipment === 'pull-up-bar';
  left.visible = equipment.endsWith('dumbbells') || equipment.endsWith('dumbbell-left');
  right.visible = equipment.endsWith('dumbbells') || equipment.endsWith('dumbbell-right');
  [left, right].forEach((prop, i) => {
    prop.position.copy(dumbbellGripTransform(1 - 2 * i).position);
    prop.translateX(dumbbellOffsets?.[i] ?? 0);
  });
  barbell.visible = equipment.endsWith('barbell');
  kettlebell.visible = equipment === 'kettlebell' || equipment === 'two-kettlebells';
  secondKettlebell.visible = equipment === 'two-kettlebells';
  ezCurlBar.visible = equipment.endsWith('ez-curl-bar');
  for (const prop of propMixers.keys()) {
    prop.position.set(0, 0, 0);
    prop.quaternion.identity();
  }
  propActions = [...propMixers].filter(([prop]) => prop.visible).map(([prop, mixer]) => {
    const action = mixer.clipAction(prop === secondKettlebell ? secondPropClip : propClip)
      .setLoop(THREE.LoopOnce, 1);
    action.play().paused = true;
    return [mixer, action];
  });
  if (exercise.animatedFixture) {
    const fixtureMixer = new THREE.AnimationMixer(supplementalFixture.animated);
    const fixtureAction = fixtureMixer.clipAction(secondPropClip ?? propClip).setLoop(THREE.LoopOnce, 1);
    fixtureAction.play().paused = true;
    propActions.push([fixtureMixer, fixtureAction]);
  }
  action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  action.play().paused = true;
  const stride = clip.tracks.find((track) => track.name === 'Pelvis.position');
  const start = stride && new THREE.Vector3().fromArray(stride.values);
  const finish = stride && new THREE.Vector3().fromArray(stride.values, stride.values.length - 3);
  stopAtFinish = oneShot || (stride && Math.hypot(finish.x - start.x, finish.z - start.z) > .5);
  framing = exercise.framing;
  if (!exerciseBounds.has(id)) exerciseBounds.set(id, measureBounds());
  bounds.copy(exerciseBounds.get(id));
  bounds.getCenter(controls.target);
  grid.position.x = controls.target.x;
  grid.position.z = controls.target.z;
  grid.scale.set(Math.max(1, (bounds.max.x - bounds.min.x) / 1.2), 1,
    Math.max(1, (bounds.max.z - bounds.min.z) / 1.2));
  document.title = exercise.name + ' · Exercise anatomy';
  byId('exercise-name').textContent = exercise.name;
  renderer.domElement.setAttribute('aria-label', mode === 'app'
    ? exercise.name + ' movement demonstration'
    : 'Rotatable anatomical figure demonstrating ' + exercise.name);
  timeline.max = clip.duration;
  picker.value = '';
  activeMuscles.clear();
  for (const name of [...exercise.primary, ...exercise.supporting]) activeMuscles.add(name);
  if (mode !== 'app') updateStudioControls(id);
  if (mode === 'app') pose(0);
  else seek(0);
  const chest = asset.scene.getObjectByName('Chest').getWorldQuaternion(new THREE.Quaternion());
  const rightward = new THREE.Vector3(1, 0, 0).applyQuaternion(chest);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(chest);
  setupHeading = Math.hypot(rightward.x, rightward.z) > .3
    ? Math.atan2(-rightward.z, rightward.x)
    : Math.atan2(forward.x, forward.z);
  setView('angle');
  updateHighlights();
}

function updateStudioControls(id) {
  legend.replaceChildren();
  for (const name of activeMuscles) {
    const main = exercise.primary.includes(name);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'muscle ' + (main ? 'primary' : 'secondary');
    button.dataset.muscle = name;
    const dot = document.createElement('span');
    dot.className = 'dot';
    const role = document.createElement('span');
    role.className = 'role';
    role.textContent = main ? 'Primary' : 'Supporting';
    button.append(dot, id === neckExerciseId && name === 'Other anatomy' ? 'Neck' : name, role);
    legend.append(button);
  }
  cues.replaceChildren();
  exercise.cues.forEach(([at, title, detail], index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    const number = document.createElement('span');
    number.textContent = String(index + 1).padStart(2, '0');
    const heading = document.createElement('strong');
    heading.textContent = title;
    const description = document.createElement('small');
    description.textContent = detail;
    button.append(number, heading, description);
    button.addEventListener('click', () => {
      stop();
      seek(at);
    });
    item.append(button);
    cues.append(item);
  });
  previousExercise.disabled = exercisePicker.selectedIndex <= 0;
  nextExercise.disabled = exercisePicker.selectedIndex >= exercisePicker.options.length - 1;
  byId('exercise-position').textContent = `${exercisePicker.selectedIndex + 1} / ${exercisePicker.options.length}`;
}

function pose(at) {
  action.time = at;
  mixer.update(0);
  for (const [mixer, action] of propActions) {
    action.time = at;
    mixer.update(0);
  }
  resistanceFixture?.update();
  supplementalFixture?.update();
  trainingFixture?.update(at);
}

function measureBounds() {
  const combined = new THREE.Box3();
  const posedBox = new THREE.Box3();
  // Medicine ball throws can reach their apex between the usual framing samples.
  const sampleRate = trainingFixture?.boundsSampleRate ?? (exercise.mobilityBallFixture?.kind === 'ball' ? 30 : 8);
  const count = Math.ceil(clip.duration * sampleRate);
  for (let i = 0; i <= count; i++) {
    pose(clip.duration * i / count);
    scene.updateMatrixWorld(true);
    // With attached skinning, each world-space vertex is a weighted average of these bone-local positions.
    for (const [bone, box] of boneBounds) combined.union(posedBox.copy(box).applyMatrix4(bone.matrixWorld));
    for (const prop of [left, right, barbell, bench, kettlebell, secondKettlebell, pullUpBar, ezCurlBar, dipStation,
      inclineBench, rack, cradleDumbbell, stepPlatform, declineBench, bodyweightSupport, resistanceFixture?.root,
      supplementalFixture?.root, trainingFixture?.root]) {
      if (prop?.visible) combined.expandByObject(prop);
    }
  }
  return combined;
}

function seek(next) {
  seconds = next;
  pose(seconds);
  const label = exercise.phases.findLast(([start]) => seconds >= start)[1];
  const active = exercise.cues.findLastIndex(([start]) => seconds >= start);
  phase.textContent = label;
  timeline.value = seconds;
  time.value = seconds.toFixed(1) + ' / ' + clip.duration.toFixed(1) + ' s';
  timeline.setAttribute('aria-valuetext', seconds.toFixed(1) + ' seconds, ' + label);
  Array.from(cues.querySelectorAll('button')).forEach((button, index) => {
    if (index === active) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  render();
}

function stop() {
  cancelAnimationFrame(frame);
  frame = 0;
  lastFrame = undefined;
  play.textContent = 'Play';
}

function tick(now) {
  if (lastFrame !== undefined) {
    const next = seconds + Math.min((now - lastFrame) / 1000, .1) * Number(speed.value);
    if (stopAtFinish && next >= clip.duration) {
      seek(clip.duration);
      stop();
      return;
    }
    seek(next % clip.duration);
  }
  lastFrame = now;
  frame = requestAnimationFrame(tick);
}

function start() {
  if (seconds >= clip.duration) seek(0);
  play.textContent = 'Pause';
  frame = requestAnimationFrame(tick);
}

function startAppDemo() {
  if (params.get('still') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Give one-shot actions a beat at the finish before returning to the start pose.
  const cycle = clip.duration + (stopAtFinish ? .65 : 0);
  let startedAt;
  function animate(now) {
    startedAt ??= now;
    const elapsed = (now - startedAt) / 1000;
    pose(Math.min(elapsed % cycle, clip.duration));
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  }
  frame = requestAnimationFrame(animate);
}

for (const [button, offset] of [[previousExercise, -1], [nextExercise, 1]]) {
  button.addEventListener('click', () => {
    exercisePicker.selectedIndex += offset;
    selectExercise(exercisePicker.value);
    start();
  });
}

play.addEventListener('click', () => {
  if (frame) {
    stop();
  } else {
    start();
  }
});
timeline.addEventListener('input', () => {
  stop();
  const at = timeline.valueAsNumber;
  seek(clip.duration - at < 1e-10 ? clip.duration : at);
});
if (mode !== 'app') {
  for (const [label, group] of groups) {
    const options = document.createElement('optgroup');
    options.label = label;
    for (const [id, { name }] of Object.entries(group).sort(([, a], [, b]) => a.name.localeCompare(b.name))) {
      options.append(new Option(name, id));
    }
    exercisePicker.append(options);
  }
  exercisePicker.addEventListener('change', () => selectExercise(exercisePicker.value));
}
exercisePicker.value = initialExercise;
if (Object.hasOwn(entries, initialExercise)) {
  selectExercise(initialExercise);
  exercisePicker.disabled = timeline.disabled = play.disabled = false;
  status.hidden = true;
  if (mode === 'app') startAppDemo();
} else {
  status.textContent = 'A 3D demo is unavailable for this exercise.';
}

if (mode === 'record') {
  window.exerciseRecorder = {
    ids: Object.keys(entries),
    select(id) {
      if (!Object.hasOwn(entries, id)) throw new Error(`Unknown exercise: ${id}`);
      exercisePicker.value = id;
      selectExercise(id);
      return { duration: clip.duration, stopAtFinish: Boolean(stopAtFinish) };
    },
    render(at) {
      pose(Math.min(at, clip.duration));
      renderer.render(scene, camera);
    },
  };
}

export { asset, bounds, camera, entries, left, right, barbell, bench, kettlebell, secondKettlebell, pullUpBar, ezCurlBar, dipStation,
  inclineBenches, racks, cradleDumbbell, stepPlatform, declineBench, bodyweightSupport, resistanceFixture, supplementalFixture, trainingFixture, seconds };
