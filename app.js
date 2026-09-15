/* ============================================================
   TNAAT DYNASTY — powered live by the Sleeper API
   Only thing you should ever need to change is the line below.
   ============================================================ */
const LEAGUE_ID = "1315463764962721792";
const API = "https://api.sleeper.app/v1";

/* ---------- tiny fetch helper ---------- */
async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sleeper API error on ${url}: ${res.status}`);
  return res.json();
}

/* ---------- tab switching ---------- */
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.target).classList.add("active");
  });
});

/* ============================================================
   1. Walk the league's history backwards via previous_league_id
      so every season, ever, gets pulled in automatically —
      including new seasons Sleeper creates in future years.
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
  return chain; // chain[0] = current season, last entry = oldest season
}

/* ---------- resolve a display name for a roster in a given season ---------- */
function ownerName(season, rosterId) {
  const roster = season.rosters.find(r => r.roster_id === rosterId);
  if (!roster) return "Unknown";
  const user = season.users.find(u => u.user_id === roster.owner_id);
  return user ? (user.metadata?.team_name || user.display_name) : "Unknown Manager";
}
function ownerKey(season, rosterId) {
  const roster = season.rosters.find(r => r.roster_id === rosterId);
  return roster ? roster.owner_id : `unknown-${rosterId}`;
}

/* ============================================================
   2. Pull every matchup, every week, every season in the chain.
   ============================================================ */
async function loadAllMatchups(chain) {
  const games = []; // { season, week, ownerA, ownerB, ptsA, ptsB }
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
          nameA: ownerName(season, a.roster_id),
          nameB: ownerName(season, b.roster_id),
          ptsA: a.points || 0,
          ptsB: b.points || 0
        });
      });
    }
  }
  return games;
}

/* ============================================================
   3. Render: hero stat ribbon
   ============================================================ */
function renderHero(chain, games) {
  const allOwners = new Set();
  chain.forEach(s => s.rosters.forEach(r => allOwners.add(r.owner_id)));
  document.getElementById("stat-seasons").textContent = chain.length;
  document.getElementById("stat-managers").textContent = allOwners.size;
  document.getElementById("stat-games").textContent = games.length;
  const oldestSeason = chain[chain.length - 1]?.league.season;
  if (oldestSeason) document.getElementById("hero-founded").textContent = oldestSeason;
}

/* ============================================================
   4. Render: current standings
   ============================================================ */
function renderStandings(chain) {
  const current = chain[0];
  document.getElementById("standings-season").textContent = current.league.season;
  const rows = current.rosters
    .map(r => {
      const user = current.users.find(u => u.user_id === r.owner_id);
      return {
        manager: user ? user.display_name : "Unknown",
        team: user?.metadata?.team_name || "—",
        wins: r.settings?.wins ?? 0,
        losses: r.settings?.losses ?? 0,
        ties: r.settings?.ties ?? 0,
        pf: (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100,
        pa: (r.settings?.fpts_against ?? 0) + (r.settings?.fpts_against_decimal ?? 0) / 100
      };
    })
    .sort((a, b) => b.wins - a.wins || b.pf - a.pf);

  document.getElementById("standings-body").innerHTML = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.manager}</td>
      <td>${r.team}</td>
      <td class="num">${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""}</td>
      <td class="num">${r.pf.toFixed(1)}</td>
      <td class="num">${r.pa.toFixed(1)}</td>
    </tr>
  `).join("");
}

/* ============================================================
   5. Render: all-time head-to-head grid
   ============================================================ */
function renderH2H(games) {
  const names = {}; // ownerId -> display name (most recent seen wins)
  const record = {}; // "a|b" -> {w,l}
  games.forEach(g => {
    names[g.ownerA] = g.nameA;
    names[g.ownerB] = g.nameB;
    const key1 = `${g.ownerA}|${g.ownerB}`;
    const key2 = `${g.ownerB}|${g.ownerA}`;
    record[key1] ||= { w: 0, l: 0 };
    record[key2] ||= { w: 0, l: 0 };
    if (g.ptsA > g.ptsB) { record[key1].w++; record[key2].l++; }
    else if (g.ptsB > g.ptsA) { record[key2].w++; record[key1].l++; }
  });

  const owners = Object.keys(names).sort((a, b) => names[a].localeCompare(names[b]));
  const table = document.getElementById("h2h-table");
  const thead = `<thead><tr><th class="row-label"></th>${owners.map(o => `<th>${names[o]}</th>`).join("")}</tr></thead>`;
  const tbody = owners.map(rowOwner => {
    const cells = owners.map(colOwner => {
      if (rowOwner === colOwner) return `<td class="self">—</td>`;
      const rec = record[`${rowOwner}|${colOwner}`] || { w: 0, l: 0 };
      const cls = rec.w >= rec.l ? "win" : "loss";
      return `<td class="${cls}">${rec.w}-${rec.l}</td>`;
    }).join("");
    return `<tr><td class="row-label">${names[rowOwner]}</td>${cells}</tr>`;
  }).join("");
  table.innerHTML = thead + `<tbody>${tbody}</tbody>`;
}

