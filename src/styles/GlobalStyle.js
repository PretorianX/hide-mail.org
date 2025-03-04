import { createGlobalStyle } from 'styled-components';

const GlobalStyle = createGlobalStyle`
  :root {
    --primary-color: #4a90e2;
    --secondary-color: #f8f9fa;
    --accent-color: #ffcc00;
    --text-color: #333;
    --light-text: #666;
    --border-color: #ddd;
    
    /* Duck theme colors */
    --duck-orange: #f7941d;
    --duck-orange-light: #ffa940;
    --duck-black: #222222;
    --duck-gray: #f0f0f0;
    --duck-white: #ffffff;
    --duck-yellow: #ffde59;
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
    background-color: var(--duck-gray);
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
`;

export default GlobalStyle; 