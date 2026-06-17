import{a as e,i as t,n,r,t as i}from"./src-B4Yk9hP2.js";import{t as a}from"./useStudio-Bd3rfGD-.js";import{t as o}from"./box-BI6b3CCK.js";import{r as s,t as c}from"./dist-Dl1KxMdd.js";import{t as l}from"./copy-C6oapJTF.js";import{n as u,t as d}from"./sliders-vertical-C-SBvHcO.js";import{t as f}from"./play-BJmzYr_j.js";import{t as p}from"./plus-DovPbnJL.js";import{t as m}from"./refresh-cw-DQexoyaf.js";import{t as h}from"./save-Dtv7y9ff.js";import{t as g}from"./search-DKJ_0HBw.js";import{t as _}from"./trash-2-BkXrJX0z.js";import{t as ee}from"./Sidebar-D9N1QCdt.js";var te=n(`chevron-up`,[[`path`,{d:`m18 15-6-6-6 6`,key:`153udz`}]]),ne=n(`circle-alert`,[[`circle`,{cx:`12`,cy:`12`,r:`10`,key:`1mglay`}],[`line`,{x1:`12`,x2:`12`,y1:`8`,y2:`12`,key:`1pkeuh`}],[`line`,{x1:`12`,x2:`12.01`,y1:`16`,y2:`16`,key:`4dfq90`}]]),re=n(`circle-check`,[[`circle`,{cx:`12`,cy:`12`,r:`10`,key:`1mglay`}],[`path`,{d:`m9 12 2 2 4-4`,key:`dzmm74`}]]),ie=n(`eye-off`,[[`path`,{d:`M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49`,key:`ct8e1f`}],[`path`,{d:`M14.084 14.158a3 3 0 0 1-4.242-4.242`,key:`151rxh`}],[`path`,{d:`M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143`,key:`13bj9a`}],[`path`,{d:`m2 2 20 20`,key:`1ooewy`}]]),v=n(`eye`,[[`path`,{d:`M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0`,key:`1nclc0`}],[`circle`,{cx:`12`,cy:`12`,r:`3`,key:`1v7zrd`}]]),ae=n(`layout-grid`,[[`rect`,{width:`7`,height:`7`,x:`3`,y:`3`,rx:`1`,key:`1g98yp`}],[`rect`,{width:`7`,height:`7`,x:`14`,y:`3`,rx:`1`,key:`6d4xhi`}],[`rect`,{width:`7`,height:`7`,x:`14`,y:`14`,rx:`1`,key:`nxv5o0`}],[`rect`,{width:`7`,height:`7`,x:`3`,y:`14`,rx:`1`,key:`1bb6yr`}]]),oe=e(r()),y=e(t()),b=i(),x=[{id:`basic`,name:`Basic Lit`,category:`Basic`,desc:`Diffuse lighting with texture`,code:`precision highp float;
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
    vec2 uv = vTexCoord;
    vec4 col = texture2D(uTexture, uv);
    float scanline = sin(uv.y * uResolution.y * 0.5) * 0.08;
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
    float size = 16.0 + sin(uTime) * 8.0;
    vec2 uv = floor(vTexCoord * uResolution / size) * size / uResolution;
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
}`},{id:`edge-detect`,name:`Edge Detection`,category:`2D Effects`,desc:`Sobel-like edge detection`,code:`precision highp float;
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
}`},{id:`blur`,name:`Box Blur`,category:`2D Effects`,desc:`Simple averaging blur`,code:`precision highp float;
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
}`},{id:`sharpen`,name:`Sharpen`,category:`2D Effects`,desc:`Sharpening kernel filter`,code:`precision highp float;
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
}`},{id:`emboss`,name:`Emboss`,category:`2D Effects`,desc:`3D emboss relief effect`,code:`precision highp float;
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
    vec4 col = texture2D(uTexture, vTexCoord);
    float scan = abs(sin(vTexCoord.y * uResolution.y * 0.5 + uTime * 5.0)) * 0.15;
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
    vec4 col = texture2D(uTexture, vTexCoord);
    float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    vec2 grid = vTexCoord * uResolution / 12.0;
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
    vec4 col = texture2D(uTexture, vTexCoord);
    float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    vec2 pos = mod(floor(vTexCoord * uResolution / 4.0), 4.0);
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
}`}],se=`
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
`;function S(e,t,n){let r=[],i=[],a=[],o=[];for(let o=0;o<=n;o++){let s=o*Math.PI/n;for(let c=0;c<=t;c++){let l=c*2*Math.PI/t,u=e*Math.sin(s)*Math.cos(l),d=e*Math.cos(s),f=e*Math.sin(s)*Math.sin(l);r.push(u,d,f),a.push(u/e,d/e,f/e),i.push(c/t,o/n)}}for(let e=0;e<n;e++)for(let n=0;n<t;n++){let r=e*(t+1)+n,i=r+t+1;o.push(r,i,r+1,i,i+1,r+1)}return{positions:new Float32Array(r),texcoords:new Float32Array(i),normals:new Float32Array(a),indices:new Uint16Array(o)}}function ce(e){let t=e/2,n=[[-t,-t,t],[t,-t,t],[t,t,t],[-t,t,t],[-t,-t,-t],[-t,t,-t],[t,t,-t],[t,-t,-t],[-t,t,-t],[-t,t,t],[t,t,t],[t,t,-t],[-t,-t,-t],[t,-t,-t],[t,-t,t],[-t,-t,t],[t,-t,-t],[t,t,-t],[t,t,t],[t,-t,t],[-t,-t,-t],[-t,-t,t],[-t,t,t],[-t,t,-t]],r=[[0,1],[1,1],[1,0],[0,0],[0,1],[1,1],[1,0],[0,0],[0,0],[0,1],[1,1],[1,0],[0,0],[0,1],[1,1],[1,0],[1,0],[1,1],[0,1],[0,0],[0,0],[1,0],[1,1],[0,1]],i=[[0,0,1],[0,0,1],[0,0,1],[0,0,1],[0,0,-1],[0,0,-1],[0,0,-1],[0,0,-1],[0,1,0],[0,1,0],[0,1,0],[0,1,0],[0,-1,0],[0,-1,0],[0,-1,0],[0,-1,0],[1,0,0],[1,0,0],[1,0,0],[1,0,0],[-1,0,0],[-1,0,0],[-1,0,0],[-1,0,0]],a=[0,1,2,0,2,3],o=[],s=[],c=[],l=[];for(let e=0;e<6;e++){let t=e*4;for(let e=0;e<4;e++){let a=t+e;o.push(...n[a]),s.push(...r[a]),c.push(...i[a])}for(let e=0;e<6;e++)l.push(t+a[e])}return{positions:new Float32Array(o),texcoords:new Float32Array(s),normals:new Float32Array(c),indices:new Uint16Array(l)}}function le(e,t,n,r){let i=[],a=[],o=[],s=[];for(let s=0;s<=n;s++){let c=s/n*2*Math.PI;for(let l=0;l<=r;l++){let u=l/r*2*Math.PI,d=(e+t*Math.cos(u))*Math.cos(c),f=(e+t*Math.cos(u))*Math.sin(c),p=t*Math.sin(u);i.push(d,f,p);let m=Math.cos(u)*Math.cos(c),h=Math.cos(u)*Math.sin(c),g=Math.sin(u);o.push(m,h,g),a.push(s/n,l/r)}}for(let e=0;e<n;e++)for(let t=0;t<r;t++){let n=e*(r+1)+t,i=n+r+1;s.push(n,i,n+1,i,i+1,n+1)}return{positions:new Float32Array(i),texcoords:new Float32Array(a),normals:new Float32Array(o),indices:new Uint16Array(s)}}var C={identity:()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],multiply:(e,t)=>{let n=[];for(let r=0;r<4;r++)for(let i=0;i<4;i++){let a=0;for(let n=0;n<4;n++)a+=e[r*4+n]*t[n*4+i];n.push(a)}return n},perspective:(e,t,n,r)=>{let i=1/Math.tan(e/2);return[i/t,0,0,0,0,i,0,0,0,0,(r+n)/(n-r),-1,0,0,2*r*n/(n-r),0]},lookAt:(e,t,n)=>{let r=[t[0]-e[0],t[1]-e[1],t[2]-e[2]],i=Math.sqrt(r[0]*r[0]+r[1]*r[1]+r[2]*r[2]);r[0]/=i,r[1]/=i,r[2]/=i;let a=[r[1]*n[2]-r[2]*n[1],r[2]*n[0]-r[0]*n[2],r[0]*n[1]-r[1]*n[0]],o=Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]);a[0]/=o,a[1]/=o,a[2]/=o;let s=[a[1]*r[2]-a[2]*r[1],a[2]*r[0]-a[0]*r[2],a[0]*r[1]-a[1]*r[0]];return[a[0],s[0],-r[0],0,a[1],s[1],-r[1],0,a[2],s[2],-r[2],0,-a[0]*e[0]-a[1]*e[1]-a[2]*e[2],-s[0]*e[0]-s[1]*e[1]-s[2]*e[2],r[0]*e[0]+r[1]*e[1]+r[2]*e[2],1]},rotateX:(e,t)=>{let n=Math.cos(t),r=Math.sin(t),i=C.identity();return i[5]=n,i[6]=-r,i[9]=r,i[10]=n,C.multiply(e,i)},rotateY:(e,t)=>{let n=Math.cos(t),r=Math.sin(t),i=C.identity();return i[0]=n,i[2]=r,i[8]=-r,i[10]=n,C.multiply(e,i)},inverseTranspose:e=>{let t=e,n=[],r=t[0]*(t[5]*t[10]-t[6]*t[9])-t[1]*(t[4]*t[10]-t[6]*t[8])+t[2]*(t[4]*t[9]-t[5]*t[8]);if(Math.abs(r)<1e-10)return C.identity();let i=1/r;n[0]=(t[5]*t[10]-t[6]*t[9])*i,n[1]=(t[2]*t[9]-t[1]*t[10])*i,n[2]=(t[1]*t[6]-t[2]*t[5])*i,n[3]=0,n[4]=(t[6]*t[8]-t[4]*t[10])*i,n[5]=(t[0]*t[10]-t[2]*t[8])*i,n[6]=(t[2]*t[4]-t[0]*t[6])*i,n[7]=0,n[8]=(t[4]*t[9]-t[5]*t[8])*i,n[9]=(t[1]*t[8]-t[0]*t[9])*i,n[10]=(t[0]*t[5]-t[1]*t[4])*i,n[11]=0,n[12]=0,n[13]=0,n[14]=0,n[15]=1;let a=[];for(let e=0;e<4;e++)for(let t=0;t<4;t++)a[t*4+e]=n[e*4+t];return a}};function ue(e,t,n){let r=e.createTexture();e.bindTexture(e.TEXTURE_2D,r),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,t,n,0,e.RGBA,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE);let i=e.createFramebuffer();return e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,r,0),e.bindFramebuffer(e.FRAMEBUFFER,null),{fbo:i,tex:r,width:t,height:n}}var de=`
attribute vec2 aPosition;
varying vec2 vTexCoord;
void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
    vTexCoord = aPosition * 0.5 + 0.5;
}
`,fe={replace:`precision highp float; varying vec2 vTexCoord; uniform sampler2D uTexture; void main() { gl_FragColor = texture2D(uTexture, vTexCoord); }`,normal:`precision highp float; varying vec2 vTexCoord; uniform sampler2D uTexture; uniform sampler2D uAccum; uniform float uOpacity; void main() { vec4 a = texture2D(uAccum, vTexCoord); vec4 b = texture2D(uTexture, vTexCoord); gl_FragColor = mix(a, b, uOpacity); }`,multiply:`precision highp float; varying vec2 vTexCoord; uniform sampler2D uTexture; uniform sampler2D uAccum; uniform float uOpacity; void main() { vec4 a = texture2D(uAccum, vTexCoord); vec4 b = texture2D(uTexture, vTexCoord); gl_FragColor = mix(a, vec4(a.rgb * b.rgb, 1.0), uOpacity); }`,screen:`precision highp float; varying vec2 vTexCoord; uniform sampler2D uTexture; uniform sampler2D uAccum; uniform float uOpacity; void main() { vec4 a = texture2D(uAccum, vTexCoord); vec4 b = texture2D(uTexture, vTexCoord); vec3 s = 1.0 - (1.0 - a.rgb) * (1.0 - b.rgb); gl_FragColor = mix(a, vec4(s, 1.0), uOpacity); }`,add:`precision highp float; varying vec2 vTexCoord; uniform sampler2D uTexture; uniform sampler2D uAccum; uniform float uOpacity; void main() { vec4 a = texture2D(uAccum, vTexCoord); vec4 b = texture2D(uTexture, vTexCoord); gl_FragColor = mix(a, vec4(min(a.rgb + b.rgb, 1.0), 1.0), uOpacity); }`};function pe(e,t){let n=e.createShader(e.VERTEX_SHADER);e.shaderSource(n,de),e.compileShader(n);let r=e.createShader(e.FRAGMENT_SHADER);e.shaderSource(r,fe[t]),e.compileShader(r);let i=e.createProgram();return e.attachShader(i,n),e.attachShader(i,r),e.linkProgram(i),e.getProgramParameter(i,e.LINK_STATUS)?i:null}var me=new Float32Array([-1,-1,1,-1,-1,1,1,1]);function he(e,t){let n=new Uint8Array(e*t*4);for(let r=0;r<t;r++)for(let i=0;i<e;i++){let a=(r*e+i)*4,o=i/e-.5,s=r/t-.5,c=Math.floor(i/32)+Math.floor(r/32),l=.2+.8*(c%2==0),u=.2+.8*(c%3==0),d=.3+.7*Math.abs(Math.sin(o*20)*Math.cos(s*20));n[a]=Math.floor(l*255),n[a+1]=Math.floor(u*255),n[a+2]=Math.floor(d*255),n[a+3]=255}return n}var ge={sphere:()=>S(1,32,32),cube:()=>ce(1.5),torus:()=>le(1,.4,20,16)},_e={sphere:`Sphere`,cube:`Cube`,torus:`Torus`};function ve(e,t){let n=new Set([`uTexture`,`uTime`,`uResolution`,`uModelViewProjection`,`uModelMatrix`,`uNormalMatrix`,`uMouse`,`uCameraPosition`]),r=[],i=/uniform\s+(float|int|bool|vec2|vec3|vec4|sampler2D)\s+(\w+)\s*;(?:\s*\/\/\s*(.*))?/g,a;for(;(a=i.exec(e))!==null;){let e=a[1],i=a[2];if(n.has(i))continue;let o=(a[3]||``).trim(),s=t[i];s===void 0&&(s=ye(e,o)),r.push({glType:e,name:i,hint:o,value:s})}return r}function ye(e,t){let n=t.toLowerCase().includes(`color`);switch(e){case`float`:return .5;case`int`:return 1;case`bool`:return!1;case`vec2`:return[.5,.5];case`vec3`:return n?[1,0,0]:[.5,.5,.5];case`vec4`:return n?[1,0,0,1]:[.5,.5,.5,1];default:return .5}}function be(e){let t=e.match(/\[([\d.]+)\s*,\s*([\d.]+)\]/);return t?[parseFloat(t[1]),parseFloat(t[2])]:[0,1]}function xe(e){return`#`+[Math.round(Math.max(0,Math.min(1,e[0]))*255),Math.round(Math.max(0,Math.min(1,e[1]))*255),Math.round(Math.max(0,Math.min(1,e[2]))*255)].map(e=>e.toString(16).padStart(2,`0`)).join(``)}function Se(e){return[parseInt(e.slice(1,3),16)/255,parseInt(e.slice(3,5),16)/255,parseInt(e.slice(5,7),16)/255]}function Ce(e,t){let n=e.createShader(e.VERTEX_SHADER);if(e.shaderSource(n,se),e.compileShader(n),!e.getShaderParameter(n,e.COMPILE_STATUS))return null;let r=e.createShader(e.FRAGMENT_SHADER);if(e.shaderSource(r,t),e.compileShader(r),!e.getShaderParameter(r,e.COMPILE_STATUS))return null;let i=e.createProgram();return e.attachShader(i,n),e.attachShader(i,r),e.linkProgram(i),e.getProgramParameter(i,e.LINK_STATUS)?(e.deleteShader(n),e.deleteShader(r),i):null}function we(e,t){if(e.length!==0){if(e.length===1||t<=e[0].time)return e[0].value;if(t>=e[e.length-1].time)return e[e.length-1].value;for(let n=0;n<e.length-1;n++){let r=e[n],i=e[n+1];if(t>=r.time&&t<i.time){let e=(t-r.time)/(i.time-r.time);return typeof r.value==`number`?r.value+(i.value-r.value)*e:Array.isArray(r.value)?r.value.map((t,n)=>t+(i.value[n]-t)*e):r.value}}return e[e.length-1].value}}oe.createRoot(document.getElementById(`root`)).render((0,b.jsx)(y.StrictMode,{children:(0,b.jsx)(()=>{let{isReady:e,projectState:t}=a(),[n,r]=(0,y.useState)([]),[i,oe]=(0,y.useState)(0),[S,ce]=(0,y.useState)(`idle`),[le,de]=(0,y.useState)(!1),[fe,ye]=(0,y.useState)(``),[Te,w]=(0,y.useState)(!1),[Ee,De]=(0,y.useState)(`sphere`),[Oe,ke]=(0,y.useState)(0),[Ae,je]=(0,y.useState)(!0),Me=(0,y.useRef)(null),T=(0,y.useRef)(null),E=(0,y.useRef)(null),[Ne,Pe]=(0,y.useState)([]),[D,Fe]=(0,y.useState)({}),[Ie,Le]=(0,y.useState)(0),[Re,ze]=(0,y.useState)(0),O=(0,y.useRef)(null),Be=(0,y.useRef)(null),k=(0,y.useRef)({x:.3,y:0}),A=(0,y.useRef)({dragging:!1,lastX:0,lastY:0}),Ve=(0,y.useRef)(0),j=(0,y.useRef)({}),He=(0,y.useRef)([]),M=(0,y.useRef)({});(0,y.useRef)({frames:0,lastTime:0});let[N,P]=(0,y.useState)(()=>{let e=n[0];return e?.layers?.length?e.layers:[{id:`layer_1`,name:`Layer 1`,code:e?.code||x[0].code,blendMode:`replace`,opacity:1,visible:!0}]}),[F,I]=(0,y.useState)(0),Ue=(0,y.useRef)(0),We=(0,y.useRef)(``),L=(0,y.useRef)([]),[Ge,Ke]=(0,y.useState)({}),qe=(0,y.useRef)({}),Je=(0,y.useRef)({fboA:null,fboB:null,quadProg:null,blendProgs:{}}),[R,Ye]=(0,y.useState)(null),[z,Xe]=(0,y.useState)(`a`),B=(0,y.useRef)(null),Ze=(0,y.useRef)(`a`),Qe=(0,y.useRef)(null),[V,$e]=(0,y.useState)(``),[H,et]=(0,y.useState)(null),U=(0,y.useRef)([]),W=(0,y.useRef)(-1),G=(0,y.useRef)(null),K=(0,y.useRef)(!1),[q,tt]=(0,y.useState)(!1),[J,nt]=(0,y.useState)(0),Y=(0,y.useRef)(0),[X,rt]=(0,y.useState)({}),it=(0,y.useRef)({}),at=(0,y.useRef)(0),ot=(0,y.useRef)(!1),[st,ct]=(0,y.useState)(null),Z=(0,y.useCallback)(()=>{let e={layers:JSON.parse(JSON.stringify(N)),activeLayerIdx:F},t=U.current,n=W.current;t.splice(n+1,t.length-n-1),t.push(e),t.length>50&&t.shift(),W.current=t.length-1},[N,F]),lt=(0,y.useCallback)(()=>{if(W.current<=0)return;--W.current;let e=U.current[W.current];e&&(K.current=!0,P(e.layers),I(e.activeLayerIdx),setTimeout(()=>{K.current=!1},0))},[]),ut=(0,y.useCallback)(()=>{if(W.current>=U.current.length-1)return;W.current+=1;let e=U.current[W.current];e&&(K.current=!0,P(e.layers),I(e.activeLayerIdx),setTimeout(()=>{K.current=!1},0))},[]),dt=(0,y.useRef)({});x.forEach(e=>{dt.current[e.id]=e.code});let ft=n[i]||{id:`empty`,name:`untitled`,code:x[0].code,uniforms:{}},pt=(0,y.useCallback)(e=>{let t=e.createTexture();e.bindTexture(e.TEXTURE_2D,t);let n=he(256,256);e.texImage2D(e.TEXTURE_2D,0,e.RGBA,256,256,0,e.RGBA,e.UNSIGNED_BYTE,n),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR_MIPMAP_LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.REPEAT),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.REPEAT),e.generateMipmap(e.TEXTURE_2D),Be.current=t},[]),mt=(0,y.useCallback)((e,t)=>{let{positions:n,texcoords:r,normals:i,indices:a}=ge[t](),o=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,o),e.bufferData(e.ARRAY_BUFFER,n,e.STATIC_DRAW);let s=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,s),e.bufferData(e.ARRAY_BUFFER,r,e.STATIC_DRAW);let c=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,c),e.bufferData(e.ARRAY_BUFFER,i,e.STATIC_DRAW);let l=e.createBuffer();e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,l),e.bufferData(e.ELEMENT_ARRAY_BUFFER,a,e.STATIC_DRAW),O.current={buf:{pos:o,tex:s,norm:c,idx:l},count:a.length}},[]);(0,y.useEffect)(()=>{if(!e)return;ht();let n=Me.current;if(!n)return;let r=n.getContext(`webgl`);if(!r)return;T.current=r,pt(r),mt(r,Ee),r.clearColor(.02,.02,.04,1),r.enable(r.DEPTH_TEST);let i=r.createBuffer();r.bindBuffer(r.ARRAY_BUFFER,i),r.bufferData(r.ARRAY_BUFFER,me,r.STATIC_DRAW);let a=(e,r,i)=>{let a=C.rotateY(C.rotateX(C.identity(),k.current.x),k.current.y),o=C.lookAt([0,0,3.5],[0,0,0],[0,1,0]),s=C.perspective(.8,n.width/n.height,.1,100),c=C.multiply(o,a),l=C.multiply(s,c),u=C.inverseTranspose(a),d=(t,n)=>{let i=e.getUniformLocation(r,t);i&&e.uniformMatrix4fv(i,!1,n)};d(`uModelViewProjection`,l),d(`uModelMatrix`,a),d(`uNormalMatrix`,u);let f=e.getUniformLocation(r,`uTime`);f&&e.uniform1f(f,i*.001);let p=e.getUniformLocation(r,`uResolution`);p&&e.uniform2f(p,n.width,n.height),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,Be.current);let m=e.getUniformLocation(r,`uTexture`);m&&e.uniform1i(m,0);let h=j.current,g=He.current,_=M.current;for(let n of g){let i=h[n.name];if(i===void 0&&(i=n.value),_[n.name]&&t){let e=t.get(_[n.name]);e!==void 0&&(i=typeof e==`number`?e:.5)}let a=e.getUniformLocation(r,n.name);if(a)switch(n.glType){case`float`:e.uniform1f(a,i);break;case`int`:e.uniform1i(a,Math.round(i));break;case`bool`:e.uniform1i(a,+!!i);break;case`vec2`:e.uniform2fv(a,i);break;case`vec3`:e.uniform3fv(a,i);break;case`vec4`:e.uniform4fv(a,i);break}}let ee=e.getAttribLocation(r,`aPosition`);e.bindBuffer(e.ARRAY_BUFFER,O.current.buf.pos),e.enableVertexAttribArray(ee),e.vertexAttribPointer(ee,3,e.FLOAT,!1,0,0);let te=e.getAttribLocation(r,`aTexCoord`);e.bindBuffer(e.ARRAY_BUFFER,O.current.buf.tex),e.enableVertexAttribArray(te),e.vertexAttribPointer(te,2,e.FLOAT,!1,0,0);let ne=e.getAttribLocation(r,`aNormal`);e.bindBuffer(e.ARRAY_BUFFER,O.current.buf.norm),e.enableVertexAttribArray(ne),e.vertexAttribPointer(ne,3,e.FLOAT,!1,0,0),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,O.current.buf.idx),e.drawElements(e.TRIANGLES,O.current.count,e.UNSIGNED_SHORT,0)},o=(e,t,r,i)=>{let o=L.current,s=Ue.current,c=t.id===o[s]?.id?E.current:null;if(!c){let e=qe.current[t.id];e&&e.status===`success`&&(c=e.program)}c||(c=Ce(e,t.code),c&&(qe.current[t.id]={status:`success`,program:c})),c&&(r?(e.bindFramebuffer(e.FRAMEBUFFER,r.fbo),e.viewport(0,0,r.width,r.height)):(e.bindFramebuffer(e.FRAMEBUFFER,null),e.viewport(0,0,n.width,n.height)),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT),e.useProgram(c),a(e,c,i))},s=(e,t,n)=>(e.fbo&&e.fbo.width===t&&e.fbo.height===n||(e.fbo=ue(r,t,n)),e.fbo),c={fbo:null},l={fbo:null},u={fbo:null},d=0,f=0,p=e=>{requestAnimationFrame(p);let t=T.current;if(!t)return;let r=k.current;if(r.y+=.005,ot.current){let e=performance.now(),t=(e-at.current)/1e3;at.current=e;let n=Y.current+t;n>=5&&(n=0),Y.current=n;let r=it.current;for(let[e,t]of Object.entries(r)){if(!t.length)continue;let r=we(t,n);r!==void 0&&(j.current[e]=r)}}let m=n.width,h=n.height,g=L.current.filter(e=>e.visible),_=B.current;if(Ze.current===`b`&&_&&Qe.current)t.bindFramebuffer(t.FRAMEBUFFER,null),t.viewport(0,0,m,h),t.clear(t.COLOR_BUFFER_BIT|t.DEPTH_BUFFER_BIT),t.useProgram(_),a(t,_,e);else if(g.length<=1){if(!E.current)return;t.bindFramebuffer(t.FRAMEBUFFER,null),t.viewport(0,0,m,h),t.clear(t.COLOR_BUFFER_BIT|t.DEPTH_BUFFER_BIT),t.useProgram(E.current),a(t,E.current,e)}else{let n=s(c,m,h),r=s(l,m,h),a=s(u,m,h),d=Je.current.blendProgs;for(let s=0;s<g.length;s++){let c=g[s];if(o(t,c,r,e),s===0){t.bindFramebuffer(t.FRAMEBUFFER,n.fbo),t.viewport(0,0,m,h),t.clear(t.COLOR_BUFFER_BIT|t.DEPTH_BUFFER_BIT);let e=d.replace;if(e||(e=pe(t,`replace`),d.replace=e),e){t.useProgram(e),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,r.tex),t.uniform1i(t.getUniformLocation(e,`uTexture`),0);let n=t.getAttribLocation(e,`aPosition`);t.bindBuffer(t.ARRAY_BUFFER,i),t.enableVertexAttribArray(n),t.vertexAttribPointer(n,2,t.FLOAT,!1,0,0),t.drawArrays(t.TRIANGLE_STRIP,0,4)}}else{let e=d[c.blendMode];if(e||(e=pe(t,c.blendMode),d[c.blendMode]=e),e){t.bindFramebuffer(t.FRAMEBUFFER,a.fbo),t.viewport(0,0,m,h),t.clear(t.COLOR_BUFFER_BIT|t.DEPTH_BUFFER_BIT),t.useProgram(e),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,n.tex),t.uniform1i(t.getUniformLocation(e,`uAccum`),0),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,r.tex),t.uniform1i(t.getUniformLocation(e,`uTexture`),1),c.blendMode!==`replace`&&t.uniform1f(t.getUniformLocation(e,`uOpacity`),c.opacity);let o=t.getAttribLocation(e,`aPosition`);t.bindBuffer(t.ARRAY_BUFFER,i),t.enableVertexAttribArray(o),t.vertexAttribPointer(o,2,t.FLOAT,!1,0,0),t.drawArrays(t.TRIANGLE_STRIP,0,4)}let o=n.tex;n.tex=a.tex,a.tex=o}}t.bindFramebuffer(t.FRAMEBUFFER,null),t.viewport(0,0,m,h),t.clear(t.COLOR_BUFFER_BIT|t.DEPTH_BUFFER_BIT);let f=d.replace;if(f||(f=pe(t,`replace`),d.replace=f),f){t.useProgram(f),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,n.tex),t.uniform1i(t.getUniformLocation(f,`uTexture`),0);let e=t.getAttribLocation(f,`aPosition`);t.bindBuffer(t.ARRAY_BUFFER,i),t.enableVertexAttribArray(e),t.vertexAttribPointer(e,2,t.FLOAT,!1,0,0),t.drawArrays(t.TRIANGLE_STRIP,0,4)}}f++,e-d>=1e3&&(Le(f),ze(Math.round(1e3/f)),f=0,d=e)};return Ve.current=requestAnimationFrame(p),()=>cancelAnimationFrame(Ve.current)},[e,Oe]),(0,y.useEffect)(()=>{if(!n[i])return;let e=n[i];if(We.current!==e.id){if(We.current=e.id,e.layers?.length)P(e.layers);else{let t=[{id:`layer_1`,name:`Layer 1`,code:e.code||x[0].code,blendMode:`replace`,opacity:1,visible:!0}];e.layers=t,P(t)}I(0)}},[i,n]);let Q=N[F]?.code??ft.code;(0,y.useEffect)(()=>{ft&&Ae&&vt(Q)},[Q,Ae]),(0,y.useEffect)(()=>{L.current=N},[N]),(0,y.useEffect)(()=>{Ue.current=F},[F]),(0,y.useEffect)(()=>{Ze.current=z},[z]),(0,y.useEffect)(()=>{Qe.current=R},[R]),(0,y.useEffect)(()=>{ot.current=q},[q]),(0,y.useEffect)(()=>{it.current=X},[X]),(0,y.useEffect)(()=>{Y.current=J},[J]),(0,y.useEffect)(()=>{let e=e=>{(e.ctrlKey||e.metaKey)&&e.key===`z`&&!e.shiftKey&&(e.preventDefault(),lt()),(e.ctrlKey||e.metaKey)&&e.key===`z`&&e.shiftKey&&(e.preventDefault(),ut())};return window.addEventListener(`keydown`,e),()=>window.removeEventListener(`keydown`,e)},[lt,ut]),(0,y.useEffect)(()=>{if(G.current&&clearTimeout(G.current),!K.current)return G.current=setTimeout(Z,800),()=>{G.current&&clearTimeout(G.current)}},[Q]);let ht=async()=>{try{let e=await fetch(`/api/shaders/list`);if(e.ok){let t=await e.json();t.length>0?r((await Promise.all(t.map(async e=>{let t=await fetch(`/api/data/shaders/${e}.json`);return t.ok?await t.json():null}))).filter(e=>e!==null)):r([_t()])}}catch{r([_t()])}},gt=async()=>{let e=n[i];if(!e)return;de(!0);let t={...e,layers:N};try{await fetch(`/api/assets/upload`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({path:`data/shaders/${e.name}.json`,content:JSON.stringify(t,null,2)})})}catch(e){console.error(e)}finally{de(!1)}},_t=()=>({id:`shader_`+Date.now(),name:`new_shader`,code:x[0].code,uniforms:{},layers:[{id:`layer_1`,name:`Layer 1`,code:x[0].code,blendMode:`replace`,opacity:1,visible:!0}]}),vt=e=>{let t=T.current;if(t){Z(),ce(`compiling`);try{let n=t.createShader(t.VERTEX_SHADER);if(t.shaderSource(n,se),t.compileShader(n),!t.getShaderParameter(n,t.COMPILE_STATUS))throw Error(`Vertex shader: `+t.getShaderInfoLog(n));let r=t.createShader(t.FRAGMENT_SHADER);if(t.shaderSource(r,e),t.compileShader(r),!t.getShaderParameter(r,t.COMPILE_STATUS))throw Error(t.getShaderInfoLog(r)||`Fragment shader error`);let i=t.createProgram();if(t.attachShader(i,n),t.attachShader(i,r),t.linkProgram(i),!t.getProgramParameter(i,t.LINK_STATUS))throw Error(t.getProgramInfoLog(i)||`Link error`);t.deleteShader(n),t.deleteShader(r),E.current&&t.deleteProgram(E.current),E.current=i;let a=L.current[F];a&&(qe.current[a.id]={status:`success`,program:i}),ce(`success`),ye(``);let o=ve(e,j.current);Pe(o),He.current=o,o.forEach(e=>{j.current[e.name]=e.value})}catch(e){ce(`error`),ye(e.message)}}},yt=e=>{Z();let t=e.code;P(e=>e.map((e,n)=>n===F?{...e,code:t}:e));let a=[...n];a[i]={...a[i],code:t},r(a),w(!1)},bt=e=>{De(e);let t=T.current;t&&mt(t,e),ke(e=>e+1)},xt=()=>{Ye(Q),Xe(`a`)},St=()=>{let e=z===`a`?`b`:`a`;if(Xe(e),e===`b`&&R){let e=T.current;if(!e)return;let t=Ce(e,R);t&&(B.current&&e.deleteProgram(B.current),B.current=t)}},Ct=e=>{let t=j.current[e];if(t===void 0)return;let n=Y.current;rt(r=>{let i=[...(r[e]||[]).filter(e=>Math.abs(e.time-n)>.01),{time:Math.round(n*100)/100,value:Array.isArray(t)?[...t]:t}].sort((e,t)=>e.time-t.time);return{...r,[e]:i}})},wt=(e,t)=>{rt(n=>{let r=(n[e]||[]).filter(e=>Math.abs(e.time-t)>.01);if(r.length===0){let t={...n};return delete t[e],t}return{...n,[e]:r}})},Tt=()=>{let e=!q;tt(e),e&&(at.current=performance.now())},Et=e=>{A.current.dragging=!0,A.current.lastX=e.clientX,A.current.lastY=e.clientY},Dt=e=>{if(!A.current.dragging)return;let t=e.clientX-A.current.lastX,n=e.clientY-A.current.lastY;A.current.lastX=e.clientX,A.current.lastY=e.clientY,k.current.x+=n*.01,k.current.y+=t*.01},Ot=()=>{A.current.dragging=!1},$=(e,t)=>{j.current[e]=t,Pe(n=>n.map(n=>n.name===e?{...n,value:t}:n))},kt=e=>{if(M.current[e]){let t={...M.current};delete t[e],M.current=t,Fe(t);return}let t=prompt(`Enter project state key to bind:`);if(t&&t.trim()){let n={...M.current,[e]:t.trim()};M.current=n,Fe(n)}},At=x.reduce((e,t)=>(e.includes(t.category)||e.push(t.category),e),[]);return(0,b.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,height:`100vh`,fontFamily:`'VT323', monospace`},children:[(0,b.jsx)(`style`,{children:`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}),(0,b.jsx)(`div`,{id:`menubar`,style:{height:`32px`,background:`#000`,borderBottom:`1px solid #333`,display:`flex`,alignItems:`center`,padding:`0 15px`,fontFamily:`'VT323', monospace`},children:(0,b.jsxs)(`div`,{style:{color:`var(--accent)`,fontWeight:`bold`,marginRight:`20px`},children:[(0,b.jsx)(v,{size:15,style:{marginRight:`8px`,display:`inline`}}),` SHADER LAB v2.5`]})}),(0,b.jsxs)(`div`,{id:`toolbar`,style:{height:`44px`,background:`#000`,borderBottom:`1px solid #333`,display:`flex`,alignItems:`center`,padding:`0 10px`,gap:`8px`,fontFamily:`'VT323', monospace`},children:[(0,b.jsx)(`button`,{className:`tool-btn`,onClick:()=>vt(Q),title:`Compile`,children:(0,b.jsx)(f,{size:16})}),(0,b.jsx)(`div`,{style:{width:`1px`,height:`20px`,background:`#333`}}),(0,b.jsx)(`button`,{className:`tool-btn`,onClick:gt,disabled:le,title:`Save`,children:(0,b.jsx)(h,{size:16})}),(0,b.jsx)(`div`,{style:{width:`1px`,height:`20px`,background:`#333`}}),(0,b.jsx)(`button`,{className:`tool-btn`,onClick:lt,disabled:W.current<=0,title:`Undo (Ctrl+Z)`,style:{fontSize:`0.7rem`,padding:`4px 8px`,width:`auto`},children:`↩`}),(0,b.jsx)(`button`,{className:`tool-btn`,onClick:ut,disabled:W.current>=U.current.length-1,title:`Redo (Ctrl+Shift+Z)`,style:{fontSize:`0.7rem`,padding:`4px 8px`,width:`auto`},children:`↪`}),(0,b.jsx)(`div`,{style:{width:`1px`,height:`20px`,background:`#333`}}),(0,b.jsx)(`button`,{className:`tool-btn`,onClick:()=>{w(!0),$e(``),et(null)},title:`Templates`,children:(0,b.jsx)(ae,{size:16})}),(0,b.jsx)(`div`,{style:{width:`1px`,height:`20px`,background:`#333`}}),(0,b.jsx)(`button`,{className:`tool-btn`,onClick:()=>r([...n,_t()]),title:`New Shader`,children:(0,b.jsx)(p,{size:16})}),(0,b.jsx)(`div`,{style:{width:`1px`,height:`20px`,background:`#333`}}),(0,b.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`6px`},children:[(0,b.jsx)(u,{size:14,style:{color:`#888`}}),(0,b.jsx)(`select`,{value:Ee,onChange:e=>bt(e.target.value),style:{width:`auto`,padding:`3px 6px`,fontSize:`0.85rem`,background:`#111`,border:`1px solid #444`,color:`#aaa`,borderRadius:`3px`,fontFamily:`'VT323', monospace`,cursor:`pointer`},children:Object.entries(_e).map(([e,t])=>(0,b.jsx)(`option`,{value:e,children:t},e))})]}),(0,b.jsx)(`div`,{style:{width:`1px`,height:`20px`,background:`#333`}}),(0,b.jsx)(`button`,{className:`tool-btn`,onClick:xt,title:`Capture snapshot B`,style:{fontSize:`0.7rem`,padding:`4px 8px`,width:`auto`,color:z===`b`?`var(--accent)`:`#888`},children:`B✔`}),R&&(0,b.jsxs)(`button`,{className:`tool-btn`,onClick:St,title:`Toggle A/B preview`,style:{fontSize:`0.7rem`,padding:`4px 8px`,width:`auto`,background:z===`b`?`#1a1a2a`:void 0,borderColor:z===`b`?`var(--accent)`:void 0,color:z===`b`?`var(--accent)`:`#888`},children:[z===`a`?`A`:`B`,`↔`]}),(0,b.jsxs)(`div`,{style:{marginLeft:`auto`,display:`flex`,alignItems:`center`,gap:`12px`,paddingRight:`10px`,fontFamily:`'VT323', monospace`},children:[(0,b.jsxs)(`label`,{style:{display:`flex`,alignItems:`center`,gap:`5px`,color:`#888`,fontSize:`0.85rem`,cursor:`pointer`,margin:0},children:[(0,b.jsx)(`input`,{type:`checkbox`,checked:Ae,onChange:e=>je(e.target.checked),style:{width:`auto`}}),`AUTO`]}),N.filter(e=>e.visible).length>1&&(0,b.jsxs)(`div`,{style:{color:`var(--accent)`,fontSize:`0.8rem`,display:`flex`,alignItems:`center`,gap:`4px`},children:[(0,b.jsx)(v,{size:13}),` `,N.filter(e=>e.visible).length,`L`]}),S===`success`&&(0,b.jsxs)(`div`,{style:{color:`#2ecc71`,fontSize:`0.85rem`,display:`flex`,alignItems:`center`,gap:`4px`},children:[(0,b.jsx)(re,{size:14}),` READY`]}),S===`error`&&(0,b.jsxs)(`div`,{style:{color:`#e74c3c`,fontSize:`0.85rem`,display:`flex`,alignItems:`center`,gap:`4px`},children:[(0,b.jsx)(ne,{size:14}),` ERROR`]}),S===`compiling`&&(0,b.jsxs)(`div`,{style:{color:`var(--accent)`,fontSize:`0.85rem`,display:`flex`,alignItems:`center`,gap:`4px`},children:[(0,b.jsx)(m,{size:14,className:`spin`}),` COMPILING...`]}),Ie>0&&(0,b.jsxs)(`div`,{style:{color:`#666`,fontSize:`0.8rem`},children:[Ie,` FPS (`,Re,`ms)`]})]})]}),(0,b.jsxs)(`div`,{style:{flexGrow:1,display:`flex`,overflow:`hidden`,fontFamily:`'VT323', monospace`},children:[(0,b.jsx)(ee,{title:`SHADERS`,items:n,currentIndex:i,onSelect:oe,renderItem:(e,t)=>(0,b.jsx)(`div`,{style:{padding:`8px 12px`,cursor:`pointer`,background:t?`#111`:`transparent`,color:t?`var(--accent)`:`#888`,borderBottom:`1px solid #1a1a1a`,fontFamily:`'VT323', monospace`,fontSize:`1rem`},children:e.name})}),(0,b.jsxs)(`div`,{style:{flexGrow:1,display:`flex`,flexDirection:`column`},children:[(0,b.jsx)(`div`,{style:{flexGrow:1,position:`relative`},children:(0,b.jsx)(c,{height:`100%`,language:`cpp`,theme:`vs-dark`,value:Q,onChange:e=>{let t=e||``;P(e=>e.map((e,n)=>n===F?{...e,code:t}:e));let a=[...n];a[i].code=t,r(a)},options:{fontSize:14,fontFamily:`'JetBrains Mono', 'Consolas', monospace`,minimap:{enabled:!1},padding:{top:20}}})}),S===`error`&&(0,b.jsxs)(`div`,{style:{height:`80px`,background:`#1a0505`,borderTop:`2px solid #e74c3c`,color:`#ffaaaa`,padding:`8px 12px`,fontSize:`0.9rem`,overflowY:`auto`,fontFamily:`'VT323', monospace`},children:[(0,b.jsx)(`div`,{style:{color:`#e74c3c`,marginBottom:`4px`},children:`// COMPILE ERROR`}),fe]})]}),(0,b.jsxs)(`div`,{className:`panel`,style:{width:`400px`,borderLeft:`1px solid #333`},children:[(0,b.jsxs)(`div`,{className:`panel-header`,children:[(0,b.jsxs)(`span`,{style:{display:`flex`,alignItems:`center`,gap:`6px`},children:[(0,b.jsx)(o,{size:14}),` PREVIEW`]}),(0,b.jsx)(`span`,{style:{fontSize:`0.75rem`,color:`#666`},children:`drag to orbit`})]}),(0,b.jsxs)(`div`,{style:{padding:`16px`,display:`flex`,justifyContent:`center`,background:`#000`,position:`relative`},children:[(0,b.jsx)(`canvas`,{ref:Me,width:360,height:300,onMouseDown:Et,onMouseMove:Dt,onMouseUp:Ot,onMouseLeave:Ot,style:{border:`1px solid `+(z===`b`?`#e67e22`:`#222`),borderRadius:`4px`,cursor:`grab`,maxWidth:`100%`}}),z===`b`&&(0,b.jsx)(`div`,{style:{position:`absolute`,top:`20px`,right:`20px`,background:`#e67e22`,color:`#000`,fontSize:`0.7rem`,fontWeight:`bold`,padding:`2px 6px`,borderRadius:`3px`,fontFamily:`'VT323', monospace`,letterSpacing:`1px`},children:`SNAPSHOT B`})]}),(0,b.jsxs)(`div`,{className:`panel-header`,style:{borderTop:`1px solid #333`,cursor:`pointer`},children:[(0,b.jsxs)(`span`,{style:{display:`flex`,alignItems:`center`,gap:`6px`},children:[(0,b.jsx)(v,{size:14}),` LAYERS`]}),(0,b.jsx)(`span`,{style:{fontSize:`0.75rem`,color:`#666`},children:N.length})]}),(0,b.jsxs)(`div`,{className:`panel-content`,style:{gap:`4px`,fontSize:`0.8rem`,padding:`8px`},children:[N.map((e,t)=>(0,b.jsxs)(`div`,{onClick:()=>I(t),style:{display:`flex`,alignItems:`center`,gap:`6px`,padding:`4px 6px`,background:t===F?`#1a1a2a`:`transparent`,border:`1px solid `+(t===F?`var(--accent)`:`#222`),borderRadius:`3px`,cursor:`pointer`},children:[(0,b.jsx)(`button`,{onClick:e=>{e.stopPropagation(),Z(),P(e=>e.map((e,n)=>n===t?{...e,visible:!e.visible}:e))},style:{background:`none`,border:`none`,cursor:`pointer`,color:e.visible?`var(--accent)`:`#444`,padding:0,width:`auto`},title:e.visible?`Hide`:`Show`,children:e.visible?(0,b.jsx)(v,{size:12}):(0,b.jsx)(ie,{size:12})}),(0,b.jsx)(`input`,{value:e.name,onChange:e=>{Z(),P(n=>n.map((n,r)=>r===t?{...n,name:e.target.value}:n))},onClick:e=>e.stopPropagation(),style:{flexGrow:1,background:`none`,border:`none`,color:t===F?`#fff`:`#888`,fontSize:`0.8rem`,fontFamily:`'VT323', monospace`,outline:`none`,padding:0,minWidth:0,width:`auto`}}),(0,b.jsxs)(`select`,{value:e.blendMode,onChange:e=>{Z(),P(n=>n.map((n,r)=>r===t?{...n,blendMode:e.target.value}:n))},onClick:e=>e.stopPropagation(),style:{fontSize:`0.65rem`,background:`#111`,border:`1px solid #333`,color:`#aaa`,borderRadius:`2px`,padding:`1px 3px`,fontFamily:`'VT323', monospace`,width:`auto`,cursor:`pointer`},children:[(0,b.jsx)(`option`,{value:`replace`,children:`REPL`}),(0,b.jsx)(`option`,{value:`normal`,children:`NORM`}),(0,b.jsx)(`option`,{value:`multiply`,children:`MUL`}),(0,b.jsx)(`option`,{value:`screen`,children:`SCRN`}),(0,b.jsx)(`option`,{value:`add`,children:`ADD`})]}),(0,b.jsx)(`input`,{type:`range`,min:0,max:1,step:.05,value:e.opacity,onChange:e=>{Z(),P(n=>n.map((n,r)=>r===t?{...n,opacity:parseFloat(e.target.value)}:n))},onClick:e=>e.stopPropagation(),style:{width:`40px`,padding:0,height:`4px`,cursor:`pointer`},title:`Opacity: ${Math.round(e.opacity*100)}%`}),(0,b.jsxs)(`span`,{style:{color:`#555`,fontSize:`0.65rem`,minWidth:`20px`,textAlign:`right`},children:[Math.round(e.opacity*100),`%`]})]},e.id)),(0,b.jsxs)(`div`,{style:{display:`flex`,gap:`4px`,marginTop:`6px`},children:[(0,b.jsx)(`button`,{onClick:()=>{Z();let e={id:`layer_`+Date.now(),name:`Layer `+(N.length+1),code:N[F]?.code||x[0].code,blendMode:`normal`,opacity:1,visible:!0};P(t=>[...t,e])},className:`tool-btn`,style:{fontSize:`0.7rem`,padding:`3px 8px`,width:`auto`},title:`Add Layer`,children:(0,b.jsx)(p,{size:12})}),(0,b.jsx)(`button`,{onClick:()=>{N.length<=1||(Z(),P(e=>e.filter((e,t)=>t!==F)),I(e=>Math.min(e,N.length-2)))},className:`tool-btn`,style:{fontSize:`0.7rem`,padding:`3px 8px`,width:`auto`},disabled:N.length<=1,title:`Remove Layer`,children:(0,b.jsx)(_,{size:12})}),(0,b.jsx)(`button`,{onClick:()=>{let e=N[F];if(!e)return;Z();let t={...e,id:`layer_`+Date.now(),name:e.name+` Copy`};P(e=>[...e,t]),I(N.length)},className:`tool-btn`,style:{fontSize:`0.7rem`,padding:`3px 8px`,width:`auto`},title:`Duplicate Layer`,children:(0,b.jsx)(l,{size:12})}),(0,b.jsx)(`button`,{onClick:()=>{F<=0||(Z(),P(e=>{let t=[...e];return[t[F-1],t[F]]=[t[F],t[F-1]],t}),I(e=>e-1))},className:`tool-btn`,style:{fontSize:`0.7rem`,padding:`3px 8px`,width:`auto`},disabled:F<=0,title:`Move Up`,children:(0,b.jsx)(te,{size:12})}),(0,b.jsx)(`button`,{onClick:()=>{F>=N.length-1||(Z(),P(e=>{let t=[...e];return[t[F],t[F+1]]=[t[F+1],t[F]],t}),I(e=>e+1))},className:`tool-btn`,style:{fontSize:`0.7rem`,padding:`3px 8px`,width:`auto`},disabled:F>=N.length-1,title:`Move Down`,children:(0,b.jsx)(s,{size:12})})]})]}),(0,b.jsxs)(`div`,{className:`panel-header`,style:{borderTop:`1px solid #333`},children:[(0,b.jsxs)(`span`,{style:{display:`flex`,alignItems:`center`,gap:`6px`},children:[(0,b.jsx)(d,{size:14}),` UNIFORMS`]}),(0,b.jsx)(`span`,{style:{fontSize:`0.75rem`,color:`#666`},children:Ne.length})]}),(0,b.jsxs)(`div`,{className:`panel-content`,style:{gap:`8px`,fontSize:`0.85rem`},children:[Ne.length===0&&(0,b.jsxs)(`div`,{style:{color:`#666`,fontSize:`0.85rem`,fontStyle:`italic`,fontFamily:`'VT323', monospace`},children:[`No tweakable uniforms detected. Add `,(0,b.jsx)(`span`,{style:{color:`#888`},children:`uniform float uMyVar;`}),` to your shader.`]}),Ne.map(e=>(0,b.jsxs)(`div`,{style:{background:`#111`,border:`1px solid #222`,borderRadius:`4px`,padding:`8px 10px`},children:[(0,b.jsxs)(`div`,{style:{display:`flex`,justifyContent:`space-between`,alignItems:`center`,marginBottom:`4px`},children:[(0,b.jsxs)(`span`,{style:{color:`var(--accent)`,fontFamily:`'VT323', monospace`,display:`flex`,alignItems:`center`,gap:`4px`},children:[e.name,(0,b.jsx)(`button`,{onClick:()=>{let t=(X[e.name]||[]).find(e=>Math.abs(e.time-J)<.01);t?wt(e.name,t.time):Ct(e.name)},style:{background:`none`,border:`none`,cursor:`pointer`,color:(X[e.name]||[]).length>0?`var(--accent)`:`#444`,fontSize:`0.7rem`,padding:`0 2px`,width:`auto`,lineHeight:1,opacity:.6},title:`Toggle keyframe at current time`,children:`◆`})]}),(0,b.jsxs)(`div`,{style:{display:`flex`,gap:`4px`,alignItems:`center`},children:[(0,b.jsx)(`span`,{style:{color:`#555`,fontSize:`0.7rem`,fontFamily:`'VT323', monospace`},children:e.glType}),(0,b.jsx)(`button`,{onClick:()=>kt(e.name),style:{background:D[e.name]?`#2ecc71`:`#222`,border:`1px solid `+(D[e.name]?`#2ecc71`:`#444`),color:D[e.name]?`#000`:`#888`,borderRadius:`3px`,cursor:`pointer`,fontSize:`0.65rem`,padding:`1px 6px`,width:`auto`,fontFamily:`'VT323', monospace`},title:D[e.name]?`Bound to: ${D[e.name]}`:`Bind to project state`,children:D[e.name]?`BOUND`:`BIND`})]})]}),D[e.name]&&(0,b.jsxs)(`div`,{style:{color:`#2ecc71`,fontSize:`0.7rem`,marginBottom:`4px`,fontFamily:`'VT323', monospace`},children:[`→ `,D[e.name]]}),e.glType===`float`&&(()=>{let[t,n]=be(e.hint),r=j.current[e.name]??e.value;return(0,b.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`8px`},children:[(0,b.jsx)(`input`,{type:`range`,min:t,max:n,step:(n-t)/100,value:r,onChange:t=>$(e.name,parseFloat(t.target.value)),style:{flexGrow:1,width:`auto`,padding:0,height:`6px`,cursor:`pointer`}}),(0,b.jsx)(`span`,{style:{color:`#aaa`,minWidth:`40px`,textAlign:`right`,fontFamily:`'VT323', monospace`},children:r.toFixed(2)})]})})(),e.glType===`int`&&(()=>{let[t,n]=be(e.hint),r=j.current[e.name]??e.value;return(0,b.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`8px`},children:[(0,b.jsx)(`input`,{type:`range`,min:t,max:n,step:1,value:r,onChange:t=>$(e.name,parseInt(t.target.value)),style:{flexGrow:1,width:`auto`,padding:0,height:`6px`,cursor:`pointer`}}),(0,b.jsx)(`span`,{style:{color:`#aaa`,minWidth:`40px`,textAlign:`right`,fontFamily:`'VT323', monospace`},children:Math.round(r)})]})})(),e.glType===`bool`&&(0,b.jsxs)(`label`,{style:{display:`flex`,alignItems:`center`,gap:`8px`,cursor:`pointer`,margin:0,color:`#aaa`},children:[(0,b.jsx)(`input`,{type:`checkbox`,checked:j.current[e.name]??e.value,onChange:t=>$(e.name,t.target.checked),style:{width:`auto`}}),j.current[e.name]??e.value?`ENABLED`:`DISABLED`]}),e.glType===`vec3`&&(()=>{let t=e.hint.toLowerCase().includes(`color`),n=j.current[e.name]??e.value;if(t){let t=xe(n);return(0,b.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`8px`},children:[(0,b.jsx)(`input`,{type:`color`,value:t,onChange:t=>$(e.name,Se(t.target.value)),style:{width:`36px`,height:`28px`,padding:0,border:`none`,cursor:`pointer`}}),(0,b.jsx)(`span`,{style:{color:`#aaa`,fontFamily:`'VT323', monospace`},children:t})]})}return(0,b.jsx)(`div`,{style:{display:`flex`,gap:`6px`},children:[`R`,`G`,`B`].map((t,r)=>(0,b.jsxs)(`div`,{style:{flex:1},children:[(0,b.jsx)(`div`,{style:{color:`#666`,fontSize:`0.65rem`,fontFamily:`'VT323', monospace`},children:t}),(0,b.jsx)(`input`,{type:`range`,min:0,max:1,step:.01,value:n[r],onChange:t=>{let i=[...n];i[r]=parseFloat(t.target.value),$(e.name,i)},style:{width:`100%`,padding:0,height:`5px`,cursor:`pointer`}})]},t))})})(),e.glType===`vec2`&&(()=>{let t=j.current[e.name]??e.value;return(0,b.jsx)(`div`,{style:{display:`flex`,gap:`6px`},children:[`X`,`Y`].map((n,r)=>(0,b.jsxs)(`div`,{style:{flex:1},children:[(0,b.jsx)(`div`,{style:{color:`#666`,fontSize:`0.65rem`,fontFamily:`'VT323', monospace`},children:n}),(0,b.jsx)(`input`,{type:`range`,min:0,max:1,step:.01,value:t[r],onChange:n=>{let i=[...t];i[r]=parseFloat(n.target.value),$(e.name,i)},style:{width:`100%`,padding:0,height:`5px`,cursor:`pointer`}})]},n))})})()]},e.name))]}),(0,b.jsxs)(`div`,{className:`panel-header`,style:{borderTop:`1px solid #333`},children:[(0,b.jsx)(`span`,{style:{display:`flex`,alignItems:`center`,gap:`6px`},children:`⏱ ANIMATION`}),(0,b.jsxs)(`span`,{style:{fontSize:`0.75rem`,color:`#666`},children:[Object.keys(X).length,` KF`]})]}),(0,b.jsxs)(`div`,{className:`panel-content`,style:{gap:`8px`,fontSize:`0.85rem`},children:[(0,b.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`8px`},children:[(0,b.jsx)(`button`,{onClick:Tt,className:`tool-btn`,style:{fontSize:`0.7rem`,padding:`4px 8px`,width:`auto`,minWidth:`32px`},title:q?`Pause`:`Play`,children:q?`⏸`:`▶`}),(0,b.jsxs)(`span`,{style:{color:`#aaa`,fontFamily:`'VT323', monospace`,fontSize:`0.85rem`},children:[J.toFixed(2),`s / `,5,`s`]})]}),(0,b.jsxs)(`div`,{style:{position:`relative`,height:`24px`,background:`#111`,border:`1px solid #222`,borderRadius:`3px`,marginTop:`4px`},children:[(0,b.jsx)(`input`,{type:`range`,min:0,max:5,step:.01,value:J,onChange:e=>{let t=parseFloat(e.target.value);nt(t),Y.current=t;let n=it.current;for(let[e,r]of Object.entries(n)){if(!r.length)continue;let n=we(r,t);n!==void 0&&(j.current[e]=n)}},style:{width:`100%`,height:`100%`,padding:0,margin:0,position:`absolute`,top:0,left:0,opacity:0,cursor:`pointer`}}),(0,b.jsx)(`div`,{style:{position:`absolute`,top:0,left:0,right:0,bottom:0,pointerEvents:`none`},children:Object.entries(X).map(([e,t])=>t.map((t,n)=>(0,b.jsx)(`div`,{onClick:()=>wt(e,t.time),style:{position:`absolute`,left:`${t.time/5*100}%`,top:`50%`,transform:`translate(-50%, -50%)`,width:`8px`,height:`8px`,background:`var(--accent)`,clipPath:`polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)`,cursor:`pointer`,pointerEvents:`auto`},title:`${e} @ ${t.time.toFixed(2)}s`},`${e}-${n}`)))}),(0,b.jsx)(`div`,{style:{position:`absolute`,top:0,bottom:0,width:`2px`,left:`${J/5*100}%`,background:`#e67e22`,pointerEvents:`none`}})]})]})]})]}),Te&&(0,b.jsx)(`div`,{style:{position:`fixed`,inset:0,background:`rgba(0,0,0,0.8)`,zIndex:1e3,display:`flex`,alignItems:`center`,justifyContent:`center`,fontFamily:`'VT323', monospace`},onClick:()=>w(!1),children:(0,b.jsxs)(`div`,{style:{background:`#0d0d14`,border:`1px solid #2a2a3a`,borderRadius:`8px`,maxHeight:`80vh`,width:`640px`,overflow:`hidden`,display:`flex`,flexDirection:`column`,boxShadow:`0 10px 40px rgba(0,0,0,0.6)`},onClick:e=>e.stopPropagation(),children:[(0,b.jsxs)(`div`,{style:{padding:`12px 16px`,borderBottom:`1px solid #2a2a3a`,color:`var(--accent)`,fontSize:`1.2rem`,display:`flex`,justifyContent:`space-between`,alignItems:`center`},children:[(0,b.jsx)(`span`,{children:`SHADER TEMPLATES`}),(0,b.jsx)(`button`,{onClick:()=>w(!1),style:{background:`none`,border:`none`,color:`#888`,cursor:`pointer`,fontSize:`1.2rem`,width:`auto`,padding:`0 4px`},children:`✕`})]}),(0,b.jsx)(`div`,{style:{padding:`8px 12px`,borderBottom:`1px solid #1a1a2a`},children:(0,b.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`6px`,background:`#111`,border:`1px solid #333`,borderRadius:`4px`,padding:`6px 10px`},children:[(0,b.jsx)(g,{size:14,style:{color:`#666`,flexShrink:0}}),(0,b.jsx)(`input`,{value:V,onChange:e=>$e(e.target.value),placeholder:`Search templates...`,style:{flexGrow:1,background:`none`,border:`none`,color:`#ccc`,fontSize:`0.9rem`,fontFamily:`'VT323', monospace`,outline:`none`,width:`auto`,padding:0}}),V&&(0,b.jsx)(`button`,{onClick:()=>$e(``),style:{background:`none`,border:`none`,color:`#666`,cursor:`pointer`,fontSize:`0.8rem`,width:`auto`,padding:`0 2px`},children:`✕`})]})}),(0,b.jsxs)(`div`,{style:{display:`flex`,gap:`4px`,padding:`8px 12px`,borderBottom:`1px solid #1a1a2a`,overflowX:`auto`,flexShrink:0},children:[(0,b.jsx)(`button`,{onClick:()=>et(null),style:{background:H===null?`#1a1a2a`:`transparent`,border:`1px solid `+(H===null?`var(--accent)`:`#333`),color:H===null?`var(--accent)`:`#888`,borderRadius:`4px`,cursor:`pointer`,fontSize:`0.75rem`,padding:`4px 10px`,whiteSpace:`nowrap`,fontFamily:`'VT323', monospace`,width:`auto`},children:`ALL`}),At.map(e=>(0,b.jsx)(`button`,{onClick:()=>et(e),style:{background:H===e?`#1a1a2a`:`transparent`,border:`1px solid `+(H===e?`var(--accent)`:`#333`),color:H===e?`var(--accent)`:`#888`,borderRadius:`4px`,cursor:`pointer`,fontSize:`0.75rem`,padding:`4px 10px`,whiteSpace:`nowrap`,fontFamily:`'VT323', monospace`,width:`auto`},children:e.toUpperCase()},e))]}),(0,b.jsx)(`div`,{style:{overflowY:`auto`,padding:`12px`},children:(()=>{let e=x.filter(e=>(!H||e.category===H)&&(!V||e.name.toLowerCase().includes(V.toLowerCase())||e.desc.toLowerCase().includes(V.toLowerCase())));if(e.length===0)return(0,b.jsxs)(`div`,{style:{color:`#666`,textAlign:`center`,padding:`40px 0`,fontSize:`1rem`},children:[`No templates match "`,V,`"`]});let t={};return e.forEach(e=>{t[e.category]||(t[e.category]=[]),t[e.category].push(e)}),Object.entries(t).map(([e,t])=>(0,b.jsxs)(`div`,{style:{marginBottom:`16px`},children:[(0,b.jsxs)(`div`,{style:{color:`#666`,fontSize:`0.85rem`,textTransform:`uppercase`,letterSpacing:`1px`,marginBottom:`8px`,paddingLeft:`4px`},children:[e,` (`,t.length,`)`]}),(0,b.jsx)(`div`,{style:{display:`grid`,gridTemplateColumns:`1fr 1fr`,gap:`6px`},children:t.map(e=>(0,b.jsxs)(`div`,{onClick:()=>yt(e),style:{padding:`8px 10px`,cursor:`pointer`,borderRadius:`4px`,background:`#111`,border:`1px solid #1a1a2a`,color:`#ccc`,fontSize:`0.9rem`,transition:`all 0.1s`},onMouseEnter:e=>{e.currentTarget.style.background=`#1a1a2a`,e.currentTarget.style.borderColor=`var(--accent)`},onMouseLeave:e=>{e.currentTarget.style.background=`#111`,e.currentTarget.style.borderColor=`#1a1a2a`},children:[(0,b.jsx)(`div`,{style:{color:`var(--accent)`,fontSize:`0.95rem`},children:e.name}),(0,b.jsx)(`div`,{style:{color:`#666`,fontSize:`0.75rem`},children:e.desc})]},e.id))})]},e))})()}),(0,b.jsxs)(`div`,{style:{padding:`8px 16px`,borderTop:`1px solid #2a2a3a`,color:`#555`,fontSize:`0.8rem`,textAlign:`center`},children:[x.length,` TEMPLATES AVAILABLE`]})]})})]})},{})}));