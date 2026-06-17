import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useStudio } from '../hooks/useStudio';
import {
    Play, Save, Plus, Box, Eye, EyeOff,
    Sliders, RefreshCw, AlertCircle, CheckCircle2,
    LayoutGrid, List, Trash2, ChevronUp, ChevronDown, Copy, Search
} from 'lucide-react';
import Sidebar from './shared/Sidebar';

interface Shader {
    id: string;
    name: string;
    code: string;
    uniforms: any;
    layers?: ShaderLayer[];
}

interface ShaderTemplate {
    id: string;
    name: string;
    category: string;
    desc: string;
    code: string;
}

type MeshType = 'sphere' | 'cube' | 'torus';

const TEMPLATES: ShaderTemplate[] = [
    // ── Basic ──
    { id: 'basic', name: 'Basic Lit', category: 'Basic', desc: 'Diffuse lighting with texture', code: `precision highp float;
varying vec2 vTexCoord;
varying vec3 vNormal;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec2 uv = vTexCoord;
    vec4 tex = texture2D(uTexture, uv);
    vec3 light = normalize(vec3(1.0, 1.0, 0.5));
    float diff = max(dot(vNormal, light), 0.0);
    gl_FragColor = vec4(tex.rgb * (0.3 + 0.7 * diff), 1.0);
}` },
    { id: 'flat', name: 'Flat Texture', category: 'Basic', desc: 'Unlit texture passthrough', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
void main() {
    gl_FragColor = texture2D(uTexture, vTexCoord);
}` },

    // ── 2D Effects ──
    { id: 'crt', name: 'CRT Monitor', category: '2D Effects', desc: 'Scanline + vignette CRT effect', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uResolution;
void main() {
    vec2 uv = vTexCoord;
    vec4 col = texture2D(uTexture, uv);
    float scanline = sin(uv.y * uResolution.y * 0.5) * 0.08;
    float vig = 1.0 - length(uv - 0.5) * 0.6;
    gl_FragColor = vec4((col.rgb - scanline) * vig, 1.0);
}` },
    { id: 'wave', name: 'Wave Distort', category: '2D Effects', desc: 'Sinusoidal UV distortion', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec2 uv = vTexCoord;
    uv.x += sin(uv.y * 20.0 + uTime * 2.0) * 0.03;
    uv.y += cos(uv.x * 15.0 + uTime * 1.7) * 0.02;
    gl_FragColor = texture2D(uTexture, uv);
}` },
    { id: 'chromatic', name: 'Chromatic Aberration', category: '2D Effects', desc: 'RGB channel offset', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec2 uv = vTexCoord;
    float offset = 0.015 + sin(uTime * 0.5) * 0.005;
    float r = texture2D(uTexture, uv + vec2(offset, 0.0)).r;
    float g = texture2D(uTexture, uv).g;
    float b = texture2D(uTexture, uv - vec2(offset, 0.0)).b;
    gl_FragColor = vec4(r, g, b, 1.0);
}` },
    { id: 'glitch', name: 'Digital Glitch', category: '2D Effects', desc: 'Random glitch bars with color shift', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec2 uv = vTexCoord;
    float g = sin(uv.y * 200.0 + uTime * 15.0);
    if (g > 0.7) uv.x += 0.08 * sin(uTime * 10.0);
    vec4 t = texture2D(uTexture, uv);
    if (g > 0.88) t.rgb = vec3(sin(uTime), cos(uTime * 1.3), sin(uTime * 0.7));
    gl_FragColor = t;
}` },
    { id: 'pixelate', name: 'Pixelate', category: '2D Effects', desc: 'Blocky pixelation effect', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uTime;
void main() {
    float size = 16.0 + sin(uTime) * 8.0;
    vec2 uv = floor(vTexCoord * uResolution / size) * size / uResolution;
    gl_FragColor = texture2D(uTexture, uv);
}` },
    { id: 'kaleidoscope', name: 'Kaleidoscope', category: '2D Effects', desc: 'Mirrored segment kaleidoscope', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec2 uv = vTexCoord - 0.5;
    float a = atan(uv.y, uv.x);
    float r = length(uv);
    float seg = 6.2832 / (6.0 + sin(uTime * 0.3) * 2.0);
    a = mod(a, seg);
    a = abs(a - seg * 0.5);
    uv = vec2(cos(a), sin(a)) * r + 0.5;
    gl_FragColor = texture2D(uTexture, uv);
}` },
    { id: 'bloom', name: 'Bloom', category: '2D Effects', desc: 'Simple glow/bloom effect', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uTime;
void main() {
    vec4 c = texture2D(uTexture, vTexCoord);
    vec2 px = 1.0 / uResolution;
    vec4 b = vec4(0.0);
    for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
            vec2 off = vec2(float(x), float(y)) * px * 2.0;
            float w = 1.0 - length(vec2(float(x), float(y))) / 2.0;
            b += texture2D(uTexture, vTexCoord + off) * w;
        }
    }
    b /= 9.0;
    float intensity = 1.0 + sin(uTime * 0.5) * 0.5;
    gl_FragColor = vec4(mix(c.rgb, b.rgb * intensity, 0.4), 1.0);
}` },
    { id: 'edge-detect', name: 'Edge Detection', category: '2D Effects', desc: 'Sobel-like edge detection', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform vec2 uResolution;
void main() {
    vec2 px = 1.0 / uResolution;
    float c = texture2D(uTexture, vTexCoord).r;
    float l = texture2D(uTexture, vTexCoord + vec2(-px.x, 0.0)).r;
    float r = texture2D(uTexture, vTexCoord + vec2(px.x, 0.0)).r;
    float u = texture2D(uTexture, vTexCoord + vec2(0.0, px.y)).r;
    float d = texture2D(uTexture, vTexCoord + vec2(0.0, -px.y)).r;
    float e = length(vec2(l - r, u - d));
    e = smoothstep(0.1, 0.6, e);
    vec4 col = texture2D(uTexture, vTexCoord);
    gl_FragColor = vec4(mix(col.rgb, vec3(1.0), e * 0.7), 1.0);
}` },
    { id: 'blur', name: 'Box Blur', category: '2D Effects', desc: 'Simple averaging blur', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform vec2 uResolution;
void main() {
    vec2 px = 1.0 / uResolution;
    vec4 col = vec4(0.0);
    for (int x = -3; x <= 3; x++) {
        for (int y = -3; y <= 3; y++) {
            col += texture2D(uTexture, vTexCoord + vec2(float(x), float(y)) * px * 1.5);
        }
    }
    gl_FragColor = col / 49.0;
}` },
    { id: 'sharpen', name: 'Sharpen', category: '2D Effects', desc: 'Sharpening kernel filter', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform vec2 uResolution;
void main() {
    vec2 px = 1.0 / uResolution;
    vec4 c = texture2D(uTexture, vTexCoord);
    vec4 l = texture2D(uTexture, vTexCoord + vec2(-px.x, 0.0));
    vec4 r = texture2D(uTexture, vTexCoord + vec2(px.x, 0.0));
    vec4 u = texture2D(uTexture, vTexCoord + vec2(0.0, -px.y));
    vec4 d = texture2D(uTexture, vTexCoord + vec2(0.0, px.y));
    gl_FragColor = c * 2.0 - (l + r + u + d) * 0.5;
}` },
    { id: 'emboss', name: 'Emboss', category: '2D Effects', desc: '3D emboss relief effect', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform vec2 uResolution;
void main() {
    vec2 px = 1.0 / uResolution;
    float c = texture2D(uTexture, vTexCoord).r;
    float tr = texture2D(uTexture, vTexCoord + px).r;
    float bl = texture2D(uTexture, vTexCoord - px).r;
    float d = (c - tr) + (c - bl) + 0.5;
    gl_FragColor = vec4(vec3(d), 1.0);
}` },
    { id: 'vignette', name: 'Vignette', category: '2D Effects', desc: 'Darkened corners', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec4 col = texture2D(uTexture, vTexCoord);
    vec2 center = vTexCoord - 0.5;
    float dist = length(center);
    float vig = 1.0 - dist * dist * 1.4;
    vig = mix(vig, vig * (1.0 + sin(uTime) * 0.1), 0.3);
    float pulse = 1.0 + sin(uTime * 0.5) * 0.05;
    gl_FragColor = vec4(col.rgb * vig * pulse, 1.0);
}` },
    { id: 'scanlines', name: 'Scanlines', category: '2D Effects', desc: 'Horizontal CRT scanline overlay', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uTime;
void main() {
    vec4 col = texture2D(uTexture, vTexCoord);
    float scan = abs(sin(vTexCoord.y * uResolution.y * 0.5 + uTime * 5.0)) * 0.15;
    gl_FragColor = vec4(col.rgb * (1.0 - scan), 1.0);
}` },
    { id: 'rgb-split', name: 'RGB Split Glitch', category: '2D Effects', desc: 'RGB channel separation glitch', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec2 uv = vTexCoord;
    float gl = sin(uv.y * 50.0 + uTime * 3.0) * 0.5 + 0.5;
    float r = texture2D(uTexture, uv + vec2(gl * 0.04, 0.0)).r;
    float g = texture2D(uTexture, uv).g;
    float b = texture2D(uTexture, uv - vec2(gl * 0.04, 0.0)).b;
    gl_FragColor = vec4(r, g, b, 1.0);
}` },
    { id: 'invert', name: 'Invert', category: '2D Effects', desc: 'Full color inversion', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
void main() {
    vec4 col = texture2D(uTexture, vTexCoord);
    gl_FragColor = vec4(1.0 - col.rgb, 1.0);
}` },
    { id: 'grayscale', name: 'Grayscale', category: '2D Effects', desc: 'Desaturation to black and white', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
void main() {
    vec4 col = texture2D(uTexture, vTexCoord);
    float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    gl_FragColor = vec4(vec3(gray), 1.0);
}` },
    { id: 'sepia', name: 'Sepia Tone', category: '2D Effects', desc: 'Warm vintage sepia look', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
void main() {
    vec4 col = texture2D(uTexture, vTexCoord);
    float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    vec3 sepia = vec3(gray) * vec3(1.2, 0.9, 0.6);
    gl_FragColor = vec4(mix(col.rgb, sepia, 0.8), 1.0);
}` },
    { id: 'posterize', name: 'Posterize', category: '2D Effects', desc: 'Color quantization / posterization', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
void main() {
    vec4 col = texture2D(uTexture, vTexCoord);
    float levels = 4.0;
    col.rgb = floor(col.rgb * levels) / levels;
    gl_FragColor = col;
}` },

    // ── 3D Materials ──
    { id: 'toon', name: 'Toon Shading', category: '3D Materials', desc: 'Cel-shading with quantized lighting', code: `precision highp float;
varying vec2 vTexCoord;
varying vec3 vNormal;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec3 light = normalize(vec3(sin(uTime * 0.2), 1.0, cos(uTime * 0.2)));
    float diff = max(dot(vNormal, light), 0.0);
    float shade = floor(diff * 4.0) / 4.0;
    vec4 tex = texture2D(uTexture, vTexCoord);
    vec3 rim = vec3(pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 2.0));
    gl_FragColor = vec4(tex.rgb * (0.3 + 0.7 * shade) + rim * 0.3, 1.0);
}` },
    { id: 'hologram', name: 'Hologram', category: '3D Materials', desc: 'Scanline holographic projection', code: `precision highp float;
varying vec2 vTexCoord;
varying vec3 vNormal;
varying vec3 vPosition;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec2 uv = vTexCoord;
    vec4 tex = texture2D(uTexture, uv);
    float scanline = sin(vPosition.y * 40.0 + uTime * 4.0) * 0.5 + 0.5;
    float alpha = tex.r * 0.6 + scanline * 0.4;
    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
    vec3 col = mix(vec3(0.3, 0.8, 1.0), tex.rgb, 0.3) * (0.5 + fresnel * 0.5);
    col += vec3(0.0, 0.5, 1.0) * scanline * 0.2;
    alpha = clamp(alpha + fresnel * 0.3, 0.0, 1.0);
    gl_FragColor = vec4(col * alpha, alpha);
}` },
    { id: 'water', name: 'Animated Water', category: '3D Materials', desc: 'Fresnel-based animated water material', code: `precision highp float;
varying vec2 vTexCoord;
varying vec3 vNormal;
varying vec3 vWorldPosition;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec2 uv = vTexCoord;
    vec4 tex = texture2D(uTexture, uv);
    vec3 viewDir = normalize(-vWorldPosition);
    float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0);
    vec3 light = normalize(vec3(1.0, 1.0, 1.0));
    float diff = max(dot(vNormal, light), 0.0);
    float wave = sin(vWorldPosition.x * 4.0 + uTime) * cos(vWorldPosition.y * 3.0 + uTime * 0.7) * 0.1;
    vec3 col = mix(vec3(0.0, 0.3, 0.6), vec3(0.1, 0.7, 0.9), diff + wave);
    col = mix(col, vec3(1.0), fresnel * 0.7);
    gl_FragColor = vec4(col, 1.0);
}` },
    { id: 'outline', name: 'Cartoon Outline', category: '3D Materials', desc: 'Edge outline effect', code: `precision highp float;
