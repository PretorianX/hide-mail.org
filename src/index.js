import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.js';
import reportWebVitals from './reportWebVitals.js';
import { validateConfig } from './utils/configValidator.js';

// Validate configuration before rendering the app
try {
  validateConfig();
  
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  
  // If you want to start measuring performance in your app, pass a function
  // to log results (for example: reportWebVitals(console.log))
  // or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
  reportWebVitals();
} catch (error) {
  // Display error in the DOM
  const errorElement = document.createElement('div');
  errorElement.style.color = 'red';
  errorElement.style.padding = '20px';
  errorElement.style.fontFamily = 'monospace';
  errorElement.style.whiteSpace = 'pre-wrap';
  errorElement.textContent = `FATAL ERROR: ${error.message}`;
  
  document.body.innerHTML = '';
  document.body.appendChild(errorElement);
  
  // Also log to console
  console.error('FATAL ERROR:', error);
} 