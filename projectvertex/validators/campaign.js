// A copy (not a require) of the browser-authored CampaignValidator lives at
// ./CampaignValidator.js — copied in rather than required from
// ../../public/engines/shared/CampaignValidator.js so projectvertex stays
// fully self-contained regardless of how a Vercel project root is
// configured (a `../../` require would resolve outside the deployed file
// tree if the Vercel project root is set to projectvertex/ rather than the
// whole monorepo). Keep the two in sync manually if the original changes.
//
// Note: _validateLevelFiles() does `fetch(relativePath, {method:'HEAD'})`,
// which throws on a relative URL under Node's fetch — that failure is
// caught internally and downgraded to a warning, so it never blocks
// validation.
const CampaignValidator = require('./CampaignValidator.js');

module.exports = CampaignValidator;
