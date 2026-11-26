(() => {
  'use strict';

  function normalizeTarget(raw) {
    return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  }

  function isCharMatch(expected, actual) {
    if (typeof expected !== 'string' || typeof actual !== 'string') return false;
    if (expected === actual) return true;
    return expected.toLowerCase() === actual.toLowerCase();
  }

  function createState(target) {
    return { target: normalizeTarget(target), typed: '' };
  }

  function isComplete(state) {
    if (!state || !state.target || state.typed.length !== state.target.length) return false;
    for (let i = 0; i < state.target.length; i++) {
      if (!isCharMatch(state.target[i], state.typed[i])) return false;
    }
    return true;
  }

  function hasError(state) {
    if (!state || !state.target) return false;
    const len = Math.min(state.typed.length, state.target.length);
    for (let i = 0; i < len; i++) {
      if (!isCharMatch(state.target[i], state.typed[i])) return true;
    }
    return false;
  }

  function inputChar(state, char) {
    if (!state || !state.target || typeof char !== 'string' || char.length !== 1) return state;
    if (isComplete(state)) {
      return { target: state.target, typed: char };
    }
    if (state.typed.length >= state.target.length) {
      return state;
    }
    return { target: state.target, typed: state.typed + char };
  }

  function backspace(state) {
    if (!state || !state.typed.length) return state;
    return { target: state.target, typed: state.typed.slice(0, -1) };
  }

  function reset(state) {
    if (!state) return createState('');
    return { target: state.target, typed: '' };
  }

  function expectedChar(state) {
    if (!state || !state.target) return '';
    if (isComplete(state)) return state.target[0] || '';
    if (state.typed.length >= state.target.length) return '';
    return state.target[state.typed.length];
  }

  function evaluate(state, options = {}) {
    const hidden = Boolean(options.hidden);
    const target = state?.target || '';
    const typed = state?.typed || '';
    const complete = isComplete(state);
    const error = hasError(state);
    const cursorIndex = typed.length < target.length ? typed.length : -1;
    const cells = [];

    for (let i = 0; i < target.length; i++) {
      const expected = target[i];
      const isSpace = expected === ' ';
      if (i < typed.length) {
        const actual = typed[i];
        const matched = isCharMatch(expected, actual);
        cells.push({
          index: i,
          expected,
          actual,
          isSpace,
          display: matched ? expected : actual,
          status: matched ? 'correct' : 'wrong'
        });
      } else {
        const isCurrent = i === cursorIndex;
        cells.push({
          index: i,
          expected,
          actual: '',
          isSpace,
          display: hidden ? '' : expected,
          status: isCurrent ? 'current' : 'pending'
        });
      }
    }

    return { target, typed, cells, complete, hasError: error, cursorIndex, hidden };
  }

  globalThis.MaimemoTypingEngine = Object.freeze({
    normalizeTarget,
    isCharMatch,
    createState,
    inputChar,
    backspace,
    reset,
    expectedChar,
    isComplete,
    hasError,
    evaluate
  });
})();
