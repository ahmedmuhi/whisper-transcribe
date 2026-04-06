import { vi } from 'vitest';

/**
 * Creates a mock DOM element with stateless classList (vi.fn() stubs).
 * Use for unit tests where classList state tracking is not needed.
 */
export const createMockElement = (initialValue = '') => ({
    value: initialValue,
    textContent: '',
    style: { display: '', opacity: '1', cursor: 'pointer' },
    classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn(() => false),
        toggle: vi.fn()
    },
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
    getAttribute: vi.fn(() => ''),
    disabled: false,
    checked: false,
    focus: vi.fn(),
    scrollTop: 0,
    scrollHeight: 100,
    selectionStart: 0,
    selectionEnd: 0
});

/**
 * Creates a mock DOM element with stateful classList (backed by a real Set).
 * Use for workflow/integration tests where classList.contains must reflect reality.
 */
export const createStatefulMockElement = (id) => {
    const classSet = new Set();
    return {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        style: { display: 'block', opacity: '1', cursor: 'pointer' },
        classList: {
            add: vi.fn((cls) => classSet.add(cls)),
            remove: vi.fn((cls) => classSet.delete(cls)),
            contains: vi.fn((cls) => classSet.has(cls)),
            toggle: vi.fn((cls, force) => {
                if (force !== undefined) {
                    if (force) { classSet.add(cls); return true; }
                    classSet.delete(cls); return false;
                }
                if (classSet.has(cls)) { classSet.delete(cls); return false; }
                classSet.add(cls); return true;
            })
        },
        addEventListener: vi.fn(),
        setAttribute: vi.fn(),
        getAttribute: vi.fn(() => ''),
        disabled: false,
        checked: false,
        focus: vi.fn(),
        selectionStart: 0,
        selectionEnd: 0,
        scrollTop: 0,
        scrollHeight: 0
    };
};

/**
 * Creates a standard localStorage mock with vi.fn() stubs.
 */
export const createLocalStorageMock = () => ({
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
});
