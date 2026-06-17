#!/usr/bin/env python3
"""
Blender to GLB Converter
Converts .blend files to .glb format using Blender's Python API.

Usage:
    python3 blender-convert.py input.blend output.glb
"""

import sys
import os
import bpy
import traceback

def convert_blend_to_glb(blend_path, glb_path):
    """Convert a .blend file to .glb format."""
    
    # Clear existing scene
    bpy.ops.wm.read_factory_settings(use_empty=True)
    
    # Load the .blend file
    try:
        bpy.ops.wm.open_mainfile(filepath=blend_path)
    except Exception as e:
        print(f"ERROR: Failed to load {blend_path}: {e}", file=sys.stderr)
        return False
    
    # Ensure we're in object mode
    if bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    
    # Select all objects for export
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        obj.select_set(True)
    
    # Set active object (required for export)
    if bpy.context.selected_objects:
        bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
    
    # Export to GLB
    try:
        bpy.ops.export_scene.gltf(
            filepath=glb_path,
            export_format='GLB',
            use_selection=True,
            export_apply=True,
            export_yup=True,
            export_keep_originals=False,
            export_animations=True,
            export_materials='EXPORT',
            export_colors=True,
            export_tangents=True,
            export_skins=True,
            export_morph=False,
        )
        print(f"SUCCESS: Converted {blend_path} -> {glb_path}")
        return True
    except Exception as e:
        print(f"ERROR: Failed to export {glb_path}: {e}", file=sys.stderr)
        traceback.print_exc()
        return False

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python3 blender-convert.py <input.blend> <output.glb>", file=sys.stderr)
        sys.exit(1)
    
    blend_path = sys.argv[1]
    glb_path = sys.argv[2]
    
    if not os.path.exists(blend_path):
        print(f"ERROR: Input file not found: {blend_path}", file=sys.stderr)
        sys.exit(1)
    
    success = convert_blend_to_glb(blend_path, glb_path)
    sys.exit(0 if success else 1)