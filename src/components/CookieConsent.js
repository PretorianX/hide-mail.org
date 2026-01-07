import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { analytics } from '../services/analytics';

const CookieConsentContainer = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: var(--duck-yellow);
  color: var(--duck-black);
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 9999;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.2);
  border-top: 4px solid var(--duck-orange);
  
  @media (max-width: 768px) {
    flex-direction: column;
    gap: 15px;
  }
`;

const DuckIcon = styled.div`
  font-size: 28px;
  margin-right: 15px;
  animation: duck-float 3s infinite ease-in-out;
  
  @keyframes duck-float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }
`;

const CookieText = styled.div`
  flex: 1;
  padding-right: 20px;
  font-size: 16px;
  line-height: 1.5;
  font-weight: 500;
`;

const CookieButtons = styled.div`
  display: flex;
  gap: 10px;
  
  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;

const Button = styled.button`
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s ease;
  
  &:hover {
    transform: translateY(-2px);
  }
`;

const AcceptButton = styled(Button)`
  background-color: var(--duck-orange);
  color: white;
  
  &:hover {
    background-color: var(--duck-orange-light);
  }
`;

const CustomizeButton = styled(Button)`
  background-color: transparent;
  color: var(--duck-black);
  border: 2px solid var(--duck-orange);
  
  &:hover {
    background-color: rgba(247, 148, 29, 0.1);
  }
`;

const RejectButton = styled(Button)`
  background-color: var(--duck-gray);
  color: var(--duck-black);
  border: 2px solid var(--duck-black);
  
  &:hover {
    background-color: #e0e0e0;
  }
`;

const PrivacyLink = styled.a`
  color: var(--duck-orange);
  text-decoration: underline;
  cursor: pointer;
  font-weight: 600;
  
  &:hover {
    color: var(--duck-orange-light);
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
`;

const Modal = styled.div`
  background-color: var(--duck-white);
  border-radius: 12px;
  padding: 25px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  color: var(--duck-black);
  border: 4px solid var(--duck-yellow);
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  border-bottom: 2px solid var(--duck-yellow);
  padding-bottom: 15px;
`;

const ModalTitle = styled.h2`
  margin: 0;
  font-size: 1.6rem;
  color: var(--duck-orange);
  display: flex;
  align-items: center;
  
  &::before {
    content: "🦆";
    margin-right: 10px;
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--duck-black);
  
  &:hover {
    color: var(--duck-orange);
  }
`;

const CookieCategory = styled.div`
  margin-bottom: 25px;
  background-color: var(--duck-gray);
  padding: 15px;
  border-radius: 8px;
  border-left: 4px solid var(--duck-orange);
`;

const CategoryHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
`;

const CategoryTitle = styled.h3`
  margin: 0;
  font-size: 1.2rem;
  color: var(--duck-black);
`;

const CategoryDescription = styled.p`
  margin: 0 0 10px 0;
  font-size: 14px;
  line-height: 1.5;
`;

const ToggleSwitch = styled.label`
  position: relative;
  display: inline-block;
  width: 50px;
  height: 24px;
  
  input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  
  span {
    position: absolute;
    cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: ${props => props.disabled ? '#ccc' : props.checked ? 'var(--duck-orange)' : '#ccc'};
    transition: .4s;
    border-radius: 24px;
    
    &:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 4px;
      bottom: 4px;
      background-color: white;
      transition: .4s;
      border-radius: 50%;
      transform: ${props => props.checked ? 'translateX(26px)' : 'translateX(0)'};
    }
  }
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
  border-top: 2px solid var(--duck-yellow);
  padding-top: 20px;
`;

const SaveButton = styled(Button)`
  background-color: var(--duck-orange);
  color: white;
  
  &:hover {
    background-color: var(--duck-orange-light);
  }
`;

const CancelButton = styled(Button)`
  background-color: var(--duck-gray);
  color: var(--duck-black);
  border: 2px solid var(--duck-black);
  
  &:hover {
    background-color: #e0e0e0;
  }
`;

const DuckMessage = styled.div`
  font-style: italic;
  margin-top: 10px;
  font-size: 14px;
  color: var(--duck-orange);
  text-align: center;