/* ============================================================
   6. Render: record book
   ============================================================ */
function renderRecords(chain, games) {
  // Most points in a single game
  let best = null;
  games.forEach(g => {
    if (!best || g.ptsA > best.pts) best = { pts: g.ptsA, who: g.nameA, season: g.season, week: g.week };
    if (!best || g.ptsB > best.pts) best = { pts: g.ptsB, who: g.nameB, season: g.season, week: g.week };
  });

  // Best single-season points total, from roster settings across the chain
  let bestSeason = null;
  chain.forEach(s => {
    s.rosters.forEach(r => {
      const user = s.users.find(u => u.user_id === r.owner_id);
      const pf = (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100;
      if (!bestSeason || pf > bestSeason.pf) {
        bestSeason = { pf, who: user?.display_name || "Unknown", season: s.league.season };
      }
    });
  });

  // Longest win streak, all-time, per manager (chronological by season+week)
  const sorted = [...games].sort((a, b) => a.season - b.season || a.week - b.week);
  const current = {}; const longest = {};
  sorted.forEach(g => {
    const winner = g.ptsA > g.ptsB ? g.ownerA : (g.ptsB > g.ptsA ? g.ownerB : null);
    const loser = g.ptsA > g.ptsB ? g.ownerB : (g.ptsB > g.ptsA ? g.ownerA : null);
    const winnerName = g.ptsA > g.ptsB ? g.nameA : g.nameB;
    if (winner) {
      current[winner] = (current[winner] || 0) + 1;
      if (current[winner] > (longest[winner]?.count || 0)) longest[winner] = { count: current[winner], name: winnerName };
    }
    if (loser) current[loser] = 0;
  });
  const bestStreak = Object.values(longest).sort((a, b) => b.count - a.count)[0];

  // Most all-time wins
  const winCounts = {};
  games.forEach(g => {
    const winner = g.ptsA > g.ptsB ? g.ownerA : (g.ptsB > g.ptsA ? g.ownerB : null);
    const winnerName = g.ptsA > g.ptsB ? g.nameA : g.nameB;
    if (winner) {
      winCounts[winner] ||= { count: 0, name: winnerName };
      winCounts[winner].count++;
    }
  });
  const mostWins = Object.values(winCounts).sort((a, b) => b.count - a.count)[0];

  const cards = [
    { label: "Most Points, Single Game", value: best?.pts.toFixed(1), who: best?.who, meta: `${best?.season}, Week ${best?.week}` },
    { label: "Best Single Season (PF)", value: bestSeason?.pf.toFixed(1), who: bestSeason?.who, meta: bestSeason?.season },
    { label: "Longest Win Streak", value: bestStreak?.count, who: bestStreak?.name, meta: "consecutive wins" },
    { label: "Most All-Time Wins", value: mostWins?.count, who: mostWins?.name, meta: "regular + postseason" }
  ];

  document.getElementById("record-grid").innerHTML = cards.map(c => `
    <div class="record-card">
      <p class="label">${c.label}</p>
      <p class="value">${c.value ?? "–"}</p>
      <p class="who">${c.who ?? "—"}</p>
      <p class="meta">${c.meta ?? ""}</p>
    </div>
  `).join("");
}

/* ============================================================
   7. Render: season-by-season history + champions
   ============================================================ */
async function renderHistory(chain) {
  const items = await Promise.all(chain.map(async season => {
    let champ = null, runnerUp = null;
    try {
      const bracket = await getJSON(`${API}/league/${season.league.league_id}/winners_bracket`);
      const final = bracket.find(m => m.p === 1);
      if (final && final.w) {
        champ = ownerName(season, final.w);
        runnerUp = final.l ? ownerName(season, final.l) : null;
      }
    } catch (e) { /* season may still be in progress */ }
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
   Boot
   ============================================================ */
(async function init() {
  try {
    const chain = await loadLeagueChain(LEAGUE_ID);
    const games = await loadAllMatchups(chain);
    renderHero(chain, games);
    renderStandings(chain);
    renderH2H(games);
    renderRecords(chain, games);
    await renderHistory(chain);
  } catch (err) {
    console.error(err);
    document.querySelectorAll(".loading").forEach(el => {
      el.textContent = "Couldn't reach Sleeper right now — refresh to try again.";
    });
  }
})();
