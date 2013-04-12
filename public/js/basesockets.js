/* This is client side socket code for both express 
 *and user workspaces. 
 */

var host = window.location.hostname;
var port = 80;
var url = "http://"+host+":"+port;
var isDriver; 
var driver;
var roomname;
var currentHighlight;
var annotationID = 0;
var annotations = new Object();
var annotFlag = false;
var users = {};
var refreshed = false;
var autoSaveToggle = false;
var roomType;

//base load function for the workspace
function load(socket, type, username){

  addConsoleMessage("Session initated.");

  roomType = type;

  //listen for the server to notify the client if they are
  //a driver or navigator
  socket.on('is_driver', function(data){
    setDriver(data.driver);

    addConsoleMessage("Session driver - " + data.name);

    if (!isDriver){
      //Some one is already editing when the user joined.
      //Editor should be updated with the current text.
      socket.emit("post_acquire_current_state");
      //editor.setValue(currentEditor);
      $('#driver').html('Navigator');
      $('#driver').show();
    }
    else{
      $('#driver').html('Driver');
      $('#driver').show();
      refreshed = true;
    }
    driver = data.name;
  });

  socket.on("get_driver_state", function(){
    if(isDriver &&  (roomType == "express" || fileSelected)){
      socket.emit("post_driver_state", {
        content: editor.getSession().getValue(),
        annotations: annotations,
      });
    }
  });

  socket.on("get_acquire_current_state", function(data){
    if(!refreshed){
      refreshed = true;
      editor.getSession().setValue(data.content);

      for(var aID in data.annotations){
        applyAnnotation(data.annotations[aID]);
      }

      addConsoleMessage("Pre-synced status with driver.");

      unlock_editor();
    }
  });

  //listens for incoming updates to the editor caused by the driver
  //making changes.
  socket.on("editor_update", function(data){
    if (!isDriver){
      var deltas = data.deltas;
      editor.getSession().getDocument().applyDeltas(data.deltas);
    }
  });

  //listens for changes in the editor and notifies the server
  editor.getSession().getDocument().on('change', function(e) {
    if (isDriver){
      autoSaveToggle = true;
      var deltas = new Array();
      deltas.push(e.data);
      console.log(e.data);
      socket.emit("editor_changed", {deltas: deltas, });
    }
  });

  roomname = roomID(type);
  socket.emit('join_room', { room: roomname, user:username});

  /* set up chat room */
  socket.emit('get_users', {room: roomname});

  socket.once('send_users', function(data){
    var usernames = data.usernames;
    for(u in usernames){
      var elem = $(document.createElement('p'));
      elem.text(usernames[u]);
      users[usernames[u]] = elem;
      $('#user_list').append(elem);
      if(driver == usernames[u]){
        elem.addClass('driver');
      }
      else{
        elem.addClass('navi');
      }
    }
  });

  socket.on('new_user', function(data){
    if(data.user != username){
      var elem = $(document.createElement('p'));
      elem.text(data.user);
      users[data.user] = elem;
      elem.addClass('navi');
      $('#user_list').append(elem);
      addConsoleMessage("New user joined - " + data.user);
    }
  });

  //Handle event: user sends a new message
  $("#chatsend").submit(function(){
    var message = $("#msg").val();
    if (message.length > 0){
      socket.emit('send_message', 
        {
          user: username, 
          room:roomname, 
          msg: message
        });
      $("#msg").val("");
    }
    return false;
  });
  //Handle event: getting a new message from another user
  socket.on('new_message', function(data){
    var new_msg = document.createElement("p");
    var user_id = document.createElement("span");
    var msg = document.createElement("span");

    $(user_id).text(data.user);
    $(msg).text(": " + data.msg);
    $(new_msg).append(user_id);
    $(new_msg).append(msg);
    if(data.user == driver){
      $(user_id).addClass('driver');
    }
    else{
      $(user_id).addClass('navi');  
    }

    $('#chatmsg p').first().append(new_msg);
    $("#chatmsg").scrollTop($("#chatmsg")[0].scrollHeight);
  });

  //Handle event: a user disconnected from the room
  socket.on('user_disconnect', function(data){
    var username = data.username;
    for (user in users){
      if (user == username){
        users[user].remove();
        delete users[user];
        break;
      }
    }
    addConsoleMessage("User left - " + data.username);
  });

  // Handle event: A user makes a selection.
  socket.on("get_selection", function(data){
    applySelection(data);
  });

  //Handle switch request
  $("#switch").click(function(){
    requestSwitch();
    return false;
  });

  $('#anoToggle').click(function(){
    toggleAnnotations();
    return false;
  });


  // Handle: A user added an annotation.
  socket.on("get_annotation", function(data){
    applyAnnotation(data);
  });

  //Handle switch event
  socket.on('switch_success', function(data){
    //Do anything that needs to be done to change
    //user's status
    $('#switchmodal').modal('hide');

    if(isDriver){
      setDriver(false);
      $('#driver').html('Navigator');
    }
    else if(data.new_driver == username){
      //setting up the new driver
      setDriver(true);
      $('#driver').html('Driver');
      showMessage('You are now the driver.', true);
    }
  
    driver = data.new_driver;
    users[data.new_driver]
      .removeClass('navi')
      .addClass('driver');
    users[data.new_nav]
      .removeClass('driver')
      .addClass('navi');

    addConsoleMessage("Switched driver to - " + data.new_driver);
  });

  socket.on("get_remove_annotation", function(data){
    purgeAnnotation(data);
  });

  socket.on("admin_disconnect", function(){
    alert("It appears the admin ended the session or was unexpectedly disconnected.");
    window.location.replace(url);
  });

  socket.on("driver_change_lang", function(data){
    if(!isDriver){
      changeLanguage(data.language);
      addConsoleMessage("Driver changed editor language - " + data.language);
    }
  });
}