`;

const CookieConsent = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [cookiePreferences, setCookiePreferences] = useState({
    necessary: true, // Always required
    analytics: false,
    advertising: false,
    functional: false
  });

  useEffect(() => {
    // Check if user has already made cookie choices
    const consentGiven = localStorage.getItem('cookieConsentGiven');
    
    if (!consentGiven) {
      // If no consent has been given, show the banner
      setShowBanner(true);
    } else {
      // Load saved preferences
      try {
        const savedPreferences = JSON.parse(localStorage.getItem('cookiePreferences'));
        if (savedPreferences) {
          setCookiePreferences(savedPreferences);
        }
      } catch (error) {
        console.error('Error parsing saved cookie preferences:', error);
      }
    }
  }, []);

  const handleAcceptAll = () => {
    const allAccepted = {
      necessary: true,
      analytics: true,
      advertising: true,
      functional: true
    };
    
    // Save preferences to localStorage
    localStorage.setItem('cookieConsentGiven', 'true');
    localStorage.setItem('cookiePreferences', JSON.stringify(allAccepted));
    
    // Update state
    setCookiePreferences(allAccepted);
    setShowBanner(false);
    analytics.cookieConsent(true);
  };

  const handleRejectAll = () => {
    const onlyNecessary = {
      necessary: true,
      analytics: false,
      advertising: false,
      functional: false
    };
    
    // Save preferences to localStorage
    localStorage.setItem('cookieConsentGiven', 'true');
    localStorage.setItem('cookiePreferences', JSON.stringify(onlyNecessary));
    
    // Update state
    setCookiePreferences(onlyNecessary);
    setShowBanner(false);
    analytics.cookieConsent(false);
  };

  const handleCustomize = () => {
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleToggleChange = (category) => {
    if (category === 'necessary') return; // Cannot toggle necessary cookies
    
    setCookiePreferences(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const handleSavePreferences = () => {
    // Save preferences to localStorage
    localStorage.setItem('cookieConsentGiven', 'true');
    localStorage.setItem('cookiePreferences', JSON.stringify(cookiePreferences));
    
    // Close modal and banner
    setShowModal(false);
    setShowBanner(false);
  };

  // Duck-themed funny messages
  const getDuckMessage = () => {
    const messages = [
      "Quack! These cookies won't make you swim faster, but they'll help our website float better!",
      "Duck-tective work requires cookies! Help us solve the mystery of your preferences.",
      "Our ducks need cookies to keep paddling. Don't leave them hungry!",
      "Waddle you do? Accept our cookies and keep our ducks afloat!",
      "These aren't bread crumbs, they're digital cookies! Our ducks love them both."
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  };

  if (!showBanner && !showModal) {
    return null;
  }

  return (
    <>
      {showBanner && (
        <CookieConsentContainer>
          <DuckIcon>🦆</DuckIcon>
          <CookieText>
            <strong>Quack! Cookie Alert!</strong> We use cookies to enhance your experience on our website. By continuing to browse, you agree to our use of cookies. You can customize your preferences or read our <PrivacyLink href="/privacy-policy">Privacy Policy</PrivacyLink>.
            <DuckMessage>{getDuckMessage()}</DuckMessage>
          </CookieText>
          <CookieButtons>
            <AcceptButton onClick={handleAcceptAll}>Accept All</AcceptButton>
            <CustomizeButton onClick={handleCustomize}>Customize</CustomizeButton>
            <RejectButton onClick={handleRejectAll}>Reject All</RejectButton>
          </CookieButtons>
        </CookieConsentContainer>
      )}
      
      {showModal && (
        <ModalOverlay>
          <Modal>
            <ModalHeader>
              <ModalTitle>Duck's Cookie Preferences</ModalTitle>
              <CloseButton onClick={handleCloseModal}>&times;</CloseButton>
            </ModalHeader>
            
            <CookieCategory>
              <CategoryHeader>
                <CategoryTitle>Necessary Cookies</CategoryTitle>
                <ToggleSwitch disabled checked={cookiePreferences.necessary}>
                  <input 
                    type="checkbox" 
                    checked={cookiePreferences.necessary} 
                    onChange={() => {}} 
                    disabled
                    readonly
                  />
                  <span></span>
                </ToggleSwitch>
              </CategoryHeader>
              <CategoryDescription>
                These cookies are essential for the website to function properly. They cannot be disabled.
                <DuckMessage>Even ducks need the basics to swim!</DuckMessage>
              </CategoryDescription>
            </CookieCategory>
            
            <CookieCategory>
              <CategoryHeader>
                <CategoryTitle>Analytics Cookies</CategoryTitle>
                <ToggleSwitch checked={cookiePreferences.analytics}>
                  <input 
                    type="checkbox" 
                    checked={cookiePreferences.analytics} 
                    onChange={() => handleToggleChange('analytics')} 
                  />
                  <span></span>
                </ToggleSwitch>
              </CategoryHeader>
              <CategoryDescription>
                These cookies help us understand how visitors interact with our website.
                <DuckMessage>Help our ducks count how many splashes you make!</DuckMessage>
              </CategoryDescription>
            </CookieCategory>
            
            <CookieCategory>
              <CategoryHeader>
                <CategoryTitle>Advertising Cookies</CategoryTitle>
                <ToggleSwitch checked={cookiePreferences.advertising}>
                  <input 
                    type="checkbox" 
                    checked={cookiePreferences.advertising} 
                    onChange={() => handleToggleChange('advertising')} 
                  />
                  <span></span>
                </ToggleSwitch>
              </CategoryHeader>
              <CategoryDescription>
                These cookies are used to provide relevant ads and marketing campaigns.
                <DuckMessage>Our ducks need to advertise their pond parties too!</DuckMessage>
              </CategoryDescription>
            </CookieCategory>
            
            <CookieCategory>
              <CategoryHeader>
                <CategoryTitle>Functional Cookies</CategoryTitle>
                <ToggleSwitch checked={cookiePreferences.functional}>
                  <input 
                    type="checkbox" 
                    checked={cookiePreferences.functional} 
                    onChange={() => handleToggleChange('functional')} 
                  />
                  <span></span>
                </ToggleSwitch>
              </CategoryHeader>
              <CategoryDescription>
                These cookies enable enhanced functionality and personalization.
                <DuckMessage>Helps our ducks remember how you like your pond!</DuckMessage>
              </CategoryDescription>
            </CookieCategory>
            
            <ModalFooter>
              <CancelButton onClick={handleCloseModal}>Cancel</CancelButton>
              <SaveButton onClick={handleSavePreferences}>Save Preferences</SaveButton>
            </ModalFooter>
          </Modal>
        </ModalOverlay>
      )}
    </>
  );
};

export default CookieConsent; 