const tooltipEl = document.getElementById('tooltip');

function updateUI() {
  document.getElementById('wood').textContent = Math.floor(resources.wood);
  document.getElementById('stone').textContent = Math.floor(resources.stone);
  document.getElementById('food').textContent = Math.floor(resources.food);
  document.getElementById('wheat').textContent = Math.floor(resources.wheat);
  const sciEl = document.getElementById('science');
  if (sciEl) sciEl.textContent = Math.floor(resources.science);
  document.getElementById('pop').textContent = villagers.length;
  document.getElementById('max-wood').textContent = maxCapacity;
  document.getElementById('max-stone').textContent = maxCapacity;
  document.getElementById('max-food').textContent = maxCapacity;
  document.getElementById('max-wheat').textContent = maxCapacity;
}

let hintTimer = null;
function flashHint(msg) {
  const h = document.getElementById('hint');
  h.textContent = msg; h.style.color = '#a02020';
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { h.textContent = ORIGINAL_HINT; h.style.color = '#1a1a1a'; }, 1500);
}

function canAfford(c) { for (const k in c) if (resources[k] < c[k]) return false; return true; }
function pay(c) { for (const k in c) resources[k] -= c[k]; }
function refund(c) { for (const k in c) resources[k] += Math.floor(c[k] / 2); }

function updateTooltip() {
  if (cursor.valid && tool === 'none') {
    const t = tileAt(cursor.gx, cursor.gy);
    if (t && t.obj && (BUILDINGS[t.obj.kind] || t.obj.kind === 'farm' || t.obj.kind === 'warehouse')) {
      const b = BUILDINGS[t.obj.kind] || { name: 'ОГОРОД' };
      let h = `<b>${b.name}</b><br>`;
      if (t.obj.closed) h += `<span style="color:#a02020">ЗАКРЫТО (ПКМ)</span><br>`;
      if (t.obj.kind === 'farm') {
        let rc = 0, pc = 0;
        if (t.obj.area) for (const tile of t.obj.area) { if (tile.ready) rc++; if (tile.plowProgress >= 100) pc++; }
        h += `Вспахано: ${pc}/${t.obj.area?.length || 0}<br>Готово: ${rc}<br>`;
        if (t.obj.worker) h += `<span style="color:green">РАБОЧИЙ ЕСТЬ</span>`;
        else h += `<span style="color:#a02020">НУЖЕН РАБОЧИЙ</span>`;
      } else if (t.obj.kind === 'warehouse') {
        h += `Лимит: ${t.obj.capacity || 0}<br><span style="color:green">АКТИВЕН</span>`;
      } else if (t.obj.kind === 'tower') {
        h += `<span style="color:green">РАСШИРЯЕТ КАРТУ</span>`;
      } else if (t.obj.kind === 'laboratory') {
        h += `[N] +10 Науки / 5с<br>`;
        if (t.obj.closed) h += `<span style="color:#a02020">ЗАКРЫТ</span>`;
        else if (t.obj.worker) h += `<span style="color:green">В РАБОТЕ</span>`;
        else h += `<span style="color:#a02020">НУЖЕН РАБОЧИЙ</span>`;
      } else {
        if (t.obj.kind === 'lumber') h += `[W] +10 / 5с<br><i>Нужно дерево рядом</i><br>`;
        if (t.obj.kind === 'quarry') h += `[S] +10 / 5с<br>`;
        if (t.obj.kind === 'mill') h += `[G] -2/с → [F] +1/с<br>`;
        if (t.obj.kind === 'fisher') h += `[F] +10 / 10с<br><i>У воды</i><br>`;
        if (b.pop > 0) h += `+${b.pop} места<br>`;
        if (t.obj.kind === 'lumber' || t.obj.kind === 'quarry' || t.obj.kind === 'mill' || t.obj.kind === 'fisher') {
          if (t.obj.closed) h += `<span style="color:#a02020">ЗАКРЫТ</span>`;
          else if (t.obj.worker) h += t.obj.active ? `<span style="color:green">В РАБОТЕ</span>` : `<span style="color:orange">ИДЕТ</span>`;
          else h += `<span style="color:#a02020">НУЖЕН РАБОЧИЙ</span>`;
        }
      }
      tooltipEl.innerHTML = h;
      tooltipEl.style.display = 'block';
      tooltipEl.style.left = (cursor.screenX + 15) + 'px';
      tooltipEl.style.top = (cursor.screenY + 15) + 'px';
      return;
    }
  }
  tooltipEl.style.display = 'none';
}

let currentTab = 'build';
function switchTab(name) {
  if (currentTab === name) return;
  currentTab = name;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  const panels = { build: 'panel-build', science: 'panel-science', settings: 'panel-settings' };
  for (const k in panels) {
    const el = document.getElementById(panels[k]);
    if (k === name) { el.classList.remove('hidden'); el.classList.remove('page-flip'); void el.offsetWidth; el.classList.add('page-flip'); }
    else el.classList.add('hidden');
  }
}

