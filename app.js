/* ============================================================
   TNAAT DYNASTY — powered live by the Sleeper API
   Only thing you should ever need to change is the line below.
   ============================================================ */
const LEAGUE_ID = "1315463764962721792";
const API = "https://api.sleeper.app/v1";

const state = {
  chain: null,
  games: null,
  standings: null,      // current-season standings, ranked
  lastPlaceOwner: null, // owner_id sitting in last place right now
  ownerDirectory: null, // owner_id -> {name, team, avatar}
  players: null,        // Sleeper's NFL player dictionary, loaded lazily
  loaded: {}            // tracks which lazy tabs have already fetched their data
};

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sleeper API error on ${url}: ${res.status}`);
  return res.json();
}

/* ---------- tabs ---------- */
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.target));
});
function switchTab(target) {
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.target === target));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === target));
  if (target === "teams") loadPlayersIfNeeded();
  if (target === "thisweek" && !state.loaded.thisweek) { state.loaded.thisweek = true; renderThisWeek(); }
  if (target === "propbets" && !state.loaded.propbets) { state.loaded.propbets = true; renderPropBets(); }
  if (target === "power" && !state.loaded.power) { state.loaded.power = true; renderPowerRankings(); }
  if (target === "trades" && !state.loaded.trades) { state.loaded.trades = true; renderTradeFeed(); }
  if (target === "awards" && !state.loaded.awards) { state.loaded.awards = true; renderAwards(); }
  if (target === "playoffs" && !state.loaded.playoffs) { state.loaded.playoffs = true; renderPlayoffPicture(); }
  if (target === "waivers" && !state.loaded.waivers) { state.loaded.waivers = true; renderWaiverFeed(); }
}

/* ---------- click any team name, anywhere on the site, to open its page ---------- */
function teamLink(ownerId, label) {
  return `<a href="#" class="team-link" data-owner="${ownerId}">${label}</a>`;
}
document.addEventListener("click", e => {
  const link = e.target.closest(".team-link");
  if (!link) return;
  e.preventDefault();
  document.getElementById("record-modal")?.classList.add("hidden");
  switchTab("teams");
  openTeamDetail(link.dataset.owner);
});

/* ============================================================
   League + matchup history (unchanged core: walks previous_league_id)
   ============================================================ */
async function loadLeagueChain(startId) {
  const chain = [];
  let currentId = startId;
  while (currentId && currentId !== "0") {
    const league = await getJSON(`${API}/league/${currentId}`);
    const [users, rosters] = await Promise.all([
      getJSON(`${API}/league/${currentId}/users`),
      getJSON(`${API}/league/${currentId}/rosters`)
    ]);
    chain.push({ league, users, rosters });
    currentId = league.previous_league_id;
  }
  return chain;
}

function ownerKey(season, rosterId) {
  const roster = season.rosters.find(r => r.roster_id === rosterId);
  return roster ? roster.owner_id : `unknown-${rosterId}`;
}
function ownerNameInSeason(season, rosterId) {
  const roster = season.rosters.find(r => r.roster_id === rosterId);
  if (!roster) return "Unknown";
  const user = season.users.find(u => u.user_id === roster.owner_id);
  return user ? (user.metadata?.team_name || user.display_name) : "Unknown Manager";
}

async function loadAllMatchups(chain) {
  const games = [];
  for (const season of chain) {
    const weekPromises = [];
    for (let wk = 1; wk <= 18; wk++) {
      weekPromises.push(
        getJSON(`${API}/league/${season.league.league_id}/matchups/${wk}`)
          .then(data => ({ wk, data }))
          .catch(() => ({ wk, data: [] }))
      );
    }
    const weeks = await Promise.all(weekPromises);
    for (const { wk, data } of weeks) {
      if (!data || data.length === 0) continue;
      const byMatchup = {};
      data.forEach(entry => {
        if (entry.matchup_id == null) return;
        (byMatchup[entry.matchup_id] ||= []).push(entry);
      });
      Object.values(byMatchup).forEach(pair => {
        if (pair.length !== 2) return;
        const [a, b] = pair;
        games.push({
          season: season.league.season,
          week: wk,
          ownerA: ownerKey(season, a.roster_id),
          ownerB: ownerKey(season, b.roster_id),
          nameA: ownerNameInSeason(season, a.roster_id),
          nameB: ownerNameInSeason(season, b.roster_id),
          ptsA: a.points || 0,
          ptsB: b.points || 0
        });
      });
    }
  }
  return games;
}

/* ---------- build a directory of every manager ever seen ---------- */
function buildOwnerDirectory(chain) {
  const dir = {};
  // walk oldest -> newest so the most recent season's info wins
  [...chain].reverse().forEach(season => {
    season.rosters.forEach(r => {
      const user = season.users.find(u => u.user_id === r.owner_id);
      dir[r.owner_id] = {
        name: user ? user.display_name : "Unknown Manager",
        team: user?.metadata?.team_name || user?.display_name || "Unnamed Team",
        avatar: user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null
      };
    });
  });
  return dir;
}

/* ============================================================
   Current standings (also used to find the last-place team)
   ============================================================ */
function computeStandings(chain) {
  const current = chain[0];
  const rows = current.rosters.map(r => {
    const user = current.users.find(u => u.user_id === r.owner_id);
    return {
      ownerId: r.owner_id,
      manager: user ? user.display_name : "Unknown",
      team: user?.metadata?.team_name || "—",
      wins: r.settings?.wins ?? 0,
      losses: r.settings?.losses ?? 0,
      ties: r.settings?.ties ?? 0,
      pf: (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100,
      pa: (r.settings?.fpts_against ?? 0) + (r.settings?.fpts_against_decimal ?? 0) / 100
    };
  }).sort((a, b) => b.wins - a.wins || b.pf - a.pf);
  return rows;
}

function renderHero(chain, games) {
  const allOwners = new Set();
  chain.forEach(s => s.rosters.forEach(r => allOwners.add(r.owner_id)));
  document.getElementById("stat-seasons").textContent = chain.length;
  document.getElementById("stat-managers").textContent = allOwners.size;
  document.getElementById("stat-games").textContent = games.length;
  const oldestSeason = chain[chain.length - 1]?.league.season;
  if (oldestSeason) document.getElementById("hero-founded").textContent = oldestSeason;
}

async function renderHeroDates(chain) {
  const el = document.getElementById("hero-dates");
  try {
    const nflState = await getJSON(`${API}/state/nfl`);
    state.nflState = nflState;
    const settings = chain[0].league.settings || {};
    const parts = [`Week ${nflState.week}`];
    if (settings.trade_deadline) parts.push(`Trade deadline: Week ${settings.trade_deadline}`);
    if (settings.playoff_week_start) parts.push(`Playoffs start: Week ${settings.playoff_week_start}`);
    el.textContent = parts.join("  ·  ");
  } catch (e) {
    el.textContent = "";
  }
}

function renderStandings(chain, rows) {
  document.getElementById("standings-season").textContent = chain[0].league.season;

  // Tank Meter: blends win % (60%) with scoring strength relative to the
  // rest of the league this season (40%), so a team that's losing close,
  // high-scoring games doesn't get lumped in with a true tank job.
  const pfValues = rows.map(r => r.pf);
  const minPF = Math.min(...pfValues), maxPF = Math.max(...pfValues);
  const pfRange = maxPF - minPF || 1;

  const scored = rows.map(r => {
    const games = r.wins + r.losses + r.ties;
    const winPct = games ? (r.wins + r.ties * 0.5) / games : 0;
    const pfNorm = (r.pf - minPF) / pfRange;
    const score = Math.round((winPct * 0.6 + pfNorm * 0.4) * 100);
    return { ...r, tankScore: score };
  });

  document.getElementById("standings-body").innerHTML = scored.map((r, i) => {
    const label = r.tankScore >= 65 ? "Contender" : r.tankScore >= 35 ? "Bubble" : "Tanking";
    const meterClass = r.tankScore >= 65 ? "contender" : r.tankScore >= 35 ? "bubble" : "tanking";
    return `
    <tr>
      <td>${i + 1}</td>
      <td>${teamLink(r.ownerId, r.manager)}</td>
      <td>${teamLink(r.ownerId, r.team)}</td>
      <td class="num">${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""}</td>
      <td class="num">${r.pf.toFixed(1)}</td>
      <td class="num">${r.pa.toFixed(1)}</td>
      <td>
        <div class="tank-meter">
          <div class="tank-track"><div class="tank-fill ${meterClass}" style="width:${r.tankScore}%"></div></div>
          <span class="tank-label ${meterClass}">${label}</span>
        </div>
      </td>
    </tr>`;
  }).join("");
}

/* ============================================================
   Head-to-head picker
   ============================================================ */
function setupH2HPicker(games, ownerDirectory) {
  const owners = Object.keys(ownerDirectory).sort((a, b) =>
    ownerDirectory[a].name.localeCompare(ownerDirectory[b].name)
  );
  const optionHTML = owners.map(id => `<option value="${id}">${ownerDirectory[id].name}</option>`).join("");
  const selA = document.getElementById("h2h-team-a");
  const selB = document.getElementById("h2h-team-b");
  selA.innerHTML = optionHTML;
  selB.innerHTML = optionHTML;
  if (owners.length > 1) selB.selectedIndex = 1;

  document.getElementById("h2h-compare").addEventListener("click", () => {
    renderH2HResult(games, ownerDirectory, selA.value, selB.value);
  });
  // auto-run once so the panel isn't empty on first visit
  renderH2HResult(games, ownerDirectory, selA.value, selB.value);
}

function renderH2HResult(games, ownerDirectory, idA, idB) {
  const box = document.getElementById("h2h-result");
  if (idA === idB) {
    box.innerHTML = `<p class="section-note">Pick two different managers.</p>`;
    return;
  }
  const meetings = games.filter(g =>
    (g.ownerA === idA && g.ownerB === idB) || (g.ownerA === idB && g.ownerB === idA)
  ).sort((a, b) => a.season - b.season || a.week - b.week);

  if (meetings.length === 0) {
    box.innerHTML = `<p class="section-note">${ownerDirectory[idA].name} and ${ownerDirectory[idB].name} haven't played each other yet.</p>`;
    return;
  }

  let winsA = 0, winsB = 0, ptsA = 0, ptsB = 0;
  const rows = meetings.map(g => {
    const [scoreA, scoreB] = g.ownerA === idA ? [g.ptsA, g.ptsB] : [g.ptsB, g.ptsA];
    ptsA += scoreA; ptsB += scoreB;
    if (scoreA > scoreB) winsA++; else if (scoreB > scoreA) winsB++;
    return `<tr>
      <td>${g.season}, Wk ${g.week}</td>
      <td class="num">${scoreA.toFixed(1)}</td>
      <td class="num">${scoreB.toFixed(1)}</td>
      <td>${scoreA > scoreB ? ownerDirectory[idA].name : scoreB > scoreA ? ownerDirectory[idB].name : "Tie"}</td>
    </tr>`;
  }).join("");

  box.innerHTML = `
    <div class="h2h-summary">
      <div><span class="num">${winsA}-${winsB}</span><span class="lbl">${ownerDirectory[idA].name}'s record</span></div>
      <div><span class="num">${(ptsA / meetings.length).toFixed(1)}</span><span class="lbl">${ownerDirectory[idA].name} avg pts</span></div>
      <div><span class="num">${(ptsB / meetings.length).toFixed(1)}</span><span class="lbl">${ownerDirectory[idB].name} avg pts</span></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Meeting</th><th>${teamLink(idA, ownerDirectory[idA].name)}</th><th>${teamLink(idB, ownerDirectory[idB].name)}</th><th>Winner</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ============================================================
   Record book — 6 records + all-time power rankings
   ============================================================ */
function renderRecords(chain, games, ownerDirectory) {
  // every team-game performance, for the "most points in a game" leaderboard
  const allGamePoints = [];
  const allShootouts = [];
  games.forEach(g => {
    allGamePoints.push({ value: g.ptsA, who: teamLink(g.ownerA, g.nameA), meta: `${g.season}, Week ${g.week}` });
    allGamePoints.push({ value: g.ptsB, who: teamLink(g.ownerB, g.nameB), meta: `${g.season}, Week ${g.week}` });
    allShootouts.push({ value: g.ptsA + g.ptsB, who: `${teamLink(g.ownerA, g.nameA)} vs ${teamLink(g.ownerB, g.nameB)}`, meta: `${g.season}, Week ${g.week}` });
  });
  allGamePoints.sort((a, b) => b.value - a.value);
  allShootouts.sort((a, b) => b.value - a.value);

  // every team-season total, for the "best season" leaderboard
  const allSeasonPF = [];
  chain.forEach(s => {
    s.rosters.forEach(r => {
      const user = s.users.find(u => u.user_id === r.owner_id);
      const pf = (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100;
      allSeasonPF.push({ value: pf, who: teamLink(r.owner_id, user?.display_name || "Unknown"), meta: s.league.season });
    });
  });
  allSeasonPF.sort((a, b) => b.value - a.value);

  // longest win streak per owner (best streak each manager has ever put together)
  const sorted = [...games].sort((a, b) => a.season - b.season || a.week - b.week);
  const current = {}; const longest = {};
  sorted.forEach(g => {
    const winner = g.ptsA > g.ptsB ? g.ownerA : (g.ptsB > g.ptsA ? g.ownerB : null);
    if (winner) {
      current[winner] = (current[winner] || 0) + 1;
      if (current[winner] > (longest[winner]?.count || 0)) longest[winner] = { count: current[winner] };
      Object.keys(current).forEach(k => { if (k !== winner) current[k] = 0; });
    } else {
      Object.keys(current).forEach(k => current[k] = 0);
    }
  });
  const allStreaks = Object.entries(longest)
    .map(([ownerId, v]) => ({ value: v.count, who: teamLink(ownerId, ownerDirectory[ownerId]?.name || "Unknown"), meta: "consecutive wins" }))
    .sort((a, b) => b.value - a.value);

  // longest losing streak per owner (mirror of the above, for bragging rights the other way)
  const currentL = {}; const longestL = {};
  sorted.forEach(g => {
    const loser = g.ptsA > g.ptsB ? g.ownerB : (g.ptsB > g.ptsA ? g.ownerA : null);
    if (loser) {
      currentL[loser] = (currentL[loser] || 0) + 1;
      if (currentL[loser] > (longestL[loser]?.count || 0)) longestL[loser] = { count: currentL[loser] };
      Object.keys(currentL).forEach(k => { if (k !== loser) currentL[k] = 0; });
    } else {
      Object.keys(currentL).forEach(k => currentL[k] = 0);
    }
  });
  const allLossStreaks = Object.entries(longestL)
    .map(([ownerId, v]) => ({ value: v.count, who: teamLink(ownerId, ownerDirectory[ownerId]?.name || "Unknown"), meta: "consecutive losses" }))
    .sort((a, b) => b.value - a.value);

  // career points-per-game average, all-time
  const ptsTotal = {};
  games.forEach(g => {
    ptsTotal[g.ownerA] = (ptsTotal[g.ownerA] || 0) + g.ptsA;
    ptsTotal[g.ownerB] = (ptsTotal[g.ownerB] || 0) + g.ptsB;
  });

  // all-time wins per owner
  const winCounts = {};
  const gameCounts = {};
  games.forEach(g => {
    gameCounts[g.ownerA] = (gameCounts[g.ownerA] || 0) + 1;
    gameCounts[g.ownerB] = (gameCounts[g.ownerB] || 0) + 1;
    const winner = g.ptsA > g.ptsB ? g.ownerA : (g.ptsB > g.ptsA ? g.ownerB : null);
    if (winner) winCounts[winner] = (winCounts[winner] || 0) + 1;
  });
  const allWins = Object.entries(winCounts)
    .map(([ownerId, count]) => ({ value: count, who: teamLink(ownerId, ownerDirectory[ownerId]?.name || "Unknown"), meta: "regular + postseason" }))
    .sort((a, b) => b.value - a.value);

  const allCareerPPG = Object.entries(ptsTotal)
    .map(([ownerId, total]) => ({
      value: gameCounts[ownerId] ? total / gameCounts[ownerId] : 0,
      who: teamLink(ownerId, ownerDirectory[ownerId]?.name || "Unknown"),
      meta: `${gameCounts[ownerId] || 0} games played`
    }))
    .sort((a, b) => b.value - a.value);

  // stash full leaderboards for the click-through modal
  state.leaderboards = {
    pointsGame: { title: "Most Points, Single Game", rows: allGamePoints, format: v => v.toFixed(1) },
    shootout: { title: "Highest-Scoring Shootouts", rows: allShootouts, format: v => v.toFixed(1) },
    bestSeason: { title: "Best Single Seasons (PF)", rows: allSeasonPF, format: v => v.toFixed(1) },
    streak: { title: "Longest Win Streaks", rows: allStreaks, format: v => v },
    lossStreak: { title: "Longest Losing Streaks", rows: allLossStreaks, format: v => v },
    ppg: { title: "Career Points Per Game", rows: allCareerPPG, format: v => v.toFixed(1) },
    wins: { title: "Most All-Time Wins", rows: allWins, format: v => v },
    champs: { title: "Most Championships", rows: [], format: v => v } // filled in once bracket data resolves
  };

  const cards = [
    { key: "pointsGame", icon: "🔥", label: "Most Points, Single Game", value: allGamePoints[0]?.value.toFixed(1), who: allGamePoints[0]?.who, meta: allGamePoints[0]?.meta, featured: true },
    { key: "champs", icon: "🏆", label: "Most Championships", value: "—", who: "—", meta: "loading…", id: "champ-record-card" },
    { key: "shootout", icon: "💥", label: "Highest-Scoring Shootout", value: allShootouts[0]?.value.toFixed(1), who: allShootouts[0]?.who, meta: allShootouts[0]?.meta },
    { key: "bestSeason", icon: "📈", label: "Best Single Season (PF)", value: allSeasonPF[0]?.value.toFixed(1), who: allSeasonPF[0]?.who, meta: allSeasonPF[0]?.meta },
    { key: "streak", icon: "🎯", label: "Longest Win Streak", value: allStreaks[0]?.value, who: allStreaks[0]?.who, meta: allStreaks[0]?.meta },
    { key: "lossStreak", icon: "💀", label: "Longest Losing Streak", value: allLossStreaks[0]?.value, who: allLossStreaks[0]?.who, meta: allLossStreaks[0]?.meta },
    { key: "wins", icon: "⚔️", label: "Most All-Time Wins", value: allWins[0]?.value, who: allWins[0]?.who, meta: allWins[0]?.meta },
    { key: "ppg", icon: "📊", label: "Career Points Per Game", value: allCareerPPG[0]?.value.toFixed(1), who: allCareerPPG[0]?.who, meta: allCareerPPG[0]?.meta }
  ];

  document.getElementById("record-grid").innerHTML = cards.map(c => `
    <button class="record-card ${c.featured ? "featured" : ""}" data-key="${c.key}" ${c.id ? `id="${c.id}"` : ""}>
      <p class="icon">${c.icon}</p>
      <p class="label">${c.label}</p>
      <p class="value">${c.value ?? "–"}</p>
      <p class="who">${c.who ?? "—"}</p>
      <p class="meta">${c.meta ?? ""}</p>
    </button>
  `).join("");

  document.querySelectorAll(".record-card").forEach(card => {
    card.addEventListener("click", e => {
      if (e.target.closest(".team-link")) return; // let the global team-link handler take over
      openRecordModal(card.dataset.key);
    });
  });

  // championships, from each season's winners bracket final
  renderChampionshipRecord(chain, ownerDirectory);

  // all-time power rankings, by win percentage
  const allOwnerIds = Object.keys(ownerDirectory);
  const rankings = allOwnerIds.map(id => {
    const w = winCounts[id] || 0;
    const total = gameCounts[id] || 0;
    return { id, name: ownerDirectory[id].name, wins: w, losses: total - w, pct: total ? w / total : 0 };
  }).sort((a, b) => b.pct - a.pct || b.wins - a.wins);

  document.getElementById("rankings-list").innerHTML = rankings.map((r, i) => `
    <li>
      <span class="rank">${i + 1}</span>
      ${teamLink(r.id, r.name)}
      <span class="rec">${r.wins}-${r.losses}</span>
      <span class="pct">${(r.pct * 100).toFixed(0)}%</span>
    </li>
  `).join("");
}

async function renderChampionshipRecord(chain, ownerDirectory) {
  const counts = {};
  await Promise.all(chain.map(async season => {
    try {
      const bracket = await getJSON(`${API}/league/${season.league.league_id}/winners_bracket`);
      const final = bracket.find(m => m.p === 1);
      if (final && final.w) {
        const ownerId = ownerKey(season, final.w);
        counts[ownerId] = (counts[ownerId] || 0) + 1;
      }
    } catch (e) { /* season likely still in progress */ }
  }));
  const ranked = Object.entries(counts)
    .map(([ownerId, count]) => ({ value: count, who: teamLink(ownerId, ownerDirectory[ownerId]?.name || "Unknown"), meta: count === 1 ? "title" : "titles" }))
    .sort((a, b) => b.value - a.value);
  if (state.leaderboards) state.leaderboards.champs.rows = ranked;

  const card = document.getElementById("champ-record-card");
  if (!card) return;
  if (ranked[0]) {
    card.querySelector(".value").textContent = ranked[0].value;
    card.querySelector(".who").innerHTML = ranked[0].who;
    card.querySelector(".meta").textContent = ranked[0].meta;
  } else {
    card.querySelector(".value").textContent = "–";
    card.querySelector(".meta").textContent = "no champion recorded yet";
  }
}

/* ---------- record leaderboard modal (top 12) ---------- */
function openRecordModal(key) {
  const board = state.leaderboards?.[key];
  if (!board) return;
  document.getElementById("modal-title").textContent = board.title;
  const top12 = board.rows.slice(0, 12);
  document.getElementById("modal-list").innerHTML = top12.length
    ? top12.map((r, i) => `
        <li>
          <span class="rank">${i + 1}</span>
          <span>${r.who}</span>
          <span class="rec">${r.meta}</span>
          <span class="pct">${board.format(r.value)}</span>
        </li>`).join("")
    : `<li class="loading">No data yet for this record.</li>`;
  document.getElementById("record-modal").classList.remove("hidden");
}
function closeRecordModal() {
  document.getElementById("record-modal").classList.add("hidden");
}
document.getElementById("modal-close").addEventListener("click", closeRecordModal);
document.getElementById("record-modal").addEventListener("click", e => {
  if (e.target.id === "record-modal") closeRecordModal();
});

/* ============================================================
   Season-by-season history
   ============================================================ */
async function renderHistory(chain) {
  const items = await Promise.all(chain.map(async season => {
    let champ = null, runnerUp = null;
    try {
      const bracket = await getJSON(`${API}/league/${season.league.league_id}/winners_bracket`);
      const final = bracket.find(m => m.p === 1);
      if (final && final.w) {
        champ = ownerNameInSeason(season, final.w);
        runnerUp = final.l ? ownerNameInSeason(season, final.l) : null;
      }
    } catch (e) { /* in progress */ }
    return { year: season.league.season, champ, runnerUp, status: season.league.status };
  }));

  document.getElementById("timeline").innerHTML = items.map(i => `
    <li>
      <p class="season-year">${i.year}</p>
      ${i.champ
        ? `<p class="champ">🏆 ${i.champ}</p>${i.runnerUp ? `<p class="runnerup">def. ${i.runnerUp}</p>` : ""}`
        : `<p class="runnerup">${i.status === "in_season" ? "Season in progress" : "No champion recorded"}</p>`}
    </li>
  `).join("");
}

/* ============================================================
   Teams grid + roster detail (with acquisition history) +
   the last-place poop easter egg
   ============================================================ */
function renderTeamsGrid(standings, ownerDirectory, chain) {
  // standings gives current ranking for owners active this season;
  // append any historical-only owners at the end, unranked.
  const rankedIds = standings.map(r => r.ownerId);
  const allIds = Object.keys(ownerDirectory);
  const unranked = allIds.filter(id => !rankedIds.includes(id));
  state.lastPlaceOwner = rankedIds[rankedIds.length - 1] || null;

  const cardsHTML = [...rankedIds, ...unranked].map((id, i) => {
    const o = ownerDirectory[id];
    const rankLabel = i < rankedIds.length ? `#${i + 1} this season` : "past manager";
    return `
      <button class="team-card" data-owner="${id}">
        ${o.avatar ? `<img class="avatar" src="${o.avatar}" alt="">` : `<div class="avatar"></div>`}
        <p class="tname">${o.team}</p>
        <p class="mname">${o.name}</p>
        <p class="rank-badge">${rankLabel}</p>
      </button>`;
  }).join("");

  document.getElementById("team-grid").innerHTML = cardsHTML;
  document.querySelectorAll(".team-card").forEach(card => {
    card.addEventListener("click", () => openTeamDetail(card.dataset.owner));
  });
}

