import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const S = 20; // tile size; the map is the contribution grid plus one tile of water on each side

// Day is for GitHub's light mode and night for dark mode. Both palettes keep the same list lengths, so every tile picks the same variant.
// Light comes from the top left: `light` is the sun or moon, `shade` is the color of shadows, `lamp` is window light at night.
const DAY = {
  water: '#7cc6de', deep: '#5fb0d1', wave: '#fff', shallow: '#a9e4f0', shore: '#bfe8f2', cliff: '#a8774f', grass: '#a7d676', tuft: '#6aa84f',
  wood: '#8b5e3c', wall: '#fbf0da', sail: '#fff', lit: '#ffd166', unlit: '#8fb3cf', light: '#fff6dc', shade: '#13233a',
  leaves: ['#4e9a52', '#5aab5a', '#3f8a55'],
  roofs: ['#e76f51', '#f4a261', '#d1495b', '#6c8ebf'],
  towers: [['#dfe6ee', '#f5f8fb'], ['#f0dcc0', '#faf0e2'], ['#cfd8e6', '#eaf0f7']], // [wall, roof]
};
const NIGHT = {
  water: '#20385c', deep: '#152846', wave: '#9fb7d9', shallow: '#2c527c', shore: '#2d4f77', cliff: '#4a3a30', grass: '#45703f', tuft: '#365a32',
  wood: '#5a4030', wall: '#c9bc9f', sail: '#dfe5ee', lit: '#ffd166', unlit: '#2a3a52', light: '#b7ccf2', shade: '#02060d', lamp: '#ffc95c',
  leaves: ['#2e5a3a', '#36673f', '#294f35'],
  roofs: ['#a9533f', '#b5784a', '#933a49', '#4b6390'],
  towers: [['#59677a', '#6f7d90'], ['#77685a', '#8b7c6c'], ['#526178', '#67768d']],
};

// Sprites are drawn around their base point (0,0). Parts without a fill take the fill of the <use>.
// Shadows fall to the bottom right, trees are lit like spheres, and roofs and walls darken away from the light.
const sprites = (t) => `
<g id="grass" fill="none" stroke="${t.tuft}" stroke-width="1.4" stroke-linecap="round"><path d="M-3 0l-1-3.5M0 0v-4.5M3 0l1-3.5"/></g>
<g id="tree"><ellipse cx="3" rx="8" ry="2.6" fill="url(#shadow)"/><rect x="-1.5" y="-6" width="3" height="6" rx="1" fill="${t.wood}"/><circle cy="-10" r="6.5"/><circle cy="-10" r="6.5" fill="url(#ball)"/></g>
<g id="house"><ellipse cx="3" rx="10" ry="2.8" fill="url(#shadow)"/><path d="M-6-8h12v8H-6z" fill="${t.wall}"/><path d="M-6-8h12v8H-6z" fill="url(#face)"/><path d="M-8-7.5 0-15l8 7.5z"/><path d="M0-15l8 7.5H0z" fill="${t.shade}" opacity=".22"/><path d="M-6-7.5h12v1.2H-6z" fill="${t.shade}" opacity=".2"/><rect x="-1.5" y="-5" width="3" height="5" fill="${t.wood}"/><path d="M-5-6h2.5v2.5H-5zM2.5-6H5v2.5H2.5z" fill="${t.lit}"/></g>
<g id="boat"><ellipse rx="9" ry="1.8" fill="#fff" opacity=".3"/><path d="M-7-3h14l-2.5 3.5h-9z"/><path d="M0-15v12" stroke="${t.wood}"/><path d="M1-14v10h6z" fill="${t.sail}"/><path d="M-1-11v7h-4.5z" fill="${t.wall}"/></g>`;

