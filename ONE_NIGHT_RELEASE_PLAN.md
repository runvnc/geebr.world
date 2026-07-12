# One-Night Release Plan: The Agent Failure Museum

## Conclusion

Do **not** attempt to finish, polish, or broadly launch geebr.world tonight.

Instead, extract one small, understandable artifact from what already works:

> **Publish a short visual record of AI agents misunderstanding simple rooms and tasks.**

The preferred version is a static **Agent Failure Museum** containing three incidents. If even that is too large, publish one strong incident as a standalone page or GIF.

Success tonight does not mean completing the platform. It means getting approximately **5–10 strangers to engage** with one concrete result: commenting, suggesting a task, sharing it, asking for another example, or requesting access.

---

## Why this approach

The recurring problem has not been a lack of technical depth. The projects contain substantial systems and original work, but:

- development continues for a long time before demand is tested;
- the interesting machinery is hidden beneath a broad platform pitch;
- incomplete platforms are difficult for strangers to understand quickly;
- polishing and architecture consume time without proving that anyone wants the central experience;
- Reddit and Hacker News silence conflates many factors: presentation, timing, audience, reputation, complexity, and actual interest.

People cannot upvote architecture they never experience. A small, legible artifact gives them something immediate to understand and discuss.

The release should therefore optimize for:

- a premise understandable in one sentence;
- a visible result within a few seconds;
- no signup;
- no explanation required before the interesting part;
- a screenshot, GIF, or short video that can stand alone;
- a simple invitation to participate.

---

## Important scope correction

Several initially proposed concepts were still too large for one night:

1. an AI reality show with autonomous characters, secrets, alliances, and destruction;
2. an interactive agent crash-test laboratory;
3. a user-authored tiny-world scenario generator.

These may be useful future directions, but each implies missing product systems, reliability work, controls, and presentation. They violate the one-night constraint.

The system also currently uses **E2B**, not the smaller browser-local 0.8B setup. Do not advertise it as browser-local. The public artifact does not need to emphasize infrastructure at all. If architecture is discussed, describe it truthfully.

---

## Tonight's artifact

### Preferred: Agent Failure Museum

Build one static page with three real incidents from geebr.world.

Suggested headline:

> **The Agent Failure Museum**

Suggested subtitle:

> Small language-model agents attempt simple tasks in a 3D world and fail in unexpectedly specific ways.

Each incident should contain:

1. **Goal** — what the agent was asked to accomplish.
2. **What it saw** — the textual perception supplied to the model.
3. **What it decided** — the command, response, or concise raw output.
4. **What happened** — screenshot, GIF, or short clip.
5. **Failure type** — spatial reasoning, planning, repetition, memory, tool use, or social misunderstanding.
6. **Brief explanation** — only enough technical detail to make the failure intelligible.

The page only needs:

- a strong title and one-sentence premise;
- one visual immediately visible near the top;
- three incident cards;
- a very short “How it works” section;
- a prompt asking visitors for the next experiment.

Recommended closing question:

> **What simple task should I give the agent next—especially one you expect it to fail?**

This is easier to answer than “What do you think?” and may supply future experiments.

### Minimum fallback: one incident

If producing three incidents becomes difficult, stop reducing scope and publish one.

Possible framing:

> **I Gave an AI Agent a Lamp. It Could Not Move On.**

Include:

- one GIF or screenshot sequence;
- the goal;
- exact perception;
- repeated actions or responses;
- concise explanation;
- a question asking what task to test next.

One memorable, well-presented incident is better than an unfinished museum or another unfinished platform.

---

## Existing incident candidate

A real behavior already encountered in geebr.world is the repeated lamp inspection:

### Incident: The Lamp Inspection Loop

**Goal:** Determine whether the lamp is damaged.

**Behavior:** The agent repeatedly inspected the same lamp.

**Repeated conclusion:** “That lamp is intact.”

**Next action:** Inspect the lamp again.

**Failure mode:** Deterministic generation and an observation that did not materially change caused a repetitive action loop.

This is useful because it is genuine, easy to understand, visually representable, and technically explainable without requiring the whole platform to be finished.

---

## What not to build tonight

Do not add:

- accounts or authentication;
- databases or persistence;
- a generalized scenario editor;
- character creation;
- secrets, alliances, or relationship systems;
- a model selector;
- local-model support merely for the launch;
- sharing infrastructure;
- a broad world editor;
- dashboards;
- new backend architecture;
- a complete agent-testing framework;
- extensive documentation;
- major refactoring;
- features that do not improve the first screenshot, first ten seconds, or central incident.

Do not describe the artifact as a general “AI platform,” “agent platform,” or “sandbox.” Those descriptions require visitors to imagine future value. Present one event or collection of events that already happened.

---

## Demand testing

A normal Reddit or Hacker News launch is not the best initial demand test. Silence or downvotes there do not isolate whether the premise is interesting.

Before or during construction, ask a small number of relevant people a forced-choice question:

