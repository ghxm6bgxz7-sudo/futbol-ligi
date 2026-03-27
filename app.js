/* ==========================================
   OKUL FUTBOL LİGİ — APP.JS  v2
   ========================================== */

// ── FIREBASE CONFIG ────────────────────────
// Firebase Console'dan aldığınız config bilgilerini buraya yapıştırın:
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCZ0dP9kS3QGEqKPlXmh_oevf_CtJBuhvU",
  authDomain:        "yssal-futbol-ligi.firebaseapp.com",
  databaseURL:       "https://yssal-futbol-ligi-default-rtdb.firebaseio.com",
  projectId:         "yssal-futbol-ligi",
  storageBucket:     "yssal-futbol-ligi.firebasestorage.app",
  messagingSenderId: "490980348074",
  appId:             "1:490980348074:web:bda46aaf37a3b69ac080d3",
  measurementId:     "G-CDKNF2MSEY"
};

// ── IN-MEMORY CACHE (Firebase'den senkronize edilir) ─
let CACHE = { teams: [], players: [], results: [], fixtures: [] };

// ── DATA STORE ────────────────────────────
const DB = {
  get teams()    { return CACHE.teams; },
  get players()  { return CACHE.players; },
  get results()  { return CACHE.results; },
  get fixtures() { return CACHE.fixtures; },
  _toObj(arr)    { const o = {}; arr.forEach(x => o[x.id] = x); return o; },
  saveTeams(v)    { CACHE.teams    = v; firebase.database().ref('fl_teams').set(v.length    ? this._toObj(v) : null); },
  savePlayers(v)  { CACHE.players  = v; firebase.database().ref('fl_players').set(v.length  ? this._toObj(v) : null); },
  saveResults(v)  { CACHE.results  = v; firebase.database().ref('fl_results').set(v.length  ? this._toObj(v) : null); },
  saveFixtures(v) { CACHE.fixtures = v; firebase.database().ref('fl_fixtures').set(v.length ? this._toObj(v) : null); },
};

// ── WEATHER ENGINE ────────────────────────
const WEATHER_PROFILES = [
  { icon: '☀️',  desc: 'Açık', tempBase: 16 },
  { icon: '🌤️', desc: 'Az Bulutlu', tempBase: 14 },
  { icon: '⛅',  desc: 'Parçalı Bulutlu', tempBase: 13 },
  { icon: '🌥️', desc: 'Çok Bulutlu', tempBase: 11 },
  { icon: '🌦️', desc: 'Aralıklı Yağmur', tempBase: 9  },
  { icon: '🌧️', desc: 'Yağmurlu', tempBase: 8  },
  { icon: '🌩️', desc: 'Fırtınalı', tempBase: 7  },
];
// Seed from date so weather is stable for the day but changes day-to-day
function dayWeatherSeed() {
  const d = new Date();
  return d.getFullYear() * 1000 + d.getMonth() * 40 + d.getDate();
}
function seededRand(seed, offset) {
  let x = Math.sin(seed + offset) * 10000;
  return x - Math.floor(x);
}

function buildWeather() {
  const seed    = dayWeatherSeed();
  const profIdx = Math.floor(seededRand(seed, 1) * WEATHER_PROFILES.length);
  const profile = WEATHER_PROFILES[profIdx];
  const now     = new Date();
  const nowH    = now.getHours();

  // Generate 24h temps: sine curve peaking at 14:00
  function hourTemp(h) {
    const base   = profile.tempBase;
    const curve  = Math.sin(((h - 6) / 24) * Math.PI * 2) * 5;
    const noise  = (seededRand(seed, h + 100) - 0.5) * 2;
    return Math.round(base + curve + noise);
  }

  // Current conditions
  const nowTemp = hourTemp(nowH);

  // Next 6 hours from now
  const hours = [];
  for (let i = 0; i <= 5; i++) {
    const h = (nowH + i) % 24;
    const r = seededRand(seed, h + 200);
    // slight icon variation by hour
    const iVar = (profIdx + (r > 0.7 ? 1 : 0)) % WEATHER_PROFILES.length;
    hours.push({ h, icon: WEATHER_PROFILES[iVar].icon, temp: hourTemp(h), isCurrent: i === 0 });
  }

  return { profile, nowTemp, hours };
}

function renderWeather() {
  const w        = buildWeather();
  const nowEl    = document.getElementById('weatherNow');
  const hoursEl  = document.getElementById('weatherHours');
  const now      = new Date();

  nowEl.innerHTML = `
    <span class="w-icon">${w.profile.icon}</span>
    <div>
      <div class="w-temp">${w.nowTemp}°C</div>
      <div class="w-desc">${w.profile.desc}</div>
    </div>`;

  hoursEl.innerHTML = w.hours.map(h => {
    const label = h.isCurrent ? 'Şimdi' : `${String(h.h).padStart(2,'0')}:00`;
    return `<div class="weather-hour${h.isCurrent ? ' current' : ''}">
      <span class="wh-time">${label}</span>
      <span class="wh-icon">${h.icon}</span>
      <span class="wh-temp">${h.temp}°</span>
    </div>`;
  }).join('');
}

// ── STANDINGS ENGINE ──────────────────────
function computeStandings() {
  const teams   = DB.teams;
  const results = DB.results;
  const map = {};

  teams.forEach(t => {
    map[t.id] = {
      id: t.id, name: t.name, color: t.color,
      played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, points: 0,
    };
  });

  results.forEach(r => {
    const h = map[r.homeId], a = map[r.awayId];
    if (!h || !a) return;
    h.played++; a.played++;
    h.goalsFor += r.homeScore; h.goalsAgainst += r.awayScore;
    a.goalsFor += r.awayScore; a.goalsAgainst += r.homeScore;
    if (r.homeScore > r.awayScore)      { h.won++; h.points += 3; a.lost++; }
    else if (r.homeScore < r.awayScore) { a.won++; a.points += 3; h.lost++; }
    else { h.drawn++; h.points++; a.drawn++; a.points++; }
  });

  return Object.values(map).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goalsFor - a.goalsAgainst, gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    return b.goalsFor - a.goalsFor;
  });
}

