import { createGlobalStyle } from 'styled-components';

const GlobalStyle = createGlobalStyle`
  :root {
    --primary-color: #4a90e2;
    --secondary-color: #f8f9fa;
    --accent-color: #ffcc00;
    --text-color: #333;
    --light-text: #666;
    --border-color: #ddd;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    background-color: var(--secondary-color);
    color: var(--text-color);
    line-height: 1.6;
  }

  button {
    cursor: pointer;
    border: none;
    border-radius: 4px;
    padding: 10px 15px;
    background-color: var(--primary-color);
    color: white;
    font-weight: 500;
    transition: background-color 0.3s;

    &:hover {
      background-color: #3a7bc8;
    }
  }
`;

export default GlobalStyle; 