> I have an unfinished 3D AI-agent system, but rather than spend another month turning it into a platform, I’m considering publishing a tiny “Agent Failure Museum” tonight: three visual examples of agents misunderstanding simple rooms and tasks, including their exact observations and actions. **Would you click that link, or should I publish one short incident as a GIF directly in the post instead?** Reply **museum**, **GIF**, or **neither**.

Good places include:

- direct messages to people who recently discussed AI agents, generative games, simulation, E2B, procedural generation, or creative coding;
- relevant Discord showcase or project channels;
- informal community threads where unfinished experiments are acceptable.

Do not ask whether the idea is “cool.” Ask what they would actually click.

### Signal strength

Count responses in this order:

1. “Can I try it?” or a request for the link.
2. An unsolicited suggested task or scenario.
3. A choice with a concrete reason.
4. A simple “museum,” “GIF,” or “neither.”
5. “Sounds cool.”
6. Implementation advice without choosing.

“Sounds cool” is weak evidence. A request to see or try it is strong evidence.

If nobody responds, treat that as a distribution failure rather than definitive product rejection.

---

## Suggested one-night schedule

### 1. Capture material — 30 minutes

Run the current system and collect three strange or revealing failures.

If live capture is unreliable, use existing logs or known historical behavior. The release is a documented case study, not a claim that the entire platform is production-ready.

### 2. Select and write — 30 minutes

Choose the strongest incident first. Write short captions using the fixed structure:

- Goal
- Perception
- Decision
- Result
- Failure type

Avoid long background explanations.

### 3. Assemble static page — 60–90 minutes

Reuse existing styling where convenient, but do not refactor the application. The page may be standalone.

The most interesting visual should appear before any lengthy text.

### 4. Make visual proof — 30 minutes

Create one of:

- a 15–30 second GIF;
- a short MP4;
- a compact screenshot sequence.

The visual should communicate the premise even when viewed outside the site.

### 5. Publish — 20 minutes

Publish by a fixed deadline even if the page is imperfect.

Use the artifact itself in the post rather than leading with the history or architecture.

### 6. Engage

Reply to every substantive response. If someone suggests a simple task and it can be run quickly, test it and post the result. That turns the release into a participatory event.

---

## Potential launch framing

### General title

> **The Agent Failure Museum: AI agents misunderstanding simple 3D worlds**

### More specific title

> **I gave an AI agent a lamp. It could not move on.**

### Technical title

> **I gave an E2B-backed agent a body and a room so its mistakes became visible**

Possible short post:

> I have spent a long time building a 3D environment where language-model agents perceive a room and issue constrained actions. Instead of pretending the whole platform is finished, I documented a few specific ways the agents fail.
>
> Here is one: the agent determined that a lamp was intact, then repeatedly inspected it and reached the same conclusion.
>
> [GIF]
>
> What simple task should I try next—especially one you expect the agent to misunderstand?

For a later functioning launch, Hacker News can receive a `Show HN` post. For tonight, direct outreach and communities receptive to experiments may provide clearer initial feedback.

---

## Decision rule

The project succeeds tonight if approximately 5–10 strangers do any of the following:

- comment substantively;
- suggest another task;
- ask for the link;
- ask to try the system;
- share the artifact;
- discuss why the agent failed;
- request another incident.

Upvotes are useful, but they are not the only engagement signal.

If the museum receives interest, the next increment should be selected from actual requests. Do not immediately resume building the whole platform.

If the single incident receives more response than the museum concept, continue publishing incidents as a series before creating generalized product features.

---

## Core operating rules

1. **Artifact, not platform.**
2. **One incident is enough to publish.**
3. **Evidence before expansion.**
4. **No feature unless it improves the first screenshot, first ten seconds, or central story.**
5. **No refactor unless it fixes a launch-blocking problem.**
6. **Publish by a fixed time.**
7. **Measure requests and participation, not compliments.**
8. **Let demonstrated audience interest determine the next feature.**

The immediate goal is not to prove that geebr.world can become a comprehensive platform. It is to discover whether one visible behavior produced by it is interesting enough that strangers want to see what happens next.

---

## Night-of progress update — July 11, 2026

The release-preparation work stayed mostly within the artifact-first boundary. The changes below improve capture quality and make the navigation failure understandable; they are not a general platform redesign.

### Completed

#### 1. Reduced UI overwhelm

All major sidebar sections now start collapsed:

- World setup
- Agent customization
- Agent info & prompt
- History

A small recording bar remains visible above them. This makes the initial screen less overwhelming without attempting a full UI redesign.

#### 2. Added an incident recorder

A launch-focused APNG recorder was added to the page:

- Press **record** to snapshot the initial known world state and begin capturing.
- Run **step** or **start agents** normally.
- Press **stop & download** to create the recording.
- Output uses the `.png` extension for broad compatibility while retaining APNG animation.
- It captures only the Babylon world canvas, excluding the crowded sidebar.
- Capture runs at 6 FPS, scales to at most 960 pixels wide, and stops automatically after 45 seconds.
- Initial state is embedded as JSON in the PNG `tEXt` chunk named `geebr.world.initial-state`.
- Embedded data includes agents, positions, facing directions, brain configuration, props, blocks, allowed commands, history, turn state, camera state, and recording dimensions/timing.

