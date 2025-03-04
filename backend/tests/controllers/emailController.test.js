const axios = require('axios');
const emailController = require('../../controllers/emailController');

jest.mock('axios');

describe('emailController', () => {
  describe('getDomains', () => {
    it('should successfully fetch domains with proper authentication', async () => {
      const mockResponse = {
        success: true,
        domains: ['domain1.com', 'domain2.com']
      };
      
      axios.get.mockResolvedValueOnce({ data: mockResponse });
      
      const req = {};
      const res = {
        json: jest.fn()
      };
      
      await emailController.getDomains(req, res);
      
      expect(axios.get).toHaveBeenCalledWith(
        `${process.env.API_BASE_URL}/domains`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.HIDE_MAIL_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      expect(res.json).toHaveBeenCalledWith(mockResponse);
    });

    it('should handle unauthorized errors', async () => {
      const errorResponse = {
        response: {
          status: 401,
          data: {
            success: false,
            error: 'Unauthorized access'
          }
        }
      };
      
      axios.get.mockRejectedValueOnce(errorResponse);
      
      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      await emailController.getDomains(req, res);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized access'
      });
    });
  });
}); 