"""Rig the pinned Écorché atlas and export a skinned glTF 2.0 exercise model."""

import json
import math
import struct
import sys
from functools import lru_cache
from pathlib import Path

PHASES = (0.12, 0.47, 0.57, 0.88)
DURATION = 4
DIGITS = ("Thumb", "Index", "Middle", "Ring", "Little")
IDENTITY = (0, 0, 0, 1)

# Joint centers are measured from the source skeleton, in meters.
ATLAS_JOINTS = {
    "Pelvis": (None, (0, .897, 0)),
    "Lumbar": ("Pelvis", (0, 1.024, -.027)),
    "Chest": ("Lumbar", (0, 1.205, -.029)),
    "Head": ("Chest", (0, 1.494, -.013)),
}
for side, sign in (("L", 1), ("R", -1)):
    for name, parent, (x, y, z) in (
        ("Thigh", "Pelvis", (.093, .897, -.002)),
        ("Shin", f"Thigh.{side}", (.078, .451, .002)),
        ("Foot", f"Shin.{side}", (.073, .074, -.004)),
        ("Arm", "Chest", (.163, 1.390, -.005)),
        ("Forearm", f"Arm.{side}", (.221, 1.116, -.009)),
        ("Hand", f"Forearm.{side}", (.248, .887, .036)),
    ):
        ATLAS_JOINTS[f"{name}.{side}"] = (parent, (sign * x, y, z))

MUSCLE_GROUPS = {
    "Quadriceps": ("rectus femoris", "vastus"),
    "Glutes": ("gluteus",),
    "Adductors": ("adductor longus", "adductor magnus", "adductor brevis", "adductor minimus",
                 "gracilis", "pectineus"),
    "Sartorius": ("sartorius",),
    "Hamstrings": ("biceps femoris", "semimembranosus", "semitendinosus"),
    "Calves": ("gastrocnemius", "soleus"),
    "Core": ("external oblique", "internal oblique", "rectus abdominis",
             "transversus abdominis", "quadratus lumborum", "linea alba"),
    "Chest": ("pectoralis",),
    "Upper back": ("trapezius", "latissimus dorsi", "rhomboid", "erector spinae",
                   "longissimus", "iliocostalis", "spinalis", "serratus posterior",
                   "posterior layer of thoracolumbar fascia"),
    "Shoulders": ("deltoid",),
    "Biceps": ("biceps brachii", "brachialis"),
    "Triceps": ("triceps brachii", "anconeus"),
    "Forearms": ("brachioradialis", "pronator", "supinator", "carpi", "palmaris",
                 "extensor indicis", "digitorum superficialis", "digitorum profundus"),
}


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def scale(v, amount):
    return tuple(x * amount for x in v)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    x, y, z = a
    u, v, w = b
    return (y*w-z*v, z*u-x*w, x*v-y*u)


def length(v):
    return math.sqrt(dot(v, v))


def unit(v):
    return scale(v, 1 / length(v))


def rotation(a, b):
    a, b = unit(a), unit(b)
    return unit((*cross(a, b), 1 + dot(a, b)))


def around_x(angle):
    return (math.sin(angle/2), 0, 0, math.cos(angle/2))


def around_y(angle):
    return (0, math.sin(angle/2), 0, math.cos(angle/2))


def inverse(q):
    return (*scale(q[:3], -1), q[3])


def multiply(a, b):
    v, w = a[:3], b[:3]
    return (*add(cross(v, w), add(scale(v, b[3]), scale(w, a[3]))), a[3]*b[3]-dot(v, w))


def turn(q, v):
    return multiply(multiply(q, (*v, 0)), inverse(q))[:3]


def smooth(start, end, value):
    t = min(1, max(0, (value - start) / (end - start)))
    return t * t * (3 - 2 * t)


def head_weight(y, z):
    jaw = .032*smooth(.05, .089, z)
    return smooth(1.438, 1.513, y + jaw)


def limb_section(y, upper, lower):
    _, (upper_x, upper_y, upper_z) = ATLAS_JOINTS[upper + ".L"]
    _, (lower_x, lower_y, lower_z) = ATLAS_JOINTS[lower + ".L"]
    t = min(1, max(0, (upper_y - y) / (upper_y - lower_y)))
    return (upper_x + (lower_x - upper_x) * t, upper_z + (lower_z - upper_z) * t)