// ── RENDER STANDINGS ─────────────────────
function renderStandings() {
  const tbody = document.getElementById('standingsBody');
  const rows  = computeStandings();
  const total = rows.length;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state">Yönetim panelinden takım ekleyin.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((t, i) => {
    const rank  = i + 1;
    const gd    = t.goalsFor - t.goalsAgainst;
    const gdStr = gd > 0 ? `+${gd}` : `${gd}`;
    let rankHtml = rank;
    if (rank === 1) rankHtml = `<span class="rank-badge rank-1">1</span>`;
    else if (rank === 2) rankHtml = `<span class="rank-badge rank-2">2</span>`;
    else if (rank === 3) rankHtml = `<span class="rank-badge rank-3">3</span>`;
    const zoneClass = rank === 1 ? 'zone-gold' : '';
    return `
    <tr class="${zoneClass}">
      <td>${rankHtml}</td>
      <td><span class="team-badge"><span class="team-dot" style="background:${t.color}"></span>${t.name}</span></td>
      <td>${t.played}</td><td>${t.won}</td><td>${t.drawn}</td><td>${t.lost}</td>
      <td>${t.goalsFor}</td><td>${t.goalsAgainst}</td><td>${gdStr}</td>
      <td class="points-cell">${t.points}</td>
    </tr>`;
  }).join('');
}

// ── RENDER RESULTS ────────────────────────
function renderResults(filterWeek = 'all') {
  const grid    = document.getElementById('resultsGrid');
  const teams   = DB.teams;
  let results   = [...DB.results].sort((a, b) => b.week - a.week || b.date.localeCompare(a.date));
  if (filterWeek !== 'all') results = results.filter(r => r.week == filterWeek);

  if (!results.length) { grid.innerHTML = `<div class="empty-state">Henüz maç sonucu eklenmemiş.</div>`; return; }

  const findTeam = id => teams.find(t => t.id === id) || { name: '?', color: '#666' };
  grid.innerHTML = results.map(r => buildResultCard(r, findTeam)).join('');
}

function buildResultCard(r, findTeam) {
  const h    = findTeam(r.homeId);
  const a    = findTeam(r.awayId);
  const date = r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('tr-TR', { day:'2-digit', month:'short' }) : '';
  const hWin = r.homeScore > r.awayScore, aWin = r.awayScore > r.homeScore;

  // Event pills
  const events = (r.events || []).slice().sort((x,y) => x.minute - y.minute);
  let pillsHtml = '';
  if (events.length) {
    pillsHtml = `<div class="match-events-strip">` +
      events.map(ev => {
        if (ev.type === 'goal') {
          const players = DB.players;
          const scorer  = players.find(p => p.id === ev.playerId);
          const assist  = ev.assistId ? players.find(p => p.id === ev.assistId) : null;
          const assistTxt = assist ? ` <span style="opacity:.7">(${assist.name})</span>` : '';
          return `<span class="event-pill goal-pill"><span class="ep-min">${ev.minute}'</span> ⚽ ${scorer?.name || '?'}${assistTxt}</span>`;
        } else if (ev.type === 'yellow') {
          const player = DB.players.find(p => p.id === ev.playerId);
          return `<span class="event-pill yellow-pill"><span class="ep-min">${ev.minute}'</span> 🟨 ${player?.name || '?'}</span>`;
        } else if (ev.type === 'red') {
          const player = DB.players.find(p => p.id === ev.playerId);
          return `<span class="event-pill red-pill"><span class="ep-min">${ev.minute}'</span> 🟥 ${player?.name || '?'}</span>`;
        }
        return '';
      }).join('') + `</div>`;
  }

  return `
  <div class="match-card" data-result-id="${r.id}" onclick="openMatchModal('${r.id}')">
    <div class="match-card-top">
      <div class="match-meta"><span>Hafta ${r.week}</span><span>${date}</span></div>
      <div class="match-team" style="padding-top:16px">
        <span class="match-team-dot" style="background:${h.color}"></span>
        <span style="${hWin ? '' : 'opacity:.65'}">${h.name}</span>
      </div>
      <div class="match-score-box">
        <span class="${hWin ? 'winner-score' : ''}">${r.homeScore}</span>
        <span class="sep">:</span>
        <span class="${aWin ? 'winner-score' : ''}">${r.awayScore}</span>
      </div>
      <div class="match-team away" style="padding-top:16px">
        <span class="match-team-dot" style="background:${a.color}"></span>
        <span style="${aWin ? '' : 'opacity:.65'}">${a.name}</span>
      </div>
    </div>
    ${pillsHtml}
  </div>`;
}

// ── RENDER FIXTURES ───────────────────────
function renderFixtures() {
  const grid     = document.getElementById('fixturesGrid');
  const teams    = DB.teams;
  const fixtures = [...DB.fixtures].sort((a,b) => a.date.localeCompare(b.date));
  if (!fixtures.length) { grid.innerHTML = `<div class="empty-state">Henüz fikstür eklenmemiş.</div>`; return; }

  const findTeam = id => teams.find(t => t.id === id) || { name: '?', color: '#666' };
  grid.innerHTML = fixtures.map(f => {
    const h    = findTeam(f.homeId), a = findTeam(f.awayId);
    const date = f.date ? new Date(f.date + 'T00:00:00').toLocaleDateString('tr-TR', { weekday:'long', day:'2-digit', month:'long' }) : '';
    return `
    <div class="match-card upcoming">
      <div class="match-card-top">
        <div class="match-meta"><span>Hafta ${f.week}</span><span>${date}</span></div>
        <div class="match-team" style="padding-top:16px">
          <span class="match-team-dot" style="background:${h.color}"></span>
          <span>${h.name}</span>
        </div>
        <div class="match-score-box">${f.time || '?:??'}</div>
        <div class="match-team away" style="padding-top:16px">
          <span class="match-team-dot" style="background:${a.color}"></span>
          <span>${a.name}</span>
        </div>
      </div>
      ${f.venue ? `<div class="match-events-strip"><span class="event-pill">📍 ${f.venue}</span></div>` : ''}
    </div>`;
  }).join('');
}

