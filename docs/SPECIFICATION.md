# CivicLens — AI Triage for Citizen Complaints (Bengaluru, Karnataka)

> **A smarter city starts with someone speaking up.**
>
> Bengaluru-first civic platform: CivicLens turns a citizen's text, voice recording, photograph and confirmed issue location into a structured civic ticket for the Greater Bengaluru Area. It helps officers prioritise and route work, lets citizens follow verified progress, and encourages civic participation through recognition and games.

---

## Contents

- [1. Product overview](#1-product-overview)
  - [Bengaluru, Karnataka deployment context](#bengaluru-karnataka-deployment-context)
- [2. Goals and core workflow](#2-goals-and-core-workflow)
- [3. User roles and application areas](#3-user-roles-and-application-areas)
- [4. Complaint reporting](#4-complaint-reporting)
  - [Location capture and permissions](#location-capture-and-permissions)
  - [Duplicate detection, including the same citizen's reports](#duplicate-detection-including-the-same-citizens-reports)
  - [Voice reporting and transcription](#voice-reporting-and-transcription)
  - [Photo evidence](#photo-evidence)
- [5. AI triage and routing](#5-ai-triage-and-routing)
- [6. Citizen portal](#6-citizen-portal)
- [7. Municipal command centre](#7-municipal-command-centre)
- [8. CleanRoute — garbage collection tracker](#8-cleanroute--garbage-collection-tracker)
- [9. CivicVerse — games and engagement](#9-civicverse--games-and-engagement)
- [10. Appreciation certificates and civic recognition](#10-appreciation-certificates-and-civic-recognition)
- [11. Easter eggs and signature experiences](#11-easter-eggs-and-signature-experiences)
- [12. Technology stack](#12-technology-stack)
- [13. Architecture](#13-architecture)
- [14. Repository structure](#14-repository-structure)
- [15. Database design](#15-database-design)
- [16. API design](#16-api-design)
- [17. Visual design system — Civic Minimalism](#17-visual-design-system--civic-minimalism)
- [18. Security, privacy and reliability](#18-security-privacy-and-reliability)
- [19. Development phases](#19-development-phases)
- [20. Local setup](#20-local-setup)
- [21. Environment variables](#21-environment-variables)
- [22. Demo data and honest simulation labels](#22-demo-data-and-honest-simulation-labels)
- [23. Acceptance checklist](#23-acceptance-checklist)
- [24. Future enhancements](#24-future-enhancements)
- [25. Useful references](#25-useful-references)

---

## 1. Product overview

CivicLens is a civic engagement and municipal operations platform with four connected experiences:

1. **Citizen Portal** — submit issues using text, voice, photos and location; track progress; follow nearby reports; play civic games; receive recognition.
2. **Municipal Command Centre** — review an AI-prioritised complaint queue, verify classifications, assign departments and field workers, and record resolution evidence.
3. **CleanRoute** — view garbage vehicles, collection routes, public bins and collection progress on a map. The prototype uses simulated GPS and bin readings; a real deployment can connect to vehicle GPS and IoT devices.
4. **CivicVerse** — play short civic-awareness games, complete neighbourhood challenges and unlock achievements.

CivicLens is not just a complaint form. Its end-to-end purpose is to help a report move from **citizen observation → AI-assisted triage → municipal action → verified resolution → citizen recognition**.

### Product principles

- **Accessible:** citizens can type, speak, upload a photo or pin a location.
- **Multilingual:** English, Hindi, Tamil, Telugu, Kannada and Malayalam are supported in the intended experience.
- **Location-aware:** use GPS only with user permission, and always provide a manual location option.
- **Transparent:** show why a report was classified or prioritised and let an authorised officer correct it.
- **Duplicate-aware, not duplicate-blocking:** surface nearby matching reports and let citizens join or add evidence to an existing incident, while preserving a way to report a genuinely different issue.
- **Human-supervised:** AI recommendations do not replace emergency services or municipal decision-making.
- **Privacy-conscious:** do not expose a citizen's personal details on public maps or public tracking pages.
- **Civic minimalism:** functional, restrained, accessible design without gradients or visual clutter.


### Bengaluru, Karnataka deployment context

**CivicLens is a Bengaluru-first pilot for the Greater Bengaluru Area, Karnataka, India.** It should not use a generic or Chennai/Delhi sample geography. The default map, address search, demo records, civic-agency routing and language experience must all be configured for Bengaluru.

#### Local governance model

Bengaluru's civic administration has been reorganised under the **Greater Bengaluru Governance Act, 2024 (Karnataka Act No. 36 of 2025)**. The framework identifies the Greater Bengaluru Authority (GBA), City Corporations and Ward Committees as civic authorities. The Karnataka Government notified five City Corporations in September 2025:

1. Bengaluru Central City Corporation
2. Bengaluru East City Corporation
3. Bengaluru North City Corporation
4. Bengaluru South City Corporation
5. Bengaluru West City Corporation

For CivicLens, model the routing hierarchy as:

```text
Greater Bengaluru Authority (coordination / oversight)
  └── City Corporation (Central / East / North / South / West)
        └── Zone or division (load from current official data)
              └── Ward (load from current official data)
                    └── Responsible department / field team
```

Do not hard-code old BBMP zone or ward boundaries as if they are necessarily the current GBA boundaries. Existing legacy BBMP datasets and webpages may still be useful for historical context, but CivicLens must use the latest official GBA / City Corporation boundary data for its active pilot. Store boundary dataset version, source and import date so that a boundary change does not silently reassign old tickets.

Official starting points:
- [Greater Bengaluru Governance Act — India Code](https://indiacode.gov.in/server/api/core/bitstreams/fddb33e7-b5e3-40b5-9ff1-d274de327607/content)
- [Greater Bengaluru Authority — City Corporation delimitation maps](https://www.bbmp.gov.in/maps/)
- [Government of Karnataka — Bengaluru West City Corporation / About GBA](https://bengaluruwest.karnataka.gov.in/about-gba)

#### Bengaluru service-area defaults

- Display name: **Bengaluru, Karnataka**.
- Country: **India**.
- Default map centre (approximate city-centre view): latitude `12.9716`, longitude `77.5946`.
- Suggested initial map zoom: `12` (adjust for desktop/mobile).
- Address-search bias: Bengaluru and Karnataka, India.
- Operational boundary: the union of the current official five GBA City Corporation polygons, not a manually drawn rectangle or a radius around the map centre.
- Store latitude/longitude in WGS84 (`EPSG:4326`) and use PostGIS geography for distance calculations.

The default centre is only a map starting point. It is **not** the user's location and must never be submitted as the incident location automatically. Ask the citizen to use GPS or select the actual issue location on the map. GPS may locate the reporter, not the issue; always allow the pin to be moved.

If a selected point appears outside the supported Greater Bengaluru boundary, show a clear notice and let the citizen correct the pin. If it is genuinely outside the pilot service area, mark it as `outside_service_area` / `needs_manual_routing` or explain that this pilot currently covers Greater Bengaluru; do not silently route it to an unrelated Bengaluru ward. Keep this behaviour configurable for future expansion across Karnataka.

#### Bengaluru language experience

Provide a visible language switcher and support these six languages throughout complaint intake and status communication:

| Language | Code | UI label |
|---|---|---|
| Kannada | `kn` | ಕನ್ನಡ |
| English | `en` | English |
| Hindi | `hi` | हिन्दी |
| Tamil | `ta` | தமிழ் |
| Telugu | `te` | తెలుగు |
| Malayalam | `ml` | മലയാളം |

Kannada should be prominent as the local language, but do not force it as the user's language. Respect the user's saved preference, browser locale or explicit selection. Keep the original typed text and voice transcript exactly as approved by the citizen; any translation is an additional field used to help officers, not a replacement.

#### Bengaluru civic-agency routing

Do not assume every issue belongs to a single municipal department. Bengaluru has city corporations and other civic utilities. Build an **authority-routing registry** that stores the suggested authority, responsibility area, contact/escalation metadata, effective dates and source. The AI predicts the issue type; backend rules plus location/asset ownership choose the likely authority; an authorised officer can correct it.

| Reported issue | Initial routing suggestion | Important qualification |
|---|---|---|
| Pothole, footpath or damaged public street | Relevant City Corporation engineering / road team | Road ownership may belong to another authority (for example, a state/national highway or another agency). Resolve from the road/asset inventory where possible; otherwise send to a municipal triage queue. |
| Overflowing public bin, litter, missed municipal collection | Relevant City Corporation solid-waste / sanitation team | Include corporation, zone/division and ward from current boundary data. |
| Water-supply leak, water shortage, sewer connection or sewage-network issue | Bengaluru Water Supply and Sewerage Board (BWSSB) | Distinguish water/sewer network issues from stormwater drains and surface flooding. |
| Blocked stormwater drain, road flooding or open roadside drain | Relevant City Corporation engineering / stormwater-drain team | If the issue is actually a sewer line or sewer overflow, consider BWSSB routing. Human review may be needed. |
| Broken streetlight fixture or municipal streetlight pole | Relevant City Corporation electrical / engineering team | A live wire, damaged power-distribution line or supply outage should be escalated to BESCOM / emergency handling as appropriate. |
| Power outage, exposed distribution wire or damaged electricity infrastructure | Bangalore Electricity Supply Company Limited (BESCOM), where within its service area | Do not treat a streetlight fixture fault and a dangerous electricity-network fault as the same category. Immediate hazards require urgent human escalation. |
| Fallen tree, dangerous branch or public park maintenance | Relevant City Corporation horticulture / parks team | Route based on the land/road/park owner; a tree on another agency's land may need a different authority. |
| Damaged bus shelter, public toilet or other public asset | Relevant asset-owning City Corporation or agency | Resolve the actual asset owner rather than relying only on the complaint keyword. |

Useful agency references:
- [BWSSB — functions and responsibilities](https://mybwssb.org/content/about-bwssb-0)
- [BESCOM — official portal and consumer services](https://www.bescom.co.in/)
- [GBA City Corporation maps](https://www.bbmp.gov.in/maps/)

These are starting routing rules for the prototype, not a guarantee of legal asset ownership in every street. Before a real deployment, verify each category, asset owner, ward responsibility and escalation pathway with the relevant corporation and utility. Keep all mappings editable in the admin dashboard.

#### Bengaluru demo geography

Use recognisable Bengaluru localities for demo records, without hard-coding their corporation or ward assignment unless that assignment comes from the imported official boundary data. Example demo locality names include Malleshwaram, Rajajinagar, Vijayanagar, Shivajinagar, Indiranagar, Whitefield, Koramangala, Jayanagar, Basavanagudi and JP Nagar. These names are for demo content and search testing; the location polygon lookup must determine the actual corporation/ward.

---

## 2. Goals and core workflow

### Required capabilities

- Accept complaint text in English or a supported regional language.
- Accept an optional photograph and/or a voice recording.
- Capture the incident location using browser geolocation or a manually selected map pin.
- Detect an existing report by the same citizen at or near the same location and show it before creating another ticket.
- Suggest possible reports from other citizens at the same location.
- Classify the problem (roads, waste, water, electricity, trees, drainage, public infrastructure and configurable categories).
- Assign Low / Medium / High / Critical severity with a one-line explanation.
- Recommend the correct municipal department.
- Show tickets in a dashboard sorted by priority.
- Track assignment, field work, evidence and verified resolution.
- Generate appreciation certificates only after an authorised resolution verification.
- Provide a realistic-looking but clearly labelled simulated garbage tracker for the prototype.

### End-to-end workflow

```mermaid
flowchart TD
    A[Citizen opens Report an Issue] --> B[Enter text, record voice, or add photo]
    B --> C[Choose or capture incident location]
    C --> D[Transcribe voice and prepare complaint]
    D --> E[Find nearby and previous matching reports]
    E --> F{Possible existing incident?}
    F -- Yes --> G[Show matches and choices]
    G --> H{Citizen choice}
    H -- Follow or add evidence --> I[Link citizen to existing incident]
    H -- This is different --> J[Continue with new report]
    F -- No --> J
    J --> K[AI classification, image analysis and severity recommendation]
    K --> L[Department routing and priority score]
    L --> M[Create ticket]
    M --> N[Officer reviews, assigns and updates]
    N --> O[Worker uploads completion evidence]
    O --> P[Supervisor verifies resolution]
    P --> Q[Notify citizen and issue certificate]
```

---

## 3. User roles and application areas

### Citizen

- Register, sign in and manage profile.
- Submit a report by typing, voice or photo.
- Give location permission or pin the issue manually.
- Review possible duplicate reports before submitting.
- Follow a nearby existing incident or add supporting evidence.
- Track the ticket timeline and receive notifications.
- Confirm whether the repair appears complete or request reopening.
- View civic points, achievements, certificates and game history.

### Municipal officer

- View the command centre for their authorised department or zone.
- See priority-sorted tickets and filters.
- Review AI category, severity, confidence and explanation.
- Correct AI suggestions and record the reason for a change.
- Assign a field worker or team.
- Add internal notes and citizen-visible updates.
- Upload before/after photographs and completion notes.
- Mark work as awaiting verification; do not independently issue a citizen certificate unless authorised to verify.

### Administrator / supervisor

- Manage users, departments, zones, workers and permissions.
- Configure category-to-department mapping and severity thresholds.
- Configure service-level targets (SLAs).
- Review escalations, audit logs and performance analytics.
- Verify resolutions and approve reopening or closure.
- Manage game content, achievements and certificate templates.
- Configure garbage vehicles, routes, bins and demo-mode settings.

Use role-based access control. A user should only see actions and data permitted by their role, department and assigned area.

---

## 4. Complaint reporting

The reporting experience should be simple enough for someone who is unfamiliar with online forms. Offer three equally visible input methods:

- **Type a complaint** — a normal text area.
- **Speak a complaint** — record audio and transcribe it.
- **Upload a photo** — attach visual evidence, with or without text or audio.

A citizen may use any one method or combine them. Location should be requested as a separate, clearly explained step.

### Suggested reporting steps

1. Choose a language or leave language detection on automatic.
2. Type a description, record a voice note, and/or attach photographs.
3. Capture the incident's location or select it on a map.
4. Review the transcribed text (if voice was used) and edit mistakes.
5. Review nearby / previous possible matching reports.
6. Choose whether to follow an existing report or continue with a new one.
7. Review the AI-generated summary, category and severity recommendation.
8. Confirm and submit the ticket.

### Location capture and permissions

Location is central to CivicLens. It is used for routing, map placement, duplicate suggestions and neighbourhood-level analytics.

#### Citizen experience

Provide two clear controls:

- **Use my current location** — requests browser location permission after the citizen taps the control.
- **Choose location on map** — allows the citizen to move a pin or search for an address if permission is denied, unavailable or inaccurate.

Do not silently request geolocation on page load. Explain why the location is needed before the browser permission prompt, for example:

> CivicLens uses the location of the issue to find nearby reports and send it to the correct municipal team. Your precise location is not shown publicly.

Use the browser Geolocation API (`navigator.geolocation.getCurrentPosition`) over HTTPS (localhost is suitable for local development). Store:

- latitude and longitude;
- reported accuracy in metres;
- capture source (`gps`, `map_pin` or `address_search`);
- capture timestamp;
- optional human-readable address from reverse geocoding.

The citizen must be able to adjust the pin if GPS identifies their current position rather than the location of the issue. Make it clear that **the issue location may be different from the reporter's current location**.

#### Location fallback behaviour

| Situation | Expected behaviour |
|---|---|
| Permission granted | Read coordinates and show the location on the map for confirmation. |
| Permission denied | Explain how to enable permission, but keep the manual map-pin flow available. |
| GPS unavailable or times out | Show address search and manual pin selection. |
| Accuracy is poor | Display the accuracy and ask the citizen to adjust the pin if necessary. |
| Citizen does not want to share precise GPS | Allow manual address or approximate map location where municipal policy permits. |

Never treat a failed location lookup as a failed complaint. Let the citizen continue with a manually selected location, while marking location confidence/source appropriately.


#### Bengaluru service-area lookup and reverse geocoding

For this Bengaluru pilot, after the citizen confirms the pin:

1. Reverse-geocode the coordinates with an approved provider to obtain a readable locality, street/landmark and PIN code where available.
2. Run a point-in-polygon lookup against the imported current GBA corporation boundaries.
3. Resolve the matching City Corporation and, if available in the source data, its division/zone and ward.
4. Use the issue category and asset ownership rules to recommend the responsible department or external utility.
5. Show the locality and suggested municipal jurisdiction to the citizen before final submission.

Do not infer corporation or ward from the locality name alone. Locality names can cross boundaries and spelling variants are common. Store the coordinates as the authoritative spatial input, with address text as a human-readable aid. If reverse geocoding fails, the citizen can still submit with the pin and a landmark.

Add a service-area response such as:

```json
{
  "service_area": "greater_bengaluru",
  "inside_service_area": true,
  "city_corporation": "bengaluru_east",
  "division_code": null,
  "ward_code": null,
  "locality": "Indiranagar",
  "location_source": "map_pin",
  "boundary_dataset_version": "configure-from-imported-official-data"
}
```

The corporation/locality values above are illustrative. The API must calculate them from the currently imported boundary dataset.

#### Suggested location fields

```text
latitude: decimal
longitude: decimal
location_accuracy_m: decimal | null
location_source: gps | map_pin | address_search
location_captured_at: timestamp | null
location_address: string | null
```

Use PostgreSQL with PostGIS for spatial queries. Store coordinates in a geographic point using SRID 4326 and create a spatial index.

### Duplicate detection, including the same citizen's reports

**This is a key user experience and must happen before the final ticket is created.** If a citizen has already reported a pothole, overflowing bin or leak at the same location, CivicLens should show that earlier report and provide useful choices instead of silently creating a second ticket or blocking the citizen.

#### When duplicate checking runs

Run a first duplicate check after the citizen has supplied the description/transcript and issue location, and before final submission. Run a second, broader similarity check after AI classification has identified the likely category. This allows the system to find matches even when citizens describe the same problem differently.

#### Matching signals

1. **Same citizen:** find the current user's previous reports, including active reports and recent resolved reports.
2. **Location proximity:** compare the new issue point against previous issue points using PostGIS distance functions.
3. **Category:** compare the AI-predicted category and subcategory, where available.
4. **Description similarity:** compare text embeddings or normalised text similarity.
5. **Time and status:** prioritise active reports and recent incidents; keep older resolved reports visible as context where helpful.

Suggested initial settings for a prototype (make these configurable, not hard-coded):

- Same-user nearby match radius: **150 metres**.
- Community nearby match radius: **100 metres**.
- Active-report lookback: **180 days**.
- Increase the search radius only for categories where the incident footprint is naturally larger, such as flooding or fallen trees.

These are starting values for testing, not universal rules. Tune them with real municipal geography and false-positive feedback. Do not match by location alone: nearby streetlights, potholes and water leaks can be different incidents.

#### What the citizen should see

Example message:

> **You may have reported this issue before.** We found a pothole report close to the location you selected.
>
> Ticket: `CL-2026-00142` · Road damage · 42 m away · In progress

Offer explicit options:

- **View existing report** — open its public-safe details and timeline.
- **Follow this report** — subscribe to updates without creating another ticket.
- **Add photo or information** — attach new evidence or a comment to the existing incident, subject to permissions and audit history.
- **This is a different issue — continue** — let the citizen create a new report and optionally explain why it is different.
- **Not sure** — allow them to review the candidate before deciding.

For a same-user match, make the earlier report especially visible and offer **Continue existing report** as the recommended option. Do not prevent a new report: the citizen may be reporting a new pothole a few metres away, a recurrence after repair, or a separate incident at the same property. If they continue, record that they reviewed the duplicate suggestion and chose to proceed.

#### Linking reports from multiple citizens

If several citizens report the same incident, support one canonical incident with linked reports / followers:

- One primary municipal work item.
- Each citizen's original submission retained as a linked report.
- Count of supporting reports shown to the officer.
- New photos and observations attached with author and timestamp.
- Each linked citizen can receive status updates without seeing other reporters' private information.

Only an authorised officer or supervisor should confirm that two reports represent the same physical incident. AI similarity should suggest candidates, not irreversibly merge them.

#### Duplicate-check API response example

```json
{
  "has_possible_duplicates": true,
  "matches": [
    {
      "ticket_id": "CL-2026-00142",
      "category": "roads",
      "subcategory": "pothole",
      "status": "in_progress",
      "distance_m": 42,
      "same_reporter": true,
      "created_at": "2026-11-20T08:30:00Z",
      "similarity": 0.91
    }
  ],
  "recommended_action": "follow_or_add_evidence"
}
```

Do not expose the other citizen's name, phone number, email, exact personal location or uploaded metadata in this response.

### Voice reporting and transcription

Voice reporting is a first-class feature, not a hidden accessibility option. Many citizens may find speaking easier than typing, especially when using a regional language or when typing is difficult.

#### Citizen voice experience

The report form should include a large microphone button labelled **Speak your complaint**.

1. Citizen selects (or confirms) a language: English, Hindi, Tamil, Telugu, Kannada or Malayalam. Automatic detection may be offered where supported.
2. On tap, request microphone permission using `navigator.mediaDevices.getUserMedia({ audio: true })`.
3. Record audio in the browser using `MediaRecorder`.
4. Show a clear recording state, elapsed time, pause/stop action and discard action.
5. Upload the audio securely to FastAPI using multipart form data.
6. FastAPI sends the audio to OpenAI's audio transcription endpoint using the configured transcription model.
7. Return transcript text and the detected/selected language when available.
8. Display the transcript in an editable text box.
9. Citizen corrects the transcript and confirms **Use this as my complaint**.
10. Send the confirmed transcript through the same duplicate check and AI triage pipeline as typed complaints.

The user must be able to listen to their recording before submission where practical, re-record it, or discard it. Do not automatically submit a report immediately after transcription: a citizen must be able to review and correct the words first.

#### Regional language support

Target languages:

- English (`en`)
- Hindi (`hi`)
- Tamil (`ta`)
- Telugu (`te`)
- Kannada (`kn`)
- Malayalam (`ml`)

Show Kannada prominently in the Bengaluru interface while keeping all six languages selectable. Do not force Kannada based only on GPS location; preserve the citizen's saved or chosen language.

Keep both the original transcript and (if used) a translated/normalised version. The original is the source of truth. Use translation only to support classification, officer understanding or search; do not replace the citizen's original words. Validate the actual transcription quality for each target language with native speakers and real-world noisy recordings. If a language is uncertain or the transcript is poor, ask the citizen to edit it or offer a manual submission path.

#### Audio handling and limits

- Configure a maximum recording duration, such as 90 seconds for the prototype.
- Validate file size, MIME type and duration on the backend.
- Use a generated server-side filename; never trust the uploaded filename.
- Store audio only when needed and according to the retention policy. The simplest prototype can delete temporary audio after transcription, while retaining the citizen-approved transcript.
- Do not log raw audio or sensitive transcripts in application logs.
- Tell users when audio is being uploaded for transcription.
- Provide a text entry fallback if microphone permission is denied or the browser does not support recording.
- Serve the application over HTTPS in deployment; microphone access generally requires a secure context (localhost is suitable for development).

#### Voice API flow

```text
React MediaRecorder
    -> POST /api/voice/transcribe (multipart audio + optional language hint)
    -> FastAPI validates file and duration
    -> OpenAI audio transcription API
    -> transcript + language metadata returned
    -> citizen reviews and edits transcript
    -> POST /api/complaints/duplicate-check
    -> POST /api/complaints/ (confirmed report)
```

Voice reporting must feed the same ticket pipeline as typed complaints. Do not create a separate voice-only ticket process.

### Photo evidence

Allow JPEG, PNG and WebP images, subject to server-side MIME verification, maximum file size and image dimension limits. Show a preview before upload. Strip EXIF metadata where appropriate, especially GPS metadata, unless the citizen explicitly chooses to share it. Use OpenAI vision-capable models to describe visible evidence, but do not claim that a photograph proves the full severity, precise location or cause of an incident.

A photo can support, but should not be required for, a complaint.

---

## 5. AI triage and routing

Use the OpenAI API from the **FastAPI backend only**. Never expose the OpenAI API key in React, browser storage or a public environment variable. Use the current Responses API for text and image understanding, and the audio transcription API for voice-to-text. Keep model names configurable in environment variables so they can be changed without editing application code.

### AI pipeline

1. **Language detection:** identify the original language or use the citizen's selected language.
2. **Text normalisation:** clean accidental whitespace and prepare the transcript/typed description without changing the source text.
3. **Image understanding:** if a photo exists, describe relevant visible evidence and note uncertainty.
4. **Classification:** predict category and subcategory from the configured taxonomy.
5. **Information extraction:** create a concise summary and extract details such as road name, landmark, issue scale and duration when explicitly present.
6. **Duplicate suggestions:** combine category, text similarity and spatial proximity.
7. **Severity recommendation:** use AI-assisted assessment plus transparent deterministic rules.
8. **Department routing:** map the selected category to a department using server-side configuration.
9. **Human-review decision:** flag uncertain, high-risk or contradictory cases for an authorised officer.
10. **Ticket creation:** validate and persist a structured ticket after citizen confirmation.

### Category and department mapping

| Category | Example subcategories | Suggested department |
|---|---|---|
| Roads | Pothole, damaged road, broken footpath | Road Maintenance |
| Waste | Overflowing bin, litter, missed collection | Sanitation |
| Water | Pipe leak, water shortage, contaminated supply | Water Department |
| Electricity | Broken streetlight, exposed wiring, power asset damage | Electrical Department |
| Trees | Fallen tree, dangerous branch | Parks and Horticulture |
| Drainage | Blocked drain, flooding, open manhole | Drainage Department |
| Public infrastructure | Damaged bench, bus shelter, public facility | Public Works |

Keep this taxonomy and department mapping in the database or admin configuration so municipalities can adapt it.

For the Bengaluru pilot, use the **Bengaluru civic-agency routing** table in the deployment context above as the initial configuration. The final assignment must also check corporation/ward boundaries and known asset ownership. Water/sewerage is generally routed to BWSSB; electricity distribution faults to BESCOM; and municipal street assets, sanitation and public spaces to the relevant City Corporation team, subject to the actual asset owner.

### Severity and priority

Severity labels:

- **Low:** limited impact, no immediate safety concern.
- **Medium:** noticeable disruption or maintenance issue requiring planned action.
- **High:** significant public impact or credible safety risk requiring urgent attention.
- **Critical:** credible immediate threat to life or serious injury, major hazard or severe public disruption; immediate human review and escalation are required.

A configurable scoring model can consider:

| Factor | Initial weight |
|---|---:|
| Safety risk | 35% |
| Public impact | 25% |
| Issue scale | 20% |
| Location sensitivity | 10% |
| Duration | 10% |

Example score:

```text
severity_score =
    0.35 * safety_risk +
    0.25 * public_impact +
    0.20 * issue_scale +
    0.10 * location_sensitivity +
    0.10 * duration
```

Each factor is on a 0–100 scale. Initial configurable mapping:

| Score | Label |
|---:|---|
| 0–24 | Low |
| 25–49 | Medium |
| 50–74 | High |
| 75–100 | Critical |

This is a prototype scoring scheme, not a municipal safety standard. Add explicit escalation rules for credible immediate-danger reports (for example exposed live electrical wires or a dangerous obstruction). An officer must be able to override the recommendation with a reason. If the classifier is uncertain, the image and text conflict, or the report suggests immediate danger, set `requires_human_review = true`.

Priority sorting should consider more than the severity label. A possible formula is:

```text
priority_score = severity_component + ageing_component + public_impact_component + SLA_component
```

Keep severity and operational priority as separate fields. A Medium issue that has been overdue for a long time may need to rise in the queue without being relabelled Critical.

### Structured AI result

Use Pydantic models to validate the AI output. An illustrative result:

```json
{
  "language": "ta",
  "category": "roads",
  "subcategory": "pothole",
  "summary": "A large pothole is reported near the main bus stop.",
  "severity": "high",
  "severity_score": 82,
  "reason": "The reported road damage near a busy bus stop may create a risk for road users.",
  "department_code": "road_maintenance",
  "confidence": 0.91,
  "image_observations": ["Visible damaged road surface"],
  "requires_human_review": false
}
```

This is illustrative output, not a guaranteed model response. Reject malformed or out-of-taxonomy values. Store the AI response and prompt/model metadata for audit, but do not store hidden reasoning or ask the model for private chain-of-thought. Save a concise explanation intended for the officer and citizen.

### Duplicate detection strategy

Use PostGIS to retrieve nearby candidates, then compare their category and text similarity. For larger datasets, store embeddings using pgvector. The initial implementation can use spatial filtering plus a lightweight text similarity method; add embeddings in a later phase.

AI must recommend duplicate candidates, not automatically merge tickets. Preserve original reports and audit all linking decisions.

---

## 6. Citizen portal

### Citizen home dashboard

Show:

- Welcome message and prominent **Report an Issue** action.
- My reports, unresolved reports and resolved reports.
- Civic contribution points and next achievement.
- Neighbourhood activity and public service updates.
- Quick access to CleanRoute, CivicVerse and certificates.

Use real backend values. Seeded demo values must be clearly identified as demo data.

### My complaints

Provide both a compact list and detail page. A complaint detail page should include:

- Ticket number and issue category.
- Citizen's original text or confirmed voice transcript.
- Uploaded evidence that the citizen is authorised to view.
- Approximate/public-safe incident location.
- Department, severity and current status.
- Status timeline and citizen-visible updates.
- Related/linked reports count.
- Add evidence or follow updates action.
- Reopen request where the issue remains unresolved.

Suggested status lifecycle:

```text
submitted -> ai_review -> verified -> assigned -> in_progress
          -> awaiting_verification -> resolved
          -> reopened (when approved)
```

Rejected or duplicate-linked reports should have explicit reasons and links to the primary report. Keep a full status history rather than overwriting the previous status.

### Notifications

Start with in-app notifications. Add email/SMS/push later based on the deployment's approved providers and consent. Notify citizens when:

- a report is submitted;
- an officer verifies or reclassifies it;
- a worker is assigned;
- work starts;
- new evidence is uploaded;
- the issue is resolved or reopened;
- a linked incident receives an important update;
- a certificate is issued.

---

## 7. Municipal command centre

### Overview dashboard

Recommended metrics:

- Total complaints.
- Critical and High severity reports.
- Unassigned tickets.
- In-progress tickets.
- Resolved tickets.
- Overdue tickets.
- Median resolution time.
- Resolution rate by department and zone.

### Priority queue

The default queue is sorted by operational priority (highest first), then SLA risk/age. Provide filters for:

- Severity and priority.
- Department and zone.
- Category and subcategory.
- Status and assignment.
- Date range.
- Human-review requirement.
- AI confidence range.

### Complaint detail for officers

Show:

- Original citizen text and language.
- Confirmed voice transcript (if submitted by voice).
- Image attachments and image observations.
- Incident location on a map.
- AI category, severity, confidence and one-line reason.
- Possible duplicate candidates and linked reports.
- Department and assignment history.
- Citizen-visible timeline and private internal notes (visually separate).
- Before/after evidence.

Officer actions:

- Confirm or correct classification.
- Change severity and record reason.
- Reassign department or zone.
- Assign a field worker/team.
- Add a citizen-visible update.
- Add a private internal note.
- Upload work evidence.
- Send the issue for supervisor verification.

### SLA monitoring

Make SLA targets configurable by issue category, severity and department. Example prototype targets can be seeded for a demo, but must be identified as sample configuration rather than legal or official municipal commitments. Show remaining time, overdue state and escalation history.

### Analytics

Useful views include complaint volume by category, map-based concentration, department workload, resolution time, reopened rate, duplicate rate and neighbourhood change over time. Do not publish personal citizen information in public analytics.

---

## 8. CleanRoute — garbage collection tracker

CleanRoute is the live sanitation experience. It should feel like an operations map rather than a decorative animation.

### Citizen view

For the Bengaluru pilot, initialise the map around `12.9716, 77.5946`, then fit the view to the imported Greater Bengaluru boundary when that dataset is available. Display the relevant City Corporation / ward filter and use only authorised or clearly simulated vehicle, bin and route records.

- Map showing public collection routes and public bin locations.
- Garbage vehicle markers and their current route state.
- Nearby bin status where data is available.
- Next scheduled collection window.
- Last updated time and data source label.
- Report overflowing bin action.

### Officer view

- Active vehicle list and route assignment.
- Vehicle ID, City Corporation/ward, collection route, task, route progress and last location update.
- Collection points and completion state.
- Bin fill levels and overflow-risk list.
- Missed collection alerts.
- Route history and collection events.

### Vehicle information panel

Example fields:

| Field | Example demo value |
|---|---|
| Vehicle ID | CL-GT-04 |
| City Corporation | Resolve from the official point-in-polygon boundary lookup |
| Ward | Resolve from the official ward polygon; keep fictional demo values labelled |
| Driver | Worker 024 (fictional demo identity) |
| Current task | Waste collection |
| Speed | 18 km/h (simulated) |
| Route progress | 72% |
| Next stop | Market Road |
| Estimated arrival | 8 minutes (simulated) |

Do not show personal driver information to the public unless the municipality has explicitly authorised it.

### Bin health monitoring

Suggested initial display thresholds:

| Fill level | Display state |
|---:|---|
| 0–50% | Normal |
| 51–80% | Filling up |
| 81–95% | Collection recommended |
| 96–100% | Overflow risk |

These are configurable prototype thresholds. A bin reading can come from an IoT sensor, a worker update or demo simulation. Always show the source and timestamp.

### Garbage route optimisation

A first version can order collection stops using a nearest-neighbour heuristic or a routing service. Prioritise bins with high fill levels while considering distance, vehicle capacity, road accessibility and scheduled collection needs. A later version can use a vehicle-routing optimisation library.

### Cleanliness heatmap and pickup prediction

- Heatmap: display zones with repeated overflow or missed collection reports.
- Pickup prediction: estimate when a bin may reach capacity from its current fill level and recent fill rate.
- Auto-alert: create a sanitation alert when a bin crosses a configured threshold.

Predictions must be labelled as estimates and should not claim sensor accuracy the system does not have.

### Prototype simulation versus real deployment

**Prototype:** create a small set of fictional vehicles with predefined GPS route coordinates. A backend simulator advances each marker along its route and broadcasts updates over WebSockets. Simulate bin percentages and collection events at a controlled interval.

**Real deployment:** integrate approved vehicle GPS feeds and actual bin sensors or worker collection updates. Validate timestamps, stale data, impossible jumps and device identity before broadcasting locations.

The prototype must display a clear **DEMO / SIMULATED GPS** label whenever simulated data is shown. Never present simulated positions as actual municipal vehicles.

---

## 9. CivicVerse — games and engagement

Games should teach civic awareness and be enjoyable, but should not reward complaint volume or encourage false reports.

### Recommended mini-games

1. **Clean City Challenge:** collect virtual litter and sort items into the correct bins. Correct sorting earns points; incorrect sorting loses points.
2. **Pothole Patrol:** identify road hazards and choose safe actions in short illustrated levels.
3. **Sort It Right:** timed waste segregation into wet, dry, recyclable and e-waste categories.
4. **Civic Detective:** find hidden civic issues in an illustrated neighbourhood scene.
5. **Build Your Neighbourhood:** use virtual points from game play to add parks, trees, streetlights and recycling facilities to a small virtual city.
6. **Civic Quiz Arena:** short quizzes about public safety, waste, water conservation and civic responsibility.

### Responsible points model

Example values, configurable by the administrator:

| Activity | Points |
|---|---:|
| First valid report after verification | 10 |
| Verified useful additional evidence | 10 |
| Verified resolution contribution | 30 |
| Complete a daily civic game | 5 |
| Complete a weekly civic challenge | 25 |

Do not award points simply for submitting many complaints. Apply daily caps to game rewards and require moderation/verification for real-world contribution points. Avoid public leaderboards that reveal precise home locations or sensitive complaint details.

---

## 10. Appreciation certificates and civic recognition

### Civic Impact Recognition Programme

When a citizen's valid report leads to a completed and verified municipal resolution, generate a personalised certificate of appreciation.

### Issuing workflow

1. Citizen submits a report.
2. Municipal team performs the repair or collection action.
3. Field worker uploads completion notes and after-photo where applicable.
4. An authorised officer or supervisor verifies the resolution.
5. System changes the ticket to `resolved`.
6. Certificate service creates a unique certificate record and PDF.
7. Citizen receives an in-app notification and can download or share the certificate.

Do not issue a certificate merely because a worker clicks a resolve button. Require the configured verification step, and allow a citizen to request reopening if the issue remains.

### Certificate details

- CivicLens / participating municipality branding.
- Title: **Certificate of Appreciation**.
- Citizen display name (with appropriate privacy settings).
- Contribution description.
- Related ticket number.
- Issue date and unique certificate ID.
- QR code or verification URL.
- Statement that the citizen contributed by reporting an issue that led to a verified improvement (do not imply that the citizen personally performed the repair).

Generate PDFs server-side using a PDF library or HTML-to-PDF renderer. Provide a public verification page that exposes only the certificate's authenticity and limited approved details.

### Recognition levels

| Level | Example requirement |
|---|---:|
| Civic Observer | 1 verified contribution |
| Neighbourhood Helper | 5 verified contributions |
| Community Guardian | 15 verified contributions |
| Civic Champion | 30 verified contributions |
| City Ambassador | 50 verified contributions |

Treat these as configurable achievement thresholds. Avoid making a citizen's rank a measure of how many complaints they can generate; focus on verified, useful contributions.

---

## 11. Easter eggs and signature experiences

These features add personality without distracting from the public-service purpose.

### Growing City

A small virtual neighbourhood appears on the citizen's profile. Verified contributions gradually add a tree, park, repaired road, streetlight or recycling station. The growth represents community participation, not a literal measurement of municipal construction.

### Secret Civic Achievements

Examples:

- **First Voice:** first verified voice-submitted report.
- **Water Guardian:** a verified water leak contribution.
- **Night Owl:** a verified streetlight issue reported after dark.
- **Clean Sweep:** a verified sanitation contribution.
- **Neighbourhood Watch:** useful supporting evidence added to an existing report.

### CivicBot

A small optional assistant mascot that provides civic tips, navigation shortcuts and short, friendly messages. It must not invent municipal status updates or pretend to be a government official.

### Neighbourhood transformation story

Show a timeline of verified improvements and aggregate counts, such as road repairs, streetlights restored, water leaks fixed and sanitation incidents resolved.

### “A thank you from your city”

After verified resolution, show a human message such as:

> Your voice helped make this neighbourhood better. Thank you for caring about your community.

### Golden Tree

A hidden visual reward unlocked by completing a special civic challenge. Clicking it reveals a short appreciation message.

---

## 12. Technology stack

### Frontend

- **React.js + Vite** — single-page application and development server.
- **Tailwind CSS** — utility-first styling.
- **shadcn/ui** — accessible reusable UI components.
- **React Router** — role-based navigation and page routing.
- **Lucide React** — consistent icon set.
- **React Leaflet + OpenStreetMap** — maps, markers and route display.
- **Recharts** — officer analytics and charts.
- **Zustand** — lightweight shared state where required.
- **Axios or fetch** — backend communication.
- **MediaRecorder API** — browser voice recording.
- **Browser Geolocation API** — consent-based location capture.

### Backend

- **Python + FastAPI** — REST API and WebSocket server.
- **Pydantic** — request/response validation.
- **SQLAlchemy** — database ORM.
- **Alembic** — database migrations.
- **JWT-based authentication** — access tokens and refresh strategy.
- **OpenAI API** — text/image reasoning and audio transcription.
- **Redis + Celery or a task queue** — background tasks if processing volume requires it.
- **PDF generator** — certificate creation.

### Data and infrastructure

- **PostgreSQL + PostGIS** — relational data and spatial search.
- **pgvector** — optional embeddings for semantic duplicate detection.
- **Redis** — cache, rate limiting support and background jobs.
- **S3-compatible storage or Cloudinary** — images and approved evidence files.
- **OpenStreetMap** — map data/tiles, subject to the tile provider's usage policy.
- **OSRM or an approved routing service** — road route geometry and estimated travel time.

---

## 13. Architecture

```mermaid
flowchart TB
    CIT[Citizen React App]
    OFF[Officer React Dashboard]
    ADM[Admin React Dashboard]

    CIT --> API[FastAPI Backend]
    OFF --> API
    ADM --> API

    API --> AUTH[Authentication and RBAC]
    API --> COM[Complaint Service]
    API --> VOICE[Voice Transcription Service]
    API --> LOC[Location and Duplicate Service]
    API --> TRACK[CleanRoute Service]
    API --> CERT[Certificate Service]
    API --> GAME[CivicVerse Service]

    COM --> OPENAI[OpenAI Responses API]
    VOICE --> AUDIO[OpenAI Audio Transcription API]
    COM --> RULES[Severity and Routing Rules]
    LOC --> POSTGIS[(PostgreSQL + PostGIS)]
    LOC --> VEC[(pgvector - optional)]

    API --> DB[(PostgreSQL)]
    API --> STORAGE[Object Storage]
    TRACK --> SIM[GPS and Bin Simulator]
    TRACK --> REAL[Real GPS / IoT Adapter - future]
    TRACK --> WS[WebSockets]
    WS --> CIT
    WS --> OFF
    CERT --> PDF[PDF and QR Generator]
```

Keep the frontend, API, AI services, and data access separate. The React application must never call OpenAI directly. FastAPI should own validation, permissions, audit logging and calls to external services.

---

## 14. Repository structure

Recommended monorepo layout:

```text
civiclens/
├── README.md
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── app/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   ├── common/
│   │   │   ├── complaints/
│   │   │   ├── maps/
│   │   │   └── dashboard/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── ai-triage/
│   │   │   ├── voice-reporting/
│   │   │   ├── location/
│   │   │   ├── duplicate-check/
│   │   │   ├── garbage-tracker/
│   │   │   ├── certificates/
│   │   │   ├── civicverse/
│   │   │   └── achievements/
│   │   ├── layouts/
│   │   ├── pages/
│   │   │   ├── public/
│   │   │   ├── citizen/
│   │   │   ├── officer/
│   │   │   └── admin/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── store/
│   │   ├── routes/
│   │   └── styles/
│   ├── .env.example
│   └── package.json
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── api/
│   │   ├── core/
│   │   ├── database/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   │   ├── openai_service.py
│   │   │   ├── transcription_service.py
│   │   │   ├── image_analysis_service.py
│   │   │   ├── classification_service.py
│   │   │   ├── severity_service.py
│   │   │   ├── routing_service.py
│   │   │   ├── duplicate_service.py
│   │   │   ├── location_service.py
│   │   │   ├── garbage_service.py
│   │   │   └── certificate_service.py
│   │   ├── workers/
│   │   └── utils/
│   ├── alembic/
│   ├── tests/
│   ├── .env.example
│   └── requirements.txt
│
├── infra/
│   ├── docker-compose.yml
│   └── database/
└── docs/
    ├── API.md
    └── architecture.md
```

Use a single React application with separate citizen, officer and admin layouts. This avoids maintaining three separate frontend projects while still keeping the experiences distinct.

---

## 15. Database design

Use PostgreSQL. Enable PostGIS for location queries. Add pgvector when semantic duplicate matching is introduced.

### Main tables

| Table | Purpose |
|---|---|
| `users` | Citizen, officer, supervisor and admin identities |
| `roles` / `user_roles` | Role-based permissions |
| `departments` | Municipal department and utility catalogue |
| `public_agencies` | GBA, five City Corporations and participating utilities such as BWSSB and BESCOM |
| `corporations` | Bengaluru Central/East/North/South/West City Corporation records |
| `zones` | Current corporation-specific zones/divisions imported from official data |
| `wards` | Ward codes, names and geometry from the current official boundary dataset |
| `service_boundaries` | Versioned corporation, ward and pilot service-area polygons |
| `authority_routing_rules` | Category + asset type + jurisdiction to likely agency/team mapping |
| `workers` | Field worker profiles and department/zone assignment |
| `complaints` | Canonical complaint/ticket records |
| `complaint_submissions` | Individual citizen reports linked to a canonical incident |
| `complaint_images` | Uploaded image metadata and storage key |
| `voice_transcripts` | Approved transcript, language and transcription metadata |
| `ai_analyses` | Versioned AI outputs and model metadata |
| `duplicate_candidates` | Suggested matching reports and similarity scores |
| `complaint_links` | Confirmed duplicate/supporting-report relationships |
| `assignments` | Complaint-to-worker/team assignments |
| `status_history` | Immutable ticket status history |
| `comments` | Citizen-visible updates and private officer notes |
| `resolution_evidence` | Before/after images and verification metadata |
| `certificates` | Certificate ID, user, complaint, issue and verification details |
| `notifications` | In-app notifications |
| `garbage_vehicles` | Vehicle and route configuration |
| `vehicle_locations` | Timestamped GPS or simulated GPS locations |
| `garbage_bins` | Public bin locations and identifiers |
| `bin_readings` | Fill level, timestamp and data source |
| `collection_events` | Collection records |
| `games` / `game_sessions` | Games and user scores |
| `achievements` / `user_achievements` | Achievement definitions and earned records |
| `civic_points_ledger` | Auditable points transactions |
| `audit_logs` | Important officer/admin actions |

### Important complaint fields

```text
id
public_ticket_number
created_by_user_id
category
subcategory
original_description
original_language
translated_description            nullable
severity
severity_score
priority_score
authoritative_department_id
status
location_geography                geography(Point, 4326)
location_accuracy_m               nullable
location_source                   gps | map_pin | address_search
location_address                  nullable
city                               Bengaluru
state                              Karnataka
country_code                       IN
service_area_code                  greater_bengaluru
city_corporation_code             nullable
division_code                     nullable
ward_code                         nullable
service_area_status               in_area | outside_service_area | needs_manual_routing
boundary_dataset_version          nullable
responsible_agency_id             nullable
ai_confidence                     nullable
requires_human_review
created_at
updated_at
resolved_at                       nullable
```

### Design note: incidents versus submissions

For duplicate handling, it is useful to distinguish a **canonical incident** from a **citizen submission**. Several citizen submissions can point to one incident. The original text, voice transcript, images and author of each submission remain attributable and auditable, while officers can manage one municipal work item. A citizen can also submit a new incident when a previous report was resolved and the problem has returned.

### Location indexes

- Add a GiST index to the PostGIS geography column.
- Add ordinary indexes for `created_by_user_id`, `status`, `category`, `department_id` and `created_at`.
- Use a spatial distance query such as `ST_DWithin` for candidate retrieval.
- Perform text/category similarity after the spatial candidate set has been narrowed.

---

## 16. API design

All endpoints should be versioned under `/api/v1`. Require authentication for personal reports and officer actions. Public verification endpoints should return only approved fields.

### Authentication and profile

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/auth/register` | Register |
| POST | `/api/v1/auth/login` | Sign in |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| GET | `/api/v1/users/me` | Current user's profile |
| PATCH | `/api/v1/users/me` | Update profile/preferences |

### Location and complaints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/locations/service-area-check` | Check whether a pin is inside the supported Greater Bengaluru boundary and resolve its corporation/ward |
| GET | `/api/v1/locations/reverse-geocode` | Return a human-readable Bengaluru address/locality for confirmed coordinates |
| GET | `/api/v1/locations/boundaries` | Return current corporation/ward boundary metadata for map filters |
| POST | `/api/v1/voice/transcribe` | Upload audio and return transcript |
| POST | `/api/v1/complaints/duplicate-check` | Find matching reports before submission |
| POST | `/api/v1/complaints` | Submit confirmed report |
| GET | `/api/v1/complaints` | List permitted complaints |
| GET | `/api/v1/complaints/{ticket_id}` | Complaint details |
| GET | `/api/v1/complaints/{ticket_id}/timeline` | Status history |
| POST | `/api/v1/complaints/{ticket_id}/follow` | Follow an existing incident |
| POST | `/api/v1/complaints/{ticket_id}/evidence` | Add photo or supporting information |
| POST | `/api/v1/complaints/{ticket_id}/reopen-request` | Request reopening |
| POST | `/api/v1/complaints/{ticket_id}/analyze` | Run/re-run AI analysis where authorised |

### Officer operations

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/officer/queue` | Priority-sorted queue |
| GET | `/api/v1/officer/dashboard` | Department dashboard metrics |
| PATCH | `/api/v1/complaints/{ticket_id}/classification` | Confirm/correct AI classification |
| PATCH | `/api/v1/complaints/{ticket_id}/assignment` | Assign department/worker |
| PATCH | `/api/v1/complaints/{ticket_id}/status` | Update status |
| POST | `/api/v1/complaints/{ticket_id}/notes` | Add internal/citizen-visible note |
| POST | `/api/v1/complaints/{ticket_id}/resolution-evidence` | Upload repair evidence |
| POST | `/api/v1/complaints/{ticket_id}/verify-resolution` | Supervisor verifies resolution |

### CleanRoute

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/garbage/vehicles` | Active vehicle list |
| GET | `/api/v1/garbage/vehicles/{vehicle_id}` | Vehicle details |
| GET | `/api/v1/garbage/routes` | Active and scheduled routes |
| GET | `/api/v1/garbage/bins` | Bin locations and latest readings |
| POST | `/api/v1/garbage/bins/{bin_id}/reading` | Add authorised sensor/worker reading |
| POST | `/api/v1/garbage/collections` | Record a collection event |
| POST | `/api/v1/demo/garbage/start` | Start demo simulator (admin/dev only) |
| WS | `/ws/v1/garbage/live` | Stream vehicle and bin updates |

### Certificates, games and analytics

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/certificates` | Current user's certificates |
| GET | `/api/v1/certificates/{certificate_id}` | Certificate details/download |
| GET | `/api/v1/certificates/verify/{code}` | Public-safe verification |
| GET | `/api/v1/games` | Available games |
| POST | `/api/v1/games/sessions` | Start a game session |
| POST | `/api/v1/games/sessions/{session_id}/score` | Submit score for server validation |
| GET | `/api/v1/achievements` | Achievement catalogue and user's progress |
| GET | `/api/v1/analytics/overview` | Authorised dashboard metrics |

### Duplicate-check request example

```json
{
  "description": "There is a deep pothole near the bus stop.",
  "language": "en",
  "latitude": 12.9756,
  "longitude": 77.6050,
  "location_address": "Near MG Road, Bengaluru, Karnataka, India",
  "service_area": "greater_bengaluru",
  "location_accuracy_m": 18,
  "location_source": "gps",
  "category_hint": "roads"
}
```

### Complaint submission request

Use `multipart/form-data` when files are attached, or a JSON request when there are no files. The backend should accept:

- `description` — citizen-confirmed text or transcript;
- `original_language`;
- `latitude`, `longitude`, accuracy and source;
- optional image file(s);
- optional `existing_incident_action` and `existing_ticket_id` when the citizen follows/adds evidence to a previously suggested incident;
- `duplicate_override_reason` when the citizen confirms a new, distinct report despite a match.

Do not trust category, severity, department or priority submitted by the browser. Recompute or validate these server-side.

---

## 17. Visual design system — Civic Minimalism

The interface should feel like a modern public-service product: calm, clear, trustworthy and practical.

**No gradients.** Avoid glassmorphism, neon colours, oversized shadows, excessive animation and unnecessary rounded cards.

### Colour palette

| Token | Hex | Use |
|---|---|---|
| Paper | `#F7F7F2` | Main page background |
| White | `#FFFFFF` | Cards and panels |
| Forest | `#244C39` | Primary actions and navigation accent |
| Charcoal | `#303630` | Main text |
| Muted | `#737A72` | Secondary text |
| Border | `#E8E9E2` | Dividers and card outlines |
| Success | `#397A56` | Resolved/healthy status |
| Warning | `#C18B36` | Medium urgency/attention |
| Critical | `#B94A48` | Critical/high-risk alert |

Use red and amber only for operational meaning. Do not colour every card or heading.

### Typography and layout

- Headings: Manrope or Plus Jakarta Sans.
- Body text: Inter.
- Use readable font sizes and strong contrast.
- Prefer 8–12px radius for panels and buttons.
- Use subtle borders instead of heavy shadows.
- Keep tables compact and scannable.
- Use consistent spacing and clear empty/loading/error states.
- Make all major workflows usable on mobile.
- Use accessible labels, keyboard navigation and visible focus states.

### Layouts

**Citizen:** welcoming dashboard, obvious report action, clear timeline, large microphone button and accessible map controls.

**Officer:** fixed sidebar, compact top navigation, summary statistics, dense priority table, filters and a clear ticket detail panel.

**Admin:** configuration-first layout, user/departments management, audit logs and analytics.

Use subtle, purposeful animation only for feedback such as recording, upload progress, status changes and simulated vehicle movement.

---

## 18. Security, privacy and reliability

Civic reports may include home addresses, faces, vehicle plates, health/safety concerns and other sensitive information. Apply privacy and security safeguards from the start.

- Keep `OPENAI_API_KEY` and all secrets on the backend.
- Use HTTPS in deployment.
- Use authentication and role-based permissions for all private data and officer actions.
- Validate uploaded files by content, size and type; use safe server-generated filenames.
- Restrict audio/image upload size and processing duration.
- Rate-limit authentication, transcription, AI analysis and complaint submission endpoints.
- Use CSRF protection where cookie-based authentication is used.
- Store passwords with a modern password hashing algorithm; never store plain-text passwords.
- Keep public ticket pages privacy-safe. Do not expose reporter names, phone numbers, email addresses or exact home coordinates.
- Ask for location permission only when needed and explain the reason.
- Allow manual location entry when GPS is denied.
- Store location accuracy and source; do not imply a precise GPS fix when the pin was manually placed.
- Apply retention policies to raw voice recordings and uploaded evidence.
- Remove image metadata where appropriate and scan uploads before making them available.
- Keep immutable audit records for officer status changes, classification changes, duplicate merges and resolution verification.
- Make AI outputs explainable and editable by authorised staff.
- Do not use AI severity output as the sole basis for emergency response or rejection.
- Provide a clear emergency notice: CivicLens is not an emergency service. For immediate danger, contact the appropriate local emergency service.
- Back up the database and test restore procedures before a real deployment.

---

## 19. Development phases

Build the application end-to-end in phases. Every phase should leave a runnable application.

### Phase 1 — Project foundation

- Create React + Vite frontend.
- Configure Tailwind and shadcn/ui.
- Create FastAPI backend.
- Set up PostgreSQL/PostGIS and Alembic.
- Add authentication and roles.
- Create citizen, officer and admin layouts.

**Exit condition:** users can sign in and see role-appropriate dashboards.

### Phase 2 — Complaint intake, location and duplicates

- Build text/photo complaint form.
- Add explicit GPS permission flow and manual map pin.
- Save coordinates, accuracy and location source.
- Build duplicate-check endpoint and same-user candidate search.
- Show existing report choices: view, follow, add evidence or continue as a new report.
- Add linked-report data model.

**Exit condition:** a citizen can submit a location-aware report and is warned about a possible earlier report before creating another ticket.

### Phase 3 — Voice and multilingual support

- Add MediaRecorder interface.
- Add FastAPI audio upload and validation.
- Integrate OpenAI transcription.
- Support selected language hints for the six target languages.
- Display editable transcript and preserve original language text.
- Send the confirmed transcript into the standard complaint pipeline.

**Exit condition:** a citizen can speak a report, correct the transcript and submit it like a typed report.

### Phase 4 — AI triage

- Integrate OpenAI Responses API for text and optional photo analysis.
- Validate structured output with Pydantic.
- Build category-to-department mapping.
- Implement severity and priority rules.
- Add confidence and human-review flags.
- Add duplicate similarity suggestions.

**Exit condition:** a submitted complaint becomes a validated structured ticket with category, reason, severity and department recommendation.

### Phase 5 — Municipal operations

- Build priority queue and filters.
- Implement assignment and status transitions.
- Add officer notes and citizen-visible updates.
- Add before/after evidence.
- Add supervisor verification and reopen workflow.
- Add SLA tracking and analytics.

**Exit condition:** the officer can take a complaint from submitted to verified resolution.

### Phase 6 — CleanRoute

- Build React Leaflet map.
- Seed fictional bins, vehicles and routes.
- Implement backend GPS/bin simulator.
- Broadcast updates over WebSockets.
- Add bin thresholds, route progress and map filters.
- Clearly label all simulated data.

**Exit condition:** the map shows moving demo vehicles, collection points and updating bin states.

### Phase 7 — Recognition and CivicVerse

- Generate appreciation certificate PDFs.
- Add QR verification endpoint.
- Build points ledger and achievements.
- Add at least two playable games first: Clean City Challenge and Civic Quiz Arena.
- Add Growing City and CivicBot.

**Exit condition:** a verified resolved complaint can generate a certificate and a citizen can play a game and view achievements.

### Phase 8 — Testing, polish and deployment

- Responsive design and accessibility review.
- Unit, API and end-to-end tests.
- Validate supported-language voice samples with native speakers.
- Seed a consistent demo dataset.
- Configure logging, monitoring, backups and deployment secrets.
- Test location-denied, microphone-denied, duplicate, upload-failure and AI-timeout scenarios.

**Exit condition:** the full demonstration scenario works from citizen report to verified resolution and recognition.

---

## 20. Local setup

The commands below are a starting point. Adjust package versions to the current stable releases when installing.

### Prerequisites

- Node.js LTS and npm.
- Python 3.11+ (or the version selected for the backend).
- PostgreSQL with PostGIS enabled.
- Redis (needed when enabling background jobs/cache features).
- OpenAI API key.

### Create the project folders

```bash
mkdir civiclens
cd civiclens
mkdir frontend backend
```

### Frontend setup

```bash
cd frontend
npm create vite@latest . -- --template react
npm install
npm install react-router-dom axios zustand lucide-react leaflet react-leaflet recharts
npm install -D tailwindcss postcss autoprefixer
```

Set up Tailwind and shadcn/ui using their current installation instructions. Add Leaflet CSS to the frontend entry point and configure a tile provider that permits your expected development and production usage.

Start the frontend:

```bash
npm run dev
```

### Backend setup

From the repository root:

```bash
cd backend
python -m venv .venv
```

Activate the environment:

```bash
# macOS / Linux
source .venv/bin/activate

# Windows PowerShell
.venv\Scripts\Activate.ps1
```

Install the initial dependencies:

```bash
pip install fastapi uvicorn[standard] sqlalchemy alembic psycopg[binary] \
  pydantic-settings python-multipart openai python-jose[cryptography] \
  passlib[bcrypt] email-validator pillow
```

Add the selected Redis/task queue, spatial, PDF and testing dependencies as those phases are implemented. Prefer a pinned `requirements.txt` or lock file for reproducible builds.

Run the API:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

API documentation will be available at:

```text
http://127.0.0.1:8000/docs
```

### Database setup

Create a PostgreSQL database, enable PostGIS, configure the backend connection string, then run migrations:

```sql
CREATE DATABASE civiclens;
```

Connect to the database and enable PostGIS:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Then use Alembic to create/apply migrations:

```bash
alembic upgrade head
```

Do not rely on automatic table creation in production. Use migrations and backups.

---

## 21. Environment variables

Create `backend/.env` from this example. Never commit the real `.env` file.

```env
APP_ENV=development
APP_NAME=CivicLens
API_V1_PREFIX=/api/v1
FRONTEND_ORIGIN=http://localhost:5173

# Bengaluru / Greater Bengaluru pilot defaults
DEFAULT_CITY=Bengaluru
DEFAULT_STATE=Karnataka
DEFAULT_COUNTRY=India
DEFAULT_MAP_LATITUDE=12.9716
DEFAULT_MAP_LONGITUDE=77.5946
DEFAULT_MAP_ZOOM=12
SERVICE_AREA_MODE=greater_bengaluru
GBA_BOUNDARY_DATASET_VERSION=configure_after_import

DATABASE_URL=postgresql+psycopg://postgres:your_password@localhost:5432/civiclens
REDIS_URL=redis://localhost:6379/0

JWT_SECRET_KEY=replace_with_a_long_random_secret
JWT_ACCESS_TOKEN_MINUTES=30

OPENAI_API_KEY=your_openai_api_key
OPENAI_TRIAGE_MODEL=your_supported_text_vision_model
OPENAI_TRANSCRIPTION_MODEL=your_supported_transcription_model

UPLOAD_DIR=./uploads
MAX_IMAGE_SIZE_MB=10
MAX_AUDIO_SIZE_MB=20
MAX_AUDIO_DURATION_SECONDS=90

SAME_USER_DUPLICATE_RADIUS_METRES=150
COMMUNITY_DUPLICATE_RADIUS_METRES=100
DUPLICATE_LOOKBACK_DAYS=180

GARBAGE_TRACKER_MODE=simulation
GARBAGE_SIMULATION_INTERVAL_SECONDS=3

CERTIFICATE_STORAGE_DIR=./generated_certificates
```

Create `frontend/.env` for public frontend configuration only:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
VITE_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
VITE_DEFAULT_MAP_LATITUDE=12.9716
VITE_DEFAULT_MAP_LONGITUDE=77.5946
VITE_DEFAULT_MAP_ZOOM=12
VITE_DEFAULT_CITY_LABEL=Bengaluru, Karnataka
```

`VITE_` variables are exposed to the browser. **Never put an OpenAI key, database password, JWT signing secret or other private credential in the frontend environment.**

Choose model IDs from the OpenAI models available to your account and the capabilities required by the feature. Keep them configurable rather than hard-coding them in React components.

---

## 22. Demo data and honest simulation labels

For a convincing Bengaluru-first prototype, seed a fictional service area using coordinates inside the imported Greater Bengaluru boundaries and recognisable localities such as Malleshwaram, Rajajinagar, Vijayanagar, Shivajinagar, Indiranagar, Whitefield, Koramangala, Jayanagar, Basavanagudi and JP Nagar. Resolve each point's actual corporation/ward using the official polygon data; do not invent the mapping. Seed the following fictional data:

- 20–30 complaints covering all categories and severity levels.
- Several reports submitted in different languages.
- At least two same-user nearby duplicate examples.
- At least one community duplicate with multiple linked citizen submissions.
- 3–5 fictional garbage trucks with predefined routes.
- 10–20 fictional public bins with changing fill levels.
- A few field workers and departments.
- Sample before/after resolution evidence.
- A citizen with one verified contribution and a generated certificate.

Use consistent IDs and timestamps across the demo so the end-to-end story is easy to follow.

Label sample content as **Demo data** and simulated GPS/sensor readings as **Simulated**. Do not imply that fictional workers, vehicles, locations or municipal actions are real.

---

## 23. Acceptance checklist

### Reporting and location

- [ ] Citizen can submit a text-only complaint.
- [ ] Citizen can attach a photograph.
- [ ] Citizen can request GPS permission using an explicit action.
- [ ] Citizen can adjust the issue pin on a map.
- [ ] Citizen can continue with manual location if GPS is denied.
- [ ] System stores coordinates, accuracy, source and capture time.
- [ ] Citizen is told why location is requested.
- [ ] Map and address search default to Bengaluru, Karnataka, India.
- [ ] Current official five City Corporation boundary data is imported and versioned.
- [ ] A confirmed issue pin resolves to the correct City Corporation and ward when boundary data is available.
- [ ] Reports outside the Greater Bengaluru pilot boundary are clearly flagged and not silently routed to a Bengaluru ward.
- [ ] Department routing distinguishes City Corporation assets, BWSSB water/sewerage issues and BESCOM electricity-network issues.

### Duplicate handling

- [ ] System checks the current user's previous reports near the selected issue location.
- [ ] Same-user match displays ticket number, category, status and distance.
- [ ] Citizen can open and follow the existing report.
- [ ] Citizen can add evidence to the existing report.
- [ ] Citizen can choose to submit a genuinely different issue.
- [ ] Community matches can be suggested without exposing other reporters' personal information.
- [ ] Duplicate linking is auditable and does not destroy original submissions.

### Voice and languages

- [ ] Citizen can record a voice complaint in the browser.
- [ ] Microphone permission denial has a helpful fallback.
- [ ] Citizen can stop, discard and re-record audio.
- [ ] Backend validates and transcribes the recording using OpenAI.
- [ ] Transcript is editable before submission.
- [ ] English, Hindi, Tamil, Telugu, Kannada and Malayalam have been tested with representative samples.
- [ ] Original transcript is retained separately from any translation.

### AI and municipal workflow

- [ ] AI classifies configured issue categories.
- [ ] Severity includes a one-line explanation.
- [ ] Department is selected from a controlled mapping.
- [ ] Priority queue sorts by operational priority.
- [ ] Low-confidence and high-risk reports can be flagged for human review.
- [ ] Officer can correct AI output with an audit reason.
- [ ] Ticket status history is preserved.
- [ ] Resolution requires the configured verification step.

### CleanRoute

- [ ] Map displays vehicles, routes and bin locations.
- [ ] Vehicle markers update from the simulation feed.
- [ ] Bin fill readings update and show timestamps.
- [ ] Simulated data is clearly labelled.
- [ ] Tracker has an empty/error/stale-data state.

### Recognition and games

- [ ] Certificate is generated only after verified resolution.
- [ ] Certificate has a unique verification ID/QR code.
- [ ] Public verification reveals only approved details.
- [ ] Civic games are playable and scores are stored server-side.
- [ ] Civic points are not awarded merely for complaint volume.
- [ ] Growing City and achievements reflect verified/configured activities.

### Design and security

- [ ] No gradient backgrounds.
- [ ] Citizen, officer and admin layouts are responsive.
- [ ] Buttons, form controls and maps are keyboard-accessible where practical.
- [ ] OpenAI key is only on the backend.
- [ ] Role and department permissions are enforced server-side.
- [ ] Upload validation, rate limits and audit logs are implemented.
- [ ] Public pages do not expose private citizen data.

---

## 24. Future enhancements

- Actual municipal vehicle GPS integration.
- IoT-enabled smart bins and sensor health monitoring.
- Routing optimisation using vehicle capacity, road closures and collection windows.
- Better duplicate detection using embeddings and feedback-trained thresholds.
- Voice-guided complaint submission for low-literacy users.
- Optional text-to-speech playback of the transcript and status updates.
- Offline-friendly reporting with queued submission when connectivity returns.
- SMS/WhatsApp notifications through approved providers and citizen opt-in.
- Public transparency dashboard with aggregated, privacy-safe statistics.
- Department workload forecasting and repair demand analytics.
- Accessibility testing with citizens who use assistive technologies.

---

## 25. Useful references

### Bengaluru / Karnataka civic context

- [Greater Bengaluru Governance Act — India Code](https://indiacode.gov.in/server/api/core/bitstreams/fddb33e7-b5e3-40b5-9ff1-d274de327607/content)
- [Greater Bengaluru Authority — City Corporation delimitation maps](https://www.bbmp.gov.in/maps/)
- [Government of Karnataka — Bengaluru West City Corporation / About GBA](https://bengaluruwest.karnataka.gov.in/about-gba)
- [BWSSB — functions and responsibilities](https://mybwssb.org/content/about-bwssb-0)
- [BESCOM — official portal and consumer services](https://www.bescom.co.in/)

- [OpenAI API documentation](https://platform.openai.com/docs/overview)
- [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses)
- [OpenAI vision and image inputs](https://platform.openai.com/docs/guides/images-vision)
- [OpenAI speech-to-text](https://platform.openai.com/docs/guides/speech-to-text)
- [OpenAI structured outputs](https://platform.openai.com/docs/guides/structured-outputs)
- [FastAPI documentation](https://fastapi.tiangolo.com/)
- [React documentation](https://react.dev/)
- [Vite documentation](https://vite.dev/)
- [Tailwind CSS documentation](https://tailwindcss.com/docs)
- [shadcn/ui documentation](https://ui.shadcn.com/docs)
- [React Leaflet documentation](https://react-leaflet.js.org/)
- [PostGIS documentation](https://postgis.net/documentation/)
- [MDN Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- [MDN MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)

---

## Closing vision

CivicLens should make reporting a civic issue as simple as sending a message. A citizen can speak in their preferred language, attach a photograph, pin the exact issue location and immediately see whether someone has already reported it. Municipal teams receive a structured, prioritised and reviewable task. Citizens can follow the work, see verified evidence and receive appreciation when their contribution helps improve the neighbourhood.

**Pilot geography:** Greater Bengaluru Area, Karnataka, India.

**Local governance and agency references last checked:** 21 November 2026. Re-check official boundary files and authority responsibilities before each deployment.

**CivicLens — Your voice. Your city. Your impact.**