async function loadPlayersIfNeeded() {
  if (state.players) return;
  document.querySelectorAll("#roster-body .loading").forEach(el => el.textContent = "Loading NFL player database (one-time, ~10 seconds)…");
  try {
    state.players = await getJSON(`${API}/players/nfl`);
  } catch (e) {
    state.players = {};
  }
}

async function openTeamDetail(ownerId) {
  const o = state.ownerDirectory[ownerId];
  document.getElementById("teams-grid-view").classList.add("hidden");
  document.getElementById("team-detail-view").classList.remove("hidden");
  document.getElementById("team-detail-name").textContent = o.team;
  document.getElementById("team-detail-meta").textContent = `Managed by ${o.name}`;
  document.getElementById("roster-body").innerHTML = `<tr><td colspan="4" class="loading">Loading roster…</td></tr>`;
  renderRivalryBadges(ownerId);

  // the poop easter egg — only for whoever is currently in last place
  if (ownerId === state.lastPlaceOwner) {
    const overlay = document.getElementById("poop-overlay");
    overlay.classList.add("show");
    setTimeout(() => overlay.classList.remove("show"), 1000);
  }

  await loadPlayersIfNeeded();
  await renderRoster(ownerId);
}

document.getElementById("team-back").addEventListener("click", () => {
  document.getElementById("team-detail-view").classList.add("hidden");
  document.getElementById("teams-grid-view").classList.remove("hidden");
});

