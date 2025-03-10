// Mock implementation of axios for testing
const mockAxios = {
  get: jest.fn(() => Promise.resolve({ 
    data: { 
      data: ['tempmail.com', 'duckmail.org', 'mailinator.com'] 
    } 
  })),
  post: jest.fn(() => Promise.resolve({ 
    data: { 
      success: true 
    } 
  })),
  defaults: {
    headers: {
      common: {}
    }
  }
};

export default mockAxios; 