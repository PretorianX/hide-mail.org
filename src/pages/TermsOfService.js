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

const TermsOfService = () => {
  return (
    <Container>
      <Title>Terms of Service</Title>
      
      <Section>
        <Paragraph>Last updated: {new Date().toLocaleDateString()}</Paragraph>
        <Paragraph>
          Please read these Terms of Service ("Terms", "Terms of Service") carefully before using the Hide Mail website (the "Service") operated by Hide Mail ("us", "we", or "our"), a service provided by mail-duck.com.
        </Paragraph>
        <Paragraph>
          Your access to and use of the Service is conditioned on your acceptance of and compliance with these Terms. These Terms apply to all visitors, users, and others who access or use the Service.
        </Paragraph>
        <Paragraph>
          By accessing or using the Service, you agree to be bound by these Terms. If you disagree with any part of the terms, then you may not access the Service.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Use of Service</SectionTitle>
        <Paragraph>
          Hide Mail provides a temporary email service that allows users to create disposable email addresses for receiving emails. The Service is provided "as is" and "as available" without any warranties of any kind.
        </Paragraph>
        <Paragraph>
          You are responsible for your use of the Service and any content you provide, including compliance with applicable laws, rules, and regulations. You should only provide content that you are comfortable sharing with others.
        </Paragraph>
        <Paragraph>
          You may not use the Service for any illegal or unauthorized purpose. You must not, in the use of the Service, violate any laws in your jurisdiction (including but not limited to copyright or trademark laws).
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Prohibited Uses</SectionTitle>
        <Paragraph>
          You agree not to use the Service:
        </Paragraph>
        <List>
          <ListItem>For any unlawful purpose or to solicit others to perform or participate in any unlawful acts</ListItem>
          <ListItem>To violate any international, federal, provincial or state regulations, rules, laws, or local ordinances</ListItem>
          <ListItem>To infringe upon or violate our intellectual property rights or the intellectual property rights of others</ListItem>
          <ListItem>To harass, abuse, insult, harm, defame, slander, disparage, intimidate, or discriminate</ListItem>
          <ListItem>To submit false or misleading information</ListItem>
          <ListItem>To upload or transmit viruses or any other type of malicious code</ListItem>
          <ListItem>To collect or track the personal information of others</ListItem>
          <ListItem>To spam, phish, pharm, pretext, spider, crawl, or scrape</ListItem>
          <ListItem>For any obscene or immoral purpose</ListItem>
          <ListItem>To interfere with or circumvent the security features of the Service</ListItem>
        </List>
      </Section>

      <Section>
        <SectionTitle>Paid Plans, Renewals and Refunds</SectionTitle>
        <Paragraph>
          Hide Mail is free to use with advertising. Hide Mail Pro and the Hide Mail API are optional paid plans. Prices are shown on the Pro page and are charged in Ukrainian hryvnia (UAH); amounts shown in other currencies are approximate and the UAH amount is what you are charged.
        </Paragraph>
        <Paragraph>
          <strong>Payment provider.</strong> Payments are processed by WayForPay. We do not receive or store your card details.
        </Paragraph>
        <Paragraph>
          <strong>Automatic renewal.</strong> Paid plans are subscriptions. The monthly plan renews every month and the yearly plan renews every year, at the price in force at the time of renewal, until you cancel. The API plan is billed monthly.
        </Paragraph>
        <Paragraph>
          <strong>How to cancel.</strong> Write to us at the address below with your order reference or license key and we will stop future charges. Cancelling stops renewals; your plan stays active until the end of the period you already paid for.
        </Paragraph>
        <Paragraph>
          <strong>Refunds.</strong> If the Service does not work as described, contact us within 14 days of the charge and we will refund that payment. Refunds are returned to the card used for the payment. We do not refund periods you have already used, and we do not refund a payment where the plan was used to send abuse, spam or other prohibited content.
        </Paragraph>
        <Paragraph>
          <strong>Your license key.</strong> A paid plan has no account or password: the license key we issue is the only credential. You are responsible for keeping it safe. Anyone who has your key can use your plan, and because we never ask for your email address we cannot resend the key to you automatically. Rate limits apply to key checks to protect against guessing.
        </Paragraph>
        <Paragraph>
          <strong>What a paid plan does not change.</strong> Mailboxes remain temporary and are still deleted when they expire, and the Service remains "as is". A paid plan is not a guarantee that any particular sender, domain or third-party site will accept a Hide Mail address.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Intellectual Property</SectionTitle>
        <Paragraph>
          The Service and its original content (excluding content provided by users), features, and functionality are and will remain the exclusive property of Hide Mail and its licensors. The Service is protected by copyright, trademark, and other laws of both the United States and foreign countries. Our trademarks and trade dress may not be used in connection with any product or service without the prior written consent of Hide Mail.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Termination</SectionTitle>
        <Paragraph>
          We may terminate or suspend access to our Service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
        </Paragraph>
        <Paragraph>
          All provisions of the Terms which by their nature should survive termination shall survive termination, including, without limitation, ownership provisions, warranty disclaimers, indemnity, and limitations of liability.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Limitation of Liability</SectionTitle>
        <Paragraph>
          In no event shall Hide Mail, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from:
        </Paragraph>
        <List>
          <ListItem>Your access to or use of or inability to access or use the Service</ListItem>
          <ListItem>Any conduct or content of any third party on the Service</ListItem>
          <ListItem>Any content obtained from the Service</ListItem>
          <ListItem>Unauthorized access, use, or alteration of your transmissions or content</ListItem>
        </List>
        <Paragraph>
          Whether based on warranty, contract, tort (including negligence), or any other legal theory, whether or not we have been informed of the possibility of such damage, and even if a remedy set forth herein is found to have failed of its essential purpose.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Disclaimer</SectionTitle>
        <Paragraph>
          Your use of the Service is at your sole risk. The Service is provided on an "AS IS" and "AS AVAILABLE" basis. The Service is provided without warranties of any kind, whether express or implied, including, but not limited to, implied warranties of merchantability, fitness for a particular purpose, non-infringement, or course of performance.
        </Paragraph>
        <Paragraph>
          Hide Mail, its subsidiaries, affiliates, and its licensors do not warrant that:
        </Paragraph>
        <List>
          <ListItem>The Service will function uninterrupted, secure, or available at any particular time or location</ListItem>
          <ListItem>Any errors or defects will be corrected</ListItem>
          <ListItem>The Service is free of viruses or other harmful components</ListItem>
          <ListItem>The results of using the Service will meet your requirements</ListItem>
        </List>
      </Section>

      <Section>
        <SectionTitle>Governing Law</SectionTitle>
        <Paragraph>
          These Terms shall be governed and construed in accordance with the laws of the United States, without regard to its conflict of law provisions.
        </Paragraph>
        <Paragraph>
          Our failure to enforce any right or provision of these Terms will not be considered a waiver of those rights. If any provision of these Terms is held to be invalid or unenforceable by a court, the remaining provisions of these Terms will remain in effect.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Changes to Terms</SectionTitle>
        <Paragraph>
          We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will try to provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.
        </Paragraph>
        <Paragraph>
          By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised terms. If you do not agree to the new terms, please stop using the Service.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Relationship with mail-duck.com</SectionTitle>
        <Paragraph>
          Hide Mail is part of the mail-duck.com family of services. By using Hide Mail, you acknowledge that the service is operated by mail-duck.com and is subject to the overarching policies and terms of mail-duck.com where applicable.
        </Paragraph>
        <Paragraph>
          While these Terms of Service are specific to Hide Mail, certain aspects of our service may be governed by mail-duck.com's general policies, particularly regarding technical infrastructure, security practices, and legal compliance.
        </Paragraph>
      </Section>

      <Section>
        <SectionTitle>Contact Us</SectionTitle>
        <Paragraph>
          If you have any questions about these Terms, please contact us at:
        </Paragraph>
        <Paragraph>
          Email: terms@mail-duck.com
        </Paragraph>
        <Paragraph>
          For more information about our parent company and other services, please visit <a href="https://mail-duck.com" target="_blank" rel="noopener noreferrer">mail-duck.com</a>
        </Paragraph>
      </Section>
    </Container>
  );
};

export default TermsOfService; 