import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import ContentAwareAd from '../components/ContentAwareAd';

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

const BlogPostCard = styled.div`
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  background: #fff;
  
  &:hover {
    transform: translateY(-5px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  }
`;

const BlogPostImage = styled.div`
  height: 180px;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
`;

const BlogPostContent = styled.div`
  padding: 20px;
`;

const BlogPostTitle = styled.h2`
  font-size: 1.4rem;
  margin-bottom: 10px;
  color: #333;
`;

const BlogPostExcerpt = styled.p`
  font-size: 0.95rem;
  color: #666;
  line-height: 1.5;
  margin-bottom: 15px;
`;

const ReadMoreLink = styled(Link)`
  display: inline-block;
  color: #4285f4;
  font-weight: 500;
  text-decoration: none;
  
  &:hover {
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
    <BlogContainer>
      <BlogHeader>
        <BlogTitle>Hide Mail Blog</BlogTitle>
        <BlogDescription>
          Explore our articles about email privacy, security best practices, and how to make the most of temporary email services.
        </BlogDescription>
      </BlogHeader>
      
      <AdContainer>
        <ContentAwareAd
          slot="1234567890"
          format="horizontal"
          width={728}
          height={90}
          position="top-of-blog"
          contentSelector=".blog-header"
          minContentLength={100}
        />
      </AdContainer>
      
      <BlogPostsGrid>
        {blogPosts.map(post => (
          <BlogPostCard key={post.id}>
            <BlogPostImage style={{ backgroundImage: `url(${post.image})` }} />
            <BlogPostContent>
              <BlogPostTitle>{post.title}</BlogPostTitle>
              <BlogPostExcerpt>{post.excerpt}</BlogPostExcerpt>
              <ReadMoreLink to={`/blog/${post.id}`}>Read More →</ReadMoreLink>
            </BlogPostContent>
          </BlogPostCard>
        ))}
      </BlogPostsGrid>
      
      <AdContainer>
        <ContentAwareAd
          slot="2345678901"
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