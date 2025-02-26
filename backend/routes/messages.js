// Example of what to look for in the backend code
router.get('/messages', async (req, res) => {
  try {
    const { email } = req.query;
    const messages = await getMessagesForEmail(email);
    
    // Check if there's any processing here that might truncate the message content
    const processedMessages = messages.map(message => {
      // Is there any truncation happening here?
      const preview = message.body.substring(0, 200); // This would truncate the preview
      
      return {
        ...message,
        preview
      };
    });
    
    res.json({ messages: processedMessages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
}); 