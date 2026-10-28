function recalcCapacity() {
  let cap = 0;
  for (const t of tileCache.values()) { const o = t.obj; if (o && o.kind === 'warehouse') cap += (o.capacity || 0); }
  maxCapacity = Math.max(200, cap);
  for (const k in resources) if (resources[k] > maxCapacity && k !== 'science') resources[k] = maxCapacity;
  updateUI();
}

function tryDeposit(c) {
  const type = c.type;
  const space = Math.max(0, maxCapacity - resources[type]);
  const add = Math.min(c.amount, space);
  if (add > 0) resources[type] += add;
  const lost = c.amount - add;
  if (lost > 0) flashHint(`СКЛАД ПЕРЕПОЛНЕН! ${lost} ПОТЕРЯНО`);
  return { added: add, lost };
}

function updateConstruction(dt) {
  for (const f of farms) for (const t of f.area) if (t.plowProgress >= 100 && !t.ready && t.harvestAnim === undefined) { t.growth += dt * 5; if (t.growth >= 100) { t.growth = 100; t.ready = true; } }
  for (const [k, cell] of tileCache) {
    const o = cell.obj;
    if (!o || o.kind !== 'construction') continue;
    const site = o.site;
    site.builders = site.builders.filter(v => v.state === 'building' && v.job && v.job.type === 'build' && v.job.site === site);
    const ac = site.builders.length;
    let sp = ac * 25; if (ac === 0) sp = .5;
    site.progress += sp * dt;
    if (site.progress >= site.maxProgress) {
      for (const v of villagers) if (v.job && v.job.type === 'build' && v.job.site === site) { v.job = null; v.state = 'idle'; v.targetX = v.gx; v.targetY = v.gy; }
      site.builders = [];
      cell.obj = { kind: site.kind, built: true, anim: 0, active: false, doorOpen: 0, worker: null, workTimer: 0, capacity: site.kind === 'warehouse' ? 200 : 0 };
      const [xs, ys] = k.split(','); const x = parseInt(xs), y = parseInt(ys);
      if (site.kind === 'house') {
        spawnVillager(x, y); spawnVillager(x, y);
        for (let v of villagers) if (v.homeX === x && v.homeY === y && v.state === 'idle') { v.targetX = x + 1; v.targetY = y + 1; cell.obj.doorOpen = 1; v.state = 'walking'; }
      } else if (site.kind === 'warehouse') recalcCapacity();
      else if (site.kind === 'tower') expandWithTower(x, y);
      updateUI();
    }
  }
}

const ECONOMY_TICK = 1; let economyAcc = 0;
function economyUpdate(dt) {
  economyAcc += dt;
  if (economyAcc < ECONOMY_TICK) return;
  const ticks = Math.floor(economyAcc / ECONOMY_TICK);
  economyAcc -= ticks * ECONOMY_TICK;
  for (let tick = 0; tick < ticks; tick++) {
    for (const cell of tileCache.values()) {
      const o = cell.obj;
      if (!o || o.natural || !BUILDINGS[o.kind]) continue;
      if (o.closed) { o.active = false; o.workTimer = 0; continue; }
      
      if (o.kind === 'lumber' || o.kind === 'quarry') {
        if (o.worker && o.worker.state === 'working') {
          o.active = true; o.workTimer = (o.workTimer || 0) + 1;
          if (o.workTimer >= 5) {
            o.workTimer = 0;
            const w = o.worker;
            const type = o.kind === 'lumber' ? 'wood' : 'stone';
            if (!w.carrying) w.carrying = { type, amount: 0 };
            w.carrying.amount += 10; w.state = 'delivering'; o.worker = null;
          }
        } else { o.active = false; o.workTimer = 0; }
      } else if (o.kind === 'mill') {
        if (o.worker && o.worker.state === 'working') {
          if (resources.wheat >= 2) {
            resources.wheat -= 2;
            const w = o.worker;
            if (!w.carrying) w.carrying = { type: 'food', amount: 0 };
            w.carrying.amount += 1; o.active = true;
            if (w.carrying.amount >= 5) { w.state = 'delivering'; o.worker = null; }
          } else o.active = false;
        } else o.active = false;
      } else if (o.kind === 'fisher') {
        if (o.worker && o.worker.state === 'working') {
          o.active = true; o.workTimer = (o.workTimer || 0) + 1;
          o.netAnim = (o.netAnim || 0) + .35;
          if (o.workTimer >= 10) {
            o.workTimer = 0;
            const w = o.worker;
            if (!w.carrying) w.carrying = { type: 'food', amount: 0 };
            w.carrying.amount += 10; w.state = 'delivering'; o.worker = null;
          }
        } else { o.active = false; o.workTimer = 0; }
      } else if (o.kind === 'laboratory') {
        if (o.worker && o.worker.state === 'working') {
          o.active = true; o.workTimer = (o.workTimer || 0) + 1;
          if (o.workTimer >= 5) {
            o.workTimer = 0;
            resources.science += 10;
            updateUI();
          }
        } else { o.active = false; o.workTimer = 0; }
      }
    }
  }
  updateUI();
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * timeScale; p.y += p.vy * timeScale;
    p.life -= dt * 2 * timeScale;
    if (p.life <= 0) particles.splice(i, 1);
  }
}