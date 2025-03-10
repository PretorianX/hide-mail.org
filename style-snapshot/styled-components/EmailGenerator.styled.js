// Styled components from src/components/EmailGenerator.js
import styled from 'styled-components';
import { Link } from 'react-router-dom';

const GeneratorContainer = styled.div`
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  padding: 30px;
  margin-bottom: 30px;
`;

const Title = styled.h1`
  font-size: 24px;
  margin-bottom: 20px;
  color: var(--primary-color);
`;

const Form = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const SelectContainer = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
`;

const Label = styled.label`
  font-weight: 500;
`;

const Select = styled.select`
  padding: 10px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  flex: 1;
`;

const EmailDisplay = styled.div`
  background-color: var(--secondary-color);
  padding: 15px;
  border-radius: 4px;
  font-size: 18px;
  font-weight: 500;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const TimerContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Timer = styled.div`
  font-size: 16px;
  color: ${props => props.isExpiring ? 'red' : 'var(--text-color)'};
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: 10px;
`;

function EmailGenerator() {
  const [domains] = useState(getConfig('email.domains'));
  const [selectedDomain, setSelectedDomain] = useState(domains[0]);
  const [email, setEmail] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(getConfig('email.expirationTime'));
  const navigate = useNavigate();
