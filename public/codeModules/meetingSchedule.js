export function getNextThursday() {
  const today = new Date();
  const resultDate = new Date(today);
  
  // Thursday is the 4th day of the week (Sunday = 0, Monday = 1... Thursday = 4)
  const targetDay = 4; 
  const currentDay = today.getDay();
  
  // Calculate days until next Thursday
  // If today is Thursday, this formula adds 7 days to get the *next* Thursday
  const daysUntilThursday = (targetDay + 7 - currentDay) % 7 || 7;
  
  resultDate.setDate(today.getDate() + daysUntilThursday);
  
  return resultDate;
}