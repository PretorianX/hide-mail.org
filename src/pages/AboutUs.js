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
    <Container className="Container">
      <Title className="Title">About Hide Mail</Title>
      
      <Section className="Section">
        <Paragraph className="Paragraph">
          Hide Mail is a free temporary email service designed to help you protect your privacy online. Our mission is to provide a simple, reliable way for users to avoid spam, unwanted subscriptions, and protect their personal email addresses.
        </Paragraph>
        <Paragraph className="Paragraph">
          Hide Mail is part of the mail-duck.com family of privacy services, dedicated to providing secure and private online communication tools.
        </Paragraph>
      </Section>

      <Section className="Section">
        <SectionTitle className="SectionTitle">Our Story</SectionTitle>
        <Paragraph className="Paragraph">
          Hide Mail was founded in 2023 by a team of privacy-focused developers who were tired of having their personal inboxes flooded with spam and marketing emails. We wanted to create a solution that would allow people to interact with websites, services, and online platforms without compromising their primary email addresses.
        </Paragraph>
        <Paragraph className="Paragraph">
          What started as a small project has grown into a service used by thousands of people daily who value their online privacy and want to keep their primary inboxes clean.
        </Paragraph>
      </Section>

      <Section className="Section">
        <SectionTitle className="SectionTitle">What We Offer</SectionTitle>
        <Paragraph className="Paragraph">
          Hide Mail provides disposable email addresses that automatically expire after a short period. Our service allows you to:
        </Paragraph>
        <List className="List">
          <ListItem className="ListItem">Generate temporary email addresses instantly</ListItem>
          <ListItem className="ListItem">Receive emails in real-time</ListItem>
          <ListItem className="ListItem">View messages directly in your browser</ListItem>
          <ListItem className="ListItem">Choose from multiple domain options</ListItem>
          <ListItem className="ListItem">Protect your privacy online</ListItem>
          <ListItem className="ListItem">Avoid spam in your personal inbox</ListItem>
        </List>
      </Section>

      <Section className="Section">
        <SectionTitle className="SectionTitle">How It Works</SectionTitle>
        <Paragraph className="Paragraph">
          Using Hide Mail is simple:
        </Paragraph>
        <List className="List">
          <ListItem className="ListItem"><strong>Step 1:</strong> Visit our website and get a randomly generated temporary email address</ListItem>
          <ListItem className="ListItem"><strong>Step 2:</strong> Use this email address when signing up for services, downloading resources, or anywhere you need an email but don't want to use your personal one</ListItem>
          <ListItem className="ListItem"><strong>Step 3:</strong> Receive and view emails sent to your temporary address directly on our website</ListItem>
          <ListItem className="ListItem"><strong>Step 4:</strong> When you're done, simply close the browser or let the email address expire automatically</ListItem>
        </List>
        <Paragraph className="Paragraph">
          All emails are automatically deleted after 24 hours, ensuring your privacy and keeping our service clean and efficient.
        </Paragraph>
      </Section>

      <Section className="Section">
        <SectionTitle className="SectionTitle">Our Technology</SectionTitle>
        <Paragraph className="Paragraph">
          Hide Mail is built using modern web technologies to ensure a fast, reliable, and secure experience:
        </Paragraph>
        <List className="List">
          <ListItem className="ListItem">React for a responsive and interactive user interface</ListItem>
          <ListItem className="ListItem">Node.js backend for efficient email processing</ListItem>
          <ListItem className="ListItem">Redis for high-performance data storage</ListItem>
          <ListItem className="ListItem">SMTP server for reliable email reception</ListItem>
          <ListItem className="ListItem">Docker for consistent deployment and scaling</ListItem>
        </List>
        <Paragraph className="Paragraph">
          Our infrastructure is designed to handle millions of emails while maintaining high availability and performance.
        </Paragraph>
      </Section>

      <Section className="Section">
        <SectionTitle className="SectionTitle">Privacy Commitment</SectionTitle>
        <Paragraph className="Paragraph">
          At Hide Mail, we take privacy seriously. We do not:
        </Paragraph>
        <List className="List">
          <ListItem className="ListItem">Store emails longer than necessary (24 hours maximum)</ListItem>
          <ListItem className="ListItem">Sell or share your data with third parties</ListItem>
          <ListItem className="ListItem">Track your online activities</ListItem>
          <ListItem className="ListItem">Require any personal information to use our service</ListItem>
        </List>
        <Paragraph className="Paragraph">
          Our service is designed with privacy as the core principle, and we're committed to maintaining that standard.
        </Paragraph>
      </Section>

      <Section className="Section">
        <SectionTitle className="SectionTitle">Meet the Team</SectionTitle>
        <Paragraph className="Paragraph">
          Hide Mail is maintained by a small team of developers and privacy advocates who are passionate about internet freedom and digital rights.
        </Paragraph>
        <Paragraph className="Paragraph">
          Our team brings together expertise in web development, email systems, security, and user experience design to create a service that's both powerful and easy to use.
        </Paragraph>
        <Paragraph className="Paragraph">
          As part of the mail-duck.com service ecosystem, we leverage shared resources and expertise to deliver the highest quality privacy tools.
        </Paragraph>
      </Section>

      <Section className="Section">
        <SectionTitle className="SectionTitle">Contact Us</SectionTitle>
        <Paragraph className="Paragraph">
          We'd love to hear from you! If you have questions, feedback, or suggestions, please reach out to us at:
        </Paragraph>
        <Paragraph className="Paragraph">
          Email: hello@mail-duck.com
        </Paragraph>
        <Paragraph className="Paragraph">
          For more privacy services, visit our parent site: <a href="https://mail-duck.com" target="_blank" rel="noopener noreferrer">mail-duck.com</a>
        </Paragraph>
      </Section>
    </Container>
  );
};

export default AboutUs; 