The first implementation exposed three useful browser/WebGPU issues that were corrected:

1. UPNG required the pako DEFLATE dependency.
2. Drawing the WebGPU canvas into a 2D canvas produced black frames.
3. Timer-driven GPU readback raced the WebGPU swap-chain texture and caused a destroyed-texture validation error.

The final recorder reads pixels through Babylon after `scene.render()`, synchronized with the render loop, and produces working, correctly oriented animation.

#### 3. Made orientation explicit in agent perception

The ASCII map now has compass labels positioned around the grid:

- N centered above
- S centered below
- W at the left of the middle row
- E at the right of the middle row

This creates a fairer navigation experiment. It distinguishes failure caused by a missing coordinate convention from failure to use a clearly stated convention.

#### 4. Disambiguated map glyphs

Walls and rocks now use separate symbols:

- `#` = wall
- `r` = rock

The dynamic legend reports these independently. This removes an avoidable perception ambiguity.

#### 5. Corrected visual movement facing

The character artwork faces local `-Z`, but the old yaw calculation assumed `+Z` was its front. As a result, characters could appear to walk backward even when logical movement was correct.

The facing calculation now maps the artwork's visible front to the movement vector for north, south, east, and west. This fix is currently awaiting a final visual check before its own commit.

#### 6. Preserved related model controls

The current worktree also included the already-started thinking-mode wiring for Gemma/LiteRT. It was included in the release-preparation commit rather than discarded. It should not become tonight's focus unless it is needed for one controlled comparison.

### Version-control checkpoint

The main release-preparation changes were committed and pushed:

- Commit: `81df236`
- Message: `add APNG incident recorder and clarify agent perception UI`
- Branch: `main`

The subsequent visual-facing correction is not yet committed at the time of this update.

---

## What to do next tonight

The next step is **not more general polishing**. The next step is to capture and publish the first incident.

### Immediate sequence

1. **Hard-refresh and visually verify facing**
   - Place one geebr.
   - Issue one step in each cardinal direction if practical.
   - Confirm its face/eyes point in the direction of travel.
   - If correct, commit and push the small facing fix.

2. **Prepare one clean navigation trial**
   - Use one agent.
   - Enable only `walk`.
   - Give one concrete goal such as `walk to the water` or `walk to the fence`.
   - Put the agent and target in the same readable camera view.
   - Collapse the sidebar after setup.

3. **Capture the trial**
   - Start recording before the first model step.
   - Prefer stepping manually at first so the sequence remains understandable.
   - Continue long enough to show a pattern, not merely one wrong move.
   - Stop once circling, oscillation, repeated reversal, or successful navigation is evident.
   - Aim for 10–25 seconds; do not use the full 45 seconds unless necessary.

4. **Save exact evidence alongside the APNG**
   - Copy the exact initial perception/prompt.
   - Record the exact goal.
   - Preserve the command sequence from history.
   - Note model, thinking-mode setting, allowed commands, and whether the compass labels were present.
   - The APNG metadata is useful for provenance but should not replace visible captions.

5. **Run one controlled comparison only if cheap**
   - Preferred comparison: compass labels present versus the known earlier unlabeled behavior.
   - Optional comparison: thinking mode off versus on.
   - Change only one variable per comparison.
   - Do not begin broad model benchmarking tonight.

6. **Select the strongest artifact**
   - If the labeled-map agent still circles, publish that: it is the stronger spatial-reasoning failure.
   - If labels fix navigation, publish the before/after as an interface-design finding.
   - If the run is merely noisy rather than legible, reset once and capture one cleaner run; do not redesign navigation.

7. **Build Incident 01**

Suggested title:

> **Incident 01: The Water Is Right There**

Use this compact structure:

- **Goal:** Walk to the water.
- **Available action:** `walk(north|south|east|west)` only.
- **What it saw:** Exact compass-labeled ASCII map.
- **What it decided:** Short command sequence or representative loop.
- **What happened:** APNG.
- **Failure type:** Spatial orientation and symbolic-map navigation.
- **Explanation:** One or two sentences; do not over-explain architecture.

8. **Publish before adding another feature**
   - A single strong incident is enough.
   - Ask: **What simple task should I give the agent next—especially one you expect it to fail?**
   - If there is time after publishing, capture Incident 02 from an audience suggestion or the lamp loop.

---

## Scope guard for the remainder of the night

### Allowed because they directly improve the incident

- a tiny bug fix that makes the recording truthful;
- adjusting the camera before capture;
- resetting or simplifying the scene;
- cropping or compressing the exported APNG;
- adding captions to the incident page;
- one controlled A/B comparison;
- correcting a misleading perception symbol.

### Still deferred

- replacing the character model;
- replacing the mushroom house;
- broad asset improvements;
- full UI redesign;
- pathfinding or navigation memory;
- adding world-space compass scenery;
- generalized replay/import tooling for embedded APNG state;
- recorder timelines, editing controls, or a recording library;
- broader model selection and benchmarking;
- new scenario-authoring systems.

The recorder is complete enough. The perception is fair enough. The next deliverable is evidence, not another subsystem.