// ── RENDER TEAMS TAB ──────────────────────
function renderTeamsTab() {
  const grid    = document.getElementById('teamsGrid');
  const teams   = DB.teams;
  const players = DB.players;
  if (!teams.length) { grid.innerHTML = `<div class="empty-state">Yönetim panelinden takım ekleyin.</div>`; return; }

  grid.innerHTML = teams.map(t => {
    const tp = players.filter(p => p.teamId === t.id).sort((a,b) => a.number - b.number);
    const playerRows = tp.length
      ? tp.map(p => `
          <div class="player-row">
            <div class="player-num">${p.number}</div>
            <div class="player-name">${p.name}</div>
            <div class="player-pos">${p.position}</div>
            ${adminUnlocked ? `<button class="btn-icon" onclick="event.stopPropagation();deletePlayer('${p.id}')" title="Sil">✕</button>` : ''}
          </div>`).join('')
      : `<div style="padding:14px 18px;font-size:.82rem;color:var(--text-muted)">Henüz oyuncu eklenmemiş.</div>`;

    return `
    <div class="team-card">
      <div class="team-card-header">
        <div class="team-badge-big" style="background:${t.color}">${t.name.charAt(0)}</div>
        <div>
          <div class="team-card-name">${t.name}</div>
          <div class="team-card-count">${tp.length} oyuncu</div>
        </div>
      </div>
      <div class="player-list">${playerRows}</div>
    </div>`;
  }).join('');
}

// ── HERO STATS ────────────────────────────
function renderHeroStats() {
  const standings = computeStandings();
  document.getElementById('totalTeams').textContent   = DB.teams.length;
  document.getElementById('totalMatches').textContent = DB.results.length;
  const leader = standings[0];
  document.getElementById('leaderName').textContent = leader ? leader.name : '—';
}

// ── POPULATE SELECTS ──────────────────────
function populateTeamSelects() {
  const teams  = DB.teams;
  const opts   = teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  const blank  = `<option value="">Seçin</option>`;
  ['homeTeam','awayTeam','fixtureHome','fixtureAway','playerTeam'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = blank + opts;
  });
}

// ── ADMIN TEAMS LIST ──────────────────────
function renderAdminTeamsList() {
  const list  = document.getElementById('adminTeamsList');
  const teams = DB.teams;
  if (!teams.length) { list.innerHTML = ''; return; }
  list.innerHTML = teams.map(t => `
    <div class="admin-team-item">
      <div class="admin-team-left">
        <span style="width:10px;height:10px;border-radius:50%;background:${t.color};display:inline-block;flex-shrink:0;"></span>
        <span>${t.name}</span>
      </div>
      <button class="btn-icon" onclick="deleteTeam('${t.id}')" title="Sil">✕</button>
    </div>`).join('');
}

// ── WEEK FILTER ───────────────────────────
function populateWeekFilter() {
  const sel   = document.getElementById('resultFilter');
  const weeks = [...new Set(DB.results.map(r => r.week))].sort((a,b)=>a-b);
  sel.innerHTML = `<option value="all">Tüm Haftalar</option>` +
    weeks.map(w => `<option value="${w}">Hafta ${w}</option>`).join('');
}

// ── STATS ENGINE ──────────────────────────
function computePlayerStats() {
  const results = DB.results;
  const players = DB.players;
  const teams   = DB.teams;
  const goalMap   = {};  // playerId → count
  const assistMap = {};  // playerId → count

  results.forEach(r => {
    (r.events || []).forEach(ev => {
      if (ev.type === 'goal') {
        goalMap[ev.playerId] = (goalMap[ev.playerId] || 0) + 1;
        if (ev.assistId) {
          assistMap[ev.assistId] = (assistMap[ev.assistId] || 0) + 1;
        }
      }
    });
  });

  const findPlayer = id => players.find(p => p.id === id);
  const findTeam   = id => teams.find(t => t.id === id);

  const scorers = Object.entries(goalMap)
    .map(([pid, count]) => ({ player: findPlayer(pid), count }))
    .filter(x => x.player)
    .sort((a, b) => b.count - a.count);

  const assisters = Object.entries(assistMap)
    .map(([pid, count]) => ({ player: findPlayer(pid), count }))
    .filter(x => x.player)
    .sort((a, b) => b.count - a.count);

  // Team stats
  const teamGoals   = {};  // teamId → { scored, conceded, scorers: { playerId: count } }
  const teamAssists = {};  // teamId → { total, assisters: { playerId: count } }

  teams.forEach(t => {
    teamGoals[t.id]   = { scored: 0, conceded: 0, scorers: {} };
    teamAssists[t.id] = { total: 0, assisters: {} };
  });

  results.forEach(r => {
    if (teamGoals[r.homeId]) {
      teamGoals[r.homeId].scored   += r.homeScore;
      teamGoals[r.homeId].conceded += r.awayScore;
    }
    if (teamGoals[r.awayId]) {
      teamGoals[r.awayId].scored   += r.awayScore;
      teamGoals[r.awayId].conceded += r.homeScore;
    }

    (r.events || []).forEach(ev => {
      const teamId = ev.teamSide === 'home' ? r.homeId : r.awayId;
      if (ev.type === 'goal') {
        if (teamGoals[teamId]?.scorers) {
          teamGoals[teamId].scorers[ev.playerId] = (teamGoals[teamId].scorers[ev.playerId] || 0) + 1;
        }
        if (ev.assistId && teamAssists[teamId]?.assisters) {
          teamAssists[teamId].total++;
          teamAssists[teamId].assisters[ev.assistId] = (teamAssists[teamId].assisters[ev.assistId] || 0) + 1;
        }
      }
    });
  });

  return { scorers, assisters, teamGoals, teamAssists, findPlayer, findTeam };
}

