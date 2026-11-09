/**
 * Centralized error reporting.
 * In a real environment, this might post to the AnalyticsStore or a backend.
 * For now, it logs to the console and provides a hook for future integration.
 */
export const ErrorReporter = {
  reportError(error, context = {}) {
    console.error('[ErrorReporter]', error, context);
    // In Phase 8, this will write an 'error_event' to AnalyticsStore
    // so parents can see if the app crashed during an exam.
  }
};
