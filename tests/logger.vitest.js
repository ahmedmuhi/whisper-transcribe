import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;

async function loadFreshLogger() {
  vi.resetModules();
  const module = await import('../js/logger.js');
  return module.logger;
}

describe('logger direct behavior', () => {
  let logSpy;
  let warnSpy;
  let errorSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('gates debug and info output by active level', async () => {
    process.env.NODE_ENV = 'development';
    const logger = await loadFreshLogger();

    logger.setLevel(2);
    logger.debug('debug hidden');
    logger.info('info hidden');
    logger.warn('warn visible');
    logger.error('error visible');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('supports getLevel and isLevelEnabled checks', async () => {
    process.env.NODE_ENV = 'development';
    const logger = await loadFreshLogger();

    logger.setLevel(1);

    expect(logger.getLevel()).toBe(1);
    expect(logger.isLevelEnabled(0)).toBe(false);
    expect(logger.isLevelEnabled(1)).toBe(true);
    expect(logger.isLevelEnabled(2)).toBe(true);
  });

  it('creates child loggers with scoped context in message prefix', async () => {
    process.env.NODE_ENV = 'development';
    const logger = await loadFreshLogger();

    const child = logger.child('EventBus');
    child.info('scoped message');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [prefix, message] = logSpy.mock.calls[0];
    expect(prefix).toContain('INFO[EventBus]:');
    expect(message).toBe('scoped message');
  });

  it('defaults to debug level in development environment', async () => {
    process.env.NODE_ENV = 'development';
    const logger = await loadFreshLogger();

    expect(logger.getLevel()).toBe(0);
  });

  it('defaults to error level in production environment', async () => {
    process.env.NODE_ENV = 'production';
    const logger = await loadFreshLogger();

    expect(logger.getLevel()).toBe(3);
  });

  it('detects localhost as development when NODE_ENV is absent', async () => {
    delete process.env.NODE_ENV;
    vi.stubGlobal('window', {
      location: {
        hostname: 'localhost',
        search: ''
      }
    });

    const logger = await loadFreshLogger();
    expect(logger.getLevel()).toBe(0);
  });

  it('detects debug query flag as development when hostname is non-local', async () => {
    delete process.env.NODE_ENV;
    vi.stubGlobal('window', {
      location: {
        hostname: 'example.com',
        search: '?debug=1'
      }
    });

    const logger = await loadFreshLogger();
    expect(logger.getLevel()).toBe(0);
  });
});