function renderStats() {
  const { scorers, assisters, teamGoals, teamAssists, findPlayer, findTeam } = computePlayerStats();
  const teams   = DB.teams;

  // ── Gol Krallığı ──
  const scorersEl = document.getElementById('topScorers');
  if (!scorers.length) {
    scorersEl.innerHTML = '<div class="empty-state">Henüz gol verisi yok.</div>';
  } else {
    scorersEl.innerHTML = scorers.slice(0, 15).map((s, i) => {
      const team = findTeam(s.player.teamId);
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `<span class="stat-rank">${i + 1}</span>`;
      return `
      <div class="stat-row ${i < 3 ? 'stat-top' : ''}">
        <span class="stat-medal">${medal}</span>
        <span class="stat-player">${s.player.name}</span>
        <span class="stat-team-dot" style="background:${team?.color || '#666'}"></span>
        <span class="stat-team-name">${team?.name || '?'}</span>
        <span class="stat-count">${s.count}</span>
      </div>`;
    }).join('');
  }

  // ── Asist Krallığı ──
  const assistsEl = document.getElementById('topAssists');
  if (!assisters.length) {
    assistsEl.innerHTML = '<div class="empty-state">Henüz asist verisi yok.</div>';
  } else {
    assistsEl.innerHTML = assisters.slice(0, 15).map((a, i) => {
      const team = findTeam(a.player.teamId);
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `<span class="stat-rank">${i + 1}</span>`;
      return `
      <div class="stat-row ${i < 3 ? 'stat-top' : ''}">
        <span class="stat-medal">${medal}</span>
        <span class="stat-player">${a.player.name}</span>
        <span class="stat-team-dot" style="background:${team?.color || '#666'}"></span>
        <span class="stat-team-name">${team?.name || '?'}</span>
        <span class="stat-count">${a.count}</span>
      </div>`;
    }).join('');
  }

  // ── Takım Gol Analizi ──
  const goalAnalysisEl = document.getElementById('teamGoalAnalysis');
  const teamGoalRows = teams.map(t => {
    const tg = teamGoals[t.id] || { scored: 0, conceded: 0, scorers: {} };
    const topScorer = Object.entries(tg.scorers).sort((a,b) => b[1] - a[1])[0];
    const topScorerPlayer = topScorer ? findPlayer(topScorer[0]) : null;
    const avg = DB.results.filter(r => r.homeId === t.id || r.awayId === t.id).length;
    const avgGoal = avg ? (tg.scored / avg).toFixed(1) : '0.0';
    return { team: t, scored: tg.scored, conceded: tg.conceded, topScorerPlayer, topScorerGoals: topScorer?.[1] || 0, avgGoal };
  }).sort((a, b) => b.scored - a.scored);

  if (!teamGoalRows.some(r => r.scored > 0)) {
    goalAnalysisEl.innerHTML = '<div class="empty-state">Henüz gol verisi yok.</div>';
  } else {
    goalAnalysisEl.innerHTML = `
    <table class="stats-table">
      <thead><tr>
        <th>Takım</th><th>AG</th><th>YG</th><th>Ort.</th><th>En Golcü</th>
      </tr></thead>
      <tbody>${teamGoalRows.map(r => `
        <tr>
          <td><span class="team-badge"><span class="team-dot" style="background:${r.team.color}"></span>${r.team.name}</span></td>
          <td class="points-cell">${r.scored}</td>
          <td>${r.conceded}</td>
          <td>${r.avgGoal}</td>
          <td>${r.topScorerPlayer ? `${r.topScorerPlayer.name} (${r.topScorerGoals})` : '—'}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  }

  // ── Takım Asist Analizi ──
  const assistAnalysisEl = document.getElementById('teamAssistAnalysis');
  const teamAssistRows = teams.map(t => {
    const ta = teamAssists[t.id] || { total: 0, assisters: {} };
    const topAssister = Object.entries(ta.assisters).sort((a,b) => b[1] - a[1])[0];
    const topAssistPlayer = topAssister ? findPlayer(topAssister[0]) : null;
    return { team: t, total: ta.total, topAssistPlayer, topAssistCount: topAssister?.[1] || 0 };
  }).sort((a, b) => b.total - a.total);

  if (!teamAssistRows.some(r => r.total > 0)) {
    assistAnalysisEl.innerHTML = '<div class="empty-state">Henüz asist verisi yok.</div>';
  } else {
    assistAnalysisEl.innerHTML = `
    <table class="stats-table">
      <thead><tr>
        <th>Takım</th><th>Toplam Asist</th><th>En Çok Asist</th>
      </tr></thead>
      <tbody>${teamAssistRows.map(r => `
        <tr>
          <td><span class="team-badge"><span class="team-dot" style="background:${r.team.color}"></span>${r.team.name}</span></td>
          <td class="points-cell">${r.total}</td>
          <td>${r.topAssistPlayer ? `${r.topAssistPlayer.name} (${r.topAssistCount})` : '—'}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  }
}

// ── FULL RENDER ───────────────────────────
function renderAll() {
  renderStandings();
  const fw = document.getElementById('resultFilter')?.value || 'all';
  renderResults(fw);
  renderFixtures();
  renderTeamsTab();
  renderHeroStats();
  renderStats();
  populateTeamSelects();
  renderAdminTeamsList();
  populateWeekFilter();
}