async function renderRoster(ownerId) {
  const current = state.chain[0];
  const roster = current.rosters.find(r => r.owner_id === ownerId);
  if (!roster || !roster.players || roster.players.length === 0) {
    document.getElementById("roster-body").innerHTML = `<tr><td colspan="4" class="loading">No active roster found for this manager this season.</td></tr>`;
    return;
  }

  // draft picks for this season, so we can label "Drafted" for anyone
  // not found in the transaction log
  let draftedMap = {};
  try {
    const drafts = await getJSON(`${API}/league/${current.league.league_id}/drafts`);
    if (drafts[0]) {
      const picks = await getJSON(`${API}/draft/${drafts[0].draft_id}/picks`);
      picks.forEach(p => {
        draftedMap[p.player_id] = `Drafted — Rd ${p.round}, Pick ${p.pick_no}`;
      });
    }
  } catch (e) { /* no draft data available */ }

  // transactions across the season, most recent first, to find how each
  // rostered player actually arrived on THIS roster
  let acquiredMap = {};
  try {
    const weekTx = await Promise.all(
      Array.from({ length: 18 }, (_, i) => i + 1).map(wk =>
        getJSON(`${API}/league/${current.league.league_id}/transactions/${wk}`).catch(() => [])
      )
    );
    const allTx = weekTx.flat().filter(t => t.status === "complete").sort((a, b) => (b.created || 0) - (a.created || 0));
    allTx.forEach(tx => {
      if (!tx.adds) return;
      Object.entries(tx.adds).forEach(([playerId, rosterId]) => {
        if (rosterId !== roster.roster_id) return;
        if (acquiredMap[playerId]) return; // keep the most recent (list is newest-first)
        if (tx.type === "trade") acquiredMap[playerId] = "Acquired via trade";
        else if (tx.type === "waiver") acquiredMap[playerId] = "Added via waiver";
        else if (tx.type === "free_agent") acquiredMap[playerId] = "Added as free agent";
        else acquiredMap[playerId] = "Added";
      });
    });
  } catch (e) { /* no transaction data available */ }

  const rows = roster.players.map(pid => {
    const p = state.players[pid];
    const name = p ? (p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim()) : pid;
    const pos = p?.position || "—";
    const team = p?.team || "FA";
    const acquired = acquiredMap[pid] || draftedMap[pid] || "On roster since before recorded transactions";
    return `<tr><td>${name}</td><td>${pos}</td><td>${team}</td><td>${acquired}</td></tr>`;
  }).sort().join("");

  document.getElementById("roster-body").innerHTML = rows;
}

