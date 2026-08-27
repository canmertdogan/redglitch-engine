// Vercel entry point: exporting an Express app this way is auto-detected by
// Vercel's Node runtime as a single serverless function handling every
// request routed to it (see ../vercel.json). Every route in server/app.js
// is stateless (no persistent process, no filesystem writes outside of
// what the platform allows), which is what makes this safe to run here —
// see the plan doc / CLAUDE.md notes on why the local Cortex approach
// couldn't work on Vercel at all.
// No-op if no .env file exists (e.g. on Vercel, where env vars are injected
// by the platform directly) — only matters for `vercel dev` locally.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const createApp = require('../server/app');

module.exports = createApp();