// ── ADMIN PASSWORD GATE ───────────────────
// Level 1 (fixture only) — default: '1234'
// Level 2 (full admin)   — default: '4321'
// Level 3 (danger zone)  — default: '9999'
const ADMIN_PW_KEY  = 'fl_admin_pw';   // fixture password
const FULL_PW_KEY   = 'fl_full_pw';    // full admin password
const DANGER_PW_KEY = 'fl_danger_pw';  // danger password
function getAdminPw()  { return localStorage.getItem(ADMIN_PW_KEY)  || '1234'; }
function getFullPw()   { return localStorage.getItem(FULL_PW_KEY)   || '1706'; }
function getDangerPw() { return localStorage.getItem(DANGER_PW_KEY) || '3669'; }

let fixtureUnlocked = false; // 1. şifre: sadece fikstür
let adminUnlocked   = false; // 2. şifre: tam yönetim

// Show/hide admin cards based on current unlock level
function applyAdminView() {
  document.querySelectorAll('#tab-admin .admin-card[data-level="full"]').forEach(card => {
    card.style.display = adminUnlocked ? '' : 'none';
  });
  // Show upgrade button only for fixture-level users
  const upgradeBtn = document.getElementById('upgradeAdminBtn');
  if (upgradeBtn) upgradeBtn.style.display = (fixtureUnlocked && !adminUnlocked) ? '' : 'none';
}

// openGate with a single expected pw, calls onSuccess on match
function openGate(expectedPw, onSuccess, title = 'Yönetim Paneli', desc = 'Bu alana erişmek için şifre gereklidir.') {
  const overlay = document.getElementById('gateOverlay');
  const input   = document.getElementById('gateInput');
  overlay.querySelector('.gate-title').textContent = title;
  overlay.querySelector('.gate-desc').textContent  = desc;
  input.value = '';
  input.classList.remove('error');
  overlay.classList.add('open');
  setTimeout(() => input.focus(), 120);

  const tryLogin = () => {
    if (input.value === expectedPw) {
      overlay.classList.remove('open');
      cleanup();
      onSuccess();
    } else {
      input.classList.add('error');
      input.value = '';
      setTimeout(() => input.classList.remove('error'), 600);
      input.focus();
    }
  };
  const cancel  = () => { overlay.classList.remove('open'); cleanup(); };
  const onKey   = e => { if (e.key === 'Enter') tryLogin(); if (e.key === 'Escape') cancel(); };
  const cleanup = () => {
    document.getElementById('gateSubmit').removeEventListener('click', tryLogin);
    input.removeEventListener('keydown', onKey);
    document.getElementById('gateCancel').removeEventListener('click', cancel);
  };

  document.getElementById('gateSubmit').addEventListener('click', tryLogin);
  document.getElementById('gateCancel').addEventListener('click', cancel);
  input.addEventListener('keydown', onKey);
}

// Admin tab gate: accepts EITHER password, unlocks appropriate level
function openAdminGate() {
  const overlay = document.getElementById('gateOverlay');
  const input   = document.getElementById('gateInput');
  overlay.querySelector('.gate-title').textContent = 'Yönetim Paneli';
  overlay.querySelector('.gate-desc').textContent  = 'Fikstür şifresi veya tam yönetim şifresiyle giriş yapın.';
  input.value = '';
  input.classList.remove('error');
  overlay.classList.add('open');
  setTimeout(() => input.focus(), 120);

  const tryLogin = () => {
    const val = input.value;
    if (val === getFullPw()) {
      fixtureUnlocked = true;
      adminUnlocked   = true;
      overlay.classList.remove('open');
      cleanup();
      switchTab('admin');
      applyAdminView();
    } else if (val === getAdminPw()) {
      fixtureUnlocked = true;
      overlay.classList.remove('open');
      cleanup();
      switchTab('admin');
      applyAdminView();
    } else {
      input.classList.add('error');
      input.value = '';
      setTimeout(() => input.classList.remove('error'), 600);
      input.focus();
    }
  };
  const cancel  = () => { overlay.classList.remove('open'); cleanup(); };
  const onKey   = e => { if (e.key === 'Enter') tryLogin(); if (e.key === 'Escape') cancel(); };
  const cleanup = () => {
    document.getElementById('gateSubmit').removeEventListener('click', tryLogin);
    input.removeEventListener('keydown', onKey);
    document.getElementById('gateCancel').removeEventListener('click', cancel);
  };

  document.getElementById('gateSubmit').addEventListener('click', tryLogin);
  document.getElementById('gateCancel').addEventListener('click', cancel);
  input.addEventListener('keydown', onKey);
}

// ── NAV / TABS ────────────────────────────

function initNav() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const tab = link.dataset.tab;
      if (tab === 'admin' && !fixtureUnlocked) {
        openAdminGate();
      } else {
        switchTab(tab);
        if (tab === 'admin') applyAdminView();
      }
      document.getElementById('mainNav').classList.remove('open');
    });
  });
  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('mainNav').classList.toggle('open');
  });
}
function switchTab(tab) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.tab === tab));
  document.querySelectorAll('.tab-section').forEach(s => s.classList.toggle('active', s.id === `tab-${tab}`));
}

