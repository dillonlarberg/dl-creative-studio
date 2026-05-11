"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeRunId = makeRunId;
// MAINTAINED IN PARALLEL with tools/resize-tracer/src/runId.ts — see TODO(resize-pipeline-extract).
const node_crypto_1 = require("node:crypto");
function makeRunId(fixtureBasename, targetLabel) {
    const iso = new Date().toISOString().replace(/:/g, "-").replace(/Z$/, "");
    const random = (0, node_crypto_1.randomBytes)(2).toString("hex");
    const safeFixture = fixtureBasename.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeTarget = targetLabel.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `${iso}-${random}-${safeFixture}-${safeTarget}`;
}
//# sourceMappingURL=runId.js.map