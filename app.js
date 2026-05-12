const sessions = [
  { name: "Sydney", city: "Australia", open: 21, close: 6 },
  { name: "Tokyo", city: "Japan", open: 0, close: 9 },
  { name: "London", city: "United Kingdom", open: 8, close: 17 },
  { name: "New York", city: "United States", open: 13, close: 22 }
];

const pairPlaybook = {
  Sydney: ["AUD/USD", "AUD/JPY", "NZD/USD"],
  Tokyo: ["USD/JPY", "EUR/JPY", "AUD/JPY"],
  London: ["EUR/USD", "GBP/USD", "EUR/GBP"],
  "New York": ["EUR/USD", "USD/CAD", "XAU/USD"]
};

const grid = document.querySelector("#session-grid");
const localTime = document.querySelector("#local-time");
const activeSummary = document.querySelector("#active-summary");
const nextChange = document.querySelector("#next-change");
const pairHeading = document.querySelector("#pair-heading");
const pairList = document.querySelector("#pair-list");
const alertButton = document.querySelector("#alert-button");
const alertCopy = document.querySelector("#alert-copy");

let alertsEnabled = localStorage.getItem("fx-session-alerts") === "enabled";
const firedAlerts = new Set();

function minutesFromUtcMidnight(date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function sessionBounds(session, date) {
  const nowMinutes = minutesFromUtcMidnight(date);
  const open = session.open * 60;
  let close = session.close * 60;
  if (close <= open) {
    close += 24 * 60;
  }

  let current = nowMinutes;
  if (session.close <= session.open && nowMinutes < session.close * 60) {
    current += 24 * 60;
  }

  const isOpen = current >= open && current < close;
  const next = isOpen ? close - current : current < open ? open - current : open + 24 * 60 - current;
  const elapsed = isOpen ? current - open : 0;
  const duration = close - open;

  return { isOpen, next, elapsed, duration };
}

function formatCountdown(minutes) {
  const totalSeconds = Math.max(0, Math.floor(minutes * 60 - new Date().getUTCSeconds()));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const mins = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const secs = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${mins}:${secs}`;
}

function utcRange(session) {
  return `${String(session.open).padStart(2, "0")}:00-${String(session.close).padStart(2, "0")}:00 UTC`;
}

function updatePairs(active) {
  const source = active.length ? active : [sessions[0]];
  const pairs = [...new Set(source.flatMap((session) => pairPlaybook[session.name] || []))];
  pairHeading.textContent = active.length ? "Session watchlist" : "Next watchlist";
  pairList.innerHTML = pairs.map((pair) => `<span>${pair}</span>`).join("");
}

function updateAlertUi() {
  const supported = "Notification" in window;
  alertButton.disabled = !supported || Notification.permission === "denied";
  alertButton.textContent = alertsEnabled ? "Alerts enabled" : "Enable alerts";

  if (!supported) {
    alertCopy.textContent = "This browser does not support session notifications.";
  } else if (Notification.permission === "denied") {
    alertCopy.textContent = "Notifications are blocked in your browser settings.";
  } else if (alertsEnabled) {
    alertCopy.textContent = "You will get a browser notification near each major session open.";
  } else {
    alertCopy.textContent = "Get a browser notification shortly before a major session opens.";
  }
}

async function enableAlerts() {
  if (!("Notification" in window)) {
    updateAlertUi();
    return;
  }

  const permission = Notification.permission === "default"
    ? await Notification.requestPermission()
    : Notification.permission;
  alertsEnabled = permission === "granted";
  localStorage.setItem("fx-session-alerts", alertsEnabled ? "enabled" : "disabled");
  updateAlertUi();
}

function maybeSendAlerts(states) {
  if (!alertsEnabled || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  for (const session of states) {
    const alertKey = `${session.name}-${new Date().toISOString().slice(0, 10)}-${session.open}`;
    if (!session.isOpen && session.next <= 5 && !firedAlerts.has(alertKey)) {
      firedAlerts.add(alertKey);
      new Notification(`${session.name} opens soon`, {
        body: `${session.name} session opens in ${formatCountdown(session.next)}. Watch ${pairPlaybook[session.name].join(", ")}.`,
        icon: "icon.svg"
      });
    }
  }
}

function render() {
  const now = new Date();
  localTime.textContent = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const states = sessions.map((session) => ({
    ...session,
    ...sessionBounds(session, now)
  }));
  const active = states.filter((session) => session.isOpen);
  const nextMinutes = Math.min(...states.map((session) => session.next));

  activeSummary.textContent = active.length
    ? active.map((session) => session.name).join(" + ")
    : "Markets between major sessions";
  nextChange.textContent = formatCountdown(nextMinutes);
  updatePairs(active);
  maybeSendAlerts(states);

  grid.innerHTML = states.map((session) => {
    const progress = session.isOpen ? Math.min(100, Math.round((session.elapsed / session.duration) * 100)) : 0;
    const label = session.isOpen ? "Open" : "Closed";
    const clockLabel = session.isOpen ? "Closes in" : "Opens in";

    return `
      <article class="session-card ${session.isOpen ? "open" : ""}">
        <div class="session-name">
          <div>
            <h3>${session.name}</h3>
            <span>${session.city}</span>
          </div>
          <span class="pill">${label}</span>
        </div>
        <div>
          <span>${clockLabel}</span>
          <div class="session-clock">${formatCountdown(session.next)}</div>
        </div>
        <div>
          <span>${utcRange(session)}</span>
          <div class="progress" aria-hidden="true"><div style="width: ${progress}%"></div></div>
        </div>
      </article>
    `;
  }).join("");
}

render();
updateAlertUi();
setInterval(render, 1000);
alertButton.addEventListener("click", enableAlerts);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}