// ── TOAST ─────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ── MODAL ─────────────────────────────────
function openMatchModal(resultId) {
  const r       = DB.results.find(x => x.id === resultId);
  if (!r) return;
  const teams   = DB.teams, players = DB.players;
  const findT   = id => teams.find(t => t.id === id) || { name: '?', color: '#666' };
  const findP   = id => players.find(p => p.id === id);
  const h = findT(r.homeId), a = findT(r.awayId);
  const date = r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('tr-TR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' }) : '';

  // Lineups
  const homeLineup = (r.homeLineup || []).map(pid => findP(pid)).filter(Boolean).sort((x,y)=>x.number-y.number);
  const awayLineup = (r.awayLineup || []).map(pid => findP(pid)).filter(Boolean).sort((x,y)=>x.number-y.number);

  const playerRow = p => `
    <div class="modal-player-row">
      <span class="modal-player-num">${p.number}</span>
      <span class="modal-player-name">${p.name}</span>
      <span class="modal-player-pos">${p.position}</span>
    </div>`;

  const lineupSection = (homeLineup.length || awayLineup.length) ? `
    <div class="modal-section">
      <div class="modal-section-title">İlk 11 / Kadro</div>
      <div class="modal-lineups">
        <div>
          <div style="font-size:.8rem;font-weight:700;color:${h.color};margin-bottom:8px;">${h.name}</div>
          <div class="modal-lineup-list">${homeLineup.map(playerRow).join('') || '<span style="color:var(--text-muted);font-size:.82rem">Kadro girilmemiş</span>'}</div>
        </div>
        <div>
          <div style="font-size:.8rem;font-weight:700;color:${a.color};margin-bottom:8px;">${a.name}</div>
          <div class="modal-lineup-list">${awayLineup.map(playerRow).join('') || '<span style="color:var(--text-muted);font-size:.82rem">Kadro girilmemiş</span>'}</div>
        </div>
      </div>
    </div>` : '';

  // Events
  const events = (r.events || []).slice().sort((x,y) => x.minute - y.minute);
  const eventsSection = events.length ? `
    <div class="modal-section">
      <div class="modal-section-title">Maç Olayları</div>
      <div class="modal-events">
        ${events.map(ev => {
          const player  = findP(ev.playerId);
          const assist  = ev.assistId ? findP(ev.assistId) : null;
          const side    = ev.teamSide === 'home' ? h.color : a.color;
          let icon = '⚽', cls = 'goal-pill';
          if (ev.type === 'yellow') { icon = '🟨'; cls = 'yellow-pill'; }
          if (ev.type === 'red')    { icon = '🟥'; cls = 'red-pill'; }
          const assistTxt = assist && ev.type === 'goal' ? `<span style="opacity:.6;font-size:.8rem"> — Asist: ${assist.name}</span>` : '';
          return `
          <div class="modal-event-row">
            <span style="color:${side};font-size:1rem">${icon}</span>
            <span style="font-weight:700;min-width:36px">${ev.minute}'</span>
            <span style="font-weight:600">${player?.name || '?'}</span>${assistTxt}
            <span class="ev-side">${ev.teamSide === 'home' ? h.name.split(' ')[0] : a.name.split(' ')[0]}</span>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  document.getElementById('modalContent').innerHTML = `
    <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:16px;text-transform:uppercase;letter-spacing:.05em">${date} · Hafta ${r.week}</div>
    <div class="modal-match-header">
      <div class="modal-teams">
        <div>
          <div style="width:14px;height:14px;border-radius:50%;background:${h.color};margin-bottom:4px;"></div>
          <div class="modal-team-name">${h.name}</div>
        </div>
        <div class="modal-score">
          <span class="${r.homeScore > r.awayScore ? 'winner-score' : ''}">${r.homeScore}</span>
          <span class="sep">:</span>
          <span class="${r.awayScore > r.homeScore ? 'winner-score' : ''}">${r.awayScore}</span>
        </div>
        <div>
          <div style="width:14px;height:14px;border-radius:50%;background:${a.color};margin-bottom:4px;"></div>
          <div class="modal-team-name">${a.name}</div>
        </div>
      </div>
    </div>
    ${lineupSection}
    ${eventsSection}`;

  document.getElementById('modalOverlay').classList.add('open');
}
window.openMatchModal = openMatchModal;

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// ── LINEUP SELECTS ────────────────────────
function updateLineupSelects() {
  const homeId = document.getElementById('homeTeam').value;
  const awayId = document.getElementById('awayTeam').value;
  const players = DB.players;
  const teams   = DB.teams;

  const buildLineup = (teamId, containerId, titleId, teamName) => {
    const container = document.getElementById(containerId);
    const title     = document.getElementById(titleId);
    if (title) title.textContent = teamName ? `${teamName} — İlk 11` : 'Ev Sahibi İlk 11';
    if (!teamId) { container.innerHTML = '<span style="font-size:.8rem;color:var(--text-muted)">Önce takım seçin.</span>'; return; }
    const tp = players.filter(p => p.teamId === teamId).sort((a,b)=>a.number-b.number);
    if (!tp.length) { container.innerHTML = '<span style="font-size:.8rem;color:var(--text-muted)">Bu takıma oyuncu eklenmemiş.</span>'; return; }
    container.innerHTML = tp.map(p => `
      <label class="lineup-check" id="lc-${containerId}-${p.id}">
        <input type="checkbox" class="lineup-cb" data-side="${containerId}" data-pid="${p.id}"
          onchange="toggleLineupCheck(this)" />
        <span class="lineup-check-num">${p.number}</span>
        <span>${p.name}</span>
        <span style="margin-left:auto;font-size:.7rem;color:var(--text-muted)">${p.position}</span>
      </label>`).join('');
  };

  const hTeam = teams.find(t => t.id === homeId);
  const aTeam = teams.find(t => t.id === awayId);
  buildLineup(homeId, 'homeLineupSelect', 'homeLineupTitle', hTeam?.name);
  buildLineup(awayId, 'awayLineupSelect', 'awayLineupTitle', aTeam?.name);
  updateEventPlayerSelect();
}

window.toggleLineupCheck = function(cb) {
  const label = cb.closest('.lineup-check');
  label.classList.toggle('checked', cb.checked);
  // Validate max 11
  const side  = cb.dataset.side;
  const all   = document.querySelectorAll(`.lineup-cb[data-side="${side}"]`);
  const checked = [...all].filter(x => x.checked);
  if (checked.length > 11) { cb.checked = false; label.classList.remove('checked'); showToast('En fazla 11 oyuncu seçebilirsiniz!'); }
};

