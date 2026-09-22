


const toGoogleDateTime = (date, time) => {
  return `${date.replaceAll("-", "")}T${time.replace(":", "")}00`;
};

export const buildCustomerCalenderUrl = ({ business, service, booking }) => {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${service.name} with ${business.business || business.name}`,
    dates: `${toGoogleDateTime(booking.date, booking.startTime)}/${toGoogleDateTime(booking.date, booking.endTime)}`,
    details: booking.notes || `Booking with ${business.businessName || business.name}`
  });


}