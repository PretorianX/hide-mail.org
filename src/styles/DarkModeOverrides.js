import { createGlobalStyle } from 'styled-components';

const DarkModeOverrides = createGlobalStyle`
  /* Blog Page Dark Mode Styles */
  [data-theme='dark'] .BlogContainer {
    color: var(--text-color);
  }

  [data-theme='dark'] .BlogTitle {
    color: var(--duck-white);
  }

  [data-theme='dark'] .BlogDescription {
    color: var(--light-text);
  }

  [data-theme='dark'] .BlogPostCard {
    background-color: var(--card-background);
    box-shadow: 0 4px 12px var(--shadow-color);
  }

  [data-theme='dark'] .BlogPostCard:hover {
    box-shadow: 0 8px 20px var(--shadow-color);
  }

  [data-theme='dark'] .BlogPostTitle {
    color: var(--duck-white);
  }

  [data-theme='dark'] .BlogPostExcerpt {
    color: var(--light-text);
  }

  [data-theme='dark'] .ReadMoreLink {
    color: var(--duck-orange);
  }

  /* Blog Post Page Dark Mode Styles */
  [data-theme='dark'] .BlogPostTitle {
    color: var(--duck-white);
  }

  [data-theme='dark'] .BlogPostMeta {
    color: var(--light-text);
  }

  [data-theme='dark'] .BlogPostContent {
    color: var(--light-text);
  }

  [data-theme='dark'] .BlogPostContent h2,
  [data-theme='dark'] .BlogPostContent h3 {
    color: var(--duck-white);
  }

  [data-theme='dark'] .BlogPostContent blockquote {
    color: var(--light-text);
    border-left-color: var(--duck-orange);
  }

  [data-theme='dark'] .BackToBlogs {
    color: var(--duck-orange);
  }

  [data-theme='dark'] .RelatedPostsTitle {
    color: var(--duck-white);
  }

  [data-theme='dark'] .RelatedPostCard {
    background-color: var(--card-background);
    box-shadow: 0 4px 8px var(--shadow-color);
  }

  [data-theme='dark'] .RelatedPostTitle {
    color: var(--duck-white);
  }

  /* About Us Page Dark Mode Styles */
  [data-theme='dark'] .Container {
    color: var(--text-color);
  }

  [data-theme='dark'] .Title {
    color: var(--duck-white);
  }

  [data-theme='dark'] .SectionTitle {
    color: var(--duck-white);
  }

  [data-theme='dark'] .Paragraph {
    color: var(--light-text);
  }

  [data-theme='dark'] .List {
    color: var(--light-text);
  }

  [data-theme='dark'] a {
    color: var(--duck-orange);
  }

  /* Contact Us Page Dark Mode Styles */
  [data-theme='dark'] .FormGroup label {
    color: var(--duck-white);
  }

  [data-theme='dark'] .Input,
  [data-theme='dark'] .TextArea {
    background-color: var(--dark-input-bg);
    color: var(--duck-white);
    border-color: var(--dark-border);
  }

  [data-theme='dark'] .Button {
    background-color: var(--duck-orange);
    color: var(--dark-button-text);
  }

  [data-theme='dark'] .Button:hover {
    background-color: var(--duck-orange-light);
  }

  [data-theme='dark'] .Button:disabled {
    background-color: #555;
    color: #aaa;
  }

  [data-theme='dark'] .SuccessMessage {
    background-color: rgba(21, 87, 36, 0.2);
    color: #4ade80;
  }

  [data-theme='dark'] .ErrorMessage {
    background-color: rgba(114, 28, 36, 0.2);
    color: #f87171;
  }

  [data-theme='dark'] .InfoItem {
    color: var(--light-text);
  }

  [data-theme='dark'] .Label {
    color: var(--duck-white);
  }

  /* Privacy Policy and Terms of Service Dark Mode Styles */
  [data-theme='dark'] .PrivacyContainer h3,
  [data-theme='dark'] .TermsContainer h3 {
    color: var(--duck-white);
  }

  [data-theme='dark'] .PrivacyContainer p,
  [data-theme='dark'] .TermsContainer p,
  [data-theme='dark'] .PrivacyContainer li,
  [data-theme='dark'] .TermsContainer li {
    color: var(--light-text);
  }
`;

export default DarkModeOverrides; 