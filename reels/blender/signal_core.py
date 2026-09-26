"""
signal_core — the first 3D plate template for the hybrid reel pipeline (reels/README.md).

Builds the whole scene in code, then renders a PNG sequence. Run headless:

    blender -b --factory-startup -P reels/blender/signal_core.py -- \
        --out reels/.cache/run/plate --frames 450 --fps 30 --scale 100 --seed 7

Why procedural and not a .blend file: a .blend is an opaque binary in git, and every template
tweak would be an unreviewable blob. Here the scene IS the diff.

Design (DESIGN.md, "The Annotated Workbench"): dark slate world, ONE green signal (the core),
cyan only as a secondary accent, real "tools on the bench" (translucent task panels orbiting
the core). The core sits in the upper half of the 9:16 frame on purpose: the lower third is
reserved for the Hebrew captions the HyperFrames layer paints over this plate.

NO TEXT IN BLENDER. Blender's text objects cannot shape or order Hebrew (its HarfBuzz/FriBiDi
work covers the UI only), so every letter is drawn by the browser layer on top of this plate.

Glow is NOT done here either: Blender 5.x moved the compositor to node groups
(`scene.compositing_node_group`) and dropped Eevee's bloom toggle, so a compositor setup would
break on the next API shift. The bloom pass runs in FFmpeg (reels/lib/plate.ts) and is identical
on every Blender version.
"""

import argparse
import math
import random
import sys

import bpy
from mathutils import Vector

# ─── args ────────────────────────────────────────────────────────────────────────────────────

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True, help="output directory for frame_####.png")
ap.add_argument("--frames", type=int, default=450)
ap.add_argument("--fps", type=int, default=30)
ap.add_argument("--scale", type=int, default=100, help="resolution percentage (25 for a draft)")
ap.add_argument("--samples", type=int, default=24)
ap.add_argument("--seed", type=int, default=7)
ap.add_argument("--accent", default="#76B900")
ap.add_argument("--secondary", default="#22D3EE")
args = ap.parse_args(argv)

rnd = random.Random(args.seed)


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h: str, a: float = 1.0):
    h = h.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), a)


ACCENT = hex_rgba(args.accent)
SECONDARY = hex_rgba(args.secondary)
SLATE = hex_rgba("#08090E")
PANEL = hex_rgba("#121620")

# ─── scene reset ─────────────────────────────────────────────────────────────────────────────

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = args.frames
scene.render.fps = args.fps
scene.render.resolution_x = 1080
scene.render.resolution_y = 1920
scene.render.resolution_percentage = args.scale
scene.render.engine = "BLENDER_EEVEE"
scene.eevee.taa_render_samples = args.samples
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.render.filepath = f"{args.out.rstrip('/')}/frame_"
# "Standard", not AgX: the brand green has to come out as the brand green, and AgX's filmic
# desaturation turns #76B900 olive at the emission strengths used here.
scene.view_settings.view_transform = "Standard"

# Every keyframe below is linear: a 15-second loop of slow drift reads as "alive"; Bezier easing
# would make every object visibly accelerate and stop at the ends of the clip.
bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"

world = bpy.data.worlds.new("slate")
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = SLATE
bg.inputs["Strength"].default_value = 1.0
scene.world = world

# ─── materials ───────────────────────────────────────────────────────────────────────────────


def mat_emission(name: str, color, strength: float):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (0, 0, 0, 1)
    p.inputs["Emission Color"].default_value = color
    p.inputs["Emission Strength"].default_value = strength
    return m


