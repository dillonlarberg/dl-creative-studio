// functions/src/template.ts
import * as functions from "firebase-functions";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const MODEL = "gemini-2.0-flash";

// ── synthesizeRequirementsAI ──────────────────────────────────────────────────
// Input:  { brief: string, channel: string, brand: { primaryColor?: string, fontPrimary?: string } | null }
// Output: RequirementField[]
export const synthesizeRequirementsAI = functions
  .runWith({ secrets: ["GEMINI_API_KEY"], timeoutSeconds: 60, memory: "256MB" })
  .https.onCall(async (data: {
    brief: string;
    channel: string;
    brand: { primaryColor?: string; fontPrimary?: string } | null;
  }) => {
    if (!data.channel) throw new functions.https.HttpsError("invalid-argument", "channel is required");
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new functions.https.HttpsError("internal", "GEMINI_API_KEY secret is not configured");
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              id:       { type: SchemaType.STRING },
              label:    { type: SchemaType.STRING },
              category: { type: SchemaType.STRING },
              source:   { type: SchemaType.STRING },
              type:     { type: SchemaType.STRING },
            },
            required: ["id", "label", "category", "source", "type"],
          },
        },
      },
    });

    const prompt = `You are a creative technologist building ad templates. Given a creative brief, target channel, and brand context, determine what data fields the template needs.

Brief: "${data.brief || '(no brief provided)'}"
Channel: "${data.channel}"
Brand primary color: "${data.brand?.primaryColor ?? 'unknown'}"
Brand font: "${data.brand?.fontPrimary ?? 'Inter'}"

Return a JSON array of required fields. Rules:
- id: snake_case identifier (e.g. "headline", "product_image", "sale_price")
- label: human-readable label (e.g. "Headline", "Product Image", "Sale Price")
- category: exactly one of "Brand" (from brand kit), "Dynamic" (from feed), "System" (user preset)
- source: exactly one of "Feed", "Creative House", "User Preset"
- type: exactly one of "text", "image", "currency", "button", "asset"

Always include:
- { id: "headline", label: "Headline", category: "Dynamic", source: "Feed", type: "text" }
- { id: "logo", label: "Brand Logo", category: "Brand", source: "Creative House", type: "asset" }

Also include if channel is Social or Programmatic:
- { id: "image_url", label: "Product Image", category: "Dynamic", source: "Feed", type: "image" }
- { id: "cta", label: "Call to Action", category: "System", source: "User Preset", type: "button" }

Also include if brief mentions product, sale, deal, price, shop, or buy (or brief is empty):
- { id: "price", label: "Price", category: "Dynamic", source: "Feed", type: "currency" }`;

    let text: string;
    try {
      const result = await model.generateContent(prompt);
      text = result.response.text();
    } catch (err) {
      throw new functions.https.HttpsError("internal", `Gemini call failed: ${(err as Error).message}`);
    }
    try {
      return JSON.parse(text) as unknown[];
    } catch {
      throw new functions.https.HttpsError("internal", `AI returned unparseable response: ${text.slice(0, 200)}`);
    }
  });

