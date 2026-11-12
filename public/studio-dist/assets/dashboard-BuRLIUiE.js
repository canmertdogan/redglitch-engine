import{n as e}from"./src-DIW-7cXR.js";import{B as t,Gt as n,It as r,Mt as i,P as a,S as o,Yt as s,_ as c,at as l,ct as u,dt as d,k as f,m as p,o as m,rt as h,w as g,wt as _}from"./vendor-icons-CZgmVDNG.js";import{n as v,t as y}from"./vendor-react-ClDXkOod.js";import{t as b}from"./Toast-DEdUYZIV.js";var x=e(v()),S=e(s()),C=y(),w=.5,T=1e3/30,E=`
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`,D=`
precision mediump float;
uniform float iTime;
uniform vec2 iResolution;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123); }
float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), f.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / min(iResolution.y, iResolution.x);
    float d = length(uv);
    float shadow = smoothstep(0.08, 0.085, d);
    float photon = exp(-pow(d - 0.09, 2.0) * 5000.0) * 1.5;
    float angle = atan(uv.y, uv.x);
    float disk_h = exp(-pow(uv.y, 2.0) * 200.0) * smoothstep(0.1, 0.5, d) * exp(-d * 1.5);
    float lens_r = abs(d - 0.22);
    float disk_v = exp(-pow(lens_r, 2.0) * 1000.0) * 0.5;
    float turb = noise(vec2(angle * 5.0 - iTime * 1.5, d * 20.0));
    float final_disk = (disk_h + disk_v) * (0.7 + 0.3 * turb);
    float glow = exp(-d * 6.0) * 0.15;
    vec3 col = vec3(0.0);
    vec2 star_uv = uv * (1.0 + 0.03 / (d + 0.01));
    float stars = pow(noise(star_uv * 100.0), 40.0);
    col += vec3(stars) * 0.4 * shadow;
    vec3 gold = vec3(1.0, 0.7, 0.2);
    col += gold * final_disk * 1.8 + vec3(1.0) * photon + gold * glow;
    col *= shadow;
    col = pow(col, vec3(1.1));
    gl_FragColor = vec4(col, 1.0);
}
`,O=`radial-gradient(circle at 50% 40%, #1a1207 0%, #000 70%)`;function k(e,t,n){let r=e.createShader(t);if(e.shaderSource(r,n),e.compileShader(r),!e.getShaderParameter(r,e.COMPILE_STATUS)){let t=e.getShaderInfoLog(r);throw e.deleteShader(r),Error(t||`shader compile failed`)}return r}var A=({enabled:e})=>{let t=(0,S.useRef)(null);return(0,S.useEffect)(()=>{let n=t.current;if(!e||!n)return;let r=document.createElement(`canvas`);r.style.cssText=`width:100%;height:100%;display:block;`;let i=r.getContext(`webgl`,{antialias:!1,alpha:!1,powerPreference:`low-power`})||r.getContext(`experimental-webgl`);if(!i){console.warn(`[Dashboard] WebGL unavailable — using static backdrop.`),n.style.background=O;return}let a;try{if(a=i.createProgram(),i.attachShader(a,k(i,i.VERTEX_SHADER,E)),i.attachShader(a,k(i,i.FRAGMENT_SHADER,D)),i.linkProgram(a),!i.getProgramParameter(a,i.LINK_STATUS))throw Error(`link failed`)}catch(e){console.warn(`[Dashboard] WebGL shader unavailable, using static background:`,e),n.style.background=O;return}i.useProgram(a);let o=i.createBuffer();i.bindBuffer(i.ARRAY_BUFFER,o),i.bufferData(i.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),i.STATIC_DRAW);let s=i.getAttribLocation(a,`position`);i.enableVertexAttribArray(s),i.vertexAttribPointer(s,2,i.FLOAT,!1,0,0);let c=i.getUniformLocation(a,`iTime`),l=i.getUniformLocation(a,`iResolution`);n.appendChild(r);let u=()=>{r.width=Math.max(1,Math.floor(window.innerWidth*w)),r.height=Math.max(1,Math.floor(window.innerHeight*w)),i.viewport(0,0,r.width,r.height),i.uniform2f(l,r.width,r.height)};u(),window.addEventListener(`resize`,u);let d=0,f=0,p=e=>{d=requestAnimationFrame(p),!(document.hidden||e-f<T)&&(f=e,i.uniform1f(c,e*.001),i.drawArrays(i.TRIANGLE_STRIP,0,4))};return d=requestAnimationFrame(p),()=>{cancelAnimationFrame(d),window.removeEventListener(`resize`,u),r.parentNode===n&&n.removeChild(r),i.deleteBuffer(o),i.deleteProgram(a),i.getExtension(`WEBGL_lose_context`)?.loseContext()}},[e]),(0,C.jsx)(`div`,{ref:t,style:{position:`fixed`,top:0,left:0,width:`100%`,height:`100%`,zIndex:-1,background:`#000`,overflow:`hidden`,pointerEvents:`none`}})},j=[{id:`rpg-topdown`,name:`RPG CORE`,icon:c,desc:`Top-down 2D RPG with quests, combat, and dialogue.`},{id:`platformer-2d`,name:`PLATFORMER 2D`,icon:f,desc:`Side-scrolling physics, slopes, and action combat.`},{id:`iso-pixel`,name:`ISO PIXEL`,icon:t,desc:`2.5D isometric perspective with depth-sorting.`},{id:`unified-3d`,name:`UNIFIED 3D`,icon:n,desc:`3D FPS, platformer, and top-down worlds with Three.js.`}];x.createRoot(document.getElementById(`root`)).render((0,C.jsx)(S.StrictMode,{children:(0,C.jsx)(()=>{let[e,n]=(0,S.useState)(`projects`),[s,c]=(0,S.useState)([]),[v,y]=(0,S.useState)({cpu:0,mem:0}),[x,w]=(0,S.useState)(localStorage.getItem(`redglitch_perf_mode`)===`true`),[T,E]=(0,S.useState)(localStorage.getItem(`redglitch_username`)||`Developer`),[D,O]=(0,S.useState)(1),[k,M]=(0,S.useState)({name:``,author:``,blueprint:`rpg-topdown`}),[N,P]=(0,S.useState)(null),[F,I]=(0,S.useState)(!1),L=(0,S.useRef)(null);(0,S.useEffect)(()=>{R();let e=setInterval(z,3e3);return()=>clearInterval(e)},[]);let R=async()=>{try{let e=await fetch(`/api/projects`);e.ok&&c(await e.json())}catch(e){console.error(`Failed to load projects`,e)}},z=async()=>{try{let e=await fetch(`/api/system/stats`);if(e.ok){let t=await e.json();y({cpu:Math.round(t.cpu),mem:t.mem})}}catch(e){console.warn(`[studio-ui] swallowed error`,e)}},B=async e=>{try{let t=await fetch(`/api/projects/switch`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({name:e})});if(!t.ok){let e=`Failed to open project (${t.status})`;try{let n=await t.json();n?.error&&(e=n.error)}catch{}L.current?.show(e,`error`);return}(window.top||window).location.href=`../tools.html`}catch(e){console.warn(`[studio-ui] launchProject failed`,e),L.current?.show(e?.message||`FAILED TO LAUNCH PROJECT`,`error`)}},V=async e=>{try{let t=await fetch(`/api/projects/reveal`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({name:e})});if(!t.ok){let e=`Reveal failed (${t.status})`;try{let n=await t.json();n?.error&&(e=n.error)}catch{}L.current?.show(e,`error`)}}catch(e){L.current?.show(e?.message||`REVEAL FAILED`,`error`)}},H=async e=>{if(window.confirm(`Delete project "${e}"? This action cannot be undone.`))try{let t=await fetch(`/api/projects/${encodeURIComponent(e)}`,{method:`DELETE`});if(!t.ok){let e=`Delete failed (${t.status})`;try{let n=await t.json();n?.error&&(e=n.error)}catch{}L.current?.show(e,`error`);return}L.current?.show(`DELETED ${e}`,`info`),await R()}catch(e){L.current?.show(e?.message||`DELETE FAILED`,`error`)}},U=e=>{let t=e.trim();return t?/^[a-zA-Z0-9 \-_]+$/.test(t)?null:`Project name may only contain letters, numbers, spaces, hyphens, and underscores.`:`Project name is required.`},W=()=>{let e=U(k.name);if(e){P(e);return}P(null),O(2)},G=async()=>{if(F)return;let e=U(k.name);if(e){P(e);return}P(null),I(!0);try{let e={name:k.name.trim(),author:k.author.trim()||T||`Developer`,engineType:k.blueprint,template:`blank`};k.blueprint===`unified-3d`&&(e.mode=`fps-3d`);let t=await fetch(`/api/projects/create`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(e)});if(!t.ok){let e=`Failed to create project (${t.status})`;try{let n=await t.json();n?.error&&(e=n.error)}catch{}P(e),L.current?.show(e,`error`);return}await R(),L.current?.show(`PROJECT CREATED`,`success`),O(3)}catch(e){let t=e?.message||`Network error creating project`;P(t),L.current?.show(t,`error`)}finally{I(!1)}},K=e=>{let t=window.electronAPI;t?.openExternal?t.openExternal(e):window.open(e,`_blank`,`noopener,noreferrer`)};return(0,C.jsxs)(`div`,{style:{display:`grid`,gridTemplateColumns:`220px 1fr`,gridTemplateRows:`40px 1fr`,height:`100vh`,background:`var(--bg-root)`},children:[(0,C.jsx)(b,{ref:L}),(0,C.jsx)(A,{enabled:!x}),(0,C.jsxs)(`header`,{style:{gridArea:`1 / 1 / 2 / 3`,background:`rgba(0,0,0,0.8)`,borderBottom:`1px solid #1f2b42`,display:`flex`,alignItems:`center`,justifyContent:`space-between`,padding:`0 20px`,zIndex:10},children:[(0,C.jsxs)(`div`,{style:{color:`var(--accent)`,fontWeight:`bold`,letterSpacing:`2px`,display:`flex`,alignItems:`center`,gap:`10px`},children:[(0,C.jsx)(`div`,{style:{borderRight:`1px solid var(--accent)`,paddingRight:`10px`},children:`REDGLITCH ENGINE`}),(0,C.jsx)(`span`,{style:{fontSize:`14px`,color:`#555`,fontWeight:`normal`},children:`v7.0 CORE STUDIO`})]}),(0,C.jsxs)(`div`,{style:{display:`flex`,gap:`20px`,fontSize:`16px`,color:`#666`},children:[(0,C.jsxs)(`span`,{children:[(0,C.jsx)(_,{size:14,style:{marginRight:`4px`}}),` `,v.cpu,`%`]}),(0,C.jsxs)(`span`,{children:[(0,C.jsx)(l,{size:14,style:{marginRight:`4px`}}),` `,v.mem,`MB`]}),(0,C.jsxs)(`span`,{children:[(0,C.jsx)(i,{size:14,style:{marginRight:`4px`}}),` `,new Date().toLocaleTimeString([],{hour:`2-digit`,minute:`2-digit`})]})]})]}),(0,C.jsxs)(`aside`,{style:{gridArea:`2 / 1 / 3 / 2`,background:`rgba(8, 12, 24, 0.95)`,borderRight:`1px solid #1f2b42`,padding:`15px 0`,zIndex:10},children:[(0,C.jsx)(`div`,{style:{padding:`0 15px 10px`,fontSize:`12px`,color:`#444`,textTransform:`uppercase`},children:`Navigation`}),[{id:`projects`,label:`Projects`,icon:t},{id:`assets`,label:`Assets`,icon:o},{id:`marketplace`,label:`Marketplace`,icon:f},{id:`tutorials`,label:`Tutorials`,icon:u},{id:`community`,label:`Community`,icon:m},{id:`settings`,label:`Settings`,icon:g}].map(t=>(0,C.jsxs)(`div`,{onClick:()=>n(t.id),style:{padding:`10px 15px`,cursor:`pointer`,display:`flex`,alignItems:`center`,gap:`12px`,color:e===t.id?`var(--accent)`:`#888`,background:e===t.id?`rgba(255, 0, 0, 0.05)`:`transparent`,borderLeft:`2px solid ${e===t.id?`var(--accent)`:`transparent`}`,transition:`all 0.1s`},children:[(0,C.jsx)(t.icon,{size:18}),` `,t.label]},t.id)),(0,C.jsxs)(`div`,{style:{marginTop:`auto`,padding:`20px`,fontSize:`11px`,color:`#333`,textAlign:`center`},children:[`LOGGED AS: `,T.toUpperCase()]})]}),(0,C.jsxs)(`main`,{style:{gridArea:`2 / 2 / 3 / 3`,padding:`30px`,overflowY:`auto`,background:`rgba(5, 5, 8, 0.4)`},children:[e===`projects`&&(0,C.jsxs)(`div`,{className:`view-section active`,children:[(0,C.jsx)(`h1`,{style:{borderBottom:`1px solid #1f2b42`,paddingBottom:`10px`,color:`#fff`,fontSize:`24px`},children:`PROJECT EXPLORER`}),(0,C.jsxs)(`div`,{style:{display:`grid`,gridTemplateColumns:`repeat(auto-fill, minmax(280px, 1fr))`,gap:`25px`,marginTop:`20px`},children:[(0,C.jsxs)(`div`,{className:`project-card new-project`,onClick:()=>{M({name:``,author:T,blueprint:`rpg-topdown`}),P(null),O(1),n(`create`)},style:{borderStyle:`dashed`,justifyContent:`center`,alignItems:`center`,opacity:.8,background:`rgba(255, 0, 0, 0.02)`,borderColor:`rgba(255, 0, 0, 0.3)`},children:[(0,C.jsx)(`div`,{className:`plus-icon-container`,children:(0,C.jsx)(a,{size:48,color:`var(--accent)`})}),(0,C.jsx)(`div`,{style:{fontSize:`18px`,marginTop:`15px`,letterSpacing:`2px`,fontWeight:`bold`,color:`var(--accent)`},children:`FORGE NEW PROJECT`})]}),s.map(e=>(0,C.jsxs)(`div`,{className:`project-card premium`,onClick:()=>B(e.name),children:[(0,C.jsx)(`div`,{className:`card-glow`}),(0,C.jsxs)(`div`,{style:{display:`flex`,justifyContent:`space-between`,marginBottom:`15px`,position:`relative`,zIndex:2},children:[(0,C.jsxs)(`div`,{className:`engine-badge`,children:[(0,C.jsx)(f,{size:14,color:`var(--accent)`}),(0,C.jsx)(`span`,{children:e.engineType?.toUpperCase()||`RPG`})]}),(0,C.jsxs)(`div`,{style:{display:`flex`,gap:`8px`},children:[(0,C.jsx)(`button`,{className:`tool-btn small`,title:`Reveal in Folder`,onClick:t=>{t.stopPropagation(),V(e.name)},children:(0,C.jsx)(d,{size:12})}),(0,C.jsx)(`button`,{className:`tool-btn small danger`,title:`Delete Project`,onClick:t=>{t.stopPropagation(),H(e.name)},children:(0,C.jsx)(p,{size:12})})]})]}),(0,C.jsxs)(`div`,{className:`project-info`,style:{position:`relative`,zIndex:2,flexGrow:1},children:[(0,C.jsx)(`div`,{className:`project-title`,children:e.name.toUpperCase()}),(0,C.jsx)(`div`,{className:`project-path`,children:e.path})]}),(0,C.jsxs)(`div`,{className:`project-meta`,style:{position:`relative`,zIndex:2},children:[(0,C.jsxs)(`div`,{className:`meta-item`,children:[(0,C.jsx)(i,{size:12}),(0,C.jsx)(`span`,{children:e.lastModified&&!isNaN(Date.parse(e.lastModified))?new Date(e.lastModified).toLocaleDateString():`—`})]}),(0,C.jsx)(`div`,{className:`launch-tag`,children:`READY TO FORGE`})]})]},e.name))]})]}),e===`assets`&&(0,C.jsxs)(`div`,{className:`view-section active`,children:[(0,C.jsx)(`h1`,{style:{borderBottom:`1px solid #1f2b42`,paddingBottom:`10px`,color:`#fff`,fontSize:`24px`},children:`ASSET LIBRARY`}),(0,C.jsxs)(`div`,{style:{maxWidth:`900px`,margin:`20px auto`,textAlign:`center`,background:`rgba(10, 14, 20, 0.95)`,border:`1px solid #1f2b42`,padding:`40px`},children:[(0,C.jsx)(o,{size:64,color:`var(--accent)`,style:{marginBottom:`20px`}}),(0,C.jsx)(`h2`,{style:{color:`var(--accent)`,marginBottom:`15px`},children:`GLOBAL ASSET MANAGER`}),(0,C.jsx)(`p`,{style:{color:`#888`,marginBottom:`30px`},children:`Access and synchronize your shared engine assets.`}),(0,C.jsxs)(`div`,{style:{display:`grid`,gridTemplateColumns:`repeat(3, 1fr)`,gap:`15px`},children:[(0,C.jsxs)(`div`,{style:{background:`rgba(0,0,0,0.5)`,border:`1px solid #1f2b42`,padding:`20px`},children:[(0,C.jsx)(h,{size:32,color:`var(--accent)`}),(0,C.jsx)(`div`,{style:{color:`#fff`,marginTop:`10px`},children:`SPRITES`})]}),(0,C.jsxs)(`div`,{style:{background:`rgba(0,0,0,0.5)`,border:`1px solid #1f2b42`,padding:`20px`},children:[(0,C.jsx)(f,{size:32,color:`#2ecc71`}),(0,C.jsx)(`div`,{style:{color:`#fff`,marginTop:`10px`},children:`AUDIO`})]}),(0,C.jsxs)(`div`,{style:{background:`rgba(0,0,0,0.5)`,border:`1px solid #1f2b42`,padding:`20px`},children:[(0,C.jsx)(t,{size:32,color:`#3498db`}),(0,C.jsx)(`div`,{style:{color:`#fff`,marginTop:`10px`},children:`SCENES`})]})]})]})]}),e===`marketplace`&&(0,C.jsxs)(`div`,{className:`view-section active`,children:[(0,C.jsx)(`h1`,{style:{borderBottom:`1px solid #1f2b42`,paddingBottom:`10px`,color:`#fff`,fontSize:`24px`},children:`MARKETPLACE`}),(0,C.jsxs)(`div`,{style:{maxWidth:`800px`,margin:`20px auto`,textAlign:`center`,background:`rgba(10, 14, 20, 0.95)`,border:`1px solid #1f2b42`,padding:`40px`},children:[(0,C.jsx)(o,{size:64,color:`var(--accent)`,style:{marginBottom:`20px`}}),(0,C.jsx)(`h2`,{style:{color:`var(--accent)`,marginBottom:`15px`},children:`EXTENSIONS & ASSETS`}),(0,C.jsx)(`p`,{style:{color:`#888`},children:`Marketplace integration coming in v7.1`})]})]}),e===`community`&&(0,C.jsxs)(`div`,{className:`view-section active`,children:[(0,C.jsx)(`h1`,{style:{borderBottom:`1px solid #1f2b42`,paddingBottom:`10px`,color:`#fff`,fontSize:`24px`},children:`COMMUNITY & DOCS`}),(0,C.jsxs)(`div`,{style:{maxWidth:`800px`,margin:`20px auto`,background:`rgba(10, 14, 20, 0.95)`,border:`1px solid #1f2b42`,padding:`30px`},children:[(0,C.jsx)(`h2`,{style:{color:`var(--accent)`,marginTop:0},children:`RESOURCES & SOURCE`}),(0,C.jsxs)(`div`,{style:{display:`grid`,gridTemplateColumns:`1fr 1fr`,gap:`15px`,marginTop:`20px`},children:[(0,C.jsx)(`button`,{className:`tool-btn`,style:{padding:`15px`,width:`100%`},onClick:()=>window.open(`../docs.html`,`_blank`,`noopener,noreferrer`),children:`DOCUMENTATION`}),(0,C.jsx)(`button`,{className:`tool-btn`,style:{padding:`15px`,width:`100%`},onClick:()=>K(`https://github.com/canmertdogan/redglitch-engine`),children:`GITHUB REPO`}),(0,C.jsx)(`button`,{className:`tool-btn`,style:{padding:`15px`,width:`100%`},onClick:()=>window.open(`../credits.html`,`_blank`,`noopener,noreferrer`),children:`ENGINE CREDITS`}),(0,C.jsx)(`button`,{className:`tool-btn`,style:{padding:`15px`,width:`100%`},onClick:()=>window.open(`../launcher.html`,`_blank`,`noopener,noreferrer`),children:`GAME LAUNCHER`})]})]})]}),e===`create`&&(0,C.jsxs)(`div`,{className:`view-section active`,children:[(0,C.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`20px`,borderBottom:`1px solid #1f2b42`,paddingBottom:`15px`,marginBottom:`30px`},children:[(0,C.jsx)(`h1`,{style:{color:`#fff`,fontSize:`24px`,margin:0},children:`FORGE PROJECT`}),(0,C.jsx)(`div`,{style:{display:`flex`,gap:`10px`},children:[1,2,3].map(e=>(0,C.jsx)(`div`,{style:{width:`24px`,height:`24px`,borderRadius:`50%`,background:D>=e?`var(--accent)`:`#111`,color:D>=e?`#000`:`#444`,display:`flex`,alignItems:`center`,justifyContent:`center`,fontSize:`12px`,fontWeight:`bold`},children:e},e))})]}),(0,C.jsxs)(`div`,{style:{maxWidth:`800px`,margin:`0 auto`,background:`rgba(10, 14, 20, 0.95)`,border:`1px solid #1f2b42`,padding:`40px`,borderRadius:`4px`,boxShadow:`0 20px 60px rgba(0,0,0,0.5)`},children:[N&&(0,C.jsx)(`div`,{style:{background:`rgba(231, 76, 60, 0.12)`,border:`1px solid #e74c3c`,color:`#ff8f95`,padding:`10px 14px`,marginBottom:`20px`,fontSize:`14px`},children:N}),D===1&&(0,C.jsxs)(`div`,{className:`wizard-step`,children:[(0,C.jsx)(`h2`,{style:{color:`var(--accent)`,marginTop:0,letterSpacing:`1px`},children:`PROJECT IDENTITY`}),(0,C.jsx)(`p`,{style:{color:`#666`,marginBottom:`30px`},children:`Specify the internal registry name and primary author for this project.`}),(0,C.jsxs)(`div`,{style:{marginBottom:`25px`},children:[(0,C.jsx)(`label`,{children:`PROJECT NAME`}),(0,C.jsx)(`input`,{type:`text`,placeholder:`MY_NEW_WORLD`,value:k.name,onChange:e=>{P(null),M({...k,name:e.target.value})},style:{fontSize:`24px`,padding:`15px`}})]}),(0,C.jsxs)(`div`,{style:{marginBottom:`40px`},children:[(0,C.jsx)(`label`,{children:`PRIMARY AUTHOR`}),(0,C.jsx)(`input`,{type:`text`,placeholder:`NAME_OR_STUDIO_ID`,value:k.author,onChange:e=>M({...k,author:e.target.value})})]}),(0,C.jsxs)(`div`,{style:{display:`flex`,justifyContent:`flex-end`,gap:`15px`},children:[(0,C.jsx)(`button`,{className:`tool-btn`,onClick:()=>n(`projects`),style:{padding:`10px 30px`},children:`ABORT`}),(0,C.jsx)(`button`,{className:`tool-btn primary`,onClick:W,style:{padding:`10px 50px`},children:`PROCEED`})]})]}),D===2&&(0,C.jsxs)(`div`,{className:`wizard-step`,children:[(0,C.jsx)(`h2`,{style:{color:`var(--accent)`,marginTop:0},children:`SELECT ENGINE CORE`}),(0,C.jsx)(`p`,{style:{color:`#666`,marginBottom:`30px`},children:`Choose the foundational architecture for your game logic.`}),(0,C.jsx)(`div`,{style:{display:`grid`,gridTemplateColumns:`repeat(2, 1fr)`,gap:`20px`},children:j.map(e=>(0,C.jsxs)(`div`,{className:`project-card premium ${k.blueprint===e.id?`active`:``}`,onClick:()=>M({...k,blueprint:e.id}),style:{textAlign:`center`,height:`160px`,borderColor:k.blueprint===e.id?`var(--accent)`:`#222`},children:[(0,C.jsx)(e.icon,{size:32,color:k.blueprint===e.id?`var(--accent)`:`#444`,style:{margin:`0 auto 15px`}}),(0,C.jsx)(`div`,{style:{fontSize:`16px`,fontWeight:`bold`,color:k.blueprint===e.id?`#fff`:`#666`},children:e.name}),(0,C.jsx)(`div`,{style:{fontSize:`11px`,color:`#666`,marginTop:`10px`},children:e.desc})]},e.id))}),(0,C.jsxs)(`div`,{style:{display:`flex`,justifyContent:`space-between`,marginTop:`40px`},children:[(0,C.jsx)(`button`,{className:`tool-btn`,onClick:()=>O(1),disabled:F,style:{padding:`10px 30px`},children:`BACK`}),(0,C.jsx)(`button`,{className:`tool-btn primary`,onClick:G,disabled:F,style:{padding:`10px 50px`},children:F?`FORGING...`:`FORGE PROJECT`})]})]}),D===3&&(0,C.jsxs)(`div`,{className:`wizard-step`,style:{textAlign:`center`},children:[(0,C.jsx)(`div`,{style:{width:`80px`,height:`80px`,borderRadius:`50%`,background:`rgba(46, 204, 113, 0.1)`,color:`#2ecc71`,display:`flex`,alignItems:`center`,justifyContent:`center`,margin:`0 auto 20px`},children:(0,C.jsx)(r,{size:48})}),(0,C.jsx)(`h2`,{style:{color:`#fff`},children:`FORGING COMPLETE`}),(0,C.jsxs)(`p`,{style:{color:`#666`},children:[`Project `,(0,C.jsx)(`b`,{children:k.name.trim().toUpperCase()}),` has been registered to the engine core.`]}),(0,C.jsx)(`button`,{className:`tool-btn primary`,onClick:()=>{O(1),P(null),n(`projects`)},style:{marginTop:`40px`,padding:`15px 60px`,width:`auto`},children:`ENTER PROJECT EXPLORER`})]})]})]}),e===`settings`&&(0,C.jsxs)(`div`,{className:`view-section active`,children:[(0,C.jsx)(`h1`,{style:{borderBottom:`1px solid #1f2b42`,paddingBottom:`10px`,color:`#fff`,fontSize:`24px`},children:`STUDIO SETTINGS`}),(0,C.jsxs)(`div`,{style:{maxWidth:`600px`,margin:`20px auto`,background:`rgba(10, 14, 20, 0.95)`,border:`1px solid #1f2b42`,padding:`30px`},children:[(0,C.jsxs)(`div`,{style:{marginBottom:`25px`},children:[(0,C.jsx)(`label`,{children:`Developer Name`}),(0,C.jsx)(`input`,{type:`text`,value:T,onChange:e=>E(e.target.value)})]}),(0,C.jsxs)(`div`,{style:{display:`flex`,justifyContent:`space-between`,alignItems:`center`,background:`rgba(0,0,0,0.3)`,padding:`20px`,border:`1px solid #222`},children:[(0,C.jsxs)(`div`,{children:[(0,C.jsx)(`div`,{style:{color:`#fff`,fontSize:`1.1rem`},children:`Performance Mode`}),(0,C.jsx)(`div`,{style:{color:`#666`,fontSize:`0.9rem`},children:`Disable Blackhole WebGL Background`})]}),(0,C.jsx)(`input`,{type:`checkbox`,checked:x,onChange:e=>{w(e.target.checked),localStorage.setItem(`redglitch_perf_mode`,String(e.target.checked))},style:{width:`40px`,height:`20px`}})]}),(0,C.jsx)(`button`,{className:`tool-btn`,style:{width:`100%`,marginTop:`30px`,padding:`10px`},onClick:()=>{localStorage.setItem(`redglitch_username`,T),L.current?.show(`SETTINGS SAVED`,`success`)},children:`SAVE CONFIGURATION`})]})]}),e===`tutorials`&&(0,C.jsxs)(`div`,{className:`view-section active`,children:[(0,C.jsx)(`h1`,{style:{borderBottom:`1px solid #1f2b42`,paddingBottom:`10px`,color:`#fff`,fontSize:`24px`},children:`TUTORIALS`}),(0,C.jsxs)(`div`,{style:{display:`grid`,gridTemplateColumns:`repeat(2, 1fr)`,gap:`20px`,marginTop:`20px`},children:[(0,C.jsxs)(`div`,{className:`project-card`,onClick:()=>window.open(`../docs.html`,`_blank`,`noopener,noreferrer`),children:[(0,C.jsx)(u,{size:32,color:`var(--accent)`}),(0,C.jsx)(`div`,{style:{fontSize:`20px`,fontWeight:`bold`,margin:`10px 0`},children:`GETTING STARTED`}),(0,C.jsx)(`div`,{style:{color:`#666`},children:`Open the studio manual and engine reference.`})]}),(0,C.jsxs)(`div`,{className:`project-card`,onClick:()=>{M({name:``,author:T,blueprint:`rpg-topdown`}),P(null),O(1),n(`create`)},children:[(0,C.jsx)(u,{size:32,color:`#2ecc71`}),(0,C.jsx)(`div`,{style:{fontSize:`20px`,fontWeight:`bold`,margin:`10px 0`},children:`FORGE FIRST WORLD`}),(0,C.jsx)(`div`,{style:{color:`#666`},children:`Launch the project creation wizard now.`})]})]})]})]}),(0,C.jsx)(`style`,{children:`
                .project-card {
                    background: rgba(10, 14, 20, 0.9);
                    border: 1px solid #1f2b42;
                    padding: 25px;
                    display: flex;
                    flex-direction: column;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    overflow: hidden;
                    height: 200px;
                }

                .project-card.premium:hover {
                    border-color: var(--accent);
                    background: rgba(20, 26, 40, 0.95);
                    transform: translateY(-5px) scale(1.02);
                    box-shadow: 0 15px 40px rgba(0,0,0,0.8), 0 0 20px rgba(255, 0, 0, 0.1);
                }

                .project-card.premium.active {
                    border-color: var(--accent);
                    background: rgba(255, 0, 0, 0.05);
                }

                .project-card.premium:hover .card-glow {
                    opacity: 1;
                }

                .card-glow {
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: radial-gradient(circle at top right, rgba(255, 0, 0, 0.1), transparent 70%);
                    opacity: 0;
                    transition: opacity 0.3s;
                    pointer-events: none;
                }

                .engine-badge {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: rgba(0,0,0,0.5);
                    padding: 4px 10px;
                    border-radius: 20px;
                    border: 1px solid #222;
                    font-size: 11px;
                    color: #888;
                }

                .project-title {
                    font-size: 24px;
                    font-weight: 800;
                    color: #fff;
                    letter-spacing: 1px;
                    margin-bottom: 5px;
                    text-shadow: 0 2px 10px rgba(0,0,0,0.5);
                }

                .project-path {
                    font-size: 12px;
                    color: #444;
                    font-family: monospace;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .project-meta {
                    margin-top: auto;
                    padding-top: 15px;
                    border-top: 1px solid rgba(255,255,255,0.03);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .meta-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: #555;
                    font-size: 13px;
                }

                .launch-tag {
                    font-size: 10px;
                    color: var(--accent);
                    opacity: 0.6;
                    letter-spacing: 1px;
                    font-weight: bold;
                }

                .plus-icon-container {
                    transition: transform 0.3s;
                }

                .project-card.new-project:hover .plus-icon-container {
                    transform: rotate(90deg) scale(1.1);
                }

                .view-section { animation: fadeIn 0.3s ease-out; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
                
                .tool-btn.small { width: 24px; height: 24px; font-size: 10px; }
                .tool-btn.primary { background: var(--accent); color: #000; border-color: var(--accent); font-weight: bold; letter-spacing: 1px; }
                .tool-btn.primary:hover { background: #fff; border-color: #fff; }
                .tool-btn.danger:hover { background: #c0392b; border-color: #c0392b; color: #fff; }

                input[type="text"], input[type="number"], select, textarea {
                    width: 100%;
                    background: rgba(0,0,0,0.5);
                    border: 1px solid #222;
                    color: #fff;
                    padding: 12px 15px;
                    font-family: inherit;
                    outline: none;
                    transition: all 0.2s;
                }
                input:focus { border-color: var(--accent); background: rgba(255, 0, 0, 0.05); }
                label { display: block; color: #555; margin-bottom: 8px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; }
                
                .wizard-step { animation: slideIn 0.3s ease-out; }
                @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
            `})]})},{})}));