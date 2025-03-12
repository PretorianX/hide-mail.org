/**
 * Tests for CRACO configuration to ensure it's properly set up and functioning.
 * These tests verify that our webpack and babel configurations are working as expected.
 */

// Mock webpack config for testing
const mockWebpackConfig = {
  resolve: {
    alias: {},
    modules: ['node_modules']
  },
  module: {
    rules: [{
      oneOf: [{
        use: [{
          loader: 'babel-loader',
          options: {
            plugins: [
              ['@babel/plugin-proposal-private-methods', {}],
              ['@babel/plugin-proposal-optional-chaining', {}]
            ]
          }
        }]
      }]
    }]
  }
};

// Import the actual CRACO config
const cracoConfig = require('../craco.config');

describe('CRACO Configuration', () => {
  test('CRACO webpack configuration transforms webpack config correctly', () => {
    // Apply our CRACO webpack configuration to the mock webpack config
    const transformedConfig = cracoConfig.webpack.configure(mockWebpackConfig);
    
    // Test alias replacements
    expect(transformedConfig.resolve.alias['sourcemap-codec']).toBe('@jridgewell/sourcemap-codec');
    expect(transformedConfig.resolve.alias['rollup-plugin-terser']).toBe('@rollup/plugin-terser');
    
    // Test module resolution
    expect(transformedConfig.resolve.modules[0]).toBe(process.cwd());
    
    // Test Babel plugin transformations
    const babelLoader = transformedConfig.module.rules[0].oneOf[0].use[0];
    const transformedPlugins = babelLoader.options.plugins;
    
    // Check if plugins were properly transformed
    const privateMethodsPlugin = transformedPlugins.find(p => 
      Array.isArray(p) && p[0] === '@babel/plugin-transform-private-methods'
    );
    expect(privateMethodsPlugin).toBeDefined();
    
    const optionalChainingPlugin = transformedPlugins.find(p => 
      Array.isArray(p) && p[0] === '@babel/plugin-transform-optional-chaining'
    );
    expect(optionalChainingPlugin).toBeDefined();
  });
  
  test('CRACO jest configuration includes necessary transformIgnorePatterns', () => {
    // Verify Jest configuration
    expect(cracoConfig.jest.configure.transformIgnorePatterns).toContain(
      'node_modules/(?!axios|@faker-js/faker)/'
    );
  });

  // Import the packages we're using to replace deprecated ones
  test('Can import replacement packages', async () => {
    try {
      const sourcemapCodec = await import('@jridgewell/sourcemap-codec');
      expect(sourcemapCodec).toBeDefined();
      
      const terserPlugin = await import('@rollup/plugin-terser');
      expect(terserPlugin).toBeDefined();
    } catch (error) {
      fail('Failed to import replacement packages: ' + error.message);
    }
  });
}); 