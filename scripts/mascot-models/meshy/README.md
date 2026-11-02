# Standardized Meshy worn-accessory pipeline

The production catalog is defined by `accessory-catalog-v1.json`: 17 complete
worn-character inputs, one paid task per single accessory. Each reference folder
contains one broad design board plus the four strict front/left/back/right images
accepted by Meshy. Combination models are never submitted to the API.

`meshy_pipeline.py balance` reads only the Windows Generic Credential named
`NAVA/Meshy/api-key` and calls Meshy's HTTPS balance API. Store the key through
Windows Credential Manager; never provide it as a command argument or in chat.
The client emits only sanitized status. Downloads use a separate client without
the authorization header. No credential enumeration is performed.

`meshy_jobs.py` implements durable jobs for the catalog and the older pilot.
Prepare and visually review the design board and four individual images first.
Then submit each name once using the same durable Build batch root:

```powershell
python -B scripts/mascot-models/meshy/meshy_pipeline.py balance
python -B scripts/mascot-models/meshy/meshy_jobs.py submit --name beret --root Q:/NAVA-Workspace/Build/TestRuns/meshy-accessory-pilot-v1/api --images <front> <side> <rear> <opening>
python -B scripts/mascot-models/meshy/meshy_jobs.py status --name beret --root Q:/NAVA-Workspace/Build/TestRuns/meshy-accessory-pilot-v1/api
python -B scripts/mascot-models/meshy/meshy_jobs.py download --name beret --root Q:/NAVA-Workspace/Build/TestRuns/meshy-accessory-pilot-v1/api
```

Repeat with `--name scarf` and its reviewed inputs. The current batch already has
both submitted jobs; use only status/download to resume it. A duplicate submit is
rejected. Do not select a different root to bypass this protection.

The journal reserves each name before sending a POST and persists the returned
task ID immediately. A timeout or ambiguous POST response must never trigger an
automatic resubmission. Recover the exact existing task ID from Meshy's request
history before using `status --task-id`. All journals, original task responses
(which contain expiring signed asset links), downloaded masters and QA evidence
stay in `Q:/NAVA-Workspace/Build`, outside Git. Never print raw task responses.

Current fixed settings: Meshy 7.1, 2K geometry, 8K texture, no remeshing, no PBR,
no image enhancement, remove lighting, same four images for geometry and color.
Expected cost was 40 credits per object when checked on 2026-10-16. Actual task
`consumed_credits` and before/after balance are authoritative. Future batches
require their own user-authorized scope and budget; there is no recurring job.

Combination is local: fit separate accessories to the unchanged cat, use head
and neck attachment regions, export reusable parts, and compose them at runtime.
The client deliberately has no combination-generation command.

The catalog fitting tools are:

- `dump_worn_geometry.py`: immutable mesh/UV dump for offline segmentation.
- `segment_worn_accessory.py`: color plus physical-region face selection.
- `fit_worn_accessory.py`: canonical-cat registration, reduction, hidden return
  edge, runtime texture and optional cloth shapes.
- `merge_worn_catalog.py`: assemble approved extracted parts and locally refined
  continuous fallbacks into the 17-root runtime GLB, with no network calls.

Automatic extraction must be rejected when it includes cat fur/face pixels or
breaks a continuous garment. Keep the full generated GLB as the form reference
and use locally authored continuous geometry for those cases. A successful API
response or topology gate alone is not approval for runtime use.

Offline safety tests (fake inputs and transports, no key or network):

```powershell
python -B scripts/mascot-models/meshy/meshy_jobs.py self-test --root Q:/NAVA-Workspace/Build/TestRuns/meshy-client-self-test
```

Official contracts: [multi-image API](https://docs.meshy.ai/en/api/multi-image-to-3d),
[pricing](https://docs.meshy.ai/en/api/pricing),
[task lifecycle](https://docs.meshy.ai/en/api/task-lifecycle).
