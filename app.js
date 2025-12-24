// app.js (GitHub Pages version)
// Paste this entire file into your repo as: app.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  orderBy,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// ✅ Your Firebase config (from your screenshot)
const firebaseConfig = {
  apiKey: "AIzaSyByPR-umawWwMd_3eFzGnAOreNxHAR3sgU",
  authDomain: "prediction-league-9962bd.firebaseapp.com",
  projectId: "prediction-league-9962bd",
  storageBucket: "prediction-league-9962bd.firebasestorage.app",
  messagingSenderId: "262464826826",
  appId: "1:262464826826:web:9d12ee7ff18a941b2ab333",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove("hidden");
const hide = (id) => $(id).classList.add("hidden");

let uid = null;
let currentLeagueId = localStorage.getItem("leagueId") || null;

function randomInviteCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function toLocalDateTimeInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function parseDateTimeLocalToTimestamp(value) {
  return Timestamp.fromDate(new Date(value));
}

function setTab(tab) {
  $("tabMatches").classList.toggle("active", tab === "matches");
  $("tabLeaderboard").classList.toggle("active", tab === "leaderboard");
  $("tabAdmin").classList.toggle("active", tab === "admin");

  tab === "matches" ? show("panelMatches") : hide("panelMatches");
  tab === "leaderboard" ? show("panelLeaderboard") : hide("panelLeaderboard");
  tab === "admin" ? show("panelAdmin") : hide("panelAdmin");
}

$("btnReset").addEventListener("click", () => {
  localStorage.removeItem("leagueId");
  localStorage.removeItem("nickname");
  location.reload();
});

async function boot() {
  show("screenLoading");
  hide("screenJoin");
  hide("screenLeague");

  await signInAnonymously(auth);

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    uid = user.uid;
    $("userBadge").textContent = `Device: ${uid.slice(0, 6)}…`;

    if (currentLeagueId) await loadLeague(currentLeagueId);
    else showJoin();
  });
}

function showJoin() {
  hide("screenLoading");
  show("screenJoin");
  hide("screenLeague");
}

// Join league by invite code + nickname
$("btnJoin").addEventListener("click", async () => {
  const code = $("inviteCode").value.trim().toUpperCase();
  const nick = $("nickname").value.trim();

  if (!code || !nick) return alert("Enter invite code and nickname.");

  const q1 = query(collection(db, "leagues"), where("inviteCode", "==", code));
  const snap = await getDocs(q1);

  if (snap.empty) return alert("Invalid invite code.");

  const leagueId = snap.docs[0].id;

  await setDoc(
    doc(db, "leagues", leagueId, "members", uid),
    { nickname: nick, joinedAt: serverTimestamp() },
    { merge: true }
  );

  localStorage.setItem("leagueId", leagueId);
  localStorage.setItem("nickname", nick);
  currentLeagueId = leagueId;

  await loadLeague(leagueId);
});

// Create league (admin)
$("btnCreateLeague").addEventListener("click", async () => {
  const leagueName = $("leagueName").value.trim();
  const adminNick = $("adminNickname").value.trim();

  if (!leagueName || !adminNick) return alert("Enter league name + your nickname.");

  const inviteCode = randomInviteCode(6);

  const leagueRef = await addDoc(collection(db, "leagues"), {
    name: leagueName,
    inviteCode,
    adminUid: uid,
    createdAt: serverTimestamp(),
  });

  await setDoc(
    doc(db, "leagues", leagueRef.id, "members", uid),
    { nickname: adminNick, joinedAt: serverTimestamp() },
    { merge: true }
  );

  localStorage.setItem("leagueId", leagueRef.id);
  localStorage.setItem("nickname", adminNick);
  currentLeagueId = leagueRef.id;

  $("createResult").textContent = `League created. Invite code: ${inviteCode}`;
  await loadLeague(leagueRef.id);
});

let unsubMatches = null;
let unsubLeague = null;

async function loadLeague(leagueId) {
  hide("screenLoading");
  hide("screenJoin");
  show("screenLeague");
  setTab("matches");

  const leagueRef = doc(db, "leagues", leagueId);

  if (unsubLeague) unsubLeague();
  unsubLeague = onSnapshot(leagueRef, (snap) => {
    if (!snap.exists()) {
      alert("League not found / no access.");
      localStorage.removeItem("leagueId");
      location.reload();
      return;
    }
    const league = snap.data();
    $("leagueTitle").textContent = league.name || "League";
    $("leagueCode").textContent = league.inviteCode || "—";

    const isAdmin = league.adminUid === uid;
    $("tabAdmin").classList.toggle("hidden", !isAdmin);
    if (!isAdmin) hide("panelAdmin");
  });

  const matchesQuery = query(
    collection(db, "leagues", leagueId, "matches"),
    orderBy("startTime", "asc")
  );

  if (unsubMatches) unsubMatches();
  unsubMatches = onSnapshot(matchesQuery, (snap) => {
    const matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderMatches(leagueId, matches);
    renderAdminMatches(leagueId, matches);
  });

  $("startTime").value = toLocalDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000));
}

