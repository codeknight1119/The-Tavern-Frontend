export function getNextMeetingDate() {
    const today = new Date();
    const resultDate = new Date(today);
  
    // Thursday is the 4th day of the week (Sunday = 0, Monday = 1... Thursday = 4)
    const meetingDays = [1,5]
    const currentDay = today.getDay();

    let daysTil = 7;

    meetingDays.forEach((val)=>{
        const daysTil = (targetDay + 7 - currentDay) % 7 || 7;

        if(daysTil < currentTilDate){
            resultDate.setDate(today.getDate() + daysUntilThursday)
        }
    })
    return resultDate;
}