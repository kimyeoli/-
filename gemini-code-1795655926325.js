import { TILE_SIZE } from './config.js';
import { sfx } from './sound.js';

export class GameEngine {
  constructor(canvas, callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cb = callbacks;

    this.running = false;
    this.aimMode = 'auto'; // 'auto' | 'mouse'
    this.mouseScreen = { x: 0, y: 0 };
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.resetState();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('mousemove', (e) => {
      this.mouseScreen.x = e.clientX;
      this.mouseScreen.y = e.clientY;
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.running || e.button !== 0) return;
      this.setTargetTileFromScreen(e.clientX, e.clientY);
      this.cb.onCanvasClick?.();
    });
  }

  resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  resetState() {
    this.elapsed = 0;
    this.kills = 0;
    this.wordsTyped = 0;
    this.combo = 0;
    this.spawnTimer = 0;
    this.pendingLevelUps = 0;

    this.player = {
      x: TILE_SIZE * 0.5,
      y: TILE_SIZE * 0.5,
      r: 20,
      hp: 100,
      maxHp: 100,
      xp: 0,
      xpNext: 30,
      level: 1,
      speed: 215,
      damage: 26,
      projectiles: 1,
      pierce: 0,
      magnet: 115,
      orbitals: 0,
      orbitAngle: 0,
      invuln: 0,
      aimAngle: 0,
      target: null, // { x, y, tx, ty }
    };

    this.cam = { x: this.player.x, y: this.player.y };
    this.enemies = [];
    this.projectiles = [];
    this.gems = [];
    this.popups = [];
  }

  start() {
    this.resetState();
    this.running = true;
    this.lastTime = performance.now();
    this.cb.onHudUpdate?.(this.getSnapshot());
    requestAnimationFrame((t) => this.loop(t));
  }

  stop() {
    this.running = false;
  }

  toggleAimMode() {
    this.aimMode = this.aimMode === 'auto' ? 'mouse' : 'auto';
    return this.aimMode;
  }

  setTargetTileFromScreen(sx, sy) {
    const wx = sx - this.w / 2 + this.cam.x;
    const wy = sy - this.h / 2 + this.cam.y;
    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    this.player.target = {
      tx,
      ty,
      x: tx * TILE_SIZE + TILE_SIZE / 2,
      y: ty * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  findNearestEnemy() {
    let best = null;
    let bestD2 = Infinity;
    for (const e of this.enemies) {
      const dx = e.x - this.player.x;
      const dy = e.y - this.player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = e;
      }
    }
    return best;
  }

  getAimAngle() {
    if (this.aimMode === 'auto') {
      const nearest = this.findNearestEnemy();
      if (nearest) {
        return Math.atan2(nearest.y - this.player.y, nearest.x - this.player.x);
      }
    }
    const mx = this.mouseScreen.x - this.w / 2 + this.cam.x;
    const my = this.mouseScreen.y - this.h / 2 + this.cam.y;
    return Math.atan2(my - this.player.y, mx - this.player.x);
  }

  // 타자 단어 완성 시 공격 발사
  fireTypingAttack() {
    if (!this.running) return;
    this.wordsTyped += 1;
    this.combo += 1;

    const p = this.player;
    const baseAngle = this.getAimAngle();
    p.aimAngle = baseAngle;

    const comboMult = 1 + Math.min(this.combo, 20) * 0.05;
    const dmg = Math.round(p.damage * comboMult);
    const count = p.projectiles;
    const spread = 0.16;

    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * spread;
      const ang = baseAngle + offset;
      this.projectiles.push({
        x: p.x + Math.cos(ang) * 18,
        y: p.y + Math.sin(ang) * 18,
        vx: Math.cos(ang) * 580,
        vy: Math.sin(ang) * 580,
        r: 9,
        dmg,
        pierce: p.pierce,
        hitSet: new Set(),
        life: 1.5,
      });
    }

    sfx.shoot();
    this.cb.onHudUpdate?.(this.getSnapshot());
  }

  resetCombo() {
    this.combo = 0;
    this.cb.onHudUpdate?.(this.getSnapshot());
  }

  spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.max(this.w, this.h) * 0.62 + 60;
    const x = this.player.x + Math.cos(angle) * dist;
    const y = this.player.y + Math.sin(angle) * dist;

    const t = this.elapsed;
    const roll = Math.random();
    let type = 'basic';
    if (t > 35 && roll < 0.18) type = 'tank';
    else if (t > 12 && roll < 0.42) type = 'fast';

    const scale = 1 + t / 90;
    const presets = {
      basic: { r: 17, hp: Math.round(32 * scale), speed: 82, dmg: 10, color: '#fb7185', xp: 10 },
      fast:  { r: 14, hp: Math.round(20 * scale), speed: 128, dmg: 8,  color: '#facc15', xp: 12 },
      tank:  { r: 25, hp: Math.round(95 * scale), speed: 56, dmg: 18, color: '#c084fc', xp: 28 },
    };
    const cfg = presets[type];
    this.enemies.push({ x, y, type, ...cfg, maxHp: cfg.hp, flash: 0 });
  }

  damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.flash = 0.1;
    this.popups.push({ x: e.x, y: e.y - e.r, text: String(dmg), life: 0.45, color: '#1e293b' });
    sfx.hit();

    if (e.hp <= 0) {
      this.kills += 1;
      this.gems.push({ x: e.x, y: e.y, val: e.xp, r: e.xp >= 20 ? 9 : 6 });
      return true;
    }
    return false;
  }

  gainXp(amount) {
    const p = this.player;
    p.xp += amount;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level += 1;
      p.xpNext = Math.round(p.xpNext * 1.32 + 12);
      this.pendingLevelUps += 1;
      sfx.levelUp();
      this.cb.onLevelUp?.(this.pendingLevelUps);
    }
  }

  consumeLevelUp(upgrade) {
    if (this.pendingLevelUps <= 0) return;
    upgrade.apply(this.player);
    this.pendingLevelUps -= 1;
    this.cb.onHudUpdate?.(this.getSnapshot());
  }

  getSnapshot() {
    const p = this.player;
    return {
      elapsed: this.elapsed,
      kills: this.kills,
      wordsTyped: this.wordsTyped,
      combo: this.combo,
      level: p.level,
      hp: Math.ceil(p.hp),
      maxHp: p.maxHp,
      xpRatio: p.xp / p.xpNext,
      pendingLevelUps: this.pendingLevelUps,
    };
  }

  loop(now) {
    if (!this.running) return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    this.update(dt);
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    const p = this.player;
    this.elapsed += dt;
    if (p.invuln > 0) p.invuln -= dt;

    // 1. 타일 자동 이동
    if (p.target) {
      const dx = p.target.x - p.x;
      const dy = p.target.y - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (dist <= step) {
        p.x = p.target.x;
        p.y = p.target.y;
        p.target = null;
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
    }

    p.aimAngle = this.getAimAngle();

    // 카메라 부드러운 추적
    this.cam.x += (p.x - this.cam.x) * Math.min(1, dt * 8);
    this.cam.y += (p.y - this.cam.y) * Math.min(1, dt * 8);

    // 2. 적 스폰
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const interval = Math.max(0.32, 1.35 - this.elapsed * 0.012);
      this.spawnTimer = interval;
      this.spawnEnemy();
    }

    // 3. 회전 지우개(오비탈) 업데이트
    if (p.orbitals > 0) {
      p.orbitAngle += dt * 3.1;
      for (let i = 0; i < p.orbitals; i++) {
        const ang = p.orbitAngle + (Math.PI * 2 * i) / p.orbitals;
        const ox = p.x + Math.cos(ang) * 74;
        const oy = p.y + Math.sin(ang) * 74;
        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const e = this.enemies[j];
          if (Math.hypot(e.x - ox, e.y - oy) < e.r + 12 && e.flash <= 0) {
            if (this.damageEnemy(e, Math.round(p.damage * 0.6))) {
              this.enemies.splice(j, 1);
            }
          }
        }
      }
    }

    // 4. 투사체 이동 및 충돌
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const b = this.projectiles[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        if (b.hitSet.has(e)) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
          b.hitSet.add(e);
          if (this.damageEnemy(e, b.dmg)) {
            this.enemies.splice(j, 1);
          }
          if (b.pierce > 0) {
            b.pierce -= 1;
          } else {
            this.projectiles.splice(i, 1);
            break;
          }
        }
      }
    }

    // 5. 적 추적 및 플레이어 피격
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.flash > 0) e.flash -= dt;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      e.x += (dx / dist) * e.speed * dt;
      e.y += (dy / dist) * e.speed * dt;

      if (dist < p.r + e.r && p.invuln <= 0) {
        p.hp -= e.dmg;
        p.invuln = 0.55;
        this.combo = 0;
        sfx.hurt();
        if (p.hp <= 0) {
          p.hp = 0;
          this.stop();
          this.cb.onGameOver?.(this.getSnapshot());
          return;
        }
      }
    }

    // 6. 경험치 젬 자석 및 획득
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const dist = Math.hypot(dx, dy);
      if (dist < p.magnet) {
        const pull = 340 * dt;
        g.x += (dx / (dist || 1)) * pull;
        g.y += (dy / (dist || 1)) * pull;
      }
      if (dist < p.r + g.r + 4) {
        this.gainXp(g.val);
        sfx.gem();
        this.gems.splice(i, 1);
      }
    }

    // 7. 대미지 팝업
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.y -= 28 * dt;
      pop.life -= dt;
      if (pop.life <= 0) this.popups.splice(i, 1);
    }

    this.cb.onHudUpdate?.(this.getSnapshot());
  }

  render() {
    const ctx = this.ctx;
    const p = this.player;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.save();
    ctx.translate(this.w / 2 - this.cam.x, this.h / 2 - this.cam.y);

    // 모눈종이 타일 그리드
    const startX = Math.floor((this.cam.x - this.w / 2) / TILE_SIZE) * TILE_SIZE;
    const endX = this.cam.x + this.w / 2 + TILE_SIZE;
    const startY = Math.floor((this.cam.y - this.h / 2) / TILE_SIZE) * TILE_SIZE;
    const endY = this.cam.y + this.h / 2 + TILE_SIZE;

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += TILE_SIZE) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += TILE_SIZE) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    // 목적지 타일 표시
    if (p.target) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.fillRect(p.target.tx * TILE_SIZE, p.target.ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);

      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.target.x, p.target.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(p.target.x, p.target.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.stroke();
    }

    // 경험치 젬
    for (const g of this.gems) {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = g.val >= 20 ? '#c084fc' : '#38bdf8';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.fillRect(-g.r * 0.7, -g.r * 0.7, g.r * 1.4, g.r * 1.4);
      ctx.strokeRect(-g.r * 0.7, -g.r * 0.7, g.r * 1.4, g.r * 1.4);
      ctx.restore();
    }

    // 자동 조준 타겟 링
    if (this.aimMode === 'auto') {
      const target = this.findNearestEnemy();
      if (target) {
        ctx.strokeStyle = '#e11d48';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.r + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 적 렌더링
    for (const e of this.enemies) {
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.color;
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 적 눈
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(e.x - 5, e.y - 3, 2.5, 0, Math.PI * 2);
      ctx.arc(e.x + 5, e.y - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 투사체
    for (const b of this.projectiles) {
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 회전 지우개
    if (p.orbitals > 0) {
      for (let i = 0; i < p.orbitals; i++) {
        const ang = p.orbitAngle + (Math.PI * 2 * i) / p.orbitals;
        const ox = p.x + Math.cos(ang) * 74;
        const oy = p.y + Math.sin(ang) * 74;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(ang);
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2.5;
        ctx.fillRect(-10, -7, 20, 14);
        ctx.strokeRect(-10, -7, 20, 14);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(2, -7, 8, 14);
        ctx.strokeRect(2, -7, 8, 14);
        ctx.restore();
      }
    }

    // 조준 방향 표시선 (마우스 모드일 때)
    if (this.aimMode === 'mouse') {
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(p.aimAngle) * 52, p.y + Math.sin(p.aimAngle) * 52);
      ctx.stroke();
    }

    // 플레이어 아바타 (카툰 젤리 스타일)
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.invuln > 0 && Math.floor(p.invuln * 16) % 2 === 0) ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#4ade80';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 조준 방향을 바라보는 눈
    const lookX = Math.cos(p.aimAngle) * 4;
    const lookY = Math.sin(p.aimAngle) * 4;
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(-6 + lookX, -2 + lookY, 3, 0, Math.PI * 2);
    ctx.arc(6 + lookX, -2 + lookY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 대미지 팝업
    ctx.font = '900 14px "Noto Sans KR"';
    ctx.textAlign = 'center';
    for (const pop of this.popups) {
      ctx.globalAlpha = Math.max(0, pop.life * 2);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, pop.x, pop.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }
}