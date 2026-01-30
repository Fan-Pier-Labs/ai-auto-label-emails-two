/**
 * Replaceable analytics. Default implementation logs to console
 * (e.g. for CloudWatch on Fargate). Swap with Sentry or other backends via setAnalytics().
 * Do not log email contents — only event names, counts, and safe user identifiers.
 */

export interface Analytics {
  track(name: string, data: Record<string, unknown>): void;
}

class ConsoleAnalytics implements Analytics {
  track(name: string, data: Record<string, unknown>): void {
    // stringify so that we can use JSON capture in cloudwatch logs.
    console.log(JSON.stringify({ event: name, ...data }));
  }
}

let currentAnalytics: Analytics = new ConsoleAnalytics();

export const analytics: Analytics = {
  track(name: string, data: Record<string, unknown>): void {
    currentAnalytics.track(name, data);
  },
};

export function setAnalytics(instance: Analytics): void {
  currentAnalytics = instance;
}
