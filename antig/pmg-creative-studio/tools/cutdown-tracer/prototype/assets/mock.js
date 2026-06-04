/* Mock data for the Cutdown V1 prototype — shapes mirror
 * tools/cutdown-tracer/src/types.ts (SampleMusicTrack, VideoAnalysis,
 * CutdownPlan, PlannedCut). Values are illustrative, not real.
 *
 * Scenario: a ~3-minute brand film ("Acme Athletic — Spring Launch") cut down
 * to a 30s 9:16 reel over a 108bpm track, briefed toward the product demo. */
(function () {
  const source = {
    name: "acme_spring_launch_master.mp4",
    durationSec: 176, // 2:56
    width: 3840,
    height: 2160,
    fileType: "MP4",
  };

  // SampleMusicTrack[] — Firestore sampleMusic/{id}; file in GCS via signed URL.
  const tracks = [
    { trackId: "trk_pulse", title: "Pulse Theory", url: "#", format: "mp3", durationSec: 142, bpm: 124, mood: "Energetic", genre: "Electronic", provider: "sample", licenseRef: "smp-001" },
    { trackId: "trk_goldhour", title: "Golden Hour", url: "#", format: "mp3", durationSec: 168, bpm: 92, mood: "Warm", genre: "Indie Pop", provider: "sample", licenseRef: "smp-002" },
    { trackId: "trk_citylights", title: "City Lights", url: "#", format: "mp3", durationSec: 155, bpm: 108, mood: "Confident", genre: "Hip-Hop", provider: "sample", licenseRef: "smp-003" },
    { trackId: "trk_driftwood", title: "Driftwood", url: "#", format: "mp3", durationSec: 201, bpm: 76, mood: "Calm", genre: "Ambient", provider: "sample", licenseRef: "smp-004" },
    { trackId: "trk_overdrive", title: "Overdrive", url: "#", format: "mp3", durationSec: 133, bpm: 140, mood: "Intense", genre: "Rock", provider: "sample", licenseRef: "smp-005" },
    { trackId: "trk_softfocus", title: "Soft Focus", url: "#", format: "mp3", durationSec: 187, bpm: 100, mood: "Dreamy", genre: "Lo-fi", provider: "sample", licenseRef: "smp-006" },
  ];

  const selectedTrackId = "trk_citylights"; // 108 bpm
  const targetSec = 30;
  const brief = "Focus on the product demo and the founder's key line.";

  // VideoAnalysis — produced once by the analyze pass, shared across all angles.
  const analysis = {
    theme:
      "A founder-led spring product launch: behind-the-scenes energy in the studio, the new running shoe revealed, a hands-on demo of the sole tech, and a crowd reaction at the pop-up event.",
    beats: [
      { startSec: 4, endSec: 9, score: 0.78, summary: "Studio doors open, team walks in", role: "Setup" },
      { startSec: 22, endSec: 28, score: 0.84, summary: "Founder to camera: the why", role: "Founder line" },
      { startSec: 48, endSec: 54, score: 0.9, summary: "Founder names the one big idea", role: "Founder line" },
      { startSec: 71, endSec: 77, score: 0.88, summary: "Close-up: shoe pulled from the box", role: "Reveal" },
      { startSec: 84, endSec: 90, score: 0.94, summary: "Hero shot — shoe spins on turntable", role: "Reveal" },
      { startSec: 103, endSec: 110, score: 0.86, summary: "Hands flex the sole, tech callout", role: "Demo" },
      { startSec: 118, endSec: 124, score: 0.82, summary: "Runner laces up, first stride", role: "Demo" },
      { startSec: 140, endSec: 146, score: 0.8, summary: "Crowd at pop-up reacts, applause", role: "Reaction" },
      { startSec: 160, endSec: 166, score: 0.76, summary: "Logo lockup, end card", role: "Payoff" },
    ],
  };

  // CutdownPlan[] — one per fixed angle. Each carries an AI description + ordered
  // PlannedCuts (each with summary/role/why/score). Σ len == targetSec.
  const plans = [
    {
      angle: "narrative",
      description:
        "Tells the launch in order — the team arrives, the founder frames the why, the shoe is revealed, then the demo and the crowd payoff. The calmest, most story-driven read of the footage; best when the arc matters more than the punch.",
      cuts: [
        { srcIn: 4, srcOut: 9, len: 5, summary: "Studio doors open", role: "Setup", why: "Establishes place and energy before any product.", score: 0.78 },
        { srcIn: 48, srcOut: 54, len: 6, summary: "Founder names the big idea", role: "Founder line", why: "The clearest statement of intent — anchors the story.", score: 0.9 },
        { srcIn: 71, srcOut: 77, len: 6, summary: "Shoe pulled from the box", role: "Reveal", why: "First sight of the product, paced after the setup.", score: 0.88 },
        { srcIn: 103, srcOut: 110, len: 7, summary: "Sole flex + tech callout", role: "Demo", why: "Shows the one feature worth remembering.", score: 0.86 },
        { srcIn: 160, srcOut: 166, len: 6, summary: "Logo lockup end card", role: "Payoff", why: "Closes the arc on the brand.", score: 0.76 },
      ],
    },
    {
      angle: "highlights",
      description:
        "Front-loads the hook and cuts hard between the highest-impact moments — hero reveal, founder line, crowd reaction. Punchiest for social; trades some setup for momentum and density.",
      cuts: [
        { srcIn: 84, srcOut: 90, len: 6, summary: "Hero shot — shoe spins", role: "Reveal", why: "Highest-scoring frame; opens on the strongest image.", score: 0.94 },
        { srcIn: 48, srcOut: 54, len: 6, summary: "Founder names the big idea", role: "Founder line", why: "The most quotable line, kept tight.", score: 0.9 },
        { srcIn: 71, srcOut: 77, len: 5, summary: "Shoe pulled from the box", role: "Reveal", why: "Second product beat to reinforce the launch.", score: 0.88 },
        { srcIn: 103, srcOut: 110, len: 7, summary: "Sole flex + tech callout", role: "Demo", why: "Concrete proof point between two emotional beats.", score: 0.86 },
        { srcIn: 140, srcOut: 146, len: 6, summary: "Crowd reacts, applause", role: "Reaction", why: "Social proof lands the close.", score: 0.8 },
      ],
    },
    {
      angle: "punchy",
      description:
        "Hook-dense and fast: leads with the single strongest beat, then rapid-fire demo and reaction beats. Most on-message for the demo brief — least 'highlight reel', most 'show me it works'.",
      cuts: [
        { srcIn: 84, srcOut: 90, len: 5, summary: "Hero shot — shoe spins", role: "Reveal", why: "Strongest beat first — stops the scroll.", score: 0.94 },
        { srcIn: 103, srcOut: 110, len: 6, summary: "Sole flex + tech callout", role: "Demo", why: "On-brief: the demo is the point.", score: 0.86 },
        { srcIn: 118, srcOut: 124, len: 5, summary: "Runner laces up, first stride", role: "Demo", why: "Second demo beat — product in motion.", score: 0.82 },
        { srcIn: 48, srcOut: 53, len: 5, summary: "Founder names the big idea", role: "Founder line", why: "One quick line of context, trimmed hard.", score: 0.9 },
        { srcIn: 140, srcOut: 146, len: 5, summary: "Crowd reacts, applause", role: "Reaction", why: "Fast payoff to end on energy.", score: 0.8 },
        { srcIn: 84, srcOut: 88, len: 4, summary: "Hero shot reprise", role: "Reveal", why: "Button — reprise the hero for the loop.", score: 0.94 },
      ],
    },
  ];

  // Video datasources — mirror platform/datasources DatasourceRecord, filtered
  // to media:'video' (hasVideo + videoColumns). The cutdown source picker lists
  // these like ad-resizing's FeedConnectScreen "From Alli" tab.
  const videoDatasources = [
    { modelName: "spring_campaign_feed", videoCount: 24, videoColumns: ["video_url"], type: "Cube" },
    { modelName: "ugc_creator_library", videoCount: 58, videoColumns: ["clip_url", "b_roll_url"], type: "Cube" },
    { modelName: "event_captures_2026", videoCount: 12, videoColumns: ["video_url"], type: "Cube" },
    { modelName: "product_demo_masters", videoCount: 9, videoColumns: ["master_url"], type: "Cube" },
  ];

  const selectedDatasource = "spring_campaign_feed";

  // Video creatives for the chosen datasource — varying aspect ratios so the
  // grid reads as a masonry. Shapes echo ad-resizing's Creative (id, name,
  // width, height, fileType) plus durationSec for video.
  const videoCreatives = [
    { id: "v01", name: "acme_spring_launch_master", durationSec: 176, width: 3840, height: 2160, fileType: "MP4" },
    { id: "v02", name: "founder_interview_full", durationSec: 412, width: 1920, height: 1080, fileType: "MP4" },
    { id: "v03", name: "studio_bts_vertical", durationSec: 88, width: 1080, height: 1920, fileType: "MP4" },
    { id: "v04", name: "shoe_turntable_loop", durationSec: 14, width: 1080, height: 1080, fileType: "MP4" },
    { id: "v05", name: "popup_event_recap", durationSec: 233, width: 1920, height: 1080, fileType: "MOV" },
    { id: "v06", name: "sole_tech_closeup", durationSec: 42, width: 1080, height: 1350, fileType: "MP4" },
    { id: "v07", name: "runner_first_stride", durationSec: 31, width: 1080, height: 1920, fileType: "MP4" },
    { id: "v08", name: "crowd_reaction_b_roll", durationSec: 67, width: 1920, height: 1080, fileType: "MP4" },
    { id: "v09", name: "unboxing_vertical", durationSec: 53, width: 1080, height: 1920, fileType: "MP4" },
    { id: "v10", name: "lookbook_montage", durationSec: 119, width: 1080, height: 1080, fileType: "MP4" },
    { id: "v11", name: "founder_quote_card", durationSec: 22, width: 1080, height: 1350, fileType: "MP4" },
    { id: "v12", name: "hero_product_spin_4k", durationSec: 18, width: 3840, height: 2160, fileType: "MOV" },
  ];

  const ANGLE_META = {
    narrative: { label: "Narrative", tag: "chronological", desc: "Story arc, in source order" },
    highlights: { label: "Highlights", tag: "by impact", desc: "Highest-scoring beats first" },
    punchy: { label: "Punchy", tag: "hook-dense", desc: "Strongest beat first, fast pacing" },
  };

  function fmtTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  // Deterministic storyboard-frame gradient keyed by a seed string — gives each
  // cut a stable "thumbnail" look with no network dependency.
  function frameGradient(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
    const h2 = (h + 40) % 360;
    return `linear-gradient(135deg, hsl(${h} 45% 28%), hsl(${h2} 50% 16%))`;
  }

  window.MOCK = {
    source, tracks, selectedTrackId, targetSec, brief, analysis, plans, ANGLE_META,
    videoDatasources, selectedDatasource, videoCreatives,
    fmtTime, frameGradient,
    track: (id) => tracks.find((t) => t.trackId === id),
    datasource: (m) => videoDatasources.find((d) => d.modelName === m),
  };
})();
