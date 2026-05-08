// Vanilla JS, no framework. Module mode for top-level await.

const fileInput = document.getElementById("file");
const targetSelect = document.getElementById("target");
const qualitySelect = document.getElementById("quality");
const runBtn = document.getElementById("run-btn");
const runForm = document.getElementById("run-form");
const runStatus = document.getElementById("run-status");
const cardsEl = document.getElementById("cards");
const sourceListEl = document.getElementById("source-list");
const cardTpl = document.getElementById("card-template");

const sourceGroups = new Map(); // sourceFilename -> [cardEl,...]

async function loadTargets() {
  const r = await fetch("/api/targets");
  const targets = await r.json();
  // Group by channel into <optgroup>s, preserving server order within each group.
  const byChannel = new Map();
  for (const t of targets) {
    const ch = t.channel || "Other";
    if (!byChannel.has(ch)) byChannel.set(ch, []);
    byChannel.get(ch).push(t);
  }
  for (const [channel, items] of byChannel) {
    const grp = document.createElement("optgroup");
    grp.label = channel;
    for (const t of items) {
      const opt = document.createElement("option");
      opt.value = t.label;
      opt.textContent = t.display;
      grp.appendChild(opt);
    }
    targetSelect.appendChild(grp);
  }
}

function refreshRunButton() {
  runBtn.disabled = !(fileInput.files && fileInput.files[0] && targetSelect.value);
}

fileInput.addEventListener("change", refreshRunButton);
targetSelect.addEventListener("change", refreshRunButton);

runForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const file = fileInput.files && fileInput.files[0];
  if (!file || !targetSelect.value) return;

  runBtn.disabled = true;
  runStatus.className = "status pending";
  runStatus.textContent = "Running pipeline...";

  const fd = new FormData();
  fd.append("file", file);
  fd.append("targetLabel", targetSelect.value);
  fd.append("quality", qualitySelect.value || "medium");

  try {
    const resp = await fetch("/api/run", { method: "POST", body: fd });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || `HTTP ${resp.status}`);
    }
    addCard(data, file.name);
    runStatus.className = "status ok";
    runStatus.textContent = `Done in ${data.timings.p1Ms + data.timings.p2Ms} ms.`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    runStatus.className = "status error";
    runStatus.textContent = `Error: ${err.message}`;
  } finally {
    runBtn.disabled = false;
    refreshRunButton();
  }
});

function addCard(data, sourceName) {
  const node = cardTpl.content.firstElementChild.cloneNode(true);

  node.querySelector(".src").textContent = sourceName;
  node.querySelector(".target").textContent = data.targetDisplay || data.targetLabel;
  node.querySelector(".quality").textContent = `quality ${data.p2Quality || "medium"}`;
  node.querySelector(".timings").textContent = `P1 ${data.timings.p1Ms}ms / P2 ${data.timings.p2Ms}ms`;
  node.querySelector(".run-id").textContent = data.runId;

  node.querySelector(".img-source").src = data.sourceUrl;
  node.querySelector(".img-mask").src = data.p2MaskUrl;
  node.querySelector(".img-raw").src = data.p2RawUrl;
  node.querySelector(".img-final").src = data.p2FinalUrl;
  node.querySelector(".p1-json").textContent = JSON.stringify(data.p1, null, 2);

  node.id = `card-${data.runId}`;
  node.dataset.source = sourceName;

  wireCritiqueForm(node, data, sourceName);

  cardsEl.prepend(node);
  registerSource(sourceName, node);
}

function registerSource(name, cardEl) {
  if (!sourceGroups.has(name)) {
    sourceGroups.set(name, []);
    const li = document.createElement("li");
    li.textContent = name;
    li.addEventListener("click", () => {
      const first = sourceGroups.get(name)[0];
      if (first) first.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    sourceListEl.appendChild(li);
  }
  sourceGroups.get(name).unshift(cardEl);
}

function wireCritiqueForm(card, data, sourceName) {
  const form = card.querySelector(".critique-form");
  const status = card.querySelector(".save-status");
  const saveBtn = card.querySelector(".save-btn");

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();

    const fd = new FormData(form);
    const verdict = fd.get("verdict");
    const subjectPreserved = fd.get("subjectPreserved");
    const copyIntact = fd.get("copyIntact");
    const styleMatch = fd.get("styleMatch");
    if (!verdict || !subjectPreserved || !copyIntact || !styleMatch) {
      status.className = "save-status error";
      status.textContent = "Fill all required fields.";
      return;
    }

    const failureTags = fd.getAll("failureTags").map((v) => String(v));
    const notes = String(fd.get("notes") || "");

    const entry = {
      runId: data.runId,
      timestamp: new Date().toISOString(),
      source: sourceName,
      targetSpec: data.targetLabel,
      p2Model: data.p2Model,
      p2Quality: data.p2Quality || "medium",
      p2OutputPath: data.p2OutputPath,
      timings: data.timings,
      critique: {
        verdict: String(verdict),
        subjectPreserved: String(subjectPreserved),
        copyIntact: String(copyIntact),
        styleMatch: Number(styleMatch),
        failureTags,
        notes,
      },
    };

    saveBtn.disabled = true;
    status.className = "save-status pending";
    status.textContent = "Saving...";
    try {
      const resp = await fetch("/api/critique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      const respBody = await resp.json();
      if (!resp.ok) throw new Error(respBody.error || `HTTP ${resp.status}`);
      status.className = "save-status ok";
      status.textContent = "Saved.";
    } catch (err) {
      status.className = "save-status error";
      status.textContent = `Error: ${err.message}`;
    } finally {
      saveBtn.disabled = false;
    }
  });
}

loadTargets().catch((err) => {
  runStatus.className = "status error";
  runStatus.textContent = `Failed to load targets: ${err.message}`;
});
