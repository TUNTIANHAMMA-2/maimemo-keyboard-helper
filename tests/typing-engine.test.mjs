import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.runInNewContext(readFileSync(new URL('../core/typing-engine.js', import.meta.url), 'utf8'), context);
const engine = context.MaimemoTypingEngine;

// Basic word typing, case-insensitive matching, and completion.
let state = engine.createState('  Serendipity  ');
assert.equal(state.target, 'Serendipity');
assert.equal(engine.expectedChar(state), 'S');

state = engine.inputChar(state, 's');
assert.equal(state.typed, 's');
assert.equal(engine.hasError(state), false);
assert.equal(engine.isComplete(state), false);

let view = engine.evaluate(state, { hidden: true });
assert.equal(view.cells[0].status, 'correct');
assert.equal(view.cells[0].display, 'S');
assert.equal(view.cells[1].status, 'current');
assert.equal(view.cells[1].display, '', 'hidden mode must not leak untyped characters');
assert.equal(view.cells[2].status, 'pending');
assert.equal(view.cells[2].display, '', 'hidden mode must not leak pending characters');

// Mistyped character advances cursor, marks wrong, and displays the typed char.
state = engine.inputChar(state, 'a');
assert.equal(engine.hasError(state), true);
view = engine.evaluate(state, { hidden: true });
assert.equal(view.cells[1].status, 'wrong');
assert.equal(view.cells[1].display, 'a');
assert.equal(view.cells[2].status, 'current');

// Backspace removes the wrong character and allows correcting it.
state = engine.backspace(state);
assert.equal(state.typed, 's');
assert.equal(engine.hasError(state), false);

for (const ch of 'erendipity') {
  state = engine.inputChar(state, ch);
}
assert.equal(engine.isComplete(state), true);
assert.equal(engine.hasError(state), false);
assert.equal(engine.evaluate(state, { hidden: true }).complete, true);

// Typing again after completion starts a fresh round on the same word.
state = engine.inputChar(state, 's');
assert.equal(state.typed, 's');
assert.equal(engine.isComplete(state), false);

// Reaching the end with an error does not overflow target length.
let wrongEnd = engine.createState('cat');
wrongEnd = engine.inputChar(wrongEnd, 'c');
wrongEnd = engine.inputChar(wrongEnd, 'o');
wrongEnd = engine.inputChar(wrongEnd, 't');
assert.equal(wrongEnd.typed, 'cot');
assert.equal(engine.isComplete(wrongEnd), false);
assert.equal(engine.hasError(wrongEnd), true);
wrongEnd = engine.inputChar(wrongEnd, 'x');
assert.equal(wrongEnd.typed, 'cot', 'must stop accepting extra chars when full with errors');

// Reset clears typed input.
wrongEnd = engine.reset(wrongEnd);
assert.equal(wrongEnd.typed, '');

// Multi-word phrases and punctuation (spaces, hyphens, apostrophes).
let phrase = engine.createState("ice cream");
for (const ch of 'ice') phrase = engine.inputChar(phrase, ch);
assert.equal(engine.expectedChar(phrase), ' ');
phrase = engine.inputChar(phrase, ' ');
assert.equal(engine.hasError(phrase), false);
for (const ch of 'cream') phrase = engine.inputChar(phrase, ch);
assert.equal(engine.isComplete(phrase), true);

let hyphen = engine.createState("well-known");
for (const ch of 'well-known') hyphen = engine.inputChar(hyphen, ch);
assert.equal(engine.isComplete(hyphen), true);

let apostrophe = engine.createState("don't");
for (const ch of "don't") apostrophe = engine.inputChar(apostrophe, ch);
assert.equal(engine.isComplete(apostrophe), true);

// Non-hidden mode shows untyped target letters.
const visibleView = engine.evaluate(engine.createState('hello'), { hidden: false });
assert.equal(visibleView.cells[0].status, 'current');
assert.equal(visibleView.cells[0].display, 'h');
assert.equal(visibleView.cells[1].status, 'pending');
assert.equal(visibleView.cells[1].display, 'e');

console.log('typing-engine tests passed');
