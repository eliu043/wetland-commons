import {W,H,SPECIES,DEFAULTS,bank,createWorld,breach,step,metrics,distances,suitable} from './model.mjs';
import {HORIZON,CHECKPOINTS,nextCheckpoint,previewBreach} from './decisions.mjs';
import {icon,paintIcon} from './icons.mjs';
const $ = selector => document.querySelector(selector);
const canvas = $('#map'), ctx = canvas.getContext('2d');
const settings = {...DEFAULTS};
const colors = {water:'#244c52',river:'#32656a',marsh:'#72906b',mud:'#a28a64',levee:'#d9b86b',developed:'#b6b7a2',fresh:'#a9cebd',brackish:'#557d85',salty:'#344e83'};
const speciesColors = ['#f0c398','#c9e4f5','#e0efb2'];
let world, base, history, baseHistory, breachHistory;
let layer = 'land', timer = null, selected = -1, preview = null, lost = [];
const signed = value => `${value > 0 ? '+' : ''}${value}`;
const tileName = t => t.breach ? 'Open breach' : t.type[0].toUpperCase() + t.type.slice(1);

function pause() {
  clearInterval(timer); timer = null;
  $('#play').textContent = `▶ To year ${nextCheckpoint(world?.year ?? 0)}`;
  $('#status').textContent = 'PAUSED';
}
function reset() {
  pause(); world = createWorld(); base = createWorld();
  history = [metrics(world)]; baseHistory = [metrics(base)]; breachHistory = [0];
  selected = -1; preview = null; lost = []; render();
}
function advance() {
  if (world.year >= HORIZON) { pause(); return; }
  const previous = world;
  world = step(world, settings); base = step(base, settings);
  lost = [];
  previous.tiles.forEach((t, i) => SPECIES.forEach((s, k) => {
    if (t.occupied[k] && !world.tiles[i].occupied[k]) lost.push({i, k});
  }));
  history.push(metrics(world)); baseHistory.push(metrics(base)); breachHistory.push(world.breaches.length);
  if (selected >= 0 && world.tiles[selected].type === 'levee') preview = previewBreach(world, selected, settings);
  if (CHECKPOINTS.includes(world.year)) pause();
  render();
}
function selectTile(i) {
  if (i < 0 || i >= W * H) return;
  pause(); selected = i;
  preview = world.year < HORIZON ? previewBreach(world, i, settings) : null;
  render();
}
function commit() {
  if (world.year >= HORIZON || !preview) return;
  if (breach(world, selected)) {
    breachHistory[world.year] = world.breaches.length;
    preview = null; render();
  }
}
function play() {
  if (timer) { pause(); return; }
  if (world.year >= HORIZON) return;
  // A selected preview is refreshed by advance() as the landscape changes.
  timer = setInterval(advance, 650);
  $('#play').textContent = 'Ⅱ Pause'; $('#status').textContent = 'RUNNING';
}
function drawProgress(t, x, y, cw, ch) {
  const progress = t.type === 'mud' ? t.mudAge : t.type === 'water' && !t.breach ? t.sediment : 0;
  if ((t.type === 'mud' || progress) && layer !== 'salinity') {
    for (let n = 0; n < 3; n++) {
      ctx.fillStyle = n < progress ? '#eef0b7' : '#17322c';
      ctx.fillRect(x + 2 + n * (cw - 4) / 3, y + ch - 4, (cw - 7) / 3, 2);
    }
  }
  if (t.type === 'marsh' && t.saltAge > 0) {
    for (let n = 0; n < 5; n++) {
      ctx.fillStyle = n < t.saltAge ? '#f8ce7a' : '#334333';
      ctx.fillRect(x + 2 + n * (cw - 4) / 5, y + 2, (cw - 7) / 5, 2);
    }
  }
}
function draw() {
  const cw = canvas.width / W, ch = canvas.height / H;
  const d = distances(world), fresh = new Set(preview?.fresh), sediment = new Set(preview?.sediment);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  world.tiles.forEach((t, i) => {
    const x = t.x * cw, y = t.y * ch;
    ctx.fillStyle = layer === 'salinity' && !['river','levee','developed'].includes(t.type) ? colors[t.salt] : colors[t.type];
    ctx.fillRect(x, y, cw, ch);
    if (t.type === 'marsh' && layer !== 'salinity') {
      ctx.fillStyle = `rgba(24,54,32,${.07 + (i * 7 % 5) * .02})`;
      ctx.fillRect(x + 2, y + 2, cw - 4, ch - 4);
      if (t.saltAge > 0) { ctx.fillStyle = `rgba(214,187,100,${t.saltAge * .13})`; ctx.fillRect(x, y, cw, ch); }
    }
    if (t.type === 'water' && t.sediment > 0 && layer !== 'salinity') {
      ctx.fillStyle = `rgba(189,164,112,${t.sediment * .19})`; ctx.fillRect(x, y, cw, ch);
    }
    ctx.strokeStyle = '#0c242517'; ctx.strokeRect(x, y, cw, ch);
    if (layer === 'land' && d[i] <= settings.sedimentRadius && !t.breach) {
      ctx.strokeStyle = '#d7e89d30'; ctx.strokeRect(x + .5, y + .5, cw - 1, ch - 1);
    }
    if (fresh.has(i)) { ctx.fillStyle = '#b5f0e343'; ctx.fillRect(x, y, cw, ch); }
    if (sediment.has(i)) {
      ctx.strokeStyle = '#ffdb86'; ctx.setLineDash([3, 2]);
      ctx.strokeRect(x + 2, y + 2, cw - 4, ch - 4); ctx.setLineDash([]);
    }
    drawProgress(t, x, y, cw, ch);
    if (t.breach) paintIcon(ctx, 'breach', x, y, cw, '#f2edb0');
  });
  // One representative per species in each 4x4 patch. Habitat layer shows more patches.
  if (layer !== 'salinity') {
    const patches = new Set(), patchSize = layer === 'habitat' ? 3 : 5;
    world.tiles.forEach((t, i) => t.occupied.forEach((occupied, k) => {
      if (!occupied) return;
      const key = `${Math.floor(t.x / patchSize)},${Math.floor(t.y / patchSize)},${k}`;
      if (patches.has(key)) return;
      patches.add(key);
      const stressed = !suitable(world.tiles, i, k);
      ctx.fillStyle = '#142c26bd'; ctx.fillRect(t.x * cw - 2, t.y * ch - 1, cw + 4, ch + 2);
      paintIcon(ctx, SPECIES[k], t.x * cw, t.y * ch, cw, speciesColors[k], stressed);
      if (stressed) { ctx.fillStyle = '#ffe1a1'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('1', t.x * cw + cw - 5, t.y * ch + 7); }
    }));
    const patchesLost = new Set();
    lost.forEach(({i, k}) => {
      const t = world.tiles[i], key = `${Math.floor(t.x / 5)},${Math.floor(t.y / 5)},${k}`;
      if (patchesLost.has(key)) return; patchesLost.add(key);
      paintIcon(ctx, SPECIES[k], t.x * cw, t.y * ch, cw, speciesColors[k], true, .35);
      ctx.strokeStyle = '#f1b1a0'; ctx.beginPath();
      ctx.moveTo(t.x * cw + 6, t.y * ch + 6); ctx.lineTo(t.x * cw + 18, t.y * ch + 18);
      ctx.moveTo(t.x * cw + 18, t.y * ch + 6); ctx.lineTo(t.x * cw + 6, t.y * ch + 18); ctx.stroke();
    });
  }
  if (selected >= 0) {
    const t = world.tiles[selected]; ctx.strokeStyle = '#ffffcf'; ctx.lineWidth = 3;
    ctx.strokeRect(t.x * cw - 1, t.y * ch - 1, cw + 2, ch + 2); ctx.lineWidth = 1;
  }
  const legends = layer === 'salinity' ? [['Fresh','fresh'],['Brackish','brackish'],['Salty','salty'],['Levee','levee']] : [['Water','water'],['Marsh','marsh'],['Mud','mud'],['Levee · preview','levee'],['Developed','developed']];
  $('#legend').innerHTML = legends.map(([name,c]) => `<span><i style="background:${colors[c]}"></i>${name}</span>`).join('') + (preview ? '<span class="preview-key">Pale wash: added fresh reach · Gold dashes: added deposition</span>' : '');
}
function chart() {
  const show = $('#baseline').checked;
  const max = Math.ceil(Math.max(10, ...history.flatMap(h => SPECIES.map(s => h[s])), ...baseHistory.flatMap(h => SPECIES.map(s => h[s]))) / 50) * 50;
  let out = '';
  for (let n = 0; n <= 4; n++) {
    const y = 185 - n * 40;
    out += `<line x1="42" x2="880" y1="${y}" y2="${y}" stroke="#34483b"/><text x="30" y="${y+3}" text-anchor="end" fill="#8da49a" font-size="9">${Math.round(max*n/4)}</text>`;
  }
  for (let n = 0; n <= HORIZON; n += 5) out += `<text x="${42+n/HORIZON*838}" y="207" text-anchor="middle" fill="#8da49a" font-size="9">${n===0?'Year 0':n}</text>`;
  for (const year of CHECKPOINTS) out += `<line x1="${42+year/HORIZON*838}" x2="${42+year/HORIZON*838}" y1="25" y2="185" stroke="#d6e89d17" stroke-dasharray="2 4"/>`;
  SPECIES.forEach((s,k) => {
    for (const baseline of [true,false]) {
      if (baseline && !show) continue;
      const hs = baseline ? baseHistory : history;
      const points = hs.map((h,n) => `${42+n/HORIZON*838},${185-h[s]/max*160}`).join(' ');
      out += `<polyline points="${points}" fill="none" stroke="${speciesColors[k]}" stroke-width="${baseline?1.5:2.5}" ${baseline?'stroke-dasharray="5 5" opacity=".45"':''}/>`;
      if (!baseline) out += `<circle cx="${42+(hs.length-1)/HORIZON*838}" cy="${185-hs.at(-1)[s]/max*160}" r="3" fill="${speciesColors[k]}"/>`;
    }
  });
  $('#chart').innerHTML = out;
}
function inspect(i) {
  const t = world.tiles[i];
  $('#tileInfo').textContent = `${tileName(t)} · ${t.type === 'river' ? 'fresh' : t.salt}${t.type === 'levee' ? ' · click to preview' : ''}`;
}
function inspection() {
  if (selected < 0) { $('#inspection').innerHTML = 'Click a tile to inspect its growth, stress, and species.'; return; }
  const t = world.tiles[selected], d = distances(world)[selected];
  let state = '';
  if (t.type === 'water' && !t.breach) state = d <= settings.sedimentRadius ? `Sediment ${t.sediment}/3 · ${3-t.sediment} years to mud with continued supply` : 'No sediment supply from an open breach';
  if (t.type === 'mud') state = `Mud growth ${t.mudAge}/3 · ${3-t.mudAge} years to marsh${d > settings.sedimentRadius ? ' · supply absent; growth paused' : ' with continued supply'}`;
  if (t.type === 'marsh') state = t.saltAge ? `Salt stress ${t.saltAge}/5 · ${5-t.saltAge} salty years until loss` : 'No accumulated salt stress';
  if (t.breach) state = 'Permanent freshwater connection · channel stays open';
  if (t.type === 'levee') state = world.breaches.length >= 3 ? 'All three opening tokens are spent.' : world.year >= HORIZON ? 'Experiment complete. Reset to try this site.' : 'Preview this connection in the decision panel.';
  if (t.type === 'developed') state = 'Developed land blocks spread · flood damage is not modeled';
  if (t.type === 'river') state = 'Main river · freshwater source outside basin habitat counts';
  const statuses = SPECIES.map((s,k) => {
    const fits = suitable(world.tiles, selected, k), occupied = t.occupied[k];
    const status = occupied ? fits ? 'Suitable' : 'Stressed · 1 year left' : 'No occupied habitat';
    return `<span class="tile-species ${occupied ? '' : 'absent'}" style="--species:${speciesColors[k]}">${icon(s, occupied && !fits ? 'outline' : '')}<span>${s}<small>${status}</small></span></span>`;
  }).join('');
  $('#inspection').innerHTML = `<div><b>${tileName(t)} / ${t.x+1}, ${t.y+1}</b><span>${state}</span></div><div class="tile-species-list">${statuses}</div>`;
  inspect(selected);
}
function renderPreview() {
  $('#tokens').innerHTML = [0,1,2].map(n => `<span class="token ${n < world.breaches.length ? 'spent' : ''}" aria-label="${n < world.breaches.length ? 'Spent' : 'Available'} opening">${icon('breach')}</span>`).join('') + `<small>${3-world.breaches.length} openings left</small>`;
  document.querySelectorAll('[data-site]').forEach(button => {
    const y = +button.dataset.site, i = y * W + bank(y);
    button.disabled = world.tiles[i].type !== 'levee' || world.breaches.length >= 3 || world.year >= HORIZON;
    button.classList.toggle('selected', selected === i && !!preview);
    button.textContent = world.tiles[i].breach ? '✓ Breach open' : `Preview ${{8:'upstream',15:'mid-basin',23:'downstream'}[y]}`;
  });
  if (!preview) {
    $('#preview').innerHTML = `<p class="preview-empty">${world.year >= HORIZON ? 'Experiment complete. Compare your results below, then reset to try another strategy.' : world.breaches.length >= 3 ? 'All openings committed. Watch the consequences unfold.' : 'Select a levee to preview an opening. You can also wait and keep your tokens.'}</p>`;
    return;
  }
  $('#preview').innerHTML = `<p class="eyebrow">BEFORE YOU COMMIT</p><div class="footprint-counts"><span><b>${preview.fresh.length}</b> newly fresh tiles</span><span><b>${preview.sediment.length}</b> added deposition tiles</span><span><b>${preview.oysters.length}</b> occupied oyster tiles exposed to freshening</span></div><div class="forecast"><b>Year ${world.year+preview.years}: opening vs. waiting</b><span>${signed(preview.delta.marsh)} marsh · ${signed(preview.delta.oyster)} oyster tiles</span><span>${signed(preview.delta.shrimp)} shrimp · ${signed(preview.delta.alligator)} alligator tiles</span><small>Same rules, no further openings. Overlapping reach adds no extra supply.</small></div><button id="commit" class="primary">${icon('breach')} Commit one opening</button><button id="cancelPreview" class="quiet">Cancel preview</button>`;
  $('#commit').onclick = commit;
  $('#cancelPreview').onclick = () => { preview = null; selected = -1; render(); };
}
function renderDecision() {
  const year = world.year, last = world.events[0];
  let title = 'Your first decision', text = 'Choose a connection, or advance time to observe the untouched basin.';
  if (year === HORIZON) { title = 'Year 20 · Your basin, your tradeoffs'; text = 'Compare with the untouched basin below. Unused openings are allowed; there is no single ecological score.'; }
  else if (year === 3) { title = 'Year 3 · Look for new mud'; text = 'Sediment needs time. Inspect growth before committing another opening—or wait for marsh.'; }
  else if (year === 6) { title = 'Year 6 · Has land become habitat?'; text = 'The earliest mud can now mature. Compare oyster, shrimp, and alligator habitat before choosing again.'; }
  else if (CHECKPOINTS.includes(year)) { title = `Year ${year} · Reconsider your next opening`; text = `${world.breaches.length < 3 ? 'Keep an opening in reserve or connect a new site.' : 'All openings are committed; inspect how their effects persist.'} Playback paused for your review.`; }
  else if (year > 0) { title = `Year ${year} · Effects are unfolding`; text = `${last.built} new marsh · ${last.mud} new mud · ${last.lost} marsh lost. Next review: year ${nextCheckpoint(year)}.`; }
  $('#decision').innerHTML = `<b>${title}</b><span>${text}</span>`;
}
function render() {
  draw(); chart(); renderPreview(); renderDecision(); inspection();
  $('#year').textContent = String(world.year).padStart(2,'0');
  $('#breachCount').textContent = `${world.breaches.length} / 3 BREACHES OPEN · PERMANENT`;
  $('#next').disabled = world.year >= HORIZON; $('#play').disabled = world.year >= HORIZON;
  if (!timer) $('#play').textContent = world.year >= HORIZON ? 'Run complete' : `▶ To year ${nextCheckpoint(world.year)}`;
  const player = metrics(world), untouched = metrics(base);
  $('#cards').innerHTML = ['marsh',...SPECIES].map((s,k) => `<div class="card" style="--c:${k ? speciesColors[k-1] : '#c3d78c'}"><div class="card-title"><span>${['Marsh cover','Oyster habitat','Shrimp habitat','Alligator habitat'][k]}</span>${icon(s)}</div><div class="card-number">${player[s]}<small>tiles</small></div><div class="card-note">${$('#baseline').checked ? `${signed(player[s]-untouched[s])} vs. untouched basin` : 'Untouched comparison hidden'}</div></div>`).join('');
  $('#log').innerHTML = world.events.length ? world.events.map((e,k) => `<div class="log-entry"><b>YEAR ${world.year-k}</b> · ${e.built} new marsh · ${e.mud} new mud<br>${e.lost} marsh tiles lost to salt or erosion.</div>`).join('') : '<div class="log-entry"><b>YEAR 0 · A landscape in waiting.</b><br>Preview a connection. The untouched basin evolves alongside yours.</div>';
}
function mapIndex(event) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX-rect.left)/rect.width*W), y = Math.floor((event.clientY-rect.top)/rect.height*H);
  return x >= 0 && x < W && y >= 0 && y < H ? y*W+x : -1;
}
canvas.addEventListener('mousemove', event => { const i = mapIndex(event); if (i >= 0) inspect(i); });
canvas.addEventListener('mouseleave', () => {
  if (selected >= 0) inspect(selected); else $('#tileInfo').textContent = 'Select a levee to preview. An opening is permanent for this run.';
});
canvas.addEventListener('click', event => selectTile(mapIndex(event)));
document.querySelectorAll('[data-layer]').forEach(button => button.onclick = () => {
  layer = button.dataset.layer;
  document.querySelectorAll('[data-layer]').forEach(t => { t.classList.toggle('active', t === button); t.setAttribute('aria-pressed', String(t === button)); });
  draw();
});
document.querySelectorAll('[data-site]').forEach(button => button.onclick = () => selectTile(+button.dataset.site*W+bank(+button.dataset.site)));
$('#next').onclick = () => { pause(); advance(); };
$('#reset').onclick = reset; $('#play').onclick = play;
$('#erosion').onchange = event => { settings.erosion = event.target.checked; reset(); };
$('#baseline').onchange = render;
$('#aboutButton').onclick = () => $('#about').showModal();
$('#closeAbout').onclick = () => $('#about').close();
$('#download').onclick = () => {
  const rows = ['year,basin,marsh,mud,oyster,shrimp,alligator,breaches,erosion'];
  history.forEach((h,i) => [h,baseHistory[i]].forEach((m,k) => rows.push([i,k?'untouched':'player',m.marsh,m.mud,...SPECIES.map(s=>m[s]),k?0:breachHistory[i],settings.erosion].join(','))));
  const url = URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv'}));
  const link = document.createElement('a'); link.href = url; link.download = 'levee-lab-yearly-results.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
};
$('#iconKey').innerHTML = SPECIES.map((s,k) => `<span style="color:${speciesColors[k]}">${icon(s)} ${s}</span>`).join('');
reset();
