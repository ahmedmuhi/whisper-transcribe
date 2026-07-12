import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { errorHandler } from '../js/error-handler.js';
import { MESSAGES } from '../js/constants.js';
import { vi } from 'vitest';

describe('ErrorHandler', () => {
  beforeEach(() => {
    vi.spyOn(eventBus, 'emit');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should emit ERROR_OCCURRED with correct payload', () => {
    const error = new Error('Test error message');
    error.name = 'TestError';
    const context = { details: 'some context' };

    errorHandler.handleError(error, context);

    expect(eventBus.emit).toHaveBeenCalledWith(
      APP_EVENTS.ERROR_OCCURRED,
      { code: 'TestError', message: 'Test error message', context }
    );
  });

  it('prefers a context error code over the error name', () => {
    const error = new Error('Contextual failure');
    error.name = 'OriginalError';
    const context = { code: 'CONTEXT_ERROR', source: 'test' };

    errorHandler.handleError(error, context);

    expect(eventBus.emit).toHaveBeenCalledWith(
      APP_EVENTS.ERROR_OCCURRED,
      { code: 'CONTEXT_ERROR', message: 'Contextual failure', context }
    );
  });

  it('falls back to generic code and message when error details are empty', () => {
    const errorLike = { name: '', message: '' };

    errorHandler.handleError(errorLike);

    expect(eventBus.emit).toHaveBeenCalledWith(
      APP_EVENTS.ERROR_OCCURRED,
      { code: 'UNKNOWN_ERROR', message: MESSAGES.ERROR_OCCURRED, context: {} }
    );
  });
});
