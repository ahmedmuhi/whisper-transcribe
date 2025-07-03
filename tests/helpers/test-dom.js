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
        disabled: false,
        checked: false
      };
    }
    return elements[id];
  });
}
