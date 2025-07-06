import { vi } from 'vitest';

export function applyDomSpies() {
  const elements = {};
  global.document.getElementById = vi.fn(id => {
    if (!elements[id]) {
      elements[id] = {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        className: '',
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
          toggle: vi.fn(),
          contains: vi.fn(() => false)
        },
        style: {},
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        click: vi.fn(),
        focus: vi.fn(),
        blur: vi.fn(),
        setAttribute: vi.fn(),
        getAttribute: vi.fn(() => null),
        removeAttribute: vi.fn(),
        hasAttribute: vi.fn(() => false),
        appendChild: vi.fn(),
        removeChild: vi.fn(),
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => []),
        children: [],
        parentNode: null,
        firstChild: null,
        lastChild: null,
        nextSibling: null,
        previousSibling: null,
        nodeType: 1,
        nodeName: 'DIV'
      };
    }
    return elements[id];
  });
}
