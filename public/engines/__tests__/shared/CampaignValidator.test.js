const test = require('node:test');
const assert = require('node:assert/strict');

const CampaignValidator = require('../../shared/CampaignValidator.js');

function makeValidator() {
  return new CampaignValidator();
}

function node(id, opts = {}) {
  return { id, type: opts.type || 'level', ...opts };
}

test('constructor — initialises empty state', () => {
  const cv = makeValidator();
  assert.deepEqual(cv.errors, []);
  assert.deepEqual(cv.warnings, []);
});

test('_validateNodeStructure — catches missing id', () => {
  const cv = makeValidator();
  cv._validateNodeStructure([{ type: 'level' }]);
  assert.equal(cv.errors.length, 1);
  assert.ok(cv.errors[0].includes('id'));
});

test('_validateNodeStructure — catches missing type', () => {
  const cv = makeValidator();
  cv._validateNodeStructure([{ id: 'n1' }]);
  assert.ok(cv.errors.some(e => e.includes('type')));
});

test('_validateNodeStructure — catches duplicate ids', () => {
  const cv = makeValidator();
  const nodes = [node('a'), node('a')];
  cv._validateNodeStructure(nodes);
  assert.ok(cv.errors.some(e => e.includes('Duplicate')));
});

test('_validateNodeReferences — catches bad next', () => {
  const cv = makeValidator();
  const nodes = [node('a', { next: 'b' })];
  cv._validateNodeReferences(nodes);
  assert.ok(cv.errors.some(e => e.includes('non-existent')));
});

test('_validateNodeReferences — passes valid refs', () => {
  const cv = makeValidator();
  const nodes = [
    node('a', { next: 'b' }),
    node('b'),
  ];
  cv._validateNodeReferences(nodes);
  assert.equal(cv.errors.length, 0);
});

test('_validateNodeReferences — validates branch refs', () => {
  const cv = makeValidator();
  const nodes = [
    node('a', { type: 'branch', nextTrue: 'b', nextFalse: 'c' }),
  ];
  cv._validateNodeReferences(nodes);
  assert.equal(cv.errors.length, 2);
});

test('_validateStartNode — warns on zero start nodes', () => {
  const cv = makeValidator();
  cv._validateStartNode([node('a')]);
  assert.ok(cv.warnings.some(w => w.includes('No start node')));
});

test('_validateStartNode — warns on multiple start nodes', () => {
  const cv = makeValidator();
  const nodes = [
    node('a', { type: 'start' }),
    node('b', { type: 'start' }),
  ];
  cv._validateStartNode(nodes);
  assert.ok(cv.warnings.some(w => w.includes('Multiple')));
});

test('_validateStartNode — no warnings with exactly one start', () => {
  const cv = makeValidator();
  cv._validateStartNode([node('a', { type: 'start' })]);
  assert.equal(cv.warnings.length, 0);
});

test('_validateBranchNodes — warns on missing nextTrue/nextFalse', () => {
  const cv = makeValidator();
  const nodes = [node('a', { type: 'branch' })];
  cv._validateBranchNodes(nodes);
  assert.ok(cv.warnings.some(w => w.includes('nextTrue')));
  assert.ok(cv.warnings.some(w => w.includes('nextFalse')));
});

test('_validateBranchNodes — errors when condition missing', () => {
  const cv = makeValidator();
  const nodes = [node('a', { type: 'if-statement' })];
  cv._validateBranchNodes(nodes);
  assert.ok(cv.errors.some(e => e.includes('condition')));
});

test('_validateBranchNodes — validates random chance range', () => {
  const cv = makeValidator();
  const nodes = [node('a', { type: 'random', chance: 150 })];
  cv._validateBranchNodes(nodes);
  assert.ok(cv.errors.some(e => e.includes('chance')));
});

test('_validateEngineTypes — warns on missing engineType', () => {
  const cv = makeValidator();
  const nodes = [node('a', { type: 'level' })];
  cv._validateEngineTypes(nodes);
  assert.ok(cv.warnings.some(w => w.includes('engineType')));
});

test('_validateEngineTypes — errors on invalid engineType', () => {
  const cv = makeValidator();
  const nodes = [node('a', { type: 'level', engineType: 'invalid-3d' })];
  cv._validateEngineTypes(nodes);
  assert.ok(cv.errors.some(e => e.includes('invalid engineType')));
});

test('_getResult — returns valid=true when no errors', () => {
  const cv = makeValidator();
  const result = cv._getResult();
  assert.equal(result.valid, true);
});

test('_getResult — returns valid=false with errors', () => {
  const cv = makeValidator();
  cv.errors.push('something wrong');
  const result = cv._getResult();
  assert.equal(result.valid, false);
});

test('findUnreachableNodes — finds orphan nodes', () => {
  const cv = makeValidator();
  const nodes = [
    node('start', { type: 'start', next: 'a' }),
    node('a', { next: 'b' }),
    node('b'),
    node('orphan'),
  ];
  const unreachable = cv.findUnreachableNodes(nodes);
  assert.deepEqual(unreachable, ['orphan']);
});

test('findUnreachableNodes — all reachable returns empty', () => {
  const cv = makeValidator();
  const nodes = [
    node('start', { type: 'start', next: 'a' }),
    node('a', { next: 'b' }),
    node('b'),
  ];
  const unreachable = cv.findUnreachableNodes(nodes);
  assert.deepEqual(unreachable, []);
});

test('findUnreachableNodes — infers start from un-referenced node', () => {
  const cv = makeValidator();
  const nodes = [
    node('a', { next: 'b' }),
    node('b'),
    node('orphan'),
  ];
  const unreachable = cv.findUnreachableNodes(nodes);
  assert.deepEqual(unreachable, ['orphan']);
});

test('detectCycles — detects simple cycle', () => {
  const cv = makeValidator();
  const nodes = [
    node('a', { next: 'b' }),
    node('b', { next: 'a' }),
  ];
  const cycles = cv.detectCycles(nodes);
  assert.ok(cycles.length > 0);
  assert.ok(cycles[0].includes('a'));
});

test('detectCycles — no false positive for acyclic graph', () => {
  const cv = makeValidator();
  const nodes = [
    node('a', { next: 'b' }),
    node('b', { next: 'c' }),
    node('c'),
  ];
  const cycles = cv.detectCycles(nodes);
  assert.deepEqual(cycles, []);
});

test('detectCycles — creates warning on cycle', () => {
  const cv = makeValidator();
  const nodes = [
    node('a', { next: 'b' }),
    node('b', { next: 'a' }),
  ];
  cv.detectCycles(nodes);
  assert.ok(cv.warnings.some(w => w.includes('Cycle detected')));
});

test('formatResult — shows pass message', () => {
  const result = { valid: true, errors: [], warnings: [], hasWarnings: false };
  const out = CampaignValidator.formatResult(result);
  assert.ok(out.includes('passed'));
});

test('formatResult — shows error messages', () => {
  const result = { valid: false, errors: ['Bad node'], warnings: [], hasWarnings: false };
  const out = CampaignValidator.formatResult(result);
  assert.ok(out.includes('failed'));
  assert.ok(out.includes('Bad node'));
});
