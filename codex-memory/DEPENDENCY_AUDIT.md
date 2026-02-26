# Dependency Risk and License Audit (Preliminary)

Date: 2026-02-26
Scope: `package.json` and `backend/requirements.txt` only. No internet lookups were performed. Licenses are not confirmed here and should be verified with the steps at the end.

## 1) Node.js Dependencies (package.json)

### Runtime Dependencies
- `@capacitor/android`, `@capacitor/cli`, `@capacitor/core`, `@capacitor/filesystem`, `@capacitor/ios`
  - Risk: Medium
  - Notes: Mobile build surface area. Large dependency tree and platform tooling.
  - License: Unknown in this audit.
- `@huggingface/transformers`
  - Risk: Medium
  - Notes: Alpha usage suggests API churn; also heavy WASM/JS artifacts.
  - License: Unknown in this audit.
- `@orama/orama`
  - Risk: Low
  - Notes: Core vector DB for RAG.
  - License: Unknown in this audit.
- `@xenova/transformers`
  - Risk: Medium
  - Notes: ONNX/WebGPU inference for browser AI. Potentially heavy assets.
  - License: Unknown in this audit.
- `chokidar`
  - Risk: Low
  - Notes: File watching, standard library usage.
  - License: Unknown in this audit.
- `express`
  - Risk: Low
  - Notes: Server core.
  - License: Unknown in this audit.
- `onnxruntime-web`
  - Risk: Medium
  - Notes: Large binary/WASM dependencies. Ensure correct redistribution license.
  - License: Unknown in this audit.
- `ws`
  - Risk: Low
  - Notes: WebSocket server.
  - License: Unknown in this audit.

### Dev Dependencies
- `electron`
  - Risk: Medium
  - Notes: Large binary distribution, security updates are frequent.
  - License: Unknown in this audit.
- `electron-builder`, `electron-packager`
  - Risk: Medium
  - Notes: Build tooling and packaging.
  - License: Unknown in this audit.
- `esbuild`
  - Risk: Low
  - Notes: Bundler with native binaries.
  - License: Unknown in this audit.

## 2) Python Dependencies (backend/requirements.txt)
- `fastapi`, `uvicorn`, `websockets`, `pydantic`, `requests`, `urllib3`
  - Risk: Low
  - Notes: Standard web stack. Keep patched for CVEs.
  - License: Unknown in this audit.
- `llama-cpp-python`
  - Risk: Medium
  - Notes: Native bindings and model runtime. Verify redistribution rights for models.
  - License: Unknown in this audit.
- `watchdog`
  - Risk: Low
  - Notes: File watching.
  - License: Unknown in this audit.
- `python-multipart`
  - Risk: Low
  - Notes: File upload support.
  - License: Unknown in this audit.
- `chromadb`
  - Risk: Medium
  - Notes: Vector DB; large dependency tree.
  - License: Unknown in this audit.
- `sentence-transformers`
  - Risk: Medium
  - Notes: Heavy ML stack. May pull in large models and dependencies.
  - License: Unknown in this audit.
- `psutil`
  - Risk: Low
  - Notes: System metrics.
  - License: Unknown in this audit.

## 3) Model and Data Assets
- `backend/models/` and `backend/chroma_db/` are large and likely include model files.
- Risk: Medium
- Notes: Ensure each model’s license allows local distribution and bundling.

## 4) Immediate Risk Factors
- Large binary dependencies (Electron, ONNX runtime, llama-cpp) increase supply-chain attack surface.
- Alpha/beta dependencies (`@huggingface/transformers` alpha) can cause instability.
- Model licenses can restrict redistribution and commercial usage.

## 5) Recommended License Verification Steps
- Node: `npm view <pkg> license` for each dependency.
- Node: `npx license-checker --summary` to enumerate licenses and flags.
- Python: `pip show <pkg>` for license metadata.
- Models: check model card license for each file in `backend/models/`.

## 6) Suggested Dependency Policy
- Pin exact versions for all runtime deps.
- Maintain a minimal license allowlist (MIT, Apache-2.0, BSD-2/3, ISC) and flag exceptions.
- For ML models, require explicit license approval before inclusion.