// Soft light and shadow. Crisp shapes are never filtered, so their edges stay sharp at any size; filters only add soft layers on top.
// The bevel lights the top-left edges of the islands and shades the bottom-right ones by comparing the land with a blurred, shifted copy of itself.
// The ripple turns the bright parts of stretched noise into streaks of wave color on the water.
const shaders = (t, w, h) => `
<clipPath id="frame"><rect width="${w}" height="${h}" rx="12"/></clipPath>
<clipPath id="island"><use href="#land"/></clipPath>
<filter id="blur" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="bevel" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}">
<feGaussianBlur in="SourceAlpha" stdDeviation="2" result="b"/>
<feOffset in="b" dx="2" dy="2" result="bd"/><feComposite in="SourceAlpha" in2="bd" operator="out" result="litEdge"/>
<feFlood flood-color="${t.light}" flood-opacity=".55"/><feComposite in2="litEdge" operator="in" result="lit"/>
<feOffset in="b" dx="-2" dy="-2" result="bu"/><feComposite in="SourceAlpha" in2="bu" operator="out" result="shadeEdge"/>
<feFlood flood-color="${t.shade}" flood-opacity=".3"/><feComposite in2="shadeEdge" operator="in" result="shade"/>
<feMerge><feMergeNode in="lit"/><feMergeNode in="shade"/></feMerge>
</filter>
<filter id="ripple" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}">
<feTurbulence type="fractalNoise" baseFrequency=".03 .14" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 6 0 0 0 -3.4"/>
<feComposite in="SourceGraphic" operator="in"/>
</filter>
<linearGradient id="sea" x2="0" y2="1"><stop offset="0" stop-color="${t.water}"/><stop offset="1" stop-color="${t.deep}"/></linearGradient>
<radialGradient id="shadow"><stop offset="0" stop-color="${t.shade}" stop-opacity=".38"/><stop offset="1" stop-color="${t.shade}" stop-opacity="0"/></radialGradient>
<radialGradient id="ball" fx=".3" fy=".3"><stop offset="0" stop-color="${t.light}" stop-opacity=".6"/><stop offset=".5" stop-color="${t.light}" stop-opacity="0"/><stop offset="1" stop-color="${t.shade}" stop-opacity=".45"/></radialGradient>
<linearGradient id="face" x2="0" y2="1"><stop offset="0" stop-color="${t.light}" stop-opacity=".2"/><stop offset="1" stop-color="${t.shade}" stop-opacity=".25"/></linearGradient>
<radialGradient id="vignette" r=".75"><stop offset=".6" stop-color="${t.shade}" stop-opacity="0"/><stop offset="1" stop-color="${t.shade}" stop-opacity=".18"/></radialGradient>
${t.lamp ? `<radialGradient id="lamp"><stop offset="0" stop-color="${t.lamp}" stop-opacity=".5"/><stop offset="1" stop-color="${t.lamp}" stop-opacity="0"/></radialGradient>` : ''}`;

// Command-line arguments, or the action's inputs when GitHub Actions runs this file.
const [user = process.env.INPUT_USERNAME, out = process.env.INPUT_PATH || 'village.svg'] = process.argv.slice(2);
const token = process.env.INPUT_TOKEN || process.env.GITHUB_TOKEN;
if (!user) {
  console.error('Usage: node village.js <github-username> [output.svg]\n       node village.js --random [output.svg]');
  process.exit(1);
}

// --random makes up a graph for trying out the look without anyone's data. GitHub usernames can't start with a hyphen.
// Otherwise the action always has a token, so it uses the API. Local runs without one read the public page instead.
const random = user === '--random';
const grid = random ? randomGrid() : token ? await fromApi(user, token) : await fromPage(user);
const nightOut = out.replace(/\.svg$/i, '') + '-dark.svg';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, render(grid, DAY));
writeFileSync(nightOut, render(grid, NIGHT));
console.log(`Wrote ${out} and ${nightOut} from ${random ? 'a random graph' : token ? 'the GitHub API' : 'the public contributions page'}`);

