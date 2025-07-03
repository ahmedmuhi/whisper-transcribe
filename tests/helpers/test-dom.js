import { jest } from '@jest/globals';

export function applyDomSpies() {
  const elements = {};
  global.document.getElementById = jest.fn(id => {
    if (!elements[id]) {
      elements[id] = {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        style: { display: '' },
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
          contains: jest.fn().mockReturnValue(false),
          toggle: jest.fn()
        },
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        click: jest.fn(),
        setAttribute: jest.fn(),
        removeAttribute: jest.fn(),
        getAttribute: jest.fn(),
        focus: jest.fn(),
        getContext: jest.fn(() => ({
          fillRect: jest.fn(),
          clearRect: jest.fn(),
          fillStyle: ''
        })),
        appendChild: jest.fn(),
        removeChild: jest.fn(),
        disabled: false,
        checked: false,
        selectionStart: 0,
        selectionEnd: 0,
        scrollTop: 0,
        scrollHeight: 0,
        parentElement: { offsetWidth: 0, offsetHeight: 0 }
      };
    }
    return elements[id];
  });
}
