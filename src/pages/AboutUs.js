import React from 'react';
import styled from 'styled-components';

const Container = styled.div`
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  line-height: 1.6;
`;

const Title = styled.h1`
  color: #333;
  margin-bottom: 20px;
`;

const Section = styled.section`
  margin-bottom: 30px;
`;

const SectionTitle = styled.h2`
  color: #444;
  margin-bottom: 15px;
`;

const Paragraph = styled.p`
  margin-bottom: 15px;
`;

const List = styled.ul`
  margin-left: 20px;
  margin-bottom: 15px;
`;

const ListItem = styled.li`
  margin-bottom: 8px;
`;

const AboutUs = () => {
  return (
    <Container>
      <Title>About Hide Mail</Title>
      
      <Section>
        <Paragraph>
          Hide Mail is a free temporary email service designed to help you protect your privacy online. Our mission is to provide a simple, reliable way for users to avoid spam, unwanted subscriptions, and protect their personal email addresses.
        </Paragraph>
        <Paragraph>
          Hide Mail is part of the mail-duck.com family of privacy services, dedicated to providing secure and private online communication tools.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Our Story</SectionTitle>
        <Paragraph>
          Hide Mail was founded in 2023 by a team of privacy-focused developers who were tired of having their personal inboxes flooded with spam and marketing emails. We wanted to create a solution that would allow people to interact with websites, services, and online platforms without compromising their primary email addresses.
        </Paragraph>
        <Paragraph>
          What started as a small project has grown into a service used by thousands of people daily who value their online privacy and want to keep their primary inboxes clean.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>What We Offer</SectionTitle>
        <Paragraph>
          Hide Mail provides disposable email addresses that automatically expire after a short period. Our service allows you to:
        </Paragraph>
        <List>
          <ListItem>Generate temporary email addresses instantly</ListItem>
          <ListItem>Receive emails in real-time</ListItem>
          <ListItem>View messages directly in your browser</ListItem>
          <ListItem>Choose from multiple domain options</ListItem>
          <ListItem>Protect your privacy online</ListItem>
          <ListItem>Avoid spam in your personal inbox</ListItem>
        </List>
      </Section>

      <Section>
        <SectionTitle>How It Works</SectionTitle>
        <Paragraph>
          Using Hide Mail is simple:
        </Paragraph>
        <List>
          <ListItem><strong>Step 1:</strong> Visit our website and get a randomly generated temporary email address</ListItem>
          <ListItem><strong>Step 2:</strong> Use this email address when signing up for services, downloading resources, or anywhere you need an email but don't want to use your personal one</ListItem>
          <ListItem><strong>Step 3:</strong> Receive and view emails sent to your temporary address directly on our website</ListItem>
          <ListItem><strong>Step 4:</strong> When you're done, simply close the browser or let the email address expire automatically</ListItem>
        </List>
        <Paragraph>
          All emails are automatically deleted after 24 hours, ensuring your privacy and keeping our service clean and efficient.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Our Technology</SectionTitle>
        <Paragraph>
          Hide Mail is built using modern web technologies to ensure a fast, reliable, and secure experience:
        </Paragraph>
        <List>
          <ListItem>React for a responsive and interactive user interface</ListItem>
          <ListItem>Node.js backend for efficient email processing</ListItem>
          <ListItem>Redis for high-performance data storage</ListItem>
          <ListItem>SMTP server for reliable email reception</ListItem>
          <ListItem>Docker for consistent deployment and scaling</ListItem>
        </List>
        <Paragraph>
          Our infrastructure is designed to handle millions of emails while maintaining high availability and performance.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Privacy Commitment</SectionTitle>
        <Paragraph>
          At Hide Mail, we take privacy seriously. We do not:
        </Paragraph>
        <List>
          <ListItem>Store emails longer than necessary (24 hours maximum)</ListItem>
          <ListItem>Sell or share your data with third parties</ListItem>
          <ListItem>Track your online activities</ListItem>
          <ListItem>Require any personal information to use our service</ListItem>
        </List>
        <Paragraph>
          Our service is designed with privacy as the core principle, and we're committed to maintaining that standard.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Meet the Team</SectionTitle>
        <Paragraph>
          Hide Mail is maintained by a small team of developers and privacy advocates who are passionate about internet freedom and digital rights.
        </Paragraph>
        <Paragraph>
          Our team brings together expertise in web development, email systems, security, and user experience design to create a service that's both powerful and easy to use.
        </Paragraph>
        <Paragraph>
          As part of the mail-duck.com service ecosystem, we leverage shared resources and expertise to deliver the highest quality privacy tools.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Contact Us</SectionTitle>
        <Paragraph>
          We'd love to hear from you! If you have questions, feedback, or suggestions, please reach out to us at:
        </Paragraph>
        <Paragraph>
          Email: hello@mail-duck.com
        </Paragraph>
        <Paragraph>
          For more privacy services, visit our parent site: <a href="https://mail-duck.com" target="_blank" rel="noopener noreferrer">mail-duck.com</a>
        </Paragraph>
      </Section>
    </Container>
  );
};

export default AboutUs; 