varying vec2 vTexCoord;
varying vec3 vNormal;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec4 tex = texture2D(uTexture, vTexCoord);
    vec3 light = normalize(vec3(1.0, 1.0, 0.5));
    float diff = max(dot(vNormal, light), 0.0);
    float shade = floor(diff * 3.0) / 3.0;
    float edge = abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
    float outline = smoothstep(0.1, 0.3, edge);
    vec3 col = tex.rgb * (0.3 + 0.7 * shade) * outline;
    gl_FragColor = vec4(col, 1.0);
}` },
    { id: 'glass', name: 'Frosted Glass', category: '3D Materials', desc: 'Fresnel-based glass transparency', code: `precision highp float;
varying vec2 vTexCoord;
varying vec3 vNormal;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec4 tex = texture2D(uTexture, vTexCoord);
    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.5);
    float pulse = 0.95 + sin(uTime * 0.3) * 0.05;
    vec3 col = mix(tex.rgb, vec3(0.6, 0.8, 1.0), fresnel * 0.6);
    col *= pulse;
    float alpha = 0.3 + fresnel * 0.7;
    gl_FragColor = vec4(col * alpha, alpha);
}` },
    { id: 'fog', name: 'Distance Fog', category: '3D Materials', desc: 'Depth-based fog blending', code: `precision highp float;
varying vec2 vTexCoord;
varying vec3 vWorldPosition;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec4 tex = texture2D(uTexture, vTexCoord);
    float dist = length(vWorldPosition);
    float density = 0.15 + sin(uTime * 0.2) * 0.05;
    float fog = 1.0 - exp(-density * dist * dist);
    vec3 fogColor = vec3(0.1, 0.1, 0.2);
    gl_FragColor = vec4(mix(tex.rgb, fogColor, fog), 1.0);
}` },
    { id: 'heat-vision', name: 'Heat Vision', category: '3D Materials', desc: 'Thermal/infrared vision effect', code: `precision highp float;
varying vec2 vTexCoord;
varying vec3 vNormal;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec4 tex = texture2D(uTexture, vTexCoord);
    float heat = tex.r * 0.7 + tex.g * 0.2 + tex.b * 0.1;
    heat += sin(uTime + vTexCoord.y * 30.0) * 0.05;
    vec3 col;
    if (heat < 0.33) col = vec3(0.0, 0.0, 0.5);
    else if (heat < 0.66) col = vec3(heat * 2.0 - 0.33, 0.0, 0.5 - heat * 0.5);
    else col = vec3(1.0, heat * 1.5 - 1.0, 0.0);
    gl_FragColor = vec4(col, 1.0);
}` },
    { id: 'night-vision', name: 'Night Vision', category: '3D Materials', desc: 'Green-tinted night vision effect', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uResolution;
void main() {
    vec4 tex = texture2D(uTexture, vTexCoord);
    float gray = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    vec3 green = vec3(0.1, 0.8, 0.1) * gray;
    float scan = sin(vTexCoord.y * uResolution.y * 0.3 + uTime * 8.0) * 0.05 + 0.05;
    float noise = fract(sin(dot(vTexCoord * uResolution, vec2(12.9898, 78.233))) * 43758.5453) * 0.03;
    gl_FragColor = vec4(green + scan + noise, 1.0);
}` },

    // ── Psychedelic ──
    { id: 'acid-trip', name: 'Acid Trip', category: 'Psychedelic', desc: 'Psychedelic color warp', code: `precision highp float;
varying vec2 vTexCoord;
varying vec3 vNormal;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec2 uv = vTexCoord;
    vec4 tex = texture2D(uTexture, uv);
    float warp = sin(uv.x * 10.0 + uTime) * cos(uv.y * 10.0 + uTime * 1.3);
    vec3 psychedelic = 0.5 + 0.5 * cos(uTime + uv.xyx + vec3(0.0, 2.0, 4.0));
    vec3 col = mix(tex.rgb, psychedelic, 0.5 + warp * 0.3);
    gl_FragColor = vec4(col, 1.0);
}` },
    { id: 'matrix', name: 'Matrix Rain', category: 'Psychedelic', desc: 'Digital matrix rain effect', code: `precision highp float;
varying vec2 vTexCoord;
uniform float uTime;
uniform vec2 uResolution;
void main() {
    vec2 uv = vTexCoord;
    vec2 pos = uv * uResolution / 12.0;
    float colIdx = floor(pos.x);
    float glyph = fract(sin(colIdx * 123.456 + floor(pos.y + uTime * 2.0) * 789.012) * 43758.5453);
    float bright = fract(sin(colIdx * 345.678 + floor(pos.y - uTime * 4.0) * 901.234) * 43758.5453);
    float head = bright > 0.95 ? 1.0 : 0.0;
    float trail = smoothstep(0.3, 0.8, bright) * 0.5;
    float intensity = glyph > 0.7 ? trail : 0.0;
    intensity = max(intensity, head);
    vec3 col = vec3(0.0, intensity, 0.0);
    if (head > 0.5) col = vec3(0.5, 1.0, 0.5);
    gl_FragColor = vec4(col, 1.0);
}` },
    { id: 'warp', name: 'Space Warp', category: 'Psychedelic', desc: 'Hyperspace star warp effect', code: `precision highp float;
varying vec2 vTexCoord;
uniform float uTime;
uniform vec2 uResolution;
void main() {
    vec2 uv = vTexCoord - 0.5;
    float angle = atan(uv.y, uv.x);
    float radius = length(uv);
    float warp = radius + sin(angle * 8.0 + uTime) * 0.1;
    float star = pow(1.0 - abs(warp - 0.3) * 5.0, 8.0);
    star += pow(1.0 - abs(warp - 0.5) * 8.0, 12.0) * 0.5;
    float glow = sin(angle * 6.0 - uTime * 2.0 - radius * 20.0) * 0.5 + 0.5;
    glow *= 0.1 / (radius + 0.1);
    vec3 col = vec3(star * 0.8 + glow, star * 0.3 + glow * 0.5, star + glow);
    gl_FragColor = vec4(col, 1.0);
}` },
    { id: 'halftone', name: 'Halftone', category: '2D Effects', desc: 'Comic-book halftone dot pattern', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uTime;
void main() {
    vec4 col = texture2D(uTexture, vTexCoord);
    float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    vec2 grid = vTexCoord * uResolution / 12.0;
    float dotSize = 0.5 + gray * 0.5;
    float d = length(fract(grid) - 0.5);
    float pattern = smoothstep(dotSize * 0.5, dotSize * 0.4, d);
    vec3 cmyk = col.rgb * pattern + (1.0 - pattern) * 0.95;
    gl_FragColor = vec4(cmyk, 1.0);
}` },
    { id: 'dither', name: 'Dither', category: '2D Effects', desc: 'Bayer ordered dithering', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform vec2 uResolution;
void main() {
    vec4 col = texture2D(uTexture, vTexCoord);
    float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    vec2 pos = mod(floor(vTexCoord * uResolution / 4.0), 4.0);
    float bayer = (pos.x + pos.y * 4.0) / 16.0;
    float dithered = step(bayer, gray);
    gl_FragColor = vec4(vec3(dithered), 1.0);
}` },
    { id: 'swirl', name: 'Swirl', category: '2D Effects', desc: 'Polar-coordinate texture swirl', code: `precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec2 uv = vTexCoord - 0.5;
    float dist = length(uv);
    float angle = atan(uv.y, uv.x);
    float strength = 2.0 + sin(uTime * 0.3) * 0.5;
    angle += dist * strength;
    uv = vec2(cos(angle), sin(angle)) * dist + 0.5;
    gl_FragColor = texture2D(uTexture, uv);
}` },

    // ── 3D Materials ──
    { id: 'rain', name: 'Rain Streaks', category: '3D Materials', desc: 'Rain drops sliding across a surface', code: `precision highp float;
varying vec2 vTexCoord;
varying vec3 vPosition;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec2 uv = vTexCoord;
    vec4 tex = texture2D(uTexture, uv);
    float t = uTime * 0.5;
    float rain = 0.0;
    for (int i = 0; i < 8; i++) {
        float fi = float(i);
        vec2 seed = fract(sin(vec2(fi * 12.9898, fi * 78.233)) * 43758.5453);
        vec2 pos = seed * 1.2 - 0.1;
        float speed = 1.0 + seed.x * 2.0;
        float streak = mod(vPosition.y * 2.0 + t * speed + fi * 3.0, 2.0) - 1.0;
        float drop = 1.0 - abs(streak);
        drop = smoothstep(0.0, 0.3, drop);
        float width = 0.02 + seed.y * 0.015;
        float dx = abs(uv.x - pos.x);
        drop *= smoothstep(width, 0.0, dx);
        float trail = 1.0 - abs(streak * 2.0);
        trail = smoothstep(0.0, 0.5, trail) * 0.3;
        rain += max(drop * 0.6, trail);
    }
    vec3 col = mix(tex.rgb, vec3(0.6, 0.7, 1.0), rain * 0.5);
    gl_FragColor = vec4(col, 1.0);
}` },
    { id: 'lava', name: 'Lava', category: '3D Materials', desc: 'Glowing lava with noise distortion', code: `precision highp float;
varying vec2 vTexCoord;
varying vec3 vNormal;
uniform sampler2D uTexture;
uniform float uTime;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
    vec2 uv = vTexCoord * 2.0;
    float t = uTime * 0.2;
    float n1 = noise(uv + t);
    float n2 = noise(uv * 2.0 + n1 + t * 0.5);
    float n3 = noise(uv * 4.0 + n2 * 1.5 + t * 0.3);
    float l = n1 * 0.6 + n2 * 0.3 + n3 * 0.1;
    vec3 col = mix(vec3(0.05, 0.01, 0.0), vec3(1.0, 0.6, 0.1), smoothstep(0.2, 0.6, l));
    col = mix(col, vec3(1.0, 0.9, 0.4), smoothstep(0.6, 0.9, l));
    col += vec3(0.5, 0.2, 0.0) * max(l - 0.5, 0.0) * 2.0;
    vec3 light = normalize(vec3(1.0, 1.0, 0.5));
    float diff = max(dot(vNormal, light), 0.0) * 0.3 + 0.7;
    gl_FragColor = vec4(col * diff, 1.0);
}` },

    // ── Procedural / Generative ──
    { id: 'plasma', name: 'Plasma', category: 'Procedural', desc: 'Classic sine-wave plasma', code: `precision highp float;
varying vec2 vTexCoord;
uniform float uTime;
uniform vec2 uResolution;
void main() {
    vec2 uv = vTexCoord * 4.0;
    float t = uTime * 0.5;
    float c1 = sin(uv.x * 2.0 + t);
    float c2 = sin(uv.y * 3.0 - t * 1.3);
    float c3 = sin((uv.x + uv.y) * 1.5 + t * 0.7);
    float c4 = sin(length(uv - 1.0) * 3.0 + t * 1.1);
    float plasma = c1 + c2 + c3 + c4;
    vec3 col = 0.5 + 0.5 * cos(plasma + vec3(0.0, 2.0, 4.0));
    gl_FragColor = vec4(col, 1.0);
}` },
    { id: 'voronoi', name: 'Voronoi', category: 'Procedural', desc: 'Animated Voronoi cell pattern', code: `precision highp float;
varying vec2 vTexCoord;
uniform float uTime;
uniform vec2 uResolution;
void main() {
    vec2 uv = vTexCoord * 6.0;
    vec2 i = floor(uv);
    vec2 f = fract(uv);
    float md = 1.0;
    vec2 mp = vec2(0.0);
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 n = vec2(float(x), float(y));
            vec2 p = n + 0.5 + 0.5 * sin(uTime + i + n);
            float d = length(f - p);
            if (d < md) { md = d; mp = p; }
        }
    }
    vec3 colA = 0.5 + 0.5 * cos(mp.xyx + vec3(0.0, 2.0, 4.0));
    vec3 colB = 0.5 + 0.5 * cos(mp.xyx + vec3(3.0, 5.0, 1.0));
    vec3 col = mix(colA, colB, smoothstep(0.3, 0.6, md));
    float edge = smoothstep(0.85, 0.95, 1.0 - md);
    col += edge * 0.3;
    gl_FragColor = vec4(col, 1.0);
}` },
    { id: 'domain-warp', name: 'Domain Warp', category: 'Procedural', desc: 'Fluid noise domain warping', code: `precision highp float;
varying vec2 vTexCoord;
uniform float uTime;
uniform vec2 uResolution;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
    vec2 uv = vTexCoord * 4.0;
    float t = uTime * 0.2;
    float n1 = noise(uv + t);
    float n2 = noise(uv * 2.0 + n1 + t * 0.5);
    float n3 = noise(uv * 4.0 + n2 * 1.5 + t * 0.3);
    vec3 col = 0.5 + 0.5 * cos(n3 * 6.0 + uv.xyx + vec3(0.0, 2.0, 4.0));
    gl_FragColor = vec4(col, 1.0);
}` },
    { id: 'mandelbrot', name: 'Mandelbrot', category: 'Procedural', desc: 'Mandelbrot fractal viewer', code: `precision highp float;
varying vec2 vTexCoord;
uniform float uTime;
void main() {
    vec2 uv = vTexCoord - 0.5;
    float zoom = 2.5 + sin(uTime * 0.1) * 0.5;
    vec2 c = uv * zoom - vec2(0.7, 0.0);
    vec2 z = vec2(0.0);
    float iter = 0.0;
    for (int i = 0; i < 100; i++) {
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
        if (length(z) > 2.0) break;
        iter += 1.0;
    }
    float t = iter / 100.0;
    vec3 col = 0.5 + 0.5 * cos(t * 8.0 + vec3(0.0, 2.0, 4.0));
    if (iter >= 99.0) col = vec3(0.0);
    gl_FragColor = vec4(col, 1.0);
}` },
    { id: 'starfield', name: 'Starfield', category: 'Procedural', desc: 'Hyperspace warp-speed stars', code: `precision highp float;
varying vec2 vTexCoord;
uniform float uTime;
uniform vec2 uResolution;
void main() {
    vec2 uv = vTexCoord - 0.5;
    float t = uTime * 0.5;
    vec3 dir = normalize(vec3(uv * 2.0, 1.0));
    float speed = 0.5 + 0.5 * sin(t * 0.1);
    vec3 col = vec3(0.0);
    for (int i = 0; i < 60; i++) {
        float fi = float(i);
        vec3 seed = vec3(fi * 12.9898, fi * 78.233, fi * 45.164);
        vec3 star = fract(sin(seed) * 43758.5453) * 2.0 - 1.0;
        float z = fract(star.z + t * speed * 0.5);
        vec3 p = vec3(star.xy * (1.0 - z) * 5.0, z);
        float d = length(p.xy / p.z - dir.xy / dir.z);
        float bri = smoothstep(0.05, 0.0, d) * (1.0 - p.z) * 0.5;
        bri *= smoothstep(0.0, 0.1, p.z);
        float hue = star.x * 0.5 + 0.5;
        vec3 starCol = 0.5 + 0.5 * cos(hue * 6.0 + vec3(0.0, 2.0, 4.0));
        col += bri * starCol;
    }
    col += 0.02 / (1.0 + length(uv) * 3.0);
    gl_FragColor = vec4(col, 1.0);
}` },
    { id: 'nebula', name: 'Nebula', category: 'Procedural', desc: 'Layered FBM space nebula with stars', code: `precision highp float;
varying vec2 vTexCoord;
uniform float uTime;
uniform vec2 uResolution;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; } return v; }
void main() {
    vec2 uv = vTexCoord * 3.0;
    float t = uTime * 0.05;
    float n = fbm(uv + t);
    float n2 = fbm(uv * 2.0 - n + t * 0.3 + 100.0);
    vec3 col = mix(mix(vec3(0.4, 0.1, 0.6), vec3(0.1, 0.2, 0.8), n), vec3(0.8, 0.3, 0.5), n2);
    float stars = pow(max(hash(floor(uv * 40.0 + t * 10.0)) - 0.97, 0.0) * 30.0, 2.0);
    gl_FragColor = vec4(col + stars, 1.0);
}` },
    { id: 'aurora', name: 'Aurora', category: 'Procedural', desc: 'Aurora borealis curtain effect', code: `precision highp float;
varying vec2 vTexCoord;
uniform float uTime;
uniform vec2 uResolution;
void main() {
    vec2 uv = vTexCoord;
    float t = uTime * 0.1;
    float aurora = 0.0;
    for (int i = 0; i < 8; i++) {
        float fi = float(i);
        float x = uv.x * 4.0 + t * (1.0 + fi * 0.2) + sin(t * 0.3 + fi) * 0.5;
        float y = uv.y * 3.0 - 1.5 + fi * 0.3;
        aurora += sin(x) * exp(-abs(y) * (2.0 + fi * 0.3)) * 0.15 / (1.0 + fi * 0.2);
    }
    vec3 col1 = vec3(0.0, 0.8, 0.4);
    vec3 col2 = vec3(0.0, 0.3, 1.0);
    vec3 col3 = vec3(0.8, 0.0, 0.6);
    float m = aurora * 2.0 + 0.5;
    vec3 col = mix(col1, col2, smoothstep(0.0, 1.0, m));
    col = mix(col, col3, smoothstep(1.0, 2.0, m));
    gl_FragColor = vec4(col * max(aurora * 3.0, 0.0), 1.0);
}` },
    { id: 'fire', name: 'Fire', category: 'Procedural', desc: 'Noise-based procedural fire', code: `precision highp float;
varying vec2 vTexCoord;
uniform float uTime;
uniform vec2 uResolution;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
    vec2 uv = vTexCoord;
    float t = uTime * 0.5;
    float n1 = noise(uv * 3.0 + vec2(0.0, -t));
    float n2 = noise(uv * 5.0 + vec2(n1 * 2.0, -t * 1.3));
    float n3 = noise(uv * 8.0 + vec2(n2 * 3.0, -t * 0.7));
    float fire = pow(n1 * 0.5 + n2 * 0.3 + n3 * 0.2, 0.5);
    vec3 col = mix(vec3(1.0, 0.9, 0.3), vec3(1.0, 0.3, 0.0), smoothstep(0.3, 0.8, fire));
    col = mix(col, vec3(0.3, 0.0, 0.0), smoothstep(0.8, 1.0, fire));
    gl_FragColor = vec4(max(col * (1.0 - uv.y * 0.5), 0.0), 1.0);
}` },
    { id: 'tunnel', name: '3D Tunnel', category: 'Procedural', desc: 'Infinite perspective tunnel', code: `precision highp float;
varying vec2 vTexCoord;
uniform float uTime;
uniform vec2 uResolution;
void main() {
    vec2 uv = vTexCoord - 0.5;
    float angle = atan(uv.y, uv.x);
    float radius = length(uv);
    float t = uTime * 0.3;
    float z = t + 1.0 / (radius + 0.01);
    float pattern = sin(angle * 8.0 + z) * 0.5 + 0.5;
    pattern += sin(angle * 16.0 - z * 2.0) * 0.25;
    float ring = sin(25.1327 / (radius + 0.01) + t * 2.0) * 0.5 + 0.5;
    float bright = 1.0 / (radius * radius * 2.0 + 0.5);
    vec3 col = mix(vec3(0.8, 0.2, 0.4), vec3(0.2, 0.4, 0.8), pattern);
    col += ring * vec3(0.5, 0.8, 1.0) * 0.3;
    gl_FragColor = vec4(col * bright, 1.0);
}` },
    { id: 'sdf', name: 'SDF Raymarch', category: 'Procedural', desc: 'Raymarched SDF primitives (sphere, box, torus)', code: `precision highp float;
varying vec2 vTexCoord;
uniform float uTime;
uniform vec2 uResolution;
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float scene(vec3 p) {
    float t = uTime * 0.3;
    float s = sdSphere(p - vec3(sin(t) * 1.5, 0.0, 0.0), 0.6);
    float b = sdBox(p - vec3(cos(t + 2.0) * 1.5, 0.0, 0.0), vec3(0.5));
    float tor = sdTorus(p - vec3(0.0, 1.0, 0.0), vec2(0.6, 0.25));
    return min(min(s, b), tor);
}
void main() {
    vec2 uv = (vTexCoord - 0.5) * 2.0;
    uv.x *= uResolution.x / uResolution.y;
    vec3 ro = vec3(0.0, 0.0, 3.0);
    vec3 rd = normalize(vec3(uv, -1.0));
    float t = 0.0;
    for (int i = 0; i < 80; i++) {
        vec3 p = ro + rd * t;
        float d = scene(p);
        if (d < 0.001) break;
        t += d;
        if (t > 20.0) break;
    }
    vec3 col = vec3(0.0);
    if (t < 20.0) {
        vec3 p = ro + rd * t;
        vec3 n = normalize(vec3(
            scene(p + vec3(0.001, 0.0, 0.0)) - scene(p - vec3(0.001, 0.0, 0.0)),
            scene(p + vec3(0.0, 0.001, 0.0)) - scene(p - vec3(0.0, 0.001, 0.0)),
            scene(p + vec3(0.0, 0.0, 0.001)) - scene(p - vec3(0.0, 0.0, 0.001))
        ));
        vec3 light = normalize(vec3(1.0, 2.0, 1.0));
        float diff = max(dot(n, light), 0.0);
        vec3 baseCol = 0.5 + 0.5 * cos(p * 2.0 + vec3(0.0, 2.0, 4.0));
        col = baseCol * (diff * 0.7 + 0.3);
        col += pow(max(dot(n, normalize(ro - p)), 0.0), 16.0) * 0.5;
    }
    gl_FragColor = vec4(col, 1.0);
}` },
];

