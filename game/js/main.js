let lastTime = performance.now();

function update(dt) {
  if (timeScale === 0) return;
  const sdt = dt * timeScale;
  updateVillagers(sdt);
  updateConstruction(sdt);
  updateParticles(dt);
  economyUpdate(sdt);
}

function render() {
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W/2, H/2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  for (const d of decor) drawDecor(d);
  drawWater();
  for (const f of farms) drawFarm(f);
  const rl = [];
  const b = getBounds();
  for (let y = b.minY; y < b.maxY; y++) for (let x = b.minX; x < b.maxX; x++) {
    const t = tileAt(x, y);
    if (t && t.obj && t.obj.kind !== 'farm') rl.push({ type: 'building', gx: x, gy: y, data: t.obj });
  }
  for (const v of villagers) rl.push({ type: 'villager', gx: v.gx, gy: v.gy, data: v });
  rl.sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy));
  for (const item of rl) {
    if (item.type === 'building') {
      if (item.data.kind === 'construction') drawConstruction(item.data, item.gx, item.gy);
      else drawBuildingIso(item.data, item.gx, item.gy);
    } else drawVillager(item.data);
  }
  for (const p of particles) {
    if (p.color === 'dirt') ctx.fillStyle = `rgba(138,122,106,${p.life})`;
    else if (p.color === 'green') ctx.fillStyle = `rgba(50,100,50,${p.life*.8})`;
    else ctx.fillStyle = `rgba(26,26,26,${p.life})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2); ctx.fill();
  }
  if (cursor.valid) {
    const p = isoToScreen(cursor.gx, cursor.gy);
    ctx.save(); ctx.globalAlpha = .15;
    ctx.fillStyle = (tool === 'remove') ? '#a02020' : '#1a1a1a';
    ctx.beginPath(); ctx.moveTo(p.x, p.y - TH/2); ctx.lineTo(p.x + TW/2, p.y); ctx.lineTo(p.x, p.y + TH/2); ctx.lineTo(p.x - TW/2, p.y); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  drawCursorPreview();
  ctx.restore();
  if (timeScale === 0) {
    ctx.fillStyle = 'rgba(26,26,26,.5)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ece7dc'; ctx.font = 'bold 48px Georgia'; ctx.textAlign = 'center';
    ctx.fillText('⏸ ПАУЗА', W/2, H/2);
  }
}

function loop(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (!isFinite(dt) || dt < 0) dt = 0;
  if (dt > .1) dt = .1;
  update(dt); render();
  requestAnimationFrame(loop);
}

// Старт
initMap();
updateUI();
initUI();
initInput();
requestAnimationFrame(loop);
initKeyboard();