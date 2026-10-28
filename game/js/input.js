let dragging = false, dragStart = null, camStart = null;

function villagerAtScreen(sx, sy) {
  let best = null, bd = Infinity;
  for (const v of villagers) {
    const p = isoToScreen(v.gx, v.gy);
    const wx = p.x * cam.zoom + W/2 - cam.x * cam.zoom;
    const wy = p.y * cam.zoom + H/2 - cam.y * cam.zoom;
    const d = Math.hypot(wx - sx, wy - sy);
    if (d < 18 * cam.zoom && d < bd) { bd = d; best = v; }
  }
  return best;
}

function issueOrder(v, gx, gy) {
  const t = tileAt(gx, gy);
  if (!t || !t.obj) { v.job = null; v.state = 'walking'; v.targetX = gx; v.targetY = gy; flashHint('ИДЁТ'); return; }
  const o = t.obj;
  if (o.kind === 'construction') { o.site.builders.push(v); v.job = { type: 'build', site: o.site }; v.state = 'moving_to_build'; flashHint('ИДЁТ СТРОИТЬ'); }
  else if (o.kind === 'farm') {
    if (o.worker && o.worker !== v) { o.worker.job = null; o.worker.state = 'idle'; }
    o.worker = v; v.job = { type: 'work', building: o }; v.state = 'moving_to_work'; flashHint('ИДЁТ НА ФЕРМУ');
  } else if (o.kind === 'lumber' || o.kind === 'quarry' || o.kind === 'mill' || o.kind === 'fisher' || o.kind === 'laboratory') {
    if (o.closed) { flashHint('ЗАКРЫТ'); return; }
    if (o.worker && o.worker !== v) { o.worker.job = null; o.worker.state = 'idle'; }
    o.worker = v; o.workTimer = 0; v.job = { type: 'work', building: o }; v.state = 'moving_to_work'; flashHint('ИДЁТ РАБОТАТЬ');
  } else flashHint('ТУТ НЕЧЕГО ДЕЛАТЬ');
}

function clampCamera() {
  const b = getBounds();
  const hw = W / (2 * cam.zoom), hh = H / (2 * cam.zoom);
  const mnX = -(b.maxY) * (TW / 2) - TW, mxX = (b.maxX) * (TW / 2) + TW;
  const mnY = -(b.maxX) * (TH / 2) - TH * 2, mxY = (b.maxX + b.maxY) * (TH / 2) + TH * 2;
  cam.x = Math.max(mnX + hw, Math.min(mxX - hw, cam.x));
  cam.y = Math.max(mnY + hh, Math.min(mxY - hh, cam.y));
}

function initKeyboard() {
  const keys = {};
  window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  
  setInterval(() => {
    const speed = 15 / cam.zoom;
    if (keys['w'] || keys['ц']) cam.y -= speed;
    if (keys['s'] || keys['ы']) cam.y += speed;
    if (keys['a'] || keys['ф']) cam.x -= speed;
    if (keys['d'] || keys['в']) cam.x += speed;
    if (keys['w'] || keys['s'] || keys['a'] || keys['d'] || keys['ц'] || keys['ы'] || keys['ф'] || keys['в']) clampCamera();
    
    if (keys['e'] || keys['у']) setTool('none');
    if (keys['x'] || keys['ч']) setTool('remove');
  }, 1000 / 60);
}

