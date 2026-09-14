export function queueDestination(ticket) {
  const room = ticket?.counter_room?.trim()
  if (room?.toLowerCase() === 'service desk') return 'Service Desk'
  if (!room || room.toLowerCase() === 'doctor consult') return 'MHO Office'
  return room
}