/* ============================================================
   THIS WEEK — matchup hype cards + full lineup detail
   ============================================================ */
async function renderThisWeek() {
  const grid = document.getElementById("hype-grid");
  try {
    const nflState = state.nflState || await getJSON(`${API}/state/nfl`);
    const week = nflState.week || 1;
    const current = state.chain[0];
    document.getElementById("thisweek-subhead").textContent = `${current.league.season}, Week ${week}`;

    const matchups = await getJSON(`${API}/league/${current.league.league_id}/matchups/${week}`).catch(() => []);
    const byMatchup = {};
    matchups.forEach(m => { if (m.matchup_id != null) (byMatchup[m.matchup_id] ||= []).push(m); });
    const pairs = Object.values(byMatchup).filter(p => p.length === 2);

    if (pairs.length === 0) {
      grid.innerHTML = `<p class="loading">No matchups posted for this week yet.</p>`;
      return;
    }

    state.thisWeekPairs = { week, pairs };

    grid.innerHTML = pairs.map((pair, i) => {
      const [a, b] = pair;
      const ownerA = ownerKey(current, a.roster_id);
      const ownerB = ownerKey(current, b.roster_id);
      const nameA = state.ownerDirectory[ownerA]?.team || "Team A";
      const nameB = state.ownerDirectory[ownerB]?.team || "Team B";
      const fact = buildFunFact(ownerA, ownerB, nameA, nameB);
      return `
        <div class="hype-card">
          <p class="matchup-title">${teamLink(ownerA, nameA)} vs ${teamLink(ownerB, nameB)}</p>
          <p class="fun-fact">${fact}</p>
          <button class="btn" data-idx="${i}">View Full Matchup</button>
        </div>`;
    }).join("");

    grid.querySelectorAll("button[data-idx]").forEach(btn => {
      btn.addEventListener("click", () => openMatchupDetail(parseInt(btn.dataset.idx, 10)));
    });
  } catch (e) {
    console.error(e);
    grid.innerHTML = `<p class="loading">Couldn't load this week's matchups.</p>`;
  }
}

