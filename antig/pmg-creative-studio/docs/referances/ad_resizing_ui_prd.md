# PRD: Ad Resizing UI/UX Flow

## 1. Product Overview

### 1.1 Product Name
Ad Resizing App — UI/UX Flow

### 1.2 Problem Statement
Users need a fast, visual way to select existing creative assets and generate resized versions for multiple advertising channels and aspect ratios. The workflow must support familiar gallery-based selection, channel-aware output sizing, visible generation progress, and easy review/download of resized outputs.

### 1.3 Product Goal
Create a gallery-first resizing experience where users can:
- Select a creative from an asset gallery.
- Choose target channels and output dimensions.
- Run the resize process from the same screen.
- Watch generated outputs populate in a progress/gallery view.
- Inspect completed outputs in a gallery and single-image view.
- Save generated assets into a reusable collection.

### 1.4 Scope
This PRD covers the UI/UX flow for creative resizing only. Image editing, text extraction, text repositioning, and advanced creative manipulation are out of scope for this version.

---

## 2. Background and Context

The team discussed a resizing workflow that begins from the dashboard and moves into a gallery-style asset browser. Users select creatives, choose target channels and dimensions, run the resize job, then review generated outputs in a gallery.

The team identified several UX and technical constraints:
- Batch selection across differently sized creatives creates inheritance and resizing logic complexity.
- Users may want to generate dimensions across multiple channels in one run.
- Channel-first filtering is useful, but dimension-first use cases also exist.
- Loading should feel visual and generative, not like a static spinner.
- Resizing and editing should remain separate workflows.

---

## 3. Users and Use Cases

### 3.1 Primary Users
- Channel analysts working within a specific COE or advertising channel.
- Cross-channel team members who need outputs for multiple platforms.
- Creative/production users who may think in dimensions rather than channels.

### 3.2 Core Use Cases
1. A user selects one creative and resizes it for a social placement.
2. A user selects one creative and generates multiple social aspect ratios.
3. A user selects one creative and generates outputs across multiple channels.
4. A user monitors resize progress while assets generate.
5. A user reviews completed resized assets in a gallery.
6. A user opens one generated asset and swipes between generated outputs.
7. A user downloads or exports generated assets.
8. A user returns later to previously generated resized assets.

---

## 4. Goals and Non-Goals

### 4.1 Goals
- Provide a familiar gallery-based selection experience.
- Support single creative selection in V1 to simplify resize inheritance logic.
- Allow users to choose one or more target channels.
- Auto-populate output dimensions/aspect ratios based on selected channels.
- Allow users to run resizing without a separate confirmation step.
- Provide a visual progress/loading state with generated output tiles.
- Show completed outputs in a gallery before opening single-image inspection.
- Autosave generated outputs into a collection of AI-generated creations.
- Keep resizing separate from editing.

### 4.2 Non-Goals
- Full multi-creative batch resizing in V1.
- Text extraction from flat images.
- Text editing or repositioning.
- Full image editing workflow.
- Advanced generated asset cleanup rules.
- Final export format matrix beyond initial placeholders.

---

## 5. User Journey

### 5.1 End-to-End Flow
1. User enters the app from the dashboard.
2. User lands in a gallery view.
3. User optionally selects a source/feed from a dropdown.
4. User sorts assets by most recent.
5. User enters selection mode.
6. User selects one creative in V1.
7. Resize selection controls appear.
8. UI displays selected asset metadata.
9. User selects target channel or channels.
10. Available dimensions/aspect ratios auto-populate.
11. User selects desired output sizes.
12. User clicks **Run**.
13. App shows a visual generation/loading gallery.
14. Each requested output appears as a loading tile.
15. Tiles transition into completed resized images as generation finishes.
16. User reviews completed outputs in a gallery.
17. User opens a generated asset in a single-image view.
18. User swipes between generated outputs.
19. User downloads or exports assets.
20. Generated assets autosave into an AI-generated collection.

---

## 6. Functional Requirements

### 6.1 Dashboard Entry
**Requirement:** Users must be able to enter the resizing app from the main dashboard.

