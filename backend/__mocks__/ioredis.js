// Mock implementation of ioredis
class RedisMock {
  constructor() {
    this.data = {};
    this.events = {};
  }

  // Event handling
  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
    return this;
  }

  emit(event, ...args) {
    if (this.events[event]) {
      this.events[event].forEach(callback => callback(...args));
    }
  }

  // Basic Redis operations
  async get(key) {
    return this.data[key] || null;
  }

  async set(key, value, ...args) {
    this.data[key] = value;
    return 'OK';
  }

  async del(key) {
    delete this.data[key];
    return 1;
  }

  async exists(key) {
    return this.data[key] ? 1 : 0;
  }

  async expire(key, seconds) {
    if (this.data[key]) {
      return 1;
    }
    return 0;
  }

  async ttl(key) {
    return this.data[key] ? 3600 : -2; // Return 1 hour if key exists
  }

  async keys(pattern) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Object.keys(this.data).filter(key => regex.test(key));
  }

  async hset(key, field, value) {
    if (!this.data[key]) {
      this.data[key] = {};
    }
    this.data[key][field] = value;
    return 1;
  }

  async hget(key, field) {
    return this.data[key] && this.data[key][field] ? this.data[key][field] : null;
  }

  async hgetall(key) {
    return this.data[key] || {};
  }

  async hmset(key, ...args) {
    if (!this.data[key]) {
      this.data[key] = {};
    }
    
    // Handle both array and object formats
    if (args.length === 1 && typeof args[0] === 'object') {
      Object.entries(args[0]).forEach(([field, value]) => {
        this.data[key][field] = value;
      });
    } else {
      for (let i = 0; i < args.length; i += 2) {
        const field = args[i];
        const value = args[i + 1];
        this.data[key][field] = value;
      }
    }
    
    return 'OK';
  }

  async hdel(key, ...fields) {
    if (!this.data[key]) {
      return 0;
    }
    
    let count = 0;
    fields.forEach(field => {
      if (this.data[key][field] !== undefined) {
        delete this.data[key][field];
        count++;
      }
    });
    
    return count;
  }

  async sadd(key, ...members) {
    if (!this.data[key]) {
      this.data[key] = new Set();
    }
    
    let count = 0;
    members.forEach(member => {
      if (!this.data[key].has(member)) {
        this.data[key].add(member);
        count++;
      }
    });
    
    return count;
  }

  async smembers(key) {
    if (!this.data[key]) {
      return [];
    }
    
    return Array.from(this.data[key]);
  }

  async sismember(key, member) {
    if (!this.data[key]) {
      return 0;
    }
    
    return this.data[key].has(member) ? 1 : 0;
  }

  async srem(key, ...members) {
    if (!this.data[key]) {
      return 0;
    }
    
    let count = 0;
    members.forEach(member => {
      if (this.data[key].has(member)) {
        this.data[key].delete(member);
        count++;
      }
    });
    
    return count;
  }
}

module.exports = RedisMock; 