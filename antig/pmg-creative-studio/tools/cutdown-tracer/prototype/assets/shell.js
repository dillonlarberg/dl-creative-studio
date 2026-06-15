/* Shared app chrome for the Cutdown V1 prototype.
 *
 * Injects the persistent Alli platform header + the page header (back link,
 * title, subtitle) + the numbered StepIndicator — so every page is identical
 * and pages only author their own <main> content. Mirrors:
 *   - src/components/AppLayout.tsx  (60px white header, #EEF1F7 shell)
 *   - src/apps/ad-resizing/components/StepIndicator.tsx (numbered stepper)
 *
 * Usage in a page (after theme.js + this file):
 *   <div id="chrome"></div>
 *   <div class="mx-auto max-w-[1100px] px-8 pt-8 pb-16">
 *     <div id="pagehead"></div>
 *     ...page content...
 *   </div>
 *   <script>Shell.mount({ step: 1, title: "Source", subtitle: "...", back: { href: "index.html", label: "Cutdown home" } });</script>
 */
(function () {
  const STEPS = [
    { id: "source", label: "Source", href: "01-source.html" },
    { id: "music", label: "Music", href: "02-music.html" },
    { id: "brief", label: "Brief", href: "03-brief.html" },
    { id: "versions", label: "Versions", href: "04-generating.html" },
    { id: "render", label: "Render", href: "06-render.html" },
  ];

  const ICON = {
    arrowLeft:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-3.5 w-3.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/></svg>',
    check:
      '<svg viewBox="0 0 20 20" fill="currentColor" class="h-2.5 w-2.5 text-white"><path fill-rule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z" clip-rule="evenodd"/></svg>',
    help:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-5 w-5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.88 9.88a3 3 0 1 1 4.24 4.24c-.66.66-1.12 1.04-1.12 2.13M12 18.75h.008M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>',
    bell:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-5 w-5"><path stroke-linecap="round" stroke-linejoin="round" d="M14.85 21a3 3 0 0 1-5.7 0M5.27 18.6h13.46c1.36 0 2.18-1.5 1.45-2.64-.62-.96-1.18-2.06-1.18-3.2v-3.2a6 6 0 0 0-12 0v3.2c0 1.14-.56 2.24-1.18 3.2-.73 1.14.09 2.64 1.45 2.64Z"/></svg>',
  };

  // Reusable Heroicons "sparkles" (solid) symbol — referenced as
  // <svg><use href="#alli-sparkle"/></svg> by the Ask Alli pill + orbit cluster.
  const SPARKLE_DEFS =
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' +
    '<symbol id="alli-sparkle" viewBox="0 0 24 24" fill="currentColor">' +
    '<path fill-rule="evenodd" d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813A3.75 3.75 0 0 0 8.279 7.89l.813-2.846A.75.75 0 0 1 9 4.5Z" clip-rule="evenodd"/>' +
    '</symbol></svg>';

  function headerHTML() {
    return `
    <header class="fixed inset-x-0 top-0 z-30 flex h-[60px] items-center overflow-hidden border-b border-gray-200 bg-white">
      <a href="index.html" class="flex h-[60px] w-28 shrink-0 items-center justify-center">
        <img src="assets/logo.png" alt="alli" class="h-[22px] w-auto" />
      </a>
      <div class="h-7 w-px bg-gray-200"></div>
      <div class="ml-6 flex items-center gap-3">
        <span class="text-[13px] font-medium text-gray-900">Acme Athletic</span>
        <button type="button" class="text-[13px] font-medium text-blue-600 hover:text-blue-700">Change</button>
      </div>
      <div class="ml-auto flex items-center gap-1 pr-6">
        <button type="button" aria-label="Help" class="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">${ICON.help}</button>
        <button type="button" aria-label="Notifications" class="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">${ICON.bell}</button>
        <div class="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-[12px] font-semibold text-white">DE</div>
      </div>
    </header>`;
  }

  function stepperHTML(activeId) {
    const activeIdx = STEPS.findIndex((s) => s.id === activeId);
    return (
      '<div class="flex items-center">' +
      STEPS.map((step, i) => {
        const status = i < activeIdx ? "complete" : i === activeIdx ? "current" : "upcoming";
        const circleCls =
          status === "upcoming"
            ? "border border-gray-300 bg-white"
            : "bg-blue-600";
        const inner =
          status === "complete"
            ? ICON.check
            : `<span class="text-[10px] font-bold leading-none ${status === "upcoming" ? "text-gray-400" : "text-white"}">${i + 1}</span>`;
        const labelCls =
          status === "upcoming"
            ? "text-gray-400"
            : status === "current"
              ? "text-gray-900"
              : "text-gray-600";
        const clickable = status === "complete";
        const circle = `<div class="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${circleCls}">${inner}</div>`;
        const label = `<span class="text-[12px] font-medium leading-none ${labelCls} ${clickable ? "group-hover:text-blue-600" : ""}">${step.label}</span>`;
        const node = clickable
          ? `<a href="${step.href}" class="group flex items-center gap-1.5">${circle}${label}</a>`
          : `<div class="flex items-center gap-1.5">${circle}${label}</div>`;
        const line = i < STEPS.length - 1 ? '<div class="mx-3 h-px w-6 bg-gray-200"></div>' : "";
        return `<div class="flex items-center">${node}${line}</div>`;
      }).join("") +
      "</div>"
    );
  }

  function pageHeadHTML(opts) {
    const back = opts.back
      ? `<a href="${opts.back.href}" class="mb-3 inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700">${ICON.arrowLeft}${opts.back.label}</a>`
      : "";
    const subtitle = opts.subtitle
      ? `<p class="mt-0.5 text-[13px] text-gray-500">${opts.subtitle}</p>`
      : "";
    const stepper = opts.step
      ? `<div class="mb-6 mt-5">${stepperHTML(opts.step)}</div>`
      : "";
    return `
      ${back}
      <div class="flex items-start justify-between">
        <div>
          <h1 class="text-[20px] font-semibold text-gray-900">${opts.title}</h1>
          ${subtitle}
        </div>
        ${opts.headerRight || ""}
      </div>
      ${stepper}`;
  }

  window.Shell = {
    STEPS,
    ICON,
    mount(opts) {
      const chrome = document.getElementById("chrome");
      if (chrome) chrome.innerHTML = SPARKLE_DEFS + headerHTML();
      const head = document.getElementById("pagehead");
      if (head) head.innerHTML = pageHeadHTML(opts || {});
    },
  };
})();
