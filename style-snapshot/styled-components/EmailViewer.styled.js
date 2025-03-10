// Styled components from src/components/EmailViewer.js
import styled from 'styled-components';
import { Link } from 'react-router-dom';

const ViewerContainer = styled.div`
  display: flex;
  gap: 20px;
  height: 70vh;
`;

const EmailList = styled.div`
  flex: 1;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  overflow-y: auto;
`;

const EmailItem = styled.div`
  padding: 15px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  background-color: ${props => props.isSelected ? 'rgba(74, 144, 226, 0.1)' : 'white'};
  
  &:hover {
    background-color: ${props => props.isSelected ? 'rgba(74, 144, 226, 0.1)' : 'rgba(74, 144, 226, 0.05)'};
  }
`;

const EmailSubject = styled.div`
  font-weight: ${props => props.isUnread ? 'bold' : 'normal'};
  margin-bottom: 5px;
`;

const EmailSender = styled.div`
  font-size: 14px;
  color: var(--light-text);
`;

const EmailTime = styled.div`
  font-size: 12px;
  color: var(--light-text);
  text-align: right;
`;

const EmailContent = styled.div`
  flex: 2;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  padding: 20px;
  overflow-y: auto;
`;

const EmailHeader = styled.div`
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 20px;
`;

const EmailTitle = styled.h2`
  margin-bottom: 10px;
`;

const EmailDetails = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: var(--light-text);
`;

const EmailBody = styled.div`
  line-height: 1.6;
`;

const NoEmailSelected = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: var(--light-text);
  font-size: 16px;
`;

const RefreshButton = styled.button`
  margin-bottom: 15px;
`;

function EmailViewer() {
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEmails();