const VERTEX_SHADER_SRC = `
attribute vec3 aPosition;
attribute vec2 aTexCoord;
attribute vec3 aNormal;
uniform mat4 uModelViewProjection;
uniform mat4 uModelMatrix;
uniform mat4 uNormalMatrix;
varying vec2 vTexCoord;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vWorldPosition;

void main() {
    gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
    vTexCoord = aTexCoord;
    vNormal = normalize(mat3(uNormalMatrix) * aNormal);
    vPosition = aPosition;
    vWorldPosition = (uModelMatrix * vec4(aPosition, 1.0)).xyz;
}
`;

function createSphere(radius: number, w: number, h: number): { positions: Float32Array; texcoords: Float32Array; normals: Float32Array; indices: Uint16Array } {
    const positions: number[] = [];
    const texcoords: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    for (let j = 0; j <= h; j++) {
        const phi = j * Math.PI / h;
        for (let i = 0; i <= w; i++) {
            const theta = i * 2 * Math.PI / w;
            const x = radius * Math.sin(phi) * Math.cos(theta);
            const y = radius * Math.cos(phi);
            const z = radius * Math.sin(phi) * Math.sin(theta);
            positions.push(x, y, z);
            normals.push(x / radius, y / radius, z / radius);
            texcoords.push(i / w, j / h);
        }
    }
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            const a = j * (w + 1) + i;
            const b = a + w + 1;
            indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
    }
    return {
        positions: new Float32Array(positions),
        texcoords: new Float32Array(texcoords),
        normals: new Float32Array(normals),
        indices: new Uint16Array(indices),
    };
}

function createCube(size: number): { positions: Float32Array; texcoords: Float32Array; normals: Float32Array; indices: Uint16Array } {
    const p = size / 2;
    const verts: number[][] = [
        [-p, -p, p], [p, -p, p], [p, p, p], [-p, p, p],
        [-p, -p, -p], [-p, p, -p], [p, p, -p], [p, -p, -p],
        [-p, p, -p], [-p, p, p], [p, p, p], [p, p, -p],
        [-p, -p, -p], [p, -p, -p], [p, -p, p], [-p, -p, p],
        [p, -p, -p], [p, p, -p], [p, p, p], [p, -p, p],
        [-p, -p, -p], [-p, -p, p], [-p, p, p], [-p, p, -p],
    ];
    const uvs: number[][] = [
        [0, 1], [1, 1], [1, 0], [0, 0],
        [0, 1], [1, 1], [1, 0], [0, 0],
        [0, 0], [0, 1], [1, 1], [1, 0],
        [0, 0], [0, 1], [1, 1], [1, 0],
        [1, 0], [1, 1], [0, 1], [0, 0],
        [0, 0], [1, 0], [1, 1], [0, 1],
    ];
    const norms: number[][] = [
        [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1],
        [0, 0, -1], [0, 0, -1], [0, 0, -1], [0, 0, -1],
        [0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0],
        [0, -1, 0], [0, -1, 0], [0, -1, 0], [0, -1, 0],
        [1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0],
        [-1, 0, 0], [-1, 0, 0], [-1, 0, 0], [-1, 0, 0],
    ];
    const faceIdx = [0, 1, 2, 0, 2, 3];
    const faces = 6;
    const positions: number[] = [];
    const texcoords: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    for (let f = 0; f < faces; f++) {
        const base = f * 4;
        for (let v = 0; v < 4; v++) {
            const vi = base + v;
            positions.push(...verts[vi]);
            texcoords.push(...uvs[vi]);
            normals.push(...norms[vi]);
        }
        for (let i = 0; i < 6; i++) {
            indices.push(base + faceIdx[i]);
        }
    }
    return {
        positions: new Float32Array(positions),
        texcoords: new Float32Array(texcoords),
        normals: new Float32Array(normals),
        indices: new Uint16Array(indices),
    };
}

