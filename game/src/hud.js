// HUD controller: every DOM element from index.html, driven by main.js.
// Numbers use the monospace readout face; the killfeed, banners, buy menu,
// scoreboard and minimap all live here so main.js stays about the game.
import { WEAPONS, WEAPON_ORDER, ARMOR_PRICE } from './weapons.js';
import { TEAMS } from './palette.js';

const $ = (id) => document.getElementById(id);

export const BUY_ITEMS = [
  { id: 'mule', key: 'Digit1' },
  { id: 'raptor', key: 'Digit2' },
  { id: 'longbow', key: 'Digit3' },
  { id: 'needle', key: 'Digit4' },
  { id: 'armor', key: 'Digit5' },
];

export function createHud({ onBuy }) {
  const els = {
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    hpNum: $('hp-num'), hpBar: $('hp-bar'), armorBar: $('armor-bar'), armorTag: $('armor-tag'),
    weaponName: $('weapon-name'), ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'),
    money: $('money'), reloadTip: $('reload-tip'),
    timer: $('timer'), scoreline: $('scoreline'), killfeed: $('killfeed'),
    objective: $('objective'), chargeTag: $('charge-tag'),
    banner: $('banner'), bannerSub: $('banner-sub'),
    plantbar: $('plantbar'), plantLabel: $('plantbar-label'), plantFill: $('plantbar-fill'),
    buymenu: $('buymenu'), buyGrid: $('buy-grid'), buyMoney: $('buy-money'), buyTimer: $('buy-timer'),
    scoreboard: $('scoreboard'), sbBody: $('sb-body'), sbTitle: $('sb-title'),
    dmgVig: $('dmg-vignette'), dmgDir: $('dmg-dir'), scope: $('scope'),
    minimap: $('minimap').getContext('2d'),
  };
  let bannerTimer = null;
  let hitTimer = null;
  let dmgTimer = null;

  function fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`;
  }

  const hud = {
    els,
    fmtTime,

    setVitals(hp, armor, hasArmor) {
      els.hpNum.textContent = Math.ceil(hp);
      els.hpBar.firstElementChild.style.width = `${Math.max(0, hp)}%`;
      els.hpBar.classList.toggle('low', hp <= 30);
      els.armorBar.firstElementChild.style.width = `${hasArmor ? Math.max(0, armor) : 0}%`;
      els.armorTag.textContent = hasArmor ? `ARMOUR ${Math.ceil(armor)}` : 'NO ARMOUR';
      els.armorTag.classList.toggle('on', hasArmor);
    },
    setWeapon(name, mag, reserve, reloading, needsReload) {
      els.weaponName.textContent = name.toUpperCase();
      els.ammoMag.textContent = mag;
      els.ammoMag.classList.toggle('low', mag === 0);
      els.ammoReserve.textContent = `/ ${reserve}`;
      els.reloadTip.textContent = reloading ? 'RELOADING…' : needsReload ? 'PRESS R — RELOAD' : '';
    },
    setMoney(m) {
      els.money.textContent = `$${m.toLocaleString('en-US')}`;
    },
    setTimer(seconds, mode) {
      els.timer.textContent = fmtTime(seconds);
      els.timer.classList.toggle('low', mode === 'live' && seconds <= 20);
      els.timer.classList.toggle('planted', mode === 'planted');
    },
    setScore(emb, sbl, round, phaseLabel) {
      els.scoreline.innerHTML =
        `<span class="emb">EMBER ${emb}</span><span class="rnd">${phaseLabel ?? `ROUND ${round} · FIRST TO 7`}</span><span class="sbl">${sbl} SABLE</span>`;
    },
    setObjective(html) { els.objective.innerHTML = html; },
    setChargeTag(on) { els.chargeTag.style.display = on ? 'block' : 'none'; },
    setCrosshairSpread(deg) {
      // degrees → pixels of tick gap, roughly matching the on-screen bloom
      const px = 5 + deg * 9;
      els.crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    setScope(on) { els.scope.style.display = on ? 'block' : 'none'; },
    setCrosshairVisible(on) { els.crosshair.style.display = on ? 'block' : 'none'; },

    hitmarker(kill = false) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', kill);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => els.hitmarker.classList.remove('on'), kill ? 220 : 110);
    },
    // screenshot poses: a hitmarker that stays on
    pinHitmarker(kill = false) {
      clearTimeout(hitTimer);
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', kill);
    },

    damageFrom(relAngle) {
      els.dmgVig.style.opacity = '1';
      els.dmgDir.style.opacity = '1';
      els.dmgDir.style.transform = `translate(-50%, -50%) rotate(${relAngle}rad)`;
      clearTimeout(dmgTimer);
      dmgTimer = setTimeout(() => {
        els.dmgVig.style.opacity = '0';
        els.dmgDir.style.opacity = '0';
      }, 450);
    },

    killfeed(killer, victim, weaponName, headshot) {
      const div = document.createElement('div');
      div.className = 'kf panel';
      const kc = killer.team === 'ember' ? 'emb' : 'sbl';
      const vc = victim.team === 'ember' ? 'emb' : 'sbl';
      div.innerHTML = `<span class="${kc}">${killer.name}</span><span class="wpn">${weaponName}${headshot ? ' <span class="hs">⌖ HEADSHOT</span>' : ''}</span><span class="${vc}">${victim.name}</span>`;
      els.killfeed.prepend(div);
      while (els.killfeed.children.length > 6) els.killfeed.lastChild.remove();
      setTimeout(() => { div.style.opacity = '0.35'; }, 4200);
      setTimeout(() => { div.remove(); }, 6000);
    },

    banner(title, sub = '', ms = 2600, color = null) {
      els.banner.textContent = title;
      els.banner.style.color = color ?? '';
      els.banner.classList.add('show');
      els.bannerSub.textContent = sub;
      els.bannerSub.classList.add('show');
      clearTimeout(bannerTimer);
      if (ms > 0) {
        bannerTimer = setTimeout(() => {
          els.banner.classList.remove('show');
          els.bannerSub.classList.remove('show');
        }, ms);
      }
    },
    hideBanner() {
      els.banner.classList.remove('show');
      els.bannerSub.classList.remove('show');
    },

    plantBar(label, frac) {
      if (frac === null || frac === undefined) {
        els.plantbar.style.display = 'none';
        return;
      }
      els.plantbar.style.display = 'block';
      els.plantLabel.textContent = label;
      els.plantFill.style.width = `${Math.min(100, frac * 100)}%`;
    },

    // --- buy menu -------------------------------------------------------------
    buyOpen: false,
    renderBuy({ money, ownedId, hasArmor, timeLeft }) {
      els.buyMoney.textContent = `$${money.toLocaleString('en-US')}`;
      els.buyTimer.textContent = timeLeft !== undefined ? fmtTime(timeLeft) : '';
      els.buyGrid.innerHTML = '';
      const descs = {
        mule: '8 pellets · devastating up close',
        raptor: 'Fast fire · strong on the move',
        longbow: 'Accurate, hard-hitting all-rounder',
        needle: 'One-shot kills · right-click scope',
        armor: 'Absorbs 45% of damage taken',
      };
      for (const item of BUY_ITEMS) {
        const isArmor = item.id === 'armor';
        const def = isArmor ? null : WEAPONS[item.id];
        const price = isArmor ? ARMOR_PRICE : def.price;
        const owned = isArmor ? hasArmor : ownedId === item.id;
        const afford = money >= price;
        const div = document.createElement('div');
        div.className = `buy-item${owned || !afford ? ' disabled' : ''}`;
        div.innerHTML = `<div><span class="key">${item.key.replace('Digit', '')}</span><span class="nm">${isArmor ? 'Kevlar Armour + Helmet' : def.name}</span><div class="ds">${owned ? 'OWNED' : descs[item.id]}</div></div><div class="pr">$${price.toLocaleString('en-US')}</div>`;
        if (!owned && afford) div.addEventListener('click', () => onBuy(item.id));
        els.buyGrid.appendChild(div);
      }
    },
    showBuy(state) {
      hud.buyOpen = true;
      els.buymenu.style.display = 'grid';
      hud.renderBuy(state);
    },
    hideBuy() {
      hud.buyOpen = false;
      els.buymenu.style.display = 'none';
    },

    // --- scoreboard -------------------------------------------------------------
    showScoreboard(actors, title) {
      els.sbTitle.textContent = title ?? 'SCOREBOARD';
      els.sbBody.innerHTML = '';
      for (const teamId of ['ember', 'sable']) {
        const head = document.createElement('tr');
        head.className = 'team-head';
        head.innerHTML = `<td colspan="5" style="color:${teamId === 'ember' ? 'var(--ember)' : 'var(--sable)'}">${TEAMS[teamId].name.toUpperCase()} — ${TEAMS[teamId].role.toUpperCase()}</td>`;
        els.sbBody.appendChild(head);
        for (const a of actors.filter((x) => x.team === teamId)) {
          const tr = document.createElement('tr');
          if (!a.alive) tr.className = 'dead';
          tr.innerHTML = `<td class="nm">${a.name}${a.isPlayer ? ' (you)' : ''}</td><td>${a.kills ?? 0}</td><td>${a.deaths ?? 0}</td><td>$${(a.money ?? 0).toLocaleString('en-US')}</td><td>${a.alive ? 'ALIVE' : 'DOWN'}</td>`;
          els.sbBody.appendChild(tr);
        }
      }
      els.scoreboard.style.display = 'grid';
    },
    hideScoreboard() { els.scoreboard.style.display = 'none'; },

    // --- minimap -------------------------------------------------------------
    drawMinimap(world, actors, player, plantedSiteId) {
      const ctx = els.minimap;
      const S = 148, W = 124;
      const px = (x) => (x + W / 2) / W * S;
      ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = 'rgba(24,22,19,1)';
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = 'rgba(141,133,120,0.5)';
      for (const c of world.colliders) {
        const w = Math.max(1.5, (c.maxX - c.minX) / W * S);
        const h = Math.max(1.5, (c.maxZ - c.minZ) / W * S);
        ctx.fillRect(px(c.minX), px(c.minZ), w, h);
      }
      for (const site of world.sites) {
        const planted = plantedSiteId === site.id;
        ctx.strokeStyle = planted ? '#ffcf3f' : 'rgba(216,164,28,0.85)';
        ctx.lineWidth = planted ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.arc(px(site.center.x), px(site.center.z), site.radius / W * S, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#f2ede4';
        ctx.font = '700 10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(site.id, px(site.center.x), px(site.center.z) + 3.5);
      }
      for (const a of actors) {
        if (!a.alive) continue;
        if (a.isPlayer) continue;
        ctx.fillStyle = a.team === 'ember' ? '#e8641e' : '#2e8f86';
        ctx.beginPath();
        ctx.arc(px(a.pos.x), px(a.pos.z), 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      // player: white dot with a view tick
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px(player.pos.x), px(player.pos.z), 3.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px(player.pos.x), px(player.pos.z));
      ctx.lineTo(px(player.pos.x) - Math.sin(player.yaw) * 9, px(player.pos.z) - Math.cos(player.yaw) * 9);
      ctx.stroke();
    },
  };
  return hud;
}
