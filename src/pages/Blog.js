import React from 'react';
import { Link } from 'react-router';
import styled from 'styled-components';
import ContentAwareAd from '../components/ContentAwareAd';
import { getAdSenseSlot, AD_SLOTS } from '../utils/adsenseSlots';

const BlogContainer = styled.div`
  max-width: 1000px;
  margin: 0 auto;
  padding: 40px 20px;
`;

const BlogHeader = styled.div`
  text-align: center;
  margin-bottom: 40px;
`;

const BlogTitle = styled.h1`
  font-size: 2.5rem;
  color: #333;
  margin-bottom: 15px;
`;

const BlogDescription = styled.p`
  font-size: 1.1rem;
  color: #666;
  max-width: 700px;
  margin: 0 auto;
  line-height: 1.6;
`;

const BlogPostsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 30px;
  margin-top: 40px;
`;

const BlogPostCard = styled.article`
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  background: #fff;
  
  &:hover,
  &:focus-within {
    transform: translateY(-5px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  }
  
  &:focus-within {
    outline: 3px solid #4285f4;
    outline-offset: 3px;
  }
  
  @media (prefers-reduced-motion: reduce) {
    transition: none;
    
    &:hover,
    &:focus-within {
      transform: none;
    }
  }
`;

const BlogPostImage = styled.img`
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
`;

const BlogPostContent = styled.div`
  padding: 20px;
`;

const BlogPostTitle = styled.h2`
  font-size: 1.4rem;
  margin-bottom: 10px;
  color: #333;
`;

const BlogPostLink = styled(Link)`
  color: inherit;
  text-decoration: none;
  
  /* Stretches this single link over the whole card, so the card is one hit target
     without nesting further interactive elements inside it. */
  &::after {
    content: '';
    position: absolute;
    inset: 0;
  }
  
  /* The focus ring is drawn on the card by :focus-within, which matches the hit area. */
  &:focus,
  &:focus-visible {
    outline: none;
  }
`;

const BlogPostExcerpt = styled.p`
  font-size: 0.95rem;
  color: #666;
  line-height: 1.5;
  margin-bottom: 15px;
`;

const ReadMoreCue = styled.span`
  display: inline-block;
  color: #4285f4;
  font-weight: 500;
  
  ${BlogPostCard}:hover &,
  ${BlogPostCard}:focus-within & {
    text-decoration: underline;
  }
`;

const AdContainer = styled.div`
  margin: 40px 0;
  text-align: center;
`;

const Blog = () => {
  const blogPosts = [
    {
      id: 'email-forwarding-use-cases',
      title: 'Forward & Forget: 10 Smart Ways to Use Email Forwarding with Temporary Addresses',
      excerpt: 'Discover how Hide Mail\'s unique Forward & Forget feature lets you stay anonymous while saving important emails to your real inbox—no account required.',
      image: '/images/blog/email-forwarding-use-cases.jpg',
      date: 'December 5, 2024'
    },
    {
      id: 'temporary-email-guide',
      title: 'What Are Temporary Email Addresses and How Do They Work?',
      excerpt: 'A beginner-friendly guide that explains the concept of temporary email addresses and how they function, including step-by-step instructions for using Hide Mail.',
      image: '/images/blog/temporary-email-guide.jpg',
      date: 'June 15, 2023'
    },
    {
      id: 'email-privacy',
      title: 'Email Privacy: Why It Matters and How to Protect It',
      excerpt: 'Learn about email privacy risks, how companies use your email data, and practical tips to protect your privacy online with tools like Hide Mail.',
      image: '/images/blog/email-privacy.jpg',
      date: 'July 2, 2023'
    },
    {
      id: 'email-security-best-practices',
      title: 'Email Security Best Practices',
      excerpt: 'Discover actionable tips to secure your email accounts, from creating strong passwords to avoiding phishing attempts and using temporary emails to reduce risks.',
      image: '/images/blog/email-security.jpg',
      date: 'July 18, 2023'
    },
    {
      id: 'legal-side-of-email-privacy',
      title: 'The Legal Side of Email Privacy: What You Need to Know',
      excerpt: 'A deeper dive into laws like GDPR and CAN-SPAM Act, how they affect email users, and how Hide Mail aligns with privacy regulations.',
      image: '/images/blog/legal-email-privacy.jpg',
      date: 'August 5, 2023'
    }
  ];

  return (
    <BlogContainer className="BlogContainer">
      <BlogHeader className="blog-header">
        <BlogTitle className="BlogTitle">Hide Mail Blog</BlogTitle>
        <BlogDescription className="BlogDescription">
          Explore our articles about email privacy, security best practices, and how to make the most of temporary email services.
        </BlogDescription>
      </BlogHeader>
      
      <AdContainer>
        <ContentAwareAd
          slot={getAdSenseSlot(AD_SLOTS.BLOG_TOP)}
          format="horizontal"
          width={728}
          height={90}
          position="top-of-blog"
          contentSelector=".blog-header"
          minContentLength={100}
        />
      </AdContainer>
      
      <BlogPostsGrid className="blog-posts-grid">
        {blogPosts.map(post => (
          <BlogPostCard key={post.id} className="BlogPostCard">
            {/* Decorative: the card link right below already announces the post title. */}
            <BlogPostImage src={post.image} alt="" loading="lazy" decoding="async" />
            <BlogPostContent>
              <BlogPostTitle className="BlogPostTitle">
                <BlogPostLink to={`/blog/${post.id}`} className="BlogPostLink">{post.title}</BlogPostLink>
              </BlogPostTitle>
              <BlogPostExcerpt className="BlogPostExcerpt">{post.excerpt}</BlogPostExcerpt>
              <ReadMoreCue className="ReadMoreCue" aria-hidden="true">Read More →</ReadMoreCue>
            </BlogPostContent>
          </BlogPostCard>
        ))}
      </BlogPostsGrid>
      
      <AdContainer>
        <ContentAwareAd
          slot={getAdSenseSlot(AD_SLOTS.BLOG_BOTTOM)}
          format="horizontal"
          width={728}
          height={90}
          position="bottom-of-blog"
          contentSelector=".blog-posts-grid"
          minContentLength={300}
        />
      </AdContainer>
    </BlogContainer>
  );
};

export default Blog; 