function initSettings() {
  document.getElementById('sfx-vol').addEventListener('input', e => { const v = parseInt(e.target.value) / 100; audio.setSfx(v); document.getElementById('sfx-val').textContent = e.target.value; });
  document.getElementById('music-vol').addEventListener('input', e => { const v = parseInt(e.target.value) / 100; audio.setMusic(v); document.getElementById('music-val').textContent = e.target.value; });
}

function renderScience() {
  const g = document.getElementById('sci-grid');
  g.innerHTML = '';
  for (const key in science) {
    const s = science[key];
    const item = document.createElement('div');
    item.className = 'sci-item' + (s.unlocked ? ' unlocked' : '');
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const info = document.createElement('div'); info.className = 'info';
    info.innerHTML = `<b>${s.name}</b><small>${s.desc}<br>Цена: ${s.cost} [N]</small>`;
    const st = document.createElement('div'); st.className = 'status';
    st.innerHTML = s.unlocked ? '<span style="color:#278027">ИЗУЧЕНО</span>' : '<span style="color:#a02020">ИЗУЧИТЬ</span>';
    item.appendChild(cv); item.appendChild(info); item.appendChild(st);
    g.appendChild(item);
    drawThumb(cv, key);
    if (!s.unlocked) item.addEventListener('click', () => {
      if (resources.science < s.cost) { flashHint('НЕ ХВАТАЕТ НАУКИ!'); return; }
      resources.science -= s.cost;
      science.fisher.unlocked = true;
      document.getElementById('btn-fisher').style.display = 'flex';
      renderScience();
      updateUI();
      flashHint('ДОМИК РЫБАКА ИЗУЧЕН');
    });
  }
}

function drawThumb(cv, kind) {
  const c = cv.getContext('2d');
  c.clearRect(0, 0, 64, 64);
  c.strokeStyle = INK; c.lineWidth = 2; c.lineCap = 'round'; c.lineJoin = 'round';
  const cx = 32, cy = 44;
  if (kind === 'house' || kind === 'fisher') {
    c.fillStyle = PAPER;
    c.beginPath(); c.moveTo(cx-18, cy); c.lineTo(cx+18, cy); c.lineTo(cx+18, cy-18); c.lineTo(cx-18, cy-18); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(cx-22, cy-18); c.lineTo(cx, cy-34); c.lineTo(cx+22, cy-18); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = INK; c.fillRect(cx-4, cy-12, 8, 12);
  } else if (kind === 'laboratory') {
    c.fillStyle = PAPER;
    c.beginPath(); c.moveTo(cx-18, cy); c.lineTo(cx+18, cy); c.lineTo(cx+18, cy-18); c.lineTo(cx-18, cy-18); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(cx-22, cy-18); c.lineTo(cx, cy-34); c.lineTo(cx+22, cy-18); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#50d050'; c.beginPath(); c.arc(cx+8, cy-24, 5, 0, Math.PI*2); c.fill();
  } else if (kind === 'farm') {
    c.strokeStyle = '#8a7a6a'; c.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(cx-18, cy-6+i*4); c.lineTo(cx+18, cy-6+i*4); c.stroke(); }
    c.strokeStyle = INK;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(cx-8+i*8, cy); c.lineTo(cx-8+i*8, cy-10); c.stroke(); }
  } else if (kind === 'mill') {
    c.fillStyle = PAPER;
    c.beginPath(); c.moveTo(cx-14, cy); c.lineTo(cx+14, cy); c.lineTo(cx+10, cy-22); c.lineTo(cx-10, cy-22); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(cx-14, cy-22); c.lineTo(cx, cy-32); c.lineTo(cx+14, cy-22); c.closePath(); c.fill(); c.stroke();
    for (let i = 0; i < 4; i++) { const a = i*Math.PI/2 + .3; c.beginPath(); c.moveTo(cx, cy-22); c.lineTo(cx+Math.cos(a)*14, cy-22+Math.sin(a)*14); c.stroke(); }
  } else if (kind === 'lumber') {
    c.fillStyle = PAPER;
    c.beginPath(); c.moveTo(cx-16, cy); c.lineTo(cx+16, cy); c.lineTo(cx+12, cy-14); c.lineTo(cx-12, cy-14); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(cx-16, cy-14); c.lineTo(cx, cy-24); c.lineTo(cx+16, cy-14); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = INK; c.fillRect(cx-6, cy-8, 12, 8);
  } else if (kind === 'quarry') {
    c.beginPath(); c.moveTo(cx-18, cy); c.lineTo(cx-12, cy-16); c.lineTo(cx+6, cy-20); c.lineTo(cx+18, cy-10); c.lineTo(cx+18, cy); c.closePath();
    c.fillStyle = PAPER; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(cx-10, cy-8); c.lineTo(cx, cy-16); c.lineTo(cx+10, cy-8); c.stroke();
  } else if (kind === 'warehouse') {
    c.fillStyle = PAPER;
    c.beginPath(); c.moveTo(cx-20, cy); c.lineTo(cx+20, cy); c.lineTo(cx+20, cy-20); c.lineTo(cx-20, cy-20); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(cx-22, cy-20); c.lineTo(cx, cy-30); c.lineTo(cx+22, cy-20); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = INK; c.fillRect(cx-4, cy-14, 8, 14);
  } else if (kind === 'tower') {
    c.fillStyle = PAPER; c.fillRect(cx-10, cy-26, 20, 26); c.strokeRect(cx-10, cy-26, 20, 26);
    for (let i = 0; i < 3; i++) c.fillRect(cx-10+i*8, cy-32, 6, 6);
    c.beginPath(); c.moveTo(cx, cy-32); c.lineTo(cx, cy-42); c.stroke();
    c.fillStyle = '#a02020'; c.beginPath(); c.moveTo(cx, cy-42); c.lineTo(cx+8, cy-40); c.lineTo(cx, cy-38); c.closePath(); c.fill();
  } else if (kind === 'remove') {
    c.strokeStyle = '#a02020'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx-12, cy-24); c.lineTo(cx+12, cy); c.moveTo(cx+12, cy-24); c.lineTo(cx-12, cy); c.stroke();
  } else if (kind === 'none') {
    c.strokeStyle = INK;
    c.beginPath(); c.arc(cx, cy-14, 10, 0, Math.PI*2); c.stroke();
    c.beginPath(); c.moveTo(cx-8, cy-4); c.lineTo(cx-12, cy+8); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(cx, cy-14, 2, 0, Math.PI*2); c.fill();
  }
}