function createTorus(radius: number, tube: number, rSeg: number, tSeg: number): { positions: Float32Array; texcoords: Float32Array; normals: Float32Array; indices: Uint16Array } {
    const positions: number[] = [];
    const texcoords: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= rSeg; i++) {
        const u = i / rSeg * 2 * Math.PI;
        for (let j = 0; j <= tSeg; j++) {
            const v = j / tSeg * 2 * Math.PI;
            const x = (radius + tube * Math.cos(v)) * Math.cos(u);
            const y = (radius + tube * Math.cos(v)) * Math.sin(u);
            const z = tube * Math.sin(v);
            positions.push(x, y, z);
            const nx = Math.cos(v) * Math.cos(u);
            const ny = Math.cos(v) * Math.sin(u);
            const nz = Math.sin(v);
            normals.push(nx, ny, nz);
            texcoords.push(i / rSeg, j / tSeg);
        }
    }
    for (let i = 0; i < rSeg; i++) {
        for (let j = 0; j < tSeg; j++) {
            const a = i * (tSeg + 1) + j;
            const b = a + tSeg + 1;
            indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
    }
    return {
        positions: new Float32Array(positions),
        texcoords: new Float32Array(texcoords),
        normals: new Float32Array(normals),
        indices: new Uint16Array(indices),
    };
}

const mat4 = {
    identity: (): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    multiply: (a: number[], b: number[]): number[] => {
        const r: number[] = [];
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) sum += a[i * 4 + k] * b[k * 4 + j];
                r.push(sum);
            }
        }
        return r;
    },
    perspective: (fov: number, aspect: number, near: number, far: number): number[] => {
        const f = 1.0 / Math.tan(fov / 2);
        return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0];
    },
    lookAt: (eye: number[], center: number[], up: number[]): number[] => {
        const f = [center[0] - eye[0], center[1] - eye[1], center[2] - eye[2]];
        const fl = Math.sqrt(f[0] * f[0] + f[1] * f[1] + f[2] * f[2]);
        f[0] /= fl; f[1] /= fl; f[2] /= fl;
        const s = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
        const sl = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]);
        s[0] /= sl; s[1] /= sl; s[2] /= sl;
        const u = [s[1] * f[2] - s[2] * f[1], s[2] * f[0] - s[0] * f[2], s[0] * f[1] - s[1] * f[0]];
        return [s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -s[0] * eye[0] - s[1] * eye[1] - s[2] * eye[2], -u[0] * eye[0] - u[1] * eye[1] - u[2] * eye[2], f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2], 1];
    },
    rotateX: (m: number[], angle: number): number[] => {
        const c = Math.cos(angle), s = Math.sin(angle);
        const r = mat4.identity();
        r[5] = c; r[6] = -s; r[9] = s; r[10] = c;
        return mat4.multiply(m, r);
    },
    rotateY: (m: number[], angle: number): number[] => {
        const c = Math.cos(angle), s = Math.sin(angle);
        const r = mat4.identity();
        r[0] = c; r[2] = s; r[8] = -s; r[10] = c;
        return mat4.multiply(m, r);
    },
    inverseTranspose: (m: number[]): number[] => {
        const d = m;
        const inv: number[] = [];
        const det =
            d[0] * (d[5] * d[10] - d[6] * d[9]) -
            d[1] * (d[4] * d[10] - d[6] * d[8]) +
            d[2] * (d[4] * d[9] - d[5] * d[8]);
        if (Math.abs(det) < 1e-10) return mat4.identity();
        const invDet = 1.0 / det;
        inv[0] = (d[5] * d[10] - d[6] * d[9]) * invDet;
        inv[1] = (d[2] * d[9] - d[1] * d[10]) * invDet;
        inv[2] = (d[1] * d[6] - d[2] * d[5]) * invDet;
        inv[3] = 0;
        inv[4] = (d[6] * d[8] - d[4] * d[10]) * invDet;
        inv[5] = (d[0] * d[10] - d[2] * d[8]) * invDet;
        inv[6] = (d[2] * d[4] - d[0] * d[6]) * invDet;
        inv[7] = 0;
        inv[8] = (d[4] * d[9] - d[5] * d[8]) * invDet;
        inv[9] = (d[1] * d[8] - d[0] * d[9]) * invDet;
        inv[10] = (d[0] * d[5] - d[1] * d[4]) * invDet;
        inv[11] = 0;
        inv[12] = 0; inv[13] = 0; inv[14] = 0; inv[15] = 1;
        const t: number[] = [];
        for (let i = 0; i < 4; i++)
            for (let j = 0; j < 4; j++)
                t[j * 4 + i] = inv[i * 4 + j];
        return t;
    },
};

type BlendMode = 'replace' | 'multiply' | 'screen' | 'add' | 'normal';

interface ShaderLayer {
    id: string;
    name: string;
    code: string;
    blendMode: BlendMode;
    opacity: number;
    visible: boolean;
}

interface FBO {
    fbo: WebGLFramebuffer;
    tex: WebGLTexture;
    width: number;
    height: number;
}

function createFBO(gl: WebGLRenderingContext, width: number, height: number): FBO {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex, width, height };
}

const BLEND_VERT = `
attribute vec2 aPosition;
varying vec2 vTexCoord;
void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
    vTexCoord = aPosition * 0.5 + 0.5;
}
`;

const BLEND_FRAG_REPLACE = `precision highp float; varying vec2 vTexCoord; uniform sampler2D uTexture; void main() { gl_FragColor = texture2D(uTexture, vTexCoord); }`;

const BLEND_FRAG_NORMAL = `precision highp float; varying vec2 vTexCoord; uniform sampler2D uTexture; uniform sampler2D uAccum; uniform float uOpacity; void main() { vec4 a = texture2D(uAccum, vTexCoord); vec4 b = texture2D(uTexture, vTexCoord); gl_FragColor = mix(a, b, uOpacity); }`;

const BLEND_FRAG_MULTIPLY = `precision highp float; varying vec2 vTexCoord; uniform sampler2D uTexture; uniform sampler2D uAccum; uniform float uOpacity; void main() { vec4 a = texture2D(uAccum, vTexCoord); vec4 b = texture2D(uTexture, vTexCoord); gl_FragColor = mix(a, vec4(a.rgb * b.rgb, 1.0), uOpacity); }`;

const BLEND_FRAG_SCREEN = `precision highp float; varying vec2 vTexCoord; uniform sampler2D uTexture; uniform sampler2D uAccum; uniform float uOpacity; void main() { vec4 a = texture2D(uAccum, vTexCoord); vec4 b = texture2D(uTexture, vTexCoord); vec3 s = 1.0 - (1.0 - a.rgb) * (1.0 - b.rgb); gl_FragColor = mix(a, vec4(s, 1.0), uOpacity); }`;

const BLEND_FRAG_ADD = `precision highp float; varying vec2 vTexCoord; uniform sampler2D uTexture; uniform sampler2D uAccum; uniform float uOpacity; void main() { vec4 a = texture2D(uAccum, vTexCoord); vec4 b = texture2D(uTexture, vTexCoord); gl_FragColor = mix(a, vec4(min(a.rgb + b.rgb, 1.0), 1.0), uOpacity); }`;

const BLEND_SHADERS: Record<BlendMode, string> = {
    replace: BLEND_FRAG_REPLACE,
    normal: BLEND_FRAG_NORMAL,
    multiply: BLEND_FRAG_MULTIPLY,
    screen: BLEND_FRAG_SCREEN,
    add: BLEND_FRAG_ADD,
};

function compileBlendProgram(gl: WebGLRenderingContext, blendMode: BlendMode): WebGLProgram | null {
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, BLEND_VERT);
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, BLEND_SHADERS[blendMode]);
    gl.compileShader(fs);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    return prog;
}

const FS_QUAD_POSITIONS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

function generateProceduralTexture(width: number, height: number): Uint8Array {
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const cx = x / width - 0.5, cy = y / height - 0.5;
            const g = Math.floor(x / 32) + Math.floor(y / 32);
            const r = 0.2 + 0.8 * (g % 2 === 0 ? 1 : 0);
            const gr = 0.2 + 0.8 * (g % 3 === 0 ? 1 : 0);
            const b = 0.3 + 0.7 * Math.abs(Math.sin(cx * 20) * Math.cos(cy * 20));
            data[i] = Math.floor(r * 255);
            data[i + 1] = Math.floor(gr * 255);
            data[i + 2] = Math.floor(b * 255);
            data[i + 3] = 255;
        }
    }
    return data;
}

const MESHES: Record<MeshType, () => { positions: Float32Array; texcoords: Float32Array; normals: Float32Array; indices: Uint16Array }> = {
    sphere: () => createSphere(1.0, 32, 32),
    cube: () => createCube(1.5),
    torus: () => createTorus(1.0, 0.4, 20, 16),
};

const MESH_LABELS: Record<MeshType, string> = {
    sphere: 'Sphere',
    cube: 'Cube',
    torus: 'Torus',
};

interface ParsedUniform {
    glType: string;
    name: string;
    hint: string;
    value: number | number[] | boolean;
}

function parseUniforms(source: string, prevValues: Record<string, any>): ParsedUniform[] {
    const systemUniforms = new Set(['uTexture', 'uTime', 'uResolution', 'uModelViewProjection', 'uModelMatrix', 'uNormalMatrix', 'uMouse', 'uCameraPosition']);
    const result: ParsedUniform[] = [];
    const regex = /uniform\s+(float|int|bool|vec2|vec3|vec4|sampler2D)\s+(\w+)\s*;(?:\s*\/\/\s*(.*))?/g;
    let match;
    while ((match = regex.exec(source)) !== null) {
        const glType = match[1];
        const name = match[2];
        if (systemUniforms.has(name)) continue;
        const hint = (match[3] || '').trim();
        let value: any = prevValues[name];
        if (value === undefined) {
            value = defaultValueForType(glType, hint);
        }
        result.push({ glType, name, hint, value });
    }
    return result;
}

function defaultValueForType(type: string, hint: string): any {
    const isColor = hint.toLowerCase().includes('color');
    switch (type) {
        case 'float': return 0.5;
        case 'int': return 1;
        case 'bool': return false;
        case 'vec2': return [0.5, 0.5];
        case 'vec3': return isColor ? [1.0, 0.0, 0.0] : [0.5, 0.5, 0.5];
        case 'vec4': return isColor ? [1.0, 0.0, 0.0, 1.0] : [0.5, 0.5, 0.5, 1.0];
        default: return 0.5;
    }
}

function rangeFromHint(hint: string): [number, number] {
    const match = hint.match(/\[([\d.]+)\s*,\s*([\d.]+)\]/);
    if (match) return [parseFloat(match[1]), parseFloat(match[2])];
    return [0, 1];
}

function vec3ToHex(v: number[]): string {
    const r = Math.round(Math.max(0, Math.min(1, v[0])) * 255);
    const g = Math.round(Math.max(0, Math.min(1, v[1])) * 255);
    const b = Math.round(Math.max(0, Math.min(1, v[2])) * 255);
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function hexToVec3(hex: string): number[] {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
}

function compileShaderProgram(gl: WebGLRenderingContext, fragmentSource: string): WebGLProgram | null {
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERTEX_SHADER_SRC);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) return null;
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fragmentSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) return null;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
}

function interpolateKeyframes(frames: Array<{ time: number; value: any }>, t: number): any {
    if (frames.length === 0) return undefined;
    if (frames.length === 1) return frames[0].value;
    if (t <= frames[0].time) return frames[0].value;
    if (t >= frames[frames.length - 1].time) return frames[frames.length - 1].value;
    for (let i = 0; i < frames.length - 1; i++) {
        const a = frames[i], b = frames[i + 1];
        if (t >= a.time && t < b.time) {
            const f = (t - a.time) / (b.time - a.time);
            if (typeof a.value === 'number') return a.value + (b.value - a.value) * f;
            if (Array.isArray(a.value)) return a.value.map((v: number, j: number) => v + (b.value[j] - v) * f);
            return a.value;
        }
    }
    return frames[frames.length - 1].value;
}

const THEME = {
    accent: '#ff0000',
    accentSoft: 'rgba(255, 0, 0, 0.08)',
    bgRoot: '#050608',
    bgDeep: '#080a0f',
    bgPanel: '#12151c',
    bgPanelAlt: '#0d0f14',
    bgHover: '#1a1d26',
    border: '#2a2f3a',
    borderMute: '#1a1d26',
    textMain: '#f0f2f5',
    textDim: '#8a8f9d',
    textMute: '#4f5565',
    danger: '#ff4d4d',
    ok: '#00cc66',
    retroIn: 'inset 2px 2px 0 rgba(0,0,0,0.5)',
    retroOut: '2px 2px 0 rgba(0,0,0,0.5)'
};

