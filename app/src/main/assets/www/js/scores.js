/**
 * Persist best scores (fewest steps, fastest time) per board size.
 *
 * In the browser the scores live in `localStorage` under one JSON key, shaped
 * exactly like the Python version's file:
 *
 *     {
 *       "3": {"best_steps": 15, "best_time_ms": 42000},
 *       "4": {"best_steps": 55, "best_time_ms": 180000}
 *     }
 *
 * Keys are the board size as a string. `best_steps` and `best_time_ms` are
 * tracked independently, since a fast game can still take many steps and vice
 * versa.
 *
 * When `localStorage` is unavailable (Node, private-mode browsers, file://
 * restrictions) an in-memory store is used instead, so nothing throws.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'huarong_path.best_scores.v1';

  /** A `localStorage`-shaped store backed by a plain object. */
  function memoryStorage() {
    var data = Object.create(null);
    return {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
      },
      setItem: function (key, value) {
        data[key] = String(value);
      },
      removeItem: function (key) {
        delete data[key];
      },
    };
  }

  /** Return `localStorage` if it is usable, else an in-memory fallback. */
  function resolveStorage() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        var probe = '__huarong_probe__';
        localStorage.setItem(probe, '1');
        localStorage.removeItem(probe);
        return localStorage;
      }
    } catch (err) {
      // Private mode / disabled storage / quota: fall through.
    }
    return memoryStorage();
  }

  var storage = resolveStorage();

  /** Override the backing store (used by tests). Pass null to re-resolve. */
  function setStorage(next) {
    storage = next || resolveStorage();
  }

  /** Return the scores object; `{}` if nothing is stored or it is unreadable. */
  function load() {
    try {
      var raw = storage.getItem(STORAGE_KEY);
      if (!raw) {
        return {};
      }
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return {};
      }
      return data;
    } catch (err) {
      return {};
    }
  }

  /** Write `scores` to storage. Returns true on success. */
  function save(scores) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(scores));
      return true;
    } catch (err) {
      return false;
    }
  }

  /** Best (fewest) steps recorded for `size`, or null. */
  function bestSteps(scores, size) {
    var entry = scores[String(size)];
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    return typeof entry.best_steps === 'number' ? entry.best_steps : null;
  }

  /** Best (fastest) time in milliseconds recorded for `size`, or null. */
  function bestTimeMs(scores, size) {
    var entry = scores[String(size)];
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    return typeof entry.best_time_ms === 'number' ? entry.best_time_ms : null;
  }

  /**
   * Record a finished game, updating bests when beaten.
   *
   * Returns a `[newBestSteps, newBestTime]` pair of booleans. Mutates `scores`.
   */
  function update(scores, size, steps, timeMs) {
    var key = String(size);
    var entry = scores[key];
    if (!entry || typeof entry !== 'object') {
      entry = {};
    }

    var newSteps = typeof entry.best_steps !== 'number' || steps < entry.best_steps;
    var newTime = typeof entry.best_time_ms !== 'number' || timeMs < entry.best_time_ms;

    if (newSteps) {
      entry.best_steps = steps;
    }
    if (newTime) {
      entry.best_time_ms = timeMs;
    }
    scores[key] = entry;
    return [newSteps, newTime];
  }

  var Scores = {
    STORAGE_KEY: STORAGE_KEY,
    memoryStorage: memoryStorage,
    setStorage: setStorage,
    load: load,
    save: save,
    bestSteps: bestSteps,
    bestTimeMs: bestTimeMs,
    update: update,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Scores;
  } else {
    global.Scores = Scores;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
