function spawnVillager(gx, gy) {
  villagers.push({ gx, gy, targetX: gx, targetY: gy, homeX: gx, homeY: gy, state: 'idle', anim: Math.random()*10, speed: .035, job: null, direction: 1, idleTimer: Math.random()*2, hunger: 100, carrying: null });
  updateUI();
}

function findBuildingByRef(b) {
  for (const [k, t] of tileCache) {
    if (t.obj === b) { const [x, y] = k.split(',').map(Number); return { gx: x, gy: y }; }
  }
  return null;
}
function ensureFarmHelpers(f) { if (!f.helpers) f.helpers = []; return f.helpers; }
function findFarmForHelper(v) {
  let best = null, bd = Infinity;
  for (const f of farms) {
    if (f.worker === v) continue;
    ensureFarmHelpers(f);
    if (f.helpers.includes(v)) continue;
    if (f.helpers.length >= MAX_FARM_HELPERS) continue;
    const hp = f.area.some(t => t.plowProgress < 100);
    const hh = f.area.some(t => t.ready);
    if (!hp && !hh) continue;
    const cx = (f.minX + f.maxX) / 2, cy = (f.minY + f.maxY) / 2;
    const d = Math.hypot(cx - v.gx, cy - v.gy);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}
function tryDetachHelpersForBuild() {
  let sites = [];
  for (const t of tileCache.values()) { const o = t.obj; if (o && o.kind === 'construction') sites.push(o.site); }
  const act = sites.filter(s => s.builders.length < 4);
  if (act.length === 0) return;
  for (const f of farms) {
    ensureFarmHelpers(f);
    let det = 0;
    for (let i = f.helpers.length - 1; i >= 0 && det < MAX_DETACH_FOR_BUILD; i--) {
      const h = f.helpers[i];
      if (h.state !== 'moving_to_farm_help' && h.state !== 'moving_to_harvest') continue;
      if (h === f.worker) continue;
      if (!h.job || (h.job.type !== 'farm_help_plow' && h.job.type !== 'farm_help_harvest')) continue;
      f.helpers.splice(i, 1);
      h.job = null;
      const s = act[0];
      if (s.builders.length >= 4) continue;
      h.job = { type: 'build', site: s };
      h.state = 'moving_to_build';
      s.builders.push(h);
      det++;
    }
  }
}

function updateVillagers(dt) {
  for (const v of villagers) {
    const isM = (v.state === 'walking' || v.state === 'building' || v.state === 'working' ||
      v.state === 'moving_to_work' || v.state === 'moving_to_build' || v.state === 'harvesting' ||
      v.state === 'moving_to_farm' || v.state === 'moving_to_harvest' || v.state === 'moving_to_farm_help' ||
      v.state === 'delivering' || v.state === 'moving_to_demolish');
    if (isM) v.anim += dt * 8; else v.anim += dt * 2;

    if (isM && audio.ctx) {
      const now = audio.ctx.currentTime;
      if (now - audio.lastFootstep > .32) { audio.lastFootstep = now; audio.playFootstep(); }
    }

    v.hunger -= dt * 1.5;
    if (v.hunger > 100) v.hunger = 100;
    if (v.hunger < 30 && resources.food > 5) {
      resources.food -= 1; v.hunger = 100;
      for (let i = 0; i < 5; i++) particles.push({ x: v.gx*TW, y: v.gy*TH, vx: (Math.random()-.5)*2, vy: -Math.random()*2, life: 1, color: 'green' });
    }
    let sp = v.speed;
    if (v.hunger <= 0) sp *= .3;

    if (v.state === 'working') {
      if (v.job && v.job.building && audio.ctx && Math.random() < .02) {
        const k = v.job.building.kind;
        if (k === 'lumber') audio.playChop();
        else if (k === 'quarry') audio.playMetal();
        else if (k === 'mill') audio.playCreak();
        else if (k === 'fisher') audio.playWater();
      }
      continue;
    }

    if (v.state === 'delivering' && v.carrying) {
      let w = null, md = Infinity;
      for (const [k, t] of tileCache) {
        const o = t.obj;
        if (o && o.kind === 'warehouse' && (o.capacity || 0) > 0) {
          const [x, y] = k.split(',').map(Number);
          const d = Math.hypot(x - v.gx, y - v.gy);
          if (d < md) { md = d; w = { gx: x, gy: y }; }
        }
      }
      if (!w) {
        for (const [k, t] of tileCache) {
          const o = t.obj;
          if (o && o.kind === 'warehouse') { const [x, y] = k.split(',').map(Number); w = { gx: x, gy: y }; break; }
        }
      }
      if (w) {
        const dx = w.gx - v.gx, dy = w.gy - v.gy, dist = Math.hypot(dx, dy);
        if (dist > .8) {
          v.gx += dx/dist * sp * 60 * dt; v.gy += dy/dist * sp * 60 * dt;
          v.direction = dx > 0 ? 1 : -1;
        } else {
          tryDeposit(v.carrying);
          v.carrying = null; updateUI();
          if (v.job && v.job.type === 'help_deliver') {
            const f = v.job.farm;
            const has = f.area.some(t => t.ready) || f.area.some(t => t.plowProgress < 100);
            if (has) { v.job = { type: 'farm_help_harvest', farm: f }; v.state = 'moving_to_harvest'; }
            else { ensureFarmHelpers(f); f.helpers = f.helpers.filter(h => h !== v); v.job = null; v.state = 'idle'; }
          } else if (v.job && v.job.building) {
            const b = v.job.building;
            if (b.worker && b.worker !== v) { v.job = null; v.state = 'idle'; }
            else { b.worker = v; v.state = 'moving_to_work'; }
          } else v.state = 'idle';
        }
      } else { flashHint('НЕТ СКЛАДА!'); v.carrying = null; v.state = 'idle'; }
      continue;
    }

    if (v.state === 'harvesting' && v.job && v.job.type === 'farm_harvest') {
      const f = v.job.farm;
      const rt = f.area.filter(t => t.ready);
      if (rt.length === 0) { v.state = 'idle'; v.job = null; f.worker = null; continue; }
      let tg = null, md = Infinity;
      for (const t of rt) { const d = Math.hypot(t.gx - v.gx, t.gy - v.gy); if (d < md) { md = d; tg = t; } }
      if (tg) {
        const dx = tg.gx - v.gx, dy = tg.gy - v.gy, dist = Math.hypot(dx, dy);
        if (dist > .4) {
          v.gx += dx/dist * sp * 60 * dt; v.gy += dy/dist * sp * 60 * dt;
          v.direction = dx > 0 ? 1 : -1;
        } else {
          if (tg.harvestAnim === undefined) { tg.harvestAnim = 5; audio.playGrass(); }
          tg.harvestAnim -= dt * 12;
          if (tg.harvestAnim <= 0) {
            tg.ready = false; tg.growth = 0; tg.harvestAnim = undefined;
            v.carrying = { type: 'wheat', amount: 10 };
            v.job = { type: 'work', building: f };
            v.state = 'delivering'; updateUI();
            for (let i = 0; i < 6; i++) particles.push({ x: v.gx*TW + (Math.random()-.5)*10, y: v.gy*TH + (Math.random()-.5)*6, vx: (Math.random()-.5)*3, vy: -Math.random()*3-1, life: 1, color: 'dirt' });
            for (let i = 0; i < 3; i++) particles.push({ x: v.gx*TW, y: v.gy*TH, vx: (Math.random()-.5)*2, vy: -Math.random()*2, life: 1, color: 'green' });
          }
        }
      }
      continue;
    }

    if (v.state === 'moving_to_farm' && v.job && v.job.type === 'farm_build') {
      const f = v.job.farm;
      const up = f.area.filter(t => t.plowProgress < 100);
      if (up.length === 0) { v.state = 'idle'; v.job = null; f.worker = null; continue; }
      let tg = null, md = Infinity;
      for (const t of up) { const d = Math.hypot(t.gx - v.gx, t.gy - v.gy); if (d < md) { md = d; tg = t; } }
      if (tg) {
        const dx = tg.gx - v.gx, dy = tg.gy - v.gy, dist = Math.hypot(dx, dy);
        if (dist > .4) { v.gx += dx/dist * sp * 60 * dt; v.gy += dy/dist * sp * 60 * dt; v.direction = dx > 0 ? 1 : -1; }
        else v.state = 'building';
      }
      continue;
    }

    if (v.state === 'building' && v.job && v.job.type === 'farm_build') {
      const f = v.job.farm;
      const up = f.area.filter(t => t.plowProgress < 100);
      if (up.length === 0) { 
        v.state = 'idle'; v.job = null; f.worker = null; 
        continue; 
      }
      
      let tg = up[0];
      let md = Infinity;
      for (const t of up) { 
        const d = Math.hypot(t.gx - v.gx, t.gy - v.gy); 
        if (d < md) { md = d; tg = t; } 
      }

      if (md > 0.8) {
        v.state = 'moving_to_farm';
      } else {
        if (Math.random() < .03) audio.playDig();
        tg.plowProgress += 30 * dt;
        if (tg.plowProgress >= 100) { 
          tg.plowProgress = 100; 
          tg.growth = 0; 
          const next = f.area.find(t => t.plowProgress < 100);
          if (next) v.state = 'moving_to_farm';
          else { v.state = 'idle'; v.job = null; f.worker = null; }
        }
      }
      continue;
    }

    if (v.state === 'moving_to_harvest' && v.job && v.job.type === 'farm_help_harvest') {
      const f = v.job.farm;
      const rt = f.area.filter(t => t.ready);
      if (rt.length === 0) { ensureFarmHelpers(f); f.helpers = f.helpers.filter(h => h !== v); v.job = null; v.state = 'idle'; continue; }
      let tg = null, md = Infinity;
      for (const t of rt) { const d = Math.hypot(t.gx - v.gx, t.gy - v.gy); if (d < md) { md = d; tg = t; } }
      if (tg) {
        const dx = tg.gx - v.gx, dy = tg.gy - v.gy, dist = Math.hypot(dx, dy);
        if (dist > .4) { v.gx += dx/dist * sp * 60 * dt; v.gy += dy/dist * sp * 60 * dt; v.direction = dx > 0 ? 1 : -1; }
        else {
          if (tg.harvestAnim === undefined) { tg.harvestAnim = 5; audio.playGrass(); }
          tg.harvestAnim -= dt * 12;
          if (tg.harvestAnim <= 0) {
            tg.ready = false; tg.growth = 0; tg.harvestAnim = undefined;
            v.carrying = { type: 'wheat', amount: 10 };
            v.job = { type: 'help_deliver', farm: f };
            v.state = 'delivering'; updateUI();
            for (let i = 0; i < 6; i++) particles.push({ x: v.gx*TW + (Math.random()-.5)*10, y: v.gy*TH + (Math.random()-.5)*6, vx: (Math.random()-.5)*3, vy: -Math.random()*3-1, life: 1, color: 'dirt' });
          }
        }
      }
      continue;
    }

    if (v.state === 'moving_to_farm_help' && v.job && v.job.type === 'farm_help_plow') {
      const f = v.job.farm;
      const up = f.area.filter(t => t.plowProgress < 100);
      if (up.length === 0) { ensureFarmHelpers(f); f.helpers = f.helpers.filter(h => h !== v); v.job = null; v.state = 'idle'; continue; }
      let tg = null, md = Infinity;
      for (const t of up) { const d = Math.hypot(t.gx - v.gx, t.gy - v.gy); if (d < md) { md = d; tg = t; } }
      if (tg) {
        const dx = tg.gx - v.gx, dy = tg.gy - v.gy, dist = Math.hypot(dx, dy);
        if (dist > .4) { v.gx += dx/dist * sp * 60 * dt; v.gy += dy/dist * sp * 60 * dt; v.direction = dx > 0 ? 1 : -1; }
        else {
          if (Math.random() < .03) audio.playDig();
          tg.plowProgress += 30 * dt;
          if (tg.plowProgress >= 100) {
            tg.plowProgress = 100; tg.growth = 0;
            const next = f.area.find(t => t.plowProgress < 100);
            if (next) v.state = 'moving_to_farm_help';
            else { ensureFarmHelpers(f); f.helpers = f.helpers.filter(h => h !== v); v.job = null; v.state = 'idle'; }
          }
        }
      }
      continue;
    }

    if (v.state === 'moving_to_work' && v.job && v.job.type === 'work') {
      const b = v.job.building;
      const pos = findBuildingByRef(b);
      if (pos) {
        const dx = pos.gx - v.gx, dy = pos.gy - v.gy, dist = Math.hypot(dx, dy);
        if (dist > .6) { v.gx += dx/dist * sp * 60 * dt; v.gy += dy/dist * sp * 60 * dt; v.direction = dx > 0 ? 1 : -1; }
        else {
          if (!b.worker || b.worker === v) b.worker = v;
          else { v.job = null; v.state = 'idle'; continue; }
          if (b.kind === 'farm') { v.state = 'harvesting'; v.job = { type: 'farm_harvest', farm: b }; }
          else v.state = 'working';
        }
      } else { v.job = null; v.state = 'idle'; }
      continue;
    }

    if (v.state === 'moving_to_build' && v.job && v.job.type === 'build') {
      const site = v.job.site;
      const cell = tileAt(site.gx, site.gy);
      if (!cell || !cell.obj || cell.obj.kind !== 'construction' || cell.obj.site !== site) { v.job = null; v.state = 'idle'; continue; }
      const dx = site.gx - v.gx, dy = site.gy - v.gy, dist = Math.hypot(dx, dy);
      if (dist > .4) { v.gx += dx/dist * sp * 60 * dt; v.gy += dy/dist * sp * 60 * dt; v.direction = dx > 0 ? 1 : -1; }
      else { v.state = 'building'; if (!site.builders.includes(v)) site.builders.push(v); }
      continue;
    }

    if (v.state === 'building' && v.job && v.job.type === 'build') {
      const site = v.job.site;
      const cell = tileAt(site.gx, site.gy);
      if (!cell || !cell.obj || cell.obj.kind !== 'construction' || cell.obj.site !== site) {
        v.job = null; v.state = 'idle';
        site.builders = site.builders.filter(b => b !== v);
      } else if (Math.random() < .02) audio.playHammer();
      continue;
    }

    if (v.state === 'moving_to_demolish' && v.job && v.job.type === 'demolish') {
      const tg = v.job.target;
      const dx = tg.gx - v.gx, dy = tg.gy - v.gy, dist = Math.hypot(dx, dy);
      if (dist > .5) { v.gx += dx/dist * sp * 60 * dt; v.gy += dy/dist * sp * 60 * dt; v.direction = dx > 0 ? 1 : -1; }
      else v.state = 'demolishing';
      continue;
    }

    if (v.state === 'demolishing' && v.job && v.job.type === 'demolish') {
      v.job.progress += 20 * dt;
      if (Math.random() < .04) audio.playHammer();
      if (v.job.progress >= 100) {
        const tgx = v.job.target.gx, tgy = v.job.target.gy;
        const t = tileAt(tgx, tgy);
        audio.playDestroy();
        if (t && t.obj) {
          if (t.obj.kind === 'farm') {
            const farm = t.obj;
            if (farm.worker) { farm.worker.job = null; farm.worker.state = 'idle'; }
            if (farm.helpers) for (const h of farm.helpers) { h.job = null; h.state = 'idle'; }
            for (const tile of farm.area) { const ft = tileAt(tile.gx, tile.gy); if (ft) ft.obj = null; }
            farms = farms.filter(f => f !== farm);
          } else if (t.obj.kind === 'construction') {
            for (const vv of villagers) if (vv.job && vv.job.site === t.obj.site) { vv.job = null; vv.state = 'idle'; }
            t.obj = null;
          } else {
            if (t.obj.worker) { t.obj.worker.job = null; t.obj.worker.state = 'idle'; t.obj.worker = null; }
            t.obj = null;
          }
        }
        v.state = 'idle'; v.job = null;
        demolishJobs = demolishJobs.filter(j => !(j.target.gx === tgx && j.target.gy === tgy));
        updateUI();
      }
      continue;
    }

    if (v.state === 'walking') {
      const dx = v.targetX - v.gx, dy = v.targetY - v.gy, dist = Math.hypot(dx, dy);
      if (dist > .2) { v.gx += dx/dist * sp * 60 * dt; v.gy += dy/dist * sp * 60 * dt; v.direction = dx > 0 ? 1 : -1; }
      else { v.state = 'idle'; v.targetX = v.gx; v.targetY = v.gy; v.idleTimer = 1.5 + Math.random() * 3; }
      continue;
    }

    if (v.state === 'idle') {
      v.idleTimer -= dt;
      if (v.idleTimer > 0) continue;
      let fd = demolishJobs.find(j => { if (j.worker) return false; const c = tileAt(j.target.gx, j.target.gy); return c && c.obj; });
      if (fd) { fd.worker = v; v.job = { type: 'demolish', target: fd.target, progress: 0 }; v.state = 'moving_to_demolish'; continue; }
      
      let us = null;
      for (const t of tileCache.values()) { const o = t.obj; if (o && o.kind === 'construction' && o.site.builders.length < 4) { us = o.site; break; } }
      if (us) { v.job = { type: 'build', site: us }; v.state = 'moving_to_build'; us.builders.push(v); continue; }
      
      let fb = null;
      for (const t of tileCache.values()) {
        const o = t.obj;
        if (o && (o.kind === 'lumber' || o.kind === 'quarry' || o.kind === 'mill' || o.kind === 'fisher') && !o.worker && !o.closed) {
          if (o.kind === 'mill' && resources.wheat <= 0) continue;
          fb = o; break;
        }
      }
      if (fb) { fb.worker = v; fb.workTimer = 0; v.job = { type: 'work', building: fb }; v.state = 'moving_to_work'; continue; }
      
      let fw = null;
      for (const f of farms) { 
        if (f.worker) continue; 
        if (f.area.some(t => t.plowProgress < 100) || f.area.some(t => t.ready)) { fw = f; break; } 
      }
      if (fw) {
        fw.worker = v;
        if (fw.area.some(t => t.plowProgress < 100)) { v.job = { type: 'farm_build', farm: fw }; v.state = 'moving_to_farm'; }
        else { v.job = { type: 'work', building: fw }; v.state = 'moving_to_work'; }
        continue;
      }
      
      const hf = findFarmForHelper(v);
      if (hf) {
        ensureFarmHelpers(hf); hf.helpers.push(v);
        if (hf.area.some(t => t.ready)) { v.job = { type: 'farm_help_harvest', farm: hf }; v.state = 'moving_to_harvest'; }
        else { v.job = { type: 'farm_help_plow', farm: hf }; v.state = 'moving_to_farm_help'; }
        continue;
      }
      
      v.targetX = v.homeX + (Math.random() - .5) * 12;
      v.targetY = v.homeY + (Math.random() - .5) * 12;
      v.state = 'walking';
      v.idleTimer = 1.5 + Math.random() * 3;
    }
  }
  tryDetachHelpersForBuild();
}

function drawVillager(v) {
  const p = isoToScreen(v.gx, v.gy);
  const bx = p.x, by = p.y;
  let ib = false;
  const cx = Math.round(v.gx), cy = Math.round(v.gy);
  const t = tileAt(cx, cy);
  if (t && t.obj) { const k = t.obj.kind; if (k !== 'tree' && k !== 'farm' && k !== 'construction') ib = true; }
  ctx.save();
  if (v === selectedVillager) { ctx.strokeStyle = '#c08000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by - 6, 14, 0, Math.PI*2); ctx.stroke(); }
  if (ib) ctx.globalAlpha = .3;
  ctx.fillStyle = 'rgba(26,26,26,.25)'; ctx.beginPath(); ctx.ellipse(bx, by, 4, 2, 0, 0, Math.PI*2); ctx.fill();
  const im = (v.state === 'walking' || v.state === 'moving_to_work' || v.state === 'moving_to_build' || v.state === 'working' || v.state === 'building' || v.state === 'harvesting' || v.state === 'moving_to_farm' || v.state === 'moving_to_harvest' || v.state === 'moving_to_farm_help' || v.state === 'delivering' || v.state === 'moving_to_demolish');
  const wp = im ? Math.sin(v.anim) * 3 : 0;
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineCap = 'round';
  line(bx - 2, by - 4, bx - 2 + wp, by, 3);
  line(bx + 2, by - 4, bx + 2 - wp, by, 3);
  const br = !im ? Math.sin(v.anim * .8) * .6 : 0;
  ctx.fillStyle = INK; ctx.beginPath();
  ctx.moveTo(bx - 4, by - 4 + br); ctx.lineTo(bx + 4, by - 4 + br); ctx.lineTo(bx + 3, by - 11 + br); ctx.lineTo(bx - 3, by - 11 + br); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  const as = im ? Math.sin(v.anim) * 2 : 0;
  if (v.state === 'working' || v.state === 'building' || v.state === 'harvesting' || v.state === 'demolishing') {
    const sw = Math.sin(v.anim * 2) * 5;
    line(bx - 3, by - 10, bx - 5 - v.direction, by - 6 - sw, 2);
    line(bx + 3, by - 10, bx + 5 + v.direction, by - 6 + sw, 2);
    if (Math.random() < .15) {
      let c = 'black';
      if (v.job && v.job.type === 'farm_build') c = 'green';
      particles.push({ x: bx + v.direction * 8, y: by - 8, vx: (Math.random()-.5)*2, vy: -Math.random()*2-1, life: 1, color: c });
    }
  } else {
    line(bx - 3, by - 10 + br, bx - 5, by - 5 + as, 2);
    line(bx + 3, by - 10 + br, bx + 5, by - 5 - as, 2);
  }
  ctx.fillStyle = PAPER; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(bx, by - 14 + br, 4, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(bx + v.direction * 1.5, by - 14 + br, 1, 0, Math.PI*2); ctx.fill();
  if (v.carrying) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(bx + 8, by - 18, 4, 0, Math.PI*2); ctx.fill(); }
  if (v.hunger < 100) {
    const hw = 8;
    ctx.fillStyle = 'rgba(26,26,26,.5)'; ctx.fillRect(bx - hw/2, by - 26, hw, 2);
    ctx.fillStyle = v.hunger > 30 ? 'rgba(0,0,0,.8)' : '#a02020';
    ctx.fillRect(bx - hw/2, by - 26, hw * (v.hunger / 100), 2);
  }
  ctx.restore();
}

function startConstruction(gx, gy, kind) {
  const site = { kind: 'construction', site: { gx, gy, kind, progress: 0, maxProgress: 100, builders: [] } };
  const t = tileAt(gx, gy); if (t) t.obj = site;
  let free = villagers.filter(v => (v.state === 'idle' || v.state === 'walking') && !v.job);
  if (free.length < 2) {
    const ob = villagers.filter(v => v.state === 'building' && v.job && v.job.type === 'build');
    for (const v of ob) {
      if (free.length >= 2) break;
      const old = v.job.site; if (old === site.site) continue;
      const lc = old.builders.filter(b => b.state === 'building' && b.job && b.job.site === old).length;
      if (lc > 1) { old.builders = old.builders.filter(b => b !== v); v.job = null; v.state = 'idle'; free.push(v); }
    }
  }
  for (const v of free) {
    if (site.site.builders.length >= 2) break;
    v.job = { type: 'build', site: site.site }; v.state = 'moving_to_build'; site.site.builders.push(v);
  }
}

function startFarmArea(x1, y1, x2, y2) {
  const mnX = Math.min(x1, x2), mxX = Math.max(x1, x2), mnY = Math.min(y1, y2), mxY = Math.max(y1, y2);
  const area = [];
  for (let y = mnY; y <= mxY; y++) for (let x = mnX; x <= mxX; x++) {
    const t = tileAt(x, y);
    if (t && t.type === 'grass' && !t.obj) area.push({ gx: x, gy: y, ready: false, growth: 0, plowProgress: 0 });
  }
  if (area.length === 0) { flashHint('НЕТ МЕСТА'); return; }
  const farmObj = { kind: 'farm', area, worker: null, helpers: [], active: false, minX: mnX, maxX: mxX, minY: mnY, maxY: mxY };
  farms.push(farmObj);
  const free = villagers.find(v => (v.state === 'idle' || v.state === 'walking') && !v.job);
  if (free) { farmObj.worker = free; free.job = { type: 'farm_build', farm: farmObj }; free.state = 'moving_to_farm'; }
  for (const t of area) { const tt = tileAt(t.gx, t.gy); if (tt) tt.obj = farmObj; }
  updateUI();
}