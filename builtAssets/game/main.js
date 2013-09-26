;(function(e,t,n){function i(n,s){if(!t[n]){if(!e[n]){var o=typeof require=="function"&&require;if(!s&&o)return o(n,!0);if(r)return r(n,!0);throw new Error("Cannot find module '"+n+"'")}var u=t[n]={exports:{}};e[n][0].call(u.exports,function(t){var r=e[n][1][t];return i(r?r:t)},u,u.exports)}return t[n].exports}var r=typeof require=="function"&&require;for(var s=0;s<n.length;s++)i(n[s]);return i})({1:[function(require,module,exports){
var assetLoader     = require('./asset-loader');
var bridgeSocket    = require('./bridge-socket');
var bridgeKeyboard  = require('./bridge-keyboard');
var Engine          = require('./engine/engine');
var Intro           = require('./intro/intro')
var Game            = require('./game/game');
var world           = require('./game/world');
var hub             = require('./engine/hub');

window.Main = function() {
  assetLoader.preloadAndRun(mainLoop);
};

function mainLoop() {
  
  var container  = document.querySelector('#container');
  var gameView   = document.querySelector('#gameView');
  var debugView  = document.querySelector('#debugView');
  
  debugView.height = window.innerHeight;
  debugView.width  = window.innerWidth;
  gameView.height  = window.innerHeight;
  gameView.width   = window.innerWidth;
  
  var engine = new Engine(world, gameView, debugView);
  var game   = null;

  function showIntro() {
    cleanup();
    engine.attach(new Intro(engine));
  }

  function matchStart(players) {
    cleanup();
    if (!game) {
      game = new Game(engine, players);
      engine.attach(game);
      hub.on('game.finish', endMatchOnServer);
    }
  }
  
  function playerMove(args) {    
    if (game) {
      game.move(args.pindex, args.dir);
    }
  }
  
  function endMatchOnServer() {
    $.post('/game/status', {
      status: 'finished',
      players: game.players.map(function(player) {
        return {
          id: player.id,
          score: player.score
        }
      })
    }).then(showIntro).fail(showIntro);
  }
  
  function cleanup() {
    hub.unbind('game.*');
    engine.detach();
    engine.reset();
    game = null;
  }  

  engine.start();
  showIntro();
  bridgeKeyboard.connect(matchStart, playerMove);
  bridgeSocket.connect(matchStart, playerMove);
}

},{"./asset-loader":2,"./bridge-socket":3,"./bridge-keyboard":4,"./engine/engine":5,"./intro/intro":6,"./game/game":7,"./game/world":8,"./engine/hub":9}],4:[function(require,module,exports){

exports.connect = function(matchStart, playerMove) {

  var keydown       = $(document).keydownAsObservable().select(keyCode);
  var keyup         = $(document).keyupAsObservable();
  var singledown    = keydown.merge(keyup).distinctUntilChanged();
  
  singledown.where(key(13)).subscribe(start);
  singledown.where(letter('Q')).subscribe(move(0, 'up'));
  singledown.where(letter('S')).subscribe(move(0, 'down'));
  singledown.where(letter('P')).subscribe(move(1, 'up'));
  singledown.where(letter('L')).subscribe(move(1, 'down'));

  function keyCode(e) {
    return e.keyCode;
  }

  function key(c) {
    return function(code) {
      return code === c;
    };
  }
  
  function letter(l) {
    return function(code) {
      return code === l.charCodeAt(0);
    };
  }
  
  function start() {
    matchStart([
      { id: '1', firstName: 'John', lastName: 'Doe'   },
      { id: '2', firstName: 'Bill', lastName: 'Cosby' }
    ]);
  }
  
  function move(index, dir) {
    return function() { 
      console.log('[keyboard] move ' + index + ' ' + dir);
      playerMove({
        pindex: index,
        dir: dir
      });
    };
  }
  
};

},{}],8:[function(require,module,exports){

// The big TV for the game is 16:9
exports.width  = 60;
exports.height = 60 / (16/9);

},{}],2:[function(require,module,exports){
var assets = require('./assets');

function loadImages(callback) {
  var assetLoader = new PIXI.AssetLoader(assets.allImages());
  assetLoader.onComplete = callback;
  assetLoader.load();
}

function loadFonts(callback) {
  WebFont.load({
    active: callback,
    custom: {
      families: ['LuckiestGuy'],
      urls: ['/3rdparty/luckiest-guy.css'],
    }
  });
}

exports.preloadAndRun = function(callback) {
  loadImages(function() {
    loadFonts(function() {
      callback();
    });
  });
}

},{"./assets":10}],3:[function(require,module,exports){
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

},{"../../3rdparty/socket.io.min":11}],5:[function(require,module,exports){
var _               = require('../../../3rdparty/underscore-min');
var GraphicsEngine  = require('./graphics-engine');
var PhysicsEngine   = require('./physics-engine');
var SoundEngine     = require('./sound-engine');
var ParticleEngine  = require('./particle-engine');
var ticker          = require('./ticker');
var EntityTracker   = require('./entitytracker');
var Time            = require('./time');
var hub             = require('./hub');


function Engine(world, mainView, debugView) {
  
  this.nextTickActions  = [];
  
  this.graphics     = new GraphicsEngine(world, mainView, debugView);
  this.physics      = new PhysicsEngine(/*debugView*/);
  this.sound        = new SoundEngine();
  this.particles    = new ParticleEngine(this);
  this.tracker      = new EntityTracker();
  this.time         = new Time();
  
  // No game attached yet
  this.game = null;
    
  this.physics.collision(function(fixtureA, fixtureB, points) {
    var entityA = fixtureA.GetUserData();
    var entityB = fixtureB.GetUserData();
    if (entityA && entityB) {
      entityA.collision(entityB, points);
      entityB.collision(entityA, points);      
    }
  });
   
  hub.interceptor = _.bind(this.queueNext, this);
  
  hub.on('entity:destroy', function(params) {
    this.deleteEntity(params.entity.id)
  }.bind(this));
  
};

Engine.prototype.start = function() {
  ticker.run(this.update.bind(this));
};

Engine.prototype.stop = function() {
  ticker.stop();
};

Engine.prototype.update = function() {
  this.time.update();
  this.physics.update();
  this.tracker.forEach(function(entity) {
    entity.update(this, this.game, this.time.delta);
  }.bind(this));
  if (this.game) {
    this.game.update(this, this.time.delta);
  }
  this.graphics.render();
  
  var nextAction = null;
  while (nextAction = this.nextTickActions.pop()) {
    nextAction.call(this);
  }
};

Engine.prototype.queueNext = function(action) {
  this.nextTickActions.push(action);
};

Engine.prototype.addEntity = function(entity) {
  if (entity.id) {
    this.tracker.track(entity);
    entity.create(this, this.game);
  } else {
    console.log('Entity should have an ID', entity);
  }
};

Engine.prototype.deleteEntity = function(id) {
  var entity = this.tracker.find(id);
  if (entity) {
    entity.destroy(this, this.game);
    this.tracker.forget(entity);
  } else {
    console.log('Entity not found', entity);
  }
};

Engine.prototype.deleteEntityMatching = function(regex) {
  var entities = this.tracker.findMatching(regex)
  entities.forEach(function(entity) {
    entity.destroy(this, this.game)
    this.tracker.forget(entity)
  }.bind(this))
}

Engine.prototype.getEntity = function(id) {
  return this.tracker.find(id);
};

Engine.prototype.attach = function(game) {
  this.game = game;
};

Engine.prototype.detach = function() {
  if (this.game) {
    this.game.destroy(this);
  }
  this.game = null;
};

Engine.prototype.reset = function() {
  this.tracker.forEach(function(entity) {
    entity.destroy(this, null);
  }.bind(this));
  this.tracker.forgetAll();
};

module.exports = Engine;

},{"../../../3rdparty/underscore-min":12,"./graphics-engine":13,"./physics-engine":14,"./sound-engine":15,"./particle-engine":16,"./ticker":17,"./entitytracker":18,"./time":19,"./hub":9}],6:[function(require,module,exports){
var _             = require('../../../3rdparty/underscore-min');
var Leaderboard   = require('./entities/Leaderboard');
var Title         = require('./entities/Title');
var About         = require('./entities/About');
var hub           = require('../engine/hub');

function Intro(engine) {
  this.current = 0;
  this.switch(engine);
  this.switchTimer = window.setInterval(_.bind(this.switch, this, engine), 10000);
  hub.send('engine.sound.play', {file: '/game/sounds/intro.mp3', loop: true, volume: 0.8});
}

Intro.prototype.update = function(engine, delta) {
};

Intro.prototype.destroy = function(engine) {
  this.removeAll(engine);
  window.clearTimeout(this.switchTimer);
  hub.send('engine.sound.stop', {file: '/game/sounds/intro.mp3'});
};

Intro.prototype.switch = function(engine) {
  this.removeAll(engine);
  ++this.current;
  if (this.current % 3 === 1) engine.addEntity(new Leaderboard('leaderboard'));
  if (this.current % 3 === 2) engine.addEntity(new Title('title'));
  if (this.current % 3 === 0) engine.addEntity(new About('about'));
};

Intro.prototype.removeAll = function(engine) {
  engine.deleteEntity('title');
  engine.deleteEntity('leaderboard');
  engine.deleteEntity('about');
};

module.exports = Intro;

},{"../../../3rdparty/underscore-min":12,"./entities/Leaderboard":20,"./entities/Title":21,"./entities/About":22,"../engine/hub":9}],7:[function(require,module,exports){
var Sequencer   = require('./sequencer');
var world       = require('./world');
var hub         = require('../engine/hub');

var Ball        = require('./entities/ball');
var world       = require('./world');
var ActionText  = require('./entities/action-text');

function Game(engine, playerInfo) {

  // two players in the current match
  // or maybe this belongs in the Player entity?
  this.players = playerInfo.map(function(p) {
    return {
      id: p.id,
      name: p.firstName + ' ' + p.lastName.substr(0,1),
      score: 0
    }
  });
  this.roundNumber = 1

  var states = {
    'warmup':     require('./states/warmup'),
    'kickoff':    require('./states/kickoff'),
    'play':       require('./states/play'),
    'scored':     require('./states/scored'),
    'endofmatch': require('./states/endofmatch')
  };

  var transitions = [
      {   name: 'startup',  from: 'none',                                   to: 'warmup'       },
      {   name: 'ready',    from: ['warmup', 'scored'],                     to: 'kickoff'      },
      {   name: 'go',       from: ['scored', 'kickoff'],                    to: 'play'         },
      {   name: 'scored',   from: ['play', 'scored', 'kickoff'],            to: 'scored'       },
      {   name: 'end',      from: ['warmup', 'kickoff', 'play', 'scored'],  to: 'endofmatch'   },
  ];
  
  this.duration = 45;
  this.timeRemaining = this.duration * 1000;
  this.ballsInPlay = []
  
  this.engine = engine;
  this.sequencer = new Sequencer(engine, this, states, transitions);
  this.sequencer.start();

  hub.on('game.score', function(data) {
    this.score(1 - data.againstIndex);
    this.sequencer.transition('scored', data);
  }.bind(this));

  hub.on('game.end', function() {
    this.sequencer.transition('end');
  }.bind(this));

  hub.on('game.multiball', function() {
    this.multiball()
  }.bind(this))
}

Game.prototype.update = function(engine, delta) {
  this.sequencer.active().update(delta);
};

Game.prototype.destroy = function(engine) {
  
};

Game.prototype.transition = function(name, args) {
  this.sequencer.transition(name, args);
};

Game.prototype.message = function(message, args) {
  this.sequencer.active().on(message, args);
};

Game.prototype.score = function(playerIndex) {
  this.roundNumber += 1
  this.players[playerIndex].score += 1;
};

Game.prototype.move = function(pindex, dir) {
  var player = this.engine.getEntity(pindex === 0 ? 'p1' : 'p2');
  player.move(dir);
};

Game.prototype.multiball = function() {
  var text = new ActionText('multiball', 'Multi-ball!');
  this.engine.addEntity(text)

  hub.send('engine.sound.play', { file: '/game/sounds/multiball.mp3' })
  setTimeout(function() {
    hub.send('engine.sound.play', { file: '/game/sounds/sax.mp3', volume: 0.9 });
  }, 2000);

  setTimeout(function() {
    this.engine.deleteEntity(text.id)
    
    var ball = this.createBall(-1, 1)
    ball.kick(1)
    ball = this.createBall(1, 1)
    ball.kick(1)
    ball = this.createBall(1, 1)
    ball.kick(-1)
    ball = this.createBall(0, -1)
    ball.kick(-1)
  }.bind(this), 1000)
}

Game.prototype.clearBalls = function() {
  this.ballsInPlay.forEach(function(ball) {
    this.removeBall(ball)
  }.bind(this))
  this.ballsInPlay = []
}

Game.prototype.removeBall = function(ball) {
  this.engine.deleteEntity(ball.id)
  this.ballsInPlay = this.ballsInPlay.filter(function(b) { return b !== ball })
}

Game.prototype.createBall = function(x, y) {
  var ballStartY = null
  var ballStartX = null

  if (x === -1) {
    ballStartX = world.width / 5
  } else if (x === 0) {
    ballStartX = world.width / 2
  } else {
    ballStartX = (world.width / 5) * 4
  }

  if (y === -1) {
    ballStartY = world.height / 5
  } else if (y === 0) {
    ballStartY = world.height / 2
  } else {
    ballStartY = (world.height / 5) * 4
  }

  var ball = new Ball('ball:'+this.ballsInPlay.length, ballStartX, ballStartY)

  this.engine.addEntity(ball)
  this.ballsInPlay.push(ball)

  return ball
}

module.exports = Game;

},{"./sequencer":23,"./world":8,"../engine/hub":9,"./entities/ball":24,"./entities/action-text":25,"./states/warmup":26,"./states/kickoff":27,"./states/play":28,"./states/scored":29,"./states/endofmatch":30}],9:[function(require,module,exports){
var eve = require('../../../3rdparty/eve');

exports.interceptor = function(fn) { fn(); };

exports.send = function(message, args) {
  eve(message, null, args);
};

exports.on = function(message, callback) {
  eve.on(message, function() {
    var args = arguments;
    exports.interceptor(function() {
      callback.apply(this, args)
    });
  });
};

exports.unbind = function(name) {
  eve.off(name);
};

},{"../../../3rdparty/eve":31}],11:[function(require,module,exports){
/*! Socket.IO.min.js build:0.9.11, production. Copyright(c) 2011 LearnBoost <dev@learnboost.com> MIT Licensed */
var io="undefined"==typeof module?{}:module.exports;(function(){(function(a,b){var c=a;c.version="0.9.11",c.protocol=1,c.transports=[],c.j=[],c.sockets={},c.connect=function(a,d){var e=c.util.parseUri(a),f,g;b&&b.location&&(e.protocol=e.protocol||b.location.protocol.slice(0,-1),e.host=e.host||(b.document?b.document.domain:b.location.hostname),e.port=e.port||b.location.port),f=c.util.uniqueUri(e);var h={host:e.host,secure:"https"==e.protocol,port:e.port||("https"==e.protocol?443:80),query:e.query||""};c.util.merge(h,d);if(h["force new connection"]||!c.sockets[f])g=new c.Socket(h);return!h["force new connection"]&&g&&(c.sockets[f]=g),g=g||c.sockets[f],g.of(e.path.length>1?e.path:"")}})("object"==typeof module?module.exports:this.io={},this),function(a,b){var c=a.util={},d=/^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/,e=["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"];c.parseUri=function(a){var b=d.exec(a||""),c={},f=14;while(f--)c[e[f]]=b[f]||"";return c},c.uniqueUri=function(a){var c=a.protocol,d=a.host,e=a.port;return"document"in b?(d=d||document.domain,e=e||(c=="https"&&document.location.protocol!=="https:"?443:document.location.port)):(d=d||"localhost",!e&&c=="https"&&(e=443)),(c||"http")+"://"+d+":"+(e||80)},c.query=function(a,b){var d=c.chunkQuery(a||""),e=[];c.merge(d,c.chunkQuery(b||""));for(var f in d)d.hasOwnProperty(f)&&e.push(f+"="+d[f]);return e.length?"?"+e.join("&"):""},c.chunkQuery=function(a){var b={},c=a.split("&"),d=0,e=c.length,f;for(;d<e;++d)f=c[d].split("="),f[0]&&(b[f[0]]=f[1]);return b};var f=!1;c.load=function(a){if("document"in b&&document.readyState==="complete"||f)return a();c.on(b,"load",a,!1)},c.on=function(a,b,c,d){a.attachEvent?a.attachEvent("on"+b,c):a.addEventListener&&a.addEventListener(b,c,d)},c.request=function(a){if(a&&"undefined"!=typeof XDomainRequest&&!c.ua.hasCORS)return new XDomainRequest;if("undefined"!=typeof XMLHttpRequest&&(!a||c.ua.hasCORS))return new XMLHttpRequest;if(!a)try{return new(window[["Active"].concat("Object").join("X")])("Microsoft.XMLHTTP")}catch(b){}return null},"undefined"!=typeof window&&c.load(function(){f=!0}),c.defer=function(a){if(!c.ua.webkit||"undefined"!=typeof importScripts)return a();c.load(function(){setTimeout(a,100)})},c.merge=function(b,d,e,f){var g=f||[],h=typeof e=="undefined"?2:e,i;for(i in d)d.hasOwnProperty(i)&&c.indexOf(g,i)<0&&(typeof b[i]!="object"||!h?(b[i]=d[i],g.push(d[i])):c.merge(b[i],d[i],h-1,g));return b},c.mixin=function(a,b){c.merge(a.prototype,b.prototype)},c.inherit=function(a,b){function c(){}c.prototype=b.prototype,a.prototype=new c},c.isArray=Array.isArray||function(a){return Object.prototype.toString.call(a)==="[object Array]"},c.intersect=function(a,b){var d=[],e=a.length>b.length?a:b,f=a.length>b.length?b:a;for(var g=0,h=f.length;g<h;g++)~c.indexOf(e,f[g])&&d.push(f[g]);return d},c.indexOf=function(a,b,c){for(var d=a.length,c=c<0?c+d<0?0:c+d:c||0;c<d&&a[c]!==b;c++);return d<=c?-1:c},c.toArray=function(a){var b=[];for(var c=0,d=a.length;c<d;c++)b.push(a[c]);return b},c.ua={},c.ua.hasCORS="undefined"!=typeof XMLHttpRequest&&function(){try{var a=new XMLHttpRequest}catch(b){return!1}return a.withCredentials!=undefined}(),c.ua.webkit="undefined"!=typeof navigator&&/webkit/i.test(navigator.userAgent),c.ua.iDevice="undefined"!=typeof navigator&&/iPad|iPhone|iPod/i.test(navigator.userAgent)}("undefined"!=typeof io?io:module.exports,this),function(a,b){function c(){}a.EventEmitter=c,c.prototype.on=function(a,c){return this.$events||(this.$events={}),this.$events[a]?b.util.isArray(this.$events[a])?this.$events[a].push(c):this.$events[a]=[this.$events[a],c]:this.$events[a]=c,this},c.prototype.addListener=c.prototype.on,c.prototype.once=function(a,b){function d(){c.removeListener(a,d),b.apply(this,arguments)}var c=this;return d.listener=b,this.on(a,d),this},c.prototype.removeListener=function(a,c){if(this.$events&&this.$events[a]){var d=this.$events[a];if(b.util.isArray(d)){var e=-1;for(var f=0,g=d.length;f<g;f++)if(d[f]===c||d[f].listener&&d[f].listener===c){e=f;break}if(e<0)return this;d.splice(e,1),d.length||delete this.$events[a]}else(d===c||d.listener&&d.listener===c)&&delete this.$events[a]}return this},c.prototype.removeAllListeners=function(a){return a===undefined?(this.$events={},this):(this.$events&&this.$events[a]&&(this.$events[a]=null),this)},c.prototype.listeners=function(a){return this.$events||(this.$events={}),this.$events[a]||(this.$events[a]=[]),b.util.isArray(this.$events[a])||(this.$events[a]=[this.$events[a]]),this.$events[a]},c.prototype.emit=function(a){if(!this.$events)return!1;var c=this.$events[a];if(!c)return!1;var d=Array.prototype.slice.call(arguments,1);if("function"==typeof c)c.apply(this,d);else{if(!b.util.isArray(c))return!1;var e=c.slice();for(var f=0,g=e.length;f<g;f++)e[f].apply(this,d)}return!0}}("undefined"!=typeof io?io:module.exports,"undefined"!=typeof io?io:module.parent.exports),function(exports,nativeJSON){function f(a){return a<10?"0"+a:a}function date(a,b){return isFinite(a.valueOf())?a.getUTCFullYear()+"-"+f(a.getUTCMonth()+1)+"-"+f(a.getUTCDate())+"T"+f(a.getUTCHours())+":"+f(a.getUTCMinutes())+":"+f(a.getUTCSeconds())+"Z":null}function quote(a){return escapable.lastIndex=0,escapable.test(a)?'"'+a.replace(escapable,function(a){var b=meta[a];return typeof b=="string"?b:"\\u"+("0000"+a.charCodeAt(0).toString(16)).slice(-4)})+'"':'"'+a+'"'}function str(a,b){var c,d,e,f,g=gap,h,i=b[a];i instanceof Date&&(i=date(a)),typeof rep=="function"&&(i=rep.call(b,a,i));switch(typeof i){case"string":return quote(i);case"number":return isFinite(i)?String(i):"null";case"boolean":case"null":return String(i);case"object":if(!i)return"null";gap+=indent,h=[];if(Object.prototype.toString.apply(i)==="[object Array]"){f=i.length;for(c=0;c<f;c+=1)h[c]=str(c,i)||"null";return e=h.length===0?"[]":gap?"[\n"+gap+h.join(",\n"+gap)+"\n"+g+"]":"["+h.join(",")+"]",gap=g,e}if(rep&&typeof rep=="object"){f=rep.length;for(c=0;c<f;c+=1)typeof rep[c]=="string"&&(d=rep[c],e=str(d,i),e&&h.push(quote(d)+(gap?": ":":")+e))}else for(d in i)Object.prototype.hasOwnProperty.call(i,d)&&(e=str(d,i),e&&h.push(quote(d)+(gap?": ":":")+e));return e=h.length===0?"{}":gap?"{\n"+gap+h.join(",\n"+gap)+"\n"+g+"}":"{"+h.join(",")+"}",gap=g,e}}"use strict";if(nativeJSON&&nativeJSON.parse)return exports.JSON={parse:nativeJSON.parse,stringify:nativeJSON.stringify};var JSON=exports.JSON={},cx=/[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,escapable=/[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,gap,indent,meta={"\b":"\\b","\t":"\\t","\n":"\\n","\f":"\\f","\r":"\\r",'"':'\\"',"\\":"\\\\"},rep;JSON.stringify=function(a,b,c){var d;gap="",indent="";if(typeof c=="number")for(d=0;d<c;d+=1)indent+=" ";else typeof c=="string"&&(indent=c);rep=b;if(!b||typeof b=="function"||typeof b=="object"&&typeof b.length=="number")return str("",{"":a});throw new Error("JSON.stringify")},JSON.parse=function(text,reviver){function walk(a,b){var c,d,e=a[b];if(e&&typeof e=="object")for(c in e)Object.prototype.hasOwnProperty.call(e,c)&&(d=walk(e,c),d!==undefined?e[c]=d:delete e[c]);return reviver.call(a,b,e)}var j;text=String(text),cx.lastIndex=0,cx.test(text)&&(text=text.replace(cx,function(a){return"\\u"+("0000"+a.charCodeAt(0).toString(16)).slice(-4)}));if(/^[\],:{}\s]*$/.test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g,"@").replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,"]").replace(/(?:^|:|,)(?:\s*\[)+/g,"")))return j=eval("("+text+")"),typeof reviver=="function"?walk({"":j},""):j;throw new SyntaxError("JSON.parse")}}("undefined"!=typeof io?io:module.exports,typeof JSON!="undefined"?JSON:undefined),function(a,b){var c=a.parser={},d=c.packets=["disconnect","connect","heartbeat","message","json","event","ack","error","noop"],e=c.reasons=["transport not supported","client not handshaken","unauthorized"],f=c.advice=["reconnect"],g=b.JSON,h=b.util.indexOf;c.encodePacket=function(a){var b=h(d,a.type),c=a.id||"",i=a.endpoint||"",j=a.ack,k=null;switch(a.type){case"error":var l=a.reason?h(e,a.reason):"",m=a.advice?h(f,a.advice):"";if(l!==""||m!=="")k=l+(m!==""?"+"+m:"");break;case"message":a.data!==""&&(k=a.data);break;case"event":var n={name:a.name};a.args&&a.args.length&&(n.args=a.args),k=g.stringify(n);break;case"json":k=g.stringify(a.data);break;case"connect":a.qs&&(k=a.qs);break;case"ack":k=a.ackId+(a.args&&a.args.length?"+"+g.stringify(a.args):"")}var o=[b,c+(j=="data"?"+":""),i];return k!==null&&k!==undefined&&o.push(k),o.join(":")},c.encodePayload=function(a){var b="";if(a.length==1)return a[0];for(var c=0,d=a.length;c<d;c++){var e=a[c];b+="\ufffd"+e.length+"\ufffd"+a[c]}return b};var i=/([^:]+):([0-9]+)?(\+)?:([^:]+)?:?([\s\S]*)?/;c.decodePacket=function(a){var b=a.match(i);if(!b)return{};var c=b[2]||"",a=b[5]||"",h={type:d[b[1]],endpoint:b[4]||""};c&&(h.id=c,b[3]?h.ack="data":h.ack=!0);switch(h.type){case"error":var b=a.split("+");h.reason=e[b[0]]||"",h.advice=f[b[1]]||"";break;case"message":h.data=a||"";break;case"event":try{var j=g.parse(a);h.name=j.name,h.args=j.args}catch(k){}h.args=h.args||[];break;case"json":try{h.data=g.parse(a)}catch(k){}break;case"connect":h.qs=a||"";break;case"ack":var b=a.match(/^([0-9]+)(\+)?(.*)/);if(b){h.ackId=b[1],h.args=[];if(b[3])try{h.args=b[3]?g.parse(b[3]):[]}catch(k){}}break;case"disconnect":case"heartbeat":}return h},c.decodePayload=function(a){if(a.charAt(0)=="\ufffd"){var b=[];for(var d=1,e="";d<a.length;d++)a.charAt(d)=="\ufffd"?(b.push(c.decodePacket(a.substr(d+1).substr(0,e))),d+=Number(e)+1,e=""):e+=a.charAt(d);return b}return[c.decodePacket(a)]}}("undefined"!=typeof io?io:module.exports,"undefined"!=typeof io?io:module.parent.exports),function(a,b){function c(a,b){this.socket=a,this.sessid=b}a.Transport=c,b.util.mixin(c,b.EventEmitter),c.prototype.heartbeats=function(){return!0},c.prototype.onData=function(a){this.clearCloseTimeout(),(this.socket.connected||this.socket.connecting||this.socket.reconnecting)&&this.setCloseTimeout();if(a!==""){var c=b.parser.decodePayload(a);if(c&&c.length)for(var d=0,e=c.length;d<e;d++)this.onPacket(c[d])}return this},c.prototype.onPacket=function(a){return this.socket.setHeartbeatTimeout(),a.type=="heartbeat"?this.onHeartbeat():(a.type=="connect"&&a.endpoint==""&&this.onConnect(),a.type=="error"&&a.advice=="reconnect"&&(this.isOpen=!1),this.socket.onPacket(a),this)},c.prototype.setCloseTimeout=function(){if(!this.closeTimeout){var a=this;this.closeTimeout=setTimeout(function(){a.onDisconnect()},this.socket.closeTimeout)}},c.prototype.onDisconnect=function(){return this.isOpen&&this.close(),this.clearTimeouts(),this.socket.onDisconnect(),this},c.prototype.onConnect=function(){return this.socket.onConnect(),this},c.prototype.clearCloseTimeout=function(){this.closeTimeout&&(clearTimeout(this.closeTimeout),this.closeTimeout=null)},c.prototype.clearTimeouts=function(){this.clearCloseTimeout(),this.reopenTimeout&&clearTimeout(this.reopenTimeout)},c.prototype.packet=function(a){this.send(b.parser.encodePacket(a))},c.prototype.onHeartbeat=function(a){this.packet({type:"heartbeat"})},c.prototype.onOpen=function(){this.isOpen=!0,this.clearCloseTimeout(),this.socket.onOpen()},c.prototype.onClose=function(){var a=this;this.isOpen=!1,this.socket.onClose(),this.onDisconnect()},c.prototype.prepareUrl=function(){var a=this.socket.options;return this.scheme()+"://"+a.host+":"+a.port+"/"+a.resource+"/"+b.protocol+"/"+this.name+"/"+this.sessid},c.prototype.ready=function(a,b){b.call(this)}}("undefined"!=typeof io?io:module.exports,"undefined"!=typeof io?io:module.parent.exports),function(a,b,c){function d(a){this.options={port:80,secure:!1,document:"document"in c?document:!1,resource:"socket.io",transports:b.transports,"connect timeout":1e4,"try multiple transports":!0,reconnect:!0,"reconnection delay":500,"reconnection limit":Infinity,"reopen delay":3e3,"max reconnection attempts":10,"sync disconnect on unload":!1,"auto connect":!0,"flash policy port":10843,manualFlush:!1},b.util.merge(this.options,a),this.connected=!1,this.open=!1,this.connecting=!1,this.reconnecting=!1,this.namespaces={},this.buffer=[],this.doBuffer=!1;if(this.options["sync disconnect on unload"]&&(!this.isXDomain()||b.util.ua.hasCORS)){var d=this;b.util.on(c,"beforeunload",function(){d.disconnectSync()},!1)}this.options["auto connect"]&&this.connect()}function e(){}a.Socket=d,b.util.mixin(d,b.EventEmitter),d.prototype.of=function(a){return this.namespaces[a]||(this.namespaces[a]=new b.SocketNamespace(this,a),a!==""&&this.namespaces[a].packet({type:"connect"})),this.namespaces[a]},d.prototype.publish=function(){this.emit.apply(this,arguments);var a;for(var b in this.namespaces)this.namespaces.hasOwnProperty(b)&&(a=this.of(b),a.$emit.apply(a,arguments))},d.prototype.handshake=function(a){function f(b){b instanceof Error?(c.connecting=!1,c.onError(b.message)):a.apply(null,b.split(":"))}var c=this,d=this.options,g=["http"+(d.secure?"s":"")+":/",d.host+":"+d.port,d.resource,b.protocol,b.util.query(this.options.query,"t="+ +(new Date))].join("/");if(this.isXDomain()&&!b.util.ua.hasCORS){var h=document.getElementsByTagName("script")[0],i=document.createElement("script");i.src=g+"&jsonp="+b.j.length,h.parentNode.insertBefore(i,h),b.j.push(function(a){f(a),i.parentNode.removeChild(i)})}else{var j=b.util.request();j.open("GET",g,!0),this.isXDomain()&&(j.withCredentials=!0),j.onreadystatechange=function(){j.readyState==4&&(j.onreadystatechange=e,j.status==200?f(j.responseText):j.status==403?c.onError(j.responseText):(c.connecting=!1,!c.reconnecting&&c.onError(j.responseText)))},j.send(null)}},d.prototype.getTransport=function(a){var c=a||this.transports,d;for(var e=0,f;f=c[e];e++)if(b.Transport[f]&&b.Transport[f].check(this)&&(!this.isXDomain()||b.Transport[f].xdomainCheck(this)))return new b.Transport[f](this,this.sessionid);return null},d.prototype.connect=function(a){if(this.connecting)return this;var c=this;return c.connecting=!0,this.handshake(function(d,e,f,g){function h(a){c.transport&&c.transport.clearTimeouts(),c.transport=c.getTransport(a);if(!c.transport)return c.publish("connect_failed");c.transport.ready(c,function(){c.connecting=!0,c.publish("connecting",c.transport.name),c.transport.open(),c.options["connect timeout"]&&(c.connectTimeoutTimer=setTimeout(function(){if(!c.connected){c.connecting=!1;if(c.options["try multiple transports"]){var a=c.transports;while(a.length>0&&a.splice(0,1)[0]!=c.transport.name);a.length?h(a):c.publish("connect_failed")}}},c.options["connect timeout"]))})}c.sessionid=d,c.closeTimeout=f*1e3,c.heartbeatTimeout=e*1e3,c.transports||(c.transports=c.origTransports=g?b.util.intersect(g.split(","),c.options.transports):c.options.transports),c.setHeartbeatTimeout(),h(c.transports),c.once("connect",function(){clearTimeout(c.connectTimeoutTimer),a&&typeof a=="function"&&a()})}),this},d.prototype.setHeartbeatTimeout=function(){clearTimeout(this.heartbeatTimeoutTimer);if(this.transport&&!this.transport.heartbeats())return;var a=this;this.heartbeatTimeoutTimer=setTimeout(function(){a.transport.onClose()},this.heartbeatTimeout)},d.prototype.packet=function(a){return this.connected&&!this.doBuffer?this.transport.packet(a):this.buffer.push(a),this},d.prototype.setBuffer=function(a){this.doBuffer=a,!a&&this.connected&&this.buffer.length&&(this.options.manualFlush||this.flushBuffer())},d.prototype.flushBuffer=function(){this.transport.payload(this.buffer),this.buffer=[]},d.prototype.disconnect=function(){if(this.connected||this.connecting)this.open&&this.of("").packet({type:"disconnect"}),this.onDisconnect("booted");return this},d.prototype.disconnectSync=function(){var a=b.util.request(),c=["http"+(this.options.secure?"s":"")+":/",this.options.host+":"+this.options.port,this.options.resource,b.protocol,"",this.sessionid].join("/")+"/?disconnect=1";a.open("GET",c,!1),a.send(null),this.onDisconnect("booted")},d.prototype.isXDomain=function(){var a=c.location.port||("https:"==c.location.protocol?443:80);return this.options.host!==c.location.hostname||this.options.port!=a},d.prototype.onConnect=function(){this.connected||(this.connected=!0,this.connecting=!1,this.doBuffer||this.setBuffer(!1),this.emit("connect"))},d.prototype.onOpen=function(){this.open=!0},d.prototype.onClose=function(){this.open=!1,clearTimeout(this.heartbeatTimeoutTimer)},d.prototype.onPacket=function(a){this.of(a.endpoint).onPacket(a)},d.prototype.onError=function(a){a&&a.advice&&a.advice==="reconnect"&&(this.connected||this.connecting)&&(this.disconnect(),this.options.reconnect&&this.reconnect()),this.publish("error",a&&a.reason?a.reason:a)},d.prototype.onDisconnect=function(a){var b=this.connected,c=this.connecting;this.connected=!1,this.connecting=!1,this.open=!1;if(b||c)this.transport.close(),this.transport.clearTimeouts(),b&&(this.publish("disconnect",a),"booted"!=a&&this.options.reconnect&&!this.reconnecting&&this.reconnect())},d.prototype.reconnect=function(){function e(){if(a.connected){for(var b in a.namespaces)a.namespaces.hasOwnProperty(b)&&""!==b&&a.namespaces[b].packet({type:"connect"});a.publish("reconnect",a.transport.name,a.reconnectionAttempts)}clearTimeout(a.reconnectionTimer),a.removeListener("connect_failed",f),a.removeListener("connect",f),a.reconnecting=!1,delete a.reconnectionAttempts,delete a.reconnectionDelay,delete a.reconnectionTimer,delete a.redoTransports,a.options["try multiple transports"]=c}function f(){if(!a.reconnecting)return;if(a.connected)return e();if(a.connecting&&a.reconnecting)return a.reconnectionTimer=setTimeout(f,1e3);a.reconnectionAttempts++>=b?a.redoTransports?(a.publish("reconnect_failed"),e()):(a.on("connect_failed",f),a.options["try multiple transports"]=!0,a.transports=a.origTransports,a.transport=a.getTransport(),a.redoTransports=!0,a.connect()):(a.reconnectionDelay<d&&(a.reconnectionDelay*=2),a.connect(),a.publish("reconnecting",a.reconnectionDelay,a.reconnectionAttempts),a.reconnectionTimer=setTimeout(f,a.reconnectionDelay))}this.reconnecting=!0,this.reconnectionAttempts=0,this.reconnectionDelay=this.options["reconnection delay"];var a=this,b=this.options["max reconnection attempts"],c=this.options["try multiple transports"],d=this.options["reconnection limit"];this.options["try multiple transports"]=!1,this.reconnectionTimer=setTimeout(f,this.reconnectionDelay),this.on("connect",f)}}("undefined"!=typeof io?io:module.exports,"undefined"!=typeof io?io:module.parent.exports,this),function(a,b){function c(a,b){this.socket=a,this.name=b||"",this.flags={},this.json=new d(this,"json"),this.ackPackets=0,this.acks={}}function d(a,b){this.namespace=a,this.name=b}a.SocketNamespace=c,b.util.mixin(c,b.EventEmitter),c.prototype.$emit=b.EventEmitter.prototype.emit,c.prototype.of=function(){return this.socket.of.apply(this.socket,arguments)},c.prototype.packet=function(a){return a.endpoint=this.name,this.socket.packet(a),this.flags={},this},c.prototype.send=function(a,b){var c={type:this.flags.json?"json":"message",data:a};return"function"==typeof b&&(c.id=++this.ackPackets,c.ack=!0,this.acks[c.id]=b),this.packet(c)},c.prototype.emit=function(a){var b=Array.prototype.slice.call(arguments,1),c=b[b.length-1],d={type:"event",name:a};return"function"==typeof c&&(d.id=++this.ackPackets,d.ack="data",this.acks[d.id]=c,b=b.slice(0,b.length-1)),d.args=b,this.packet(d)},c.prototype.disconnect=function(){return this.name===""?this.socket.disconnect():(this.packet({type:"disconnect"}),this.$emit("disconnect")),this},c.prototype.onPacket=function(a){function d(){c.packet({type:"ack",args:b.util.toArray(arguments),ackId:a.id})}var c=this;switch(a.type){case"connect":this.$emit("connect");break;case"disconnect":this.name===""?this.socket.onDisconnect(a.reason||"booted"):this.$emit("disconnect",a.reason);break;case"message":case"json":var e=["message",a.data];a.ack=="data"?e.push(d):a.ack&&this.packet({type:"ack",ackId:a.id}),this.$emit.apply(this,e);break;case"event":var e=[a.name].concat(a.args);a.ack=="data"&&e.push(d),this.$emit.apply(this,e);break;case"ack":this.acks[a.ackId]&&(this.acks[a.ackId].apply(this,a.args),delete this.acks[a.ackId]);break;case"error":a.advice?this.socket.onError(a):a.reason=="unauthorized"?this.$emit("connect_failed",a.reason):this.$emit("error",a.reason)}},d.prototype.send=function(){this.namespace.flags[this.name]=!0,this.namespace.send.apply(this.namespace,arguments)},d.prototype.emit=function(){this.namespace.flags[this.name]=!0,this.namespace.emit.apply(this.namespace,arguments)}}("undefined"!=typeof io?io:module.exports,"undefined"!=typeof io?io:module.parent.exports),function(a,b,c){function d(a){b.Transport.apply(this,arguments)}a.websocket=d,b.util.inherit(d,b.Transport),d.prototype.name="websocket",d.prototype.open=function(){var a=b.util.query(this.socket.options.query),d=this,e;return e||(e=c.MozWebSocket||c.WebSocket),this.websocket=new e(this.prepareUrl()+a),this.websocket.onopen=function(){d.onOpen(),d.socket.setBuffer(!1)},this.websocket.onmessage=function(a){d.onData(a.data)},this.websocket.onclose=function(){d.onClose(),d.socket.setBuffer(!0)},this.websocket.onerror=function(a){d.onError(a)},this},b.util.ua.iDevice?d.prototype.send=function(a){var b=this;return setTimeout(function(){b.websocket.send(a)},0),this}:d.prototype.send=function(a){return this.websocket.send(a),this},d.prototype.payload=function(a){for(var b=0,c=a.length;b<c;b++)this.packet(a[b]);return this},d.prototype.close=function(){return this.websocket.close(),this},d.prototype.onError=function(a){this.socket.onError(a)},d.prototype.scheme=function(){return this.socket.options.secure?"wss":"ws"},d.check=function(){return"WebSocket"in c&&!("__addTask"in WebSocket)||"MozWebSocket"in c},d.xdomainCheck=function(){return!0},b.transports.push("websocket")}("undefined"!=typeof io?io.Transport:module.exports,"undefined"!=typeof io?io:module.parent.exports,this),function(a,b){function c(){b.Transport.websocket.apply(this,arguments)}a.flashsocket=c,b.util.inherit(c,b.Transport.websocket),c.prototype.name="flashsocket",c.prototype.open=function(){var a=this,c=arguments;return WebSocket.__addTask(function(){b.Transport.websocket.prototype.open.apply(a,c)}),this},c.prototype.send=function(){var a=this,c=arguments;return WebSocket.__addTask(function(){b.Transport.websocket.prototype.send.apply(a,c)}),this},c.prototype.close=function(){return WebSocket.__tasks.length=0,b.Transport.websocket.prototype.close.call(this),this},c.prototype.ready=function(a,d){function e(){var b=a.options,e=b["flash policy port"],g=["http"+(b.secure?"s":"")+":/",b.host+":"+b.port,b.resource,"static/flashsocket","WebSocketMain"+(a.isXDomain()?"Insecure":"")+".swf"];c.loaded||(typeof WEB_SOCKET_SWF_LOCATION=="undefined"&&(WEB_SOCKET_SWF_LOCATION=g.join("/")),e!==843&&WebSocket.loadFlashPolicyFile("xmlsocket://"+b.host+":"+e),WebSocket.__initialize(),c.loaded=!0),d.call(f)}var f=this;if(document.body)return e();b.util.load(e)},c.check=function(){return typeof WebSocket!="undefined"&&"__initialize"in WebSocket&&!!swfobject?swfobject.getFlashPlayerVersion().major>=10:!1},c.xdomainCheck=function(){return!0},typeof window!="undefined"&&(WEB_SOCKET_DISABLE_AUTO_INITIALIZATION=!0),b.transports.push("flashsocket")}("undefined"!=typeof io?io.Transport:module.exports,"undefined"!=typeof io?io:module.parent.exports);if("undefined"!=typeof window)var swfobject=function(){function A(){if(t)return;try{var a=i.getElementsByTagName("body")[0].appendChild(Q("span"));a.parentNode.removeChild(a)}catch(b){return}t=!0;var c=l.length;for(var d=0;d<c;d++)l[d]()}function B(a){t?a():l[l.length]=a}function C(b){if(typeof h.addEventListener!=a)h.addEventListener("load",b,!1);else if(typeof i.addEventListener!=a)i.addEventListener("load",b,!1);else if(typeof h.attachEvent!=a)R(h,"onload",b);else if(typeof h.onload=="function"){var c=h.onload;h.onload=function(){c(),b()}}else h.onload=b}function D(){k?E():F()}function E(){var c=i.getElementsByTagName("body")[0],d=Q(b);d.setAttribute("type",e);var f=c.appendChild(d);if(f){var g=0;(function(){if(typeof f.GetVariable!=a){var b=f.GetVariable("$version");b&&(b=b.split(" ")[1].split(","),y.pv=[parseInt(b[0],10),parseInt(b[1],10),parseInt(b[2],10)])}else if(g<10){g++,setTimeout(arguments.callee,10);return}c.removeChild(d),f=null,F()})()}else F()}function F(){var b=m.length;if(b>0)for(var c=0;c<b;c++){var d=m[c].id,e=m[c].callbackFn,f={success:!1,id:d};if(y.pv[0]>0){var g=P(d);if(g)if(S(m[c].swfVersion)&&!(y.wk&&y.wk<312))U(d,!0),e&&(f.success=!0,f.ref=G(d),e(f));else if(m[c].expressInstall&&H()){var h={};h.data=m[c].expressInstall,h.width=g.getAttribute("width")||"0",h.height=g.getAttribute("height")||"0",g.getAttribute("class")&&(h.styleclass=g.getAttribute("class")),g.getAttribute("align")&&(h.align=g.getAttribute("align"));var i={},j=g.getElementsByTagName("param"),k=j.length;for(var l=0;l<k;l++)j[l].getAttribute("name").toLowerCase()!="movie"&&(i[j[l].getAttribute("name")]=j[l].getAttribute("value"));I(h,i,d,e)}else J(g),e&&e(f)}else{U(d,!0);if(e){var n=G(d);n&&typeof n.SetVariable!=a&&(f.success=!0,f.ref=n),e(f)}}}}function G(c){var d=null,e=P(c);if(e&&e.nodeName=="OBJECT")if(typeof e.SetVariable!=a)d=e;else{var f=e.getElementsByTagName(b)[0];f&&(d=f)}return d}function H(){return!u&&S("6.0.65")&&(y.win||y.mac)&&!(y.wk&&y.wk<312)}function I(b,c,d,e){u=!0,r=e||null,s={success:!1,id:d};var g=P(d);if(g){g.nodeName=="OBJECT"?(p=K(g),q=null):(p=g,q=d),b.id=f;if(typeof b.width==a||!/%$/.test(b.width)&&parseInt(b.width,10)<310)b.width="310";if(typeof b.height==a||!/%$/.test(b.height)&&parseInt(b.height,10)<137)b.height="137";i.title=i.title.slice(0,47)+" - Flash Player Installation";var j=y.ie&&y.win?["Active"].concat("").join("X"):"PlugIn",k="MMredirectURL="+h.location.toString().replace(/&/g,"%26")+"&MMplayerType="+j+"&MMdoctitle="+i.title;typeof c.flashvars!=a?c.flashvars+="&"+k:c.flashvars=k;if(y.ie&&y.win&&g.readyState!=4){var l=Q("div");d+="SWFObjectNew",l.setAttribute("id",d),g.parentNode.insertBefore(l,g),g.style.display="none",function(){g.readyState==4?g.parentNode.removeChild(g):setTimeout(arguments.callee,10)}()}L(b,c,d)}}function J(a){if(y.ie&&y.win&&a.readyState!=4){var b=Q("div");a.parentNode.insertBefore(b,a),b.parentNode.replaceChild(K(a),b),a.style.display="none",function(){a.readyState==4?a.parentNode.removeChild(a):setTimeout(arguments.callee,10)}()}else a.parentNode.replaceChild(K(a),a)}function K(a){var c=Q("div");if(y.win&&y.ie)c.innerHTML=a.innerHTML;else{var d=a.getElementsByTagName(b)[0];if(d){var e=d.childNodes;if(e){var f=e.length;for(var g=0;g<f;g++)(e[g].nodeType!=1||e[g].nodeName!="PARAM")&&e[g].nodeType!=8&&c.appendChild(e[g].cloneNode(!0))}}}return c}function L(c,d,f){var g,h=P(f);if(y.wk&&y.wk<312)return g;if(h){typeof c.id==a&&(c.id=f);if(y.ie&&y.win){var i="";for(var j in c)c[j]!=Object.prototype[j]&&(j.toLowerCase()=="data"?d.movie=c[j]:j.toLowerCase()=="styleclass"?i+=' class="'+c[j]+'"':j.toLowerCase()!="classid"&&(i+=" "+j+'="'+c[j]+'"'));var k="";for(var l in d)d[l]!=Object.prototype[l]&&(k+='<param name="'+l+'" value="'+d[l]+'" />');h.outerHTML='<object classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"'+i+">"+k+"</object>",n[n.length]=c.id,g=P(c.id)}else{var m=Q(b);m.setAttribute("type",e);for(var o in c)c[o]!=Object.prototype[o]&&(o.toLowerCase()=="styleclass"?m.setAttribute("class",c[o]):o.toLowerCase()!="classid"&&m.setAttribute(o,c[o]));for(var p in d)d[p]!=Object.prototype[p]&&p.toLowerCase()!="movie"&&M(m,p,d[p]);h.parentNode.replaceChild(m,h),g=m}}return g}function M(a,b,c){var d=Q("param");d.setAttribute("name",b),d.setAttribute("value",c),a.appendChild(d)}function N(a){var b=P(a);b&&b.nodeName=="OBJECT"&&(y.ie&&y.win?(b.style.display="none",function(){b.readyState==4?O(a):setTimeout(arguments.callee,10)}()):b.parentNode.removeChild(b))}function O(a){var b=P(a);if(b){for(var c in b)typeof b[c]=="function"&&(b[c]=null);b.parentNode.removeChild(b)}}function P(a){var b=null;try{b=i.getElementById(a)}catch(c){}return b}function Q(a){return i.createElement(a)}function R(a,b,c){a.attachEvent(b,c),o[o.length]=[a,b,c]}function S(a){var b=y.pv,c=a.split(".");return c[0]=parseInt(c[0],10),c[1]=parseInt(c[1],10)||0,c[2]=parseInt(c[2],10)||0,b[0]>c[0]||b[0]==c[0]&&b[1]>c[1]||b[0]==c[0]&&b[1]==c[1]&&b[2]>=c[2]?!0:!1}function T(c,d,e,f){if(y.ie&&y.mac)return;var g=i.getElementsByTagName("head")[0];if(!g)return;var h=e&&typeof e=="string"?e:"screen";f&&(v=null,w=null);if(!v||w!=h){var j=Q("style");j.setAttribute("type","text/css"),j.setAttribute("media",h),v=g.appendChild(j),y.ie&&y.win&&typeof i.styleSheets!=a&&i.styleSheets.length>0&&(v=i.styleSheets[i.styleSheets.length-1]),w=h}y.ie&&y.win?v&&typeof v.addRule==b&&v.addRule(c,d):v&&typeof i.createTextNode!=a&&v.appendChild(i.createTextNode(c+" {"+d+"}"))}function U(a,b){if(!x)return;var c=b?"visible":"hidden";t&&P(a)?P(a).style.visibility=c:T("#"+a,"visibility:"+c)}function V(b){var c=/[\\\"<>\.;]/,d=c.exec(b)!=null;return d&&typeof encodeURIComponent!=a?encodeURIComponent(b):b}var a="undefined",b="object",c="Shockwave Flash",d="ShockwaveFlash.ShockwaveFlash",e="application/x-shockwave-flash",f="SWFObjectExprInst",g="onreadystatechange",h=window,i=document,j=navigator,k=!1,l=[D],m=[],n=[],o=[],p,q,r,s,t=!1,u=!1,v,w,x=!0,y=function(){var f=typeof i.getElementById!=a&&typeof i.getElementsByTagName!=a&&typeof i.createElement!=a,g=j.userAgent.toLowerCase(),l=j.platform.toLowerCase(),m=l?/win/.test(l):/win/.test(g),n=l?/mac/.test(l):/mac/.test(g),o=/webkit/.test(g)?parseFloat(g.replace(/^.*webkit\/(\d+(\.\d+)?).*$/,"$1")):!1,p=!1,q=[0,0,0],r=null;if(typeof j.plugins!=a&&typeof j.plugins[c]==b)r=j.plugins[c].description,r&&(typeof j.mimeTypes==a||!j.mimeTypes[e]||!!j.mimeTypes[e].enabledPlugin)&&(k=!0,p=!1,r=r.replace(/^.*\s+(\S+\s+\S+$)/,"$1"),q[0]=parseInt(r.replace(/^(.*)\..*$/,"$1"),10),q[1]=parseInt(r.replace(/^.*\.(.*)\s.*$/,"$1"),10),q[2]=/[a-zA-Z]/.test(r)?parseInt(r.replace(/^.*[a-zA-Z]+(.*)$/,"$1"),10):0);else if(typeof h[["Active"].concat("Object").join("X")]!=a)try{var s=new(window[["Active"].concat("Object").join("X")])(d);s&&(r=s.GetVariable("$version"),r&&(p=!0,r=r.split(" ")[1].split(","),q=[parseInt(r[0],10),parseInt(r[1],10),parseInt(r[2],10)]))}catch(t){}return{w3:f,pv:q,wk:o,ie:p,win:m,mac:n}}(),z=function(){if(!y.w3)return;(typeof i.readyState!=a&&i.readyState=="complete"||typeof i.readyState==a&&(i.getElementsByTagName("body")[0]||i.body))&&A(),t||(typeof i.addEventListener!=a&&i.addEventListener("DOMContentLoaded",A,!1),y.ie&&y.win&&(i.attachEvent(g,function(){i.readyState=="complete"&&(i.detachEvent(g,arguments.callee),A())}),h==top&&function(){if(t)return;try{i.documentElement.doScroll("left")}catch(a){setTimeout(arguments.callee,0);return}A()}()),y.wk&&function(){if(t)return;if(!/loaded|complete/.test(i.readyState)){setTimeout(arguments.callee,0);return}A()}(),C(A))}(),W=function(){y.ie&&y.win&&window.attachEvent("onunload",function(){var a=o.length;for(var b=0;b<a;b++)o[b][0].detachEvent(o[b][1],o[b][2]);var c=n.length;for(var d=0;d<c;d++)N(n[d]);for(var e in y)y[e]=null;y=null;for(var f in swfobject)swfobject[f]=null;swfobject=null})}();return{registerObject:function(a,b,c,d){if(y.w3&&a&&b){var e={};e.id=a,e.swfVersion=b,e.expressInstall=c,e.callbackFn=d,m[m.length]=e,U(a,!1)}else d&&d({success:!1,id:a})},getObjectById:function(a){if(y.w3)return G(a)},embedSWF:function(c,d,e,f,g,h,i,j,k,l){var m={success:!1,id:d};y.w3&&!(y.wk&&y.wk<312)&&c&&d&&e&&f&&g?(U(d,!1),B(function(){e+="",f+="";var n={};if(k&&typeof k===b)for(var o in k)n[o]=k[o];n.data=c,n.width=e,n.height=f;var p={};if(j&&typeof j===b)for(var q in j)p[q]=j[q];if(i&&typeof i===b)for(var r in i)typeof p.flashvars!=a?p.flashvars+="&"+r+"="+i[r]:p.flashvars=r+"="+i[r];if(S(g)){var s=L(n,p,d);n.id==d&&U(d,!0),m.success=!0,m.ref=s}else{if(h&&H()){n.data=h,I(n,p,d,l);return}U(d,!0)}l&&l(m)})):l&&l(m)},switchOffAutoHideShow:function(){x=!1},ua:y,getFlashPlayerVersion:function(){return{major:y.pv[0],minor:y.pv[1],release:y.pv[2]}},hasFlashPlayerVersion:S,createSWF:function(a,b,c){return y.w3?L(a,b,c):undefined},showExpressInstall:function(a,b,c,d){y.w3&&H()&&I(a,b,c,d)},removeSWF:function(a){y.w3&&N(a)},createCSS:function(a,b,c,d){y.w3&&T(a,b,c,d)},addDomLoadEvent:B,addLoadEvent:C,getQueryParamValue:function(a){var b=i.location.search||i.location.hash;if(b){/\?/.test(b)&&(b=b.split("?")[1]);if(a==null)return V(b);var c=b.split("&");for(var d=0;d<c.length;d++)if(c[d].substring(0,c[d].indexOf("="))==a)return V(c[d].substring(c[d].indexOf("=")+1))}return""},expressInstallCallback:function(){if(u){var a=P(f);a&&p&&(a.parentNode.replaceChild(p,a),q&&(U(q,!0),y.ie&&y.win&&(p.style.display="block")),r&&r(s)),u=!1}}}}();(function(){if("undefined"==typeof window||window.WebSocket)return;var a=window.console;if(!a||!a.log||!a.error)a={log:function(){},error:function(){}};if(!swfobject.hasFlashPlayerVersion("10.0.0")){a.error("Flash Player >= 10.0.0 is required.");return}location.protocol=="file:"&&a.error("WARNING: web-socket-js doesn't work in file:///... URL unless you set Flash Security Settings properly. Open the page via Web server i.e. http://..."),WebSocket=function(a,b,c,d,e){var f=this;f.__id=WebSocket.__nextId++,WebSocket.__instances[f.__id]=f,f.readyState=WebSocket.CONNECTING,f.bufferedAmount=0,f.__events={},b?typeof b=="string"&&(b=[b]):b=[],setTimeout(function(){WebSocket.__addTask(function(){WebSocket.__flash.create(f.__id,a,b,c||null,d||0,e||null)})},0)},WebSocket.prototype.send=function(a){if(this.readyState==WebSocket.CONNECTING)throw"INVALID_STATE_ERR: Web Socket connection has not been established";var b=WebSocket.__flash.send(this.__id,encodeURIComponent(a));return b<0?!0:(this.bufferedAmount+=b,!1)},WebSocket.prototype.close=function(){if(this.readyState==WebSocket.CLOSED||this.readyState==WebSocket.CLOSING)return;this.readyState=WebSocket.CLOSING,WebSocket.__flash.close(this.__id)},WebSocket.prototype.addEventListener=function(a,b,c){a in this.__events||(this.__events[a]=[]),this.__events[a].push(b)},WebSocket.prototype.removeEventListener=function(a,b,c){if(!(a in this.__events))return;var d=this.__events[a];for(var e=d.length-1;e>=0;--e)if(d[e]===b){d.splice(e,1);break}},WebSocket.prototype.dispatchEvent=function(a){var b=this.__events[a.type]||[];for(var c=0;c<b.length;++c)b[c](a);var d=this["on"+a.type];d&&d(a)},WebSocket.prototype.__handleEvent=function(a){"readyState"in a&&(this.readyState=a.readyState),"protocol"in a&&(this.protocol=a.protocol);var b;if(a.type=="open"||a.type=="error")b=this.__createSimpleEvent(a.type);else if(a.type=="close")b=this.__createSimpleEvent("close");else{if(a.type!="message")throw"unknown event type: "+a.type;var c=decodeURIComponent(a.message);b=this.__createMessageEvent("message",c)}this.dispatchEvent(b)},WebSocket.prototype.__createSimpleEvent=function(a){if(document.createEvent&&window.Event){var b=document.createEvent("Event");return b.initEvent(a,!1,!1),b}return{type:a,bubbles:!1,cancelable:!1}},WebSocket.prototype.__createMessageEvent=function(a,b){if(document.createEvent&&window.MessageEvent&&!window.opera){var c=document.createEvent("MessageEvent");return c.initMessageEvent("message",!1,!1,b,null,null,window,null),c}return{type:a,data:b,bubbles:!1,cancelable:!1}},WebSocket.CONNECTING=0,WebSocket.OPEN=1,WebSocket.CLOSING=2,WebSocket.CLOSED=3,WebSocket.__flash=null,WebSocket.__instances={},WebSocket.__tasks=[],WebSocket.__nextId=0,WebSocket.loadFlashPolicyFile=function(a){WebSocket.__addTask(function(){WebSocket.__flash.loadManualPolicyFile(a)})},WebSocket.__initialize=function(){if(WebSocket.__flash)return;WebSocket.__swfLocation&&(window.WEB_SOCKET_SWF_LOCATION=WebSocket.__swfLocation);if(!window.WEB_SOCKET_SWF_LOCATION){a.error("[WebSocket] set WEB_SOCKET_SWF_LOCATION to location of WebSocketMain.swf");return}var b=document.createElement("div");b.id="webSocketContainer",b.style.position="absolute",WebSocket.__isFlashLite()?(b.style.left="0px",b.style.top="0px"):(b.style.left="-100px",b.style.top="-100px");var c=document.createElement("div");c.id="webSocketFlash",b.appendChild(c),document.body.appendChild(b),swfobject.embedSWF(WEB_SOCKET_SWF_LOCATION,"webSocketFlash","1","1","10.0.0",null,null,{hasPriority:!0,swliveconnect:!0,allowScriptAccess:"always"},null,function(b){b.success||a.error("[WebSocket] swfobject.embedSWF failed")})},WebSocket.__onFlashInitialized=function(){setTimeout(function(){WebSocket.__flash=document.getElementById("webSocketFlash"),WebSocket.__flash.setCallerUrl(location.href),WebSocket.__flash.setDebug(!!window.WEB_SOCKET_DEBUG);for(var a=0;a<WebSocket.__tasks.length;++a)WebSocket.__tasks[a]();WebSocket.__tasks=[]},0)},WebSocket.__onFlashEvent=function(){return setTimeout(function(){try{var b=WebSocket.__flash.receiveEvents();for(var c=0;c<b.length;++c)WebSocket.__instances[b[c].webSocketId].__handleEvent(b[c])}catch(d){a.error(d)}},0),!0},WebSocket.__log=function(b){a.log(decodeURIComponent(b))},WebSocket.__error=function(b){a.error(decodeURIComponent(b))},WebSocket.__addTask=function(a){WebSocket.__flash?a():WebSocket.__tasks.push(a)},WebSocket.__isFlashLite=function(){if(!window.navigator||!window.navigator.mimeTypes)return!1;var a=window.navigator.mimeTypes["application/x-shockwave-flash"];return!a||!a.enabledPlugin||!a.enabledPlugin.filename?!1:a.enabledPlugin.filename.match(/flashlite/i)?!0:!1},window.WEB_SOCKET_DISABLE_AUTO_INITIALIZATION||(window.addEventListener?window.addEventListener("load",function(){WebSocket.__initialize()},!1):window.attachEvent("onload",function(){WebSocket.__initialize()}))})(),function(a,b,c){function d(a){if(!a)return;b.Transport.apply(this,arguments),this.sendBuffer=[]}function e(){}a.XHR=d,b.util.inherit(d,b.Transport),d.prototype.open=function(){return this.socket.setBuffer(!1),this.onOpen(),this.get(),this.setCloseTimeout(),this},d.prototype.payload=function(a){var c=[];for(var d=0,e=a.length;d<e;d++)c.push(b.parser.encodePacket(a[d]));this.send(b.parser.encodePayload(c))},d.prototype.send=function(a){return this.post(a),this},d.prototype.post=function(a){function d(){this.readyState==4&&(this.onreadystatechange=e,b.posting=!1,this.status==200?b.socket.setBuffer(!1):b.onClose())}function f(){this.onload=e,b.socket.setBuffer(!1)}var b=this;this.socket.setBuffer(!0),this.sendXHR=this.request("POST"),c.XDomainRequest&&this.sendXHR instanceof XDomainRequest?this.sendXHR.onload=this.sendXHR.onerror=f:this.sendXHR.onreadystatechange=d,this.sendXHR.send(a)},d.prototype.close=function(){return this.onClose(),this},d.prototype.request=function(a){var c=b.util.request(this.socket.isXDomain()),d=b.util.query(this.socket.options.query,"t="+ +(new Date));c.open(a||"GET",this.prepareUrl()+d,!0);if(a=="POST")try{c.setRequestHeader?c.setRequestHeader("Content-type","text/plain;charset=UTF-8"):c.contentType="text/plain"}catch(e){}return c},d.prototype.scheme=function(){return this.socket.options.secure?"https":"http"},d.check=function(a,d){try{var e=b.util.request(d),f=c.XDomainRequest&&e instanceof XDomainRequest,g=a&&a.options&&a.options.secure?"https:":"http:",h=c.location&&g!=c.location.protocol;if(e&&(!f||!h))return!0}catch(i){}return!1},d.xdomainCheck=function(a){return d.check(a,!0)}}("undefined"!=typeof io?io.Transport:module.exports,"undefined"!=typeof io?io:module.parent.exports,this),function(a,b){function c(a){b.Transport.XHR.apply(this,arguments)}a.htmlfile=c,b.util.inherit(c,b.Transport.XHR),c.prototype.name="htmlfile",c.prototype.get=function(){this.doc=new(window[["Active"].concat("Object").join("X")])("htmlfile"),this.doc.open(),this.doc.write("<html></html>"),this.doc.close(),this.doc.parentWindow.s=this;var a=this.doc.createElement("div");a.className="socketio",this.doc.body.appendChild(a),this.iframe=this.doc.createElement("iframe"),a.appendChild(this.iframe);var c=this,d=b.util.query(this.socket.options.query,"t="+ +(new Date));this.iframe.src=this.prepareUrl()+d,b.util.on(window,"unload",function(){c.destroy()})},c.prototype._=function(a,b){this.onData(a);try{var c=b.getElementsByTagName("script")[0];c.parentNode.removeChild(c)}catch(d){}},c.prototype.destroy=function(){if(this.iframe){try{this.iframe.src="about:blank"}catch(a){}this.doc=null,this.iframe.parentNode.removeChild(this.iframe),this.iframe=null,CollectGarbage()}},c.prototype.close=function(){return this.destroy(),b.Transport.XHR.prototype.close.call(this)},c.check=function(a){if(typeof window!="undefined"&&["Active"].concat("Object").join("X")in window)try{var c=new(window[["Active"].concat("Object").join("X")])("htmlfile");return c&&b.Transport.XHR.check(a)}catch(d){}return!1},c.xdomainCheck=function(){return!1},b.transports.push("htmlfile")}("undefined"!=typeof io?io.Transport:module.exports,"undefined"!=typeof io?io:module.parent.exports),function(a,b,c){function d(){b.Transport.XHR.apply(this,arguments)}function e(){}a["xhr-polling"]=d,b.util.inherit(d,b.Transport.XHR),b.util.merge(d,b.Transport.XHR),d.prototype.name="xhr-polling",d.prototype.heartbeats=function(){return!1},d.prototype.open=function(){var a=this;return b.Transport.XHR.prototype.open.call(a),!1},d.prototype.get=function(){function b(){this.readyState==4&&(this.onreadystatechange=e,this.status==200?(a.onData(this.responseText),a.get()):a.onClose())}function d(){this.onload=e,this.onerror=e,a.retryCounter=1,a.onData(this.responseText),a.get()}function f(){a.retryCounter++,!a.retryCounter||a.retryCounter>3?a.onClose():a.get()}if(!this.isOpen)return;var a=this;this.xhr=this.request(),c.XDomainRequest&&this.xhr instanceof XDomainRequest?(this.xhr.onload=d,this.xhr.onerror=f):this.xhr.onreadystatechange=b,this.xhr.send(null)},d.prototype.onClose=function(){b.Transport.XHR.prototype.onClose.call(this);if(this.xhr){this.xhr.onreadystatechange=this.xhr.onload=this.xhr.onerror=e;try{this.xhr.abort()}catch(a){}this.xhr=null}},d.prototype.ready=function(a,c){var d=this;b.util.defer(function(){c.call(d)})},b.transports.push("xhr-polling")}("undefined"!=typeof io?io.Transport:module.exports,"undefined"!=typeof io?io:module.parent.exports,this),function(a,b,c){function e(a){b.Transport["xhr-polling"].apply(this,arguments),this.index=b.j.length;var c=this;b.j.push(function(a){c._(a)})}var d=c.document&&"MozAppearance"in c.document.documentElement.style;a["jsonp-polling"]=e,b.util.inherit(e,b.Transport["xhr-polling"]),e.prototype.name="jsonp-polling",e.prototype.post=function(a){function i(){j(),c.socket.setBuffer(!1)}function j(){c.iframe&&c.form.removeChild(c.iframe);try{h=document.createElement('<iframe name="'+c.iframeId+'">')}catch(a){h=document.createElement("iframe"),h.name=c.iframeId}h.id=c.iframeId,c.form.appendChild(h),c.iframe=h}var c=this,d=b.util.query(this.socket.options.query,"t="+ +(new Date)+"&i="+this.index);if(!this.form){var e=document.createElement("form"),f=document.createElement("textarea"),g=this.iframeId="socketio_iframe_"+this.index,h;e.className="socketio",e.style.position="absolute",e.style.top="0px",e.style.left="0px",e.style.display="none",e.target=g,e.method="POST",e.setAttribute("accept-charset","utf-8"),f.name="d",e.appendChild(f),document.body.appendChild(e),this.form=e,this.area=f}this.form.action=this.prepareUrl()+d,j(),this.area.value=b.JSON.stringify(a);try{this.form.submit()}catch(k){}this.iframe.attachEvent?h.onreadystatechange=function(){c.iframe.readyState=="complete"&&i()}:this.iframe.onload=i,this.socket.setBuffer(!0)},e.prototype.get=function(){var a=this,c=document.createElement("script"),e=b.util.query(this.socket.options.query,"t="+ +(new Date)+"&i="+this.index);this.script&&(this.script.parentNode.removeChild(this.script),this.script=null),c.async=!0,c.src=this.prepareUrl()+e,c.onerror=function(){a.onClose()};var f=document.getElementsByTagName("script")[0];f.parentNode.insertBefore(c,f),this.script=c,d&&setTimeout(function(){var a=document.createElement("iframe");document.body.appendChild(a),document.body.removeChild(a)},100)},e.prototype._=function(a){return this.onData(a),this.isOpen&&this.get(),this},e.prototype.ready=function(a,c){var e=this;if(!d)return c.call(this);b.util.load(function(){c.call(e)})},e.check=function(){return"document"in c},e.xdomainCheck=function(){return!0},b.transports.push("jsonp-polling")}("undefined"!=typeof io?io.Transport:module.exports,"undefined"!=typeof io?io:module.parent.exports,this),typeof define=="function"&&define.amd&&define([],function(){return io})})()
},{}],12:[function(require,module,exports){
(function(){(function(){var n=this,t=n._,r={},e=Array.prototype,u=Object.prototype,i=Function.prototype,a=e.push,o=e.slice,c=e.concat,l=u.toString,f=u.hasOwnProperty,s=e.forEach,p=e.map,h=e.reduce,v=e.reduceRight,d=e.filter,g=e.every,m=e.some,y=e.indexOf,b=e.lastIndexOf,x=Array.isArray,_=Object.keys,j=i.bind,w=function(n){return n instanceof w?n:this instanceof w?(this._wrapped=n,void 0):new w(n)};"undefined"!=typeof exports?("undefined"!=typeof module&&module.exports&&(exports=module.exports=w),exports._=w):n._=w,w.VERSION="1.4.4";var A=w.each=w.forEach=function(n,t,e){if(null!=n)if(s&&n.forEach===s)n.forEach(t,e);else if(n.length===+n.length){for(var u=0,i=n.length;i>u;u++)if(t.call(e,n[u],u,n)===r)return}else for(var a in n)if(w.has(n,a)&&t.call(e,n[a],a,n)===r)return};w.map=w.collect=function(n,t,r){var e=[];return null==n?e:p&&n.map===p?n.map(t,r):(A(n,function(n,u,i){e[e.length]=t.call(r,n,u,i)}),e)};var O="Reduce of empty array with no initial value";w.reduce=w.foldl=w.inject=function(n,t,r,e){var u=arguments.length>2;if(null==n&&(n=[]),h&&n.reduce===h)return e&&(t=w.bind(t,e)),u?n.reduce(t,r):n.reduce(t);if(A(n,function(n,i,a){u?r=t.call(e,r,n,i,a):(r=n,u=!0)}),!u)throw new TypeError(O);return r},w.reduceRight=w.foldr=function(n,t,r,e){var u=arguments.length>2;if(null==n&&(n=[]),v&&n.reduceRight===v)return e&&(t=w.bind(t,e)),u?n.reduceRight(t,r):n.reduceRight(t);var i=n.length;if(i!==+i){var a=w.keys(n);i=a.length}if(A(n,function(o,c,l){c=a?a[--i]:--i,u?r=t.call(e,r,n[c],c,l):(r=n[c],u=!0)}),!u)throw new TypeError(O);return r},w.find=w.detect=function(n,t,r){var e;return E(n,function(n,u,i){return t.call(r,n,u,i)?(e=n,!0):void 0}),e},w.filter=w.select=function(n,t,r){var e=[];return null==n?e:d&&n.filter===d?n.filter(t,r):(A(n,function(n,u,i){t.call(r,n,u,i)&&(e[e.length]=n)}),e)},w.reject=function(n,t,r){return w.filter(n,function(n,e,u){return!t.call(r,n,e,u)},r)},w.every=w.all=function(n,t,e){t||(t=w.identity);var u=!0;return null==n?u:g&&n.every===g?n.every(t,e):(A(n,function(n,i,a){return(u=u&&t.call(e,n,i,a))?void 0:r}),!!u)};var E=w.some=w.any=function(n,t,e){t||(t=w.identity);var u=!1;return null==n?u:m&&n.some===m?n.some(t,e):(A(n,function(n,i,a){return u||(u=t.call(e,n,i,a))?r:void 0}),!!u)};w.contains=w.include=function(n,t){return null==n?!1:y&&n.indexOf===y?n.indexOf(t)!=-1:E(n,function(n){return n===t})},w.invoke=function(n,t){var r=o.call(arguments,2),e=w.isFunction(t);return w.map(n,function(n){return(e?t:n[t]).apply(n,r)})},w.pluck=function(n,t){return w.map(n,function(n){return n[t]})},w.where=function(n,t,r){return w.isEmpty(t)?r?null:[]:w[r?"find":"filter"](n,function(n){for(var r in t)if(t[r]!==n[r])return!1;return!0})},w.findWhere=function(n,t){return w.where(n,t,!0)},w.max=function(n,t,r){if(!t&&w.isArray(n)&&n[0]===+n[0]&&65535>n.length)return Math.max.apply(Math,n);if(!t&&w.isEmpty(n))return-1/0;var e={computed:-1/0,value:-1/0};return A(n,function(n,u,i){var a=t?t.call(r,n,u,i):n;a>=e.computed&&(e={value:n,computed:a})}),e.value},w.min=function(n,t,r){if(!t&&w.isArray(n)&&n[0]===+n[0]&&65535>n.length)return Math.min.apply(Math,n);if(!t&&w.isEmpty(n))return 1/0;var e={computed:1/0,value:1/0};return A(n,function(n,u,i){var a=t?t.call(r,n,u,i):n;e.computed>a&&(e={value:n,computed:a})}),e.value},w.shuffle=function(n){var t,r=0,e=[];return A(n,function(n){t=w.random(r++),e[r-1]=e[t],e[t]=n}),e};var k=function(n){return w.isFunction(n)?n:function(t){return t[n]}};w.sortBy=function(n,t,r){var e=k(t);return w.pluck(w.map(n,function(n,t,u){return{value:n,index:t,criteria:e.call(r,n,t,u)}}).sort(function(n,t){var r=n.criteria,e=t.criteria;if(r!==e){if(r>e||r===void 0)return 1;if(e>r||e===void 0)return-1}return n.index<t.index?-1:1}),"value")};var F=function(n,t,r,e){var u={},i=k(t||w.identity);return A(n,function(t,a){var o=i.call(r,t,a,n);e(u,o,t)}),u};w.groupBy=function(n,t,r){return F(n,t,r,function(n,t,r){(w.has(n,t)?n[t]:n[t]=[]).push(r)})},w.countBy=function(n,t,r){return F(n,t,r,function(n,t){w.has(n,t)||(n[t]=0),n[t]++})},w.sortedIndex=function(n,t,r,e){r=null==r?w.identity:k(r);for(var u=r.call(e,t),i=0,a=n.length;a>i;){var o=i+a>>>1;u>r.call(e,n[o])?i=o+1:a=o}return i},w.toArray=function(n){return n?w.isArray(n)?o.call(n):n.length===+n.length?w.map(n,w.identity):w.values(n):[]},w.size=function(n){return null==n?0:n.length===+n.length?n.length:w.keys(n).length},w.first=w.head=w.take=function(n,t,r){return null==n?void 0:null==t||r?n[0]:o.call(n,0,t)},w.initial=function(n,t,r){return o.call(n,0,n.length-(null==t||r?1:t))},w.last=function(n,t,r){return null==n?void 0:null==t||r?n[n.length-1]:o.call(n,Math.max(n.length-t,0))},w.rest=w.tail=w.drop=function(n,t,r){return o.call(n,null==t||r?1:t)},w.compact=function(n){return w.filter(n,w.identity)};var R=function(n,t,r){return A(n,function(n){w.isArray(n)?t?a.apply(r,n):R(n,t,r):r.push(n)}),r};w.flatten=function(n,t){return R(n,t,[])},w.without=function(n){return w.difference(n,o.call(arguments,1))},w.uniq=w.unique=function(n,t,r,e){w.isFunction(t)&&(e=r,r=t,t=!1);var u=r?w.map(n,r,e):n,i=[],a=[];return A(u,function(r,e){(t?e&&a[a.length-1]===r:w.contains(a,r))||(a.push(r),i.push(n[e]))}),i},w.union=function(){return w.uniq(c.apply(e,arguments))},w.intersection=function(n){var t=o.call(arguments,1);return w.filter(w.uniq(n),function(n){return w.every(t,function(t){return w.indexOf(t,n)>=0})})},w.difference=function(n){var t=c.apply(e,o.call(arguments,1));return w.filter(n,function(n){return!w.contains(t,n)})},w.zip=function(){for(var n=o.call(arguments),t=w.max(w.pluck(n,"length")),r=Array(t),e=0;t>e;e++)r[e]=w.pluck(n,""+e);return r},w.object=function(n,t){if(null==n)return{};for(var r={},e=0,u=n.length;u>e;e++)t?r[n[e]]=t[e]:r[n[e][0]]=n[e][1];return r},w.indexOf=function(n,t,r){if(null==n)return-1;var e=0,u=n.length;if(r){if("number"!=typeof r)return e=w.sortedIndex(n,t),n[e]===t?e:-1;e=0>r?Math.max(0,u+r):r}if(y&&n.indexOf===y)return n.indexOf(t,r);for(;u>e;e++)if(n[e]===t)return e;return-1},w.lastIndexOf=function(n,t,r){if(null==n)return-1;var e=null!=r;if(b&&n.lastIndexOf===b)return e?n.lastIndexOf(t,r):n.lastIndexOf(t);for(var u=e?r:n.length;u--;)if(n[u]===t)return u;return-1},w.range=function(n,t,r){1>=arguments.length&&(t=n||0,n=0),r=arguments[2]||1;for(var e=Math.max(Math.ceil((t-n)/r),0),u=0,i=Array(e);e>u;)i[u++]=n,n+=r;return i},w.bind=function(n,t){if(n.bind===j&&j)return j.apply(n,o.call(arguments,1));var r=o.call(arguments,2);return function(){return n.apply(t,r.concat(o.call(arguments)))}},w.partial=function(n){var t=o.call(arguments,1);return function(){return n.apply(this,t.concat(o.call(arguments)))}},w.bindAll=function(n){var t=o.call(arguments,1);return 0===t.length&&(t=w.functions(n)),A(t,function(t){n[t]=w.bind(n[t],n)}),n},w.memoize=function(n,t){var r={};return t||(t=w.identity),function(){var e=t.apply(this,arguments);return w.has(r,e)?r[e]:r[e]=n.apply(this,arguments)}},w.delay=function(n,t){var r=o.call(arguments,2);return setTimeout(function(){return n.apply(null,r)},t)},w.defer=function(n){return w.delay.apply(w,[n,1].concat(o.call(arguments,1)))},w.throttle=function(n,t){var r,e,u,i,a=0,o=function(){a=new Date,u=null,i=n.apply(r,e)};return function(){var c=new Date,l=t-(c-a);return r=this,e=arguments,0>=l?(clearTimeout(u),u=null,a=c,i=n.apply(r,e)):u||(u=setTimeout(o,l)),i}},w.debounce=function(n,t,r){var e,u;return function(){var i=this,a=arguments,o=function(){e=null,r||(u=n.apply(i,a))},c=r&&!e;return clearTimeout(e),e=setTimeout(o,t),c&&(u=n.apply(i,a)),u}},w.once=function(n){var t,r=!1;return function(){return r?t:(r=!0,t=n.apply(this,arguments),n=null,t)}},w.wrap=function(n,t){return function(){var r=[n];return a.apply(r,arguments),t.apply(this,r)}},w.compose=function(){var n=arguments;return function(){for(var t=arguments,r=n.length-1;r>=0;r--)t=[n[r].apply(this,t)];return t[0]}},w.after=function(n,t){return 0>=n?t():function(){return 1>--n?t.apply(this,arguments):void 0}},w.keys=_||function(n){if(n!==Object(n))throw new TypeError("Invalid object");var t=[];for(var r in n)w.has(n,r)&&(t[t.length]=r);return t},w.values=function(n){var t=[];for(var r in n)w.has(n,r)&&t.push(n[r]);return t},w.pairs=function(n){var t=[];for(var r in n)w.has(n,r)&&t.push([r,n[r]]);return t},w.invert=function(n){var t={};for(var r in n)w.has(n,r)&&(t[n[r]]=r);return t},w.functions=w.methods=function(n){var t=[];for(var r in n)w.isFunction(n[r])&&t.push(r);return t.sort()},w.extend=function(n){return A(o.call(arguments,1),function(t){if(t)for(var r in t)n[r]=t[r]}),n},w.pick=function(n){var t={},r=c.apply(e,o.call(arguments,1));return A(r,function(r){r in n&&(t[r]=n[r])}),t},w.omit=function(n){var t={},r=c.apply(e,o.call(arguments,1));for(var u in n)w.contains(r,u)||(t[u]=n[u]);return t},w.defaults=function(n){return A(o.call(arguments,1),function(t){if(t)for(var r in t)null==n[r]&&(n[r]=t[r])}),n},w.clone=function(n){return w.isObject(n)?w.isArray(n)?n.slice():w.extend({},n):n},w.tap=function(n,t){return t(n),n};var I=function(n,t,r,e){if(n===t)return 0!==n||1/n==1/t;if(null==n||null==t)return n===t;n instanceof w&&(n=n._wrapped),t instanceof w&&(t=t._wrapped);var u=l.call(n);if(u!=l.call(t))return!1;switch(u){case"[object String]":return n==t+"";case"[object Number]":return n!=+n?t!=+t:0==n?1/n==1/t:n==+t;case"[object Date]":case"[object Boolean]":return+n==+t;case"[object RegExp]":return n.source==t.source&&n.global==t.global&&n.multiline==t.multiline&&n.ignoreCase==t.ignoreCase}if("object"!=typeof n||"object"!=typeof t)return!1;for(var i=r.length;i--;)if(r[i]==n)return e[i]==t;r.push(n),e.push(t);var a=0,o=!0;if("[object Array]"==u){if(a=n.length,o=a==t.length)for(;a--&&(o=I(n[a],t[a],r,e)););}else{var c=n.constructor,f=t.constructor;if(c!==f&&!(w.isFunction(c)&&c instanceof c&&w.isFunction(f)&&f instanceof f))return!1;for(var s in n)if(w.has(n,s)&&(a++,!(o=w.has(t,s)&&I(n[s],t[s],r,e))))break;if(o){for(s in t)if(w.has(t,s)&&!a--)break;o=!a}}return r.pop(),e.pop(),o};w.isEqual=function(n,t){return I(n,t,[],[])},w.isEmpty=function(n){if(null==n)return!0;if(w.isArray(n)||w.isString(n))return 0===n.length;for(var t in n)if(w.has(n,t))return!1;return!0},w.isElement=function(n){return!(!n||1!==n.nodeType)},w.isArray=x||function(n){return"[object Array]"==l.call(n)},w.isObject=function(n){return n===Object(n)},A(["Arguments","Function","String","Number","Date","RegExp"],function(n){w["is"+n]=function(t){return l.call(t)=="[object "+n+"]"}}),w.isArguments(arguments)||(w.isArguments=function(n){return!(!n||!w.has(n,"callee"))}),"function"!=typeof/./&&(w.isFunction=function(n){return"function"==typeof n}),w.isFinite=function(n){return isFinite(n)&&!isNaN(parseFloat(n))},w.isNaN=function(n){return w.isNumber(n)&&n!=+n},w.isBoolean=function(n){return n===!0||n===!1||"[object Boolean]"==l.call(n)},w.isNull=function(n){return null===n},w.isUndefined=function(n){return n===void 0},w.has=function(n,t){return f.call(n,t)},w.noConflict=function(){return n._=t,this},w.identity=function(n){return n},w.times=function(n,t,r){for(var e=Array(n),u=0;n>u;u++)e[u]=t.call(r,u);return e},w.random=function(n,t){return null==t&&(t=n,n=0),n+Math.floor(Math.random()*(t-n+1))};var M={escape:{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#x27;","/":"&#x2F;"}};M.unescape=w.invert(M.escape);var S={escape:RegExp("["+w.keys(M.escape).join("")+"]","g"),unescape:RegExp("("+w.keys(M.unescape).join("|")+")","g")};w.each(["escape","unescape"],function(n){w[n]=function(t){return null==t?"":(""+t).replace(S[n],function(t){return M[n][t]})}}),w.result=function(n,t){if(null==n)return null;var r=n[t];return w.isFunction(r)?r.call(n):r},w.mixin=function(n){A(w.functions(n),function(t){var r=w[t]=n[t];w.prototype[t]=function(){var n=[this._wrapped];return a.apply(n,arguments),D.call(this,r.apply(w,n))}})};var N=0;w.uniqueId=function(n){var t=++N+"";return n?n+t:t},w.templateSettings={evaluate:/<%([\s\S]+?)%>/g,interpolate:/<%=([\s\S]+?)%>/g,escape:/<%-([\s\S]+?)%>/g};var T=/(.)^/,q={"'":"'","\\":"\\","\r":"r","\n":"n","	":"t","\u2028":"u2028","\u2029":"u2029"},B=/\\|'|\r|\n|\t|\u2028|\u2029/g;w.template=function(n,t,r){var e;r=w.defaults({},r,w.templateSettings);var u=RegExp([(r.escape||T).source,(r.interpolate||T).source,(r.evaluate||T).source].join("|")+"|$","g"),i=0,a="__p+='";n.replace(u,function(t,r,e,u,o){return a+=n.slice(i,o).replace(B,function(n){return"\\"+q[n]}),r&&(a+="'+\n((__t=("+r+"))==null?'':_.escape(__t))+\n'"),e&&(a+="'+\n((__t=("+e+"))==null?'':__t)+\n'"),u&&(a+="';\n"+u+"\n__p+='"),i=o+t.length,t}),a+="';\n",r.variable||(a="with(obj||{}){\n"+a+"}\n"),a="var __t,__p='',__j=Array.prototype.join,"+"print=function(){__p+=__j.call(arguments,'');};\n"+a+"return __p;\n";try{e=Function(r.variable||"obj","_",a)}catch(o){throw o.source=a,o}if(t)return e(t,w);var c=function(n){return e.call(this,n,w)};return c.source="function("+(r.variable||"obj")+"){\n"+a+"}",c},w.chain=function(n){return w(n).chain()};var D=function(n){return this._chain?w(n).chain():n};w.mixin(w),A(["pop","push","reverse","shift","sort","splice","unshift"],function(n){var t=e[n];w.prototype[n]=function(){var r=this._wrapped;return t.apply(r,arguments),"shift"!=n&&"splice"!=n||0!==r.length||delete r[0],D.call(this,r)}}),A(["concat","join","slice"],function(n){var t=e[n];w.prototype[n]=function(){return D.call(this,t.apply(this._wrapped,arguments))}}),w.extend(w.prototype,{chain:function(){return this._chain=!0,this},value:function(){return this._wrapped}})}).call(this);
})()
},{}],17:[function(require,module,exports){

var raf =  window.requestAnimationFrame       ||
           window.webkitRequestAnimationFrame ||
           window.mozRequestAnimationFrame    ||
           function (callback) {
             window.setTimeout(callback, 1000 / 60);
           };

var running = false;

exports.run = function(fn) {
  running = true;
  raf(function animate() {
    fn();
    if (running) {
      raf(animate);
    }
  });
};

exports.stop = function() {
  running = false;
};

},{}],18:[function(require,module,exports){

var EntityTracker = function() {
  
  var entities = {};
  var lastId = 1;

  this.forEach = function(callback) {
    for (var id in entities) {
      callback(entities[id]);
    }
  };

  this.find = function(id) {
    return entities[id];
  };

  this.findMatching = function(regex) {
    return Object.keys(entities)
      .filter(function(id) { return id.match(regex) })
      .map(function(id) { return entities[id] })
  }

  this.track = function(entity) {
    //console.log('Tracking entity: ' + entity.id);
    var id = entity.id || (lastId += 1);
    entities[id] = entity;
    return id;
  };

  this.forget = function(entity) {
    delete entities[entity.id];
  };
  
  this.forgetAll = function() {
    entities = {};
  }
  
};

module.exports = EntityTracker;

},{}],19:[function(require,module,exports){

function Time() {
  this.delta = 1;
  this.lastTime = new Date();
  this.frames = 0;
}

Time.prototype.update = function() {
  this.frames++;
  var time = Date.now();
  this.frames = 0;
    
  var currentTime = time;
  var passedTime = currentTime - this.lastTime;
  
  this.delta = passedTime;
  this.lastTime = currentTime;

  return this.delta;
};

module.exports = Time;

},{}],31:[function(require,module,exports){
// Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
// http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ┌────────────────────────────────────────────────────────────┐ \\
// │ Eve 0.4.2 - JavaScript Events Library                      │ \\
// ├────────────────────────────────────────────────────────────┤ \\
// │ Author Dmitry Baranovskiy (http://dmitry.baranovskiy.com/) │ \\
// └────────────────────────────────────────────────────────────┘ \\

(function (glob) {
    var version = "0.4.2",
        has = "hasOwnProperty",
        separator = /[\.\/]/,
        wildcard = "*",
        fun = function () {},
        numsort = function (a, b) {
            return a - b;
        },
        current_event,
        stop,
        events = {n: {}},
    /*\
     * eve
     [ method ]

     * Fires event with given `name`, given scope and other parameters.

     > Arguments

     - name (string) name of the *event*, dot (`.`) or slash (`/`) separated
     - scope (object) context for the event handlers
     - varargs (...) the rest of arguments will be sent to event handlers

     = (object) array of returned values from the listeners
    \*/
        eve = function (name, scope) {
			name = String(name);
            var e = events,
                oldstop = stop,
                args = Array.prototype.slice.call(arguments, 2),
                listeners = eve.listeners(name),
                z = 0,
                f = false,
                l,
                indexed = [],
                queue = {},
                out = [],
                ce = current_event,
                errors = [];
            current_event = name;
            stop = 0;
            for (var i = 0, ii = listeners.length; i < ii; i++) if ("zIndex" in listeners[i]) {
                indexed.push(listeners[i].zIndex);
                if (listeners[i].zIndex < 0) {
                    queue[listeners[i].zIndex] = listeners[i];
                }
            }
            indexed.sort(numsort);
            while (indexed[z] < 0) {
                l = queue[indexed[z++]];
                out.push(l.apply(scope, args));
                if (stop) {
                    stop = oldstop;
                    return out;
                }
            }
            for (i = 0; i < ii; i++) {
                l = listeners[i];
                if ("zIndex" in l) {
                    if (l.zIndex == indexed[z]) {
                        out.push(l.apply(scope, args));
                        if (stop) {
                            break;
                        }
                        do {
                            z++;
                            l = queue[indexed[z]];
                            l && out.push(l.apply(scope, args));
                            if (stop) {
                                break;
                            }
                        } while (l)
                    } else {
                        queue[l.zIndex] = l;
                    }
                } else {
                    out.push(l.apply(scope, args));
                    if (stop) {
                        break;
                    }
                }
            }
            stop = oldstop;
            current_event = ce;
            return out.length ? out : null;
        };
		// Undocumented. Debug only.
		eve._events = events;
    /*\
     * eve.listeners
     [ method ]

     * Internal method which gives you array of all event handlers that will be triggered by the given `name`.

     > Arguments

     - name (string) name of the event, dot (`.`) or slash (`/`) separated

     = (array) array of event handlers
    \*/
    eve.listeners = function (name) {
        var names = name.split(separator),
            e = events,
            item,
            items,
            k,
            i,
            ii,
            j,
            jj,
            nes,
            es = [e],
            out = [];
        for (i = 0, ii = names.length; i < ii; i++) {
            nes = [];
            for (j = 0, jj = es.length; j < jj; j++) {
                e = es[j].n;
                items = [e[names[i]], e[wildcard]];
                k = 2;
                while (k--) {
                    item = items[k];
                    if (item) {
                        nes.push(item);
                        out = out.concat(item.f || []);
                    }
                }
            }
            es = nes;
        }
        return out;
    };
    
    /*\
     * eve.on
     [ method ]
     **
     * Binds given event handler with a given name. You can use wildcards “`*`” for the names:
     | eve.on("*.under.*", f);
     | eve("mouse.under.floor"); // triggers f
     * Use @eve to trigger the listener.
     **
     > Arguments
     **
     - name (string) name of the event, dot (`.`) or slash (`/`) separated, with optional wildcards
     - f (function) event handler function
     **
     = (function) returned function accepts a single numeric parameter that represents z-index of the handler. It is an optional feature and only used when you need to ensure that some subset of handlers will be invoked in a given order, despite of the order of assignment. 
     > Example:
     | eve.on("mouse", eatIt)(2);
     | eve.on("mouse", scream);
     | eve.on("mouse", catchIt)(1);
     * This will ensure that `catchIt()` function will be called before `eatIt()`.
	 *
     * If you want to put your handler before non-indexed handlers, specify a negative value.
     * Note: I assume most of the time you don’t need to worry about z-index, but it’s nice to have this feature “just in case”.
    \*/
    eve.on = function (name, f) {
		name = String(name);
		if (typeof f != "function") {
			return function () {};
		}
        var names = name.split(separator),
            e = events;
        for (var i = 0, ii = names.length; i < ii; i++) {
            e = e.n;
            e = e.hasOwnProperty(names[i]) && e[names[i]] || (e[names[i]] = {n: {}});
        }
        e.f = e.f || [];
        for (i = 0, ii = e.f.length; i < ii; i++) if (e.f[i] == f) {
            return fun;
        }
        e.f.push(f);
        return function (zIndex) {
            if (+zIndex == +zIndex) {
                f.zIndex = +zIndex;
            }
        };
    };
    /*\
     * eve.f
     [ method ]
     **
     * Returns function that will fire given event with optional arguments.
	 * Arguments that will be passed to the result function will be also
	 * concated to the list of final arguments.
 	 | el.onclick = eve.f("click", 1, 2);
 	 | eve.on("click", function (a, b, c) {
 	 |     console.log(a, b, c); // 1, 2, [event object]
 	 | });
     > Arguments
	 - event (string) event name
	 - varargs (…) and any other arguments
	 = (function) possible event handler function
    \*/
	eve.f = function (event) {
		var attrs = [].slice.call(arguments, 1);
		return function () {
			eve.apply(null, [event, null].concat(attrs).concat([].slice.call(arguments, 0)));
		};
	};
    /*\
     * eve.stop
     [ method ]
     **
     * Is used inside an event handler to stop the event, preventing any subsequent listeners from firing.
    \*/
    eve.stop = function () {
        stop = 1;
    };
    /*\
     * eve.nt
     [ method ]
     **
     * Could be used inside event handler to figure out actual name of the event.
     **
     > Arguments
     **
     - subname (string) #optional subname of the event
     **
     = (string) name of the event, if `subname` is not specified
     * or
     = (boolean) `true`, if current event’s name contains `subname`
    \*/
    eve.nt = function (subname) {
        if (subname) {
            return new RegExp("(?:\\.|\\/|^)" + subname + "(?:\\.|\\/|$)").test(current_event);
        }
        return current_event;
    };
    /*\
     * eve.nts
     [ method ]
     **
     * Could be used inside event handler to figure out actual name of the event.
     **
     **
     = (array) names of the event
    \*/
    eve.nts = function () {
        return current_event.split(separator);
    };
    /*\
     * eve.off
     [ method ]
     **
     * Removes given function from the list of event listeners assigned to given name.
	 * If no arguments specified all the events will be cleared.
     **
     > Arguments
     **
     - name (string) name of the event, dot (`.`) or slash (`/`) separated, with optional wildcards
     - f (function) event handler function
    \*/
    /*\
     * eve.unbind
     [ method ]
     **
     * See @eve.off
    \*/
    eve.off = eve.unbind = function (name, f) {
		if (!name) {
		    eve._events = events = {n: {}};
			return;
		}
        var names = name.split(separator),
            e,
            key,
            splice,
            i, ii, j, jj,
            cur = [events];
        for (i = 0, ii = names.length; i < ii; i++) {
            for (j = 0; j < cur.length; j += splice.length - 2) {
                splice = [j, 1];
                e = cur[j].n;
                if (names[i] != wildcard) {
                    if (e[names[i]]) {
                        splice.push(e[names[i]]);
                    }
                } else {
                    for (key in e) if (e[has](key)) {
                        splice.push(e[key]);
                    }
                }
                cur.splice.apply(cur, splice);
            }
        }
        for (i = 0, ii = cur.length; i < ii; i++) {
            e = cur[i];
            while (e.n) {
                if (f) {
                    if (e.f) {
                        for (j = 0, jj = e.f.length; j < jj; j++) if (e.f[j] == f) {
                            e.f.splice(j, 1);
                            break;
                        }
                        !e.f.length && delete e.f;
                    }
                    for (key in e.n) if (e.n[has](key) && e.n[key].f) {
                        var funcs = e.n[key].f;
                        for (j = 0, jj = funcs.length; j < jj; j++) if (funcs[j] == f) {
                            funcs.splice(j, 1);
                            break;
                        }
                        !funcs.length && delete e.n[key].f;
                    }
                } else {
                    delete e.f;
                    for (key in e.n) if (e.n[has](key) && e.n[key].f) {
                        delete e.n[key].f;
                    }
                }
                e = e.n;
            }
        }
    };
    /*\
     * eve.once
     [ method ]
     **
     * Binds given event handler with a given name to only run once then unbind itself.
     | eve.once("login", f);
     | eve("login"); // triggers f
     | eve("login"); // no listeners
     * Use @eve to trigger the listener.
     **
     > Arguments
     **
     - name (string) name of the event, dot (`.`) or slash (`/`) separated, with optional wildcards
     - f (function) event handler function
     **
     = (function) same return function as @eve.on
    \*/
    eve.once = function (name, f) {
        var f2 = function () {
            eve.unbind(name, f2);
            return f.apply(this, arguments);
        };
        return eve.on(name, f2);
    };
    /*\
     * eve.version
     [ property (string) ]
     **
     * Current version of the library.
    \*/
    eve.version = version;
    eve.toString = function () {
        return "You are running Eve " + version;
    };
    (typeof module != "undefined" && module.exports) ? (module.exports = eve) : (typeof define != "undefined" ? (define("eve", [], function() { return eve; })) : (glob.eve = eve));
})(this);

},{}],10:[function(require,module,exports){
var _ = require('../../3rdparty/underscore-min');

var images = [
  'ball',
  'boom-circle', 'boom-line', 'boom-splash',
  'cat', 'cat-down', 'cat-up',
  'cone',
  'dog', 'dog-down', 'dog-up',
  'end-draw', 'end-winner',
  'intro-about', 'intro-leaderboard', 'intro-title',
  'particle-ball',
  'stadium', 'stadium-shake-left', 'stadium-shake-right',
  'intro-title'
].reduce(imagePath, {});

var sounds = [
  'bounce',
  'crowd', 'crowd-end', 'crowd-oh', 'crowd-organ', 'crowd-scored',
  'intro', 'multiball', 'sax', 'whistle'
].reduce(soundPath, {});

function imagePath(acc, name) {
  acc[name] = '/game/images/' + name + '.png';
  return acc;
}

function soundPath(acc, name) {
  acc[name] = '/game/sounds/' + name + '.mp3';
  return acc;
}

exports.image = function(name) {
  return images[name];
};

exports.images = function(/*varargs*/) {
  return Array.prototype.slice.apply(arguments).map(function(name) {
    return images[name];
  })
};

exports.allImages = function() {
  return _.values(images);
}

exports.sound = function(name) {
  return sounds[name];
};

},{"../../3rdparty/underscore-min":12}],13:[function(require,module,exports){
var userInterface   = require('./user-interface');
var world2          = require('./world');

function GraphicsEngine(world, gameView, debugView) {
  this.renderer     = PIXI.autoDetectRenderer(gameView.width, gameView.height, gameView);
  this.stage        = new PIXI.Stage();
  this.view         = this.renderer.view;
  this.debugView    = debugView;
  
  var worldRatio  = world.width / world.height;
  var screenRatio = gameView.width / gameView.height;
  
  var width, height;
  if (screenRatio > worldRatio) {
    width  = Math.floor(gameView.height * worldRatio);
    height = gameView.height;
  } else {
    width  = gameView.width;
    height = Math.floor(gameView.width / worldRatio);
  }
  
  gameView.width  = debugView.width  = width;
  gameView.height = debugView.height = height
  userInterface.resize(gameView.width, gameView.height);
  this.renderer.resize(gameView.width, gameView.height);
  
  world2.setPixelsPerMeter(Math.floor(gameView.height / world.height));
}

GraphicsEngine.prototype.render = function() {
  this.renderer.render(this.stage);
};

GraphicsEngine.prototype.add = function(sprite) {
  this.stage.addChild(sprite);
};

GraphicsEngine.prototype.remove = function(sprite) {
  this.stage.removeChild(sprite);
};

module.exports = GraphicsEngine;

},{"./user-interface":32,"./world":33}],14:[function(require,module,exports){
var world = require('./world');

var frameRate   = 1 / 60;
var iterations  = 10;

var normaliseNan = function(n) {
  return n || 0
}

var normalisePoint = function(p) {
  return { x: normaliseNan(p.x), y: normaliseNan(p.y) }
}

function PhysicsEngine(debugCanvas) {
  
  this.collisionCallback = null;
  this.b2world = new Box2D.Dynamics.b2World(new Box2D.Common.Math.b2Vec2(0, 0), true);
  
  var contactListener = new Box2D.Dynamics.b2ContactListener;
  
  contactListener.BeginContact = function(contact) {
    var worldManifold = new Box2D.Collision.b2WorldManifold();
    contact.GetWorldManifold(worldManifold);
    var fixtureA = contact.GetFixtureA();
    var fixtureB = contact.GetFixtureB();
    if (this.collisionCallback) {
      this.collisionCallback(fixtureA, fixtureB, worldManifold.m_points.map(normalisePoint));
    }
  }.bind(this);
  
  this.b2world.SetContactListener(contactListener);
  
  if (debugCanvas) {
    this.debugDraw(debugCanvas);
  }
}

PhysicsEngine.prototype.create = function(bodyDef, fixtureDef) {
  var body = this.b2world.CreateBody(bodyDef);
  if (fixtureDef) {
    body.CreateFixture(fixtureDef);    
  }
  return body;
};

PhysicsEngine.prototype.destroy = function(body) {
  body.GetFixtureList().SetUserData(null);
  this.b2world.DestroyBody(body);
};

PhysicsEngine.prototype.collision = function(callback) {
  this.collisionCallback = callback;
}

PhysicsEngine.prototype.debugDraw = function(canvas) {
  var debugDraw = new Box2D.Dynamics.b2DebugDraw();
  debugDraw.SetSprite(canvas.getContext("2d"));
  debugDraw.SetDrawScale(world.getPixelsPerMeter());
  debugDraw.SetFillAlpha(0.3);
  debugDraw.SetLineThickness(1.0);
  debugDraw.SetFlags(Box2D.Dynamics.b2DebugDraw.e_shapeBit | Box2D.Dynamics.b2DebugDraw.e_jointBit);
  this.b2world.SetDebugDraw(debugDraw);
}

PhysicsEngine.prototype.update = function() {
  this.b2world.Step(frameRate, iterations, iterations);
  this.b2world.DrawDebugData();
  this.b2world.ClearForces();
};

module.exports = PhysicsEngine;

},{"./world":33}],15:[function(require,module,exports){
var _     = require('../../../3rdparty/underscore-min');
var hub   = require('./hub');

function Sound() {
  
  var current = {};
  
  function play(args) {
    var sound = new Audio();
    current[args.file] = sound;
    sound.src = args.file;
    if (args.volume !== undefined) { sound.volume = args.volume; }
    if (args.loop)                 { sound.loop = true; }
    sound.play();
    return sound;
  };
 
  function stop(args) {
    if (current[args.file]) {
      current[args.file].pause();
      delete current[args.file];
    }
  }
 
  hub.on('engine.sound.play', play);
  hub.on('engine.sound.stop', stop);
  
}

module.exports = Sound;

},{"../../../3rdparty/underscore-min":12,"./hub":9}],16:[function(require,module,exports){
var _        = require('../../../3rdparty/underscore-min');
var hub      = require('./hub');
var Explosion = require('./explosion')

var ParticleEngine = function(engine) {
  hub.on('engine.explosion', function(params) {
    engine.addEntity(Explosion[params.size || 'small'](params.source))
  })
  
};

module.exports = ParticleEngine;

},{"../../../3rdparty/underscore-min":12,"./hub":9,"./explosion":34}],23:[function(require,module,exports){
var _ = require('../../../3rdparty/underscore-min');

function Sequencer(engine, game, states, transitions) {
    
  var states = _.reduce(states, function(acc, fn, key) {
    acc[key] = new fn(engine, game);
    return acc;
  }, {});
  
  var that = this;
  this.activeState = null;
  
  this.fsm = window.StateMachine.create({
  
    events: transitions,
  
    callbacks: {
      onenterstate: function(transition, start, end, args) {
        console.log('[sequencer] ' + start + ' + ' + transition + ' = ' + end);
        states[start] && states[start].exit();
        states[end]   && states[end].enter(args);
        that.activeState = states[end];
      }
    },
    
    // error: function(eventName, from, to, args, errorCode, errorMessage) {
    //   if (errorCode === StateMachine.Error.INVALID_CALLBACK) {
    //     throw errorMessage;
    //   } else {
    //     console.log('[sequencer] ' + eventName + ' : ' + errorMessage);
    //   }
    // },
  
  });
  
}

Sequencer.prototype.start = function() {
  this.fsm.startup();
};

Sequencer.prototype.transition = function(trans, args) {
  this.fsm[trans](args);
};

Sequencer.prototype.active = function() {
  return this.activeState;
};

module.exports = Sequencer;

},{"../../../3rdparty/underscore-min":12}],20:[function(require,module,exports){
var Entity        = require('../../engine/entity')
var GF            = require('../../engine/graphics-factory');
var userInterface = require('../../engine/user-interface');
var assets        = require('../../assets');

var formatAsRank = function(num) {
  if (num === 1) {
    return num + 'st'
  } else if (num === 2) {
    return num + 'nd'
  } else if (num === 3) {
    return num + 'rd'
  } else {
    return num + 'th'
  }
}

function Leaderboard(id) {
  var DefaultTextOptions = {
    strokeThickness: userInterface.unit(0.4),
    fill: '#01518d'
  }
  var DefaultFontSize = userInterface.unit(4)

  this.id = id;
  this.players = []
  
  $.ajax({
    url: '/player',
    async: false,
    success: function(data) {
      this.players = data.sort(function(x,y) {
        return y.topScore - x.topScore
      }).slice(0, 5)
    }.bind(this)
  })

  this.sprites = [
    GF.uiSprite(assets.image('intro-leaderboard'), userInterface.width, userInterface.height)
  ];

  var currentY = userInterface.unit(19.4)
  var i = 1

  this.players.forEach(function(player) {
    var rankSprite = GF.text(formatAsRank(i), DefaultFontSize, DefaultTextOptions)
    rankSprite.position.y = currentY
    rankSprite.position.x = userInterface.unit(5)
    this.sprites.push(rankSprite)

    var playerNameSprite = GF.text((player.firstName + ' ' + player.lastName.substring(0, 1)).toUpperCase(), DefaultFontSize, $.extend({}, DefaultTextOptions, { fill: '#bf0000' }))
    playerNameSprite.position.x = userInterface.unit(18)
    playerNameSprite.position.y = currentY
    this.sprites.push(playerNameSprite)

    var companySprite = GF.text((player.company || '').toUpperCase(), userInterface.unit(3), $.extend({}, DefaultTextOptions, { strokeThickness: userInterface.unit(0.4) }))
    companySprite.position.x = playerNameSprite.position.x + playerNameSprite.width + userInterface.unit(2)
    companySprite.position.y = currentY + userInterface.unit(0.6)
    this.sprites.push(companySprite)

    var scoreSprite = GF.text(player.topScore + ' GOALS', DefaultFontSize, DefaultTextOptions)
    scoreSprite.position.x = userInterface.width - scoreSprite.width - userInterface.unit(5)
    scoreSprite.position.y = currentY
    this.sprites.push(scoreSprite)
    
    currentY += playerNameSprite.height + userInterface.unit(2.3);
    i += 1
  }.bind(this))
}

Leaderboard.prototype = new Entity();

Leaderboard.prototype.create = function(engine, game) {
  this.sprites.forEach(function(sprite) {
    engine.graphics.add(sprite);
  })
};

Leaderboard.prototype.destroy = function(engine, game) {
  this.sprites.forEach(function(sprite) {
    engine.graphics.remove(sprite);
  })
};

Leaderboard.prototype.update = function() {}

module.exports = Leaderboard
},{"../../engine/entity":35,"../../engine/graphics-factory":36,"../../engine/user-interface":32,"../../assets":10}],21:[function(require,module,exports){
var Entity        = require('../../engine/entity')
var GF            = require('../../engine/graphics-factory');
var userInterface = require('../../engine/user-interface');
var assets        = require('../../assets');

function Title(id) {
  
  this.id = id;
  this.sprite = GF.uiSprite(assets.image('intro-title'), userInterface.width, userInterface.height);

};

Title.prototype = new Entity();

module.exports = Title;

},{"../../engine/entity":35,"../../engine/graphics-factory":36,"../../engine/user-interface":32,"../../assets":10}],22:[function(require,module,exports){
var Entity        = require('../../engine/entity')
var GF            = require('../../engine/graphics-factory');
var userInterface = require('../../engine/user-interface');
var assets        = require('../../assets');

var RED  = '#bf0000';
var BLUE = '#01518d';

function About(id) {
  
  this.id = id;

  console.log(userInterface.unit(1));
  this.sprites = [
    GF.uiSprite(assets.image('intro-about'), userInterface.width, userInterface.height),
    text('Built in 4 weeks  (after hours)', BLUE, 7, 13.5),
    text('Javascript', RED, 7, 26.5),
    text('WebGL', BLUE, 33, 26.5),
    text('Node.js', RED, 49, 26.5),
    text('Web sockets', BLUE, 68, 26.5),
    text('Ask us about', BLUE, 7, 39.5),
    text('web', RED, 34, 39.5),
    text('&', BLUE, 44, 39.5),
    text('mobile', RED, 49, 39.5),
    text('!', BLUE, 64, 39.5)
  ];

};

About.prototype = new Entity();

About.prototype.create = function(engine, game) {
  this.sprites.forEach(function(sprite) {
    engine.graphics.add(sprite);
  })
};

About.prototype.destroy = function(engine, game) {
  this.sprites.forEach(function(sprite) {
    engine.graphics.remove(sprite);
  })
};

function text(str, color, x, y) {
  var sprite = GF.text(str, userInterface.unit(3.8), {
    fill: color,
    strokeThickness: userInterface.unit(0.4)
  });
  sprite.position.x = userInterface.unit(x);
  sprite.position.y = userInterface.unit(y);
  return sprite;
}

module.exports = About;

},{"../../engine/entity":35,"../../engine/graphics-factory":36,"../../engine/user-interface":32,"../../assets":10}],24:[function(require,module,exports){
var PF          = require('../../engine/physics-factory');
var GF          = require('../../engine/graphics-factory');
var Entity      = require('../../engine/entity');
var world       = require('../../engine/world');
var mathUtils   = require('../../engine/math-utils');
var hub         = require('../../engine/hub');
var MathUtils   = require('../../engine/math-utils')
var assets      = require('../../assets');

var ballSize = 2;

var fixture = PF.fixture({
  shape:      PF.shape.circle(ballSize / 2),
  dynamics:   {density: 1, friction: 1, restitution: 1},
  category:   PF.categories.BALL,
  collision:  PF.categories.ARENA | PF.categories.PLAYER | PF.categories.BALL
});

function Ball(id, x, y) {
  this.id = id;

  this.bodySpec = {
    body: PF.dynamic({x: x, y: y}),
    fixture: fixture
  };

  this.sprite = GF.sprite(assets.image('ball'), ballSize, ballSize);
};

Ball.prototype = new Entity();

Ball.prototype.update = function(engine, game, delta) {  
  Entity.prototype.update.call(this, delta);
  mathUtils.clampXVelocity(this.body, 28, 38);
  mathUtils.clampYVelocity(this.body, 15, 23);
  this.body.SetAngularDamping(1.5);
  
  // We should be able to specify "0.5", and not have to update it constantly
  // Need to check our changes to PIXI
  this.sprite.anchor.x = this.sprite.texture.width  / 2;
  this.sprite.anchor.y = this.sprite.texture.height / 2;
};

Ball.prototype.kick = function(direction) {
  this.body.SetAwake(true);
  this.body.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(25 * direction, MathUtils.randomBetween(1, 6)));
  this.body.SetAngularVelocity(MathUtils.randomBetween(4, 10));
}

module.exports = Ball;

},{"../../engine/physics-factory":37,"../../engine/graphics-factory":36,"../../engine/entity":35,"../../engine/world":33,"../../engine/math-utils":38,"../../engine/hub":9,"../../assets":10}],25:[function(require,module,exports){
var GF = require('../../engine/graphics-factory');
var Entity = require('../../engine/entity');
var userInterface = require('../../engine/user-interface');

function ActionText(id, text) {
  
  this.id = id;
  this.sprite = GF.text(text, 65, {
    strokeThickness: 4
  });
  
  this.sprite.position.x = userInterface.width  / 2 - this.sprite.width  / 2;
  this.sprite.position.y = userInterface.height / 2 - this.sprite.height / 2;
  
};

ActionText.prototype = new Entity();

ActionText.prototype.set = function(text) {
  this.sprite.setText(text);
};

module.exports = ActionText;

},{"../../engine/graphics-factory":36,"../../engine/entity":35,"../../engine/user-interface":32}],26:[function(require,module,exports){
// reset players pos
// can move, but no ball

var GF          = require('../../engine/graphics-factory');
var Stadium     = require('../entities/stadium');
var Crowd       = require('../entities/crowd');
var Player      = require('../entities/player');
var Hud         = require('../entities/hud');
var ActionText  = require('../entities/action-text');
var world       = require('../world');

function WarmUp(engine, game) {

  var startingPos = [
    world.width / 8,
    world.width - world.width / 8
  ];
  
  this.enter = function() {

    var p1 = new Player('p1', 0, game.players[0].name, startingPos[0], world.height / 2);
    var p2 = new Player('p2', 1, game.players[1].name, startingPos[1], world.height / 2);
    
    engine.addEntity(new Stadium());
    engine.addEntity(new Crowd());
    engine.addEntity(p1);
    engine.addEntity(p2);
    engine.addEntity(new Hud());
    engine.addEntity(new ActionText('get-ready', 'GET READY!'));

    setTimeout(function() {
      game.transition('ready', 0);
    }, 2000);    

  };
  
  this.exit = function() {
    engine.deleteEntity('get-ready');
  };
  
  this.update = function(delta) {
  };
  
  this.on = function(message, args) {
  };
  
}

module.exports = WarmUp;

},{"../../engine/graphics-factory":36,"../entities/stadium":39,"../entities/crowd":40,"../entities/player":41,"../entities/hud":42,"../entities/action-text":25,"../world":8}],27:[function(require,module,exports){
var _           = require('../../../../3rdparty/underscore-min');
var GF          = require('../../engine/graphics-factory');
var hub         = require('../../engine/hub');
var Ball        = require('../entities/ball');
var ActionText  = require('../entities/action-text');
var world       = require('../world');

function KickOff(engine, game) {
  var text = null;
  var firstBall = null
  var ballDirection = null
  
  this.enter = function(lastScoringPlayerId) {
    var pitchPosition = (lastScoringPlayerId === 0) ? -1 : 1
    ballDirection = pitchPosition * -1
    game.clearBalls()
    firstBall = game.createBall(pitchPosition, 0)

    text = new ActionText('countdown', '');
    engine.addEntity(text);
    countdown(3);
  };
  
  this.exit = function() {
  };
  
  this.update = function(delta) {
  };
  
  this.on = function(message, args) {
  };
  
  function countdown(val) {
    if (val == 0) {
      go();
    } else {
      text.set(val.toString());
      setTimeout(_.partial(countdown, --val), 600);
    }
  }
  
  function go() {
    hub.send('engine.sound.play', {file: '/game/sounds/whistle.mp3'});
    engine.deleteEntity('countdown');

    firstBall.kick(ballDirection)
    game.transition('go');
  }
  
}

module.exports = KickOff;

},{"../../../../3rdparty/underscore-min":12,"../../engine/graphics-factory":36,"../../engine/hub":9,"../entities/ball":24,"../entities/action-text":25,"../world":8}],28:[function(require,module,exports){
var TimeBasedMessage  = require('../time-based-message');
var mathUtils         = require('../../engine/math-utils');

function Play(engine, game) {
  
  var multiBall       = new TimeBasedMessage(15000, 'game.multiball');
  var endOfMatch      = new TimeBasedMessage(0, 'game.end');
  
  this.enter = function() {
  };
  
  this.exit = function() {
  };
  
  this.update = function(delta) {
    game.timeRemaining = Math.max(game.timeRemaining - delta, 0);
    multiBall.update(game.timeRemaining);
    endOfMatch.update(game.timeRemaining);
  };
  
  this.on = function(message, args) {
  };
  
}

module.exports = Play;

},{"../time-based-message":43,"../../engine/math-utils":38}],29:[function(require,module,exports){
var Boom       = require('../entities/boom');
var ActionText = require('../entities/action-text');
var hub        = require('../../engine/hub');

function Scored(engine, game) {
  
  this.enter = function(data) {
    engine.getEntity('stadium').shake(data.againstIndex);
    engine.addEntity(new Boom('boom' + data.ball.id, data.againstIndex));
    game.removeBall(data.ball);
    
    if (game.ballsInPlay.length >= 1) {
      setTimeout(function() {
        game.transition('go');
      }, 1);
    } else {
      setTimeout(function() {
        game.transition('ready', data.againstIndex);
      }, 1);
    }
    
    setTimeout(function() {
      engine.deleteEntity('boom' + data.ball.id);
    }, 400);
  };
  
  this.exit = function() {
  };
  
  this.update = function(delta) {
  };
  
  this.on = function(message, args) {
  };
  
}

module.exports = Scored;

},{"../entities/boom":44,"../entities/action-text":25,"../../engine/hub":9}],30:[function(require,module,exports){
var Winner  = require('../entities/winner');
var hub     = require('../../engine/hub');

function EndOfMatch(engine, game) {
  
  this.enter = function() {
    engine.deleteEntityMatching(/^ball:/);
    engine.addEntity(new Winner('winner', game.players[0], game.players[1]));
    setTimeout(finish, 4000);
  };
  
  this.exit = function() {
  };
  
  this.update = function(delta) {
  };

  this.on = function(message, args) {
  };
  
  function finish() {
    hub.send('game.finish');
  }
  
}

module.exports = EndOfMatch;

},{"../entities/winner":45,"../../engine/hub":9}],32:[function(require,module,exports){

exports.width  = 0;
exports.height = 0;

exports.resize = function(w, h) {
  exports.width  = w;
  exports.height = h;
};

exports.unit = function(n) {
  return (exports.width / 100) * n
}
},{}],33:[function(require,module,exports){

var pixelsPerMeter = 16;

exports.toPixels = function(meters) {
  return meters * pixelsPerMeter;
};

exports.setPixelsPerMeter = function(val) {
  pixelsPerMeter = val;
};

exports.getPixelsPerMeter = function() {
  return pixelsPerMeter;
};

},{}],38:[function(require,module,exports){

var PI = 3.14159;

exports.PI = PI;

exports.clampVelocity = function(body, min, max) {
  var vec = body.GetLinearVelocity();
  if (vec.x != 0 && vec.y != 0) {
    if (vec.Length() < min) {
      vec.Normalize();
      vec.Multiply(min);
    } else if (vec.Length() > max) {
      vec.Normalize()
      vec.Multiply(max);
    }
  }
};

exports.clampXVelocity = function(body, min, max) {
  var vec = body.GetLinearVelocity();
  if (vec.x != 0) {
    vec.x = exports.clampWithSign(vec.x, min, max);
  }
};

exports.clampYVelocity = function(body, min, max) {
  var vec = body.GetLinearVelocity();
  if (vec.y != 0) {
    vec.y = exports.clampWithSign(vec.y, min, max);
  }
};

exports.clampWithSign = function(val, min, max) {
  if (val > 0) {
    return exports.clamp(val, min, max);
  } else {
    return exports.clamp(val, -max, -min);
  }
};

exports.clamp = function(val, min, max) {
  return Math.min(Math.max(val, min), max);
};

exports.randomBetween = function(min, max) {
  return Math.floor(Math.random() * (max-min)) + min;
};

exports.randomSign = function() {
  return Math.random() < 0.5 ? -1 : 1;
};

exports.distance = function(a, b) {
  return Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
};

},{}],34:[function(require,module,exports){
var _ = require('../../../3rdparty/underscore-min'),
  Entity = require('./entity'),
  World = require('./world'),
  hub = require('./hub'),
  mathUtils = require('./math-utils')

var M_PI = Math.PI
var M_PI_2 = M_PI / 2

var particleTexture = PIXI.Texture.fromImage('/game/images/particle-ball.png')

var Particle = function() {
  PIXI.Sprite.call(this, particleTexture)
  this.anchor.x = 0.5
  this.anchor.y = 0.5
  this.speed = new PIXI.Point
  this.acceleration = new PIXI.Point
  this.width = 15
  this.height = 15
}
Particle.constructor = Particle
Particle.prototype = Object.create(PIXI.Sprite.prototype)

var resetParticle = function(particle) {
  particle.alpha = 1
  particle.scale.x = 1
  particle.scale.y = 1
  particle.direction = {
    x: (mathUtils.randomBetween(0, 200) - 100) / 100,
    y: (mathUtils.randomBetween(0, 200) - 100) / 100
  }
  particle.speed.x = 1.3 + Math.random()
  particle.speed.y = 1.3 + Math.random()
  particle.acceleration.x = 0.75 + Math.random()
  particle.acceleration.y = 0.75 + Math.random()
  particle.position.x = 0
  particle.position.y = 0
  particle.visible = true
  particle.rotation = 0
}

var ParticlePool = function(size) {
  console.log('Constructing a particle pool with ' + size + ' particles')
  this.pool = []

  for (var i = 0; i <= size; i++) {
    var particle = new Particle()
    this.pool.push({
      particle: particle,
      free: true
    })
  }
}

ParticlePool.prototype.claim = function(amount) {
  var particles = []

  for (var i = 0; i < this.pool.length; i++) {
    var entry = this.pool[i]

    if (entry.free) {
      if (!entry.particle) {
        throw 'Particle is null'
      }

      entry.free = false
      particles.push(entry.particle)
    }

    if (particles.length == amount) {
      break
    }
  }

  if (particles.length < amount) {
    throw 'Not enough particles to satisfy request'
  }

  console.log('Claimed ' + amount + ' particles')

  return particles
}

ParticlePool.prototype.release = function(particles) {
  particles.forEach(function(particle) {
    if (particle.parent) {
      particle.parent.removeChild(particle)
    }
    var entry = _.findWhere(this.pool, { particle: particle })
    entry.free = true
  }.bind(this))
  // console.log('Released ' + particles.length + ' particles')
}

var particlePool = new ParticlePool(5000)

var Explosion = function(origin, particleCount) {
  Entity.call(this)
  this.sprite = new PIXI.DisplayObjectContainer()
  this.sprite.position.x = World.toPixels(origin.x)
  this.sprite.position.y = World.toPixels(origin.y)
  this.ttl = 0

  this.particles = this.aliveParticles = particlePool.claim(particleCount)
  this.particles.forEach(function(particle) {
    resetParticle(particle)
    this.sprite.addChild(particle)
  }.bind(this))
}
Explosion.large = function(origin) {
  return new Explosion(origin, 50)
}
Explosion.small = function(origin) {
  return new Explosion(origin, mathUtils.randomBetween(9, 51))
}

Explosion.prototype = new Entity()

Explosion.prototype.update = function(delta) {
  this.ttl -= delta

  var currentParticles = this.aliveParticles
  currentParticles.forEach(function(particle) {
    if (particle.parent) {
      particle.position.x += particle.speed.x * particle.direction.x
      particle.position.y += particle.speed.y * particle.direction.y
      particle.speed.x += particle.acceleration.x
      particle.speed.y += particle.acceleration.y

      var velocity = particle.speed
      var angle = 0

      if (velocity.x === 0) {
        angle = velocity.y > 0 ? 0 : M_PI
      } else if(velocity.y === 0) {
        angle = velocity.x > 0 ? M_PI_2 : 3 * M_PI_2
      } else {
        angle = Math.atan(velocity.y / velocity.x) + M_PI_2
      }   

      if (velocity.x > 0) {
        angle += M_PI
      }

      particle.rotation = angle
      // particle.height = 8 * particle.speed.y

      if (mathUtils.distance({ x: 0, y: 0 }, particle.position) >= 300) {
        particle.alpha = 0
      }
    }

    var deadParticle = !particle.parent

    if (deadParticle) {
      console.log('Dead particle')
    }

    if (deadParticle || particle.alpha <= (Math.random() * 5) / 50) {
      this.aliveParticles = _.without(this.aliveParticles, particle)
      particlePool.release([particle])
    }
  }.bind(this))

  if (this.aliveParticles.length === 0) {
    hub.send('entity:destroy', {
      entity: this
    })
  }
}

module.exports = Explosion
},{"../../../3rdparty/underscore-min":12,"./entity":35,"./world":33,"./hub":9,"./math-utils":38}],35:[function(require,module,exports){
var _ = require('../../../3rdparty/underscore-min');
var world = require('./world');

var globalCount = 0;

var Entity = function() {
  this.id     = (++globalCount);
  this.body   = null
  this.sprite = null;
};

Entity.prototype.create = function(engine, game) {
  if (this.bodySpec) {
    this.bodySpec.fixture.userData = this;
    this.body = engine.physics.create(this.bodySpec.body, this.bodySpec.fixture);  
  }
  if (this.sprite) {
    engine.graphics.add(this.sprite);
  }
};

Entity.prototype.destroy = function(engine, game) {
  if (this.body) {
    engine.physics.destroy(this.body);
  }
  if (this.sprite) {
    engine.graphics.remove(this.sprite);
  }
};

Entity.prototype.update = function(engine, game, delta) {
  if (this.sprite && this.body) {
    this.sprite.position.x = world.toPixels(this.body.GetPosition().x);
    this.sprite.position.y = world.toPixels(this.body.GetPosition().y);
    this.sprite.rotation = this.body.GetAngle();
  }
};

Entity.prototype.collision = function(other, points) {
  // nothing
};

module.exports = Entity;

},{"../../../3rdparty/underscore-min":12,"./world":33}],36:[function(require,module,exports){
var _ = require('../../../3rdparty/underscore-min');
var world = require('./world');

//
// Anchor always seems reset for "normal" sprites
// But OK for tiling... maybe due to this?
//
// 1f3dee9c4a1c71bed9cd10c4a2e86fbbb35f1bbf
// 18 May 2013 11:56:39 PM
// Patch Pixi to allow specifying a central anchor for tiling sprites
// 

exports.sprite = function(image, width, height, rotation) {
  var sprite = PIXI.Sprite.fromImage(image);
  init(sprite, width, height, rotation);
  sprite.anchor.x = 0.5;
  sprite.anchor.y = 0.5;
  //console.log('anchor = ', sprite.anchor)
  return sprite;
};

exports.uiSprite = function(image, width, height, rotation) {
  var sprite = PIXI.Sprite.fromImage(image);
  sprite.width = width;  
  sprite.height = height;
  sprite.position.x = 0;
  sprite.position.y = 0;
  sprite.anchor.x = 0.5;
  sprite.anchor.y = 0.5;
  sprite.rotation = rotation || 0;
  return sprite;
};

exports.tile = function(image, width, height, rotation) {
  var texture = PIXI.Texture.fromImage(image);
  var sprite = new PIXI.TilingSprite(texture);
  sprite.tileScale = new PIXI.Point(1,1);
  init(sprite, width, height, rotation);
  sprite.anchor.x = sprite.width  / 2;
  sprite.anchor.y = sprite.height / 2;
  //console.log('anchor = ', sprite.anchor)
  return sprite;
};

exports.text = function(text, size, opts) {
  opts = _.extend({
      font: '' + (size || 50) + 'px LuckiestGuy',
      fill: '#000',
      align: 'left',
      stroke: '#fff',
      strokeThickness: 1
  }, opts);
  var text = new PIXI.Text(text, opts);
  text.anchor.x = 0.5;
  return text;
};

exports.animation = function(images, width, height) {
  var textures = images.map(function(i) {
    return PIXI.Texture.fromImage(i);
  });
  var anim = new PIXI.MovieClip(textures);
  init(anim, width, height, 0);
  return anim;
};

function init(sprite, width, height, rotation) {
  sprite.width = world.toPixels(width);  
  sprite.height = world.toPixels(height);
  sprite.position.x = 0;
  sprite.position.y = 0;
  sprite.rotation = rotation || 0;
}

},{"../../../3rdparty/underscore-min":12,"./world":33}],37:[function(require,module,exports){
var _ = require('../../../3rdparty/underscore-min');

exports.static = function(options) {
  return bodyDef(Box2D.Dynamics.b2Body.b2_staticBody, options);
};

exports.dynamic = function(options) {
  return bodyDef(Box2D.Dynamics.b2Body.b2_dynamicBody, options);
};

exports.fixture = function(options) {
  var fixDef = new Box2D.Dynamics.b2FixtureDef;
  fixDef.density = options.dynamics.density;
  fixDef.friction = options.dynamics.friction;
  fixDef.restitution = options.dynamics.restitution;
  fixDef.shape = options.shape;
  if (options.category)  { fixDef.filter.categoryBits = options.category; }
  if (options.collision) { fixDef.filter.maskBits = options.collision;    }
  return fixDef;
};

exports.shape = {
  circle: function(radius, pos) {
    var cs = new Box2D.Collision.Shapes.b2CircleShape;
    cs.SetRadius(radius);
    if (pos) {
      cs.SetLocalPosition(pos);
    }
    return cs;
  },
  box: function(width, height, pos, angle) {
    var ps = new Box2D.Collision.Shapes.b2PolygonShape;
    var pos = pos || new Box2D.Common.Math.b2Vec2(0,0);
    var angle = angle || 0;
    ps.SetAsOrientedBox(width / 2, height / 2, pos, angle);   // half-width, half-height
    return ps;
  }
};

exports.categories = {
  ALL:       -1,
  ARENA:     0x0001,
  PLAYERS:   0x0002,
  BALL:      0x0004,
  PARTICLES: 0x0008
};




function bodyDef(type, options) {
  options = _.extend({
    x: 0,
    y: 0,
    angle: 0,
    fixedRotation: false
  }, options);
  var bd = new Box2D.Dynamics.b2BodyDef;
  bd.type = type;
  bd.position.x = options.x;
  bd.position.y = options.y;
  bd.angle = options.angle;
  bd.fixedRotation = options.fixedRotation;
  return bd;
}
  

},{"../../../3rdparty/underscore-min":12}],43:[function(require,module,exports){
var hub = require('../engine/hub');

function TimeBasedMessage(triggerTime, message, args) {

  this.triggerTime  = triggerTime;
  this.message      = message;
  this.args         = args;
  this.triggered    = false;

}

TimeBasedMessage.prototype.update = function(time) {
  if (this.triggered === false && time <= this.triggerTime) {
    hub.send(this.message, this.args);
    this.triggered = true;
  }
};

module.exports = TimeBasedMessage;

},{"../engine/hub":9}],40:[function(require,module,exports){
var Entity      = require('../../engine/entity');
var hub         = require('../../engine/hub');
var assets      = require('../../assets');

function Crowd() {
  this.id = 'crowd';
  hub.send('engine.sound.play', sound('crowd', true, 0.7));
  hub.on('game.score', this.cheer.bind(this));
  hub.on('game.finishing', this.organ.bind(this));
  hub.on('game.end', this.end.bind(this));
}

Crowd.prototype = new Entity();

Crowd.prototype.destroy = function() {
  hub.send('engine.sound.stop', sound('crowd'));
};

Crowd.prototype.cheer = function(args) {
  if (args.againstIndex !== args.ball.kickedBy) {
    hub.send('engine.sound.play', sound('crowd-scored', false));
  } else {
    hub.send('engine.sound.play', sound('crowd-oh', false));
  }
};

Crowd.prototype.organ = function() {
  // hub.send('engine.sound.play', sound('crowd-organ', false));
};

Crowd.prototype.end = function() {
  // hub.send('engine.sound.stop', sound('crowd-organ'));
  // hub.send('engine.sound.play', sound('crowd-end', false));
};

function sound(name, loop, volume) {
  return {
    file: assets.sound(name),
    loop: loop,
    volume: volume || 1
  };
}

module.exports = Crowd;

},{"../../engine/hub":9,"../../engine/entity":35,"../../assets":10}],39:[function(require,module,exports){
var CompoundEntity  = require('../../engine/compound-entity');
var Background      = require('./background');
var Wall            = require('./wall');
var Cone            = require('./cone');
var Goal            = require('./goal');
var world           = require('../world');

var PI     = 3.14159;
var width  = world.width;
var height = world.height;
var top    = 3.4;
var left   = 0.5;
var right  = world.width  - 0.5;
var bottom = world.height - 2.4;

function Stadium() {
  
  this.id = 'stadium';
  
  this.entities = [];
  this.entities.push(new Background());
  
  this.entities.push(new Wall('wall-top',               width / 2,      top,                width,   1,               0));
  this.entities.push(new Wall('wall-bottom',            width / 2,      bottom,             width,   1,               0));
  this.entities.push(new Wall('wall-left1',             left  + 2.8,    height * 0.85/6,    1,       height / 2.5,    0.08));
  this.entities.push(new Wall('wall-left2',             left  + 1.1,    height * 5.10/6,    1,       height / 2.5,    0.05));
  this.entities.push(new Wall('wall-right1',            right - 2.7,    height * 0.85/6,    1,       height / 2.5,   -0.06));
  this.entities.push(new Wall('wall-right2',            right - 1.2,    height * 5.10/6,    1,       height / 2.5,   -0.05));
  this.entities.push(new Wall('wall-goal-left-top',     0,              height / 2 - 6.0,   4,       1,               0));
  this.entities.push(new Wall('wall-goal-left-bottom',  0,              height / 2 + 5.1,   2.7,     1,               0));
  this.entities.push(new Wall('wall-goal-right-top',    width,          height / 2 - 5.9,   4,       1,               0));
  this.entities.push(new Wall('wall-goal-right-bottom', width,          height / 2 + 5.1,   2.5,     1,               0));
    
  this.entities.push(new Cone('cone1', width / 12 * 6,   height / 5 * 1.5));
  this.entities.push(new Cone('cone2', width / 12 * 6,   height / 5 * 3.5));
  
  this.entities.push(new Goal('goalp1', 0,  0,            height / 2, 0.5, 14));
  this.entities.push(new Goal('goalp2', 1,  world.width,  height / 2, 0.5, 14));
  
}

Stadium.prototype = new CompoundEntity();

Stadium.prototype.shake = function(againstPlayerIndex) {
  this.entities[0].shake(againstPlayerIndex);
};

module.exports = Stadium;

},{"../../engine/compound-entity":46,"./background":47,"./wall":48,"./cone":49,"./goal":50,"../world":8}],41:[function(require,module,exports){
var PF          = require('../../engine/physics-factory');
var GF          = require('../../engine/graphics-factory');
var Entity      = require('../../engine/entity');
var world       = require('../world');
var hub         = require('../../engine/hub');
var assets      = require('../../assets');

var fixture = PF.fixture({
  shape:      PF.shape.circle(1.7),
  dynamics:   {density: 1, friction: 0.5, restitution: 1},
  category:   PF.categories.PLAYER,
  collision:  PF.categories.ARENA | PF.categories.BALL
});

var ANIM_REST = 0;
var ANIM_UP   = 1;
var ANIM_DOWN = 2;

function Player(id, index, name, x, y) {
  
  this.id    = id;
  this.index = index;
  this.name  = name;
  
  this.bodySpec = {
    body: PF.dynamic({ x: x, y: y, fixedRotation: true }),
    fixture: fixture
  };
  
  this.constraintSpec = {
    body: PF.static({x: x, y: 0}),
    fixture: PF.fixture({
      shape: PF.shape.box(1, 1),
      dynamics: {density: 0, friction: 0, restitution: 0},
    })
  };
  
  if (this.id === 'p1') {
    this.sprite = GF.animation(assets.images('cat', 'cat-up', 'cat-down'), 6, 6);
  } else {
    this.sprite = GF.animation(assets.images('dog', 'dog-up', 'dog-down'), 6, 6);
  }
  
}

Player.prototype = new Entity();

Player.prototype.create = function(engine, game) {
  Entity.prototype.create.call(this, engine, game);
  this.body.SetLinearDamping(2);
  this.constraintBody = engine.physics.create(this.constraintSpec.body, this.constraintSpec.fixture);
  var verticalAxis = new Box2D.Common.Math.b2Vec2(0,1);
  var joint  = new Box2D.Dynamics.Joints.b2LineJointDef();
  joint.Initialize(this.constraintBody, this.body, this.body.GetPosition(), verticalAxis);
  engine.physics.b2world.CreateJoint(joint);  
}

Player.prototype.destroy = function(engine, game) {
  Entity.prototype.destroy.call(this, engine, game);
  engine.physics.destroy(this.constraintBody);
};

Player.prototype.update = function(engine, game, delta) {
  Entity.prototype.update.call(this, engine, game, delta);
  // We should be able to specify "0.5", and not have to update it constantly
  // Need to check our changes to PIXI
  this.sprite.anchor.x = this.sprite.texture.width  / 2;
  this.sprite.anchor.y = this.sprite.texture.height / 2;
};

Player.prototype.collision = function(other, points) {    
  if (other.id.match(/ball/)) {
    other.kickedBy = this.index;
    hub.send('engine.sound.play', {file: '/game/sounds/bounce.mp3'});
  } else if (other.id.match(/wall/)) {
    this.sprite.gotoAndStop(ANIM_REST);
    this.body.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(0, 5));
  }
};

Player.prototype.move = function(dir) {
  window.clearTimeout(this.endFlame);
  var y = (dir === 'up') ? -32: 32;
  this.body.SetAwake(true);
  this.body.SetLinearVelocity(new Box2D.Common.Math.b2Vec2(0, y));
  if (y < 0) {
    this.sprite.gotoAndStop(ANIM_UP);
  } else {
    this.sprite.gotoAndStop(ANIM_DOWN);
  }
  this.endFlame = setTimeout(function() {
    this.sprite.gotoAndStop(0);
  }.bind(this), 200);
};

module.exports = Player;

},{"../../engine/physics-factory":37,"../../engine/graphics-factory":36,"../../engine/entity":35,"../world":8,"../../engine/hub":9,"../../assets":10}],42:[function(require,module,exports){
var Entity = require('../../engine/entity');
var GF = require('../../engine/graphics-factory');
var userInterface = require('../../engine/user-interface');

var TEXT_TOP          = userInterface.unit(2.85);
var PLAYERS_MARGIN_X  = userInterface.unit(20);

function Hud(text) {
  
  this.id = 'hud';
  
  this.p1Name = GF.text('John Doe', userInterface.unit(3), {fill: '#01518d', stroke: '#fff', strokeThickness: 3 });
  this.p1Name.position.x = userInterface.unit(20) - this.p1Name.width / 2;
  this.p1Name.position.y = TEXT_TOP;

  this.p2Name = GF.text('John Doe', userInterface.unit(3), {fill: '#bf0000', stroke: '#fff', strokeThickness: 3 });
  this.p2Name.position.x = userInterface.width - userInterface.unit(17) - this.p2Name.width / 2;
  this.p2Name.position.y = TEXT_TOP;

  this.p1Score = GF.text('0', userInterface.unit(3), {fill: '#fff', stroke: '#000', strokeThickness: 3 });
  this.p1Score.position.x = userInterface.unit(33.5) - this.p1Score.width / 2;
  this.p1Score.position.y = TEXT_TOP;

  this.p2Score = GF.text('0', userInterface.unit(3), {fill: '#fff', stroke: '#000', strokeThickness: 3 });
  this.p2Score.position.x = userInterface.width - userInterface.unit(36) - this.p2Score.width / 2;
  this.p2Score.position.y = TEXT_TOP;

  this.time = GF.text(fourDigits(0), userInterface.unit(3), {fill: '#fff', stroke: '#000', strokeThickness: 3 });
  this.time.position.x = userInterface.width / 2 - this.time.width / 2;
  this.time.position.y = TEXT_TOP;
    
};

Hud.prototype = new Entity();

Hud.prototype.create = function(engine, game) {
  engine.graphics.add(this.p1Name);
  engine.graphics.add(this.p1Score);
  engine.graphics.add(this.p2Name);
  engine.graphics.add(this.p2Score);
  engine.graphics.add(this.time);
};

Hud.prototype.destroy = function(engine, game) {
  engine.graphics.remove(this.p1Name);
  engine.graphics.remove(this.p1Score);
  engine.graphics.remove(this.p2Name);
  engine.graphics.remove(this.p2Score);
  engine.graphics.remove(this.time);
};

Hud.prototype.update = function(engine, game, delta) {
  var p1 = game.players[0];
  var p2 = game.players[1];
  this.p1Name.setText(p1.name);
  this.p1Score.setText(p1.score.toString());
  this.p2Name.setText(p2.name);
  this.p2Score.setText(p2.score.toString());
  this.time.setText(fourDigits(game.timeRemaining));
};

function fourDigits(milliseconds) {
  var seconds = Math.floor(milliseconds / 1000);
  var padded = (seconds < 10) ? ('0' + seconds) : seconds;
  return '00:' + padded;
}

module.exports = Hud;

},{"../../engine/entity":35,"../../engine/graphics-factory":36,"../../engine/user-interface":32}],44:[function(require,module,exports){
var GF            = require('../../engine/graphics-factory');
var Entity        = require('../../engine/entity');
var userInterface = require('../../engine/user-interface');
var mathUtils     = require('../../engine/math-utils');
var assets        = require('../../assets');

var PI              = 3.14;
var STRETCH_CIRCLE  =  80;  // millis
var STRETCH_SPLASH  = 180;  // millis
var STRETCH_LINE    = 300;  // millis

function Boom(id, againstPlayerIndex) {
  
  this.id = id;
  
  var x = (againstPlayerIndex === 0) ? 0 : userInterface.width;
  
  this.circle = GF.uiSprite(assets.image('boom-circle'), 0, userInterface.height / 2, 0);
  this.circle.position.x = x;
  this.circle.position.y = userInterface.height / 2;

  this.splash = GF.uiSprite(assets.image('boom-splash'), 0, userInterface.height / 1.2, 0);
  this.splash.position.x = x;
  this.splash.position.y = userInterface.height / 2;

  this.line = GF.uiSprite(assets.image('boom-line'), 0, userInterface.height / 4, 0);
  this.line.position.x = x;
  this.line.position.y = userInterface.height / 2;

  if (againstPlayerIndex === 1) {
    this.circle.rotation = PI;
    this.splash.rotation = PI;
    this.line.rotation  = PI;
  }
  
  this.time = 0;
  
}

Boom.prototype = new Entity();

Boom.prototype.create = function(engine, game) {
  engine.graphics.add(this.circle);
  engine.graphics.add(this.splash);
  engine.graphics.add(this.line);
};

Boom.prototype.destroy = function(engine, game) {
  engine.graphics.remove(this.circle);
  engine.graphics.remove(this.splash);
  engine.graphics.remove(this.line);
};

Boom.prototype.update = function(engine, game, delta) {
  this.circle.anchor.y = this.circle.texture.height / 2;
  this.splash.anchor.y = this.splash.texture.height / 2;
  this.line.anchor.y  = this.line.texture.height  / 2;

  this.time = this.time + delta;
  var stretchCircle = mathUtils.clamp(this.time, 0, STRETCH_CIRCLE);
  var stretchSplash = mathUtils.clamp(this.time, 0, STRETCH_SPLASH);
  var stretchLine   = mathUtils.clamp(this.time, 0, STRETCH_LINE);
  
  this.circle.width = interpolate(stretchCircle, 0, STRETCH_CIRCLE, 0, this.circle.height * 0.71);
  this.splash.width = interpolate(stretchSplash, 0, STRETCH_SPLASH, 0, this.splash.height * 0.5);
  this.line.width   = interpolate(stretchLine,   0, STRETCH_LINE,   0, this.line.height   * 7.26);
  
  if (this.time >= STRETCH_CIRCLE) { this.circle.alpha *= 0.95; }
  if (this.time >= STRETCH_SPLASH) { this.splash.alpha *= 0.95; }
  if (this.time >= STRETCH_LINE)   { this.line.alpha   *= 0.95; }
};

function interpolate(current, inputMin, inputMax, outputMin, outputMax) {
  return outputMin + (current / (inputMax-inputMin)) * (outputMax - outputMin);
}

module.exports = Boom;

},{"../../engine/graphics-factory":36,"../../engine/entity":35,"../../engine/user-interface":32,"../../engine/math-utils":38,"../../assets":10}],45:[function(require,module,exports){
var Entity = require('../../engine/entity');
var GF = require('../../engine/graphics-factory');
var userInterface = require('../../engine/user-interface');

function Winner(id, p1, p2) {
  
  this.id = id;
  
  var bg   = (p1.score === p2.score) ? '/game/images/end-draw.png' : '/game/images/end-winner.png';
  var name = (p1.score > p2.score) ? p1.name : p2.name;
  
  this.background = GF.uiSprite(bg, userInterface.width, userInterface.height);
  this.background.position.x = userInterface.width  / 2 - this.background.width  / 2;
  this.background.position.y = userInterface.height / 2 - this.background.height / 2;
    
  if (p1.score != p2.score) {
    this.name = GF.text(name, 45, {fill: '#01518d', stroke: '#fff', strokeThickness: 3});
    this.name.position.x = userInterface.width / 2 - this.name.width / 2 - 20;
    this.name.position.y = userInterface.unit(15);
  }
  
};

Winner.prototype = new Entity();

Winner.prototype.create = function(engine, game) {
  engine.graphics.add(this.background);
  if (this.name) {
    engine.graphics.add(this.name);
  }
};

Winner.prototype.destroy = function(engine, game) {
  engine.graphics.remove(this.background);
  if (this.name) {
    engine.graphics.remove(this.name);
  }
};

module.exports = Winner;

},{"../../engine/entity":35,"../../engine/graphics-factory":36,"../../engine/user-interface":32}],46:[function(require,module,exports){
var _ = require('../../../3rdparty/underscore-min');
var Entity = require('./entity');

var globalCount = 0;

var CompoundEntity = function() {
  this.id       = (++globalCount);
  this.entities = [];
};

CompoundEntity.prototype.create = function(engine, game) {
  this.entities.forEach(function(entity) {
    entity.create(engine, game);
  });
};

CompoundEntity.prototype.destroy = function(engine, game) {
  this.entities.forEach(function(entity) {
    entity.destroy(engine, game);
  });
};

CompoundEntity.prototype.update = function(engine, game) {
  this.entities.forEach(function(entity) {
    entity.update(engine, game);
  });
};

CompoundEntity.prototype.collision = function(other, points) {
};

module.exports = CompoundEntity;

},{"../../../3rdparty/underscore-min":12,"./entity":35}],47:[function(require,module,exports){
var GF          = require('../../engine/graphics-factory');
var Entity      = require('../../engine/entity');
var world       = require('../../engine/world');
var assets      = require('../../assets');
var gameWorld   = require('../world');

function Background(image) {
  this.id = 'background';
  this.sprite = GF.animation(assets.images('stadium', 'stadium-shake-right', 'stadium-shake-left'), gameWorld.width, gameWorld.height);
}

Background.prototype = new Entity();

Background.prototype.shake = function(againstPlayerIndex) {
  this.sprite.gotoAndStop(againstPlayerIndex === 0 ? 2 : 1);
  setTimeout(function() {
    this.sprite.gotoAndStop(againstPlayerIndex === 0 ? 1 : 2);
  }.bind(this), 50);
  setTimeout(function() {
    this.sprite.gotoAndStop(0);
  }.bind(this), 100);
};

module.exports = Background;

},{"../../engine/graphics-factory":36,"../../engine/entity":35,"../../engine/world":33,"../../assets":10,"../world":8}],48:[function(require,module,exports){
var PF          = require('../../engine/physics-factory');
var GF          = require('../../engine/graphics-factory');
var Entity      = require('../../engine/entity');
var world       = require('../../engine/world');

function Wall(id, x, y, width, height, rotation) {
  this.id = id;
  this.bodySpec = {
    body: PF.static({
      x: x,
      y: y,
      angle: rotation || 0
    }),
    fixture: PF.fixture({
      shape:      PF.shape.box(width, height),
      dynamics:   {density: 1, friction: 0.1, restitution: 1},
      category:   PF.categories.ARENA,
      collision:  PF.categories.ALL
    })
  };
  // this.sprite = GF.tile('/game/images/wall.png', width, height, rotation);
  // this.sprite.position.x = world.toPixels(x);
  // this.sprite.position.y = world.toPixels(y);
}

Wall.prototype = new Entity();

module.exports = Wall;

},{"../../engine/physics-factory":37,"../../engine/graphics-factory":36,"../../engine/entity":35,"../../engine/world":33}],49:[function(require,module,exports){
var _           = require('../../../../3rdparty/underscore-min');
var PF          = require('../../engine/physics-factory');
var GF          = require('../../engine/graphics-factory');
var Entity      = require('../../engine/entity');
var world       = require('../../engine/world');
var hub         = require('../../engine/hub');
var assets      = require('../../assets');

var PI = 3.14159;

var fixtureOpts = {
  dynamics:   {density: 1.5, friction: 1, restitution: 1},
  category:   PF.categories.ARENA,
  collision:  PF.categories.ALL
};

function Cone(id, x, y) {
  this.id = id;
  this.sprite = GF.sprite(assets.image('cone'), 2.5, 4);
  this.bodySpec = {
    body: PF.dynamic({ x: x, y: y, fixedRotation: true }),
    fixture: PF.fixture(_.extend(fixtureOpts, {
      shape: PF.shape.circle(0.7, new Box2D.Common.Math.b2Vec2(0,0.6))
    }))
  };
}

Cone.prototype = new Entity();

Cone.prototype.create = function(engine, game) {
  Entity.prototype.create.call(this, engine, game);
  var otherFixture = PF.fixture(_.extend(fixtureOpts, {
    shape: PF.shape.box(0.7, 1.9, new Box2D.Common.Math.b2Vec2(0,-0.1))
  }));
  otherFixture.userData = this;
  this.body.CreateFixture(otherFixture);
  this.body.SetLinearDamping(6);
};

Cone.prototype.update = function(engine, game, delta) {
  Entity.prototype.update.call(this, delta);
  // We should be able to specify "0.5", and not have to update it constantly
  // Need to check our changes to PIXI
  this.sprite.anchor.x = this.sprite.texture.width  / 2;
  this.sprite.anchor.y = this.sprite.texture.height / 3;
};

Cone.prototype.collision = function(other, points) {    
  if (other.id.match(/ball/)) {
    other.kickedBy = this.index;
    hub.send('engine.sound.play', {file: '/game/sounds/bounce.mp3'});
  }
};

module.exports = Cone;

},{"../../../../3rdparty/underscore-min":12,"../../engine/physics-factory":37,"../../engine/graphics-factory":36,"../../engine/entity":35,"../../engine/world":33,"../../engine/hub":9,"../../assets":10}],50:[function(require,module,exports){
var PF          = require('../../engine/physics-factory');
var GF          = require('../../engine/graphics-factory');
var Entity      = require('../../engine/entity');
var hub         = require('../../engine/hub');

function Goal(id, playerIndex, x, y, width, height, rotation) {
  this.id = id;
  this.playerIndex = playerIndex;
  this.bodySpec = {
    body: PF.static({
      x: x,
      y: y,
      angle: rotation || 0
    }),
    fixture: PF.fixture({
      shape:      PF.shape.box(width, height),
      dynamics:   {density: 1, friction: 0, restitution: 1},
      category:   PF.categories.ARENA,
      collision:  PF.categories.ALL
    })
  };
  // this.sprite = GF.sprite('/game/images/goal.png', width, height, rotation);
}

Goal.prototype = new Entity();

Goal.prototype.collision = function(other, points) {    
  if (other.id.match(/ball:/)) {
    hub.send('game.score', {
      ball: other,
      againstIndex: this.playerIndex,
    });
    hub.send('engine.explosion', {
      source: points[0],
      size: 'large'
    });
  }
};

Goal.prototype.update = function(delta) {
  Entity.prototype.update.call(this, delta);
};

module.exports = Goal;

},{"../../engine/physics-factory":37,"../../engine/graphics-factory":36,"../../engine/entity":35,"../../engine/hub":9}]},{},[1])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9tYWluLmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzL2dhbWUvanMvYnJpZGdlLWtleWJvYXJkLmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS93b3JsZC5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2Fzc2V0LWxvYWRlci5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2JyaWRnZS1zb2NrZXQuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvZW5naW5lLmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzL2dhbWUvanMvaW50cm8vaW50cm8uanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9nYW1lL2dhbWUuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvaHViLmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzLzNyZHBhcnR5L3NvY2tldC5pby5taW4uanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvM3JkcGFydHkvdW5kZXJzY29yZS1taW4uanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvdGlja2VyLmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzL2dhbWUvanMvZW5naW5lL2VudGl0eXRyYWNrZXIuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvdGltZS5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy8zcmRwYXJ0eS9ldmUuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9hc3NldHMuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvZ3JhcGhpY3MtZW5naW5lLmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzL2dhbWUvanMvZW5naW5lL3BoeXNpY3MtZW5naW5lLmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzL2dhbWUvanMvZW5naW5lL3NvdW5kLWVuZ2luZS5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2VuZ2luZS9wYXJ0aWNsZS1lbmdpbmUuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9nYW1lL3NlcXVlbmNlci5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2ludHJvL2VudGl0aWVzL0xlYWRlcmJvYXJkLmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzL2dhbWUvanMvaW50cm8vZW50aXRpZXMvVGl0bGUuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9pbnRyby9lbnRpdGllcy9BYm91dC5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvZW50aXRpZXMvYmFsbC5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvZW50aXRpZXMvYWN0aW9uLXRleHQuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9nYW1lL3N0YXRlcy93YXJtdXAuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9nYW1lL3N0YXRlcy9raWNrb2ZmLmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS9zdGF0ZXMvcGxheS5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvc3RhdGVzL3Njb3JlZC5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvc3RhdGVzL2VuZG9mbWF0Y2guanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvdXNlci1pbnRlcmZhY2UuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvd29ybGQuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvbWF0aC11dGlscy5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2VuZ2luZS9leHBsb3Npb24uanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvZW50aXR5LmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzL2dhbWUvanMvZW5naW5lL2dyYXBoaWNzLWZhY3RvcnkuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvcGh5c2ljcy1mYWN0b3J5LmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS90aW1lLWJhc2VkLW1lc3NhZ2UuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9nYW1lL2VudGl0aWVzL2Nyb3dkLmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS9lbnRpdGllcy9zdGFkaXVtLmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS9lbnRpdGllcy9wbGF5ZXIuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9nYW1lL2VudGl0aWVzL2h1ZC5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvZW50aXRpZXMvYm9vbS5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvZW50aXRpZXMvd2lubmVyLmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzL2dhbWUvanMvZW5naW5lL2NvbXBvdW5kLWVudGl0eS5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvZW50aXRpZXMvYmFja2dyb3VuZC5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvZW50aXRpZXMvd2FsbC5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvZW50aXRpZXMvY29uZS5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvZW50aXRpZXMvZ29hbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNySkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBOztBQ0RBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDblhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3REQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyJ2YXIgYXNzZXRMb2FkZXIgICAgID0gcmVxdWlyZSgnLi9hc3NldC1sb2FkZXInKTtcbnZhciBicmlkZ2VTb2NrZXQgICAgPSByZXF1aXJlKCcuL2JyaWRnZS1zb2NrZXQnKTtcbnZhciBicmlkZ2VLZXlib2FyZCAgPSByZXF1aXJlKCcuL2JyaWRnZS1rZXlib2FyZCcpO1xudmFyIEVuZ2luZSAgICAgICAgICA9IHJlcXVpcmUoJy4vZW5naW5lL2VuZ2luZScpO1xudmFyIEludHJvICAgICAgICAgICA9IHJlcXVpcmUoJy4vaW50cm8vaW50cm8nKVxudmFyIEdhbWUgICAgICAgICAgICA9IHJlcXVpcmUoJy4vZ2FtZS9nYW1lJyk7XG52YXIgd29ybGQgICAgICAgICAgID0gcmVxdWlyZSgnLi9nYW1lL3dvcmxkJyk7XG52YXIgaHViICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9lbmdpbmUvaHViJyk7XG5cbndpbmRvdy5NYWluID0gZnVuY3Rpb24oKSB7XG4gIGFzc2V0TG9hZGVyLnByZWxvYWRBbmRSdW4obWFpbkxvb3ApO1xufTtcblxuZnVuY3Rpb24gbWFpbkxvb3AoKSB7XG4gIFxuICB2YXIgY29udGFpbmVyICA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNjb250YWluZXInKTtcbiAgdmFyIGdhbWVWaWV3ICAgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjZ2FtZVZpZXcnKTtcbiAgdmFyIGRlYnVnVmlldyAgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjZGVidWdWaWV3Jyk7XG4gIFxuICBkZWJ1Z1ZpZXcuaGVpZ2h0ID0gd2luZG93LmlubmVySGVpZ2h0O1xuICBkZWJ1Z1ZpZXcud2lkdGggID0gd2luZG93LmlubmVyV2lkdGg7XG4gIGdhbWVWaWV3LmhlaWdodCAgPSB3aW5kb3cuaW5uZXJIZWlnaHQ7XG4gIGdhbWVWaWV3LndpZHRoICAgPSB3aW5kb3cuaW5uZXJXaWR0aDtcbiAgXG4gIHZhciBlbmdpbmUgPSBuZXcgRW5naW5lKHdvcmxkLCBnYW1lVmlldywgZGVidWdWaWV3KTtcbiAgdmFyIGdhbWUgICA9IG51bGw7XG5cbiAgZnVuY3Rpb24gc2hvd0ludHJvKCkge1xuICAgIGNsZWFudXAoKTtcbiAgICBlbmdpbmUuYXR0YWNoKG5ldyBJbnRybyhlbmdpbmUpKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG1hdGNoU3RhcnQocGxheWVycykge1xuICAgIGNsZWFudXAoKTtcbiAgICBpZiAoIWdhbWUpIHtcbiAgICAgIGdhbWUgPSBuZXcgR2FtZShlbmdpbmUsIHBsYXllcnMpO1xuICAgICAgZW5naW5lLmF0dGFjaChnYW1lKTtcbiAgICAgIGh1Yi5vbignZ2FtZS5maW5pc2gnLCBlbmRNYXRjaE9uU2VydmVyKTtcbiAgICB9XG4gIH1cbiAgXG4gIGZ1bmN0aW9uIHBsYXllck1vdmUoYXJncykgeyAgICBcbiAgICBpZiAoZ2FtZSkge1xuICAgICAgZ2FtZS5tb3ZlKGFyZ3MucGluZGV4LCBhcmdzLmRpcik7XG4gICAgfVxuICB9XG4gIFxuICBmdW5jdGlvbiBlbmRNYXRjaE9uU2VydmVyKCkge1xuICAgICQucG9zdCgnL2dhbWUvc3RhdHVzJywge1xuICAgICAgc3RhdHVzOiAnZmluaXNoZWQnLFxuICAgICAgcGxheWVyczogZ2FtZS5wbGF5ZXJzLm1hcChmdW5jdGlvbihwbGF5ZXIpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBpZDogcGxheWVyLmlkLFxuICAgICAgICAgIHNjb3JlOiBwbGF5ZXIuc2NvcmVcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9KS50aGVuKHNob3dJbnRybykuZmFpbChzaG93SW50cm8pO1xuICB9XG4gIFxuICBmdW5jdGlvbiBjbGVhbnVwKCkge1xuICAgIGh1Yi51bmJpbmQoJ2dhbWUuKicpO1xuICAgIGVuZ2luZS5kZXRhY2goKTtcbiAgICBlbmdpbmUucmVzZXQoKTtcbiAgICBnYW1lID0gbnVsbDtcbiAgfSAgXG5cbiAgZW5naW5lLnN0YXJ0KCk7XG4gIHNob3dJbnRybygpO1xuICBicmlkZ2VLZXlib2FyZC5jb25uZWN0KG1hdGNoU3RhcnQsIHBsYXllck1vdmUpO1xuICBicmlkZ2VTb2NrZXQuY29ubmVjdChtYXRjaFN0YXJ0LCBwbGF5ZXJNb3ZlKTtcbn1cbiIsIlxuZXhwb3J0cy5jb25uZWN0ID0gZnVuY3Rpb24obWF0Y2hTdGFydCwgcGxheWVyTW92ZSkge1xuXG4gIHZhciBrZXlkb3duICAgICAgID0gJChkb2N1bWVudCkua2V5ZG93bkFzT2JzZXJ2YWJsZSgpLnNlbGVjdChrZXlDb2RlKTtcbiAgdmFyIGtleXVwICAgICAgICAgPSAkKGRvY3VtZW50KS5rZXl1cEFzT2JzZXJ2YWJsZSgpO1xuICB2YXIgc2luZ2xlZG93biAgICA9IGtleWRvd24ubWVyZ2Uoa2V5dXApLmRpc3RpbmN0VW50aWxDaGFuZ2VkKCk7XG4gIFxuICBzaW5nbGVkb3duLndoZXJlKGtleSgxMykpLnN1YnNjcmliZShzdGFydCk7XG4gIHNpbmdsZWRvd24ud2hlcmUobGV0dGVyKCdRJykpLnN1YnNjcmliZShtb3ZlKDAsICd1cCcpKTtcbiAgc2luZ2xlZG93bi53aGVyZShsZXR0ZXIoJ1MnKSkuc3Vic2NyaWJlKG1vdmUoMCwgJ2Rvd24nKSk7XG4gIHNpbmdsZWRvd24ud2hlcmUobGV0dGVyKCdQJykpLnN1YnNjcmliZShtb3ZlKDEsICd1cCcpKTtcbiAgc2luZ2xlZG93bi53aGVyZShsZXR0ZXIoJ0wnKSkuc3Vic2NyaWJlKG1vdmUoMSwgJ2Rvd24nKSk7XG5cbiAgZnVuY3Rpb24ga2V5Q29kZShlKSB7XG4gICAgcmV0dXJuIGUua2V5Q29kZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGtleShjKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGNvZGUpIHtcbiAgICAgIHJldHVybiBjb2RlID09PSBjO1xuICAgIH07XG4gIH1cbiAgXG4gIGZ1bmN0aW9uIGxldHRlcihsKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGNvZGUpIHtcbiAgICAgIHJldHVybiBjb2RlID09PSBsLmNoYXJDb2RlQXQoMCk7XG4gICAgfTtcbiAgfVxuICBcbiAgZnVuY3Rpb24gc3RhcnQoKSB7XG4gICAgbWF0Y2hTdGFydChbXG4gICAgICB7IGlkOiAnMScsIGZpcnN0TmFtZTogJ0pvaG4nLCBsYXN0TmFtZTogJ0RvZScgICB9LFxuICAgICAgeyBpZDogJzInLCBmaXJzdE5hbWU6ICdCaWxsJywgbGFzdE5hbWU6ICdDb3NieScgfVxuICAgIF0pO1xuICB9XG4gIFxuICBmdW5jdGlvbiBtb3ZlKGluZGV4LCBkaXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7IFxuICAgICAgY29uc29sZS5sb2coJ1trZXlib2FyZF0gbW92ZSAnICsgaW5kZXggKyAnICcgKyBkaXIpO1xuICAgICAgcGxheWVyTW92ZSh7XG4gICAgICAgIHBpbmRleDogaW5kZXgsXG4gICAgICAgIGRpcjogZGlyXG4gICAgICB9KTtcbiAgICB9O1xuICB9XG4gIFxufTtcbiIsIlxuLy8gVGhlIGJpZyBUViBmb3IgdGhlIGdhbWUgaXMgMTY6OVxuZXhwb3J0cy53aWR0aCAgPSA2MDtcbmV4cG9ydHMuaGVpZ2h0ID0gNjAgLyAoMTYvOSk7XG4iLCJ2YXIgYXNzZXRzID0gcmVxdWlyZSgnLi9hc3NldHMnKTtcblxuZnVuY3Rpb24gbG9hZEltYWdlcyhjYWxsYmFjaykge1xuICB2YXIgYXNzZXRMb2FkZXIgPSBuZXcgUElYSS5Bc3NldExvYWRlcihhc3NldHMuYWxsSW1hZ2VzKCkpO1xuICBhc3NldExvYWRlci5vbkNvbXBsZXRlID0gY2FsbGJhY2s7XG4gIGFzc2V0TG9hZGVyLmxvYWQoKTtcbn1cblxuZnVuY3Rpb24gbG9hZEZvbnRzKGNhbGxiYWNrKSB7XG4gIFdlYkZvbnQubG9hZCh7XG4gICAgYWN0aXZlOiBjYWxsYmFjayxcbiAgICBjdXN0b206IHtcbiAgICAgIGZhbWlsaWVzOiBbJ0x1Y2tpZXN0R3V5J10sXG4gICAgICB1cmxzOiBbJy8zcmRwYXJ0eS9sdWNraWVzdC1ndXkuY3NzJ10sXG4gICAgfVxuICB9KTtcbn1cblxuZXhwb3J0cy5wcmVsb2FkQW5kUnVuID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgbG9hZEltYWdlcyhmdW5jdGlvbigpIHtcbiAgICBsb2FkRm9udHMoZnVuY3Rpb24oKSB7XG4gICAgICBjYWxsYmFjaygpO1xuICAgIH0pO1xuICB9KTtcbn1cbiIsInZhciBpbyA9IHJlcXVpcmUoJy4uLy4uLzNyZHBhcnR5L3NvY2tldC5pby5taW4nKTtcblxuZXhwb3J0cy5jb25uZWN0ID0gZnVuY3Rpb24obWF0Y2hTdGFydCwgcGxheWVyTW92ZSkge1xuXG4gIGZ1bmN0aW9uIG9wZW5Tb2NrZXQoKSB7XG4gICAgdmFyIHNvY2tldCA9IGlvLmNvbm5lY3QoJy8nLCB7XG4gICAgICAncmVjb25uZWN0JzogZmFsc2UsXG4gICAgICAnZm9yY2UgbmV3IGNvbm5lY3Rpb24nOiB0cnVlXG4gICAgfSk7XG5cbiAgICBzb2NrZXQub24oJ2Nvbm5lY3QnLCBmdW5jdGlvbigpe1xuICAgICAgY29uc29sZS5sb2coXCJjb25uZWN0ZWQhXCIpO1xuICAgICAgc29ja2V0LmVtaXQoJ2lkZW50aWZ5JylcbiAgICB9KTtcblxuICAgIHNvY2tldC5vbignbWF0Y2gtc3RhcnQnLCBtYXRjaFN0YXJ0KTtcbiAgICBzb2NrZXQub24oJ3BsYXllci1hY3Rpb24nLCBwbGF5ZXJBY3Rpb24pO1xuXG4gICAgc29ja2V0Lm9uKCdkaXNjb25uZWN0JywgZnVuY3Rpb24oKXtcbiAgICAgIGNvbnNvbGUubG9nKFwic29ja2V0IGRpc2Nvbm5lY3RlZFwiKTtcbiAgICAgIG9wZW5Tb2NrZXQoKTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBsYXllckFjdGlvbihhcmdzKSB7XG4gICAgaWYgKGFyZ3MuYWN0aW9uID09PSAndXAnKSB7XG4gICAgICBjb25zb2xlLmxvZygnW3NvY2tldF0gbW92ZSAnICArIGFyZ3MucGluZGV4ICsgJyB1cCcpO1xuICAgICAgcGxheWVyTW92ZSh7cGluZGV4OiBhcmdzLnBpbmRleCwgZGlyOiAndXAnfSk7XG4gICAgfSBlbHNlIGlmIChhcmdzLmFjdGlvbiA9PT0gJ2Rvd24nKSB7XG4gICAgICBjb25zb2xlLmxvZygnW3NvY2tldF0gbW92ZSAnICArIGFyZ3MucGluZGV4ICsgJyBkb3duJyk7XG4gICAgICBwbGF5ZXJNb3ZlKHtwaW5kZXg6IGFyZ3MucGluZGV4LCBkaXI6ICdkb3duJ30pO1xuICAgIH1cbiAgfVxuXG4gIG9wZW5Tb2NrZXQoKTtcbn07XG4iLCJ2YXIgXyAgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvdW5kZXJzY29yZS1taW4nKTtcbnZhciBHcmFwaGljc0VuZ2luZSAgPSByZXF1aXJlKCcuL2dyYXBoaWNzLWVuZ2luZScpO1xudmFyIFBoeXNpY3NFbmdpbmUgICA9IHJlcXVpcmUoJy4vcGh5c2ljcy1lbmdpbmUnKTtcbnZhciBTb3VuZEVuZ2luZSAgICAgPSByZXF1aXJlKCcuL3NvdW5kLWVuZ2luZScpO1xudmFyIFBhcnRpY2xlRW5naW5lICA9IHJlcXVpcmUoJy4vcGFydGljbGUtZW5naW5lJyk7XG52YXIgdGlja2VyICAgICAgICAgID0gcmVxdWlyZSgnLi90aWNrZXInKTtcbnZhciBFbnRpdHlUcmFja2VyICAgPSByZXF1aXJlKCcuL2VudGl0eXRyYWNrZXInKTtcbnZhciBUaW1lICAgICAgICAgICAgPSByZXF1aXJlKCcuL3RpbWUnKTtcbnZhciBodWIgICAgICAgICAgICAgPSByZXF1aXJlKCcuL2h1YicpO1xuXG5cbmZ1bmN0aW9uIEVuZ2luZSh3b3JsZCwgbWFpblZpZXcsIGRlYnVnVmlldykge1xuICBcbiAgdGhpcy5uZXh0VGlja0FjdGlvbnMgID0gW107XG4gIFxuICB0aGlzLmdyYXBoaWNzICAgICA9IG5ldyBHcmFwaGljc0VuZ2luZSh3b3JsZCwgbWFpblZpZXcsIGRlYnVnVmlldyk7XG4gIHRoaXMucGh5c2ljcyAgICAgID0gbmV3IFBoeXNpY3NFbmdpbmUoLypkZWJ1Z1ZpZXcqLyk7XG4gIHRoaXMuc291bmQgICAgICAgID0gbmV3IFNvdW5kRW5naW5lKCk7XG4gIHRoaXMucGFydGljbGVzICAgID0gbmV3IFBhcnRpY2xlRW5naW5lKHRoaXMpO1xuICB0aGlzLnRyYWNrZXIgICAgICA9IG5ldyBFbnRpdHlUcmFja2VyKCk7XG4gIHRoaXMudGltZSAgICAgICAgID0gbmV3IFRpbWUoKTtcbiAgXG4gIC8vIE5vIGdhbWUgYXR0YWNoZWQgeWV0XG4gIHRoaXMuZ2FtZSA9IG51bGw7XG4gICAgXG4gIHRoaXMucGh5c2ljcy5jb2xsaXNpb24oZnVuY3Rpb24oZml4dHVyZUEsIGZpeHR1cmVCLCBwb2ludHMpIHtcbiAgICB2YXIgZW50aXR5QSA9IGZpeHR1cmVBLkdldFVzZXJEYXRhKCk7XG4gICAgdmFyIGVudGl0eUIgPSBmaXh0dXJlQi5HZXRVc2VyRGF0YSgpO1xuICAgIGlmIChlbnRpdHlBICYmIGVudGl0eUIpIHtcbiAgICAgIGVudGl0eUEuY29sbGlzaW9uKGVudGl0eUIsIHBvaW50cyk7XG4gICAgICBlbnRpdHlCLmNvbGxpc2lvbihlbnRpdHlBLCBwb2ludHMpOyAgICAgIFxuICAgIH1cbiAgfSk7XG4gICBcbiAgaHViLmludGVyY2VwdG9yID0gXy5iaW5kKHRoaXMucXVldWVOZXh0LCB0aGlzKTtcbiAgXG4gIGh1Yi5vbignZW50aXR5OmRlc3Ryb3knLCBmdW5jdGlvbihwYXJhbXMpIHtcbiAgICB0aGlzLmRlbGV0ZUVudGl0eShwYXJhbXMuZW50aXR5LmlkKVxuICB9LmJpbmQodGhpcykpO1xuICBcbn07XG5cbkVuZ2luZS5wcm90b3R5cGUuc3RhcnQgPSBmdW5jdGlvbigpIHtcbiAgdGlja2VyLnJ1bih0aGlzLnVwZGF0ZS5iaW5kKHRoaXMpKTtcbn07XG5cbkVuZ2luZS5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uKCkge1xuICB0aWNrZXIuc3RvcCgpO1xufTtcblxuRW5naW5lLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy50aW1lLnVwZGF0ZSgpO1xuICB0aGlzLnBoeXNpY3MudXBkYXRlKCk7XG4gIHRoaXMudHJhY2tlci5mb3JFYWNoKGZ1bmN0aW9uKGVudGl0eSkge1xuICAgIGVudGl0eS51cGRhdGUodGhpcywgdGhpcy5nYW1lLCB0aGlzLnRpbWUuZGVsdGEpO1xuICB9LmJpbmQodGhpcykpO1xuICBpZiAodGhpcy5nYW1lKSB7XG4gICAgdGhpcy5nYW1lLnVwZGF0ZSh0aGlzLCB0aGlzLnRpbWUuZGVsdGEpO1xuICB9XG4gIHRoaXMuZ3JhcGhpY3MucmVuZGVyKCk7XG4gIFxuICB2YXIgbmV4dEFjdGlvbiA9IG51bGw7XG4gIHdoaWxlIChuZXh0QWN0aW9uID0gdGhpcy5uZXh0VGlja0FjdGlvbnMucG9wKCkpIHtcbiAgICBuZXh0QWN0aW9uLmNhbGwodGhpcyk7XG4gIH1cbn07XG5cbkVuZ2luZS5wcm90b3R5cGUucXVldWVOZXh0ID0gZnVuY3Rpb24oYWN0aW9uKSB7XG4gIHRoaXMubmV4dFRpY2tBY3Rpb25zLnB1c2goYWN0aW9uKTtcbn07XG5cbkVuZ2luZS5wcm90b3R5cGUuYWRkRW50aXR5ID0gZnVuY3Rpb24oZW50aXR5KSB7XG4gIGlmIChlbnRpdHkuaWQpIHtcbiAgICB0aGlzLnRyYWNrZXIudHJhY2soZW50aXR5KTtcbiAgICBlbnRpdHkuY3JlYXRlKHRoaXMsIHRoaXMuZ2FtZSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc29sZS5sb2coJ0VudGl0eSBzaG91bGQgaGF2ZSBhbiBJRCcsIGVudGl0eSk7XG4gIH1cbn07XG5cbkVuZ2luZS5wcm90b3R5cGUuZGVsZXRlRW50aXR5ID0gZnVuY3Rpb24oaWQpIHtcbiAgdmFyIGVudGl0eSA9IHRoaXMudHJhY2tlci5maW5kKGlkKTtcbiAgaWYgKGVudGl0eSkge1xuICAgIGVudGl0eS5kZXN0cm95KHRoaXMsIHRoaXMuZ2FtZSk7XG4gICAgdGhpcy50cmFja2VyLmZvcmdldChlbnRpdHkpO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUubG9nKCdFbnRpdHkgbm90IGZvdW5kJywgZW50aXR5KTtcbiAgfVxufTtcblxuRW5naW5lLnByb3RvdHlwZS5kZWxldGVFbnRpdHlNYXRjaGluZyA9IGZ1bmN0aW9uKHJlZ2V4KSB7XG4gIHZhciBlbnRpdGllcyA9IHRoaXMudHJhY2tlci5maW5kTWF0Y2hpbmcocmVnZXgpXG4gIGVudGl0aWVzLmZvckVhY2goZnVuY3Rpb24oZW50aXR5KSB7XG4gICAgZW50aXR5LmRlc3Ryb3kodGhpcywgdGhpcy5nYW1lKVxuICAgIHRoaXMudHJhY2tlci5mb3JnZXQoZW50aXR5KVxuICB9LmJpbmQodGhpcykpXG59XG5cbkVuZ2luZS5wcm90b3R5cGUuZ2V0RW50aXR5ID0gZnVuY3Rpb24oaWQpIHtcbiAgcmV0dXJuIHRoaXMudHJhY2tlci5maW5kKGlkKTtcbn07XG5cbkVuZ2luZS5wcm90b3R5cGUuYXR0YWNoID0gZnVuY3Rpb24oZ2FtZSkge1xuICB0aGlzLmdhbWUgPSBnYW1lO1xufTtcblxuRW5naW5lLnByb3RvdHlwZS5kZXRhY2ggPSBmdW5jdGlvbigpIHtcbiAgaWYgKHRoaXMuZ2FtZSkge1xuICAgIHRoaXMuZ2FtZS5kZXN0cm95KHRoaXMpO1xuICB9XG4gIHRoaXMuZ2FtZSA9IG51bGw7XG59O1xuXG5FbmdpbmUucHJvdG90eXBlLnJlc2V0ID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMudHJhY2tlci5mb3JFYWNoKGZ1bmN0aW9uKGVudGl0eSkge1xuICAgIGVudGl0eS5kZXN0cm95KHRoaXMsIG51bGwpO1xuICB9LmJpbmQodGhpcykpO1xuICB0aGlzLnRyYWNrZXIuZm9yZ2V0QWxsKCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEVuZ2luZTtcbiIsInZhciBfICAgICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvdW5kZXJzY29yZS1taW4nKTtcbnZhciBMZWFkZXJib2FyZCAgID0gcmVxdWlyZSgnLi9lbnRpdGllcy9MZWFkZXJib2FyZCcpO1xudmFyIFRpdGxlICAgICAgICAgPSByZXF1aXJlKCcuL2VudGl0aWVzL1RpdGxlJyk7XG52YXIgQWJvdXQgICAgICAgICA9IHJlcXVpcmUoJy4vZW50aXRpZXMvQWJvdXQnKTtcbnZhciBodWIgICAgICAgICAgID0gcmVxdWlyZSgnLi4vZW5naW5lL2h1YicpO1xuXG5mdW5jdGlvbiBJbnRybyhlbmdpbmUpIHtcbiAgdGhpcy5jdXJyZW50ID0gMDtcbiAgdGhpcy5zd2l0Y2goZW5naW5lKTtcbiAgdGhpcy5zd2l0Y2hUaW1lciA9IHdpbmRvdy5zZXRJbnRlcnZhbChfLmJpbmQodGhpcy5zd2l0Y2gsIHRoaXMsIGVuZ2luZSksIDEwMDAwKTtcbiAgaHViLnNlbmQoJ2VuZ2luZS5zb3VuZC5wbGF5Jywge2ZpbGU6ICcvZ2FtZS9zb3VuZHMvaW50cm8ubXAzJywgbG9vcDogdHJ1ZSwgdm9sdW1lOiAwLjh9KTtcbn1cblxuSW50cm8ucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKGVuZ2luZSwgZGVsdGEpIHtcbn07XG5cbkludHJvLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oZW5naW5lKSB7XG4gIHRoaXMucmVtb3ZlQWxsKGVuZ2luZSk7XG4gIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5zd2l0Y2hUaW1lcik7XG4gIGh1Yi5zZW5kKCdlbmdpbmUuc291bmQuc3RvcCcsIHtmaWxlOiAnL2dhbWUvc291bmRzL2ludHJvLm1wMyd9KTtcbn07XG5cbkludHJvLnByb3RvdHlwZS5zd2l0Y2ggPSBmdW5jdGlvbihlbmdpbmUpIHtcbiAgdGhpcy5yZW1vdmVBbGwoZW5naW5lKTtcbiAgKyt0aGlzLmN1cnJlbnQ7XG4gIGlmICh0aGlzLmN1cnJlbnQgJSAzID09PSAxKSBlbmdpbmUuYWRkRW50aXR5KG5ldyBMZWFkZXJib2FyZCgnbGVhZGVyYm9hcmQnKSk7XG4gIGlmICh0aGlzLmN1cnJlbnQgJSAzID09PSAyKSBlbmdpbmUuYWRkRW50aXR5KG5ldyBUaXRsZSgndGl0bGUnKSk7XG4gIGlmICh0aGlzLmN1cnJlbnQgJSAzID09PSAwKSBlbmdpbmUuYWRkRW50aXR5KG5ldyBBYm91dCgnYWJvdXQnKSk7XG59O1xuXG5JbnRyby5wcm90b3R5cGUucmVtb3ZlQWxsID0gZnVuY3Rpb24oZW5naW5lKSB7XG4gIGVuZ2luZS5kZWxldGVFbnRpdHkoJ3RpdGxlJyk7XG4gIGVuZ2luZS5kZWxldGVFbnRpdHkoJ2xlYWRlcmJvYXJkJyk7XG4gIGVuZ2luZS5kZWxldGVFbnRpdHkoJ2Fib3V0Jyk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEludHJvO1xuIiwidmFyIFNlcXVlbmNlciAgID0gcmVxdWlyZSgnLi9zZXF1ZW5jZXInKTtcbnZhciB3b3JsZCAgICAgICA9IHJlcXVpcmUoJy4vd29ybGQnKTtcbnZhciBodWIgICAgICAgICA9IHJlcXVpcmUoJy4uL2VuZ2luZS9odWInKTtcblxudmFyIEJhbGwgICAgICAgID0gcmVxdWlyZSgnLi9lbnRpdGllcy9iYWxsJyk7XG52YXIgd29ybGQgICAgICAgPSByZXF1aXJlKCcuL3dvcmxkJyk7XG52YXIgQWN0aW9uVGV4dCAgPSByZXF1aXJlKCcuL2VudGl0aWVzL2FjdGlvbi10ZXh0Jyk7XG5cbmZ1bmN0aW9uIEdhbWUoZW5naW5lLCBwbGF5ZXJJbmZvKSB7XG5cbiAgLy8gdHdvIHBsYXllcnMgaW4gdGhlIGN1cnJlbnQgbWF0Y2hcbiAgLy8gb3IgbWF5YmUgdGhpcyBiZWxvbmdzIGluIHRoZSBQbGF5ZXIgZW50aXR5P1xuICB0aGlzLnBsYXllcnMgPSBwbGF5ZXJJbmZvLm1hcChmdW5jdGlvbihwKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiBwLmlkLFxuICAgICAgbmFtZTogcC5maXJzdE5hbWUgKyAnICcgKyBwLmxhc3ROYW1lLnN1YnN0cigwLDEpLFxuICAgICAgc2NvcmU6IDBcbiAgICB9XG4gIH0pO1xuICB0aGlzLnJvdW5kTnVtYmVyID0gMVxuXG4gIHZhciBzdGF0ZXMgPSB7XG4gICAgJ3dhcm11cCc6ICAgICByZXF1aXJlKCcuL3N0YXRlcy93YXJtdXAnKSxcbiAgICAna2lja29mZic6ICAgIHJlcXVpcmUoJy4vc3RhdGVzL2tpY2tvZmYnKSxcbiAgICAncGxheSc6ICAgICAgIHJlcXVpcmUoJy4vc3RhdGVzL3BsYXknKSxcbiAgICAnc2NvcmVkJzogICAgIHJlcXVpcmUoJy4vc3RhdGVzL3Njb3JlZCcpLFxuICAgICdlbmRvZm1hdGNoJzogcmVxdWlyZSgnLi9zdGF0ZXMvZW5kb2ZtYXRjaCcpXG4gIH07XG5cbiAgdmFyIHRyYW5zaXRpb25zID0gW1xuICAgICAgeyAgIG5hbWU6ICdzdGFydHVwJywgIGZyb206ICdub25lJywgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvOiAnd2FybXVwJyAgICAgICB9LFxuICAgICAgeyAgIG5hbWU6ICdyZWFkeScsICAgIGZyb206IFsnd2FybXVwJywgJ3Njb3JlZCddLCAgICAgICAgICAgICAgICAgICAgIHRvOiAna2lja29mZicgICAgICB9LFxuICAgICAgeyAgIG5hbWU6ICdnbycsICAgICAgIGZyb206IFsnc2NvcmVkJywgJ2tpY2tvZmYnXSwgICAgICAgICAgICAgICAgICAgIHRvOiAncGxheScgICAgICAgICB9LFxuICAgICAgeyAgIG5hbWU6ICdzY29yZWQnLCAgIGZyb206IFsncGxheScsICdzY29yZWQnLCAna2lja29mZiddLCAgICAgICAgICAgIHRvOiAnc2NvcmVkJyAgICAgICB9LFxuICAgICAgeyAgIG5hbWU6ICdlbmQnLCAgICAgIGZyb206IFsnd2FybXVwJywgJ2tpY2tvZmYnLCAncGxheScsICdzY29yZWQnXSwgIHRvOiAnZW5kb2ZtYXRjaCcgICB9LFxuICBdO1xuICBcbiAgdGhpcy5kdXJhdGlvbiA9IDQ1O1xuICB0aGlzLnRpbWVSZW1haW5pbmcgPSB0aGlzLmR1cmF0aW9uICogMTAwMDtcbiAgdGhpcy5iYWxsc0luUGxheSA9IFtdXG4gIFxuICB0aGlzLmVuZ2luZSA9IGVuZ2luZTtcbiAgdGhpcy5zZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyKGVuZ2luZSwgdGhpcywgc3RhdGVzLCB0cmFuc2l0aW9ucyk7XG4gIHRoaXMuc2VxdWVuY2VyLnN0YXJ0KCk7XG5cbiAgaHViLm9uKCdnYW1lLnNjb3JlJywgZnVuY3Rpb24oZGF0YSkge1xuICAgIHRoaXMuc2NvcmUoMSAtIGRhdGEuYWdhaW5zdEluZGV4KTtcbiAgICB0aGlzLnNlcXVlbmNlci50cmFuc2l0aW9uKCdzY29yZWQnLCBkYXRhKTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICBodWIub24oJ2dhbWUuZW5kJywgZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5zZXF1ZW5jZXIudHJhbnNpdGlvbignZW5kJyk7XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgaHViLm9uKCdnYW1lLm11bHRpYmFsbCcsIGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubXVsdGliYWxsKClcbiAgfS5iaW5kKHRoaXMpKVxufVxuXG5HYW1lLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGRlbHRhKSB7XG4gIHRoaXMuc2VxdWVuY2VyLmFjdGl2ZSgpLnVwZGF0ZShkZWx0YSk7XG59O1xuXG5HYW1lLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oZW5naW5lKSB7XG4gIFxufTtcblxuR2FtZS5wcm90b3R5cGUudHJhbnNpdGlvbiA9IGZ1bmN0aW9uKG5hbWUsIGFyZ3MpIHtcbiAgdGhpcy5zZXF1ZW5jZXIudHJhbnNpdGlvbihuYW1lLCBhcmdzKTtcbn07XG5cbkdhbWUucHJvdG90eXBlLm1lc3NhZ2UgPSBmdW5jdGlvbihtZXNzYWdlLCBhcmdzKSB7XG4gIHRoaXMuc2VxdWVuY2VyLmFjdGl2ZSgpLm9uKG1lc3NhZ2UsIGFyZ3MpO1xufTtcblxuR2FtZS5wcm90b3R5cGUuc2NvcmUgPSBmdW5jdGlvbihwbGF5ZXJJbmRleCkge1xuICB0aGlzLnJvdW5kTnVtYmVyICs9IDFcbiAgdGhpcy5wbGF5ZXJzW3BsYXllckluZGV4XS5zY29yZSArPSAxO1xufTtcblxuR2FtZS5wcm90b3R5cGUubW92ZSA9IGZ1bmN0aW9uKHBpbmRleCwgZGlyKSB7XG4gIHZhciBwbGF5ZXIgPSB0aGlzLmVuZ2luZS5nZXRFbnRpdHkocGluZGV4ID09PSAwID8gJ3AxJyA6ICdwMicpO1xuICBwbGF5ZXIubW92ZShkaXIpO1xufTtcblxuR2FtZS5wcm90b3R5cGUubXVsdGliYWxsID0gZnVuY3Rpb24oKSB7XG4gIHZhciB0ZXh0ID0gbmV3IEFjdGlvblRleHQoJ211bHRpYmFsbCcsICdNdWx0aS1iYWxsIScpO1xuICB0aGlzLmVuZ2luZS5hZGRFbnRpdHkodGV4dClcblxuICBodWIuc2VuZCgnZW5naW5lLnNvdW5kLnBsYXknLCB7IGZpbGU6ICcvZ2FtZS9zb3VuZHMvbXVsdGliYWxsLm1wMycgfSlcbiAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICBodWIuc2VuZCgnZW5naW5lLnNvdW5kLnBsYXknLCB7IGZpbGU6ICcvZ2FtZS9zb3VuZHMvc2F4Lm1wMycsIHZvbHVtZTogMC45IH0pO1xuICB9LCAyMDAwKTtcblxuICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuZW5naW5lLmRlbGV0ZUVudGl0eSh0ZXh0LmlkKVxuICAgIFxuICAgIHZhciBiYWxsID0gdGhpcy5jcmVhdGVCYWxsKC0xLCAxKVxuICAgIGJhbGwua2ljaygxKVxuICAgIGJhbGwgPSB0aGlzLmNyZWF0ZUJhbGwoMSwgMSlcbiAgICBiYWxsLmtpY2soMSlcbiAgICBiYWxsID0gdGhpcy5jcmVhdGVCYWxsKDEsIDEpXG4gICAgYmFsbC5raWNrKC0xKVxuICAgIGJhbGwgPSB0aGlzLmNyZWF0ZUJhbGwoMCwgLTEpXG4gICAgYmFsbC5raWNrKC0xKVxuICB9LmJpbmQodGhpcyksIDEwMDApXG59XG5cbkdhbWUucHJvdG90eXBlLmNsZWFyQmFsbHMgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5iYWxsc0luUGxheS5mb3JFYWNoKGZ1bmN0aW9uKGJhbGwpIHtcbiAgICB0aGlzLnJlbW92ZUJhbGwoYmFsbClcbiAgfS5iaW5kKHRoaXMpKVxuICB0aGlzLmJhbGxzSW5QbGF5ID0gW11cbn1cblxuR2FtZS5wcm90b3R5cGUucmVtb3ZlQmFsbCA9IGZ1bmN0aW9uKGJhbGwpIHtcbiAgdGhpcy5lbmdpbmUuZGVsZXRlRW50aXR5KGJhbGwuaWQpXG4gIHRoaXMuYmFsbHNJblBsYXkgPSB0aGlzLmJhbGxzSW5QbGF5LmZpbHRlcihmdW5jdGlvbihiKSB7IHJldHVybiBiICE9PSBiYWxsIH0pXG59XG5cbkdhbWUucHJvdG90eXBlLmNyZWF0ZUJhbGwgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHZhciBiYWxsU3RhcnRZID0gbnVsbFxuICB2YXIgYmFsbFN0YXJ0WCA9IG51bGxcblxuICBpZiAoeCA9PT0gLTEpIHtcbiAgICBiYWxsU3RhcnRYID0gd29ybGQud2lkdGggLyA1XG4gIH0gZWxzZSBpZiAoeCA9PT0gMCkge1xuICAgIGJhbGxTdGFydFggPSB3b3JsZC53aWR0aCAvIDJcbiAgfSBlbHNlIHtcbiAgICBiYWxsU3RhcnRYID0gKHdvcmxkLndpZHRoIC8gNSkgKiA0XG4gIH1cblxuICBpZiAoeSA9PT0gLTEpIHtcbiAgICBiYWxsU3RhcnRZID0gd29ybGQuaGVpZ2h0IC8gNVxuICB9IGVsc2UgaWYgKHkgPT09IDApIHtcbiAgICBiYWxsU3RhcnRZID0gd29ybGQuaGVpZ2h0IC8gMlxuICB9IGVsc2Uge1xuICAgIGJhbGxTdGFydFkgPSAod29ybGQuaGVpZ2h0IC8gNSkgKiA0XG4gIH1cblxuICB2YXIgYmFsbCA9IG5ldyBCYWxsKCdiYWxsOicrdGhpcy5iYWxsc0luUGxheS5sZW5ndGgsIGJhbGxTdGFydFgsIGJhbGxTdGFydFkpXG5cbiAgdGhpcy5lbmdpbmUuYWRkRW50aXR5KGJhbGwpXG4gIHRoaXMuYmFsbHNJblBsYXkucHVzaChiYWxsKVxuXG4gIHJldHVybiBiYWxsXG59XG5cbm1vZHVsZS5leHBvcnRzID0gR2FtZTtcbiIsInZhciBldmUgPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9ldmUnKTtcblxuZXhwb3J0cy5pbnRlcmNlcHRvciA9IGZ1bmN0aW9uKGZuKSB7IGZuKCk7IH07XG5cbmV4cG9ydHMuc2VuZCA9IGZ1bmN0aW9uKG1lc3NhZ2UsIGFyZ3MpIHtcbiAgZXZlKG1lc3NhZ2UsIG51bGwsIGFyZ3MpO1xufTtcblxuZXhwb3J0cy5vbiA9IGZ1bmN0aW9uKG1lc3NhZ2UsIGNhbGxiYWNrKSB7XG4gIGV2ZS5vbihtZXNzYWdlLCBmdW5jdGlvbigpIHtcbiAgICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgICBleHBvcnRzLmludGVyY2VwdG9yKGZ1bmN0aW9uKCkge1xuICAgICAgY2FsbGJhY2suYXBwbHkodGhpcywgYXJncylcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnRzLnVuYmluZCA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgZXZlLm9mZihuYW1lKTtcbn07XG4iLCIvKiEgU29ja2V0LklPLm1pbi5qcyBidWlsZDowLjkuMTEsIHByb2R1Y3Rpb24uIENvcHlyaWdodChjKSAyMDExIExlYXJuQm9vc3QgPGRldkBsZWFybmJvb3N0LmNvbT4gTUlUIExpY2Vuc2VkICovXG52YXIgaW89XCJ1bmRlZmluZWRcIj09dHlwZW9mIG1vZHVsZT97fTptb2R1bGUuZXhwb3J0czsoZnVuY3Rpb24oKXsoZnVuY3Rpb24oYSxiKXt2YXIgYz1hO2MudmVyc2lvbj1cIjAuOS4xMVwiLGMucHJvdG9jb2w9MSxjLnRyYW5zcG9ydHM9W10sYy5qPVtdLGMuc29ja2V0cz17fSxjLmNvbm5lY3Q9ZnVuY3Rpb24oYSxkKXt2YXIgZT1jLnV0aWwucGFyc2VVcmkoYSksZixnO2ImJmIubG9jYXRpb24mJihlLnByb3RvY29sPWUucHJvdG9jb2x8fGIubG9jYXRpb24ucHJvdG9jb2wuc2xpY2UoMCwtMSksZS5ob3N0PWUuaG9zdHx8KGIuZG9jdW1lbnQ/Yi5kb2N1bWVudC5kb21haW46Yi5sb2NhdGlvbi5ob3N0bmFtZSksZS5wb3J0PWUucG9ydHx8Yi5sb2NhdGlvbi5wb3J0KSxmPWMudXRpbC51bmlxdWVVcmkoZSk7dmFyIGg9e2hvc3Q6ZS5ob3N0LHNlY3VyZTpcImh0dHBzXCI9PWUucHJvdG9jb2wscG9ydDplLnBvcnR8fChcImh0dHBzXCI9PWUucHJvdG9jb2w/NDQzOjgwKSxxdWVyeTplLnF1ZXJ5fHxcIlwifTtjLnV0aWwubWVyZ2UoaCxkKTtpZihoW1wiZm9yY2UgbmV3IGNvbm5lY3Rpb25cIl18fCFjLnNvY2tldHNbZl0pZz1uZXcgYy5Tb2NrZXQoaCk7cmV0dXJuIWhbXCJmb3JjZSBuZXcgY29ubmVjdGlvblwiXSYmZyYmKGMuc29ja2V0c1tmXT1nKSxnPWd8fGMuc29ja2V0c1tmXSxnLm9mKGUucGF0aC5sZW5ndGg+MT9lLnBhdGg6XCJcIil9fSkoXCJvYmplY3RcIj09dHlwZW9mIG1vZHVsZT9tb2R1bGUuZXhwb3J0czp0aGlzLmlvPXt9LHRoaXMpLGZ1bmN0aW9uKGEsYil7dmFyIGM9YS51dGlsPXt9LGQ9L14oPzooPyFbXjpAXSs6W146QFxcL10qQCkoW146XFwvPyMuXSspOik/KD86XFwvXFwvKT8oKD86KChbXjpAXSopKD86OihbXjpAXSopKT8pP0ApPyhbXjpcXC8/I10qKSg/OjooXFxkKikpPykoKChcXC8oPzpbXj8jXSg/IVtePyNcXC9dKlxcLltePyNcXC8uXSsoPzpbPyNdfCQpKSkqXFwvPyk/KFtePyNcXC9dKikpKD86XFw/KFteI10qKSk/KD86IyguKikpPykvLGU9W1wic291cmNlXCIsXCJwcm90b2NvbFwiLFwiYXV0aG9yaXR5XCIsXCJ1c2VySW5mb1wiLFwidXNlclwiLFwicGFzc3dvcmRcIixcImhvc3RcIixcInBvcnRcIixcInJlbGF0aXZlXCIsXCJwYXRoXCIsXCJkaXJlY3RvcnlcIixcImZpbGVcIixcInF1ZXJ5XCIsXCJhbmNob3JcIl07Yy5wYXJzZVVyaT1mdW5jdGlvbihhKXt2YXIgYj1kLmV4ZWMoYXx8XCJcIiksYz17fSxmPTE0O3doaWxlKGYtLSljW2VbZl1dPWJbZl18fFwiXCI7cmV0dXJuIGN9LGMudW5pcXVlVXJpPWZ1bmN0aW9uKGEpe3ZhciBjPWEucHJvdG9jb2wsZD1hLmhvc3QsZT1hLnBvcnQ7cmV0dXJuXCJkb2N1bWVudFwiaW4gYj8oZD1kfHxkb2N1bWVudC5kb21haW4sZT1lfHwoYz09XCJodHRwc1wiJiZkb2N1bWVudC5sb2NhdGlvbi5wcm90b2NvbCE9PVwiaHR0cHM6XCI/NDQzOmRvY3VtZW50LmxvY2F0aW9uLnBvcnQpKTooZD1kfHxcImxvY2FsaG9zdFwiLCFlJiZjPT1cImh0dHBzXCImJihlPTQ0MykpLChjfHxcImh0dHBcIikrXCI6Ly9cIitkK1wiOlwiKyhlfHw4MCl9LGMucXVlcnk9ZnVuY3Rpb24oYSxiKXt2YXIgZD1jLmNodW5rUXVlcnkoYXx8XCJcIiksZT1bXTtjLm1lcmdlKGQsYy5jaHVua1F1ZXJ5KGJ8fFwiXCIpKTtmb3IodmFyIGYgaW4gZClkLmhhc093blByb3BlcnR5KGYpJiZlLnB1c2goZitcIj1cIitkW2ZdKTtyZXR1cm4gZS5sZW5ndGg/XCI/XCIrZS5qb2luKFwiJlwiKTpcIlwifSxjLmNodW5rUXVlcnk9ZnVuY3Rpb24oYSl7dmFyIGI9e30sYz1hLnNwbGl0KFwiJlwiKSxkPTAsZT1jLmxlbmd0aCxmO2Zvcig7ZDxlOysrZClmPWNbZF0uc3BsaXQoXCI9XCIpLGZbMF0mJihiW2ZbMF1dPWZbMV0pO3JldHVybiBifTt2YXIgZj0hMTtjLmxvYWQ9ZnVuY3Rpb24oYSl7aWYoXCJkb2N1bWVudFwiaW4gYiYmZG9jdW1lbnQucmVhZHlTdGF0ZT09PVwiY29tcGxldGVcInx8ZilyZXR1cm4gYSgpO2Mub24oYixcImxvYWRcIixhLCExKX0sYy5vbj1mdW5jdGlvbihhLGIsYyxkKXthLmF0dGFjaEV2ZW50P2EuYXR0YWNoRXZlbnQoXCJvblwiK2IsYyk6YS5hZGRFdmVudExpc3RlbmVyJiZhLmFkZEV2ZW50TGlzdGVuZXIoYixjLGQpfSxjLnJlcXVlc3Q9ZnVuY3Rpb24oYSl7aWYoYSYmXCJ1bmRlZmluZWRcIiE9dHlwZW9mIFhEb21haW5SZXF1ZXN0JiYhYy51YS5oYXNDT1JTKXJldHVybiBuZXcgWERvbWFpblJlcXVlc3Q7aWYoXCJ1bmRlZmluZWRcIiE9dHlwZW9mIFhNTEh0dHBSZXF1ZXN0JiYoIWF8fGMudWEuaGFzQ09SUykpcmV0dXJuIG5ldyBYTUxIdHRwUmVxdWVzdDtpZighYSl0cnl7cmV0dXJuIG5ldyh3aW5kb3dbW1wiQWN0aXZlXCJdLmNvbmNhdChcIk9iamVjdFwiKS5qb2luKFwiWFwiKV0pKFwiTWljcm9zb2Z0LlhNTEhUVFBcIil9Y2F0Y2goYil7fXJldHVybiBudWxsfSxcInVuZGVmaW5lZFwiIT10eXBlb2Ygd2luZG93JiZjLmxvYWQoZnVuY3Rpb24oKXtmPSEwfSksYy5kZWZlcj1mdW5jdGlvbihhKXtpZighYy51YS53ZWJraXR8fFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbXBvcnRTY3JpcHRzKXJldHVybiBhKCk7Yy5sb2FkKGZ1bmN0aW9uKCl7c2V0VGltZW91dChhLDEwMCl9KX0sYy5tZXJnZT1mdW5jdGlvbihiLGQsZSxmKXt2YXIgZz1mfHxbXSxoPXR5cGVvZiBlPT1cInVuZGVmaW5lZFwiPzI6ZSxpO2ZvcihpIGluIGQpZC5oYXNPd25Qcm9wZXJ0eShpKSYmYy5pbmRleE9mKGcsaSk8MCYmKHR5cGVvZiBiW2ldIT1cIm9iamVjdFwifHwhaD8oYltpXT1kW2ldLGcucHVzaChkW2ldKSk6Yy5tZXJnZShiW2ldLGRbaV0saC0xLGcpKTtyZXR1cm4gYn0sYy5taXhpbj1mdW5jdGlvbihhLGIpe2MubWVyZ2UoYS5wcm90b3R5cGUsYi5wcm90b3R5cGUpfSxjLmluaGVyaXQ9ZnVuY3Rpb24oYSxiKXtmdW5jdGlvbiBjKCl7fWMucHJvdG90eXBlPWIucHJvdG90eXBlLGEucHJvdG90eXBlPW5ldyBjfSxjLmlzQXJyYXk9QXJyYXkuaXNBcnJheXx8ZnVuY3Rpb24oYSl7cmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChhKT09PVwiW29iamVjdCBBcnJheV1cIn0sYy5pbnRlcnNlY3Q9ZnVuY3Rpb24oYSxiKXt2YXIgZD1bXSxlPWEubGVuZ3RoPmIubGVuZ3RoP2E6YixmPWEubGVuZ3RoPmIubGVuZ3RoP2I6YTtmb3IodmFyIGc9MCxoPWYubGVuZ3RoO2c8aDtnKyspfmMuaW5kZXhPZihlLGZbZ10pJiZkLnB1c2goZltnXSk7cmV0dXJuIGR9LGMuaW5kZXhPZj1mdW5jdGlvbihhLGIsYyl7Zm9yKHZhciBkPWEubGVuZ3RoLGM9YzwwP2MrZDwwPzA6YytkOmN8fDA7YzxkJiZhW2NdIT09YjtjKyspO3JldHVybiBkPD1jPy0xOmN9LGMudG9BcnJheT1mdW5jdGlvbihhKXt2YXIgYj1bXTtmb3IodmFyIGM9MCxkPWEubGVuZ3RoO2M8ZDtjKyspYi5wdXNoKGFbY10pO3JldHVybiBifSxjLnVhPXt9LGMudWEuaGFzQ09SUz1cInVuZGVmaW5lZFwiIT10eXBlb2YgWE1MSHR0cFJlcXVlc3QmJmZ1bmN0aW9uKCl7dHJ5e3ZhciBhPW5ldyBYTUxIdHRwUmVxdWVzdH1jYXRjaChiKXtyZXR1cm4hMX1yZXR1cm4gYS53aXRoQ3JlZGVudGlhbHMhPXVuZGVmaW5lZH0oKSxjLnVhLndlYmtpdD1cInVuZGVmaW5lZFwiIT10eXBlb2YgbmF2aWdhdG9yJiYvd2Via2l0L2kudGVzdChuYXZpZ2F0b3IudXNlckFnZW50KSxjLnVhLmlEZXZpY2U9XCJ1bmRlZmluZWRcIiE9dHlwZW9mIG5hdmlnYXRvciYmL2lQYWR8aVBob25lfGlQb2QvaS50ZXN0KG5hdmlnYXRvci51c2VyQWdlbnQpfShcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW86bW9kdWxlLmV4cG9ydHMsdGhpcyksZnVuY3Rpb24oYSxiKXtmdW5jdGlvbiBjKCl7fWEuRXZlbnRFbWl0dGVyPWMsYy5wcm90b3R5cGUub249ZnVuY3Rpb24oYSxjKXtyZXR1cm4gdGhpcy4kZXZlbnRzfHwodGhpcy4kZXZlbnRzPXt9KSx0aGlzLiRldmVudHNbYV0/Yi51dGlsLmlzQXJyYXkodGhpcy4kZXZlbnRzW2FdKT90aGlzLiRldmVudHNbYV0ucHVzaChjKTp0aGlzLiRldmVudHNbYV09W3RoaXMuJGV2ZW50c1thXSxjXTp0aGlzLiRldmVudHNbYV09Yyx0aGlzfSxjLnByb3RvdHlwZS5hZGRMaXN0ZW5lcj1jLnByb3RvdHlwZS5vbixjLnByb3RvdHlwZS5vbmNlPWZ1bmN0aW9uKGEsYil7ZnVuY3Rpb24gZCgpe2MucmVtb3ZlTGlzdGVuZXIoYSxkKSxiLmFwcGx5KHRoaXMsYXJndW1lbnRzKX12YXIgYz10aGlzO3JldHVybiBkLmxpc3RlbmVyPWIsdGhpcy5vbihhLGQpLHRoaXN9LGMucHJvdG90eXBlLnJlbW92ZUxpc3RlbmVyPWZ1bmN0aW9uKGEsYyl7aWYodGhpcy4kZXZlbnRzJiZ0aGlzLiRldmVudHNbYV0pe3ZhciBkPXRoaXMuJGV2ZW50c1thXTtpZihiLnV0aWwuaXNBcnJheShkKSl7dmFyIGU9LTE7Zm9yKHZhciBmPTAsZz1kLmxlbmd0aDtmPGc7ZisrKWlmKGRbZl09PT1jfHxkW2ZdLmxpc3RlbmVyJiZkW2ZdLmxpc3RlbmVyPT09Yyl7ZT1mO2JyZWFrfWlmKGU8MClyZXR1cm4gdGhpcztkLnNwbGljZShlLDEpLGQubGVuZ3RofHxkZWxldGUgdGhpcy4kZXZlbnRzW2FdfWVsc2UoZD09PWN8fGQubGlzdGVuZXImJmQubGlzdGVuZXI9PT1jKSYmZGVsZXRlIHRoaXMuJGV2ZW50c1thXX1yZXR1cm4gdGhpc30sYy5wcm90b3R5cGUucmVtb3ZlQWxsTGlzdGVuZXJzPWZ1bmN0aW9uKGEpe3JldHVybiBhPT09dW5kZWZpbmVkPyh0aGlzLiRldmVudHM9e30sdGhpcyk6KHRoaXMuJGV2ZW50cyYmdGhpcy4kZXZlbnRzW2FdJiYodGhpcy4kZXZlbnRzW2FdPW51bGwpLHRoaXMpfSxjLnByb3RvdHlwZS5saXN0ZW5lcnM9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuJGV2ZW50c3x8KHRoaXMuJGV2ZW50cz17fSksdGhpcy4kZXZlbnRzW2FdfHwodGhpcy4kZXZlbnRzW2FdPVtdKSxiLnV0aWwuaXNBcnJheSh0aGlzLiRldmVudHNbYV0pfHwodGhpcy4kZXZlbnRzW2FdPVt0aGlzLiRldmVudHNbYV1dKSx0aGlzLiRldmVudHNbYV19LGMucHJvdG90eXBlLmVtaXQ9ZnVuY3Rpb24oYSl7aWYoIXRoaXMuJGV2ZW50cylyZXR1cm4hMTt2YXIgYz10aGlzLiRldmVudHNbYV07aWYoIWMpcmV0dXJuITE7dmFyIGQ9QXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLDEpO2lmKFwiZnVuY3Rpb25cIj09dHlwZW9mIGMpYy5hcHBseSh0aGlzLGQpO2Vsc2V7aWYoIWIudXRpbC5pc0FycmF5KGMpKXJldHVybiExO3ZhciBlPWMuc2xpY2UoKTtmb3IodmFyIGY9MCxnPWUubGVuZ3RoO2Y8ZztmKyspZVtmXS5hcHBseSh0aGlzLGQpfXJldHVybiEwfX0oXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvOm1vZHVsZS5leHBvcnRzLFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pbzptb2R1bGUucGFyZW50LmV4cG9ydHMpLGZ1bmN0aW9uKGV4cG9ydHMsbmF0aXZlSlNPTil7ZnVuY3Rpb24gZihhKXtyZXR1cm4gYTwxMD9cIjBcIithOmF9ZnVuY3Rpb24gZGF0ZShhLGIpe3JldHVybiBpc0Zpbml0ZShhLnZhbHVlT2YoKSk/YS5nZXRVVENGdWxsWWVhcigpK1wiLVwiK2YoYS5nZXRVVENNb250aCgpKzEpK1wiLVwiK2YoYS5nZXRVVENEYXRlKCkpK1wiVFwiK2YoYS5nZXRVVENIb3VycygpKStcIjpcIitmKGEuZ2V0VVRDTWludXRlcygpKStcIjpcIitmKGEuZ2V0VVRDU2Vjb25kcygpKStcIlpcIjpudWxsfWZ1bmN0aW9uIHF1b3RlKGEpe3JldHVybiBlc2NhcGFibGUubGFzdEluZGV4PTAsZXNjYXBhYmxlLnRlc3QoYSk/J1wiJythLnJlcGxhY2UoZXNjYXBhYmxlLGZ1bmN0aW9uKGEpe3ZhciBiPW1ldGFbYV07cmV0dXJuIHR5cGVvZiBiPT1cInN0cmluZ1wiP2I6XCJcXFxcdVwiKyhcIjAwMDBcIithLmNoYXJDb2RlQXQoMCkudG9TdHJpbmcoMTYpKS5zbGljZSgtNCl9KSsnXCInOidcIicrYSsnXCInfWZ1bmN0aW9uIHN0cihhLGIpe3ZhciBjLGQsZSxmLGc9Z2FwLGgsaT1iW2FdO2kgaW5zdGFuY2VvZiBEYXRlJiYoaT1kYXRlKGEpKSx0eXBlb2YgcmVwPT1cImZ1bmN0aW9uXCImJihpPXJlcC5jYWxsKGIsYSxpKSk7c3dpdGNoKHR5cGVvZiBpKXtjYXNlXCJzdHJpbmdcIjpyZXR1cm4gcXVvdGUoaSk7Y2FzZVwibnVtYmVyXCI6cmV0dXJuIGlzRmluaXRlKGkpP1N0cmluZyhpKTpcIm51bGxcIjtjYXNlXCJib29sZWFuXCI6Y2FzZVwibnVsbFwiOnJldHVybiBTdHJpbmcoaSk7Y2FzZVwib2JqZWN0XCI6aWYoIWkpcmV0dXJuXCJudWxsXCI7Z2FwKz1pbmRlbnQsaD1bXTtpZihPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmFwcGx5KGkpPT09XCJbb2JqZWN0IEFycmF5XVwiKXtmPWkubGVuZ3RoO2ZvcihjPTA7YzxmO2MrPTEpaFtjXT1zdHIoYyxpKXx8XCJudWxsXCI7cmV0dXJuIGU9aC5sZW5ndGg9PT0wP1wiW11cIjpnYXA/XCJbXFxuXCIrZ2FwK2guam9pbihcIixcXG5cIitnYXApK1wiXFxuXCIrZytcIl1cIjpcIltcIitoLmpvaW4oXCIsXCIpK1wiXVwiLGdhcD1nLGV9aWYocmVwJiZ0eXBlb2YgcmVwPT1cIm9iamVjdFwiKXtmPXJlcC5sZW5ndGg7Zm9yKGM9MDtjPGY7Yys9MSl0eXBlb2YgcmVwW2NdPT1cInN0cmluZ1wiJiYoZD1yZXBbY10sZT1zdHIoZCxpKSxlJiZoLnB1c2gocXVvdGUoZCkrKGdhcD9cIjogXCI6XCI6XCIpK2UpKX1lbHNlIGZvcihkIGluIGkpT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGksZCkmJihlPXN0cihkLGkpLGUmJmgucHVzaChxdW90ZShkKSsoZ2FwP1wiOiBcIjpcIjpcIikrZSkpO3JldHVybiBlPWgubGVuZ3RoPT09MD9cInt9XCI6Z2FwP1wie1xcblwiK2dhcCtoLmpvaW4oXCIsXFxuXCIrZ2FwKStcIlxcblwiK2crXCJ9XCI6XCJ7XCIraC5qb2luKFwiLFwiKStcIn1cIixnYXA9ZyxlfX1cInVzZSBzdHJpY3RcIjtpZihuYXRpdmVKU09OJiZuYXRpdmVKU09OLnBhcnNlKXJldHVybiBleHBvcnRzLkpTT049e3BhcnNlOm5hdGl2ZUpTT04ucGFyc2Usc3RyaW5naWZ5Om5hdGl2ZUpTT04uc3RyaW5naWZ5fTt2YXIgSlNPTj1leHBvcnRzLkpTT049e30sY3g9L1tcXHUwMDAwXFx1MDBhZFxcdTA2MDAtXFx1MDYwNFxcdTA3MGZcXHUxN2I0XFx1MTdiNVxcdTIwMGMtXFx1MjAwZlxcdTIwMjgtXFx1MjAyZlxcdTIwNjAtXFx1MjA2ZlxcdWZlZmZcXHVmZmYwLVxcdWZmZmZdL2csZXNjYXBhYmxlPS9bXFxcXFxcXCJcXHgwMC1cXHgxZlxceDdmLVxceDlmXFx1MDBhZFxcdTA2MDAtXFx1MDYwNFxcdTA3MGZcXHUxN2I0XFx1MTdiNVxcdTIwMGMtXFx1MjAwZlxcdTIwMjgtXFx1MjAyZlxcdTIwNjAtXFx1MjA2ZlxcdWZlZmZcXHVmZmYwLVxcdWZmZmZdL2csZ2FwLGluZGVudCxtZXRhPXtcIlxcYlwiOlwiXFxcXGJcIixcIlxcdFwiOlwiXFxcXHRcIixcIlxcblwiOlwiXFxcXG5cIixcIlxcZlwiOlwiXFxcXGZcIixcIlxcclwiOlwiXFxcXHJcIiwnXCInOidcXFxcXCInLFwiXFxcXFwiOlwiXFxcXFxcXFxcIn0scmVwO0pTT04uc3RyaW5naWZ5PWZ1bmN0aW9uKGEsYixjKXt2YXIgZDtnYXA9XCJcIixpbmRlbnQ9XCJcIjtpZih0eXBlb2YgYz09XCJudW1iZXJcIilmb3IoZD0wO2Q8YztkKz0xKWluZGVudCs9XCIgXCI7ZWxzZSB0eXBlb2YgYz09XCJzdHJpbmdcIiYmKGluZGVudD1jKTtyZXA9YjtpZighYnx8dHlwZW9mIGI9PVwiZnVuY3Rpb25cInx8dHlwZW9mIGI9PVwib2JqZWN0XCImJnR5cGVvZiBiLmxlbmd0aD09XCJudW1iZXJcIilyZXR1cm4gc3RyKFwiXCIse1wiXCI6YX0pO3Rocm93IG5ldyBFcnJvcihcIkpTT04uc3RyaW5naWZ5XCIpfSxKU09OLnBhcnNlPWZ1bmN0aW9uKHRleHQscmV2aXZlcil7ZnVuY3Rpb24gd2FsayhhLGIpe3ZhciBjLGQsZT1hW2JdO2lmKGUmJnR5cGVvZiBlPT1cIm9iamVjdFwiKWZvcihjIGluIGUpT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGUsYykmJihkPXdhbGsoZSxjKSxkIT09dW5kZWZpbmVkP2VbY109ZDpkZWxldGUgZVtjXSk7cmV0dXJuIHJldml2ZXIuY2FsbChhLGIsZSl9dmFyIGo7dGV4dD1TdHJpbmcodGV4dCksY3gubGFzdEluZGV4PTAsY3gudGVzdCh0ZXh0KSYmKHRleHQ9dGV4dC5yZXBsYWNlKGN4LGZ1bmN0aW9uKGEpe3JldHVyblwiXFxcXHVcIisoXCIwMDAwXCIrYS5jaGFyQ29kZUF0KDApLnRvU3RyaW5nKDE2KSkuc2xpY2UoLTQpfSkpO2lmKC9eW1xcXSw6e31cXHNdKiQvLnRlc3QodGV4dC5yZXBsYWNlKC9cXFxcKD86W1wiXFxcXFxcL2JmbnJ0XXx1WzAtOWEtZkEtRl17NH0pL2csXCJAXCIpLnJlcGxhY2UoL1wiW15cIlxcXFxcXG5cXHJdKlwifHRydWV8ZmFsc2V8bnVsbHwtP1xcZCsoPzpcXC5cXGQqKT8oPzpbZUVdWytcXC1dP1xcZCspPy9nLFwiXVwiKS5yZXBsYWNlKC8oPzpefDp8LCkoPzpcXHMqXFxbKSsvZyxcIlwiKSkpcmV0dXJuIGo9ZXZhbChcIihcIit0ZXh0K1wiKVwiKSx0eXBlb2YgcmV2aXZlcj09XCJmdW5jdGlvblwiP3dhbGsoe1wiXCI6an0sXCJcIik6ajt0aHJvdyBuZXcgU3ludGF4RXJyb3IoXCJKU09OLnBhcnNlXCIpfX0oXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvOm1vZHVsZS5leHBvcnRzLHR5cGVvZiBKU09OIT1cInVuZGVmaW5lZFwiP0pTT046dW5kZWZpbmVkKSxmdW5jdGlvbihhLGIpe3ZhciBjPWEucGFyc2VyPXt9LGQ9Yy5wYWNrZXRzPVtcImRpc2Nvbm5lY3RcIixcImNvbm5lY3RcIixcImhlYXJ0YmVhdFwiLFwibWVzc2FnZVwiLFwianNvblwiLFwiZXZlbnRcIixcImFja1wiLFwiZXJyb3JcIixcIm5vb3BcIl0sZT1jLnJlYXNvbnM9W1widHJhbnNwb3J0IG5vdCBzdXBwb3J0ZWRcIixcImNsaWVudCBub3QgaGFuZHNoYWtlblwiLFwidW5hdXRob3JpemVkXCJdLGY9Yy5hZHZpY2U9W1wicmVjb25uZWN0XCJdLGc9Yi5KU09OLGg9Yi51dGlsLmluZGV4T2Y7Yy5lbmNvZGVQYWNrZXQ9ZnVuY3Rpb24oYSl7dmFyIGI9aChkLGEudHlwZSksYz1hLmlkfHxcIlwiLGk9YS5lbmRwb2ludHx8XCJcIixqPWEuYWNrLGs9bnVsbDtzd2l0Y2goYS50eXBlKXtjYXNlXCJlcnJvclwiOnZhciBsPWEucmVhc29uP2goZSxhLnJlYXNvbik6XCJcIixtPWEuYWR2aWNlP2goZixhLmFkdmljZSk6XCJcIjtpZihsIT09XCJcInx8bSE9PVwiXCIpaz1sKyhtIT09XCJcIj9cIitcIittOlwiXCIpO2JyZWFrO2Nhc2VcIm1lc3NhZ2VcIjphLmRhdGEhPT1cIlwiJiYoaz1hLmRhdGEpO2JyZWFrO2Nhc2VcImV2ZW50XCI6dmFyIG49e25hbWU6YS5uYW1lfTthLmFyZ3MmJmEuYXJncy5sZW5ndGgmJihuLmFyZ3M9YS5hcmdzKSxrPWcuc3RyaW5naWZ5KG4pO2JyZWFrO2Nhc2VcImpzb25cIjprPWcuc3RyaW5naWZ5KGEuZGF0YSk7YnJlYWs7Y2FzZVwiY29ubmVjdFwiOmEucXMmJihrPWEucXMpO2JyZWFrO2Nhc2VcImFja1wiOms9YS5hY2tJZCsoYS5hcmdzJiZhLmFyZ3MubGVuZ3RoP1wiK1wiK2cuc3RyaW5naWZ5KGEuYXJncyk6XCJcIil9dmFyIG89W2IsYysoaj09XCJkYXRhXCI/XCIrXCI6XCJcIiksaV07cmV0dXJuIGshPT1udWxsJiZrIT09dW5kZWZpbmVkJiZvLnB1c2goayksby5qb2luKFwiOlwiKX0sYy5lbmNvZGVQYXlsb2FkPWZ1bmN0aW9uKGEpe3ZhciBiPVwiXCI7aWYoYS5sZW5ndGg9PTEpcmV0dXJuIGFbMF07Zm9yKHZhciBjPTAsZD1hLmxlbmd0aDtjPGQ7YysrKXt2YXIgZT1hW2NdO2IrPVwiXFx1ZmZmZFwiK2UubGVuZ3RoK1wiXFx1ZmZmZFwiK2FbY119cmV0dXJuIGJ9O3ZhciBpPS8oW146XSspOihbMC05XSspPyhcXCspPzooW146XSspPzo/KFtcXHNcXFNdKik/LztjLmRlY29kZVBhY2tldD1mdW5jdGlvbihhKXt2YXIgYj1hLm1hdGNoKGkpO2lmKCFiKXJldHVybnt9O3ZhciBjPWJbMl18fFwiXCIsYT1iWzVdfHxcIlwiLGg9e3R5cGU6ZFtiWzFdXSxlbmRwb2ludDpiWzRdfHxcIlwifTtjJiYoaC5pZD1jLGJbM10/aC5hY2s9XCJkYXRhXCI6aC5hY2s9ITApO3N3aXRjaChoLnR5cGUpe2Nhc2VcImVycm9yXCI6dmFyIGI9YS5zcGxpdChcIitcIik7aC5yZWFzb249ZVtiWzBdXXx8XCJcIixoLmFkdmljZT1mW2JbMV1dfHxcIlwiO2JyZWFrO2Nhc2VcIm1lc3NhZ2VcIjpoLmRhdGE9YXx8XCJcIjticmVhaztjYXNlXCJldmVudFwiOnRyeXt2YXIgaj1nLnBhcnNlKGEpO2gubmFtZT1qLm5hbWUsaC5hcmdzPWouYXJnc31jYXRjaChrKXt9aC5hcmdzPWguYXJnc3x8W107YnJlYWs7Y2FzZVwianNvblwiOnRyeXtoLmRhdGE9Zy5wYXJzZShhKX1jYXRjaChrKXt9YnJlYWs7Y2FzZVwiY29ubmVjdFwiOmgucXM9YXx8XCJcIjticmVhaztjYXNlXCJhY2tcIjp2YXIgYj1hLm1hdGNoKC9eKFswLTldKykoXFwrKT8oLiopLyk7aWYoYil7aC5hY2tJZD1iWzFdLGguYXJncz1bXTtpZihiWzNdKXRyeXtoLmFyZ3M9YlszXT9nLnBhcnNlKGJbM10pOltdfWNhdGNoKGspe319YnJlYWs7Y2FzZVwiZGlzY29ubmVjdFwiOmNhc2VcImhlYXJ0YmVhdFwiOn1yZXR1cm4gaH0sYy5kZWNvZGVQYXlsb2FkPWZ1bmN0aW9uKGEpe2lmKGEuY2hhckF0KDApPT1cIlxcdWZmZmRcIil7dmFyIGI9W107Zm9yKHZhciBkPTEsZT1cIlwiO2Q8YS5sZW5ndGg7ZCsrKWEuY2hhckF0KGQpPT1cIlxcdWZmZmRcIj8oYi5wdXNoKGMuZGVjb2RlUGFja2V0KGEuc3Vic3RyKGQrMSkuc3Vic3RyKDAsZSkpKSxkKz1OdW1iZXIoZSkrMSxlPVwiXCIpOmUrPWEuY2hhckF0KGQpO3JldHVybiBifXJldHVybltjLmRlY29kZVBhY2tldChhKV19fShcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW86bW9kdWxlLmV4cG9ydHMsXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvOm1vZHVsZS5wYXJlbnQuZXhwb3J0cyksZnVuY3Rpb24oYSxiKXtmdW5jdGlvbiBjKGEsYil7dGhpcy5zb2NrZXQ9YSx0aGlzLnNlc3NpZD1ifWEuVHJhbnNwb3J0PWMsYi51dGlsLm1peGluKGMsYi5FdmVudEVtaXR0ZXIpLGMucHJvdG90eXBlLmhlYXJ0YmVhdHM9ZnVuY3Rpb24oKXtyZXR1cm4hMH0sYy5wcm90b3R5cGUub25EYXRhPWZ1bmN0aW9uKGEpe3RoaXMuY2xlYXJDbG9zZVRpbWVvdXQoKSwodGhpcy5zb2NrZXQuY29ubmVjdGVkfHx0aGlzLnNvY2tldC5jb25uZWN0aW5nfHx0aGlzLnNvY2tldC5yZWNvbm5lY3RpbmcpJiZ0aGlzLnNldENsb3NlVGltZW91dCgpO2lmKGEhPT1cIlwiKXt2YXIgYz1iLnBhcnNlci5kZWNvZGVQYXlsb2FkKGEpO2lmKGMmJmMubGVuZ3RoKWZvcih2YXIgZD0wLGU9Yy5sZW5ndGg7ZDxlO2QrKyl0aGlzLm9uUGFja2V0KGNbZF0pfXJldHVybiB0aGlzfSxjLnByb3RvdHlwZS5vblBhY2tldD1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5zb2NrZXQuc2V0SGVhcnRiZWF0VGltZW91dCgpLGEudHlwZT09XCJoZWFydGJlYXRcIj90aGlzLm9uSGVhcnRiZWF0KCk6KGEudHlwZT09XCJjb25uZWN0XCImJmEuZW5kcG9pbnQ9PVwiXCImJnRoaXMub25Db25uZWN0KCksYS50eXBlPT1cImVycm9yXCImJmEuYWR2aWNlPT1cInJlY29ubmVjdFwiJiYodGhpcy5pc09wZW49ITEpLHRoaXMuc29ja2V0Lm9uUGFja2V0KGEpLHRoaXMpfSxjLnByb3RvdHlwZS5zZXRDbG9zZVRpbWVvdXQ9ZnVuY3Rpb24oKXtpZighdGhpcy5jbG9zZVRpbWVvdXQpe3ZhciBhPXRoaXM7dGhpcy5jbG9zZVRpbWVvdXQ9c2V0VGltZW91dChmdW5jdGlvbigpe2Eub25EaXNjb25uZWN0KCl9LHRoaXMuc29ja2V0LmNsb3NlVGltZW91dCl9fSxjLnByb3RvdHlwZS5vbkRpc2Nvbm5lY3Q9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5pc09wZW4mJnRoaXMuY2xvc2UoKSx0aGlzLmNsZWFyVGltZW91dHMoKSx0aGlzLnNvY2tldC5vbkRpc2Nvbm5lY3QoKSx0aGlzfSxjLnByb3RvdHlwZS5vbkNvbm5lY3Q9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5zb2NrZXQub25Db25uZWN0KCksdGhpc30sYy5wcm90b3R5cGUuY2xlYXJDbG9zZVRpbWVvdXQ9ZnVuY3Rpb24oKXt0aGlzLmNsb3NlVGltZW91dCYmKGNsZWFyVGltZW91dCh0aGlzLmNsb3NlVGltZW91dCksdGhpcy5jbG9zZVRpbWVvdXQ9bnVsbCl9LGMucHJvdG90eXBlLmNsZWFyVGltZW91dHM9ZnVuY3Rpb24oKXt0aGlzLmNsZWFyQ2xvc2VUaW1lb3V0KCksdGhpcy5yZW9wZW5UaW1lb3V0JiZjbGVhclRpbWVvdXQodGhpcy5yZW9wZW5UaW1lb3V0KX0sYy5wcm90b3R5cGUucGFja2V0PWZ1bmN0aW9uKGEpe3RoaXMuc2VuZChiLnBhcnNlci5lbmNvZGVQYWNrZXQoYSkpfSxjLnByb3RvdHlwZS5vbkhlYXJ0YmVhdD1mdW5jdGlvbihhKXt0aGlzLnBhY2tldCh7dHlwZTpcImhlYXJ0YmVhdFwifSl9LGMucHJvdG90eXBlLm9uT3Blbj1mdW5jdGlvbigpe3RoaXMuaXNPcGVuPSEwLHRoaXMuY2xlYXJDbG9zZVRpbWVvdXQoKSx0aGlzLnNvY2tldC5vbk9wZW4oKX0sYy5wcm90b3R5cGUub25DbG9zZT1mdW5jdGlvbigpe3ZhciBhPXRoaXM7dGhpcy5pc09wZW49ITEsdGhpcy5zb2NrZXQub25DbG9zZSgpLHRoaXMub25EaXNjb25uZWN0KCl9LGMucHJvdG90eXBlLnByZXBhcmVVcmw9ZnVuY3Rpb24oKXt2YXIgYT10aGlzLnNvY2tldC5vcHRpb25zO3JldHVybiB0aGlzLnNjaGVtZSgpK1wiOi8vXCIrYS5ob3N0K1wiOlwiK2EucG9ydCtcIi9cIithLnJlc291cmNlK1wiL1wiK2IucHJvdG9jb2wrXCIvXCIrdGhpcy5uYW1lK1wiL1wiK3RoaXMuc2Vzc2lkfSxjLnByb3RvdHlwZS5yZWFkeT1mdW5jdGlvbihhLGIpe2IuY2FsbCh0aGlzKX19KFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pbzptb2R1bGUuZXhwb3J0cyxcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW86bW9kdWxlLnBhcmVudC5leHBvcnRzKSxmdW5jdGlvbihhLGIsYyl7ZnVuY3Rpb24gZChhKXt0aGlzLm9wdGlvbnM9e3BvcnQ6ODAsc2VjdXJlOiExLGRvY3VtZW50OlwiZG9jdW1lbnRcImluIGM/ZG9jdW1lbnQ6ITEscmVzb3VyY2U6XCJzb2NrZXQuaW9cIix0cmFuc3BvcnRzOmIudHJhbnNwb3J0cyxcImNvbm5lY3QgdGltZW91dFwiOjFlNCxcInRyeSBtdWx0aXBsZSB0cmFuc3BvcnRzXCI6ITAscmVjb25uZWN0OiEwLFwicmVjb25uZWN0aW9uIGRlbGF5XCI6NTAwLFwicmVjb25uZWN0aW9uIGxpbWl0XCI6SW5maW5pdHksXCJyZW9wZW4gZGVsYXlcIjozZTMsXCJtYXggcmVjb25uZWN0aW9uIGF0dGVtcHRzXCI6MTAsXCJzeW5jIGRpc2Nvbm5lY3Qgb24gdW5sb2FkXCI6ITEsXCJhdXRvIGNvbm5lY3RcIjohMCxcImZsYXNoIHBvbGljeSBwb3J0XCI6MTA4NDMsbWFudWFsRmx1c2g6ITF9LGIudXRpbC5tZXJnZSh0aGlzLm9wdGlvbnMsYSksdGhpcy5jb25uZWN0ZWQ9ITEsdGhpcy5vcGVuPSExLHRoaXMuY29ubmVjdGluZz0hMSx0aGlzLnJlY29ubmVjdGluZz0hMSx0aGlzLm5hbWVzcGFjZXM9e30sdGhpcy5idWZmZXI9W10sdGhpcy5kb0J1ZmZlcj0hMTtpZih0aGlzLm9wdGlvbnNbXCJzeW5jIGRpc2Nvbm5lY3Qgb24gdW5sb2FkXCJdJiYoIXRoaXMuaXNYRG9tYWluKCl8fGIudXRpbC51YS5oYXNDT1JTKSl7dmFyIGQ9dGhpcztiLnV0aWwub24oYyxcImJlZm9yZXVubG9hZFwiLGZ1bmN0aW9uKCl7ZC5kaXNjb25uZWN0U3luYygpfSwhMSl9dGhpcy5vcHRpb25zW1wiYXV0byBjb25uZWN0XCJdJiZ0aGlzLmNvbm5lY3QoKX1mdW5jdGlvbiBlKCl7fWEuU29ja2V0PWQsYi51dGlsLm1peGluKGQsYi5FdmVudEVtaXR0ZXIpLGQucHJvdG90eXBlLm9mPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLm5hbWVzcGFjZXNbYV18fCh0aGlzLm5hbWVzcGFjZXNbYV09bmV3IGIuU29ja2V0TmFtZXNwYWNlKHRoaXMsYSksYSE9PVwiXCImJnRoaXMubmFtZXNwYWNlc1thXS5wYWNrZXQoe3R5cGU6XCJjb25uZWN0XCJ9KSksdGhpcy5uYW1lc3BhY2VzW2FdfSxkLnByb3RvdHlwZS5wdWJsaXNoPWZ1bmN0aW9uKCl7dGhpcy5lbWl0LmFwcGx5KHRoaXMsYXJndW1lbnRzKTt2YXIgYTtmb3IodmFyIGIgaW4gdGhpcy5uYW1lc3BhY2VzKXRoaXMubmFtZXNwYWNlcy5oYXNPd25Qcm9wZXJ0eShiKSYmKGE9dGhpcy5vZihiKSxhLiRlbWl0LmFwcGx5KGEsYXJndW1lbnRzKSl9LGQucHJvdG90eXBlLmhhbmRzaGFrZT1mdW5jdGlvbihhKXtmdW5jdGlvbiBmKGIpe2IgaW5zdGFuY2VvZiBFcnJvcj8oYy5jb25uZWN0aW5nPSExLGMub25FcnJvcihiLm1lc3NhZ2UpKTphLmFwcGx5KG51bGwsYi5zcGxpdChcIjpcIikpfXZhciBjPXRoaXMsZD10aGlzLm9wdGlvbnMsZz1bXCJodHRwXCIrKGQuc2VjdXJlP1wic1wiOlwiXCIpK1wiOi9cIixkLmhvc3QrXCI6XCIrZC5wb3J0LGQucmVzb3VyY2UsYi5wcm90b2NvbCxiLnV0aWwucXVlcnkodGhpcy5vcHRpb25zLnF1ZXJ5LFwidD1cIisgKyhuZXcgRGF0ZSkpXS5qb2luKFwiL1wiKTtpZih0aGlzLmlzWERvbWFpbigpJiYhYi51dGlsLnVhLmhhc0NPUlMpe3ZhciBoPWRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwic2NyaXB0XCIpWzBdLGk9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNjcmlwdFwiKTtpLnNyYz1nK1wiJmpzb25wPVwiK2Iuai5sZW5ndGgsaC5wYXJlbnROb2RlLmluc2VydEJlZm9yZShpLGgpLGIuai5wdXNoKGZ1bmN0aW9uKGEpe2YoYSksaS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGkpfSl9ZWxzZXt2YXIgaj1iLnV0aWwucmVxdWVzdCgpO2oub3BlbihcIkdFVFwiLGcsITApLHRoaXMuaXNYRG9tYWluKCkmJihqLndpdGhDcmVkZW50aWFscz0hMCksai5vbnJlYWR5c3RhdGVjaGFuZ2U9ZnVuY3Rpb24oKXtqLnJlYWR5U3RhdGU9PTQmJihqLm9ucmVhZHlzdGF0ZWNoYW5nZT1lLGouc3RhdHVzPT0yMDA/ZihqLnJlc3BvbnNlVGV4dCk6ai5zdGF0dXM9PTQwMz9jLm9uRXJyb3Ioai5yZXNwb25zZVRleHQpOihjLmNvbm5lY3Rpbmc9ITEsIWMucmVjb25uZWN0aW5nJiZjLm9uRXJyb3Ioai5yZXNwb25zZVRleHQpKSl9LGouc2VuZChudWxsKX19LGQucHJvdG90eXBlLmdldFRyYW5zcG9ydD1mdW5jdGlvbihhKXt2YXIgYz1hfHx0aGlzLnRyYW5zcG9ydHMsZDtmb3IodmFyIGU9MCxmO2Y9Y1tlXTtlKyspaWYoYi5UcmFuc3BvcnRbZl0mJmIuVHJhbnNwb3J0W2ZdLmNoZWNrKHRoaXMpJiYoIXRoaXMuaXNYRG9tYWluKCl8fGIuVHJhbnNwb3J0W2ZdLnhkb21haW5DaGVjayh0aGlzKSkpcmV0dXJuIG5ldyBiLlRyYW5zcG9ydFtmXSh0aGlzLHRoaXMuc2Vzc2lvbmlkKTtyZXR1cm4gbnVsbH0sZC5wcm90b3R5cGUuY29ubmVjdD1mdW5jdGlvbihhKXtpZih0aGlzLmNvbm5lY3RpbmcpcmV0dXJuIHRoaXM7dmFyIGM9dGhpcztyZXR1cm4gYy5jb25uZWN0aW5nPSEwLHRoaXMuaGFuZHNoYWtlKGZ1bmN0aW9uKGQsZSxmLGcpe2Z1bmN0aW9uIGgoYSl7Yy50cmFuc3BvcnQmJmMudHJhbnNwb3J0LmNsZWFyVGltZW91dHMoKSxjLnRyYW5zcG9ydD1jLmdldFRyYW5zcG9ydChhKTtpZighYy50cmFuc3BvcnQpcmV0dXJuIGMucHVibGlzaChcImNvbm5lY3RfZmFpbGVkXCIpO2MudHJhbnNwb3J0LnJlYWR5KGMsZnVuY3Rpb24oKXtjLmNvbm5lY3Rpbmc9ITAsYy5wdWJsaXNoKFwiY29ubmVjdGluZ1wiLGMudHJhbnNwb3J0Lm5hbWUpLGMudHJhbnNwb3J0Lm9wZW4oKSxjLm9wdGlvbnNbXCJjb25uZWN0IHRpbWVvdXRcIl0mJihjLmNvbm5lY3RUaW1lb3V0VGltZXI9c2V0VGltZW91dChmdW5jdGlvbigpe2lmKCFjLmNvbm5lY3RlZCl7Yy5jb25uZWN0aW5nPSExO2lmKGMub3B0aW9uc1tcInRyeSBtdWx0aXBsZSB0cmFuc3BvcnRzXCJdKXt2YXIgYT1jLnRyYW5zcG9ydHM7d2hpbGUoYS5sZW5ndGg+MCYmYS5zcGxpY2UoMCwxKVswXSE9Yy50cmFuc3BvcnQubmFtZSk7YS5sZW5ndGg/aChhKTpjLnB1Ymxpc2goXCJjb25uZWN0X2ZhaWxlZFwiKX19fSxjLm9wdGlvbnNbXCJjb25uZWN0IHRpbWVvdXRcIl0pKX0pfWMuc2Vzc2lvbmlkPWQsYy5jbG9zZVRpbWVvdXQ9ZioxZTMsYy5oZWFydGJlYXRUaW1lb3V0PWUqMWUzLGMudHJhbnNwb3J0c3x8KGMudHJhbnNwb3J0cz1jLm9yaWdUcmFuc3BvcnRzPWc/Yi51dGlsLmludGVyc2VjdChnLnNwbGl0KFwiLFwiKSxjLm9wdGlvbnMudHJhbnNwb3J0cyk6Yy5vcHRpb25zLnRyYW5zcG9ydHMpLGMuc2V0SGVhcnRiZWF0VGltZW91dCgpLGgoYy50cmFuc3BvcnRzKSxjLm9uY2UoXCJjb25uZWN0XCIsZnVuY3Rpb24oKXtjbGVhclRpbWVvdXQoYy5jb25uZWN0VGltZW91dFRpbWVyKSxhJiZ0eXBlb2YgYT09XCJmdW5jdGlvblwiJiZhKCl9KX0pLHRoaXN9LGQucHJvdG90eXBlLnNldEhlYXJ0YmVhdFRpbWVvdXQ9ZnVuY3Rpb24oKXtjbGVhclRpbWVvdXQodGhpcy5oZWFydGJlYXRUaW1lb3V0VGltZXIpO2lmKHRoaXMudHJhbnNwb3J0JiYhdGhpcy50cmFuc3BvcnQuaGVhcnRiZWF0cygpKXJldHVybjt2YXIgYT10aGlzO3RoaXMuaGVhcnRiZWF0VGltZW91dFRpbWVyPXNldFRpbWVvdXQoZnVuY3Rpb24oKXthLnRyYW5zcG9ydC5vbkNsb3NlKCl9LHRoaXMuaGVhcnRiZWF0VGltZW91dCl9LGQucHJvdG90eXBlLnBhY2tldD1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5jb25uZWN0ZWQmJiF0aGlzLmRvQnVmZmVyP3RoaXMudHJhbnNwb3J0LnBhY2tldChhKTp0aGlzLmJ1ZmZlci5wdXNoKGEpLHRoaXN9LGQucHJvdG90eXBlLnNldEJ1ZmZlcj1mdW5jdGlvbihhKXt0aGlzLmRvQnVmZmVyPWEsIWEmJnRoaXMuY29ubmVjdGVkJiZ0aGlzLmJ1ZmZlci5sZW5ndGgmJih0aGlzLm9wdGlvbnMubWFudWFsRmx1c2h8fHRoaXMuZmx1c2hCdWZmZXIoKSl9LGQucHJvdG90eXBlLmZsdXNoQnVmZmVyPWZ1bmN0aW9uKCl7dGhpcy50cmFuc3BvcnQucGF5bG9hZCh0aGlzLmJ1ZmZlciksdGhpcy5idWZmZXI9W119LGQucHJvdG90eXBlLmRpc2Nvbm5lY3Q9ZnVuY3Rpb24oKXtpZih0aGlzLmNvbm5lY3RlZHx8dGhpcy5jb25uZWN0aW5nKXRoaXMub3BlbiYmdGhpcy5vZihcIlwiKS5wYWNrZXQoe3R5cGU6XCJkaXNjb25uZWN0XCJ9KSx0aGlzLm9uRGlzY29ubmVjdChcImJvb3RlZFwiKTtyZXR1cm4gdGhpc30sZC5wcm90b3R5cGUuZGlzY29ubmVjdFN5bmM9ZnVuY3Rpb24oKXt2YXIgYT1iLnV0aWwucmVxdWVzdCgpLGM9W1wiaHR0cFwiKyh0aGlzLm9wdGlvbnMuc2VjdXJlP1wic1wiOlwiXCIpK1wiOi9cIix0aGlzLm9wdGlvbnMuaG9zdCtcIjpcIit0aGlzLm9wdGlvbnMucG9ydCx0aGlzLm9wdGlvbnMucmVzb3VyY2UsYi5wcm90b2NvbCxcIlwiLHRoaXMuc2Vzc2lvbmlkXS5qb2luKFwiL1wiKStcIi8/ZGlzY29ubmVjdD0xXCI7YS5vcGVuKFwiR0VUXCIsYywhMSksYS5zZW5kKG51bGwpLHRoaXMub25EaXNjb25uZWN0KFwiYm9vdGVkXCIpfSxkLnByb3RvdHlwZS5pc1hEb21haW49ZnVuY3Rpb24oKXt2YXIgYT1jLmxvY2F0aW9uLnBvcnR8fChcImh0dHBzOlwiPT1jLmxvY2F0aW9uLnByb3RvY29sPzQ0Mzo4MCk7cmV0dXJuIHRoaXMub3B0aW9ucy5ob3N0IT09Yy5sb2NhdGlvbi5ob3N0bmFtZXx8dGhpcy5vcHRpb25zLnBvcnQhPWF9LGQucHJvdG90eXBlLm9uQ29ubmVjdD1mdW5jdGlvbigpe3RoaXMuY29ubmVjdGVkfHwodGhpcy5jb25uZWN0ZWQ9ITAsdGhpcy5jb25uZWN0aW5nPSExLHRoaXMuZG9CdWZmZXJ8fHRoaXMuc2V0QnVmZmVyKCExKSx0aGlzLmVtaXQoXCJjb25uZWN0XCIpKX0sZC5wcm90b3R5cGUub25PcGVuPWZ1bmN0aW9uKCl7dGhpcy5vcGVuPSEwfSxkLnByb3RvdHlwZS5vbkNsb3NlPWZ1bmN0aW9uKCl7dGhpcy5vcGVuPSExLGNsZWFyVGltZW91dCh0aGlzLmhlYXJ0YmVhdFRpbWVvdXRUaW1lcil9LGQucHJvdG90eXBlLm9uUGFja2V0PWZ1bmN0aW9uKGEpe3RoaXMub2YoYS5lbmRwb2ludCkub25QYWNrZXQoYSl9LGQucHJvdG90eXBlLm9uRXJyb3I9ZnVuY3Rpb24oYSl7YSYmYS5hZHZpY2UmJmEuYWR2aWNlPT09XCJyZWNvbm5lY3RcIiYmKHRoaXMuY29ubmVjdGVkfHx0aGlzLmNvbm5lY3RpbmcpJiYodGhpcy5kaXNjb25uZWN0KCksdGhpcy5vcHRpb25zLnJlY29ubmVjdCYmdGhpcy5yZWNvbm5lY3QoKSksdGhpcy5wdWJsaXNoKFwiZXJyb3JcIixhJiZhLnJlYXNvbj9hLnJlYXNvbjphKX0sZC5wcm90b3R5cGUub25EaXNjb25uZWN0PWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXMuY29ubmVjdGVkLGM9dGhpcy5jb25uZWN0aW5nO3RoaXMuY29ubmVjdGVkPSExLHRoaXMuY29ubmVjdGluZz0hMSx0aGlzLm9wZW49ITE7aWYoYnx8Yyl0aGlzLnRyYW5zcG9ydC5jbG9zZSgpLHRoaXMudHJhbnNwb3J0LmNsZWFyVGltZW91dHMoKSxiJiYodGhpcy5wdWJsaXNoKFwiZGlzY29ubmVjdFwiLGEpLFwiYm9vdGVkXCIhPWEmJnRoaXMub3B0aW9ucy5yZWNvbm5lY3QmJiF0aGlzLnJlY29ubmVjdGluZyYmdGhpcy5yZWNvbm5lY3QoKSl9LGQucHJvdG90eXBlLnJlY29ubmVjdD1mdW5jdGlvbigpe2Z1bmN0aW9uIGUoKXtpZihhLmNvbm5lY3RlZCl7Zm9yKHZhciBiIGluIGEubmFtZXNwYWNlcylhLm5hbWVzcGFjZXMuaGFzT3duUHJvcGVydHkoYikmJlwiXCIhPT1iJiZhLm5hbWVzcGFjZXNbYl0ucGFja2V0KHt0eXBlOlwiY29ubmVjdFwifSk7YS5wdWJsaXNoKFwicmVjb25uZWN0XCIsYS50cmFuc3BvcnQubmFtZSxhLnJlY29ubmVjdGlvbkF0dGVtcHRzKX1jbGVhclRpbWVvdXQoYS5yZWNvbm5lY3Rpb25UaW1lciksYS5yZW1vdmVMaXN0ZW5lcihcImNvbm5lY3RfZmFpbGVkXCIsZiksYS5yZW1vdmVMaXN0ZW5lcihcImNvbm5lY3RcIixmKSxhLnJlY29ubmVjdGluZz0hMSxkZWxldGUgYS5yZWNvbm5lY3Rpb25BdHRlbXB0cyxkZWxldGUgYS5yZWNvbm5lY3Rpb25EZWxheSxkZWxldGUgYS5yZWNvbm5lY3Rpb25UaW1lcixkZWxldGUgYS5yZWRvVHJhbnNwb3J0cyxhLm9wdGlvbnNbXCJ0cnkgbXVsdGlwbGUgdHJhbnNwb3J0c1wiXT1jfWZ1bmN0aW9uIGYoKXtpZighYS5yZWNvbm5lY3RpbmcpcmV0dXJuO2lmKGEuY29ubmVjdGVkKXJldHVybiBlKCk7aWYoYS5jb25uZWN0aW5nJiZhLnJlY29ubmVjdGluZylyZXR1cm4gYS5yZWNvbm5lY3Rpb25UaW1lcj1zZXRUaW1lb3V0KGYsMWUzKTthLnJlY29ubmVjdGlvbkF0dGVtcHRzKys+PWI/YS5yZWRvVHJhbnNwb3J0cz8oYS5wdWJsaXNoKFwicmVjb25uZWN0X2ZhaWxlZFwiKSxlKCkpOihhLm9uKFwiY29ubmVjdF9mYWlsZWRcIixmKSxhLm9wdGlvbnNbXCJ0cnkgbXVsdGlwbGUgdHJhbnNwb3J0c1wiXT0hMCxhLnRyYW5zcG9ydHM9YS5vcmlnVHJhbnNwb3J0cyxhLnRyYW5zcG9ydD1hLmdldFRyYW5zcG9ydCgpLGEucmVkb1RyYW5zcG9ydHM9ITAsYS5jb25uZWN0KCkpOihhLnJlY29ubmVjdGlvbkRlbGF5PGQmJihhLnJlY29ubmVjdGlvbkRlbGF5Kj0yKSxhLmNvbm5lY3QoKSxhLnB1Ymxpc2goXCJyZWNvbm5lY3RpbmdcIixhLnJlY29ubmVjdGlvbkRlbGF5LGEucmVjb25uZWN0aW9uQXR0ZW1wdHMpLGEucmVjb25uZWN0aW9uVGltZXI9c2V0VGltZW91dChmLGEucmVjb25uZWN0aW9uRGVsYXkpKX10aGlzLnJlY29ubmVjdGluZz0hMCx0aGlzLnJlY29ubmVjdGlvbkF0dGVtcHRzPTAsdGhpcy5yZWNvbm5lY3Rpb25EZWxheT10aGlzLm9wdGlvbnNbXCJyZWNvbm5lY3Rpb24gZGVsYXlcIl07dmFyIGE9dGhpcyxiPXRoaXMub3B0aW9uc1tcIm1heCByZWNvbm5lY3Rpb24gYXR0ZW1wdHNcIl0sYz10aGlzLm9wdGlvbnNbXCJ0cnkgbXVsdGlwbGUgdHJhbnNwb3J0c1wiXSxkPXRoaXMub3B0aW9uc1tcInJlY29ubmVjdGlvbiBsaW1pdFwiXTt0aGlzLm9wdGlvbnNbXCJ0cnkgbXVsdGlwbGUgdHJhbnNwb3J0c1wiXT0hMSx0aGlzLnJlY29ubmVjdGlvblRpbWVyPXNldFRpbWVvdXQoZix0aGlzLnJlY29ubmVjdGlvbkRlbGF5KSx0aGlzLm9uKFwiY29ubmVjdFwiLGYpfX0oXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvOm1vZHVsZS5leHBvcnRzLFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pbzptb2R1bGUucGFyZW50LmV4cG9ydHMsdGhpcyksZnVuY3Rpb24oYSxiKXtmdW5jdGlvbiBjKGEsYil7dGhpcy5zb2NrZXQ9YSx0aGlzLm5hbWU9Ynx8XCJcIix0aGlzLmZsYWdzPXt9LHRoaXMuanNvbj1uZXcgZCh0aGlzLFwianNvblwiKSx0aGlzLmFja1BhY2tldHM9MCx0aGlzLmFja3M9e319ZnVuY3Rpb24gZChhLGIpe3RoaXMubmFtZXNwYWNlPWEsdGhpcy5uYW1lPWJ9YS5Tb2NrZXROYW1lc3BhY2U9YyxiLnV0aWwubWl4aW4oYyxiLkV2ZW50RW1pdHRlciksYy5wcm90b3R5cGUuJGVtaXQ9Yi5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmVtaXQsYy5wcm90b3R5cGUub2Y9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5zb2NrZXQub2YuYXBwbHkodGhpcy5zb2NrZXQsYXJndW1lbnRzKX0sYy5wcm90b3R5cGUucGFja2V0PWZ1bmN0aW9uKGEpe3JldHVybiBhLmVuZHBvaW50PXRoaXMubmFtZSx0aGlzLnNvY2tldC5wYWNrZXQoYSksdGhpcy5mbGFncz17fSx0aGlzfSxjLnByb3RvdHlwZS5zZW5kPWZ1bmN0aW9uKGEsYil7dmFyIGM9e3R5cGU6dGhpcy5mbGFncy5qc29uP1wianNvblwiOlwibWVzc2FnZVwiLGRhdGE6YX07cmV0dXJuXCJmdW5jdGlvblwiPT10eXBlb2YgYiYmKGMuaWQ9Kyt0aGlzLmFja1BhY2tldHMsYy5hY2s9ITAsdGhpcy5hY2tzW2MuaWRdPWIpLHRoaXMucGFja2V0KGMpfSxjLnByb3RvdHlwZS5lbWl0PWZ1bmN0aW9uKGEpe3ZhciBiPUFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywxKSxjPWJbYi5sZW5ndGgtMV0sZD17dHlwZTpcImV2ZW50XCIsbmFtZTphfTtyZXR1cm5cImZ1bmN0aW9uXCI9PXR5cGVvZiBjJiYoZC5pZD0rK3RoaXMuYWNrUGFja2V0cyxkLmFjaz1cImRhdGFcIix0aGlzLmFja3NbZC5pZF09YyxiPWIuc2xpY2UoMCxiLmxlbmd0aC0xKSksZC5hcmdzPWIsdGhpcy5wYWNrZXQoZCl9LGMucHJvdG90eXBlLmRpc2Nvbm5lY3Q9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5uYW1lPT09XCJcIj90aGlzLnNvY2tldC5kaXNjb25uZWN0KCk6KHRoaXMucGFja2V0KHt0eXBlOlwiZGlzY29ubmVjdFwifSksdGhpcy4kZW1pdChcImRpc2Nvbm5lY3RcIikpLHRoaXN9LGMucHJvdG90eXBlLm9uUGFja2V0PWZ1bmN0aW9uKGEpe2Z1bmN0aW9uIGQoKXtjLnBhY2tldCh7dHlwZTpcImFja1wiLGFyZ3M6Yi51dGlsLnRvQXJyYXkoYXJndW1lbnRzKSxhY2tJZDphLmlkfSl9dmFyIGM9dGhpcztzd2l0Y2goYS50eXBlKXtjYXNlXCJjb25uZWN0XCI6dGhpcy4kZW1pdChcImNvbm5lY3RcIik7YnJlYWs7Y2FzZVwiZGlzY29ubmVjdFwiOnRoaXMubmFtZT09PVwiXCI/dGhpcy5zb2NrZXQub25EaXNjb25uZWN0KGEucmVhc29ufHxcImJvb3RlZFwiKTp0aGlzLiRlbWl0KFwiZGlzY29ubmVjdFwiLGEucmVhc29uKTticmVhaztjYXNlXCJtZXNzYWdlXCI6Y2FzZVwianNvblwiOnZhciBlPVtcIm1lc3NhZ2VcIixhLmRhdGFdO2EuYWNrPT1cImRhdGFcIj9lLnB1c2goZCk6YS5hY2smJnRoaXMucGFja2V0KHt0eXBlOlwiYWNrXCIsYWNrSWQ6YS5pZH0pLHRoaXMuJGVtaXQuYXBwbHkodGhpcyxlKTticmVhaztjYXNlXCJldmVudFwiOnZhciBlPVthLm5hbWVdLmNvbmNhdChhLmFyZ3MpO2EuYWNrPT1cImRhdGFcIiYmZS5wdXNoKGQpLHRoaXMuJGVtaXQuYXBwbHkodGhpcyxlKTticmVhaztjYXNlXCJhY2tcIjp0aGlzLmFja3NbYS5hY2tJZF0mJih0aGlzLmFja3NbYS5hY2tJZF0uYXBwbHkodGhpcyxhLmFyZ3MpLGRlbGV0ZSB0aGlzLmFja3NbYS5hY2tJZF0pO2JyZWFrO2Nhc2VcImVycm9yXCI6YS5hZHZpY2U/dGhpcy5zb2NrZXQub25FcnJvcihhKTphLnJlYXNvbj09XCJ1bmF1dGhvcml6ZWRcIj90aGlzLiRlbWl0KFwiY29ubmVjdF9mYWlsZWRcIixhLnJlYXNvbik6dGhpcy4kZW1pdChcImVycm9yXCIsYS5yZWFzb24pfX0sZC5wcm90b3R5cGUuc2VuZD1mdW5jdGlvbigpe3RoaXMubmFtZXNwYWNlLmZsYWdzW3RoaXMubmFtZV09ITAsdGhpcy5uYW1lc3BhY2Uuc2VuZC5hcHBseSh0aGlzLm5hbWVzcGFjZSxhcmd1bWVudHMpfSxkLnByb3RvdHlwZS5lbWl0PWZ1bmN0aW9uKCl7dGhpcy5uYW1lc3BhY2UuZmxhZ3NbdGhpcy5uYW1lXT0hMCx0aGlzLm5hbWVzcGFjZS5lbWl0LmFwcGx5KHRoaXMubmFtZXNwYWNlLGFyZ3VtZW50cyl9fShcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW86bW9kdWxlLmV4cG9ydHMsXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvOm1vZHVsZS5wYXJlbnQuZXhwb3J0cyksZnVuY3Rpb24oYSxiLGMpe2Z1bmN0aW9uIGQoYSl7Yi5UcmFuc3BvcnQuYXBwbHkodGhpcyxhcmd1bWVudHMpfWEud2Vic29ja2V0PWQsYi51dGlsLmluaGVyaXQoZCxiLlRyYW5zcG9ydCksZC5wcm90b3R5cGUubmFtZT1cIndlYnNvY2tldFwiLGQucHJvdG90eXBlLm9wZW49ZnVuY3Rpb24oKXt2YXIgYT1iLnV0aWwucXVlcnkodGhpcy5zb2NrZXQub3B0aW9ucy5xdWVyeSksZD10aGlzLGU7cmV0dXJuIGV8fChlPWMuTW96V2ViU29ja2V0fHxjLldlYlNvY2tldCksdGhpcy53ZWJzb2NrZXQ9bmV3IGUodGhpcy5wcmVwYXJlVXJsKCkrYSksdGhpcy53ZWJzb2NrZXQub25vcGVuPWZ1bmN0aW9uKCl7ZC5vbk9wZW4oKSxkLnNvY2tldC5zZXRCdWZmZXIoITEpfSx0aGlzLndlYnNvY2tldC5vbm1lc3NhZ2U9ZnVuY3Rpb24oYSl7ZC5vbkRhdGEoYS5kYXRhKX0sdGhpcy53ZWJzb2NrZXQub25jbG9zZT1mdW5jdGlvbigpe2Qub25DbG9zZSgpLGQuc29ja2V0LnNldEJ1ZmZlcighMCl9LHRoaXMud2Vic29ja2V0Lm9uZXJyb3I9ZnVuY3Rpb24oYSl7ZC5vbkVycm9yKGEpfSx0aGlzfSxiLnV0aWwudWEuaURldmljZT9kLnByb3RvdHlwZS5zZW5kPWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7cmV0dXJuIHNldFRpbWVvdXQoZnVuY3Rpb24oKXtiLndlYnNvY2tldC5zZW5kKGEpfSwwKSx0aGlzfTpkLnByb3RvdHlwZS5zZW5kPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLndlYnNvY2tldC5zZW5kKGEpLHRoaXN9LGQucHJvdG90eXBlLnBheWxvYWQ9ZnVuY3Rpb24oYSl7Zm9yKHZhciBiPTAsYz1hLmxlbmd0aDtiPGM7YisrKXRoaXMucGFja2V0KGFbYl0pO3JldHVybiB0aGlzfSxkLnByb3RvdHlwZS5jbG9zZT1mdW5jdGlvbigpe3JldHVybiB0aGlzLndlYnNvY2tldC5jbG9zZSgpLHRoaXN9LGQucHJvdG90eXBlLm9uRXJyb3I9ZnVuY3Rpb24oYSl7dGhpcy5zb2NrZXQub25FcnJvcihhKX0sZC5wcm90b3R5cGUuc2NoZW1lPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuc29ja2V0Lm9wdGlvbnMuc2VjdXJlP1wid3NzXCI6XCJ3c1wifSxkLmNoZWNrPWZ1bmN0aW9uKCl7cmV0dXJuXCJXZWJTb2NrZXRcImluIGMmJiEoXCJfX2FkZFRhc2tcImluIFdlYlNvY2tldCl8fFwiTW96V2ViU29ja2V0XCJpbiBjfSxkLnhkb21haW5DaGVjaz1mdW5jdGlvbigpe3JldHVybiEwfSxiLnRyYW5zcG9ydHMucHVzaChcIndlYnNvY2tldFwiKX0oXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvLlRyYW5zcG9ydDptb2R1bGUuZXhwb3J0cyxcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW86bW9kdWxlLnBhcmVudC5leHBvcnRzLHRoaXMpLGZ1bmN0aW9uKGEsYil7ZnVuY3Rpb24gYygpe2IuVHJhbnNwb3J0LndlYnNvY2tldC5hcHBseSh0aGlzLGFyZ3VtZW50cyl9YS5mbGFzaHNvY2tldD1jLGIudXRpbC5pbmhlcml0KGMsYi5UcmFuc3BvcnQud2Vic29ja2V0KSxjLnByb3RvdHlwZS5uYW1lPVwiZmxhc2hzb2NrZXRcIixjLnByb3RvdHlwZS5vcGVuPWZ1bmN0aW9uKCl7dmFyIGE9dGhpcyxjPWFyZ3VtZW50cztyZXR1cm4gV2ViU29ja2V0Ll9fYWRkVGFzayhmdW5jdGlvbigpe2IuVHJhbnNwb3J0LndlYnNvY2tldC5wcm90b3R5cGUub3Blbi5hcHBseShhLGMpfSksdGhpc30sYy5wcm90b3R5cGUuc2VuZD1mdW5jdGlvbigpe3ZhciBhPXRoaXMsYz1hcmd1bWVudHM7cmV0dXJuIFdlYlNvY2tldC5fX2FkZFRhc2soZnVuY3Rpb24oKXtiLlRyYW5zcG9ydC53ZWJzb2NrZXQucHJvdG90eXBlLnNlbmQuYXBwbHkoYSxjKX0pLHRoaXN9LGMucHJvdG90eXBlLmNsb3NlPWZ1bmN0aW9uKCl7cmV0dXJuIFdlYlNvY2tldC5fX3Rhc2tzLmxlbmd0aD0wLGIuVHJhbnNwb3J0LndlYnNvY2tldC5wcm90b3R5cGUuY2xvc2UuY2FsbCh0aGlzKSx0aGlzfSxjLnByb3RvdHlwZS5yZWFkeT1mdW5jdGlvbihhLGQpe2Z1bmN0aW9uIGUoKXt2YXIgYj1hLm9wdGlvbnMsZT1iW1wiZmxhc2ggcG9saWN5IHBvcnRcIl0sZz1bXCJodHRwXCIrKGIuc2VjdXJlP1wic1wiOlwiXCIpK1wiOi9cIixiLmhvc3QrXCI6XCIrYi5wb3J0LGIucmVzb3VyY2UsXCJzdGF0aWMvZmxhc2hzb2NrZXRcIixcIldlYlNvY2tldE1haW5cIisoYS5pc1hEb21haW4oKT9cIkluc2VjdXJlXCI6XCJcIikrXCIuc3dmXCJdO2MubG9hZGVkfHwodHlwZW9mIFdFQl9TT0NLRVRfU1dGX0xPQ0FUSU9OPT1cInVuZGVmaW5lZFwiJiYoV0VCX1NPQ0tFVF9TV0ZfTE9DQVRJT049Zy5qb2luKFwiL1wiKSksZSE9PTg0MyYmV2ViU29ja2V0LmxvYWRGbGFzaFBvbGljeUZpbGUoXCJ4bWxzb2NrZXQ6Ly9cIitiLmhvc3QrXCI6XCIrZSksV2ViU29ja2V0Ll9faW5pdGlhbGl6ZSgpLGMubG9hZGVkPSEwKSxkLmNhbGwoZil9dmFyIGY9dGhpcztpZihkb2N1bWVudC5ib2R5KXJldHVybiBlKCk7Yi51dGlsLmxvYWQoZSl9LGMuY2hlY2s9ZnVuY3Rpb24oKXtyZXR1cm4gdHlwZW9mIFdlYlNvY2tldCE9XCJ1bmRlZmluZWRcIiYmXCJfX2luaXRpYWxpemVcImluIFdlYlNvY2tldCYmISFzd2ZvYmplY3Q/c3dmb2JqZWN0LmdldEZsYXNoUGxheWVyVmVyc2lvbigpLm1ham9yPj0xMDohMX0sYy54ZG9tYWluQ2hlY2s9ZnVuY3Rpb24oKXtyZXR1cm4hMH0sdHlwZW9mIHdpbmRvdyE9XCJ1bmRlZmluZWRcIiYmKFdFQl9TT0NLRVRfRElTQUJMRV9BVVRPX0lOSVRJQUxJWkFUSU9OPSEwKSxiLnRyYW5zcG9ydHMucHVzaChcImZsYXNoc29ja2V0XCIpfShcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW8uVHJhbnNwb3J0Om1vZHVsZS5leHBvcnRzLFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pbzptb2R1bGUucGFyZW50LmV4cG9ydHMpO2lmKFwidW5kZWZpbmVkXCIhPXR5cGVvZiB3aW5kb3cpdmFyIHN3Zm9iamVjdD1mdW5jdGlvbigpe2Z1bmN0aW9uIEEoKXtpZih0KXJldHVybjt0cnl7dmFyIGE9aS5nZXRFbGVtZW50c0J5VGFnTmFtZShcImJvZHlcIilbMF0uYXBwZW5kQ2hpbGQoUShcInNwYW5cIikpO2EucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChhKX1jYXRjaChiKXtyZXR1cm59dD0hMDt2YXIgYz1sLmxlbmd0aDtmb3IodmFyIGQ9MDtkPGM7ZCsrKWxbZF0oKX1mdW5jdGlvbiBCKGEpe3Q/YSgpOmxbbC5sZW5ndGhdPWF9ZnVuY3Rpb24gQyhiKXtpZih0eXBlb2YgaC5hZGRFdmVudExpc3RlbmVyIT1hKWguYWRkRXZlbnRMaXN0ZW5lcihcImxvYWRcIixiLCExKTtlbHNlIGlmKHR5cGVvZiBpLmFkZEV2ZW50TGlzdGVuZXIhPWEpaS5hZGRFdmVudExpc3RlbmVyKFwibG9hZFwiLGIsITEpO2Vsc2UgaWYodHlwZW9mIGguYXR0YWNoRXZlbnQhPWEpUihoLFwib25sb2FkXCIsYik7ZWxzZSBpZih0eXBlb2YgaC5vbmxvYWQ9PVwiZnVuY3Rpb25cIil7dmFyIGM9aC5vbmxvYWQ7aC5vbmxvYWQ9ZnVuY3Rpb24oKXtjKCksYigpfX1lbHNlIGgub25sb2FkPWJ9ZnVuY3Rpb24gRCgpe2s/RSgpOkYoKX1mdW5jdGlvbiBFKCl7dmFyIGM9aS5nZXRFbGVtZW50c0J5VGFnTmFtZShcImJvZHlcIilbMF0sZD1RKGIpO2Quc2V0QXR0cmlidXRlKFwidHlwZVwiLGUpO3ZhciBmPWMuYXBwZW5kQ2hpbGQoZCk7aWYoZil7dmFyIGc9MDsoZnVuY3Rpb24oKXtpZih0eXBlb2YgZi5HZXRWYXJpYWJsZSE9YSl7dmFyIGI9Zi5HZXRWYXJpYWJsZShcIiR2ZXJzaW9uXCIpO2ImJihiPWIuc3BsaXQoXCIgXCIpWzFdLnNwbGl0KFwiLFwiKSx5LnB2PVtwYXJzZUludChiWzBdLDEwKSxwYXJzZUludChiWzFdLDEwKSxwYXJzZUludChiWzJdLDEwKV0pfWVsc2UgaWYoZzwxMCl7ZysrLHNldFRpbWVvdXQoYXJndW1lbnRzLmNhbGxlZSwxMCk7cmV0dXJufWMucmVtb3ZlQ2hpbGQoZCksZj1udWxsLEYoKX0pKCl9ZWxzZSBGKCl9ZnVuY3Rpb24gRigpe3ZhciBiPW0ubGVuZ3RoO2lmKGI+MClmb3IodmFyIGM9MDtjPGI7YysrKXt2YXIgZD1tW2NdLmlkLGU9bVtjXS5jYWxsYmFja0ZuLGY9e3N1Y2Nlc3M6ITEsaWQ6ZH07aWYoeS5wdlswXT4wKXt2YXIgZz1QKGQpO2lmKGcpaWYoUyhtW2NdLnN3ZlZlcnNpb24pJiYhKHkud2smJnkud2s8MzEyKSlVKGQsITApLGUmJihmLnN1Y2Nlc3M9ITAsZi5yZWY9RyhkKSxlKGYpKTtlbHNlIGlmKG1bY10uZXhwcmVzc0luc3RhbGwmJkgoKSl7dmFyIGg9e307aC5kYXRhPW1bY10uZXhwcmVzc0luc3RhbGwsaC53aWR0aD1nLmdldEF0dHJpYnV0ZShcIndpZHRoXCIpfHxcIjBcIixoLmhlaWdodD1nLmdldEF0dHJpYnV0ZShcImhlaWdodFwiKXx8XCIwXCIsZy5nZXRBdHRyaWJ1dGUoXCJjbGFzc1wiKSYmKGguc3R5bGVjbGFzcz1nLmdldEF0dHJpYnV0ZShcImNsYXNzXCIpKSxnLmdldEF0dHJpYnV0ZShcImFsaWduXCIpJiYoaC5hbGlnbj1nLmdldEF0dHJpYnV0ZShcImFsaWduXCIpKTt2YXIgaT17fSxqPWcuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJwYXJhbVwiKSxrPWoubGVuZ3RoO2Zvcih2YXIgbD0wO2w8aztsKyspaltsXS5nZXRBdHRyaWJ1dGUoXCJuYW1lXCIpLnRvTG93ZXJDYXNlKCkhPVwibW92aWVcIiYmKGlbaltsXS5nZXRBdHRyaWJ1dGUoXCJuYW1lXCIpXT1qW2xdLmdldEF0dHJpYnV0ZShcInZhbHVlXCIpKTtJKGgsaSxkLGUpfWVsc2UgSihnKSxlJiZlKGYpfWVsc2V7VShkLCEwKTtpZihlKXt2YXIgbj1HKGQpO24mJnR5cGVvZiBuLlNldFZhcmlhYmxlIT1hJiYoZi5zdWNjZXNzPSEwLGYucmVmPW4pLGUoZil9fX19ZnVuY3Rpb24gRyhjKXt2YXIgZD1udWxsLGU9UChjKTtpZihlJiZlLm5vZGVOYW1lPT1cIk9CSkVDVFwiKWlmKHR5cGVvZiBlLlNldFZhcmlhYmxlIT1hKWQ9ZTtlbHNle3ZhciBmPWUuZ2V0RWxlbWVudHNCeVRhZ05hbWUoYilbMF07ZiYmKGQ9Zil9cmV0dXJuIGR9ZnVuY3Rpb24gSCgpe3JldHVybiF1JiZTKFwiNi4wLjY1XCIpJiYoeS53aW58fHkubWFjKSYmISh5LndrJiZ5LndrPDMxMil9ZnVuY3Rpb24gSShiLGMsZCxlKXt1PSEwLHI9ZXx8bnVsbCxzPXtzdWNjZXNzOiExLGlkOmR9O3ZhciBnPVAoZCk7aWYoZyl7Zy5ub2RlTmFtZT09XCJPQkpFQ1RcIj8ocD1LKGcpLHE9bnVsbCk6KHA9ZyxxPWQpLGIuaWQ9ZjtpZih0eXBlb2YgYi53aWR0aD09YXx8IS8lJC8udGVzdChiLndpZHRoKSYmcGFyc2VJbnQoYi53aWR0aCwxMCk8MzEwKWIud2lkdGg9XCIzMTBcIjtpZih0eXBlb2YgYi5oZWlnaHQ9PWF8fCEvJSQvLnRlc3QoYi5oZWlnaHQpJiZwYXJzZUludChiLmhlaWdodCwxMCk8MTM3KWIuaGVpZ2h0PVwiMTM3XCI7aS50aXRsZT1pLnRpdGxlLnNsaWNlKDAsNDcpK1wiIC0gRmxhc2ggUGxheWVyIEluc3RhbGxhdGlvblwiO3ZhciBqPXkuaWUmJnkud2luP1tcIkFjdGl2ZVwiXS5jb25jYXQoXCJcIikuam9pbihcIlhcIik6XCJQbHVnSW5cIixrPVwiTU1yZWRpcmVjdFVSTD1cIitoLmxvY2F0aW9uLnRvU3RyaW5nKCkucmVwbGFjZSgvJi9nLFwiJTI2XCIpK1wiJk1NcGxheWVyVHlwZT1cIitqK1wiJk1NZG9jdGl0bGU9XCIraS50aXRsZTt0eXBlb2YgYy5mbGFzaHZhcnMhPWE/Yy5mbGFzaHZhcnMrPVwiJlwiK2s6Yy5mbGFzaHZhcnM9aztpZih5LmllJiZ5LndpbiYmZy5yZWFkeVN0YXRlIT00KXt2YXIgbD1RKFwiZGl2XCIpO2QrPVwiU1dGT2JqZWN0TmV3XCIsbC5zZXRBdHRyaWJ1dGUoXCJpZFwiLGQpLGcucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUobCxnKSxnLnN0eWxlLmRpc3BsYXk9XCJub25lXCIsZnVuY3Rpb24oKXtnLnJlYWR5U3RhdGU9PTQ/Zy5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGcpOnNldFRpbWVvdXQoYXJndW1lbnRzLmNhbGxlZSwxMCl9KCl9TChiLGMsZCl9fWZ1bmN0aW9uIEooYSl7aWYoeS5pZSYmeS53aW4mJmEucmVhZHlTdGF0ZSE9NCl7dmFyIGI9UShcImRpdlwiKTthLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGIsYSksYi5wYXJlbnROb2RlLnJlcGxhY2VDaGlsZChLKGEpLGIpLGEuc3R5bGUuZGlzcGxheT1cIm5vbmVcIixmdW5jdGlvbigpe2EucmVhZHlTdGF0ZT09ND9hLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoYSk6c2V0VGltZW91dChhcmd1bWVudHMuY2FsbGVlLDEwKX0oKX1lbHNlIGEucGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQoSyhhKSxhKX1mdW5jdGlvbiBLKGEpe3ZhciBjPVEoXCJkaXZcIik7aWYoeS53aW4mJnkuaWUpYy5pbm5lckhUTUw9YS5pbm5lckhUTUw7ZWxzZXt2YXIgZD1hLmdldEVsZW1lbnRzQnlUYWdOYW1lKGIpWzBdO2lmKGQpe3ZhciBlPWQuY2hpbGROb2RlcztpZihlKXt2YXIgZj1lLmxlbmd0aDtmb3IodmFyIGc9MDtnPGY7ZysrKShlW2ddLm5vZGVUeXBlIT0xfHxlW2ddLm5vZGVOYW1lIT1cIlBBUkFNXCIpJiZlW2ddLm5vZGVUeXBlIT04JiZjLmFwcGVuZENoaWxkKGVbZ10uY2xvbmVOb2RlKCEwKSl9fX1yZXR1cm4gY31mdW5jdGlvbiBMKGMsZCxmKXt2YXIgZyxoPVAoZik7aWYoeS53ayYmeS53azwzMTIpcmV0dXJuIGc7aWYoaCl7dHlwZW9mIGMuaWQ9PWEmJihjLmlkPWYpO2lmKHkuaWUmJnkud2luKXt2YXIgaT1cIlwiO2Zvcih2YXIgaiBpbiBjKWNbal0hPU9iamVjdC5wcm90b3R5cGVbal0mJihqLnRvTG93ZXJDYXNlKCk9PVwiZGF0YVwiP2QubW92aWU9Y1tqXTpqLnRvTG93ZXJDYXNlKCk9PVwic3R5bGVjbGFzc1wiP2krPScgY2xhc3M9XCInK2Nbal0rJ1wiJzpqLnRvTG93ZXJDYXNlKCkhPVwiY2xhc3NpZFwiJiYoaSs9XCIgXCIraisnPVwiJytjW2pdKydcIicpKTt2YXIgaz1cIlwiO2Zvcih2YXIgbCBpbiBkKWRbbF0hPU9iamVjdC5wcm90b3R5cGVbbF0mJihrKz0nPHBhcmFtIG5hbWU9XCInK2wrJ1wiIHZhbHVlPVwiJytkW2xdKydcIiAvPicpO2gub3V0ZXJIVE1MPSc8b2JqZWN0IGNsYXNzaWQ9XCJjbHNpZDpEMjdDREI2RS1BRTZELTExY2YtOTZCOC00NDQ1NTM1NDAwMDBcIicraStcIj5cIitrK1wiPC9vYmplY3Q+XCIsbltuLmxlbmd0aF09Yy5pZCxnPVAoYy5pZCl9ZWxzZXt2YXIgbT1RKGIpO20uc2V0QXR0cmlidXRlKFwidHlwZVwiLGUpO2Zvcih2YXIgbyBpbiBjKWNbb10hPU9iamVjdC5wcm90b3R5cGVbb10mJihvLnRvTG93ZXJDYXNlKCk9PVwic3R5bGVjbGFzc1wiP20uc2V0QXR0cmlidXRlKFwiY2xhc3NcIixjW29dKTpvLnRvTG93ZXJDYXNlKCkhPVwiY2xhc3NpZFwiJiZtLnNldEF0dHJpYnV0ZShvLGNbb10pKTtmb3IodmFyIHAgaW4gZClkW3BdIT1PYmplY3QucHJvdG90eXBlW3BdJiZwLnRvTG93ZXJDYXNlKCkhPVwibW92aWVcIiYmTShtLHAsZFtwXSk7aC5wYXJlbnROb2RlLnJlcGxhY2VDaGlsZChtLGgpLGc9bX19cmV0dXJuIGd9ZnVuY3Rpb24gTShhLGIsYyl7dmFyIGQ9UShcInBhcmFtXCIpO2Quc2V0QXR0cmlidXRlKFwibmFtZVwiLGIpLGQuc2V0QXR0cmlidXRlKFwidmFsdWVcIixjKSxhLmFwcGVuZENoaWxkKGQpfWZ1bmN0aW9uIE4oYSl7dmFyIGI9UChhKTtiJiZiLm5vZGVOYW1lPT1cIk9CSkVDVFwiJiYoeS5pZSYmeS53aW4/KGIuc3R5bGUuZGlzcGxheT1cIm5vbmVcIixmdW5jdGlvbigpe2IucmVhZHlTdGF0ZT09ND9PKGEpOnNldFRpbWVvdXQoYXJndW1lbnRzLmNhbGxlZSwxMCl9KCkpOmIucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChiKSl9ZnVuY3Rpb24gTyhhKXt2YXIgYj1QKGEpO2lmKGIpe2Zvcih2YXIgYyBpbiBiKXR5cGVvZiBiW2NdPT1cImZ1bmN0aW9uXCImJihiW2NdPW51bGwpO2IucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChiKX19ZnVuY3Rpb24gUChhKXt2YXIgYj1udWxsO3RyeXtiPWkuZ2V0RWxlbWVudEJ5SWQoYSl9Y2F0Y2goYyl7fXJldHVybiBifWZ1bmN0aW9uIFEoYSl7cmV0dXJuIGkuY3JlYXRlRWxlbWVudChhKX1mdW5jdGlvbiBSKGEsYixjKXthLmF0dGFjaEV2ZW50KGIsYyksb1tvLmxlbmd0aF09W2EsYixjXX1mdW5jdGlvbiBTKGEpe3ZhciBiPXkucHYsYz1hLnNwbGl0KFwiLlwiKTtyZXR1cm4gY1swXT1wYXJzZUludChjWzBdLDEwKSxjWzFdPXBhcnNlSW50KGNbMV0sMTApfHwwLGNbMl09cGFyc2VJbnQoY1syXSwxMCl8fDAsYlswXT5jWzBdfHxiWzBdPT1jWzBdJiZiWzFdPmNbMV18fGJbMF09PWNbMF0mJmJbMV09PWNbMV0mJmJbMl0+PWNbMl0/ITA6ITF9ZnVuY3Rpb24gVChjLGQsZSxmKXtpZih5LmllJiZ5Lm1hYylyZXR1cm47dmFyIGc9aS5nZXRFbGVtZW50c0J5VGFnTmFtZShcImhlYWRcIilbMF07aWYoIWcpcmV0dXJuO3ZhciBoPWUmJnR5cGVvZiBlPT1cInN0cmluZ1wiP2U6XCJzY3JlZW5cIjtmJiYodj1udWxsLHc9bnVsbCk7aWYoIXZ8fHchPWgpe3ZhciBqPVEoXCJzdHlsZVwiKTtqLnNldEF0dHJpYnV0ZShcInR5cGVcIixcInRleHQvY3NzXCIpLGouc2V0QXR0cmlidXRlKFwibWVkaWFcIixoKSx2PWcuYXBwZW5kQ2hpbGQoaikseS5pZSYmeS53aW4mJnR5cGVvZiBpLnN0eWxlU2hlZXRzIT1hJiZpLnN0eWxlU2hlZXRzLmxlbmd0aD4wJiYodj1pLnN0eWxlU2hlZXRzW2kuc3R5bGVTaGVldHMubGVuZ3RoLTFdKSx3PWh9eS5pZSYmeS53aW4/diYmdHlwZW9mIHYuYWRkUnVsZT09YiYmdi5hZGRSdWxlKGMsZCk6diYmdHlwZW9mIGkuY3JlYXRlVGV4dE5vZGUhPWEmJnYuYXBwZW5kQ2hpbGQoaS5jcmVhdGVUZXh0Tm9kZShjK1wiIHtcIitkK1wifVwiKSl9ZnVuY3Rpb24gVShhLGIpe2lmKCF4KXJldHVybjt2YXIgYz1iP1widmlzaWJsZVwiOlwiaGlkZGVuXCI7dCYmUChhKT9QKGEpLnN0eWxlLnZpc2liaWxpdHk9YzpUKFwiI1wiK2EsXCJ2aXNpYmlsaXR5OlwiK2MpfWZ1bmN0aW9uIFYoYil7dmFyIGM9L1tcXFxcXFxcIjw+XFwuO10vLGQ9Yy5leGVjKGIpIT1udWxsO3JldHVybiBkJiZ0eXBlb2YgZW5jb2RlVVJJQ29tcG9uZW50IT1hP2VuY29kZVVSSUNvbXBvbmVudChiKTpifXZhciBhPVwidW5kZWZpbmVkXCIsYj1cIm9iamVjdFwiLGM9XCJTaG9ja3dhdmUgRmxhc2hcIixkPVwiU2hvY2t3YXZlRmxhc2guU2hvY2t3YXZlRmxhc2hcIixlPVwiYXBwbGljYXRpb24veC1zaG9ja3dhdmUtZmxhc2hcIixmPVwiU1dGT2JqZWN0RXhwckluc3RcIixnPVwib25yZWFkeXN0YXRlY2hhbmdlXCIsaD13aW5kb3csaT1kb2N1bWVudCxqPW5hdmlnYXRvcixrPSExLGw9W0RdLG09W10sbj1bXSxvPVtdLHAscSxyLHMsdD0hMSx1PSExLHYsdyx4PSEwLHk9ZnVuY3Rpb24oKXt2YXIgZj10eXBlb2YgaS5nZXRFbGVtZW50QnlJZCE9YSYmdHlwZW9mIGkuZ2V0RWxlbWVudHNCeVRhZ05hbWUhPWEmJnR5cGVvZiBpLmNyZWF0ZUVsZW1lbnQhPWEsZz1qLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpLGw9ai5wbGF0Zm9ybS50b0xvd2VyQ2FzZSgpLG09bD8vd2luLy50ZXN0KGwpOi93aW4vLnRlc3QoZyksbj1sPy9tYWMvLnRlc3QobCk6L21hYy8udGVzdChnKSxvPS93ZWJraXQvLnRlc3QoZyk/cGFyc2VGbG9hdChnLnJlcGxhY2UoL14uKndlYmtpdFxcLyhcXGQrKFxcLlxcZCspPykuKiQvLFwiJDFcIikpOiExLHA9ITEscT1bMCwwLDBdLHI9bnVsbDtpZih0eXBlb2Ygai5wbHVnaW5zIT1hJiZ0eXBlb2Ygai5wbHVnaW5zW2NdPT1iKXI9ai5wbHVnaW5zW2NdLmRlc2NyaXB0aW9uLHImJih0eXBlb2Ygai5taW1lVHlwZXM9PWF8fCFqLm1pbWVUeXBlc1tlXXx8ISFqLm1pbWVUeXBlc1tlXS5lbmFibGVkUGx1Z2luKSYmKGs9ITAscD0hMSxyPXIucmVwbGFjZSgvXi4qXFxzKyhcXFMrXFxzK1xcUyskKS8sXCIkMVwiKSxxWzBdPXBhcnNlSW50KHIucmVwbGFjZSgvXiguKilcXC4uKiQvLFwiJDFcIiksMTApLHFbMV09cGFyc2VJbnQoci5yZXBsYWNlKC9eLipcXC4oLiopXFxzLiokLyxcIiQxXCIpLDEwKSxxWzJdPS9bYS16QS1aXS8udGVzdChyKT9wYXJzZUludChyLnJlcGxhY2UoL14uKlthLXpBLVpdKyguKikkLyxcIiQxXCIpLDEwKTowKTtlbHNlIGlmKHR5cGVvZiBoW1tcIkFjdGl2ZVwiXS5jb25jYXQoXCJPYmplY3RcIikuam9pbihcIlhcIildIT1hKXRyeXt2YXIgcz1uZXcod2luZG93W1tcIkFjdGl2ZVwiXS5jb25jYXQoXCJPYmplY3RcIikuam9pbihcIlhcIildKShkKTtzJiYocj1zLkdldFZhcmlhYmxlKFwiJHZlcnNpb25cIiksciYmKHA9ITAscj1yLnNwbGl0KFwiIFwiKVsxXS5zcGxpdChcIixcIikscT1bcGFyc2VJbnQoclswXSwxMCkscGFyc2VJbnQoclsxXSwxMCkscGFyc2VJbnQoclsyXSwxMCldKSl9Y2F0Y2godCl7fXJldHVybnt3MzpmLHB2OnEsd2s6byxpZTpwLHdpbjptLG1hYzpufX0oKSx6PWZ1bmN0aW9uKCl7aWYoIXkudzMpcmV0dXJuOyh0eXBlb2YgaS5yZWFkeVN0YXRlIT1hJiZpLnJlYWR5U3RhdGU9PVwiY29tcGxldGVcInx8dHlwZW9mIGkucmVhZHlTdGF0ZT09YSYmKGkuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJib2R5XCIpWzBdfHxpLmJvZHkpKSYmQSgpLHR8fCh0eXBlb2YgaS5hZGRFdmVudExpc3RlbmVyIT1hJiZpLmFkZEV2ZW50TGlzdGVuZXIoXCJET01Db250ZW50TG9hZGVkXCIsQSwhMSkseS5pZSYmeS53aW4mJihpLmF0dGFjaEV2ZW50KGcsZnVuY3Rpb24oKXtpLnJlYWR5U3RhdGU9PVwiY29tcGxldGVcIiYmKGkuZGV0YWNoRXZlbnQoZyxhcmd1bWVudHMuY2FsbGVlKSxBKCkpfSksaD09dG9wJiZmdW5jdGlvbigpe2lmKHQpcmV0dXJuO3RyeXtpLmRvY3VtZW50RWxlbWVudC5kb1Njcm9sbChcImxlZnRcIil9Y2F0Y2goYSl7c2V0VGltZW91dChhcmd1bWVudHMuY2FsbGVlLDApO3JldHVybn1BKCl9KCkpLHkud2smJmZ1bmN0aW9uKCl7aWYodClyZXR1cm47aWYoIS9sb2FkZWR8Y29tcGxldGUvLnRlc3QoaS5yZWFkeVN0YXRlKSl7c2V0VGltZW91dChhcmd1bWVudHMuY2FsbGVlLDApO3JldHVybn1BKCl9KCksQyhBKSl9KCksVz1mdW5jdGlvbigpe3kuaWUmJnkud2luJiZ3aW5kb3cuYXR0YWNoRXZlbnQoXCJvbnVubG9hZFwiLGZ1bmN0aW9uKCl7dmFyIGE9by5sZW5ndGg7Zm9yKHZhciBiPTA7YjxhO2IrKylvW2JdWzBdLmRldGFjaEV2ZW50KG9bYl1bMV0sb1tiXVsyXSk7dmFyIGM9bi5sZW5ndGg7Zm9yKHZhciBkPTA7ZDxjO2QrKylOKG5bZF0pO2Zvcih2YXIgZSBpbiB5KXlbZV09bnVsbDt5PW51bGw7Zm9yKHZhciBmIGluIHN3Zm9iamVjdClzd2ZvYmplY3RbZl09bnVsbDtzd2ZvYmplY3Q9bnVsbH0pfSgpO3JldHVybntyZWdpc3Rlck9iamVjdDpmdW5jdGlvbihhLGIsYyxkKXtpZih5LnczJiZhJiZiKXt2YXIgZT17fTtlLmlkPWEsZS5zd2ZWZXJzaW9uPWIsZS5leHByZXNzSW5zdGFsbD1jLGUuY2FsbGJhY2tGbj1kLG1bbS5sZW5ndGhdPWUsVShhLCExKX1lbHNlIGQmJmQoe3N1Y2Nlc3M6ITEsaWQ6YX0pfSxnZXRPYmplY3RCeUlkOmZ1bmN0aW9uKGEpe2lmKHkudzMpcmV0dXJuIEcoYSl9LGVtYmVkU1dGOmZ1bmN0aW9uKGMsZCxlLGYsZyxoLGksaixrLGwpe3ZhciBtPXtzdWNjZXNzOiExLGlkOmR9O3kudzMmJiEoeS53ayYmeS53azwzMTIpJiZjJiZkJiZlJiZmJiZnPyhVKGQsITEpLEIoZnVuY3Rpb24oKXtlKz1cIlwiLGYrPVwiXCI7dmFyIG49e307aWYoayYmdHlwZW9mIGs9PT1iKWZvcih2YXIgbyBpbiBrKW5bb109a1tvXTtuLmRhdGE9YyxuLndpZHRoPWUsbi5oZWlnaHQ9Zjt2YXIgcD17fTtpZihqJiZ0eXBlb2Ygaj09PWIpZm9yKHZhciBxIGluIGopcFtxXT1qW3FdO2lmKGkmJnR5cGVvZiBpPT09Yilmb3IodmFyIHIgaW4gaSl0eXBlb2YgcC5mbGFzaHZhcnMhPWE/cC5mbGFzaHZhcnMrPVwiJlwiK3IrXCI9XCIraVtyXTpwLmZsYXNodmFycz1yK1wiPVwiK2lbcl07aWYoUyhnKSl7dmFyIHM9TChuLHAsZCk7bi5pZD09ZCYmVShkLCEwKSxtLnN1Y2Nlc3M9ITAsbS5yZWY9c31lbHNle2lmKGgmJkgoKSl7bi5kYXRhPWgsSShuLHAsZCxsKTtyZXR1cm59VShkLCEwKX1sJiZsKG0pfSkpOmwmJmwobSl9LHN3aXRjaE9mZkF1dG9IaWRlU2hvdzpmdW5jdGlvbigpe3g9ITF9LHVhOnksZ2V0Rmxhc2hQbGF5ZXJWZXJzaW9uOmZ1bmN0aW9uKCl7cmV0dXJue21ham9yOnkucHZbMF0sbWlub3I6eS5wdlsxXSxyZWxlYXNlOnkucHZbMl19fSxoYXNGbGFzaFBsYXllclZlcnNpb246UyxjcmVhdGVTV0Y6ZnVuY3Rpb24oYSxiLGMpe3JldHVybiB5LnczP0woYSxiLGMpOnVuZGVmaW5lZH0sc2hvd0V4cHJlc3NJbnN0YWxsOmZ1bmN0aW9uKGEsYixjLGQpe3kudzMmJkgoKSYmSShhLGIsYyxkKX0scmVtb3ZlU1dGOmZ1bmN0aW9uKGEpe3kudzMmJk4oYSl9LGNyZWF0ZUNTUzpmdW5jdGlvbihhLGIsYyxkKXt5LnczJiZUKGEsYixjLGQpfSxhZGREb21Mb2FkRXZlbnQ6QixhZGRMb2FkRXZlbnQ6QyxnZXRRdWVyeVBhcmFtVmFsdWU6ZnVuY3Rpb24oYSl7dmFyIGI9aS5sb2NhdGlvbi5zZWFyY2h8fGkubG9jYXRpb24uaGFzaDtpZihiKXsvXFw/Ly50ZXN0KGIpJiYoYj1iLnNwbGl0KFwiP1wiKVsxXSk7aWYoYT09bnVsbClyZXR1cm4gVihiKTt2YXIgYz1iLnNwbGl0KFwiJlwiKTtmb3IodmFyIGQ9MDtkPGMubGVuZ3RoO2QrKylpZihjW2RdLnN1YnN0cmluZygwLGNbZF0uaW5kZXhPZihcIj1cIikpPT1hKXJldHVybiBWKGNbZF0uc3Vic3RyaW5nKGNbZF0uaW5kZXhPZihcIj1cIikrMSkpfXJldHVyblwiXCJ9LGV4cHJlc3NJbnN0YWxsQ2FsbGJhY2s6ZnVuY3Rpb24oKXtpZih1KXt2YXIgYT1QKGYpO2EmJnAmJihhLnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKHAsYSkscSYmKFUocSwhMCkseS5pZSYmeS53aW4mJihwLnN0eWxlLmRpc3BsYXk9XCJibG9ja1wiKSksciYmcihzKSksdT0hMX19fX0oKTsoZnVuY3Rpb24oKXtpZihcInVuZGVmaW5lZFwiPT10eXBlb2Ygd2luZG93fHx3aW5kb3cuV2ViU29ja2V0KXJldHVybjt2YXIgYT13aW5kb3cuY29uc29sZTtpZighYXx8IWEubG9nfHwhYS5lcnJvcilhPXtsb2c6ZnVuY3Rpb24oKXt9LGVycm9yOmZ1bmN0aW9uKCl7fX07aWYoIXN3Zm9iamVjdC5oYXNGbGFzaFBsYXllclZlcnNpb24oXCIxMC4wLjBcIikpe2EuZXJyb3IoXCJGbGFzaCBQbGF5ZXIgPj0gMTAuMC4wIGlzIHJlcXVpcmVkLlwiKTtyZXR1cm59bG9jYXRpb24ucHJvdG9jb2w9PVwiZmlsZTpcIiYmYS5lcnJvcihcIldBUk5JTkc6IHdlYi1zb2NrZXQtanMgZG9lc24ndCB3b3JrIGluIGZpbGU6Ly8vLi4uIFVSTCB1bmxlc3MgeW91IHNldCBGbGFzaCBTZWN1cml0eSBTZXR0aW5ncyBwcm9wZXJseS4gT3BlbiB0aGUgcGFnZSB2aWEgV2ViIHNlcnZlciBpLmUuIGh0dHA6Ly8uLi5cIiksV2ViU29ja2V0PWZ1bmN0aW9uKGEsYixjLGQsZSl7dmFyIGY9dGhpcztmLl9faWQ9V2ViU29ja2V0Ll9fbmV4dElkKyssV2ViU29ja2V0Ll9faW5zdGFuY2VzW2YuX19pZF09ZixmLnJlYWR5U3RhdGU9V2ViU29ja2V0LkNPTk5FQ1RJTkcsZi5idWZmZXJlZEFtb3VudD0wLGYuX19ldmVudHM9e30sYj90eXBlb2YgYj09XCJzdHJpbmdcIiYmKGI9W2JdKTpiPVtdLHNldFRpbWVvdXQoZnVuY3Rpb24oKXtXZWJTb2NrZXQuX19hZGRUYXNrKGZ1bmN0aW9uKCl7V2ViU29ja2V0Ll9fZmxhc2guY3JlYXRlKGYuX19pZCxhLGIsY3x8bnVsbCxkfHwwLGV8fG51bGwpfSl9LDApfSxXZWJTb2NrZXQucHJvdG90eXBlLnNlbmQ9ZnVuY3Rpb24oYSl7aWYodGhpcy5yZWFkeVN0YXRlPT1XZWJTb2NrZXQuQ09OTkVDVElORyl0aHJvd1wiSU5WQUxJRF9TVEFURV9FUlI6IFdlYiBTb2NrZXQgY29ubmVjdGlvbiBoYXMgbm90IGJlZW4gZXN0YWJsaXNoZWRcIjt2YXIgYj1XZWJTb2NrZXQuX19mbGFzaC5zZW5kKHRoaXMuX19pZCxlbmNvZGVVUklDb21wb25lbnQoYSkpO3JldHVybiBiPDA/ITA6KHRoaXMuYnVmZmVyZWRBbW91bnQrPWIsITEpfSxXZWJTb2NrZXQucHJvdG90eXBlLmNsb3NlPWZ1bmN0aW9uKCl7aWYodGhpcy5yZWFkeVN0YXRlPT1XZWJTb2NrZXQuQ0xPU0VEfHx0aGlzLnJlYWR5U3RhdGU9PVdlYlNvY2tldC5DTE9TSU5HKXJldHVybjt0aGlzLnJlYWR5U3RhdGU9V2ViU29ja2V0LkNMT1NJTkcsV2ViU29ja2V0Ll9fZmxhc2guY2xvc2UodGhpcy5fX2lkKX0sV2ViU29ja2V0LnByb3RvdHlwZS5hZGRFdmVudExpc3RlbmVyPWZ1bmN0aW9uKGEsYixjKXthIGluIHRoaXMuX19ldmVudHN8fCh0aGlzLl9fZXZlbnRzW2FdPVtdKSx0aGlzLl9fZXZlbnRzW2FdLnB1c2goYil9LFdlYlNvY2tldC5wcm90b3R5cGUucmVtb3ZlRXZlbnRMaXN0ZW5lcj1mdW5jdGlvbihhLGIsYyl7aWYoIShhIGluIHRoaXMuX19ldmVudHMpKXJldHVybjt2YXIgZD10aGlzLl9fZXZlbnRzW2FdO2Zvcih2YXIgZT1kLmxlbmd0aC0xO2U+PTA7LS1lKWlmKGRbZV09PT1iKXtkLnNwbGljZShlLDEpO2JyZWFrfX0sV2ViU29ja2V0LnByb3RvdHlwZS5kaXNwYXRjaEV2ZW50PWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXMuX19ldmVudHNbYS50eXBlXXx8W107Zm9yKHZhciBjPTA7YzxiLmxlbmd0aDsrK2MpYltjXShhKTt2YXIgZD10aGlzW1wib25cIithLnR5cGVdO2QmJmQoYSl9LFdlYlNvY2tldC5wcm90b3R5cGUuX19oYW5kbGVFdmVudD1mdW5jdGlvbihhKXtcInJlYWR5U3RhdGVcImluIGEmJih0aGlzLnJlYWR5U3RhdGU9YS5yZWFkeVN0YXRlKSxcInByb3RvY29sXCJpbiBhJiYodGhpcy5wcm90b2NvbD1hLnByb3RvY29sKTt2YXIgYjtpZihhLnR5cGU9PVwib3BlblwifHxhLnR5cGU9PVwiZXJyb3JcIiliPXRoaXMuX19jcmVhdGVTaW1wbGVFdmVudChhLnR5cGUpO2Vsc2UgaWYoYS50eXBlPT1cImNsb3NlXCIpYj10aGlzLl9fY3JlYXRlU2ltcGxlRXZlbnQoXCJjbG9zZVwiKTtlbHNle2lmKGEudHlwZSE9XCJtZXNzYWdlXCIpdGhyb3dcInVua25vd24gZXZlbnQgdHlwZTogXCIrYS50eXBlO3ZhciBjPWRlY29kZVVSSUNvbXBvbmVudChhLm1lc3NhZ2UpO2I9dGhpcy5fX2NyZWF0ZU1lc3NhZ2VFdmVudChcIm1lc3NhZ2VcIixjKX10aGlzLmRpc3BhdGNoRXZlbnQoYil9LFdlYlNvY2tldC5wcm90b3R5cGUuX19jcmVhdGVTaW1wbGVFdmVudD1mdW5jdGlvbihhKXtpZihkb2N1bWVudC5jcmVhdGVFdmVudCYmd2luZG93LkV2ZW50KXt2YXIgYj1kb2N1bWVudC5jcmVhdGVFdmVudChcIkV2ZW50XCIpO3JldHVybiBiLmluaXRFdmVudChhLCExLCExKSxifXJldHVybnt0eXBlOmEsYnViYmxlczohMSxjYW5jZWxhYmxlOiExfX0sV2ViU29ja2V0LnByb3RvdHlwZS5fX2NyZWF0ZU1lc3NhZ2VFdmVudD1mdW5jdGlvbihhLGIpe2lmKGRvY3VtZW50LmNyZWF0ZUV2ZW50JiZ3aW5kb3cuTWVzc2FnZUV2ZW50JiYhd2luZG93Lm9wZXJhKXt2YXIgYz1kb2N1bWVudC5jcmVhdGVFdmVudChcIk1lc3NhZ2VFdmVudFwiKTtyZXR1cm4gYy5pbml0TWVzc2FnZUV2ZW50KFwibWVzc2FnZVwiLCExLCExLGIsbnVsbCxudWxsLHdpbmRvdyxudWxsKSxjfXJldHVybnt0eXBlOmEsZGF0YTpiLGJ1YmJsZXM6ITEsY2FuY2VsYWJsZTohMX19LFdlYlNvY2tldC5DT05ORUNUSU5HPTAsV2ViU29ja2V0Lk9QRU49MSxXZWJTb2NrZXQuQ0xPU0lORz0yLFdlYlNvY2tldC5DTE9TRUQ9MyxXZWJTb2NrZXQuX19mbGFzaD1udWxsLFdlYlNvY2tldC5fX2luc3RhbmNlcz17fSxXZWJTb2NrZXQuX190YXNrcz1bXSxXZWJTb2NrZXQuX19uZXh0SWQ9MCxXZWJTb2NrZXQubG9hZEZsYXNoUG9saWN5RmlsZT1mdW5jdGlvbihhKXtXZWJTb2NrZXQuX19hZGRUYXNrKGZ1bmN0aW9uKCl7V2ViU29ja2V0Ll9fZmxhc2gubG9hZE1hbnVhbFBvbGljeUZpbGUoYSl9KX0sV2ViU29ja2V0Ll9faW5pdGlhbGl6ZT1mdW5jdGlvbigpe2lmKFdlYlNvY2tldC5fX2ZsYXNoKXJldHVybjtXZWJTb2NrZXQuX19zd2ZMb2NhdGlvbiYmKHdpbmRvdy5XRUJfU09DS0VUX1NXRl9MT0NBVElPTj1XZWJTb2NrZXQuX19zd2ZMb2NhdGlvbik7aWYoIXdpbmRvdy5XRUJfU09DS0VUX1NXRl9MT0NBVElPTil7YS5lcnJvcihcIltXZWJTb2NrZXRdIHNldCBXRUJfU09DS0VUX1NXRl9MT0NBVElPTiB0byBsb2NhdGlvbiBvZiBXZWJTb2NrZXRNYWluLnN3ZlwiKTtyZXR1cm59dmFyIGI9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtiLmlkPVwid2ViU29ja2V0Q29udGFpbmVyXCIsYi5zdHlsZS5wb3NpdGlvbj1cImFic29sdXRlXCIsV2ViU29ja2V0Ll9faXNGbGFzaExpdGUoKT8oYi5zdHlsZS5sZWZ0PVwiMHB4XCIsYi5zdHlsZS50b3A9XCIwcHhcIik6KGIuc3R5bGUubGVmdD1cIi0xMDBweFwiLGIuc3R5bGUudG9wPVwiLTEwMHB4XCIpO3ZhciBjPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7Yy5pZD1cIndlYlNvY2tldEZsYXNoXCIsYi5hcHBlbmRDaGlsZChjKSxkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGIpLHN3Zm9iamVjdC5lbWJlZFNXRihXRUJfU09DS0VUX1NXRl9MT0NBVElPTixcIndlYlNvY2tldEZsYXNoXCIsXCIxXCIsXCIxXCIsXCIxMC4wLjBcIixudWxsLG51bGwse2hhc1ByaW9yaXR5OiEwLHN3bGl2ZWNvbm5lY3Q6ITAsYWxsb3dTY3JpcHRBY2Nlc3M6XCJhbHdheXNcIn0sbnVsbCxmdW5jdGlvbihiKXtiLnN1Y2Nlc3N8fGEuZXJyb3IoXCJbV2ViU29ja2V0XSBzd2ZvYmplY3QuZW1iZWRTV0YgZmFpbGVkXCIpfSl9LFdlYlNvY2tldC5fX29uRmxhc2hJbml0aWFsaXplZD1mdW5jdGlvbigpe3NldFRpbWVvdXQoZnVuY3Rpb24oKXtXZWJTb2NrZXQuX19mbGFzaD1kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIndlYlNvY2tldEZsYXNoXCIpLFdlYlNvY2tldC5fX2ZsYXNoLnNldENhbGxlclVybChsb2NhdGlvbi5ocmVmKSxXZWJTb2NrZXQuX19mbGFzaC5zZXREZWJ1ZyghIXdpbmRvdy5XRUJfU09DS0VUX0RFQlVHKTtmb3IodmFyIGE9MDthPFdlYlNvY2tldC5fX3Rhc2tzLmxlbmd0aDsrK2EpV2ViU29ja2V0Ll9fdGFza3NbYV0oKTtXZWJTb2NrZXQuX190YXNrcz1bXX0sMCl9LFdlYlNvY2tldC5fX29uRmxhc2hFdmVudD1mdW5jdGlvbigpe3JldHVybiBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7dHJ5e3ZhciBiPVdlYlNvY2tldC5fX2ZsYXNoLnJlY2VpdmVFdmVudHMoKTtmb3IodmFyIGM9MDtjPGIubGVuZ3RoOysrYylXZWJTb2NrZXQuX19pbnN0YW5jZXNbYltjXS53ZWJTb2NrZXRJZF0uX19oYW5kbGVFdmVudChiW2NdKX1jYXRjaChkKXthLmVycm9yKGQpfX0sMCksITB9LFdlYlNvY2tldC5fX2xvZz1mdW5jdGlvbihiKXthLmxvZyhkZWNvZGVVUklDb21wb25lbnQoYikpfSxXZWJTb2NrZXQuX19lcnJvcj1mdW5jdGlvbihiKXthLmVycm9yKGRlY29kZVVSSUNvbXBvbmVudChiKSl9LFdlYlNvY2tldC5fX2FkZFRhc2s9ZnVuY3Rpb24oYSl7V2ViU29ja2V0Ll9fZmxhc2g/YSgpOldlYlNvY2tldC5fX3Rhc2tzLnB1c2goYSl9LFdlYlNvY2tldC5fX2lzRmxhc2hMaXRlPWZ1bmN0aW9uKCl7aWYoIXdpbmRvdy5uYXZpZ2F0b3J8fCF3aW5kb3cubmF2aWdhdG9yLm1pbWVUeXBlcylyZXR1cm4hMTt2YXIgYT13aW5kb3cubmF2aWdhdG9yLm1pbWVUeXBlc1tcImFwcGxpY2F0aW9uL3gtc2hvY2t3YXZlLWZsYXNoXCJdO3JldHVybiFhfHwhYS5lbmFibGVkUGx1Z2lufHwhYS5lbmFibGVkUGx1Z2luLmZpbGVuYW1lPyExOmEuZW5hYmxlZFBsdWdpbi5maWxlbmFtZS5tYXRjaCgvZmxhc2hsaXRlL2kpPyEwOiExfSx3aW5kb3cuV0VCX1NPQ0tFVF9ESVNBQkxFX0FVVE9fSU5JVElBTElaQVRJT058fCh3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcj93aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImxvYWRcIixmdW5jdGlvbigpe1dlYlNvY2tldC5fX2luaXRpYWxpemUoKX0sITEpOndpbmRvdy5hdHRhY2hFdmVudChcIm9ubG9hZFwiLGZ1bmN0aW9uKCl7V2ViU29ja2V0Ll9faW5pdGlhbGl6ZSgpfSkpfSkoKSxmdW5jdGlvbihhLGIsYyl7ZnVuY3Rpb24gZChhKXtpZighYSlyZXR1cm47Yi5UcmFuc3BvcnQuYXBwbHkodGhpcyxhcmd1bWVudHMpLHRoaXMuc2VuZEJ1ZmZlcj1bXX1mdW5jdGlvbiBlKCl7fWEuWEhSPWQsYi51dGlsLmluaGVyaXQoZCxiLlRyYW5zcG9ydCksZC5wcm90b3R5cGUub3Blbj1mdW5jdGlvbigpe3JldHVybiB0aGlzLnNvY2tldC5zZXRCdWZmZXIoITEpLHRoaXMub25PcGVuKCksdGhpcy5nZXQoKSx0aGlzLnNldENsb3NlVGltZW91dCgpLHRoaXN9LGQucHJvdG90eXBlLnBheWxvYWQ9ZnVuY3Rpb24oYSl7dmFyIGM9W107Zm9yKHZhciBkPTAsZT1hLmxlbmd0aDtkPGU7ZCsrKWMucHVzaChiLnBhcnNlci5lbmNvZGVQYWNrZXQoYVtkXSkpO3RoaXMuc2VuZChiLnBhcnNlci5lbmNvZGVQYXlsb2FkKGMpKX0sZC5wcm90b3R5cGUuc2VuZD1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5wb3N0KGEpLHRoaXN9LGQucHJvdG90eXBlLnBvc3Q9ZnVuY3Rpb24oYSl7ZnVuY3Rpb24gZCgpe3RoaXMucmVhZHlTdGF0ZT09NCYmKHRoaXMub25yZWFkeXN0YXRlY2hhbmdlPWUsYi5wb3N0aW5nPSExLHRoaXMuc3RhdHVzPT0yMDA/Yi5zb2NrZXQuc2V0QnVmZmVyKCExKTpiLm9uQ2xvc2UoKSl9ZnVuY3Rpb24gZigpe3RoaXMub25sb2FkPWUsYi5zb2NrZXQuc2V0QnVmZmVyKCExKX12YXIgYj10aGlzO3RoaXMuc29ja2V0LnNldEJ1ZmZlcighMCksdGhpcy5zZW5kWEhSPXRoaXMucmVxdWVzdChcIlBPU1RcIiksYy5YRG9tYWluUmVxdWVzdCYmdGhpcy5zZW5kWEhSIGluc3RhbmNlb2YgWERvbWFpblJlcXVlc3Q/dGhpcy5zZW5kWEhSLm9ubG9hZD10aGlzLnNlbmRYSFIub25lcnJvcj1mOnRoaXMuc2VuZFhIUi5vbnJlYWR5c3RhdGVjaGFuZ2U9ZCx0aGlzLnNlbmRYSFIuc2VuZChhKX0sZC5wcm90b3R5cGUuY2xvc2U9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5vbkNsb3NlKCksdGhpc30sZC5wcm90b3R5cGUucmVxdWVzdD1mdW5jdGlvbihhKXt2YXIgYz1iLnV0aWwucmVxdWVzdCh0aGlzLnNvY2tldC5pc1hEb21haW4oKSksZD1iLnV0aWwucXVlcnkodGhpcy5zb2NrZXQub3B0aW9ucy5xdWVyeSxcInQ9XCIrICsobmV3IERhdGUpKTtjLm9wZW4oYXx8XCJHRVRcIix0aGlzLnByZXBhcmVVcmwoKStkLCEwKTtpZihhPT1cIlBPU1RcIil0cnl7Yy5zZXRSZXF1ZXN0SGVhZGVyP2Muc2V0UmVxdWVzdEhlYWRlcihcIkNvbnRlbnQtdHlwZVwiLFwidGV4dC9wbGFpbjtjaGFyc2V0PVVURi04XCIpOmMuY29udGVudFR5cGU9XCJ0ZXh0L3BsYWluXCJ9Y2F0Y2goZSl7fXJldHVybiBjfSxkLnByb3RvdHlwZS5zY2hlbWU9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5zb2NrZXQub3B0aW9ucy5zZWN1cmU/XCJodHRwc1wiOlwiaHR0cFwifSxkLmNoZWNrPWZ1bmN0aW9uKGEsZCl7dHJ5e3ZhciBlPWIudXRpbC5yZXF1ZXN0KGQpLGY9Yy5YRG9tYWluUmVxdWVzdCYmZSBpbnN0YW5jZW9mIFhEb21haW5SZXF1ZXN0LGc9YSYmYS5vcHRpb25zJiZhLm9wdGlvbnMuc2VjdXJlP1wiaHR0cHM6XCI6XCJodHRwOlwiLGg9Yy5sb2NhdGlvbiYmZyE9Yy5sb2NhdGlvbi5wcm90b2NvbDtpZihlJiYoIWZ8fCFoKSlyZXR1cm4hMH1jYXRjaChpKXt9cmV0dXJuITF9LGQueGRvbWFpbkNoZWNrPWZ1bmN0aW9uKGEpe3JldHVybiBkLmNoZWNrKGEsITApfX0oXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvLlRyYW5zcG9ydDptb2R1bGUuZXhwb3J0cyxcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW86bW9kdWxlLnBhcmVudC5leHBvcnRzLHRoaXMpLGZ1bmN0aW9uKGEsYil7ZnVuY3Rpb24gYyhhKXtiLlRyYW5zcG9ydC5YSFIuYXBwbHkodGhpcyxhcmd1bWVudHMpfWEuaHRtbGZpbGU9YyxiLnV0aWwuaW5oZXJpdChjLGIuVHJhbnNwb3J0LlhIUiksYy5wcm90b3R5cGUubmFtZT1cImh0bWxmaWxlXCIsYy5wcm90b3R5cGUuZ2V0PWZ1bmN0aW9uKCl7dGhpcy5kb2M9bmV3KHdpbmRvd1tbXCJBY3RpdmVcIl0uY29uY2F0KFwiT2JqZWN0XCIpLmpvaW4oXCJYXCIpXSkoXCJodG1sZmlsZVwiKSx0aGlzLmRvYy5vcGVuKCksdGhpcy5kb2Mud3JpdGUoXCI8aHRtbD48L2h0bWw+XCIpLHRoaXMuZG9jLmNsb3NlKCksdGhpcy5kb2MucGFyZW50V2luZG93LnM9dGhpczt2YXIgYT10aGlzLmRvYy5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO2EuY2xhc3NOYW1lPVwic29ja2V0aW9cIix0aGlzLmRvYy5ib2R5LmFwcGVuZENoaWxkKGEpLHRoaXMuaWZyYW1lPXRoaXMuZG9jLmNyZWF0ZUVsZW1lbnQoXCJpZnJhbWVcIiksYS5hcHBlbmRDaGlsZCh0aGlzLmlmcmFtZSk7dmFyIGM9dGhpcyxkPWIudXRpbC5xdWVyeSh0aGlzLnNvY2tldC5vcHRpb25zLnF1ZXJ5LFwidD1cIisgKyhuZXcgRGF0ZSkpO3RoaXMuaWZyYW1lLnNyYz10aGlzLnByZXBhcmVVcmwoKStkLGIudXRpbC5vbih3aW5kb3csXCJ1bmxvYWRcIixmdW5jdGlvbigpe2MuZGVzdHJveSgpfSl9LGMucHJvdG90eXBlLl89ZnVuY3Rpb24oYSxiKXt0aGlzLm9uRGF0YShhKTt0cnl7dmFyIGM9Yi5nZXRFbGVtZW50c0J5VGFnTmFtZShcInNjcmlwdFwiKVswXTtjLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoYyl9Y2F0Y2goZCl7fX0sYy5wcm90b3R5cGUuZGVzdHJveT1mdW5jdGlvbigpe2lmKHRoaXMuaWZyYW1lKXt0cnl7dGhpcy5pZnJhbWUuc3JjPVwiYWJvdXQ6YmxhbmtcIn1jYXRjaChhKXt9dGhpcy5kb2M9bnVsbCx0aGlzLmlmcmFtZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuaWZyYW1lKSx0aGlzLmlmcmFtZT1udWxsLENvbGxlY3RHYXJiYWdlKCl9fSxjLnByb3RvdHlwZS5jbG9zZT1mdW5jdGlvbigpe3JldHVybiB0aGlzLmRlc3Ryb3koKSxiLlRyYW5zcG9ydC5YSFIucHJvdG90eXBlLmNsb3NlLmNhbGwodGhpcyl9LGMuY2hlY2s9ZnVuY3Rpb24oYSl7aWYodHlwZW9mIHdpbmRvdyE9XCJ1bmRlZmluZWRcIiYmW1wiQWN0aXZlXCJdLmNvbmNhdChcIk9iamVjdFwiKS5qb2luKFwiWFwiKWluIHdpbmRvdyl0cnl7dmFyIGM9bmV3KHdpbmRvd1tbXCJBY3RpdmVcIl0uY29uY2F0KFwiT2JqZWN0XCIpLmpvaW4oXCJYXCIpXSkoXCJodG1sZmlsZVwiKTtyZXR1cm4gYyYmYi5UcmFuc3BvcnQuWEhSLmNoZWNrKGEpfWNhdGNoKGQpe31yZXR1cm4hMX0sYy54ZG9tYWluQ2hlY2s9ZnVuY3Rpb24oKXtyZXR1cm4hMX0sYi50cmFuc3BvcnRzLnB1c2goXCJodG1sZmlsZVwiKX0oXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvLlRyYW5zcG9ydDptb2R1bGUuZXhwb3J0cyxcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW86bW9kdWxlLnBhcmVudC5leHBvcnRzKSxmdW5jdGlvbihhLGIsYyl7ZnVuY3Rpb24gZCgpe2IuVHJhbnNwb3J0LlhIUi5hcHBseSh0aGlzLGFyZ3VtZW50cyl9ZnVuY3Rpb24gZSgpe31hW1wieGhyLXBvbGxpbmdcIl09ZCxiLnV0aWwuaW5oZXJpdChkLGIuVHJhbnNwb3J0LlhIUiksYi51dGlsLm1lcmdlKGQsYi5UcmFuc3BvcnQuWEhSKSxkLnByb3RvdHlwZS5uYW1lPVwieGhyLXBvbGxpbmdcIixkLnByb3RvdHlwZS5oZWFydGJlYXRzPWZ1bmN0aW9uKCl7cmV0dXJuITF9LGQucHJvdG90eXBlLm9wZW49ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBiLlRyYW5zcG9ydC5YSFIucHJvdG90eXBlLm9wZW4uY2FsbChhKSwhMX0sZC5wcm90b3R5cGUuZ2V0PWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYigpe3RoaXMucmVhZHlTdGF0ZT09NCYmKHRoaXMub25yZWFkeXN0YXRlY2hhbmdlPWUsdGhpcy5zdGF0dXM9PTIwMD8oYS5vbkRhdGEodGhpcy5yZXNwb25zZVRleHQpLGEuZ2V0KCkpOmEub25DbG9zZSgpKX1mdW5jdGlvbiBkKCl7dGhpcy5vbmxvYWQ9ZSx0aGlzLm9uZXJyb3I9ZSxhLnJldHJ5Q291bnRlcj0xLGEub25EYXRhKHRoaXMucmVzcG9uc2VUZXh0KSxhLmdldCgpfWZ1bmN0aW9uIGYoKXthLnJldHJ5Q291bnRlcisrLCFhLnJldHJ5Q291bnRlcnx8YS5yZXRyeUNvdW50ZXI+Mz9hLm9uQ2xvc2UoKTphLmdldCgpfWlmKCF0aGlzLmlzT3BlbilyZXR1cm47dmFyIGE9dGhpczt0aGlzLnhocj10aGlzLnJlcXVlc3QoKSxjLlhEb21haW5SZXF1ZXN0JiZ0aGlzLnhociBpbnN0YW5jZW9mIFhEb21haW5SZXF1ZXN0Pyh0aGlzLnhoci5vbmxvYWQ9ZCx0aGlzLnhoci5vbmVycm9yPWYpOnRoaXMueGhyLm9ucmVhZHlzdGF0ZWNoYW5nZT1iLHRoaXMueGhyLnNlbmQobnVsbCl9LGQucHJvdG90eXBlLm9uQ2xvc2U9ZnVuY3Rpb24oKXtiLlRyYW5zcG9ydC5YSFIucHJvdG90eXBlLm9uQ2xvc2UuY2FsbCh0aGlzKTtpZih0aGlzLnhocil7dGhpcy54aHIub25yZWFkeXN0YXRlY2hhbmdlPXRoaXMueGhyLm9ubG9hZD10aGlzLnhoci5vbmVycm9yPWU7dHJ5e3RoaXMueGhyLmFib3J0KCl9Y2F0Y2goYSl7fXRoaXMueGhyPW51bGx9fSxkLnByb3RvdHlwZS5yZWFkeT1mdW5jdGlvbihhLGMpe3ZhciBkPXRoaXM7Yi51dGlsLmRlZmVyKGZ1bmN0aW9uKCl7Yy5jYWxsKGQpfSl9LGIudHJhbnNwb3J0cy5wdXNoKFwieGhyLXBvbGxpbmdcIil9KFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pby5UcmFuc3BvcnQ6bW9kdWxlLmV4cG9ydHMsXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvOm1vZHVsZS5wYXJlbnQuZXhwb3J0cyx0aGlzKSxmdW5jdGlvbihhLGIsYyl7ZnVuY3Rpb24gZShhKXtiLlRyYW5zcG9ydFtcInhoci1wb2xsaW5nXCJdLmFwcGx5KHRoaXMsYXJndW1lbnRzKSx0aGlzLmluZGV4PWIuai5sZW5ndGg7dmFyIGM9dGhpcztiLmoucHVzaChmdW5jdGlvbihhKXtjLl8oYSl9KX12YXIgZD1jLmRvY3VtZW50JiZcIk1vekFwcGVhcmFuY2VcImluIGMuZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlO2FbXCJqc29ucC1wb2xsaW5nXCJdPWUsYi51dGlsLmluaGVyaXQoZSxiLlRyYW5zcG9ydFtcInhoci1wb2xsaW5nXCJdKSxlLnByb3RvdHlwZS5uYW1lPVwianNvbnAtcG9sbGluZ1wiLGUucHJvdG90eXBlLnBvc3Q9ZnVuY3Rpb24oYSl7ZnVuY3Rpb24gaSgpe2ooKSxjLnNvY2tldC5zZXRCdWZmZXIoITEpfWZ1bmN0aW9uIGooKXtjLmlmcmFtZSYmYy5mb3JtLnJlbW92ZUNoaWxkKGMuaWZyYW1lKTt0cnl7aD1kb2N1bWVudC5jcmVhdGVFbGVtZW50KCc8aWZyYW1lIG5hbWU9XCInK2MuaWZyYW1lSWQrJ1wiPicpfWNhdGNoKGEpe2g9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlmcmFtZVwiKSxoLm5hbWU9Yy5pZnJhbWVJZH1oLmlkPWMuaWZyYW1lSWQsYy5mb3JtLmFwcGVuZENoaWxkKGgpLGMuaWZyYW1lPWh9dmFyIGM9dGhpcyxkPWIudXRpbC5xdWVyeSh0aGlzLnNvY2tldC5vcHRpb25zLnF1ZXJ5LFwidD1cIisgKyhuZXcgRGF0ZSkrXCImaT1cIit0aGlzLmluZGV4KTtpZighdGhpcy5mb3JtKXt2YXIgZT1kb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZm9ybVwiKSxmPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0ZXh0YXJlYVwiKSxnPXRoaXMuaWZyYW1lSWQ9XCJzb2NrZXRpb19pZnJhbWVfXCIrdGhpcy5pbmRleCxoO2UuY2xhc3NOYW1lPVwic29ja2V0aW9cIixlLnN0eWxlLnBvc2l0aW9uPVwiYWJzb2x1dGVcIixlLnN0eWxlLnRvcD1cIjBweFwiLGUuc3R5bGUubGVmdD1cIjBweFwiLGUuc3R5bGUuZGlzcGxheT1cIm5vbmVcIixlLnRhcmdldD1nLGUubWV0aG9kPVwiUE9TVFwiLGUuc2V0QXR0cmlidXRlKFwiYWNjZXB0LWNoYXJzZXRcIixcInV0Zi04XCIpLGYubmFtZT1cImRcIixlLmFwcGVuZENoaWxkKGYpLGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZSksdGhpcy5mb3JtPWUsdGhpcy5hcmVhPWZ9dGhpcy5mb3JtLmFjdGlvbj10aGlzLnByZXBhcmVVcmwoKStkLGooKSx0aGlzLmFyZWEudmFsdWU9Yi5KU09OLnN0cmluZ2lmeShhKTt0cnl7dGhpcy5mb3JtLnN1Ym1pdCgpfWNhdGNoKGspe310aGlzLmlmcmFtZS5hdHRhY2hFdmVudD9oLm9ucmVhZHlzdGF0ZWNoYW5nZT1mdW5jdGlvbigpe2MuaWZyYW1lLnJlYWR5U3RhdGU9PVwiY29tcGxldGVcIiYmaSgpfTp0aGlzLmlmcmFtZS5vbmxvYWQ9aSx0aGlzLnNvY2tldC5zZXRCdWZmZXIoITApfSxlLnByb3RvdHlwZS5nZXQ9ZnVuY3Rpb24oKXt2YXIgYT10aGlzLGM9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNjcmlwdFwiKSxlPWIudXRpbC5xdWVyeSh0aGlzLnNvY2tldC5vcHRpb25zLnF1ZXJ5LFwidD1cIisgKyhuZXcgRGF0ZSkrXCImaT1cIit0aGlzLmluZGV4KTt0aGlzLnNjcmlwdCYmKHRoaXMuc2NyaXB0LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5zY3JpcHQpLHRoaXMuc2NyaXB0PW51bGwpLGMuYXN5bmM9ITAsYy5zcmM9dGhpcy5wcmVwYXJlVXJsKCkrZSxjLm9uZXJyb3I9ZnVuY3Rpb24oKXthLm9uQ2xvc2UoKX07dmFyIGY9ZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJzY3JpcHRcIilbMF07Zi5wYXJlbnROb2RlLmluc2VydEJlZm9yZShjLGYpLHRoaXMuc2NyaXB0PWMsZCYmc2V0VGltZW91dChmdW5jdGlvbigpe3ZhciBhPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpZnJhbWVcIik7ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChhKSxkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKGEpfSwxMDApfSxlLnByb3RvdHlwZS5fPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLm9uRGF0YShhKSx0aGlzLmlzT3BlbiYmdGhpcy5nZXQoKSx0aGlzfSxlLnByb3RvdHlwZS5yZWFkeT1mdW5jdGlvbihhLGMpe3ZhciBlPXRoaXM7aWYoIWQpcmV0dXJuIGMuY2FsbCh0aGlzKTtiLnV0aWwubG9hZChmdW5jdGlvbigpe2MuY2FsbChlKX0pfSxlLmNoZWNrPWZ1bmN0aW9uKCl7cmV0dXJuXCJkb2N1bWVudFwiaW4gY30sZS54ZG9tYWluQ2hlY2s9ZnVuY3Rpb24oKXtyZXR1cm4hMH0sYi50cmFuc3BvcnRzLnB1c2goXCJqc29ucC1wb2xsaW5nXCIpfShcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW8uVHJhbnNwb3J0Om1vZHVsZS5leHBvcnRzLFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pbzptb2R1bGUucGFyZW50LmV4cG9ydHMsdGhpcyksdHlwZW9mIGRlZmluZT09XCJmdW5jdGlvblwiJiZkZWZpbmUuYW1kJiZkZWZpbmUoW10sZnVuY3Rpb24oKXtyZXR1cm4gaW99KX0pKCkiLCIoZnVuY3Rpb24oKXsoZnVuY3Rpb24oKXt2YXIgbj10aGlzLHQ9bi5fLHI9e30sZT1BcnJheS5wcm90b3R5cGUsdT1PYmplY3QucHJvdG90eXBlLGk9RnVuY3Rpb24ucHJvdG90eXBlLGE9ZS5wdXNoLG89ZS5zbGljZSxjPWUuY29uY2F0LGw9dS50b1N0cmluZyxmPXUuaGFzT3duUHJvcGVydHkscz1lLmZvckVhY2gscD1lLm1hcCxoPWUucmVkdWNlLHY9ZS5yZWR1Y2VSaWdodCxkPWUuZmlsdGVyLGc9ZS5ldmVyeSxtPWUuc29tZSx5PWUuaW5kZXhPZixiPWUubGFzdEluZGV4T2YseD1BcnJheS5pc0FycmF5LF89T2JqZWN0LmtleXMsaj1pLmJpbmQsdz1mdW5jdGlvbihuKXtyZXR1cm4gbiBpbnN0YW5jZW9mIHc/bjp0aGlzIGluc3RhbmNlb2Ygdz8odGhpcy5fd3JhcHBlZD1uLHZvaWQgMCk6bmV3IHcobil9O1widW5kZWZpbmVkXCIhPXR5cGVvZiBleHBvcnRzPyhcInVuZGVmaW5lZFwiIT10eXBlb2YgbW9kdWxlJiZtb2R1bGUuZXhwb3J0cyYmKGV4cG9ydHM9bW9kdWxlLmV4cG9ydHM9dyksZXhwb3J0cy5fPXcpOm4uXz13LHcuVkVSU0lPTj1cIjEuNC40XCI7dmFyIEE9dy5lYWNoPXcuZm9yRWFjaD1mdW5jdGlvbihuLHQsZSl7aWYobnVsbCE9bilpZihzJiZuLmZvckVhY2g9PT1zKW4uZm9yRWFjaCh0LGUpO2Vsc2UgaWYobi5sZW5ndGg9PT0rbi5sZW5ndGgpe2Zvcih2YXIgdT0wLGk9bi5sZW5ndGg7aT51O3UrKylpZih0LmNhbGwoZSxuW3VdLHUsbik9PT1yKXJldHVybn1lbHNlIGZvcih2YXIgYSBpbiBuKWlmKHcuaGFzKG4sYSkmJnQuY2FsbChlLG5bYV0sYSxuKT09PXIpcmV0dXJufTt3Lm1hcD13LmNvbGxlY3Q9ZnVuY3Rpb24obix0LHIpe3ZhciBlPVtdO3JldHVybiBudWxsPT1uP2U6cCYmbi5tYXA9PT1wP24ubWFwKHQscik6KEEobixmdW5jdGlvbihuLHUsaSl7ZVtlLmxlbmd0aF09dC5jYWxsKHIsbix1LGkpfSksZSl9O3ZhciBPPVwiUmVkdWNlIG9mIGVtcHR5IGFycmF5IHdpdGggbm8gaW5pdGlhbCB2YWx1ZVwiO3cucmVkdWNlPXcuZm9sZGw9dy5pbmplY3Q9ZnVuY3Rpb24obix0LHIsZSl7dmFyIHU9YXJndW1lbnRzLmxlbmd0aD4yO2lmKG51bGw9PW4mJihuPVtdKSxoJiZuLnJlZHVjZT09PWgpcmV0dXJuIGUmJih0PXcuYmluZCh0LGUpKSx1P24ucmVkdWNlKHQscik6bi5yZWR1Y2UodCk7aWYoQShuLGZ1bmN0aW9uKG4saSxhKXt1P3I9dC5jYWxsKGUscixuLGksYSk6KHI9bix1PSEwKX0pLCF1KXRocm93IG5ldyBUeXBlRXJyb3IoTyk7cmV0dXJuIHJ9LHcucmVkdWNlUmlnaHQ9dy5mb2xkcj1mdW5jdGlvbihuLHQscixlKXt2YXIgdT1hcmd1bWVudHMubGVuZ3RoPjI7aWYobnVsbD09biYmKG49W10pLHYmJm4ucmVkdWNlUmlnaHQ9PT12KXJldHVybiBlJiYodD13LmJpbmQodCxlKSksdT9uLnJlZHVjZVJpZ2h0KHQscik6bi5yZWR1Y2VSaWdodCh0KTt2YXIgaT1uLmxlbmd0aDtpZihpIT09K2kpe3ZhciBhPXcua2V5cyhuKTtpPWEubGVuZ3RofWlmKEEobixmdW5jdGlvbihvLGMsbCl7Yz1hP2FbLS1pXTotLWksdT9yPXQuY2FsbChlLHIsbltjXSxjLGwpOihyPW5bY10sdT0hMCl9KSwhdSl0aHJvdyBuZXcgVHlwZUVycm9yKE8pO3JldHVybiByfSx3LmZpbmQ9dy5kZXRlY3Q9ZnVuY3Rpb24obix0LHIpe3ZhciBlO3JldHVybiBFKG4sZnVuY3Rpb24obix1LGkpe3JldHVybiB0LmNhbGwocixuLHUsaSk/KGU9biwhMCk6dm9pZCAwfSksZX0sdy5maWx0ZXI9dy5zZWxlY3Q9ZnVuY3Rpb24obix0LHIpe3ZhciBlPVtdO3JldHVybiBudWxsPT1uP2U6ZCYmbi5maWx0ZXI9PT1kP24uZmlsdGVyKHQscik6KEEobixmdW5jdGlvbihuLHUsaSl7dC5jYWxsKHIsbix1LGkpJiYoZVtlLmxlbmd0aF09bil9KSxlKX0sdy5yZWplY3Q9ZnVuY3Rpb24obix0LHIpe3JldHVybiB3LmZpbHRlcihuLGZ1bmN0aW9uKG4sZSx1KXtyZXR1cm4hdC5jYWxsKHIsbixlLHUpfSxyKX0sdy5ldmVyeT13LmFsbD1mdW5jdGlvbihuLHQsZSl7dHx8KHQ9dy5pZGVudGl0eSk7dmFyIHU9ITA7cmV0dXJuIG51bGw9PW4/dTpnJiZuLmV2ZXJ5PT09Zz9uLmV2ZXJ5KHQsZSk6KEEobixmdW5jdGlvbihuLGksYSl7cmV0dXJuKHU9dSYmdC5jYWxsKGUsbixpLGEpKT92b2lkIDA6cn0pLCEhdSl9O3ZhciBFPXcuc29tZT13LmFueT1mdW5jdGlvbihuLHQsZSl7dHx8KHQ9dy5pZGVudGl0eSk7dmFyIHU9ITE7cmV0dXJuIG51bGw9PW4/dTptJiZuLnNvbWU9PT1tP24uc29tZSh0LGUpOihBKG4sZnVuY3Rpb24obixpLGEpe3JldHVybiB1fHwodT10LmNhbGwoZSxuLGksYSkpP3I6dm9pZCAwfSksISF1KX07dy5jb250YWlucz13LmluY2x1ZGU9ZnVuY3Rpb24obix0KXtyZXR1cm4gbnVsbD09bj8hMTp5JiZuLmluZGV4T2Y9PT15P24uaW5kZXhPZih0KSE9LTE6RShuLGZ1bmN0aW9uKG4pe3JldHVybiBuPT09dH0pfSx3Lmludm9rZT1mdW5jdGlvbihuLHQpe3ZhciByPW8uY2FsbChhcmd1bWVudHMsMiksZT13LmlzRnVuY3Rpb24odCk7cmV0dXJuIHcubWFwKG4sZnVuY3Rpb24obil7cmV0dXJuKGU/dDpuW3RdKS5hcHBseShuLHIpfSl9LHcucGx1Y2s9ZnVuY3Rpb24obix0KXtyZXR1cm4gdy5tYXAobixmdW5jdGlvbihuKXtyZXR1cm4gblt0XX0pfSx3LndoZXJlPWZ1bmN0aW9uKG4sdCxyKXtyZXR1cm4gdy5pc0VtcHR5KHQpP3I/bnVsbDpbXTp3W3I/XCJmaW5kXCI6XCJmaWx0ZXJcIl0obixmdW5jdGlvbihuKXtmb3IodmFyIHIgaW4gdClpZih0W3JdIT09bltyXSlyZXR1cm4hMTtyZXR1cm4hMH0pfSx3LmZpbmRXaGVyZT1mdW5jdGlvbihuLHQpe3JldHVybiB3LndoZXJlKG4sdCwhMCl9LHcubWF4PWZ1bmN0aW9uKG4sdCxyKXtpZighdCYmdy5pc0FycmF5KG4pJiZuWzBdPT09K25bMF0mJjY1NTM1Pm4ubGVuZ3RoKXJldHVybiBNYXRoLm1heC5hcHBseShNYXRoLG4pO2lmKCF0JiZ3LmlzRW1wdHkobikpcmV0dXJuLTEvMDt2YXIgZT17Y29tcHV0ZWQ6LTEvMCx2YWx1ZTotMS8wfTtyZXR1cm4gQShuLGZ1bmN0aW9uKG4sdSxpKXt2YXIgYT10P3QuY2FsbChyLG4sdSxpKTpuO2E+PWUuY29tcHV0ZWQmJihlPXt2YWx1ZTpuLGNvbXB1dGVkOmF9KX0pLGUudmFsdWV9LHcubWluPWZ1bmN0aW9uKG4sdCxyKXtpZighdCYmdy5pc0FycmF5KG4pJiZuWzBdPT09K25bMF0mJjY1NTM1Pm4ubGVuZ3RoKXJldHVybiBNYXRoLm1pbi5hcHBseShNYXRoLG4pO2lmKCF0JiZ3LmlzRW1wdHkobikpcmV0dXJuIDEvMDt2YXIgZT17Y29tcHV0ZWQ6MS8wLHZhbHVlOjEvMH07cmV0dXJuIEEobixmdW5jdGlvbihuLHUsaSl7dmFyIGE9dD90LmNhbGwocixuLHUsaSk6bjtlLmNvbXB1dGVkPmEmJihlPXt2YWx1ZTpuLGNvbXB1dGVkOmF9KX0pLGUudmFsdWV9LHcuc2h1ZmZsZT1mdW5jdGlvbihuKXt2YXIgdCxyPTAsZT1bXTtyZXR1cm4gQShuLGZ1bmN0aW9uKG4pe3Q9dy5yYW5kb20ocisrKSxlW3ItMV09ZVt0XSxlW3RdPW59KSxlfTt2YXIgaz1mdW5jdGlvbihuKXtyZXR1cm4gdy5pc0Z1bmN0aW9uKG4pP246ZnVuY3Rpb24odCl7cmV0dXJuIHRbbl19fTt3LnNvcnRCeT1mdW5jdGlvbihuLHQscil7dmFyIGU9ayh0KTtyZXR1cm4gdy5wbHVjayh3Lm1hcChuLGZ1bmN0aW9uKG4sdCx1KXtyZXR1cm57dmFsdWU6bixpbmRleDp0LGNyaXRlcmlhOmUuY2FsbChyLG4sdCx1KX19KS5zb3J0KGZ1bmN0aW9uKG4sdCl7dmFyIHI9bi5jcml0ZXJpYSxlPXQuY3JpdGVyaWE7aWYociE9PWUpe2lmKHI+ZXx8cj09PXZvaWQgMClyZXR1cm4gMTtpZihlPnJ8fGU9PT12b2lkIDApcmV0dXJuLTF9cmV0dXJuIG4uaW5kZXg8dC5pbmRleD8tMToxfSksXCJ2YWx1ZVwiKX07dmFyIEY9ZnVuY3Rpb24obix0LHIsZSl7dmFyIHU9e30saT1rKHR8fHcuaWRlbnRpdHkpO3JldHVybiBBKG4sZnVuY3Rpb24odCxhKXt2YXIgbz1pLmNhbGwocix0LGEsbik7ZSh1LG8sdCl9KSx1fTt3Lmdyb3VwQnk9ZnVuY3Rpb24obix0LHIpe3JldHVybiBGKG4sdCxyLGZ1bmN0aW9uKG4sdCxyKXsody5oYXMobix0KT9uW3RdOm5bdF09W10pLnB1c2gocil9KX0sdy5jb3VudEJ5PWZ1bmN0aW9uKG4sdCxyKXtyZXR1cm4gRihuLHQscixmdW5jdGlvbihuLHQpe3cuaGFzKG4sdCl8fChuW3RdPTApLG5bdF0rK30pfSx3LnNvcnRlZEluZGV4PWZ1bmN0aW9uKG4sdCxyLGUpe3I9bnVsbD09cj93LmlkZW50aXR5Omsocik7Zm9yKHZhciB1PXIuY2FsbChlLHQpLGk9MCxhPW4ubGVuZ3RoO2E+aTspe3ZhciBvPWkrYT4+PjE7dT5yLmNhbGwoZSxuW29dKT9pPW8rMTphPW99cmV0dXJuIGl9LHcudG9BcnJheT1mdW5jdGlvbihuKXtyZXR1cm4gbj93LmlzQXJyYXkobik/by5jYWxsKG4pOm4ubGVuZ3RoPT09K24ubGVuZ3RoP3cubWFwKG4sdy5pZGVudGl0eSk6dy52YWx1ZXMobik6W119LHcuc2l6ZT1mdW5jdGlvbihuKXtyZXR1cm4gbnVsbD09bj8wOm4ubGVuZ3RoPT09K24ubGVuZ3RoP24ubGVuZ3RoOncua2V5cyhuKS5sZW5ndGh9LHcuZmlyc3Q9dy5oZWFkPXcudGFrZT1mdW5jdGlvbihuLHQscil7cmV0dXJuIG51bGw9PW4/dm9pZCAwOm51bGw9PXR8fHI/blswXTpvLmNhbGwobiwwLHQpfSx3LmluaXRpYWw9ZnVuY3Rpb24obix0LHIpe3JldHVybiBvLmNhbGwobiwwLG4ubGVuZ3RoLShudWxsPT10fHxyPzE6dCkpfSx3Lmxhc3Q9ZnVuY3Rpb24obix0LHIpe3JldHVybiBudWxsPT1uP3ZvaWQgMDpudWxsPT10fHxyP25bbi5sZW5ndGgtMV06by5jYWxsKG4sTWF0aC5tYXgobi5sZW5ndGgtdCwwKSl9LHcucmVzdD13LnRhaWw9dy5kcm9wPWZ1bmN0aW9uKG4sdCxyKXtyZXR1cm4gby5jYWxsKG4sbnVsbD09dHx8cj8xOnQpfSx3LmNvbXBhY3Q9ZnVuY3Rpb24obil7cmV0dXJuIHcuZmlsdGVyKG4sdy5pZGVudGl0eSl9O3ZhciBSPWZ1bmN0aW9uKG4sdCxyKXtyZXR1cm4gQShuLGZ1bmN0aW9uKG4pe3cuaXNBcnJheShuKT90P2EuYXBwbHkocixuKTpSKG4sdCxyKTpyLnB1c2gobil9KSxyfTt3LmZsYXR0ZW49ZnVuY3Rpb24obix0KXtyZXR1cm4gUihuLHQsW10pfSx3LndpdGhvdXQ9ZnVuY3Rpb24obil7cmV0dXJuIHcuZGlmZmVyZW5jZShuLG8uY2FsbChhcmd1bWVudHMsMSkpfSx3LnVuaXE9dy51bmlxdWU9ZnVuY3Rpb24obix0LHIsZSl7dy5pc0Z1bmN0aW9uKHQpJiYoZT1yLHI9dCx0PSExKTt2YXIgdT1yP3cubWFwKG4scixlKTpuLGk9W10sYT1bXTtyZXR1cm4gQSh1LGZ1bmN0aW9uKHIsZSl7KHQ/ZSYmYVthLmxlbmd0aC0xXT09PXI6dy5jb250YWlucyhhLHIpKXx8KGEucHVzaChyKSxpLnB1c2gobltlXSkpfSksaX0sdy51bmlvbj1mdW5jdGlvbigpe3JldHVybiB3LnVuaXEoYy5hcHBseShlLGFyZ3VtZW50cykpfSx3LmludGVyc2VjdGlvbj1mdW5jdGlvbihuKXt2YXIgdD1vLmNhbGwoYXJndW1lbnRzLDEpO3JldHVybiB3LmZpbHRlcih3LnVuaXEobiksZnVuY3Rpb24obil7cmV0dXJuIHcuZXZlcnkodCxmdW5jdGlvbih0KXtyZXR1cm4gdy5pbmRleE9mKHQsbik+PTB9KX0pfSx3LmRpZmZlcmVuY2U9ZnVuY3Rpb24obil7dmFyIHQ9Yy5hcHBseShlLG8uY2FsbChhcmd1bWVudHMsMSkpO3JldHVybiB3LmZpbHRlcihuLGZ1bmN0aW9uKG4pe3JldHVybiF3LmNvbnRhaW5zKHQsbil9KX0sdy56aXA9ZnVuY3Rpb24oKXtmb3IodmFyIG49by5jYWxsKGFyZ3VtZW50cyksdD13Lm1heCh3LnBsdWNrKG4sXCJsZW5ndGhcIikpLHI9QXJyYXkodCksZT0wO3Q+ZTtlKyspcltlXT13LnBsdWNrKG4sXCJcIitlKTtyZXR1cm4gcn0sdy5vYmplY3Q9ZnVuY3Rpb24obix0KXtpZihudWxsPT1uKXJldHVybnt9O2Zvcih2YXIgcj17fSxlPTAsdT1uLmxlbmd0aDt1PmU7ZSsrKXQ/cltuW2VdXT10W2VdOnJbbltlXVswXV09bltlXVsxXTtyZXR1cm4gcn0sdy5pbmRleE9mPWZ1bmN0aW9uKG4sdCxyKXtpZihudWxsPT1uKXJldHVybi0xO3ZhciBlPTAsdT1uLmxlbmd0aDtpZihyKXtpZihcIm51bWJlclwiIT10eXBlb2YgcilyZXR1cm4gZT13LnNvcnRlZEluZGV4KG4sdCksbltlXT09PXQ/ZTotMTtlPTA+cj9NYXRoLm1heCgwLHUrcik6cn1pZih5JiZuLmluZGV4T2Y9PT15KXJldHVybiBuLmluZGV4T2YodCxyKTtmb3IoO3U+ZTtlKyspaWYobltlXT09PXQpcmV0dXJuIGU7cmV0dXJuLTF9LHcubGFzdEluZGV4T2Y9ZnVuY3Rpb24obix0LHIpe2lmKG51bGw9PW4pcmV0dXJuLTE7dmFyIGU9bnVsbCE9cjtpZihiJiZuLmxhc3RJbmRleE9mPT09YilyZXR1cm4gZT9uLmxhc3RJbmRleE9mKHQscik6bi5sYXN0SW5kZXhPZih0KTtmb3IodmFyIHU9ZT9yOm4ubGVuZ3RoO3UtLTspaWYoblt1XT09PXQpcmV0dXJuIHU7cmV0dXJuLTF9LHcucmFuZ2U9ZnVuY3Rpb24obix0LHIpezE+PWFyZ3VtZW50cy5sZW5ndGgmJih0PW58fDAsbj0wKSxyPWFyZ3VtZW50c1syXXx8MTtmb3IodmFyIGU9TWF0aC5tYXgoTWF0aC5jZWlsKCh0LW4pL3IpLDApLHU9MCxpPUFycmF5KGUpO2U+dTspaVt1KytdPW4sbis9cjtyZXR1cm4gaX0sdy5iaW5kPWZ1bmN0aW9uKG4sdCl7aWYobi5iaW5kPT09aiYmailyZXR1cm4gai5hcHBseShuLG8uY2FsbChhcmd1bWVudHMsMSkpO3ZhciByPW8uY2FsbChhcmd1bWVudHMsMik7cmV0dXJuIGZ1bmN0aW9uKCl7cmV0dXJuIG4uYXBwbHkodCxyLmNvbmNhdChvLmNhbGwoYXJndW1lbnRzKSkpfX0sdy5wYXJ0aWFsPWZ1bmN0aW9uKG4pe3ZhciB0PW8uY2FsbChhcmd1bWVudHMsMSk7cmV0dXJuIGZ1bmN0aW9uKCl7cmV0dXJuIG4uYXBwbHkodGhpcyx0LmNvbmNhdChvLmNhbGwoYXJndW1lbnRzKSkpfX0sdy5iaW5kQWxsPWZ1bmN0aW9uKG4pe3ZhciB0PW8uY2FsbChhcmd1bWVudHMsMSk7cmV0dXJuIDA9PT10Lmxlbmd0aCYmKHQ9dy5mdW5jdGlvbnMobikpLEEodCxmdW5jdGlvbih0KXtuW3RdPXcuYmluZChuW3RdLG4pfSksbn0sdy5tZW1vaXplPWZ1bmN0aW9uKG4sdCl7dmFyIHI9e307cmV0dXJuIHR8fCh0PXcuaWRlbnRpdHkpLGZ1bmN0aW9uKCl7dmFyIGU9dC5hcHBseSh0aGlzLGFyZ3VtZW50cyk7cmV0dXJuIHcuaGFzKHIsZSk/cltlXTpyW2VdPW4uYXBwbHkodGhpcyxhcmd1bWVudHMpfX0sdy5kZWxheT1mdW5jdGlvbihuLHQpe3ZhciByPW8uY2FsbChhcmd1bWVudHMsMik7cmV0dXJuIHNldFRpbWVvdXQoZnVuY3Rpb24oKXtyZXR1cm4gbi5hcHBseShudWxsLHIpfSx0KX0sdy5kZWZlcj1mdW5jdGlvbihuKXtyZXR1cm4gdy5kZWxheS5hcHBseSh3LFtuLDFdLmNvbmNhdChvLmNhbGwoYXJndW1lbnRzLDEpKSl9LHcudGhyb3R0bGU9ZnVuY3Rpb24obix0KXt2YXIgcixlLHUsaSxhPTAsbz1mdW5jdGlvbigpe2E9bmV3IERhdGUsdT1udWxsLGk9bi5hcHBseShyLGUpfTtyZXR1cm4gZnVuY3Rpb24oKXt2YXIgYz1uZXcgRGF0ZSxsPXQtKGMtYSk7cmV0dXJuIHI9dGhpcyxlPWFyZ3VtZW50cywwPj1sPyhjbGVhclRpbWVvdXQodSksdT1udWxsLGE9YyxpPW4uYXBwbHkocixlKSk6dXx8KHU9c2V0VGltZW91dChvLGwpKSxpfX0sdy5kZWJvdW5jZT1mdW5jdGlvbihuLHQscil7dmFyIGUsdTtyZXR1cm4gZnVuY3Rpb24oKXt2YXIgaT10aGlzLGE9YXJndW1lbnRzLG89ZnVuY3Rpb24oKXtlPW51bGwscnx8KHU9bi5hcHBseShpLGEpKX0sYz1yJiYhZTtyZXR1cm4gY2xlYXJUaW1lb3V0KGUpLGU9c2V0VGltZW91dChvLHQpLGMmJih1PW4uYXBwbHkoaSxhKSksdX19LHcub25jZT1mdW5jdGlvbihuKXt2YXIgdCxyPSExO3JldHVybiBmdW5jdGlvbigpe3JldHVybiByP3Q6KHI9ITAsdD1uLmFwcGx5KHRoaXMsYXJndW1lbnRzKSxuPW51bGwsdCl9fSx3LndyYXA9ZnVuY3Rpb24obix0KXtyZXR1cm4gZnVuY3Rpb24oKXt2YXIgcj1bbl07cmV0dXJuIGEuYXBwbHkocixhcmd1bWVudHMpLHQuYXBwbHkodGhpcyxyKX19LHcuY29tcG9zZT1mdW5jdGlvbigpe3ZhciBuPWFyZ3VtZW50cztyZXR1cm4gZnVuY3Rpb24oKXtmb3IodmFyIHQ9YXJndW1lbnRzLHI9bi5sZW5ndGgtMTtyPj0wO3ItLSl0PVtuW3JdLmFwcGx5KHRoaXMsdCldO3JldHVybiB0WzBdfX0sdy5hZnRlcj1mdW5jdGlvbihuLHQpe3JldHVybiAwPj1uP3QoKTpmdW5jdGlvbigpe3JldHVybiAxPi0tbj90LmFwcGx5KHRoaXMsYXJndW1lbnRzKTp2b2lkIDB9fSx3LmtleXM9X3x8ZnVuY3Rpb24obil7aWYobiE9PU9iamVjdChuKSl0aHJvdyBuZXcgVHlwZUVycm9yKFwiSW52YWxpZCBvYmplY3RcIik7dmFyIHQ9W107Zm9yKHZhciByIGluIG4pdy5oYXMobixyKSYmKHRbdC5sZW5ndGhdPXIpO3JldHVybiB0fSx3LnZhbHVlcz1mdW5jdGlvbihuKXt2YXIgdD1bXTtmb3IodmFyIHIgaW4gbil3LmhhcyhuLHIpJiZ0LnB1c2gobltyXSk7cmV0dXJuIHR9LHcucGFpcnM9ZnVuY3Rpb24obil7dmFyIHQ9W107Zm9yKHZhciByIGluIG4pdy5oYXMobixyKSYmdC5wdXNoKFtyLG5bcl1dKTtyZXR1cm4gdH0sdy5pbnZlcnQ9ZnVuY3Rpb24obil7dmFyIHQ9e307Zm9yKHZhciByIGluIG4pdy5oYXMobixyKSYmKHRbbltyXV09cik7cmV0dXJuIHR9LHcuZnVuY3Rpb25zPXcubWV0aG9kcz1mdW5jdGlvbihuKXt2YXIgdD1bXTtmb3IodmFyIHIgaW4gbil3LmlzRnVuY3Rpb24obltyXSkmJnQucHVzaChyKTtyZXR1cm4gdC5zb3J0KCl9LHcuZXh0ZW5kPWZ1bmN0aW9uKG4pe3JldHVybiBBKG8uY2FsbChhcmd1bWVudHMsMSksZnVuY3Rpb24odCl7aWYodClmb3IodmFyIHIgaW4gdCluW3JdPXRbcl19KSxufSx3LnBpY2s9ZnVuY3Rpb24obil7dmFyIHQ9e30scj1jLmFwcGx5KGUsby5jYWxsKGFyZ3VtZW50cywxKSk7cmV0dXJuIEEocixmdW5jdGlvbihyKXtyIGluIG4mJih0W3JdPW5bcl0pfSksdH0sdy5vbWl0PWZ1bmN0aW9uKG4pe3ZhciB0PXt9LHI9Yy5hcHBseShlLG8uY2FsbChhcmd1bWVudHMsMSkpO2Zvcih2YXIgdSBpbiBuKXcuY29udGFpbnMocix1KXx8KHRbdV09blt1XSk7cmV0dXJuIHR9LHcuZGVmYXVsdHM9ZnVuY3Rpb24obil7cmV0dXJuIEEoby5jYWxsKGFyZ3VtZW50cywxKSxmdW5jdGlvbih0KXtpZih0KWZvcih2YXIgciBpbiB0KW51bGw9PW5bcl0mJihuW3JdPXRbcl0pfSksbn0sdy5jbG9uZT1mdW5jdGlvbihuKXtyZXR1cm4gdy5pc09iamVjdChuKT93LmlzQXJyYXkobik/bi5zbGljZSgpOncuZXh0ZW5kKHt9LG4pOm59LHcudGFwPWZ1bmN0aW9uKG4sdCl7cmV0dXJuIHQobiksbn07dmFyIEk9ZnVuY3Rpb24obix0LHIsZSl7aWYobj09PXQpcmV0dXJuIDAhPT1ufHwxL249PTEvdDtpZihudWxsPT1ufHxudWxsPT10KXJldHVybiBuPT09dDtuIGluc3RhbmNlb2YgdyYmKG49bi5fd3JhcHBlZCksdCBpbnN0YW5jZW9mIHcmJih0PXQuX3dyYXBwZWQpO3ZhciB1PWwuY2FsbChuKTtpZih1IT1sLmNhbGwodCkpcmV0dXJuITE7c3dpdGNoKHUpe2Nhc2VcIltvYmplY3QgU3RyaW5nXVwiOnJldHVybiBuPT10K1wiXCI7Y2FzZVwiW29iamVjdCBOdW1iZXJdXCI6cmV0dXJuIG4hPStuP3QhPSt0OjA9PW4/MS9uPT0xL3Q6bj09K3Q7Y2FzZVwiW29iamVjdCBEYXRlXVwiOmNhc2VcIltvYmplY3QgQm9vbGVhbl1cIjpyZXR1cm4rbj09K3Q7Y2FzZVwiW29iamVjdCBSZWdFeHBdXCI6cmV0dXJuIG4uc291cmNlPT10LnNvdXJjZSYmbi5nbG9iYWw9PXQuZ2xvYmFsJiZuLm11bHRpbGluZT09dC5tdWx0aWxpbmUmJm4uaWdub3JlQ2FzZT09dC5pZ25vcmVDYXNlfWlmKFwib2JqZWN0XCIhPXR5cGVvZiBufHxcIm9iamVjdFwiIT10eXBlb2YgdClyZXR1cm4hMTtmb3IodmFyIGk9ci5sZW5ndGg7aS0tOylpZihyW2ldPT1uKXJldHVybiBlW2ldPT10O3IucHVzaChuKSxlLnB1c2godCk7dmFyIGE9MCxvPSEwO2lmKFwiW29iamVjdCBBcnJheV1cIj09dSl7aWYoYT1uLmxlbmd0aCxvPWE9PXQubGVuZ3RoKWZvcig7YS0tJiYobz1JKG5bYV0sdFthXSxyLGUpKTspO31lbHNle3ZhciBjPW4uY29uc3RydWN0b3IsZj10LmNvbnN0cnVjdG9yO2lmKGMhPT1mJiYhKHcuaXNGdW5jdGlvbihjKSYmYyBpbnN0YW5jZW9mIGMmJncuaXNGdW5jdGlvbihmKSYmZiBpbnN0YW5jZW9mIGYpKXJldHVybiExO2Zvcih2YXIgcyBpbiBuKWlmKHcuaGFzKG4scykmJihhKyssIShvPXcuaGFzKHQscykmJkkobltzXSx0W3NdLHIsZSkpKSlicmVhaztpZihvKXtmb3IocyBpbiB0KWlmKHcuaGFzKHQscykmJiFhLS0pYnJlYWs7bz0hYX19cmV0dXJuIHIucG9wKCksZS5wb3AoKSxvfTt3LmlzRXF1YWw9ZnVuY3Rpb24obix0KXtyZXR1cm4gSShuLHQsW10sW10pfSx3LmlzRW1wdHk9ZnVuY3Rpb24obil7aWYobnVsbD09bilyZXR1cm4hMDtpZih3LmlzQXJyYXkobil8fHcuaXNTdHJpbmcobikpcmV0dXJuIDA9PT1uLmxlbmd0aDtmb3IodmFyIHQgaW4gbilpZih3LmhhcyhuLHQpKXJldHVybiExO3JldHVybiEwfSx3LmlzRWxlbWVudD1mdW5jdGlvbihuKXtyZXR1cm4hKCFufHwxIT09bi5ub2RlVHlwZSl9LHcuaXNBcnJheT14fHxmdW5jdGlvbihuKXtyZXR1cm5cIltvYmplY3QgQXJyYXldXCI9PWwuY2FsbChuKX0sdy5pc09iamVjdD1mdW5jdGlvbihuKXtyZXR1cm4gbj09PU9iamVjdChuKX0sQShbXCJBcmd1bWVudHNcIixcIkZ1bmN0aW9uXCIsXCJTdHJpbmdcIixcIk51bWJlclwiLFwiRGF0ZVwiLFwiUmVnRXhwXCJdLGZ1bmN0aW9uKG4pe3dbXCJpc1wiK25dPWZ1bmN0aW9uKHQpe3JldHVybiBsLmNhbGwodCk9PVwiW29iamVjdCBcIituK1wiXVwifX0pLHcuaXNBcmd1bWVudHMoYXJndW1lbnRzKXx8KHcuaXNBcmd1bWVudHM9ZnVuY3Rpb24obil7cmV0dXJuISghbnx8IXcuaGFzKG4sXCJjYWxsZWVcIikpfSksXCJmdW5jdGlvblwiIT10eXBlb2YvLi8mJih3LmlzRnVuY3Rpb249ZnVuY3Rpb24obil7cmV0dXJuXCJmdW5jdGlvblwiPT10eXBlb2Ygbn0pLHcuaXNGaW5pdGU9ZnVuY3Rpb24obil7cmV0dXJuIGlzRmluaXRlKG4pJiYhaXNOYU4ocGFyc2VGbG9hdChuKSl9LHcuaXNOYU49ZnVuY3Rpb24obil7cmV0dXJuIHcuaXNOdW1iZXIobikmJm4hPStufSx3LmlzQm9vbGVhbj1mdW5jdGlvbihuKXtyZXR1cm4gbj09PSEwfHxuPT09ITF8fFwiW29iamVjdCBCb29sZWFuXVwiPT1sLmNhbGwobil9LHcuaXNOdWxsPWZ1bmN0aW9uKG4pe3JldHVybiBudWxsPT09bn0sdy5pc1VuZGVmaW5lZD1mdW5jdGlvbihuKXtyZXR1cm4gbj09PXZvaWQgMH0sdy5oYXM9ZnVuY3Rpb24obix0KXtyZXR1cm4gZi5jYWxsKG4sdCl9LHcubm9Db25mbGljdD1mdW5jdGlvbigpe3JldHVybiBuLl89dCx0aGlzfSx3LmlkZW50aXR5PWZ1bmN0aW9uKG4pe3JldHVybiBufSx3LnRpbWVzPWZ1bmN0aW9uKG4sdCxyKXtmb3IodmFyIGU9QXJyYXkobiksdT0wO24+dTt1KyspZVt1XT10LmNhbGwocix1KTtyZXR1cm4gZX0sdy5yYW5kb209ZnVuY3Rpb24obix0KXtyZXR1cm4gbnVsbD09dCYmKHQ9bixuPTApLG4rTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpKih0LW4rMSkpfTt2YXIgTT17ZXNjYXBlOntcIiZcIjpcIiZhbXA7XCIsXCI8XCI6XCImbHQ7XCIsXCI+XCI6XCImZ3Q7XCIsJ1wiJzpcIiZxdW90O1wiLFwiJ1wiOlwiJiN4Mjc7XCIsXCIvXCI6XCImI3gyRjtcIn19O00udW5lc2NhcGU9dy5pbnZlcnQoTS5lc2NhcGUpO3ZhciBTPXtlc2NhcGU6UmVnRXhwKFwiW1wiK3cua2V5cyhNLmVzY2FwZSkuam9pbihcIlwiKStcIl1cIixcImdcIiksdW5lc2NhcGU6UmVnRXhwKFwiKFwiK3cua2V5cyhNLnVuZXNjYXBlKS5qb2luKFwifFwiKStcIilcIixcImdcIil9O3cuZWFjaChbXCJlc2NhcGVcIixcInVuZXNjYXBlXCJdLGZ1bmN0aW9uKG4pe3dbbl09ZnVuY3Rpb24odCl7cmV0dXJuIG51bGw9PXQ/XCJcIjooXCJcIit0KS5yZXBsYWNlKFNbbl0sZnVuY3Rpb24odCl7cmV0dXJuIE1bbl1bdF19KX19KSx3LnJlc3VsdD1mdW5jdGlvbihuLHQpe2lmKG51bGw9PW4pcmV0dXJuIG51bGw7dmFyIHI9blt0XTtyZXR1cm4gdy5pc0Z1bmN0aW9uKHIpP3IuY2FsbChuKTpyfSx3Lm1peGluPWZ1bmN0aW9uKG4pe0Eody5mdW5jdGlvbnMobiksZnVuY3Rpb24odCl7dmFyIHI9d1t0XT1uW3RdO3cucHJvdG90eXBlW3RdPWZ1bmN0aW9uKCl7dmFyIG49W3RoaXMuX3dyYXBwZWRdO3JldHVybiBhLmFwcGx5KG4sYXJndW1lbnRzKSxELmNhbGwodGhpcyxyLmFwcGx5KHcsbikpfX0pfTt2YXIgTj0wO3cudW5pcXVlSWQ9ZnVuY3Rpb24obil7dmFyIHQ9KytOK1wiXCI7cmV0dXJuIG4/bit0OnR9LHcudGVtcGxhdGVTZXR0aW5ncz17ZXZhbHVhdGU6LzwlKFtcXHNcXFNdKz8pJT4vZyxpbnRlcnBvbGF0ZTovPCU9KFtcXHNcXFNdKz8pJT4vZyxlc2NhcGU6LzwlLShbXFxzXFxTXSs/KSU+L2d9O3ZhciBUPS8oLileLyxxPXtcIidcIjpcIidcIixcIlxcXFxcIjpcIlxcXFxcIixcIlxcclwiOlwiclwiLFwiXFxuXCI6XCJuXCIsXCJcdFwiOlwidFwiLFwiXFx1MjAyOFwiOlwidTIwMjhcIixcIlxcdTIwMjlcIjpcInUyMDI5XCJ9LEI9L1xcXFx8J3xcXHJ8XFxufFxcdHxcXHUyMDI4fFxcdTIwMjkvZzt3LnRlbXBsYXRlPWZ1bmN0aW9uKG4sdCxyKXt2YXIgZTtyPXcuZGVmYXVsdHMoe30scix3LnRlbXBsYXRlU2V0dGluZ3MpO3ZhciB1PVJlZ0V4cChbKHIuZXNjYXBlfHxUKS5zb3VyY2UsKHIuaW50ZXJwb2xhdGV8fFQpLnNvdXJjZSwoci5ldmFsdWF0ZXx8VCkuc291cmNlXS5qb2luKFwifFwiKStcInwkXCIsXCJnXCIpLGk9MCxhPVwiX19wKz0nXCI7bi5yZXBsYWNlKHUsZnVuY3Rpb24odCxyLGUsdSxvKXtyZXR1cm4gYSs9bi5zbGljZShpLG8pLnJlcGxhY2UoQixmdW5jdGlvbihuKXtyZXR1cm5cIlxcXFxcIitxW25dfSksciYmKGErPVwiJytcXG4oKF9fdD0oXCIrcitcIikpPT1udWxsPycnOl8uZXNjYXBlKF9fdCkpK1xcbidcIiksZSYmKGErPVwiJytcXG4oKF9fdD0oXCIrZStcIikpPT1udWxsPycnOl9fdCkrXFxuJ1wiKSx1JiYoYSs9XCInO1xcblwiK3UrXCJcXG5fX3ArPSdcIiksaT1vK3QubGVuZ3RoLHR9KSxhKz1cIic7XFxuXCIsci52YXJpYWJsZXx8KGE9XCJ3aXRoKG9ianx8e30pe1xcblwiK2ErXCJ9XFxuXCIpLGE9XCJ2YXIgX190LF9fcD0nJyxfX2o9QXJyYXkucHJvdG90eXBlLmpvaW4sXCIrXCJwcmludD1mdW5jdGlvbigpe19fcCs9X19qLmNhbGwoYXJndW1lbnRzLCcnKTt9O1xcblwiK2ErXCJyZXR1cm4gX19wO1xcblwiO3RyeXtlPUZ1bmN0aW9uKHIudmFyaWFibGV8fFwib2JqXCIsXCJfXCIsYSl9Y2F0Y2gobyl7dGhyb3cgby5zb3VyY2U9YSxvfWlmKHQpcmV0dXJuIGUodCx3KTt2YXIgYz1mdW5jdGlvbihuKXtyZXR1cm4gZS5jYWxsKHRoaXMsbix3KX07cmV0dXJuIGMuc291cmNlPVwiZnVuY3Rpb24oXCIrKHIudmFyaWFibGV8fFwib2JqXCIpK1wiKXtcXG5cIithK1wifVwiLGN9LHcuY2hhaW49ZnVuY3Rpb24obil7cmV0dXJuIHcobikuY2hhaW4oKX07dmFyIEQ9ZnVuY3Rpb24obil7cmV0dXJuIHRoaXMuX2NoYWluP3cobikuY2hhaW4oKTpufTt3Lm1peGluKHcpLEEoW1wicG9wXCIsXCJwdXNoXCIsXCJyZXZlcnNlXCIsXCJzaGlmdFwiLFwic29ydFwiLFwic3BsaWNlXCIsXCJ1bnNoaWZ0XCJdLGZ1bmN0aW9uKG4pe3ZhciB0PWVbbl07dy5wcm90b3R5cGVbbl09ZnVuY3Rpb24oKXt2YXIgcj10aGlzLl93cmFwcGVkO3JldHVybiB0LmFwcGx5KHIsYXJndW1lbnRzKSxcInNoaWZ0XCIhPW4mJlwic3BsaWNlXCIhPW58fDAhPT1yLmxlbmd0aHx8ZGVsZXRlIHJbMF0sRC5jYWxsKHRoaXMscil9fSksQShbXCJjb25jYXRcIixcImpvaW5cIixcInNsaWNlXCJdLGZ1bmN0aW9uKG4pe3ZhciB0PWVbbl07dy5wcm90b3R5cGVbbl09ZnVuY3Rpb24oKXtyZXR1cm4gRC5jYWxsKHRoaXMsdC5hcHBseSh0aGlzLl93cmFwcGVkLGFyZ3VtZW50cykpfX0pLHcuZXh0ZW5kKHcucHJvdG90eXBlLHtjaGFpbjpmdW5jdGlvbigpe3JldHVybiB0aGlzLl9jaGFpbj0hMCx0aGlzfSx2YWx1ZTpmdW5jdGlvbigpe3JldHVybiB0aGlzLl93cmFwcGVkfX0pfSkuY2FsbCh0aGlzKTtcbn0pKCkiLCJcbnZhciByYWYgPSAgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSAgICAgICB8fFxuICAgICAgICAgICB3aW5kb3cud2Via2l0UmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8XG4gICAgICAgICAgIHdpbmRvdy5tb3pSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgICAgfHxcbiAgICAgICAgICAgZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgd2luZG93LnNldFRpbWVvdXQoY2FsbGJhY2ssIDEwMDAgLyA2MCk7XG4gICAgICAgICAgIH07XG5cbnZhciBydW5uaW5nID0gZmFsc2U7XG5cbmV4cG9ydHMucnVuID0gZnVuY3Rpb24oZm4pIHtcbiAgcnVubmluZyA9IHRydWU7XG4gIHJhZihmdW5jdGlvbiBhbmltYXRlKCkge1xuICAgIGZuKCk7XG4gICAgaWYgKHJ1bm5pbmcpIHtcbiAgICAgIHJhZihhbmltYXRlKTtcbiAgICB9XG4gIH0pO1xufTtcblxuZXhwb3J0cy5zdG9wID0gZnVuY3Rpb24oKSB7XG4gIHJ1bm5pbmcgPSBmYWxzZTtcbn07XG4iLCJcbnZhciBFbnRpdHlUcmFja2VyID0gZnVuY3Rpb24oKSB7XG4gIFxuICB2YXIgZW50aXRpZXMgPSB7fTtcbiAgdmFyIGxhc3RJZCA9IDE7XG5cbiAgdGhpcy5mb3JFYWNoID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICBmb3IgKHZhciBpZCBpbiBlbnRpdGllcykge1xuICAgICAgY2FsbGJhY2soZW50aXRpZXNbaWRdKTtcbiAgICB9XG4gIH07XG5cbiAgdGhpcy5maW5kID0gZnVuY3Rpb24oaWQpIHtcbiAgICByZXR1cm4gZW50aXRpZXNbaWRdO1xuICB9O1xuXG4gIHRoaXMuZmluZE1hdGNoaW5nID0gZnVuY3Rpb24ocmVnZXgpIHtcbiAgICByZXR1cm4gT2JqZWN0LmtleXMoZW50aXRpZXMpXG4gICAgICAuZmlsdGVyKGZ1bmN0aW9uKGlkKSB7IHJldHVybiBpZC5tYXRjaChyZWdleCkgfSlcbiAgICAgIC5tYXAoZnVuY3Rpb24oaWQpIHsgcmV0dXJuIGVudGl0aWVzW2lkXSB9KVxuICB9XG5cbiAgdGhpcy50cmFjayA9IGZ1bmN0aW9uKGVudGl0eSkge1xuICAgIC8vY29uc29sZS5sb2coJ1RyYWNraW5nIGVudGl0eTogJyArIGVudGl0eS5pZCk7XG4gICAgdmFyIGlkID0gZW50aXR5LmlkIHx8IChsYXN0SWQgKz0gMSk7XG4gICAgZW50aXRpZXNbaWRdID0gZW50aXR5O1xuICAgIHJldHVybiBpZDtcbiAgfTtcblxuICB0aGlzLmZvcmdldCA9IGZ1bmN0aW9uKGVudGl0eSkge1xuICAgIGRlbGV0ZSBlbnRpdGllc1tlbnRpdHkuaWRdO1xuICB9O1xuICBcbiAgdGhpcy5mb3JnZXRBbGwgPSBmdW5jdGlvbigpIHtcbiAgICBlbnRpdGllcyA9IHt9O1xuICB9XG4gIFxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBFbnRpdHlUcmFja2VyO1xuIiwiXG5mdW5jdGlvbiBUaW1lKCkge1xuICB0aGlzLmRlbHRhID0gMTtcbiAgdGhpcy5sYXN0VGltZSA9IG5ldyBEYXRlKCk7XG4gIHRoaXMuZnJhbWVzID0gMDtcbn1cblxuVGltZS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuZnJhbWVzKys7XG4gIHZhciB0aW1lID0gRGF0ZS5ub3coKTtcbiAgdGhpcy5mcmFtZXMgPSAwO1xuICAgIFxuICB2YXIgY3VycmVudFRpbWUgPSB0aW1lO1xuICB2YXIgcGFzc2VkVGltZSA9IGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0VGltZTtcbiAgXG4gIHRoaXMuZGVsdGEgPSBwYXNzZWRUaW1lO1xuICB0aGlzLmxhc3RUaW1lID0gY3VycmVudFRpbWU7XG5cbiAgcmV0dXJuIHRoaXMuZGVsdGE7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFRpbWU7XG4iLCIvLyBDb3B5cmlnaHQgKGMpIDIwMTMgQWRvYmUgU3lzdGVtcyBJbmNvcnBvcmF0ZWQuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4vLyBcbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vIFxuLy8gaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vLyBcbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4vLyDilIzilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilJAgXFxcXFxuLy8g4pSCIEV2ZSAwLjQuMiAtIEphdmFTY3JpcHQgRXZlbnRzIExpYnJhcnkgICAgICAgICAgICAgICAgICAgICAg4pSCIFxcXFxcbi8vIOKUnOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUpCBcXFxcXG4vLyDilIIgQXV0aG9yIERtaXRyeSBCYXJhbm92c2tpeSAoaHR0cDovL2RtaXRyeS5iYXJhbm92c2tpeS5jb20vKSDilIIgXFxcXFxuLy8g4pSU4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSYIFxcXFxcblxuKGZ1bmN0aW9uIChnbG9iKSB7XG4gICAgdmFyIHZlcnNpb24gPSBcIjAuNC4yXCIsXG4gICAgICAgIGhhcyA9IFwiaGFzT3duUHJvcGVydHlcIixcbiAgICAgICAgc2VwYXJhdG9yID0gL1tcXC5cXC9dLyxcbiAgICAgICAgd2lsZGNhcmQgPSBcIipcIixcbiAgICAgICAgZnVuID0gZnVuY3Rpb24gKCkge30sXG4gICAgICAgIG51bXNvcnQgPSBmdW5jdGlvbiAoYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIGEgLSBiO1xuICAgICAgICB9LFxuICAgICAgICBjdXJyZW50X2V2ZW50LFxuICAgICAgICBzdG9wLFxuICAgICAgICBldmVudHMgPSB7bjoge319LFxuICAgIC8qXFxcbiAgICAgKiBldmVcbiAgICAgWyBtZXRob2QgXVxuXG4gICAgICogRmlyZXMgZXZlbnQgd2l0aCBnaXZlbiBgbmFtZWAsIGdpdmVuIHNjb3BlIGFuZCBvdGhlciBwYXJhbWV0ZXJzLlxuXG4gICAgID4gQXJndW1lbnRzXG5cbiAgICAgLSBuYW1lIChzdHJpbmcpIG5hbWUgb2YgdGhlICpldmVudCosIGRvdCAoYC5gKSBvciBzbGFzaCAoYC9gKSBzZXBhcmF0ZWRcbiAgICAgLSBzY29wZSAob2JqZWN0KSBjb250ZXh0IGZvciB0aGUgZXZlbnQgaGFuZGxlcnNcbiAgICAgLSB2YXJhcmdzICguLi4pIHRoZSByZXN0IG9mIGFyZ3VtZW50cyB3aWxsIGJlIHNlbnQgdG8gZXZlbnQgaGFuZGxlcnNcblxuICAgICA9IChvYmplY3QpIGFycmF5IG9mIHJldHVybmVkIHZhbHVlcyBmcm9tIHRoZSBsaXN0ZW5lcnNcbiAgICBcXCovXG4gICAgICAgIGV2ZSA9IGZ1bmN0aW9uIChuYW1lLCBzY29wZSkge1xuXHRcdFx0bmFtZSA9IFN0cmluZyhuYW1lKTtcbiAgICAgICAgICAgIHZhciBlID0gZXZlbnRzLFxuICAgICAgICAgICAgICAgIG9sZHN0b3AgPSBzdG9wLFxuICAgICAgICAgICAgICAgIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpLFxuICAgICAgICAgICAgICAgIGxpc3RlbmVycyA9IGV2ZS5saXN0ZW5lcnMobmFtZSksXG4gICAgICAgICAgICAgICAgeiA9IDAsXG4gICAgICAgICAgICAgICAgZiA9IGZhbHNlLFxuICAgICAgICAgICAgICAgIGwsXG4gICAgICAgICAgICAgICAgaW5kZXhlZCA9IFtdLFxuICAgICAgICAgICAgICAgIHF1ZXVlID0ge30sXG4gICAgICAgICAgICAgICAgb3V0ID0gW10sXG4gICAgICAgICAgICAgICAgY2UgPSBjdXJyZW50X2V2ZW50LFxuICAgICAgICAgICAgICAgIGVycm9ycyA9IFtdO1xuICAgICAgICAgICAgY3VycmVudF9ldmVudCA9IG5hbWU7XG4gICAgICAgICAgICBzdG9wID0gMDtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBpaSA9IGxpc3RlbmVycy5sZW5ndGg7IGkgPCBpaTsgaSsrKSBpZiAoXCJ6SW5kZXhcIiBpbiBsaXN0ZW5lcnNbaV0pIHtcbiAgICAgICAgICAgICAgICBpbmRleGVkLnB1c2gobGlzdGVuZXJzW2ldLnpJbmRleCk7XG4gICAgICAgICAgICAgICAgaWYgKGxpc3RlbmVyc1tpXS56SW5kZXggPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHF1ZXVlW2xpc3RlbmVyc1tpXS56SW5kZXhdID0gbGlzdGVuZXJzW2ldO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGluZGV4ZWQuc29ydChudW1zb3J0KTtcbiAgICAgICAgICAgIHdoaWxlIChpbmRleGVkW3pdIDwgMCkge1xuICAgICAgICAgICAgICAgIGwgPSBxdWV1ZVtpbmRleGVkW3orK11dO1xuICAgICAgICAgICAgICAgIG91dC5wdXNoKGwuYXBwbHkoc2NvcGUsIGFyZ3MpKTtcbiAgICAgICAgICAgICAgICBpZiAoc3RvcCkge1xuICAgICAgICAgICAgICAgICAgICBzdG9wID0gb2xkc3RvcDtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgaWk7IGkrKykge1xuICAgICAgICAgICAgICAgIGwgPSBsaXN0ZW5lcnNbaV07XG4gICAgICAgICAgICAgICAgaWYgKFwiekluZGV4XCIgaW4gbCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAobC56SW5kZXggPT0gaW5kZXhlZFt6XSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgb3V0LnB1c2gobC5hcHBseShzY29wZSwgYXJncykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN0b3ApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB6Kys7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbCA9IHF1ZXVlW2luZGV4ZWRbel1dO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGwgJiYgb3V0LnB1c2gobC5hcHBseShzY29wZSwgYXJncykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdG9wKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gd2hpbGUgKGwpXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBxdWV1ZVtsLnpJbmRleF0gPSBsO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgb3V0LnB1c2gobC5hcHBseShzY29wZSwgYXJncykpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RvcCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzdG9wID0gb2xkc3RvcDtcbiAgICAgICAgICAgIGN1cnJlbnRfZXZlbnQgPSBjZTtcbiAgICAgICAgICAgIHJldHVybiBvdXQubGVuZ3RoID8gb3V0IDogbnVsbDtcbiAgICAgICAgfTtcblx0XHQvLyBVbmRvY3VtZW50ZWQuIERlYnVnIG9ubHkuXG5cdFx0ZXZlLl9ldmVudHMgPSBldmVudHM7XG4gICAgLypcXFxuICAgICAqIGV2ZS5saXN0ZW5lcnNcbiAgICAgWyBtZXRob2QgXVxuXG4gICAgICogSW50ZXJuYWwgbWV0aG9kIHdoaWNoIGdpdmVzIHlvdSBhcnJheSBvZiBhbGwgZXZlbnQgaGFuZGxlcnMgdGhhdCB3aWxsIGJlIHRyaWdnZXJlZCBieSB0aGUgZ2l2ZW4gYG5hbWVgLlxuXG4gICAgID4gQXJndW1lbnRzXG5cbiAgICAgLSBuYW1lIChzdHJpbmcpIG5hbWUgb2YgdGhlIGV2ZW50LCBkb3QgKGAuYCkgb3Igc2xhc2ggKGAvYCkgc2VwYXJhdGVkXG5cbiAgICAgPSAoYXJyYXkpIGFycmF5IG9mIGV2ZW50IGhhbmRsZXJzXG4gICAgXFwqL1xuICAgIGV2ZS5saXN0ZW5lcnMgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICB2YXIgbmFtZXMgPSBuYW1lLnNwbGl0KHNlcGFyYXRvciksXG4gICAgICAgICAgICBlID0gZXZlbnRzLFxuICAgICAgICAgICAgaXRlbSxcbiAgICAgICAgICAgIGl0ZW1zLFxuICAgICAgICAgICAgayxcbiAgICAgICAgICAgIGksXG4gICAgICAgICAgICBpaSxcbiAgICAgICAgICAgIGosXG4gICAgICAgICAgICBqaixcbiAgICAgICAgICAgIG5lcyxcbiAgICAgICAgICAgIGVzID0gW2VdLFxuICAgICAgICAgICAgb3V0ID0gW107XG4gICAgICAgIGZvciAoaSA9IDAsIGlpID0gbmFtZXMubGVuZ3RoOyBpIDwgaWk7IGkrKykge1xuICAgICAgICAgICAgbmVzID0gW107XG4gICAgICAgICAgICBmb3IgKGogPSAwLCBqaiA9IGVzLmxlbmd0aDsgaiA8IGpqOyBqKyspIHtcbiAgICAgICAgICAgICAgICBlID0gZXNbal0ubjtcbiAgICAgICAgICAgICAgICBpdGVtcyA9IFtlW25hbWVzW2ldXSwgZVt3aWxkY2FyZF1dO1xuICAgICAgICAgICAgICAgIGsgPSAyO1xuICAgICAgICAgICAgICAgIHdoaWxlIChrLS0pIHtcbiAgICAgICAgICAgICAgICAgICAgaXRlbSA9IGl0ZW1zW2tdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaXRlbSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbmVzLnB1c2goaXRlbSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBvdXQgPSBvdXQuY29uY2F0KGl0ZW0uZiB8fCBbXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlcyA9IG5lcztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb3V0O1xuICAgIH07XG4gICAgXG4gICAgLypcXFxuICAgICAqIGV2ZS5vblxuICAgICBbIG1ldGhvZCBdXG4gICAgICoqXG4gICAgICogQmluZHMgZ2l2ZW4gZXZlbnQgaGFuZGxlciB3aXRoIGEgZ2l2ZW4gbmFtZS4gWW91IGNhbiB1c2Ugd2lsZGNhcmRzIOKAnGAqYOKAnSBmb3IgdGhlIG5hbWVzOlxuICAgICB8IGV2ZS5vbihcIioudW5kZXIuKlwiLCBmKTtcbiAgICAgfCBldmUoXCJtb3VzZS51bmRlci5mbG9vclwiKTsgLy8gdHJpZ2dlcnMgZlxuICAgICAqIFVzZSBAZXZlIHRvIHRyaWdnZXIgdGhlIGxpc3RlbmVyLlxuICAgICAqKlxuICAgICA+IEFyZ3VtZW50c1xuICAgICAqKlxuICAgICAtIG5hbWUgKHN0cmluZykgbmFtZSBvZiB0aGUgZXZlbnQsIGRvdCAoYC5gKSBvciBzbGFzaCAoYC9gKSBzZXBhcmF0ZWQsIHdpdGggb3B0aW9uYWwgd2lsZGNhcmRzXG4gICAgIC0gZiAoZnVuY3Rpb24pIGV2ZW50IGhhbmRsZXIgZnVuY3Rpb25cbiAgICAgKipcbiAgICAgPSAoZnVuY3Rpb24pIHJldHVybmVkIGZ1bmN0aW9uIGFjY2VwdHMgYSBzaW5nbGUgbnVtZXJpYyBwYXJhbWV0ZXIgdGhhdCByZXByZXNlbnRzIHotaW5kZXggb2YgdGhlIGhhbmRsZXIuIEl0IGlzIGFuIG9wdGlvbmFsIGZlYXR1cmUgYW5kIG9ubHkgdXNlZCB3aGVuIHlvdSBuZWVkIHRvIGVuc3VyZSB0aGF0IHNvbWUgc3Vic2V0IG9mIGhhbmRsZXJzIHdpbGwgYmUgaW52b2tlZCBpbiBhIGdpdmVuIG9yZGVyLCBkZXNwaXRlIG9mIHRoZSBvcmRlciBvZiBhc3NpZ25tZW50LiBcbiAgICAgPiBFeGFtcGxlOlxuICAgICB8IGV2ZS5vbihcIm1vdXNlXCIsIGVhdEl0KSgyKTtcbiAgICAgfCBldmUub24oXCJtb3VzZVwiLCBzY3JlYW0pO1xuICAgICB8IGV2ZS5vbihcIm1vdXNlXCIsIGNhdGNoSXQpKDEpO1xuICAgICAqIFRoaXMgd2lsbCBlbnN1cmUgdGhhdCBgY2F0Y2hJdCgpYCBmdW5jdGlvbiB3aWxsIGJlIGNhbGxlZCBiZWZvcmUgYGVhdEl0KClgLlxuXHQgKlxuICAgICAqIElmIHlvdSB3YW50IHRvIHB1dCB5b3VyIGhhbmRsZXIgYmVmb3JlIG5vbi1pbmRleGVkIGhhbmRsZXJzLCBzcGVjaWZ5IGEgbmVnYXRpdmUgdmFsdWUuXG4gICAgICogTm90ZTogSSBhc3N1bWUgbW9zdCBvZiB0aGUgdGltZSB5b3UgZG9u4oCZdCBuZWVkIHRvIHdvcnJ5IGFib3V0IHotaW5kZXgsIGJ1dCBpdOKAmXMgbmljZSB0byBoYXZlIHRoaXMgZmVhdHVyZSDigJxqdXN0IGluIGNhc2XigJ0uXG4gICAgXFwqL1xuICAgIGV2ZS5vbiA9IGZ1bmN0aW9uIChuYW1lLCBmKSB7XG5cdFx0bmFtZSA9IFN0cmluZyhuYW1lKTtcblx0XHRpZiAodHlwZW9mIGYgIT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRyZXR1cm4gZnVuY3Rpb24gKCkge307XG5cdFx0fVxuICAgICAgICB2YXIgbmFtZXMgPSBuYW1lLnNwbGl0KHNlcGFyYXRvciksXG4gICAgICAgICAgICBlID0gZXZlbnRzO1xuICAgICAgICBmb3IgKHZhciBpID0gMCwgaWkgPSBuYW1lcy5sZW5ndGg7IGkgPCBpaTsgaSsrKSB7XG4gICAgICAgICAgICBlID0gZS5uO1xuICAgICAgICAgICAgZSA9IGUuaGFzT3duUHJvcGVydHkobmFtZXNbaV0pICYmIGVbbmFtZXNbaV1dIHx8IChlW25hbWVzW2ldXSA9IHtuOiB7fX0pO1xuICAgICAgICB9XG4gICAgICAgIGUuZiA9IGUuZiB8fCBbXTtcbiAgICAgICAgZm9yIChpID0gMCwgaWkgPSBlLmYubGVuZ3RoOyBpIDwgaWk7IGkrKykgaWYgKGUuZltpXSA9PSBmKSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuO1xuICAgICAgICB9XG4gICAgICAgIGUuZi5wdXNoKGYpO1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKHpJbmRleCkge1xuICAgICAgICAgICAgaWYgKCt6SW5kZXggPT0gK3pJbmRleCkge1xuICAgICAgICAgICAgICAgIGYuekluZGV4ID0gK3pJbmRleDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9O1xuICAgIC8qXFxcbiAgICAgKiBldmUuZlxuICAgICBbIG1ldGhvZCBdXG4gICAgICoqXG4gICAgICogUmV0dXJucyBmdW5jdGlvbiB0aGF0IHdpbGwgZmlyZSBnaXZlbiBldmVudCB3aXRoIG9wdGlvbmFsIGFyZ3VtZW50cy5cblx0ICogQXJndW1lbnRzIHRoYXQgd2lsbCBiZSBwYXNzZWQgdG8gdGhlIHJlc3VsdCBmdW5jdGlvbiB3aWxsIGJlIGFsc29cblx0ICogY29uY2F0ZWQgdG8gdGhlIGxpc3Qgb2YgZmluYWwgYXJndW1lbnRzLlxuIFx0IHwgZWwub25jbGljayA9IGV2ZS5mKFwiY2xpY2tcIiwgMSwgMik7XG4gXHQgfCBldmUub24oXCJjbGlja1wiLCBmdW5jdGlvbiAoYSwgYiwgYykge1xuIFx0IHwgICAgIGNvbnNvbGUubG9nKGEsIGIsIGMpOyAvLyAxLCAyLCBbZXZlbnQgb2JqZWN0XVxuIFx0IHwgfSk7XG4gICAgID4gQXJndW1lbnRzXG5cdCAtIGV2ZW50IChzdHJpbmcpIGV2ZW50IG5hbWVcblx0IC0gdmFyYXJncyAo4oCmKSBhbmQgYW55IG90aGVyIGFyZ3VtZW50c1xuXHQgPSAoZnVuY3Rpb24pIHBvc3NpYmxlIGV2ZW50IGhhbmRsZXIgZnVuY3Rpb25cbiAgICBcXCovXG5cdGV2ZS5mID0gZnVuY3Rpb24gKGV2ZW50KSB7XG5cdFx0dmFyIGF0dHJzID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuXHRcdHJldHVybiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRldmUuYXBwbHkobnVsbCwgW2V2ZW50LCBudWxsXS5jb25jYXQoYXR0cnMpLmNvbmNhdChbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCkpKTtcblx0XHR9O1xuXHR9O1xuICAgIC8qXFxcbiAgICAgKiBldmUuc3RvcFxuICAgICBbIG1ldGhvZCBdXG4gICAgICoqXG4gICAgICogSXMgdXNlZCBpbnNpZGUgYW4gZXZlbnQgaGFuZGxlciB0byBzdG9wIHRoZSBldmVudCwgcHJldmVudGluZyBhbnkgc3Vic2VxdWVudCBsaXN0ZW5lcnMgZnJvbSBmaXJpbmcuXG4gICAgXFwqL1xuICAgIGV2ZS5zdG9wID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBzdG9wID0gMTtcbiAgICB9O1xuICAgIC8qXFxcbiAgICAgKiBldmUubnRcbiAgICAgWyBtZXRob2QgXVxuICAgICAqKlxuICAgICAqIENvdWxkIGJlIHVzZWQgaW5zaWRlIGV2ZW50IGhhbmRsZXIgdG8gZmlndXJlIG91dCBhY3R1YWwgbmFtZSBvZiB0aGUgZXZlbnQuXG4gICAgICoqXG4gICAgID4gQXJndW1lbnRzXG4gICAgICoqXG4gICAgIC0gc3VibmFtZSAoc3RyaW5nKSAjb3B0aW9uYWwgc3VibmFtZSBvZiB0aGUgZXZlbnRcbiAgICAgKipcbiAgICAgPSAoc3RyaW5nKSBuYW1lIG9mIHRoZSBldmVudCwgaWYgYHN1Ym5hbWVgIGlzIG5vdCBzcGVjaWZpZWRcbiAgICAgKiBvclxuICAgICA9IChib29sZWFuKSBgdHJ1ZWAsIGlmIGN1cnJlbnQgZXZlbnTigJlzIG5hbWUgY29udGFpbnMgYHN1Ym5hbWVgXG4gICAgXFwqL1xuICAgIGV2ZS5udCA9IGZ1bmN0aW9uIChzdWJuYW1lKSB7XG4gICAgICAgIGlmIChzdWJuYW1lKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFJlZ0V4cChcIig/OlxcXFwufFxcXFwvfF4pXCIgKyBzdWJuYW1lICsgXCIoPzpcXFxcLnxcXFxcL3wkKVwiKS50ZXN0KGN1cnJlbnRfZXZlbnQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjdXJyZW50X2V2ZW50O1xuICAgIH07XG4gICAgLypcXFxuICAgICAqIGV2ZS5udHNcbiAgICAgWyBtZXRob2QgXVxuICAgICAqKlxuICAgICAqIENvdWxkIGJlIHVzZWQgaW5zaWRlIGV2ZW50IGhhbmRsZXIgdG8gZmlndXJlIG91dCBhY3R1YWwgbmFtZSBvZiB0aGUgZXZlbnQuXG4gICAgICoqXG4gICAgICoqXG4gICAgID0gKGFycmF5KSBuYW1lcyBvZiB0aGUgZXZlbnRcbiAgICBcXCovXG4gICAgZXZlLm50cyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGN1cnJlbnRfZXZlbnQuc3BsaXQoc2VwYXJhdG9yKTtcbiAgICB9O1xuICAgIC8qXFxcbiAgICAgKiBldmUub2ZmXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKipcbiAgICAgKiBSZW1vdmVzIGdpdmVuIGZ1bmN0aW9uIGZyb20gdGhlIGxpc3Qgb2YgZXZlbnQgbGlzdGVuZXJzIGFzc2lnbmVkIHRvIGdpdmVuIG5hbWUuXG5cdCAqIElmIG5vIGFyZ3VtZW50cyBzcGVjaWZpZWQgYWxsIHRoZSBldmVudHMgd2lsbCBiZSBjbGVhcmVkLlxuICAgICAqKlxuICAgICA+IEFyZ3VtZW50c1xuICAgICAqKlxuICAgICAtIG5hbWUgKHN0cmluZykgbmFtZSBvZiB0aGUgZXZlbnQsIGRvdCAoYC5gKSBvciBzbGFzaCAoYC9gKSBzZXBhcmF0ZWQsIHdpdGggb3B0aW9uYWwgd2lsZGNhcmRzXG4gICAgIC0gZiAoZnVuY3Rpb24pIGV2ZW50IGhhbmRsZXIgZnVuY3Rpb25cbiAgICBcXCovXG4gICAgLypcXFxuICAgICAqIGV2ZS51bmJpbmRcbiAgICAgWyBtZXRob2QgXVxuICAgICAqKlxuICAgICAqIFNlZSBAZXZlLm9mZlxuICAgIFxcKi9cbiAgICBldmUub2ZmID0gZXZlLnVuYmluZCA9IGZ1bmN0aW9uIChuYW1lLCBmKSB7XG5cdFx0aWYgKCFuYW1lKSB7XG5cdFx0ICAgIGV2ZS5fZXZlbnRzID0gZXZlbnRzID0ge246IHt9fTtcblx0XHRcdHJldHVybjtcblx0XHR9XG4gICAgICAgIHZhciBuYW1lcyA9IG5hbWUuc3BsaXQoc2VwYXJhdG9yKSxcbiAgICAgICAgICAgIGUsXG4gICAgICAgICAgICBrZXksXG4gICAgICAgICAgICBzcGxpY2UsXG4gICAgICAgICAgICBpLCBpaSwgaiwgamosXG4gICAgICAgICAgICBjdXIgPSBbZXZlbnRzXTtcbiAgICAgICAgZm9yIChpID0gMCwgaWkgPSBuYW1lcy5sZW5ndGg7IGkgPCBpaTsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgY3VyLmxlbmd0aDsgaiArPSBzcGxpY2UubGVuZ3RoIC0gMikge1xuICAgICAgICAgICAgICAgIHNwbGljZSA9IFtqLCAxXTtcbiAgICAgICAgICAgICAgICBlID0gY3VyW2pdLm47XG4gICAgICAgICAgICAgICAgaWYgKG5hbWVzW2ldICE9IHdpbGRjYXJkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlW25hbWVzW2ldXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3BsaWNlLnB1c2goZVtuYW1lc1tpXV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChrZXkgaW4gZSkgaWYgKGVbaGFzXShrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzcGxpY2UucHVzaChlW2tleV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGN1ci5zcGxpY2UuYXBwbHkoY3VyLCBzcGxpY2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDAsIGlpID0gY3VyLmxlbmd0aDsgaSA8IGlpOyBpKyspIHtcbiAgICAgICAgICAgIGUgPSBjdXJbaV07XG4gICAgICAgICAgICB3aGlsZSAoZS5uKSB7XG4gICAgICAgICAgICAgICAgaWYgKGYpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGUuZikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChqID0gMCwgamogPSBlLmYubGVuZ3RoOyBqIDwgamo7IGorKykgaWYgKGUuZltqXSA9PSBmKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZS5mLnNwbGljZShqLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICFlLmYubGVuZ3RoICYmIGRlbGV0ZSBlLmY7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZm9yIChrZXkgaW4gZS5uKSBpZiAoZS5uW2hhc10oa2V5KSAmJiBlLm5ba2V5XS5mKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgZnVuY3MgPSBlLm5ba2V5XS5mO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChqID0gMCwgamogPSBmdW5jcy5sZW5ndGg7IGogPCBqajsgaisrKSBpZiAoZnVuY3Nbal0gPT0gZikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmNzLnNwbGljZShqLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICFmdW5jcy5sZW5ndGggJiYgZGVsZXRlIGUubltrZXldLmY7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBkZWxldGUgZS5mO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGtleSBpbiBlLm4pIGlmIChlLm5baGFzXShrZXkpICYmIGUubltrZXldLmYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBlLm5ba2V5XS5mO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGUgPSBlLm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuICAgIC8qXFxcbiAgICAgKiBldmUub25jZVxuICAgICBbIG1ldGhvZCBdXG4gICAgICoqXG4gICAgICogQmluZHMgZ2l2ZW4gZXZlbnQgaGFuZGxlciB3aXRoIGEgZ2l2ZW4gbmFtZSB0byBvbmx5IHJ1biBvbmNlIHRoZW4gdW5iaW5kIGl0c2VsZi5cbiAgICAgfCBldmUub25jZShcImxvZ2luXCIsIGYpO1xuICAgICB8IGV2ZShcImxvZ2luXCIpOyAvLyB0cmlnZ2VycyBmXG4gICAgIHwgZXZlKFwibG9naW5cIik7IC8vIG5vIGxpc3RlbmVyc1xuICAgICAqIFVzZSBAZXZlIHRvIHRyaWdnZXIgdGhlIGxpc3RlbmVyLlxuICAgICAqKlxuICAgICA+IEFyZ3VtZW50c1xuICAgICAqKlxuICAgICAtIG5hbWUgKHN0cmluZykgbmFtZSBvZiB0aGUgZXZlbnQsIGRvdCAoYC5gKSBvciBzbGFzaCAoYC9gKSBzZXBhcmF0ZWQsIHdpdGggb3B0aW9uYWwgd2lsZGNhcmRzXG4gICAgIC0gZiAoZnVuY3Rpb24pIGV2ZW50IGhhbmRsZXIgZnVuY3Rpb25cbiAgICAgKipcbiAgICAgPSAoZnVuY3Rpb24pIHNhbWUgcmV0dXJuIGZ1bmN0aW9uIGFzIEBldmUub25cbiAgICBcXCovXG4gICAgZXZlLm9uY2UgPSBmdW5jdGlvbiAobmFtZSwgZikge1xuICAgICAgICB2YXIgZjIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBldmUudW5iaW5kKG5hbWUsIGYyKTtcbiAgICAgICAgICAgIHJldHVybiBmLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBldmUub24obmFtZSwgZjIpO1xuICAgIH07XG4gICAgLypcXFxuICAgICAqIGV2ZS52ZXJzaW9uXG4gICAgIFsgcHJvcGVydHkgKHN0cmluZykgXVxuICAgICAqKlxuICAgICAqIEN1cnJlbnQgdmVyc2lvbiBvZiB0aGUgbGlicmFyeS5cbiAgICBcXCovXG4gICAgZXZlLnZlcnNpb24gPSB2ZXJzaW9uO1xuICAgIGV2ZS50b1N0cmluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIFwiWW91IGFyZSBydW5uaW5nIEV2ZSBcIiArIHZlcnNpb247XG4gICAgfTtcbiAgICAodHlwZW9mIG1vZHVsZSAhPSBcInVuZGVmaW5lZFwiICYmIG1vZHVsZS5leHBvcnRzKSA/IChtb2R1bGUuZXhwb3J0cyA9IGV2ZSkgOiAodHlwZW9mIGRlZmluZSAhPSBcInVuZGVmaW5lZFwiID8gKGRlZmluZShcImV2ZVwiLCBbXSwgZnVuY3Rpb24oKSB7IHJldHVybiBldmU7IH0pKSA6IChnbG9iLmV2ZSA9IGV2ZSkpO1xufSkodGhpcyk7XG4iLCJ2YXIgXyA9IHJlcXVpcmUoJy4uLy4uLzNyZHBhcnR5L3VuZGVyc2NvcmUtbWluJyk7XG5cbnZhciBpbWFnZXMgPSBbXG4gICdiYWxsJyxcbiAgJ2Jvb20tY2lyY2xlJywgJ2Jvb20tbGluZScsICdib29tLXNwbGFzaCcsXG4gICdjYXQnLCAnY2F0LWRvd24nLCAnY2F0LXVwJyxcbiAgJ2NvbmUnLFxuICAnZG9nJywgJ2RvZy1kb3duJywgJ2RvZy11cCcsXG4gICdlbmQtZHJhdycsICdlbmQtd2lubmVyJyxcbiAgJ2ludHJvLWFib3V0JywgJ2ludHJvLWxlYWRlcmJvYXJkJywgJ2ludHJvLXRpdGxlJyxcbiAgJ3BhcnRpY2xlLWJhbGwnLFxuICAnc3RhZGl1bScsICdzdGFkaXVtLXNoYWtlLWxlZnQnLCAnc3RhZGl1bS1zaGFrZS1yaWdodCcsXG4gICdpbnRyby10aXRsZSdcbl0ucmVkdWNlKGltYWdlUGF0aCwge30pO1xuXG52YXIgc291bmRzID0gW1xuICAnYm91bmNlJyxcbiAgJ2Nyb3dkJywgJ2Nyb3dkLWVuZCcsICdjcm93ZC1vaCcsICdjcm93ZC1vcmdhbicsICdjcm93ZC1zY29yZWQnLFxuICAnaW50cm8nLCAnbXVsdGliYWxsJywgJ3NheCcsICd3aGlzdGxlJ1xuXS5yZWR1Y2Uoc291bmRQYXRoLCB7fSk7XG5cbmZ1bmN0aW9uIGltYWdlUGF0aChhY2MsIG5hbWUpIHtcbiAgYWNjW25hbWVdID0gJy9nYW1lL2ltYWdlcy8nICsgbmFtZSArICcucG5nJztcbiAgcmV0dXJuIGFjYztcbn1cblxuZnVuY3Rpb24gc291bmRQYXRoKGFjYywgbmFtZSkge1xuICBhY2NbbmFtZV0gPSAnL2dhbWUvc291bmRzLycgKyBuYW1lICsgJy5tcDMnO1xuICByZXR1cm4gYWNjO1xufVxuXG5leHBvcnRzLmltYWdlID0gZnVuY3Rpb24obmFtZSkge1xuICByZXR1cm4gaW1hZ2VzW25hbWVdO1xufTtcblxuZXhwb3J0cy5pbWFnZXMgPSBmdW5jdGlvbigvKnZhcmFyZ3MqLykge1xuICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmFwcGx5KGFyZ3VtZW50cykubWFwKGZ1bmN0aW9uKG5hbWUpIHtcbiAgICByZXR1cm4gaW1hZ2VzW25hbWVdO1xuICB9KVxufTtcblxuZXhwb3J0cy5hbGxJbWFnZXMgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIF8udmFsdWVzKGltYWdlcyk7XG59XG5cbmV4cG9ydHMuc291bmQgPSBmdW5jdGlvbihuYW1lKSB7XG4gIHJldHVybiBzb3VuZHNbbmFtZV07XG59O1xuIiwidmFyIHVzZXJJbnRlcmZhY2UgICA9IHJlcXVpcmUoJy4vdXNlci1pbnRlcmZhY2UnKTtcbnZhciB3b3JsZDIgICAgICAgICAgPSByZXF1aXJlKCcuL3dvcmxkJyk7XG5cbmZ1bmN0aW9uIEdyYXBoaWNzRW5naW5lKHdvcmxkLCBnYW1lVmlldywgZGVidWdWaWV3KSB7XG4gIHRoaXMucmVuZGVyZXIgICAgID0gUElYSS5hdXRvRGV0ZWN0UmVuZGVyZXIoZ2FtZVZpZXcud2lkdGgsIGdhbWVWaWV3LmhlaWdodCwgZ2FtZVZpZXcpO1xuICB0aGlzLnN0YWdlICAgICAgICA9IG5ldyBQSVhJLlN0YWdlKCk7XG4gIHRoaXMudmlldyAgICAgICAgID0gdGhpcy5yZW5kZXJlci52aWV3O1xuICB0aGlzLmRlYnVnVmlldyAgICA9IGRlYnVnVmlldztcbiAgXG4gIHZhciB3b3JsZFJhdGlvICA9IHdvcmxkLndpZHRoIC8gd29ybGQuaGVpZ2h0O1xuICB2YXIgc2NyZWVuUmF0aW8gPSBnYW1lVmlldy53aWR0aCAvIGdhbWVWaWV3LmhlaWdodDtcbiAgXG4gIHZhciB3aWR0aCwgaGVpZ2h0O1xuICBpZiAoc2NyZWVuUmF0aW8gPiB3b3JsZFJhdGlvKSB7XG4gICAgd2lkdGggID0gTWF0aC5mbG9vcihnYW1lVmlldy5oZWlnaHQgKiB3b3JsZFJhdGlvKTtcbiAgICBoZWlnaHQgPSBnYW1lVmlldy5oZWlnaHQ7XG4gIH0gZWxzZSB7XG4gICAgd2lkdGggID0gZ2FtZVZpZXcud2lkdGg7XG4gICAgaGVpZ2h0ID0gTWF0aC5mbG9vcihnYW1lVmlldy53aWR0aCAvIHdvcmxkUmF0aW8pO1xuICB9XG4gIFxuICBnYW1lVmlldy53aWR0aCAgPSBkZWJ1Z1ZpZXcud2lkdGggID0gd2lkdGg7XG4gIGdhbWVWaWV3LmhlaWdodCA9IGRlYnVnVmlldy5oZWlnaHQgPSBoZWlnaHRcbiAgdXNlckludGVyZmFjZS5yZXNpemUoZ2FtZVZpZXcud2lkdGgsIGdhbWVWaWV3LmhlaWdodCk7XG4gIHRoaXMucmVuZGVyZXIucmVzaXplKGdhbWVWaWV3LndpZHRoLCBnYW1lVmlldy5oZWlnaHQpO1xuICBcbiAgd29ybGQyLnNldFBpeGVsc1Blck1ldGVyKE1hdGguZmxvb3IoZ2FtZVZpZXcuaGVpZ2h0IC8gd29ybGQuaGVpZ2h0KSk7XG59XG5cbkdyYXBoaWNzRW5naW5lLnByb3RvdHlwZS5yZW5kZXIgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5yZW5kZXJlci5yZW5kZXIodGhpcy5zdGFnZSk7XG59O1xuXG5HcmFwaGljc0VuZ2luZS5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24oc3ByaXRlKSB7XG4gIHRoaXMuc3RhZ2UuYWRkQ2hpbGQoc3ByaXRlKTtcbn07XG5cbkdyYXBoaWNzRW5naW5lLnByb3RvdHlwZS5yZW1vdmUgPSBmdW5jdGlvbihzcHJpdGUpIHtcbiAgdGhpcy5zdGFnZS5yZW1vdmVDaGlsZChzcHJpdGUpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBHcmFwaGljc0VuZ2luZTtcbiIsInZhciB3b3JsZCA9IHJlcXVpcmUoJy4vd29ybGQnKTtcblxudmFyIGZyYW1lUmF0ZSAgID0gMSAvIDYwO1xudmFyIGl0ZXJhdGlvbnMgID0gMTA7XG5cbnZhciBub3JtYWxpc2VOYW4gPSBmdW5jdGlvbihuKSB7XG4gIHJldHVybiBuIHx8IDBcbn1cblxudmFyIG5vcm1hbGlzZVBvaW50ID0gZnVuY3Rpb24ocCkge1xuICByZXR1cm4geyB4OiBub3JtYWxpc2VOYW4ocC54KSwgeTogbm9ybWFsaXNlTmFuKHAueSkgfVxufVxuXG5mdW5jdGlvbiBQaHlzaWNzRW5naW5lKGRlYnVnQ2FudmFzKSB7XG4gIFxuICB0aGlzLmNvbGxpc2lvbkNhbGxiYWNrID0gbnVsbDtcbiAgdGhpcy5iMndvcmxkID0gbmV3IEJveDJELkR5bmFtaWNzLmIyV29ybGQobmV3IEJveDJELkNvbW1vbi5NYXRoLmIyVmVjMigwLCAwKSwgdHJ1ZSk7XG4gIFxuICB2YXIgY29udGFjdExpc3RlbmVyID0gbmV3IEJveDJELkR5bmFtaWNzLmIyQ29udGFjdExpc3RlbmVyO1xuICBcbiAgY29udGFjdExpc3RlbmVyLkJlZ2luQ29udGFjdCA9IGZ1bmN0aW9uKGNvbnRhY3QpIHtcbiAgICB2YXIgd29ybGRNYW5pZm9sZCA9IG5ldyBCb3gyRC5Db2xsaXNpb24uYjJXb3JsZE1hbmlmb2xkKCk7XG4gICAgY29udGFjdC5HZXRXb3JsZE1hbmlmb2xkKHdvcmxkTWFuaWZvbGQpO1xuICAgIHZhciBmaXh0dXJlQSA9IGNvbnRhY3QuR2V0Rml4dHVyZUEoKTtcbiAgICB2YXIgZml4dHVyZUIgPSBjb250YWN0LkdldEZpeHR1cmVCKCk7XG4gICAgaWYgKHRoaXMuY29sbGlzaW9uQ2FsbGJhY2spIHtcbiAgICAgIHRoaXMuY29sbGlzaW9uQ2FsbGJhY2soZml4dHVyZUEsIGZpeHR1cmVCLCB3b3JsZE1hbmlmb2xkLm1fcG9pbnRzLm1hcChub3JtYWxpc2VQb2ludCkpO1xuICAgIH1cbiAgfS5iaW5kKHRoaXMpO1xuICBcbiAgdGhpcy5iMndvcmxkLlNldENvbnRhY3RMaXN0ZW5lcihjb250YWN0TGlzdGVuZXIpO1xuICBcbiAgaWYgKGRlYnVnQ2FudmFzKSB7XG4gICAgdGhpcy5kZWJ1Z0RyYXcoZGVidWdDYW52YXMpO1xuICB9XG59XG5cblBoeXNpY3NFbmdpbmUucHJvdG90eXBlLmNyZWF0ZSA9IGZ1bmN0aW9uKGJvZHlEZWYsIGZpeHR1cmVEZWYpIHtcbiAgdmFyIGJvZHkgPSB0aGlzLmIyd29ybGQuQ3JlYXRlQm9keShib2R5RGVmKTtcbiAgaWYgKGZpeHR1cmVEZWYpIHtcbiAgICBib2R5LkNyZWF0ZUZpeHR1cmUoZml4dHVyZURlZik7ICAgIFxuICB9XG4gIHJldHVybiBib2R5O1xufTtcblxuUGh5c2ljc0VuZ2luZS5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uKGJvZHkpIHtcbiAgYm9keS5HZXRGaXh0dXJlTGlzdCgpLlNldFVzZXJEYXRhKG51bGwpO1xuICB0aGlzLmIyd29ybGQuRGVzdHJveUJvZHkoYm9keSk7XG59O1xuXG5QaHlzaWNzRW5naW5lLnByb3RvdHlwZS5jb2xsaXNpb24gPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICB0aGlzLmNvbGxpc2lvbkNhbGxiYWNrID0gY2FsbGJhY2s7XG59XG5cblBoeXNpY3NFbmdpbmUucHJvdG90eXBlLmRlYnVnRHJhdyA9IGZ1bmN0aW9uKGNhbnZhcykge1xuICB2YXIgZGVidWdEcmF3ID0gbmV3IEJveDJELkR5bmFtaWNzLmIyRGVidWdEcmF3KCk7XG4gIGRlYnVnRHJhdy5TZXRTcHJpdGUoY2FudmFzLmdldENvbnRleHQoXCIyZFwiKSk7XG4gIGRlYnVnRHJhdy5TZXREcmF3U2NhbGUod29ybGQuZ2V0UGl4ZWxzUGVyTWV0ZXIoKSk7XG4gIGRlYnVnRHJhdy5TZXRGaWxsQWxwaGEoMC4zKTtcbiAgZGVidWdEcmF3LlNldExpbmVUaGlja25lc3MoMS4wKTtcbiAgZGVidWdEcmF3LlNldEZsYWdzKEJveDJELkR5bmFtaWNzLmIyRGVidWdEcmF3LmVfc2hhcGVCaXQgfCBCb3gyRC5EeW5hbWljcy5iMkRlYnVnRHJhdy5lX2pvaW50Qml0KTtcbiAgdGhpcy5iMndvcmxkLlNldERlYnVnRHJhdyhkZWJ1Z0RyYXcpO1xufVxuXG5QaHlzaWNzRW5naW5lLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5iMndvcmxkLlN0ZXAoZnJhbWVSYXRlLCBpdGVyYXRpb25zLCBpdGVyYXRpb25zKTtcbiAgdGhpcy5iMndvcmxkLkRyYXdEZWJ1Z0RhdGEoKTtcbiAgdGhpcy5iMndvcmxkLkNsZWFyRm9yY2VzKCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFBoeXNpY3NFbmdpbmU7XG4iLCJ2YXIgXyAgICAgPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS91bmRlcnNjb3JlLW1pbicpO1xudmFyIGh1YiAgID0gcmVxdWlyZSgnLi9odWInKTtcblxuZnVuY3Rpb24gU291bmQoKSB7XG4gIFxuICB2YXIgY3VycmVudCA9IHt9O1xuICBcbiAgZnVuY3Rpb24gcGxheShhcmdzKSB7XG4gICAgdmFyIHNvdW5kID0gbmV3IEF1ZGlvKCk7XG4gICAgY3VycmVudFthcmdzLmZpbGVdID0gc291bmQ7XG4gICAgc291bmQuc3JjID0gYXJncy5maWxlO1xuICAgIGlmIChhcmdzLnZvbHVtZSAhPT0gdW5kZWZpbmVkKSB7IHNvdW5kLnZvbHVtZSA9IGFyZ3Mudm9sdW1lOyB9XG4gICAgaWYgKGFyZ3MubG9vcCkgICAgICAgICAgICAgICAgIHsgc291bmQubG9vcCA9IHRydWU7IH1cbiAgICBzb3VuZC5wbGF5KCk7XG4gICAgcmV0dXJuIHNvdW5kO1xuICB9O1xuIFxuICBmdW5jdGlvbiBzdG9wKGFyZ3MpIHtcbiAgICBpZiAoY3VycmVudFthcmdzLmZpbGVdKSB7XG4gICAgICBjdXJyZW50W2FyZ3MuZmlsZV0ucGF1c2UoKTtcbiAgICAgIGRlbGV0ZSBjdXJyZW50W2FyZ3MuZmlsZV07XG4gICAgfVxuICB9XG4gXG4gIGh1Yi5vbignZW5naW5lLnNvdW5kLnBsYXknLCBwbGF5KTtcbiAgaHViLm9uKCdlbmdpbmUuc291bmQuc3RvcCcsIHN0b3ApO1xuICBcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBTb3VuZDtcbiIsInZhciBfICAgICAgICA9IHJlcXVpcmUoJy4uLy4uLy4uLzNyZHBhcnR5L3VuZGVyc2NvcmUtbWluJyk7XG52YXIgaHViICAgICAgPSByZXF1aXJlKCcuL2h1YicpO1xudmFyIEV4cGxvc2lvbiA9IHJlcXVpcmUoJy4vZXhwbG9zaW9uJylcblxudmFyIFBhcnRpY2xlRW5naW5lID0gZnVuY3Rpb24oZW5naW5lKSB7XG4gIGh1Yi5vbignZW5naW5lLmV4cGxvc2lvbicsIGZ1bmN0aW9uKHBhcmFtcykge1xuICAgIGVuZ2luZS5hZGRFbnRpdHkoRXhwbG9zaW9uW3BhcmFtcy5zaXplIHx8ICdzbWFsbCddKHBhcmFtcy5zb3VyY2UpKVxuICB9KVxuICBcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gUGFydGljbGVFbmdpbmU7XG4iLCJ2YXIgXyA9IHJlcXVpcmUoJy4uLy4uLy4uLzNyZHBhcnR5L3VuZGVyc2NvcmUtbWluJyk7XG5cbmZ1bmN0aW9uIFNlcXVlbmNlcihlbmdpbmUsIGdhbWUsIHN0YXRlcywgdHJhbnNpdGlvbnMpIHtcbiAgICBcbiAgdmFyIHN0YXRlcyA9IF8ucmVkdWNlKHN0YXRlcywgZnVuY3Rpb24oYWNjLCBmbiwga2V5KSB7XG4gICAgYWNjW2tleV0gPSBuZXcgZm4oZW5naW5lLCBnYW1lKTtcbiAgICByZXR1cm4gYWNjO1xuICB9LCB7fSk7XG4gIFxuICB2YXIgdGhhdCA9IHRoaXM7XG4gIHRoaXMuYWN0aXZlU3RhdGUgPSBudWxsO1xuICBcbiAgdGhpcy5mc20gPSB3aW5kb3cuU3RhdGVNYWNoaW5lLmNyZWF0ZSh7XG4gIFxuICAgIGV2ZW50czogdHJhbnNpdGlvbnMsXG4gIFxuICAgIGNhbGxiYWNrczoge1xuICAgICAgb25lbnRlcnN0YXRlOiBmdW5jdGlvbih0cmFuc2l0aW9uLCBzdGFydCwgZW5kLCBhcmdzKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdbc2VxdWVuY2VyXSAnICsgc3RhcnQgKyAnICsgJyArIHRyYW5zaXRpb24gKyAnID0gJyArIGVuZCk7XG4gICAgICAgIHN0YXRlc1tzdGFydF0gJiYgc3RhdGVzW3N0YXJ0XS5leGl0KCk7XG4gICAgICAgIHN0YXRlc1tlbmRdICAgJiYgc3RhdGVzW2VuZF0uZW50ZXIoYXJncyk7XG4gICAgICAgIHRoYXQuYWN0aXZlU3RhdGUgPSBzdGF0ZXNbZW5kXTtcbiAgICAgIH1cbiAgICB9LFxuICAgIFxuICAgIC8vIGVycm9yOiBmdW5jdGlvbihldmVudE5hbWUsIGZyb20sIHRvLCBhcmdzLCBlcnJvckNvZGUsIGVycm9yTWVzc2FnZSkge1xuICAgIC8vICAgaWYgKGVycm9yQ29kZSA9PT0gU3RhdGVNYWNoaW5lLkVycm9yLklOVkFMSURfQ0FMTEJBQ0spIHtcbiAgICAvLyAgICAgdGhyb3cgZXJyb3JNZXNzYWdlO1xuICAgIC8vICAgfSBlbHNlIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coJ1tzZXF1ZW5jZXJdICcgKyBldmVudE5hbWUgKyAnIDogJyArIGVycm9yTWVzc2FnZSk7XG4gICAgLy8gICB9XG4gICAgLy8gfSxcbiAgXG4gIH0pO1xuICBcbn1cblxuU2VxdWVuY2VyLnByb3RvdHlwZS5zdGFydCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmZzbS5zdGFydHVwKCk7XG59O1xuXG5TZXF1ZW5jZXIucHJvdG90eXBlLnRyYW5zaXRpb24gPSBmdW5jdGlvbih0cmFucywgYXJncykge1xuICB0aGlzLmZzbVt0cmFuc10oYXJncyk7XG59O1xuXG5TZXF1ZW5jZXIucHJvdG90eXBlLmFjdGl2ZSA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5hY3RpdmVTdGF0ZTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU2VxdWVuY2VyO1xuIiwidmFyIEVudGl0eSAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZW50aXR5JylcbnZhciBHRiAgICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2dyYXBoaWNzLWZhY3RvcnknKTtcbnZhciB1c2VySW50ZXJmYWNlID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL3VzZXItaW50ZXJmYWNlJyk7XG52YXIgYXNzZXRzICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2Fzc2V0cycpO1xuXG52YXIgZm9ybWF0QXNSYW5rID0gZnVuY3Rpb24obnVtKSB7XG4gIGlmIChudW0gPT09IDEpIHtcbiAgICByZXR1cm4gbnVtICsgJ3N0J1xuICB9IGVsc2UgaWYgKG51bSA9PT0gMikge1xuICAgIHJldHVybiBudW0gKyAnbmQnXG4gIH0gZWxzZSBpZiAobnVtID09PSAzKSB7XG4gICAgcmV0dXJuIG51bSArICdyZCdcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbnVtICsgJ3RoJ1xuICB9XG59XG5cbmZ1bmN0aW9uIExlYWRlcmJvYXJkKGlkKSB7XG4gIHZhciBEZWZhdWx0VGV4dE9wdGlvbnMgPSB7XG4gICAgc3Ryb2tlVGhpY2tuZXNzOiB1c2VySW50ZXJmYWNlLnVuaXQoMC40KSxcbiAgICBmaWxsOiAnIzAxNTE4ZCdcbiAgfVxuICB2YXIgRGVmYXVsdEZvbnRTaXplID0gdXNlckludGVyZmFjZS51bml0KDQpXG5cbiAgdGhpcy5pZCA9IGlkO1xuICB0aGlzLnBsYXllcnMgPSBbXVxuICBcbiAgJC5hamF4KHtcbiAgICB1cmw6ICcvcGxheWVyJyxcbiAgICBhc3luYzogZmFsc2UsXG4gICAgc3VjY2VzczogZnVuY3Rpb24oZGF0YSkge1xuICAgICAgdGhpcy5wbGF5ZXJzID0gZGF0YS5zb3J0KGZ1bmN0aW9uKHgseSkge1xuICAgICAgICByZXR1cm4geS50b3BTY29yZSAtIHgudG9wU2NvcmVcbiAgICAgIH0pLnNsaWNlKDAsIDUpXG4gICAgfS5iaW5kKHRoaXMpXG4gIH0pXG5cbiAgdGhpcy5zcHJpdGVzID0gW1xuICAgIEdGLnVpU3ByaXRlKGFzc2V0cy5pbWFnZSgnaW50cm8tbGVhZGVyYm9hcmQnKSwgdXNlckludGVyZmFjZS53aWR0aCwgdXNlckludGVyZmFjZS5oZWlnaHQpXG4gIF07XG5cbiAgdmFyIGN1cnJlbnRZID0gdXNlckludGVyZmFjZS51bml0KDE5LjQpXG4gIHZhciBpID0gMVxuXG4gIHRoaXMucGxheWVycy5mb3JFYWNoKGZ1bmN0aW9uKHBsYXllcikge1xuICAgIHZhciByYW5rU3ByaXRlID0gR0YudGV4dChmb3JtYXRBc1JhbmsoaSksIERlZmF1bHRGb250U2l6ZSwgRGVmYXVsdFRleHRPcHRpb25zKVxuICAgIHJhbmtTcHJpdGUucG9zaXRpb24ueSA9IGN1cnJlbnRZXG4gICAgcmFua1Nwcml0ZS5wb3NpdGlvbi54ID0gdXNlckludGVyZmFjZS51bml0KDUpXG4gICAgdGhpcy5zcHJpdGVzLnB1c2gocmFua1Nwcml0ZSlcblxuICAgIHZhciBwbGF5ZXJOYW1lU3ByaXRlID0gR0YudGV4dCgocGxheWVyLmZpcnN0TmFtZSArICcgJyArIHBsYXllci5sYXN0TmFtZS5zdWJzdHJpbmcoMCwgMSkpLnRvVXBwZXJDYXNlKCksIERlZmF1bHRGb250U2l6ZSwgJC5leHRlbmQoe30sIERlZmF1bHRUZXh0T3B0aW9ucywgeyBmaWxsOiAnI2JmMDAwMCcgfSkpXG4gICAgcGxheWVyTmFtZVNwcml0ZS5wb3NpdGlvbi54ID0gdXNlckludGVyZmFjZS51bml0KDE4KVxuICAgIHBsYXllck5hbWVTcHJpdGUucG9zaXRpb24ueSA9IGN1cnJlbnRZXG4gICAgdGhpcy5zcHJpdGVzLnB1c2gocGxheWVyTmFtZVNwcml0ZSlcblxuICAgIHZhciBjb21wYW55U3ByaXRlID0gR0YudGV4dCgocGxheWVyLmNvbXBhbnkgfHwgJycpLnRvVXBwZXJDYXNlKCksIHVzZXJJbnRlcmZhY2UudW5pdCgzKSwgJC5leHRlbmQoe30sIERlZmF1bHRUZXh0T3B0aW9ucywgeyBzdHJva2VUaGlja25lc3M6IHVzZXJJbnRlcmZhY2UudW5pdCgwLjQpIH0pKVxuICAgIGNvbXBhbnlTcHJpdGUucG9zaXRpb24ueCA9IHBsYXllck5hbWVTcHJpdGUucG9zaXRpb24ueCArIHBsYXllck5hbWVTcHJpdGUud2lkdGggKyB1c2VySW50ZXJmYWNlLnVuaXQoMilcbiAgICBjb21wYW55U3ByaXRlLnBvc2l0aW9uLnkgPSBjdXJyZW50WSArIHVzZXJJbnRlcmZhY2UudW5pdCgwLjYpXG4gICAgdGhpcy5zcHJpdGVzLnB1c2goY29tcGFueVNwcml0ZSlcblxuICAgIHZhciBzY29yZVNwcml0ZSA9IEdGLnRleHQocGxheWVyLnRvcFNjb3JlICsgJyBHT0FMUycsIERlZmF1bHRGb250U2l6ZSwgRGVmYXVsdFRleHRPcHRpb25zKVxuICAgIHNjb3JlU3ByaXRlLnBvc2l0aW9uLnggPSB1c2VySW50ZXJmYWNlLndpZHRoIC0gc2NvcmVTcHJpdGUud2lkdGggLSB1c2VySW50ZXJmYWNlLnVuaXQoNSlcbiAgICBzY29yZVNwcml0ZS5wb3NpdGlvbi55ID0gY3VycmVudFlcbiAgICB0aGlzLnNwcml0ZXMucHVzaChzY29yZVNwcml0ZSlcbiAgICBcbiAgICBjdXJyZW50WSArPSBwbGF5ZXJOYW1lU3ByaXRlLmhlaWdodCArIHVzZXJJbnRlcmZhY2UudW5pdCgyLjMpO1xuICAgIGkgKz0gMVxuICB9LmJpbmQodGhpcykpXG59XG5cbkxlYWRlcmJvYXJkLnByb3RvdHlwZSA9IG5ldyBFbnRpdHkoKTtcblxuTGVhZGVyYm9hcmQucHJvdG90eXBlLmNyZWF0ZSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSkge1xuICB0aGlzLnNwcml0ZXMuZm9yRWFjaChmdW5jdGlvbihzcHJpdGUpIHtcbiAgICBlbmdpbmUuZ3JhcGhpY3MuYWRkKHNwcml0ZSk7XG4gIH0pXG59O1xuXG5MZWFkZXJib2FyZC5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSkge1xuICB0aGlzLnNwcml0ZXMuZm9yRWFjaChmdW5jdGlvbihzcHJpdGUpIHtcbiAgICBlbmdpbmUuZ3JhcGhpY3MucmVtb3ZlKHNwcml0ZSk7XG4gIH0pXG59O1xuXG5MZWFkZXJib2FyZC5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24oKSB7fVxuXG5tb2R1bGUuZXhwb3J0cyA9IExlYWRlcmJvYXJkIiwidmFyIEVudGl0eSAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZW50aXR5JylcbnZhciBHRiAgICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2dyYXBoaWNzLWZhY3RvcnknKTtcbnZhciB1c2VySW50ZXJmYWNlID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL3VzZXItaW50ZXJmYWNlJyk7XG52YXIgYXNzZXRzICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2Fzc2V0cycpO1xuXG5mdW5jdGlvbiBUaXRsZShpZCkge1xuICBcbiAgdGhpcy5pZCA9IGlkO1xuICB0aGlzLnNwcml0ZSA9IEdGLnVpU3ByaXRlKGFzc2V0cy5pbWFnZSgnaW50cm8tdGl0bGUnKSwgdXNlckludGVyZmFjZS53aWR0aCwgdXNlckludGVyZmFjZS5oZWlnaHQpO1xuXG59O1xuXG5UaXRsZS5wcm90b3R5cGUgPSBuZXcgRW50aXR5KCk7XG5cbm1vZHVsZS5leHBvcnRzID0gVGl0bGU7XG4iLCJ2YXIgRW50aXR5ICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9lbnRpdHknKVxudmFyIEdGICAgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZ3JhcGhpY3MtZmFjdG9yeScpO1xudmFyIHVzZXJJbnRlcmZhY2UgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvdXNlci1pbnRlcmZhY2UnKTtcbnZhciBhc3NldHMgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vYXNzZXRzJyk7XG5cbnZhciBSRUQgID0gJyNiZjAwMDAnO1xudmFyIEJMVUUgPSAnIzAxNTE4ZCc7XG5cbmZ1bmN0aW9uIEFib3V0KGlkKSB7XG4gIFxuICB0aGlzLmlkID0gaWQ7XG5cbiAgY29uc29sZS5sb2codXNlckludGVyZmFjZS51bml0KDEpKTtcbiAgdGhpcy5zcHJpdGVzID0gW1xuICAgIEdGLnVpU3ByaXRlKGFzc2V0cy5pbWFnZSgnaW50cm8tYWJvdXQnKSwgdXNlckludGVyZmFjZS53aWR0aCwgdXNlckludGVyZmFjZS5oZWlnaHQpLFxuICAgIHRleHQoJ0J1aWx0IGluIDQgd2Vla3MgIChhZnRlciBob3VycyknLCBCTFVFLCA3LCAxMy41KSxcbiAgICB0ZXh0KCdKYXZhc2NyaXB0JywgUkVELCA3LCAyNi41KSxcbiAgICB0ZXh0KCdXZWJHTCcsIEJMVUUsIDMzLCAyNi41KSxcbiAgICB0ZXh0KCdOb2RlLmpzJywgUkVELCA0OSwgMjYuNSksXG4gICAgdGV4dCgnV2ViIHNvY2tldHMnLCBCTFVFLCA2OCwgMjYuNSksXG4gICAgdGV4dCgnQXNrIHVzIGFib3V0JywgQkxVRSwgNywgMzkuNSksXG4gICAgdGV4dCgnd2ViJywgUkVELCAzNCwgMzkuNSksXG4gICAgdGV4dCgnJicsIEJMVUUsIDQ0LCAzOS41KSxcbiAgICB0ZXh0KCdtb2JpbGUnLCBSRUQsIDQ5LCAzOS41KSxcbiAgICB0ZXh0KCchJywgQkxVRSwgNjQsIDM5LjUpXG4gIF07XG5cbn07XG5cbkFib3V0LnByb3RvdHlwZSA9IG5ldyBFbnRpdHkoKTtcblxuQWJvdXQucHJvdG90eXBlLmNyZWF0ZSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSkge1xuICB0aGlzLnNwcml0ZXMuZm9yRWFjaChmdW5jdGlvbihzcHJpdGUpIHtcbiAgICBlbmdpbmUuZ3JhcGhpY3MuYWRkKHNwcml0ZSk7XG4gIH0pXG59O1xuXG5BYm91dC5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSkge1xuICB0aGlzLnNwcml0ZXMuZm9yRWFjaChmdW5jdGlvbihzcHJpdGUpIHtcbiAgICBlbmdpbmUuZ3JhcGhpY3MucmVtb3ZlKHNwcml0ZSk7XG4gIH0pXG59O1xuXG5mdW5jdGlvbiB0ZXh0KHN0ciwgY29sb3IsIHgsIHkpIHtcbiAgdmFyIHNwcml0ZSA9IEdGLnRleHQoc3RyLCB1c2VySW50ZXJmYWNlLnVuaXQoMy44KSwge1xuICAgIGZpbGw6IGNvbG9yLFxuICAgIHN0cm9rZVRoaWNrbmVzczogdXNlckludGVyZmFjZS51bml0KDAuNClcbiAgfSk7XG4gIHNwcml0ZS5wb3NpdGlvbi54ID0gdXNlckludGVyZmFjZS51bml0KHgpO1xuICBzcHJpdGUucG9zaXRpb24ueSA9IHVzZXJJbnRlcmZhY2UudW5pdCh5KTtcbiAgcmV0dXJuIHNwcml0ZTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBBYm91dDtcbiIsInZhciBQRiAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9waHlzaWNzLWZhY3RvcnknKTtcbnZhciBHRiAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9ncmFwaGljcy1mYWN0b3J5Jyk7XG52YXIgRW50aXR5ICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZW50aXR5Jyk7XG52YXIgd29ybGQgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvd29ybGQnKTtcbnZhciBtYXRoVXRpbHMgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9tYXRoLXV0aWxzJyk7XG52YXIgaHViICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvaHViJyk7XG52YXIgTWF0aFV0aWxzICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvbWF0aC11dGlscycpXG52YXIgYXNzZXRzICAgICAgPSByZXF1aXJlKCcuLi8uLi9hc3NldHMnKTtcblxudmFyIGJhbGxTaXplID0gMjtcblxudmFyIGZpeHR1cmUgPSBQRi5maXh0dXJlKHtcbiAgc2hhcGU6ICAgICAgUEYuc2hhcGUuY2lyY2xlKGJhbGxTaXplIC8gMiksXG4gIGR5bmFtaWNzOiAgIHtkZW5zaXR5OiAxLCBmcmljdGlvbjogMSwgcmVzdGl0dXRpb246IDF9LFxuICBjYXRlZ29yeTogICBQRi5jYXRlZ29yaWVzLkJBTEwsXG4gIGNvbGxpc2lvbjogIFBGLmNhdGVnb3JpZXMuQVJFTkEgfCBQRi5jYXRlZ29yaWVzLlBMQVlFUiB8IFBGLmNhdGVnb3JpZXMuQkFMTFxufSk7XG5cbmZ1bmN0aW9uIEJhbGwoaWQsIHgsIHkpIHtcbiAgdGhpcy5pZCA9IGlkO1xuXG4gIHRoaXMuYm9keVNwZWMgPSB7XG4gICAgYm9keTogUEYuZHluYW1pYyh7eDogeCwgeTogeX0pLFxuICAgIGZpeHR1cmU6IGZpeHR1cmVcbiAgfTtcblxuICB0aGlzLnNwcml0ZSA9IEdGLnNwcml0ZShhc3NldHMuaW1hZ2UoJ2JhbGwnKSwgYmFsbFNpemUsIGJhbGxTaXplKTtcbn07XG5cbkJhbGwucHJvdG90eXBlID0gbmV3IEVudGl0eSgpO1xuXG5CYWxsLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUsIGRlbHRhKSB7ICBcbiAgRW50aXR5LnByb3RvdHlwZS51cGRhdGUuY2FsbCh0aGlzLCBkZWx0YSk7XG4gIG1hdGhVdGlscy5jbGFtcFhWZWxvY2l0eSh0aGlzLmJvZHksIDI4LCAzOCk7XG4gIG1hdGhVdGlscy5jbGFtcFlWZWxvY2l0eSh0aGlzLmJvZHksIDE1LCAyMyk7XG4gIHRoaXMuYm9keS5TZXRBbmd1bGFyRGFtcGluZygxLjUpO1xuICBcbiAgLy8gV2Ugc2hvdWxkIGJlIGFibGUgdG8gc3BlY2lmeSBcIjAuNVwiLCBhbmQgbm90IGhhdmUgdG8gdXBkYXRlIGl0IGNvbnN0YW50bHlcbiAgLy8gTmVlZCB0byBjaGVjayBvdXIgY2hhbmdlcyB0byBQSVhJXG4gIHRoaXMuc3ByaXRlLmFuY2hvci54ID0gdGhpcy5zcHJpdGUudGV4dHVyZS53aWR0aCAgLyAyO1xuICB0aGlzLnNwcml0ZS5hbmNob3IueSA9IHRoaXMuc3ByaXRlLnRleHR1cmUuaGVpZ2h0IC8gMjtcbn07XG5cbkJhbGwucHJvdG90eXBlLmtpY2sgPSBmdW5jdGlvbihkaXJlY3Rpb24pIHtcbiAgdGhpcy5ib2R5LlNldEF3YWtlKHRydWUpO1xuICB0aGlzLmJvZHkuU2V0TGluZWFyVmVsb2NpdHkobmV3IEJveDJELkNvbW1vbi5NYXRoLmIyVmVjMigyNSAqIGRpcmVjdGlvbiwgTWF0aFV0aWxzLnJhbmRvbUJldHdlZW4oMSwgNikpKTtcbiAgdGhpcy5ib2R5LlNldEFuZ3VsYXJWZWxvY2l0eShNYXRoVXRpbHMucmFuZG9tQmV0d2Vlbig0LCAxMCkpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEJhbGw7XG4iLCJ2YXIgR0YgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZ3JhcGhpY3MtZmFjdG9yeScpO1xudmFyIEVudGl0eSA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9lbnRpdHknKTtcbnZhciB1c2VySW50ZXJmYWNlID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL3VzZXItaW50ZXJmYWNlJyk7XG5cbmZ1bmN0aW9uIEFjdGlvblRleHQoaWQsIHRleHQpIHtcbiAgXG4gIHRoaXMuaWQgPSBpZDtcbiAgdGhpcy5zcHJpdGUgPSBHRi50ZXh0KHRleHQsIDY1LCB7XG4gICAgc3Ryb2tlVGhpY2tuZXNzOiA0XG4gIH0pO1xuICBcbiAgdGhpcy5zcHJpdGUucG9zaXRpb24ueCA9IHVzZXJJbnRlcmZhY2Uud2lkdGggIC8gMiAtIHRoaXMuc3ByaXRlLndpZHRoICAvIDI7XG4gIHRoaXMuc3ByaXRlLnBvc2l0aW9uLnkgPSB1c2VySW50ZXJmYWNlLmhlaWdodCAvIDIgLSB0aGlzLnNwcml0ZS5oZWlnaHQgLyAyO1xuICBcbn07XG5cbkFjdGlvblRleHQucHJvdG90eXBlID0gbmV3IEVudGl0eSgpO1xuXG5BY3Rpb25UZXh0LnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbih0ZXh0KSB7XG4gIHRoaXMuc3ByaXRlLnNldFRleHQodGV4dCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEFjdGlvblRleHQ7XG4iLCIvLyByZXNldCBwbGF5ZXJzIHBvc1xuLy8gY2FuIG1vdmUsIGJ1dCBubyBiYWxsXG5cbnZhciBHRiAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9ncmFwaGljcy1mYWN0b3J5Jyk7XG52YXIgU3RhZGl1bSAgICAgPSByZXF1aXJlKCcuLi9lbnRpdGllcy9zdGFkaXVtJyk7XG52YXIgQ3Jvd2QgICAgICAgPSByZXF1aXJlKCcuLi9lbnRpdGllcy9jcm93ZCcpO1xudmFyIFBsYXllciAgICAgID0gcmVxdWlyZSgnLi4vZW50aXRpZXMvcGxheWVyJyk7XG52YXIgSHVkICAgICAgICAgPSByZXF1aXJlKCcuLi9lbnRpdGllcy9odWQnKTtcbnZhciBBY3Rpb25UZXh0ICA9IHJlcXVpcmUoJy4uL2VudGl0aWVzL2FjdGlvbi10ZXh0Jyk7XG52YXIgd29ybGQgICAgICAgPSByZXF1aXJlKCcuLi93b3JsZCcpO1xuXG5mdW5jdGlvbiBXYXJtVXAoZW5naW5lLCBnYW1lKSB7XG5cbiAgdmFyIHN0YXJ0aW5nUG9zID0gW1xuICAgIHdvcmxkLndpZHRoIC8gOCxcbiAgICB3b3JsZC53aWR0aCAtIHdvcmxkLndpZHRoIC8gOFxuICBdO1xuICBcbiAgdGhpcy5lbnRlciA9IGZ1bmN0aW9uKCkge1xuXG4gICAgdmFyIHAxID0gbmV3IFBsYXllcigncDEnLCAwLCBnYW1lLnBsYXllcnNbMF0ubmFtZSwgc3RhcnRpbmdQb3NbMF0sIHdvcmxkLmhlaWdodCAvIDIpO1xuICAgIHZhciBwMiA9IG5ldyBQbGF5ZXIoJ3AyJywgMSwgZ2FtZS5wbGF5ZXJzWzFdLm5hbWUsIHN0YXJ0aW5nUG9zWzFdLCB3b3JsZC5oZWlnaHQgLyAyKTtcbiAgICBcbiAgICBlbmdpbmUuYWRkRW50aXR5KG5ldyBTdGFkaXVtKCkpO1xuICAgIGVuZ2luZS5hZGRFbnRpdHkobmV3IENyb3dkKCkpO1xuICAgIGVuZ2luZS5hZGRFbnRpdHkocDEpO1xuICAgIGVuZ2luZS5hZGRFbnRpdHkocDIpO1xuICAgIGVuZ2luZS5hZGRFbnRpdHkobmV3IEh1ZCgpKTtcbiAgICBlbmdpbmUuYWRkRW50aXR5KG5ldyBBY3Rpb25UZXh0KCdnZXQtcmVhZHknLCAnR0VUIFJFQURZIScpKTtcblxuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICBnYW1lLnRyYW5zaXRpb24oJ3JlYWR5JywgMCk7XG4gICAgfSwgMjAwMCk7ICAgIFxuXG4gIH07XG4gIFxuICB0aGlzLmV4aXQgPSBmdW5jdGlvbigpIHtcbiAgICBlbmdpbmUuZGVsZXRlRW50aXR5KCdnZXQtcmVhZHknKTtcbiAgfTtcbiAgXG4gIHRoaXMudXBkYXRlID0gZnVuY3Rpb24oZGVsdGEpIHtcbiAgfTtcbiAgXG4gIHRoaXMub24gPSBmdW5jdGlvbihtZXNzYWdlLCBhcmdzKSB7XG4gIH07XG4gIFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFdhcm1VcDtcbiIsInZhciBfICAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uLy4uLy4uLzNyZHBhcnR5L3VuZGVyc2NvcmUtbWluJyk7XG52YXIgR0YgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZ3JhcGhpY3MtZmFjdG9yeScpO1xudmFyIGh1YiAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2h1YicpO1xudmFyIEJhbGwgICAgICAgID0gcmVxdWlyZSgnLi4vZW50aXRpZXMvYmFsbCcpO1xudmFyIEFjdGlvblRleHQgID0gcmVxdWlyZSgnLi4vZW50aXRpZXMvYWN0aW9uLXRleHQnKTtcbnZhciB3b3JsZCAgICAgICA9IHJlcXVpcmUoJy4uL3dvcmxkJyk7XG5cbmZ1bmN0aW9uIEtpY2tPZmYoZW5naW5lLCBnYW1lKSB7XG4gIHZhciB0ZXh0ID0gbnVsbDtcbiAgdmFyIGZpcnN0QmFsbCA9IG51bGxcbiAgdmFyIGJhbGxEaXJlY3Rpb24gPSBudWxsXG4gIFxuICB0aGlzLmVudGVyID0gZnVuY3Rpb24obGFzdFNjb3JpbmdQbGF5ZXJJZCkge1xuICAgIHZhciBwaXRjaFBvc2l0aW9uID0gKGxhc3RTY29yaW5nUGxheWVySWQgPT09IDApID8gLTEgOiAxXG4gICAgYmFsbERpcmVjdGlvbiA9IHBpdGNoUG9zaXRpb24gKiAtMVxuICAgIGdhbWUuY2xlYXJCYWxscygpXG4gICAgZmlyc3RCYWxsID0gZ2FtZS5jcmVhdGVCYWxsKHBpdGNoUG9zaXRpb24sIDApXG5cbiAgICB0ZXh0ID0gbmV3IEFjdGlvblRleHQoJ2NvdW50ZG93bicsICcnKTtcbiAgICBlbmdpbmUuYWRkRW50aXR5KHRleHQpO1xuICAgIGNvdW50ZG93bigzKTtcbiAgfTtcbiAgXG4gIHRoaXMuZXhpdCA9IGZ1bmN0aW9uKCkge1xuICB9O1xuICBcbiAgdGhpcy51cGRhdGUgPSBmdW5jdGlvbihkZWx0YSkge1xuICB9O1xuICBcbiAgdGhpcy5vbiA9IGZ1bmN0aW9uKG1lc3NhZ2UsIGFyZ3MpIHtcbiAgfTtcbiAgXG4gIGZ1bmN0aW9uIGNvdW50ZG93bih2YWwpIHtcbiAgICBpZiAodmFsID09IDApIHtcbiAgICAgIGdvKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRleHQuc2V0KHZhbC50b1N0cmluZygpKTtcbiAgICAgIHNldFRpbWVvdXQoXy5wYXJ0aWFsKGNvdW50ZG93biwgLS12YWwpLCA2MDApO1xuICAgIH1cbiAgfVxuICBcbiAgZnVuY3Rpb24gZ28oKSB7XG4gICAgaHViLnNlbmQoJ2VuZ2luZS5zb3VuZC5wbGF5Jywge2ZpbGU6ICcvZ2FtZS9zb3VuZHMvd2hpc3RsZS5tcDMnfSk7XG4gICAgZW5naW5lLmRlbGV0ZUVudGl0eSgnY291bnRkb3duJyk7XG5cbiAgICBmaXJzdEJhbGwua2ljayhiYWxsRGlyZWN0aW9uKVxuICAgIGdhbWUudHJhbnNpdGlvbignZ28nKTtcbiAgfVxuICBcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBLaWNrT2ZmO1xuIiwidmFyIFRpbWVCYXNlZE1lc3NhZ2UgID0gcmVxdWlyZSgnLi4vdGltZS1iYXNlZC1tZXNzYWdlJyk7XG52YXIgbWF0aFV0aWxzICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvbWF0aC11dGlscycpO1xuXG5mdW5jdGlvbiBQbGF5KGVuZ2luZSwgZ2FtZSkge1xuICBcbiAgdmFyIG11bHRpQmFsbCAgICAgICA9IG5ldyBUaW1lQmFzZWRNZXNzYWdlKDE1MDAwLCAnZ2FtZS5tdWx0aWJhbGwnKTtcbiAgdmFyIGVuZE9mTWF0Y2ggICAgICA9IG5ldyBUaW1lQmFzZWRNZXNzYWdlKDAsICdnYW1lLmVuZCcpO1xuICBcbiAgdGhpcy5lbnRlciA9IGZ1bmN0aW9uKCkge1xuICB9O1xuICBcbiAgdGhpcy5leGl0ID0gZnVuY3Rpb24oKSB7XG4gIH07XG4gIFxuICB0aGlzLnVwZGF0ZSA9IGZ1bmN0aW9uKGRlbHRhKSB7XG4gICAgZ2FtZS50aW1lUmVtYWluaW5nID0gTWF0aC5tYXgoZ2FtZS50aW1lUmVtYWluaW5nIC0gZGVsdGEsIDApO1xuICAgIG11bHRpQmFsbC51cGRhdGUoZ2FtZS50aW1lUmVtYWluaW5nKTtcbiAgICBlbmRPZk1hdGNoLnVwZGF0ZShnYW1lLnRpbWVSZW1haW5pbmcpO1xuICB9O1xuICBcbiAgdGhpcy5vbiA9IGZ1bmN0aW9uKG1lc3NhZ2UsIGFyZ3MpIHtcbiAgfTtcbiAgXG59XG5cbm1vZHVsZS5leHBvcnRzID0gUGxheTtcbiIsInZhciBCb29tICAgICAgID0gcmVxdWlyZSgnLi4vZW50aXRpZXMvYm9vbScpO1xudmFyIEFjdGlvblRleHQgPSByZXF1aXJlKCcuLi9lbnRpdGllcy9hY3Rpb24tdGV4dCcpO1xudmFyIGh1YiAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvaHViJyk7XG5cbmZ1bmN0aW9uIFNjb3JlZChlbmdpbmUsIGdhbWUpIHtcbiAgXG4gIHRoaXMuZW50ZXIgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgZW5naW5lLmdldEVudGl0eSgnc3RhZGl1bScpLnNoYWtlKGRhdGEuYWdhaW5zdEluZGV4KTtcbiAgICBlbmdpbmUuYWRkRW50aXR5KG5ldyBCb29tKCdib29tJyArIGRhdGEuYmFsbC5pZCwgZGF0YS5hZ2FpbnN0SW5kZXgpKTtcbiAgICBnYW1lLnJlbW92ZUJhbGwoZGF0YS5iYWxsKTtcbiAgICBcbiAgICBpZiAoZ2FtZS5iYWxsc0luUGxheS5sZW5ndGggPj0gMSkge1xuICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgZ2FtZS50cmFuc2l0aW9uKCdnbycpO1xuICAgICAgfSwgMSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgIGdhbWUudHJhbnNpdGlvbigncmVhZHknLCBkYXRhLmFnYWluc3RJbmRleCk7XG4gICAgICB9LCAxKTtcbiAgICB9XG4gICAgXG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgIGVuZ2luZS5kZWxldGVFbnRpdHkoJ2Jvb20nICsgZGF0YS5iYWxsLmlkKTtcbiAgICB9LCA0MDApO1xuICB9O1xuICBcbiAgdGhpcy5leGl0ID0gZnVuY3Rpb24oKSB7XG4gIH07XG4gIFxuICB0aGlzLnVwZGF0ZSA9IGZ1bmN0aW9uKGRlbHRhKSB7XG4gIH07XG4gIFxuICB0aGlzLm9uID0gZnVuY3Rpb24obWVzc2FnZSwgYXJncykge1xuICB9O1xuICBcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBTY29yZWQ7XG4iLCJ2YXIgV2lubmVyICA9IHJlcXVpcmUoJy4uL2VudGl0aWVzL3dpbm5lcicpO1xudmFyIGh1YiAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvaHViJyk7XG5cbmZ1bmN0aW9uIEVuZE9mTWF0Y2goZW5naW5lLCBnYW1lKSB7XG4gIFxuICB0aGlzLmVudGVyID0gZnVuY3Rpb24oKSB7XG4gICAgZW5naW5lLmRlbGV0ZUVudGl0eU1hdGNoaW5nKC9eYmFsbDovKTtcbiAgICBlbmdpbmUuYWRkRW50aXR5KG5ldyBXaW5uZXIoJ3dpbm5lcicsIGdhbWUucGxheWVyc1swXSwgZ2FtZS5wbGF5ZXJzWzFdKSk7XG4gICAgc2V0VGltZW91dChmaW5pc2gsIDQwMDApO1xuICB9O1xuICBcbiAgdGhpcy5leGl0ID0gZnVuY3Rpb24oKSB7XG4gIH07XG4gIFxuICB0aGlzLnVwZGF0ZSA9IGZ1bmN0aW9uKGRlbHRhKSB7XG4gIH07XG5cbiAgdGhpcy5vbiA9IGZ1bmN0aW9uKG1lc3NhZ2UsIGFyZ3MpIHtcbiAgfTtcbiAgXG4gIGZ1bmN0aW9uIGZpbmlzaCgpIHtcbiAgICBodWIuc2VuZCgnZ2FtZS5maW5pc2gnKTtcbiAgfVxuICBcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBFbmRPZk1hdGNoO1xuIiwiXG5leHBvcnRzLndpZHRoICA9IDA7XG5leHBvcnRzLmhlaWdodCA9IDA7XG5cbmV4cG9ydHMucmVzaXplID0gZnVuY3Rpb24odywgaCkge1xuICBleHBvcnRzLndpZHRoICA9IHc7XG4gIGV4cG9ydHMuaGVpZ2h0ID0gaDtcbn07XG5cbmV4cG9ydHMudW5pdCA9IGZ1bmN0aW9uKG4pIHtcbiAgcmV0dXJuIChleHBvcnRzLndpZHRoIC8gMTAwKSAqIG5cbn0iLCJcbnZhciBwaXhlbHNQZXJNZXRlciA9IDE2O1xuXG5leHBvcnRzLnRvUGl4ZWxzID0gZnVuY3Rpb24obWV0ZXJzKSB7XG4gIHJldHVybiBtZXRlcnMgKiBwaXhlbHNQZXJNZXRlcjtcbn07XG5cbmV4cG9ydHMuc2V0UGl4ZWxzUGVyTWV0ZXIgPSBmdW5jdGlvbih2YWwpIHtcbiAgcGl4ZWxzUGVyTWV0ZXIgPSB2YWw7XG59O1xuXG5leHBvcnRzLmdldFBpeGVsc1Blck1ldGVyID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBwaXhlbHNQZXJNZXRlcjtcbn07XG4iLCJcbnZhciBQSSA9IDMuMTQxNTk7XG5cbmV4cG9ydHMuUEkgPSBQSTtcblxuZXhwb3J0cy5jbGFtcFZlbG9jaXR5ID0gZnVuY3Rpb24oYm9keSwgbWluLCBtYXgpIHtcbiAgdmFyIHZlYyA9IGJvZHkuR2V0TGluZWFyVmVsb2NpdHkoKTtcbiAgaWYgKHZlYy54ICE9IDAgJiYgdmVjLnkgIT0gMCkge1xuICAgIGlmICh2ZWMuTGVuZ3RoKCkgPCBtaW4pIHtcbiAgICAgIHZlYy5Ob3JtYWxpemUoKTtcbiAgICAgIHZlYy5NdWx0aXBseShtaW4pO1xuICAgIH0gZWxzZSBpZiAodmVjLkxlbmd0aCgpID4gbWF4KSB7XG4gICAgICB2ZWMuTm9ybWFsaXplKClcbiAgICAgIHZlYy5NdWx0aXBseShtYXgpO1xuICAgIH1cbiAgfVxufTtcblxuZXhwb3J0cy5jbGFtcFhWZWxvY2l0eSA9IGZ1bmN0aW9uKGJvZHksIG1pbiwgbWF4KSB7XG4gIHZhciB2ZWMgPSBib2R5LkdldExpbmVhclZlbG9jaXR5KCk7XG4gIGlmICh2ZWMueCAhPSAwKSB7XG4gICAgdmVjLnggPSBleHBvcnRzLmNsYW1wV2l0aFNpZ24odmVjLngsIG1pbiwgbWF4KTtcbiAgfVxufTtcblxuZXhwb3J0cy5jbGFtcFlWZWxvY2l0eSA9IGZ1bmN0aW9uKGJvZHksIG1pbiwgbWF4KSB7XG4gIHZhciB2ZWMgPSBib2R5LkdldExpbmVhclZlbG9jaXR5KCk7XG4gIGlmICh2ZWMueSAhPSAwKSB7XG4gICAgdmVjLnkgPSBleHBvcnRzLmNsYW1wV2l0aFNpZ24odmVjLnksIG1pbiwgbWF4KTtcbiAgfVxufTtcblxuZXhwb3J0cy5jbGFtcFdpdGhTaWduID0gZnVuY3Rpb24odmFsLCBtaW4sIG1heCkge1xuICBpZiAodmFsID4gMCkge1xuICAgIHJldHVybiBleHBvcnRzLmNsYW1wKHZhbCwgbWluLCBtYXgpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBleHBvcnRzLmNsYW1wKHZhbCwgLW1heCwgLW1pbik7XG4gIH1cbn07XG5cbmV4cG9ydHMuY2xhbXAgPSBmdW5jdGlvbih2YWwsIG1pbiwgbWF4KSB7XG4gIHJldHVybiBNYXRoLm1pbihNYXRoLm1heCh2YWwsIG1pbiksIG1heCk7XG59O1xuXG5leHBvcnRzLnJhbmRvbUJldHdlZW4gPSBmdW5jdGlvbihtaW4sIG1heCkge1xuICByZXR1cm4gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKG1heC1taW4pKSArIG1pbjtcbn07XG5cbmV4cG9ydHMucmFuZG9tU2lnbiA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gTWF0aC5yYW5kb20oKSA8IDAuNSA/IC0xIDogMTtcbn07XG5cbmV4cG9ydHMuZGlzdGFuY2UgPSBmdW5jdGlvbihhLCBiKSB7XG4gIHJldHVybiBNYXRoLnNxcnQoKGIueCAtIGEueCkgKiAoYi54IC0gYS54KSArIChiLnkgLSBhLnkpICogKGIueSAtIGEueSkpO1xufTtcbiIsInZhciBfID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvdW5kZXJzY29yZS1taW4nKSxcbiAgRW50aXR5ID0gcmVxdWlyZSgnLi9lbnRpdHknKSxcbiAgV29ybGQgPSByZXF1aXJlKCcuL3dvcmxkJyksXG4gIGh1YiA9IHJlcXVpcmUoJy4vaHViJyksXG4gIG1hdGhVdGlscyA9IHJlcXVpcmUoJy4vbWF0aC11dGlscycpXG5cbnZhciBNX1BJID0gTWF0aC5QSVxudmFyIE1fUElfMiA9IE1fUEkgLyAyXG5cbnZhciBwYXJ0aWNsZVRleHR1cmUgPSBQSVhJLlRleHR1cmUuZnJvbUltYWdlKCcvZ2FtZS9pbWFnZXMvcGFydGljbGUtYmFsbC5wbmcnKVxuXG52YXIgUGFydGljbGUgPSBmdW5jdGlvbigpIHtcbiAgUElYSS5TcHJpdGUuY2FsbCh0aGlzLCBwYXJ0aWNsZVRleHR1cmUpXG4gIHRoaXMuYW5jaG9yLnggPSAwLjVcbiAgdGhpcy5hbmNob3IueSA9IDAuNVxuICB0aGlzLnNwZWVkID0gbmV3IFBJWEkuUG9pbnRcbiAgdGhpcy5hY2NlbGVyYXRpb24gPSBuZXcgUElYSS5Qb2ludFxuICB0aGlzLndpZHRoID0gMTVcbiAgdGhpcy5oZWlnaHQgPSAxNVxufVxuUGFydGljbGUuY29uc3RydWN0b3IgPSBQYXJ0aWNsZVxuUGFydGljbGUucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShQSVhJLlNwcml0ZS5wcm90b3R5cGUpXG5cbnZhciByZXNldFBhcnRpY2xlID0gZnVuY3Rpb24ocGFydGljbGUpIHtcbiAgcGFydGljbGUuYWxwaGEgPSAxXG4gIHBhcnRpY2xlLnNjYWxlLnggPSAxXG4gIHBhcnRpY2xlLnNjYWxlLnkgPSAxXG4gIHBhcnRpY2xlLmRpcmVjdGlvbiA9IHtcbiAgICB4OiAobWF0aFV0aWxzLnJhbmRvbUJldHdlZW4oMCwgMjAwKSAtIDEwMCkgLyAxMDAsXG4gICAgeTogKG1hdGhVdGlscy5yYW5kb21CZXR3ZWVuKDAsIDIwMCkgLSAxMDApIC8gMTAwXG4gIH1cbiAgcGFydGljbGUuc3BlZWQueCA9IDEuMyArIE1hdGgucmFuZG9tKClcbiAgcGFydGljbGUuc3BlZWQueSA9IDEuMyArIE1hdGgucmFuZG9tKClcbiAgcGFydGljbGUuYWNjZWxlcmF0aW9uLnggPSAwLjc1ICsgTWF0aC5yYW5kb20oKVxuICBwYXJ0aWNsZS5hY2NlbGVyYXRpb24ueSA9IDAuNzUgKyBNYXRoLnJhbmRvbSgpXG4gIHBhcnRpY2xlLnBvc2l0aW9uLnggPSAwXG4gIHBhcnRpY2xlLnBvc2l0aW9uLnkgPSAwXG4gIHBhcnRpY2xlLnZpc2libGUgPSB0cnVlXG4gIHBhcnRpY2xlLnJvdGF0aW9uID0gMFxufVxuXG52YXIgUGFydGljbGVQb29sID0gZnVuY3Rpb24oc2l6ZSkge1xuICBjb25zb2xlLmxvZygnQ29uc3RydWN0aW5nIGEgcGFydGljbGUgcG9vbCB3aXRoICcgKyBzaXplICsgJyBwYXJ0aWNsZXMnKVxuICB0aGlzLnBvb2wgPSBbXVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDw9IHNpemU7IGkrKykge1xuICAgIHZhciBwYXJ0aWNsZSA9IG5ldyBQYXJ0aWNsZSgpXG4gICAgdGhpcy5wb29sLnB1c2goe1xuICAgICAgcGFydGljbGU6IHBhcnRpY2xlLFxuICAgICAgZnJlZTogdHJ1ZVxuICAgIH0pXG4gIH1cbn1cblxuUGFydGljbGVQb29sLnByb3RvdHlwZS5jbGFpbSA9IGZ1bmN0aW9uKGFtb3VudCkge1xuICB2YXIgcGFydGljbGVzID0gW11cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucG9vbC5sZW5ndGg7IGkrKykge1xuICAgIHZhciBlbnRyeSA9IHRoaXMucG9vbFtpXVxuXG4gICAgaWYgKGVudHJ5LmZyZWUpIHtcbiAgICAgIGlmICghZW50cnkucGFydGljbGUpIHtcbiAgICAgICAgdGhyb3cgJ1BhcnRpY2xlIGlzIG51bGwnXG4gICAgICB9XG5cbiAgICAgIGVudHJ5LmZyZWUgPSBmYWxzZVxuICAgICAgcGFydGljbGVzLnB1c2goZW50cnkucGFydGljbGUpXG4gICAgfVxuXG4gICAgaWYgKHBhcnRpY2xlcy5sZW5ndGggPT0gYW1vdW50KSB7XG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuXG4gIGlmIChwYXJ0aWNsZXMubGVuZ3RoIDwgYW1vdW50KSB7XG4gICAgdGhyb3cgJ05vdCBlbm91Z2ggcGFydGljbGVzIHRvIHNhdGlzZnkgcmVxdWVzdCdcbiAgfVxuXG4gIGNvbnNvbGUubG9nKCdDbGFpbWVkICcgKyBhbW91bnQgKyAnIHBhcnRpY2xlcycpXG5cbiAgcmV0dXJuIHBhcnRpY2xlc1xufVxuXG5QYXJ0aWNsZVBvb2wucHJvdG90eXBlLnJlbGVhc2UgPSBmdW5jdGlvbihwYXJ0aWNsZXMpIHtcbiAgcGFydGljbGVzLmZvckVhY2goZnVuY3Rpb24ocGFydGljbGUpIHtcbiAgICBpZiAocGFydGljbGUucGFyZW50KSB7XG4gICAgICBwYXJ0aWNsZS5wYXJlbnQucmVtb3ZlQ2hpbGQocGFydGljbGUpXG4gICAgfVxuICAgIHZhciBlbnRyeSA9IF8uZmluZFdoZXJlKHRoaXMucG9vbCwgeyBwYXJ0aWNsZTogcGFydGljbGUgfSlcbiAgICBlbnRyeS5mcmVlID0gdHJ1ZVxuICB9LmJpbmQodGhpcykpXG4gIC8vIGNvbnNvbGUubG9nKCdSZWxlYXNlZCAnICsgcGFydGljbGVzLmxlbmd0aCArICcgcGFydGljbGVzJylcbn1cblxudmFyIHBhcnRpY2xlUG9vbCA9IG5ldyBQYXJ0aWNsZVBvb2woNTAwMClcblxudmFyIEV4cGxvc2lvbiA9IGZ1bmN0aW9uKG9yaWdpbiwgcGFydGljbGVDb3VudCkge1xuICBFbnRpdHkuY2FsbCh0aGlzKVxuICB0aGlzLnNwcml0ZSA9IG5ldyBQSVhJLkRpc3BsYXlPYmplY3RDb250YWluZXIoKVxuICB0aGlzLnNwcml0ZS5wb3NpdGlvbi54ID0gV29ybGQudG9QaXhlbHMob3JpZ2luLngpXG4gIHRoaXMuc3ByaXRlLnBvc2l0aW9uLnkgPSBXb3JsZC50b1BpeGVscyhvcmlnaW4ueSlcbiAgdGhpcy50dGwgPSAwXG5cbiAgdGhpcy5wYXJ0aWNsZXMgPSB0aGlzLmFsaXZlUGFydGljbGVzID0gcGFydGljbGVQb29sLmNsYWltKHBhcnRpY2xlQ291bnQpXG4gIHRoaXMucGFydGljbGVzLmZvckVhY2goZnVuY3Rpb24ocGFydGljbGUpIHtcbiAgICByZXNldFBhcnRpY2xlKHBhcnRpY2xlKVxuICAgIHRoaXMuc3ByaXRlLmFkZENoaWxkKHBhcnRpY2xlKVxuICB9LmJpbmQodGhpcykpXG59XG5FeHBsb3Npb24ubGFyZ2UgPSBmdW5jdGlvbihvcmlnaW4pIHtcbiAgcmV0dXJuIG5ldyBFeHBsb3Npb24ob3JpZ2luLCA1MClcbn1cbkV4cGxvc2lvbi5zbWFsbCA9IGZ1bmN0aW9uKG9yaWdpbikge1xuICByZXR1cm4gbmV3IEV4cGxvc2lvbihvcmlnaW4sIG1hdGhVdGlscy5yYW5kb21CZXR3ZWVuKDksIDUxKSlcbn1cblxuRXhwbG9zaW9uLnByb3RvdHlwZSA9IG5ldyBFbnRpdHkoKVxuXG5FeHBsb3Npb24ucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKGRlbHRhKSB7XG4gIHRoaXMudHRsIC09IGRlbHRhXG5cbiAgdmFyIGN1cnJlbnRQYXJ0aWNsZXMgPSB0aGlzLmFsaXZlUGFydGljbGVzXG4gIGN1cnJlbnRQYXJ0aWNsZXMuZm9yRWFjaChmdW5jdGlvbihwYXJ0aWNsZSkge1xuICAgIGlmIChwYXJ0aWNsZS5wYXJlbnQpIHtcbiAgICAgIHBhcnRpY2xlLnBvc2l0aW9uLnggKz0gcGFydGljbGUuc3BlZWQueCAqIHBhcnRpY2xlLmRpcmVjdGlvbi54XG4gICAgICBwYXJ0aWNsZS5wb3NpdGlvbi55ICs9IHBhcnRpY2xlLnNwZWVkLnkgKiBwYXJ0aWNsZS5kaXJlY3Rpb24ueVxuICAgICAgcGFydGljbGUuc3BlZWQueCArPSBwYXJ0aWNsZS5hY2NlbGVyYXRpb24ueFxuICAgICAgcGFydGljbGUuc3BlZWQueSArPSBwYXJ0aWNsZS5hY2NlbGVyYXRpb24ueVxuXG4gICAgICB2YXIgdmVsb2NpdHkgPSBwYXJ0aWNsZS5zcGVlZFxuICAgICAgdmFyIGFuZ2xlID0gMFxuXG4gICAgICBpZiAodmVsb2NpdHkueCA9PT0gMCkge1xuICAgICAgICBhbmdsZSA9IHZlbG9jaXR5LnkgPiAwID8gMCA6IE1fUElcbiAgICAgIH0gZWxzZSBpZih2ZWxvY2l0eS55ID09PSAwKSB7XG4gICAgICAgIGFuZ2xlID0gdmVsb2NpdHkueCA+IDAgPyBNX1BJXzIgOiAzICogTV9QSV8yXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhbmdsZSA9IE1hdGguYXRhbih2ZWxvY2l0eS55IC8gdmVsb2NpdHkueCkgKyBNX1BJXzJcbiAgICAgIH0gICBcblxuICAgICAgaWYgKHZlbG9jaXR5LnggPiAwKSB7XG4gICAgICAgIGFuZ2xlICs9IE1fUElcbiAgICAgIH1cblxuICAgICAgcGFydGljbGUucm90YXRpb24gPSBhbmdsZVxuICAgICAgLy8gcGFydGljbGUuaGVpZ2h0ID0gOCAqIHBhcnRpY2xlLnNwZWVkLnlcblxuICAgICAgaWYgKG1hdGhVdGlscy5kaXN0YW5jZSh7IHg6IDAsIHk6IDAgfSwgcGFydGljbGUucG9zaXRpb24pID49IDMwMCkge1xuICAgICAgICBwYXJ0aWNsZS5hbHBoYSA9IDBcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgZGVhZFBhcnRpY2xlID0gIXBhcnRpY2xlLnBhcmVudFxuXG4gICAgaWYgKGRlYWRQYXJ0aWNsZSkge1xuICAgICAgY29uc29sZS5sb2coJ0RlYWQgcGFydGljbGUnKVxuICAgIH1cblxuICAgIGlmIChkZWFkUGFydGljbGUgfHwgcGFydGljbGUuYWxwaGEgPD0gKE1hdGgucmFuZG9tKCkgKiA1KSAvIDUwKSB7XG4gICAgICB0aGlzLmFsaXZlUGFydGljbGVzID0gXy53aXRob3V0KHRoaXMuYWxpdmVQYXJ0aWNsZXMsIHBhcnRpY2xlKVxuICAgICAgcGFydGljbGVQb29sLnJlbGVhc2UoW3BhcnRpY2xlXSlcbiAgICB9XG4gIH0uYmluZCh0aGlzKSlcblxuICBpZiAodGhpcy5hbGl2ZVBhcnRpY2xlcy5sZW5ndGggPT09IDApIHtcbiAgICBodWIuc2VuZCgnZW50aXR5OmRlc3Ryb3knLCB7XG4gICAgICBlbnRpdHk6IHRoaXNcbiAgICB9KVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gRXhwbG9zaW9uIiwidmFyIF8gPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS91bmRlcnNjb3JlLW1pbicpO1xudmFyIHdvcmxkID0gcmVxdWlyZSgnLi93b3JsZCcpO1xuXG52YXIgZ2xvYmFsQ291bnQgPSAwO1xuXG52YXIgRW50aXR5ID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuaWQgICAgID0gKCsrZ2xvYmFsQ291bnQpO1xuICB0aGlzLmJvZHkgICA9IG51bGxcbiAgdGhpcy5zcHJpdGUgPSBudWxsO1xufTtcblxuRW50aXR5LnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgaWYgKHRoaXMuYm9keVNwZWMpIHtcbiAgICB0aGlzLmJvZHlTcGVjLmZpeHR1cmUudXNlckRhdGEgPSB0aGlzO1xuICAgIHRoaXMuYm9keSA9IGVuZ2luZS5waHlzaWNzLmNyZWF0ZSh0aGlzLmJvZHlTcGVjLmJvZHksIHRoaXMuYm9keVNwZWMuZml4dHVyZSk7ICBcbiAgfVxuICBpZiAodGhpcy5zcHJpdGUpIHtcbiAgICBlbmdpbmUuZ3JhcGhpY3MuYWRkKHRoaXMuc3ByaXRlKTtcbiAgfVxufTtcblxuRW50aXR5LnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lKSB7XG4gIGlmICh0aGlzLmJvZHkpIHtcbiAgICBlbmdpbmUucGh5c2ljcy5kZXN0cm95KHRoaXMuYm9keSk7XG4gIH1cbiAgaWYgKHRoaXMuc3ByaXRlKSB7XG4gICAgZW5naW5lLmdyYXBoaWNzLnJlbW92ZSh0aGlzLnNwcml0ZSk7XG4gIH1cbn07XG5cbkVudGl0eS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lLCBkZWx0YSkge1xuICBpZiAodGhpcy5zcHJpdGUgJiYgdGhpcy5ib2R5KSB7XG4gICAgdGhpcy5zcHJpdGUucG9zaXRpb24ueCA9IHdvcmxkLnRvUGl4ZWxzKHRoaXMuYm9keS5HZXRQb3NpdGlvbigpLngpO1xuICAgIHRoaXMuc3ByaXRlLnBvc2l0aW9uLnkgPSB3b3JsZC50b1BpeGVscyh0aGlzLmJvZHkuR2V0UG9zaXRpb24oKS55KTtcbiAgICB0aGlzLnNwcml0ZS5yb3RhdGlvbiA9IHRoaXMuYm9keS5HZXRBbmdsZSgpO1xuICB9XG59O1xuXG5FbnRpdHkucHJvdG90eXBlLmNvbGxpc2lvbiA9IGZ1bmN0aW9uKG90aGVyLCBwb2ludHMpIHtcbiAgLy8gbm90aGluZ1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBFbnRpdHk7XG4iLCJ2YXIgXyA9IHJlcXVpcmUoJy4uLy4uLy4uLzNyZHBhcnR5L3VuZGVyc2NvcmUtbWluJyk7XG52YXIgd29ybGQgPSByZXF1aXJlKCcuL3dvcmxkJyk7XG5cbi8vXG4vLyBBbmNob3IgYWx3YXlzIHNlZW1zIHJlc2V0IGZvciBcIm5vcm1hbFwiIHNwcml0ZXNcbi8vIEJ1dCBPSyBmb3IgdGlsaW5nLi4uIG1heWJlIGR1ZSB0byB0aGlzP1xuLy9cbi8vIDFmM2RlZTljNGExYzcxYmVkOWNkMTBjNGEyZTg2ZmJiYjM1ZjFiYmZcbi8vIDE4IE1heSAyMDEzIDExOjU2OjM5IFBNXG4vLyBQYXRjaCBQaXhpIHRvIGFsbG93IHNwZWNpZnlpbmcgYSBjZW50cmFsIGFuY2hvciBmb3IgdGlsaW5nIHNwcml0ZXNcbi8vIFxuXG5leHBvcnRzLnNwcml0ZSA9IGZ1bmN0aW9uKGltYWdlLCB3aWR0aCwgaGVpZ2h0LCByb3RhdGlvbikge1xuICB2YXIgc3ByaXRlID0gUElYSS5TcHJpdGUuZnJvbUltYWdlKGltYWdlKTtcbiAgaW5pdChzcHJpdGUsIHdpZHRoLCBoZWlnaHQsIHJvdGF0aW9uKTtcbiAgc3ByaXRlLmFuY2hvci54ID0gMC41O1xuICBzcHJpdGUuYW5jaG9yLnkgPSAwLjU7XG4gIC8vY29uc29sZS5sb2coJ2FuY2hvciA9ICcsIHNwcml0ZS5hbmNob3IpXG4gIHJldHVybiBzcHJpdGU7XG59O1xuXG5leHBvcnRzLnVpU3ByaXRlID0gZnVuY3Rpb24oaW1hZ2UsIHdpZHRoLCBoZWlnaHQsIHJvdGF0aW9uKSB7XG4gIHZhciBzcHJpdGUgPSBQSVhJLlNwcml0ZS5mcm9tSW1hZ2UoaW1hZ2UpO1xuICBzcHJpdGUud2lkdGggPSB3aWR0aDsgIFxuICBzcHJpdGUuaGVpZ2h0ID0gaGVpZ2h0O1xuICBzcHJpdGUucG9zaXRpb24ueCA9IDA7XG4gIHNwcml0ZS5wb3NpdGlvbi55ID0gMDtcbiAgc3ByaXRlLmFuY2hvci54ID0gMC41O1xuICBzcHJpdGUuYW5jaG9yLnkgPSAwLjU7XG4gIHNwcml0ZS5yb3RhdGlvbiA9IHJvdGF0aW9uIHx8IDA7XG4gIHJldHVybiBzcHJpdGU7XG59O1xuXG5leHBvcnRzLnRpbGUgPSBmdW5jdGlvbihpbWFnZSwgd2lkdGgsIGhlaWdodCwgcm90YXRpb24pIHtcbiAgdmFyIHRleHR1cmUgPSBQSVhJLlRleHR1cmUuZnJvbUltYWdlKGltYWdlKTtcbiAgdmFyIHNwcml0ZSA9IG5ldyBQSVhJLlRpbGluZ1Nwcml0ZSh0ZXh0dXJlKTtcbiAgc3ByaXRlLnRpbGVTY2FsZSA9IG5ldyBQSVhJLlBvaW50KDEsMSk7XG4gIGluaXQoc3ByaXRlLCB3aWR0aCwgaGVpZ2h0LCByb3RhdGlvbik7XG4gIHNwcml0ZS5hbmNob3IueCA9IHNwcml0ZS53aWR0aCAgLyAyO1xuICBzcHJpdGUuYW5jaG9yLnkgPSBzcHJpdGUuaGVpZ2h0IC8gMjtcbiAgLy9jb25zb2xlLmxvZygnYW5jaG9yID0gJywgc3ByaXRlLmFuY2hvcilcbiAgcmV0dXJuIHNwcml0ZTtcbn07XG5cbmV4cG9ydHMudGV4dCA9IGZ1bmN0aW9uKHRleHQsIHNpemUsIG9wdHMpIHtcbiAgb3B0cyA9IF8uZXh0ZW5kKHtcbiAgICAgIGZvbnQ6ICcnICsgKHNpemUgfHwgNTApICsgJ3B4IEx1Y2tpZXN0R3V5JyxcbiAgICAgIGZpbGw6ICcjMDAwJyxcbiAgICAgIGFsaWduOiAnbGVmdCcsXG4gICAgICBzdHJva2U6ICcjZmZmJyxcbiAgICAgIHN0cm9rZVRoaWNrbmVzczogMVxuICB9LCBvcHRzKTtcbiAgdmFyIHRleHQgPSBuZXcgUElYSS5UZXh0KHRleHQsIG9wdHMpO1xuICB0ZXh0LmFuY2hvci54ID0gMC41O1xuICByZXR1cm4gdGV4dDtcbn07XG5cbmV4cG9ydHMuYW5pbWF0aW9uID0gZnVuY3Rpb24oaW1hZ2VzLCB3aWR0aCwgaGVpZ2h0KSB7XG4gIHZhciB0ZXh0dXJlcyA9IGltYWdlcy5tYXAoZnVuY3Rpb24oaSkge1xuICAgIHJldHVybiBQSVhJLlRleHR1cmUuZnJvbUltYWdlKGkpO1xuICB9KTtcbiAgdmFyIGFuaW0gPSBuZXcgUElYSS5Nb3ZpZUNsaXAodGV4dHVyZXMpO1xuICBpbml0KGFuaW0sIHdpZHRoLCBoZWlnaHQsIDApO1xuICByZXR1cm4gYW5pbTtcbn07XG5cbmZ1bmN0aW9uIGluaXQoc3ByaXRlLCB3aWR0aCwgaGVpZ2h0LCByb3RhdGlvbikge1xuICBzcHJpdGUud2lkdGggPSB3b3JsZC50b1BpeGVscyh3aWR0aCk7ICBcbiAgc3ByaXRlLmhlaWdodCA9IHdvcmxkLnRvUGl4ZWxzKGhlaWdodCk7XG4gIHNwcml0ZS5wb3NpdGlvbi54ID0gMDtcbiAgc3ByaXRlLnBvc2l0aW9uLnkgPSAwO1xuICBzcHJpdGUucm90YXRpb24gPSByb3RhdGlvbiB8fCAwO1xufVxuIiwidmFyIF8gPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS91bmRlcnNjb3JlLW1pbicpO1xuXG5leHBvcnRzLnN0YXRpYyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgcmV0dXJuIGJvZHlEZWYoQm94MkQuRHluYW1pY3MuYjJCb2R5LmIyX3N0YXRpY0JvZHksIG9wdGlvbnMpO1xufTtcblxuZXhwb3J0cy5keW5hbWljID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICByZXR1cm4gYm9keURlZihCb3gyRC5EeW5hbWljcy5iMkJvZHkuYjJfZHluYW1pY0JvZHksIG9wdGlvbnMpO1xufTtcblxuZXhwb3J0cy5maXh0dXJlID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICB2YXIgZml4RGVmID0gbmV3IEJveDJELkR5bmFtaWNzLmIyRml4dHVyZURlZjtcbiAgZml4RGVmLmRlbnNpdHkgPSBvcHRpb25zLmR5bmFtaWNzLmRlbnNpdHk7XG4gIGZpeERlZi5mcmljdGlvbiA9IG9wdGlvbnMuZHluYW1pY3MuZnJpY3Rpb247XG4gIGZpeERlZi5yZXN0aXR1dGlvbiA9IG9wdGlvbnMuZHluYW1pY3MucmVzdGl0dXRpb247XG4gIGZpeERlZi5zaGFwZSA9IG9wdGlvbnMuc2hhcGU7XG4gIGlmIChvcHRpb25zLmNhdGVnb3J5KSAgeyBmaXhEZWYuZmlsdGVyLmNhdGVnb3J5Qml0cyA9IG9wdGlvbnMuY2F0ZWdvcnk7IH1cbiAgaWYgKG9wdGlvbnMuY29sbGlzaW9uKSB7IGZpeERlZi5maWx0ZXIubWFza0JpdHMgPSBvcHRpb25zLmNvbGxpc2lvbjsgICAgfVxuICByZXR1cm4gZml4RGVmO1xufTtcblxuZXhwb3J0cy5zaGFwZSA9IHtcbiAgY2lyY2xlOiBmdW5jdGlvbihyYWRpdXMsIHBvcykge1xuICAgIHZhciBjcyA9IG5ldyBCb3gyRC5Db2xsaXNpb24uU2hhcGVzLmIyQ2lyY2xlU2hhcGU7XG4gICAgY3MuU2V0UmFkaXVzKHJhZGl1cyk7XG4gICAgaWYgKHBvcykge1xuICAgICAgY3MuU2V0TG9jYWxQb3NpdGlvbihwb3MpO1xuICAgIH1cbiAgICByZXR1cm4gY3M7XG4gIH0sXG4gIGJveDogZnVuY3Rpb24od2lkdGgsIGhlaWdodCwgcG9zLCBhbmdsZSkge1xuICAgIHZhciBwcyA9IG5ldyBCb3gyRC5Db2xsaXNpb24uU2hhcGVzLmIyUG9seWdvblNoYXBlO1xuICAgIHZhciBwb3MgPSBwb3MgfHwgbmV3IEJveDJELkNvbW1vbi5NYXRoLmIyVmVjMigwLDApO1xuICAgIHZhciBhbmdsZSA9IGFuZ2xlIHx8IDA7XG4gICAgcHMuU2V0QXNPcmllbnRlZEJveCh3aWR0aCAvIDIsIGhlaWdodCAvIDIsIHBvcywgYW5nbGUpOyAgIC8vIGhhbGYtd2lkdGgsIGhhbGYtaGVpZ2h0XG4gICAgcmV0dXJuIHBzO1xuICB9XG59O1xuXG5leHBvcnRzLmNhdGVnb3JpZXMgPSB7XG4gIEFMTDogICAgICAgLTEsXG4gIEFSRU5BOiAgICAgMHgwMDAxLFxuICBQTEFZRVJTOiAgIDB4MDAwMixcbiAgQkFMTDogICAgICAweDAwMDQsXG4gIFBBUlRJQ0xFUzogMHgwMDA4XG59O1xuXG5cblxuXG5mdW5jdGlvbiBib2R5RGVmKHR5cGUsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IF8uZXh0ZW5kKHtcbiAgICB4OiAwLFxuICAgIHk6IDAsXG4gICAgYW5nbGU6IDAsXG4gICAgZml4ZWRSb3RhdGlvbjogZmFsc2VcbiAgfSwgb3B0aW9ucyk7XG4gIHZhciBiZCA9IG5ldyBCb3gyRC5EeW5hbWljcy5iMkJvZHlEZWY7XG4gIGJkLnR5cGUgPSB0eXBlO1xuICBiZC5wb3NpdGlvbi54ID0gb3B0aW9ucy54O1xuICBiZC5wb3NpdGlvbi55ID0gb3B0aW9ucy55O1xuICBiZC5hbmdsZSA9IG9wdGlvbnMuYW5nbGU7XG4gIGJkLmZpeGVkUm90YXRpb24gPSBvcHRpb25zLmZpeGVkUm90YXRpb247XG4gIHJldHVybiBiZDtcbn1cbiAgXG4iLCJ2YXIgaHViID0gcmVxdWlyZSgnLi4vZW5naW5lL2h1YicpO1xuXG5mdW5jdGlvbiBUaW1lQmFzZWRNZXNzYWdlKHRyaWdnZXJUaW1lLCBtZXNzYWdlLCBhcmdzKSB7XG5cbiAgdGhpcy50cmlnZ2VyVGltZSAgPSB0cmlnZ2VyVGltZTtcbiAgdGhpcy5tZXNzYWdlICAgICAgPSBtZXNzYWdlO1xuICB0aGlzLmFyZ3MgICAgICAgICA9IGFyZ3M7XG4gIHRoaXMudHJpZ2dlcmVkICAgID0gZmFsc2U7XG5cbn1cblxuVGltZUJhc2VkTWVzc2FnZS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24odGltZSkge1xuICBpZiAodGhpcy50cmlnZ2VyZWQgPT09IGZhbHNlICYmIHRpbWUgPD0gdGhpcy50cmlnZ2VyVGltZSkge1xuICAgIGh1Yi5zZW5kKHRoaXMubWVzc2FnZSwgdGhpcy5hcmdzKTtcbiAgICB0aGlzLnRyaWdnZXJlZCA9IHRydWU7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gVGltZUJhc2VkTWVzc2FnZTtcbiIsInZhciBFbnRpdHkgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9lbnRpdHknKTtcbnZhciBodWIgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9odWInKTtcbnZhciBhc3NldHMgICAgICA9IHJlcXVpcmUoJy4uLy4uL2Fzc2V0cycpO1xuXG5mdW5jdGlvbiBDcm93ZCgpIHtcbiAgdGhpcy5pZCA9ICdjcm93ZCc7XG4gIGh1Yi5zZW5kKCdlbmdpbmUuc291bmQucGxheScsIHNvdW5kKCdjcm93ZCcsIHRydWUsIDAuNykpO1xuICBodWIub24oJ2dhbWUuc2NvcmUnLCB0aGlzLmNoZWVyLmJpbmQodGhpcykpO1xuICBodWIub24oJ2dhbWUuZmluaXNoaW5nJywgdGhpcy5vcmdhbi5iaW5kKHRoaXMpKTtcbiAgaHViLm9uKCdnYW1lLmVuZCcsIHRoaXMuZW5kLmJpbmQodGhpcykpO1xufVxuXG5Dcm93ZC5wcm90b3R5cGUgPSBuZXcgRW50aXR5KCk7XG5cbkNyb3dkLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oKSB7XG4gIGh1Yi5zZW5kKCdlbmdpbmUuc291bmQuc3RvcCcsIHNvdW5kKCdjcm93ZCcpKTtcbn07XG5cbkNyb3dkLnByb3RvdHlwZS5jaGVlciA9IGZ1bmN0aW9uKGFyZ3MpIHtcbiAgaWYgKGFyZ3MuYWdhaW5zdEluZGV4ICE9PSBhcmdzLmJhbGwua2lja2VkQnkpIHtcbiAgICBodWIuc2VuZCgnZW5naW5lLnNvdW5kLnBsYXknLCBzb3VuZCgnY3Jvd2Qtc2NvcmVkJywgZmFsc2UpKTtcbiAgfSBlbHNlIHtcbiAgICBodWIuc2VuZCgnZW5naW5lLnNvdW5kLnBsYXknLCBzb3VuZCgnY3Jvd2Qtb2gnLCBmYWxzZSkpO1xuICB9XG59O1xuXG5Dcm93ZC5wcm90b3R5cGUub3JnYW4gPSBmdW5jdGlvbigpIHtcbiAgLy8gaHViLnNlbmQoJ2VuZ2luZS5zb3VuZC5wbGF5Jywgc291bmQoJ2Nyb3dkLW9yZ2FuJywgZmFsc2UpKTtcbn07XG5cbkNyb3dkLnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbigpIHtcbiAgLy8gaHViLnNlbmQoJ2VuZ2luZS5zb3VuZC5zdG9wJywgc291bmQoJ2Nyb3dkLW9yZ2FuJykpO1xuICAvLyBodWIuc2VuZCgnZW5naW5lLnNvdW5kLnBsYXknLCBzb3VuZCgnY3Jvd2QtZW5kJywgZmFsc2UpKTtcbn07XG5cbmZ1bmN0aW9uIHNvdW5kKG5hbWUsIGxvb3AsIHZvbHVtZSkge1xuICByZXR1cm4ge1xuICAgIGZpbGU6IGFzc2V0cy5zb3VuZChuYW1lKSxcbiAgICBsb29wOiBsb29wLFxuICAgIHZvbHVtZTogdm9sdW1lIHx8IDFcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBDcm93ZDtcbiIsInZhciBDb21wb3VuZEVudGl0eSAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvY29tcG91bmQtZW50aXR5Jyk7XG52YXIgQmFja2dyb3VuZCAgICAgID0gcmVxdWlyZSgnLi9iYWNrZ3JvdW5kJyk7XG52YXIgV2FsbCAgICAgICAgICAgID0gcmVxdWlyZSgnLi93YWxsJyk7XG52YXIgQ29uZSAgICAgICAgICAgID0gcmVxdWlyZSgnLi9jb25lJyk7XG52YXIgR29hbCAgICAgICAgICAgID0gcmVxdWlyZSgnLi9nb2FsJyk7XG52YXIgd29ybGQgICAgICAgICAgID0gcmVxdWlyZSgnLi4vd29ybGQnKTtcblxudmFyIFBJICAgICA9IDMuMTQxNTk7XG52YXIgd2lkdGggID0gd29ybGQud2lkdGg7XG52YXIgaGVpZ2h0ID0gd29ybGQuaGVpZ2h0O1xudmFyIHRvcCAgICA9IDMuNDtcbnZhciBsZWZ0ICAgPSAwLjU7XG52YXIgcmlnaHQgID0gd29ybGQud2lkdGggIC0gMC41O1xudmFyIGJvdHRvbSA9IHdvcmxkLmhlaWdodCAtIDIuNDtcblxuZnVuY3Rpb24gU3RhZGl1bSgpIHtcbiAgXG4gIHRoaXMuaWQgPSAnc3RhZGl1bSc7XG4gIFxuICB0aGlzLmVudGl0aWVzID0gW107XG4gIHRoaXMuZW50aXRpZXMucHVzaChuZXcgQmFja2dyb3VuZCgpKTtcbiAgXG4gIHRoaXMuZW50aXRpZXMucHVzaChuZXcgV2FsbCgnd2FsbC10b3AnLCAgICAgICAgICAgICAgIHdpZHRoIC8gMiwgICAgICB0b3AsICAgICAgICAgICAgICAgIHdpZHRoLCAgIDEsICAgICAgICAgICAgICAgMCkpO1xuICB0aGlzLmVudGl0aWVzLnB1c2gobmV3IFdhbGwoJ3dhbGwtYm90dG9tJywgICAgICAgICAgICB3aWR0aCAvIDIsICAgICAgYm90dG9tLCAgICAgICAgICAgICB3aWR0aCwgICAxLCAgICAgICAgICAgICAgIDApKTtcbiAgdGhpcy5lbnRpdGllcy5wdXNoKG5ldyBXYWxsKCd3YWxsLWxlZnQxJywgICAgICAgICAgICAgbGVmdCAgKyAyLjgsICAgIGhlaWdodCAqIDAuODUvNiwgICAgMSwgICAgICAgaGVpZ2h0IC8gMi41LCAgICAwLjA4KSk7XG4gIHRoaXMuZW50aXRpZXMucHVzaChuZXcgV2FsbCgnd2FsbC1sZWZ0MicsICAgICAgICAgICAgIGxlZnQgICsgMS4xLCAgICBoZWlnaHQgKiA1LjEwLzYsICAgIDEsICAgICAgIGhlaWdodCAvIDIuNSwgICAgMC4wNSkpO1xuICB0aGlzLmVudGl0aWVzLnB1c2gobmV3IFdhbGwoJ3dhbGwtcmlnaHQxJywgICAgICAgICAgICByaWdodCAtIDIuNywgICAgaGVpZ2h0ICogMC44NS82LCAgICAxLCAgICAgICBoZWlnaHQgLyAyLjUsICAgLTAuMDYpKTtcbiAgdGhpcy5lbnRpdGllcy5wdXNoKG5ldyBXYWxsKCd3YWxsLXJpZ2h0MicsICAgICAgICAgICAgcmlnaHQgLSAxLjIsICAgIGhlaWdodCAqIDUuMTAvNiwgICAgMSwgICAgICAgaGVpZ2h0IC8gMi41LCAgIC0wLjA1KSk7XG4gIHRoaXMuZW50aXRpZXMucHVzaChuZXcgV2FsbCgnd2FsbC1nb2FsLWxlZnQtdG9wJywgICAgIDAsICAgICAgICAgICAgICBoZWlnaHQgLyAyIC0gNi4wLCAgIDQsICAgICAgIDEsICAgICAgICAgICAgICAgMCkpO1xuICB0aGlzLmVudGl0aWVzLnB1c2gobmV3IFdhbGwoJ3dhbGwtZ29hbC1sZWZ0LWJvdHRvbScsICAwLCAgICAgICAgICAgICAgaGVpZ2h0IC8gMiArIDUuMSwgICAyLjcsICAgICAxLCAgICAgICAgICAgICAgIDApKTtcbiAgdGhpcy5lbnRpdGllcy5wdXNoKG5ldyBXYWxsKCd3YWxsLWdvYWwtcmlnaHQtdG9wJywgICAgd2lkdGgsICAgICAgICAgIGhlaWdodCAvIDIgLSA1LjksICAgNCwgICAgICAgMSwgICAgICAgICAgICAgICAwKSk7XG4gIHRoaXMuZW50aXRpZXMucHVzaChuZXcgV2FsbCgnd2FsbC1nb2FsLXJpZ2h0LWJvdHRvbScsIHdpZHRoLCAgICAgICAgICBoZWlnaHQgLyAyICsgNS4xLCAgIDIuNSwgICAgIDEsICAgICAgICAgICAgICAgMCkpO1xuICAgIFxuICB0aGlzLmVudGl0aWVzLnB1c2gobmV3IENvbmUoJ2NvbmUxJywgd2lkdGggLyAxMiAqIDYsICAgaGVpZ2h0IC8gNSAqIDEuNSkpO1xuICB0aGlzLmVudGl0aWVzLnB1c2gobmV3IENvbmUoJ2NvbmUyJywgd2lkdGggLyAxMiAqIDYsICAgaGVpZ2h0IC8gNSAqIDMuNSkpO1xuICBcbiAgdGhpcy5lbnRpdGllcy5wdXNoKG5ldyBHb2FsKCdnb2FscDEnLCAwLCAgMCwgICAgICAgICAgICBoZWlnaHQgLyAyLCAwLjUsIDE0KSk7XG4gIHRoaXMuZW50aXRpZXMucHVzaChuZXcgR29hbCgnZ29hbHAyJywgMSwgIHdvcmxkLndpZHRoLCAgaGVpZ2h0IC8gMiwgMC41LCAxNCkpO1xuICBcbn1cblxuU3RhZGl1bS5wcm90b3R5cGUgPSBuZXcgQ29tcG91bmRFbnRpdHkoKTtcblxuU3RhZGl1bS5wcm90b3R5cGUuc2hha2UgPSBmdW5jdGlvbihhZ2FpbnN0UGxheWVySW5kZXgpIHtcbiAgdGhpcy5lbnRpdGllc1swXS5zaGFrZShhZ2FpbnN0UGxheWVySW5kZXgpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBTdGFkaXVtO1xuIiwidmFyIFBGICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL3BoeXNpY3MtZmFjdG9yeScpO1xudmFyIEdGICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2dyYXBoaWNzLWZhY3RvcnknKTtcbnZhciBFbnRpdHkgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9lbnRpdHknKTtcbnZhciB3b3JsZCAgICAgICA9IHJlcXVpcmUoJy4uL3dvcmxkJyk7XG52YXIgaHViICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvaHViJyk7XG52YXIgYXNzZXRzICAgICAgPSByZXF1aXJlKCcuLi8uLi9hc3NldHMnKTtcblxudmFyIGZpeHR1cmUgPSBQRi5maXh0dXJlKHtcbiAgc2hhcGU6ICAgICAgUEYuc2hhcGUuY2lyY2xlKDEuNyksXG4gIGR5bmFtaWNzOiAgIHtkZW5zaXR5OiAxLCBmcmljdGlvbjogMC41LCByZXN0aXR1dGlvbjogMX0sXG4gIGNhdGVnb3J5OiAgIFBGLmNhdGVnb3JpZXMuUExBWUVSLFxuICBjb2xsaXNpb246ICBQRi5jYXRlZ29yaWVzLkFSRU5BIHwgUEYuY2F0ZWdvcmllcy5CQUxMXG59KTtcblxudmFyIEFOSU1fUkVTVCA9IDA7XG52YXIgQU5JTV9VUCAgID0gMTtcbnZhciBBTklNX0RPV04gPSAyO1xuXG5mdW5jdGlvbiBQbGF5ZXIoaWQsIGluZGV4LCBuYW1lLCB4LCB5KSB7XG4gIFxuICB0aGlzLmlkICAgID0gaWQ7XG4gIHRoaXMuaW5kZXggPSBpbmRleDtcbiAgdGhpcy5uYW1lICA9IG5hbWU7XG4gIFxuICB0aGlzLmJvZHlTcGVjID0ge1xuICAgIGJvZHk6IFBGLmR5bmFtaWMoeyB4OiB4LCB5OiB5LCBmaXhlZFJvdGF0aW9uOiB0cnVlIH0pLFxuICAgIGZpeHR1cmU6IGZpeHR1cmVcbiAgfTtcbiAgXG4gIHRoaXMuY29uc3RyYWludFNwZWMgPSB7XG4gICAgYm9keTogUEYuc3RhdGljKHt4OiB4LCB5OiAwfSksXG4gICAgZml4dHVyZTogUEYuZml4dHVyZSh7XG4gICAgICBzaGFwZTogUEYuc2hhcGUuYm94KDEsIDEpLFxuICAgICAgZHluYW1pY3M6IHtkZW5zaXR5OiAwLCBmcmljdGlvbjogMCwgcmVzdGl0dXRpb246IDB9LFxuICAgIH0pXG4gIH07XG4gIFxuICBpZiAodGhpcy5pZCA9PT0gJ3AxJykge1xuICAgIHRoaXMuc3ByaXRlID0gR0YuYW5pbWF0aW9uKGFzc2V0cy5pbWFnZXMoJ2NhdCcsICdjYXQtdXAnLCAnY2F0LWRvd24nKSwgNiwgNik7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5zcHJpdGUgPSBHRi5hbmltYXRpb24oYXNzZXRzLmltYWdlcygnZG9nJywgJ2RvZy11cCcsICdkb2ctZG93bicpLCA2LCA2KTtcbiAgfVxuICBcbn1cblxuUGxheWVyLnByb3RvdHlwZSA9IG5ldyBFbnRpdHkoKTtcblxuUGxheWVyLnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgRW50aXR5LnByb3RvdHlwZS5jcmVhdGUuY2FsbCh0aGlzLCBlbmdpbmUsIGdhbWUpO1xuICB0aGlzLmJvZHkuU2V0TGluZWFyRGFtcGluZygyKTtcbiAgdGhpcy5jb25zdHJhaW50Qm9keSA9IGVuZ2luZS5waHlzaWNzLmNyZWF0ZSh0aGlzLmNvbnN0cmFpbnRTcGVjLmJvZHksIHRoaXMuY29uc3RyYWludFNwZWMuZml4dHVyZSk7XG4gIHZhciB2ZXJ0aWNhbEF4aXMgPSBuZXcgQm94MkQuQ29tbW9uLk1hdGguYjJWZWMyKDAsMSk7XG4gIHZhciBqb2ludCAgPSBuZXcgQm94MkQuRHluYW1pY3MuSm9pbnRzLmIyTGluZUpvaW50RGVmKCk7XG4gIGpvaW50LkluaXRpYWxpemUodGhpcy5jb25zdHJhaW50Qm9keSwgdGhpcy5ib2R5LCB0aGlzLmJvZHkuR2V0UG9zaXRpb24oKSwgdmVydGljYWxBeGlzKTtcbiAgZW5naW5lLnBoeXNpY3MuYjJ3b3JsZC5DcmVhdGVKb2ludChqb2ludCk7ICBcbn1cblxuUGxheWVyLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lKSB7XG4gIEVudGl0eS5wcm90b3R5cGUuZGVzdHJveS5jYWxsKHRoaXMsIGVuZ2luZSwgZ2FtZSk7XG4gIGVuZ2luZS5waHlzaWNzLmRlc3Ryb3kodGhpcy5jb25zdHJhaW50Qm9keSk7XG59O1xuXG5QbGF5ZXIucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSwgZGVsdGEpIHtcbiAgRW50aXR5LnByb3RvdHlwZS51cGRhdGUuY2FsbCh0aGlzLCBlbmdpbmUsIGdhbWUsIGRlbHRhKTtcbiAgLy8gV2Ugc2hvdWxkIGJlIGFibGUgdG8gc3BlY2lmeSBcIjAuNVwiLCBhbmQgbm90IGhhdmUgdG8gdXBkYXRlIGl0IGNvbnN0YW50bHlcbiAgLy8gTmVlZCB0byBjaGVjayBvdXIgY2hhbmdlcyB0byBQSVhJXG4gIHRoaXMuc3ByaXRlLmFuY2hvci54ID0gdGhpcy5zcHJpdGUudGV4dHVyZS53aWR0aCAgLyAyO1xuICB0aGlzLnNwcml0ZS5hbmNob3IueSA9IHRoaXMuc3ByaXRlLnRleHR1cmUuaGVpZ2h0IC8gMjtcbn07XG5cblBsYXllci5wcm90b3R5cGUuY29sbGlzaW9uID0gZnVuY3Rpb24ob3RoZXIsIHBvaW50cykgeyAgICBcbiAgaWYgKG90aGVyLmlkLm1hdGNoKC9iYWxsLykpIHtcbiAgICBvdGhlci5raWNrZWRCeSA9IHRoaXMuaW5kZXg7XG4gICAgaHViLnNlbmQoJ2VuZ2luZS5zb3VuZC5wbGF5Jywge2ZpbGU6ICcvZ2FtZS9zb3VuZHMvYm91bmNlLm1wMyd9KTtcbiAgfSBlbHNlIGlmIChvdGhlci5pZC5tYXRjaCgvd2FsbC8pKSB7XG4gICAgdGhpcy5zcHJpdGUuZ290b0FuZFN0b3AoQU5JTV9SRVNUKTtcbiAgICB0aGlzLmJvZHkuU2V0TGluZWFyVmVsb2NpdHkobmV3IEJveDJELkNvbW1vbi5NYXRoLmIyVmVjMigwLCA1KSk7XG4gIH1cbn07XG5cblBsYXllci5wcm90b3R5cGUubW92ZSA9IGZ1bmN0aW9uKGRpcikge1xuICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuZW5kRmxhbWUpO1xuICB2YXIgeSA9IChkaXIgPT09ICd1cCcpID8gLTMyOiAzMjtcbiAgdGhpcy5ib2R5LlNldEF3YWtlKHRydWUpO1xuICB0aGlzLmJvZHkuU2V0TGluZWFyVmVsb2NpdHkobmV3IEJveDJELkNvbW1vbi5NYXRoLmIyVmVjMigwLCB5KSk7XG4gIGlmICh5IDwgMCkge1xuICAgIHRoaXMuc3ByaXRlLmdvdG9BbmRTdG9wKEFOSU1fVVApO1xuICB9IGVsc2Uge1xuICAgIHRoaXMuc3ByaXRlLmdvdG9BbmRTdG9wKEFOSU1fRE9XTik7XG4gIH1cbiAgdGhpcy5lbmRGbGFtZSA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5zcHJpdGUuZ290b0FuZFN0b3AoMCk7XG4gIH0uYmluZCh0aGlzKSwgMjAwKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gUGxheWVyO1xuIiwidmFyIEVudGl0eSA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9lbnRpdHknKTtcbnZhciBHRiA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9ncmFwaGljcy1mYWN0b3J5Jyk7XG52YXIgdXNlckludGVyZmFjZSA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS91c2VyLWludGVyZmFjZScpO1xuXG52YXIgVEVYVF9UT1AgICAgICAgICAgPSB1c2VySW50ZXJmYWNlLnVuaXQoMi44NSk7XG52YXIgUExBWUVSU19NQVJHSU5fWCAgPSB1c2VySW50ZXJmYWNlLnVuaXQoMjApO1xuXG5mdW5jdGlvbiBIdWQodGV4dCkge1xuICBcbiAgdGhpcy5pZCA9ICdodWQnO1xuICBcbiAgdGhpcy5wMU5hbWUgPSBHRi50ZXh0KCdKb2huIERvZScsIHVzZXJJbnRlcmZhY2UudW5pdCgzKSwge2ZpbGw6ICcjMDE1MThkJywgc3Ryb2tlOiAnI2ZmZicsIHN0cm9rZVRoaWNrbmVzczogMyB9KTtcbiAgdGhpcy5wMU5hbWUucG9zaXRpb24ueCA9IHVzZXJJbnRlcmZhY2UudW5pdCgyMCkgLSB0aGlzLnAxTmFtZS53aWR0aCAvIDI7XG4gIHRoaXMucDFOYW1lLnBvc2l0aW9uLnkgPSBURVhUX1RPUDtcblxuICB0aGlzLnAyTmFtZSA9IEdGLnRleHQoJ0pvaG4gRG9lJywgdXNlckludGVyZmFjZS51bml0KDMpLCB7ZmlsbDogJyNiZjAwMDAnLCBzdHJva2U6ICcjZmZmJywgc3Ryb2tlVGhpY2tuZXNzOiAzIH0pO1xuICB0aGlzLnAyTmFtZS5wb3NpdGlvbi54ID0gdXNlckludGVyZmFjZS53aWR0aCAtIHVzZXJJbnRlcmZhY2UudW5pdCgxNykgLSB0aGlzLnAyTmFtZS53aWR0aCAvIDI7XG4gIHRoaXMucDJOYW1lLnBvc2l0aW9uLnkgPSBURVhUX1RPUDtcblxuICB0aGlzLnAxU2NvcmUgPSBHRi50ZXh0KCcwJywgdXNlckludGVyZmFjZS51bml0KDMpLCB7ZmlsbDogJyNmZmYnLCBzdHJva2U6ICcjMDAwJywgc3Ryb2tlVGhpY2tuZXNzOiAzIH0pO1xuICB0aGlzLnAxU2NvcmUucG9zaXRpb24ueCA9IHVzZXJJbnRlcmZhY2UudW5pdCgzMy41KSAtIHRoaXMucDFTY29yZS53aWR0aCAvIDI7XG4gIHRoaXMucDFTY29yZS5wb3NpdGlvbi55ID0gVEVYVF9UT1A7XG5cbiAgdGhpcy5wMlNjb3JlID0gR0YudGV4dCgnMCcsIHVzZXJJbnRlcmZhY2UudW5pdCgzKSwge2ZpbGw6ICcjZmZmJywgc3Ryb2tlOiAnIzAwMCcsIHN0cm9rZVRoaWNrbmVzczogMyB9KTtcbiAgdGhpcy5wMlNjb3JlLnBvc2l0aW9uLnggPSB1c2VySW50ZXJmYWNlLndpZHRoIC0gdXNlckludGVyZmFjZS51bml0KDM2KSAtIHRoaXMucDJTY29yZS53aWR0aCAvIDI7XG4gIHRoaXMucDJTY29yZS5wb3NpdGlvbi55ID0gVEVYVF9UT1A7XG5cbiAgdGhpcy50aW1lID0gR0YudGV4dChmb3VyRGlnaXRzKDApLCB1c2VySW50ZXJmYWNlLnVuaXQoMyksIHtmaWxsOiAnI2ZmZicsIHN0cm9rZTogJyMwMDAnLCBzdHJva2VUaGlja25lc3M6IDMgfSk7XG4gIHRoaXMudGltZS5wb3NpdGlvbi54ID0gdXNlckludGVyZmFjZS53aWR0aCAvIDIgLSB0aGlzLnRpbWUud2lkdGggLyAyO1xuICB0aGlzLnRpbWUucG9zaXRpb24ueSA9IFRFWFRfVE9QO1xuICAgIFxufTtcblxuSHVkLnByb3RvdHlwZSA9IG5ldyBFbnRpdHkoKTtcblxuSHVkLnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgZW5naW5lLmdyYXBoaWNzLmFkZCh0aGlzLnAxTmFtZSk7XG4gIGVuZ2luZS5ncmFwaGljcy5hZGQodGhpcy5wMVNjb3JlKTtcbiAgZW5naW5lLmdyYXBoaWNzLmFkZCh0aGlzLnAyTmFtZSk7XG4gIGVuZ2luZS5ncmFwaGljcy5hZGQodGhpcy5wMlNjb3JlKTtcbiAgZW5naW5lLmdyYXBoaWNzLmFkZCh0aGlzLnRpbWUpO1xufTtcblxuSHVkLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lKSB7XG4gIGVuZ2luZS5ncmFwaGljcy5yZW1vdmUodGhpcy5wMU5hbWUpO1xuICBlbmdpbmUuZ3JhcGhpY3MucmVtb3ZlKHRoaXMucDFTY29yZSk7XG4gIGVuZ2luZS5ncmFwaGljcy5yZW1vdmUodGhpcy5wMk5hbWUpO1xuICBlbmdpbmUuZ3JhcGhpY3MucmVtb3ZlKHRoaXMucDJTY29yZSk7XG4gIGVuZ2luZS5ncmFwaGljcy5yZW1vdmUodGhpcy50aW1lKTtcbn07XG5cbkh1ZC5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lLCBkZWx0YSkge1xuICB2YXIgcDEgPSBnYW1lLnBsYXllcnNbMF07XG4gIHZhciBwMiA9IGdhbWUucGxheWVyc1sxXTtcbiAgdGhpcy5wMU5hbWUuc2V0VGV4dChwMS5uYW1lKTtcbiAgdGhpcy5wMVNjb3JlLnNldFRleHQocDEuc2NvcmUudG9TdHJpbmcoKSk7XG4gIHRoaXMucDJOYW1lLnNldFRleHQocDIubmFtZSk7XG4gIHRoaXMucDJTY29yZS5zZXRUZXh0KHAyLnNjb3JlLnRvU3RyaW5nKCkpO1xuICB0aGlzLnRpbWUuc2V0VGV4dChmb3VyRGlnaXRzKGdhbWUudGltZVJlbWFpbmluZykpO1xufTtcblxuZnVuY3Rpb24gZm91ckRpZ2l0cyhtaWxsaXNlY29uZHMpIHtcbiAgdmFyIHNlY29uZHMgPSBNYXRoLmZsb29yKG1pbGxpc2Vjb25kcyAvIDEwMDApO1xuICB2YXIgcGFkZGVkID0gKHNlY29uZHMgPCAxMCkgPyAoJzAnICsgc2Vjb25kcykgOiBzZWNvbmRzO1xuICByZXR1cm4gJzAwOicgKyBwYWRkZWQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gSHVkO1xuIiwidmFyIEdGICAgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZ3JhcGhpY3MtZmFjdG9yeScpO1xudmFyIEVudGl0eSAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZW50aXR5Jyk7XG52YXIgdXNlckludGVyZmFjZSA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS91c2VyLWludGVyZmFjZScpO1xudmFyIG1hdGhVdGlscyAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvbWF0aC11dGlscycpO1xudmFyIGFzc2V0cyAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9hc3NldHMnKTtcblxudmFyIFBJICAgICAgICAgICAgICA9IDMuMTQ7XG52YXIgU1RSRVRDSF9DSVJDTEUgID0gIDgwOyAgLy8gbWlsbGlzXG52YXIgU1RSRVRDSF9TUExBU0ggID0gMTgwOyAgLy8gbWlsbGlzXG52YXIgU1RSRVRDSF9MSU5FICAgID0gMzAwOyAgLy8gbWlsbGlzXG5cbmZ1bmN0aW9uIEJvb20oaWQsIGFnYWluc3RQbGF5ZXJJbmRleCkge1xuICBcbiAgdGhpcy5pZCA9IGlkO1xuICBcbiAgdmFyIHggPSAoYWdhaW5zdFBsYXllckluZGV4ID09PSAwKSA/IDAgOiB1c2VySW50ZXJmYWNlLndpZHRoO1xuICBcbiAgdGhpcy5jaXJjbGUgPSBHRi51aVNwcml0ZShhc3NldHMuaW1hZ2UoJ2Jvb20tY2lyY2xlJyksIDAsIHVzZXJJbnRlcmZhY2UuaGVpZ2h0IC8gMiwgMCk7XG4gIHRoaXMuY2lyY2xlLnBvc2l0aW9uLnggPSB4O1xuICB0aGlzLmNpcmNsZS5wb3NpdGlvbi55ID0gdXNlckludGVyZmFjZS5oZWlnaHQgLyAyO1xuXG4gIHRoaXMuc3BsYXNoID0gR0YudWlTcHJpdGUoYXNzZXRzLmltYWdlKCdib29tLXNwbGFzaCcpLCAwLCB1c2VySW50ZXJmYWNlLmhlaWdodCAvIDEuMiwgMCk7XG4gIHRoaXMuc3BsYXNoLnBvc2l0aW9uLnggPSB4O1xuICB0aGlzLnNwbGFzaC5wb3NpdGlvbi55ID0gdXNlckludGVyZmFjZS5oZWlnaHQgLyAyO1xuXG4gIHRoaXMubGluZSA9IEdGLnVpU3ByaXRlKGFzc2V0cy5pbWFnZSgnYm9vbS1saW5lJyksIDAsIHVzZXJJbnRlcmZhY2UuaGVpZ2h0IC8gNCwgMCk7XG4gIHRoaXMubGluZS5wb3NpdGlvbi54ID0geDtcbiAgdGhpcy5saW5lLnBvc2l0aW9uLnkgPSB1c2VySW50ZXJmYWNlLmhlaWdodCAvIDI7XG5cbiAgaWYgKGFnYWluc3RQbGF5ZXJJbmRleCA9PT0gMSkge1xuICAgIHRoaXMuY2lyY2xlLnJvdGF0aW9uID0gUEk7XG4gICAgdGhpcy5zcGxhc2gucm90YXRpb24gPSBQSTtcbiAgICB0aGlzLmxpbmUucm90YXRpb24gID0gUEk7XG4gIH1cbiAgXG4gIHRoaXMudGltZSA9IDA7XG4gIFxufVxuXG5Cb29tLnByb3RvdHlwZSA9IG5ldyBFbnRpdHkoKTtcblxuQm9vbS5wcm90b3R5cGUuY3JlYXRlID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lKSB7XG4gIGVuZ2luZS5ncmFwaGljcy5hZGQodGhpcy5jaXJjbGUpO1xuICBlbmdpbmUuZ3JhcGhpY3MuYWRkKHRoaXMuc3BsYXNoKTtcbiAgZW5naW5lLmdyYXBoaWNzLmFkZCh0aGlzLmxpbmUpO1xufTtcblxuQm9vbS5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSkge1xuICBlbmdpbmUuZ3JhcGhpY3MucmVtb3ZlKHRoaXMuY2lyY2xlKTtcbiAgZW5naW5lLmdyYXBoaWNzLnJlbW92ZSh0aGlzLnNwbGFzaCk7XG4gIGVuZ2luZS5ncmFwaGljcy5yZW1vdmUodGhpcy5saW5lKTtcbn07XG5cbkJvb20ucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSwgZGVsdGEpIHtcbiAgdGhpcy5jaXJjbGUuYW5jaG9yLnkgPSB0aGlzLmNpcmNsZS50ZXh0dXJlLmhlaWdodCAvIDI7XG4gIHRoaXMuc3BsYXNoLmFuY2hvci55ID0gdGhpcy5zcGxhc2gudGV4dHVyZS5oZWlnaHQgLyAyO1xuICB0aGlzLmxpbmUuYW5jaG9yLnkgID0gdGhpcy5saW5lLnRleHR1cmUuaGVpZ2h0ICAvIDI7XG5cbiAgdGhpcy50aW1lID0gdGhpcy50aW1lICsgZGVsdGE7XG4gIHZhciBzdHJldGNoQ2lyY2xlID0gbWF0aFV0aWxzLmNsYW1wKHRoaXMudGltZSwgMCwgU1RSRVRDSF9DSVJDTEUpO1xuICB2YXIgc3RyZXRjaFNwbGFzaCA9IG1hdGhVdGlscy5jbGFtcCh0aGlzLnRpbWUsIDAsIFNUUkVUQ0hfU1BMQVNIKTtcbiAgdmFyIHN0cmV0Y2hMaW5lICAgPSBtYXRoVXRpbHMuY2xhbXAodGhpcy50aW1lLCAwLCBTVFJFVENIX0xJTkUpO1xuICBcbiAgdGhpcy5jaXJjbGUud2lkdGggPSBpbnRlcnBvbGF0ZShzdHJldGNoQ2lyY2xlLCAwLCBTVFJFVENIX0NJUkNMRSwgMCwgdGhpcy5jaXJjbGUuaGVpZ2h0ICogMC43MSk7XG4gIHRoaXMuc3BsYXNoLndpZHRoID0gaW50ZXJwb2xhdGUoc3RyZXRjaFNwbGFzaCwgMCwgU1RSRVRDSF9TUExBU0gsIDAsIHRoaXMuc3BsYXNoLmhlaWdodCAqIDAuNSk7XG4gIHRoaXMubGluZS53aWR0aCAgID0gaW50ZXJwb2xhdGUoc3RyZXRjaExpbmUsICAgMCwgU1RSRVRDSF9MSU5FLCAgIDAsIHRoaXMubGluZS5oZWlnaHQgICAqIDcuMjYpO1xuICBcbiAgaWYgKHRoaXMudGltZSA+PSBTVFJFVENIX0NJUkNMRSkgeyB0aGlzLmNpcmNsZS5hbHBoYSAqPSAwLjk1OyB9XG4gIGlmICh0aGlzLnRpbWUgPj0gU1RSRVRDSF9TUExBU0gpIHsgdGhpcy5zcGxhc2guYWxwaGEgKj0gMC45NTsgfVxuICBpZiAodGhpcy50aW1lID49IFNUUkVUQ0hfTElORSkgICB7IHRoaXMubGluZS5hbHBoYSAgICo9IDAuOTU7IH1cbn07XG5cbmZ1bmN0aW9uIGludGVycG9sYXRlKGN1cnJlbnQsIGlucHV0TWluLCBpbnB1dE1heCwgb3V0cHV0TWluLCBvdXRwdXRNYXgpIHtcbiAgcmV0dXJuIG91dHB1dE1pbiArIChjdXJyZW50IC8gKGlucHV0TWF4LWlucHV0TWluKSkgKiAob3V0cHV0TWF4IC0gb3V0cHV0TWluKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBCb29tO1xuIiwidmFyIEVudGl0eSA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9lbnRpdHknKTtcbnZhciBHRiA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9ncmFwaGljcy1mYWN0b3J5Jyk7XG52YXIgdXNlckludGVyZmFjZSA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS91c2VyLWludGVyZmFjZScpO1xuXG5mdW5jdGlvbiBXaW5uZXIoaWQsIHAxLCBwMikge1xuICBcbiAgdGhpcy5pZCA9IGlkO1xuICBcbiAgdmFyIGJnICAgPSAocDEuc2NvcmUgPT09IHAyLnNjb3JlKSA/ICcvZ2FtZS9pbWFnZXMvZW5kLWRyYXcucG5nJyA6ICcvZ2FtZS9pbWFnZXMvZW5kLXdpbm5lci5wbmcnO1xuICB2YXIgbmFtZSA9IChwMS5zY29yZSA+IHAyLnNjb3JlKSA/IHAxLm5hbWUgOiBwMi5uYW1lO1xuICBcbiAgdGhpcy5iYWNrZ3JvdW5kID0gR0YudWlTcHJpdGUoYmcsIHVzZXJJbnRlcmZhY2Uud2lkdGgsIHVzZXJJbnRlcmZhY2UuaGVpZ2h0KTtcbiAgdGhpcy5iYWNrZ3JvdW5kLnBvc2l0aW9uLnggPSB1c2VySW50ZXJmYWNlLndpZHRoICAvIDIgLSB0aGlzLmJhY2tncm91bmQud2lkdGggIC8gMjtcbiAgdGhpcy5iYWNrZ3JvdW5kLnBvc2l0aW9uLnkgPSB1c2VySW50ZXJmYWNlLmhlaWdodCAvIDIgLSB0aGlzLmJhY2tncm91bmQuaGVpZ2h0IC8gMjtcbiAgICBcbiAgaWYgKHAxLnNjb3JlICE9IHAyLnNjb3JlKSB7XG4gICAgdGhpcy5uYW1lID0gR0YudGV4dChuYW1lLCA0NSwge2ZpbGw6ICcjMDE1MThkJywgc3Ryb2tlOiAnI2ZmZicsIHN0cm9rZVRoaWNrbmVzczogM30pO1xuICAgIHRoaXMubmFtZS5wb3NpdGlvbi54ID0gdXNlckludGVyZmFjZS53aWR0aCAvIDIgLSB0aGlzLm5hbWUud2lkdGggLyAyIC0gMjA7XG4gICAgdGhpcy5uYW1lLnBvc2l0aW9uLnkgPSB1c2VySW50ZXJmYWNlLnVuaXQoMTUpO1xuICB9XG4gIFxufTtcblxuV2lubmVyLnByb3RvdHlwZSA9IG5ldyBFbnRpdHkoKTtcblxuV2lubmVyLnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgZW5naW5lLmdyYXBoaWNzLmFkZCh0aGlzLmJhY2tncm91bmQpO1xuICBpZiAodGhpcy5uYW1lKSB7XG4gICAgZW5naW5lLmdyYXBoaWNzLmFkZCh0aGlzLm5hbWUpO1xuICB9XG59O1xuXG5XaW5uZXIucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgZW5naW5lLmdyYXBoaWNzLnJlbW92ZSh0aGlzLmJhY2tncm91bmQpO1xuICBpZiAodGhpcy5uYW1lKSB7XG4gICAgZW5naW5lLmdyYXBoaWNzLnJlbW92ZSh0aGlzLm5hbWUpO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFdpbm5lcjtcbiIsInZhciBfID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvdW5kZXJzY29yZS1taW4nKTtcbnZhciBFbnRpdHkgPSByZXF1aXJlKCcuL2VudGl0eScpO1xuXG52YXIgZ2xvYmFsQ291bnQgPSAwO1xuXG52YXIgQ29tcG91bmRFbnRpdHkgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5pZCAgICAgICA9ICgrK2dsb2JhbENvdW50KTtcbiAgdGhpcy5lbnRpdGllcyA9IFtdO1xufTtcblxuQ29tcG91bmRFbnRpdHkucHJvdG90eXBlLmNyZWF0ZSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSkge1xuICB0aGlzLmVudGl0aWVzLmZvckVhY2goZnVuY3Rpb24oZW50aXR5KSB7XG4gICAgZW50aXR5LmNyZWF0ZShlbmdpbmUsIGdhbWUpO1xuICB9KTtcbn07XG5cbkNvbXBvdW5kRW50aXR5LnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lKSB7XG4gIHRoaXMuZW50aXRpZXMuZm9yRWFjaChmdW5jdGlvbihlbnRpdHkpIHtcbiAgICBlbnRpdHkuZGVzdHJveShlbmdpbmUsIGdhbWUpO1xuICB9KTtcbn07XG5cbkNvbXBvdW5kRW50aXR5LnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgdGhpcy5lbnRpdGllcy5mb3JFYWNoKGZ1bmN0aW9uKGVudGl0eSkge1xuICAgIGVudGl0eS51cGRhdGUoZW5naW5lLCBnYW1lKTtcbiAgfSk7XG59O1xuXG5Db21wb3VuZEVudGl0eS5wcm90b3R5cGUuY29sbGlzaW9uID0gZnVuY3Rpb24ob3RoZXIsIHBvaW50cykge1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBDb21wb3VuZEVudGl0eTtcbiIsInZhciBHRiAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9ncmFwaGljcy1mYWN0b3J5Jyk7XG52YXIgRW50aXR5ICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZW50aXR5Jyk7XG52YXIgd29ybGQgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvd29ybGQnKTtcbnZhciBhc3NldHMgICAgICA9IHJlcXVpcmUoJy4uLy4uL2Fzc2V0cycpO1xudmFyIGdhbWVXb3JsZCAgID0gcmVxdWlyZSgnLi4vd29ybGQnKTtcblxuZnVuY3Rpb24gQmFja2dyb3VuZChpbWFnZSkge1xuICB0aGlzLmlkID0gJ2JhY2tncm91bmQnO1xuICB0aGlzLnNwcml0ZSA9IEdGLmFuaW1hdGlvbihhc3NldHMuaW1hZ2VzKCdzdGFkaXVtJywgJ3N0YWRpdW0tc2hha2UtcmlnaHQnLCAnc3RhZGl1bS1zaGFrZS1sZWZ0JyksIGdhbWVXb3JsZC53aWR0aCwgZ2FtZVdvcmxkLmhlaWdodCk7XG59XG5cbkJhY2tncm91bmQucHJvdG90eXBlID0gbmV3IEVudGl0eSgpO1xuXG5CYWNrZ3JvdW5kLnByb3RvdHlwZS5zaGFrZSA9IGZ1bmN0aW9uKGFnYWluc3RQbGF5ZXJJbmRleCkge1xuICB0aGlzLnNwcml0ZS5nb3RvQW5kU3RvcChhZ2FpbnN0UGxheWVySW5kZXggPT09IDAgPyAyIDogMSk7XG4gIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5zcHJpdGUuZ290b0FuZFN0b3AoYWdhaW5zdFBsYXllckluZGV4ID09PSAwID8gMSA6IDIpO1xuICB9LmJpbmQodGhpcyksIDUwKTtcbiAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICB0aGlzLnNwcml0ZS5nb3RvQW5kU3RvcCgwKTtcbiAgfS5iaW5kKHRoaXMpLCAxMDApO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBCYWNrZ3JvdW5kO1xuIiwidmFyIFBGICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL3BoeXNpY3MtZmFjdG9yeScpO1xudmFyIEdGICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2dyYXBoaWNzLWZhY3RvcnknKTtcbnZhciBFbnRpdHkgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9lbnRpdHknKTtcbnZhciB3b3JsZCAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS93b3JsZCcpO1xuXG5mdW5jdGlvbiBXYWxsKGlkLCB4LCB5LCB3aWR0aCwgaGVpZ2h0LCByb3RhdGlvbikge1xuICB0aGlzLmlkID0gaWQ7XG4gIHRoaXMuYm9keVNwZWMgPSB7XG4gICAgYm9keTogUEYuc3RhdGljKHtcbiAgICAgIHg6IHgsXG4gICAgICB5OiB5LFxuICAgICAgYW5nbGU6IHJvdGF0aW9uIHx8IDBcbiAgICB9KSxcbiAgICBmaXh0dXJlOiBQRi5maXh0dXJlKHtcbiAgICAgIHNoYXBlOiAgICAgIFBGLnNoYXBlLmJveCh3aWR0aCwgaGVpZ2h0KSxcbiAgICAgIGR5bmFtaWNzOiAgIHtkZW5zaXR5OiAxLCBmcmljdGlvbjogMC4xLCByZXN0aXR1dGlvbjogMX0sXG4gICAgICBjYXRlZ29yeTogICBQRi5jYXRlZ29yaWVzLkFSRU5BLFxuICAgICAgY29sbGlzaW9uOiAgUEYuY2F0ZWdvcmllcy5BTExcbiAgICB9KVxuICB9O1xuICAvLyB0aGlzLnNwcml0ZSA9IEdGLnRpbGUoJy9nYW1lL2ltYWdlcy93YWxsLnBuZycsIHdpZHRoLCBoZWlnaHQsIHJvdGF0aW9uKTtcbiAgLy8gdGhpcy5zcHJpdGUucG9zaXRpb24ueCA9IHdvcmxkLnRvUGl4ZWxzKHgpO1xuICAvLyB0aGlzLnNwcml0ZS5wb3NpdGlvbi55ID0gd29ybGQudG9QaXhlbHMoeSk7XG59XG5cbldhbGwucHJvdG90eXBlID0gbmV3IEVudGl0eSgpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFdhbGw7XG4iLCJ2YXIgXyAgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi8uLi8uLi8zcmRwYXJ0eS91bmRlcnNjb3JlLW1pbicpO1xudmFyIFBGICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL3BoeXNpY3MtZmFjdG9yeScpO1xudmFyIEdGICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2dyYXBoaWNzLWZhY3RvcnknKTtcbnZhciBFbnRpdHkgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9lbnRpdHknKTtcbnZhciB3b3JsZCAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS93b3JsZCcpO1xudmFyIGh1YiAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2h1YicpO1xudmFyIGFzc2V0cyAgICAgID0gcmVxdWlyZSgnLi4vLi4vYXNzZXRzJyk7XG5cbnZhciBQSSA9IDMuMTQxNTk7XG5cbnZhciBmaXh0dXJlT3B0cyA9IHtcbiAgZHluYW1pY3M6ICAge2RlbnNpdHk6IDEuNSwgZnJpY3Rpb246IDEsIHJlc3RpdHV0aW9uOiAxfSxcbiAgY2F0ZWdvcnk6ICAgUEYuY2F0ZWdvcmllcy5BUkVOQSxcbiAgY29sbGlzaW9uOiAgUEYuY2F0ZWdvcmllcy5BTExcbn07XG5cbmZ1bmN0aW9uIENvbmUoaWQsIHgsIHkpIHtcbiAgdGhpcy5pZCA9IGlkO1xuICB0aGlzLnNwcml0ZSA9IEdGLnNwcml0ZShhc3NldHMuaW1hZ2UoJ2NvbmUnKSwgMi41LCA0KTtcbiAgdGhpcy5ib2R5U3BlYyA9IHtcbiAgICBib2R5OiBQRi5keW5hbWljKHsgeDogeCwgeTogeSwgZml4ZWRSb3RhdGlvbjogdHJ1ZSB9KSxcbiAgICBmaXh0dXJlOiBQRi5maXh0dXJlKF8uZXh0ZW5kKGZpeHR1cmVPcHRzLCB7XG4gICAgICBzaGFwZTogUEYuc2hhcGUuY2lyY2xlKDAuNywgbmV3IEJveDJELkNvbW1vbi5NYXRoLmIyVmVjMigwLDAuNikpXG4gICAgfSkpXG4gIH07XG59XG5cbkNvbmUucHJvdG90eXBlID0gbmV3IEVudGl0eSgpO1xuXG5Db25lLnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgRW50aXR5LnByb3RvdHlwZS5jcmVhdGUuY2FsbCh0aGlzLCBlbmdpbmUsIGdhbWUpO1xuICB2YXIgb3RoZXJGaXh0dXJlID0gUEYuZml4dHVyZShfLmV4dGVuZChmaXh0dXJlT3B0cywge1xuICAgIHNoYXBlOiBQRi5zaGFwZS5ib3goMC43LCAxLjksIG5ldyBCb3gyRC5Db21tb24uTWF0aC5iMlZlYzIoMCwtMC4xKSlcbiAgfSkpO1xuICBvdGhlckZpeHR1cmUudXNlckRhdGEgPSB0aGlzO1xuICB0aGlzLmJvZHkuQ3JlYXRlRml4dHVyZShvdGhlckZpeHR1cmUpO1xuICB0aGlzLmJvZHkuU2V0TGluZWFyRGFtcGluZyg2KTtcbn07XG5cbkNvbmUucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSwgZGVsdGEpIHtcbiAgRW50aXR5LnByb3RvdHlwZS51cGRhdGUuY2FsbCh0aGlzLCBkZWx0YSk7XG4gIC8vIFdlIHNob3VsZCBiZSBhYmxlIHRvIHNwZWNpZnkgXCIwLjVcIiwgYW5kIG5vdCBoYXZlIHRvIHVwZGF0ZSBpdCBjb25zdGFudGx5XG4gIC8vIE5lZWQgdG8gY2hlY2sgb3VyIGNoYW5nZXMgdG8gUElYSVxuICB0aGlzLnNwcml0ZS5hbmNob3IueCA9IHRoaXMuc3ByaXRlLnRleHR1cmUud2lkdGggIC8gMjtcbiAgdGhpcy5zcHJpdGUuYW5jaG9yLnkgPSB0aGlzLnNwcml0ZS50ZXh0dXJlLmhlaWdodCAvIDM7XG59O1xuXG5Db25lLnByb3RvdHlwZS5jb2xsaXNpb24gPSBmdW5jdGlvbihvdGhlciwgcG9pbnRzKSB7ICAgIFxuICBpZiAob3RoZXIuaWQubWF0Y2goL2JhbGwvKSkge1xuICAgIG90aGVyLmtpY2tlZEJ5ID0gdGhpcy5pbmRleDtcbiAgICBodWIuc2VuZCgnZW5naW5lLnNvdW5kLnBsYXknLCB7ZmlsZTogJy9nYW1lL3NvdW5kcy9ib3VuY2UubXAzJ30pO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IENvbmU7XG4iLCJ2YXIgUEYgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvcGh5c2ljcy1mYWN0b3J5Jyk7XG52YXIgR0YgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZ3JhcGhpY3MtZmFjdG9yeScpO1xudmFyIEVudGl0eSAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2VudGl0eScpO1xudmFyIGh1YiAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2h1YicpO1xuXG5mdW5jdGlvbiBHb2FsKGlkLCBwbGF5ZXJJbmRleCwgeCwgeSwgd2lkdGgsIGhlaWdodCwgcm90YXRpb24pIHtcbiAgdGhpcy5pZCA9IGlkO1xuICB0aGlzLnBsYXllckluZGV4ID0gcGxheWVySW5kZXg7XG4gIHRoaXMuYm9keVNwZWMgPSB7XG4gICAgYm9keTogUEYuc3RhdGljKHtcbiAgICAgIHg6IHgsXG4gICAgICB5OiB5LFxuICAgICAgYW5nbGU6IHJvdGF0aW9uIHx8IDBcbiAgICB9KSxcbiAgICBmaXh0dXJlOiBQRi5maXh0dXJlKHtcbiAgICAgIHNoYXBlOiAgICAgIFBGLnNoYXBlLmJveCh3aWR0aCwgaGVpZ2h0KSxcbiAgICAgIGR5bmFtaWNzOiAgIHtkZW5zaXR5OiAxLCBmcmljdGlvbjogMCwgcmVzdGl0dXRpb246IDF9LFxuICAgICAgY2F0ZWdvcnk6ICAgUEYuY2F0ZWdvcmllcy5BUkVOQSxcbiAgICAgIGNvbGxpc2lvbjogIFBGLmNhdGVnb3JpZXMuQUxMXG4gICAgfSlcbiAgfTtcbiAgLy8gdGhpcy5zcHJpdGUgPSBHRi5zcHJpdGUoJy9nYW1lL2ltYWdlcy9nb2FsLnBuZycsIHdpZHRoLCBoZWlnaHQsIHJvdGF0aW9uKTtcbn1cblxuR29hbC5wcm90b3R5cGUgPSBuZXcgRW50aXR5KCk7XG5cbkdvYWwucHJvdG90eXBlLmNvbGxpc2lvbiA9IGZ1bmN0aW9uKG90aGVyLCBwb2ludHMpIHsgICAgXG4gIGlmIChvdGhlci5pZC5tYXRjaCgvYmFsbDovKSkge1xuICAgIGh1Yi5zZW5kKCdnYW1lLnNjb3JlJywge1xuICAgICAgYmFsbDogb3RoZXIsXG4gICAgICBhZ2FpbnN0SW5kZXg6IHRoaXMucGxheWVySW5kZXgsXG4gICAgfSk7XG4gICAgaHViLnNlbmQoJ2VuZ2luZS5leHBsb3Npb24nLCB7XG4gICAgICBzb3VyY2U6IHBvaW50c1swXSxcbiAgICAgIHNpemU6ICdsYXJnZSdcbiAgICB9KTtcbiAgfVxufTtcblxuR29hbC5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24oZGVsdGEpIHtcbiAgRW50aXR5LnByb3RvdHlwZS51cGRhdGUuY2FsbCh0aGlzLCBkZWx0YSk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEdvYWw7XG4iXX0=
;