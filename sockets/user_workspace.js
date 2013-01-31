exports.join = function(socket, data, roomDrivers){

  var roomExistsBefore = "/" + data.room in socket.manager.rooms; 
  console.log('client request to join user room ' + data.room);
  socket.join(data.room);
  var roomExistsAfter = "/" + data.room in socket.manager.rooms
  socket.set("nickname", data.user);
  socket.set("room", data.room);
  //check if the room was newly created
  if (!roomExistsBefore && roomExistsAfter){
    roomDrivers[data.room] = data.user;
    console.log("New room created by " + data.user + ": " + data.room);
  }
}
//Handles a socket disconnecting. This will do garbage collection
//if the socket disconnecting is the only socket in the room.
exports.disconnect = function(socket, roomDrivers){
    var nick = socket.store.data["nickname"];
    var room = socket.store.data["room"];
    if (roomDrivers[room] == nick){
      delete roomDrivers[room];
    }
}