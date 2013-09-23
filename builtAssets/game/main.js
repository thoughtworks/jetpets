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

},{"./asset-loader":2,"./bridge-keyboard":3,"./bridge-socket":4,"./engine/engine":5,"./intro/intro":6,"./game/game":7,"./game/world":8,"./engine/hub":9}],3:[function(require,module,exports){

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

},{"./assets":10}],4:[function(require,module,exports){
var io = require('../../3rdparty/socket.io.min');

exports.connect = function(matchStart, playerMove) {

  var socket = io.connect('/');

  socket.emit('identify')
  socket.on('match-start', matchStart);
  socket.on('player-action', playerAction);
  
  function playerAction(args) {
    if (args.action === 'up') {
      console.log('[socket] move '  + args.pindex + ' up');
      playerMove({pindex: args.pindex, dir: 'up'});
    } else if (args.action === 'down') {
      console.log('[socket] move '  + args.pindex + ' down');
      playerMove({pindex: args.pindex, dir: 'down'});
    }
  }

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

},{"../../../3rdparty/underscore-min":12,"./graphics-engine":13,"./physics-engine":14,"./sound-engine":15,"./ticker":16,"./particle-engine":17,"./entitytracker":18,"./time":19,"./hub":9}],6:[function(require,module,exports){
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

},{"../../../3rdparty/underscore-min":12,"./entities/Leaderboard":20,"./entities/Title":21,"../engine/hub":9,"./entities/About":22}],7:[function(require,module,exports){
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
},{}],16:[function(require,module,exports){

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

},{"../../../3rdparty/underscore-min":12,"./hub":9}],17:[function(require,module,exports){
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

},{"../../engine/entity":35,"../../engine/graphics-factory":36,"../../assets":10,"../../engine/user-interface":32}],22:[function(require,module,exports){
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

},{"../../engine/entity":35,"../../engine/graphics-factory":36,"../../engine/user-interface":32,"../../assets":10}],26:[function(require,module,exports){
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

},{"../../engine/graphics-factory":36,"../entities/stadium":37,"../entities/crowd":38,"../entities/player":39,"../entities/hud":40,"../entities/action-text":25,"../world":8}],24:[function(require,module,exports){
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

},{"../../engine/physics-factory":41,"../../engine/graphics-factory":36,"../../engine/entity":35,"../../engine/world":33,"../../engine/math-utils":42,"../../engine/hub":9,"../../assets":10}],25:[function(require,module,exports){
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

},{"../../engine/graphics-factory":36,"../../engine/entity":35,"../../engine/user-interface":32}],27:[function(require,module,exports){
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

},{"../../../../3rdparty/underscore-min":12,"../../engine/graphics-factory":36,"../../engine/hub":9,"../entities/ball":24,"../entities/action-text":25,"../world":8}],29:[function(require,module,exports){
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

},{"../entities/boom":43,"../entities/action-text":25,"../../engine/hub":9}],28:[function(require,module,exports){
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

},{"../time-based-message":44,"../../engine/math-utils":42}],30:[function(require,module,exports){
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

},{}],42:[function(require,module,exports){

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
},{"../../../3rdparty/underscore-min":12,"./entity":35,"./world":33,"./hub":9,"./math-utils":42}],35:[function(require,module,exports){
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

},{"../../../3rdparty/underscore-min":12,"./world":33}],41:[function(require,module,exports){
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
  

},{"../../../3rdparty/underscore-min":12}],44:[function(require,module,exports){
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

},{"../engine/hub":9}],37:[function(require,module,exports){
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

},{"../../engine/compound-entity":46,"./background":47,"./wall":48,"./cone":49,"./goal":50,"../world":8}],38:[function(require,module,exports){
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

},{"../../engine/entity":35,"../../engine/hub":9,"../../assets":10}],39:[function(require,module,exports){
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

},{"../../engine/physics-factory":41,"../../engine/graphics-factory":36,"../../engine/entity":35,"../world":8,"../../assets":10,"../../engine/hub":9}],40:[function(require,module,exports){
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

},{"../../engine/entity":35,"../../engine/graphics-factory":36,"../../engine/user-interface":32}],43:[function(require,module,exports){
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

},{"../../engine/graphics-factory":36,"../../engine/entity":35,"../../engine/user-interface":32,"../../engine/math-utils":42,"../../assets":10}],45:[function(require,module,exports){
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

},{"../../engine/graphics-factory":36,"../../engine/entity":35,"../../engine/user-interface":32}],46:[function(require,module,exports){
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

},{"../../engine/graphics-factory":36,"../../engine/entity":35,"../../engine/world":33,"../../assets":10,"../world":8}],49:[function(require,module,exports){
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

},{"../../../../3rdparty/underscore-min":12,"../../engine/physics-factory":41,"../../engine/graphics-factory":36,"../../engine/entity":35,"../../engine/world":33,"../../engine/hub":9,"../../assets":10}],48:[function(require,module,exports){
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

},{"../../engine/physics-factory":41,"../../engine/graphics-factory":36,"../../engine/entity":35,"../../engine/world":33}],50:[function(require,module,exports){
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

},{"../../engine/physics-factory":41,"../../engine/graphics-factory":36,"../../engine/entity":35,"../../engine/hub":9}]},{},[1])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL21haW4uanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2JyaWRnZS1rZXlib2FyZC5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS93b3JsZC5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvYXNzZXQtbG9hZGVyLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9icmlkZ2Utc29ja2V0LmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvZW5naW5lLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9pbnRyby9pbnRyby5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS9nYW1lLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvaHViLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvM3JkcGFydHkvc29ja2V0LmlvLm1pbi5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzLzNyZHBhcnR5L3VuZGVyc2NvcmUtbWluLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvdGlja2VyLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvZW50aXR5dHJhY2tlci5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZW5naW5lL3RpbWUuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy8zcmRwYXJ0eS9ldmUuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2Fzc2V0cy5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZW5naW5lL2dyYXBoaWNzLWVuZ2luZS5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZW5naW5lL3BoeXNpY3MtZW5naW5lLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvc291bmQtZW5naW5lLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvcGFydGljbGUtZW5naW5lLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9nYW1lL3NlcXVlbmNlci5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvaW50cm8vZW50aXRpZXMvTGVhZGVyYm9hcmQuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2ludHJvL2VudGl0aWVzL1RpdGxlLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9pbnRyby9lbnRpdGllcy9BYm91dC5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS9zdGF0ZXMvd2FybXVwLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9nYW1lL2VudGl0aWVzL2JhbGwuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvZW50aXRpZXMvYWN0aW9uLXRleHQuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvc3RhdGVzL2tpY2tvZmYuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvc3RhdGVzL3Njb3JlZC5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS9zdGF0ZXMvcGxheS5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS9zdGF0ZXMvZW5kb2ZtYXRjaC5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZW5naW5lL3VzZXItaW50ZXJmYWNlLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvd29ybGQuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2VuZ2luZS9tYXRoLXV0aWxzLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvZXhwbG9zaW9uLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvZW50aXR5LmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvZ3JhcGhpY3MtZmFjdG9yeS5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZW5naW5lL3BoeXNpY3MtZmFjdG9yeS5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS90aW1lLWJhc2VkLW1lc3NhZ2UuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvZW50aXRpZXMvc3RhZGl1bS5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS9lbnRpdGllcy9jcm93ZC5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS9lbnRpdGllcy9wbGF5ZXIuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvZW50aXRpZXMvaHVkLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9nYW1lL2VudGl0aWVzL2Jvb20uanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvZW50aXRpZXMvd2lubmVyLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9lbmdpbmUvY29tcG91bmQtZW50aXR5LmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9nYW1lL2VudGl0aWVzL2JhY2tncm91bmQuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9nYW1lL2pzL2dhbWUvZW50aXRpZXMvY29uZS5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2dhbWUvanMvZ2FtZS9lbnRpdGllcy93YWxsLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZ2FtZS9qcy9nYW1lL2VudGl0aWVzL2dvYWwuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTs7QUNEQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25YQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsidmFyIGFzc2V0TG9hZGVyICAgICA9IHJlcXVpcmUoJy4vYXNzZXQtbG9hZGVyJyk7XG52YXIgYnJpZGdlU29ja2V0ICAgID0gcmVxdWlyZSgnLi9icmlkZ2Utc29ja2V0Jyk7XG52YXIgYnJpZGdlS2V5Ym9hcmQgID0gcmVxdWlyZSgnLi9icmlkZ2Uta2V5Ym9hcmQnKTtcbnZhciBFbmdpbmUgICAgICAgICAgPSByZXF1aXJlKCcuL2VuZ2luZS9lbmdpbmUnKTtcbnZhciBJbnRybyAgICAgICAgICAgPSByZXF1aXJlKCcuL2ludHJvL2ludHJvJylcbnZhciBHYW1lICAgICAgICAgICAgPSByZXF1aXJlKCcuL2dhbWUvZ2FtZScpO1xudmFyIHdvcmxkICAgICAgICAgICA9IHJlcXVpcmUoJy4vZ2FtZS93b3JsZCcpO1xudmFyIGh1YiAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vZW5naW5lL2h1YicpO1xuXG53aW5kb3cuTWFpbiA9IGZ1bmN0aW9uKCkge1xuICBhc3NldExvYWRlci5wcmVsb2FkQW5kUnVuKG1haW5Mb29wKTtcbn07XG5cbmZ1bmN0aW9uIG1haW5Mb29wKCkge1xuICBcbiAgdmFyIGNvbnRhaW5lciAgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjY29udGFpbmVyJyk7XG4gIHZhciBnYW1lVmlldyAgID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2dhbWVWaWV3Jyk7XG4gIHZhciBkZWJ1Z1ZpZXcgID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2RlYnVnVmlldycpO1xuICBcbiAgZGVidWdWaWV3LmhlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodDtcbiAgZGVidWdWaWV3LndpZHRoICA9IHdpbmRvdy5pbm5lcldpZHRoO1xuICBnYW1lVmlldy5oZWlnaHQgID0gd2luZG93LmlubmVySGVpZ2h0O1xuICBnYW1lVmlldy53aWR0aCAgID0gd2luZG93LmlubmVyV2lkdGg7XG4gIFxuICB2YXIgZW5naW5lID0gbmV3IEVuZ2luZSh3b3JsZCwgZ2FtZVZpZXcsIGRlYnVnVmlldyk7XG4gIHZhciBnYW1lICAgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIHNob3dJbnRybygpIHtcbiAgICBjbGVhbnVwKCk7XG4gICAgZW5naW5lLmF0dGFjaChuZXcgSW50cm8oZW5naW5lKSk7XG4gIH1cblxuICBmdW5jdGlvbiBtYXRjaFN0YXJ0KHBsYXllcnMpIHtcbiAgICBjbGVhbnVwKCk7XG4gICAgaWYgKCFnYW1lKSB7XG4gICAgICBnYW1lID0gbmV3IEdhbWUoZW5naW5lLCBwbGF5ZXJzKTtcbiAgICAgIGVuZ2luZS5hdHRhY2goZ2FtZSk7XG4gICAgICBodWIub24oJ2dhbWUuZmluaXNoJywgZW5kTWF0Y2hPblNlcnZlcik7XG4gICAgfVxuICB9XG4gIFxuICBmdW5jdGlvbiBwbGF5ZXJNb3ZlKGFyZ3MpIHsgICAgXG4gICAgaWYgKGdhbWUpIHtcbiAgICAgIGdhbWUubW92ZShhcmdzLnBpbmRleCwgYXJncy5kaXIpO1xuICAgIH1cbiAgfVxuICBcbiAgZnVuY3Rpb24gZW5kTWF0Y2hPblNlcnZlcigpIHtcbiAgICAkLnBvc3QoJy9nYW1lL3N0YXR1cycsIHtcbiAgICAgIHN0YXR1czogJ2ZpbmlzaGVkJyxcbiAgICAgIHBsYXllcnM6IGdhbWUucGxheWVycy5tYXAoZnVuY3Rpb24ocGxheWVyKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgaWQ6IHBsYXllci5pZCxcbiAgICAgICAgICBzY29yZTogcGxheWVyLnNjb3JlXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfSkudGhlbihzaG93SW50cm8pLmZhaWwoc2hvd0ludHJvKTtcbiAgfVxuICBcbiAgZnVuY3Rpb24gY2xlYW51cCgpIHtcbiAgICBodWIudW5iaW5kKCdnYW1lLionKTtcbiAgICBlbmdpbmUuZGV0YWNoKCk7XG4gICAgZW5naW5lLnJlc2V0KCk7XG4gICAgZ2FtZSA9IG51bGw7XG4gIH0gIFxuXG4gIGVuZ2luZS5zdGFydCgpO1xuICBzaG93SW50cm8oKTtcbiAgYnJpZGdlS2V5Ym9hcmQuY29ubmVjdChtYXRjaFN0YXJ0LCBwbGF5ZXJNb3ZlKTtcbiAgYnJpZGdlU29ja2V0LmNvbm5lY3QobWF0Y2hTdGFydCwgcGxheWVyTW92ZSk7XG59XG4iLCJcbmV4cG9ydHMuY29ubmVjdCA9IGZ1bmN0aW9uKG1hdGNoU3RhcnQsIHBsYXllck1vdmUpIHtcblxuICB2YXIga2V5ZG93biAgICAgICA9ICQoZG9jdW1lbnQpLmtleWRvd25Bc09ic2VydmFibGUoKS5zZWxlY3Qoa2V5Q29kZSk7XG4gIHZhciBrZXl1cCAgICAgICAgID0gJChkb2N1bWVudCkua2V5dXBBc09ic2VydmFibGUoKTtcbiAgdmFyIHNpbmdsZWRvd24gICAgPSBrZXlkb3duLm1lcmdlKGtleXVwKS5kaXN0aW5jdFVudGlsQ2hhbmdlZCgpO1xuICBcbiAgc2luZ2xlZG93bi53aGVyZShrZXkoMTMpKS5zdWJzY3JpYmUoc3RhcnQpO1xuICBzaW5nbGVkb3duLndoZXJlKGxldHRlcignUScpKS5zdWJzY3JpYmUobW92ZSgwLCAndXAnKSk7XG4gIHNpbmdsZWRvd24ud2hlcmUobGV0dGVyKCdTJykpLnN1YnNjcmliZShtb3ZlKDAsICdkb3duJykpO1xuICBzaW5nbGVkb3duLndoZXJlKGxldHRlcignUCcpKS5zdWJzY3JpYmUobW92ZSgxLCAndXAnKSk7XG4gIHNpbmdsZWRvd24ud2hlcmUobGV0dGVyKCdMJykpLnN1YnNjcmliZShtb3ZlKDEsICdkb3duJykpO1xuXG4gIGZ1bmN0aW9uIGtleUNvZGUoZSkge1xuICAgIHJldHVybiBlLmtleUNvZGU7XG4gIH1cblxuICBmdW5jdGlvbiBrZXkoYykge1xuICAgIHJldHVybiBmdW5jdGlvbihjb2RlKSB7XG4gICAgICByZXR1cm4gY29kZSA9PT0gYztcbiAgICB9O1xuICB9XG4gIFxuICBmdW5jdGlvbiBsZXR0ZXIobCkge1xuICAgIHJldHVybiBmdW5jdGlvbihjb2RlKSB7XG4gICAgICByZXR1cm4gY29kZSA9PT0gbC5jaGFyQ29kZUF0KDApO1xuICAgIH07XG4gIH1cbiAgXG4gIGZ1bmN0aW9uIHN0YXJ0KCkge1xuICAgIG1hdGNoU3RhcnQoW1xuICAgICAgeyBpZDogJzEnLCBmaXJzdE5hbWU6ICdKb2huJywgbGFzdE5hbWU6ICdEb2UnICAgfSxcbiAgICAgIHsgaWQ6ICcyJywgZmlyc3ROYW1lOiAnQmlsbCcsIGxhc3ROYW1lOiAnQ29zYnknIH1cbiAgICBdKTtcbiAgfVxuICBcbiAgZnVuY3Rpb24gbW92ZShpbmRleCwgZGlyKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkgeyBcbiAgICAgIGNvbnNvbGUubG9nKCdba2V5Ym9hcmRdIG1vdmUgJyArIGluZGV4ICsgJyAnICsgZGlyKTtcbiAgICAgIHBsYXllck1vdmUoe1xuICAgICAgICBwaW5kZXg6IGluZGV4LFxuICAgICAgICBkaXI6IGRpclxuICAgICAgfSk7XG4gICAgfTtcbiAgfVxuICBcbn07XG4iLCJcbi8vIFRoZSBiaWcgVFYgZm9yIHRoZSBnYW1lIGlzIDE2OjlcbmV4cG9ydHMud2lkdGggID0gNjA7XG5leHBvcnRzLmhlaWdodCA9IDYwIC8gKDE2LzkpO1xuIiwidmFyIGFzc2V0cyA9IHJlcXVpcmUoJy4vYXNzZXRzJyk7XG5cbmZ1bmN0aW9uIGxvYWRJbWFnZXMoY2FsbGJhY2spIHtcbiAgdmFyIGFzc2V0TG9hZGVyID0gbmV3IFBJWEkuQXNzZXRMb2FkZXIoYXNzZXRzLmFsbEltYWdlcygpKTtcbiAgYXNzZXRMb2FkZXIub25Db21wbGV0ZSA9IGNhbGxiYWNrO1xuICBhc3NldExvYWRlci5sb2FkKCk7XG59XG5cbmZ1bmN0aW9uIGxvYWRGb250cyhjYWxsYmFjaykge1xuICBXZWJGb250LmxvYWQoe1xuICAgIGFjdGl2ZTogY2FsbGJhY2ssXG4gICAgY3VzdG9tOiB7XG4gICAgICBmYW1pbGllczogWydMdWNraWVzdEd1eSddLFxuICAgICAgdXJsczogWycvM3JkcGFydHkvbHVja2llc3QtZ3V5LmNzcyddLFxuICAgIH1cbiAgfSk7XG59XG5cbmV4cG9ydHMucHJlbG9hZEFuZFJ1biA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gIGxvYWRJbWFnZXMoZnVuY3Rpb24oKSB7XG4gICAgbG9hZEZvbnRzKGZ1bmN0aW9uKCkge1xuICAgICAgY2FsbGJhY2soKTtcbiAgICB9KTtcbiAgfSk7XG59XG4iLCJ2YXIgaW8gPSByZXF1aXJlKCcuLi8uLi8zcmRwYXJ0eS9zb2NrZXQuaW8ubWluJyk7XG5cbmV4cG9ydHMuY29ubmVjdCA9IGZ1bmN0aW9uKG1hdGNoU3RhcnQsIHBsYXllck1vdmUpIHtcblxuICB2YXIgc29ja2V0ID0gaW8uY29ubmVjdCgnLycpO1xuXG4gIHNvY2tldC5lbWl0KCdpZGVudGlmeScpXG4gIHNvY2tldC5vbignbWF0Y2gtc3RhcnQnLCBtYXRjaFN0YXJ0KTtcbiAgc29ja2V0Lm9uKCdwbGF5ZXItYWN0aW9uJywgcGxheWVyQWN0aW9uKTtcbiAgXG4gIGZ1bmN0aW9uIHBsYXllckFjdGlvbihhcmdzKSB7XG4gICAgaWYgKGFyZ3MuYWN0aW9uID09PSAndXAnKSB7XG4gICAgICBjb25zb2xlLmxvZygnW3NvY2tldF0gbW92ZSAnICArIGFyZ3MucGluZGV4ICsgJyB1cCcpO1xuICAgICAgcGxheWVyTW92ZSh7cGluZGV4OiBhcmdzLnBpbmRleCwgZGlyOiAndXAnfSk7XG4gICAgfSBlbHNlIGlmIChhcmdzLmFjdGlvbiA9PT0gJ2Rvd24nKSB7XG4gICAgICBjb25zb2xlLmxvZygnW3NvY2tldF0gbW92ZSAnICArIGFyZ3MucGluZGV4ICsgJyBkb3duJyk7XG4gICAgICBwbGF5ZXJNb3ZlKHtwaW5kZXg6IGFyZ3MucGluZGV4LCBkaXI6ICdkb3duJ30pO1xuICAgIH1cbiAgfVxuXG59O1xuIiwidmFyIF8gICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uLy4uLzNyZHBhcnR5L3VuZGVyc2NvcmUtbWluJyk7XG52YXIgR3JhcGhpY3NFbmdpbmUgID0gcmVxdWlyZSgnLi9ncmFwaGljcy1lbmdpbmUnKTtcbnZhciBQaHlzaWNzRW5naW5lICAgPSByZXF1aXJlKCcuL3BoeXNpY3MtZW5naW5lJyk7XG52YXIgU291bmRFbmdpbmUgICAgID0gcmVxdWlyZSgnLi9zb3VuZC1lbmdpbmUnKTtcbnZhciBQYXJ0aWNsZUVuZ2luZSAgPSByZXF1aXJlKCcuL3BhcnRpY2xlLWVuZ2luZScpO1xudmFyIHRpY2tlciAgICAgICAgICA9IHJlcXVpcmUoJy4vdGlja2VyJyk7XG52YXIgRW50aXR5VHJhY2tlciAgID0gcmVxdWlyZSgnLi9lbnRpdHl0cmFja2VyJyk7XG52YXIgVGltZSAgICAgICAgICAgID0gcmVxdWlyZSgnLi90aW1lJyk7XG52YXIgaHViICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9odWInKTtcblxuXG5mdW5jdGlvbiBFbmdpbmUod29ybGQsIG1haW5WaWV3LCBkZWJ1Z1ZpZXcpIHtcbiAgXG4gIHRoaXMubmV4dFRpY2tBY3Rpb25zICA9IFtdO1xuICBcbiAgdGhpcy5ncmFwaGljcyAgICAgPSBuZXcgR3JhcGhpY3NFbmdpbmUod29ybGQsIG1haW5WaWV3LCBkZWJ1Z1ZpZXcpO1xuICB0aGlzLnBoeXNpY3MgICAgICA9IG5ldyBQaHlzaWNzRW5naW5lKC8qZGVidWdWaWV3Ki8pO1xuICB0aGlzLnNvdW5kICAgICAgICA9IG5ldyBTb3VuZEVuZ2luZSgpO1xuICB0aGlzLnBhcnRpY2xlcyAgICA9IG5ldyBQYXJ0aWNsZUVuZ2luZSh0aGlzKTtcbiAgdGhpcy50cmFja2VyICAgICAgPSBuZXcgRW50aXR5VHJhY2tlcigpO1xuICB0aGlzLnRpbWUgICAgICAgICA9IG5ldyBUaW1lKCk7XG4gIFxuICAvLyBObyBnYW1lIGF0dGFjaGVkIHlldFxuICB0aGlzLmdhbWUgPSBudWxsO1xuICAgIFxuICB0aGlzLnBoeXNpY3MuY29sbGlzaW9uKGZ1bmN0aW9uKGZpeHR1cmVBLCBmaXh0dXJlQiwgcG9pbnRzKSB7XG4gICAgdmFyIGVudGl0eUEgPSBmaXh0dXJlQS5HZXRVc2VyRGF0YSgpO1xuICAgIHZhciBlbnRpdHlCID0gZml4dHVyZUIuR2V0VXNlckRhdGEoKTtcbiAgICBpZiAoZW50aXR5QSAmJiBlbnRpdHlCKSB7XG4gICAgICBlbnRpdHlBLmNvbGxpc2lvbihlbnRpdHlCLCBwb2ludHMpO1xuICAgICAgZW50aXR5Qi5jb2xsaXNpb24oZW50aXR5QSwgcG9pbnRzKTsgICAgICBcbiAgICB9XG4gIH0pO1xuICAgXG4gIGh1Yi5pbnRlcmNlcHRvciA9IF8uYmluZCh0aGlzLnF1ZXVlTmV4dCwgdGhpcyk7XG4gIFxuICBodWIub24oJ2VudGl0eTpkZXN0cm95JywgZnVuY3Rpb24ocGFyYW1zKSB7XG4gICAgdGhpcy5kZWxldGVFbnRpdHkocGFyYW1zLmVudGl0eS5pZClcbiAgfS5iaW5kKHRoaXMpKTtcbiAgXG59O1xuXG5FbmdpbmUucHJvdG90eXBlLnN0YXJ0ID0gZnVuY3Rpb24oKSB7XG4gIHRpY2tlci5ydW4odGhpcy51cGRhdGUuYmluZCh0aGlzKSk7XG59O1xuXG5FbmdpbmUucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbigpIHtcbiAgdGlja2VyLnN0b3AoKTtcbn07XG5cbkVuZ2luZS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMudGltZS51cGRhdGUoKTtcbiAgdGhpcy5waHlzaWNzLnVwZGF0ZSgpO1xuICB0aGlzLnRyYWNrZXIuZm9yRWFjaChmdW5jdGlvbihlbnRpdHkpIHtcbiAgICBlbnRpdHkudXBkYXRlKHRoaXMsIHRoaXMuZ2FtZSwgdGhpcy50aW1lLmRlbHRhKTtcbiAgfS5iaW5kKHRoaXMpKTtcbiAgaWYgKHRoaXMuZ2FtZSkge1xuICAgIHRoaXMuZ2FtZS51cGRhdGUodGhpcywgdGhpcy50aW1lLmRlbHRhKTtcbiAgfVxuICB0aGlzLmdyYXBoaWNzLnJlbmRlcigpO1xuICBcbiAgdmFyIG5leHRBY3Rpb24gPSBudWxsO1xuICB3aGlsZSAobmV4dEFjdGlvbiA9IHRoaXMubmV4dFRpY2tBY3Rpb25zLnBvcCgpKSB7XG4gICAgbmV4dEFjdGlvbi5jYWxsKHRoaXMpO1xuICB9XG59O1xuXG5FbmdpbmUucHJvdG90eXBlLnF1ZXVlTmV4dCA9IGZ1bmN0aW9uKGFjdGlvbikge1xuICB0aGlzLm5leHRUaWNrQWN0aW9ucy5wdXNoKGFjdGlvbik7XG59O1xuXG5FbmdpbmUucHJvdG90eXBlLmFkZEVudGl0eSA9IGZ1bmN0aW9uKGVudGl0eSkge1xuICBpZiAoZW50aXR5LmlkKSB7XG4gICAgdGhpcy50cmFja2VyLnRyYWNrKGVudGl0eSk7XG4gICAgZW50aXR5LmNyZWF0ZSh0aGlzLCB0aGlzLmdhbWUpO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUubG9nKCdFbnRpdHkgc2hvdWxkIGhhdmUgYW4gSUQnLCBlbnRpdHkpO1xuICB9XG59O1xuXG5FbmdpbmUucHJvdG90eXBlLmRlbGV0ZUVudGl0eSA9IGZ1bmN0aW9uKGlkKSB7XG4gIHZhciBlbnRpdHkgPSB0aGlzLnRyYWNrZXIuZmluZChpZCk7XG4gIGlmIChlbnRpdHkpIHtcbiAgICBlbnRpdHkuZGVzdHJveSh0aGlzLCB0aGlzLmdhbWUpO1xuICAgIHRoaXMudHJhY2tlci5mb3JnZXQoZW50aXR5KTtcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLmxvZygnRW50aXR5IG5vdCBmb3VuZCcsIGVudGl0eSk7XG4gIH1cbn07XG5cbkVuZ2luZS5wcm90b3R5cGUuZGVsZXRlRW50aXR5TWF0Y2hpbmcgPSBmdW5jdGlvbihyZWdleCkge1xuICB2YXIgZW50aXRpZXMgPSB0aGlzLnRyYWNrZXIuZmluZE1hdGNoaW5nKHJlZ2V4KVxuICBlbnRpdGllcy5mb3JFYWNoKGZ1bmN0aW9uKGVudGl0eSkge1xuICAgIGVudGl0eS5kZXN0cm95KHRoaXMsIHRoaXMuZ2FtZSlcbiAgICB0aGlzLnRyYWNrZXIuZm9yZ2V0KGVudGl0eSlcbiAgfS5iaW5kKHRoaXMpKVxufVxuXG5FbmdpbmUucHJvdG90eXBlLmdldEVudGl0eSA9IGZ1bmN0aW9uKGlkKSB7XG4gIHJldHVybiB0aGlzLnRyYWNrZXIuZmluZChpZCk7XG59O1xuXG5FbmdpbmUucHJvdG90eXBlLmF0dGFjaCA9IGZ1bmN0aW9uKGdhbWUpIHtcbiAgdGhpcy5nYW1lID0gZ2FtZTtcbn07XG5cbkVuZ2luZS5wcm90b3R5cGUuZGV0YWNoID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmdhbWUpIHtcbiAgICB0aGlzLmdhbWUuZGVzdHJveSh0aGlzKTtcbiAgfVxuICB0aGlzLmdhbWUgPSBudWxsO1xufTtcblxuRW5naW5lLnByb3RvdHlwZS5yZXNldCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLnRyYWNrZXIuZm9yRWFjaChmdW5jdGlvbihlbnRpdHkpIHtcbiAgICBlbnRpdHkuZGVzdHJveSh0aGlzLCBudWxsKTtcbiAgfS5iaW5kKHRoaXMpKTtcbiAgdGhpcy50cmFja2VyLmZvcmdldEFsbCgpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBFbmdpbmU7XG4iLCJ2YXIgXyAgICAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uLy4uLzNyZHBhcnR5L3VuZGVyc2NvcmUtbWluJyk7XG52YXIgTGVhZGVyYm9hcmQgICA9IHJlcXVpcmUoJy4vZW50aXRpZXMvTGVhZGVyYm9hcmQnKTtcbnZhciBUaXRsZSAgICAgICAgID0gcmVxdWlyZSgnLi9lbnRpdGllcy9UaXRsZScpO1xudmFyIEFib3V0ICAgICAgICAgPSByZXF1aXJlKCcuL2VudGl0aWVzL0Fib3V0Jyk7XG52YXIgaHViICAgICAgICAgICA9IHJlcXVpcmUoJy4uL2VuZ2luZS9odWInKTtcblxuZnVuY3Rpb24gSW50cm8oZW5naW5lKSB7XG4gIHRoaXMuY3VycmVudCA9IDA7XG4gIHRoaXMuc3dpdGNoKGVuZ2luZSk7XG4gIHRoaXMuc3dpdGNoVGltZXIgPSB3aW5kb3cuc2V0SW50ZXJ2YWwoXy5iaW5kKHRoaXMuc3dpdGNoLCB0aGlzLCBlbmdpbmUpLCAxMDAwMCk7XG4gIGh1Yi5zZW5kKCdlbmdpbmUuc291bmQucGxheScsIHtmaWxlOiAnL2dhbWUvc291bmRzL2ludHJvLm1wMycsIGxvb3A6IHRydWUsIHZvbHVtZTogMC44fSk7XG59XG5cbkludHJvLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGRlbHRhKSB7XG59O1xuXG5JbnRyby5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uKGVuZ2luZSkge1xuICB0aGlzLnJlbW92ZUFsbChlbmdpbmUpO1xuICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuc3dpdGNoVGltZXIpO1xuICBodWIuc2VuZCgnZW5naW5lLnNvdW5kLnN0b3AnLCB7ZmlsZTogJy9nYW1lL3NvdW5kcy9pbnRyby5tcDMnfSk7XG59O1xuXG5JbnRyby5wcm90b3R5cGUuc3dpdGNoID0gZnVuY3Rpb24oZW5naW5lKSB7XG4gIHRoaXMucmVtb3ZlQWxsKGVuZ2luZSk7XG4gICsrdGhpcy5jdXJyZW50O1xuICBpZiAodGhpcy5jdXJyZW50ICUgMyA9PT0gMSkgZW5naW5lLmFkZEVudGl0eShuZXcgTGVhZGVyYm9hcmQoJ2xlYWRlcmJvYXJkJykpO1xuICBpZiAodGhpcy5jdXJyZW50ICUgMyA9PT0gMikgZW5naW5lLmFkZEVudGl0eShuZXcgVGl0bGUoJ3RpdGxlJykpO1xuICBpZiAodGhpcy5jdXJyZW50ICUgMyA9PT0gMCkgZW5naW5lLmFkZEVudGl0eShuZXcgQWJvdXQoJ2Fib3V0JykpO1xufTtcblxuSW50cm8ucHJvdG90eXBlLnJlbW92ZUFsbCA9IGZ1bmN0aW9uKGVuZ2luZSkge1xuICBlbmdpbmUuZGVsZXRlRW50aXR5KCd0aXRsZScpO1xuICBlbmdpbmUuZGVsZXRlRW50aXR5KCdsZWFkZXJib2FyZCcpO1xuICBlbmdpbmUuZGVsZXRlRW50aXR5KCdhYm91dCcpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBJbnRybztcbiIsInZhciBTZXF1ZW5jZXIgICA9IHJlcXVpcmUoJy4vc2VxdWVuY2VyJyk7XG52YXIgd29ybGQgICAgICAgPSByZXF1aXJlKCcuL3dvcmxkJyk7XG52YXIgaHViICAgICAgICAgPSByZXF1aXJlKCcuLi9lbmdpbmUvaHViJyk7XG5cbnZhciBCYWxsICAgICAgICA9IHJlcXVpcmUoJy4vZW50aXRpZXMvYmFsbCcpO1xudmFyIHdvcmxkICAgICAgID0gcmVxdWlyZSgnLi93b3JsZCcpO1xudmFyIEFjdGlvblRleHQgID0gcmVxdWlyZSgnLi9lbnRpdGllcy9hY3Rpb24tdGV4dCcpO1xuXG5mdW5jdGlvbiBHYW1lKGVuZ2luZSwgcGxheWVySW5mbykge1xuXG4gIC8vIHR3byBwbGF5ZXJzIGluIHRoZSBjdXJyZW50IG1hdGNoXG4gIC8vIG9yIG1heWJlIHRoaXMgYmVsb25ncyBpbiB0aGUgUGxheWVyIGVudGl0eT9cbiAgdGhpcy5wbGF5ZXJzID0gcGxheWVySW5mby5tYXAoZnVuY3Rpb24ocCkge1xuICAgIHJldHVybiB7XG4gICAgICBpZDogcC5pZCxcbiAgICAgIG5hbWU6IHAuZmlyc3ROYW1lICsgJyAnICsgcC5sYXN0TmFtZS5zdWJzdHIoMCwxKSxcbiAgICAgIHNjb3JlOiAwXG4gICAgfVxuICB9KTtcbiAgdGhpcy5yb3VuZE51bWJlciA9IDFcblxuICB2YXIgc3RhdGVzID0ge1xuICAgICd3YXJtdXAnOiAgICAgcmVxdWlyZSgnLi9zdGF0ZXMvd2FybXVwJyksXG4gICAgJ2tpY2tvZmYnOiAgICByZXF1aXJlKCcuL3N0YXRlcy9raWNrb2ZmJyksXG4gICAgJ3BsYXknOiAgICAgICByZXF1aXJlKCcuL3N0YXRlcy9wbGF5JyksXG4gICAgJ3Njb3JlZCc6ICAgICByZXF1aXJlKCcuL3N0YXRlcy9zY29yZWQnKSxcbiAgICAnZW5kb2ZtYXRjaCc6IHJlcXVpcmUoJy4vc3RhdGVzL2VuZG9mbWF0Y2gnKVxuICB9O1xuXG4gIHZhciB0cmFuc2l0aW9ucyA9IFtcbiAgICAgIHsgICBuYW1lOiAnc3RhcnR1cCcsICBmcm9tOiAnbm9uZScsICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0bzogJ3dhcm11cCcgICAgICAgfSxcbiAgICAgIHsgICBuYW1lOiAncmVhZHknLCAgICBmcm9tOiBbJ3dhcm11cCcsICdzY29yZWQnXSwgICAgICAgICAgICAgICAgICAgICB0bzogJ2tpY2tvZmYnICAgICAgfSxcbiAgICAgIHsgICBuYW1lOiAnZ28nLCAgICAgICBmcm9tOiBbJ3Njb3JlZCcsICdraWNrb2ZmJ10sICAgICAgICAgICAgICAgICAgICB0bzogJ3BsYXknICAgICAgICAgfSxcbiAgICAgIHsgICBuYW1lOiAnc2NvcmVkJywgICBmcm9tOiBbJ3BsYXknLCAnc2NvcmVkJywgJ2tpY2tvZmYnXSwgICAgICAgICAgICB0bzogJ3Njb3JlZCcgICAgICAgfSxcbiAgICAgIHsgICBuYW1lOiAnZW5kJywgICAgICBmcm9tOiBbJ3dhcm11cCcsICdraWNrb2ZmJywgJ3BsYXknLCAnc2NvcmVkJ10sICB0bzogJ2VuZG9mbWF0Y2gnICAgfSxcbiAgXTtcbiAgXG4gIHRoaXMuZHVyYXRpb24gPSA0NTtcbiAgdGhpcy50aW1lUmVtYWluaW5nID0gdGhpcy5kdXJhdGlvbiAqIDEwMDA7XG4gIHRoaXMuYmFsbHNJblBsYXkgPSBbXVxuICBcbiAgdGhpcy5lbmdpbmUgPSBlbmdpbmU7XG4gIHRoaXMuc2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlcihlbmdpbmUsIHRoaXMsIHN0YXRlcywgdHJhbnNpdGlvbnMpO1xuICB0aGlzLnNlcXVlbmNlci5zdGFydCgpO1xuXG4gIGh1Yi5vbignZ2FtZS5zY29yZScsIGZ1bmN0aW9uKGRhdGEpIHtcbiAgICB0aGlzLnNjb3JlKDEgLSBkYXRhLmFnYWluc3RJbmRleCk7XG4gICAgdGhpcy5zZXF1ZW5jZXIudHJhbnNpdGlvbignc2NvcmVkJywgZGF0YSk7XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgaHViLm9uKCdnYW1lLmVuZCcsIGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuc2VxdWVuY2VyLnRyYW5zaXRpb24oJ2VuZCcpO1xuICB9LmJpbmQodGhpcykpO1xuXG4gIGh1Yi5vbignZ2FtZS5tdWx0aWJhbGwnLCBmdW5jdGlvbigpIHtcbiAgICB0aGlzLm11bHRpYmFsbCgpXG4gIH0uYmluZCh0aGlzKSlcbn1cblxuR2FtZS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24oZW5naW5lLCBkZWx0YSkge1xuICB0aGlzLnNlcXVlbmNlci5hY3RpdmUoKS51cGRhdGUoZGVsdGEpO1xufTtcblxuR2FtZS5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uKGVuZ2luZSkge1xuICBcbn07XG5cbkdhbWUucHJvdG90eXBlLnRyYW5zaXRpb24gPSBmdW5jdGlvbihuYW1lLCBhcmdzKSB7XG4gIHRoaXMuc2VxdWVuY2VyLnRyYW5zaXRpb24obmFtZSwgYXJncyk7XG59O1xuXG5HYW1lLnByb3RvdHlwZS5tZXNzYWdlID0gZnVuY3Rpb24obWVzc2FnZSwgYXJncykge1xuICB0aGlzLnNlcXVlbmNlci5hY3RpdmUoKS5vbihtZXNzYWdlLCBhcmdzKTtcbn07XG5cbkdhbWUucHJvdG90eXBlLnNjb3JlID0gZnVuY3Rpb24ocGxheWVySW5kZXgpIHtcbiAgdGhpcy5yb3VuZE51bWJlciArPSAxXG4gIHRoaXMucGxheWVyc1twbGF5ZXJJbmRleF0uc2NvcmUgKz0gMTtcbn07XG5cbkdhbWUucHJvdG90eXBlLm1vdmUgPSBmdW5jdGlvbihwaW5kZXgsIGRpcikge1xuICB2YXIgcGxheWVyID0gdGhpcy5lbmdpbmUuZ2V0RW50aXR5KHBpbmRleCA9PT0gMCA/ICdwMScgOiAncDInKTtcbiAgcGxheWVyLm1vdmUoZGlyKTtcbn07XG5cbkdhbWUucHJvdG90eXBlLm11bHRpYmFsbCA9IGZ1bmN0aW9uKCkge1xuICB2YXIgdGV4dCA9IG5ldyBBY3Rpb25UZXh0KCdtdWx0aWJhbGwnLCAnTXVsdGktYmFsbCEnKTtcbiAgdGhpcy5lbmdpbmUuYWRkRW50aXR5KHRleHQpXG5cbiAgaHViLnNlbmQoJ2VuZ2luZS5zb3VuZC5wbGF5JywgeyBmaWxlOiAnL2dhbWUvc291bmRzL211bHRpYmFsbC5tcDMnIH0pXG4gIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgaHViLnNlbmQoJ2VuZ2luZS5zb3VuZC5wbGF5JywgeyBmaWxlOiAnL2dhbWUvc291bmRzL3NheC5tcDMnLCB2b2x1bWU6IDAuOSB9KTtcbiAgfSwgMjAwMCk7XG5cbiAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICB0aGlzLmVuZ2luZS5kZWxldGVFbnRpdHkodGV4dC5pZClcbiAgICBcbiAgICB2YXIgYmFsbCA9IHRoaXMuY3JlYXRlQmFsbCgtMSwgMSlcbiAgICBiYWxsLmtpY2soMSlcbiAgICBiYWxsID0gdGhpcy5jcmVhdGVCYWxsKDEsIDEpXG4gICAgYmFsbC5raWNrKDEpXG4gICAgYmFsbCA9IHRoaXMuY3JlYXRlQmFsbCgxLCAxKVxuICAgIGJhbGwua2ljaygtMSlcbiAgICBiYWxsID0gdGhpcy5jcmVhdGVCYWxsKDAsIC0xKVxuICAgIGJhbGwua2ljaygtMSlcbiAgfS5iaW5kKHRoaXMpLCAxMDAwKVxufVxuXG5HYW1lLnByb3RvdHlwZS5jbGVhckJhbGxzID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuYmFsbHNJblBsYXkuZm9yRWFjaChmdW5jdGlvbihiYWxsKSB7XG4gICAgdGhpcy5yZW1vdmVCYWxsKGJhbGwpXG4gIH0uYmluZCh0aGlzKSlcbiAgdGhpcy5iYWxsc0luUGxheSA9IFtdXG59XG5cbkdhbWUucHJvdG90eXBlLnJlbW92ZUJhbGwgPSBmdW5jdGlvbihiYWxsKSB7XG4gIHRoaXMuZW5naW5lLmRlbGV0ZUVudGl0eShiYWxsLmlkKVxuICB0aGlzLmJhbGxzSW5QbGF5ID0gdGhpcy5iYWxsc0luUGxheS5maWx0ZXIoZnVuY3Rpb24oYikgeyByZXR1cm4gYiAhPT0gYmFsbCB9KVxufVxuXG5HYW1lLnByb3RvdHlwZS5jcmVhdGVCYWxsID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgYmFsbFN0YXJ0WSA9IG51bGxcbiAgdmFyIGJhbGxTdGFydFggPSBudWxsXG5cbiAgaWYgKHggPT09IC0xKSB7XG4gICAgYmFsbFN0YXJ0WCA9IHdvcmxkLndpZHRoIC8gNVxuICB9IGVsc2UgaWYgKHggPT09IDApIHtcbiAgICBiYWxsU3RhcnRYID0gd29ybGQud2lkdGggLyAyXG4gIH0gZWxzZSB7XG4gICAgYmFsbFN0YXJ0WCA9ICh3b3JsZC53aWR0aCAvIDUpICogNFxuICB9XG5cbiAgaWYgKHkgPT09IC0xKSB7XG4gICAgYmFsbFN0YXJ0WSA9IHdvcmxkLmhlaWdodCAvIDVcbiAgfSBlbHNlIGlmICh5ID09PSAwKSB7XG4gICAgYmFsbFN0YXJ0WSA9IHdvcmxkLmhlaWdodCAvIDJcbiAgfSBlbHNlIHtcbiAgICBiYWxsU3RhcnRZID0gKHdvcmxkLmhlaWdodCAvIDUpICogNFxuICB9XG5cbiAgdmFyIGJhbGwgPSBuZXcgQmFsbCgnYmFsbDonK3RoaXMuYmFsbHNJblBsYXkubGVuZ3RoLCBiYWxsU3RhcnRYLCBiYWxsU3RhcnRZKVxuXG4gIHRoaXMuZW5naW5lLmFkZEVudGl0eShiYWxsKVxuICB0aGlzLmJhbGxzSW5QbGF5LnB1c2goYmFsbClcblxuICByZXR1cm4gYmFsbFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEdhbWU7XG4iLCJ2YXIgZXZlID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvZXZlJyk7XG5cbmV4cG9ydHMuaW50ZXJjZXB0b3IgPSBmdW5jdGlvbihmbikgeyBmbigpOyB9O1xuXG5leHBvcnRzLnNlbmQgPSBmdW5jdGlvbihtZXNzYWdlLCBhcmdzKSB7XG4gIGV2ZShtZXNzYWdlLCBudWxsLCBhcmdzKTtcbn07XG5cbmV4cG9ydHMub24gPSBmdW5jdGlvbihtZXNzYWdlLCBjYWxsYmFjaykge1xuICBldmUub24obWVzc2FnZSwgZnVuY3Rpb24oKSB7XG4gICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgZXhwb3J0cy5pbnRlcmNlcHRvcihmdW5jdGlvbigpIHtcbiAgICAgIGNhbGxiYWNrLmFwcGx5KHRoaXMsIGFyZ3MpXG4gICAgfSk7XG4gIH0pO1xufTtcblxuZXhwb3J0cy51bmJpbmQgPSBmdW5jdGlvbihuYW1lKSB7XG4gIGV2ZS5vZmYobmFtZSk7XG59O1xuIiwiLyohIFNvY2tldC5JTy5taW4uanMgYnVpbGQ6MC45LjExLCBwcm9kdWN0aW9uLiBDb3B5cmlnaHQoYykgMjAxMSBMZWFybkJvb3N0IDxkZXZAbGVhcm5ib29zdC5jb20+IE1JVCBMaWNlbnNlZCAqL1xudmFyIGlvPVwidW5kZWZpbmVkXCI9PXR5cGVvZiBtb2R1bGU/e306bW9kdWxlLmV4cG9ydHM7KGZ1bmN0aW9uKCl7KGZ1bmN0aW9uKGEsYil7dmFyIGM9YTtjLnZlcnNpb249XCIwLjkuMTFcIixjLnByb3RvY29sPTEsYy50cmFuc3BvcnRzPVtdLGMuaj1bXSxjLnNvY2tldHM9e30sYy5jb25uZWN0PWZ1bmN0aW9uKGEsZCl7dmFyIGU9Yy51dGlsLnBhcnNlVXJpKGEpLGYsZztiJiZiLmxvY2F0aW9uJiYoZS5wcm90b2NvbD1lLnByb3RvY29sfHxiLmxvY2F0aW9uLnByb3RvY29sLnNsaWNlKDAsLTEpLGUuaG9zdD1lLmhvc3R8fChiLmRvY3VtZW50P2IuZG9jdW1lbnQuZG9tYWluOmIubG9jYXRpb24uaG9zdG5hbWUpLGUucG9ydD1lLnBvcnR8fGIubG9jYXRpb24ucG9ydCksZj1jLnV0aWwudW5pcXVlVXJpKGUpO3ZhciBoPXtob3N0OmUuaG9zdCxzZWN1cmU6XCJodHRwc1wiPT1lLnByb3RvY29sLHBvcnQ6ZS5wb3J0fHwoXCJodHRwc1wiPT1lLnByb3RvY29sPzQ0Mzo4MCkscXVlcnk6ZS5xdWVyeXx8XCJcIn07Yy51dGlsLm1lcmdlKGgsZCk7aWYoaFtcImZvcmNlIG5ldyBjb25uZWN0aW9uXCJdfHwhYy5zb2NrZXRzW2ZdKWc9bmV3IGMuU29ja2V0KGgpO3JldHVybiFoW1wiZm9yY2UgbmV3IGNvbm5lY3Rpb25cIl0mJmcmJihjLnNvY2tldHNbZl09ZyksZz1nfHxjLnNvY2tldHNbZl0sZy5vZihlLnBhdGgubGVuZ3RoPjE/ZS5wYXRoOlwiXCIpfX0pKFwib2JqZWN0XCI9PXR5cGVvZiBtb2R1bGU/bW9kdWxlLmV4cG9ydHM6dGhpcy5pbz17fSx0aGlzKSxmdW5jdGlvbihhLGIpe3ZhciBjPWEudXRpbD17fSxkPS9eKD86KD8hW146QF0rOlteOkBcXC9dKkApKFteOlxcLz8jLl0rKTopPyg/OlxcL1xcLyk/KCg/OigoW146QF0qKSg/OjooW146QF0qKSk/KT9AKT8oW146XFwvPyNdKikoPzo6KFxcZCopKT8pKCgoXFwvKD86W14/I10oPyFbXj8jXFwvXSpcXC5bXj8jXFwvLl0rKD86Wz8jXXwkKSkpKlxcLz8pPyhbXj8jXFwvXSopKSg/OlxcPyhbXiNdKikpPyg/OiMoLiopKT8pLyxlPVtcInNvdXJjZVwiLFwicHJvdG9jb2xcIixcImF1dGhvcml0eVwiLFwidXNlckluZm9cIixcInVzZXJcIixcInBhc3N3b3JkXCIsXCJob3N0XCIsXCJwb3J0XCIsXCJyZWxhdGl2ZVwiLFwicGF0aFwiLFwiZGlyZWN0b3J5XCIsXCJmaWxlXCIsXCJxdWVyeVwiLFwiYW5jaG9yXCJdO2MucGFyc2VVcmk9ZnVuY3Rpb24oYSl7dmFyIGI9ZC5leGVjKGF8fFwiXCIpLGM9e30sZj0xNDt3aGlsZShmLS0pY1tlW2ZdXT1iW2ZdfHxcIlwiO3JldHVybiBjfSxjLnVuaXF1ZVVyaT1mdW5jdGlvbihhKXt2YXIgYz1hLnByb3RvY29sLGQ9YS5ob3N0LGU9YS5wb3J0O3JldHVyblwiZG9jdW1lbnRcImluIGI/KGQ9ZHx8ZG9jdW1lbnQuZG9tYWluLGU9ZXx8KGM9PVwiaHR0cHNcIiYmZG9jdW1lbnQubG9jYXRpb24ucHJvdG9jb2whPT1cImh0dHBzOlwiPzQ0Mzpkb2N1bWVudC5sb2NhdGlvbi5wb3J0KSk6KGQ9ZHx8XCJsb2NhbGhvc3RcIiwhZSYmYz09XCJodHRwc1wiJiYoZT00NDMpKSwoY3x8XCJodHRwXCIpK1wiOi8vXCIrZCtcIjpcIisoZXx8ODApfSxjLnF1ZXJ5PWZ1bmN0aW9uKGEsYil7dmFyIGQ9Yy5jaHVua1F1ZXJ5KGF8fFwiXCIpLGU9W107Yy5tZXJnZShkLGMuY2h1bmtRdWVyeShifHxcIlwiKSk7Zm9yKHZhciBmIGluIGQpZC5oYXNPd25Qcm9wZXJ0eShmKSYmZS5wdXNoKGYrXCI9XCIrZFtmXSk7cmV0dXJuIGUubGVuZ3RoP1wiP1wiK2Uuam9pbihcIiZcIik6XCJcIn0sYy5jaHVua1F1ZXJ5PWZ1bmN0aW9uKGEpe3ZhciBiPXt9LGM9YS5zcGxpdChcIiZcIiksZD0wLGU9Yy5sZW5ndGgsZjtmb3IoO2Q8ZTsrK2QpZj1jW2RdLnNwbGl0KFwiPVwiKSxmWzBdJiYoYltmWzBdXT1mWzFdKTtyZXR1cm4gYn07dmFyIGY9ITE7Yy5sb2FkPWZ1bmN0aW9uKGEpe2lmKFwiZG9jdW1lbnRcImluIGImJmRvY3VtZW50LnJlYWR5U3RhdGU9PT1cImNvbXBsZXRlXCJ8fGYpcmV0dXJuIGEoKTtjLm9uKGIsXCJsb2FkXCIsYSwhMSl9LGMub249ZnVuY3Rpb24oYSxiLGMsZCl7YS5hdHRhY2hFdmVudD9hLmF0dGFjaEV2ZW50KFwib25cIitiLGMpOmEuYWRkRXZlbnRMaXN0ZW5lciYmYS5hZGRFdmVudExpc3RlbmVyKGIsYyxkKX0sYy5yZXF1ZXN0PWZ1bmN0aW9uKGEpe2lmKGEmJlwidW5kZWZpbmVkXCIhPXR5cGVvZiBYRG9tYWluUmVxdWVzdCYmIWMudWEuaGFzQ09SUylyZXR1cm4gbmV3IFhEb21haW5SZXF1ZXN0O2lmKFwidW5kZWZpbmVkXCIhPXR5cGVvZiBYTUxIdHRwUmVxdWVzdCYmKCFhfHxjLnVhLmhhc0NPUlMpKXJldHVybiBuZXcgWE1MSHR0cFJlcXVlc3Q7aWYoIWEpdHJ5e3JldHVybiBuZXcod2luZG93W1tcIkFjdGl2ZVwiXS5jb25jYXQoXCJPYmplY3RcIikuam9pbihcIlhcIildKShcIk1pY3Jvc29mdC5YTUxIVFRQXCIpfWNhdGNoKGIpe31yZXR1cm4gbnVsbH0sXCJ1bmRlZmluZWRcIiE9dHlwZW9mIHdpbmRvdyYmYy5sb2FkKGZ1bmN0aW9uKCl7Zj0hMH0pLGMuZGVmZXI9ZnVuY3Rpb24oYSl7aWYoIWMudWEud2Via2l0fHxcInVuZGVmaW5lZFwiIT10eXBlb2YgaW1wb3J0U2NyaXB0cylyZXR1cm4gYSgpO2MubG9hZChmdW5jdGlvbigpe3NldFRpbWVvdXQoYSwxMDApfSl9LGMubWVyZ2U9ZnVuY3Rpb24oYixkLGUsZil7dmFyIGc9Znx8W10saD10eXBlb2YgZT09XCJ1bmRlZmluZWRcIj8yOmUsaTtmb3IoaSBpbiBkKWQuaGFzT3duUHJvcGVydHkoaSkmJmMuaW5kZXhPZihnLGkpPDAmJih0eXBlb2YgYltpXSE9XCJvYmplY3RcInx8IWg/KGJbaV09ZFtpXSxnLnB1c2goZFtpXSkpOmMubWVyZ2UoYltpXSxkW2ldLGgtMSxnKSk7cmV0dXJuIGJ9LGMubWl4aW49ZnVuY3Rpb24oYSxiKXtjLm1lcmdlKGEucHJvdG90eXBlLGIucHJvdG90eXBlKX0sYy5pbmhlcml0PWZ1bmN0aW9uKGEsYil7ZnVuY3Rpb24gYygpe31jLnByb3RvdHlwZT1iLnByb3RvdHlwZSxhLnByb3RvdHlwZT1uZXcgY30sYy5pc0FycmF5PUFycmF5LmlzQXJyYXl8fGZ1bmN0aW9uKGEpe3JldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoYSk9PT1cIltvYmplY3QgQXJyYXldXCJ9LGMuaW50ZXJzZWN0PWZ1bmN0aW9uKGEsYil7dmFyIGQ9W10sZT1hLmxlbmd0aD5iLmxlbmd0aD9hOmIsZj1hLmxlbmd0aD5iLmxlbmd0aD9iOmE7Zm9yKHZhciBnPTAsaD1mLmxlbmd0aDtnPGg7ZysrKX5jLmluZGV4T2YoZSxmW2ddKSYmZC5wdXNoKGZbZ10pO3JldHVybiBkfSxjLmluZGV4T2Y9ZnVuY3Rpb24oYSxiLGMpe2Zvcih2YXIgZD1hLmxlbmd0aCxjPWM8MD9jK2Q8MD8wOmMrZDpjfHwwO2M8ZCYmYVtjXSE9PWI7YysrKTtyZXR1cm4gZDw9Yz8tMTpjfSxjLnRvQXJyYXk9ZnVuY3Rpb24oYSl7dmFyIGI9W107Zm9yKHZhciBjPTAsZD1hLmxlbmd0aDtjPGQ7YysrKWIucHVzaChhW2NdKTtyZXR1cm4gYn0sYy51YT17fSxjLnVhLmhhc0NPUlM9XCJ1bmRlZmluZWRcIiE9dHlwZW9mIFhNTEh0dHBSZXF1ZXN0JiZmdW5jdGlvbigpe3RyeXt2YXIgYT1uZXcgWE1MSHR0cFJlcXVlc3R9Y2F0Y2goYil7cmV0dXJuITF9cmV0dXJuIGEud2l0aENyZWRlbnRpYWxzIT11bmRlZmluZWR9KCksYy51YS53ZWJraXQ9XCJ1bmRlZmluZWRcIiE9dHlwZW9mIG5hdmlnYXRvciYmL3dlYmtpdC9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCksYy51YS5pRGV2aWNlPVwidW5kZWZpbmVkXCIhPXR5cGVvZiBuYXZpZ2F0b3ImJi9pUGFkfGlQaG9uZXxpUG9kL2kudGVzdChuYXZpZ2F0b3IudXNlckFnZW50KX0oXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvOm1vZHVsZS5leHBvcnRzLHRoaXMpLGZ1bmN0aW9uKGEsYil7ZnVuY3Rpb24gYygpe31hLkV2ZW50RW1pdHRlcj1jLGMucHJvdG90eXBlLm9uPWZ1bmN0aW9uKGEsYyl7cmV0dXJuIHRoaXMuJGV2ZW50c3x8KHRoaXMuJGV2ZW50cz17fSksdGhpcy4kZXZlbnRzW2FdP2IudXRpbC5pc0FycmF5KHRoaXMuJGV2ZW50c1thXSk/dGhpcy4kZXZlbnRzW2FdLnB1c2goYyk6dGhpcy4kZXZlbnRzW2FdPVt0aGlzLiRldmVudHNbYV0sY106dGhpcy4kZXZlbnRzW2FdPWMsdGhpc30sYy5wcm90b3R5cGUuYWRkTGlzdGVuZXI9Yy5wcm90b3R5cGUub24sYy5wcm90b3R5cGUub25jZT1mdW5jdGlvbihhLGIpe2Z1bmN0aW9uIGQoKXtjLnJlbW92ZUxpc3RlbmVyKGEsZCksYi5hcHBseSh0aGlzLGFyZ3VtZW50cyl9dmFyIGM9dGhpcztyZXR1cm4gZC5saXN0ZW5lcj1iLHRoaXMub24oYSxkKSx0aGlzfSxjLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lcj1mdW5jdGlvbihhLGMpe2lmKHRoaXMuJGV2ZW50cyYmdGhpcy4kZXZlbnRzW2FdKXt2YXIgZD10aGlzLiRldmVudHNbYV07aWYoYi51dGlsLmlzQXJyYXkoZCkpe3ZhciBlPS0xO2Zvcih2YXIgZj0wLGc9ZC5sZW5ndGg7ZjxnO2YrKylpZihkW2ZdPT09Y3x8ZFtmXS5saXN0ZW5lciYmZFtmXS5saXN0ZW5lcj09PWMpe2U9ZjticmVha31pZihlPDApcmV0dXJuIHRoaXM7ZC5zcGxpY2UoZSwxKSxkLmxlbmd0aHx8ZGVsZXRlIHRoaXMuJGV2ZW50c1thXX1lbHNlKGQ9PT1jfHxkLmxpc3RlbmVyJiZkLmxpc3RlbmVyPT09YykmJmRlbGV0ZSB0aGlzLiRldmVudHNbYV19cmV0dXJuIHRoaXN9LGMucHJvdG90eXBlLnJlbW92ZUFsbExpc3RlbmVycz1mdW5jdGlvbihhKXtyZXR1cm4gYT09PXVuZGVmaW5lZD8odGhpcy4kZXZlbnRzPXt9LHRoaXMpOih0aGlzLiRldmVudHMmJnRoaXMuJGV2ZW50c1thXSYmKHRoaXMuJGV2ZW50c1thXT1udWxsKSx0aGlzKX0sYy5wcm90b3R5cGUubGlzdGVuZXJzPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLiRldmVudHN8fCh0aGlzLiRldmVudHM9e30pLHRoaXMuJGV2ZW50c1thXXx8KHRoaXMuJGV2ZW50c1thXT1bXSksYi51dGlsLmlzQXJyYXkodGhpcy4kZXZlbnRzW2FdKXx8KHRoaXMuJGV2ZW50c1thXT1bdGhpcy4kZXZlbnRzW2FdXSksdGhpcy4kZXZlbnRzW2FdfSxjLnByb3RvdHlwZS5lbWl0PWZ1bmN0aW9uKGEpe2lmKCF0aGlzLiRldmVudHMpcmV0dXJuITE7dmFyIGM9dGhpcy4kZXZlbnRzW2FdO2lmKCFjKXJldHVybiExO3ZhciBkPUFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywxKTtpZihcImZ1bmN0aW9uXCI9PXR5cGVvZiBjKWMuYXBwbHkodGhpcyxkKTtlbHNle2lmKCFiLnV0aWwuaXNBcnJheShjKSlyZXR1cm4hMTt2YXIgZT1jLnNsaWNlKCk7Zm9yKHZhciBmPTAsZz1lLmxlbmd0aDtmPGc7ZisrKWVbZl0uYXBwbHkodGhpcyxkKX1yZXR1cm4hMH19KFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pbzptb2R1bGUuZXhwb3J0cyxcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW86bW9kdWxlLnBhcmVudC5leHBvcnRzKSxmdW5jdGlvbihleHBvcnRzLG5hdGl2ZUpTT04pe2Z1bmN0aW9uIGYoYSl7cmV0dXJuIGE8MTA/XCIwXCIrYTphfWZ1bmN0aW9uIGRhdGUoYSxiKXtyZXR1cm4gaXNGaW5pdGUoYS52YWx1ZU9mKCkpP2EuZ2V0VVRDRnVsbFllYXIoKStcIi1cIitmKGEuZ2V0VVRDTW9udGgoKSsxKStcIi1cIitmKGEuZ2V0VVRDRGF0ZSgpKStcIlRcIitmKGEuZ2V0VVRDSG91cnMoKSkrXCI6XCIrZihhLmdldFVUQ01pbnV0ZXMoKSkrXCI6XCIrZihhLmdldFVUQ1NlY29uZHMoKSkrXCJaXCI6bnVsbH1mdW5jdGlvbiBxdW90ZShhKXtyZXR1cm4gZXNjYXBhYmxlLmxhc3RJbmRleD0wLGVzY2FwYWJsZS50ZXN0KGEpPydcIicrYS5yZXBsYWNlKGVzY2FwYWJsZSxmdW5jdGlvbihhKXt2YXIgYj1tZXRhW2FdO3JldHVybiB0eXBlb2YgYj09XCJzdHJpbmdcIj9iOlwiXFxcXHVcIisoXCIwMDAwXCIrYS5jaGFyQ29kZUF0KDApLnRvU3RyaW5nKDE2KSkuc2xpY2UoLTQpfSkrJ1wiJzonXCInK2ErJ1wiJ31mdW5jdGlvbiBzdHIoYSxiKXt2YXIgYyxkLGUsZixnPWdhcCxoLGk9YlthXTtpIGluc3RhbmNlb2YgRGF0ZSYmKGk9ZGF0ZShhKSksdHlwZW9mIHJlcD09XCJmdW5jdGlvblwiJiYoaT1yZXAuY2FsbChiLGEsaSkpO3N3aXRjaCh0eXBlb2YgaSl7Y2FzZVwic3RyaW5nXCI6cmV0dXJuIHF1b3RlKGkpO2Nhc2VcIm51bWJlclwiOnJldHVybiBpc0Zpbml0ZShpKT9TdHJpbmcoaSk6XCJudWxsXCI7Y2FzZVwiYm9vbGVhblwiOmNhc2VcIm51bGxcIjpyZXR1cm4gU3RyaW5nKGkpO2Nhc2VcIm9iamVjdFwiOmlmKCFpKXJldHVyblwibnVsbFwiO2dhcCs9aW5kZW50LGg9W107aWYoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5hcHBseShpKT09PVwiW29iamVjdCBBcnJheV1cIil7Zj1pLmxlbmd0aDtmb3IoYz0wO2M8ZjtjKz0xKWhbY109c3RyKGMsaSl8fFwibnVsbFwiO3JldHVybiBlPWgubGVuZ3RoPT09MD9cIltdXCI6Z2FwP1wiW1xcblwiK2dhcCtoLmpvaW4oXCIsXFxuXCIrZ2FwKStcIlxcblwiK2crXCJdXCI6XCJbXCIraC5qb2luKFwiLFwiKStcIl1cIixnYXA9ZyxlfWlmKHJlcCYmdHlwZW9mIHJlcD09XCJvYmplY3RcIil7Zj1yZXAubGVuZ3RoO2ZvcihjPTA7YzxmO2MrPTEpdHlwZW9mIHJlcFtjXT09XCJzdHJpbmdcIiYmKGQ9cmVwW2NdLGU9c3RyKGQsaSksZSYmaC5wdXNoKHF1b3RlKGQpKyhnYXA/XCI6IFwiOlwiOlwiKStlKSl9ZWxzZSBmb3IoZCBpbiBpKU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChpLGQpJiYoZT1zdHIoZCxpKSxlJiZoLnB1c2gocXVvdGUoZCkrKGdhcD9cIjogXCI6XCI6XCIpK2UpKTtyZXR1cm4gZT1oLmxlbmd0aD09PTA/XCJ7fVwiOmdhcD9cIntcXG5cIitnYXAraC5qb2luKFwiLFxcblwiK2dhcCkrXCJcXG5cIitnK1wifVwiOlwie1wiK2guam9pbihcIixcIikrXCJ9XCIsZ2FwPWcsZX19XCJ1c2Ugc3RyaWN0XCI7aWYobmF0aXZlSlNPTiYmbmF0aXZlSlNPTi5wYXJzZSlyZXR1cm4gZXhwb3J0cy5KU09OPXtwYXJzZTpuYXRpdmVKU09OLnBhcnNlLHN0cmluZ2lmeTpuYXRpdmVKU09OLnN0cmluZ2lmeX07dmFyIEpTT049ZXhwb3J0cy5KU09OPXt9LGN4PS9bXFx1MDAwMFxcdTAwYWRcXHUwNjAwLVxcdTA2MDRcXHUwNzBmXFx1MTdiNFxcdTE3YjVcXHUyMDBjLVxcdTIwMGZcXHUyMDI4LVxcdTIwMmZcXHUyMDYwLVxcdTIwNmZcXHVmZWZmXFx1ZmZmMC1cXHVmZmZmXS9nLGVzY2FwYWJsZT0vW1xcXFxcXFwiXFx4MDAtXFx4MWZcXHg3Zi1cXHg5ZlxcdTAwYWRcXHUwNjAwLVxcdTA2MDRcXHUwNzBmXFx1MTdiNFxcdTE3YjVcXHUyMDBjLVxcdTIwMGZcXHUyMDI4LVxcdTIwMmZcXHUyMDYwLVxcdTIwNmZcXHVmZWZmXFx1ZmZmMC1cXHVmZmZmXS9nLGdhcCxpbmRlbnQsbWV0YT17XCJcXGJcIjpcIlxcXFxiXCIsXCJcXHRcIjpcIlxcXFx0XCIsXCJcXG5cIjpcIlxcXFxuXCIsXCJcXGZcIjpcIlxcXFxmXCIsXCJcXHJcIjpcIlxcXFxyXCIsJ1wiJzonXFxcXFwiJyxcIlxcXFxcIjpcIlxcXFxcXFxcXCJ9LHJlcDtKU09OLnN0cmluZ2lmeT1mdW5jdGlvbihhLGIsYyl7dmFyIGQ7Z2FwPVwiXCIsaW5kZW50PVwiXCI7aWYodHlwZW9mIGM9PVwibnVtYmVyXCIpZm9yKGQ9MDtkPGM7ZCs9MSlpbmRlbnQrPVwiIFwiO2Vsc2UgdHlwZW9mIGM9PVwic3RyaW5nXCImJihpbmRlbnQ9Yyk7cmVwPWI7aWYoIWJ8fHR5cGVvZiBiPT1cImZ1bmN0aW9uXCJ8fHR5cGVvZiBiPT1cIm9iamVjdFwiJiZ0eXBlb2YgYi5sZW5ndGg9PVwibnVtYmVyXCIpcmV0dXJuIHN0cihcIlwiLHtcIlwiOmF9KTt0aHJvdyBuZXcgRXJyb3IoXCJKU09OLnN0cmluZ2lmeVwiKX0sSlNPTi5wYXJzZT1mdW5jdGlvbih0ZXh0LHJldml2ZXIpe2Z1bmN0aW9uIHdhbGsoYSxiKXt2YXIgYyxkLGU9YVtiXTtpZihlJiZ0eXBlb2YgZT09XCJvYmplY3RcIilmb3IoYyBpbiBlKU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChlLGMpJiYoZD13YWxrKGUsYyksZCE9PXVuZGVmaW5lZD9lW2NdPWQ6ZGVsZXRlIGVbY10pO3JldHVybiByZXZpdmVyLmNhbGwoYSxiLGUpfXZhciBqO3RleHQ9U3RyaW5nKHRleHQpLGN4Lmxhc3RJbmRleD0wLGN4LnRlc3QodGV4dCkmJih0ZXh0PXRleHQucmVwbGFjZShjeCxmdW5jdGlvbihhKXtyZXR1cm5cIlxcXFx1XCIrKFwiMDAwMFwiK2EuY2hhckNvZGVBdCgwKS50b1N0cmluZygxNikpLnNsaWNlKC00KX0pKTtpZigvXltcXF0sOnt9XFxzXSokLy50ZXN0KHRleHQucmVwbGFjZSgvXFxcXCg/OltcIlxcXFxcXC9iZm5ydF18dVswLTlhLWZBLUZdezR9KS9nLFwiQFwiKS5yZXBsYWNlKC9cIlteXCJcXFxcXFxuXFxyXSpcInx0cnVlfGZhbHNlfG51bGx8LT9cXGQrKD86XFwuXFxkKik/KD86W2VFXVsrXFwtXT9cXGQrKT8vZyxcIl1cIikucmVwbGFjZSgvKD86Xnw6fCwpKD86XFxzKlxcWykrL2csXCJcIikpKXJldHVybiBqPWV2YWwoXCIoXCIrdGV4dCtcIilcIiksdHlwZW9mIHJldml2ZXI9PVwiZnVuY3Rpb25cIj93YWxrKHtcIlwiOmp9LFwiXCIpOmo7dGhyb3cgbmV3IFN5bnRheEVycm9yKFwiSlNPTi5wYXJzZVwiKX19KFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pbzptb2R1bGUuZXhwb3J0cyx0eXBlb2YgSlNPTiE9XCJ1bmRlZmluZWRcIj9KU09OOnVuZGVmaW5lZCksZnVuY3Rpb24oYSxiKXt2YXIgYz1hLnBhcnNlcj17fSxkPWMucGFja2V0cz1bXCJkaXNjb25uZWN0XCIsXCJjb25uZWN0XCIsXCJoZWFydGJlYXRcIixcIm1lc3NhZ2VcIixcImpzb25cIixcImV2ZW50XCIsXCJhY2tcIixcImVycm9yXCIsXCJub29wXCJdLGU9Yy5yZWFzb25zPVtcInRyYW5zcG9ydCBub3Qgc3VwcG9ydGVkXCIsXCJjbGllbnQgbm90IGhhbmRzaGFrZW5cIixcInVuYXV0aG9yaXplZFwiXSxmPWMuYWR2aWNlPVtcInJlY29ubmVjdFwiXSxnPWIuSlNPTixoPWIudXRpbC5pbmRleE9mO2MuZW5jb2RlUGFja2V0PWZ1bmN0aW9uKGEpe3ZhciBiPWgoZCxhLnR5cGUpLGM9YS5pZHx8XCJcIixpPWEuZW5kcG9pbnR8fFwiXCIsaj1hLmFjayxrPW51bGw7c3dpdGNoKGEudHlwZSl7Y2FzZVwiZXJyb3JcIjp2YXIgbD1hLnJlYXNvbj9oKGUsYS5yZWFzb24pOlwiXCIsbT1hLmFkdmljZT9oKGYsYS5hZHZpY2UpOlwiXCI7aWYobCE9PVwiXCJ8fG0hPT1cIlwiKWs9bCsobSE9PVwiXCI/XCIrXCIrbTpcIlwiKTticmVhaztjYXNlXCJtZXNzYWdlXCI6YS5kYXRhIT09XCJcIiYmKGs9YS5kYXRhKTticmVhaztjYXNlXCJldmVudFwiOnZhciBuPXtuYW1lOmEubmFtZX07YS5hcmdzJiZhLmFyZ3MubGVuZ3RoJiYobi5hcmdzPWEuYXJncyksaz1nLnN0cmluZ2lmeShuKTticmVhaztjYXNlXCJqc29uXCI6az1nLnN0cmluZ2lmeShhLmRhdGEpO2JyZWFrO2Nhc2VcImNvbm5lY3RcIjphLnFzJiYoaz1hLnFzKTticmVhaztjYXNlXCJhY2tcIjprPWEuYWNrSWQrKGEuYXJncyYmYS5hcmdzLmxlbmd0aD9cIitcIitnLnN0cmluZ2lmeShhLmFyZ3MpOlwiXCIpfXZhciBvPVtiLGMrKGo9PVwiZGF0YVwiP1wiK1wiOlwiXCIpLGldO3JldHVybiBrIT09bnVsbCYmayE9PXVuZGVmaW5lZCYmby5wdXNoKGspLG8uam9pbihcIjpcIil9LGMuZW5jb2RlUGF5bG9hZD1mdW5jdGlvbihhKXt2YXIgYj1cIlwiO2lmKGEubGVuZ3RoPT0xKXJldHVybiBhWzBdO2Zvcih2YXIgYz0wLGQ9YS5sZW5ndGg7YzxkO2MrKyl7dmFyIGU9YVtjXTtiKz1cIlxcdWZmZmRcIitlLmxlbmd0aCtcIlxcdWZmZmRcIithW2NdfXJldHVybiBifTt2YXIgaT0vKFteOl0rKTooWzAtOV0rKT8oXFwrKT86KFteOl0rKT86PyhbXFxzXFxTXSopPy87Yy5kZWNvZGVQYWNrZXQ9ZnVuY3Rpb24oYSl7dmFyIGI9YS5tYXRjaChpKTtpZighYilyZXR1cm57fTt2YXIgYz1iWzJdfHxcIlwiLGE9Yls1XXx8XCJcIixoPXt0eXBlOmRbYlsxXV0sZW5kcG9pbnQ6Yls0XXx8XCJcIn07YyYmKGguaWQ9YyxiWzNdP2guYWNrPVwiZGF0YVwiOmguYWNrPSEwKTtzd2l0Y2goaC50eXBlKXtjYXNlXCJlcnJvclwiOnZhciBiPWEuc3BsaXQoXCIrXCIpO2gucmVhc29uPWVbYlswXV18fFwiXCIsaC5hZHZpY2U9ZltiWzFdXXx8XCJcIjticmVhaztjYXNlXCJtZXNzYWdlXCI6aC5kYXRhPWF8fFwiXCI7YnJlYWs7Y2FzZVwiZXZlbnRcIjp0cnl7dmFyIGo9Zy5wYXJzZShhKTtoLm5hbWU9ai5uYW1lLGguYXJncz1qLmFyZ3N9Y2F0Y2goayl7fWguYXJncz1oLmFyZ3N8fFtdO2JyZWFrO2Nhc2VcImpzb25cIjp0cnl7aC5kYXRhPWcucGFyc2UoYSl9Y2F0Y2goayl7fWJyZWFrO2Nhc2VcImNvbm5lY3RcIjpoLnFzPWF8fFwiXCI7YnJlYWs7Y2FzZVwiYWNrXCI6dmFyIGI9YS5tYXRjaCgvXihbMC05XSspKFxcKyk/KC4qKS8pO2lmKGIpe2guYWNrSWQ9YlsxXSxoLmFyZ3M9W107aWYoYlszXSl0cnl7aC5hcmdzPWJbM10/Zy5wYXJzZShiWzNdKTpbXX1jYXRjaChrKXt9fWJyZWFrO2Nhc2VcImRpc2Nvbm5lY3RcIjpjYXNlXCJoZWFydGJlYXRcIjp9cmV0dXJuIGh9LGMuZGVjb2RlUGF5bG9hZD1mdW5jdGlvbihhKXtpZihhLmNoYXJBdCgwKT09XCJcXHVmZmZkXCIpe3ZhciBiPVtdO2Zvcih2YXIgZD0xLGU9XCJcIjtkPGEubGVuZ3RoO2QrKylhLmNoYXJBdChkKT09XCJcXHVmZmZkXCI/KGIucHVzaChjLmRlY29kZVBhY2tldChhLnN1YnN0cihkKzEpLnN1YnN0cigwLGUpKSksZCs9TnVtYmVyKGUpKzEsZT1cIlwiKTplKz1hLmNoYXJBdChkKTtyZXR1cm4gYn1yZXR1cm5bYy5kZWNvZGVQYWNrZXQoYSldfX0oXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvOm1vZHVsZS5leHBvcnRzLFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pbzptb2R1bGUucGFyZW50LmV4cG9ydHMpLGZ1bmN0aW9uKGEsYil7ZnVuY3Rpb24gYyhhLGIpe3RoaXMuc29ja2V0PWEsdGhpcy5zZXNzaWQ9Yn1hLlRyYW5zcG9ydD1jLGIudXRpbC5taXhpbihjLGIuRXZlbnRFbWl0dGVyKSxjLnByb3RvdHlwZS5oZWFydGJlYXRzPWZ1bmN0aW9uKCl7cmV0dXJuITB9LGMucHJvdG90eXBlLm9uRGF0YT1mdW5jdGlvbihhKXt0aGlzLmNsZWFyQ2xvc2VUaW1lb3V0KCksKHRoaXMuc29ja2V0LmNvbm5lY3RlZHx8dGhpcy5zb2NrZXQuY29ubmVjdGluZ3x8dGhpcy5zb2NrZXQucmVjb25uZWN0aW5nKSYmdGhpcy5zZXRDbG9zZVRpbWVvdXQoKTtpZihhIT09XCJcIil7dmFyIGM9Yi5wYXJzZXIuZGVjb2RlUGF5bG9hZChhKTtpZihjJiZjLmxlbmd0aClmb3IodmFyIGQ9MCxlPWMubGVuZ3RoO2Q8ZTtkKyspdGhpcy5vblBhY2tldChjW2RdKX1yZXR1cm4gdGhpc30sYy5wcm90b3R5cGUub25QYWNrZXQ9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuc29ja2V0LnNldEhlYXJ0YmVhdFRpbWVvdXQoKSxhLnR5cGU9PVwiaGVhcnRiZWF0XCI/dGhpcy5vbkhlYXJ0YmVhdCgpOihhLnR5cGU9PVwiY29ubmVjdFwiJiZhLmVuZHBvaW50PT1cIlwiJiZ0aGlzLm9uQ29ubmVjdCgpLGEudHlwZT09XCJlcnJvclwiJiZhLmFkdmljZT09XCJyZWNvbm5lY3RcIiYmKHRoaXMuaXNPcGVuPSExKSx0aGlzLnNvY2tldC5vblBhY2tldChhKSx0aGlzKX0sYy5wcm90b3R5cGUuc2V0Q2xvc2VUaW1lb3V0PWZ1bmN0aW9uKCl7aWYoIXRoaXMuY2xvc2VUaW1lb3V0KXt2YXIgYT10aGlzO3RoaXMuY2xvc2VUaW1lb3V0PXNldFRpbWVvdXQoZnVuY3Rpb24oKXthLm9uRGlzY29ubmVjdCgpfSx0aGlzLnNvY2tldC5jbG9zZVRpbWVvdXQpfX0sYy5wcm90b3R5cGUub25EaXNjb25uZWN0PWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuaXNPcGVuJiZ0aGlzLmNsb3NlKCksdGhpcy5jbGVhclRpbWVvdXRzKCksdGhpcy5zb2NrZXQub25EaXNjb25uZWN0KCksdGhpc30sYy5wcm90b3R5cGUub25Db25uZWN0PWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuc29ja2V0Lm9uQ29ubmVjdCgpLHRoaXN9LGMucHJvdG90eXBlLmNsZWFyQ2xvc2VUaW1lb3V0PWZ1bmN0aW9uKCl7dGhpcy5jbG9zZVRpbWVvdXQmJihjbGVhclRpbWVvdXQodGhpcy5jbG9zZVRpbWVvdXQpLHRoaXMuY2xvc2VUaW1lb3V0PW51bGwpfSxjLnByb3RvdHlwZS5jbGVhclRpbWVvdXRzPWZ1bmN0aW9uKCl7dGhpcy5jbGVhckNsb3NlVGltZW91dCgpLHRoaXMucmVvcGVuVGltZW91dCYmY2xlYXJUaW1lb3V0KHRoaXMucmVvcGVuVGltZW91dCl9LGMucHJvdG90eXBlLnBhY2tldD1mdW5jdGlvbihhKXt0aGlzLnNlbmQoYi5wYXJzZXIuZW5jb2RlUGFja2V0KGEpKX0sYy5wcm90b3R5cGUub25IZWFydGJlYXQ9ZnVuY3Rpb24oYSl7dGhpcy5wYWNrZXQoe3R5cGU6XCJoZWFydGJlYXRcIn0pfSxjLnByb3RvdHlwZS5vbk9wZW49ZnVuY3Rpb24oKXt0aGlzLmlzT3Blbj0hMCx0aGlzLmNsZWFyQ2xvc2VUaW1lb3V0KCksdGhpcy5zb2NrZXQub25PcGVuKCl9LGMucHJvdG90eXBlLm9uQ2xvc2U9ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3RoaXMuaXNPcGVuPSExLHRoaXMuc29ja2V0Lm9uQ2xvc2UoKSx0aGlzLm9uRGlzY29ubmVjdCgpfSxjLnByb3RvdHlwZS5wcmVwYXJlVXJsPWZ1bmN0aW9uKCl7dmFyIGE9dGhpcy5zb2NrZXQub3B0aW9ucztyZXR1cm4gdGhpcy5zY2hlbWUoKStcIjovL1wiK2EuaG9zdCtcIjpcIithLnBvcnQrXCIvXCIrYS5yZXNvdXJjZStcIi9cIitiLnByb3RvY29sK1wiL1wiK3RoaXMubmFtZStcIi9cIit0aGlzLnNlc3NpZH0sYy5wcm90b3R5cGUucmVhZHk9ZnVuY3Rpb24oYSxiKXtiLmNhbGwodGhpcyl9fShcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW86bW9kdWxlLmV4cG9ydHMsXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvOm1vZHVsZS5wYXJlbnQuZXhwb3J0cyksZnVuY3Rpb24oYSxiLGMpe2Z1bmN0aW9uIGQoYSl7dGhpcy5vcHRpb25zPXtwb3J0OjgwLHNlY3VyZTohMSxkb2N1bWVudDpcImRvY3VtZW50XCJpbiBjP2RvY3VtZW50OiExLHJlc291cmNlOlwic29ja2V0LmlvXCIsdHJhbnNwb3J0czpiLnRyYW5zcG9ydHMsXCJjb25uZWN0IHRpbWVvdXRcIjoxZTQsXCJ0cnkgbXVsdGlwbGUgdHJhbnNwb3J0c1wiOiEwLHJlY29ubmVjdDohMCxcInJlY29ubmVjdGlvbiBkZWxheVwiOjUwMCxcInJlY29ubmVjdGlvbiBsaW1pdFwiOkluZmluaXR5LFwicmVvcGVuIGRlbGF5XCI6M2UzLFwibWF4IHJlY29ubmVjdGlvbiBhdHRlbXB0c1wiOjEwLFwic3luYyBkaXNjb25uZWN0IG9uIHVubG9hZFwiOiExLFwiYXV0byBjb25uZWN0XCI6ITAsXCJmbGFzaCBwb2xpY3kgcG9ydFwiOjEwODQzLG1hbnVhbEZsdXNoOiExfSxiLnV0aWwubWVyZ2UodGhpcy5vcHRpb25zLGEpLHRoaXMuY29ubmVjdGVkPSExLHRoaXMub3Blbj0hMSx0aGlzLmNvbm5lY3Rpbmc9ITEsdGhpcy5yZWNvbm5lY3Rpbmc9ITEsdGhpcy5uYW1lc3BhY2VzPXt9LHRoaXMuYnVmZmVyPVtdLHRoaXMuZG9CdWZmZXI9ITE7aWYodGhpcy5vcHRpb25zW1wic3luYyBkaXNjb25uZWN0IG9uIHVubG9hZFwiXSYmKCF0aGlzLmlzWERvbWFpbigpfHxiLnV0aWwudWEuaGFzQ09SUykpe3ZhciBkPXRoaXM7Yi51dGlsLm9uKGMsXCJiZWZvcmV1bmxvYWRcIixmdW5jdGlvbigpe2QuZGlzY29ubmVjdFN5bmMoKX0sITEpfXRoaXMub3B0aW9uc1tcImF1dG8gY29ubmVjdFwiXSYmdGhpcy5jb25uZWN0KCl9ZnVuY3Rpb24gZSgpe31hLlNvY2tldD1kLGIudXRpbC5taXhpbihkLGIuRXZlbnRFbWl0dGVyKSxkLnByb3RvdHlwZS5vZj1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5uYW1lc3BhY2VzW2FdfHwodGhpcy5uYW1lc3BhY2VzW2FdPW5ldyBiLlNvY2tldE5hbWVzcGFjZSh0aGlzLGEpLGEhPT1cIlwiJiZ0aGlzLm5hbWVzcGFjZXNbYV0ucGFja2V0KHt0eXBlOlwiY29ubmVjdFwifSkpLHRoaXMubmFtZXNwYWNlc1thXX0sZC5wcm90b3R5cGUucHVibGlzaD1mdW5jdGlvbigpe3RoaXMuZW1pdC5hcHBseSh0aGlzLGFyZ3VtZW50cyk7dmFyIGE7Zm9yKHZhciBiIGluIHRoaXMubmFtZXNwYWNlcyl0aGlzLm5hbWVzcGFjZXMuaGFzT3duUHJvcGVydHkoYikmJihhPXRoaXMub2YoYiksYS4kZW1pdC5hcHBseShhLGFyZ3VtZW50cykpfSxkLnByb3RvdHlwZS5oYW5kc2hha2U9ZnVuY3Rpb24oYSl7ZnVuY3Rpb24gZihiKXtiIGluc3RhbmNlb2YgRXJyb3I/KGMuY29ubmVjdGluZz0hMSxjLm9uRXJyb3IoYi5tZXNzYWdlKSk6YS5hcHBseShudWxsLGIuc3BsaXQoXCI6XCIpKX12YXIgYz10aGlzLGQ9dGhpcy5vcHRpb25zLGc9W1wiaHR0cFwiKyhkLnNlY3VyZT9cInNcIjpcIlwiKStcIjovXCIsZC5ob3N0K1wiOlwiK2QucG9ydCxkLnJlc291cmNlLGIucHJvdG9jb2wsYi51dGlsLnF1ZXJ5KHRoaXMub3B0aW9ucy5xdWVyeSxcInQ9XCIrICsobmV3IERhdGUpKV0uam9pbihcIi9cIik7aWYodGhpcy5pc1hEb21haW4oKSYmIWIudXRpbC51YS5oYXNDT1JTKXt2YXIgaD1kb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcInNjcmlwdFwiKVswXSxpPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzY3JpcHRcIik7aS5zcmM9ZytcIiZqc29ucD1cIitiLmoubGVuZ3RoLGgucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUoaSxoKSxiLmoucHVzaChmdW5jdGlvbihhKXtmKGEpLGkucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChpKX0pfWVsc2V7dmFyIGo9Yi51dGlsLnJlcXVlc3QoKTtqLm9wZW4oXCJHRVRcIixnLCEwKSx0aGlzLmlzWERvbWFpbigpJiYoai53aXRoQ3JlZGVudGlhbHM9ITApLGoub25yZWFkeXN0YXRlY2hhbmdlPWZ1bmN0aW9uKCl7ai5yZWFkeVN0YXRlPT00JiYoai5vbnJlYWR5c3RhdGVjaGFuZ2U9ZSxqLnN0YXR1cz09MjAwP2Yoai5yZXNwb25zZVRleHQpOmouc3RhdHVzPT00MDM/Yy5vbkVycm9yKGoucmVzcG9uc2VUZXh0KTooYy5jb25uZWN0aW5nPSExLCFjLnJlY29ubmVjdGluZyYmYy5vbkVycm9yKGoucmVzcG9uc2VUZXh0KSkpfSxqLnNlbmQobnVsbCl9fSxkLnByb3RvdHlwZS5nZXRUcmFuc3BvcnQ9ZnVuY3Rpb24oYSl7dmFyIGM9YXx8dGhpcy50cmFuc3BvcnRzLGQ7Zm9yKHZhciBlPTAsZjtmPWNbZV07ZSsrKWlmKGIuVHJhbnNwb3J0W2ZdJiZiLlRyYW5zcG9ydFtmXS5jaGVjayh0aGlzKSYmKCF0aGlzLmlzWERvbWFpbigpfHxiLlRyYW5zcG9ydFtmXS54ZG9tYWluQ2hlY2sodGhpcykpKXJldHVybiBuZXcgYi5UcmFuc3BvcnRbZl0odGhpcyx0aGlzLnNlc3Npb25pZCk7cmV0dXJuIG51bGx9LGQucHJvdG90eXBlLmNvbm5lY3Q9ZnVuY3Rpb24oYSl7aWYodGhpcy5jb25uZWN0aW5nKXJldHVybiB0aGlzO3ZhciBjPXRoaXM7cmV0dXJuIGMuY29ubmVjdGluZz0hMCx0aGlzLmhhbmRzaGFrZShmdW5jdGlvbihkLGUsZixnKXtmdW5jdGlvbiBoKGEpe2MudHJhbnNwb3J0JiZjLnRyYW5zcG9ydC5jbGVhclRpbWVvdXRzKCksYy50cmFuc3BvcnQ9Yy5nZXRUcmFuc3BvcnQoYSk7aWYoIWMudHJhbnNwb3J0KXJldHVybiBjLnB1Ymxpc2goXCJjb25uZWN0X2ZhaWxlZFwiKTtjLnRyYW5zcG9ydC5yZWFkeShjLGZ1bmN0aW9uKCl7Yy5jb25uZWN0aW5nPSEwLGMucHVibGlzaChcImNvbm5lY3RpbmdcIixjLnRyYW5zcG9ydC5uYW1lKSxjLnRyYW5zcG9ydC5vcGVuKCksYy5vcHRpb25zW1wiY29ubmVjdCB0aW1lb3V0XCJdJiYoYy5jb25uZWN0VGltZW91dFRpbWVyPXNldFRpbWVvdXQoZnVuY3Rpb24oKXtpZighYy5jb25uZWN0ZWQpe2MuY29ubmVjdGluZz0hMTtpZihjLm9wdGlvbnNbXCJ0cnkgbXVsdGlwbGUgdHJhbnNwb3J0c1wiXSl7dmFyIGE9Yy50cmFuc3BvcnRzO3doaWxlKGEubGVuZ3RoPjAmJmEuc3BsaWNlKDAsMSlbMF0hPWMudHJhbnNwb3J0Lm5hbWUpO2EubGVuZ3RoP2goYSk6Yy5wdWJsaXNoKFwiY29ubmVjdF9mYWlsZWRcIil9fX0sYy5vcHRpb25zW1wiY29ubmVjdCB0aW1lb3V0XCJdKSl9KX1jLnNlc3Npb25pZD1kLGMuY2xvc2VUaW1lb3V0PWYqMWUzLGMuaGVhcnRiZWF0VGltZW91dD1lKjFlMyxjLnRyYW5zcG9ydHN8fChjLnRyYW5zcG9ydHM9Yy5vcmlnVHJhbnNwb3J0cz1nP2IudXRpbC5pbnRlcnNlY3QoZy5zcGxpdChcIixcIiksYy5vcHRpb25zLnRyYW5zcG9ydHMpOmMub3B0aW9ucy50cmFuc3BvcnRzKSxjLnNldEhlYXJ0YmVhdFRpbWVvdXQoKSxoKGMudHJhbnNwb3J0cyksYy5vbmNlKFwiY29ubmVjdFwiLGZ1bmN0aW9uKCl7Y2xlYXJUaW1lb3V0KGMuY29ubmVjdFRpbWVvdXRUaW1lciksYSYmdHlwZW9mIGE9PVwiZnVuY3Rpb25cIiYmYSgpfSl9KSx0aGlzfSxkLnByb3RvdHlwZS5zZXRIZWFydGJlYXRUaW1lb3V0PWZ1bmN0aW9uKCl7Y2xlYXJUaW1lb3V0KHRoaXMuaGVhcnRiZWF0VGltZW91dFRpbWVyKTtpZih0aGlzLnRyYW5zcG9ydCYmIXRoaXMudHJhbnNwb3J0LmhlYXJ0YmVhdHMoKSlyZXR1cm47dmFyIGE9dGhpczt0aGlzLmhlYXJ0YmVhdFRpbWVvdXRUaW1lcj1zZXRUaW1lb3V0KGZ1bmN0aW9uKCl7YS50cmFuc3BvcnQub25DbG9zZSgpfSx0aGlzLmhlYXJ0YmVhdFRpbWVvdXQpfSxkLnByb3RvdHlwZS5wYWNrZXQ9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuY29ubmVjdGVkJiYhdGhpcy5kb0J1ZmZlcj90aGlzLnRyYW5zcG9ydC5wYWNrZXQoYSk6dGhpcy5idWZmZXIucHVzaChhKSx0aGlzfSxkLnByb3RvdHlwZS5zZXRCdWZmZXI9ZnVuY3Rpb24oYSl7dGhpcy5kb0J1ZmZlcj1hLCFhJiZ0aGlzLmNvbm5lY3RlZCYmdGhpcy5idWZmZXIubGVuZ3RoJiYodGhpcy5vcHRpb25zLm1hbnVhbEZsdXNofHx0aGlzLmZsdXNoQnVmZmVyKCkpfSxkLnByb3RvdHlwZS5mbHVzaEJ1ZmZlcj1mdW5jdGlvbigpe3RoaXMudHJhbnNwb3J0LnBheWxvYWQodGhpcy5idWZmZXIpLHRoaXMuYnVmZmVyPVtdfSxkLnByb3RvdHlwZS5kaXNjb25uZWN0PWZ1bmN0aW9uKCl7aWYodGhpcy5jb25uZWN0ZWR8fHRoaXMuY29ubmVjdGluZyl0aGlzLm9wZW4mJnRoaXMub2YoXCJcIikucGFja2V0KHt0eXBlOlwiZGlzY29ubmVjdFwifSksdGhpcy5vbkRpc2Nvbm5lY3QoXCJib290ZWRcIik7cmV0dXJuIHRoaXN9LGQucHJvdG90eXBlLmRpc2Nvbm5lY3RTeW5jPWZ1bmN0aW9uKCl7dmFyIGE9Yi51dGlsLnJlcXVlc3QoKSxjPVtcImh0dHBcIisodGhpcy5vcHRpb25zLnNlY3VyZT9cInNcIjpcIlwiKStcIjovXCIsdGhpcy5vcHRpb25zLmhvc3QrXCI6XCIrdGhpcy5vcHRpb25zLnBvcnQsdGhpcy5vcHRpb25zLnJlc291cmNlLGIucHJvdG9jb2wsXCJcIix0aGlzLnNlc3Npb25pZF0uam9pbihcIi9cIikrXCIvP2Rpc2Nvbm5lY3Q9MVwiO2Eub3BlbihcIkdFVFwiLGMsITEpLGEuc2VuZChudWxsKSx0aGlzLm9uRGlzY29ubmVjdChcImJvb3RlZFwiKX0sZC5wcm90b3R5cGUuaXNYRG9tYWluPWZ1bmN0aW9uKCl7dmFyIGE9Yy5sb2NhdGlvbi5wb3J0fHwoXCJodHRwczpcIj09Yy5sb2NhdGlvbi5wcm90b2NvbD80NDM6ODApO3JldHVybiB0aGlzLm9wdGlvbnMuaG9zdCE9PWMubG9jYXRpb24uaG9zdG5hbWV8fHRoaXMub3B0aW9ucy5wb3J0IT1hfSxkLnByb3RvdHlwZS5vbkNvbm5lY3Q9ZnVuY3Rpb24oKXt0aGlzLmNvbm5lY3RlZHx8KHRoaXMuY29ubmVjdGVkPSEwLHRoaXMuY29ubmVjdGluZz0hMSx0aGlzLmRvQnVmZmVyfHx0aGlzLnNldEJ1ZmZlcighMSksdGhpcy5lbWl0KFwiY29ubmVjdFwiKSl9LGQucHJvdG90eXBlLm9uT3Blbj1mdW5jdGlvbigpe3RoaXMub3Blbj0hMH0sZC5wcm90b3R5cGUub25DbG9zZT1mdW5jdGlvbigpe3RoaXMub3Blbj0hMSxjbGVhclRpbWVvdXQodGhpcy5oZWFydGJlYXRUaW1lb3V0VGltZXIpfSxkLnByb3RvdHlwZS5vblBhY2tldD1mdW5jdGlvbihhKXt0aGlzLm9mKGEuZW5kcG9pbnQpLm9uUGFja2V0KGEpfSxkLnByb3RvdHlwZS5vbkVycm9yPWZ1bmN0aW9uKGEpe2EmJmEuYWR2aWNlJiZhLmFkdmljZT09PVwicmVjb25uZWN0XCImJih0aGlzLmNvbm5lY3RlZHx8dGhpcy5jb25uZWN0aW5nKSYmKHRoaXMuZGlzY29ubmVjdCgpLHRoaXMub3B0aW9ucy5yZWNvbm5lY3QmJnRoaXMucmVjb25uZWN0KCkpLHRoaXMucHVibGlzaChcImVycm9yXCIsYSYmYS5yZWFzb24/YS5yZWFzb246YSl9LGQucHJvdG90eXBlLm9uRGlzY29ubmVjdD1mdW5jdGlvbihhKXt2YXIgYj10aGlzLmNvbm5lY3RlZCxjPXRoaXMuY29ubmVjdGluZzt0aGlzLmNvbm5lY3RlZD0hMSx0aGlzLmNvbm5lY3Rpbmc9ITEsdGhpcy5vcGVuPSExO2lmKGJ8fGMpdGhpcy50cmFuc3BvcnQuY2xvc2UoKSx0aGlzLnRyYW5zcG9ydC5jbGVhclRpbWVvdXRzKCksYiYmKHRoaXMucHVibGlzaChcImRpc2Nvbm5lY3RcIixhKSxcImJvb3RlZFwiIT1hJiZ0aGlzLm9wdGlvbnMucmVjb25uZWN0JiYhdGhpcy5yZWNvbm5lY3RpbmcmJnRoaXMucmVjb25uZWN0KCkpfSxkLnByb3RvdHlwZS5yZWNvbm5lY3Q9ZnVuY3Rpb24oKXtmdW5jdGlvbiBlKCl7aWYoYS5jb25uZWN0ZWQpe2Zvcih2YXIgYiBpbiBhLm5hbWVzcGFjZXMpYS5uYW1lc3BhY2VzLmhhc093blByb3BlcnR5KGIpJiZcIlwiIT09YiYmYS5uYW1lc3BhY2VzW2JdLnBhY2tldCh7dHlwZTpcImNvbm5lY3RcIn0pO2EucHVibGlzaChcInJlY29ubmVjdFwiLGEudHJhbnNwb3J0Lm5hbWUsYS5yZWNvbm5lY3Rpb25BdHRlbXB0cyl9Y2xlYXJUaW1lb3V0KGEucmVjb25uZWN0aW9uVGltZXIpLGEucmVtb3ZlTGlzdGVuZXIoXCJjb25uZWN0X2ZhaWxlZFwiLGYpLGEucmVtb3ZlTGlzdGVuZXIoXCJjb25uZWN0XCIsZiksYS5yZWNvbm5lY3Rpbmc9ITEsZGVsZXRlIGEucmVjb25uZWN0aW9uQXR0ZW1wdHMsZGVsZXRlIGEucmVjb25uZWN0aW9uRGVsYXksZGVsZXRlIGEucmVjb25uZWN0aW9uVGltZXIsZGVsZXRlIGEucmVkb1RyYW5zcG9ydHMsYS5vcHRpb25zW1widHJ5IG11bHRpcGxlIHRyYW5zcG9ydHNcIl09Y31mdW5jdGlvbiBmKCl7aWYoIWEucmVjb25uZWN0aW5nKXJldHVybjtpZihhLmNvbm5lY3RlZClyZXR1cm4gZSgpO2lmKGEuY29ubmVjdGluZyYmYS5yZWNvbm5lY3RpbmcpcmV0dXJuIGEucmVjb25uZWN0aW9uVGltZXI9c2V0VGltZW91dChmLDFlMyk7YS5yZWNvbm5lY3Rpb25BdHRlbXB0cysrPj1iP2EucmVkb1RyYW5zcG9ydHM/KGEucHVibGlzaChcInJlY29ubmVjdF9mYWlsZWRcIiksZSgpKTooYS5vbihcImNvbm5lY3RfZmFpbGVkXCIsZiksYS5vcHRpb25zW1widHJ5IG11bHRpcGxlIHRyYW5zcG9ydHNcIl09ITAsYS50cmFuc3BvcnRzPWEub3JpZ1RyYW5zcG9ydHMsYS50cmFuc3BvcnQ9YS5nZXRUcmFuc3BvcnQoKSxhLnJlZG9UcmFuc3BvcnRzPSEwLGEuY29ubmVjdCgpKTooYS5yZWNvbm5lY3Rpb25EZWxheTxkJiYoYS5yZWNvbm5lY3Rpb25EZWxheSo9MiksYS5jb25uZWN0KCksYS5wdWJsaXNoKFwicmVjb25uZWN0aW5nXCIsYS5yZWNvbm5lY3Rpb25EZWxheSxhLnJlY29ubmVjdGlvbkF0dGVtcHRzKSxhLnJlY29ubmVjdGlvblRpbWVyPXNldFRpbWVvdXQoZixhLnJlY29ubmVjdGlvbkRlbGF5KSl9dGhpcy5yZWNvbm5lY3Rpbmc9ITAsdGhpcy5yZWNvbm5lY3Rpb25BdHRlbXB0cz0wLHRoaXMucmVjb25uZWN0aW9uRGVsYXk9dGhpcy5vcHRpb25zW1wicmVjb25uZWN0aW9uIGRlbGF5XCJdO3ZhciBhPXRoaXMsYj10aGlzLm9wdGlvbnNbXCJtYXggcmVjb25uZWN0aW9uIGF0dGVtcHRzXCJdLGM9dGhpcy5vcHRpb25zW1widHJ5IG11bHRpcGxlIHRyYW5zcG9ydHNcIl0sZD10aGlzLm9wdGlvbnNbXCJyZWNvbm5lY3Rpb24gbGltaXRcIl07dGhpcy5vcHRpb25zW1widHJ5IG11bHRpcGxlIHRyYW5zcG9ydHNcIl09ITEsdGhpcy5yZWNvbm5lY3Rpb25UaW1lcj1zZXRUaW1lb3V0KGYsdGhpcy5yZWNvbm5lY3Rpb25EZWxheSksdGhpcy5vbihcImNvbm5lY3RcIixmKX19KFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pbzptb2R1bGUuZXhwb3J0cyxcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW86bW9kdWxlLnBhcmVudC5leHBvcnRzLHRoaXMpLGZ1bmN0aW9uKGEsYil7ZnVuY3Rpb24gYyhhLGIpe3RoaXMuc29ja2V0PWEsdGhpcy5uYW1lPWJ8fFwiXCIsdGhpcy5mbGFncz17fSx0aGlzLmpzb249bmV3IGQodGhpcyxcImpzb25cIiksdGhpcy5hY2tQYWNrZXRzPTAsdGhpcy5hY2tzPXt9fWZ1bmN0aW9uIGQoYSxiKXt0aGlzLm5hbWVzcGFjZT1hLHRoaXMubmFtZT1ifWEuU29ja2V0TmFtZXNwYWNlPWMsYi51dGlsLm1peGluKGMsYi5FdmVudEVtaXR0ZXIpLGMucHJvdG90eXBlLiRlbWl0PWIuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0LGMucHJvdG90eXBlLm9mPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuc29ja2V0Lm9mLmFwcGx5KHRoaXMuc29ja2V0LGFyZ3VtZW50cyl9LGMucHJvdG90eXBlLnBhY2tldD1mdW5jdGlvbihhKXtyZXR1cm4gYS5lbmRwb2ludD10aGlzLm5hbWUsdGhpcy5zb2NrZXQucGFja2V0KGEpLHRoaXMuZmxhZ3M9e30sdGhpc30sYy5wcm90b3R5cGUuc2VuZD1mdW5jdGlvbihhLGIpe3ZhciBjPXt0eXBlOnRoaXMuZmxhZ3MuanNvbj9cImpzb25cIjpcIm1lc3NhZ2VcIixkYXRhOmF9O3JldHVyblwiZnVuY3Rpb25cIj09dHlwZW9mIGImJihjLmlkPSsrdGhpcy5hY2tQYWNrZXRzLGMuYWNrPSEwLHRoaXMuYWNrc1tjLmlkXT1iKSx0aGlzLnBhY2tldChjKX0sYy5wcm90b3R5cGUuZW1pdD1mdW5jdGlvbihhKXt2YXIgYj1BcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsMSksYz1iW2IubGVuZ3RoLTFdLGQ9e3R5cGU6XCJldmVudFwiLG5hbWU6YX07cmV0dXJuXCJmdW5jdGlvblwiPT10eXBlb2YgYyYmKGQuaWQ9Kyt0aGlzLmFja1BhY2tldHMsZC5hY2s9XCJkYXRhXCIsdGhpcy5hY2tzW2QuaWRdPWMsYj1iLnNsaWNlKDAsYi5sZW5ndGgtMSkpLGQuYXJncz1iLHRoaXMucGFja2V0KGQpfSxjLnByb3RvdHlwZS5kaXNjb25uZWN0PWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMubmFtZT09PVwiXCI/dGhpcy5zb2NrZXQuZGlzY29ubmVjdCgpOih0aGlzLnBhY2tldCh7dHlwZTpcImRpc2Nvbm5lY3RcIn0pLHRoaXMuJGVtaXQoXCJkaXNjb25uZWN0XCIpKSx0aGlzfSxjLnByb3RvdHlwZS5vblBhY2tldD1mdW5jdGlvbihhKXtmdW5jdGlvbiBkKCl7Yy5wYWNrZXQoe3R5cGU6XCJhY2tcIixhcmdzOmIudXRpbC50b0FycmF5KGFyZ3VtZW50cyksYWNrSWQ6YS5pZH0pfXZhciBjPXRoaXM7c3dpdGNoKGEudHlwZSl7Y2FzZVwiY29ubmVjdFwiOnRoaXMuJGVtaXQoXCJjb25uZWN0XCIpO2JyZWFrO2Nhc2VcImRpc2Nvbm5lY3RcIjp0aGlzLm5hbWU9PT1cIlwiP3RoaXMuc29ja2V0Lm9uRGlzY29ubmVjdChhLnJlYXNvbnx8XCJib290ZWRcIik6dGhpcy4kZW1pdChcImRpc2Nvbm5lY3RcIixhLnJlYXNvbik7YnJlYWs7Y2FzZVwibWVzc2FnZVwiOmNhc2VcImpzb25cIjp2YXIgZT1bXCJtZXNzYWdlXCIsYS5kYXRhXTthLmFjaz09XCJkYXRhXCI/ZS5wdXNoKGQpOmEuYWNrJiZ0aGlzLnBhY2tldCh7dHlwZTpcImFja1wiLGFja0lkOmEuaWR9KSx0aGlzLiRlbWl0LmFwcGx5KHRoaXMsZSk7YnJlYWs7Y2FzZVwiZXZlbnRcIjp2YXIgZT1bYS5uYW1lXS5jb25jYXQoYS5hcmdzKTthLmFjaz09XCJkYXRhXCImJmUucHVzaChkKSx0aGlzLiRlbWl0LmFwcGx5KHRoaXMsZSk7YnJlYWs7Y2FzZVwiYWNrXCI6dGhpcy5hY2tzW2EuYWNrSWRdJiYodGhpcy5hY2tzW2EuYWNrSWRdLmFwcGx5KHRoaXMsYS5hcmdzKSxkZWxldGUgdGhpcy5hY2tzW2EuYWNrSWRdKTticmVhaztjYXNlXCJlcnJvclwiOmEuYWR2aWNlP3RoaXMuc29ja2V0Lm9uRXJyb3IoYSk6YS5yZWFzb249PVwidW5hdXRob3JpemVkXCI/dGhpcy4kZW1pdChcImNvbm5lY3RfZmFpbGVkXCIsYS5yZWFzb24pOnRoaXMuJGVtaXQoXCJlcnJvclwiLGEucmVhc29uKX19LGQucHJvdG90eXBlLnNlbmQ9ZnVuY3Rpb24oKXt0aGlzLm5hbWVzcGFjZS5mbGFnc1t0aGlzLm5hbWVdPSEwLHRoaXMubmFtZXNwYWNlLnNlbmQuYXBwbHkodGhpcy5uYW1lc3BhY2UsYXJndW1lbnRzKX0sZC5wcm90b3R5cGUuZW1pdD1mdW5jdGlvbigpe3RoaXMubmFtZXNwYWNlLmZsYWdzW3RoaXMubmFtZV09ITAsdGhpcy5uYW1lc3BhY2UuZW1pdC5hcHBseSh0aGlzLm5hbWVzcGFjZSxhcmd1bWVudHMpfX0oXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvOm1vZHVsZS5leHBvcnRzLFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pbzptb2R1bGUucGFyZW50LmV4cG9ydHMpLGZ1bmN0aW9uKGEsYixjKXtmdW5jdGlvbiBkKGEpe2IuVHJhbnNwb3J0LmFwcGx5KHRoaXMsYXJndW1lbnRzKX1hLndlYnNvY2tldD1kLGIudXRpbC5pbmhlcml0KGQsYi5UcmFuc3BvcnQpLGQucHJvdG90eXBlLm5hbWU9XCJ3ZWJzb2NrZXRcIixkLnByb3RvdHlwZS5vcGVuPWZ1bmN0aW9uKCl7dmFyIGE9Yi51dGlsLnF1ZXJ5KHRoaXMuc29ja2V0Lm9wdGlvbnMucXVlcnkpLGQ9dGhpcyxlO3JldHVybiBlfHwoZT1jLk1veldlYlNvY2tldHx8Yy5XZWJTb2NrZXQpLHRoaXMud2Vic29ja2V0PW5ldyBlKHRoaXMucHJlcGFyZVVybCgpK2EpLHRoaXMud2Vic29ja2V0Lm9ub3Blbj1mdW5jdGlvbigpe2Qub25PcGVuKCksZC5zb2NrZXQuc2V0QnVmZmVyKCExKX0sdGhpcy53ZWJzb2NrZXQub25tZXNzYWdlPWZ1bmN0aW9uKGEpe2Qub25EYXRhKGEuZGF0YSl9LHRoaXMud2Vic29ja2V0Lm9uY2xvc2U9ZnVuY3Rpb24oKXtkLm9uQ2xvc2UoKSxkLnNvY2tldC5zZXRCdWZmZXIoITApfSx0aGlzLndlYnNvY2tldC5vbmVycm9yPWZ1bmN0aW9uKGEpe2Qub25FcnJvcihhKX0sdGhpc30sYi51dGlsLnVhLmlEZXZpY2U/ZC5wcm90b3R5cGUuc2VuZD1mdW5jdGlvbihhKXt2YXIgYj10aGlzO3JldHVybiBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7Yi53ZWJzb2NrZXQuc2VuZChhKX0sMCksdGhpc306ZC5wcm90b3R5cGUuc2VuZD1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy53ZWJzb2NrZXQuc2VuZChhKSx0aGlzfSxkLnByb3RvdHlwZS5wYXlsb2FkPWZ1bmN0aW9uKGEpe2Zvcih2YXIgYj0wLGM9YS5sZW5ndGg7YjxjO2IrKyl0aGlzLnBhY2tldChhW2JdKTtyZXR1cm4gdGhpc30sZC5wcm90b3R5cGUuY2xvc2U9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy53ZWJzb2NrZXQuY2xvc2UoKSx0aGlzfSxkLnByb3RvdHlwZS5vbkVycm9yPWZ1bmN0aW9uKGEpe3RoaXMuc29ja2V0Lm9uRXJyb3IoYSl9LGQucHJvdG90eXBlLnNjaGVtZT1mdW5jdGlvbigpe3JldHVybiB0aGlzLnNvY2tldC5vcHRpb25zLnNlY3VyZT9cIndzc1wiOlwid3NcIn0sZC5jaGVjaz1mdW5jdGlvbigpe3JldHVyblwiV2ViU29ja2V0XCJpbiBjJiYhKFwiX19hZGRUYXNrXCJpbiBXZWJTb2NrZXQpfHxcIk1veldlYlNvY2tldFwiaW4gY30sZC54ZG9tYWluQ2hlY2s9ZnVuY3Rpb24oKXtyZXR1cm4hMH0sYi50cmFuc3BvcnRzLnB1c2goXCJ3ZWJzb2NrZXRcIil9KFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pby5UcmFuc3BvcnQ6bW9kdWxlLmV4cG9ydHMsXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvOm1vZHVsZS5wYXJlbnQuZXhwb3J0cyx0aGlzKSxmdW5jdGlvbihhLGIpe2Z1bmN0aW9uIGMoKXtiLlRyYW5zcG9ydC53ZWJzb2NrZXQuYXBwbHkodGhpcyxhcmd1bWVudHMpfWEuZmxhc2hzb2NrZXQ9YyxiLnV0aWwuaW5oZXJpdChjLGIuVHJhbnNwb3J0LndlYnNvY2tldCksYy5wcm90b3R5cGUubmFtZT1cImZsYXNoc29ja2V0XCIsYy5wcm90b3R5cGUub3Blbj1mdW5jdGlvbigpe3ZhciBhPXRoaXMsYz1hcmd1bWVudHM7cmV0dXJuIFdlYlNvY2tldC5fX2FkZFRhc2soZnVuY3Rpb24oKXtiLlRyYW5zcG9ydC53ZWJzb2NrZXQucHJvdG90eXBlLm9wZW4uYXBwbHkoYSxjKX0pLHRoaXN9LGMucHJvdG90eXBlLnNlbmQ9ZnVuY3Rpb24oKXt2YXIgYT10aGlzLGM9YXJndW1lbnRzO3JldHVybiBXZWJTb2NrZXQuX19hZGRUYXNrKGZ1bmN0aW9uKCl7Yi5UcmFuc3BvcnQud2Vic29ja2V0LnByb3RvdHlwZS5zZW5kLmFwcGx5KGEsYyl9KSx0aGlzfSxjLnByb3RvdHlwZS5jbG9zZT1mdW5jdGlvbigpe3JldHVybiBXZWJTb2NrZXQuX190YXNrcy5sZW5ndGg9MCxiLlRyYW5zcG9ydC53ZWJzb2NrZXQucHJvdG90eXBlLmNsb3NlLmNhbGwodGhpcyksdGhpc30sYy5wcm90b3R5cGUucmVhZHk9ZnVuY3Rpb24oYSxkKXtmdW5jdGlvbiBlKCl7dmFyIGI9YS5vcHRpb25zLGU9YltcImZsYXNoIHBvbGljeSBwb3J0XCJdLGc9W1wiaHR0cFwiKyhiLnNlY3VyZT9cInNcIjpcIlwiKStcIjovXCIsYi5ob3N0K1wiOlwiK2IucG9ydCxiLnJlc291cmNlLFwic3RhdGljL2ZsYXNoc29ja2V0XCIsXCJXZWJTb2NrZXRNYWluXCIrKGEuaXNYRG9tYWluKCk/XCJJbnNlY3VyZVwiOlwiXCIpK1wiLnN3ZlwiXTtjLmxvYWRlZHx8KHR5cGVvZiBXRUJfU09DS0VUX1NXRl9MT0NBVElPTj09XCJ1bmRlZmluZWRcIiYmKFdFQl9TT0NLRVRfU1dGX0xPQ0FUSU9OPWcuam9pbihcIi9cIikpLGUhPT04NDMmJldlYlNvY2tldC5sb2FkRmxhc2hQb2xpY3lGaWxlKFwieG1sc29ja2V0Oi8vXCIrYi5ob3N0K1wiOlwiK2UpLFdlYlNvY2tldC5fX2luaXRpYWxpemUoKSxjLmxvYWRlZD0hMCksZC5jYWxsKGYpfXZhciBmPXRoaXM7aWYoZG9jdW1lbnQuYm9keSlyZXR1cm4gZSgpO2IudXRpbC5sb2FkKGUpfSxjLmNoZWNrPWZ1bmN0aW9uKCl7cmV0dXJuIHR5cGVvZiBXZWJTb2NrZXQhPVwidW5kZWZpbmVkXCImJlwiX19pbml0aWFsaXplXCJpbiBXZWJTb2NrZXQmJiEhc3dmb2JqZWN0P3N3Zm9iamVjdC5nZXRGbGFzaFBsYXllclZlcnNpb24oKS5tYWpvcj49MTA6ITF9LGMueGRvbWFpbkNoZWNrPWZ1bmN0aW9uKCl7cmV0dXJuITB9LHR5cGVvZiB3aW5kb3chPVwidW5kZWZpbmVkXCImJihXRUJfU09DS0VUX0RJU0FCTEVfQVVUT19JTklUSUFMSVpBVElPTj0hMCksYi50cmFuc3BvcnRzLnB1c2goXCJmbGFzaHNvY2tldFwiKX0oXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvLlRyYW5zcG9ydDptb2R1bGUuZXhwb3J0cyxcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW86bW9kdWxlLnBhcmVudC5leHBvcnRzKTtpZihcInVuZGVmaW5lZFwiIT10eXBlb2Ygd2luZG93KXZhciBzd2ZvYmplY3Q9ZnVuY3Rpb24oKXtmdW5jdGlvbiBBKCl7aWYodClyZXR1cm47dHJ5e3ZhciBhPWkuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJib2R5XCIpWzBdLmFwcGVuZENoaWxkKFEoXCJzcGFuXCIpKTthLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoYSl9Y2F0Y2goYil7cmV0dXJufXQ9ITA7dmFyIGM9bC5sZW5ndGg7Zm9yKHZhciBkPTA7ZDxjO2QrKylsW2RdKCl9ZnVuY3Rpb24gQihhKXt0P2EoKTpsW2wubGVuZ3RoXT1hfWZ1bmN0aW9uIEMoYil7aWYodHlwZW9mIGguYWRkRXZlbnRMaXN0ZW5lciE9YSloLmFkZEV2ZW50TGlzdGVuZXIoXCJsb2FkXCIsYiwhMSk7ZWxzZSBpZih0eXBlb2YgaS5hZGRFdmVudExpc3RlbmVyIT1hKWkuYWRkRXZlbnRMaXN0ZW5lcihcImxvYWRcIixiLCExKTtlbHNlIGlmKHR5cGVvZiBoLmF0dGFjaEV2ZW50IT1hKVIoaCxcIm9ubG9hZFwiLGIpO2Vsc2UgaWYodHlwZW9mIGgub25sb2FkPT1cImZ1bmN0aW9uXCIpe3ZhciBjPWgub25sb2FkO2gub25sb2FkPWZ1bmN0aW9uKCl7YygpLGIoKX19ZWxzZSBoLm9ubG9hZD1ifWZ1bmN0aW9uIEQoKXtrP0UoKTpGKCl9ZnVuY3Rpb24gRSgpe3ZhciBjPWkuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJib2R5XCIpWzBdLGQ9UShiKTtkLnNldEF0dHJpYnV0ZShcInR5cGVcIixlKTt2YXIgZj1jLmFwcGVuZENoaWxkKGQpO2lmKGYpe3ZhciBnPTA7KGZ1bmN0aW9uKCl7aWYodHlwZW9mIGYuR2V0VmFyaWFibGUhPWEpe3ZhciBiPWYuR2V0VmFyaWFibGUoXCIkdmVyc2lvblwiKTtiJiYoYj1iLnNwbGl0KFwiIFwiKVsxXS5zcGxpdChcIixcIikseS5wdj1bcGFyc2VJbnQoYlswXSwxMCkscGFyc2VJbnQoYlsxXSwxMCkscGFyc2VJbnQoYlsyXSwxMCldKX1lbHNlIGlmKGc8MTApe2crKyxzZXRUaW1lb3V0KGFyZ3VtZW50cy5jYWxsZWUsMTApO3JldHVybn1jLnJlbW92ZUNoaWxkKGQpLGY9bnVsbCxGKCl9KSgpfWVsc2UgRigpfWZ1bmN0aW9uIEYoKXt2YXIgYj1tLmxlbmd0aDtpZihiPjApZm9yKHZhciBjPTA7YzxiO2MrKyl7dmFyIGQ9bVtjXS5pZCxlPW1bY10uY2FsbGJhY2tGbixmPXtzdWNjZXNzOiExLGlkOmR9O2lmKHkucHZbMF0+MCl7dmFyIGc9UChkKTtpZihnKWlmKFMobVtjXS5zd2ZWZXJzaW9uKSYmISh5LndrJiZ5LndrPDMxMikpVShkLCEwKSxlJiYoZi5zdWNjZXNzPSEwLGYucmVmPUcoZCksZShmKSk7ZWxzZSBpZihtW2NdLmV4cHJlc3NJbnN0YWxsJiZIKCkpe3ZhciBoPXt9O2guZGF0YT1tW2NdLmV4cHJlc3NJbnN0YWxsLGgud2lkdGg9Zy5nZXRBdHRyaWJ1dGUoXCJ3aWR0aFwiKXx8XCIwXCIsaC5oZWlnaHQ9Zy5nZXRBdHRyaWJ1dGUoXCJoZWlnaHRcIil8fFwiMFwiLGcuZ2V0QXR0cmlidXRlKFwiY2xhc3NcIikmJihoLnN0eWxlY2xhc3M9Zy5nZXRBdHRyaWJ1dGUoXCJjbGFzc1wiKSksZy5nZXRBdHRyaWJ1dGUoXCJhbGlnblwiKSYmKGguYWxpZ249Zy5nZXRBdHRyaWJ1dGUoXCJhbGlnblwiKSk7dmFyIGk9e30saj1nLmdldEVsZW1lbnRzQnlUYWdOYW1lKFwicGFyYW1cIiksaz1qLmxlbmd0aDtmb3IodmFyIGw9MDtsPGs7bCsrKWpbbF0uZ2V0QXR0cmlidXRlKFwibmFtZVwiKS50b0xvd2VyQ2FzZSgpIT1cIm1vdmllXCImJihpW2pbbF0uZ2V0QXR0cmlidXRlKFwibmFtZVwiKV09altsXS5nZXRBdHRyaWJ1dGUoXCJ2YWx1ZVwiKSk7SShoLGksZCxlKX1lbHNlIEooZyksZSYmZShmKX1lbHNle1UoZCwhMCk7aWYoZSl7dmFyIG49RyhkKTtuJiZ0eXBlb2Ygbi5TZXRWYXJpYWJsZSE9YSYmKGYuc3VjY2Vzcz0hMCxmLnJlZj1uKSxlKGYpfX19fWZ1bmN0aW9uIEcoYyl7dmFyIGQ9bnVsbCxlPVAoYyk7aWYoZSYmZS5ub2RlTmFtZT09XCJPQkpFQ1RcIilpZih0eXBlb2YgZS5TZXRWYXJpYWJsZSE9YSlkPWU7ZWxzZXt2YXIgZj1lLmdldEVsZW1lbnRzQnlUYWdOYW1lKGIpWzBdO2YmJihkPWYpfXJldHVybiBkfWZ1bmN0aW9uIEgoKXtyZXR1cm4hdSYmUyhcIjYuMC42NVwiKSYmKHkud2lufHx5Lm1hYykmJiEoeS53ayYmeS53azwzMTIpfWZ1bmN0aW9uIEkoYixjLGQsZSl7dT0hMCxyPWV8fG51bGwscz17c3VjY2VzczohMSxpZDpkfTt2YXIgZz1QKGQpO2lmKGcpe2cubm9kZU5hbWU9PVwiT0JKRUNUXCI/KHA9SyhnKSxxPW51bGwpOihwPWcscT1kKSxiLmlkPWY7aWYodHlwZW9mIGIud2lkdGg9PWF8fCEvJSQvLnRlc3QoYi53aWR0aCkmJnBhcnNlSW50KGIud2lkdGgsMTApPDMxMCliLndpZHRoPVwiMzEwXCI7aWYodHlwZW9mIGIuaGVpZ2h0PT1hfHwhLyUkLy50ZXN0KGIuaGVpZ2h0KSYmcGFyc2VJbnQoYi5oZWlnaHQsMTApPDEzNyliLmhlaWdodD1cIjEzN1wiO2kudGl0bGU9aS50aXRsZS5zbGljZSgwLDQ3KStcIiAtIEZsYXNoIFBsYXllciBJbnN0YWxsYXRpb25cIjt2YXIgaj15LmllJiZ5Lndpbj9bXCJBY3RpdmVcIl0uY29uY2F0KFwiXCIpLmpvaW4oXCJYXCIpOlwiUGx1Z0luXCIsaz1cIk1NcmVkaXJlY3RVUkw9XCIraC5sb2NhdGlvbi50b1N0cmluZygpLnJlcGxhY2UoLyYvZyxcIiUyNlwiKStcIiZNTXBsYXllclR5cGU9XCIraitcIiZNTWRvY3RpdGxlPVwiK2kudGl0bGU7dHlwZW9mIGMuZmxhc2h2YXJzIT1hP2MuZmxhc2h2YXJzKz1cIiZcIitrOmMuZmxhc2h2YXJzPWs7aWYoeS5pZSYmeS53aW4mJmcucmVhZHlTdGF0ZSE9NCl7dmFyIGw9UShcImRpdlwiKTtkKz1cIlNXRk9iamVjdE5ld1wiLGwuc2V0QXR0cmlidXRlKFwiaWRcIixkKSxnLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGwsZyksZy5zdHlsZS5kaXNwbGF5PVwibm9uZVwiLGZ1bmN0aW9uKCl7Zy5yZWFkeVN0YXRlPT00P2cucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChnKTpzZXRUaW1lb3V0KGFyZ3VtZW50cy5jYWxsZWUsMTApfSgpfUwoYixjLGQpfX1mdW5jdGlvbiBKKGEpe2lmKHkuaWUmJnkud2luJiZhLnJlYWR5U3RhdGUhPTQpe3ZhciBiPVEoXCJkaXZcIik7YS5wYXJlbnROb2RlLmluc2VydEJlZm9yZShiLGEpLGIucGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQoSyhhKSxiKSxhLnN0eWxlLmRpc3BsYXk9XCJub25lXCIsZnVuY3Rpb24oKXthLnJlYWR5U3RhdGU9PTQ/YS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGEpOnNldFRpbWVvdXQoYXJndW1lbnRzLmNhbGxlZSwxMCl9KCl9ZWxzZSBhLnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKEsoYSksYSl9ZnVuY3Rpb24gSyhhKXt2YXIgYz1RKFwiZGl2XCIpO2lmKHkud2luJiZ5LmllKWMuaW5uZXJIVE1MPWEuaW5uZXJIVE1MO2Vsc2V7dmFyIGQ9YS5nZXRFbGVtZW50c0J5VGFnTmFtZShiKVswXTtpZihkKXt2YXIgZT1kLmNoaWxkTm9kZXM7aWYoZSl7dmFyIGY9ZS5sZW5ndGg7Zm9yKHZhciBnPTA7ZzxmO2crKykoZVtnXS5ub2RlVHlwZSE9MXx8ZVtnXS5ub2RlTmFtZSE9XCJQQVJBTVwiKSYmZVtnXS5ub2RlVHlwZSE9OCYmYy5hcHBlbmRDaGlsZChlW2ddLmNsb25lTm9kZSghMCkpfX19cmV0dXJuIGN9ZnVuY3Rpb24gTChjLGQsZil7dmFyIGcsaD1QKGYpO2lmKHkud2smJnkud2s8MzEyKXJldHVybiBnO2lmKGgpe3R5cGVvZiBjLmlkPT1hJiYoYy5pZD1mKTtpZih5LmllJiZ5Lndpbil7dmFyIGk9XCJcIjtmb3IodmFyIGogaW4gYyljW2pdIT1PYmplY3QucHJvdG90eXBlW2pdJiYoai50b0xvd2VyQ2FzZSgpPT1cImRhdGFcIj9kLm1vdmllPWNbal06ai50b0xvd2VyQ2FzZSgpPT1cInN0eWxlY2xhc3NcIj9pKz0nIGNsYXNzPVwiJytjW2pdKydcIic6ai50b0xvd2VyQ2FzZSgpIT1cImNsYXNzaWRcIiYmKGkrPVwiIFwiK2orJz1cIicrY1tqXSsnXCInKSk7dmFyIGs9XCJcIjtmb3IodmFyIGwgaW4gZClkW2xdIT1PYmplY3QucHJvdG90eXBlW2xdJiYoays9JzxwYXJhbSBuYW1lPVwiJytsKydcIiB2YWx1ZT1cIicrZFtsXSsnXCIgLz4nKTtoLm91dGVySFRNTD0nPG9iamVjdCBjbGFzc2lkPVwiY2xzaWQ6RDI3Q0RCNkUtQUU2RC0xMWNmLTk2QjgtNDQ0NTUzNTQwMDAwXCInK2krXCI+XCIraytcIjwvb2JqZWN0PlwiLG5bbi5sZW5ndGhdPWMuaWQsZz1QKGMuaWQpfWVsc2V7dmFyIG09UShiKTttLnNldEF0dHJpYnV0ZShcInR5cGVcIixlKTtmb3IodmFyIG8gaW4gYyljW29dIT1PYmplY3QucHJvdG90eXBlW29dJiYoby50b0xvd2VyQ2FzZSgpPT1cInN0eWxlY2xhc3NcIj9tLnNldEF0dHJpYnV0ZShcImNsYXNzXCIsY1tvXSk6by50b0xvd2VyQ2FzZSgpIT1cImNsYXNzaWRcIiYmbS5zZXRBdHRyaWJ1dGUobyxjW29dKSk7Zm9yKHZhciBwIGluIGQpZFtwXSE9T2JqZWN0LnByb3RvdHlwZVtwXSYmcC50b0xvd2VyQ2FzZSgpIT1cIm1vdmllXCImJk0obSxwLGRbcF0pO2gucGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQobSxoKSxnPW19fXJldHVybiBnfWZ1bmN0aW9uIE0oYSxiLGMpe3ZhciBkPVEoXCJwYXJhbVwiKTtkLnNldEF0dHJpYnV0ZShcIm5hbWVcIixiKSxkLnNldEF0dHJpYnV0ZShcInZhbHVlXCIsYyksYS5hcHBlbmRDaGlsZChkKX1mdW5jdGlvbiBOKGEpe3ZhciBiPVAoYSk7YiYmYi5ub2RlTmFtZT09XCJPQkpFQ1RcIiYmKHkuaWUmJnkud2luPyhiLnN0eWxlLmRpc3BsYXk9XCJub25lXCIsZnVuY3Rpb24oKXtiLnJlYWR5U3RhdGU9PTQ/TyhhKTpzZXRUaW1lb3V0KGFyZ3VtZW50cy5jYWxsZWUsMTApfSgpKTpiLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoYikpfWZ1bmN0aW9uIE8oYSl7dmFyIGI9UChhKTtpZihiKXtmb3IodmFyIGMgaW4gYil0eXBlb2YgYltjXT09XCJmdW5jdGlvblwiJiYoYltjXT1udWxsKTtiLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoYil9fWZ1bmN0aW9uIFAoYSl7dmFyIGI9bnVsbDt0cnl7Yj1pLmdldEVsZW1lbnRCeUlkKGEpfWNhdGNoKGMpe31yZXR1cm4gYn1mdW5jdGlvbiBRKGEpe3JldHVybiBpLmNyZWF0ZUVsZW1lbnQoYSl9ZnVuY3Rpb24gUihhLGIsYyl7YS5hdHRhY2hFdmVudChiLGMpLG9bby5sZW5ndGhdPVthLGIsY119ZnVuY3Rpb24gUyhhKXt2YXIgYj15LnB2LGM9YS5zcGxpdChcIi5cIik7cmV0dXJuIGNbMF09cGFyc2VJbnQoY1swXSwxMCksY1sxXT1wYXJzZUludChjWzFdLDEwKXx8MCxjWzJdPXBhcnNlSW50KGNbMl0sMTApfHwwLGJbMF0+Y1swXXx8YlswXT09Y1swXSYmYlsxXT5jWzFdfHxiWzBdPT1jWzBdJiZiWzFdPT1jWzFdJiZiWzJdPj1jWzJdPyEwOiExfWZ1bmN0aW9uIFQoYyxkLGUsZil7aWYoeS5pZSYmeS5tYWMpcmV0dXJuO3ZhciBnPWkuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJoZWFkXCIpWzBdO2lmKCFnKXJldHVybjt2YXIgaD1lJiZ0eXBlb2YgZT09XCJzdHJpbmdcIj9lOlwic2NyZWVuXCI7ZiYmKHY9bnVsbCx3PW51bGwpO2lmKCF2fHx3IT1oKXt2YXIgaj1RKFwic3R5bGVcIik7ai5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsXCJ0ZXh0L2Nzc1wiKSxqLnNldEF0dHJpYnV0ZShcIm1lZGlhXCIsaCksdj1nLmFwcGVuZENoaWxkKGopLHkuaWUmJnkud2luJiZ0eXBlb2YgaS5zdHlsZVNoZWV0cyE9YSYmaS5zdHlsZVNoZWV0cy5sZW5ndGg+MCYmKHY9aS5zdHlsZVNoZWV0c1tpLnN0eWxlU2hlZXRzLmxlbmd0aC0xXSksdz1ofXkuaWUmJnkud2luP3YmJnR5cGVvZiB2LmFkZFJ1bGU9PWImJnYuYWRkUnVsZShjLGQpOnYmJnR5cGVvZiBpLmNyZWF0ZVRleHROb2RlIT1hJiZ2LmFwcGVuZENoaWxkKGkuY3JlYXRlVGV4dE5vZGUoYytcIiB7XCIrZCtcIn1cIikpfWZ1bmN0aW9uIFUoYSxiKXtpZigheClyZXR1cm47dmFyIGM9Yj9cInZpc2libGVcIjpcImhpZGRlblwiO3QmJlAoYSk/UChhKS5zdHlsZS52aXNpYmlsaXR5PWM6VChcIiNcIithLFwidmlzaWJpbGl0eTpcIitjKX1mdW5jdGlvbiBWKGIpe3ZhciBjPS9bXFxcXFxcXCI8PlxcLjtdLyxkPWMuZXhlYyhiKSE9bnVsbDtyZXR1cm4gZCYmdHlwZW9mIGVuY29kZVVSSUNvbXBvbmVudCE9YT9lbmNvZGVVUklDb21wb25lbnQoYik6Yn12YXIgYT1cInVuZGVmaW5lZFwiLGI9XCJvYmplY3RcIixjPVwiU2hvY2t3YXZlIEZsYXNoXCIsZD1cIlNob2Nrd2F2ZUZsYXNoLlNob2Nrd2F2ZUZsYXNoXCIsZT1cImFwcGxpY2F0aW9uL3gtc2hvY2t3YXZlLWZsYXNoXCIsZj1cIlNXRk9iamVjdEV4cHJJbnN0XCIsZz1cIm9ucmVhZHlzdGF0ZWNoYW5nZVwiLGg9d2luZG93LGk9ZG9jdW1lbnQsaj1uYXZpZ2F0b3Isaz0hMSxsPVtEXSxtPVtdLG49W10sbz1bXSxwLHEscixzLHQ9ITEsdT0hMSx2LHcseD0hMCx5PWZ1bmN0aW9uKCl7dmFyIGY9dHlwZW9mIGkuZ2V0RWxlbWVudEJ5SWQhPWEmJnR5cGVvZiBpLmdldEVsZW1lbnRzQnlUYWdOYW1lIT1hJiZ0eXBlb2YgaS5jcmVhdGVFbGVtZW50IT1hLGc9ai51c2VyQWdlbnQudG9Mb3dlckNhc2UoKSxsPWoucGxhdGZvcm0udG9Mb3dlckNhc2UoKSxtPWw/L3dpbi8udGVzdChsKTovd2luLy50ZXN0KGcpLG49bD8vbWFjLy50ZXN0KGwpOi9tYWMvLnRlc3QoZyksbz0vd2Via2l0Ly50ZXN0KGcpP3BhcnNlRmxvYXQoZy5yZXBsYWNlKC9eLip3ZWJraXRcXC8oXFxkKyhcXC5cXGQrKT8pLiokLyxcIiQxXCIpKTohMSxwPSExLHE9WzAsMCwwXSxyPW51bGw7aWYodHlwZW9mIGoucGx1Z2lucyE9YSYmdHlwZW9mIGoucGx1Z2luc1tjXT09YilyPWoucGx1Z2luc1tjXS5kZXNjcmlwdGlvbixyJiYodHlwZW9mIGoubWltZVR5cGVzPT1hfHwhai5taW1lVHlwZXNbZV18fCEhai5taW1lVHlwZXNbZV0uZW5hYmxlZFBsdWdpbikmJihrPSEwLHA9ITEscj1yLnJlcGxhY2UoL14uKlxccysoXFxTK1xccytcXFMrJCkvLFwiJDFcIikscVswXT1wYXJzZUludChyLnJlcGxhY2UoL14oLiopXFwuLiokLyxcIiQxXCIpLDEwKSxxWzFdPXBhcnNlSW50KHIucmVwbGFjZSgvXi4qXFwuKC4qKVxccy4qJC8sXCIkMVwiKSwxMCkscVsyXT0vW2EtekEtWl0vLnRlc3Qocik/cGFyc2VJbnQoci5yZXBsYWNlKC9eLipbYS16QS1aXSsoLiopJC8sXCIkMVwiKSwxMCk6MCk7ZWxzZSBpZih0eXBlb2YgaFtbXCJBY3RpdmVcIl0uY29uY2F0KFwiT2JqZWN0XCIpLmpvaW4oXCJYXCIpXSE9YSl0cnl7dmFyIHM9bmV3KHdpbmRvd1tbXCJBY3RpdmVcIl0uY29uY2F0KFwiT2JqZWN0XCIpLmpvaW4oXCJYXCIpXSkoZCk7cyYmKHI9cy5HZXRWYXJpYWJsZShcIiR2ZXJzaW9uXCIpLHImJihwPSEwLHI9ci5zcGxpdChcIiBcIilbMV0uc3BsaXQoXCIsXCIpLHE9W3BhcnNlSW50KHJbMF0sMTApLHBhcnNlSW50KHJbMV0sMTApLHBhcnNlSW50KHJbMl0sMTApXSkpfWNhdGNoKHQpe31yZXR1cm57dzM6ZixwdjpxLHdrOm8saWU6cCx3aW46bSxtYWM6bn19KCksej1mdW5jdGlvbigpe2lmKCF5LnczKXJldHVybjsodHlwZW9mIGkucmVhZHlTdGF0ZSE9YSYmaS5yZWFkeVN0YXRlPT1cImNvbXBsZXRlXCJ8fHR5cGVvZiBpLnJlYWR5U3RhdGU9PWEmJihpLmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiYm9keVwiKVswXXx8aS5ib2R5KSkmJkEoKSx0fHwodHlwZW9mIGkuYWRkRXZlbnRMaXN0ZW5lciE9YSYmaS5hZGRFdmVudExpc3RlbmVyKFwiRE9NQ29udGVudExvYWRlZFwiLEEsITEpLHkuaWUmJnkud2luJiYoaS5hdHRhY2hFdmVudChnLGZ1bmN0aW9uKCl7aS5yZWFkeVN0YXRlPT1cImNvbXBsZXRlXCImJihpLmRldGFjaEV2ZW50KGcsYXJndW1lbnRzLmNhbGxlZSksQSgpKX0pLGg9PXRvcCYmZnVuY3Rpb24oKXtpZih0KXJldHVybjt0cnl7aS5kb2N1bWVudEVsZW1lbnQuZG9TY3JvbGwoXCJsZWZ0XCIpfWNhdGNoKGEpe3NldFRpbWVvdXQoYXJndW1lbnRzLmNhbGxlZSwwKTtyZXR1cm59QSgpfSgpKSx5LndrJiZmdW5jdGlvbigpe2lmKHQpcmV0dXJuO2lmKCEvbG9hZGVkfGNvbXBsZXRlLy50ZXN0KGkucmVhZHlTdGF0ZSkpe3NldFRpbWVvdXQoYXJndW1lbnRzLmNhbGxlZSwwKTtyZXR1cm59QSgpfSgpLEMoQSkpfSgpLFc9ZnVuY3Rpb24oKXt5LmllJiZ5LndpbiYmd2luZG93LmF0dGFjaEV2ZW50KFwib251bmxvYWRcIixmdW5jdGlvbigpe3ZhciBhPW8ubGVuZ3RoO2Zvcih2YXIgYj0wO2I8YTtiKyspb1tiXVswXS5kZXRhY2hFdmVudChvW2JdWzFdLG9bYl1bMl0pO3ZhciBjPW4ubGVuZ3RoO2Zvcih2YXIgZD0wO2Q8YztkKyspTihuW2RdKTtmb3IodmFyIGUgaW4geSl5W2VdPW51bGw7eT1udWxsO2Zvcih2YXIgZiBpbiBzd2ZvYmplY3Qpc3dmb2JqZWN0W2ZdPW51bGw7c3dmb2JqZWN0PW51bGx9KX0oKTtyZXR1cm57cmVnaXN0ZXJPYmplY3Q6ZnVuY3Rpb24oYSxiLGMsZCl7aWYoeS53MyYmYSYmYil7dmFyIGU9e307ZS5pZD1hLGUuc3dmVmVyc2lvbj1iLGUuZXhwcmVzc0luc3RhbGw9YyxlLmNhbGxiYWNrRm49ZCxtW20ubGVuZ3RoXT1lLFUoYSwhMSl9ZWxzZSBkJiZkKHtzdWNjZXNzOiExLGlkOmF9KX0sZ2V0T2JqZWN0QnlJZDpmdW5jdGlvbihhKXtpZih5LnczKXJldHVybiBHKGEpfSxlbWJlZFNXRjpmdW5jdGlvbihjLGQsZSxmLGcsaCxpLGosayxsKXt2YXIgbT17c3VjY2VzczohMSxpZDpkfTt5LnczJiYhKHkud2smJnkud2s8MzEyKSYmYyYmZCYmZSYmZiYmZz8oVShkLCExKSxCKGZ1bmN0aW9uKCl7ZSs9XCJcIixmKz1cIlwiO3ZhciBuPXt9O2lmKGsmJnR5cGVvZiBrPT09Yilmb3IodmFyIG8gaW4gayluW29dPWtbb107bi5kYXRhPWMsbi53aWR0aD1lLG4uaGVpZ2h0PWY7dmFyIHA9e307aWYoaiYmdHlwZW9mIGo9PT1iKWZvcih2YXIgcSBpbiBqKXBbcV09altxXTtpZihpJiZ0eXBlb2YgaT09PWIpZm9yKHZhciByIGluIGkpdHlwZW9mIHAuZmxhc2h2YXJzIT1hP3AuZmxhc2h2YXJzKz1cIiZcIityK1wiPVwiK2lbcl06cC5mbGFzaHZhcnM9citcIj1cIitpW3JdO2lmKFMoZykpe3ZhciBzPUwobixwLGQpO24uaWQ9PWQmJlUoZCwhMCksbS5zdWNjZXNzPSEwLG0ucmVmPXN9ZWxzZXtpZihoJiZIKCkpe24uZGF0YT1oLEkobixwLGQsbCk7cmV0dXJufVUoZCwhMCl9bCYmbChtKX0pKTpsJiZsKG0pfSxzd2l0Y2hPZmZBdXRvSGlkZVNob3c6ZnVuY3Rpb24oKXt4PSExfSx1YTp5LGdldEZsYXNoUGxheWVyVmVyc2lvbjpmdW5jdGlvbigpe3JldHVybnttYWpvcjp5LnB2WzBdLG1pbm9yOnkucHZbMV0scmVsZWFzZTp5LnB2WzJdfX0saGFzRmxhc2hQbGF5ZXJWZXJzaW9uOlMsY3JlYXRlU1dGOmZ1bmN0aW9uKGEsYixjKXtyZXR1cm4geS53Mz9MKGEsYixjKTp1bmRlZmluZWR9LHNob3dFeHByZXNzSW5zdGFsbDpmdW5jdGlvbihhLGIsYyxkKXt5LnczJiZIKCkmJkkoYSxiLGMsZCl9LHJlbW92ZVNXRjpmdW5jdGlvbihhKXt5LnczJiZOKGEpfSxjcmVhdGVDU1M6ZnVuY3Rpb24oYSxiLGMsZCl7eS53MyYmVChhLGIsYyxkKX0sYWRkRG9tTG9hZEV2ZW50OkIsYWRkTG9hZEV2ZW50OkMsZ2V0UXVlcnlQYXJhbVZhbHVlOmZ1bmN0aW9uKGEpe3ZhciBiPWkubG9jYXRpb24uc2VhcmNofHxpLmxvY2F0aW9uLmhhc2g7aWYoYil7L1xcPy8udGVzdChiKSYmKGI9Yi5zcGxpdChcIj9cIilbMV0pO2lmKGE9PW51bGwpcmV0dXJuIFYoYik7dmFyIGM9Yi5zcGxpdChcIiZcIik7Zm9yKHZhciBkPTA7ZDxjLmxlbmd0aDtkKyspaWYoY1tkXS5zdWJzdHJpbmcoMCxjW2RdLmluZGV4T2YoXCI9XCIpKT09YSlyZXR1cm4gVihjW2RdLnN1YnN0cmluZyhjW2RdLmluZGV4T2YoXCI9XCIpKzEpKX1yZXR1cm5cIlwifSxleHByZXNzSW5zdGFsbENhbGxiYWNrOmZ1bmN0aW9uKCl7aWYodSl7dmFyIGE9UChmKTthJiZwJiYoYS5wYXJlbnROb2RlLnJlcGxhY2VDaGlsZChwLGEpLHEmJihVKHEsITApLHkuaWUmJnkud2luJiYocC5zdHlsZS5kaXNwbGF5PVwiYmxvY2tcIikpLHImJnIocykpLHU9ITF9fX19KCk7KGZ1bmN0aW9uKCl7aWYoXCJ1bmRlZmluZWRcIj09dHlwZW9mIHdpbmRvd3x8d2luZG93LldlYlNvY2tldClyZXR1cm47dmFyIGE9d2luZG93LmNvbnNvbGU7aWYoIWF8fCFhLmxvZ3x8IWEuZXJyb3IpYT17bG9nOmZ1bmN0aW9uKCl7fSxlcnJvcjpmdW5jdGlvbigpe319O2lmKCFzd2ZvYmplY3QuaGFzRmxhc2hQbGF5ZXJWZXJzaW9uKFwiMTAuMC4wXCIpKXthLmVycm9yKFwiRmxhc2ggUGxheWVyID49IDEwLjAuMCBpcyByZXF1aXJlZC5cIik7cmV0dXJufWxvY2F0aW9uLnByb3RvY29sPT1cImZpbGU6XCImJmEuZXJyb3IoXCJXQVJOSU5HOiB3ZWItc29ja2V0LWpzIGRvZXNuJ3Qgd29yayBpbiBmaWxlOi8vLy4uLiBVUkwgdW5sZXNzIHlvdSBzZXQgRmxhc2ggU2VjdXJpdHkgU2V0dGluZ3MgcHJvcGVybHkuIE9wZW4gdGhlIHBhZ2UgdmlhIFdlYiBzZXJ2ZXIgaS5lLiBodHRwOi8vLi4uXCIpLFdlYlNvY2tldD1mdW5jdGlvbihhLGIsYyxkLGUpe3ZhciBmPXRoaXM7Zi5fX2lkPVdlYlNvY2tldC5fX25leHRJZCsrLFdlYlNvY2tldC5fX2luc3RhbmNlc1tmLl9faWRdPWYsZi5yZWFkeVN0YXRlPVdlYlNvY2tldC5DT05ORUNUSU5HLGYuYnVmZmVyZWRBbW91bnQ9MCxmLl9fZXZlbnRzPXt9LGI/dHlwZW9mIGI9PVwic3RyaW5nXCImJihiPVtiXSk6Yj1bXSxzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7V2ViU29ja2V0Ll9fYWRkVGFzayhmdW5jdGlvbigpe1dlYlNvY2tldC5fX2ZsYXNoLmNyZWF0ZShmLl9faWQsYSxiLGN8fG51bGwsZHx8MCxlfHxudWxsKX0pfSwwKX0sV2ViU29ja2V0LnByb3RvdHlwZS5zZW5kPWZ1bmN0aW9uKGEpe2lmKHRoaXMucmVhZHlTdGF0ZT09V2ViU29ja2V0LkNPTk5FQ1RJTkcpdGhyb3dcIklOVkFMSURfU1RBVEVfRVJSOiBXZWIgU29ja2V0IGNvbm5lY3Rpb24gaGFzIG5vdCBiZWVuIGVzdGFibGlzaGVkXCI7dmFyIGI9V2ViU29ja2V0Ll9fZmxhc2guc2VuZCh0aGlzLl9faWQsZW5jb2RlVVJJQ29tcG9uZW50KGEpKTtyZXR1cm4gYjwwPyEwOih0aGlzLmJ1ZmZlcmVkQW1vdW50Kz1iLCExKX0sV2ViU29ja2V0LnByb3RvdHlwZS5jbG9zZT1mdW5jdGlvbigpe2lmKHRoaXMucmVhZHlTdGF0ZT09V2ViU29ja2V0LkNMT1NFRHx8dGhpcy5yZWFkeVN0YXRlPT1XZWJTb2NrZXQuQ0xPU0lORylyZXR1cm47dGhpcy5yZWFkeVN0YXRlPVdlYlNvY2tldC5DTE9TSU5HLFdlYlNvY2tldC5fX2ZsYXNoLmNsb3NlKHRoaXMuX19pZCl9LFdlYlNvY2tldC5wcm90b3R5cGUuYWRkRXZlbnRMaXN0ZW5lcj1mdW5jdGlvbihhLGIsYyl7YSBpbiB0aGlzLl9fZXZlbnRzfHwodGhpcy5fX2V2ZW50c1thXT1bXSksdGhpcy5fX2V2ZW50c1thXS5wdXNoKGIpfSxXZWJTb2NrZXQucHJvdG90eXBlLnJlbW92ZUV2ZW50TGlzdGVuZXI9ZnVuY3Rpb24oYSxiLGMpe2lmKCEoYSBpbiB0aGlzLl9fZXZlbnRzKSlyZXR1cm47dmFyIGQ9dGhpcy5fX2V2ZW50c1thXTtmb3IodmFyIGU9ZC5sZW5ndGgtMTtlPj0wOy0tZSlpZihkW2VdPT09Yil7ZC5zcGxpY2UoZSwxKTticmVha319LFdlYlNvY2tldC5wcm90b3R5cGUuZGlzcGF0Y2hFdmVudD1mdW5jdGlvbihhKXt2YXIgYj10aGlzLl9fZXZlbnRzW2EudHlwZV18fFtdO2Zvcih2YXIgYz0wO2M8Yi5sZW5ndGg7KytjKWJbY10oYSk7dmFyIGQ9dGhpc1tcIm9uXCIrYS50eXBlXTtkJiZkKGEpfSxXZWJTb2NrZXQucHJvdG90eXBlLl9faGFuZGxlRXZlbnQ9ZnVuY3Rpb24oYSl7XCJyZWFkeVN0YXRlXCJpbiBhJiYodGhpcy5yZWFkeVN0YXRlPWEucmVhZHlTdGF0ZSksXCJwcm90b2NvbFwiaW4gYSYmKHRoaXMucHJvdG9jb2w9YS5wcm90b2NvbCk7dmFyIGI7aWYoYS50eXBlPT1cIm9wZW5cInx8YS50eXBlPT1cImVycm9yXCIpYj10aGlzLl9fY3JlYXRlU2ltcGxlRXZlbnQoYS50eXBlKTtlbHNlIGlmKGEudHlwZT09XCJjbG9zZVwiKWI9dGhpcy5fX2NyZWF0ZVNpbXBsZUV2ZW50KFwiY2xvc2VcIik7ZWxzZXtpZihhLnR5cGUhPVwibWVzc2FnZVwiKXRocm93XCJ1bmtub3duIGV2ZW50IHR5cGU6IFwiK2EudHlwZTt2YXIgYz1kZWNvZGVVUklDb21wb25lbnQoYS5tZXNzYWdlKTtiPXRoaXMuX19jcmVhdGVNZXNzYWdlRXZlbnQoXCJtZXNzYWdlXCIsYyl9dGhpcy5kaXNwYXRjaEV2ZW50KGIpfSxXZWJTb2NrZXQucHJvdG90eXBlLl9fY3JlYXRlU2ltcGxlRXZlbnQ9ZnVuY3Rpb24oYSl7aWYoZG9jdW1lbnQuY3JlYXRlRXZlbnQmJndpbmRvdy5FdmVudCl7dmFyIGI9ZG9jdW1lbnQuY3JlYXRlRXZlbnQoXCJFdmVudFwiKTtyZXR1cm4gYi5pbml0RXZlbnQoYSwhMSwhMSksYn1yZXR1cm57dHlwZTphLGJ1YmJsZXM6ITEsY2FuY2VsYWJsZTohMX19LFdlYlNvY2tldC5wcm90b3R5cGUuX19jcmVhdGVNZXNzYWdlRXZlbnQ9ZnVuY3Rpb24oYSxiKXtpZihkb2N1bWVudC5jcmVhdGVFdmVudCYmd2luZG93Lk1lc3NhZ2VFdmVudCYmIXdpbmRvdy5vcGVyYSl7dmFyIGM9ZG9jdW1lbnQuY3JlYXRlRXZlbnQoXCJNZXNzYWdlRXZlbnRcIik7cmV0dXJuIGMuaW5pdE1lc3NhZ2VFdmVudChcIm1lc3NhZ2VcIiwhMSwhMSxiLG51bGwsbnVsbCx3aW5kb3csbnVsbCksY31yZXR1cm57dHlwZTphLGRhdGE6YixidWJibGVzOiExLGNhbmNlbGFibGU6ITF9fSxXZWJTb2NrZXQuQ09OTkVDVElORz0wLFdlYlNvY2tldC5PUEVOPTEsV2ViU29ja2V0LkNMT1NJTkc9MixXZWJTb2NrZXQuQ0xPU0VEPTMsV2ViU29ja2V0Ll9fZmxhc2g9bnVsbCxXZWJTb2NrZXQuX19pbnN0YW5jZXM9e30sV2ViU29ja2V0Ll9fdGFza3M9W10sV2ViU29ja2V0Ll9fbmV4dElkPTAsV2ViU29ja2V0LmxvYWRGbGFzaFBvbGljeUZpbGU9ZnVuY3Rpb24oYSl7V2ViU29ja2V0Ll9fYWRkVGFzayhmdW5jdGlvbigpe1dlYlNvY2tldC5fX2ZsYXNoLmxvYWRNYW51YWxQb2xpY3lGaWxlKGEpfSl9LFdlYlNvY2tldC5fX2luaXRpYWxpemU9ZnVuY3Rpb24oKXtpZihXZWJTb2NrZXQuX19mbGFzaClyZXR1cm47V2ViU29ja2V0Ll9fc3dmTG9jYXRpb24mJih3aW5kb3cuV0VCX1NPQ0tFVF9TV0ZfTE9DQVRJT049V2ViU29ja2V0Ll9fc3dmTG9jYXRpb24pO2lmKCF3aW5kb3cuV0VCX1NPQ0tFVF9TV0ZfTE9DQVRJT04pe2EuZXJyb3IoXCJbV2ViU29ja2V0XSBzZXQgV0VCX1NPQ0tFVF9TV0ZfTE9DQVRJT04gdG8gbG9jYXRpb24gb2YgV2ViU29ja2V0TWFpbi5zd2ZcIik7cmV0dXJufXZhciBiPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7Yi5pZD1cIndlYlNvY2tldENvbnRhaW5lclwiLGIuc3R5bGUucG9zaXRpb249XCJhYnNvbHV0ZVwiLFdlYlNvY2tldC5fX2lzRmxhc2hMaXRlKCk/KGIuc3R5bGUubGVmdD1cIjBweFwiLGIuc3R5bGUudG9wPVwiMHB4XCIpOihiLnN0eWxlLmxlZnQ9XCItMTAwcHhcIixiLnN0eWxlLnRvcD1cIi0xMDBweFwiKTt2YXIgYz1kb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO2MuaWQ9XCJ3ZWJTb2NrZXRGbGFzaFwiLGIuYXBwZW5kQ2hpbGQoYyksZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChiKSxzd2ZvYmplY3QuZW1iZWRTV0YoV0VCX1NPQ0tFVF9TV0ZfTE9DQVRJT04sXCJ3ZWJTb2NrZXRGbGFzaFwiLFwiMVwiLFwiMVwiLFwiMTAuMC4wXCIsbnVsbCxudWxsLHtoYXNQcmlvcml0eTohMCxzd2xpdmVjb25uZWN0OiEwLGFsbG93U2NyaXB0QWNjZXNzOlwiYWx3YXlzXCJ9LG51bGwsZnVuY3Rpb24oYil7Yi5zdWNjZXNzfHxhLmVycm9yKFwiW1dlYlNvY2tldF0gc3dmb2JqZWN0LmVtYmVkU1dGIGZhaWxlZFwiKX0pfSxXZWJTb2NrZXQuX19vbkZsYXNoSW5pdGlhbGl6ZWQ9ZnVuY3Rpb24oKXtzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7V2ViU29ja2V0Ll9fZmxhc2g9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ3ZWJTb2NrZXRGbGFzaFwiKSxXZWJTb2NrZXQuX19mbGFzaC5zZXRDYWxsZXJVcmwobG9jYXRpb24uaHJlZiksV2ViU29ja2V0Ll9fZmxhc2guc2V0RGVidWcoISF3aW5kb3cuV0VCX1NPQ0tFVF9ERUJVRyk7Zm9yKHZhciBhPTA7YTxXZWJTb2NrZXQuX190YXNrcy5sZW5ndGg7KythKVdlYlNvY2tldC5fX3Rhc2tzW2FdKCk7V2ViU29ja2V0Ll9fdGFza3M9W119LDApfSxXZWJTb2NrZXQuX19vbkZsYXNoRXZlbnQ9ZnVuY3Rpb24oKXtyZXR1cm4gc2V0VGltZW91dChmdW5jdGlvbigpe3RyeXt2YXIgYj1XZWJTb2NrZXQuX19mbGFzaC5yZWNlaXZlRXZlbnRzKCk7Zm9yKHZhciBjPTA7YzxiLmxlbmd0aDsrK2MpV2ViU29ja2V0Ll9faW5zdGFuY2VzW2JbY10ud2ViU29ja2V0SWRdLl9faGFuZGxlRXZlbnQoYltjXSl9Y2F0Y2goZCl7YS5lcnJvcihkKX19LDApLCEwfSxXZWJTb2NrZXQuX19sb2c9ZnVuY3Rpb24oYil7YS5sb2coZGVjb2RlVVJJQ29tcG9uZW50KGIpKX0sV2ViU29ja2V0Ll9fZXJyb3I9ZnVuY3Rpb24oYil7YS5lcnJvcihkZWNvZGVVUklDb21wb25lbnQoYikpfSxXZWJTb2NrZXQuX19hZGRUYXNrPWZ1bmN0aW9uKGEpe1dlYlNvY2tldC5fX2ZsYXNoP2EoKTpXZWJTb2NrZXQuX190YXNrcy5wdXNoKGEpfSxXZWJTb2NrZXQuX19pc0ZsYXNoTGl0ZT1mdW5jdGlvbigpe2lmKCF3aW5kb3cubmF2aWdhdG9yfHwhd2luZG93Lm5hdmlnYXRvci5taW1lVHlwZXMpcmV0dXJuITE7dmFyIGE9d2luZG93Lm5hdmlnYXRvci5taW1lVHlwZXNbXCJhcHBsaWNhdGlvbi94LXNob2Nrd2F2ZS1mbGFzaFwiXTtyZXR1cm4hYXx8IWEuZW5hYmxlZFBsdWdpbnx8IWEuZW5hYmxlZFBsdWdpbi5maWxlbmFtZT8hMTphLmVuYWJsZWRQbHVnaW4uZmlsZW5hbWUubWF0Y2goL2ZsYXNobGl0ZS9pKT8hMDohMX0sd2luZG93LldFQl9TT0NLRVRfRElTQUJMRV9BVVRPX0lOSVRJQUxJWkFUSU9OfHwod2luZG93LmFkZEV2ZW50TGlzdGVuZXI/d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJsb2FkXCIsZnVuY3Rpb24oKXtXZWJTb2NrZXQuX19pbml0aWFsaXplKCl9LCExKTp3aW5kb3cuYXR0YWNoRXZlbnQoXCJvbmxvYWRcIixmdW5jdGlvbigpe1dlYlNvY2tldC5fX2luaXRpYWxpemUoKX0pKX0pKCksZnVuY3Rpb24oYSxiLGMpe2Z1bmN0aW9uIGQoYSl7aWYoIWEpcmV0dXJuO2IuVHJhbnNwb3J0LmFwcGx5KHRoaXMsYXJndW1lbnRzKSx0aGlzLnNlbmRCdWZmZXI9W119ZnVuY3Rpb24gZSgpe31hLlhIUj1kLGIudXRpbC5pbmhlcml0KGQsYi5UcmFuc3BvcnQpLGQucHJvdG90eXBlLm9wZW49ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5zb2NrZXQuc2V0QnVmZmVyKCExKSx0aGlzLm9uT3BlbigpLHRoaXMuZ2V0KCksdGhpcy5zZXRDbG9zZVRpbWVvdXQoKSx0aGlzfSxkLnByb3RvdHlwZS5wYXlsb2FkPWZ1bmN0aW9uKGEpe3ZhciBjPVtdO2Zvcih2YXIgZD0wLGU9YS5sZW5ndGg7ZDxlO2QrKyljLnB1c2goYi5wYXJzZXIuZW5jb2RlUGFja2V0KGFbZF0pKTt0aGlzLnNlbmQoYi5wYXJzZXIuZW5jb2RlUGF5bG9hZChjKSl9LGQucHJvdG90eXBlLnNlbmQ9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMucG9zdChhKSx0aGlzfSxkLnByb3RvdHlwZS5wb3N0PWZ1bmN0aW9uKGEpe2Z1bmN0aW9uIGQoKXt0aGlzLnJlYWR5U3RhdGU9PTQmJih0aGlzLm9ucmVhZHlzdGF0ZWNoYW5nZT1lLGIucG9zdGluZz0hMSx0aGlzLnN0YXR1cz09MjAwP2Iuc29ja2V0LnNldEJ1ZmZlcighMSk6Yi5vbkNsb3NlKCkpfWZ1bmN0aW9uIGYoKXt0aGlzLm9ubG9hZD1lLGIuc29ja2V0LnNldEJ1ZmZlcighMSl9dmFyIGI9dGhpczt0aGlzLnNvY2tldC5zZXRCdWZmZXIoITApLHRoaXMuc2VuZFhIUj10aGlzLnJlcXVlc3QoXCJQT1NUXCIpLGMuWERvbWFpblJlcXVlc3QmJnRoaXMuc2VuZFhIUiBpbnN0YW5jZW9mIFhEb21haW5SZXF1ZXN0P3RoaXMuc2VuZFhIUi5vbmxvYWQ9dGhpcy5zZW5kWEhSLm9uZXJyb3I9Zjp0aGlzLnNlbmRYSFIub25yZWFkeXN0YXRlY2hhbmdlPWQsdGhpcy5zZW5kWEhSLnNlbmQoYSl9LGQucHJvdG90eXBlLmNsb3NlPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMub25DbG9zZSgpLHRoaXN9LGQucHJvdG90eXBlLnJlcXVlc3Q9ZnVuY3Rpb24oYSl7dmFyIGM9Yi51dGlsLnJlcXVlc3QodGhpcy5zb2NrZXQuaXNYRG9tYWluKCkpLGQ9Yi51dGlsLnF1ZXJ5KHRoaXMuc29ja2V0Lm9wdGlvbnMucXVlcnksXCJ0PVwiKyArKG5ldyBEYXRlKSk7Yy5vcGVuKGF8fFwiR0VUXCIsdGhpcy5wcmVwYXJlVXJsKCkrZCwhMCk7aWYoYT09XCJQT1NUXCIpdHJ5e2Muc2V0UmVxdWVzdEhlYWRlcj9jLnNldFJlcXVlc3RIZWFkZXIoXCJDb250ZW50LXR5cGVcIixcInRleHQvcGxhaW47Y2hhcnNldD1VVEYtOFwiKTpjLmNvbnRlbnRUeXBlPVwidGV4dC9wbGFpblwifWNhdGNoKGUpe31yZXR1cm4gY30sZC5wcm90b3R5cGUuc2NoZW1lPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuc29ja2V0Lm9wdGlvbnMuc2VjdXJlP1wiaHR0cHNcIjpcImh0dHBcIn0sZC5jaGVjaz1mdW5jdGlvbihhLGQpe3RyeXt2YXIgZT1iLnV0aWwucmVxdWVzdChkKSxmPWMuWERvbWFpblJlcXVlc3QmJmUgaW5zdGFuY2VvZiBYRG9tYWluUmVxdWVzdCxnPWEmJmEub3B0aW9ucyYmYS5vcHRpb25zLnNlY3VyZT9cImh0dHBzOlwiOlwiaHR0cDpcIixoPWMubG9jYXRpb24mJmchPWMubG9jYXRpb24ucHJvdG9jb2w7aWYoZSYmKCFmfHwhaCkpcmV0dXJuITB9Y2F0Y2goaSl7fXJldHVybiExfSxkLnhkb21haW5DaGVjaz1mdW5jdGlvbihhKXtyZXR1cm4gZC5jaGVjayhhLCEwKX19KFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pby5UcmFuc3BvcnQ6bW9kdWxlLmV4cG9ydHMsXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvOm1vZHVsZS5wYXJlbnQuZXhwb3J0cyx0aGlzKSxmdW5jdGlvbihhLGIpe2Z1bmN0aW9uIGMoYSl7Yi5UcmFuc3BvcnQuWEhSLmFwcGx5KHRoaXMsYXJndW1lbnRzKX1hLmh0bWxmaWxlPWMsYi51dGlsLmluaGVyaXQoYyxiLlRyYW5zcG9ydC5YSFIpLGMucHJvdG90eXBlLm5hbWU9XCJodG1sZmlsZVwiLGMucHJvdG90eXBlLmdldD1mdW5jdGlvbigpe3RoaXMuZG9jPW5ldyh3aW5kb3dbW1wiQWN0aXZlXCJdLmNvbmNhdChcIk9iamVjdFwiKS5qb2luKFwiWFwiKV0pKFwiaHRtbGZpbGVcIiksdGhpcy5kb2Mub3BlbigpLHRoaXMuZG9jLndyaXRlKFwiPGh0bWw+PC9odG1sPlwiKSx0aGlzLmRvYy5jbG9zZSgpLHRoaXMuZG9jLnBhcmVudFdpbmRvdy5zPXRoaXM7dmFyIGE9dGhpcy5kb2MuY3JlYXRlRWxlbWVudChcImRpdlwiKTthLmNsYXNzTmFtZT1cInNvY2tldGlvXCIsdGhpcy5kb2MuYm9keS5hcHBlbmRDaGlsZChhKSx0aGlzLmlmcmFtZT10aGlzLmRvYy5jcmVhdGVFbGVtZW50KFwiaWZyYW1lXCIpLGEuYXBwZW5kQ2hpbGQodGhpcy5pZnJhbWUpO3ZhciBjPXRoaXMsZD1iLnV0aWwucXVlcnkodGhpcy5zb2NrZXQub3B0aW9ucy5xdWVyeSxcInQ9XCIrICsobmV3IERhdGUpKTt0aGlzLmlmcmFtZS5zcmM9dGhpcy5wcmVwYXJlVXJsKCkrZCxiLnV0aWwub24od2luZG93LFwidW5sb2FkXCIsZnVuY3Rpb24oKXtjLmRlc3Ryb3koKX0pfSxjLnByb3RvdHlwZS5fPWZ1bmN0aW9uKGEsYil7dGhpcy5vbkRhdGEoYSk7dHJ5e3ZhciBjPWIuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJzY3JpcHRcIilbMF07Yy5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGMpfWNhdGNoKGQpe319LGMucHJvdG90eXBlLmRlc3Ryb3k9ZnVuY3Rpb24oKXtpZih0aGlzLmlmcmFtZSl7dHJ5e3RoaXMuaWZyYW1lLnNyYz1cImFib3V0OmJsYW5rXCJ9Y2F0Y2goYSl7fXRoaXMuZG9jPW51bGwsdGhpcy5pZnJhbWUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLmlmcmFtZSksdGhpcy5pZnJhbWU9bnVsbCxDb2xsZWN0R2FyYmFnZSgpfX0sYy5wcm90b3R5cGUuY2xvc2U9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5kZXN0cm95KCksYi5UcmFuc3BvcnQuWEhSLnByb3RvdHlwZS5jbG9zZS5jYWxsKHRoaXMpfSxjLmNoZWNrPWZ1bmN0aW9uKGEpe2lmKHR5cGVvZiB3aW5kb3chPVwidW5kZWZpbmVkXCImJltcIkFjdGl2ZVwiXS5jb25jYXQoXCJPYmplY3RcIikuam9pbihcIlhcIilpbiB3aW5kb3cpdHJ5e3ZhciBjPW5ldyh3aW5kb3dbW1wiQWN0aXZlXCJdLmNvbmNhdChcIk9iamVjdFwiKS5qb2luKFwiWFwiKV0pKFwiaHRtbGZpbGVcIik7cmV0dXJuIGMmJmIuVHJhbnNwb3J0LlhIUi5jaGVjayhhKX1jYXRjaChkKXt9cmV0dXJuITF9LGMueGRvbWFpbkNoZWNrPWZ1bmN0aW9uKCl7cmV0dXJuITF9LGIudHJhbnNwb3J0cy5wdXNoKFwiaHRtbGZpbGVcIil9KFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pby5UcmFuc3BvcnQ6bW9kdWxlLmV4cG9ydHMsXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvOm1vZHVsZS5wYXJlbnQuZXhwb3J0cyksZnVuY3Rpb24oYSxiLGMpe2Z1bmN0aW9uIGQoKXtiLlRyYW5zcG9ydC5YSFIuYXBwbHkodGhpcyxhcmd1bWVudHMpfWZ1bmN0aW9uIGUoKXt9YVtcInhoci1wb2xsaW5nXCJdPWQsYi51dGlsLmluaGVyaXQoZCxiLlRyYW5zcG9ydC5YSFIpLGIudXRpbC5tZXJnZShkLGIuVHJhbnNwb3J0LlhIUiksZC5wcm90b3R5cGUubmFtZT1cInhoci1wb2xsaW5nXCIsZC5wcm90b3R5cGUuaGVhcnRiZWF0cz1mdW5jdGlvbigpe3JldHVybiExfSxkLnByb3RvdHlwZS5vcGVuPWZ1bmN0aW9uKCl7dmFyIGE9dGhpcztyZXR1cm4gYi5UcmFuc3BvcnQuWEhSLnByb3RvdHlwZS5vcGVuLmNhbGwoYSksITF9LGQucHJvdG90eXBlLmdldD1mdW5jdGlvbigpe2Z1bmN0aW9uIGIoKXt0aGlzLnJlYWR5U3RhdGU9PTQmJih0aGlzLm9ucmVhZHlzdGF0ZWNoYW5nZT1lLHRoaXMuc3RhdHVzPT0yMDA/KGEub25EYXRhKHRoaXMucmVzcG9uc2VUZXh0KSxhLmdldCgpKTphLm9uQ2xvc2UoKSl9ZnVuY3Rpb24gZCgpe3RoaXMub25sb2FkPWUsdGhpcy5vbmVycm9yPWUsYS5yZXRyeUNvdW50ZXI9MSxhLm9uRGF0YSh0aGlzLnJlc3BvbnNlVGV4dCksYS5nZXQoKX1mdW5jdGlvbiBmKCl7YS5yZXRyeUNvdW50ZXIrKywhYS5yZXRyeUNvdW50ZXJ8fGEucmV0cnlDb3VudGVyPjM/YS5vbkNsb3NlKCk6YS5nZXQoKX1pZighdGhpcy5pc09wZW4pcmV0dXJuO3ZhciBhPXRoaXM7dGhpcy54aHI9dGhpcy5yZXF1ZXN0KCksYy5YRG9tYWluUmVxdWVzdCYmdGhpcy54aHIgaW5zdGFuY2VvZiBYRG9tYWluUmVxdWVzdD8odGhpcy54aHIub25sb2FkPWQsdGhpcy54aHIub25lcnJvcj1mKTp0aGlzLnhoci5vbnJlYWR5c3RhdGVjaGFuZ2U9Yix0aGlzLnhoci5zZW5kKG51bGwpfSxkLnByb3RvdHlwZS5vbkNsb3NlPWZ1bmN0aW9uKCl7Yi5UcmFuc3BvcnQuWEhSLnByb3RvdHlwZS5vbkNsb3NlLmNhbGwodGhpcyk7aWYodGhpcy54aHIpe3RoaXMueGhyLm9ucmVhZHlzdGF0ZWNoYW5nZT10aGlzLnhoci5vbmxvYWQ9dGhpcy54aHIub25lcnJvcj1lO3RyeXt0aGlzLnhoci5hYm9ydCgpfWNhdGNoKGEpe310aGlzLnhocj1udWxsfX0sZC5wcm90b3R5cGUucmVhZHk9ZnVuY3Rpb24oYSxjKXt2YXIgZD10aGlzO2IudXRpbC5kZWZlcihmdW5jdGlvbigpe2MuY2FsbChkKX0pfSxiLnRyYW5zcG9ydHMucHVzaChcInhoci1wb2xsaW5nXCIpfShcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW8uVHJhbnNwb3J0Om1vZHVsZS5leHBvcnRzLFwidW5kZWZpbmVkXCIhPXR5cGVvZiBpbz9pbzptb2R1bGUucGFyZW50LmV4cG9ydHMsdGhpcyksZnVuY3Rpb24oYSxiLGMpe2Z1bmN0aW9uIGUoYSl7Yi5UcmFuc3BvcnRbXCJ4aHItcG9sbGluZ1wiXS5hcHBseSh0aGlzLGFyZ3VtZW50cyksdGhpcy5pbmRleD1iLmoubGVuZ3RoO3ZhciBjPXRoaXM7Yi5qLnB1c2goZnVuY3Rpb24oYSl7Yy5fKGEpfSl9dmFyIGQ9Yy5kb2N1bWVudCYmXCJNb3pBcHBlYXJhbmNlXCJpbiBjLmRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZTthW1wianNvbnAtcG9sbGluZ1wiXT1lLGIudXRpbC5pbmhlcml0KGUsYi5UcmFuc3BvcnRbXCJ4aHItcG9sbGluZ1wiXSksZS5wcm90b3R5cGUubmFtZT1cImpzb25wLXBvbGxpbmdcIixlLnByb3RvdHlwZS5wb3N0PWZ1bmN0aW9uKGEpe2Z1bmN0aW9uIGkoKXtqKCksYy5zb2NrZXQuc2V0QnVmZmVyKCExKX1mdW5jdGlvbiBqKCl7Yy5pZnJhbWUmJmMuZm9ybS5yZW1vdmVDaGlsZChjLmlmcmFtZSk7dHJ5e2g9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnPGlmcmFtZSBuYW1lPVwiJytjLmlmcmFtZUlkKydcIj4nKX1jYXRjaChhKXtoPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpZnJhbWVcIiksaC5uYW1lPWMuaWZyYW1lSWR9aC5pZD1jLmlmcmFtZUlkLGMuZm9ybS5hcHBlbmRDaGlsZChoKSxjLmlmcmFtZT1ofXZhciBjPXRoaXMsZD1iLnV0aWwucXVlcnkodGhpcy5zb2NrZXQub3B0aW9ucy5xdWVyeSxcInQ9XCIrICsobmV3IERhdGUpK1wiJmk9XCIrdGhpcy5pbmRleCk7aWYoIXRoaXMuZm9ybSl7dmFyIGU9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImZvcm1cIiksZj1kb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidGV4dGFyZWFcIiksZz10aGlzLmlmcmFtZUlkPVwic29ja2V0aW9faWZyYW1lX1wiK3RoaXMuaW5kZXgsaDtlLmNsYXNzTmFtZT1cInNvY2tldGlvXCIsZS5zdHlsZS5wb3NpdGlvbj1cImFic29sdXRlXCIsZS5zdHlsZS50b3A9XCIwcHhcIixlLnN0eWxlLmxlZnQ9XCIwcHhcIixlLnN0eWxlLmRpc3BsYXk9XCJub25lXCIsZS50YXJnZXQ9ZyxlLm1ldGhvZD1cIlBPU1RcIixlLnNldEF0dHJpYnV0ZShcImFjY2VwdC1jaGFyc2V0XCIsXCJ1dGYtOFwiKSxmLm5hbWU9XCJkXCIsZS5hcHBlbmRDaGlsZChmKSxkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGUpLHRoaXMuZm9ybT1lLHRoaXMuYXJlYT1mfXRoaXMuZm9ybS5hY3Rpb249dGhpcy5wcmVwYXJlVXJsKCkrZCxqKCksdGhpcy5hcmVhLnZhbHVlPWIuSlNPTi5zdHJpbmdpZnkoYSk7dHJ5e3RoaXMuZm9ybS5zdWJtaXQoKX1jYXRjaChrKXt9dGhpcy5pZnJhbWUuYXR0YWNoRXZlbnQ/aC5vbnJlYWR5c3RhdGVjaGFuZ2U9ZnVuY3Rpb24oKXtjLmlmcmFtZS5yZWFkeVN0YXRlPT1cImNvbXBsZXRlXCImJmkoKX06dGhpcy5pZnJhbWUub25sb2FkPWksdGhpcy5zb2NrZXQuc2V0QnVmZmVyKCEwKX0sZS5wcm90b3R5cGUuZ2V0PWZ1bmN0aW9uKCl7dmFyIGE9dGhpcyxjPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzY3JpcHRcIiksZT1iLnV0aWwucXVlcnkodGhpcy5zb2NrZXQub3B0aW9ucy5xdWVyeSxcInQ9XCIrICsobmV3IERhdGUpK1wiJmk9XCIrdGhpcy5pbmRleCk7dGhpcy5zY3JpcHQmJih0aGlzLnNjcmlwdC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuc2NyaXB0KSx0aGlzLnNjcmlwdD1udWxsKSxjLmFzeW5jPSEwLGMuc3JjPXRoaXMucHJlcGFyZVVybCgpK2UsYy5vbmVycm9yPWZ1bmN0aW9uKCl7YS5vbkNsb3NlKCl9O3ZhciBmPWRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwic2NyaXB0XCIpWzBdO2YucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUoYyxmKSx0aGlzLnNjcmlwdD1jLGQmJnNldFRpbWVvdXQoZnVuY3Rpb24oKXt2YXIgYT1kb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaWZyYW1lXCIpO2RvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYSksZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChhKX0sMTAwKX0sZS5wcm90b3R5cGUuXz1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5vbkRhdGEoYSksdGhpcy5pc09wZW4mJnRoaXMuZ2V0KCksdGhpc30sZS5wcm90b3R5cGUucmVhZHk9ZnVuY3Rpb24oYSxjKXt2YXIgZT10aGlzO2lmKCFkKXJldHVybiBjLmNhbGwodGhpcyk7Yi51dGlsLmxvYWQoZnVuY3Rpb24oKXtjLmNhbGwoZSl9KX0sZS5jaGVjaz1mdW5jdGlvbigpe3JldHVyblwiZG9jdW1lbnRcImluIGN9LGUueGRvbWFpbkNoZWNrPWZ1bmN0aW9uKCl7cmV0dXJuITB9LGIudHJhbnNwb3J0cy5wdXNoKFwianNvbnAtcG9sbGluZ1wiKX0oXCJ1bmRlZmluZWRcIiE9dHlwZW9mIGlvP2lvLlRyYW5zcG9ydDptb2R1bGUuZXhwb3J0cyxcInVuZGVmaW5lZFwiIT10eXBlb2YgaW8/aW86bW9kdWxlLnBhcmVudC5leHBvcnRzLHRoaXMpLHR5cGVvZiBkZWZpbmU9PVwiZnVuY3Rpb25cIiYmZGVmaW5lLmFtZCYmZGVmaW5lKFtdLGZ1bmN0aW9uKCl7cmV0dXJuIGlvfSl9KSgpIiwiKGZ1bmN0aW9uKCl7KGZ1bmN0aW9uKCl7dmFyIG49dGhpcyx0PW4uXyxyPXt9LGU9QXJyYXkucHJvdG90eXBlLHU9T2JqZWN0LnByb3RvdHlwZSxpPUZ1bmN0aW9uLnByb3RvdHlwZSxhPWUucHVzaCxvPWUuc2xpY2UsYz1lLmNvbmNhdCxsPXUudG9TdHJpbmcsZj11Lmhhc093blByb3BlcnR5LHM9ZS5mb3JFYWNoLHA9ZS5tYXAsaD1lLnJlZHVjZSx2PWUucmVkdWNlUmlnaHQsZD1lLmZpbHRlcixnPWUuZXZlcnksbT1lLnNvbWUseT1lLmluZGV4T2YsYj1lLmxhc3RJbmRleE9mLHg9QXJyYXkuaXNBcnJheSxfPU9iamVjdC5rZXlzLGo9aS5iaW5kLHc9ZnVuY3Rpb24obil7cmV0dXJuIG4gaW5zdGFuY2VvZiB3P246dGhpcyBpbnN0YW5jZW9mIHc/KHRoaXMuX3dyYXBwZWQ9bix2b2lkIDApOm5ldyB3KG4pfTtcInVuZGVmaW5lZFwiIT10eXBlb2YgZXhwb3J0cz8oXCJ1bmRlZmluZWRcIiE9dHlwZW9mIG1vZHVsZSYmbW9kdWxlLmV4cG9ydHMmJihleHBvcnRzPW1vZHVsZS5leHBvcnRzPXcpLGV4cG9ydHMuXz13KTpuLl89dyx3LlZFUlNJT049XCIxLjQuNFwiO3ZhciBBPXcuZWFjaD13LmZvckVhY2g9ZnVuY3Rpb24obix0LGUpe2lmKG51bGwhPW4paWYocyYmbi5mb3JFYWNoPT09cyluLmZvckVhY2godCxlKTtlbHNlIGlmKG4ubGVuZ3RoPT09K24ubGVuZ3RoKXtmb3IodmFyIHU9MCxpPW4ubGVuZ3RoO2k+dTt1KyspaWYodC5jYWxsKGUsblt1XSx1LG4pPT09cilyZXR1cm59ZWxzZSBmb3IodmFyIGEgaW4gbilpZih3LmhhcyhuLGEpJiZ0LmNhbGwoZSxuW2FdLGEsbik9PT1yKXJldHVybn07dy5tYXA9dy5jb2xsZWN0PWZ1bmN0aW9uKG4sdCxyKXt2YXIgZT1bXTtyZXR1cm4gbnVsbD09bj9lOnAmJm4ubWFwPT09cD9uLm1hcCh0LHIpOihBKG4sZnVuY3Rpb24obix1LGkpe2VbZS5sZW5ndGhdPXQuY2FsbChyLG4sdSxpKX0pLGUpfTt2YXIgTz1cIlJlZHVjZSBvZiBlbXB0eSBhcnJheSB3aXRoIG5vIGluaXRpYWwgdmFsdWVcIjt3LnJlZHVjZT13LmZvbGRsPXcuaW5qZWN0PWZ1bmN0aW9uKG4sdCxyLGUpe3ZhciB1PWFyZ3VtZW50cy5sZW5ndGg+MjtpZihudWxsPT1uJiYobj1bXSksaCYmbi5yZWR1Y2U9PT1oKXJldHVybiBlJiYodD13LmJpbmQodCxlKSksdT9uLnJlZHVjZSh0LHIpOm4ucmVkdWNlKHQpO2lmKEEobixmdW5jdGlvbihuLGksYSl7dT9yPXQuY2FsbChlLHIsbixpLGEpOihyPW4sdT0hMCl9KSwhdSl0aHJvdyBuZXcgVHlwZUVycm9yKE8pO3JldHVybiByfSx3LnJlZHVjZVJpZ2h0PXcuZm9sZHI9ZnVuY3Rpb24obix0LHIsZSl7dmFyIHU9YXJndW1lbnRzLmxlbmd0aD4yO2lmKG51bGw9PW4mJihuPVtdKSx2JiZuLnJlZHVjZVJpZ2h0PT09dilyZXR1cm4gZSYmKHQ9dy5iaW5kKHQsZSkpLHU/bi5yZWR1Y2VSaWdodCh0LHIpOm4ucmVkdWNlUmlnaHQodCk7dmFyIGk9bi5sZW5ndGg7aWYoaSE9PStpKXt2YXIgYT13LmtleXMobik7aT1hLmxlbmd0aH1pZihBKG4sZnVuY3Rpb24obyxjLGwpe2M9YT9hWy0taV06LS1pLHU/cj10LmNhbGwoZSxyLG5bY10sYyxsKToocj1uW2NdLHU9ITApfSksIXUpdGhyb3cgbmV3IFR5cGVFcnJvcihPKTtyZXR1cm4gcn0sdy5maW5kPXcuZGV0ZWN0PWZ1bmN0aW9uKG4sdCxyKXt2YXIgZTtyZXR1cm4gRShuLGZ1bmN0aW9uKG4sdSxpKXtyZXR1cm4gdC5jYWxsKHIsbix1LGkpPyhlPW4sITApOnZvaWQgMH0pLGV9LHcuZmlsdGVyPXcuc2VsZWN0PWZ1bmN0aW9uKG4sdCxyKXt2YXIgZT1bXTtyZXR1cm4gbnVsbD09bj9lOmQmJm4uZmlsdGVyPT09ZD9uLmZpbHRlcih0LHIpOihBKG4sZnVuY3Rpb24obix1LGkpe3QuY2FsbChyLG4sdSxpKSYmKGVbZS5sZW5ndGhdPW4pfSksZSl9LHcucmVqZWN0PWZ1bmN0aW9uKG4sdCxyKXtyZXR1cm4gdy5maWx0ZXIobixmdW5jdGlvbihuLGUsdSl7cmV0dXJuIXQuY2FsbChyLG4sZSx1KX0scil9LHcuZXZlcnk9dy5hbGw9ZnVuY3Rpb24obix0LGUpe3R8fCh0PXcuaWRlbnRpdHkpO3ZhciB1PSEwO3JldHVybiBudWxsPT1uP3U6ZyYmbi5ldmVyeT09PWc/bi5ldmVyeSh0LGUpOihBKG4sZnVuY3Rpb24obixpLGEpe3JldHVybih1PXUmJnQuY2FsbChlLG4saSxhKSk/dm9pZCAwOnJ9KSwhIXUpfTt2YXIgRT13LnNvbWU9dy5hbnk9ZnVuY3Rpb24obix0LGUpe3R8fCh0PXcuaWRlbnRpdHkpO3ZhciB1PSExO3JldHVybiBudWxsPT1uP3U6bSYmbi5zb21lPT09bT9uLnNvbWUodCxlKTooQShuLGZ1bmN0aW9uKG4saSxhKXtyZXR1cm4gdXx8KHU9dC5jYWxsKGUsbixpLGEpKT9yOnZvaWQgMH0pLCEhdSl9O3cuY29udGFpbnM9dy5pbmNsdWRlPWZ1bmN0aW9uKG4sdCl7cmV0dXJuIG51bGw9PW4/ITE6eSYmbi5pbmRleE9mPT09eT9uLmluZGV4T2YodCkhPS0xOkUobixmdW5jdGlvbihuKXtyZXR1cm4gbj09PXR9KX0sdy5pbnZva2U9ZnVuY3Rpb24obix0KXt2YXIgcj1vLmNhbGwoYXJndW1lbnRzLDIpLGU9dy5pc0Z1bmN0aW9uKHQpO3JldHVybiB3Lm1hcChuLGZ1bmN0aW9uKG4pe3JldHVybihlP3Q6blt0XSkuYXBwbHkobixyKX0pfSx3LnBsdWNrPWZ1bmN0aW9uKG4sdCl7cmV0dXJuIHcubWFwKG4sZnVuY3Rpb24obil7cmV0dXJuIG5bdF19KX0sdy53aGVyZT1mdW5jdGlvbihuLHQscil7cmV0dXJuIHcuaXNFbXB0eSh0KT9yP251bGw6W106d1tyP1wiZmluZFwiOlwiZmlsdGVyXCJdKG4sZnVuY3Rpb24obil7Zm9yKHZhciByIGluIHQpaWYodFtyXSE9PW5bcl0pcmV0dXJuITE7cmV0dXJuITB9KX0sdy5maW5kV2hlcmU9ZnVuY3Rpb24obix0KXtyZXR1cm4gdy53aGVyZShuLHQsITApfSx3Lm1heD1mdW5jdGlvbihuLHQscil7aWYoIXQmJncuaXNBcnJheShuKSYmblswXT09PStuWzBdJiY2NTUzNT5uLmxlbmd0aClyZXR1cm4gTWF0aC5tYXguYXBwbHkoTWF0aCxuKTtpZighdCYmdy5pc0VtcHR5KG4pKXJldHVybi0xLzA7dmFyIGU9e2NvbXB1dGVkOi0xLzAsdmFsdWU6LTEvMH07cmV0dXJuIEEobixmdW5jdGlvbihuLHUsaSl7dmFyIGE9dD90LmNhbGwocixuLHUsaSk6bjthPj1lLmNvbXB1dGVkJiYoZT17dmFsdWU6bixjb21wdXRlZDphfSl9KSxlLnZhbHVlfSx3Lm1pbj1mdW5jdGlvbihuLHQscil7aWYoIXQmJncuaXNBcnJheShuKSYmblswXT09PStuWzBdJiY2NTUzNT5uLmxlbmd0aClyZXR1cm4gTWF0aC5taW4uYXBwbHkoTWF0aCxuKTtpZighdCYmdy5pc0VtcHR5KG4pKXJldHVybiAxLzA7dmFyIGU9e2NvbXB1dGVkOjEvMCx2YWx1ZToxLzB9O3JldHVybiBBKG4sZnVuY3Rpb24obix1LGkpe3ZhciBhPXQ/dC5jYWxsKHIsbix1LGkpOm47ZS5jb21wdXRlZD5hJiYoZT17dmFsdWU6bixjb21wdXRlZDphfSl9KSxlLnZhbHVlfSx3LnNodWZmbGU9ZnVuY3Rpb24obil7dmFyIHQscj0wLGU9W107cmV0dXJuIEEobixmdW5jdGlvbihuKXt0PXcucmFuZG9tKHIrKyksZVtyLTFdPWVbdF0sZVt0XT1ufSksZX07dmFyIGs9ZnVuY3Rpb24obil7cmV0dXJuIHcuaXNGdW5jdGlvbihuKT9uOmZ1bmN0aW9uKHQpe3JldHVybiB0W25dfX07dy5zb3J0Qnk9ZnVuY3Rpb24obix0LHIpe3ZhciBlPWsodCk7cmV0dXJuIHcucGx1Y2sody5tYXAobixmdW5jdGlvbihuLHQsdSl7cmV0dXJue3ZhbHVlOm4saW5kZXg6dCxjcml0ZXJpYTplLmNhbGwocixuLHQsdSl9fSkuc29ydChmdW5jdGlvbihuLHQpe3ZhciByPW4uY3JpdGVyaWEsZT10LmNyaXRlcmlhO2lmKHIhPT1lKXtpZihyPmV8fHI9PT12b2lkIDApcmV0dXJuIDE7aWYoZT5yfHxlPT09dm9pZCAwKXJldHVybi0xfXJldHVybiBuLmluZGV4PHQuaW5kZXg/LTE6MX0pLFwidmFsdWVcIil9O3ZhciBGPWZ1bmN0aW9uKG4sdCxyLGUpe3ZhciB1PXt9LGk9ayh0fHx3LmlkZW50aXR5KTtyZXR1cm4gQShuLGZ1bmN0aW9uKHQsYSl7dmFyIG89aS5jYWxsKHIsdCxhLG4pO2UodSxvLHQpfSksdX07dy5ncm91cEJ5PWZ1bmN0aW9uKG4sdCxyKXtyZXR1cm4gRihuLHQscixmdW5jdGlvbihuLHQscil7KHcuaGFzKG4sdCk/blt0XTpuW3RdPVtdKS5wdXNoKHIpfSl9LHcuY291bnRCeT1mdW5jdGlvbihuLHQscil7cmV0dXJuIEYobix0LHIsZnVuY3Rpb24obix0KXt3LmhhcyhuLHQpfHwoblt0XT0wKSxuW3RdKyt9KX0sdy5zb3J0ZWRJbmRleD1mdW5jdGlvbihuLHQscixlKXtyPW51bGw9PXI/dy5pZGVudGl0eTprKHIpO2Zvcih2YXIgdT1yLmNhbGwoZSx0KSxpPTAsYT1uLmxlbmd0aDthPmk7KXt2YXIgbz1pK2E+Pj4xO3U+ci5jYWxsKGUsbltvXSk/aT1vKzE6YT1vfXJldHVybiBpfSx3LnRvQXJyYXk9ZnVuY3Rpb24obil7cmV0dXJuIG4/dy5pc0FycmF5KG4pP28uY2FsbChuKTpuLmxlbmd0aD09PStuLmxlbmd0aD93Lm1hcChuLHcuaWRlbnRpdHkpOncudmFsdWVzKG4pOltdfSx3LnNpemU9ZnVuY3Rpb24obil7cmV0dXJuIG51bGw9PW4/MDpuLmxlbmd0aD09PStuLmxlbmd0aD9uLmxlbmd0aDp3LmtleXMobikubGVuZ3RofSx3LmZpcnN0PXcuaGVhZD13LnRha2U9ZnVuY3Rpb24obix0LHIpe3JldHVybiBudWxsPT1uP3ZvaWQgMDpudWxsPT10fHxyP25bMF06by5jYWxsKG4sMCx0KX0sdy5pbml0aWFsPWZ1bmN0aW9uKG4sdCxyKXtyZXR1cm4gby5jYWxsKG4sMCxuLmxlbmd0aC0obnVsbD09dHx8cj8xOnQpKX0sdy5sYXN0PWZ1bmN0aW9uKG4sdCxyKXtyZXR1cm4gbnVsbD09bj92b2lkIDA6bnVsbD09dHx8cj9uW24ubGVuZ3RoLTFdOm8uY2FsbChuLE1hdGgubWF4KG4ubGVuZ3RoLXQsMCkpfSx3LnJlc3Q9dy50YWlsPXcuZHJvcD1mdW5jdGlvbihuLHQscil7cmV0dXJuIG8uY2FsbChuLG51bGw9PXR8fHI/MTp0KX0sdy5jb21wYWN0PWZ1bmN0aW9uKG4pe3JldHVybiB3LmZpbHRlcihuLHcuaWRlbnRpdHkpfTt2YXIgUj1mdW5jdGlvbihuLHQscil7cmV0dXJuIEEobixmdW5jdGlvbihuKXt3LmlzQXJyYXkobik/dD9hLmFwcGx5KHIsbik6UihuLHQscik6ci5wdXNoKG4pfSkscn07dy5mbGF0dGVuPWZ1bmN0aW9uKG4sdCl7cmV0dXJuIFIobix0LFtdKX0sdy53aXRob3V0PWZ1bmN0aW9uKG4pe3JldHVybiB3LmRpZmZlcmVuY2UobixvLmNhbGwoYXJndW1lbnRzLDEpKX0sdy51bmlxPXcudW5pcXVlPWZ1bmN0aW9uKG4sdCxyLGUpe3cuaXNGdW5jdGlvbih0KSYmKGU9cixyPXQsdD0hMSk7dmFyIHU9cj93Lm1hcChuLHIsZSk6bixpPVtdLGE9W107cmV0dXJuIEEodSxmdW5jdGlvbihyLGUpeyh0P2UmJmFbYS5sZW5ndGgtMV09PT1yOncuY29udGFpbnMoYSxyKSl8fChhLnB1c2gociksaS5wdXNoKG5bZV0pKX0pLGl9LHcudW5pb249ZnVuY3Rpb24oKXtyZXR1cm4gdy51bmlxKGMuYXBwbHkoZSxhcmd1bWVudHMpKX0sdy5pbnRlcnNlY3Rpb249ZnVuY3Rpb24obil7dmFyIHQ9by5jYWxsKGFyZ3VtZW50cywxKTtyZXR1cm4gdy5maWx0ZXIody51bmlxKG4pLGZ1bmN0aW9uKG4pe3JldHVybiB3LmV2ZXJ5KHQsZnVuY3Rpb24odCl7cmV0dXJuIHcuaW5kZXhPZih0LG4pPj0wfSl9KX0sdy5kaWZmZXJlbmNlPWZ1bmN0aW9uKG4pe3ZhciB0PWMuYXBwbHkoZSxvLmNhbGwoYXJndW1lbnRzLDEpKTtyZXR1cm4gdy5maWx0ZXIobixmdW5jdGlvbihuKXtyZXR1cm4hdy5jb250YWlucyh0LG4pfSl9LHcuemlwPWZ1bmN0aW9uKCl7Zm9yKHZhciBuPW8uY2FsbChhcmd1bWVudHMpLHQ9dy5tYXgody5wbHVjayhuLFwibGVuZ3RoXCIpKSxyPUFycmF5KHQpLGU9MDt0PmU7ZSsrKXJbZV09dy5wbHVjayhuLFwiXCIrZSk7cmV0dXJuIHJ9LHcub2JqZWN0PWZ1bmN0aW9uKG4sdCl7aWYobnVsbD09bilyZXR1cm57fTtmb3IodmFyIHI9e30sZT0wLHU9bi5sZW5ndGg7dT5lO2UrKyl0P3JbbltlXV09dFtlXTpyW25bZV1bMF1dPW5bZV1bMV07cmV0dXJuIHJ9LHcuaW5kZXhPZj1mdW5jdGlvbihuLHQscil7aWYobnVsbD09bilyZXR1cm4tMTt2YXIgZT0wLHU9bi5sZW5ndGg7aWYocil7aWYoXCJudW1iZXJcIiE9dHlwZW9mIHIpcmV0dXJuIGU9dy5zb3J0ZWRJbmRleChuLHQpLG5bZV09PT10P2U6LTE7ZT0wPnI/TWF0aC5tYXgoMCx1K3IpOnJ9aWYoeSYmbi5pbmRleE9mPT09eSlyZXR1cm4gbi5pbmRleE9mKHQscik7Zm9yKDt1PmU7ZSsrKWlmKG5bZV09PT10KXJldHVybiBlO3JldHVybi0xfSx3Lmxhc3RJbmRleE9mPWZ1bmN0aW9uKG4sdCxyKXtpZihudWxsPT1uKXJldHVybi0xO3ZhciBlPW51bGwhPXI7aWYoYiYmbi5sYXN0SW5kZXhPZj09PWIpcmV0dXJuIGU/bi5sYXN0SW5kZXhPZih0LHIpOm4ubGFzdEluZGV4T2YodCk7Zm9yKHZhciB1PWU/cjpuLmxlbmd0aDt1LS07KWlmKG5bdV09PT10KXJldHVybiB1O3JldHVybi0xfSx3LnJhbmdlPWZ1bmN0aW9uKG4sdCxyKXsxPj1hcmd1bWVudHMubGVuZ3RoJiYodD1ufHwwLG49MCkscj1hcmd1bWVudHNbMl18fDE7Zm9yKHZhciBlPU1hdGgubWF4KE1hdGguY2VpbCgodC1uKS9yKSwwKSx1PTAsaT1BcnJheShlKTtlPnU7KWlbdSsrXT1uLG4rPXI7cmV0dXJuIGl9LHcuYmluZD1mdW5jdGlvbihuLHQpe2lmKG4uYmluZD09PWomJmopcmV0dXJuIGouYXBwbHkobixvLmNhbGwoYXJndW1lbnRzLDEpKTt2YXIgcj1vLmNhbGwoYXJndW1lbnRzLDIpO3JldHVybiBmdW5jdGlvbigpe3JldHVybiBuLmFwcGx5KHQsci5jb25jYXQoby5jYWxsKGFyZ3VtZW50cykpKX19LHcucGFydGlhbD1mdW5jdGlvbihuKXt2YXIgdD1vLmNhbGwoYXJndW1lbnRzLDEpO3JldHVybiBmdW5jdGlvbigpe3JldHVybiBuLmFwcGx5KHRoaXMsdC5jb25jYXQoby5jYWxsKGFyZ3VtZW50cykpKX19LHcuYmluZEFsbD1mdW5jdGlvbihuKXt2YXIgdD1vLmNhbGwoYXJndW1lbnRzLDEpO3JldHVybiAwPT09dC5sZW5ndGgmJih0PXcuZnVuY3Rpb25zKG4pKSxBKHQsZnVuY3Rpb24odCl7blt0XT13LmJpbmQoblt0XSxuKX0pLG59LHcubWVtb2l6ZT1mdW5jdGlvbihuLHQpe3ZhciByPXt9O3JldHVybiB0fHwodD13LmlkZW50aXR5KSxmdW5jdGlvbigpe3ZhciBlPXQuYXBwbHkodGhpcyxhcmd1bWVudHMpO3JldHVybiB3LmhhcyhyLGUpP3JbZV06cltlXT1uLmFwcGx5KHRoaXMsYXJndW1lbnRzKX19LHcuZGVsYXk9ZnVuY3Rpb24obix0KXt2YXIgcj1vLmNhbGwoYXJndW1lbnRzLDIpO3JldHVybiBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7cmV0dXJuIG4uYXBwbHkobnVsbCxyKX0sdCl9LHcuZGVmZXI9ZnVuY3Rpb24obil7cmV0dXJuIHcuZGVsYXkuYXBwbHkodyxbbiwxXS5jb25jYXQoby5jYWxsKGFyZ3VtZW50cywxKSkpfSx3LnRocm90dGxlPWZ1bmN0aW9uKG4sdCl7dmFyIHIsZSx1LGksYT0wLG89ZnVuY3Rpb24oKXthPW5ldyBEYXRlLHU9bnVsbCxpPW4uYXBwbHkocixlKX07cmV0dXJuIGZ1bmN0aW9uKCl7dmFyIGM9bmV3IERhdGUsbD10LShjLWEpO3JldHVybiByPXRoaXMsZT1hcmd1bWVudHMsMD49bD8oY2xlYXJUaW1lb3V0KHUpLHU9bnVsbCxhPWMsaT1uLmFwcGx5KHIsZSkpOnV8fCh1PXNldFRpbWVvdXQobyxsKSksaX19LHcuZGVib3VuY2U9ZnVuY3Rpb24obix0LHIpe3ZhciBlLHU7cmV0dXJuIGZ1bmN0aW9uKCl7dmFyIGk9dGhpcyxhPWFyZ3VtZW50cyxvPWZ1bmN0aW9uKCl7ZT1udWxsLHJ8fCh1PW4uYXBwbHkoaSxhKSl9LGM9ciYmIWU7cmV0dXJuIGNsZWFyVGltZW91dChlKSxlPXNldFRpbWVvdXQobyx0KSxjJiYodT1uLmFwcGx5KGksYSkpLHV9fSx3Lm9uY2U9ZnVuY3Rpb24obil7dmFyIHQscj0hMTtyZXR1cm4gZnVuY3Rpb24oKXtyZXR1cm4gcj90OihyPSEwLHQ9bi5hcHBseSh0aGlzLGFyZ3VtZW50cyksbj1udWxsLHQpfX0sdy53cmFwPWZ1bmN0aW9uKG4sdCl7cmV0dXJuIGZ1bmN0aW9uKCl7dmFyIHI9W25dO3JldHVybiBhLmFwcGx5KHIsYXJndW1lbnRzKSx0LmFwcGx5KHRoaXMscil9fSx3LmNvbXBvc2U9ZnVuY3Rpb24oKXt2YXIgbj1hcmd1bWVudHM7cmV0dXJuIGZ1bmN0aW9uKCl7Zm9yKHZhciB0PWFyZ3VtZW50cyxyPW4ubGVuZ3RoLTE7cj49MDtyLS0pdD1bbltyXS5hcHBseSh0aGlzLHQpXTtyZXR1cm4gdFswXX19LHcuYWZ0ZXI9ZnVuY3Rpb24obix0KXtyZXR1cm4gMD49bj90KCk6ZnVuY3Rpb24oKXtyZXR1cm4gMT4tLW4/dC5hcHBseSh0aGlzLGFyZ3VtZW50cyk6dm9pZCAwfX0sdy5rZXlzPV98fGZ1bmN0aW9uKG4pe2lmKG4hPT1PYmplY3QobikpdGhyb3cgbmV3IFR5cGVFcnJvcihcIkludmFsaWQgb2JqZWN0XCIpO3ZhciB0PVtdO2Zvcih2YXIgciBpbiBuKXcuaGFzKG4scikmJih0W3QubGVuZ3RoXT1yKTtyZXR1cm4gdH0sdy52YWx1ZXM9ZnVuY3Rpb24obil7dmFyIHQ9W107Zm9yKHZhciByIGluIG4pdy5oYXMobixyKSYmdC5wdXNoKG5bcl0pO3JldHVybiB0fSx3LnBhaXJzPWZ1bmN0aW9uKG4pe3ZhciB0PVtdO2Zvcih2YXIgciBpbiBuKXcuaGFzKG4scikmJnQucHVzaChbcixuW3JdXSk7cmV0dXJuIHR9LHcuaW52ZXJ0PWZ1bmN0aW9uKG4pe3ZhciB0PXt9O2Zvcih2YXIgciBpbiBuKXcuaGFzKG4scikmJih0W25bcl1dPXIpO3JldHVybiB0fSx3LmZ1bmN0aW9ucz13Lm1ldGhvZHM9ZnVuY3Rpb24obil7dmFyIHQ9W107Zm9yKHZhciByIGluIG4pdy5pc0Z1bmN0aW9uKG5bcl0pJiZ0LnB1c2gocik7cmV0dXJuIHQuc29ydCgpfSx3LmV4dGVuZD1mdW5jdGlvbihuKXtyZXR1cm4gQShvLmNhbGwoYXJndW1lbnRzLDEpLGZ1bmN0aW9uKHQpe2lmKHQpZm9yKHZhciByIGluIHQpbltyXT10W3JdfSksbn0sdy5waWNrPWZ1bmN0aW9uKG4pe3ZhciB0PXt9LHI9Yy5hcHBseShlLG8uY2FsbChhcmd1bWVudHMsMSkpO3JldHVybiBBKHIsZnVuY3Rpb24ocil7ciBpbiBuJiYodFtyXT1uW3JdKX0pLHR9LHcub21pdD1mdW5jdGlvbihuKXt2YXIgdD17fSxyPWMuYXBwbHkoZSxvLmNhbGwoYXJndW1lbnRzLDEpKTtmb3IodmFyIHUgaW4gbil3LmNvbnRhaW5zKHIsdSl8fCh0W3VdPW5bdV0pO3JldHVybiB0fSx3LmRlZmF1bHRzPWZ1bmN0aW9uKG4pe3JldHVybiBBKG8uY2FsbChhcmd1bWVudHMsMSksZnVuY3Rpb24odCl7aWYodClmb3IodmFyIHIgaW4gdCludWxsPT1uW3JdJiYobltyXT10W3JdKX0pLG59LHcuY2xvbmU9ZnVuY3Rpb24obil7cmV0dXJuIHcuaXNPYmplY3Qobik/dy5pc0FycmF5KG4pP24uc2xpY2UoKTp3LmV4dGVuZCh7fSxuKTpufSx3LnRhcD1mdW5jdGlvbihuLHQpe3JldHVybiB0KG4pLG59O3ZhciBJPWZ1bmN0aW9uKG4sdCxyLGUpe2lmKG49PT10KXJldHVybiAwIT09bnx8MS9uPT0xL3Q7aWYobnVsbD09bnx8bnVsbD09dClyZXR1cm4gbj09PXQ7biBpbnN0YW5jZW9mIHcmJihuPW4uX3dyYXBwZWQpLHQgaW5zdGFuY2VvZiB3JiYodD10Ll93cmFwcGVkKTt2YXIgdT1sLmNhbGwobik7aWYodSE9bC5jYWxsKHQpKXJldHVybiExO3N3aXRjaCh1KXtjYXNlXCJbb2JqZWN0IFN0cmluZ11cIjpyZXR1cm4gbj09dCtcIlwiO2Nhc2VcIltvYmplY3QgTnVtYmVyXVwiOnJldHVybiBuIT0rbj90IT0rdDowPT1uPzEvbj09MS90Om49PSt0O2Nhc2VcIltvYmplY3QgRGF0ZV1cIjpjYXNlXCJbb2JqZWN0IEJvb2xlYW5dXCI6cmV0dXJuK249PSt0O2Nhc2VcIltvYmplY3QgUmVnRXhwXVwiOnJldHVybiBuLnNvdXJjZT09dC5zb3VyY2UmJm4uZ2xvYmFsPT10Lmdsb2JhbCYmbi5tdWx0aWxpbmU9PXQubXVsdGlsaW5lJiZuLmlnbm9yZUNhc2U9PXQuaWdub3JlQ2FzZX1pZihcIm9iamVjdFwiIT10eXBlb2Ygbnx8XCJvYmplY3RcIiE9dHlwZW9mIHQpcmV0dXJuITE7Zm9yKHZhciBpPXIubGVuZ3RoO2ktLTspaWYocltpXT09bilyZXR1cm4gZVtpXT09dDtyLnB1c2gobiksZS5wdXNoKHQpO3ZhciBhPTAsbz0hMDtpZihcIltvYmplY3QgQXJyYXldXCI9PXUpe2lmKGE9bi5sZW5ndGgsbz1hPT10Lmxlbmd0aClmb3IoO2EtLSYmKG89SShuW2FdLHRbYV0scixlKSk7KTt9ZWxzZXt2YXIgYz1uLmNvbnN0cnVjdG9yLGY9dC5jb25zdHJ1Y3RvcjtpZihjIT09ZiYmISh3LmlzRnVuY3Rpb24oYykmJmMgaW5zdGFuY2VvZiBjJiZ3LmlzRnVuY3Rpb24oZikmJmYgaW5zdGFuY2VvZiBmKSlyZXR1cm4hMTtmb3IodmFyIHMgaW4gbilpZih3LmhhcyhuLHMpJiYoYSsrLCEobz13Lmhhcyh0LHMpJiZJKG5bc10sdFtzXSxyLGUpKSkpYnJlYWs7aWYobyl7Zm9yKHMgaW4gdClpZih3Lmhhcyh0LHMpJiYhYS0tKWJyZWFrO289IWF9fXJldHVybiByLnBvcCgpLGUucG9wKCksb307dy5pc0VxdWFsPWZ1bmN0aW9uKG4sdCl7cmV0dXJuIEkobix0LFtdLFtdKX0sdy5pc0VtcHR5PWZ1bmN0aW9uKG4pe2lmKG51bGw9PW4pcmV0dXJuITA7aWYody5pc0FycmF5KG4pfHx3LmlzU3RyaW5nKG4pKXJldHVybiAwPT09bi5sZW5ndGg7Zm9yKHZhciB0IGluIG4paWYody5oYXMobix0KSlyZXR1cm4hMTtyZXR1cm4hMH0sdy5pc0VsZW1lbnQ9ZnVuY3Rpb24obil7cmV0dXJuISghbnx8MSE9PW4ubm9kZVR5cGUpfSx3LmlzQXJyYXk9eHx8ZnVuY3Rpb24obil7cmV0dXJuXCJbb2JqZWN0IEFycmF5XVwiPT1sLmNhbGwobil9LHcuaXNPYmplY3Q9ZnVuY3Rpb24obil7cmV0dXJuIG49PT1PYmplY3Qobil9LEEoW1wiQXJndW1lbnRzXCIsXCJGdW5jdGlvblwiLFwiU3RyaW5nXCIsXCJOdW1iZXJcIixcIkRhdGVcIixcIlJlZ0V4cFwiXSxmdW5jdGlvbihuKXt3W1wiaXNcIituXT1mdW5jdGlvbih0KXtyZXR1cm4gbC5jYWxsKHQpPT1cIltvYmplY3QgXCIrbitcIl1cIn19KSx3LmlzQXJndW1lbnRzKGFyZ3VtZW50cyl8fCh3LmlzQXJndW1lbnRzPWZ1bmN0aW9uKG4pe3JldHVybiEoIW58fCF3LmhhcyhuLFwiY2FsbGVlXCIpKX0pLFwiZnVuY3Rpb25cIiE9dHlwZW9mLy4vJiYody5pc0Z1bmN0aW9uPWZ1bmN0aW9uKG4pe3JldHVyblwiZnVuY3Rpb25cIj09dHlwZW9mIG59KSx3LmlzRmluaXRlPWZ1bmN0aW9uKG4pe3JldHVybiBpc0Zpbml0ZShuKSYmIWlzTmFOKHBhcnNlRmxvYXQobikpfSx3LmlzTmFOPWZ1bmN0aW9uKG4pe3JldHVybiB3LmlzTnVtYmVyKG4pJiZuIT0rbn0sdy5pc0Jvb2xlYW49ZnVuY3Rpb24obil7cmV0dXJuIG49PT0hMHx8bj09PSExfHxcIltvYmplY3QgQm9vbGVhbl1cIj09bC5jYWxsKG4pfSx3LmlzTnVsbD1mdW5jdGlvbihuKXtyZXR1cm4gbnVsbD09PW59LHcuaXNVbmRlZmluZWQ9ZnVuY3Rpb24obil7cmV0dXJuIG49PT12b2lkIDB9LHcuaGFzPWZ1bmN0aW9uKG4sdCl7cmV0dXJuIGYuY2FsbChuLHQpfSx3Lm5vQ29uZmxpY3Q9ZnVuY3Rpb24oKXtyZXR1cm4gbi5fPXQsdGhpc30sdy5pZGVudGl0eT1mdW5jdGlvbihuKXtyZXR1cm4gbn0sdy50aW1lcz1mdW5jdGlvbihuLHQscil7Zm9yKHZhciBlPUFycmF5KG4pLHU9MDtuPnU7dSsrKWVbdV09dC5jYWxsKHIsdSk7cmV0dXJuIGV9LHcucmFuZG9tPWZ1bmN0aW9uKG4sdCl7cmV0dXJuIG51bGw9PXQmJih0PW4sbj0wKSxuK01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSoodC1uKzEpKX07dmFyIE09e2VzY2FwZTp7XCImXCI6XCImYW1wO1wiLFwiPFwiOlwiJmx0O1wiLFwiPlwiOlwiJmd0O1wiLCdcIic6XCImcXVvdDtcIixcIidcIjpcIiYjeDI3O1wiLFwiL1wiOlwiJiN4MkY7XCJ9fTtNLnVuZXNjYXBlPXcuaW52ZXJ0KE0uZXNjYXBlKTt2YXIgUz17ZXNjYXBlOlJlZ0V4cChcIltcIit3LmtleXMoTS5lc2NhcGUpLmpvaW4oXCJcIikrXCJdXCIsXCJnXCIpLHVuZXNjYXBlOlJlZ0V4cChcIihcIit3LmtleXMoTS51bmVzY2FwZSkuam9pbihcInxcIikrXCIpXCIsXCJnXCIpfTt3LmVhY2goW1wiZXNjYXBlXCIsXCJ1bmVzY2FwZVwiXSxmdW5jdGlvbihuKXt3W25dPWZ1bmN0aW9uKHQpe3JldHVybiBudWxsPT10P1wiXCI6KFwiXCIrdCkucmVwbGFjZShTW25dLGZ1bmN0aW9uKHQpe3JldHVybiBNW25dW3RdfSl9fSksdy5yZXN1bHQ9ZnVuY3Rpb24obix0KXtpZihudWxsPT1uKXJldHVybiBudWxsO3ZhciByPW5bdF07cmV0dXJuIHcuaXNGdW5jdGlvbihyKT9yLmNhbGwobik6cn0sdy5taXhpbj1mdW5jdGlvbihuKXtBKHcuZnVuY3Rpb25zKG4pLGZ1bmN0aW9uKHQpe3ZhciByPXdbdF09blt0XTt3LnByb3RvdHlwZVt0XT1mdW5jdGlvbigpe3ZhciBuPVt0aGlzLl93cmFwcGVkXTtyZXR1cm4gYS5hcHBseShuLGFyZ3VtZW50cyksRC5jYWxsKHRoaXMsci5hcHBseSh3LG4pKX19KX07dmFyIE49MDt3LnVuaXF1ZUlkPWZ1bmN0aW9uKG4pe3ZhciB0PSsrTitcIlwiO3JldHVybiBuP24rdDp0fSx3LnRlbXBsYXRlU2V0dGluZ3M9e2V2YWx1YXRlOi88JShbXFxzXFxTXSs/KSU+L2csaW50ZXJwb2xhdGU6LzwlPShbXFxzXFxTXSs/KSU+L2csZXNjYXBlOi88JS0oW1xcc1xcU10rPyklPi9nfTt2YXIgVD0vKC4pXi8scT17XCInXCI6XCInXCIsXCJcXFxcXCI6XCJcXFxcXCIsXCJcXHJcIjpcInJcIixcIlxcblwiOlwiblwiLFwiXHRcIjpcInRcIixcIlxcdTIwMjhcIjpcInUyMDI4XCIsXCJcXHUyMDI5XCI6XCJ1MjAyOVwifSxCPS9cXFxcfCd8XFxyfFxcbnxcXHR8XFx1MjAyOHxcXHUyMDI5L2c7dy50ZW1wbGF0ZT1mdW5jdGlvbihuLHQscil7dmFyIGU7cj13LmRlZmF1bHRzKHt9LHIsdy50ZW1wbGF0ZVNldHRpbmdzKTt2YXIgdT1SZWdFeHAoWyhyLmVzY2FwZXx8VCkuc291cmNlLChyLmludGVycG9sYXRlfHxUKS5zb3VyY2UsKHIuZXZhbHVhdGV8fFQpLnNvdXJjZV0uam9pbihcInxcIikrXCJ8JFwiLFwiZ1wiKSxpPTAsYT1cIl9fcCs9J1wiO24ucmVwbGFjZSh1LGZ1bmN0aW9uKHQscixlLHUsbyl7cmV0dXJuIGErPW4uc2xpY2UoaSxvKS5yZXBsYWNlKEIsZnVuY3Rpb24obil7cmV0dXJuXCJcXFxcXCIrcVtuXX0pLHImJihhKz1cIicrXFxuKChfX3Q9KFwiK3IrXCIpKT09bnVsbD8nJzpfLmVzY2FwZShfX3QpKStcXG4nXCIpLGUmJihhKz1cIicrXFxuKChfX3Q9KFwiK2UrXCIpKT09bnVsbD8nJzpfX3QpK1xcbidcIiksdSYmKGErPVwiJztcXG5cIit1K1wiXFxuX19wKz0nXCIpLGk9byt0Lmxlbmd0aCx0fSksYSs9XCInO1xcblwiLHIudmFyaWFibGV8fChhPVwid2l0aChvYmp8fHt9KXtcXG5cIithK1wifVxcblwiKSxhPVwidmFyIF9fdCxfX3A9JycsX19qPUFycmF5LnByb3RvdHlwZS5qb2luLFwiK1wicHJpbnQ9ZnVuY3Rpb24oKXtfX3ArPV9fai5jYWxsKGFyZ3VtZW50cywnJyk7fTtcXG5cIithK1wicmV0dXJuIF9fcDtcXG5cIjt0cnl7ZT1GdW5jdGlvbihyLnZhcmlhYmxlfHxcIm9ialwiLFwiX1wiLGEpfWNhdGNoKG8pe3Rocm93IG8uc291cmNlPWEsb31pZih0KXJldHVybiBlKHQsdyk7dmFyIGM9ZnVuY3Rpb24obil7cmV0dXJuIGUuY2FsbCh0aGlzLG4sdyl9O3JldHVybiBjLnNvdXJjZT1cImZ1bmN0aW9uKFwiKyhyLnZhcmlhYmxlfHxcIm9ialwiKStcIil7XFxuXCIrYStcIn1cIixjfSx3LmNoYWluPWZ1bmN0aW9uKG4pe3JldHVybiB3KG4pLmNoYWluKCl9O3ZhciBEPWZ1bmN0aW9uKG4pe3JldHVybiB0aGlzLl9jaGFpbj93KG4pLmNoYWluKCk6bn07dy5taXhpbih3KSxBKFtcInBvcFwiLFwicHVzaFwiLFwicmV2ZXJzZVwiLFwic2hpZnRcIixcInNvcnRcIixcInNwbGljZVwiLFwidW5zaGlmdFwiXSxmdW5jdGlvbihuKXt2YXIgdD1lW25dO3cucHJvdG90eXBlW25dPWZ1bmN0aW9uKCl7dmFyIHI9dGhpcy5fd3JhcHBlZDtyZXR1cm4gdC5hcHBseShyLGFyZ3VtZW50cyksXCJzaGlmdFwiIT1uJiZcInNwbGljZVwiIT1ufHwwIT09ci5sZW5ndGh8fGRlbGV0ZSByWzBdLEQuY2FsbCh0aGlzLHIpfX0pLEEoW1wiY29uY2F0XCIsXCJqb2luXCIsXCJzbGljZVwiXSxmdW5jdGlvbihuKXt2YXIgdD1lW25dO3cucHJvdG90eXBlW25dPWZ1bmN0aW9uKCl7cmV0dXJuIEQuY2FsbCh0aGlzLHQuYXBwbHkodGhpcy5fd3JhcHBlZCxhcmd1bWVudHMpKX19KSx3LmV4dGVuZCh3LnByb3RvdHlwZSx7Y2hhaW46ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5fY2hhaW49ITAsdGhpc30sdmFsdWU6ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5fd3JhcHBlZH19KX0pLmNhbGwodGhpcyk7XG59KSgpIiwiXG52YXIgcmFmID0gIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUgICAgICAgfHxcbiAgICAgICAgICAgd2luZG93LndlYmtpdFJlcXVlc3RBbmltYXRpb25GcmFtZSB8fFxuICAgICAgICAgICB3aW5kb3cubW96UmVxdWVzdEFuaW1hdGlvbkZyYW1lICAgIHx8XG4gICAgICAgICAgIGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KGNhbGxiYWNrLCAxMDAwIC8gNjApO1xuICAgICAgICAgICB9O1xuXG52YXIgcnVubmluZyA9IGZhbHNlO1xuXG5leHBvcnRzLnJ1biA9IGZ1bmN0aW9uKGZuKSB7XG4gIHJ1bm5pbmcgPSB0cnVlO1xuICByYWYoZnVuY3Rpb24gYW5pbWF0ZSgpIHtcbiAgICBmbigpO1xuICAgIGlmIChydW5uaW5nKSB7XG4gICAgICByYWYoYW5pbWF0ZSk7XG4gICAgfVxuICB9KTtcbn07XG5cbmV4cG9ydHMuc3RvcCA9IGZ1bmN0aW9uKCkge1xuICBydW5uaW5nID0gZmFsc2U7XG59O1xuIiwiXG52YXIgRW50aXR5VHJhY2tlciA9IGZ1bmN0aW9uKCkge1xuICBcbiAgdmFyIGVudGl0aWVzID0ge307XG4gIHZhciBsYXN0SWQgPSAxO1xuXG4gIHRoaXMuZm9yRWFjaCA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgZm9yICh2YXIgaWQgaW4gZW50aXRpZXMpIHtcbiAgICAgIGNhbGxiYWNrKGVudGl0aWVzW2lkXSk7XG4gICAgfVxuICB9O1xuXG4gIHRoaXMuZmluZCA9IGZ1bmN0aW9uKGlkKSB7XG4gICAgcmV0dXJuIGVudGl0aWVzW2lkXTtcbiAgfTtcblxuICB0aGlzLmZpbmRNYXRjaGluZyA9IGZ1bmN0aW9uKHJlZ2V4KSB7XG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKGVudGl0aWVzKVxuICAgICAgLmZpbHRlcihmdW5jdGlvbihpZCkgeyByZXR1cm4gaWQubWF0Y2gocmVnZXgpIH0pXG4gICAgICAubWFwKGZ1bmN0aW9uKGlkKSB7IHJldHVybiBlbnRpdGllc1tpZF0gfSlcbiAgfVxuXG4gIHRoaXMudHJhY2sgPSBmdW5jdGlvbihlbnRpdHkpIHtcbiAgICAvL2NvbnNvbGUubG9nKCdUcmFja2luZyBlbnRpdHk6ICcgKyBlbnRpdHkuaWQpO1xuICAgIHZhciBpZCA9IGVudGl0eS5pZCB8fCAobGFzdElkICs9IDEpO1xuICAgIGVudGl0aWVzW2lkXSA9IGVudGl0eTtcbiAgICByZXR1cm4gaWQ7XG4gIH07XG5cbiAgdGhpcy5mb3JnZXQgPSBmdW5jdGlvbihlbnRpdHkpIHtcbiAgICBkZWxldGUgZW50aXRpZXNbZW50aXR5LmlkXTtcbiAgfTtcbiAgXG4gIHRoaXMuZm9yZ2V0QWxsID0gZnVuY3Rpb24oKSB7XG4gICAgZW50aXRpZXMgPSB7fTtcbiAgfVxuICBcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRW50aXR5VHJhY2tlcjtcbiIsIlxuZnVuY3Rpb24gVGltZSgpIHtcbiAgdGhpcy5kZWx0YSA9IDE7XG4gIHRoaXMubGFzdFRpbWUgPSBuZXcgRGF0ZSgpO1xuICB0aGlzLmZyYW1lcyA9IDA7XG59XG5cblRpbWUucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmZyYW1lcysrO1xuICB2YXIgdGltZSA9IERhdGUubm93KCk7XG4gIHRoaXMuZnJhbWVzID0gMDtcbiAgICBcbiAgdmFyIGN1cnJlbnRUaW1lID0gdGltZTtcbiAgdmFyIHBhc3NlZFRpbWUgPSBjdXJyZW50VGltZSAtIHRoaXMubGFzdFRpbWU7XG4gIFxuICB0aGlzLmRlbHRhID0gcGFzc2VkVGltZTtcbiAgdGhpcy5sYXN0VGltZSA9IGN1cnJlbnRUaW1lO1xuXG4gIHJldHVybiB0aGlzLmRlbHRhO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBUaW1lO1xuIiwiLy8gQ29weXJpZ2h0IChjKSAyMDEzIEFkb2JlIFN5c3RlbXMgSW5jb3Jwb3JhdGVkLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuLy8gXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vLyBcbi8vIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy8gXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuLy8g4pSM4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSQIFxcXFxcbi8vIOKUgiBFdmUgMC40LjIgLSBKYXZhU2NyaXB0IEV2ZW50cyBMaWJyYXJ5ICAgICAgICAgICAgICAgICAgICAgIOKUgiBcXFxcXG4vLyDilJzilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilKQgXFxcXFxuLy8g4pSCIEF1dGhvciBEbWl0cnkgQmFyYW5vdnNraXkgKGh0dHA6Ly9kbWl0cnkuYmFyYW5vdnNraXkuY29tLykg4pSCIFxcXFxcbi8vIOKUlOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUmCBcXFxcXG5cbihmdW5jdGlvbiAoZ2xvYikge1xuICAgIHZhciB2ZXJzaW9uID0gXCIwLjQuMlwiLFxuICAgICAgICBoYXMgPSBcImhhc093blByb3BlcnR5XCIsXG4gICAgICAgIHNlcGFyYXRvciA9IC9bXFwuXFwvXS8sXG4gICAgICAgIHdpbGRjYXJkID0gXCIqXCIsXG4gICAgICAgIGZ1biA9IGZ1bmN0aW9uICgpIHt9LFxuICAgICAgICBudW1zb3J0ID0gZnVuY3Rpb24gKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiBhIC0gYjtcbiAgICAgICAgfSxcbiAgICAgICAgY3VycmVudF9ldmVudCxcbiAgICAgICAgc3RvcCxcbiAgICAgICAgZXZlbnRzID0ge246IHt9fSxcbiAgICAvKlxcXG4gICAgICogZXZlXG4gICAgIFsgbWV0aG9kIF1cblxuICAgICAqIEZpcmVzIGV2ZW50IHdpdGggZ2l2ZW4gYG5hbWVgLCBnaXZlbiBzY29wZSBhbmQgb3RoZXIgcGFyYW1ldGVycy5cblxuICAgICA+IEFyZ3VtZW50c1xuXG4gICAgIC0gbmFtZSAoc3RyaW5nKSBuYW1lIG9mIHRoZSAqZXZlbnQqLCBkb3QgKGAuYCkgb3Igc2xhc2ggKGAvYCkgc2VwYXJhdGVkXG4gICAgIC0gc2NvcGUgKG9iamVjdCkgY29udGV4dCBmb3IgdGhlIGV2ZW50IGhhbmRsZXJzXG4gICAgIC0gdmFyYXJncyAoLi4uKSB0aGUgcmVzdCBvZiBhcmd1bWVudHMgd2lsbCBiZSBzZW50IHRvIGV2ZW50IGhhbmRsZXJzXG5cbiAgICAgPSAob2JqZWN0KSBhcnJheSBvZiByZXR1cm5lZCB2YWx1ZXMgZnJvbSB0aGUgbGlzdGVuZXJzXG4gICAgXFwqL1xuICAgICAgICBldmUgPSBmdW5jdGlvbiAobmFtZSwgc2NvcGUpIHtcblx0XHRcdG5hbWUgPSBTdHJpbmcobmFtZSk7XG4gICAgICAgICAgICB2YXIgZSA9IGV2ZW50cyxcbiAgICAgICAgICAgICAgICBvbGRzdG9wID0gc3RvcCxcbiAgICAgICAgICAgICAgICBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKSxcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnMgPSBldmUubGlzdGVuZXJzKG5hbWUpLFxuICAgICAgICAgICAgICAgIHogPSAwLFxuICAgICAgICAgICAgICAgIGYgPSBmYWxzZSxcbiAgICAgICAgICAgICAgICBsLFxuICAgICAgICAgICAgICAgIGluZGV4ZWQgPSBbXSxcbiAgICAgICAgICAgICAgICBxdWV1ZSA9IHt9LFxuICAgICAgICAgICAgICAgIG91dCA9IFtdLFxuICAgICAgICAgICAgICAgIGNlID0gY3VycmVudF9ldmVudCxcbiAgICAgICAgICAgICAgICBlcnJvcnMgPSBbXTtcbiAgICAgICAgICAgIGN1cnJlbnRfZXZlbnQgPSBuYW1lO1xuICAgICAgICAgICAgc3RvcCA9IDA7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgaWkgPSBsaXN0ZW5lcnMubGVuZ3RoOyBpIDwgaWk7IGkrKykgaWYgKFwiekluZGV4XCIgaW4gbGlzdGVuZXJzW2ldKSB7XG4gICAgICAgICAgICAgICAgaW5kZXhlZC5wdXNoKGxpc3RlbmVyc1tpXS56SW5kZXgpO1xuICAgICAgICAgICAgICAgIGlmIChsaXN0ZW5lcnNbaV0uekluZGV4IDwgMCkge1xuICAgICAgICAgICAgICAgICAgICBxdWV1ZVtsaXN0ZW5lcnNbaV0uekluZGV4XSA9IGxpc3RlbmVyc1tpXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpbmRleGVkLnNvcnQobnVtc29ydCk7XG4gICAgICAgICAgICB3aGlsZSAoaW5kZXhlZFt6XSA8IDApIHtcbiAgICAgICAgICAgICAgICBsID0gcXVldWVbaW5kZXhlZFt6KytdXTtcbiAgICAgICAgICAgICAgICBvdXQucHVzaChsLmFwcGx5KHNjb3BlLCBhcmdzKSk7XG4gICAgICAgICAgICAgICAgaWYgKHN0b3ApIHtcbiAgICAgICAgICAgICAgICAgICAgc3RvcCA9IG9sZHN0b3A7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGlpOyBpKyspIHtcbiAgICAgICAgICAgICAgICBsID0gbGlzdGVuZXJzW2ldO1xuICAgICAgICAgICAgICAgIGlmIChcInpJbmRleFwiIGluIGwpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGwuekluZGV4ID09IGluZGV4ZWRbel0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dC5wdXNoKGwuYXBwbHkoc2NvcGUsIGFyZ3MpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdG9wKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeisrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGwgPSBxdWV1ZVtpbmRleGVkW3pdXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsICYmIG91dC5wdXNoKGwuYXBwbHkoc2NvcGUsIGFyZ3MpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RvcCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9IHdoaWxlIChsKVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVldWVbbC56SW5kZXhdID0gbDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG91dC5wdXNoKGwuYXBwbHkoc2NvcGUsIGFyZ3MpKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0b3ApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3RvcCA9IG9sZHN0b3A7XG4gICAgICAgICAgICBjdXJyZW50X2V2ZW50ID0gY2U7XG4gICAgICAgICAgICByZXR1cm4gb3V0Lmxlbmd0aCA/IG91dCA6IG51bGw7XG4gICAgICAgIH07XG5cdFx0Ly8gVW5kb2N1bWVudGVkLiBEZWJ1ZyBvbmx5LlxuXHRcdGV2ZS5fZXZlbnRzID0gZXZlbnRzO1xuICAgIC8qXFxcbiAgICAgKiBldmUubGlzdGVuZXJzXG4gICAgIFsgbWV0aG9kIF1cblxuICAgICAqIEludGVybmFsIG1ldGhvZCB3aGljaCBnaXZlcyB5b3UgYXJyYXkgb2YgYWxsIGV2ZW50IGhhbmRsZXJzIHRoYXQgd2lsbCBiZSB0cmlnZ2VyZWQgYnkgdGhlIGdpdmVuIGBuYW1lYC5cblxuICAgICA+IEFyZ3VtZW50c1xuXG4gICAgIC0gbmFtZSAoc3RyaW5nKSBuYW1lIG9mIHRoZSBldmVudCwgZG90IChgLmApIG9yIHNsYXNoIChgL2ApIHNlcGFyYXRlZFxuXG4gICAgID0gKGFycmF5KSBhcnJheSBvZiBldmVudCBoYW5kbGVyc1xuICAgIFxcKi9cbiAgICBldmUubGlzdGVuZXJzID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgdmFyIG5hbWVzID0gbmFtZS5zcGxpdChzZXBhcmF0b3IpLFxuICAgICAgICAgICAgZSA9IGV2ZW50cyxcbiAgICAgICAgICAgIGl0ZW0sXG4gICAgICAgICAgICBpdGVtcyxcbiAgICAgICAgICAgIGssXG4gICAgICAgICAgICBpLFxuICAgICAgICAgICAgaWksXG4gICAgICAgICAgICBqLFxuICAgICAgICAgICAgamosXG4gICAgICAgICAgICBuZXMsXG4gICAgICAgICAgICBlcyA9IFtlXSxcbiAgICAgICAgICAgIG91dCA9IFtdO1xuICAgICAgICBmb3IgKGkgPSAwLCBpaSA9IG5hbWVzLmxlbmd0aDsgaSA8IGlpOyBpKyspIHtcbiAgICAgICAgICAgIG5lcyA9IFtdO1xuICAgICAgICAgICAgZm9yIChqID0gMCwgamogPSBlcy5sZW5ndGg7IGogPCBqajsgaisrKSB7XG4gICAgICAgICAgICAgICAgZSA9IGVzW2pdLm47XG4gICAgICAgICAgICAgICAgaXRlbXMgPSBbZVtuYW1lc1tpXV0sIGVbd2lsZGNhcmRdXTtcbiAgICAgICAgICAgICAgICBrID0gMjtcbiAgICAgICAgICAgICAgICB3aGlsZSAoay0tKSB7XG4gICAgICAgICAgICAgICAgICAgIGl0ZW0gPSBpdGVtc1trXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGl0ZW0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5lcy5wdXNoKGl0ZW0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgb3V0ID0gb3V0LmNvbmNhdChpdGVtLmYgfHwgW10pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZXMgPSBuZXM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG91dDtcbiAgICB9O1xuICAgIFxuICAgIC8qXFxcbiAgICAgKiBldmUub25cbiAgICAgWyBtZXRob2QgXVxuICAgICAqKlxuICAgICAqIEJpbmRzIGdpdmVuIGV2ZW50IGhhbmRsZXIgd2l0aCBhIGdpdmVuIG5hbWUuIFlvdSBjYW4gdXNlIHdpbGRjYXJkcyDigJxgKmDigJ0gZm9yIHRoZSBuYW1lczpcbiAgICAgfCBldmUub24oXCIqLnVuZGVyLipcIiwgZik7XG4gICAgIHwgZXZlKFwibW91c2UudW5kZXIuZmxvb3JcIik7IC8vIHRyaWdnZXJzIGZcbiAgICAgKiBVc2UgQGV2ZSB0byB0cmlnZ2VyIHRoZSBsaXN0ZW5lci5cbiAgICAgKipcbiAgICAgPiBBcmd1bWVudHNcbiAgICAgKipcbiAgICAgLSBuYW1lIChzdHJpbmcpIG5hbWUgb2YgdGhlIGV2ZW50LCBkb3QgKGAuYCkgb3Igc2xhc2ggKGAvYCkgc2VwYXJhdGVkLCB3aXRoIG9wdGlvbmFsIHdpbGRjYXJkc1xuICAgICAtIGYgKGZ1bmN0aW9uKSBldmVudCBoYW5kbGVyIGZ1bmN0aW9uXG4gICAgICoqXG4gICAgID0gKGZ1bmN0aW9uKSByZXR1cm5lZCBmdW5jdGlvbiBhY2NlcHRzIGEgc2luZ2xlIG51bWVyaWMgcGFyYW1ldGVyIHRoYXQgcmVwcmVzZW50cyB6LWluZGV4IG9mIHRoZSBoYW5kbGVyLiBJdCBpcyBhbiBvcHRpb25hbCBmZWF0dXJlIGFuZCBvbmx5IHVzZWQgd2hlbiB5b3UgbmVlZCB0byBlbnN1cmUgdGhhdCBzb21lIHN1YnNldCBvZiBoYW5kbGVycyB3aWxsIGJlIGludm9rZWQgaW4gYSBnaXZlbiBvcmRlciwgZGVzcGl0ZSBvZiB0aGUgb3JkZXIgb2YgYXNzaWdubWVudC4gXG4gICAgID4gRXhhbXBsZTpcbiAgICAgfCBldmUub24oXCJtb3VzZVwiLCBlYXRJdCkoMik7XG4gICAgIHwgZXZlLm9uKFwibW91c2VcIiwgc2NyZWFtKTtcbiAgICAgfCBldmUub24oXCJtb3VzZVwiLCBjYXRjaEl0KSgxKTtcbiAgICAgKiBUaGlzIHdpbGwgZW5zdXJlIHRoYXQgYGNhdGNoSXQoKWAgZnVuY3Rpb24gd2lsbCBiZSBjYWxsZWQgYmVmb3JlIGBlYXRJdCgpYC5cblx0ICpcbiAgICAgKiBJZiB5b3Ugd2FudCB0byBwdXQgeW91ciBoYW5kbGVyIGJlZm9yZSBub24taW5kZXhlZCBoYW5kbGVycywgc3BlY2lmeSBhIG5lZ2F0aXZlIHZhbHVlLlxuICAgICAqIE5vdGU6IEkgYXNzdW1lIG1vc3Qgb2YgdGhlIHRpbWUgeW91IGRvbuKAmXQgbmVlZCB0byB3b3JyeSBhYm91dCB6LWluZGV4LCBidXQgaXTigJlzIG5pY2UgdG8gaGF2ZSB0aGlzIGZlYXR1cmUg4oCcanVzdCBpbiBjYXNl4oCdLlxuICAgIFxcKi9cbiAgICBldmUub24gPSBmdW5jdGlvbiAobmFtZSwgZikge1xuXHRcdG5hbWUgPSBTdHJpbmcobmFtZSk7XG5cdFx0aWYgKHR5cGVvZiBmICE9IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0cmV0dXJuIGZ1bmN0aW9uICgpIHt9O1xuXHRcdH1cbiAgICAgICAgdmFyIG5hbWVzID0gbmFtZS5zcGxpdChzZXBhcmF0b3IpLFxuICAgICAgICAgICAgZSA9IGV2ZW50cztcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIGlpID0gbmFtZXMubGVuZ3RoOyBpIDwgaWk7IGkrKykge1xuICAgICAgICAgICAgZSA9IGUubjtcbiAgICAgICAgICAgIGUgPSBlLmhhc093blByb3BlcnR5KG5hbWVzW2ldKSAmJiBlW25hbWVzW2ldXSB8fCAoZVtuYW1lc1tpXV0gPSB7bjoge319KTtcbiAgICAgICAgfVxuICAgICAgICBlLmYgPSBlLmYgfHwgW107XG4gICAgICAgIGZvciAoaSA9IDAsIGlpID0gZS5mLmxlbmd0aDsgaSA8IGlpOyBpKyspIGlmIChlLmZbaV0gPT0gZikge1xuICAgICAgICAgICAgcmV0dXJuIGZ1bjtcbiAgICAgICAgfVxuICAgICAgICBlLmYucHVzaChmKTtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICh6SW5kZXgpIHtcbiAgICAgICAgICAgIGlmICgrekluZGV4ID09ICt6SW5kZXgpIHtcbiAgICAgICAgICAgICAgICBmLnpJbmRleCA9ICt6SW5kZXg7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfTtcbiAgICAvKlxcXG4gICAgICogZXZlLmZcbiAgICAgWyBtZXRob2QgXVxuICAgICAqKlxuICAgICAqIFJldHVybnMgZnVuY3Rpb24gdGhhdCB3aWxsIGZpcmUgZ2l2ZW4gZXZlbnQgd2l0aCBvcHRpb25hbCBhcmd1bWVudHMuXG5cdCAqIEFyZ3VtZW50cyB0aGF0IHdpbGwgYmUgcGFzc2VkIHRvIHRoZSByZXN1bHQgZnVuY3Rpb24gd2lsbCBiZSBhbHNvXG5cdCAqIGNvbmNhdGVkIHRvIHRoZSBsaXN0IG9mIGZpbmFsIGFyZ3VtZW50cy5cbiBcdCB8IGVsLm9uY2xpY2sgPSBldmUuZihcImNsaWNrXCIsIDEsIDIpO1xuIFx0IHwgZXZlLm9uKFwiY2xpY2tcIiwgZnVuY3Rpb24gKGEsIGIsIGMpIHtcbiBcdCB8ICAgICBjb25zb2xlLmxvZyhhLCBiLCBjKTsgLy8gMSwgMiwgW2V2ZW50IG9iamVjdF1cbiBcdCB8IH0pO1xuICAgICA+IEFyZ3VtZW50c1xuXHQgLSBldmVudCAoc3RyaW5nKSBldmVudCBuYW1lXG5cdCAtIHZhcmFyZ3MgKOKApikgYW5kIGFueSBvdGhlciBhcmd1bWVudHNcblx0ID0gKGZ1bmN0aW9uKSBwb3NzaWJsZSBldmVudCBoYW5kbGVyIGZ1bmN0aW9uXG4gICAgXFwqL1xuXHRldmUuZiA9IGZ1bmN0aW9uIChldmVudCkge1xuXHRcdHZhciBhdHRycyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcblx0XHRyZXR1cm4gZnVuY3Rpb24gKCkge1xuXHRcdFx0ZXZlLmFwcGx5KG51bGwsIFtldmVudCwgbnVsbF0uY29uY2F0KGF0dHJzKS5jb25jYXQoW10uc2xpY2UuY2FsbChhcmd1bWVudHMsIDApKSk7XG5cdFx0fTtcblx0fTtcbiAgICAvKlxcXG4gICAgICogZXZlLnN0b3BcbiAgICAgWyBtZXRob2QgXVxuICAgICAqKlxuICAgICAqIElzIHVzZWQgaW5zaWRlIGFuIGV2ZW50IGhhbmRsZXIgdG8gc3RvcCB0aGUgZXZlbnQsIHByZXZlbnRpbmcgYW55IHN1YnNlcXVlbnQgbGlzdGVuZXJzIGZyb20gZmlyaW5nLlxuICAgIFxcKi9cbiAgICBldmUuc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgc3RvcCA9IDE7XG4gICAgfTtcbiAgICAvKlxcXG4gICAgICogZXZlLm50XG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKipcbiAgICAgKiBDb3VsZCBiZSB1c2VkIGluc2lkZSBldmVudCBoYW5kbGVyIHRvIGZpZ3VyZSBvdXQgYWN0dWFsIG5hbWUgb2YgdGhlIGV2ZW50LlxuICAgICAqKlxuICAgICA+IEFyZ3VtZW50c1xuICAgICAqKlxuICAgICAtIHN1Ym5hbWUgKHN0cmluZykgI29wdGlvbmFsIHN1Ym5hbWUgb2YgdGhlIGV2ZW50XG4gICAgICoqXG4gICAgID0gKHN0cmluZykgbmFtZSBvZiB0aGUgZXZlbnQsIGlmIGBzdWJuYW1lYCBpcyBub3Qgc3BlY2lmaWVkXG4gICAgICogb3JcbiAgICAgPSAoYm9vbGVhbikgYHRydWVgLCBpZiBjdXJyZW50IGV2ZW504oCZcyBuYW1lIGNvbnRhaW5zIGBzdWJuYW1lYFxuICAgIFxcKi9cbiAgICBldmUubnQgPSBmdW5jdGlvbiAoc3VibmFtZSkge1xuICAgICAgICBpZiAoc3VibmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBSZWdFeHAoXCIoPzpcXFxcLnxcXFxcL3xeKVwiICsgc3VibmFtZSArIFwiKD86XFxcXC58XFxcXC98JClcIikudGVzdChjdXJyZW50X2V2ZW50KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY3VycmVudF9ldmVudDtcbiAgICB9O1xuICAgIC8qXFxcbiAgICAgKiBldmUubnRzXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKipcbiAgICAgKiBDb3VsZCBiZSB1c2VkIGluc2lkZSBldmVudCBoYW5kbGVyIHRvIGZpZ3VyZSBvdXQgYWN0dWFsIG5hbWUgb2YgdGhlIGV2ZW50LlxuICAgICAqKlxuICAgICAqKlxuICAgICA9IChhcnJheSkgbmFtZXMgb2YgdGhlIGV2ZW50XG4gICAgXFwqL1xuICAgIGV2ZS5udHMgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBjdXJyZW50X2V2ZW50LnNwbGl0KHNlcGFyYXRvcik7XG4gICAgfTtcbiAgICAvKlxcXG4gICAgICogZXZlLm9mZlxuICAgICBbIG1ldGhvZCBdXG4gICAgICoqXG4gICAgICogUmVtb3ZlcyBnaXZlbiBmdW5jdGlvbiBmcm9tIHRoZSBsaXN0IG9mIGV2ZW50IGxpc3RlbmVycyBhc3NpZ25lZCB0byBnaXZlbiBuYW1lLlxuXHQgKiBJZiBubyBhcmd1bWVudHMgc3BlY2lmaWVkIGFsbCB0aGUgZXZlbnRzIHdpbGwgYmUgY2xlYXJlZC5cbiAgICAgKipcbiAgICAgPiBBcmd1bWVudHNcbiAgICAgKipcbiAgICAgLSBuYW1lIChzdHJpbmcpIG5hbWUgb2YgdGhlIGV2ZW50LCBkb3QgKGAuYCkgb3Igc2xhc2ggKGAvYCkgc2VwYXJhdGVkLCB3aXRoIG9wdGlvbmFsIHdpbGRjYXJkc1xuICAgICAtIGYgKGZ1bmN0aW9uKSBldmVudCBoYW5kbGVyIGZ1bmN0aW9uXG4gICAgXFwqL1xuICAgIC8qXFxcbiAgICAgKiBldmUudW5iaW5kXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKipcbiAgICAgKiBTZWUgQGV2ZS5vZmZcbiAgICBcXCovXG4gICAgZXZlLm9mZiA9IGV2ZS51bmJpbmQgPSBmdW5jdGlvbiAobmFtZSwgZikge1xuXHRcdGlmICghbmFtZSkge1xuXHRcdCAgICBldmUuX2V2ZW50cyA9IGV2ZW50cyA9IHtuOiB7fX07XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuICAgICAgICB2YXIgbmFtZXMgPSBuYW1lLnNwbGl0KHNlcGFyYXRvciksXG4gICAgICAgICAgICBlLFxuICAgICAgICAgICAga2V5LFxuICAgICAgICAgICAgc3BsaWNlLFxuICAgICAgICAgICAgaSwgaWksIGosIGpqLFxuICAgICAgICAgICAgY3VyID0gW2V2ZW50c107XG4gICAgICAgIGZvciAoaSA9IDAsIGlpID0gbmFtZXMubGVuZ3RoOyBpIDwgaWk7IGkrKykge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGN1ci5sZW5ndGg7IGogKz0gc3BsaWNlLmxlbmd0aCAtIDIpIHtcbiAgICAgICAgICAgICAgICBzcGxpY2UgPSBbaiwgMV07XG4gICAgICAgICAgICAgICAgZSA9IGN1cltqXS5uO1xuICAgICAgICAgICAgICAgIGlmIChuYW1lc1tpXSAhPSB3aWxkY2FyZCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZVtuYW1lc1tpXV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNwbGljZS5wdXNoKGVbbmFtZXNbaV1dKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoa2V5IGluIGUpIGlmIChlW2hhc10oa2V5KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3BsaWNlLnB1c2goZVtrZXldKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjdXIuc3BsaWNlLmFwcGx5KGN1ciwgc3BsaWNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKGkgPSAwLCBpaSA9IGN1ci5sZW5ndGg7IGkgPCBpaTsgaSsrKSB7XG4gICAgICAgICAgICBlID0gY3VyW2ldO1xuICAgICAgICAgICAgd2hpbGUgKGUubikge1xuICAgICAgICAgICAgICAgIGlmIChmKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlLmYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaiA9IDAsIGpqID0gZS5mLmxlbmd0aDsgaiA8IGpqOyBqKyspIGlmIChlLmZbal0gPT0gZikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUuZi5zcGxpY2UoaiwgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAhZS5mLmxlbmd0aCAmJiBkZWxldGUgZS5mO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGZvciAoa2V5IGluIGUubikgaWYgKGUubltoYXNdKGtleSkgJiYgZS5uW2tleV0uZikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGZ1bmNzID0gZS5uW2tleV0uZjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaiA9IDAsIGpqID0gZnVuY3MubGVuZ3RoOyBqIDwgamo7IGorKykgaWYgKGZ1bmNzW2pdID09IGYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmdW5jcy5zcGxpY2UoaiwgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAhZnVuY3MubGVuZ3RoICYmIGRlbGV0ZSBlLm5ba2V5XS5mO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGUuZjtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChrZXkgaW4gZS5uKSBpZiAoZS5uW2hhc10oa2V5KSAmJiBlLm5ba2V5XS5mKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgZS5uW2tleV0uZjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlID0gZS5uO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbiAgICAvKlxcXG4gICAgICogZXZlLm9uY2VcbiAgICAgWyBtZXRob2QgXVxuICAgICAqKlxuICAgICAqIEJpbmRzIGdpdmVuIGV2ZW50IGhhbmRsZXIgd2l0aCBhIGdpdmVuIG5hbWUgdG8gb25seSBydW4gb25jZSB0aGVuIHVuYmluZCBpdHNlbGYuXG4gICAgIHwgZXZlLm9uY2UoXCJsb2dpblwiLCBmKTtcbiAgICAgfCBldmUoXCJsb2dpblwiKTsgLy8gdHJpZ2dlcnMgZlxuICAgICB8IGV2ZShcImxvZ2luXCIpOyAvLyBubyBsaXN0ZW5lcnNcbiAgICAgKiBVc2UgQGV2ZSB0byB0cmlnZ2VyIHRoZSBsaXN0ZW5lci5cbiAgICAgKipcbiAgICAgPiBBcmd1bWVudHNcbiAgICAgKipcbiAgICAgLSBuYW1lIChzdHJpbmcpIG5hbWUgb2YgdGhlIGV2ZW50LCBkb3QgKGAuYCkgb3Igc2xhc2ggKGAvYCkgc2VwYXJhdGVkLCB3aXRoIG9wdGlvbmFsIHdpbGRjYXJkc1xuICAgICAtIGYgKGZ1bmN0aW9uKSBldmVudCBoYW5kbGVyIGZ1bmN0aW9uXG4gICAgICoqXG4gICAgID0gKGZ1bmN0aW9uKSBzYW1lIHJldHVybiBmdW5jdGlvbiBhcyBAZXZlLm9uXG4gICAgXFwqL1xuICAgIGV2ZS5vbmNlID0gZnVuY3Rpb24gKG5hbWUsIGYpIHtcbiAgICAgICAgdmFyIGYyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZXZlLnVuYmluZChuYW1lLCBmMik7XG4gICAgICAgICAgICByZXR1cm4gZi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gZXZlLm9uKG5hbWUsIGYyKTtcbiAgICB9O1xuICAgIC8qXFxcbiAgICAgKiBldmUudmVyc2lvblxuICAgICBbIHByb3BlcnR5IChzdHJpbmcpIF1cbiAgICAgKipcbiAgICAgKiBDdXJyZW50IHZlcnNpb24gb2YgdGhlIGxpYnJhcnkuXG4gICAgXFwqL1xuICAgIGV2ZS52ZXJzaW9uID0gdmVyc2lvbjtcbiAgICBldmUudG9TdHJpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBcIllvdSBhcmUgcnVubmluZyBFdmUgXCIgKyB2ZXJzaW9uO1xuICAgIH07XG4gICAgKHR5cGVvZiBtb2R1bGUgIT0gXCJ1bmRlZmluZWRcIiAmJiBtb2R1bGUuZXhwb3J0cykgPyAobW9kdWxlLmV4cG9ydHMgPSBldmUpIDogKHR5cGVvZiBkZWZpbmUgIT0gXCJ1bmRlZmluZWRcIiA/IChkZWZpbmUoXCJldmVcIiwgW10sIGZ1bmN0aW9uKCkgeyByZXR1cm4gZXZlOyB9KSkgOiAoZ2xvYi5ldmUgPSBldmUpKTtcbn0pKHRoaXMpO1xuIiwidmFyIF8gPSByZXF1aXJlKCcuLi8uLi8zcmRwYXJ0eS91bmRlcnNjb3JlLW1pbicpO1xuXG52YXIgaW1hZ2VzID0gW1xuICAnYmFsbCcsXG4gICdib29tLWNpcmNsZScsICdib29tLWxpbmUnLCAnYm9vbS1zcGxhc2gnLFxuICAnY2F0JywgJ2NhdC1kb3duJywgJ2NhdC11cCcsXG4gICdjb25lJyxcbiAgJ2RvZycsICdkb2ctZG93bicsICdkb2ctdXAnLFxuICAnZW5kLWRyYXcnLCAnZW5kLXdpbm5lcicsXG4gICdpbnRyby1hYm91dCcsICdpbnRyby1sZWFkZXJib2FyZCcsICdpbnRyby10aXRsZScsXG4gICdwYXJ0aWNsZS1iYWxsJyxcbiAgJ3N0YWRpdW0nLCAnc3RhZGl1bS1zaGFrZS1sZWZ0JywgJ3N0YWRpdW0tc2hha2UtcmlnaHQnLFxuICAnaW50cm8tdGl0bGUnXG5dLnJlZHVjZShpbWFnZVBhdGgsIHt9KTtcblxudmFyIHNvdW5kcyA9IFtcbiAgJ2JvdW5jZScsXG4gICdjcm93ZCcsICdjcm93ZC1lbmQnLCAnY3Jvd2Qtb2gnLCAnY3Jvd2Qtb3JnYW4nLCAnY3Jvd2Qtc2NvcmVkJyxcbiAgJ2ludHJvJywgJ211bHRpYmFsbCcsICdzYXgnLCAnd2hpc3RsZSdcbl0ucmVkdWNlKHNvdW5kUGF0aCwge30pO1xuXG5mdW5jdGlvbiBpbWFnZVBhdGgoYWNjLCBuYW1lKSB7XG4gIGFjY1tuYW1lXSA9ICcvZ2FtZS9pbWFnZXMvJyArIG5hbWUgKyAnLnBuZyc7XG4gIHJldHVybiBhY2M7XG59XG5cbmZ1bmN0aW9uIHNvdW5kUGF0aChhY2MsIG5hbWUpIHtcbiAgYWNjW25hbWVdID0gJy9nYW1lL3NvdW5kcy8nICsgbmFtZSArICcubXAzJztcbiAgcmV0dXJuIGFjYztcbn1cblxuZXhwb3J0cy5pbWFnZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgcmV0dXJuIGltYWdlc1tuYW1lXTtcbn07XG5cbmV4cG9ydHMuaW1hZ2VzID0gZnVuY3Rpb24oLyp2YXJhcmdzKi8pIHtcbiAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5hcHBseShhcmd1bWVudHMpLm1hcChmdW5jdGlvbihuYW1lKSB7XG4gICAgcmV0dXJuIGltYWdlc1tuYW1lXTtcbiAgfSlcbn07XG5cbmV4cG9ydHMuYWxsSW1hZ2VzID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBfLnZhbHVlcyhpbWFnZXMpO1xufVxuXG5leHBvcnRzLnNvdW5kID0gZnVuY3Rpb24obmFtZSkge1xuICByZXR1cm4gc291bmRzW25hbWVdO1xufTtcbiIsInZhciB1c2VySW50ZXJmYWNlICAgPSByZXF1aXJlKCcuL3VzZXItaW50ZXJmYWNlJyk7XG52YXIgd29ybGQyICAgICAgICAgID0gcmVxdWlyZSgnLi93b3JsZCcpO1xuXG5mdW5jdGlvbiBHcmFwaGljc0VuZ2luZSh3b3JsZCwgZ2FtZVZpZXcsIGRlYnVnVmlldykge1xuICB0aGlzLnJlbmRlcmVyICAgICA9IFBJWEkuYXV0b0RldGVjdFJlbmRlcmVyKGdhbWVWaWV3LndpZHRoLCBnYW1lVmlldy5oZWlnaHQsIGdhbWVWaWV3KTtcbiAgdGhpcy5zdGFnZSAgICAgICAgPSBuZXcgUElYSS5TdGFnZSgpO1xuICB0aGlzLnZpZXcgICAgICAgICA9IHRoaXMucmVuZGVyZXIudmlldztcbiAgdGhpcy5kZWJ1Z1ZpZXcgICAgPSBkZWJ1Z1ZpZXc7XG4gIFxuICB2YXIgd29ybGRSYXRpbyAgPSB3b3JsZC53aWR0aCAvIHdvcmxkLmhlaWdodDtcbiAgdmFyIHNjcmVlblJhdGlvID0gZ2FtZVZpZXcud2lkdGggLyBnYW1lVmlldy5oZWlnaHQ7XG4gIFxuICB2YXIgd2lkdGgsIGhlaWdodDtcbiAgaWYgKHNjcmVlblJhdGlvID4gd29ybGRSYXRpbykge1xuICAgIHdpZHRoICA9IE1hdGguZmxvb3IoZ2FtZVZpZXcuaGVpZ2h0ICogd29ybGRSYXRpbyk7XG4gICAgaGVpZ2h0ID0gZ2FtZVZpZXcuaGVpZ2h0O1xuICB9IGVsc2Uge1xuICAgIHdpZHRoICA9IGdhbWVWaWV3LndpZHRoO1xuICAgIGhlaWdodCA9IE1hdGguZmxvb3IoZ2FtZVZpZXcud2lkdGggLyB3b3JsZFJhdGlvKTtcbiAgfVxuICBcbiAgZ2FtZVZpZXcud2lkdGggID0gZGVidWdWaWV3LndpZHRoICA9IHdpZHRoO1xuICBnYW1lVmlldy5oZWlnaHQgPSBkZWJ1Z1ZpZXcuaGVpZ2h0ID0gaGVpZ2h0XG4gIHVzZXJJbnRlcmZhY2UucmVzaXplKGdhbWVWaWV3LndpZHRoLCBnYW1lVmlldy5oZWlnaHQpO1xuICB0aGlzLnJlbmRlcmVyLnJlc2l6ZShnYW1lVmlldy53aWR0aCwgZ2FtZVZpZXcuaGVpZ2h0KTtcbiAgXG4gIHdvcmxkMi5zZXRQaXhlbHNQZXJNZXRlcihNYXRoLmZsb29yKGdhbWVWaWV3LmhlaWdodCAvIHdvcmxkLmhlaWdodCkpO1xufVxuXG5HcmFwaGljc0VuZ2luZS5wcm90b3R5cGUucmVuZGVyID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMucmVuZGVyZXIucmVuZGVyKHRoaXMuc3RhZ2UpO1xufTtcblxuR3JhcGhpY3NFbmdpbmUucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uKHNwcml0ZSkge1xuICB0aGlzLnN0YWdlLmFkZENoaWxkKHNwcml0ZSk7XG59O1xuXG5HcmFwaGljc0VuZ2luZS5wcm90b3R5cGUucmVtb3ZlID0gZnVuY3Rpb24oc3ByaXRlKSB7XG4gIHRoaXMuc3RhZ2UucmVtb3ZlQ2hpbGQoc3ByaXRlKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gR3JhcGhpY3NFbmdpbmU7XG4iLCJ2YXIgd29ybGQgPSByZXF1aXJlKCcuL3dvcmxkJyk7XG5cbnZhciBmcmFtZVJhdGUgICA9IDEgLyA2MDtcbnZhciBpdGVyYXRpb25zICA9IDEwO1xuXG52YXIgbm9ybWFsaXNlTmFuID0gZnVuY3Rpb24obikge1xuICByZXR1cm4gbiB8fCAwXG59XG5cbnZhciBub3JtYWxpc2VQb2ludCA9IGZ1bmN0aW9uKHApIHtcbiAgcmV0dXJuIHsgeDogbm9ybWFsaXNlTmFuKHAueCksIHk6IG5vcm1hbGlzZU5hbihwLnkpIH1cbn1cblxuZnVuY3Rpb24gUGh5c2ljc0VuZ2luZShkZWJ1Z0NhbnZhcykge1xuICBcbiAgdGhpcy5jb2xsaXNpb25DYWxsYmFjayA9IG51bGw7XG4gIHRoaXMuYjJ3b3JsZCA9IG5ldyBCb3gyRC5EeW5hbWljcy5iMldvcmxkKG5ldyBCb3gyRC5Db21tb24uTWF0aC5iMlZlYzIoMCwgMCksIHRydWUpO1xuICBcbiAgdmFyIGNvbnRhY3RMaXN0ZW5lciA9IG5ldyBCb3gyRC5EeW5hbWljcy5iMkNvbnRhY3RMaXN0ZW5lcjtcbiAgXG4gIGNvbnRhY3RMaXN0ZW5lci5CZWdpbkNvbnRhY3QgPSBmdW5jdGlvbihjb250YWN0KSB7XG4gICAgdmFyIHdvcmxkTWFuaWZvbGQgPSBuZXcgQm94MkQuQ29sbGlzaW9uLmIyV29ybGRNYW5pZm9sZCgpO1xuICAgIGNvbnRhY3QuR2V0V29ybGRNYW5pZm9sZCh3b3JsZE1hbmlmb2xkKTtcbiAgICB2YXIgZml4dHVyZUEgPSBjb250YWN0LkdldEZpeHR1cmVBKCk7XG4gICAgdmFyIGZpeHR1cmVCID0gY29udGFjdC5HZXRGaXh0dXJlQigpO1xuICAgIGlmICh0aGlzLmNvbGxpc2lvbkNhbGxiYWNrKSB7XG4gICAgICB0aGlzLmNvbGxpc2lvbkNhbGxiYWNrKGZpeHR1cmVBLCBmaXh0dXJlQiwgd29ybGRNYW5pZm9sZC5tX3BvaW50cy5tYXAobm9ybWFsaXNlUG9pbnQpKTtcbiAgICB9XG4gIH0uYmluZCh0aGlzKTtcbiAgXG4gIHRoaXMuYjJ3b3JsZC5TZXRDb250YWN0TGlzdGVuZXIoY29udGFjdExpc3RlbmVyKTtcbiAgXG4gIGlmIChkZWJ1Z0NhbnZhcykge1xuICAgIHRoaXMuZGVidWdEcmF3KGRlYnVnQ2FudmFzKTtcbiAgfVxufVxuXG5QaHlzaWNzRW5naW5lLnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbihib2R5RGVmLCBmaXh0dXJlRGVmKSB7XG4gIHZhciBib2R5ID0gdGhpcy5iMndvcmxkLkNyZWF0ZUJvZHkoYm9keURlZik7XG4gIGlmIChmaXh0dXJlRGVmKSB7XG4gICAgYm9keS5DcmVhdGVGaXh0dXJlKGZpeHR1cmVEZWYpOyAgICBcbiAgfVxuICByZXR1cm4gYm9keTtcbn07XG5cblBoeXNpY3NFbmdpbmUucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbihib2R5KSB7XG4gIGJvZHkuR2V0Rml4dHVyZUxpc3QoKS5TZXRVc2VyRGF0YShudWxsKTtcbiAgdGhpcy5iMndvcmxkLkRlc3Ryb3lCb2R5KGJvZHkpO1xufTtcblxuUGh5c2ljc0VuZ2luZS5wcm90b3R5cGUuY29sbGlzaW9uID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgdGhpcy5jb2xsaXNpb25DYWxsYmFjayA9IGNhbGxiYWNrO1xufVxuXG5QaHlzaWNzRW5naW5lLnByb3RvdHlwZS5kZWJ1Z0RyYXcgPSBmdW5jdGlvbihjYW52YXMpIHtcbiAgdmFyIGRlYnVnRHJhdyA9IG5ldyBCb3gyRC5EeW5hbWljcy5iMkRlYnVnRHJhdygpO1xuICBkZWJ1Z0RyYXcuU2V0U3ByaXRlKGNhbnZhcy5nZXRDb250ZXh0KFwiMmRcIikpO1xuICBkZWJ1Z0RyYXcuU2V0RHJhd1NjYWxlKHdvcmxkLmdldFBpeGVsc1Blck1ldGVyKCkpO1xuICBkZWJ1Z0RyYXcuU2V0RmlsbEFscGhhKDAuMyk7XG4gIGRlYnVnRHJhdy5TZXRMaW5lVGhpY2tuZXNzKDEuMCk7XG4gIGRlYnVnRHJhdy5TZXRGbGFncyhCb3gyRC5EeW5hbWljcy5iMkRlYnVnRHJhdy5lX3NoYXBlQml0IHwgQm94MkQuRHluYW1pY3MuYjJEZWJ1Z0RyYXcuZV9qb2ludEJpdCk7XG4gIHRoaXMuYjJ3b3JsZC5TZXREZWJ1Z0RyYXcoZGVidWdEcmF3KTtcbn1cblxuUGh5c2ljc0VuZ2luZS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuYjJ3b3JsZC5TdGVwKGZyYW1lUmF0ZSwgaXRlcmF0aW9ucywgaXRlcmF0aW9ucyk7XG4gIHRoaXMuYjJ3b3JsZC5EcmF3RGVidWdEYXRhKCk7XG4gIHRoaXMuYjJ3b3JsZC5DbGVhckZvcmNlcygpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBQaHlzaWNzRW5naW5lO1xuIiwidmFyIF8gICAgID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvdW5kZXJzY29yZS1taW4nKTtcbnZhciBodWIgICA9IHJlcXVpcmUoJy4vaHViJyk7XG5cbmZ1bmN0aW9uIFNvdW5kKCkge1xuICBcbiAgdmFyIGN1cnJlbnQgPSB7fTtcbiAgXG4gIGZ1bmN0aW9uIHBsYXkoYXJncykge1xuICAgIHZhciBzb3VuZCA9IG5ldyBBdWRpbygpO1xuICAgIGN1cnJlbnRbYXJncy5maWxlXSA9IHNvdW5kO1xuICAgIHNvdW5kLnNyYyA9IGFyZ3MuZmlsZTtcbiAgICBpZiAoYXJncy52b2x1bWUgIT09IHVuZGVmaW5lZCkgeyBzb3VuZC52b2x1bWUgPSBhcmdzLnZvbHVtZTsgfVxuICAgIGlmIChhcmdzLmxvb3ApICAgICAgICAgICAgICAgICB7IHNvdW5kLmxvb3AgPSB0cnVlOyB9XG4gICAgc291bmQucGxheSgpO1xuICAgIHJldHVybiBzb3VuZDtcbiAgfTtcbiBcbiAgZnVuY3Rpb24gc3RvcChhcmdzKSB7XG4gICAgaWYgKGN1cnJlbnRbYXJncy5maWxlXSkge1xuICAgICAgY3VycmVudFthcmdzLmZpbGVdLnBhdXNlKCk7XG4gICAgICBkZWxldGUgY3VycmVudFthcmdzLmZpbGVdO1xuICAgIH1cbiAgfVxuIFxuICBodWIub24oJ2VuZ2luZS5zb3VuZC5wbGF5JywgcGxheSk7XG4gIGh1Yi5vbignZW5naW5lLnNvdW5kLnN0b3AnLCBzdG9wKTtcbiAgXG59XG5cbm1vZHVsZS5leHBvcnRzID0gU291bmQ7XG4iLCJ2YXIgXyAgICAgICAgPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS91bmRlcnNjb3JlLW1pbicpO1xudmFyIGh1YiAgICAgID0gcmVxdWlyZSgnLi9odWInKTtcbnZhciBFeHBsb3Npb24gPSByZXF1aXJlKCcuL2V4cGxvc2lvbicpXG5cbnZhciBQYXJ0aWNsZUVuZ2luZSA9IGZ1bmN0aW9uKGVuZ2luZSkge1xuICBodWIub24oJ2VuZ2luZS5leHBsb3Npb24nLCBmdW5jdGlvbihwYXJhbXMpIHtcbiAgICBlbmdpbmUuYWRkRW50aXR5KEV4cGxvc2lvbltwYXJhbXMuc2l6ZSB8fCAnc21hbGwnXShwYXJhbXMuc291cmNlKSlcbiAgfSlcbiAgXG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFBhcnRpY2xlRW5naW5lO1xuIiwidmFyIF8gPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS91bmRlcnNjb3JlLW1pbicpO1xuXG5mdW5jdGlvbiBTZXF1ZW5jZXIoZW5naW5lLCBnYW1lLCBzdGF0ZXMsIHRyYW5zaXRpb25zKSB7XG4gICAgXG4gIHZhciBzdGF0ZXMgPSBfLnJlZHVjZShzdGF0ZXMsIGZ1bmN0aW9uKGFjYywgZm4sIGtleSkge1xuICAgIGFjY1trZXldID0gbmV3IGZuKGVuZ2luZSwgZ2FtZSk7XG4gICAgcmV0dXJuIGFjYztcbiAgfSwge30pO1xuICBcbiAgdmFyIHRoYXQgPSB0aGlzO1xuICB0aGlzLmFjdGl2ZVN0YXRlID0gbnVsbDtcbiAgXG4gIHRoaXMuZnNtID0gd2luZG93LlN0YXRlTWFjaGluZS5jcmVhdGUoe1xuICBcbiAgICBldmVudHM6IHRyYW5zaXRpb25zLFxuICBcbiAgICBjYWxsYmFja3M6IHtcbiAgICAgIG9uZW50ZXJzdGF0ZTogZnVuY3Rpb24odHJhbnNpdGlvbiwgc3RhcnQsIGVuZCwgYXJncykge1xuICAgICAgICBjb25zb2xlLmxvZygnW3NlcXVlbmNlcl0gJyArIHN0YXJ0ICsgJyArICcgKyB0cmFuc2l0aW9uICsgJyA9ICcgKyBlbmQpO1xuICAgICAgICBzdGF0ZXNbc3RhcnRdICYmIHN0YXRlc1tzdGFydF0uZXhpdCgpO1xuICAgICAgICBzdGF0ZXNbZW5kXSAgICYmIHN0YXRlc1tlbmRdLmVudGVyKGFyZ3MpO1xuICAgICAgICB0aGF0LmFjdGl2ZVN0YXRlID0gc3RhdGVzW2VuZF07XG4gICAgICB9XG4gICAgfSxcbiAgICBcbiAgICAvLyBlcnJvcjogZnVuY3Rpb24oZXZlbnROYW1lLCBmcm9tLCB0bywgYXJncywgZXJyb3JDb2RlLCBlcnJvck1lc3NhZ2UpIHtcbiAgICAvLyAgIGlmIChlcnJvckNvZGUgPT09IFN0YXRlTWFjaGluZS5FcnJvci5JTlZBTElEX0NBTExCQUNLKSB7XG4gICAgLy8gICAgIHRocm93IGVycm9yTWVzc2FnZTtcbiAgICAvLyAgIH0gZWxzZSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKCdbc2VxdWVuY2VyXSAnICsgZXZlbnROYW1lICsgJyA6ICcgKyBlcnJvck1lc3NhZ2UpO1xuICAgIC8vICAgfVxuICAgIC8vIH0sXG4gIFxuICB9KTtcbiAgXG59XG5cblNlcXVlbmNlci5wcm90b3R5cGUuc3RhcnQgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5mc20uc3RhcnR1cCgpO1xufTtcblxuU2VxdWVuY2VyLnByb3RvdHlwZS50cmFuc2l0aW9uID0gZnVuY3Rpb24odHJhbnMsIGFyZ3MpIHtcbiAgdGhpcy5mc21bdHJhbnNdKGFyZ3MpO1xufTtcblxuU2VxdWVuY2VyLnByb3RvdHlwZS5hY3RpdmUgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuYWN0aXZlU3RhdGU7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFNlcXVlbmNlcjtcbiIsInZhciBFbnRpdHkgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2VudGl0eScpXG52YXIgR0YgICAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9ncmFwaGljcy1mYWN0b3J5Jyk7XG52YXIgdXNlckludGVyZmFjZSA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS91c2VyLWludGVyZmFjZScpO1xudmFyIGFzc2V0cyAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9hc3NldHMnKTtcblxudmFyIGZvcm1hdEFzUmFuayA9IGZ1bmN0aW9uKG51bSkge1xuICBpZiAobnVtID09PSAxKSB7XG4gICAgcmV0dXJuIG51bSArICdzdCdcbiAgfSBlbHNlIGlmIChudW0gPT09IDIpIHtcbiAgICByZXR1cm4gbnVtICsgJ25kJ1xuICB9IGVsc2UgaWYgKG51bSA9PT0gMykge1xuICAgIHJldHVybiBudW0gKyAncmQnXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG51bSArICd0aCdcbiAgfVxufVxuXG5mdW5jdGlvbiBMZWFkZXJib2FyZChpZCkge1xuICB2YXIgRGVmYXVsdFRleHRPcHRpb25zID0ge1xuICAgIHN0cm9rZVRoaWNrbmVzczogdXNlckludGVyZmFjZS51bml0KDAuNCksXG4gICAgZmlsbDogJyMwMTUxOGQnXG4gIH1cbiAgdmFyIERlZmF1bHRGb250U2l6ZSA9IHVzZXJJbnRlcmZhY2UudW5pdCg0KVxuXG4gIHRoaXMuaWQgPSBpZDtcbiAgdGhpcy5wbGF5ZXJzID0gW11cbiAgXG4gICQuYWpheCh7XG4gICAgdXJsOiAnL3BsYXllcicsXG4gICAgYXN5bmM6IGZhbHNlLFxuICAgIHN1Y2Nlc3M6IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgIHRoaXMucGxheWVycyA9IGRhdGEuc29ydChmdW5jdGlvbih4LHkpIHtcbiAgICAgICAgcmV0dXJuIHkudG9wU2NvcmUgLSB4LnRvcFNjb3JlXG4gICAgICB9KS5zbGljZSgwLCA1KVxuICAgIH0uYmluZCh0aGlzKVxuICB9KVxuXG4gIHRoaXMuc3ByaXRlcyA9IFtcbiAgICBHRi51aVNwcml0ZShhc3NldHMuaW1hZ2UoJ2ludHJvLWxlYWRlcmJvYXJkJyksIHVzZXJJbnRlcmZhY2Uud2lkdGgsIHVzZXJJbnRlcmZhY2UuaGVpZ2h0KVxuICBdO1xuXG4gIHZhciBjdXJyZW50WSA9IHVzZXJJbnRlcmZhY2UudW5pdCgxOS40KVxuICB2YXIgaSA9IDFcblxuICB0aGlzLnBsYXllcnMuZm9yRWFjaChmdW5jdGlvbihwbGF5ZXIpIHtcbiAgICB2YXIgcmFua1Nwcml0ZSA9IEdGLnRleHQoZm9ybWF0QXNSYW5rKGkpLCBEZWZhdWx0Rm9udFNpemUsIERlZmF1bHRUZXh0T3B0aW9ucylcbiAgICByYW5rU3ByaXRlLnBvc2l0aW9uLnkgPSBjdXJyZW50WVxuICAgIHJhbmtTcHJpdGUucG9zaXRpb24ueCA9IHVzZXJJbnRlcmZhY2UudW5pdCg1KVxuICAgIHRoaXMuc3ByaXRlcy5wdXNoKHJhbmtTcHJpdGUpXG5cbiAgICB2YXIgcGxheWVyTmFtZVNwcml0ZSA9IEdGLnRleHQoKHBsYXllci5maXJzdE5hbWUgKyAnICcgKyBwbGF5ZXIubGFzdE5hbWUuc3Vic3RyaW5nKDAsIDEpKS50b1VwcGVyQ2FzZSgpLCBEZWZhdWx0Rm9udFNpemUsICQuZXh0ZW5kKHt9LCBEZWZhdWx0VGV4dE9wdGlvbnMsIHsgZmlsbDogJyNiZjAwMDAnIH0pKVxuICAgIHBsYXllck5hbWVTcHJpdGUucG9zaXRpb24ueCA9IHVzZXJJbnRlcmZhY2UudW5pdCgxOClcbiAgICBwbGF5ZXJOYW1lU3ByaXRlLnBvc2l0aW9uLnkgPSBjdXJyZW50WVxuICAgIHRoaXMuc3ByaXRlcy5wdXNoKHBsYXllck5hbWVTcHJpdGUpXG5cbiAgICB2YXIgY29tcGFueVNwcml0ZSA9IEdGLnRleHQoKHBsYXllci5jb21wYW55IHx8ICcnKS50b1VwcGVyQ2FzZSgpLCB1c2VySW50ZXJmYWNlLnVuaXQoMyksICQuZXh0ZW5kKHt9LCBEZWZhdWx0VGV4dE9wdGlvbnMsIHsgc3Ryb2tlVGhpY2tuZXNzOiB1c2VySW50ZXJmYWNlLnVuaXQoMC40KSB9KSlcbiAgICBjb21wYW55U3ByaXRlLnBvc2l0aW9uLnggPSBwbGF5ZXJOYW1lU3ByaXRlLnBvc2l0aW9uLnggKyBwbGF5ZXJOYW1lU3ByaXRlLndpZHRoICsgdXNlckludGVyZmFjZS51bml0KDIpXG4gICAgY29tcGFueVNwcml0ZS5wb3NpdGlvbi55ID0gY3VycmVudFkgKyB1c2VySW50ZXJmYWNlLnVuaXQoMC42KVxuICAgIHRoaXMuc3ByaXRlcy5wdXNoKGNvbXBhbnlTcHJpdGUpXG5cbiAgICB2YXIgc2NvcmVTcHJpdGUgPSBHRi50ZXh0KHBsYXllci50b3BTY29yZSArICcgR09BTFMnLCBEZWZhdWx0Rm9udFNpemUsIERlZmF1bHRUZXh0T3B0aW9ucylcbiAgICBzY29yZVNwcml0ZS5wb3NpdGlvbi54ID0gdXNlckludGVyZmFjZS53aWR0aCAtIHNjb3JlU3ByaXRlLndpZHRoIC0gdXNlckludGVyZmFjZS51bml0KDUpXG4gICAgc2NvcmVTcHJpdGUucG9zaXRpb24ueSA9IGN1cnJlbnRZXG4gICAgdGhpcy5zcHJpdGVzLnB1c2goc2NvcmVTcHJpdGUpXG4gICAgXG4gICAgY3VycmVudFkgKz0gcGxheWVyTmFtZVNwcml0ZS5oZWlnaHQgKyB1c2VySW50ZXJmYWNlLnVuaXQoMi4zKTtcbiAgICBpICs9IDFcbiAgfS5iaW5kKHRoaXMpKVxufVxuXG5MZWFkZXJib2FyZC5wcm90b3R5cGUgPSBuZXcgRW50aXR5KCk7XG5cbkxlYWRlcmJvYXJkLnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgdGhpcy5zcHJpdGVzLmZvckVhY2goZnVuY3Rpb24oc3ByaXRlKSB7XG4gICAgZW5naW5lLmdyYXBoaWNzLmFkZChzcHJpdGUpO1xuICB9KVxufTtcblxuTGVhZGVyYm9hcmQucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgdGhpcy5zcHJpdGVzLmZvckVhY2goZnVuY3Rpb24oc3ByaXRlKSB7XG4gICAgZW5naW5lLmdyYXBoaWNzLnJlbW92ZShzcHJpdGUpO1xuICB9KVxufTtcblxuTGVhZGVyYm9hcmQucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKCkge31cblxubW9kdWxlLmV4cG9ydHMgPSBMZWFkZXJib2FyZCIsInZhciBFbnRpdHkgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2VudGl0eScpXG52YXIgR0YgICAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9ncmFwaGljcy1mYWN0b3J5Jyk7XG52YXIgdXNlckludGVyZmFjZSA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS91c2VyLWludGVyZmFjZScpO1xudmFyIGFzc2V0cyAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9hc3NldHMnKTtcblxuZnVuY3Rpb24gVGl0bGUoaWQpIHtcbiAgXG4gIHRoaXMuaWQgPSBpZDtcbiAgdGhpcy5zcHJpdGUgPSBHRi51aVNwcml0ZShhc3NldHMuaW1hZ2UoJ2ludHJvLXRpdGxlJyksIHVzZXJJbnRlcmZhY2Uud2lkdGgsIHVzZXJJbnRlcmZhY2UuaGVpZ2h0KTtcblxufTtcblxuVGl0bGUucHJvdG90eXBlID0gbmV3IEVudGl0eSgpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFRpdGxlO1xuIiwidmFyIEVudGl0eSAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZW50aXR5JylcbnZhciBHRiAgICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2dyYXBoaWNzLWZhY3RvcnknKTtcbnZhciB1c2VySW50ZXJmYWNlID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL3VzZXItaW50ZXJmYWNlJyk7XG52YXIgYXNzZXRzICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2Fzc2V0cycpO1xuXG52YXIgUkVEICA9ICcjYmYwMDAwJztcbnZhciBCTFVFID0gJyMwMTUxOGQnO1xuXG5mdW5jdGlvbiBBYm91dChpZCkge1xuICBcbiAgdGhpcy5pZCA9IGlkO1xuXG4gIGNvbnNvbGUubG9nKHVzZXJJbnRlcmZhY2UudW5pdCgxKSk7XG4gIHRoaXMuc3ByaXRlcyA9IFtcbiAgICBHRi51aVNwcml0ZShhc3NldHMuaW1hZ2UoJ2ludHJvLWFib3V0JyksIHVzZXJJbnRlcmZhY2Uud2lkdGgsIHVzZXJJbnRlcmZhY2UuaGVpZ2h0KSxcbiAgICB0ZXh0KCdCdWlsdCBpbiA0IHdlZWtzICAoYWZ0ZXIgaG91cnMpJywgQkxVRSwgNywgMTMuNSksXG4gICAgdGV4dCgnSmF2YXNjcmlwdCcsIFJFRCwgNywgMjYuNSksXG4gICAgdGV4dCgnV2ViR0wnLCBCTFVFLCAzMywgMjYuNSksXG4gICAgdGV4dCgnTm9kZS5qcycsIFJFRCwgNDksIDI2LjUpLFxuICAgIHRleHQoJ1dlYiBzb2NrZXRzJywgQkxVRSwgNjgsIDI2LjUpLFxuICAgIHRleHQoJ0FzayB1cyBhYm91dCcsIEJMVUUsIDcsIDM5LjUpLFxuICAgIHRleHQoJ3dlYicsIFJFRCwgMzQsIDM5LjUpLFxuICAgIHRleHQoJyYnLCBCTFVFLCA0NCwgMzkuNSksXG4gICAgdGV4dCgnbW9iaWxlJywgUkVELCA0OSwgMzkuNSksXG4gICAgdGV4dCgnIScsIEJMVUUsIDY0LCAzOS41KVxuICBdO1xuXG59O1xuXG5BYm91dC5wcm90b3R5cGUgPSBuZXcgRW50aXR5KCk7XG5cbkFib3V0LnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgdGhpcy5zcHJpdGVzLmZvckVhY2goZnVuY3Rpb24oc3ByaXRlKSB7XG4gICAgZW5naW5lLmdyYXBoaWNzLmFkZChzcHJpdGUpO1xuICB9KVxufTtcblxuQWJvdXQucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgdGhpcy5zcHJpdGVzLmZvckVhY2goZnVuY3Rpb24oc3ByaXRlKSB7XG4gICAgZW5naW5lLmdyYXBoaWNzLnJlbW92ZShzcHJpdGUpO1xuICB9KVxufTtcblxuZnVuY3Rpb24gdGV4dChzdHIsIGNvbG9yLCB4LCB5KSB7XG4gIHZhciBzcHJpdGUgPSBHRi50ZXh0KHN0ciwgdXNlckludGVyZmFjZS51bml0KDMuOCksIHtcbiAgICBmaWxsOiBjb2xvcixcbiAgICBzdHJva2VUaGlja25lc3M6IHVzZXJJbnRlcmZhY2UudW5pdCgwLjQpXG4gIH0pO1xuICBzcHJpdGUucG9zaXRpb24ueCA9IHVzZXJJbnRlcmZhY2UudW5pdCh4KTtcbiAgc3ByaXRlLnBvc2l0aW9uLnkgPSB1c2VySW50ZXJmYWNlLnVuaXQoeSk7XG4gIHJldHVybiBzcHJpdGU7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQWJvdXQ7XG4iLCIvLyByZXNldCBwbGF5ZXJzIHBvc1xuLy8gY2FuIG1vdmUsIGJ1dCBubyBiYWxsXG5cbnZhciBHRiAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9ncmFwaGljcy1mYWN0b3J5Jyk7XG52YXIgU3RhZGl1bSAgICAgPSByZXF1aXJlKCcuLi9lbnRpdGllcy9zdGFkaXVtJyk7XG52YXIgQ3Jvd2QgICAgICAgPSByZXF1aXJlKCcuLi9lbnRpdGllcy9jcm93ZCcpO1xudmFyIFBsYXllciAgICAgID0gcmVxdWlyZSgnLi4vZW50aXRpZXMvcGxheWVyJyk7XG52YXIgSHVkICAgICAgICAgPSByZXF1aXJlKCcuLi9lbnRpdGllcy9odWQnKTtcbnZhciBBY3Rpb25UZXh0ICA9IHJlcXVpcmUoJy4uL2VudGl0aWVzL2FjdGlvbi10ZXh0Jyk7XG52YXIgd29ybGQgICAgICAgPSByZXF1aXJlKCcuLi93b3JsZCcpO1xuXG5mdW5jdGlvbiBXYXJtVXAoZW5naW5lLCBnYW1lKSB7XG5cbiAgdmFyIHN0YXJ0aW5nUG9zID0gW1xuICAgIHdvcmxkLndpZHRoIC8gOCxcbiAgICB3b3JsZC53aWR0aCAtIHdvcmxkLndpZHRoIC8gOFxuICBdO1xuICBcbiAgdGhpcy5lbnRlciA9IGZ1bmN0aW9uKCkge1xuXG4gICAgdmFyIHAxID0gbmV3IFBsYXllcigncDEnLCAwLCBnYW1lLnBsYXllcnNbMF0ubmFtZSwgc3RhcnRpbmdQb3NbMF0sIHdvcmxkLmhlaWdodCAvIDIpO1xuICAgIHZhciBwMiA9IG5ldyBQbGF5ZXIoJ3AyJywgMSwgZ2FtZS5wbGF5ZXJzWzFdLm5hbWUsIHN0YXJ0aW5nUG9zWzFdLCB3b3JsZC5oZWlnaHQgLyAyKTtcbiAgICBcbiAgICBlbmdpbmUuYWRkRW50aXR5KG5ldyBTdGFkaXVtKCkpO1xuICAgIGVuZ2luZS5hZGRFbnRpdHkobmV3IENyb3dkKCkpO1xuICAgIGVuZ2luZS5hZGRFbnRpdHkocDEpO1xuICAgIGVuZ2luZS5hZGRFbnRpdHkocDIpO1xuICAgIGVuZ2luZS5hZGRFbnRpdHkobmV3IEh1ZCgpKTtcbiAgICBlbmdpbmUuYWRkRW50aXR5KG5ldyBBY3Rpb25UZXh0KCdnZXQtcmVhZHknLCAnR0VUIFJFQURZIScpKTtcblxuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICBnYW1lLnRyYW5zaXRpb24oJ3JlYWR5JywgMCk7XG4gICAgfSwgMjAwMCk7ICAgIFxuXG4gIH07XG4gIFxuICB0aGlzLmV4aXQgPSBmdW5jdGlvbigpIHtcbiAgICBlbmdpbmUuZGVsZXRlRW50aXR5KCdnZXQtcmVhZHknKTtcbiAgfTtcbiAgXG4gIHRoaXMudXBkYXRlID0gZnVuY3Rpb24oZGVsdGEpIHtcbiAgfTtcbiAgXG4gIHRoaXMub24gPSBmdW5jdGlvbihtZXNzYWdlLCBhcmdzKSB7XG4gIH07XG4gIFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFdhcm1VcDtcbiIsInZhciBQRiAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9waHlzaWNzLWZhY3RvcnknKTtcbnZhciBHRiAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9ncmFwaGljcy1mYWN0b3J5Jyk7XG52YXIgRW50aXR5ICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZW50aXR5Jyk7XG52YXIgd29ybGQgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvd29ybGQnKTtcbnZhciBtYXRoVXRpbHMgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9tYXRoLXV0aWxzJyk7XG52YXIgaHViICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvaHViJyk7XG52YXIgTWF0aFV0aWxzICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvbWF0aC11dGlscycpXG52YXIgYXNzZXRzICAgICAgPSByZXF1aXJlKCcuLi8uLi9hc3NldHMnKTtcblxudmFyIGJhbGxTaXplID0gMjtcblxudmFyIGZpeHR1cmUgPSBQRi5maXh0dXJlKHtcbiAgc2hhcGU6ICAgICAgUEYuc2hhcGUuY2lyY2xlKGJhbGxTaXplIC8gMiksXG4gIGR5bmFtaWNzOiAgIHtkZW5zaXR5OiAxLCBmcmljdGlvbjogMSwgcmVzdGl0dXRpb246IDF9LFxuICBjYXRlZ29yeTogICBQRi5jYXRlZ29yaWVzLkJBTEwsXG4gIGNvbGxpc2lvbjogIFBGLmNhdGVnb3JpZXMuQVJFTkEgfCBQRi5jYXRlZ29yaWVzLlBMQVlFUiB8IFBGLmNhdGVnb3JpZXMuQkFMTFxufSk7XG5cbmZ1bmN0aW9uIEJhbGwoaWQsIHgsIHkpIHtcbiAgdGhpcy5pZCA9IGlkO1xuXG4gIHRoaXMuYm9keVNwZWMgPSB7XG4gICAgYm9keTogUEYuZHluYW1pYyh7eDogeCwgeTogeX0pLFxuICAgIGZpeHR1cmU6IGZpeHR1cmVcbiAgfTtcblxuICB0aGlzLnNwcml0ZSA9IEdGLnNwcml0ZShhc3NldHMuaW1hZ2UoJ2JhbGwnKSwgYmFsbFNpemUsIGJhbGxTaXplKTtcbn07XG5cbkJhbGwucHJvdG90eXBlID0gbmV3IEVudGl0eSgpO1xuXG5CYWxsLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUsIGRlbHRhKSB7ICBcbiAgRW50aXR5LnByb3RvdHlwZS51cGRhdGUuY2FsbCh0aGlzLCBkZWx0YSk7XG4gIG1hdGhVdGlscy5jbGFtcFhWZWxvY2l0eSh0aGlzLmJvZHksIDI4LCAzOCk7XG4gIG1hdGhVdGlscy5jbGFtcFlWZWxvY2l0eSh0aGlzLmJvZHksIDE1LCAyMyk7XG4gIHRoaXMuYm9keS5TZXRBbmd1bGFyRGFtcGluZygxLjUpO1xuICBcbiAgLy8gV2Ugc2hvdWxkIGJlIGFibGUgdG8gc3BlY2lmeSBcIjAuNVwiLCBhbmQgbm90IGhhdmUgdG8gdXBkYXRlIGl0IGNvbnN0YW50bHlcbiAgLy8gTmVlZCB0byBjaGVjayBvdXIgY2hhbmdlcyB0byBQSVhJXG4gIHRoaXMuc3ByaXRlLmFuY2hvci54ID0gdGhpcy5zcHJpdGUudGV4dHVyZS53aWR0aCAgLyAyO1xuICB0aGlzLnNwcml0ZS5hbmNob3IueSA9IHRoaXMuc3ByaXRlLnRleHR1cmUuaGVpZ2h0IC8gMjtcbn07XG5cbkJhbGwucHJvdG90eXBlLmtpY2sgPSBmdW5jdGlvbihkaXJlY3Rpb24pIHtcbiAgdGhpcy5ib2R5LlNldEF3YWtlKHRydWUpO1xuICB0aGlzLmJvZHkuU2V0TGluZWFyVmVsb2NpdHkobmV3IEJveDJELkNvbW1vbi5NYXRoLmIyVmVjMigyNSAqIGRpcmVjdGlvbiwgTWF0aFV0aWxzLnJhbmRvbUJldHdlZW4oMSwgNikpKTtcbiAgdGhpcy5ib2R5LlNldEFuZ3VsYXJWZWxvY2l0eShNYXRoVXRpbHMucmFuZG9tQmV0d2Vlbig0LCAxMCkpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEJhbGw7XG4iLCJ2YXIgR0YgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZ3JhcGhpY3MtZmFjdG9yeScpO1xudmFyIEVudGl0eSA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9lbnRpdHknKTtcbnZhciB1c2VySW50ZXJmYWNlID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL3VzZXItaW50ZXJmYWNlJyk7XG5cbmZ1bmN0aW9uIEFjdGlvblRleHQoaWQsIHRleHQpIHtcbiAgXG4gIHRoaXMuaWQgPSBpZDtcbiAgdGhpcy5zcHJpdGUgPSBHRi50ZXh0KHRleHQsIDY1LCB7XG4gICAgc3Ryb2tlVGhpY2tuZXNzOiA0XG4gIH0pO1xuICBcbiAgdGhpcy5zcHJpdGUucG9zaXRpb24ueCA9IHVzZXJJbnRlcmZhY2Uud2lkdGggIC8gMiAtIHRoaXMuc3ByaXRlLndpZHRoICAvIDI7XG4gIHRoaXMuc3ByaXRlLnBvc2l0aW9uLnkgPSB1c2VySW50ZXJmYWNlLmhlaWdodCAvIDIgLSB0aGlzLnNwcml0ZS5oZWlnaHQgLyAyO1xuICBcbn07XG5cbkFjdGlvblRleHQucHJvdG90eXBlID0gbmV3IEVudGl0eSgpO1xuXG5BY3Rpb25UZXh0LnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbih0ZXh0KSB7XG4gIHRoaXMuc3ByaXRlLnNldFRleHQodGV4dCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEFjdGlvblRleHQ7XG4iLCJ2YXIgXyAgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi8uLi8uLi8zcmRwYXJ0eS91bmRlcnNjb3JlLW1pbicpO1xudmFyIEdGICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2dyYXBoaWNzLWZhY3RvcnknKTtcbnZhciBodWIgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9odWInKTtcbnZhciBCYWxsICAgICAgICA9IHJlcXVpcmUoJy4uL2VudGl0aWVzL2JhbGwnKTtcbnZhciBBY3Rpb25UZXh0ICA9IHJlcXVpcmUoJy4uL2VudGl0aWVzL2FjdGlvbi10ZXh0Jyk7XG52YXIgd29ybGQgICAgICAgPSByZXF1aXJlKCcuLi93b3JsZCcpO1xuXG5mdW5jdGlvbiBLaWNrT2ZmKGVuZ2luZSwgZ2FtZSkge1xuICB2YXIgdGV4dCA9IG51bGw7XG4gIHZhciBmaXJzdEJhbGwgPSBudWxsXG4gIHZhciBiYWxsRGlyZWN0aW9uID0gbnVsbFxuICBcbiAgdGhpcy5lbnRlciA9IGZ1bmN0aW9uKGxhc3RTY29yaW5nUGxheWVySWQpIHtcbiAgICB2YXIgcGl0Y2hQb3NpdGlvbiA9IChsYXN0U2NvcmluZ1BsYXllcklkID09PSAwKSA/IC0xIDogMVxuICAgIGJhbGxEaXJlY3Rpb24gPSBwaXRjaFBvc2l0aW9uICogLTFcbiAgICBnYW1lLmNsZWFyQmFsbHMoKVxuICAgIGZpcnN0QmFsbCA9IGdhbWUuY3JlYXRlQmFsbChwaXRjaFBvc2l0aW9uLCAwKVxuXG4gICAgdGV4dCA9IG5ldyBBY3Rpb25UZXh0KCdjb3VudGRvd24nLCAnJyk7XG4gICAgZW5naW5lLmFkZEVudGl0eSh0ZXh0KTtcbiAgICBjb3VudGRvd24oMyk7XG4gIH07XG4gIFxuICB0aGlzLmV4aXQgPSBmdW5jdGlvbigpIHtcbiAgfTtcbiAgXG4gIHRoaXMudXBkYXRlID0gZnVuY3Rpb24oZGVsdGEpIHtcbiAgfTtcbiAgXG4gIHRoaXMub24gPSBmdW5jdGlvbihtZXNzYWdlLCBhcmdzKSB7XG4gIH07XG4gIFxuICBmdW5jdGlvbiBjb3VudGRvd24odmFsKSB7XG4gICAgaWYgKHZhbCA9PSAwKSB7XG4gICAgICBnbygpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0ZXh0LnNldCh2YWwudG9TdHJpbmcoKSk7XG4gICAgICBzZXRUaW1lb3V0KF8ucGFydGlhbChjb3VudGRvd24sIC0tdmFsKSwgNjAwKTtcbiAgICB9XG4gIH1cbiAgXG4gIGZ1bmN0aW9uIGdvKCkge1xuICAgIGh1Yi5zZW5kKCdlbmdpbmUuc291bmQucGxheScsIHtmaWxlOiAnL2dhbWUvc291bmRzL3doaXN0bGUubXAzJ30pO1xuICAgIGVuZ2luZS5kZWxldGVFbnRpdHkoJ2NvdW50ZG93bicpO1xuXG4gICAgZmlyc3RCYWxsLmtpY2soYmFsbERpcmVjdGlvbilcbiAgICBnYW1lLnRyYW5zaXRpb24oJ2dvJyk7XG4gIH1cbiAgXG59XG5cbm1vZHVsZS5leHBvcnRzID0gS2lja09mZjtcbiIsInZhciBCb29tICAgICAgID0gcmVxdWlyZSgnLi4vZW50aXRpZXMvYm9vbScpO1xudmFyIEFjdGlvblRleHQgPSByZXF1aXJlKCcuLi9lbnRpdGllcy9hY3Rpb24tdGV4dCcpO1xudmFyIGh1YiAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvaHViJyk7XG5cbmZ1bmN0aW9uIFNjb3JlZChlbmdpbmUsIGdhbWUpIHtcbiAgXG4gIHRoaXMuZW50ZXIgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgZW5naW5lLmdldEVudGl0eSgnc3RhZGl1bScpLnNoYWtlKGRhdGEuYWdhaW5zdEluZGV4KTtcbiAgICBlbmdpbmUuYWRkRW50aXR5KG5ldyBCb29tKCdib29tJyArIGRhdGEuYmFsbC5pZCwgZGF0YS5hZ2FpbnN0SW5kZXgpKTtcbiAgICBnYW1lLnJlbW92ZUJhbGwoZGF0YS5iYWxsKTtcbiAgICBcbiAgICBpZiAoZ2FtZS5iYWxsc0luUGxheS5sZW5ndGggPj0gMSkge1xuICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgZ2FtZS50cmFuc2l0aW9uKCdnbycpO1xuICAgICAgfSwgMSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgIGdhbWUudHJhbnNpdGlvbigncmVhZHknLCBkYXRhLmFnYWluc3RJbmRleCk7XG4gICAgICB9LCAxKTtcbiAgICB9XG4gICAgXG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgIGVuZ2luZS5kZWxldGVFbnRpdHkoJ2Jvb20nICsgZGF0YS5iYWxsLmlkKTtcbiAgICB9LCA0MDApO1xuICB9O1xuICBcbiAgdGhpcy5leGl0ID0gZnVuY3Rpb24oKSB7XG4gIH07XG4gIFxuICB0aGlzLnVwZGF0ZSA9IGZ1bmN0aW9uKGRlbHRhKSB7XG4gIH07XG4gIFxuICB0aGlzLm9uID0gZnVuY3Rpb24obWVzc2FnZSwgYXJncykge1xuICB9O1xuICBcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBTY29yZWQ7XG4iLCJ2YXIgVGltZUJhc2VkTWVzc2FnZSAgPSByZXF1aXJlKCcuLi90aW1lLWJhc2VkLW1lc3NhZ2UnKTtcbnZhciBtYXRoVXRpbHMgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9tYXRoLXV0aWxzJyk7XG5cbmZ1bmN0aW9uIFBsYXkoZW5naW5lLCBnYW1lKSB7XG4gIFxuICB2YXIgbXVsdGlCYWxsICAgICAgID0gbmV3IFRpbWVCYXNlZE1lc3NhZ2UoMTUwMDAsICdnYW1lLm11bHRpYmFsbCcpO1xuICB2YXIgZW5kT2ZNYXRjaCAgICAgID0gbmV3IFRpbWVCYXNlZE1lc3NhZ2UoMCwgJ2dhbWUuZW5kJyk7XG4gIFxuICB0aGlzLmVudGVyID0gZnVuY3Rpb24oKSB7XG4gIH07XG4gIFxuICB0aGlzLmV4aXQgPSBmdW5jdGlvbigpIHtcbiAgfTtcbiAgXG4gIHRoaXMudXBkYXRlID0gZnVuY3Rpb24oZGVsdGEpIHtcbiAgICBnYW1lLnRpbWVSZW1haW5pbmcgPSBNYXRoLm1heChnYW1lLnRpbWVSZW1haW5pbmcgLSBkZWx0YSwgMCk7XG4gICAgbXVsdGlCYWxsLnVwZGF0ZShnYW1lLnRpbWVSZW1haW5pbmcpO1xuICAgIGVuZE9mTWF0Y2gudXBkYXRlKGdhbWUudGltZVJlbWFpbmluZyk7XG4gIH07XG4gIFxuICB0aGlzLm9uID0gZnVuY3Rpb24obWVzc2FnZSwgYXJncykge1xuICB9O1xuICBcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBQbGF5O1xuIiwidmFyIFdpbm5lciAgPSByZXF1aXJlKCcuLi9lbnRpdGllcy93aW5uZXInKTtcbnZhciBodWIgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2h1YicpO1xuXG5mdW5jdGlvbiBFbmRPZk1hdGNoKGVuZ2luZSwgZ2FtZSkge1xuICBcbiAgdGhpcy5lbnRlciA9IGZ1bmN0aW9uKCkge1xuICAgIGVuZ2luZS5kZWxldGVFbnRpdHlNYXRjaGluZygvXmJhbGw6Lyk7XG4gICAgZW5naW5lLmFkZEVudGl0eShuZXcgV2lubmVyKCd3aW5uZXInLCBnYW1lLnBsYXllcnNbMF0sIGdhbWUucGxheWVyc1sxXSkpO1xuICAgIHNldFRpbWVvdXQoZmluaXNoLCA0MDAwKTtcbiAgfTtcbiAgXG4gIHRoaXMuZXhpdCA9IGZ1bmN0aW9uKCkge1xuICB9O1xuICBcbiAgdGhpcy51cGRhdGUgPSBmdW5jdGlvbihkZWx0YSkge1xuICB9O1xuXG4gIHRoaXMub24gPSBmdW5jdGlvbihtZXNzYWdlLCBhcmdzKSB7XG4gIH07XG4gIFxuICBmdW5jdGlvbiBmaW5pc2goKSB7XG4gICAgaHViLnNlbmQoJ2dhbWUuZmluaXNoJyk7XG4gIH1cbiAgXG59XG5cbm1vZHVsZS5leHBvcnRzID0gRW5kT2ZNYXRjaDtcbiIsIlxuZXhwb3J0cy53aWR0aCAgPSAwO1xuZXhwb3J0cy5oZWlnaHQgPSAwO1xuXG5leHBvcnRzLnJlc2l6ZSA9IGZ1bmN0aW9uKHcsIGgpIHtcbiAgZXhwb3J0cy53aWR0aCAgPSB3O1xuICBleHBvcnRzLmhlaWdodCA9IGg7XG59O1xuXG5leHBvcnRzLnVuaXQgPSBmdW5jdGlvbihuKSB7XG4gIHJldHVybiAoZXhwb3J0cy53aWR0aCAvIDEwMCkgKiBuXG59IiwiXG52YXIgcGl4ZWxzUGVyTWV0ZXIgPSAxNjtcblxuZXhwb3J0cy50b1BpeGVscyA9IGZ1bmN0aW9uKG1ldGVycykge1xuICByZXR1cm4gbWV0ZXJzICogcGl4ZWxzUGVyTWV0ZXI7XG59O1xuXG5leHBvcnRzLnNldFBpeGVsc1Blck1ldGVyID0gZnVuY3Rpb24odmFsKSB7XG4gIHBpeGVsc1Blck1ldGVyID0gdmFsO1xufTtcblxuZXhwb3J0cy5nZXRQaXhlbHNQZXJNZXRlciA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gcGl4ZWxzUGVyTWV0ZXI7XG59O1xuIiwiXG52YXIgUEkgPSAzLjE0MTU5O1xuXG5leHBvcnRzLlBJID0gUEk7XG5cbmV4cG9ydHMuY2xhbXBWZWxvY2l0eSA9IGZ1bmN0aW9uKGJvZHksIG1pbiwgbWF4KSB7XG4gIHZhciB2ZWMgPSBib2R5LkdldExpbmVhclZlbG9jaXR5KCk7XG4gIGlmICh2ZWMueCAhPSAwICYmIHZlYy55ICE9IDApIHtcbiAgICBpZiAodmVjLkxlbmd0aCgpIDwgbWluKSB7XG4gICAgICB2ZWMuTm9ybWFsaXplKCk7XG4gICAgICB2ZWMuTXVsdGlwbHkobWluKTtcbiAgICB9IGVsc2UgaWYgKHZlYy5MZW5ndGgoKSA+IG1heCkge1xuICAgICAgdmVjLk5vcm1hbGl6ZSgpXG4gICAgICB2ZWMuTXVsdGlwbHkobWF4KTtcbiAgICB9XG4gIH1cbn07XG5cbmV4cG9ydHMuY2xhbXBYVmVsb2NpdHkgPSBmdW5jdGlvbihib2R5LCBtaW4sIG1heCkge1xuICB2YXIgdmVjID0gYm9keS5HZXRMaW5lYXJWZWxvY2l0eSgpO1xuICBpZiAodmVjLnggIT0gMCkge1xuICAgIHZlYy54ID0gZXhwb3J0cy5jbGFtcFdpdGhTaWduKHZlYy54LCBtaW4sIG1heCk7XG4gIH1cbn07XG5cbmV4cG9ydHMuY2xhbXBZVmVsb2NpdHkgPSBmdW5jdGlvbihib2R5LCBtaW4sIG1heCkge1xuICB2YXIgdmVjID0gYm9keS5HZXRMaW5lYXJWZWxvY2l0eSgpO1xuICBpZiAodmVjLnkgIT0gMCkge1xuICAgIHZlYy55ID0gZXhwb3J0cy5jbGFtcFdpdGhTaWduKHZlYy55LCBtaW4sIG1heCk7XG4gIH1cbn07XG5cbmV4cG9ydHMuY2xhbXBXaXRoU2lnbiA9IGZ1bmN0aW9uKHZhbCwgbWluLCBtYXgpIHtcbiAgaWYgKHZhbCA+IDApIHtcbiAgICByZXR1cm4gZXhwb3J0cy5jbGFtcCh2YWwsIG1pbiwgbWF4KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gZXhwb3J0cy5jbGFtcCh2YWwsIC1tYXgsIC1taW4pO1xuICB9XG59O1xuXG5leHBvcnRzLmNsYW1wID0gZnVuY3Rpb24odmFsLCBtaW4sIG1heCkge1xuICByZXR1cm4gTWF0aC5taW4oTWF0aC5tYXgodmFsLCBtaW4pLCBtYXgpO1xufTtcblxuZXhwb3J0cy5yYW5kb21CZXR3ZWVuID0gZnVuY3Rpb24obWluLCBtYXgpIHtcbiAgcmV0dXJuIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChtYXgtbWluKSkgKyBtaW47XG59O1xuXG5leHBvcnRzLnJhbmRvbVNpZ24gPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIE1hdGgucmFuZG9tKCkgPCAwLjUgPyAtMSA6IDE7XG59O1xuXG5leHBvcnRzLmRpc3RhbmNlID0gZnVuY3Rpb24oYSwgYikge1xuICByZXR1cm4gTWF0aC5zcXJ0KChiLnggLSBhLngpICogKGIueCAtIGEueCkgKyAoYi55IC0gYS55KSAqIChiLnkgLSBhLnkpKTtcbn07XG4iLCJ2YXIgXyA9IHJlcXVpcmUoJy4uLy4uLy4uLzNyZHBhcnR5L3VuZGVyc2NvcmUtbWluJyksXG4gIEVudGl0eSA9IHJlcXVpcmUoJy4vZW50aXR5JyksXG4gIFdvcmxkID0gcmVxdWlyZSgnLi93b3JsZCcpLFxuICBodWIgPSByZXF1aXJlKCcuL2h1YicpLFxuICBtYXRoVXRpbHMgPSByZXF1aXJlKCcuL21hdGgtdXRpbHMnKVxuXG52YXIgTV9QSSA9IE1hdGguUElcbnZhciBNX1BJXzIgPSBNX1BJIC8gMlxuXG52YXIgcGFydGljbGVUZXh0dXJlID0gUElYSS5UZXh0dXJlLmZyb21JbWFnZSgnL2dhbWUvaW1hZ2VzL3BhcnRpY2xlLWJhbGwucG5nJylcblxudmFyIFBhcnRpY2xlID0gZnVuY3Rpb24oKSB7XG4gIFBJWEkuU3ByaXRlLmNhbGwodGhpcywgcGFydGljbGVUZXh0dXJlKVxuICB0aGlzLmFuY2hvci54ID0gMC41XG4gIHRoaXMuYW5jaG9yLnkgPSAwLjVcbiAgdGhpcy5zcGVlZCA9IG5ldyBQSVhJLlBvaW50XG4gIHRoaXMuYWNjZWxlcmF0aW9uID0gbmV3IFBJWEkuUG9pbnRcbiAgdGhpcy53aWR0aCA9IDE1XG4gIHRoaXMuaGVpZ2h0ID0gMTVcbn1cblBhcnRpY2xlLmNvbnN0cnVjdG9yID0gUGFydGljbGVcblBhcnRpY2xlLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoUElYSS5TcHJpdGUucHJvdG90eXBlKVxuXG52YXIgcmVzZXRQYXJ0aWNsZSA9IGZ1bmN0aW9uKHBhcnRpY2xlKSB7XG4gIHBhcnRpY2xlLmFscGhhID0gMVxuICBwYXJ0aWNsZS5zY2FsZS54ID0gMVxuICBwYXJ0aWNsZS5zY2FsZS55ID0gMVxuICBwYXJ0aWNsZS5kaXJlY3Rpb24gPSB7XG4gICAgeDogKG1hdGhVdGlscy5yYW5kb21CZXR3ZWVuKDAsIDIwMCkgLSAxMDApIC8gMTAwLFxuICAgIHk6IChtYXRoVXRpbHMucmFuZG9tQmV0d2VlbigwLCAyMDApIC0gMTAwKSAvIDEwMFxuICB9XG4gIHBhcnRpY2xlLnNwZWVkLnggPSAxLjMgKyBNYXRoLnJhbmRvbSgpXG4gIHBhcnRpY2xlLnNwZWVkLnkgPSAxLjMgKyBNYXRoLnJhbmRvbSgpXG4gIHBhcnRpY2xlLmFjY2VsZXJhdGlvbi54ID0gMC43NSArIE1hdGgucmFuZG9tKClcbiAgcGFydGljbGUuYWNjZWxlcmF0aW9uLnkgPSAwLjc1ICsgTWF0aC5yYW5kb20oKVxuICBwYXJ0aWNsZS5wb3NpdGlvbi54ID0gMFxuICBwYXJ0aWNsZS5wb3NpdGlvbi55ID0gMFxuICBwYXJ0aWNsZS52aXNpYmxlID0gdHJ1ZVxuICBwYXJ0aWNsZS5yb3RhdGlvbiA9IDBcbn1cblxudmFyIFBhcnRpY2xlUG9vbCA9IGZ1bmN0aW9uKHNpemUpIHtcbiAgY29uc29sZS5sb2coJ0NvbnN0cnVjdGluZyBhIHBhcnRpY2xlIHBvb2wgd2l0aCAnICsgc2l6ZSArICcgcGFydGljbGVzJylcbiAgdGhpcy5wb29sID0gW11cblxuICBmb3IgKHZhciBpID0gMDsgaSA8PSBzaXplOyBpKyspIHtcbiAgICB2YXIgcGFydGljbGUgPSBuZXcgUGFydGljbGUoKVxuICAgIHRoaXMucG9vbC5wdXNoKHtcbiAgICAgIHBhcnRpY2xlOiBwYXJ0aWNsZSxcbiAgICAgIGZyZWU6IHRydWVcbiAgICB9KVxuICB9XG59XG5cblBhcnRpY2xlUG9vbC5wcm90b3R5cGUuY2xhaW0gPSBmdW5jdGlvbihhbW91bnQpIHtcbiAgdmFyIHBhcnRpY2xlcyA9IFtdXG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnBvb2wubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgZW50cnkgPSB0aGlzLnBvb2xbaV1cblxuICAgIGlmIChlbnRyeS5mcmVlKSB7XG4gICAgICBpZiAoIWVudHJ5LnBhcnRpY2xlKSB7XG4gICAgICAgIHRocm93ICdQYXJ0aWNsZSBpcyBudWxsJ1xuICAgICAgfVxuXG4gICAgICBlbnRyeS5mcmVlID0gZmFsc2VcbiAgICAgIHBhcnRpY2xlcy5wdXNoKGVudHJ5LnBhcnRpY2xlKVxuICAgIH1cblxuICAgIGlmIChwYXJ0aWNsZXMubGVuZ3RoID09IGFtb3VudCkge1xuICAgICAgYnJlYWtcbiAgICB9XG4gIH1cblxuICBpZiAocGFydGljbGVzLmxlbmd0aCA8IGFtb3VudCkge1xuICAgIHRocm93ICdOb3QgZW5vdWdoIHBhcnRpY2xlcyB0byBzYXRpc2Z5IHJlcXVlc3QnXG4gIH1cblxuICBjb25zb2xlLmxvZygnQ2xhaW1lZCAnICsgYW1vdW50ICsgJyBwYXJ0aWNsZXMnKVxuXG4gIHJldHVybiBwYXJ0aWNsZXNcbn1cblxuUGFydGljbGVQb29sLnByb3RvdHlwZS5yZWxlYXNlID0gZnVuY3Rpb24ocGFydGljbGVzKSB7XG4gIHBhcnRpY2xlcy5mb3JFYWNoKGZ1bmN0aW9uKHBhcnRpY2xlKSB7XG4gICAgaWYgKHBhcnRpY2xlLnBhcmVudCkge1xuICAgICAgcGFydGljbGUucGFyZW50LnJlbW92ZUNoaWxkKHBhcnRpY2xlKVxuICAgIH1cbiAgICB2YXIgZW50cnkgPSBfLmZpbmRXaGVyZSh0aGlzLnBvb2wsIHsgcGFydGljbGU6IHBhcnRpY2xlIH0pXG4gICAgZW50cnkuZnJlZSA9IHRydWVcbiAgfS5iaW5kKHRoaXMpKVxuICAvLyBjb25zb2xlLmxvZygnUmVsZWFzZWQgJyArIHBhcnRpY2xlcy5sZW5ndGggKyAnIHBhcnRpY2xlcycpXG59XG5cbnZhciBwYXJ0aWNsZVBvb2wgPSBuZXcgUGFydGljbGVQb29sKDUwMDApXG5cbnZhciBFeHBsb3Npb24gPSBmdW5jdGlvbihvcmlnaW4sIHBhcnRpY2xlQ291bnQpIHtcbiAgRW50aXR5LmNhbGwodGhpcylcbiAgdGhpcy5zcHJpdGUgPSBuZXcgUElYSS5EaXNwbGF5T2JqZWN0Q29udGFpbmVyKClcbiAgdGhpcy5zcHJpdGUucG9zaXRpb24ueCA9IFdvcmxkLnRvUGl4ZWxzKG9yaWdpbi54KVxuICB0aGlzLnNwcml0ZS5wb3NpdGlvbi55ID0gV29ybGQudG9QaXhlbHMob3JpZ2luLnkpXG4gIHRoaXMudHRsID0gMFxuXG4gIHRoaXMucGFydGljbGVzID0gdGhpcy5hbGl2ZVBhcnRpY2xlcyA9IHBhcnRpY2xlUG9vbC5jbGFpbShwYXJ0aWNsZUNvdW50KVxuICB0aGlzLnBhcnRpY2xlcy5mb3JFYWNoKGZ1bmN0aW9uKHBhcnRpY2xlKSB7XG4gICAgcmVzZXRQYXJ0aWNsZShwYXJ0aWNsZSlcbiAgICB0aGlzLnNwcml0ZS5hZGRDaGlsZChwYXJ0aWNsZSlcbiAgfS5iaW5kKHRoaXMpKVxufVxuRXhwbG9zaW9uLmxhcmdlID0gZnVuY3Rpb24ob3JpZ2luKSB7XG4gIHJldHVybiBuZXcgRXhwbG9zaW9uKG9yaWdpbiwgNTApXG59XG5FeHBsb3Npb24uc21hbGwgPSBmdW5jdGlvbihvcmlnaW4pIHtcbiAgcmV0dXJuIG5ldyBFeHBsb3Npb24ob3JpZ2luLCBtYXRoVXRpbHMucmFuZG9tQmV0d2Vlbig5LCA1MSkpXG59XG5cbkV4cGxvc2lvbi5wcm90b3R5cGUgPSBuZXcgRW50aXR5KClcblxuRXhwbG9zaW9uLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbihkZWx0YSkge1xuICB0aGlzLnR0bCAtPSBkZWx0YVxuXG4gIHZhciBjdXJyZW50UGFydGljbGVzID0gdGhpcy5hbGl2ZVBhcnRpY2xlc1xuICBjdXJyZW50UGFydGljbGVzLmZvckVhY2goZnVuY3Rpb24ocGFydGljbGUpIHtcbiAgICBpZiAocGFydGljbGUucGFyZW50KSB7XG4gICAgICBwYXJ0aWNsZS5wb3NpdGlvbi54ICs9IHBhcnRpY2xlLnNwZWVkLnggKiBwYXJ0aWNsZS5kaXJlY3Rpb24ueFxuICAgICAgcGFydGljbGUucG9zaXRpb24ueSArPSBwYXJ0aWNsZS5zcGVlZC55ICogcGFydGljbGUuZGlyZWN0aW9uLnlcbiAgICAgIHBhcnRpY2xlLnNwZWVkLnggKz0gcGFydGljbGUuYWNjZWxlcmF0aW9uLnhcbiAgICAgIHBhcnRpY2xlLnNwZWVkLnkgKz0gcGFydGljbGUuYWNjZWxlcmF0aW9uLnlcblxuICAgICAgdmFyIHZlbG9jaXR5ID0gcGFydGljbGUuc3BlZWRcbiAgICAgIHZhciBhbmdsZSA9IDBcblxuICAgICAgaWYgKHZlbG9jaXR5LnggPT09IDApIHtcbiAgICAgICAgYW5nbGUgPSB2ZWxvY2l0eS55ID4gMCA/IDAgOiBNX1BJXG4gICAgICB9IGVsc2UgaWYodmVsb2NpdHkueSA9PT0gMCkge1xuICAgICAgICBhbmdsZSA9IHZlbG9jaXR5LnggPiAwID8gTV9QSV8yIDogMyAqIE1fUElfMlxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYW5nbGUgPSBNYXRoLmF0YW4odmVsb2NpdHkueSAvIHZlbG9jaXR5LngpICsgTV9QSV8yXG4gICAgICB9ICAgXG5cbiAgICAgIGlmICh2ZWxvY2l0eS54ID4gMCkge1xuICAgICAgICBhbmdsZSArPSBNX1BJXG4gICAgICB9XG5cbiAgICAgIHBhcnRpY2xlLnJvdGF0aW9uID0gYW5nbGVcbiAgICAgIC8vIHBhcnRpY2xlLmhlaWdodCA9IDggKiBwYXJ0aWNsZS5zcGVlZC55XG5cbiAgICAgIGlmIChtYXRoVXRpbHMuZGlzdGFuY2UoeyB4OiAwLCB5OiAwIH0sIHBhcnRpY2xlLnBvc2l0aW9uKSA+PSAzMDApIHtcbiAgICAgICAgcGFydGljbGUuYWxwaGEgPSAwXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIGRlYWRQYXJ0aWNsZSA9ICFwYXJ0aWNsZS5wYXJlbnRcblxuICAgIGlmIChkZWFkUGFydGljbGUpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdEZWFkIHBhcnRpY2xlJylcbiAgICB9XG5cbiAgICBpZiAoZGVhZFBhcnRpY2xlIHx8IHBhcnRpY2xlLmFscGhhIDw9IChNYXRoLnJhbmRvbSgpICogNSkgLyA1MCkge1xuICAgICAgdGhpcy5hbGl2ZVBhcnRpY2xlcyA9IF8ud2l0aG91dCh0aGlzLmFsaXZlUGFydGljbGVzLCBwYXJ0aWNsZSlcbiAgICAgIHBhcnRpY2xlUG9vbC5yZWxlYXNlKFtwYXJ0aWNsZV0pXG4gICAgfVxuICB9LmJpbmQodGhpcykpXG5cbiAgaWYgKHRoaXMuYWxpdmVQYXJ0aWNsZXMubGVuZ3RoID09PSAwKSB7XG4gICAgaHViLnNlbmQoJ2VudGl0eTpkZXN0cm95Jywge1xuICAgICAgZW50aXR5OiB0aGlzXG4gICAgfSlcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEV4cGxvc2lvbiIsInZhciBfID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvdW5kZXJzY29yZS1taW4nKTtcbnZhciB3b3JsZCA9IHJlcXVpcmUoJy4vd29ybGQnKTtcblxudmFyIGdsb2JhbENvdW50ID0gMDtcblxudmFyIEVudGl0eSA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmlkICAgICA9ICgrK2dsb2JhbENvdW50KTtcbiAgdGhpcy5ib2R5ICAgPSBudWxsXG4gIHRoaXMuc3ByaXRlID0gbnVsbDtcbn07XG5cbkVudGl0eS5wcm90b3R5cGUuY3JlYXRlID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lKSB7XG4gIGlmICh0aGlzLmJvZHlTcGVjKSB7XG4gICAgdGhpcy5ib2R5U3BlYy5maXh0dXJlLnVzZXJEYXRhID0gdGhpcztcbiAgICB0aGlzLmJvZHkgPSBlbmdpbmUucGh5c2ljcy5jcmVhdGUodGhpcy5ib2R5U3BlYy5ib2R5LCB0aGlzLmJvZHlTcGVjLmZpeHR1cmUpOyAgXG4gIH1cbiAgaWYgKHRoaXMuc3ByaXRlKSB7XG4gICAgZW5naW5lLmdyYXBoaWNzLmFkZCh0aGlzLnNwcml0ZSk7XG4gIH1cbn07XG5cbkVudGl0eS5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSkge1xuICBpZiAodGhpcy5ib2R5KSB7XG4gICAgZW5naW5lLnBoeXNpY3MuZGVzdHJveSh0aGlzLmJvZHkpO1xuICB9XG4gIGlmICh0aGlzLnNwcml0ZSkge1xuICAgIGVuZ2luZS5ncmFwaGljcy5yZW1vdmUodGhpcy5zcHJpdGUpO1xuICB9XG59O1xuXG5FbnRpdHkucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSwgZGVsdGEpIHtcbiAgaWYgKHRoaXMuc3ByaXRlICYmIHRoaXMuYm9keSkge1xuICAgIHRoaXMuc3ByaXRlLnBvc2l0aW9uLnggPSB3b3JsZC50b1BpeGVscyh0aGlzLmJvZHkuR2V0UG9zaXRpb24oKS54KTtcbiAgICB0aGlzLnNwcml0ZS5wb3NpdGlvbi55ID0gd29ybGQudG9QaXhlbHModGhpcy5ib2R5LkdldFBvc2l0aW9uKCkueSk7XG4gICAgdGhpcy5zcHJpdGUucm90YXRpb24gPSB0aGlzLmJvZHkuR2V0QW5nbGUoKTtcbiAgfVxufTtcblxuRW50aXR5LnByb3RvdHlwZS5jb2xsaXNpb24gPSBmdW5jdGlvbihvdGhlciwgcG9pbnRzKSB7XG4gIC8vIG5vdGhpbmdcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRW50aXR5O1xuIiwidmFyIF8gPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS91bmRlcnNjb3JlLW1pbicpO1xudmFyIHdvcmxkID0gcmVxdWlyZSgnLi93b3JsZCcpO1xuXG4vL1xuLy8gQW5jaG9yIGFsd2F5cyBzZWVtcyByZXNldCBmb3IgXCJub3JtYWxcIiBzcHJpdGVzXG4vLyBCdXQgT0sgZm9yIHRpbGluZy4uLiBtYXliZSBkdWUgdG8gdGhpcz9cbi8vXG4vLyAxZjNkZWU5YzRhMWM3MWJlZDljZDEwYzRhMmU4NmZiYmIzNWYxYmJmXG4vLyAxOCBNYXkgMjAxMyAxMTo1NjozOSBQTVxuLy8gUGF0Y2ggUGl4aSB0byBhbGxvdyBzcGVjaWZ5aW5nIGEgY2VudHJhbCBhbmNob3IgZm9yIHRpbGluZyBzcHJpdGVzXG4vLyBcblxuZXhwb3J0cy5zcHJpdGUgPSBmdW5jdGlvbihpbWFnZSwgd2lkdGgsIGhlaWdodCwgcm90YXRpb24pIHtcbiAgdmFyIHNwcml0ZSA9IFBJWEkuU3ByaXRlLmZyb21JbWFnZShpbWFnZSk7XG4gIGluaXQoc3ByaXRlLCB3aWR0aCwgaGVpZ2h0LCByb3RhdGlvbik7XG4gIHNwcml0ZS5hbmNob3IueCA9IDAuNTtcbiAgc3ByaXRlLmFuY2hvci55ID0gMC41O1xuICAvL2NvbnNvbGUubG9nKCdhbmNob3IgPSAnLCBzcHJpdGUuYW5jaG9yKVxuICByZXR1cm4gc3ByaXRlO1xufTtcblxuZXhwb3J0cy51aVNwcml0ZSA9IGZ1bmN0aW9uKGltYWdlLCB3aWR0aCwgaGVpZ2h0LCByb3RhdGlvbikge1xuICB2YXIgc3ByaXRlID0gUElYSS5TcHJpdGUuZnJvbUltYWdlKGltYWdlKTtcbiAgc3ByaXRlLndpZHRoID0gd2lkdGg7ICBcbiAgc3ByaXRlLmhlaWdodCA9IGhlaWdodDtcbiAgc3ByaXRlLnBvc2l0aW9uLnggPSAwO1xuICBzcHJpdGUucG9zaXRpb24ueSA9IDA7XG4gIHNwcml0ZS5hbmNob3IueCA9IDAuNTtcbiAgc3ByaXRlLmFuY2hvci55ID0gMC41O1xuICBzcHJpdGUucm90YXRpb24gPSByb3RhdGlvbiB8fCAwO1xuICByZXR1cm4gc3ByaXRlO1xufTtcblxuZXhwb3J0cy50aWxlID0gZnVuY3Rpb24oaW1hZ2UsIHdpZHRoLCBoZWlnaHQsIHJvdGF0aW9uKSB7XG4gIHZhciB0ZXh0dXJlID0gUElYSS5UZXh0dXJlLmZyb21JbWFnZShpbWFnZSk7XG4gIHZhciBzcHJpdGUgPSBuZXcgUElYSS5UaWxpbmdTcHJpdGUodGV4dHVyZSk7XG4gIHNwcml0ZS50aWxlU2NhbGUgPSBuZXcgUElYSS5Qb2ludCgxLDEpO1xuICBpbml0KHNwcml0ZSwgd2lkdGgsIGhlaWdodCwgcm90YXRpb24pO1xuICBzcHJpdGUuYW5jaG9yLnggPSBzcHJpdGUud2lkdGggIC8gMjtcbiAgc3ByaXRlLmFuY2hvci55ID0gc3ByaXRlLmhlaWdodCAvIDI7XG4gIC8vY29uc29sZS5sb2coJ2FuY2hvciA9ICcsIHNwcml0ZS5hbmNob3IpXG4gIHJldHVybiBzcHJpdGU7XG59O1xuXG5leHBvcnRzLnRleHQgPSBmdW5jdGlvbih0ZXh0LCBzaXplLCBvcHRzKSB7XG4gIG9wdHMgPSBfLmV4dGVuZCh7XG4gICAgICBmb250OiAnJyArIChzaXplIHx8IDUwKSArICdweCBMdWNraWVzdEd1eScsXG4gICAgICBmaWxsOiAnIzAwMCcsXG4gICAgICBhbGlnbjogJ2xlZnQnLFxuICAgICAgc3Ryb2tlOiAnI2ZmZicsXG4gICAgICBzdHJva2VUaGlja25lc3M6IDFcbiAgfSwgb3B0cyk7XG4gIHZhciB0ZXh0ID0gbmV3IFBJWEkuVGV4dCh0ZXh0LCBvcHRzKTtcbiAgdGV4dC5hbmNob3IueCA9IDAuNTtcbiAgcmV0dXJuIHRleHQ7XG59O1xuXG5leHBvcnRzLmFuaW1hdGlvbiA9IGZ1bmN0aW9uKGltYWdlcywgd2lkdGgsIGhlaWdodCkge1xuICB2YXIgdGV4dHVyZXMgPSBpbWFnZXMubWFwKGZ1bmN0aW9uKGkpIHtcbiAgICByZXR1cm4gUElYSS5UZXh0dXJlLmZyb21JbWFnZShpKTtcbiAgfSk7XG4gIHZhciBhbmltID0gbmV3IFBJWEkuTW92aWVDbGlwKHRleHR1cmVzKTtcbiAgaW5pdChhbmltLCB3aWR0aCwgaGVpZ2h0LCAwKTtcbiAgcmV0dXJuIGFuaW07XG59O1xuXG5mdW5jdGlvbiBpbml0KHNwcml0ZSwgd2lkdGgsIGhlaWdodCwgcm90YXRpb24pIHtcbiAgc3ByaXRlLndpZHRoID0gd29ybGQudG9QaXhlbHMod2lkdGgpOyAgXG4gIHNwcml0ZS5oZWlnaHQgPSB3b3JsZC50b1BpeGVscyhoZWlnaHQpO1xuICBzcHJpdGUucG9zaXRpb24ueCA9IDA7XG4gIHNwcml0ZS5wb3NpdGlvbi55ID0gMDtcbiAgc3ByaXRlLnJvdGF0aW9uID0gcm90YXRpb24gfHwgMDtcbn1cbiIsInZhciBfID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvdW5kZXJzY29yZS1taW4nKTtcblxuZXhwb3J0cy5zdGF0aWMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gIHJldHVybiBib2R5RGVmKEJveDJELkR5bmFtaWNzLmIyQm9keS5iMl9zdGF0aWNCb2R5LCBvcHRpb25zKTtcbn07XG5cbmV4cG9ydHMuZHluYW1pYyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgcmV0dXJuIGJvZHlEZWYoQm94MkQuRHluYW1pY3MuYjJCb2R5LmIyX2R5bmFtaWNCb2R5LCBvcHRpb25zKTtcbn07XG5cbmV4cG9ydHMuZml4dHVyZSA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgdmFyIGZpeERlZiA9IG5ldyBCb3gyRC5EeW5hbWljcy5iMkZpeHR1cmVEZWY7XG4gIGZpeERlZi5kZW5zaXR5ID0gb3B0aW9ucy5keW5hbWljcy5kZW5zaXR5O1xuICBmaXhEZWYuZnJpY3Rpb24gPSBvcHRpb25zLmR5bmFtaWNzLmZyaWN0aW9uO1xuICBmaXhEZWYucmVzdGl0dXRpb24gPSBvcHRpb25zLmR5bmFtaWNzLnJlc3RpdHV0aW9uO1xuICBmaXhEZWYuc2hhcGUgPSBvcHRpb25zLnNoYXBlO1xuICBpZiAob3B0aW9ucy5jYXRlZ29yeSkgIHsgZml4RGVmLmZpbHRlci5jYXRlZ29yeUJpdHMgPSBvcHRpb25zLmNhdGVnb3J5OyB9XG4gIGlmIChvcHRpb25zLmNvbGxpc2lvbikgeyBmaXhEZWYuZmlsdGVyLm1hc2tCaXRzID0gb3B0aW9ucy5jb2xsaXNpb247ICAgIH1cbiAgcmV0dXJuIGZpeERlZjtcbn07XG5cbmV4cG9ydHMuc2hhcGUgPSB7XG4gIGNpcmNsZTogZnVuY3Rpb24ocmFkaXVzLCBwb3MpIHtcbiAgICB2YXIgY3MgPSBuZXcgQm94MkQuQ29sbGlzaW9uLlNoYXBlcy5iMkNpcmNsZVNoYXBlO1xuICAgIGNzLlNldFJhZGl1cyhyYWRpdXMpO1xuICAgIGlmIChwb3MpIHtcbiAgICAgIGNzLlNldExvY2FsUG9zaXRpb24ocG9zKTtcbiAgICB9XG4gICAgcmV0dXJuIGNzO1xuICB9LFxuICBib3g6IGZ1bmN0aW9uKHdpZHRoLCBoZWlnaHQsIHBvcywgYW5nbGUpIHtcbiAgICB2YXIgcHMgPSBuZXcgQm94MkQuQ29sbGlzaW9uLlNoYXBlcy5iMlBvbHlnb25TaGFwZTtcbiAgICB2YXIgcG9zID0gcG9zIHx8IG5ldyBCb3gyRC5Db21tb24uTWF0aC5iMlZlYzIoMCwwKTtcbiAgICB2YXIgYW5nbGUgPSBhbmdsZSB8fCAwO1xuICAgIHBzLlNldEFzT3JpZW50ZWRCb3god2lkdGggLyAyLCBoZWlnaHQgLyAyLCBwb3MsIGFuZ2xlKTsgICAvLyBoYWxmLXdpZHRoLCBoYWxmLWhlaWdodFxuICAgIHJldHVybiBwcztcbiAgfVxufTtcblxuZXhwb3J0cy5jYXRlZ29yaWVzID0ge1xuICBBTEw6ICAgICAgIC0xLFxuICBBUkVOQTogICAgIDB4MDAwMSxcbiAgUExBWUVSUzogICAweDAwMDIsXG4gIEJBTEw6ICAgICAgMHgwMDA0LFxuICBQQVJUSUNMRVM6IDB4MDAwOFxufTtcblxuXG5cblxuZnVuY3Rpb24gYm9keURlZih0eXBlLCBvcHRpb25zKSB7XG4gIG9wdGlvbnMgPSBfLmV4dGVuZCh7XG4gICAgeDogMCxcbiAgICB5OiAwLFxuICAgIGFuZ2xlOiAwLFxuICAgIGZpeGVkUm90YXRpb246IGZhbHNlXG4gIH0sIG9wdGlvbnMpO1xuICB2YXIgYmQgPSBuZXcgQm94MkQuRHluYW1pY3MuYjJCb2R5RGVmO1xuICBiZC50eXBlID0gdHlwZTtcbiAgYmQucG9zaXRpb24ueCA9IG9wdGlvbnMueDtcbiAgYmQucG9zaXRpb24ueSA9IG9wdGlvbnMueTtcbiAgYmQuYW5nbGUgPSBvcHRpb25zLmFuZ2xlO1xuICBiZC5maXhlZFJvdGF0aW9uID0gb3B0aW9ucy5maXhlZFJvdGF0aW9uO1xuICByZXR1cm4gYmQ7XG59XG4gIFxuIiwidmFyIGh1YiA9IHJlcXVpcmUoJy4uL2VuZ2luZS9odWInKTtcblxuZnVuY3Rpb24gVGltZUJhc2VkTWVzc2FnZSh0cmlnZ2VyVGltZSwgbWVzc2FnZSwgYXJncykge1xuXG4gIHRoaXMudHJpZ2dlclRpbWUgID0gdHJpZ2dlclRpbWU7XG4gIHRoaXMubWVzc2FnZSAgICAgID0gbWVzc2FnZTtcbiAgdGhpcy5hcmdzICAgICAgICAgPSBhcmdzO1xuICB0aGlzLnRyaWdnZXJlZCAgICA9IGZhbHNlO1xuXG59XG5cblRpbWVCYXNlZE1lc3NhZ2UucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKHRpbWUpIHtcbiAgaWYgKHRoaXMudHJpZ2dlcmVkID09PSBmYWxzZSAmJiB0aW1lIDw9IHRoaXMudHJpZ2dlclRpbWUpIHtcbiAgICBodWIuc2VuZCh0aGlzLm1lc3NhZ2UsIHRoaXMuYXJncyk7XG4gICAgdGhpcy50cmlnZ2VyZWQgPSB0cnVlO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFRpbWVCYXNlZE1lc3NhZ2U7XG4iLCJ2YXIgQ29tcG91bmRFbnRpdHkgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2NvbXBvdW5kLWVudGl0eScpO1xudmFyIEJhY2tncm91bmQgICAgICA9IHJlcXVpcmUoJy4vYmFja2dyb3VuZCcpO1xudmFyIFdhbGwgICAgICAgICAgICA9IHJlcXVpcmUoJy4vd2FsbCcpO1xudmFyIENvbmUgICAgICAgICAgICA9IHJlcXVpcmUoJy4vY29uZScpO1xudmFyIEdvYWwgICAgICAgICAgICA9IHJlcXVpcmUoJy4vZ29hbCcpO1xudmFyIHdvcmxkICAgICAgICAgICA9IHJlcXVpcmUoJy4uL3dvcmxkJyk7XG5cbnZhciBQSSAgICAgPSAzLjE0MTU5O1xudmFyIHdpZHRoICA9IHdvcmxkLndpZHRoO1xudmFyIGhlaWdodCA9IHdvcmxkLmhlaWdodDtcbnZhciB0b3AgICAgPSAzLjQ7XG52YXIgbGVmdCAgID0gMC41O1xudmFyIHJpZ2h0ICA9IHdvcmxkLndpZHRoICAtIDAuNTtcbnZhciBib3R0b20gPSB3b3JsZC5oZWlnaHQgLSAyLjQ7XG5cbmZ1bmN0aW9uIFN0YWRpdW0oKSB7XG4gIFxuICB0aGlzLmlkID0gJ3N0YWRpdW0nO1xuICBcbiAgdGhpcy5lbnRpdGllcyA9IFtdO1xuICB0aGlzLmVudGl0aWVzLnB1c2gobmV3IEJhY2tncm91bmQoKSk7XG4gIFxuICB0aGlzLmVudGl0aWVzLnB1c2gobmV3IFdhbGwoJ3dhbGwtdG9wJywgICAgICAgICAgICAgICB3aWR0aCAvIDIsICAgICAgdG9wLCAgICAgICAgICAgICAgICB3aWR0aCwgICAxLCAgICAgICAgICAgICAgIDApKTtcbiAgdGhpcy5lbnRpdGllcy5wdXNoKG5ldyBXYWxsKCd3YWxsLWJvdHRvbScsICAgICAgICAgICAgd2lkdGggLyAyLCAgICAgIGJvdHRvbSwgICAgICAgICAgICAgd2lkdGgsICAgMSwgICAgICAgICAgICAgICAwKSk7XG4gIHRoaXMuZW50aXRpZXMucHVzaChuZXcgV2FsbCgnd2FsbC1sZWZ0MScsICAgICAgICAgICAgIGxlZnQgICsgMi44LCAgICBoZWlnaHQgKiAwLjg1LzYsICAgIDEsICAgICAgIGhlaWdodCAvIDIuNSwgICAgMC4wOCkpO1xuICB0aGlzLmVudGl0aWVzLnB1c2gobmV3IFdhbGwoJ3dhbGwtbGVmdDInLCAgICAgICAgICAgICBsZWZ0ICArIDEuMSwgICAgaGVpZ2h0ICogNS4xMC82LCAgICAxLCAgICAgICBoZWlnaHQgLyAyLjUsICAgIDAuMDUpKTtcbiAgdGhpcy5lbnRpdGllcy5wdXNoKG5ldyBXYWxsKCd3YWxsLXJpZ2h0MScsICAgICAgICAgICAgcmlnaHQgLSAyLjcsICAgIGhlaWdodCAqIDAuODUvNiwgICAgMSwgICAgICAgaGVpZ2h0IC8gMi41LCAgIC0wLjA2KSk7XG4gIHRoaXMuZW50aXRpZXMucHVzaChuZXcgV2FsbCgnd2FsbC1yaWdodDInLCAgICAgICAgICAgIHJpZ2h0IC0gMS4yLCAgICBoZWlnaHQgKiA1LjEwLzYsICAgIDEsICAgICAgIGhlaWdodCAvIDIuNSwgICAtMC4wNSkpO1xuICB0aGlzLmVudGl0aWVzLnB1c2gobmV3IFdhbGwoJ3dhbGwtZ29hbC1sZWZ0LXRvcCcsICAgICAwLCAgICAgICAgICAgICAgaGVpZ2h0IC8gMiAtIDYuMCwgICA0LCAgICAgICAxLCAgICAgICAgICAgICAgIDApKTtcbiAgdGhpcy5lbnRpdGllcy5wdXNoKG5ldyBXYWxsKCd3YWxsLWdvYWwtbGVmdC1ib3R0b20nLCAgMCwgICAgICAgICAgICAgIGhlaWdodCAvIDIgKyA1LjEsICAgMi43LCAgICAgMSwgICAgICAgICAgICAgICAwKSk7XG4gIHRoaXMuZW50aXRpZXMucHVzaChuZXcgV2FsbCgnd2FsbC1nb2FsLXJpZ2h0LXRvcCcsICAgIHdpZHRoLCAgICAgICAgICBoZWlnaHQgLyAyIC0gNS45LCAgIDQsICAgICAgIDEsICAgICAgICAgICAgICAgMCkpO1xuICB0aGlzLmVudGl0aWVzLnB1c2gobmV3IFdhbGwoJ3dhbGwtZ29hbC1yaWdodC1ib3R0b20nLCB3aWR0aCwgICAgICAgICAgaGVpZ2h0IC8gMiArIDUuMSwgICAyLjUsICAgICAxLCAgICAgICAgICAgICAgIDApKTtcbiAgICBcbiAgdGhpcy5lbnRpdGllcy5wdXNoKG5ldyBDb25lKCdjb25lMScsIHdpZHRoIC8gMTIgKiA2LCAgIGhlaWdodCAvIDUgKiAxLjUpKTtcbiAgdGhpcy5lbnRpdGllcy5wdXNoKG5ldyBDb25lKCdjb25lMicsIHdpZHRoIC8gMTIgKiA2LCAgIGhlaWdodCAvIDUgKiAzLjUpKTtcbiAgXG4gIHRoaXMuZW50aXRpZXMucHVzaChuZXcgR29hbCgnZ29hbHAxJywgMCwgIDAsICAgICAgICAgICAgaGVpZ2h0IC8gMiwgMC41LCAxNCkpO1xuICB0aGlzLmVudGl0aWVzLnB1c2gobmV3IEdvYWwoJ2dvYWxwMicsIDEsICB3b3JsZC53aWR0aCwgIGhlaWdodCAvIDIsIDAuNSwgMTQpKTtcbiAgXG59XG5cblN0YWRpdW0ucHJvdG90eXBlID0gbmV3IENvbXBvdW5kRW50aXR5KCk7XG5cblN0YWRpdW0ucHJvdG90eXBlLnNoYWtlID0gZnVuY3Rpb24oYWdhaW5zdFBsYXllckluZGV4KSB7XG4gIHRoaXMuZW50aXRpZXNbMF0uc2hha2UoYWdhaW5zdFBsYXllckluZGV4KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU3RhZGl1bTtcbiIsInZhciBFbnRpdHkgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9lbnRpdHknKTtcbnZhciBodWIgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9odWInKTtcbnZhciBhc3NldHMgICAgICA9IHJlcXVpcmUoJy4uLy4uL2Fzc2V0cycpO1xuXG5mdW5jdGlvbiBDcm93ZCgpIHtcbiAgdGhpcy5pZCA9ICdjcm93ZCc7XG4gIGh1Yi5zZW5kKCdlbmdpbmUuc291bmQucGxheScsIHNvdW5kKCdjcm93ZCcsIHRydWUsIDAuNykpO1xuICBodWIub24oJ2dhbWUuc2NvcmUnLCB0aGlzLmNoZWVyLmJpbmQodGhpcykpO1xuICBodWIub24oJ2dhbWUuZmluaXNoaW5nJywgdGhpcy5vcmdhbi5iaW5kKHRoaXMpKTtcbiAgaHViLm9uKCdnYW1lLmVuZCcsIHRoaXMuZW5kLmJpbmQodGhpcykpO1xufVxuXG5Dcm93ZC5wcm90b3R5cGUgPSBuZXcgRW50aXR5KCk7XG5cbkNyb3dkLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oKSB7XG4gIGh1Yi5zZW5kKCdlbmdpbmUuc291bmQuc3RvcCcsIHNvdW5kKCdjcm93ZCcpKTtcbn07XG5cbkNyb3dkLnByb3RvdHlwZS5jaGVlciA9IGZ1bmN0aW9uKGFyZ3MpIHtcbiAgaWYgKGFyZ3MuYWdhaW5zdEluZGV4ICE9PSBhcmdzLmJhbGwua2lja2VkQnkpIHtcbiAgICBodWIuc2VuZCgnZW5naW5lLnNvdW5kLnBsYXknLCBzb3VuZCgnY3Jvd2Qtc2NvcmVkJywgZmFsc2UpKTtcbiAgfSBlbHNlIHtcbiAgICBodWIuc2VuZCgnZW5naW5lLnNvdW5kLnBsYXknLCBzb3VuZCgnY3Jvd2Qtb2gnLCBmYWxzZSkpO1xuICB9XG59O1xuXG5Dcm93ZC5wcm90b3R5cGUub3JnYW4gPSBmdW5jdGlvbigpIHtcbiAgLy8gaHViLnNlbmQoJ2VuZ2luZS5zb3VuZC5wbGF5Jywgc291bmQoJ2Nyb3dkLW9yZ2FuJywgZmFsc2UpKTtcbn07XG5cbkNyb3dkLnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbigpIHtcbiAgLy8gaHViLnNlbmQoJ2VuZ2luZS5zb3VuZC5zdG9wJywgc291bmQoJ2Nyb3dkLW9yZ2FuJykpO1xuICAvLyBodWIuc2VuZCgnZW5naW5lLnNvdW5kLnBsYXknLCBzb3VuZCgnY3Jvd2QtZW5kJywgZmFsc2UpKTtcbn07XG5cbmZ1bmN0aW9uIHNvdW5kKG5hbWUsIGxvb3AsIHZvbHVtZSkge1xuICByZXR1cm4ge1xuICAgIGZpbGU6IGFzc2V0cy5zb3VuZChuYW1lKSxcbiAgICBsb29wOiBsb29wLFxuICAgIHZvbHVtZTogdm9sdW1lIHx8IDFcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBDcm93ZDtcbiIsInZhciBQRiAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9waHlzaWNzLWZhY3RvcnknKTtcbnZhciBHRiAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9ncmFwaGljcy1mYWN0b3J5Jyk7XG52YXIgRW50aXR5ICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZW50aXR5Jyk7XG52YXIgd29ybGQgICAgICAgPSByZXF1aXJlKCcuLi93b3JsZCcpO1xudmFyIGh1YiAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2h1YicpO1xudmFyIGFzc2V0cyAgICAgID0gcmVxdWlyZSgnLi4vLi4vYXNzZXRzJyk7XG5cbnZhciBmaXh0dXJlID0gUEYuZml4dHVyZSh7XG4gIHNoYXBlOiAgICAgIFBGLnNoYXBlLmNpcmNsZSgxLjcpLFxuICBkeW5hbWljczogICB7ZGVuc2l0eTogMSwgZnJpY3Rpb246IDAuNSwgcmVzdGl0dXRpb246IDF9LFxuICBjYXRlZ29yeTogICBQRi5jYXRlZ29yaWVzLlBMQVlFUixcbiAgY29sbGlzaW9uOiAgUEYuY2F0ZWdvcmllcy5BUkVOQSB8IFBGLmNhdGVnb3JpZXMuQkFMTFxufSk7XG5cbnZhciBBTklNX1JFU1QgPSAwO1xudmFyIEFOSU1fVVAgICA9IDE7XG52YXIgQU5JTV9ET1dOID0gMjtcblxuZnVuY3Rpb24gUGxheWVyKGlkLCBpbmRleCwgbmFtZSwgeCwgeSkge1xuICBcbiAgdGhpcy5pZCAgICA9IGlkO1xuICB0aGlzLmluZGV4ID0gaW5kZXg7XG4gIHRoaXMubmFtZSAgPSBuYW1lO1xuICBcbiAgdGhpcy5ib2R5U3BlYyA9IHtcbiAgICBib2R5OiBQRi5keW5hbWljKHsgeDogeCwgeTogeSwgZml4ZWRSb3RhdGlvbjogdHJ1ZSB9KSxcbiAgICBmaXh0dXJlOiBmaXh0dXJlXG4gIH07XG4gIFxuICB0aGlzLmNvbnN0cmFpbnRTcGVjID0ge1xuICAgIGJvZHk6IFBGLnN0YXRpYyh7eDogeCwgeTogMH0pLFxuICAgIGZpeHR1cmU6IFBGLmZpeHR1cmUoe1xuICAgICAgc2hhcGU6IFBGLnNoYXBlLmJveCgxLCAxKSxcbiAgICAgIGR5bmFtaWNzOiB7ZGVuc2l0eTogMCwgZnJpY3Rpb246IDAsIHJlc3RpdHV0aW9uOiAwfSxcbiAgICB9KVxuICB9O1xuICBcbiAgaWYgKHRoaXMuaWQgPT09ICdwMScpIHtcbiAgICB0aGlzLnNwcml0ZSA9IEdGLmFuaW1hdGlvbihhc3NldHMuaW1hZ2VzKCdjYXQnLCAnY2F0LXVwJywgJ2NhdC1kb3duJyksIDYsIDYpO1xuICB9IGVsc2Uge1xuICAgIHRoaXMuc3ByaXRlID0gR0YuYW5pbWF0aW9uKGFzc2V0cy5pbWFnZXMoJ2RvZycsICdkb2ctdXAnLCAnZG9nLWRvd24nKSwgNiwgNik7XG4gIH1cbiAgXG59XG5cblBsYXllci5wcm90b3R5cGUgPSBuZXcgRW50aXR5KCk7XG5cblBsYXllci5wcm90b3R5cGUuY3JlYXRlID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lKSB7XG4gIEVudGl0eS5wcm90b3R5cGUuY3JlYXRlLmNhbGwodGhpcywgZW5naW5lLCBnYW1lKTtcbiAgdGhpcy5ib2R5LlNldExpbmVhckRhbXBpbmcoMik7XG4gIHRoaXMuY29uc3RyYWludEJvZHkgPSBlbmdpbmUucGh5c2ljcy5jcmVhdGUodGhpcy5jb25zdHJhaW50U3BlYy5ib2R5LCB0aGlzLmNvbnN0cmFpbnRTcGVjLmZpeHR1cmUpO1xuICB2YXIgdmVydGljYWxBeGlzID0gbmV3IEJveDJELkNvbW1vbi5NYXRoLmIyVmVjMigwLDEpO1xuICB2YXIgam9pbnQgID0gbmV3IEJveDJELkR5bmFtaWNzLkpvaW50cy5iMkxpbmVKb2ludERlZigpO1xuICBqb2ludC5Jbml0aWFsaXplKHRoaXMuY29uc3RyYWludEJvZHksIHRoaXMuYm9keSwgdGhpcy5ib2R5LkdldFBvc2l0aW9uKCksIHZlcnRpY2FsQXhpcyk7XG4gIGVuZ2luZS5waHlzaWNzLmIyd29ybGQuQ3JlYXRlSm9pbnQoam9pbnQpOyAgXG59XG5cblBsYXllci5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSkge1xuICBFbnRpdHkucHJvdG90eXBlLmRlc3Ryb3kuY2FsbCh0aGlzLCBlbmdpbmUsIGdhbWUpO1xuICBlbmdpbmUucGh5c2ljcy5kZXN0cm95KHRoaXMuY29uc3RyYWludEJvZHkpO1xufTtcblxuUGxheWVyLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUsIGRlbHRhKSB7XG4gIEVudGl0eS5wcm90b3R5cGUudXBkYXRlLmNhbGwodGhpcywgZW5naW5lLCBnYW1lLCBkZWx0YSk7XG4gIC8vIFdlIHNob3VsZCBiZSBhYmxlIHRvIHNwZWNpZnkgXCIwLjVcIiwgYW5kIG5vdCBoYXZlIHRvIHVwZGF0ZSBpdCBjb25zdGFudGx5XG4gIC8vIE5lZWQgdG8gY2hlY2sgb3VyIGNoYW5nZXMgdG8gUElYSVxuICB0aGlzLnNwcml0ZS5hbmNob3IueCA9IHRoaXMuc3ByaXRlLnRleHR1cmUud2lkdGggIC8gMjtcbiAgdGhpcy5zcHJpdGUuYW5jaG9yLnkgPSB0aGlzLnNwcml0ZS50ZXh0dXJlLmhlaWdodCAvIDI7XG59O1xuXG5QbGF5ZXIucHJvdG90eXBlLmNvbGxpc2lvbiA9IGZ1bmN0aW9uKG90aGVyLCBwb2ludHMpIHsgICAgXG4gIGlmIChvdGhlci5pZC5tYXRjaCgvYmFsbC8pKSB7XG4gICAgb3RoZXIua2lja2VkQnkgPSB0aGlzLmluZGV4O1xuICAgIGh1Yi5zZW5kKCdlbmdpbmUuc291bmQucGxheScsIHtmaWxlOiAnL2dhbWUvc291bmRzL2JvdW5jZS5tcDMnfSk7XG4gIH0gZWxzZSBpZiAob3RoZXIuaWQubWF0Y2goL3dhbGwvKSkge1xuICAgIHRoaXMuc3ByaXRlLmdvdG9BbmRTdG9wKEFOSU1fUkVTVCk7XG4gICAgdGhpcy5ib2R5LlNldExpbmVhclZlbG9jaXR5KG5ldyBCb3gyRC5Db21tb24uTWF0aC5iMlZlYzIoMCwgNSkpO1xuICB9XG59O1xuXG5QbGF5ZXIucHJvdG90eXBlLm1vdmUgPSBmdW5jdGlvbihkaXIpIHtcbiAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLmVuZEZsYW1lKTtcbiAgdmFyIHkgPSAoZGlyID09PSAndXAnKSA/IC0zMjogMzI7XG4gIHRoaXMuYm9keS5TZXRBd2FrZSh0cnVlKTtcbiAgdGhpcy5ib2R5LlNldExpbmVhclZlbG9jaXR5KG5ldyBCb3gyRC5Db21tb24uTWF0aC5iMlZlYzIoMCwgeSkpO1xuICBpZiAoeSA8IDApIHtcbiAgICB0aGlzLnNwcml0ZS5nb3RvQW5kU3RvcChBTklNX1VQKTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLnNwcml0ZS5nb3RvQW5kU3RvcChBTklNX0RPV04pO1xuICB9XG4gIHRoaXMuZW5kRmxhbWUgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuc3ByaXRlLmdvdG9BbmRTdG9wKDApO1xuICB9LmJpbmQodGhpcyksIDIwMCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFBsYXllcjtcbiIsInZhciBFbnRpdHkgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZW50aXR5Jyk7XG52YXIgR0YgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZ3JhcGhpY3MtZmFjdG9yeScpO1xudmFyIHVzZXJJbnRlcmZhY2UgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvdXNlci1pbnRlcmZhY2UnKTtcblxudmFyIFRFWFRfVE9QICAgICAgICAgID0gdXNlckludGVyZmFjZS51bml0KDIuODUpO1xudmFyIFBMQVlFUlNfTUFSR0lOX1ggID0gdXNlckludGVyZmFjZS51bml0KDIwKTtcblxuZnVuY3Rpb24gSHVkKHRleHQpIHtcbiAgXG4gIHRoaXMuaWQgPSAnaHVkJztcbiAgXG4gIHRoaXMucDFOYW1lID0gR0YudGV4dCgnSm9obiBEb2UnLCB1c2VySW50ZXJmYWNlLnVuaXQoMyksIHtmaWxsOiAnIzAxNTE4ZCcsIHN0cm9rZTogJyNmZmYnLCBzdHJva2VUaGlja25lc3M6IDMgfSk7XG4gIHRoaXMucDFOYW1lLnBvc2l0aW9uLnggPSB1c2VySW50ZXJmYWNlLnVuaXQoMjApIC0gdGhpcy5wMU5hbWUud2lkdGggLyAyO1xuICB0aGlzLnAxTmFtZS5wb3NpdGlvbi55ID0gVEVYVF9UT1A7XG5cbiAgdGhpcy5wMk5hbWUgPSBHRi50ZXh0KCdKb2huIERvZScsIHVzZXJJbnRlcmZhY2UudW5pdCgzKSwge2ZpbGw6ICcjYmYwMDAwJywgc3Ryb2tlOiAnI2ZmZicsIHN0cm9rZVRoaWNrbmVzczogMyB9KTtcbiAgdGhpcy5wMk5hbWUucG9zaXRpb24ueCA9IHVzZXJJbnRlcmZhY2Uud2lkdGggLSB1c2VySW50ZXJmYWNlLnVuaXQoMTcpIC0gdGhpcy5wMk5hbWUud2lkdGggLyAyO1xuICB0aGlzLnAyTmFtZS5wb3NpdGlvbi55ID0gVEVYVF9UT1A7XG5cbiAgdGhpcy5wMVNjb3JlID0gR0YudGV4dCgnMCcsIHVzZXJJbnRlcmZhY2UudW5pdCgzKSwge2ZpbGw6ICcjZmZmJywgc3Ryb2tlOiAnIzAwMCcsIHN0cm9rZVRoaWNrbmVzczogMyB9KTtcbiAgdGhpcy5wMVNjb3JlLnBvc2l0aW9uLnggPSB1c2VySW50ZXJmYWNlLnVuaXQoMzMuNSkgLSB0aGlzLnAxU2NvcmUud2lkdGggLyAyO1xuICB0aGlzLnAxU2NvcmUucG9zaXRpb24ueSA9IFRFWFRfVE9QO1xuXG4gIHRoaXMucDJTY29yZSA9IEdGLnRleHQoJzAnLCB1c2VySW50ZXJmYWNlLnVuaXQoMyksIHtmaWxsOiAnI2ZmZicsIHN0cm9rZTogJyMwMDAnLCBzdHJva2VUaGlja25lc3M6IDMgfSk7XG4gIHRoaXMucDJTY29yZS5wb3NpdGlvbi54ID0gdXNlckludGVyZmFjZS53aWR0aCAtIHVzZXJJbnRlcmZhY2UudW5pdCgzNikgLSB0aGlzLnAyU2NvcmUud2lkdGggLyAyO1xuICB0aGlzLnAyU2NvcmUucG9zaXRpb24ueSA9IFRFWFRfVE9QO1xuXG4gIHRoaXMudGltZSA9IEdGLnRleHQoZm91ckRpZ2l0cygwKSwgdXNlckludGVyZmFjZS51bml0KDMpLCB7ZmlsbDogJyNmZmYnLCBzdHJva2U6ICcjMDAwJywgc3Ryb2tlVGhpY2tuZXNzOiAzIH0pO1xuICB0aGlzLnRpbWUucG9zaXRpb24ueCA9IHVzZXJJbnRlcmZhY2Uud2lkdGggLyAyIC0gdGhpcy50aW1lLndpZHRoIC8gMjtcbiAgdGhpcy50aW1lLnBvc2l0aW9uLnkgPSBURVhUX1RPUDtcbiAgICBcbn07XG5cbkh1ZC5wcm90b3R5cGUgPSBuZXcgRW50aXR5KCk7XG5cbkh1ZC5wcm90b3R5cGUuY3JlYXRlID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lKSB7XG4gIGVuZ2luZS5ncmFwaGljcy5hZGQodGhpcy5wMU5hbWUpO1xuICBlbmdpbmUuZ3JhcGhpY3MuYWRkKHRoaXMucDFTY29yZSk7XG4gIGVuZ2luZS5ncmFwaGljcy5hZGQodGhpcy5wMk5hbWUpO1xuICBlbmdpbmUuZ3JhcGhpY3MuYWRkKHRoaXMucDJTY29yZSk7XG4gIGVuZ2luZS5ncmFwaGljcy5hZGQodGhpcy50aW1lKTtcbn07XG5cbkh1ZC5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSkge1xuICBlbmdpbmUuZ3JhcGhpY3MucmVtb3ZlKHRoaXMucDFOYW1lKTtcbiAgZW5naW5lLmdyYXBoaWNzLnJlbW92ZSh0aGlzLnAxU2NvcmUpO1xuICBlbmdpbmUuZ3JhcGhpY3MucmVtb3ZlKHRoaXMucDJOYW1lKTtcbiAgZW5naW5lLmdyYXBoaWNzLnJlbW92ZSh0aGlzLnAyU2NvcmUpO1xuICBlbmdpbmUuZ3JhcGhpY3MucmVtb3ZlKHRoaXMudGltZSk7XG59O1xuXG5IdWQucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSwgZGVsdGEpIHtcbiAgdmFyIHAxID0gZ2FtZS5wbGF5ZXJzWzBdO1xuICB2YXIgcDIgPSBnYW1lLnBsYXllcnNbMV07XG4gIHRoaXMucDFOYW1lLnNldFRleHQocDEubmFtZSk7XG4gIHRoaXMucDFTY29yZS5zZXRUZXh0KHAxLnNjb3JlLnRvU3RyaW5nKCkpO1xuICB0aGlzLnAyTmFtZS5zZXRUZXh0KHAyLm5hbWUpO1xuICB0aGlzLnAyU2NvcmUuc2V0VGV4dChwMi5zY29yZS50b1N0cmluZygpKTtcbiAgdGhpcy50aW1lLnNldFRleHQoZm91ckRpZ2l0cyhnYW1lLnRpbWVSZW1haW5pbmcpKTtcbn07XG5cbmZ1bmN0aW9uIGZvdXJEaWdpdHMobWlsbGlzZWNvbmRzKSB7XG4gIHZhciBzZWNvbmRzID0gTWF0aC5mbG9vcihtaWxsaXNlY29uZHMgLyAxMDAwKTtcbiAgdmFyIHBhZGRlZCA9IChzZWNvbmRzIDwgMTApID8gKCcwJyArIHNlY29uZHMpIDogc2Vjb25kcztcbiAgcmV0dXJuICcwMDonICsgcGFkZGVkO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEh1ZDtcbiIsInZhciBHRiAgICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2dyYXBoaWNzLWZhY3RvcnknKTtcbnZhciBFbnRpdHkgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2VudGl0eScpO1xudmFyIHVzZXJJbnRlcmZhY2UgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvdXNlci1pbnRlcmZhY2UnKTtcbnZhciBtYXRoVXRpbHMgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL21hdGgtdXRpbHMnKTtcbnZhciBhc3NldHMgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vYXNzZXRzJyk7XG5cbnZhciBQSSAgICAgICAgICAgICAgPSAzLjE0O1xudmFyIFNUUkVUQ0hfQ0lSQ0xFICA9ICA4MDsgIC8vIG1pbGxpc1xudmFyIFNUUkVUQ0hfU1BMQVNIICA9IDE4MDsgIC8vIG1pbGxpc1xudmFyIFNUUkVUQ0hfTElORSAgICA9IDMwMDsgIC8vIG1pbGxpc1xuXG5mdW5jdGlvbiBCb29tKGlkLCBhZ2FpbnN0UGxheWVySW5kZXgpIHtcbiAgXG4gIHRoaXMuaWQgPSBpZDtcbiAgXG4gIHZhciB4ID0gKGFnYWluc3RQbGF5ZXJJbmRleCA9PT0gMCkgPyAwIDogdXNlckludGVyZmFjZS53aWR0aDtcbiAgXG4gIHRoaXMuY2lyY2xlID0gR0YudWlTcHJpdGUoYXNzZXRzLmltYWdlKCdib29tLWNpcmNsZScpLCAwLCB1c2VySW50ZXJmYWNlLmhlaWdodCAvIDIsIDApO1xuICB0aGlzLmNpcmNsZS5wb3NpdGlvbi54ID0geDtcbiAgdGhpcy5jaXJjbGUucG9zaXRpb24ueSA9IHVzZXJJbnRlcmZhY2UuaGVpZ2h0IC8gMjtcblxuICB0aGlzLnNwbGFzaCA9IEdGLnVpU3ByaXRlKGFzc2V0cy5pbWFnZSgnYm9vbS1zcGxhc2gnKSwgMCwgdXNlckludGVyZmFjZS5oZWlnaHQgLyAxLjIsIDApO1xuICB0aGlzLnNwbGFzaC5wb3NpdGlvbi54ID0geDtcbiAgdGhpcy5zcGxhc2gucG9zaXRpb24ueSA9IHVzZXJJbnRlcmZhY2UuaGVpZ2h0IC8gMjtcblxuICB0aGlzLmxpbmUgPSBHRi51aVNwcml0ZShhc3NldHMuaW1hZ2UoJ2Jvb20tbGluZScpLCAwLCB1c2VySW50ZXJmYWNlLmhlaWdodCAvIDQsIDApO1xuICB0aGlzLmxpbmUucG9zaXRpb24ueCA9IHg7XG4gIHRoaXMubGluZS5wb3NpdGlvbi55ID0gdXNlckludGVyZmFjZS5oZWlnaHQgLyAyO1xuXG4gIGlmIChhZ2FpbnN0UGxheWVySW5kZXggPT09IDEpIHtcbiAgICB0aGlzLmNpcmNsZS5yb3RhdGlvbiA9IFBJO1xuICAgIHRoaXMuc3BsYXNoLnJvdGF0aW9uID0gUEk7XG4gICAgdGhpcy5saW5lLnJvdGF0aW9uICA9IFBJO1xuICB9XG4gIFxuICB0aGlzLnRpbWUgPSAwO1xuICBcbn1cblxuQm9vbS5wcm90b3R5cGUgPSBuZXcgRW50aXR5KCk7XG5cbkJvb20ucHJvdG90eXBlLmNyZWF0ZSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSkge1xuICBlbmdpbmUuZ3JhcGhpY3MuYWRkKHRoaXMuY2lyY2xlKTtcbiAgZW5naW5lLmdyYXBoaWNzLmFkZCh0aGlzLnNwbGFzaCk7XG4gIGVuZ2luZS5ncmFwaGljcy5hZGQodGhpcy5saW5lKTtcbn07XG5cbkJvb20ucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgZW5naW5lLmdyYXBoaWNzLnJlbW92ZSh0aGlzLmNpcmNsZSk7XG4gIGVuZ2luZS5ncmFwaGljcy5yZW1vdmUodGhpcy5zcGxhc2gpO1xuICBlbmdpbmUuZ3JhcGhpY3MucmVtb3ZlKHRoaXMubGluZSk7XG59O1xuXG5Cb29tLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUsIGRlbHRhKSB7XG4gIHRoaXMuY2lyY2xlLmFuY2hvci55ID0gdGhpcy5jaXJjbGUudGV4dHVyZS5oZWlnaHQgLyAyO1xuICB0aGlzLnNwbGFzaC5hbmNob3IueSA9IHRoaXMuc3BsYXNoLnRleHR1cmUuaGVpZ2h0IC8gMjtcbiAgdGhpcy5saW5lLmFuY2hvci55ICA9IHRoaXMubGluZS50ZXh0dXJlLmhlaWdodCAgLyAyO1xuXG4gIHRoaXMudGltZSA9IHRoaXMudGltZSArIGRlbHRhO1xuICB2YXIgc3RyZXRjaENpcmNsZSA9IG1hdGhVdGlscy5jbGFtcCh0aGlzLnRpbWUsIDAsIFNUUkVUQ0hfQ0lSQ0xFKTtcbiAgdmFyIHN0cmV0Y2hTcGxhc2ggPSBtYXRoVXRpbHMuY2xhbXAodGhpcy50aW1lLCAwLCBTVFJFVENIX1NQTEFTSCk7XG4gIHZhciBzdHJldGNoTGluZSAgID0gbWF0aFV0aWxzLmNsYW1wKHRoaXMudGltZSwgMCwgU1RSRVRDSF9MSU5FKTtcbiAgXG4gIHRoaXMuY2lyY2xlLndpZHRoID0gaW50ZXJwb2xhdGUoc3RyZXRjaENpcmNsZSwgMCwgU1RSRVRDSF9DSVJDTEUsIDAsIHRoaXMuY2lyY2xlLmhlaWdodCAqIDAuNzEpO1xuICB0aGlzLnNwbGFzaC53aWR0aCA9IGludGVycG9sYXRlKHN0cmV0Y2hTcGxhc2gsIDAsIFNUUkVUQ0hfU1BMQVNILCAwLCB0aGlzLnNwbGFzaC5oZWlnaHQgKiAwLjUpO1xuICB0aGlzLmxpbmUud2lkdGggICA9IGludGVycG9sYXRlKHN0cmV0Y2hMaW5lLCAgIDAsIFNUUkVUQ0hfTElORSwgICAwLCB0aGlzLmxpbmUuaGVpZ2h0ICAgKiA3LjI2KTtcbiAgXG4gIGlmICh0aGlzLnRpbWUgPj0gU1RSRVRDSF9DSVJDTEUpIHsgdGhpcy5jaXJjbGUuYWxwaGEgKj0gMC45NTsgfVxuICBpZiAodGhpcy50aW1lID49IFNUUkVUQ0hfU1BMQVNIKSB7IHRoaXMuc3BsYXNoLmFscGhhICo9IDAuOTU7IH1cbiAgaWYgKHRoaXMudGltZSA+PSBTVFJFVENIX0xJTkUpICAgeyB0aGlzLmxpbmUuYWxwaGEgICAqPSAwLjk1OyB9XG59O1xuXG5mdW5jdGlvbiBpbnRlcnBvbGF0ZShjdXJyZW50LCBpbnB1dE1pbiwgaW5wdXRNYXgsIG91dHB1dE1pbiwgb3V0cHV0TWF4KSB7XG4gIHJldHVybiBvdXRwdXRNaW4gKyAoY3VycmVudCAvIChpbnB1dE1heC1pbnB1dE1pbikpICogKG91dHB1dE1heCAtIG91dHB1dE1pbik7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQm9vbTtcbiIsInZhciBFbnRpdHkgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZW50aXR5Jyk7XG52YXIgR0YgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZ3JhcGhpY3MtZmFjdG9yeScpO1xudmFyIHVzZXJJbnRlcmZhY2UgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvdXNlci1pbnRlcmZhY2UnKTtcblxuZnVuY3Rpb24gV2lubmVyKGlkLCBwMSwgcDIpIHtcbiAgXG4gIHRoaXMuaWQgPSBpZDtcbiAgXG4gIHZhciBiZyAgID0gKHAxLnNjb3JlID09PSBwMi5zY29yZSkgPyAnL2dhbWUvaW1hZ2VzL2VuZC1kcmF3LnBuZycgOiAnL2dhbWUvaW1hZ2VzL2VuZC13aW5uZXIucG5nJztcbiAgdmFyIG5hbWUgPSAocDEuc2NvcmUgPiBwMi5zY29yZSkgPyBwMS5uYW1lIDogcDIubmFtZTtcbiAgXG4gIHRoaXMuYmFja2dyb3VuZCA9IEdGLnVpU3ByaXRlKGJnLCB1c2VySW50ZXJmYWNlLndpZHRoLCB1c2VySW50ZXJmYWNlLmhlaWdodCk7XG4gIHRoaXMuYmFja2dyb3VuZC5wb3NpdGlvbi54ID0gdXNlckludGVyZmFjZS53aWR0aCAgLyAyIC0gdGhpcy5iYWNrZ3JvdW5kLndpZHRoICAvIDI7XG4gIHRoaXMuYmFja2dyb3VuZC5wb3NpdGlvbi55ID0gdXNlckludGVyZmFjZS5oZWlnaHQgLyAyIC0gdGhpcy5iYWNrZ3JvdW5kLmhlaWdodCAvIDI7XG4gICAgXG4gIGlmIChwMS5zY29yZSAhPSBwMi5zY29yZSkge1xuICAgIHRoaXMubmFtZSA9IEdGLnRleHQobmFtZSwgNDUsIHtmaWxsOiAnIzAxNTE4ZCcsIHN0cm9rZTogJyNmZmYnLCBzdHJva2VUaGlja25lc3M6IDN9KTtcbiAgICB0aGlzLm5hbWUucG9zaXRpb24ueCA9IHVzZXJJbnRlcmZhY2Uud2lkdGggLyAyIC0gdGhpcy5uYW1lLndpZHRoIC8gMiAtIDIwO1xuICAgIHRoaXMubmFtZS5wb3NpdGlvbi55ID0gdXNlckludGVyZmFjZS51bml0KDE1KTtcbiAgfVxuICBcbn07XG5cbldpbm5lci5wcm90b3R5cGUgPSBuZXcgRW50aXR5KCk7XG5cbldpbm5lci5wcm90b3R5cGUuY3JlYXRlID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lKSB7XG4gIGVuZ2luZS5ncmFwaGljcy5hZGQodGhpcy5iYWNrZ3JvdW5kKTtcbiAgaWYgKHRoaXMubmFtZSkge1xuICAgIGVuZ2luZS5ncmFwaGljcy5hZGQodGhpcy5uYW1lKTtcbiAgfVxufTtcblxuV2lubmVyLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lKSB7XG4gIGVuZ2luZS5ncmFwaGljcy5yZW1vdmUodGhpcy5iYWNrZ3JvdW5kKTtcbiAgaWYgKHRoaXMubmFtZSkge1xuICAgIGVuZ2luZS5ncmFwaGljcy5yZW1vdmUodGhpcy5uYW1lKTtcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBXaW5uZXI7XG4iLCJ2YXIgXyA9IHJlcXVpcmUoJy4uLy4uLy4uLzNyZHBhcnR5L3VuZGVyc2NvcmUtbWluJyk7XG52YXIgRW50aXR5ID0gcmVxdWlyZSgnLi9lbnRpdHknKTtcblxudmFyIGdsb2JhbENvdW50ID0gMDtcblxudmFyIENvbXBvdW5kRW50aXR5ID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuaWQgICAgICAgPSAoKytnbG9iYWxDb3VudCk7XG4gIHRoaXMuZW50aXRpZXMgPSBbXTtcbn07XG5cbkNvbXBvdW5kRW50aXR5LnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbihlbmdpbmUsIGdhbWUpIHtcbiAgdGhpcy5lbnRpdGllcy5mb3JFYWNoKGZ1bmN0aW9uKGVudGl0eSkge1xuICAgIGVudGl0eS5jcmVhdGUoZW5naW5lLCBnYW1lKTtcbiAgfSk7XG59O1xuXG5Db21wb3VuZEVudGl0eS5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSkge1xuICB0aGlzLmVudGl0aWVzLmZvckVhY2goZnVuY3Rpb24oZW50aXR5KSB7XG4gICAgZW50aXR5LmRlc3Ryb3koZW5naW5lLCBnYW1lKTtcbiAgfSk7XG59O1xuXG5Db21wb3VuZEVudGl0eS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lKSB7XG4gIHRoaXMuZW50aXRpZXMuZm9yRWFjaChmdW5jdGlvbihlbnRpdHkpIHtcbiAgICBlbnRpdHkudXBkYXRlKGVuZ2luZSwgZ2FtZSk7XG4gIH0pO1xufTtcblxuQ29tcG91bmRFbnRpdHkucHJvdG90eXBlLmNvbGxpc2lvbiA9IGZ1bmN0aW9uKG90aGVyLCBwb2ludHMpIHtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQ29tcG91bmRFbnRpdHk7XG4iLCJ2YXIgR0YgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZ3JhcGhpY3MtZmFjdG9yeScpO1xudmFyIEVudGl0eSAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2VudGl0eScpO1xudmFyIHdvcmxkICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL3dvcmxkJyk7XG52YXIgYXNzZXRzICAgICAgPSByZXF1aXJlKCcuLi8uLi9hc3NldHMnKTtcbnZhciBnYW1lV29ybGQgICA9IHJlcXVpcmUoJy4uL3dvcmxkJyk7XG5cbmZ1bmN0aW9uIEJhY2tncm91bmQoaW1hZ2UpIHtcbiAgdGhpcy5pZCA9ICdiYWNrZ3JvdW5kJztcbiAgdGhpcy5zcHJpdGUgPSBHRi5hbmltYXRpb24oYXNzZXRzLmltYWdlcygnc3RhZGl1bScsICdzdGFkaXVtLXNoYWtlLXJpZ2h0JywgJ3N0YWRpdW0tc2hha2UtbGVmdCcpLCBnYW1lV29ybGQud2lkdGgsIGdhbWVXb3JsZC5oZWlnaHQpO1xufVxuXG5CYWNrZ3JvdW5kLnByb3RvdHlwZSA9IG5ldyBFbnRpdHkoKTtcblxuQmFja2dyb3VuZC5wcm90b3R5cGUuc2hha2UgPSBmdW5jdGlvbihhZ2FpbnN0UGxheWVySW5kZXgpIHtcbiAgdGhpcy5zcHJpdGUuZ290b0FuZFN0b3AoYWdhaW5zdFBsYXllckluZGV4ID09PSAwID8gMiA6IDEpO1xuICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuc3ByaXRlLmdvdG9BbmRTdG9wKGFnYWluc3RQbGF5ZXJJbmRleCA9PT0gMCA/IDEgOiAyKTtcbiAgfS5iaW5kKHRoaXMpLCA1MCk7XG4gIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5zcHJpdGUuZ290b0FuZFN0b3AoMCk7XG4gIH0uYmluZCh0aGlzKSwgMTAwKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQmFja2dyb3VuZDtcbiIsInZhciBfICAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uLy4uLy4uLzNyZHBhcnR5L3VuZGVyc2NvcmUtbWluJyk7XG52YXIgUEYgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvcGh5c2ljcy1mYWN0b3J5Jyk7XG52YXIgR0YgICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZ3JhcGhpY3MtZmFjdG9yeScpO1xudmFyIEVudGl0eSAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2VudGl0eScpO1xudmFyIHdvcmxkICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL3dvcmxkJyk7XG52YXIgaHViICAgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvaHViJyk7XG52YXIgYXNzZXRzICAgICAgPSByZXF1aXJlKCcuLi8uLi9hc3NldHMnKTtcblxudmFyIFBJID0gMy4xNDE1OTtcblxudmFyIGZpeHR1cmVPcHRzID0ge1xuICBkeW5hbWljczogICB7ZGVuc2l0eTogMS41LCBmcmljdGlvbjogMSwgcmVzdGl0dXRpb246IDF9LFxuICBjYXRlZ29yeTogICBQRi5jYXRlZ29yaWVzLkFSRU5BLFxuICBjb2xsaXNpb246ICBQRi5jYXRlZ29yaWVzLkFMTFxufTtcblxuZnVuY3Rpb24gQ29uZShpZCwgeCwgeSkge1xuICB0aGlzLmlkID0gaWQ7XG4gIHRoaXMuc3ByaXRlID0gR0Yuc3ByaXRlKGFzc2V0cy5pbWFnZSgnY29uZScpLCAyLjUsIDQpO1xuICB0aGlzLmJvZHlTcGVjID0ge1xuICAgIGJvZHk6IFBGLmR5bmFtaWMoeyB4OiB4LCB5OiB5LCBmaXhlZFJvdGF0aW9uOiB0cnVlIH0pLFxuICAgIGZpeHR1cmU6IFBGLmZpeHR1cmUoXy5leHRlbmQoZml4dHVyZU9wdHMsIHtcbiAgICAgIHNoYXBlOiBQRi5zaGFwZS5jaXJjbGUoMC43LCBuZXcgQm94MkQuQ29tbW9uLk1hdGguYjJWZWMyKDAsMC42KSlcbiAgICB9KSlcbiAgfTtcbn1cblxuQ29uZS5wcm90b3R5cGUgPSBuZXcgRW50aXR5KCk7XG5cbkNvbmUucHJvdG90eXBlLmNyZWF0ZSA9IGZ1bmN0aW9uKGVuZ2luZSwgZ2FtZSkge1xuICBFbnRpdHkucHJvdG90eXBlLmNyZWF0ZS5jYWxsKHRoaXMsIGVuZ2luZSwgZ2FtZSk7XG4gIHZhciBvdGhlckZpeHR1cmUgPSBQRi5maXh0dXJlKF8uZXh0ZW5kKGZpeHR1cmVPcHRzLCB7XG4gICAgc2hhcGU6IFBGLnNoYXBlLmJveCgwLjcsIDEuOSwgbmV3IEJveDJELkNvbW1vbi5NYXRoLmIyVmVjMigwLC0wLjEpKVxuICB9KSk7XG4gIG90aGVyRml4dHVyZS51c2VyRGF0YSA9IHRoaXM7XG4gIHRoaXMuYm9keS5DcmVhdGVGaXh0dXJlKG90aGVyRml4dHVyZSk7XG4gIHRoaXMuYm9keS5TZXRMaW5lYXJEYW1waW5nKDYpO1xufTtcblxuQ29uZS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24oZW5naW5lLCBnYW1lLCBkZWx0YSkge1xuICBFbnRpdHkucHJvdG90eXBlLnVwZGF0ZS5jYWxsKHRoaXMsIGRlbHRhKTtcbiAgLy8gV2Ugc2hvdWxkIGJlIGFibGUgdG8gc3BlY2lmeSBcIjAuNVwiLCBhbmQgbm90IGhhdmUgdG8gdXBkYXRlIGl0IGNvbnN0YW50bHlcbiAgLy8gTmVlZCB0byBjaGVjayBvdXIgY2hhbmdlcyB0byBQSVhJXG4gIHRoaXMuc3ByaXRlLmFuY2hvci54ID0gdGhpcy5zcHJpdGUudGV4dHVyZS53aWR0aCAgLyAyO1xuICB0aGlzLnNwcml0ZS5hbmNob3IueSA9IHRoaXMuc3ByaXRlLnRleHR1cmUuaGVpZ2h0IC8gMztcbn07XG5cbkNvbmUucHJvdG90eXBlLmNvbGxpc2lvbiA9IGZ1bmN0aW9uKG90aGVyLCBwb2ludHMpIHsgICAgXG4gIGlmIChvdGhlci5pZC5tYXRjaCgvYmFsbC8pKSB7XG4gICAgb3RoZXIua2lja2VkQnkgPSB0aGlzLmluZGV4O1xuICAgIGh1Yi5zZW5kKCdlbmdpbmUuc291bmQucGxheScsIHtmaWxlOiAnL2dhbWUvc291bmRzL2JvdW5jZS5tcDMnfSk7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQ29uZTtcbiIsInZhciBQRiAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9waHlzaWNzLWZhY3RvcnknKTtcbnZhciBHRiAgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9ncmFwaGljcy1mYWN0b3J5Jyk7XG52YXIgRW50aXR5ICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvZW50aXR5Jyk7XG52YXIgd29ybGQgICAgICAgPSByZXF1aXJlKCcuLi8uLi9lbmdpbmUvd29ybGQnKTtcblxuZnVuY3Rpb24gV2FsbChpZCwgeCwgeSwgd2lkdGgsIGhlaWdodCwgcm90YXRpb24pIHtcbiAgdGhpcy5pZCA9IGlkO1xuICB0aGlzLmJvZHlTcGVjID0ge1xuICAgIGJvZHk6IFBGLnN0YXRpYyh7XG4gICAgICB4OiB4LFxuICAgICAgeTogeSxcbiAgICAgIGFuZ2xlOiByb3RhdGlvbiB8fCAwXG4gICAgfSksXG4gICAgZml4dHVyZTogUEYuZml4dHVyZSh7XG4gICAgICBzaGFwZTogICAgICBQRi5zaGFwZS5ib3god2lkdGgsIGhlaWdodCksXG4gICAgICBkeW5hbWljczogICB7ZGVuc2l0eTogMSwgZnJpY3Rpb246IDAuMSwgcmVzdGl0dXRpb246IDF9LFxuICAgICAgY2F0ZWdvcnk6ICAgUEYuY2F0ZWdvcmllcy5BUkVOQSxcbiAgICAgIGNvbGxpc2lvbjogIFBGLmNhdGVnb3JpZXMuQUxMXG4gICAgfSlcbiAgfTtcbiAgLy8gdGhpcy5zcHJpdGUgPSBHRi50aWxlKCcvZ2FtZS9pbWFnZXMvd2FsbC5wbmcnLCB3aWR0aCwgaGVpZ2h0LCByb3RhdGlvbik7XG4gIC8vIHRoaXMuc3ByaXRlLnBvc2l0aW9uLnggPSB3b3JsZC50b1BpeGVscyh4KTtcbiAgLy8gdGhpcy5zcHJpdGUucG9zaXRpb24ueSA9IHdvcmxkLnRvUGl4ZWxzKHkpO1xufVxuXG5XYWxsLnByb3RvdHlwZSA9IG5ldyBFbnRpdHkoKTtcblxubW9kdWxlLmV4cG9ydHMgPSBXYWxsO1xuIiwidmFyIFBGICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL3BoeXNpY3MtZmFjdG9yeScpO1xudmFyIEdGICAgICAgICAgID0gcmVxdWlyZSgnLi4vLi4vZW5naW5lL2dyYXBoaWNzLWZhY3RvcnknKTtcbnZhciBFbnRpdHkgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9lbnRpdHknKTtcbnZhciBodWIgICAgICAgICA9IHJlcXVpcmUoJy4uLy4uL2VuZ2luZS9odWInKTtcblxuZnVuY3Rpb24gR29hbChpZCwgcGxheWVySW5kZXgsIHgsIHksIHdpZHRoLCBoZWlnaHQsIHJvdGF0aW9uKSB7XG4gIHRoaXMuaWQgPSBpZDtcbiAgdGhpcy5wbGF5ZXJJbmRleCA9IHBsYXllckluZGV4O1xuICB0aGlzLmJvZHlTcGVjID0ge1xuICAgIGJvZHk6IFBGLnN0YXRpYyh7XG4gICAgICB4OiB4LFxuICAgICAgeTogeSxcbiAgICAgIGFuZ2xlOiByb3RhdGlvbiB8fCAwXG4gICAgfSksXG4gICAgZml4dHVyZTogUEYuZml4dHVyZSh7XG4gICAgICBzaGFwZTogICAgICBQRi5zaGFwZS5ib3god2lkdGgsIGhlaWdodCksXG4gICAgICBkeW5hbWljczogICB7ZGVuc2l0eTogMSwgZnJpY3Rpb246IDAsIHJlc3RpdHV0aW9uOiAxfSxcbiAgICAgIGNhdGVnb3J5OiAgIFBGLmNhdGVnb3JpZXMuQVJFTkEsXG4gICAgICBjb2xsaXNpb246ICBQRi5jYXRlZ29yaWVzLkFMTFxuICAgIH0pXG4gIH07XG4gIC8vIHRoaXMuc3ByaXRlID0gR0Yuc3ByaXRlKCcvZ2FtZS9pbWFnZXMvZ29hbC5wbmcnLCB3aWR0aCwgaGVpZ2h0LCByb3RhdGlvbik7XG59XG5cbkdvYWwucHJvdG90eXBlID0gbmV3IEVudGl0eSgpO1xuXG5Hb2FsLnByb3RvdHlwZS5jb2xsaXNpb24gPSBmdW5jdGlvbihvdGhlciwgcG9pbnRzKSB7ICAgIFxuICBpZiAob3RoZXIuaWQubWF0Y2goL2JhbGw6LykpIHtcbiAgICBodWIuc2VuZCgnZ2FtZS5zY29yZScsIHtcbiAgICAgIGJhbGw6IG90aGVyLFxuICAgICAgYWdhaW5zdEluZGV4OiB0aGlzLnBsYXllckluZGV4LFxuICAgIH0pO1xuICAgIGh1Yi5zZW5kKCdlbmdpbmUuZXhwbG9zaW9uJywge1xuICAgICAgc291cmNlOiBwb2ludHNbMF0sXG4gICAgICBzaXplOiAnbGFyZ2UnXG4gICAgfSk7XG4gIH1cbn07XG5cbkdvYWwucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKGRlbHRhKSB7XG4gIEVudGl0eS5wcm90b3R5cGUudXBkYXRlLmNhbGwodGhpcywgZGVsdGEpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBHb2FsO1xuIl19
;