import React, { useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import ContentAwareAd from '../components/ContentAwareAd';
import blogPosts from '../data/blogPosts';
import { getAdSenseSlot, AD_SLOTS } from '../utils/adsenseSlots';

const BlogPostContainer = styled.div`
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px;
`;

const BackToBlogs = styled(Link)`
  display: inline-flex;
  align-items: center;
  color: #4285f4;
  text-decoration: none;
  margin-bottom: 30px;
  font-weight: 500;
  
  &:hover {
    text-decoration: underline;
  }
  
  svg {
    margin-right: 8px;
  }
`;

const BlogPostHeader = styled.div`
  margin-bottom: 30px;
`;

const BlogPostTitle = styled.h1`
  font-size: 2.5rem;
  color: #333;
  margin-bottom: 15px;
`;

const BlogPostMeta = styled.div`
  display: flex;
  align-items: center;
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 20px;
`;

const BlogPostDate = styled.span`
  margin-right: 15px;
`;

const BlogPostImage = styled.img`
  width: 100%;
  height: auto;
  border-radius: 8px;
  margin-bottom: 30px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
`;

const BlogPostContent = styled.div`
  line-height: 1.8;
  color: #444;
  font-size: 1.1rem;
  
  h2 {
    font-size: 1.8rem;
    margin: 35px 0 15px;
    color: #333;
  }
  
  h3 {
    font-size: 1.4rem;
    margin: 30px 0 15px;
    color: #333;
  }
  
  p {
    margin-bottom: 20px;
  }
  
  ul, ol {
    margin-bottom: 20px;
    padding-left: 25px;
    
    li {
      margin-bottom: 10px;
    }
  }
  
  blockquote {
    border-left: 4px solid #4285f4;
    padding-left: 20px;
    margin: 30px 0;
    font-style: italic;
    color: #555;
  }
  
  img {
    max-width: 100%;
    border-radius: 6px;
    margin: 20px 0;
  }
`;

const AdContainer = styled.div`
  margin: 40px 0;
  text-align: center;
`;

const RelatedPostsSection = styled.div`
  margin-top: 60px;
  border-top: 1px solid #eee;
  padding-top: 40px;
`;

const RelatedPostsTitle = styled.h3`
  font-size: 1.5rem;
  margin-bottom: 20px;
  color: #333;
`;

const RelatedPostsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
`;

const RelatedPostCard = styled(Link)`
  display: block;
  text-decoration: none;
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

const RelatedPostImage = styled.div`
  height: 150px;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
`;

const RelatedPostContent = styled.div`
  padding: 15px;
`;

const RelatedPostTitle = styled.h4`
  font-size: 1.1rem;
  margin-bottom: 5px;
  color: #333;
`;

const NotFoundMessage = styled.div`
  text-align: center;
  padding: 60px 20px;
  
  h2 {
    font-size: 2rem;
    color: #333;
    margin-bottom: 15px;
  }
  
  p {
    font-size: 1.1rem;
    color: #666;
    margin-bottom: 25px;
  }
  
  a {
    display: inline-block;
    background: #4285f4;
    color: white;
    padding: 10px 20px;
    border-radius: 4px;
    text-decoration: none;
    font-weight: 500;
    
    &:hover {
      background: #3367d6;
    }
  }
`;

const BlogPost = () => {
  const { postId } = useParams();
  const navigate = useNavigate();
  const post = blogPosts.find(p => p.id === postId);
  
  useEffect(() => {
    // Scroll to top when post changes
    // Only run in browser environment, not in tests
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function' && process.env.NODE_ENV !== 'test') {
      window.scrollTo(0, 0);
    }
  }, [postId]);
  
  if (!post) {
    return (
      <NotFoundMessage>
        <h2>Blog Post Not Found</h2>
        <p>Sorry, the blog post you're looking for doesn't exist or has been moved.</p>
        <Link to="/blog">Return to Blog</Link>
      </NotFoundMessage>
    );
  }
  
  // Get related posts (excluding current post)
  const relatedPosts = blogPosts
    .filter(p => p.id !== postId)
    .slice(0, 3);
  
  return (
    <BlogPostContainer className="BlogPostContainer">
      <BackToBlogs to="/blog" className="BackToBlogs">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back to Blog
      </BackToBlogs>
      
      <BlogPostHeader className="blog-post-header">
        <BlogPostTitle className="BlogPostTitle">{post.title}</BlogPostTitle>
        <BlogPostMeta className="BlogPostMeta">
          <BlogPostDate>{post.date}</BlogPostDate>
        </BlogPostMeta>
      </BlogPostHeader>
      
      <BlogPostImage src={post.image} alt={post.title} className="BlogPostImage" />
      
      <AdContainer>
        <ContentAwareAd
          slot={getAdSenseSlot(AD_SLOTS.BLOG_POST_TOP)}
          format="horizontal"
          width={728}
          height={90}
          position="top-of-post"
          contentSelector=".blog-post-header"
          minContentLength={100}
        />
      </AdContainer>
      
      <BlogPostContent className="BlogPostContent" dangerouslySetInnerHTML={{ __html: post.content }} />
      
      <AdContainer>
        <ContentAwareAd
          slot={getAdSenseSlot(AD_SLOTS.BLOG_POST_MIDDLE)}
          format="horizontal"
          width={728}
          height={90}
          position="middle-of-post"
          contentSelector=".blog-post-content"
          minContentLength={300}
        />
      </AdContainer>
      
      {relatedPosts.length > 0 && (
        <RelatedPostsSection className="RelatedPostsSection">
          <RelatedPostsTitle className="RelatedPostsTitle">Related Articles</RelatedPostsTitle>
          <RelatedPostsGrid className="RelatedPostsGrid">
            {relatedPosts.map(relatedPost => (
              <RelatedPostCard key={relatedPost.id} to={`/blog/${relatedPost.id}`} className="RelatedPostCard">
                <RelatedPostImage style={{ backgroundImage: `url(${relatedPost.image})` }} />
                <RelatedPostContent>
                  <RelatedPostTitle className="RelatedPostTitle">{relatedPost.title}</RelatedPostTitle>
                </RelatedPostContent>
              </RelatedPostCard>
            ))}
          </RelatedPostsGrid>
        </RelatedPostsSection>
      )}
      
      <AdContainer>
        <ContentAwareAd
          slot={getAdSenseSlot(AD_SLOTS.BLOG_POST_BOTTOM)}
          format="horizontal"
          width={728}
          height={90}
          position="bottom-of-post"
          contentSelector=".related-posts-section"
          minContentLength={100}
        />
      </AdContainer>
    </BlogPostContainer>
  );
};

export default BlogPost; 