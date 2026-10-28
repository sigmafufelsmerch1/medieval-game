const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W, H;
function resize() { W = canvas.width = innerWidth; H = canvas.height = innerHeight; }
addEventListener('resize', resize);
resize();

const TW = 64, TH = 32, CHUNK = 16;
const INK = '#1a1a1a', PAPER = '#ece7dc', DIRT_DARK = '#8a7a6a', WATER_COLOR = '#a0c0e0';
const MAX_FARM_HELPERS = 6, MAX_DETACH_FOR_BUILD = 2;

const chunks = new Map();
const tileCache = new Map();

const BUILDINGS = {
  house:     { name: 'ДОМИК', cost: { wood: 10, stone: 5 },  pop: 2 },
  farm:      { name: 'ОГОРОД', cost: { wood: 0 } },
  mill:      { name: 'МЕЛЬНИЦА', cost: { wood: 30, stone: 10 } },
  lumber:    { name: 'ЛЕСОПИЛКА', cost: { wood: 20 } },
  quarry:    { name: 'КАМЕНОЛОМНЯ', cost: { wood: 25 } },
  fisher:    { name: 'ДОМИК РЫБАКА', cost: { wood: 15, stone: 5 } },
  warehouse: { name: 'СКЛАД', cost: { wood: 50, stone: 20 }, capacity: 200 },
  tower:     { name: 'ВОЕННАЯ БАШНЯ', cost: { wood: 25, stone: 50 } },
  laboratory:{ name: 'ЛАБОРАТОРИЯ', cost: { wood: 40, stone: 40 } }
};

const resources = { wood: 100, stone: 50, food: 50, wheat: 0, science: 0 };
let maxCapacity = 200;

const science = {
  fisher: { name: 'ДОМИК РЫБАКА', cost: 100, unlocked: false, desc: 'Дом рыбака у воды' }
};

let villagers = [];
let particles = [];
let decor = [];
let tool = 'none';
let cursor = { gx: -1, gy: -1, valid: false, screenX: 0, screenY: 0 };
const cam = { x: 0, y: 0, zoom: 1 };
let selection = { active: false, startX: -1, startY: -1, endX: -1, endY: -1 };
let farms = [];
let demolishJobs = [];
let selectedVillager = null;
let timeScale = 1;
const ORIGINAL_HINT = document.getElementById('hint').textContent;

function chunkKey(cx, cy) { return cx + ',' + cy; }
function tileKey(x, y) { return x + ',' + y; }
function floorDiv(a, b) { return Math.floor(a / b); }
function mulberry32(a) { return function() { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function line(x1, y1, x2, y2, w = 3) { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function poly(points, w = 3, close = true) { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y); if (close) ctx.closePath(); ctx.stroke(); }
function fill(points) { ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y); ctx.closePath(); ctx.fill(); }
function hatch(points, spacing = 6, angle = 0.8) { let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity; for (const p of points) { if (p.x < mnX) mnX = p.x; if (p.x > mxX) mxX = p.x; if (p.y < mnY) mnY = p.y; if (p.y > mxY) mxY = p.y; } ctx.save(); ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y); ctx.closePath(); ctx.clip(); const dx = Math.cos(angle), dy = Math.sin(angle); const diag = Math.hypot(mxX - mnX, mxY - mnY); const steps = Math.floor(diag / spacing); ctx.strokeStyle = INK; ctx.globalAlpha = .25; ctx.lineWidth = 2; for (let i = -steps; i <= steps; i++) { const ox = (mnX + mxX) / 2 + dx * i * spacing; const oy = (mnY + mxY) / 2 + dy * i * spacing; ctx.beginPath(); ctx.moveTo(ox - dy * diag, oy + dx * diag); ctx.lineTo(ox + dy * diag, oy - dx * diag); ctx.stroke(); } ctx.restore(); }
function isoToScreen(gx, gy, gz = 0) { return { x: (gx - gy) * (TW / 2), y: (gx + gy) * (TH / 2) - gz }; }
function screenToIso(sx, sy) { const a = sx / (TW / 2), b = sy / (TH / 2); return { x: (a + b) / 2, y: (b - a) / 2 }; }