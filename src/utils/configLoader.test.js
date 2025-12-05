describe('configLoader', () => {
  const originalEnv = process.env;
  const originalWindow = global.window;
  
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete global.window;
  });
  
  afterAll(() => {
    process.env = originalEnv;
    global.window = originalWindow;
  });
  
  test('should get value from runtime config', () => {
    global.window = {
      __RUNTIME_CONFIG__: {
        email: {
          expirationTime: 1800,
          extensionTime: 900,
          domains: ['test.com', 'example.org']
        },
        api: {
          url: 'https://api.runtime.com',
          timeout: 5000
        }
      }
    };
    
    const { getConfig } = require('./configLoader');
    
    expect(getConfig('email.expirationTime')).toEqual(1800);
    expect(getConfig('email.extensionTime')).toEqual(900);
    expect(getConfig('api.url')).toBe('https://api.runtime.com');
    expect(getConfig('email.domains')).toEqual(['test.com', 'example.org']);
  });
  
  test('should get value from environment variables', () => {
    process.env.REACT_APP_API_URL = 'https://api.env.com';
    global.window = {};
    
    const { getConfig } = require('./configLoader');
    
    expect(getConfig('api.url')).toBe('https://api.env.com');
  });
  
  test('should prefer runtime config over env vars', () => {
    process.env.REACT_APP_API_URL = 'https://api.env.com';
    global.window = {
      __RUNTIME_CONFIG__: {
        api: {
          url: 'https://api.runtime.com'
        }
      }
    };
    
    const { getConfig } = require('./configLoader');
    
    expect(getConfig('api.url')).toBe('https://api.runtime.com');
  });
  
  test('should throw error for missing config', () => {
    global.window = {};
    
    const { getConfig } = require('./configLoader');
    
    expect(() => getConfig('nonexistent.path')).toThrow('Configuration not found: nonexistent.path');
  });
  
  test('should throw error when no window and no config', () => {
    delete global.window;
    
    const { getConfig } = require('./configLoader');
    
    expect(() => getConfig('api.url')).toThrow('Configuration not found: api.url');
  });
});
