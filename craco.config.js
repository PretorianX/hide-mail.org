module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Replace deprecated packages with their newer alternatives
      if (!webpackConfig.resolve) {
        webpackConfig.resolve = {};
      }
      
      if (!webpackConfig.resolve.alias) {
        webpackConfig.resolve.alias = {};
      }
      
      // Replace sourcemap-codec with @jridgewell/sourcemap-codec
      webpackConfig.resolve.alias['sourcemap-codec'] = '@jridgewell/sourcemap-codec';
      
      // Replace rollup-plugin-terser with @rollup/plugin-terser
      webpackConfig.resolve.alias['rollup-plugin-terser'] = '@rollup/plugin-terser';
      
      // Update Babel configuration to use newer plugins
      if (webpackConfig.module && webpackConfig.module.rules) {
        webpackConfig.module.rules.forEach(rule => {
          if (rule.oneOf) {
            rule.oneOf.forEach(oneOfRule => {
              if (oneOfRule.use && Array.isArray(oneOfRule.use)) {
                oneOfRule.use.forEach(loader => {
                  if (loader.loader && loader.loader.includes('babel-loader') && loader.options && loader.options.plugins) {
                    // Replace deprecated Babel plugins with their newer alternatives
                    loader.options.plugins = loader.options.plugins.map(plugin => {
                      if (Array.isArray(plugin) && plugin[0]) {
                        const pluginName = typeof plugin[0] === 'string' ? plugin[0] : '';
                        
                        // Map of deprecated plugins to their replacements
                        const pluginReplacements = {
                          '@babel/plugin-proposal-private-methods': '@babel/plugin-transform-private-methods',
                          '@babel/plugin-proposal-optional-chaining': '@babel/plugin-transform-optional-chaining',
                          '@babel/plugin-proposal-nullish-coalescing-operator': '@babel/plugin-transform-nullish-coalescing-operator',
                          '@babel/plugin-proposal-class-properties': '@babel/plugin-transform-class-properties',
                          '@babel/plugin-proposal-numeric-separator': '@babel/plugin-transform-numeric-separator',
                          '@babel/plugin-proposal-private-property-in-object': '@babel/plugin-transform-private-property-in-object'
                        };
                        
                        if (pluginReplacements[pluginName]) {
                          return [pluginReplacements[pluginName], plugin[1]];
                        }
                      }
                      return plugin;
                    });
                  }
                });
              }
            });
          }
        });
      }
      
      return webpackConfig;
    },
  },
  jest: {
    configure: {
      // Configure Jest to handle ES modules
      transformIgnorePatterns: [
        "node_modules/(?!axios|@faker-js/faker)/"
      ],
      moduleNameMapper: {
        "^axios$": "<rootDir>/node_modules/axios/dist/axios.js"
      }
    }
  }
}; 