function buildFunFact(ownerA, ownerB, nameA, nameB) {
  const meetings = state.games.filter(g =>
    (g.ownerA === ownerA && g.ownerB === ownerB) || (g.ownerA === ownerB && g.ownerB === ownerA)
  ).sort((a, b) => a.season - b.season || a.week - b.week);

  if (meetings.length === 0) return "First-ever meeting between these two managers.";

  let winsA = 0, winsB = 0, biggestMargin = null;
  meetings.forEach(g => {
    const [scoreA, scoreB] = g.ownerA === ownerA ? [g.ptsA, g.ptsB] : [g.ptsB, g.ptsA];
    if (scoreA > scoreB) winsA++; else if (scoreB > scoreA) winsB++;
    const margin = Math.abs(scoreA - scoreB);
    if (!biggestMargin || margin > biggestMargin.margin) {
      biggestMargin = { margin, winner: scoreA > scoreB ? nameA : nameB, season: g.season, week: g.week };
    }
  });
  const last = meetings[meetings.length - 1];
  const [lastA, lastB] = last.ownerA === ownerA ? [last.ptsA, last.ptsB] : [last.ptsB, last.ptsA];
  const lastWinner = lastA > lastB ? nameA : lastB > lastA ? nameB : "Tie";
  const leader = winsA > winsB ? `${nameA} leads the series ${winsA}-${winsB}`
    : winsB > winsA ? `${nameB} leads the series ${winsB}-${winsA}`
    : `Series tied ${winsA}-${winsB}`;

  return `${leader} · last met ${last.season} Wk ${last.week} (${lastWinner} won) · biggest margin ${biggestMargin.margin.toFixed(1)} pts (${biggestMargin.winner}, ${biggestMargin.season} Wk ${biggestMargin.week}).`;
}

