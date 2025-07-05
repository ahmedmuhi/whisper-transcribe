import { jest } from '@jest/globals';
import { Settings } from '../js/settings.js';
import { ID } from '../js/constants.js';

describe('Settings DOM caching', () => {
  let spyGetById;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  beforeEach(() => {
    // Reset DOM before each test
    document.body.innerHTML = '';
    // Create required DOM elements
    const elementIds = [
      ID.MODEL_SELECT,
      ID.SETTINGS_MODAL,
      ID.CLOSE_MODAL,
      ID.SAVE_SETTINGS,
      ID.SETTINGS_BUTTON,
      ID.STATUS,
      ID.WHISPER_SETTINGS,
      ID.GPT4O_SETTINGS,
      ID.WHISPER_URI,
      ID.WHISPER_KEY,
      ID.GPT4O_URI,
      ID.GPT4O_KEY
    ];
    elementIds.forEach((id) => {
      let el;
      // Inputs for uri/key ids
      if ([ID.WHISPER_URI, ID.WHISPER_KEY, ID.GPT4O_URI, ID.GPT4O_KEY].includes(id)) {
        el = document.createElement('input');
      } else {
        el = document.createElement('div');
      }
      el.id = id;
      document.body.appendChild(el);
    });

    spyGetById = jest.spyOn(document, 'getElementById');
  });

  afterEach(() => {
    jest.clearAllTimers();
    spyGetById.mockRestore();
  });

  test('should call document.getElementById only during construction', () => {
    // Instantiate Settings (constructor should perform DOM lookups)
    const settings = new Settings();

    // Ensure constructor has used getElementById at least once
    expect(spyGetById).toHaveBeenCalled();

    // Clear spy and call methods that should not perform DOM lookups
    spyGetById.mockClear();

    settings.updateSettingsVisibility();
    settings.loadSettingsToForm();
    settings.sanitizeInputs();
    settings.validateConfiguration();
    settings.getValidationErrors();
    settings.saveSettings();

    // Assert no further DOM queries
    expect(spyGetById).not.toHaveBeenCalled();
  });
});