@lru_cache(maxsize=20_000)
def body_section(y):
    chest = smooth(.91, 1.30, y) * smooth(1.47, 1.39, y)
    hips = smooth(.57, .85, y) * smooth(1.19, .95, y)
    neck = smooth(1.40, 1.47, y) * smooth(1.55, 1.49, y)
    spread = 1 + .17*chest + .095*hips + .10*neck
    depth = 1 + .15*chest + .12*hips + .09*neck
    arm_center = (limb_section(y, "Arm", "Forearm") if y >= 1.116
                  else limb_section(y, "Forearm", "Hand"))
    leg_center = (limb_section(y, "Thigh", "Shin") if y >= .451
                  else limb_section(y, "Shin", "Foot"))
    upper_arm = smooth(1.09, 1.24, y) * smooth(1.43, 1.29, y)
    forearm = smooth(.89, 1.01, y) * smooth(1.16, 1.07, y)
    arm_fill = (.15 + .24*upper_arm + .19*forearm) * smooth(.76, .91, y)
    thigh = smooth(.44, .65, y) * smooth(1.0, .78, y)
    calf = smooth(.085, .29, y) * smooth(.49, .37, y)
    leg_fill = (.13 + .29*thigh + .30*calf) * smooth(1.01, .83, y) * smooth(.028, .08, y)
    arm_edge = .132 + .062*smooth(1.39, .93, y)
    return spread, depth, arm_center, leg_center, arm_fill, leg_fill, arm_edge


def body_proportions(vertex):
    x, y, z = vertex
    side = -1 if x < 0 else 1
    lateral = abs(x)
    spread, depth, (ax, az), (lx, lz), arm_fill, leg_fill, arm_edge = body_section(y)
    arm = smooth(arm_edge, arm_edge + .057, lateral)
    leg_fill *= smooth(.018, .052, lateral)
    arm_fill *= arm
    shoulder = .034 * smooth(1.01, 1.23, y) * smooth(1.49, 1.41, y)
    t = min(1, max(0, (lateral - ax) / .065))
    taper = t*t*(3 - 2*t)
    lateral_scale = spread + arm_fill + leg_fill - shoulder * 6*t*(1-t) / .065
    x = side * (lateral*spread + (lateral-ax)*arm_fill + (lateral-lx)*leg_fill - shoulder*taper)
    z = z*(1 + (depth-1)*(1-arm)) + (z-az)*arm_fill + (z-lz)*leg_fill
    return (x, y, z), (lateral_scale, 1, 1 + (depth-1)*(1-arm) + arm_fill + leg_fill)


JOINTS = {name: (parent, body_proportions(point)[0])
          for name, (parent, point) in ATLAS_JOINTS.items()}


def joint(name):
    return JOINTS[name][1]


def squat(phase):
    start, bottom, rise, finish = PHASES
    depth = smooth(start, bottom, phase) * (1 - smooth(rise, finish, phase))
    pelvis = (0, .882 - .375*depth, .008 - .241*depth)
    angles = {
        "Pelvis": around_x(.04 + .13*depth),
        "Lumbar": around_x(.055 + .52*depth),
        "Chest": around_x(.055 + .52*depth),
        "Head": around_x(.04 + .07*depth),
    }
    for side, sign in (("L", 1), ("R", -1)):
        thigh, shin, foot, arm, forearm, hand = (
            f"{name}.{side}" for name in ("Thigh", "Shin", "Foot", "Arm", "Forearm", "Hand")
        )
        femur, tibia = sub(joint(shin), joint(thigh)), sub(joint(foot), joint(shin))
        # The hips follow the pelvis, while the ankles stay in world space.
        hip = add(pelvis, turn(angles["Pelvis"], sub(joint(thigh), joint("Pelvis"))))
        ankle = (.155*sign, joint(foot)[1], joint(foot)[2] - .002)
        span = sub(ankle, hip)
        distance, axis = length(span), unit(span)
        pole = (.18*sign, 0, 1)
        bend = unit(sub(pole, scale(axis, dot(axis, pole))))
        along = (dot(femur, femur) - dot(tibia, tibia) + distance**2) / (2 * distance)
        knee = add(hip, add(scale(axis, along), scale(bend, math.sqrt(dot(femur,femur) - along**2))))
        assert abs(length(sub(knee, hip)) - length(femur)) < 1e-8
        assert abs(length(sub(ankle, knee)) - length(tibia)) < 1e-8
        angles[thigh] = rotation(femur, sub(knee, hip))
        angles[shin] = rotation(tibia, sub(ankle, knee))
        angles[foot] = around_y(.06*sign)
        arm_direction = (sign*(.17-.10*depth), -1+.87*depth, .055+.95*depth)
        angles[arm] = rotation(sub(joint(forearm), joint(arm)), arm_direction)
        forearm_bend = multiply(around_x(-.04-.08*depth), angles[arm])
        axis = unit(turn(forearm_bend, sub(joint(hand), joint(forearm))))
        twist = sign*(.62+1.94*depth)
        pronation = (*scale(axis, math.sin(twist/2)), math.cos(twist/2))
        angles[forearm] = multiply(pronation, forearm_bend)
        angles[hand] = angles[forearm]
    local = {
        name: multiply(inverse(angles[parent]), angles[name]) if parent else angles[name]
        for name, (parent, _) in JOINTS.items()
    }
    return pelvis, local