// ── generateLayoutsAI ────────────────────────────────────────────────────────
// Input:  { requirements: RequirementField[], channel: string, brand: { primaryColor?, fontPrimary?, cornerRadius?, logoPrimary? } | null }
// Output: Candidate[] (exactly 3)
export const generateLayoutsAI = functions
  .runWith({ secrets: ["GEMINI_API_KEY"], timeoutSeconds: 60, memory: "256MB" })
  .https.onCall(async (data: {
    requirements: Array<{ id: string; type: string; category: string }>;
    channel: string;
    brand: { primaryColor?: string; fontPrimary?: string; cornerRadius?: string; logoPrimary?: string } | null;
  }) => {
    if (!data.channel) throw new functions.https.HttpsError("invalid-argument", "channel is required");
    if (!Array.isArray(data.requirements)) throw new functions.https.HttpsError("invalid-argument", "requirements must be an array");
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new functions.https.HttpsError("internal", "GEMINI_API_KEY secret is not configured");
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              id:          { type: SchemaType.STRING },
              name:        { type: SchemaType.STRING },
              variant:     { type: SchemaType.STRING },
              description: { type: SchemaType.STRING },
              strategy:    { type: SchemaType.STRING },
              styles: {
                type: SchemaType.OBJECT,
                properties: {
                  primaryColor:    { type: SchemaType.STRING },
                  fontFamily:      { type: SchemaType.STRING },
                  borderRadius:    { type: SchemaType.STRING },
                  shadow:          { type: SchemaType.STRING },
                  gradient:        { type: SchemaType.STRING },
                  accentRotation:  { type: SchemaType.STRING },
                },
                required: ["primaryColor", "fontFamily"],
              },
              elements: {
                type: SchemaType.OBJECT,
                properties: {
                  headline: { type: SchemaType.BOOLEAN },
                  price:    { type: SchemaType.BOOLEAN },
                  image:    { type: SchemaType.BOOLEAN },
                  cta:      { type: SchemaType.BOOLEAN },
                  logo:     { type: SchemaType.BOOLEAN },
                },
                required: ["headline", "price", "image", "cta", "logo"],
              },
            },
            required: ["id", "name", "variant", "description", "strategy", "styles", "elements"],
          },
        },
      },
    });

    const color  = data.brand?.primaryColor ?? "#2563eb";
    const font   = data.brand?.fontPrimary  ?? "Inter";
    const radius = data.brand?.cornerRadius ?? "12px";

    const hasHeadline = data.requirements.some((r) => r.id === "headline");
    const hasPrice    = data.requirements.some((r) => r.id === "price" || r.type === "currency");
    const hasImage    = data.requirements.some((r) => r.type === "image");
    const hasLogo     = data.requirements.some((r) => r.category === "Brand");
    const hasCTA      = data.requirements.some((r) => r.type === "button");

    const prompt = `You are a visual ad creative director. Propose exactly 3 distinct layout candidates for a ${data.channel} ad template.

Brand color: "${color}", font: "${font}", border radius: "${radius}"
Required elements — headline: ${hasHeadline}, image: ${hasImage}, price: ${hasPrice}, cta: ${hasCTA}, logo: ${hasLogo}

Return exactly 3 candidates. Each must be meaningfully different (e.g. editorial, bold/high-contrast, minimal/premium).

For each:
- id: kebab-case unique identifier
- name: creative 2-3 word name
- variant: one of "grid", "stacked", "wide", "minimal"
- description: 1 sentence describing the visual approach
- strategy: 1 sentence on when/why to use it (campaign type, audience)
- styles.primaryColor: use "${color}"
- styles.fontFamily: use "${font}"
- styles.borderRadius: use "${radius}" (or "0px" for a bold variant)
- styles.shadow: optional box-shadow CSS string (omit for minimal)
- styles.gradient: optional CSS gradient using "${color}" (omit for minimal)
- styles.accentRotation: optional slight skew like "-2deg" (bold variant only)
- elements.headline: ${hasHeadline}
- elements.price: ${hasPrice}
- elements.image: ${hasImage}
- elements.cta: ${hasCTA}
- elements.logo: ${hasLogo}`;

    let text: string;
    try {
      const result = await model.generateContent(prompt);
      text = result.response.text();
    } catch (err) {
      throw new functions.https.HttpsError("internal", `Gemini call failed: ${(err as Error).message}`);
    }
    try {
      return JSON.parse(text) as unknown[];
    } catch {
      throw new functions.https.HttpsError("internal", `AI returned unparseable response: ${text.slice(0, 200)}`);
    }
  });

// ── suggestMappingsAI ────────────────────────────────────────────────────────
// Input:  { requirements: RequirementField[], feedColumns: string[] }
// Output: Record<string, string>  (fieldId → columnName)
export const suggestMappingsAI = functions
  .runWith({ secrets: ["GEMINI_API_KEY"], timeoutSeconds: 30, memory: "256MB" })
  .https.onCall(async (data: {
    requirements: Array<{ id: string; label: string; category: string; type: string }>;
    feedColumns: string[];
  }) => {
    if (data.feedColumns.length === 0) return {};

    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new functions.https.HttpsError("internal", "GEMINI_API_KEY secret is not configured");
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {},
        },
      },
    });

    const mappable = data.requirements.filter(
      (r) => r.category === "Dynamic" && r.type !== "button" && r.type !== "asset"
    );
    if (mappable.length === 0) return {};

    const prompt = `You are a data mapping assistant for ad templates.

Template fields to map (Dynamic fields only, no buttons or assets):
${JSON.stringify(mappable.map((r) => ({ id: r.id, label: r.label, type: r.type })))}

Available feed columns:
${JSON.stringify(data.feedColumns)}

Map each template field ID to the most semantically appropriate feed column name.
Return a flat JSON object: { "fieldId": "columnName" }
Only include fields you are confident about. Skip fields with no good match.
Example output: { "headline": "product_title", "image_url": "image_link", "price": "final_price" }`;

    let text: string;
    try {
      const result = await model.generateContent(prompt);
      text = result.response.text();
    } catch (err) {
      throw new functions.https.HttpsError("internal", `Gemini call failed: ${(err as Error).message}`);
    }
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new functions.https.HttpsError("internal", `AI returned unparseable response: ${text.slice(0, 200)}`);
    }

    const safe: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string") safe[k] = v;
    }
    return safe;
  });