function openMatchupDetail(idx) {
  const { week, pairs } = state.thisWeekPairs;
  const [a, b] = pairs[idx];
  const current = state.chain[0];
  const ownerA = ownerKey(current, a.roster_id);
  const ownerB = ownerKey(current, b.roster_id);
  const nameA = state.ownerDirectory[ownerA]?.team || "Team A";
  const nameB = state.ownerDirectory[ownerB]?.team || "Team B";

  document.getElementById("thisweek-list-view").classList.add("hidden");
  document.getElementById("matchup-detail-view").classList.remove("hidden");
  document.getElementById("matchup-detail-title").textContent = `${nameA} vs ${nameB} — Week ${week}`;
  document.getElementById("matchup-detail-fact").textContent = buildFunFact(ownerA, ownerB, nameA, nameB);

  const lineupHTML = (entry, name) => {
    const starters = entry.starters || [];
    const rows = starters.map(pid => {
      const p = state.players?.[pid];
      const label = p ? (p.full_name || pid) : pid;
      const pos = p?.position || "";
      const pts = entry.players_points?.[pid];
      return `<tr><td>${label}</td><td>${pos}</td><td class="num">${pts != null ? pts.toFixed(1) : "TBD"}</td></tr>`;
    }).join("");
    return `
      <div>
        <h3>${name} — ${entry.points != null ? entry.points.toFixed(1) : "0.0"} pts</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Player</th><th>Pos</th><th>Pts</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="3" class="loading">Lineup not set yet</td></tr>`}</tbody>
        </table></div>
      </div>`;
  };

  const render = () => {
    document.getElementById("lineup-columns").innerHTML = lineupHTML(a, nameA) + lineupHTML(b, nameB);
  };
  if (!state.players) loadPlayersIfNeeded().then(render);
  else render();
}

document.getElementById("matchup-back").addEventListener("click", () => {
  document.getElementById("matchup-detail-view").classList.add("hidden");
  document.getElementById("thisweek-list-view").classList.remove("hidden");
});

/* ============================================================
   PROP BETS — manually curated each week in props-data.js,
   voted on by the whole league via a shared Netlify Function
   ============================================================ */
async function renderPropBets() {
  const list = document.getElementById("prop-list");
  const data = window.WEEKLY_PROPS;
  if (!data || !data.bets || data.bets.length === 0) {
    list.innerHTML = `<p class="loading">No prop bets loaded for this week yet.</p>`;
    return;
  }
  document.getElementById("propbets-subhead").textContent =
    `AI-generated prop bets for ${data.week}. Cast your vote — tallies are shared with the whole league.`;

  let tallies = {};
  try {
    const res = await fetch(`/api/votes?week=${encodeURIComponent(data.week)}`);
    tallies = await res.json();
  } catch (e) { /* voting API not reachable yet — still show the bets */ }

  list.innerHTML = data.bets.map(bet => `
    <div class="prop-card" data-id="${bet.id}">
      <p class="question">${bet.question}</p>
      <div class="prop-options">
        <button class="prop-option" data-option="A">
          <span class="fill"></span><span class="opt-label">${bet.optionA}</span><span class="opt-pct"></span>
        </button>
        <button class="prop-option" data-option="B">
          <span class="fill"></span><span class="opt-label">${bet.optionB}</span><span class="opt-pct"></span>
        </button>
      </div>
    </div>
  `).join("");

  document.querySelectorAll(".prop-card").forEach(card => {
    const id = card.dataset.id;
    const counts = tallies[id] || { A: 0, B: 0 };
    paintPropCard(card, counts);
    const votedKey = `voted:${data.week}:${id}`;
    if (localStorage.getItem(votedKey)) lockPropCard(card);

    card.querySelectorAll(".prop-option").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (localStorage.getItem(votedKey)) return;
        const option = btn.dataset.option;
        try {
          const res = await fetch("/api/votes", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ week: data.week, propId: id, option })
          });
          const updated = await res.json();
          paintPropCard(card, updated);
        } catch (e) {
          counts[option]++;
          paintPropCard(card, counts);
        }
        localStorage.setItem(votedKey, option);
        lockPropCard(card);
      });
    });
  });
}

function paintPropCard(card, counts) {
  const total = (counts.A || 0) + (counts.B || 0);
  const pctA = total ? Math.round((counts.A / total) * 100) : 0;
  const pctB = total ? 100 - pctA : 0;
  const [btnA, btnB] = card.querySelectorAll(".prop-option");
  btnA.querySelector(".fill").style.width = `${pctA}%`;
  btnB.querySelector(".fill").style.width = `${pctB}%`;
  btnA.querySelector(".opt-pct").textContent = total ? `${pctA}% (${counts.A})` : "";
  btnB.querySelector(".opt-pct").textContent = total ? `${pctB}% (${counts.B})` : "";
}
function lockPropCard(card) {
  card.querySelectorAll(".prop-option").forEach(b => b.classList.add("voted"));
}

/* ============================================================
   POWER RANKINGS — dynasty superflex PPR values via FantasyCalc,
   combined with live rosters. Always current (no manual updates).
   ============================================================ */
async function renderPowerRankings() {
  const body = document.getElementById("power-body");
  try {
    const current = state.chain[0];
    const teamCount = current.league.total_rosters || 12;
    const nearestSupported = [10, 12, 14].reduce((best, n) =>
      Math.abs(n - teamCount) < Math.abs(best - teamCount) ? n : best, 12);

    const values = await getJSON(
      `https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=${nearestSupported}&ppr=1`
    );
    const valueBySleeperId = {};
    values.forEach(v => { if (v.player?.sleeperId) valueBySleeperId[v.player.sleeperId] = v; });

    const rows = current.rosters.map(r => {
      const owner = state.ownerDirectory[r.owner_id];
      const players = (r.players || []).map(pid => valueBySleeperId[pid]).filter(Boolean);
      const total = players.reduce((sum, p) => sum + p.value, 0);
      const topAsset = players.sort((a, b) => b.value - a.value)[0];
      return { ownerId: r.owner_id, owner, total, topAsset };
    }).sort((a, b) => b.total - a.total);

    body.innerHTML = rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${r.owner ? teamLink(r.ownerId, r.owner.team) : "—"}</td>
        <td>${r.owner ? teamLink(r.ownerId, r.owner.name) : "—"}</td>
        <td class="num">${r.total.toLocaleString()}</td>
        <td>${r.topAsset?.player?.name || "—"}</td>
      </tr>
    `).join("");
  } catch (e) {
    console.error(e);
    body.innerHTML = `<tr><td colspan="5" class="loading">FantasyCalc's public API is unreachable right now — try again later.</td></tr>`;
  }
}

/* ============================================================
   TRADE FEED — every trade, formatted as a poster-style card,
   with a value-based fairness rating (players via Sleeper's IDs,
   picks matched by name) from Dynasty Dealer's free values API.
   ============================================================ */
async function getDynastyDealerValues() {
  if (state.dealerValues) return state.dealerValues;
  try {
    const { players } = await getJSON("https://www.dynastydealer.com/api/player-values");
    state.dealerValues = players || [];
  } catch (e) {
    state.dealerValues = [];
  }
  return state.dealerValues;
}

function findAssetValue(dealerValues, { playerId, pickLabel }) {
  if (playerId) {
    const hit = dealerValues.find(v => v.sleeper_id === playerId);
    return hit ? hit.current_value : 0;
  }
  if (pickLabel) {
    // pickLabel looks like "2027 1st Round Pick" — fuzzy-match against
    // Dynasty Dealer's pick entries (they don't carry a sleeper_id)
    const year = pickLabel.match(/\d{4}/)?.[0];
    const roundWord = pickLabel.match(/1st|2nd|3rd|4th/)?.[0];
    const hit = dealerValues.find(v =>
      !v.position && v.name && (!year || v.name.includes(year)) && (!roundWord || v.name.toLowerCase().includes(roundWord))
    );
    return hit ? hit.current_value : 0;
  }
  return 0;
}

async function getAllTransactions() {
  if (state.allTransactions) return state.allTransactions;
  const all = [];
  for (const season of state.chain) {
    const weekTx = await Promise.all(
      Array.from({ length: 18 }, (_, i) => i + 1).map(wk =>
        getJSON(`${API}/league/${season.league.league_id}/transactions/${wk}`).catch(() => [])
      )
    );
    weekTx.flat()
      .filter(t => t.status === "complete")
      .forEach(t => all.push({ tx: t, season }));
  }
  state.allTransactions = all;
  return all;
}

