import{n as e}from"./src-DIW-7cXR.js";import{$ as t,A as n,Bt as r,E as i,Et as a,F as o,Gt as s,It as c,Lt as l,O as u,P as d,Rt as f,Yt as p,b as m,et as h,m as g,vt as _,yt as v}from"./vendor-icons-CZgmVDNG.js";import{n as y,t as b}from"./vendor-react-ClDXkOod.js";import{t as ee}from"./useStudio-DwBcAuKB.js";import{t as te}from"./Sidebar-Dvw7ojES.js";import{r as x,t as ne}from"./vendor-monaco-CnyFxxEI.js";var S=e(y()),C=e(p()),w=b();x.config({paths:{vs:`/lib/monaco/vs`}});var re=`precision mediump float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec4 col = texture2D(uTexture, vTexCoord);
    gl_FragColor = col;
}`,T=[{id:`basic`,name:`Basic Lit`,category:`Basic`,desc:`Diffuse lighting with texture`,code:`precision highp float;
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
}`},{id:`flat`,name:`Flat Texture`,category:`Basic`,desc:`Unlit texture passthrough`,code:`precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
void main() {
    gl_FragColor = texture2D(uTexture, vTexCoord);
}`},{id:`crt`,name:`CRT Monitor`,category:`2D Effects`,desc:`Scanline + vignette CRT effect`,code:`precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uResolution;
void main() {
    vec2 res = uResolution.x > 0.0 ? uResolution : vec2(800.0, 600.0);
    vec2 uv = vTexCoord;
    vec4 col = texture2D(uTexture, uv);
    float scanline = sin(uv.y * res.y * 0.5) * 0.08;
    float vig = 1.0 - length(uv - 0.5) * 0.6;
    gl_FragColor = vec4((col.rgb - scanline) * vig, 1.0);
}`},{id:`wave`,name:`Wave Distort`,category:`2D Effects`,desc:`Sinusoidal UV distortion`,code:`precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uTime;
void main() {
    vec2 uv = vTexCoord;
    uv.x += sin(uv.y * 20.0 + uTime * 2.0) * 0.03;
    uv.y += cos(uv.x * 15.0 + uTime * 1.7) * 0.02;
    gl_FragColor = texture2D(uTexture, uv);
}`},{id:`chromatic`,name:`Chromatic Aberration`,category:`2D Effects`,desc:`RGB channel offset`,code:`precision highp float;
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
}`},{id:`glitch`,name:`Digital Glitch`,category:`2D Effects`,desc:`Random glitch bars with color shift`,code:`precision highp float;
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
}`},{id:`pixelate`,name:`Pixelate`,category:`2D Effects`,desc:`Blocky pixelation effect`,code:`precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uTime;
void main() {
    vec2 res = uResolution.x > 0.0 ? uResolution : vec2(800.0, 600.0);
    float size = 16.0 + sin(uTime) * 8.0;
    vec2 uv = floor(vTexCoord * res / size) * size / res;
    gl_FragColor = texture2D(uTexture, uv);
}`},{id:`kaleidoscope`,name:`Kaleidoscope`,category:`2D Effects`,desc:`Mirrored segment kaleidoscope`,code:`precision highp float;
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
}`},{id:`bloom`,name:`Bloom`,category:`2D Effects`,desc:`Simple glow/bloom effect`,code:`precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uTime;
void main() {
    vec2 res = uResolution.x > 0.0 ? uResolution : vec2(800.0, 600.0);
    vec4 c = texture2D(uTexture, vTexCoord);
    vec2 px = 1.0 / res;
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
}`},{id:`edge-detect`,name:`Edge Detection`,category:`2D Effects`,desc:`Sobel-like edge detection`,code:`precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform vec2 uResolution;
void main() {
    vec2 res = uResolution.x > 0.0 ? uResolution : vec2(800.0, 600.0);
    vec2 px = 1.0 / res;
    float c = texture2D(uTexture, vTexCoord).r;
    float l = texture2D(uTexture, vTexCoord + vec2(-px.x, 0.0)).r;
    float r = texture2D(uTexture, vTexCoord + vec2(px.x, 0.0)).r;
    float u = texture2D(uTexture, vTexCoord + vec2(0.0, px.y)).r;
    float d = texture2D(uTexture, vTexCoord + vec2(0.0, -px.y)).r;
    float e = length(vec2(l - r, u - d));
    e = smoothstep(0.1, 0.6, e);
    vec4 col = texture2D(uTexture, vTexCoord);
    gl_FragColor = vec4(mix(col.rgb, vec3(1.0), e * 0.7), 1.0);
}`},{id:`blur`,name:`Box Blur`,category:`2D Effects`,desc:`Simple averaging blur`,code:`precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform vec2 uResolution;
void main() {
    vec2 res = uResolution.x > 0.0 ? uResolution : vec2(800.0, 600.0);
    vec2 px = 1.0 / res;
    vec4 col = vec4(0.0);
    for (int x = -3; x <= 3; x++) {
        for (int y = -3; y <= 3; y++) {
            col += texture2D(uTexture, vTexCoord + vec2(float(x), float(y)) * px * 1.5);
        }
    }
    gl_FragColor = col / 49.0;
}`},{id:`sharpen`,name:`Sharpen`,category:`2D Effects`,desc:`Sharpening kernel filter`,code:`precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform vec2 uResolution;
void main() {
    vec2 res = uResolution.x > 0.0 ? uResolution : vec2(800.0, 600.0);
    vec2 px = 1.0 / res;
    vec4 c = texture2D(uTexture, vTexCoord);
    vec4 l = texture2D(uTexture, vTexCoord + vec2(-px.x, 0.0));
    vec4 r = texture2D(uTexture, vTexCoord + vec2(px.x, 0.0));
    vec4 u = texture2D(uTexture, vTexCoord + vec2(0.0, -px.y));
    vec4 d = texture2D(uTexture, vTexCoord + vec2(0.0, px.y));
    gl_FragColor = c * 2.0 - (l + r + u + d) * 0.5;
}`},{id:`emboss`,name:`Emboss`,category:`2D Effects`,desc:`3D emboss relief effect`,code:`precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform vec2 uResolution;
void main() {
    vec2 res = uResolution.x > 0.0 ? uResolution : vec2(800.0, 600.0);
    vec2 px = 1.0 / res;
    float c = texture2D(uTexture, vTexCoord).r;
    float tr = texture2D(uTexture, vTexCoord + px).r;
    float bl = texture2D(uTexture, vTexCoord - px).r;
    float d = (c - tr) + (c - bl) + 0.5;
    gl_FragColor = vec4(vec3(d), 1.0);
}`},{id:`vignette`,name:`Vignette`,category:`2D Effects`,desc:`Darkened corners`,code:`precision highp float;
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
}`},{id:`scanlines`,name:`Scanlines`,category:`2D Effects`,desc:`Horizontal CRT scanline overlay`,code:`precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uTime;
void main() {
    vec2 res = uResolution.x > 0.0 ? uResolution : vec2(800.0, 600.0);
    vec4 col = texture2D(uTexture, vTexCoord);
    float scan = abs(sin(vTexCoord.y * res.y * 0.5 + uTime * 5.0)) * 0.15;
    gl_FragColor = vec4(col.rgb * (1.0 - scan), 1.0);
}`},{id:`rgb-split`,name:`RGB Split Glitch`,category:`2D Effects`,desc:`RGB channel separation glitch`,code:`precision highp float;
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
}`},{id:`invert`,name:`Invert`,category:`2D Effects`,desc:`Full color inversion`,code:`precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
void main() {
    vec4 col = texture2D(uTexture, vTexCoord);
    gl_FragColor = vec4(1.0 - col.rgb, 1.0);
}`},{id:`grayscale`,name:`Grayscale`,category:`2D Effects`,desc:`Desaturation to black and white`,code:`precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
void main() {
    vec4 col = texture2D(uTexture, vTexCoord);
    float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    gl_FragColor = vec4(vec3(gray), 1.0);
}`},{id:`sepia`,name:`Sepia Tone`,category:`2D Effects`,desc:`Warm vintage sepia look`,code:`precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
void main() {
    vec4 col = texture2D(uTexture, vTexCoord);
    float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    vec3 sepia = vec3(gray) * vec3(1.2, 0.9, 0.6);
    gl_FragColor = vec4(mix(col.rgb, sepia, 0.8), 1.0);
}`},{id:`posterize`,name:`Posterize`,category:`2D Effects`,desc:`Color quantization / posterization`,code:`precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
void main() {
    vec4 col = texture2D(uTexture, vTexCoord);
    float levels = 4.0;
    col.rgb = floor(col.rgb * levels) / levels;
    gl_FragColor = col;
}`},{id:`toon`,name:`Toon Shading`,category:`3D Materials`,desc:`Cel-shading with quantized lighting`,code:`precision highp float;
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
}`},{id:`hologram`,name:`Hologram`,category:`3D Materials`,desc:`Scanline holographic projection`,code:`precision highp float;
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
}`},{id:`water`,name:`Animated Water`,category:`3D Materials`,desc:`Fresnel-based animated water material`,code:`precision highp float;
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
}`},{id:`outline`,name:`Cartoon Outline`,category:`3D Materials`,desc:`Edge outline effect`,code:`precision highp float;
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
}`},{id:`glass`,name:`Frosted Glass`,category:`3D Materials`,desc:`Fresnel-based glass transparency`,code:`precision highp float;
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
}`},{id:`fog`,name:`Distance Fog`,category:`3D Materials`,desc:`Depth-based fog blending`,code:`precision highp float;
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
}`},{id:`heat-vision`,name:`Heat Vision`,category:`3D Materials`,desc:`Thermal/infrared vision effect`,code:`precision highp float;
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
}`},{id:`night-vision`,name:`Night Vision`,category:`3D Materials`,desc:`Green-tinted night vision effect`,code:`precision highp float;
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
}`},{id:`acid-trip`,name:`Acid Trip`,category:`Psychedelic`,desc:`Psychedelic color warp`,code:`precision highp float;
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
}`},{id:`matrix`,name:`Matrix Rain`,category:`Psychedelic`,desc:`Digital matrix rain effect`,code:`precision highp float;
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
}`},{id:`warp`,name:`Space Warp`,category:`Psychedelic`,desc:`Hyperspace star warp effect`,code:`precision highp float;
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
}`},{id:`halftone`,name:`Halftone`,category:`2D Effects`,desc:`Comic-book halftone dot pattern`,code:`precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uTime;
void main() {
    vec2 res = uResolution.x > 0.0 ? uResolution : vec2(800.0, 600.0);
    vec4 col = texture2D(uTexture, vTexCoord);
    float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    vec2 grid = vTexCoord * res / 12.0;
    float dotSize = 0.5 + gray * 0.5;
    float d = length(fract(grid) - 0.5);
    float pattern = smoothstep(dotSize * 0.5, dotSize * 0.4, d);
    vec3 cmyk = col.rgb * pattern + (1.0 - pattern) * 0.95;
    gl_FragColor = vec4(cmyk, 1.0);
}`},{id:`dither`,name:`Dither`,category:`2D Effects`,desc:`Bayer ordered dithering`,code:`precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform vec2 uResolution;
void main() {
    vec2 res = uResolution.x > 0.0 ? uResolution : vec2(800.0, 600.0);
    vec4 col = texture2D(uTexture, vTexCoord);
    float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    vec2 pos = mod(floor(vTexCoord * res / 4.0), 4.0);
    float bayer = (pos.x + pos.y * 4.0) / 16.0;
    float dithered = step(bayer, gray);
    gl_FragColor = vec4(vec3(dithered), 1.0);
}`},{id:`swirl`,name:`Swirl`,category:`2D Effects`,desc:`Polar-coordinate texture swirl`,code:`precision highp float;
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
}`},{id:`rain`,name:`Rain Streaks`,category:`3D Materials`,desc:`Rain drops sliding across a surface`,code:`precision highp float;
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
}`},{id:`lava`,name:`Lava`,category:`3D Materials`,desc:`Glowing lava with noise distortion`,code:`precision highp float;
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
}`},{id:`plasma`,name:`Plasma`,category:`Procedural`,desc:`Classic sine-wave plasma`,code:`precision highp float;
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
}`},{id:`voronoi`,name:`Voronoi`,category:`Procedural`,desc:`Animated Voronoi cell pattern`,code:`precision highp float;
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
}`},{id:`domain-warp`,name:`Domain Warp`,category:`Procedural`,desc:`Fluid noise domain warping`,code:`precision highp float;
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
}`},{id:`mandelbrot`,name:`Mandelbrot`,category:`Procedural`,desc:`Mandelbrot fractal viewer`,code:`precision highp float;
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
}`},{id:`starfield`,name:`Starfield`,category:`Procedural`,desc:`Hyperspace warp-speed stars`,code:`precision highp float;
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
}`},{id:`nebula`,name:`Nebula`,category:`Procedural`,desc:`Layered FBM space nebula with stars`,code:`precision highp float;
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
}`},{id:`aurora`,name:`Aurora`,category:`Procedural`,desc:`Aurora borealis curtain effect`,code:`precision highp float;
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
}`},{id:`fire`,name:`Fire`,category:`Procedural`,desc:`Noise-based procedural fire`,code:`precision highp float;
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
}`},{id:`tunnel`,name:`3D Tunnel`,category:`Procedural`,desc:`Infinite perspective tunnel`,code:`precision highp float;
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
}`},{id:`sdf`,name:`SDF Raymarch`,category:`Procedural`,desc:`Raymarched SDF primitives (sphere, box, torus)`,code:`precision highp float;
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
}`}],ie=`
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
`;function ae(e,t,n){let r=[],i=[],a=[],o=[];for(let o=0;o<=n;o++){let s=o*Math.PI/n;for(let c=0;c<=t;c++){let l=c*2*Math.PI/t,u=e*Math.sin(s)*Math.cos(l),d=e*Math.cos(s),f=e*Math.sin(s)*Math.sin(l);r.push(u,d,f),a.push(u/e,d/e,f/e),i.push(c/t,o/n)}}for(let e=0;e<n;e++)for(let n=0;n<t;n++){let r=e*(t+1)+n,i=r+t+1;o.push(r,i,r+1,i,i+1,r+1)}return{positions:new Float32Array(r),texcoords:new Float32Array(i),normals:new Float32Array(a),indices:new Uint16Array(o)}}function E(e){let t=e/2,n=[[-t,-t,t],[t,-t,t],[t,t,t],[-t,t,t],[-t,-t,-t],[-t,t,-t],[t,t,-t],[t,-t,-t],[-t,t,-t],[-t,t,t],[t,t,t],[t,t,-t],[-t,-t,-t],[t,-t,-t],[t,-t,t],[-t,-t,t],[t,-t,-t],[t,t,-t],[t,t,t],[t,-t,t],[-t,-t,-t],[-t,-t,t],[-t,t,t],[-t,t,-t]],r=[[0,1],[1,1],[1,0],[0,0],[0,1],[1,1],[1,0],[0,0],[0,0],[0,1],[1,1],[1,0],[0,0],[0,1],[1,1],[1,0],[1,0],[1,1],[0,1],[0,0],[0,0],[1,0],[1,1],[0,1]],i=[[0,0,1],[0,0,1],[0,0,1],[0,0,1],[0,0,-1],[0,0,-1],[0,0,-1],[0,0,-1],[0,1,0],[0,1,0],[0,1,0],[0,1,0],[0,-1,0],[0,-1,0],[0,-1,0],[0,-1,0],[1,0,0],[1,0,0],[1,0,0],[1,0,0],[-1,0,0],[-1,0,0],[-1,0,0],[-1,0,0]],a=[0,1,2,0,2,3],o=[],s=[],c=[],l=[];for(let e=0;e<6;e++){let t=e*4;for(let e=0;e<4;e++){let a=t+e;o.push(...n[a]),s.push(...r[a]),c.push(...i[a])}for(let e=0;e<6;e++)l.push(t+a[e])}return{positions:new Float32Array(o),texcoords:new Float32Array(s),normals:new Float32Array(c),indices:new Uint16Array(l)}}function oe(e,t,n,r){let i=[],a=[],o=[],s=[];for(let s=0;s<=n;s++){let c=s/n*2*Math.PI;for(let l=0;l<=r;l++){let u=l/r*2*Math.PI,d=(e+t*Math.cos(u))*Math.cos(c),f=(e+t*Math.cos(u))*Math.sin(c),p=t*Math.sin(u);i.push(d,f,p);let m=Math.cos(u)*Math.cos(c),h=Math.cos(u)*Math.sin(c),g=Math.sin(u);o.push(m,h,g),a.push(s/n,l/r)}}for(let e=0;e<n;e++)for(let t=0;t<r;t++){let n=e*(r+1)+t,i=n+r+1;s.push(n,i,n+1,i,i+1,n+1)}return{positions:new Float32Array(i),texcoords:new Float32Array(a),normals:new Float32Array(o),indices:new Uint16Array(s)}}var D={identity:()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],multiply:(e,t)=>{let n=[];for(let r=0;r<4;r++)for(let i=0;i<4;i++){let a=0;for(let n=0;n<4;n++)a+=e[r*4+n]*t[n*4+i];n.push(a)}return n},perspective:(e,t,n,r)=>{let i=1/Math.tan(e/2);return[i/t,0,0,0,0,i,0,0,0,0,(r+n)/(n-r),-1,0,0,2*r*n/(n-r),0]},lookAt:(e,t,n)=>{let r=[t[0]-e[0],t[1]-e[1],t[2]-e[2]],i=Math.sqrt(r[0]*r[0]+r[1]*r[1]+r[2]*r[2]);r[0]/=i,r[1]/=i,r[2]/=i;let a=[r[1]*n[2]-r[2]*n[1],r[2]*n[0]-r[0]*n[2],r[0]*n[1]-r[1]*n[0]],o=Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]);a[0]/=o,a[1]/=o,a[2]/=o;let s=[a[1]*r[2]-a[2]*r[1],a[2]*r[0]-a[0]*r[2],a[0]*r[1]-a[1]*r[0]];return[a[0],s[0],-r[0],0,a[1],s[1],-r[1],0,a[2],s[2],-r[2],0,-a[0]*e[0]-a[1]*e[1]-a[2]*e[2],-s[0]*e[0]-s[1]*e[1]-s[2]*e[2],r[0]*e[0]+r[1]*e[1]+r[2]*e[2],1]},rotateX:(e,t)=>{let n=Math.cos(t),r=Math.sin(t),i=D.identity();return i[5]=n,i[6]=-r,i[9]=r,i[10]=n,D.multiply(e,i)},rotateY:(e,t)=>{let n=Math.cos(t),r=Math.sin(t),i=D.identity();return i[0]=n,i[2]=r,i[8]=-r,i[10]=n,D.multiply(e,i)},inverseTranspose:e=>{let t=e,n=[],r=t[0]*(t[5]*t[10]-t[6]*t[9])-t[1]*(t[4]*t[10]-t[6]*t[8])+t[2]*(t[4]*t[9]-t[5]*t[8]);if(Math.abs(r)<1e-10)return D.identity();let i=1/r;n[0]=(t[5]*t[10]-t[6]*t[9])*i,n[1]=(t[2]*t[9]-t[1]*t[10])*i,n[2]=(t[1]*t[6]-t[2]*t[5])*i,n[3]=0,n[4]=(t[6]*t[8]-t[4]*t[10])*i,n[5]=(t[0]*t[10]-t[2]*t[8])*i,n[6]=(t[2]*t[4]-t[0]*t[6])*i,n[7]=0,n[8]=(t[4]*t[9]-t[5]*t[8])*i,n[9]=(t[1]*t[8]-t[0]*t[9])*i,n[10]=(t[0]*t[5]-t[1]*t[4])*i,n[11]=0,n[12]=0,n[13]=0,n[14]=0,n[15]=1;let a=[];for(let e=0;e<4;e++)for(let t=0;t<4;t++)a[t*4+e]=n[e*4+t];return a}};function se(e,t,n){let r=e.createTexture();e.bindTexture(e.TEXTURE_2D,r),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,t,n,0,e.RGBA,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE);let i=e.createFramebuffer();return e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,r,0),e.bindFramebuffer(e.FRAMEBUFFER,null),{fbo:i,tex:r,width:t,height:n}}var ce=`
attribute vec2 aPosition;
varying vec2 vTexCoord;
void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
    vTexCoord = aPosition * 0.5 + 0.5;
}
`,le={replace:`precision highp float; varying vec2 vTexCoord; uniform sampler2D uTexture; void main() { gl_FragColor = texture2D(uTexture, vTexCoord); }`,normal:`precision highp float; varying vec2 vTexCoord; uniform sampler2D uTexture; uniform sampler2D uAccum; uniform float uOpacity; void main() { vec4 a = texture2D(uAccum, vTexCoord); vec4 b = texture2D(uTexture, vTexCoord); gl_FragColor = mix(a, b, uOpacity); }`,multiply:`precision highp float; varying vec2 vTexCoord; uniform sampler2D uTexture; uniform sampler2D uAccum; uniform float uOpacity; void main() { vec4 a = texture2D(uAccum, vTexCoord); vec4 b = texture2D(uTexture, vTexCoord); gl_FragColor = mix(a, vec4(a.rgb * b.rgb, 1.0), uOpacity); }`,screen:`precision highp float; varying vec2 vTexCoord; uniform sampler2D uTexture; uniform sampler2D uAccum; uniform float uOpacity; void main() { vec4 a = texture2D(uAccum, vTexCoord); vec4 b = texture2D(uTexture, vTexCoord); vec3 s = 1.0 - (1.0 - a.rgb) * (1.0 - b.rgb); gl_FragColor = mix(a, vec4(s, 1.0), uOpacity); }`,add:`precision highp float; varying vec2 vTexCoord; uniform sampler2D uTexture; uniform sampler2D uAccum; uniform float uOpacity; void main() { vec4 a = texture2D(uAccum, vTexCoord); vec4 b = texture2D(uTexture, vTexCoord); gl_FragColor = mix(a, vec4(min(a.rgb + b.rgb, 1.0), 1.0), uOpacity); }`};function ue(e,t){let n=e.createShader(e.VERTEX_SHADER);e.shaderSource(n,ce),e.compileShader(n);let r=e.createShader(e.FRAGMENT_SHADER);e.shaderSource(r,le[t]),e.compileShader(r);let i=e.createProgram();return e.attachShader(i,n),e.attachShader(i,r),e.linkProgram(i),e.getProgramParameter(i,e.LINK_STATUS)?i:null}var de=new Float32Array([-1,-1,1,-1,-1,1,1,1]);function fe(e,t){let n=new Uint8Array(e*t*4);for(let r=0;r<t;r++)for(let i=0;i<e;i++){let a=(r*e+i)*4,o=i/e-.5,s=r/t-.5,c=Math.floor(i/32)+Math.floor(r/32),l=.2+.8*(c%2==0),u=.2+.8*(c%3==0),d=.3+.7*Math.abs(Math.sin(o*20)*Math.cos(s*20));n[a]=Math.floor(l*255),n[a+1]=Math.floor(u*255),n[a+2]=Math.floor(d*255),n[a+3]=255}return n}var pe={sphere:()=>ae(1,32,32),cube:()=>E(1.5),torus:()=>oe(1,.4,20,16)},me={sphere:`Sphere`,cube:`Cube`,torus:`Torus`};function he(e,t){let n=new Set([`uTexture`,`uTime`,`uResolution`,`uModelViewProjection`,`uModelMatrix`,`uNormalMatrix`,`uMouse`,`uCameraPosition`]),r=[],i=/uniform\s+(float|int|bool|vec2|vec3|vec4|sampler2D)\s+(\w+)\s*;(?:\s*\/\/\s*(.*))?/g,a;for(;(a=i.exec(e))!==null;){let e=a[1],i=a[2];if(n.has(i))continue;let o=(a[3]||``).trim(),s=t[i];s===void 0&&(s=O(e,o)),r.push({glType:e,name:i,hint:o,value:s})}return r}function O(e,t){let n=t.toLowerCase().includes(`color`);switch(e){case`float`:return .5;case`int`:return 1;case`bool`:return!1;case`vec2`:return[.5,.5];case`vec3`:return n?[1,0,0]:[.5,.5,.5];case`vec4`:return n?[1,0,0,1]:[.5,.5,.5,1];default:return .5}}function ge(e){let t=e.match(/\[([\d.]+)\s*,\s*([\d.]+)\]/);return t?[parseFloat(t[1]),parseFloat(t[2])]:[0,1]}function _e(e){return`#`+[Math.round(Math.max(0,Math.min(1,e[0]))*255),Math.round(Math.max(0,Math.min(1,e[1]))*255),Math.round(Math.max(0,Math.min(1,e[2]))*255)].map(e=>e.toString(16).padStart(2,`0`)).join(``)}function ve(e){return[parseInt(e.slice(1,3),16)/255,parseInt(e.slice(3,5),16)/255,parseInt(e.slice(5,7),16)/255]}function ye(e,t){let n=e.createShader(e.VERTEX_SHADER);if(e.shaderSource(n,ie),e.compileShader(n),!e.getShaderParameter(n,e.COMPILE_STATUS))return null;let r=e.createShader(e.FRAGMENT_SHADER);if(e.shaderSource(r,t),e.compileShader(r),!e.getShaderParameter(r,e.COMPILE_STATUS))return null;let i=e.createProgram();return e.attachShader(i,n),e.attachShader(i,r),e.linkProgram(i),e.getProgramParameter(i,e.LINK_STATUS)?(e.deleteShader(n),e.deleteShader(r),i):null}function be(e,t){if(e.length!==0){if(e.length===1||t<=e[0].time)return e[0].value;if(t>=e[e.length-1].time)return e[e.length-1].value;for(let n=0;n<e.length-1;n++){let r=e[n],i=e[n+1];if(t>=r.time&&t<i.time){let e=(t-r.time)/(i.time-r.time);return typeof r.value==`number`?r.value+(i.value-r.value)*e:Array.isArray(r.value)?r.value.map((t,n)=>t+(i.value[n]-t)*e):r.value}}return e[e.length-1].value}}var k={accent:`#ff0000`,accentSoft:`rgba(255, 0, 0, 0.08)`,bgRoot:`#050608`,bgDeep:`#080a0f`,bgPanel:`#12151c`,bgPanelAlt:`#0d0f14`,bgHover:`#1a1d26`,border:`#2a2f3a`,borderMute:`#1a1d26`,textMain:`#f0f2f5`,textDim:`#8a8f9d`,textMute:`#4f5565`,danger:`#ff4d4d`,ok:`#00cc66`,retroIn:`inset 2px 2px 0 rgba(0,0,0,0.5)`,retroOut:`2px 2px 0 rgba(0,0,0,0.5)`};S.createRoot(document.getElementById(`root`)).render((0,w.jsx)(C.StrictMode,{children:(0,w.jsx)(()=>{let{isReady:e,projectState:p,eventBus:y}=ee(),[b,x]=(0,C.useState)([]),[S,ae]=(0,C.useState)(0),[E,oe]=(0,C.useState)(`idle`),[ce,le]=(0,C.useState)(!1),[O,A]=(0,C.useState)(null),[xe,Se]=(0,C.useState)(``),[Ce,we]=(0,C.useState)(!1),[Te,Ee]=(0,C.useState)(`sphere`),[De,Oe]=(0,C.useState)(0),[ke,Ae]=(0,C.useState)(!0),je=(0,C.useRef)(null),j=(0,C.useRef)(null),M=(0,C.useRef)(null),[Me,Ne]=(0,C.useState)([]),[N,Pe]=(0,C.useState)({}),[Fe,Ie]=(0,C.useState)(0),[Le,Re]=(0,C.useState)(0),P=(0,C.useRef)(null),ze=(0,C.useRef)(null),F=(0,C.useRef)({x:.3,y:0}),I=(0,C.useRef)({dragging:!1,lastX:0,lastY:0}),Be=(0,C.useRef)(0),L=(0,C.useRef)({}),Ve=(0,C.useRef)([]),R=(0,C.useRef)({});(0,C.useRef)({frames:0,lastTime:0});let[z,B]=(0,C.useState)(()=>{let e=b[0];return e?.layers?.length?e.layers:[{id:`layer_1`,name:`Layer 1`,code:e?.code||T[0].code,blendMode:`replace`,opacity:1,visible:!0}]}),[V,H]=(0,C.useState)(0),He=(0,C.useRef)(0),Ue=(0,C.useRef)(``),We=(0,C.useRef)([]),[Ge,Ke]=(0,C.useState)({}),qe=(0,C.useRef)({}),Je=(0,C.useRef)({fboA:null,fboB:null,quadProg:null,blendProgs:{}}),[U,Ye]=(0,C.useState)(null),[W,Xe]=(0,C.useState)(`a`),Ze=(0,C.useRef)(null),Qe=(0,C.useRef)(`a`),$e=(0,C.useRef)(null),[G,et]=(0,C.useState)(``),[K,tt]=(0,C.useState)(null),nt=(0,C.useRef)([]),q=(0,C.useRef)(-1),rt=(0,C.useRef)(null),it=(0,C.useRef)(!1),[at,ot]=(0,C.useState)(!1),[J,st]=(0,C.useState)(0),ct=(0,C.useRef)(0),[Y,lt]=(0,C.useState)({}),ut=(0,C.useRef)({}),dt=(0,C.useRef)(0),ft=(0,C.useRef)(!1),[pt,mt]=(0,C.useState)(null),X=(0,C.useCallback)(()=>{let e={layers:JSON.parse(JSON.stringify(z)),activeLayerIdx:V},t=nt.current,n=q.current;t.splice(n+1,t.length-n-1),t.push(e),t.length>50&&t.shift(),q.current=t.length-1},[z,V]),ht=(0,C.useCallback)(()=>{if(q.current<=0)return;--q.current;let e=nt.current[q.current];e&&(it.current=!0,B(e.layers),H(e.activeLayerIdx),setTimeout(()=>{it.current=!1},0))},[]),gt=(0,C.useCallback)(()=>{if(q.current>=nt.current.length-1)return;q.current+=1;let e=nt.current[q.current];e&&(it.current=!0,B(e.layers),H(e.activeLayerIdx),setTimeout(()=>{it.current=!1},0))},[]),_t=(0,C.useRef)({});T.forEach(e=>{_t.current[e.id]=e.code});let vt=b[S]||{id:`empty`,name:`untitled`,code:T[0].code,uniforms:{}},yt=(0,C.useCallback)(e=>{let t=e.createTexture();e.bindTexture(e.TEXTURE_2D,t);let n=fe(256,256);e.texImage2D(e.TEXTURE_2D,0,e.RGBA,256,256,0,e.RGBA,e.UNSIGNED_BYTE,n),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR_MIPMAP_LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.REPEAT),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.REPEAT),e.generateMipmap(e.TEXTURE_2D),ze.current=t},[]),bt=(0,C.useCallback)((e,t)=>{let{positions:n,texcoords:r,normals:i,indices:a}=pe[t](),o=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,o),e.bufferData(e.ARRAY_BUFFER,n,e.STATIC_DRAW);let s=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,s),e.bufferData(e.ARRAY_BUFFER,r,e.STATIC_DRAW);let c=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,c),e.bufferData(e.ARRAY_BUFFER,i,e.STATIC_DRAW);let l=e.createBuffer();e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,l),e.bufferData(e.ELEMENT_ARRAY_BUFFER,a,e.STATIC_DRAW),P.current={buf:{pos:o,tex:s,norm:c,idx:l},count:a.length}},[]);(0,C.useEffect)(()=>{if(!e)return;xt();let t=je.current;if(!t)return;let n=t.getContext(`webgl`);if(!n)return;j.current=n,yt(n),bt(n,Te),n.clearColor(.02,.02,.04,1),n.enable(n.DEPTH_TEST);let r=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,r),n.bufferData(n.ARRAY_BUFFER,de,n.STATIC_DRAW);let i=(e,n,r)=>{let i=D.rotateY(D.rotateX(D.identity(),F.current.x),F.current.y),a=D.lookAt([0,0,3.5],[0,0,0],[0,1,0]),o=D.perspective(.8,t.width/t.height,.1,100),s=D.multiply(a,i),c=D.multiply(o,s),l=D.inverseTranspose(i),u=(t,r)=>{let i=e.getUniformLocation(n,t);i&&e.uniformMatrix4fv(i,!1,r)};u(`uModelViewProjection`,c),u(`uModelMatrix`,i),u(`uNormalMatrix`,l);let d=e.getUniformLocation(n,`uTime`);d&&e.uniform1f(d,r*.001);let f=e.getUniformLocation(n,`uResolution`);f&&e.uniform2f(f,t.width,t.height),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,ze.current);let m=e.getUniformLocation(n,`uTexture`);m&&e.uniform1i(m,0);let h=L.current,g=Ve.current,_=R.current;for(let t of g){let r=h[t.name];if(r===void 0&&(r=t.value),_[t.name]&&p){let e=p.get(_[t.name]);e!==void 0&&(r=typeof e==`number`?e:.5)}let i=e.getUniformLocation(n,t.name);if(i)switch(t.glType){case`float`:e.uniform1f(i,r);break;case`int`:e.uniform1i(i,Math.round(r));break;case`bool`:e.uniform1i(i,+!!r);break;case`vec2`:e.uniform2fv(i,r);break;case`vec3`:e.uniform3fv(i,r);break;case`vec4`:e.uniform4fv(i,r);break}}let v=e.getAttribLocation(n,`aPosition`);e.bindBuffer(e.ARRAY_BUFFER,P.current.buf.pos),e.enableVertexAttribArray(v),e.vertexAttribPointer(v,3,e.FLOAT,!1,0,0);let y=e.getAttribLocation(n,`aTexCoord`);e.bindBuffer(e.ARRAY_BUFFER,P.current.buf.tex),e.enableVertexAttribArray(y),e.vertexAttribPointer(y,2,e.FLOAT,!1,0,0);let b=e.getAttribLocation(n,`aNormal`);e.bindBuffer(e.ARRAY_BUFFER,P.current.buf.norm),e.enableVertexAttribArray(b),e.vertexAttribPointer(b,3,e.FLOAT,!1,0,0),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,P.current.buf.idx),e.drawElements(e.TRIANGLES,P.current.count,e.UNSIGNED_SHORT,0)},a=(e,n,r,a)=>{let o=We.current,s=He.current,c=n.id===o[s]?.id?M.current:null;if(!c){let e=qe.current[n.id];e&&e.status===`success`&&(c=e.program)}c||(c=ye(e,n.code),c&&(qe.current[n.id]={status:`success`,program:c})),c&&(r?(e.bindFramebuffer(e.FRAMEBUFFER,r.fbo),e.viewport(0,0,r.width,r.height)):(e.bindFramebuffer(e.FRAMEBUFFER,null),e.viewport(0,0,t.width,t.height)),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT),e.useProgram(c),i(e,c,a))},o=(e,t,r)=>(e.fbo&&e.fbo.width===t&&e.fbo.height===r||(e.fbo=se(n,t,r)),e.fbo),s={fbo:null},c={fbo:null},l={fbo:null},u=!1,d=0,f=0,m=0,h=e=>{if(u)return;Be.current=requestAnimationFrame(h);let n=j.current;if(!n)return;let p=F.current;if(p.y+=.005,ft.current){let e=performance.now(),t=(e-dt.current)/1e3;dt.current=e;let n=ct.current+t;n>=5&&(n=0),ct.current=n,e-m>=50&&(m=e,st(n));let r=ut.current;for(let[e,t]of Object.entries(r)){if(!t.length)continue;let r=be(t,n);r!==void 0&&(L.current[e]=r)}}let g=t.width,_=t.height,v=We.current.filter(e=>e.visible),y=Ze.current;if(Qe.current===`b`&&y&&$e.current)n.bindFramebuffer(n.FRAMEBUFFER,null),n.viewport(0,0,g,_),n.clear(n.COLOR_BUFFER_BIT|n.DEPTH_BUFFER_BIT),n.useProgram(y),i(n,y,e);else if(v.length<=1){if(!M.current)return;n.bindFramebuffer(n.FRAMEBUFFER,null),n.viewport(0,0,g,_),n.clear(n.COLOR_BUFFER_BIT|n.DEPTH_BUFFER_BIT),n.useProgram(M.current),i(n,M.current,e)}else{let t=o(s,g,_),i=o(c,g,_),u=o(l,g,_),d=Je.current.blendProgs,f=t,p=u;for(let t=0;t<v.length;t++){let o=v[t];if(a(n,o,i,e),t===0){n.bindFramebuffer(n.FRAMEBUFFER,f.fbo),n.viewport(0,0,g,_),n.clear(n.COLOR_BUFFER_BIT|n.DEPTH_BUFFER_BIT);let e=d.replace;if(e||(e=ue(n,`replace`),d.replace=e),e){n.useProgram(e),n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,i.tex),n.uniform1i(n.getUniformLocation(e,`uTexture`),0);let t=n.getAttribLocation(e,`aPosition`);n.bindBuffer(n.ARRAY_BUFFER,r),n.enableVertexAttribArray(t),n.vertexAttribPointer(t,2,n.FLOAT,!1,0,0),n.drawArrays(n.TRIANGLE_STRIP,0,4)}}else{let e=d[o.blendMode];if(e||(e=ue(n,o.blendMode),d[o.blendMode]=e),e){n.bindFramebuffer(n.FRAMEBUFFER,p.fbo),n.viewport(0,0,g,_),n.clear(n.COLOR_BUFFER_BIT|n.DEPTH_BUFFER_BIT),n.useProgram(e),n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,f.tex),n.uniform1i(n.getUniformLocation(e,`uAccum`),0),n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,i.tex),n.uniform1i(n.getUniformLocation(e,`uTexture`),1),o.blendMode!==`replace`&&n.uniform1f(n.getUniformLocation(e,`uOpacity`),o.opacity);let t=n.getAttribLocation(e,`aPosition`);n.bindBuffer(n.ARRAY_BUFFER,r),n.enableVertexAttribArray(t),n.vertexAttribPointer(t,2,n.FLOAT,!1,0,0),n.drawArrays(n.TRIANGLE_STRIP,0,4)}let t=f;f=p,p=t}}n.bindFramebuffer(n.FRAMEBUFFER,null),n.viewport(0,0,g,_),n.clear(n.COLOR_BUFFER_BIT|n.DEPTH_BUFFER_BIT);let m=d.replace;if(m||(m=ue(n,`replace`),d.replace=m),m){n.useProgram(m),n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,f.tex),n.uniform1i(n.getUniformLocation(m,`uTexture`),0);let e=n.getAttribLocation(m,`aPosition`);n.bindBuffer(n.ARRAY_BUFFER,r),n.enableVertexAttribArray(e),n.vertexAttribPointer(e,2,n.FLOAT,!1,0,0),n.drawArrays(n.TRIANGLE_STRIP,0,4)}}f++,e-d>=1e3&&(Ie(f),Re(f>0?Math.round(1e3/f):0),f=0,d=e)};return Be.current=requestAnimationFrame(h),()=>{u=!0,cancelAnimationFrame(Be.current)}},[e,De]),(0,C.useEffect)(()=>{if(!b[S])return;let e=b[S];if(Ue.current!==e.id){if(Ue.current=e.id,e.layers?.length)B(e.layers);else{let t=[{id:`layer_1`,name:`Layer 1`,code:e.code||T[0].code,blendMode:`replace`,opacity:1,visible:!0}];e.layers=t,B(t)}H(0)}},[S,b]);let Z=z[V]?.code??vt.code;(0,C.useEffect)(()=>{vt&&ke&&Tt(Z)},[Z,ke]),(0,C.useEffect)(()=>{We.current=z},[z]),(0,C.useEffect)(()=>{He.current=V},[V]),(0,C.useEffect)(()=>{Qe.current=W},[W]),(0,C.useEffect)(()=>{$e.current=U},[U]),(0,C.useEffect)(()=>{ft.current=at},[at]),(0,C.useEffect)(()=>{ut.current=Y},[Y]),(0,C.useEffect)(()=>{ct.current=J},[J]),(0,C.useEffect)(()=>{let e=e=>{(e.ctrlKey||e.metaKey)&&e.key===`z`&&!e.shiftKey&&(e.preventDefault(),ht()),(e.ctrlKey||e.metaKey)&&e.key===`z`&&e.shiftKey&&(e.preventDefault(),gt())};return window.addEventListener(`keydown`,e),()=>window.removeEventListener(`keydown`,e)},[ht,gt]),(0,C.useEffect)(()=>{if(rt.current&&clearTimeout(rt.current),!it.current)return rt.current=setTimeout(X,800),()=>{rt.current&&clearTimeout(rt.current)}},[Z]);let xt=async()=>{try{let e=await fetch(`/api/shaders/list`);if(e.ok){let t=await e.json();if(Array.isArray(t)&&t.length>0){let e=(await Promise.all(t.map(async e=>{let t=await fetch(`/api/shaders/${encodeURIComponent(e)}`);if(!t.ok)return null;let n=await t.text();return{id:`shader_`+e,name:e,savedName:e,code:n,uniforms:{},layers:[{id:`layer_1`,name:`Layer 1`,code:n,blendMode:`replace`,opacity:1,visible:!0}]}}))).filter(e=>e!==null);x(e.length>0?e:[Q()])}else x([Q()])}else x([Q()])}catch{x([Q()])}},St=async(e=!0)=>{let t=b[S];if(!t)return;let n=(t.name||``).trim().replace(/[^a-zA-Z0-9._-]+/g,`_`);if(!n){A(`INVALID NAME`);return}le(!0),A(`SAVING...`);try{let t=await fetch(`/api/shaders/save`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({name:n,content:Z})});if(!t.ok){let n=await t.json().catch(()=>({}));A(n?.error||`SAVE FAILED (${t.status})`),e&&alert(n?.error||`SAVE FAILED (${t.status})`);return}x(e=>e.map((e,t)=>t===S?{...e,name:n,savedName:n,code:Z,layers:z}:e)),A(`SAVED`),setTimeout(()=>A(null),2e3)}catch(t){console.error(t),A(`SAVE ERROR`),e&&alert(`SAVE ERROR`)}finally{le(!1)}},Ct=async()=>{let e=b[S];if(!e||!confirm(`Delete shader "${e.name}"?`))return;let t=e.savedName||e.name;if(e.savedName)try{let e=await fetch(`/api/shaders/${encodeURIComponent(t)}`,{method:`DELETE`});if(e.status===404){let n=t.endsWith(`.frag`)?t:`${t}.frag`;e=await fetch(`/api/ide/delete`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({path:`data/shaders/${n}`})})}if(!e.ok&&e.status!==404){alert(`DELETE FAILED (${e.status})`);return}}catch{alert(`DELETE FAILED`);return}let n=b.filter((e,t)=>t!==S),r=n.length>0?n:[Q()];Ue.current=``,x(r),ae(Math.max(0,Math.min(S-1,r.length-1)))},wt=(0,C.useRef)(St);wt.current=St,(0,C.useEffect)(()=>{let e=e=>{(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()===`s`&&(e.preventDefault(),wt.current(!0))};window.addEventListener(`keydown`,e);let t=y?.on(`system:global_save`,()=>{wt.current(!1)});return()=>{window.removeEventListener(`keydown`,e),t&&y?.off&&y.off(`system:global_save`,t)}},[y]);let Q=()=>({id:`shader_`+Date.now(),name:`new_shader`,code:re,uniforms:{},layers:[{id:`layer_1`,name:`Layer 1`,code:re,blendMode:`replace`,opacity:1,visible:!0}]}),Tt=e=>{let t=j.current;if(t){X(),oe(`compiling`);try{let n=t.createShader(t.VERTEX_SHADER);if(t.shaderSource(n,ie),t.compileShader(n),!t.getShaderParameter(n,t.COMPILE_STATUS))throw Error(`Vertex shader: `+t.getShaderInfoLog(n));let r=t.createShader(t.FRAGMENT_SHADER);if(t.shaderSource(r,e),t.compileShader(r),!t.getShaderParameter(r,t.COMPILE_STATUS))throw Error(t.getShaderInfoLog(r)||`Fragment shader error`);let i=t.createProgram();if(t.attachShader(i,n),t.attachShader(i,r),t.linkProgram(i),!t.getProgramParameter(i,t.LINK_STATUS))throw Error(t.getProgramInfoLog(i)||`Link error`);t.deleteShader(n),t.deleteShader(r),M.current&&t.deleteProgram(M.current),M.current=i;let a=We.current[V];a&&(qe.current[a.id]={status:`success`,program:i}),oe(`success`),Se(``);let o=he(e,L.current);Ne(o),Ve.current=o,o.forEach(e=>{L.current[e.name]=e.value})}catch(e){oe(`error`),Se(e.message)}}},Et=e=>{X();let t=e.code;B(e=>e.map((e,n)=>n===V?{...e,code:t}:e));let n=[...b];n[S]={...n[S],code:t},x(n),we(!1)},Dt=e=>{Ee(e);let t=j.current;t&&bt(t,e),Oe(e=>e+1)},Ot=()=>{Ye(Z),Xe(`a`)},kt=()=>{let e=W===`a`?`b`:`a`;if(Xe(e),e===`b`&&U){let e=j.current;if(!e)return;let t=ye(e,U);t&&(Ze.current&&e.deleteProgram(Ze.current),Ze.current=t)}},At=e=>{let t=L.current[e];if(t===void 0)return;let n=ct.current;lt(r=>{let i=[...(r[e]||[]).filter(e=>Math.abs(e.time-n)>.01),{time:Math.round(n*100)/100,value:Array.isArray(t)?[...t]:t}].sort((e,t)=>e.time-t.time);return{...r,[e]:i}})},jt=(e,t)=>{lt(n=>{let r=(n[e]||[]).filter(e=>Math.abs(e.time-t)>.01);if(r.length===0){let t={...n};return delete t[e],t}return{...n,[e]:r}})},Mt=()=>{let e=!at;ot(e),e&&(dt.current=performance.now())},Nt=e=>{I.current.dragging=!0,I.current.lastX=e.clientX,I.current.lastY=e.clientY},Pt=e=>{if(!I.current.dragging)return;let t=e.clientX-I.current.lastX,n=e.clientY-I.current.lastY;I.current.lastX=e.clientX,I.current.lastY=e.clientY,F.current.x+=n*.01,F.current.y+=t*.01},Ft=()=>{I.current.dragging=!1},$=(e,t)=>{L.current[e]=t,Ne(n=>n.map(n=>n.name===e?{...n,value:t}:n))},It=e=>{if(R.current[e]){let t={...R.current};delete t[e],R.current=t,Pe(t);return}let t=prompt(`Enter project state key to bind:`);if(t&&t.trim()){let n={...R.current,[e]:t.trim()};R.current=n,Pe(n)}},Lt=T.reduce((e,t)=>(e.includes(t.category)||e.push(t.category),e),[]);return(0,w.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,height:`100vh`,fontFamily:`'VT323', monospace`,background:k.bgRoot},children:[(0,w.jsx)(`style`,{children:`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}),(0,w.jsx)(`div`,{id:`menubar`,style:{height:`32px`,background:k.bgRoot,borderBottom:`2px solid #000`,display:`flex`,alignItems:`center`,padding:`0 15px`,fontFamily:`'VT323', monospace`},children:(0,w.jsxs)(`div`,{style:{color:k.accent,fontWeight:`bold`,marginRight:`20px`},children:[(0,w.jsx)(_,{size:15,style:{marginRight:`8px`,display:`inline`}}),` SHADER LAB v2.5`]})}),(0,w.jsxs)(`div`,{id:`toolbar`,style:{height:`44px`,background:k.bgDeep,borderBottom:`2px solid #000`,display:`flex`,alignItems:`center`,padding:`0 10px`,gap:`8px`,fontFamily:`'VT323', monospace`},children:[(0,w.jsx)(`button`,{className:`tool-btn`,onClick:()=>Tt(Z),title:`Compile`,children:(0,w.jsx)(o,{size:16})}),(0,w.jsx)(`div`,{style:{width:`1px`,height:`20px`,background:k.borderMute}}),(0,w.jsx)(`input`,{type:`text`,value:vt.name,onChange:e=>{let t=e.target.value;x(e=>e.map((e,n)=>n===S?{...e,name:t}:e))},placeholder:`shader_name`,"aria-label":`Shader Name`,style:{width:`140px`,padding:`3px 6px`,fontSize:`0.9rem`,background:k.bgPanelAlt,border:`1px solid `+k.border,color:k.textMain,fontFamily:`'VT323', monospace`}}),(0,w.jsx)(`button`,{className:`tool-btn`,onClick:()=>void St(!0),disabled:ce,title:`Save (Ctrl+S)`,children:(0,w.jsx)(u,{size:16})}),(0,w.jsx)(`button`,{className:`tool-btn`,onClick:()=>void Ct(),style:{color:k.danger},title:`Delete Shader`,children:(0,w.jsx)(g,{size:16})}),(0,w.jsx)(`div`,{style:{width:`1px`,height:`20px`,background:k.borderMute}}),(0,w.jsx)(`button`,{className:`tool-btn`,onClick:ht,disabled:q.current<=0,title:`Undo (Ctrl+Z)`,style:{fontSize:`0.7rem`,padding:`4px 8px`,width:`auto`},children:`↩`}),(0,w.jsx)(`button`,{className:`tool-btn`,onClick:gt,disabled:q.current>=nt.current.length-1,title:`Redo (Ctrl+Shift+Z)`,style:{fontSize:`0.7rem`,padding:`4px 8px`,width:`auto`},children:`↪`}),(0,w.jsx)(`div`,{style:{width:`1px`,height:`20px`,background:k.borderMute}}),(0,w.jsx)(`button`,{className:`tool-btn`,onClick:()=>{we(!0),et(``),tt(null)},title:`Templates`,children:(0,w.jsx)(h,{size:16})}),(0,w.jsx)(`div`,{style:{width:`1px`,height:`20px`,background:k.borderMute}}),(0,w.jsx)(`button`,{className:`tool-btn`,onClick:()=>{Ue.current=``;let e=[...b,Q()];x(e),ae(e.length-1)},title:`New Shader`,children:(0,w.jsx)(d,{size:16})}),(0,w.jsx)(`div`,{style:{width:`1px`,height:`20px`,background:k.borderMute}}),(0,w.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`6px`},children:[(0,w.jsx)(t,{size:14,style:{color:k.textDim}}),(0,w.jsx)(`select`,{value:Te,onChange:e=>Dt(e.target.value),style:{width:`auto`,padding:`3px 6px`,fontSize:`0.85rem`,background:k.bgPanelAlt,border:`1px solid `+k.border,color:k.textDim,borderRadius:`0px`,fontFamily:`'VT323', monospace`,cursor:`pointer`},children:Object.entries(me).map(([e,t])=>(0,w.jsx)(`option`,{value:e,children:t},e))})]}),(0,w.jsx)(`div`,{style:{width:`1px`,height:`20px`,background:k.borderMute}}),(0,w.jsx)(`button`,{className:`tool-btn`,onClick:Ot,title:`Capture snapshot B`,style:{fontSize:`0.7rem`,padding:`4px 8px`,width:`auto`,color:W===`b`?k.accent:k.textDim},children:`B✔`}),U&&(0,w.jsxs)(`button`,{className:`tool-btn`,onClick:kt,title:`Toggle A/B preview`,style:{fontSize:`0.7rem`,padding:`4px 8px`,width:`auto`,background:W===`b`?k.bgPanel:void 0,borderColor:W===`b`?k.accent:void 0,color:W===`b`?k.accent:k.textDim},children:[W===`a`?`A`:`B`,`↔`]}),(0,w.jsxs)(`div`,{style:{marginLeft:`auto`,display:`flex`,alignItems:`center`,gap:`12px`,paddingRight:`10px`,fontFamily:`'VT323', monospace`},children:[(0,w.jsxs)(`label`,{style:{display:`flex`,alignItems:`center`,gap:`5px`,color:k.textDim,fontSize:`0.85rem`,cursor:`pointer`,margin:0},children:[(0,w.jsx)(`input`,{type:`checkbox`,checked:ke,onChange:e=>Ae(e.target.checked),style:{width:`auto`}}),`AUTO`]}),O&&(0,w.jsx)(`div`,{style:{color:O.includes(`FAIL`)||O.includes(`ERR`)||O.includes(`INVALID`)?k.danger:k.ok,fontSize:`0.8rem`},children:O}),z.filter(e=>e.visible).length>1&&(0,w.jsxs)(`div`,{style:{color:k.accent,fontSize:`0.8rem`,display:`flex`,alignItems:`center`,gap:`4px`},children:[(0,w.jsx)(_,{size:13}),` `,z.filter(e=>e.visible).length,`L`]}),E===`success`&&(0,w.jsxs)(`div`,{style:{color:k.ok,fontSize:`0.85rem`,display:`flex`,alignItems:`center`,gap:`4px`},children:[(0,w.jsx)(c,{size:14}),` READY`]}),E===`error`&&(0,w.jsxs)(`div`,{style:{color:k.danger,fontSize:`0.85rem`,display:`flex`,alignItems:`center`,gap:`4px`},children:[(0,w.jsx)(l,{size:14}),` ERROR`]}),E===`compiling`&&(0,w.jsxs)(`div`,{style:{color:k.accent,fontSize:`0.85rem`,display:`flex`,alignItems:`center`,gap:`4px`},children:[(0,w.jsx)(n,{size:14,className:`spin`}),` COMPILING...`]}),Fe>0&&(0,w.jsxs)(`div`,{style:{color:k.textMute,fontSize:`0.8rem`},children:[Fe,` FPS (`,Le,`ms)`]})]})]}),(0,w.jsxs)(`div`,{style:{flexGrow:1,display:`flex`,overflow:`hidden`,fontFamily:`'VT323', monospace`},children:[(0,w.jsx)(te,{title:`SHADERS`,items:b,currentIndex:S,onSelect:ae,renderItem:(e,t)=>(0,w.jsx)(`div`,{style:{padding:`8px 12px`,cursor:`pointer`,background:t?`#111`:`transparent`,color:t?k.accent:k.textDim,borderBottom:`1px solid #1a1a1a`,fontFamily:`'VT323', monospace`,fontSize:`1rem`},children:e.name})}),(0,w.jsxs)(`div`,{style:{flexGrow:1,display:`flex`,flexDirection:`column`},children:[(0,w.jsx)(`div`,{style:{flexGrow:1,position:`relative`},children:(0,w.jsx)(ne,{height:`100%`,language:`cpp`,theme:`vs-dark`,value:Z,onChange:e=>{let t=e||``;B(e=>e.map((e,n)=>n===V?{...e,code:t}:e)),x(e=>e.map((e,n)=>n===S?{...e,code:t}:e))},options:{fontSize:14,fontFamily:`'JetBrains Mono', 'Consolas', monospace`,minimap:{enabled:!1},padding:{top:20}}})}),E===`error`&&(0,w.jsxs)(`div`,{style:{height:`80px`,background:`#1a0505`,borderTop:`2px solid #e74c3c`,color:`#ffaaaa`,padding:`8px 12px`,fontSize:`0.9rem`,overflowY:`auto`,fontFamily:`'VT323', monospace`},children:[(0,w.jsx)(`div`,{style:{color:k.danger,marginBottom:`4px`},children:`// COMPILE ERROR`}),xe]})]}),(0,w.jsxs)(`div`,{className:`panel`,style:{width:`400px`,borderLeft:`2px solid #000`},children:[(0,w.jsxs)(`div`,{className:`panel-header`,children:[(0,w.jsxs)(`span`,{style:{display:`flex`,alignItems:`center`,gap:`6px`},children:[(0,w.jsx)(s,{size:14}),` PREVIEW`]}),(0,w.jsx)(`span`,{style:{fontSize:`0.75rem`,color:k.textMute},children:`drag to orbit`})]}),(0,w.jsxs)(`div`,{style:{padding:`16px`,display:`flex`,justifyContent:`center`,background:`#000`,position:`relative`},children:[(0,w.jsx)(`canvas`,{ref:je,width:360,height:300,onMouseDown:Nt,onMouseMove:Pt,onMouseUp:Ft,onMouseLeave:Ft,style:{border:`1px solid `+(W===`b`?`#e67e22`:k.border),borderRadius:`0px`,cursor:`grab`,maxWidth:`100%`}}),W===`b`&&(0,w.jsx)(`div`,{style:{position:`absolute`,top:`20px`,right:`20px`,background:`#e67e22`,color:`#000`,fontSize:`0.7rem`,fontWeight:`bold`,padding:`2px 6px`,borderRadius:`0px`,fontFamily:`'VT323', monospace`,letterSpacing:`1px`},children:`SNAPSHOT B`})]}),(0,w.jsxs)(`div`,{className:`panel-header`,style:{borderTop:`1px solid `+k.borderMute,cursor:`pointer`},children:[(0,w.jsxs)(`span`,{style:{display:`flex`,alignItems:`center`,gap:`6px`},children:[(0,w.jsx)(_,{size:14}),` LAYERS`]}),(0,w.jsx)(`span`,{style:{fontSize:`0.75rem`,color:k.textMute},children:z.length})]}),(0,w.jsxs)(`div`,{className:`panel-content`,style:{gap:`4px`,fontSize:`0.8rem`,padding:`8px`},children:[z.map((e,t)=>(0,w.jsxs)(`div`,{onClick:()=>H(t),style:{display:`flex`,alignItems:`center`,gap:`6px`,padding:`4px 6px`,background:t===V?k.bgPanel:`transparent`,border:`1px solid `+(t===V?k.accent:k.border),borderRadius:`0px`,cursor:`pointer`},children:[(0,w.jsx)(`button`,{onClick:e=>{e.stopPropagation(),X(),B(e=>e.map((e,n)=>n===t?{...e,visible:!e.visible}:e))},style:{background:`none`,border:`none`,cursor:`pointer`,color:e.visible?k.accent:`#444`,padding:0,width:`auto`},title:e.visible?`Hide`:`Show`,children:e.visible?(0,w.jsx)(_,{size:12}):(0,w.jsx)(v,{size:12})}),(0,w.jsx)(`input`,{value:e.name,onChange:e=>{X(),B(n=>n.map((n,r)=>r===t?{...n,name:e.target.value}:n))},onClick:e=>e.stopPropagation(),style:{flexGrow:1,background:`none`,border:`none`,color:t===V?`#fff`:k.textDim,fontSize:`0.8rem`,fontFamily:`'VT323', monospace`,outline:`none`,padding:0,minWidth:0,width:`auto`}}),(0,w.jsxs)(`select`,{value:e.blendMode,onChange:e=>{X(),B(n=>n.map((n,r)=>r===t?{...n,blendMode:e.target.value}:n))},onClick:e=>e.stopPropagation(),style:{fontSize:`0.65rem`,background:k.bgPanelAlt,border:`1px solid `+k.border,color:k.textDim,borderRadius:`2px`,padding:`1px 3px`,fontFamily:`'VT323', monospace`,width:`auto`,cursor:`pointer`},children:[(0,w.jsx)(`option`,{value:`replace`,children:`REPL`}),(0,w.jsx)(`option`,{value:`normal`,children:`NORM`}),(0,w.jsx)(`option`,{value:`multiply`,children:`MUL`}),(0,w.jsx)(`option`,{value:`screen`,children:`SCRN`}),(0,w.jsx)(`option`,{value:`add`,children:`ADD`})]}),(0,w.jsx)(`input`,{type:`range`,min:0,max:1,step:.05,value:e.opacity,onChange:e=>{X(),B(n=>n.map((n,r)=>r===t?{...n,opacity:parseFloat(e.target.value)}:n))},onClick:e=>e.stopPropagation(),style:{width:`40px`,padding:0,height:`4px`,cursor:`pointer`},title:`Opacity: ${Math.round(e.opacity*100)}%`}),(0,w.jsxs)(`span`,{style:{color:k.textMute,fontSize:`0.65rem`,minWidth:`20px`,textAlign:`right`},children:[Math.round(e.opacity*100),`%`]})]},e.id)),(0,w.jsxs)(`div`,{style:{display:`flex`,gap:`4px`,marginTop:`6px`},children:[(0,w.jsx)(`button`,{onClick:()=>{X();let e={id:`layer_`+Date.now(),name:`Layer `+(z.length+1),code:z[V]?.code||T[0].code,blendMode:`normal`,opacity:1,visible:!0};B(t=>[...t,e])},className:`tool-btn`,style:{fontSize:`0.7rem`,padding:`3px 8px`,width:`auto`},title:`Add Layer`,children:(0,w.jsx)(d,{size:12})}),(0,w.jsx)(`button`,{onClick:()=>{z.length<=1||(X(),B(e=>e.filter((e,t)=>t!==V)),H(e=>Math.min(e,z.length-2)))},className:`tool-btn`,style:{fontSize:`0.7rem`,padding:`3px 8px`,width:`auto`},disabled:z.length<=1,title:`Remove Layer`,children:(0,w.jsx)(g,{size:12})}),(0,w.jsx)(`button`,{onClick:()=>{let e=z[V];if(!e)return;X();let t={...e,id:`layer_`+Date.now(),name:e.name+` Copy`};B(e=>[...e,t]),H(z.length)},className:`tool-btn`,style:{fontSize:`0.7rem`,padding:`3px 8px`,width:`auto`},title:`Duplicate Layer`,children:(0,w.jsx)(a,{size:12})}),(0,w.jsx)(`button`,{onClick:()=>{V<=0||(X(),B(e=>{let t=[...e];return[t[V-1],t[V]]=[t[V],t[V-1]],t}),H(e=>e-1))},className:`tool-btn`,style:{fontSize:`0.7rem`,padding:`3px 8px`,width:`auto`},disabled:V<=0,title:`Move Up`,children:(0,w.jsx)(f,{size:12})}),(0,w.jsx)(`button`,{onClick:()=>{V>=z.length-1||(X(),B(e=>{let t=[...e];return[t[V],t[V+1]]=[t[V+1],t[V]],t}),H(e=>e+1))},className:`tool-btn`,style:{fontSize:`0.7rem`,padding:`3px 8px`,width:`auto`},disabled:V>=z.length-1,title:`Move Down`,children:(0,w.jsx)(r,{size:12})})]})]}),(0,w.jsxs)(`div`,{className:`panel-header`,style:{borderTop:`1px solid `+k.borderMute},children:[(0,w.jsxs)(`span`,{style:{display:`flex`,alignItems:`center`,gap:`6px`},children:[(0,w.jsx)(m,{size:14}),` UNIFORMS`]}),(0,w.jsx)(`span`,{style:{fontSize:`0.75rem`,color:k.textMute},children:Me.length})]}),(0,w.jsxs)(`div`,{className:`panel-content`,style:{gap:`8px`,fontSize:`0.85rem`},children:[Me.length===0&&(0,w.jsxs)(`div`,{style:{color:k.textMute,fontSize:`0.85rem`,fontStyle:`italic`,fontFamily:`'VT323', monospace`},children:[`No tweakable uniforms detected. Add `,(0,w.jsx)(`span`,{style:{color:k.textDim},children:`uniform float uMyVar;`}),` to your shader.`]}),Me.map(e=>(0,w.jsxs)(`div`,{style:{background:k.bgPanelAlt,border:`1px solid `+k.borderMute,borderRadius:`0px`,padding:`8px 10px`},children:[(0,w.jsxs)(`div`,{style:{display:`flex`,justifyContent:`space-between`,alignItems:`center`,marginBottom:`4px`},children:[(0,w.jsxs)(`span`,{style:{color:k.accent,fontFamily:`'VT323', monospace`,display:`flex`,alignItems:`center`,gap:`4px`},children:[e.name,(0,w.jsx)(`button`,{onClick:()=>{let t=(Y[e.name]||[]).find(e=>Math.abs(e.time-J)<.01);t?jt(e.name,t.time):At(e.name)},style:{background:`none`,border:`none`,cursor:`pointer`,color:(Y[e.name]||[]).length>0?k.accent:`#444`,fontSize:`0.7rem`,padding:`0 2px`,width:`auto`,lineHeight:1,opacity:.6},title:`Toggle keyframe at current time`,children:`◆`})]}),(0,w.jsxs)(`div`,{style:{display:`flex`,gap:`4px`,alignItems:`center`},children:[(0,w.jsx)(`span`,{style:{color:k.textMute,fontSize:`0.7rem`,fontFamily:`'VT323', monospace`},children:e.glType}),(0,w.jsx)(`button`,{onClick:()=>It(e.name),style:{background:N[e.name]?k.ok:k.bgPanelAlt,border:`1px solid `+(N[e.name]?k.ok:k.borderMute),color:N[e.name]?`#000`:k.textDim,borderRadius:`0px`,cursor:`pointer`,fontSize:`0.65rem`,padding:`1px 6px`,width:`auto`,fontFamily:`'VT323', monospace`},title:N[e.name]?`Bound to: ${N[e.name]}`:`Bind to project state`,children:N[e.name]?`BOUND`:`BIND`})]})]}),N[e.name]&&(0,w.jsxs)(`div`,{style:{color:k.ok,fontSize:`0.7rem`,marginBottom:`4px`,fontFamily:`'VT323', monospace`},children:[`→ `,N[e.name]]}),e.glType===`float`&&(()=>{let[t,n]=ge(e.hint),r=L.current[e.name]??e.value;return(0,w.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`8px`},children:[(0,w.jsx)(`input`,{type:`range`,min:t,max:n,step:(n-t)/100,value:r,onChange:t=>$(e.name,parseFloat(t.target.value)),style:{flexGrow:1,width:`auto`,padding:0,height:`6px`,cursor:`pointer`}}),(0,w.jsx)(`span`,{style:{color:k.textDim,minWidth:`40px`,textAlign:`right`,fontFamily:`'VT323', monospace`},children:r.toFixed(2)})]})})(),e.glType===`int`&&(()=>{let[t,n]=ge(e.hint),r=L.current[e.name]??e.value;return(0,w.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`8px`},children:[(0,w.jsx)(`input`,{type:`range`,min:t,max:n,step:1,value:r,onChange:t=>$(e.name,parseInt(t.target.value)),style:{flexGrow:1,width:`auto`,padding:0,height:`6px`,cursor:`pointer`}}),(0,w.jsx)(`span`,{style:{color:k.textDim,minWidth:`40px`,textAlign:`right`,fontFamily:`'VT323', monospace`},children:Math.round(r)})]})})(),e.glType===`bool`&&(0,w.jsxs)(`label`,{style:{display:`flex`,alignItems:`center`,gap:`8px`,cursor:`pointer`,margin:0,color:k.textDim},children:[(0,w.jsx)(`input`,{type:`checkbox`,checked:L.current[e.name]??e.value,onChange:t=>$(e.name,t.target.checked),style:{width:`auto`}}),L.current[e.name]??e.value?`ENABLED`:`DISABLED`]}),e.glType===`vec3`&&(()=>{let t=e.hint.toLowerCase().includes(`color`),n=L.current[e.name]??e.value;if(t){let t=_e(n);return(0,w.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`8px`},children:[(0,w.jsx)(`input`,{type:`color`,value:t,onChange:t=>$(e.name,ve(t.target.value)),style:{width:`36px`,height:`28px`,padding:0,border:`none`,cursor:`pointer`}}),(0,w.jsx)(`span`,{style:{color:k.textDim,fontFamily:`'VT323', monospace`},children:t})]})}return(0,w.jsx)(`div`,{style:{display:`flex`,gap:`6px`},children:[`R`,`G`,`B`].map((t,r)=>(0,w.jsxs)(`div`,{style:{flex:1},children:[(0,w.jsx)(`div`,{style:{color:k.textMute,fontSize:`0.65rem`,fontFamily:`'VT323', monospace`},children:t}),(0,w.jsx)(`input`,{type:`range`,min:0,max:1,step:.01,value:n[r],onChange:t=>{let i=[...n];i[r]=parseFloat(t.target.value),$(e.name,i)},style:{width:`100%`,padding:0,height:`5px`,cursor:`pointer`}})]},t))})})(),e.glType===`vec2`&&(()=>{let t=L.current[e.name]??e.value;return(0,w.jsx)(`div`,{style:{display:`flex`,gap:`6px`},children:[`X`,`Y`].map((n,r)=>(0,w.jsxs)(`div`,{style:{flex:1},children:[(0,w.jsx)(`div`,{style:{color:k.textMute,fontSize:`0.65rem`,fontFamily:`'VT323', monospace`},children:n}),(0,w.jsx)(`input`,{type:`range`,min:0,max:1,step:.01,value:t[r],onChange:n=>{let i=[...t];i[r]=parseFloat(n.target.value),$(e.name,i)},style:{width:`100%`,padding:0,height:`5px`,cursor:`pointer`}})]},n))})})()]},e.name))]}),(0,w.jsxs)(`div`,{className:`panel-header`,style:{borderTop:`1px solid `+k.borderMute},children:[(0,w.jsx)(`span`,{style:{display:`flex`,alignItems:`center`,gap:`6px`},children:`⏱ ANIMATION`}),(0,w.jsxs)(`span`,{style:{fontSize:`0.75rem`,color:k.textMute},children:[Object.keys(Y).length,` KF`]})]}),(0,w.jsxs)(`div`,{className:`panel-content`,style:{gap:`8px`,fontSize:`0.85rem`},children:[(0,w.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`8px`},children:[(0,w.jsx)(`button`,{onClick:Mt,className:`tool-btn`,style:{fontSize:`0.7rem`,padding:`4px 8px`,width:`auto`,minWidth:`32px`},title:at?`Pause`:`Play`,children:at?`⏸`:`▶`}),(0,w.jsxs)(`span`,{style:{color:k.textDim,fontFamily:`'VT323', monospace`,fontSize:`0.85rem`},children:[J.toFixed(2),`s / `,5,`s`]})]}),(0,w.jsxs)(`div`,{style:{position:`relative`,height:`24px`,background:k.bgPanelAlt,border:`1px solid `+k.borderMute,borderRadius:`0px`,marginTop:`4px`},children:[(0,w.jsx)(`input`,{type:`range`,min:0,max:5,step:.01,value:J,onChange:e=>{let t=parseFloat(e.target.value);st(t),ct.current=t;let n=ut.current;for(let[e,r]of Object.entries(n)){if(!r.length)continue;let n=be(r,t);n!==void 0&&(L.current[e]=n)}},style:{width:`100%`,height:`100%`,padding:0,margin:0,position:`absolute`,top:0,left:0,opacity:0,cursor:`pointer`}}),(0,w.jsx)(`div`,{style:{position:`absolute`,top:0,left:0,right:0,bottom:0,pointerEvents:`none`},children:Object.entries(Y).map(([e,t])=>t.map((t,n)=>(0,w.jsx)(`div`,{onClick:()=>jt(e,t.time),style:{position:`absolute`,left:`${t.time/5*100}%`,top:`50%`,transform:`translate(-50%, -50%)`,width:`8px`,height:`8px`,background:k.accent,clipPath:`polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)`,cursor:`pointer`,pointerEvents:`auto`},title:`${e} @ ${t.time.toFixed(2)}s`},`${e}-${n}`)))}),(0,w.jsx)(`div`,{style:{position:`absolute`,top:0,bottom:0,width:`2px`,left:`${J/5*100}%`,background:`#e67e22`,pointerEvents:`none`}})]})]})]})]}),Ce&&(0,w.jsx)(`div`,{style:{position:`fixed`,inset:0,background:`rgba(0,0,0,0.8)`,zIndex:1e3,display:`flex`,alignItems:`center`,justifyContent:`center`,fontFamily:`'VT323', monospace`},onClick:()=>we(!1),children:(0,w.jsxs)(`div`,{style:{background:k.bgPanelAlt,border:`1px solid `+k.border,borderRadius:`0px`,maxHeight:`80vh`,width:`640px`,overflow:`hidden`,display:`flex`,flexDirection:`column`,boxShadow:`0 10px 40px rgba(0,0,0,0.6)`},onClick:e=>e.stopPropagation(),children:[(0,w.jsxs)(`div`,{style:{padding:`12px 16px`,borderBottom:`1px solid `+k.border,color:k.accent,fontSize:`1.2rem`,display:`flex`,justifyContent:`space-between`,alignItems:`center`},children:[(0,w.jsx)(`span`,{children:`SHADER TEMPLATES`}),(0,w.jsx)(`button`,{onClick:()=>we(!1),style:{background:`none`,border:`none`,color:k.textDim,cursor:`pointer`,fontSize:`1.2rem`,width:`auto`,padding:`0 4px`},children:`✕`})]}),(0,w.jsx)(`div`,{style:{padding:`8px 12px`,borderBottom:`1px solid `+k.borderMute},children:(0,w.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`6px`,background:k.bgPanelAlt,border:`1px solid `+k.border,borderRadius:`0px`,padding:`6px 10px`},children:[(0,w.jsx)(i,{size:14,style:{color:k.textMute,flexShrink:0}}),(0,w.jsx)(`input`,{value:G,onChange:e=>et(e.target.value),placeholder:`Search templates...`,style:{flexGrow:1,background:`none`,border:`none`,color:k.textDim,fontSize:`0.9rem`,fontFamily:`'VT323', monospace`,outline:`none`,width:`auto`,padding:0}}),G&&(0,w.jsx)(`button`,{onClick:()=>et(``),style:{background:`none`,border:`none`,color:k.textMute,cursor:`pointer`,fontSize:`0.8rem`,width:`auto`,padding:`0 2px`},children:`✕`})]})}),(0,w.jsxs)(`div`,{style:{display:`flex`,gap:`4px`,padding:`8px 12px`,borderBottom:`1px solid `+k.borderMute,overflowX:`auto`,flexShrink:0},children:[(0,w.jsx)(`button`,{onClick:()=>tt(null),style:{background:K===null?k.bgPanel:`transparent`,border:`1px solid `+(K===null?k.accent:k.borderMute),color:K===null?k.accent:k.textDim,borderRadius:`0px`,cursor:`pointer`,fontSize:`0.75rem`,padding:`4px 10px`,whiteSpace:`nowrap`,fontFamily:`'VT323', monospace`,width:`auto`},children:`ALL`}),Lt.map(e=>(0,w.jsx)(`button`,{onClick:()=>tt(e),style:{background:K===e?k.bgPanel:`transparent`,border:`1px solid `+(K===e?k.accent:k.borderMute),color:K===e?k.accent:k.textDim,borderRadius:`0px`,cursor:`pointer`,fontSize:`0.75rem`,padding:`4px 10px`,whiteSpace:`nowrap`,fontFamily:`'VT323', monospace`,width:`auto`},children:e.toUpperCase()},e))]}),(0,w.jsx)(`div`,{style:{overflowY:`auto`,padding:`12px`},children:(()=>{let e=T.filter(e=>(!K||e.category===K)&&(!G||e.name.toLowerCase().includes(G.toLowerCase())||e.desc.toLowerCase().includes(G.toLowerCase())));if(e.length===0)return(0,w.jsxs)(`div`,{style:{color:k.textMute,textAlign:`center`,padding:`40px 0`,fontSize:`1rem`},children:[`No templates match "`,G,`"`]});let t={};return e.forEach(e=>{t[e.category]||(t[e.category]=[]),t[e.category].push(e)}),Object.entries(t).map(([e,t])=>(0,w.jsxs)(`div`,{style:{marginBottom:`16px`},children:[(0,w.jsxs)(`div`,{style:{color:k.textMute,fontSize:`0.85rem`,textTransform:`uppercase`,letterSpacing:`1px`,marginBottom:`8px`,paddingLeft:`4px`},children:[e,` (`,t.length,`)`]}),(0,w.jsx)(`div`,{style:{display:`grid`,gridTemplateColumns:`1fr 1fr`,gap:`6px`},children:t.map(e=>(0,w.jsxs)(`div`,{onClick:()=>Et(e),style:{padding:`8px 10px`,cursor:`pointer`,borderRadius:`0px`,background:k.bgPanelAlt,border:`1px solid `+k.borderMute,color:k.textDim,fontSize:`0.9rem`,transition:`all 0.1s`},onMouseEnter:e=>{e.currentTarget.style.background=k.bgPanel,e.currentTarget.style.borderColor=k.accent},onMouseLeave:e=>{e.currentTarget.style.background=k.bgPanelAlt,e.currentTarget.style.borderColor=k.borderMute},children:[(0,w.jsx)(`div`,{style:{color:k.accent,fontSize:`0.95rem`},children:e.name}),(0,w.jsx)(`div`,{style:{color:k.textMute,fontSize:`0.75rem`},children:e.desc})]},e.id))})]},e))})()}),(0,w.jsxs)(`div`,{style:{padding:`8px 16px`,borderTop:`1px solid `+k.border,color:k.textMute,fontSize:`0.8rem`,textAlign:`center`},children:[T.length,` TEMPLATES AVAILABLE`]})]})})]})},{})}));