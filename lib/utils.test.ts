import { test, expect, describe } from 'bun:test';
import { cn } from './utils';

describe('cn', () => {
  test('should merge class names correctly', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  test('should handle conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
    expect(cn('foo', true && 'bar', 'baz')).toBe('foo bar baz');
  });

  test('should handle arrays', () => {
    expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz');
  });

  test('should handle objects', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });

  test('should merge Tailwind classes correctly', () => {
    // Test that tailwind-merge works (conflicting classes)
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  test('should handle empty inputs', () => {
    expect(cn()).toBe('');
    expect(cn('')).toBe('');
    expect(cn(null, undefined, false)).toBe('');
  });

  test('should handle mixed inputs', () => {
    expect(cn('foo', ['bar', 'baz'], { qux: true })).toBe('foo bar baz qux');
  });

  test('should handle duplicate classes', () => {
    // Note: cn doesn't deduplicate, it just merges
    expect(cn('foo', 'foo', 'bar')).toContain('foo');
    expect(cn('foo', 'foo', 'bar')).toContain('bar');
  });
});
