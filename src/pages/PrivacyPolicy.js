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

const PrivacyPolicy = () => {
  return (
    <Container>
      <Title>Privacy Policy</Title>
      
      <Section>
        <Paragraph>Last updated: {new Date().toLocaleDateString()}</Paragraph>
        <Paragraph>
          Hide Mail ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how your personal information is collected, used, and disclosed by Hide Mail, a service provided by mail-duck.com.
        </Paragraph>
        <Paragraph>
          This Privacy Policy applies to our website, and its associated subdomains (collectively, our "Service"). By accessing or using our Service, you signify that you have read, understood, and agree to our collection, storage, use, and disclosure of your personal information as described in this Privacy Policy.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Information We Collect</SectionTitle>
        <Paragraph>
          Our primary goal in collecting information is to provide and improve our Service and to enable users to enjoy and easily navigate the Service.
        </Paragraph>
        <Paragraph>
          <strong>Information you provide to us:</strong> We collect information that you provide directly to us when you use our Service. This includes:
        </Paragraph>
        <List>
          <ListItem>Temporary email addresses generated through our service</ListItem>
          <ListItem>Email content received by the temporary email addresses</ListItem>
          <ListItem>Information you provide when you contact us for support</ListItem>
        </List>
        <Paragraph>
          <strong>Information we collect automatically:</strong> When you use our Service, we automatically collect certain information about your device and usage of the Service, including:
        </Paragraph>
        <List>
          <ListItem>Log information (such as IP address, browser type, pages viewed)</ListItem>
          <ListItem>Device information (such as device type, operating system)</ListItem>
          <ListItem>Usage information (such as how you use and interact with our Service)</ListItem>
        </List>
      </Section>

      <Section>
        <SectionTitle>How We Use Your Information</SectionTitle>
        <Paragraph>
          We use the information we collect to:
        </Paragraph>
        <List>
          <ListItem>Provide, maintain, and improve our Service</ListItem>
          <ListItem>Process and deliver temporary email services</ListItem>
          <ListItem>Respond to your comments, questions, and requests</ListItem>
          <ListItem>Monitor and analyze trends, usage, and activities in connection with our Service</ListItem>
          <ListItem>Detect, investigate, and prevent fraudulent transactions and other illegal activities</ListItem>
          <ListItem>Comply with legal obligations</ListItem>
        </List>
      </Section>

      <Section>
        <SectionTitle>Cookies and Similar Technologies</SectionTitle>
        <Paragraph>
          We use cookies and similar technologies to collect information about your browsing activities and to distinguish you from other users of our Service. This helps us to provide you with a good experience when you browse our Service and also allows us to improve our Service.
        </Paragraph>
        <Paragraph>
          We use both session cookies and persistent cookies. A session cookie is used to identify a particular visit to our Service and expires after you close your browser. A persistent cookie remains after you close your browser and may be used by your browser on subsequent visits to our Service.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Advertising</SectionTitle>
        <Paragraph>
          We use Google AdSense to display advertisements on our Service. Google AdSense uses cookies to serve ads based on a user's prior visits to our website or other websites. Google's use of advertising cookies enables it and its partners to serve ads to our users based on their visit to our Service and/or other websites on the Internet.
        </Paragraph>
        <Paragraph>
          <strong>AdSense Cookies:</strong> Google AdSense uses cookies for various purposes, including:
        </Paragraph>
        <List>
          <ListItem><strong>Preference cookies:</strong> These cookies remember your preferences to personalize your ad experience.</ListItem>
          <ListItem><strong>Security cookies:</strong> These cookies enable security features and help detect malicious activity.</ListItem>
          <ListItem><strong>Process cookies:</strong> These cookies help make the ad service work properly.</ListItem>
          <ListItem><strong>Advertising cookies:</strong> These cookies are used to make advertising messages more relevant to you and your interests. They also help measure the effectiveness of advertising campaigns.</ListItem>
          <ListItem><strong>Session State cookies:</strong> These cookies store information about how you interact with ads.</ListItem>
        </List>
        <Paragraph>
          <strong>Ad Personalization:</strong> Google AdSense may collect information such as:
        </Paragraph>
        <List>
          <ListItem>Websites you visit and mobile apps you use</ListItem>
          <ListItem>Your IP address and device identifiers</ListItem>
          <ListItem>Geographic location information</ListItem>
          <ListItem>Demographic and interest data</ListItem>
        </List>
        <Paragraph>
          <strong>Your Ad Choices:</strong> You have several options to control your ad experience:
        </Paragraph>
        <List>
          <ListItem>You may opt out of personalized advertising by visiting <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">Google's Ads Settings</a>.</ListItem>
          <ListItem>You can also use the <a href="https://optout.aboutads.info/" target="_blank" rel="noopener noreferrer">Digital Advertising Alliance's WebChoices tool</a> to opt out of interest-based advertising from participating companies.</ListItem>
          <ListItem>For mobile apps, you can use your device settings to limit ad tracking (instructions vary by device and operating system).</ListItem>
          <ListItem>You can manage or block cookies through your browser settings. Please note that blocking all cookies may impact your experience on our Service.</ListItem>
        </List>
        <Paragraph>
          For more information about how Google uses cookies in advertising, please visit the <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer">Google Advertising Technologies page</a>.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Data Retention</SectionTitle>
        <Paragraph>
          Temporary email addresses and their contents are automatically deleted after a short period (typically 24 hours). We do not permanently store email messages or their contents.
        </Paragraph>
        <Paragraph>
          We retain other information for as long as necessary to provide our Service and fulfill the purposes described in this Privacy Policy, unless a longer retention period is required or permitted by law.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Security</SectionTitle>
        <Paragraph>
          We take reasonable measures to help protect information about you from loss, theft, misuse, unauthorized access, disclosure, alteration, and destruction. However, no Internet or email transmission is ever fully secure or error-free.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Children's Privacy</SectionTitle>
        <Paragraph>
          Our Service is not directed to children under the age of 13, and we do not knowingly collect personal information from children under the age of 13. If we learn that we have collected personal information from a child under the age of 13, we will promptly delete that information.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Changes to This Privacy Policy</SectionTitle>
        <Paragraph>
          We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page. You are advised to review this Privacy Policy periodically for any changes.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Data Sharing with mail-duck.com Services</SectionTitle>
        <Paragraph>
          Hide Mail is part of the mail-duck.com family of services. While we maintain separate databases for each service, we may share certain anonymized usage statistics and technical information within our family of services to improve our offerings and maintain service quality.
        </Paragraph>
        <Paragraph>
          We do not share your personal information or email contents between services without your explicit consent. Each service maintains its own data retention policies as outlined in this document.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Contact Us</SectionTitle>
        <Paragraph>
          If you have any questions about this Privacy Policy, please contact us at:
        </Paragraph>
        <Paragraph>
          Email: privacy@mail-duck.com
        </Paragraph>
        <Paragraph>
          For more information about our parent company and other services, please visit <a href="https://mail-duck.com" target="_blank" rel="noopener noreferrer">mail-duck.com</a>
        </Paragraph>
      </Section>
    </Container>
  );
};

export default PrivacyPolicy; 