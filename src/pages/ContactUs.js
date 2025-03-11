import React, { useState } from 'react';
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

const Paragraph = styled.p`
  margin-bottom: 15px;
`;

const ContactInfo = styled.div`
  margin-bottom: 30px;
`;

const InfoItem = styled.div`
  margin-bottom: 15px;
  display: flex;
  align-items: center;
`;

const Label = styled.span`
  font-weight: bold;
  margin-right: 10px;
  min-width: 80px;
`;

const FormGroup = styled.div`
  margin-bottom: 20px;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 16px;
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 16px;
  min-height: 150px;
`;

const Button = styled.button`
  background-color: #4285f4;
  color: white;
  border: none;
  padding: 12px 20px;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.3s;

  &:hover {
    background-color: #3367d6;
  }

  &:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }
`;

const SuccessMessage = styled.div`
  background-color: #d4edda;
  color: #155724;
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 20px;
`;

const ErrorMessage = styled.div`
  background-color: #f8d7da;
  color: #721c24;
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 20px;
`;

const ContactUs = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  
  const [formStatus, setFormStatus] = useState({
    submitted: false,
    success: false,
    error: null
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate form
    if (!formData.name || !formData.email || !formData.message) {
      setFormStatus({
        submitted: true,
        success: false,
        error: 'Please fill out all required fields.'
      });
      return;
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setFormStatus({
        submitted: true,
        success: false,
        error: 'Please enter a valid email address.'
      });
      return;
    }
    
    // In a real application, you would send the form data to your backend
    // For now, we'll simulate a successful submission
    
    // Simulate API call
    setTimeout(() => {
      setFormStatus({
        submitted: true,
        success: true,
        error: null
      });
      
      // Reset form after successful submission
      setFormData({
        name: '',
        email: '',
        subject: '',
        message: ''
      });
    }, 1000);
  };

  return (
    <Container>
      <Title>Contact Us</Title>
      
      <Section>
        <Paragraph>
          We'd love to hear from you! Whether you have a question about our service, need help with an issue, or just want to say hello, please don't hesitate to reach out to us.
        </Paragraph>
        <Paragraph>
          Hide Mail is part of the mail-duck.com family of privacy services. For inquiries about our other services, please visit <a href="https://mail-duck.com" target="_blank" rel="noopener noreferrer">mail-duck.com</a>.
        </Paragraph>
      </Section>

      <ContactInfo>
        <InfoItem>
          <Label>Email:</Label>
          <span>contact@mail-duck.com</span>
        </InfoItem>
        <InfoItem>
          <Label>GitHub:</Label>
          <span>github.com/mail-duck</span>
        </InfoItem>
        <InfoItem>
          <Label>Parent:</Label>
          <span><a href="https://mail-duck.com" target="_blank" rel="noopener noreferrer">mail-duck.com</a></span>
        </InfoItem>
      </ContactInfo>

      <Section>
        <h2>Send Us a Message</h2>
        
        {formStatus.submitted && formStatus.success && (
          <SuccessMessage>
            Thank you for your message! We'll get back to you as soon as possible.
          </SuccessMessage>
        )}
        
        {formStatus.submitted && !formStatus.success && (
          <ErrorMessage>
            {formStatus.error}
          </ErrorMessage>
        )}
        
        <form onSubmit={handleSubmit}>
          <FormGroup>
            <label htmlFor="name">Name *</label>
            <Input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </FormGroup>
          
          <FormGroup>
            <label htmlFor="email">Email *</label>
            <Input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </FormGroup>
          
          <FormGroup>
            <label htmlFor="subject">Subject</label>
            <Input
              type="text"
              id="subject"
              name="subject"
              value={formData.subject}
              onChange={handleChange}
            />
          </FormGroup>
          
          <FormGroup>
            <label htmlFor="message">Message *</label>
            <TextArea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleChange}
              required
            />
          </FormGroup>
          
          <Button type="submit" disabled={formStatus.submitted && formStatus.success}>
            Send Message
          </Button>
        </form>
      </Section>

      <Section>
        <h2>Frequently Asked Questions</h2>
        
        <div>
          <h3>How long do temporary emails last?</h3>
          <Paragraph>
            Our temporary email addresses automatically expire after 24 hours. After this period, any emails sent to that address will not be received.
          </Paragraph>
          
          <h3>Is this service completely free?</h3>
          <Paragraph>
            Yes, Hide Mail is 100% free to use. We support our service through non-intrusive advertisements.
          </Paragraph>
          
          <h3>Can I send emails from my temporary address?</h3>
          <Paragraph>
            No, Hide Mail is a receive-only service. You cannot send emails from the temporary addresses.
          </Paragraph>
          
          <h3>Are my emails private?</h3>
          <Paragraph>
            We take privacy seriously. Emails are automatically deleted after 24 hours, and we do not read or analyze the content of your messages.
          </Paragraph>
          
          <h3>Is Hide Mail related to other services?</h3>
          <Paragraph>
            Yes, Hide Mail is part of the mail-duck.com family of privacy services. We share the same commitment to privacy and security across all our products.
          </Paragraph>
          
          <h3>Can I report abuse?</h3>
          <Paragraph>
            Yes, if you believe our service is being used for abusive purposes, please contact us immediately at abuse@mail-duck.com.
          </Paragraph>
        </div>
      </Section>
    </Container>
  );
};

export default ContactUs; 