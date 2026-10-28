function getBounds() {
  let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
  for (const k of chunks.keys()) {
    const [cx, cy] = k.split(',').map(Number);
    mnX = Math.min(mnX, cx * CHUNK); mnY = Math.min(mnY, cy * CHUNK);
    mxX = Math.max(mxX, (cx + 1) * CHUNK); mxY = Math.max(mxY, (cy + 1) * CHUNK);
  }
  if (!isFinite(mnX)) return { minX: 0, minY: 0, maxX: CHUNK, maxY: CHUNK };
  return { minX: mnX, minY: mnY, maxX: mxX, maxY: mxY };
}
function tileAt(x, y) { return tileCache.get(tileKey(x, y)) || null; }
function isTileOpen(x, y) { return tileCache.has(tileKey(x, y)); }

function generateChunk(cx, cy) {
  const seed = (cx * 73856093) ^ (cy * 19349663) ^ 0x9e3779b9;
  const rng = mulberry32(seed);
  const tiles = [];
  for (let ly = 0; ly < CHUNK; ly++) {
    const r = [];
    for (let lx = 0; lx < CHUNK; lx++) r.push({ type: 'grass', obj: null });
    tiles.push(r);
  }
  const pc = 1 + Math.floor(rng() * 3);
  for (let p = 0; p < pc; p++) {
    const px = Math.floor(rng() * CHUNK), py = Math.floor(rng() * CHUNK), pr = 1 + Math.floor(rng() * 3);
    for (let y = Math.max(0, py - pr); y <= Math.min(CHUNK - 1, py + pr); y++)
      for (let x = Math.max(0, px - pr); x <= Math.min(CHUNK - 1, px + pr); x++)
        if (Math.hypot(x - px, y - py) <= pr + rng() * .5) tiles[y][x].type = 'water';
  }
  const fc = 1 + Math.floor(rng() * 3);
  for (let f = 0; f < fc; f++) {
    const fx = Math.floor(rng() * CHUNK), fy = Math.floor(rng() * CHUNK), fr = 2 + Math.floor(rng() * 3);
    for (let y = Math.max(0, fy - fr); y <= Math.min(CHUNK - 1, fy + fr); y++)
      for (let x = Math.max(0, fx - fr); x <= Math.min(CHUNK - 1, fx + fr); x++) {
        if (tiles[y][x].type !== 'grass' || tiles[y][x].obj) continue;
        const d = Math.hypot(x - fx, y - fy);
        if (d <= fr && rng() < .7 - d * .1) tiles[y][x].obj = { kind: 'tree', natural: true, seed: rng() };
      }
  }
  for (let i = 0; i < 15; i++) {
    const lx = Math.floor(rng() * CHUNK), ly = Math.floor(rng() * CHUNK);
    if (tiles[ly][lx].type === 'grass' && !tiles[ly][lx].obj && rng() < .4)
      tiles[ly][lx].obj = { kind: 'tree', natural: true, seed: rng() };
  }
  return tiles;
}

function openChunk(cx, cy) {
  const key = chunkKey(cx, cy);
  if (chunks.has(key)) return;
  const tiles = generateChunk(cx, cy);
  chunks.set(key, { tiles });
  for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
    const gx = cx * CHUNK + lx, gy = cy * CHUNK + ly;
    tileCache.set(tileKey(gx, gy), tiles[ly][lx]);
  }
  const rng = mulberry32((cx * 131) ^ (cy * 977));
  for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
    const gx = cx * CHUNK + lx, gy = cy * CHUNK + ly;
    const t = tiles[ly][lx];
    if (t.type === 'water' || t.obj) continue;
    const r = rng();
    let type = 'none';
    if (r > .7) type = 'grass_tuft';
    else if (r > .55) type = 'bush';
    else if (r > .4) type = 'stone';
    if (type !== 'none') decor.push({ x: gx, y: gy, type, offsetX: (rng() - .5) * 30, offsetY: (rng() - .5) * 15, size: .8 + rng() * .8 });
  }
}