function drawCursorPreview() {
  if (!cursor.valid || tool === 'none' || tool === 'remove') return;
  if (tool === 'farm' && selection.active) {
    const mnX = Math.min(selection.startX, selection.endX), mxX = Math.max(selection.startX, selection.endX);
    const mnY = Math.min(selection.startY, selection.endY), mxY = Math.max(selection.startY, selection.endY);
    for (let y = mnY; y <= mxY; y++) for (let x = mnX; x <= mxX; x++) {
      const t = tileAt(x, y); if (!t) continue;
      const p = isoToScreen(x, y);
      ctx.save(); ctx.globalAlpha = .2;
      ctx.fillStyle = t.obj ? '#a02020' : '#1a1a1a';
      ctx.beginPath(); ctx.moveTo(p.x, p.y - TH/2); ctx.lineTo(p.x + TW/2, p.y); ctx.lineTo(p.x, p.y + TH/2); ctx.lineTo(p.x - TW/2, p.y); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    return;
  }
  if (tool === 'farm') return;
  if (!BUILDINGS[tool]) return;
  const t = tileAt(cursor.gx, cursor.gy);
  if (!t || t.obj || t.type === 'water') return;
  let valid = true, reason = '';
  if (tool === 'lumber' && !hasAdjacentTree(cursor.gx, cursor.gy)) { valid = false; reason = 'НУЖНО ДЕРЕВО'; }
  if (tool === 'fisher' && !hasAdjacentWater(cursor.gx, cursor.gy)) { valid = false; reason = 'НУЖНА ВОДА'; }
  if (tool === 'tower' && !isEdgeTile(cursor.gx, cursor.gy)) { valid = false; reason = 'ТОЛЬКО НА КРАЙ'; }
  const def = BUILDINGS[tool];
  const p = isoToScreen(cursor.gx, cursor.gy);
  let enough = true;
  for (const k in def.cost) if (resources[k] < def.cost[k]) enough = false;
  const ok = enough && valid;
  ctx.save(); ctx.globalAlpha = .4;
  const w = TW * .5, h = 30;
  ctx.strokeStyle = ok ? INK : '#a02020'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.rect(p.x - w/2, p.y - h, w, h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(p.x - w/2 - 4, p.y - h); ctx.lineTo(p.x, p.y - h - 15); ctx.lineTo(p.x + w/2 + 4, p.y - h); ctx.stroke();
  ctx.globalAlpha = 1; ctx.font = 'bold 14px Georgia'; ctx.textAlign = 'center';
  const cs = Object.entries(def.cost).map(([k, v]) => k === 'wood' ? `[W] ${v}` : k === 'stone' ? `[S] ${v}` : `${v}`).join('  ');
  ctx.fillStyle = ok ? INK : '#a02020';
  ctx.fillText(cs, p.x, p.y - h - 25);
  if (reason) { ctx.fillStyle = '#a02020'; ctx.fillText(reason, p.x, p.y - h - 42); }
  ctx.restore();
}

function setTool(t) {
  tool = t; selection.active = false; selectedVillager = null;
  document.querySelectorAll('.btn').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
}

function initUI() {
  document.querySelectorAll('#panel-build .btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tool === 'fisher' && !science.fisher.unlocked) return;
      setTool(btn.dataset.tool);
    });
  });
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  document.querySelectorAll('#timeCtrl button').forEach(btn => {
    btn.addEventListener('click', () => {
      timeScale = parseFloat(btn.dataset.speed);
      document.querySelectorAll('#timeCtrl button').forEach(b => b.classList.toggle('active', b === btn));
    });
  });
  initSettings();
  renderScience();
  document.getElementById('btn-fisher').style.display = 'none';
  document.querySelectorAll('canvas[data-thumb]').forEach(cv => drawThumb(cv, cv.dataset.thumb));
}