def check_poses(poses):
    assert poses[0] == poses[-1] and poses[len(poses)//2][0][1] < .52
    for pelvis, rotations in poses:
        positions, angles = {}, {}
        for name, (parent, center) in JOINTS.items():
            if parent is None:
                positions[name], angles[name] = pelvis, rotations[name]
                continue
            positions[name] = add(positions[parent], turn(angles[parent], sub(center, joint(parent))))
            angles[name] = multiply(angles[parent], rotations[name])
        for side, sign in (("L", 1), ("R", -1)):
            ankle = positions[f"Foot.{side}"]
            assert length(sub(ankle, (.155*sign, .074, -.006))) < 1e-8


def muscle_group(name):
    return next((group for group, terms in MUSCLE_GROUPS.items()
                 if any(term in name for term in terms)), "Other anatomy")


def influences(obj, bounds):
    name, layer = obj["name"].lower(), obj["layer"]
    side = "R" if obj["side"] == "right" else "L"
    x_min, y_min, _ = bounds[0]
    x_max, y_max, _ = bounds[1]
    x_center, y_center = abs((x_min+x_max)/2), (y_min+y_max)/2
    arm, forearm, hand, thigh, shin, foot = (
        f"{part}.{side}" for part in ("Arm", "Forearm", "Hand", "Thigh", "Shin", "Foot")
    )

    def rigid(bone):
        return lambda x, y, z: ((bone, 1),)

    def between(first, second, weight):
        return ((first, 1-weight), (second, weight))

    def trunk_weights(x, y, z):
        lumbar = smooth(.945, 1.105, y)
        chest = smooth(1.105, 1.27, y)
        head = head_weight(y, z)
        return (("Pelvis", 1-lumbar), ("Lumbar", lumbar*(1-chest)),
                ("Chest", chest*(1-head)), ("Head", head))

    if y_center > 1.52 and y_min > 1.47:
        return rigid("Head")
    if layer == "skeleton":
        for labels, bone in (
            (("humerus",), arm), (("radius", "ulna"), forearm),
            (("femur",), thigh), (("fibula", "tibia"), shin),
            (("hip bone", "sacrum", "coccyx"), "Pelvis"),
        ):
            if name.endswith(labels):
                return rigid(bone)
        if "patella" in name:
            return lambda x, y, z: between(thigh, shin, .36)
        if y_center < .12:
            return rigid(foot)
        if x_center > .20 and y_max < .94:
            return rigid(hand)
        if y_min > 1.51:
            return rigid("Head")
        if "rib" in name or "costal" in name:
            # The lower costal margin follows the nearby abdominal wall as the spine twists.
            return lambda x, y, z: between("Lumbar", "Chest", smooth(1.10, 1.28, y))
        if "stern" in name:
            return rigid("Chest")
    if any(term in name for term in (
        "thoracolumbar fascia", "abdominal part of", "linea alba", "serratus",
        "intercostal", "trapezius", "rhomboid", "splenius", "spinalis",
    )):
        return trunk_weights
    if "latissimus" in name:
        def lat_weights(x, y, z):
            pelvis, lumbar, chest, _ = trunk_weights(x, y, z)
            shoulder = smooth(.145, .181, abs(x)) * smooth(1.21, 1.39, y)
            return (pelvis, lumbar, ("Chest", chest[1]*(1-shoulder)), (arm, chest[1]*shoulder))
        return lat_weights
    if any(term in name for term in ("deltoid", "pectoralis major", "teres major",
                                      "teres minor", "infraspinatus", "subscapularis", "supraspinatus")):
        return lambda x, y, z: between(
            "Chest", arm, smooth(.128, .185, abs(x)) * smooth(1.433, 1.36, y)
        )
    upper_arm = any(term in name for term in ("biceps brachii", "triceps brachii", "coracobrachialis"))
    if upper_arm or (x_center > .177 and y_min > .69):
        def arm_weights(x, y, z):
            elbow = smooth(1.167, 1.078, y)
            if upper_arm:
                shoulder = smooth(1.42, 1.35, y)
                return (("Chest", 1-shoulder), (arm, shoulder*(1-elbow)),
                        (forearm, shoulder*elbow))
            wrist = smooth(.942, .861, y)
            return ((arm, 1-elbow), (forearm, elbow*(1-wrist)), (hand, elbow*wrist))
        return arm_weights
    is_thigh = muscle_group(name) in ("Adductors", "Hamstrings")
    if is_thigh or y_center < .84 or any(term in name for term in (
        "gluteus", "sartorius", "iliotibial", "tensor fasciae", "psoas", "iliacus",
    )):
        if y_max < .09:
            return rigid(foot)

        def leg_weights(x, y, z):
            ankle = smooth(.13, .039, y)
            knee = smooth(.503, .389, y)
            if "gastrocnemius" in name:
                knee = smooth(.518, .43, y)
            hip = smooth(.971, .81, y)
            if "gluteus" in name:
                hip = smooth(.97, .761, y) * smooth(.02, .12, abs(x))
            if "short head" in name and "biceps femoris" in name:
                hip = 1
            elif is_thigh:
                hip = smooth(y_max - .015, y_max - .145, y)
            if "iliotibial" in name:
                hip = smooth(1.00, .82, y)
            return (("Pelvis", 1-hip), (thigh, hip*(1-knee)),
                    (shin, hip*knee*(1-ankle)), (foot, hip*knee*ankle))
        return leg_weights

    return trunk_weights


def read_glb(path):
    source = path.read_bytes()
    assert source[:4] == b"glTF"
    length = struct.unpack_from("<I", source, 12)[0]
    return json.loads(source[20:20+length]), memoryview(source)[28+length:]


class Export:
    def __init__(self):
        self.data = bytearray()
        self.views = []
        self.accessors = []

    def accessor(self, values, fmt, component, kind, **extra):
        pack = struct.Struct("<" + fmt)
        data = bytearray(len(values)*pack.size)
        for i, value in enumerate(values):
            pack.pack_into(data, i*pack.size, *value)
        self.data += bytes(-len(self.data) % 4)
        self.views.append({"buffer": 0, "byteOffset": len(self.data), "byteLength": len(data)})
        self.data += data
        self.accessors.append({"bufferView": len(self.views)-1, "componentType": component,
                               "count": len(values), "type": kind, **extra})
        return len(self.accessors)-1

    def write(self, path, doc):
        self.data += bytes(-len(self.data) % 4)
        doc.update(bufferViews=self.views, accessors=self.accessors,
                   buffers=[{"byteLength": len(self.data)}])
        header = json.dumps(doc, separators=(",", ":")).encode()
        header += b" " * (-len(header) % 4)
        path.write_bytes(struct.pack("<4sIII4s", b"glTF", 2, 28+len(header)+len(self.data),
                                     len(header), b"JSON") + header
                         + struct.pack("<I4s", len(self.data), b"BIN\x00") + self.data)


def add_skin_patch(group, faces, vertex_at, joint_ids, mirrored=False):
    vertices, normals, colors, joints, weights, indices, _ = group
    assert faces
    ids, directions = {}, {}
    for face in faces:
        for i in face:
            if i in ids:
                continue
            point, influences, gray = vertex_at(i)
            ids[i] = len(vertices)
            vertices.append(point)
            directions[i] = (0, 0, 0)
            colors.append((gray, gray, gray, 255))
            assert 1 <= len(influences) <= 4 and abs(sum(w for _, w in influences)-1) < 1e-6
            items = [(joint_ids[name], weight) for name, weight in influences]
            items += [(0, 0)] * (4-len(items))
            joints.append(tuple(j for j, _ in items))
            weights.append(tuple(w for _, w in items))
        for j in range(1, len(face)-1):
            triangle = (face[0], face[j+1], face[j]) if mirrored else (face[0], face[j], face[j+1])
            indices.extend((ids[i],) for i in triangle)
            a, b, c = (vertices[ids[i]] for i in triangle)
            normal = cross(sub(b, a), sub(c, a))
            for i in triangle:
                directions[i] = add(directions[i], normal)
    normals.extend(unit(directions[i]) if any(directions[i]) else (0, 1, 0) for i in ids)


def finger_frame(direction, inward):
    # +Y follows the phalanx and positive local X flexes it toward the palm.
    reference = rotation((0, 1, 0), direction)
    axis = unit(direction)
    front = turn(reference, (0, 0, 1))
    angle = math.atan2(dot(axis, cross(front, inward)), dot(front, inward))
    roll = (*scale(axis, math.sin(angle/2)), math.cos(angle/2))
    return multiply(roll, reference)


def finger_weights(point, chains, wrist_weight, suffix):
    candidates = []
    for digit, centers in chains.items():
        offsets = [sub(point, start) for start in centers[:-1]]
        segments = [sub(end, start) for start, end in zip(centers, centers[1:])]
        directions = list(map(unit, segments))
        distances = []
        for offset, segment in zip(offsets, segments):
            t = min(1, max(0, dot(offset, segment)/dot(segment, segment)))
            distances.append(length(sub(offset, scale(segment, t))))
        # Blend across the knuckle, then keep each phalanx rigid between knuckles.
        planes = [directions[0], unit(add(*directions[:2])), unit(add(*directions[1:]))]
        progress = [dot(offset, plane) for offset, plane in zip(offsets, planes)]
        base = smooth(-.10, .15, progress[0])
        if digit == "Thumb":
            # The thenar side of the palm follows the thumb base.
            across, _, depth = point
            base *= smooth(.18, .36, across - .35*depth)
        middle = smooth(-.08, .08, progress[1])
        tip = smooth(-.06, .06, progress[2])
        candidates.append((min(distances), digit, (base*(1-middle), base*middle*(1-tip), base*middle*tip)))

    # A shared web can follow two digits. The separated fingers follow their own chains.
    first, second = sorted(candidates)[:2]
    share = .5*smooth(.065, 0, second[0] - first[0])
    items = [(f"{digit}{level}{suffix}", amount * weight * wrist_weight)
             for (_, digit, amounts), weight in ((first, 1-share), (second, share))
             for level, amount in enumerate(amounts, 1)]
    items.extend((("Hand" + suffix, wrist_weight - sum(w for _, w in items)),
                  ("Forearm" + suffix, 1-wrist_weight)))
    items = sorted(((name, w) for name, w in items if w > 1e-6), key=lambda item: -item[1])[:4]
    total = sum(w for _, w in items)
    return [(name, w/total) for name, w in items]


def add_skin_surfaces(group, skin_path, rig, joint_ids):
    source_vertices, faces = [], {"hand": [], "foot": []}
    markers = {}
    wrist = (4.312, 2.452, 1.757)
    along = unit((.472, -1.149, 1.258))
    across_hint = (-.249, .266, .52)
    across = unit(sub(across_hint, scale(along, dot(across_hint, along))))
    out = cross(across, along)
    obj_group = ""
    for line in skin_path.read_text().splitlines():
        if line.startswith("v "):
            source_vertices.append(tuple(map(float, line.split()[1:4])))
        elif line.startswith("g "):
            obj_group = line[2:]
        elif line.startswith("f ") and (obj_group == "body" or obj_group.startswith("joint-l-finger-")):
            face = [int(item.split("/")[0])-1 for item in line.split()[1:]]
            if obj_group != "body":
                markers.setdefault(obj_group, set()).update(face)
                continue
            points = [source_vertices[i] for i in face]
            if all(p[0] > 3.7 and dot(sub(p, wrist), along) > -.28 for p in points):
                faces["hand"].append(face)
            elif all(x > 1 and y < -7.10 for x, y, _ in points):
                faces["foot"].append(face)

    destination_wrist = ATLAS_JOINTS["Hand.L"][1]
    hand_length = unit((.025, -.137, .065))
    hand_width = unit(sub((1, 0, 0), scale(hand_length, hand_length[0])))
    dorsal = cross(hand_width, hand_length)

    def hand_coordinates(point):
        offset = sub(point, wrist)
        return tuple(dot(offset, axis) for axis in (across, along, out))

    def atlas_hand(point):
        u, v, w = point
        return add(destination_wrist, add(scale(hand_length, .084*v),
                   add(scale(hand_width, .075*u), scale(dorsal, .091*w))))

    def marker(digit, level):
        ids = sorted(markers[f"joint-l-finger-{digit}-{level}"])
        assert len(ids) == 8
        return hand_coordinates(scale(tuple(map(sum, zip(*(source_vertices[i] for i in ids)))), 1/len(ids)))

    chains = {name: [marker(digit, level) for level in range(1, 5)]
              for digit, name in enumerate(DIGITS, 1)}

    def reflect(point, sign):
        return (sign*point[0], *point[1:])

    wrist_center = body_proportions(destination_wrist)[0]

    def posed_hand(point, sign):
        position = body_proportions(atlas_hand(point))[0]
        distance = dot(sub(position, wrist_center), hand_length)
        # Extend the palm near its base so the calibrated finger curl still fits the shaft.
        extension = .0065 * smooth(.006, .030, distance)
        return reflect(add(position, scale(hand_length, extension)), sign)

    for sign, suffix in ((1, ".L"), (-1, ".R")):
        for digit, points in chains.items():
            centers = [posed_hand(point, sign) for point in points]
            palm = scale(dorsal, -1)
            if digit == "Thumb":
                palm = sub(palm, scale(hand_width, .8))
            parent = "Hand" + suffix
            for level, (center, end) in enumerate(zip(centers, centers[1:]), 1):
                name = f"{digit}{level}{suffix}"
                rig[name] = (parent, center, finger_frame(sub(end, center), reflect(palm, sign)))
                joint_ids[name] = len(joint_ids)
                parent = name

    for kind, surface in faces.items():
        for sign, suffix in ((1, ".L"), (-1, ".R")):
            start = len(group[0])

            def vertex_at(index):
                x, y, z = source_vertices[index]
                if kind == "hand":
                    point = hand_coordinates((x, y, z))
                    p = atlas_hand(point)
                    weights = finger_weights(point, chains, smooth(.925, .856, p[1]), suffix)
                    return posed_hand(point, sign), weights, 229
                foot = turn(around_y(.40), (.09*(x-2.196), 0, .108*z))
                p = add((.073, .001+.10*(y+8.168), -.005), foot)
                weight = smooth(.119, .083, p[1])
                weights = (("Shin" + suffix, 1-weight), ("Foot" + suffix, weight))
                return body_proportions(reflect(p, sign))[0], weights, 229
            add_skin_patch(group, surface, vertex_at, joint_ids, mirrored=sign == -1)
            surface_vertices = group[0][start:]
            if kind == "hand":
                digits = {joint_ids[f"{digit}{level}{suffix}"]
                          for digit in DIGITS for level in range(1, 4)}
                bind_wrist = reflect(wrist_center, sign)
                longest = max(length(sub(v, bind_wrist)) for v, joints, weights in
                              zip(surface_vertices, group[3][start:], group[4][start:])
                              if any(j in digits and w > .5 for j, w in zip(joints, weights)))
                assert .183 < longest < .193, longest
            else:
                forward = (sign * math.sin(.40), 0, math.cos(.40))
                offsets = [dot(v, forward) for v in surface_vertices]
                assert .255 < max(offsets) - min(offsets) < .270
        group[-1].append(f"MakeHuman {kind} surface")


def add_face(group, face_path, joint_ids):
    source_vertices, faces = [], []
    eye_vertices = set()
    material = ""
    for line in face_path.read_text().splitlines():
        if line.startswith("v "):
            source_vertices.append(tuple(map(float, line.split()[1:4])))
        elif line.startswith("usemtl "):
            material = line.split()[1]
        elif line.startswith("f ") and (material in ("M_Face", "M_BackHead") or material.startswith("M_Sclera")):
            face = tuple(int(item.split("/")[0])-1 for item in line.split()[1:])
            if material.startswith("M_Sclera"):
                eye_vertices.update(face)
            faces.append(face)
    assert eye_vertices

    def vertex_at(index):
        x, y, z = source_vertices[index]
        # Leave a surface over the throat where the paired neck muscles part.
        tuck = smooth(-4.5, -11.5, y)*smooth(9, 4, z)
        throat = smooth(2.7, .65, abs(x))*smooth(-.5, 3.5, z)
        depth = 1 - tuck*(.63-.52*throat)
        position = (.0096*x*(1-.48*tuck), 1.562+.00985*y, -.018 + (.0097*z+.021)*depth)
        weight = head_weight(position[1], position[2])
        gray = round(235-(34-16*throat)*tuck)
        if index in eye_vertices:
            radius = math.hypot(abs(x)-3.19, y-3.61)
            gray = round(116 + 49*smooth(.26, .36, radius) + 51*smooth(.57, .68, radius))
        return position, (("Chest", 1-weight), ("Head", weight)), gray

    add_skin_patch(group, faces, vertex_at, joint_ids)
    group[-1].append("ICT Face Model neutral head")


def build(source_path, skin_path, face_path, output):
    source, binary = read_glb(source_path)
    rig = {name: (parent, center, IDENTITY) for name, (parent, center) in JOINTS.items()}
    joint_ids = {name: index for index, name in enumerate(rig)}

    def attribute(index, fmt):
        accessor = source["accessors"][index]
        view = source["bufferViews"][accessor["bufferView"]]
        offset = view["byteOffset"]
        return struct.iter_unpack("<" + fmt, binary[offset:offset+view["byteLength"]])

    groups = {name: ([], [], [], [], [], [], []) for name in (*MUSCLE_GROUPS, "Other anatomy", "Skeleton")}
    for node in source["nodes"]:
        if "mesh" not in node:
            continue
        obj = node["extras"]
        name = obj["name"].lower()
        bone = obj["layer"] == "skeleton"
        group = "Skeleton" if bone else muscle_group(name)
        vertices, normals, colors, joints, weights, indices, names = groups[group]
        primitive = source["meshes"][node["mesh"]]["primitives"][0]
        attrs = primitive["attributes"]
        position = source["accessors"][attrs["POSITION"]]
        bounds = [scale(position[edge], .0001) for edge in ("min", "max")]
        if bounds[0][1] > 1.47 and bounds[1][1] > 1.535 and name != "atlas":
            continue
        weight_at = influences(obj, bounds)
        index_type = "H" if source["accessors"][primitive["indices"]]["componentType"] == 5123 else "I"
        points = list(attribute(attrs["POSITION"], "hhh2x"))
        source_indices = attribute(primitive["indices"], index_type)
        offset = len(vertices)
        for triangle in zip(source_indices, source_indices, source_indices, strict=True):
            corners = [points[i] for (i,) in triangle]
            if all(y < 570 for _, y, _ in corners):
                continue
            if all(abs(x) > 1840 and 6900 < y < 8630 for x, y, _ in corners):
                continue
            indices.extend((i + offset,) for (i,) in triangle)
        names.append(obj["name"])
        for point, normal in zip(points, attribute(attrs["NORMAL"], "bbb1x"), strict=True):
            vertex = scale(point, .0001)
            (x, y, z), (sx, sy, sz) = body_proportions(vertex)
            if "linea alba" in name:
                # Keep the fascia beneath the moving edges of the rectus and obliques.
                z -= .009 * smooth(.97, 1.10, y)
            if y > 1.495 and abs(x) < .09:
                # Bury the upper muscle attachments inside the cranium.
                blend = smooth(1.495, 1.552, y)*smooth(.09, .065, abs(x))
                width, depth = 1-.29*blend, 1-.27*blend
                x, z = x*width, -.01+(z+.01)*depth
                sx, sz = sx*width, sz*depth
            vertices.append((x, y, z))
            normals.append(unit(tuple(value / factor for value, factor in zip(normal, (sx, sy, sz))))
                           if any(normal) else (0, 1, 0))
            items = [(joint_ids[j], w) for j, w in weight_at(*vertex) if w > 1e-6]
            assert 1 <= len(items) <= 4 and abs(sum(w for _, w in items)-1) < 1e-5
            items += [(0, 0)] * (4-len(items))
            joints.append(tuple(j for j, _ in items))
            weights.append(tuple(w for _, w in items))
        for red, _, _, _ in attribute(attrs["COLOR_0"], "BBBB"):
            ao = min(1, red / (155 if bone else 84))
            value = round((.57 + .43*ao) * 255)
            colors.append((value, value, value, 255))
    add_skin_surfaces(groups["Other anatomy"], skin_path, rig, joint_ids)
    add_face(groups["Other anatomy"], face_path, joint_ids)
    shoulder_x = [v[0] for v in groups["Shoulders"][0]]
    assert .49 < max(shoulder_x) - min(shoulder_x) < .52

    glb = Export()
    nodes = [{"name": name} for name in rig]
    nodes[0]["extras"] = {
        "license": "https://creativecommons.org/licenses/by-sa/4.0/",
        "attribution": "Écorché by Charleeh, from BodyParts3D © DBCLS and Z-Anatomy by Gauthier Kervyn. "
                       "Hands and feet from MakeHuman (CC0). "
                       "Generic neutral head from ICT-FaceKit (MIT).",
        "source": "https://github.com/Charleeh/ecorche",
        "faceSource": "https://github.com/ICT-VGL/ICT-FaceKit/tree/da5f95a607f5e6b37755b38d3385d7f2853732e5",
        "faceLicense": Path(__file__).with_name("ICT-FaceKit-LICENSE.txt").read_text(),
    }
    bind_matrices = []
    for name, (parent, center, attitude) in rig.items():
        index = joint_ids[name]
        nodes[index]["translation"] = center
        if parent:
            _, origin, orientation = rig[parent]
            nodes[index]["translation"] = turn(inverse(orientation), sub(center, origin))
            if attitude != IDENTITY:
                nodes[index]["rotation"] = multiply(inverse(orientation), attitude)
            nodes[joint_ids[parent]].setdefault("children", []).append(index)
        unrotate = inverse(attitude)
        columns = [(*turn(unrotate, axis), 0) for axis in ((1, 0, 0), (0, 1, 0), (0, 0, 1))]
        bind_matrices.append((*columns[0], *columns[1], *columns[2], *turn(unrotate, scale(center, -1)), 1))
    materials, meshes = [], []
    for name, (vertices, normals, colors, joints, weights, indices, names) in groups.items():
        assert vertices and len(vertices) == len(normals) == len(colors) == len(joints) == len(weights)
        index = len(materials)
        gray = .31 if name == "Skeleton" else .43
        materials.append({"name": name, "pbrMetallicRoughness": {
            "baseColorFactor": [gray, gray, gray, 1], "metallicFactor": 0, "roughnessFactor": .67,
        }})
        mesh_node = {"name": name + " mesh", "mesh": index, "skin": 0,
                     "extras": {"muscleGroup": name, "structures": names}}
        nodes.append(mesh_node)
        axes = list(zip(*vertices))
        meshes.append({"name": name, "primitives": [{
            "attributes": {
                "POSITION": glb.accessor(vertices, "3f", 5126, "VEC3",
                                         min=list(map(min, axes)), max=list(map(max, axes))),
                "NORMAL": glb.accessor(normals, "3f", 5126, "VEC3"),
                "COLOR_0": glb.accessor(colors, "4B", 5121, "VEC4", normalized=True),
                "JOINTS_0": glb.accessor(joints, "4B", 5121, "VEC4"),
                "WEIGHTS_0": glb.accessor(weights, "4f", 5126, "VEC4"),
            },
            "indices": glb.accessor(indices, "I", 5125, "SCALAR"), "material": index,
        }]})
    frames = DURATION * 30
    poses = [squat(frame/frames) for frame in range(frames+1)]
    check_poses(poses)
    keys = glb.accessor([(frame/30,) for frame in range(frames+1)], "f", 5126,
                        "SCALAR", min=[0], max=[DURATION])
    channels, samplers = [], []
    tracks = [(0, "translation", [p for p, _ in poses], "3f", "VEC3")]
    tracks += [(joint_ids[name], "rotation", [q[name] for _, q in poses], "4f", "VEC4")
               for name in JOINTS]
    for node, path, values, fmt, kind in tracks:
        channels.append({"sampler": len(samplers), "target": {"node": node, "path": path}})
        samplers.append({"input": keys, "output": glb.accessor(values, fmt, 5126, kind)})
    glb.write(output, {
        "asset": {"version": "2.0", "generator": "Active exercise model",
                  "copyright": "Écorché by Charleeh, from BodyParts3D © DBCLS and Z-Anatomy by Gauthier Kervyn. CC BY-SA 4.0."},
        "scene": 0, "scenes": [{"nodes": [0, *range(len(rig), len(nodes))]}],
        "nodes": nodes, "meshes": meshes, "materials": materials,
        "skins": [{"name": "Exercise rig", "skeleton": 0, "joints": list(joint_ids.values()),
                   "inverseBindMatrices": glb.accessor(bind_matrices, "16f", 5126, "MAT4")}],
        "animations": [{"name": "Bodyweight Squat", "channels": channels, "samplers": samplers}],
    })


if __name__ == "__main__":
    build(*(Path(arg) for arg in sys.argv[1:]))