async function renderTradeFeed() {
  const feed = document.getElementById("trade-feed");
  try {
    const allTx = await getAllTransactions();
    const allTrades = allTx.filter(({ tx }) => tx.type === "trade");

    if (allTrades.length === 0) {
      feed.innerHTML = `<p class="loading">No trades on record yet.</p>`;
      return;
    }

    allTrades.sort((a, b) => (b.tx.created || 0) - (a.tx.created || 0));
    await loadPlayersIfNeeded();
    const dealerValues = await getDynastyDealerValues();

    feed.innerHTML = allTrades.map(({ tx, season }) => {
      const sides = {};
      (tx.roster_ids || []).forEach(rid => {
        const oid = ownerKey(season, rid);
        sides[rid] = { ownerId: oid, owner: state.ownerDirectory[oid] || { name: "Unknown", team: "Unknown" }, items: [], value: 0 };
      });
      Object.entries(tx.adds || {}).forEach(([pid, rid]) => {
        if (!sides[rid]) return;
        const p = state.players?.[pid];
        const label = p ? (p.full_name || pid) : pid;
        sides[rid].items.push(label);
        sides[rid].value += findAssetValue(dealerValues, { playerId: pid });
      });
      (tx.draft_picks || []).forEach(pick => {
        if (!sides[pick.owner_id]) return;
        const label = `${pick.season} Round ${pick.round} pick`;
        sides[pick.owner_id].items.push(label);
        sides[pick.owner_id].value += findAssetValue(dealerValues, { pickLabel: label });
      });
      const date = tx.created ? new Date(tx.created).toLocaleDateString() : season.league.season;
      const sideEntries = Object.values(sides);

      // rating: only meaningful for a straight two-team trade
      let ratingHTML = "";
      if (sideEntries.length === 2 && (sideEntries[0].value + sideEntries[1].value) > 0) {
        const [s1, s2] = sideEntries;
        const total = s1.value + s2.value;
        const diffPct = Math.round((Math.abs(s1.value - s2.value) / total) * 100);
        const winner = s1.value === s2.value ? null : (s1.value > s2.value ? s1 : s2);
        const verdict = !winner
          ? "Dead even by value"
          : diffPct < 10 ? `Fair trade, slight edge to ${winner.owner.team}`
          : diffPct < 30 ? `${winner.owner.team} got the better end`
          : `Lopsided — ${winner.owner.team} won this one big`;
        ratingHTML = `<p class="trade-rating">${verdict} <span class="rating-pct">(${100 - diffPct}/100 fairness)</span></p>`;
      }

      const sideHTML = sideEntries.map(s => `
        <div class="trade-side">
          <p class="team">${s.owner.avatar ? `<img src="${s.owner.avatar}" alt="">` : ""}${teamLink(s.ownerId, s.owner.team)}</p>
          <ul>${s.items.map(i => `<li>${i}</li>`).join("") || "<li>—</li>"}</ul>
        </div>
      `);
      // interleave an arrow between exactly two sides; more than two just stacks
      const middle = sideEntries.length === 2 ? `<div class="trade-arrow">⇄</div>` : "";
      const layout = sideEntries.length === 2
        ? `${sideHTML[0]}${middle}${sideHTML[1]}`
        : sideHTML.join("");

      return `
        <div class="trade-card">
          <p class="trade-date">${season.league.season} · ${date}</p>
          <div class="trade-sides">${layout}</div>
          ${ratingHTML}
        </div>`;
    }).join("") + `<p class="section-note" style="margin-top:1rem;">Trade values by <a href="https://www.dynastydealer.com" target="_blank" rel="noopener">Dynasty Dealer</a>.</p>`;
  } catch (e) {
    console.error(e);
    feed.innerHTML = `<p class="loading">Couldn't load the trade log right now.</p>`;
  }
}

/* ============================================================
   WAIVER WIRE — every add/drop, same feed style as trades
   ============================================================ */
async function renderWaiverFeed() {
  const feed = document.getElementById("waiver-feed");
  try {
    const allTx = await getAllTransactions();
    const waiverTx = allTx.filter(({ tx }) => tx.type === "waiver" || tx.type === "free_agent");

    if (waiverTx.length === 0) {
      feed.innerHTML = `<p class="loading">No waiver moves on record yet.</p>`;
      return;
    }

    waiverTx.sort((a, b) => (b.tx.created || 0) - (a.tx.created || 0));
    await loadPlayersIfNeeded();

    feed.innerHTML = waiverTx.slice(0, 100).map(({ tx, season }) => {
      const rid = tx.roster_ids?.[0];
      const oid = rid != null ? ownerKey(season, rid) : null;
      const owner = oid ? (state.ownerDirectory[oid] || { name: "Unknown", team: "Unknown" }) : { name: "Unknown", team: "Unknown" };
      const added = Object.keys(tx.adds || {}).map(pid => {
        const p = state.players?.[pid];
        return p ? (p.full_name || pid) : pid;
      });
      const dropped = Object.keys(tx.drops || {}).map(pid => {
        const p = state.players?.[pid];
        return p ? (p.full_name || pid) : pid;
      });
      const date = tx.created ? new Date(tx.created).toLocaleDateString() : season.league.season;
      const bid = tx.settings?.waiver_bid != null ? ` · $${tx.settings.waiver_bid} FAAB` : "";
      const kind = tx.type === "waiver" ? "Waiver claim" : "Free agent";

      return `
        <div class="trade-card">
          <p class="trade-date">${season.league.season} · ${date} · ${kind}${bid}</p>
          <div class="trade-sides">
            <div class="trade-side">
              <p class="team">${owner.avatar ? `<img src="${owner.avatar}" alt="">` : ""}${oid ? teamLink(oid, owner.team) : owner.team}</p>
              <ul>
                ${added.map(n => `<li>+ ${n}</li>`).join("")}
                ${dropped.map(n => `<li>− ${n}</li>`).join("")}
              </ul>
            </div>
          </div>
        </div>`;
    }).join("");
  } catch (e) {
    console.error(e);
    feed.innerHTML = `<p class="loading">Couldn't load the waiver log right now.</p>`;
  }
}

/* ============================================================
   WEEKLY AWARDS — highest/lowest scorer, best bench, worst start/sit
   from the most recently completed week
   ============================================================ */
async function findLastCompletedWeek() {
  const current = state.chain[0];
  let week = state.nflState?.week || 1;
  for (let attempt = 0; attempt < 5 && week >= 1; attempt++, week--) {
    const matchups = await getJSON(`${API}/league/${current.league.league_id}/matchups/${week}`).catch(() => []);
    const total = matchups.reduce((sum, m) => sum + (m.points || 0), 0);
    if (total > 0) return { week, matchups };
  }
  return { week: 0, matchups: [] };
}

