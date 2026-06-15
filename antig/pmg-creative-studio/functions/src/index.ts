import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import cors from "cors";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

admin.initializeApp();

const corsHandler = cors({ origin: true });
const GEMINI_MODEL = "gemini-2.5-flash";

// Export function groups from domain-specific modules
export * from "./alliProxy";
export * from "./ai";
export * from "./video";
export * from "./resize";
export * from "./datasources";
export * from "./template";
export * from "./cutdown";

// helloWorld doubles as the template AI proxy for dev until the 3 standalone
// Cloud Functions (synthesizeRequirementsAI, generateLayoutsAI, suggestMappingsAI
// in functions/src/template.ts) have their allUsers invoker IAM policy set by
// someone with functions.admin. GET requests return the health-check string as
// before; POST ?templateAI=<action> routes to Gemini.
export const helloWorld = functions
  .runWith({ secrets: ["GEMINI_API_KEY"] })
  .https.onRequest((request, response) => {
    return corsHandler(request, response, async () => {
      if (request.method === "OPTIONS") {
        response.status(204).send();
        return;
      }

      const action = request.query.templateAI as string | undefined;

      // Existing health-check behavior preserved
      if (!action || request.method === "GET") {
        functions.logger.info("Hello logs!", { structuredData: true });
        response.send("PMG Creative Studio Backend is running!");
        return;
      }

      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        response.status(500).json({ error: "GEMINI_API_KEY secret not configured" });
        return;
      }

      const genAI = new GoogleGenerativeAI(key);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = request.body as Record<string, any>;

      try {
        if (action === "synthesize") {
          const { brief, channel, brand } = body as {
            brief: string;
            channel: string;
            brand: { primaryColor?: string; fontPrimary?: string } | null;
          };
          if (!channel) { response.status(400).json({ error: "channel is required" }); return; }

          const model = genAI.getGenerativeModel({
            model: GEMINI_MODEL,
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

Brief: "${brief || "(no brief provided)"}"
Channel: "${channel}"
Brand primary color: "${brand?.primaryColor ?? "unknown"}"
Brand font: "${brand?.fontPrimary ?? "Inter"}"

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

          const result = await model.generateContent(prompt);
          response.json(JSON.parse(result.response.text()));

        } else if (action === "generateLayouts") {
          const { requirements, channel, brand, feedColumns, brief, wireframeCatalog, feedSampleRow } = body as {
            requirements: Array<{ id: string; type: string; category: string }>;
            channel: string;
            brand: { primaryColor?: string; fontPrimary?: string; cornerRadius?: string; logoPrimary?: string } | null;
            feedColumns?: string[];
            brief?: string;
            wireframeCatalog?: Array<{
              id: string;
              name: string;
              description: string;
              bestFor: string;
              slots: string[];
              imageCount: number;
              hasLogo: boolean;
              hasBackground: boolean;
              hasCTA: boolean;
              hasPrice: boolean;
            }>;
            feedSampleRow?: Record<string, string> | null;
          };
          if (!channel) { response.status(400).json({ error: "channel is required" }); return; }
          if (!Array.isArray(requirements)) { response.status(400).json({ error: "requirements must be an array" }); return; }

          const color  = brand?.primaryColor ?? "#2563eb";
          const font   = brand?.fontPrimary  ?? "Inter";
          const radius = brand?.cornerRadius ?? "12px";
          const hasHeadline = requirements.some((r) => r.id === "headline");
          const hasPrice    = requirements.some((r) => r.id === "price" || r.type === "currency");
          const imageCount  = requirements.filter((r) => r.type === "image").length;
          const hasLogo     = requirements.some((r) => r.category === "Brand");
          const hasCTA      = requirements.some((r) => r.type === "button");
          const cols        = feedColumns ?? [];
          const catalog     = wireframeCatalog ?? [];
          const validIds    = catalog.map((w) => w.id);

          if (catalog.length === 0) {
            response.status(400).json({ error: "wireframeCatalog is required for generateLayouts" });
            return;
          }

          const model = genAI.getGenerativeModel({
            model: GEMINI_MODEL,
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    id:          { type: SchemaType.STRING },
                    name:        { type: SchemaType.STRING },
                    wireframeId: { type: SchemaType.STRING },
                    variant:     { type: SchemaType.STRING },
                    description: { type: SchemaType.STRING },
                    strategy:    { type: SchemaType.STRING },
                    styles: {
                      type: SchemaType.OBJECT,
                      properties: {
                        primaryColor:   { type: SchemaType.STRING },
                        fontFamily:     { type: SchemaType.STRING },
                        borderRadius:   { type: SchemaType.STRING },
                        shadow:         { type: SchemaType.STRING },
                        gradient:       { type: SchemaType.STRING },
                        accentRotation: { type: SchemaType.STRING },
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
                    suggestedZoneStylesJson: { type: SchemaType.STRING },
                  },
                  required: ["id", "name", "wireframeId", "variant", "description", "strategy", "styles", "elements"],
                },
              },
            },
          });

          const catalogJson = JSON.stringify(catalog, null, 2);
          const validIdsStr = validIds.join(", ");

          const feedSampleSection = feedSampleRow && Object.keys(feedSampleRow).length > 0
            ? `\nSample feed row (real product data — use these values to write concrete, realistic zone style suggestions):\n${JSON.stringify(feedSampleRow, null, 2)}\n`
            : "";

          const prompt = `You are a creative technologist selecting ad template wireframes for an ad campaign.

Available wireframe catalog — pick ONLY from these entries:
${catalogJson}

IMPORTANT: wireframeId MUST be exactly one of these IDs (copy verbatim, no variations):
${validIdsStr}

Template field requirements:
- Creative brief: "${brief || "(none provided)"}"
- Channel: "${channel}"
- Needs headline: ${hasHeadline} | image count needed: ${imageCount} | needs price: ${hasPrice} | needs CTA: ${hasCTA} | has logo: ${hasLogo}
- All fields: ${JSON.stringify(requirements.map((r) => ({ id: r.id, type: r.type, category: r.category })))}

Available feed columns (actual data available): ${JSON.stringify(cols)}
Brand: color "${color}", font "${font}", border radius "${radius}"
${feedSampleSection}
Select exactly 3 wireframes. Rules:
1. wireframeId MUST be one of the IDs listed above — do not invent or modify IDs
2. Prefer wireframes whose imageCount matches ${imageCount} image field(s) needed
3. Prefer wireframes where hasPrice=true when price fields are required (hasPrice: ${hasPrice})
4. Prefer wireframes where hasCTA=true when CTA is required (hasCTA: ${hasCTA})
5. Prefer wireframes where hasLogo=true when brand logo is needed (hasLogo: ${hasLogo})
6. Let the creative brief influence which style/mood fits best
7. Diversify: all 3 must be different wireframes with meaningfully different visual approaches

For each selection:
- id: unique kebab-case string (e.g. "pick-1")
- name: 2-3 creative words describing this selection
- wireframeId: exact id from the list above
- variant: closest match from "grid" | "stacked" | "wide" | "minimal"
- description: 1 sentence on why this wireframe fits the brief and field requirements
- strategy: 1 sentence on campaign type / audience this layout suits
- styles.primaryColor: "${color}"
- styles.fontFamily: "${font}"
- styles.borderRadius: "${radius}" (or "0px" for a bold pick)
- styles.shadow: optional CSS box-shadow string (omit for minimal)
- elements: set headline/price/image/cta/logo booleans to match the requirements above
- suggestedZoneStylesJson: a JSON string (stringified object) mapping each slot ID from the selected wireframe's slots array to a CSS style object with relevant overrides (e.g. fontSize, color, fontFamily, textAlign). Use the feed sample data and brand tokens to make suggestions concrete and realistic. Only include slots that exist in the wireframe's slots array.`;

          const result = await model.generateContent(prompt);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let raw: Array<Record<string, any>>;
          try {
            const parsed = JSON.parse(result.response.text());
            if (!Array.isArray(parsed)) throw new Error("expected array");
            raw = parsed;
          } catch (err) {
            throw new functions.https.HttpsError("internal", `AI returned unparseable response: ${result.response.text().slice(0, 200)}`);
          }

          // Server-side validation: repair any wireframeId not in the catalog.
          // Fallback to the catalog entry at that index so the client always gets a usable wireframeId.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const validated: Array<Record<string, any>> = raw.map((candidate, i) => {
            const wid = typeof candidate.wireframeId === "string" ? candidate.wireframeId : "";
            const repaired = validIds.includes(wid) ? wid : (validIds[i] ?? validIds[0] ?? "");
            return { ...candidate, wireframeId: repaired };
          });

          // Post-process: parse suggestedZoneStylesJson, filter to known slots, attach suggestedZoneStyles.
          const processedCandidates = validated.map((candidate) => {
            const wireframe = catalog.find((w) => w.id === candidate.wireframeId);
            const allowedSlots = new Set(wireframe?.slots ?? []);

            let suggestedZoneStyles: Record<string, Record<string, string>> = {};
            const raw_json = candidate.suggestedZoneStylesJson;
            if (typeof raw_json === "string" && raw_json.trim().length > 0) {
              try {
                const parsed = JSON.parse(raw_json) as Record<string, unknown>;
                // keep only entries where the value is a plain object (a ZoneStyle)
                const filtered = Object.fromEntries(
                  Object.entries(parsed).filter(([, v]) => v !== null && typeof v === "object" && !Array.isArray(v))
                );
                const dropped: string[] = [];
                for (const [slotId, styles] of Object.entries(filtered)) {
                  if (allowedSlots.has(slotId)) {
                    suggestedZoneStyles[slotId] = styles as Record<string, string>;
                  } else {
                    dropped.push(slotId);
                  }
                }
                if (dropped.length > 0) {
                  functions.logger.debug("[generateLayouts] Dropped unknown slot IDs from suggestedZoneStylesJson", {
                    candidateId: candidate.id,
                    wireframeId: candidate.wireframeId,
                    droppedSlotIds: dropped,
                  });
                }
              } catch (parseErr) {
                functions.logger.warn("[generateLayouts] Failed to parse suggestedZoneStylesJson", {
                  candidateId: candidate.id,
                  error: (parseErr as Error).message,
                });
              }
            } else {
              functions.logger.debug("[generateLayouts] suggestedZoneStylesJson absent or empty", { wireframeId: candidate.wireframeId });
            }

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { suggestedZoneStylesJson: _raw, ...rest } = candidate;
            return { ...rest, suggestedZoneStyles };
          });

          response.json(processedCandidates);

        } else if (action === "suggestMappings") {
          const { requirements, feedColumns } = body as {
            requirements: Array<{ id: string; label: string; category: string; type: string }>;
            feedColumns: string[];
          };
          if (!Array.isArray(feedColumns) || feedColumns.length === 0) { response.json({}); return; }

          const mappable = requirements.filter(
            (r) => r.category === "Dynamic" && r.type !== "button" && r.type !== "asset"
          );
          if (mappable.length === 0) { response.json({}); return; }

          const model = genAI.getGenerativeModel({
            model: GEMINI_MODEL,
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: SchemaType.OBJECT,
                properties: {},
              },
            },
          });

          const prompt = `You are a data mapping assistant for ad templates.

Template fields to map (Dynamic fields only, no buttons or assets):
${JSON.stringify(mappable.map((r) => ({ id: r.id, label: r.label, type: r.type })))}

Available feed columns:
${JSON.stringify(feedColumns)}

Map each template field ID to the most semantically appropriate feed column name.
Return a flat JSON object: { "fieldId": "columnName" }
Only include fields you are confident about. Skip fields with no good match.
Example output: { "headline": "product_title", "image_url": "image_link", "price": "final_price" }`;

          const result = await model.generateContent(prompt);
          const raw = JSON.parse(result.response.text()) as Record<string, unknown>;

          const safe: Record<string, string> = {};
          for (const [k, v] of Object.entries(raw)) {
            if (typeof v === "string") safe[k] = v;
          }
          response.json(safe);

        } else if (action === "chat") {
          const { messages, templateContext } = body as {
            messages: Array<{ role: string; content: string }>;
            templateContext: {
              channel: string;
              brief?: string;
              brand: { primaryColor?: string; fontPrimary?: string } | null;
              fieldMappings: Record<string, string>;
              slotMappings: Record<string, string>;
              fieldTransforms: Record<string, string[]>;
              requirements: Array<{ id: string; label: string; type: string }>;
              feedColumns: string[];
            };
          };

          if (!Array.isArray(messages) || messages.length === 0) {
            response.status(400).json({ error: "messages array is required" });
            return;
          }

          const chatModel = genAI.getGenerativeModel({
            model: GEMINI_MODEL,
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                  content: { type: SchemaType.STRING },
                  actions: {
                    type: SchemaType.ARRAY,
                    items: {
                      type: SchemaType.OBJECT,
                      properties: {
                        type:      { type: SchemaType.STRING },
                        fieldId:   { type: SchemaType.STRING },
                        transform: { type: SchemaType.STRING },
                        column:    { type: SchemaType.STRING },
                        slotId:    { type: SchemaType.STRING },
                      },
                      required: ["type"],
                    },
                  },
                },
                required: ["content"],
              },
            },
          });

          const ctx = templateContext;
          const systemPrompt = `You are Alli, an AI creative assistant helping build an ad template.

Current template context:
- Channel: ${ctx.channel}
- Brief: "${ctx.brief || "(none)"}"
- Brand color: ${ctx.brand?.primaryColor ?? "unknown"}, font: ${ctx.brand?.fontPrimary ?? "Inter"}
- Fields and their feed column mappings: ${JSON.stringify(ctx.fieldMappings)}
- Slot assignments: ${JSON.stringify(ctx.slotMappings)}
- Transforms already applied: ${JSON.stringify(ctx.fieldTransforms)}
- All available feed columns: ${JSON.stringify(ctx.feedColumns)}
- Template fields: ${JSON.stringify(ctx.requirements.map((r) => ({ id: r.id, label: r.label, type: r.type })))}

You can suggest structured actions when the user asks you to make changes. Available actions:
- add_transform: apply a processing rule to a field at generation time
  { "type": "add_transform", "fieldId": "image_url", "transform": "remove_bg" }
- remove_transform: remove a transform rule
  { "type": "remove_transform", "fieldId": "image_url", "transform": "remove_bg" }
- suggest_mapping: recommend a feed column for a field
  { "type": "suggest_mapping", "fieldId": "headline", "column": "product_title" }
- suggest_slot: recommend a template slot for a field
  { "type": "suggest_slot", "fieldId": "headline", "slotId": "headline1" }

Available transforms for image fields: remove_bg, enhance, reframe
Available transforms for text fields: title_case, uppercase, truncate_50

Rules:
- Only suggest actions when the user explicitly asks for a change
- Always explain what you are doing in the "content" field
- If no actions are needed, return "actions": []
- Match fieldId exactly to the fields listed in template context above`;

          // Build conversation history for Gemini chat
          // Prepend system prompt to the first user message
          const history: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
          for (let i = 0; i < messages.length - 1; i++) {
            const m = messages[i];
            const role = m.role === "assistant" ? "model" : "user";
            const text = i === 0 && m.role === "user"
              ? `${systemPrompt}\n\nUser: ${m.content}`
              : m.content;
            history.push({ role, parts: [{ text }] });
          }

          const lastMessage = messages[messages.length - 1];
          const lastText = messages.length === 1 && lastMessage.role === "user"
            ? `${systemPrompt}\n\nUser: ${lastMessage.content}`
            : lastMessage.content;

          let chatText: string;
          try {
            const chat = chatModel.startChat({ history });
            const result = await chat.sendMessage(lastText);
            chatText = result.response.text();
          } catch (err) {
            throw new functions.https.HttpsError("internal", `Gemini chat failed: ${(err as Error).message}`);
          }

          let parsed: { content: string; actions?: unknown[] };
          try {
            parsed = JSON.parse(chatText) as { content: string; actions?: unknown[] };
          } catch {
            throw new functions.https.HttpsError("internal", `AI returned unparseable response: ${chatText.slice(0, 200)}`);
          }

          response.json(parsed);

        } else {
          response.status(400).json({ error: `Unknown templateAI action: ${action}` });
        }
      } catch (err) {
        functions.logger.error("[templateAI] Error:", err);
        response.status(500).json({ error: `Gemini call failed: ${(err as Error).message}` });
      }
    });
  });
