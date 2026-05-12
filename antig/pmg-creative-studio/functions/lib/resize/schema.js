"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.P1_RESPONSE_SCHEMA = exports.P1OutputSchema = void 0;
// MAINTAINED IN PARALLEL with tools/resize-tracer/src/schema.ts — see TODO(resize-pipeline-extract).
const zod_1 = require("zod");
exports.P1OutputSchema = zod_1.z.object({
    subjectDescription: zod_1.z.string(),
    subjectLocation: zod_1.z.enum([
        "upper-left",
        "upper-center",
        "upper-right",
        "center-left",
        "center",
        "center-right",
        "lower-left",
        "lower-center",
        "lower-right",
    ]),
    subjectBbox: zod_1.z.tuple([zod_1.z.number(), zod_1.z.number(), zod_1.z.number(), zod_1.z.number()]),
    copyRegions: zod_1.z.array(zod_1.z.object({
        text: zod_1.z.string(),
        location: zod_1.z.string(),
    })),
    styleCues: zod_1.z.array(zod_1.z.string()),
    extensionDirective: zod_1.z.string(),
});
exports.P1_RESPONSE_SCHEMA = {
    type: "object",
    properties: {
        subjectDescription: { type: "string" },
        subjectLocation: {
            type: "string",
            enum: [
                "upper-left",
                "upper-center",
                "upper-right",
                "center-left",
                "center",
                "center-right",
                "lower-left",
                "lower-center",
                "lower-right",
            ],
        },
        subjectBbox: {
            type: "array",
            items: { type: "number" },
            minItems: 4,
            maxItems: 4,
        },
        copyRegions: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    text: { type: "string" },
                    location: { type: "string" },
                },
                required: ["text", "location"],
            },
        },
        styleCues: {
            type: "array",
            items: { type: "string" },
        },
        extensionDirective: { type: "string" },
    },
    required: [
        "subjectDescription",
        "subjectLocation",
        "subjectBbox",
        "copyRegions",
        "styleCues",
        "extensionDirective",
    ],
};
//# sourceMappingURL=schema.js.map