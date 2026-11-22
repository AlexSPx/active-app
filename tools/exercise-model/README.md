# Use the exercise model

`anatomy.glb` contains a gray adult anatomy figure with a 46-joint rig, 13 selectable muscle groups, and one four-second clip named `Bodyweight Squat`. The model uses meters, with Y up and +Z forward.

## Open the Three.js viewer

From this directory, run `python3 -m http.server 8000` and open [the local viewer](http://localhost:8000). The viewer uses Three.js 0.183.2 from jsDelivr and requires WebGL 2. After building the offline catalog, open `dist/exercise-animations.html` in a browser to use the viewer without a server or network access.

The source and offline viewers’ **Exercise** menu contains all 876 app catalog exercises across 48 movement and equipment groups. Use **Next & play** or **Previous & play** to inspect exercises in menu order with immediate playback; the counter shows your position in the catalog. Select **Play**, drag the rep timeline, or select a form cue to go to that pose. The muscle highlights and equipment follow the exercise. The atlas's **Upper back** group includes the latissimus dorsi and erector spinae. Traveling clips such as Walking Lunge and Standing Long Jump stop at their finish positions. Select **Play** again to start a fresh rep.

The equipment illustrates contact points and movement without simulating forces. Stretch clips with partner or strap instructions show the athlete's movement alone.

## Reuse the clips in Three.js

Load `anatomy.glb` with Meshopt and pass the loaded asset to `createExerciseGroups(asset)` in `clips.mjs`. The return value is a list of `[groupLabel, entries]` pairs. Each group's entries map catalog IDs to metadata and a standard Three.js `AnimationClip`. See `viewer.mjs` for the equipment, camera, and timeline wiring. The GLB download embeds Bodyweight Squat. The viewer builds the remaining catalog clips from the rig at load time.

```js
import { AnimationMixer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createExerciseGroups } from './clips.mjs';

const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('./anatomy.glb');
const entries = Object.assign({}, ...createExerciseGroups(asset).map(([, group]) => group));
const exercise = entries['local:exercise:Bodyweight_Squat'];

scene.add(asset.scene);
const mixer = new AnimationMixer(asset.scene);
mixer.clipAction(exercise.clip).play();
```

Call `mixer.update(deltaSeconds)` in your render loop. Stop the previous action before switching clips so Three.js restores the animated properties to their original values. For an entry with a `propClip`, bind it to the matching barbell, kettlebell, EZ curl bar, or standalone cradle dumbbell root in its own mixer and sample it at the same time as the figure. For two-kettlebell entries, bind `secondPropClip` to a separate instance of the kettlebell model and sample both prop mixers on the same timeline. The pull-up shaft is fixed at 2.30 m. The dip station stays at the scene origin. The step platform uses the entry’s `platformTransform` and defaults to the origin. Dumbbell Step Ups uses two hand-attached dumbbells, and Barbell Step Ups and Box Squat use an animated barbell. Seated Triceps Press and the cradle-grip dumbbell bench clips animate a standalone dumbbell in both hands. Hand-attached dumbbells can use `dumbbellOffsets` to shift along each handle from the calibrated position. The viewer samples the moving figure and visible equipment across the rep to frame each camera preset. Benches use the entry’s `benchTransform` for position and yaw, plus the backrest angle for incline benches. A rack entry uses `rackTransform` for the static frame’s position, yaw, and hook height, with the barbell animated separately. The original `createExerciseClips(asset)` and `exercises` exports still describe the three squat clips.

For an entry with `resistance`, call `createResistanceFixture(exercise.resistance, asset.scene, dumbbellGripTransform)` and add the returned `root` to the scene. Call `update()` after sampling the figure, including when measuring camera bounds. On a switch, remove the fixture root and dispose its geometries. Use `createDeclineBench()` for equipment that starts with `decline-bench` and `createBodyweightSupport(exercise.bodyweightSupport)` for chair and ankle restraint entries.

For entries with `fixtures`, `animatedFixture`, or `barLoad`, use `createSupplementalFixture(entry, bar)`. Pass the animated bar or EZ bar when sleeves carry chains or bands. When `animatedFixture` is set, apply `secondPropClip ?? propClip` to the returned `animated` group. Call `update()` after sampling the prop and dispose the fixture geometries on a switch.

For entries with `machineGuidedFixture`, `machineStrengthFixture`, `mobilityBallFixture`, `finalConditioningFixture`, `finalStrengthFixture`, or `finalApparatusFixture`, use the corresponding factory from its `*-fixtures.mjs` module. Add its `root` to the scene, call `update(seconds)` after sampling the figure, and dispose its geometries when switching exercises. Each factory samples any equipment tracks it owns in `update`.

### Author a hand pose

Each hand has five digits (Thumb, Index, Middle, Ring, Little) with three joints per digit, numbered outward from the palm. The GLB uses names such as `Index1.L`. Three.js binds their tracks to sanitized names such as `Index1L.quaternion`.

On a freshly loaded rig, call `createDumbbellGripTracks(asset.scene)` to get 30 constant quaternion tracks for the calibrated dumbbell grip. Append them to the body tracks of an `AnimationClip` with an explicit rep duration. Call `attachDumbbells(asset.scene, createDumbbell)` to seat the props in the grip's hand-local frame. The function uses `dumbbellGripTransform(sign)` to position the props and returns two hidden props, which you can show for weighted clips.

The pose in `clips.mjs` uses left-hand Euler angles in degrees, multiplied onto each joint's rest quaternion in `ZXY` order. Local +X flexes each digit on both sides, and local Z controls spread. To mirror the pose onto the right hand, negate Y and Z.

## Rebuild and verify the viewer

Run these commands from this directory after changing the rig, viewer, or clips. The playback checks require Chrome. Set `CHROME_BIN` if Chrome is installed somewhere other than `/usr/bin/google-chrome`.

```sh
npm ci
python3 build-offline.py --app
node verify-clip-selection.mjs
node verify-app-demo.mjs
node verify-navigation.mjs
```

The clip check compares the animation selected for each app exercise with the full catalog. The app check verifies offline autoplay and Reduce Motion. The navigation check covers exercise switching, playback, scrubbing, and camera controls at a phone width. To check the published site build, set `VIEWER_URL` to its `exercises.html` URL when running `verify-navigation.mjs`. Run `node verify-grip.mjs` when changing the calibrated dumbbell grip.

Commit the regenerated `apps/client/assets/exercise-animations.html` and its TypeScript asset reference. Android's incremental build uses the HTML hash in that reference to pick up viewer changes. CI runs `python3 build-offline.py --check` to check both files.

To register a family, import its `createEntries` in `clips.mjs` and add the group to `createExerciseGroups`. Use exact catalog IDs. If the builder uses a calibrated equipment grip, pass `createDumbbellGripTracks` and `dumbbellGripTransform` as the builder's second argument.

## Record MP4s

After rebuilding, run the recorder with Chrome, FFmpeg with libx264, and FFprobe installed.

```sh
node record-exercises.mjs
```

The recorder defaults to 12 exercises. Pass space-separated catalog source keys such as `Bodyweight_Squat Cat_Stretch` to record a subset, or pass `--all` to record the library. It writes silent 24 fps H.264 MP4s at 480 px and 360 px, plus a byte count and playback metadata for each file, to `dist/recordings`. Set `RECORDINGS_DIR` to write elsewhere or `CHROME_BIN` to select a different Chrome installation. One-shot clips include their finish pose. The MP4s stay outside the app bundle.

## Rebuild the GLB

Run these commands with Python 3 and Node.js available.

```sh
curl -fsSL https://raw.githubusercontent.com/Charleeh/ecorche/320805e06aee51e2e6f6b22533eb2a59d43f2d4d/model/ecorche.glb -o /tmp/active-ecorche.glb
curl -fsSL https://raw.githubusercontent.com/makehumancommunity/makehuman/3c701a8e52f09e69922e8b598d23be2d7dfc49e3/makehuman/data/3dobjs/base.obj -o /tmp/active-makehuman.obj
curl -fsSL https://raw.githubusercontent.com/ICT-VGL/ICT-FaceKit/da5f95a607f5e6b37755b38d3385d7f2853732e5/FaceXModel/generic_neutral_mesh.obj -o /tmp/active-facekit.obj
python3 build_model.py /tmp/active-ecorche.glb /tmp/active-makehuman.obj /tmp/active-facekit.obj /tmp/active-anatomy-uncompressed.glb
npx --yes gltfpack@1.3.0 -i /tmp/active-anatomy-uncompressed.glb -o anatomy.glb -c -si 0.46 -se 0.002 -kn -km -ke
```

The builder checks skin weights, loop closure, and planted ankle positions throughout the rep. Its uncompressed GLB is also usable with loaders that lack Meshopt support.

## Model credits

The adapted GLB is licensed under [CC BY-SA 4.0](CC-BY-SA-4.0.txt). This version reshapes the torso and limbs, groups and simplifies the source meshes, and converts the colors to gray. The ICT Face Model blends into the atlas neck muscles. The hands and feet use MakeHuman surfaces. The model includes a rig and squat animation.

- Écorché by Charleeh, CC BY-SA 4.0. [Source and attribution](https://github.com/Charleeh/ecorche/blob/320805e06aee51e2e6f6b22533eb2a59d43f2d4d/ATTRIBUTION.md)
- BodyParts3D, © The Database Center for Life Science, CC BY 4.0. [Source license](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)
- Z-Anatomy by Gauthier Kervyn and contributors, CC BY-SA 4.0. [Source](https://www.z-anatomy.com/)
- MakeHuman base mesh by Data Collection AB, Joel Palmius, and Jonas Hauquier, CC0. [Source](https://github.com/makehumancommunity/makehuman/blob/3c701a8e52f09e69922e8b598d23be2d7dfc49e3/makehuman/data/3dobjs/base.obj)
- ICT Face Model Light neutral head, © USC Institute for Creative Technologies. [MIT license](ICT-FaceKit-LICENSE.txt) · [Source](https://github.com/ICT-VGL/ICT-FaceKit/tree/da5f95a607f5e6b37755b38d3385d7f2853732e5)
