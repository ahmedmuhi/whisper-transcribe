/**
 * @fileoverview Behavioural tests for the Dynamic-Island control cluster.
 *
 * The existing UI tests run against a DOM double whose cluster has no `animate`
 * and no `getBoundingClientRect`, so the FLIP morph path never executes there.
 * These tests give the cluster a real Set-backed classList plus stubbed
 * animate/getBoundingClientRect, so they pin the parts that ship un-pinned:
 *   - the FSM state -> island shape class mapping (_islandStateFor),
 *   - the island-has-indicator toggle (only while the spinner shows),
 *   - the FLIP morph cancelling an in-flight animation before starting a new one,
 *   - reduced-motion skipping the animation entirely (instant, correct mutate).
 */

import { vi } from 'vitest';
import { applyDomSpies, resetEventBus } from './helpers/test-dom-vitest.js';

let reduceMotion = false;

global.localStorage = {
    getItem: vi.fn().mockReturnValue('auto'),
    setItem: vi.fn()
};

global.window = {
    matchMedia: vi.fn(() => ({ matches: reduceMotion, addEventListener: vi.fn() }))
};

vi.mock('../js/status-helper.js', () => ({
    showTemporaryStatus: vi.fn()
}));

const { RECORDING_STATES } = await import('../js/constants.js');
const { UI } = await import('../js/ui.js');

/** A real classList backed by a Set (the DOM double's is a no-op). */
function realClassList() {
    const set = new Set();
    return {
        add: (...names) => names.forEach(n => set.add(n)),
        remove: (...names) => names.forEach(n => set.delete(n)),
        toggle: (name, force) => {
            const on = force === undefined ? !set.has(name) : Boolean(force);
            if (on) set.add(name); else set.delete(name);
            return on;
        },
        contains: name => set.has(name)
    };
}

/** A cluster whose width changes on every measure, so every morph fires. */
function makeCluster() {
    let measures = 0;
    const animations = [];
    return {
        classList: realClassList(),
        style: {
            props: {},
            setProperty(k, v) { this.props[k] = v; },
            removeProperty(k) { delete this.props[k]; }
        },
        getBoundingClientRect: vi.fn(() => ({ width: 100 + 50 * measures++, height: 40 })),
        animate: vi.fn(() => {
            const anim = { cancel: vi.fn(), onfinish: null };
            animations.push(anim);
            return anim;
        }),
        animations
    };
}

function newUI() {
    applyDomSpies();
    const ui = new UI();
    ui.ready = true;
    ui.controlCluster = makeCluster();
    return ui;
}

const ISLAND_CLASSES = ['island-idle', 'island-recording', 'island-processing'];

describe('Dynamic Island control cluster', () => {
    afterEach(() => {
        reduceMotion = false;
        vi.clearAllMocks();
        resetEventBus();
    });

    describe('state -> shape mapping', () => {
        const cases = [
            [RECORDING_STATES.IDLE, 'island-idle'],
            [RECORDING_STATES.INITIALIZING, 'island-processing'],
            [RECORDING_STATES.RECORDING, 'island-recording'],
            [RECORDING_STATES.PAUSED, 'island-recording'],
            [RECORDING_STATES.CONFIRMING_DISCARD, 'island-recording'],
            [RECORDING_STATES.STOPPING, 'island-processing'],
            [RECORDING_STATES.PROCESSING, 'island-processing'],
            [RECORDING_STATES.CANCELLING, 'island-processing'],
            [RECORDING_STATES.ERROR, 'island-idle']
        ];

        it.each(cases)('maps %s to exactly one island shape (%s)', (state, expected) => {
            reduceMotion = true; // skip the animation; we only assert the resting class
            const ui = newUI();
            ui.renderControls(state);
            const present = ISLAND_CLASSES.filter(c => ui.controlCluster.classList.contains(c));
            expect(present).toEqual([expected]);
        });

        it('shows island-has-indicator only while the spinner shows (PROCESSING)', () => {
            reduceMotion = true;
            const ui = newUI();
            for (const state of Object.values(RECORDING_STATES)) {
                ui.renderControls(state);
                expect(ui.controlCluster.classList.contains('island-has-indicator'))
                    .toBe(state === RECORDING_STATES.PROCESSING);
            }
        });
    });

    describe('FLIP size morph', () => {
        it('cancels an in-flight morph before starting the next one', () => {
            const ui = newUI();

            ui.renderControls(RECORDING_STATES.RECORDING);
            expect(ui.controlCluster.animate).toHaveBeenCalledTimes(1);
            const first = ui.controlCluster.animations[0];

            // A second state change inside the morph window must cancel the first
            // animation (so we never stack two and never measure a mid-tween size).
            ui.renderControls(RECORDING_STATES.PROCESSING);
            expect(first.cancel).toHaveBeenCalledTimes(1);
            expect(ui.controlCluster.animate).toHaveBeenCalledTimes(2);
            expect(ui.controlCluster.classList.contains('island-morphing')).toBe(true);
        });

        it('clears island-morphing and the inline duration when the morph finishes', () => {
            const ui = newUI();
            ui.renderControls(RECORDING_STATES.RECORDING);
            expect(ui.controlCluster.classList.contains('island-morphing')).toBe(true);
            expect(ui.controlCluster.style.props['--island-morph-ms']).toBeDefined();

            // Simulate the WAAPI finish callback.
            ui.controlCluster.animations[0].onfinish();
            expect(ui.controlCluster.classList.contains('island-morphing')).toBe(false);
            expect(ui.controlCluster.style.props['--island-morph-ms']).toBeUndefined();
        });

        it('a stale finish does not strip the class off the morph that replaced it', () => {
            const ui = newUI();
            ui.renderControls(RECORDING_STATES.RECORDING);
            const stale = ui.controlCluster.animations[0];
            ui.renderControls(RECORDING_STATES.PROCESSING); // supersedes (cancels) the first

            // The first animation's late finish must be a no-op now.
            if (typeof stale.onfinish === 'function') stale.onfinish();
            expect(ui.controlCluster.classList.contains('island-morphing')).toBe(true);
        });

        it('skips the animation under prefers-reduced-motion (instant, correct mutate)', () => {
            reduceMotion = true;
            const ui = newUI();
            ui.renderControls(RECORDING_STATES.RECORDING);
            expect(ui.controlCluster.animate).not.toHaveBeenCalled();
            // The mutation still applied: the resting shape class is set.
            expect(ui.controlCluster.classList.contains('island-recording')).toBe(true);
            expect(ui.controlCluster.classList.contains('island-morphing')).toBe(false);
        });
    });
});
