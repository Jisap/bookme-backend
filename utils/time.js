

export const timeToMinutes = (time) => {
    const [hours, minutes] = time.split(":").map(Number); // Split the time string by ":" and convert the resulting array to an array of numbers.
    return hours * 60 + minutes;                          // Convert the time to minutes.
};

export const minutesToTime = (totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60);                                   // Get the hours by dividing the total minutes by 60 and rounding down.
    const minutes = totalMinutes % 60;                                             // Get the remaining minutes.
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}` // Return the formatted time string    
};

export const isValidTimeRande = (startTime, endTime) => {
    return timeToMinutes(startTime) < timeToMinutes(endTime);                      // Return true if the start time is less than the end time.
}

export const getDayOfWeek = (date) => {
    return new Date(`${date}T00:00:00`).getDay();                                  // Return the day of the week as a number (0-6).
}