**Acceptance Criteria**
- Dashboard contains an entry point into the resizing app.
- Clicking the entry point opens the gallery view.
- User lands in the correct app context without needing additional setup.

---

### 6.2 Gallery View
**Requirement:** The app must provide a gallery-style asset browser.

**Core UI Elements**
- Asset grid/gallery.
- Source/feed dropdown.
- Sort control.
- Selection mode.
- Selected state indicator.

**Acceptance Criteria**
- User can view creative assets in a gallery.
- User can sort by most recent.
- User can select an asset using a checkmark-style selection interaction.
- Selected assets display a clear visual selected state.

---

### 6.3 V1 Selection Behavior
**Requirement:** V1 should support selecting one creative at a time.

**Rationale**
Different source creative sizes and ratios create complexity for batch resizing. Single selection allows the team to define inheritance and resizing behavior before expanding to multi-select processing.

**Acceptance Criteria**
- User can select one creative.
- UI clearly communicates that one item is selected.
- If multi-select UI is visible in V1, additional selections should be disabled, blocked, or clearly marked as unavailable.
- System does not attempt to process multiple differently sized source creatives in V1.

---

### 6.4 Resize Selection Panel
**Requirement:** After asset selection, the app must show resize configuration controls.

**Core UI Elements**
- Selected asset count, such as “1 selected.”
- Source creative metadata.
- Target channel selector.
- Dimension/aspect ratio selector.
- Run button.

**Acceptance Criteria**
- Panel updates when a creative is selected.
- Panel displays selected count.
- Panel displays available target channel options.
- Panel displays available size/aspect ratio options.
- Panel includes a visible **Run** action.

---

### 6.5 Target Channel Selection
**Requirement:** Users must be able to choose target advertising channels.

**Initial Channel Options**
- Social
- Programmatic / Progo
- Print
- Digital
- Digital Signage / Signage

**Acceptance Criteria**
- User can select at least one channel.
- Channel selection drives available output dimensions.
- Channel names are clear and understandable to users.

---

### 6.6 Multi-Channel Selection
**Requirement:** Users should be able to select multiple target channels in the resize selection panel.

**Rationale**
Some users work across multiple channels or need all relevant dimensions in one run. Channel-only filtering should not force users into repetitive workflows.

**Acceptance Criteria**
- User can select multiple channels.
- Selecting multiple channels auto-populates dimensions from all selected channels.
- Duplicate dimensions are deduplicated or grouped clearly.
- User can deselect selected channels.
- UI remains understandable when several channels are selected.

---

### 6.7 Dimension and Aspect Ratio Selection
**Requirement:** The app must show dimensions/aspect ratios based on selected channel(s).

**Initial Dimension Examples**
- Print:
  - 8.5 x 11
  - 4 x 6
  - Custom
- Programmatic:
  - 300 x 250
  - 160 x 600
  - 728 x 90
  - 300 x 600
- Social:
  - 1:1
  - 9:16
  - 2:3 or equivalent vertical ratio
- Digital Signage:
  - TBD standard sizes

**Acceptance Criteria**
- Size options change when channel selections change.
- User can select one or more output sizes.
- User can understand which size belongs to which channel.
- Custom print sizing is supported or clearly marked as future functionality.
- Digital signage dimensions are either defined before launch or hidden until available.

---

### 6.8 Run Action
**Requirement:** Users must be able to start resizing from the resize selection screen.

**Acceptance Criteria**
- **Run** button is visible on the same screen as resize selection.
- No separate confirmation modal is required for V1.
- **Run** is disabled until the user has selected:
  - A source creative.
  - At least one target channel.
  - At least one output size.
- Clicking **Run** starts the generation/loading state.

---

### 6.9 Loading and Progress State
**Requirement:** The app must show visual progress while resized outputs are generated.

**Core UI Elements**
- Queue or generation area.
- Progress indicator.
- Loading tiles for each requested output.
- Optional global progress bar.
- Optional message indicating the user can leave the page.

**Acceptance Criteria**
- Each requested output size appears as an individual loading tile.
- Loading tiles indicate that generation is in progress.
- Completed outputs replace loading tiles as they finish.
- User can distinguish pending, in-progress, completed, and failed states.
- If the user can leave the page during processing, the UI states that clearly.

