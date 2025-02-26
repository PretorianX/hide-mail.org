/**
 * Format a date string with fallback for invalid dates
 * @param {string} dateString - ISO date string
 * @param {string} fallback - Fallback text if date is invalid
 * @returns {string} - Formatted date string
 */
export const formatDate = (dateString, fallback = 'Unknown date') => {
  if (!dateString) return fallback;
  
  try {
    const date = new Date(dateString);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date encountered:', dateString);
      return fallback;
    }
    
    return date.toLocaleString();
  } catch (error) {
    console.error('Error formatting date:', error);
    return fallback;
  }
}; 