function initInput() {
  canvas.addEventListener('mousemove', e => {
    cursor.screenX = e.clientX; cursor.screenY = e.clientY;
    const wx = (e.clientX - W/2) / cam.zoom + cam.x;
    const wy = (e.clientY - H/2) / cam.zoom + cam.y;
    const iso = screenToIso(wx, wy);
    const gx = Math.round(iso.x), gy = Math.round(iso.y);
    cursor.gx = gx; cursor.gy = gy;
    cursor.valid = isTileOpen(gx, gy);
    if (selection.active) { selection.endX = gx; selection.endY = gy; }
    if (dragging) {
      cam.x = camStart.x - (e.clientX - dragStart.x) / cam.zoom;
      cam.y = camStart.y - (e.clientY - dragStart.y) / cam.zoom;
      clampCamera();
    }
    updateTooltip();
  });
  canvas.addEventListener('mouseleave', () => cursor.valid = false);

  canvas.addEventListener('mousedown', e => {
    audio.init();
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      dragging = true; dragStart = { x: e.clientX, y: e.clientY }; camStart = { x: cam.x, y: cam.y }; return;
    }
    if (e.button === 2) {
      const t = tileAt(cursor.gx, cursor.gy);
      if (t && t.obj && (t.obj.kind === 'lumber' || t.obj.kind === 'quarry' || t.obj.kind === 'mill' || t.obj.kind === 'fisher' || t.obj.kind === 'laboratory')) {
        t.obj.closed = !t.obj.closed;
        if (t.obj.closed && t.obj.worker) { t.obj.worker.job = null; t.obj.worker.state = 'idle'; t.obj.worker = null; }
        flashHint(t.obj.closed ? 'ЗАКРЫТ' : 'ОТКРЫТ');
        return;
      }
      setTool('none'); selectedVillager = null;
      if (selection.active) selection.active = false;
      return;
    }
    if (e.button !== 0 || !cursor.valid) return;
    const t = tileAt(cursor.gx, cursor.gy);
    if (!t) return;

    if (tool === 'none') {
      const v = villagerAtScreen(e.clientX, e.clientY);
      if (v) { selectedVillager = (selectedVillager === v) ? null : v; flashHint(selectedVillager ? 'ВЫДЕЛЕН' : 'СНЯТО'); return; }
      if (selectedVillager) { issueOrder(selectedVillager, cursor.gx, cursor.gy); return; }
      if (t.obj && (t.obj.kind === 'lumber' || t.obj.kind === 'quarry' || t.obj.kind === 'farm' || t.obj.kind === 'mill' || t.obj.kind === 'fisher' || t.obj.kind === 'laboratory')) {
        if (t.obj.closed) { flashHint('ЗАКРЫТ'); return; }
        if (t.obj.worker) { flashHint('УЖЕ РАБОТАЮТ'); return; }
        const free = villagers.find(v => (v.state === 'idle' || v.state === 'walking') && !v.job);
        if (free) { free.job = { type: 'work', building: t.obj }; t.obj.worker = free; free.state = 'moving_to_work'; flashHint('НАЗНАЧЕН'); }
        else flashHint('НЕТ СВОБОДНЫХ');
      }
      return;
    }

    if (tool === 'remove') {
      if (t.obj) {
        if (t.obj.kind === 'construction') {
          const def = BUILDINGS[t.obj.site.kind]; if (def) refund(def.cost);
          for (const v of villagers) if (v.job && v.job.site === t.obj.site) { v.job = null; v.state = 'idle'; }
          t.obj = null; audio.playDestroy(); updateUI();
        } else if (t.obj.kind === 'farm') {
          const farm = t.obj;
          if (farm.worker) { farm.worker.job = null; farm.worker.state = 'idle'; }
          if (farm.helpers) for (const h of farm.helpers) { h.job = null; h.state = 'idle'; }
          for (const tile of farm.area) { const ft = tileAt(tile.gx, tile.gy); if (ft) ft.obj = null; }
          farms = farms.filter(f => f !== farm);
          audio.playDestroy(); updateUI();
        } else {
          const ex = demolishJobs.some(j => j.target.gx === cursor.gx && j.target.gy === cursor.gy);
          if (!ex) { demolishJobs.push({ target: { gx: cursor.gx, gy: cursor.gy }, worker: null, progress: 0 }); flashHint('ИДУТ СНОСИТЬ'); }
        }
      }
      return;
    }

    if (tool === 'farm') {
      selection.active = true;
      selection.startX = cursor.gx; selection.startY = cursor.gy;
      selection.endX = cursor.gx; selection.endY = cursor.gy;
      return;
    }

    if (BUILDINGS[tool]) {
      if (t.obj || t.type === 'water') return;
      if (tool === 'lumber' && !hasAdjacentTree(cursor.gx, cursor.gy)) { flashHint('НУЖНО ДЕРЕВО'); return; }
      if (tool === 'fisher' && !hasAdjacentWater(cursor.gx, cursor.gy)) { flashHint('НУЖНА ВОДА'); return; }
      if (tool === 'tower' && !isEdgeTile(cursor.gx, cursor.gy)) { flashHint('ТОЛЬКО НА КРАЙ'); return; }
      const def = BUILDINGS[tool];
      if (!canAfford(def.cost)) { flashHint('НЕ ХВАТАЕТ РЕСУРСОВ'); return; }
      pay(def.cost);
      startConstruction(cursor.gx, cursor.gy, tool);
      updateUI();
    }
  });

  canvas.addEventListener('mouseup', e => {
    dragging = false;
    if (selection.active && e.button === 0) { startFarmArea(selection.startX, selection.startY, selection.endX, selection.endY); selection.active = false; }
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    cam.zoom *= e.deltaY < 0 ? 1.1 : .9;
    cam.zoom = Math.max(.4, Math.min(2.5, cam.zoom));
    clampCamera();
  }, { passive: false });
  
  initKeyboard();
}