async function fromApi(user, token) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query: `query ($login: String!) {
        user(login: $login) { contributionsCollection { contributionCalendar { weeks { contributionDays { weekday contributionCount } } } } }
      }`,
      variables: { login: user },
    }),
  });
  const { data, errors, message } = await res.json().catch(() => ({}));
  if (!res.ok || errors) throw new Error(`GitHub API: ${errors?.[0].message ?? message ?? res.status}`);
  // The first week can start mid-week, so each day is placed by its weekday.
  return data.user.contributionsCollection.contributionCalendar.weeks.map(({ contributionDays }) => {
    const week = [];
    for (const { weekday, contributionCount } of contributionDays) week[weekday] = contributionCount;
    return week;
  });
}

// Every day on github.com/users/<user>/contributions has a tooltip like
// for="contribution-day-component-<weekday>-<week>" ...>3 contributions on ...
async function fromPage(user) {
  const res = await fetch(`https://github.com/users/${encodeURIComponent(user)}/contributions`);
  if (!res.ok) throw new Error(`GitHub returned ${res.status} for "${user}"`);
  const grid = [];
  const days = (await res.text()).matchAll(/contribution-day-component-(\d+)-(\d+)"[^>]*>(No|[\d,]+) contribution/g);
  for (const [, day, week, n] of days) {
    grid[week] ??= [];
    grid[week][day] = n === 'No' ? 0 : Number(n.replaceAll(',', ''));
  }
  if (!grid.length) throw new Error(`No contributions found for "${user}"`);
  return grid;
}

// A made-up year. How busy each week is drifts from week to week, giving quiet stretches of sea and busy towns
// like a real graph, so nearly every run has every kind of tile and some boats.
function randomGrid() {
  let busy = Math.random(); // the chance that a day has contributions
  return Array.from({ length: 53 }, () => {
    busy = Math.min(1, Math.max(0, busy + Math.random() * 0.8 - 0.4));
    return Array.from({ length: 7 }, () => (Math.random() < busy ? 1 + Math.floor(Math.random() ** 3 * 30 * busy) : 0));
  });
}

function render(grid, t) {
  const weeks = grid.length;
  const width = (weeks + 2) * S;
  const height = 9 * S;
  const count = (w, d) => grid[w]?.[d] ?? 0;
  // Boats go on real days (not the margin) that have water to the left, right, top and bottom.
  const roomForBoat = (w, d) => grid[w]?.[d] === 0 && !count(w - 1, d) && !count(w + 1, d) && !count(w, d - 1) && !count(w, d + 1);

  let land = '';
  let waves = '';
  let things = '';
  for (let d = -1; d <= 7; d++) {
    for (let w = -1; w <= weeks; w++) {
      const n = count(w, d);
      const x = (w + 1) * S;
      const y = (d + 1) * S;
      const r = (k) => rand(w, d, k);
      if (n) {
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dw, dd]) => (count(w + dw, d) || count(w, d + dd) ? 0 : 7));
        land += tile(x, y, corners);
        things += sprite(n, x + S / 2, y + S * 0.75, r, t);
      } else if (roomForBoat(w, d) && r(4) < 0.1) {
        things += sprite(0, x + S / 2, y + S * 0.75, r, t);
      } else if (!count(w, d + 1) && r(0) < 0.12) { // no waves right behind land, where they'd peek over roofs
        waves += `M${x + 5} ${y + 10}q2.5-2.5 5 0t5 0`;
      }
    }
  }

  // Back to front: sea and its ripples, shallow water, the islands' shadow on the water, shore, cliff (the land shifted down),
  // grass and its lit edges, everything standing on the land, then a soft darkening towards the edges of the picture.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs><path id="land" d="${land}"/>${shaders(t, width, height)}${sprites(t)}</defs>
