import { eventBus, APP_EVENTS } from '../js/event-bus.js';
import { errorHandler } from '../js/error-handler.js';
import { jest } from '@jest/globals';

describe('ErrorHandler', () => {
  beforeEach(() => {
    jest.spyOn(eventBus, 'emit');
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
});
