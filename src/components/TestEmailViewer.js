import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';

const Container = styled.div`
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
  margin: 20px 0;
`;

const IframeContainer = styled.div`
  width: 100%;
  height: 400px;
  border: 1px solid #ddd;
  background: white;
  margin-top: 10px;
`;

const Button = styled.button`
  padding: 8px 16px;
  background: #4a90e2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-top: 10px;
`;

const TestEmailViewer = () => {
  const iframeRef = useRef(null);
  const [testHtml, setTestHtml] = useState('<h1>Test HTML Content</h1><p>This is a test paragraph.</p>');
  
  const renderHtml = () => {
    if (!iframeRef.current) {
      console.error('iframe ref is null');
      return;
    }
    
    try {
      const iframe = iframeRef.current;
      const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
      
      console.log('Writing test HTML to iframe');
      
      iframeDocument.open();
      iframeDocument.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: Arial, sans-serif;
                padding: 20px;
              }
            </style>
          </head>
          <body>
            ${testHtml}
          </body>
        </html>
      `);
      iframeDocument.close();
      
      console.log('Successfully wrote test HTML to iframe');
    } catch (error) {
      console.error('Error writing to iframe:', error);
    }
  };
  
  useEffect(() => {
    // Render the HTML when the component mounts
    const timer = setTimeout(() => {
      renderHtml();
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);
  
  return (
    <Container>
      <h2>Test Email Viewer</h2>
      <p>This is a test component to debug iframe rendering issues.</p>
      
      <IframeContainer>
        <iframe 
          ref={iframeRef}
          title="Test Email Content"
          sandbox="allow-same-origin allow-scripts"
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </IframeContainer>
      
      <Button onClick={renderHtml}>Re-render HTML</Button>
    </Container>
  );
};

export default TestEmailViewer; 