// ── EVENT PLAYER SELECT ───────────────────
function updateEventPlayerSelect() {
  const side   = document.getElementById('eventTeamSide').value;
  const homeId = document.getElementById('homeTeam').value;
  const awayId = document.getElementById('awayTeam').value;
  const teamId = side === 'home' ? homeId : awayId;
  const players = DB.players.filter(p => p.teamId === teamId).sort((a,b)=>a.number-b.number);
  const opts   = players.map(p => `<option value="${p.id}">[${p.number}] ${p.name}</option>`).join('');
  const blank  = `<option value="">Oyuncu Seçin</option>`;
  document.getElementById('eventPlayer').innerHTML  = blank + opts;
  const assistBlank = `<option value="">Asist Yok</option>`;
  document.getElementById('eventAssist').innerHTML = assistBlank + opts;
}

// ── EVENTS LIST (in form) ─────────────────
let pendingEvents = [];

function renderPendingEvents() {
  const list = document.getElementById('eventsList');
  if (!pendingEvents.length) { list.innerHTML = ''; return; }
  const players = DB.players;
  list.innerHTML = pendingEvents.map((ev, i) => {
    const player = players.find(p => p.id === ev.playerId);
    const assist = ev.assistId ? players.find(p => p.id === ev.assistId) : null;
    let icon = '⚽';
    if (ev.type === 'yellow') icon = '🟨';
    if (ev.type === 'red')    icon = '🟥';
    const assistTxt = assist ? ` (${assist.name})` : '';
    const side = ev.teamSide === 'home'
      ? (DB.teams.find(t => t.id === document.getElementById('homeTeam').value)?.name || 'Ev')
      : (DB.teams.find(t => t.id === document.getElementById('awayTeam').value)?.name || 'Dep.');
    return `
    <div class="event-item">
      <span>${icon}</span>
      <span style="font-weight:700">${ev.minute}'</span>
      <span>${player?.name || '?'}${assistTxt}</span>
      <span style="font-size:.72rem;color:var(--text-muted)">${side}</span>
      <span class="ev-remove" onclick="removeEvent(${i})">✕</span>
    </div>`;
  }).join('');
}
window.removeEvent = function(i) { pendingEvents.splice(i, 1); renderPendingEvents(); };

// ── CRUD ──────────────────────────────────
function deleteTeam(id) {
  if (!confirm('Bu takımı silmek istediğinizden emin misiniz?')) return;
  DB.saveTeams(DB.teams.filter(t => t.id !== id));
  DB.savePlayers(DB.players.filter(p => p.teamId !== id));
  DB.saveResults(DB.results.filter(r => r.homeId !== id && r.awayId !== id));
  DB.saveFixtures(DB.fixtures.filter(f => f.homeId !== id && f.awayId !== id));
  renderAll(); showToast('Takım silindi.');
}
window.deleteTeam = deleteTeam;

function deletePlayer(id) {
  DB.savePlayers(DB.players.filter(p => p.id !== id));
  renderAll(); showToast('Oyuncu silindi.');
}
window.deletePlayer = deletePlayer;

