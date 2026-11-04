# PERSISTENCE — Where every Studio tool writes

Rescue-time reference. Verified against `server/routes/*` and the smoke/contract audits (see `docs/tools/AUDIT.md`). All writes go through `safeFs.safeWriteFullPath`; dynamic reads go through `resolveUnderRoot` / the overlay handler. New save paths must follow the same guards — never raw `path.join` + `fs.writeFile` in a route an AI tool can reach.

## Terms

- **Active project** — what `/api/projects/current` reports. In this checkout the only tracked project is `projects/Default Project`; `npm run server` defaults to **ROOT mode** (`projectService.isRootProject()` is true), meaning `getDunyalarPath()` resolves to the engine's own `public/` tree.
- **ROOT mode writes** (what you get out of the box) go to `public/dunyalar/definitions/…` etc. In a sub-project, the same routes write under `projects/<name>/…` and fall back to engine-core (`public/…`) on read when the project file is missing.
- Definition routes (`/api/items|npcs|quests|…`) merge engine-core (public) with project definitions **on read**, and always write to the project side.

## Save matrix

| Surface | Tool(s) | Endpoint | Writes to | Format |
|---|---|---|---|---|
| Entity definitions | item/npc/enemy/skill/quest/variable editors | `POST /api/{items,npcs,enemies,skills,quests,variables}` | `<project|public>/dunyalar/definitions/*.json` | JSON (array merge by `id` on read) |
| Achievements | Trophies (achievements_editor) | read: `GET /dunyalar/definitions/achievements.json` (overlay); write: `POST /api/ide/write` → `dunyalar/definitions/achievements.json` | project-side JSON | JSON array |
| Dialogues | Dialogue Studio (v2) | `POST /api/dialogues` | same, `dialogues.json` | `{ characters, conversations: [{ id, title?, nodes[] }] }` |
| Levels | Level Editor, Platformer Studio, IsoPixel, 3D Studio | `POST /api/levels/:filename` | `<project|public>/dunyalar/<filename>.json` | raw JSON (filename = `path.basename`, `.json` enforced) |
| Levels (single read) | Level Editor, Platformer Studio | `GET /api/levels/:filename` | read-only | raw JSON |
| FX definitions | FX Master | `POST /api/ide/write` → `data/fx/*.json` | `<project>/data/fx/<name>.json` | JSON |
| Shaders | Shader Lab | `POST /api/shaders/save` | `<project>/data/shaders/<name>.frag` | GLSL text |
| Logic scripts | Node Logic (v2), Script Editor | `POST /api/logic/save` | `<project>/data/logic/<name>.{json,js,ast.json}` | AST JSON + generated JS |
| AI brains | AI Brains (behavior_editor) | `POST /api/brains/save` | `<project>/data/brains/<name>.{json,js,ast.json}` | brain AST JSON + JS |
| Audio map | Audio Studio (v2) | `POST /api/audio/map` | `<project>/data/audio_map.json` | JSON |
| Character | Player Profiles | `POST /api/ide/write` → `data/characters/hero.json` | `<project>/data/characters/hero.json` | JSON |
| Campaign state | Campaign runtime | `POST /api/campaign-state/:username` | `<project>/data/saves/campaign_<username>.json` | JSON |
| Save slots | Slot selection, menus | `GET/POST/DELETE /api/slots(/:id)` | `<repo>/saves/slots/<n>.json` | JSON |
| UI config | UI Designer | `GET/PUT /api/ui-config` | project `.redui` file(s) | JSON |
| Generic files | Studio shell (script editor, IDE) | `POST /api/ide/write` (+`/api/ide/delete`) | paths under project (or engine-core `data/` fallback on **read** only) | raw text / base64 |
| Assets | Asset Manager (v2) | `POST /api/assets/import` (base64), `/api/assets/rebuild` | `<project>/assets/...` + registry cache | base64 JSON |

## Read fallbacks worth knowing

- `/api/ide/read?file=data/…` → project first, then `public/` (engine-core) when ENOENT. (Fallback was broken before the rescue — it pointed at a non-existent root; now files resolve.)
- `/api/ide/list?dir=engine/…` → lists engine-core under `public/` (e.g. `engine/sprite-art`); without the `engine/` prefix it scans the project and falls back to `public/` with 404 on total miss.
- `/dunyalar/*`, `/engines/*`, `/sprite-art/*`, `/interfaces/*`, `/data/*`, `/muzikler/*`, `/assets/*` → **overlay handler**: project first, then `public/`; missing everywhere → falls through to `express.static(public/)`; never 500 on ENOENT.

## Rules for adding a new save path

1. Resolve the root (`activeProject` or `isRootProject() ? public/… : project/…`) — never hardcode `public/`.
2. Sanitize the filename (`path.basename`, whitelist characters, `.json`/`.frag` extension).
3. Write through `safeFs.safeWriteFullPath(root, absPath, …)`; never `fs.writeFile` directly.
4. For engine-core-writable surfaces, prefer **project-side** writes and **public-side** reads (fallback) — that is what the definition routes do.
5. If an AI tool can reach the route, gate the path with `automationPolicy` (see `server/utils/automationPolicy.js`); existing examples: `/api/ide/write`, `/api/ide/delete`.
6. Add the endpoint to `npm run tools:audit` expectations if an AI tool declares it.