---

### 6.10 Generative Loading Animation
**Requirement:** Loading should feel visual and creative rather than purely technical.

**UX Direction**
- Use a Canva-like generation animation.
- Show thumbnails/placeholders in a masonry or gallery layout.
- Apply subtle AI-style visual treatment such as shimmer, scan, or sparkles.
- Replace each animated placeholder with the final resized image once ready.

**Acceptance Criteria**
- Loading state is visually tied to the selected creative and output sizes.
- Animation does not block understanding of progress.
- Animation stops for each tile when that output completes.
- Completed image is clickable.

---

### 6.11 Completed Output Gallery
**Requirement:** Completed resized assets must appear in a gallery feed before single-image view.

**Acceptance Criteria**
- Generated outputs are shown together in a gallery.
- User can scan all completed outputs before opening one.
- Gallery supports partially completed states while other outputs are still loading.
- Failed outputs show an actionable error state.

---

### 6.12 Single Image View
**Requirement:** Users must be able to inspect individual generated outputs.

**Core Behavior**
- Click a completed output tile.
- Open single-image view or modal.
- Swipe or navigate between generated outputs.

**Acceptance Criteria**
- User can open an individual resized image.
- User can navigate to previous and next generated images.
- User can return to the generated output gallery.
- Single image view does not include editing controls in V1.

---

### 6.13 Save and Autosave
**Requirement:** Generated outputs should autosave into a collection of AI-generated creations.

**Acceptance Criteria**
- Generated resized outputs are saved automatically.
- User can access generated outputs after leaving the active job.
- Generated outputs live within a collection or gallery state.
- Cleanup and expiration policies are not required for V1 but must be tracked as follow-up work.

---

### 6.14 Download and Export
**Requirement:** Users should be able to download or export generated outputs.

**Initial Export Options**
- PNG
- HTML, pending validation

**Acceptance Criteria**
- User can download at least one generated output.
- Download action is available from completed output view or gallery.
- Export format options are clearly displayed.
- Unsupported formats are not shown.

---

## 7. UX Requirements

### 7.1 Familiar Interaction Model
The selection and gallery interactions should feel similar to common photo gallery apps.

### 7.2 Low-Friction Execution
The app should avoid unnecessary confirmation steps once users have selected creative and output targets.

### 7.3 Progressive Completion
Users should see outputs appear as they are completed instead of waiting for all outputs to finish.

### 7.4 Clear Separation Between Resizing and Editing
The resize flow should not introduce text extraction, text editing, or image editing controls.

### 7.5 Collection-Based Mental Model
Generated assets should feel like creations that belong in a broader gallery, not temporary one-off downloads.

---

## 8. States and Edge Cases

### 8.1 Empty Gallery
- Show empty state explaining no assets are available.
- Provide next action such as upload, connect feed, or return to dashboard.

### 8.2 No Asset Selected
- Resize panel should be hidden, disabled, or show instructional copy.
- Run button must remain disabled.

### 8.3 Multiple Asset Selection Attempt in V1
- Prevent additional selections or show “V1 supports one creative at a time.”

### 8.4 No Channel Selected
- Dimension list should remain empty or show “Select a channel to view available sizes.”
- Run button disabled.

### 8.5 No Dimension Selected
- Run button disabled.
- UI prompts user to select at least one size.

### 8.6 Generation Failure
- Failed tile shows error state.
- User can retry failed output.
- Successful outputs remain available.

### 8.7 User Leaves During Generation
- If background processing is supported, job continues.
- User can return to active or completed job.
- If background processing is not supported, UI must clearly warn user before leaving.

### 8.8 Unsupported Dimension
- Unsupported dimensions should be hidden or marked unavailable.
- Custom sizing should validate inputs before run.

---

## 9. Data and Metadata Requirements

### 9.1 Source Creative Metadata
The selected creative should expose:
- Asset ID
- Thumbnail
- Source dimensions
- Source aspect ratio
- File type
- Created/uploaded date
- Feed/source, if applicable

### 9.2 Resize Job Metadata
Each resize job should track:
- Job ID
- Source asset ID
- Selected channel(s)
- Selected output dimensions
- Status
- Created by
- Created timestamp
- Completion timestamp

