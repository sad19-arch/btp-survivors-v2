# Stage 03 - constraint checklist

Pre-code acceptance score: **96/100**.

Score breakdown:

| Criterion | Points |
|---|---:|
| Signature scene understandable in 2 seconds | 20 / 20 |
| No important orphan asset | 20 / 20 |
| Concrete/rebar workflow readable | 15 / 15 |
| Credible scale and distances | 14 / 15 |
| Zones connected to entry | 10 / 10 |
| Density adapted to stage | 9 / 10 |
| Correct machine orientation | 4 / 5 |
| Visual differentiation from terrassement | 4 / 5 |

Score note: the stage is code-authorized because it is above 80. The remaining risk is exact machine orientation, which depends on the TypeScript cluster mapping; the abstract plan already separates stage 03 from stage 02 through slab, pump, mixer, formwork, rebar, and a low crack budget.

Checklist:

- [x] Signature scene exists exactly once: `scene_foundation_pour_spawn`.
- [x] Spawn shows slab/foundation pouring immediately.
- [x] Mixer truck, pump, slab, formwork, rebar, and spill belong to the same signature scene.
- [x] No important asset is placed directly in the world; all belong to named causal scenes.
- [x] Pump has a target: slab/formwork bay.
- [x] Mixer truck has a target: concrete pump or truck access.
- [x] Concrete mixer is not alone; it appears only in `scene_small_mixer_patch`.
- [x] Rebar appears only in stock, ready, active bay, or signature scenes.
- [x] Spill is near a pour or concrete patch.
- [x] Crack is limited to one minor edge defect and is not centered on spawn.
- [x] Active pour connects to truck access.
- [x] Active pour connects to rebar stock.
- [x] Truck access connects to south entry/road.
- [x] Base vie is outside fresh concrete and at least 900px from the main slab area in the abstract grid.
- [x] Spawn has a 350px non-blocking radius.
- [x] Truck access width target is 280-340px or wider.
- [x] Density remains medium: 1 signature, 3 active/ready scenes, 1 stock, 1 secondary, 1 minor defect.
- [x] Workers have useful routes; no random wandering is required.

Tests to add/adapt after code starts:

- `validateNoOrphanAssets(stage)`
- `validateSignatureNearSpawn(stage)`
- `validateSpawnClearance(stage)`
- `validateSceneFootprintNoOverlap(stage)`
- `validateRoadGateConnection(stage)`
- `validateZoneConnectivity(stage)`
- `validateMachineTargetDistance(stage)`
- `validateStockConsumptionDistance(stage)`
- `validateDensityBudget(stage)`
- `validateDirectionalAssetsHaveTarget(stage)`
- `validateForbiddenAssetsByStage(stage)`
- `validateFoundationSpecificRules(stage)`