async function renderAwards() {
  const grid = document.getElementById("awards-grid");
  try {
    const { week, matchups } = await findLastCompletedWeek();
    if (!week || matchups.length === 0) {
      grid.innerHTML = `<p class="loading">No completed weeks yet this season.</p>`;
      return;
    }
    document.getElementById("awards-week-label").textContent = `Week ${week}`;
    await loadPlayersIfNeeded();
    const current = state.chain[0];

    let highest = null, lowest = null, bestBench = null, worstStartSit = null;
    matchups.forEach(m => {
      const oid = ownerKey(current, m.roster_id);
      const teamName = state.ownerDirectory[oid]?.team || "Unknown";
      const starters = m.starters || [];
      const playersPts = m.players_points || {};
      const benchIds = (m.players || []).filter(pid => !starters.includes(pid));
      const benchTotal = benchIds.reduce((sum, pid) => sum + (playersPts[pid] || 0), 0);

      if (!highest || m.points > highest.points) highest = { points: m.points, teamName, ownerId: oid };
      if (!lowest || m.points < lowest.points) lowest = { points: m.points, teamName, ownerId: oid };
      if (!bestBench || benchTotal > bestBench.points) bestBench = { points: benchTotal, teamName, ownerId: oid };

      const starterPts = starters.map(pid => ({ pid, pts: playersPts[pid] || 0 })).sort((a, b) => a.pts - b.pts);
      const benchPts = benchIds.map(pid => ({ pid, pts: playersPts[pid] || 0 })).sort((a, b) => b.pts - a.pts);
      if (starterPts.length && benchPts.length) {
        const worstStarter = starterPts[0];
        const bestBenchPlayer = benchPts[0];
        const diff = bestBenchPlayer.pts - worstStarter.pts;
        if (diff > 0 && (!worstStartSit || diff > worstStartSit.diff)) {
          const sName = state.players?.[worstStarter.pid]?.full_name || worstStarter.pid;
          const bName = state.players?.[bestBenchPlayer.pid]?.full_name || bestBenchPlayer.pid;
          worstStartSit = { diff, teamName, ownerId: oid, sat: bName, satPts: bestBenchPlayer.pts, started: sName, startedPts: worstStarter.pts };
        }
      }
    });

    const cards = [
      { icon: "🔥", label: "Highest Scorer", value: highest?.points.toFixed(1), who: highest ? teamLink(highest.ownerId, highest.teamName) : "—", meta: `Week ${week}`, featured: true },
      { icon: "🥶", label: "Lowest Scorer", value: lowest?.points.toFixed(1), who: lowest ? teamLink(lowest.ownerId, lowest.teamName) : "—", meta: `Week ${week}` },
      { icon: "🪑", label: "Best Bench", value: bestBench?.points.toFixed(1), who: bestBench ? teamLink(bestBench.ownerId, bestBench.teamName) : "—", meta: "points left on the bench" },
      { icon: "😬", label: "Worst Start/Sit", value: worstStartSit ? `+${worstStartSit.diff.toFixed(1)}` : "—",
        who: worstStartSit ? teamLink(worstStartSit.ownerId, worstStartSit.teamName) : "—",
        meta: worstStartSit ? `Sat ${worstStartSit.sat} (${worstStartSit.satPts.toFixed(1)}) for ${worstStartSit.started} (${worstStartSit.startedPts.toFixed(1)})` : "" }
    ];

    grid.innerHTML = cards.map(c => `
      <div class="record-card ${c.featured ? "featured" : ""}">
        <p class="icon">${c.icon}</p>
        <p class="label">${c.label}</p>
        <p class="value">${c.value ?? "–"}</p>
        <p class="who">${c.who ?? "—"}</p>
        <p class="meta">${c.meta ?? ""}</p>
      </div>
    `).join("");
  } catch (e) {
    console.error(e);
    grid.innerHTML = `<p class="loading">Couldn't compute this week's awards.</p>`;
  }
}

/* ============================================================
   PLAYOFF PICTURE — current standings vs. the league's playoff cutoff
   ============================================================ */
async function renderPlayoffPicture() {
  const list = document.getElementById("playoffs-list");
  try {
    const current = state.chain[0];
    const playoffSpots = current.league.settings?.playoff_teams || 6;
    document.getElementById("playoffs-subhead").textContent =
      `Top ${playoffSpots} make the playoffs. Regular season standings, live from Sleeper.`;

    list.innerHTML = state.standings.map((r, i) => {
      const inBubble = i === playoffSpots - 1;
      const justOut = i === playoffSpots;
      return `
        ${i === playoffSpots ? `<li class="playoff-cutline">— playoff cutoff —</li>` : ""}
        <li class="${i < playoffSpots ? "in-playoffs" : ""}">
          <span class="rank">${i + 1}</span>
          ${teamLink(r.ownerId, r.team)}
          <span class="rec">${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""}</span>
          <span class="pct">${r.pf.toFixed(1)} PF</span>
        </li>`;
    }).join("");
  } catch (e) {
    console.error(e);
    list.innerHTML = `<li class="loading">Couldn't load the playoff picture.</li>`;
  }
}

/* ============================================================
   RIVALRY BADGES — nemesis / cupcake, shown on each team's page
   ============================================================ */
function renderRivalryBadges(ownerId) {
  const row = document.getElementById("rivalry-row");
  const records = {};
  state.games.forEach(g => {
    if (g.ownerA !== ownerId && g.ownerB !== ownerId) return;
    const opp = g.ownerA === ownerId ? g.ownerB : g.ownerA;
    const [myPts, oppPts] = g.ownerA === ownerId ? [g.ptsA, g.ptsB] : [g.ptsB, g.ptsA];
    records[opp] ||= { w: 0, l: 0 };
    if (myPts > oppPts) records[opp].w++; else if (oppPts > myPts) records[opp].l++;
  });

  const entries = Object.entries(records).filter(([, r]) => (r.w + r.l) > 0);
  if (entries.length === 0) { row.innerHTML = ""; return; }

  const withPct = entries.map(([oid, r]) => ({ oid, ...r, pct: r.w / (r.w + r.l) }));
  const nemesis = [...withPct].sort((a, b) => a.pct - b.pct || b.l - a.l)[0];
  const cupcake = [...withPct].sort((a, b) => b.pct - a.pct || b.w - a.w)[0];

  const badge = (title, cls, entry) => entry ? `
    <div class="rivalry-badge ${cls}">
      <p class="rlabel">${title}</p>
      <p class="rname">${teamLink(entry.oid, state.ownerDirectory[entry.oid]?.team || "Unknown")}</p>
      <p class="rrec">${entry.w}-${entry.l} all-time</p>
    </div>` : "";

  row.innerHTML = badge("Nemesis", "nemesis", nemesis) + badge("Cupcake", "cupcake", cupcake);
}

/* ============================================================
   Boot
   ============================================================ */
(async function init() {
  try {
    const chain = await loadLeagueChain(LEAGUE_ID);
    const games = await loadAllMatchups(chain);
    const ownerDirectory = buildOwnerDirectory(chain);
    const standings = computeStandings(chain);

    state.chain = chain;
    state.games = games;
    state.ownerDirectory = ownerDirectory;
    state.standings = standings;

    renderHero(chain, games);
    renderHeroDates(chain);
    renderStandings(chain, standings);
    setupH2HPicker(games, ownerDirectory);
    renderRecords(chain, games, ownerDirectory);
    renderTeamsGrid(standings, ownerDirectory, chain);
    await renderHistory(chain);
  } catch (err) {
    console.error(err);
    document.querySelectorAll(".loading").forEach(el => {
      el.textContent = "Couldn't reach Sleeper right now — refresh to try again.";
    });
  }
})();
