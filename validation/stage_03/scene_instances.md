# Stage 03 - scene instances

Source of truth: `plan_manifest.json`.

| Instance | Scene | Zone | Assets | Causal sentence | Key constraints |
|---|---|---|---|---|---|
| `spawn_signature` | `scene_foundation_pour_spawn` | `zone_coulage_principal` | `slab`, `rebar`, `formwork_bay`, `formwork`, `concrete_pump`, `mixer_truck`, `spill` | The mixer truck feeds the concrete pump; the pump pours the slab; the formwork contains it; the rebar explains the foundation structure. | Unique signature; slab visible within 900px; pump 100-350px from slab/bay; mixer 100-350px from pump; no blocking footprint inside 350px of spawn. |
| `active_bay_west` | `scene_formwork_bay_active` | `zone_coulage_principal` | `formwork_bay`, `formwork`, `rebar` | A foundation bay is ready before pouring: formwork is set and rebar is inside. | No truck in bay; no orphan bay without rebar. |
| `active_bay_north` | `scene_formwork_bay_active` | `zone_coulage_principal` | `formwork_bay`, `formwork`, `rebar` | A second bay extends the same pour line without becoming a competing main slab. | Keeps density medium; does not create a second main slab. |
| `ready_rebar_near_slab` | `scene_rebar_ready` | `zone_coulage_principal` | `rebar` x2, `formwork` | Rebar is staged next to the active coffrage before being placed in the slab. | Connected to stock and active pour; aligned, not random. |
| `stock_rebar_west` | `scene_rebar_stock` | `zone_stock_ferraillage` | `rebar` x4 | Aligned rebar stock waits west of the pour, connected by a short work path. | 400-1600px from pour zone; only in stock zone. |
| `truck_waiting_access` | `scene_mixer_waiting` | `zone_acces_beton` | `mixer_truck` | A mixer truck waits on the concrete access lane before feeding the pump. | On truck access; connected to entry; not inside slab. |
| `secondary_patch_sw` | `scene_small_mixer_patch` | `zone_prepa_secondaire` | `concrete_mixer`, `formwork`, `spill` | A small local pour is prepared next to secondary formwork, away from the main signature. | Mixer is never alone; does not compete with signature. |
| `minor_edge_defect` | `scene_concrete_defect_minor` | `zone_coulage_principal` | `crack`, `spill` | A small concrete edge defect is visible but remains secondary and outside the spawn center. | Maximum one crack scene; never centered on spawn. |

Worker routes:

| Route | Worker types | Purpose |
|---|---|---|
| `zone_stock_ferraillage` -> `zone_coulage_principal` | `ferrailleur`, `coffreur` | Bring rebar/formwork to the active pour. |
| `zone_acces_beton` -> `zone_coulage_principal` | `betonnier`, `cimentier` | Concrete logistics from mixer access to pump/slab. |
| `zone_prepa_secondaire` -> `zone_coulage_principal` | `cimentier` | Secondary patch remains subordinate to the main pour. |