def mat_surface(name: str, color, metallic=0.0, roughness=0.5, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = color
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = roughness
    p.inputs["Alpha"].default_value = alpha
    if alpha < 1.0:
        m.surface_render_method = "BLENDED"
    return m


M_ACCENT = mat_emission("accent", ACCENT, 1.6)
M_ACCENT_HOT = mat_emission("accent_hot", ACCENT, 3.0)
M_ACCENT_DIM = mat_emission("accent_dim", ACCENT, 0.55)
M_SECONDARY = mat_emission("secondary", SECONDARY, 1.4)
M_WHITE_DIM = mat_emission("white_dim", (1, 1, 1, 1), 0.75)
M_GRID = mat_emission("grid", ACCENT, 0.16)
M_CHROME = mat_surface("chrome", hex_rgba("#0A0C13"), metallic=1.0, roughness=0.22)
M_PANEL = mat_surface("panel", PANEL, roughness=0.35, alpha=0.55)


def link(obj):
    bpy.context.collection.objects.link(obj)
    return obj


def key_rotation(obj, start, end):
    obj.rotation_euler = start
    obj.keyframe_insert("rotation_euler", frame=scene.frame_start)
    obj.rotation_euler = end
    obj.keyframe_insert("rotation_euler", frame=scene.frame_end)


def key_location(obj, start, end):
    obj.location = start
    obj.keyframe_insert("location", frame=scene.frame_start)
    obj.location = end
    obj.keyframe_insert("location", frame=scene.frame_end)


# ─── the core: the one green signal ─────────────────────────────────────────────────────────

CORE = Vector((0.0, 0.0, 2.3))

bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.3, location=CORE)
shell = bpy.context.active_object
shell.name = "core_shell"
wire = shell.modifiers.new("wire", "WIREFRAME")
wire.thickness = 0.022
shell.data.materials.append(M_ACCENT)
key_rotation(shell, (0.2, 0.0, 0.0), (0.2 + math.radians(40), 0.0, math.radians(120)))

bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=0.9, location=CORE)
inner = bpy.context.active_object
inner.name = "core_inner"
bpy.ops.object.shade_smooth()
inner.data.materials.append(M_CHROME)

bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.36, location=CORE)
heart = bpy.context.active_object
heart.name = "core_heart"
heart.data.materials.append(M_ACCENT_HOT)
# The heart sits inside the chrome sphere and shows through a narrow slot cut by scaling the
# chrome sphere's Y — a lit seam rather than a glowing ball, which reads as "machine", not "sun".
inner.scale = (1.0, 0.93, 1.0)

# Orbit rings — green, cyan, dim green — each on its own tilt, each turning at its own rate.
for i, (radius, minor, mat, tilt, turns) in enumerate(
    [
        (2.35, 0.014, M_ACCENT, (math.radians(72), 0, math.radians(12)), 0.35),
        (2.85, 0.010, M_SECONDARY, (math.radians(38), math.radians(-24), math.radians(30)), -0.25),
        (3.40, 0.008, M_ACCENT_DIM, (math.radians(80), math.radians(-10), 0), 0.18),
    ]
):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=radius, minor_radius=minor, major_segments=160, minor_segments=8, location=CORE
    )
    ring = bpy.context.active_object
    ring.name = f"ring_{i}"
    ring.data.materials.append(mat)
    start = tilt
    end = (tilt[0], tilt[1], tilt[2] + turns * 2 * math.pi)
    key_rotation(ring, start, end)

# Orbiting "nodes" on the first ring — the tools the agent reaches for.
for i in range(5):
    a = i / 5 * 2 * math.pi
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.075, location=CORE)
    node = bpy.context.active_object
    node.name = f"node_{i}"
    node.data.materials.append(M_SECONDARY if i % 2 else M_ACCENT)
    pivot = bpy.data.objects.new(f"node_pivot_{i}", None)
    link(pivot)
    pivot.location = CORE
    node.parent = pivot
    node.location = (2.35 * math.cos(a), 2.35 * math.sin(a), 0)
    key_rotation(pivot, (math.radians(72), 0, math.radians(12)), (math.radians(72), 0, math.radians(12) + 0.35 * 2 * math.pi))

# ─── task panels: translucent cards drifting around the core ────────────────────────────────


def make_panel(idx: int, loc, rot, w=1.7, h=1.05):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    card = bpy.context.active_object
    card.name = f"panel_{idx}"
    card.scale = (w, h, 1)
    card.data.materials.append(M_PANEL)

    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    frame = bpy.context.active_object
    frame.name = f"panel_frame_{idx}"
    frame.scale = (w, h, 1)
    fw = frame.modifiers.new("wire", "WIREFRAME")
    fw.thickness = 0.012
    frame.data.materials.append(M_SECONDARY if idx % 3 == 0 else M_ACCENT_DIM)
    frame.parent = card
    frame.matrix_parent_inverse = card.matrix_world.inverted()

    # Three "lines of copy" on the card — deliberately abstract bars, never glyphs.
    for j, lw in enumerate((0.7, 0.55, 0.38)):
        bpy.ops.mesh.primitive_plane_add(size=1)
        bar = bpy.context.active_object
        bar.name = f"panel_{idx}_bar_{j}"
        bar.data.materials.append(M_ACCENT if j == 0 else M_WHITE_DIM)
        bar.parent = card
        bar.location = ((0.5 - lw / 2) - 0.08, 0.28 - j * 0.2, 0.01)
        bar.scale = (lw, 0.045 if j == 0 else 0.03, 1)
    return card


