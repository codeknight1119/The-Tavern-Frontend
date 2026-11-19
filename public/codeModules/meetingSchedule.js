export function getNextMeetingDate() {
    const today = new Date();
    const resultDate = new Date(today);
  
    // Thursday is the 4th day of the week (Sunday = 0, Monday = 1... Thursday = 4)
    const meetingDays = [1,5]
    const currentDay = today.getDay();


   let  currentTilDate = 7
    let daysTil = 7;

    meetingDays.forEach((val)=>{
        const daysTil = (val + 7 - currentDay) % 7 || 7;

        if(daysTil < currentTilDate){
            currentTilDate = daysTil
            
        }
    })

    resultDate.setDate(today.getDate() + daysTil)
    return resultDate;
}