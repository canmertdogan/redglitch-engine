/**
 * Generates a static preview of the PAUSED state: the live retro HUD (stats)
 * underneath + the pause overlay on top, proving the stats are NOT hidden.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const redui = JSON.parse(fs.readFileSync(path.join(ROOT, 'projects/Default Project/interfaces/main.redui'), 'utf8'));
const state = { player: { level: 7, hp: 18, maxHp: 100, mana: 42, maxMana: 100, stamina: 80, maxStamina: 100, coins: 1340, xp: 4820, xpNext: 8000 }, gameTimeFormatted: '04:21' };
const ANCHOR = { 'top-left':'top:0;left:0;transform:none', 'top-center':'top:0;left:50%;transform:translateX(-50%)', 'top-right':'top:0;left:100%;transform:translateX(-100%)', 'bottom-left':'top:100%;left:0;transform:translateY(-100%)', 'bottom-center':'top:100%;left:50%;transform:translate(-50%,-100%)', 'bottom-right':'top:100%;left:100%;transform:translate(-100%,-100%)', 'center':'top:50%;left:50%;transform:translate(-50%,-50%)', 'center-left':'top:50%;left:0;transform:translateY(-50%)', 'center-right':'top:50%;left:100%;transform:translate(-100%,-50%)' };
const resolve = (p,o)=>p.split('.').reduce((c,k)=>c?.[k],o);
const parseText = (t)=>t==null?'':String(t).replace(/\{[\w.]+\}/g,m=>resolve(m.slice(1,-1),state)??m);
const baseW=redui.resolution.w, baseH=redui.resolution.h, pal=redui.designSystem.palette;
const palVars=Object.entries(pal).map(([k,v])=>`--hud-${k}:${v}`).join(';');
const CSS=`
*{box-sizing:border-box} body{margin:0;background:#05070d;font-family:'Press Start 2P','VT323',monospace;color:#f4f7ff;display:flex;flex-direction:column;align-items:center}
#preview-stage{position:relative;width:960px;height:540px;margin:24px auto;background:repeating-linear-gradient(0deg,#0a0f1a 0 32px,#080c15 32px 64px),linear-gradient(180deg,#0a0f1a,#05070d);box-shadow:inset 0 0 0 1px rgba(255,255,255,.05),0 30px 80px rgba(0,0,0,.6);overflow:hidden;border-radius:4px}
#preview-root{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(1.2);width:${baseW}px;height:${baseH}px;${palVars};font-family:'Press Start 2P','VT323',monospace;image-rendering:pixelated}
.hud-element{position:absolute;display:flex;align-items:center;border-radius:0;transition:none;image-rendering:pixelated}
.hud-element.hud-type-panel{background:rgba(20,24,38,.82);border:2px solid #000;box-shadow:inset 2px 2px 0 rgba(255,255,255,.10),inset -2px -2px 0 rgba(0,0,0,.45),3px 3px 0 rgba(0,0,0,.6)}
.hud-element.hud-type-label{text-shadow:2px 2px 0 #000;letter-spacing:1px}
.hud-element.hud-type-button{border:2px solid #000;background:rgba(20,24,38,.9);box-shadow:inset 2px 2px 0 rgba(255,255,255,.18),inset -2px -2px 0 rgba(0,0,0,.35),3px 3px 0 rgba(0,0,0,.6);text-transform:uppercase;letter-spacing:1px}
.hud-element.hud-type-bar{border:2px solid #000;background:#0b0d14;box-shadow:inset 2px 2px 0 rgba(0,0,0,.55),3px 3px 0 rgba(0,0,0,.6);overflow:hidden}
.hud-bar-fill{position:absolute;top:0;left:0;height:100%;background:var(--bar-color);box-shadow:inset -3px 0 0 rgba(0,0,0,.45),inset 0 2px 0 rgba(255,255,255,.28),inset 0 -3px 0 rgba(0,0,0,.3);image-rendering:pixelated;transition:width .18s steps(8)}
.hud-bar-ticks{position:absolute;inset:0;pointer-events:none;z-index:1}
.hud-bar-label{position:relative;z-index:2;width:100%;text-align:center;font-size:11px;text-shadow:2px 2px 0 #000}
.hud-element.hud-type-slot{background:#1b2030;border:2px solid #000;box-shadow:inset 2px 2px 0 rgba(255,255,255,.10),inset -2px -2px 0 rgba(0,0,0,.5),3px 3px 0 rgba(0,0,0,.6);image-rendering:pixelated}
.hud-element.hud-type-slot.is-active{border-color:#fff;box-shadow:inset 0 0 0 1px #fff,inset 2px 2px 0 rgba(255,255,255,.14),0 0 0 2px #fff,3px 3px 0 rgba(0,0,0,.6)}
.slot-key{position:absolute;top:2px;left:3px;font-size:10px;color:#fff;text-shadow:1px 1px 0 #000}
.hud-crt{position:absolute;inset:0;pointer-events:none;z-index:6;background:repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0 1px,transparent 1px 3px);opacity:.5;mix-blend-mode:multiply}
.hint{color:#8a93a8;font-family:monospace;font-size:12px;margin:8px 0 30px;text-align:center;max-width:960px}
`;
function buildEl(e){
  const r=e.rect||{x:0,y:0,w:100,h:30}, a=e.anchor||'top-left', at=ANCHOR[a], s=e.style||{}, p=e.props||{};
  let mx='',my='';
  if(a.includes('left')) mx=`margin-left:${r.x}px`;
  if(a.includes('right')) mx=`margin-right:${r.x}px`;
  if(a.includes('top')||a.includes('bottom')||a==='center') my=`margin-top:${r.y}px`;
  const style=[`top:${at.split(';')[0].split(':')[1]}`,`left:${at.split(';')[1].split(':')[1]}`,`transform:${at.split(';')[2].split(':')[1]}`,`width:${r.w}px`,`height:${r.h}px`,mx,my,s.color?`color:${s.color}`:'',s.backgroundColor?`background:${s.backgroundColor}`:'',s.borderWidth?`border:${s.borderWidth}px solid ${s.borderColor||'transparent'}`:'',s.boxShadow?`box-shadow:${s.boxShadow}`:'',s.fontSize?`font-size:${s.fontSize}px`:'',s.fontWeight?`font-weight:${s.fontWeight}`:'',s.textAlign?`justify-content:${s.textAlign==='center'?'center':s.textAlign==='right'?'flex-end':'flex-start'}`:'',s.letterSpacing!==undefined?`letter-spacing:${s.letterSpacing}px`:'',s.textShadow?`text-shadow:${s.textShadow}`:'',s.zIndex!==undefined?`z-index:${s.zIndex}`:'',s.opacity!==undefined?`opacity:${s.opacity}`:''].filter(Boolean).join(';');
  let inner='';
  if(e.type==='bar'){const cur=resolve(p.variable,state)||0,max=resolve(p.maxVariable,state)||1,pct=Math.max(0,Math.min(100,cur/max*100)),col=p.fillColor||'#e74c3c';let ticks='';if(p.ticks&&Number(p.ticks)>0){const n=Number(p.ticks),step=100/n;ticks=`<div class="hud-bar-ticks" style="background:repeating-linear-gradient(90deg,transparent 0,transparent calc(${step}% - 2px),rgba(0,0,0,.6) calc(${step}% - 2px),rgba(0,0,0,.6) calc(${step}%))"></div>`;}inner=`<div class="hud-bar-fill" style="width:${pct}%;--bar-color:${col}"></div>${ticks}<div class="hud-bar-label">${parseText(e.text)}</div>`;}
  else if(e.type==='slot'){inner=`<span class="slot-key">${parseText(e.text)}</span>`;}
  else{inner=parseText(e.text);}
  const active=p.selected?' is-active':'';
  return `<div class="hud-element hud-type-${e.type}${active}" style="${style}">${inner}</div>`;
}
const underlay = redui.screens.main_hud.elements.map(buildEl).join('\n');
const overlay = redui.screens.pause_menu.elements.map(buildEl).join('\n');
const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
<body><div id="preview-stage"><div id="preview-root">${underlay}\n${overlay}</div><div class="hud-crt"></div></div>
<div class="hint">PAUSED state — the retro stats (HP/MP/ST/level/inventory) stay VISIBLE underneath the pause menu. Scrim is translucent (z90), stat panels are z95+ so they read clearly through it. This is the fix for "pause overlaps the stats underneath".</div></body></html>`;
const out=path.join(ROOT,'scripts','hud_preview_pause.html');
fs.writeFileSync(out,html);
console.log('wrote',out);