/*
 * Change the users state to be a driver or a navigator.
 */
function setDriver(driver){
  isDriver = driver;
  if(roomType == "express" || fileSelected){
    
    editor.setReadOnly(!isDriver);
  }
}

/*Set up a socket connection
* for the user */
function connect(){
  return io.connect(url);
}

/* Get the room's id */
function roomID(type){
  var matchRoomRequest;
  //urls for express sessions and normal sessions 
  //are not the same 
  if(type=="workspace"){
    matchRoomRequest = /.*\/workspace\/(.+)/;
  }
  else{
    matchRoomRequest = /.*\/express\/(.{32})/;
  }
  var match = matchRoomRequest.exec(document.URL);

  if(match){
    return match[1];
  }
}

//Send a request to the current file.
function saveFile(){
  socket.emit("save_file", 
    {
      room:roomname, 
      user:username,
      text:editor.getSession().getValue()
    });
}
/*Return true if username is available for the roomID,
false otherwise*/
function  check_username(socket, type, username){

  var rID = roomID(type);
  var dfd = new $.Deferred();

  //Get the list of users in the room
  //and check if any of them conflict
  //with username
  socket.emit('get_users', {room: rID});
  socket.once('send_users', function(data){
    var users = data.usernames;
    for(user in users){
      if(users[user] == username){
        dfd.resolve( true );
      }
    }
    dfd.resolve( false );
  });
  return dfd.promise();
}


function handleSelection(range){
    socket.emit("post_selection", { user: username, range: range });
}

function applySelection(data){

  if(data.user != username){

    var editorSession = editor.getSession();
    var start = data.range.start;
    var end = data.range.end;
    var r = new Range(start.row, start.column, end.row, end.column);
    var lineStyle = isDriver ? "navigator" : "driver";

    for(var i in editorSession.getMarkers(false)){
      editorSession.removeMarker(i);
    }

    editorSession.addMarker(r, "line-style-" + lineStyle, "text", false);
  }
  
}


/*Handle switch button click*/
function requestSwitch(){
  if(isDriver){
    if(Object.keys(users).length > 1){
      var modal_list = $("#modal_user_list");

      //empty modal list before reconstructing list of 
      //connected users
      modal_list.empty();
      for(user in users){
        if(user != username){
          var elem = $(document.createElement('li'));
          var a = $(document.createElement('a'));
          $(a).attr('title', user);
          a.text(user);
          a.click(function(e){
            send_switch_request(e);
          })
          elem.append(a);
          modal_list.append(elem);
        }
      }
      $('#switchmodal').modal('show');
    }else{
      showMessage("You are alone in the room.", true);      
    }
  }
  else{

    showMessage("Only the driver can switch.", true);
  }
}

/* Send a switch request to the server
containing the name of the user to 
switch with */
function send_switch_request(e){
  var name = e.target.title;
  socket.emit('switch_request', {switch_target: name});
  addConsoleMessage("Switch request sent.");
  socket.on('switch_failure', function(){
    alert('switch did not work');
  })
}