<g clip-path="url(#frame)">
<rect width="${width}" height="${height}" fill="url(#sea)"/>
<rect width="${width}" height="${height}" fill="${t.wave}" filter="url(#ripple)" opacity=".22"/>
<path d="${waves}" fill="none" stroke="${t.wave}" stroke-opacity=".5" stroke-width="1.2" stroke-linecap="round"/>
<use href="#land" y="3" fill="${t.shallow}" filter="url(#blur)"/>
<use href="#land" x="4" y="9" fill="${t.shade}" opacity=".3" filter="url(#blur)"/>
<g fill="${t.shore}" stroke="${t.shore}" stroke-width="5" stroke-linejoin="round"><use href="#land"/><use href="#land" y="5"/></g>
<use href="#land" y="5" fill="${t.cliff}"/>
<use href="#land" fill="${t.grass}"/>
<use href="#land" filter="url(#bevel)"/>
${things}
<rect width="${width}" height="${height}" fill="url(#vignette)"/>
</g>
</svg>
`;
}

// A land square. Each corner radius is 0 where it touches more land, so neighbouring tiles merge into islands.
function tile(x, y, [tl, tr, br, bl]) {
  const right = x + S;
  const bottom = y + S;
  return [
    `M${x + tl} ${y}H${right - tr}Q${right} ${y} ${right} ${y + tr}`,
    `V${bottom - br}Q${right} ${bottom} ${right - br} ${bottom}`,
    `H${x + bl}Q${x} ${bottom} ${x} ${bottom - bl}`,
    `V${y + tl}Q${x} ${y} ${x + tl} ${y}Z`,
  ].join('');
}

function sprite(n, cx, by, r, t) {
  const jx = cx + Math.round(r(1) * 4 - 2); // nudge plants and boats off the grid a little
  const jy = by + Math.round(r(2) * 4 - 2);
  if (n === 0) {
    const hull = pick(t.roofs, r(3));
    // Its reflection first: the same boat flipped and squashed below the waterline.
    return `<use href="#boat" transform="translate(${jx} ${jy}) scale(1 -.6)" fill="${hull}" opacity=".2"/><use href="#boat" x="${jx}" y="${jy}" fill="${hull}"/>`;
  }
  if (n === 1) return `<use href="#grass" x="${jx}" y="${jy}"/>`;
  if (n === 2) return `<use href="#tree" x="${jx}" y="${jy}" fill="${pick(t.leaves, r(3))}"/>`;
  const glow = t.lamp ? `<ellipse cx="${cx}" cy="${by}" rx="16" ry="8" fill="url(#lamp)"/>` : ''; // window light on the ground at night
  if (n <= 5) return `${glow}<use href="#house" x="${cx}" y="${by}" fill="${pick(t.roofs, r(3))}"/>`;
  return glow + building(n, cx, by, r, t);
}

// Busier days get taller buildings: 6-7 contributions is 2 floors, 16+ is 5.
function building(n, cx, by, r, t) {
  const floors = Math.min(5, Math.floor(n / 4) + 1);
  const h = floors * 5 + 2;
  const [wall, roof] = pick(t.towers, r(3));
  let lit = '';
  let dark = '';
  for (let i = 0; i < floors * 3; i++) {
    const win = `M${(i % 3) * 4 - 5} ${Math.floor(i / 3) * 5 + 2 - h}h2v3h-2z`;
    if (r(4 + i) < 0.6) lit += win;
    else dark += win;
  }
  // Taller buildings cast longer shadows, clipped to the land so they never fall on the water.
  const shadow = `<ellipse cx="${cx + 2 + h / 4}" cy="${by}" rx="${9 + h / 5}" ry="3" fill="url(#shadow)" clip-path="url(#island)"/>`;
  return `${shadow}<g transform="translate(${cx} ${by})"><rect x="-7" y="${-h}" width="14" height="${h}" fill="${wall}"/><rect x="-7" y="${-h}" width="14" height="${h}" fill="url(#face)"/><rect x="-7" y="${-h - 4}" width="14" height="4" fill="${roof}"/><path d="${lit}" fill="${t.lit}"/><path d="${dark}" fill="${t.unlit}"/></g>`;
}

// Deterministic per-tile randomness, so the same graph always gives the same village.
function rand(w, d, k) {
  const s = Math.sin(w * 12.9898 + d * 78.233 + k * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

function pick(list, t) {
  return list[Math.floor(t * list.length)];
}
