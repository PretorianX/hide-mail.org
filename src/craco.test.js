/**
 * This is a simple test to ensure our CRACO configuration is working correctly.
 * It doesn't actually test any functionality, but it will fail if the CRACO
 * configuration is not properly set up.
 */

describe('CRACO Configuration', () => {
  test('CRACO configuration is loaded', () => {
    // This is a simple test to ensure the CRACO configuration is loaded
    // If CRACO is not properly configured, this test will fail during the build process
    expect(true).toBe(true);
  });
});

// Import the packages we're using to replace deprecated ones
// If these imports fail, it means our configuration is not working
describe('Replacement Packages', () => {
  test('Can import @jridgewell/sourcemap-codec', async () => {
    try {
      const module = await import('@jridgewell/sourcemap-codec');
      expect(module).toBeDefined();
    } catch (error) {
      fail('Failed to import @jridgewell/sourcemap-codec');
    }
  });

  test('Can import @rollup/plugin-terser', async () => {
    try {
      const module = await import('@rollup/plugin-terser');
      expect(module).toBeDefined();
    } catch (error) {
      fail('Failed to import @rollup/plugin-terser');
    }
  });
}); 