function handleAnnotation(){

    var sel = editor.getSession().selection.getRange();

    if(!sel.isEmpty()){
      //Sanitize.
      $("#annot_text").val("");
      $("#annotModal").modal({show: true, backdrop: false});

    }else{  
      showMessage("No selection found.", true);
    }
}

function addAnnotation(){

  var sel = editor.getSession().selection.getRange();
  var annot = $("#annot_text").val();
  var off = annot_offset(sel.end);

  socket.emit("post_annotation", {
    user: username,
    range: sel,
    annot: annot,
    offset: off
  });


  $("#annotModal").modal('hide');

  editor.getSession().selection.clearSelection();
}

function annot_offset(range_end){
  var lines = editor.getSession().getDocument().getLines(0, range_end.row);
  var total_off = 0;
  var num_char;

  for(var i = 0; i < lines.length; i++){
    num_char = lines[i].length;
    total_off += parseInt((num_char - 1) / 80);
  }

  return total_off;
}

function applyAnnotation(data){

  var range = data.range;
  var margin_top = (parseInt(range.start.row) + data.offset) * 20;
  var annot_height = ((range.end.row - range.start.row) + 1) * 20;
  var annotation_color = data.driver == data.user ? "#8EC21F" : "#C2731F";
  var annotation_role = data.driver == data.user ? "driver" : "navigator";
  var annotation_id = annotationID++;

  var annot = $("<div/>");
  annot.attr("id", "an" + annotation_id);
  annot.attr("class", "annotation");
  annot.css("background", annotation_color);
  annot.css("top", margin_top + "px");
  annot.css("height", annot_height + "px");

  $("#annotBox").append(annot);

  data.elem = annot;
  data.role = annotation_role;

  if(username != data.user)
    addConsoleMessage("User - " + data.user + " applied annotation, on lines " + range.start.row + "-" + range.end.row);

  annotations[annotation_id] = data;

  annot.popover({
    content: data.annot,
    trigger: 'none'
  });

  annot.hover(
    function(){
      annot.popover('show');
      highlightAnnotation(range, annotation_role);
    },
    function(){
      if(!annotFlag){
        annot.popover('hide');
      }
      destroyHighlightAnnotation();
    }
  );
}

function highlightAnnotation(range, role){
  
  var s = range.start;
  var e = range.end;
  var r = new Range(s.row, s.column, e.row, e.column);
  currentHighlight = editor.getSession().addMarker(r,"line-style-" + role, "text");
}

function destroyHighlightAnnotation(){
  editor.getSession().removeMarker(currentHighlight);
}

function removeAnnotationSend(target){
  socket.emit("post_remove_annotation", {target: target});
}

function purgeAnnotation(data){
  
  var target_id = parseInt(data.target.slice(2));

  delete annotations[target_id];

  destroyHighlightAnnotation();
  $("#" + data.target)
    .popover('destroy')
    .remove();
}

/* Activate pop over for all annotations */
function showAllAnnotations(){
  for(var annot_id in annotations){
    var annot = annotations[annot_id];
    annot.elem.popover('show');
  }

  annotFlag = true;
}

/* Deactivate pop over for all annotations */
function hideAllAnnotations(){
  for (var annot_id in annotations){
    var annot = annotations[annot_id];
    annot.elem.popover('hide');
  }

  annotFlag = false;
}

function toggleAnnotations(){
  if(annotFlag){
    $('#anoToggle i').removeClass('icon-edit');
    $('#anoToggle i').addClass('icon-pencil');
    addConsoleMessage("Showing all annotations.");
    hideAllAnnotations();
  }
  else{
    $('#anoToggle i').removeClass('icon-pencil');
    $('#anoToggle i').addClass('icon-edit');
    addConsoleMessage("Hide all annotations");
    showAllAnnotations();
  }
}

function pad(n) { return ("0" + n).slice(-2); }

function addConsoleMessage(message){

  var d = new Date();
  var timestamp = pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());

  var contents = "<span class='console-timestamp'>[" + timestamp + "]:</span> ";

  contents +=  message + "<br/>";

  $("#console").append($('<span>'+contents+'</span>').hide().fadeIn(2000));

  $("#console").scrollTop($("#console")[0].scrollHeight);
}