### 9.3 Generated Output Metadata
Each generated output should track:
- Output ID
- Parent job ID
- Source asset ID
- Channel
- Dimension/aspect ratio
- File type
- Preview thumbnail
- Final asset URL/path
- Status
- Error message, if failed

---

## 10. Information Architecture

### 10.1 Primary Views
- Dashboard
- Main asset gallery
- Resize selection panel
- Generation/loading gallery
- Generated creations collection
- Single image view/modal

### 10.2 Suggested Navigation Model
The generation/loading gallery can transition into the completed generated gallery. Generated outputs should persist inside a larger creations collection so users can revisit past jobs.

---

## 11. Success Metrics

### 11.1 Activation Metrics
- Percentage of users who enter the resizing app from dashboard.
- Percentage of users who select a creative.
- Percentage of users who click Run after selecting outputs.

### 11.2 Completion Metrics
- Resize job completion rate.
- Average time from Run to first completed output.
- Average time from Run to all outputs completed.
- Failed output rate.

### 11.3 Engagement Metrics
- Number of outputs generated per job.
- Percentage of users selecting multiple channels.
- Percentage of users downloading generated outputs.
- Percentage of users opening single-image view.
- Percentage of users returning to generated collections.

### 11.4 UX Quality Metrics
- User-reported clarity of channel/dimension selection.
- User-reported trust in generated outputs.
- Reduction in repetitive resizing workflows.
- Reduction in manual channel-by-channel resizing.

---

## 12. Open Questions

1. What is the exact V1 channel taxonomy?
2. Should “Progo” be labeled as “Programmatic” in the UI?
3. What are the final approved dimensions for digital signage?
4. Should users be able to select dimensions directly without selecting channels?
5. Should generated outputs be grouped by job, by source creative, or in one global AI-generated collection?
6. What export formats are required for launch?
7. Should HTML export be supported in V1?
8. Should autosaved generated outputs expire after a certain period?
9. How should users delete unwanted generated outputs?
10. What happens if the AI resize result is poor or unusable?
11. How should retry behavior work for failed outputs?
12. When should full multi-creative batch resizing be introduced?

---

## 13. Future Considerations

### 13.1 Multi-Creative Batch Resizing
Future versions may support selecting multiple creatives at once. This requires clear inheritance logic for source assets with different dimensions and layout structures.

### 13.2 Image Editing
Future workflows may include image editing after resizing, including creative adjustments, object-aware modifications, and manual refinements.

### 13.3 Text Extraction and Editing
Text extraction from flat images should be treated as a separate feature. It may require OCR, layout detection, layer reconstruction, and safeguards for text overlapping important visual elements.

### 13.4 Cleanup and Storage Management
As AI-generated asset volume grows, the product will need rules for deleting, archiving, expiring, or trashing unwanted outputs.

---

## 14. MVP Definition

### 14.1 MVP Includes
- Dashboard entry.
- Gallery view.
- Sort by most recent.
- Single creative selection.
- Resize selection panel.
- Target channel selection.
- Multi-channel selection.
- Auto-populated dimension options.
- Run button on resize selection screen.
- Visual loading/generation gallery.
- Completed output gallery.
- Single image modal/view.
- Swipe navigation between generated outputs.
- Autosave to generated collection.
- PNG download.

### 14.2 MVP Excludes
- Multi-source batch processing.
- Text extraction.
- Text editing.
- Full image editing.
- Complex cleanup rules.
- Confirm modal.
- Advanced export formats unless validated.

---

## 15. Acceptance Criteria Summary

The V1 resizing UI is complete when:
- A user can enter the app from the dashboard.
- A user can browse and select one creative from a gallery.
- A user can select one or more target channels.
- The UI auto-populates relevant output dimensions.
- A user can select multiple output sizes.
- A user can run the resize job from the same screen.
- The app shows progress for each generated output.
- Completed outputs appear in a gallery.
- A user can open and swipe through generated outputs.
- Generated outputs autosave into a collection.
- A user can download at least PNG outputs.
- Editing and text extraction are not present in the resizing flow.