function hasAdjacentTree(gx, gy) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const t = tileAt(gx + dx, gy + dy);
    if (t && t.obj && t.obj.kind === 'tree') return true;
  }
  return false;
}
function hasAdjacentWater(gx, gy) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const t = tileAt(gx + dx, gy + dy);
    if (t && t.type === 'water') return true;
  }
  return false;
}
function dirToWater(gx, gy) {
  let best = null, bd = Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const t = tileAt(gx + dx, gy + dy);
    if (t && t.type === 'water') {
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = { dx, dy }; }
    }
  }
  return best;
}
function isEdgeTile(gx, gy) {
  if (!isTileOpen(gx, gy)) return false;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const [dx, dy] of dirs) if (!isTileOpen(gx + dx, gy + dy)) return true;
  return false;
}
function edgeDirection(gx, gy) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const [dx, dy] of dirs) if (!isTileOpen(gx + dx, gy + dy)) return { dx, dy };
  return null;
}

function expandWithTower(gx, gy) {
  const dir = edgeDirection(gx, gy);
  if (!dir) return null;
  const ccx = floorDiv(gx, CHUNK), ccy = floorDiv(gy, CHUNK);
  let ncx = ccx, ncy = ccy;
  if (dir.dx === 1) ncx = ccx + 1; else if (dir.dx === -1) ncx = ccx - 1;
  else if (dir.dy === 1) ncy = ccy + 1; else if (dir.dy === -1) ncy = ccy - 1;
  if (chunks.has(chunkKey(ncx, ncy))) return null;
  openChunk(ncx, ncy);
  return { cx: ncx, cy: ncy };
}

function initMap() {
  openChunk(0, 0);
  function findSpotFree(w, h) {
    for (let t = 0; t < 500; t++) {
      const x = Math.floor(Math.random() * (CHUNK - w)), y = Math.floor(Math.random() * (CHUNK - h));
      let ok = true;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const tt = tileAt(x + dx, y + dy);
        if (!tt || tt.type === 'water' || tt.obj) { ok = false; break; }
      }
      if (ok) return { x, y };
    }
    for (let y = 1; y < CHUNK - h - 1; y++) for (let x = 1; x < CHUNK - w - 1; x++) {
      let ok = true;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const tt = tileAt(x + dx, y + dy);
        if (!tt || tt.type === 'water' || tt.obj) { ok = false; break; }
      }
      if (ok) return { x, y };
    }
    return { x: 5, y: 5 };
  }
  function placeBuilding(x, y, obj) {
    const t = tileAt(x, y);
    if (t && t.obj && t.obj.kind === 'tree') t.obj = null;
    if (t) t.obj = obj;
  }
  let ls = null;
  for (let t = 0; t < 300 && !ls; t++) {
    const s = findSpotFree(1, 1);
    if (hasAdjacentTree(s.x, s.y)) ls = s;
  }
  if (!ls) ls = findSpotFree(1, 1);
  placeBuilding(ls.x, ls.y, { kind: 'lumber', built: true, anim: 0, active: false, worker: null, workTimer: 0 });
  const h1 = findSpotFree(1, 1); placeBuilding(h1.x, h1.y, { kind: 'house', built: true, doorOpen: 0 });
  const h2 = findSpotFree(1, 1); placeBuilding(h2.x, h2.y, { kind: 'house', built: true, doorOpen: 0 });
  const wh = findSpotFree(2, 2);
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const isAnchor = dx === 0 && dy === 0;
    placeBuilding(wh.x + dx, wh.y + dy, { kind: 'warehouse', built: true, isMain: true, capacity: isAnchor ? 200 : 0, anchor: isAnchor });
  }
  setTimeout(() => {
    spawnVillager(h1.x, h1.y); spawnVillager(h1.x, h1.y);
    spawnVillager(h2.x, h2.y); spawnVillager(h2.x, h2.y);
  }, 100);
  recalcCapacity();
}