// ── FORMS ─────────────────────────────────
function initForms() {

  // Upgrade button (fixture → full admin)
  document.getElementById('upgradeAdminBtn').addEventListener('click', () => {
    openGate(
      getFullPw(),
      () => { adminUnlocked = true; applyAdminView(); showToast('✅ Tam yönetim erişimi açıldı!'); },
      '🔓 Tam Yönetim',
      'Tam yönetim şifresini girin.'
    );
  });

  // Add team
  document.getElementById('addTeamForm').addEventListener('submit', e => {
    e.preventDefault();
    const name  = document.getElementById('teamName').value.trim();
    const color = document.getElementById('teamColor').value;
    if (!name) return;
    if (DB.teams.find(t => t.name.toLowerCase() === name.toLowerCase())) { showToast('Bu isimde takım zaten var!'); return; }
    const teams = DB.teams;
    teams.push({ id: Date.now().toString(), name, color });
    DB.saveTeams(teams);
    e.target.reset(); document.getElementById('teamColor').value = '#3b82f6';
    renderAll(); showToast(`✅ ${name} eklendi!`);
  });

  // Add player
  document.getElementById('addPlayerForm').addEventListener('submit', e => {
    e.preventDefault();
    const teamId   = document.getElementById('playerTeam').value;
    const number   = parseInt(document.getElementById('playerNumber').value);
    const name     = document.getElementById('playerName').value.trim();
    const position = document.getElementById('playerPos').value;
    if (!teamId || !name || !position) { showToast('Tüm alanları doldurun!'); return; }
    const players = DB.players;
    // Check duplicate number in same team
    if (players.find(p => p.teamId === teamId && p.number === number)) { showToast('Bu numara bu takımda zaten var!'); return; }
    players.push({ id: Date.now().toString(), teamId, number, name, position });
    DB.savePlayers(players);
    e.target.reset();
    renderAll(); showToast(`✅ ${name} eklendi!`);
  });

  // Team selects → update lineups
  document.getElementById('homeTeam').addEventListener('change', updateLineupSelects);
  document.getElementById('awayTeam').addEventListener('change', updateLineupSelects);
  document.getElementById('eventTeamSide').addEventListener('change', updateEventPlayerSelect);

  // Event type → show/hide assist
  document.getElementById('eventType').addEventListener('change', () => {
    const isGoal = document.getElementById('eventType').value === 'goal';
    document.getElementById('assistRow').style.display = isGoal ? 'contents' : 'none';
  });

  // Add event
  document.getElementById('addEventBtn').addEventListener('click', () => {
    const type     = document.getElementById('eventType').value;
    const minute   = parseInt(document.getElementById('eventMinute').value);
    const teamSide = document.getElementById('eventTeamSide').value;
    const playerId = document.getElementById('eventPlayer').value;
    const assistId = type === 'goal' ? (document.getElementById('eventAssist').value || null) : null;
    if (!playerId || isNaN(minute)) { showToast('Olay için oyuncu ve dakika gerekli!'); return; }
    pendingEvents.push({ type, minute, teamSide, playerId, assistId });
    pendingEvents.sort((a,b) => a.minute - b.minute);
    document.getElementById('eventMinute').value = '';
    renderPendingEvents();
  });

  // Add result
  document.getElementById('addResultForm').addEventListener('submit', e => {
    e.preventDefault();
    const homeId    = document.getElementById('homeTeam').value;
    const awayId    = document.getElementById('awayTeam').value;
    const homeScore = parseInt(document.getElementById('homeScore').value);
    const awayScore = parseInt(document.getElementById('awayScore').value);
    const week      = parseInt(document.getElementById('matchWeek').value);
    const date      = document.getElementById('matchDate').value;
    if (!homeId || !awayId) { showToast('Takımları seçin!'); return; }
    if (homeId === awayId)  { showToast('Aynı takımı seçemezsiniz!'); return; }

    // Collect lineups
    const homeLineup = [...document.querySelectorAll('.lineup-cb[data-side="homeLineupSelect"]:checked')].map(cb => cb.dataset.pid);
    const awayLineup = [...document.querySelectorAll('.lineup-cb[data-side="awayLineupSelect"]:checked')].map(cb => cb.dataset.pid);

    const results = DB.results;
    results.push({ id: Date.now().toString(), homeId, awayId, homeScore, awayScore, week, date, homeLineup, awayLineup, events: [...pendingEvents] });
    DB.saveResults(results);
    pendingEvents = [];
    e.target.reset();
    document.getElementById('matchWeek').value = week;
    document.getElementById('homeLineupSelect').innerHTML = '';
    document.getElementById('awayLineupSelect').innerHTML = '';
    document.getElementById('eventsList').innerHTML = '';
    renderAll();
    const teams = DB.teams;
    const hn = teams.find(t => t.id === homeId)?.name || '';
    const an = teams.find(t => t.id === awayId)?.name || '';
    showToast(`✅ ${hn} ${homeScore}–${awayScore} ${an} kaydedildi!`);
  });

  // Add fixture
  document.getElementById('addFixtureForm').addEventListener('submit', e => {
    e.preventDefault();
    const homeId = document.getElementById('fixtureHome').value;
    const awayId = document.getElementById('fixtureAway').value;
    const week   = parseInt(document.getElementById('fixtureWeek').value);
    const date   = document.getElementById('fixtureDate').value;
    const time   = document.getElementById('fixtureTime').value;
    const venue  = document.getElementById('fixtureVenue').value.trim();
    if (!homeId || !awayId) { showToast('Takımları seçin!'); return; }
    if (homeId === awayId)  { showToast('Aynı takımı seçemezsiniz!'); return; }
    const fixtures = DB.fixtures;
    fixtures.push({ id: Date.now().toString(), homeId, awayId, week, date, time, venue });
    DB.saveFixtures(fixtures);
    e.target.reset();
    document.getElementById('fixtureWeek').value = week;
    document.getElementById('fixtureTime').value = '14:00';
    renderAll(); showToast('✅ Fikstür eklendi!');
  });

  // Result filter
  document.getElementById('resultFilter').addEventListener('change', e => renderResults(e.target.value));

  // Danger zone — separate password
  document.getElementById('clearResultsBtn').addEventListener('click', () => {
    openGate(
      getDangerPw(),
      () => { DB.saveResults([]); renderAll(); showToast('Tüm sonuçlar silindi.'); },
      '⚠️ Tehlikeli Bölge',
      'Tüm maç sonuçları silinecek. Bu işlem geri alınamaz.'
    );
  });
  document.getElementById('clearAllBtn').addEventListener('click', () => {
    openGate(
      getDangerPw(),
      () => {
        ['fl_teams','fl_players','fl_results','fl_fixtures'].forEach(k => localStorage.removeItem(k));
        renderAll(); showToast('Tüm veriler sıfırlandı.');
      },
      '⚠️ Tehlikeli Bölge',
      'Tüm takımlar, oyuncular ve maçlar silinecek. Bu işlem geri alınamaz!'
    );
  });
}

// ── MODAL EVENTS ──────────────────────────
function initModal() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === document.getElementById('modalOverlay')) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

// ── FIREBASE INIT & SEED ───────────────────
function initFirebase() {
  firebase.initializeApp(FIREBASE_CONFIG);
  let firstLoad = true;

  firebase.database().ref('/').on('value', snap => {
    const v = snap.val() || {};
    CACHE.teams    = v.fl_teams    ? Object.values(v.fl_teams)    : [];
    CACHE.players  = v.fl_players  ? Object.values(v.fl_players)  : [];
    CACHE.results  = v.fl_results  ? Object.values(v.fl_results)  : [];
    CACHE.fixtures = v.fl_fixtures ? Object.values(v.fl_fixtures) : [];

    if (firstLoad) {
      firstLoad = false;
      if (!CACHE.teams.length) seedFirebase();
      const overlay = document.getElementById('loadingOverlay');
      if (overlay) overlay.style.display = 'none';
    }

    renderAll();
  });
}

function seedFirebase() {
  const teams = [
    { id:'t1',  name:'9A',  color:'#4f7cff' },
    { id:'t2',  name:'9B',  color:'#f5c542' },
    { id:'t3',  name:'9C',  color:'#22c55e' },
    { id:'t4',  name:'9D',  color:'#ef4444' },
    { id:'t5',  name:'10A', color:'#a855f7' },
    { id:'t6',  name:'10B', color:'#f97316' },
    { id:'t7',  name:'10C', color:'#06b6d4' },
    { id:'t8',  name:'10D', color:'#ec4899' },
    { id:'t9',  name:'11A', color:'#84cc16' },
    { id:'t10', name:'11B', color:'#f59e0b' },
    { id:'t11', name:'11C', color:'#14b8a6' },
    { id:'t12', name:'11D', color:'#6366f1' },
  ];
  DB.saveTeams(teams);
}

// ── INIT ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initForms();
  initModal();
  renderWeather();
  initFirebase(); // Firebase'e bağlan, veriyi yükle ve renderAll() çağır
});