panel_specs = [
    ((-3.1, 1.2, 4.3), (math.radians(78), 0, math.radians(24))),
    ((3.0, 0.6, 3.6), (math.radians(80), 0, math.radians(-28))),
    ((-2.6, -1.8, 0.7), (math.radians(70), 0, math.radians(18))),
    ((2.8, -1.2, 0.2), (math.radians(74), 0, math.radians(-20))),
    ((-0.9, 3.5, 5.6), (math.radians(84), 0, math.radians(6))),
    ((1.2, 4.2, -0.4), (math.radians(82), 0, math.radians(-8))),
]
for idx, (loc, rot) in enumerate(panel_specs):
    card = make_panel(idx, loc, rot)
    drift = Vector((rnd.uniform(-0.25, 0.25), rnd.uniform(-0.2, 0.2), rnd.uniform(0.35, 0.8)))
    key_location(card, Vector(loc), Vector(loc) + drift)
    key_rotation(card, rot, (rot[0], rot[1] + rnd.uniform(-0.08, 0.08), rot[2] + rnd.uniform(-0.18, 0.18)))

# ─── floor grid: depth cue under everything ─────────────────────────────────────────────────

bpy.ops.mesh.primitive_grid_add(x_subdivisions=48, y_subdivisions=48, size=40, location=(0, 6, -3.6))
grid = bpy.context.active_object
grid.name = "floor_grid"
gw = grid.modifiers.new("wire", "WIREFRAME")
gw.thickness = 0.008
grid.data.materials.append(M_GRID)

# ─── dust: small emissive motes rising slowly ───────────────────────────────────────────────

# Three shared meshes (one per colour) and 220 objects linking them: 220 separate meshes would
# triple the scene-build time for no visual difference.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1)
src = bpy.context.active_object
mote_meshes = []
for i, m in enumerate((M_ACCENT, M_WHITE_DIM, M_SECONDARY)):
    me = src.data.copy()
    me.name = f"mote_mesh_{i}"
    me.materials.append(m)
    mote_meshes.append(me)
bpy.data.objects.remove(src)
for i in range(220):
    # Mostly white-dim dust, a little green, a little cyan — the One Signal Rule holds in 3D too.
    ob = bpy.data.objects.new(f"mote_{i}", mote_meshes[1 if i % 5 else (0 if i % 2 else 2)])
    link(ob)
    s = rnd.uniform(0.006, 0.022)
    ob.scale = (s, s, s)
    start = Vector((rnd.uniform(-6, 6), rnd.uniform(-5, 10), rnd.uniform(-3.4, 8.5)))
    key_location(ob, start, start + Vector((0, 0, rnd.uniform(0.6, 1.8))))

# ─── light + camera ─────────────────────────────────────────────────────────────────────────

key = bpy.data.lights.new("key", "AREA")
key.energy = 900
key.size = 6
key.color = (0.85, 0.95, 1.0)
key_ob = bpy.data.objects.new("key", key)
link(key_ob)
key_ob.location = (2.5, -5.5, 8.5)
key_ob.rotation_euler = (math.radians(35), 0, math.radians(18))

target = bpy.data.objects.new("cam_target", None)
link(target)
target.location = (0, 0, 0.9)

cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 30
cam_data.sensor_fit = "VERTICAL"
cam_data.dof.use_dof = True
cam_data.dof.focus_object = inner
cam_data.dof.aperture_fstop = 3.2
cam = bpy.data.objects.new("cam", cam_data)
link(cam)
track = cam.constraints.new("TRACK_TO")
track.target = target
track.track_axis = "TRACK_NEGATIVE_Z"
track.up_axis = "UP_Y"
# A slow push-in with a slight arc: the one camera move of the piece.
key_location(cam, Vector((-0.8, -15.5, 0.4)), Vector((1.1, -11.2, 1.3)))
scene.camera = cam

print(f"[signal_core] rendering {args.frames} frames @ {args.fps}fps, {args.scale}% → {args.out}")
bpy.ops.render.render(animation=True)
print("[signal_core] done")
