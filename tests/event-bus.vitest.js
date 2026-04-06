import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../js/event-bus.js';
import { logger } from '../js/logger.js';

describe('EventBus direct behavior', () => {
  let bus;
  let childLogger;

  beforeEach(() => {
    bus = new EventBus();
    childLogger = {
      debug: vi.fn(),
      error: vi.fn()
    };
    vi.spyOn(logger, 'child').mockReturnValue(childLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('supports on and off with returned unsubscribe function', () => {
    const callback = vi.fn();
    const unsubscribe = bus.on('evt:test', callback);

    bus.emit('evt:test', { id: 1 });
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
    bus.emit('evt:test', { id: 2 });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(bus.getEvents()).not.toContain('evt:test');
  });

  it('supports once listeners that auto-remove after first emit', () => {
    const callback = vi.fn();
    bus.once('evt:once', callback);

    bus.emit('evt:once', { n: 1 });
    bus.emit('evt:once', { n: 2 });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ n: 1 });
  });

  it('invokes listeners in descending priority order', () => {
    const order = [];

    bus.on('evt:priority', () => order.push('low'), { priority: 1 });
    bus.on('evt:priority', () => order.push('high'), { priority: 5 });
    bus.on('evt:priority', () => order.push('mid'), { priority: 3 });

    bus.emit('evt:priority');
    expect(order).toEqual(['high', 'mid', 'low']);
  });

  it('keeps insertion order for equal priorities', () => {
    const order = [];

    bus.on('evt:stable', () => order.push('first'), { priority: 2 });
    bus.on('evt:stable', () => order.push('second'), { priority: 2 });
    bus.on('evt:stable', () => order.push('third'), { priority: 2 });

    bus.emit('evt:stable');
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('records history and caps it at 50 entries', () => {
    for (let i = 0; i < 55; i += 1) {
      bus.emit('evt:history', { i });
    }

    const history = bus.getHistory();
    expect(history).toHaveLength(50);
    expect(history[0].data).toEqual({ i: 5 });
    expect(history[49].data).toEqual({ i: 54 });
  });

  it('returns history copy instead of mutable internal reference', () => {
    bus.emit('evt:copy', { hello: 'world' });
    const history = bus.getHistory();

    history.push({ eventName: 'mutated' });

    expect(bus.getHistory()).toHaveLength(1);
  });

  it('clears a single event or all events', () => {
    bus.on('evt:a', vi.fn());
    bus.on('evt:b', vi.fn());

    bus.clear('evt:a');
    expect(bus.getEvents()).toEqual(['evt:b']);

    bus.clear();
    expect(bus.getEvents()).toEqual([]);
  });

  it('continues dispatching when a listener throws', () => {
    const goodListener = vi.fn();
    bus.on('evt:error', () => {
      throw new Error('boom');
    });
    bus.on('evt:error', goodListener);

    bus.emit('evt:error', { ok: true });

    expect(goodListener).toHaveBeenCalledTimes(1);
    expect(childLogger.error).toHaveBeenCalledTimes(1);
  });

  it('emits debug logs when debug mode is enabled', () => {
    bus.setDebugMode(true);

    bus.emit('evt:debug', { active: true });

    expect(childLogger.debug).toHaveBeenCalledWith('Emitting event: evt:debug', { active: true });
  });
});
