# PMG Creative Automation Tool — Project Overview

> **Project Owner:** Dillon (Chief of Staff to CEO, PMG)
> **Started:** 2026-02-24
> **Status:** Planning Phase — Requirements Gathering

---

## What Is This?

A modular, self-serve creative automation tool for PMG teams (media & creative). Built on Firebase, integrated with Alli (PMG's proprietary data/marketing platform), and designed to guide users through process-driven creative workflows.

### Core Principle
**Modularity first** — the POC establishes the process, the architecture, and the vision. Individual capabilities (e.g., image generation model, video editing API) can be refined/swapped as AI evolves.

---

## The Problem

PMG currently has **no creative automation tools**. Creative work (resizing, editing, templating, new asset creation) is manual and fragmented. There is no unified process for teams to self-serve creative needs.

---

## Primary User Flow

### Step 1: Authenticate
Users sign in via Alli OIDC/SSO (simulated via Firebase in POC).

### Step 2: Select Client
Initial landing page allows selecting a client. Once selected, users can change the client at any time via the global side-drawer in the header ("alli | {Client} Change").

### Step 3: Creative Studio Dashboard
The focal point for all generative and optimization workflows.

---

## Use Cases (All Functional in POC)

| # | Use Case | Description |
|---|----------|-------------|
| 1 | **Image Resizing** | Take existing images and resize/reformat (e.g., 1×1 → 9×16) |
| 2 | **Edit Existing Images** | Modify images already in Alli/campaigns based on insights or needs |
| 3 | **Edit Existing Videos** | Modify videos already in Alli/campaigns |
| 4 | **Net New Image Generation** | Create brand-new static creative from scratch |
| 5 | **Net New Video Generation** | Create brand-new video creative from scratch |
| 6 | **Dynamic Versioning (Product Feed Templating)** | HTML templates + product feed images → styled dynamic product ads |
| 7 | **Template Creation & Editing** | Create and manage HTML templates for dynamic versioning |
| 8 | **Client Asset House** | Store and manage brand assets (logos, colors, fonts) per client. **Mandatory standards block creative workflows until defined.** |

---

## Output Formats

- **JPEG** — static image outputs
- **HTML** — template outputs (for dynamic versioning)
- **MP4** — video outputs

---

## Tech Stack (Planned)

| Component | Technology |
|-----------|------------|
| **Hosting / Backend** | Firebase |
| **Data Source** | Alli (PMG proprietary — API access) |
| **Design System** | Alli Design System (Figma / GitHub) |
| **AI / Integrations** | MCPs, various APIs (TBD per use case) |
| **Frontend** | TBD |

---

## Key Context

- **PMG** is a digital marketing company servicing Fortune 1000 brands
- **Alli** is PMG's proprietary platform: ingests marketing data → normalizes → cleans → stitches → serves via apps (generative dashboards, workflows, etc.)
- **Alli Workflows** = Zapier/n8n-like automation within Alli (connected node structure)
- **All Alli capabilities are available via API**
- **Alli Design System** exists in Figma and GitHub — to be used for UI consistency
- **Client Asset House** is stored in Firebase and shared across all PMG users for a given client
- This tool is a **POC/proof of concept** — meant to demonstrate vision, process, and modularity to PMG's tech team and broader org

---

## Planning Questions Log

### Q1: Use Case Prioritization
**Asked:** Which use cases should be fully functional vs. stubbed?
**Answer:** All should be fully functional. Depth can vary — focus on low-hanging fruit for each to bring the POC to life. API keys and integrations can be obtained quickly. Build into all to show the vision.

### Q2: Users & Roles
**Asked:** Who are the primary users? Different access levels? Approval flows? Client-facing?
**Answer:**
- **Primary users are non-creative teams** (media, strategy, etc.) — this is about democratizing creative tools
- Creative-driven processes will still exist separately; this tool is for scaling as AI improves
- **Guardrails are important** — users shouldn't be able to produce bad-looking creative
- **Approval flow required** before downloading/finalizing assets
- **AI Review concept:** Generate many versions (e.g., 100) → AI filters to top candidates (e.g., 10) → human picks final 2–3. More expensive but demonstrates art of the possible
- **Internal PMG users for now**, but any user should be able to navigate it in plain human terms
- **UX must be intuitive** — e.g., in product feed templating, users should be able to:
  - Connect to a feed during/after template design to preview
  - See edge cases like shortest/longest product titles in their template
- Primarily internal because only internal users are in Alli today, but tool should be universally understandable

---

## Design Principles (Emerging)

1. **Democratize creative** — non-creative teams should feel empowered, not intimidated
2. **Guardrails over freedom** — constrain outputs to prevent bad creative
3. **AI as curator** — use AI to filter/review outputs before human decision
4. **Plain language UX** — no jargon, no assumptions about user skill level
5. **Preview everything** — show users what things will look like before committing (edge cases included)
6. **Process-oriented** — guide users step-by-step; teach the org the right workflow
7. **Modular & upgradeable** — swap AI models/APIs as tech improves without rebuilding

---

### Q3: *(Next)*
