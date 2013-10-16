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

},{"../../../3rdparty/underscore-min":12,"./graphics-engine":13,"./physics-engine":14,"./sound-engine":15,"./particle-engine":16,"./ticker":17,"./entitytracker":18,"./time":19,"./hub":9}],7:[function(require,module,exports){
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

},{"./world":8,"./sequencer":20,"../engine/hub":9,"./entities/ball":21,"./entities/action-text":22,"./states/warmup":23,"./states/kickoff":24,"./states/play":25,"./states/scored":26,"./states/endofmatch":27}],6:[function(require,module,exports){
var _             = require('../../../3rdparty/underscore-min');
var Leaderboard   = require('./entities/Leaderboard');
var Title         = require('./entities/Title');
var About         = require('./entities/About');
var hub           = require('../engine/hub');
var TwLogo        = require('./entities/tw-logo');

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
  if (this.current % 4 === 1) engine.addEntity(new Leaderboard('leaderboard'));
  if (this.current % 4 === 2) engine.addEntity(new Title('title'));
  if (this.current % 4 === 3) engine.addEntity(new TwLogo('twlogo'));
  if (this.current % 4 === 0) engine.addEntity(new About('about'));
};

Intro.prototype.removeAll = function(engine) {
  engine.deleteEntity('title');
  engine.deleteEntity('twlogo');
  engine.deleteEntity('leaderboard');
  engine.deleteEntity('about');
};

module.exports = Intro;

},{"../../../3rdparty/underscore-min":12,"./entities/Leaderboard":28,"./entities/Title":29,"./entities/About":30,"../engine/hub":9,"./entities/tw-logo":31}],9:[function(require,module,exports){
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

},{"../../../3rdparty/eve":32}],11:[function(require,module,exports){
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

},{}],32:[function(require,module,exports){
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
  'intro-about', 'intro-leaderboard', 'intro-title', 'intro-tw',
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

},{"./user-interface":33,"./world":34}],14:[function(require,module,exports){
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

},{"./world":34}],15:[function(require,module,exports){
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

},{"../../../3rdparty/underscore-min":12,"./hub":9,"./explosion":35}],20:[function(require,module,exports){
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

},{"../../../3rdparty/underscore-min":12}],21:[function(require,module,exports){
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

},{"../../engine/physics-factory":36,"../../engine/graphics-factory":37,"../../engine/entity":38,"../../engine/world":34,"../../engine/math-utils":39,"../../engine/hub":9,"../../assets":10}],22:[function(require,module,exports){
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

},{"../../engine/graphics-factory":37,"../../engine/entity":38,"../../engine/user-interface":33}],23:[function(require,module,exports){
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

},{"../../engine/graphics-factory":37,"../entities/stadium":40,"../entities/crowd":41,"../entities/player":42,"../entities/hud":43,"../entities/action-text":22,"../world":8}],24:[function(require,module,exports){
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

},{"../../../../3rdparty/underscore-min":12,"../../engine/graphics-factory":37,"../../engine/hub":9,"../entities/ball":21,"../entities/action-text":22,"../world":8}],25:[function(require,module,exports){
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

},{"../time-based-message":44,"../../engine/math-utils":39}],26:[function(require,module,exports){
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

},{"../entities/action-text":22,"../entities/boom":45,"../../engine/hub":9}],27:[function(require,module,exports){
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

},{"../entities/winner":46,"../../engine/hub":9}],28:[function(require,module,exports){
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
},{"../../engine/entity":38,"../../engine/graphics-factory":37,"../../engine/user-interface":33,"../../assets":10}],29:[function(require,module,exports){
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

},{"../../engine/entity":38,"../../engine/graphics-factory":37,"../../engine/user-interface":33,"../../assets":10}],30:[function(require,module,exports){
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

},{"../../engine/entity":38,"../../engine/graphics-factory":37,"../../engine/user-interface":33,"../../assets":10}],31:[function(require,module,exports){
var Entity        = require('../../engine/entity')
var GF            = require('../../engine/graphics-factory');
var userInterface = require('../../engine/user-interface');
var assets        = require('../../assets');

function TwLogo(id) {
  
  this.id = id;
  this.sprite = GF.uiSprite(assets.image('intro-tw'), userInterface.width, userInterface.height);

};

TwLogo.prototype = new Entity();

module.exports = TwLogo;

},{"../../engine/entity":38,"../../engine/graphics-factory":37,"../../engine/user-interface":33,"../../assets":10}],33:[function(require,module,exports){

exports.width  = 0;
exports.height = 0;

exports.resize = function(w, h) {
  exports.width  = w;
  exports.height = h;
};

exports.unit = function(n) {
  return (exports.width / 100) * n
}
},{}],34:[function(require,module,exports){

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

},{}],39:[function(require,module,exports){

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

},{}],35:[function(require,module,exports){
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
},{"../../../3rdparty/underscore-min":12,"./entity":38,"./hub":9,"./world":34,"./math-utils":39}],36:[function(require,module,exports){
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
  

},{"../../../3rdparty/underscore-min":12}],37:[function(require,module,exports){
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

},{"../../../3rdparty/underscore-min":12,"./world":34}],38:[function(require,module,exports){
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

},{"../../../3rdparty/underscore-min":12,"./world":34}],44:[function(require,module,exports){
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

},{"../../engine/compound-entity":47,"./wall":48,"./background":49,"./cone":50,"./goal":51,"../world":8}],41:[function(require,module,exports){
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

},{"../../engine/entity":38,"../../assets":10,"../../engine/hub":9}],42:[function(require,module,exports){
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

},{"../../engine/graphics-factory":37,"../../engine/physics-factory":36,"../../engine/entity":38,"../world":8,"../../engine/hub":9,"../../assets":10}],46:[function(require,module,exports){
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

},{"../../engine/entity":38,"../../engine/graphics-factory":37,"../../engine/user-interface":33}],45:[function(require,module,exports){
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

},{"../../engine/graphics-factory":37,"../../engine/entity":38,"../../engine/user-interface":33,"../../engine/math-utils":39,"../../assets":10}],43:[function(require,module,exports){
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

},{"../../engine/entity":38,"../../engine/graphics-factory":37,"../../engine/user-interface":33}],47:[function(require,module,exports){
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

},{"../../../3rdparty/underscore-min":12,"./entity":38}],49:[function(require,module,exports){
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

},{"../../engine/graphics-factory":37,"../../engine/world":34,"../../engine/entity":38,"../../assets":10,"../world":8}],50:[function(require,module,exports){
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

},{"../../../../3rdparty/underscore-min":12,"../../engine/physics-factory":36,"../../engine/graphics-factory":37,"../../engine/entity":38,"../../engine/world":34,"../../engine/hub":9,"../../assets":10}],48:[function(require,module,exports){
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

},{"../../engine/physics-factory":36,"../../engine/graphics-factory":37,"../../engine/entity":38,"../../engine/world":34}],51:[function(require,module,exports){
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

},{"../../engine/graphics-factory":37,"../../engine/physics-factory":36,"../../engine/entity":38,"../../engine/hub":9}]},{},[1])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL21haW4uanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2JyaWRnZS1rZXlib2FyZC5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS93b3JsZC5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvYXNzZXQtbG9hZGVyLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9icmlkZ2Utc29ja2V0LmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvZW5naW5lLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9nYW1lL2dhbWUuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2ludHJvL2ludHJvLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvaHViLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvM3JkcGFydHkvc29ja2V0LmlvLm1pbi5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzLzNyZHBhcnR5L3VuZGVyc2NvcmUtbWluLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvdGlja2VyLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvZW50aXR5dHJhY2tlci5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZW5naW5lL3RpbWUuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy8zcmRwYXJ0eS9ldmUuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2Fzc2V0cy5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZW5naW5lL2dyYXBoaWNzLWVuZ2luZS5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZW5naW5lL3BoeXNpY3MtZW5naW5lLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvc291bmQtZW5naW5lLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvcGFydGljbGUtZW5naW5lLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9nYW1lL3NlcXVlbmNlci5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS9lbnRpdGllcy9iYWxsLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9nYW1lL2VudGl0aWVzL2FjdGlvbi10ZXh0LmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9nYW1lL3N0YXRlcy93YXJtdXAuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvc3RhdGVzL2tpY2tvZmYuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvc3RhdGVzL3BsYXkuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvc3RhdGVzL3Njb3JlZC5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS9zdGF0ZXMvZW5kb2ZtYXRjaC5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvaW50cm8vZW50aXRpZXMvTGVhZGVyYm9hcmQuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2ludHJvL2VudGl0aWVzL1RpdGxlLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9pbnRyby9lbnRpdGllcy9BYm91dC5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvaW50cm8vZW50aXRpZXMvdHctbG9nby5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZW5naW5lL3VzZXItaW50ZXJmYWNlLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvd29ybGQuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2VuZ2luZS9tYXRoLXV0aWxzLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvZXhwbG9zaW9uLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvcGh5c2ljcy1mYWN0b3J5LmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvZ3JhcGhpY3MtZmFjdG9yeS5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZW5naW5lL2VudGl0eS5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS90aW1lLWJhc2VkLW1lc3NhZ2UuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvZW50aXRpZXMvc3RhZGl1bS5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS9lbnRpdGllcy9jcm93ZC5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS9lbnRpdGllcy9wbGF5ZXIuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvZW50aXRpZXMvd2lubmVyLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9nYW1lL2VudGl0aWVzL2Jvb20uanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvZW50aXRpZXMvaHVkLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvY29tcG91bmQtZW50aXR5LmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9nYW1lL2VudGl0aWVzL2JhY2tncm91bmQuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvZW50aXRpZXMvY29uZS5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS9lbnRpdGllcy93YWxsLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9nYW1lL2VudGl0aWVzL2dvYWwuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTs7QUNEQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25YQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsidmFyIGFzc2V0TG9hZGVyICAgICA9IHJlcXVpcmUoJy4vYXNzZXQtbG9hZGVyJyk7XG52YXIgYnJpZGdlU29ja2V0ICAgID0gcmVxdWlyZSgnLi9icmlkZ2Utc29ja2V0Jyk7XG52YXIgYnJpZGdlS2V5Ym9hcmQgID0gcmVxdWlyZSgnLi9icmlkZ2Uta2V5Ym9hcmQnKTtcbnZhciBFbmdpbmUgICAgICAgICAgPSByZXF1aXJlKCcuL2VuZ2luZS9lbmdpbmUnKTtcbnZhciBJbnRybyAgICAgICAgICAgPSByZXF1aXJlKCcuL2ludHJvL2ludHJvJylcbnZhciBHYW1lICAgICAgICAgICAgPSByZXF1aXJlKCcuL2dhbWUvZ2FtZScpO1xudmFyIHdvcmxkICAgICAgICAgICA9IHJlcXVpcmUoJy4vZ2FtZS93b3JsZCcpO1xudmFyIGh1YiAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vZW5naW5lL2h1YicpO1xuXG53aW5kb3cuTWFpbiA9IGZ1bmN0aW9uKCkge1xuICBhc3NldExvYWRlci5wcmVsb2FkQW5kUnVuKG1haW5Mb29wKTtcbn07XG5cbmZ1bmN0aW9uIG1haW5Mb29wKCkge1xuICBcbiAgdmFyIGNvbnRhaW5lciAgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjY29udGFpbmVyJyk7XG4gIHZhciBnYW1lVmlldyAgID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2dhbWVWaWV3Jyk7XG4gIHZhciBkZWJ1Z1ZpZXcgID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2RlYnVnVmlldycpO1xuICBcbiAgZGVidWdWaWV3LmhlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodDtcbiAgZGVidWdWaWV3LndpZHRoICA9IHdpbmRvdy5pbm5lcldpZHRoO1xuICBnYW1lVmlldy5oZWlnaHQgID0gd2luZG93LmlubmVySGVpZ2h0O1xuICBnYW1lVmlldy53aWR0aCAgID0gd2luZG93LmlubmVyV2lkdGg7XG4gIFxuICB2YXIgZW5naW5lID0gbmV3IEVuZ2luZSh3b3JsZCwgZ2FtZVZpZXcsIGRlYnVnVmlldyk7XG4gIHZhciBnYW1lICAgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIHNob3dJbnRybygpIHtcbiAgICBjbGVhbnVwKCk7XG4gICAgZW5naW5lLmF0dGFjaChuZXcgSW50cm8oZW5naW5lKSk7XG4gIH1cblxuICBmdW5jdGlvbiBtYXRjaFN0YXJ0KHBsYXllcnMpIHtcbiAgICBjbGVhbnVwKCk7XG4gICAgaWYgKCFnYW1lKSB7XG4gICAgICBnYW1lID0gbmV3IEdhbWUoZW5naW5lLCBwbGF5ZXJzKTtcbiAgICAgIGVuZ2luZS5hdHRhY2goZ2FtZSk7XG4gICAgICBodWIub24oJ2dhbWUuZmluaXNoJywgZW5kTWF0Y2hPblNlcnZlcik7XG4gICAgfVxuICB9XG4gIFxuICBmdW5jdGlvbiBwbGF5ZXJNb3ZlKGFyZ3MpIHsgICAgXG4gICAgaWYgKGdhbWUpIHtcbiAgICAgIGdhbWUubW92ZShhcmdzLnBpbmRleCwgYXJncy5kaXIpO1xuICAgIH1cbiAgfVxuICBcbiAgZnVuY3Rpb24gZW5kTWF0Y2hPblNlcnZlcigpIHtcbiAgICAkLnBvc3QoJy9nYW1lL3N0YXR1cycsIHtcbiAgICAgIHN0YXR1czogJ2ZpbmlzaGVkJyxcbiAgICAgIHBsYXllcnM6IGdhbWUucGxheWVycy5tYXAoZnVuY3Rpb24ocGxheWVyKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgaWQ6IHBsYXllci5pZCxcbiAgICAgICAgICBzY29yZTogcGxheWVyLnNjb3JlXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfSkudGhlbihzaG93SW50cm8pLmZhaWwoc2hvd0ludHJvKTtcbiAgfVxuICBcbiAgZnVuY3Rpb24gY2xlYW51cCgpIHtcbiAgICBodWIudW5iaW5kKCdnYW1lLionKTtcbiAgICBlbmdpbmUuZGV0YWNoKCk7XG4gICAgZW5naW5lLnJlc2V0KCk7XG4gICAgZ2FtZSA9IG51bGw7XG4gIH0gIFxuXG4gIGVuZ2luZS5zdGFydCgpO1xuICBzaG93SW50cm8oKTtcbiAgYnJpZGdlS2V5Ym9hcmQuY29ubmVjdChtYXRjaFN0YXJ0LCBwbGF5ZXJNb3ZlKTtcbiAgYnJpZGdlU29ja2V0LmNvbm5lY3QobWF0Y2hTdGFydCwgcGxheWVyTW92ZSk7XG59XG4iLCJcbmV4cG9ydHMuY29ubmVjdCA9IGZ1bmN0aW9uKG1hdGNoU3RhcnQsIHBsYXllck1vdmUpIHtcblxuICB2YXIga2V5ZG93biAgICAgICA9ICQoZG9jdW1lbnQpLmtleWRvd25Bc09ic2VydmFibGUoKS5zZWxlY3Qoa2V5Q29kZSk7XG4gIHZhciBrZXl1cCAgICAgICAgID0gJChkb2N1bWVudCkua2V5dXBBc09ic2VydmFibGUoKTtcbiAgdmFyIHNpbmdsZWRvd24gICAgPSBrZXlkb3duLm1lcmdlKGtleXVwKS5kaXN0aW5jdFVudGlsQ2hhbmdlZCgpO1xuICBcbiAgc2luZ2xlZG93bi53aGVyZShrZXkoMTMpKS5zdWJzY3JpYmUoc3RhcnQpO1xuICBzaW5nbGVkb3duLndoZXJlKGxldHRlcignUScpKS5zdWJzY3JpYmUobW92ZSgwLCAndXAnKSk7XG4gIHNpbmdsZWRvd24ud2hlcmUobGV0dGVyKCdTJykpLnN1YnNjcmliZShtb3ZlKDAsICdkb3duJykpO1xuICBzaW5nbGVkb3duLndoZXJlKGxldHRlcignUCcpKS5zdWJzY3JpYmUobW92ZSgxLCAndXAnKSk7XG4gIHNpbmdsZWRvd24ud2hlcmUobGV0dGVyKCdMJykpLnN1YnNjcmliZShtb3ZlKDEsICdkb3duJykpO1xuXG4gIGZ1bmN0aW9uIGtleUNvZGUoZSkge1xuICAgIHJldHVybiBlLmtleUNvZGU7XG4gIH1cblxuICBmdW5jdGlvbiBrZXkoYykge1xuICAgIHJldHVybiBmdW5jdGlvbihjb2RlKSB7XG4gICAgICByZXR1cm4gY29kZSA9PT0gYztcbiAgICB9O1xuICB9XG4gIFxuICBmdW5jdGlvbiBsZXR0ZXIobCkge1xuICAgIHJldHVybiBmdW5jdGlvbihjb2RlKSB7XG4gICAgICByZXR1cm4gY29kZSA9PT0gbC5jaGFyQ29kZUF0KDApO1xuICAgIH07XG4gIH1cbiAgXG4gIGZ1bmN0aW9uIHN0YXJ0KCkge1xuICAgIG1hdGNoU3RhcnQoW1xuICAgICAgeyBpZDogJzEnLCBmaXJzdE5hbWU6ICdKb2huJywgbGFzdE5hbWU6ICdEb2UnICAgfSxcbiAgICAgIHsgaWQ6ICcyJywgZmlyc3ROYW1lOiAnQmlsbCcsIGxhc3ROYW1lOiAnQ29zYnknIH1cbiAgICBdKTtcbiAgfVxuICBcbiAgZnVuY3Rpb24gbW92ZShpbmRleCwgZGlyKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkgeyBcbiAgICAgIGNvbnNvbGUubG9nKCdba2V5Ym9hcmRdIG1vdmUgJyArIGluZGV4ICsgJyAnICsgZGlyKTtcbiAgICAgIHBsYXllck1vdmUoe1xuICAgICAgICBwaW5kZXg6IGluZGV4LFxuICAgICAgICBkaXI6IGRpclxuICAgICAgfSk7XG4gICAgfTtcbiAgfVxuICBcbn07XG4iLCJcbi8vIFRoZSBiaWcgVFYgZm9yIHRoZSBnYW1lIGlzIDE2OjlcbmV4cG9ydHMud2lkdGggID0gNjA7XG5leHBvcnRzLmhlaWdodCA9IDYwIC8gKDE2LzkpO1xuIiwidmFyIGFzc2V0cyA9IHJlcXVpcmUoJy4vYXNzZXRzJyk7XG5cbmZ1bmN0aW9uIGxvYWRJbWFnZXMoY2FsbGJhY2spIHtcbiAgdmFyIGFzc2V0TG9hZGVyID0gbmV3IFBJWEkuQXNzZXRMb2FkZXIoYXNzZXRzLmFsbEltYWdlcygpKTtcbiAgYXNzZXRMb2FkZXIub25Db21wbGV0ZSA9IGNhbGxiYWNrO1xuICBhc3NldExvYWRlci5sb2FkKCk7XG59XG5cbmZ1bmN0aW9uIGxvYWRGb250cyhjYWxsYmFjaykge1xuICBXZWJGb250LmxvYWQoe1xuICAgIGFjdGl2ZTogY2FsbGJhY2ssXG4gICAgY3VzdG9tOiB7XG4gICAgICBmYW1pbGllczogWydMdWNraWVzdEd1eSddLFxuICAgICAgdXJsczogWycvM3JkcGFydHkvbHVja2llc3QtZ3V5LmNzcyddLFxuICAgIH1cbiAgfSk7XG59XG5cbmV4cG9ydHMucHJlbG9hZEFuZFJ1biA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gIGxvYWRJbWFnZXMoZnVuY3Rpb24oKSB7XG4gICAgbG9hZEZvbnRzKGZ1bmN0aW9uKCkge1xuICAgICAgY2FsbGJhY2soKTtcbiAgICB9KTtcbiAgfSk7XG59XG4iLCJ2YXIgaW8gPSByZXF1aXJlKCcuLi8uLi8zcmRwYXJ0eS9zb2NrZXQuaW8ubWluJyk7XG5cbmV4cG9ydHMuY29ubmVjdCA9IGZ1bmN0aW9uKG1hdGNoU3RhcnQsIHBsYXllck1vdmUpIHtcblxuICBmdW5jdGlvbiBvcGVuU29ja2V0KCkge1xuICAgIHZhciBzb2NrZXQgPSBpby5jb25uZWN0KCcvJywge1xuICAgICAgJ3JlY29ubmVjdCc6IGZhbHNlLFxuICAgICAgJ2ZvcmNlIG5ldyBjb25uZWN0aW9uJzogdHJ1ZVxuICAgIH0pO1xuXG4gICAgc29ja2V0Lm9uKCdjb25uZWN0JywgZnVuY3Rpb24oKXtcbiAgICAgIGNvbnNvbGUubG9nKFwiY29ubmVjdGVkIVwiKTtcbiAgICAgIHNvY2tldC5lbWl0KCdpZGVudGlmeScpXG4gICAgfSk7XG5cbiAgICBzb2NrZXQub24oJ21hdGNoLXN0YXJ0JywgbWF0Y2hTdGFydCk7XG4gICAgc29ja2V0Lm9uKCdwbGF5ZXItYWN0aW9uJywgcGxheWVyQWN0aW9uKTtcblxuICAgIHNvY2tldC5vbignZGlzY29ubmVjdCcsIGZ1bmN0aW9uKCl7XG4gICAgICBjb25zb2xlLmxvZyhcInNvY2tldCBkaXNjb25uZWN0ZWRcIik7XG4gICAgICBvcGVuU29ja2V0KCk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBwbGF5ZXJBY3Rpb24oYXJncykge1xuICAgIGlmIChhcmdzLmFjdGlvbiA9PT0gJ3VwJykge1xuICAgICAgY29uc29sZS5sb2coJ1tzb2NrZXRdIG1vdmUgJyAgKyBhcmdzLnBpbmRleCArICcgdXAnKTtcbiAgICAgIHBsYXllck1vdmUoe3BpbmRleDogYXJncy5waW5kZXgsIGRpcjogJ3VwJ30pO1xuICAgIH0gZWxzZSBpZiAoYXJncy5hY3Rpb24gPT09ICdkb3duJykge1xuICAgICAgY29uc29sZS5sb2coJ1tzb2NrZXRdIG1vdmUgJyAgKyBhcmdzLnBpbmRleCArICcgZG93bicpO1xuICAgICAgcGxheWVyTW92ZSh7cGluZGV4OiBhcmdzLnBpbmRleCwgZGlyOiAnZG93bid9KTtcbiAgICB9XG4gIH1cblxuICBvcGVuU29ja2V0KCk7XG59O1xuIiwidmFyIF8gICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uLy4uLzNyZHBhcnR5L3VuZGVyc2NvcmUtbWluJyk7XG52YXIgR3JhcGhpY3NFbmdpbmUgID0gcmVxdWlyZSgnLi9ncmFwaGljcy1lbmdpbmUnKTtcbnZhciBQaHlzaWNzRW5naW5lICAgPSByZXF1aXJlKCcuL3BoeXNpY3MtZW5naW5lJyk7XG52YXIgU291bmRFbmdpbmUgICAgID0gcmVxdWlyZSgnLi9zb3VuZC1lbmdpbmUnKTtcbnZhciBQYXJ0aWNsZUVuZ2luZSAgPSByZXF1aXJlKCcuL3BhcnRpY2xlLWVuZ2luZScpO1xudmFyIHRpY2tlciAgICAgICAgICA9IHJlcXVpcmUoJy4vdGlja2VyJyk7XG52YXIgRW50aXR5VHJhY2tlciAgID0gcmVxdWlyZSgnLi9lbnRpdHl0cmFja2VyJyk7XG52YXIgVGltZSAgICAgICAgICAgID0gcmVxdWlyZSgnLi90aW1lJyk7XG52YXIgaHViICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9odWInKTtcblxuXG5mdW5jdGlvbiBFbmdpbmUod29ybGQsIG1haW5WaWV3LCBkZWJ1Z1ZpZXcpIHtcbiAgXG4gIHRoaXMubmV4dFRpY2tBY3Rpb25zICA9IFtdO1xuICBcbiAgdGhpcy5ncmFwaGljcyAgICAgPSBuZXcgR3JhcGhpY3NFbmdpbmUod29ybGQsIG1haW5WaWV3LCBkZWJ1Z1ZpZXcpO1xuICB0aGlzLnBoeXNpY3MgICAgICA9IG5ldyBQaHlzaWNzRW5naW5lKC8qZGVidWdWaWV3Ki8pO1xuICB0aGlzLnNvdW5kICAgICAgICA9IG5ldyBTb3VuZEVuZ2luZSgpO1xuICB0aGlzLnBhcnRpY2xlcyAgICA9IG5ldyBQYXJ0aWNsZUVuZ2luZSh0aGlzKTtcbiAgdGhpcy50cmFja2VyICAgICAgPSBuZXcgRW50aXR5VHJhY2tlcigpO1xuICB0aGlzLnRpbWUgICAgICAgICA9IG5ldyBUaW1lKCk7XG4gIFxuICAvLyBObyBnYW1lIGF0dGFjaGVkIHlldFxuICB0aGlzLmdhbWUgPSBudWxsO1xuICAgIFxuICB0aGlzLnBoeXNpY3MuY29sbGlzaW9uKGZ1bmN0aW9uKGZpeHR1cmVBLCBmaXh0dXJlQiwgcG9pbnRzKSB7XG4gICAgdmFyIGVudGl0eUEgPSBmaXh0dXJlQS5HZXRVc2VyRGF0YSgpO1xuICAgIHZhciBlbnRpdHlCID0gZml4dHVyZUIuR2V0VXNlckRhdGEoKTtcbiAgICBpZiAoZW50aXR5QSAmJiBlbnRpdHlCKSB7XG4gICAgICBlbnRpdHlBLmNvbGxpc2lvbihlbnRpdHlCLCBwb2ludHMpO1xuICAgICAgZW50aXR5Qi5jb2xsaXNpb24oZW50aXR5QSwgcG9pbnRzKTsgICAgICBcbiAgICB9XG4gIH0pO1xuICAgXG4gIGh1Yi5pbnRlcmNlcHRvciA9IF8uYmluZCh0aGlzLnF1ZXVlTmV4dCwgdGhpcyk7XG4gIFxuICBodWIub24oJ2VudGl0eTpkZXN0cm95JywgZnVuY3Rpb24ocGFyYW1zKSB7XG4gICAgdGhpcy5kZWxldGVFbnRpdHkocGFyYW1zLmVudGl0eS5pZClcbiAgfS5iaW5kKHRoaXMpKTtcbiAgXG59O1xuXG5FbmdpbmUucHJvdG90eXBlLnN0YXJ0ID0gZnVuY3Rpb24oKSB7XG4gIHRpY2tlci5ydW4odGhpcy51cGRhdGUuYmluZCh0aGlzKSk7XG59O1xuXG5FbmdpbmUucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbigpIHtcbiAgdGlja2VyLnN0b3AoKTtcbn07XG5cbkVuZ2luZS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMudGltZS51cGRhdGUoKTtcbiAgdGhpcy5waHlzaWNzLnVwZGF0ZSgpO1xuICB0aGlzLnRyYWNrZXIuZm9yRWFjaChmdW5jdGlvbihlbnRpdHkpIHtcbiAgICBlbnRpdHkudXBkYXRlKHRoaXMsIHRoaXMuZ2FtZSwgdGhpcy50aW1lLmRlbHRhKTtcbiAgfS5iaW5kKHRoaXMpKTtcbiAgaWYgKHRoaXMuZ2FtZSkge1xuICAgIHRoaXMuZ2FtZS51cGRhdGUodGhpcywgdGhpcy50aW1lLmRlbHRhKTtcbiAgfVxuICB0aGlzLmdyYXBoaWNzLnJlbmRlcigpO1xuICBcbiAgdmFyIG5leHRBY3Rpb24gPSBudWxsO1xuICB3aGlsZSAobmV4dEFjdGlvbiA9IHRoaXMubmV4dFRpY2tBY3Rpb25zLnBvcCgpKSB7XG4gICAgbmV4dEFjdGlvbi5jYWxsKHRoaXMpO1xuICB9XG59O1xuXG5FbmdpbmUucHJvdG90eXBlLnF1ZXVlTmV4dCA9IGZ1bmN0aW9uKGFjdGlvbikge1xuICB0aGlzLm5leHRUaWNrQWN0aW9ucy5wdXNoKGFjdGlvbik7XG59O1xuXG5FbmdpbmUucHJvdG90eXBlLmFkZEVudGl0eSA9IGZ1bmN0aW9uKGVudGl0eSkge1xuICBpZiAoZW50aXR5LmlkKSB7XG4gICAgdGhpcy50cmFja2VyLnRyYWNrKGVudGl0eSk7XG4gICAgZW50aXR5LmNyZWF0ZSh0aGlzLCB0aGlzLmdhbWUpO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUubG9nKCdFbnRpdHkgc2hvdWxkIGhhdmUgYW4gSUQnLCBlbnRpdHkpO1xuICB9XG59O1xuXG5FbmdpbmUucHJvdG90eXBlLmRlbGV0ZUVudGl0eSA9IGZ1bmN0aW9uKGlkKSB7XG4gIHZhciBlbnRpdHkgPSB0aGlzLnRyYWNrZXIuZmluZChpZCk7XG4gIGlmIChlbnRpdHkpIHtcbiAgICBlbnRpdHkuZGVzdHJveSh0aGlzLCB0aGlzLmdhbWUpO1xuICAgIHRoaXMudHJhY2tlci5mb3JnZXQoZW50aXR5KTtcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLmxvZygnRW50aXR5IG5vdCBmb3VuZCcsIGVudGl0eSk7XG4gIH1cbn07XG5cbkVuZ2luZS5wcm90b3R5cGUuZGVsZXRlRW50aXR5TWF0Y2hpbmcgPSBmdW5jdGlvbihyZWdleCkge1xuICB2YXIgZW50aXRpZXMgPSB0aGlzLnRyYWNrZXIuZmluZE1hdGNoaW5nKHJlZ2V4KVxuICBlbnRpdGllcy5mb3JFYWNoKGZ1bmN0aW9uKGVudGl0eSkge1xuICAgIGVudGl0eS5kZXN0cm95KHRoaXMsIHRoaXMuZ2FtZSlcbiAgICB0aGlzLnRyYWNrZXIuZm9yZ2V0KGVudGl0eSlcbiAgfS5iaW5kKHRoaXMpKVxufVxuXG5FbmdpbmUucHJvdG90eXBlLmdldEVudGl0eSA9IGZ1bmN0aW9uKGlkKSB7XG4gIHJldHVybiB0aGlzLnRyYWNrZXIuZmluZChpZCk7XG59O1xuXG5FbmdpbmUucHJvdG90eXBlLmF0dGFjaCA9IGZ1bmN0aW9uKGdhbWUpIHtcbiAgdGhpcy5nYW1lID0gZ2FtZTtcbn07XG5cbkVuZ2luZS5wcm90b3R5cGUuZGV0YWNoID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmdhbWUpIHtcbiAgICB0aGlzLmdhbWUuZGVzdHJveSh0aGlzKTtcbiAgfVxuICB0aGlzLmdhbWUgPSBudWxsO1xufTtcblxuRW5naW5lLnByb3RvdHlwZS5yZXNldCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLnRyYWNrZXIuZm9yRWFjaChmdW5jdGlvbihlbnRpdHkpIHtcbiAgICBlbnRpdHkuZGVzdHJveSh0aGlzLCBudWxsKTtcbiAgfS5iaW5kKHRoaXMpKTtcbiAgdGhpcy50cmFja2VyLmZvcmdldEFsbCgpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBFbmdpbmU7XG4iLCJ2YXIgU2VxdWVuY2VyICAgPSByZXF1aXJlKCcuL3NlcXVlbmNlcicpO1xudmFyIHdvcmxkICAgICAgID0gcmVxdWlyZSgnLi93b3JsZCcpO1xudmFyIGh1YiAgICAgICAgID0gcmVxdWlyZSgnLi4vZW5naW5lL2h1YicpO1xuXG52YXIgQmFsbCAgICAgICAgPSByZXF1aXJlKCcuL2VudGl0aWVzL2JhbGwnKTtcbnZhciB3b3JsZCAgICAgICA9IHJlcXVpcmUoJy4vd29ybGQnKTtcbnZhciBBY3Rpb25UZXh0ICA9IHJlcXVpcmUoJy4vZW50aXRpZXMvYWN0aW9uLXRleHQnKTtcblxuZnVuY3Rpb24gR2FtZShlbmdpbmUsIHBsYXllckluZm8pIHtcblxuICAvLyB0d28gcGxheWVycyBpbiB0aGUgY3VycmVudCBtYXRjaFxuICAvLyBvciBtYXliZSB0aGlzIGJlbG9uZ3MgaW4gdGhlIFBsYXllciBlbnRpdHk/XG4gIHRoaXMucGxheWVycyA9IHBsYXllckluZm8ubWFwKGZ1bmN0aW9uKHApIHtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IHAuaWQsXG4gICAgICBuYW1lOiBwLmZpcnN0TmFtZSArICcgJyArIHAubGFzdE5hbWUuc3Vic3RyKDAsMSksXG4gICAgICBzY29yZTogMFxuICAgIH1cbiAgfSk7XG4gIHRoaXMucm91bmROdW1iZXIgPSAxXG5cbiAgdmFyIHN0YXRlcyA9IHtcbiAgICAnd2FybXVwJzogICAgIHJlcXVpcmUoJy4vc3RhdGVzL3dhcm11cCcpLFxuICAgICdraWNrb2ZmJzogICAgcmVxdWlyZSgnLi9zdGF0ZXMva2lja29mZicpLFxuICAgICdwbGF5JzogICAgICAgcmVxdWlyZSgnLi9zdGF0ZXMvcGxheScpLFxuICAgICdzY29yZWQnOiAgICAgcmVxdWlyZSgnLi9zdGF0ZXMvc2NvcmVkJyksXG4gICAgJ2VuZG9mbWF0Y2gnOiByZXF1aXJlKCcuL3N0YXRlcy9lbmRvZm1hdGNoJylcbiAgfTtcblxuICB2YXIgdHJhbnNpdGlvbnMgPSBbXG4gICAgICB7ICAgbmFtZTogJ3N0YXJ0dXAnLCAgZnJvbTogJ25vbmUnLCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdG86ICd3YXJtdXAnICAgICAgIH0sXG4gICAgICB7ICAgbmFtZTogJ3JlYWR5JywgICAgZnJvbTogWyd3YXJtdXAnLCAnc2NvcmVkJ10sICAgICAgICAgICAgICAgICAgICAgdG86ICdraWNrb2ZmJyAgICAgIH0sXG4gICAgICB7ICAgbmFtZTogJ2dvJywgICAgICAgZnJvbTogWydzY29yZWQnLCAna2lja29mZiddLCAgICAgICAgICAgICAgICAgICAgdG86ICdwbGF5JyAgICAgICAgIH0sXG4gICAgICB7ICAgbmFtZTogJ3Njb3JlZCcsICAgZnJvbTogWydwbGF5JywgJ3Njb3JlZCcsICdraWNrb2ZmJ10sICAgICAgICAgICAgdG86ICdzY29yZWQnICAgICAgIH0sXG4gICAgICB7ICAgbmFtZTogJ2VuZCcsICAgICAgZnJvbTogWyd3YXJtdXAnLCAna2lja29mZicsICdwbGF5JywgJ3Njb3JlZCddLCAgdG86ICdlbmRvZm1hdGNoJyAgIH0sXG4gIF07XG4gIFxuICB0aGlzLmR1cmF0aW9uID0gNDU7XG4gIHRoaXMudGltZVJlbWFpbmluZyA9IHRoaXMuZHVyYXRpb24gKiAxMDAwO1xuICB0aGlzLmJhbGxzSW5QbGF5ID0gW11cbiAgXG4gIHRoaXMuZW5naW5lID0gZW5naW5lO1xuICB0aGlzLnNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoZW5naW5lLCB0aGlzLCBzdGF0ZXMsIHRyYW5zaXRpb25zKTtcbiAgdGhpcy5zZXF1ZW5jZXIuc3RhcnQoKTtcblxuICBodWIub24oJ2dhbWUuc2NvcmUnLCBmdW5jdGlvbihkYXRhKSB7XG4gICAgdGhpcy5zY29yZSgxIC0gZGF0YS5hZ2FpbnN0SW5kZXgpO1xuICAgIHRoaXMuc2VxdWVuY2VyLnRyYW5zaXRpb24oJ3Njb3JlZCcsIGRhdGEpO1xuICB9LmJpbmQodGhpcykpO1xuXG4gIGh1Yi5vbignZ2FtZS5lbmQnLCBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnNlcXVlbmNlci50cmFuc2l0aW9uKCdlbmQnKTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICBodWIub24oJ2dhbWUubXVsdGliYWxsJywgZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5tdWx0aWJhbGwoKVxuICB9LmJpbmQodGhpcykpXG59XG5cbkdhbWUucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKGVuZ2luZSwgZGVsdGEpIHtcbiAgdGhpcy5zZXF1ZW5jZXIuYWN0aXZlKCkudXBkYXRlKGRlbHRhKTtcbn07XG5cbkdhbWUucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbihlbmdpbmUpIHtcbiAgXG59O1xuXG5HYW1lLnByb3RvdHlwZS50cmFuc2l0aW9uID0gZnVuY3Rpb24obmFtZSwgYXJncykge1xuICB0aGlzLnNlcXVlbmNlci50cmFuc2l0aW9uKG5hbWUsIGFyZ3MpO1xufTtcblxuR2FtZS5wcm90b3R5cGUubWVzc2FnZSA9IGZ1bmN0aW9uKG1lc3NhZ2UsIGFyZ3MpIHtcbiAgdGhpcy5zZXF1ZW5jZXIuYWN0aXZlKCkub24obWVzc2FnZSwgYXJncyk7XG59O1xuXG5HYW1lLnByb3RvdHlwZS5zY29yZSA9IGZ1bmN0aW9uKHBsYXllckluZGV4KSB7XG4gIHRoaXMucm91bmROdW1iZXIgKz0gMVxuICB0aGlzLnBsYXllcnNbcGxheWVySW5kZXhdLnNjb3JlICs9IDE7XG59O1xuXG5HYW1lLnByb3RvdHlwZS5tb3ZlID0gZnVuY3Rpb24ocGluZGV4LCBkaXIpIHtcbiAgdmFyIHBsYXllciA9IHRoaXMuZW5naW5lLmdldEVudGl0eShwaW5kZXggPT09IDAgPyAncDEnIDogJ3AyJyk7XG4gIHBsYXllci5tb3ZlKGRpcik7XG59O1xuXG5HYW1lLnByb3RvdHlwZS5tdWx0aWJhbGwgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHRleHQgPSBuZXcgQWN0aW9uVGV4dCgnbXVsdGliYWxsJywgJ011bHRpLWJhbGwhJyk7XG4gIHRoaXMuZW5naW5lLmFkZEVudGl0eSh0ZXh0KVxuXG4gIGh1Yi5zZW5kKCdlbmdpbmUuc291bmQucGxheScsIHsgZmlsZTogJy9nYW1lL3NvdW5kcy9tdWx0aWJhbGwubXAzJyB9KVxuICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgIGh1Yi5zZW5kKCdlbmdpbmUuc291bmQucGxheScsIHsgZmlsZTogJy9nYW1lL3NvdW5kcy9zYXgubXAzJywgdm9sdW1lOiAwLjkgfSk7XG4gIH0sIDIwMDApO1xuXG4gIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5lbmdpbmUuZGVsZXRlRW50aXR5KHRleHQuaWQpXG4gICAgXG4gICAgdmFyIGJhbGwgPSB0aGlzLmNyZWF0ZUJhbGwoLTEsIDEpXG4gICAgYmFsbC5raWNrKDEpXG4gICAgYmFsbCA9IHRoaXMuY3JlYXRlQmFsbCgxLCAxKVxuICAgIGJhbGwua2ljaygxKVxuICAgIGJhbGwgPSB0aGlzLmNyZWF0ZUJhbGwoMSwgMSlcbiAgICBiYWxsLmtpY2soLTEpXG4gICAgYmFsbCA9IHRoaXMuY3JlYXRlQmFsbCgwLCAtMSlcbiAgICBiYWxsLmtpY2soLTEpXG4gIH0uYmluZCh0aGlzKSwgMTAwMClcbn1cblxuR2FtZS5wcm90b3R5cGUuY2xlYXJCYWxscyA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmJhbGxzSW5QbGF5LmZvckVhY2goZnVuY3Rpb24oYmFsbCkge1xuICAgIHRoaXMucmVtb3ZlQmFsbChiYWxsKVxuICB9LmJpbmQodGhpcykpXG4gIHRoaXMuYmFsbHNJblBsYXkgPSBbXVxufVxuXG5HYW1lLnByb3RvdHlwZS5yZW1vdmVCYWxsID0gZnVuY3Rpb24oYmFsbCkge1xuICB0aGlzLmVuZ2luZS5kZWxldGVFbnRpdHkoYmFsbC5pZClcbiAgdGhpcy5iYWxsc0luUGxheSA9IHRoaXMuYmFsbHNJblBsYXkuZmlsdGVyKGZ1bmN0aW9uKGIpIHsgcmV0dXJuIGIgIT09IGJhbGwgfSlcbn1cblxuR2FtZS5wcm90b3R5cGUuY3JlYXRlQmFsbCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgdmFyIGJhbGxTdGFydFkgPSBudWxsXG4gIHZhciBiYWxsU3RhcnRYID0gbnVsbFxuXG4gIGlmICh4ID09PSAtMSkge1xuICAgIGJhbGxTdGFydFggPSB3b3JsZC53aWR0aCAvIDVcbiAgfSBlbHNlIGlmICh4ID09PSAwKSB7XG4gICAgYmFsbFN0YXJ0WCA9IHdvcmxkLndpZHRoIC8gMlxuICB9IGVsc2Uge1xuICAgIGJhbGxTdGFydFggPSAod29ybGQud2lkdGggLyA1KSAqIDRcbiAgfVxuXG4gIGlmICh5ID09PSAtMSkge1xuICAgIGJhbGxTdGFydFkgPSB3b3JsZC5oZWlnaHQgLyA1XG4gIH0gZWxzZSBpZiAoeSA9PT0gMCkge1xuICAgIGJhbGxTdGFydFkgPSB3b3JsZC5oZWlnaHQgLyAyXG4gIH0gZWxzZSB7XG4gICAgYmFsbFN0YXJ0WSA9ICh3b3JsZC5oZWlnaHQgLyA1KSAqIDRcbiAgfVxuXG4gIHZhciBiYWxsID0gbmV3IEJhbGwoJ2JhbGw6Jyt0aGlzLmJhbGxzSW5QbGF5Lmxlbmd0aCwgYmFsbFN0YXJ0WCwgYmFsbFN0YXJ0WSlcblxuICB0aGlzLmVuZ2luZS5hZGRFbnRpdHkoYmFsbClcbiAgdGhpcy5iYWxsc0luUGxheS5wdXNoKGJhbGwpXG5cbiAgcmV0dXJuIGJhbGxcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBHYW1lO1xuIiwidmFyIF8gICAgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS91bmRlcnNjb3JlLW1pbicpO1xudmFyIExlYWRlcmJvYXJkICAgPSByZXF1aXJlKCcuL2VudGl0aWVzL0xlYWRlcmJvYXJkJyk7XG52YXIgVGl0bGUgICAgICAgICA9IHJlcXVpcmUoJy4vZW50aXRpZXMvVGl0bGUnKTtcbnZhciBBYm91dCAgICAgICAgID0gcmVxdWlyZSgnLi9lbnRpdGllcy9BYm91dCcpO1xudmFyIGh1YiAgICAgICAgICAgPSByZXF1aXJlKCcuLi9lbmdpbmUvaHViJyk7XG52YXIgVHdMb2dvICAgICAgICA9IHJlcXVpcmUoJy4vZW50aXRpZXMvdHctbG9nbycpO1xuXG5mdW5jdGlvbiBJbnRybyhlbmdpbmUpIHtcbiAgdGhpcy5jdXJyZW50ID0gMDtcbiAgdGhpcy5zd2l0Y2goZW5naW5lKTtcbiAgdGhpcy5zd2l0Y2hUaW1lciA9IHdpbmRvdy5zZXRJbnRlcnZhbChfLmJpbmQodGhpcy5zd2l0Y2gsIHRoaXMsIGVuZ2luZSksIDEwMDAwKTtcbiAgaHViLnNlbmQoJ2VuZ2luZS5zb3VuZC5wbGF5Jywge2ZpbGU6ICcvZ2FtZS9zb3VuZHMvaW50cm8ubXAzJywgbG9vcDogdHJ1ZSwgdm9sdW1lOiAwLjh9KTtcbn1cblxuSW50cm8ucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKGVuZ2luZSwgZGVsdGEpIHtcbn07XG5cbkludHJvLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oZW5naW5lKSB7XG4gIHRoaXMucmVtb3ZlQWxsKGVuZ2luZSk7XG4gIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5zd2l0Y2hUaW1lcik7XG4gIGh1Yi5zZW5kKCdlbmdpbmUuc291bmQuc3RvcCcsIHtmaWxlOiAnL2dhbWUvc291bmRzL2ludHJvLm1wMyd9KTtcbn07XG5cbkludHJvLnByb3RvdHlwZS5zd2l0Y2ggPSBmdW5jdGlvbihlbmdpbmUpIHtcbiAgdGhpcy5yZW1vdmVBbGwoZW5naW5lKTtcbiAgKyt0aGlzLmN1cnJlbnQ7XG4gIGlmICh0aGlzLmN1cnJlbnQgJSA0ID09PSAxKSBlbmdpbmUuYWRkRW50aXR5KG5ldyBMZWFkZXJib2FyZCgnbGVhZGVyYm9hcmQnKSk7XG4gIGlmICh0aGlzLmN1cnJlbnQgJSA0ID09PSAyKSBlbmdpbmUuYWRkRW50aXR5KG5ldyBUaXRsZSgndGl0bGUnKSk7XG4gIGlmICh0aGlzLmN1cnJlbnQgJSA0ID09PSAzKSBlbmdpbmUuYWRkRW50aXR5KG5ldyBUd0xvZ28oJ3R3bG9nbycpKTtcbiAgaWYgKHRoaXMuY3VycmVudCAlIDQgPT09IDApIGVuZ2luZS5hZGRFbnRpdHkobmV3IEFib3V0KCdhYm91dCcpKTtcbn07XG5cbkludHJvLnByb3RvdHlwZS5yZW1vdmVBbGwgPSBmdW5jdGlvbihlbmdpbmUpIHtcbiAgZW5naW5lLmRlbGV0ZUVudGl0eSgndGl0bGUnKTtcbiAgZW5naW5lLmRlbGV0ZUVudGl0eSgndHdsb2dvJyk7XG4gIGVuZ2luZS5kZWxldGVFbnRpdHkoJ2xlYWRlcmJvYXJkJyk7XG4gIGVuZ2luZS5kZWxldGVFbnRpdHkoJ2Fib3V0Jyk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEludHJvO1xuIiwidmFyIGV2ZSA9IHJlcXVpcmUoJy4uLy4uLy4uLzNyZHBhcnR5L2V2ZScpO1xuXG5leHBvcnRzLmludGVyY2VwdG9yID0gZnVuY3Rpb24oZm4pIHsgZm4oKTsgfTtcblxuZXhwb3J0cy5zZW5kID0gZnVuY3Rpb24obWVzc2FnZSwgYXJncykge1xuICBldmUobWVzc2FnZSwgbnVsbCwgYXJncyk7XG59O1xuXG5leHBvcnRzLm9uID0gZnVuY3Rpb24obWVzc2FnZSwgY2FsbGJhY2spIHtcbiAgZXZlLm9uKG1lc3NhZ2UsIGZ1bmN0aW9uKCkge1xuICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgIGV4cG9ydHMuaW50ZXJjZXB0b3IoZnVuY3Rpb24oKSB7XG4gICAgICBjYWxsYmFjay5hcHBseSh0aGlzLCBhcmdzKVxuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydHMudW5iaW5kID0gZnVuY3Rpb24obmFtZSkge1xuICBldmUub2ZmKG5hbWUpO1xufTtcbiIsIi8qISBTb2NrZXQuSU8ubWluLmpzIGJ1aWxkOjAuOS4xMSwgcHJvZHVjdGlvbi4gQ29weXJpZ2h0KGMpIDIwMTEgTGVhcm5Cb29zdCA8ZGV2QGxlYXJuYm9vc3QuY29tPiBNSVQgTGljZW5zZWQgKi9cbnZhciBpbz1cInVuZGVmaW5lZFwiPT10eXBlb2YgbW9kdWxlP3t9Om1vZHVsZS5leHBvcnRzOyhmdW5jdGlvbigpeyhmdW5jdGlvbihhLGIpe3ZhciBjPWE7Yy52ZXJzaW9uPVwiMC45LjExXCIsYy5wcm90b2NvbD0xLGMudHJhbnNwb3J0cz1bXSxjLmo9W10sYy5zb2NrZXRzPXt9LGMuY29ubmVjdD1mdW5jdGlvbihhLGQpe3ZhciBlPWMudXRpbC5wYXJzZVVyaShhKSxmLGc7YiYmYi5sb2NhdGlvbiYmKGUucHJvdG9jb2w9ZS5wcm90b2NvbHx8Yi5sb2NhdGlvbi5wcm90b2NvbC5zbGljZSgwLC0xKSxlLmhvc3Q9ZS5ob3N0fHwoYi5kb2N1bWVudD9iLmRvY3VtZW50LmRvbWFpbjpiLmxvY2F0aW9uLmhvc3RuYW1lKSxlLnBvcnQ9ZS5wb3J0fHxiLmxvY2F0aW9uLnBvcnQpLGY9Yy51dGlsLnVuaXF1ZVVyaShlKTt2YXIgaD17aG9zdDplLmhvc3Qsc2VjdXJlOlwiaHR0cHNcIj09ZS5wcm90b2NvbCxwb3J0OmUucG9ydHx8KFwiaHR0cHNcIj09ZS5wcm90b2NvbD80NDM6ODApLHF1ZXJ5OmUucXVlcnl8fFwiXCJ9O2MudXRpbC5tZXJnZShoLGQpO2lmKGhbXCJmb3JjZSBuZXcgY29ubmVjdGlvblwiXXx8IWMuc29ja2V0c1tmXSlnPW5ldyBjLlNvY2tldChoKTtyZXR1cm4haFtcImZvcmNlIG5ldyBjb25uZWN0aW9uXCJdJiZnJiYoYy5zb2NrZXRzW2ZdPWcpLGc9Z3x8Yy5zb2NrZXRzW2ZdLGcub2YoZS5wYXRoLmxlbmd0aD4xP2UucGF0aDpcIlwiKX19KShcIm9iamVjdFwiPT10eXBlb2YgbW9kdWxlP21vZHVsZS5leHBvcnRzOnRoaXMuaW89e30sdGhpcyksZnVuY3Rpb24oYSxiKXt2YXIgYz1hLnV0aWw9e30sZD0vXig/Oig/IVteOkBdKzpbXjpAXFwvXSpAKShbXjpcXC8/Iy5dKyk6KT8oPzpcXC9cXC8pPygoPzooKFteOkBdKikoPzo6KFteOkBdKikpPyk/QCk/KFteOlxcLz8jXSopKD86OihcXGQqKSk/KSgoKFxcLyg/OltePyNdKD8hW14/I1xcL10qXFwuW14/I1xcLy5dKyg/Ols/I118JCkpKSpcXC8/KT8oW14/I1xcL10qKSkoPzpcXD8oW14jXSopKT8oPzojKC4qKSk/KS8sZT1bXCJzb3VyY2VcIixcInByb3RvY29sXCIsXCJhdXRob3JpdHlcIixcInVzZXJJbmZvXCIsXCJ1c2VyXCIsXCJwYXNzd29yZFwiLFwiaG9zdFwiLFwicG9ydFwiLFwicmVsYXRpdmVcIixcInBhdGhcIixcImRpcmVjdG9yeVwiLFwiZmlsZVwiLFwicXVlcnlcIixcImFuY2hvclwiXTtjLnBhcnNlVXJpPWZ1bmN0aW9uKGEpe3ZhciBiPWQuZXhlYyhhfHxcIlwiKSxjPXt9LGY9MTQ7d2hpbGUoZi0tKWNbZVtmXV09YltmXXx8XCJcIjtyZXR1cm4gY30sYy51bmlxdWVVcmk9ZnVuY3Rpb24oYSl7dmFyIGM9YS5wcm90b2NvbCxkPWEuaG9zdCxlPWEucG9ydDtyZXR1cm5cImRvY3VtZW50XCJpbiBiPyhkPWR8fGRvY3VtZW50LmRvbWFpbixlPWV8fChjPT1cImh0dHBzXCImJmRvY3VtZW50LmxvY2F0aW9uLnByb3RvY29sIT09XCJodHRwczpcIj80NDM6ZG9jdW1lbnQubG9jYXRpb24ucG9ydCkpOihkPWR8fFwibG9jYWxob3N0XCIsIWUmJmM9PVwiaHR0cHNcIiYmKGU9NDQzKSksKGN8fFwiaHR0cFwiKStcIjovL1wiK2QrXCI6XCIrKGV8fDgwKX0sYy5xdWVyeT1mdW5jdGlvbihhLGIpe3ZhciBkPWMuY2h1bmtRdWVyeShhfHxcIlwiKSxlPVtdO2MubWVyZ2UoZCxjLmNodW5rUXVlcnkoYnx8XCJcIikpO2Zvcih2YXIgZiBpbiBkKWQuaGFzT3duUHJvcGVydHkoZikmJmUucHVzaChmK1wiPVwiK2RbZl0pO3JldHVybiBlLmxlbmd0aD9cIj9cIitlLmpvaW4oXCImXCIpOlwiXCJ9LGMuY2h1bmtRdWVyeT1mdW5jdGlvbihhKXt2YXIgYj17fSxjPWEuc3BsaXQoXCImXCIpLGQ9MCxlPWMubGVuZ3RoLGY7Zm9yKDtkPGU7KytkKWY9Y1tkXS5zcGxpdChcIj1cIiksZlswXSYmKGJbZlswXV09ZlsxXSk7cmV0dXJuIGJ9O3ZhciBmPSExO2MubG9hZD1mdW5jdGlvbihhKXtpZihcImRvY3VtZW50XCJpbiBiJiZkb2N1bWVudC5yZWFkeVN0YXRlPT09XCJjb21wbGV0ZVwifHxmKXJldHVybiBhKCk7Yy5vbihiLFwibG9hZFwiLGEsITEpfSxjLm9uPWZ1bmN0aW9uKGEsYixjLGQpe2EuYXR0YWNoRXZlbnQ/YS5hdHRhY2hFdmVudChcIm9uXCIrYixjKTphLmFkZEV2ZW50TGlzdGVuZXImJmEuYWRkRXZlbnRMaXN0ZW5lcihiLGMsZCl9LGMucmVxdWVzdD1mdW5jdGlvbihhKXtpZihhJiZcInVuZGVmaW5lZFwiIT10eXBlb2YgWERvbWFpblJlcXVlc3QmJiFjLnVhLmhhc0NPUlMpcmV0dXJuIG5ldyBYRG9tYWluUmVxdWVzdDtpZihcInVuZGVmaW5lZFwiIT10eXBlb2YgWE1MSHR0cFJlcXVlc3QmJighYXx8Yy51YS5oYXNDT1JTKSlyZXR1cm4gbmV3IFhNTEh0dHBSZXF1ZXN0O2lmKCFhKXRyeXtyZXR1cm4gbmV3KHdpbmRvd1tbXCJBY3RpdmVcIl0uY29uY2F0KFwiT2JqZWN0XCIpLmpvaW4oXCJYXCIpXSkoXCJNaWNyb3NvZnQuWE1MSFRUUFwiKX1jYXRjaChiKXt9cmV0dXJuIG51bGx9LFwidW5kZWZpbmVkXCIhPXR5cGVvZiB3aW5kb3cmJmMubG9hZChmdW5jdGlvbigpe2Y9ITB9KSxjLmRlZmVyPWZ1bmN0aW9uKGEpe2lmKCFjLnVhLndlYmtpdHx8XCJ1bmRlZmluZWRcIiE9dHlwZW9mIGltcG9ydFNjcmlwdHMpcmV0dXJuIGEoKTtjLmxvYWQoZnVuY3Rpb24oKXtzZXRUaW1lb3V0KGEsMTAwKX0pfSxjLm1lcmdlPWZ1bmN0aW9uKGIsZCxlLGYpe3ZhciBnPWZ8fFtdLGg9dHlwZW9mIGU9PVwidW5kZWZpbmVkXCI/MjplLGk7Zm9yKGkgaW4gZClkLmhhc093blByb3BlcnR5KGkpJiZjLmluZGV4T2YoZyxpKTwwJiYodHlwZW9mIGJbaV0hPVwib2JqZWN0XCJ8fCFoPyhiW2ldPWRbaV0sZy5wdXNoKGRbaV0pKTpjLm1lcmdlKGJbaV0sZFtpXSxoLTEsZykpO3JldHVybiBifSxjLm1peGluPWZ1bmN0aW9uKGEsYil7Yy5tZXJnZShhLnByb3RvdHlwZSxiLnByb3RvdHlwZSl9LGMuaW5oZXJpdD1mdW5jdGlvbihhLGIpe2Z1bmN0aW9uIGMoKXt9Yy5wcm90b3R5cGU9Yi5wcm90b3R5cGUsYS5wcm90b3R5cGU9bmV3IGN9LGMuaXNBcnJheT1BcnJheS5pc0FycmF5fHxmdW5jdGlvbihhKXtyZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGEpPT09XCJbb2JqZWN0IEFycmF5XVwifSxjLmludGVyc2VjdD1mdW5jdGlvbihhLGIpe3ZhciBkPVtdLGU9YS5sZW5ndGg+Yi5sZW5ndGg/YTpiLGY9YS5sZW5ndGg+Yi5sZW5ndGg/YjphO2Zvcih2YXIgZz0wLGg9Zi5sZW5ndGg7ZzxoO2crKyl+Yy5pbmRleE9mKGUsZltnXSkmJmQucHVzaChmW2ddKTtyZXR1cm4gZH0sYy5pbmRleE9mPWZ1bmN0aW9uKGEsYixjKXtmb3IodmFyIGQ9YS5sZW5ndGgsYz1jPDA/YytkPDA/MDpjK2Q6Y3x8MDtjPGQmJmFbY10hPT1iO2MrKyk7cmV0dXJuIGQ8PWM/LTE6Y30sYy50b0FycmF5PWZ1bmN0aW9uKGEpe3ZhciBiPVtdO2Zvcih2YXIgYz0wLGQ9YS5sZW5ndGg7YzxkO2MrKyliLnB1c2goYVtjXSk7cmV0dXJuIGJ9LGMudWE9e30sYy51YS5oYXNDT1JTPVwidW5kZWZpbmVkXCIhPXR5cGVvZiBYTUxIdHRwUmVxdWVzdCYmZnVuY3Rpb24oKXt0cnl7dmFyIGE9bmV3IFhNTEh0dHBSZXF1ZXN0fWNhdGNoKGIpe3JldHVybiExfXJldHVybiBhLndpdGhDcmVkZW50aWFscyE9dW5kZWZpbmVkfSgpLGMudWEud2Via2l0PVwidW5kZWZpbmVkXCIhPXR5cGVvZiBuYXZpZ2F0b3ImJi93ZWJraXQvaS50ZXN0KG5hdmlnYXRvci51c2VyQWdlbnQpLGMudWEuaURldmljZT1cInVuZGVmaW5lZFwiIT10eXBlb2YgbmF2aWdhdG9yJiYvaVBhZHxpUGhvbmV8aVBvZC9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCl9KFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pbzptb2R1bGUuZXhwb3J0cyx0aGlzKSxmdW5jdGlvbihhLGIpe2Z1bmN0aW9uIGMoKXt9YS5FdmVudEVtaXR0ZXI9YyxjLnByb3RvdHlwZS5vbj1mdW5jdGlvbihhLGMpe3JldHVybiB0aGlzLiRldmVudHN8fCh0aGlzLiRldmVudHM9e30pLHRoaXMuJGV2ZW50c1thXT9iLnV0aWwuaXNBcnJheSh0aGlzLiRldmVudHNbYV0pP3RoaXMuJGV2ZW50c1thXS5wdXNoKGMpOnRoaXMuJGV2ZW50c1thXT1bdGhpcy4kZXZlbnRzW2FdLGNdOnRoaXMuJGV2ZW50c1thXT1jLHRoaXN9LGMucHJvdG90eXBlLmFkZExpc3RlbmVyPWMucHJvdG90eXBlLm9uLGMucHJvdG90eXBlLm9uY2U9ZnVuY3Rpb24oYSxiKXtmdW5jdGlvbiBkKCl7Yy5yZW1vdmVMaXN0ZW5lcihhLGQpLGIuYXBwbHkodGhpcyxhcmd1bWVudHMpfXZhciBjPXRoaXM7cmV0dXJuIGQubGlzdGVuZXI9Yix0aGlzLm9uKGEsZCksdGhpc30sYy5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXI9ZnVuY3Rpb24oYSxjKXtpZih0aGlzLiRldmVudHMmJnRoaXMuJGV2ZW50c1thXSl7dmFyIGQ9dGhpcy4kZXZlbnRzW2FdO2lmKGIudXRpbC5pc0FycmF5KGQpKXt2YXIgZT0tMTtmb3IodmFyIGY9MCxnPWQubGVuZ3RoO2Y8ZztmKyspaWYoZFtmXT09PWN8fGRbZl0ubGlzdGVuZXImJmRbZl0ubGlzdGVuZXI9PT1jKXtlPWY7YnJlYWt9aWYoZTwwKXJldHVybiB0aGlzO2Quc3BsaWNlKGUsMSksZC5sZW5ndGh8fGRlbGV0ZSB0aGlzLiRldmVudHNbYV19ZWxzZShkPT09Y3x8ZC5saXN0ZW5lciYmZC5saXN0ZW5lcj09PWMpJiZkZWxldGUgdGhpcy4kZXZlbnRzW2FdfXJldHVybiB0aGlzfSxjLnByb3RvdHlwZS5yZW1vdmVBbGxMaXN0ZW5lcnM9ZnVuY3Rpb24oYSl7cmV0dXJuIGE9PT11bmRlZmluZWQ/KHRoaXMuJGV2ZW50cz17fSx0aGlzKToodGhpcy4kZXZlbnRzJiZ0aGlzLiRldmVudHNbYV0mJih0aGlzLiRldmVudHNbYV09bnVsbCksdGhpcyl9LGMucHJvdG90eXBlLmxpc3RlbmVycz1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy4kZXZlbnRzfHwodGhpcy4kZXZlbnRzPXt9KSx0aGlzLiRldmVudHNbYV18fCh0aGlzLiRldmVudHNbYV09W10pLGIudXRpbC5pc0FycmF5KHRoaXMuJGV2ZW50c1thXSl8fCh0aGlzLiRldmVudHNbYV09W3RoaXMuJGV2ZW50c1thXV0pLHRoaXMuJGV2ZW50c1thXX0sYy5wcm90b3R5cGUuZW1pdD1mdW5jdGlvbihhKXtpZighdGhpcy4kZXZlbnRzKXJldHVybiExO3ZhciBjPXRoaXMuJGV2ZW50c1thXTtpZighYylyZXR1cm4hMTt2YXIgZD1BcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsMSk7aWYoXCJmdW5jdGlvblwiPT10eXBlb2YgYyljLmFwcGx5KHRoaXMsZCk7ZWxzZXtpZighYi51dGlsLmlzQXJyYXkoYykpcmV0dXJuITE7dmFyIGU9Yy5zbGljZSgpO2Zvcih2YXIgZj0wLGc9ZS5sZW5ndGg7ZjxnO2YrKyllW2ZdLmFwcGx5KHRoaXMsZCl9cmV0dXJuITB9fShcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW86bW9kdWxlLmV4cG9ydHMsXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvOm1vZHVsZS5wYXJlbnQuZXhwb3J0cyksZnVuY3Rpb24oZXhwb3J0cyxuYXRpdmVKU09OKXtmdW5jdGlvbiBmKGEpe3JldHVybiBhPDEwP1wiMFwiK2E6YX1mdW5jdGlvbiBkYXRlKGEsYil7cmV0dXJuIGlzRmluaXRlKGEudmFsdWVPZigpKT9hLmdldFVUQ0Z1bGxZZWFyKCkrXCItXCIrZihhLmdldFVUQ01vbnRoKCkrMSkrXCItXCIrZihhLmdldFVUQ0RhdGUoKSkrXCJUXCIrZihhLmdldFVUQ0hvdXJzKCkpK1wiOlwiK2YoYS5nZXRVVENNaW51dGVzKCkpK1wiOlwiK2YoYS5nZXRVVENTZWNvbmRzKCkpK1wiWlwiOm51bGx9ZnVuY3Rpb24gcXVvdGUoYSl7cmV0dXJuIGVzY2FwYWJsZS5sYXN0SW5kZXg9MCxlc2NhcGFibGUudGVzdChhKT8nXCInK2EucmVwbGFjZShlc2NhcGFibGUsZnVuY3Rpb24oYSl7dmFyIGI9bWV0YVthXTtyZXR1cm4gdHlwZW9mIGI9PVwic3RyaW5nXCI/YjpcIlxcXFx1XCIrKFwiMDAwMFwiK2EuY2hhckNvZGVBdCgwKS50b1N0cmluZygxNikpLnNsaWNlKC00KX0pKydcIic6J1wiJythKydcIid9ZnVuY3Rpb24gc3RyKGEsYil7dmFyIGMsZCxlLGYsZz1nYXAsaCxpPWJbYV07aSBpbnN0YW5jZW9mIERhdGUmJihpPWRhdGUoYSkpLHR5cGVvZiByZXA9PVwiZnVuY3Rpb25cIiYmKGk9cmVwLmNhbGwoYixhLGkpKTtzd2l0Y2godHlwZW9mIGkpe2Nhc2VcInN0cmluZ1wiOnJldHVybiBxdW90ZShpKTtjYXNlXCJudW1iZXJcIjpyZXR1cm4gaXNGaW5pdGUoaSk/U3RyaW5nKGkpOlwibnVsbFwiO2Nhc2VcImJvb2xlYW5cIjpjYXNlXCJudWxsXCI6cmV0dXJuIFN0cmluZyhpKTtjYXNlXCJvYmplY3RcIjppZighaSlyZXR1cm5cIm51bGxcIjtnYXArPWluZGVudCxoPVtdO2lmKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuYXBwbHkoaSk9PT1cIltvYmplY3QgQXJyYXldXCIpe2Y9aS5sZW5ndGg7Zm9yKGM9MDtjPGY7Yys9MSloW2NdPXN0cihjLGkpfHxcIm51bGxcIjtyZXR1cm4gZT1oLmxlbmd0aD09PTA/XCJbXVwiOmdhcD9cIltcXG5cIitnYXAraC5qb2luKFwiLFxcblwiK2dhcCkrXCJcXG5cIitnK1wiXVwiOlwiW1wiK2guam9pbihcIixcIikrXCJdXCIsZ2FwPWcsZX1pZihyZXAmJnR5cGVvZiByZXA9PVwib2JqZWN0XCIpe2Y9cmVwLmxlbmd0aDtmb3IoYz0wO2M8ZjtjKz0xKXR5cGVvZiByZXBbY109PVwic3RyaW5nXCImJihkPXJlcFtjXSxlPXN0cihkLGkpLGUmJmgucHVzaChxdW90ZShkKSsoZ2FwP1wiOiBcIjpcIjpcIikrZSkpfWVsc2UgZm9yKGQgaW4gaSlPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoaSxkKSYmKGU9c3RyKGQsaSksZSYmaC5wdXNoKHF1b3RlKGQpKyhnYXA/XCI6IFwiOlwiOlwiKStlKSk7cmV0dXJuIGU9aC5sZW5ndGg9PT0wP1wie31cIjpnYXA/XCJ7XFxuXCIrZ2FwK2guam9pbihcIixcXG5cIitnYXApK1wiXFxuXCIrZytcIn1cIjpcIntcIitoLmpvaW4oXCIsXCIpK1wifVwiLGdhcD1nLGV9fVwidXNlIHN0cmljdFwiO2lmKG5hdGl2ZUpTT04mJm5hdGl2ZUpTT04ucGFyc2UpcmV0dXJuIGV4cG9ydHMuSlNPTj17cGFyc2U6bmF0aXZlSlNPTi5wYXJzZSxzdHJpbmdpZnk6bmF0aXZlSlNPTi5zdHJpbmdpZnl9O3ZhciBKU09OPWV4cG9ydHMuSlNPTj17fSxjeD0vW1xcdTAwMDBcXHUwMGFkXFx1MDYwMC1cXHUwNjA0XFx1MDcwZlxcdTE3YjRcXHUxN2I1XFx1MjAwYy1cXHUyMDBmXFx1MjAyOC1cXHUyMDJmXFx1MjA2MC1cXHUyMDZmXFx1ZmVmZlxcdWZmZjAtXFx1ZmZmZl0vZyxlc2NhcGFibGU9L1tcXFxcXFxcIlxceDAwLVxceDFmXFx4N2YtXFx4OWZcXHUwMGFkXFx1MDYwMC1cXHUwNjA0XFx1MDcwZlxcdTE3YjRcXHUxN2I1XFx1MjAwYy1cXHUyMDBmXFx1MjAyOC1cXHUyMDJmXFx1MjA2MC1cXHUyMDZmXFx1ZmVmZlxcdWZmZjAtXFx1ZmZmZl0vZyxnYXAsaW5kZW50LG1ldGE9e1wiXFxiXCI6XCJcXFxcYlwiLFwiXFx0XCI6XCJcXFxcdFwiLFwiXFxuXCI6XCJcXFxcblwiLFwiXFxmXCI6XCJcXFxcZlwiLFwiXFxyXCI6XCJcXFxcclwiLCdcIic6J1xcXFxcIicsXCJcXFxcXCI6XCJcXFxcXFxcXFwifSxyZXA7SlNPTi5zdHJpbmdpZnk9ZnVuY3Rpb24oYSxiLGMpe3ZhciBkO2dhcD1cIlwiLGluZGVudD1cIlwiO2lmKHR5cGVvZiBjPT1cIm51bWJlclwiKWZvcihkPTA7ZDxjO2QrPTEpaW5kZW50Kz1cIiBcIjtlbHNlIHR5cGVvZiBjPT1cInN0cmluZ1wiJiYoaW5kZW50PWMpO3JlcD1iO2lmKCFifHx0eXBlb2YgYj09XCJmdW5jdGlvblwifHx0eXBlb2YgYj09XCJvYmplY3RcIiYmdHlwZW9mIGIubGVuZ3RoPT1cIm51bWJlclwiKXJldHVybiBzdHIoXCJcIix7XCJcIjphfSk7dGhyb3cgbmV3IEVycm9yKFwiSlNPTi5zdHJpbmdpZnlcIil9LEpTT04ucGFyc2U9ZnVuY3Rpb24odGV4dCxyZXZpdmVyKXtmdW5jdGlvbiB3YWxrKGEsYil7dmFyIGMsZCxlPWFbYl07aWYoZSYmdHlwZW9mIGU9PVwib2JqZWN0XCIpZm9yKGMgaW4gZSlPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZSxjKSYmKGQ9d2FsayhlLGMpLGQhPT11bmRlZmluZWQ/ZVtjXT1kOmRlbGV0ZSBlW2NdKTtyZXR1cm4gcmV2aXZlci5jYWxsKGEsYixlKX12YXIgajt0ZXh0PVN0cmluZyh0ZXh0KSxjeC5sYXN0SW5kZXg9MCxjeC50ZXN0KHRleHQpJiYodGV4dD10ZXh0LnJlcGxhY2UoY3gsZnVuY3Rpb24oYSl7cmV0dXJuXCJcXFxcdVwiKyhcIjAwMDBcIithLmNoYXJDb2RlQXQoMCkudG9TdHJpbmcoMTYpKS5zbGljZSgtNCl9KSk7aWYoL15bXFxdLDp7fVxcc10qJC8udGVzdCh0ZXh0LnJlcGxhY2UoL1xcXFwoPzpbXCJcXFxcXFwvYmZucnRdfHVbMC05YS1mQS1GXXs0fSkvZyxcIkBcIikucmVwbGFjZSgvXCJbXlwiXFxcXFxcblxccl0qXCJ8dHJ1ZXxmYWxzZXxudWxsfC0/XFxkKyg/OlxcLlxcZCopPyg/OltlRV1bK1xcLV0/XFxkKyk/L2csXCJdXCIpLnJlcGxhY2UoLyg/Ol58OnwsKSg/OlxccypcXFspKy9nLFwiXCIpKSlyZXR1cm4gaj1ldmFsKFwiKFwiK3RleHQrXCIpXCIpLHR5cGVvZiByZXZpdmVyPT1cImZ1bmN0aW9uXCI/d2Fsayh7XCJcIjpqfSxcIlwiKTpqO3Rocm93IG5ldyBTeW50YXhFcnJvcihcIkpTT04ucGFyc2VcIil9fShcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW86bW9kdWxlLmV4cG9ydHMsdHlwZW9mIEpTT04hPVwidW5kZWZpbmVkXCI/SlNPTjp1bmRlZmluZWQpLGZ1bmN0aW9uKGEsYil7dmFyIGM9YS5wYXJzZXI9e30sZD1jLnBhY2tldHM9W1wiZGlzY29ubmVjdFwiLFwiY29ubmVjdFwiLFwiaGVhcnRiZWF0XCIsXCJtZXNzYWdlXCIsXCJqc29uXCIsXCJldmVudFwiLFwiYWNrXCIsXCJlcnJvclwiLFwibm9vcFwiXSxlPWMucmVhc29ucz1bXCJ0cmFuc3BvcnQgbm90IHN1cHBvcnRlZFwiLFwiY2xpZW50IG5vdCBoYW5kc2hha2VuXCIsXCJ1bmF1dGhvcml6ZWRcIl0sZj1jLmFkdmljZT1bXCJyZWNvbm5lY3RcIl0sZz1iLkpTT04saD1iLnV0aWwuaW5kZXhPZjtjLmVuY29kZVBhY2tldD1mdW5jdGlvbihhKXt2YXIgYj1oKGQsYS50eXBlKSxjPWEuaWR8fFwiXCIsaT1hLmVuZHBvaW50fHxcIlwiLGo9YS5hY2ssaz1udWxsO3N3aXRjaChhLnR5cGUpe2Nhc2VcImVycm9yXCI6dmFyIGw9YS5yZWFzb24/aChlLGEucmVhc29uKTpcIlwiLG09YS5hZHZpY2U/aChmLGEuYWR2aWNlKTpcIlwiO2lmKGwhPT1cIlwifHxtIT09XCJcIilrPWwrKG0hPT1cIlwiP1wiK1wiK206XCJcIik7YnJlYWs7Y2FzZVwibWVzc2FnZVwiOmEuZGF0YSE9PVwiXCImJihrPWEuZGF0YSk7YnJlYWs7Y2FzZVwiZXZlbnRcIjp2YXIgbj17bmFtZTphLm5hbWV9O2EuYXJncyYmYS5hcmdzLmxlbmd0aCYmKG4uYXJncz1hLmFyZ3MpLGs9Zy5zdHJpbmdpZnkobik7YnJlYWs7Y2FzZVwianNvblwiOms9Zy5zdHJpbmdpZnkoYS5kYXRhKTticmVhaztjYXNlXCJjb25uZWN0XCI6YS5xcyYmKGs9YS5xcyk7YnJlYWs7Y2FzZVwiYWNrXCI6az1hLmFja0lkKyhhLmFyZ3MmJmEuYXJncy5sZW5ndGg/XCIrXCIrZy5zdHJpbmdpZnkoYS5hcmdzKTpcIlwiKX12YXIgbz1bYixjKyhqPT1cImRhdGFcIj9cIitcIjpcIlwiKSxpXTtyZXR1cm4gayE9PW51bGwmJmshPT11bmRlZmluZWQmJm8ucHVzaChrKSxvLmpvaW4oXCI6XCIpfSxjLmVuY29kZVBheWxvYWQ9ZnVuY3Rpb24oYSl7dmFyIGI9XCJcIjtpZihhLmxlbmd0aD09MSlyZXR1cm4gYVswXTtmb3IodmFyIGM9MCxkPWEubGVuZ3RoO2M8ZDtjKyspe3ZhciBlPWFbY107Yis9XCJcXHVmZmZkXCIrZS5sZW5ndGgrXCJcXHVmZmZkXCIrYVtjXX1yZXR1cm4gYn07dmFyIGk9LyhbXjpdKyk6KFswLTldKyk/KFxcKyk/OihbXjpdKyk/Oj8oW1xcc1xcU10qKT8vO2MuZGVjb2RlUGFja2V0PWZ1bmN0aW9uKGEpe3ZhciBiPWEubWF0Y2goaSk7aWYoIWIpcmV0dXJue307dmFyIGM9YlsyXXx8XCJcIixhPWJbNV18fFwiXCIsaD17dHlwZTpkW2JbMV1dLGVuZHBvaW50OmJbNF18fFwiXCJ9O2MmJihoLmlkPWMsYlszXT9oLmFjaz1cImRhdGFcIjpoLmFjaz0hMCk7c3dpdGNoKGgudHlwZSl7Y2FzZVwiZXJyb3JcIjp2YXIgYj1hLnNwbGl0KFwiK1wiKTtoLnJlYXNvbj1lW2JbMF1dfHxcIlwiLGguYWR2aWNlPWZbYlsxXV18fFwiXCI7YnJlYWs7Y2FzZVwibWVzc2FnZVwiOmguZGF0YT1hfHxcIlwiO2JyZWFrO2Nhc2VcImV2ZW50XCI6dHJ5e3ZhciBqPWcucGFyc2UoYSk7aC5uYW1lPWoubmFtZSxoLmFyZ3M9ai5hcmdzfWNhdGNoKGspe31oLmFyZ3M9aC5hcmdzfHxbXTticmVhaztjYXNlXCJqc29uXCI6dHJ5e2guZGF0YT1nLnBhcnNlKGEpfWNhdGNoKGspe31icmVhaztjYXNlXCJjb25uZWN0XCI6aC5xcz1hfHxcIlwiO2JyZWFrO2Nhc2VcImFja1wiOnZhciBiPWEubWF0Y2goL14oWzAtOV0rKShcXCspPyguKikvKTtpZihiKXtoLmFja0lkPWJbMV0saC5hcmdzPVtdO2lmKGJbM10pdHJ5e2guYXJncz1iWzNdP2cucGFyc2UoYlszXSk6W119Y2F0Y2goayl7fX1icmVhaztjYXNlXCJkaXNjb25uZWN0XCI6Y2FzZVwiaGVhcnRiZWF0XCI6fXJldHVybiBofSxjLmRlY29kZVBheWxvYWQ9ZnVuY3Rpb24oYSl7aWYoYS5jaGFyQXQoMCk9PVwiXFx1ZmZmZFwiKXt2YXIgYj1bXTtmb3IodmFyIGQ9MSxlPVwiXCI7ZDxhLmxlbmd0aDtkKyspYS5jaGFyQXQoZCk9PVwiXFx1ZmZmZFwiPyhiLnB1c2goYy5kZWNvZGVQYWNrZXQoYS5zdWJzdHIoZCsxKS5zdWJzdHIoMCxlKSkpLGQrPU51bWJlcihlKSsxLGU9XCJcIik6ZSs9YS5jaGFyQXQoZCk7cmV0dXJuIGJ9cmV0dXJuW2MuZGVjb2RlUGFja2V0KGEpXX19KFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pbzptb2R1bGUuZXhwb3J0cyxcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW86bW9kdWxlLnBhcmVudC5leHBvcnRzKSxmdW5jdGlvbihhLGIpe2Z1bmN0aW9uIGMoYSxiKXt0aGlzLnNvY2tldD1hLHRoaXMuc2Vzc2lkPWJ9YS5UcmFuc3BvcnQ9YyxiLnV0aWwubWl4aW4oYyxiLkV2ZW50RW1pdHRlciksYy5wcm90b3R5cGUuaGVhcnRiZWF0cz1mdW5jdGlvbigpe3JldHVybiEwfSxjLnByb3RvdHlwZS5vbkRhdGE9ZnVuY3Rpb24oYSl7dGhpcy5jbGVhckNsb3NlVGltZW91dCgpLCh0aGlzLnNvY2tldC5jb25uZWN0ZWR8fHRoaXMuc29ja2V0LmNvbm5lY3Rpbmd8fHRoaXMuc29ja2V0LnJlY29ubmVjdGluZykmJnRoaXMuc2V0Q2xvc2VUaW1lb3V0KCk7aWYoYSE9PVwiXCIpe3ZhciBjPWIucGFyc2VyLmRlY29kZVBheWxvYWQoYSk7aWYoYyYmYy5sZW5ndGgpZm9yKHZhciBkPTAsZT1jLmxlbmd0aDtkPGU7ZCsrKXRoaXMub25QYWNrZXQoY1tkXSl9cmV0dXJuIHRoaXN9LGMucHJvdG90eXBlLm9uUGFja2V0PWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLnNvY2tldC5zZXRIZWFydGJlYXRUaW1lb3V0KCksYS50eXBlPT1cImhlYXJ0YmVhdFwiP3RoaXMub25IZWFydGJlYXQoKTooYS50eXBlPT1cImNvbm5lY3RcIiYmYS5lbmRwb2ludD09XCJcIiYmdGhpcy5vbkNvbm5lY3QoKSxhLnR5cGU9PVwiZXJyb3JcIiYmYS5hZHZpY2U9PVwicmVjb25uZWN0XCImJih0aGlzLmlzT3Blbj0hMSksdGhpcy5zb2NrZXQub25QYWNrZXQoYSksdGhpcyl9LGMucHJvdG90eXBlLnNldENsb3NlVGltZW91dD1mdW5jdGlvbigpe2lmKCF0aGlzLmNsb3NlVGltZW91dCl7dmFyIGE9dGhpczt0aGlzLmNsb3NlVGltZW91dD1zZXRUaW1lb3V0KGZ1bmN0aW9uKCl7YS5vbkRpc2Nvbm5lY3QoKX0sdGhpcy5zb2NrZXQuY2xvc2VUaW1lb3V0KX19LGMucHJvdG90eXBlLm9uRGlzY29ubmVjdD1mdW5jdGlvbigpe3JldHVybiB0aGlzLmlzT3BlbiYmdGhpcy5jbG9zZSgpLHRoaXMuY2xlYXJUaW1lb3V0cygpLHRoaXMuc29ja2V0Lm9uRGlzY29ubmVjdCgpLHRoaXN9LGMucHJvdG90eXBlLm9uQ29ubmVjdD1mdW5jdGlvbigpe3JldHVybiB0aGlzLnNvY2tldC5vbkNvbm5lY3QoKSx0aGlzfSxjLnByb3RvdHlwZS5jbGVhckNsb3NlVGltZW91dD1mdW5jdGlvbigpe3RoaXMuY2xvc2VUaW1lb3V0JiYoY2xlYXJUaW1lb3V0KHRoaXMuY2xvc2VUaW1lb3V0KSx0aGlzLmNsb3NlVGltZW91dD1udWxsKX0sYy5wcm90b3R5cGUuY2xlYXJUaW1lb3V0cz1mdW5jdGlvbigpe3RoaXMuY2xlYXJDbG9zZVRpbWVvdXQoKSx0aGlzLnJlb3BlblRpbWVvdXQmJmNsZWFyVGltZW91dCh0aGlzLnJlb3BlblRpbWVvdXQpfSxjLnByb3RvdHlwZS5wYWNrZXQ9ZnVuY3Rpb24oYSl7dGhpcy5zZW5kKGIucGFyc2VyLmVuY29kZVBhY2tldChhKSl9LGMucHJvdG90eXBlLm9uSGVhcnRiZWF0PWZ1bmN0aW9uKGEpe3RoaXMucGFja2V0KHt0eXBlOlwiaGVhcnRiZWF0XCJ9KX0sYy5wcm90b3R5cGUub25PcGVuPWZ1bmN0aW9uKCl7dGhpcy5pc09wZW49ITAsdGhpcy5jbGVhckNsb3NlVGltZW91dCgpLHRoaXMuc29ja2V0Lm9uT3BlbigpfSxjLnByb3RvdHlwZS5vbkNsb3NlPWZ1bmN0aW9uKCl7dmFyIGE9dGhpczt0aGlzLmlzT3Blbj0hMSx0aGlzLnNvY2tldC5vbkNsb3NlKCksdGhpcy5vbkRpc2Nvbm5lY3QoKX0sYy5wcm90b3R5cGUucHJlcGFyZVVybD1mdW5jdGlvbigpe3ZhciBhPXRoaXMuc29ja2V0Lm9wdGlvbnM7cmV0dXJuIHRoaXMuc2NoZW1lKCkrXCI6Ly9cIithLmhvc3QrXCI6XCIrYS5wb3J0K1wiL1wiK2EucmVzb3VyY2UrXCIvXCIrYi5wcm90b2NvbCtcIi9cIit0aGlzLm5hbWUrXCIvXCIrdGhpcy5zZXNzaWR9LGMucHJvdG90eXBlLnJlYWR5PWZ1bmN0aW9uKGEsYil7Yi5jYWxsKHRoaXMpfX0oXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvOm1vZHVsZS5leHBvcnRzLFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pbzptb2R1bGUucGFyZW50LmV4cG9ydHMpLGZ1bmN0aW9uKGEsYixjKXtmdW5jdGlvbiBkKGEpe3RoaXMub3B0aW9ucz17cG9ydDo4MCxzZWN1cmU6ITEsZG9jdW1lbnQ6XCJkb2N1bWVudFwiaW4gYz9kb2N1bWVudDohMSxyZXNvdXJjZTpcInNvY2tldC5pb1wiLHRyYW5zcG9ydHM6Yi50cmFuc3BvcnRzLFwiY29ubmVjdCB0aW1lb3V0XCI6MWU0LFwidHJ5IG11bHRpcGxlIHRyYW5zcG9ydHNcIjohMCxyZWNvbm5lY3Q6ITAsXCJyZWNvbm5lY3Rpb24gZGVsYXlcIjo1MDAsXCJyZWNvbm5lY3Rpb24gbGltaXRcIjpJbmZpbml0eSxcInJlb3BlbiBkZWxheVwiOjNlMyxcIm1heCByZWNvbm5lY3Rpb24gYXR0ZW1wdHNcIjoxMCxcInN5bmMgZGlzY29ubmVjdCBvbiB1bmxvYWRcIjohMSxcImF1dG8gY29ubmVjdFwiOiEwLFwiZmxhc2ggcG9saWN5IHBvcnRcIjoxMDg0MyxtYW51YWxGbHVzaDohMX0sYi51dGlsLm1lcmdlKHRoaXMub3B0aW9ucyxhKSx0aGlzLmNvbm5lY3RlZD0hMSx0aGlzLm9wZW49ITEsdGhpcy5jb25uZWN0aW5nPSExLHRoaXMucmVjb25uZWN0aW5nPSExLHRoaXMubmFtZXNwYWNlcz17fSx0aGlzLmJ1ZmZlcj1bXSx0aGlzLmRvQnVmZmVyPSExO2lmKHRoaXMub3B0aW9uc1tcInN5bmMgZGlzY29ubmVjdCBvbiB1bmxvYWRcIl0mJighdGhpcy5pc1hEb21haW4oKXx8Yi51dGlsLnVhLmhhc0NPUlMpKXt2YXIgZD10aGlzO2IudXRpbC5vbihjLFwiYmVmb3JldW5sb2FkXCIsZnVuY3Rpb24oKXtkLmRpc2Nvbm5lY3RTeW5jKCl9LCExKX10aGlzLm9wdGlvbnNbXCJhdXRvIGNvbm5lY3RcIl0mJnRoaXMuY29ubmVjdCgpfWZ1bmN0aW9uIGUoKXt9YS5Tb2NrZXQ9ZCxiLnV0aWwubWl4aW4oZCxiLkV2ZW50RW1pdHRlciksZC5wcm90b3R5cGUub2Y9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMubmFtZXNwYWNlc1thXXx8KHRoaXMubmFtZXNwYWNlc1thXT1uZXcgYi5Tb2NrZXROYW1lc3BhY2UodGhpcyxhKSxhIT09XCJcIiYmdGhpcy5uYW1lc3BhY2VzW2FdLnBhY2tldCh7dHlwZTpcImNvbm5lY3RcIn0pKSx0aGlzLm5hbWVzcGFjZXNbYV19LGQucHJvdG90eXBlLnB1Ymxpc2g9ZnVuY3Rpb24oKXt0aGlzLmVtaXQuYXBwbHkodGhpcyxhcmd1bWVudHMpO3ZhciBhO2Zvcih2YXIgYiBpbiB0aGlzLm5hbWVzcGFjZXMpdGhpcy5uYW1lc3BhY2VzLmhhc093blByb3BlcnR5KGIpJiYoYT10aGlzLm9mKGIpLGEuJGVtaXQuYXBwbHkoYSxhcmd1bWVudHMpKX0sZC5wcm90b3R5cGUuaGFuZHNoYWtlPWZ1bmN0aW9uKGEpe2Z1bmN0aW9uIGYoYil7YiBpbnN0YW5jZW9mIEVycm9yPyhjLmNvbm5lY3Rpbmc9ITEsYy5vbkVycm9yKGIubWVzc2FnZSkpOmEuYXBwbHkobnVsbCxiLnNwbGl0KFwiOlwiKSl9dmFyIGM9dGhpcyxkPXRoaXMub3B0aW9ucyxnPVtcImh0dHBcIisoZC5zZWN1cmU/XCJzXCI6XCJcIikrXCI6L1wiLGQuaG9zdCtcIjpcIitkLnBvcnQsZC5yZXNvdXJjZSxiLnByb3RvY29sLGIudXRpbC5xdWVyeSh0aGlzLm9wdGlvbnMucXVlcnksXCJ0PVwiKyArKG5ldyBEYXRlKSldLmpvaW4oXCIvXCIpO2lmKHRoaXMuaXNYRG9tYWluKCkmJiFiLnV0aWwudWEuaGFzQ09SUyl7dmFyIGg9ZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJzY3JpcHRcIilbMF0saT1kb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2NyaXB0XCIpO2kuc3JjPWcrXCImanNvbnA9XCIrYi5qLmxlbmd0aCxoLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGksaCksYi5qLnB1c2goZnVuY3Rpb24oYSl7ZihhKSxpLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoaSl9KX1lbHNle3ZhciBqPWIudXRpbC5yZXF1ZXN0KCk7ai5vcGVuKFwiR0VUXCIsZywhMCksdGhpcy5pc1hEb21haW4oKSYmKGoud2l0aENyZWRlbnRpYWxzPSEwKSxqLm9ucmVhZHlzdGF0ZWNoYW5nZT1mdW5jdGlvbigpe2oucmVhZHlTdGF0ZT09NCYmKGoub25yZWFkeXN0YXRlY2hhbmdlPWUsai5zdGF0dXM9PTIwMD9mKGoucmVzcG9uc2VUZXh0KTpqLnN0YXR1cz09NDAzP2Mub25FcnJvcihqLnJlc3BvbnNlVGV4dCk6KGMuY29ubmVjdGluZz0hMSwhYy5yZWNvbm5lY3RpbmcmJmMub25FcnJvcihqLnJlc3BvbnNlVGV4dCkpKX0sai5zZW5kKG51bGwpfX0sZC5wcm90b3R5cGUuZ2V0VHJhbnNwb3J0PWZ1bmN0aW9uKGEpe3ZhciBjPWF8fHRoaXMudHJhbnNwb3J0cyxkO2Zvcih2YXIgZT0wLGY7Zj1jW2VdO2UrKylpZihiLlRyYW5zcG9ydFtmXSYmYi5UcmFuc3BvcnRbZl0uY2hlY2sodGhpcykmJighdGhpcy5pc1hEb21haW4oKXx8Yi5UcmFuc3BvcnRbZl0ueGRvbWFpbkNoZWNrKHRoaXMpKSlyZXR1cm4gbmV3IGIuVHJhbnNwb3J0W2ZdKHRoaXMsdGhpcy5zZXNzaW9uaWQpO3JldHVybiBudWxsfSxkLnByb3RvdHlwZS5jb25uZWN0PWZ1bmN0aW9uKGEpe2lmKHRoaXMuY29ubmVjdGluZylyZXR1cm4gdGhpczt2YXIgYz10aGlzO3JldHVybiBjLmNvbm5lY3Rpbmc9ITAsdGhpcy5oYW5kc2hha2UoZnVuY3Rpb24oZCxlLGYsZyl7ZnVuY3Rpb24gaChhKXtjLnRyYW5zcG9ydCYmYy50cmFuc3BvcnQuY2xlYXJUaW1lb3V0cygpLGMudHJhbnNwb3J0PWMuZ2V0VHJhbnNwb3J0KGEpO2lmKCFjLnRyYW5zcG9ydClyZXR1cm4gYy5wdWJsaXNoKFwiY29ubmVjdF9mYWlsZWRcIik7Yy50cmFuc3BvcnQucmVhZHkoYyxmdW5jdGlvbigpe2MuY29ubmVjdGluZz0hMCxjLnB1Ymxpc2goXCJjb25uZWN0aW5nXCIsYy50cmFuc3BvcnQubmFtZSksYy50cmFuc3BvcnQub3BlbigpLGMub3B0aW9uc1tcImNvbm5lY3QgdGltZW91dFwiXSYmKGMuY29ubmVjdFRpbWVvdXRUaW1lcj1zZXRUaW1lb3V0KGZ1bmN0aW9uKCl7aWYoIWMuY29ubmVjdGVkKXtjLmNvbm5lY3Rpbmc9ITE7aWYoYy5vcHRpb25zW1widHJ5IG11bHRpcGxlIHRyYW5zcG9ydHNcIl0pe3ZhciBhPWMudHJhbnNwb3J0czt3aGlsZShhLmxlbmd0aD4wJiZhLnNwbGljZSgwLDEpWzBdIT1jLnRyYW5zcG9ydC5uYW1lKTthLmxlbmd0aD9oKGEpOmMucHVibGlzaChcImNvbm5lY3RfZmFpbGVkXCIpfX19LGMub3B0aW9uc1tcImNvbm5lY3QgdGltZW91dFwiXSkpfSl9Yy5zZXNzaW9uaWQ9ZCxjLmNsb3NlVGltZW91dD1mKjFlMyxjLmhlYXJ0YmVhdFRpbWVvdXQ9ZSoxZTMsYy50cmFuc3BvcnRzfHwoYy50cmFuc3BvcnRzPWMub3JpZ1RyYW5zcG9ydHM9Zz9iLnV0aWwuaW50ZXJzZWN0KGcuc3BsaXQoXCIsXCIpLGMub3B0aW9ucy50cmFuc3BvcnRzKTpjLm9wdGlvbnMudHJhbnNwb3J0cyksYy5zZXRIZWFydGJlYXRUaW1lb3V0KCksaChjLnRyYW5zcG9ydHMpLGMub25jZShcImNvbm5lY3RcIixmdW5jdGlvbigpe2NsZWFyVGltZW91dChjLmNvbm5lY3RUaW1lb3V0VGltZXIpLGEmJnR5cGVvZiBhPT1cImZ1bmN0aW9uXCImJmEoKX0pfSksdGhpc30sZC5wcm90b3R5cGUuc2V0SGVhcnRiZWF0VGltZW91dD1mdW5jdGlvbigpe2NsZWFyVGltZW91dCh0aGlzLmhlYXJ0YmVhdFRpbWVvdXRUaW1lcik7aWYodGhpcy50cmFuc3BvcnQmJiF0aGlzLnRyYW5zcG9ydC5oZWFydGJlYXRzKCkpcmV0dXJuO3ZhciBhPXRoaXM7dGhpcy5oZWFydGJlYXRUaW1lb3V0VGltZXI9c2V0VGltZW91dChmdW5jdGlvbigpe2EudHJhbnNwb3J0Lm9uQ2xvc2UoKX0sdGhpcy5oZWFydGJlYXRUaW1lb3V0KX0sZC5wcm90b3R5cGUucGFja2V0PWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLmNvbm5lY3RlZCYmIXRoaXMuZG9CdWZmZXI/dGhpcy50cmFuc3BvcnQucGFja2V0KGEpOnRoaXMuYnVmZmVyLnB1c2goYSksdGhpc30sZC5wcm90b3R5cGUuc2V0QnVmZmVyPWZ1bmN0aW9uKGEpe3RoaXMuZG9CdWZmZXI9YSwhYSYmdGhpcy5jb25uZWN0ZWQmJnRoaXMuYnVmZmVyLmxlbmd0aCYmKHRoaXMub3B0aW9ucy5tYW51YWxGbHVzaHx8dGhpcy5mbHVzaEJ1ZmZlcigpKX0sZC5wcm90b3R5cGUuZmx1c2hCdWZmZXI9ZnVuY3Rpb24oKXt0aGlzLnRyYW5zcG9ydC5wYXlsb2FkKHRoaXMuYnVmZmVyKSx0aGlzLmJ1ZmZlcj1bXX0sZC5wcm90b3R5cGUuZGlzY29ubmVjdD1mdW5jdGlvbigpe2lmKHRoaXMuY29ubmVjdGVkfHx0aGlzLmNvbm5lY3RpbmcpdGhpcy5vcGVuJiZ0aGlzLm9mKFwiXCIpLnBhY2tldCh7dHlwZTpcImRpc2Nvbm5lY3RcIn0pLHRoaXMub25EaXNjb25uZWN0KFwiYm9vdGVkXCIpO3JldHVybiB0aGlzfSxkLnByb3RvdHlwZS5kaXNjb25uZWN0U3luYz1mdW5jdGlvbigpe3ZhciBhPWIudXRpbC5yZXF1ZXN0KCksYz1bXCJodHRwXCIrKHRoaXMub3B0aW9ucy5zZWN1cmU/XCJzXCI6XCJcIikrXCI6L1wiLHRoaXMub3B0aW9ucy5ob3N0K1wiOlwiK3RoaXMub3B0aW9ucy5wb3J0LHRoaXMub3B0aW9ucy5yZXNvdXJjZSxiLnByb3RvY29sLFwiXCIsdGhpcy5zZXNzaW9uaWRdLmpvaW4oXCIvXCIpK1wiLz9kaXNjb25uZWN0PTFcIjthLm9wZW4oXCJHRVRcIixjLCExKSxhLnNlbmQobnVsbCksdGhpcy5vbkRpc2Nvbm5lY3QoXCJib290ZWRcIil9LGQucHJvdG90eXBlLmlzWERvbWFpbj1mdW5jdGlvbigpe3ZhciBhPWMubG9jYXRpb24ucG9ydHx8KFwiaHR0cHM6XCI9PWMubG9jYXRpb24ucHJvdG9jb2w/NDQzOjgwKTtyZXR1cm4gdGhpcy5vcHRpb25zLmhvc3QhPT1jLmxvY2F0aW9uLmhvc3RuYW1lfHx0aGlzLm9wdGlvbnMucG9ydCE9YX0sZC5wcm90b3R5cGUub25Db25uZWN0PWZ1bmN0aW9uKCl7dGhpcy5jb25uZWN0ZWR8fCh0aGlzLmNvbm5lY3RlZD0hMCx0aGlzLmNvbm5lY3Rpbmc9ITEsdGhpcy5kb0J1ZmZlcnx8dGhpcy5zZXRCdWZmZXIoITEpLHRoaXMuZW1pdChcImNvbm5lY3RcIikpfSxkLnByb3RvdHlwZS5vbk9wZW49ZnVuY3Rpb24oKXt0aGlzLm9wZW49ITB9LGQucHJvdG90eXBlLm9uQ2xvc2U9ZnVuY3Rpb24oKXt0aGlzLm9wZW49ITEsY2xlYXJUaW1lb3V0KHRoaXMuaGVhcnRiZWF0VGltZW91dFRpbWVyKX0sZC5wcm90b3R5cGUub25QYWNrZXQ9ZnVuY3Rpb24oYSl7dGhpcy5vZihhLmVuZHBvaW50KS5vblBhY2tldChhKX0sZC5wcm90b3R5cGUub25FcnJvcj1mdW5jdGlvbihhKXthJiZhLmFkdmljZSYmYS5hZHZpY2U9PT1cInJlY29ubmVjdFwiJiYodGhpcy5jb25uZWN0ZWR8fHRoaXMuY29ubmVjdGluZykmJih0aGlzLmRpc2Nvbm5lY3QoKSx0aGlzLm9wdGlvbnMucmVjb25uZWN0JiZ0aGlzLnJlY29ubmVjdCgpKSx0aGlzLnB1Ymxpc2goXCJlcnJvclwiLGEmJmEucmVhc29uP2EucmVhc29uOmEpfSxkLnByb3RvdHlwZS5vbkRpc2Nvbm5lY3Q9ZnVuY3Rpb24oYSl7dmFyIGI9dGhpcy5jb25uZWN0ZWQsYz10aGlzLmNvbm5lY3Rpbmc7dGhpcy5jb25uZWN0ZWQ9ITEsdGhpcy5jb25uZWN0aW5nPSExLHRoaXMub3Blbj0hMTtpZihifHxjKXRoaXMudHJhbnNwb3J0LmNsb3NlKCksdGhpcy50cmFuc3BvcnQuY2xlYXJUaW1lb3V0cygpLGImJih0aGlzLnB1Ymxpc2goXCJkaXNjb25uZWN0XCIsYSksXCJib290ZWRcIiE9YSYmdGhpcy5vcHRpb25zLnJlY29ubmVjdCYmIXRoaXMucmVjb25uZWN0aW5nJiZ0aGlzLnJlY29ubmVjdCgpKX0sZC5wcm90b3R5cGUucmVjb25uZWN0PWZ1bmN0aW9uKCl7ZnVuY3Rpb24gZSgpe2lmKGEuY29ubmVjdGVkKXtmb3IodmFyIGIgaW4gYS5uYW1lc3BhY2VzKWEubmFtZXNwYWNlcy5oYXNPd25Qcm9wZXJ0eShiKSYmXCJcIiE9PWImJmEubmFtZXNwYWNlc1tiXS5wYWNrZXQoe3R5cGU6XCJjb25uZWN0XCJ9KTthLnB1Ymxpc2goXCJyZWNvbm5lY3RcIixhLnRyYW5zcG9ydC5uYW1lLGEucmVjb25uZWN0aW9uQXR0ZW1wdHMpfWNsZWFyVGltZW91dChhLnJlY29ubmVjdGlvblRpbWVyKSxhLnJlbW92ZUxpc3RlbmVyKFwiY29ubmVjdF9mYWlsZWRcIixmKSxhLnJlbW92ZUxpc3RlbmVyKFwiY29ubmVjdFwiLGYpLGEucmVjb25uZWN0aW5nPSExLGRlbGV0ZSBhLnJlY29ubmVjdGlvbkF0dGVtcHRzLGRlbGV0ZSBhLnJlY29ubmVjdGlvbkRlbGF5LGRlbGV0ZSBhLnJlY29ubmVjdGlvblRpbWVyLGRlbGV0ZSBhLnJlZG9UcmFuc3BvcnRzLGEub3B0aW9uc1tcInRyeSBtdWx0aXBsZSB0cmFuc3BvcnRzXCJdPWN9ZnVuY3Rpb24gZigpe2lmKCFhLnJlY29ubmVjdGluZylyZXR1cm47aWYoYS5jb25uZWN0ZWQpcmV0dXJuIGUoKTtpZihhLmNvbm5lY3RpbmcmJmEucmVjb25uZWN0aW5nKXJldHVybiBhLnJlY29ubmVjdGlvblRpbWVyPXNldFRpbWVvdXQoZiwxZTMpO2EucmVjb25uZWN0aW9uQXR0ZW1wdHMrKz49Yj9hLnJlZG9UcmFuc3BvcnRzPyhhLnB1Ymxpc2goXCJyZWNvbm5lY3RfZmFpbGVkXCIpLGUoKSk6KGEub24oXCJjb25uZWN0X2ZhaWxlZFwiLGYpLGEub3B0aW9uc1tcInRyeSBtdWx0aXBsZSB0cmFuc3BvcnRzXCJdPSEwLGEudHJhbnNwb3J0cz1hLm9yaWdUcmFuc3BvcnRzLGEudHJhbnNwb3J0PWEuZ2V0VHJhbnNwb3J0KCksYS5yZWRvVHJhbnNwb3J0cz0hMCxhLmNvbm5lY3QoKSk6KGEucmVjb25uZWN0aW9uRGVsYXk8ZCYmKGEucmVjb25uZWN0aW9uRGVsYXkqPTIpLGEuY29ubmVjdCgpLGEucHVibGlzaChcInJlY29ubmVjdGluZ1wiLGEucmVjb25uZWN0aW9uRGVsYXksYS5yZWNvbm5lY3Rpb25BdHRlbXB0cyksYS5yZWNvbm5lY3Rpb25UaW1lcj1zZXRUaW1lb3V0KGYsYS5yZWNvbm5lY3Rpb25EZWxheSkpfXRoaXMucmVjb25uZWN0aW5nPSEwLHRoaXMucmVjb25uZWN0aW9uQXR0ZW1wdHM9MCx0aGlzLnJlY29ubmVjdGlvbkRlbGF5PXRoaXMub3B0aW9uc1tcInJlY29ubmVjdGlvbiBkZWxheVwiXTt2YXIgYT10aGlzLGI9dGhpcy5vcHRpb25zW1wibWF4IHJlY29ubmVjdGlvbiBhdHRlbXB0c1wiXSxjPXRoaXMub3B0aW9uc1tcInRyeSBtdWx0aXBsZSB0cmFuc3BvcnRzXCJdLGQ9dGhpcy5vcHRpb25zW1wicmVjb25uZWN0aW9uIGxpbWl0XCJdO3RoaXMub3B0aW9uc1tcInRyeSBtdWx0aXBsZSB0cmFuc3BvcnRzXCJdPSExLHRoaXMucmVjb25uZWN0aW9uVGltZXI9c2V0VGltZW91dChmLHRoaXMucmVjb25uZWN0aW9uRGVsYXkpLHRoaXMub24oXCJjb25uZWN0XCIsZil9fShcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW86bW9kdWxlLmV4cG9ydHMsXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvOm1vZHVsZS5wYXJlbnQuZXhwb3J0cyx0aGlzKSxmdW5jdGlvbihhLGIpe2Z1bmN0aW9uIGMoYSxiKXt0aGlzLnNvY2tldD1hLHRoaXMubmFtZT1ifHxcIlwiLHRoaXMuZmxhZ3M9e30sdGhpcy5qc29uPW5ldyBkKHRoaXMsXCJqc29uXCIpLHRoaXMuYWNrUGFja2V0cz0wLHRoaXMuYWNrcz17fX1mdW5jdGlvbiBkKGEsYil7dGhpcy5uYW1lc3BhY2U9YSx0aGlzLm5hbWU9Yn1hLlNvY2tldE5hbWVzcGFjZT1jLGIudXRpbC5taXhpbihjLGIuRXZlbnRFbWl0dGVyKSxjLnByb3RvdHlwZS4kZW1pdD1iLkV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCxjLnByb3RvdHlwZS5vZj1mdW5jdGlvbigpe3JldHVybiB0aGlzLnNvY2tldC5vZi5hcHBseSh0aGlzLnNvY2tldCxhcmd1bWVudHMpfSxjLnByb3RvdHlwZS5wYWNrZXQ9ZnVuY3Rpb24oYSl7cmV0dXJuIGEuZW5kcG9pbnQ9dGhpcy5uYW1lLHRoaXMuc29ja2V0LnBhY2tldChhKSx0aGlzLmZsYWdzPXt9LHRoaXN9LGMucHJvdG90eXBlLnNlbmQ9ZnVuY3Rpb24oYSxiKXt2YXIgYz17dHlwZTp0aGlzLmZsYWdzLmpzb24/XCJqc29uXCI6XCJtZXNzYWdlXCIsZGF0YTphfTtyZXR1cm5cImZ1bmN0aW9uXCI9PXR5cGVvZiBiJiYoYy5pZD0rK3RoaXMuYWNrUGFja2V0cyxjLmFjaz0hMCx0aGlzLmFja3NbYy5pZF09YiksdGhpcy5wYWNrZXQoYyl9LGMucHJvdG90eXBlLmVtaXQ9ZnVuY3Rpb24oYSl7dmFyIGI9QXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLDEpLGM9YltiLmxlbmd0aC0xXSxkPXt0eXBlOlwiZXZlbnRcIixuYW1lOmF9O3JldHVyblwiZnVuY3Rpb25cIj09dHlwZW9mIGMmJihkLmlkPSsrdGhpcy5hY2tQYWNrZXRzLGQuYWNrPVwiZGF0YVwiLHRoaXMuYWNrc1tkLmlkXT1jLGI9Yi5zbGljZSgwLGIubGVuZ3RoLTEpKSxkLmFyZ3M9Yix0aGlzLnBhY2tldChkKX0sYy5wcm90b3R5cGUuZGlzY29ubmVjdD1mdW5jdGlvbigpe3JldHVybiB0aGlzLm5hbWU9PT1cIlwiP3RoaXMuc29ja2V0LmRpc2Nvbm5lY3QoKToodGhpcy5wYWNrZXQoe3R5cGU6XCJkaXNjb25uZWN0XCJ9KSx0aGlzLiRlbWl0KFwiZGlzY29ubmVjdFwiKSksdGhpc30sYy5wcm90b3R5cGUub25QYWNrZXQ9ZnVuY3Rpb24oYSl7ZnVuY3Rpb24gZCgpe2MucGFja2V0KHt0eXBlOlwiYWNrXCIsYXJnczpiLnV0aWwudG9BcnJheShhcmd1bWVudHMpLGFja0lkOmEuaWR9KX12YXIgYz10aGlzO3N3aXRjaChhLnR5cGUpe2Nhc2VcImNvbm5lY3RcIjp0aGlzLiRlbWl0KFwiY29ubmVjdFwiKTticmVhaztjYXNlXCJkaXNjb25uZWN0XCI6dGhpcy5uYW1lPT09XCJcIj90aGlzLnNvY2tldC5vbkRpc2Nvbm5lY3QoYS5yZWFzb258fFwiYm9vdGVkXCIpOnRoaXMuJGVtaXQoXCJkaXNjb25uZWN0XCIsYS5yZWFzb24pO2JyZWFrO2Nhc2VcIm1lc3NhZ2VcIjpjYXNlXCJqc29uXCI6dmFyIGU9W1wibWVzc2FnZVwiLGEuZGF0YV07YS5hY2s9PVwiZGF0YVwiP2UucHVzaChkKTphLmFjayYmdGhpcy5wYWNrZXQoe3R5cGU6XCJhY2tcIixhY2tJZDphLmlkfSksdGhpcy4kZW1pdC5hcHBseSh0aGlzLGUpO2JyZWFrO2Nhc2VcImV2ZW50XCI6dmFyIGU9W2EubmFtZV0uY29uY2F0KGEuYXJncyk7YS5hY2s9PVwiZGF0YVwiJiZlLnB1c2goZCksdGhpcy4kZW1pdC5hcHBseSh0aGlzLGUpO2JyZWFrO2Nhc2VcImFja1wiOnRoaXMuYWNrc1thLmFja0lkXSYmKHRoaXMuYWNrc1thLmFja0lkXS5hcHBseSh0aGlzLGEuYXJncyksZGVsZXRlIHRoaXMuYWNrc1thLmFja0lkXSk7YnJlYWs7Y2FzZVwiZXJyb3JcIjphLmFkdmljZT90aGlzLnNvY2tldC5vbkVycm9yKGEpOmEucmVhc29uPT1cInVuYXV0aG9yaXplZFwiP3RoaXMuJGVtaXQoXCJjb25uZWN0X2ZhaWxlZFwiLGEucmVhc29uKTp0aGlzLiRlbWl0KFwiZXJyb3JcIixhLnJlYXNvbil9fSxkLnByb3RvdHlwZS5zZW5kPWZ1bmN0aW9uKCl7dGhpcy5uYW1lc3BhY2UuZmxhZ3NbdGhpcy5uYW1lXT0hMCx0aGlzLm5hbWVzcGFjZS5zZW5kLmFwcGx5KHRoaXMubmFtZXNwYWNlLGFyZ3VtZW50cyl9LGQucHJvdG90eXBlLmVtaXQ9ZnVuY3Rpb24oKXt0aGlzLm5hbWVzcGFjZS5mbGFnc1t0aGlzLm5hbWVdPSEwLHRoaXMubmFtZXNwYWNlLmVtaXQuYXBwbHkodGhpcy5uYW1lc3BhY2UsYXJndW1lbnRzKX19KFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pbzptb2R1bGUuZXhwb3J0cyxcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW86bW9kdWxlLnBhcmVudC5leHBvcnRzKSxmdW5jdGlvbihhLGIsYyl7ZnVuY3Rpb24gZChhKXtiLlRyYW5zcG9ydC5hcHBseSh0aGlzLGFyZ3VtZW50cyl9YS53ZWJzb2NrZXQ9ZCxiLnV0aWwuaW5oZXJpdChkLGIuVHJhbnNwb3J0KSxkLnByb3RvdHlwZS5uYW1lPVwid2Vic29ja2V0XCIsZC5wcm90b3R5cGUub3Blbj1mdW5jdGlvbigpe3ZhciBhPWIudXRpbC5xdWVyeSh0aGlzLnNvY2tldC5vcHRpb25zLnF1ZXJ5KSxkPXRoaXMsZTtyZXR1cm4gZXx8KGU9Yy5Nb3pXZWJTb2NrZXR8fGMuV2ViU29ja2V0KSx0aGlzLndlYnNvY2tldD1uZXcgZSh0aGlzLnByZXBhcmVVcmwoKSthKSx0aGlzLndlYnNvY2tldC5vbm9wZW49ZnVuY3Rpb24oKXtkLm9uT3BlbigpLGQuc29ja2V0LnNldEJ1ZmZlcighMSl9LHRoaXMud2Vic29ja2V0Lm9ubWVzc2FnZT1mdW5jdGlvbihhKXtkLm9uRGF0YShhLmRhdGEpfSx0aGlzLndlYnNvY2tldC5vbmNsb3NlPWZ1bmN0aW9uKCl7ZC5vbkNsb3NlKCksZC5zb2NrZXQuc2V0QnVmZmVyKCEwKX0sdGhpcy53ZWJzb2NrZXQub25lcnJvcj1mdW5jdGlvbihhKXtkLm9uRXJyb3IoYSl9LHRoaXN9LGIudXRpbC51YS5pRGV2aWNlP2QucHJvdG90eXBlLnNlbmQ9ZnVuY3Rpb24oYSl7dmFyIGI9dGhpcztyZXR1cm4gc2V0VGltZW91dChmdW5jdGlvbigpe2Iud2Vic29ja2V0LnNlbmQoYSl9LDApLHRoaXN9OmQucHJvdG90eXBlLnNlbmQ9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMud2Vic29ja2V0LnNlbmQoYSksdGhpc30sZC5wcm90b3R5cGUucGF5bG9hZD1mdW5jdGlvbihhKXtmb3IodmFyIGI9MCxjPWEubGVuZ3RoO2I8YztiKyspdGhpcy5wYWNrZXQoYVtiXSk7cmV0dXJuIHRoaXN9LGQucHJvdG90eXBlLmNsb3NlPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMud2Vic29ja2V0LmNsb3NlKCksdGhpc30sZC5wcm90b3R5cGUub25FcnJvcj1mdW5jdGlvbihhKXt0aGlzLnNvY2tldC5vbkVycm9yKGEpfSxkLnByb3RvdHlwZS5zY2hlbWU9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5zb2NrZXQub3B0aW9ucy5zZWN1cmU/XCJ3c3NcIjpcIndzXCJ9LGQuY2hlY2s9ZnVuY3Rpb24oKXtyZXR1cm5cIldlYlNvY2tldFwiaW4gYyYmIShcIl9fYWRkVGFza1wiaW4gV2ViU29ja2V0KXx8XCJNb3pXZWJTb2NrZXRcImluIGN9LGQueGRvbWFpbkNoZWNrPWZ1bmN0aW9uKCl7cmV0dXJuITB9LGIudHJhbnNwb3J0cy5wdXNoKFwid2Vic29ja2V0XCIpfShcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW8uVHJhbnNwb3J0Om1vZHVsZS5leHBvcnRzLFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pbzptb2R1bGUucGFyZW50LmV4cG9ydHMsdGhpcyksZnVuY3Rpb24oYSxiKXtmdW5jdGlvbiBjKCl7Yi5UcmFuc3BvcnQud2Vic29ja2V0LmFwcGx5KHRoaXMsYXJndW1lbnRzKX1hLmZsYXNoc29ja2V0PWMsYi51dGlsLmluaGVyaXQoYyxiLlRyYW5zcG9ydC53ZWJzb2NrZXQpLGMucHJvdG90eXBlLm5hbWU9XCJmbGFzaHNvY2tldFwiLGMucHJvdG90eXBlLm9wZW49ZnVuY3Rpb24oKXt2YXIgYT10aGlzLGM9YXJndW1lbnRzO3JldHVybiBXZWJTb2NrZXQuX19hZGRUYXNrKGZ1bmN0aW9uKCl7Yi5UcmFuc3BvcnQud2Vic29ja2V0LnByb3RvdHlwZS5vcGVuLmFwcGx5KGEsYyl9KSx0aGlzfSxjLnByb3RvdHlwZS5zZW5kPWZ1bmN0aW9uKCl7dmFyIGE9dGhpcyxjPWFyZ3VtZW50cztyZXR1cm4gV2ViU29ja2V0Ll9fYWRkVGFzayhmdW5jdGlvbigpe2IuVHJhbnNwb3J0LndlYnNvY2tldC5wcm90b3R5cGUuc2VuZC5hcHBseShhLGMpfSksdGhpc30sYy5wcm90b3R5cGUuY2xvc2U9ZnVuY3Rpb24oKXtyZXR1cm4gV2ViU29ja2V0Ll9fdGFza3MubGVuZ3RoPTAsYi5UcmFuc3BvcnQud2Vic29ja2V0LnByb3RvdHlwZS5jbG9zZS5jYWxsKHRoaXMpLHRoaXN9LGMucHJvdG90eXBlLnJlYWR5PWZ1bmN0aW9uKGEsZCl7ZnVuY3Rpb24gZSgpe3ZhciBiPWEub3B0aW9ucyxlPWJbXCJmbGFzaCBwb2xpY3kgcG9ydFwiXSxnPVtcImh0dHBcIisoYi5zZWN1cmU/XCJzXCI6XCJcIikrXCI6L1wiLGIuaG9zdCtcIjpcIitiLnBvcnQsYi5yZXNvdXJjZSxcInN0YXRpYy9mbGFzaHNvY2tldFwiLFwiV2ViU29ja2V0TWFpblwiKyhhLmlzWERvbWFpbigpP1wiSW5zZWN1cmVcIjpcIlwiKStcIi5zd2ZcIl07Yy5sb2FkZWR8fCh0eXBlb2YgV0VCX1NPQ0tFVF9TV0ZfTE9DQVRJT049PVwidW5kZWZpbmVkXCImJihXRUJfU09DS0VUX1NXRl9MT0NBVElPTj1nLmpvaW4oXCIvXCIpKSxlIT09ODQzJiZXZWJTb2NrZXQubG9hZEZsYXNoUG9saWN5RmlsZShcInhtbHNvY2tldDovL1wiK2IuaG9zdCtcIjpcIitlKSxXZWJTb2NrZXQuX19pbml0aWFsaXplKCksYy5sb2FkZWQ9ITApLGQuY2FsbChmKX12YXIgZj10aGlzO2lmKGRvY3VtZW50LmJvZHkpcmV0dXJuIGUoKTtiLnV0aWwubG9hZChlKX0sYy5jaGVjaz1mdW5jdGlvbigpe3JldHVybiB0eXBlb2YgV2ViU29ja2V0IT1cInVuZGVmaW5lZFwiJiZcIl9faW5pdGlhbGl6ZVwiaW4gV2ViU29ja2V0JiYhIXN3Zm9iamVjdD9zd2ZvYmplY3QuZ2V0Rmxhc2hQbGF5ZXJWZXJzaW9uKCkubWFqb3I+PTEwOiExfSxjLnhkb21haW5DaGVjaz1mdW5jdGlvbigpe3JldHVybiEwfSx0eXBlb2Ygd2luZG93IT1cInVuZGVmaW5lZFwiJiYoV0VCX1NPQ0tFVF9ESVNBQkxFX0FVVE9fSU5JVElBTElaQVRJT049ITApLGIudHJhbnNwb3J0cy5wdXNoKFwiZmxhc2hzb2NrZXRcIil9KFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pby5UcmFuc3BvcnQ6bW9kdWxlLmV4cG9ydHMsXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvOm1vZHVsZS5wYXJlbnQuZXhwb3J0cyk7aWYoXCJ1bmRlZmluZWRcIiE9dHlwZW9mIHdpbmRvdyl2YXIgc3dmb2JqZWN0PWZ1bmN0aW9uKCl7ZnVuY3Rpb24gQSgpe2lmKHQpcmV0dXJuO3RyeXt2YXIgYT1pLmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiYm9keVwiKVswXS5hcHBlbmRDaGlsZChRKFwic3BhblwiKSk7YS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGEpfWNhdGNoKGIpe3JldHVybn10PSEwO3ZhciBjPWwubGVuZ3RoO2Zvcih2YXIgZD0wO2Q8YztkKyspbFtkXSgpfWZ1bmN0aW9uIEIoYSl7dD9hKCk6bFtsLmxlbmd0aF09YX1mdW5jdGlvbiBDKGIpe2lmKHR5cGVvZiBoLmFkZEV2ZW50TGlzdGVuZXIhPWEpaC5hZGRFdmVudExpc3RlbmVyKFwibG9hZFwiLGIsITEpO2Vsc2UgaWYodHlwZW9mIGkuYWRkRXZlbnRMaXN0ZW5lciE9YSlpLmFkZEV2ZW50TGlzdGVuZXIoXCJsb2FkXCIsYiwhMSk7ZWxzZSBpZih0eXBlb2YgaC5hdHRhY2hFdmVudCE9YSlSKGgsXCJvbmxvYWRcIixiKTtlbHNlIGlmKHR5cGVvZiBoLm9ubG9hZD09XCJmdW5jdGlvblwiKXt2YXIgYz1oLm9ubG9hZDtoLm9ubG9hZD1mdW5jdGlvbigpe2MoKSxiKCl9fWVsc2UgaC5vbmxvYWQ9Yn1mdW5jdGlvbiBEKCl7az9FKCk6RigpfWZ1bmN0aW9uIEUoKXt2YXIgYz1pLmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiYm9keVwiKVswXSxkPVEoYik7ZC5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsZSk7dmFyIGY9Yy5hcHBlbmRDaGlsZChkKTtpZihmKXt2YXIgZz0wOyhmdW5jdGlvbigpe2lmKHR5cGVvZiBmLkdldFZhcmlhYmxlIT1hKXt2YXIgYj1mLkdldFZhcmlhYmxlKFwiJHZlcnNpb25cIik7YiYmKGI9Yi5zcGxpdChcIiBcIilbMV0uc3BsaXQoXCIsXCIpLHkucHY9W3BhcnNlSW50KGJbMF0sMTApLHBhcnNlSW50KGJbMV0sMTApLHBhcnNlSW50KGJbMl0sMTApXSl9ZWxzZSBpZihnPDEwKXtnKyssc2V0VGltZW91dChhcmd1bWVudHMuY2FsbGVlLDEwKTtyZXR1cm59Yy5yZW1vdmVDaGlsZChkKSxmPW51bGwsRigpfSkoKX1lbHNlIEYoKX1mdW5jdGlvbiBGKCl7dmFyIGI9bS5sZW5ndGg7aWYoYj4wKWZvcih2YXIgYz0wO2M8YjtjKyspe3ZhciBkPW1bY10uaWQsZT1tW2NdLmNhbGxiYWNrRm4sZj17c3VjY2VzczohMSxpZDpkfTtpZih5LnB2WzBdPjApe3ZhciBnPVAoZCk7aWYoZylpZihTKG1bY10uc3dmVmVyc2lvbikmJiEoeS53ayYmeS53azwzMTIpKVUoZCwhMCksZSYmKGYuc3VjY2Vzcz0hMCxmLnJlZj1HKGQpLGUoZikpO2Vsc2UgaWYobVtjXS5leHByZXNzSW5zdGFsbCYmSCgpKXt2YXIgaD17fTtoLmRhdGE9bVtjXS5leHByZXNzSW5zdGFsbCxoLndpZHRoPWcuZ2V0QXR0cmlidXRlKFwid2lkdGhcIil8fFwiMFwiLGguaGVpZ2h0PWcuZ2V0QXR0cmlidXRlKFwiaGVpZ2h0XCIpfHxcIjBcIixnLmdldEF0dHJpYnV0ZShcImNsYXNzXCIpJiYoaC5zdHlsZWNsYXNzPWcuZ2V0QXR0cmlidXRlKFwiY2xhc3NcIikpLGcuZ2V0QXR0cmlidXRlKFwiYWxpZ25cIikmJihoLmFsaWduPWcuZ2V0QXR0cmlidXRlKFwiYWxpZ25cIikpO3ZhciBpPXt9LGo9Zy5nZXRFbGVtZW50c0J5VGFnTmFtZShcInBhcmFtXCIpLGs9ai5sZW5ndGg7Zm9yKHZhciBsPTA7bDxrO2wrKylqW2xdLmdldEF0dHJpYnV0ZShcIm5hbWVcIikudG9Mb3dlckNhc2UoKSE9XCJtb3ZpZVwiJiYoaVtqW2xdLmdldEF0dHJpYnV0ZShcIm5hbWVcIildPWpbbF0uZ2V0QXR0cmlidXRlKFwidmFsdWVcIikpO0koaCxpLGQsZSl9ZWxzZSBKKGcpLGUmJmUoZil9ZWxzZXtVKGQsITApO2lmKGUpe3ZhciBuPUcoZCk7biYmdHlwZW9mIG4uU2V0VmFyaWFibGUhPWEmJihmLnN1Y2Nlc3M9ITAsZi5yZWY9biksZShmKX19fX1mdW5jdGlvbiBHKGMpe3ZhciBkPW51bGwsZT1QKGMpO2lmKGUmJmUubm9kZU5hbWU9PVwiT0JKRUNUXCIpaWYodHlwZW9mIGUuU2V0VmFyaWFibGUhPWEpZD1lO2Vsc2V7dmFyIGY9ZS5nZXRFbGVtZW50c0J5VGFnTmFtZShiKVswXTtmJiYoZD1mKX1yZXR1cm4gZH1mdW5jdGlvbiBIKCl7cmV0dXJuIXUmJlMoXCI2LjAuNjVcIikmJih5Lndpbnx8eS5tYWMpJiYhKHkud2smJnkud2s8MzEyKX1mdW5jdGlvbiBJKGIsYyxkLGUpe3U9ITAscj1lfHxudWxsLHM9e3N1Y2Nlc3M6ITEsaWQ6ZH07dmFyIGc9UChkKTtpZihnKXtnLm5vZGVOYW1lPT1cIk9CSkVDVFwiPyhwPUsoZykscT1udWxsKToocD1nLHE9ZCksYi5pZD1mO2lmKHR5cGVvZiBiLndpZHRoPT1hfHwhLyUkLy50ZXN0KGIud2lkdGgpJiZwYXJzZUludChiLndpZHRoLDEwKTwzMTApYi53aWR0aD1cIjMxMFwiO2lmKHR5cGVvZiBiLmhlaWdodD09YXx8IS8lJC8udGVzdChiLmhlaWdodCkmJnBhcnNlSW50KGIuaGVpZ2h0LDEwKTwxMzcpYi5oZWlnaHQ9XCIxMzdcIjtpLnRpdGxlPWkudGl0bGUuc2xpY2UoMCw0NykrXCIgLSBGbGFzaCBQbGF5ZXIgSW5zdGFsbGF0aW9uXCI7dmFyIGo9eS5pZSYmeS53aW4/W1wiQWN0aXZlXCJdLmNvbmNhdChcIlwiKS5qb2luKFwiWFwiKTpcIlBsdWdJblwiLGs9XCJNTXJlZGlyZWN0VVJMPVwiK2gubG9jYXRpb24udG9TdHJpbmcoKS5yZXBsYWNlKC8mL2csXCIlMjZcIikrXCImTU1wbGF5ZXJUeXBlPVwiK2orXCImTU1kb2N0aXRsZT1cIitpLnRpdGxlO3R5cGVvZiBjLmZsYXNodmFycyE9YT9jLmZsYXNodmFycys9XCImXCIrazpjLmZsYXNodmFycz1rO2lmKHkuaWUmJnkud2luJiZnLnJlYWR5U3RhdGUhPTQpe3ZhciBsPVEoXCJkaXZcIik7ZCs9XCJTV0ZPYmplY3ROZXdcIixsLnNldEF0dHJpYnV0ZShcImlkXCIsZCksZy5wYXJlbnROb2RlLmluc2VydEJlZm9yZShsLGcpLGcuc3R5bGUuZGlzcGxheT1cIm5vbmVcIixmdW5jdGlvbigpe2cucmVhZHlTdGF0ZT09ND9nLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoZyk6c2V0VGltZW91dChhcmd1bWVudHMuY2FsbGVlLDEwKX0oKX1MKGIsYyxkKX19ZnVuY3Rpb24gSihhKXtpZih5LmllJiZ5LndpbiYmYS5yZWFkeVN0YXRlIT00KXt2YXIgYj1RKFwiZGl2XCIpO2EucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUoYixhKSxiLnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKEsoYSksYiksYS5zdHlsZS5kaXNwbGF5PVwibm9uZVwiLGZ1bmN0aW9uKCl7YS5yZWFkeVN0YXRlPT00P2EucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChhKTpzZXRUaW1lb3V0KGFyZ3VtZW50cy5jYWxsZWUsMTApfSgpfWVsc2UgYS5wYXJlbnROb2RlLnJlcGxhY2VDaGlsZChLKGEpLGEpfWZ1bmN0aW9uIEsoYSl7dmFyIGM9UShcImRpdlwiKTtpZih5LndpbiYmeS5pZSljLmlubmVySFRNTD1hLmlubmVySFRNTDtlbHNle3ZhciBkPWEuZ2V0RWxlbWVudHNCeVRhZ05hbWUoYilbMF07aWYoZCl7dmFyIGU9ZC5jaGlsZE5vZGVzO2lmKGUpe3ZhciBmPWUubGVuZ3RoO2Zvcih2YXIgZz0wO2c8ZjtnKyspKGVbZ10ubm9kZVR5cGUhPTF8fGVbZ10ubm9kZU5hbWUhPVwiUEFSQU1cIikmJmVbZ10ubm9kZVR5cGUhPTgmJmMuYXBwZW5kQ2hpbGQoZVtnXS5jbG9uZU5vZGUoITApKX19fXJldHVybiBjfWZ1bmN0aW9uIEwoYyxkLGYpe3ZhciBnLGg9UChmKTtpZih5LndrJiZ5LndrPDMxMilyZXR1cm4gZztpZihoKXt0eXBlb2YgYy5pZD09YSYmKGMuaWQ9Zik7aWYoeS5pZSYmeS53aW4pe3ZhciBpPVwiXCI7Zm9yKHZhciBqIGluIGMpY1tqXSE9T2JqZWN0LnByb3RvdHlwZVtqXSYmKGoudG9Mb3dlckNhc2UoKT09XCJkYXRhXCI/ZC5tb3ZpZT1jW2pdOmoudG9Mb3dlckNhc2UoKT09XCJzdHlsZWNsYXNzXCI/aSs9JyBjbGFzcz1cIicrY1tqXSsnXCInOmoudG9Mb3dlckNhc2UoKSE9XCJjbGFzc2lkXCImJihpKz1cIiBcIitqKyc9XCInK2Nbal0rJ1wiJykpO3ZhciBrPVwiXCI7Zm9yKHZhciBsIGluIGQpZFtsXSE9T2JqZWN0LnByb3RvdHlwZVtsXSYmKGsrPSc8cGFyYW0gbmFtZT1cIicrbCsnXCIgdmFsdWU9XCInK2RbbF0rJ1wiIC8+Jyk7aC5vdXRlckhUTUw9JzxvYmplY3QgY2xhc3NpZD1cImNsc2lkOkQyN0NEQjZFLUFFNkQtMTFjZi05NkI4LTQ0NDU1MzU0MDAwMFwiJytpK1wiPlwiK2srXCI8L29iamVjdD5cIixuW24ubGVuZ3RoXT1jLmlkLGc9UChjLmlkKX1lbHNle3ZhciBtPVEoYik7bS5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsZSk7Zm9yKHZhciBvIGluIGMpY1tvXSE9T2JqZWN0LnByb3RvdHlwZVtvXSYmKG8udG9Mb3dlckNhc2UoKT09XCJzdHlsZWNsYXNzXCI/bS5zZXRBdHRyaWJ1dGUoXCJjbGFzc1wiLGNbb10pOm8udG9Mb3dlckNhc2UoKSE9XCJjbGFzc2lkXCImJm0uc2V0QXR0cmlidXRlKG8sY1tvXSkpO2Zvcih2YXIgcCBpbiBkKWRbcF0hPU9iamVjdC5wcm90b3R5cGVbcF0mJnAudG9Mb3dlckNhc2UoKSE9XCJtb3ZpZVwiJiZNKG0scCxkW3BdKTtoLnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKG0saCksZz1tfX1yZXR1cm4gZ31mdW5jdGlvbiBNKGEsYixjKXt2YXIgZD1RKFwicGFyYW1cIik7ZC5zZXRBdHRyaWJ1dGUoXCJuYW1lXCIsYiksZC5zZXRBdHRyaWJ1dGUoXCJ2YWx1ZVwiLGMpLGEuYXBwZW5kQ2hpbGQoZCl9ZnVuY3Rpb24gTihhKXt2YXIgYj1QKGEpO2ImJmIubm9kZU5hbWU9PVwiT0JKRUNUXCImJih5LmllJiZ5Lndpbj8oYi5zdHlsZS5kaXNwbGF5PVwibm9uZVwiLGZ1bmN0aW9uKCl7Yi5yZWFkeVN0YXRlPT00P08oYSk6c2V0VGltZW91dChhcmd1bWVudHMuY2FsbGVlLDEwKX0oKSk6Yi5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGIpKX1mdW5jdGlvbiBPKGEpe3ZhciBiPVAoYSk7aWYoYil7Zm9yKHZhciBjIGluIGIpdHlwZW9mIGJbY109PVwiZnVuY3Rpb25cIiYmKGJbY109bnVsbCk7Yi5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGIpfX1mdW5jdGlvbiBQKGEpe3ZhciBiPW51bGw7dHJ5e2I9aS5nZXRFbGVtZW50QnlJZChhKX1jYXRjaChjKXt9cmV0dXJuIGJ9ZnVuY3Rpb24gUShhKXtyZXR1cm4gaS5jcmVhdGVFbGVtZW50KGEpfWZ1bmN0aW9uIFIoYSxiLGMpe2EuYXR0YWNoRXZlbnQoYixjKSxvW28ubGVuZ3RoXT1bYSxiLGNdfWZ1bmN0aW9uIFMoYSl7dmFyIGI9eS5wdixjPWEuc3BsaXQoXCIuXCIpO3JldHVybiBjWzBdPXBhcnNlSW50KGNbMF0sMTApLGNbMV09cGFyc2VJbnQoY1sxXSwxMCl8fDAsY1syXT1wYXJzZUludChjWzJdLDEwKXx8MCxiWzBdPmNbMF18fGJbMF09PWNbMF0mJmJbMV0+Y1sxXXx8YlswXT09Y1swXSYmYlsxXT09Y1sxXSYmYlsyXT49Y1syXT8hMDohMX1mdW5jdGlvbiBUKGMsZCxlLGYpe2lmKHkuaWUmJnkubWFjKXJldHVybjt2YXIgZz1pLmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiaGVhZFwiKVswXTtpZighZylyZXR1cm47dmFyIGg9ZSYmdHlwZW9mIGU9PVwic3RyaW5nXCI/ZTpcInNjcmVlblwiO2YmJih2PW51bGwsdz1udWxsKTtpZighdnx8dyE9aCl7dmFyIGo9UShcInN0eWxlXCIpO2ouc2V0QXR0cmlidXRlKFwidHlwZVwiLFwidGV4dC9jc3NcIiksai5zZXRBdHRyaWJ1dGUoXCJtZWRpYVwiLGgpLHY9Zy5hcHBlbmRDaGlsZChqKSx5LmllJiZ5LndpbiYmdHlwZW9mIGkuc3R5bGVTaGVldHMhPWEmJmkuc3R5bGVTaGVldHMubGVuZ3RoPjAmJih2PWkuc3R5bGVTaGVldHNbaS5zdHlsZVNoZWV0cy5sZW5ndGgtMV0pLHc9aH15LmllJiZ5Lndpbj92JiZ0eXBlb2Ygdi5hZGRSdWxlPT1iJiZ2LmFkZFJ1bGUoYyxkKTp2JiZ0eXBlb2YgaS5jcmVhdGVUZXh0Tm9kZSE9YSYmdi5hcHBlbmRDaGlsZChpLmNyZWF0ZVRleHROb2RlKGMrXCIge1wiK2QrXCJ9XCIpKX1mdW5jdGlvbiBVKGEsYil7aWYoIXgpcmV0dXJuO3ZhciBjPWI/XCJ2aXNpYmxlXCI6XCJoaWRkZW5cIjt0JiZQKGEpP1AoYSkuc3R5bGUudmlzaWJpbGl0eT1jOlQoXCIjXCIrYSxcInZpc2liaWxpdHk6XCIrYyl9ZnVuY3Rpb24gVihiKXt2YXIgYz0vW1xcXFxcXFwiPD5cXC47XS8sZD1jLmV4ZWMoYikhPW51bGw7cmV0dXJuIGQmJnR5cGVvZiBlbmNvZGVVUklDb21wb25lbnQhPWE/ZW5jb2RlVVJJQ29tcG9uZW50KGIpOmJ9dmFyIGE9XCJ1bmRlZmluZWRcIixiPVwib2JqZWN0XCIsYz1cIlNob2Nrd2F2ZSBGbGFzaFwiLGQ9XCJTaG9ja3dhdmVGbGFzaC5TaG9ja3dhdmVGbGFzaFwiLGU9XCJhcHBsaWNhdGlvbi94LXNob2Nrd2F2ZS1mbGFzaFwiLGY9XCJTV0ZPYmplY3RFeHBySW5zdFwiLGc9XCJvbnJlYWR5c3RhdGVjaGFuZ2VcIixoPXdpbmRvdyxpPWRvY3VtZW50LGo9bmF2aWdhdG9yLGs9ITEsbD1bRF0sbT1bXSxuPVtdLG89W10scCxxLHIscyx0PSExLHU9ITEsdix3LHg9ITAseT1mdW5jdGlvbigpe3ZhciBmPXR5cGVvZiBpLmdldEVsZW1lbnRCeUlkIT1hJiZ0eXBlb2YgaS5nZXRFbGVtZW50c0J5VGFnTmFtZSE9YSYmdHlwZW9mIGkuY3JlYXRlRWxlbWVudCE9YSxnPWoudXNlckFnZW50LnRvTG93ZXJDYXNlKCksbD1qLnBsYXRmb3JtLnRvTG93ZXJDYXNlKCksbT1sPy93aW4vLnRlc3QobCk6L3dpbi8udGVzdChnKSxuPWw/L21hYy8udGVzdChsKTovbWFjLy50ZXN0KGcpLG89L3dlYmtpdC8udGVzdChnKT9wYXJzZUZsb2F0KGcucmVwbGFjZSgvXi4qd2Via2l0XFwvKFxcZCsoXFwuXFxkKyk/KS4qJC8sXCIkMVwiKSk6ITEscD0hMSxxPVswLDAsMF0scj1udWxsO2lmKHR5cGVvZiBqLnBsdWdpbnMhPWEmJnR5cGVvZiBqLnBsdWdpbnNbY109PWIpcj1qLnBsdWdpbnNbY10uZGVzY3JpcHRpb24sciYmKHR5cGVvZiBqLm1pbWVUeXBlcz09YXx8IWoubWltZVR5cGVzW2VdfHwhIWoubWltZVR5cGVzW2VdLmVuYWJsZWRQbHVnaW4pJiYoaz0hMCxwPSExLHI9ci5yZXBsYWNlKC9eLipcXHMrKFxcUytcXHMrXFxTKyQpLyxcIiQxXCIpLHFbMF09cGFyc2VJbnQoci5yZXBsYWNlKC9eKC4qKVxcLi4qJC8sXCIkMVwiKSwxMCkscVsxXT1wYXJzZUludChyLnJlcGxhY2UoL14uKlxcLiguKilcXHMuKiQvLFwiJDFcIiksMTApLHFbMl09L1thLXpBLVpdLy50ZXN0KHIpP3BhcnNlSW50KHIucmVwbGFjZSgvXi4qW2EtekEtWl0rKC4qKSQvLFwiJDFcIiksMTApOjApO2Vsc2UgaWYodHlwZW9mIGhbW1wiQWN0aXZlXCJdLmNvbmNhdChcIk9iamVjdFwiKS5qb2luKFwiWFwiKV0hPWEpdHJ5e3ZhciBzPW5ldyh3aW5kb3dbW1wiQWN0aXZlXCJdLmNvbmNhdChcIk9iamVjdFwiKS5qb2luKFwiWFwiKV0pKGQpO3MmJihyPXMuR2V0VmFyaWFibGUoXCIkdmVyc2lvblwiKSxyJiYocD0hMCxyPXIuc3BsaXQoXCIgXCIpWzFdLnNwbGl0KFwiLFwiKSxxPVtwYXJzZUludChyWzBdLDEwKSxwYXJzZUludChyWzFdLDEwKSxwYXJzZUludChyWzJdLDEwKV0pKX1jYXRjaCh0KXt9cmV0dXJue3czOmYscHY6cSx3azpvLGllOnAsd2luOm0sbWFjOm59fSgpLHo9ZnVuY3Rpb24oKXtpZigheS53MylyZXR1cm47KHR5cGVvZiBpLnJlYWR5U3RhdGUhPWEmJmkucmVhZHlTdGF0ZT09XCJjb21wbGV0ZVwifHx0eXBlb2YgaS5yZWFkeVN0YXRlPT1hJiYoaS5nZXRFbGVtZW50c0J5VGFnTmFtZShcImJvZHlcIilbMF18fGkuYm9keSkpJiZBKCksdHx8KHR5cGVvZiBpLmFkZEV2ZW50TGlzdGVuZXIhPWEmJmkuYWRkRXZlbnRMaXN0ZW5lcihcIkRPTUNvbnRlbnRMb2FkZWRcIixBLCExKSx5LmllJiZ5LndpbiYmKGkuYXR0YWNoRXZlbnQoZyxmdW5jdGlvbigpe2kucmVhZHlTdGF0ZT09XCJjb21wbGV0ZVwiJiYoaS5kZXRhY2hFdmVudChnLGFyZ3VtZW50cy5jYWxsZWUpLEEoKSl9KSxoPT10b3AmJmZ1bmN0aW9uKCl7aWYodClyZXR1cm47dHJ5e2kuZG9jdW1lbnRFbGVtZW50LmRvU2Nyb2xsKFwibGVmdFwiKX1jYXRjaChhKXtzZXRUaW1lb3V0KGFyZ3VtZW50cy5jYWxsZWUsMCk7cmV0dXJufUEoKX0oKSkseS53ayYmZnVuY3Rpb24oKXtpZih0KXJldHVybjtpZighL2xvYWRlZHxjb21wbGV0ZS8udGVzdChpLnJlYWR5U3RhdGUpKXtzZXRUaW1lb3V0KGFyZ3VtZW50cy5jYWxsZWUsMCk7cmV0dXJufUEoKX0oKSxDKEEpKX0oKSxXPWZ1bmN0aW9uKCl7eS5pZSYmeS53aW4mJndpbmRvdy5hdHRhY2hFdmVudChcIm9udW5sb2FkXCIsZnVuY3Rpb24oKXt2YXIgYT1vLmxlbmd0aDtmb3IodmFyIGI9MDtiPGE7YisrKW9bYl1bMF0uZGV0YWNoRXZlbnQob1tiXVsxXSxvW2JdWzJdKTt2YXIgYz1uLmxlbmd0aDtmb3IodmFyIGQ9MDtkPGM7ZCsrKU4obltkXSk7Zm9yKHZhciBlIGluIHkpeVtlXT1udWxsO3k9bnVsbDtmb3IodmFyIGYgaW4gc3dmb2JqZWN0KXN3Zm9iamVjdFtmXT1udWxsO3N3Zm9iamVjdD1udWxsfSl9KCk7cmV0dXJue3JlZ2lzdGVyT2JqZWN0OmZ1bmN0aW9uKGEsYixjLGQpe2lmKHkudzMmJmEmJmIpe3ZhciBlPXt9O2UuaWQ9YSxlLnN3ZlZlcnNpb249YixlLmV4cHJlc3NJbnN0YWxsPWMsZS5jYWxsYmFja0ZuPWQsbVttLmxlbmd0aF09ZSxVKGEsITEpfWVsc2UgZCYmZCh7c3VjY2VzczohMSxpZDphfSl9LGdldE9iamVjdEJ5SWQ6ZnVuY3Rpb24oYSl7aWYoeS53MylyZXR1cm4gRyhhKX0sZW1iZWRTV0Y6ZnVuY3Rpb24oYyxkLGUsZixnLGgsaSxqLGssbCl7dmFyIG09e3N1Y2Nlc3M6ITEsaWQ6ZH07eS53MyYmISh5LndrJiZ5LndrPDMxMikmJmMmJmQmJmUmJmYmJmc/KFUoZCwhMSksQihmdW5jdGlvbigpe2UrPVwiXCIsZis9XCJcIjt2YXIgbj17fTtpZihrJiZ0eXBlb2Ygaz09PWIpZm9yKHZhciBvIGluIGspbltvXT1rW29dO24uZGF0YT1jLG4ud2lkdGg9ZSxuLmhlaWdodD1mO3ZhciBwPXt9O2lmKGomJnR5cGVvZiBqPT09Yilmb3IodmFyIHEgaW4gailwW3FdPWpbcV07aWYoaSYmdHlwZW9mIGk9PT1iKWZvcih2YXIgciBpbiBpKXR5cGVvZiBwLmZsYXNodmFycyE9YT9wLmZsYXNodmFycys9XCImXCIrcitcIj1cIitpW3JdOnAuZmxhc2h2YXJzPXIrXCI9XCIraVtyXTtpZihTKGcpKXt2YXIgcz1MKG4scCxkKTtuLmlkPT1kJiZVKGQsITApLG0uc3VjY2Vzcz0hMCxtLnJlZj1zfWVsc2V7aWYoaCYmSCgpKXtuLmRhdGE9aCxJKG4scCxkLGwpO3JldHVybn1VKGQsITApfWwmJmwobSl9KSk6bCYmbChtKX0sc3dpdGNoT2ZmQXV0b0hpZGVTaG93OmZ1bmN0aW9uKCl7eD0hMX0sdWE6eSxnZXRGbGFzaFBsYXllclZlcnNpb246ZnVuY3Rpb24oKXtyZXR1cm57bWFqb3I6eS5wdlswXSxtaW5vcjp5LnB2WzFdLHJlbGVhc2U6eS5wdlsyXX19LGhhc0ZsYXNoUGxheWVyVmVyc2lvbjpTLGNyZWF0ZVNXRjpmdW5jdGlvbihhLGIsYyl7cmV0dXJuIHkudzM/TChhLGIsYyk6dW5kZWZpbmVkfSxzaG93RXhwcmVzc0luc3RhbGw6ZnVuY3Rpb24oYSxiLGMsZCl7eS53MyYmSCgpJiZJKGEsYixjLGQpfSxyZW1vdmVTV0Y6ZnVuY3Rpb24oYSl7eS53MyYmTihhKX0sY3JlYXRlQ1NTOmZ1bmN0aW9uKGEsYixjLGQpe3kudzMmJlQoYSxiLGMsZCl9LGFkZERvbUxvYWRFdmVudDpCLGFkZExvYWRFdmVudDpDLGdldFF1ZXJ5UGFyYW1WYWx1ZTpmdW5jdGlvbihhKXt2YXIgYj1pLmxvY2F0aW9uLnNlYXJjaHx8aS5sb2NhdGlvbi5oYXNoO2lmKGIpey9cXD8vLnRlc3QoYikmJihiPWIuc3BsaXQoXCI/XCIpWzFdKTtpZihhPT1udWxsKXJldHVybiBWKGIpO3ZhciBjPWIuc3BsaXQoXCImXCIpO2Zvcih2YXIgZD0wO2Q8Yy5sZW5ndGg7ZCsrKWlmKGNbZF0uc3Vic3RyaW5nKDAsY1tkXS5pbmRleE9mKFwiPVwiKSk9PWEpcmV0dXJuIFYoY1tkXS5zdWJzdHJpbmcoY1tkXS5pbmRleE9mKFwiPVwiKSsxKSl9cmV0dXJuXCJcIn0sZXhwcmVzc0luc3RhbGxDYWxsYmFjazpmdW5jdGlvbigpe2lmKHUpe3ZhciBhPVAoZik7YSYmcCYmKGEucGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQocCxhKSxxJiYoVShxLCEwKSx5LmllJiZ5LndpbiYmKHAuc3R5bGUuZGlzcGxheT1cImJsb2NrXCIpKSxyJiZyKHMpKSx1PSExfX19fSgpOyhmdW5jdGlvbigpe2lmKFwidW5kZWZpbmVkXCI9PXR5cGVvZiB3aW5kb3d8fHdpbmRvdy5XZWJTb2NrZXQpcmV0dXJuO3ZhciBhPXdpbmRvdy5jb25zb2xlO2lmKCFhfHwhYS5sb2d8fCFhLmVycm9yKWE9e2xvZzpmdW5jdGlvbigpe30sZXJyb3I6ZnVuY3Rpb24oKXt9fTtpZighc3dmb2JqZWN0Lmhhc0ZsYXNoUGxheWVyVmVyc2lvbihcIjEwLjAuMFwiKSl7YS5lcnJvcihcIkZsYXNoIFBsYXllciA+PSAxMC4wLjAgaXMgcmVxdWlyZWQuXCIpO3JldHVybn1sb2NhdGlvbi5wcm90b2NvbD09XCJmaWxlOlwiJiZhLmVycm9yKFwiV0FSTklORzogd2ViLXNvY2tldC1qcyBkb2Vzbid0IHdvcmsgaW4gZmlsZTovLy8uLi4gVVJMIHVubGVzcyB5b3Ugc2V0IEZsYXNoIFNlY3VyaXR5IFNldHRpbmdzIHByb3Blcmx5LiBPcGVuIHRoZSBwYWdlIHZpYSBXZWIgc2VydmVyIGkuZS4gaHR0cDovLy4uLlwiKSxXZWJTb2NrZXQ9ZnVuY3Rpb24oYSxiLGMsZCxlKXt2YXIgZj10aGlzO2YuX19pZD1XZWJTb2NrZXQuX19uZXh0SWQrKyxXZWJTb2NrZXQuX19pbnN0YW5jZXNbZi5fX2lkXT1mLGYucmVhZHlTdGF0ZT1XZWJTb2NrZXQuQ09OTkVDVElORyxmLmJ1ZmZlcmVkQW1vdW50PTAsZi5fX2V2ZW50cz17fSxiP3R5cGVvZiBiPT1cInN0cmluZ1wiJiYoYj1bYl0pOmI9W10sc2V0VGltZW91dChmdW5jdGlvbigpe1dlYlNvY2tldC5fX2FkZFRhc2soZnVuY3Rpb24oKXtXZWJTb2NrZXQuX19mbGFzaC5jcmVhdGUoZi5fX2lkLGEsYixjfHxudWxsLGR8fDAsZXx8bnVsbCl9KX0sMCl9LFdlYlNvY2tldC5wcm90b3R5cGUuc2VuZD1mdW5jdGlvbihhKXtpZih0aGlzLnJlYWR5U3RhdGU9PVdlYlNvY2tldC5DT05ORUNUSU5HKXRocm93XCJJTlZBTElEX1NUQVRFX0VSUjogV2ViIFNvY2tldCBjb25uZWN0aW9uIGhhcyBub3QgYmVlbiBlc3RhYmxpc2hlZFwiO3ZhciBiPVdlYlNvY2tldC5fX2ZsYXNoLnNlbmQodGhpcy5fX2lkLGVuY29kZVVSSUNvbXBvbmVudChhKSk7cmV0dXJuIGI8MD8hMDoodGhpcy5idWZmZXJlZEFtb3VudCs9YiwhMSl9LFdlYlNvY2tldC5wcm90b3R5cGUuY2xvc2U9ZnVuY3Rpb24oKXtpZih0aGlzLnJlYWR5U3RhdGU9PVdlYlNvY2tldC5DTE9TRUR8fHRoaXMucmVhZHlTdGF0ZT09V2ViU29ja2V0LkNMT1NJTkcpcmV0dXJuO3RoaXMucmVhZHlTdGF0ZT1XZWJTb2NrZXQuQ0xPU0lORyxXZWJTb2NrZXQuX19mbGFzaC5jbG9zZSh0aGlzLl9faWQpfSxXZWJTb2NrZXQucHJvdG90eXBlLmFkZEV2ZW50TGlzdGVuZXI9ZnVuY3Rpb24oYSxiLGMpe2EgaW4gdGhpcy5fX2V2ZW50c3x8KHRoaXMuX19ldmVudHNbYV09W10pLHRoaXMuX19ldmVudHNbYV0ucHVzaChiKX0sV2ViU29ja2V0LnByb3RvdHlwZS5yZW1vdmVFdmVudExpc3RlbmVyPWZ1bmN0aW9uKGEsYixjKXtpZighKGEgaW4gdGhpcy5fX2V2ZW50cykpcmV0dXJuO3ZhciBkPXRoaXMuX19ldmVudHNbYV07Zm9yKHZhciBlPWQubGVuZ3RoLTE7ZT49MDstLWUpaWYoZFtlXT09PWIpe2Quc3BsaWNlKGUsMSk7YnJlYWt9fSxXZWJTb2NrZXQucHJvdG90eXBlLmRpc3BhdGNoRXZlbnQ9ZnVuY3Rpb24oYSl7dmFyIGI9dGhpcy5fX2V2ZW50c1thLnR5cGVdfHxbXTtmb3IodmFyIGM9MDtjPGIubGVuZ3RoOysrYyliW2NdKGEpO3ZhciBkPXRoaXNbXCJvblwiK2EudHlwZV07ZCYmZChhKX0sV2ViU29ja2V0LnByb3RvdHlwZS5fX2hhbmRsZUV2ZW50PWZ1bmN0aW9uKGEpe1wicmVhZHlTdGF0ZVwiaW4gYSYmKHRoaXMucmVhZHlTdGF0ZT1hLnJlYWR5U3RhdGUpLFwicHJvdG9jb2xcImluIGEmJih0aGlzLnByb3RvY29sPWEucHJvdG9jb2wpO3ZhciBiO2lmKGEudHlwZT09XCJvcGVuXCJ8fGEudHlwZT09XCJlcnJvclwiKWI9dGhpcy5fX2NyZWF0ZVNpbXBsZUV2ZW50KGEudHlwZSk7ZWxzZSBpZihhLnR5cGU9PVwiY2xvc2VcIiliPXRoaXMuX19jcmVhdGVTaW1wbGVFdmVudChcImNsb3NlXCIpO2Vsc2V7aWYoYS50eXBlIT1cIm1lc3NhZ2VcIil0aHJvd1widW5rbm93biBldmVudCB0eXBlOiBcIithLnR5cGU7dmFyIGM9ZGVjb2RlVVJJQ29tcG9uZW50KGEubWVzc2FnZSk7Yj10aGlzLl9fY3JlYXRlTWVzc2FnZUV2ZW50KFwibWVzc2FnZVwiLGMpfXRoaXMuZGlzcGF0Y2hFdmVudChiKX0sV2ViU29ja2V0LnByb3RvdHlwZS5fX2NyZWF0ZVNpbXBsZUV2ZW50PWZ1bmN0aW9uKGEpe2lmKGRvY3VtZW50LmNyZWF0ZUV2ZW50JiZ3aW5kb3cuRXZlbnQpe3ZhciBiPWRvY3VtZW50LmNyZWF0ZUV2ZW50KFwiRXZlbnRcIik7cmV0dXJuIGIuaW5pdEV2ZW50KGEsITEsITEpLGJ9cmV0dXJue3R5cGU6YSxidWJibGVzOiExLGNhbmNlbGFibGU6ITF9fSxXZWJTb2NrZXQucHJvdG90eXBlLl9fY3JlYXRlTWVzc2FnZUV2ZW50PWZ1bmN0aW9uKGEsYil7aWYoZG9jdW1lbnQuY3JlYXRlRXZlbnQmJndpbmRvdy5NZXNzYWdlRXZlbnQmJiF3aW5kb3cub3BlcmEpe3ZhciBjPWRvY3VtZW50LmNyZWF0ZUV2ZW50KFwiTWVzc2FnZUV2ZW50XCIpO3JldHVybiBjLmluaXRNZXNzYWdlRXZlbnQoXCJtZXNzYWdlXCIsITEsITEsYixudWxsLG51bGwsd2luZG93LG51bGwpLGN9cmV0dXJue3R5cGU6YSxkYXRhOmIsYnViYmxlczohMSxjYW5jZWxhYmxlOiExfX0sV2ViU29ja2V0LkNPTk5FQ1RJTkc9MCxXZWJTb2NrZXQuT1BFTj0xLFdlYlNvY2tldC5DTE9TSU5HPTIsV2ViU29ja2V0LkNMT1NFRD0zLFdlYlNvY2tldC5fX2ZsYXNoPW51bGwsV2ViU29ja2V0Ll9faW5zdGFuY2VzPXt9LFdlYlNvY2tldC5fX3Rhc2tzPVtdLFdlYlNvY2tldC5fX25leHRJZD0wLFdlYlNvY2tldC5sb2FkRmxhc2hQb2xpY3lGaWxlPWZ1bmN0aW9uKGEpe1dlYlNvY2tldC5fX2FkZFRhc2soZnVuY3Rpb24oKXtXZWJTb2NrZXQuX19mbGFzaC5sb2FkTWFudWFsUG9saWN5RmlsZShhKX0pfSxXZWJTb2NrZXQuX19pbml0aWFsaXplPWZ1bmN0aW9uKCl7aWYoV2ViU29ja2V0Ll9fZmxhc2gpcmV0dXJuO1dlYlNvY2tldC5fX3N3ZkxvY2F0aW9uJiYod2luZG93LldFQl9TT0NLRVRfU1dGX0xPQ0FUSU9OPVdlYlNvY2tldC5fX3N3ZkxvY2F0aW9uKTtpZighd2luZG93LldFQl9TT0NLRVRfU1dGX0xPQ0FUSU9OKXthLmVycm9yKFwiW1dlYlNvY2tldF0gc2V0IFdFQl9TT0NLRVRfU1dGX0xPQ0FUSU9OIHRvIGxvY2F0aW9uIG9mIFdlYlNvY2tldE1haW4uc3dmXCIpO3JldHVybn12YXIgYj1kb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO2IuaWQ9XCJ3ZWJTb2NrZXRDb250YWluZXJcIixiLnN0eWxlLnBvc2l0aW9uPVwiYWJzb2x1dGVcIixXZWJTb2NrZXQuX19pc0ZsYXNoTGl0ZSgpPyhiLnN0eWxlLmxlZnQ9XCIwcHhcIixiLnN0eWxlLnRvcD1cIjBweFwiKTooYi5zdHlsZS5sZWZ0PVwiLTEwMHB4XCIsYi5zdHlsZS50b3A9XCItMTAwcHhcIik7dmFyIGM9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtjLmlkPVwid2ViU29ja2V0Rmxhc2hcIixiLmFwcGVuZENoaWxkKGMpLGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYiksc3dmb2JqZWN0LmVtYmVkU1dGKFdFQl9TT0NLRVRfU1dGX0xPQ0FUSU9OLFwid2ViU29ja2V0Rmxhc2hcIixcIjFcIixcIjFcIixcIjEwLjAuMFwiLG51bGwsbnVsbCx7aGFzUHJpb3JpdHk6ITAsc3dsaXZlY29ubmVjdDohMCxhbGxvd1NjcmlwdEFjY2VzczpcImFsd2F5c1wifSxudWxsLGZ1bmN0aW9uKGIpe2Iuc3VjY2Vzc3x8YS5lcnJvcihcIltXZWJTb2NrZXRdIHN3Zm9iamVjdC5lbWJlZFNXRiBmYWlsZWRcIil9KX0sV2ViU29ja2V0Ll9fb25GbGFzaEluaXRpYWxpemVkPWZ1bmN0aW9uKCl7c2V0VGltZW91dChmdW5jdGlvbigpe1dlYlNvY2tldC5fX2ZsYXNoPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwid2ViU29ja2V0Rmxhc2hcIiksV2ViU29ja2V0Ll9fZmxhc2guc2V0Q2FsbGVyVXJsKGxvY2F0aW9uLmhyZWYpLFdlYlNvY2tldC5fX2ZsYXNoLnNldERlYnVnKCEhd2luZG93LldFQl9TT0NLRVRfREVCVUcpO2Zvcih2YXIgYT0wO2E8V2ViU29ja2V0Ll9fdGFza3MubGVuZ3RoOysrYSlXZWJTb2NrZXQuX190YXNrc1thXSgpO1dlYlNvY2tldC5fX3Rhc2tzPVtdfSwwKX0sV2ViU29ja2V0Ll9fb25GbGFzaEV2ZW50PWZ1bmN0aW9uKCl7cmV0dXJuIHNldFRpbWVvdXQoZnVuY3Rpb24oKXt0cnl7dmFyIGI9V2ViU29ja2V0Ll9fZmxhc2gucmVjZWl2ZUV2ZW50cygpO2Zvcih2YXIgYz0wO2M8Yi5sZW5ndGg7KytjKVdlYlNvY2tldC5fX2luc3RhbmNlc1tiW2NdLndlYlNvY2tldElkXS5fX2hhbmRsZUV2ZW50KGJbY10pfWNhdGNoKGQpe2EuZXJyb3IoZCl9fSwwKSwhMH0sV2ViU29ja2V0Ll9fbG9nPWZ1bmN0aW9uKGIpe2EubG9nKGRlY29kZVVSSUNvbXBvbmVudChiKSl9LFdlYlNvY2tldC5fX2Vycm9yPWZ1bmN0aW9uKGIpe2EuZXJyb3IoZGVjb2RlVVJJQ29tcG9uZW50KGIpKX0sV2ViU29ja2V0Ll9fYWRkVGFzaz1mdW5jdGlvbihhKXtXZWJTb2NrZXQuX19mbGFzaD9hKCk6V2ViU29ja2V0Ll9fdGFza3MucHVzaChhKX0sV2ViU29ja2V0Ll9faXNGbGFzaExpdGU9ZnVuY3Rpb24oKXtpZighd2luZG93Lm5hdmlnYXRvcnx8IXdpbmRvdy5uYXZpZ2F0b3IubWltZVR5cGVzKXJldHVybiExO3ZhciBhPXdpbmRvdy5uYXZpZ2F0b3IubWltZVR5cGVzW1wiYXBwbGljYXRpb24veC1zaG9ja3dhdmUtZmxhc2hcIl07cmV0dXJuIWF8fCFhLmVuYWJsZWRQbHVnaW58fCFhLmVuYWJsZWRQbHVnaW4uZmlsZW5hbWU/ITE6YS5lbmFibGVkUGx1Z2luLmZpbGVuYW1lLm1hdGNoKC9mbGFzaGxpdGUvaSk/ITA6ITF9LHdpbmRvdy5XRUJfU09DS0VUX0RJU0FCTEVfQVVUT19JTklUSUFMSVpBVElPTnx8KHdpbmRvdy5hZGRFdmVudExpc3RlbmVyP3dpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwibG9hZFwiLGZ1bmN0aW9uKCl7V2ViU29ja2V0Ll9faW5pdGlhbGl6ZSgpfSwhMSk6d2luZG93LmF0dGFjaEV2ZW50KFwib25sb2FkXCIsZnVuY3Rpb24oKXtXZWJTb2NrZXQuX19pbml0aWFsaXplKCl9KSl9KSgpLGZ1bmN0aW9uKGEsYixjKXtmdW5jdGlvbiBkKGEpe2lmKCFhKXJldHVybjtiLlRyYW5zcG9ydC5hcHBseSh0aGlzLGFyZ3VtZW50cyksdGhpcy5zZW5kQnVmZmVyPVtdfWZ1bmN0aW9uIGUoKXt9YS5YSFI9ZCxiLnV0aWwuaW5oZXJpdChkLGIuVHJhbnNwb3J0KSxkLnByb3RvdHlwZS5vcGVuPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuc29ja2V0LnNldEJ1ZmZlcighMSksdGhpcy5vbk9wZW4oKSx0aGlzLmdldCgpLHRoaXMuc2V0Q2xvc2VUaW1lb3V0KCksdGhpc30sZC5wcm90b3R5cGUucGF5bG9hZD1mdW5jdGlvbihhKXt2YXIgYz1bXTtmb3IodmFyIGQ9MCxlPWEubGVuZ3RoO2Q8ZTtkKyspYy5wdXNoKGIucGFyc2VyLmVuY29kZVBhY2tldChhW2RdKSk7dGhpcy5zZW5kKGIucGFyc2VyLmVuY29kZVBheWxvYWQoYykpfSxkLnByb3RvdHlwZS5zZW5kPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLnBvc3QoYSksdGhpc30sZC5wcm90b3R5cGUucG9zdD1mdW5jdGlvbihhKXtmdW5jdGlvbiBkKCl7dGhpcy5yZWFkeVN0YXRlPT00JiYodGhpcy5vbnJlYWR5c3RhdGVjaGFuZ2U9ZSxiLnBvc3Rpbmc9ITEsdGhpcy5zdGF0dXM9PTIwMD9iLnNvY2tldC5zZXRCdWZmZXIoITEpOmIub25DbG9zZSgpKX1mdW5jdGlvbiBmKCl7dGhpcy5vbmxvYWQ9ZSxiLnNvY2tldC5zZXRCdWZmZXIoITEpfXZhciBiPXRoaXM7dGhpcy5zb2NrZXQuc2V0QnVmZmVyKCEwKSx0aGlzLnNlbmRYSFI9dGhpcy5yZXF1ZXN0KFwiUE9TVFwiKSxjLlhEb21haW5SZXF1ZXN0JiZ0aGlzLnNlbmRYSFIgaW5zdGFuY2VvZiBYRG9tYWluUmVxdWVzdD90aGlzLnNlbmRYSFIub25sb2FkPXRoaXMuc2VuZFhIUi5vbmVycm9yPWY6dGhpcy5zZW5kWEhSLm9ucmVhZHlzdGF0ZWNoYW5nZT1kLHRoaXMuc2VuZFhIUi5zZW5kKGEpfSxkLnByb3RvdHlwZS5jbG9zZT1mdW5jdGlvbigpe3JldHVybiB0aGlzLm9uQ2xvc2UoKSx0aGlzfSxkLnByb3RvdHlwZS5yZXF1ZXN0PWZ1bmN0aW9uKGEpe3ZhciBjPWIudXRpbC5yZXF1ZXN0KHRoaXMuc29ja2V0LmlzWERvbWFpbigpKSxkPWIudXRpbC5xdWVyeSh0aGlzLnNvY2tldC5vcHRpb25zLnF1ZXJ5LFwidD1cIisgKyhuZXcgRGF0ZSkpO2Mub3BlbihhfHxcIkdFVFwiLHRoaXMucHJlcGFyZVVybCgpK2QsITApO2lmKGE9PVwiUE9TVFwiKXRyeXtjLnNldFJlcXVlc3RIZWFkZXI/Yy5zZXRSZXF1ZXN0SGVhZGVyKFwiQ29udGVudC10eXBlXCIsXCJ0ZXh0L3BsYWluO2NoYXJzZXQ9VVRGLThcIik6Yy5jb250ZW50VHlwZT1cInRleHQvcGxhaW5cIn1jYXRjaChlKXt9cmV0dXJuIGN9LGQucHJvdG90eXBlLnNjaGVtZT1mdW5jdGlvbigpe3JldHVybiB0aGlzLnNvY2tldC5vcHRpb25zLnNlY3VyZT9cImh0dHBzXCI6XCJodHRwXCJ9LGQuY2hlY2s9ZnVuY3Rpb24oYSxkKXt0cnl7dmFyIGU9Yi51dGlsLnJlcXVlc3QoZCksZj1jLlhEb21haW5SZXF1ZXN0JiZlIGluc3RhbmNlb2YgWERvbWFpblJlcXVlc3QsZz1hJiZhLm9wdGlvbnMmJmEub3B0aW9ucy5zZWN1cmU/XCJodHRwczpcIjpcImh0dHA6XCIsaD1jLmxvY2F0aW9uJiZnIT1jLmxvY2F0aW9uLnByb3RvY29sO2lmKGUmJighZnx8IWgpKXJldHVybiEwfWNhdGNoKGkpe31yZXR1cm4hMX0sZC54ZG9tYWluQ2hlY2s9ZnVuY3Rpb24oYSl7cmV0dXJuIGQuY2hlY2soYSwhMCl9fShcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW8uVHJhbnNwb3J0Om1vZHVsZS5leHBvcnRzLFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pbzptb2R1bGUucGFyZW50LmV4cG9ydHMsdGhpcyksZnVuY3Rpb24oYSxiKXtmdW5jdGlvbiBjKGEpe2IuVHJhbnNwb3J0LlhIUi5hcHBseSh0aGlzLGFyZ3VtZW50cyl9YS5odG1sZmlsZT1jLGIudXRpbC5pbmhlcml0KGMsYi5UcmFuc3BvcnQuWEhSKSxjLnByb3RvdHlwZS5uYW1lPVwiaHRtbGZpbGVcIixjLnByb3RvdHlwZS5nZXQ9ZnVuY3Rpb24oKXt0aGlzLmRvYz1uZXcod2luZG93W1tcIkFjdGl2ZVwiXS5jb25jYXQoXCJPYmplY3RcIikuam9pbihcIlhcIildKShcImh0bWxmaWxlXCIpLHRoaXMuZG9jLm9wZW4oKSx0aGlzLmRvYy53cml0ZShcIjxodG1sPjwvaHRtbD5cIiksdGhpcy5kb2MuY2xvc2UoKSx0aGlzLmRvYy5wYXJlbnRXaW5kb3cucz10aGlzO3ZhciBhPXRoaXMuZG9jLmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7YS5jbGFzc05hbWU9XCJzb2NrZXRpb1wiLHRoaXMuZG9jLmJvZHkuYXBwZW5kQ2hpbGQoYSksdGhpcy5pZnJhbWU9dGhpcy5kb2MuY3JlYXRlRWxlbWVudChcImlmcmFtZVwiKSxhLmFwcGVuZENoaWxkKHRoaXMuaWZyYW1lKTt2YXIgYz10aGlzLGQ9Yi51dGlsLnF1ZXJ5KHRoaXMuc29ja2V0Lm9wdGlvbnMucXVlcnksXCJ0PVwiKyArKG5ldyBEYXRlKSk7dGhpcy5pZnJhbWUuc3JjPXRoaXMucHJlcGFyZVVybCgpK2QsYi51dGlsLm9uKHdpbmRvdyxcInVubG9hZFwiLGZ1bmN0aW9uKCl7Yy5kZXN0cm95KCl9KX0sYy5wcm90b3R5cGUuXz1mdW5jdGlvbihhLGIpe3RoaXMub25EYXRhKGEpO3RyeXt2YXIgYz1iLmdldEVsZW1lbnRzQnlUYWdOYW1lKFwic2NyaXB0XCIpWzBdO2MucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChjKX1jYXRjaChkKXt9fSxjLnByb3RvdHlwZS5kZXN0cm95PWZ1bmN0aW9uKCl7aWYodGhpcy5pZnJhbWUpe3RyeXt0aGlzLmlmcmFtZS5zcmM9XCJhYm91dDpibGFua1wifWNhdGNoKGEpe310aGlzLmRvYz1udWxsLHRoaXMuaWZyYW1lLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5pZnJhbWUpLHRoaXMuaWZyYW1lPW51bGwsQ29sbGVjdEdhcmJhZ2UoKX19LGMucHJvdG90eXBlLmNsb3NlPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuZGVzdHJveSgpLGIuVHJhbnNwb3J0LlhIUi5wcm90b3R5cGUuY2xvc2UuY2FsbCh0aGlzKX0sYy5jaGVjaz1mdW5jdGlvbihhKXtpZih0eXBlb2Ygd2luZG93IT1cInVuZGVmaW5lZFwiJiZbXCJBY3RpdmVcIl0uY29uY2F0KFwiT2JqZWN0XCIpLmpvaW4oXCJYXCIpaW4gd2luZG93KXRyeXt2YXIgYz1uZXcod2luZG93W1tcIkFjdGl2ZVwiXS5jb25jYXQoXCJPYmplY3RcIikuam9pbihcIlhcIildKShcImh0bWxmaWxlXCIpO3JldHVybiBjJiZiLlRyYW5zcG9ydC5YSFIuY2hlY2soYSl9Y2F0Y2goZCl7fXJldHVybiExfSxjLnhkb21haW5DaGVjaz1mdW5jdGlvbigpe3JldHVybiExfSxiLnRyYW5zcG9ydHMucHVzaChcImh0bWxmaWxlXCIpfShcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW8uVHJhbnNwb3J0Om1vZHVsZS5leHBvcnRzLFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pbzptb2R1bGUucGFyZW50LmV4cG9ydHMpLGZ1bmN0aW9uKGEsYixjKXtmdW5jdGlvbiBkKCl7Yi5UcmFuc3BvcnQuWEhSLmFwcGx5KHRoaXMsYXJndW1lbnRzKX1mdW5jdGlvbiBlKCl7fWFbXCJ4aHItcG9sbGluZ1wiXT1kLGIudXRpbC5pbmhlcml0KGQsYi5UcmFuc3BvcnQuWEhSKSxiLnV0aWwubWVyZ2UoZCxiLlRyYW5zcG9ydC5YSFIpLGQucHJvdG90eXBlLm5hbWU9XCJ4aHItcG9sbGluZ1wiLGQucHJvdG90eXBlLmhlYXJ0YmVhdHM9ZnVuY3Rpb24oKXtyZXR1cm4hMX0sZC5wcm90b3R5cGUub3Blbj1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIGIuVHJhbnNwb3J0LlhIUi5wcm90b3R5cGUub3Blbi5jYWxsKGEpLCExfSxkLnByb3RvdHlwZS5nZXQ9ZnVuY3Rpb24oKXtmdW5jdGlvbiBiKCl7dGhpcy5yZWFkeVN0YXRlPT00JiYodGhpcy5vbnJlYWR5c3RhdGVjaGFuZ2U9ZSx0aGlzLnN0YXR1cz09MjAwPyhhLm9uRGF0YSh0aGlzLnJlc3BvbnNlVGV4dCksYS5nZXQoKSk6YS5vbkNsb3NlKCkpfWZ1bmN0aW9uIGQoKXt0aGlzLm9ubG9hZD1lLHRoaXMub25lcnJvcj1lLGEucmV0cnlDb3VudGVyPTEsYS5vbkRhdGEodGhpcy5yZXNwb25zZVRleHQpLGEuZ2V0KCl9ZnVuY3Rpb24gZigpe2EucmV0cnlDb3VudGVyKyssIWEucmV0cnlDb3VudGVyfHxhLnJldHJ5Q291bnRlcj4zP2Eub25DbG9zZSgpOmEuZ2V0KCl9aWYoIXRoaXMuaXNPcGVuKXJldHVybjt2YXIgYT10aGlzO3RoaXMueGhyPXRoaXMucmVxdWVzdCgpLGMuWERvbWFpblJlcXVlc3QmJnRoaXMueGhyIGluc3RhbmNlb2YgWERvbWFpblJlcXVlc3Q/KHRoaXMueGhyLm9ubG9hZD1kLHRoaXMueGhyLm9uZXJyb3I9Zik6dGhpcy54aHIub25yZWFkeXN0YXRlY2hhbmdlPWIsdGhpcy54aHIuc2VuZChudWxsKX0sZC5wcm90b3R5cGUub25DbG9zZT1mdW5jdGlvbigpe2IuVHJhbnNwb3J0LlhIUi5wcm90b3R5cGUub25DbG9zZS5jYWxsKHRoaXMpO2lmKHRoaXMueGhyKXt0aGlzLnhoci5vbnJlYWR5c3RhdGVjaGFuZ2U9dGhpcy54aHIub25sb2FkPXRoaXMueGhyLm9uZXJyb3I9ZTt0cnl7dGhpcy54aHIuYWJvcnQoKX1jYXRjaChhKXt9dGhpcy54aHI9bnVsbH19LGQucHJvdG90eXBlLnJlYWR5PWZ1bmN0aW9uKGEsYyl7dmFyIGQ9dGhpcztiLnV0aWwuZGVmZXIoZnVuY3Rpb24oKXtjLmNhbGwoZCl9KX0sYi50cmFuc3BvcnRzLnB1c2goXCJ4aHItcG9sbGluZ1wiKX0oXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvLlRyYW5zcG9ydDptb2R1bGUuZXhwb3J0cyxcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW86bW9kdWxlLnBhcmVudC5leHBvcnRzLHRoaXMpLGZ1bmN0aW9uKGEsYixjKXtmdW5jdGlvbiBlKGEpe2IuVHJhbnNwb3J0W1wieGhyLXBvbGxpbmdcIl0uYXBwbHkodGhpcyxhcmd1bWVudHMpLHRoaXMuaW5kZXg9Yi5qLmxlbmd0aDt2YXIgYz10aGlzO2Iuai5wdXNoKGZ1bmN0aW9uKGEpe2MuXyhhKX0pfXZhciBkPWMuZG9jdW1lbnQmJlwiTW96QXBwZWFyYW5jZVwiaW4gYy5kb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGU7YVtcImpzb25wLXBvbGxpbmdcIl09ZSxiLnV0aWwuaW5oZXJpdChlLGIuVHJhbnNwb3J0W1wieGhyLXBvbGxpbmdcIl0pLGUucHJvdG90eXBlLm5hbWU9XCJqc29ucC1wb2xsaW5nXCIsZS5wcm90b3R5cGUucG9zdD1mdW5jdGlvbihhKXtmdW5jdGlvbiBpKCl7aigpLGMuc29ja2V0LnNldEJ1ZmZlcighMSl9ZnVuY3Rpb24gaigpe2MuaWZyYW1lJiZjLmZvcm0ucmVtb3ZlQ2hpbGQoYy5pZnJhbWUpO3RyeXtoPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJzxpZnJhbWUgbmFtZT1cIicrYy5pZnJhbWVJZCsnXCI+Jyl9Y2F0Y2goYSl7aD1kb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaWZyYW1lXCIpLGgubmFtZT1jLmlmcmFtZUlkfWguaWQ9Yy5pZnJhbWVJZCxjLmZvcm0uYXBwZW5kQ2hpbGQoaCksYy5pZnJhbWU9aH12YXIgYz10aGlzLGQ9Yi51dGlsLnF1ZXJ5KHRoaXMuc29ja2V0Lm9wdGlvbnMucXVlcnksXCJ0PVwiKyArKG5ldyBEYXRlKStcIiZpPVwiK3RoaXMuaW5kZXgpO2lmKCF0aGlzLmZvcm0pe3ZhciBlPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJmb3JtXCIpLGY9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRleHRhcmVhXCIpLGc9dGhpcy5pZnJhbWVJZD1cInNvY2tldGlvX2lmcmFtZV9cIit0aGlzLmluZGV4LGg7ZS5jbGFzc05hbWU9XCJzb2NrZXRpb1wiLGUuc3R5bGUucG9zaXRpb249XCJhYnNvbHV0ZVwiLGUuc3R5bGUudG9wPVwiMHB4XCIsZS5zdHlsZS5sZWZ0PVwiMHB4XCIsZS5zdHlsZS5kaXNwbGF5PVwibm9uZVwiLGUudGFyZ2V0PWcsZS5tZXRob2Q9XCJQT1NUXCIsZS5zZXRBdHRyaWJ1dGUoXCJhY2NlcHQtY2hhcnNldFwiLFwidXRmLThcIiksZi5uYW1lPVwiZFwiLGUuYXBwZW5kQ2hpbGQoZiksZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlKSx0aGlzLmZvcm09ZSx0aGlzLmFyZWE9Zn10aGlzLmZvcm0uYWN0aW9uPXRoaXMucHJlcGFyZVVybCgpK2QsaigpLHRoaXMuYXJlYS52YWx1ZT1iLkpTT04uc3RyaW5naWZ5KGEpO3RyeXt0aGlzLmZvcm0uc3VibWl0KCl9Y2F0Y2goayl7fXRoaXMuaWZyYW1lLmF0dGFjaEV2ZW50P2gub25yZWFkeXN0YXRlY2hhbmdlPWZ1bmN0aW9uKCl7Yy5pZnJhbWUucmVhZHlTdGF0ZT09XCJjb21wbGV0ZVwiJiZpKCl9OnRoaXMuaWZyYW1lLm9ubG9hZD1pLHRoaXMuc29ja2V0LnNldEJ1ZmZlcighMCl9LGUucHJvdG90eXBlLmdldD1mdW5jdGlvbigpe3ZhciBhPXRoaXMsYz1kb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2NyaXB0XCIpLGU9Yi51dGlsLnF1ZXJ5KHRoaXMuc29ja2V0Lm9wdGlvbnMucXVlcnksXCJ0PVwiKyArKG5ldyBEYXRlKStcIiZpPVwiK3RoaXMuaW5kZXgpO3RoaXMuc2NyaXB0JiYodGhpcy5zY3JpcHQucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLnNjcmlwdCksdGhpcy5zY3JpcHQ9bnVsbCksYy5hc3luYz0hMCxjLnNyYz10aGlzLnByZXBhcmVVcmwoKStlLGMub25lcnJvcj1mdW5jdGlvbigpe2Eub25DbG9zZSgpfTt2YXIgZj1kb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcInNjcmlwdFwiKVswXTtmLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGMsZiksdGhpcy5zY3JpcHQ9YyxkJiZzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7dmFyIGE9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlmcmFtZVwiKTtkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGEpLGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQoYSl9LDEwMCl9LGUucHJvdG90eXBlLl89ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMub25EYXRhKGEpLHRoaXMuaXNPcGVuJiZ0aGlzLmdldCgpLHRoaXN9LGUucHJvdG90eXBlLnJlYWR5PWZ1bmN0aW9uKGEsYyl7dmFyIGU9dGhpcztpZighZClyZXR1cm4gYy5jYWxsKHRoaXMpO2IudXRpbC5sb2FkKGZ1bmN0aW9uKCl7Yy5jYWxsKGUpfSl9LGUuY2hlY2s9ZnVuY3Rpb24oKXtyZXR1cm5cImRvY3VtZW50XCJpbiBjfSxlLnhkb21haW5DaGVjaz1mdW5jdGlvbigpe3JldHVybiEwfSxiLnRyYW5zcG9ydHMucHVzaChcImpzb25wLXBvbGxpbmdcIil9KFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pby5UcmFuc3BvcnQ6bW9kdWxlLmV4cG9ydHMsXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvOm1vZHVsZS5wYXJlbnQuZXhwb3J0cyx0aGlzKSx0eXBlb2YgZGVmaW5lPT1cImZ1bmN0aW9uXCImJmRlZmluZS5hbWQmJmRlZmluZShbXSxmdW5jdGlvbigpe3JldHVybiBpb30pfSkoKSIsIihmdW5jdGlvbigpeyhmdW5jdGlvbigpe3ZhciBuPXRoaXMsdD1uLl8scj17fSxlPUFycmF5LnByb3RvdHlwZSx1PU9iamVjdC5wcm90b3R5cGUsaT1GdW5jdGlvbi5wcm90b3R5cGUsYT1lLnB1c2gsbz1lLnNsaWNlLGM9ZS5jb25jYXQsbD11LnRvU3RyaW5nLGY9dS5oYXNPd25Qcm9wZXJ0eSxzPWUuZm9yRWFjaCxwPWUubWFwLGg9ZS5yZWR1Y2Usdj1lLnJlZHVjZVJpZ2h0LGQ9ZS5maWx0ZXIsZz1lLmV2ZXJ5LG09ZS5zb21lLHk9ZS5pbmRleE9mLGI9ZS5sYXN0SW5kZXhPZix4PUFycmF5LmlzQXJyYXksXz1PYmplY3Qua2V5cyxqPWkuYmluZCx3PWZ1bmN0aW9uKG4pe3JldHVybiBuIGluc3RhbmNlb2Ygdz9uOnRoaXMgaW5zdGFuY2VvZiB3Pyh0aGlzLl93cmFwcGVkPW4sdm9pZCAwKTpuZXcgdyhuKX07XCJ1bmRlZmluZWRcIiE9dHlwZW9mIGV4cG9ydHM/KFwidW5kZWZpbmVkXCIhPXR5cGVvZiBtb2R1bGUmJm1vZHVsZS5leHBvcnRzJiYoZXhwb3J0cz1tb2R1bGUuZXhwb3J0cz13KSxleHBvcnRzLl89dyk6bi5fPXcsdy5WRVJTSU9OPVwiMS40LjRcIjt2YXIgQT13LmVhY2g9dy5mb3JFYWNoPWZ1bmN0aW9uKG4sdCxlKXtpZihudWxsIT1uKWlmKHMmJm4uZm9yRWFjaD09PXMpbi5mb3JFYWNoKHQsZSk7ZWxzZSBpZihuLmxlbmd0aD09PStuLmxlbmd0aCl7Zm9yKHZhciB1PTAsaT1uLmxlbmd0aDtpPnU7dSsrKWlmKHQuY2FsbChlLG5bdV0sdSxuKT09PXIpcmV0dXJufWVsc2UgZm9yKHZhciBhIGluIG4paWYody5oYXMobixhKSYmdC5jYWxsKGUsblthXSxhLG4pPT09cilyZXR1cm59O3cubWFwPXcuY29sbGVjdD1mdW5jdGlvbihuLHQscil7dmFyIGU9W107cmV0dXJuIG51bGw9PW4/ZTpwJiZuLm1hcD09PXA/bi5tYXAodCxyKTooQShuLGZ1bmN0aW9uKG4sdSxpKXtlW2UubGVuZ3RoXT10LmNhbGwocixuLHUsaSl9KSxlKX07dmFyIE89XCJSZWR1Y2Ugb2YgZW1wdHkgYXJyYXkgd2l0aCBubyBpbml0aWFsIHZhbHVlXCI7dy5yZWR1Y2U9dy5mb2xkbD13LmluamVjdD1mdW5jdGlvbihuLHQscixlKXt2YXIgdT1hcmd1bWVudHMubGVuZ3RoPjI7aWYobnVsbD09biYmKG49W10pLGgmJm4ucmVkdWNlPT09aClyZXR1cm4gZSYmKHQ9dy5iaW5kKHQsZSkpLHU/bi5yZWR1Y2UodCxyKTpuLnJlZHVjZSh0KTtpZihBKG4sZnVuY3Rpb24obixpLGEpe3U/cj10LmNhbGwoZSxyLG4saSxhKToocj1uLHU9ITApfSksIXUpdGhyb3cgbmV3IFR5cGVFcnJvcihPKTtyZXR1cm4gcn0sdy5yZWR1Y2VSaWdodD13LmZvbGRyPWZ1bmN0aW9uKG4sdCxyLGUpe3ZhciB1PWFyZ3VtZW50cy5sZW5ndGg+MjtpZihudWxsPT1uJiYobj1bXSksdiYmbi5yZWR1Y2VSaWdodD09PXYpcmV0dXJuIGUmJih0PXcuYmluZCh0LGUpKSx1P24ucmVkdWNlUmlnaHQodCxyKTpuLnJlZHVjZVJpZ2h0KHQpO3ZhciBpPW4ubGVuZ3RoO2lmKGkhPT0raSl7dmFyIGE9dy5rZXlzKG4pO2k9YS5sZW5ndGh9aWYoQShuLGZ1bmN0aW9uKG8sYyxsKXtjPWE/YVstLWldOi0taSx1P3I9dC5jYWxsKGUscixuW2NdLGMsbCk6KHI9bltjXSx1PSEwKX0pLCF1KXRocm93IG5ldyBUeXBlRXJyb3IoTyk7cmV0dXJuIHJ9LHcuZmluZD13LmRldGVjdD1mdW5jdGlvbihuLHQscil7dmFyIGU7cmV0dXJuIEUobixmdW5jdGlvbihuLHUsaSl7cmV0dXJuIHQuY2FsbChyLG4sdSxpKT8oZT1uLCEwKTp2b2lkIDB9KSxlfSx3LmZpbHRlcj13LnNlbGVjdD1mdW5jdGlvbihuLHQscil7dmFyIGU9W107cmV0dXJuIG51bGw9PW4/ZTpkJiZuLmZpbHRlcj09PWQ/bi5maWx0ZXIodCxyKTooQShuLGZ1bmN0aW9uKG4sdSxpKXt0LmNhbGwocixuLHUsaSkmJihlW2UubGVuZ3RoXT1uKX0pLGUpfSx3LnJlamVjdD1mdW5jdGlvbihuLHQscil7cmV0dXJuIHcuZmlsdGVyKG4sZnVuY3Rpb24obixlLHUpe3JldHVybiF0LmNhbGwocixuLGUsdSl9LHIpfSx3LmV2ZXJ5PXcuYWxsPWZ1bmN0aW9uKG4sdCxlKXt0fHwodD13LmlkZW50aXR5KTt2YXIgdT0hMDtyZXR1cm4gbnVsbD09bj91OmcmJm4uZXZlcnk9PT1nP24uZXZlcnkodCxlKTooQShuLGZ1bmN0aW9uKG4saSxhKXtyZXR1cm4odT11JiZ0LmNhbGwoZSxuLGksYSkpP3ZvaWQgMDpyfSksISF1KX07dmFyIEU9dy5zb21lPXcuYW55PWZ1bmN0aW9uKG4sdCxlKXt0fHwodD13LmlkZW50aXR5KTt2YXIgdT0hMTtyZXR1cm4gbnVsbD09bj91Om0mJm4uc29tZT09PW0/bi5zb21lKHQsZSk6KEEobixmdW5jdGlvbihuLGksYSl7cmV0dXJuIHV8fCh1PXQuY2FsbChlLG4saSxhKSk/cjp2b2lkIDB9KSwhIXUpfTt3LmNvbnRhaW5zPXcuaW5jbHVkZT1mdW5jdGlvbihuLHQpe3JldHVybiBudWxsPT1uPyExOnkmJm4uaW5kZXhPZj09PXk/bi5pbmRleE9mKHQpIT0tMTpFKG4sZnVuY3Rpb24obil7cmV0dXJuIG49PT10fSl9LHcuaW52b2tlPWZ1bmN0aW9uKG4sdCl7dmFyIHI9by5jYWxsKGFyZ3VtZW50cywyKSxlPXcuaXNGdW5jdGlvbih0KTtyZXR1cm4gdy5tYXAobixmdW5jdGlvbihuKXtyZXR1cm4oZT90Om5bdF0pLmFwcGx5KG4scil9KX0sdy5wbHVjaz1mdW5jdGlvbihuLHQpe3JldHVybiB3Lm1hcChuLGZ1bmN0aW9uKG4pe3JldHVybiBuW3RdfSl9LHcud2hlcmU9ZnVuY3Rpb24obix0LHIpe3JldHVybiB3LmlzRW1wdHkodCk/cj9udWxsOltdOndbcj9cImZpbmRcIjpcImZpbHRlclwiXShuLGZ1bmN0aW9uKG4pe2Zvcih2YXIgciBpbiB0KWlmKHRbcl0hPT1uW3JdKXJldHVybiExO3JldHVybiEwfSl9LHcuZmluZFdoZXJlPWZ1bmN0aW9uKG4sdCl7cmV0dXJuIHcud2hlcmUobix0LCEwKX0sdy5tYXg9ZnVuY3Rpb24obix0LHIpe2lmKCF0JiZ3LmlzQXJyYXkobikmJm5bMF09PT0rblswXSYmNjU1MzU+bi5sZW5ndGgpcmV0dXJuIE1hdGgubWF4LmFwcGx5KE1hdGgsbik7aWYoIXQmJncuaXNFbXB0eShuKSlyZXR1cm4tMS8wO3ZhciBlPXtjb21wdXRlZDotMS8wLHZhbHVlOi0xLzB9O3JldHVybiBBKG4sZnVuY3Rpb24obix1LGkpe3ZhciBhPXQ/dC5jYWxsKHIsbix1LGkpOm47YT49ZS5jb21wdXRlZCYmKGU9e3ZhbHVlOm4sY29tcHV0ZWQ6YX0pfSksZS52YWx1ZX0sdy5taW49ZnVuY3Rpb24obix0LHIpe2lmKCF0JiZ3LmlzQXJyYXkobikmJm5bMF09PT0rblswXSYmNjU1MzU+bi5sZW5ndGgpcmV0dXJuIE1hdGgubWluLmFwcGx5KE1hdGgsbik7aWYoIXQmJncuaXNFbXB0eShuKSlyZXR1cm4gMS8wO3ZhciBlPXtjb21wdXRlZDoxLzAsdmFsdWU6MS8wfTtyZXR1cm4gQShuLGZ1bmN0aW9uKG4sdSxpKXt2YXIgYT10P3QuY2FsbChyLG4sdSxpKTpuO2UuY29tcHV0ZWQ+YSYmKGU9e3ZhbHVlOm4sY29tcHV0ZWQ6YX0pfSksZS52YWx1ZX0sdy5zaHVmZmxlPWZ1bmN0aW9uKG4pe3ZhciB0LHI9MCxlPVtdO3JldHVybiBBKG4sZnVuY3Rpb24obil7dD13LnJhbmRvbShyKyspLGVbci0xXT1lW3RdLGVbdF09bn0pLGV9O3ZhciBrPWZ1bmN0aW9uKG4pe3JldHVybiB3LmlzRnVuY3Rpb24obik/bjpmdW5jdGlvbih0KXtyZXR1cm4gdFtuXX19O3cuc29ydEJ5PWZ1bmN0aW9uKG4sdCxyKXt2YXIgZT1rKHQpO3JldHVybiB3LnBsdWNrKHcubWFwKG4sZnVuY3Rpb24obix0LHUpe3JldHVybnt2YWx1ZTpuLGluZGV4OnQsY3JpdGVyaWE6ZS5jYWxsKHIsbix0LHUpfX0pLnNvcnQoZnVuY3Rpb24obix0KXt2YXIgcj1uLmNyaXRlcmlhLGU9dC5jcml0ZXJpYTtpZihyIT09ZSl7aWYocj5lfHxyPT09dm9pZCAwKXJldHVybiAxO2lmKGU+cnx8ZT09PXZvaWQgMClyZXR1cm4tMX1yZXR1cm4gbi5pbmRleDx0LmluZGV4Py0xOjF9KSxcInZhbHVlXCIpfTt2YXIgRj1mdW5jdGlvbihuLHQscixlKXt2YXIgdT17fSxpPWsodHx8dy5pZGVudGl0eSk7cmV0dXJuIEEobixmdW5jdGlvbih0LGEpe3ZhciBvPWkuY2FsbChyLHQsYSxuKTtlKHUsbyx0KX0pLHV9O3cuZ3JvdXBCeT1mdW5jdGlvbihuLHQscil7cmV0dXJuIEYobix0LHIsZnVuY3Rpb24obix0LHIpeyh3LmhhcyhuLHQpP25bdF06blt0XT1bXSkucHVzaChyKX0pfSx3LmNvdW50Qnk9ZnVuY3Rpb24obix0LHIpe3JldHVybiBGKG4sdCxyLGZ1bmN0aW9uKG4sdCl7dy5oYXMobix0KXx8KG5bdF09MCksblt0XSsrfSl9LHcuc29ydGVkSW5kZXg9ZnVuY3Rpb24obix0LHIsZSl7cj1udWxsPT1yP3cuaWRlbnRpdHk6ayhyKTtmb3IodmFyIHU9ci5jYWxsKGUsdCksaT0wLGE9bi5sZW5ndGg7YT5pOyl7dmFyIG89aSthPj4+MTt1PnIuY2FsbChlLG5bb10pP2k9bysxOmE9b31yZXR1cm4gaX0sdy50b0FycmF5PWZ1bmN0aW9uKG4pe3JldHVybiBuP3cuaXNBcnJheShuKT9vLmNhbGwobik6bi5sZW5ndGg9PT0rbi5sZW5ndGg/dy5tYXAobix3LmlkZW50aXR5KTp3LnZhbHVlcyhuKTpbXX0sdy5zaXplPWZ1bmN0aW9uKG4pe3JldHVybiBudWxsPT1uPzA6bi5sZW5ndGg9PT0rbi5sZW5ndGg/bi5sZW5ndGg6dy5rZXlzKG4pLmxlbmd0aH0sdy5maXJzdD13LmhlYWQ9dy50YWtlPWZ1bmN0aW9uKG4sdCxyKXtyZXR1cm4gbnVsbD09bj92b2lkIDA6bnVsbD09dHx8cj9uWzBdOm8uY2FsbChuLDAsdCl9LHcuaW5pdGlhbD1mdW5jdGlvbihuLHQscil7cmV0dXJuIG8uY2FsbChuLDAsbi5sZW5ndGgtKG51bGw9PXR8fHI/MTp0KSl9LHcubGFzdD1mdW5jdGlvbihuLHQscil7cmV0dXJuIG51bGw9PW4/dm9pZCAwOm51bGw9PXR8fHI/bltuLmxlbmd0aC0xXTpvLmNhbGwobixNYXRoLm1heChuLmxlbmd0aC10LDApKX0sdy5yZXN0PXcudGFpbD13LmRyb3A9ZnVuY3Rpb24obix0LHIpe3JldHVybiBvLmNhbGwobixudWxsPT10fHxyPzE6dCl9LHcuY29tcGFjdD1mdW5jdGlvbihuKXtyZXR1cm4gdy5maWx0ZXIobix3LmlkZW50aXR5KX07dmFyIFI9ZnVuY3Rpb24obix0LHIpe3JldHVybiBBKG4sZnVuY3Rpb24obil7dy5pc0FycmF5KG4pP3Q/YS5hcHBseShyLG4pOlIobix0LHIpOnIucHVzaChuKX0pLHJ9O3cuZmxhdHRlbj1mdW5jdGlvbihuLHQpe3JldHVybiBSKG4sdCxbXSl9LHcud2l0aG91dD1mdW5jdGlvbihuKXtyZXR1cm4gdy5kaWZmZXJlbmNlKG4sby5jYWxsKGFyZ3VtZW50cywxKSl9LHcudW5pcT13LnVuaXF1ZT1mdW5jdGlvbihuLHQscixlKXt3LmlzRnVuY3Rpb24odCkmJihlPXIscj10LHQ9ITEpO3ZhciB1PXI/dy5tYXAobixyLGUpOm4saT1bXSxhPVtdO3JldHVybiBBKHUsZnVuY3Rpb24ocixlKXsodD9lJiZhW2EubGVuZ3RoLTFdPT09cjp3LmNvbnRhaW5zKGEscikpfHwoYS5wdXNoKHIpLGkucHVzaChuW2VdKSl9KSxpfSx3LnVuaW9uPWZ1bmN0aW9uKCl7cmV0dXJuIHcudW5pcShjLmFwcGx5KGUsYXJndW1lbnRzKSl9LHcuaW50ZXJzZWN0aW9uPWZ1bmN0aW9uKG4pe3ZhciB0PW8uY2FsbChhcmd1bWVudHMsMSk7cmV0dXJuIHcuZmlsdGVyKHcudW5pcShuKSxmdW5jdGlvbihuKXtyZXR1cm4gdy5ldmVyeSh0LGZ1bmN0aW9uKHQpe3JldHVybiB3LmluZGV4T2YodCxuKT49MH0pfSl9LHcuZGlmZmVyZW5jZT1mdW5jdGlvbihuKXt2YXIgdD1jLmFwcGx5KGUsby5jYWxsKGFyZ3VtZW50cywxKSk7cmV0dXJuIHcuZmlsdGVyKG4sZnVuY3Rpb24obil7cmV0dXJuIXcuY29udGFpbnModCxuKX0pfSx3LnppcD1mdW5jdGlvbigpe2Zvcih2YXIgbj1vLmNhbGwoYXJndW1lbnRzKSx0PXcubWF4KHcucGx1Y2sobixcImxlbmd0aFwiKSkscj1BcnJheSh0KSxlPTA7dD5lO2UrKylyW2VdPXcucGx1Y2sobixcIlwiK2UpO3JldHVybiByfSx3Lm9iamVjdD1mdW5jdGlvbihuLHQpe2lmKG51bGw9PW4pcmV0dXJue307Zm9yKHZhciByPXt9LGU9MCx1PW4ubGVuZ3RoO3U+ZTtlKyspdD9yW25bZV1dPXRbZV06cltuW2VdWzBdXT1uW2VdWzFdO3JldHVybiByfSx3LmluZGV4T2Y9ZnVuY3Rpb24obix0LHIpe2lmKG51bGw9PW4pcmV0dXJuLTE7dmFyIGU9MCx1PW4ubGVuZ3RoO2lmKHIpe2lmKFwibnVtYmVyXCIhPXR5cGVvZiByKXJldHVybiBlPXcuc29ydGVkSW5kZXgobix0KSxuW2VdPT09dD9lOi0xO2U9MD5yP01hdGgubWF4KDAsdStyKTpyfWlmKHkmJm4uaW5kZXhPZj09PXkpcmV0dXJuIG4uaW5kZXhPZih0LHIpO2Zvcig7dT5lO2UrKylpZihuW2VdPT09dClyZXR1cm4gZTtyZXR1cm4tMX0sdy5sYXN0SW5kZXhPZj1mdW5jdGlvbihuLHQscil7aWYobnVsbD09bilyZXR1cm4tMTt2YXIgZT1udWxsIT1yO2lmKGImJm4ubGFzdEluZGV4T2Y9PT1iKXJldHVybiBlP24ubGFzdEluZGV4T2YodCxyKTpuLmxhc3RJbmRleE9mKHQpO2Zvcih2YXIgdT1lP3I6bi5sZW5ndGg7dS0tOylpZihuW3VdPT09dClyZXR1cm4gdTtyZXR1cm4tMX0sdy5yYW5nZT1mdW5jdGlvbihuLHQscil7MT49YXJndW1lbnRzLmxlbmd0aCYmKHQ9bnx8MCxuPTApLHI9YXJndW1lbnRzWzJdfHwxO2Zvcih2YXIgZT1NYXRoLm1heChNYXRoLmNlaWwoKHQtbikvciksMCksdT0wLGk9QXJyYXkoZSk7ZT51OylpW3UrK109bixuKz1yO3JldHVybiBpfSx3LmJpbmQ9ZnVuY3Rpb24obix0KXtpZihuLmJpbmQ9PT1qJiZqKXJldHVybiBqLmFwcGx5KG4sby5jYWxsKGFyZ3VtZW50cywxKSk7dmFyIHI9by5jYWxsKGFyZ3VtZW50cywyKTtyZXR1cm4gZnVuY3Rpb24oKXtyZXR1cm4gbi5hcHBseSh0LHIuY29uY2F0KG8uY2FsbChhcmd1bWVudHMpKSl9fSx3LnBhcnRpYWw9ZnVuY3Rpb24obil7dmFyIHQ9by5jYWxsKGFyZ3VtZW50cywxKTtyZXR1cm4gZnVuY3Rpb24oKXtyZXR1cm4gbi5hcHBseSh0aGlzLHQuY29uY2F0KG8uY2FsbChhcmd1bWVudHMpKSl9fSx3LmJpbmRBbGw9ZnVuY3Rpb24obil7dmFyIHQ9by5jYWxsKGFyZ3VtZW50cywxKTtyZXR1cm4gMD09PXQubGVuZ3RoJiYodD13LmZ1bmN0aW9ucyhuKSksQSh0LGZ1bmN0aW9uKHQpe25bdF09dy5iaW5kKG5bdF0sbil9KSxufSx3Lm1lbW9pemU9ZnVuY3Rpb24obix0KXt2YXIgcj17fTtyZXR1cm4gdHx8KHQ9dy5pZGVudGl0eSksZnVuY3Rpb24oKXt2YXIgZT10LmFwcGx5KHRoaXMsYXJndW1lbnRzKTtyZXR1cm4gdy5oYXMocixlKT9yW2VdOnJbZV09bi5hcHBseSh0aGlzLGFyZ3VtZW50cyl9fSx3LmRlbGF5PWZ1bmN0aW9uKG4sdCl7dmFyIHI9by5jYWxsKGFyZ3VtZW50cywyKTtyZXR1cm4gc2V0VGltZW91dChmdW5jdGlvbigpe3JldHVybiBuLmFwcGx5KG51bGwscil9LHQpfSx3LmRlZmVyPWZ1bmN0aW9uKG4pe3JldHVybiB3LmRlbGF5LmFwcGx5KHcsW24sMV0uY29uY2F0KG8uY2FsbChhcmd1bWVudHMsMSkpKX0sdy50aHJvdHRsZT1mdW5jdGlvbihuLHQpe3ZhciByLGUsdSxpLGE9MCxvPWZ1bmN0aW9uKCl7YT1uZXcgRGF0ZSx1PW51bGwsaT1uLmFwcGx5KHIsZSl9O3JldHVybiBmdW5jdGlvbigpe3ZhciBjPW5ldyBEYXRlLGw9dC0oYy1hKTtyZXR1cm4gcj10aGlzLGU9YXJndW1lbnRzLDA+PWw/KGNsZWFyVGltZW91dCh1KSx1PW51bGwsYT1jLGk9bi5hcHBseShyLGUpKTp1fHwodT1zZXRUaW1lb3V0KG8sbCkpLGl9fSx3LmRlYm91bmNlPWZ1bmN0aW9uKG4sdCxyKXt2YXIgZSx1O3JldHVybiBmdW5jdGlvbigpe3ZhciBpPXRoaXMsYT1hcmd1bWVudHMsbz1mdW5jdGlvbigpe2U9bnVsbCxyfHwodT1uLmFwcGx5KGksYSkpfSxjPXImJiFlO3JldHVybiBjbGVhclRpbWVvdXQoZSksZT1zZXRUaW1lb3V0KG8sdCksYyYmKHU9bi5hcHBseShpLGEpKSx1fX0sdy5vbmNlPWZ1bmN0aW9uKG4pe3ZhciB0LHI9ITE7cmV0dXJuIGZ1bmN0aW9uKCl7cmV0dXJuIHI/dDoocj0hMCx0PW4uYXBwbHkodGhpcyxhcmd1bWVudHMpLG49bnVsbCx0KX19LHcud3JhcD1mdW5jdGlvbihuLHQpe3JldHVybiBmdW5jdGlvbigpe3ZhciByPVtuXTtyZXR1cm4gYS5hcHBseShyLGFyZ3VtZW50cyksdC5hcHBseSh0aGlzLHIpfX0sdy5jb21wb3NlPWZ1bmN0aW9uKCl7dmFyIG49YXJndW1lbnRzO3JldHVybiBmdW5jdGlvbigpe2Zvcih2YXIgdD1hcmd1bWVudHMscj1uLmxlbmd0aC0xO3I+PTA7ci0tKXQ9W25bcl0uYXBwbHkodGhpcyx0KV07cmV0dXJuIHRbMF19fSx3LmFmdGVyPWZ1bmN0aW9uKG4sdCl7cmV0dXJuIDA+PW4/dCgpOmZ1bmN0aW9uKCl7cmV0dXJuIDE+LS1uP3QuYXBwbHkodGhpcyxhcmd1bWVudHMpOnZvaWQgMH19LHcua2V5cz1ffHxmdW5jdGlvbihuKXtpZihuIT09T2JqZWN0KG4pKXRocm93IG5ldyBUeXBlRXJyb3IoXCJJbnZhbGlkIG9iamVjdFwiKTt2YXIgdD1bXTtmb3IodmFyIHIgaW4gbil3LmhhcyhuLHIpJiYodFt0Lmxlbmd0aF09cik7cmV0dXJuIHR9LHcudmFsdWVzPWZ1bmN0aW9uKG4pe3ZhciB0PVtdO2Zvcih2YXIgciBpbiBuKXcuaGFzKG4scikmJnQucHVzaChuW3JdKTtyZXR1cm4gdH0sdy5wYWlycz1mdW5jdGlvbihuKXt2YXIgdD1bXTtmb3IodmFyIHIgaW4gbil3LmhhcyhuLHIpJiZ0LnB1c2goW3IsbltyXV0pO3JldHVybiB0fSx3LmludmVydD1mdW5jdGlvbihuKXt2YXIgdD17fTtmb3IodmFyIHIgaW4gbil3LmhhcyhuLHIpJiYodFtuW3JdXT1yKTtyZXR1cm4gdH0sdy5mdW5jdGlvbnM9dy5tZXRob2RzPWZ1bmN0aW9uKG4pe3ZhciB0PVtdO2Zvcih2YXIgciBpbiBuKXcuaXNGdW5jdGlvbihuW3JdKSYmdC5wdXNoKHIpO3JldHVybiB0LnNvcnQoKX0sdy5leHRlbmQ9ZnVuY3Rpb24obil7cmV0dXJuIEEoby5jYWxsKGFyZ3VtZW50cywxKSxmdW5jdGlvbih0KXtpZih0KWZvcih2YXIgciBpbiB0KW5bcl09dFtyXX0pLG59LHcucGljaz1mdW5jdGlvbihuKXt2YXIgdD17fSxyPWMuYXBwbHkoZSxvLmNhbGwoYXJndW1lbnRzLDEpKTtyZXR1cm4gQShyLGZ1bmN0aW9uKHIpe3IgaW4gbiYmKHRbcl09bltyXSl9KSx0fSx3Lm9taXQ9ZnVuY3Rpb24obil7dmFyIHQ9e30scj1jLmFwcGx5KGUsby5jYWxsKGFyZ3VtZW50cywxKSk7Zm9yKHZhciB1IGluIG4pdy5jb250YWlucyhyLHUpfHwodFt1XT1uW3VdKTtyZXR1cm4gdH0sdy5kZWZhdWx0cz1mdW5jdGlvbihuKXtyZXR1cm4gQShvLmNhbGwoYXJndW1lbnRzLDEpLGZ1bmN0aW9uKHQpe2lmKHQpZm9yKHZhciByIGluIHQpbnVsbD09bltyXSYmKG5bcl09dFtyXSl9KSxufSx3LmNsb25lPWZ1bmN0aW9uKG4pe3JldHVybiB3LmlzT2JqZWN0KG4pP3cuaXNBcnJheShuKT9uLnNsaWNlKCk6dy5leHRlbmQoe30sbik6bn0sdy50YXA9ZnVuY3Rpb24obix0KXtyZXR1cm4gdChuKSxufTt2YXIgST1mdW5jdGlvbihuLHQscixlKXtpZihuPT09dClyZXR1cm4gMCE9PW58fDEvbj09MS90O2lmKG51bGw9PW58fG51bGw9PXQpcmV0dXJuIG49PT10O24gaW5zdGFuY2VvZiB3JiYobj1uLl93cmFwcGVkKSx0IGluc3RhbmNlb2YgdyYmKHQ9dC5fd3JhcHBlZCk7dmFyIHU9bC5jYWxsKG4pO2lmKHUhPWwuY2FsbCh0KSlyZXR1cm4hMTtzd2l0Y2godSl7Y2FzZVwiW29iamVjdCBTdHJpbmddXCI6cmV0dXJuIG49PXQrXCJcIjtjYXNlXCJbb2JqZWN0IE51bWJlcl1cIjpyZXR1cm4gbiE9K24/dCE9K3Q6MD09bj8xL249PTEvdDpuPT0rdDtjYXNlXCJbb2JqZWN0IERhdGVdXCI6Y2FzZVwiW29iamVjdCBCb29sZWFuXVwiOnJldHVybituPT0rdDtjYXNlXCJbb2JqZWN0IFJlZ0V4cF1cIjpyZXR1cm4gbi5zb3VyY2U9PXQuc291cmNlJiZuLmdsb2JhbD09dC5nbG9iYWwmJm4ubXVsdGlsaW5lPT10Lm11bHRpbGluZSYmbi5pZ25vcmVDYXNlPT10Lmlnbm9yZUNhc2V9aWYoXCJvYmplY3RcIiE9dHlwZW9mIG58fFwib2JqZWN0XCIhPXR5cGVvZiB0KXJldHVybiExO2Zvcih2YXIgaT1yLmxlbmd0aDtpLS07KWlmKHJbaV09PW4pcmV0dXJuIGVbaV09PXQ7ci5wdXNoKG4pLGUucHVzaCh0KTt2YXIgYT0wLG89ITA7aWYoXCJbb2JqZWN0IEFycmF5XVwiPT11KXtpZihhPW4ubGVuZ3RoLG89YT09dC5sZW5ndGgpZm9yKDthLS0mJihvPUkoblthXSx0W2FdLHIsZSkpOyk7fWVsc2V7dmFyIGM9bi5jb25zdHJ1Y3RvcixmPXQuY29uc3RydWN0b3I7aWYoYyE9PWYmJiEody5pc0Z1bmN0aW9uKGMpJiZjIGluc3RhbmNlb2YgYyYmdy5pc0Z1bmN0aW9uKGYpJiZmIGluc3RhbmNlb2YgZikpcmV0dXJuITE7Zm9yKHZhciBzIGluIG4paWYody5oYXMobixzKSYmKGErKywhKG89dy5oYXModCxzKSYmSShuW3NdLHRbc10scixlKSkpKWJyZWFrO2lmKG8pe2ZvcihzIGluIHQpaWYody5oYXModCxzKSYmIWEtLSlicmVhaztvPSFhfX1yZXR1cm4gci5wb3AoKSxlLnBvcCgpLG99O3cuaXNFcXVhbD1mdW5jdGlvbihuLHQpe3JldHVybiBJKG4sdCxbXSxbXSl9LHcuaXNFbXB0eT1mdW5jdGlvbihuKXtpZihudWxsPT1uKXJldHVybiEwO2lmKHcuaXNBcnJheShuKXx8dy5pc1N0cmluZyhuKSlyZXR1cm4gMD09PW4ubGVuZ3RoO2Zvcih2YXIgdCBpbiBuKWlmKHcuaGFzKG4sdCkpcmV0dXJuITE7cmV0dXJuITB9LHcuaXNFbGVtZW50PWZ1bmN0aW9uKG4pe3JldHVybiEoIW58fDEhPT1uLm5vZGVUeXBlKX0sdy5pc0FycmF5PXh8fGZ1bmN0aW9uKG4pe3JldHVyblwiW29iamVjdCBBcnJheV1cIj09bC5jYWxsKG4pfSx3LmlzT2JqZWN0PWZ1bmN0aW9uKG4pe3JldHVybiBuPT09T2JqZWN0KG4pfSxBKFtcIkFyZ3VtZW50c1wiLFwiRnVuY3Rpb25cIixcIlN0cmluZ1wiLFwiTnVtYmVyXCIsXCJEYXRlXCIsXCJSZWdFeHBcIl0sZnVuY3Rpb24obil7d1tcImlzXCIrbl09ZnVuY3Rpb24odCl7cmV0dXJuIGwuY2FsbCh0KT09XCJbb2JqZWN0IFwiK24rXCJdXCJ9fSksdy5pc0FyZ3VtZW50cyhhcmd1bWVudHMpfHwody5pc0FyZ3VtZW50cz1mdW5jdGlvbihuKXtyZXR1cm4hKCFufHwhdy5oYXMobixcImNhbGxlZVwiKSl9KSxcImZ1bmN0aW9uXCIhPXR5cGVvZi8uLyYmKHcuaXNGdW5jdGlvbj1mdW5jdGlvbihuKXtyZXR1cm5cImZ1bmN0aW9uXCI9PXR5cGVvZiBufSksdy5pc0Zpbml0ZT1mdW5jdGlvbihuKXtyZXR1cm4gaXNGaW5pdGUobikmJiFpc05hTihwYXJzZUZsb2F0KG4pKX0sdy5pc05hTj1mdW5jdGlvbihuKXtyZXR1cm4gdy5pc051bWJlcihuKSYmbiE9K259LHcuaXNCb29sZWFuPWZ1bmN0aW9uKG4pe3JldHVybiBuPT09ITB8fG49PT0hMXx8XCJbb2JqZWN0IEJvb2xlYW5dXCI9PWwuY2FsbChuKX0sdy5pc051bGw9ZnVuY3Rpb24obil7cmV0dXJuIG51bGw9PT1ufSx3LmlzVW5kZWZpbmVkPWZ1bmN0aW9uKG4pe3JldHVybiBuPT09dm9pZCAwfSx3Lmhhcz1mdW5jdGlvbihuLHQpe3JldHVybiBmLmNhbGwobix0KX0sdy5ub0NvbmZsaWN0PWZ1bmN0aW9uKCl7cmV0dXJuIG4uXz10LHRoaXN9LHcuaWRlbnRpdHk9ZnVuY3Rpb24obil7cmV0dXJuIG59LHcudGltZXM9ZnVuY3Rpb24obix0LHIpe2Zvcih2YXIgZT1BcnJheShuKSx1PTA7bj51O3UrKyllW3VdPXQuY2FsbChyLHUpO3JldHVybiBlfSx3LnJhbmRvbT1mdW5jdGlvbihuLHQpe3JldHVybiBudWxsPT10JiYodD1uLG49MCksbitNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkqKHQtbisxKSl9O3ZhciBNPXtlc2NhcGU6e1wiJlwiOlwiJmFtcDtcIixcIjxcIjpcIiZsdDtcIixcIj5cIjpcIiZndDtcIiwnXCInOlwiJnF1b3Q7XCIsXCInXCI6XCImI3gyNztcIixcIi9cIjpcIiYjeDJGO1wifX07TS51bmVzY2FwZT13LmludmVydChNLmVzY2FwZSk7dmFyIFM9e2VzY2FwZTpSZWdFeHAoXCJbXCIrdy5rZXlzKE0uZXNjYXBlKS5qb2luKFwiXCIpK1wiXVwiLFwiZ1wiKSx1bmVzY2FwZTpSZWdFeHAoXCIoXCIrdy5rZXlzKE0udW5lc2NhcGUpLmpvaW4oXCJ8XCIpK1wiKVwiLFwiZ1wiKX07dy5lYWNoKFtcImVzY2FwZVwiLFwidW5lc2NhcGVcIl0sZnVuY3Rpb24obil7d1tuXT1mdW5jdGlvbih0KXtyZXR1cm4gbnVsbD09dD9cIlwiOihcIlwiK3QpLnJlcGxhY2UoU1tuXSxmdW5jdGlvbih0KXtyZXR1cm4gTVtuXVt0XX0pfX0pLHcucmVzdWx0PWZ1bmN0aW9uKG4sdCl7aWYobnVsbD09bilyZXR1cm4gbnVsbDt2YXIgcj1uW3RdO3JldHVybiB3LmlzRnVuY3Rpb24ocik/ci5jYWxsKG4pOnJ9LHcubWl4aW49ZnVuY3Rpb24obil7QSh3LmZ1bmN0aW9ucyhuKSxmdW5jdGlvbih0KXt2YXIgcj13W3RdPW5bdF07dy5wcm90b3R5cGVbdF09ZnVuY3Rpb24oKXt2YXIgbj1bdGhpcy5fd3JhcHBlZF07cmV0dXJuIGEuYXBwbHkobixhcmd1bWVudHMpLEQuY2FsbCh0aGlzLHIuYXBwbHkodyxuKSl9fSl9O3ZhciBOPTA7dy51bmlxdWVJZD1mdW5jdGlvbihuKXt2YXIgdD0rK04rXCJcIjtyZXR1cm4gbj9uK3Q6dH0sdy50ZW1wbGF0ZVNldHRpbmdzPXtldmFsdWF0ZTovPCUoW1xcc1xcU10rPyklPi9nLGludGVycG9sYXRlOi88JT0oW1xcc1xcU10rPyklPi9nLGVzY2FwZTovPCUtKFtcXHNcXFNdKz8pJT4vZ307dmFyIFQ9LyguKV4vLHE9e1wiJ1wiOlwiJ1wiLFwiXFxcXFwiOlwiXFxcXFwiLFwiXFxyXCI6XCJyXCIsXCJcXG5cIjpcIm5cIixcIlx0XCI6XCJ0XCIsXCJcXHUyMDI4XCI6XCJ1MjAyOFwiLFwiXFx1MjAyOVwiOlwidTIwMjlcIn0sQj0vXFxcXHwnfFxccnxcXG58XFx0fFxcdTIwMjh8XFx1MjAyOS9nO3cudGVtcGxhdGU9ZnVuY3Rpb24obix0LHIpe3ZhciBlO3I9dy5kZWZhdWx0cyh7fSxyLHcudGVtcGxhdGVTZXR0aW5ncyk7dmFyIHU9UmVnRXhwKFsoci5lc2NhcGV8fFQpLnNvdXJjZSwoci5pbnRlcnBvbGF0ZXx8VCkuc291cmNlLChyLmV2YWx1YXRlfHxUKS5zb3VyY2VdLmpvaW4oXCJ8XCIpK1wifCRcIixcImdcIiksaT0wLGE9XCJfX3ArPSdcIjtuLnJlcGxhY2UodSxmdW5jdGlvbih0LHIsZSx1LG8pe3JldHVybiBhKz1uLnNsaWNlKGksbykucmVwbGFjZShCLGZ1bmN0aW9uKG4pe3JldHVyblwiXFxcXFwiK3Fbbl19KSxyJiYoYSs9XCInK1xcbigoX190PShcIityK1wiKSk9PW51bGw/Jyc6Xy5lc2NhcGUoX190KSkrXFxuJ1wiKSxlJiYoYSs9XCInK1xcbigoX190PShcIitlK1wiKSk9PW51bGw/Jyc6X190KStcXG4nXCIpLHUmJihhKz1cIic7XFxuXCIrdStcIlxcbl9fcCs9J1wiKSxpPW8rdC5sZW5ndGgsdH0pLGErPVwiJztcXG5cIixyLnZhcmlhYmxlfHwoYT1cIndpdGgob2JqfHx7fSl7XFxuXCIrYStcIn1cXG5cIiksYT1cInZhciBfX3QsX19wPScnLF9faj1BcnJheS5wcm90b3R5cGUuam9pbixcIitcInByaW50PWZ1bmN0aW9uKCl7X19wKz1fX2ouY2FsbChhcmd1bWVudHMsJycpO307XFxuXCIrYStcInJldHVybiBfX3A7XFxuXCI7dHJ5e2U9RnVuY3Rpb24oci52YXJpYWJsZXx8XCJvYmpcIixcIl9cIixhKX1jYXRjaChvKXt0aHJvdyBvLnNvdXJjZT1hLG99aWYodClyZXR1cm4gZSh0LHcpO3ZhciBjPWZ1bmN0aW9uKG4pe3JldHVybiBlLmNhbGwodGhpcyxuLHcpfTtyZXR1cm4gYy5zb3VyY2U9XCJmdW5jdGlvbihcIisoci52YXJpYWJsZXx8XCJvYmpcIikrXCIpe1xcblwiK2ErXCJ9XCIsY30sdy5jaGFpbj1mdW5jdGlvbihuKXtyZXR1cm4gdyhuKS5jaGFpbigpfTt2YXIgRD1mdW5jdGlvbihuKXtyZXR1cm4gdGhpcy5fY2hhaW4/dyhuKS5jaGFpbigpOm59O3cubWl4aW4odyksQShbXCJwb3BcIixcInB1c2hcIixcInJldmVyc2VcIixcInNoaWZ0XCIsXCJzb3J0XCIsXCJzcGxpY2VcIixcInVuc2hpZnRcIl0sZnVuY3Rpb24obil7dmFyIHQ9ZVtuXTt3LnByb3RvdHlwZVtuXT1mdW5jdGlvbigpe3ZhciByPXRoaXMuX3dyYXBwZWQ7cmV0dXJuIHQuYXBwbHkocixhcmd1bWVudHMpLFwic2hpZnRcIiE9biYmXCJzcGxpY2VcIiE9bnx8MCE9PXIubGVuZ3RofHxkZWxldGUgclswXSxELmNhbGwodGhpcyxyKX19KSxBKFtcImNvbmNhdFwiLFwiam9pblwiLFwic2xpY2VcIl0sZnVuY3Rpb24obil7dmFyIHQ9ZVtuXTt3LnByb3RvdHlwZVtuXT1mdW5jdGlvbigpe3JldHVybiBELmNhbGwodGhpcyx0LmFwcGx5KHRoaXMuX3dyYXBwZWQsYXJndW1lbnRzKSl9fSksdy5leHRlbmQody5wcm90b3R5cGUse2NoYWluOmZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuX2NoYWluPSEwLHRoaXN9LHZhbHVlOmZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuX3dyYXBwZWR9fSl9KS5jYWxsKHRoaXMpO1xufSkoKSIsIlxudmFyIHJhZiA9ICB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lICAgICAgIHx8XG4gICAgICAgICAgIHdpbmRvdy53ZWJraXRSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHxcbiAgICAgICAgICAgd2luZG93Lm1velJlcXVlc3RBbmltYXRpb25GcmFtZSAgICB8fFxuICAgICAgICAgICBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dChjYWxsYmFjaywgMTAwMCAvIDYwKTtcbiAgICAgICAgICAgfTtcblxudmFyIHJ1bm5pbmcgPSBmYWxzZTtcblxuZXhwb3J0cy5ydW4gPSBmdW5jdGlvbihmbikge1xuICBydW5uaW5nID0gdHJ1ZTtcbiAgcmFmKGZ1bmN0aW9uIGFuaW1hdGUoKSB7XG4gICAgZm4oKTtcbiAgICBpZiAocnVubmluZykge1xuICAgICAgcmFmKGFuaW1hdGUpO1xuICAgIH1cbiAgfSk7XG59O1xuXG5leHBvcnRzLnN0b3AgPSBmdW5jdGlvbigpIHtcbiAgcnVubmluZyA9IGZhbHNlO1xufTtcbiIsIlxudmFyIEVudGl0eVRyYWNrZXIgPSBmdW5jdGlvbigpIHtcbiAgXG4gIHZhciBlbnRpdGllcyA9IHt9O1xuICB2YXIgbGFzdElkID0gMTtcblxuICB0aGlzLmZvckVhY2ggPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgIGZvciAodmFyIGlkIGluIGVudGl0aWVzKSB7XG4gICAgICBjYWxsYmFjayhlbnRpdGllc1tpZF0pO1xuICAgIH1cbiAgfTtcblxuICB0aGlzLmZpbmQgPSBmdW5jdGlvbihpZCkge1xuICAgIHJldHVybiBlbnRpdGllc1tpZF07XG4gIH07XG5cbiAgdGhpcy5maW5kTWF0Y2hpbmcgPSBmdW5jdGlvbihyZWdleCkge1xuICAgIHJldHVybiBPYmplY3Qua2V5cyhlbnRpdGllcylcbiAgICAgIC5maWx0ZXIoZnVuY3Rpb24oaWQpIHsgcmV0dXJuIGlkLm1hdGNoKHJlZ2V4KSB9KVxuICAgICAgLm1hcChmdW5jdGlvbihpZCkgeyByZXR1cm4gZW50aXRpZXNbaWRdIH0pXG4gIH1cblxuICB0aGlzLnRyYWNrID0gZnVuY3Rpb24oZW50aXR5KSB7XG4gICAgLy9jb25zb2xlLmxvZygnVHJhY2tpbmcgZW50aXR5OiAnICsgZW50aXR5LmlkKTtcbiAgICB2YXIgaWQgPSBlbnRpdHkuaWQgfHwgKGxhc3RJZCArPSAxKTtcbiAgICBlbnRpdGllc1tpZF0gPSBlbnRpdHk7XG4gICAgcmV0dXJuIGlkO1xuICB9O1xuXG4gIHRoaXMuZm9yZ2V0ID0gZnVuY3Rpb24oZW50aXR5KSB7XG4gICAgZGVsZXRlIGVudGl0aWVzW2VudGl0eS5pZF07XG4gIH07XG4gIFxuICB0aGlzLmZvcmdldEFsbCA9IGZ1bmN0aW9uKCkge1xuICAgIGVudGl0aWVzID0ge307XG4gIH1cbiAgXG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEVudGl0eVRyYWNrZXI7XG4iLCJcbmZ1bmN0aW9uIFRpbWUoKSB7XG4gIHRoaXMuZGVsdGEgPSAxO1xuICB0aGlzLmxhc3RUaW1lID0gbmV3IERhdGUoKTtcbiAgdGhpcy5mcmFtZXMgPSAwO1xufVxuXG5UaW1lLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5mcmFtZXMrKztcbiAgdmFyIHRpbWUgPSBEYXRlLm5vdygpO1xuICB0aGlzLmZyYW1lcyA9IDA7XG4gICAgXG4gIHZhciBjdXJyZW50VGltZSA9IHRpbWU7XG4gIHZhciBwYXNzZWRUaW1lID0gY3VycmVudFRpbWUgLSB0aGlzLmxhc3RUaW1lO1xuICBcbiAgdGhpcy5kZWx0YSA9IHBhc3NlZFRpbWU7XG4gIHRoaXMubGFzdFRpbWUgPSBjdXJyZW50VGltZTtcblxuICByZXR1cm4gdGhpcy5kZWx0YTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gVGltZTtcbiIsIi8vIENvcHlyaWdodCAoYykgMjAxMyBBZG9iZSBTeXN0ZW1zIEluY29ycG9yYXRlZC4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbi8vIFxuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy8gXG4vLyBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vIFxuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbi8vIOKUjOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUkCBcXFxcXG4vLyDilIIgRXZlIDAuNC4yIC0gSmF2YVNjcmlwdCBFdmVudHMgTGlicmFyeSAgICAgICAgICAgICAgICAgICAgICDilIIgXFxcXFxuLy8g4pSc4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSkIFxcXFxcbi8vIOKUgiBBdXRob3IgRG1pdHJ5IEJhcmFub3Zza2l5IChodHRwOi8vZG1pdHJ5LmJhcmFub3Zza2l5LmNvbS8pIOKUgiBcXFxcXG4vLyDilJTilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilJggXFxcXFxuXG4oZnVuY3Rpb24gKGdsb2IpIHtcbiAgICB2YXIgdmVyc2lvbiA9IFwiMC40LjJcIixcbiAgICAgICAgaGFzID0gXCJoYXNPd25Qcm9wZXJ0eVwiLFxuICAgICAgICBzZXBhcmF0b3IgPSAvW1xcLlxcL10vLFxuICAgICAgICB3aWxkY2FyZCA9IFwiKlwiLFxuICAgICAgICBmdW4gPSBmdW5jdGlvbiAoKSB7fSxcbiAgICAgICAgbnVtc29ydCA9IGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gYSAtIGI7XG4gICAgICAgIH0sXG4gICAgICAgIGN1cnJlbnRfZXZlbnQsXG4gICAgICAgIHN0b3AsXG4gICAgICAgIGV2ZW50cyA9IHtuOiB7fX0sXG4gICAgLypcXFxuICAgICAqIGV2ZVxuICAgICBbIG1ldGhvZCBdXG5cbiAgICAgKiBGaXJlcyBldmVudCB3aXRoIGdpdmVuIGBuYW1lYCwgZ2l2ZW4gc2NvcGUgYW5kIG90aGVyIHBhcmFtZXRlcnMuXG5cbiAgICAgPiBBcmd1bWVudHNcblxuICAgICAtIG5hbWUgKHN0cmluZykgbmFtZSBvZiB0aGUgKmV2ZW50KiwgZG90IChgLmApIG9yIHNsYXNoIChgL2ApIHNlcGFyYXRlZFxuICAgICAtIHNjb3BlIChvYmplY3QpIGNvbnRleHQgZm9yIHRoZSBldmVudCBoYW5kbGVyc1xuICAgICAtIHZhcmFyZ3MgKC4uLikgdGhlIHJlc3Qgb2YgYXJndW1lbnRzIHdpbGwgYmUgc2VudCB0byBldmVudCBoYW5kbGVyc1xuXG4gICAgID0gKG9iamVjdCkgYXJyYXkgb2YgcmV0dXJuZWQgdmFsdWVzIGZyb20gdGhlIGxpc3RlbmVyc1xuICAgIFxcKi9cbiAgICAgICAgZXZlID0gZnVuY3Rpb24gKG5hbWUsIHNjb3BlKSB7XG5cdFx0XHRuYW1lID0gU3RyaW5nKG5hbWUpO1xuICAgICAgICAgICAgdmFyIGUgPSBldmVudHMsXG4gICAgICAgICAgICAgICAgb2xkc3RvcCA9IHN0b3AsXG4gICAgICAgICAgICAgICAgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMiksXG4gICAgICAgICAgICAgICAgbGlzdGVuZXJzID0gZXZlLmxpc3RlbmVycyhuYW1lKSxcbiAgICAgICAgICAgICAgICB6ID0gMCxcbiAgICAgICAgICAgICAgICBmID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgbCxcbiAgICAgICAgICAgICAgICBpbmRleGVkID0gW10sXG4gICAgICAgICAgICAgICAgcXVldWUgPSB7fSxcbiAgICAgICAgICAgICAgICBvdXQgPSBbXSxcbiAgICAgICAgICAgICAgICBjZSA9IGN1cnJlbnRfZXZlbnQsXG4gICAgICAgICAgICAgICAgZXJyb3JzID0gW107XG4gICAgICAgICAgICBjdXJyZW50X2V2ZW50ID0gbmFtZTtcbiAgICAgICAgICAgIHN0b3AgPSAwO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGlpID0gbGlzdGVuZXJzLmxlbmd0aDsgaSA8IGlpOyBpKyspIGlmIChcInpJbmRleFwiIGluIGxpc3RlbmVyc1tpXSkge1xuICAgICAgICAgICAgICAgIGluZGV4ZWQucHVzaChsaXN0ZW5lcnNbaV0uekluZGV4KTtcbiAgICAgICAgICAgICAgICBpZiAobGlzdGVuZXJzW2ldLnpJbmRleCA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcXVldWVbbGlzdGVuZXJzW2ldLnpJbmRleF0gPSBsaXN0ZW5lcnNbaV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaW5kZXhlZC5zb3J0KG51bXNvcnQpO1xuICAgICAgICAgICAgd2hpbGUgKGluZGV4ZWRbel0gPCAwKSB7XG4gICAgICAgICAgICAgICAgbCA9IHF1ZXVlW2luZGV4ZWRbeisrXV07XG4gICAgICAgICAgICAgICAgb3V0LnB1c2gobC5hcHBseShzY29wZSwgYXJncykpO1xuICAgICAgICAgICAgICAgIGlmIChzdG9wKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0b3AgPSBvbGRzdG9wO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBpaTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgbCA9IGxpc3RlbmVyc1tpXTtcbiAgICAgICAgICAgICAgICBpZiAoXCJ6SW5kZXhcIiBpbiBsKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChsLnpJbmRleCA9PSBpbmRleGVkW3pdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvdXQucHVzaChsLmFwcGx5KHNjb3BlLCBhcmdzKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RvcCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHorKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsID0gcXVldWVbaW5kZXhlZFt6XV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbCAmJiBvdXQucHVzaChsLmFwcGx5KHNjb3BlLCBhcmdzKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN0b3ApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSB3aGlsZSAobClcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHF1ZXVlW2wuekluZGV4XSA9IGw7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBvdXQucHVzaChsLmFwcGx5KHNjb3BlLCBhcmdzKSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdG9wKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHN0b3AgPSBvbGRzdG9wO1xuICAgICAgICAgICAgY3VycmVudF9ldmVudCA9IGNlO1xuICAgICAgICAgICAgcmV0dXJuIG91dC5sZW5ndGggPyBvdXQgOiBudWxsO1xuICAgICAgICB9O1xuXHRcdC8vIFVuZG9jdW1lbnRlZC4gRGVidWcgb25seS5cblx0XHRldmUuX2V2ZW50cyA9IGV2ZW50cztcbiAgICAvKlxcXG4gICAgICogZXZlLmxpc3RlbmVyc1xuICAgICBbIG1ldGhvZCBdXG5cbiAgICAgKiBJbnRlcm5hbCBtZXRob2Qgd2hpY2ggZ2l2ZXMgeW91IGFycmF5IG9mIGFsbCBldmVudCBoYW5kbGVycyB0aGF0IHdpbGwgYmUgdHJpZ2dlcmVkIGJ5IHRoZSBnaXZlbiBgbmFtZWAuXG5cbiAgICAgPiBBcmd1bWVudHNcblxuICAgICAtIG5hbWUgKHN0cmluZykgbmFtZSBvZiB0aGUgZXZlbnQsIGRvdCAoYC5gKSBvciBzbGFzaCAoYC9gKSBzZXBhcmF0ZWRcblxuICAgICA9IChhcnJheSkgYXJyYXkgb2YgZXZlbnQgaGFuZGxlcnNcbiAgICBcXCovXG4gICAgZXZlLmxpc3RlbmVycyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgIHZhciBuYW1lcyA9IG5hbWUuc3BsaXQoc2VwYXJhdG9yKSxcbiAgICAgICAgICAgIGUgPSBldmVudHMsXG4gICAgICAgICAgICBpdGVtLFxuICAgICAgICAgICAgaXRlbXMsXG4gICAgICAgICAgICBrLFxuICAgICAgICAgICAgaSxcbiAgICAgICAgICAgIGlpLFxuICAgICAgICAgICAgaixcbiAgICAgICAgICAgIGpqLFxuICAgICAgICAgICAgbmVzLFxuICAgICAgICAgICAgZXMgPSBbZV0sXG4gICAgICAgICAgICBvdXQgPSBbXTtcbiAgICAgICAgZm9yIChpID0gMCwgaWkgPSBuYW1lcy5sZW5ndGg7IGkgPCBpaTsgaSsrKSB7XG4gICAgICAgICAgICBuZXMgPSBbXTtcbiAgICAgICAgICAgIGZvciAoaiA9IDAsIGpqID0gZXMubGVuZ3RoOyBqIDwgamo7IGorKykge1xuICAgICAgICAgICAgICAgIGUgPSBlc1tqXS5uO1xuICAgICAgICAgICAgICAgIGl0ZW1zID0gW2VbbmFtZXNbaV1dLCBlW3dpbGRjYXJkXV07XG4gICAgICAgICAgICAgICAgayA9IDI7XG4gICAgICAgICAgICAgICAgd2hpbGUgKGstLSkge1xuICAgICAgICAgICAgICAgICAgICBpdGVtID0gaXRlbXNba107XG4gICAgICAgICAgICAgICAgICAgIGlmIChpdGVtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXMucHVzaChpdGVtKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dCA9IG91dC5jb25jYXQoaXRlbS5mIHx8IFtdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVzID0gbmVzO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvdXQ7XG4gICAgfTtcbiAgICBcbiAgICAvKlxcXG4gICAgICogZXZlLm9uXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKipcbiAgICAgKiBCaW5kcyBnaXZlbiBldmVudCBoYW5kbGVyIHdpdGggYSBnaXZlbiBuYW1lLiBZb3UgY2FuIHVzZSB3aWxkY2FyZHMg4oCcYCpg4oCdIGZvciB0aGUgbmFtZXM6XG4gICAgIHwgZXZlLm9uKFwiKi51bmRlci4qXCIsIGYpO1xuICAgICB8IGV2ZShcIm1vdXNlLnVuZGVyLmZsb29yXCIpOyAvLyB0cmlnZ2VycyBmXG4gICAgICogVXNlIEBldmUgdG8gdHJpZ2dlciB0aGUgbGlzdGVuZXIuXG4gICAgICoqXG4gICAgID4gQXJndW1lbnRzXG4gICAgICoqXG4gICAgIC0gbmFtZSAoc3RyaW5nKSBuYW1lIG9mIHRoZSBldmVudCwgZG90IChgLmApIG9yIHNsYXNoIChgL2ApIHNlcGFyYXRlZCwgd2l0aCBvcHRpb25hbCB3aWxkY2FyZHNcbiAgICAgLSBmIChmdW5jdGlvbikgZXZlbnQgaGFuZGxlciBmdW5jdGlvblxuICAgICAqKlxuICAgICA9IChmdW5jdGlvbikgcmV0dXJuZWQgZnVuY3Rpb24gYWNjZXB0cyBhIHNpbmdsZSBudW1lcmljIHBhcmFtZXRlciB0aGF0IHJlcHJlc2VudHMgei1pbmRleCBvZiB0aGUgaGFuZGxlci4gSXQgaXMgYW4gb3B0aW9uYWwgZmVhdHVyZSBhbmQgb25seSB1c2VkIHdoZW4geW91IG5lZWQgdG8gZW5zdXJlIHRoYXQgc29tZSBzdWJzZXQgb2YgaGFuZGxlcnMgd2lsbCBiZSBpbnZva2VkIGluIGEgZ2l2ZW4gb3JkZXIsIGRlc3BpdGUgb2YgdGhlIG9yZGVyIG9mIGFzc2lnbm1lbnQuIFxuICAgICA+IEV4YW1wbGU6XG4gICAgIHwgZXZlLm9uKFwibW91c2VcIiwgZWF0SXQpKDIpO1xuICAgICB8IGV2ZS5vbihcIm1vdXNlXCIsIHNjcmVhbSk7XG4gICAgIHwgZXZlLm9uKFwibW91c2VcIiwgY2F0Y2hJdCkoMSk7XG4gICAgICogVGhpcyB3aWxsIGVuc3VyZSB0aGF0IGBjYXRjaEl0KClgIGZ1bmN0aW9uIHdpbGwgYmUgY2FsbGVkIGJlZm9yZSBgZWF0SXQoKWAuXG5cdCAqXG4gICAgICogSWYgeW91IHdhbnQgdG8gcHV0IHlvdXIgaGFuZGxlciBiZWZvcmUgbm9uLWluZGV4ZWQgaGFuZGxlcnMsIHNwZWNpZnkgYSBuZWdhdGl2ZSB2YWx1ZS5cbiAgICAgKiBOb3RlOiBJIGFzc3VtZSBtb3N0IG9mIHRoZSB0aW1lIHlvdSBkb27igJl0IG5lZWQgdG8gd29ycnkgYWJvdXQgei1pbmRleCwgYnV0IGl04oCZcyBuaWNlIHRvIGhhdmUgdGhpcyBmZWF0dXJlIOKAnGp1c3QgaW4gY2FzZeKAnS5cbiAgICBcXCovXG4gICAgZXZlLm9uID0gZnVuY3Rpb24gKG5hbWUsIGYpIHtcblx0XHRuYW1lID0gU3RyaW5nKG5hbWUpO1xuXHRcdGlmICh0eXBlb2YgZiAhPSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdHJldHVybiBmdW5jdGlvbiAoKSB7fTtcblx0XHR9XG4gICAgICAgIHZhciBuYW1lcyA9IG5hbWUuc3BsaXQoc2VwYXJhdG9yKSxcbiAgICAgICAgICAgIGUgPSBldmVudHM7XG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBpaSA9IG5hbWVzLmxlbmd0aDsgaSA8IGlpOyBpKyspIHtcbiAgICAgICAgICAgIGUgPSBlLm47XG4gICAgICAgICAgICBlID0gZS5oYXNPd25Qcm9wZXJ0eShuYW1lc1tpXSkgJiYgZVtuYW1lc1tpXV0gfHwgKGVbbmFtZXNbaV1dID0ge246IHt9fSk7XG4gICAgICAgIH1cbiAgICAgICAgZS5mID0gZS5mIHx8IFtdO1xuICAgICAgICBmb3IgKGkgPSAwLCBpaSA9IGUuZi5sZW5ndGg7IGkgPCBpaTsgaSsrKSBpZiAoZS5mW2ldID09IGYpIHtcbiAgICAgICAgICAgIHJldHVybiBmdW47XG4gICAgICAgIH1cbiAgICAgICAgZS5mLnB1c2goZik7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoekluZGV4KSB7XG4gICAgICAgICAgICBpZiAoK3pJbmRleCA9PSArekluZGV4KSB7XG4gICAgICAgICAgICAgICAgZi56SW5kZXggPSArekluZGV4O1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH07XG4gICAgLypcXFxuICAgICAqIGV2ZS5mXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKipcbiAgICAgKiBSZXR1cm5zIGZ1bmN0aW9uIHRoYXQgd2lsbCBmaXJlIGdpdmVuIGV2ZW50IHdpdGggb3B0aW9uYWwgYXJndW1lbnRzLlxuXHQgKiBBcmd1bWVudHMgdGhhdCB3aWxsIGJlIHBhc3NlZCB0byB0aGUgcmVzdWx0IGZ1bmN0aW9uIHdpbGwgYmUgYWxzb1xuXHQgKiBjb25jYXRlZCB0byB0aGUgbGlzdCBvZiBmaW5hbCBhcmd1bWVudHMuXG4gXHQgfCBlbC5vbmNsaWNrID0gZXZlLmYoXCJjbGlja1wiLCAxLCAyKTtcbiBcdCB8IGV2ZS5vbihcImNsaWNrXCIsIGZ1bmN0aW9uIChhLCBiLCBjKSB7XG4gXHQgfCAgICAgY29uc29sZS5sb2coYSwgYiwgYyk7IC8vIDEsIDIsIFtldmVudCBvYmplY3RdXG4gXHQgfCB9KTtcbiAgICAgPiBBcmd1bWVudHNcblx0IC0gZXZlbnQgKHN0cmluZykgZXZlbnQgbmFtZVxuXHQgLSB2YXJhcmdzICjigKYpIGFuZCBhbnkgb3RoZXIgYXJndW1lbnRzXG5cdCA9IChmdW5jdGlvbikgcG9zc2libGUgZXZlbnQgaGFuZGxlciBmdW5jdGlvblxuICAgIFxcKi9cblx0ZXZlLmYgPSBmdW5jdGlvbiAoZXZlbnQpIHtcblx0XHR2YXIgYXR0cnMgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG5cdFx0cmV0dXJuIGZ1bmN0aW9uICgpIHtcblx0XHRcdGV2ZS5hcHBseShudWxsLCBbZXZlbnQsIG51bGxdLmNvbmNhdChhdHRycykuY29uY2F0KFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKSkpO1xuXHRcdH07XG5cdH07XG4gICAgLypcXFxuICAgICAqIGV2ZS5zdG9wXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKipcbiAgICAgKiBJcyB1c2VkIGluc2lkZSBhbiBldmVudCBoYW5kbGVyIHRvIHN0b3AgdGhlIGV2ZW50LCBwcmV2ZW50aW5nIGFueSBzdWJzZXF1ZW50IGxpc3RlbmVycyBmcm9tIGZpcmluZy5cbiAgICBcXCovXG4gICAgZXZlLnN0b3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHN0b3AgPSAxO1xuICAgIH07XG4gICAgLypcXFxuICAgICAqIGV2ZS5udFxuICAgICBbIG1ldGhvZCBdXG4gICAgICoqXG4gICAgICogQ291bGQgYmUgdXNlZCBpbnNpZGUgZXZlbnQgaGFuZGxlciB0byBmaWd1cmUgb3V0IGFjdHVhbCBuYW1lIG9mIHRoZSBldmVudC5cbiAgICAgKipcbiAgICAgPiBBcmd1bWVudHNcbiAgICAgKipcbiAgICAgLSBzdWJuYW1lIChzdHJpbmcpICNvcHRpb25hbCBzdWJuYW1lIG9mIHRoZSBldmVudFxuICAgICAqKlxuICAgICA9IChzdHJpbmcpIG5hbWUgb2YgdGhlIGV2ZW50LCBpZiBgc3VibmFtZWAgaXMgbm90IHNwZWNpZmllZFxuICAgICAqIG9yXG4gICAgID0gKGJvb2xlYW4pIGB0cnVlYCwgaWYgY3VycmVudCBldmVudOKAmXMgbmFtZSBjb250YWlucyBgc3VibmFtZWBcbiAgICBcXCovXG4gICAgZXZlLm50ID0gZnVuY3Rpb24gKHN1Ym5hbWUpIHtcbiAgICAgICAgaWYgKHN1Ym5hbWUpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUmVnRXhwKFwiKD86XFxcXC58XFxcXC98XilcIiArIHN1Ym5hbWUgKyBcIig/OlxcXFwufFxcXFwvfCQpXCIpLnRlc3QoY3VycmVudF9ldmVudCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGN1cnJlbnRfZXZlbnQ7XG4gICAgfTtcbiAgICAvKlxcXG4gICAgICogZXZlLm50c1xuICAgICBbIG1ldGhvZCBdXG4gICAgICoqXG4gICAgICogQ291bGQgYmUgdXNlZCBpbnNpZGUgZXZlbnQgaGFuZGxlciB0byBmaWd1cmUgb3V0IGFjdHVhbCBuYW1lIG9mIHRoZSBldmVudC5cbiAgICAgKipcbiAgICAgKipcbiAgICAgPSAoYXJyYXkpIG5hbWVzIG9mIHRoZSBldmVudFxuICAgIFxcKi9cbiAgICBldmUubnRzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gY3VycmVudF9ldmVudC5zcGxpdChzZXBhcmF0b3IpO1xuICAgIH07XG4gICAgLypcXFxuICAgICAqIGV2ZS5vZmZcbiAgICAgWyBtZXRob2QgXVxuICAgICAqKlxuICAgICAqIFJlbW92ZXMgZ2l2ZW4gZnVuY3Rpb24gZnJvbSB0aGUgbGlzdCBvZiBldmVudCBsaXN0ZW5lcnMgYXNzaWduZWQgdG8gZ2l2ZW4gbmFtZS5cblx0ICogSWYgbm8gYXJndW1lbnRzIHNwZWNpZmllZCBhbGwgdGhlIGV2ZW50cyB3aWxsIGJlIGNsZWFyZWQuXG4gICAgICoqXG4gICAgID4gQXJndW1lbnRzXG4gICAgICoqXG4gICAgIC0gbmFtZSAoc3RyaW5nKSBuYW1lIG9mIHRoZSBldmVudCwgZG90IChgLmApIG9yIHNsYXNoIChgL2ApIHNlcGFyYXRlZCwgd2l0aCBvcHRpb25hbCB3aWxkY2FyZHNcbiAgICAgLSBmIChmdW5jdGlvbikgZXZlbnQgaGFuZGxlciBmdW5jdGlvblxuICAgIFxcKi9cbiAgICAvKlxcXG4gICAgICogZXZlLnVuYmluZFxuICAgICBbIG1ldGhvZCBdXG4gICAgICoqXG4gICAgICogU2VlIEBldmUub2ZmXG4gICAgXFwqL1xuICAgIGV2ZS5vZmYgPSBldmUudW5iaW5kID0gZnVuY3Rpb24gKG5hbWUsIGYpIHtcblx0XHRpZiAoIW5hbWUpIHtcblx0XHQgICAgZXZlLl9ldmVudHMgPSBldmVudHMgPSB7bjoge319O1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cbiAgICAgICAgdmFyIG5hbWVzID0gbmFtZS5zcGxpdChzZXBhcmF0b3IpLFxuICAgICAgICAgICAgZSxcbiAgICAgICAgICAgIGtleSxcbiAgICAgICAgICAgIHNwbGljZSxcbiAgICAgICAgICAgIGksIGlpLCBqLCBqaixcbiAgICAgICAgICAgIGN1ciA9IFtldmVudHNdO1xuICAgICAgICBmb3IgKGkgPSAwLCBpaSA9IG5hbWVzLmxlbmd0aDsgaSA8IGlpOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjdXIubGVuZ3RoOyBqICs9IHNwbGljZS5sZW5ndGggLSAyKSB7XG4gICAgICAgICAgICAgICAgc3BsaWNlID0gW2osIDFdO1xuICAgICAgICAgICAgICAgIGUgPSBjdXJbal0ubjtcbiAgICAgICAgICAgICAgICBpZiAobmFtZXNbaV0gIT0gd2lsZGNhcmQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVbbmFtZXNbaV1dKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzcGxpY2UucHVzaChlW25hbWVzW2ldXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGtleSBpbiBlKSBpZiAoZVtoYXNdKGtleSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNwbGljZS5wdXNoKGVba2V5XSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY3VyLnNwbGljZS5hcHBseShjdXIsIHNwbGljZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMCwgaWkgPSBjdXIubGVuZ3RoOyBpIDwgaWk7IGkrKykge1xuICAgICAgICAgICAgZSA9IGN1cltpXTtcbiAgICAgICAgICAgIHdoaWxlIChlLm4pIHtcbiAgICAgICAgICAgICAgICBpZiAoZikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZS5mKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGogPSAwLCBqaiA9IGUuZi5sZW5ndGg7IGogPCBqajsgaisrKSBpZiAoZS5mW2pdID09IGYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlLmYuc3BsaWNlKGosIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgIWUuZi5sZW5ndGggJiYgZGVsZXRlIGUuZjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBmb3IgKGtleSBpbiBlLm4pIGlmIChlLm5baGFzXShrZXkpICYmIGUubltrZXldLmYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBmdW5jcyA9IGUubltrZXldLmY7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGogPSAwLCBqaiA9IGZ1bmNzLmxlbmd0aDsgaiA8IGpqOyBqKyspIGlmIChmdW5jc1tqXSA9PSBmKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZnVuY3Muc3BsaWNlKGosIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgIWZ1bmNzLmxlbmd0aCAmJiBkZWxldGUgZS5uW2tleV0uZjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBlLmY7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoa2V5IGluIGUubikgaWYgKGUubltoYXNdKGtleSkgJiYgZS5uW2tleV0uZikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGUubltrZXldLmY7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZSA9IGUubjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG4gICAgLypcXFxuICAgICAqIGV2ZS5vbmNlXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKipcbiAgICAgKiBCaW5kcyBnaXZlbiBldmVudCBoYW5kbGVyIHdpdGggYSBnaXZlbiBuYW1lIHRvIG9ubHkgcnVuIG9uY2UgdGhlbiB1bmJpbmQgaXRzZWxmLlxuICAgICB8IGV2ZS5vbmNlKFwibG9naW5cIiwgZik7XG4gICAgIHwgZXZlKFwibG9naW5cIik7IC8vIHRyaWdnZXJzIGZcbiAgICAgfCBldmUoXCJsb2dpblwiKTsgLy8gbm8gbGlzdGVuZXJzXG4gICAgICogVXNlIEBldmUgdG8gdHJpZ2dlciB0aGUgbGlzdGVuZXIuXG4gICAgICoqXG4gICAgID4gQXJndW1lbnRzXG4gICAgICoqXG4gICAgIC0gbmFtZSAoc3RyaW5nKSBuYW1lIG9mIHRoZSBldmVudCwgZG90IChgLmApIG9yIHNsYXNoIChgL2ApIHNlcGFyYXRlZCwgd2l0aCBvcHRpb25hbCB3aWxkY2FyZHNcbiAgICAgLSBmIChmdW5jdGlvbikgZXZlbnQgaGFuZGxlciBmdW5jdGlvblxuICAgICAqKlxuICAgICA9IChmdW5jdGlvbikgc2FtZSByZXR1cm4gZnVuY3Rpb24gYXMgQGV2ZS5vblxuICAgIFxcKi9cbiAgICBldmUub25jZSA9IGZ1bmN0aW9uIChuYW1lLCBmKSB7XG4gICAgICAgIHZhciBmMiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGV2ZS51bmJpbmQobmFtZSwgZjIpO1xuICAgICAgICAgICAgcmV0dXJuIGYuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIGV2ZS5vbihuYW1lLCBmMik7XG4gICAgfTtcbiAgICAvKlxcXG4gICAgICogZXZlLnZlcnNpb25cbiAgICAgWyBwcm9wZXJ0eSAoc3RyaW5nKSBdXG4gICAgICoqXG4gICAgICogQ3VycmVudCB2ZXJzaW9uIG9mIHRoZSBsaWJyYXJ5LlxuICAgIFxcKi9cbiAgICBldmUudmVyc2lvbiA9IHZlcnNpb247XG4gICAgZXZlLnRvU3RyaW5nID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gXCJZb3UgYXJlIHJ1bm5pbmcgRXZlIFwiICsgdmVyc2lvbjtcbiAgICB9O1xuICAgICh0eXBlb2YgbW9kdWxlICE9IFwidW5kZWZpbmVkXCIgJiYgbW9kdWxlLmV4cG9ydHMpID8gKG1vZHVsZS5leHBvcnRzID0gZXZlKSA6ICh0eXBlb2YgZGVmaW5lICE9IFwidW5kZWZpbmVkXCIgPyAoZGVmaW5lKFwiZXZlXCIsIFtdLCBmdW5jdGlvbigpIHsgcmV0dXJuIGV2ZTsgfSkpIDogKGdsb2IuZXZlID0gZXZlKSk7XG59KSh0aGlzKTtcbiIsInZhciBfID0gcmVxdWlyZSgnLi4vLi4vM3JkcGFydHkvdW5kZXJzY29yZS1taW4nKTtcblxudmFyIGltYWdlcyA9IFtcbiAgJ2JhbGwnLFxuICAnYm9vbS1jaXJjbGUnLCAnYm9vbS1saW5lJywgJ2Jvb20tc3BsYXNoJyxcbiAgJ2NhdCcsICdjYXQtZG93bicsICdjYXQtdXAnLFxuICAnY29uZScsXG4gICdkb2cnLCAnZG9nLWRvd24nLCAnZG9nLXVwJyxcbiAgJ2VuZC1kcmF3JywgJ2VuZC13aW5uZXInLFxuICAnaW50cm8tYWJvdXQnLCAnaW50cm8tbGVhZGVyYm9hcmQnLCAnaW50cm8tdGl0bGUnLCAnaW50cm8tdHcnLFxuICAncGFydGljbGUtYmFsbCcsXG4gICdzdGFkaXVtJywgJ3N0YWRpdW0tc2hha2UtbGVmdCcsICdzdGFkaXVtLXNoYWtlLXJpZ2h0JyxcbiAgJ2ludHJvLXRpdGxlJ1xuXS5yZWR1Y2UoaW1hZ2VQYXRoLCB7fSk7XG5cbnZhciBzb3VuZHMgPSBbXG4gICdib3VuY2UnLFxuICAnY3Jvd2QnLCAnY3Jvd2QtZW5kJywgJ2Nyb3dkLW9oJywgJ2Nyb3dkLW9yZ2FuJywgJ2Nyb3dkLXNjb3JlZCcsXG4gICdpbnRybycsICdtdWx0aWJhbGwnLCAnc2F4JywgJ3doaXN0bGUnXG5dLnJlZHVjZShzb3VuZFBhdGgsIHt9KTtcblxuZnVuY3Rpb24gaW1hZ2VQYXRoKGFjYywgbmFtZSkge1xuICBhY2NbbmFtZV0gPSAnL2dhbWUvaW1hZ2VzLycgKyBuYW1lICsgJy5wbmcnO1xuICByZXR1cm4gYWNjO1xufVxuXG5mdW5jdGlvbiBzb3VuZFBhdGgoYWNjLCBuYW1lKSB7XG4gIGFjY1tuYW1lXSA9ICcvZ2FtZS9zb3VuZHMvJyArIG5hbWUgKyAnLm1wMyc7XG4gIHJldHVybiBhY2M7XG59XG5cbmV4cG9ydHMuaW1hZ2UgPSBmdW5jdGlvbihuYW1lKSB7XG4gIHJldHVybiBpbWFnZXNbbmFtZV07XG59O1xuXG5leHBvcnRzLmltYWdlcyA9IGZ1bmN0aW9uKC8qdmFyYXJncyovKSB7XG4gIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuYXBwbHkoYXJndW1lbnRzKS5tYXAoZnVuY3Rpb24obmFtZSkge1xuICAgIHJldHVybiBpbWFnZXNbbmFtZV07XG4gIH0pXG59O1xuXG5leHBvcnRzLmFsbEltYWdlcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gXy52YWx1ZXMoaW1hZ2VzKTtcbn1cblxuZXhwb3J0cy5zb3VuZCA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgcmV0dXJuIHNvdW5kc1tuYW1lXTtcbn07XG4iLCJ2YXIgdXNlckludGVyZmFjZSAgID0gcmVxdWlyZSgnLi91c2VyLWludGVyZmFjZScpO1xudmFyIHdvcmxkMiAgICAgICAgICA9IHJlcXVpcmUoJy4vd29ybGQnKTtcblxuZnVuY3Rpb24gR3JhcGhpY3NFbmdpbmUod29ybGQsIGdhbWVWaWV3LCBkZWJ1Z1ZpZXcpIHtcbiAgdGhpcy5yZW5kZXJlciAgICAgPSBQSVhJLmF1dG9EZXRlY3RSZW5kZXJlcihnYW1lVmlldy53aWR0aCwgZ2FtZVZpZXcuaGVpZ2h0LCBnYW1lVmlldyk7XG4gIHRoaXMuc3RhZ2UgICAgICAgID0gbmV3IFBJWEkuU3RhZ2UoKTtcbiAgdGhpcy52aWV3ICAgICAgICAgPSB0aGlzLnJlbmRlcmVyLnZpZXc7XG4gIHRoaXMuZGVidWdWaWV3ICAgID0gZGVidWdWaWV3O1xuICBcbiAgdmFyIHdvcmxkUmF0aW8gID0gd29ybGQud2lkdGggLyB3b3JsZC5oZWlnaHQ7XG4gIHZhciBzY3JlZW5SYXRpbyA9IGdhbWVWaWV3LndpZHRoIC8gZ2FtZVZpZXcuaGVpZ2h0O1xuICBcbiAgdmFyIHdpZHRoLCBoZWlnaHQ7XG4gIGlmIChzY3JlZW5SYXRpbyA+IHdvcmxkUmF0aW8pIHtcbiAgICB3aWR0aCAgPSBNYXRoLmZsb29yKGdhbWVWaWV3LmhlaWdodCAqIHdvcmxkUmF0aW8pO1xuICAgIGhlaWdodCA9IGdhbWVWaWV3LmhlaWdodDtcbiAgfSBlbHNlIHtcbiAgICB3aWR0aCAgPSBnYW1lVmlldy53aWR0aDtcbiAgICBoZWlnaHQgPSBNYXRoLmZsb29yKGdhbWVWaWV3LndpZHRoIC8gd29ybGRSYXRpbyk7XG4gIH1cbiAgXG4gIGdhbWVWaWV3LndpZHRoICA9IGRlYnVnVmlldy53aWR0aCAgPSB3aWR0aDtcbiAgZ2FtZVZpZXcuaGVpZ2h0ID0gZGVidWdWaWV3LmhlaWdodCA9IGhlaWdodFxuICB1c2VySW50ZXJmYWNlLnJlc2l6ZShnYW1lVmlldy53aWR0aCwgZ2FtZVZpZXcuaGVpZ2h0KTtcbiAgdGhpcy5yZW5kZXJlci5yZXNpemUoZ2FtZVZpZXcud2lkdGgsIGdhbWVWaWV3LmhlaWdodCk7XG4gIFxuICB3b3JsZDIuc2V0UGl4ZWxzUGVyTWV0ZXIoTWF0aC5mbG9vcihnYW1lVmlldy5oZWlnaHQgLyB3b3JsZC5oZWlnaHQpKTtcbn1cblxuR3JhcGhpY3NFbmdpbmUucHJvdG90eXBlLnJlbmRlciA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLnJlbmRlcmVyLnJlbmRlcih0aGlzLnN0YWdlKTtcbn07XG5cbkdyYXBoaWNzRW5naW5lLnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbihzcHJpdGUpIHtcbiAgdGhpcy5zdGFnZS5hZGRDaGlsZChzcHJpdGUpO1xufTtcblxuR3JhcGhpY3NFbmdpbmUucHJvdG90eXBlLnJlbW92ZSA9IGZ1bmN0aW9uKHNwcml0ZSkge1xuICB0aGlzLnN0YWdlLnJlbW92ZUNoaWxkKHNwcml0ZSk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEdyYXBoaWNzRW5naW5lO1xuIiwidmFyIHdvcmxkID0gcmVxdWlyZSgnLi93b3JsZCcpO1xuXG52YXIgZnJhbWVSYXRlICAgPSAxIC8gNjA7XG52YXIgaXRlcmF0aW9ucyAgPSAxMDtcblxudmFyIG5vcm1hbGlzZU5hbiA9IGZ1bmN0aW9uKG4pIHtcbiAgcmV0dXJuIG4gfHwgMFxufVxuXG52YXIgbm9ybWFsaXNlUG9pbnQgPSBmdW5jdGlvbihwKSB7XG4gIHJldHVybiB7IHg6IG5vcm1hbGlzZU5hbihwLngpLCB5OiBub3JtYWxpc2VOYW4ocC55KSB9XG59XG5cbmZ1bmN0aW9uIFBoeXNpY3NFbmdpbmUoZGVidWdDYW52YXMpIHtcbiAgXG4gIHRoaXMuY29sbGlzaW9uQ2FsbGJhY2sgPSBudWxsO1xuICB0aGlzLmIyd29ybGQgPSBuZXcgQm94MkQuRHluYW1pY3MuYjJXb3JsZChuZXcgQm94MkQuQ29tbW9uLk1hdGguYjJWZWMyKDAsIDApLCB0cnVlKTtcbiAgXG4gIHZhciBjb250YWN0TGlzdGVuZXIgPSBuZXcgQm94MkQuRHluYW1pY3MuYjJDb250YWN0TGlzdGVuZXI7XG4gIFxuICBjb250YWN0TGlzdGVuZXIuQmVnaW5Db250YWN0ID0gZnVuY3Rpb24oY29udGFjdCkge1xuICAgIHZhciB3b3JsZE1hbmlmb2xkID0gbmV3IEJveDJELkNvbGxpc2lvbi5iMldvcmxkTWFuaWZvbGQoKTtcbiAgICBjb250YWN0LkdldFdvcmxkTWFuaWZvbGQod29ybGRNYW5pZm9sZCk7XG4gICAgdmFyIGZpeHR1cmVBID0gY29udGFjdC5HZXRGaXh0dXJlQSgpO1xuICAgIHZhciBmaXh0dXJlQiA9IGNvbnRhY3QuR2V0Rml4dHVyZUIoKTtcbiAgICBpZiAodGhpcy5jb2xsaXNpb25DYWxsYmFjaykge1xuICAgICAgdGhpcy5jb2xsaXNpb25DYWxsYmFjayhmaXh0dXJlQSwgZml4dHVyZUIsIHdvcmxkTWFuaWZvbGQubV9wb2ludHMubWFwKG5vcm1hbGlzZVBvaW50KSk7XG4gICAgfVxuICB9LmJpbmQodGhpcyk7XG4gIFxuICB0aGlzLmIyd29ybGQuU2V0Q29udGFjdExpc3RlbmVyKGNvbnRhY3RMaXN0ZW5lcik7XG4gIFxuICBpZiAoZGVidWdDYW52YXMpIHtcbiAgICB0aGlzLmRlYnVnRHJhdyhkZWJ1Z0NhbnZhcyk7XG4gIH1cbn1cblxuUGh5c2ljc0VuZ2luZS5wcm90b3R5cGUuY3JlYXRlID0gZnVuY3Rpb24oYm9keURlZiwgZml4dHVyZURlZikge1xuICB2YXIgYm9keSA9IHRoaXMuYjJ3b3JsZC5DcmVhdGVCb2R5KGJvZHlEZWYpO1xuICBpZiAoZml4dHVyZURlZikge1xuICAgIGJvZHkuQ3JlYXRlRml4dHVyZShmaXh0dXJlRGVmKTsgICAgXG4gIH1cbiAgcmV0dXJuIGJvZHk7XG59O1xuXG5QaHlzaWNzRW5naW5lLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oYm9keSkge1xuICBib2R5LkdldEZpeHR1cmVMaXN0KCkuU2V0VXNlckRhdGEobnVsbCk7XG4gIHRoaXMuYjJ3b3JsZC5EZXN0cm95Qm9keShib2R5KTtcbn07XG5cblBoeXNpY3NFbmdpbmUucHJvdG90eXBlLmNvbGxpc2lvbiA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gIHRoaXMuY29sbGlzaW9uQ2FsbGJhY2sgPSBjYWxsYmFjaztcbn1cblxuUGh5c2ljc0VuZ2luZS5wcm90b3R5cGUuZGVidWdEcmF3ID0gZnVuY3Rpb24oY2FudmFzKSB7XG4gIHZhciBkZWJ1Z0RyYXcgPSBuZXcgQm94MkQuRHluYW1pY3MuYjJEZWJ1Z0RyYXcoKTtcbiAgZGVidWdEcmF3LlNldFNwcml0ZShjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpKTtcbiAgZGVidWdEcmF3LlNldERyYXdTY2FsZSh3b3JsZC5nZXRQaXhlbHNQZXJNZXRlcigpKTtcbiAgZGVidWdEcmF3LlNldEZpbGxBbHBoYSgwLjMpO1xuICBkZWJ1Z0RyYXcuU2V0TGluZVRoaWNrbmVzcygxLjApO1xuICBkZWJ1Z0RyYXcuU2V0RmxhZ3MoQm94MkQuRHluYW1pY3MuYjJEZWJ1Z0RyYXcuZV9zaGFwZUJpdCB8IEJveDJELkR5bmFtaWNzLmIyRGVidWdEcmF3LmVfam9pbnRCaXQpO1xuICB0aGlzLmIyd29ybGQuU2V0RGVidWdEcmF3KGRlYnVnRHJhdyk7XG59XG5cblBoeXNpY3NFbmdpbmUucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmIyd29ybGQuU3RlcChmcmFtZVJhdGUsIGl0ZXJhdGlvbnMsIGl0ZXJhdGlvbnMpO1xuICB0aGlzLmIyd29ybGQuRHJhd0RlYnVnRGF0YSgpO1xuICB0aGlzLmIyd29ybGQuQ2xlYXJGb3JjZXMoKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gUGh5c2ljc0VuZ2luZTtcbiIsInZhciBfICAgICA9IHJlcXVpcmUoJy4uLy4uLy4uLzNyZHBhcnR5L3VuZGVyc2NvcmUtbWluJyk7XG52YXIgaHViICAgPSByZXF1aXJlKCcuL2h1YicpO1xuXG5mdW5jdGlvbiBTb3VuZCgpIHtcbiAgXG4gIHZhciBjdXJyZW50ID0ge307XG4gIFxuICBmdW5jdGlvbiBwbGF5KGFyZ3MpIHtcbiAgICB2YXIgc291bmQgPSBuZXcgQXVkaW8oKTtcbiAgICBjdXJyZW50W2FyZ3MuZmlsZV0gPSBzb3VuZDtcbiAgICBzb3VuZC5zcmMgPSBhcmdzLmZpbGU7XG4gICAgaWYgKGFyZ3Mudm9sdW1lICE9PSB1bmRlZmluZWQpIHsgc291bmQudm9sdW1lID0gYXJncy52b2x1bWU7IH1cbiAgICBpZiAoYXJncy5sb29wKSAgICAgICAgICAgICAgICAgeyBzb3VuZC5sb29wID0gdHJ1ZTsgfVxuICAgIHNvdW5kLnBsYXkoKTtcbiAgICByZXR1cm4gc291bmQ7XG4gIH07XG4gXG4gIGZ1bmN0aW9uIHN0b3AoYXJncykge1xuICAgIGlmIChjdXJyZW50W2FyZ3MuZmlsZV0pIHtcbiAgICAgIGN1cnJlbnRbYXJncy5maWxlXS5wYXVzZSgpO1xuICAgICAgZGVsZXRlIGN1cnJlbnRbYXJncy5maWxlXTtcbiAgICB9XG4gIH1cbiBcbiAgaHViLm9uKCdlbmdpbmUuc291bmQucGxheScsIHBsYXkpO1xuICBodWIub24oJ2VuZ2luZS5zb3VuZC5zdG9wJywgc3RvcCk7XG4gIFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFNvdW5kO1xuIiwidmFyIF8gICAgICAgID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvdW5kZXJzY29yZS1taW4nKTtcbnZhciBodWIgICAgICA9IHJlcXVpcmUoJy4vaHViJyk7XG52YXIgRXhwbG9zaW9uID0gcmVxdWlyZSgnLi9leHBsb3Npb24nKVxuXG52YXIgUGFydGljbGVFbmdpbmUgPSBmdW5jdGlvbihlbmdpbmUpIHtcbiAgaHViLm9uKCdlbmdpbmUuZXhwbG9zaW9uJywgZnVuY3Rpb24ocGFyYW1zKSB7XG4gICAgZW5naW5lLmFkZEVudGl0eShFeHBsb3Npb25bcGFyYW1zLnNpemUgfHwgJ3NtYWxsJ10ocGFyYW1zLnNvdXJjZSkpXG4gIH0pXG4gIFxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBQYXJ0aWNsZUVuZ2luZTtcbiIsInZhciBfID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvdW5kZXJzY29yZS1taW4nKTtcblxuZnVuY3Rpb24gU2VxdWVuY2VyKGVuZ2luZSwgZ2FtZSwgc3RhdGVzLCB0cmFuc2l0aW9ucykge1xuICAgIFxuICB2YXIgc3RhdGVzID0gXy5yZWR1Y2Uoc3RhdGVzLCBmdW5jdGlvbihhY2MsIGZuLCBrZXkpIHtcbiAgICBhY2Nba2V5XSA9IG5ldyBmbihlbmdpbmUsIGdhbWUpO1xuICAgIHJldHVybiBhY2M7XG4gIH0sIHt9KTtcbiAgXG4gIHZhciB0aGF0ID0gdGhpcztcbiAgdGhpcy5hY3RpdmVTdGF0ZSA9IG51bGw7XG4gIFxuICB0aGlzLmZzbSA9IHdpbmRvdy5TdGF0ZU1hY2hpbmUuY3JlYXRlKHtcbiAgXG4gICAgZXZlbnRzOiB0cmFuc2l0aW9ucyxcbiAgXG4gICAgY2FsbGJhY2tzOiB7XG4gICAgICBvbmVudGVyc3RhdGU6IGZ1bmN0aW9uKHRyYW5zaXRpb24sIHN0YXJ0LCBlbmQsIGFyZ3MpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ1tzZXF1ZW5jZXJdICcgKyBzdGFydCArICcgKyAnICsgdHJhbnNpdGlvbiArICcgPSAnICsgZW5kKTtcbiAgICAgICAgc3RhdGVzW3N0YXJ0XSAmJiBzdGF0ZXNbc3RhcnRdLmV4aXQoKTtcbiAgICAgICAgc3RhdGVzW2VuZF0gICAmJiBzdGF0ZXNbZW5kXS5lbnRlcihhcmdzKTtcbiAgICAgICAgdGhhdC5hY3RpdmVTdGF0ZSA9IHN0YXRlc1tlbmRdO1xuICAgICAgfVxuICAgIH0sXG4gICAgXG4gICAgLy8gZXJyb3I6IGZ1bmN0aW9uKGV2ZW50TmFtZSwgZnJvbSwgdG8sIGFyZ3MsIGVycm9yQ29kZSwgZXJyb3JNZXNzYWdlKSB7XG4gICAgLy8gICBpZiAoZXJyb3JDb2RlID09PSBTdGF0ZU1hY2hpbmUuRXJyb3IuSU5WQUxJRF9DQUxMQkFDSykge1xuICAgIC8vICAgICB0aHJvdyBlcnJvck1lc3NhZ2U7XG4gICAgLy8gICB9IGVsc2Uge1xuICAgIC8vICAgICBjb25zb2xlLmxvZygnW3NlcXVlbmNlcl0gJyArIGV2ZW50TmFtZSArICcgOiAnICsgZXJyb3JNZXNzYWdlKTtcbiAgICAvLyAgIH1cbiAgICAvLyB9LFxuICBcbiAgfSk7XG4gIFxufVxuXG5TZXF1ZW5jZXIucHJvdG90eXBlLnN0YXJ0ID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuZnNtLnN0YXJ0dXAoKTtcbn07XG5cblNlcXVlbmNlci5wcm90b3R5cGUudHJhbnNpdGlvbiA9IGZ1bmN0aW9uKHRyYW5zLCBhcmdzKSB7XG4gIHRoaXMuZnNtW3RyYW5zXShhcmdzKTtcbn07XG5cblNlcXVlbmNlci5wcm90b3R5cGUuYWN0aXZlID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmFjdGl2ZVN0YXRlO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBTZXF1ZW5jZXI7XG4iLCJ2YXIgUEYgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvcGh5c2ljcy1mYWN0b3J5Jyk7XG52YXIgR0YgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZ3JhcGhpY3MtZmFjdG9yeScpO1xudmFyIEVudGl0eSAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2VudGl0eScpO1xudmFyIHdvcmxkICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL3dvcmxkJyk7XG52YXIgbWF0aFV0aWxzICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvbWF0aC11dGlscycpO1xudmFyIGh1YiAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2h1YicpO1xudmFyIE1hdGhVdGlscyAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL21hdGgtdXRpbHMnKVxudmFyIGFzc2V0cyAgICAgID0gcmVxdWlyZSgnLi4vLi4vYXNzZXRzJyk7XG5cbnZhciBiYWxsU2l6ZSA9IDI7XG5cbnZhciBmaXh0dXJlID0gUEYuZml4dHVyZSh7XG4gIHNoYXBlOiAgICAgIFBGLnNoYXBlLmNpcmNsZShiYWxsU2l6ZSAvIDIpLFxuICBkeW5hbWljczogICB7ZGVuc2l0eTogMSwgZnJpY3Rpb246IDEsIHJlc3RpdHV0aW9uOiAxfSxcbiAgY2F0ZWdvcnk6ICAgUEYuY2F0ZWdvcmllcy5CQUxMLFxuICBjb2xsaXNpb246ICBQRi5jYXRlZ29yaWVzLkFSRU5BIHwgUEYuY2F0ZWdvcmllcy5QTEFZRVIgfCBQRi5jYXRlZ29yaWVzLkJBTExcbn0pO1xuXG5mdW5jdGlvbiBCYWxsKGlkLCB4LCB5KSB7XG4gIHRoaXMuaWQgPSBpZDtcblxuICB0aGlzLmJvZHlTcGVjID0ge1xuICAgIGJvZHk6IFBGLmR5bmFtaWMoe3g6IHgsIHk6IHl9KSxcbiAgICBmaXh0dXJlOiBmaXh0dXJlXG4gIH07XG5cbiAgdGhpcy5zcHJpdGUgPSBHRi5zcHJpdGUoYXNzZXRzLmltYWdlKCdiYWxsJyksIGJhbGxTaXplLCBiYWxsU2l6ZSk7XG59O1xuXG5CYWxsLnByb3RvdHlwZSA9IG5ldyBFbnRpdHkoKTtcblxuQmFsbC5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lLCBkZWx0YSkgeyAgXG4gIEVudGl0eS5wcm90b3R5cGUudXBkYXRlLmNhbGwodGhpcywgZGVsdGEpO1xuICBtYXRoVXRpbHMuY2xhbXBYVmVsb2NpdHkodGhpcy5ib2R5LCAyOCwgMzgpO1xuICBtYXRoVXRpbHMuY2xhbXBZVmVsb2NpdHkodGhpcy5ib2R5LCAxNSwgMjMpO1xuICB0aGlzLmJvZHkuU2V0QW5ndWxhckRhbXBpbmcoMS41KTtcbiAgXG4gIC8vIFdlIHNob3VsZCBiZSBhYmxlIHRvIHNwZWNpZnkgXCIwLjVcIiwgYW5kIG5vdCBoYXZlIHRvIHVwZGF0ZSBpdCBjb25zdGFudGx5XG4gIC8vIE5lZWQgdG8gY2hlY2sgb3VyIGNoYW5nZXMgdG8gUElYSVxuICB0aGlzLnNwcml0ZS5hbmNob3IueCA9IHRoaXMuc3ByaXRlLnRleHR1cmUud2lkdGggIC8gMjtcbiAgdGhpcy5zcHJpdGUuYW5jaG9yLnkgPSB0aGlzLnNwcml0ZS50ZXh0dXJlLmhlaWdodCAvIDI7XG59O1xuXG5CYWxsLnByb3RvdHlwZS5raWNrID0gZnVuY3Rpb24oZGlyZWN0aW9uKSB7XG4gIHRoaXMuYm9keS5TZXRBd2FrZSh0cnVlKTtcbiAgdGhpcy5ib2R5LlNldExpbmVhclZlbG9jaXR5KG5ldyBCb3gyRC5Db21tb24uTWF0aC5iMlZlYzIoMjUgKiBkaXJlY3Rpb24sIE1hdGhVdGlscy5yYW5kb21CZXR3ZWVuKDEsIDYpKSk7XG4gIHRoaXMuYm9keS5TZXRBbmd1bGFyVmVsb2NpdHkoTWF0aFV0aWxzLnJhbmRvbUJldHdlZW4oNCwgMTApKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBCYWxsO1xuIiwidmFyIEdGID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2dyYXBoaWNzLWZhY3RvcnknKTtcbnZhciBFbnRpdHkgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZW50aXR5Jyk7XG52YXIgdXNlckludGVyZmFjZSA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS91c2VyLWludGVyZmFjZScpO1xuXG5mdW5jdGlvbiBBY3Rpb25UZXh0KGlkLCB0ZXh0KSB7XG4gIFxuICB0aGlzLmlkID0gaWQ7XG4gIHRoaXMuc3ByaXRlID0gR0YudGV4dCh0ZXh0LCA2NSwge1xuICAgIHN0cm9rZVRoaWNrbmVzczogNFxuICB9KTtcbiAgXG4gIHRoaXMuc3ByaXRlLnBvc2l0aW9uLnggPSB1c2VySW50ZXJmYWNlLndpZHRoICAvIDIgLSB0aGlzLnNwcml0ZS53aWR0aCAgLyAyO1xuICB0aGlzLnNwcml0ZS5wb3NpdGlvbi55ID0gdXNlckludGVyZmFjZS5oZWlnaHQgLyAyIC0gdGhpcy5zcHJpdGUuaGVpZ2h0IC8gMjtcbiAgXG59O1xuXG5BY3Rpb25UZXh0LnByb3RvdHlwZSA9IG5ldyBFbnRpdHkoKTtcblxuQWN0aW9uVGV4dC5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24odGV4dCkge1xuICB0aGlzLnNwcml0ZS5zZXRUZXh0KHRleHQpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBBY3Rpb25UZXh0O1xuIiwiLy8gcmVzZXQgcGxheWVycyBwb3Ncbi8vIGNhbiBtb3ZlLCBidXQgbm8gYmFsbFxuXG52YXIgR0YgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZ3JhcGhpY3MtZmFjdG9yeScpO1xudmFyIFN0YWRpdW0gICAgID0gcmVxdWlyZSgnLi4vZW50aXRpZXMvc3RhZGl1bScpO1xudmFyIENyb3dkICAgICAgID0gcmVxdWlyZSgnLi4vZW50aXRpZXMvY3Jvd2QnKTtcbnZhciBQbGF5ZXIgICAgICA9IHJlcXVpcmUoJy4uL2VudGl0aWVzL3BsYXllcicpO1xudmFyIEh1ZCAgICAgICAgID0gcmVxdWlyZSgnLi4vZW50aXRpZXMvaHVkJyk7XG52YXIgQWN0aW9uVGV4dCAgPSByZXF1aXJlKCcuLi9lbnRpdGllcy9hY3Rpb24tdGV4dCcpO1xudmFyIHdvcmxkICAgICAgID0gcmVxdWlyZSgnLi4vd29ybGQnKTtcblxuZnVuY3Rpb24gV2FybVVwKGVuZ2luZSwgZ2FtZSkge1xuXG4gIHZhciBzdGFydGluZ1BvcyA9IFtcbiAgICB3b3JsZC53aWR0aCAvIDgsXG4gICAgd29ybGQud2lkdGggLSB3b3JsZC53aWR0aCAvIDhcbiAgXTtcbiAgXG4gIHRoaXMuZW50ZXIgPSBmdW5jdGlvbigpIHtcblxuICAgIHZhciBwMSA9IG5ldyBQbGF5ZXIoJ3AxJywgMCwgZ2FtZS5wbGF5ZXJzWzBdLm5hbWUsIHN0YXJ0aW5nUG9zWzBdLCB3b3JsZC5oZWlnaHQgLyAyKTtcbiAgICB2YXIgcDIgPSBuZXcgUGxheWVyKCdwMicsIDEsIGdhbWUucGxheWVyc1sxXS5uYW1lLCBzdGFydGluZ1Bvc1sxXSwgd29ybGQuaGVpZ2h0IC8gMik7XG4gICAgXG4gICAgZW5naW5lLmFkZEVudGl0eShuZXcgU3RhZGl1bSgpKTtcbiAgICBlbmdpbmUuYWRkRW50aXR5KG5ldyBDcm93ZCgpKTtcbiAgICBlbmdpbmUuYWRkRW50aXR5KHAxKTtcbiAgICBlbmdpbmUuYWRkRW50aXR5KHAyKTtcbiAgICBlbmdpbmUuYWRkRW50aXR5KG5ldyBIdWQoKSk7XG4gICAgZW5naW5lLmFkZEVudGl0eShuZXcgQWN0aW9uVGV4dCgnZ2V0LXJlYWR5JywgJ0dFVCBSRUFEWSEnKSk7XG5cbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgZ2FtZS50cmFuc2l0aW9uKCdyZWFkeScsIDApO1xuICAgIH0sIDIwMDApOyAgICBcblxuICB9O1xuICBcbiAgdGhpcy5leGl0ID0gZnVuY3Rpb24oKSB7XG4gICAgZW5naW5lLmRlbGV0ZUVudGl0eSgnZ2V0LXJlYWR5Jyk7XG4gIH07XG4gIFxuICB0aGlzLnVwZGF0ZSA9IGZ1bmN0aW9uKGRlbHRhKSB7XG4gIH07XG4gIFxuICB0aGlzLm9uID0gZnVuY3Rpb24obWVzc2FnZSwgYXJncykge1xuICB9O1xuICBcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBXYXJtVXA7XG4iLCJ2YXIgXyAgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi8uLi8uLi8zcmRwYXJ0eS91bmRlcnNjb3JlLW1pbicpO1xudmFyIEdGICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2dyYXBoaWNzLWZhY3RvcnknKTtcbnZhciBodWIgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9odWInKTtcbnZhciBCYWxsICAgICAgICA9IHJlcXVpcmUoJy4uL2VudGl0aWVzL2JhbGwnKTtcbnZhciBBY3Rpb25UZXh0ICA9IHJlcXVpcmUoJy4uL2VudGl0aWVzL2FjdGlvbi10ZXh0Jyk7XG52YXIgd29ybGQgICAgICAgPSByZXF1aXJlKCcuLi93b3JsZCcpO1xuXG5mdW5jdGlvbiBLaWNrT2ZmKGVuZ2luZSwgZ2FtZSkge1xuICB2YXIgdGV4dCA9IG51bGw7XG4gIHZhciBmaXJzdEJhbGwgPSBudWxsXG4gIHZhciBiYWxsRGlyZWN0aW9uID0gbnVsbFxuICBcbiAgdGhpcy5lbnRlciA9IGZ1bmN0aW9uKGxhc3RTY29yaW5nUGxheWVySWQpIHtcbiAgICB2YXIgcGl0Y2hQb3NpdGlvbiA9IChsYXN0U2NvcmluZ1BsYXllcklkID09PSAwKSA/IC0xIDogMVxuICAgIGJhbGxEaXJlY3Rpb24gPSBwaXRjaFBvc2l0aW9uICogLTFcbiAgICBnYW1lLmNsZWFyQmFsbHMoKVxuICAgIGZpcnN0QmFsbCA9IGdhbWUuY3JlYXRlQmFsbChwaXRjaFBvc2l0aW9uLCAwKVxuXG4gICAgdGV4dCA9IG5ldyBBY3Rpb25UZXh0KCdjb3VudGRvd24nLCAnJyk7XG4gICAgZW5naW5lLmFkZEVudGl0eSh0ZXh0KTtcbiAgICBjb3VudGRvd24oMyk7XG4gIH07XG4gIFxuICB0aGlzLmV4aXQgPSBmdW5jdGlvbigpIHtcbiAgfTtcbiAgXG4gIHRoaXMudXBkYXRlID0gZnVuY3Rpb24oZGVsdGEpIHtcbiAgfTtcbiAgXG4gIHRoaXMub24gPSBmdW5jdGlvbihtZXNzYWdlLCBhcmdzKSB7XG4gIH07XG4gIFxuICBmdW5jdGlvbiBjb3VudGRvd24odmFsKSB7XG4gICAgaWYgKHZhbCA9PSAwKSB7XG4gICAgICBnbygpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0ZXh0LnNldCh2YWwudG9TdHJpbmcoKSk7XG4gICAgICBzZXRUaW1lb3V0KF8ucGFydGlhbChjb3VudGRvd24sIC0tdmFsKSwgNjAwKTtcbiAgICB9XG4gIH1cbiAgXG4gIGZ1bmN0aW9uIGdvKCkge1xuICAgIGh1Yi5zZW5kKCdlbmdpbmUuc291bmQucGxheScsIHtmaWxlOiAnL2dhbWUvc291bmRzL3doaXN0bGUubXAzJ30pO1xuICAgIGVuZ2luZS5kZWxldGVFbnRpdHkoJ2NvdW50ZG93bicpO1xuXG4gICAgZmlyc3RCYWxsLmtpY2soYmFsbERpcmVjdGlvbilcbiAgICBnYW1lLnRyYW5zaXRpb24oJ2dvJyk7XG4gIH1cbiAgXG59XG5cbm1vZHVsZS5leHBvcnRzID0gS2lja09mZjtcbiIsInZhciBUaW1lQmFzZWRNZXNzYWdlICA9IHJlcXVpcmUoJy4uL3RpbWUtYmFzZWQtbWVzc2FnZScpO1xudmFyIG1hdGhVdGlscyAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL21hdGgtdXRpbHMnKTtcblxuZnVuY3Rpb24gUGxheShlbmdpbmUsIGdhbWUpIHtcbiAgXG4gIHZhciBtdWx0aUJhbGwgICAgICAgPSBuZXcgVGltZUJhc2VkTWVzc2FnZSgxNTAwMCwgJ2dhbWUubXVsdGliYWxsJyk7XG4gIHZhciBlbmRPZk1hdGNoICAgICAgPSBuZXcgVGltZUJhc2VkTWVzc2FnZSgwLCAnZ2FtZS5lbmQnKTtcbiAgXG4gIHRoaXMuZW50ZXIgPSBmdW5jdGlvbigpIHtcbiAgfTtcbiAgXG4gIHRoaXMuZXhpdCA9IGZ1bmN0aW9uKCkge1xuICB9O1xuICBcbiAgdGhpcy51cGRhdGUgPSBmdW5jdGlvbihkZWx0YSkge1xuICAgIGdhbWUudGltZVJlbWFpbmluZyA9IE1hdGgubWF4KGdhbWUudGltZVJlbWFpbmluZyAtIGRlbHRhLCAwKTtcbiAgICBtdWx0aUJhbGwudXBkYXRlKGdhbWUudGltZVJlbWFpbmluZyk7XG4gICAgZW5kT2ZNYXRjaC51cGRhdGUoZ2FtZS50aW1lUmVtYWluaW5nKTtcbiAgfTtcbiAgXG4gIHRoaXMub24gPSBmdW5jdGlvbihtZXNzYWdlLCBhcmdzKSB7XG4gIH07XG4gIFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFBsYXk7XG4iLCJ2YXIgQm9vbSAgICAgICA9IHJlcXVpcmUoJy4uL2VudGl0aWVzL2Jvb20nKTtcbnZhciBBY3Rpb25UZXh0ID0gcmVxdWlyZSgnLi4vZW50aXRpZXMvYWN0aW9uLXRleHQnKTtcbnZhciBodWIgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2h1YicpO1xuXG5mdW5jdGlvbiBTY29yZWQoZW5naW5lLCBnYW1lKSB7XG4gIFxuICB0aGlzLmVudGVyID0gZnVuY3Rpb24oZGF0YSkge1xuICAgIGVuZ2luZS5nZXRFbnRpdHkoJ3N0YWRpdW0nKS5zaGFrZShkYXRhLmFnYWluc3RJbmRleCk7XG4gICAgZW5naW5lLmFkZEVudGl0eShuZXcgQm9vbSgnYm9vbScgKyBkYXRhLmJhbGwuaWQsIGRhdGEuYWdhaW5zdEluZGV4KSk7XG4gICAgZ2FtZS5yZW1vdmVCYWxsKGRhdGEuYmFsbCk7XG4gICAgXG4gICAgaWYgKGdhbWUuYmFsbHNJblBsYXkubGVuZ3RoID49IDEpIHtcbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgIGdhbWUudHJhbnNpdGlvbignZ28nKTtcbiAgICAgIH0sIDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICBnYW1lLnRyYW5zaXRpb24oJ3JlYWR5JywgZGF0YS5hZ2FpbnN0SW5kZXgpO1xuICAgICAgfSwgMSk7XG4gICAgfVxuICAgIFxuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICBlbmdpbmUuZGVsZXRlRW50aXR5KCdib29tJyArIGRhdGEuYmFsbC5pZCk7XG4gICAgfSwgNDAwKTtcbiAgfTtcbiAgXG4gIHRoaXMuZXhpdCA9IGZ1bmN0aW9uKCkge1xuICB9O1xuICBcbiAgdGhpcy51cGRhdGUgPSBmdW5jdGlvbihkZWx0YSkge1xuICB9O1xuICBcbiAgdGhpcy5vbiA9IGZ1bmN0aW9uKG1lc3NhZ2UsIGFyZ3MpIHtcbiAgfTtcbiAgXG59XG5cbm1vZHVsZS5leHBvcnRzID0gU2NvcmVkO1xuIiwidmFyIFdpbm5lciAgPSByZXF1aXJlKCcuLi9lbnRpdGllcy93aW5uZXInKTtcbnZhciBodWIgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2h1YicpO1xuXG5mdW5jdGlvbiBFbmRPZk1hdGNoKGVuZ2luZSwgZ2FtZSkge1xuICBcbiAgdGhpcy5lbnRlciA9IGZ1bmN0aW9uKCkge1xuICAgIGVuZ2luZS5kZWxldGVFbnRpdHlNYXRjaGluZygvXmJhbGw6Lyk7XG4gICAgZW5naW5lLmFkZEVudGl0eShuZXcgV2lubmVyKCd3aW5uZXInLCBnYW1lLnBsYXllcnNbMF0sIGdhbWUucGxheWVyc1sxXSkpO1xuICAgIHNldFRpbWVvdXQoZmluaXNoLCA0MDAwKTtcbiAgfTtcbiAgXG4gIHRoaXMuZXhpdCA9IGZ1bmN0aW9uKCkge1xuICB9O1xuICBcbiAgdGhpcy51cGRhdGUgPSBmdW5jdGlvbihkZWx0YSkge1xuICB9O1xuXG4gIHRoaXMub24gPSBmdW5jdGlvbihtZXNzYWdlLCBhcmdzKSB7XG4gIH07XG4gIFxuICBmdW5jdGlvbiBmaW5pc2goKSB7XG4gICAgaHViLnNlbmQoJ2dhbWUuZmluaXNoJyk7XG4gIH1cbiAgXG59XG5cbm1vZHVsZS5leHBvcnRzID0gRW5kT2ZNYXRjaDtcbiIsInZhciBFbnRpdHkgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2VudGl0eScpXG52YXIgR0YgICAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9ncmFwaGljcy1mYWN0b3J5Jyk7XG52YXIgdXNlckludGVyZmFjZSA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS91c2VyLWludGVyZmFjZScpO1xudmFyIGFzc2V0cyAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9hc3NldHMnKTtcblxudmFyIGZvcm1hdEFzUmFuayA9IGZ1bmN0aW9uKG51bSkge1xuICBpZiAobnVtID09PSAxKSB7XG4gICAgcmV0dXJuIG51bSArICdzdCdcbiAgfSBlbHNlIGlmIChudW0gPT09IDIpIHtcbiAgICByZXR1cm4gbnVtICsgJ25kJ1xuICB9IGVsc2UgaWYgKG51bSA9PT0gMykge1xuICAgIHJldHVybiBudW0gKyAncmQnXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG51bSArICd0aCdcbiAgfVxufVxuXG5mdW5jdGlvbiBMZWFkZXJib2FyZChpZCkge1xuICB2YXIgRGVmYXVsdFRleHRPcHRpb25zID0ge1xuICAgIHN0cm9rZVRoaWNrbmVzczogdXNlckludGVyZmFjZS51bml0KDAuNCksXG4gICAgZmlsbDogJyMwMTUxOGQnXG4gIH1cbiAgdmFyIERlZmF1bHRGb250U2l6ZSA9IHVzZXJJbnRlcmZhY2UudW5pdCg0KVxuXG4gIHRoaXMuaWQgPSBpZDtcbiAgdGhpcy5wbGF5ZXJzID0gW11cbiAgXG4gICQuYWpheCh7XG4gICAgdXJsOiAnL3BsYXllcicsXG4gICAgYXN5bmM6IGZhbHNlLFxuICAgIHN1Y2Nlc3M6IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgIHRoaXMucGxheWVycyA9IGRhdGEuc29ydChmdW5jdGlvbih4LHkpIHtcbiAgICAgICAgcmV0dXJuIHkudG9wU2NvcmUgLSB4LnRvcFNjb3JlXG4gICAgICB9KS5zbGljZSgwLCA1KVxuICAgIH0uYmluZCh0aGlzKVxuICB9KVxuXG4gIHRoaXMuc3ByaXRlcyA9IFtcbiAgICBHRi51aVNwcml0ZShhc3NldHMuaW1hZ2UoJ2ludHJvLWxlYWRlcmJvYXJkJyksIHVzZXJJbnRlcmZhY2Uud2lkdGgsIHVzZXJJbnRlcmZhY2UuaGVpZ2h0KVxuICBdO1xuXG4gIHZhciBjdXJyZW50WSA9IHVzZXJJbnRlcmZhY2UudW5pdCgxOS40KVxuICB2YXIgaSA9IDFcblxuICB0aGlzLnBsYXllcnMuZm9yRWFjaChmdW5jdGlvbihwbGF5ZXIpIHtcbiAgICB2YXIgcmFua1Nwcml0ZSA9IEdGLnRleHQoZm9ybWF0QXNSYW5rKGkpLCBEZWZhdWx0Rm9udFNpemUsIERlZmF1bHRUZXh0T3B0aW9ucylcbiAgICByYW5rU3ByaXRlLnBvc2l0aW9uLnkgPSBjdXJyZW50WVxuICAgIHJhbmtTcHJpdGUucG9zaXRpb24ueCA9IHVzZXJJbnRlcmZhY2UudW5pdCg1KVxuICAgIHRoaXMuc3ByaXRlcy5wdXNoKHJhbmtTcHJpdGUpXG5cbiAgICB2YXIgcGxheWVyTmFtZVNwcml0ZSA9IEdGLnRleHQoKHBsYXllci5maXJzdE5hbWUgKyAnICcgKyBwbGF5ZXIubGFzdE5hbWUuc3Vic3RyaW5nKDAsIDEpKS50b1VwcGVyQ2FzZSgpLCBEZWZhdWx0Rm9udFNpemUsICQuZXh0ZW5kKHt9LCBEZWZhdWx0VGV4dE9wdGlvbnMsIHsgZmlsbDogJyNiZjAwMDAnIH0pKVxuICAgIHBsYXllck5hbWVTcHJpdGUucG9zaXRpb24ueCA9IHVzZXJJbnRlcmZhY2UudW5pdCgxOClcbiAgICBwbGF5ZXJOYW1lU3ByaXRlLnBvc2l0aW9uLnkgPSBjdXJyZW50WVxuICAgIHRoaXMuc3ByaXRlcy5wdXNoKHBsYXllck5hbWVTcHJpdGUpXG5cbiAgICB2YXIgY29tcGFueVNwcml0ZSA9IEdGLnRleHQoKHBsYXllci5jb21wYW55IHx8ICcnKS50b1VwcGVyQ2FzZSgpLCB1c2VySW50ZXJmYWNlLnVuaXQoMyksICQuZXh0ZW5kKHt9LCBEZWZhdWx0VGV4dE9wdGlvbnMsIHsgc3Ryb2tlVGhpY2tuZXNzOiB1c2VySW50ZXJmYWNlLnVuaXQoMC40KSB9KSlcbiAgICBjb21wYW55U3ByaXRlLnBvc2l0aW9uLnggPSBwbGF5ZXJOYW1lU3ByaXRlLnBvc2l0aW9uLnggKyBwbGF5ZXJOYW1lU3ByaXRlLndpZHRoICsgdXNlckludGVyZmFjZS51bml0KDIpXG4gICAgY29tcGFueVNwcml0ZS5wb3NpdGlvbi55ID0gY3VycmVudFkgKyB1c2VySW50ZXJmYWNlLnVuaXQoMC42KVxuICAgIHRoaXMuc3ByaXRlcy5wdXNoKGNvbXBhbnlTcHJpdGUpXG5cbiAgICB2YXIgc2NvcmVTcHJpdGUgPSBHRi50ZXh0KHBsYXllci50b3BTY29yZSArICcgR09BTFMnLCBEZWZhdWx0Rm9udFNpemUsIERlZmF1bHRUZXh0T3B0aW9ucylcbiAgICBzY29yZVNwcml0ZS5wb3NpdGlvbi54ID0gdXNlckludGVyZmFjZS53aWR0aCAtIHNjb3JlU3ByaXRlLndpZHRoIC0gdXNlckludGVyZmFjZS51bml0KDUpXG4gICAgc2NvcmVTcHJpdGUucG9zaXRpb24ueSA9IGN1cnJlbnRZXG4gICAgdGhpcy5zcHJpdGVzLnB1c2goc2NvcmVTcHJpdGUpXG4gICAgXG4gICAgY3VycmVudFkgKz0gcGxheWVyTmFtZVNwcml0ZS5oZWlnaHQgKyB1c2VySW50ZXJmYWNlLnVuaXQoMi4zKTtcbiAgICBpICs9IDFcbiAgfS5iaW5kKHRoaXMpKVxufVxuXG5MZWFkZXJib2FyZC5wcm90b3R5cGUgPSBuZXcgRW50aXR5KCk7XG5cbkxlYWRlcmJvYXJkLnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgdGhpcy5zcHJpdGVzLmZvckVhY2goZnVuY3Rpb24oc3ByaXRlKSB7XG4gICAgZW5naW5lLmdyYXBoaWNzLmFkZChzcHJpdGUpO1xuICB9KVxufTtcblxuTGVhZGVyYm9hcmQucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgdGhpcy5zcHJpdGVzLmZvckVhY2goZnVuY3Rpb24oc3ByaXRlKSB7XG4gICAgZW5naW5lLmdyYXBoaWNzLnJlbW92ZShzcHJpdGUpO1xuICB9KVxufTtcblxuTGVhZGVyYm9hcmQucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKCkge31cblxubW9kdWxlLmV4cG9ydHMgPSBMZWFkZXJib2FyZCIsInZhciBFbnRpdHkgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2VudGl0eScpXG52YXIgR0YgICAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9ncmFwaGljcy1mYWN0b3J5Jyk7XG52YXIgdXNlckludGVyZmFjZSA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS91c2VyLWludGVyZmFjZScpO1xudmFyIGFzc2V0cyAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9hc3NldHMnKTtcblxuZnVuY3Rpb24gVGl0bGUoaWQpIHtcbiAgXG4gIHRoaXMuaWQgPSBpZDtcbiAgdGhpcy5zcHJpdGUgPSBHRi51aVNwcml0ZShhc3NldHMuaW1hZ2UoJ2ludHJvLXRpdGxlJyksIHVzZXJJbnRlcmZhY2Uud2lkdGgsIHVzZXJJbnRlcmZhY2UuaGVpZ2h0KTtcblxufTtcblxuVGl0bGUucHJvdG90eXBlID0gbmV3IEVudGl0eSgpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFRpdGxlO1xuIiwidmFyIEVudGl0eSAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZW50aXR5JylcbnZhciBHRiAgICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2dyYXBoaWNzLWZhY3RvcnknKTtcbnZhciB1c2VySW50ZXJmYWNlID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL3VzZXItaW50ZXJmYWNlJyk7XG52YXIgYXNzZXRzICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2Fzc2V0cycpO1xuXG52YXIgUkVEICA9ICcjYmYwMDAwJztcbnZhciBCTFVFID0gJyMwMTUxOGQnO1xuXG5mdW5jdGlvbiBBYm91dChpZCkge1xuICBcbiAgdGhpcy5pZCA9IGlkO1xuXG4gIGNvbnNvbGUubG9nKHVzZXJJbnRlcmZhY2UudW5pdCgxKSk7XG4gIHRoaXMuc3ByaXRlcyA9IFtcbiAgICBHRi51aVNwcml0ZShhc3NldHMuaW1hZ2UoJ2ludHJvLWFib3V0JyksIHVzZXJJbnRlcmZhY2Uud2lkdGgsIHVzZXJJbnRlcmZhY2UuaGVpZ2h0KSxcbiAgICB0ZXh0KCdCdWlsdCBpbiA0IHdlZWtzICAoYWZ0ZXIgaG91cnMpJywgQkxVRSwgNywgMTMuNSksXG4gICAgdGV4dCgnSmF2YXNjcmlwdCcsIFJFRCwgNywgMjYuNSksXG4gICAgdGV4dCgnV2ViR0wnLCBCTFVFLCAzMywgMjYuNSksXG4gICAgdGV4dCgnTm9kZS5qcycsIFJFRCwgNDksIDI2LjUpLFxuICAgIHRleHQoJ1dlYiBzb2NrZXRzJywgQkxVRSwgNjgsIDI2LjUpLFxuICAgIHRleHQoJ0FzayB1cyBhYm91dCcsIEJMVUUsIDcsIDM5LjUpLFxuICAgIHRleHQoJ3dlYicsIFJFRCwgMzQsIDM5LjUpLFxuICAgIHRleHQoJyYnLCBCTFVFLCA0NCwgMzkuNSksXG4gICAgdGV4dCgnbW9iaWxlJywgUkVELCA0OSwgMzkuNSksXG4gICAgdGV4dCgnIScsIEJMVUUsIDY0LCAzOS41KVxuICBdO1xuXG59O1xuXG5BYm91dC5wcm90b3R5cGUgPSBuZXcgRW50aXR5KCk7XG5cbkFib3V0LnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgdGhpcy5zcHJpdGVzLmZvckVhY2goZnVuY3Rpb24oc3ByaXRlKSB7XG4gICAgZW5naW5lLmdyYXBoaWNzLmFkZChzcHJpdGUpO1xuICB9KVxufTtcblxuQWJvdXQucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgdGhpcy5zcHJpdGVzLmZvckVhY2goZnVuY3Rpb24oc3ByaXRlKSB7XG4gICAgZW5naW5lLmdyYXBoaWNzLnJlbW92ZShzcHJpdGUpO1xuICB9KVxufTtcblxuZnVuY3Rpb24gdGV4dChzdHIsIGNvbG9yLCB4LCB5KSB7XG4gIHZhciBzcHJpdGUgPSBHRi50ZXh0KHN0ciwgdXNlckludGVyZmFjZS51bml0KDMuOCksIHtcbiAgICBmaWxsOiBjb2xvcixcbiAgICBzdHJva2VUaGlja25lc3M6IHVzZXJJbnRlcmZhY2UudW5pdCgwLjQpXG4gIH0pO1xuICBzcHJpdGUucG9zaXRpb24ueCA9IHVzZXJJbnRlcmZhY2UudW5pdCh4KTtcbiAgc3ByaXRlLnBvc2l0aW9uLnkgPSB1c2VySW50ZXJmYWNlLnVuaXQoeSk7XG4gIHJldHVybiBzcHJpdGU7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQWJvdXQ7XG4iLCJ2YXIgRW50aXR5ICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9lbnRpdHknKVxudmFyIEdGICAgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZ3JhcGhpY3MtZmFjdG9yeScpO1xudmFyIHVzZXJJbnRlcmZhY2UgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvdXNlci1pbnRlcmZhY2UnKTtcbnZhciBhc3NldHMgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vYXNzZXRzJyk7XG5cbmZ1bmN0aW9uIFR3TG9nbyhpZCkge1xuICBcbiAgdGhpcy5pZCA9IGlkO1xuICB0aGlzLnNwcml0ZSA9IEdGLnVpU3ByaXRlKGFzc2V0cy5pbWFnZSgnaW50cm8tdHcnKSwgdXNlckludGVyZmFjZS53aWR0aCwgdXNlckludGVyZmFjZS5oZWlnaHQpO1xuXG59O1xuXG5Ud0xvZ28ucHJvdG90eXBlID0gbmV3IEVudGl0eSgpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFR3TG9nbztcbiIsIlxuZXhwb3J0cy53aWR0aCAgPSAwO1xuZXhwb3J0cy5oZWlnaHQgPSAwO1xuXG5leHBvcnRzLnJlc2l6ZSA9IGZ1bmN0aW9uKHcsIGgpIHtcbiAgZXhwb3J0cy53aWR0aCAgPSB3O1xuICBleHBvcnRzLmhlaWdodCA9IGg7XG59O1xuXG5leHBvcnRzLnVuaXQgPSBmdW5jdGlvbihuKSB7XG4gIHJldHVybiAoZXhwb3J0cy53aWR0aCAvIDEwMCkgKiBuXG59IiwiXG52YXIgcGl4ZWxzUGVyTWV0ZXIgPSAxNjtcblxuZXhwb3J0cy50b1BpeGVscyA9IGZ1bmN0aW9uKG1ldGVycykge1xuICByZXR1cm4gbWV0ZXJzICogcGl4ZWxzUGVyTWV0ZXI7XG59O1xuXG5leHBvcnRzLnNldFBpeGVsc1Blck1ldGVyID0gZnVuY3Rpb24odmFsKSB7XG4gIHBpeGVsc1Blck1ldGVyID0gdmFsO1xufTtcblxuZXhwb3J0cy5nZXRQaXhlbHNQZXJNZXRlciA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gcGl4ZWxzUGVyTWV0ZXI7XG59O1xuIiwiXG52YXIgUEkgPSAzLjE0MTU5O1xuXG5leHBvcnRzLlBJID0gUEk7XG5cbmV4cG9ydHMuY2xhbXBWZWxvY2l0eSA9IGZ1bmN0aW9uKGJvZHksIG1pbiwgbWF4KSB7XG4gIHZhciB2ZWMgPSBib2R5LkdldExpbmVhclZlbG9jaXR5KCk7XG4gIGlmICh2ZWMueCAhPSAwICYmIHZlYy55ICE9IDApIHtcbiAgICBpZiAodmVjLkxlbmd0aCgpIDwgbWluKSB7XG4gICAgICB2ZWMuTm9ybWFsaXplKCk7XG4gICAgICB2ZWMuTXVsdGlwbHkobWluKTtcbiAgICB9IGVsc2UgaWYgKHZlYy5MZW5ndGgoKSA+IG1heCkge1xuICAgICAgdmVjLk5vcm1hbGl6ZSgpXG4gICAgICB2ZWMuTXVsdGlwbHkobWF4KTtcbiAgICB9XG4gIH1cbn07XG5cbmV4cG9ydHMuY2xhbXBYVmVsb2NpdHkgPSBmdW5jdGlvbihib2R5LCBtaW4sIG1heCkge1xuICB2YXIgdmVjID0gYm9keS5HZXRMaW5lYXJWZWxvY2l0eSgpO1xuICBpZiAodmVjLnggIT0gMCkge1xuICAgIHZlYy54ID0gZXhwb3J0cy5jbGFtcFdpdGhTaWduKHZlYy54LCBtaW4sIG1heCk7XG4gIH1cbn07XG5cbmV4cG9ydHMuY2xhbXBZVmVsb2NpdHkgPSBmdW5jdGlvbihib2R5LCBtaW4sIG1heCkge1xuICB2YXIgdmVjID0gYm9keS5HZXRMaW5lYXJWZWxvY2l0eSgpO1xuICBpZiAodmVjLnkgIT0gMCkge1xuICAgIHZlYy55ID0gZXhwb3J0cy5jbGFtcFdpdGhTaWduKHZlYy55LCBtaW4sIG1heCk7XG4gIH1cbn07XG5cbmV4cG9ydHMuY2xhbXBXaXRoU2lnbiA9IGZ1bmN0aW9uKHZhbCwgbWluLCBtYXgpIHtcbiAgaWYgKHZhbCA+IDApIHtcbiAgICByZXR1cm4gZXhwb3J0cy5jbGFtcCh2YWwsIG1pbiwgbWF4KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gZXhwb3J0cy5jbGFtcCh2YWwsIC1tYXgsIC1taW4pO1xuICB9XG59O1xuXG5leHBvcnRzLmNsYW1wID0gZnVuY3Rpb24odmFsLCBtaW4sIG1heCkge1xuICByZXR1cm4gTWF0aC5taW4oTWF0aC5tYXgodmFsLCBtaW4pLCBtYXgpO1xufTtcblxuZXhwb3J0cy5yYW5kb21CZXR3ZWVuID0gZnVuY3Rpb24obWluLCBtYXgpIHtcbiAgcmV0dXJuIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChtYXgtbWluKSkgKyBtaW47XG59O1xuXG5leHBvcnRzLnJhbmRvbVNpZ24gPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIE1hdGgucmFuZG9tKCkgPCAwLjUgPyAtMSA6IDE7XG59O1xuXG5leHBvcnRzLmRpc3RhbmNlID0gZnVuY3Rpb24oYSwgYikge1xuICByZXR1cm4gTWF0aC5zcXJ0KChiLnggLSBhLngpICogKGIueCAtIGEueCkgKyAoYi55IC0gYS55KSAqIChiLnkgLSBhLnkpKTtcbn07XG4iLCJ2YXIgXyA9IHJlcXVpcmUoJy4uLy4uLy4uLzNyZHBhcnR5L3VuZGVyc2NvcmUtbWluJyksXG4gIEVudGl0eSA9IHJlcXVpcmUoJy4vZW50aXR5JyksXG4gIFdvcmxkID0gcmVxdWlyZSgnLi93b3JsZCcpLFxuICBodWIgPSByZXF1aXJlKCcuL2h1YicpLFxuICBtYXRoVXRpbHMgPSByZXF1aXJlKCcuL21hdGgtdXRpbHMnKVxuXG52YXIgTV9QSSA9IE1hdGguUElcbnZhciBNX1BJXzIgPSBNX1BJIC8gMlxuXG52YXIgcGFydGljbGVUZXh0dXJlID0gUElYSS5UZXh0dXJlLmZyb21JbWFnZSgnL2dhbWUvaW1hZ2VzL3BhcnRpY2xlLWJhbGwucG5nJylcblxudmFyIFBhcnRpY2xlID0gZnVuY3Rpb24oKSB7XG4gIFBJWEkuU3ByaXRlLmNhbGwodGhpcywgcGFydGljbGVUZXh0dXJlKVxuICB0aGlzLmFuY2hvci54ID0gMC41XG4gIHRoaXMuYW5jaG9yLnkgPSAwLjVcbiAgdGhpcy5zcGVlZCA9IG5ldyBQSVhJLlBvaW50XG4gIHRoaXMuYWNjZWxlcmF0aW9uID0gbmV3IFBJWEkuUG9pbnRcbiAgdGhpcy53aWR0aCA9IDE1XG4gIHRoaXMuaGVpZ2h0ID0gMTVcbn1cblBhcnRpY2xlLmNvbnN0cnVjdG9yID0gUGFydGljbGVcblBhcnRpY2xlLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoUElYSS5TcHJpdGUucHJvdG90eXBlKVxuXG52YXIgcmVzZXRQYXJ0aWNsZSA9IGZ1bmN0aW9uKHBhcnRpY2xlKSB7XG4gIHBhcnRpY2xlLmFscGhhID0gMVxuICBwYXJ0aWNsZS5zY2FsZS54ID0gMVxuICBwYXJ0aWNsZS5zY2FsZS55ID0gMVxuICBwYXJ0aWNsZS5kaXJlY3Rpb24gPSB7XG4gICAgeDogKG1hdGhVdGlscy5yYW5kb21CZXR3ZWVuKDAsIDIwMCkgLSAxMDApIC8gMTAwLFxuICAgIHk6IChtYXRoVXRpbHMucmFuZG9tQmV0d2VlbigwLCAyMDApIC0gMTAwKSAvIDEwMFxuICB9XG4gIHBhcnRpY2xlLnNwZWVkLnggPSAxLjMgKyBNYXRoLnJhbmRvbSgpXG4gIHBhcnRpY2xlLnNwZWVkLnkgPSAxLjMgKyBNYXRoLnJhbmRvbSgpXG4gIHBhcnRpY2xlLmFjY2VsZXJhdGlvbi54ID0gMC43NSArIE1hdGgucmFuZG9tKClcbiAgcGFydGljbGUuYWNjZWxlcmF0aW9uLnkgPSAwLjc1ICsgTWF0aC5yYW5kb20oKVxuICBwYXJ0aWNsZS5wb3NpdGlvbi54ID0gMFxuICBwYXJ0aWNsZS5wb3NpdGlvbi55ID0gMFxuICBwYXJ0aWNsZS52aXNpYmxlID0gdHJ1ZVxuICBwYXJ0aWNsZS5yb3RhdGlvbiA9IDBcbn1cblxudmFyIFBhcnRpY2xlUG9vbCA9IGZ1bmN0aW9uKHNpemUpIHtcbiAgY29uc29sZS5sb2coJ0NvbnN0cnVjdGluZyBhIHBhcnRpY2xlIHBvb2wgd2l0aCAnICsgc2l6ZSArICcgcGFydGljbGVzJylcbiAgdGhpcy5wb29sID0gW11cblxuICBmb3IgKHZhciBpID0gMDsgaSA8PSBzaXplOyBpKyspIHtcbiAgICB2YXIgcGFydGljbGUgPSBuZXcgUGFydGljbGUoKVxuICAgIHRoaXMucG9vbC5wdXNoKHtcbiAgICAgIHBhcnRpY2xlOiBwYXJ0aWNsZSxcbiAgICAgIGZyZWU6IHRydWVcbiAgICB9KVxuICB9XG59XG5cblBhcnRpY2xlUG9vbC5wcm90b3R5cGUuY2xhaW0gPSBmdW5jdGlvbihhbW91bnQpIHtcbiAgdmFyIHBhcnRpY2xlcyA9IFtdXG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnBvb2wubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgZW50cnkgPSB0aGlzLnBvb2xbaV1cblxuICAgIGlmIChlbnRyeS5mcmVlKSB7XG4gICAgICBpZiAoIWVudHJ5LnBhcnRpY2xlKSB7XG4gICAgICAgIHRocm93ICdQYXJ0aWNsZSBpcyBudWxsJ1xuICAgICAgfVxuXG4gICAgICBlbnRyeS5mcmVlID0gZmFsc2VcbiAgICAgIHBhcnRpY2xlcy5wdXNoKGVudHJ5LnBhcnRpY2xlKVxuICAgIH1cblxuICAgIGlmIChwYXJ0aWNsZXMubGVuZ3RoID09IGFtb3VudCkge1xuICAgICAgYnJlYWtcbiAgICB9XG4gIH1cblxuICBpZiAocGFydGljbGVzLmxlbmd0aCA8IGFtb3VudCkge1xuICAgIHRocm93ICdOb3QgZW5vdWdoIHBhcnRpY2xlcyB0byBzYXRpc2Z5IHJlcXVlc3QnXG4gIH1cblxuICBjb25zb2xlLmxvZygnQ2xhaW1lZCAnICsgYW1vdW50ICsgJyBwYXJ0aWNsZXMnKVxuXG4gIHJldHVybiBwYXJ0aWNsZXNcbn1cblxuUGFydGljbGVQb29sLnByb3RvdHlwZS5yZWxlYXNlID0gZnVuY3Rpb24ocGFydGljbGVzKSB7XG4gIHBhcnRpY2xlcy5mb3JFYWNoKGZ1bmN0aW9uKHBhcnRpY2xlKSB7XG4gICAgaWYgKHBhcnRpY2xlLnBhcmVudCkge1xuICAgICAgcGFydGljbGUucGFyZW50LnJlbW92ZUNoaWxkKHBhcnRpY2xlKVxuICAgIH1cbiAgICB2YXIgZW50cnkgPSBfLmZpbmRXaGVyZSh0aGlzLnBvb2wsIHsgcGFydGljbGU6IHBhcnRpY2xlIH0pXG4gICAgZW50cnkuZnJlZSA9IHRydWVcbiAgfS5iaW5kKHRoaXMpKVxuICAvLyBjb25zb2xlLmxvZygnUmVsZWFzZWQgJyArIHBhcnRpY2xlcy5sZW5ndGggKyAnIHBhcnRpY2xlcycpXG59XG5cbnZhciBwYXJ0aWNsZVBvb2wgPSBuZXcgUGFydGljbGVQb29sKDUwMDApXG5cbnZhciBFeHBsb3Npb24gPSBmdW5jdGlvbihvcmlnaW4sIHBhcnRpY2xlQ291bnQpIHtcbiAgRW50aXR5LmNhbGwodGhpcylcbiAgdGhpcy5zcHJpdGUgPSBuZXcgUElYSS5EaXNwbGF5T2JqZWN0Q29udGFpbmVyKClcbiAgdGhpcy5zcHJpdGUucG9zaXRpb24ueCA9IFdvcmxkLnRvUGl4ZWxzKG9yaWdpbi54KVxuICB0aGlzLnNwcml0ZS5wb3NpdGlvbi55ID0gV29ybGQudG9QaXhlbHMob3JpZ2luLnkpXG4gIHRoaXMudHRsID0gMFxuXG4gIHRoaXMucGFydGljbGVzID0gdGhpcy5hbGl2ZVBhcnRpY2xlcyA9IHBhcnRpY2xlUG9vbC5jbGFpbShwYXJ0aWNsZUNvdW50KVxuICB0aGlzLnBhcnRpY2xlcy5mb3JFYWNoKGZ1bmN0aW9uKHBhcnRpY2xlKSB7XG4gICAgcmVzZXRQYXJ0aWNsZShwYXJ0aWNsZSlcbiAgICB0aGlzLnNwcml0ZS5hZGRDaGlsZChwYXJ0aWNsZSlcbiAgfS5iaW5kKHRoaXMpKVxufVxuRXhwbG9zaW9uLmxhcmdlID0gZnVuY3Rpb24ob3JpZ2luKSB7XG4gIHJldHVybiBuZXcgRXhwbG9zaW9uKG9yaWdpbiwgNTApXG59XG5FeHBsb3Npb24uc21hbGwgPSBmdW5jdGlvbihvcmlnaW4pIHtcbiAgcmV0dXJuIG5ldyBFeHBsb3Npb24ob3JpZ2luLCBtYXRoVXRpbHMucmFuZG9tQmV0d2Vlbig5LCA1MSkpXG59XG5cbkV4cGxvc2lvbi5wcm90b3R5cGUgPSBuZXcgRW50aXR5KClcblxuRXhwbG9zaW9uLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbihkZWx0YSkge1xuICB0aGlzLnR0bCAtPSBkZWx0YVxuXG4gIHZhciBjdXJyZW50UGFydGljbGVzID0gdGhpcy5hbGl2ZVBhcnRpY2xlc1xuICBjdXJyZW50UGFydGljbGVzLmZvckVhY2goZnVuY3Rpb24ocGFydGljbGUpIHtcbiAgICBpZiAocGFydGljbGUucGFyZW50KSB7XG4gICAgICBwYXJ0aWNsZS5wb3NpdGlvbi54ICs9IHBhcnRpY2xlLnNwZWVkLnggKiBwYXJ0aWNsZS5kaXJlY3Rpb24ueFxuICAgICAgcGFydGljbGUucG9zaXRpb24ueSArPSBwYXJ0aWNsZS5zcGVlZC55ICogcGFydGljbGUuZGlyZWN0aW9uLnlcbiAgICAgIHBhcnRpY2xlLnNwZWVkLnggKz0gcGFydGljbGUuYWNjZWxlcmF0aW9uLnhcbiAgICAgIHBhcnRpY2xlLnNwZWVkLnkgKz0gcGFydGljbGUuYWNjZWxlcmF0aW9uLnlcblxuICAgICAgdmFyIHZlbG9jaXR5ID0gcGFydGljbGUuc3BlZWRcbiAgICAgIHZhciBhbmdsZSA9IDBcblxuICAgICAgaWYgKHZlbG9jaXR5LnggPT09IDApIHtcbiAgICAgICAgYW5nbGUgPSB2ZWxvY2l0eS55ID4gMCA/IDAgOiBNX1BJXG4gICAgICB9IGVsc2UgaWYodmVsb2NpdHkueSA9PT0gMCkge1xuICAgICAgICBhbmdsZSA9IHZlbG9jaXR5LnggPiAwID8gTV9QSV8yIDogMyAqIE1fUElfMlxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYW5nbGUgPSBNYXRoLmF0YW4odmVsb2NpdHkueSAvIHZlbG9jaXR5LngpICsgTV9QSV8yXG4gICAgICB9ICAgXG5cbiAgICAgIGlmICh2ZWxvY2l0eS54ID4gMCkge1xuICAgICAgICBhbmdsZSArPSBNX1BJXG4gICAgICB9XG5cbiAgICAgIHBhcnRpY2xlLnJvdGF0aW9uID0gYW5nbGVcbiAgICAgIC8vIHBhcnRpY2xlLmhlaWdodCA9IDggKiBwYXJ0aWNsZS5zcGVlZC55XG5cbiAgICAgIGlmIChtYXRoVXRpbHMuZGlzdGFuY2UoeyB4OiAwLCB5OiAwIH0sIHBhcnRpY2xlLnBvc2l0aW9uKSA+PSAzMDApIHtcbiAgICAgICAgcGFydGljbGUuYWxwaGEgPSAwXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIGRlYWRQYXJ0aWNsZSA9ICFwYXJ0aWNsZS5wYXJlbnRcblxuICAgIGlmIChkZWFkUGFydGljbGUpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdEZWFkIHBhcnRpY2xlJylcbiAgICB9XG5cbiAgICBpZiAoZGVhZFBhcnRpY2xlIHx8IHBhcnRpY2xlLmFscGhhIDw9IChNYXRoLnJhbmRvbSgpICogNSkgLyA1MCkge1xuICAgICAgdGhpcy5hbGl2ZVBhcnRpY2xlcyA9IF8ud2l0aG91dCh0aGlzLmFsaXZlUGFydGljbGVzLCBwYXJ0aWNsZSlcbiAgICAgIHBhcnRpY2xlUG9vbC5yZWxlYXNlKFtwYXJ0aWNsZV0pXG4gICAgfVxuICB9LmJpbmQodGhpcykpXG5cbiAgaWYgKHRoaXMuYWxpdmVQYXJ0aWNsZXMubGVuZ3RoID09PSAwKSB7XG4gICAgaHViLnNlbmQoJ2VudGl0eTpkZXN0cm95Jywge1xuICAgICAgZW50aXR5OiB0aGlzXG4gICAgfSlcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEV4cGxvc2lvbiIsInZhciBfID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvdW5kZXJzY29yZS1taW4nKTtcblxuZXhwb3J0cy5zdGF0aWMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gIHJldHVybiBib2R5RGVmKEJveDJELkR5bmFtaWNzLmIyQm9keS5iMl9zdGF0aWNCb2R5LCBvcHRpb25zKTtcbn07XG5cbmV4cG9ydHMuZHluYW1pYyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgcmV0dXJuIGJvZHlEZWYoQm94MkQuRHluYW1pY3MuYjJCb2R5LmIyX2R5bmFtaWNCb2R5LCBvcHRpb25zKTtcbn07XG5cbmV4cG9ydHMuZml4dHVyZSA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgdmFyIGZpeERlZiA9IG5ldyBCb3gyRC5EeW5hbWljcy5iMkZpeHR1cmVEZWY7XG4gIGZpeERlZi5kZW5zaXR5ID0gb3B0aW9ucy5keW5hbWljcy5kZW5zaXR5O1xuICBmaXhEZWYuZnJpY3Rpb24gPSBvcHRpb25zLmR5bmFtaWNzLmZyaWN0aW9uO1xuICBmaXhEZWYucmVzdGl0dXRpb24gPSBvcHRpb25zLmR5bmFtaWNzLnJlc3RpdHV0aW9uO1xuICBmaXhEZWYuc2hhcGUgPSBvcHRpb25zLnNoYXBlO1xuICBpZiAob3B0aW9ucy5jYXRlZ29yeSkgIHsgZml4RGVmLmZpbHRlci5jYXRlZ29yeUJpdHMgPSBvcHRpb25zLmNhdGVnb3J5OyB9XG4gIGlmIChvcHRpb25zLmNvbGxpc2lvbikgeyBmaXhEZWYuZmlsdGVyLm1hc2tCaXRzID0gb3B0aW9ucy5jb2xsaXNpb247ICAgIH1cbiAgcmV0dXJuIGZpeERlZjtcbn07XG5cbmV4cG9ydHMuc2hhcGUgPSB7XG4gIGNpcmNsZTogZnVuY3Rpb24ocmFkaXVzLCBwb3MpIHtcbiAgICB2YXIgY3MgPSBuZXcgQm94MkQuQ29sbGlzaW9uLlNoYXBlcy5iMkNpcmNsZVNoYXBlO1xuICAgIGNzLlNldFJhZGl1cyhyYWRpdXMpO1xuICAgIGlmIChwb3MpIHtcbiAgICAgIGNzLlNldExvY2FsUG9zaXRpb24ocG9zKTtcbiAgICB9XG4gICAgcmV0dXJuIGNzO1xuICB9LFxuICBib3g6IGZ1bmN0aW9uKHdpZHRoLCBoZWlnaHQsIHBvcywgYW5nbGUpIHtcbiAgICB2YXIgcHMgPSBuZXcgQm94MkQuQ29sbGlzaW9uLlNoYXBlcy5iMlBvbHlnb25TaGFwZTtcbiAgICB2YXIgcG9zID0gcG9zIHx8IG5ldyBCb3gyRC5Db21tb24uTWF0aC5iMlZlYzIoMCwwKTtcbiAgICB2YXIgYW5nbGUgPSBhbmdsZSB8fCAwO1xuICAgIHBzLlNldEFzT3JpZW50ZWRCb3god2lkdGggLyAyLCBoZWlnaHQgLyAyLCBwb3MsIGFuZ2xlKTsgICAvLyBoYWxmLXdpZHRoLCBoYWxmLWhlaWdodFxuICAgIHJldHVybiBwcztcbiAgfVxufTtcblxuZXhwb3J0cy5jYXRlZ29yaWVzID0ge1xuICBBTEw6ICAgICAgIC0xLFxuICBBUkVOQTogICAgIDB4MDAwMSxcbiAgUExBWUVSUzogICAweDAwMDIsXG4gIEJBTEw6ICAgICAgMHgwMDA0LFxuICBQQVJUSUNMRVM6IDB4MDAwOFxufTtcblxuXG5cblxuZnVuY3Rpb24gYm9keURlZih0eXBlLCBvcHRpb25zKSB7XG4gIG9wdGlvbnMgPSBfLmV4dGVuZCh7XG4gICAgeDogMCxcbiAgICB5OiAwLFxuICAgIGFuZ2xlOiAwLFxuICAgIGZpeGVkUm90YXRpb246IGZhbHNlXG4gIH0sIG9wdGlvbnMpO1xuICB2YXIgYmQgPSBuZXcgQm94MkQuRHluYW1pY3MuYjJCb2R5RGVmO1xuICBiZC50eXBlID0gdHlwZTtcbiAgYmQucG9zaXRpb24ueCA9IG9wdGlvbnMueDtcbiAgYmQucG9zaXRpb24ueSA9IG9wdGlvbnMueTtcbiAgYmQuYW5nbGUgPSBvcHRpb25zLmFuZ2xlO1xuICBiZC5maXhlZFJvdGF0aW9uID0gb3B0aW9ucy5maXhlZFJvdGF0aW9uO1xuICByZXR1cm4gYmQ7XG59XG4gIFxuIiwidmFyIF8gPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS91bmRlcnNjb3JlLW1pbicpO1xudmFyIHdvcmxkID0gcmVxdWlyZSgnLi93b3JsZCcpO1xuXG4vL1xuLy8gQW5jaG9yIGFsd2F5cyBzZWVtcyByZXNldCBmb3IgXCJub3JtYWxcIiBzcHJpdGVzXG4vLyBCdXQgT0sgZm9yIHRpbGluZy4uLiBtYXliZSBkdWUgdG8gdGhpcz9cbi8vXG4vLyAxZjNkZWU5YzRhMWM3MWJlZDljZDEwYzRhMmU4NmZiYmIzNWYxYmJmXG4vLyAxOCBNYXkgMjAxMyAxMTo1NjozOSBQTVxuLy8gUGF0Y2ggUGl4aSB0byBhbGxvdyBzcGVjaWZ5aW5nIGEgY2VudHJhbCBhbmNob3IgZm9yIHRpbGluZyBzcHJpdGVzXG4vLyBcblxuZXhwb3J0cy5zcHJpdGUgPSBmdW5jdGlvbihpbWFnZSwgd2lkdGgsIGhlaWdodCwgcm90YXRpb24pIHtcbiAgdmFyIHNwcml0ZSA9IFBJWEkuU3ByaXRlLmZyb21JbWFnZShpbWFnZSk7XG4gIGluaXQoc3ByaXRlLCB3aWR0aCwgaGVpZ2h0LCByb3RhdGlvbik7XG4gIHNwcml0ZS5hbmNob3IueCA9IDAuNTtcbiAgc3ByaXRlLmFuY2hvci55ID0gMC41O1xuICAvL2NvbnNvbGUubG9nKCdhbmNob3IgPSAnLCBzcHJpdGUuYW5jaG9yKVxuICByZXR1cm4gc3ByaXRlO1xufTtcblxuZXhwb3J0cy51aVNwcml0ZSA9IGZ1bmN0aW9uKGltYWdlLCB3aWR0aCwgaGVpZ2h0LCByb3RhdGlvbikge1xuICB2YXIgc3ByaXRlID0gUElYSS5TcHJpdGUuZnJvbUltYWdlKGltYWdlKTtcbiAgc3ByaXRlLndpZHRoID0gd2lkdGg7ICBcbiAgc3ByaXRlLmhlaWdodCA9IGhlaWdodDtcbiAgc3ByaXRlLnBvc2l0aW9uLnggPSAwO1xuICBzcHJpdGUucG9zaXRpb24ueSA9IDA7XG4gIHNwcml0ZS5hbmNob3IueCA9IDAuNTtcbiAgc3ByaXRlLmFuY2hvci55ID0gMC41O1xuICBzcHJpdGUucm90YXRpb24gPSByb3RhdGlvbiB8fCAwO1xuICByZXR1cm4gc3ByaXRlO1xufTtcblxuZXhwb3J0cy50aWxlID0gZnVuY3Rpb24oaW1hZ2UsIHdpZHRoLCBoZWlnaHQsIHJvdGF0aW9uKSB7XG4gIHZhciB0ZXh0dXJlID0gUElYSS5UZXh0dXJlLmZyb21JbWFnZShpbWFnZSk7XG4gIHZhciBzcHJpdGUgPSBuZXcgUElYSS5UaWxpbmdTcHJpdGUodGV4dHVyZSk7XG4gIHNwcml0ZS50aWxlU2NhbGUgPSBuZXcgUElYSS5Qb2ludCgxLDEpO1xuICBpbml0KHNwcml0ZSwgd2lkdGgsIGhlaWdodCwgcm90YXRpb24pO1xuICBzcHJpdGUuYW5jaG9yLnggPSBzcHJpdGUud2lkdGggIC8gMjtcbiAgc3ByaXRlLmFuY2hvci55ID0gc3ByaXRlLmhlaWdodCAvIDI7XG4gIC8vY29uc29sZS5sb2coJ2FuY2hvciA9ICcsIHNwcml0ZS5hbmNob3IpXG4gIHJldHVybiBzcHJpdGU7XG59O1xuXG5leHBvcnRzLnRleHQgPSBmdW5jdGlvbih0ZXh0LCBzaXplLCBvcHRzKSB7XG4gIG9wdHMgPSBfLmV4dGVuZCh7XG4gICAgICBmb250OiAnJyArIChzaXplIHx8IDUwKSArICdweCBMdWNraWVzdEd1eScsXG4gICAgICBmaWxsOiAnIzAwMCcsXG4gICAgICBhbGlnbjogJ2xlZnQnLFxuICAgICAgc3Ryb2tlOiAnI2ZmZicsXG4gICAgICBzdHJva2VUaGlja25lc3M6IDFcbiAgfSwgb3B0cyk7XG4gIHZhciB0ZXh0ID0gbmV3IFBJWEkuVGV4dCh0ZXh0LCBvcHRzKTtcbiAgdGV4dC5hbmNob3IueCA9IDAuNTtcbiAgcmV0dXJuIHRleHQ7XG59O1xuXG5leHBvcnRzLmFuaW1hdGlvbiA9IGZ1bmN0aW9uKGltYWdlcywgd2lkdGgsIGhlaWdodCkge1xuICB2YXIgdGV4dHVyZXMgPSBpbWFnZXMubWFwKGZ1bmN0aW9uKGkpIHtcbiAgICByZXR1cm4gUElYSS5UZXh0dXJlLmZyb21JbWFnZShpKTtcbiAgfSk7XG4gIHZhciBhbmltID0gbmV3IFBJWEkuTW92aWVDbGlwKHRleHR1cmVzKTtcbiAgaW5pdChhbmltLCB3aWR0aCwgaGVpZ2h0LCAwKTtcbiAgcmV0dXJuIGFuaW07XG59O1xuXG5mdW5jdGlvbiBpbml0KHNwcml0ZSwgd2lkdGgsIGhlaWdodCwgcm90YXRpb24pIHtcbiAgc3ByaXRlLndpZHRoID0gd29ybGQudG9QaXhlbHMod2lkdGgpOyAgXG4gIHNwcml0ZS5oZWlnaHQgPSB3b3JsZC50b1BpeGVscyhoZWlnaHQpO1xuICBzcHJpdGUucG9zaXRpb24ueCA9IDA7XG4gIHNwcml0ZS5wb3NpdGlvbi55ID0gMDtcbiAgc3ByaXRlLnJvdGF0aW9uID0gcm90YXRpb24gfHwgMDtcbn1cbiIsInZhciBfID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvdW5kZXJzY29yZS1taW4nKTtcbnZhciB3b3JsZCA9IHJlcXVpcmUoJy4vd29ybGQnKTtcblxudmFyIGdsb2JhbENvdW50ID0gMDtcblxudmFyIEVudGl0eSA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmlkICAgICA9ICgrK2dsb2JhbENvdW50KTtcbiAgdGhpcy5ib2R5ICAgPSBudWxsXG4gIHRoaXMuc3ByaXRlID0gbnVsbDtcbn07XG5cbkVudGl0eS5wcm90b3R5cGUuY3JlYXRlID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lKSB7XG4gIGlmICh0aGlzLmJvZHlTcGVjKSB7XG4gICAgdGhpcy5ib2R5U3BlYy5maXh0dXJlLnVzZXJEYXRhID0gdGhpcztcbiAgICB0aGlzLmJvZHkgPSBlbmdpbmUucGh5c2ljcy5jcmVhdGUodGhpcy5ib2R5U3BlYy5ib2R5LCB0aGlzLmJvZHlTcGVjLmZpeHR1cmUpOyAgXG4gIH1cbiAgaWYgKHRoaXMuc3ByaXRlKSB7XG4gICAgZW5naW5lLmdyYXBoaWNzLmFkZCh0aGlzLnNwcml0ZSk7XG4gIH1cbn07XG5cbkVudGl0eS5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSkge1xuICBpZiAodGhpcy5ib2R5KSB7XG4gICAgZW5naW5lLnBoeXNpY3MuZGVzdHJveSh0aGlzLmJvZHkpO1xuICB9XG4gIGlmICh0aGlzLnNwcml0ZSkge1xuICAgIGVuZ2luZS5ncmFwaGljcy5yZW1vdmUodGhpcy5zcHJpdGUpO1xuICB9XG59O1xuXG5FbnRpdHkucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSwgZGVsdGEpIHtcbiAgaWYgKHRoaXMuc3ByaXRlICYmIHRoaXMuYm9keSkge1xuICAgIHRoaXMuc3ByaXRlLnBvc2l0aW9uLnggPSB3b3JsZC50b1BpeGVscyh0aGlzLmJvZHkuR2V0UG9zaXRpb24oKS54KTtcbiAgICB0aGlzLnNwcml0ZS5wb3NpdGlvbi55ID0gd29ybGQudG9QaXhlbHModGhpcy5ib2R5LkdldFBvc2l0aW9uKCkueSk7XG4gICAgdGhpcy5zcHJpdGUucm90YXRpb24gPSB0aGlzLmJvZHkuR2V0QW5nbGUoKTtcbiAgfVxufTtcblxuRW50aXR5LnByb3RvdHlwZS5jb2xsaXNpb24gPSBmdW5jdGlvbihvdGhlciwgcG9pbnRzKSB7XG4gIC8vIG5vdGhpbmdcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRW50aXR5O1xuIiwidmFyIGh1YiA9IHJlcXVpcmUoJy4uL2VuZ2luZS9odWInKTtcblxuZnVuY3Rpb24gVGltZUJhc2VkTWVzc2FnZSh0cmlnZ2VyVGltZSwgbWVzc2FnZSwgYXJncykge1xuXG4gIHRoaXMudHJpZ2dlclRpbWUgID0gdHJpZ2dlclRpbWU7XG4gIHRoaXMubWVzc2FnZSAgICAgID0gbWVzc2FnZTtcbiAgdGhpcy5hcmdzICAgICAgICAgPSBhcmdzO1xuICB0aGlzLnRyaWdnZXJlZCAgICA9IGZhbHNlO1xuXG59XG5cblRpbWVCYXNlZE1lc3NhZ2UucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKHRpbWUpIHtcbiAgaWYgKHRoaXMudHJpZ2dlcmVkID09PSBmYWxzZSAmJiB0aW1lIDw9IHRoaXMudHJpZ2dlclRpbWUpIHtcbiAgICBodWIuc2VuZCh0aGlzLm1lc3NhZ2UsIHRoaXMuYXJncyk7XG4gICAgdGhpcy50cmlnZ2VyZWQgPSB0cnVlO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFRpbWVCYXNlZE1lc3NhZ2U7XG4iLCJ2YXIgQ29tcG91bmRFbnRpdHkgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2NvbXBvdW5kLWVudGl0eScpO1xudmFyIEJhY2tncm91bmQgICAgICA9IHJlcXVpcmUoJy4vYmFja2dyb3VuZCcpO1xudmFyIFdhbGwgICAgICAgICAgICA9IHJlcXVpcmUoJy4vd2FsbCcpO1xudmFyIENvbmUgICAgICAgICAgICA9IHJlcXVpcmUoJy4vY29uZScpO1xudmFyIEdvYWwgICAgICAgICAgICA9IHJlcXVpcmUoJy4vZ29hbCcpO1xudmFyIHdvcmxkICAgICAgICAgICA9IHJlcXVpcmUoJy4uL3dvcmxkJyk7XG5cbnZhciBQSSAgICAgPSAzLjE0MTU5O1xudmFyIHdpZHRoICA9IHdvcmxkLndpZHRoO1xudmFyIGhlaWdodCA9IHdvcmxkLmhlaWdodDtcbnZhciB0b3AgICAgPSAzLjQ7XG52YXIgbGVmdCAgID0gMC41O1xudmFyIHJpZ2h0ICA9IHdvcmxkLndpZHRoICAtIDAuNTtcbnZhciBib3R0b20gPSB3b3JsZC5oZWlnaHQgLSAyLjQ7XG5cbmZ1bmN0aW9uIFN0YWRpdW0oKSB7XG4gIFxuICB0aGlzLmlkID0gJ3N0YWRpdW0nO1xuICBcbiAgdGhpcy5lbnRpdGllcyA9IFtdO1xuICB0aGlzLmVudGl0aWVzLnB1c2gobmV3IEJhY2tncm91bmQoKSk7XG4gIFxuICB0aGlzLmVudGl0aWVzLnB1c2gobmV3IFdhbGwoJ3dhbGwtdG9wJywgICAgICAgICAgICAgICB3aWR0aCAvIDIsICAgICAgdG9wLCAgICAgICAgICAgICAgICB3aWR0aCwgICAxLCAgICAgICAgICAgICAgIDApKTtcbiAgdGhpcy5lbnRpdGllcy5wdXNoKG5ldyBXYWxsKCd3YWxsLWJvdHRvbScsICAgICAgICAgICAgd2lkdGggLyAyLCAgICAgIGJvdHRvbSwgICAgICAgICAgICAgd2lkdGgsICAgMSwgICAgICAgICAgICAgICAwKSk7XG4gIHRoaXMuZW50aXRpZXMucHVzaChuZXcgV2FsbCgnd2FsbC1sZWZ0MScsICAgICAgICAgICAgIGxlZnQgICsgMi44LCAgICBoZWlnaHQgKiAwLjg1LzYsICAgIDEsICAgICAgIGhlaWdodCAvIDIuNSwgICAgMC4wOCkpO1xuICB0aGlzLmVudGl0aWVzLnB1c2gobmV3IFdhbGwoJ3dhbGwtbGVmdDInLCAgICAgICAgICAgICBsZWZ0ICArIDEuMSwgICAgaGVpZ2h0ICogNS4xMC82LCAgICAxLCAgICAgICBoZWlnaHQgLyAyLjUsICAgIDAuMDUpKTtcbiAgdGhpcy5lbnRpdGllcy5wdXNoKG5ldyBXYWxsKCd3YWxsLXJpZ2h0MScsICAgICAgICAgICAgcmlnaHQgLSAyLjcsICAgIGhlaWdodCAqIDAuODUvNiwgICAgMSwgICAgICAgaGVpZ2h0IC8gMi41LCAgIC0wLjA2KSk7XG4gIHRoaXMuZW50aXRpZXMucHVzaChuZXcgV2FsbCgnd2FsbC1yaWdodDInLCAgICAgICAgICAgIHJpZ2h0IC0gMS4yLCAgICBoZWlnaHQgKiA1LjEwLzYsICAgIDEsICAgICAgIGhlaWdodCAvIDIuNSwgICAtMC4wNSkpO1xuICB0aGlzLmVudGl0aWVzLnB1c2gobmV3IFdhbGwoJ3dhbGwtZ29hbC1sZWZ0LXRvcCcsICAgICAwLCAgICAgICAgICAgICAgaGVpZ2h0IC8gMiAtIDYuMCwgICA0LCAgICAgICAxLCAgICAgICAgICAgICAgIDApKTtcbiAgdGhpcy5lbnRpdGllcy5wdXNoKG5ldyBXYWxsKCd3YWxsLWdvYWwtbGVmdC1ib3R0b20nLCAgMCwgICAgICAgICAgICAgIGhlaWdodCAvIDIgKyA1LjEsICAgMi43LCAgICAgMSwgICAgICAgICAgICAgICAwKSk7XG4gIHRoaXMuZW50aXRpZXMucHVzaChuZXcgV2FsbCgnd2FsbC1nb2FsLXJpZ2h0LXRvcCcsICAgIHdpZHRoLCAgICAgICAgICBoZWlnaHQgLyAyIC0gNS45LCAgIDQsICAgICAgIDEsICAgICAgICAgICAgICAgMCkpO1xuICB0aGlzLmVudGl0aWVzLnB1c2gobmV3IFdhbGwoJ3dhbGwtZ29hbC1yaWdodC1ib3R0b20nLCB3aWR0aCwgICAgICAgICAgaGVpZ2h0IC8gMiArIDUuMSwgICAyLjUsICAgICAxLCAgICAgICAgICAgICAgIDApKTtcbiAgICBcbiAgdGhpcy5lbnRpdGllcy5wdXNoKG5ldyBDb25lKCdjb25lMScsIHdpZHRoIC8gMTIgKiA2LCAgIGhlaWdodCAvIDUgKiAxLjUpKTtcbiAgdGhpcy5lbnRpdGllcy5wdXNoKG5ldyBDb25lKCdjb25lMicsIHdpZHRoIC8gMTIgKiA2LCAgIGhlaWdodCAvIDUgKiAzLjUpKTtcbiAgXG4gIHRoaXMuZW50aXRpZXMucHVzaChuZXcgR29hbCgnZ29hbHAxJywgMCwgIDAsICAgICAgICAgICAgaGVpZ2h0IC8gMiwgMC41LCAxNCkpO1xuICB0aGlzLmVudGl0aWVzLnB1c2gobmV3IEdvYWwoJ2dvYWxwMicsIDEsICB3b3JsZC53aWR0aCwgIGhlaWdodCAvIDIsIDAuNSwgMTQpKTtcbiAgXG59XG5cblN0YWRpdW0ucHJvdG90eXBlID0gbmV3IENvbXBvdW5kRW50aXR5KCk7XG5cblN0YWRpdW0ucHJvdG90eXBlLnNoYWtlID0gZnVuY3Rpb24oYWdhaW5zdFBsYXllckluZGV4KSB7XG4gIHRoaXMuZW50aXRpZXNbMF0uc2hha2UoYWdhaW5zdFBsYXllckluZGV4KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU3RhZGl1bTtcbiIsInZhciBFbnRpdHkgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9lbnRpdHknKTtcbnZhciBodWIgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9odWInKTtcbnZhciBhc3NldHMgICAgICA9IHJlcXVpcmUoJy4uLy4uL2Fzc2V0cycpO1xuXG5mdW5jdGlvbiBDcm93ZCgpIHtcbiAgdGhpcy5pZCA9ICdjcm93ZCc7XG4gIGh1Yi5zZW5kKCdlbmdpbmUuc291bmQucGxheScsIHNvdW5kKCdjcm93ZCcsIHRydWUsIDAuNykpO1xuICBodWIub24oJ2dhbWUuc2NvcmUnLCB0aGlzLmNoZWVyLmJpbmQodGhpcykpO1xuICBodWIub24oJ2dhbWUuZmluaXNoaW5nJywgdGhpcy5vcmdhbi5iaW5kKHRoaXMpKTtcbiAgaHViLm9uKCdnYW1lLmVuZCcsIHRoaXMuZW5kLmJpbmQodGhpcykpO1xufVxuXG5Dcm93ZC5wcm90b3R5cGUgPSBuZXcgRW50aXR5KCk7XG5cbkNyb3dkLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oKSB7XG4gIGh1Yi5zZW5kKCdlbmdpbmUuc291bmQuc3RvcCcsIHNvdW5kKCdjcm93ZCcpKTtcbn07XG5cbkNyb3dkLnByb3RvdHlwZS5jaGVlciA9IGZ1bmN0aW9uKGFyZ3MpIHtcbiAgaWYgKGFyZ3MuYWdhaW5zdEluZGV4ICE9PSBhcmdzLmJhbGwua2lja2VkQnkpIHtcbiAgICBodWIuc2VuZCgnZW5naW5lLnNvdW5kLnBsYXknLCBzb3VuZCgnY3Jvd2Qtc2NvcmVkJywgZmFsc2UpKTtcbiAgfSBlbHNlIHtcbiAgICBodWIuc2VuZCgnZW5naW5lLnNvdW5kLnBsYXknLCBzb3VuZCgnY3Jvd2Qtb2gnLCBmYWxzZSkpO1xuICB9XG59O1xuXG5Dcm93ZC5wcm90b3R5cGUub3JnYW4gPSBmdW5jdGlvbigpIHtcbiAgLy8gaHViLnNlbmQoJ2VuZ2luZS5zb3VuZC5wbGF5Jywgc291bmQoJ2Nyb3dkLW9yZ2FuJywgZmFsc2UpKTtcbn07XG5cbkNyb3dkLnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbigpIHtcbiAgLy8gaHViLnNlbmQoJ2VuZ2luZS5zb3VuZC5zdG9wJywgc291bmQoJ2Nyb3dkLW9yZ2FuJykpO1xuICAvLyBodWIuc2VuZCgnZW5naW5lLnNvdW5kLnBsYXknLCBzb3VuZCgnY3Jvd2QtZW5kJywgZmFsc2UpKTtcbn07XG5cbmZ1bmN0aW9uIHNvdW5kKG5hbWUsIGxvb3AsIHZvbHVtZSkge1xuICByZXR1cm4ge1xuICAgIGZpbGU6IGFzc2V0cy5zb3VuZChuYW1lKSxcbiAgICBsb29wOiBsb29wLFxuICAgIHZvbHVtZTogdm9sdW1lIHx8IDFcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBDcm93ZDtcbiIsInZhciBQRiAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9waHlzaWNzLWZhY3RvcnknKTtcbnZhciBHRiAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9ncmFwaGljcy1mYWN0b3J5Jyk7XG52YXIgRW50aXR5ICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZW50aXR5Jyk7XG52YXIgd29ybGQgICAgICAgPSByZXF1aXJlKCcuLi93b3JsZCcpO1xudmFyIGh1YiAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2h1YicpO1xudmFyIGFzc2V0cyAgICAgID0gcmVxdWlyZSgnLi4vLi4vYXNzZXRzJyk7XG5cbnZhciBmaXh0dXJlID0gUEYuZml4dHVyZSh7XG4gIHNoYXBlOiAgICAgIFBGLnNoYXBlLmNpcmNsZSgxLjcpLFxuICBkeW5hbWljczogICB7ZGVuc2l0eTogMSwgZnJpY3Rpb246IDAuNSwgcmVzdGl0dXRpb246IDF9LFxuICBjYXRlZ29yeTogICBQRi5jYXRlZ29yaWVzLlBMQVlFUixcbiAgY29sbGlzaW9uOiAgUEYuY2F0ZWdvcmllcy5BUkVOQSB8IFBGLmNhdGVnb3JpZXMuQkFMTFxufSk7XG5cbnZhciBBTklNX1JFU1QgPSAwO1xudmFyIEFOSU1fVVAgICA9IDE7XG52YXIgQU5JTV9ET1dOID0gMjtcblxuZnVuY3Rpb24gUGxheWVyKGlkLCBpbmRleCwgbmFtZSwgeCwgeSkge1xuICBcbiAgdGhpcy5pZCAgICA9IGlkO1xuICB0aGlzLmluZGV4ID0gaW5kZXg7XG4gIHRoaXMubmFtZSAgPSBuYW1lO1xuICBcbiAgdGhpcy5ib2R5U3BlYyA9IHtcbiAgICBib2R5OiBQRi5keW5hbWljKHsgeDogeCwgeTogeSwgZml4ZWRSb3RhdGlvbjogdHJ1ZSB9KSxcbiAgICBmaXh0dXJlOiBmaXh0dXJlXG4gIH07XG4gIFxuICB0aGlzLmNvbnN0cmFpbnRTcGVjID0ge1xuICAgIGJvZHk6IFBGLnN0YXRpYyh7eDogeCwgeTogMH0pLFxuICAgIGZpeHR1cmU6IFBGLmZpeHR1cmUoe1xuICAgICAgc2hhcGU6IFBGLnNoYXBlLmJveCgxLCAxKSxcbiAgICAgIGR5bmFtaWNzOiB7ZGVuc2l0eTogMCwgZnJpY3Rpb246IDAsIHJlc3RpdHV0aW9uOiAwfSxcbiAgICB9KVxuICB9O1xuICBcbiAgaWYgKHRoaXMuaWQgPT09ICdwMScpIHtcbiAgICB0aGlzLnNwcml0ZSA9IEdGLmFuaW1hdGlvbihhc3NldHMuaW1hZ2VzKCdjYXQnLCAnY2F0LXVwJywgJ2NhdC1kb3duJyksIDYsIDYpO1xuICB9IGVsc2Uge1xuICAgIHRoaXMuc3ByaXRlID0gR0YuYW5pbWF0aW9uKGFzc2V0cy5pbWFnZXMoJ2RvZycsICdkb2ctdXAnLCAnZG9nLWRvd24nKSwgNiwgNik7XG4gIH1cbiAgXG59XG5cblBsYXllci5wcm90b3R5cGUgPSBuZXcgRW50aXR5KCk7XG5cblBsYXllci5wcm90b3R5cGUuY3JlYXRlID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lKSB7XG4gIEVudGl0eS5wcm90b3R5cGUuY3JlYXRlLmNhbGwodGhpcywgZW5naW5lLCBnYW1lKTtcbiAgdGhpcy5ib2R5LlNldExpbmVhckRhbXBpbmcoMik7XG4gIHRoaXMuY29uc3RyYWludEJvZHkgPSBlbmdpbmUucGh5c2ljcy5jcmVhdGUodGhpcy5jb25zdHJhaW50U3BlYy5ib2R5LCB0aGlzLmNvbnN0cmFpbnRTcGVjLmZpeHR1cmUpO1xuICB2YXIgdmVydGljYWxBeGlzID0gbmV3IEJveDJELkNvbW1vbi5NYXRoLmIyVmVjMigwLDEpO1xuICB2YXIgam9pbnQgID0gbmV3IEJveDJELkR5bmFtaWNzLkpvaW50cy5iMkxpbmVKb2ludERlZigpO1xuICBqb2ludC5Jbml0aWFsaXplKHRoaXMuY29uc3RyYWludEJvZHksIHRoaXMuYm9keSwgdGhpcy5ib2R5LkdldFBvc2l0aW9uKCksIHZlcnRpY2FsQXhpcyk7XG4gIGVuZ2luZS5waHlzaWNzLmIyd29ybGQuQ3JlYXRlSm9pbnQoam9pbnQpOyAgXG59XG5cblBsYXllci5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSkge1xuICBFbnRpdHkucHJvdG90eXBlLmRlc3Ryb3kuY2FsbCh0aGlzLCBlbmdpbmUsIGdhbWUpO1xuICBlbmdpbmUucGh5c2ljcy5kZXN0cm95KHRoaXMuY29uc3RyYWludEJvZHkpO1xufTtcblxuUGxheWVyLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUsIGRlbHRhKSB7XG4gIEVudGl0eS5wcm90b3R5cGUudXBkYXRlLmNhbGwodGhpcywgZW5naW5lLCBnYW1lLCBkZWx0YSk7XG4gIC8vIFdlIHNob3VsZCBiZSBhYmxlIHRvIHNwZWNpZnkgXCIwLjVcIiwgYW5kIG5vdCBoYXZlIHRvIHVwZGF0ZSBpdCBjb25zdGFudGx5XG4gIC8vIE5lZWQgdG8gY2hlY2sgb3VyIGNoYW5nZXMgdG8gUElYSVxuICB0aGlzLnNwcml0ZS5hbmNob3IueCA9IHRoaXMuc3ByaXRlLnRleHR1cmUud2lkdGggIC8gMjtcbiAgdGhpcy5zcHJpdGUuYW5jaG9yLnkgPSB0aGlzLnNwcml0ZS50ZXh0dXJlLmhlaWdodCAvIDI7XG59O1xuXG5QbGF5ZXIucHJvdG90eXBlLmNvbGxpc2lvbiA9IGZ1bmN0aW9uKG90aGVyLCBwb2ludHMpIHsgICAgXG4gIGlmIChvdGhlci5pZC5tYXRjaCgvYmFsbC8pKSB7XG4gICAgb3RoZXIua2lja2VkQnkgPSB0aGlzLmluZGV4O1xuICAgIGh1Yi5zZW5kKCdlbmdpbmUuc291bmQucGxheScsIHtmaWxlOiAnL2dhbWUvc291bmRzL2JvdW5jZS5tcDMnfSk7XG4gIH0gZWxzZSBpZiAob3RoZXIuaWQubWF0Y2goL3dhbGwvKSkge1xuICAgIHRoaXMuc3ByaXRlLmdvdG9BbmRTdG9wKEFOSU1fUkVTVCk7XG4gICAgdGhpcy5ib2R5LlNldExpbmVhclZlbG9jaXR5KG5ldyBCb3gyRC5Db21tb24uTWF0aC5iMlZlYzIoMCwgNSkpO1xuICB9XG59O1xuXG5QbGF5ZXIucHJvdG90eXBlLm1vdmUgPSBmdW5jdGlvbihkaXIpIHtcbiAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLmVuZEZsYW1lKTtcbiAgdmFyIHkgPSAoZGlyID09PSAndXAnKSA/IC0zMjogMzI7XG4gIHRoaXMuYm9keS5TZXRBd2FrZSh0cnVlKTtcbiAgdGhpcy5ib2R5LlNldExpbmVhclZlbG9jaXR5KG5ldyBCb3gyRC5Db21tb24uTWF0aC5iMlZlYzIoMCwgeSkpO1xuICBpZiAoeSA8IDApIHtcbiAgICB0aGlzLnNwcml0ZS5nb3RvQW5kU3RvcChBTklNX1VQKTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLnNwcml0ZS5nb3RvQW5kU3RvcChBTklNX0RPV04pO1xuICB9XG4gIHRoaXMuZW5kRmxhbWUgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuc3ByaXRlLmdvdG9BbmRTdG9wKDApO1xuICB9LmJpbmQodGhpcyksIDIwMCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFBsYXllcjtcbiIsInZhciBFbnRpdHkgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZW50aXR5Jyk7XG52YXIgR0YgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZ3JhcGhpY3MtZmFjdG9yeScpO1xudmFyIHVzZXJJbnRlcmZhY2UgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvdXNlci1pbnRlcmZhY2UnKTtcblxuZnVuY3Rpb24gV2lubmVyKGlkLCBwMSwgcDIpIHtcbiAgXG4gIHRoaXMuaWQgPSBpZDtcbiAgXG4gIHZhciBiZyAgID0gKHAxLnNjb3JlID09PSBwMi5zY29yZSkgPyAnL2dhbWUvaW1hZ2VzL2VuZC1kcmF3LnBuZycgOiAnL2dhbWUvaW1hZ2VzL2VuZC13aW5uZXIucG5nJztcbiAgdmFyIG5hbWUgPSAocDEuc2NvcmUgPiBwMi5zY29yZSkgPyBwMS5uYW1lIDogcDIubmFtZTtcbiAgXG4gIHRoaXMuYmFja2dyb3VuZCA9IEdGLnVpU3ByaXRlKGJnLCB1c2VySW50ZXJmYWNlLndpZHRoLCB1c2VySW50ZXJmYWNlLmhlaWdodCk7XG4gIHRoaXMuYmFja2dyb3VuZC5wb3NpdGlvbi54ID0gdXNlckludGVyZmFjZS53aWR0aCAgLyAyIC0gdGhpcy5iYWNrZ3JvdW5kLndpZHRoICAvIDI7XG4gIHRoaXMuYmFja2dyb3VuZC5wb3NpdGlvbi55ID0gdXNlckludGVyZmFjZS5oZWlnaHQgLyAyIC0gdGhpcy5iYWNrZ3JvdW5kLmhlaWdodCAvIDI7XG4gICAgXG4gIGlmIChwMS5zY29yZSAhPSBwMi5zY29yZSkge1xuICAgIHRoaXMubmFtZSA9IEdGLnRleHQobmFtZSwgNDUsIHtmaWxsOiAnIzAxNTE4ZCcsIHN0cm9rZTogJyNmZmYnLCBzdHJva2VUaGlja25lc3M6IDN9KTtcbiAgICB0aGlzLm5hbWUucG9zaXRpb24ueCA9IHVzZXJJbnRlcmZhY2Uud2lkdGggLyAyIC0gdGhpcy5uYW1lLndpZHRoIC8gMiAtIDIwO1xuICAgIHRoaXMubmFtZS5wb3NpdGlvbi55ID0gdXNlckludGVyZmFjZS51bml0KDE1KTtcbiAgfVxuICBcbn07XG5cbldpbm5lci5wcm90b3R5cGUgPSBuZXcgRW50aXR5KCk7XG5cbldpbm5lci5wcm90b3R5cGUuY3JlYXRlID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lKSB7XG4gIGVuZ2luZS5ncmFwaGljcy5hZGQodGhpcy5iYWNrZ3JvdW5kKTtcbiAgaWYgKHRoaXMubmFtZSkge1xuICAgIGVuZ2luZS5ncmFwaGljcy5hZGQodGhpcy5uYW1lKTtcbiAgfVxufTtcblxuV2lubmVyLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lKSB7XG4gIGVuZ2luZS5ncmFwaGljcy5yZW1vdmUodGhpcy5iYWNrZ3JvdW5kKTtcbiAgaWYgKHRoaXMubmFtZSkge1xuICAgIGVuZ2luZS5ncmFwaGljcy5yZW1vdmUodGhpcy5uYW1lKTtcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBXaW5uZXI7XG4iLCJ2YXIgR0YgICAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9ncmFwaGljcy1mYWN0b3J5Jyk7XG52YXIgRW50aXR5ICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9lbnRpdHknKTtcbnZhciB1c2VySW50ZXJmYWNlID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL3VzZXItaW50ZXJmYWNlJyk7XG52YXIgbWF0aFV0aWxzICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9tYXRoLXV0aWxzJyk7XG52YXIgYXNzZXRzICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2Fzc2V0cycpO1xuXG52YXIgUEkgICAgICAgICAgICAgID0gMy4xNDtcbnZhciBTVFJFVENIX0NJUkNMRSAgPSAgODA7ICAvLyBtaWxsaXNcbnZhciBTVFJFVENIX1NQTEFTSCAgPSAxODA7ICAvLyBtaWxsaXNcbnZhciBTVFJFVENIX0xJTkUgICAgPSAzMDA7ICAvLyBtaWxsaXNcblxuZnVuY3Rpb24gQm9vbShpZCwgYWdhaW5zdFBsYXllckluZGV4KSB7XG4gIFxuICB0aGlzLmlkID0gaWQ7XG4gIFxuICB2YXIgeCA9IChhZ2FpbnN0UGxheWVySW5kZXggPT09IDApID8gMCA6IHVzZXJJbnRlcmZhY2Uud2lkdGg7XG4gIFxuICB0aGlzLmNpcmNsZSA9IEdGLnVpU3ByaXRlKGFzc2V0cy5pbWFnZSgnYm9vbS1jaXJjbGUnKSwgMCwgdXNlckludGVyZmFjZS5oZWlnaHQgLyAyLCAwKTtcbiAgdGhpcy5jaXJjbGUucG9zaXRpb24ueCA9IHg7XG4gIHRoaXMuY2lyY2xlLnBvc2l0aW9uLnkgPSB1c2VySW50ZXJmYWNlLmhlaWdodCAvIDI7XG5cbiAgdGhpcy5zcGxhc2ggPSBHRi51aVNwcml0ZShhc3NldHMuaW1hZ2UoJ2Jvb20tc3BsYXNoJyksIDAsIHVzZXJJbnRlcmZhY2UuaGVpZ2h0IC8gMS4yLCAwKTtcbiAgdGhpcy5zcGxhc2gucG9zaXRpb24ueCA9IHg7XG4gIHRoaXMuc3BsYXNoLnBvc2l0aW9uLnkgPSB1c2VySW50ZXJmYWNlLmhlaWdodCAvIDI7XG5cbiAgdGhpcy5saW5lID0gR0YudWlTcHJpdGUoYXNzZXRzLmltYWdlKCdib29tLWxpbmUnKSwgMCwgdXNlckludGVyZmFjZS5oZWlnaHQgLyA0LCAwKTtcbiAgdGhpcy5saW5lLnBvc2l0aW9uLnggPSB4O1xuICB0aGlzLmxpbmUucG9zaXRpb24ueSA9IHVzZXJJbnRlcmZhY2UuaGVpZ2h0IC8gMjtcblxuICBpZiAoYWdhaW5zdFBsYXllckluZGV4ID09PSAxKSB7XG4gICAgdGhpcy5jaXJjbGUucm90YXRpb24gPSBQSTtcbiAgICB0aGlzLnNwbGFzaC5yb3RhdGlvbiA9IFBJO1xuICAgIHRoaXMubGluZS5yb3RhdGlvbiAgPSBQSTtcbiAgfVxuICBcbiAgdGhpcy50aW1lID0gMDtcbiAgXG59XG5cbkJvb20ucHJvdG90eXBlID0gbmV3IEVudGl0eSgpO1xuXG5Cb29tLnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgZW5naW5lLmdyYXBoaWNzLmFkZCh0aGlzLmNpcmNsZSk7XG4gIGVuZ2luZS5ncmFwaGljcy5hZGQodGhpcy5zcGxhc2gpO1xuICBlbmdpbmUuZ3JhcGhpY3MuYWRkKHRoaXMubGluZSk7XG59O1xuXG5Cb29tLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lKSB7XG4gIGVuZ2luZS5ncmFwaGljcy5yZW1vdmUodGhpcy5jaXJjbGUpO1xuICBlbmdpbmUuZ3JhcGhpY3MucmVtb3ZlKHRoaXMuc3BsYXNoKTtcbiAgZW5naW5lLmdyYXBoaWNzLnJlbW92ZSh0aGlzLmxpbmUpO1xufTtcblxuQm9vbS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lLCBkZWx0YSkge1xuICB0aGlzLmNpcmNsZS5hbmNob3IueSA9IHRoaXMuY2lyY2xlLnRleHR1cmUuaGVpZ2h0IC8gMjtcbiAgdGhpcy5zcGxhc2guYW5jaG9yLnkgPSB0aGlzLnNwbGFzaC50ZXh0dXJlLmhlaWdodCAvIDI7XG4gIHRoaXMubGluZS5hbmNob3IueSAgPSB0aGlzLmxpbmUudGV4dHVyZS5oZWlnaHQgIC8gMjtcblxuICB0aGlzLnRpbWUgPSB0aGlzLnRpbWUgKyBkZWx0YTtcbiAgdmFyIHN0cmV0Y2hDaXJjbGUgPSBtYXRoVXRpbHMuY2xhbXAodGhpcy50aW1lLCAwLCBTVFJFVENIX0NJUkNMRSk7XG4gIHZhciBzdHJldGNoU3BsYXNoID0gbWF0aFV0aWxzLmNsYW1wKHRoaXMudGltZSwgMCwgU1RSRVRDSF9TUExBU0gpO1xuICB2YXIgc3RyZXRjaExpbmUgICA9IG1hdGhVdGlscy5jbGFtcCh0aGlzLnRpbWUsIDAsIFNUUkVUQ0hfTElORSk7XG4gIFxuICB0aGlzLmNpcmNsZS53aWR0aCA9IGludGVycG9sYXRlKHN0cmV0Y2hDaXJjbGUsIDAsIFNUUkVUQ0hfQ0lSQ0xFLCAwLCB0aGlzLmNpcmNsZS5oZWlnaHQgKiAwLjcxKTtcbiAgdGhpcy5zcGxhc2gud2lkdGggPSBpbnRlcnBvbGF0ZShzdHJldGNoU3BsYXNoLCAwLCBTVFJFVENIX1NQTEFTSCwgMCwgdGhpcy5zcGxhc2guaGVpZ2h0ICogMC41KTtcbiAgdGhpcy5saW5lLndpZHRoICAgPSBpbnRlcnBvbGF0ZShzdHJldGNoTGluZSwgICAwLCBTVFJFVENIX0xJTkUsICAgMCwgdGhpcy5saW5lLmhlaWdodCAgICogNy4yNik7XG4gIFxuICBpZiAodGhpcy50aW1lID49IFNUUkVUQ0hfQ0lSQ0xFKSB7IHRoaXMuY2lyY2xlLmFscGhhICo9IDAuOTU7IH1cbiAgaWYgKHRoaXMudGltZSA+PSBTVFJFVENIX1NQTEFTSCkgeyB0aGlzLnNwbGFzaC5hbHBoYSAqPSAwLjk1OyB9XG4gIGlmICh0aGlzLnRpbWUgPj0gU1RSRVRDSF9MSU5FKSAgIHsgdGhpcy5saW5lLmFscGhhICAgKj0gMC45NTsgfVxufTtcblxuZnVuY3Rpb24gaW50ZXJwb2xhdGUoY3VycmVudCwgaW5wdXRNaW4sIGlucHV0TWF4LCBvdXRwdXRNaW4sIG91dHB1dE1heCkge1xuICByZXR1cm4gb3V0cHV0TWluICsgKGN1cnJlbnQgLyAoaW5wdXRNYXgtaW5wdXRNaW4pKSAqIChvdXRwdXRNYXggLSBvdXRwdXRNaW4pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEJvb207XG4iLCJ2YXIgRW50aXR5ID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2VudGl0eScpO1xudmFyIEdGID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2dyYXBoaWNzLWZhY3RvcnknKTtcbnZhciB1c2VySW50ZXJmYWNlID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL3VzZXItaW50ZXJmYWNlJyk7XG5cbnZhciBURVhUX1RPUCAgICAgICAgICA9IHVzZXJJbnRlcmZhY2UudW5pdCgyLjg1KTtcbnZhciBQTEFZRVJTX01BUkdJTl9YICA9IHVzZXJJbnRlcmZhY2UudW5pdCgyMCk7XG5cbmZ1bmN0aW9uIEh1ZCh0ZXh0KSB7XG4gIFxuICB0aGlzLmlkID0gJ2h1ZCc7XG4gIFxuICB0aGlzLnAxTmFtZSA9IEdGLnRleHQoJ0pvaG4gRG9lJywgdXNlckludGVyZmFjZS51bml0KDMpLCB7ZmlsbDogJyMwMTUxOGQnLCBzdHJva2U6ICcjZmZmJywgc3Ryb2tlVGhpY2tuZXNzOiAzIH0pO1xuICB0aGlzLnAxTmFtZS5wb3NpdGlvbi54ID0gdXNlckludGVyZmFjZS51bml0KDIwKSAtIHRoaXMucDFOYW1lLndpZHRoIC8gMjtcbiAgdGhpcy5wMU5hbWUucG9zaXRpb24ueSA9IFRFWFRfVE9QO1xuXG4gIHRoaXMucDJOYW1lID0gR0YudGV4dCgnSm9obiBEb2UnLCB1c2VySW50ZXJmYWNlLnVuaXQoMyksIHtmaWxsOiAnI2JmMDAwMCcsIHN0cm9rZTogJyNmZmYnLCBzdHJva2VUaGlja25lc3M6IDMgfSk7XG4gIHRoaXMucDJOYW1lLnBvc2l0aW9uLnggPSB1c2VySW50ZXJmYWNlLndpZHRoIC0gdXNlckludGVyZmFjZS51bml0KDE3KSAtIHRoaXMucDJOYW1lLndpZHRoIC8gMjtcbiAgdGhpcy5wMk5hbWUucG9zaXRpb24ueSA9IFRFWFRfVE9QO1xuXG4gIHRoaXMucDFTY29yZSA9IEdGLnRleHQoJzAnLCB1c2VySW50ZXJmYWNlLnVuaXQoMyksIHtmaWxsOiAnI2ZmZicsIHN0cm9rZTogJyMwMDAnLCBzdHJva2VUaGlja25lc3M6IDMgfSk7XG4gIHRoaXMucDFTY29yZS5wb3NpdGlvbi54ID0gdXNlckludGVyZmFjZS51bml0KDMzLjUpIC0gdGhpcy5wMVNjb3JlLndpZHRoIC8gMjtcbiAgdGhpcy5wMVNjb3JlLnBvc2l0aW9uLnkgPSBURVhUX1RPUDtcblxuICB0aGlzLnAyU2NvcmUgPSBHRi50ZXh0KCcwJywgdXNlckludGVyZmFjZS51bml0KDMpLCB7ZmlsbDogJyNmZmYnLCBzdHJva2U6ICcjMDAwJywgc3Ryb2tlVGhpY2tuZXNzOiAzIH0pO1xuICB0aGlzLnAyU2NvcmUucG9zaXRpb24ueCA9IHVzZXJJbnRlcmZhY2Uud2lkdGggLSB1c2VySW50ZXJmYWNlLnVuaXQoMzYpIC0gdGhpcy5wMlNjb3JlLndpZHRoIC8gMjtcbiAgdGhpcy5wMlNjb3JlLnBvc2l0aW9uLnkgPSBURVhUX1RPUDtcblxuICB0aGlzLnRpbWUgPSBHRi50ZXh0KGZvdXJEaWdpdHMoMCksIHVzZXJJbnRlcmZhY2UudW5pdCgzKSwge2ZpbGw6ICcjZmZmJywgc3Ryb2tlOiAnIzAwMCcsIHN0cm9rZVRoaWNrbmVzczogMyB9KTtcbiAgdGhpcy50aW1lLnBvc2l0aW9uLnggPSB1c2VySW50ZXJmYWNlLndpZHRoIC8gMiAtIHRoaXMudGltZS53aWR0aCAvIDI7XG4gIHRoaXMudGltZS5wb3NpdGlvbi55ID0gVEVYVF9UT1A7XG4gICAgXG59O1xuXG5IdWQucHJvdG90eXBlID0gbmV3IEVudGl0eSgpO1xuXG5IdWQucHJvdG90eXBlLmNyZWF0ZSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSkge1xuICBlbmdpbmUuZ3JhcGhpY3MuYWRkKHRoaXMucDFOYW1lKTtcbiAgZW5naW5lLmdyYXBoaWNzLmFkZCh0aGlzLnAxU2NvcmUpO1xuICBlbmdpbmUuZ3JhcGhpY3MuYWRkKHRoaXMucDJOYW1lKTtcbiAgZW5naW5lLmdyYXBoaWNzLmFkZCh0aGlzLnAyU2NvcmUpO1xuICBlbmdpbmUuZ3JhcGhpY3MuYWRkKHRoaXMudGltZSk7XG59O1xuXG5IdWQucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgZW5naW5lLmdyYXBoaWNzLnJlbW92ZSh0aGlzLnAxTmFtZSk7XG4gIGVuZ2luZS5ncmFwaGljcy5yZW1vdmUodGhpcy5wMVNjb3JlKTtcbiAgZW5naW5lLmdyYXBoaWNzLnJlbW92ZSh0aGlzLnAyTmFtZSk7XG4gIGVuZ2luZS5ncmFwaGljcy5yZW1vdmUodGhpcy5wMlNjb3JlKTtcbiAgZW5naW5lLmdyYXBoaWNzLnJlbW92ZSh0aGlzLnRpbWUpO1xufTtcblxuSHVkLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUsIGRlbHRhKSB7XG4gIHZhciBwMSA9IGdhbWUucGxheWVyc1swXTtcbiAgdmFyIHAyID0gZ2FtZS5wbGF5ZXJzWzFdO1xuICB0aGlzLnAxTmFtZS5zZXRUZXh0KHAxLm5hbWUpO1xuICB0aGlzLnAxU2NvcmUuc2V0VGV4dChwMS5zY29yZS50b1N0cmluZygpKTtcbiAgdGhpcy5wMk5hbWUuc2V0VGV4dChwMi5uYW1lKTtcbiAgdGhpcy5wMlNjb3JlLnNldFRleHQocDIuc2NvcmUudG9TdHJpbmcoKSk7XG4gIHRoaXMudGltZS5zZXRUZXh0KGZvdXJEaWdpdHMoZ2FtZS50aW1lUmVtYWluaW5nKSk7XG59O1xuXG5mdW5jdGlvbiBmb3VyRGlnaXRzKG1pbGxpc2Vjb25kcykge1xuICB2YXIgc2Vjb25kcyA9IE1hdGguZmxvb3IobWlsbGlzZWNvbmRzIC8gMTAwMCk7XG4gIHZhciBwYWRkZWQgPSAoc2Vjb25kcyA8IDEwKSA/ICgnMCcgKyBzZWNvbmRzKSA6IHNlY29uZHM7XG4gIHJldHVybiAnMDA6JyArIHBhZGRlZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBIdWQ7XG4iLCJ2YXIgXyA9IHJlcXVpcmUoJy4uLy4uLy4uLzNyZHBhcnR5L3VuZGVyc2NvcmUtbWluJyk7XG52YXIgRW50aXR5ID0gcmVxdWlyZSgnLi9lbnRpdHknKTtcblxudmFyIGdsb2JhbENvdW50ID0gMDtcblxudmFyIENvbXBvdW5kRW50aXR5ID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuaWQgICAgICAgPSAoKytnbG9iYWxDb3VudCk7XG4gIHRoaXMuZW50aXRpZXMgPSBbXTtcbn07XG5cbkNvbXBvdW5kRW50aXR5LnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgdGhpcy5lbnRpdGllcy5mb3JFYWNoKGZ1bmN0aW9uKGVudGl0eSkge1xuICAgIGVudGl0eS5jcmVhdGUoZW5naW5lLCBnYW1lKTtcbiAgfSk7XG59O1xuXG5Db21wb3VuZEVudGl0eS5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSkge1xuICB0aGlzLmVudGl0aWVzLmZvckVhY2goZnVuY3Rpb24oZW50aXR5KSB7XG4gICAgZW50aXR5LmRlc3Ryb3koZW5naW5lLCBnYW1lKTtcbiAgfSk7XG59O1xuXG5Db21wb3VuZEVudGl0eS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lKSB7XG4gIHRoaXMuZW50aXRpZXMuZm9yRWFjaChmdW5jdGlvbihlbnRpdHkpIHtcbiAgICBlbnRpdHkudXBkYXRlKGVuZ2luZSwgZ2FtZSk7XG4gIH0pO1xufTtcblxuQ29tcG91bmRFbnRpdHkucHJvdG90eXBlLmNvbGxpc2lvbiA9IGZ1bmN0aW9uKG90aGVyLCBwb2ludHMpIHtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQ29tcG91bmRFbnRpdHk7XG4iLCJ2YXIgR0YgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZ3JhcGhpY3MtZmFjdG9yeScpO1xudmFyIEVudGl0eSAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2VudGl0eScpO1xudmFyIHdvcmxkICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL3dvcmxkJyk7XG52YXIgYXNzZXRzICAgICAgPSByZXF1aXJlKCcuLi8uLi9hc3NldHMnKTtcbnZhciBnYW1lV29ybGQgICA9IHJlcXVpcmUoJy4uL3dvcmxkJyk7XG5cbmZ1bmN0aW9uIEJhY2tncm91bmQoaW1hZ2UpIHtcbiAgdGhpcy5pZCA9ICdiYWNrZ3JvdW5kJztcbiAgdGhpcy5zcHJpdGUgPSBHRi5hbmltYXRpb24oYXNzZXRzLmltYWdlcygnc3RhZGl1bScsICdzdGFkaXVtLXNoYWtlLXJpZ2h0JywgJ3N0YWRpdW0tc2hha2UtbGVmdCcpLCBnYW1lV29ybGQud2lkdGgsIGdhbWVXb3JsZC5oZWlnaHQpO1xufVxuXG5CYWNrZ3JvdW5kLnByb3RvdHlwZSA9IG5ldyBFbnRpdHkoKTtcblxuQmFja2dyb3VuZC5wcm90b3R5cGUuc2hha2UgPSBmdW5jdGlvbihhZ2FpbnN0UGxheWVySW5kZXgpIHtcbiAgdGhpcy5zcHJpdGUuZ290b0FuZFN0b3AoYWdhaW5zdFBsYXllckluZGV4ID09PSAwID8gMiA6IDEpO1xuICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuc3ByaXRlLmdvdG9BbmRTdG9wKGFnYWluc3RQbGF5ZXJJbmRleCA9PT0gMCA/IDEgOiAyKTtcbiAgfS5iaW5kKHRoaXMpLCA1MCk7XG4gIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5zcHJpdGUuZ290b0FuZFN0b3AoMCk7XG4gIH0uYmluZCh0aGlzKSwgMTAwKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQmFja2dyb3VuZDtcbiIsInZhciBfICAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uLy4uLy4uLzNyZHBhcnR5L3VuZGVyc2NvcmUtbWluJyk7XG52YXIgUEYgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvcGh5c2ljcy1mYWN0b3J5Jyk7XG52YXIgR0YgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZ3JhcGhpY3MtZmFjdG9yeScpO1xudmFyIEVudGl0eSAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2VudGl0eScpO1xudmFyIHdvcmxkICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL3dvcmxkJyk7XG52YXIgaHViICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvaHViJyk7XG52YXIgYXNzZXRzICAgICAgPSByZXF1aXJlKCcuLi8uLi9hc3NldHMnKTtcblxudmFyIFBJID0gMy4xNDE1OTtcblxudmFyIGZpeHR1cmVPcHRzID0ge1xuICBkeW5hbWljczogICB7ZGVuc2l0eTogMS41LCBmcmljdGlvbjogMSwgcmVzdGl0dXRpb246IDF9LFxuICBjYXRlZ29yeTogICBQRi5jYXRlZ29yaWVzLkFSRU5BLFxuICBjb2xsaXNpb246ICBQRi5jYXRlZ29yaWVzLkFMTFxufTtcblxuZnVuY3Rpb24gQ29uZShpZCwgeCwgeSkge1xuICB0aGlzLmlkID0gaWQ7XG4gIHRoaXMuc3ByaXRlID0gR0Yuc3ByaXRlKGFzc2V0cy5pbWFnZSgnY29uZScpLCAyLjUsIDQpO1xuICB0aGlzLmJvZHlTcGVjID0ge1xuICAgIGJvZHk6IFBGLmR5bmFtaWMoeyB4OiB4LCB5OiB5LCBmaXhlZFJvdGF0aW9uOiB0cnVlIH0pLFxuICAgIGZpeHR1cmU6IFBGLmZpeHR1cmUoXy5leHRlbmQoZml4dHVyZU9wdHMsIHtcbiAgICAgIHNoYXBlOiBQRi5zaGFwZS5jaXJjbGUoMC43LCBuZXcgQm94MkQuQ29tbW9uLk1hdGguYjJWZWMyKDAsMC42KSlcbiAgICB9KSlcbiAgfTtcbn1cblxuQ29uZS5wcm90b3R5cGUgPSBuZXcgRW50aXR5KCk7XG5cbkNvbmUucHJvdG90eXBlLmNyZWF0ZSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSkge1xuICBFbnRpdHkucHJvdG90eXBlLmNyZWF0ZS5jYWxsKHRoaXMsIGVuZ2luZSwgZ2FtZSk7XG4gIHZhciBvdGhlckZpeHR1cmUgPSBQRi5maXh0dXJlKF8uZXh0ZW5kKGZpeHR1cmVPcHRzLCB7XG4gICAgc2hhcGU6IFBGLnNoYXBlLmJveCgwLjcsIDEuOSwgbmV3IEJveDJELkNvbW1vbi5NYXRoLmIyVmVjMigwLC0wLjEpKVxuICB9KSk7XG4gIG90aGVyRml4dHVyZS51c2VyRGF0YSA9IHRoaXM7XG4gIHRoaXMuYm9keS5DcmVhdGVGaXh0dXJlKG90aGVyRml4dHVyZSk7XG4gIHRoaXMuYm9keS5TZXRMaW5lYXJEYW1waW5nKDYpO1xufTtcblxuQ29uZS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lLCBkZWx0YSkge1xuICBFbnRpdHkucHJvdG90eXBlLnVwZGF0ZS5jYWxsKHRoaXMsIGRlbHRhKTtcbiAgLy8gV2Ugc2hvdWxkIGJlIGFibGUgdG8gc3BlY2lmeSBcIjAuNVwiLCBhbmQgbm90IGhhdmUgdG8gdXBkYXRlIGl0IGNvbnN0YW50bHlcbiAgLy8gTmVlZCB0byBjaGVjayBvdXIgY2hhbmdlcyB0byBQSVhJXG4gIHRoaXMuc3ByaXRlLmFuY2hvci54ID0gdGhpcy5zcHJpdGUudGV4dHVyZS53aWR0aCAgLyAyO1xuICB0aGlzLnNwcml0ZS5hbmNob3IueSA9IHRoaXMuc3ByaXRlLnRleHR1cmUuaGVpZ2h0IC8gMztcbn07XG5cbkNvbmUucHJvdG90eXBlLmNvbGxpc2lvbiA9IGZ1bmN0aW9uKG90aGVyLCBwb2ludHMpIHsgICAgXG4gIGlmIChvdGhlci5pZC5tYXRjaCgvYmFsbC8pKSB7XG4gICAgb3RoZXIua2lja2VkQnkgPSB0aGlzLmluZGV4O1xuICAgIGh1Yi5zZW5kKCdlbmdpbmUuc291bmQucGxheScsIHtmaWxlOiAnL2dhbWUvc291bmRzL2JvdW5jZS5tcDMnfSk7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQ29uZTtcbiIsInZhciBQRiAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9waHlzaWNzLWZhY3RvcnknKTtcbnZhciBHRiAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9ncmFwaGljcy1mYWN0b3J5Jyk7XG52YXIgRW50aXR5ICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZW50aXR5Jyk7XG52YXIgd29ybGQgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvd29ybGQnKTtcblxuZnVuY3Rpb24gV2FsbChpZCwgeCwgeSwgd2lkdGgsIGhlaWdodCwgcm90YXRpb24pIHtcbiAgdGhpcy5pZCA9IGlkO1xuICB0aGlzLmJvZHlTcGVjID0ge1xuICAgIGJvZHk6IFBGLnN0YXRpYyh7XG4gICAgICB4OiB4LFxuICAgICAgeTogeSxcbiAgICAgIGFuZ2xlOiByb3RhdGlvbiB8fCAwXG4gICAgfSksXG4gICAgZml4dHVyZTogUEYuZml4dHVyZSh7XG4gICAgICBzaGFwZTogICAgICBQRi5zaGFwZS5ib3god2lkdGgsIGhlaWdodCksXG4gICAgICBkeW5hbWljczogICB7ZGVuc2l0eTogMSwgZnJpY3Rpb246IDAuMSwgcmVzdGl0dXRpb246IDF9LFxuICAgICAgY2F0ZWdvcnk6ICAgUEYuY2F0ZWdvcmllcy5BUkVOQSxcbiAgICAgIGNvbGxpc2lvbjogIFBGLmNhdGVnb3JpZXMuQUxMXG4gICAgfSlcbiAgfTtcbiAgLy8gdGhpcy5zcHJpdGUgPSBHRi50aWxlKCcvZ2FtZS9pbWFnZXMvd2FsbC5wbmcnLCB3aWR0aCwgaGVpZ2h0LCByb3RhdGlvbik7XG4gIC8vIHRoaXMuc3ByaXRlLnBvc2l0aW9uLnggPSB3b3JsZC50b1BpeGVscyh4KTtcbiAgLy8gdGhpcy5zcHJpdGUucG9zaXRpb24ueSA9IHdvcmxkLnRvUGl4ZWxzKHkpO1xufVxuXG5XYWxsLnByb3RvdHlwZSA9IG5ldyBFbnRpdHkoKTtcblxubW9kdWxlLmV4cG9ydHMgPSBXYWxsO1xuIiwidmFyIFBGICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL3BoeXNpY3MtZmFjdG9yeScpO1xudmFyIEdGICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2dyYXBoaWNzLWZhY3RvcnknKTtcbnZhciBFbnRpdHkgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9lbnRpdHknKTtcbnZhciBodWIgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9odWInKTtcblxuZnVuY3Rpb24gR29hbChpZCwgcGxheWVySW5kZXgsIHgsIHksIHdpZHRoLCBoZWlnaHQsIHJvdGF0aW9uKSB7XG4gIHRoaXMuaWQgPSBpZDtcbiAgdGhpcy5wbGF5ZXJJbmRleCA9IHBsYXllckluZGV4O1xuICB0aGlzLmJvZHlTcGVjID0ge1xuICAgIGJvZHk6IFBGLnN0YXRpYyh7XG4gICAgICB4OiB4LFxuICAgICAgeTogeSxcbiAgICAgIGFuZ2xlOiByb3RhdGlvbiB8fCAwXG4gICAgfSksXG4gICAgZml4dHVyZTogUEYuZml4dHVyZSh7XG4gICAgICBzaGFwZTogICAgICBQRi5zaGFwZS5ib3god2lkdGgsIGhlaWdodCksXG4gICAgICBkeW5hbWljczogICB7ZGVuc2l0eTogMSwgZnJpY3Rpb246IDAsIHJlc3RpdHV0aW9uOiAxfSxcbiAgICAgIGNhdGVnb3J5OiAgIFBGLmNhdGVnb3JpZXMuQVJFTkEsXG4gICAgICBjb2xsaXNpb246ICBQRi5jYXRlZ29yaWVzLkFMTFxuICAgIH0pXG4gIH07XG4gIC8vIHRoaXMuc3ByaXRlID0gR0Yuc3ByaXRlKCcvZ2FtZS9pbWFnZXMvZ29hbC5wbmcnLCB3aWR0aCwgaGVpZ2h0LCByb3RhdGlvbik7XG59XG5cbkdvYWwucHJvdG90eXBlID0gbmV3IEVudGl0eSgpO1xuXG5Hb2FsLnByb3RvdHlwZS5jb2xsaXNpb24gPSBmdW5jdGlvbihvdGhlciwgcG9pbnRzKSB7ICAgIFxuICBpZiAob3RoZXIuaWQubWF0Y2goL2JhbGw6LykpIHtcbiAgICBodWIuc2VuZCgnZ2FtZS5zY29yZScsIHtcbiAgICAgIGJhbGw6IG90aGVyLFxuICAgICAgYWdhaW5zdEluZGV4OiB0aGlzLnBsYXllckluZGV4LFxuICAgIH0pO1xuICAgIGh1Yi5zZW5kKCdlbmdpbmUuZXhwbG9zaW9uJywge1xuICAgICAgc291cmNlOiBwb2ludHNbMF0sXG4gICAgICBzaXplOiAnbGFyZ2UnXG4gICAgfSk7XG4gIH1cbn07XG5cbkdvYWwucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKGRlbHRhKSB7XG4gIEVudGl0eS5wcm90b3R5cGUudXBkYXRlLmNhbGwodGhpcywgZGVsdGEpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBHb2FsO1xuIl19
;