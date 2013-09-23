;(function(e,t,n){function i(n,s){if(!t[n]){if(!e[n]){var o=typeof require=="function"&&require;if(!s&&o)return o(n,!0);if(r)return r(n,!0);throw new Error("Cannot find module '"+n+"'")}var u=t[n]={exports:{}};e[n][0].call(u.exports,function(t){var r=e[n][1][t];return i(r?r:t)},u,u.exports)}return t[n].exports}var r=typeof require=="function"&&require;for(var s=0;s<n.length;s++)i(n[s]);return i})({1:[function(require,module,exports){
var routie = require('../../3rdparty/routie');
var tappable = require('../../3rdparty/tappable');
var player = require('./player');

window.Device = function() {
  
  routie({
      '':            require('./controllers/register'),
      '/register':   require('./controllers/register'),
      '/wait':       require('./controllers/wait'),
      '/join':       require('./controllers/join'),
      '/lobby':      require('./controllers/lobby'),
      '/gamepad':    require('./controllers/gamepad'),
      '/thanks':     require('./controllers/thanks')
  });
  
  $('#menu').on('click', function() {
    if (window.confirm('disconnect player?')) {
      player.reset();
      routie.navigate('/');
    }
  });
  
};

},{"../../3rdparty/routie":2,"../../3rdparty/tappable":3,"./player":4,"./controllers/register":5,"./controllers/wait":6,"./controllers/join":7,"./controllers/lobby":8,"./controllers/gamepad":9,"./controllers/thanks":10}],2:[function(require,module,exports){
(function (root, factory) {
  if (typeof exports === 'object') {
    module.exports = factory(window);
  } else if (typeof define === 'function' && define.amd) {
    define([], function () {
      return (root.routie = factory(window));
    });
  } else {
    root.routie = factory(window);
  }
}(this, function (w) {

  var routes = [];
  var map = {};
  var reference = "routie";
  var oldReference = w[reference];

  var Route = function(path, name) {
    this.name = name;
    this.path = path;
    this.keys = [];
    this.fns = [];
    this.params = {};
    this.regex = pathToRegexp(this.path, this.keys, false, false);

  };

  Route.prototype.addHandler = function(fn) {
    this.fns.push(fn);
  };

  Route.prototype.removeHandler = function(fn) {
    for (var i = 0, c = this.fns.length; i < c; i++) {
      var f = this.fns[i];
      if (fn == f) {
        this.fns.splice(i, 1);
        return;
      }
    }
  };

  Route.prototype.run = function(params) {
    for (var i = 0, c = this.fns.length; i < c; i++) {
      this.fns[i].apply(this, params);
    }
  };

  Route.prototype.match = function(path, params){
    var m = this.regex.exec(path);

    if (!m) return false;


    for (var i = 1, len = m.length; i < len; ++i) {
      var key = this.keys[i - 1];

      var val = ('string' == typeof m[i]) ? decodeURIComponent(m[i]) : m[i];

      if (key) {
        this.params[key.name] = val;
      }
      params.push(val);
    }

    return true;
  };

  Route.prototype.toURL = function(params) {
    var path = this.path;
    for (var param in params) {
      path = path.replace('/:'+param, '/'+params[param]);
    }
    path = path.replace(/\/:.*\?/g, '/').replace(/\?/g, '');
    if (path.indexOf(':') != -1) {
      throw new Error('missing parameters for url: '+path);
    }
    return path;
  };

  var pathToRegexp = function(path, keys, sensitive, strict) {
    if (path instanceof RegExp) return path;
    if (path instanceof Array) path = '(' + path.join('|') + ')';
    path = path
      .concat(strict ? '' : '/?')
      .replace(/\/\(/g, '(?:/')
      .replace(/\+/g, '__plus__')
      .replace(/(\/)?(\.)?:(\w+)(?:(\(.*?\)))?(\?)?/g, function(_, slash, format, key, capture, optional){
        keys.push({ name: key, optional: !! optional });
        slash = slash || '';
        return '' + (optional ? '' : slash) + '(?:' + (optional ? slash : '') + (format || '') + (capture || (format && '([^/.]+?)' || '([^/]+?)')) + ')' + (optional || '');
      })
      .replace(/([\/.])/g, '\\$1')
      .replace(/__plus__/g, '(.+)')
      .replace(/\*/g, '(.*)');
    return new RegExp('^' + path + '$', sensitive ? '' : 'i');
  };

  var addHandler = function(path, fn) {
    var s = path.split(' ');
    var name = (s.length == 2) ? s[0] : null;
    path = (s.length == 2) ? s[1] : s[0];

    if (!map[path]) {
      map[path] = new Route(path, name);
      routes.push(map[path]);
    }
    map[path].addHandler(fn);
  };

  var routie = function(path, fn) {
    if (typeof fn == 'function') {
      addHandler(path, fn);
      routie.reload();
    } else if (typeof path == 'object') {
      for (var p in path) {
        addHandler(p, path[p]);
      }
      routie.reload();
    } else if (typeof fn === 'undefined') {
      routie.navigate(path);
    }
  };

  routie.lookup = function(name, obj) {
    for (var i = 0, c = routes.length; i < c; i++) {
      var route = routes[i];
      if (route.name == name) {
        return route.toURL(obj);
      }
    }
  };

  routie.remove = function(path, fn) {
    var route = map[path];
    if (!route)
      return;
    route.removeHandler(fn);
  };

  routie.removeAll = function() {
    map = {};
    routes = [];
  };

  routie.navigate = function(path, options) {
    options = options || {};
    var silent = options.silent || false;

    if (silent) {
      removeListener();
    }
    setTimeout(function() {
      window.location.hash = path;

      if (silent) {
        setTimeout(function() { 
          addListener();
        }, 1);
      }

    }, 1);
  };

  routie.noConflict = function() {
    w[reference] = oldReference;
    return routie;
  };

  var getHash = function() {
    return window.location.hash.substring(1);
  };

  var checkRoute = function(hash, route) {
    var params = [];
    if (route.match(hash, params)) {
      route.run(params);
      return true;
    }
    return false;
  };

  var hashChanged = routie.reload = function() {
    var hash = getHash();
    for (var i = 0, c = routes.length; i < c; i++) {
      var route = routes[i];
      if (checkRoute(hash, route)) {
        return;
      }
    }
  };

  var addListener = function() {
    if (w.addEventListener) {
      w.addEventListener('hashchange', hashChanged, false);
    } else {
      w.attachEvent('onhashchange', hashChanged);
    }
  };

  var removeListener = function() {
    if (w.removeEventListener) {
      w.removeEventListener('hashchange', hashChanged);
    } else {
      w.detachEvent('onhashchange', hashChanged);
    }
  };
  addListener();

  return routie;
}));

},{}],3:[function(require,module,exports){
(function(){(function(root, factory){
  // Set up Tappable appropriately for the environment.
  if (typeof define === 'function' && define.amd){
    // AMD
    define('tappable', [], function(){
      factory(root, window.document);
      return root.tappable;
    });
  } else {
    // Browser global scope
    factory(root, window.document);
  }
}(this, function(w, d){

  var abs = Math.abs,
    noop = function(){},
    defaults = {
      noScroll: false,
      activeClass: 'tappable-active',
      onTap: noop,
      onStart: noop,
      onMove: noop,
      onMoveOut: noop,
      onMoveIn: noop,
      onEnd: noop,
      onCancel: noop,
      allowClick: false,
      boundMargin: 50,
      noScrollDelay: 0,
      activeClassDelay: 0,
      inactiveClassDelay: 0
    },
    supportTouch = 'ontouchend' in document,
    events = {
      start: supportTouch ? 'touchstart' : 'mousedown',
      move: supportTouch ? 'touchmove' : 'mousemove',
      end: supportTouch ? 'touchend' : 'mouseup'
    },
    getTargetByCoords = function(x, y){
      var el = d.elementFromPoint(x, y);
      if (el.nodeType == 3) el = el.parentNode;
      return el;
    },
    getTarget = function(e){
      var el = e.target;
      if (el) {
        if (el.nodeType == 3) el = el.parentNode;
        return el;
      }
      var touch = e.targetTouches[0];
      return getTargetByCoords(touch.clientX, touch.clientY);
    },
    clean = function(str){
      return str.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    },
    addClass = function(el, className){
      if (!className) return;
      if (el.classList){
        el.classList.add(className);
        return;
      }
      if (clean(el.className).indexOf(className) > -1) return;
      el.className = clean(el.className + ' ' + className);
    },
    removeClass = function(el, className){
      if (!className) return;
      if (el.classList){
        el.classList.remove(className);
        return;
      }
      el.className = el.className.replace(new RegExp('(^|\\s)' + className + '(?:\\s|$)'), '$1');
    },
    matchesSelector = function(node, selector){
      var root = d.documentElement,
        matches = root.matchesSelector || root.mozMatchesSelector || root.webkitMatchesSelector || root.oMatchesSelector || root.msMatchesSelector;
      return matches.call(node, selector);
    },
    closest = function(node, selector){
      var matches = false;
      do {
        matches = matchesSelector(node, selector);
      } while (!matches && (node = node.parentNode) && node.ownerDocument);
      return matches ? node : false;
    };

  w.tappable = function(selector, opts){
    if (typeof opts == 'function') opts = { onTap: opts };
    var options = {};
    for (var key in defaults) options[key] = opts[key] || defaults[key];

    var el = options.containerElement || d.body,
      startTarget,
      prevTarget,
      startX,
      startY,
      elBound,
      cancel = false,
      moveOut = false,
      activeClass = options.activeClass,
      activeClassDelay = options.activeClassDelay,
      activeClassTimeout,
      inactiveClassDelay = options.inactiveClassDelay,
      inactiveClassTimeout,
      noScroll = options.noScroll,
      noScrollDelay = options.noScrollDelay,
      noScrollTimeout,
      boundMargin = options.boundMargin;

    var onStart = function(e){
      var target = closest(getTarget(e), selector);
      if (!target) return;

      if (activeClassDelay){
        clearTimeout(activeClassTimeout);
        activeClassTimeout = setTimeout(function(){
          addClass(target, activeClass);
        }, activeClassDelay);
      } else {
        addClass(target, activeClass);
      }
      if (inactiveClassDelay && target == prevTarget) clearTimeout(inactiveClassTimeout);

      startX = e.clientX;
      startY = e.clientY;
      if (!startX || !startY){
        var touch = e.targetTouches[0];
        startX = touch.clientX;
        startY = touch.clientY;
      }
      startTarget = target;
      cancel = false;
      moveOut = false;
      elBound = noScroll ? target.getBoundingClientRect() : null;

      if (noScrollDelay){
        clearTimeout(noScrollTimeout);
        noScroll = false; // set false first, then true after a delay
        noScrollTimeout = setTimeout(function(){
          noScroll = true;
        }, noScrollDelay);
      }
      options.onStart.call(el, e, target);
    };

    var onMove = function(e){
      if (!startTarget) return;

      if (noScroll){
        e.preventDefault();
      } else {
        clearTimeout(activeClassTimeout);
      }

      var target = e.target,
        x = e.clientX,
        y = e.clientY;
      if (!target || !x || !y){ // The event might have a target but no clientX/Y
        var touch = e.changedTouches[0];
        if (!x) x = touch.clientX;
        if (!y) y = touch.clientY;
        if (!target) target = getTargetByCoords(x, y);
      }

      if (noScroll){
        if (x>elBound.left-boundMargin && x<elBound.right+boundMargin && y>elBound.top-boundMargin && y<elBound.bottom+boundMargin){ // within element's boundary
          moveOut = false;
          addClass(startTarget, activeClass);
          options.onMoveIn.call(el, e, target);
        } else {
          moveOut = true;
          removeClass(startTarget, activeClass);
          options.onMoveOut.call(el, e, target);
        }
      } else if (!cancel && abs(y - startY) > 10){
        cancel = true;
        removeClass(startTarget, activeClass);
        options.onCancel.call(target, e);
      }

      options.onMove.call(el, e, target);
    };

    var onEnd = function(e){
      if (!startTarget) return;

      clearTimeout(activeClassTimeout);
      if (inactiveClassDelay){
        if (activeClassDelay && !cancel) addClass(startTarget, activeClass);
        var activeTarget = startTarget;
        inactiveClassTimeout = setTimeout(function(){
          removeClass(activeTarget, activeClass);
        }, inactiveClassDelay);
      } else {
        removeClass(startTarget, activeClass);
      }

      options.onEnd.call(el, e, startTarget);

      var rightClick = e.which == 3 || e.button == 2;
      if (!cancel && !moveOut && !rightClick){
        options.onTap.call(el, e, startTarget);
      }

      prevTarget = startTarget;
      startTarget = null;
      setTimeout(function(){
        startX = startY = null;
      }, 400);
    };

    var onCancel = function(e){
      if (!startTarget) return;
      removeClass(startTarget, activeClass);
      startTarget = startX = startY = null;
      options.onCancel.call(el, e);
    };

    var onClick = function(e){
      var target = closest(e.target, selector);
      if (target){
        e.preventDefault();
      } else if (startX && startY && abs(e.clientX - startX) < 25 && abs(e.clientY - startY) < 25){
        e.stopPropagation();
        e.preventDefault();
      }
    };

    el.addEventListener(events.start, onStart, false);

    el.addEventListener(events.move, onMove, false);

    el.addEventListener(events.end, onEnd, false);

    el.addEventListener('touchcancel', onCancel, false);

    if (!options.allowClick) el.addEventListener('click', onClick, false);

    return {
      el : el,
      destroy : function () {
        el.removeEventListener(events.start, onStart, false);
        el.removeEventListener(events.move, onMove, false);
        el.removeEventListener(events.end, onEnd, false);
        el.removeEventListener('touchcancel', onCancel, false);
        if (!options.allowClick) el.removeEventListener('click', onClick, false);

        return this;
      }
    };

  };

}));
})()
},{}],5:[function(require,module,exports){
var routie = require('../../../3rdparty/routie');
var player = require('../player');
var view = require('../../views/register-advanced.hbs');

module.exports = function() {
  
  if (player.get().id) {
    return routie.navigate('/wait');
  }
  
  $('#page').attr('class', 'register');
  $('#page').html(view());
  
  $('button').on('click', register);
  
};

function register(e) {
  var data = {
    firstName:    $('#firstName').val(),
    lastName:     $('#lastName').val(),
    company:      $('#company').val(),
    country:      $('#country').val(),
    role:         $('#role').val(),
    email:        $('#email').val()
  };
  console.log("FIELDS", data);
  $.ajax({
    type: 'POST',
    url: '/player',
    data: JSON.stringify(data),
    dataType: 'json',
    contentType: 'application/json; charset=utf-8'
  }).then(go).fail(error);
  
  // $.post('/player', data).then(go).fail(error);
  return false
}

function go(data) {
  player.set({
    id: data.id,
    name: data.name
  });
  routie.navigate('/wait');
}

function error(res) {
  alert('Error: ' + res);
}

},{"../../views/register-advanced.hbs":11,"../../../3rdparty/routie":2,"../player":4}],7:[function(require,module,exports){
var routie = require('../../../3rdparty/routie');
var player = require('../player');
var view = require('../../views/join.hbs');

module.exports = function() {
  
  if (player.get().id == undefined) {
    routie.navigate('/connect');
  }
  
  $('#page').attr('class', 'join');
  $('#page').html(view());
  $('button').on('click', joinLobby);

};

function joinLobby(e) {
  e.preventDefault();
  var data = { playerId: player.get().id };
  $.post('/game/players', data).then(joined).fail(backToWait);
}

function joined(data) {
  routie.navigate('/lobby');
}

function backToWait() {
  routie.navigate('/wait');
}

},{"../../views/join.hbs":12,"../../../3rdparty/routie":2,"../player":4}],10:[function(require,module,exports){
var routie = require('../../../3rdparty/routie');
var view = require('../../views/thanks.hbs');

module.exports = function() {
  
  $('#page').attr('class', 'thanks');
  $('#page').html(view());
  
  setTimeout(function() {
    routie.navigate('/connect');
  }, 4000);
  
};

},{"../../views/thanks.hbs":13,"../../../3rdparty/routie":2}],4:[function(require,module,exports){
var _ = require('underscore');
var player = null;

var KEY = 'player';

exports.get = function() {
  if (!player) {
    load();
  }
  return player;
};

exports.set = function(attrs) {
  player = _.extend(player || {}, attrs);
  save();
};

exports.reset = function() {
  player = null;
  window.localStorage.removeItem(KEY);
};

function load() {
  player = JSON.parse(window.localStorage.getItem(KEY) || '{}');
}

function save() {
  window.localStorage.setItem(KEY, JSON.stringify(player));
}

},{"underscore":14}],14:[function(require,module,exports){
(function(){//     Underscore.js 1.4.4
//     http://underscorejs.org
//     (c) 2009-2013 Jeremy Ashkenas, DocumentCloud Inc.
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `global` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var push             = ArrayProto.push,
      slice            = ArrayProto.slice,
      concat           = ArrayProto.concat,
      toString         = ObjProto.toString,
      hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.4.4';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, l = obj.length; i < l; i++) {
        if (iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      for (var key in obj) {
        if (_.has(obj, key)) {
          if (iterator.call(context, obj[key], key, obj) === breaker) return;
        }
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results[results.length] = iterator.call(context, value, index, list);
    });
    return results;
  };

  var reduceError = 'Reduce of empty array with no initial value';

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var length = obj.length;
    if (length !== +length) {
      var keys = _.keys(obj);
      length = keys.length;
    }
    each(obj, function(value, index, list) {
      index = keys ? keys[--length] : --length;
      if (!initial) {
        memo = obj[index];
        initial = true;
      } else {
        memo = iterator.call(context, memo, obj[index], index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    return _.filter(obj, function(value, index, list) {
      return !iterator.call(context, value, index, list);
    }, context);
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result || (result = iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `include`.
  _.contains = _.include = function(obj, target) {
    if (obj == null) return false;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    return any(obj, function(value) {
      return value === target;
    });
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    var isFunc = _.isFunction(method);
    return _.map(obj, function(value) {
      return (isFunc ? method : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs, first) {
    if (_.isEmpty(attrs)) return first ? null : [];
    return _[first ? 'find' : 'filter'](obj, function(value) {
      for (var key in attrs) {
        if (attrs[key] !== value[key]) return false;
      }
      return true;
    });
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.where(obj, attrs, true);
  };

  // Return the maximum element or (element-based computation).
  // Can't optimize arrays of integers longer than 65,535 elements.
  // See: https://bugs.webkit.org/show_bug.cgi?id=80797
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.max.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity, value: -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed >= result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.min.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity, value: Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array.
  _.shuffle = function(obj) {
    var rand;
    var index = 0;
    var shuffled = [];
    each(obj, function(value) {
      rand = _.random(index++);
      shuffled[index - 1] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // An internal function to generate lookup iterators.
  var lookupIterator = function(value) {
    return _.isFunction(value) ? value : function(obj){ return obj[value]; };
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, value, context) {
    var iterator = lookupIterator(value);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value : value,
        index : index,
        criteria : iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index < right.index ? -1 : 1;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(obj, value, context, behavior) {
    var result = {};
    var iterator = lookupIterator(value || _.identity);
    each(obj, function(value, index) {
      var key = iterator.call(context, value, index, obj);
      behavior(result, key, value);
    });
    return result;
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = function(obj, value, context) {
    return group(obj, value, context, function(result, key, value) {
      (_.has(result, key) ? result[key] : (result[key] = [])).push(value);
    });
  };

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = function(obj, value, context) {
    return group(obj, value, context, function(result, key) {
      if (!_.has(result, key)) result[key] = 0;
      result[key]++;
    });
  };

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator, context) {
    iterator = iterator == null ? _.identity : lookupIterator(iterator);
    var value = iterator.call(context, obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely convert anything iterable into a real, live array.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (obj.length === +obj.length) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    return (n != null) && !guard ? slice.call(array, 0, n) : array[0];
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n != null) && !guard) {
      return slice.call(array, Math.max(array.length - n, 0));
    } else {
      return array[array.length - 1];
    }
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, (n == null) || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, output) {
    each(input, function(value) {
      if (_.isArray(value)) {
        shallow ? push.apply(output, value) : flatten(value, shallow, output);
      } else {
        output.push(value);
      }
    });
    return output;
  };

  // Return a completely flattened version of an array.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator, context) {
    if (_.isFunction(isSorted)) {
      context = iterator;
      iterator = isSorted;
      isSorted = false;
    }
    var initial = iterator ? _.map(array, iterator, context) : array;
    var results = [];
    var seen = [];
    each(initial, function(value, index) {
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {
        seen.push(value);
        results.push(array[index]);
      }
    });
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(concat.apply(ArrayProto, arguments));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.contains(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var args = slice.call(arguments);
    var length = _.max(_.pluck(args, 'length'));
    var results = new Array(length);
    for (var i = 0; i < length; i++) {
      results[i] = _.pluck(args, "" + i);
    }
    return results;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    if (list == null) return {};
    var result = {};
    for (var i = 0, l = list.length; i < l; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i = 0, l = array.length;
    if (isSorted) {
      if (typeof isSorted == 'number') {
        i = (isSorted < 0 ? Math.max(0, l + isSorted) : isSorted);
      } else {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);
    for (; i < l; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item, from) {
    if (array == null) return -1;
    var hasIndex = from != null;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);
    }
    var i = (hasIndex ? from : array.length);
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var len = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(len);

    while(idx < len) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = function(func, context) {
    if (func.bind === nativeBind && nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    var args = slice.call(arguments, 2);
    return function() {
      return func.apply(context, args.concat(slice.call(arguments)));
    };
  };

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context.
  _.partial = function(func) {
    var args = slice.call(arguments, 1);
    return function() {
      return func.apply(this, args.concat(slice.call(arguments)));
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length === 0) funcs = _.functions(obj);
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time.
  _.throttle = function(func, wait) {
    var context, args, timeout, result;
    var previous = 0;
    var later = function() {
      previous = new Date;
      timeout = null;
      result = func.apply(context, args);
    };
    return function() {
      var now = new Date;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0) {
        clearTimeout(timeout);
        timeout = null;
        previous = now;
        result = func.apply(context, args);
      } else if (!timeout) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, result;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) result = func.apply(context, args);
      };
      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) result = func.apply(context, args);
      return result;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      memo = func.apply(this, arguments);
      func = null;
      return memo;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func];
      push.apply(args, arguments);
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    if (times <= 0) return func();
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys[keys.length] = key;
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var values = [];
    for (var key in obj) if (_.has(obj, key)) values.push(obj[key]);
    return values;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var pairs = [];
    for (var key in obj) if (_.has(obj, key)) pairs.push([key, obj[key]]);
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    for (var key in obj) if (_.has(obj, key)) result[obj[key]] = key;
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    each(keys, function(key) {
      if (key in obj) copy[key] = obj[key];
    });
    return copy;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    for (var key in obj) {
      if (!_.contains(keys, key)) copy[key] = obj[key];
    }
    return copy;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          if (obj[prop] == null) obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the Harmony `egal` proposal: http://wiki.ecmascript.org/doku.php?id=harmony:egal.
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) return bStack[length] == b;
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;
        }
      }
    } else {
      // Objects with different constructors are not equivalent, but `Object`s
      // from different frames are.
      var aCtor = a.constructor, bCtor = b.constructor;
      if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&
                               _.isFunction(bCtor) && (bCtor instanceof bCtor))) {
        return false;
      }
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return result;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, [], []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) == '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Optimize `isFunction` if appropriate.
  if (typeof (/./) !== 'function') {
    _.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj != +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function(n, iterator, context) {
    var accum = Array(n);
    for (var i = 0; i < n; i++) accum[i] = iterator.call(context, i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // List of HTML entities for escaping.
  var entityMap = {
    escape: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;'
    }
  };
  entityMap.unescape = _.invert(entityMap.escape);

  // Regexes containing the keys and values listed immediately above.
  var entityRegexes = {
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')
  };

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  _.each(['escape', 'unescape'], function(method) {
    _[method] = function(string) {
      if (string == null) return '';
      return ('' + string).replace(entityRegexes[method], function(match) {
        return entityMap[method][match];
      });
    };
  });

  // If the value of the named property is a function then invoke it;
  // otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return null;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name){
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result.call(this, func.apply(_, args));
      };
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    var render;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = new RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset)
        .replace(escaper, function(match) { return '\\' + escapes[match]; });

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      }
      if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      }
      if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }
      index = offset + match.length;
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + "return __p;\n";

    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(obj) {
    return this._chain ? _(obj).chain() : obj;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];
      return result.call(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result.call(this, method.apply(this._wrapped, arguments));
    };
  });

  _.extend(_.prototype, {

    // Start chaining a wrapped Underscore object.
    chain: function() {
      this._chain = true;
      return this;
    },

    // Extracts the result from a wrapped and chained object.
    value: function() {
      return this._wrapped;
    }

  });

}).call(this);

})()
},{}],6:[function(require,module,exports){
var rx = require('rxjs');
var routie = require('../../../3rdparty/routie');
var player = require('../player');
var view = require('../../views/wait.hbs');
require('../../../3rdparty/rx.zepto');

module.exports = function() {
  
  if (player.get().id == undefined) {
    routie.navigate('/connect');
  }
  
  $('#page').attr('class', 'wait');
  $('#page').html(view());

  var observable = rx.Observable
    .interval(3000)
    .startWith(-1)
    .selectMany(observableLobby)
    .skipWhile(gameInProgress)
    .take(1)
    .subscribe(switchState, onError);

};

function observableLobby() {
  return $.getJSONAsObservable('/game/status');
}

function gameInProgress(res) {
  return res.data.inProgress === true;
}

function switchState() {
  routie.navigate('/join');
}

function onError() {
  console.log('Game not responding');
}

},{"../../views/wait.hbs":15,"../../../3rdparty/routie":2,"../player":4,"../../../3rdparty/rx.zepto":16,"rxjs":17}],8:[function(require,module,exports){
var rx = require('rxjs');
var routie = require('../../../3rdparty/routie');
var player = require('../player');
var view = require('../../views/lobby.hbs');
require('../../../3rdparty/rx.zepto');

module.exports = function() {
  
  if (player.get().id == undefined) {
    routie.navigate('/connect');
  }
  
  $('#page').attr('class', 'lobby');
  $('#page').html(view());
  $('#cancel').on('click', exitLobby);

  var observable = rx.Observable
    .interval(1000)
    .startWith(-1)
    .selectMany(observableLobby)
    .skipWhile(waitingForOtherPlayer)
    .take(1)
    .subscribe(startMatch, onError);

};

function observableLobby() {
  return $.getJSONAsObservable('/game/status');
}

function waitingForOtherPlayer(res) {
  return res.data.inProgress === false;
}

function startMatch() {
  routie.navigate('/gamepad');
}

function onError() {
  console.log('Game not responding');
}

function exitLobby() {
  $.ajax({
    type: 'DELETE',
    url: '/game/players/' + player.get().id
  }).then(backToWait);
}

function backToWait() {
  routie.navigate('/wait');
}

},{"../../views/lobby.hbs":18,"../../../3rdparty/routie":2,"../player":4,"../../../3rdparty/rx.zepto":16,"rxjs":17}],9:[function(require,module,exports){
var rx = require('rxjs');
var routie = require('../../../3rdparty/routie');
var player = require('../player');
var view = require('../../views/gamepad.hbs');
var observable = null;
var socket = null

module.exports = function() {

  if (player.get().id == undefined) {
    routie.navigate('/connect');
  }

  socket = io.connect('/')
  
  $('#page').attr('class', 'gamepad');
  $('#page').html(view());

  observable = rx.Observable
    .interval(2000)
    .startWith(-1)
    .selectMany(observableGame)
    .subscribe(checkGameStatus, onError);

  if ('ontouchstart' in window) {
    $('.button.up').on('touchstart', goUp);
    $('.button.up').on('touchend', stop);
    $('.button.down').on('touchstart', goDown);
    $('.button.down').on('touchend', stop);
  } else {
    $('.button.up').on('mousedown', goUp);
    $('.button.up').on('mouseup', stop);
    $('.button.down').on('mousedown', goDown);
    $('.button.down').on('mouseup', stop);
  }
  
};

function goUp(e) {
  e.preventDefault();
  $(e.currentTarget).addClass('pressed');
  sendAction('up');
}

function goDown(e) {
  e.preventDefault();
  $(e.currentTarget).addClass('pressed');
  sendAction('down');
}

function stop(e) {
  e.preventDefault();
  $(e.currentTarget).removeClass('pressed');
}

function sendAction(actionName) {
  socket.emit('move', { player: player.get().id, action: actionName })
}

function observableGame() {
  return $.getJSONAsObservable('/game/status');
}

function checkGameStatus(res) {
  if (res.data.inProgress) {
    var idx = currentPlayerIndex(res.data.players);
    if (idx === null) {
      observable.dispose();
      routie.navigate('/wait');
    } else {
      $('#page .player').addClass('p' + (idx+1));
    }
  } else {
    observable.dispose();
    routie.navigate('/join');
  }
}

function currentPlayerIndex(players) {
  if (players[0].id === player.get().id) return 0;
  if (players[1].id === player.get().id) return 1;
  return null;
}

function onError() {
  console.log('Game not responding');
}

},{"../../views/gamepad.hbs":19,"../../../3rdparty/routie":2,"../player":4,"rxjs":17}],16:[function(require,module,exports){
(function(){// Copyright (c) Microsoft Open Technologies, Inc. All rights reserved. See License.txt in the project root for license information.
(function (root, factory) {
    module.exports = factory(root, module.exports, require('rxjs'), $);
}(this, function (global, exp, root, $, undefined) {
        // Headers
    var root = global.Rx,
        observable = root.Observable,
        observableProto = observable.prototype,
        AsyncSubject = root.AsyncSubject,
        observableCreate = observable.create,
        observableCreateWithDisposable = observable.createWithDisposable,
        disposableEmpty = root.Disposable.empty,
        slice = Array.prototype.slice,
        proto = $.fn;
        
    $.Deferred.prototype.toObservable = function () {
        var subject = new AsyncSubject();
        this.done(function () {
            subject.onNext(slice.call(arguments));
            subject.onCompleted();
        }).fail(function () {
            subject.onError(slice.call(arguments));
        });
        return subject;
    };

    observableProto.toDeferred = function () {
        var deferred = $.Deferred();
        this.subscribe(function (value) {
            deferred.resolve(value);
        }, function (e) { 
            deferred.reject(e);
        });
        return deferred;
    };

    var ajaxAsObservable = $.ajaxAsObservable = function(settings) {
        var subject = new AsyncSubject();

        var internalSettings = {
            success: function(data, textStatus, jqXHR) {
                subject.onNext({ data: data, textStatus: textStatus, jqXHR: jqXHR });
                subject.onCompleted();
            },
            error: function(jqXHR, textStatus, errorThrown) {
                subject.onError({ jqXHR: jqXHR, textStatus: textStatus, errorThrown: errorThrown });
            }
        };
        
        $.extend(true, internalSettings, settings);

        $.ajax(internalSettings);

        return subject;
    };

    $.getAsObservable = function(url, data, dataType) {
        return ajaxAsObservable({ url: url, dataType: dataType, data: data });
    };

    $.getJSONAsObservable = function(url, data) {
        return ajaxAsObservable({ url: url, dataType: 'json', data: data });
    };


    $.postAsObservable = function(url, data, dataType) {
        return ajaxAsObservable({ url: url, dataType: dataType, data: data, type: 'POST'});	
    };

    return root;

}));

})()
},{"rxjs":17}],15:[function(require,module,exports){
var Handlebars = require('handlebars-runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "\n<h1>match in progress</h1>\n\n<p>\n  As soon as the current match is finished,\n  you'll be able to join the action!\n</p>\n";
  });

},{"handlebars-runtime":20}],11:[function(require,module,exports){
var Handlebars = require('handlebars-runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "\n<h1>Register To Play</h1>\n\n<form>\n  \n  <div class=\"field\">\n    <label>First name</label>\n    <input id=\"firstName\" type=\"text\" value=\"\" autocorrect=\"off\" />\n  </div>\n  \n  <div class=\"field\">\n    <label>Last name</label>\n    <input id=\"lastName\" type=\"text\" value=\"\" autocorrect=\"off\" />\n  </div>\n\n  <div class=\"field\">\n    <label>Email</label>\n    <input id=\"email\" type=\"email\" value=\"\" autocorrect=\"off\" />\n  </div>\n  \n  <div class=\"field\">\n    <label>Company</label>\n    <input id=\"company\" type=\"text\" value=\"\" autocorrect=\"off\" />\n  </div>\n  \n  <div class=\"field\">\n    <label>Role</label>\n	<select required id=\"role\">\n	<option value=\"Select Role\" selected>Select Role</option>\n	<option value=\"C-Level Executive\">C-Level Executive</option>\n	<option value=\"VP or Director\">VP or Director</option>\n	<option value=\"Manager\">Manager</option>\n	<option value=\"Project Manager\">Project Manager</option>\n	<option value=\"Team Lead\">Team Lead</option>\n	<option value=\"Architect\">Architect</option>\n	<option value=\"Developer\">Developer</option>\n	<option value=\"Consultant\">Consultant</option>\n	<option value=\"Student\">Student</option>\n	<option value=\"Press/Analyst\">Press/Analyst</option>\n	</select>\n  </div>\n\n  <div class=\"field\">\n    <label>Country</label>\n	<select required id=\"country\">\n	<option value=\"Select Country\" selected>Select Country</option>\n	<option value=\"AF\">Afghanistan</option>\n	<option value=\"AX\">Åland Islands</option>\n	<option value=\"AL\">Albania</option>\n	<option value=\"DZ\">Algeria</option>\n	<option value=\"AS\">American Samoa</option>\n	<option value=\"AD\">Andorra</option>\n	<option value=\"AO\">Angola</option>\n	<option value=\"AI\">Anguilla</option>\n	<option value=\"AQ\">Antarctica</option>\n	<option value=\"AG\">Antigua and Barbuda</option>\n	<option value=\"AR\">Argentina</option>\n	<option value=\"AM\">Armenia</option>\n	<option value=\"AW\">Aruba</option>\n	<option value=\"AU\">Australia</option>\n	<option value=\"AT\">Austria</option>\n	<option value=\"AZ\">Azerbaijan</option>\n	<option value=\"BS\">Bahamas</option>\n	<option value=\"BH\">Bahrain</option>\n	<option value=\"BD\">Bangladesh</option>\n	<option value=\"BB\">Barbados</option>\n	<option value=\"BY\">Belarus</option>\n	<option value=\"BE\">Belgium</option>\n	<option value=\"BZ\">Belize</option>\n	<option value=\"BJ\">Benin</option>\n	<option value=\"BM\">Bermuda</option>\n	<option value=\"BT\">Bhutan</option>\n	<option value=\"Bolivia\">Bolivia</option>\n	<option value=\"BO\">Plurinational State of</option>\n	<option value=\"BA\">Bosnia and Herzegovina</option>\n	<option value=\"BW\">Botswana</option>\n	<option value=\"BV\">Bouvet Island</option>\n	<option value=\"BR\">Brazil</option>\n	<option value=\"IO\">British Indian Ocean Territory</option>\n	<option value=\"BN\">Brunei Darussalam</option>\n	<option value=\"BG\">Bulgaria</option>\n	<option value=\"BF\">Burkina Faso</option>\n	<option value=\"BI\">Burundi</option>\n	<option value=\"KH\">Cambodia</option>\n	<option value=\"CM\">Cameroon</option>\n	<option value=\"CA\">Canada</option>\n	<option value=\"CV\">Cape Verde</option>\n	<option value=\"KY\">Cayman Islands</option>\n	<option value=\"CF\">Central African Republic</option>\n	<option value=\"TD\">Chad</option>\n	<option value=\"CL\">Chile</option>\n	<option value=\"CN\">China</option>\n	<option value=\"CX\">Christmas Island</option>\n	<option value=\"CC\">Cocos (Keeling) Islands</option>\n	<option value=\"CO\">Colombia</option>\n	<option value=\"KM\">Comoros</option>\n	<option value=\"CG\">Congo</option>\n	<option value=\"Congo\">Congo</option>\n	<option value=\"CD\">The Democratic Republic of the</option>\n	<option value=\"CK\">Cook Islands</option>\n	<option value=\"CR\">Costa Rica</option>\n	<option value=\"CI\">Côte D'Ivoire</option>\n	<option value=\"HR\">Croatia</option>\n	<option value=\"CU\">Cuba</option>\n	<option value=\"CY\">Cyprus</option>\n	<option value=\"CZ\">Czech Republic</option>\n	<option value=\"DK\">Denmark</option>\n	<option value=\"DJ\">Djibouti</option>\n	<option value=\"DM\">Dominica</option>\n	<option value=\"DO\">Dominican Republic</option>\n	<option value=\"EC\">Ecuador</option>\n	<option value=\"EG\">Egypt</option>\n	<option value=\"SV\">El Salvador</option>\n	<option value=\"GQ\">Equatorial Guinea</option>\n	<option value=\"ER\">Eritrea</option>\n	<option value=\"EE\">Estonia</option>\n	<option value=\"ET\">Ethiopia</option>\n	<option value=\"FK\">Falkland Islands (Malvinas)</option>\n	<option value=\"FO\">Faroe Islands</option>\n	<option value=\"FJ\">Fiji</option>\n	<option value=\"FI\">Finland</option>\n	<option value=\"FR\">France</option>\n	<option value=\"GF\">French Guiana</option>\n	<option value=\"PF\">French Polynesia</option>\n	<option value=\"TF\">French Southern Territories</option>\n	<option value=\"GA\">Gabon</option>\n	<option value=\"GM\">Gambia</option>\n	<option value=\"GE\">Georgia</option>\n	<option value=\"DE\">Germany</option>\n	<option value=\"GH\">Ghana</option>\n	<option value=\"GI\">Gibraltar</option>\n	<option value=\"GR\">Greece</option>\n	<option value=\"GL\">Greenland</option>\n	<option value=\"GD\">Grenada</option>\n	<option value=\"GP\">Guadeloupe</option>\n	<option value=\"GU\">Guam</option>\n	<option value=\"GT\">Guatemala</option>\n	<option value=\"GG\">Guernsey</option>\n	<option value=\"GN\">Guinea</option>\n	<option value=\"GW\">Guinea-Bissau</option>\n	<option value=\"GY\">Guyana</option>\n	<option value=\"HT\">Haiti</option>\n	<option value=\"HM\">Heard Island and McDonald Islands</option>\n	<option value=\"HN\">Honduras</option>\n	<option value=\"HK\">Hong Kong</option>\n	<option value=\"HU\">Hungary</option>\n	<option value=\"IS\">Iceland</option>\n	<option value=\"IN\">India</option>\n	<option value=\"ID\">Indonesia</option>\n	<option value=\"Iran\">Iran</option>\n	<option value=\"IR\">Islamic Republic of</option>\n	<option value=\"IQ\">Iraq</option>\n	<option value=\"IE\">Ireland</option>\n	<option value=\"IM\">Isle of Man</option>\n	<option value=\"IL\">Israel</option>\n	<option value=\"IT\">Italy</option>\n	<option value=\"JM\">Jamaica</option>\n	<option value=\"JP\">Japan</option>\n	<option value=\"JE\">Jersey</option>\n	<option value=\"JO\">Jordan</option>\n	<option value=\"KZ\">Kazakhstan</option>\n	<option value=\"KE\">Kenya</option>\n	<option value=\"KI\">Kiribati</option>\n	<option value=\"Korea\">Korea</option>\n	<option value=\"KP\">Democratic People's Republic of</option>\n	<option value=\"Korea\">Korea</option>\n	<option value=\"KR\">Republic of</option>\n	<option value=\"KW\">Kuwait</option>\n	<option value=\"KG\">Kyrgyzstan</option>\n	<option value=\"LA\">Lao People's Democratic Republic</option>\n	<option value=\"LV\">Latvia</option>\n	<option value=\"LB\">Lebanon</option>\n	<option value=\"LS\">Lesotho</option>\n	<option value=\"LR\">Liberia</option>\n	<option value=\"LY\">Libyan Arab Jamahiriya</option>\n	<option value=\"LI\">Liechtenstein</option>\n	<option value=\"LT\">Lithuania</option>\n	<option value=\"LU\">Luxembourg</option>\n	<option value=\"MO\">Macao</option>\n	<option value=\"Macedonia\">Macedonia</option>\n	<option value=\"MK\">The Former Yugoslav Republic of</option>\n	<option value=\"MG\">Madagascar</option>\n	<option value=\"MW\">Malawi</option>\n	<option value=\"MY\">Malaysia</option>\n	<option value=\"MV\">Maldives</option>\n	<option value=\"ML\">Mali</option>\n	<option value=\"MT\">Malta</option>\n	<option value=\"MH\">Marshall Islands</option>\n	<option value=\"MQ\">Martinique</option>\n	<option value=\"MR\">Mauritania</option>\n	<option value=\"MU\">Mauritius</option>\n	<option value=\"YT\">Mayotte</option>\n	<option value=\"MX\">Mexico</option>\n	<option value=\"Micronesia\">Micronesia</option>\n	<option value=\"FM\">Federated States of</option>\n	<option value=\"Moldova\">Moldova</option>\n	<option value=\"MD\">Republic of</option>\n	<option value=\"MC\">Monaco</option>\n	<option value=\"MN\">Mongolia</option>\n	<option value=\"ME\">Montenegro</option>\n	<option value=\"MS\">Montserrat</option>\n	<option value=\"MA\">Morocco</option>\n	<option value=\"MZ\">Mozambique</option>\n	<option value=\"MM\">Myanmar</option>\n	<option value=\"NA\">Namibia</option>\n	<option value=\"NR\">Nauru</option>\n	<option value=\"NP\">Nepal</option>\n	<option value=\"NL\">Netherlands</option>\n	<option value=\"AN\">Netherlands Antilles</option>\n	<option value=\"NC\">New Caledonia</option>\n	<option value=\"NZ\">New Zealand</option>\n	<option value=\"NI\">Nicaragua</option>\n	<option value=\"NE\">Niger</option>\n	<option value=\"NG\">Nigeria</option>\n	<option value=\"NU\">Niue</option>\n	<option value=\"NF\">Norfolk Island</option>\n	<option value=\"MP\">Northern Mariana Islands</option>\n	<option value=\"NO\">Norway</option>\n	<option value=\"OM\">Oman</option>\n	<option value=\"PK\">Pakistan</option>\n	<option value=\"PW\">Palau</option>\n	<option value=\"Palestinian Territory\">Palestinian Territory</option>\n	<option value=\"PS\">Occupied</option>\n	<option value=\"PA\">Panama</option>\n	<option value=\"PG\">Papua New Guinea</option>\n	<option value=\"PY\">Paraguay</option>\n	<option value=\"PE\">Peru</option>\n	<option value=\"PH\">Philippines</option>\n	<option value=\"PN\">Pitcairn</option>\n	<option value=\"PL\">Poland</option>\n	<option value=\"PT\">Portugal</option>\n	<option value=\"PR\">Puerto Rico</option>\n	<option value=\"QA\">Qatar</option>\n	<option value=\"RE\">Réunion</option>\n	<option value=\"RO\">Romania</option>\n	<option value=\"RU\">Russian Federation</option>\n	<option value=\"RW\">Rwanda</option>\n	<option value=\"BL\">Saint Barthélemy</option>\n	<option value=\"SH\">Saint Helena</option>\n	<option value=\"KN\">Saint Kitts and Nevis</option>\n	<option value=\"LC\">Saint Lucia</option>\n	<option value=\"MF\">Saint Martin</option>\n	<option value=\"PM\">Saint Pierre and Miquelon</option>\n	<option value=\"VC\">Saint Vincent and The Grenadines</option>\n	<option value=\"WS\">Samoa</option>\n	<option value=\"SM\">San Marino</option>\n	<option value=\"ST\">Sao Tome and Principe</option>\n	<option value=\"SA\">Saudi Arabia</option>\n	<option value=\"SN\">Senegal</option>\n	<option value=\"RS\">Serbia</option>\n	<option value=\"SC\">Seychelles</option>\n	<option value=\"SL\">Sierra Leone</option>\n	<option value=\"SG\">Singapore</option>\n	<option value=\"SK\">Slovakia</option>\n	<option value=\"SI\">Slovenia</option>\n	<option value=\"SB\">Solomon Islands</option>\n	<option value=\"SO\">Somalia</option>\n	<option value=\"ZA\">South Africa</option>\n	<option value=\"GS\">South Georgia and the South Sandwich Islands</option>\n	<option value=\"ES\">Spain</option>\n	<option value=\"LK\">Sri Lanka</option>\n	<option value=\"SD\">Sudan</option>\n	<option value=\"SR\">Suriname</option>\n	<option value=\"SJ\">Svalbard and Jan Mayen</option>\n	<option value=\"SZ\">Swaziland</option>\n	<option value=\"SE\">Sweden</option>\n	<option value=\"CH\">Switzerland</option>\n	<option value=\"SY\">Syrian Arab Republic</option>\n	<option value=\"Taiwan\">Taiwan</option>\n	<option value=\"TW\">Province of China</option>\n	<option value=\"TJ\">Tajikistan</option>\n	<option value=\"Tanzania\">Tanzania</option>\n	<option value=\"TZ\">United Republic of</option>\n	<option value=\"TH\">Thailand</option>\n	<option value=\"TL\">Timor-Leste</option>\n	<option value=\"TG\">Togo</option>\n	<option value=\"TK\">Tokelau</option>\n	<option value=\"TO\">Tonga</option>\n	<option value=\"TT\">Trinidad and Tobago</option>\n	<option value=\"TN\">Tunisia</option>\n	<option value=\"TR\">Turkey</option>\n	<option value=\"TM\">Turkmenistan</option>\n	<option value=\"TC\">Turks and Caicos Islands</option>\n	<option value=\"TV\">Tuvalu</option>\n	<option value=\"UG\">Uganda</option>\n	<option value=\"UA\">Ukraine</option>\n	<option value=\"AE\">United Arab Emirates</option>\n	<option value=\"GB\">United Kingdom</option>\n	<option value=\"US\">United States</option>\n	<option value=\"UM\">United States Minor Outlying Islands</option>\n	<option value=\"UY\">Uruguay</option>\n	<option value=\"UZ\">Uzbekistan</option>\n	<option value=\"VU\">Vanuatu</option>\n	<option value=\"VA\">Vatican City State (Holy See)</option>\n	<option value=\"Venezuela\">Venezuela</option>\n	<option value=\"VE\">Bolivarian Republic of</option>\n	<option value=\"VN\">Viet Nam</option>\n	<option value=\"Virgin Islands\">Virgin Islands</option>\n	<option value=\"VG\">British</option>\n	<option value=\"Virgin Islands\">Virgin Islands</option>\n	<option value=\"VI\">U.S.</option>\n	<option value=\"WF\">Wallis and Futuna</option>\n	<option value=\"EH\">Western Sahara</option>\n	<option value=\"YE\">Yemen</option>\n	<option value=\"ZM\">Zambia</option>\n	<option value=\"ZW\">Zimbabwe</option></select>\n  </div>\n  \n  <button>Play!</button>\n  \n</form>\n";
  });

},{"handlebars-runtime":20}],12:[function(require,module,exports){
var Handlebars = require('handlebars-runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "\n<h1>Press start to join the game</h1>\n\n<button id=\"join\" ontouchstart=\"\">Start</button>\n";
  });

},{"handlebars-runtime":20}],19:[function(require,module,exports){
var Handlebars = require('handlebars-runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "<div class=\"player\">\n \n  <div class=\"landscape\">\n    <div class=\"row\">\n      <div class=\"button up\"><i>UP</i></div>\n      <div class=\"button down\"><i>DOWN</i></div>\n    </div>\n  </div>\n \n  <div class=\"portrait\">\n    <div class=\"row\">\n      <div class=\"button up\"><i>UP</i></div>\n    </div>\n    <div class=\"row\">\n      <div class=\"button down\"><i>DOWN</i></div>\n    </div>\n  </div>\n\n</div>\n";
  });

},{"handlebars-runtime":20}],18:[function(require,module,exports){
var Handlebars = require('handlebars-runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "\n<h1>waiting for 2nd player</h1>\n\n<button id=\"cancel\" ontouchstart=\"\">cancel</button>\n";
  });

},{"handlebars-runtime":20}],13:[function(require,module,exports){
var Handlebars = require('handlebars-runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "\n<h1>thanks for playing</h1>\n\n<p>\n  be sure to ask about what we do&hellip; <br />\n  and how we built this game\n</p>\n";
  });

},{"handlebars-runtime":20}],17:[function(require,module,exports){
(function(global){require("./rx.min.js")(global);
require("./rx.aggregates.min.js")(global);
require("./rx.coincidence.min.js")(global);
require("./rx.joinpatterns.min.js")(global);
require("./rx.time.min.js")(global);

module.exports = Rx

})(window)
},{"./rx.min.js":21,"./rx.coincidence.min.js":22,"./rx.aggregates.min.js":23,"./rx.time.min.js":24,"./rx.joinpatterns.min.js":25}],20:[function(require,module,exports){
/*

Copyright (C) 2011 by Yehuda Katz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/

// lib/handlebars/browser-prefix.js
var Handlebars = {};
module.exports = Handlebars;

(function(Handlebars, undefined) {
;
// lib/handlebars/base.js

Handlebars.VERSION = "1.0.0";
Handlebars.COMPILER_REVISION = 4;

Handlebars.REVISION_CHANGES = {
  1: '<= 1.0.rc.2', // 1.0.rc.2 is actually rev2 but doesn't report it
  2: '== 1.0.0-rc.3',
  3: '== 1.0.0-rc.4',
  4: '>= 1.0.0'
};

Handlebars.helpers  = {};
Handlebars.partials = {};

var toString = Object.prototype.toString,
    functionType = '[object Function]',
    objectType = '[object Object]';

Handlebars.registerHelper = function(name, fn, inverse) {
  if (toString.call(name) === objectType) {
    if (inverse || fn) { throw new Handlebars.Exception('Arg not supported with multiple helpers'); }
    Handlebars.Utils.extend(this.helpers, name);
  } else {
    if (inverse) { fn.not = inverse; }
    this.helpers[name] = fn;
  }
};

Handlebars.registerPartial = function(name, str) {
  if (toString.call(name) === objectType) {
    Handlebars.Utils.extend(this.partials,  name);
  } else {
    this.partials[name] = str;
  }
};

Handlebars.registerHelper('helperMissing', function(arg) {
  if(arguments.length === 2) {
    return undefined;
  } else {
    throw new Error("Missing helper: '" + arg + "'");
  }
});

Handlebars.registerHelper('blockHelperMissing', function(context, options) {
  var inverse = options.inverse || function() {}, fn = options.fn;

  var type = toString.call(context);

  if(type === functionType) { context = context.call(this); }

  if(context === true) {
    return fn(this);
  } else if(context === false || context == null) {
    return inverse(this);
  } else if(type === "[object Array]") {
    if(context.length > 0) {
      return Handlebars.helpers.each(context, options);
    } else {
      return inverse(this);
    }
  } else {
    return fn(context);
  }
});

Handlebars.K = function() {};

Handlebars.createFrame = Object.create || function(object) {
  Handlebars.K.prototype = object;
  var obj = new Handlebars.K();
  Handlebars.K.prototype = null;
  return obj;
};

Handlebars.logger = {
  DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, level: 3,

  methodMap: {0: 'debug', 1: 'info', 2: 'warn', 3: 'error'},

  // can be overridden in the host environment
  log: function(level, obj) {
    if (Handlebars.logger.level <= level) {
      var method = Handlebars.logger.methodMap[level];
      if (typeof console !== 'undefined' && console[method]) {
        console[method].call(console, obj);
      }
    }
  }
};

Handlebars.log = function(level, obj) { Handlebars.logger.log(level, obj); };

Handlebars.registerHelper('each', function(context, options) {
  var fn = options.fn, inverse = options.inverse;
  var i = 0, ret = "", data;

  var type = toString.call(context);
  if(type === functionType) { context = context.call(this); }

  if (options.data) {
    data = Handlebars.createFrame(options.data);
  }

  if(context && typeof context === 'object') {
    if(context instanceof Array){
      for(var j = context.length; i<j; i++) {
        if (data) { data.index = i; }
        ret = ret + fn(context[i], { data: data });
      }
    } else {
      for(var key in context) {
        if(context.hasOwnProperty(key)) {
          if(data) { data.key = key; }
          ret = ret + fn(context[key], {data: data});
          i++;
        }
      }
    }
  }

  if(i === 0){
    ret = inverse(this);
  }

  return ret;
});

Handlebars.registerHelper('if', function(conditional, options) {
  var type = toString.call(conditional);
  if(type === functionType) { conditional = conditional.call(this); }

  if(!conditional || Handlebars.Utils.isEmpty(conditional)) {
    return options.inverse(this);
  } else {
    return options.fn(this);
  }
});

Handlebars.registerHelper('unless', function(conditional, options) {
  return Handlebars.helpers['if'].call(this, conditional, {fn: options.inverse, inverse: options.fn});
});

Handlebars.registerHelper('with', function(context, options) {
  var type = toString.call(context);
  if(type === functionType) { context = context.call(this); }

  if (!Handlebars.Utils.isEmpty(context)) return options.fn(context);
});

Handlebars.registerHelper('log', function(context, options) {
  var level = options.data && options.data.level != null ? parseInt(options.data.level, 10) : 1;
  Handlebars.log(level, context);
});
;
// lib/handlebars/utils.js

var errorProps = ['description', 'fileName', 'lineNumber', 'message', 'name', 'number', 'stack'];

Handlebars.Exception = function(message) {
  var tmp = Error.prototype.constructor.apply(this, arguments);

  // Unfortunately errors are not enumerable in Chrome (at least), so `for prop in tmp` doesn't work.
  for (var idx = 0; idx < errorProps.length; idx++) {
    this[errorProps[idx]] = tmp[errorProps[idx]];
  }
};
Handlebars.Exception.prototype = new Error();

// Build out our basic SafeString type
Handlebars.SafeString = function(string) {
  this.string = string;
};
Handlebars.SafeString.prototype.toString = function() {
  return this.string.toString();
};

var escape = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "`": "&#x60;"
};

var badChars = /[&<>"'`]/g;
var possible = /[&<>"'`]/;

var escapeChar = function(chr) {
  return escape[chr] || "&amp;";
};

Handlebars.Utils = {
  extend: function(obj, value) {
    for(var key in value) {
      if(value.hasOwnProperty(key)) {
        obj[key] = value[key];
      }
    }
  },

  escapeExpression: function(string) {
    // don't escape SafeStrings, since they're already safe
    if (string instanceof Handlebars.SafeString) {
      return string.toString();
    } else if (string == null || string === false) {
      return "";
    }

    // Force a string conversion as this will be done by the append regardless and
    // the regex test will do this transparently behind the scenes, causing issues if
    // an object's to string has escaped characters in it.
    string = string.toString();

    if(!possible.test(string)) { return string; }
    return string.replace(badChars, escapeChar);
  },

  isEmpty: function(value) {
    if (!value && value !== 0) {
      return true;
    } else if(toString.call(value) === "[object Array]" && value.length === 0) {
      return true;
    } else {
      return false;
    }
  }
};
;
// lib/handlebars/runtime.js

Handlebars.VM = {
  template: function(templateSpec) {
    // Just add water
    var container = {
      escapeExpression: Handlebars.Utils.escapeExpression,
      invokePartial: Handlebars.VM.invokePartial,
      programs: [],
      program: function(i, fn, data) {
        var programWrapper = this.programs[i];
        if(data) {
          programWrapper = Handlebars.VM.program(i, fn, data);
        } else if (!programWrapper) {
          programWrapper = this.programs[i] = Handlebars.VM.program(i, fn);
        }
        return programWrapper;
      },
      merge: function(param, common) {
        var ret = param || common;

        if (param && common) {
          ret = {};
          Handlebars.Utils.extend(ret, common);
          Handlebars.Utils.extend(ret, param);
        }
        return ret;
      },
      programWithDepth: Handlebars.VM.programWithDepth,
      noop: Handlebars.VM.noop,
      compilerInfo: null
    };

    return function(context, options) {
      options = options || {};
      var result = templateSpec.call(container, Handlebars, context, options.helpers, options.partials, options.data);

      var compilerInfo = container.compilerInfo || [],
          compilerRevision = compilerInfo[0] || 1,
          currentRevision = Handlebars.COMPILER_REVISION;

      if (compilerRevision !== currentRevision) {
        if (compilerRevision < currentRevision) {
          var runtimeVersions = Handlebars.REVISION_CHANGES[currentRevision],
              compilerVersions = Handlebars.REVISION_CHANGES[compilerRevision];
          throw "Template was precompiled with an older version of Handlebars than the current runtime. "+
                "Please update your precompiler to a newer version ("+runtimeVersions+") or downgrade your runtime to an older version ("+compilerVersions+").";
        } else {
          // Use the embedded version info since the runtime doesn't know about this revision yet
          throw "Template was precompiled with a newer version of Handlebars than the current runtime. "+
                "Please update your runtime to a newer version ("+compilerInfo[1]+").";
        }
      }

      return result;
    };
  },

  programWithDepth: function(i, fn, data /*, $depth */) {
    var args = Array.prototype.slice.call(arguments, 3);

    var program = function(context, options) {
      options = options || {};

      return fn.apply(this, [context, options.data || data].concat(args));
    };
    program.program = i;
    program.depth = args.length;
    return program;
  },
  program: function(i, fn, data) {
    var program = function(context, options) {
      options = options || {};

      return fn(context, options.data || data);
    };
    program.program = i;
    program.depth = 0;
    return program;
  },
  noop: function() { return ""; },
  invokePartial: function(partial, name, context, helpers, partials, data) {
    var options = { helpers: helpers, partials: partials, data: data };

    if(partial === undefined) {
      throw new Handlebars.Exception("The partial " + name + " could not be found");
    } else if(partial instanceof Function) {
      return partial(context, options);
    } else if (!Handlebars.compile) {
      throw new Handlebars.Exception("The partial " + name + " could not be compiled when running in runtime-only mode");
    } else {
      partials[name] = Handlebars.compile(partial, {data: data !== undefined});
      return partials[name](context, options);
    }
  }
};

Handlebars.template = Handlebars.VM.template;
;
// lib/handlebars/browser-suffix.js
})(Handlebars);
;

},{}],21:[function(require,module,exports){
/*
 Copyright (c) Microsoft Corporation.  All rights reserved.
 This code is licensed by Microsoft Corporation under the terms
 of the MICROSOFT REACTIVE EXTENSIONS FOR JAVASCRIPT AND .NET LIBRARIES License.
 See http://go.microsoft.com/fwlink/?LinkID=220762.
*/
module.exports = function(x,n){var m,ia=function(){},J=function(){return(new Date).getTime()},V=function(a,b){return a===b},Q=function(a){return a},W=function(a){return a.toString()},X=Object.prototype.hasOwnProperty,o=function(a,b){function c(){this.constructor=a}for(var d in b)X.call(b,d)&&(a[d]=b[d]);c.prototype=b.prototype;a.prototype=new c;a.base=b.prototype;return a},E=function(a,b){for(var c in b)X.call(b,c)&&(a[c]=b[c])},y=Array.prototype.slice,K="Object has been disposed";m=x.Rx={Internals:{}};m.VERSION="1.0.10621";var ja=function(a,b){return i(function(c){return new p(b.getDisposable(),a.subscribe(c))})},F=function(a,b,c){return i(function(d){var e=new v,g=new v,d=c(d,e,g);e.disposable(a.materialize().select(function(b){return{switchValue:function(a){return a(b)}}}).subscribe(d));g.disposable(b.materialize().select(function(b){return{switchValue:function(a,c){return c(b)}}}).subscribe(d));return new p(e,g)})},u=m.Internals.List=
function(){function a(b){this.comparer=b||V;this.size=0;this.items=[]}a.fromArray=function(b,c){var d,e=b.length,g=new a(c);for(d=0;d<e;d++)g.add(b[d]);return g};a.prototype.count=function(){return this.size};a.prototype.add=function(b){this.items[this.size]=b;this.size++};a.prototype.removeAt=function(b){if(0>b||b>=this.size)throw Error("Argument out of range");0===b?this.items.shift():this.items.splice(b,1);this.size--};a.prototype.indexOf=function(b){var a,d;for(a=0;a<this.items.length;a++)if(d=
this.items[a],this.comparer(b,d))return a;return-1};a.prototype.remove=function(b){b=this.indexOf(b);if(-1===b)return!1;this.removeAt(b);return!0};a.prototype.clear=function(){this.items=[];this.size=0};a.prototype.item=function(b,a){if(0>b||b>=count)throw Error("Argument out of range");if(a===n)return this.items[b];this.items[b]=a};a.prototype.toArray=function(){var b=[],a;for(a=0;a<this.items.length;a++)b.push(this.items[a]);return b};a.prototype.contains=function(b){for(var a=0;a<this.items.length;a++)if(this.comparer(b,
this.items[a]))return!0;return!1};return a}(),ka=function(){function a(b,a){this.id=b;this.value=a}a.prototype.compareTo=function(b){var a=this.value.compareTo(b.value);0===a&&(a=this.id-b.id);return a};return a}(),Y=function(){function a(b){this.items=Array(b);this.size=0}a.prototype.count=function(){return this.size};a.prototype.isHigherPriority=function(b,a){return 0>this.items[b].compareTo(this.items[a])};a.prototype.percolate=function(b){var a,d;if(!(b>=this.size||0>b))if(a=Math.floor((b-1)/
2),!(0>a||a===b)&&this.isHigherPriority(b,a))d=this.items[b],this.items[b]=this.items[a],this.items[a]=d,this.percolate(a)};a.prototype.heapify=function(b){var a,d,e;b===n&&(b=0);b>=this.size||0>b||(d=2*b+1,e=2*b+2,a=b,d<this.size&&this.isHigherPriority(d,a)&&(a=d),e<this.size&&this.isHigherPriority(e,a)&&(a=e),a!==b&&(d=this.items[b],this.items[b]=this.items[a],this.items[a]=d,this.heapify(a)))};a.prototype.peek=function(){return this.items[0].value};a.prototype.removeAt=function(b){this.items[b]=
this.items[--this.size];delete this.items[this.size];this.heapify();if(this.size<this.items.length>>2)for(var b=this.items,a=this.items=Array(this.items.length>>1),d=this.size;0<d;)a[d+0-1]=b[d+0-1],d--};a.prototype.dequeue=function(){var b=this.peek();this.removeAt(0);return b};a.prototype.enqueue=function(b){var c;if(this.size>=this.items.length){c=this.items;for(var d=this.items=Array(2*this.items.length),e=c.length;0<e;)d[e+0-1]=c[e+0-1],e--}c=this.size++;this.items[c]=new ka(a.count++,b);this.percolate(c)};
a.prototype.remove=function(b){var a;for(a=0;a<this.size;a++)if(this.items[a].value===b)return this.removeAt(a),!0;return!1};a.count=0;return a}(),p=m.CompositeDisposable=function(){function a(){var b=!1,a=u.fromArray(y.call(arguments));this.count=function(){return a.count()};this.add=function(d){b?d.dispose():a.add(d)};this.remove=function(d){var e=!1;b||(e=a.remove(d));e&&d.dispose();return e};this.dispose=function(){var d,e;b||(b=!0,d=a.toArray(),a.clear());if(d!==n)for(e=0;e<d.length;e++)d[e].dispose()};
this.clear=function(){var b,e;b=a.toArray();a.clear();for(e=0;e<b.length;e++)b[e].dispose()};this.contains=function(b){return a.contains(b)};this.isDisposed=function(){return b};this.toArray=function(){return a.toArray()}}a.prototype.count=function(){return this.count()};a.prototype.add=function(b){this.add(b)};a.prototype.remove=function(b){this.remove(b)};a.prototype.dispose=function(){this.dispose()};a.prototype.clear=function(){this.clear()};a.prototype.contains=function(b){return this.contains(b)};
a.prototype.isDisposed=function(){return this.isDisposed()};a.prototype.toArray=function(){return this.toArray()};return a}(),L=m.Disposable=function(){function a(b){var a=!1;this.dispose=function(){a||(b(),a=!0)}}a.prototype.dispose=function(){this.dispose()};return a}(),A=L.create=function(a){return new L(a)},w=L.empty=new L(function(){}),v=m.SingleAssignmentDisposable=function(){function a(){var b=!1,a=null;this.isDisposed=function(){return b};this.getDisposable=function(){return a};this.setDisposable=
function(d){if(null!==a)throw Error("Disposable has already been assigned");var e=b;e||(a=d);e&&null!==d&&d.dispose()};this.dispose=function(){var d=null;b||(b=!0,d=a,a=null);null!==d&&d.dispose()}}a.prototype.isDisposed=function(){return this.isDisposed()};a.prototype.disposable=function(b){if(b===n)return this.getDisposable();this.setDisposable(b)};a.prototype.dispose=function(){this.dispose()};return a}(),C=m.SerialDisposable=function(){function a(){var b=!1,a=null;this.isDisposed=function(){return b};
this.getDisposable=function(){return a};this.setDisposable=function(d){var e=b,g=null;e||(g=a,a=d);null!==g&&g.dispose();e&&null!==d&&d.dispose()};this.dispose=function(){var d=null;b||(b=!0,d=a,a=null);null!==d&&d.dispose()}}a.prototype.isDisposed=function(){return this.isDisposed()};a.prototype.disposable=function(a){if(a===n)return this.getDisposable();this.setDisposable(a)};a.prototype.dispose=function(){this.dispose()};a.prototype.dispose=function(){this.dispose()};return a}(),Z=m.RefCountDisposable=
function(){function a(a){var c=!1,d=!1,e=0;this.dispose=function(){var g=!1;!c&&!d&&(d=!0,0===e&&(g=c=!0));g&&a.dispose()};this.getDisposable=function(){if(c)return w;e++;var g=!1;return{dispose:function(){var h=!1;!c&&!g&&(g=!0,e--,0===e&&d&&(h=c=!0));h&&a.dispose()}}};this.isDisposed=function(){return c}}a.prototype.dispose=function(){this.dispose()};a.prototype.getDisposable=function(){return this.getDisposable()};a.prototype.isDisposed=function(){return this.isDisposed()};return a}(),R;R=function(){function a(a,
c,d,e,g){this.scheduler=a;this.state=c;this.action=d;this.dueTime=e;this.comparer=g||function(a,b){return a-b};this.disposable=new v}a.prototype.invoke=function(){return this.disposable.disposable(this.invokeCore())};a.prototype.compareTo=function(a){return this.comparer(this.dueTime,a.dueTime)};a.prototype.isCancelled=function(){return this.disposable.isDisposed()};a.prototype.invokeCore=function(){return this.action(this.scheduler,this.state)};return a}();var s=m.Scheduler=function(){function a(a,
b,c,d){this.now=a;this._schedule=b;this._scheduleRelative=c;this._scheduleAbsolute=d}var b=function(a,b){var c,d,e,k;d=new p;k=b.first;c=b.second;e=null;e=function(b){c(b,function(b){var c,h,l;l=h=!1;c=null;c=a.scheduleWithState(b,function(a,b){h?d.remove(c):l=!0;e(b);return w});l||(d.add(c),h=!0)})};e(k);return d},c=function(a,b){var c,d,e,k;d=new p;k=b.first;c=b.second;e=function(b){c(b,function(b,c){var h,l,k;k=l=!1;h=a.scheduleWithRelativeAndState(b,c,function(a,b){l?d.remove(h):k=!0;e(b);return w});
k||(d.add(h),l=!0)})};e(k);return d},d=function(a,b){var c,d,e,k;d=new p;k=b.first;c=b.second;e=function(b){c(b,function(b,c){var h=!1,l=!1,k=a.scheduleWithAbsoluteAndState(b,c,function(a,b){h?d.remove(k):l=!0;e(b);return w});l||(d.add(k),h=!0)})};e(k);return d},e=function(a,b){b();return w};a.prototype.schedule=function(a){return this._schedule(a,e)};a.prototype.scheduleWithState=function(a,b){return this._schedule(a,b)};a.prototype.scheduleWithRelative=function(a,b){return this._scheduleRelative(b,
a,e)};a.prototype.scheduleWithRelativeAndState=function(a,b,c){return this._scheduleRelative(a,b,c)};a.prototype.scheduleWithAbsolute=function(a,b){return this._scheduleAbsolute(b,a,e)};a.prototype.scheduleWithAbsoluteAndState=function(a,b,c){return this._scheduleAbsolute(a,b,c)};a.prototype.scheduleRecursive=function(a){return this.scheduleRecursiveWithState(a,function(a,b){a(function(){b(a)})})};a.prototype.scheduleRecursiveWithState=function(a,c){return this.scheduleWithState({first:a,second:c},
function(a,c){return b(a,c)})};a.prototype.scheduleRecursiveWithRelative=function(a,b){return this.scheduleRecursiveWithRelativeAndState(b,a,function(a,b){a(function(c){b(a,c)})})};a.prototype.scheduleRecursiveWithRelativeAndState=function(a,b,d){return this._scheduleRelative({first:a,second:d},b,function(a,b){return c(a,b)})};a.prototype.scheduleRecursiveWithAbsolute=function(a,b){return this.scheduleRecursiveWithAbsoluteAndState(b,a,function(a,b){a(function(c){b(a,c)})})};a.prototype.scheduleRecursiveWithAbsoluteAndState=
function(a,b,c){return this._scheduleAbsolute({first:a,second:c},b,function(a,b){return d(a,b)})};a.now=J;a.normalize=function(a){0>a&&(a=0);return a};return a}(),f=function(){function a(){var b=this;a.base.constructor.call(this,J,function(a,d){return d(b,a)},function(a,d,e){for(;0<s.normalize(d););return e(b,a)},function(a,d,e){return b.scheduleWithRelativeAndState(a,d-b.now(),e)})}o(a,s);return a}(),B=s.Immediate=new f,la=function(){function a(){M.queue=new Y(4)}a.prototype.dispose=function(){M.queue=
null};a.prototype.run=function(){for(var a,c=M.queue;0<c.count();)if(a=c.dequeue(),!a.isCancelled()){for(;0<a.dueTime-s.now(););a.isCancelled()||a.invoke()}};return a}(),M=function(){function a(){var b=this;a.base.constructor.call(this,J,function(a,d){return b.scheduleWithRelativeAndState(a,0,d)},function(c,d,e){var g=b.now()+s.normalize(d),d=a.queue,c=new R(b,c,e,g);if(null===d){e=new la;try{a.queue.enqueue(c),e.run()}finally{e.dispose()}}else d.enqueue(c);return c.disposable},function(a,d,e){return b.scheduleWithRelativeAndState(a,
d-b.now(),e)})}o(a,s);a.prototype.scheduleRequired=function(){return null===a.queue};a.prototype.ensureTrampoline=function(a){return this.scheduleRequired()?this.schedule(a):a()};a.queue=null;return a}(),D=s.CurrentThread=new M;m.VirtualTimeScheduler=function(){function a(b,c){var d=this;this.clock=b;this.comparer=c;this.isEnabled=!1;a.base.constructor.call(this,function(){return d.toDateTimeOffset(d.clock)},function(a,b){return d.scheduleAbsolute(a,d.clock,b)},function(a,b,c){return d.scheduleRelative(a,
d.toRelative(b),c)},function(a,b,c){return d.scheduleRelative(a,d.toRelative(b-d.now()),c)});this.queue=new Y(1024)}o(a,s);a.prototype.scheduleRelative=function(a,c,d){c=this.add(this.clock,c);return this.scheduleAbsolute(a,c,d)};a.prototype.start=function(){var a;if(!this.isEnabled){this.isEnabled=!0;do if(a=this.getNext(),null!==a){if(0<this.comparer(a.dueTime,this.clock))this.clock=a.dueTime;a.invoke()}else this.isEnabled=!1;while(this.isEnabled)}};a.prototype.stop=function(){return this.isEnabled=
!1};a.prototype.advanceTo=function(a){var c;if(0<=this.comparer(this.clock,a))throw Error("Argument out of range");if(!this.isEnabled){this.isEnabled=!0;do if(c=this.getNext(),null!==c&&0>=this.comparer(c.dueTime,a)){if(0<this.comparer(c.dueTime,this.clock))this.clock=c.dueTime;c.invoke()}else this.isEnabled=!1;while(this.isEnabled);return this.clock=a}};a.prototype.advanceBy=function(a){a=this.add(this.clock,a);if(0<=this.comparer(this.clock,a))throw Error("Argument out of range");return this.advanceTo(a)};
a.prototype.getNext=function(){for(var a;0<this.queue.count();)if(a=this.queue.peek(),a.isCancelled())this.queue.dequeue();else return a;return null};a.prototype.scheduleAbsolute=function(a,c,d){var e=this,g=new R(e,a,function(a,b){e.queue.remove(g);return d(a,b)},c,e.comparer);e.queue.enqueue(g);return g.disposable};return a}();var f=function(){function a(){var b=this;a.base.constructor.call(this,J,function(a,d){var e=x.setTimeout(function(){d(b,a)},0);return A(function(){x.clearTimeout(e)})},function(a,
d,e){var g,d=s.normalize(d);g=x.setTimeout(function(){e(b,a)},d);return A(function(){x.clearTimeout(g)})},function(a,d,e){return b.scheduleWithRelativeAndState(a,d-b.now(),e)})}o(a,s);return a}(),ma=s.Timeout=new f,t=m.Notification=function(){function a(){}a.prototype.accept=function(a,c,d){return 1<arguments.length||"function"===typeof a?this._accept(a,c,d):this._acceptObservable(a)};a.prototype.toObservable=function(a){var c=this,a=a||s.Immediate;return i(function(d){return a.schedule(function(){c._acceptObservable(d);
if("N"===c.kind)d.onCompleted()})})};a.prototype.hasValue=!1;a.prototype.equals=function(a){return this.toString()===(a===n||null===a?"":a.toString())};return a}();t.createOnNext=function(a){var b=new t;b.value=a;b.hasValue=!0;b.kind="N";b._accept=function(a){return a(this.value)};b._acceptObservable=function(a){return a.onNext(this.value)};b.toString=function(){return"OnNext("+this.value+")"};return b};t.createOnError=function(a){var b=new t;b.exception=a;b.kind="E";b._accept=function(a,b){return b(this.exception)};
b._acceptObservable=function(a){return a.onError(this.exception)};b.toString=function(){return"OnError("+this.exception+")"};return b};t.createOnCompleted=function(){var a=new t;a.kind="C";a._accept=function(a,c,d){return d()};a._acceptObservable=function(a){return a.onCompleted()};a.toString=function(){return"OnCompleted()"};return a};var G=function(){},f=G.prototype;f.concat=function(){var a=this;return i(function(b){var c,d=a.getEnumerator(),e=!1,g=new C;c=B.scheduleRecursive(function(a){var c,
z,q=!1;if(!e){try{if(q=d.moveNext())c=d.current}catch(k){z=k}if(void 0!==z)b.onError(z);else if(q)z=new v,g.disposable(z),z.disposable(c.subscribe(function(a){b.onNext(a)},function(a){b.onError(a)},function(){a()}));else b.onCompleted()}});return new p(g,c,A(function(){e=!0}))})};f.catchException=function(){var a=this;return i(function(b){var c,d=a.getEnumerator(),e=!1,g,h;g=new C;c=B.scheduleRecursive(function(a){var c,q,k;k=!1;if(!e){try{if(k=d.moveNext())c=d.current}catch(f){q=f}if(void 0!==q)b.onError(q);
else if(k)q=new v,g.disposable(q),q.disposable(c.subscribe(function(a){b.onNext(a)},function(b){h=b;a()},function(){b.onCompleted()}));else if(void 0!==h)b.onError(h);else b.onCompleted()}});return new p(g,c,A(function(){e=!0}))})};var $=G.repeat=function(a,b){b===n&&(b=-1);var c=new G;c.getEnumerator=function(){return{left:b,current:null,moveNext:function(){if(0===this.left)return this.current=null,!1;0<this.left&&this.left--;this.current=a;return!0}}};return c},S=G.forEnumerator=function(a){var b=
new G;b.getEnumerator=function(){return{_index:-1,current:null,moveNext:function(){if(++this._index<a.length)return this.current=a[this._index],!0;this._index=-1;this.current=null;return!1}}};return b},r=m.Observer=function(){},T=m.Internals.AbstractObserver=function(){function a(){this.isStopped=!1}o(a,r);a.prototype.onNext=function(a){this.isStopped||this.next(a)};a.prototype.onError=function(a){if(!this.isStopped)this.isStopped=!0,this.error(a)};a.prototype.onCompleted=function(){if(!this.isStopped)this.isStopped=
!0,this.completed()};a.prototype.dispose=function(){this.isStopped=!0};return a}(),N=function(){function a(b,c,d){a.base.constructor.call(this);this._onNext=b;this._onError=c;this._onCompleted=d}o(a,T);a.prototype.next=function(a){this._onNext(a)};a.prototype.error=function(a){this._onError(a)};a.prototype.completed=function(){this._onCompleted()};return a}(),H=m.Internals.BinaryObserver=function(){function a(a,c){"function"===typeof a&&"function"===typeof c?(this.leftObserver=aa(a),this.rightObserver=
aa(c)):(this.leftObserver=a,this.rightObserver=c)}o(a,r);a.prototype.onNext=function(a){var c=this;return a.switchValue(function(a){return a.accept(c.leftObserver)},function(a){return a.accept(c.rightObserver)})};a.prototype.onError=function(){};a.prototype.onCompleted=function(){};return a}(),na=function(){function a(a,c){this.scheduler=a;this.observer=c;this.hasFaulted=this.isAcquired=!1;this.queue=[];this.disposable=new C}o(a,T);a.prototype.ensureActive=function(){var a=!1,c=this;if(!this.hasFaulted&&
0<this.queue.length)a=!this.isAcquired,this.isAcquired=!0;a&&this.disposable.disposable(this.scheduler.scheduleRecursive(function(a){var b;if(0<c.queue.length){b=c.queue.shift();try{b()}catch(g){throw c.queue=[],c.hasFaulted=!0,g;}a()}else c.isAcquired=!1}))};a.prototype.next=function(a){var c=this;this.queue.push(function(){c.observer.onNext(a)})};a.prototype.error=function(a){var c=this;this.queue.push(function(){c.observer.onError(a)})};a.prototype.completed=function(){var a=this;this.queue.push(function(){a.observer.onCompleted()})};
a.prototype.dispose=function(){a.base.dispose.call(this);this.disposable.dispose()};return a}(),I=r.create=function(a,b,c){b||(b=function(a){throw a;});c||(c=function(){});return new N(a,b,c)};r.fromNotifier=function(a){return new N(function(b){return a(t.createOnNext(b))},function(b){return a(t.createOnError(b))},function(){return a(t.createOnCompleted())})};var aa=function(a){return new N(function(b){a(t.createOnNext(b))},function(b){a(t.createOnError(b))},function(){a(t.createOnCompleted())})};
r.prototype.toNotifier=function(){var a=this;return function(b){return b.accept(a)}};r.prototype.asObserver=function(){var a=this;return new N(function(b){return a.onNext(b)},function(b){return a.onError(b)},function(){return a.onCompleted()})};var j=m.Observable=function(){function a(){}a.prototype.subscribe=function(a,c,d){return this._subscribe(0===arguments.length||1<arguments.length||"function"===typeof a?I(a,c,d):a)};return a}(),f=j.prototype,pa=function(){function a(b){a.base.constructor.call(this);
this._subscribe=function(a){var d=new oa(a);D.scheduleRequired()?D.schedule(function(){d.disposable(b(d))}):d.disposable(b(d));return d}}o(a,j);a.prototype._subscribe=function(a){return this._subscribe(a)};return a}(),oa=function(){function a(b){a.base.constructor.call(this);this.observer=b;this.m=new v}o(a,T);a.prototype.disposable=function(a){return this.m.disposable(a)};a.prototype.next=function(a){this.observer.onNext(a)};a.prototype.error=function(a){this.observer.onError(a);this.m.dispose()};
a.prototype.completed=function(){this.observer.onCompleted();this.m.dispose()};a.prototype.dispose=function(){a.base.dispose.call(this);this.m.dispose()};return a}(),ba=function(){function a(b,c,d){a.base.constructor.call(this);this.key=b;this.underlyingObservable=!d?c:i(function(a){return new p(d.getDisposable(),c.subscribe(a))})}o(a,j);a.prototype._subscribe=function(a){return this.underlyingObservable.subscribe(a)};return a}(),qa=m.ConnectableObservable=function(){function a(a,c){var d=a.asObservable(),
e=!1,g=null;this.connect=function(){e||(e=!0,g=new p(d.subscribe(c),A(function(){e=!1})));return g};this._subscribe=function(a){return c.subscribe(a)}}o(a,j);a.prototype.connect=function(){return this.connect()};a.prototype.refCount=function(){var a=null,c=0,d=this;return i(function(e){var g,h;c++;g=1===c;h=d.subscribe(e);g&&(a=d.connect());return A(function(){h.dispose();c--;0===c&&a.dispose()})})};a.prototype._subscribe=function(a){return this._subscribe(a)};return a}(),O=m.Subject=function(){function a(){a.base.constructor.call(this);
var b=!1,c=!1,d=new u,e=n,g=function(){if(b)throw Error(K);};this.onCompleted=function(){var a,b;g();c||(a=d.toArray(),d=new u,c=!0);if(a!==n)for(b=0;b<a.length;b++)a[b].onCompleted()};this.onError=function(a){var b,z;g();c||(b=d.toArray(),d=new u,c=!0,e=a);if(b!==n)for(z=0;z<b.length;z++)b[z].onError(a)};this.onNext=function(a){var b,e;g();c||(b=d.toArray());if(void 0!==b)for(e=0;e<b.length;e++)b[e].onNext(a)};this._subscribe=function(a){g();if(!c)return d.add(a),function(a){return{observer:a,dispose:function(){if(null!==
this.observer&&!b)d.remove(this.observer),this.observer=null}}}(a);if(e!==n)return a.onError(e),w;a.onCompleted();return w};this.dispose=function(){b=!0;d=null}}o(a,j);E(a,r);a.prototype.onCompleted=function(){this.onCompleted()};a.prototype.onError=function(a){this.onError(a)};a.prototype.onNext=function(a){this.onNext(a)};a.prototype._subscribe=function(a){return this._subscribe(a)};a.prototype.dispose=function(){this.dispose()};a.create=function(a,c){return new ra(a,c)};return a}(),U=m.AsyncSubject=
function(){function a(){a.base.constructor.call(this);var b=!1,c=!1,d=null,e=!1,g=new u,h=null,l=function(){if(b)throw Error(K);};this.onCompleted=function(){var a=!1,b,h,f;l();c||(b=g.toArray(),g=new u,c=!0,h=d,a=e);if(b!==n)if(a)for(f=0;f<b.length;f++)a=b[f],a.onNext(h),a.onCompleted();else for(f=0;f<b.length;f++)b[f].onCompleted()};this.onError=function(a){var b,d;l();c||(b=g.toArray(),g=new u,c=!0,h=a);if(b!==n)for(d=0;d<b.length;d++)b[d].onError(a)};this.onNext=function(a){l();c||(d=a,e=!0)};
this._subscribe=function(a){var q,k,f;l();if(!c)return g.add(a),function(a){return{observer:a,dispose:function(){if(null!==this.observer&&!b)g.remove(this.observer),this.observer=null}}}(a);q=h;k=e;f=d;if(null!==q)a.onError(q);else{if(k)a.onNext(f);a.onCompleted()}return w};this.dispose=function(){b=!0;d=h=g=null}}o(a,j);E(a,r);a.prototype.onCompleted=function(){this.onCompleted()};a.prototype.onError=function(a){this.onError(a)};a.prototype.onNext=function(a){this.onNext(a)};a.prototype._subscribe=
function(a){return this._subscribe(a)};a.prototype.dispose=function(){this.dispose()};return a}(),P=m.BehaviorSubject=function(){function a(b){a.base.constructor.call(this);var c=b,d=new u,e=!1,g=!1,h=null,l=function(){if(e)throw Error(K);};this.onCompleted=function(){var a,b;a=null;l();g||(a=d.toArray(),d=new u,g=!0);if(null!==a)for(b=0;b<a.length;b++)a[b].onCompleted()};this.onError=function(a){var b,c;c=null;l();g||(c=d.toArray(),d=new u,g=!0,h=a);if(null!==c)for(b=0;b<c.length;b++)c[b].onError(a)};
this.onNext=function(a){var b,e;b=null;l();g||(c=a,b=d.toArray());if(null!==b)for(e=0;e<b.length;e++)b[e].onNext(a)};this._subscribe=function(a){var b;l();if(!g)return d.add(a),a.onNext(c),function(a){return{observer:a,dispose:function(){if(null!==this.observer&&!e)d.remove(this.observer),this.observer=null}}}(a);b=h;if(null!==b)a.onError(b);else a.onCompleted();return w};this.dispose=function(){e=!0;h=c=d=null}}o(a,j);E(a,r);a.prototype.onCompleted=function(){this.onCompleted()};a.prototype.onError=
function(a){this.onError(a)};a.prototype.onNext=function(a){this.onNext(a)};a.prototype._subscribe=function(a){return this._subscribe(a)};a.prototype.dispose=function(){this.dispose()};return a}();P.prototype.toNotifier=r.prototype.toNotifier;P.prototype.asObserver=r.prototype.AsObserver;var ca=m.ReplaySubject=function(){function a(a,c,d){var e=a===n?Number.MAX_VALUE:a,g=c===n?Number.MAX_VALUE:c,h=d||s.currentThread,l=[],f=new u,q=!1,k=!1,i=function(a){var b=q?1:0,c=b+e;for(c<e&&(c=e);l.length>c;)l.shift();
for(;l.length>b&&a-l[0].timestamp>g;)l.shift()},j=function(a){var b=h.now();l.push({value:a,timestamp:b});i(b)},m=function(){if(k)throw Error(K);};this.onNext=function(a){var b=null,c,d;m();if(!q){b=f.toArray();j(t.createOnNext(a));for(d=0;d<b.length;d++)c=b[d],c.onNext(a)}if(null!==b)for(d=0;d<b.length;d++)c=b[d],c.ensureActive()};this.onError=function(a){var b=null,c;m();if(!q){q=!0;j(t.createOnError(a));b=f.toArray();for(c=0;c<b.length;c++)b[c].onError(a);f=new u}if(null!==b)for(c=0;c<b.length;c++)b[c].ensureActive()};
this.onCompleted=function(){var a=null,b;m();if(!q){q=!0;j(t.createOnCompleted());a=f.toArray();for(b=0;b<a.length;b++)a[b].onCompleted();f=new u}if(null!==a)for(b=0;b<a.length;b++)a[b].ensureActive()};this._subscribe=function(a){var a=new na(h,a),b=function(a){return{observer:a,dispose:function(){this.observer.dispose();null!==this.observer&&!k&&f.remove(this.observer)}}}(a),c;m();i(h.now());f.add(a);for(c=0;c<l.length;c++)l[c].value.accept(a);a.ensureActive();return b};this.dispose=function(){k=
!0;f=null}}o(a,j);E(a,j);a.prototype.onNext=function(a){this.onNext(a)};a.prototype.onError=function(a){this.onError(a)};a.prototype.onCompleted=function(){this.onCompleted()};a.prototype._subscribe=function(a){return this._subscribe(a)};a.prototype.dispose=function(){this.dispose()};return a}(),ra=function(){function a(a,c){this.observer=a;this.observable=c}o(a,j);E(a,r);a.prototype.onCompleted=function(){return this.observer.onCompleted()};a.prototype.onError=function(a){return this.observer.onError(a)};
a.prototype.onNext=function(a){return this.observer.onNext(a)};a.prototype._Subscribe=function(a){return this.observable.Subscribe(a)};return a}();j.start=function(a,b,c,d){c||(c=[]);return sa(a,d).apply(b,c)};var sa=j.toAsync=function(a,b){b||(b=ma);return function(){var c=new U,d=function(){var b;try{b=a.apply(this,arguments)}catch(d){c.onError(d);return}c.onNext(b);c.onCompleted()},e=y.call(arguments),g=this;b.schedule(function(){d.apply(g,e)});return c}};f.multicast=function(a,b){var c=this;return"function"===
typeof a?i(function(d){var e=c.multicast(a());return new p(b(e).subscribe(d),e.connect())}):new qa(c,a)};f.publish=function(a){return!a?this.multicast(new O):this.multicast(function(){return new O},a)};f.publishLast=function(a){return!a?this.multicast(new U):this.multicast(function(){return new U},a)};f.replay=function(a,b,c,d){return!a||null===a?this.multicast(new ca(b,c,d)):this.multicast(function(){return new ca(b,c,d)},a)};f.publishValue=function(a,b){return"function"===typeof a?this.multicast(function(){return new P(b)},
a):this.multicast(new P(a))};var da=j.never=function(){return i(function(){return w})},ta=j.empty=function(a){a||(a=B);return i(function(b){return a.schedule(function(){return b.onCompleted()})})},ua=j.returnValue=function(a,b){b||(b=B);return i(function(c){return b.schedule(function(){c.onNext(a);return c.onCompleted()})})},ea=j.throwException=function(a,b){b||(b=B);return i(function(c){return b.schedule(function(){return c.onError(a)})})},va=j.generate=function(a,b,c,d,e){e||(e=D);return i(function(g){var h=
!0,f=a;return e.scheduleRecursive(function(a){var e,k;try{h?h=!1:f=c(f),(e=b(f))&&(k=d(f))}catch(i){g.onError(i);return}if(e)g.onNext(k),a();else g.onCompleted()})})},fa=j.defer=function(a){return i(function(b){var c;try{c=a()}catch(d){return ea(d).subscribe(b)}return c.subscribe(b)})};j.using=function(a,b){return i(function(c){var d=w,e,g;try{e=a(),null!==e&&(d=e),g=b(e)}catch(h){return new p(ea(h).subscribe(c),d)}return new p(g.subscribe(c),d)})};var ga=j.fromArray=function(a,b){b||(b=D);return i(function(c){var d=
0;return b.scheduleRecursive(function(b){if(d<a.length)c.onNext(a[d++]),b();else c.onCompleted()})})},i=j.createWithDisposable=function(a){return new pa(a)};j.create=function(a){return i(function(b){return A(a(b))})};j.range=function(a,b,c){c||(c=D);var d=a+b-1;return va(a,function(a){return a<=d},function(a){return a+1},function(a){return a},c)};f.repeat=function(a){return $(this,a).concat()};f.retry=function(a){return $(this,a).catchException()};j.repeat=function(a,b,c){c||(c=D);b===n&&(b=-1);return ua(a,
c).repeat(b)};f.select=function(a){var b=this;return i(function(c){var d=0;return b.subscribe(function(b){var g;try{g=a(b,d++)}catch(h){c.onError(h);return}c.onNext(g)},function(a){c.onError(a)},function(){c.onCompleted()})})};f.where=function(a){var b=this;return i(function(c){var d=0;return b.subscribe(function(b){var g;try{g=a(b,d++)}catch(h){c.onError(h);return}if(g)c.onNext(b)},function(a){c.onError(a)},function(){c.onCompleted()})})};f.groupByUntil=function(a,b,c,d){var e=this;b||(b=Q);d||(d=
W);return i(function(g){var h={},f=new p,i=new Z(f);f.add(e.subscribe(function(e){var k,j,m,t,o,p,u,s,r;try{j=a(e),p=d(j)}catch(w){for(r in h)h[r].onError(w);g.onError(w);return}o=!1;try{s=h[p],s||(s=new O,h[p]=s,o=!0)}catch(x){for(r in h)h[r].onError(x);g.onError(x);return}if(o){o=new ba(j,s,i);j=new ba(j,s);try{k=c(j)}catch(y){for(r in h)h[r].onError(y);g.onError(y);return}g.onNext(o);u=new v;f.add(u);t=function(){h[p]!==n&&(delete h[p],s.onCompleted());f.remove(u)};u.disposable(k.take(1).subscribe(function(){},
function(a){for(r in h)h[r].onError(a);g.onError(a)},function(){t()}))}try{m=b(e)}catch(A){for(r in h)h[r].onError(A);g.onError(A);return}s.onNext(m)},function(a){for(var b in h)h[b].onError(a);g.onError(a)},function(){for(var a in h)h[a].onCompleted();g.onCompleted()}));return i})};f.groupBy=function(a,b,c){return this.groupByUntil(a,b,function(){return da()},c)};f.take=function(a,b){if(0>a)throw Error("Argument out of range");if(0==a)return ta(b);var c=this;return i(function(b){var e=a;return c.subscribe(function(a){if(0<
e&&(e--,b.onNext(a),0===e))b.onCompleted()},function(a){return b.onError(a)},function(){return b.onCompleted()})})};f.skip=function(a){if(0>a)throw Error("Argument out of range");var b=this;return i(function(c){var d=a;return b.subscribe(function(a){if(0>=d)c.onNext(a);else d--},function(a){return c.onError(a)},function(){return c.onCompleted()})})};f.takeWhile=function(a){var b=this;return i(function(c){var d=0,e=!0;return b.subscribe(function(b){if(e){try{e=a(b,d++)}catch(h){c.onError(h);return}if(e)c.onNext(b);
else c.onCompleted()}},function(a){return c.onError(a)},function(){return c.onCompleted()})})};f.skipWhile=function(a){var b=this;return i(function(c){var d=0,e=!1;return b.subscribe(function(b){if(!e)try{e=!a(b,d++)}catch(h){c.onError(h);return}if(e)c.onNext(b)},function(a){c.onError(a)},function(){c.onCompleted()})})};f.selectMany=function(a,b){return b!==n?this.selectMany(function(c){return a(c).select(function(a){return b(c,a)})}):"function"===typeof a?this.select(a).mergeObservable():this.select(function(){return a}).mergeObservable()};
f.finalValue=function(){var a=this;return i(function(b){var c=!1,d;return a.subscribe(function(a){c=!0;d=a},function(a){b.onError(a)},function(){if(c)b.onNext(d),b.onCompleted();else b.onError(Error("Sequence contains no elements."))})})};f.toArray=function(){return this.scan([],function(a,b){a.push(b);return a}).startWith([]).finalValue()};f.materialize=function(){var a=this;return i(function(b){return a.subscribe(function(a){b.onNext(t.createOnNext(a))},function(a){b.onNext(t.createOnError(a));
b.onCompleted()},function(){b.onNext(t.createOnCompleted());b.onCompleted()})})};f.dematerialize=function(){var a=this;return i(function(b){return a.subscribe(function(a){return a.accept(b)},function(a){b.onError(a)},function(){b.onCompleted()})})};f.asObservable=function(){var a=this;return i(function(b){return a.subscribe(b)})};f.windowWithCount=function(a,b){var c=this;if(0>=a)throw Error("Argument out of range");b===n&&(b=a);if(0>=b)throw Error("Argument out of range");return i(function(d){var e=
new v,g=new Z(e),h=0,f=[],i=function(){var a=new O;f.push(a);d.onNext(ja(a,g))};i();e.disposable(c.subscribe(function(c){var d;for(d=0;d<f.length;d++)f[d].onNext(c);c=h-a+1;0<=c&&0===c%b&&(c=f.shift(),c.onCompleted());h++;0===h%b&&i()},function(a){for(;0<f.length;)f.shift().onError(a);d.onError(a)},function(){for(;0<f.length;)f.shift().onCompleted();d.onCompleted()}));return g})};f.bufferWithCount=function(a,b){b===n&&(b=a);return this.windowWithCount(a,b).selectMany(function(a){return a.toArray()}).where(function(a){return 0<
a.length})};f.startWith=function(){var a,b;a=0;0<arguments.length&&void 0!==arguments[0].now?(b=arguments[0],a=1):b=B;a=y.call(arguments,a);return S([ga(a,b),this]).concat()};f.scan=function(a,b){var c=this;return fa(function(){var d=!1,e;return c.select(function(c){d?e=b(e,c):(e=b(a,c),d=!0);return e})})};f.scan1=function(a){var b=this;return fa(function(){var c=!1,d;return b.select(function(b){c?d=a(d,b):(d=b,c=!0);return d})})};f.distinctUntilChanged=function(a,b){var c=this;a||(a=Q);b||(b=V);
return i(function(d){var e=!1,g;return c.subscribe(function(c){var f=!1,i;try{i=a(c)}catch(j){d.onError(j);return}if(e)try{f=b(g,i)}catch(k){d.onError(k);return}if(!e||!f)e=!0,g=i,d.onNext(c)},function(a){d.onError(a)},function(){d.onCompleted()})})};f.finallyAction=function(a){var b=this;return i(function(c){var d=b.subscribe(c);return A(function(){try{d.dispose()}finally{a()}})})};f.doAction=function(a,b,c){var d=this,e;0==arguments.length||1<arguments.length||"function"==typeof a?e=a:(e=function(b){a.onNext(b)},
b=function(b){a.onError(b)},c=function(){a.onCompleted()});return i(function(a){return d.subscribe(function(b){try{e(b)}catch(c){a.onError(c)}a.onNext(b)},function(c){if(b)try{b(c)}catch(d){a.onError(d)}a.onError(c)},function(){if(c)try{c()}catch(b){a.onError(b)}a.onCompleted()})})};f.skipLast=function(a){var b=this;return i(function(c){var d=[];return b.subscribe(function(b){d.push(b);if(d.length>a)c.onNext(d.shift())},function(a){c.onError(a)},function(){c.onCompleted()})})};f.takeLast=function(a){var b=
this;return i(function(c){var d=[];return b.subscribe(function(b){d.push(b);d.length>a&&d.shift()},function(a){c.onError(a)},function(){for(;0<d.length;)c.onNext(d.shift());c.onCompleted()})})};f.ignoreElements=function(){var a=this;return i(function(b){return a.subscribe(ia,function(a){b.onError(a)},function(){b.onCompleted()})})};f.elementAt=function(a){if(0>a)throw Error("Argument out of range");var b=this;return i(function(c){var d=a;return b.subscribe(function(a){0===d&&(c.onNext(a),c.onCompleted());
d--},function(a){c.onError(a)},function(){c.onError(Error("Argument out of range"))})})};f.elementAtOrDefault=function(a,b){var c=this;if(0>a)throw Error("Argument out of range");b===n&&(b=null);return i(function(d){var e=a;return c.subscribe(function(a){0===e&&(d.onNext(a),d.onCompleted());e--},function(a){d.onError(a)},function(){d.onNext(b);d.onCompleted()})})};f.defaultIfEmpty=function(a){var b=this;a===n&&(a=null);return i(function(c){var d=!1;return b.subscribe(function(a){d=!0;c.onNext(a)},
function(a){c.onError(a)},function(){if(!d)c.onNext(a);c.onCompleted()})})};f.distinct=function(a,b){var c=this;a||(a=Q);b||(b=W);return i(function(d){var e={};return c.subscribe(function(c){var f,i,j,q=!1;try{f=a(c),i=b(f)}catch(k){d.onError(k);return}for(j in e)if(i===j){q=!0;break}q||(e[i]=null,d.onNext(c))},function(a){d.onError(a)},function(){d.onCompleted()})})};f.mergeObservable=function(){var a=this;return i(function(b){var c=new p,d=!1,e=new v;c.add(e);e.disposable(a.subscribe(function(a){var e=
new v;c.add(e);e.disposable(a.subscribe(function(a){b.onNext(a)},function(a){b.onError(a)},function(){c.remove(e);if(d&&1===c.count())b.onCompleted()}))},function(a){b.onError(a)},function(){d=!0;if(1===c.count())b.onCompleted()}));return c})};f.merge=function(a){var b=this;return i(function(c){var d=0,e=new p,g=!1,f=[],i=function(a){var b=new v;e.add(b);b.disposable(a.subscribe(function(a){c.onNext(a)},function(a){c.onError(a)},function(){var a;e.remove(b);if(0<f.length)a=f.shift(),i(a);else if(d--,
g&&0===d)c.onCompleted()}))};e.add(b.subscribe(function(b){d<a?(d++,i(b)):f.push(b)},function(a){c.onError(a)},function(){g=!0;if(0===d)c.onCompleted()}));return e})};f.switchLatest=function(){var a=this;return i(function(b){var c=!1,d=new C,e=!1,g=0,f=a.subscribe(function(a){var f=new v,h=++g;c=!0;d.disposable(f);return f.disposable(a.subscribe(function(a){if(g===h)b.onNext(a)},function(a){if(g===h)b.onError(a)},function(){if(g===h&&(c=!1,e))b.onCompleted()}))},function(a){b.onError(a)},function(){e=
!0;if(!c)b.onCompleted()});return new p(f,d)})};j.merge=function(a){a||(a=B);var b=1<arguments.length&&arguments[1]instanceof Array?arguments[1]:y.call(arguments,1);return ga(b,a).mergeObservable()};f.concat=function(){var a=wa,b;b=arguments;var c,d;c=[];for(d=0;d<b.length;d++)c.push(b[d]);b=c;b.unshift(this);return a.apply(this,b)};f.concatObservable=function(){return this.merge(1)};var wa=j.concat=function(){var a=1===arguments.length&&arguments[0]instanceof Array?arguments[0]:y.call(arguments);
return S(a).concat()};f.catchException=function(a){return"function"===typeof a?xa(this,a):ya([this,a])};var xa=function(a,b){return i(function(c){var d=new v,e=new C;d.disposable(a.subscribe(function(a){c.onNext(a)},function(a){var d;try{d=b(a)}catch(f){c.onError(f);return}a=new v;e.disposable(a);a.disposable(d.subscribe(c))},function(){c.onCompleted()}));return e})},ya=j.catchException=function(){var a=1===arguments.length&&arguments[0]instanceof Array?arguments[0]:y.call(arguments);return S(a).catchException()};
f.onErrorResumeNext=function(a){return za([this,a])};var za=j.onErrorResumeNext=function(){var a=1===arguments.length&&arguments[0]instanceof Array?arguments[0]:y.call(arguments);return i(function(b){var c=0,d=new C,e=B.scheduleRecursive(function(e){var f,i;if(c<a.length)f=a[c++],i=new v,d.disposable(i),i.disposable(f.subscribe(function(a){b.onNext(a)},function(){e()},function(){e()}));else b.onCompleted()});return new p(d,e)})},Aa=function(){function a(a,c){var d=this;this.selector=a;this.observer=
c;this.leftQ=[];this.rightQ=[];this.left=I(function(a){if("E"===a.kind)d.observer.onError(a.exception);else if(0===d.rightQ.length)d.leftQ.push(a);else d.onNext(a,d.rightQ.shift())});this.right=I(function(a){if("E"===a.kind)d.observer.onError(a.exception);else if(0===d.leftQ.length)d.rightQ.push(a);else d.onNext(d.leftQ.shift(),a)})}a.prototype.onNext=function(a,c){var d;if("C"===a.kind||"C"===c.kind)this.observer.onCompleted();else{try{d=this.selector(a.value,c.value)}catch(e){this.observer.onError(e);
return}this.observer.onNext(d)}};return a}();f.zip=function(a,b){return F(this,a,function(a){var d=new Aa(b,a);return new H(function(a){return d.left.onNext(a)},function(a){return d.right.onNext(a)})})};var ha;ha=function(){function a(a,c){var d=this;this.selector=a;this.observer=c;this.rightStopped=this.leftStopped=!1;this.left=I(function(a){if("N"===a.kind)if(d.leftValue=a,d.rightValue!==n)d.onNext();else{if(d.rightStopped)d.observer.onCompleted()}else if("E"===a.kind)d.observer.onError(a.exception);
else if(d.leftStopped=!0,d.rightStopped)d.observer.onCompleted()});this.right=I(function(a){if("N"===a.kind)if(d.rightValue=a,d.leftValue!==n)d.onNext();else{if(d.leftStopped)d.observer.onCompleted()}else if("E"===a.kind)d.observer.onError(a.exception);else if(d.rightStopped=!0,d.leftStopped)d.observer.onCompleted()})}a.prototype.onNext=function(){var a;try{a=this.selector(this.leftValue.value,this.rightValue.value)}catch(c){this.observer.onError(c);return}this.observer.onNext(a)};return a}();f.combineLatest=
function(a,b){return F(this,a,function(a){var d=new ha(b,a);return new H(function(a){return d.left.onNext(a)},function(a){return d.right.onNext(a)})})};f.takeUntil=function(a){return F(a,this,function(a,c){var d=!1,e=!1;return new H(function(c){!e&&!d&&("C"===c.kind?d=!0:"E"===c.kind?(e=d=!0,a.onError(c.exception)):(e=!0,a.onCompleted()))},function(d){e||(d.accept(a),(e="N"!==d.kind)&&c.dispose())})})};f.skipUntil=function(a){return F(this,a,function(a,c,d){var e=!1,f=!1;return new H(function(c){if("E"==
c.kind)a.onError(c.exception);else e&&c.accept(a)},function(c){if(!f){if("N"===c.kind)e=!0;else if("E"===c.kind)a.onError(c.exception);f=!0;d.dispose()}})})};j.amb=function(){var a=da(),b,c=1===arguments.length&&arguments[0]instanceof Array?arguments[0]:y.call(arguments);for(b=0;b<c.length;b++)a=a.amb(c[b]);return a};f.amb=function(a){return F(this,a,function(a,c,d){var e="N";return new H(function(c){"N"===e&&(e="L",d.dispose());"L"===e&&c.accept(a)},function(d){"N"===e&&(e="R",c.dispose());"R"===
e&&d.accept(a)})})}};

},{}],22:[function(require,module,exports){
/*
 Copyright (c) Microsoft Corporation.  All rights reserved.
 This code is licensed by Microsoft Corporation under the terms
 of the MICROSOFT REACTIVE EXTENSIONS FOR JAVASCRIPT AND .NET LIBRARIES License.
 See http://go.microsoft.com/fwlink/?LinkID=220762.
*/
module.exports = function(q,h){var f;f=q.Rx;var z=f.Observable,u=f.CompositeDisposable,E=f.RefCountDisposable,s=f.SingleAssignmentDisposable,K=f.SerialDisposable,A=f.Subject;f=z.prototype;var L=z.empty,v=z.createWithDisposable,M=function(b,a){return b===a},N=function(){},B=function(b,a){return v(function(c){return new u(a.getDisposable(),b.subscribe(c))})},C,F,o,G,w,x;o=[1,3,7,13,31,61,127,251,509,1021,2039,4093,8191,16381,
32749,65521,131071,262139,524287,1048573,2097143,4194301,8388593,16777213,33554393,67108859,134217689,268435399,536870909,1073741789,2147483647];F=function(b){var a,c;if(b&0)return 2===b;a=Math.sqrt(b);for(c=3;c<=a;){if(0===b%c)return!1;c+=2}return!0};C=function(b){var a,c;for(a=0;a<o.length;++a)if(c=o[a],c>=b)return c;for(a=b|1;a<o[o.length-1];){if(F(a))return a;a+=2}return b};G=0;w=function(b){var a;if(b===h)throw"no such key";if(b.getHashCode!==h)return b.getHashCode();a=17*G++;b.getHashCode=function(){return a};
return a};x=function(){return{key:null,value:null,next:0,hashCode:0}};var y=function(){function b(a,c){this._initialize(a);this.comparer=c||M;this.size=this.freeCount=0;this.freeList=-1}b.prototype._initialize=function(a){var a=C(a),c;this.buckets=Array(a);this.entries=Array(a);for(c=0;c<a;c++)this.buckets[c]=-1,this.entries[c]=x();this.freeList=-1};b.prototype.count=function(){return this.size};b.prototype.add=function(a,c){return this._insert(a,c,!0)};b.prototype._insert=function(a,c,b){var e,d,
g;this.buckets===h&&this._initialize(0);g=w(a)&2147483647;e=g%this.buckets.length;for(d=this.buckets[e];0<=d;d=this.entries[d].next)if(this.entries[d].hashCode===g&&this.comparer(this.entries[d].key,a)){if(b)throw"duplicate key";this.entries[d].value=c;return}0<this.freeCount?(b=this.freeList,this.freeList=this.entries[b].next,--this.freeCount):(this.size===this.entries.length&&(this._resize(),e=g%this.buckets.length),b=this.size,++this.size);this.entries[b].hashCode=g;this.entries[b].next=this.buckets[e];
this.entries[b].key=a;this.entries[b].value=c;this.buckets[e]=b};b.prototype._resize=function(){var a,c,b,e,d;d=C(2*this.size);b=Array(d);for(a=0;a<b.length;++a)b[a]=-1;e=Array(d);for(a=0;a<this.size;++a)e[a]=this.entries[a];for(a=this.size;a<d;++a)e[a]=x();for(a=0;a<this.size;++a)c=e[a].hashCode%d,e[a].next=b[c],b[c]=a;this.buckets=b;this.entries=e};b.prototype.remove=function(a){var b,k,e,d;if(this.buckets!==h){d=w(a)&2147483647;b=d%this.buckets.length;k=-1;for(e=this.buckets[b];0<=e;e=this.entries[e].next){if(this.entries[e].hashCode===
d&&this.comparer(this.entries[e].key,a))return 0>k?this.buckets[b]=this.entries[e].next:this.entries[k].next=this.entries[e].next,this.entries[e].hashCode=-1,this.entries[e].next=this.freeList,this.entries[e].key=null,this.entries[e].value=null,this.freeList=e,++this.freeCount,!0;k=e}}return!1};b.prototype.clear=function(){var a;if(!(0>=this.size)){for(a=0;a<this.buckets.length;++a)this.buckets[a]=-1;for(a=0;a<this.size;++a)this.entries[a]=x();this.freeList=-1;this.size=0}};b.prototype._findEntry=
function(a){var b,k;if(this.buckets!==h){k=w(a)&2147483647;for(b=this.buckets[k%this.buckets.length];0<=b;b=this.entries[b].next)if(this.entries[b].hashCode===k&&this.comparer(this.entries[b].key,a))return b}return-1};b.prototype.count=function(){return this.size-this.freeCount};b.prototype.tryGetEntry=function(a){a=this._findEntry(a);return 0<=a?{key:this.entries[a].key,value:this.entries[a].value}:h};b.prototype.getValues=function(){var a=0,b,k=[];if(this.entries!==h)for(b=0;b<this.size;b++)if(0<=
this.entries[b].hashCode)k[a++]=this.entries[b].value;return k};b.prototype.get=function(a){a=this._findEntry(a);if(0<=a)return this.entries[a].value;throw Error("no such key");};b.prototype.set=function(a,b){this._insert(a,b,!1)};b.prototype.containskey=function(a){return 0<=this._findEntry(a)};return b}();f.join=function(b,a,c,k){var e=this;return v(function(d){var g=new u,j=!1,f=0,l=new y,h=!1,r=0,t=new y;g.add(e.subscribe(function(b){var c,e,p=f++,i=new s,H;l.add(p,b);g.add(i);e=function(){if(l.remove(p)&&
0===l.count()&&j)d.onCompleted();return g.remove(i)};try{c=a(b)}catch(h){d.onError(h);return}i.disposable(c.take(1).subscribe(function(){},function(a){d.onError(a)},function(){e()}));c=t.getValues();for(var n=0;n<c.length;n++){try{H=k(b,c[n])}catch(r){d.onError(r);break}d.onNext(H)}},function(a){d.onError(a)},function(){j=!0;if(h||0===l.count())d.onCompleted()}));g.add(b.subscribe(function(a){var b,e,p=r++,i=new s,j;t.add(p,a);g.add(i);e=function(){if(t.remove(p)&&0===t.count()&&h)d.onCompleted();
return g.remove(i)};try{b=c(a)}catch(f){d.onError(f);return}i.disposable(b.take(1).subscribe(function(){},function(a){d.onError(a)},function(){e()}));b=l.getValues();for(var n=0;n<b.length;n++){try{j=k(b[n],a)}catch(O){d.onError(O);break}d.onNext(j)}},function(a){d.onError(a)},function(){h=!0;if(j||0===t.count())d.onCompleted()}));return g})};f.groupJoin=function(b,a,c,k){var e=this;return v(function(d){var g=new u,j=new E(g),f=0,l=new y,h=0,r=new y;g.add(e.subscribe(function(b){var c,e,m,p=f++,i,
h,D,n=new A;l.add(p,n);try{m=k(b,B(n,j))}catch(o){i=l.getValues();for(m=0;m<i.length;m++)i[m].onError(o);d.onError(o);return}d.onNext(m);D=r.getValues();for(m=0;m<D.length;m++)n.onNext(D[m]);h=new s;g.add(h);e=function(){if(l.remove(p))n.onCompleted();g.remove(h)};try{c=a(b)}catch(q){i=l.getValues();for(m=0;m<i.length;m++)i[m].onError(q);d.onError(q);return}h.disposable(c.take(1).subscribe(function(){},function(a){var b;i=l.getValues();for(b=0;b<i.length;b++)i[b].onError(a);d.onError(a)},function(){e()}))},
function(a){var b,c;c=l.getValues();for(b=0;b<c.length;b++)c[b].onError(a);d.onError(a)},function(){d.onCompleted()}));g.add(b.subscribe(function(a){var b,e,k,f,i;k=h++;r.add(k,a);i=new s;g.add(i);e=function(){r.remove(k);g.remove(i)};try{b=c(a)}catch(j){f=l.getValues();for(b=0;b<f.length;b++)f[b].onError(j);d.onError(j);return}i.disposable(b.take(1).subscribe(function(){},function(a){var b;f=l.getValues();for(b=0;b<f.length;b++)f[b].onError(a);d.onError(a)},function(){e()}));f=l.getValues();for(b=
0;b<f.length;b++)f[b].onNext(a)},function(b){var a,c;c=l.getValues();for(a=0;a<c.length;a++)c[a].onError(b);d.onError(b)}));return j})};f.buffer=function(b,a){return"function"===typeof b?I(b).selectMany(function(a){return observableToArray(a)}):J(this,b,a).selectMany(function(a){return observableToArray(a)})};f.window=function(b,a){return"function"===typeof b?I.call(this,b):J.call(this,b,a)};var J=function(b,a){return b.groupJoin(this,a,function(){return L()},function(a,b){return b})},I=function(b){var a=
this;return v(function(c){var f,e=new K,d=new u(e),g=new E(d),j=new A;c.onNext(B(j,g));d.add(a.subscribe(function(a){j.onNext(a)},function(a){j.onError(a);c.onError(a)},function(){j.onCompleted();c.onCompleted()}));f=function(){var a,d;try{d=b()}catch(h){c.onError(h);return}a=new s;e.disposable(a);a.disposable(d.take(1).subscribe(N,function(a){j.onError(a);c.onError(a)},function(){j.onCompleted();j=new A;c.onNext(B(j,g));f()}))};f();return g})}};

},{}],23:[function(require,module,exports){
/*
 Copyright (c) Microsoft Corporation.  All rights reserved.
 This code is licensed by Microsoft Corporation under the terms
 of the MICROSOFT REACTIVE EXTENSIONS FOR JAVASCRIPT AND .NET LIBRARIES License.
 See http://go.microsoft.com/fwlink/?LinkID=220762.
*/
module.exports = function(k,t){var l;l=k.Rx;var n=l.Observable,d=n.prototype,m=n.createWithDisposable,u=l.CompositeDisposable,o=function(a,b){return a===b},p=function(a){return a},q=function(a,b){return a>b?1:a===b?0:-1},r=function(a,b,d){return m(function(c){var f=!1,g=null,h=[];return a.subscribe(function(a){var e,i;try{i=b(a)}catch(v){c.onError(v);return}e=0;if(f)try{e=d(i,g)}catch(w){c.onError(w);return}else f=!0,g=
i;0<e&&(g=i,h=[]);0<=e&&h.push(a)},function(a){c.onError(a)},function(){c.onNext(h);c.onCompleted()})})};d.aggregate=function(a,b){return this.scan(a,b).startWith(a).finalValue()};d.aggregate1=function(a){return this.scan1(a).finalValue()};d.any=function(a){var b=this;return a!==t?b.where(a).any():m(function(a){return b.subscribe(function(){a.onNext(!0);a.onCompleted()},function(b){a.onError(b)},function(){a.onNext(!1);a.onCompleted()})})};d.all=function(a){return this.where(function(b){return!a(b)}).any().select(function(a){return!a})};
d.contains=function(a,b){b||(b=o);return this.where(function(d){return b(d,a)}).any()};d.count=function(){return this.aggregate(0,function(a){return a+1})};d.sum=function(){return this.aggregate(0,function(a,b){return a+b})};d.minBy=function(a,b){b||(b=q);return r(this,a,function(a,c){return-1*b(a,c)})};var s=function(a){if(0==a.length)throw Error("Sequence contains no elements.");return a[0]};d.min=function(a){return this.minBy(p,a).select(function(a){return s(a)})};d.maxBy=function(a,b){b||(b=q);
return r(this,a,b)};d.max=function(a){return this.maxBy(p,a).select(function(a){return s(a)})};d.average=function(){return this.scan({sum:0,count:0},function(a,b){return{sum:a.sum+b,count:a.count+1}}).finalValue().select(function(a){return a.sum/a.count})};d.sequenceEqual=function(a,b){var d=this;b||(b=o);return m(function(c){var f=!1,g=!1,h=[],j=[],e=d.subscribe(function(a){var d,f;if(0<j.length){f=j.shift();try{d=b(f,a)}catch(e){c.onError(e);return}d||(c.onNext(!1),c.onCompleted())}else g?(c.onNext(!1),
c.onCompleted()):h.push(a)},function(a){c.onError(a)},function(){f=!0;0===h.length&&(0<j.length?(c.onNext(!1),c.onCompleted()):g&&(c.onNext(!0),c.onCompleted()))}),i=a.subscribe(function(a){var d,e;if(0<h.length){e=h.shift();try{d=b(e,a)}catch(g){c.onError(g);return}d||(c.onNext(!1),c.onCompleted())}else f?(c.onNext(!1),c.onCompleted()):j.push(a)},function(a){c.onError(a)},function(){g=!0;0===j.length&&(0<h.length?(c.onNext(!1),c.onCompleted()):f&&(c.onNext(!0),c.onCompleted()))});return new u(e,
i)})}};

},{}],24:[function(require,module,exports){
/*
 Copyright (c) Microsoft Corporation.  All rights reserved.
 This code is licensed by Microsoft Corporation under the terms
 of the MICROSOFT REACTIVE EXTENSIONS FOR JAVASCRIPT AND .NET LIBRARIES License.
 See http://go.microsoft.com/fwlink/?LinkID=220762.
*/
module.exports = function(w,n){var p;p=w.Rx;var q=p.Observable,o=q.prototype,m=q.createWithDisposable,y=q.defer,F=q.throwException,l=p.Scheduler.Timeout,r=p.SingleAssignmentDisposable,t=p.SerialDisposable,s=p.CompositeDisposable,z=p.RefCountDisposable,u=p.Subject,G=p.Internals.BinaryObserver,v=function(a,b){return m(function(c){return new s(b.getDisposable(),a.subscribe(c))})},H=function(a,b,c){return m(function(d){var f=
new r,e=new r,d=c(d,f,e);f.disposable(a.materialize().select(function(b){return{switchValue:function(c){return c(b)}}}).subscribe(d));e.disposable(b.materialize().select(function(b){return{switchValue:function(c,a){return a(b)}}}).subscribe(d));return new s(f,e)})},I=function(a,b){return m(function(c){return b.scheduleWithAbsolute(a,function(){c.onNext(0);c.onCompleted()})})},A=function(a,b,c){var d=0>b?0:b;return m(function(b){var e=0,g=a;return c.scheduleRecursiveWithAbsolute(g,function(a){var i;
0<d&&(i=c.now(),g+=d,g<=i&&(g=i+d));b.onNext(e++);a(g)})})},J=function(a,b){var c=0>a?0:a;return m(function(a){return b.scheduleWithRelative(c,function(){a.onNext(0);a.onCompleted()})})},B=function(a,b,c){return y(function(){return A(c.now()+a,b,c)})},K=q.interval=function(a,b){b||(b=l);return B(a,a,b)};q.timer=function(a,b,c){var d;c||(c=l);b!==n&&"number"===typeof b?d=b:b!==n&&"object"===typeof b&&(c=b);return a instanceof Date&&d===n?I(a.getTime(),c):a instanceof Date&&d!==n?A(a.getTime(),b,c):
d===n?J(a,c):B(a,d,c)};var D=function(a,b,c){return m(function(d){var f=!1,e=new t,g=null,h=[],i=!1,j;j=a.materialize().timestamp(c).subscribe(function(a){"E"===a.value.kind?(h=[],h.push(a),g=a.value.exception,a=!i):(h.push({value:a.value,timestamp:a.timestamp+b}),a=!f,f=!0);if(a)if(null!==g)d.onError(g);else a=new r,e.disposable(a),a.disposable(c.scheduleRecursiveWithRelative(b,function(a){var b,e,j;if(null===g){i=!0;do{b=null;if(0<h.length&&0>=h[0].timestamp-c.now())b=h.shift().value;null!==b&&
b.accept(d)}while(null!==b);j=!1;e=0;0<h.length?(j=!0,e=Math.max(0,h[0].timestamp-c.now())):f=!1;b=g;i=!1;if(null!==b)d.onError(b);else j&&a(e)}}))});return new s(j,e)})},L=function(a,b,c){return y(function(){var a=b-c.now();return D(a,c)})};o.delay=function(a,b){b||(b=l);return a instanceof Date?L(this,a.getTime(),b):D(this,a,b)};o.throttle=function(a,b){b||(b=l);var c=this;return m(function(d){var f=new t,e=!1,g=0,h,i=null;h=c.subscribe(function(c){var k;e=!0;i=c;g++;k=g;c=new r;f.disposable(c);
c.disposable(b.scheduleWithRelative(a,function(){if(e&&g===k)d.onNext(i);e=!1}))},function(a){f.dispose();d.onError(a);e=!1;g++},function(){f.dispose();if(e)d.onNext(i);d.onCompleted();e=!1;g++});return new s(h,f)})};o.windowWithTime=function(a,b,c){var d=this,f;b===n&&(f=a);c===n&&(c=l);"number"===typeof b?f=b:"object"===typeof b&&(f=a,c=b);return m(function(b){var g,h,i=f,j=a,k=[],x,C=new t,l=0;h=new s(C);x=new z(h);g=function(){var a,d,h,m,n;h=new r;C.disposable(h);a=d=!1;j===i?a=d=!0:j<i?d=!0:
a=!0;m=d?j:i;n=m-l;l=m;d&&(j+=f);a&&(i+=f);h.disposable(c.scheduleWithRelative(n,function(){var c;a&&(c=new u,k.push(c),b.onNext(v(c,x)));d&&(c=k.shift(),c.onCompleted());g()}))};k.push(new u);b.onNext(v(k[0],x));g();h.add(d.subscribe(function(a){var b,c;for(b=0;b<k.length;b++)c=k[b],c.onNext(a)},function(a){var c,d;for(c=0;c<k.length;c++)d=k[c],d.onError(a);b.onError(a)},function(){var a,c;for(a=0;a<k.length;a++)c=k[a],c.onCompleted();b.onCompleted()}));return x})};o.windowWithTimeOrCount=function(a,
b,c){var d=this;c||(c=l);return m(function(f){var e,g,h=0,i,j,k=new t,l=0;g=new s(k);i=new z(g);e=function(b){var d=new r;k.disposable(d);d.disposable(c.scheduleWithRelative(a,function(){var a;b===l&&(h=0,a=++l,j.onCompleted(),j=new u,f.onNext(v(j,i)),e(a))}))};j=new u;f.onNext(v(j,i));e(0);g.add(d.subscribe(function(a){var c=0,d=!1;j.onNext(a);h++;h===b&&(d=!0,h=0,c=++l,j.onCompleted(),j=new u,f.onNext(v(j,i)));d&&e(c)},function(a){j.onError(a);f.onError(a)},function(){j.onCompleted();f.onCompleted()}));
return i})};o.bufferWithTime=function(a,b,c){var d;b===n&&(d=a);c||(c=l);"number"===typeof b?d=b:"object"===typeof b&&(d=a,c=b);return this.windowWithTime(a,d,c).selectMany(function(a){return a.toArray()})};o.bufferWithTimeOrCount=function(a,b,c){c||(c=l);return this.windowWithTimeOrCount(a,b,c).selectMany(function(a){return a.toArray()})};o.timeInterval=function(a){var b=this;a||(a=l);return y(function(){var c=a.now();return b.select(function(b){var f=a.now(),e=f-c;c=f;return{value:b,interval:e}})})};
o.timestamp=function(a){a||(a=l);return this.select(function(b){return{value:b,timestamp:a.now()}})};var E=function(a,b){return H(a,b,function(a){var b=!1,f;return new G(function(e){"N"===e.kind&&(f=e);"E"===e.kind&&e.accept(a);"C"===e.kind&&(b=!0)},function(){var e=f;f=n;e!==n&&e.accept(a);if(b)a.onCompleted()})})};o.sample=function(a,b){b||(b=l);return"number"===typeof a?E(this,K(a,b)):E(this,a)};o.timeout=function(a,b,c){var d,f=this;b===n&&(b=F(Error("Timeout")));c||(c=l);d=a instanceof Date?
function(a,b){c.scheduleWithAbsolute(a,b)}:function(a,b){c.scheduleWithRelative(a,b)};return m(function(c){var g,h=0,i=new r,j=new t,k=!1,l=new t;j.disposable(i);g=function(){var f=h;l.disposable(d(a,function(){(k=h===f)&&j.disposable(b.subscribe(c))}))};g();i.disposable(f.subscribe(function(a){k||(h++,c.onNext(a),g())},function(a){k||(h++,c.onError(a))},function(){k||(h++,c.onCompleted())}));return new s(j,l)})};q.generateWithAbsoluteTime=function(a,b,c,d,f,e){e||(e=l);return m(function(g){var h=
!0,i=!1,j,k=a,l;return e.scheduleRecursiveWithAbsolute(e.now(),function(a){if(i)g.onNext(j);try{if(h?h=!1:k=c(k),i=b(k))j=d(k),l=f(k)}catch(e){g.onError(e);return}if(i)a(l);else g.onCompleted()})})};q.generateWithRelativeTime=function(a,b,c,d,f,e){e||(e=l);return m(function(g){var h=!0,i=!1,j,k=a,l;return e.scheduleRecursiveWithRelative(0,function(a){if(i)g.onNext(j);try{if(h?h=!1:k=c(k),i=b(k))j=d(k),l=f(k)}catch(e){g.onError(e);return}if(i)a(l);else g.onCompleted()})})}};

},{}],25:[function(require,module,exports){
/*
 Copyright (c) Microsoft Corporation.  All rights reserved.
 This code is licensed by Microsoft Corporation under the terms
 of the MICROSOFT REACTIVE EXTENSIONS FOR JAVASCRIPT AND .NET LIBRARIES License.
 See http://go.microsoft.com/fwlink/?LinkID=220762.
*/
module.exports = function(k,h){var i;i=k.Rx;var w=Array.prototype.slice,x=Object.prototype.hasOwnProperty,y=function(b,a){function c(){this.constructor=b}for(var f in a)x.call(a,f)&&(b[f]=a[f]);c.prototype=a.prototype;b.prototype=new c;b.base=a.prototype;return b},l=i.Observable,p=l.prototype,z=l.createWithDisposable,A=l.throwException,B=i.Observer.create,q=i.Internals.List,C=i.SingleAssignmentDisposable,D=i.CompositeDisposable,
E=i.Internals.AbstractObserver,F=function(b,a){return b===a},o,r,j,s,m,n;j=[1,3,7,13,31,61,127,251,509,1021,2039,4093,8191,16381,32749,65521,131071,262139,524287,1048573,2097143,4194301,8388593,16777213,33554393,67108859,134217689,268435399,536870909,1073741789,2147483647];r=function(b){var a,c;if(b&0)return 2===b;a=Math.sqrt(b);for(c=3;c<=a;){if(0===b%c)return!1;c+=2}return!0};o=function(b){var a,c;for(a=0;a<j.length;++a)if(c=j[a],c>=b)return c;for(a=b|1;a<j[j.length-1];){if(r(a))return a;a+=2}return b};
s=0;m=function(b){var a;if(b===h)throw"no such key";if(b.getHashCode!==h)return b.getHashCode();a=17*s++;b.getHashCode=function(){return a};return a};n=function(){return{key:null,value:null,next:0,hashCode:0}};var t=function(){function b(a,c){this._initialize(a);this.comparer=c||F;this.size=this.freeCount=0;this.freeList=-1}b.prototype._initialize=function(a){var a=o(a),c;this.buckets=Array(a);this.entries=Array(a);for(c=0;c<a;c++)this.buckets[c]=-1,this.entries[c]=n();this.freeList=-1};b.prototype.count=
function(){return this.size};b.prototype.add=function(a,c){return this._insert(a,c,!0)};b.prototype._insert=function(a,c,b){var d,e,g;this.buckets===h&&this._initialize(0);g=m(a)&2147483647;d=g%this.buckets.length;for(e=this.buckets[d];0<=e;e=this.entries[e].next)if(this.entries[e].hashCode===g&&this.comparer(this.entries[e].key,a)){if(b)throw"duplicate key";this.entries[e].value=c;return}0<this.freeCount?(b=this.freeList,this.freeList=this.entries[b].next,--this.freeCount):(this.size===this.entries.length&&
(this._resize(),d=g%this.buckets.length),b=this.size,++this.size);this.entries[b].hashCode=g;this.entries[b].next=this.buckets[d];this.entries[b].key=a;this.entries[b].value=c;this.buckets[d]=b};b.prototype._resize=function(){var a,c,b,d,e;e=o(2*this.size);b=Array(e);for(a=0;a<b.length;++a)b[a]=-1;d=Array(e);for(a=0;a<this.size;++a)d[a]=this.entries[a];for(a=this.size;a<e;++a)d[a]=n();for(a=0;a<this.size;++a)c=d[a].hashCode%e,d[a].next=b[c],b[c]=a;this.buckets=b;this.entries=d};b.prototype.remove=
function(a){var c,b,d,e;if(this.buckets!==h){e=m(a)&2147483647;c=e%this.buckets.length;b=-1;for(d=this.buckets[c];0<=d;d=this.entries[d].next){if(this.entries[d].hashCode===e&&this.comparer(this.entries[d].key,a))return 0>b?this.buckets[c]=this.entries[d].next:this.entries[b].next=this.entries[d].next,this.entries[d].hashCode=-1,this.entries[d].next=this.freeList,this.entries[d].key=null,this.entries[d].value=null,this.freeList=d,++this.freeCount,!0;b=d}}return!1};b.prototype.clear=function(){var a;
if(!(0>=this.size)){for(a=0;a<this.buckets.length;++a)this.buckets[a]=-1;for(a=0;a<this.size;++a)this.entries[a]=n();this.freeList=-1;this.size=0}};b.prototype._findEntry=function(a){var c,b;if(this.buckets!==h){b=m(a)&2147483647;for(c=this.buckets[b%this.buckets.length];0<=c;c=this.entries[c].next)if(this.entries[c].hashCode===b&&this.comparer(this.entries[c].key,a))return c}return-1};b.prototype.count=function(){return this.size-this.freeCount};b.prototype.tryGetEntry=function(a){a=this._findEntry(a);
return 0<=a?{key:this.entries[a].key,value:this.entries[a].value}:h};b.prototype.getValues=function(){var a=0,c,b=[];if(this.entries!==h)for(c=0;c<this.size;c++)if(0<=this.entries[c].hashCode)b[a++]=this.entries[c].value;return b};b.prototype.get=function(a){a=this._findEntry(a);if(0<=a)return this.entries[a].value;throw Error("no such key");};b.prototype.set=function(a,b){this._insert(a,b,!1)};b.prototype.containskey=function(a){return 0<=this._findEntry(a)};return b}(),u=function(){function b(a){this.patterns=
a}b.prototype.and=function(a){var c=this.patterns,f,d;d=[];for(f=0;f<c.length;f++)d.push(c[f]);d.push(a);return new b(d)};b.prototype.then=function(a){return new G(this,a)};return b}(),G=function(){function b(a,b){this.expression=a;this.selector=b}b.prototype.activate=function(a,b,f){var d,e,g,h;h=this;g=[];for(e=0;e<this.expression.patterns.length;e++)g.push(H(a,this.expression.patterns[e],function(a){b.onError(a)}));d=new v(g,function(){var a;try{a=h.selector.apply(h,arguments)}catch(d){b.onError(d);
return}b.onNext(a)},function(){var a;for(a=0;a<g.length;a++)g[a].removeActivePlan(d);f(d)});for(e=0;e<g.length;e++)g[e].addActivePlan(d);return d};return b}(),H=function(b,a,c){var f;f=b.tryGetEntry(a);return f===h?(c=new I(a,c),b.add(a,c),c):f.value},v;v=function(){function b(a,b,f){this.joinObserverArray=a;this.onNext=b;this.onCompleted=f;this.joinObservers=new t;for(a=0;a<this.joinObserverArray.length;a++)b=this.joinObserverArray[a],this.joinObservers.add(b,b)}b.prototype.dequeue=function(){var a,
b;b=this.joinObservers.getValues();for(a=0;a<b.length;a++)b[a].queue.shift()};b.prototype.match=function(){var a,b,f;a=!0;for(b=0;b<this.joinObserverArray.length;b++)if(0===this.joinObserverArray[b].queue.length){a=!1;break}if(a){a=[];f=!1;for(b=0;b<this.joinObserverArray.length;b++)a.push(this.joinObserverArray[b].queue[0]),"C"===this.joinObserverArray[b].queue[0].kind&&(f=!0);if(f)this.onCompleted();else{this.dequeue();f=[];for(b=0;b<a.length;b++)f.push(a[b].value);this.onNext.apply(this,f)}}};
return b}();var I=function(){function b(a,b){this.source=a;this.onError=b;this.queue=[];this.activePlans=new q;this.subscription=new C;this.isDisposed=!1}y(b,E);b.prototype.addActivePlan=function(a){this.activePlans.add(a)};b.prototype.subscribe=function(){this.subscription.disposable(this.source.materialize().subscribe(this))};b.prototype.next=function(a){var b;if(!this.isDisposed)if("E"===a.kind)this.onError(a.exception);else{this.queue.push(a);a=this.activePlans.toArray();for(b=0;b<a.length;b++)a[b].match()}};
b.prototype.error=function(){};b.prototype.completed=function(){};b.prototype.removeActivePlan=function(a){this.activePlans.remove(a);0===this.activePlans.count()&&this.dispose()};b.prototype.dispose=function(){b.base.dispose.call(this);if(!this.isDisposed)this.isDisposed=!0,this.subscription.dispose()};return b}();p.and=function(b){return new u([this,b])};p.then=function(b){return(new u([this])).then(b)};l.when=function(){var b=1===arguments.length&&arguments[0]instanceof Array?arguments[0]:w.call(arguments);
return z(function(a){var c=new q,f=new t,d,e,g,h,i;i=B(function(b){a.onNext(b)},function(b){for(var c=f.getValues(),d=0;d<c.length;d++)c[d].onError(b);a.onError(b)},function(){a.onCompleted()});try{for(e=0;e<b.length;e++)c.add(b[e].activate(f,i,function(a){c.remove(a);if(0===c.count())i.onCompleted()}))}catch(j){A(j).subscribe(a)}d=new D;h=f.getValues();for(e=0;e<h.length;e++)g=h[e],g.subscribe(),d.add(g);return d})}};

},{}]},{},[1])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9kZXZpY2UvanMvZGV2aWNlLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvM3JkcGFydHkvcm91dGllLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvM3JkcGFydHkvdGFwcGFibGUuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9kZXZpY2UvanMvY29udHJvbGxlcnMvcmVnaXN0ZXIuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9kZXZpY2UvanMvY29udHJvbGxlcnMvam9pbi5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2RldmljZS9qcy9jb250cm9sbGVycy90aGFua3MuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9kZXZpY2UvanMvcGxheWVyLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9ub2RlX21vZHVsZXMvdW5kZXJzY29yZS91bmRlcnNjb3JlLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZGV2aWNlL2pzL2NvbnRyb2xsZXJzL3dhaXQuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9kZXZpY2UvanMvY29udHJvbGxlcnMvbG9iYnkuanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9kZXZpY2UvanMvY29udHJvbGxlcnMvZ2FtZXBhZC5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzLzNyZHBhcnR5L3J4LnplcHRvLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZGV2aWNlL3ZpZXdzL3dhaXQuaGJzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9hc3NldHMvZGV2aWNlL3ZpZXdzL3JlZ2lzdGVyLWFkdmFuY2VkLmhicyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2RldmljZS92aWV3cy9qb2luLmhicyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2RldmljZS92aWV3cy9nYW1lcGFkLmhicyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvYXNzZXRzL2RldmljZS92aWV3cy9sb2JieS5oYnMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL2Fzc2V0cy9kZXZpY2Uvdmlld3MvdGhhbmtzLmhicyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvbm9kZV9tb2R1bGVzL3J4anMvbGliL3J4LmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9ub2RlX21vZHVsZXMvaGFuZGxlYmFycy1ydW50aW1lL2hhbmRsZWJhcnMucnVudGltZS5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvbm9kZV9tb2R1bGVzL3J4anMvbGliL3J4Lm1pbi5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvbm9kZV9tb2R1bGVzL3J4anMvbGliL3J4LmNvaW5jaWRlbmNlLm1pbi5qcyIsIi9Vc2Vycy9hdXJvcmFzdXJpZWwvRG9jdW1lbnRzL0RldmVsb3BtZW50L2pldHBldHMvbm9kZV9tb2R1bGVzL3J4anMvbGliL3J4LmFnZ3JlZ2F0ZXMubWluLmpzIiwiL1VzZXJzL2F1cm9yYXN1cmllbC9Eb2N1bWVudHMvRGV2ZWxvcG1lbnQvamV0cGV0cy9ub2RlX21vZHVsZXMvcnhqcy9saWIvcngudGltZS5taW4uanMiLCIvVXNlcnMvYXVyb3Jhc3VyaWVsL0RvY3VtZW50cy9EZXZlbG9wbWVudC9qZXRwZXRzL25vZGVfbW9kdWxlcy9yeGpzL2xpYi9yeC5qb2lucGF0dGVybnMubWluLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbE5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM3NDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNXQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbInZhciByb3V0aWUgPSByZXF1aXJlKCcuLi8uLi8zcmRwYXJ0eS9yb3V0aWUnKTtcbnZhciB0YXBwYWJsZSA9IHJlcXVpcmUoJy4uLy4uLzNyZHBhcnR5L3RhcHBhYmxlJyk7XG52YXIgcGxheWVyID0gcmVxdWlyZSgnLi9wbGF5ZXInKTtcblxud2luZG93LkRldmljZSA9IGZ1bmN0aW9uKCkge1xuICBcbiAgcm91dGllKHtcbiAgICAgICcnOiAgICAgICAgICAgIHJlcXVpcmUoJy4vY29udHJvbGxlcnMvcmVnaXN0ZXInKSxcbiAgICAgICcvcmVnaXN0ZXInOiAgIHJlcXVpcmUoJy4vY29udHJvbGxlcnMvcmVnaXN0ZXInKSxcbiAgICAgICcvd2FpdCc6ICAgICAgIHJlcXVpcmUoJy4vY29udHJvbGxlcnMvd2FpdCcpLFxuICAgICAgJy9qb2luJzogICAgICAgcmVxdWlyZSgnLi9jb250cm9sbGVycy9qb2luJyksXG4gICAgICAnL2xvYmJ5JzogICAgICByZXF1aXJlKCcuL2NvbnRyb2xsZXJzL2xvYmJ5JyksXG4gICAgICAnL2dhbWVwYWQnOiAgICByZXF1aXJlKCcuL2NvbnRyb2xsZXJzL2dhbWVwYWQnKSxcbiAgICAgICcvdGhhbmtzJzogICAgIHJlcXVpcmUoJy4vY29udHJvbGxlcnMvdGhhbmtzJylcbiAgfSk7XG4gIFxuICAkKCcjbWVudScpLm9uKCdjbGljaycsIGZ1bmN0aW9uKCkge1xuICAgIGlmICh3aW5kb3cuY29uZmlybSgnZGlzY29ubmVjdCBwbGF5ZXI/JykpIHtcbiAgICAgIHBsYXllci5yZXNldCgpO1xuICAgICAgcm91dGllLm5hdmlnYXRlKCcvJyk7XG4gICAgfVxuICB9KTtcbiAgXG59O1xuIiwiKGZ1bmN0aW9uIChyb290LCBmYWN0b3J5KSB7XG4gIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZhY3Rvcnkod2luZG93KTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcbiAgICBkZWZpbmUoW10sIGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiAocm9vdC5yb3V0aWUgPSBmYWN0b3J5KHdpbmRvdykpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJvb3Qucm91dGllID0gZmFjdG9yeSh3aW5kb3cpO1xuICB9XG59KHRoaXMsIGZ1bmN0aW9uICh3KSB7XG5cbiAgdmFyIHJvdXRlcyA9IFtdO1xuICB2YXIgbWFwID0ge307XG4gIHZhciByZWZlcmVuY2UgPSBcInJvdXRpZVwiO1xuICB2YXIgb2xkUmVmZXJlbmNlID0gd1tyZWZlcmVuY2VdO1xuXG4gIHZhciBSb3V0ZSA9IGZ1bmN0aW9uKHBhdGgsIG5hbWUpIHtcbiAgICB0aGlzLm5hbWUgPSBuYW1lO1xuICAgIHRoaXMucGF0aCA9IHBhdGg7XG4gICAgdGhpcy5rZXlzID0gW107XG4gICAgdGhpcy5mbnMgPSBbXTtcbiAgICB0aGlzLnBhcmFtcyA9IHt9O1xuICAgIHRoaXMucmVnZXggPSBwYXRoVG9SZWdleHAodGhpcy5wYXRoLCB0aGlzLmtleXMsIGZhbHNlLCBmYWxzZSk7XG5cbiAgfTtcblxuICBSb3V0ZS5wcm90b3R5cGUuYWRkSGFuZGxlciA9IGZ1bmN0aW9uKGZuKSB7XG4gICAgdGhpcy5mbnMucHVzaChmbik7XG4gIH07XG5cbiAgUm91dGUucHJvdG90eXBlLnJlbW92ZUhhbmRsZXIgPSBmdW5jdGlvbihmbikge1xuICAgIGZvciAodmFyIGkgPSAwLCBjID0gdGhpcy5mbnMubGVuZ3RoOyBpIDwgYzsgaSsrKSB7XG4gICAgICB2YXIgZiA9IHRoaXMuZm5zW2ldO1xuICAgICAgaWYgKGZuID09IGYpIHtcbiAgICAgICAgdGhpcy5mbnMuc3BsaWNlKGksIDEpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIFJvdXRlLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbihwYXJhbXMpIHtcbiAgICBmb3IgKHZhciBpID0gMCwgYyA9IHRoaXMuZm5zLmxlbmd0aDsgaSA8IGM7IGkrKykge1xuICAgICAgdGhpcy5mbnNbaV0uYXBwbHkodGhpcywgcGFyYW1zKTtcbiAgICB9XG4gIH07XG5cbiAgUm91dGUucHJvdG90eXBlLm1hdGNoID0gZnVuY3Rpb24ocGF0aCwgcGFyYW1zKXtcbiAgICB2YXIgbSA9IHRoaXMucmVnZXguZXhlYyhwYXRoKTtcblxuICAgIGlmICghbSkgcmV0dXJuIGZhbHNlO1xuXG5cbiAgICBmb3IgKHZhciBpID0gMSwgbGVuID0gbS5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgICAgdmFyIGtleSA9IHRoaXMua2V5c1tpIC0gMV07XG5cbiAgICAgIHZhciB2YWwgPSAoJ3N0cmluZycgPT0gdHlwZW9mIG1baV0pID8gZGVjb2RlVVJJQ29tcG9uZW50KG1baV0pIDogbVtpXTtcblxuICAgICAgaWYgKGtleSkge1xuICAgICAgICB0aGlzLnBhcmFtc1trZXkubmFtZV0gPSB2YWw7XG4gICAgICB9XG4gICAgICBwYXJhbXMucHVzaCh2YWwpO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9O1xuXG4gIFJvdXRlLnByb3RvdHlwZS50b1VSTCA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICAgIHZhciBwYXRoID0gdGhpcy5wYXRoO1xuICAgIGZvciAodmFyIHBhcmFtIGluIHBhcmFtcykge1xuICAgICAgcGF0aCA9IHBhdGgucmVwbGFjZSgnLzonK3BhcmFtLCAnLycrcGFyYW1zW3BhcmFtXSk7XG4gICAgfVxuICAgIHBhdGggPSBwYXRoLnJlcGxhY2UoL1xcLzouKlxcPy9nLCAnLycpLnJlcGxhY2UoL1xcPy9nLCAnJyk7XG4gICAgaWYgKHBhdGguaW5kZXhPZignOicpICE9IC0xKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21pc3NpbmcgcGFyYW1ldGVycyBmb3IgdXJsOiAnK3BhdGgpO1xuICAgIH1cbiAgICByZXR1cm4gcGF0aDtcbiAgfTtcblxuICB2YXIgcGF0aFRvUmVnZXhwID0gZnVuY3Rpb24ocGF0aCwga2V5cywgc2Vuc2l0aXZlLCBzdHJpY3QpIHtcbiAgICBpZiAocGF0aCBpbnN0YW5jZW9mIFJlZ0V4cCkgcmV0dXJuIHBhdGg7XG4gICAgaWYgKHBhdGggaW5zdGFuY2VvZiBBcnJheSkgcGF0aCA9ICcoJyArIHBhdGguam9pbignfCcpICsgJyknO1xuICAgIHBhdGggPSBwYXRoXG4gICAgICAuY29uY2F0KHN0cmljdCA/ICcnIDogJy8/JylcbiAgICAgIC5yZXBsYWNlKC9cXC9cXCgvZywgJyg/Oi8nKVxuICAgICAgLnJlcGxhY2UoL1xcKy9nLCAnX19wbHVzX18nKVxuICAgICAgLnJlcGxhY2UoLyhcXC8pPyhcXC4pPzooXFx3KykoPzooXFwoLio/XFwpKSk/KFxcPyk/L2csIGZ1bmN0aW9uKF8sIHNsYXNoLCBmb3JtYXQsIGtleSwgY2FwdHVyZSwgb3B0aW9uYWwpe1xuICAgICAgICBrZXlzLnB1c2goeyBuYW1lOiBrZXksIG9wdGlvbmFsOiAhISBvcHRpb25hbCB9KTtcbiAgICAgICAgc2xhc2ggPSBzbGFzaCB8fCAnJztcbiAgICAgICAgcmV0dXJuICcnICsgKG9wdGlvbmFsID8gJycgOiBzbGFzaCkgKyAnKD86JyArIChvcHRpb25hbCA/IHNsYXNoIDogJycpICsgKGZvcm1hdCB8fCAnJykgKyAoY2FwdHVyZSB8fCAoZm9ybWF0ICYmICcoW14vLl0rPyknIHx8ICcoW14vXSs/KScpKSArICcpJyArIChvcHRpb25hbCB8fCAnJyk7XG4gICAgICB9KVxuICAgICAgLnJlcGxhY2UoLyhbXFwvLl0pL2csICdcXFxcJDEnKVxuICAgICAgLnJlcGxhY2UoL19fcGx1c19fL2csICcoLispJylcbiAgICAgIC5yZXBsYWNlKC9cXCovZywgJyguKiknKTtcbiAgICByZXR1cm4gbmV3IFJlZ0V4cCgnXicgKyBwYXRoICsgJyQnLCBzZW5zaXRpdmUgPyAnJyA6ICdpJyk7XG4gIH07XG5cbiAgdmFyIGFkZEhhbmRsZXIgPSBmdW5jdGlvbihwYXRoLCBmbikge1xuICAgIHZhciBzID0gcGF0aC5zcGxpdCgnICcpO1xuICAgIHZhciBuYW1lID0gKHMubGVuZ3RoID09IDIpID8gc1swXSA6IG51bGw7XG4gICAgcGF0aCA9IChzLmxlbmd0aCA9PSAyKSA/IHNbMV0gOiBzWzBdO1xuXG4gICAgaWYgKCFtYXBbcGF0aF0pIHtcbiAgICAgIG1hcFtwYXRoXSA9IG5ldyBSb3V0ZShwYXRoLCBuYW1lKTtcbiAgICAgIHJvdXRlcy5wdXNoKG1hcFtwYXRoXSk7XG4gICAgfVxuICAgIG1hcFtwYXRoXS5hZGRIYW5kbGVyKGZuKTtcbiAgfTtcblxuICB2YXIgcm91dGllID0gZnVuY3Rpb24ocGF0aCwgZm4pIHtcbiAgICBpZiAodHlwZW9mIGZuID09ICdmdW5jdGlvbicpIHtcbiAgICAgIGFkZEhhbmRsZXIocGF0aCwgZm4pO1xuICAgICAgcm91dGllLnJlbG9hZCgpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHBhdGggPT0gJ29iamVjdCcpIHtcbiAgICAgIGZvciAodmFyIHAgaW4gcGF0aCkge1xuICAgICAgICBhZGRIYW5kbGVyKHAsIHBhdGhbcF0pO1xuICAgICAgfVxuICAgICAgcm91dGllLnJlbG9hZCgpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZuID09PSAndW5kZWZpbmVkJykge1xuICAgICAgcm91dGllLm5hdmlnYXRlKHBhdGgpO1xuICAgIH1cbiAgfTtcblxuICByb3V0aWUubG9va3VwID0gZnVuY3Rpb24obmFtZSwgb2JqKSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGMgPSByb3V0ZXMubGVuZ3RoOyBpIDwgYzsgaSsrKSB7XG4gICAgICB2YXIgcm91dGUgPSByb3V0ZXNbaV07XG4gICAgICBpZiAocm91dGUubmFtZSA9PSBuYW1lKSB7XG4gICAgICAgIHJldHVybiByb3V0ZS50b1VSTChvYmopO1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICByb3V0aWUucmVtb3ZlID0gZnVuY3Rpb24ocGF0aCwgZm4pIHtcbiAgICB2YXIgcm91dGUgPSBtYXBbcGF0aF07XG4gICAgaWYgKCFyb3V0ZSlcbiAgICAgIHJldHVybjtcbiAgICByb3V0ZS5yZW1vdmVIYW5kbGVyKGZuKTtcbiAgfTtcblxuICByb3V0aWUucmVtb3ZlQWxsID0gZnVuY3Rpb24oKSB7XG4gICAgbWFwID0ge307XG4gICAgcm91dGVzID0gW107XG4gIH07XG5cbiAgcm91dGllLm5hdmlnYXRlID0gZnVuY3Rpb24ocGF0aCwgb3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciBzaWxlbnQgPSBvcHRpb25zLnNpbGVudCB8fCBmYWxzZTtcblxuICAgIGlmIChzaWxlbnQpIHtcbiAgICAgIHJlbW92ZUxpc3RlbmVyKCk7XG4gICAgfVxuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IHBhdGg7XG5cbiAgICAgIGlmIChzaWxlbnQpIHtcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHsgXG4gICAgICAgICAgYWRkTGlzdGVuZXIoKTtcbiAgICAgICAgfSwgMSk7XG4gICAgICB9XG5cbiAgICB9LCAxKTtcbiAgfTtcblxuICByb3V0aWUubm9Db25mbGljdCA9IGZ1bmN0aW9uKCkge1xuICAgIHdbcmVmZXJlbmNlXSA9IG9sZFJlZmVyZW5jZTtcbiAgICByZXR1cm4gcm91dGllO1xuICB9O1xuXG4gIHZhciBnZXRIYXNoID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHdpbmRvdy5sb2NhdGlvbi5oYXNoLnN1YnN0cmluZygxKTtcbiAgfTtcblxuICB2YXIgY2hlY2tSb3V0ZSA9IGZ1bmN0aW9uKGhhc2gsIHJvdXRlKSB7XG4gICAgdmFyIHBhcmFtcyA9IFtdO1xuICAgIGlmIChyb3V0ZS5tYXRjaChoYXNoLCBwYXJhbXMpKSB7XG4gICAgICByb3V0ZS5ydW4ocGFyYW1zKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH07XG5cbiAgdmFyIGhhc2hDaGFuZ2VkID0gcm91dGllLnJlbG9hZCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBoYXNoID0gZ2V0SGFzaCgpO1xuICAgIGZvciAodmFyIGkgPSAwLCBjID0gcm91dGVzLmxlbmd0aDsgaSA8IGM7IGkrKykge1xuICAgICAgdmFyIHJvdXRlID0gcm91dGVzW2ldO1xuICAgICAgaWYgKGNoZWNrUm91dGUoaGFzaCwgcm91dGUpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgdmFyIGFkZExpc3RlbmVyID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHcuYWRkRXZlbnRMaXN0ZW5lcikge1xuICAgICAgdy5hZGRFdmVudExpc3RlbmVyKCdoYXNoY2hhbmdlJywgaGFzaENoYW5nZWQsIGZhbHNlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdy5hdHRhY2hFdmVudCgnb25oYXNoY2hhbmdlJywgaGFzaENoYW5nZWQpO1xuICAgIH1cbiAgfTtcblxuICB2YXIgcmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAody5yZW1vdmVFdmVudExpc3RlbmVyKSB7XG4gICAgICB3LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2hhc2hjaGFuZ2UnLCBoYXNoQ2hhbmdlZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHcuZGV0YWNoRXZlbnQoJ29uaGFzaGNoYW5nZScsIGhhc2hDaGFuZ2VkKTtcbiAgICB9XG4gIH07XG4gIGFkZExpc3RlbmVyKCk7XG5cbiAgcmV0dXJuIHJvdXRpZTtcbn0pKTtcbiIsIihmdW5jdGlvbigpeyhmdW5jdGlvbihyb290LCBmYWN0b3J5KXtcbiAgLy8gU2V0IHVwIFRhcHBhYmxlIGFwcHJvcHJpYXRlbHkgZm9yIHRoZSBlbnZpcm9ubWVudC5cbiAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCl7XG4gICAgLy8gQU1EXG4gICAgZGVmaW5lKCd0YXBwYWJsZScsIFtdLCBmdW5jdGlvbigpe1xuICAgICAgZmFjdG9yeShyb290LCB3aW5kb3cuZG9jdW1lbnQpO1xuICAgICAgcmV0dXJuIHJvb3QudGFwcGFibGU7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgLy8gQnJvd3NlciBnbG9iYWwgc2NvcGVcbiAgICBmYWN0b3J5KHJvb3QsIHdpbmRvdy5kb2N1bWVudCk7XG4gIH1cbn0odGhpcywgZnVuY3Rpb24odywgZCl7XG5cbiAgdmFyIGFicyA9IE1hdGguYWJzLFxuICAgIG5vb3AgPSBmdW5jdGlvbigpe30sXG4gICAgZGVmYXVsdHMgPSB7XG4gICAgICBub1Njcm9sbDogZmFsc2UsXG4gICAgICBhY3RpdmVDbGFzczogJ3RhcHBhYmxlLWFjdGl2ZScsXG4gICAgICBvblRhcDogbm9vcCxcbiAgICAgIG9uU3RhcnQ6IG5vb3AsXG4gICAgICBvbk1vdmU6IG5vb3AsXG4gICAgICBvbk1vdmVPdXQ6IG5vb3AsXG4gICAgICBvbk1vdmVJbjogbm9vcCxcbiAgICAgIG9uRW5kOiBub29wLFxuICAgICAgb25DYW5jZWw6IG5vb3AsXG4gICAgICBhbGxvd0NsaWNrOiBmYWxzZSxcbiAgICAgIGJvdW5kTWFyZ2luOiA1MCxcbiAgICAgIG5vU2Nyb2xsRGVsYXk6IDAsXG4gICAgICBhY3RpdmVDbGFzc0RlbGF5OiAwLFxuICAgICAgaW5hY3RpdmVDbGFzc0RlbGF5OiAwXG4gICAgfSxcbiAgICBzdXBwb3J0VG91Y2ggPSAnb250b3VjaGVuZCcgaW4gZG9jdW1lbnQsXG4gICAgZXZlbnRzID0ge1xuICAgICAgc3RhcnQ6IHN1cHBvcnRUb3VjaCA/ICd0b3VjaHN0YXJ0JyA6ICdtb3VzZWRvd24nLFxuICAgICAgbW92ZTogc3VwcG9ydFRvdWNoID8gJ3RvdWNobW92ZScgOiAnbW91c2Vtb3ZlJyxcbiAgICAgIGVuZDogc3VwcG9ydFRvdWNoID8gJ3RvdWNoZW5kJyA6ICdtb3VzZXVwJ1xuICAgIH0sXG4gICAgZ2V0VGFyZ2V0QnlDb29yZHMgPSBmdW5jdGlvbih4LCB5KXtcbiAgICAgIHZhciBlbCA9IGQuZWxlbWVudEZyb21Qb2ludCh4LCB5KTtcbiAgICAgIGlmIChlbC5ub2RlVHlwZSA9PSAzKSBlbCA9IGVsLnBhcmVudE5vZGU7XG4gICAgICByZXR1cm4gZWw7XG4gICAgfSxcbiAgICBnZXRUYXJnZXQgPSBmdW5jdGlvbihlKXtcbiAgICAgIHZhciBlbCA9IGUudGFyZ2V0O1xuICAgICAgaWYgKGVsKSB7XG4gICAgICAgIGlmIChlbC5ub2RlVHlwZSA9PSAzKSBlbCA9IGVsLnBhcmVudE5vZGU7XG4gICAgICAgIHJldHVybiBlbDtcbiAgICAgIH1cbiAgICAgIHZhciB0b3VjaCA9IGUudGFyZ2V0VG91Y2hlc1swXTtcbiAgICAgIHJldHVybiBnZXRUYXJnZXRCeUNvb3Jkcyh0b3VjaC5jbGllbnRYLCB0b3VjaC5jbGllbnRZKTtcbiAgICB9LFxuICAgIGNsZWFuID0gZnVuY3Rpb24oc3RyKXtcbiAgICAgIHJldHVybiBzdHIucmVwbGFjZSgvXFxzKy9nLCAnICcpLnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKTtcbiAgICB9LFxuICAgIGFkZENsYXNzID0gZnVuY3Rpb24oZWwsIGNsYXNzTmFtZSl7XG4gICAgICBpZiAoIWNsYXNzTmFtZSkgcmV0dXJuO1xuICAgICAgaWYgKGVsLmNsYXNzTGlzdCl7XG4gICAgICAgIGVsLmNsYXNzTGlzdC5hZGQoY2xhc3NOYW1lKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKGNsZWFuKGVsLmNsYXNzTmFtZSkuaW5kZXhPZihjbGFzc05hbWUpID4gLTEpIHJldHVybjtcbiAgICAgIGVsLmNsYXNzTmFtZSA9IGNsZWFuKGVsLmNsYXNzTmFtZSArICcgJyArIGNsYXNzTmFtZSk7XG4gICAgfSxcbiAgICByZW1vdmVDbGFzcyA9IGZ1bmN0aW9uKGVsLCBjbGFzc05hbWUpe1xuICAgICAgaWYgKCFjbGFzc05hbWUpIHJldHVybjtcbiAgICAgIGlmIChlbC5jbGFzc0xpc3Qpe1xuICAgICAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKGNsYXNzTmFtZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGVsLmNsYXNzTmFtZSA9IGVsLmNsYXNzTmFtZS5yZXBsYWNlKG5ldyBSZWdFeHAoJyhefFxcXFxzKScgKyBjbGFzc05hbWUgKyAnKD86XFxcXHN8JCknKSwgJyQxJyk7XG4gICAgfSxcbiAgICBtYXRjaGVzU2VsZWN0b3IgPSBmdW5jdGlvbihub2RlLCBzZWxlY3Rvcil7XG4gICAgICB2YXIgcm9vdCA9IGQuZG9jdW1lbnRFbGVtZW50LFxuICAgICAgICBtYXRjaGVzID0gcm9vdC5tYXRjaGVzU2VsZWN0b3IgfHwgcm9vdC5tb3pNYXRjaGVzU2VsZWN0b3IgfHwgcm9vdC53ZWJraXRNYXRjaGVzU2VsZWN0b3IgfHwgcm9vdC5vTWF0Y2hlc1NlbGVjdG9yIHx8IHJvb3QubXNNYXRjaGVzU2VsZWN0b3I7XG4gICAgICByZXR1cm4gbWF0Y2hlcy5jYWxsKG5vZGUsIHNlbGVjdG9yKTtcbiAgICB9LFxuICAgIGNsb3Nlc3QgPSBmdW5jdGlvbihub2RlLCBzZWxlY3Rvcil7XG4gICAgICB2YXIgbWF0Y2hlcyA9IGZhbHNlO1xuICAgICAgZG8ge1xuICAgICAgICBtYXRjaGVzID0gbWF0Y2hlc1NlbGVjdG9yKG5vZGUsIHNlbGVjdG9yKTtcbiAgICAgIH0gd2hpbGUgKCFtYXRjaGVzICYmIChub2RlID0gbm9kZS5wYXJlbnROb2RlKSAmJiBub2RlLm93bmVyRG9jdW1lbnQpO1xuICAgICAgcmV0dXJuIG1hdGNoZXMgPyBub2RlIDogZmFsc2U7XG4gICAgfTtcblxuICB3LnRhcHBhYmxlID0gZnVuY3Rpb24oc2VsZWN0b3IsIG9wdHMpe1xuICAgIGlmICh0eXBlb2Ygb3B0cyA9PSAnZnVuY3Rpb24nKSBvcHRzID0geyBvblRhcDogb3B0cyB9O1xuICAgIHZhciBvcHRpb25zID0ge307XG4gICAgZm9yICh2YXIga2V5IGluIGRlZmF1bHRzKSBvcHRpb25zW2tleV0gPSBvcHRzW2tleV0gfHwgZGVmYXVsdHNba2V5XTtcblxuICAgIHZhciBlbCA9IG9wdGlvbnMuY29udGFpbmVyRWxlbWVudCB8fCBkLmJvZHksXG4gICAgICBzdGFydFRhcmdldCxcbiAgICAgIHByZXZUYXJnZXQsXG4gICAgICBzdGFydFgsXG4gICAgICBzdGFydFksXG4gICAgICBlbEJvdW5kLFxuICAgICAgY2FuY2VsID0gZmFsc2UsXG4gICAgICBtb3ZlT3V0ID0gZmFsc2UsXG4gICAgICBhY3RpdmVDbGFzcyA9IG9wdGlvbnMuYWN0aXZlQ2xhc3MsXG4gICAgICBhY3RpdmVDbGFzc0RlbGF5ID0gb3B0aW9ucy5hY3RpdmVDbGFzc0RlbGF5LFxuICAgICAgYWN0aXZlQ2xhc3NUaW1lb3V0LFxuICAgICAgaW5hY3RpdmVDbGFzc0RlbGF5ID0gb3B0aW9ucy5pbmFjdGl2ZUNsYXNzRGVsYXksXG4gICAgICBpbmFjdGl2ZUNsYXNzVGltZW91dCxcbiAgICAgIG5vU2Nyb2xsID0gb3B0aW9ucy5ub1Njcm9sbCxcbiAgICAgIG5vU2Nyb2xsRGVsYXkgPSBvcHRpb25zLm5vU2Nyb2xsRGVsYXksXG4gICAgICBub1Njcm9sbFRpbWVvdXQsXG4gICAgICBib3VuZE1hcmdpbiA9IG9wdGlvbnMuYm91bmRNYXJnaW47XG5cbiAgICB2YXIgb25TdGFydCA9IGZ1bmN0aW9uKGUpe1xuICAgICAgdmFyIHRhcmdldCA9IGNsb3Nlc3QoZ2V0VGFyZ2V0KGUpLCBzZWxlY3Rvcik7XG4gICAgICBpZiAoIXRhcmdldCkgcmV0dXJuO1xuXG4gICAgICBpZiAoYWN0aXZlQ2xhc3NEZWxheSl7XG4gICAgICAgIGNsZWFyVGltZW91dChhY3RpdmVDbGFzc1RpbWVvdXQpO1xuICAgICAgICBhY3RpdmVDbGFzc1RpbWVvdXQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICAgICAgYWRkQ2xhc3ModGFyZ2V0LCBhY3RpdmVDbGFzcyk7XG4gICAgICAgIH0sIGFjdGl2ZUNsYXNzRGVsYXkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYWRkQ2xhc3ModGFyZ2V0LCBhY3RpdmVDbGFzcyk7XG4gICAgICB9XG4gICAgICBpZiAoaW5hY3RpdmVDbGFzc0RlbGF5ICYmIHRhcmdldCA9PSBwcmV2VGFyZ2V0KSBjbGVhclRpbWVvdXQoaW5hY3RpdmVDbGFzc1RpbWVvdXQpO1xuXG4gICAgICBzdGFydFggPSBlLmNsaWVudFg7XG4gICAgICBzdGFydFkgPSBlLmNsaWVudFk7XG4gICAgICBpZiAoIXN0YXJ0WCB8fCAhc3RhcnRZKXtcbiAgICAgICAgdmFyIHRvdWNoID0gZS50YXJnZXRUb3VjaGVzWzBdO1xuICAgICAgICBzdGFydFggPSB0b3VjaC5jbGllbnRYO1xuICAgICAgICBzdGFydFkgPSB0b3VjaC5jbGllbnRZO1xuICAgICAgfVxuICAgICAgc3RhcnRUYXJnZXQgPSB0YXJnZXQ7XG4gICAgICBjYW5jZWwgPSBmYWxzZTtcbiAgICAgIG1vdmVPdXQgPSBmYWxzZTtcbiAgICAgIGVsQm91bmQgPSBub1Njcm9sbCA/IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSA6IG51bGw7XG5cbiAgICAgIGlmIChub1Njcm9sbERlbGF5KXtcbiAgICAgICAgY2xlYXJUaW1lb3V0KG5vU2Nyb2xsVGltZW91dCk7XG4gICAgICAgIG5vU2Nyb2xsID0gZmFsc2U7IC8vIHNldCBmYWxzZSBmaXJzdCwgdGhlbiB0cnVlIGFmdGVyIGEgZGVsYXlcbiAgICAgICAgbm9TY3JvbGxUaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgICAgIG5vU2Nyb2xsID0gdHJ1ZTtcbiAgICAgICAgfSwgbm9TY3JvbGxEZWxheSk7XG4gICAgICB9XG4gICAgICBvcHRpb25zLm9uU3RhcnQuY2FsbChlbCwgZSwgdGFyZ2V0KTtcbiAgICB9O1xuXG4gICAgdmFyIG9uTW92ZSA9IGZ1bmN0aW9uKGUpe1xuICAgICAgaWYgKCFzdGFydFRhcmdldCkgcmV0dXJuO1xuXG4gICAgICBpZiAobm9TY3JvbGwpe1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjbGVhclRpbWVvdXQoYWN0aXZlQ2xhc3NUaW1lb3V0KTtcbiAgICAgIH1cblxuICAgICAgdmFyIHRhcmdldCA9IGUudGFyZ2V0LFxuICAgICAgICB4ID0gZS5jbGllbnRYLFxuICAgICAgICB5ID0gZS5jbGllbnRZO1xuICAgICAgaWYgKCF0YXJnZXQgfHwgIXggfHwgIXkpeyAvLyBUaGUgZXZlbnQgbWlnaHQgaGF2ZSBhIHRhcmdldCBidXQgbm8gY2xpZW50WC9ZXG4gICAgICAgIHZhciB0b3VjaCA9IGUuY2hhbmdlZFRvdWNoZXNbMF07XG4gICAgICAgIGlmICgheCkgeCA9IHRvdWNoLmNsaWVudFg7XG4gICAgICAgIGlmICgheSkgeSA9IHRvdWNoLmNsaWVudFk7XG4gICAgICAgIGlmICghdGFyZ2V0KSB0YXJnZXQgPSBnZXRUYXJnZXRCeUNvb3Jkcyh4LCB5KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG5vU2Nyb2xsKXtcbiAgICAgICAgaWYgKHg+ZWxCb3VuZC5sZWZ0LWJvdW5kTWFyZ2luICYmIHg8ZWxCb3VuZC5yaWdodCtib3VuZE1hcmdpbiAmJiB5PmVsQm91bmQudG9wLWJvdW5kTWFyZ2luICYmIHk8ZWxCb3VuZC5ib3R0b20rYm91bmRNYXJnaW4peyAvLyB3aXRoaW4gZWxlbWVudCdzIGJvdW5kYXJ5XG4gICAgICAgICAgbW92ZU91dCA9IGZhbHNlO1xuICAgICAgICAgIGFkZENsYXNzKHN0YXJ0VGFyZ2V0LCBhY3RpdmVDbGFzcyk7XG4gICAgICAgICAgb3B0aW9ucy5vbk1vdmVJbi5jYWxsKGVsLCBlLCB0YXJnZXQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG1vdmVPdXQgPSB0cnVlO1xuICAgICAgICAgIHJlbW92ZUNsYXNzKHN0YXJ0VGFyZ2V0LCBhY3RpdmVDbGFzcyk7XG4gICAgICAgICAgb3B0aW9ucy5vbk1vdmVPdXQuY2FsbChlbCwgZSwgdGFyZ2V0KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICghY2FuY2VsICYmIGFicyh5IC0gc3RhcnRZKSA+IDEwKXtcbiAgICAgICAgY2FuY2VsID0gdHJ1ZTtcbiAgICAgICAgcmVtb3ZlQ2xhc3Moc3RhcnRUYXJnZXQsIGFjdGl2ZUNsYXNzKTtcbiAgICAgICAgb3B0aW9ucy5vbkNhbmNlbC5jYWxsKHRhcmdldCwgZSk7XG4gICAgICB9XG5cbiAgICAgIG9wdGlvbnMub25Nb3ZlLmNhbGwoZWwsIGUsIHRhcmdldCk7XG4gICAgfTtcblxuICAgIHZhciBvbkVuZCA9IGZ1bmN0aW9uKGUpe1xuICAgICAgaWYgKCFzdGFydFRhcmdldCkgcmV0dXJuO1xuXG4gICAgICBjbGVhclRpbWVvdXQoYWN0aXZlQ2xhc3NUaW1lb3V0KTtcbiAgICAgIGlmIChpbmFjdGl2ZUNsYXNzRGVsYXkpe1xuICAgICAgICBpZiAoYWN0aXZlQ2xhc3NEZWxheSAmJiAhY2FuY2VsKSBhZGRDbGFzcyhzdGFydFRhcmdldCwgYWN0aXZlQ2xhc3MpO1xuICAgICAgICB2YXIgYWN0aXZlVGFyZ2V0ID0gc3RhcnRUYXJnZXQ7XG4gICAgICAgIGluYWN0aXZlQ2xhc3NUaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgICAgIHJlbW92ZUNsYXNzKGFjdGl2ZVRhcmdldCwgYWN0aXZlQ2xhc3MpO1xuICAgICAgICB9LCBpbmFjdGl2ZUNsYXNzRGVsYXkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVtb3ZlQ2xhc3Moc3RhcnRUYXJnZXQsIGFjdGl2ZUNsYXNzKTtcbiAgICAgIH1cblxuICAgICAgb3B0aW9ucy5vbkVuZC5jYWxsKGVsLCBlLCBzdGFydFRhcmdldCk7XG5cbiAgICAgIHZhciByaWdodENsaWNrID0gZS53aGljaCA9PSAzIHx8IGUuYnV0dG9uID09IDI7XG4gICAgICBpZiAoIWNhbmNlbCAmJiAhbW92ZU91dCAmJiAhcmlnaHRDbGljayl7XG4gICAgICAgIG9wdGlvbnMub25UYXAuY2FsbChlbCwgZSwgc3RhcnRUYXJnZXQpO1xuICAgICAgfVxuXG4gICAgICBwcmV2VGFyZ2V0ID0gc3RhcnRUYXJnZXQ7XG4gICAgICBzdGFydFRhcmdldCA9IG51bGw7XG4gICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICAgIHN0YXJ0WCA9IHN0YXJ0WSA9IG51bGw7XG4gICAgICB9LCA0MDApO1xuICAgIH07XG5cbiAgICB2YXIgb25DYW5jZWwgPSBmdW5jdGlvbihlKXtcbiAgICAgIGlmICghc3RhcnRUYXJnZXQpIHJldHVybjtcbiAgICAgIHJlbW92ZUNsYXNzKHN0YXJ0VGFyZ2V0LCBhY3RpdmVDbGFzcyk7XG4gICAgICBzdGFydFRhcmdldCA9IHN0YXJ0WCA9IHN0YXJ0WSA9IG51bGw7XG4gICAgICBvcHRpb25zLm9uQ2FuY2VsLmNhbGwoZWwsIGUpO1xuICAgIH07XG5cbiAgICB2YXIgb25DbGljayA9IGZ1bmN0aW9uKGUpe1xuICAgICAgdmFyIHRhcmdldCA9IGNsb3Nlc3QoZS50YXJnZXQsIHNlbGVjdG9yKTtcbiAgICAgIGlmICh0YXJnZXQpe1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB9IGVsc2UgaWYgKHN0YXJ0WCAmJiBzdGFydFkgJiYgYWJzKGUuY2xpZW50WCAtIHN0YXJ0WCkgPCAyNSAmJiBhYnMoZS5jbGllbnRZIC0gc3RhcnRZKSA8IDI1KXtcbiAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKGV2ZW50cy5zdGFydCwgb25TdGFydCwgZmFsc2UpO1xuXG4gICAgZWwuYWRkRXZlbnRMaXN0ZW5lcihldmVudHMubW92ZSwgb25Nb3ZlLCBmYWxzZSk7XG5cbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKGV2ZW50cy5lbmQsIG9uRW5kLCBmYWxzZSk7XG5cbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKCd0b3VjaGNhbmNlbCcsIG9uQ2FuY2VsLCBmYWxzZSk7XG5cbiAgICBpZiAoIW9wdGlvbnMuYWxsb3dDbGljaykgZWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBvbkNsaWNrLCBmYWxzZSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgZWwgOiBlbCxcbiAgICAgIGRlc3Ryb3kgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnRzLnN0YXJ0LCBvblN0YXJ0LCBmYWxzZSk7XG4gICAgICAgIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnRzLm1vdmUsIG9uTW92ZSwgZmFsc2UpO1xuICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50cy5lbmQsIG9uRW5kLCBmYWxzZSk7XG4gICAgICAgIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RvdWNoY2FuY2VsJywgb25DYW5jZWwsIGZhbHNlKTtcbiAgICAgICAgaWYgKCFvcHRpb25zLmFsbG93Q2xpY2spIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgb25DbGljaywgZmFsc2UpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuICAgIH07XG5cbiAgfTtcblxufSkpO1xufSkoKSIsInZhciByb3V0aWUgPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9yb3V0aWUnKTtcbnZhciBwbGF5ZXIgPSByZXF1aXJlKCcuLi9wbGF5ZXInKTtcbnZhciB2aWV3ID0gcmVxdWlyZSgnLi4vLi4vdmlld3MvcmVnaXN0ZXItYWR2YW5jZWQuaGJzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gIFxuICBpZiAocGxheWVyLmdldCgpLmlkKSB7XG4gICAgcmV0dXJuIHJvdXRpZS5uYXZpZ2F0ZSgnL3dhaXQnKTtcbiAgfVxuICBcbiAgJCgnI3BhZ2UnKS5hdHRyKCdjbGFzcycsICdyZWdpc3RlcicpO1xuICAkKCcjcGFnZScpLmh0bWwodmlldygpKTtcbiAgXG4gICQoJ2J1dHRvbicpLm9uKCdjbGljaycsIHJlZ2lzdGVyKTtcbiAgXG59O1xuXG5mdW5jdGlvbiByZWdpc3RlcihlKSB7XG4gIHZhciBkYXRhID0ge1xuICAgIGZpcnN0TmFtZTogICAgJCgnI2ZpcnN0TmFtZScpLnZhbCgpLFxuICAgIGxhc3ROYW1lOiAgICAgJCgnI2xhc3ROYW1lJykudmFsKCksXG4gICAgY29tcGFueTogICAgICAkKCcjY29tcGFueScpLnZhbCgpLFxuICAgIGNvdW50cnk6ICAgICAgJCgnI2NvdW50cnknKS52YWwoKSxcbiAgICByb2xlOiAgICAgICAgICQoJyNyb2xlJykudmFsKCksXG4gICAgZW1haWw6ICAgICAgICAkKCcjZW1haWwnKS52YWwoKVxuICB9O1xuICBjb25zb2xlLmxvZyhcIkZJRUxEU1wiLCBkYXRhKTtcbiAgJC5hamF4KHtcbiAgICB0eXBlOiAnUE9TVCcsXG4gICAgdXJsOiAnL3BsYXllcicsXG4gICAgZGF0YTogSlNPTi5zdHJpbmdpZnkoZGF0YSksXG4gICAgZGF0YVR5cGU6ICdqc29uJyxcbiAgICBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb247IGNoYXJzZXQ9dXRmLTgnXG4gIH0pLnRoZW4oZ28pLmZhaWwoZXJyb3IpO1xuICBcbiAgLy8gJC5wb3N0KCcvcGxheWVyJywgZGF0YSkudGhlbihnbykuZmFpbChlcnJvcik7XG4gIHJldHVybiBmYWxzZVxufVxuXG5mdW5jdGlvbiBnbyhkYXRhKSB7XG4gIHBsYXllci5zZXQoe1xuICAgIGlkOiBkYXRhLmlkLFxuICAgIG5hbWU6IGRhdGEubmFtZVxuICB9KTtcbiAgcm91dGllLm5hdmlnYXRlKCcvd2FpdCcpO1xufVxuXG5mdW5jdGlvbiBlcnJvcihyZXMpIHtcbiAgYWxlcnQoJ0Vycm9yOiAnICsgcmVzKTtcbn1cbiIsInZhciByb3V0aWUgPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9yb3V0aWUnKTtcbnZhciBwbGF5ZXIgPSByZXF1aXJlKCcuLi9wbGF5ZXInKTtcbnZhciB2aWV3ID0gcmVxdWlyZSgnLi4vLi4vdmlld3Mvam9pbi5oYnMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgXG4gIGlmIChwbGF5ZXIuZ2V0KCkuaWQgPT0gdW5kZWZpbmVkKSB7XG4gICAgcm91dGllLm5hdmlnYXRlKCcvY29ubmVjdCcpO1xuICB9XG4gIFxuICAkKCcjcGFnZScpLmF0dHIoJ2NsYXNzJywgJ2pvaW4nKTtcbiAgJCgnI3BhZ2UnKS5odG1sKHZpZXcoKSk7XG4gICQoJ2J1dHRvbicpLm9uKCdjbGljaycsIGpvaW5Mb2JieSk7XG5cbn07XG5cbmZ1bmN0aW9uIGpvaW5Mb2JieShlKSB7XG4gIGUucHJldmVudERlZmF1bHQoKTtcbiAgdmFyIGRhdGEgPSB7IHBsYXllcklkOiBwbGF5ZXIuZ2V0KCkuaWQgfTtcbiAgJC5wb3N0KCcvZ2FtZS9wbGF5ZXJzJywgZGF0YSkudGhlbihqb2luZWQpLmZhaWwoYmFja1RvV2FpdCk7XG59XG5cbmZ1bmN0aW9uIGpvaW5lZChkYXRhKSB7XG4gIHJvdXRpZS5uYXZpZ2F0ZSgnL2xvYmJ5Jyk7XG59XG5cbmZ1bmN0aW9uIGJhY2tUb1dhaXQoKSB7XG4gIHJvdXRpZS5uYXZpZ2F0ZSgnL3dhaXQnKTtcbn1cbiIsInZhciByb3V0aWUgPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9yb3V0aWUnKTtcbnZhciB2aWV3ID0gcmVxdWlyZSgnLi4vLi4vdmlld3MvdGhhbmtzLmhicycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICBcbiAgJCgnI3BhZ2UnKS5hdHRyKCdjbGFzcycsICd0aGFua3MnKTtcbiAgJCgnI3BhZ2UnKS5odG1sKHZpZXcoKSk7XG4gIFxuICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgIHJvdXRpZS5uYXZpZ2F0ZSgnL2Nvbm5lY3QnKTtcbiAgfSwgNDAwMCk7XG4gIFxufTtcbiIsInZhciBfID0gcmVxdWlyZSgndW5kZXJzY29yZScpO1xudmFyIHBsYXllciA9IG51bGw7XG5cbnZhciBLRVkgPSAncGxheWVyJztcblxuZXhwb3J0cy5nZXQgPSBmdW5jdGlvbigpIHtcbiAgaWYgKCFwbGF5ZXIpIHtcbiAgICBsb2FkKCk7XG4gIH1cbiAgcmV0dXJuIHBsYXllcjtcbn07XG5cbmV4cG9ydHMuc2V0ID0gZnVuY3Rpb24oYXR0cnMpIHtcbiAgcGxheWVyID0gXy5leHRlbmQocGxheWVyIHx8IHt9LCBhdHRycyk7XG4gIHNhdmUoKTtcbn07XG5cbmV4cG9ydHMucmVzZXQgPSBmdW5jdGlvbigpIHtcbiAgcGxheWVyID0gbnVsbDtcbiAgd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKEtFWSk7XG59O1xuXG5mdW5jdGlvbiBsb2FkKCkge1xuICBwbGF5ZXIgPSBKU09OLnBhcnNlKHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShLRVkpIHx8ICd7fScpO1xufVxuXG5mdW5jdGlvbiBzYXZlKCkge1xuICB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oS0VZLCBKU09OLnN0cmluZ2lmeShwbGF5ZXIpKTtcbn1cbiIsIihmdW5jdGlvbigpey8vICAgICBVbmRlcnNjb3JlLmpzIDEuNC40XG4vLyAgICAgaHR0cDovL3VuZGVyc2NvcmVqcy5vcmdcbi8vICAgICAoYykgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBJbmMuXG4vLyAgICAgVW5kZXJzY29yZSBtYXkgYmUgZnJlZWx5IGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBNSVQgbGljZW5zZS5cblxuKGZ1bmN0aW9uKCkge1xuXG4gIC8vIEJhc2VsaW5lIHNldHVwXG4gIC8vIC0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gRXN0YWJsaXNoIHRoZSByb290IG9iamVjdCwgYHdpbmRvd2AgaW4gdGhlIGJyb3dzZXIsIG9yIGBnbG9iYWxgIG9uIHRoZSBzZXJ2ZXIuXG4gIHZhciByb290ID0gdGhpcztcblxuICAvLyBTYXZlIHRoZSBwcmV2aW91cyB2YWx1ZSBvZiB0aGUgYF9gIHZhcmlhYmxlLlxuICB2YXIgcHJldmlvdXNVbmRlcnNjb3JlID0gcm9vdC5fO1xuXG4gIC8vIEVzdGFibGlzaCB0aGUgb2JqZWN0IHRoYXQgZ2V0cyByZXR1cm5lZCB0byBicmVhayBvdXQgb2YgYSBsb29wIGl0ZXJhdGlvbi5cbiAgdmFyIGJyZWFrZXIgPSB7fTtcblxuICAvLyBTYXZlIGJ5dGVzIGluIHRoZSBtaW5pZmllZCAoYnV0IG5vdCBnemlwcGVkKSB2ZXJzaW9uOlxuICB2YXIgQXJyYXlQcm90byA9IEFycmF5LnByb3RvdHlwZSwgT2JqUHJvdG8gPSBPYmplY3QucHJvdG90eXBlLCBGdW5jUHJvdG8gPSBGdW5jdGlvbi5wcm90b3R5cGU7XG5cbiAgLy8gQ3JlYXRlIHF1aWNrIHJlZmVyZW5jZSB2YXJpYWJsZXMgZm9yIHNwZWVkIGFjY2VzcyB0byBjb3JlIHByb3RvdHlwZXMuXG4gIHZhciBwdXNoICAgICAgICAgICAgID0gQXJyYXlQcm90by5wdXNoLFxuICAgICAgc2xpY2UgICAgICAgICAgICA9IEFycmF5UHJvdG8uc2xpY2UsXG4gICAgICBjb25jYXQgICAgICAgICAgID0gQXJyYXlQcm90by5jb25jYXQsXG4gICAgICB0b1N0cmluZyAgICAgICAgID0gT2JqUHJvdG8udG9TdHJpbmcsXG4gICAgICBoYXNPd25Qcm9wZXJ0eSAgID0gT2JqUHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbiAgLy8gQWxsICoqRUNNQVNjcmlwdCA1KiogbmF0aXZlIGZ1bmN0aW9uIGltcGxlbWVudGF0aW9ucyB0aGF0IHdlIGhvcGUgdG8gdXNlXG4gIC8vIGFyZSBkZWNsYXJlZCBoZXJlLlxuICB2YXJcbiAgICBuYXRpdmVGb3JFYWNoICAgICAgPSBBcnJheVByb3RvLmZvckVhY2gsXG4gICAgbmF0aXZlTWFwICAgICAgICAgID0gQXJyYXlQcm90by5tYXAsXG4gICAgbmF0aXZlUmVkdWNlICAgICAgID0gQXJyYXlQcm90by5yZWR1Y2UsXG4gICAgbmF0aXZlUmVkdWNlUmlnaHQgID0gQXJyYXlQcm90by5yZWR1Y2VSaWdodCxcbiAgICBuYXRpdmVGaWx0ZXIgICAgICAgPSBBcnJheVByb3RvLmZpbHRlcixcbiAgICBuYXRpdmVFdmVyeSAgICAgICAgPSBBcnJheVByb3RvLmV2ZXJ5LFxuICAgIG5hdGl2ZVNvbWUgICAgICAgICA9IEFycmF5UHJvdG8uc29tZSxcbiAgICBuYXRpdmVJbmRleE9mICAgICAgPSBBcnJheVByb3RvLmluZGV4T2YsXG4gICAgbmF0aXZlTGFzdEluZGV4T2YgID0gQXJyYXlQcm90by5sYXN0SW5kZXhPZixcbiAgICBuYXRpdmVJc0FycmF5ICAgICAgPSBBcnJheS5pc0FycmF5LFxuICAgIG5hdGl2ZUtleXMgICAgICAgICA9IE9iamVjdC5rZXlzLFxuICAgIG5hdGl2ZUJpbmQgICAgICAgICA9IEZ1bmNQcm90by5iaW5kO1xuXG4gIC8vIENyZWF0ZSBhIHNhZmUgcmVmZXJlbmNlIHRvIHRoZSBVbmRlcnNjb3JlIG9iamVjdCBmb3IgdXNlIGJlbG93LlxuICB2YXIgXyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmIChvYmogaW5zdGFuY2VvZiBfKSByZXR1cm4gb2JqO1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBfKSkgcmV0dXJuIG5ldyBfKG9iaik7XG4gICAgdGhpcy5fd3JhcHBlZCA9IG9iajtcbiAgfTtcblxuICAvLyBFeHBvcnQgdGhlIFVuZGVyc2NvcmUgb2JqZWN0IGZvciAqKk5vZGUuanMqKiwgd2l0aFxuICAvLyBiYWNrd2FyZHMtY29tcGF0aWJpbGl0eSBmb3IgdGhlIG9sZCBgcmVxdWlyZSgpYCBBUEkuIElmIHdlJ3JlIGluXG4gIC8vIHRoZSBicm93c2VyLCBhZGQgYF9gIGFzIGEgZ2xvYmFsIG9iamVjdCB2aWEgYSBzdHJpbmcgaWRlbnRpZmllcixcbiAgLy8gZm9yIENsb3N1cmUgQ29tcGlsZXIgXCJhZHZhbmNlZFwiIG1vZGUuXG4gIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgIGV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IF87XG4gICAgfVxuICAgIGV4cG9ydHMuXyA9IF87XG4gIH0gZWxzZSB7XG4gICAgcm9vdC5fID0gXztcbiAgfVxuXG4gIC8vIEN1cnJlbnQgdmVyc2lvbi5cbiAgXy5WRVJTSU9OID0gJzEuNC40JztcblxuICAvLyBDb2xsZWN0aW9uIEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIFRoZSBjb3JuZXJzdG9uZSwgYW4gYGVhY2hgIGltcGxlbWVudGF0aW9uLCBha2EgYGZvckVhY2hgLlxuICAvLyBIYW5kbGVzIG9iamVjdHMgd2l0aCB0aGUgYnVpbHQtaW4gYGZvckVhY2hgLCBhcnJheXMsIGFuZCByYXcgb2JqZWN0cy5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYGZvckVhY2hgIGlmIGF2YWlsYWJsZS5cbiAgdmFyIGVhY2ggPSBfLmVhY2ggPSBfLmZvckVhY2ggPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm47XG4gICAgaWYgKG5hdGl2ZUZvckVhY2ggJiYgb2JqLmZvckVhY2ggPT09IG5hdGl2ZUZvckVhY2gpIHtcbiAgICAgIG9iai5mb3JFYWNoKGl0ZXJhdG9yLCBjb250ZXh0KTtcbiAgICB9IGVsc2UgaWYgKG9iai5sZW5ndGggPT09ICtvYmoubGVuZ3RoKSB7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbCA9IG9iai5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgaWYgKGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgb2JqW2ldLCBpLCBvYmopID09PSBicmVha2VyKSByZXR1cm47XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgICAgaWYgKF8uaGFzKG9iaiwga2V5KSkge1xuICAgICAgICAgIGlmIChpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtrZXldLCBrZXksIG9iaikgPT09IGJyZWFrZXIpIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIHJlc3VsdHMgb2YgYXBwbHlpbmcgdGhlIGl0ZXJhdG9yIHRvIGVhY2ggZWxlbWVudC5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYG1hcGAgaWYgYXZhaWxhYmxlLlxuICBfLm1hcCA9IF8uY29sbGVjdCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHJlc3VsdHM7XG4gICAgaWYgKG5hdGl2ZU1hcCAmJiBvYmoubWFwID09PSBuYXRpdmVNYXApIHJldHVybiBvYmoubWFwKGl0ZXJhdG9yLCBjb250ZXh0KTtcbiAgICBlYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoXSA9IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfTtcblxuICB2YXIgcmVkdWNlRXJyb3IgPSAnUmVkdWNlIG9mIGVtcHR5IGFycmF5IHdpdGggbm8gaW5pdGlhbCB2YWx1ZSc7XG5cbiAgLy8gKipSZWR1Y2UqKiBidWlsZHMgdXAgYSBzaW5nbGUgcmVzdWx0IGZyb20gYSBsaXN0IG9mIHZhbHVlcywgYWthIGBpbmplY3RgLFxuICAvLyBvciBgZm9sZGxgLiBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgcmVkdWNlYCBpZiBhdmFpbGFibGUuXG4gIF8ucmVkdWNlID0gXy5mb2xkbCA9IF8uaW5qZWN0ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgbWVtbywgY29udGV4dCkge1xuICAgIHZhciBpbml0aWFsID0gYXJndW1lbnRzLmxlbmd0aCA+IDI7XG4gICAgaWYgKG9iaiA9PSBudWxsKSBvYmogPSBbXTtcbiAgICBpZiAobmF0aXZlUmVkdWNlICYmIG9iai5yZWR1Y2UgPT09IG5hdGl2ZVJlZHVjZSkge1xuICAgICAgaWYgKGNvbnRleHQpIGl0ZXJhdG9yID0gXy5iaW5kKGl0ZXJhdG9yLCBjb250ZXh0KTtcbiAgICAgIHJldHVybiBpbml0aWFsID8gb2JqLnJlZHVjZShpdGVyYXRvciwgbWVtbykgOiBvYmoucmVkdWNlKGl0ZXJhdG9yKTtcbiAgICB9XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgaWYgKCFpbml0aWFsKSB7XG4gICAgICAgIG1lbW8gPSB2YWx1ZTtcbiAgICAgICAgaW5pdGlhbCA9IHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtZW1vID0gaXRlcmF0b3IuY2FsbChjb250ZXh0LCBtZW1vLCB2YWx1ZSwgaW5kZXgsIGxpc3QpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGlmICghaW5pdGlhbCkgdGhyb3cgbmV3IFR5cGVFcnJvcihyZWR1Y2VFcnJvcik7XG4gICAgcmV0dXJuIG1lbW87XG4gIH07XG5cbiAgLy8gVGhlIHJpZ2h0LWFzc29jaWF0aXZlIHZlcnNpb24gb2YgcmVkdWNlLCBhbHNvIGtub3duIGFzIGBmb2xkcmAuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGByZWR1Y2VSaWdodGAgaWYgYXZhaWxhYmxlLlxuICBfLnJlZHVjZVJpZ2h0ID0gXy5mb2xkciA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIG1lbW8sIGNvbnRleHQpIHtcbiAgICB2YXIgaW5pdGlhbCA9IGFyZ3VtZW50cy5sZW5ndGggPiAyO1xuICAgIGlmIChvYmogPT0gbnVsbCkgb2JqID0gW107XG4gICAgaWYgKG5hdGl2ZVJlZHVjZVJpZ2h0ICYmIG9iai5yZWR1Y2VSaWdodCA9PT0gbmF0aXZlUmVkdWNlUmlnaHQpIHtcbiAgICAgIGlmIChjb250ZXh0KSBpdGVyYXRvciA9IF8uYmluZChpdGVyYXRvciwgY29udGV4dCk7XG4gICAgICByZXR1cm4gaW5pdGlhbCA/IG9iai5yZWR1Y2VSaWdodChpdGVyYXRvciwgbWVtbykgOiBvYmoucmVkdWNlUmlnaHQoaXRlcmF0b3IpO1xuICAgIH1cbiAgICB2YXIgbGVuZ3RoID0gb2JqLmxlbmd0aDtcbiAgICBpZiAobGVuZ3RoICE9PSArbGVuZ3RoKSB7XG4gICAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopO1xuICAgICAgbGVuZ3RoID0ga2V5cy5sZW5ndGg7XG4gICAgfVxuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIGluZGV4ID0ga2V5cyA/IGtleXNbLS1sZW5ndGhdIDogLS1sZW5ndGg7XG4gICAgICBpZiAoIWluaXRpYWwpIHtcbiAgICAgICAgbWVtbyA9IG9ialtpbmRleF07XG4gICAgICAgIGluaXRpYWwgPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWVtbyA9IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgbWVtbywgb2JqW2luZGV4XSwgaW5kZXgsIGxpc3QpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGlmICghaW5pdGlhbCkgdGhyb3cgbmV3IFR5cGVFcnJvcihyZWR1Y2VFcnJvcik7XG4gICAgcmV0dXJuIG1lbW87XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBmaXJzdCB2YWx1ZSB3aGljaCBwYXNzZXMgYSB0cnV0aCB0ZXN0LiBBbGlhc2VkIGFzIGBkZXRlY3RgLlxuICBfLmZpbmQgPSBfLmRldGVjdCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0O1xuICAgIGFueShvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgaWYgKGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KSkge1xuICAgICAgICByZXN1bHQgPSB2YWx1ZTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBSZXR1cm4gYWxsIHRoZSBlbGVtZW50cyB0aGF0IHBhc3MgYSB0cnV0aCB0ZXN0LlxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgZmlsdGVyYCBpZiBhdmFpbGFibGUuXG4gIC8vIEFsaWFzZWQgYXMgYHNlbGVjdGAuXG4gIF8uZmlsdGVyID0gXy5zZWxlY3QgPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiByZXN1bHRzO1xuICAgIGlmIChuYXRpdmVGaWx0ZXIgJiYgb2JqLmZpbHRlciA9PT0gbmF0aXZlRmlsdGVyKSByZXR1cm4gb2JqLmZpbHRlcihpdGVyYXRvciwgY29udGV4dCk7XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgaWYgKGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KSkgcmVzdWx0c1tyZXN1bHRzLmxlbmd0aF0gPSB2YWx1ZTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfTtcblxuICAvLyBSZXR1cm4gYWxsIHRoZSBlbGVtZW50cyBmb3Igd2hpY2ggYSB0cnV0aCB0ZXN0IGZhaWxzLlxuICBfLnJlamVjdCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICByZXR1cm4gXy5maWx0ZXIob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIHJldHVybiAhaXRlcmF0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpO1xuICAgIH0sIGNvbnRleHQpO1xuICB9O1xuXG4gIC8vIERldGVybWluZSB3aGV0aGVyIGFsbCBvZiB0aGUgZWxlbWVudHMgbWF0Y2ggYSB0cnV0aCB0ZXN0LlxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgZXZlcnlgIGlmIGF2YWlsYWJsZS5cbiAgLy8gQWxpYXNlZCBhcyBgYWxsYC5cbiAgXy5ldmVyeSA9IF8uYWxsID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGl0ZXJhdG9yIHx8IChpdGVyYXRvciA9IF8uaWRlbnRpdHkpO1xuICAgIHZhciByZXN1bHQgPSB0cnVlO1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAobmF0aXZlRXZlcnkgJiYgb2JqLmV2ZXJ5ID09PSBuYXRpdmVFdmVyeSkgcmV0dXJuIG9iai5ldmVyeShpdGVyYXRvciwgY29udGV4dCk7XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgaWYgKCEocmVzdWx0ID0gcmVzdWx0ICYmIGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KSkpIHJldHVybiBicmVha2VyO1xuICAgIH0pO1xuICAgIHJldHVybiAhIXJlc3VsdDtcbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgaWYgYXQgbGVhc3Qgb25lIGVsZW1lbnQgaW4gdGhlIG9iamVjdCBtYXRjaGVzIGEgdHJ1dGggdGVzdC5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYHNvbWVgIGlmIGF2YWlsYWJsZS5cbiAgLy8gQWxpYXNlZCBhcyBgYW55YC5cbiAgdmFyIGFueSA9IF8uc29tZSA9IF8uYW55ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGl0ZXJhdG9yIHx8IChpdGVyYXRvciA9IF8uaWRlbnRpdHkpO1xuICAgIHZhciByZXN1bHQgPSBmYWxzZTtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKG5hdGl2ZVNvbWUgJiYgb2JqLnNvbWUgPT09IG5hdGl2ZVNvbWUpIHJldHVybiBvYmouc29tZShpdGVyYXRvciwgY29udGV4dCk7XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgaWYgKHJlc3VsdCB8fCAocmVzdWx0ID0gaXRlcmF0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpKSkgcmV0dXJuIGJyZWFrZXI7XG4gICAgfSk7XG4gICAgcmV0dXJuICEhcmVzdWx0O1xuICB9O1xuXG4gIC8vIERldGVybWluZSBpZiB0aGUgYXJyYXkgb3Igb2JqZWN0IGNvbnRhaW5zIGEgZ2l2ZW4gdmFsdWUgKHVzaW5nIGA9PT1gKS5cbiAgLy8gQWxpYXNlZCBhcyBgaW5jbHVkZWAuXG4gIF8uY29udGFpbnMgPSBfLmluY2x1ZGUgPSBmdW5jdGlvbihvYmosIHRhcmdldCkge1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuICAgIGlmIChuYXRpdmVJbmRleE9mICYmIG9iai5pbmRleE9mID09PSBuYXRpdmVJbmRleE9mKSByZXR1cm4gb2JqLmluZGV4T2YodGFyZ2V0KSAhPSAtMTtcbiAgICByZXR1cm4gYW55KG9iaiwgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIHJldHVybiB2YWx1ZSA9PT0gdGFyZ2V0O1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIEludm9rZSBhIG1ldGhvZCAod2l0aCBhcmd1bWVudHMpIG9uIGV2ZXJ5IGl0ZW0gaW4gYSBjb2xsZWN0aW9uLlxuICBfLmludm9rZSA9IGZ1bmN0aW9uKG9iaiwgbWV0aG9kKSB7XG4gICAgdmFyIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG4gICAgdmFyIGlzRnVuYyA9IF8uaXNGdW5jdGlvbihtZXRob2QpO1xuICAgIHJldHVybiBfLm1hcChvYmosIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICByZXR1cm4gKGlzRnVuYyA/IG1ldGhvZCA6IHZhbHVlW21ldGhvZF0pLmFwcGx5KHZhbHVlLCBhcmdzKTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBDb252ZW5pZW5jZSB2ZXJzaW9uIG9mIGEgY29tbW9uIHVzZSBjYXNlIG9mIGBtYXBgOiBmZXRjaGluZyBhIHByb3BlcnR5LlxuICBfLnBsdWNrID0gZnVuY3Rpb24ob2JqLCBrZXkpIHtcbiAgICByZXR1cm4gXy5tYXAob2JqLCBmdW5jdGlvbih2YWx1ZSl7IHJldHVybiB2YWx1ZVtrZXldOyB9KTtcbiAgfTtcblxuICAvLyBDb252ZW5pZW5jZSB2ZXJzaW9uIG9mIGEgY29tbW9uIHVzZSBjYXNlIG9mIGBmaWx0ZXJgOiBzZWxlY3Rpbmcgb25seSBvYmplY3RzXG4gIC8vIGNvbnRhaW5pbmcgc3BlY2lmaWMgYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8ud2hlcmUgPSBmdW5jdGlvbihvYmosIGF0dHJzLCBmaXJzdCkge1xuICAgIGlmIChfLmlzRW1wdHkoYXR0cnMpKSByZXR1cm4gZmlyc3QgPyBudWxsIDogW107XG4gICAgcmV0dXJuIF9bZmlyc3QgPyAnZmluZCcgOiAnZmlsdGVyJ10ob2JqLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgZm9yICh2YXIga2V5IGluIGF0dHJzKSB7XG4gICAgICAgIGlmIChhdHRyc1trZXldICE9PSB2YWx1ZVtrZXldKSByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBDb252ZW5pZW5jZSB2ZXJzaW9uIG9mIGEgY29tbW9uIHVzZSBjYXNlIG9mIGBmaW5kYDogZ2V0dGluZyB0aGUgZmlyc3Qgb2JqZWN0XG4gIC8vIGNvbnRhaW5pbmcgc3BlY2lmaWMgYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8uZmluZFdoZXJlID0gZnVuY3Rpb24ob2JqLCBhdHRycykge1xuICAgIHJldHVybiBfLndoZXJlKG9iaiwgYXR0cnMsIHRydWUpO1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgbWF4aW11bSBlbGVtZW50IG9yIChlbGVtZW50LWJhc2VkIGNvbXB1dGF0aW9uKS5cbiAgLy8gQ2FuJ3Qgb3B0aW1pemUgYXJyYXlzIG9mIGludGVnZXJzIGxvbmdlciB0aGFuIDY1LDUzNSBlbGVtZW50cy5cbiAgLy8gU2VlOiBodHRwczovL2J1Z3Mud2Via2l0Lm9yZy9zaG93X2J1Zy5jZ2k/aWQ9ODA3OTdcbiAgXy5tYXggPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaWYgKCFpdGVyYXRvciAmJiBfLmlzQXJyYXkob2JqKSAmJiBvYmpbMF0gPT09ICtvYmpbMF0gJiYgb2JqLmxlbmd0aCA8IDY1NTM1KSB7XG4gICAgICByZXR1cm4gTWF0aC5tYXguYXBwbHkoTWF0aCwgb2JqKTtcbiAgICB9XG4gICAgaWYgKCFpdGVyYXRvciAmJiBfLmlzRW1wdHkob2JqKSkgcmV0dXJuIC1JbmZpbml0eTtcbiAgICB2YXIgcmVzdWx0ID0ge2NvbXB1dGVkIDogLUluZmluaXR5LCB2YWx1ZTogLUluZmluaXR5fTtcbiAgICBlYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICB2YXIgY29tcHV0ZWQgPSBpdGVyYXRvciA/IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KSA6IHZhbHVlO1xuICAgICAgY29tcHV0ZWQgPj0gcmVzdWx0LmNvbXB1dGVkICYmIChyZXN1bHQgPSB7dmFsdWUgOiB2YWx1ZSwgY29tcHV0ZWQgOiBjb21wdXRlZH0pO1xuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHQudmFsdWU7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBtaW5pbXVtIGVsZW1lbnQgKG9yIGVsZW1lbnQtYmFzZWQgY29tcHV0YXRpb24pLlxuICBfLm1pbiA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBpZiAoIWl0ZXJhdG9yICYmIF8uaXNBcnJheShvYmopICYmIG9ialswXSA9PT0gK29ialswXSAmJiBvYmoubGVuZ3RoIDwgNjU1MzUpIHtcbiAgICAgIHJldHVybiBNYXRoLm1pbi5hcHBseShNYXRoLCBvYmopO1xuICAgIH1cbiAgICBpZiAoIWl0ZXJhdG9yICYmIF8uaXNFbXB0eShvYmopKSByZXR1cm4gSW5maW5pdHk7XG4gICAgdmFyIHJlc3VsdCA9IHtjb21wdXRlZCA6IEluZmluaXR5LCB2YWx1ZTogSW5maW5pdHl9O1xuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIHZhciBjb21wdXRlZCA9IGl0ZXJhdG9yID8gaXRlcmF0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpIDogdmFsdWU7XG4gICAgICBjb21wdXRlZCA8IHJlc3VsdC5jb21wdXRlZCAmJiAocmVzdWx0ID0ge3ZhbHVlIDogdmFsdWUsIGNvbXB1dGVkIDogY29tcHV0ZWR9KTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0LnZhbHVlO1xuICB9O1xuXG4gIC8vIFNodWZmbGUgYW4gYXJyYXkuXG4gIF8uc2h1ZmZsZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciByYW5kO1xuICAgIHZhciBpbmRleCA9IDA7XG4gICAgdmFyIHNodWZmbGVkID0gW107XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICByYW5kID0gXy5yYW5kb20oaW5kZXgrKyk7XG4gICAgICBzaHVmZmxlZFtpbmRleCAtIDFdID0gc2h1ZmZsZWRbcmFuZF07XG4gICAgICBzaHVmZmxlZFtyYW5kXSA9IHZhbHVlO1xuICAgIH0pO1xuICAgIHJldHVybiBzaHVmZmxlZDtcbiAgfTtcblxuICAvLyBBbiBpbnRlcm5hbCBmdW5jdGlvbiB0byBnZW5lcmF0ZSBsb29rdXAgaXRlcmF0b3JzLlxuICB2YXIgbG9va3VwSXRlcmF0b3IgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHJldHVybiBfLmlzRnVuY3Rpb24odmFsdWUpID8gdmFsdWUgOiBmdW5jdGlvbihvYmopeyByZXR1cm4gb2JqW3ZhbHVlXTsgfTtcbiAgfTtcblxuICAvLyBTb3J0IHRoZSBvYmplY3QncyB2YWx1ZXMgYnkgYSBjcml0ZXJpb24gcHJvZHVjZWQgYnkgYW4gaXRlcmF0b3IuXG4gIF8uc29ydEJ5ID0gZnVuY3Rpb24ob2JqLCB2YWx1ZSwgY29udGV4dCkge1xuICAgIHZhciBpdGVyYXRvciA9IGxvb2t1cEl0ZXJhdG9yKHZhbHVlKTtcbiAgICByZXR1cm4gXy5wbHVjayhfLm1hcChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdmFsdWUgOiB2YWx1ZSxcbiAgICAgICAgaW5kZXggOiBpbmRleCxcbiAgICAgICAgY3JpdGVyaWEgOiBpdGVyYXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgbGlzdClcbiAgICAgIH07XG4gICAgfSkuc29ydChmdW5jdGlvbihsZWZ0LCByaWdodCkge1xuICAgICAgdmFyIGEgPSBsZWZ0LmNyaXRlcmlhO1xuICAgICAgdmFyIGIgPSByaWdodC5jcml0ZXJpYTtcbiAgICAgIGlmIChhICE9PSBiKSB7XG4gICAgICAgIGlmIChhID4gYiB8fCBhID09PSB2b2lkIDApIHJldHVybiAxO1xuICAgICAgICBpZiAoYSA8IGIgfHwgYiA9PT0gdm9pZCAwKSByZXR1cm4gLTE7XG4gICAgICB9XG4gICAgICByZXR1cm4gbGVmdC5pbmRleCA8IHJpZ2h0LmluZGV4ID8gLTEgOiAxO1xuICAgIH0pLCAndmFsdWUnKTtcbiAgfTtcblxuICAvLyBBbiBpbnRlcm5hbCBmdW5jdGlvbiB1c2VkIGZvciBhZ2dyZWdhdGUgXCJncm91cCBieVwiIG9wZXJhdGlvbnMuXG4gIHZhciBncm91cCA9IGZ1bmN0aW9uKG9iaiwgdmFsdWUsIGNvbnRleHQsIGJlaGF2aW9yKSB7XG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIHZhciBpdGVyYXRvciA9IGxvb2t1cEl0ZXJhdG9yKHZhbHVlIHx8IF8uaWRlbnRpdHkpO1xuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgpIHtcbiAgICAgIHZhciBrZXkgPSBpdGVyYXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgb2JqKTtcbiAgICAgIGJlaGF2aW9yKHJlc3VsdCwga2V5LCB2YWx1ZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBHcm91cHMgdGhlIG9iamVjdCdzIHZhbHVlcyBieSBhIGNyaXRlcmlvbi4gUGFzcyBlaXRoZXIgYSBzdHJpbmcgYXR0cmlidXRlXG4gIC8vIHRvIGdyb3VwIGJ5LCBvciBhIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGUgY3JpdGVyaW9uLlxuICBfLmdyb3VwQnkgPSBmdW5jdGlvbihvYmosIHZhbHVlLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuIGdyb3VwKG9iaiwgdmFsdWUsIGNvbnRleHQsIGZ1bmN0aW9uKHJlc3VsdCwga2V5LCB2YWx1ZSkge1xuICAgICAgKF8uaGFzKHJlc3VsdCwga2V5KSA/IHJlc3VsdFtrZXldIDogKHJlc3VsdFtrZXldID0gW10pKS5wdXNoKHZhbHVlKTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBDb3VudHMgaW5zdGFuY2VzIG9mIGFuIG9iamVjdCB0aGF0IGdyb3VwIGJ5IGEgY2VydGFpbiBjcml0ZXJpb24uIFBhc3NcbiAgLy8gZWl0aGVyIGEgc3RyaW5nIGF0dHJpYnV0ZSB0byBjb3VudCBieSwgb3IgYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlXG4gIC8vIGNyaXRlcmlvbi5cbiAgXy5jb3VudEJ5ID0gZnVuY3Rpb24ob2JqLCB2YWx1ZSwgY29udGV4dCkge1xuICAgIHJldHVybiBncm91cChvYmosIHZhbHVlLCBjb250ZXh0LCBmdW5jdGlvbihyZXN1bHQsIGtleSkge1xuICAgICAgaWYgKCFfLmhhcyhyZXN1bHQsIGtleSkpIHJlc3VsdFtrZXldID0gMDtcbiAgICAgIHJlc3VsdFtrZXldKys7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gVXNlIGEgY29tcGFyYXRvciBmdW5jdGlvbiB0byBmaWd1cmUgb3V0IHRoZSBzbWFsbGVzdCBpbmRleCBhdCB3aGljaFxuICAvLyBhbiBvYmplY3Qgc2hvdWxkIGJlIGluc2VydGVkIHNvIGFzIHRvIG1haW50YWluIG9yZGVyLiBVc2VzIGJpbmFyeSBzZWFyY2guXG4gIF8uc29ydGVkSW5kZXggPSBmdW5jdGlvbihhcnJheSwgb2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGl0ZXJhdG9yID0gaXRlcmF0b3IgPT0gbnVsbCA/IF8uaWRlbnRpdHkgOiBsb29rdXBJdGVyYXRvcihpdGVyYXRvcik7XG4gICAgdmFyIHZhbHVlID0gaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmopO1xuICAgIHZhciBsb3cgPSAwLCBoaWdoID0gYXJyYXkubGVuZ3RoO1xuICAgIHdoaWxlIChsb3cgPCBoaWdoKSB7XG4gICAgICB2YXIgbWlkID0gKGxvdyArIGhpZ2gpID4+PiAxO1xuICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBhcnJheVttaWRdKSA8IHZhbHVlID8gbG93ID0gbWlkICsgMSA6IGhpZ2ggPSBtaWQ7XG4gICAgfVxuICAgIHJldHVybiBsb3c7XG4gIH07XG5cbiAgLy8gU2FmZWx5IGNvbnZlcnQgYW55dGhpbmcgaXRlcmFibGUgaW50byBhIHJlYWwsIGxpdmUgYXJyYXkuXG4gIF8udG9BcnJheSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmICghb2JqKSByZXR1cm4gW107XG4gICAgaWYgKF8uaXNBcnJheShvYmopKSByZXR1cm4gc2xpY2UuY2FsbChvYmopO1xuICAgIGlmIChvYmoubGVuZ3RoID09PSArb2JqLmxlbmd0aCkgcmV0dXJuIF8ubWFwKG9iaiwgXy5pZGVudGl0eSk7XG4gICAgcmV0dXJuIF8udmFsdWVzKG9iaik7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBudW1iZXIgb2YgZWxlbWVudHMgaW4gYW4gb2JqZWN0LlxuICBfLnNpemUgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiAwO1xuICAgIHJldHVybiAob2JqLmxlbmd0aCA9PT0gK29iai5sZW5ndGgpID8gb2JqLmxlbmd0aCA6IF8ua2V5cyhvYmopLmxlbmd0aDtcbiAgfTtcblxuICAvLyBBcnJheSBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gR2V0IHRoZSBmaXJzdCBlbGVtZW50IG9mIGFuIGFycmF5LiBQYXNzaW5nICoqbioqIHdpbGwgcmV0dXJuIHRoZSBmaXJzdCBOXG4gIC8vIHZhbHVlcyBpbiB0aGUgYXJyYXkuIEFsaWFzZWQgYXMgYGhlYWRgIGFuZCBgdGFrZWAuIFRoZSAqKmd1YXJkKiogY2hlY2tcbiAgLy8gYWxsb3dzIGl0IHRvIHdvcmsgd2l0aCBgXy5tYXBgLlxuICBfLmZpcnN0ID0gXy5oZWFkID0gXy50YWtlID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgaWYgKGFycmF5ID09IG51bGwpIHJldHVybiB2b2lkIDA7XG4gICAgcmV0dXJuIChuICE9IG51bGwpICYmICFndWFyZCA/IHNsaWNlLmNhbGwoYXJyYXksIDAsIG4pIDogYXJyYXlbMF07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBldmVyeXRoaW5nIGJ1dCB0aGUgbGFzdCBlbnRyeSBvZiB0aGUgYXJyYXkuIEVzcGVjaWFsbHkgdXNlZnVsIG9uXG4gIC8vIHRoZSBhcmd1bWVudHMgb2JqZWN0LiBQYXNzaW5nICoqbioqIHdpbGwgcmV0dXJuIGFsbCB0aGUgdmFsdWVzIGluXG4gIC8vIHRoZSBhcnJheSwgZXhjbHVkaW5nIHRoZSBsYXN0IE4uIFRoZSAqKmd1YXJkKiogY2hlY2sgYWxsb3dzIGl0IHRvIHdvcmsgd2l0aFxuICAvLyBgXy5tYXBgLlxuICBfLmluaXRpYWwgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICByZXR1cm4gc2xpY2UuY2FsbChhcnJheSwgMCwgYXJyYXkubGVuZ3RoIC0gKChuID09IG51bGwpIHx8IGd1YXJkID8gMSA6IG4pKTtcbiAgfTtcblxuICAvLyBHZXQgdGhlIGxhc3QgZWxlbWVudCBvZiBhbiBhcnJheS4gUGFzc2luZyAqKm4qKiB3aWxsIHJldHVybiB0aGUgbGFzdCBOXG4gIC8vIHZhbHVlcyBpbiB0aGUgYXJyYXkuIFRoZSAqKmd1YXJkKiogY2hlY2sgYWxsb3dzIGl0IHRvIHdvcmsgd2l0aCBgXy5tYXBgLlxuICBfLmxhc3QgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICBpZiAoYXJyYXkgPT0gbnVsbCkgcmV0dXJuIHZvaWQgMDtcbiAgICBpZiAoKG4gIT0gbnVsbCkgJiYgIWd1YXJkKSB7XG4gICAgICByZXR1cm4gc2xpY2UuY2FsbChhcnJheSwgTWF0aC5tYXgoYXJyYXkubGVuZ3RoIC0gbiwgMCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gYXJyYXlbYXJyYXkubGVuZ3RoIC0gMV07XG4gICAgfVxuICB9O1xuXG4gIC8vIFJldHVybnMgZXZlcnl0aGluZyBidXQgdGhlIGZpcnN0IGVudHJ5IG9mIHRoZSBhcnJheS4gQWxpYXNlZCBhcyBgdGFpbGAgYW5kIGBkcm9wYC5cbiAgLy8gRXNwZWNpYWxseSB1c2VmdWwgb24gdGhlIGFyZ3VtZW50cyBvYmplY3QuIFBhc3NpbmcgYW4gKipuKiogd2lsbCByZXR1cm5cbiAgLy8gdGhlIHJlc3QgTiB2YWx1ZXMgaW4gdGhlIGFycmF5LiBUaGUgKipndWFyZCoqXG4gIC8vIGNoZWNrIGFsbG93cyBpdCB0byB3b3JrIHdpdGggYF8ubWFwYC5cbiAgXy5yZXN0ID0gXy50YWlsID0gXy5kcm9wID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgcmV0dXJuIHNsaWNlLmNhbGwoYXJyYXksIChuID09IG51bGwpIHx8IGd1YXJkID8gMSA6IG4pO1xuICB9O1xuXG4gIC8vIFRyaW0gb3V0IGFsbCBmYWxzeSB2YWx1ZXMgZnJvbSBhbiBhcnJheS5cbiAgXy5jb21wYWN0ID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICByZXR1cm4gXy5maWx0ZXIoYXJyYXksIF8uaWRlbnRpdHkpO1xuICB9O1xuXG4gIC8vIEludGVybmFsIGltcGxlbWVudGF0aW9uIG9mIGEgcmVjdXJzaXZlIGBmbGF0dGVuYCBmdW5jdGlvbi5cbiAgdmFyIGZsYXR0ZW4gPSBmdW5jdGlvbihpbnB1dCwgc2hhbGxvdywgb3V0cHV0KSB7XG4gICAgZWFjaChpbnB1dCwgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIGlmIChfLmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgIHNoYWxsb3cgPyBwdXNoLmFwcGx5KG91dHB1dCwgdmFsdWUpIDogZmxhdHRlbih2YWx1ZSwgc2hhbGxvdywgb3V0cHV0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5wdXNoKHZhbHVlKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gb3V0cHV0O1xuICB9O1xuXG4gIC8vIFJldHVybiBhIGNvbXBsZXRlbHkgZmxhdHRlbmVkIHZlcnNpb24gb2YgYW4gYXJyYXkuXG4gIF8uZmxhdHRlbiA9IGZ1bmN0aW9uKGFycmF5LCBzaGFsbG93KSB7XG4gICAgcmV0dXJuIGZsYXR0ZW4oYXJyYXksIHNoYWxsb3csIFtdKTtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSB2ZXJzaW9uIG9mIHRoZSBhcnJheSB0aGF0IGRvZXMgbm90IGNvbnRhaW4gdGhlIHNwZWNpZmllZCB2YWx1ZShzKS5cbiAgXy53aXRob3V0ID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICByZXR1cm4gXy5kaWZmZXJlbmNlKGFycmF5LCBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICB9O1xuXG4gIC8vIFByb2R1Y2UgYSBkdXBsaWNhdGUtZnJlZSB2ZXJzaW9uIG9mIHRoZSBhcnJheS4gSWYgdGhlIGFycmF5IGhhcyBhbHJlYWR5XG4gIC8vIGJlZW4gc29ydGVkLCB5b3UgaGF2ZSB0aGUgb3B0aW9uIG9mIHVzaW5nIGEgZmFzdGVyIGFsZ29yaXRobS5cbiAgLy8gQWxpYXNlZCBhcyBgdW5pcXVlYC5cbiAgXy51bmlxID0gXy51bmlxdWUgPSBmdW5jdGlvbihhcnJheSwgaXNTb3J0ZWQsIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaWYgKF8uaXNGdW5jdGlvbihpc1NvcnRlZCkpIHtcbiAgICAgIGNvbnRleHQgPSBpdGVyYXRvcjtcbiAgICAgIGl0ZXJhdG9yID0gaXNTb3J0ZWQ7XG4gICAgICBpc1NvcnRlZCA9IGZhbHNlO1xuICAgIH1cbiAgICB2YXIgaW5pdGlhbCA9IGl0ZXJhdG9yID8gXy5tYXAoYXJyYXksIGl0ZXJhdG9yLCBjb250ZXh0KSA6IGFycmF5O1xuICAgIHZhciByZXN1bHRzID0gW107XG4gICAgdmFyIHNlZW4gPSBbXTtcbiAgICBlYWNoKGluaXRpYWwsIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCkge1xuICAgICAgaWYgKGlzU29ydGVkID8gKCFpbmRleCB8fCBzZWVuW3NlZW4ubGVuZ3RoIC0gMV0gIT09IHZhbHVlKSA6ICFfLmNvbnRhaW5zKHNlZW4sIHZhbHVlKSkge1xuICAgICAgICBzZWVuLnB1c2godmFsdWUpO1xuICAgICAgICByZXN1bHRzLnB1c2goYXJyYXlbaW5kZXhdKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfTtcblxuICAvLyBQcm9kdWNlIGFuIGFycmF5IHRoYXQgY29udGFpbnMgdGhlIHVuaW9uOiBlYWNoIGRpc3RpbmN0IGVsZW1lbnQgZnJvbSBhbGwgb2ZcbiAgLy8gdGhlIHBhc3NlZC1pbiBhcnJheXMuXG4gIF8udW5pb24gPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gXy51bmlxKGNvbmNhdC5hcHBseShBcnJheVByb3RvLCBhcmd1bWVudHMpKTtcbiAgfTtcblxuICAvLyBQcm9kdWNlIGFuIGFycmF5IHRoYXQgY29udGFpbnMgZXZlcnkgaXRlbSBzaGFyZWQgYmV0d2VlbiBhbGwgdGhlXG4gIC8vIHBhc3NlZC1pbiBhcnJheXMuXG4gIF8uaW50ZXJzZWN0aW9uID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICB2YXIgcmVzdCA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICByZXR1cm4gXy5maWx0ZXIoXy51bmlxKGFycmF5KSwgZnVuY3Rpb24oaXRlbSkge1xuICAgICAgcmV0dXJuIF8uZXZlcnkocmVzdCwgZnVuY3Rpb24ob3RoZXIpIHtcbiAgICAgICAgcmV0dXJuIF8uaW5kZXhPZihvdGhlciwgaXRlbSkgPj0gMDtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIFRha2UgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiBvbmUgYXJyYXkgYW5kIGEgbnVtYmVyIG9mIG90aGVyIGFycmF5cy5cbiAgLy8gT25seSB0aGUgZWxlbWVudHMgcHJlc2VudCBpbiBqdXN0IHRoZSBmaXJzdCBhcnJheSB3aWxsIHJlbWFpbi5cbiAgXy5kaWZmZXJlbmNlID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICB2YXIgcmVzdCA9IGNvbmNhdC5hcHBseShBcnJheVByb3RvLCBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICAgIHJldHVybiBfLmZpbHRlcihhcnJheSwgZnVuY3Rpb24odmFsdWUpeyByZXR1cm4gIV8uY29udGFpbnMocmVzdCwgdmFsdWUpOyB9KTtcbiAgfTtcblxuICAvLyBaaXAgdG9nZXRoZXIgbXVsdGlwbGUgbGlzdHMgaW50byBhIHNpbmdsZSBhcnJheSAtLSBlbGVtZW50cyB0aGF0IHNoYXJlXG4gIC8vIGFuIGluZGV4IGdvIHRvZ2V0aGVyLlxuICBfLnppcCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgIHZhciBsZW5ndGggPSBfLm1heChfLnBsdWNrKGFyZ3MsICdsZW5ndGgnKSk7XG4gICAgdmFyIHJlc3VsdHMgPSBuZXcgQXJyYXkobGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICByZXN1bHRzW2ldID0gXy5wbHVjayhhcmdzLCBcIlwiICsgaSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xuICB9O1xuXG4gIC8vIENvbnZlcnRzIGxpc3RzIGludG8gb2JqZWN0cy4gUGFzcyBlaXRoZXIgYSBzaW5nbGUgYXJyYXkgb2YgYFtrZXksIHZhbHVlXWBcbiAgLy8gcGFpcnMsIG9yIHR3byBwYXJhbGxlbCBhcnJheXMgb2YgdGhlIHNhbWUgbGVuZ3RoIC0tIG9uZSBvZiBrZXlzLCBhbmQgb25lIG9mXG4gIC8vIHRoZSBjb3JyZXNwb25kaW5nIHZhbHVlcy5cbiAgXy5vYmplY3QgPSBmdW5jdGlvbihsaXN0LCB2YWx1ZXMpIHtcbiAgICBpZiAobGlzdCA9PSBudWxsKSByZXR1cm4ge307XG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIGZvciAodmFyIGkgPSAwLCBsID0gbGlzdC5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIGlmICh2YWx1ZXMpIHtcbiAgICAgICAgcmVzdWx0W2xpc3RbaV1dID0gdmFsdWVzW2ldO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0W2xpc3RbaV1bMF1dID0gbGlzdFtpXVsxXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBJZiB0aGUgYnJvd3NlciBkb2Vzbid0IHN1cHBseSB1cyB3aXRoIGluZGV4T2YgKEknbSBsb29raW5nIGF0IHlvdSwgKipNU0lFKiopLFxuICAvLyB3ZSBuZWVkIHRoaXMgZnVuY3Rpb24uIFJldHVybiB0aGUgcG9zaXRpb24gb2YgdGhlIGZpcnN0IG9jY3VycmVuY2Ugb2YgYW5cbiAgLy8gaXRlbSBpbiBhbiBhcnJheSwgb3IgLTEgaWYgdGhlIGl0ZW0gaXMgbm90IGluY2x1ZGVkIGluIHRoZSBhcnJheS5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYGluZGV4T2ZgIGlmIGF2YWlsYWJsZS5cbiAgLy8gSWYgdGhlIGFycmF5IGlzIGxhcmdlIGFuZCBhbHJlYWR5IGluIHNvcnQgb3JkZXIsIHBhc3MgYHRydWVgXG4gIC8vIGZvciAqKmlzU29ydGVkKiogdG8gdXNlIGJpbmFyeSBzZWFyY2guXG4gIF8uaW5kZXhPZiA9IGZ1bmN0aW9uKGFycmF5LCBpdGVtLCBpc1NvcnRlZCkge1xuICAgIGlmIChhcnJheSA9PSBudWxsKSByZXR1cm4gLTE7XG4gICAgdmFyIGkgPSAwLCBsID0gYXJyYXkubGVuZ3RoO1xuICAgIGlmIChpc1NvcnRlZCkge1xuICAgICAgaWYgKHR5cGVvZiBpc1NvcnRlZCA9PSAnbnVtYmVyJykge1xuICAgICAgICBpID0gKGlzU29ydGVkIDwgMCA/IE1hdGgubWF4KDAsIGwgKyBpc1NvcnRlZCkgOiBpc1NvcnRlZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpID0gXy5zb3J0ZWRJbmRleChhcnJheSwgaXRlbSk7XG4gICAgICAgIHJldHVybiBhcnJheVtpXSA9PT0gaXRlbSA/IGkgOiAtMTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKG5hdGl2ZUluZGV4T2YgJiYgYXJyYXkuaW5kZXhPZiA9PT0gbmF0aXZlSW5kZXhPZikgcmV0dXJuIGFycmF5LmluZGV4T2YoaXRlbSwgaXNTb3J0ZWQpO1xuICAgIGZvciAoOyBpIDwgbDsgaSsrKSBpZiAoYXJyYXlbaV0gPT09IGl0ZW0pIHJldHVybiBpO1xuICAgIHJldHVybiAtMTtcbiAgfTtcblxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgbGFzdEluZGV4T2ZgIGlmIGF2YWlsYWJsZS5cbiAgXy5sYXN0SW5kZXhPZiA9IGZ1bmN0aW9uKGFycmF5LCBpdGVtLCBmcm9tKSB7XG4gICAgaWYgKGFycmF5ID09IG51bGwpIHJldHVybiAtMTtcbiAgICB2YXIgaGFzSW5kZXggPSBmcm9tICE9IG51bGw7XG4gICAgaWYgKG5hdGl2ZUxhc3RJbmRleE9mICYmIGFycmF5Lmxhc3RJbmRleE9mID09PSBuYXRpdmVMYXN0SW5kZXhPZikge1xuICAgICAgcmV0dXJuIGhhc0luZGV4ID8gYXJyYXkubGFzdEluZGV4T2YoaXRlbSwgZnJvbSkgOiBhcnJheS5sYXN0SW5kZXhPZihpdGVtKTtcbiAgICB9XG4gICAgdmFyIGkgPSAoaGFzSW5kZXggPyBmcm9tIDogYXJyYXkubGVuZ3RoKTtcbiAgICB3aGlsZSAoaS0tKSBpZiAoYXJyYXlbaV0gPT09IGl0ZW0pIHJldHVybiBpO1xuICAgIHJldHVybiAtMTtcbiAgfTtcblxuICAvLyBHZW5lcmF0ZSBhbiBpbnRlZ2VyIEFycmF5IGNvbnRhaW5pbmcgYW4gYXJpdGhtZXRpYyBwcm9ncmVzc2lvbi4gQSBwb3J0IG9mXG4gIC8vIHRoZSBuYXRpdmUgUHl0aG9uIGByYW5nZSgpYCBmdW5jdGlvbi4gU2VlXG4gIC8vIFt0aGUgUHl0aG9uIGRvY3VtZW50YXRpb25dKGh0dHA6Ly9kb2NzLnB5dGhvbi5vcmcvbGlicmFyeS9mdW5jdGlvbnMuaHRtbCNyYW5nZSkuXG4gIF8ucmFuZ2UgPSBmdW5jdGlvbihzdGFydCwgc3RvcCwgc3RlcCkge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHN0b3AgPSBzdGFydCB8fCAwO1xuICAgICAgc3RhcnQgPSAwO1xuICAgIH1cbiAgICBzdGVwID0gYXJndW1lbnRzWzJdIHx8IDE7XG5cbiAgICB2YXIgbGVuID0gTWF0aC5tYXgoTWF0aC5jZWlsKChzdG9wIC0gc3RhcnQpIC8gc3RlcCksIDApO1xuICAgIHZhciBpZHggPSAwO1xuICAgIHZhciByYW5nZSA9IG5ldyBBcnJheShsZW4pO1xuXG4gICAgd2hpbGUoaWR4IDwgbGVuKSB7XG4gICAgICByYW5nZVtpZHgrK10gPSBzdGFydDtcbiAgICAgIHN0YXJ0ICs9IHN0ZXA7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJhbmdlO1xuICB9O1xuXG4gIC8vIEZ1bmN0aW9uIChhaGVtKSBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gQ3JlYXRlIGEgZnVuY3Rpb24gYm91bmQgdG8gYSBnaXZlbiBvYmplY3QgKGFzc2lnbmluZyBgdGhpc2AsIGFuZCBhcmd1bWVudHMsXG4gIC8vIG9wdGlvbmFsbHkpLiBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgRnVuY3Rpb24uYmluZGAgaWZcbiAgLy8gYXZhaWxhYmxlLlxuICBfLmJpbmQgPSBmdW5jdGlvbihmdW5jLCBjb250ZXh0KSB7XG4gICAgaWYgKGZ1bmMuYmluZCA9PT0gbmF0aXZlQmluZCAmJiBuYXRpdmVCaW5kKSByZXR1cm4gbmF0aXZlQmluZC5hcHBseShmdW5jLCBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MuY29uY2F0KHNsaWNlLmNhbGwoYXJndW1lbnRzKSkpO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUGFydGlhbGx5IGFwcGx5IGEgZnVuY3Rpb24gYnkgY3JlYXRpbmcgYSB2ZXJzaW9uIHRoYXQgaGFzIGhhZCBzb21lIG9mIGl0c1xuICAvLyBhcmd1bWVudHMgcHJlLWZpbGxlZCwgd2l0aG91dCBjaGFuZ2luZyBpdHMgZHluYW1pYyBgdGhpc2AgY29udGV4dC5cbiAgXy5wYXJ0aWFsID0gZnVuY3Rpb24oZnVuYykge1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBmdW5jLmFwcGx5KHRoaXMsIGFyZ3MuY29uY2F0KHNsaWNlLmNhbGwoYXJndW1lbnRzKSkpO1xuICAgIH07XG4gIH07XG5cbiAgLy8gQmluZCBhbGwgb2YgYW4gb2JqZWN0J3MgbWV0aG9kcyB0byB0aGF0IG9iamVjdC4gVXNlZnVsIGZvciBlbnN1cmluZyB0aGF0XG4gIC8vIGFsbCBjYWxsYmFja3MgZGVmaW5lZCBvbiBhbiBvYmplY3QgYmVsb25nIHRvIGl0LlxuICBfLmJpbmRBbGwgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgZnVuY3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgaWYgKGZ1bmNzLmxlbmd0aCA9PT0gMCkgZnVuY3MgPSBfLmZ1bmN0aW9ucyhvYmopO1xuICAgIGVhY2goZnVuY3MsIGZ1bmN0aW9uKGYpIHsgb2JqW2ZdID0gXy5iaW5kKG9ialtmXSwgb2JqKTsgfSk7XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBNZW1vaXplIGFuIGV4cGVuc2l2ZSBmdW5jdGlvbiBieSBzdG9yaW5nIGl0cyByZXN1bHRzLlxuICBfLm1lbW9pemUgPSBmdW5jdGlvbihmdW5jLCBoYXNoZXIpIHtcbiAgICB2YXIgbWVtbyA9IHt9O1xuICAgIGhhc2hlciB8fCAoaGFzaGVyID0gXy5pZGVudGl0eSk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGtleSA9IGhhc2hlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgcmV0dXJuIF8uaGFzKG1lbW8sIGtleSkgPyBtZW1vW2tleV0gOiAobWVtb1trZXldID0gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpKTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIERlbGF5cyBhIGZ1bmN0aW9uIGZvciB0aGUgZ2l2ZW4gbnVtYmVyIG9mIG1pbGxpc2Vjb25kcywgYW5kIHRoZW4gY2FsbHNcbiAgLy8gaXQgd2l0aCB0aGUgYXJndW1lbnRzIHN1cHBsaWVkLlxuICBfLmRlbGF5ID0gZnVuY3Rpb24oZnVuYywgd2FpdCkge1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7IHJldHVybiBmdW5jLmFwcGx5KG51bGwsIGFyZ3MpOyB9LCB3YWl0KTtcbiAgfTtcblxuICAvLyBEZWZlcnMgYSBmdW5jdGlvbiwgc2NoZWR1bGluZyBpdCB0byBydW4gYWZ0ZXIgdGhlIGN1cnJlbnQgY2FsbCBzdGFjayBoYXNcbiAgLy8gY2xlYXJlZC5cbiAgXy5kZWZlciA9IGZ1bmN0aW9uKGZ1bmMpIHtcbiAgICByZXR1cm4gXy5kZWxheS5hcHBseShfLCBbZnVuYywgMV0uY29uY2F0KHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSkpO1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiwgdGhhdCwgd2hlbiBpbnZva2VkLCB3aWxsIG9ubHkgYmUgdHJpZ2dlcmVkIGF0IG1vc3Qgb25jZVxuICAvLyBkdXJpbmcgYSBnaXZlbiB3aW5kb3cgb2YgdGltZS5cbiAgXy50aHJvdHRsZSA9IGZ1bmN0aW9uKGZ1bmMsIHdhaXQpIHtcbiAgICB2YXIgY29udGV4dCwgYXJncywgdGltZW91dCwgcmVzdWx0O1xuICAgIHZhciBwcmV2aW91cyA9IDA7XG4gICAgdmFyIGxhdGVyID0gZnVuY3Rpb24oKSB7XG4gICAgICBwcmV2aW91cyA9IG5ldyBEYXRlO1xuICAgICAgdGltZW91dCA9IG51bGw7XG4gICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgIH07XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIG5vdyA9IG5ldyBEYXRlO1xuICAgICAgdmFyIHJlbWFpbmluZyA9IHdhaXQgLSAobm93IC0gcHJldmlvdXMpO1xuICAgICAgY29udGV4dCA9IHRoaXM7XG4gICAgICBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgaWYgKHJlbWFpbmluZyA8PSAwKSB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgdGltZW91dCA9IG51bGw7XG4gICAgICAgIHByZXZpb3VzID0gbm93O1xuICAgICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgICAgfSBlbHNlIGlmICghdGltZW91dCkge1xuICAgICAgICB0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgcmVtYWluaW5nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24sIHRoYXQsIGFzIGxvbmcgYXMgaXQgY29udGludWVzIHRvIGJlIGludm9rZWQsIHdpbGwgbm90XG4gIC8vIGJlIHRyaWdnZXJlZC4gVGhlIGZ1bmN0aW9uIHdpbGwgYmUgY2FsbGVkIGFmdGVyIGl0IHN0b3BzIGJlaW5nIGNhbGxlZCBmb3JcbiAgLy8gTiBtaWxsaXNlY29uZHMuIElmIGBpbW1lZGlhdGVgIGlzIHBhc3NlZCwgdHJpZ2dlciB0aGUgZnVuY3Rpb24gb24gdGhlXG4gIC8vIGxlYWRpbmcgZWRnZSwgaW5zdGVhZCBvZiB0aGUgdHJhaWxpbmcuXG4gIF8uZGVib3VuY2UgPSBmdW5jdGlvbihmdW5jLCB3YWl0LCBpbW1lZGlhdGUpIHtcbiAgICB2YXIgdGltZW91dCwgcmVzdWx0O1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBjb250ZXh0ID0gdGhpcywgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIHZhciBsYXRlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB0aW1lb3V0ID0gbnVsbDtcbiAgICAgICAgaWYgKCFpbW1lZGlhdGUpIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICB9O1xuICAgICAgdmFyIGNhbGxOb3cgPSBpbW1lZGlhdGUgJiYgIXRpbWVvdXQ7XG4gICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICB0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgd2FpdCk7XG4gICAgICBpZiAoY2FsbE5vdykgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGV4ZWN1dGVkIGF0IG1vc3Qgb25lIHRpbWUsIG5vIG1hdHRlciBob3dcbiAgLy8gb2Z0ZW4geW91IGNhbGwgaXQuIFVzZWZ1bCBmb3IgbGF6eSBpbml0aWFsaXphdGlvbi5cbiAgXy5vbmNlID0gZnVuY3Rpb24oZnVuYykge1xuICAgIHZhciByYW4gPSBmYWxzZSwgbWVtbztcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAocmFuKSByZXR1cm4gbWVtbztcbiAgICAgIHJhbiA9IHRydWU7XG4gICAgICBtZW1vID0gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgZnVuYyA9IG51bGw7XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgdGhlIGZpcnN0IGZ1bmN0aW9uIHBhc3NlZCBhcyBhbiBhcmd1bWVudCB0byB0aGUgc2Vjb25kLFxuICAvLyBhbGxvd2luZyB5b3UgdG8gYWRqdXN0IGFyZ3VtZW50cywgcnVuIGNvZGUgYmVmb3JlIGFuZCBhZnRlciwgYW5kXG4gIC8vIGNvbmRpdGlvbmFsbHkgZXhlY3V0ZSB0aGUgb3JpZ2luYWwgZnVuY3Rpb24uXG4gIF8ud3JhcCA9IGZ1bmN0aW9uKGZ1bmMsIHdyYXBwZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgYXJncyA9IFtmdW5jXTtcbiAgICAgIHB1c2guYXBwbHkoYXJncywgYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiB3cmFwcGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgaXMgdGhlIGNvbXBvc2l0aW9uIG9mIGEgbGlzdCBvZiBmdW5jdGlvbnMsIGVhY2hcbiAgLy8gY29uc3VtaW5nIHRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIGZ1bmN0aW9uIHRoYXQgZm9sbG93cy5cbiAgXy5jb21wb3NlID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGZ1bmNzID0gYXJndW1lbnRzO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgZm9yICh2YXIgaSA9IGZ1bmNzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIGFyZ3MgPSBbZnVuY3NbaV0uYXBwbHkodGhpcywgYXJncyldO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGFyZ3NbMF07XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCB3aWxsIG9ubHkgYmUgZXhlY3V0ZWQgYWZ0ZXIgYmVpbmcgY2FsbGVkIE4gdGltZXMuXG4gIF8uYWZ0ZXIgPSBmdW5jdGlvbih0aW1lcywgZnVuYykge1xuICAgIGlmICh0aW1lcyA8PSAwKSByZXR1cm4gZnVuYygpO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIGlmICgtLXRpbWVzIDwgMSkge1xuICAgICAgICByZXR1cm4gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgfVxuICAgIH07XG4gIH07XG5cbiAgLy8gT2JqZWN0IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gUmV0cmlldmUgdGhlIG5hbWVzIG9mIGFuIG9iamVjdCdzIHByb3BlcnRpZXMuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBPYmplY3Qua2V5c2BcbiAgXy5rZXlzID0gbmF0aXZlS2V5cyB8fCBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqICE9PSBPYmplY3Qob2JqKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignSW52YWxpZCBvYmplY3QnKTtcbiAgICB2YXIga2V5cyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIGlmIChfLmhhcyhvYmosIGtleSkpIGtleXNba2V5cy5sZW5ndGhdID0ga2V5O1xuICAgIHJldHVybiBrZXlzO1xuICB9O1xuXG4gIC8vIFJldHJpZXZlIHRoZSB2YWx1ZXMgb2YgYW4gb2JqZWN0J3MgcHJvcGVydGllcy5cbiAgXy52YWx1ZXMgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgdmFsdWVzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikgaWYgKF8uaGFzKG9iaiwga2V5KSkgdmFsdWVzLnB1c2gob2JqW2tleV0pO1xuICAgIHJldHVybiB2YWx1ZXM7XG4gIH07XG5cbiAgLy8gQ29udmVydCBhbiBvYmplY3QgaW50byBhIGxpc3Qgb2YgYFtrZXksIHZhbHVlXWAgcGFpcnMuXG4gIF8ucGFpcnMgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgcGFpcnMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSBpZiAoXy5oYXMob2JqLCBrZXkpKSBwYWlycy5wdXNoKFtrZXksIG9ialtrZXldXSk7XG4gICAgcmV0dXJuIHBhaXJzO1xuICB9O1xuXG4gIC8vIEludmVydCB0aGUga2V5cyBhbmQgdmFsdWVzIG9mIGFuIG9iamVjdC4gVGhlIHZhbHVlcyBtdXN0IGJlIHNlcmlhbGl6YWJsZS5cbiAgXy5pbnZlcnQgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikgaWYgKF8uaGFzKG9iaiwga2V5KSkgcmVzdWx0W29ialtrZXldXSA9IGtleTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFJldHVybiBhIHNvcnRlZCBsaXN0IG9mIHRoZSBmdW5jdGlvbiBuYW1lcyBhdmFpbGFibGUgb24gdGhlIG9iamVjdC5cbiAgLy8gQWxpYXNlZCBhcyBgbWV0aG9kc2BcbiAgXy5mdW5jdGlvbnMgPSBfLm1ldGhvZHMgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgbmFtZXMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoXy5pc0Z1bmN0aW9uKG9ialtrZXldKSkgbmFtZXMucHVzaChrZXkpO1xuICAgIH1cbiAgICByZXR1cm4gbmFtZXMuc29ydCgpO1xuICB9O1xuXG4gIC8vIEV4dGVuZCBhIGdpdmVuIG9iamVjdCB3aXRoIGFsbCB0aGUgcHJvcGVydGllcyBpbiBwYXNzZWQtaW4gb2JqZWN0KHMpLlxuICBfLmV4dGVuZCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGVhY2goc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpLCBmdW5jdGlvbihzb3VyY2UpIHtcbiAgICAgIGlmIChzb3VyY2UpIHtcbiAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBzb3VyY2UpIHtcbiAgICAgICAgICBvYmpbcHJvcF0gPSBzb3VyY2VbcHJvcF07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gb2JqO1xuICB9O1xuXG4gIC8vIFJldHVybiBhIGNvcHkgb2YgdGhlIG9iamVjdCBvbmx5IGNvbnRhaW5pbmcgdGhlIHdoaXRlbGlzdGVkIHByb3BlcnRpZXMuXG4gIF8ucGljayA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBjb3B5ID0ge307XG4gICAgdmFyIGtleXMgPSBjb25jYXQuYXBwbHkoQXJyYXlQcm90bywgc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcbiAgICBlYWNoKGtleXMsIGZ1bmN0aW9uKGtleSkge1xuICAgICAgaWYgKGtleSBpbiBvYmopIGNvcHlba2V5XSA9IG9ialtrZXldO1xuICAgIH0pO1xuICAgIHJldHVybiBjb3B5O1xuICB9O1xuXG4gICAvLyBSZXR1cm4gYSBjb3B5IG9mIHRoZSBvYmplY3Qgd2l0aG91dCB0aGUgYmxhY2tsaXN0ZWQgcHJvcGVydGllcy5cbiAgXy5vbWl0ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGNvcHkgPSB7fTtcbiAgICB2YXIga2V5cyA9IGNvbmNhdC5hcHBseShBcnJheVByb3RvLCBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgIGlmICghXy5jb250YWlucyhrZXlzLCBrZXkpKSBjb3B5W2tleV0gPSBvYmpba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGNvcHk7XG4gIH07XG5cbiAgLy8gRmlsbCBpbiBhIGdpdmVuIG9iamVjdCB3aXRoIGRlZmF1bHQgcHJvcGVydGllcy5cbiAgXy5kZWZhdWx0cyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGVhY2goc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpLCBmdW5jdGlvbihzb3VyY2UpIHtcbiAgICAgIGlmIChzb3VyY2UpIHtcbiAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBzb3VyY2UpIHtcbiAgICAgICAgICBpZiAob2JqW3Byb3BdID09IG51bGwpIG9ialtwcm9wXSA9IHNvdXJjZVtwcm9wXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gQ3JlYXRlIGEgKHNoYWxsb3ctY2xvbmVkKSBkdXBsaWNhdGUgb2YgYW4gb2JqZWN0LlxuICBfLmNsb25lID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KG9iaikpIHJldHVybiBvYmo7XG4gICAgcmV0dXJuIF8uaXNBcnJheShvYmopID8gb2JqLnNsaWNlKCkgOiBfLmV4dGVuZCh7fSwgb2JqKTtcbiAgfTtcblxuICAvLyBJbnZva2VzIGludGVyY2VwdG9yIHdpdGggdGhlIG9iaiwgYW5kIHRoZW4gcmV0dXJucyBvYmouXG4gIC8vIFRoZSBwcmltYXJ5IHB1cnBvc2Ugb2YgdGhpcyBtZXRob2QgaXMgdG8gXCJ0YXAgaW50b1wiIGEgbWV0aG9kIGNoYWluLCBpblxuICAvLyBvcmRlciB0byBwZXJmb3JtIG9wZXJhdGlvbnMgb24gaW50ZXJtZWRpYXRlIHJlc3VsdHMgd2l0aGluIHRoZSBjaGFpbi5cbiAgXy50YXAgPSBmdW5jdGlvbihvYmosIGludGVyY2VwdG9yKSB7XG4gICAgaW50ZXJjZXB0b3Iob2JqKTtcbiAgICByZXR1cm4gb2JqO1xuICB9O1xuXG4gIC8vIEludGVybmFsIHJlY3Vyc2l2ZSBjb21wYXJpc29uIGZ1bmN0aW9uIGZvciBgaXNFcXVhbGAuXG4gIHZhciBlcSA9IGZ1bmN0aW9uKGEsIGIsIGFTdGFjaywgYlN0YWNrKSB7XG4gICAgLy8gSWRlbnRpY2FsIG9iamVjdHMgYXJlIGVxdWFsLiBgMCA9PT0gLTBgLCBidXQgdGhleSBhcmVuJ3QgaWRlbnRpY2FsLlxuICAgIC8vIFNlZSB0aGUgSGFybW9ueSBgZWdhbGAgcHJvcG9zYWw6IGh0dHA6Ly93aWtpLmVjbWFzY3JpcHQub3JnL2Rva3UucGhwP2lkPWhhcm1vbnk6ZWdhbC5cbiAgICBpZiAoYSA9PT0gYikgcmV0dXJuIGEgIT09IDAgfHwgMSAvIGEgPT0gMSAvIGI7XG4gICAgLy8gQSBzdHJpY3QgY29tcGFyaXNvbiBpcyBuZWNlc3NhcnkgYmVjYXVzZSBgbnVsbCA9PSB1bmRlZmluZWRgLlxuICAgIGlmIChhID09IG51bGwgfHwgYiA9PSBudWxsKSByZXR1cm4gYSA9PT0gYjtcbiAgICAvLyBVbndyYXAgYW55IHdyYXBwZWQgb2JqZWN0cy5cbiAgICBpZiAoYSBpbnN0YW5jZW9mIF8pIGEgPSBhLl93cmFwcGVkO1xuICAgIGlmIChiIGluc3RhbmNlb2YgXykgYiA9IGIuX3dyYXBwZWQ7XG4gICAgLy8gQ29tcGFyZSBgW1tDbGFzc11dYCBuYW1lcy5cbiAgICB2YXIgY2xhc3NOYW1lID0gdG9TdHJpbmcuY2FsbChhKTtcbiAgICBpZiAoY2xhc3NOYW1lICE9IHRvU3RyaW5nLmNhbGwoYikpIHJldHVybiBmYWxzZTtcbiAgICBzd2l0Y2ggKGNsYXNzTmFtZSkge1xuICAgICAgLy8gU3RyaW5ncywgbnVtYmVycywgZGF0ZXMsIGFuZCBib29sZWFucyBhcmUgY29tcGFyZWQgYnkgdmFsdWUuXG4gICAgICBjYXNlICdbb2JqZWN0IFN0cmluZ10nOlxuICAgICAgICAvLyBQcmltaXRpdmVzIGFuZCB0aGVpciBjb3JyZXNwb25kaW5nIG9iamVjdCB3cmFwcGVycyBhcmUgZXF1aXZhbGVudDsgdGh1cywgYFwiNVwiYCBpc1xuICAgICAgICAvLyBlcXVpdmFsZW50IHRvIGBuZXcgU3RyaW5nKFwiNVwiKWAuXG4gICAgICAgIHJldHVybiBhID09IFN0cmluZyhiKTtcbiAgICAgIGNhc2UgJ1tvYmplY3QgTnVtYmVyXSc6XG4gICAgICAgIC8vIGBOYU5gcyBhcmUgZXF1aXZhbGVudCwgYnV0IG5vbi1yZWZsZXhpdmUuIEFuIGBlZ2FsYCBjb21wYXJpc29uIGlzIHBlcmZvcm1lZCBmb3JcbiAgICAgICAgLy8gb3RoZXIgbnVtZXJpYyB2YWx1ZXMuXG4gICAgICAgIHJldHVybiBhICE9ICthID8gYiAhPSArYiA6IChhID09IDAgPyAxIC8gYSA9PSAxIC8gYiA6IGEgPT0gK2IpO1xuICAgICAgY2FzZSAnW29iamVjdCBEYXRlXSc6XG4gICAgICBjYXNlICdbb2JqZWN0IEJvb2xlYW5dJzpcbiAgICAgICAgLy8gQ29lcmNlIGRhdGVzIGFuZCBib29sZWFucyB0byBudW1lcmljIHByaW1pdGl2ZSB2YWx1ZXMuIERhdGVzIGFyZSBjb21wYXJlZCBieSB0aGVpclxuICAgICAgICAvLyBtaWxsaXNlY29uZCByZXByZXNlbnRhdGlvbnMuIE5vdGUgdGhhdCBpbnZhbGlkIGRhdGVzIHdpdGggbWlsbGlzZWNvbmQgcmVwcmVzZW50YXRpb25zXG4gICAgICAgIC8vIG9mIGBOYU5gIGFyZSBub3QgZXF1aXZhbGVudC5cbiAgICAgICAgcmV0dXJuICthID09ICtiO1xuICAgICAgLy8gUmVnRXhwcyBhcmUgY29tcGFyZWQgYnkgdGhlaXIgc291cmNlIHBhdHRlcm5zIGFuZCBmbGFncy5cbiAgICAgIGNhc2UgJ1tvYmplY3QgUmVnRXhwXSc6XG4gICAgICAgIHJldHVybiBhLnNvdXJjZSA9PSBiLnNvdXJjZSAmJlxuICAgICAgICAgICAgICAgYS5nbG9iYWwgPT0gYi5nbG9iYWwgJiZcbiAgICAgICAgICAgICAgIGEubXVsdGlsaW5lID09IGIubXVsdGlsaW5lICYmXG4gICAgICAgICAgICAgICBhLmlnbm9yZUNhc2UgPT0gYi5pZ25vcmVDYXNlO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGEgIT0gJ29iamVjdCcgfHwgdHlwZW9mIGIgIT0gJ29iamVjdCcpIHJldHVybiBmYWxzZTtcbiAgICAvLyBBc3N1bWUgZXF1YWxpdHkgZm9yIGN5Y2xpYyBzdHJ1Y3R1cmVzLiBUaGUgYWxnb3JpdGhtIGZvciBkZXRlY3RpbmcgY3ljbGljXG4gICAgLy8gc3RydWN0dXJlcyBpcyBhZGFwdGVkIGZyb20gRVMgNS4xIHNlY3Rpb24gMTUuMTIuMywgYWJzdHJhY3Qgb3BlcmF0aW9uIGBKT2AuXG4gICAgdmFyIGxlbmd0aCA9IGFTdGFjay5sZW5ndGg7XG4gICAgd2hpbGUgKGxlbmd0aC0tKSB7XG4gICAgICAvLyBMaW5lYXIgc2VhcmNoLiBQZXJmb3JtYW5jZSBpcyBpbnZlcnNlbHkgcHJvcG9ydGlvbmFsIHRvIHRoZSBudW1iZXIgb2ZcbiAgICAgIC8vIHVuaXF1ZSBuZXN0ZWQgc3RydWN0dXJlcy5cbiAgICAgIGlmIChhU3RhY2tbbGVuZ3RoXSA9PSBhKSByZXR1cm4gYlN0YWNrW2xlbmd0aF0gPT0gYjtcbiAgICB9XG4gICAgLy8gQWRkIHRoZSBmaXJzdCBvYmplY3QgdG8gdGhlIHN0YWNrIG9mIHRyYXZlcnNlZCBvYmplY3RzLlxuICAgIGFTdGFjay5wdXNoKGEpO1xuICAgIGJTdGFjay5wdXNoKGIpO1xuICAgIHZhciBzaXplID0gMCwgcmVzdWx0ID0gdHJ1ZTtcbiAgICAvLyBSZWN1cnNpdmVseSBjb21wYXJlIG9iamVjdHMgYW5kIGFycmF5cy5cbiAgICBpZiAoY2xhc3NOYW1lID09ICdbb2JqZWN0IEFycmF5XScpIHtcbiAgICAgIC8vIENvbXBhcmUgYXJyYXkgbGVuZ3RocyB0byBkZXRlcm1pbmUgaWYgYSBkZWVwIGNvbXBhcmlzb24gaXMgbmVjZXNzYXJ5LlxuICAgICAgc2l6ZSA9IGEubGVuZ3RoO1xuICAgICAgcmVzdWx0ID0gc2l6ZSA9PSBiLmxlbmd0aDtcbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgLy8gRGVlcCBjb21wYXJlIHRoZSBjb250ZW50cywgaWdub3Jpbmcgbm9uLW51bWVyaWMgcHJvcGVydGllcy5cbiAgICAgICAgd2hpbGUgKHNpemUtLSkge1xuICAgICAgICAgIGlmICghKHJlc3VsdCA9IGVxKGFbc2l6ZV0sIGJbc2l6ZV0sIGFTdGFjaywgYlN0YWNrKSkpIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIE9iamVjdHMgd2l0aCBkaWZmZXJlbnQgY29uc3RydWN0b3JzIGFyZSBub3QgZXF1aXZhbGVudCwgYnV0IGBPYmplY3Rgc1xuICAgICAgLy8gZnJvbSBkaWZmZXJlbnQgZnJhbWVzIGFyZS5cbiAgICAgIHZhciBhQ3RvciA9IGEuY29uc3RydWN0b3IsIGJDdG9yID0gYi5jb25zdHJ1Y3RvcjtcbiAgICAgIGlmIChhQ3RvciAhPT0gYkN0b3IgJiYgIShfLmlzRnVuY3Rpb24oYUN0b3IpICYmIChhQ3RvciBpbnN0YW5jZW9mIGFDdG9yKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF8uaXNGdW5jdGlvbihiQ3RvcikgJiYgKGJDdG9yIGluc3RhbmNlb2YgYkN0b3IpKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICAvLyBEZWVwIGNvbXBhcmUgb2JqZWN0cy5cbiAgICAgIGZvciAodmFyIGtleSBpbiBhKSB7XG4gICAgICAgIGlmIChfLmhhcyhhLCBrZXkpKSB7XG4gICAgICAgICAgLy8gQ291bnQgdGhlIGV4cGVjdGVkIG51bWJlciBvZiBwcm9wZXJ0aWVzLlxuICAgICAgICAgIHNpemUrKztcbiAgICAgICAgICAvLyBEZWVwIGNvbXBhcmUgZWFjaCBtZW1iZXIuXG4gICAgICAgICAgaWYgKCEocmVzdWx0ID0gXy5oYXMoYiwga2V5KSAmJiBlcShhW2tleV0sIGJba2V5XSwgYVN0YWNrLCBiU3RhY2spKSkgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIEVuc3VyZSB0aGF0IGJvdGggb2JqZWN0cyBjb250YWluIHRoZSBzYW1lIG51bWJlciBvZiBwcm9wZXJ0aWVzLlxuICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICBmb3IgKGtleSBpbiBiKSB7XG4gICAgICAgICAgaWYgKF8uaGFzKGIsIGtleSkgJiYgIShzaXplLS0pKSBicmVhaztcbiAgICAgICAgfVxuICAgICAgICByZXN1bHQgPSAhc2l6ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gUmVtb3ZlIHRoZSBmaXJzdCBvYmplY3QgZnJvbSB0aGUgc3RhY2sgb2YgdHJhdmVyc2VkIG9iamVjdHMuXG4gICAgYVN0YWNrLnBvcCgpO1xuICAgIGJTdGFjay5wb3AoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFBlcmZvcm0gYSBkZWVwIGNvbXBhcmlzb24gdG8gY2hlY2sgaWYgdHdvIG9iamVjdHMgYXJlIGVxdWFsLlxuICBfLmlzRXF1YWwgPSBmdW5jdGlvbihhLCBiKSB7XG4gICAgcmV0dXJuIGVxKGEsIGIsIFtdLCBbXSk7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiBhcnJheSwgc3RyaW5nLCBvciBvYmplY3QgZW1wdHk/XG4gIC8vIEFuIFwiZW1wdHlcIiBvYmplY3QgaGFzIG5vIGVudW1lcmFibGUgb3duLXByb3BlcnRpZXMuXG4gIF8uaXNFbXB0eSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHRydWU7XG4gICAgaWYgKF8uaXNBcnJheShvYmopIHx8IF8uaXNTdHJpbmcob2JqKSkgcmV0dXJuIG9iai5sZW5ndGggPT09IDA7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikgaWYgKF8uaGFzKG9iaiwga2V5KSkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiB0cnVlO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgYSBET00gZWxlbWVudD9cbiAgXy5pc0VsZW1lbnQgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gISEob2JqICYmIG9iai5ub2RlVHlwZSA9PT0gMSk7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBhbiBhcnJheT9cbiAgLy8gRGVsZWdhdGVzIHRvIEVDTUE1J3MgbmF0aXZlIEFycmF5LmlzQXJyYXlcbiAgXy5pc0FycmF5ID0gbmF0aXZlSXNBcnJheSB8fCBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gdG9TdHJpbmcuY2FsbChvYmopID09ICdbb2JqZWN0IEFycmF5XSc7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YXJpYWJsZSBhbiBvYmplY3Q/XG4gIF8uaXNPYmplY3QgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSBPYmplY3Qob2JqKTtcbiAgfTtcblxuICAvLyBBZGQgc29tZSBpc1R5cGUgbWV0aG9kczogaXNBcmd1bWVudHMsIGlzRnVuY3Rpb24sIGlzU3RyaW5nLCBpc051bWJlciwgaXNEYXRlLCBpc1JlZ0V4cC5cbiAgZWFjaChbJ0FyZ3VtZW50cycsICdGdW5jdGlvbicsICdTdHJpbmcnLCAnTnVtYmVyJywgJ0RhdGUnLCAnUmVnRXhwJ10sIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICBfWydpcycgKyBuYW1lXSA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIHRvU3RyaW5nLmNhbGwob2JqKSA9PSAnW29iamVjdCAnICsgbmFtZSArICddJztcbiAgICB9O1xuICB9KTtcblxuICAvLyBEZWZpbmUgYSBmYWxsYmFjayB2ZXJzaW9uIG9mIHRoZSBtZXRob2QgaW4gYnJvd3NlcnMgKGFoZW0sIElFKSwgd2hlcmVcbiAgLy8gdGhlcmUgaXNuJ3QgYW55IGluc3BlY3RhYmxlIFwiQXJndW1lbnRzXCIgdHlwZS5cbiAgaWYgKCFfLmlzQXJndW1lbnRzKGFyZ3VtZW50cykpIHtcbiAgICBfLmlzQXJndW1lbnRzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gISEob2JqICYmIF8uaGFzKG9iaiwgJ2NhbGxlZScpKTtcbiAgICB9O1xuICB9XG5cbiAgLy8gT3B0aW1pemUgYGlzRnVuY3Rpb25gIGlmIGFwcHJvcHJpYXRlLlxuICBpZiAodHlwZW9mICgvLi8pICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgXy5pc0Z1bmN0aW9uID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gdHlwZW9mIG9iaiA9PT0gJ2Z1bmN0aW9uJztcbiAgICB9O1xuICB9XG5cbiAgLy8gSXMgYSBnaXZlbiBvYmplY3QgYSBmaW5pdGUgbnVtYmVyP1xuICBfLmlzRmluaXRlID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIGlzRmluaXRlKG9iaikgJiYgIWlzTmFOKHBhcnNlRmxvYXQob2JqKSk7XG4gIH07XG5cbiAgLy8gSXMgdGhlIGdpdmVuIHZhbHVlIGBOYU5gPyAoTmFOIGlzIHRoZSBvbmx5IG51bWJlciB3aGljaCBkb2VzIG5vdCBlcXVhbCBpdHNlbGYpLlxuICBfLmlzTmFOID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIF8uaXNOdW1iZXIob2JqKSAmJiBvYmogIT0gK29iajtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGEgYm9vbGVhbj9cbiAgXy5pc0Jvb2xlYW4gPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSB0cnVlIHx8IG9iaiA9PT0gZmFsc2UgfHwgdG9TdHJpbmcuY2FsbChvYmopID09ICdbb2JqZWN0IEJvb2xlYW5dJztcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGVxdWFsIHRvIG51bGw/XG4gIF8uaXNOdWxsID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PT0gbnVsbDtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhcmlhYmxlIHVuZGVmaW5lZD9cbiAgXy5pc1VuZGVmaW5lZCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT09IHZvaWQgMDtcbiAgfTtcblxuICAvLyBTaG9ydGN1dCBmdW5jdGlvbiBmb3IgY2hlY2tpbmcgaWYgYW4gb2JqZWN0IGhhcyBhIGdpdmVuIHByb3BlcnR5IGRpcmVjdGx5XG4gIC8vIG9uIGl0c2VsZiAoaW4gb3RoZXIgd29yZHMsIG5vdCBvbiBhIHByb3RvdHlwZSkuXG4gIF8uaGFzID0gZnVuY3Rpb24ob2JqLCBrZXkpIHtcbiAgICByZXR1cm4gaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSk7XG4gIH07XG5cbiAgLy8gVXRpbGl0eSBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBSdW4gVW5kZXJzY29yZS5qcyBpbiAqbm9Db25mbGljdCogbW9kZSwgcmV0dXJuaW5nIHRoZSBgX2AgdmFyaWFibGUgdG8gaXRzXG4gIC8vIHByZXZpb3VzIG93bmVyLiBSZXR1cm5zIGEgcmVmZXJlbmNlIHRvIHRoZSBVbmRlcnNjb3JlIG9iamVjdC5cbiAgXy5ub0NvbmZsaWN0ID0gZnVuY3Rpb24oKSB7XG4gICAgcm9vdC5fID0gcHJldmlvdXNVbmRlcnNjb3JlO1xuICAgIHJldHVybiB0aGlzO1xuICB9O1xuXG4gIC8vIEtlZXAgdGhlIGlkZW50aXR5IGZ1bmN0aW9uIGFyb3VuZCBmb3IgZGVmYXVsdCBpdGVyYXRvcnMuXG4gIF8uaWRlbnRpdHkgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfTtcblxuICAvLyBSdW4gYSBmdW5jdGlvbiAqKm4qKiB0aW1lcy5cbiAgXy50aW1lcyA9IGZ1bmN0aW9uKG4sIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgdmFyIGFjY3VtID0gQXJyYXkobik7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyBpKyspIGFjY3VtW2ldID0gaXRlcmF0b3IuY2FsbChjb250ZXh0LCBpKTtcbiAgICByZXR1cm4gYWNjdW07XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgcmFuZG9tIGludGVnZXIgYmV0d2VlbiBtaW4gYW5kIG1heCAoaW5jbHVzaXZlKS5cbiAgXy5yYW5kb20gPSBmdW5jdGlvbihtaW4sIG1heCkge1xuICAgIGlmIChtYXggPT0gbnVsbCkge1xuICAgICAgbWF4ID0gbWluO1xuICAgICAgbWluID0gMDtcbiAgICB9XG4gICAgcmV0dXJuIG1pbiArIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4gKyAxKSk7XG4gIH07XG5cbiAgLy8gTGlzdCBvZiBIVE1MIGVudGl0aWVzIGZvciBlc2NhcGluZy5cbiAgdmFyIGVudGl0eU1hcCA9IHtcbiAgICBlc2NhcGU6IHtcbiAgICAgICcmJzogJyZhbXA7JyxcbiAgICAgICc8JzogJyZsdDsnLFxuICAgICAgJz4nOiAnJmd0OycsXG4gICAgICAnXCInOiAnJnF1b3Q7JyxcbiAgICAgIFwiJ1wiOiAnJiN4Mjc7JyxcbiAgICAgICcvJzogJyYjeDJGOydcbiAgICB9XG4gIH07XG4gIGVudGl0eU1hcC51bmVzY2FwZSA9IF8uaW52ZXJ0KGVudGl0eU1hcC5lc2NhcGUpO1xuXG4gIC8vIFJlZ2V4ZXMgY29udGFpbmluZyB0aGUga2V5cyBhbmQgdmFsdWVzIGxpc3RlZCBpbW1lZGlhdGVseSBhYm92ZS5cbiAgdmFyIGVudGl0eVJlZ2V4ZXMgPSB7XG4gICAgZXNjYXBlOiAgIG5ldyBSZWdFeHAoJ1snICsgXy5rZXlzKGVudGl0eU1hcC5lc2NhcGUpLmpvaW4oJycpICsgJ10nLCAnZycpLFxuICAgIHVuZXNjYXBlOiBuZXcgUmVnRXhwKCcoJyArIF8ua2V5cyhlbnRpdHlNYXAudW5lc2NhcGUpLmpvaW4oJ3wnKSArICcpJywgJ2cnKVxuICB9O1xuXG4gIC8vIEZ1bmN0aW9ucyBmb3IgZXNjYXBpbmcgYW5kIHVuZXNjYXBpbmcgc3RyaW5ncyB0by9mcm9tIEhUTUwgaW50ZXJwb2xhdGlvbi5cbiAgXy5lYWNoKFsnZXNjYXBlJywgJ3VuZXNjYXBlJ10sIGZ1bmN0aW9uKG1ldGhvZCkge1xuICAgIF9bbWV0aG9kXSA9IGZ1bmN0aW9uKHN0cmluZykge1xuICAgICAgaWYgKHN0cmluZyA9PSBudWxsKSByZXR1cm4gJyc7XG4gICAgICByZXR1cm4gKCcnICsgc3RyaW5nKS5yZXBsYWNlKGVudGl0eVJlZ2V4ZXNbbWV0aG9kXSwgZnVuY3Rpb24obWF0Y2gpIHtcbiAgICAgICAgcmV0dXJuIGVudGl0eU1hcFttZXRob2RdW21hdGNoXTtcbiAgICAgIH0pO1xuICAgIH07XG4gIH0pO1xuXG4gIC8vIElmIHRoZSB2YWx1ZSBvZiB0aGUgbmFtZWQgcHJvcGVydHkgaXMgYSBmdW5jdGlvbiB0aGVuIGludm9rZSBpdDtcbiAgLy8gb3RoZXJ3aXNlLCByZXR1cm4gaXQuXG4gIF8ucmVzdWx0ID0gZnVuY3Rpb24ob2JqZWN0LCBwcm9wZXJ0eSkge1xuICAgIGlmIChvYmplY3QgPT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gICAgdmFyIHZhbHVlID0gb2JqZWN0W3Byb3BlcnR5XTtcbiAgICByZXR1cm4gXy5pc0Z1bmN0aW9uKHZhbHVlKSA/IHZhbHVlLmNhbGwob2JqZWN0KSA6IHZhbHVlO1xuICB9O1xuXG4gIC8vIEFkZCB5b3VyIG93biBjdXN0b20gZnVuY3Rpb25zIHRvIHRoZSBVbmRlcnNjb3JlIG9iamVjdC5cbiAgXy5taXhpbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGVhY2goXy5mdW5jdGlvbnMob2JqKSwgZnVuY3Rpb24obmFtZSl7XG4gICAgICB2YXIgZnVuYyA9IF9bbmFtZV0gPSBvYmpbbmFtZV07XG4gICAgICBfLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgYXJncyA9IFt0aGlzLl93cmFwcGVkXTtcbiAgICAgICAgcHVzaC5hcHBseShhcmdzLCBhcmd1bWVudHMpO1xuICAgICAgICByZXR1cm4gcmVzdWx0LmNhbGwodGhpcywgZnVuYy5hcHBseShfLCBhcmdzKSk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIEdlbmVyYXRlIGEgdW5pcXVlIGludGVnZXIgaWQgKHVuaXF1ZSB3aXRoaW4gdGhlIGVudGlyZSBjbGllbnQgc2Vzc2lvbikuXG4gIC8vIFVzZWZ1bCBmb3IgdGVtcG9yYXJ5IERPTSBpZHMuXG4gIHZhciBpZENvdW50ZXIgPSAwO1xuICBfLnVuaXF1ZUlkID0gZnVuY3Rpb24ocHJlZml4KSB7XG4gICAgdmFyIGlkID0gKytpZENvdW50ZXIgKyAnJztcbiAgICByZXR1cm4gcHJlZml4ID8gcHJlZml4ICsgaWQgOiBpZDtcbiAgfTtcblxuICAvLyBCeSBkZWZhdWx0LCBVbmRlcnNjb3JlIHVzZXMgRVJCLXN0eWxlIHRlbXBsYXRlIGRlbGltaXRlcnMsIGNoYW5nZSB0aGVcbiAgLy8gZm9sbG93aW5nIHRlbXBsYXRlIHNldHRpbmdzIHRvIHVzZSBhbHRlcm5hdGl2ZSBkZWxpbWl0ZXJzLlxuICBfLnRlbXBsYXRlU2V0dGluZ3MgPSB7XG4gICAgZXZhbHVhdGUgICAgOiAvPCUoW1xcc1xcU10rPyklPi9nLFxuICAgIGludGVycG9sYXRlIDogLzwlPShbXFxzXFxTXSs/KSU+L2csXG4gICAgZXNjYXBlICAgICAgOiAvPCUtKFtcXHNcXFNdKz8pJT4vZ1xuICB9O1xuXG4gIC8vIFdoZW4gY3VzdG9taXppbmcgYHRlbXBsYXRlU2V0dGluZ3NgLCBpZiB5b3UgZG9uJ3Qgd2FudCB0byBkZWZpbmUgYW5cbiAgLy8gaW50ZXJwb2xhdGlvbiwgZXZhbHVhdGlvbiBvciBlc2NhcGluZyByZWdleCwgd2UgbmVlZCBvbmUgdGhhdCBpc1xuICAvLyBndWFyYW50ZWVkIG5vdCB0byBtYXRjaC5cbiAgdmFyIG5vTWF0Y2ggPSAvKC4pXi87XG5cbiAgLy8gQ2VydGFpbiBjaGFyYWN0ZXJzIG5lZWQgdG8gYmUgZXNjYXBlZCBzbyB0aGF0IHRoZXkgY2FuIGJlIHB1dCBpbnRvIGFcbiAgLy8gc3RyaW5nIGxpdGVyYWwuXG4gIHZhciBlc2NhcGVzID0ge1xuICAgIFwiJ1wiOiAgICAgIFwiJ1wiLFxuICAgICdcXFxcJzogICAgICdcXFxcJyxcbiAgICAnXFxyJzogICAgICdyJyxcbiAgICAnXFxuJzogICAgICduJyxcbiAgICAnXFx0JzogICAgICd0JyxcbiAgICAnXFx1MjAyOCc6ICd1MjAyOCcsXG4gICAgJ1xcdTIwMjknOiAndTIwMjknXG4gIH07XG5cbiAgdmFyIGVzY2FwZXIgPSAvXFxcXHwnfFxccnxcXG58XFx0fFxcdTIwMjh8XFx1MjAyOS9nO1xuXG4gIC8vIEphdmFTY3JpcHQgbWljcm8tdGVtcGxhdGluZywgc2ltaWxhciB0byBKb2huIFJlc2lnJ3MgaW1wbGVtZW50YXRpb24uXG4gIC8vIFVuZGVyc2NvcmUgdGVtcGxhdGluZyBoYW5kbGVzIGFyYml0cmFyeSBkZWxpbWl0ZXJzLCBwcmVzZXJ2ZXMgd2hpdGVzcGFjZSxcbiAgLy8gYW5kIGNvcnJlY3RseSBlc2NhcGVzIHF1b3RlcyB3aXRoaW4gaW50ZXJwb2xhdGVkIGNvZGUuXG4gIF8udGVtcGxhdGUgPSBmdW5jdGlvbih0ZXh0LCBkYXRhLCBzZXR0aW5ncykge1xuICAgIHZhciByZW5kZXI7XG4gICAgc2V0dGluZ3MgPSBfLmRlZmF1bHRzKHt9LCBzZXR0aW5ncywgXy50ZW1wbGF0ZVNldHRpbmdzKTtcblxuICAgIC8vIENvbWJpbmUgZGVsaW1pdGVycyBpbnRvIG9uZSByZWd1bGFyIGV4cHJlc3Npb24gdmlhIGFsdGVybmF0aW9uLlxuICAgIHZhciBtYXRjaGVyID0gbmV3IFJlZ0V4cChbXG4gICAgICAoc2V0dGluZ3MuZXNjYXBlIHx8IG5vTWF0Y2gpLnNvdXJjZSxcbiAgICAgIChzZXR0aW5ncy5pbnRlcnBvbGF0ZSB8fCBub01hdGNoKS5zb3VyY2UsXG4gICAgICAoc2V0dGluZ3MuZXZhbHVhdGUgfHwgbm9NYXRjaCkuc291cmNlXG4gICAgXS5qb2luKCd8JykgKyAnfCQnLCAnZycpO1xuXG4gICAgLy8gQ29tcGlsZSB0aGUgdGVtcGxhdGUgc291cmNlLCBlc2NhcGluZyBzdHJpbmcgbGl0ZXJhbHMgYXBwcm9wcmlhdGVseS5cbiAgICB2YXIgaW5kZXggPSAwO1xuICAgIHZhciBzb3VyY2UgPSBcIl9fcCs9J1wiO1xuICAgIHRleHQucmVwbGFjZShtYXRjaGVyLCBmdW5jdGlvbihtYXRjaCwgZXNjYXBlLCBpbnRlcnBvbGF0ZSwgZXZhbHVhdGUsIG9mZnNldCkge1xuICAgICAgc291cmNlICs9IHRleHQuc2xpY2UoaW5kZXgsIG9mZnNldClcbiAgICAgICAgLnJlcGxhY2UoZXNjYXBlciwgZnVuY3Rpb24obWF0Y2gpIHsgcmV0dXJuICdcXFxcJyArIGVzY2FwZXNbbWF0Y2hdOyB9KTtcblxuICAgICAgaWYgKGVzY2FwZSkge1xuICAgICAgICBzb3VyY2UgKz0gXCInK1xcbigoX190PShcIiArIGVzY2FwZSArIFwiKSk9PW51bGw/Jyc6Xy5lc2NhcGUoX190KSkrXFxuJ1wiO1xuICAgICAgfVxuICAgICAgaWYgKGludGVycG9sYXRlKSB7XG4gICAgICAgIHNvdXJjZSArPSBcIicrXFxuKChfX3Q9KFwiICsgaW50ZXJwb2xhdGUgKyBcIikpPT1udWxsPycnOl9fdCkrXFxuJ1wiO1xuICAgICAgfVxuICAgICAgaWYgKGV2YWx1YXRlKSB7XG4gICAgICAgIHNvdXJjZSArPSBcIic7XFxuXCIgKyBldmFsdWF0ZSArIFwiXFxuX19wKz0nXCI7XG4gICAgICB9XG4gICAgICBpbmRleCA9IG9mZnNldCArIG1hdGNoLmxlbmd0aDtcbiAgICAgIHJldHVybiBtYXRjaDtcbiAgICB9KTtcbiAgICBzb3VyY2UgKz0gXCInO1xcblwiO1xuXG4gICAgLy8gSWYgYSB2YXJpYWJsZSBpcyBub3Qgc3BlY2lmaWVkLCBwbGFjZSBkYXRhIHZhbHVlcyBpbiBsb2NhbCBzY29wZS5cbiAgICBpZiAoIXNldHRpbmdzLnZhcmlhYmxlKSBzb3VyY2UgPSAnd2l0aChvYmp8fHt9KXtcXG4nICsgc291cmNlICsgJ31cXG4nO1xuXG4gICAgc291cmNlID0gXCJ2YXIgX190LF9fcD0nJyxfX2o9QXJyYXkucHJvdG90eXBlLmpvaW4sXCIgK1xuICAgICAgXCJwcmludD1mdW5jdGlvbigpe19fcCs9X19qLmNhbGwoYXJndW1lbnRzLCcnKTt9O1xcblwiICtcbiAgICAgIHNvdXJjZSArIFwicmV0dXJuIF9fcDtcXG5cIjtcblxuICAgIHRyeSB7XG4gICAgICByZW5kZXIgPSBuZXcgRnVuY3Rpb24oc2V0dGluZ3MudmFyaWFibGUgfHwgJ29iaicsICdfJywgc291cmNlKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBlLnNvdXJjZSA9IHNvdXJjZTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuXG4gICAgaWYgKGRhdGEpIHJldHVybiByZW5kZXIoZGF0YSwgXyk7XG4gICAgdmFyIHRlbXBsYXRlID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgcmV0dXJuIHJlbmRlci5jYWxsKHRoaXMsIGRhdGEsIF8pO1xuICAgIH07XG5cbiAgICAvLyBQcm92aWRlIHRoZSBjb21waWxlZCBmdW5jdGlvbiBzb3VyY2UgYXMgYSBjb252ZW5pZW5jZSBmb3IgcHJlY29tcGlsYXRpb24uXG4gICAgdGVtcGxhdGUuc291cmNlID0gJ2Z1bmN0aW9uKCcgKyAoc2V0dGluZ3MudmFyaWFibGUgfHwgJ29iaicpICsgJyl7XFxuJyArIHNvdXJjZSArICd9JztcblxuICAgIHJldHVybiB0ZW1wbGF0ZTtcbiAgfTtcblxuICAvLyBBZGQgYSBcImNoYWluXCIgZnVuY3Rpb24sIHdoaWNoIHdpbGwgZGVsZWdhdGUgdG8gdGhlIHdyYXBwZXIuXG4gIF8uY2hhaW4gPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gXyhvYmopLmNoYWluKCk7XG4gIH07XG5cbiAgLy8gT09QXG4gIC8vIC0tLS0tLS0tLS0tLS0tLVxuICAvLyBJZiBVbmRlcnNjb3JlIGlzIGNhbGxlZCBhcyBhIGZ1bmN0aW9uLCBpdCByZXR1cm5zIGEgd3JhcHBlZCBvYmplY3QgdGhhdFxuICAvLyBjYW4gYmUgdXNlZCBPTy1zdHlsZS4gVGhpcyB3cmFwcGVyIGhvbGRzIGFsdGVyZWQgdmVyc2lvbnMgb2YgYWxsIHRoZVxuICAvLyB1bmRlcnNjb3JlIGZ1bmN0aW9ucy4gV3JhcHBlZCBvYmplY3RzIG1heSBiZSBjaGFpbmVkLlxuXG4gIC8vIEhlbHBlciBmdW5jdGlvbiB0byBjb250aW51ZSBjaGFpbmluZyBpbnRlcm1lZGlhdGUgcmVzdWx0cy5cbiAgdmFyIHJlc3VsdCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiB0aGlzLl9jaGFpbiA/IF8ob2JqKS5jaGFpbigpIDogb2JqO1xuICB9O1xuXG4gIC8vIEFkZCBhbGwgb2YgdGhlIFVuZGVyc2NvcmUgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyIG9iamVjdC5cbiAgXy5taXhpbihfKTtcblxuICAvLyBBZGQgYWxsIG11dGF0b3IgQXJyYXkgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyLlxuICBlYWNoKFsncG9wJywgJ3B1c2gnLCAncmV2ZXJzZScsICdzaGlmdCcsICdzb3J0JywgJ3NwbGljZScsICd1bnNoaWZ0J10sIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICB2YXIgbWV0aG9kID0gQXJyYXlQcm90b1tuYW1lXTtcbiAgICBfLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIG9iaiA9IHRoaXMuX3dyYXBwZWQ7XG4gICAgICBtZXRob2QuYXBwbHkob2JqLCBhcmd1bWVudHMpO1xuICAgICAgaWYgKChuYW1lID09ICdzaGlmdCcgfHwgbmFtZSA9PSAnc3BsaWNlJykgJiYgb2JqLmxlbmd0aCA9PT0gMCkgZGVsZXRlIG9ialswXTtcbiAgICAgIHJldHVybiByZXN1bHQuY2FsbCh0aGlzLCBvYmopO1xuICAgIH07XG4gIH0pO1xuXG4gIC8vIEFkZCBhbGwgYWNjZXNzb3IgQXJyYXkgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyLlxuICBlYWNoKFsnY29uY2F0JywgJ2pvaW4nLCAnc2xpY2UnXSwgZnVuY3Rpb24obmFtZSkge1xuICAgIHZhciBtZXRob2QgPSBBcnJheVByb3RvW25hbWVdO1xuICAgIF8ucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gcmVzdWx0LmNhbGwodGhpcywgbWV0aG9kLmFwcGx5KHRoaXMuX3dyYXBwZWQsIGFyZ3VtZW50cykpO1xuICAgIH07XG4gIH0pO1xuXG4gIF8uZXh0ZW5kKF8ucHJvdG90eXBlLCB7XG5cbiAgICAvLyBTdGFydCBjaGFpbmluZyBhIHdyYXBwZWQgVW5kZXJzY29yZSBvYmplY3QuXG4gICAgY2hhaW46IGZ1bmN0aW9uKCkge1xuICAgICAgdGhpcy5fY2hhaW4gPSB0cnVlO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIC8vIEV4dHJhY3RzIHRoZSByZXN1bHQgZnJvbSBhIHdyYXBwZWQgYW5kIGNoYWluZWQgb2JqZWN0LlxuICAgIHZhbHVlOiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiB0aGlzLl93cmFwcGVkO1xuICAgIH1cblxuICB9KTtcblxufSkuY2FsbCh0aGlzKTtcblxufSkoKSIsInZhciByeCA9IHJlcXVpcmUoJ3J4anMnKTtcbnZhciByb3V0aWUgPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9yb3V0aWUnKTtcbnZhciBwbGF5ZXIgPSByZXF1aXJlKCcuLi9wbGF5ZXInKTtcbnZhciB2aWV3ID0gcmVxdWlyZSgnLi4vLi4vdmlld3Mvd2FpdC5oYnMnKTtcbnJlcXVpcmUoJy4uLy4uLy4uLzNyZHBhcnR5L3J4LnplcHRvJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gIFxuICBpZiAocGxheWVyLmdldCgpLmlkID09IHVuZGVmaW5lZCkge1xuICAgIHJvdXRpZS5uYXZpZ2F0ZSgnL2Nvbm5lY3QnKTtcbiAgfVxuICBcbiAgJCgnI3BhZ2UnKS5hdHRyKCdjbGFzcycsICd3YWl0Jyk7XG4gICQoJyNwYWdlJykuaHRtbCh2aWV3KCkpO1xuXG4gIHZhciBvYnNlcnZhYmxlID0gcnguT2JzZXJ2YWJsZVxuICAgIC5pbnRlcnZhbCgzMDAwKVxuICAgIC5zdGFydFdpdGgoLTEpXG4gICAgLnNlbGVjdE1hbnkob2JzZXJ2YWJsZUxvYmJ5KVxuICAgIC5za2lwV2hpbGUoZ2FtZUluUHJvZ3Jlc3MpXG4gICAgLnRha2UoMSlcbiAgICAuc3Vic2NyaWJlKHN3aXRjaFN0YXRlLCBvbkVycm9yKTtcblxufTtcblxuZnVuY3Rpb24gb2JzZXJ2YWJsZUxvYmJ5KCkge1xuICByZXR1cm4gJC5nZXRKU09OQXNPYnNlcnZhYmxlKCcvZ2FtZS9zdGF0dXMnKTtcbn1cblxuZnVuY3Rpb24gZ2FtZUluUHJvZ3Jlc3MocmVzKSB7XG4gIHJldHVybiByZXMuZGF0YS5pblByb2dyZXNzID09PSB0cnVlO1xufVxuXG5mdW5jdGlvbiBzd2l0Y2hTdGF0ZSgpIHtcbiAgcm91dGllLm5hdmlnYXRlKCcvam9pbicpO1xufVxuXG5mdW5jdGlvbiBvbkVycm9yKCkge1xuICBjb25zb2xlLmxvZygnR2FtZSBub3QgcmVzcG9uZGluZycpO1xufVxuIiwidmFyIHJ4ID0gcmVxdWlyZSgncnhqcycpO1xudmFyIHJvdXRpZSA9IHJlcXVpcmUoJy4uLy4uLy4uLzNyZHBhcnR5L3JvdXRpZScpO1xudmFyIHBsYXllciA9IHJlcXVpcmUoJy4uL3BsYXllcicpO1xudmFyIHZpZXcgPSByZXF1aXJlKCcuLi8uLi92aWV3cy9sb2JieS5oYnMnKTtcbnJlcXVpcmUoJy4uLy4uLy4uLzNyZHBhcnR5L3J4LnplcHRvJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gIFxuICBpZiAocGxheWVyLmdldCgpLmlkID09IHVuZGVmaW5lZCkge1xuICAgIHJvdXRpZS5uYXZpZ2F0ZSgnL2Nvbm5lY3QnKTtcbiAgfVxuICBcbiAgJCgnI3BhZ2UnKS5hdHRyKCdjbGFzcycsICdsb2JieScpO1xuICAkKCcjcGFnZScpLmh0bWwodmlldygpKTtcbiAgJCgnI2NhbmNlbCcpLm9uKCdjbGljaycsIGV4aXRMb2JieSk7XG5cbiAgdmFyIG9ic2VydmFibGUgPSByeC5PYnNlcnZhYmxlXG4gICAgLmludGVydmFsKDEwMDApXG4gICAgLnN0YXJ0V2l0aCgtMSlcbiAgICAuc2VsZWN0TWFueShvYnNlcnZhYmxlTG9iYnkpXG4gICAgLnNraXBXaGlsZSh3YWl0aW5nRm9yT3RoZXJQbGF5ZXIpXG4gICAgLnRha2UoMSlcbiAgICAuc3Vic2NyaWJlKHN0YXJ0TWF0Y2gsIG9uRXJyb3IpO1xuXG59O1xuXG5mdW5jdGlvbiBvYnNlcnZhYmxlTG9iYnkoKSB7XG4gIHJldHVybiAkLmdldEpTT05Bc09ic2VydmFibGUoJy9nYW1lL3N0YXR1cycpO1xufVxuXG5mdW5jdGlvbiB3YWl0aW5nRm9yT3RoZXJQbGF5ZXIocmVzKSB7XG4gIHJldHVybiByZXMuZGF0YS5pblByb2dyZXNzID09PSBmYWxzZTtcbn1cblxuZnVuY3Rpb24gc3RhcnRNYXRjaCgpIHtcbiAgcm91dGllLm5hdmlnYXRlKCcvZ2FtZXBhZCcpO1xufVxuXG5mdW5jdGlvbiBvbkVycm9yKCkge1xuICBjb25zb2xlLmxvZygnR2FtZSBub3QgcmVzcG9uZGluZycpO1xufVxuXG5mdW5jdGlvbiBleGl0TG9iYnkoKSB7XG4gICQuYWpheCh7XG4gICAgdHlwZTogJ0RFTEVURScsXG4gICAgdXJsOiAnL2dhbWUvcGxheWVycy8nICsgcGxheWVyLmdldCgpLmlkXG4gIH0pLnRoZW4oYmFja1RvV2FpdCk7XG59XG5cbmZ1bmN0aW9uIGJhY2tUb1dhaXQoKSB7XG4gIHJvdXRpZS5uYXZpZ2F0ZSgnL3dhaXQnKTtcbn1cbiIsInZhciByeCA9IHJlcXVpcmUoJ3J4anMnKTtcbnZhciByb3V0aWUgPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9yb3V0aWUnKTtcbnZhciBwbGF5ZXIgPSByZXF1aXJlKCcuLi9wbGF5ZXInKTtcbnZhciB2aWV3ID0gcmVxdWlyZSgnLi4vLi4vdmlld3MvZ2FtZXBhZC5oYnMnKTtcbnZhciBvYnNlcnZhYmxlID0gbnVsbDtcbnZhciBzb2NrZXQgPSBudWxsXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG5cbiAgaWYgKHBsYXllci5nZXQoKS5pZCA9PSB1bmRlZmluZWQpIHtcbiAgICByb3V0aWUubmF2aWdhdGUoJy9jb25uZWN0Jyk7XG4gIH1cblxuICBzb2NrZXQgPSBpby5jb25uZWN0KCcvJylcbiAgXG4gICQoJyNwYWdlJykuYXR0cignY2xhc3MnLCAnZ2FtZXBhZCcpO1xuICAkKCcjcGFnZScpLmh0bWwodmlldygpKTtcblxuICBvYnNlcnZhYmxlID0gcnguT2JzZXJ2YWJsZVxuICAgIC5pbnRlcnZhbCgyMDAwKVxuICAgIC5zdGFydFdpdGgoLTEpXG4gICAgLnNlbGVjdE1hbnkob2JzZXJ2YWJsZUdhbWUpXG4gICAgLnN1YnNjcmliZShjaGVja0dhbWVTdGF0dXMsIG9uRXJyb3IpO1xuXG4gIGlmICgnb250b3VjaHN0YXJ0JyBpbiB3aW5kb3cpIHtcbiAgICAkKCcuYnV0dG9uLnVwJykub24oJ3RvdWNoc3RhcnQnLCBnb1VwKTtcbiAgICAkKCcuYnV0dG9uLnVwJykub24oJ3RvdWNoZW5kJywgc3RvcCk7XG4gICAgJCgnLmJ1dHRvbi5kb3duJykub24oJ3RvdWNoc3RhcnQnLCBnb0Rvd24pO1xuICAgICQoJy5idXR0b24uZG93bicpLm9uKCd0b3VjaGVuZCcsIHN0b3ApO1xuICB9IGVsc2Uge1xuICAgICQoJy5idXR0b24udXAnKS5vbignbW91c2Vkb3duJywgZ29VcCk7XG4gICAgJCgnLmJ1dHRvbi51cCcpLm9uKCdtb3VzZXVwJywgc3RvcCk7XG4gICAgJCgnLmJ1dHRvbi5kb3duJykub24oJ21vdXNlZG93bicsIGdvRG93bik7XG4gICAgJCgnLmJ1dHRvbi5kb3duJykub24oJ21vdXNldXAnLCBzdG9wKTtcbiAgfVxuICBcbn07XG5cbmZ1bmN0aW9uIGdvVXAoZSkge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICQoZS5jdXJyZW50VGFyZ2V0KS5hZGRDbGFzcygncHJlc3NlZCcpO1xuICBzZW5kQWN0aW9uKCd1cCcpO1xufVxuXG5mdW5jdGlvbiBnb0Rvd24oZSkge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICQoZS5jdXJyZW50VGFyZ2V0KS5hZGRDbGFzcygncHJlc3NlZCcpO1xuICBzZW5kQWN0aW9uKCdkb3duJyk7XG59XG5cbmZ1bmN0aW9uIHN0b3AoZSkge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICQoZS5jdXJyZW50VGFyZ2V0KS5yZW1vdmVDbGFzcygncHJlc3NlZCcpO1xufVxuXG5mdW5jdGlvbiBzZW5kQWN0aW9uKGFjdGlvbk5hbWUpIHtcbiAgc29ja2V0LmVtaXQoJ21vdmUnLCB7IHBsYXllcjogcGxheWVyLmdldCgpLmlkLCBhY3Rpb246IGFjdGlvbk5hbWUgfSlcbn1cblxuZnVuY3Rpb24gb2JzZXJ2YWJsZUdhbWUoKSB7XG4gIHJldHVybiAkLmdldEpTT05Bc09ic2VydmFibGUoJy9nYW1lL3N0YXR1cycpO1xufVxuXG5mdW5jdGlvbiBjaGVja0dhbWVTdGF0dXMocmVzKSB7XG4gIGlmIChyZXMuZGF0YS5pblByb2dyZXNzKSB7XG4gICAgdmFyIGlkeCA9IGN1cnJlbnRQbGF5ZXJJbmRleChyZXMuZGF0YS5wbGF5ZXJzKTtcbiAgICBpZiAoaWR4ID09PSBudWxsKSB7XG4gICAgICBvYnNlcnZhYmxlLmRpc3Bvc2UoKTtcbiAgICAgIHJvdXRpZS5uYXZpZ2F0ZSgnL3dhaXQnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgJCgnI3BhZ2UgLnBsYXllcicpLmFkZENsYXNzKCdwJyArIChpZHgrMSkpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBvYnNlcnZhYmxlLmRpc3Bvc2UoKTtcbiAgICByb3V0aWUubmF2aWdhdGUoJy9qb2luJyk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY3VycmVudFBsYXllckluZGV4KHBsYXllcnMpIHtcbiAgaWYgKHBsYXllcnNbMF0uaWQgPT09IHBsYXllci5nZXQoKS5pZCkgcmV0dXJuIDA7XG4gIGlmIChwbGF5ZXJzWzFdLmlkID09PSBwbGF5ZXIuZ2V0KCkuaWQpIHJldHVybiAxO1xuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gb25FcnJvcigpIHtcbiAgY29uc29sZS5sb2coJ0dhbWUgbm90IHJlc3BvbmRpbmcnKTtcbn1cbiIsIihmdW5jdGlvbigpey8vIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IE9wZW4gVGVjaG5vbG9naWVzLCBJbmMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuKGZ1bmN0aW9uIChyb290LCBmYWN0b3J5KSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KHJvb3QsIG1vZHVsZS5leHBvcnRzLCByZXF1aXJlKCdyeGpzJyksICQpO1xufSh0aGlzLCBmdW5jdGlvbiAoZ2xvYmFsLCBleHAsIHJvb3QsICQsIHVuZGVmaW5lZCkge1xuICAgICAgICAvLyBIZWFkZXJzXG4gICAgdmFyIHJvb3QgPSBnbG9iYWwuUngsXG4gICAgICAgIG9ic2VydmFibGUgPSByb290Lk9ic2VydmFibGUsXG4gICAgICAgIG9ic2VydmFibGVQcm90byA9IG9ic2VydmFibGUucHJvdG90eXBlLFxuICAgICAgICBBc3luY1N1YmplY3QgPSByb290LkFzeW5jU3ViamVjdCxcbiAgICAgICAgb2JzZXJ2YWJsZUNyZWF0ZSA9IG9ic2VydmFibGUuY3JlYXRlLFxuICAgICAgICBvYnNlcnZhYmxlQ3JlYXRlV2l0aERpc3Bvc2FibGUgPSBvYnNlcnZhYmxlLmNyZWF0ZVdpdGhEaXNwb3NhYmxlLFxuICAgICAgICBkaXNwb3NhYmxlRW1wdHkgPSByb290LkRpc3Bvc2FibGUuZW1wdHksXG4gICAgICAgIHNsaWNlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLFxuICAgICAgICBwcm90byA9ICQuZm47XG4gICAgICAgIFxuICAgICQuRGVmZXJyZWQucHJvdG90eXBlLnRvT2JzZXJ2YWJsZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHN1YmplY3QgPSBuZXcgQXN5bmNTdWJqZWN0KCk7XG4gICAgICAgIHRoaXMuZG9uZShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzdWJqZWN0Lm9uTmV4dChzbGljZS5jYWxsKGFyZ3VtZW50cykpO1xuICAgICAgICAgICAgc3ViamVjdC5vbkNvbXBsZXRlZCgpO1xuICAgICAgICB9KS5mYWlsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHN1YmplY3Qub25FcnJvcihzbGljZS5jYWxsKGFyZ3VtZW50cykpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHN1YmplY3Q7XG4gICAgfTtcblxuICAgIG9ic2VydmFibGVQcm90by50b0RlZmVycmVkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSAkLkRlZmVycmVkKCk7XG4gICAgICAgIHRoaXMuc3Vic2NyaWJlKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh2YWx1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlKSB7IFxuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGUpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkO1xuICAgIH07XG5cbiAgICB2YXIgYWpheEFzT2JzZXJ2YWJsZSA9ICQuYWpheEFzT2JzZXJ2YWJsZSA9IGZ1bmN0aW9uKHNldHRpbmdzKSB7XG4gICAgICAgIHZhciBzdWJqZWN0ID0gbmV3IEFzeW5jU3ViamVjdCgpO1xuXG4gICAgICAgIHZhciBpbnRlcm5hbFNldHRpbmdzID0ge1xuICAgICAgICAgICAgc3VjY2VzczogZnVuY3Rpb24oZGF0YSwgdGV4dFN0YXR1cywganFYSFIpIHtcbiAgICAgICAgICAgICAgICBzdWJqZWN0Lm9uTmV4dCh7IGRhdGE6IGRhdGEsIHRleHRTdGF0dXM6IHRleHRTdGF0dXMsIGpxWEhSOiBqcVhIUiB9KTtcbiAgICAgICAgICAgICAgICBzdWJqZWN0Lm9uQ29tcGxldGVkKCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZXJyb3I6IGZ1bmN0aW9uKGpxWEhSLCB0ZXh0U3RhdHVzLCBlcnJvclRocm93bikge1xuICAgICAgICAgICAgICAgIHN1YmplY3Qub25FcnJvcih7IGpxWEhSOiBqcVhIUiwgdGV4dFN0YXR1czogdGV4dFN0YXR1cywgZXJyb3JUaHJvd246IGVycm9yVGhyb3duIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgJC5leHRlbmQodHJ1ZSwgaW50ZXJuYWxTZXR0aW5ncywgc2V0dGluZ3MpO1xuXG4gICAgICAgICQuYWpheChpbnRlcm5hbFNldHRpbmdzKTtcblxuICAgICAgICByZXR1cm4gc3ViamVjdDtcbiAgICB9O1xuXG4gICAgJC5nZXRBc09ic2VydmFibGUgPSBmdW5jdGlvbih1cmwsIGRhdGEsIGRhdGFUeXBlKSB7XG4gICAgICAgIHJldHVybiBhamF4QXNPYnNlcnZhYmxlKHsgdXJsOiB1cmwsIGRhdGFUeXBlOiBkYXRhVHlwZSwgZGF0YTogZGF0YSB9KTtcbiAgICB9O1xuXG4gICAgJC5nZXRKU09OQXNPYnNlcnZhYmxlID0gZnVuY3Rpb24odXJsLCBkYXRhKSB7XG4gICAgICAgIHJldHVybiBhamF4QXNPYnNlcnZhYmxlKHsgdXJsOiB1cmwsIGRhdGFUeXBlOiAnanNvbicsIGRhdGE6IGRhdGEgfSk7XG4gICAgfTtcblxuXG4gICAgJC5wb3N0QXNPYnNlcnZhYmxlID0gZnVuY3Rpb24odXJsLCBkYXRhLCBkYXRhVHlwZSkge1xuICAgICAgICByZXR1cm4gYWpheEFzT2JzZXJ2YWJsZSh7IHVybDogdXJsLCBkYXRhVHlwZTogZGF0YVR5cGUsIGRhdGE6IGRhdGEsIHR5cGU6ICdQT1NUJ30pO1x0XG4gICAgfTtcblxuICAgIHJldHVybiByb290O1xuXG59KSk7XG5cbn0pKCkiLCJ2YXIgSGFuZGxlYmFycyA9IHJlcXVpcmUoJ2hhbmRsZWJhcnMtcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICBcblxuXG4gIHJldHVybiBcIlxcbjxoMT5tYXRjaCBpbiBwcm9ncmVzczwvaDE+XFxuXFxuPHA+XFxuICBBcyBzb29uIGFzIHRoZSBjdXJyZW50IG1hdGNoIGlzIGZpbmlzaGVkLFxcbiAgeW91J2xsIGJlIGFibGUgdG8gam9pbiB0aGUgYWN0aW9uIVxcbjwvcD5cXG5cIjtcbiAgfSk7XG4iLCJ2YXIgSGFuZGxlYmFycyA9IHJlcXVpcmUoJ2hhbmRsZWJhcnMtcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICBcblxuXG4gIHJldHVybiBcIlxcbjxoMT5SZWdpc3RlciBUbyBQbGF5PC9oMT5cXG5cXG48Zm9ybT5cXG4gIFxcbiAgPGRpdiBjbGFzcz1cXFwiZmllbGRcXFwiPlxcbiAgICA8bGFiZWw+Rmlyc3QgbmFtZTwvbGFiZWw+XFxuICAgIDxpbnB1dCBpZD1cXFwiZmlyc3ROYW1lXFxcIiB0eXBlPVxcXCJ0ZXh0XFxcIiB2YWx1ZT1cXFwiXFxcIiBhdXRvY29ycmVjdD1cXFwib2ZmXFxcIiAvPlxcbiAgPC9kaXY+XFxuICBcXG4gIDxkaXYgY2xhc3M9XFxcImZpZWxkXFxcIj5cXG4gICAgPGxhYmVsPkxhc3QgbmFtZTwvbGFiZWw+XFxuICAgIDxpbnB1dCBpZD1cXFwibGFzdE5hbWVcXFwiIHR5cGU9XFxcInRleHRcXFwiIHZhbHVlPVxcXCJcXFwiIGF1dG9jb3JyZWN0PVxcXCJvZmZcXFwiIC8+XFxuICA8L2Rpdj5cXG5cXG4gIDxkaXYgY2xhc3M9XFxcImZpZWxkXFxcIj5cXG4gICAgPGxhYmVsPkVtYWlsPC9sYWJlbD5cXG4gICAgPGlucHV0IGlkPVxcXCJlbWFpbFxcXCIgdHlwZT1cXFwiZW1haWxcXFwiIHZhbHVlPVxcXCJcXFwiIGF1dG9jb3JyZWN0PVxcXCJvZmZcXFwiIC8+XFxuICA8L2Rpdj5cXG4gIFxcbiAgPGRpdiBjbGFzcz1cXFwiZmllbGRcXFwiPlxcbiAgICA8bGFiZWw+Q29tcGFueTwvbGFiZWw+XFxuICAgIDxpbnB1dCBpZD1cXFwiY29tcGFueVxcXCIgdHlwZT1cXFwidGV4dFxcXCIgdmFsdWU9XFxcIlxcXCIgYXV0b2NvcnJlY3Q9XFxcIm9mZlxcXCIgLz5cXG4gIDwvZGl2PlxcbiAgXFxuICA8ZGl2IGNsYXNzPVxcXCJmaWVsZFxcXCI+XFxuICAgIDxsYWJlbD5Sb2xlPC9sYWJlbD5cXG5cdDxzZWxlY3QgcmVxdWlyZWQgaWQ9XFxcInJvbGVcXFwiPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU2VsZWN0IFJvbGVcXFwiIHNlbGVjdGVkPlNlbGVjdCBSb2xlPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJDLUxldmVsIEV4ZWN1dGl2ZVxcXCI+Qy1MZXZlbCBFeGVjdXRpdmU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlZQIG9yIERpcmVjdG9yXFxcIj5WUCBvciBEaXJlY3Rvcjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTWFuYWdlclxcXCI+TWFuYWdlcjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUHJvamVjdCBNYW5hZ2VyXFxcIj5Qcm9qZWN0IE1hbmFnZXI8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRlYW0gTGVhZFxcXCI+VGVhbSBMZWFkPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBcmNoaXRlY3RcXFwiPkFyY2hpdGVjdDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiRGV2ZWxvcGVyXFxcIj5EZXZlbG9wZXI8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkNvbnN1bHRhbnRcXFwiPkNvbnN1bHRhbnQ8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlN0dWRlbnRcXFwiPlN0dWRlbnQ8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlByZXNzL0FuYWx5c3RcXFwiPlByZXNzL0FuYWx5c3Q8L29wdGlvbj5cXG5cdDwvc2VsZWN0PlxcbiAgPC9kaXY+XFxuXFxuICA8ZGl2IGNsYXNzPVxcXCJmaWVsZFxcXCI+XFxuICAgIDxsYWJlbD5Db3VudHJ5PC9sYWJlbD5cXG5cdDxzZWxlY3QgcmVxdWlyZWQgaWQ9XFxcImNvdW50cnlcXFwiPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU2VsZWN0IENvdW50cnlcXFwiIHNlbGVjdGVkPlNlbGVjdCBDb3VudHJ5PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBRlxcXCI+QWZnaGFuaXN0YW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkFYXFxcIj7DhWxhbmQgSXNsYW5kczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQUxcXFwiPkFsYmFuaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkRaXFxcIj5BbGdlcmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBU1xcXCI+QW1lcmljYW4gU2Ftb2E8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkFEXFxcIj5BbmRvcnJhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBT1xcXCI+QW5nb2xhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBSVxcXCI+QW5ndWlsbGE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkFRXFxcIj5BbnRhcmN0aWNhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBR1xcXCI+QW50aWd1YSBhbmQgQmFyYnVkYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQVJcXFwiPkFyZ2VudGluYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQU1cXFwiPkFybWVuaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkFXXFxcIj5BcnViYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQVVcXFwiPkF1c3RyYWxpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQVRcXFwiPkF1c3RyaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkFaXFxcIj5BemVyYmFpamFuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCU1xcXCI+QmFoYW1hczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQkhcXFwiPkJhaHJhaW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJEXFxcIj5CYW5nbGFkZXNoPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCQlxcXCI+QmFyYmFkb3M8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJZXFxcIj5CZWxhcnVzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCRVxcXCI+QmVsZ2l1bTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQlpcXFwiPkJlbGl6ZTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQkpcXFwiPkJlbmluPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCTVxcXCI+QmVybXVkYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQlRcXFwiPkJodXRhbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQm9saXZpYVxcXCI+Qm9saXZpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQk9cXFwiPlBsdXJpbmF0aW9uYWwgU3RhdGUgb2Y8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJBXFxcIj5Cb3NuaWEgYW5kIEhlcnplZ292aW5hPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCV1xcXCI+Qm90c3dhbmE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJWXFxcIj5Cb3V2ZXQgSXNsYW5kPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCUlxcXCI+QnJhemlsPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJJT1xcXCI+QnJpdGlzaCBJbmRpYW4gT2NlYW4gVGVycml0b3J5PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCTlxcXCI+QnJ1bmVpIERhcnVzc2FsYW08L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJHXFxcIj5CdWxnYXJpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQkZcXFwiPkJ1cmtpbmEgRmFzbzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQklcXFwiPkJ1cnVuZGk8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIktIXFxcIj5DYW1ib2RpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQ01cXFwiPkNhbWVyb29uPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJDQVxcXCI+Q2FuYWRhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJDVlxcXCI+Q2FwZSBWZXJkZTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiS1lcXFwiPkNheW1hbiBJc2xhbmRzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJDRlxcXCI+Q2VudHJhbCBBZnJpY2FuIFJlcHVibGljPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJURFxcXCI+Q2hhZDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQ0xcXFwiPkNoaWxlPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJDTlxcXCI+Q2hpbmE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkNYXFxcIj5DaHJpc3RtYXMgSXNsYW5kPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJDQ1xcXCI+Q29jb3MgKEtlZWxpbmcpIElzbGFuZHM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkNPXFxcIj5Db2xvbWJpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiS01cXFwiPkNvbW9yb3M8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkNHXFxcIj5Db25nbzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQ29uZ29cXFwiPkNvbmdvPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJDRFxcXCI+VGhlIERlbW9jcmF0aWMgUmVwdWJsaWMgb2YgdGhlPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJDS1xcXCI+Q29vayBJc2xhbmRzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJDUlxcXCI+Q29zdGEgUmljYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQ0lcXFwiPkPDtHRlIEQnSXZvaXJlPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJIUlxcXCI+Q3JvYXRpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQ1VcXFwiPkN1YmE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkNZXFxcIj5DeXBydXM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkNaXFxcIj5DemVjaCBSZXB1YmxpYzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiREtcXFwiPkRlbm1hcms8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkRKXFxcIj5Eamlib3V0aTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiRE1cXFwiPkRvbWluaWNhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJET1xcXCI+RG9taW5pY2FuIFJlcHVibGljPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJFQ1xcXCI+RWN1YWRvcjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiRUdcXFwiPkVneXB0PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTVlxcXCI+RWwgU2FsdmFkb3I8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkdRXFxcIj5FcXVhdG9yaWFsIEd1aW5lYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiRVJcXFwiPkVyaXRyZWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkVFXFxcIj5Fc3RvbmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJFVFxcXCI+RXRoaW9waWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkZLXFxcIj5GYWxrbGFuZCBJc2xhbmRzIChNYWx2aW5hcyk8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkZPXFxcIj5GYXJvZSBJc2xhbmRzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJGSlxcXCI+RmlqaTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiRklcXFwiPkZpbmxhbmQ8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkZSXFxcIj5GcmFuY2U8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkdGXFxcIj5GcmVuY2ggR3VpYW5hPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJQRlxcXCI+RnJlbmNoIFBvbHluZXNpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVEZcXFwiPkZyZW5jaCBTb3V0aGVybiBUZXJyaXRvcmllczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR0FcXFwiPkdhYm9uPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHTVxcXCI+R2FtYmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHRVxcXCI+R2VvcmdpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiREVcXFwiPkdlcm1hbnk8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkdIXFxcIj5HaGFuYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR0lcXFwiPkdpYnJhbHRhcjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR1JcXFwiPkdyZWVjZTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR0xcXFwiPkdyZWVubGFuZDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR0RcXFwiPkdyZW5hZGE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkdQXFxcIj5HdWFkZWxvdXBlPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHVVxcXCI+R3VhbTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR1RcXFwiPkd1YXRlbWFsYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR0dcXFwiPkd1ZXJuc2V5PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHTlxcXCI+R3VpbmVhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHV1xcXCI+R3VpbmVhLUJpc3NhdTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR1lcXFwiPkd1eWFuYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSFRcXFwiPkhhaXRpPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJITVxcXCI+SGVhcmQgSXNsYW5kIGFuZCBNY0RvbmFsZCBJc2xhbmRzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJITlxcXCI+SG9uZHVyYXM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkhLXFxcIj5Ib25nIEtvbmc8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkhVXFxcIj5IdW5nYXJ5PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJJU1xcXCI+SWNlbGFuZDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSU5cXFwiPkluZGlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJJRFxcXCI+SW5kb25lc2lhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJJcmFuXFxcIj5JcmFuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJJUlxcXCI+SXNsYW1pYyBSZXB1YmxpYyBvZjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSVFcXFwiPklyYXE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIklFXFxcIj5JcmVsYW5kPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJJTVxcXCI+SXNsZSBvZiBNYW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIklMXFxcIj5Jc3JhZWw8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIklUXFxcIj5JdGFseTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSk1cXFwiPkphbWFpY2E8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkpQXFxcIj5KYXBhbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSkVcXFwiPkplcnNleTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSk9cXFwiPkpvcmRhbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiS1pcXFwiPkthemFraHN0YW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIktFXFxcIj5LZW55YTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiS0lcXFwiPktpcmliYXRpPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJLb3JlYVxcXCI+S29yZWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIktQXFxcIj5EZW1vY3JhdGljIFBlb3BsZSdzIFJlcHVibGljIG9mPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJLb3JlYVxcXCI+S29yZWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIktSXFxcIj5SZXB1YmxpYyBvZjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiS1dcXFwiPkt1d2FpdDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiS0dcXFwiPkt5cmd5enN0YW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkxBXFxcIj5MYW8gUGVvcGxlJ3MgRGVtb2NyYXRpYyBSZXB1YmxpYzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTFZcXFwiPkxhdHZpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTEJcXFwiPkxlYmFub248L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkxTXFxcIj5MZXNvdGhvPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJMUlxcXCI+TGliZXJpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTFlcXFwiPkxpYnlhbiBBcmFiIEphbWFoaXJpeWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkxJXFxcIj5MaWVjaHRlbnN0ZWluPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJMVFxcXCI+TGl0aHVhbmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJMVVxcXCI+THV4ZW1ib3VyZzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTU9cXFwiPk1hY2FvPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNYWNlZG9uaWFcXFwiPk1hY2Vkb25pYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTUtcXFwiPlRoZSBGb3JtZXIgWXVnb3NsYXYgUmVwdWJsaWMgb2Y8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1HXFxcIj5NYWRhZ2FzY2FyPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNV1xcXCI+TWFsYXdpPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNWVxcXCI+TWFsYXlzaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1WXFxcIj5NYWxkaXZlczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTUxcXFwiPk1hbGk8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1UXFxcIj5NYWx0YTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTUhcXFwiPk1hcnNoYWxsIElzbGFuZHM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1RXFxcIj5NYXJ0aW5pcXVlPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNUlxcXCI+TWF1cml0YW5pYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTVVcXFwiPk1hdXJpdGl1czwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiWVRcXFwiPk1heW90dGU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1YXFxcIj5NZXhpY288L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1pY3JvbmVzaWFcXFwiPk1pY3JvbmVzaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkZNXFxcIj5GZWRlcmF0ZWQgU3RhdGVzIG9mPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNb2xkb3ZhXFxcIj5Nb2xkb3ZhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNRFxcXCI+UmVwdWJsaWMgb2Y8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1DXFxcIj5Nb25hY288L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1OXFxcIj5Nb25nb2xpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTUVcXFwiPk1vbnRlbmVncm88L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1TXFxcIj5Nb250c2VycmF0PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNQVxcXCI+TW9yb2Njbzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTVpcXFwiPk1vemFtYmlxdWU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1NXFxcIj5NeWFubWFyPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJOQVxcXCI+TmFtaWJpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTlJcXFwiPk5hdXJ1PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJOUFxcXCI+TmVwYWw8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk5MXFxcIj5OZXRoZXJsYW5kczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQU5cXFwiPk5ldGhlcmxhbmRzIEFudGlsbGVzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJOQ1xcXCI+TmV3IENhbGVkb25pYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTlpcXFwiPk5ldyBaZWFsYW5kPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJOSVxcXCI+TmljYXJhZ3VhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJORVxcXCI+TmlnZXI8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk5HXFxcIj5OaWdlcmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJOVVxcXCI+Tml1ZTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTkZcXFwiPk5vcmZvbGsgSXNsYW5kPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNUFxcXCI+Tm9ydGhlcm4gTWFyaWFuYSBJc2xhbmRzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJOT1xcXCI+Tm9yd2F5PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJPTVxcXCI+T21hbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUEtcXFwiPlBha2lzdGFuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJQV1xcXCI+UGFsYXU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlBhbGVzdGluaWFuIFRlcnJpdG9yeVxcXCI+UGFsZXN0aW5pYW4gVGVycml0b3J5PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJQU1xcXCI+T2NjdXBpZWQ8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlBBXFxcIj5QYW5hbWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlBHXFxcIj5QYXB1YSBOZXcgR3VpbmVhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJQWVxcXCI+UGFyYWd1YXk8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlBFXFxcIj5QZXJ1PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJQSFxcXCI+UGhpbGlwcGluZXM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlBOXFxcIj5QaXRjYWlybjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUExcXFwiPlBvbGFuZDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUFRcXFwiPlBvcnR1Z2FsPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJQUlxcXCI+UHVlcnRvIFJpY288L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlFBXFxcIj5RYXRhcjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUkVcXFwiPlLDqXVuaW9uPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJST1xcXCI+Um9tYW5pYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUlVcXFwiPlJ1c3NpYW4gRmVkZXJhdGlvbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUldcXFwiPlJ3YW5kYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQkxcXFwiPlNhaW50IEJhcnRow6lsZW15PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTSFxcXCI+U2FpbnQgSGVsZW5hPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJLTlxcXCI+U2FpbnQgS2l0dHMgYW5kIE5ldmlzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJMQ1xcXCI+U2FpbnQgTHVjaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1GXFxcIj5TYWludCBNYXJ0aW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlBNXFxcIj5TYWludCBQaWVycmUgYW5kIE1pcXVlbG9uPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJWQ1xcXCI+U2FpbnQgVmluY2VudCBhbmQgVGhlIEdyZW5hZGluZXM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIldTXFxcIj5TYW1vYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU01cXFwiPlNhbiBNYXJpbm88L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNUXFxcIj5TYW8gVG9tZSBhbmQgUHJpbmNpcGU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNBXFxcIj5TYXVkaSBBcmFiaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNOXFxcIj5TZW5lZ2FsPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJSU1xcXCI+U2VyYmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTQ1xcXCI+U2V5Y2hlbGxlczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU0xcXFwiPlNpZXJyYSBMZW9uZTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU0dcXFwiPlNpbmdhcG9yZTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU0tcXFwiPlNsb3Zha2lhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTSVxcXCI+U2xvdmVuaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNCXFxcIj5Tb2xvbW9uIElzbGFuZHM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNPXFxcIj5Tb21hbGlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJaQVxcXCI+U291dGggQWZyaWNhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHU1xcXCI+U291dGggR2VvcmdpYSBhbmQgdGhlIFNvdXRoIFNhbmR3aWNoIElzbGFuZHM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkVTXFxcIj5TcGFpbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTEtcXFwiPlNyaSBMYW5rYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU0RcXFwiPlN1ZGFuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTUlxcXCI+U3VyaW5hbWU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNKXFxcIj5TdmFsYmFyZCBhbmQgSmFuIE1heWVuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTWlxcXCI+U3dhemlsYW5kPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTRVxcXCI+U3dlZGVuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJDSFxcXCI+U3dpdHplcmxhbmQ8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNZXFxcIj5TeXJpYW4gQXJhYiBSZXB1YmxpYzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVGFpd2FuXFxcIj5UYWl3YW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRXXFxcIj5Qcm92aW5jZSBvZiBDaGluYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVEpcXFwiPlRhamlraXN0YW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRhbnphbmlhXFxcIj5UYW56YW5pYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVFpcXFwiPlVuaXRlZCBSZXB1YmxpYyBvZjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVEhcXFwiPlRoYWlsYW5kPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJUTFxcXCI+VGltb3ItTGVzdGU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRHXFxcIj5Ub2dvPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJUS1xcXCI+VG9rZWxhdTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVE9cXFwiPlRvbmdhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJUVFxcXCI+VHJpbmlkYWQgYW5kIFRvYmFnbzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVE5cXFwiPlR1bmlzaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRSXFxcIj5UdXJrZXk8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRNXFxcIj5UdXJrbWVuaXN0YW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRDXFxcIj5UdXJrcyBhbmQgQ2FpY29zIElzbGFuZHM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRWXFxcIj5UdXZhbHU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlVHXFxcIj5VZ2FuZGE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlVBXFxcIj5Va3JhaW5lPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBRVxcXCI+VW5pdGVkIEFyYWIgRW1pcmF0ZXM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkdCXFxcIj5Vbml0ZWQgS2luZ2RvbTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVVNcXFwiPlVuaXRlZCBTdGF0ZXM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlVNXFxcIj5Vbml0ZWQgU3RhdGVzIE1pbm9yIE91dGx5aW5nIElzbGFuZHM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlVZXFxcIj5VcnVndWF5PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJVWlxcXCI+VXpiZWtpc3Rhbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVlVcXFwiPlZhbnVhdHU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlZBXFxcIj5WYXRpY2FuIENpdHkgU3RhdGUgKEhvbHkgU2VlKTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVmVuZXp1ZWxhXFxcIj5WZW5lenVlbGE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlZFXFxcIj5Cb2xpdmFyaWFuIFJlcHVibGljIG9mPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJWTlxcXCI+VmlldCBOYW08L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlZpcmdpbiBJc2xhbmRzXFxcIj5WaXJnaW4gSXNsYW5kczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVkdcXFwiPkJyaXRpc2g8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlZpcmdpbiBJc2xhbmRzXFxcIj5WaXJnaW4gSXNsYW5kczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVklcXFwiPlUuUy48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIldGXFxcIj5XYWxsaXMgYW5kIEZ1dHVuYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiRUhcXFwiPldlc3Rlcm4gU2FoYXJhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJZRVxcXCI+WWVtZW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlpNXFxcIj5aYW1iaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlpXXFxcIj5aaW1iYWJ3ZTwvb3B0aW9uPjwvc2VsZWN0PlxcbiAgPC9kaXY+XFxuICBcXG4gIDxidXR0b24+UGxheSE8L2J1dHRvbj5cXG4gIFxcbjwvZm9ybT5cXG5cIjtcbiAgfSk7XG4iLCJ2YXIgSGFuZGxlYmFycyA9IHJlcXVpcmUoJ2hhbmRsZWJhcnMtcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICBcblxuXG4gIHJldHVybiBcIlxcbjxoMT5QcmVzcyBzdGFydCB0byBqb2luIHRoZSBnYW1lPC9oMT5cXG5cXG48YnV0dG9uIGlkPVxcXCJqb2luXFxcIiBvbnRvdWNoc3RhcnQ9XFxcIlxcXCI+U3RhcnQ8L2J1dHRvbj5cXG5cIjtcbiAgfSk7XG4iLCJ2YXIgSGFuZGxlYmFycyA9IHJlcXVpcmUoJ2hhbmRsZWJhcnMtcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICBcblxuXG4gIHJldHVybiBcIjxkaXYgY2xhc3M9XFxcInBsYXllclxcXCI+XFxuIFxcbiAgPGRpdiBjbGFzcz1cXFwibGFuZHNjYXBlXFxcIj5cXG4gICAgPGRpdiBjbGFzcz1cXFwicm93XFxcIj5cXG4gICAgICA8ZGl2IGNsYXNzPVxcXCJidXR0b24gdXBcXFwiPjxpPlVQPC9pPjwvZGl2PlxcbiAgICAgIDxkaXYgY2xhc3M9XFxcImJ1dHRvbiBkb3duXFxcIj48aT5ET1dOPC9pPjwvZGl2PlxcbiAgICA8L2Rpdj5cXG4gIDwvZGl2PlxcbiBcXG4gIDxkaXYgY2xhc3M9XFxcInBvcnRyYWl0XFxcIj5cXG4gICAgPGRpdiBjbGFzcz1cXFwicm93XFxcIj5cXG4gICAgICA8ZGl2IGNsYXNzPVxcXCJidXR0b24gdXBcXFwiPjxpPlVQPC9pPjwvZGl2PlxcbiAgICA8L2Rpdj5cXG4gICAgPGRpdiBjbGFzcz1cXFwicm93XFxcIj5cXG4gICAgICA8ZGl2IGNsYXNzPVxcXCJidXR0b24gZG93blxcXCI+PGk+RE9XTjwvaT48L2Rpdj5cXG4gICAgPC9kaXY+XFxuICA8L2Rpdj5cXG5cXG48L2Rpdj5cXG5cIjtcbiAgfSk7XG4iLCJ2YXIgSGFuZGxlYmFycyA9IHJlcXVpcmUoJ2hhbmRsZWJhcnMtcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICBcblxuXG4gIHJldHVybiBcIlxcbjxoMT53YWl0aW5nIGZvciAybmQgcGxheWVyPC9oMT5cXG5cXG48YnV0dG9uIGlkPVxcXCJjYW5jZWxcXFwiIG9udG91Y2hzdGFydD1cXFwiXFxcIj5jYW5jZWw8L2J1dHRvbj5cXG5cIjtcbiAgfSk7XG4iLCJ2YXIgSGFuZGxlYmFycyA9IHJlcXVpcmUoJ2hhbmRsZWJhcnMtcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICBcblxuXG4gIHJldHVybiBcIlxcbjxoMT50aGFua3MgZm9yIHBsYXlpbmc8L2gxPlxcblxcbjxwPlxcbiAgYmUgc3VyZSB0byBhc2sgYWJvdXQgd2hhdCB3ZSBkbyZoZWxsaXA7IDxiciAvPlxcbiAgYW5kIGhvdyB3ZSBidWlsdCB0aGlzIGdhbWVcXG48L3A+XFxuXCI7XG4gIH0pO1xuIiwiKGZ1bmN0aW9uKGdsb2JhbCl7cmVxdWlyZShcIi4vcngubWluLmpzXCIpKGdsb2JhbCk7XHJcbnJlcXVpcmUoXCIuL3J4LmFnZ3JlZ2F0ZXMubWluLmpzXCIpKGdsb2JhbCk7XHJcbnJlcXVpcmUoXCIuL3J4LmNvaW5jaWRlbmNlLm1pbi5qc1wiKShnbG9iYWwpO1xyXG5yZXF1aXJlKFwiLi9yeC5qb2lucGF0dGVybnMubWluLmpzXCIpKGdsb2JhbCk7XHJcbnJlcXVpcmUoXCIuL3J4LnRpbWUubWluLmpzXCIpKGdsb2JhbCk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFJ4XHJcblxufSkod2luZG93KSIsIi8qXG5cbkNvcHlyaWdodCAoQykgMjAxMSBieSBZZWh1ZGEgS2F0elxuXG5QZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG5vZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG5pbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG50byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG5jb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbmZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG5cblRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluXG5hbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cblxuVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG5GSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbkFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbkxJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG5PVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG5USEUgU09GVFdBUkUuXG5cbiovXG5cbi8vIGxpYi9oYW5kbGViYXJzL2Jyb3dzZXItcHJlZml4LmpzXG52YXIgSGFuZGxlYmFycyA9IHt9O1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzO1xuXG4oZnVuY3Rpb24oSGFuZGxlYmFycywgdW5kZWZpbmVkKSB7XG47XG4vLyBsaWIvaGFuZGxlYmFycy9iYXNlLmpzXG5cbkhhbmRsZWJhcnMuVkVSU0lPTiA9IFwiMS4wLjBcIjtcbkhhbmRsZWJhcnMuQ09NUElMRVJfUkVWSVNJT04gPSA0O1xuXG5IYW5kbGViYXJzLlJFVklTSU9OX0NIQU5HRVMgPSB7XG4gIDE6ICc8PSAxLjAucmMuMicsIC8vIDEuMC5yYy4yIGlzIGFjdHVhbGx5IHJldjIgYnV0IGRvZXNuJ3QgcmVwb3J0IGl0XG4gIDI6ICc9PSAxLjAuMC1yYy4zJyxcbiAgMzogJz09IDEuMC4wLXJjLjQnLFxuICA0OiAnPj0gMS4wLjAnXG59O1xuXG5IYW5kbGViYXJzLmhlbHBlcnMgID0ge307XG5IYW5kbGViYXJzLnBhcnRpYWxzID0ge307XG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcsXG4gICAgZnVuY3Rpb25UeXBlID0gJ1tvYmplY3QgRnVuY3Rpb25dJyxcbiAgICBvYmplY3RUeXBlID0gJ1tvYmplY3QgT2JqZWN0XSc7XG5cbkhhbmRsZWJhcnMucmVnaXN0ZXJIZWxwZXIgPSBmdW5jdGlvbihuYW1lLCBmbiwgaW52ZXJzZSkge1xuICBpZiAodG9TdHJpbmcuY2FsbChuYW1lKSA9PT0gb2JqZWN0VHlwZSkge1xuICAgIGlmIChpbnZlcnNlIHx8IGZuKSB7IHRocm93IG5ldyBIYW5kbGViYXJzLkV4Y2VwdGlvbignQXJnIG5vdCBzdXBwb3J0ZWQgd2l0aCBtdWx0aXBsZSBoZWxwZXJzJyk7IH1cbiAgICBIYW5kbGViYXJzLlV0aWxzLmV4dGVuZCh0aGlzLmhlbHBlcnMsIG5hbWUpO1xuICB9IGVsc2Uge1xuICAgIGlmIChpbnZlcnNlKSB7IGZuLm5vdCA9IGludmVyc2U7IH1cbiAgICB0aGlzLmhlbHBlcnNbbmFtZV0gPSBmbjtcbiAgfVxufTtcblxuSGFuZGxlYmFycy5yZWdpc3RlclBhcnRpYWwgPSBmdW5jdGlvbihuYW1lLCBzdHIpIHtcbiAgaWYgKHRvU3RyaW5nLmNhbGwobmFtZSkgPT09IG9iamVjdFR5cGUpIHtcbiAgICBIYW5kbGViYXJzLlV0aWxzLmV4dGVuZCh0aGlzLnBhcnRpYWxzLCAgbmFtZSk7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5wYXJ0aWFsc1tuYW1lXSA9IHN0cjtcbiAgfVxufTtcblxuSGFuZGxlYmFycy5yZWdpc3RlckhlbHBlcignaGVscGVyTWlzc2luZycsIGZ1bmN0aW9uKGFyZykge1xuICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAyKSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJNaXNzaW5nIGhlbHBlcjogJ1wiICsgYXJnICsgXCInXCIpO1xuICB9XG59KTtcblxuSGFuZGxlYmFycy5yZWdpc3RlckhlbHBlcignYmxvY2tIZWxwZXJNaXNzaW5nJywgZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICB2YXIgaW52ZXJzZSA9IG9wdGlvbnMuaW52ZXJzZSB8fCBmdW5jdGlvbigpIHt9LCBmbiA9IG9wdGlvbnMuZm47XG5cbiAgdmFyIHR5cGUgPSB0b1N0cmluZy5jYWxsKGNvbnRleHQpO1xuXG4gIGlmKHR5cGUgPT09IGZ1bmN0aW9uVHlwZSkgeyBjb250ZXh0ID0gY29udGV4dC5jYWxsKHRoaXMpOyB9XG5cbiAgaWYoY29udGV4dCA9PT0gdHJ1ZSkge1xuICAgIHJldHVybiBmbih0aGlzKTtcbiAgfSBlbHNlIGlmKGNvbnRleHQgPT09IGZhbHNlIHx8IGNvbnRleHQgPT0gbnVsbCkge1xuICAgIHJldHVybiBpbnZlcnNlKHRoaXMpO1xuICB9IGVsc2UgaWYodHlwZSA9PT0gXCJbb2JqZWN0IEFycmF5XVwiKSB7XG4gICAgaWYoY29udGV4dC5sZW5ndGggPiAwKSB7XG4gICAgICByZXR1cm4gSGFuZGxlYmFycy5oZWxwZXJzLmVhY2goY29udGV4dCwgb3B0aW9ucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBpbnZlcnNlKHRoaXMpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gZm4oY29udGV4dCk7XG4gIH1cbn0pO1xuXG5IYW5kbGViYXJzLksgPSBmdW5jdGlvbigpIHt9O1xuXG5IYW5kbGViYXJzLmNyZWF0ZUZyYW1lID0gT2JqZWN0LmNyZWF0ZSB8fCBmdW5jdGlvbihvYmplY3QpIHtcbiAgSGFuZGxlYmFycy5LLnByb3RvdHlwZSA9IG9iamVjdDtcbiAgdmFyIG9iaiA9IG5ldyBIYW5kbGViYXJzLksoKTtcbiAgSGFuZGxlYmFycy5LLnByb3RvdHlwZSA9IG51bGw7XG4gIHJldHVybiBvYmo7XG59O1xuXG5IYW5kbGViYXJzLmxvZ2dlciA9IHtcbiAgREVCVUc6IDAsIElORk86IDEsIFdBUk46IDIsIEVSUk9SOiAzLCBsZXZlbDogMyxcblxuICBtZXRob2RNYXA6IHswOiAnZGVidWcnLCAxOiAnaW5mbycsIDI6ICd3YXJuJywgMzogJ2Vycm9yJ30sXG5cbiAgLy8gY2FuIGJlIG92ZXJyaWRkZW4gaW4gdGhlIGhvc3QgZW52aXJvbm1lbnRcbiAgbG9nOiBmdW5jdGlvbihsZXZlbCwgb2JqKSB7XG4gICAgaWYgKEhhbmRsZWJhcnMubG9nZ2VyLmxldmVsIDw9IGxldmVsKSB7XG4gICAgICB2YXIgbWV0aG9kID0gSGFuZGxlYmFycy5sb2dnZXIubWV0aG9kTWFwW2xldmVsXTtcbiAgICAgIGlmICh0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcgJiYgY29uc29sZVttZXRob2RdKSB7XG4gICAgICAgIGNvbnNvbGVbbWV0aG9kXS5jYWxsKGNvbnNvbGUsIG9iaik7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5IYW5kbGViYXJzLmxvZyA9IGZ1bmN0aW9uKGxldmVsLCBvYmopIHsgSGFuZGxlYmFycy5sb2dnZXIubG9nKGxldmVsLCBvYmopOyB9O1xuXG5IYW5kbGViYXJzLnJlZ2lzdGVySGVscGVyKCdlYWNoJywgZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICB2YXIgZm4gPSBvcHRpb25zLmZuLCBpbnZlcnNlID0gb3B0aW9ucy5pbnZlcnNlO1xuICB2YXIgaSA9IDAsIHJldCA9IFwiXCIsIGRhdGE7XG5cbiAgdmFyIHR5cGUgPSB0b1N0cmluZy5jYWxsKGNvbnRleHQpO1xuICBpZih0eXBlID09PSBmdW5jdGlvblR5cGUpIHsgY29udGV4dCA9IGNvbnRleHQuY2FsbCh0aGlzKTsgfVxuXG4gIGlmIChvcHRpb25zLmRhdGEpIHtcbiAgICBkYXRhID0gSGFuZGxlYmFycy5jcmVhdGVGcmFtZShvcHRpb25zLmRhdGEpO1xuICB9XG5cbiAgaWYoY29udGV4dCAmJiB0eXBlb2YgY29udGV4dCA9PT0gJ29iamVjdCcpIHtcbiAgICBpZihjb250ZXh0IGluc3RhbmNlb2YgQXJyYXkpe1xuICAgICAgZm9yKHZhciBqID0gY29udGV4dC5sZW5ndGg7IGk8ajsgaSsrKSB7XG4gICAgICAgIGlmIChkYXRhKSB7IGRhdGEuaW5kZXggPSBpOyB9XG4gICAgICAgIHJldCA9IHJldCArIGZuKGNvbnRleHRbaV0sIHsgZGF0YTogZGF0YSB9KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZm9yKHZhciBrZXkgaW4gY29udGV4dCkge1xuICAgICAgICBpZihjb250ZXh0Lmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICBpZihkYXRhKSB7IGRhdGEua2V5ID0ga2V5OyB9XG4gICAgICAgICAgcmV0ID0gcmV0ICsgZm4oY29udGV4dFtrZXldLCB7ZGF0YTogZGF0YX0pO1xuICAgICAgICAgIGkrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmKGkgPT09IDApe1xuICAgIHJldCA9IGludmVyc2UodGhpcyk7XG4gIH1cblxuICByZXR1cm4gcmV0O1xufSk7XG5cbkhhbmRsZWJhcnMucmVnaXN0ZXJIZWxwZXIoJ2lmJywgZnVuY3Rpb24oY29uZGl0aW9uYWwsIG9wdGlvbnMpIHtcbiAgdmFyIHR5cGUgPSB0b1N0cmluZy5jYWxsKGNvbmRpdGlvbmFsKTtcbiAgaWYodHlwZSA9PT0gZnVuY3Rpb25UeXBlKSB7IGNvbmRpdGlvbmFsID0gY29uZGl0aW9uYWwuY2FsbCh0aGlzKTsgfVxuXG4gIGlmKCFjb25kaXRpb25hbCB8fCBIYW5kbGViYXJzLlV0aWxzLmlzRW1wdHkoY29uZGl0aW9uYWwpKSB7XG4gICAgcmV0dXJuIG9wdGlvbnMuaW52ZXJzZSh0aGlzKTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gb3B0aW9ucy5mbih0aGlzKTtcbiAgfVxufSk7XG5cbkhhbmRsZWJhcnMucmVnaXN0ZXJIZWxwZXIoJ3VubGVzcycsIGZ1bmN0aW9uKGNvbmRpdGlvbmFsLCBvcHRpb25zKSB7XG4gIHJldHVybiBIYW5kbGViYXJzLmhlbHBlcnNbJ2lmJ10uY2FsbCh0aGlzLCBjb25kaXRpb25hbCwge2ZuOiBvcHRpb25zLmludmVyc2UsIGludmVyc2U6IG9wdGlvbnMuZm59KTtcbn0pO1xuXG5IYW5kbGViYXJzLnJlZ2lzdGVySGVscGVyKCd3aXRoJywgZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICB2YXIgdHlwZSA9IHRvU3RyaW5nLmNhbGwoY29udGV4dCk7XG4gIGlmKHR5cGUgPT09IGZ1bmN0aW9uVHlwZSkgeyBjb250ZXh0ID0gY29udGV4dC5jYWxsKHRoaXMpOyB9XG5cbiAgaWYgKCFIYW5kbGViYXJzLlV0aWxzLmlzRW1wdHkoY29udGV4dCkpIHJldHVybiBvcHRpb25zLmZuKGNvbnRleHQpO1xufSk7XG5cbkhhbmRsZWJhcnMucmVnaXN0ZXJIZWxwZXIoJ2xvZycsIGZ1bmN0aW9uKGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgdmFyIGxldmVsID0gb3B0aW9ucy5kYXRhICYmIG9wdGlvbnMuZGF0YS5sZXZlbCAhPSBudWxsID8gcGFyc2VJbnQob3B0aW9ucy5kYXRhLmxldmVsLCAxMCkgOiAxO1xuICBIYW5kbGViYXJzLmxvZyhsZXZlbCwgY29udGV4dCk7XG59KTtcbjtcbi8vIGxpYi9oYW5kbGViYXJzL3V0aWxzLmpzXG5cbnZhciBlcnJvclByb3BzID0gWydkZXNjcmlwdGlvbicsICdmaWxlTmFtZScsICdsaW5lTnVtYmVyJywgJ21lc3NhZ2UnLCAnbmFtZScsICdudW1iZXInLCAnc3RhY2snXTtcblxuSGFuZGxlYmFycy5FeGNlcHRpb24gPSBmdW5jdGlvbihtZXNzYWdlKSB7XG4gIHZhciB0bXAgPSBFcnJvci5wcm90b3R5cGUuY29uc3RydWN0b3IuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblxuICAvLyBVbmZvcnR1bmF0ZWx5IGVycm9ycyBhcmUgbm90IGVudW1lcmFibGUgaW4gQ2hyb21lIChhdCBsZWFzdCksIHNvIGBmb3IgcHJvcCBpbiB0bXBgIGRvZXNuJ3Qgd29yay5cbiAgZm9yICh2YXIgaWR4ID0gMDsgaWR4IDwgZXJyb3JQcm9wcy5sZW5ndGg7IGlkeCsrKSB7XG4gICAgdGhpc1tlcnJvclByb3BzW2lkeF1dID0gdG1wW2Vycm9yUHJvcHNbaWR4XV07XG4gIH1cbn07XG5IYW5kbGViYXJzLkV4Y2VwdGlvbi5wcm90b3R5cGUgPSBuZXcgRXJyb3IoKTtcblxuLy8gQnVpbGQgb3V0IG91ciBiYXNpYyBTYWZlU3RyaW5nIHR5cGVcbkhhbmRsZWJhcnMuU2FmZVN0cmluZyA9IGZ1bmN0aW9uKHN0cmluZykge1xuICB0aGlzLnN0cmluZyA9IHN0cmluZztcbn07XG5IYW5kbGViYXJzLlNhZmVTdHJpbmcucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLnN0cmluZy50b1N0cmluZygpO1xufTtcblxudmFyIGVzY2FwZSA9IHtcbiAgXCImXCI6IFwiJmFtcDtcIixcbiAgXCI8XCI6IFwiJmx0O1wiLFxuICBcIj5cIjogXCImZ3Q7XCIsXG4gICdcIic6IFwiJnF1b3Q7XCIsXG4gIFwiJ1wiOiBcIiYjeDI3O1wiLFxuICBcImBcIjogXCImI3g2MDtcIlxufTtcblxudmFyIGJhZENoYXJzID0gL1smPD5cIidgXS9nO1xudmFyIHBvc3NpYmxlID0gL1smPD5cIidgXS87XG5cbnZhciBlc2NhcGVDaGFyID0gZnVuY3Rpb24oY2hyKSB7XG4gIHJldHVybiBlc2NhcGVbY2hyXSB8fCBcIiZhbXA7XCI7XG59O1xuXG5IYW5kbGViYXJzLlV0aWxzID0ge1xuICBleHRlbmQ6IGZ1bmN0aW9uKG9iaiwgdmFsdWUpIHtcbiAgICBmb3IodmFyIGtleSBpbiB2YWx1ZSkge1xuICAgICAgaWYodmFsdWUuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICBvYmpba2V5XSA9IHZhbHVlW2tleV07XG4gICAgICB9XG4gICAgfVxuICB9LFxuXG4gIGVzY2FwZUV4cHJlc3Npb246IGZ1bmN0aW9uKHN0cmluZykge1xuICAgIC8vIGRvbid0IGVzY2FwZSBTYWZlU3RyaW5ncywgc2luY2UgdGhleSdyZSBhbHJlYWR5IHNhZmVcbiAgICBpZiAoc3RyaW5nIGluc3RhbmNlb2YgSGFuZGxlYmFycy5TYWZlU3RyaW5nKSB7XG4gICAgICByZXR1cm4gc3RyaW5nLnRvU3RyaW5nKCk7XG4gICAgfSBlbHNlIGlmIChzdHJpbmcgPT0gbnVsbCB8fCBzdHJpbmcgPT09IGZhbHNlKSB7XG4gICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG5cbiAgICAvLyBGb3JjZSBhIHN0cmluZyBjb252ZXJzaW9uIGFzIHRoaXMgd2lsbCBiZSBkb25lIGJ5IHRoZSBhcHBlbmQgcmVnYXJkbGVzcyBhbmRcbiAgICAvLyB0aGUgcmVnZXggdGVzdCB3aWxsIGRvIHRoaXMgdHJhbnNwYXJlbnRseSBiZWhpbmQgdGhlIHNjZW5lcywgY2F1c2luZyBpc3N1ZXMgaWZcbiAgICAvLyBhbiBvYmplY3QncyB0byBzdHJpbmcgaGFzIGVzY2FwZWQgY2hhcmFjdGVycyBpbiBpdC5cbiAgICBzdHJpbmcgPSBzdHJpbmcudG9TdHJpbmcoKTtcblxuICAgIGlmKCFwb3NzaWJsZS50ZXN0KHN0cmluZykpIHsgcmV0dXJuIHN0cmluZzsgfVxuICAgIHJldHVybiBzdHJpbmcucmVwbGFjZShiYWRDaGFycywgZXNjYXBlQ2hhcik7XG4gIH0sXG5cbiAgaXNFbXB0eTogZnVuY3Rpb24odmFsdWUpIHtcbiAgICBpZiAoIXZhbHVlICYmIHZhbHVlICE9PSAwKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGVsc2UgaWYodG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT09IFwiW29iamVjdCBBcnJheV1cIiAmJiB2YWx1ZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG59O1xuO1xuLy8gbGliL2hhbmRsZWJhcnMvcnVudGltZS5qc1xuXG5IYW5kbGViYXJzLlZNID0ge1xuICB0ZW1wbGF0ZTogZnVuY3Rpb24odGVtcGxhdGVTcGVjKSB7XG4gICAgLy8gSnVzdCBhZGQgd2F0ZXJcbiAgICB2YXIgY29udGFpbmVyID0ge1xuICAgICAgZXNjYXBlRXhwcmVzc2lvbjogSGFuZGxlYmFycy5VdGlscy5lc2NhcGVFeHByZXNzaW9uLFxuICAgICAgaW52b2tlUGFydGlhbDogSGFuZGxlYmFycy5WTS5pbnZva2VQYXJ0aWFsLFxuICAgICAgcHJvZ3JhbXM6IFtdLFxuICAgICAgcHJvZ3JhbTogZnVuY3Rpb24oaSwgZm4sIGRhdGEpIHtcbiAgICAgICAgdmFyIHByb2dyYW1XcmFwcGVyID0gdGhpcy5wcm9ncmFtc1tpXTtcbiAgICAgICAgaWYoZGF0YSkge1xuICAgICAgICAgIHByb2dyYW1XcmFwcGVyID0gSGFuZGxlYmFycy5WTS5wcm9ncmFtKGksIGZuLCBkYXRhKTtcbiAgICAgICAgfSBlbHNlIGlmICghcHJvZ3JhbVdyYXBwZXIpIHtcbiAgICAgICAgICBwcm9ncmFtV3JhcHBlciA9IHRoaXMucHJvZ3JhbXNbaV0gPSBIYW5kbGViYXJzLlZNLnByb2dyYW0oaSwgZm4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBwcm9ncmFtV3JhcHBlcjtcbiAgICAgIH0sXG4gICAgICBtZXJnZTogZnVuY3Rpb24ocGFyYW0sIGNvbW1vbikge1xuICAgICAgICB2YXIgcmV0ID0gcGFyYW0gfHwgY29tbW9uO1xuXG4gICAgICAgIGlmIChwYXJhbSAmJiBjb21tb24pIHtcbiAgICAgICAgICByZXQgPSB7fTtcbiAgICAgICAgICBIYW5kbGViYXJzLlV0aWxzLmV4dGVuZChyZXQsIGNvbW1vbik7XG4gICAgICAgICAgSGFuZGxlYmFycy5VdGlscy5leHRlbmQocmV0LCBwYXJhbSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgIH0sXG4gICAgICBwcm9ncmFtV2l0aERlcHRoOiBIYW5kbGViYXJzLlZNLnByb2dyYW1XaXRoRGVwdGgsXG4gICAgICBub29wOiBIYW5kbGViYXJzLlZNLm5vb3AsXG4gICAgICBjb21waWxlckluZm86IG51bGxcbiAgICB9O1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgdmFyIHJlc3VsdCA9IHRlbXBsYXRlU3BlYy5jYWxsKGNvbnRhaW5lciwgSGFuZGxlYmFycywgY29udGV4dCwgb3B0aW9ucy5oZWxwZXJzLCBvcHRpb25zLnBhcnRpYWxzLCBvcHRpb25zLmRhdGEpO1xuXG4gICAgICB2YXIgY29tcGlsZXJJbmZvID0gY29udGFpbmVyLmNvbXBpbGVySW5mbyB8fCBbXSxcbiAgICAgICAgICBjb21waWxlclJldmlzaW9uID0gY29tcGlsZXJJbmZvWzBdIHx8IDEsXG4gICAgICAgICAgY3VycmVudFJldmlzaW9uID0gSGFuZGxlYmFycy5DT01QSUxFUl9SRVZJU0lPTjtcblxuICAgICAgaWYgKGNvbXBpbGVyUmV2aXNpb24gIT09IGN1cnJlbnRSZXZpc2lvbikge1xuICAgICAgICBpZiAoY29tcGlsZXJSZXZpc2lvbiA8IGN1cnJlbnRSZXZpc2lvbikge1xuICAgICAgICAgIHZhciBydW50aW1lVmVyc2lvbnMgPSBIYW5kbGViYXJzLlJFVklTSU9OX0NIQU5HRVNbY3VycmVudFJldmlzaW9uXSxcbiAgICAgICAgICAgICAgY29tcGlsZXJWZXJzaW9ucyA9IEhhbmRsZWJhcnMuUkVWSVNJT05fQ0hBTkdFU1tjb21waWxlclJldmlzaW9uXTtcbiAgICAgICAgICB0aHJvdyBcIlRlbXBsYXRlIHdhcyBwcmVjb21waWxlZCB3aXRoIGFuIG9sZGVyIHZlcnNpb24gb2YgSGFuZGxlYmFycyB0aGFuIHRoZSBjdXJyZW50IHJ1bnRpbWUuIFwiK1xuICAgICAgICAgICAgICAgIFwiUGxlYXNlIHVwZGF0ZSB5b3VyIHByZWNvbXBpbGVyIHRvIGEgbmV3ZXIgdmVyc2lvbiAoXCIrcnVudGltZVZlcnNpb25zK1wiKSBvciBkb3duZ3JhZGUgeW91ciBydW50aW1lIHRvIGFuIG9sZGVyIHZlcnNpb24gKFwiK2NvbXBpbGVyVmVyc2lvbnMrXCIpLlwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFVzZSB0aGUgZW1iZWRkZWQgdmVyc2lvbiBpbmZvIHNpbmNlIHRoZSBydW50aW1lIGRvZXNuJ3Qga25vdyBhYm91dCB0aGlzIHJldmlzaW9uIHlldFxuICAgICAgICAgIHRocm93IFwiVGVtcGxhdGUgd2FzIHByZWNvbXBpbGVkIHdpdGggYSBuZXdlciB2ZXJzaW9uIG9mIEhhbmRsZWJhcnMgdGhhbiB0aGUgY3VycmVudCBydW50aW1lLiBcIitcbiAgICAgICAgICAgICAgICBcIlBsZWFzZSB1cGRhdGUgeW91ciBydW50aW1lIHRvIGEgbmV3ZXIgdmVyc2lvbiAoXCIrY29tcGlsZXJJbmZvWzFdK1wiKS5cIjtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG4gIH0sXG5cbiAgcHJvZ3JhbVdpdGhEZXB0aDogZnVuY3Rpb24oaSwgZm4sIGRhdGEgLyosICRkZXB0aCAqLykge1xuICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAzKTtcblxuICAgIHZhciBwcm9ncmFtID0gZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBbY29udGV4dCwgb3B0aW9ucy5kYXRhIHx8IGRhdGFdLmNvbmNhdChhcmdzKSk7XG4gICAgfTtcbiAgICBwcm9ncmFtLnByb2dyYW0gPSBpO1xuICAgIHByb2dyYW0uZGVwdGggPSBhcmdzLmxlbmd0aDtcbiAgICByZXR1cm4gcHJvZ3JhbTtcbiAgfSxcbiAgcHJvZ3JhbTogZnVuY3Rpb24oaSwgZm4sIGRhdGEpIHtcbiAgICB2YXIgcHJvZ3JhbSA9IGZ1bmN0aW9uKGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgICByZXR1cm4gZm4oY29udGV4dCwgb3B0aW9ucy5kYXRhIHx8IGRhdGEpO1xuICAgIH07XG4gICAgcHJvZ3JhbS5wcm9ncmFtID0gaTtcbiAgICBwcm9ncmFtLmRlcHRoID0gMDtcbiAgICByZXR1cm4gcHJvZ3JhbTtcbiAgfSxcbiAgbm9vcDogZnVuY3Rpb24oKSB7IHJldHVybiBcIlwiOyB9LFxuICBpbnZva2VQYXJ0aWFsOiBmdW5jdGlvbihwYXJ0aWFsLCBuYW1lLCBjb250ZXh0LCBoZWxwZXJzLCBwYXJ0aWFscywgZGF0YSkge1xuICAgIHZhciBvcHRpb25zID0geyBoZWxwZXJzOiBoZWxwZXJzLCBwYXJ0aWFsczogcGFydGlhbHMsIGRhdGE6IGRhdGEgfTtcblxuICAgIGlmKHBhcnRpYWwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgdGhyb3cgbmV3IEhhbmRsZWJhcnMuRXhjZXB0aW9uKFwiVGhlIHBhcnRpYWwgXCIgKyBuYW1lICsgXCIgY291bGQgbm90IGJlIGZvdW5kXCIpO1xuICAgIH0gZWxzZSBpZihwYXJ0aWFsIGluc3RhbmNlb2YgRnVuY3Rpb24pIHtcbiAgICAgIHJldHVybiBwYXJ0aWFsKGNvbnRleHQsIG9wdGlvbnMpO1xuICAgIH0gZWxzZSBpZiAoIUhhbmRsZWJhcnMuY29tcGlsZSkge1xuICAgICAgdGhyb3cgbmV3IEhhbmRsZWJhcnMuRXhjZXB0aW9uKFwiVGhlIHBhcnRpYWwgXCIgKyBuYW1lICsgXCIgY291bGQgbm90IGJlIGNvbXBpbGVkIHdoZW4gcnVubmluZyBpbiBydW50aW1lLW9ubHkgbW9kZVwiKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcGFydGlhbHNbbmFtZV0gPSBIYW5kbGViYXJzLmNvbXBpbGUocGFydGlhbCwge2RhdGE6IGRhdGEgIT09IHVuZGVmaW5lZH0pO1xuICAgICAgcmV0dXJuIHBhcnRpYWxzW25hbWVdKGNvbnRleHQsIG9wdGlvbnMpO1xuICAgIH1cbiAgfVxufTtcblxuSGFuZGxlYmFycy50ZW1wbGF0ZSA9IEhhbmRsZWJhcnMuVk0udGVtcGxhdGU7XG47XG4vLyBsaWIvaGFuZGxlYmFycy9icm93c2VyLXN1ZmZpeC5qc1xufSkoSGFuZGxlYmFycyk7XG47XG4iLCIvKlxuIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiAgQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiBUaGlzIGNvZGUgaXMgbGljZW5zZWQgYnkgTWljcm9zb2Z0IENvcnBvcmF0aW9uIHVuZGVyIHRoZSB0ZXJtc1xuIG9mIHRoZSBNSUNST1NPRlQgUkVBQ1RJVkUgRVhURU5TSU9OUyBGT1IgSkFWQVNDUklQVCBBTkQgLk5FVCBMSUJSQVJJRVMgTGljZW5zZS5cbiBTZWUgaHR0cDovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSUQ9MjIwNzYyLlxuKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oeCxuKXt2YXIgbSxpYT1mdW5jdGlvbigpe30sSj1mdW5jdGlvbigpe3JldHVybihuZXcgRGF0ZSkuZ2V0VGltZSgpfSxWPWZ1bmN0aW9uKGEsYil7cmV0dXJuIGE9PT1ifSxRPWZ1bmN0aW9uKGEpe3JldHVybiBhfSxXPWZ1bmN0aW9uKGEpe3JldHVybiBhLnRvU3RyaW5nKCl9LFg9T2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eSxvPWZ1bmN0aW9uKGEsYil7ZnVuY3Rpb24gYygpe3RoaXMuY29uc3RydWN0b3I9YX1mb3IodmFyIGQgaW4gYilYLmNhbGwoYixkKSYmKGFbZF09YltkXSk7Yy5wcm90b3R5cGU9Yi5wcm90b3R5cGU7YS5wcm90b3R5cGU9bmV3IGM7YS5iYXNlPWIucHJvdG90eXBlO3JldHVybiBhfSxFPWZ1bmN0aW9uKGEsYil7Zm9yKHZhciBjIGluIGIpWC5jYWxsKGIsYykmJihhW2NdPWJbY10pfSx5PUFycmF5LnByb3RvdHlwZS5zbGljZSxLPVwiT2JqZWN0IGhhcyBiZWVuIGRpc3Bvc2VkXCI7bT14LlJ4PXtJbnRlcm5hbHM6e319O20uVkVSU0lPTj1cIjEuMC4xMDYyMVwiO3ZhciBqYT1mdW5jdGlvbihhLGIpe3JldHVybiBpKGZ1bmN0aW9uKGMpe3JldHVybiBuZXcgcChiLmdldERpc3Bvc2FibGUoKSxhLnN1YnNjcmliZShjKSl9KX0sRj1mdW5jdGlvbihhLGIsYyl7cmV0dXJuIGkoZnVuY3Rpb24oZCl7dmFyIGU9bmV3IHYsZz1uZXcgdixkPWMoZCxlLGcpO2UuZGlzcG9zYWJsZShhLm1hdGVyaWFsaXplKCkuc2VsZWN0KGZ1bmN0aW9uKGIpe3JldHVybntzd2l0Y2hWYWx1ZTpmdW5jdGlvbihhKXtyZXR1cm4gYShiKX19fSkuc3Vic2NyaWJlKGQpKTtnLmRpc3Bvc2FibGUoYi5tYXRlcmlhbGl6ZSgpLnNlbGVjdChmdW5jdGlvbihiKXtyZXR1cm57c3dpdGNoVmFsdWU6ZnVuY3Rpb24oYSxjKXtyZXR1cm4gYyhiKX19fSkuc3Vic2NyaWJlKGQpKTtyZXR1cm4gbmV3IHAoZSxnKX0pfSx1PW0uSW50ZXJuYWxzLkxpc3Q9XG5mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYil7dGhpcy5jb21wYXJlcj1ifHxWO3RoaXMuc2l6ZT0wO3RoaXMuaXRlbXM9W119YS5mcm9tQXJyYXk9ZnVuY3Rpb24oYixjKXt2YXIgZCxlPWIubGVuZ3RoLGc9bmV3IGEoYyk7Zm9yKGQ9MDtkPGU7ZCsrKWcuYWRkKGJbZF0pO3JldHVybiBnfTthLnByb3RvdHlwZS5jb3VudD1mdW5jdGlvbigpe3JldHVybiB0aGlzLnNpemV9O2EucHJvdG90eXBlLmFkZD1mdW5jdGlvbihiKXt0aGlzLml0ZW1zW3RoaXMuc2l6ZV09Yjt0aGlzLnNpemUrK307YS5wcm90b3R5cGUucmVtb3ZlQXQ9ZnVuY3Rpb24oYil7aWYoMD5ifHxiPj10aGlzLnNpemUpdGhyb3cgRXJyb3IoXCJBcmd1bWVudCBvdXQgb2YgcmFuZ2VcIik7MD09PWI/dGhpcy5pdGVtcy5zaGlmdCgpOnRoaXMuaXRlbXMuc3BsaWNlKGIsMSk7dGhpcy5zaXplLS19O2EucHJvdG90eXBlLmluZGV4T2Y9ZnVuY3Rpb24oYil7dmFyIGEsZDtmb3IoYT0wO2E8dGhpcy5pdGVtcy5sZW5ndGg7YSsrKWlmKGQ9XG50aGlzLml0ZW1zW2FdLHRoaXMuY29tcGFyZXIoYixkKSlyZXR1cm4gYTtyZXR1cm4tMX07YS5wcm90b3R5cGUucmVtb3ZlPWZ1bmN0aW9uKGIpe2I9dGhpcy5pbmRleE9mKGIpO2lmKC0xPT09YilyZXR1cm4hMTt0aGlzLnJlbW92ZUF0KGIpO3JldHVybiEwfTthLnByb3RvdHlwZS5jbGVhcj1mdW5jdGlvbigpe3RoaXMuaXRlbXM9W107dGhpcy5zaXplPTB9O2EucHJvdG90eXBlLml0ZW09ZnVuY3Rpb24oYixhKXtpZigwPmJ8fGI+PWNvdW50KXRocm93IEVycm9yKFwiQXJndW1lbnQgb3V0IG9mIHJhbmdlXCIpO2lmKGE9PT1uKXJldHVybiB0aGlzLml0ZW1zW2JdO3RoaXMuaXRlbXNbYl09YX07YS5wcm90b3R5cGUudG9BcnJheT1mdW5jdGlvbigpe3ZhciBiPVtdLGE7Zm9yKGE9MDthPHRoaXMuaXRlbXMubGVuZ3RoO2ErKyliLnB1c2godGhpcy5pdGVtc1thXSk7cmV0dXJuIGJ9O2EucHJvdG90eXBlLmNvbnRhaW5zPWZ1bmN0aW9uKGIpe2Zvcih2YXIgYT0wO2E8dGhpcy5pdGVtcy5sZW5ndGg7YSsrKWlmKHRoaXMuY29tcGFyZXIoYixcbnRoaXMuaXRlbXNbYV0pKXJldHVybiEwO3JldHVybiExfTtyZXR1cm4gYX0oKSxrYT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYixhKXt0aGlzLmlkPWI7dGhpcy52YWx1ZT1hfWEucHJvdG90eXBlLmNvbXBhcmVUbz1mdW5jdGlvbihiKXt2YXIgYT10aGlzLnZhbHVlLmNvbXBhcmVUbyhiLnZhbHVlKTswPT09YSYmKGE9dGhpcy5pZC1iLmlkKTtyZXR1cm4gYX07cmV0dXJuIGF9KCksWT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYil7dGhpcy5pdGVtcz1BcnJheShiKTt0aGlzLnNpemU9MH1hLnByb3RvdHlwZS5jb3VudD1mdW5jdGlvbigpe3JldHVybiB0aGlzLnNpemV9O2EucHJvdG90eXBlLmlzSGlnaGVyUHJpb3JpdHk9ZnVuY3Rpb24oYixhKXtyZXR1cm4gMD50aGlzLml0ZW1zW2JdLmNvbXBhcmVUbyh0aGlzLml0ZW1zW2FdKX07YS5wcm90b3R5cGUucGVyY29sYXRlPWZ1bmN0aW9uKGIpe3ZhciBhLGQ7aWYoIShiPj10aGlzLnNpemV8fDA+YikpaWYoYT1NYXRoLmZsb29yKChiLTEpL1xuMiksISgwPmF8fGE9PT1iKSYmdGhpcy5pc0hpZ2hlclByaW9yaXR5KGIsYSkpZD10aGlzLml0ZW1zW2JdLHRoaXMuaXRlbXNbYl09dGhpcy5pdGVtc1thXSx0aGlzLml0ZW1zW2FdPWQsdGhpcy5wZXJjb2xhdGUoYSl9O2EucHJvdG90eXBlLmhlYXBpZnk9ZnVuY3Rpb24oYil7dmFyIGEsZCxlO2I9PT1uJiYoYj0wKTtiPj10aGlzLnNpemV8fDA+Ynx8KGQ9MipiKzEsZT0yKmIrMixhPWIsZDx0aGlzLnNpemUmJnRoaXMuaXNIaWdoZXJQcmlvcml0eShkLGEpJiYoYT1kKSxlPHRoaXMuc2l6ZSYmdGhpcy5pc0hpZ2hlclByaW9yaXR5KGUsYSkmJihhPWUpLGEhPT1iJiYoZD10aGlzLml0ZW1zW2JdLHRoaXMuaXRlbXNbYl09dGhpcy5pdGVtc1thXSx0aGlzLml0ZW1zW2FdPWQsdGhpcy5oZWFwaWZ5KGEpKSl9O2EucHJvdG90eXBlLnBlZWs9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5pdGVtc1swXS52YWx1ZX07YS5wcm90b3R5cGUucmVtb3ZlQXQ9ZnVuY3Rpb24oYil7dGhpcy5pdGVtc1tiXT1cbnRoaXMuaXRlbXNbLS10aGlzLnNpemVdO2RlbGV0ZSB0aGlzLml0ZW1zW3RoaXMuc2l6ZV07dGhpcy5oZWFwaWZ5KCk7aWYodGhpcy5zaXplPHRoaXMuaXRlbXMubGVuZ3RoPj4yKWZvcih2YXIgYj10aGlzLml0ZW1zLGE9dGhpcy5pdGVtcz1BcnJheSh0aGlzLml0ZW1zLmxlbmd0aD4+MSksZD10aGlzLnNpemU7MDxkOylhW2QrMC0xXT1iW2QrMC0xXSxkLS19O2EucHJvdG90eXBlLmRlcXVldWU9ZnVuY3Rpb24oKXt2YXIgYj10aGlzLnBlZWsoKTt0aGlzLnJlbW92ZUF0KDApO3JldHVybiBifTthLnByb3RvdHlwZS5lbnF1ZXVlPWZ1bmN0aW9uKGIpe3ZhciBjO2lmKHRoaXMuc2l6ZT49dGhpcy5pdGVtcy5sZW5ndGgpe2M9dGhpcy5pdGVtcztmb3IodmFyIGQ9dGhpcy5pdGVtcz1BcnJheSgyKnRoaXMuaXRlbXMubGVuZ3RoKSxlPWMubGVuZ3RoOzA8ZTspZFtlKzAtMV09Y1tlKzAtMV0sZS0tfWM9dGhpcy5zaXplKys7dGhpcy5pdGVtc1tjXT1uZXcga2EoYS5jb3VudCsrLGIpO3RoaXMucGVyY29sYXRlKGMpfTtcbmEucHJvdG90eXBlLnJlbW92ZT1mdW5jdGlvbihiKXt2YXIgYTtmb3IoYT0wO2E8dGhpcy5zaXplO2ErKylpZih0aGlzLml0ZW1zW2FdLnZhbHVlPT09YilyZXR1cm4gdGhpcy5yZW1vdmVBdChhKSwhMDtyZXR1cm4hMX07YS5jb3VudD0wO3JldHVybiBhfSgpLHA9bS5Db21wb3NpdGVEaXNwb3NhYmxlPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYSgpe3ZhciBiPSExLGE9dS5mcm9tQXJyYXkoeS5jYWxsKGFyZ3VtZW50cykpO3RoaXMuY291bnQ9ZnVuY3Rpb24oKXtyZXR1cm4gYS5jb3VudCgpfTt0aGlzLmFkZD1mdW5jdGlvbihkKXtiP2QuZGlzcG9zZSgpOmEuYWRkKGQpfTt0aGlzLnJlbW92ZT1mdW5jdGlvbihkKXt2YXIgZT0hMTtifHwoZT1hLnJlbW92ZShkKSk7ZSYmZC5kaXNwb3NlKCk7cmV0dXJuIGV9O3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe3ZhciBkLGU7Ynx8KGI9ITAsZD1hLnRvQXJyYXkoKSxhLmNsZWFyKCkpO2lmKGQhPT1uKWZvcihlPTA7ZTxkLmxlbmd0aDtlKyspZFtlXS5kaXNwb3NlKCl9O1xudGhpcy5jbGVhcj1mdW5jdGlvbigpe3ZhciBiLGU7Yj1hLnRvQXJyYXkoKTthLmNsZWFyKCk7Zm9yKGU9MDtlPGIubGVuZ3RoO2UrKyliW2VdLmRpc3Bvc2UoKX07dGhpcy5jb250YWlucz1mdW5jdGlvbihiKXtyZXR1cm4gYS5jb250YWlucyhiKX07dGhpcy5pc0Rpc3Bvc2VkPWZ1bmN0aW9uKCl7cmV0dXJuIGJ9O3RoaXMudG9BcnJheT1mdW5jdGlvbigpe3JldHVybiBhLnRvQXJyYXkoKX19YS5wcm90b3R5cGUuY291bnQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5jb3VudCgpfTthLnByb3RvdHlwZS5hZGQ9ZnVuY3Rpb24oYil7dGhpcy5hZGQoYil9O2EucHJvdG90eXBlLnJlbW92ZT1mdW5jdGlvbihiKXt0aGlzLnJlbW92ZShiKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe3RoaXMuZGlzcG9zZSgpfTthLnByb3RvdHlwZS5jbGVhcj1mdW5jdGlvbigpe3RoaXMuY2xlYXIoKX07YS5wcm90b3R5cGUuY29udGFpbnM9ZnVuY3Rpb24oYil7cmV0dXJuIHRoaXMuY29udGFpbnMoYil9O1xuYS5wcm90b3R5cGUuaXNEaXNwb3NlZD1mdW5jdGlvbigpe3JldHVybiB0aGlzLmlzRGlzcG9zZWQoKX07YS5wcm90b3R5cGUudG9BcnJheT1mdW5jdGlvbigpe3JldHVybiB0aGlzLnRvQXJyYXkoKX07cmV0dXJuIGF9KCksTD1tLkRpc3Bvc2FibGU9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGIpe3ZhciBhPSExO3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe2F8fChiKCksYT0hMCl9fWEucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXt0aGlzLmRpc3Bvc2UoKX07cmV0dXJuIGF9KCksQT1MLmNyZWF0ZT1mdW5jdGlvbihhKXtyZXR1cm4gbmV3IEwoYSl9LHc9TC5lbXB0eT1uZXcgTChmdW5jdGlvbigpe30pLHY9bS5TaW5nbGVBc3NpZ25tZW50RGlzcG9zYWJsZT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXt2YXIgYj0hMSxhPW51bGw7dGhpcy5pc0Rpc3Bvc2VkPWZ1bmN0aW9uKCl7cmV0dXJuIGJ9O3RoaXMuZ2V0RGlzcG9zYWJsZT1mdW5jdGlvbigpe3JldHVybiBhfTt0aGlzLnNldERpc3Bvc2FibGU9XG5mdW5jdGlvbihkKXtpZihudWxsIT09YSl0aHJvdyBFcnJvcihcIkRpc3Bvc2FibGUgaGFzIGFscmVhZHkgYmVlbiBhc3NpZ25lZFwiKTt2YXIgZT1iO2V8fChhPWQpO2UmJm51bGwhPT1kJiZkLmRpc3Bvc2UoKX07dGhpcy5kaXNwb3NlPWZ1bmN0aW9uKCl7dmFyIGQ9bnVsbDtifHwoYj0hMCxkPWEsYT1udWxsKTtudWxsIT09ZCYmZC5kaXNwb3NlKCl9fWEucHJvdG90eXBlLmlzRGlzcG9zZWQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5pc0Rpc3Bvc2VkKCl9O2EucHJvdG90eXBlLmRpc3Bvc2FibGU9ZnVuY3Rpb24oYil7aWYoYj09PW4pcmV0dXJuIHRoaXMuZ2V0RGlzcG9zYWJsZSgpO3RoaXMuc2V0RGlzcG9zYWJsZShiKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe3RoaXMuZGlzcG9zZSgpfTtyZXR1cm4gYX0oKSxDPW0uU2VyaWFsRGlzcG9zYWJsZT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXt2YXIgYj0hMSxhPW51bGw7dGhpcy5pc0Rpc3Bvc2VkPWZ1bmN0aW9uKCl7cmV0dXJuIGJ9O1xudGhpcy5nZXREaXNwb3NhYmxlPWZ1bmN0aW9uKCl7cmV0dXJuIGF9O3RoaXMuc2V0RGlzcG9zYWJsZT1mdW5jdGlvbihkKXt2YXIgZT1iLGc9bnVsbDtlfHwoZz1hLGE9ZCk7bnVsbCE9PWcmJmcuZGlzcG9zZSgpO2UmJm51bGwhPT1kJiZkLmRpc3Bvc2UoKX07dGhpcy5kaXNwb3NlPWZ1bmN0aW9uKCl7dmFyIGQ9bnVsbDtifHwoYj0hMCxkPWEsYT1udWxsKTtudWxsIT09ZCYmZC5kaXNwb3NlKCl9fWEucHJvdG90eXBlLmlzRGlzcG9zZWQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5pc0Rpc3Bvc2VkKCl9O2EucHJvdG90eXBlLmRpc3Bvc2FibGU9ZnVuY3Rpb24oYSl7aWYoYT09PW4pcmV0dXJuIHRoaXMuZ2V0RGlzcG9zYWJsZSgpO3RoaXMuc2V0RGlzcG9zYWJsZShhKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe3RoaXMuZGlzcG9zZSgpfTthLnByb3RvdHlwZS5kaXNwb3NlPWZ1bmN0aW9uKCl7dGhpcy5kaXNwb3NlKCl9O3JldHVybiBhfSgpLFo9bS5SZWZDb3VudERpc3Bvc2FibGU9XG5mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYSl7dmFyIGM9ITEsZD0hMSxlPTA7dGhpcy5kaXNwb3NlPWZ1bmN0aW9uKCl7dmFyIGc9ITE7IWMmJiFkJiYoZD0hMCwwPT09ZSYmKGc9Yz0hMCkpO2cmJmEuZGlzcG9zZSgpfTt0aGlzLmdldERpc3Bvc2FibGU9ZnVuY3Rpb24oKXtpZihjKXJldHVybiB3O2UrKzt2YXIgZz0hMTtyZXR1cm57ZGlzcG9zZTpmdW5jdGlvbigpe3ZhciBoPSExOyFjJiYhZyYmKGc9ITAsZS0tLDA9PT1lJiZkJiYoaD1jPSEwKSk7aCYmYS5kaXNwb3NlKCl9fX07dGhpcy5pc0Rpc3Bvc2VkPWZ1bmN0aW9uKCl7cmV0dXJuIGN9fWEucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXt0aGlzLmRpc3Bvc2UoKX07YS5wcm90b3R5cGUuZ2V0RGlzcG9zYWJsZT1mdW5jdGlvbigpe3JldHVybiB0aGlzLmdldERpc3Bvc2FibGUoKX07YS5wcm90b3R5cGUuaXNEaXNwb3NlZD1mdW5jdGlvbigpe3JldHVybiB0aGlzLmlzRGlzcG9zZWQoKX07cmV0dXJuIGF9KCksUjtSPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShhLFxuYyxkLGUsZyl7dGhpcy5zY2hlZHVsZXI9YTt0aGlzLnN0YXRlPWM7dGhpcy5hY3Rpb249ZDt0aGlzLmR1ZVRpbWU9ZTt0aGlzLmNvbXBhcmVyPWd8fGZ1bmN0aW9uKGEsYil7cmV0dXJuIGEtYn07dGhpcy5kaXNwb3NhYmxlPW5ldyB2fWEucHJvdG90eXBlLmludm9rZT1mdW5jdGlvbigpe3JldHVybiB0aGlzLmRpc3Bvc2FibGUuZGlzcG9zYWJsZSh0aGlzLmludm9rZUNvcmUoKSl9O2EucHJvdG90eXBlLmNvbXBhcmVUbz1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5jb21wYXJlcih0aGlzLmR1ZVRpbWUsYS5kdWVUaW1lKX07YS5wcm90b3R5cGUuaXNDYW5jZWxsZWQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5kaXNwb3NhYmxlLmlzRGlzcG9zZWQoKX07YS5wcm90b3R5cGUuaW52b2tlQ29yZT1mdW5jdGlvbigpe3JldHVybiB0aGlzLmFjdGlvbih0aGlzLnNjaGVkdWxlcix0aGlzLnN0YXRlKX07cmV0dXJuIGF9KCk7dmFyIHM9bS5TY2hlZHVsZXI9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGEsXG5iLGMsZCl7dGhpcy5ub3c9YTt0aGlzLl9zY2hlZHVsZT1iO3RoaXMuX3NjaGVkdWxlUmVsYXRpdmU9Yzt0aGlzLl9zY2hlZHVsZUFic29sdXRlPWR9dmFyIGI9ZnVuY3Rpb24oYSxiKXt2YXIgYyxkLGUsaztkPW5ldyBwO2s9Yi5maXJzdDtjPWIuc2Vjb25kO2U9bnVsbDtlPWZ1bmN0aW9uKGIpe2MoYixmdW5jdGlvbihiKXt2YXIgYyxoLGw7bD1oPSExO2M9bnVsbDtjPWEuc2NoZWR1bGVXaXRoU3RhdGUoYixmdW5jdGlvbihhLGIpe2g/ZC5yZW1vdmUoYyk6bD0hMDtlKGIpO3JldHVybiB3fSk7bHx8KGQuYWRkKGMpLGg9ITApfSl9O2Uoayk7cmV0dXJuIGR9LGM9ZnVuY3Rpb24oYSxiKXt2YXIgYyxkLGUsaztkPW5ldyBwO2s9Yi5maXJzdDtjPWIuc2Vjb25kO2U9ZnVuY3Rpb24oYil7YyhiLGZ1bmN0aW9uKGIsYyl7dmFyIGgsbCxrO2s9bD0hMTtoPWEuc2NoZWR1bGVXaXRoUmVsYXRpdmVBbmRTdGF0ZShiLGMsZnVuY3Rpb24oYSxiKXtsP2QucmVtb3ZlKGgpOms9ITA7ZShiKTtyZXR1cm4gd30pO1xua3x8KGQuYWRkKGgpLGw9ITApfSl9O2Uoayk7cmV0dXJuIGR9LGQ9ZnVuY3Rpb24oYSxiKXt2YXIgYyxkLGUsaztkPW5ldyBwO2s9Yi5maXJzdDtjPWIuc2Vjb25kO2U9ZnVuY3Rpb24oYil7YyhiLGZ1bmN0aW9uKGIsYyl7dmFyIGg9ITEsbD0hMSxrPWEuc2NoZWR1bGVXaXRoQWJzb2x1dGVBbmRTdGF0ZShiLGMsZnVuY3Rpb24oYSxiKXtoP2QucmVtb3ZlKGspOmw9ITA7ZShiKTtyZXR1cm4gd30pO2x8fChkLmFkZChrKSxoPSEwKX0pfTtlKGspO3JldHVybiBkfSxlPWZ1bmN0aW9uKGEsYil7YigpO3JldHVybiB3fTthLnByb3RvdHlwZS5zY2hlZHVsZT1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5fc2NoZWR1bGUoYSxlKX07YS5wcm90b3R5cGUuc2NoZWR1bGVXaXRoU3RhdGU9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gdGhpcy5fc2NoZWR1bGUoYSxiKX07YS5wcm90b3R5cGUuc2NoZWR1bGVXaXRoUmVsYXRpdmU9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gdGhpcy5fc2NoZWR1bGVSZWxhdGl2ZShiLFxuYSxlKX07YS5wcm90b3R5cGUuc2NoZWR1bGVXaXRoUmVsYXRpdmVBbmRTdGF0ZT1mdW5jdGlvbihhLGIsYyl7cmV0dXJuIHRoaXMuX3NjaGVkdWxlUmVsYXRpdmUoYSxiLGMpfTthLnByb3RvdHlwZS5zY2hlZHVsZVdpdGhBYnNvbHV0ZT1mdW5jdGlvbihhLGIpe3JldHVybiB0aGlzLl9zY2hlZHVsZUFic29sdXRlKGIsYSxlKX07YS5wcm90b3R5cGUuc2NoZWR1bGVXaXRoQWJzb2x1dGVBbmRTdGF0ZT1mdW5jdGlvbihhLGIsYyl7cmV0dXJuIHRoaXMuX3NjaGVkdWxlQWJzb2x1dGUoYSxiLGMpfTthLnByb3RvdHlwZS5zY2hlZHVsZVJlY3Vyc2l2ZT1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhTdGF0ZShhLGZ1bmN0aW9uKGEsYil7YShmdW5jdGlvbigpe2IoYSl9KX0pfTthLnByb3RvdHlwZS5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhTdGF0ZT1mdW5jdGlvbihhLGMpe3JldHVybiB0aGlzLnNjaGVkdWxlV2l0aFN0YXRlKHtmaXJzdDphLHNlY29uZDpjfSxcbmZ1bmN0aW9uKGEsYyl7cmV0dXJuIGIoYSxjKX0pfTthLnByb3RvdHlwZS5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhSZWxhdGl2ZT1mdW5jdGlvbihhLGIpe3JldHVybiB0aGlzLnNjaGVkdWxlUmVjdXJzaXZlV2l0aFJlbGF0aXZlQW5kU3RhdGUoYixhLGZ1bmN0aW9uKGEsYil7YShmdW5jdGlvbihjKXtiKGEsYyl9KX0pfTthLnByb3RvdHlwZS5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhSZWxhdGl2ZUFuZFN0YXRlPWZ1bmN0aW9uKGEsYixkKXtyZXR1cm4gdGhpcy5fc2NoZWR1bGVSZWxhdGl2ZSh7Zmlyc3Q6YSxzZWNvbmQ6ZH0sYixmdW5jdGlvbihhLGIpe3JldHVybiBjKGEsYil9KX07YS5wcm90b3R5cGUuc2NoZWR1bGVSZWN1cnNpdmVXaXRoQWJzb2x1dGU9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gdGhpcy5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhBYnNvbHV0ZUFuZFN0YXRlKGIsYSxmdW5jdGlvbihhLGIpe2EoZnVuY3Rpb24oYyl7YihhLGMpfSl9KX07YS5wcm90b3R5cGUuc2NoZWR1bGVSZWN1cnNpdmVXaXRoQWJzb2x1dGVBbmRTdGF0ZT1cbmZ1bmN0aW9uKGEsYixjKXtyZXR1cm4gdGhpcy5fc2NoZWR1bGVBYnNvbHV0ZSh7Zmlyc3Q6YSxzZWNvbmQ6Y30sYixmdW5jdGlvbihhLGIpe3JldHVybiBkKGEsYil9KX07YS5ub3c9SjthLm5vcm1hbGl6ZT1mdW5jdGlvbihhKXswPmEmJihhPTApO3JldHVybiBhfTtyZXR1cm4gYX0oKSxmPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYSgpe3ZhciBiPXRoaXM7YS5iYXNlLmNvbnN0cnVjdG9yLmNhbGwodGhpcyxKLGZ1bmN0aW9uKGEsZCl7cmV0dXJuIGQoYixhKX0sZnVuY3Rpb24oYSxkLGUpe2Zvcig7MDxzLm5vcm1hbGl6ZShkKTspO3JldHVybiBlKGIsYSl9LGZ1bmN0aW9uKGEsZCxlKXtyZXR1cm4gYi5zY2hlZHVsZVdpdGhSZWxhdGl2ZUFuZFN0YXRlKGEsZC1iLm5vdygpLGUpfSl9byhhLHMpO3JldHVybiBhfSgpLEI9cy5JbW1lZGlhdGU9bmV3IGYsbGE9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKCl7TS5xdWV1ZT1uZXcgWSg0KX1hLnByb3RvdHlwZS5kaXNwb3NlPWZ1bmN0aW9uKCl7TS5xdWV1ZT1cbm51bGx9O2EucHJvdG90eXBlLnJ1bj1mdW5jdGlvbigpe2Zvcih2YXIgYSxjPU0ucXVldWU7MDxjLmNvdW50KCk7KWlmKGE9Yy5kZXF1ZXVlKCksIWEuaXNDYW5jZWxsZWQoKSl7Zm9yKDswPGEuZHVlVGltZS1zLm5vdygpOyk7YS5pc0NhbmNlbGxlZCgpfHxhLmludm9rZSgpfX07cmV0dXJuIGF9KCksTT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXt2YXIgYj10aGlzO2EuYmFzZS5jb25zdHJ1Y3Rvci5jYWxsKHRoaXMsSixmdW5jdGlvbihhLGQpe3JldHVybiBiLnNjaGVkdWxlV2l0aFJlbGF0aXZlQW5kU3RhdGUoYSwwLGQpfSxmdW5jdGlvbihjLGQsZSl7dmFyIGc9Yi5ub3coKStzLm5vcm1hbGl6ZShkKSxkPWEucXVldWUsYz1uZXcgUihiLGMsZSxnKTtpZihudWxsPT09ZCl7ZT1uZXcgbGE7dHJ5e2EucXVldWUuZW5xdWV1ZShjKSxlLnJ1bigpfWZpbmFsbHl7ZS5kaXNwb3NlKCl9fWVsc2UgZC5lbnF1ZXVlKGMpO3JldHVybiBjLmRpc3Bvc2FibGV9LGZ1bmN0aW9uKGEsZCxlKXtyZXR1cm4gYi5zY2hlZHVsZVdpdGhSZWxhdGl2ZUFuZFN0YXRlKGEsXG5kLWIubm93KCksZSl9KX1vKGEscyk7YS5wcm90b3R5cGUuc2NoZWR1bGVSZXF1aXJlZD1mdW5jdGlvbigpe3JldHVybiBudWxsPT09YS5xdWV1ZX07YS5wcm90b3R5cGUuZW5zdXJlVHJhbXBvbGluZT1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5zY2hlZHVsZVJlcXVpcmVkKCk/dGhpcy5zY2hlZHVsZShhKTphKCl9O2EucXVldWU9bnVsbDtyZXR1cm4gYX0oKSxEPXMuQ3VycmVudFRocmVhZD1uZXcgTTttLlZpcnR1YWxUaW1lU2NoZWR1bGVyPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShiLGMpe3ZhciBkPXRoaXM7dGhpcy5jbG9jaz1iO3RoaXMuY29tcGFyZXI9Yzt0aGlzLmlzRW5hYmxlZD0hMTthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzLGZ1bmN0aW9uKCl7cmV0dXJuIGQudG9EYXRlVGltZU9mZnNldChkLmNsb2NrKX0sZnVuY3Rpb24oYSxiKXtyZXR1cm4gZC5zY2hlZHVsZUFic29sdXRlKGEsZC5jbG9jayxiKX0sZnVuY3Rpb24oYSxiLGMpe3JldHVybiBkLnNjaGVkdWxlUmVsYXRpdmUoYSxcbmQudG9SZWxhdGl2ZShiKSxjKX0sZnVuY3Rpb24oYSxiLGMpe3JldHVybiBkLnNjaGVkdWxlUmVsYXRpdmUoYSxkLnRvUmVsYXRpdmUoYi1kLm5vdygpKSxjKX0pO3RoaXMucXVldWU9bmV3IFkoMTAyNCl9byhhLHMpO2EucHJvdG90eXBlLnNjaGVkdWxlUmVsYXRpdmU9ZnVuY3Rpb24oYSxjLGQpe2M9dGhpcy5hZGQodGhpcy5jbG9jayxjKTtyZXR1cm4gdGhpcy5zY2hlZHVsZUFic29sdXRlKGEsYyxkKX07YS5wcm90b3R5cGUuc3RhcnQ9ZnVuY3Rpb24oKXt2YXIgYTtpZighdGhpcy5pc0VuYWJsZWQpe3RoaXMuaXNFbmFibGVkPSEwO2RvIGlmKGE9dGhpcy5nZXROZXh0KCksbnVsbCE9PWEpe2lmKDA8dGhpcy5jb21wYXJlcihhLmR1ZVRpbWUsdGhpcy5jbG9jaykpdGhpcy5jbG9jaz1hLmR1ZVRpbWU7YS5pbnZva2UoKX1lbHNlIHRoaXMuaXNFbmFibGVkPSExO3doaWxlKHRoaXMuaXNFbmFibGVkKX19O2EucHJvdG90eXBlLnN0b3A9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5pc0VuYWJsZWQ9XG4hMX07YS5wcm90b3R5cGUuYWR2YW5jZVRvPWZ1bmN0aW9uKGEpe3ZhciBjO2lmKDA8PXRoaXMuY29tcGFyZXIodGhpcy5jbG9jayxhKSl0aHJvdyBFcnJvcihcIkFyZ3VtZW50IG91dCBvZiByYW5nZVwiKTtpZighdGhpcy5pc0VuYWJsZWQpe3RoaXMuaXNFbmFibGVkPSEwO2RvIGlmKGM9dGhpcy5nZXROZXh0KCksbnVsbCE9PWMmJjA+PXRoaXMuY29tcGFyZXIoYy5kdWVUaW1lLGEpKXtpZigwPHRoaXMuY29tcGFyZXIoYy5kdWVUaW1lLHRoaXMuY2xvY2spKXRoaXMuY2xvY2s9Yy5kdWVUaW1lO2MuaW52b2tlKCl9ZWxzZSB0aGlzLmlzRW5hYmxlZD0hMTt3aGlsZSh0aGlzLmlzRW5hYmxlZCk7cmV0dXJuIHRoaXMuY2xvY2s9YX19O2EucHJvdG90eXBlLmFkdmFuY2VCeT1mdW5jdGlvbihhKXthPXRoaXMuYWRkKHRoaXMuY2xvY2ssYSk7aWYoMDw9dGhpcy5jb21wYXJlcih0aGlzLmNsb2NrLGEpKXRocm93IEVycm9yKFwiQXJndW1lbnQgb3V0IG9mIHJhbmdlXCIpO3JldHVybiB0aGlzLmFkdmFuY2VUbyhhKX07XG5hLnByb3RvdHlwZS5nZXROZXh0PWZ1bmN0aW9uKCl7Zm9yKHZhciBhOzA8dGhpcy5xdWV1ZS5jb3VudCgpOylpZihhPXRoaXMucXVldWUucGVlaygpLGEuaXNDYW5jZWxsZWQoKSl0aGlzLnF1ZXVlLmRlcXVldWUoKTtlbHNlIHJldHVybiBhO3JldHVybiBudWxsfTthLnByb3RvdHlwZS5zY2hlZHVsZUFic29sdXRlPWZ1bmN0aW9uKGEsYyxkKXt2YXIgZT10aGlzLGc9bmV3IFIoZSxhLGZ1bmN0aW9uKGEsYil7ZS5xdWV1ZS5yZW1vdmUoZyk7cmV0dXJuIGQoYSxiKX0sYyxlLmNvbXBhcmVyKTtlLnF1ZXVlLmVucXVldWUoZyk7cmV0dXJuIGcuZGlzcG9zYWJsZX07cmV0dXJuIGF9KCk7dmFyIGY9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKCl7dmFyIGI9dGhpczthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzLEosZnVuY3Rpb24oYSxkKXt2YXIgZT14LnNldFRpbWVvdXQoZnVuY3Rpb24oKXtkKGIsYSl9LDApO3JldHVybiBBKGZ1bmN0aW9uKCl7eC5jbGVhclRpbWVvdXQoZSl9KX0sZnVuY3Rpb24oYSxcbmQsZSl7dmFyIGcsZD1zLm5vcm1hbGl6ZShkKTtnPXguc2V0VGltZW91dChmdW5jdGlvbigpe2UoYixhKX0sZCk7cmV0dXJuIEEoZnVuY3Rpb24oKXt4LmNsZWFyVGltZW91dChnKX0pfSxmdW5jdGlvbihhLGQsZSl7cmV0dXJuIGIuc2NoZWR1bGVXaXRoUmVsYXRpdmVBbmRTdGF0ZShhLGQtYi5ub3coKSxlKX0pfW8oYSxzKTtyZXR1cm4gYX0oKSxtYT1zLlRpbWVvdXQ9bmV3IGYsdD1tLk5vdGlmaWNhdGlvbj1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXt9YS5wcm90b3R5cGUuYWNjZXB0PWZ1bmN0aW9uKGEsYyxkKXtyZXR1cm4gMTxhcmd1bWVudHMubGVuZ3RofHxcImZ1bmN0aW9uXCI9PT10eXBlb2YgYT90aGlzLl9hY2NlcHQoYSxjLGQpOnRoaXMuX2FjY2VwdE9ic2VydmFibGUoYSl9O2EucHJvdG90eXBlLnRvT2JzZXJ2YWJsZT1mdW5jdGlvbihhKXt2YXIgYz10aGlzLGE9YXx8cy5JbW1lZGlhdGU7cmV0dXJuIGkoZnVuY3Rpb24oZCl7cmV0dXJuIGEuc2NoZWR1bGUoZnVuY3Rpb24oKXtjLl9hY2NlcHRPYnNlcnZhYmxlKGQpO1xuaWYoXCJOXCI9PT1jLmtpbmQpZC5vbkNvbXBsZXRlZCgpfSl9KX07YS5wcm90b3R5cGUuaGFzVmFsdWU9ITE7YS5wcm90b3R5cGUuZXF1YWxzPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLnRvU3RyaW5nKCk9PT0oYT09PW58fG51bGw9PT1hP1wiXCI6YS50b1N0cmluZygpKX07cmV0dXJuIGF9KCk7dC5jcmVhdGVPbk5leHQ9ZnVuY3Rpb24oYSl7dmFyIGI9bmV3IHQ7Yi52YWx1ZT1hO2IuaGFzVmFsdWU9ITA7Yi5raW5kPVwiTlwiO2IuX2FjY2VwdD1mdW5jdGlvbihhKXtyZXR1cm4gYSh0aGlzLnZhbHVlKX07Yi5fYWNjZXB0T2JzZXJ2YWJsZT1mdW5jdGlvbihhKXtyZXR1cm4gYS5vbk5leHQodGhpcy52YWx1ZSl9O2IudG9TdHJpbmc9ZnVuY3Rpb24oKXtyZXR1cm5cIk9uTmV4dChcIit0aGlzLnZhbHVlK1wiKVwifTtyZXR1cm4gYn07dC5jcmVhdGVPbkVycm9yPWZ1bmN0aW9uKGEpe3ZhciBiPW5ldyB0O2IuZXhjZXB0aW9uPWE7Yi5raW5kPVwiRVwiO2IuX2FjY2VwdD1mdW5jdGlvbihhLGIpe3JldHVybiBiKHRoaXMuZXhjZXB0aW9uKX07XG5iLl9hY2NlcHRPYnNlcnZhYmxlPWZ1bmN0aW9uKGEpe3JldHVybiBhLm9uRXJyb3IodGhpcy5leGNlcHRpb24pfTtiLnRvU3RyaW5nPWZ1bmN0aW9uKCl7cmV0dXJuXCJPbkVycm9yKFwiK3RoaXMuZXhjZXB0aW9uK1wiKVwifTtyZXR1cm4gYn07dC5jcmVhdGVPbkNvbXBsZXRlZD1mdW5jdGlvbigpe3ZhciBhPW5ldyB0O2Eua2luZD1cIkNcIjthLl9hY2NlcHQ9ZnVuY3Rpb24oYSxjLGQpe3JldHVybiBkKCl9O2EuX2FjY2VwdE9ic2VydmFibGU9ZnVuY3Rpb24oYSl7cmV0dXJuIGEub25Db21wbGV0ZWQoKX07YS50b1N0cmluZz1mdW5jdGlvbigpe3JldHVyblwiT25Db21wbGV0ZWQoKVwifTtyZXR1cm4gYX07dmFyIEc9ZnVuY3Rpb24oKXt9LGY9Ry5wcm90b3R5cGU7Zi5jb25jYXQ9ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGIpe3ZhciBjLGQ9YS5nZXRFbnVtZXJhdG9yKCksZT0hMSxnPW5ldyBDO2M9Qi5zY2hlZHVsZVJlY3Vyc2l2ZShmdW5jdGlvbihhKXt2YXIgYyxcbnoscT0hMTtpZighZSl7dHJ5e2lmKHE9ZC5tb3ZlTmV4dCgpKWM9ZC5jdXJyZW50fWNhdGNoKGspe3o9a31pZih2b2lkIDAhPT16KWIub25FcnJvcih6KTtlbHNlIGlmKHEpej1uZXcgdixnLmRpc3Bvc2FibGUoeiksei5kaXNwb3NhYmxlKGMuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2Iub25OZXh0KGEpfSxmdW5jdGlvbihhKXtiLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7YSgpfSkpO2Vsc2UgYi5vbkNvbXBsZXRlZCgpfX0pO3JldHVybiBuZXcgcChnLGMsQShmdW5jdGlvbigpe2U9ITB9KSl9KX07Zi5jYXRjaEV4Y2VwdGlvbj1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYil7dmFyIGMsZD1hLmdldEVudW1lcmF0b3IoKSxlPSExLGcsaDtnPW5ldyBDO2M9Qi5zY2hlZHVsZVJlY3Vyc2l2ZShmdW5jdGlvbihhKXt2YXIgYyxxLGs7az0hMTtpZighZSl7dHJ5e2lmKGs9ZC5tb3ZlTmV4dCgpKWM9ZC5jdXJyZW50fWNhdGNoKGYpe3E9Zn1pZih2b2lkIDAhPT1xKWIub25FcnJvcihxKTtcbmVsc2UgaWYoaylxPW5ldyB2LGcuZGlzcG9zYWJsZShxKSxxLmRpc3Bvc2FibGUoYy5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7Yi5vbk5leHQoYSl9LGZ1bmN0aW9uKGIpe2g9YjthKCl9LGZ1bmN0aW9uKCl7Yi5vbkNvbXBsZXRlZCgpfSkpO2Vsc2UgaWYodm9pZCAwIT09aCliLm9uRXJyb3IoaCk7ZWxzZSBiLm9uQ29tcGxldGVkKCl9fSk7cmV0dXJuIG5ldyBwKGcsYyxBKGZ1bmN0aW9uKCl7ZT0hMH0pKX0pfTt2YXIgJD1HLnJlcGVhdD1mdW5jdGlvbihhLGIpe2I9PT1uJiYoYj0tMSk7dmFyIGM9bmV3IEc7Yy5nZXRFbnVtZXJhdG9yPWZ1bmN0aW9uKCl7cmV0dXJue2xlZnQ6YixjdXJyZW50Om51bGwsbW92ZU5leHQ6ZnVuY3Rpb24oKXtpZigwPT09dGhpcy5sZWZ0KXJldHVybiB0aGlzLmN1cnJlbnQ9bnVsbCwhMTswPHRoaXMubGVmdCYmdGhpcy5sZWZ0LS07dGhpcy5jdXJyZW50PWE7cmV0dXJuITB9fX07cmV0dXJuIGN9LFM9Ry5mb3JFbnVtZXJhdG9yPWZ1bmN0aW9uKGEpe3ZhciBiPVxubmV3IEc7Yi5nZXRFbnVtZXJhdG9yPWZ1bmN0aW9uKCl7cmV0dXJue19pbmRleDotMSxjdXJyZW50Om51bGwsbW92ZU5leHQ6ZnVuY3Rpb24oKXtpZigrK3RoaXMuX2luZGV4PGEubGVuZ3RoKXJldHVybiB0aGlzLmN1cnJlbnQ9YVt0aGlzLl9pbmRleF0sITA7dGhpcy5faW5kZXg9LTE7dGhpcy5jdXJyZW50PW51bGw7cmV0dXJuITF9fX07cmV0dXJuIGJ9LHI9bS5PYnNlcnZlcj1mdW5jdGlvbigpe30sVD1tLkludGVybmFscy5BYnN0cmFjdE9ic2VydmVyPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYSgpe3RoaXMuaXNTdG9wcGVkPSExfW8oYSxyKTthLnByb3RvdHlwZS5vbk5leHQ9ZnVuY3Rpb24oYSl7dGhpcy5pc1N0b3BwZWR8fHRoaXMubmV4dChhKX07YS5wcm90b3R5cGUub25FcnJvcj1mdW5jdGlvbihhKXtpZighdGhpcy5pc1N0b3BwZWQpdGhpcy5pc1N0b3BwZWQ9ITAsdGhpcy5lcnJvcihhKX07YS5wcm90b3R5cGUub25Db21wbGV0ZWQ9ZnVuY3Rpb24oKXtpZighdGhpcy5pc1N0b3BwZWQpdGhpcy5pc1N0b3BwZWQ9XG4hMCx0aGlzLmNvbXBsZXRlZCgpfTthLnByb3RvdHlwZS5kaXNwb3NlPWZ1bmN0aW9uKCl7dGhpcy5pc1N0b3BwZWQ9ITB9O3JldHVybiBhfSgpLE49ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGIsYyxkKXthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzKTt0aGlzLl9vbk5leHQ9Yjt0aGlzLl9vbkVycm9yPWM7dGhpcy5fb25Db21wbGV0ZWQ9ZH1vKGEsVCk7YS5wcm90b3R5cGUubmV4dD1mdW5jdGlvbihhKXt0aGlzLl9vbk5leHQoYSl9O2EucHJvdG90eXBlLmVycm9yPWZ1bmN0aW9uKGEpe3RoaXMuX29uRXJyb3IoYSl9O2EucHJvdG90eXBlLmNvbXBsZXRlZD1mdW5jdGlvbigpe3RoaXMuX29uQ29tcGxldGVkKCl9O3JldHVybiBhfSgpLEg9bS5JbnRlcm5hbHMuQmluYXJ5T2JzZXJ2ZXI9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGEsYyl7XCJmdW5jdGlvblwiPT09dHlwZW9mIGEmJlwiZnVuY3Rpb25cIj09PXR5cGVvZiBjPyh0aGlzLmxlZnRPYnNlcnZlcj1hYShhKSx0aGlzLnJpZ2h0T2JzZXJ2ZXI9XG5hYShjKSk6KHRoaXMubGVmdE9ic2VydmVyPWEsdGhpcy5yaWdodE9ic2VydmVyPWMpfW8oYSxyKTthLnByb3RvdHlwZS5vbk5leHQ9ZnVuY3Rpb24oYSl7dmFyIGM9dGhpcztyZXR1cm4gYS5zd2l0Y2hWYWx1ZShmdW5jdGlvbihhKXtyZXR1cm4gYS5hY2NlcHQoYy5sZWZ0T2JzZXJ2ZXIpfSxmdW5jdGlvbihhKXtyZXR1cm4gYS5hY2NlcHQoYy5yaWdodE9ic2VydmVyKX0pfTthLnByb3RvdHlwZS5vbkVycm9yPWZ1bmN0aW9uKCl7fTthLnByb3RvdHlwZS5vbkNvbXBsZXRlZD1mdW5jdGlvbigpe307cmV0dXJuIGF9KCksbmE9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGEsYyl7dGhpcy5zY2hlZHVsZXI9YTt0aGlzLm9ic2VydmVyPWM7dGhpcy5oYXNGYXVsdGVkPXRoaXMuaXNBY3F1aXJlZD0hMTt0aGlzLnF1ZXVlPVtdO3RoaXMuZGlzcG9zYWJsZT1uZXcgQ31vKGEsVCk7YS5wcm90b3R5cGUuZW5zdXJlQWN0aXZlPWZ1bmN0aW9uKCl7dmFyIGE9ITEsYz10aGlzO2lmKCF0aGlzLmhhc0ZhdWx0ZWQmJlxuMDx0aGlzLnF1ZXVlLmxlbmd0aClhPSF0aGlzLmlzQWNxdWlyZWQsdGhpcy5pc0FjcXVpcmVkPSEwO2EmJnRoaXMuZGlzcG9zYWJsZS5kaXNwb3NhYmxlKHRoaXMuc2NoZWR1bGVyLnNjaGVkdWxlUmVjdXJzaXZlKGZ1bmN0aW9uKGEpe3ZhciBiO2lmKDA8Yy5xdWV1ZS5sZW5ndGgpe2I9Yy5xdWV1ZS5zaGlmdCgpO3RyeXtiKCl9Y2F0Y2goZyl7dGhyb3cgYy5xdWV1ZT1bXSxjLmhhc0ZhdWx0ZWQ9ITAsZzt9YSgpfWVsc2UgYy5pc0FjcXVpcmVkPSExfSkpfTthLnByb3RvdHlwZS5uZXh0PWZ1bmN0aW9uKGEpe3ZhciBjPXRoaXM7dGhpcy5xdWV1ZS5wdXNoKGZ1bmN0aW9uKCl7Yy5vYnNlcnZlci5vbk5leHQoYSl9KX07YS5wcm90b3R5cGUuZXJyb3I9ZnVuY3Rpb24oYSl7dmFyIGM9dGhpczt0aGlzLnF1ZXVlLnB1c2goZnVuY3Rpb24oKXtjLm9ic2VydmVyLm9uRXJyb3IoYSl9KX07YS5wcm90b3R5cGUuY29tcGxldGVkPWZ1bmN0aW9uKCl7dmFyIGE9dGhpczt0aGlzLnF1ZXVlLnB1c2goZnVuY3Rpb24oKXthLm9ic2VydmVyLm9uQ29tcGxldGVkKCl9KX07XG5hLnByb3RvdHlwZS5kaXNwb3NlPWZ1bmN0aW9uKCl7YS5iYXNlLmRpc3Bvc2UuY2FsbCh0aGlzKTt0aGlzLmRpc3Bvc2FibGUuZGlzcG9zZSgpfTtyZXR1cm4gYX0oKSxJPXIuY3JlYXRlPWZ1bmN0aW9uKGEsYixjKXtifHwoYj1mdW5jdGlvbihhKXt0aHJvdyBhO30pO2N8fChjPWZ1bmN0aW9uKCl7fSk7cmV0dXJuIG5ldyBOKGEsYixjKX07ci5mcm9tTm90aWZpZXI9ZnVuY3Rpb24oYSl7cmV0dXJuIG5ldyBOKGZ1bmN0aW9uKGIpe3JldHVybiBhKHQuY3JlYXRlT25OZXh0KGIpKX0sZnVuY3Rpb24oYil7cmV0dXJuIGEodC5jcmVhdGVPbkVycm9yKGIpKX0sZnVuY3Rpb24oKXtyZXR1cm4gYSh0LmNyZWF0ZU9uQ29tcGxldGVkKCkpfSl9O3ZhciBhYT1mdW5jdGlvbihhKXtyZXR1cm4gbmV3IE4oZnVuY3Rpb24oYil7YSh0LmNyZWF0ZU9uTmV4dChiKSl9LGZ1bmN0aW9uKGIpe2EodC5jcmVhdGVPbkVycm9yKGIpKX0sZnVuY3Rpb24oKXthKHQuY3JlYXRlT25Db21wbGV0ZWQoKSl9KX07XG5yLnByb3RvdHlwZS50b05vdGlmaWVyPWZ1bmN0aW9uKCl7dmFyIGE9dGhpcztyZXR1cm4gZnVuY3Rpb24oYil7cmV0dXJuIGIuYWNjZXB0KGEpfX07ci5wcm90b3R5cGUuYXNPYnNlcnZlcj1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIG5ldyBOKGZ1bmN0aW9uKGIpe3JldHVybiBhLm9uTmV4dChiKX0sZnVuY3Rpb24oYil7cmV0dXJuIGEub25FcnJvcihiKX0sZnVuY3Rpb24oKXtyZXR1cm4gYS5vbkNvbXBsZXRlZCgpfSl9O3ZhciBqPW0uT2JzZXJ2YWJsZT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXt9YS5wcm90b3R5cGUuc3Vic2NyaWJlPWZ1bmN0aW9uKGEsYyxkKXtyZXR1cm4gdGhpcy5fc3Vic2NyaWJlKDA9PT1hcmd1bWVudHMubGVuZ3RofHwxPGFyZ3VtZW50cy5sZW5ndGh8fFwiZnVuY3Rpb25cIj09PXR5cGVvZiBhP0koYSxjLGQpOmEpfTtyZXR1cm4gYX0oKSxmPWoucHJvdG90eXBlLHBhPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShiKXthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzKTtcbnRoaXMuX3N1YnNjcmliZT1mdW5jdGlvbihhKXt2YXIgZD1uZXcgb2EoYSk7RC5zY2hlZHVsZVJlcXVpcmVkKCk/RC5zY2hlZHVsZShmdW5jdGlvbigpe2QuZGlzcG9zYWJsZShiKGQpKX0pOmQuZGlzcG9zYWJsZShiKGQpKTtyZXR1cm4gZH19byhhLGopO2EucHJvdG90eXBlLl9zdWJzY3JpYmU9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuX3N1YnNjcmliZShhKX07cmV0dXJuIGF9KCksb2E9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGIpe2EuYmFzZS5jb25zdHJ1Y3Rvci5jYWxsKHRoaXMpO3RoaXMub2JzZXJ2ZXI9Yjt0aGlzLm09bmV3IHZ9byhhLFQpO2EucHJvdG90eXBlLmRpc3Bvc2FibGU9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMubS5kaXNwb3NhYmxlKGEpfTthLnByb3RvdHlwZS5uZXh0PWZ1bmN0aW9uKGEpe3RoaXMub2JzZXJ2ZXIub25OZXh0KGEpfTthLnByb3RvdHlwZS5lcnJvcj1mdW5jdGlvbihhKXt0aGlzLm9ic2VydmVyLm9uRXJyb3IoYSk7dGhpcy5tLmRpc3Bvc2UoKX07XG5hLnByb3RvdHlwZS5jb21wbGV0ZWQ9ZnVuY3Rpb24oKXt0aGlzLm9ic2VydmVyLm9uQ29tcGxldGVkKCk7dGhpcy5tLmRpc3Bvc2UoKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe2EuYmFzZS5kaXNwb3NlLmNhbGwodGhpcyk7dGhpcy5tLmRpc3Bvc2UoKX07cmV0dXJuIGF9KCksYmE9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGIsYyxkKXthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzKTt0aGlzLmtleT1iO3RoaXMudW5kZXJseWluZ09ic2VydmFibGU9IWQ/YzppKGZ1bmN0aW9uKGEpe3JldHVybiBuZXcgcChkLmdldERpc3Bvc2FibGUoKSxjLnN1YnNjcmliZShhKSl9KX1vKGEsaik7YS5wcm90b3R5cGUuX3N1YnNjcmliZT1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy51bmRlcmx5aW5nT2JzZXJ2YWJsZS5zdWJzY3JpYmUoYSl9O3JldHVybiBhfSgpLHFhPW0uQ29ubmVjdGFibGVPYnNlcnZhYmxlPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShhLGMpe3ZhciBkPWEuYXNPYnNlcnZhYmxlKCksXG5lPSExLGc9bnVsbDt0aGlzLmNvbm5lY3Q9ZnVuY3Rpb24oKXtlfHwoZT0hMCxnPW5ldyBwKGQuc3Vic2NyaWJlKGMpLEEoZnVuY3Rpb24oKXtlPSExfSkpKTtyZXR1cm4gZ307dGhpcy5fc3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3JldHVybiBjLnN1YnNjcmliZShhKX19byhhLGopO2EucHJvdG90eXBlLmNvbm5lY3Q9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5jb25uZWN0KCl9O2EucHJvdG90eXBlLnJlZkNvdW50PWZ1bmN0aW9uKCl7dmFyIGE9bnVsbCxjPTAsZD10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGUpe3ZhciBnLGg7YysrO2c9MT09PWM7aD1kLnN1YnNjcmliZShlKTtnJiYoYT1kLmNvbm5lY3QoKSk7cmV0dXJuIEEoZnVuY3Rpb24oKXtoLmRpc3Bvc2UoKTtjLS07MD09PWMmJmEuZGlzcG9zZSgpfSl9KX07YS5wcm90b3R5cGUuX3N1YnNjcmliZT1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5fc3Vic2NyaWJlKGEpfTtyZXR1cm4gYX0oKSxPPW0uU3ViamVjdD1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzKTtcbnZhciBiPSExLGM9ITEsZD1uZXcgdSxlPW4sZz1mdW5jdGlvbigpe2lmKGIpdGhyb3cgRXJyb3IoSyk7fTt0aGlzLm9uQ29tcGxldGVkPWZ1bmN0aW9uKCl7dmFyIGEsYjtnKCk7Y3x8KGE9ZC50b0FycmF5KCksZD1uZXcgdSxjPSEwKTtpZihhIT09bilmb3IoYj0wO2I8YS5sZW5ndGg7YisrKWFbYl0ub25Db21wbGV0ZWQoKX07dGhpcy5vbkVycm9yPWZ1bmN0aW9uKGEpe3ZhciBiLHo7ZygpO2N8fChiPWQudG9BcnJheSgpLGQ9bmV3IHUsYz0hMCxlPWEpO2lmKGIhPT1uKWZvcih6PTA7ejxiLmxlbmd0aDt6KyspYlt6XS5vbkVycm9yKGEpfTt0aGlzLm9uTmV4dD1mdW5jdGlvbihhKXt2YXIgYixlO2coKTtjfHwoYj1kLnRvQXJyYXkoKSk7aWYodm9pZCAwIT09Yilmb3IoZT0wO2U8Yi5sZW5ndGg7ZSsrKWJbZV0ub25OZXh0KGEpfTt0aGlzLl9zdWJzY3JpYmU9ZnVuY3Rpb24oYSl7ZygpO2lmKCFjKXJldHVybiBkLmFkZChhKSxmdW5jdGlvbihhKXtyZXR1cm57b2JzZXJ2ZXI6YSxkaXNwb3NlOmZ1bmN0aW9uKCl7aWYobnVsbCE9PVxudGhpcy5vYnNlcnZlciYmIWIpZC5yZW1vdmUodGhpcy5vYnNlcnZlciksdGhpcy5vYnNlcnZlcj1udWxsfX19KGEpO2lmKGUhPT1uKXJldHVybiBhLm9uRXJyb3IoZSksdzthLm9uQ29tcGxldGVkKCk7cmV0dXJuIHd9O3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe2I9ITA7ZD1udWxsfX1vKGEsaik7RShhLHIpO2EucHJvdG90eXBlLm9uQ29tcGxldGVkPWZ1bmN0aW9uKCl7dGhpcy5vbkNvbXBsZXRlZCgpfTthLnByb3RvdHlwZS5vbkVycm9yPWZ1bmN0aW9uKGEpe3RoaXMub25FcnJvcihhKX07YS5wcm90b3R5cGUub25OZXh0PWZ1bmN0aW9uKGEpe3RoaXMub25OZXh0KGEpfTthLnByb3RvdHlwZS5fc3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLl9zdWJzY3JpYmUoYSl9O2EucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXt0aGlzLmRpc3Bvc2UoKX07YS5jcmVhdGU9ZnVuY3Rpb24oYSxjKXtyZXR1cm4gbmV3IHJhKGEsYyl9O3JldHVybiBhfSgpLFU9bS5Bc3luY1N1YmplY3Q9XG5mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzKTt2YXIgYj0hMSxjPSExLGQ9bnVsbCxlPSExLGc9bmV3IHUsaD1udWxsLGw9ZnVuY3Rpb24oKXtpZihiKXRocm93IEVycm9yKEspO307dGhpcy5vbkNvbXBsZXRlZD1mdW5jdGlvbigpe3ZhciBhPSExLGIsaCxmO2woKTtjfHwoYj1nLnRvQXJyYXkoKSxnPW5ldyB1LGM9ITAsaD1kLGE9ZSk7aWYoYiE9PW4paWYoYSlmb3IoZj0wO2Y8Yi5sZW5ndGg7ZisrKWE9YltmXSxhLm9uTmV4dChoKSxhLm9uQ29tcGxldGVkKCk7ZWxzZSBmb3IoZj0wO2Y8Yi5sZW5ndGg7ZisrKWJbZl0ub25Db21wbGV0ZWQoKX07dGhpcy5vbkVycm9yPWZ1bmN0aW9uKGEpe3ZhciBiLGQ7bCgpO2N8fChiPWcudG9BcnJheSgpLGc9bmV3IHUsYz0hMCxoPWEpO2lmKGIhPT1uKWZvcihkPTA7ZDxiLmxlbmd0aDtkKyspYltkXS5vbkVycm9yKGEpfTt0aGlzLm9uTmV4dD1mdW5jdGlvbihhKXtsKCk7Y3x8KGQ9YSxlPSEwKX07XG50aGlzLl9zdWJzY3JpYmU9ZnVuY3Rpb24oYSl7dmFyIHEsayxmO2woKTtpZighYylyZXR1cm4gZy5hZGQoYSksZnVuY3Rpb24oYSl7cmV0dXJue29ic2VydmVyOmEsZGlzcG9zZTpmdW5jdGlvbigpe2lmKG51bGwhPT10aGlzLm9ic2VydmVyJiYhYilnLnJlbW92ZSh0aGlzLm9ic2VydmVyKSx0aGlzLm9ic2VydmVyPW51bGx9fX0oYSk7cT1oO2s9ZTtmPWQ7aWYobnVsbCE9PXEpYS5vbkVycm9yKHEpO2Vsc2V7aWYoaylhLm9uTmV4dChmKTthLm9uQ29tcGxldGVkKCl9cmV0dXJuIHd9O3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe2I9ITA7ZD1oPWc9bnVsbH19byhhLGopO0UoYSxyKTthLnByb3RvdHlwZS5vbkNvbXBsZXRlZD1mdW5jdGlvbigpe3RoaXMub25Db21wbGV0ZWQoKX07YS5wcm90b3R5cGUub25FcnJvcj1mdW5jdGlvbihhKXt0aGlzLm9uRXJyb3IoYSl9O2EucHJvdG90eXBlLm9uTmV4dD1mdW5jdGlvbihhKXt0aGlzLm9uTmV4dChhKX07YS5wcm90b3R5cGUuX3N1YnNjcmliZT1cbmZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLl9zdWJzY3JpYmUoYSl9O2EucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXt0aGlzLmRpc3Bvc2UoKX07cmV0dXJuIGF9KCksUD1tLkJlaGF2aW9yU3ViamVjdD1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYil7YS5iYXNlLmNvbnN0cnVjdG9yLmNhbGwodGhpcyk7dmFyIGM9YixkPW5ldyB1LGU9ITEsZz0hMSxoPW51bGwsbD1mdW5jdGlvbigpe2lmKGUpdGhyb3cgRXJyb3IoSyk7fTt0aGlzLm9uQ29tcGxldGVkPWZ1bmN0aW9uKCl7dmFyIGEsYjthPW51bGw7bCgpO2d8fChhPWQudG9BcnJheSgpLGQ9bmV3IHUsZz0hMCk7aWYobnVsbCE9PWEpZm9yKGI9MDtiPGEubGVuZ3RoO2IrKylhW2JdLm9uQ29tcGxldGVkKCl9O3RoaXMub25FcnJvcj1mdW5jdGlvbihhKXt2YXIgYixjO2M9bnVsbDtsKCk7Z3x8KGM9ZC50b0FycmF5KCksZD1uZXcgdSxnPSEwLGg9YSk7aWYobnVsbCE9PWMpZm9yKGI9MDtiPGMubGVuZ3RoO2IrKyljW2JdLm9uRXJyb3IoYSl9O1xudGhpcy5vbk5leHQ9ZnVuY3Rpb24oYSl7dmFyIGIsZTtiPW51bGw7bCgpO2d8fChjPWEsYj1kLnRvQXJyYXkoKSk7aWYobnVsbCE9PWIpZm9yKGU9MDtlPGIubGVuZ3RoO2UrKyliW2VdLm9uTmV4dChhKX07dGhpcy5fc3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3ZhciBiO2woKTtpZighZylyZXR1cm4gZC5hZGQoYSksYS5vbk5leHQoYyksZnVuY3Rpb24oYSl7cmV0dXJue29ic2VydmVyOmEsZGlzcG9zZTpmdW5jdGlvbigpe2lmKG51bGwhPT10aGlzLm9ic2VydmVyJiYhZSlkLnJlbW92ZSh0aGlzLm9ic2VydmVyKSx0aGlzLm9ic2VydmVyPW51bGx9fX0oYSk7Yj1oO2lmKG51bGwhPT1iKWEub25FcnJvcihiKTtlbHNlIGEub25Db21wbGV0ZWQoKTtyZXR1cm4gd307dGhpcy5kaXNwb3NlPWZ1bmN0aW9uKCl7ZT0hMDtoPWM9ZD1udWxsfX1vKGEsaik7RShhLHIpO2EucHJvdG90eXBlLm9uQ29tcGxldGVkPWZ1bmN0aW9uKCl7dGhpcy5vbkNvbXBsZXRlZCgpfTthLnByb3RvdHlwZS5vbkVycm9yPVxuZnVuY3Rpb24oYSl7dGhpcy5vbkVycm9yKGEpfTthLnByb3RvdHlwZS5vbk5leHQ9ZnVuY3Rpb24oYSl7dGhpcy5vbk5leHQoYSl9O2EucHJvdG90eXBlLl9zdWJzY3JpYmU9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuX3N1YnNjcmliZShhKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe3RoaXMuZGlzcG9zZSgpfTtyZXR1cm4gYX0oKTtQLnByb3RvdHlwZS50b05vdGlmaWVyPXIucHJvdG90eXBlLnRvTm90aWZpZXI7UC5wcm90b3R5cGUuYXNPYnNlcnZlcj1yLnByb3RvdHlwZS5Bc09ic2VydmVyO3ZhciBjYT1tLlJlcGxheVN1YmplY3Q9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGEsYyxkKXt2YXIgZT1hPT09bj9OdW1iZXIuTUFYX1ZBTFVFOmEsZz1jPT09bj9OdW1iZXIuTUFYX1ZBTFVFOmMsaD1kfHxzLmN1cnJlbnRUaHJlYWQsbD1bXSxmPW5ldyB1LHE9ITEsaz0hMSxpPWZ1bmN0aW9uKGEpe3ZhciBiPXE/MTowLGM9YitlO2ZvcihjPGUmJihjPWUpO2wubGVuZ3RoPmM7KWwuc2hpZnQoKTtcbmZvcig7bC5sZW5ndGg+YiYmYS1sWzBdLnRpbWVzdGFtcD5nOylsLnNoaWZ0KCl9LGo9ZnVuY3Rpb24oYSl7dmFyIGI9aC5ub3coKTtsLnB1c2goe3ZhbHVlOmEsdGltZXN0YW1wOmJ9KTtpKGIpfSxtPWZ1bmN0aW9uKCl7aWYoayl0aHJvdyBFcnJvcihLKTt9O3RoaXMub25OZXh0PWZ1bmN0aW9uKGEpe3ZhciBiPW51bGwsYyxkO20oKTtpZighcSl7Yj1mLnRvQXJyYXkoKTtqKHQuY3JlYXRlT25OZXh0KGEpKTtmb3IoZD0wO2Q8Yi5sZW5ndGg7ZCsrKWM9YltkXSxjLm9uTmV4dChhKX1pZihudWxsIT09Yilmb3IoZD0wO2Q8Yi5sZW5ndGg7ZCsrKWM9YltkXSxjLmVuc3VyZUFjdGl2ZSgpfTt0aGlzLm9uRXJyb3I9ZnVuY3Rpb24oYSl7dmFyIGI9bnVsbCxjO20oKTtpZighcSl7cT0hMDtqKHQuY3JlYXRlT25FcnJvcihhKSk7Yj1mLnRvQXJyYXkoKTtmb3IoYz0wO2M8Yi5sZW5ndGg7YysrKWJbY10ub25FcnJvcihhKTtmPW5ldyB1fWlmKG51bGwhPT1iKWZvcihjPTA7YzxiLmxlbmd0aDtjKyspYltjXS5lbnN1cmVBY3RpdmUoKX07XG50aGlzLm9uQ29tcGxldGVkPWZ1bmN0aW9uKCl7dmFyIGE9bnVsbCxiO20oKTtpZighcSl7cT0hMDtqKHQuY3JlYXRlT25Db21wbGV0ZWQoKSk7YT1mLnRvQXJyYXkoKTtmb3IoYj0wO2I8YS5sZW5ndGg7YisrKWFbYl0ub25Db21wbGV0ZWQoKTtmPW5ldyB1fWlmKG51bGwhPT1hKWZvcihiPTA7YjxhLmxlbmd0aDtiKyspYVtiXS5lbnN1cmVBY3RpdmUoKX07dGhpcy5fc3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3ZhciBhPW5ldyBuYShoLGEpLGI9ZnVuY3Rpb24oYSl7cmV0dXJue29ic2VydmVyOmEsZGlzcG9zZTpmdW5jdGlvbigpe3RoaXMub2JzZXJ2ZXIuZGlzcG9zZSgpO251bGwhPT10aGlzLm9ic2VydmVyJiYhayYmZi5yZW1vdmUodGhpcy5vYnNlcnZlcil9fX0oYSksYzttKCk7aShoLm5vdygpKTtmLmFkZChhKTtmb3IoYz0wO2M8bC5sZW5ndGg7YysrKWxbY10udmFsdWUuYWNjZXB0KGEpO2EuZW5zdXJlQWN0aXZlKCk7cmV0dXJuIGJ9O3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe2s9XG4hMDtmPW51bGx9fW8oYSxqKTtFKGEsaik7YS5wcm90b3R5cGUub25OZXh0PWZ1bmN0aW9uKGEpe3RoaXMub25OZXh0KGEpfTthLnByb3RvdHlwZS5vbkVycm9yPWZ1bmN0aW9uKGEpe3RoaXMub25FcnJvcihhKX07YS5wcm90b3R5cGUub25Db21wbGV0ZWQ9ZnVuY3Rpb24oKXt0aGlzLm9uQ29tcGxldGVkKCl9O2EucHJvdG90eXBlLl9zdWJzY3JpYmU9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuX3N1YnNjcmliZShhKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe3RoaXMuZGlzcG9zZSgpfTtyZXR1cm4gYX0oKSxyYT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYSxjKXt0aGlzLm9ic2VydmVyPWE7dGhpcy5vYnNlcnZhYmxlPWN9byhhLGopO0UoYSxyKTthLnByb3RvdHlwZS5vbkNvbXBsZXRlZD1mdW5jdGlvbigpe3JldHVybiB0aGlzLm9ic2VydmVyLm9uQ29tcGxldGVkKCl9O2EucHJvdG90eXBlLm9uRXJyb3I9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMub2JzZXJ2ZXIub25FcnJvcihhKX07XG5hLnByb3RvdHlwZS5vbk5leHQ9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMub2JzZXJ2ZXIub25OZXh0KGEpfTthLnByb3RvdHlwZS5fU3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLm9ic2VydmFibGUuU3Vic2NyaWJlKGEpfTtyZXR1cm4gYX0oKTtqLnN0YXJ0PWZ1bmN0aW9uKGEsYixjLGQpe2N8fChjPVtdKTtyZXR1cm4gc2EoYSxkKS5hcHBseShiLGMpfTt2YXIgc2E9ai50b0FzeW5jPWZ1bmN0aW9uKGEsYil7Ynx8KGI9bWEpO3JldHVybiBmdW5jdGlvbigpe3ZhciBjPW5ldyBVLGQ9ZnVuY3Rpb24oKXt2YXIgYjt0cnl7Yj1hLmFwcGx5KHRoaXMsYXJndW1lbnRzKX1jYXRjaChkKXtjLm9uRXJyb3IoZCk7cmV0dXJufWMub25OZXh0KGIpO2Mub25Db21wbGV0ZWQoKX0sZT15LmNhbGwoYXJndW1lbnRzKSxnPXRoaXM7Yi5zY2hlZHVsZShmdW5jdGlvbigpe2QuYXBwbHkoZyxlKX0pO3JldHVybiBjfX07Zi5tdWx0aWNhc3Q9ZnVuY3Rpb24oYSxiKXt2YXIgYz10aGlzO3JldHVyblwiZnVuY3Rpb25cIj09PVxudHlwZW9mIGE/aShmdW5jdGlvbihkKXt2YXIgZT1jLm11bHRpY2FzdChhKCkpO3JldHVybiBuZXcgcChiKGUpLnN1YnNjcmliZShkKSxlLmNvbm5lY3QoKSl9KTpuZXcgcWEoYyxhKX07Zi5wdWJsaXNoPWZ1bmN0aW9uKGEpe3JldHVybiFhP3RoaXMubXVsdGljYXN0KG5ldyBPKTp0aGlzLm11bHRpY2FzdChmdW5jdGlvbigpe3JldHVybiBuZXcgT30sYSl9O2YucHVibGlzaExhc3Q9ZnVuY3Rpb24oYSl7cmV0dXJuIWE/dGhpcy5tdWx0aWNhc3QobmV3IFUpOnRoaXMubXVsdGljYXN0KGZ1bmN0aW9uKCl7cmV0dXJuIG5ldyBVfSxhKX07Zi5yZXBsYXk9ZnVuY3Rpb24oYSxiLGMsZCl7cmV0dXJuIWF8fG51bGw9PT1hP3RoaXMubXVsdGljYXN0KG5ldyBjYShiLGMsZCkpOnRoaXMubXVsdGljYXN0KGZ1bmN0aW9uKCl7cmV0dXJuIG5ldyBjYShiLGMsZCl9LGEpfTtmLnB1Ymxpc2hWYWx1ZT1mdW5jdGlvbihhLGIpe3JldHVyblwiZnVuY3Rpb25cIj09PXR5cGVvZiBhP3RoaXMubXVsdGljYXN0KGZ1bmN0aW9uKCl7cmV0dXJuIG5ldyBQKGIpfSxcbmEpOnRoaXMubXVsdGljYXN0KG5ldyBQKGEpKX07dmFyIGRhPWoubmV2ZXI9ZnVuY3Rpb24oKXtyZXR1cm4gaShmdW5jdGlvbigpe3JldHVybiB3fSl9LHRhPWouZW1wdHk9ZnVuY3Rpb24oYSl7YXx8KGE9Qik7cmV0dXJuIGkoZnVuY3Rpb24oYil7cmV0dXJuIGEuc2NoZWR1bGUoZnVuY3Rpb24oKXtyZXR1cm4gYi5vbkNvbXBsZXRlZCgpfSl9KX0sdWE9ai5yZXR1cm5WYWx1ZT1mdW5jdGlvbihhLGIpe2J8fChiPUIpO3JldHVybiBpKGZ1bmN0aW9uKGMpe3JldHVybiBiLnNjaGVkdWxlKGZ1bmN0aW9uKCl7Yy5vbk5leHQoYSk7cmV0dXJuIGMub25Db21wbGV0ZWQoKX0pfSl9LGVhPWoudGhyb3dFeGNlcHRpb249ZnVuY3Rpb24oYSxiKXtifHwoYj1CKTtyZXR1cm4gaShmdW5jdGlvbihjKXtyZXR1cm4gYi5zY2hlZHVsZShmdW5jdGlvbigpe3JldHVybiBjLm9uRXJyb3IoYSl9KX0pfSx2YT1qLmdlbmVyYXRlPWZ1bmN0aW9uKGEsYixjLGQsZSl7ZXx8KGU9RCk7cmV0dXJuIGkoZnVuY3Rpb24oZyl7dmFyIGg9XG4hMCxmPWE7cmV0dXJuIGUuc2NoZWR1bGVSZWN1cnNpdmUoZnVuY3Rpb24oYSl7dmFyIGUsazt0cnl7aD9oPSExOmY9YyhmKSwoZT1iKGYpKSYmKGs9ZChmKSl9Y2F0Y2goaSl7Zy5vbkVycm9yKGkpO3JldHVybn1pZihlKWcub25OZXh0KGspLGEoKTtlbHNlIGcub25Db21wbGV0ZWQoKX0pfSl9LGZhPWouZGVmZXI9ZnVuY3Rpb24oYSl7cmV0dXJuIGkoZnVuY3Rpb24oYil7dmFyIGM7dHJ5e2M9YSgpfWNhdGNoKGQpe3JldHVybiBlYShkKS5zdWJzY3JpYmUoYil9cmV0dXJuIGMuc3Vic2NyaWJlKGIpfSl9O2oudXNpbmc9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gaShmdW5jdGlvbihjKXt2YXIgZD13LGUsZzt0cnl7ZT1hKCksbnVsbCE9PWUmJihkPWUpLGc9YihlKX1jYXRjaChoKXtyZXR1cm4gbmV3IHAoZWEoaCkuc3Vic2NyaWJlKGMpLGQpfXJldHVybiBuZXcgcChnLnN1YnNjcmliZShjKSxkKX0pfTt2YXIgZ2E9ai5mcm9tQXJyYXk9ZnVuY3Rpb24oYSxiKXtifHwoYj1EKTtyZXR1cm4gaShmdW5jdGlvbihjKXt2YXIgZD1cbjA7cmV0dXJuIGIuc2NoZWR1bGVSZWN1cnNpdmUoZnVuY3Rpb24oYil7aWYoZDxhLmxlbmd0aCljLm9uTmV4dChhW2QrK10pLGIoKTtlbHNlIGMub25Db21wbGV0ZWQoKX0pfSl9LGk9ai5jcmVhdGVXaXRoRGlzcG9zYWJsZT1mdW5jdGlvbihhKXtyZXR1cm4gbmV3IHBhKGEpfTtqLmNyZWF0ZT1mdW5jdGlvbihhKXtyZXR1cm4gaShmdW5jdGlvbihiKXtyZXR1cm4gQShhKGIpKX0pfTtqLnJhbmdlPWZ1bmN0aW9uKGEsYixjKXtjfHwoYz1EKTt2YXIgZD1hK2ItMTtyZXR1cm4gdmEoYSxmdW5jdGlvbihhKXtyZXR1cm4gYTw9ZH0sZnVuY3Rpb24oYSl7cmV0dXJuIGErMX0sZnVuY3Rpb24oYSl7cmV0dXJuIGF9LGMpfTtmLnJlcGVhdD1mdW5jdGlvbihhKXtyZXR1cm4gJCh0aGlzLGEpLmNvbmNhdCgpfTtmLnJldHJ5PWZ1bmN0aW9uKGEpe3JldHVybiAkKHRoaXMsYSkuY2F0Y2hFeGNlcHRpb24oKX07ai5yZXBlYXQ9ZnVuY3Rpb24oYSxiLGMpe2N8fChjPUQpO2I9PT1uJiYoYj0tMSk7cmV0dXJuIHVhKGEsXG5jKS5yZXBlYXQoYil9O2Yuc2VsZWN0PWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9MDtyZXR1cm4gYi5zdWJzY3JpYmUoZnVuY3Rpb24oYil7dmFyIGc7dHJ5e2c9YShiLGQrKyl9Y2F0Y2goaCl7Yy5vbkVycm9yKGgpO3JldHVybn1jLm9uTmV4dChnKX0sZnVuY3Rpb24oYSl7Yy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2Mub25Db21wbGV0ZWQoKX0pfSl9O2Yud2hlcmU9ZnVuY3Rpb24oYSl7dmFyIGI9dGhpcztyZXR1cm4gaShmdW5jdGlvbihjKXt2YXIgZD0wO3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbihiKXt2YXIgZzt0cnl7Zz1hKGIsZCsrKX1jYXRjaChoKXtjLm9uRXJyb3IoaCk7cmV0dXJufWlmKGcpYy5vbk5leHQoYil9LGZ1bmN0aW9uKGEpe2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtjLm9uQ29tcGxldGVkKCl9KX0pfTtmLmdyb3VwQnlVbnRpbD1mdW5jdGlvbihhLGIsYyxkKXt2YXIgZT10aGlzO2J8fChiPVEpO2R8fChkPVxuVyk7cmV0dXJuIGkoZnVuY3Rpb24oZyl7dmFyIGg9e30sZj1uZXcgcCxpPW5ldyBaKGYpO2YuYWRkKGUuc3Vic2NyaWJlKGZ1bmN0aW9uKGUpe3ZhciBrLGosbSx0LG8scCx1LHMscjt0cnl7aj1hKGUpLHA9ZChqKX1jYXRjaCh3KXtmb3IociBpbiBoKWhbcl0ub25FcnJvcih3KTtnLm9uRXJyb3Iodyk7cmV0dXJufW89ITE7dHJ5e3M9aFtwXSxzfHwocz1uZXcgTyxoW3BdPXMsbz0hMCl9Y2F0Y2goeCl7Zm9yKHIgaW4gaCloW3JdLm9uRXJyb3IoeCk7Zy5vbkVycm9yKHgpO3JldHVybn1pZihvKXtvPW5ldyBiYShqLHMsaSk7aj1uZXcgYmEoaixzKTt0cnl7az1jKGopfWNhdGNoKHkpe2ZvcihyIGluIGgpaFtyXS5vbkVycm9yKHkpO2cub25FcnJvcih5KTtyZXR1cm59Zy5vbk5leHQobyk7dT1uZXcgdjtmLmFkZCh1KTt0PWZ1bmN0aW9uKCl7aFtwXSE9PW4mJihkZWxldGUgaFtwXSxzLm9uQ29tcGxldGVkKCkpO2YucmVtb3ZlKHUpfTt1LmRpc3Bvc2FibGUoay50YWtlKDEpLnN1YnNjcmliZShmdW5jdGlvbigpe30sXG5mdW5jdGlvbihhKXtmb3IociBpbiBoKWhbcl0ub25FcnJvcihhKTtnLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7dCgpfSkpfXRyeXttPWIoZSl9Y2F0Y2goQSl7Zm9yKHIgaW4gaCloW3JdLm9uRXJyb3IoQSk7Zy5vbkVycm9yKEEpO3JldHVybn1zLm9uTmV4dChtKX0sZnVuY3Rpb24oYSl7Zm9yKHZhciBiIGluIGgpaFtiXS5vbkVycm9yKGEpO2cub25FcnJvcihhKX0sZnVuY3Rpb24oKXtmb3IodmFyIGEgaW4gaCloW2FdLm9uQ29tcGxldGVkKCk7Zy5vbkNvbXBsZXRlZCgpfSkpO3JldHVybiBpfSl9O2YuZ3JvdXBCeT1mdW5jdGlvbihhLGIsYyl7cmV0dXJuIHRoaXMuZ3JvdXBCeVVudGlsKGEsYixmdW5jdGlvbigpe3JldHVybiBkYSgpfSxjKX07Zi50YWtlPWZ1bmN0aW9uKGEsYil7aWYoMD5hKXRocm93IEVycm9yKFwiQXJndW1lbnQgb3V0IG9mIHJhbmdlXCIpO2lmKDA9PWEpcmV0dXJuIHRhKGIpO3ZhciBjPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYil7dmFyIGU9YTtyZXR1cm4gYy5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7aWYoMDxcbmUmJihlLS0sYi5vbk5leHQoYSksMD09PWUpKWIub25Db21wbGV0ZWQoKX0sZnVuY3Rpb24oYSl7cmV0dXJuIGIub25FcnJvcihhKX0sZnVuY3Rpb24oKXtyZXR1cm4gYi5vbkNvbXBsZXRlZCgpfSl9KX07Zi5za2lwPWZ1bmN0aW9uKGEpe2lmKDA+YSl0aHJvdyBFcnJvcihcIkFyZ3VtZW50IG91dCBvZiByYW5nZVwiKTt2YXIgYj10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGMpe3ZhciBkPWE7cmV0dXJuIGIuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2lmKDA+PWQpYy5vbk5leHQoYSk7ZWxzZSBkLS19LGZ1bmN0aW9uKGEpe3JldHVybiBjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7cmV0dXJuIGMub25Db21wbGV0ZWQoKX0pfSl9O2YudGFrZVdoaWxlPWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9MCxlPSEwO3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbihiKXtpZihlKXt0cnl7ZT1hKGIsZCsrKX1jYXRjaChoKXtjLm9uRXJyb3IoaCk7cmV0dXJufWlmKGUpYy5vbk5leHQoYik7XG5lbHNlIGMub25Db21wbGV0ZWQoKX19LGZ1bmN0aW9uKGEpe3JldHVybiBjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7cmV0dXJuIGMub25Db21wbGV0ZWQoKX0pfSl9O2Yuc2tpcFdoaWxlPWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9MCxlPSExO3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbihiKXtpZighZSl0cnl7ZT0hYShiLGQrKyl9Y2F0Y2goaCl7Yy5vbkVycm9yKGgpO3JldHVybn1pZihlKWMub25OZXh0KGIpfSxmdW5jdGlvbihhKXtjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Yy5vbkNvbXBsZXRlZCgpfSl9KX07Zi5zZWxlY3RNYW55PWZ1bmN0aW9uKGEsYil7cmV0dXJuIGIhPT1uP3RoaXMuc2VsZWN0TWFueShmdW5jdGlvbihjKXtyZXR1cm4gYShjKS5zZWxlY3QoZnVuY3Rpb24oYSl7cmV0dXJuIGIoYyxhKX0pfSk6XCJmdW5jdGlvblwiPT09dHlwZW9mIGE/dGhpcy5zZWxlY3QoYSkubWVyZ2VPYnNlcnZhYmxlKCk6dGhpcy5zZWxlY3QoZnVuY3Rpb24oKXtyZXR1cm4gYX0pLm1lcmdlT2JzZXJ2YWJsZSgpfTtcbmYuZmluYWxWYWx1ZT1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYil7dmFyIGM9ITEsZDtyZXR1cm4gYS5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7Yz0hMDtkPWF9LGZ1bmN0aW9uKGEpe2Iub25FcnJvcihhKX0sZnVuY3Rpb24oKXtpZihjKWIub25OZXh0KGQpLGIub25Db21wbGV0ZWQoKTtlbHNlIGIub25FcnJvcihFcnJvcihcIlNlcXVlbmNlIGNvbnRhaW5zIG5vIGVsZW1lbnRzLlwiKSl9KX0pfTtmLnRvQXJyYXk9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5zY2FuKFtdLGZ1bmN0aW9uKGEsYil7YS5wdXNoKGIpO3JldHVybiBhfSkuc3RhcnRXaXRoKFtdKS5maW5hbFZhbHVlKCl9O2YubWF0ZXJpYWxpemU9ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGIpe3JldHVybiBhLnN1YnNjcmliZShmdW5jdGlvbihhKXtiLm9uTmV4dCh0LmNyZWF0ZU9uTmV4dChhKSl9LGZ1bmN0aW9uKGEpe2Iub25OZXh0KHQuY3JlYXRlT25FcnJvcihhKSk7XG5iLm9uQ29tcGxldGVkKCl9LGZ1bmN0aW9uKCl7Yi5vbk5leHQodC5jcmVhdGVPbkNvbXBsZXRlZCgpKTtiLm9uQ29tcGxldGVkKCl9KX0pfTtmLmRlbWF0ZXJpYWxpemU9ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGIpe3JldHVybiBhLnN1YnNjcmliZShmdW5jdGlvbihhKXtyZXR1cm4gYS5hY2NlcHQoYil9LGZ1bmN0aW9uKGEpe2Iub25FcnJvcihhKX0sZnVuY3Rpb24oKXtiLm9uQ29tcGxldGVkKCl9KX0pfTtmLmFzT2JzZXJ2YWJsZT1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYil7cmV0dXJuIGEuc3Vic2NyaWJlKGIpfSl9O2Yud2luZG93V2l0aENvdW50PWZ1bmN0aW9uKGEsYil7dmFyIGM9dGhpcztpZigwPj1hKXRocm93IEVycm9yKFwiQXJndW1lbnQgb3V0IG9mIHJhbmdlXCIpO2I9PT1uJiYoYj1hKTtpZigwPj1iKXRocm93IEVycm9yKFwiQXJndW1lbnQgb3V0IG9mIHJhbmdlXCIpO3JldHVybiBpKGZ1bmN0aW9uKGQpe3ZhciBlPVxubmV3IHYsZz1uZXcgWihlKSxoPTAsZj1bXSxpPWZ1bmN0aW9uKCl7dmFyIGE9bmV3IE87Zi5wdXNoKGEpO2Qub25OZXh0KGphKGEsZykpfTtpKCk7ZS5kaXNwb3NhYmxlKGMuc3Vic2NyaWJlKGZ1bmN0aW9uKGMpe3ZhciBkO2ZvcihkPTA7ZDxmLmxlbmd0aDtkKyspZltkXS5vbk5leHQoYyk7Yz1oLWErMTswPD1jJiYwPT09YyViJiYoYz1mLnNoaWZ0KCksYy5vbkNvbXBsZXRlZCgpKTtoKys7MD09PWglYiYmaSgpfSxmdW5jdGlvbihhKXtmb3IoOzA8Zi5sZW5ndGg7KWYuc2hpZnQoKS5vbkVycm9yKGEpO2Qub25FcnJvcihhKX0sZnVuY3Rpb24oKXtmb3IoOzA8Zi5sZW5ndGg7KWYuc2hpZnQoKS5vbkNvbXBsZXRlZCgpO2Qub25Db21wbGV0ZWQoKX0pKTtyZXR1cm4gZ30pfTtmLmJ1ZmZlcldpdGhDb3VudD1mdW5jdGlvbihhLGIpe2I9PT1uJiYoYj1hKTtyZXR1cm4gdGhpcy53aW5kb3dXaXRoQ291bnQoYSxiKS5zZWxlY3RNYW55KGZ1bmN0aW9uKGEpe3JldHVybiBhLnRvQXJyYXkoKX0pLndoZXJlKGZ1bmN0aW9uKGEpe3JldHVybiAwPFxuYS5sZW5ndGh9KX07Zi5zdGFydFdpdGg9ZnVuY3Rpb24oKXt2YXIgYSxiO2E9MDswPGFyZ3VtZW50cy5sZW5ndGgmJnZvaWQgMCE9PWFyZ3VtZW50c1swXS5ub3c/KGI9YXJndW1lbnRzWzBdLGE9MSk6Yj1CO2E9eS5jYWxsKGFyZ3VtZW50cyxhKTtyZXR1cm4gUyhbZ2EoYSxiKSx0aGlzXSkuY29uY2F0KCl9O2Yuc2Nhbj1mdW5jdGlvbihhLGIpe3ZhciBjPXRoaXM7cmV0dXJuIGZhKGZ1bmN0aW9uKCl7dmFyIGQ9ITEsZTtyZXR1cm4gYy5zZWxlY3QoZnVuY3Rpb24oYyl7ZD9lPWIoZSxjKTooZT1iKGEsYyksZD0hMCk7cmV0dXJuIGV9KX0pfTtmLnNjYW4xPWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7cmV0dXJuIGZhKGZ1bmN0aW9uKCl7dmFyIGM9ITEsZDtyZXR1cm4gYi5zZWxlY3QoZnVuY3Rpb24oYil7Yz9kPWEoZCxiKTooZD1iLGM9ITApO3JldHVybiBkfSl9KX07Zi5kaXN0aW5jdFVudGlsQ2hhbmdlZD1mdW5jdGlvbihhLGIpe3ZhciBjPXRoaXM7YXx8KGE9USk7Ynx8KGI9Vik7XG5yZXR1cm4gaShmdW5jdGlvbihkKXt2YXIgZT0hMSxnO3JldHVybiBjLnN1YnNjcmliZShmdW5jdGlvbihjKXt2YXIgZj0hMSxpO3RyeXtpPWEoYyl9Y2F0Y2goail7ZC5vbkVycm9yKGopO3JldHVybn1pZihlKXRyeXtmPWIoZyxpKX1jYXRjaChrKXtkLm9uRXJyb3Ioayk7cmV0dXJufWlmKCFlfHwhZillPSEwLGc9aSxkLm9uTmV4dChjKX0sZnVuY3Rpb24oYSl7ZC5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2Qub25Db21wbGV0ZWQoKX0pfSl9O2YuZmluYWxseUFjdGlvbj1mdW5jdGlvbihhKXt2YXIgYj10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGMpe3ZhciBkPWIuc3Vic2NyaWJlKGMpO3JldHVybiBBKGZ1bmN0aW9uKCl7dHJ5e2QuZGlzcG9zZSgpfWZpbmFsbHl7YSgpfX0pfSl9O2YuZG9BY3Rpb249ZnVuY3Rpb24oYSxiLGMpe3ZhciBkPXRoaXMsZTswPT1hcmd1bWVudHMubGVuZ3RofHwxPGFyZ3VtZW50cy5sZW5ndGh8fFwiZnVuY3Rpb25cIj09dHlwZW9mIGE/ZT1hOihlPWZ1bmN0aW9uKGIpe2Eub25OZXh0KGIpfSxcbmI9ZnVuY3Rpb24oYil7YS5vbkVycm9yKGIpfSxjPWZ1bmN0aW9uKCl7YS5vbkNvbXBsZXRlZCgpfSk7cmV0dXJuIGkoZnVuY3Rpb24oYSl7cmV0dXJuIGQuc3Vic2NyaWJlKGZ1bmN0aW9uKGIpe3RyeXtlKGIpfWNhdGNoKGMpe2Eub25FcnJvcihjKX1hLm9uTmV4dChiKX0sZnVuY3Rpb24oYyl7aWYoYil0cnl7YihjKX1jYXRjaChkKXthLm9uRXJyb3IoZCl9YS5vbkVycm9yKGMpfSxmdW5jdGlvbigpe2lmKGMpdHJ5e2MoKX1jYXRjaChiKXthLm9uRXJyb3IoYil9YS5vbkNvbXBsZXRlZCgpfSl9KX07Zi5za2lwTGFzdD1mdW5jdGlvbihhKXt2YXIgYj10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGMpe3ZhciBkPVtdO3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbihiKXtkLnB1c2goYik7aWYoZC5sZW5ndGg+YSljLm9uTmV4dChkLnNoaWZ0KCkpfSxmdW5jdGlvbihhKXtjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Yy5vbkNvbXBsZXRlZCgpfSl9KX07Zi50YWtlTGFzdD1mdW5jdGlvbihhKXt2YXIgYj1cbnRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9W107cmV0dXJuIGIuc3Vic2NyaWJlKGZ1bmN0aW9uKGIpe2QucHVzaChiKTtkLmxlbmd0aD5hJiZkLnNoaWZ0KCl9LGZ1bmN0aW9uKGEpe2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtmb3IoOzA8ZC5sZW5ndGg7KWMub25OZXh0KGQuc2hpZnQoKSk7Yy5vbkNvbXBsZXRlZCgpfSl9KX07Zi5pZ25vcmVFbGVtZW50cz1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYil7cmV0dXJuIGEuc3Vic2NyaWJlKGlhLGZ1bmN0aW9uKGEpe2Iub25FcnJvcihhKX0sZnVuY3Rpb24oKXtiLm9uQ29tcGxldGVkKCl9KX0pfTtmLmVsZW1lbnRBdD1mdW5jdGlvbihhKXtpZigwPmEpdGhyb3cgRXJyb3IoXCJBcmd1bWVudCBvdXQgb2YgcmFuZ2VcIik7dmFyIGI9dGhpcztyZXR1cm4gaShmdW5jdGlvbihjKXt2YXIgZD1hO3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbihhKXswPT09ZCYmKGMub25OZXh0KGEpLGMub25Db21wbGV0ZWQoKSk7XG5kLS19LGZ1bmN0aW9uKGEpe2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtjLm9uRXJyb3IoRXJyb3IoXCJBcmd1bWVudCBvdXQgb2YgcmFuZ2VcIikpfSl9KX07Zi5lbGVtZW50QXRPckRlZmF1bHQ9ZnVuY3Rpb24oYSxiKXt2YXIgYz10aGlzO2lmKDA+YSl0aHJvdyBFcnJvcihcIkFyZ3VtZW50IG91dCBvZiByYW5nZVwiKTtiPT09biYmKGI9bnVsbCk7cmV0dXJuIGkoZnVuY3Rpb24oZCl7dmFyIGU9YTtyZXR1cm4gYy5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7MD09PWUmJihkLm9uTmV4dChhKSxkLm9uQ29tcGxldGVkKCkpO2UtLX0sZnVuY3Rpb24oYSl7ZC5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2Qub25OZXh0KGIpO2Qub25Db21wbGV0ZWQoKX0pfSl9O2YuZGVmYXVsdElmRW1wdHk9ZnVuY3Rpb24oYSl7dmFyIGI9dGhpczthPT09biYmKGE9bnVsbCk7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9ITE7cmV0dXJuIGIuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2Q9ITA7Yy5vbk5leHQoYSl9LFxuZnVuY3Rpb24oYSl7Yy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2lmKCFkKWMub25OZXh0KGEpO2Mub25Db21wbGV0ZWQoKX0pfSl9O2YuZGlzdGluY3Q9ZnVuY3Rpb24oYSxiKXt2YXIgYz10aGlzO2F8fChhPVEpO2J8fChiPVcpO3JldHVybiBpKGZ1bmN0aW9uKGQpe3ZhciBlPXt9O3JldHVybiBjLnN1YnNjcmliZShmdW5jdGlvbihjKXt2YXIgZixpLGoscT0hMTt0cnl7Zj1hKGMpLGk9YihmKX1jYXRjaChrKXtkLm9uRXJyb3Ioayk7cmV0dXJufWZvcihqIGluIGUpaWYoaT09PWope3E9ITA7YnJlYWt9cXx8KGVbaV09bnVsbCxkLm9uTmV4dChjKSl9LGZ1bmN0aW9uKGEpe2Qub25FcnJvcihhKX0sZnVuY3Rpb24oKXtkLm9uQ29tcGxldGVkKCl9KX0pfTtmLm1lcmdlT2JzZXJ2YWJsZT1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYil7dmFyIGM9bmV3IHAsZD0hMSxlPW5ldyB2O2MuYWRkKGUpO2UuZGlzcG9zYWJsZShhLnN1YnNjcmliZShmdW5jdGlvbihhKXt2YXIgZT1cbm5ldyB2O2MuYWRkKGUpO2UuZGlzcG9zYWJsZShhLnN1YnNjcmliZShmdW5jdGlvbihhKXtiLm9uTmV4dChhKX0sZnVuY3Rpb24oYSl7Yi5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2MucmVtb3ZlKGUpO2lmKGQmJjE9PT1jLmNvdW50KCkpYi5vbkNvbXBsZXRlZCgpfSkpfSxmdW5jdGlvbihhKXtiLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7ZD0hMDtpZigxPT09Yy5jb3VudCgpKWIub25Db21wbGV0ZWQoKX0pKTtyZXR1cm4gY30pfTtmLm1lcmdlPWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9MCxlPW5ldyBwLGc9ITEsZj1bXSxpPWZ1bmN0aW9uKGEpe3ZhciBiPW5ldyB2O2UuYWRkKGIpO2IuZGlzcG9zYWJsZShhLnN1YnNjcmliZShmdW5jdGlvbihhKXtjLm9uTmV4dChhKX0sZnVuY3Rpb24oYSl7Yy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe3ZhciBhO2UucmVtb3ZlKGIpO2lmKDA8Zi5sZW5ndGgpYT1mLnNoaWZ0KCksaShhKTtlbHNlIGlmKGQtLSxcbmcmJjA9PT1kKWMub25Db21wbGV0ZWQoKX0pKX07ZS5hZGQoYi5zdWJzY3JpYmUoZnVuY3Rpb24oYil7ZDxhPyhkKyssaShiKSk6Zi5wdXNoKGIpfSxmdW5jdGlvbihhKXtjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Zz0hMDtpZigwPT09ZCljLm9uQ29tcGxldGVkKCl9KSk7cmV0dXJuIGV9KX07Zi5zd2l0Y2hMYXRlc3Q9ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGIpe3ZhciBjPSExLGQ9bmV3IEMsZT0hMSxnPTAsZj1hLnN1YnNjcmliZShmdW5jdGlvbihhKXt2YXIgZj1uZXcgdixoPSsrZztjPSEwO2QuZGlzcG9zYWJsZShmKTtyZXR1cm4gZi5kaXNwb3NhYmxlKGEuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2lmKGc9PT1oKWIub25OZXh0KGEpfSxmdW5jdGlvbihhKXtpZihnPT09aCliLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7aWYoZz09PWgmJihjPSExLGUpKWIub25Db21wbGV0ZWQoKX0pKX0sZnVuY3Rpb24oYSl7Yi5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2U9XG4hMDtpZighYyliLm9uQ29tcGxldGVkKCl9KTtyZXR1cm4gbmV3IHAoZixkKX0pfTtqLm1lcmdlPWZ1bmN0aW9uKGEpe2F8fChhPUIpO3ZhciBiPTE8YXJndW1lbnRzLmxlbmd0aCYmYXJndW1lbnRzWzFdaW5zdGFuY2VvZiBBcnJheT9hcmd1bWVudHNbMV06eS5jYWxsKGFyZ3VtZW50cywxKTtyZXR1cm4gZ2EoYixhKS5tZXJnZU9ic2VydmFibGUoKX07Zi5jb25jYXQ9ZnVuY3Rpb24oKXt2YXIgYT13YSxiO2I9YXJndW1lbnRzO3ZhciBjLGQ7Yz1bXTtmb3IoZD0wO2Q8Yi5sZW5ndGg7ZCsrKWMucHVzaChiW2RdKTtiPWM7Yi51bnNoaWZ0KHRoaXMpO3JldHVybiBhLmFwcGx5KHRoaXMsYil9O2YuY29uY2F0T2JzZXJ2YWJsZT1mdW5jdGlvbigpe3JldHVybiB0aGlzLm1lcmdlKDEpfTt2YXIgd2E9ai5jb25jYXQ9ZnVuY3Rpb24oKXt2YXIgYT0xPT09YXJndW1lbnRzLmxlbmd0aCYmYXJndW1lbnRzWzBdaW5zdGFuY2VvZiBBcnJheT9hcmd1bWVudHNbMF06eS5jYWxsKGFyZ3VtZW50cyk7XG5yZXR1cm4gUyhhKS5jb25jYXQoKX07Zi5jYXRjaEV4Y2VwdGlvbj1mdW5jdGlvbihhKXtyZXR1cm5cImZ1bmN0aW9uXCI9PT10eXBlb2YgYT94YSh0aGlzLGEpOnlhKFt0aGlzLGFdKX07dmFyIHhhPWZ1bmN0aW9uKGEsYil7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9bmV3IHYsZT1uZXcgQztkLmRpc3Bvc2FibGUoYS5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7Yy5vbk5leHQoYSl9LGZ1bmN0aW9uKGEpe3ZhciBkO3RyeXtkPWIoYSl9Y2F0Y2goZil7Yy5vbkVycm9yKGYpO3JldHVybn1hPW5ldyB2O2UuZGlzcG9zYWJsZShhKTthLmRpc3Bvc2FibGUoZC5zdWJzY3JpYmUoYykpfSxmdW5jdGlvbigpe2Mub25Db21wbGV0ZWQoKX0pKTtyZXR1cm4gZX0pfSx5YT1qLmNhdGNoRXhjZXB0aW9uPWZ1bmN0aW9uKCl7dmFyIGE9MT09PWFyZ3VtZW50cy5sZW5ndGgmJmFyZ3VtZW50c1swXWluc3RhbmNlb2YgQXJyYXk/YXJndW1lbnRzWzBdOnkuY2FsbChhcmd1bWVudHMpO3JldHVybiBTKGEpLmNhdGNoRXhjZXB0aW9uKCl9O1xuZi5vbkVycm9yUmVzdW1lTmV4dD1mdW5jdGlvbihhKXtyZXR1cm4gemEoW3RoaXMsYV0pfTt2YXIgemE9ai5vbkVycm9yUmVzdW1lTmV4dD1mdW5jdGlvbigpe3ZhciBhPTE9PT1hcmd1bWVudHMubGVuZ3RoJiZhcmd1bWVudHNbMF1pbnN0YW5jZW9mIEFycmF5P2FyZ3VtZW50c1swXTp5LmNhbGwoYXJndW1lbnRzKTtyZXR1cm4gaShmdW5jdGlvbihiKXt2YXIgYz0wLGQ9bmV3IEMsZT1CLnNjaGVkdWxlUmVjdXJzaXZlKGZ1bmN0aW9uKGUpe3ZhciBmLGk7aWYoYzxhLmxlbmd0aClmPWFbYysrXSxpPW5ldyB2LGQuZGlzcG9zYWJsZShpKSxpLmRpc3Bvc2FibGUoZi5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7Yi5vbk5leHQoYSl9LGZ1bmN0aW9uKCl7ZSgpfSxmdW5jdGlvbigpe2UoKX0pKTtlbHNlIGIub25Db21wbGV0ZWQoKX0pO3JldHVybiBuZXcgcChkLGUpfSl9LEFhPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShhLGMpe3ZhciBkPXRoaXM7dGhpcy5zZWxlY3Rvcj1hO3RoaXMub2JzZXJ2ZXI9XG5jO3RoaXMubGVmdFE9W107dGhpcy5yaWdodFE9W107dGhpcy5sZWZ0PUkoZnVuY3Rpb24oYSl7aWYoXCJFXCI9PT1hLmtpbmQpZC5vYnNlcnZlci5vbkVycm9yKGEuZXhjZXB0aW9uKTtlbHNlIGlmKDA9PT1kLnJpZ2h0US5sZW5ndGgpZC5sZWZ0US5wdXNoKGEpO2Vsc2UgZC5vbk5leHQoYSxkLnJpZ2h0US5zaGlmdCgpKX0pO3RoaXMucmlnaHQ9SShmdW5jdGlvbihhKXtpZihcIkVcIj09PWEua2luZClkLm9ic2VydmVyLm9uRXJyb3IoYS5leGNlcHRpb24pO2Vsc2UgaWYoMD09PWQubGVmdFEubGVuZ3RoKWQucmlnaHRRLnB1c2goYSk7ZWxzZSBkLm9uTmV4dChkLmxlZnRRLnNoaWZ0KCksYSl9KX1hLnByb3RvdHlwZS5vbk5leHQ9ZnVuY3Rpb24oYSxjKXt2YXIgZDtpZihcIkNcIj09PWEua2luZHx8XCJDXCI9PT1jLmtpbmQpdGhpcy5vYnNlcnZlci5vbkNvbXBsZXRlZCgpO2Vsc2V7dHJ5e2Q9dGhpcy5zZWxlY3RvcihhLnZhbHVlLGMudmFsdWUpfWNhdGNoKGUpe3RoaXMub2JzZXJ2ZXIub25FcnJvcihlKTtcbnJldHVybn10aGlzLm9ic2VydmVyLm9uTmV4dChkKX19O3JldHVybiBhfSgpO2YuemlwPWZ1bmN0aW9uKGEsYil7cmV0dXJuIEYodGhpcyxhLGZ1bmN0aW9uKGEpe3ZhciBkPW5ldyBBYShiLGEpO3JldHVybiBuZXcgSChmdW5jdGlvbihhKXtyZXR1cm4gZC5sZWZ0Lm9uTmV4dChhKX0sZnVuY3Rpb24oYSl7cmV0dXJuIGQucmlnaHQub25OZXh0KGEpfSl9KX07dmFyIGhhO2hhPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShhLGMpe3ZhciBkPXRoaXM7dGhpcy5zZWxlY3Rvcj1hO3RoaXMub2JzZXJ2ZXI9Yzt0aGlzLnJpZ2h0U3RvcHBlZD10aGlzLmxlZnRTdG9wcGVkPSExO3RoaXMubGVmdD1JKGZ1bmN0aW9uKGEpe2lmKFwiTlwiPT09YS5raW5kKWlmKGQubGVmdFZhbHVlPWEsZC5yaWdodFZhbHVlIT09bilkLm9uTmV4dCgpO2Vsc2V7aWYoZC5yaWdodFN0b3BwZWQpZC5vYnNlcnZlci5vbkNvbXBsZXRlZCgpfWVsc2UgaWYoXCJFXCI9PT1hLmtpbmQpZC5vYnNlcnZlci5vbkVycm9yKGEuZXhjZXB0aW9uKTtcbmVsc2UgaWYoZC5sZWZ0U3RvcHBlZD0hMCxkLnJpZ2h0U3RvcHBlZClkLm9ic2VydmVyLm9uQ29tcGxldGVkKCl9KTt0aGlzLnJpZ2h0PUkoZnVuY3Rpb24oYSl7aWYoXCJOXCI9PT1hLmtpbmQpaWYoZC5yaWdodFZhbHVlPWEsZC5sZWZ0VmFsdWUhPT1uKWQub25OZXh0KCk7ZWxzZXtpZihkLmxlZnRTdG9wcGVkKWQub2JzZXJ2ZXIub25Db21wbGV0ZWQoKX1lbHNlIGlmKFwiRVwiPT09YS5raW5kKWQub2JzZXJ2ZXIub25FcnJvcihhLmV4Y2VwdGlvbik7ZWxzZSBpZihkLnJpZ2h0U3RvcHBlZD0hMCxkLmxlZnRTdG9wcGVkKWQub2JzZXJ2ZXIub25Db21wbGV0ZWQoKX0pfWEucHJvdG90eXBlLm9uTmV4dD1mdW5jdGlvbigpe3ZhciBhO3RyeXthPXRoaXMuc2VsZWN0b3IodGhpcy5sZWZ0VmFsdWUudmFsdWUsdGhpcy5yaWdodFZhbHVlLnZhbHVlKX1jYXRjaChjKXt0aGlzLm9ic2VydmVyLm9uRXJyb3IoYyk7cmV0dXJufXRoaXMub2JzZXJ2ZXIub25OZXh0KGEpfTtyZXR1cm4gYX0oKTtmLmNvbWJpbmVMYXRlc3Q9XG5mdW5jdGlvbihhLGIpe3JldHVybiBGKHRoaXMsYSxmdW5jdGlvbihhKXt2YXIgZD1uZXcgaGEoYixhKTtyZXR1cm4gbmV3IEgoZnVuY3Rpb24oYSl7cmV0dXJuIGQubGVmdC5vbk5leHQoYSl9LGZ1bmN0aW9uKGEpe3JldHVybiBkLnJpZ2h0Lm9uTmV4dChhKX0pfSl9O2YudGFrZVVudGlsPWZ1bmN0aW9uKGEpe3JldHVybiBGKGEsdGhpcyxmdW5jdGlvbihhLGMpe3ZhciBkPSExLGU9ITE7cmV0dXJuIG5ldyBIKGZ1bmN0aW9uKGMpeyFlJiYhZCYmKFwiQ1wiPT09Yy5raW5kP2Q9ITA6XCJFXCI9PT1jLmtpbmQ/KGU9ZD0hMCxhLm9uRXJyb3IoYy5leGNlcHRpb24pKTooZT0hMCxhLm9uQ29tcGxldGVkKCkpKX0sZnVuY3Rpb24oZCl7ZXx8KGQuYWNjZXB0KGEpLChlPVwiTlwiIT09ZC5raW5kKSYmYy5kaXNwb3NlKCkpfSl9KX07Zi5za2lwVW50aWw9ZnVuY3Rpb24oYSl7cmV0dXJuIEYodGhpcyxhLGZ1bmN0aW9uKGEsYyxkKXt2YXIgZT0hMSxmPSExO3JldHVybiBuZXcgSChmdW5jdGlvbihjKXtpZihcIkVcIj09XG5jLmtpbmQpYS5vbkVycm9yKGMuZXhjZXB0aW9uKTtlbHNlIGUmJmMuYWNjZXB0KGEpfSxmdW5jdGlvbihjKXtpZighZil7aWYoXCJOXCI9PT1jLmtpbmQpZT0hMDtlbHNlIGlmKFwiRVwiPT09Yy5raW5kKWEub25FcnJvcihjLmV4Y2VwdGlvbik7Zj0hMDtkLmRpc3Bvc2UoKX19KX0pfTtqLmFtYj1mdW5jdGlvbigpe3ZhciBhPWRhKCksYixjPTE9PT1hcmd1bWVudHMubGVuZ3RoJiZhcmd1bWVudHNbMF1pbnN0YW5jZW9mIEFycmF5P2FyZ3VtZW50c1swXTp5LmNhbGwoYXJndW1lbnRzKTtmb3IoYj0wO2I8Yy5sZW5ndGg7YisrKWE9YS5hbWIoY1tiXSk7cmV0dXJuIGF9O2YuYW1iPWZ1bmN0aW9uKGEpe3JldHVybiBGKHRoaXMsYSxmdW5jdGlvbihhLGMsZCl7dmFyIGU9XCJOXCI7cmV0dXJuIG5ldyBIKGZ1bmN0aW9uKGMpe1wiTlwiPT09ZSYmKGU9XCJMXCIsZC5kaXNwb3NlKCkpO1wiTFwiPT09ZSYmYy5hY2NlcHQoYSl9LGZ1bmN0aW9uKGQpe1wiTlwiPT09ZSYmKGU9XCJSXCIsYy5kaXNwb3NlKCkpO1wiUlwiPT09XG5lJiZkLmFjY2VwdChhKX0pfSl9fTtcbiIsIi8qXG4gQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uICBBbGwgcmlnaHRzIHJlc2VydmVkLlxuIFRoaXMgY29kZSBpcyBsaWNlbnNlZCBieSBNaWNyb3NvZnQgQ29ycG9yYXRpb24gdW5kZXIgdGhlIHRlcm1zXG4gb2YgdGhlIE1JQ1JPU09GVCBSRUFDVElWRSBFWFRFTlNJT05TIEZPUiBKQVZBU0NSSVBUIEFORCAuTkVUIExJQlJBUklFUyBMaWNlbnNlLlxuIFNlZSBodHRwOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP0xpbmtJRD0yMjA3NjIuXG4qL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihxLGgpe3ZhciBmO2Y9cS5SeDt2YXIgej1mLk9ic2VydmFibGUsdT1mLkNvbXBvc2l0ZURpc3Bvc2FibGUsRT1mLlJlZkNvdW50RGlzcG9zYWJsZSxzPWYuU2luZ2xlQXNzaWdubWVudERpc3Bvc2FibGUsSz1mLlNlcmlhbERpc3Bvc2FibGUsQT1mLlN1YmplY3Q7Zj16LnByb3RvdHlwZTt2YXIgTD16LmVtcHR5LHY9ei5jcmVhdGVXaXRoRGlzcG9zYWJsZSxNPWZ1bmN0aW9uKGIsYSl7cmV0dXJuIGI9PT1hfSxOPWZ1bmN0aW9uKCl7fSxCPWZ1bmN0aW9uKGIsYSl7cmV0dXJuIHYoZnVuY3Rpb24oYyl7cmV0dXJuIG5ldyB1KGEuZ2V0RGlzcG9zYWJsZSgpLGIuc3Vic2NyaWJlKGMpKX0pfSxDLEYsbyxHLHcseDtvPVsxLDMsNywxMywzMSw2MSwxMjcsMjUxLDUwOSwxMDIxLDIwMzksNDA5Myw4MTkxLDE2MzgxLFxuMzI3NDksNjU1MjEsMTMxMDcxLDI2MjEzOSw1MjQyODcsMTA0ODU3MywyMDk3MTQzLDQxOTQzMDEsODM4ODU5MywxNjc3NzIxMywzMzU1NDM5Myw2NzEwODg1OSwxMzQyMTc2ODksMjY4NDM1Mzk5LDUzNjg3MDkwOSwxMDczNzQxNzg5LDIxNDc0ODM2NDddO0Y9ZnVuY3Rpb24oYil7dmFyIGEsYztpZihiJjApcmV0dXJuIDI9PT1iO2E9TWF0aC5zcXJ0KGIpO2ZvcihjPTM7Yzw9YTspe2lmKDA9PT1iJWMpcmV0dXJuITE7Yys9Mn1yZXR1cm4hMH07Qz1mdW5jdGlvbihiKXt2YXIgYSxjO2ZvcihhPTA7YTxvLmxlbmd0aDsrK2EpaWYoYz1vW2FdLGM+PWIpcmV0dXJuIGM7Zm9yKGE9YnwxO2E8b1tvLmxlbmd0aC0xXTspe2lmKEYoYSkpcmV0dXJuIGE7YSs9Mn1yZXR1cm4gYn07Rz0wO3c9ZnVuY3Rpb24oYil7dmFyIGE7aWYoYj09PWgpdGhyb3dcIm5vIHN1Y2gga2V5XCI7aWYoYi5nZXRIYXNoQ29kZSE9PWgpcmV0dXJuIGIuZ2V0SGFzaENvZGUoKTthPTE3KkcrKztiLmdldEhhc2hDb2RlPWZ1bmN0aW9uKCl7cmV0dXJuIGF9O1xucmV0dXJuIGF9O3g9ZnVuY3Rpb24oKXtyZXR1cm57a2V5Om51bGwsdmFsdWU6bnVsbCxuZXh0OjAsaGFzaENvZGU6MH19O3ZhciB5PWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYihhLGMpe3RoaXMuX2luaXRpYWxpemUoYSk7dGhpcy5jb21wYXJlcj1jfHxNO3RoaXMuc2l6ZT10aGlzLmZyZWVDb3VudD0wO3RoaXMuZnJlZUxpc3Q9LTF9Yi5wcm90b3R5cGUuX2luaXRpYWxpemU9ZnVuY3Rpb24oYSl7dmFyIGE9QyhhKSxjO3RoaXMuYnVja2V0cz1BcnJheShhKTt0aGlzLmVudHJpZXM9QXJyYXkoYSk7Zm9yKGM9MDtjPGE7YysrKXRoaXMuYnVja2V0c1tjXT0tMSx0aGlzLmVudHJpZXNbY109eCgpO3RoaXMuZnJlZUxpc3Q9LTF9O2IucHJvdG90eXBlLmNvdW50PWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuc2l6ZX07Yi5wcm90b3R5cGUuYWRkPWZ1bmN0aW9uKGEsYyl7cmV0dXJuIHRoaXMuX2luc2VydChhLGMsITApfTtiLnByb3RvdHlwZS5faW5zZXJ0PWZ1bmN0aW9uKGEsYyxiKXt2YXIgZSxkLFxuZzt0aGlzLmJ1Y2tldHM9PT1oJiZ0aGlzLl9pbml0aWFsaXplKDApO2c9dyhhKSYyMTQ3NDgzNjQ3O2U9ZyV0aGlzLmJ1Y2tldHMubGVuZ3RoO2ZvcihkPXRoaXMuYnVja2V0c1tlXTswPD1kO2Q9dGhpcy5lbnRyaWVzW2RdLm5leHQpaWYodGhpcy5lbnRyaWVzW2RdLmhhc2hDb2RlPT09ZyYmdGhpcy5jb21wYXJlcih0aGlzLmVudHJpZXNbZF0ua2V5LGEpKXtpZihiKXRocm93XCJkdXBsaWNhdGUga2V5XCI7dGhpcy5lbnRyaWVzW2RdLnZhbHVlPWM7cmV0dXJufTA8dGhpcy5mcmVlQ291bnQ/KGI9dGhpcy5mcmVlTGlzdCx0aGlzLmZyZWVMaXN0PXRoaXMuZW50cmllc1tiXS5uZXh0LC0tdGhpcy5mcmVlQ291bnQpOih0aGlzLnNpemU9PT10aGlzLmVudHJpZXMubGVuZ3RoJiYodGhpcy5fcmVzaXplKCksZT1nJXRoaXMuYnVja2V0cy5sZW5ndGgpLGI9dGhpcy5zaXplLCsrdGhpcy5zaXplKTt0aGlzLmVudHJpZXNbYl0uaGFzaENvZGU9Zzt0aGlzLmVudHJpZXNbYl0ubmV4dD10aGlzLmJ1Y2tldHNbZV07XG50aGlzLmVudHJpZXNbYl0ua2V5PWE7dGhpcy5lbnRyaWVzW2JdLnZhbHVlPWM7dGhpcy5idWNrZXRzW2VdPWJ9O2IucHJvdG90eXBlLl9yZXNpemU9ZnVuY3Rpb24oKXt2YXIgYSxjLGIsZSxkO2Q9QygyKnRoaXMuc2l6ZSk7Yj1BcnJheShkKTtmb3IoYT0wO2E8Yi5sZW5ndGg7KythKWJbYV09LTE7ZT1BcnJheShkKTtmb3IoYT0wO2E8dGhpcy5zaXplOysrYSllW2FdPXRoaXMuZW50cmllc1thXTtmb3IoYT10aGlzLnNpemU7YTxkOysrYSllW2FdPXgoKTtmb3IoYT0wO2E8dGhpcy5zaXplOysrYSljPWVbYV0uaGFzaENvZGUlZCxlW2FdLm5leHQ9YltjXSxiW2NdPWE7dGhpcy5idWNrZXRzPWI7dGhpcy5lbnRyaWVzPWV9O2IucHJvdG90eXBlLnJlbW92ZT1mdW5jdGlvbihhKXt2YXIgYixrLGUsZDtpZih0aGlzLmJ1Y2tldHMhPT1oKXtkPXcoYSkmMjE0NzQ4MzY0NztiPWQldGhpcy5idWNrZXRzLmxlbmd0aDtrPS0xO2ZvcihlPXRoaXMuYnVja2V0c1tiXTswPD1lO2U9dGhpcy5lbnRyaWVzW2VdLm5leHQpe2lmKHRoaXMuZW50cmllc1tlXS5oYXNoQ29kZT09PVxuZCYmdGhpcy5jb21wYXJlcih0aGlzLmVudHJpZXNbZV0ua2V5LGEpKXJldHVybiAwPms/dGhpcy5idWNrZXRzW2JdPXRoaXMuZW50cmllc1tlXS5uZXh0OnRoaXMuZW50cmllc1trXS5uZXh0PXRoaXMuZW50cmllc1tlXS5uZXh0LHRoaXMuZW50cmllc1tlXS5oYXNoQ29kZT0tMSx0aGlzLmVudHJpZXNbZV0ubmV4dD10aGlzLmZyZWVMaXN0LHRoaXMuZW50cmllc1tlXS5rZXk9bnVsbCx0aGlzLmVudHJpZXNbZV0udmFsdWU9bnVsbCx0aGlzLmZyZWVMaXN0PWUsKyt0aGlzLmZyZWVDb3VudCwhMDtrPWV9fXJldHVybiExfTtiLnByb3RvdHlwZS5jbGVhcj1mdW5jdGlvbigpe3ZhciBhO2lmKCEoMD49dGhpcy5zaXplKSl7Zm9yKGE9MDthPHRoaXMuYnVja2V0cy5sZW5ndGg7KythKXRoaXMuYnVja2V0c1thXT0tMTtmb3IoYT0wO2E8dGhpcy5zaXplOysrYSl0aGlzLmVudHJpZXNbYV09eCgpO3RoaXMuZnJlZUxpc3Q9LTE7dGhpcy5zaXplPTB9fTtiLnByb3RvdHlwZS5fZmluZEVudHJ5PVxuZnVuY3Rpb24oYSl7dmFyIGIsaztpZih0aGlzLmJ1Y2tldHMhPT1oKXtrPXcoYSkmMjE0NzQ4MzY0Nztmb3IoYj10aGlzLmJ1Y2tldHNbayV0aGlzLmJ1Y2tldHMubGVuZ3RoXTswPD1iO2I9dGhpcy5lbnRyaWVzW2JdLm5leHQpaWYodGhpcy5lbnRyaWVzW2JdLmhhc2hDb2RlPT09ayYmdGhpcy5jb21wYXJlcih0aGlzLmVudHJpZXNbYl0ua2V5LGEpKXJldHVybiBifXJldHVybi0xfTtiLnByb3RvdHlwZS5jb3VudD1mdW5jdGlvbigpe3JldHVybiB0aGlzLnNpemUtdGhpcy5mcmVlQ291bnR9O2IucHJvdG90eXBlLnRyeUdldEVudHJ5PWZ1bmN0aW9uKGEpe2E9dGhpcy5fZmluZEVudHJ5KGEpO3JldHVybiAwPD1hP3trZXk6dGhpcy5lbnRyaWVzW2FdLmtleSx2YWx1ZTp0aGlzLmVudHJpZXNbYV0udmFsdWV9Omh9O2IucHJvdG90eXBlLmdldFZhbHVlcz1mdW5jdGlvbigpe3ZhciBhPTAsYixrPVtdO2lmKHRoaXMuZW50cmllcyE9PWgpZm9yKGI9MDtiPHRoaXMuc2l6ZTtiKyspaWYoMDw9XG50aGlzLmVudHJpZXNbYl0uaGFzaENvZGUpa1thKytdPXRoaXMuZW50cmllc1tiXS52YWx1ZTtyZXR1cm4ga307Yi5wcm90b3R5cGUuZ2V0PWZ1bmN0aW9uKGEpe2E9dGhpcy5fZmluZEVudHJ5KGEpO2lmKDA8PWEpcmV0dXJuIHRoaXMuZW50cmllc1thXS52YWx1ZTt0aHJvdyBFcnJvcihcIm5vIHN1Y2gga2V5XCIpO307Yi5wcm90b3R5cGUuc2V0PWZ1bmN0aW9uKGEsYil7dGhpcy5faW5zZXJ0KGEsYiwhMSl9O2IucHJvdG90eXBlLmNvbnRhaW5za2V5PWZ1bmN0aW9uKGEpe3JldHVybiAwPD10aGlzLl9maW5kRW50cnkoYSl9O3JldHVybiBifSgpO2Yuam9pbj1mdW5jdGlvbihiLGEsYyxrKXt2YXIgZT10aGlzO3JldHVybiB2KGZ1bmN0aW9uKGQpe3ZhciBnPW5ldyB1LGo9ITEsZj0wLGw9bmV3IHksaD0hMSxyPTAsdD1uZXcgeTtnLmFkZChlLnN1YnNjcmliZShmdW5jdGlvbihiKXt2YXIgYyxlLHA9ZisrLGk9bmV3IHMsSDtsLmFkZChwLGIpO2cuYWRkKGkpO2U9ZnVuY3Rpb24oKXtpZihsLnJlbW92ZShwKSYmXG4wPT09bC5jb3VudCgpJiZqKWQub25Db21wbGV0ZWQoKTtyZXR1cm4gZy5yZW1vdmUoaSl9O3RyeXtjPWEoYil9Y2F0Y2goaCl7ZC5vbkVycm9yKGgpO3JldHVybn1pLmRpc3Bvc2FibGUoYy50YWtlKDEpLnN1YnNjcmliZShmdW5jdGlvbigpe30sZnVuY3Rpb24oYSl7ZC5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2UoKX0pKTtjPXQuZ2V0VmFsdWVzKCk7Zm9yKHZhciBuPTA7bjxjLmxlbmd0aDtuKyspe3RyeXtIPWsoYixjW25dKX1jYXRjaChyKXtkLm9uRXJyb3Iocik7YnJlYWt9ZC5vbk5leHQoSCl9fSxmdW5jdGlvbihhKXtkLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7aj0hMDtpZihofHwwPT09bC5jb3VudCgpKWQub25Db21wbGV0ZWQoKX0pKTtnLmFkZChiLnN1YnNjcmliZShmdW5jdGlvbihhKXt2YXIgYixlLHA9cisrLGk9bmV3IHMsajt0LmFkZChwLGEpO2cuYWRkKGkpO2U9ZnVuY3Rpb24oKXtpZih0LnJlbW92ZShwKSYmMD09PXQuY291bnQoKSYmaClkLm9uQ29tcGxldGVkKCk7XG5yZXR1cm4gZy5yZW1vdmUoaSl9O3RyeXtiPWMoYSl9Y2F0Y2goZil7ZC5vbkVycm9yKGYpO3JldHVybn1pLmRpc3Bvc2FibGUoYi50YWtlKDEpLnN1YnNjcmliZShmdW5jdGlvbigpe30sZnVuY3Rpb24oYSl7ZC5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2UoKX0pKTtiPWwuZ2V0VmFsdWVzKCk7Zm9yKHZhciBuPTA7bjxiLmxlbmd0aDtuKyspe3RyeXtqPWsoYltuXSxhKX1jYXRjaChPKXtkLm9uRXJyb3IoTyk7YnJlYWt9ZC5vbk5leHQoail9fSxmdW5jdGlvbihhKXtkLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7aD0hMDtpZihqfHwwPT09dC5jb3VudCgpKWQub25Db21wbGV0ZWQoKX0pKTtyZXR1cm4gZ30pfTtmLmdyb3VwSm9pbj1mdW5jdGlvbihiLGEsYyxrKXt2YXIgZT10aGlzO3JldHVybiB2KGZ1bmN0aW9uKGQpe3ZhciBnPW5ldyB1LGo9bmV3IEUoZyksZj0wLGw9bmV3IHksaD0wLHI9bmV3IHk7Zy5hZGQoZS5zdWJzY3JpYmUoZnVuY3Rpb24oYil7dmFyIGMsZSxtLHA9ZisrLGksXG5oLEQsbj1uZXcgQTtsLmFkZChwLG4pO3RyeXttPWsoYixCKG4saikpfWNhdGNoKG8pe2k9bC5nZXRWYWx1ZXMoKTtmb3IobT0wO208aS5sZW5ndGg7bSsrKWlbbV0ub25FcnJvcihvKTtkLm9uRXJyb3Iobyk7cmV0dXJufWQub25OZXh0KG0pO0Q9ci5nZXRWYWx1ZXMoKTtmb3IobT0wO208RC5sZW5ndGg7bSsrKW4ub25OZXh0KERbbV0pO2g9bmV3IHM7Zy5hZGQoaCk7ZT1mdW5jdGlvbigpe2lmKGwucmVtb3ZlKHApKW4ub25Db21wbGV0ZWQoKTtnLnJlbW92ZShoKX07dHJ5e2M9YShiKX1jYXRjaChxKXtpPWwuZ2V0VmFsdWVzKCk7Zm9yKG09MDttPGkubGVuZ3RoO20rKylpW21dLm9uRXJyb3IocSk7ZC5vbkVycm9yKHEpO3JldHVybn1oLmRpc3Bvc2FibGUoYy50YWtlKDEpLnN1YnNjcmliZShmdW5jdGlvbigpe30sZnVuY3Rpb24oYSl7dmFyIGI7aT1sLmdldFZhbHVlcygpO2ZvcihiPTA7YjxpLmxlbmd0aDtiKyspaVtiXS5vbkVycm9yKGEpO2Qub25FcnJvcihhKX0sZnVuY3Rpb24oKXtlKCl9KSl9LFxuZnVuY3Rpb24oYSl7dmFyIGIsYztjPWwuZ2V0VmFsdWVzKCk7Zm9yKGI9MDtiPGMubGVuZ3RoO2IrKyljW2JdLm9uRXJyb3IoYSk7ZC5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2Qub25Db21wbGV0ZWQoKX0pKTtnLmFkZChiLnN1YnNjcmliZShmdW5jdGlvbihhKXt2YXIgYixlLGssZixpO2s9aCsrO3IuYWRkKGssYSk7aT1uZXcgcztnLmFkZChpKTtlPWZ1bmN0aW9uKCl7ci5yZW1vdmUoayk7Zy5yZW1vdmUoaSl9O3RyeXtiPWMoYSl9Y2F0Y2goail7Zj1sLmdldFZhbHVlcygpO2ZvcihiPTA7YjxmLmxlbmd0aDtiKyspZltiXS5vbkVycm9yKGopO2Qub25FcnJvcihqKTtyZXR1cm59aS5kaXNwb3NhYmxlKGIudGFrZSgxKS5zdWJzY3JpYmUoZnVuY3Rpb24oKXt9LGZ1bmN0aW9uKGEpe3ZhciBiO2Y9bC5nZXRWYWx1ZXMoKTtmb3IoYj0wO2I8Zi5sZW5ndGg7YisrKWZbYl0ub25FcnJvcihhKTtkLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7ZSgpfSkpO2Y9bC5nZXRWYWx1ZXMoKTtmb3IoYj1cbjA7YjxmLmxlbmd0aDtiKyspZltiXS5vbk5leHQoYSl9LGZ1bmN0aW9uKGIpe3ZhciBhLGM7Yz1sLmdldFZhbHVlcygpO2ZvcihhPTA7YTxjLmxlbmd0aDthKyspY1thXS5vbkVycm9yKGIpO2Qub25FcnJvcihiKX0pKTtyZXR1cm4gan0pfTtmLmJ1ZmZlcj1mdW5jdGlvbihiLGEpe3JldHVyblwiZnVuY3Rpb25cIj09PXR5cGVvZiBiP0koYikuc2VsZWN0TWFueShmdW5jdGlvbihhKXtyZXR1cm4gb2JzZXJ2YWJsZVRvQXJyYXkoYSl9KTpKKHRoaXMsYixhKS5zZWxlY3RNYW55KGZ1bmN0aW9uKGEpe3JldHVybiBvYnNlcnZhYmxlVG9BcnJheShhKX0pfTtmLndpbmRvdz1mdW5jdGlvbihiLGEpe3JldHVyblwiZnVuY3Rpb25cIj09PXR5cGVvZiBiP0kuY2FsbCh0aGlzLGIpOkouY2FsbCh0aGlzLGIsYSl9O3ZhciBKPWZ1bmN0aW9uKGIsYSl7cmV0dXJuIGIuZ3JvdXBKb2luKHRoaXMsYSxmdW5jdGlvbigpe3JldHVybiBMKCl9LGZ1bmN0aW9uKGEsYil7cmV0dXJuIGJ9KX0sST1mdW5jdGlvbihiKXt2YXIgYT1cbnRoaXM7cmV0dXJuIHYoZnVuY3Rpb24oYyl7dmFyIGYsZT1uZXcgSyxkPW5ldyB1KGUpLGc9bmV3IEUoZCksaj1uZXcgQTtjLm9uTmV4dChCKGosZykpO2QuYWRkKGEuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2oub25OZXh0KGEpfSxmdW5jdGlvbihhKXtqLm9uRXJyb3IoYSk7Yy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2oub25Db21wbGV0ZWQoKTtjLm9uQ29tcGxldGVkKCl9KSk7Zj1mdW5jdGlvbigpe3ZhciBhLGQ7dHJ5e2Q9YigpfWNhdGNoKGgpe2Mub25FcnJvcihoKTtyZXR1cm59YT1uZXcgcztlLmRpc3Bvc2FibGUoYSk7YS5kaXNwb3NhYmxlKGQudGFrZSgxKS5zdWJzY3JpYmUoTixmdW5jdGlvbihhKXtqLm9uRXJyb3IoYSk7Yy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2oub25Db21wbGV0ZWQoKTtqPW5ldyBBO2Mub25OZXh0KEIoaixnKSk7ZigpfSkpfTtmKCk7cmV0dXJuIGd9KX19O1xuIiwiLypcbiBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gVGhpcyBjb2RlIGlzIGxpY2Vuc2VkIGJ5IE1pY3Jvc29mdCBDb3Jwb3JhdGlvbiB1bmRlciB0aGUgdGVybXNcbiBvZiB0aGUgTUlDUk9TT0ZUIFJFQUNUSVZFIEVYVEVOU0lPTlMgRk9SIEpBVkFTQ1JJUFQgQU5EIC5ORVQgTElCUkFSSUVTIExpY2Vuc2UuXG4gU2VlIGh0dHA6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/TGlua0lEPTIyMDc2Mi5cbiovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGssdCl7dmFyIGw7bD1rLlJ4O3ZhciBuPWwuT2JzZXJ2YWJsZSxkPW4ucHJvdG90eXBlLG09bi5jcmVhdGVXaXRoRGlzcG9zYWJsZSx1PWwuQ29tcG9zaXRlRGlzcG9zYWJsZSxvPWZ1bmN0aW9uKGEsYil7cmV0dXJuIGE9PT1ifSxwPWZ1bmN0aW9uKGEpe3JldHVybiBhfSxxPWZ1bmN0aW9uKGEsYil7cmV0dXJuIGE+Yj8xOmE9PT1iPzA6LTF9LHI9ZnVuY3Rpb24oYSxiLGQpe3JldHVybiBtKGZ1bmN0aW9uKGMpe3ZhciBmPSExLGc9bnVsbCxoPVtdO3JldHVybiBhLnN1YnNjcmliZShmdW5jdGlvbihhKXt2YXIgZSxpO3RyeXtpPWIoYSl9Y2F0Y2godil7Yy5vbkVycm9yKHYpO3JldHVybn1lPTA7aWYoZil0cnl7ZT1kKGksZyl9Y2F0Y2godyl7Yy5vbkVycm9yKHcpO3JldHVybn1lbHNlIGY9ITAsZz1cbmk7MDxlJiYoZz1pLGg9W10pOzA8PWUmJmgucHVzaChhKX0sZnVuY3Rpb24oYSl7Yy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2Mub25OZXh0KGgpO2Mub25Db21wbGV0ZWQoKX0pfSl9O2QuYWdncmVnYXRlPWZ1bmN0aW9uKGEsYil7cmV0dXJuIHRoaXMuc2NhbihhLGIpLnN0YXJ0V2l0aChhKS5maW5hbFZhbHVlKCl9O2QuYWdncmVnYXRlMT1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5zY2FuMShhKS5maW5hbFZhbHVlKCl9O2QuYW55PWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7cmV0dXJuIGEhPT10P2Iud2hlcmUoYSkuYW55KCk6bShmdW5jdGlvbihhKXtyZXR1cm4gYi5zdWJzY3JpYmUoZnVuY3Rpb24oKXthLm9uTmV4dCghMCk7YS5vbkNvbXBsZXRlZCgpfSxmdW5jdGlvbihiKXthLm9uRXJyb3IoYil9LGZ1bmN0aW9uKCl7YS5vbk5leHQoITEpO2Eub25Db21wbGV0ZWQoKX0pfSl9O2QuYWxsPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLndoZXJlKGZ1bmN0aW9uKGIpe3JldHVybiFhKGIpfSkuYW55KCkuc2VsZWN0KGZ1bmN0aW9uKGEpe3JldHVybiFhfSl9O1xuZC5jb250YWlucz1mdW5jdGlvbihhLGIpe2J8fChiPW8pO3JldHVybiB0aGlzLndoZXJlKGZ1bmN0aW9uKGQpe3JldHVybiBiKGQsYSl9KS5hbnkoKX07ZC5jb3VudD1mdW5jdGlvbigpe3JldHVybiB0aGlzLmFnZ3JlZ2F0ZSgwLGZ1bmN0aW9uKGEpe3JldHVybiBhKzF9KX07ZC5zdW09ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5hZ2dyZWdhdGUoMCxmdW5jdGlvbihhLGIpe3JldHVybiBhK2J9KX07ZC5taW5CeT1mdW5jdGlvbihhLGIpe2J8fChiPXEpO3JldHVybiByKHRoaXMsYSxmdW5jdGlvbihhLGMpe3JldHVybi0xKmIoYSxjKX0pfTt2YXIgcz1mdW5jdGlvbihhKXtpZigwPT1hLmxlbmd0aCl0aHJvdyBFcnJvcihcIlNlcXVlbmNlIGNvbnRhaW5zIG5vIGVsZW1lbnRzLlwiKTtyZXR1cm4gYVswXX07ZC5taW49ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMubWluQnkocCxhKS5zZWxlY3QoZnVuY3Rpb24oYSl7cmV0dXJuIHMoYSl9KX07ZC5tYXhCeT1mdW5jdGlvbihhLGIpe2J8fChiPXEpO1xucmV0dXJuIHIodGhpcyxhLGIpfTtkLm1heD1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5tYXhCeShwLGEpLnNlbGVjdChmdW5jdGlvbihhKXtyZXR1cm4gcyhhKX0pfTtkLmF2ZXJhZ2U9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5zY2FuKHtzdW06MCxjb3VudDowfSxmdW5jdGlvbihhLGIpe3JldHVybntzdW06YS5zdW0rYixjb3VudDphLmNvdW50KzF9fSkuZmluYWxWYWx1ZSgpLnNlbGVjdChmdW5jdGlvbihhKXtyZXR1cm4gYS5zdW0vYS5jb3VudH0pfTtkLnNlcXVlbmNlRXF1YWw9ZnVuY3Rpb24oYSxiKXt2YXIgZD10aGlzO2J8fChiPW8pO3JldHVybiBtKGZ1bmN0aW9uKGMpe3ZhciBmPSExLGc9ITEsaD1bXSxqPVtdLGU9ZC5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7dmFyIGQsZjtpZigwPGoubGVuZ3RoKXtmPWouc2hpZnQoKTt0cnl7ZD1iKGYsYSl9Y2F0Y2goZSl7Yy5vbkVycm9yKGUpO3JldHVybn1kfHwoYy5vbk5leHQoITEpLGMub25Db21wbGV0ZWQoKSl9ZWxzZSBnPyhjLm9uTmV4dCghMSksXG5jLm9uQ29tcGxldGVkKCkpOmgucHVzaChhKX0sZnVuY3Rpb24oYSl7Yy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2Y9ITA7MD09PWgubGVuZ3RoJiYoMDxqLmxlbmd0aD8oYy5vbk5leHQoITEpLGMub25Db21wbGV0ZWQoKSk6ZyYmKGMub25OZXh0KCEwKSxjLm9uQ29tcGxldGVkKCkpKX0pLGk9YS5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7dmFyIGQsZTtpZigwPGgubGVuZ3RoKXtlPWguc2hpZnQoKTt0cnl7ZD1iKGUsYSl9Y2F0Y2goZyl7Yy5vbkVycm9yKGcpO3JldHVybn1kfHwoYy5vbk5leHQoITEpLGMub25Db21wbGV0ZWQoKSl9ZWxzZSBmPyhjLm9uTmV4dCghMSksYy5vbkNvbXBsZXRlZCgpKTpqLnB1c2goYSl9LGZ1bmN0aW9uKGEpe2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtnPSEwOzA9PT1qLmxlbmd0aCYmKDA8aC5sZW5ndGg/KGMub25OZXh0KCExKSxjLm9uQ29tcGxldGVkKCkpOmYmJihjLm9uTmV4dCghMCksYy5vbkNvbXBsZXRlZCgpKSl9KTtyZXR1cm4gbmV3IHUoZSxcbmkpfSl9fTtcbiIsIi8qXG4gQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uICBBbGwgcmlnaHRzIHJlc2VydmVkLlxuIFRoaXMgY29kZSBpcyBsaWNlbnNlZCBieSBNaWNyb3NvZnQgQ29ycG9yYXRpb24gdW5kZXIgdGhlIHRlcm1zXG4gb2YgdGhlIE1JQ1JPU09GVCBSRUFDVElWRSBFWFRFTlNJT05TIEZPUiBKQVZBU0NSSVBUIEFORCAuTkVUIExJQlJBUklFUyBMaWNlbnNlLlxuIFNlZSBodHRwOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP0xpbmtJRD0yMjA3NjIuXG4qL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbih3LG4pe3ZhciBwO3A9dy5SeDt2YXIgcT1wLk9ic2VydmFibGUsbz1xLnByb3RvdHlwZSxtPXEuY3JlYXRlV2l0aERpc3Bvc2FibGUseT1xLmRlZmVyLEY9cS50aHJvd0V4Y2VwdGlvbixsPXAuU2NoZWR1bGVyLlRpbWVvdXQscj1wLlNpbmdsZUFzc2lnbm1lbnREaXNwb3NhYmxlLHQ9cC5TZXJpYWxEaXNwb3NhYmxlLHM9cC5Db21wb3NpdGVEaXNwb3NhYmxlLHo9cC5SZWZDb3VudERpc3Bvc2FibGUsdT1wLlN1YmplY3QsRz1wLkludGVybmFscy5CaW5hcnlPYnNlcnZlcix2PWZ1bmN0aW9uKGEsYil7cmV0dXJuIG0oZnVuY3Rpb24oYyl7cmV0dXJuIG5ldyBzKGIuZ2V0RGlzcG9zYWJsZSgpLGEuc3Vic2NyaWJlKGMpKX0pfSxIPWZ1bmN0aW9uKGEsYixjKXtyZXR1cm4gbShmdW5jdGlvbihkKXt2YXIgZj1cbm5ldyByLGU9bmV3IHIsZD1jKGQsZixlKTtmLmRpc3Bvc2FibGUoYS5tYXRlcmlhbGl6ZSgpLnNlbGVjdChmdW5jdGlvbihiKXtyZXR1cm57c3dpdGNoVmFsdWU6ZnVuY3Rpb24oYyl7cmV0dXJuIGMoYil9fX0pLnN1YnNjcmliZShkKSk7ZS5kaXNwb3NhYmxlKGIubWF0ZXJpYWxpemUoKS5zZWxlY3QoZnVuY3Rpb24oYil7cmV0dXJue3N3aXRjaFZhbHVlOmZ1bmN0aW9uKGMsYSl7cmV0dXJuIGEoYil9fX0pLnN1YnNjcmliZShkKSk7cmV0dXJuIG5ldyBzKGYsZSl9KX0sST1mdW5jdGlvbihhLGIpe3JldHVybiBtKGZ1bmN0aW9uKGMpe3JldHVybiBiLnNjaGVkdWxlV2l0aEFic29sdXRlKGEsZnVuY3Rpb24oKXtjLm9uTmV4dCgwKTtjLm9uQ29tcGxldGVkKCl9KX0pfSxBPWZ1bmN0aW9uKGEsYixjKXt2YXIgZD0wPmI/MDpiO3JldHVybiBtKGZ1bmN0aW9uKGIpe3ZhciBlPTAsZz1hO3JldHVybiBjLnNjaGVkdWxlUmVjdXJzaXZlV2l0aEFic29sdXRlKGcsZnVuY3Rpb24oYSl7dmFyIGk7XG4wPGQmJihpPWMubm93KCksZys9ZCxnPD1pJiYoZz1pK2QpKTtiLm9uTmV4dChlKyspO2EoZyl9KX0pfSxKPWZ1bmN0aW9uKGEsYil7dmFyIGM9MD5hPzA6YTtyZXR1cm4gbShmdW5jdGlvbihhKXtyZXR1cm4gYi5zY2hlZHVsZVdpdGhSZWxhdGl2ZShjLGZ1bmN0aW9uKCl7YS5vbk5leHQoMCk7YS5vbkNvbXBsZXRlZCgpfSl9KX0sQj1mdW5jdGlvbihhLGIsYyl7cmV0dXJuIHkoZnVuY3Rpb24oKXtyZXR1cm4gQShjLm5vdygpK2EsYixjKX0pfSxLPXEuaW50ZXJ2YWw9ZnVuY3Rpb24oYSxiKXtifHwoYj1sKTtyZXR1cm4gQihhLGEsYil9O3EudGltZXI9ZnVuY3Rpb24oYSxiLGMpe3ZhciBkO2N8fChjPWwpO2IhPT1uJiZcIm51bWJlclwiPT09dHlwZW9mIGI/ZD1iOmIhPT1uJiZcIm9iamVjdFwiPT09dHlwZW9mIGImJihjPWIpO3JldHVybiBhIGluc3RhbmNlb2YgRGF0ZSYmZD09PW4/SShhLmdldFRpbWUoKSxjKTphIGluc3RhbmNlb2YgRGF0ZSYmZCE9PW4/QShhLmdldFRpbWUoKSxiLGMpOlxuZD09PW4/SihhLGMpOkIoYSxkLGMpfTt2YXIgRD1mdW5jdGlvbihhLGIsYyl7cmV0dXJuIG0oZnVuY3Rpb24oZCl7dmFyIGY9ITEsZT1uZXcgdCxnPW51bGwsaD1bXSxpPSExLGo7aj1hLm1hdGVyaWFsaXplKCkudGltZXN0YW1wKGMpLnN1YnNjcmliZShmdW5jdGlvbihhKXtcIkVcIj09PWEudmFsdWUua2luZD8oaD1bXSxoLnB1c2goYSksZz1hLnZhbHVlLmV4Y2VwdGlvbixhPSFpKTooaC5wdXNoKHt2YWx1ZTphLnZhbHVlLHRpbWVzdGFtcDphLnRpbWVzdGFtcCtifSksYT0hZixmPSEwKTtpZihhKWlmKG51bGwhPT1nKWQub25FcnJvcihnKTtlbHNlIGE9bmV3IHIsZS5kaXNwb3NhYmxlKGEpLGEuZGlzcG9zYWJsZShjLnNjaGVkdWxlUmVjdXJzaXZlV2l0aFJlbGF0aXZlKGIsZnVuY3Rpb24oYSl7dmFyIGIsZSxqO2lmKG51bGw9PT1nKXtpPSEwO2Rve2I9bnVsbDtpZigwPGgubGVuZ3RoJiYwPj1oWzBdLnRpbWVzdGFtcC1jLm5vdygpKWI9aC5zaGlmdCgpLnZhbHVlO251bGwhPT1iJiZcbmIuYWNjZXB0KGQpfXdoaWxlKG51bGwhPT1iKTtqPSExO2U9MDswPGgubGVuZ3RoPyhqPSEwLGU9TWF0aC5tYXgoMCxoWzBdLnRpbWVzdGFtcC1jLm5vdygpKSk6Zj0hMTtiPWc7aT0hMTtpZihudWxsIT09YilkLm9uRXJyb3IoYik7ZWxzZSBqJiZhKGUpfX0pKX0pO3JldHVybiBuZXcgcyhqLGUpfSl9LEw9ZnVuY3Rpb24oYSxiLGMpe3JldHVybiB5KGZ1bmN0aW9uKCl7dmFyIGE9Yi1jLm5vdygpO3JldHVybiBEKGEsYyl9KX07by5kZWxheT1mdW5jdGlvbihhLGIpe2J8fChiPWwpO3JldHVybiBhIGluc3RhbmNlb2YgRGF0ZT9MKHRoaXMsYS5nZXRUaW1lKCksYik6RCh0aGlzLGEsYil9O28udGhyb3R0bGU9ZnVuY3Rpb24oYSxiKXtifHwoYj1sKTt2YXIgYz10aGlzO3JldHVybiBtKGZ1bmN0aW9uKGQpe3ZhciBmPW5ldyB0LGU9ITEsZz0wLGgsaT1udWxsO2g9Yy5zdWJzY3JpYmUoZnVuY3Rpb24oYyl7dmFyIGs7ZT0hMDtpPWM7ZysrO2s9ZztjPW5ldyByO2YuZGlzcG9zYWJsZShjKTtcbmMuZGlzcG9zYWJsZShiLnNjaGVkdWxlV2l0aFJlbGF0aXZlKGEsZnVuY3Rpb24oKXtpZihlJiZnPT09aylkLm9uTmV4dChpKTtlPSExfSkpfSxmdW5jdGlvbihhKXtmLmRpc3Bvc2UoKTtkLm9uRXJyb3IoYSk7ZT0hMTtnKyt9LGZ1bmN0aW9uKCl7Zi5kaXNwb3NlKCk7aWYoZSlkLm9uTmV4dChpKTtkLm9uQ29tcGxldGVkKCk7ZT0hMTtnKyt9KTtyZXR1cm4gbmV3IHMoaCxmKX0pfTtvLndpbmRvd1dpdGhUaW1lPWZ1bmN0aW9uKGEsYixjKXt2YXIgZD10aGlzLGY7Yj09PW4mJihmPWEpO2M9PT1uJiYoYz1sKTtcIm51bWJlclwiPT09dHlwZW9mIGI/Zj1iOlwib2JqZWN0XCI9PT10eXBlb2YgYiYmKGY9YSxjPWIpO3JldHVybiBtKGZ1bmN0aW9uKGIpe3ZhciBnLGgsaT1mLGo9YSxrPVtdLHgsQz1uZXcgdCxsPTA7aD1uZXcgcyhDKTt4PW5ldyB6KGgpO2c9ZnVuY3Rpb24oKXt2YXIgYSxkLGgsbSxuO2g9bmV3IHI7Qy5kaXNwb3NhYmxlKGgpO2E9ZD0hMTtqPT09aT9hPWQ9ITA6ajxpP2Q9ITA6XG5hPSEwO209ZD9qOmk7bj1tLWw7bD1tO2QmJihqKz1mKTthJiYoaSs9Zik7aC5kaXNwb3NhYmxlKGMuc2NoZWR1bGVXaXRoUmVsYXRpdmUobixmdW5jdGlvbigpe3ZhciBjO2EmJihjPW5ldyB1LGsucHVzaChjKSxiLm9uTmV4dCh2KGMseCkpKTtkJiYoYz1rLnNoaWZ0KCksYy5vbkNvbXBsZXRlZCgpKTtnKCl9KSl9O2sucHVzaChuZXcgdSk7Yi5vbk5leHQodihrWzBdLHgpKTtnKCk7aC5hZGQoZC5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7dmFyIGIsYztmb3IoYj0wO2I8ay5sZW5ndGg7YisrKWM9a1tiXSxjLm9uTmV4dChhKX0sZnVuY3Rpb24oYSl7dmFyIGMsZDtmb3IoYz0wO2M8ay5sZW5ndGg7YysrKWQ9a1tjXSxkLm9uRXJyb3IoYSk7Yi5vbkVycm9yKGEpfSxmdW5jdGlvbigpe3ZhciBhLGM7Zm9yKGE9MDthPGsubGVuZ3RoO2ErKyljPWtbYV0sYy5vbkNvbXBsZXRlZCgpO2Iub25Db21wbGV0ZWQoKX0pKTtyZXR1cm4geH0pfTtvLndpbmRvd1dpdGhUaW1lT3JDb3VudD1mdW5jdGlvbihhLFxuYixjKXt2YXIgZD10aGlzO2N8fChjPWwpO3JldHVybiBtKGZ1bmN0aW9uKGYpe3ZhciBlLGcsaD0wLGksaixrPW5ldyB0LGw9MDtnPW5ldyBzKGspO2k9bmV3IHooZyk7ZT1mdW5jdGlvbihiKXt2YXIgZD1uZXcgcjtrLmRpc3Bvc2FibGUoZCk7ZC5kaXNwb3NhYmxlKGMuc2NoZWR1bGVXaXRoUmVsYXRpdmUoYSxmdW5jdGlvbigpe3ZhciBhO2I9PT1sJiYoaD0wLGE9KytsLGoub25Db21wbGV0ZWQoKSxqPW5ldyB1LGYub25OZXh0KHYoaixpKSksZShhKSl9KSl9O2o9bmV3IHU7Zi5vbk5leHQodihqLGkpKTtlKDApO2cuYWRkKGQuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe3ZhciBjPTAsZD0hMTtqLm9uTmV4dChhKTtoKys7aD09PWImJihkPSEwLGg9MCxjPSsrbCxqLm9uQ29tcGxldGVkKCksaj1uZXcgdSxmLm9uTmV4dCh2KGosaSkpKTtkJiZlKGMpfSxmdW5jdGlvbihhKXtqLm9uRXJyb3IoYSk7Zi5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2oub25Db21wbGV0ZWQoKTtmLm9uQ29tcGxldGVkKCl9KSk7XG5yZXR1cm4gaX0pfTtvLmJ1ZmZlcldpdGhUaW1lPWZ1bmN0aW9uKGEsYixjKXt2YXIgZDtiPT09biYmKGQ9YSk7Y3x8KGM9bCk7XCJudW1iZXJcIj09PXR5cGVvZiBiP2Q9YjpcIm9iamVjdFwiPT09dHlwZW9mIGImJihkPWEsYz1iKTtyZXR1cm4gdGhpcy53aW5kb3dXaXRoVGltZShhLGQsYykuc2VsZWN0TWFueShmdW5jdGlvbihhKXtyZXR1cm4gYS50b0FycmF5KCl9KX07by5idWZmZXJXaXRoVGltZU9yQ291bnQ9ZnVuY3Rpb24oYSxiLGMpe2N8fChjPWwpO3JldHVybiB0aGlzLndpbmRvd1dpdGhUaW1lT3JDb3VudChhLGIsYykuc2VsZWN0TWFueShmdW5jdGlvbihhKXtyZXR1cm4gYS50b0FycmF5KCl9KX07by50aW1lSW50ZXJ2YWw9ZnVuY3Rpb24oYSl7dmFyIGI9dGhpczthfHwoYT1sKTtyZXR1cm4geShmdW5jdGlvbigpe3ZhciBjPWEubm93KCk7cmV0dXJuIGIuc2VsZWN0KGZ1bmN0aW9uKGIpe3ZhciBmPWEubm93KCksZT1mLWM7Yz1mO3JldHVybnt2YWx1ZTpiLGludGVydmFsOmV9fSl9KX07XG5vLnRpbWVzdGFtcD1mdW5jdGlvbihhKXthfHwoYT1sKTtyZXR1cm4gdGhpcy5zZWxlY3QoZnVuY3Rpb24oYil7cmV0dXJue3ZhbHVlOmIsdGltZXN0YW1wOmEubm93KCl9fSl9O3ZhciBFPWZ1bmN0aW9uKGEsYil7cmV0dXJuIEgoYSxiLGZ1bmN0aW9uKGEpe3ZhciBiPSExLGY7cmV0dXJuIG5ldyBHKGZ1bmN0aW9uKGUpe1wiTlwiPT09ZS5raW5kJiYoZj1lKTtcIkVcIj09PWUua2luZCYmZS5hY2NlcHQoYSk7XCJDXCI9PT1lLmtpbmQmJihiPSEwKX0sZnVuY3Rpb24oKXt2YXIgZT1mO2Y9bjtlIT09biYmZS5hY2NlcHQoYSk7aWYoYilhLm9uQ29tcGxldGVkKCl9KX0pfTtvLnNhbXBsZT1mdW5jdGlvbihhLGIpe2J8fChiPWwpO3JldHVyblwibnVtYmVyXCI9PT10eXBlb2YgYT9FKHRoaXMsSyhhLGIpKTpFKHRoaXMsYSl9O28udGltZW91dD1mdW5jdGlvbihhLGIsYyl7dmFyIGQsZj10aGlzO2I9PT1uJiYoYj1GKEVycm9yKFwiVGltZW91dFwiKSkpO2N8fChjPWwpO2Q9YSBpbnN0YW5jZW9mIERhdGU/XG5mdW5jdGlvbihhLGIpe2Muc2NoZWR1bGVXaXRoQWJzb2x1dGUoYSxiKX06ZnVuY3Rpb24oYSxiKXtjLnNjaGVkdWxlV2l0aFJlbGF0aXZlKGEsYil9O3JldHVybiBtKGZ1bmN0aW9uKGMpe3ZhciBnLGg9MCxpPW5ldyByLGo9bmV3IHQsaz0hMSxsPW5ldyB0O2ouZGlzcG9zYWJsZShpKTtnPWZ1bmN0aW9uKCl7dmFyIGY9aDtsLmRpc3Bvc2FibGUoZChhLGZ1bmN0aW9uKCl7KGs9aD09PWYpJiZqLmRpc3Bvc2FibGUoYi5zdWJzY3JpYmUoYykpfSkpfTtnKCk7aS5kaXNwb3NhYmxlKGYuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2t8fChoKyssYy5vbk5leHQoYSksZygpKX0sZnVuY3Rpb24oYSl7a3x8KGgrKyxjLm9uRXJyb3IoYSkpfSxmdW5jdGlvbigpe2t8fChoKyssYy5vbkNvbXBsZXRlZCgpKX0pKTtyZXR1cm4gbmV3IHMoaixsKX0pfTtxLmdlbmVyYXRlV2l0aEFic29sdXRlVGltZT1mdW5jdGlvbihhLGIsYyxkLGYsZSl7ZXx8KGU9bCk7cmV0dXJuIG0oZnVuY3Rpb24oZyl7dmFyIGg9XG4hMCxpPSExLGosaz1hLGw7cmV0dXJuIGUuc2NoZWR1bGVSZWN1cnNpdmVXaXRoQWJzb2x1dGUoZS5ub3coKSxmdW5jdGlvbihhKXtpZihpKWcub25OZXh0KGopO3RyeXtpZihoP2g9ITE6az1jKGspLGk9YihrKSlqPWQoayksbD1mKGspfWNhdGNoKGUpe2cub25FcnJvcihlKTtyZXR1cm59aWYoaSlhKGwpO2Vsc2UgZy5vbkNvbXBsZXRlZCgpfSl9KX07cS5nZW5lcmF0ZVdpdGhSZWxhdGl2ZVRpbWU9ZnVuY3Rpb24oYSxiLGMsZCxmLGUpe2V8fChlPWwpO3JldHVybiBtKGZ1bmN0aW9uKGcpe3ZhciBoPSEwLGk9ITEsaixrPWEsbDtyZXR1cm4gZS5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhSZWxhdGl2ZSgwLGZ1bmN0aW9uKGEpe2lmKGkpZy5vbk5leHQoaik7dHJ5e2lmKGg/aD0hMTprPWMoayksaT1iKGspKWo9ZChrKSxsPWYoayl9Y2F0Y2goZSl7Zy5vbkVycm9yKGUpO3JldHVybn1pZihpKWEobCk7ZWxzZSBnLm9uQ29tcGxldGVkKCl9KX0pfX07XG4iLCIvKlxuIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiAgQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiBUaGlzIGNvZGUgaXMgbGljZW5zZWQgYnkgTWljcm9zb2Z0IENvcnBvcmF0aW9uIHVuZGVyIHRoZSB0ZXJtc1xuIG9mIHRoZSBNSUNST1NPRlQgUkVBQ1RJVkUgRVhURU5TSU9OUyBGT1IgSkFWQVNDUklQVCBBTkQgLk5FVCBMSUJSQVJJRVMgTGljZW5zZS5cbiBTZWUgaHR0cDovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSUQ9MjIwNzYyLlxuKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oayxoKXt2YXIgaTtpPWsuUng7dmFyIHc9QXJyYXkucHJvdG90eXBlLnNsaWNlLHg9T2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eSx5PWZ1bmN0aW9uKGIsYSl7ZnVuY3Rpb24gYygpe3RoaXMuY29uc3RydWN0b3I9Yn1mb3IodmFyIGYgaW4gYSl4LmNhbGwoYSxmKSYmKGJbZl09YVtmXSk7Yy5wcm90b3R5cGU9YS5wcm90b3R5cGU7Yi5wcm90b3R5cGU9bmV3IGM7Yi5iYXNlPWEucHJvdG90eXBlO3JldHVybiBifSxsPWkuT2JzZXJ2YWJsZSxwPWwucHJvdG90eXBlLHo9bC5jcmVhdGVXaXRoRGlzcG9zYWJsZSxBPWwudGhyb3dFeGNlcHRpb24sQj1pLk9ic2VydmVyLmNyZWF0ZSxxPWkuSW50ZXJuYWxzLkxpc3QsQz1pLlNpbmdsZUFzc2lnbm1lbnREaXNwb3NhYmxlLEQ9aS5Db21wb3NpdGVEaXNwb3NhYmxlLFxuRT1pLkludGVybmFscy5BYnN0cmFjdE9ic2VydmVyLEY9ZnVuY3Rpb24oYixhKXtyZXR1cm4gYj09PWF9LG8scixqLHMsbSxuO2o9WzEsMyw3LDEzLDMxLDYxLDEyNywyNTEsNTA5LDEwMjEsMjAzOSw0MDkzLDgxOTEsMTYzODEsMzI3NDksNjU1MjEsMTMxMDcxLDI2MjEzOSw1MjQyODcsMTA0ODU3MywyMDk3MTQzLDQxOTQzMDEsODM4ODU5MywxNjc3NzIxMywzMzU1NDM5Myw2NzEwODg1OSwxMzQyMTc2ODksMjY4NDM1Mzk5LDUzNjg3MDkwOSwxMDczNzQxNzg5LDIxNDc0ODM2NDddO3I9ZnVuY3Rpb24oYil7dmFyIGEsYztpZihiJjApcmV0dXJuIDI9PT1iO2E9TWF0aC5zcXJ0KGIpO2ZvcihjPTM7Yzw9YTspe2lmKDA9PT1iJWMpcmV0dXJuITE7Yys9Mn1yZXR1cm4hMH07bz1mdW5jdGlvbihiKXt2YXIgYSxjO2ZvcihhPTA7YTxqLmxlbmd0aDsrK2EpaWYoYz1qW2FdLGM+PWIpcmV0dXJuIGM7Zm9yKGE9YnwxO2E8altqLmxlbmd0aC0xXTspe2lmKHIoYSkpcmV0dXJuIGE7YSs9Mn1yZXR1cm4gYn07XG5zPTA7bT1mdW5jdGlvbihiKXt2YXIgYTtpZihiPT09aCl0aHJvd1wibm8gc3VjaCBrZXlcIjtpZihiLmdldEhhc2hDb2RlIT09aClyZXR1cm4gYi5nZXRIYXNoQ29kZSgpO2E9MTcqcysrO2IuZ2V0SGFzaENvZGU9ZnVuY3Rpb24oKXtyZXR1cm4gYX07cmV0dXJuIGF9O249ZnVuY3Rpb24oKXtyZXR1cm57a2V5Om51bGwsdmFsdWU6bnVsbCxuZXh0OjAsaGFzaENvZGU6MH19O3ZhciB0PWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYihhLGMpe3RoaXMuX2luaXRpYWxpemUoYSk7dGhpcy5jb21wYXJlcj1jfHxGO3RoaXMuc2l6ZT10aGlzLmZyZWVDb3VudD0wO3RoaXMuZnJlZUxpc3Q9LTF9Yi5wcm90b3R5cGUuX2luaXRpYWxpemU9ZnVuY3Rpb24oYSl7dmFyIGE9byhhKSxjO3RoaXMuYnVja2V0cz1BcnJheShhKTt0aGlzLmVudHJpZXM9QXJyYXkoYSk7Zm9yKGM9MDtjPGE7YysrKXRoaXMuYnVja2V0c1tjXT0tMSx0aGlzLmVudHJpZXNbY109bigpO3RoaXMuZnJlZUxpc3Q9LTF9O2IucHJvdG90eXBlLmNvdW50PVxuZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5zaXplfTtiLnByb3RvdHlwZS5hZGQ9ZnVuY3Rpb24oYSxjKXtyZXR1cm4gdGhpcy5faW5zZXJ0KGEsYywhMCl9O2IucHJvdG90eXBlLl9pbnNlcnQ9ZnVuY3Rpb24oYSxjLGIpe3ZhciBkLGUsZzt0aGlzLmJ1Y2tldHM9PT1oJiZ0aGlzLl9pbml0aWFsaXplKDApO2c9bShhKSYyMTQ3NDgzNjQ3O2Q9ZyV0aGlzLmJ1Y2tldHMubGVuZ3RoO2ZvcihlPXRoaXMuYnVja2V0c1tkXTswPD1lO2U9dGhpcy5lbnRyaWVzW2VdLm5leHQpaWYodGhpcy5lbnRyaWVzW2VdLmhhc2hDb2RlPT09ZyYmdGhpcy5jb21wYXJlcih0aGlzLmVudHJpZXNbZV0ua2V5LGEpKXtpZihiKXRocm93XCJkdXBsaWNhdGUga2V5XCI7dGhpcy5lbnRyaWVzW2VdLnZhbHVlPWM7cmV0dXJufTA8dGhpcy5mcmVlQ291bnQ/KGI9dGhpcy5mcmVlTGlzdCx0aGlzLmZyZWVMaXN0PXRoaXMuZW50cmllc1tiXS5uZXh0LC0tdGhpcy5mcmVlQ291bnQpOih0aGlzLnNpemU9PT10aGlzLmVudHJpZXMubGVuZ3RoJiZcbih0aGlzLl9yZXNpemUoKSxkPWcldGhpcy5idWNrZXRzLmxlbmd0aCksYj10aGlzLnNpemUsKyt0aGlzLnNpemUpO3RoaXMuZW50cmllc1tiXS5oYXNoQ29kZT1nO3RoaXMuZW50cmllc1tiXS5uZXh0PXRoaXMuYnVja2V0c1tkXTt0aGlzLmVudHJpZXNbYl0ua2V5PWE7dGhpcy5lbnRyaWVzW2JdLnZhbHVlPWM7dGhpcy5idWNrZXRzW2RdPWJ9O2IucHJvdG90eXBlLl9yZXNpemU9ZnVuY3Rpb24oKXt2YXIgYSxjLGIsZCxlO2U9bygyKnRoaXMuc2l6ZSk7Yj1BcnJheShlKTtmb3IoYT0wO2E8Yi5sZW5ndGg7KythKWJbYV09LTE7ZD1BcnJheShlKTtmb3IoYT0wO2E8dGhpcy5zaXplOysrYSlkW2FdPXRoaXMuZW50cmllc1thXTtmb3IoYT10aGlzLnNpemU7YTxlOysrYSlkW2FdPW4oKTtmb3IoYT0wO2E8dGhpcy5zaXplOysrYSljPWRbYV0uaGFzaENvZGUlZSxkW2FdLm5leHQ9YltjXSxiW2NdPWE7dGhpcy5idWNrZXRzPWI7dGhpcy5lbnRyaWVzPWR9O2IucHJvdG90eXBlLnJlbW92ZT1cbmZ1bmN0aW9uKGEpe3ZhciBjLGIsZCxlO2lmKHRoaXMuYnVja2V0cyE9PWgpe2U9bShhKSYyMTQ3NDgzNjQ3O2M9ZSV0aGlzLmJ1Y2tldHMubGVuZ3RoO2I9LTE7Zm9yKGQ9dGhpcy5idWNrZXRzW2NdOzA8PWQ7ZD10aGlzLmVudHJpZXNbZF0ubmV4dCl7aWYodGhpcy5lbnRyaWVzW2RdLmhhc2hDb2RlPT09ZSYmdGhpcy5jb21wYXJlcih0aGlzLmVudHJpZXNbZF0ua2V5LGEpKXJldHVybiAwPmI/dGhpcy5idWNrZXRzW2NdPXRoaXMuZW50cmllc1tkXS5uZXh0OnRoaXMuZW50cmllc1tiXS5uZXh0PXRoaXMuZW50cmllc1tkXS5uZXh0LHRoaXMuZW50cmllc1tkXS5oYXNoQ29kZT0tMSx0aGlzLmVudHJpZXNbZF0ubmV4dD10aGlzLmZyZWVMaXN0LHRoaXMuZW50cmllc1tkXS5rZXk9bnVsbCx0aGlzLmVudHJpZXNbZF0udmFsdWU9bnVsbCx0aGlzLmZyZWVMaXN0PWQsKyt0aGlzLmZyZWVDb3VudCwhMDtiPWR9fXJldHVybiExfTtiLnByb3RvdHlwZS5jbGVhcj1mdW5jdGlvbigpe3ZhciBhO1xuaWYoISgwPj10aGlzLnNpemUpKXtmb3IoYT0wO2E8dGhpcy5idWNrZXRzLmxlbmd0aDsrK2EpdGhpcy5idWNrZXRzW2FdPS0xO2ZvcihhPTA7YTx0aGlzLnNpemU7KythKXRoaXMuZW50cmllc1thXT1uKCk7dGhpcy5mcmVlTGlzdD0tMTt0aGlzLnNpemU9MH19O2IucHJvdG90eXBlLl9maW5kRW50cnk9ZnVuY3Rpb24oYSl7dmFyIGMsYjtpZih0aGlzLmJ1Y2tldHMhPT1oKXtiPW0oYSkmMjE0NzQ4MzY0Nztmb3IoYz10aGlzLmJ1Y2tldHNbYiV0aGlzLmJ1Y2tldHMubGVuZ3RoXTswPD1jO2M9dGhpcy5lbnRyaWVzW2NdLm5leHQpaWYodGhpcy5lbnRyaWVzW2NdLmhhc2hDb2RlPT09YiYmdGhpcy5jb21wYXJlcih0aGlzLmVudHJpZXNbY10ua2V5LGEpKXJldHVybiBjfXJldHVybi0xfTtiLnByb3RvdHlwZS5jb3VudD1mdW5jdGlvbigpe3JldHVybiB0aGlzLnNpemUtdGhpcy5mcmVlQ291bnR9O2IucHJvdG90eXBlLnRyeUdldEVudHJ5PWZ1bmN0aW9uKGEpe2E9dGhpcy5fZmluZEVudHJ5KGEpO1xucmV0dXJuIDA8PWE/e2tleTp0aGlzLmVudHJpZXNbYV0ua2V5LHZhbHVlOnRoaXMuZW50cmllc1thXS52YWx1ZX06aH07Yi5wcm90b3R5cGUuZ2V0VmFsdWVzPWZ1bmN0aW9uKCl7dmFyIGE9MCxjLGI9W107aWYodGhpcy5lbnRyaWVzIT09aClmb3IoYz0wO2M8dGhpcy5zaXplO2MrKylpZigwPD10aGlzLmVudHJpZXNbY10uaGFzaENvZGUpYlthKytdPXRoaXMuZW50cmllc1tjXS52YWx1ZTtyZXR1cm4gYn07Yi5wcm90b3R5cGUuZ2V0PWZ1bmN0aW9uKGEpe2E9dGhpcy5fZmluZEVudHJ5KGEpO2lmKDA8PWEpcmV0dXJuIHRoaXMuZW50cmllc1thXS52YWx1ZTt0aHJvdyBFcnJvcihcIm5vIHN1Y2gga2V5XCIpO307Yi5wcm90b3R5cGUuc2V0PWZ1bmN0aW9uKGEsYil7dGhpcy5faW5zZXJ0KGEsYiwhMSl9O2IucHJvdG90eXBlLmNvbnRhaW5za2V5PWZ1bmN0aW9uKGEpe3JldHVybiAwPD10aGlzLl9maW5kRW50cnkoYSl9O3JldHVybiBifSgpLHU9ZnVuY3Rpb24oKXtmdW5jdGlvbiBiKGEpe3RoaXMucGF0dGVybnM9XG5hfWIucHJvdG90eXBlLmFuZD1mdW5jdGlvbihhKXt2YXIgYz10aGlzLnBhdHRlcm5zLGYsZDtkPVtdO2ZvcihmPTA7ZjxjLmxlbmd0aDtmKyspZC5wdXNoKGNbZl0pO2QucHVzaChhKTtyZXR1cm4gbmV3IGIoZCl9O2IucHJvdG90eXBlLnRoZW49ZnVuY3Rpb24oYSl7cmV0dXJuIG5ldyBHKHRoaXMsYSl9O3JldHVybiBifSgpLEc9ZnVuY3Rpb24oKXtmdW5jdGlvbiBiKGEsYil7dGhpcy5leHByZXNzaW9uPWE7dGhpcy5zZWxlY3Rvcj1ifWIucHJvdG90eXBlLmFjdGl2YXRlPWZ1bmN0aW9uKGEsYixmKXt2YXIgZCxlLGcsaDtoPXRoaXM7Zz1bXTtmb3IoZT0wO2U8dGhpcy5leHByZXNzaW9uLnBhdHRlcm5zLmxlbmd0aDtlKyspZy5wdXNoKEgoYSx0aGlzLmV4cHJlc3Npb24ucGF0dGVybnNbZV0sZnVuY3Rpb24oYSl7Yi5vbkVycm9yKGEpfSkpO2Q9bmV3IHYoZyxmdW5jdGlvbigpe3ZhciBhO3RyeXthPWguc2VsZWN0b3IuYXBwbHkoaCxhcmd1bWVudHMpfWNhdGNoKGQpe2Iub25FcnJvcihkKTtcbnJldHVybn1iLm9uTmV4dChhKX0sZnVuY3Rpb24oKXt2YXIgYTtmb3IoYT0wO2E8Zy5sZW5ndGg7YSsrKWdbYV0ucmVtb3ZlQWN0aXZlUGxhbihkKTtmKGQpfSk7Zm9yKGU9MDtlPGcubGVuZ3RoO2UrKylnW2VdLmFkZEFjdGl2ZVBsYW4oZCk7cmV0dXJuIGR9O3JldHVybiBifSgpLEg9ZnVuY3Rpb24oYixhLGMpe3ZhciBmO2Y9Yi50cnlHZXRFbnRyeShhKTtyZXR1cm4gZj09PWg/KGM9bmV3IEkoYSxjKSxiLmFkZChhLGMpLGMpOmYudmFsdWV9LHY7dj1mdW5jdGlvbigpe2Z1bmN0aW9uIGIoYSxiLGYpe3RoaXMuam9pbk9ic2VydmVyQXJyYXk9YTt0aGlzLm9uTmV4dD1iO3RoaXMub25Db21wbGV0ZWQ9Zjt0aGlzLmpvaW5PYnNlcnZlcnM9bmV3IHQ7Zm9yKGE9MDthPHRoaXMuam9pbk9ic2VydmVyQXJyYXkubGVuZ3RoO2ErKyliPXRoaXMuam9pbk9ic2VydmVyQXJyYXlbYV0sdGhpcy5qb2luT2JzZXJ2ZXJzLmFkZChiLGIpfWIucHJvdG90eXBlLmRlcXVldWU9ZnVuY3Rpb24oKXt2YXIgYSxcbmI7Yj10aGlzLmpvaW5PYnNlcnZlcnMuZ2V0VmFsdWVzKCk7Zm9yKGE9MDthPGIubGVuZ3RoO2ErKyliW2FdLnF1ZXVlLnNoaWZ0KCl9O2IucHJvdG90eXBlLm1hdGNoPWZ1bmN0aW9uKCl7dmFyIGEsYixmO2E9ITA7Zm9yKGI9MDtiPHRoaXMuam9pbk9ic2VydmVyQXJyYXkubGVuZ3RoO2IrKylpZigwPT09dGhpcy5qb2luT2JzZXJ2ZXJBcnJheVtiXS5xdWV1ZS5sZW5ndGgpe2E9ITE7YnJlYWt9aWYoYSl7YT1bXTtmPSExO2ZvcihiPTA7Yjx0aGlzLmpvaW5PYnNlcnZlckFycmF5Lmxlbmd0aDtiKyspYS5wdXNoKHRoaXMuam9pbk9ic2VydmVyQXJyYXlbYl0ucXVldWVbMF0pLFwiQ1wiPT09dGhpcy5qb2luT2JzZXJ2ZXJBcnJheVtiXS5xdWV1ZVswXS5raW5kJiYoZj0hMCk7aWYoZil0aGlzLm9uQ29tcGxldGVkKCk7ZWxzZXt0aGlzLmRlcXVldWUoKTtmPVtdO2ZvcihiPTA7YjxhLmxlbmd0aDtiKyspZi5wdXNoKGFbYl0udmFsdWUpO3RoaXMub25OZXh0LmFwcGx5KHRoaXMsZil9fX07XG5yZXR1cm4gYn0oKTt2YXIgST1mdW5jdGlvbigpe2Z1bmN0aW9uIGIoYSxiKXt0aGlzLnNvdXJjZT1hO3RoaXMub25FcnJvcj1iO3RoaXMucXVldWU9W107dGhpcy5hY3RpdmVQbGFucz1uZXcgcTt0aGlzLnN1YnNjcmlwdGlvbj1uZXcgQzt0aGlzLmlzRGlzcG9zZWQ9ITF9eShiLEUpO2IucHJvdG90eXBlLmFkZEFjdGl2ZVBsYW49ZnVuY3Rpb24oYSl7dGhpcy5hY3RpdmVQbGFucy5hZGQoYSl9O2IucHJvdG90eXBlLnN1YnNjcmliZT1mdW5jdGlvbigpe3RoaXMuc3Vic2NyaXB0aW9uLmRpc3Bvc2FibGUodGhpcy5zb3VyY2UubWF0ZXJpYWxpemUoKS5zdWJzY3JpYmUodGhpcykpfTtiLnByb3RvdHlwZS5uZXh0PWZ1bmN0aW9uKGEpe3ZhciBiO2lmKCF0aGlzLmlzRGlzcG9zZWQpaWYoXCJFXCI9PT1hLmtpbmQpdGhpcy5vbkVycm9yKGEuZXhjZXB0aW9uKTtlbHNle3RoaXMucXVldWUucHVzaChhKTthPXRoaXMuYWN0aXZlUGxhbnMudG9BcnJheSgpO2ZvcihiPTA7YjxhLmxlbmd0aDtiKyspYVtiXS5tYXRjaCgpfX07XG5iLnByb3RvdHlwZS5lcnJvcj1mdW5jdGlvbigpe307Yi5wcm90b3R5cGUuY29tcGxldGVkPWZ1bmN0aW9uKCl7fTtiLnByb3RvdHlwZS5yZW1vdmVBY3RpdmVQbGFuPWZ1bmN0aW9uKGEpe3RoaXMuYWN0aXZlUGxhbnMucmVtb3ZlKGEpOzA9PT10aGlzLmFjdGl2ZVBsYW5zLmNvdW50KCkmJnRoaXMuZGlzcG9zZSgpfTtiLnByb3RvdHlwZS5kaXNwb3NlPWZ1bmN0aW9uKCl7Yi5iYXNlLmRpc3Bvc2UuY2FsbCh0aGlzKTtpZighdGhpcy5pc0Rpc3Bvc2VkKXRoaXMuaXNEaXNwb3NlZD0hMCx0aGlzLnN1YnNjcmlwdGlvbi5kaXNwb3NlKCl9O3JldHVybiBifSgpO3AuYW5kPWZ1bmN0aW9uKGIpe3JldHVybiBuZXcgdShbdGhpcyxiXSl9O3AudGhlbj1mdW5jdGlvbihiKXtyZXR1cm4obmV3IHUoW3RoaXNdKSkudGhlbihiKX07bC53aGVuPWZ1bmN0aW9uKCl7dmFyIGI9MT09PWFyZ3VtZW50cy5sZW5ndGgmJmFyZ3VtZW50c1swXWluc3RhbmNlb2YgQXJyYXk/YXJndW1lbnRzWzBdOncuY2FsbChhcmd1bWVudHMpO1xucmV0dXJuIHooZnVuY3Rpb24oYSl7dmFyIGM9bmV3IHEsZj1uZXcgdCxkLGUsZyxoLGk7aT1CKGZ1bmN0aW9uKGIpe2Eub25OZXh0KGIpfSxmdW5jdGlvbihiKXtmb3IodmFyIGM9Zi5nZXRWYWx1ZXMoKSxkPTA7ZDxjLmxlbmd0aDtkKyspY1tkXS5vbkVycm9yKGIpO2Eub25FcnJvcihiKX0sZnVuY3Rpb24oKXthLm9uQ29tcGxldGVkKCl9KTt0cnl7Zm9yKGU9MDtlPGIubGVuZ3RoO2UrKyljLmFkZChiW2VdLmFjdGl2YXRlKGYsaSxmdW5jdGlvbihhKXtjLnJlbW92ZShhKTtpZigwPT09Yy5jb3VudCgpKWkub25Db21wbGV0ZWQoKX0pKX1jYXRjaChqKXtBKGopLnN1YnNjcmliZShhKX1kPW5ldyBEO2g9Zi5nZXRWYWx1ZXMoKTtmb3IoZT0wO2U8aC5sZW5ndGg7ZSsrKWc9aFtlXSxnLnN1YnNjcmliZSgpLGQuYWRkKGcpO3JldHVybiBkfSl9fTtcbiJdfQ==
;