const ShaderEditor: React.FC = () => {
    const { isReady, projectState } = useStudio();
    const [shaders, setShaders] = useState<Shader[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [compileStatus, setCompileStatus] = useState<'idle' | 'compiling' | 'success' | 'error'>('idle');
    const [isSaving, setIsSaving] = useState(false);
    const [errorMsg, setErrorLog] = useState('');
    const [showTemplates, setShowTemplates] = useState(false);
    const [meshType, setMeshType] = useState<MeshType>('sphere');
    const [meshVersion, setMeshVersion] = useState(0);
    const [autocompile, setAutocompile] = useState(true);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const glRef = useRef<WebGLRenderingContext | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);
    const [uniformControls, setUniformControls] = useState<ParsedUniform[]>([]);
    const [uniformBindings, setUniformBindings] = useState<Record<string, string>>({});
    const [fps, setFps] = useState(0);
    const [frameTime, setFrameTime] = useState(0);
    const meshRef = useRef<{ buf: { pos: WebGLBuffer; tex: WebGLBuffer; norm: WebGLBuffer; idx: WebGLBuffer }; count: number } | null>(null);
    const textureRef = useRef<WebGLTexture | null>(null);
    const rotationRef = useRef({ x: 0.3, y: 0 });
    const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 });
    const animRef = useRef(0);
    const uniformValuesRef = useRef<Record<string, any>>({});
    const uniformControlsRef = useRef<ParsedUniform[]>([]);
    const uniformBindingsRef = useRef<Record<string, string>>({});
    const fpsRef = useRef({ frames: 0, lastTime: 0 });
    const [layers, setLayers] = useState<ShaderLayer[]>(() => {
        const s = shaders[0];
        if (s?.layers?.length) return s.layers;
        return [{
            id: 'layer_1',
            name: 'Layer 1',
            code: s?.code || TEMPLATES[0].code,
            blendMode: 'replace' as BlendMode,
            opacity: 1,
            visible: true,
        }];
    });
    const [activeLayerIdx, setActiveLayerIdx] = useState(0);
    const activeLayerIdxRef = useRef(0);
    const prevShaderIdRef = useRef<string>('');
    const layersRef = useRef<ShaderLayer[]>([]);
    const [layerPrograms, setLayerPrograms] = useState<Record<string, { status: 'idle' | 'compiling' | 'success' | 'error'; program: WebGLProgram | null }>>({});
    const layerProgramsRef = useRef<Record<string, { status: 'idle' | 'compiling' | 'success' | 'error'; program: WebGLProgram | null }>>({});
    const fboCacheRef = useRef<{ fboA: FBO | null; fboB: FBO | null; quadProg: WebGLProgram | null; blendProgs: Record<string, WebGLProgram | null> }>({
        fboA: null, fboB: null, quadProg: null, blendProgs: {},
    });
    const [snapshotBCode, setSnapshotBCode] = useState<string | null>(null);
    const [previewVersion, setPreviewVersion] = useState<'a' | 'b'>('a');
    const bProgramRef = useRef<WebGLProgram | null>(null);
    const previewVersionRef = useRef<'a' | 'b'>('a');
    const snapshotBCodeRef = useRef<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const undoStackRef = useRef<Array<{ layers: ShaderLayer[]; activeLayerIdx: number }>>([]);
    const undoIndexRef = useRef(-1);
    const MAX_UNDO = 50;
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const skipUndoRef = useRef(false);
    const [animPlaying, setAnimPlaying] = useState(false);
    const [animTime, setAnimTime] = useState(0);
    const animTimeRef = useRef(0);
    const animDuration = 5;
    const [keyframes, setKeyframes] = useState<Record<string, Array<{ time: number; value: any }>>>({});
    const keyframesRef = useRef<Record<string, Array<{ time: number; value: any }>>>({});
    const lastFrameTimeRef = useRef(0);
    const animPlayingRef = useRef(false);
    const [animatingUniform, setAnimatingUniform] = useState<string | null>(null);

    const pushUndo = useCallback(() => {
        const snapshot = {
            layers: JSON.parse(JSON.stringify(layers)),
            activeLayerIdx,
        };
        const stack = undoStackRef.current;
        const idx = undoIndexRef.current;
        stack.splice(idx + 1, stack.length - idx - 1);
        stack.push(snapshot);
        if (stack.length > MAX_UNDO) stack.shift();
        undoIndexRef.current = stack.length - 1;
    }, [layers, activeLayerIdx]);

    const undo = useCallback(() => {
        if (undoIndexRef.current <= 0) return;
        undoIndexRef.current -= 1;
        const snapshot = undoStackRef.current[undoIndexRef.current];
        if (!snapshot) return;
        skipUndoRef.current = true;
        setLayers(snapshot.layers);
        setActiveLayerIdx(snapshot.activeLayerIdx);
        setTimeout(() => { skipUndoRef.current = false; }, 0);
    }, []);

    const redo = useCallback(() => {
        if (undoIndexRef.current >= undoStackRef.current.length - 1) return;
        undoIndexRef.current += 1;
        const snapshot = undoStackRef.current[undoIndexRef.current];
        if (!snapshot) return;
        skipUndoRef.current = true;
        setLayers(snapshot.layers);
        setActiveLayerIdx(snapshot.activeLayerIdx);
        setTimeout(() => { skipUndoRef.current = false; }, 0);
    }, []);

    const templatesMap = useRef<Record<string, string>>({});
    TEMPLATES.forEach(t => { templatesMap.current[t.id] = t.code; });

    const currentShader = shaders[currentIndex] || { id: 'empty', name: 'untitled', code: TEMPLATES[0].code, uniforms: {} };

    const initTexture = useCallback((gl: WebGLRenderingContext) => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        const data = generateProceduralTexture(256, 256);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.generateMipmap(gl.TEXTURE_2D);
        textureRef.current = tex;
    }, []);

    const buildMesh = useCallback((gl: WebGLRenderingContext, type: MeshType) => {
        const { positions, texcoords, normals, indices } = MESHES[type]();
        const pos = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, pos);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        const tex = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, tex);
        gl.bufferData(gl.ARRAY_BUFFER, texcoords, gl.STATIC_DRAW);
        const norm = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, norm);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
        const idx = gl.createBuffer()!;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        meshRef.current = { buf: { pos, tex, norm, idx }, count: indices.length };
    }, []);

    useEffect(() => {
        if (!isReady) return;
        loadShaders();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext('webgl');
        if (!gl) return;
        glRef.current = gl;
        initTexture(gl);
        buildMesh(gl, meshType);
        gl.clearColor(0.02, 0.02, 0.04, 1);
        gl.enable(gl.DEPTH_TEST);

        const quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, FS_QUAD_POSITIONS, gl.STATIC_DRAW);

        const setUniformsAndDraw = (g: WebGLRenderingContext, p: WebGLProgram, t: number) => {
            const model = mat4.rotateY(mat4.rotateX(mat4.identity(), rotationRef.current.x), rotationRef.current.y);
            const view = mat4.lookAt([0, 0, 3.5], [0, 0, 0], [0, 1, 0]);
            const proj = mat4.perspective(0.8, canvas!.width / canvas!.height, 0.1, 100);
            const mv = mat4.multiply(view, model);
            const mvp = mat4.multiply(proj, mv);
            const normalMat = mat4.inverseTranspose(model);

            const setMat4 = (name: string, val: number[]) => {
                const l = g.getUniformLocation(p, name);
                if (l) g.uniformMatrix4fv(l, false, val);
            };
            setMat4('uModelViewProjection', mvp);
            setMat4('uModelMatrix', model);
            setMat4('uNormalMatrix', normalMat);

            const tLoc = g.getUniformLocation(p, 'uTime');
            if (tLoc) g.uniform1f(tLoc, t * 0.001);
            const rLoc = g.getUniformLocation(p, 'uResolution');
            if (rLoc) g.uniform2f(rLoc, canvas!.width, canvas!.height);
            g.activeTexture(g.TEXTURE0);
            g.bindTexture(g.TEXTURE_2D, textureRef.current);
            const texLoc = g.getUniformLocation(p, 'uTexture');
            if (texLoc) g.uniform1i(texLoc, 0);

            const uv = uniformValuesRef.current;
            const ctrls = uniformControlsRef.current;
            const binds = uniformBindingsRef.current;
            for (const ctrl of ctrls) {
                let val = uv[ctrl.name];
                if (val === undefined) val = ctrl.value;
                if (binds[ctrl.name] && projectState) {
                    const bound = projectState.get(binds[ctrl.name]);
                    if (bound !== undefined) val = typeof bound === 'number' ? bound : 0.5;
                }
                const loc = g.getUniformLocation(p, ctrl.name);
                if (!loc) continue;
                switch (ctrl.glType) {
                    case 'float': g.uniform1f(loc, val as number); break;
                    case 'int': g.uniform1i(loc, Math.round(val as number)); break;
                    case 'bool': g.uniform1i(loc, (val as boolean) ? 1 : 0); break;
                    case 'vec2': g.uniform2fv(loc, val as number[]); break;
                    case 'vec3': g.uniform3fv(loc, val as number[]); break;
                    case 'vec4': g.uniform4fv(loc, val as number[]); break;
                }
            }

            const aPos = g.getAttribLocation(p, 'aPosition');
            g.bindBuffer(g.ARRAY_BUFFER, meshRef.current!.buf.pos);
            g.enableVertexAttribArray(aPos);
            g.vertexAttribPointer(aPos, 3, g.FLOAT, false, 0, 0);
            const aTex = g.getAttribLocation(p, 'aTexCoord');
            g.bindBuffer(g.ARRAY_BUFFER, meshRef.current!.buf.tex);
            g.enableVertexAttribArray(aTex);
            g.vertexAttribPointer(aTex, 2, g.FLOAT, false, 0, 0);
            const aNorm = g.getAttribLocation(p, 'aNormal');
            g.bindBuffer(g.ARRAY_BUFFER, meshRef.current!.buf.norm);
            g.enableVertexAttribArray(aNorm);
            g.vertexAttribPointer(aNorm, 3, g.FLOAT, false, 0, 0);
            g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, meshRef.current!.buf.idx);
            g.drawElements(g.TRIANGLES, meshRef.current!.count, g.UNSIGNED_SHORT, 0);
        };

        const drawQuad = (g: WebGLRenderingContext, p: WebGLProgram) => {
            const l = g.getAttribLocation(p, 'aPosition');
            g.bindBuffer(g.ARRAY_BUFFER, quadBuffer);
            g.enableVertexAttribArray(l);
            g.vertexAttribPointer(l, 2, g.FLOAT, false, 0, 0);
            g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
        };

        const renderLayerToFBO = (g: WebGLRenderingContext, layer: ShaderLayer, fbo: FBO | null, t: number) => {
            const curLayers = layersRef.current;
            const curActiveIdx = activeLayerIdxRef.current;
            const isActive = layer.id === curLayers[curActiveIdx]?.id;
            let prog = isActive ? programRef.current : null;
            if (!prog) {
                const cached = layerProgramsRef.current[layer.id];
                if (cached && cached.status === 'success') prog = cached.program;
            }
            if (!prog) {
                prog = compileShaderProgram(g, layer.code);
                if (prog) {
                    layerProgramsRef.current[layer.id] = { status: 'success', program: prog };
                }
            }
            if (!prog) return;
            if (fbo) {
                g.bindFramebuffer(g.FRAMEBUFFER, fbo.fbo);
                g.viewport(0, 0, fbo.width, fbo.height);
            } else {
                g.bindFramebuffer(g.FRAMEBUFFER, null);
                g.viewport(0, 0, canvas!.width, canvas!.height);
            }
            g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
            g.useProgram(prog);
            setUniformsAndDraw(g, prog, t);
        };

        const ensureFBO = (ref: { fbo: FBO | null }, w: number, h: number): FBO => {
            if (ref.fbo && ref.fbo.width === w && ref.fbo.height === h) return ref.fbo;
            ref.fbo = createFBO(gl, w, h);
            return ref.fbo;
        };

        const fboARef = { fbo: null as FBO | null };
        const fboBRef = { fbo: null as FBO | null };
        const fboCRef = { fbo: null as FBO | null };

        let lastFpsTime = 0;
        let fpsCount = 0;
        const renderLoop = (time: number) => {
            requestAnimationFrame(renderLoop);
            const g = glRef.current;
            if (!g) return;

            const r = rotationRef.current;
            r.y += 0.005;

            if (animPlayingRef.current) {
                const now = performance.now();
                const dt = (now - lastFrameTimeRef.current) / 1000;
                lastFrameTimeRef.current = now;
                let t = animTimeRef.current + dt;
                if (t >= animDuration) t = 0;
                animTimeRef.current = t;
                const kfs = keyframesRef.current;
                for (const [name, frames] of Object.entries(kfs)) {
                    if (!frames.length) continue;
                    const val = interpolateKeyframes(frames, t);
                    if (val !== undefined) uniformValuesRef.current[name] = val;
                }
            }

            const w = canvas!.width, h = canvas!.height;
            const curLayers = layersRef.current;
            const visibleLayers = curLayers.filter(l => l.visible);

            const bProg = bProgramRef.current;
            if (previewVersionRef.current === 'b' && bProg && snapshotBCodeRef.current) {
                g.bindFramebuffer(g.FRAMEBUFFER, null);
                g.viewport(0, 0, w, h);
                g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
                g.useProgram(bProg);
                setUniformsAndDraw(g, bProg, time);
            } else if (visibleLayers.length <= 1) {
                if (!programRef.current) return;
                g.bindFramebuffer(g.FRAMEBUFFER, null);
                g.viewport(0, 0, w, h);
                g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
                g.useProgram(programRef.current);
                setUniformsAndDraw(g, programRef.current, time);
            } else {
                const fboA = ensureFBO(fboARef, w, h);
                const fboB = ensureFBO(fboBRef, w, h);
                const fboC = ensureFBO(fboCRef, w, h);
                const blendProgs = fboCacheRef.current.blendProgs;

                for (let i = 0; i < visibleLayers.length; i++) {
                    const layer = visibleLayers[i];
                    renderLayerToFBO(g, layer, fboB, time);

                    if (i === 0) {
                        g.bindFramebuffer(g.FRAMEBUFFER, fboA.fbo);
                        g.viewport(0, 0, w, h);
                        g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
                        let blitProg = blendProgs['replace'];
                        if (!blitProg) {
                            blitProg = compileBlendProgram(g, 'replace');
                            blendProgs['replace'] = blitProg;
                        }
                        if (blitProg) {
                            g.useProgram(blitProg);
                            g.activeTexture(g.TEXTURE0);
                            g.bindTexture(g.TEXTURE_2D, fboB.tex);
                            g.uniform1i(g.getUniformLocation(blitProg, 'uTexture'), 0);
                            const qLoc = g.getAttribLocation(blitProg, 'aPosition');
                            g.bindBuffer(g.ARRAY_BUFFER, quadBuffer);
                            g.enableVertexAttribArray(qLoc);
                            g.vertexAttribPointer(qLoc, 2, g.FLOAT, false, 0, 0);
                            g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
                        }
                    } else {
                        let blendProg = blendProgs[layer.blendMode];
                        if (!blendProg) {
                            blendProg = compileBlendProgram(g, layer.blendMode);
                            blendProgs[layer.blendMode] = blendProg;
                        }
                        if (blendProg) {
                            g.bindFramebuffer(g.FRAMEBUFFER, fboC.fbo);
                            g.viewport(0, 0, w, h);
                            g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
                            g.useProgram(blendProg);
                            g.activeTexture(g.TEXTURE0);
                            g.bindTexture(g.TEXTURE_2D, fboA.tex);
                            g.uniform1i(g.getUniformLocation(blendProg, 'uAccum'), 0);
                            g.activeTexture(g.TEXTURE1);
                            g.bindTexture(g.TEXTURE_2D, fboB.tex);
                            g.uniform1i(g.getUniformLocation(blendProg, 'uTexture'), 1);
                            if (layer.blendMode !== 'replace') {
                                g.uniform1f(g.getUniformLocation(blendProg, 'uOpacity'), layer.opacity);
                            }
                            const qLoc = g.getAttribLocation(blendProg, 'aPosition');
                            g.bindBuffer(g.ARRAY_BUFFER, quadBuffer);
                            g.enableVertexAttribArray(qLoc);
                            g.vertexAttribPointer(qLoc, 2, g.FLOAT, false, 0, 0);
                            g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
                        }
                        const tmpTex = fboA.tex;
                        (fboA as any).tex = fboC.tex;
                        (fboC as any).tex = tmpTex;
                    }
                }

                g.bindFramebuffer(g.FRAMEBUFFER, null);
                g.viewport(0, 0, w, h);
                g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
                let finalProg = blendProgs['replace'];
                if (!finalProg) {
                    finalProg = compileBlendProgram(g, 'replace');
                    blendProgs['replace'] = finalProg;
                }
                if (finalProg) {
                    g.useProgram(finalProg);
                    g.activeTexture(g.TEXTURE0);
                    g.bindTexture(g.TEXTURE_2D, fboA.tex);
                    g.uniform1i(g.getUniformLocation(finalProg, 'uTexture'), 0);
                    const qLoc = g.getAttribLocation(finalProg, 'aPosition');
                    g.bindBuffer(g.ARRAY_BUFFER, quadBuffer);
                    g.enableVertexAttribArray(qLoc);
                    g.vertexAttribPointer(qLoc, 2, g.FLOAT, false, 0, 0);
                    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
                }
            }

            fpsCount++;
            if (time - lastFpsTime >= 1000) {
                setFps(fpsCount);
                setFrameTime(Math.round(1000 / fpsCount));
                fpsCount = 0;
                lastFpsTime = time;
            }
        };
        animRef.current = requestAnimationFrame(renderLoop);

        return () => cancelAnimationFrame(animRef.current);
    }, [isReady, meshVersion]);

    useEffect(() => {
        if (!shaders[currentIndex]) return;
        const s = shaders[currentIndex];
        if (prevShaderIdRef.current === s.id) return;
        prevShaderIdRef.current = s.id;
        if (s.layers?.length) {
            setLayers(s.layers);
        } else {
            const dl: ShaderLayer[] = [{
                id: 'layer_1',
                name: 'Layer 1',
                code: s.code || TEMPLATES[0].code,
                blendMode: 'replace',
                opacity: 1,
                visible: true,
            }];
            s.layers = dl;
            setLayers(dl);
        }
        setActiveLayerIdx(0);
    }, [currentIndex, shaders]);

    const activeCode = layers[activeLayerIdx]?.code ?? currentShader.code;

    useEffect(() => {
        if (currentShader && autocompile) {
            compileShader(activeCode);
        }
    }, [activeCode, autocompile]);

    useEffect(() => { layersRef.current = layers; }, [layers]);
    useEffect(() => { activeLayerIdxRef.current = activeLayerIdx; }, [activeLayerIdx]);
    useEffect(() => { previewVersionRef.current = previewVersion; }, [previewVersion]);
    useEffect(() => { snapshotBCodeRef.current = snapshotBCode; }, [snapshotBCode]);
    useEffect(() => { animPlayingRef.current = animPlaying; }, [animPlaying]);
    useEffect(() => { keyframesRef.current = keyframes; }, [keyframes]);
    useEffect(() => { animTimeRef.current = animTime; }, [animTime]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [undo, redo]);

    useEffect(() => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        if (skipUndoRef.current) return;
        debounceTimerRef.current = setTimeout(pushUndo, 800);
        return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
    }, [activeCode]);

    const loadShaders = async () => {
        try {
            const res = await fetch('/api/shaders/list');
            if (res.ok) {
                const names = await res.json();
                if (names.length > 0) {
                    const loaded = await Promise.all(names.map(async (n: string) => {
                        const r = await fetch(`/api/data/shaders/${n}.json`);
                        return r.ok ? await r.json() : null;
                    }));
                    setShaders(loaded.filter(l => l !== null));
                } else {
                    setShaders([getDefaultShader()]);
                }
            }
        } catch (e) {
            setShaders([getDefaultShader()]);
        }
    };

    const saveToServer = async () => {
        const shader = shaders[currentIndex];
        if (!shader) return;
        setIsSaving(true);
        const data = { ...shader, layers };
        try {
            await fetch('/api/assets/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: `data/shaders/${shader.name}.json`,
                    content: JSON.stringify(data, null, 2)
                })
            });
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    const getDefaultShader = (): Shader => ({
        id: 'shader_' + Date.now(),
        name: 'new_shader',
        code: TEMPLATES[0].code,
        uniforms: {},
        layers: [{
            id: 'layer_1',
            name: 'Layer 1',
            code: TEMPLATES[0].code,
            blendMode: 'replace',
            opacity: 1,
            visible: true,
        }]
    });

    const compileShader = (fragmentSource: string) => {
        const gl = glRef.current;
        if (!gl) return;
        pushUndo();
        setCompileStatus('compiling');

        try {
            const vs = gl.createShader(gl.VERTEX_SHADER)!;
            gl.shaderSource(vs, VERTEX_SHADER_SRC);
            gl.compileShader(vs);
            if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
                throw new Error('Vertex shader: ' + gl.getShaderInfoLog(vs));
            }

            const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
            gl.shaderSource(fs, fragmentSource);
            gl.compileShader(fs);
            if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
                throw new Error(gl.getShaderInfoLog(fs) || 'Fragment shader error');
            }

            const prog = gl.createProgram()!;
            gl.attachShader(prog, vs);
            gl.attachShader(prog, fs);
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
                throw new Error(gl.getProgramInfoLog(prog) || 'Link error');
            }

            gl.deleteShader(vs);
            gl.deleteShader(fs);
            if (programRef.current) gl.deleteProgram(programRef.current);
            programRef.current = prog;
            const activeLayer = layersRef.current[activeLayerIdx];
            if (activeLayer) {
                layerProgramsRef.current[activeLayer.id] = { status: 'success', program: prog };
            }
            setCompileStatus('success');
            setErrorLog('');
            const parsed = parseUniforms(fragmentSource, uniformValuesRef.current);
            setUniformControls(parsed);
            uniformControlsRef.current = parsed;
            parsed.forEach(u => { uniformValuesRef.current[u.name] = u.value; });
        } catch (e: any) {
            setCompileStatus('error');
            setErrorLog(e.message);
        }
    };

    const applyTemplate = (tpl: ShaderTemplate) => {
        pushUndo();
        const code = tpl.code;
        setLayers(prev => prev.map((l, i) => i === activeLayerIdx ? { ...l, code } : l));
        const next = [...shaders];
        next[currentIndex] = { ...next[currentIndex], code };
        setShaders(next);
        setShowTemplates(false);
    };

    const changeMesh = (type: MeshType) => {
        setMeshType(type);
        const gl = glRef.current;
        if (gl) buildMesh(gl, type);
        setMeshVersion(v => v + 1);
    };

    const captureSnapshot = () => {
        setSnapshotBCode(activeCode);
        setPreviewVersion('a');
    };

    const toggleAB = () => {
        const next = previewVersion === 'a' ? 'b' : 'a';
        setPreviewVersion(next);
        if (next === 'b' && snapshotBCode) {
            const gl = glRef.current;
            if (!gl) return;
            const prog = compileShaderProgram(gl, snapshotBCode);
            if (prog) {
                if (bProgramRef.current) gl.deleteProgram(bProgramRef.current);
                bProgramRef.current = prog;
            }
        }
    };

    const addKeyframe = (uniformName: string) => {
        const value = uniformValuesRef.current[uniformName];
        if (value === undefined) return;
        const t = animTimeRef.current;
        setKeyframes(prev => {
            const existing = (prev[uniformName] || []).filter(kf => Math.abs(kf.time - t) > 0.01);
            const updated = [...existing, { time: Math.round(t * 100) / 100, value: Array.isArray(value) ? [...value] : value }].sort((a, b) => a.time - b.time);
            return { ...prev, [uniformName]: updated };
        });
    };

    const removeKeyframe = (uniformName: string, time: number) => {
        setKeyframes(prev => {
            const updated = (prev[uniformName] || []).filter(kf => Math.abs(kf.time - time) > 0.01);
            if (updated.length === 0) {
                const next = { ...prev };
                delete next[uniformName];
                return next;
            }
            return { ...prev, [uniformName]: updated };
        });
    };

    const togglePlay = () => {
        const next = !animPlaying;
        setAnimPlaying(next);
        if (next) {
            lastFrameTimeRef.current = performance.now();
        }
    };

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        dragRef.current.dragging = true;
        dragRef.current.lastX = e.clientX;
        dragRef.current.lastY = e.clientY;
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        if (!dragRef.current.dragging) return;
        const dx = e.clientX - dragRef.current.lastX;
        const dy = e.clientY - dragRef.current.lastY;
        dragRef.current.lastX = e.clientX;
        dragRef.current.lastY = e.clientY;
        rotationRef.current.x += dy * 0.01;
        rotationRef.current.y += dx * 0.01;
    };

    const handleCanvasMouseUp = () => {
        dragRef.current.dragging = false;
    };

    const updateUniform = (name: string, value: any) => {
        uniformValuesRef.current[name] = value;
        setUniformControls(prev => prev.map(u => u.name === name ? { ...u, value } : u));
    };

    const toggleBinding = (uniformName: string) => {
        if (uniformBindingsRef.current[uniformName]) {
            const n = { ...uniformBindingsRef.current };
            delete n[uniformName];
            uniformBindingsRef.current = n;
            setUniformBindings(n);
            return;
        }
        const key = prompt('Enter project state key to bind:');
        if (key && key.trim()) {
            const n = { ...uniformBindingsRef.current, [uniformName]: key.trim() };
            uniformBindingsRef.current = n;
            setUniformBindings(n);
        }
    };

    const categories = TEMPLATES.reduce((acc, t) => {
        if (!acc.includes(t.category)) acc.push(t.category);
        return acc;
    }, [] as string[]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "'VT323', monospace" }}>
            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
            <div id="menubar" style={{ height: '32px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 15px', fontFamily: "'VT323', monospace" }}>
                <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginRight: '20px' }}>
                    <Eye size={15} style={{ marginRight: '8px', display: 'inline' }} /> SHADER LAB v2.5
                </div>
            </div>

            <div id="toolbar" style={{ height: '44px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '8px', fontFamily: "'VT323', monospace" }}>
                <button className="tool-btn" onClick={() => compileShader(activeCode)} title="Compile"><Play size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }} />
                <button className="tool-btn" onClick={saveToServer} disabled={isSaving} title="Save"><Save size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }} />
                <button className="tool-btn" onClick={undo} disabled={undoIndexRef.current <= 0} title="Undo (Ctrl+Z)" style={{ fontSize: '0.7rem', padding: '4px 8px', width: 'auto' }}>↩</button>
                <button className="tool-btn" onClick={redo} disabled={undoIndexRef.current >= undoStackRef.current.length - 1} title="Redo (Ctrl+Shift+Z)" style={{ fontSize: '0.7rem', padding: '4px 8px', width: 'auto' }}>↪</button>
                <div style={{ width: '1px', height: '20px', background: '#333' }} />
                <button className="tool-btn" onClick={() => { setShowTemplates(true); setSearchQuery(''); setSelectedCategory(null); }} title="Templates"><LayoutGrid size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }} />
                <button className="tool-btn" onClick={() => setShaders([...shaders, getDefaultShader()])} title="New Shader"><Plus size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <List size={14} style={{ color: '#888' }} />
                    <select
                        value={meshType}
                        onChange={e => changeMesh(e.target.value as MeshType)}
                        style={{ width: 'auto', padding: '3px 6px', fontSize: '0.85rem', background: '#111', border: '1px solid #444', color: '#aaa', borderRadius: '0px', fontFamily: "'VT323', monospace", cursor: 'pointer' }}
                    >
                        {Object.entries(MESH_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                </div>
                <div style={{ width: '1px', height: '20px', background: '#333' }} />
                <button
                    className="tool-btn"
                    onClick={captureSnapshot}
                    title="Capture snapshot B"
                    style={{ fontSize: '0.7rem', padding: '4px 8px', width: 'auto', color: previewVersion === 'b' ? 'var(--accent)' : '#888' }}
                >B✔</button>
                {snapshotBCode && (
                    <button
                        className="tool-btn"
                        onClick={toggleAB}
                        title="Toggle A/B preview"
                        style={{
                            fontSize: '0.7rem', padding: '4px 8px', width: 'auto',
                            background: previewVersion === 'b' ? '#1a1a2a' : undefined,
                            borderColor: previewVersion === 'b' ? 'var(--accent)' : undefined,
                            color: previewVersion === 'b' ? 'var(--accent)' : '#888',
                        }}
                    >{previewVersion === 'a' ? 'A' : 'B'}↔</button>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px', paddingRight: '10px', fontFamily: "'VT323', monospace" }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#888', fontSize: '0.85rem', cursor: 'pointer', margin: 0 }}>
                        <input type="checkbox" checked={autocompile} onChange={e => setAutocompile(e.target.checked)} style={{ width: 'auto' }} />
                        AUTO
                    </label>
                    {layers.filter(l => l.visible).length > 1 && <div style={{ color: 'var(--accent)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Eye size={13} /> {layers.filter(l => l.visible).length}L</div>}
                    {compileStatus === 'success' && <div style={{ color: '#2ecc71', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={14} /> READY</div>}
                    {compileStatus === 'error' && <div style={{ color: '#e74c3c', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={14} /> ERROR</div>}
                    {compileStatus === 'compiling' && <div style={{ color: 'var(--accent)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}><RefreshCw size={14} className="spin" /> COMPILING...</div>}
                    {fps > 0 && <div style={{ color: '#666', fontSize: '0.8rem' }}>{fps} FPS ({frameTime}ms)</div>}
                </div>
            </div>

            <div style={{ flexGrow: 1, display: 'flex', overflow: 'hidden', fontFamily: "'VT323', monospace" }}>
                <Sidebar
                    title="SHADERS"
                    items={shaders}
                    currentIndex={currentIndex}
                    onSelect={setCurrentIndex}
                    renderItem={(s, active) => (
                        <div style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            background: active ? '#111' : 'transparent',
                            color: active ? 'var(--accent)' : '#888',
                            borderBottom: '1px solid #1a1a1a',
                            fontFamily: "'VT323', monospace",
                            fontSize: '1rem',
                        }}>{s.name}</div>
                    )}
                />

                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ flexGrow: 1, position: 'relative' }}>
                        <Editor
                            height="100%"
                            language="cpp"
                            theme="vs-dark"
                            value={activeCode}
                            onChange={(val) => {
                                const code = val || '';
                                setLayers(prev => prev.map((l, i) => i === activeLayerIdx ? { ...l, code } : l));
                                const next = [...shaders];
                                next[currentIndex].code = code;
                                setShaders(next);
                            }}
                            options={{
                                fontSize: 14,
                                fontFamily: "'JetBrains Mono', 'Consolas', monospace",
                                minimap: { enabled: false },
                                padding: { top: 20 }
                            }}
                        />
                    </div>
                    {compileStatus === 'error' && (
                        <div style={{
                            height: '80px', background: '#1a0505', borderTop: '2px solid #e74c3c',
                            color: '#ffaaaa', padding: '8px 12px', fontSize: '0.9rem',
                            overflowY: 'auto', fontFamily: "'VT323', monospace"
                        }}>
                            <div style={{ color: '#e74c3c', marginBottom: '4px' }}>// COMPILE ERROR</div>
                            {errorMsg}
                        </div>
                    )}
                </div>

                <div className="panel" style={{ width: '400px', borderLeft: '1px solid #333' }}>
                    <div className="panel-header">
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Box size={14} /> PREVIEW</span>
                        <span style={{ fontSize: '0.75rem', color: '#666' }}>drag to orbit</span>
                    </div>
                    <div style={{ padding: '16px', display: 'flex', justifyContent: 'center', background: '#000', position: 'relative' }}>
                        <canvas
                            ref={canvasRef}
                            width={360}
                            height={300}
                            onMouseDown={handleCanvasMouseDown}
                            onMouseMove={handleCanvasMouseMove}
                            onMouseUp={handleCanvasMouseUp}
                            onMouseLeave={handleCanvasMouseUp}
                            style={{ border: '1px solid ' + (previewVersion === 'b' ? '#e67e22' : '#222'), borderRadius: '4px', cursor: 'grab', maxWidth: '100%' }}
                        />
                        {previewVersion === 'b' && (
                            <div style={{
                                position: 'absolute', top: '20px', right: '20px',
                                background: '#e67e22', color: '#000', fontSize: '0.7rem',
                                fontWeight: 'bold', padding: '2px 6px', borderRadius: '0px',
                                fontFamily: "'VT323', monospace", letterSpacing: '1px',
                            }}>SNAPSHOT B</div>
                        )}
                    </div>
                    <div className="panel-header" style={{ borderTop: '1px solid #333', cursor: 'pointer' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Eye size={14} /> LAYERS</span>
                        <span style={{ fontSize: '0.75rem', color: '#666' }}>{layers.length}</span>
                    </div>
                    <div className="panel-content" style={{ gap: '4px', fontSize: '0.8rem', padding: '8px' }}>
                        {layers.map((layer, i) => (
                            <div
                                key={layer.id}
                                onClick={() => setActiveLayerIdx(i)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px',
                                    background: i === activeLayerIdx ? '#1a1a2a' : 'transparent',
                                    border: '1px solid ' + (i === activeLayerIdx ? 'var(--accent)' : '#222'),
                                    borderRadius: '0px', cursor: 'pointer',
                                }}
                            >
                                <button
                                    onClick={e => { e.stopPropagation(); pushUndo(); setLayers(prev => prev.map((l, j) => j === i ? { ...l, visible: !l.visible } : l)); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: layer.visible ? 'var(--accent)' : '#444', padding: 0, width: 'auto' }}
                                    title={layer.visible ? 'Hide' : 'Show'}
                                >{layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}</button>
                                <input
                                    value={layer.name}
                                    onChange={e => { pushUndo(); setLayers(prev => prev.map((l, j) => j === i ? { ...l, name: e.target.value } : l)); }}
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                        flexGrow: 1, background: 'none', border: 'none', color: i === activeLayerIdx ? '#fff' : '#888',
                                        fontSize: '0.8rem', fontFamily: "'VT323', monospace", outline: 'none', padding: 0, minWidth: 0, width: 'auto',
                                    }}
                                />
                                <select
                                    value={layer.blendMode}
                                    onChange={e => { pushUndo(); setLayers(prev => prev.map((l, j) => j === i ? { ...l, blendMode: e.target.value as BlendMode } : l)); }}
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                        fontSize: '0.65rem', background: '#111', border: '1px solid #333', color: '#aaa',
                                        borderRadius: '2px', padding: '1px 3px', fontFamily: "'VT323', monospace", width: 'auto', cursor: 'pointer',
                                    }}
                                >
                                    <option value="replace">REPL</option>
                                    <option value="normal">NORM</option>
                                    <option value="multiply">MUL</option>
                                    <option value="screen">SCRN</option>
                                    <option value="add">ADD</option>
                                </select>
                                <input
                                    type="range" min={0} max={1} step={0.05}
                                    value={layer.opacity}
                                    onChange={e => { pushUndo(); setLayers(prev => prev.map((l, j) => j === i ? { ...l, opacity: parseFloat(e.target.value) } : l)); }}
                                    onClick={e => e.stopPropagation()}
                                    style={{ width: '40px', padding: 0, height: '4px', cursor: 'pointer' }}
                                    title={`Opacity: ${Math.round(layer.opacity * 100)}%`}
                                />
                                <span style={{ color: '#555', fontSize: '0.65rem', minWidth: '20px', textAlign: 'right' }}>{Math.round(layer.opacity * 100)}%</span>
                            </div>
                        ))}
                        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                            <button
                                onClick={() => {
                                    pushUndo();
                                    const newLayer: ShaderLayer = {
                                        id: 'layer_' + Date.now(),
                                        name: 'Layer ' + (layers.length + 1),
                                        code: layers[activeLayerIdx]?.code || TEMPLATES[0].code,
                                        blendMode: 'normal',
                                        opacity: 1,
                                        visible: true,
                                    };
                                    setLayers(prev => [...prev, newLayer]);
                                }}
                                className="tool-btn" style={{ fontSize: '0.7rem', padding: '3px 8px', width: 'auto' }}
                                title="Add Layer"
                            ><Plus size={12} /></button>
                            <button
                                onClick={() => {
                                    if (layers.length <= 1) return;
                                    pushUndo();
                                    setLayers(prev => prev.filter((_, i) => i !== activeLayerIdx));
                                    setActiveLayerIdx(prev => Math.min(prev, layers.length - 2));
                                }}
                                className="tool-btn" style={{ fontSize: '0.7rem', padding: '3px 8px', width: 'auto' }}
                                disabled={layers.length <= 1}
                                title="Remove Layer"
                            ><Trash2 size={12} /></button>
                            <button
                                onClick={() => {
                                    const src = layers[activeLayerIdx];
                                    if (!src) return;
                                    pushUndo();
                                    const copy: ShaderLayer = { ...src, id: 'layer_' + Date.now(), name: src.name + ' Copy' };
                                    setLayers(prev => [...prev, copy]);
                                    setActiveLayerIdx(layers.length);
                                }}
                                className="tool-btn" style={{ fontSize: '0.7rem', padding: '3px 8px', width: 'auto' }}
                                title="Duplicate Layer"
                            ><Copy size={12} /></button>
                            <button
                                onClick={() => {
                                    if (activeLayerIdx <= 0) return;
                                    pushUndo();
                                    setLayers(prev => { const n = [...prev]; [n[activeLayerIdx - 1], n[activeLayerIdx]] = [n[activeLayerIdx], n[activeLayerIdx - 1]]; return n; });
                                    setActiveLayerIdx(prev => prev - 1);
                                }}
                                className="tool-btn" style={{ fontSize: '0.7rem', padding: '3px 8px', width: 'auto' }}
                                disabled={activeLayerIdx <= 0}
                                title="Move Up"
                            ><ChevronUp size={12} /></button>
                            <button
                                onClick={() => {
                                    if (activeLayerIdx >= layers.length - 1) return;
                                    pushUndo();
                                    setLayers(prev => { const n = [...prev]; [n[activeLayerIdx], n[activeLayerIdx + 1]] = [n[activeLayerIdx + 1], n[activeLayerIdx]]; return n; });
                                    setActiveLayerIdx(prev => prev + 1);
                                }}
                                className="tool-btn" style={{ fontSize: '0.7rem', padding: '3px 8px', width: 'auto' }}
                                disabled={activeLayerIdx >= layers.length - 1}
                                title="Move Down"
                            ><ChevronDown size={12} /></button>
                        </div>
                    </div>
                    <div className="panel-header" style={{ borderTop: '1px solid #333' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Sliders size={14} /> UNIFORMS</span>
                        <span style={{ fontSize: '0.75rem', color: '#666' }}>{uniformControls.length}</span>
                    </div>
                    <div className="panel-content" style={{ gap: '8px', fontSize: '0.85rem' }}>
                        {uniformControls.length === 0 && (
                            <div style={{ color: '#666', fontSize: '0.85rem', fontStyle: 'italic', fontFamily: "'VT323', monospace" }}>
                                No tweakable uniforms detected. Add <span style={{ color: '#888' }}>uniform float uMyVar;</span> to your shader.
                            </div>
                        )}
                        {uniformControls.map(ctrl => (
                            <div key={ctrl.name} style={{ background: '#111', border: '1px solid #222', borderRadius: '4px', padding: '8px 10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <span style={{ color: 'var(--accent)', fontFamily: "'VT323', monospace", display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {ctrl.name}
                                        <button
                                            onClick={() => {
                                                const existing = keyframes[ctrl.name] || [];
                                                const atTime = existing.find(kf => Math.abs(kf.time - animTime) < 0.01);
                                                if (atTime) {
                                                    removeKeyframe(ctrl.name, atTime.time);
                                                } else {
                                                    addKeyframe(ctrl.name);
                                                }
                                            }}
                                            style={{
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                color: (keyframes[ctrl.name] || []).length > 0 ? 'var(--accent)' : '#444',
                                                fontSize: '0.7rem', padding: '0 2px', width: 'auto',
                                                lineHeight: 1, opacity: 0.6,
                                            }}
                                            title="Toggle keyframe at current time"
                                        >◆</button>
                                    </span>
                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                        <span style={{ color: '#555', fontSize: '0.7rem', fontFamily: "'VT323', monospace" }}>{ctrl.glType}</span>
                                        <button
                                            onClick={() => toggleBinding(ctrl.name)}
                                            style={{
                                                background: uniformBindings[ctrl.name] ? '#2ecc71' : '#222',
                                                border: '1px solid ' + (uniformBindings[ctrl.name] ? '#2ecc71' : '#444'),
                                                color: uniformBindings[ctrl.name] ? '#000' : '#888',
                                                borderRadius: '0px', cursor: 'pointer', fontSize: '0.65rem',
                                                padding: '1px 6px', width: 'auto', fontFamily: "'VT323', monospace"
                                            }}
                                            title={uniformBindings[ctrl.name] ? `Bound to: ${uniformBindings[ctrl.name]}` : 'Bind to project state'}
                                        >{uniformBindings[ctrl.name] ? 'BOUND' : 'BIND'}</button>
                                    </div>
                                </div>
                                {uniformBindings[ctrl.name] && (
                                    <div style={{ color: '#2ecc71', fontSize: '0.7rem', marginBottom: '4px', fontFamily: "'VT323', monospace" }}>
                                        → {uniformBindings[ctrl.name]}
                                    </div>
                                )}
                                {ctrl.glType === 'float' && (() => {
                                    const [min, max] = rangeFromHint(ctrl.hint);
                                    const val = uniformValuesRef.current[ctrl.name] as number ?? ctrl.value as number;
                                    return (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input type="range" min={min} max={max} step={(max - min) / 100}
                                                value={val}
                                                onChange={e => updateUniform(ctrl.name, parseFloat(e.target.value))}
                                                style={{ flexGrow: 1, width: 'auto', padding: 0, height: '6px', cursor: 'pointer' }} />
                                            <span style={{ color: '#aaa', minWidth: '40px', textAlign: 'right', fontFamily: "'VT323', monospace" }}>{val.toFixed(2)}</span>
                                        </div>
                                    );
                                })()}
                                {ctrl.glType === 'int' && (() => {
                                    const [min, max] = rangeFromHint(ctrl.hint);
                                    const val = uniformValuesRef.current[ctrl.name] as number ?? ctrl.value as number;
                                    return (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input type="range" min={min} max={max} step={1}
                                                value={val}
                                                onChange={e => updateUniform(ctrl.name, parseInt(e.target.value))}
                                                style={{ flexGrow: 1, width: 'auto', padding: 0, height: '6px', cursor: 'pointer' }} />
                                            <span style={{ color: '#aaa', minWidth: '40px', textAlign: 'right', fontFamily: "'VT323', monospace" }}>{Math.round(val)}</span>
                                        </div>
                                    );
                                })()}
                                {ctrl.glType === 'bool' && (
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, color: '#aaa' }}>
                                        <input type="checkbox"
                                            checked={uniformValuesRef.current[ctrl.name] as boolean ?? ctrl.value as boolean}
                                            onChange={e => updateUniform(ctrl.name, e.target.checked)}
                                            style={{ width: 'auto' }} />
                                        {uniformValuesRef.current[ctrl.name] as boolean ?? ctrl.value as boolean ? 'ENABLED' : 'DISABLED'}
                                    </label>
                                )}
                                {ctrl.glType === 'vec3' && (() => {
                                    const isColor = ctrl.hint.toLowerCase().includes('color');
                                    const val = uniformValuesRef.current[ctrl.name] as number[] ?? ctrl.value as number[];
                                    if (isColor) {
                                        const hex = vec3ToHex(val);
                                        return (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input type="color" value={hex}
                                                    onChange={e => updateUniform(ctrl.name, hexToVec3(e.target.value))}
                                                    style={{ width: '36px', height: '28px', padding: 0, border: 'none', cursor: 'pointer' }} />
                                                <span style={{ color: '#aaa', fontFamily: "'VT323', monospace" }}>{hex}</span>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            {['R', 'G', 'B'].map((ch, i) => (
                                                <div key={ch} style={{ flex: 1 }}>
                                                    <div style={{ color: '#666', fontSize: '0.65rem', fontFamily: "'VT323', monospace" }}>{ch}</div>
                                                    <input type="range" min={0} max={1} step={0.01}
                                                        value={val[i]}
                                                        onChange={e => { const nv = [...val]; nv[i] = parseFloat(e.target.value); updateUniform(ctrl.name, nv); }}
                                                        style={{ width: '100%', padding: 0, height: '5px', cursor: 'pointer' }} />
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                                {ctrl.glType === 'vec2' && (() => {
                                    const val = uniformValuesRef.current[ctrl.name] as number[] ?? ctrl.value as number[];
                                    return (
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            {['X', 'Y'].map((ch, i) => (
                                                <div key={ch} style={{ flex: 1 }}>
                                                    <div style={{ color: '#666', fontSize: '0.65rem', fontFamily: "'VT323', monospace" }}>{ch}</div>
                                                    <input type="range" min={0} max={1} step={0.01}
                                                        value={val[i]}
                                                        onChange={e => { const nv = [...val]; nv[i] = parseFloat(e.target.value); updateUniform(ctrl.name, nv); }}
                                                        style={{ width: '100%', padding: 0, height: '5px', cursor: 'pointer' }} />
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                        ))}
                    </div>
                    <div className="panel-header" style={{ borderTop: '1px solid #333' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>⏱ ANIMATION</span>
                        <span style={{ fontSize: '0.75rem', color: '#666' }}>
                            {Object.keys(keyframes).length} KF
                        </span>
                    </div>
                    <div className="panel-content" style={{ gap: '8px', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                                onClick={togglePlay}
                                className="tool-btn"
                                style={{ fontSize: '0.7rem', padding: '4px 8px', width: 'auto', minWidth: '32px' }}
                                title={animPlaying ? 'Pause' : 'Play'}
                            >{animPlaying ? '⏸' : '▶'}</button>
                            <span style={{ color: '#aaa', fontFamily: "'VT323', monospace", fontSize: '0.85rem' }}>
                                {animTime.toFixed(2)}s / {animDuration}s
                            </span>
                        </div>
                        <div style={{ position: 'relative', height: '24px', background: '#111', border: '1px solid #222', borderRadius: '0px', marginTop: '4px' }}>
                            <input
                                type="range" min={0} max={animDuration} step={0.01}
                                value={animTime}
                                onChange={e => {
                                    const t = parseFloat(e.target.value);
                                    setAnimTime(t);
                                    animTimeRef.current = t;
                                    const kfs = keyframesRef.current;
                                    for (const [name, frames] of Object.entries(kfs)) {
                                        if (!frames.length) continue;
                                        const val = interpolateKeyframes(frames, t);
                                        if (val !== undefined) uniformValuesRef.current[name] = val;
                                    }
                                }}
                                style={{
                                    width: '100%', height: '100%', padding: 0, margin: 0,
                                    position: 'absolute', top: 0, left: 0, opacity: 0, cursor: 'pointer',
                                }}
                            />
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                                {Object.entries(keyframes).map(([uniformName, kfs]) =>
                                    kfs.map((kf, i) => (
                                        <div
                                            key={`${uniformName}-${i}`}
                                            onClick={() => removeKeyframe(uniformName, kf.time)}
                                            style={{
                                                position: 'absolute',
                                                left: `${(kf.time / animDuration) * 100}%`,
                                                top: '50%',
                                                transform: 'translate(-50%, -50%)',
                                                width: '8px', height: '8px',
                                                background: 'var(--accent)',
                                                clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                                                cursor: 'pointer',
                                                pointerEvents: 'auto',
                                            }}
                                            title={`${uniformName} @ ${kf.time.toFixed(2)}s`}
                                        />
                                    ))
                                )}
                            </div>
                            <div style={{
                                position: 'absolute', top: 0, bottom: 0, width: '2px',
                                left: `${(animTime / animDuration) * 100}%`,
                                background: '#e67e22', pointerEvents: 'none',
                            }} />
                        </div>
                    </div>
                </div>
            </div>

            {showTemplates && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'VT323', monospace"
                }} onClick={() => setShowTemplates(false)}>
                    <div style={{
                        background: '#0d0d14', border: '1px solid #2a2a3a', borderRadius: '8px',
                        maxHeight: '80vh', width: '640px', overflow: 'hidden',
                        display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.6)'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{
                            padding: '12px 16px', borderBottom: '1px solid #2a2a3a',
                            color: 'var(--accent)', fontSize: '1.2rem', display: 'flex',
                            justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <span>SHADER TEMPLATES</span>
                            <button
                                onClick={() => setShowTemplates(false)}
                                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2rem', width: 'auto', padding: '0 4px' }}
                            >✕</button>
                        </div>
                        <div style={{ padding: '8px 12px', borderBottom: '1px solid #1a1a2a' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: '#111', border: '1px solid #333', borderRadius: '4px',
                                padding: '6px 10px',
                            }}>
                                <Search size={14} style={{ color: '#666', flexShrink: 0 }} />
                                <input
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search templates..."
                                    style={{
                                        flexGrow: 1, background: 'none', border: 'none', color: '#ccc',
                                        fontSize: '0.9rem', fontFamily: "'VT323', monospace", outline: 'none',
                                        width: 'auto', padding: 0,
                                    }}
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '0.8rem', width: 'auto', padding: '0 2px' }}
                                    >✕</button>
                                )}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', padding: '8px 12px', borderBottom: '1px solid #1a1a2a', overflowX: 'auto', flexShrink: 0 }}>
                            <button
                                onClick={() => setSelectedCategory(null)}
                                style={{
                                    background: selectedCategory === null ? '#1a1a2a' : 'transparent',
                                    border: '1px solid ' + (selectedCategory === null ? 'var(--accent)' : '#333'),
                                    color: selectedCategory === null ? 'var(--accent)' : '#888',
                                    borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem',
                                    padding: '4px 10px', whiteSpace: 'nowrap', fontFamily: "'VT323', monospace",
                                    width: 'auto',
                                }}
                            >ALL</button>
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    style={{
                                        background: selectedCategory === cat ? '#1a1a2a' : 'transparent',
                                        border: '1px solid ' + (selectedCategory === cat ? 'var(--accent)' : '#333'),
                                        color: selectedCategory === cat ? 'var(--accent)' : '#888',
                                        borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem',
                                        padding: '4px 10px', whiteSpace: 'nowrap', fontFamily: "'VT323', monospace",
                                        width: 'auto',
                                    }}
                                >{cat.toUpperCase()}</button>
                            ))}
                        </div>
                        <div style={{ overflowY: 'auto', padding: '12px' }}>
                            {(() => {
                                const filtered = TEMPLATES.filter(t =>
                                    (!selectedCategory || t.category === selectedCategory) &&
                                    (!searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.desc.toLowerCase().includes(searchQuery.toLowerCase()))
                                );
                                if (filtered.length === 0) {
                                    return (
                                        <div style={{ color: '#666', textAlign: 'center', padding: '40px 0', fontSize: '1rem' }}>
                                            No templates match "{searchQuery}"
                                        </div>
                                    );
                                }
                                const grouped: Record<string, ShaderTemplate[]> = {};
                                filtered.forEach(t => {
                                    if (!grouped[t.category]) grouped[t.category] = [];
                                    grouped[t.category].push(t);
                                });
                                return Object.entries(grouped).map(([cat, tmpls]) => (
                                    <div key={cat} style={{ marginBottom: '16px' }}>
                                        <div style={{
                                            color: '#666', fontSize: '0.85rem', textTransform: 'uppercase',
                                            letterSpacing: '1px', marginBottom: '8px', paddingLeft: '4px'
                                        }}>{cat} ({tmpls.length})</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                            {tmpls.map(tpl => (
                                                <div
                                                    key={tpl.id}
                                                    onClick={() => applyTemplate(tpl)}
                                                    style={{
                                                        padding: '8px 10px', cursor: 'pointer', borderRadius: '4px',
                                                        background: '#111', border: '1px solid #1a1a2a',
                                                        color: '#ccc', fontSize: '0.9rem', transition: 'all 0.1s',
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = '#1a1a2a'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = '#111'; e.currentTarget.style.borderColor = '#1a1a2a'; }}
                                                >
                                                    <div style={{ color: 'var(--accent)', fontSize: '0.95rem' }}>{tpl.name}</div>
                                                    <div style={{ color: '#666', fontSize: '0.75rem' }}>{tpl.desc}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ));
                            })()}
                        </div>
                        <div style={{
                            padding: '8px 16px', borderTop: '1px solid #2a2a3a',
                            color: '#555', fontSize: '0.8rem', textAlign: 'center'
                        }}>
                            {TEMPLATES.length} TEMPLATES AVAILABLE
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ShaderEditor;