async function renderMatches(leagueId, matches) {
  const wrap = $("matchesList");
  wrap.innerHTML = "";

  if (matches.length === 0) {
    wrap.innerHTML = `<div class="muted">No matches yet.</div>`;
    return;
  }

  for (const m of matches) {
    const start = m.startTime?.toDate ? m.startTime.toDate() : null;
    const locked = start ? new Date() >= start : false;
    const completed = !!m.winner;

    const voteRef = doc(db, "leagues", leagueId, "matches", m.id, "votes", uid);
    const voteSnap = await getDoc(voteRef);
    const myPick = voteSnap.exists() ? voteSnap.data().pick : null;

    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <h4>${m.teamA} vs ${m.teamB}</h4>
      <div class="muted">
        Start: ${start ? start.toLocaleString() : "—"} •
        ${completed ? "Completed" : locked ? "Locked" : "Open"}
      </div>

      <div class="pills" style="margin-top:10px;">
        <div class="pill ${myPick === "A" ? "active" : ""}" data-pick="A">${m.teamA}</div>
        <div class="pill ${myPick === "B" ? "active" : ""}" data-pick="B">${m.teamB}</div>
      </div>

      <div style="margin-top:10px;">
        ${completed ? `<b>Winner:</b> ${m.winner === "A" ? m.teamA : m.teamB}` : ""}
        ${completed && myPick ? `<div><b>Your result:</b> ${myPick === m.winner ? "✅ +1" : "❌ 0"}</div>` : ""}
        ${!completed && locked ? `<div class="muted">Voting closed.</div>` : ""}
      </div>
    `;

    item.querySelectorAll(".pill").forEach((p) => {
      p.addEventListener("click", async () => {
        if (locked) return alert("Voting is locked for this match.");
        if (completed) return alert("Match already completed.");

        const pick = p.dataset.pick; // "A" or "B"
        try {
          await setDoc(voteRef, { pick, votedAt: serverTimestamp() }, { merge: true });
        } catch (e) {
          alert("Could not save vote (match may have started).");
          console.error(e);
        }
      });
    });

    wrap.appendChild(item);
  }
}

// Admin: add match
$("btnAddMatch").addEventListener("click", async () => {
  const A = $("teamA").value.trim();
  const B = $("teamB").value.trim();
  const startLocal = $("startTime").value;

  if (!A || !B || !startLocal) return alert("Enter teams and start time.");

  try {
    await addDoc(collection(db, "leagues", currentLeagueId, "matches"), {
      teamA: A,
      teamB: B,
      startTime: parseDateTimeLocalToTimestamp(startLocal),
      winner: null,
      createdAt: serverTimestamp(),
    });
    $("teamA").value = "";
    $("teamB").value = "";
  } catch (e) {
    alert("Failed to add match. (Admin-only)");
    console.error(e);
  }
});

// Admin: set winner UI
function renderAdminMatches(leagueId, matches) {
  const wrap = $("adminMatchesList");
  wrap.innerHTML = "";

  if (matches.length === 0) {
    wrap.innerHTML = `<div class="muted">No matches yet.</div>`;
    return;
  }

  for (const m of matches) {
    const start = m.startTime?.toDate ? m.startTime.toDate() : null;

    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <h4>${m.teamA} vs ${m.teamB}</h4>
      <div class="muted">Start: ${start ? start.toLocaleString() : "—"}</div>

      <div class="pills" style="margin-top:10px;">
        <div class="pill ${m.winner === "A" ? "active" : ""}" data-win="A">Winner: ${m.teamA}</div>
        <div class="pill ${m.winner === "B" ? "active" : ""}" data-win="B">Winner: ${m.teamB}</div>
        <div class="pill ${m.winner === null ? "active" : ""}" data-win="NONE">Clear</div>
      </div>
    `;

    const matchRef = doc(db, "leagues", leagueId, "matches", m.id);
    item.querySelectorAll(".pill").forEach((p) => {
      p.addEventListener("click", async () => {
        const w = p.dataset.win;
        try {
          await updateDoc(matchRef, { winner: w === "NONE" ? null : w });
        } catch (e) {
          alert("Failed to set winner. (Admin-only)");
          console.error(e);
        }
      });
    });

    wrap.appendChild(item);
  }
}

// Leaderboard
$("btnRefreshLeaderboard").addEventListener("click", async () => {
  await refreshLeaderboard(currentLeagueId);
});

async function refreshLeaderboard(leagueId) {
  const lb = $("leaderboardList");
  lb.innerHTML = `<div class="muted">Calculating…</div>`;

  const membersSnap = await getDocs(collection(db, "leagues", leagueId, "members"));
  const members = membersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));

  const matchesSnap = await getDocs(
    query(collection(db, "leagues", leagueId, "matches"), orderBy("startTime", "asc"))
  );
  const matches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const points = {};
  members.forEach((m) => (points[m.uid] = 0));

  for (const match of matches) {
    if (!match.winner) continue;

    const votesSnap = await getDocs(
      collection(db, "leagues", leagueId, "matches", match.id, "votes")
    );
    votesSnap.docs.forEach((v) => {
      if (v.data().pick === match.winner) {
        points[v.id] = (points[v.id] || 0) + 1;
      }
    });
  }

  const rows = members
    .map((m) => ({
      nickname: m.nickname || m.uid.slice(0, 6),
      score: points[m.uid] || 0,
    }))
    .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));

  lb.innerHTML = "";
  if (rows.length === 0) {
    lb.innerHTML = `<div class="muted">No members yet.</div>`;
    return;
  }

  rows.forEach((r, idx) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `<h4>#${idx + 1} ${r.nickname}</h4><div><b>${r.score}</b> point(s)</div>`;
    lb.appendChild(item);
  });
}

// Tabs
$("tabMatches").addEventListener("click", () => setTab("matches"));
$("tabLeaderboard").addEventListener("click", async () => {
  setTab("leaderboard");
  await refreshLeaderboard(currentLeagueId);
});
$("tabAdmin").addEventListener("click", () => setTab("admin"));

boot().catch(console.error);
