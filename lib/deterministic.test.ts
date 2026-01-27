import { test, expect, describe } from 'bun:test';

/**
 * Local tests - these don't hit the network and should work 100% of the time.
 * Run with: bun test
 * 
 * Network-dependent tests are in deterministic.network.test.ts
 * Run network tests with: bun test:network
 */
describe('[local] deterministic rules', () => {
  // Add local-only tests here that don't require network access
  // For example: unit tests for helper functions, date parsing, etc.
  
  test('placeholder - add local tests here', () => {
    // This is a placeholder. Add local tests that don't hit the network.
    expect(true).toBe(true);
  });
});

