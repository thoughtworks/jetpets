var io = require('../../3rdparty/socket.io.min');

exports.connect = function(matchStart, playerMove) {

  function openSocket() {
    var socket = io.connect('/', {
      'reconnect': false,
      'force new connection': true
    });

    socket.on('connect', function(){
      console.log("connected!");
      socket.emit('identify')
    });

    socket.on('match-start', matchStart);
    socket.on('player-action', playerAction);

    socket.on('disconnect', function(){
      console.log("socket disconnected");
      openSocket();
    });
  }

  function playerAction(args) {
    if (args.action === 'up') {
      console.log('[socket] move '  + args.pindex + ' up');
      playerMove({pindex: args.pindex, dir: 'up'});
    } else if (args.action === 'down') {
      console.log('[socket] move '  + args.pindex + ' down');
      playerMove({pindex: args.pindex, dir: 'down'});
    }
  }

  openSocket();
};
