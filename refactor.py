import sys

def main():
    file_path = 'public/engines/unified-3d/editor/Editor3DCore.js'
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    start_idx = -1
    end_idx = -1

    for i, line in enumerate(lines):
        if '    _updatePropertiesPanel() {' in line and start_idx == -1:
            start_idx = i
        if '    _applyEnvironmentChanges(changes) {' in line and end_idx == -1:
            end_idx = i - 1
            break

    if start_idx == -1 or end_idx == -1:
        print("Could not find start or end index.")
        sys.exit(1)

    extracted_lines = lines[start_idx:end_idx]
    
    # Write PropertiesPanel.js
    panel_code = """import * as THREE from '/lib/three/three.module.js';

export default class PropertiesPanel {
    constructor(editor) {
        this.editor = editor;
    }

"""
    # Replace `this.` with `this.editor.` inside the methods, except for method declarations
    # Wait, some methods like `this._renderPostProcessingStack()` need to stay as `this.` if they are moved into the same class.
    # It's better to NOT replace `this.` blindly, but instead alias `this.editor`.
    
    for line in extracted_lines:
        # If it's a method declaration, keep it. But we need to replace `this._levelData` with `this.editor._levelData`.
        # To be safe, we'll manually replace known editor properties.
        line = line.replace('this._selected', 'this.editor._selected')
        line = line.replace('this._levelData', 'this.editor._levelData')
        line = line.replace('this._mode', 'this.editor._mode')
        line = line.replace('this._applyEnvironmentChange(', 'this.editor._applyEnvironmentChange(')
        line = line.replace('this._applyMaterialChange(', 'this.editor._applyMaterialChange(')
        line = line.replace('this._pushUndo(', 'this.editor._pushUndo(')
        line = line.replace('this._markDirty(', 'this.editor._markDirty(')
        line = line.replace('this._rebuildScene(', 'this.editor._rebuildScene(')
        line = line.replace('this._commitTransformToLevelData(', 'this.editor._commitTransformToLevelData(')
        line = line.replace('this.deleteSelected(', 'this.editor._deleteSelected(')
        line = line.replace('this._deleteSelected(', 'this.editor._deleteSelected(')
        line = line.replace('this._applySubMeshMaterialChange(', 'this.editor._applySubMeshMaterialChange(')
        line = line.replace('this._applyInstanceOverride(', 'this.editor._applyInstanceOverride(')
        line = line.replace('this._applyPropertyChange(', 'this.editor._applyPropertyChange(')
        line = line.replace('this._clearInstanceOverrides(', 'this.editor._clearInstanceOverrides(')
        line = line.replace('this.scene', 'this.editor.scene')
        line = line.replace('this.shaderEditorUI', 'this.editor.shaderEditorUI')
        line = line.replace('this.renderer3d', 'this.editor.renderer3d')
        line = line.replace('this._getDefaultSkybox(', 'this.editor._getDefaultSkybox(')
        line = line.replace('this._updateMaterialPropertyKey(', 'this.editor._updateMaterialPropertyKey(')
        line = line.replace('this._updateMaterialPropertyValue(', 'this.editor._updateMaterialPropertyValue(')
        line = line.replace('this._addMaterialProperty(', 'this.editor._addMaterialProperty(')
        line = line.replace('this._removeMaterialProperty(', 'this.editor._removeMaterialProperty(')
        line = line.replace('this._deleteMaterial(', 'this.editor._deleteMaterial(')
        line = line.replace('this._addMaterialLayer(', 'this.editor._addMaterialLayer(')
        line = line.replace('this._removeMaterialLayer(', 'this.editor._removeMaterialLayer(')

        # Fix recursive calls
        # `this._updatePropertiesPanel()` -> `this._updatePropertiesPanel()` (it's in the same class now)
        # `this._render...` -> `this._render...`
        
        panel_code += line

    panel_code += "}\n"

    with open('public/engines/unified-3d/editor/panels/PropertiesPanel.js', 'w', encoding='utf-8') as f:
        f.write(panel_code)

    # Remove from Editor3DCore.js
    new_editor_lines = lines[:start_idx] + ["    // UI Rendering methods moved to PropertiesPanel.js\n"] + lines[end_idx:]
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_editor_lines)

    print(f"Extracted {len(extracted_lines)} lines to PropertiesPanel.js")

if __name__ == '__main__':
    main()
