import { createGlobalStyle } from 'styled-components';
import { HEADER_INK, HEADER_INK_STRONG, HEADER_HOVER_WASH } from './headerInk';

const GlobalStyle = createGlobalStyle`
  :root {
    /* Light theme variables */
    --primary-color: #4a90e2;
    --secondary-color: #f8f9fa;
    --accent-color: #ffcc00;
    --text-color: #333;
    --light-text: #666;
    --border-color: #ddd;
    --background-color: #f0f0f0;
    --card-background: #ffffff;
    --shadow-color: rgba(0, 0, 0, 0.1);
    
    /* Duck theme colors */
    --duck-orange: #f7941d;
    --duck-orange-light: #ffa940;
    --duck-black: #222222;
    --duck-gray: #f0f0f0;
    --duck-white: #ffffff;
    --duck-yellow: #ffde59;
  }

  /* Dark theme variables */
  [data-theme='dark'] {
    /* Improved dark theme colors */
    --primary-color: #6ba5f7;
    --secondary-color: #2d3748;
    --accent-color: #ffcc00;
    --text-color: #e2e8f0;
    --light-text: #a0aec0;
    --border-color: #4a5568;
    --background-color: #121620;
    --card-background: #1e2635;
    --shadow-color: rgba(0, 0, 0, 0.5);
    
    /* Duck theme colors in dark mode - improved for better contrast */
    --duck-orange: #ff9f30;
    --duck-orange-light: #ffb860;
    --duck-black: #e2e8f0;
    --duck-gray: #2d3748;
    --duck-white: #e2e8f0;
    --duck-yellow: #ffd426;
    
    /* Additional dark mode specific variables */
    --dark-card-hover: #2a3649;
    --dark-input-bg: #1a202c;
    --dark-border: #3a4556;
    --dark-button-text: #121620;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: 'Nunito', 'Arial', sans-serif;
    line-height: 1.6;
    margin: 0;
    padding: 0;
    background-color: var(--background-color);
    color: var(--text-color);
    transition: background-color 0.3s ease, color 0.3s ease;
  }

  /* Basic button styling - App.css will override these for specific buttons */
  button {
    cursor: pointer;
    border: none;
    border-radius: 8px;
    padding: 12px 20px;
    font-weight: bold;
    transition: all 0.2s ease;
  }

  /* Theme toggle button styling: it sits on the orange header bar, so it carries the header ink. */
  .theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background-color: transparent;
    color: ${HEADER_INK};
    border: 2px solid ${HEADER_INK};
    padding: 0;
    transition: all 0.3s ease;
  }

  .theme-toggle:hover {
    background-color: ${HEADER_HOVER_WASH};
    color: ${HEADER_INK_STRONG};
    border-color: ${HEADER_INK_STRONG};
  }

  .theme-toggle:focus-visible {
    outline: 3px solid ${HEADER_INK_STRONG};
    outline-offset: 2px;
  }

  /* App.css paints every dark-mode button in --duck-orange, which on the orange bar would leave
     the toggle invisible; this keeps it a bare ringed glyph in both themes. */
  [data-theme='dark'] .theme-toggle {
    background-color: transparent;
    color: ${HEADER_INK};
    border-color: ${HEADER_INK};
  }

  [data-theme='dark'] .theme-toggle:hover {
    background-color: ${HEADER_HOVER_WASH};
    color: ${HEADER_INK_STRONG};
    border-color: ${HEADER_INK_STRONG};
  }

  /* Add smooth transitions for theme changes */
  a, button, input, textarea, select {
    transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
  }

  /* Dark mode specific overrides */
  [data-theme='dark'] .email-display {
    background-color: #2a3649;
    border-color: var(--duck-orange);
    color: var(--duck-white);
  }

  [data-theme='dark'] .domain-select {
    background-color: var(--dark-input-bg);
    color: var(--duck-white);
    border-color: var(--dark-border);
  }

  [data-theme='dark'] .domain-select option {
    background-color: var(--dark-input-bg);
    color: var(--duck-white);
  }

  [data-theme='dark'] .message-item {
    background-color: #2a3649;
  }

  [data-theme='dark'] .message-item:hover {
    background-color: #3a4556;
  }

  [data-theme='dark'] .message-raw-content pre {
    background-color: #1a202c;
    color: #e2e8f0;
    border: 1px solid var(--dark-border);
  }

  [data-theme='dark'] .ad-banner,
  [data-theme='dark'] .ad-sidebar {
    background-color: #2a3649;
    border-color: var(--dark-border);
    color: var(--light-text);
  }

  [data-theme='dark'] .generate-email-container {
    background-color: #2a3649;
  }

  [data-theme='dark'] .mailbox-timer {
    background-color: #2a3649;
    border-color: var(--dark-border);
  }
  
  /* Footer styling for dark mode */
  [data-theme='dark'] footer {
    border-top-color: var(--border-color);
  }
  
  /* The Pro button is a link painted as a filled orange button, so the footer's link colour is kept
     off it: on hover this selector outweighs the button's own colour and turned the label orange on
     orange. */
  [data-theme='dark'] footer a:not(.pro-cta-button) {
    color: var(--duck-orange);
  }
  
  [data-theme='dark'] footer a:not(.pro-cta-button):hover {
    color: var(--duck-orange-light);
  }
`;

export default GlobalStyle; 