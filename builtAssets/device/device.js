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
},{}],8:[function(require,module,exports){
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

},{"../../views/lobby.hbs":15,"../../../3rdparty/routie":2,"../player":4,"../../../3rdparty/rx.zepto":16,"rxjs":17}],9:[function(require,module,exports){
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
    $('.up').on('touchstart', goUp);
    $('.up').on('touchend', stop);
    $('.down').on('touchstart', goDown);
    $('.down').on('touchend', stop);
  } else {
    $('.up').on('mousedown', goUp);
    $('.up').on('mouseup', stop);
    $('.down').on('mousedown', goDown);
    $('.down').on('mouseup', stop);
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

},{"../../views/gamepad.hbs":18,"../../../3rdparty/routie":2,"../player":4,"rxjs":17}],6:[function(require,module,exports){
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

},{"../../views/wait.hbs":19,"../player":4,"../../../3rdparty/routie":2,"../../../3rdparty/rx.zepto":16,"rxjs":17}],16:[function(require,module,exports){
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
  


  return "\n<h1>waiting for 2nd player</h1>\n\n<button id=\"cancel\" ontouchstart=\"\">cancel</button>\n";
  });

},{"handlebars-runtime":20}],11:[function(require,module,exports){
var Handlebars = require('handlebars-runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "\n<h1>Register To Play</h1>\n\n<form>\n  \n  <div class=\"field\">\n    <label>First name</label>\n    <input id=\"firstName\" type=\"text\" value=\"\" autocorrect=\"off\" />\n  </div>\n  \n  <div class=\"field\">\n    <label>Last name</label>\n    <input id=\"lastName\" type=\"text\" value=\"\" autocorrect=\"off\" />\n  </div>\n\n  <div class=\"field\">\n    <label>Email</label>\n    <input id=\"email\" type=\"email\" value=\"\" autocorrect=\"off\" />\n  </div>\n  \n  <div class=\"field\">\n    <label>Company</label>\n    <input id=\"company\" type=\"text\" value=\"\" autocorrect=\"off\" />\n  </div>\n  \n  <div class=\"field\">\n    <label>Role</label>\n	<select required id=\"role\">\n	<option value=\"Select Role\" selected>Select Role</option>\n	<option value=\"C-Level Executive\">C-Level Executive</option>\n	<option value=\"VP or Director\">VP or Director</option>\n	<option value=\"Manager\">Manager</option>\n	<option value=\"Project Manager\">Project Manager</option>\n	<option value=\"Team Lead\">Team Lead</option>\n	<option value=\"Architect\">Architect</option>\n	<option value=\"Developer\">Developer</option>\n	<option value=\"Consultant\">Consultant</option>\n	<option value=\"Student\">Student</option>\n	<option value=\"Press/Analyst\">Press/Analyst</option>\n	</select>\n  </div>\n\n  <div class=\"field\">\n    <label>Country</label>\n	<select required id=\"country\">\n	<option value=\"Select Country\" selected>Select Country</option>\n	<option value=\"DK\">Denmark</option>\n	<option value=\"GB\">United Kingdom</option>\n	<option value=\"AL\">Albania</option>\n	<option value=\"AD\">Andorra</option>\n	<option value=\"AT\">Austria</option>\n	<option value=\"BY\">Belarus</option>\n	<option value=\"BE\">Belgium</option>\n	<option value=\"BA\">Bosnia and Herzegovina</option>\n	<option value=\"BG\">Bulgaria</option>\n	<option value=\"HR\">Croatia</option>\n	<option value=\"CY\">Cyprus</option>\n	<option value=\"CZ\">Czech Republic</option>\n	<option value=\"EE\">Estonia</option>\n	<option value=\"FI\">Finland</option>\n	<option value=\"FR\">France</option>\n	<option value=\"DE\">Germany</option>\n	<option value=\"GR\">Greece</option>\n	<option value=\"HU\">Hungary</option>\n	<option value=\"IS\">Iceland</option>\n	<option value=\"IE\">Ireland</option>\n	<option value=\"IT\">Italy</option>\n	<option value=\"LV\">Latvia</option>\n	<option value=\"LI\">Liechtenstein</option>\n	<option value=\"LT\">Lithuania</option>\n	<option value=\"LU\">Luxembourg</option>\n	<option value=\"Macedonia\">Macedonia</option>\n	<option value=\"MT\">Malta</option>\n	<option value=\"Moldova\">Moldova</option>\n	<option value=\"MC\">Monaco</option>\n	<option value=\"ME\">Montenegro</option>\n	<option value=\"NL\">Netherlands</option>\n	<option value=\"NO\">Norway</option>\n	<option value=\"PL\">Poland</option>\n	<option value=\"PT\">Portugal</option>\n	<option value=\"RO\">Romania</option>\n	<option value=\"RS\">Serbia</option>\n	<option value=\"SK\">Slovakia</option>\n	<option value=\"SI\">Slovenia</option>\n	<option value=\"ES\">Spain</option>\n	<option value=\"SE\">Sweden</option>\n	<option value=\"CH\">Switzerland</option>\n	<option value=\"TR\">Turkey</option>\n	<option value=\"UA\">Ukraine</option>\n	<option value=\"AF\">Afghanistan</option>\n	<option value=\"AX\">Åland Islands</option>\n	<option value=\"DZ\">Algeria</option>\n	<option value=\"AS\">American Samoa</option>\n	<option value=\"AO\">Angola</option>\n	<option value=\"AI\">Anguilla</option>\n	<option value=\"AQ\">Antarctica</option>\n	<option value=\"AG\">Antigua and Barbuda</option>\n	<option value=\"AR\">Argentina</option>\n	<option value=\"AM\">Armenia</option>\n	<option value=\"AW\">Aruba</option>\n	<option value=\"AU\">Australia</option>\n	<option value=\"AZ\">Azerbaijan</option>\n	<option value=\"BS\">Bahamas</option>\n	<option value=\"BH\">Bahrain</option>\n	<option value=\"BD\">Bangladesh</option>\n	<option value=\"BB\">Barbados</option>\n	<option value=\"BZ\">Belize</option>\n	<option value=\"BJ\">Benin</option>\n	<option value=\"BM\">Bermuda</option>\n	<option value=\"BT\">Bhutan</option>\n	<option value=\"Bolivia\">Bolivia</option>\n	<option value=\"BW\">Botswana</option>\n	<option value=\"BV\">Bouvet Island</option>\n	<option value=\"BR\">Brazil</option>\n	<option value=\"BN\">Brunei Darussalam</option>\n	<option value=\"CU\">Cuba</option>\n	<option value=\"DJ\">Djibouti</option>\n	<option value=\"DM\">Dominica</option>\n	<option value=\"DO\">Dominican Republic</option>\n	<option value=\"EC\">Ecuador</option>\n	<option value=\"EG\">Egypt</option>\n	<option value=\"SV\">El Salvador</option>\n	<option value=\"GQ\">Equatorial Guinea</option>\n	<option value=\"ER\">Eritrea</option>\n	<option value=\"GF\">French Guiana</option>\n	<option value=\"PF\">French Polynesia</option>\n	<option value=\"GA\">Gabon</option>\n	<option value=\"GM\">Gambia</option>\n	<option value=\"GE\">Georgia</option>\n	<option value=\"GH\">Ghana</option>\n	<option value=\"GI\">Gibraltar</option>\n	<option value=\"GL\">Greenland</option>\n	<option value=\"GD\">Grenada</option>\n	<option value=\"GP\">Guadeloupe</option>\n	<option value=\"GU\">Guam</option>\n	<option value=\"GT\">Guatemala</option>\n	<option value=\"GG\">Guernsey</option>\n	<option value=\"GN\">Guinea</option>\n	<option value=\"GW\">Guinea-Bissau</option>\n	<option value=\"GY\">Guyana</option>\n	<option value=\"HT\">Haiti</option>\n	<option value=\"HN\">Honduras</option>\n	<option value=\"HK\">Hong Kong</option>\n	<option value=\"IN\">India</option>\n	<option value=\"ID\">Indonesia</option>\n	<option value=\"Iran\">Iran</option>\n	<option value=\"IQ\">Iraq</option>\n	<option value=\"IM\">Isle of Man</option>\n	<option value=\"IL\">Israel</option>\n	<option value=\"JM\">Jamaica</option>\n	<option value=\"JP\">Japan</option>\n	<option value=\"JE\">Jersey</option>\n	<option value=\"JO\">Jordan</option>\n	<option value=\"KZ\">Kazakhstan</option>\n	<option value=\"KE\">Kenya</option>\n	<option value=\"KI\">Kiribati</option>\n	<option value=\"Korea\">Republic of Korea</option>\n	<option value=\"Korea\">Democratic People's Republic of Korea</option>\n	<option value=\"KW\">Kuwait</option>\n	<option value=\"KG\">Kyrgyzstan</option>\n	<option value=\"LA\">Laos</option>\n	<option value=\"LB\">Lebanon</option>\n	<option value=\"LS\">Lesotho</option>\n	<option value=\"LR\">Liberia</option>\n	<option value=\"LY\">Libyan Arab Jamahiriya</option>\n	<option value=\"MO\">Macao</option>\n	<option value=\"MG\">Madagascar</option>\n	<option value=\"MW\">Malawi</option>\n	<option value=\"MY\">Malaysia</option>\n	<option value=\"MV\">Maldives</option>\n	<option value=\"ML\">Mali</option>\n	<option value=\"MH\">Marshall Islands</option>\n	<option value=\"MQ\">Martinique</option>\n	<option value=\"MR\">Mauritania</option>\n	<option value=\"MU\">Mauritius</option>\n	<option value=\"YT\">Mayotte</option>\n	<option value=\"MX\">Mexico</option>\n	<option value=\"Micronesia\">Micronesia</option>\n	<option value=\"MN\">Mongolia</option>\n	<option value=\"MS\">Montserrat</option>\n	<option value=\"MA\">Morocco</option>\n	<option value=\"MZ\">Mozambique</option>\n	<option value=\"MM\">Myanmar</option>\n	<option value=\"NA\">Namibia</option>\n	<option value=\"NR\">Nauru</option>\n	<option value=\"NP\">Nepal</option>\n	<option value=\"AN\">Netherlands Antilles</option>\n	<option value=\"NC\">New Caledonia</option>\n	<option value=\"NZ\">New Zealand</option>\n	<option value=\"NI\">Nicaragua</option>\n	<option value=\"NE\">Niger</option>\n	<option value=\"NG\">Nigeria</option>\n	<option value=\"NU\">Niue</option>\n	<option value=\"NF\">Norfolk Island</option>\n	<option value=\"MP\">Northern Mariana Islands</option>\n	<option value=\"OM\">Oman</option>\n	<option value=\"PK\">Pakistan</option>\n	<option value=\"PW\">Palau</option>\n	<option value=\"Palestine\">Palestine</option>\n	<option value=\"PA\">Panama</option>\n	<option value=\"PG\">Papua New Guinea</option>\n	<option value=\"PY\">Paraguay</option>\n	<option value=\"PE\">Peru</option>\n	<option value=\"PH\">Philippines</option>\n	<option value=\"PN\">Pitcairn</option>\n	<option value=\"PR\">Puerto Rico</option>\n	<option value=\"QA\">Qatar</option>\n	<option value=\"RE\">Réunion</option>\n	<option value=\"RU\">Russian Federation</option>\n	<option value=\"RW\">Rwanda</option>\n	<option value=\"BL\">Saint Barthélemy</option>\n	<option value=\"SH\">Saint Helena</option>\n	<option value=\"KN\">Saint Kitts and Nevis</option>\n	<option value=\"LC\">Saint Lucia</option>\n	<option value=\"MF\">Saint Martin</option>\n	<option value=\"PM\">Saint Pierre and Miquelon</option>\n	<option value=\"VC\">Saint Vincent and The Grenadines</option>\n	<option value=\"WS\">Samoa</option>\n	<option value=\"SM\">San Marino</option>\n	<option value=\"ST\">Sao Tome and Principe</option>\n	<option value=\"SA\">Saudi Arabia</option>\n	<option value=\"SN\">Senegal</option>\n	<option value=\"SC\">Seychelles</option>\n	<option value=\"SL\">Sierra Leone</option>\n	<option value=\"SG\">Singapore</option>\n	<option value=\"SB\">Solomon Islands</option>\n	<option value=\"SO\">Somalia</option>\n	<option value=\"ZA\">South Africa</option>\n	<option value=\"LK\">Sri Lanka</option>\n	<option value=\"SD\">Sudan</option>\n	<option value=\"SR\">Suriname</option>\n	<option value=\"SJ\">Svalbard and Jan Mayen</option>\n	<option value=\"SZ\">Swaziland</option>\n	<option value=\"Taiwan\">Taiwan</option>\n	<option value=\"TJ\">Tajikistan</option>\n	<option value=\"Tanzania\">Tanzania</option>\n	<option value=\"TH\">Thailand</option>\n	<option value=\"TL\">Timor-Leste</option>\n	<option value=\"TG\">Togo</option>\n	<option value=\"TK\">Tokelau</option>\n	<option value=\"TO\">Tonga</option>\n	<option value=\"TT\">Trinidad and Tobago</option>\n	<option value=\"TN\">Tunisia</option>\n	<option value=\"TM\">Turkmenistan</option>\n	<option value=\"TC\">Turks and Caicos Islands</option>\n	<option value=\"TV\">Tuvalu</option>\n	<option value=\"UG\">Uganda</option>\n	<option value=\"AE\">United Arab Emirates</option>\n	<option value=\"US\">United States</option>\n	<option value=\"UY\">Uruguay</option>\n	<option value=\"UZ\">Uzbekistan</option>\n	<option value=\"VU\">Vanuatu</option>\n	<option value=\"VA\">Vatican</option>\n	<option value=\"Venezuela\">Venezuela</option>\n	<option value=\"VN\">Viet Nam</option>\n	<option value=\"Virgin Islands\">Virgin Islands</option>\n	<option value=\"Virgin Islands\">Virgin Islands</option>\n	<option value=\"VI\">U.S.</option>\n	<option value=\"WF\">Wallis and Futuna</option>\n	<option value=\"EH\">Western Sahara</option>\n	<option value=\"YE\">Yemen</option>\n	<option value=\"ZM\">Zambia</option>\n	<option value=\"ZW\">Zimbabwe</option></select>\n  </div>\n  \n  <button>Play!</button>\n  \n</form>\n";
  });

},{"handlebars-runtime":20}],12:[function(require,module,exports){
var Handlebars = require('handlebars-runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "\n<h1>Press start to join the game</h1>\n\n<button id=\"join\" ontouchstart=\"\">Start</button>\n";
  });

},{"handlebars-runtime":20}],18:[function(require,module,exports){
var Handlebars = require('handlebars-runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "<div class=\"player\">\n\n<div class=\"device-background\"></div>\n \n  <div class=\"device clearfix\">\n    <div class=\"controller clearfix\">\n      <div class=\"button\">\n        <div class=\"up\"><i class=\"icon-caret-up\"></i></div>\n      </div>\n      <div class=\"button\">\n        <div class=\"down\"><i class=\"icon-caret-down\"></i></div>\n      </div>\n    </div>\n  </div>\n\n</div>\n\n";
  });

},{"handlebars-runtime":20}],19:[function(require,module,exports){
var Handlebars = require('handlebars-runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "\n<h1>match in progress</h1>\n\n<p>\n  As soon as the current match is finished,\n  you'll be able to join the action!\n</p>\n";
  });

},{"handlebars-runtime":20}],13:[function(require,module,exports){
var Handlebars = require('handlebars-runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "\n<h1>thanks for playing</h1>\n\n<p>\n  be sure to ask about what we do&hellip; <br />\n  and how we built this game\n</p>\n";
  });

},{"handlebars-runtime":20}],20:[function(require,module,exports){
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

},{}],17:[function(require,module,exports){
(function(global){require("./rx.min.js")(global);
require("./rx.aggregates.min.js")(global);
require("./rx.coincidence.min.js")(global);
require("./rx.joinpatterns.min.js")(global);
require("./rx.time.min.js")(global);

module.exports = Rx

})(window)
},{"./rx.min.js":21,"./rx.coincidence.min.js":22,"./rx.joinpatterns.min.js":23,"./rx.aggregates.min.js":24,"./rx.time.min.js":25}],22:[function(require,module,exports){
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

},{}],24:[function(require,module,exports){
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

},{}],23:[function(require,module,exports){
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

},{}],25:[function(require,module,exports){
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

},{}]},{},[1])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvdGFqaW1vYmkvV29yay9VSWRldi9qZXRwZXRzL2pldHBldHMvYXNzZXRzL2RldmljZS9qcy9kZXZpY2UuanMiLCIvVXNlcnMvdGFqaW1vYmkvV29yay9VSWRldi9qZXRwZXRzL2pldHBldHMvYXNzZXRzLzNyZHBhcnR5L3JvdXRpZS5qcyIsIi9Vc2Vycy90YWppbW9iaS9Xb3JrL1VJZGV2L2pldHBldHMvamV0cGV0cy9hc3NldHMvM3JkcGFydHkvdGFwcGFibGUuanMiLCIvVXNlcnMvdGFqaW1vYmkvV29yay9VSWRldi9qZXRwZXRzL2pldHBldHMvYXNzZXRzL2RldmljZS9qcy9jb250cm9sbGVycy9yZWdpc3Rlci5qcyIsIi9Vc2Vycy90YWppbW9iaS9Xb3JrL1VJZGV2L2pldHBldHMvamV0cGV0cy9hc3NldHMvZGV2aWNlL2pzL2NvbnRyb2xsZXJzL2pvaW4uanMiLCIvVXNlcnMvdGFqaW1vYmkvV29yay9VSWRldi9qZXRwZXRzL2pldHBldHMvYXNzZXRzL2RldmljZS9qcy9jb250cm9sbGVycy90aGFua3MuanMiLCIvVXNlcnMvdGFqaW1vYmkvV29yay9VSWRldi9qZXRwZXRzL2pldHBldHMvYXNzZXRzL2RldmljZS9qcy9wbGF5ZXIuanMiLCIvVXNlcnMvdGFqaW1vYmkvV29yay9VSWRldi9qZXRwZXRzL2pldHBldHMvbm9kZV9tb2R1bGVzL3VuZGVyc2NvcmUvdW5kZXJzY29yZS5qcyIsIi9Vc2Vycy90YWppbW9iaS9Xb3JrL1VJZGV2L2pldHBldHMvamV0cGV0cy9hc3NldHMvZGV2aWNlL2pzL2NvbnRyb2xsZXJzL2xvYmJ5LmpzIiwiL1VzZXJzL3Rhamltb2JpL1dvcmsvVUlkZXYvamV0cGV0cy9qZXRwZXRzL2Fzc2V0cy9kZXZpY2UvanMvY29udHJvbGxlcnMvZ2FtZXBhZC5qcyIsIi9Vc2Vycy90YWppbW9iaS9Xb3JrL1VJZGV2L2pldHBldHMvamV0cGV0cy9hc3NldHMvZGV2aWNlL2pzL2NvbnRyb2xsZXJzL3dhaXQuanMiLCIvVXNlcnMvdGFqaW1vYmkvV29yay9VSWRldi9qZXRwZXRzL2pldHBldHMvYXNzZXRzLzNyZHBhcnR5L3J4LnplcHRvLmpzIiwiL1VzZXJzL3Rhamltb2JpL1dvcmsvVUlkZXYvamV0cGV0cy9qZXRwZXRzL2Fzc2V0cy9kZXZpY2Uvdmlld3MvbG9iYnkuaGJzIiwiL1VzZXJzL3Rhamltb2JpL1dvcmsvVUlkZXYvamV0cGV0cy9qZXRwZXRzL2Fzc2V0cy9kZXZpY2Uvdmlld3MvcmVnaXN0ZXItYWR2YW5jZWQuaGJzIiwiL1VzZXJzL3Rhamltb2JpL1dvcmsvVUlkZXYvamV0cGV0cy9qZXRwZXRzL2Fzc2V0cy9kZXZpY2Uvdmlld3Mvam9pbi5oYnMiLCIvVXNlcnMvdGFqaW1vYmkvV29yay9VSWRldi9qZXRwZXRzL2pldHBldHMvYXNzZXRzL2RldmljZS92aWV3cy9nYW1lcGFkLmhicyIsIi9Vc2Vycy90YWppbW9iaS9Xb3JrL1VJZGV2L2pldHBldHMvamV0cGV0cy9hc3NldHMvZGV2aWNlL3ZpZXdzL3dhaXQuaGJzIiwiL1VzZXJzL3Rhamltb2JpL1dvcmsvVUlkZXYvamV0cGV0cy9qZXRwZXRzL2Fzc2V0cy9kZXZpY2Uvdmlld3MvdGhhbmtzLmhicyIsIi9Vc2Vycy90YWppbW9iaS9Xb3JrL1VJZGV2L2pldHBldHMvamV0cGV0cy9ub2RlX21vZHVsZXMvaGFuZGxlYmFycy1ydW50aW1lL2hhbmRsZWJhcnMucnVudGltZS5qcyIsIi9Vc2Vycy90YWppbW9iaS9Xb3JrL1VJZGV2L2pldHBldHMvamV0cGV0cy9ub2RlX21vZHVsZXMvcnhqcy9saWIvcnguanMiLCIvVXNlcnMvdGFqaW1vYmkvV29yay9VSWRldi9qZXRwZXRzL2pldHBldHMvbm9kZV9tb2R1bGVzL3J4anMvbGliL3J4LmNvaW5jaWRlbmNlLm1pbi5qcyIsIi9Vc2Vycy90YWppbW9iaS9Xb3JrL1VJZGV2L2pldHBldHMvamV0cGV0cy9ub2RlX21vZHVsZXMvcnhqcy9saWIvcnguYWdncmVnYXRlcy5taW4uanMiLCIvVXNlcnMvdGFqaW1vYmkvV29yay9VSWRldi9qZXRwZXRzL2pldHBldHMvbm9kZV9tb2R1bGVzL3J4anMvbGliL3J4Lm1pbi5qcyIsIi9Vc2Vycy90YWppbW9iaS9Xb3JrL1VJZGV2L2pldHBldHMvamV0cGV0cy9ub2RlX21vZHVsZXMvcnhqcy9saWIvcnguam9pbnBhdHRlcm5zLm1pbi5qcyIsIi9Vc2Vycy90YWppbW9iaS9Xb3JrL1VJZGV2L2pldHBldHMvamV0cGV0cy9ub2RlX21vZHVsZXMvcnhqcy9saWIvcngudGltZS5taW4uanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3UEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzc0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM1dBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbInZhciByb3V0aWUgPSByZXF1aXJlKCcuLi8uLi8zcmRwYXJ0eS9yb3V0aWUnKTtcbnZhciB0YXBwYWJsZSA9IHJlcXVpcmUoJy4uLy4uLzNyZHBhcnR5L3RhcHBhYmxlJyk7XG52YXIgcGxheWVyID0gcmVxdWlyZSgnLi9wbGF5ZXInKTtcblxud2luZG93LkRldmljZSA9IGZ1bmN0aW9uKCkge1xuICBcbiAgcm91dGllKHtcbiAgICAgICcnOiAgICAgICAgICAgIHJlcXVpcmUoJy4vY29udHJvbGxlcnMvcmVnaXN0ZXInKSxcbiAgICAgICcvcmVnaXN0ZXInOiAgIHJlcXVpcmUoJy4vY29udHJvbGxlcnMvcmVnaXN0ZXInKSxcbiAgICAgICcvd2FpdCc6ICAgICAgIHJlcXVpcmUoJy4vY29udHJvbGxlcnMvd2FpdCcpLFxuICAgICAgJy9qb2luJzogICAgICAgcmVxdWlyZSgnLi9jb250cm9sbGVycy9qb2luJyksXG4gICAgICAnL2xvYmJ5JzogICAgICByZXF1aXJlKCcuL2NvbnRyb2xsZXJzL2xvYmJ5JyksXG4gICAgICAnL2dhbWVwYWQnOiAgICByZXF1aXJlKCcuL2NvbnRyb2xsZXJzL2dhbWVwYWQnKSxcbiAgICAgICcvdGhhbmtzJzogICAgIHJlcXVpcmUoJy4vY29udHJvbGxlcnMvdGhhbmtzJylcbiAgfSk7XG4gIFxuICAkKCcjbWVudScpLm9uKCdjbGljaycsIGZ1bmN0aW9uKCkge1xuICAgIGlmICh3aW5kb3cuY29uZmlybSgnZGlzY29ubmVjdCBwbGF5ZXI/JykpIHtcbiAgICAgIHBsYXllci5yZXNldCgpO1xuICAgICAgcm91dGllLm5hdmlnYXRlKCcvJyk7XG4gICAgfVxuICB9KTtcbiAgXG59O1xuIiwiKGZ1bmN0aW9uIChyb290LCBmYWN0b3J5KSB7XG4gIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZhY3Rvcnkod2luZG93KTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcbiAgICBkZWZpbmUoW10sIGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiAocm9vdC5yb3V0aWUgPSBmYWN0b3J5KHdpbmRvdykpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJvb3Qucm91dGllID0gZmFjdG9yeSh3aW5kb3cpO1xuICB9XG59KHRoaXMsIGZ1bmN0aW9uICh3KSB7XG5cbiAgdmFyIHJvdXRlcyA9IFtdO1xuICB2YXIgbWFwID0ge307XG4gIHZhciByZWZlcmVuY2UgPSBcInJvdXRpZVwiO1xuICB2YXIgb2xkUmVmZXJlbmNlID0gd1tyZWZlcmVuY2VdO1xuXG4gIHZhciBSb3V0ZSA9IGZ1bmN0aW9uKHBhdGgsIG5hbWUpIHtcbiAgICB0aGlzLm5hbWUgPSBuYW1lO1xuICAgIHRoaXMucGF0aCA9IHBhdGg7XG4gICAgdGhpcy5rZXlzID0gW107XG4gICAgdGhpcy5mbnMgPSBbXTtcbiAgICB0aGlzLnBhcmFtcyA9IHt9O1xuICAgIHRoaXMucmVnZXggPSBwYXRoVG9SZWdleHAodGhpcy5wYXRoLCB0aGlzLmtleXMsIGZhbHNlLCBmYWxzZSk7XG5cbiAgfTtcblxuICBSb3V0ZS5wcm90b3R5cGUuYWRkSGFuZGxlciA9IGZ1bmN0aW9uKGZuKSB7XG4gICAgdGhpcy5mbnMucHVzaChmbik7XG4gIH07XG5cbiAgUm91dGUucHJvdG90eXBlLnJlbW92ZUhhbmRsZXIgPSBmdW5jdGlvbihmbikge1xuICAgIGZvciAodmFyIGkgPSAwLCBjID0gdGhpcy5mbnMubGVuZ3RoOyBpIDwgYzsgaSsrKSB7XG4gICAgICB2YXIgZiA9IHRoaXMuZm5zW2ldO1xuICAgICAgaWYgKGZuID09IGYpIHtcbiAgICAgICAgdGhpcy5mbnMuc3BsaWNlKGksIDEpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIFJvdXRlLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbihwYXJhbXMpIHtcbiAgICBmb3IgKHZhciBpID0gMCwgYyA9IHRoaXMuZm5zLmxlbmd0aDsgaSA8IGM7IGkrKykge1xuICAgICAgdGhpcy5mbnNbaV0uYXBwbHkodGhpcywgcGFyYW1zKTtcbiAgICB9XG4gIH07XG5cbiAgUm91dGUucHJvdG90eXBlLm1hdGNoID0gZnVuY3Rpb24ocGF0aCwgcGFyYW1zKXtcbiAgICB2YXIgbSA9IHRoaXMucmVnZXguZXhlYyhwYXRoKTtcblxuICAgIGlmICghbSkgcmV0dXJuIGZhbHNlO1xuXG5cbiAgICBmb3IgKHZhciBpID0gMSwgbGVuID0gbS5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgICAgdmFyIGtleSA9IHRoaXMua2V5c1tpIC0gMV07XG5cbiAgICAgIHZhciB2YWwgPSAoJ3N0cmluZycgPT0gdHlwZW9mIG1baV0pID8gZGVjb2RlVVJJQ29tcG9uZW50KG1baV0pIDogbVtpXTtcblxuICAgICAgaWYgKGtleSkge1xuICAgICAgICB0aGlzLnBhcmFtc1trZXkubmFtZV0gPSB2YWw7XG4gICAgICB9XG4gICAgICBwYXJhbXMucHVzaCh2YWwpO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9O1xuXG4gIFJvdXRlLnByb3RvdHlwZS50b1VSTCA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICAgIHZhciBwYXRoID0gdGhpcy5wYXRoO1xuICAgIGZvciAodmFyIHBhcmFtIGluIHBhcmFtcykge1xuICAgICAgcGF0aCA9IHBhdGgucmVwbGFjZSgnLzonK3BhcmFtLCAnLycrcGFyYW1zW3BhcmFtXSk7XG4gICAgfVxuICAgIHBhdGggPSBwYXRoLnJlcGxhY2UoL1xcLzouKlxcPy9nLCAnLycpLnJlcGxhY2UoL1xcPy9nLCAnJyk7XG4gICAgaWYgKHBhdGguaW5kZXhPZignOicpICE9IC0xKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21pc3NpbmcgcGFyYW1ldGVycyBmb3IgdXJsOiAnK3BhdGgpO1xuICAgIH1cbiAgICByZXR1cm4gcGF0aDtcbiAgfTtcblxuICB2YXIgcGF0aFRvUmVnZXhwID0gZnVuY3Rpb24ocGF0aCwga2V5cywgc2Vuc2l0aXZlLCBzdHJpY3QpIHtcbiAgICBpZiAocGF0aCBpbnN0YW5jZW9mIFJlZ0V4cCkgcmV0dXJuIHBhdGg7XG4gICAgaWYgKHBhdGggaW5zdGFuY2VvZiBBcnJheSkgcGF0aCA9ICcoJyArIHBhdGguam9pbignfCcpICsgJyknO1xuICAgIHBhdGggPSBwYXRoXG4gICAgICAuY29uY2F0KHN0cmljdCA/ICcnIDogJy8/JylcbiAgICAgIC5yZXBsYWNlKC9cXC9cXCgvZywgJyg/Oi8nKVxuICAgICAgLnJlcGxhY2UoL1xcKy9nLCAnX19wbHVzX18nKVxuICAgICAgLnJlcGxhY2UoLyhcXC8pPyhcXC4pPzooXFx3KykoPzooXFwoLio/XFwpKSk/KFxcPyk/L2csIGZ1bmN0aW9uKF8sIHNsYXNoLCBmb3JtYXQsIGtleSwgY2FwdHVyZSwgb3B0aW9uYWwpe1xuICAgICAgICBrZXlzLnB1c2goeyBuYW1lOiBrZXksIG9wdGlvbmFsOiAhISBvcHRpb25hbCB9KTtcbiAgICAgICAgc2xhc2ggPSBzbGFzaCB8fCAnJztcbiAgICAgICAgcmV0dXJuICcnICsgKG9wdGlvbmFsID8gJycgOiBzbGFzaCkgKyAnKD86JyArIChvcHRpb25hbCA/IHNsYXNoIDogJycpICsgKGZvcm1hdCB8fCAnJykgKyAoY2FwdHVyZSB8fCAoZm9ybWF0ICYmICcoW14vLl0rPyknIHx8ICcoW14vXSs/KScpKSArICcpJyArIChvcHRpb25hbCB8fCAnJyk7XG4gICAgICB9KVxuICAgICAgLnJlcGxhY2UoLyhbXFwvLl0pL2csICdcXFxcJDEnKVxuICAgICAgLnJlcGxhY2UoL19fcGx1c19fL2csICcoLispJylcbiAgICAgIC5yZXBsYWNlKC9cXCovZywgJyguKiknKTtcbiAgICByZXR1cm4gbmV3IFJlZ0V4cCgnXicgKyBwYXRoICsgJyQnLCBzZW5zaXRpdmUgPyAnJyA6ICdpJyk7XG4gIH07XG5cbiAgdmFyIGFkZEhhbmRsZXIgPSBmdW5jdGlvbihwYXRoLCBmbikge1xuICAgIHZhciBzID0gcGF0aC5zcGxpdCgnICcpO1xuICAgIHZhciBuYW1lID0gKHMubGVuZ3RoID09IDIpID8gc1swXSA6IG51bGw7XG4gICAgcGF0aCA9IChzLmxlbmd0aCA9PSAyKSA/IHNbMV0gOiBzWzBdO1xuXG4gICAgaWYgKCFtYXBbcGF0aF0pIHtcbiAgICAgIG1hcFtwYXRoXSA9IG5ldyBSb3V0ZShwYXRoLCBuYW1lKTtcbiAgICAgIHJvdXRlcy5wdXNoKG1hcFtwYXRoXSk7XG4gICAgfVxuICAgIG1hcFtwYXRoXS5hZGRIYW5kbGVyKGZuKTtcbiAgfTtcblxuICB2YXIgcm91dGllID0gZnVuY3Rpb24ocGF0aCwgZm4pIHtcbiAgICBpZiAodHlwZW9mIGZuID09ICdmdW5jdGlvbicpIHtcbiAgICAgIGFkZEhhbmRsZXIocGF0aCwgZm4pO1xuICAgICAgcm91dGllLnJlbG9hZCgpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHBhdGggPT0gJ29iamVjdCcpIHtcbiAgICAgIGZvciAodmFyIHAgaW4gcGF0aCkge1xuICAgICAgICBhZGRIYW5kbGVyKHAsIHBhdGhbcF0pO1xuICAgICAgfVxuICAgICAgcm91dGllLnJlbG9hZCgpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZuID09PSAndW5kZWZpbmVkJykge1xuICAgICAgcm91dGllLm5hdmlnYXRlKHBhdGgpO1xuICAgIH1cbiAgfTtcblxuICByb3V0aWUubG9va3VwID0gZnVuY3Rpb24obmFtZSwgb2JqKSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGMgPSByb3V0ZXMubGVuZ3RoOyBpIDwgYzsgaSsrKSB7XG4gICAgICB2YXIgcm91dGUgPSByb3V0ZXNbaV07XG4gICAgICBpZiAocm91dGUubmFtZSA9PSBuYW1lKSB7XG4gICAgICAgIHJldHVybiByb3V0ZS50b1VSTChvYmopO1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICByb3V0aWUucmVtb3ZlID0gZnVuY3Rpb24ocGF0aCwgZm4pIHtcbiAgICB2YXIgcm91dGUgPSBtYXBbcGF0aF07XG4gICAgaWYgKCFyb3V0ZSlcbiAgICAgIHJldHVybjtcbiAgICByb3V0ZS5yZW1vdmVIYW5kbGVyKGZuKTtcbiAgfTtcblxuICByb3V0aWUucmVtb3ZlQWxsID0gZnVuY3Rpb24oKSB7XG4gICAgbWFwID0ge307XG4gICAgcm91dGVzID0gW107XG4gIH07XG5cbiAgcm91dGllLm5hdmlnYXRlID0gZnVuY3Rpb24ocGF0aCwgb3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciBzaWxlbnQgPSBvcHRpb25zLnNpbGVudCB8fCBmYWxzZTtcblxuICAgIGlmIChzaWxlbnQpIHtcbiAgICAgIHJlbW92ZUxpc3RlbmVyKCk7XG4gICAgfVxuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IHBhdGg7XG5cbiAgICAgIGlmIChzaWxlbnQpIHtcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHsgXG4gICAgICAgICAgYWRkTGlzdGVuZXIoKTtcbiAgICAgICAgfSwgMSk7XG4gICAgICB9XG5cbiAgICB9LCAxKTtcbiAgfTtcblxuICByb3V0aWUubm9Db25mbGljdCA9IGZ1bmN0aW9uKCkge1xuICAgIHdbcmVmZXJlbmNlXSA9IG9sZFJlZmVyZW5jZTtcbiAgICByZXR1cm4gcm91dGllO1xuICB9O1xuXG4gIHZhciBnZXRIYXNoID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHdpbmRvdy5sb2NhdGlvbi5oYXNoLnN1YnN0cmluZygxKTtcbiAgfTtcblxuICB2YXIgY2hlY2tSb3V0ZSA9IGZ1bmN0aW9uKGhhc2gsIHJvdXRlKSB7XG4gICAgdmFyIHBhcmFtcyA9IFtdO1xuICAgIGlmIChyb3V0ZS5tYXRjaChoYXNoLCBwYXJhbXMpKSB7XG4gICAgICByb3V0ZS5ydW4ocGFyYW1zKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH07XG5cbiAgdmFyIGhhc2hDaGFuZ2VkID0gcm91dGllLnJlbG9hZCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBoYXNoID0gZ2V0SGFzaCgpO1xuICAgIGZvciAodmFyIGkgPSAwLCBjID0gcm91dGVzLmxlbmd0aDsgaSA8IGM7IGkrKykge1xuICAgICAgdmFyIHJvdXRlID0gcm91dGVzW2ldO1xuICAgICAgaWYgKGNoZWNrUm91dGUoaGFzaCwgcm91dGUpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgdmFyIGFkZExpc3RlbmVyID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHcuYWRkRXZlbnRMaXN0ZW5lcikge1xuICAgICAgdy5hZGRFdmVudExpc3RlbmVyKCdoYXNoY2hhbmdlJywgaGFzaENoYW5nZWQsIGZhbHNlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdy5hdHRhY2hFdmVudCgnb25oYXNoY2hhbmdlJywgaGFzaENoYW5nZWQpO1xuICAgIH1cbiAgfTtcblxuICB2YXIgcmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAody5yZW1vdmVFdmVudExpc3RlbmVyKSB7XG4gICAgICB3LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2hhc2hjaGFuZ2UnLCBoYXNoQ2hhbmdlZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHcuZGV0YWNoRXZlbnQoJ29uaGFzaGNoYW5nZScsIGhhc2hDaGFuZ2VkKTtcbiAgICB9XG4gIH07XG4gIGFkZExpc3RlbmVyKCk7XG5cbiAgcmV0dXJuIHJvdXRpZTtcbn0pKTtcbiIsIihmdW5jdGlvbigpeyhmdW5jdGlvbihyb290LCBmYWN0b3J5KXtcbiAgLy8gU2V0IHVwIFRhcHBhYmxlIGFwcHJvcHJpYXRlbHkgZm9yIHRoZSBlbnZpcm9ubWVudC5cbiAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCl7XG4gICAgLy8gQU1EXG4gICAgZGVmaW5lKCd0YXBwYWJsZScsIFtdLCBmdW5jdGlvbigpe1xuICAgICAgZmFjdG9yeShyb290LCB3aW5kb3cuZG9jdW1lbnQpO1xuICAgICAgcmV0dXJuIHJvb3QudGFwcGFibGU7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgLy8gQnJvd3NlciBnbG9iYWwgc2NvcGVcbiAgICBmYWN0b3J5KHJvb3QsIHdpbmRvdy5kb2N1bWVudCk7XG4gIH1cbn0odGhpcywgZnVuY3Rpb24odywgZCl7XG5cbiAgdmFyIGFicyA9IE1hdGguYWJzLFxuICAgIG5vb3AgPSBmdW5jdGlvbigpe30sXG4gICAgZGVmYXVsdHMgPSB7XG4gICAgICBub1Njcm9sbDogZmFsc2UsXG4gICAgICBhY3RpdmVDbGFzczogJ3RhcHBhYmxlLWFjdGl2ZScsXG4gICAgICBvblRhcDogbm9vcCxcbiAgICAgIG9uU3RhcnQ6IG5vb3AsXG4gICAgICBvbk1vdmU6IG5vb3AsXG4gICAgICBvbk1vdmVPdXQ6IG5vb3AsXG4gICAgICBvbk1vdmVJbjogbm9vcCxcbiAgICAgIG9uRW5kOiBub29wLFxuICAgICAgb25DYW5jZWw6IG5vb3AsXG4gICAgICBhbGxvd0NsaWNrOiBmYWxzZSxcbiAgICAgIGJvdW5kTWFyZ2luOiA1MCxcbiAgICAgIG5vU2Nyb2xsRGVsYXk6IDAsXG4gICAgICBhY3RpdmVDbGFzc0RlbGF5OiAwLFxuICAgICAgaW5hY3RpdmVDbGFzc0RlbGF5OiAwXG4gICAgfSxcbiAgICBzdXBwb3J0VG91Y2ggPSAnb250b3VjaGVuZCcgaW4gZG9jdW1lbnQsXG4gICAgZXZlbnRzID0ge1xuICAgICAgc3RhcnQ6IHN1cHBvcnRUb3VjaCA/ICd0b3VjaHN0YXJ0JyA6ICdtb3VzZWRvd24nLFxuICAgICAgbW92ZTogc3VwcG9ydFRvdWNoID8gJ3RvdWNobW92ZScgOiAnbW91c2Vtb3ZlJyxcbiAgICAgIGVuZDogc3VwcG9ydFRvdWNoID8gJ3RvdWNoZW5kJyA6ICdtb3VzZXVwJ1xuICAgIH0sXG4gICAgZ2V0VGFyZ2V0QnlDb29yZHMgPSBmdW5jdGlvbih4LCB5KXtcbiAgICAgIHZhciBlbCA9IGQuZWxlbWVudEZyb21Qb2ludCh4LCB5KTtcbiAgICAgIGlmIChlbC5ub2RlVHlwZSA9PSAzKSBlbCA9IGVsLnBhcmVudE5vZGU7XG4gICAgICByZXR1cm4gZWw7XG4gICAgfSxcbiAgICBnZXRUYXJnZXQgPSBmdW5jdGlvbihlKXtcbiAgICAgIHZhciBlbCA9IGUudGFyZ2V0O1xuICAgICAgaWYgKGVsKSB7XG4gICAgICAgIGlmIChlbC5ub2RlVHlwZSA9PSAzKSBlbCA9IGVsLnBhcmVudE5vZGU7XG4gICAgICAgIHJldHVybiBlbDtcbiAgICAgIH1cbiAgICAgIHZhciB0b3VjaCA9IGUudGFyZ2V0VG91Y2hlc1swXTtcbiAgICAgIHJldHVybiBnZXRUYXJnZXRCeUNvb3Jkcyh0b3VjaC5jbGllbnRYLCB0b3VjaC5jbGllbnRZKTtcbiAgICB9LFxuICAgIGNsZWFuID0gZnVuY3Rpb24oc3RyKXtcbiAgICAgIHJldHVybiBzdHIucmVwbGFjZSgvXFxzKy9nLCAnICcpLnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKTtcbiAgICB9LFxuICAgIGFkZENsYXNzID0gZnVuY3Rpb24oZWwsIGNsYXNzTmFtZSl7XG4gICAgICBpZiAoIWNsYXNzTmFtZSkgcmV0dXJuO1xuICAgICAgaWYgKGVsLmNsYXNzTGlzdCl7XG4gICAgICAgIGVsLmNsYXNzTGlzdC5hZGQoY2xhc3NOYW1lKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKGNsZWFuKGVsLmNsYXNzTmFtZSkuaW5kZXhPZihjbGFzc05hbWUpID4gLTEpIHJldHVybjtcbiAgICAgIGVsLmNsYXNzTmFtZSA9IGNsZWFuKGVsLmNsYXNzTmFtZSArICcgJyArIGNsYXNzTmFtZSk7XG4gICAgfSxcbiAgICByZW1vdmVDbGFzcyA9IGZ1bmN0aW9uKGVsLCBjbGFzc05hbWUpe1xuICAgICAgaWYgKCFjbGFzc05hbWUpIHJldHVybjtcbiAgICAgIGlmIChlbC5jbGFzc0xpc3Qpe1xuICAgICAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKGNsYXNzTmFtZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGVsLmNsYXNzTmFtZSA9IGVsLmNsYXNzTmFtZS5yZXBsYWNlKG5ldyBSZWdFeHAoJyhefFxcXFxzKScgKyBjbGFzc05hbWUgKyAnKD86XFxcXHN8JCknKSwgJyQxJyk7XG4gICAgfSxcbiAgICBtYXRjaGVzU2VsZWN0b3IgPSBmdW5jdGlvbihub2RlLCBzZWxlY3Rvcil7XG4gICAgICB2YXIgcm9vdCA9IGQuZG9jdW1lbnRFbGVtZW50LFxuICAgICAgICBtYXRjaGVzID0gcm9vdC5tYXRjaGVzU2VsZWN0b3IgfHwgcm9vdC5tb3pNYXRjaGVzU2VsZWN0b3IgfHwgcm9vdC53ZWJraXRNYXRjaGVzU2VsZWN0b3IgfHwgcm9vdC5vTWF0Y2hlc1NlbGVjdG9yIHx8IHJvb3QubXNNYXRjaGVzU2VsZWN0b3I7XG4gICAgICByZXR1cm4gbWF0Y2hlcy5jYWxsKG5vZGUsIHNlbGVjdG9yKTtcbiAgICB9LFxuICAgIGNsb3Nlc3QgPSBmdW5jdGlvbihub2RlLCBzZWxlY3Rvcil7XG4gICAgICB2YXIgbWF0Y2hlcyA9IGZhbHNlO1xuICAgICAgZG8ge1xuICAgICAgICBtYXRjaGVzID0gbWF0Y2hlc1NlbGVjdG9yKG5vZGUsIHNlbGVjdG9yKTtcbiAgICAgIH0gd2hpbGUgKCFtYXRjaGVzICYmIChub2RlID0gbm9kZS5wYXJlbnROb2RlKSAmJiBub2RlLm93bmVyRG9jdW1lbnQpO1xuICAgICAgcmV0dXJuIG1hdGNoZXMgPyBub2RlIDogZmFsc2U7XG4gICAgfTtcblxuICB3LnRhcHBhYmxlID0gZnVuY3Rpb24oc2VsZWN0b3IsIG9wdHMpe1xuICAgIGlmICh0eXBlb2Ygb3B0cyA9PSAnZnVuY3Rpb24nKSBvcHRzID0geyBvblRhcDogb3B0cyB9O1xuICAgIHZhciBvcHRpb25zID0ge307XG4gICAgZm9yICh2YXIga2V5IGluIGRlZmF1bHRzKSBvcHRpb25zW2tleV0gPSBvcHRzW2tleV0gfHwgZGVmYXVsdHNba2V5XTtcblxuICAgIHZhciBlbCA9IG9wdGlvbnMuY29udGFpbmVyRWxlbWVudCB8fCBkLmJvZHksXG4gICAgICBzdGFydFRhcmdldCxcbiAgICAgIHByZXZUYXJnZXQsXG4gICAgICBzdGFydFgsXG4gICAgICBzdGFydFksXG4gICAgICBlbEJvdW5kLFxuICAgICAgY2FuY2VsID0gZmFsc2UsXG4gICAgICBtb3ZlT3V0ID0gZmFsc2UsXG4gICAgICBhY3RpdmVDbGFzcyA9IG9wdGlvbnMuYWN0aXZlQ2xhc3MsXG4gICAgICBhY3RpdmVDbGFzc0RlbGF5ID0gb3B0aW9ucy5hY3RpdmVDbGFzc0RlbGF5LFxuICAgICAgYWN0aXZlQ2xhc3NUaW1lb3V0LFxuICAgICAgaW5hY3RpdmVDbGFzc0RlbGF5ID0gb3B0aW9ucy5pbmFjdGl2ZUNsYXNzRGVsYXksXG4gICAgICBpbmFjdGl2ZUNsYXNzVGltZW91dCxcbiAgICAgIG5vU2Nyb2xsID0gb3B0aW9ucy5ub1Njcm9sbCxcbiAgICAgIG5vU2Nyb2xsRGVsYXkgPSBvcHRpb25zLm5vU2Nyb2xsRGVsYXksXG4gICAgICBub1Njcm9sbFRpbWVvdXQsXG4gICAgICBib3VuZE1hcmdpbiA9IG9wdGlvbnMuYm91bmRNYXJnaW47XG5cbiAgICB2YXIgb25TdGFydCA9IGZ1bmN0aW9uKGUpe1xuICAgICAgdmFyIHRhcmdldCA9IGNsb3Nlc3QoZ2V0VGFyZ2V0KGUpLCBzZWxlY3Rvcik7XG4gICAgICBpZiAoIXRhcmdldCkgcmV0dXJuO1xuXG4gICAgICBpZiAoYWN0aXZlQ2xhc3NEZWxheSl7XG4gICAgICAgIGNsZWFyVGltZW91dChhY3RpdmVDbGFzc1RpbWVvdXQpO1xuICAgICAgICBhY3RpdmVDbGFzc1RpbWVvdXQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICAgICAgYWRkQ2xhc3ModGFyZ2V0LCBhY3RpdmVDbGFzcyk7XG4gICAgICAgIH0sIGFjdGl2ZUNsYXNzRGVsYXkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYWRkQ2xhc3ModGFyZ2V0LCBhY3RpdmVDbGFzcyk7XG4gICAgICB9XG4gICAgICBpZiAoaW5hY3RpdmVDbGFzc0RlbGF5ICYmIHRhcmdldCA9PSBwcmV2VGFyZ2V0KSBjbGVhclRpbWVvdXQoaW5hY3RpdmVDbGFzc1RpbWVvdXQpO1xuXG4gICAgICBzdGFydFggPSBlLmNsaWVudFg7XG4gICAgICBzdGFydFkgPSBlLmNsaWVudFk7XG4gICAgICBpZiAoIXN0YXJ0WCB8fCAhc3RhcnRZKXtcbiAgICAgICAgdmFyIHRvdWNoID0gZS50YXJnZXRUb3VjaGVzWzBdO1xuICAgICAgICBzdGFydFggPSB0b3VjaC5jbGllbnRYO1xuICAgICAgICBzdGFydFkgPSB0b3VjaC5jbGllbnRZO1xuICAgICAgfVxuICAgICAgc3RhcnRUYXJnZXQgPSB0YXJnZXQ7XG4gICAgICBjYW5jZWwgPSBmYWxzZTtcbiAgICAgIG1vdmVPdXQgPSBmYWxzZTtcbiAgICAgIGVsQm91bmQgPSBub1Njcm9sbCA/IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSA6IG51bGw7XG5cbiAgICAgIGlmIChub1Njcm9sbERlbGF5KXtcbiAgICAgICAgY2xlYXJUaW1lb3V0KG5vU2Nyb2xsVGltZW91dCk7XG4gICAgICAgIG5vU2Nyb2xsID0gZmFsc2U7IC8vIHNldCBmYWxzZSBmaXJzdCwgdGhlbiB0cnVlIGFmdGVyIGEgZGVsYXlcbiAgICAgICAgbm9TY3JvbGxUaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgICAgIG5vU2Nyb2xsID0gdHJ1ZTtcbiAgICAgICAgfSwgbm9TY3JvbGxEZWxheSk7XG4gICAgICB9XG4gICAgICBvcHRpb25zLm9uU3RhcnQuY2FsbChlbCwgZSwgdGFyZ2V0KTtcbiAgICB9O1xuXG4gICAgdmFyIG9uTW92ZSA9IGZ1bmN0aW9uKGUpe1xuICAgICAgaWYgKCFzdGFydFRhcmdldCkgcmV0dXJuO1xuXG4gICAgICBpZiAobm9TY3JvbGwpe1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjbGVhclRpbWVvdXQoYWN0aXZlQ2xhc3NUaW1lb3V0KTtcbiAgICAgIH1cblxuICAgICAgdmFyIHRhcmdldCA9IGUudGFyZ2V0LFxuICAgICAgICB4ID0gZS5jbGllbnRYLFxuICAgICAgICB5ID0gZS5jbGllbnRZO1xuICAgICAgaWYgKCF0YXJnZXQgfHwgIXggfHwgIXkpeyAvLyBUaGUgZXZlbnQgbWlnaHQgaGF2ZSBhIHRhcmdldCBidXQgbm8gY2xpZW50WC9ZXG4gICAgICAgIHZhciB0b3VjaCA9IGUuY2hhbmdlZFRvdWNoZXNbMF07XG4gICAgICAgIGlmICgheCkgeCA9IHRvdWNoLmNsaWVudFg7XG4gICAgICAgIGlmICgheSkgeSA9IHRvdWNoLmNsaWVudFk7XG4gICAgICAgIGlmICghdGFyZ2V0KSB0YXJnZXQgPSBnZXRUYXJnZXRCeUNvb3Jkcyh4LCB5KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG5vU2Nyb2xsKXtcbiAgICAgICAgaWYgKHg+ZWxCb3VuZC5sZWZ0LWJvdW5kTWFyZ2luICYmIHg8ZWxCb3VuZC5yaWdodCtib3VuZE1hcmdpbiAmJiB5PmVsQm91bmQudG9wLWJvdW5kTWFyZ2luICYmIHk8ZWxCb3VuZC5ib3R0b20rYm91bmRNYXJnaW4peyAvLyB3aXRoaW4gZWxlbWVudCdzIGJvdW5kYXJ5XG4gICAgICAgICAgbW92ZU91dCA9IGZhbHNlO1xuICAgICAgICAgIGFkZENsYXNzKHN0YXJ0VGFyZ2V0LCBhY3RpdmVDbGFzcyk7XG4gICAgICAgICAgb3B0aW9ucy5vbk1vdmVJbi5jYWxsKGVsLCBlLCB0YXJnZXQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG1vdmVPdXQgPSB0cnVlO1xuICAgICAgICAgIHJlbW92ZUNsYXNzKHN0YXJ0VGFyZ2V0LCBhY3RpdmVDbGFzcyk7XG4gICAgICAgICAgb3B0aW9ucy5vbk1vdmVPdXQuY2FsbChlbCwgZSwgdGFyZ2V0KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICghY2FuY2VsICYmIGFicyh5IC0gc3RhcnRZKSA+IDEwKXtcbiAgICAgICAgY2FuY2VsID0gdHJ1ZTtcbiAgICAgICAgcmVtb3ZlQ2xhc3Moc3RhcnRUYXJnZXQsIGFjdGl2ZUNsYXNzKTtcbiAgICAgICAgb3B0aW9ucy5vbkNhbmNlbC5jYWxsKHRhcmdldCwgZSk7XG4gICAgICB9XG5cbiAgICAgIG9wdGlvbnMub25Nb3ZlLmNhbGwoZWwsIGUsIHRhcmdldCk7XG4gICAgfTtcblxuICAgIHZhciBvbkVuZCA9IGZ1bmN0aW9uKGUpe1xuICAgICAgaWYgKCFzdGFydFRhcmdldCkgcmV0dXJuO1xuXG4gICAgICBjbGVhclRpbWVvdXQoYWN0aXZlQ2xhc3NUaW1lb3V0KTtcbiAgICAgIGlmIChpbmFjdGl2ZUNsYXNzRGVsYXkpe1xuICAgICAgICBpZiAoYWN0aXZlQ2xhc3NEZWxheSAmJiAhY2FuY2VsKSBhZGRDbGFzcyhzdGFydFRhcmdldCwgYWN0aXZlQ2xhc3MpO1xuICAgICAgICB2YXIgYWN0aXZlVGFyZ2V0ID0gc3RhcnRUYXJnZXQ7XG4gICAgICAgIGluYWN0aXZlQ2xhc3NUaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgICAgIHJlbW92ZUNsYXNzKGFjdGl2ZVRhcmdldCwgYWN0aXZlQ2xhc3MpO1xuICAgICAgICB9LCBpbmFjdGl2ZUNsYXNzRGVsYXkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVtb3ZlQ2xhc3Moc3RhcnRUYXJnZXQsIGFjdGl2ZUNsYXNzKTtcbiAgICAgIH1cblxuICAgICAgb3B0aW9ucy5vbkVuZC5jYWxsKGVsLCBlLCBzdGFydFRhcmdldCk7XG5cbiAgICAgIHZhciByaWdodENsaWNrID0gZS53aGljaCA9PSAzIHx8IGUuYnV0dG9uID09IDI7XG4gICAgICBpZiAoIWNhbmNlbCAmJiAhbW92ZU91dCAmJiAhcmlnaHRDbGljayl7XG4gICAgICAgIG9wdGlvbnMub25UYXAuY2FsbChlbCwgZSwgc3RhcnRUYXJnZXQpO1xuICAgICAgfVxuXG4gICAgICBwcmV2VGFyZ2V0ID0gc3RhcnRUYXJnZXQ7XG4gICAgICBzdGFydFRhcmdldCA9IG51bGw7XG4gICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICAgIHN0YXJ0WCA9IHN0YXJ0WSA9IG51bGw7XG4gICAgICB9LCA0MDApO1xuICAgIH07XG5cbiAgICB2YXIgb25DYW5jZWwgPSBmdW5jdGlvbihlKXtcbiAgICAgIGlmICghc3RhcnRUYXJnZXQpIHJldHVybjtcbiAgICAgIHJlbW92ZUNsYXNzKHN0YXJ0VGFyZ2V0LCBhY3RpdmVDbGFzcyk7XG4gICAgICBzdGFydFRhcmdldCA9IHN0YXJ0WCA9IHN0YXJ0WSA9IG51bGw7XG4gICAgICBvcHRpb25zLm9uQ2FuY2VsLmNhbGwoZWwsIGUpO1xuICAgIH07XG5cbiAgICB2YXIgb25DbGljayA9IGZ1bmN0aW9uKGUpe1xuICAgICAgdmFyIHRhcmdldCA9IGNsb3Nlc3QoZS50YXJnZXQsIHNlbGVjdG9yKTtcbiAgICAgIGlmICh0YXJnZXQpe1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB9IGVsc2UgaWYgKHN0YXJ0WCAmJiBzdGFydFkgJiYgYWJzKGUuY2xpZW50WCAtIHN0YXJ0WCkgPCAyNSAmJiBhYnMoZS5jbGllbnRZIC0gc3RhcnRZKSA8IDI1KXtcbiAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKGV2ZW50cy5zdGFydCwgb25TdGFydCwgZmFsc2UpO1xuXG4gICAgZWwuYWRkRXZlbnRMaXN0ZW5lcihldmVudHMubW92ZSwgb25Nb3ZlLCBmYWxzZSk7XG5cbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKGV2ZW50cy5lbmQsIG9uRW5kLCBmYWxzZSk7XG5cbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKCd0b3VjaGNhbmNlbCcsIG9uQ2FuY2VsLCBmYWxzZSk7XG5cbiAgICBpZiAoIW9wdGlvbnMuYWxsb3dDbGljaykgZWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBvbkNsaWNrLCBmYWxzZSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgZWwgOiBlbCxcbiAgICAgIGRlc3Ryb3kgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnRzLnN0YXJ0LCBvblN0YXJ0LCBmYWxzZSk7XG4gICAgICAgIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnRzLm1vdmUsIG9uTW92ZSwgZmFsc2UpO1xuICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50cy5lbmQsIG9uRW5kLCBmYWxzZSk7XG4gICAgICAgIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RvdWNoY2FuY2VsJywgb25DYW5jZWwsIGZhbHNlKTtcbiAgICAgICAgaWYgKCFvcHRpb25zLmFsbG93Q2xpY2spIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgb25DbGljaywgZmFsc2UpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuICAgIH07XG5cbiAgfTtcblxufSkpO1xufSkoKSIsInZhciByb3V0aWUgPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9yb3V0aWUnKTtcbnZhciBwbGF5ZXIgPSByZXF1aXJlKCcuLi9wbGF5ZXInKTtcbnZhciB2aWV3ID0gcmVxdWlyZSgnLi4vLi4vdmlld3MvcmVnaXN0ZXItYWR2YW5jZWQuaGJzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gIFxuICBpZiAocGxheWVyLmdldCgpLmlkKSB7XG4gICAgcmV0dXJuIHJvdXRpZS5uYXZpZ2F0ZSgnL3dhaXQnKTtcbiAgfVxuICBcbiAgJCgnI3BhZ2UnKS5hdHRyKCdjbGFzcycsICdyZWdpc3RlcicpO1xuICAkKCcjcGFnZScpLmh0bWwodmlldygpKTtcbiAgXG4gICQoJ2J1dHRvbicpLm9uKCdjbGljaycsIHJlZ2lzdGVyKTtcbiAgXG59O1xuXG5mdW5jdGlvbiByZWdpc3RlcihlKSB7XG4gIHZhciBkYXRhID0ge1xuICAgIGZpcnN0TmFtZTogICAgJCgnI2ZpcnN0TmFtZScpLnZhbCgpLFxuICAgIGxhc3ROYW1lOiAgICAgJCgnI2xhc3ROYW1lJykudmFsKCksXG4gICAgY29tcGFueTogICAgICAkKCcjY29tcGFueScpLnZhbCgpLFxuICAgIGNvdW50cnk6ICAgICAgJCgnI2NvdW50cnknKS52YWwoKSxcbiAgICByb2xlOiAgICAgICAgICQoJyNyb2xlJykudmFsKCksXG4gICAgZW1haWw6ICAgICAgICAkKCcjZW1haWwnKS52YWwoKVxuICB9O1xuICBjb25zb2xlLmxvZyhcIkZJRUxEU1wiLCBkYXRhKTtcbiAgJC5hamF4KHtcbiAgICB0eXBlOiAnUE9TVCcsXG4gICAgdXJsOiAnL3BsYXllcicsXG4gICAgZGF0YTogSlNPTi5zdHJpbmdpZnkoZGF0YSksXG4gICAgZGF0YVR5cGU6ICdqc29uJyxcbiAgICBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb247IGNoYXJzZXQ9dXRmLTgnXG4gIH0pLnRoZW4oZ28pLmZhaWwoZXJyb3IpO1xuICBcbiAgLy8gJC5wb3N0KCcvcGxheWVyJywgZGF0YSkudGhlbihnbykuZmFpbChlcnJvcik7XG4gIHJldHVybiBmYWxzZVxufVxuXG5mdW5jdGlvbiBnbyhkYXRhKSB7XG4gIHBsYXllci5zZXQoe1xuICAgIGlkOiBkYXRhLmlkLFxuICAgIG5hbWU6IGRhdGEubmFtZVxuICB9KTtcbiAgcm91dGllLm5hdmlnYXRlKCcvd2FpdCcpO1xufVxuXG5mdW5jdGlvbiBlcnJvcihyZXMpIHtcbiAgYWxlcnQoJ0Vycm9yOiAnICsgcmVzKTtcbn1cbiIsInZhciByb3V0aWUgPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9yb3V0aWUnKTtcbnZhciBwbGF5ZXIgPSByZXF1aXJlKCcuLi9wbGF5ZXInKTtcbnZhciB2aWV3ID0gcmVxdWlyZSgnLi4vLi4vdmlld3Mvam9pbi5oYnMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgXG4gIGlmIChwbGF5ZXIuZ2V0KCkuaWQgPT0gdW5kZWZpbmVkKSB7XG4gICAgcm91dGllLm5hdmlnYXRlKCcvY29ubmVjdCcpO1xuICB9XG4gIFxuICAkKCcjcGFnZScpLmF0dHIoJ2NsYXNzJywgJ2pvaW4nKTtcbiAgJCgnI3BhZ2UnKS5odG1sKHZpZXcoKSk7XG4gICQoJ2J1dHRvbicpLm9uKCdjbGljaycsIGpvaW5Mb2JieSk7XG5cbn07XG5cbmZ1bmN0aW9uIGpvaW5Mb2JieShlKSB7XG4gIGUucHJldmVudERlZmF1bHQoKTtcbiAgdmFyIGRhdGEgPSB7IHBsYXllcklkOiBwbGF5ZXIuZ2V0KCkuaWQgfTtcbiAgJC5wb3N0KCcvZ2FtZS9wbGF5ZXJzJywgZGF0YSkudGhlbihqb2luZWQpLmZhaWwoYmFja1RvV2FpdCk7XG59XG5cbmZ1bmN0aW9uIGpvaW5lZChkYXRhKSB7XG4gIHJvdXRpZS5uYXZpZ2F0ZSgnL2xvYmJ5Jyk7XG59XG5cbmZ1bmN0aW9uIGJhY2tUb1dhaXQoKSB7XG4gIHJvdXRpZS5uYXZpZ2F0ZSgnL3dhaXQnKTtcbn1cbiIsInZhciByb3V0aWUgPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9yb3V0aWUnKTtcbnZhciB2aWV3ID0gcmVxdWlyZSgnLi4vLi4vdmlld3MvdGhhbmtzLmhicycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICBcbiAgJCgnI3BhZ2UnKS5hdHRyKCdjbGFzcycsICd0aGFua3MnKTtcbiAgJCgnI3BhZ2UnKS5odG1sKHZpZXcoKSk7XG4gIFxuICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgIHJvdXRpZS5uYXZpZ2F0ZSgnL2Nvbm5lY3QnKTtcbiAgfSwgNDAwMCk7XG4gIFxufTtcbiIsInZhciBfID0gcmVxdWlyZSgndW5kZXJzY29yZScpO1xudmFyIHBsYXllciA9IG51bGw7XG5cbnZhciBLRVkgPSAncGxheWVyJztcblxuZXhwb3J0cy5nZXQgPSBmdW5jdGlvbigpIHtcbiAgaWYgKCFwbGF5ZXIpIHtcbiAgICBsb2FkKCk7XG4gIH1cbiAgcmV0dXJuIHBsYXllcjtcbn07XG5cbmV4cG9ydHMuc2V0ID0gZnVuY3Rpb24oYXR0cnMpIHtcbiAgcGxheWVyID0gXy5leHRlbmQocGxheWVyIHx8IHt9LCBhdHRycyk7XG4gIHNhdmUoKTtcbn07XG5cbmV4cG9ydHMucmVzZXQgPSBmdW5jdGlvbigpIHtcbiAgcGxheWVyID0gbnVsbDtcbiAgd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKEtFWSk7XG59O1xuXG5mdW5jdGlvbiBsb2FkKCkge1xuICBwbGF5ZXIgPSBKU09OLnBhcnNlKHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShLRVkpIHx8ICd7fScpO1xufVxuXG5mdW5jdGlvbiBzYXZlKCkge1xuICB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oS0VZLCBKU09OLnN0cmluZ2lmeShwbGF5ZXIpKTtcbn1cbiIsIihmdW5jdGlvbigpey8vICAgICBVbmRlcnNjb3JlLmpzIDEuNC40XG4vLyAgICAgaHR0cDovL3VuZGVyc2NvcmVqcy5vcmdcbi8vICAgICAoYykgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBJbmMuXG4vLyAgICAgVW5kZXJzY29yZSBtYXkgYmUgZnJlZWx5IGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBNSVQgbGljZW5zZS5cblxuKGZ1bmN0aW9uKCkge1xuXG4gIC8vIEJhc2VsaW5lIHNldHVwXG4gIC8vIC0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gRXN0YWJsaXNoIHRoZSByb290IG9iamVjdCwgYHdpbmRvd2AgaW4gdGhlIGJyb3dzZXIsIG9yIGBnbG9iYWxgIG9uIHRoZSBzZXJ2ZXIuXG4gIHZhciByb290ID0gdGhpcztcblxuICAvLyBTYXZlIHRoZSBwcmV2aW91cyB2YWx1ZSBvZiB0aGUgYF9gIHZhcmlhYmxlLlxuICB2YXIgcHJldmlvdXNVbmRlcnNjb3JlID0gcm9vdC5fO1xuXG4gIC8vIEVzdGFibGlzaCB0aGUgb2JqZWN0IHRoYXQgZ2V0cyByZXR1cm5lZCB0byBicmVhayBvdXQgb2YgYSBsb29wIGl0ZXJhdGlvbi5cbiAgdmFyIGJyZWFrZXIgPSB7fTtcblxuICAvLyBTYXZlIGJ5dGVzIGluIHRoZSBtaW5pZmllZCAoYnV0IG5vdCBnemlwcGVkKSB2ZXJzaW9uOlxuICB2YXIgQXJyYXlQcm90byA9IEFycmF5LnByb3RvdHlwZSwgT2JqUHJvdG8gPSBPYmplY3QucHJvdG90eXBlLCBGdW5jUHJvdG8gPSBGdW5jdGlvbi5wcm90b3R5cGU7XG5cbiAgLy8gQ3JlYXRlIHF1aWNrIHJlZmVyZW5jZSB2YXJpYWJsZXMgZm9yIHNwZWVkIGFjY2VzcyB0byBjb3JlIHByb3RvdHlwZXMuXG4gIHZhciBwdXNoICAgICAgICAgICAgID0gQXJyYXlQcm90by5wdXNoLFxuICAgICAgc2xpY2UgICAgICAgICAgICA9IEFycmF5UHJvdG8uc2xpY2UsXG4gICAgICBjb25jYXQgICAgICAgICAgID0gQXJyYXlQcm90by5jb25jYXQsXG4gICAgICB0b1N0cmluZyAgICAgICAgID0gT2JqUHJvdG8udG9TdHJpbmcsXG4gICAgICBoYXNPd25Qcm9wZXJ0eSAgID0gT2JqUHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbiAgLy8gQWxsICoqRUNNQVNjcmlwdCA1KiogbmF0aXZlIGZ1bmN0aW9uIGltcGxlbWVudGF0aW9ucyB0aGF0IHdlIGhvcGUgdG8gdXNlXG4gIC8vIGFyZSBkZWNsYXJlZCBoZXJlLlxuICB2YXJcbiAgICBuYXRpdmVGb3JFYWNoICAgICAgPSBBcnJheVByb3RvLmZvckVhY2gsXG4gICAgbmF0aXZlTWFwICAgICAgICAgID0gQXJyYXlQcm90by5tYXAsXG4gICAgbmF0aXZlUmVkdWNlICAgICAgID0gQXJyYXlQcm90by5yZWR1Y2UsXG4gICAgbmF0aXZlUmVkdWNlUmlnaHQgID0gQXJyYXlQcm90by5yZWR1Y2VSaWdodCxcbiAgICBuYXRpdmVGaWx0ZXIgICAgICAgPSBBcnJheVByb3RvLmZpbHRlcixcbiAgICBuYXRpdmVFdmVyeSAgICAgICAgPSBBcnJheVByb3RvLmV2ZXJ5LFxuICAgIG5hdGl2ZVNvbWUgICAgICAgICA9IEFycmF5UHJvdG8uc29tZSxcbiAgICBuYXRpdmVJbmRleE9mICAgICAgPSBBcnJheVByb3RvLmluZGV4T2YsXG4gICAgbmF0aXZlTGFzdEluZGV4T2YgID0gQXJyYXlQcm90by5sYXN0SW5kZXhPZixcbiAgICBuYXRpdmVJc0FycmF5ICAgICAgPSBBcnJheS5pc0FycmF5LFxuICAgIG5hdGl2ZUtleXMgICAgICAgICA9IE9iamVjdC5rZXlzLFxuICAgIG5hdGl2ZUJpbmQgICAgICAgICA9IEZ1bmNQcm90by5iaW5kO1xuXG4gIC8vIENyZWF0ZSBhIHNhZmUgcmVmZXJlbmNlIHRvIHRoZSBVbmRlcnNjb3JlIG9iamVjdCBmb3IgdXNlIGJlbG93LlxuICB2YXIgXyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmIChvYmogaW5zdGFuY2VvZiBfKSByZXR1cm4gb2JqO1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBfKSkgcmV0dXJuIG5ldyBfKG9iaik7XG4gICAgdGhpcy5fd3JhcHBlZCA9IG9iajtcbiAgfTtcblxuICAvLyBFeHBvcnQgdGhlIFVuZGVyc2NvcmUgb2JqZWN0IGZvciAqKk5vZGUuanMqKiwgd2l0aFxuICAvLyBiYWNrd2FyZHMtY29tcGF0aWJpbGl0eSBmb3IgdGhlIG9sZCBgcmVxdWlyZSgpYCBBUEkuIElmIHdlJ3JlIGluXG4gIC8vIHRoZSBicm93c2VyLCBhZGQgYF9gIGFzIGEgZ2xvYmFsIG9iamVjdCB2aWEgYSBzdHJpbmcgaWRlbnRpZmllcixcbiAgLy8gZm9yIENsb3N1cmUgQ29tcGlsZXIgXCJhZHZhbmNlZFwiIG1vZGUuXG4gIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgIGV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IF87XG4gICAgfVxuICAgIGV4cG9ydHMuXyA9IF87XG4gIH0gZWxzZSB7XG4gICAgcm9vdC5fID0gXztcbiAgfVxuXG4gIC8vIEN1cnJlbnQgdmVyc2lvbi5cbiAgXy5WRVJTSU9OID0gJzEuNC40JztcblxuICAvLyBDb2xsZWN0aW9uIEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIFRoZSBjb3JuZXJzdG9uZSwgYW4gYGVhY2hgIGltcGxlbWVudGF0aW9uLCBha2EgYGZvckVhY2hgLlxuICAvLyBIYW5kbGVzIG9iamVjdHMgd2l0aCB0aGUgYnVpbHQtaW4gYGZvckVhY2hgLCBhcnJheXMsIGFuZCByYXcgb2JqZWN0cy5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYGZvckVhY2hgIGlmIGF2YWlsYWJsZS5cbiAgdmFyIGVhY2ggPSBfLmVhY2ggPSBfLmZvckVhY2ggPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm47XG4gICAgaWYgKG5hdGl2ZUZvckVhY2ggJiYgb2JqLmZvckVhY2ggPT09IG5hdGl2ZUZvckVhY2gpIHtcbiAgICAgIG9iai5mb3JFYWNoKGl0ZXJhdG9yLCBjb250ZXh0KTtcbiAgICB9IGVsc2UgaWYgKG9iai5sZW5ndGggPT09ICtvYmoubGVuZ3RoKSB7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbCA9IG9iai5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgaWYgKGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgb2JqW2ldLCBpLCBvYmopID09PSBicmVha2VyKSByZXR1cm47XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgICAgaWYgKF8uaGFzKG9iaiwga2V5KSkge1xuICAgICAgICAgIGlmIChpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtrZXldLCBrZXksIG9iaikgPT09IGJyZWFrZXIpIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIHJlc3VsdHMgb2YgYXBwbHlpbmcgdGhlIGl0ZXJhdG9yIHRvIGVhY2ggZWxlbWVudC5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYG1hcGAgaWYgYXZhaWxhYmxlLlxuICBfLm1hcCA9IF8uY29sbGVjdCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHJlc3VsdHM7XG4gICAgaWYgKG5hdGl2ZU1hcCAmJiBvYmoubWFwID09PSBuYXRpdmVNYXApIHJldHVybiBvYmoubWFwKGl0ZXJhdG9yLCBjb250ZXh0KTtcbiAgICBlYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoXSA9IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfTtcblxuICB2YXIgcmVkdWNlRXJyb3IgPSAnUmVkdWNlIG9mIGVtcHR5IGFycmF5IHdpdGggbm8gaW5pdGlhbCB2YWx1ZSc7XG5cbiAgLy8gKipSZWR1Y2UqKiBidWlsZHMgdXAgYSBzaW5nbGUgcmVzdWx0IGZyb20gYSBsaXN0IG9mIHZhbHVlcywgYWthIGBpbmplY3RgLFxuICAvLyBvciBgZm9sZGxgLiBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgcmVkdWNlYCBpZiBhdmFpbGFibGUuXG4gIF8ucmVkdWNlID0gXy5mb2xkbCA9IF8uaW5qZWN0ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgbWVtbywgY29udGV4dCkge1xuICAgIHZhciBpbml0aWFsID0gYXJndW1lbnRzLmxlbmd0aCA+IDI7XG4gICAgaWYgKG9iaiA9PSBudWxsKSBvYmogPSBbXTtcbiAgICBpZiAobmF0aXZlUmVkdWNlICYmIG9iai5yZWR1Y2UgPT09IG5hdGl2ZVJlZHVjZSkge1xuICAgICAgaWYgKGNvbnRleHQpIGl0ZXJhdG9yID0gXy5iaW5kKGl0ZXJhdG9yLCBjb250ZXh0KTtcbiAgICAgIHJldHVybiBpbml0aWFsID8gb2JqLnJlZHVjZShpdGVyYXRvciwgbWVtbykgOiBvYmoucmVkdWNlKGl0ZXJhdG9yKTtcbiAgICB9XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgaWYgKCFpbml0aWFsKSB7XG4gICAgICAgIG1lbW8gPSB2YWx1ZTtcbiAgICAgICAgaW5pdGlhbCA9IHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtZW1vID0gaXRlcmF0b3IuY2FsbChjb250ZXh0LCBtZW1vLCB2YWx1ZSwgaW5kZXgsIGxpc3QpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGlmICghaW5pdGlhbCkgdGhyb3cgbmV3IFR5cGVFcnJvcihyZWR1Y2VFcnJvcik7XG4gICAgcmV0dXJuIG1lbW87XG4gIH07XG5cbiAgLy8gVGhlIHJpZ2h0LWFzc29jaWF0aXZlIHZlcnNpb24gb2YgcmVkdWNlLCBhbHNvIGtub3duIGFzIGBmb2xkcmAuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGByZWR1Y2VSaWdodGAgaWYgYXZhaWxhYmxlLlxuICBfLnJlZHVjZVJpZ2h0ID0gXy5mb2xkciA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIG1lbW8sIGNvbnRleHQpIHtcbiAgICB2YXIgaW5pdGlhbCA9IGFyZ3VtZW50cy5sZW5ndGggPiAyO1xuICAgIGlmIChvYmogPT0gbnVsbCkgb2JqID0gW107XG4gICAgaWYgKG5hdGl2ZVJlZHVjZVJpZ2h0ICYmIG9iai5yZWR1Y2VSaWdodCA9PT0gbmF0aXZlUmVkdWNlUmlnaHQpIHtcbiAgICAgIGlmIChjb250ZXh0KSBpdGVyYXRvciA9IF8uYmluZChpdGVyYXRvciwgY29udGV4dCk7XG4gICAgICByZXR1cm4gaW5pdGlhbCA/IG9iai5yZWR1Y2VSaWdodChpdGVyYXRvciwgbWVtbykgOiBvYmoucmVkdWNlUmlnaHQoaXRlcmF0b3IpO1xuICAgIH1cbiAgICB2YXIgbGVuZ3RoID0gb2JqLmxlbmd0aDtcbiAgICBpZiAobGVuZ3RoICE9PSArbGVuZ3RoKSB7XG4gICAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopO1xuICAgICAgbGVuZ3RoID0ga2V5cy5sZW5ndGg7XG4gICAgfVxuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIGluZGV4ID0ga2V5cyA/IGtleXNbLS1sZW5ndGhdIDogLS1sZW5ndGg7XG4gICAgICBpZiAoIWluaXRpYWwpIHtcbiAgICAgICAgbWVtbyA9IG9ialtpbmRleF07XG4gICAgICAgIGluaXRpYWwgPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWVtbyA9IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgbWVtbywgb2JqW2luZGV4XSwgaW5kZXgsIGxpc3QpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGlmICghaW5pdGlhbCkgdGhyb3cgbmV3IFR5cGVFcnJvcihyZWR1Y2VFcnJvcik7XG4gICAgcmV0dXJuIG1lbW87XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBmaXJzdCB2YWx1ZSB3aGljaCBwYXNzZXMgYSB0cnV0aCB0ZXN0LiBBbGlhc2VkIGFzIGBkZXRlY3RgLlxuICBfLmZpbmQgPSBfLmRldGVjdCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0O1xuICAgIGFueShvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgaWYgKGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KSkge1xuICAgICAgICByZXN1bHQgPSB2YWx1ZTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBSZXR1cm4gYWxsIHRoZSBlbGVtZW50cyB0aGF0IHBhc3MgYSB0cnV0aCB0ZXN0LlxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgZmlsdGVyYCBpZiBhdmFpbGFibGUuXG4gIC8vIEFsaWFzZWQgYXMgYHNlbGVjdGAuXG4gIF8uZmlsdGVyID0gXy5zZWxlY3QgPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiByZXN1bHRzO1xuICAgIGlmIChuYXRpdmVGaWx0ZXIgJiYgb2JqLmZpbHRlciA9PT0gbmF0aXZlRmlsdGVyKSByZXR1cm4gb2JqLmZpbHRlcihpdGVyYXRvciwgY29udGV4dCk7XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgaWYgKGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KSkgcmVzdWx0c1tyZXN1bHRzLmxlbmd0aF0gPSB2YWx1ZTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfTtcblxuICAvLyBSZXR1cm4gYWxsIHRoZSBlbGVtZW50cyBmb3Igd2hpY2ggYSB0cnV0aCB0ZXN0IGZhaWxzLlxuICBfLnJlamVjdCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICByZXR1cm4gXy5maWx0ZXIob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIHJldHVybiAhaXRlcmF0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpO1xuICAgIH0sIGNvbnRleHQpO1xuICB9O1xuXG4gIC8vIERldGVybWluZSB3aGV0aGVyIGFsbCBvZiB0aGUgZWxlbWVudHMgbWF0Y2ggYSB0cnV0aCB0ZXN0LlxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgZXZlcnlgIGlmIGF2YWlsYWJsZS5cbiAgLy8gQWxpYXNlZCBhcyBgYWxsYC5cbiAgXy5ldmVyeSA9IF8uYWxsID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGl0ZXJhdG9yIHx8IChpdGVyYXRvciA9IF8uaWRlbnRpdHkpO1xuICAgIHZhciByZXN1bHQgPSB0cnVlO1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAobmF0aXZlRXZlcnkgJiYgb2JqLmV2ZXJ5ID09PSBuYXRpdmVFdmVyeSkgcmV0dXJuIG9iai5ldmVyeShpdGVyYXRvciwgY29udGV4dCk7XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgaWYgKCEocmVzdWx0ID0gcmVzdWx0ICYmIGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KSkpIHJldHVybiBicmVha2VyO1xuICAgIH0pO1xuICAgIHJldHVybiAhIXJlc3VsdDtcbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgaWYgYXQgbGVhc3Qgb25lIGVsZW1lbnQgaW4gdGhlIG9iamVjdCBtYXRjaGVzIGEgdHJ1dGggdGVzdC5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYHNvbWVgIGlmIGF2YWlsYWJsZS5cbiAgLy8gQWxpYXNlZCBhcyBgYW55YC5cbiAgdmFyIGFueSA9IF8uc29tZSA9IF8uYW55ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGl0ZXJhdG9yIHx8IChpdGVyYXRvciA9IF8uaWRlbnRpdHkpO1xuICAgIHZhciByZXN1bHQgPSBmYWxzZTtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKG5hdGl2ZVNvbWUgJiYgb2JqLnNvbWUgPT09IG5hdGl2ZVNvbWUpIHJldHVybiBvYmouc29tZShpdGVyYXRvciwgY29udGV4dCk7XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgaWYgKHJlc3VsdCB8fCAocmVzdWx0ID0gaXRlcmF0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpKSkgcmV0dXJuIGJyZWFrZXI7XG4gICAgfSk7XG4gICAgcmV0dXJuICEhcmVzdWx0O1xuICB9O1xuXG4gIC8vIERldGVybWluZSBpZiB0aGUgYXJyYXkgb3Igb2JqZWN0IGNvbnRhaW5zIGEgZ2l2ZW4gdmFsdWUgKHVzaW5nIGA9PT1gKS5cbiAgLy8gQWxpYXNlZCBhcyBgaW5jbHVkZWAuXG4gIF8uY29udGFpbnMgPSBfLmluY2x1ZGUgPSBmdW5jdGlvbihvYmosIHRhcmdldCkge1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuICAgIGlmIChuYXRpdmVJbmRleE9mICYmIG9iai5pbmRleE9mID09PSBuYXRpdmVJbmRleE9mKSByZXR1cm4gb2JqLmluZGV4T2YodGFyZ2V0KSAhPSAtMTtcbiAgICByZXR1cm4gYW55KG9iaiwgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIHJldHVybiB2YWx1ZSA9PT0gdGFyZ2V0O1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIEludm9rZSBhIG1ldGhvZCAod2l0aCBhcmd1bWVudHMpIG9uIGV2ZXJ5IGl0ZW0gaW4gYSBjb2xsZWN0aW9uLlxuICBfLmludm9rZSA9IGZ1bmN0aW9uKG9iaiwgbWV0aG9kKSB7XG4gICAgdmFyIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG4gICAgdmFyIGlzRnVuYyA9IF8uaXNGdW5jdGlvbihtZXRob2QpO1xuICAgIHJldHVybiBfLm1hcChvYmosIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICByZXR1cm4gKGlzRnVuYyA/IG1ldGhvZCA6IHZhbHVlW21ldGhvZF0pLmFwcGx5KHZhbHVlLCBhcmdzKTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBDb252ZW5pZW5jZSB2ZXJzaW9uIG9mIGEgY29tbW9uIHVzZSBjYXNlIG9mIGBtYXBgOiBmZXRjaGluZyBhIHByb3BlcnR5LlxuICBfLnBsdWNrID0gZnVuY3Rpb24ob2JqLCBrZXkpIHtcbiAgICByZXR1cm4gXy5tYXAob2JqLCBmdW5jdGlvbih2YWx1ZSl7IHJldHVybiB2YWx1ZVtrZXldOyB9KTtcbiAgfTtcblxuICAvLyBDb252ZW5pZW5jZSB2ZXJzaW9uIG9mIGEgY29tbW9uIHVzZSBjYXNlIG9mIGBmaWx0ZXJgOiBzZWxlY3Rpbmcgb25seSBvYmplY3RzXG4gIC8vIGNvbnRhaW5pbmcgc3BlY2lmaWMgYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8ud2hlcmUgPSBmdW5jdGlvbihvYmosIGF0dHJzLCBmaXJzdCkge1xuICAgIGlmIChfLmlzRW1wdHkoYXR0cnMpKSByZXR1cm4gZmlyc3QgPyBudWxsIDogW107XG4gICAgcmV0dXJuIF9bZmlyc3QgPyAnZmluZCcgOiAnZmlsdGVyJ10ob2JqLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgZm9yICh2YXIga2V5IGluIGF0dHJzKSB7XG4gICAgICAgIGlmIChhdHRyc1trZXldICE9PSB2YWx1ZVtrZXldKSByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBDb252ZW5pZW5jZSB2ZXJzaW9uIG9mIGEgY29tbW9uIHVzZSBjYXNlIG9mIGBmaW5kYDogZ2V0dGluZyB0aGUgZmlyc3Qgb2JqZWN0XG4gIC8vIGNvbnRhaW5pbmcgc3BlY2lmaWMgYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8uZmluZFdoZXJlID0gZnVuY3Rpb24ob2JqLCBhdHRycykge1xuICAgIHJldHVybiBfLndoZXJlKG9iaiwgYXR0cnMsIHRydWUpO1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgbWF4aW11bSBlbGVtZW50IG9yIChlbGVtZW50LWJhc2VkIGNvbXB1dGF0aW9uKS5cbiAgLy8gQ2FuJ3Qgb3B0aW1pemUgYXJyYXlzIG9mIGludGVnZXJzIGxvbmdlciB0aGFuIDY1LDUzNSBlbGVtZW50cy5cbiAgLy8gU2VlOiBodHRwczovL2J1Z3Mud2Via2l0Lm9yZy9zaG93X2J1Zy5jZ2k/aWQ9ODA3OTdcbiAgXy5tYXggPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaWYgKCFpdGVyYXRvciAmJiBfLmlzQXJyYXkob2JqKSAmJiBvYmpbMF0gPT09ICtvYmpbMF0gJiYgb2JqLmxlbmd0aCA8IDY1NTM1KSB7XG4gICAgICByZXR1cm4gTWF0aC5tYXguYXBwbHkoTWF0aCwgb2JqKTtcbiAgICB9XG4gICAgaWYgKCFpdGVyYXRvciAmJiBfLmlzRW1wdHkob2JqKSkgcmV0dXJuIC1JbmZpbml0eTtcbiAgICB2YXIgcmVzdWx0ID0ge2NvbXB1dGVkIDogLUluZmluaXR5LCB2YWx1ZTogLUluZmluaXR5fTtcbiAgICBlYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICB2YXIgY29tcHV0ZWQgPSBpdGVyYXRvciA/IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KSA6IHZhbHVlO1xuICAgICAgY29tcHV0ZWQgPj0gcmVzdWx0LmNvbXB1dGVkICYmIChyZXN1bHQgPSB7dmFsdWUgOiB2YWx1ZSwgY29tcHV0ZWQgOiBjb21wdXRlZH0pO1xuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHQudmFsdWU7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBtaW5pbXVtIGVsZW1lbnQgKG9yIGVsZW1lbnQtYmFzZWQgY29tcHV0YXRpb24pLlxuICBfLm1pbiA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBpZiAoIWl0ZXJhdG9yICYmIF8uaXNBcnJheShvYmopICYmIG9ialswXSA9PT0gK29ialswXSAmJiBvYmoubGVuZ3RoIDwgNjU1MzUpIHtcbiAgICAgIHJldHVybiBNYXRoLm1pbi5hcHBseShNYXRoLCBvYmopO1xuICAgIH1cbiAgICBpZiAoIWl0ZXJhdG9yICYmIF8uaXNFbXB0eShvYmopKSByZXR1cm4gSW5maW5pdHk7XG4gICAgdmFyIHJlc3VsdCA9IHtjb21wdXRlZCA6IEluZmluaXR5LCB2YWx1ZTogSW5maW5pdHl9O1xuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIHZhciBjb21wdXRlZCA9IGl0ZXJhdG9yID8gaXRlcmF0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpIDogdmFsdWU7XG4gICAgICBjb21wdXRlZCA8IHJlc3VsdC5jb21wdXRlZCAmJiAocmVzdWx0ID0ge3ZhbHVlIDogdmFsdWUsIGNvbXB1dGVkIDogY29tcHV0ZWR9KTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0LnZhbHVlO1xuICB9O1xuXG4gIC8vIFNodWZmbGUgYW4gYXJyYXkuXG4gIF8uc2h1ZmZsZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciByYW5kO1xuICAgIHZhciBpbmRleCA9IDA7XG4gICAgdmFyIHNodWZmbGVkID0gW107XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICByYW5kID0gXy5yYW5kb20oaW5kZXgrKyk7XG4gICAgICBzaHVmZmxlZFtpbmRleCAtIDFdID0gc2h1ZmZsZWRbcmFuZF07XG4gICAgICBzaHVmZmxlZFtyYW5kXSA9IHZhbHVlO1xuICAgIH0pO1xuICAgIHJldHVybiBzaHVmZmxlZDtcbiAgfTtcblxuICAvLyBBbiBpbnRlcm5hbCBmdW5jdGlvbiB0byBnZW5lcmF0ZSBsb29rdXAgaXRlcmF0b3JzLlxuICB2YXIgbG9va3VwSXRlcmF0b3IgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHJldHVybiBfLmlzRnVuY3Rpb24odmFsdWUpID8gdmFsdWUgOiBmdW5jdGlvbihvYmopeyByZXR1cm4gb2JqW3ZhbHVlXTsgfTtcbiAgfTtcblxuICAvLyBTb3J0IHRoZSBvYmplY3QncyB2YWx1ZXMgYnkgYSBjcml0ZXJpb24gcHJvZHVjZWQgYnkgYW4gaXRlcmF0b3IuXG4gIF8uc29ydEJ5ID0gZnVuY3Rpb24ob2JqLCB2YWx1ZSwgY29udGV4dCkge1xuICAgIHZhciBpdGVyYXRvciA9IGxvb2t1cEl0ZXJhdG9yKHZhbHVlKTtcbiAgICByZXR1cm4gXy5wbHVjayhfLm1hcChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdmFsdWUgOiB2YWx1ZSxcbiAgICAgICAgaW5kZXggOiBpbmRleCxcbiAgICAgICAgY3JpdGVyaWEgOiBpdGVyYXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgbGlzdClcbiAgICAgIH07XG4gICAgfSkuc29ydChmdW5jdGlvbihsZWZ0LCByaWdodCkge1xuICAgICAgdmFyIGEgPSBsZWZ0LmNyaXRlcmlhO1xuICAgICAgdmFyIGIgPSByaWdodC5jcml0ZXJpYTtcbiAgICAgIGlmIChhICE9PSBiKSB7XG4gICAgICAgIGlmIChhID4gYiB8fCBhID09PSB2b2lkIDApIHJldHVybiAxO1xuICAgICAgICBpZiAoYSA8IGIgfHwgYiA9PT0gdm9pZCAwKSByZXR1cm4gLTE7XG4gICAgICB9XG4gICAgICByZXR1cm4gbGVmdC5pbmRleCA8IHJpZ2h0LmluZGV4ID8gLTEgOiAxO1xuICAgIH0pLCAndmFsdWUnKTtcbiAgfTtcblxuICAvLyBBbiBpbnRlcm5hbCBmdW5jdGlvbiB1c2VkIGZvciBhZ2dyZWdhdGUgXCJncm91cCBieVwiIG9wZXJhdGlvbnMuXG4gIHZhciBncm91cCA9IGZ1bmN0aW9uKG9iaiwgdmFsdWUsIGNvbnRleHQsIGJlaGF2aW9yKSB7XG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIHZhciBpdGVyYXRvciA9IGxvb2t1cEl0ZXJhdG9yKHZhbHVlIHx8IF8uaWRlbnRpdHkpO1xuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgpIHtcbiAgICAgIHZhciBrZXkgPSBpdGVyYXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgb2JqKTtcbiAgICAgIGJlaGF2aW9yKHJlc3VsdCwga2V5LCB2YWx1ZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBHcm91cHMgdGhlIG9iamVjdCdzIHZhbHVlcyBieSBhIGNyaXRlcmlvbi4gUGFzcyBlaXRoZXIgYSBzdHJpbmcgYXR0cmlidXRlXG4gIC8vIHRvIGdyb3VwIGJ5LCBvciBhIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGUgY3JpdGVyaW9uLlxuICBfLmdyb3VwQnkgPSBmdW5jdGlvbihvYmosIHZhbHVlLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuIGdyb3VwKG9iaiwgdmFsdWUsIGNvbnRleHQsIGZ1bmN0aW9uKHJlc3VsdCwga2V5LCB2YWx1ZSkge1xuICAgICAgKF8uaGFzKHJlc3VsdCwga2V5KSA/IHJlc3VsdFtrZXldIDogKHJlc3VsdFtrZXldID0gW10pKS5wdXNoKHZhbHVlKTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBDb3VudHMgaW5zdGFuY2VzIG9mIGFuIG9iamVjdCB0aGF0IGdyb3VwIGJ5IGEgY2VydGFpbiBjcml0ZXJpb24uIFBhc3NcbiAgLy8gZWl0aGVyIGEgc3RyaW5nIGF0dHJpYnV0ZSB0byBjb3VudCBieSwgb3IgYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlXG4gIC8vIGNyaXRlcmlvbi5cbiAgXy5jb3VudEJ5ID0gZnVuY3Rpb24ob2JqLCB2YWx1ZSwgY29udGV4dCkge1xuICAgIHJldHVybiBncm91cChvYmosIHZhbHVlLCBjb250ZXh0LCBmdW5jdGlvbihyZXN1bHQsIGtleSkge1xuICAgICAgaWYgKCFfLmhhcyhyZXN1bHQsIGtleSkpIHJlc3VsdFtrZXldID0gMDtcbiAgICAgIHJlc3VsdFtrZXldKys7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gVXNlIGEgY29tcGFyYXRvciBmdW5jdGlvbiB0byBmaWd1cmUgb3V0IHRoZSBzbWFsbGVzdCBpbmRleCBhdCB3aGljaFxuICAvLyBhbiBvYmplY3Qgc2hvdWxkIGJlIGluc2VydGVkIHNvIGFzIHRvIG1haW50YWluIG9yZGVyLiBVc2VzIGJpbmFyeSBzZWFyY2guXG4gIF8uc29ydGVkSW5kZXggPSBmdW5jdGlvbihhcnJheSwgb2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGl0ZXJhdG9yID0gaXRlcmF0b3IgPT0gbnVsbCA/IF8uaWRlbnRpdHkgOiBsb29rdXBJdGVyYXRvcihpdGVyYXRvcik7XG4gICAgdmFyIHZhbHVlID0gaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmopO1xuICAgIHZhciBsb3cgPSAwLCBoaWdoID0gYXJyYXkubGVuZ3RoO1xuICAgIHdoaWxlIChsb3cgPCBoaWdoKSB7XG4gICAgICB2YXIgbWlkID0gKGxvdyArIGhpZ2gpID4+PiAxO1xuICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBhcnJheVttaWRdKSA8IHZhbHVlID8gbG93ID0gbWlkICsgMSA6IGhpZ2ggPSBtaWQ7XG4gICAgfVxuICAgIHJldHVybiBsb3c7XG4gIH07XG5cbiAgLy8gU2FmZWx5IGNvbnZlcnQgYW55dGhpbmcgaXRlcmFibGUgaW50byBhIHJlYWwsIGxpdmUgYXJyYXkuXG4gIF8udG9BcnJheSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmICghb2JqKSByZXR1cm4gW107XG4gICAgaWYgKF8uaXNBcnJheShvYmopKSByZXR1cm4gc2xpY2UuY2FsbChvYmopO1xuICAgIGlmIChvYmoubGVuZ3RoID09PSArb2JqLmxlbmd0aCkgcmV0dXJuIF8ubWFwKG9iaiwgXy5pZGVudGl0eSk7XG4gICAgcmV0dXJuIF8udmFsdWVzKG9iaik7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBudW1iZXIgb2YgZWxlbWVudHMgaW4gYW4gb2JqZWN0LlxuICBfLnNpemUgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiAwO1xuICAgIHJldHVybiAob2JqLmxlbmd0aCA9PT0gK29iai5sZW5ndGgpID8gb2JqLmxlbmd0aCA6IF8ua2V5cyhvYmopLmxlbmd0aDtcbiAgfTtcblxuICAvLyBBcnJheSBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gR2V0IHRoZSBmaXJzdCBlbGVtZW50IG9mIGFuIGFycmF5LiBQYXNzaW5nICoqbioqIHdpbGwgcmV0dXJuIHRoZSBmaXJzdCBOXG4gIC8vIHZhbHVlcyBpbiB0aGUgYXJyYXkuIEFsaWFzZWQgYXMgYGhlYWRgIGFuZCBgdGFrZWAuIFRoZSAqKmd1YXJkKiogY2hlY2tcbiAgLy8gYWxsb3dzIGl0IHRvIHdvcmsgd2l0aCBgXy5tYXBgLlxuICBfLmZpcnN0ID0gXy5oZWFkID0gXy50YWtlID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgaWYgKGFycmF5ID09IG51bGwpIHJldHVybiB2b2lkIDA7XG4gICAgcmV0dXJuIChuICE9IG51bGwpICYmICFndWFyZCA/IHNsaWNlLmNhbGwoYXJyYXksIDAsIG4pIDogYXJyYXlbMF07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBldmVyeXRoaW5nIGJ1dCB0aGUgbGFzdCBlbnRyeSBvZiB0aGUgYXJyYXkuIEVzcGVjaWFsbHkgdXNlZnVsIG9uXG4gIC8vIHRoZSBhcmd1bWVudHMgb2JqZWN0LiBQYXNzaW5nICoqbioqIHdpbGwgcmV0dXJuIGFsbCB0aGUgdmFsdWVzIGluXG4gIC8vIHRoZSBhcnJheSwgZXhjbHVkaW5nIHRoZSBsYXN0IE4uIFRoZSAqKmd1YXJkKiogY2hlY2sgYWxsb3dzIGl0IHRvIHdvcmsgd2l0aFxuICAvLyBgXy5tYXBgLlxuICBfLmluaXRpYWwgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICByZXR1cm4gc2xpY2UuY2FsbChhcnJheSwgMCwgYXJyYXkubGVuZ3RoIC0gKChuID09IG51bGwpIHx8IGd1YXJkID8gMSA6IG4pKTtcbiAgfTtcblxuICAvLyBHZXQgdGhlIGxhc3QgZWxlbWVudCBvZiBhbiBhcnJheS4gUGFzc2luZyAqKm4qKiB3aWxsIHJldHVybiB0aGUgbGFzdCBOXG4gIC8vIHZhbHVlcyBpbiB0aGUgYXJyYXkuIFRoZSAqKmd1YXJkKiogY2hlY2sgYWxsb3dzIGl0IHRvIHdvcmsgd2l0aCBgXy5tYXBgLlxuICBfLmxhc3QgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICBpZiAoYXJyYXkgPT0gbnVsbCkgcmV0dXJuIHZvaWQgMDtcbiAgICBpZiAoKG4gIT0gbnVsbCkgJiYgIWd1YXJkKSB7XG4gICAgICByZXR1cm4gc2xpY2UuY2FsbChhcnJheSwgTWF0aC5tYXgoYXJyYXkubGVuZ3RoIC0gbiwgMCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gYXJyYXlbYXJyYXkubGVuZ3RoIC0gMV07XG4gICAgfVxuICB9O1xuXG4gIC8vIFJldHVybnMgZXZlcnl0aGluZyBidXQgdGhlIGZpcnN0IGVudHJ5IG9mIHRoZSBhcnJheS4gQWxpYXNlZCBhcyBgdGFpbGAgYW5kIGBkcm9wYC5cbiAgLy8gRXNwZWNpYWxseSB1c2VmdWwgb24gdGhlIGFyZ3VtZW50cyBvYmplY3QuIFBhc3NpbmcgYW4gKipuKiogd2lsbCByZXR1cm5cbiAgLy8gdGhlIHJlc3QgTiB2YWx1ZXMgaW4gdGhlIGFycmF5LiBUaGUgKipndWFyZCoqXG4gIC8vIGNoZWNrIGFsbG93cyBpdCB0byB3b3JrIHdpdGggYF8ubWFwYC5cbiAgXy5yZXN0ID0gXy50YWlsID0gXy5kcm9wID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgcmV0dXJuIHNsaWNlLmNhbGwoYXJyYXksIChuID09IG51bGwpIHx8IGd1YXJkID8gMSA6IG4pO1xuICB9O1xuXG4gIC8vIFRyaW0gb3V0IGFsbCBmYWxzeSB2YWx1ZXMgZnJvbSBhbiBhcnJheS5cbiAgXy5jb21wYWN0ID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICByZXR1cm4gXy5maWx0ZXIoYXJyYXksIF8uaWRlbnRpdHkpO1xuICB9O1xuXG4gIC8vIEludGVybmFsIGltcGxlbWVudGF0aW9uIG9mIGEgcmVjdXJzaXZlIGBmbGF0dGVuYCBmdW5jdGlvbi5cbiAgdmFyIGZsYXR0ZW4gPSBmdW5jdGlvbihpbnB1dCwgc2hhbGxvdywgb3V0cHV0KSB7XG4gICAgZWFjaChpbnB1dCwgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIGlmIChfLmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgIHNoYWxsb3cgPyBwdXNoLmFwcGx5KG91dHB1dCwgdmFsdWUpIDogZmxhdHRlbih2YWx1ZSwgc2hhbGxvdywgb3V0cHV0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5wdXNoKHZhbHVlKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gb3V0cHV0O1xuICB9O1xuXG4gIC8vIFJldHVybiBhIGNvbXBsZXRlbHkgZmxhdHRlbmVkIHZlcnNpb24gb2YgYW4gYXJyYXkuXG4gIF8uZmxhdHRlbiA9IGZ1bmN0aW9uKGFycmF5LCBzaGFsbG93KSB7XG4gICAgcmV0dXJuIGZsYXR0ZW4oYXJyYXksIHNoYWxsb3csIFtdKTtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSB2ZXJzaW9uIG9mIHRoZSBhcnJheSB0aGF0IGRvZXMgbm90IGNvbnRhaW4gdGhlIHNwZWNpZmllZCB2YWx1ZShzKS5cbiAgXy53aXRob3V0ID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICByZXR1cm4gXy5kaWZmZXJlbmNlKGFycmF5LCBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICB9O1xuXG4gIC8vIFByb2R1Y2UgYSBkdXBsaWNhdGUtZnJlZSB2ZXJzaW9uIG9mIHRoZSBhcnJheS4gSWYgdGhlIGFycmF5IGhhcyBhbHJlYWR5XG4gIC8vIGJlZW4gc29ydGVkLCB5b3UgaGF2ZSB0aGUgb3B0aW9uIG9mIHVzaW5nIGEgZmFzdGVyIGFsZ29yaXRobS5cbiAgLy8gQWxpYXNlZCBhcyBgdW5pcXVlYC5cbiAgXy51bmlxID0gXy51bmlxdWUgPSBmdW5jdGlvbihhcnJheSwgaXNTb3J0ZWQsIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaWYgKF8uaXNGdW5jdGlvbihpc1NvcnRlZCkpIHtcbiAgICAgIGNvbnRleHQgPSBpdGVyYXRvcjtcbiAgICAgIGl0ZXJhdG9yID0gaXNTb3J0ZWQ7XG4gICAgICBpc1NvcnRlZCA9IGZhbHNlO1xuICAgIH1cbiAgICB2YXIgaW5pdGlhbCA9IGl0ZXJhdG9yID8gXy5tYXAoYXJyYXksIGl0ZXJhdG9yLCBjb250ZXh0KSA6IGFycmF5O1xuICAgIHZhciByZXN1bHRzID0gW107XG4gICAgdmFyIHNlZW4gPSBbXTtcbiAgICBlYWNoKGluaXRpYWwsIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCkge1xuICAgICAgaWYgKGlzU29ydGVkID8gKCFpbmRleCB8fCBzZWVuW3NlZW4ubGVuZ3RoIC0gMV0gIT09IHZhbHVlKSA6ICFfLmNvbnRhaW5zKHNlZW4sIHZhbHVlKSkge1xuICAgICAgICBzZWVuLnB1c2godmFsdWUpO1xuICAgICAgICByZXN1bHRzLnB1c2goYXJyYXlbaW5kZXhdKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfTtcblxuICAvLyBQcm9kdWNlIGFuIGFycmF5IHRoYXQgY29udGFpbnMgdGhlIHVuaW9uOiBlYWNoIGRpc3RpbmN0IGVsZW1lbnQgZnJvbSBhbGwgb2ZcbiAgLy8gdGhlIHBhc3NlZC1pbiBhcnJheXMuXG4gIF8udW5pb24gPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gXy51bmlxKGNvbmNhdC5hcHBseShBcnJheVByb3RvLCBhcmd1bWVudHMpKTtcbiAgfTtcblxuICAvLyBQcm9kdWNlIGFuIGFycmF5IHRoYXQgY29udGFpbnMgZXZlcnkgaXRlbSBzaGFyZWQgYmV0d2VlbiBhbGwgdGhlXG4gIC8vIHBhc3NlZC1pbiBhcnJheXMuXG4gIF8uaW50ZXJzZWN0aW9uID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICB2YXIgcmVzdCA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICByZXR1cm4gXy5maWx0ZXIoXy51bmlxKGFycmF5KSwgZnVuY3Rpb24oaXRlbSkge1xuICAgICAgcmV0dXJuIF8uZXZlcnkocmVzdCwgZnVuY3Rpb24ob3RoZXIpIHtcbiAgICAgICAgcmV0dXJuIF8uaW5kZXhPZihvdGhlciwgaXRlbSkgPj0gMDtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIFRha2UgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiBvbmUgYXJyYXkgYW5kIGEgbnVtYmVyIG9mIG90aGVyIGFycmF5cy5cbiAgLy8gT25seSB0aGUgZWxlbWVudHMgcHJlc2VudCBpbiBqdXN0IHRoZSBmaXJzdCBhcnJheSB3aWxsIHJlbWFpbi5cbiAgXy5kaWZmZXJlbmNlID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICB2YXIgcmVzdCA9IGNvbmNhdC5hcHBseShBcnJheVByb3RvLCBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICAgIHJldHVybiBfLmZpbHRlcihhcnJheSwgZnVuY3Rpb24odmFsdWUpeyByZXR1cm4gIV8uY29udGFpbnMocmVzdCwgdmFsdWUpOyB9KTtcbiAgfTtcblxuICAvLyBaaXAgdG9nZXRoZXIgbXVsdGlwbGUgbGlzdHMgaW50byBhIHNpbmdsZSBhcnJheSAtLSBlbGVtZW50cyB0aGF0IHNoYXJlXG4gIC8vIGFuIGluZGV4IGdvIHRvZ2V0aGVyLlxuICBfLnppcCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgIHZhciBsZW5ndGggPSBfLm1heChfLnBsdWNrKGFyZ3MsICdsZW5ndGgnKSk7XG4gICAgdmFyIHJlc3VsdHMgPSBuZXcgQXJyYXkobGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICByZXN1bHRzW2ldID0gXy5wbHVjayhhcmdzLCBcIlwiICsgaSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xuICB9O1xuXG4gIC8vIENvbnZlcnRzIGxpc3RzIGludG8gb2JqZWN0cy4gUGFzcyBlaXRoZXIgYSBzaW5nbGUgYXJyYXkgb2YgYFtrZXksIHZhbHVlXWBcbiAgLy8gcGFpcnMsIG9yIHR3byBwYXJhbGxlbCBhcnJheXMgb2YgdGhlIHNhbWUgbGVuZ3RoIC0tIG9uZSBvZiBrZXlzLCBhbmQgb25lIG9mXG4gIC8vIHRoZSBjb3JyZXNwb25kaW5nIHZhbHVlcy5cbiAgXy5vYmplY3QgPSBmdW5jdGlvbihsaXN0LCB2YWx1ZXMpIHtcbiAgICBpZiAobGlzdCA9PSBudWxsKSByZXR1cm4ge307XG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIGZvciAodmFyIGkgPSAwLCBsID0gbGlzdC5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIGlmICh2YWx1ZXMpIHtcbiAgICAgICAgcmVzdWx0W2xpc3RbaV1dID0gdmFsdWVzW2ldO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0W2xpc3RbaV1bMF1dID0gbGlzdFtpXVsxXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBJZiB0aGUgYnJvd3NlciBkb2Vzbid0IHN1cHBseSB1cyB3aXRoIGluZGV4T2YgKEknbSBsb29raW5nIGF0IHlvdSwgKipNU0lFKiopLFxuICAvLyB3ZSBuZWVkIHRoaXMgZnVuY3Rpb24uIFJldHVybiB0aGUgcG9zaXRpb24gb2YgdGhlIGZpcnN0IG9jY3VycmVuY2Ugb2YgYW5cbiAgLy8gaXRlbSBpbiBhbiBhcnJheSwgb3IgLTEgaWYgdGhlIGl0ZW0gaXMgbm90IGluY2x1ZGVkIGluIHRoZSBhcnJheS5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYGluZGV4T2ZgIGlmIGF2YWlsYWJsZS5cbiAgLy8gSWYgdGhlIGFycmF5IGlzIGxhcmdlIGFuZCBhbHJlYWR5IGluIHNvcnQgb3JkZXIsIHBhc3MgYHRydWVgXG4gIC8vIGZvciAqKmlzU29ydGVkKiogdG8gdXNlIGJpbmFyeSBzZWFyY2guXG4gIF8uaW5kZXhPZiA9IGZ1bmN0aW9uKGFycmF5LCBpdGVtLCBpc1NvcnRlZCkge1xuICAgIGlmIChhcnJheSA9PSBudWxsKSByZXR1cm4gLTE7XG4gICAgdmFyIGkgPSAwLCBsID0gYXJyYXkubGVuZ3RoO1xuICAgIGlmIChpc1NvcnRlZCkge1xuICAgICAgaWYgKHR5cGVvZiBpc1NvcnRlZCA9PSAnbnVtYmVyJykge1xuICAgICAgICBpID0gKGlzU29ydGVkIDwgMCA/IE1hdGgubWF4KDAsIGwgKyBpc1NvcnRlZCkgOiBpc1NvcnRlZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpID0gXy5zb3J0ZWRJbmRleChhcnJheSwgaXRlbSk7XG4gICAgICAgIHJldHVybiBhcnJheVtpXSA9PT0gaXRlbSA/IGkgOiAtMTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKG5hdGl2ZUluZGV4T2YgJiYgYXJyYXkuaW5kZXhPZiA9PT0gbmF0aXZlSW5kZXhPZikgcmV0dXJuIGFycmF5LmluZGV4T2YoaXRlbSwgaXNTb3J0ZWQpO1xuICAgIGZvciAoOyBpIDwgbDsgaSsrKSBpZiAoYXJyYXlbaV0gPT09IGl0ZW0pIHJldHVybiBpO1xuICAgIHJldHVybiAtMTtcbiAgfTtcblxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgbGFzdEluZGV4T2ZgIGlmIGF2YWlsYWJsZS5cbiAgXy5sYXN0SW5kZXhPZiA9IGZ1bmN0aW9uKGFycmF5LCBpdGVtLCBmcm9tKSB7XG4gICAgaWYgKGFycmF5ID09IG51bGwpIHJldHVybiAtMTtcbiAgICB2YXIgaGFzSW5kZXggPSBmcm9tICE9IG51bGw7XG4gICAgaWYgKG5hdGl2ZUxhc3RJbmRleE9mICYmIGFycmF5Lmxhc3RJbmRleE9mID09PSBuYXRpdmVMYXN0SW5kZXhPZikge1xuICAgICAgcmV0dXJuIGhhc0luZGV4ID8gYXJyYXkubGFzdEluZGV4T2YoaXRlbSwgZnJvbSkgOiBhcnJheS5sYXN0SW5kZXhPZihpdGVtKTtcbiAgICB9XG4gICAgdmFyIGkgPSAoaGFzSW5kZXggPyBmcm9tIDogYXJyYXkubGVuZ3RoKTtcbiAgICB3aGlsZSAoaS0tKSBpZiAoYXJyYXlbaV0gPT09IGl0ZW0pIHJldHVybiBpO1xuICAgIHJldHVybiAtMTtcbiAgfTtcblxuICAvLyBHZW5lcmF0ZSBhbiBpbnRlZ2VyIEFycmF5IGNvbnRhaW5pbmcgYW4gYXJpdGhtZXRpYyBwcm9ncmVzc2lvbi4gQSBwb3J0IG9mXG4gIC8vIHRoZSBuYXRpdmUgUHl0aG9uIGByYW5nZSgpYCBmdW5jdGlvbi4gU2VlXG4gIC8vIFt0aGUgUHl0aG9uIGRvY3VtZW50YXRpb25dKGh0dHA6Ly9kb2NzLnB5dGhvbi5vcmcvbGlicmFyeS9mdW5jdGlvbnMuaHRtbCNyYW5nZSkuXG4gIF8ucmFuZ2UgPSBmdW5jdGlvbihzdGFydCwgc3RvcCwgc3RlcCkge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHN0b3AgPSBzdGFydCB8fCAwO1xuICAgICAgc3RhcnQgPSAwO1xuICAgIH1cbiAgICBzdGVwID0gYXJndW1lbnRzWzJdIHx8IDE7XG5cbiAgICB2YXIgbGVuID0gTWF0aC5tYXgoTWF0aC5jZWlsKChzdG9wIC0gc3RhcnQpIC8gc3RlcCksIDApO1xuICAgIHZhciBpZHggPSAwO1xuICAgIHZhciByYW5nZSA9IG5ldyBBcnJheShsZW4pO1xuXG4gICAgd2hpbGUoaWR4IDwgbGVuKSB7XG4gICAgICByYW5nZVtpZHgrK10gPSBzdGFydDtcbiAgICAgIHN0YXJ0ICs9IHN0ZXA7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJhbmdlO1xuICB9O1xuXG4gIC8vIEZ1bmN0aW9uIChhaGVtKSBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gQ3JlYXRlIGEgZnVuY3Rpb24gYm91bmQgdG8gYSBnaXZlbiBvYmplY3QgKGFzc2lnbmluZyBgdGhpc2AsIGFuZCBhcmd1bWVudHMsXG4gIC8vIG9wdGlvbmFsbHkpLiBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgRnVuY3Rpb24uYmluZGAgaWZcbiAgLy8gYXZhaWxhYmxlLlxuICBfLmJpbmQgPSBmdW5jdGlvbihmdW5jLCBjb250ZXh0KSB7XG4gICAgaWYgKGZ1bmMuYmluZCA9PT0gbmF0aXZlQmluZCAmJiBuYXRpdmVCaW5kKSByZXR1cm4gbmF0aXZlQmluZC5hcHBseShmdW5jLCBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MuY29uY2F0KHNsaWNlLmNhbGwoYXJndW1lbnRzKSkpO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUGFydGlhbGx5IGFwcGx5IGEgZnVuY3Rpb24gYnkgY3JlYXRpbmcgYSB2ZXJzaW9uIHRoYXQgaGFzIGhhZCBzb21lIG9mIGl0c1xuICAvLyBhcmd1bWVudHMgcHJlLWZpbGxlZCwgd2l0aG91dCBjaGFuZ2luZyBpdHMgZHluYW1pYyBgdGhpc2AgY29udGV4dC5cbiAgXy5wYXJ0aWFsID0gZnVuY3Rpb24oZnVuYykge1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBmdW5jLmFwcGx5KHRoaXMsIGFyZ3MuY29uY2F0KHNsaWNlLmNhbGwoYXJndW1lbnRzKSkpO1xuICAgIH07XG4gIH07XG5cbiAgLy8gQmluZCBhbGwgb2YgYW4gb2JqZWN0J3MgbWV0aG9kcyB0byB0aGF0IG9iamVjdC4gVXNlZnVsIGZvciBlbnN1cmluZyB0aGF0XG4gIC8vIGFsbCBjYWxsYmFja3MgZGVmaW5lZCBvbiBhbiBvYmplY3QgYmVsb25nIHRvIGl0LlxuICBfLmJpbmRBbGwgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgZnVuY3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgaWYgKGZ1bmNzLmxlbmd0aCA9PT0gMCkgZnVuY3MgPSBfLmZ1bmN0aW9ucyhvYmopO1xuICAgIGVhY2goZnVuY3MsIGZ1bmN0aW9uKGYpIHsgb2JqW2ZdID0gXy5iaW5kKG9ialtmXSwgb2JqKTsgfSk7XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBNZW1vaXplIGFuIGV4cGVuc2l2ZSBmdW5jdGlvbiBieSBzdG9yaW5nIGl0cyByZXN1bHRzLlxuICBfLm1lbW9pemUgPSBmdW5jdGlvbihmdW5jLCBoYXNoZXIpIHtcbiAgICB2YXIgbWVtbyA9IHt9O1xuICAgIGhhc2hlciB8fCAoaGFzaGVyID0gXy5pZGVudGl0eSk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGtleSA9IGhhc2hlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgcmV0dXJuIF8uaGFzKG1lbW8sIGtleSkgPyBtZW1vW2tleV0gOiAobWVtb1trZXldID0gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpKTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIERlbGF5cyBhIGZ1bmN0aW9uIGZvciB0aGUgZ2l2ZW4gbnVtYmVyIG9mIG1pbGxpc2Vjb25kcywgYW5kIHRoZW4gY2FsbHNcbiAgLy8gaXQgd2l0aCB0aGUgYXJndW1lbnRzIHN1cHBsaWVkLlxuICBfLmRlbGF5ID0gZnVuY3Rpb24oZnVuYywgd2FpdCkge1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7IHJldHVybiBmdW5jLmFwcGx5KG51bGwsIGFyZ3MpOyB9LCB3YWl0KTtcbiAgfTtcblxuICAvLyBEZWZlcnMgYSBmdW5jdGlvbiwgc2NoZWR1bGluZyBpdCB0byBydW4gYWZ0ZXIgdGhlIGN1cnJlbnQgY2FsbCBzdGFjayBoYXNcbiAgLy8gY2xlYXJlZC5cbiAgXy5kZWZlciA9IGZ1bmN0aW9uKGZ1bmMpIHtcbiAgICByZXR1cm4gXy5kZWxheS5hcHBseShfLCBbZnVuYywgMV0uY29uY2F0KHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSkpO1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiwgdGhhdCwgd2hlbiBpbnZva2VkLCB3aWxsIG9ubHkgYmUgdHJpZ2dlcmVkIGF0IG1vc3Qgb25jZVxuICAvLyBkdXJpbmcgYSBnaXZlbiB3aW5kb3cgb2YgdGltZS5cbiAgXy50aHJvdHRsZSA9IGZ1bmN0aW9uKGZ1bmMsIHdhaXQpIHtcbiAgICB2YXIgY29udGV4dCwgYXJncywgdGltZW91dCwgcmVzdWx0O1xuICAgIHZhciBwcmV2aW91cyA9IDA7XG4gICAgdmFyIGxhdGVyID0gZnVuY3Rpb24oKSB7XG4gICAgICBwcmV2aW91cyA9IG5ldyBEYXRlO1xuICAgICAgdGltZW91dCA9IG51bGw7XG4gICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgIH07XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIG5vdyA9IG5ldyBEYXRlO1xuICAgICAgdmFyIHJlbWFpbmluZyA9IHdhaXQgLSAobm93IC0gcHJldmlvdXMpO1xuICAgICAgY29udGV4dCA9IHRoaXM7XG4gICAgICBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgaWYgKHJlbWFpbmluZyA8PSAwKSB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgdGltZW91dCA9IG51bGw7XG4gICAgICAgIHByZXZpb3VzID0gbm93O1xuICAgICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgICAgfSBlbHNlIGlmICghdGltZW91dCkge1xuICAgICAgICB0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgcmVtYWluaW5nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24sIHRoYXQsIGFzIGxvbmcgYXMgaXQgY29udGludWVzIHRvIGJlIGludm9rZWQsIHdpbGwgbm90XG4gIC8vIGJlIHRyaWdnZXJlZC4gVGhlIGZ1bmN0aW9uIHdpbGwgYmUgY2FsbGVkIGFmdGVyIGl0IHN0b3BzIGJlaW5nIGNhbGxlZCBmb3JcbiAgLy8gTiBtaWxsaXNlY29uZHMuIElmIGBpbW1lZGlhdGVgIGlzIHBhc3NlZCwgdHJpZ2dlciB0aGUgZnVuY3Rpb24gb24gdGhlXG4gIC8vIGxlYWRpbmcgZWRnZSwgaW5zdGVhZCBvZiB0aGUgdHJhaWxpbmcuXG4gIF8uZGVib3VuY2UgPSBmdW5jdGlvbihmdW5jLCB3YWl0LCBpbW1lZGlhdGUpIHtcbiAgICB2YXIgdGltZW91dCwgcmVzdWx0O1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBjb250ZXh0ID0gdGhpcywgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIHZhciBsYXRlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB0aW1lb3V0ID0gbnVsbDtcbiAgICAgICAgaWYgKCFpbW1lZGlhdGUpIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICB9O1xuICAgICAgdmFyIGNhbGxOb3cgPSBpbW1lZGlhdGUgJiYgIXRpbWVvdXQ7XG4gICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICB0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgd2FpdCk7XG4gICAgICBpZiAoY2FsbE5vdykgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGV4ZWN1dGVkIGF0IG1vc3Qgb25lIHRpbWUsIG5vIG1hdHRlciBob3dcbiAgLy8gb2Z0ZW4geW91IGNhbGwgaXQuIFVzZWZ1bCBmb3IgbGF6eSBpbml0aWFsaXphdGlvbi5cbiAgXy5vbmNlID0gZnVuY3Rpb24oZnVuYykge1xuICAgIHZhciByYW4gPSBmYWxzZSwgbWVtbztcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAocmFuKSByZXR1cm4gbWVtbztcbiAgICAgIHJhbiA9IHRydWU7XG4gICAgICBtZW1vID0gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgZnVuYyA9IG51bGw7XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgdGhlIGZpcnN0IGZ1bmN0aW9uIHBhc3NlZCBhcyBhbiBhcmd1bWVudCB0byB0aGUgc2Vjb25kLFxuICAvLyBhbGxvd2luZyB5b3UgdG8gYWRqdXN0IGFyZ3VtZW50cywgcnVuIGNvZGUgYmVmb3JlIGFuZCBhZnRlciwgYW5kXG4gIC8vIGNvbmRpdGlvbmFsbHkgZXhlY3V0ZSB0aGUgb3JpZ2luYWwgZnVuY3Rpb24uXG4gIF8ud3JhcCA9IGZ1bmN0aW9uKGZ1bmMsIHdyYXBwZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgYXJncyA9IFtmdW5jXTtcbiAgICAgIHB1c2guYXBwbHkoYXJncywgYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiB3cmFwcGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgaXMgdGhlIGNvbXBvc2l0aW9uIG9mIGEgbGlzdCBvZiBmdW5jdGlvbnMsIGVhY2hcbiAgLy8gY29uc3VtaW5nIHRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIGZ1bmN0aW9uIHRoYXQgZm9sbG93cy5cbiAgXy5jb21wb3NlID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGZ1bmNzID0gYXJndW1lbnRzO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgZm9yICh2YXIgaSA9IGZ1bmNzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIGFyZ3MgPSBbZnVuY3NbaV0uYXBwbHkodGhpcywgYXJncyldO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGFyZ3NbMF07XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCB3aWxsIG9ubHkgYmUgZXhlY3V0ZWQgYWZ0ZXIgYmVpbmcgY2FsbGVkIE4gdGltZXMuXG4gIF8uYWZ0ZXIgPSBmdW5jdGlvbih0aW1lcywgZnVuYykge1xuICAgIGlmICh0aW1lcyA8PSAwKSByZXR1cm4gZnVuYygpO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIGlmICgtLXRpbWVzIDwgMSkge1xuICAgICAgICByZXR1cm4gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgfVxuICAgIH07XG4gIH07XG5cbiAgLy8gT2JqZWN0IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gUmV0cmlldmUgdGhlIG5hbWVzIG9mIGFuIG9iamVjdCdzIHByb3BlcnRpZXMuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBPYmplY3Qua2V5c2BcbiAgXy5rZXlzID0gbmF0aXZlS2V5cyB8fCBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqICE9PSBPYmplY3Qob2JqKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignSW52YWxpZCBvYmplY3QnKTtcbiAgICB2YXIga2V5cyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIGlmIChfLmhhcyhvYmosIGtleSkpIGtleXNba2V5cy5sZW5ndGhdID0ga2V5O1xuICAgIHJldHVybiBrZXlzO1xuICB9O1xuXG4gIC8vIFJldHJpZXZlIHRoZSB2YWx1ZXMgb2YgYW4gb2JqZWN0J3MgcHJvcGVydGllcy5cbiAgXy52YWx1ZXMgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgdmFsdWVzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikgaWYgKF8uaGFzKG9iaiwga2V5KSkgdmFsdWVzLnB1c2gob2JqW2tleV0pO1xuICAgIHJldHVybiB2YWx1ZXM7XG4gIH07XG5cbiAgLy8gQ29udmVydCBhbiBvYmplY3QgaW50byBhIGxpc3Qgb2YgYFtrZXksIHZhbHVlXWAgcGFpcnMuXG4gIF8ucGFpcnMgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgcGFpcnMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSBpZiAoXy5oYXMob2JqLCBrZXkpKSBwYWlycy5wdXNoKFtrZXksIG9ialtrZXldXSk7XG4gICAgcmV0dXJuIHBhaXJzO1xuICB9O1xuXG4gIC8vIEludmVydCB0aGUga2V5cyBhbmQgdmFsdWVzIG9mIGFuIG9iamVjdC4gVGhlIHZhbHVlcyBtdXN0IGJlIHNlcmlhbGl6YWJsZS5cbiAgXy5pbnZlcnQgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikgaWYgKF8uaGFzKG9iaiwga2V5KSkgcmVzdWx0W29ialtrZXldXSA9IGtleTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFJldHVybiBhIHNvcnRlZCBsaXN0IG9mIHRoZSBmdW5jdGlvbiBuYW1lcyBhdmFpbGFibGUgb24gdGhlIG9iamVjdC5cbiAgLy8gQWxpYXNlZCBhcyBgbWV0aG9kc2BcbiAgXy5mdW5jdGlvbnMgPSBfLm1ldGhvZHMgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgbmFtZXMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoXy5pc0Z1bmN0aW9uKG9ialtrZXldKSkgbmFtZXMucHVzaChrZXkpO1xuICAgIH1cbiAgICByZXR1cm4gbmFtZXMuc29ydCgpO1xuICB9O1xuXG4gIC8vIEV4dGVuZCBhIGdpdmVuIG9iamVjdCB3aXRoIGFsbCB0aGUgcHJvcGVydGllcyBpbiBwYXNzZWQtaW4gb2JqZWN0KHMpLlxuICBfLmV4dGVuZCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGVhY2goc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpLCBmdW5jdGlvbihzb3VyY2UpIHtcbiAgICAgIGlmIChzb3VyY2UpIHtcbiAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBzb3VyY2UpIHtcbiAgICAgICAgICBvYmpbcHJvcF0gPSBzb3VyY2VbcHJvcF07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gb2JqO1xuICB9O1xuXG4gIC8vIFJldHVybiBhIGNvcHkgb2YgdGhlIG9iamVjdCBvbmx5IGNvbnRhaW5pbmcgdGhlIHdoaXRlbGlzdGVkIHByb3BlcnRpZXMuXG4gIF8ucGljayA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBjb3B5ID0ge307XG4gICAgdmFyIGtleXMgPSBjb25jYXQuYXBwbHkoQXJyYXlQcm90bywgc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcbiAgICBlYWNoKGtleXMsIGZ1bmN0aW9uKGtleSkge1xuICAgICAgaWYgKGtleSBpbiBvYmopIGNvcHlba2V5XSA9IG9ialtrZXldO1xuICAgIH0pO1xuICAgIHJldHVybiBjb3B5O1xuICB9O1xuXG4gICAvLyBSZXR1cm4gYSBjb3B5IG9mIHRoZSBvYmplY3Qgd2l0aG91dCB0aGUgYmxhY2tsaXN0ZWQgcHJvcGVydGllcy5cbiAgXy5vbWl0ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGNvcHkgPSB7fTtcbiAgICB2YXIga2V5cyA9IGNvbmNhdC5hcHBseShBcnJheVByb3RvLCBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgIGlmICghXy5jb250YWlucyhrZXlzLCBrZXkpKSBjb3B5W2tleV0gPSBvYmpba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGNvcHk7XG4gIH07XG5cbiAgLy8gRmlsbCBpbiBhIGdpdmVuIG9iamVjdCB3aXRoIGRlZmF1bHQgcHJvcGVydGllcy5cbiAgXy5kZWZhdWx0cyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGVhY2goc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpLCBmdW5jdGlvbihzb3VyY2UpIHtcbiAgICAgIGlmIChzb3VyY2UpIHtcbiAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBzb3VyY2UpIHtcbiAgICAgICAgICBpZiAob2JqW3Byb3BdID09IG51bGwpIG9ialtwcm9wXSA9IHNvdXJjZVtwcm9wXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gQ3JlYXRlIGEgKHNoYWxsb3ctY2xvbmVkKSBkdXBsaWNhdGUgb2YgYW4gb2JqZWN0LlxuICBfLmNsb25lID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KG9iaikpIHJldHVybiBvYmo7XG4gICAgcmV0dXJuIF8uaXNBcnJheShvYmopID8gb2JqLnNsaWNlKCkgOiBfLmV4dGVuZCh7fSwgb2JqKTtcbiAgfTtcblxuICAvLyBJbnZva2VzIGludGVyY2VwdG9yIHdpdGggdGhlIG9iaiwgYW5kIHRoZW4gcmV0dXJucyBvYmouXG4gIC8vIFRoZSBwcmltYXJ5IHB1cnBvc2Ugb2YgdGhpcyBtZXRob2QgaXMgdG8gXCJ0YXAgaW50b1wiIGEgbWV0aG9kIGNoYWluLCBpblxuICAvLyBvcmRlciB0byBwZXJmb3JtIG9wZXJhdGlvbnMgb24gaW50ZXJtZWRpYXRlIHJlc3VsdHMgd2l0aGluIHRoZSBjaGFpbi5cbiAgXy50YXAgPSBmdW5jdGlvbihvYmosIGludGVyY2VwdG9yKSB7XG4gICAgaW50ZXJjZXB0b3Iob2JqKTtcbiAgICByZXR1cm4gb2JqO1xuICB9O1xuXG4gIC8vIEludGVybmFsIHJlY3Vyc2l2ZSBjb21wYXJpc29uIGZ1bmN0aW9uIGZvciBgaXNFcXVhbGAuXG4gIHZhciBlcSA9IGZ1bmN0aW9uKGEsIGIsIGFTdGFjaywgYlN0YWNrKSB7XG4gICAgLy8gSWRlbnRpY2FsIG9iamVjdHMgYXJlIGVxdWFsLiBgMCA9PT0gLTBgLCBidXQgdGhleSBhcmVuJ3QgaWRlbnRpY2FsLlxuICAgIC8vIFNlZSB0aGUgSGFybW9ueSBgZWdhbGAgcHJvcG9zYWw6IGh0dHA6Ly93aWtpLmVjbWFzY3JpcHQub3JnL2Rva3UucGhwP2lkPWhhcm1vbnk6ZWdhbC5cbiAgICBpZiAoYSA9PT0gYikgcmV0dXJuIGEgIT09IDAgfHwgMSAvIGEgPT0gMSAvIGI7XG4gICAgLy8gQSBzdHJpY3QgY29tcGFyaXNvbiBpcyBuZWNlc3NhcnkgYmVjYXVzZSBgbnVsbCA9PSB1bmRlZmluZWRgLlxuICAgIGlmIChhID09IG51bGwgfHwgYiA9PSBudWxsKSByZXR1cm4gYSA9PT0gYjtcbiAgICAvLyBVbndyYXAgYW55IHdyYXBwZWQgb2JqZWN0cy5cbiAgICBpZiAoYSBpbnN0YW5jZW9mIF8pIGEgPSBhLl93cmFwcGVkO1xuICAgIGlmIChiIGluc3RhbmNlb2YgXykgYiA9IGIuX3dyYXBwZWQ7XG4gICAgLy8gQ29tcGFyZSBgW1tDbGFzc11dYCBuYW1lcy5cbiAgICB2YXIgY2xhc3NOYW1lID0gdG9TdHJpbmcuY2FsbChhKTtcbiAgICBpZiAoY2xhc3NOYW1lICE9IHRvU3RyaW5nLmNhbGwoYikpIHJldHVybiBmYWxzZTtcbiAgICBzd2l0Y2ggKGNsYXNzTmFtZSkge1xuICAgICAgLy8gU3RyaW5ncywgbnVtYmVycywgZGF0ZXMsIGFuZCBib29sZWFucyBhcmUgY29tcGFyZWQgYnkgdmFsdWUuXG4gICAgICBjYXNlICdbb2JqZWN0IFN0cmluZ10nOlxuICAgICAgICAvLyBQcmltaXRpdmVzIGFuZCB0aGVpciBjb3JyZXNwb25kaW5nIG9iamVjdCB3cmFwcGVycyBhcmUgZXF1aXZhbGVudDsgdGh1cywgYFwiNVwiYCBpc1xuICAgICAgICAvLyBlcXVpdmFsZW50IHRvIGBuZXcgU3RyaW5nKFwiNVwiKWAuXG4gICAgICAgIHJldHVybiBhID09IFN0cmluZyhiKTtcbiAgICAgIGNhc2UgJ1tvYmplY3QgTnVtYmVyXSc6XG4gICAgICAgIC8vIGBOYU5gcyBhcmUgZXF1aXZhbGVudCwgYnV0IG5vbi1yZWZsZXhpdmUuIEFuIGBlZ2FsYCBjb21wYXJpc29uIGlzIHBlcmZvcm1lZCBmb3JcbiAgICAgICAgLy8gb3RoZXIgbnVtZXJpYyB2YWx1ZXMuXG4gICAgICAgIHJldHVybiBhICE9ICthID8gYiAhPSArYiA6IChhID09IDAgPyAxIC8gYSA9PSAxIC8gYiA6IGEgPT0gK2IpO1xuICAgICAgY2FzZSAnW29iamVjdCBEYXRlXSc6XG4gICAgICBjYXNlICdbb2JqZWN0IEJvb2xlYW5dJzpcbiAgICAgICAgLy8gQ29lcmNlIGRhdGVzIGFuZCBib29sZWFucyB0byBudW1lcmljIHByaW1pdGl2ZSB2YWx1ZXMuIERhdGVzIGFyZSBjb21wYXJlZCBieSB0aGVpclxuICAgICAgICAvLyBtaWxsaXNlY29uZCByZXByZXNlbnRhdGlvbnMuIE5vdGUgdGhhdCBpbnZhbGlkIGRhdGVzIHdpdGggbWlsbGlzZWNvbmQgcmVwcmVzZW50YXRpb25zXG4gICAgICAgIC8vIG9mIGBOYU5gIGFyZSBub3QgZXF1aXZhbGVudC5cbiAgICAgICAgcmV0dXJuICthID09ICtiO1xuICAgICAgLy8gUmVnRXhwcyBhcmUgY29tcGFyZWQgYnkgdGhlaXIgc291cmNlIHBhdHRlcm5zIGFuZCBmbGFncy5cbiAgICAgIGNhc2UgJ1tvYmplY3QgUmVnRXhwXSc6XG4gICAgICAgIHJldHVybiBhLnNvdXJjZSA9PSBiLnNvdXJjZSAmJlxuICAgICAgICAgICAgICAgYS5nbG9iYWwgPT0gYi5nbG9iYWwgJiZcbiAgICAgICAgICAgICAgIGEubXVsdGlsaW5lID09IGIubXVsdGlsaW5lICYmXG4gICAgICAgICAgICAgICBhLmlnbm9yZUNhc2UgPT0gYi5pZ25vcmVDYXNlO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGEgIT0gJ29iamVjdCcgfHwgdHlwZW9mIGIgIT0gJ29iamVjdCcpIHJldHVybiBmYWxzZTtcbiAgICAvLyBBc3N1bWUgZXF1YWxpdHkgZm9yIGN5Y2xpYyBzdHJ1Y3R1cmVzLiBUaGUgYWxnb3JpdGhtIGZvciBkZXRlY3RpbmcgY3ljbGljXG4gICAgLy8gc3RydWN0dXJlcyBpcyBhZGFwdGVkIGZyb20gRVMgNS4xIHNlY3Rpb24gMTUuMTIuMywgYWJzdHJhY3Qgb3BlcmF0aW9uIGBKT2AuXG4gICAgdmFyIGxlbmd0aCA9IGFTdGFjay5sZW5ndGg7XG4gICAgd2hpbGUgKGxlbmd0aC0tKSB7XG4gICAgICAvLyBMaW5lYXIgc2VhcmNoLiBQZXJmb3JtYW5jZSBpcyBpbnZlcnNlbHkgcHJvcG9ydGlvbmFsIHRvIHRoZSBudW1iZXIgb2ZcbiAgICAgIC8vIHVuaXF1ZSBuZXN0ZWQgc3RydWN0dXJlcy5cbiAgICAgIGlmIChhU3RhY2tbbGVuZ3RoXSA9PSBhKSByZXR1cm4gYlN0YWNrW2xlbmd0aF0gPT0gYjtcbiAgICB9XG4gICAgLy8gQWRkIHRoZSBmaXJzdCBvYmplY3QgdG8gdGhlIHN0YWNrIG9mIHRyYXZlcnNlZCBvYmplY3RzLlxuICAgIGFTdGFjay5wdXNoKGEpO1xuICAgIGJTdGFjay5wdXNoKGIpO1xuICAgIHZhciBzaXplID0gMCwgcmVzdWx0ID0gdHJ1ZTtcbiAgICAvLyBSZWN1cnNpdmVseSBjb21wYXJlIG9iamVjdHMgYW5kIGFycmF5cy5cbiAgICBpZiAoY2xhc3NOYW1lID09ICdbb2JqZWN0IEFycmF5XScpIHtcbiAgICAgIC8vIENvbXBhcmUgYXJyYXkgbGVuZ3RocyB0byBkZXRlcm1pbmUgaWYgYSBkZWVwIGNvbXBhcmlzb24gaXMgbmVjZXNzYXJ5LlxuICAgICAgc2l6ZSA9IGEubGVuZ3RoO1xuICAgICAgcmVzdWx0ID0gc2l6ZSA9PSBiLmxlbmd0aDtcbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgLy8gRGVlcCBjb21wYXJlIHRoZSBjb250ZW50cywgaWdub3Jpbmcgbm9uLW51bWVyaWMgcHJvcGVydGllcy5cbiAgICAgICAgd2hpbGUgKHNpemUtLSkge1xuICAgICAgICAgIGlmICghKHJlc3VsdCA9IGVxKGFbc2l6ZV0sIGJbc2l6ZV0sIGFTdGFjaywgYlN0YWNrKSkpIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIE9iamVjdHMgd2l0aCBkaWZmZXJlbnQgY29uc3RydWN0b3JzIGFyZSBub3QgZXF1aXZhbGVudCwgYnV0IGBPYmplY3Rgc1xuICAgICAgLy8gZnJvbSBkaWZmZXJlbnQgZnJhbWVzIGFyZS5cbiAgICAgIHZhciBhQ3RvciA9IGEuY29uc3RydWN0b3IsIGJDdG9yID0gYi5jb25zdHJ1Y3RvcjtcbiAgICAgIGlmIChhQ3RvciAhPT0gYkN0b3IgJiYgIShfLmlzRnVuY3Rpb24oYUN0b3IpICYmIChhQ3RvciBpbnN0YW5jZW9mIGFDdG9yKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF8uaXNGdW5jdGlvbihiQ3RvcikgJiYgKGJDdG9yIGluc3RhbmNlb2YgYkN0b3IpKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICAvLyBEZWVwIGNvbXBhcmUgb2JqZWN0cy5cbiAgICAgIGZvciAodmFyIGtleSBpbiBhKSB7XG4gICAgICAgIGlmIChfLmhhcyhhLCBrZXkpKSB7XG4gICAgICAgICAgLy8gQ291bnQgdGhlIGV4cGVjdGVkIG51bWJlciBvZiBwcm9wZXJ0aWVzLlxuICAgICAgICAgIHNpemUrKztcbiAgICAgICAgICAvLyBEZWVwIGNvbXBhcmUgZWFjaCBtZW1iZXIuXG4gICAgICAgICAgaWYgKCEocmVzdWx0ID0gXy5oYXMoYiwga2V5KSAmJiBlcShhW2tleV0sIGJba2V5XSwgYVN0YWNrLCBiU3RhY2spKSkgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIEVuc3VyZSB0aGF0IGJvdGggb2JqZWN0cyBjb250YWluIHRoZSBzYW1lIG51bWJlciBvZiBwcm9wZXJ0aWVzLlxuICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICBmb3IgKGtleSBpbiBiKSB7XG4gICAgICAgICAgaWYgKF8uaGFzKGIsIGtleSkgJiYgIShzaXplLS0pKSBicmVhaztcbiAgICAgICAgfVxuICAgICAgICByZXN1bHQgPSAhc2l6ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gUmVtb3ZlIHRoZSBmaXJzdCBvYmplY3QgZnJvbSB0aGUgc3RhY2sgb2YgdHJhdmVyc2VkIG9iamVjdHMuXG4gICAgYVN0YWNrLnBvcCgpO1xuICAgIGJTdGFjay5wb3AoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFBlcmZvcm0gYSBkZWVwIGNvbXBhcmlzb24gdG8gY2hlY2sgaWYgdHdvIG9iamVjdHMgYXJlIGVxdWFsLlxuICBfLmlzRXF1YWwgPSBmdW5jdGlvbihhLCBiKSB7XG4gICAgcmV0dXJuIGVxKGEsIGIsIFtdLCBbXSk7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiBhcnJheSwgc3RyaW5nLCBvciBvYmplY3QgZW1wdHk/XG4gIC8vIEFuIFwiZW1wdHlcIiBvYmplY3QgaGFzIG5vIGVudW1lcmFibGUgb3duLXByb3BlcnRpZXMuXG4gIF8uaXNFbXB0eSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHRydWU7XG4gICAgaWYgKF8uaXNBcnJheShvYmopIHx8IF8uaXNTdHJpbmcob2JqKSkgcmV0dXJuIG9iai5sZW5ndGggPT09IDA7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikgaWYgKF8uaGFzKG9iaiwga2V5KSkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiB0cnVlO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgYSBET00gZWxlbWVudD9cbiAgXy5pc0VsZW1lbnQgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gISEob2JqICYmIG9iai5ub2RlVHlwZSA9PT0gMSk7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBhbiBhcnJheT9cbiAgLy8gRGVsZWdhdGVzIHRvIEVDTUE1J3MgbmF0aXZlIEFycmF5LmlzQXJyYXlcbiAgXy5pc0FycmF5ID0gbmF0aXZlSXNBcnJheSB8fCBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gdG9TdHJpbmcuY2FsbChvYmopID09ICdbb2JqZWN0IEFycmF5XSc7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YXJpYWJsZSBhbiBvYmplY3Q/XG4gIF8uaXNPYmplY3QgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSBPYmplY3Qob2JqKTtcbiAgfTtcblxuICAvLyBBZGQgc29tZSBpc1R5cGUgbWV0aG9kczogaXNBcmd1bWVudHMsIGlzRnVuY3Rpb24sIGlzU3RyaW5nLCBpc051bWJlciwgaXNEYXRlLCBpc1JlZ0V4cC5cbiAgZWFjaChbJ0FyZ3VtZW50cycsICdGdW5jdGlvbicsICdTdHJpbmcnLCAnTnVtYmVyJywgJ0RhdGUnLCAnUmVnRXhwJ10sIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICBfWydpcycgKyBuYW1lXSA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIHRvU3RyaW5nLmNhbGwob2JqKSA9PSAnW29iamVjdCAnICsgbmFtZSArICddJztcbiAgICB9O1xuICB9KTtcblxuICAvLyBEZWZpbmUgYSBmYWxsYmFjayB2ZXJzaW9uIG9mIHRoZSBtZXRob2QgaW4gYnJvd3NlcnMgKGFoZW0sIElFKSwgd2hlcmVcbiAgLy8gdGhlcmUgaXNuJ3QgYW55IGluc3BlY3RhYmxlIFwiQXJndW1lbnRzXCIgdHlwZS5cbiAgaWYgKCFfLmlzQXJndW1lbnRzKGFyZ3VtZW50cykpIHtcbiAgICBfLmlzQXJndW1lbnRzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gISEob2JqICYmIF8uaGFzKG9iaiwgJ2NhbGxlZScpKTtcbiAgICB9O1xuICB9XG5cbiAgLy8gT3B0aW1pemUgYGlzRnVuY3Rpb25gIGlmIGFwcHJvcHJpYXRlLlxuICBpZiAodHlwZW9mICgvLi8pICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgXy5pc0Z1bmN0aW9uID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gdHlwZW9mIG9iaiA9PT0gJ2Z1bmN0aW9uJztcbiAgICB9O1xuICB9XG5cbiAgLy8gSXMgYSBnaXZlbiBvYmplY3QgYSBmaW5pdGUgbnVtYmVyP1xuICBfLmlzRmluaXRlID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIGlzRmluaXRlKG9iaikgJiYgIWlzTmFOKHBhcnNlRmxvYXQob2JqKSk7XG4gIH07XG5cbiAgLy8gSXMgdGhlIGdpdmVuIHZhbHVlIGBOYU5gPyAoTmFOIGlzIHRoZSBvbmx5IG51bWJlciB3aGljaCBkb2VzIG5vdCBlcXVhbCBpdHNlbGYpLlxuICBfLmlzTmFOID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIF8uaXNOdW1iZXIob2JqKSAmJiBvYmogIT0gK29iajtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGEgYm9vbGVhbj9cbiAgXy5pc0Jvb2xlYW4gPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSB0cnVlIHx8IG9iaiA9PT0gZmFsc2UgfHwgdG9TdHJpbmcuY2FsbChvYmopID09ICdbb2JqZWN0IEJvb2xlYW5dJztcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGVxdWFsIHRvIG51bGw/XG4gIF8uaXNOdWxsID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PT0gbnVsbDtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhcmlhYmxlIHVuZGVmaW5lZD9cbiAgXy5pc1VuZGVmaW5lZCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT09IHZvaWQgMDtcbiAgfTtcblxuICAvLyBTaG9ydGN1dCBmdW5jdGlvbiBmb3IgY2hlY2tpbmcgaWYgYW4gb2JqZWN0IGhhcyBhIGdpdmVuIHByb3BlcnR5IGRpcmVjdGx5XG4gIC8vIG9uIGl0c2VsZiAoaW4gb3RoZXIgd29yZHMsIG5vdCBvbiBhIHByb3RvdHlwZSkuXG4gIF8uaGFzID0gZnVuY3Rpb24ob2JqLCBrZXkpIHtcbiAgICByZXR1cm4gaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSk7XG4gIH07XG5cbiAgLy8gVXRpbGl0eSBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBSdW4gVW5kZXJzY29yZS5qcyBpbiAqbm9Db25mbGljdCogbW9kZSwgcmV0dXJuaW5nIHRoZSBgX2AgdmFyaWFibGUgdG8gaXRzXG4gIC8vIHByZXZpb3VzIG93bmVyLiBSZXR1cm5zIGEgcmVmZXJlbmNlIHRvIHRoZSBVbmRlcnNjb3JlIG9iamVjdC5cbiAgXy5ub0NvbmZsaWN0ID0gZnVuY3Rpb24oKSB7XG4gICAgcm9vdC5fID0gcHJldmlvdXNVbmRlcnNjb3JlO1xuICAgIHJldHVybiB0aGlzO1xuICB9O1xuXG4gIC8vIEtlZXAgdGhlIGlkZW50aXR5IGZ1bmN0aW9uIGFyb3VuZCBmb3IgZGVmYXVsdCBpdGVyYXRvcnMuXG4gIF8uaWRlbnRpdHkgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfTtcblxuICAvLyBSdW4gYSBmdW5jdGlvbiAqKm4qKiB0aW1lcy5cbiAgXy50aW1lcyA9IGZ1bmN0aW9uKG4sIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgdmFyIGFjY3VtID0gQXJyYXkobik7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyBpKyspIGFjY3VtW2ldID0gaXRlcmF0b3IuY2FsbChjb250ZXh0LCBpKTtcbiAgICByZXR1cm4gYWNjdW07XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgcmFuZG9tIGludGVnZXIgYmV0d2VlbiBtaW4gYW5kIG1heCAoaW5jbHVzaXZlKS5cbiAgXy5yYW5kb20gPSBmdW5jdGlvbihtaW4sIG1heCkge1xuICAgIGlmIChtYXggPT0gbnVsbCkge1xuICAgICAgbWF4ID0gbWluO1xuICAgICAgbWluID0gMDtcbiAgICB9XG4gICAgcmV0dXJuIG1pbiArIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4gKyAxKSk7XG4gIH07XG5cbiAgLy8gTGlzdCBvZiBIVE1MIGVudGl0aWVzIGZvciBlc2NhcGluZy5cbiAgdmFyIGVudGl0eU1hcCA9IHtcbiAgICBlc2NhcGU6IHtcbiAgICAgICcmJzogJyZhbXA7JyxcbiAgICAgICc8JzogJyZsdDsnLFxuICAgICAgJz4nOiAnJmd0OycsXG4gICAgICAnXCInOiAnJnF1b3Q7JyxcbiAgICAgIFwiJ1wiOiAnJiN4Mjc7JyxcbiAgICAgICcvJzogJyYjeDJGOydcbiAgICB9XG4gIH07XG4gIGVudGl0eU1hcC51bmVzY2FwZSA9IF8uaW52ZXJ0KGVudGl0eU1hcC5lc2NhcGUpO1xuXG4gIC8vIFJlZ2V4ZXMgY29udGFpbmluZyB0aGUga2V5cyBhbmQgdmFsdWVzIGxpc3RlZCBpbW1lZGlhdGVseSBhYm92ZS5cbiAgdmFyIGVudGl0eVJlZ2V4ZXMgPSB7XG4gICAgZXNjYXBlOiAgIG5ldyBSZWdFeHAoJ1snICsgXy5rZXlzKGVudGl0eU1hcC5lc2NhcGUpLmpvaW4oJycpICsgJ10nLCAnZycpLFxuICAgIHVuZXNjYXBlOiBuZXcgUmVnRXhwKCcoJyArIF8ua2V5cyhlbnRpdHlNYXAudW5lc2NhcGUpLmpvaW4oJ3wnKSArICcpJywgJ2cnKVxuICB9O1xuXG4gIC8vIEZ1bmN0aW9ucyBmb3IgZXNjYXBpbmcgYW5kIHVuZXNjYXBpbmcgc3RyaW5ncyB0by9mcm9tIEhUTUwgaW50ZXJwb2xhdGlvbi5cbiAgXy5lYWNoKFsnZXNjYXBlJywgJ3VuZXNjYXBlJ10sIGZ1bmN0aW9uKG1ldGhvZCkge1xuICAgIF9bbWV0aG9kXSA9IGZ1bmN0aW9uKHN0cmluZykge1xuICAgICAgaWYgKHN0cmluZyA9PSBudWxsKSByZXR1cm4gJyc7XG4gICAgICByZXR1cm4gKCcnICsgc3RyaW5nKS5yZXBsYWNlKGVudGl0eVJlZ2V4ZXNbbWV0aG9kXSwgZnVuY3Rpb24obWF0Y2gpIHtcbiAgICAgICAgcmV0dXJuIGVudGl0eU1hcFttZXRob2RdW21hdGNoXTtcbiAgICAgIH0pO1xuICAgIH07XG4gIH0pO1xuXG4gIC8vIElmIHRoZSB2YWx1ZSBvZiB0aGUgbmFtZWQgcHJvcGVydHkgaXMgYSBmdW5jdGlvbiB0aGVuIGludm9rZSBpdDtcbiAgLy8gb3RoZXJ3aXNlLCByZXR1cm4gaXQuXG4gIF8ucmVzdWx0ID0gZnVuY3Rpb24ob2JqZWN0LCBwcm9wZXJ0eSkge1xuICAgIGlmIChvYmplY3QgPT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gICAgdmFyIHZhbHVlID0gb2JqZWN0W3Byb3BlcnR5XTtcbiAgICByZXR1cm4gXy5pc0Z1bmN0aW9uKHZhbHVlKSA/IHZhbHVlLmNhbGwob2JqZWN0KSA6IHZhbHVlO1xuICB9O1xuXG4gIC8vIEFkZCB5b3VyIG93biBjdXN0b20gZnVuY3Rpb25zIHRvIHRoZSBVbmRlcnNjb3JlIG9iamVjdC5cbiAgXy5taXhpbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGVhY2goXy5mdW5jdGlvbnMob2JqKSwgZnVuY3Rpb24obmFtZSl7XG4gICAgICB2YXIgZnVuYyA9IF9bbmFtZV0gPSBvYmpbbmFtZV07XG4gICAgICBfLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgYXJncyA9IFt0aGlzLl93cmFwcGVkXTtcbiAgICAgICAgcHVzaC5hcHBseShhcmdzLCBhcmd1bWVudHMpO1xuICAgICAgICByZXR1cm4gcmVzdWx0LmNhbGwodGhpcywgZnVuYy5hcHBseShfLCBhcmdzKSk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIEdlbmVyYXRlIGEgdW5pcXVlIGludGVnZXIgaWQgKHVuaXF1ZSB3aXRoaW4gdGhlIGVudGlyZSBjbGllbnQgc2Vzc2lvbikuXG4gIC8vIFVzZWZ1bCBmb3IgdGVtcG9yYXJ5IERPTSBpZHMuXG4gIHZhciBpZENvdW50ZXIgPSAwO1xuICBfLnVuaXF1ZUlkID0gZnVuY3Rpb24ocHJlZml4KSB7XG4gICAgdmFyIGlkID0gKytpZENvdW50ZXIgKyAnJztcbiAgICByZXR1cm4gcHJlZml4ID8gcHJlZml4ICsgaWQgOiBpZDtcbiAgfTtcblxuICAvLyBCeSBkZWZhdWx0LCBVbmRlcnNjb3JlIHVzZXMgRVJCLXN0eWxlIHRlbXBsYXRlIGRlbGltaXRlcnMsIGNoYW5nZSB0aGVcbiAgLy8gZm9sbG93aW5nIHRlbXBsYXRlIHNldHRpbmdzIHRvIHVzZSBhbHRlcm5hdGl2ZSBkZWxpbWl0ZXJzLlxuICBfLnRlbXBsYXRlU2V0dGluZ3MgPSB7XG4gICAgZXZhbHVhdGUgICAgOiAvPCUoW1xcc1xcU10rPyklPi9nLFxuICAgIGludGVycG9sYXRlIDogLzwlPShbXFxzXFxTXSs/KSU+L2csXG4gICAgZXNjYXBlICAgICAgOiAvPCUtKFtcXHNcXFNdKz8pJT4vZ1xuICB9O1xuXG4gIC8vIFdoZW4gY3VzdG9taXppbmcgYHRlbXBsYXRlU2V0dGluZ3NgLCBpZiB5b3UgZG9uJ3Qgd2FudCB0byBkZWZpbmUgYW5cbiAgLy8gaW50ZXJwb2xhdGlvbiwgZXZhbHVhdGlvbiBvciBlc2NhcGluZyByZWdleCwgd2UgbmVlZCBvbmUgdGhhdCBpc1xuICAvLyBndWFyYW50ZWVkIG5vdCB0byBtYXRjaC5cbiAgdmFyIG5vTWF0Y2ggPSAvKC4pXi87XG5cbiAgLy8gQ2VydGFpbiBjaGFyYWN0ZXJzIG5lZWQgdG8gYmUgZXNjYXBlZCBzbyB0aGF0IHRoZXkgY2FuIGJlIHB1dCBpbnRvIGFcbiAgLy8gc3RyaW5nIGxpdGVyYWwuXG4gIHZhciBlc2NhcGVzID0ge1xuICAgIFwiJ1wiOiAgICAgIFwiJ1wiLFxuICAgICdcXFxcJzogICAgICdcXFxcJyxcbiAgICAnXFxyJzogICAgICdyJyxcbiAgICAnXFxuJzogICAgICduJyxcbiAgICAnXFx0JzogICAgICd0JyxcbiAgICAnXFx1MjAyOCc6ICd1MjAyOCcsXG4gICAgJ1xcdTIwMjknOiAndTIwMjknXG4gIH07XG5cbiAgdmFyIGVzY2FwZXIgPSAvXFxcXHwnfFxccnxcXG58XFx0fFxcdTIwMjh8XFx1MjAyOS9nO1xuXG4gIC8vIEphdmFTY3JpcHQgbWljcm8tdGVtcGxhdGluZywgc2ltaWxhciB0byBKb2huIFJlc2lnJ3MgaW1wbGVtZW50YXRpb24uXG4gIC8vIFVuZGVyc2NvcmUgdGVtcGxhdGluZyBoYW5kbGVzIGFyYml0cmFyeSBkZWxpbWl0ZXJzLCBwcmVzZXJ2ZXMgd2hpdGVzcGFjZSxcbiAgLy8gYW5kIGNvcnJlY3RseSBlc2NhcGVzIHF1b3RlcyB3aXRoaW4gaW50ZXJwb2xhdGVkIGNvZGUuXG4gIF8udGVtcGxhdGUgPSBmdW5jdGlvbih0ZXh0LCBkYXRhLCBzZXR0aW5ncykge1xuICAgIHZhciByZW5kZXI7XG4gICAgc2V0dGluZ3MgPSBfLmRlZmF1bHRzKHt9LCBzZXR0aW5ncywgXy50ZW1wbGF0ZVNldHRpbmdzKTtcblxuICAgIC8vIENvbWJpbmUgZGVsaW1pdGVycyBpbnRvIG9uZSByZWd1bGFyIGV4cHJlc3Npb24gdmlhIGFsdGVybmF0aW9uLlxuICAgIHZhciBtYXRjaGVyID0gbmV3IFJlZ0V4cChbXG4gICAgICAoc2V0dGluZ3MuZXNjYXBlIHx8IG5vTWF0Y2gpLnNvdXJjZSxcbiAgICAgIChzZXR0aW5ncy5pbnRlcnBvbGF0ZSB8fCBub01hdGNoKS5zb3VyY2UsXG4gICAgICAoc2V0dGluZ3MuZXZhbHVhdGUgfHwgbm9NYXRjaCkuc291cmNlXG4gICAgXS5qb2luKCd8JykgKyAnfCQnLCAnZycpO1xuXG4gICAgLy8gQ29tcGlsZSB0aGUgdGVtcGxhdGUgc291cmNlLCBlc2NhcGluZyBzdHJpbmcgbGl0ZXJhbHMgYXBwcm9wcmlhdGVseS5cbiAgICB2YXIgaW5kZXggPSAwO1xuICAgIHZhciBzb3VyY2UgPSBcIl9fcCs9J1wiO1xuICAgIHRleHQucmVwbGFjZShtYXRjaGVyLCBmdW5jdGlvbihtYXRjaCwgZXNjYXBlLCBpbnRlcnBvbGF0ZSwgZXZhbHVhdGUsIG9mZnNldCkge1xuICAgICAgc291cmNlICs9IHRleHQuc2xpY2UoaW5kZXgsIG9mZnNldClcbiAgICAgICAgLnJlcGxhY2UoZXNjYXBlciwgZnVuY3Rpb24obWF0Y2gpIHsgcmV0dXJuICdcXFxcJyArIGVzY2FwZXNbbWF0Y2hdOyB9KTtcblxuICAgICAgaWYgKGVzY2FwZSkge1xuICAgICAgICBzb3VyY2UgKz0gXCInK1xcbigoX190PShcIiArIGVzY2FwZSArIFwiKSk9PW51bGw/Jyc6Xy5lc2NhcGUoX190KSkrXFxuJ1wiO1xuICAgICAgfVxuICAgICAgaWYgKGludGVycG9sYXRlKSB7XG4gICAgICAgIHNvdXJjZSArPSBcIicrXFxuKChfX3Q9KFwiICsgaW50ZXJwb2xhdGUgKyBcIikpPT1udWxsPycnOl9fdCkrXFxuJ1wiO1xuICAgICAgfVxuICAgICAgaWYgKGV2YWx1YXRlKSB7XG4gICAgICAgIHNvdXJjZSArPSBcIic7XFxuXCIgKyBldmFsdWF0ZSArIFwiXFxuX19wKz0nXCI7XG4gICAgICB9XG4gICAgICBpbmRleCA9IG9mZnNldCArIG1hdGNoLmxlbmd0aDtcbiAgICAgIHJldHVybiBtYXRjaDtcbiAgICB9KTtcbiAgICBzb3VyY2UgKz0gXCInO1xcblwiO1xuXG4gICAgLy8gSWYgYSB2YXJpYWJsZSBpcyBub3Qgc3BlY2lmaWVkLCBwbGFjZSBkYXRhIHZhbHVlcyBpbiBsb2NhbCBzY29wZS5cbiAgICBpZiAoIXNldHRpbmdzLnZhcmlhYmxlKSBzb3VyY2UgPSAnd2l0aChvYmp8fHt9KXtcXG4nICsgc291cmNlICsgJ31cXG4nO1xuXG4gICAgc291cmNlID0gXCJ2YXIgX190LF9fcD0nJyxfX2o9QXJyYXkucHJvdG90eXBlLmpvaW4sXCIgK1xuICAgICAgXCJwcmludD1mdW5jdGlvbigpe19fcCs9X19qLmNhbGwoYXJndW1lbnRzLCcnKTt9O1xcblwiICtcbiAgICAgIHNvdXJjZSArIFwicmV0dXJuIF9fcDtcXG5cIjtcblxuICAgIHRyeSB7XG4gICAgICByZW5kZXIgPSBuZXcgRnVuY3Rpb24oc2V0dGluZ3MudmFyaWFibGUgfHwgJ29iaicsICdfJywgc291cmNlKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBlLnNvdXJjZSA9IHNvdXJjZTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuXG4gICAgaWYgKGRhdGEpIHJldHVybiByZW5kZXIoZGF0YSwgXyk7XG4gICAgdmFyIHRlbXBsYXRlID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgcmV0dXJuIHJlbmRlci5jYWxsKHRoaXMsIGRhdGEsIF8pO1xuICAgIH07XG5cbiAgICAvLyBQcm92aWRlIHRoZSBjb21waWxlZCBmdW5jdGlvbiBzb3VyY2UgYXMgYSBjb252ZW5pZW5jZSBmb3IgcHJlY29tcGlsYXRpb24uXG4gICAgdGVtcGxhdGUuc291cmNlID0gJ2Z1bmN0aW9uKCcgKyAoc2V0dGluZ3MudmFyaWFibGUgfHwgJ29iaicpICsgJyl7XFxuJyArIHNvdXJjZSArICd9JztcblxuICAgIHJldHVybiB0ZW1wbGF0ZTtcbiAgfTtcblxuICAvLyBBZGQgYSBcImNoYWluXCIgZnVuY3Rpb24sIHdoaWNoIHdpbGwgZGVsZWdhdGUgdG8gdGhlIHdyYXBwZXIuXG4gIF8uY2hhaW4gPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gXyhvYmopLmNoYWluKCk7XG4gIH07XG5cbiAgLy8gT09QXG4gIC8vIC0tLS0tLS0tLS0tLS0tLVxuICAvLyBJZiBVbmRlcnNjb3JlIGlzIGNhbGxlZCBhcyBhIGZ1bmN0aW9uLCBpdCByZXR1cm5zIGEgd3JhcHBlZCBvYmplY3QgdGhhdFxuICAvLyBjYW4gYmUgdXNlZCBPTy1zdHlsZS4gVGhpcyB3cmFwcGVyIGhvbGRzIGFsdGVyZWQgdmVyc2lvbnMgb2YgYWxsIHRoZVxuICAvLyB1bmRlcnNjb3JlIGZ1bmN0aW9ucy4gV3JhcHBlZCBvYmplY3RzIG1heSBiZSBjaGFpbmVkLlxuXG4gIC8vIEhlbHBlciBmdW5jdGlvbiB0byBjb250aW51ZSBjaGFpbmluZyBpbnRlcm1lZGlhdGUgcmVzdWx0cy5cbiAgdmFyIHJlc3VsdCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiB0aGlzLl9jaGFpbiA/IF8ob2JqKS5jaGFpbigpIDogb2JqO1xuICB9O1xuXG4gIC8vIEFkZCBhbGwgb2YgdGhlIFVuZGVyc2NvcmUgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyIG9iamVjdC5cbiAgXy5taXhpbihfKTtcblxuICAvLyBBZGQgYWxsIG11dGF0b3IgQXJyYXkgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyLlxuICBlYWNoKFsncG9wJywgJ3B1c2gnLCAncmV2ZXJzZScsICdzaGlmdCcsICdzb3J0JywgJ3NwbGljZScsICd1bnNoaWZ0J10sIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICB2YXIgbWV0aG9kID0gQXJyYXlQcm90b1tuYW1lXTtcbiAgICBfLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIG9iaiA9IHRoaXMuX3dyYXBwZWQ7XG4gICAgICBtZXRob2QuYXBwbHkob2JqLCBhcmd1bWVudHMpO1xuICAgICAgaWYgKChuYW1lID09ICdzaGlmdCcgfHwgbmFtZSA9PSAnc3BsaWNlJykgJiYgb2JqLmxlbmd0aCA9PT0gMCkgZGVsZXRlIG9ialswXTtcbiAgICAgIHJldHVybiByZXN1bHQuY2FsbCh0aGlzLCBvYmopO1xuICAgIH07XG4gIH0pO1xuXG4gIC8vIEFkZCBhbGwgYWNjZXNzb3IgQXJyYXkgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyLlxuICBlYWNoKFsnY29uY2F0JywgJ2pvaW4nLCAnc2xpY2UnXSwgZnVuY3Rpb24obmFtZSkge1xuICAgIHZhciBtZXRob2QgPSBBcnJheVByb3RvW25hbWVdO1xuICAgIF8ucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gcmVzdWx0LmNhbGwodGhpcywgbWV0aG9kLmFwcGx5KHRoaXMuX3dyYXBwZWQsIGFyZ3VtZW50cykpO1xuICAgIH07XG4gIH0pO1xuXG4gIF8uZXh0ZW5kKF8ucHJvdG90eXBlLCB7XG5cbiAgICAvLyBTdGFydCBjaGFpbmluZyBhIHdyYXBwZWQgVW5kZXJzY29yZSBvYmplY3QuXG4gICAgY2hhaW46IGZ1bmN0aW9uKCkge1xuICAgICAgdGhpcy5fY2hhaW4gPSB0cnVlO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIC8vIEV4dHJhY3RzIHRoZSByZXN1bHQgZnJvbSBhIHdyYXBwZWQgYW5kIGNoYWluZWQgb2JqZWN0LlxuICAgIHZhbHVlOiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiB0aGlzLl93cmFwcGVkO1xuICAgIH1cblxuICB9KTtcblxufSkuY2FsbCh0aGlzKTtcblxufSkoKSIsInZhciByeCA9IHJlcXVpcmUoJ3J4anMnKTtcbnZhciByb3V0aWUgPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9yb3V0aWUnKTtcbnZhciBwbGF5ZXIgPSByZXF1aXJlKCcuLi9wbGF5ZXInKTtcbnZhciB2aWV3ID0gcmVxdWlyZSgnLi4vLi4vdmlld3MvbG9iYnkuaGJzJyk7XG5yZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9yeC56ZXB0bycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICBcbiAgaWYgKHBsYXllci5nZXQoKS5pZCA9PSB1bmRlZmluZWQpIHtcbiAgICByb3V0aWUubmF2aWdhdGUoJy9jb25uZWN0Jyk7XG4gIH1cbiAgXG4gICQoJyNwYWdlJykuYXR0cignY2xhc3MnLCAnbG9iYnknKTtcbiAgJCgnI3BhZ2UnKS5odG1sKHZpZXcoKSk7XG4gICQoJyNjYW5jZWwnKS5vbignY2xpY2snLCBleGl0TG9iYnkpO1xuXG4gIHZhciBvYnNlcnZhYmxlID0gcnguT2JzZXJ2YWJsZVxuICAgIC5pbnRlcnZhbCgxMDAwKVxuICAgIC5zdGFydFdpdGgoLTEpXG4gICAgLnNlbGVjdE1hbnkob2JzZXJ2YWJsZUxvYmJ5KVxuICAgIC5za2lwV2hpbGUod2FpdGluZ0Zvck90aGVyUGxheWVyKVxuICAgIC50YWtlKDEpXG4gICAgLnN1YnNjcmliZShzdGFydE1hdGNoLCBvbkVycm9yKTtcblxufTtcblxuZnVuY3Rpb24gb2JzZXJ2YWJsZUxvYmJ5KCkge1xuICByZXR1cm4gJC5nZXRKU09OQXNPYnNlcnZhYmxlKCcvZ2FtZS9zdGF0dXMnKTtcbn1cblxuZnVuY3Rpb24gd2FpdGluZ0Zvck90aGVyUGxheWVyKHJlcykge1xuICByZXR1cm4gcmVzLmRhdGEuaW5Qcm9ncmVzcyA9PT0gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIHN0YXJ0TWF0Y2goKSB7XG4gIHJvdXRpZS5uYXZpZ2F0ZSgnL2dhbWVwYWQnKTtcbn1cblxuZnVuY3Rpb24gb25FcnJvcigpIHtcbiAgY29uc29sZS5sb2coJ0dhbWUgbm90IHJlc3BvbmRpbmcnKTtcbn1cblxuZnVuY3Rpb24gZXhpdExvYmJ5KCkge1xuICAkLmFqYXgoe1xuICAgIHR5cGU6ICdERUxFVEUnLFxuICAgIHVybDogJy9nYW1lL3BsYXllcnMvJyArIHBsYXllci5nZXQoKS5pZFxuICB9KS50aGVuKGJhY2tUb1dhaXQpO1xufVxuXG5mdW5jdGlvbiBiYWNrVG9XYWl0KCkge1xuICByb3V0aWUubmF2aWdhdGUoJy93YWl0Jyk7XG59XG4iLCJ2YXIgcnggPSByZXF1aXJlKCdyeGpzJyk7XG52YXIgcm91dGllID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvcm91dGllJyk7XG52YXIgcGxheWVyID0gcmVxdWlyZSgnLi4vcGxheWVyJyk7XG52YXIgdmlldyA9IHJlcXVpcmUoJy4uLy4uL3ZpZXdzL2dhbWVwYWQuaGJzJyk7XG52YXIgb2JzZXJ2YWJsZSA9IG51bGw7XG52YXIgc29ja2V0ID0gbnVsbFxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuXG4gIGlmIChwbGF5ZXIuZ2V0KCkuaWQgPT0gdW5kZWZpbmVkKSB7XG4gICAgcm91dGllLm5hdmlnYXRlKCcvY29ubmVjdCcpO1xuICB9XG5cbiAgc29ja2V0ID0gaW8uY29ubmVjdCgnLycpXG4gIFxuICAkKCcjcGFnZScpLmF0dHIoJ2NsYXNzJywgJ2dhbWVwYWQnKTtcbiAgJCgnI3BhZ2UnKS5odG1sKHZpZXcoKSk7XG5cbiAgb2JzZXJ2YWJsZSA9IHJ4Lk9ic2VydmFibGVcbiAgICAuaW50ZXJ2YWwoMjAwMClcbiAgICAuc3RhcnRXaXRoKC0xKVxuICAgIC5zZWxlY3RNYW55KG9ic2VydmFibGVHYW1lKVxuICAgIC5zdWJzY3JpYmUoY2hlY2tHYW1lU3RhdHVzLCBvbkVycm9yKTtcblxuICBpZiAoJ29udG91Y2hzdGFydCcgaW4gd2luZG93KSB7XG4gICAgJCgnLnVwJykub24oJ3RvdWNoc3RhcnQnLCBnb1VwKTtcbiAgICAkKCcudXAnKS5vbigndG91Y2hlbmQnLCBzdG9wKTtcbiAgICAkKCcuZG93bicpLm9uKCd0b3VjaHN0YXJ0JywgZ29Eb3duKTtcbiAgICAkKCcuZG93bicpLm9uKCd0b3VjaGVuZCcsIHN0b3ApO1xuICB9IGVsc2Uge1xuICAgICQoJy51cCcpLm9uKCdtb3VzZWRvd24nLCBnb1VwKTtcbiAgICAkKCcudXAnKS5vbignbW91c2V1cCcsIHN0b3ApO1xuICAgICQoJy5kb3duJykub24oJ21vdXNlZG93bicsIGdvRG93bik7XG4gICAgJCgnLmRvd24nKS5vbignbW91c2V1cCcsIHN0b3ApO1xuICB9XG59O1xuXG5mdW5jdGlvbiBnb1VwKGUpIHtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAkKGUuY3VycmVudFRhcmdldCkuYWRkQ2xhc3MoJ3ByZXNzZWQnKTtcbiAgc2VuZEFjdGlvbigndXAnKTtcbn1cblxuZnVuY3Rpb24gZ29Eb3duKGUpIHtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAkKGUuY3VycmVudFRhcmdldCkuYWRkQ2xhc3MoJ3ByZXNzZWQnKTtcbiAgc2VuZEFjdGlvbignZG93bicpO1xufVxuXG5mdW5jdGlvbiBzdG9wKGUpIHtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAkKGUuY3VycmVudFRhcmdldCkucmVtb3ZlQ2xhc3MoJ3ByZXNzZWQnKTtcbn1cblxuZnVuY3Rpb24gc2VuZEFjdGlvbihhY3Rpb25OYW1lKSB7XG4gIHNvY2tldC5lbWl0KCdtb3ZlJywgeyBwbGF5ZXI6IHBsYXllci5nZXQoKS5pZCwgYWN0aW9uOiBhY3Rpb25OYW1lIH0pXG59XG5cbmZ1bmN0aW9uIG9ic2VydmFibGVHYW1lKCkge1xuICByZXR1cm4gJC5nZXRKU09OQXNPYnNlcnZhYmxlKCcvZ2FtZS9zdGF0dXMnKTtcbn1cblxuZnVuY3Rpb24gY2hlY2tHYW1lU3RhdHVzKHJlcykge1xuICBpZiAocmVzLmRhdGEuaW5Qcm9ncmVzcykge1xuICAgIHZhciBpZHggPSBjdXJyZW50UGxheWVySW5kZXgocmVzLmRhdGEucGxheWVycyk7XG4gICAgaWYgKGlkeCA9PT0gbnVsbCkge1xuICAgICAgb2JzZXJ2YWJsZS5kaXNwb3NlKCk7XG4gICAgICByb3V0aWUubmF2aWdhdGUoJy93YWl0Jyk7XG4gICAgfSBlbHNlIHtcbiAgICAgICQoJyNwYWdlIC5wbGF5ZXInKS5hZGRDbGFzcygncCcgKyAoaWR4KzEpKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgb2JzZXJ2YWJsZS5kaXNwb3NlKCk7XG4gICAgcm91dGllLm5hdmlnYXRlKCcvam9pbicpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGN1cnJlbnRQbGF5ZXJJbmRleChwbGF5ZXJzKSB7XG4gIGlmIChwbGF5ZXJzWzBdLmlkID09PSBwbGF5ZXIuZ2V0KCkuaWQpIHJldHVybiAwO1xuICBpZiAocGxheWVyc1sxXS5pZCA9PT0gcGxheWVyLmdldCgpLmlkKSByZXR1cm4gMTtcbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIG9uRXJyb3IoKSB7XG4gIGNvbnNvbGUubG9nKCdHYW1lIG5vdCByZXNwb25kaW5nJyk7XG59XG4iLCJ2YXIgcnggPSByZXF1aXJlKCdyeGpzJyk7XG52YXIgcm91dGllID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvcm91dGllJyk7XG52YXIgcGxheWVyID0gcmVxdWlyZSgnLi4vcGxheWVyJyk7XG52YXIgdmlldyA9IHJlcXVpcmUoJy4uLy4uL3ZpZXdzL3dhaXQuaGJzJyk7XG5yZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9yeC56ZXB0bycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICBcbiAgaWYgKHBsYXllci5nZXQoKS5pZCA9PSB1bmRlZmluZWQpIHtcbiAgICByb3V0aWUubmF2aWdhdGUoJy9jb25uZWN0Jyk7XG4gIH1cbiAgXG4gICQoJyNwYWdlJykuYXR0cignY2xhc3MnLCAnd2FpdCcpO1xuICAkKCcjcGFnZScpLmh0bWwodmlldygpKTtcblxuICB2YXIgb2JzZXJ2YWJsZSA9IHJ4Lk9ic2VydmFibGVcbiAgICAuaW50ZXJ2YWwoMzAwMClcbiAgICAuc3RhcnRXaXRoKC0xKVxuICAgIC5zZWxlY3RNYW55KG9ic2VydmFibGVMb2JieSlcbiAgICAuc2tpcFdoaWxlKGdhbWVJblByb2dyZXNzKVxuICAgIC50YWtlKDEpXG4gICAgLnN1YnNjcmliZShzd2l0Y2hTdGF0ZSwgb25FcnJvcik7XG5cbn07XG5cbmZ1bmN0aW9uIG9ic2VydmFibGVMb2JieSgpIHtcbiAgcmV0dXJuICQuZ2V0SlNPTkFzT2JzZXJ2YWJsZSgnL2dhbWUvc3RhdHVzJyk7XG59XG5cbmZ1bmN0aW9uIGdhbWVJblByb2dyZXNzKHJlcykge1xuICByZXR1cm4gcmVzLmRhdGEuaW5Qcm9ncmVzcyA9PT0gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gc3dpdGNoU3RhdGUoKSB7XG4gIHJvdXRpZS5uYXZpZ2F0ZSgnL2pvaW4nKTtcbn1cblxuZnVuY3Rpb24gb25FcnJvcigpIHtcbiAgY29uc29sZS5sb2coJ0dhbWUgbm90IHJlc3BvbmRpbmcnKTtcbn1cbiIsIihmdW5jdGlvbigpey8vIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IE9wZW4gVGVjaG5vbG9naWVzLCBJbmMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuKGZ1bmN0aW9uIChyb290LCBmYWN0b3J5KSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KHJvb3QsIG1vZHVsZS5leHBvcnRzLCByZXF1aXJlKCdyeGpzJyksICQpO1xufSh0aGlzLCBmdW5jdGlvbiAoZ2xvYmFsLCBleHAsIHJvb3QsICQsIHVuZGVmaW5lZCkge1xuICAgICAgICAvLyBIZWFkZXJzXG4gICAgdmFyIHJvb3QgPSBnbG9iYWwuUngsXG4gICAgICAgIG9ic2VydmFibGUgPSByb290Lk9ic2VydmFibGUsXG4gICAgICAgIG9ic2VydmFibGVQcm90byA9IG9ic2VydmFibGUucHJvdG90eXBlLFxuICAgICAgICBBc3luY1N1YmplY3QgPSByb290LkFzeW5jU3ViamVjdCxcbiAgICAgICAgb2JzZXJ2YWJsZUNyZWF0ZSA9IG9ic2VydmFibGUuY3JlYXRlLFxuICAgICAgICBvYnNlcnZhYmxlQ3JlYXRlV2l0aERpc3Bvc2FibGUgPSBvYnNlcnZhYmxlLmNyZWF0ZVdpdGhEaXNwb3NhYmxlLFxuICAgICAgICBkaXNwb3NhYmxlRW1wdHkgPSByb290LkRpc3Bvc2FibGUuZW1wdHksXG4gICAgICAgIHNsaWNlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLFxuICAgICAgICBwcm90byA9ICQuZm47XG4gICAgICAgIFxuICAgICQuRGVmZXJyZWQucHJvdG90eXBlLnRvT2JzZXJ2YWJsZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHN1YmplY3QgPSBuZXcgQXN5bmNTdWJqZWN0KCk7XG4gICAgICAgIHRoaXMuZG9uZShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzdWJqZWN0Lm9uTmV4dChzbGljZS5jYWxsKGFyZ3VtZW50cykpO1xuICAgICAgICAgICAgc3ViamVjdC5vbkNvbXBsZXRlZCgpO1xuICAgICAgICB9KS5mYWlsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHN1YmplY3Qub25FcnJvcihzbGljZS5jYWxsKGFyZ3VtZW50cykpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHN1YmplY3Q7XG4gICAgfTtcblxuICAgIG9ic2VydmFibGVQcm90by50b0RlZmVycmVkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSAkLkRlZmVycmVkKCk7XG4gICAgICAgIHRoaXMuc3Vic2NyaWJlKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh2YWx1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlKSB7IFxuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGUpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkO1xuICAgIH07XG5cbiAgICB2YXIgYWpheEFzT2JzZXJ2YWJsZSA9ICQuYWpheEFzT2JzZXJ2YWJsZSA9IGZ1bmN0aW9uKHNldHRpbmdzKSB7XG4gICAgICAgIHZhciBzdWJqZWN0ID0gbmV3IEFzeW5jU3ViamVjdCgpO1xuXG4gICAgICAgIHZhciBpbnRlcm5hbFNldHRpbmdzID0ge1xuICAgICAgICAgICAgc3VjY2VzczogZnVuY3Rpb24oZGF0YSwgdGV4dFN0YXR1cywganFYSFIpIHtcbiAgICAgICAgICAgICAgICBzdWJqZWN0Lm9uTmV4dCh7IGRhdGE6IGRhdGEsIHRleHRTdGF0dXM6IHRleHRTdGF0dXMsIGpxWEhSOiBqcVhIUiB9KTtcbiAgICAgICAgICAgICAgICBzdWJqZWN0Lm9uQ29tcGxldGVkKCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZXJyb3I6IGZ1bmN0aW9uKGpxWEhSLCB0ZXh0U3RhdHVzLCBlcnJvclRocm93bikge1xuICAgICAgICAgICAgICAgIHN1YmplY3Qub25FcnJvcih7IGpxWEhSOiBqcVhIUiwgdGV4dFN0YXR1czogdGV4dFN0YXR1cywgZXJyb3JUaHJvd246IGVycm9yVGhyb3duIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgJC5leHRlbmQodHJ1ZSwgaW50ZXJuYWxTZXR0aW5ncywgc2V0dGluZ3MpO1xuXG4gICAgICAgICQuYWpheChpbnRlcm5hbFNldHRpbmdzKTtcblxuICAgICAgICByZXR1cm4gc3ViamVjdDtcbiAgICB9O1xuXG4gICAgJC5nZXRBc09ic2VydmFibGUgPSBmdW5jdGlvbih1cmwsIGRhdGEsIGRhdGFUeXBlKSB7XG4gICAgICAgIHJldHVybiBhamF4QXNPYnNlcnZhYmxlKHsgdXJsOiB1cmwsIGRhdGFUeXBlOiBkYXRhVHlwZSwgZGF0YTogZGF0YSB9KTtcbiAgICB9O1xuXG4gICAgJC5nZXRKU09OQXNPYnNlcnZhYmxlID0gZnVuY3Rpb24odXJsLCBkYXRhKSB7XG4gICAgICAgIHJldHVybiBhamF4QXNPYnNlcnZhYmxlKHsgdXJsOiB1cmwsIGRhdGFUeXBlOiAnanNvbicsIGRhdGE6IGRhdGEgfSk7XG4gICAgfTtcblxuXG4gICAgJC5wb3N0QXNPYnNlcnZhYmxlID0gZnVuY3Rpb24odXJsLCBkYXRhLCBkYXRhVHlwZSkge1xuICAgICAgICByZXR1cm4gYWpheEFzT2JzZXJ2YWJsZSh7IHVybDogdXJsLCBkYXRhVHlwZTogZGF0YVR5cGUsIGRhdGE6IGRhdGEsIHR5cGU6ICdQT1NUJ30pO1x0XG4gICAgfTtcblxuICAgIHJldHVybiByb290O1xuXG59KSk7XG5cbn0pKCkiLCJ2YXIgSGFuZGxlYmFycyA9IHJlcXVpcmUoJ2hhbmRsZWJhcnMtcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICBcblxuXG4gIHJldHVybiBcIlxcbjxoMT53YWl0aW5nIGZvciAybmQgcGxheWVyPC9oMT5cXG5cXG48YnV0dG9uIGlkPVxcXCJjYW5jZWxcXFwiIG9udG91Y2hzdGFydD1cXFwiXFxcIj5jYW5jZWw8L2J1dHRvbj5cXG5cIjtcbiAgfSk7XG4iLCJ2YXIgSGFuZGxlYmFycyA9IHJlcXVpcmUoJ2hhbmRsZWJhcnMtcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICBcblxuXG4gIHJldHVybiBcIlxcbjxoMT5SZWdpc3RlciBUbyBQbGF5PC9oMT5cXG5cXG48Zm9ybT5cXG4gIFxcbiAgPGRpdiBjbGFzcz1cXFwiZmllbGRcXFwiPlxcbiAgICA8bGFiZWw+Rmlyc3QgbmFtZTwvbGFiZWw+XFxuICAgIDxpbnB1dCBpZD1cXFwiZmlyc3ROYW1lXFxcIiB0eXBlPVxcXCJ0ZXh0XFxcIiB2YWx1ZT1cXFwiXFxcIiBhdXRvY29ycmVjdD1cXFwib2ZmXFxcIiAvPlxcbiAgPC9kaXY+XFxuICBcXG4gIDxkaXYgY2xhc3M9XFxcImZpZWxkXFxcIj5cXG4gICAgPGxhYmVsPkxhc3QgbmFtZTwvbGFiZWw+XFxuICAgIDxpbnB1dCBpZD1cXFwibGFzdE5hbWVcXFwiIHR5cGU9XFxcInRleHRcXFwiIHZhbHVlPVxcXCJcXFwiIGF1dG9jb3JyZWN0PVxcXCJvZmZcXFwiIC8+XFxuICA8L2Rpdj5cXG5cXG4gIDxkaXYgY2xhc3M9XFxcImZpZWxkXFxcIj5cXG4gICAgPGxhYmVsPkVtYWlsPC9sYWJlbD5cXG4gICAgPGlucHV0IGlkPVxcXCJlbWFpbFxcXCIgdHlwZT1cXFwiZW1haWxcXFwiIHZhbHVlPVxcXCJcXFwiIGF1dG9jb3JyZWN0PVxcXCJvZmZcXFwiIC8+XFxuICA8L2Rpdj5cXG4gIFxcbiAgPGRpdiBjbGFzcz1cXFwiZmllbGRcXFwiPlxcbiAgICA8bGFiZWw+Q29tcGFueTwvbGFiZWw+XFxuICAgIDxpbnB1dCBpZD1cXFwiY29tcGFueVxcXCIgdHlwZT1cXFwidGV4dFxcXCIgdmFsdWU9XFxcIlxcXCIgYXV0b2NvcnJlY3Q9XFxcIm9mZlxcXCIgLz5cXG4gIDwvZGl2PlxcbiAgXFxuICA8ZGl2IGNsYXNzPVxcXCJmaWVsZFxcXCI+XFxuICAgIDxsYWJlbD5Sb2xlPC9sYWJlbD5cXG5cdDxzZWxlY3QgcmVxdWlyZWQgaWQ9XFxcInJvbGVcXFwiPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU2VsZWN0IFJvbGVcXFwiIHNlbGVjdGVkPlNlbGVjdCBSb2xlPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJDLUxldmVsIEV4ZWN1dGl2ZVxcXCI+Qy1MZXZlbCBFeGVjdXRpdmU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlZQIG9yIERpcmVjdG9yXFxcIj5WUCBvciBEaXJlY3Rvcjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTWFuYWdlclxcXCI+TWFuYWdlcjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUHJvamVjdCBNYW5hZ2VyXFxcIj5Qcm9qZWN0IE1hbmFnZXI8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRlYW0gTGVhZFxcXCI+VGVhbSBMZWFkPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBcmNoaXRlY3RcXFwiPkFyY2hpdGVjdDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiRGV2ZWxvcGVyXFxcIj5EZXZlbG9wZXI8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkNvbnN1bHRhbnRcXFwiPkNvbnN1bHRhbnQ8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlN0dWRlbnRcXFwiPlN0dWRlbnQ8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlByZXNzL0FuYWx5c3RcXFwiPlByZXNzL0FuYWx5c3Q8L29wdGlvbj5cXG5cdDwvc2VsZWN0PlxcbiAgPC9kaXY+XFxuXFxuICA8ZGl2IGNsYXNzPVxcXCJmaWVsZFxcXCI+XFxuICAgIDxsYWJlbD5Db3VudHJ5PC9sYWJlbD5cXG5cdDxzZWxlY3QgcmVxdWlyZWQgaWQ9XFxcImNvdW50cnlcXFwiPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU2VsZWN0IENvdW50cnlcXFwiIHNlbGVjdGVkPlNlbGVjdCBDb3VudHJ5PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJES1xcXCI+RGVubWFyazwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR0JcXFwiPlVuaXRlZCBLaW5nZG9tPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBTFxcXCI+QWxiYW5pYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQURcXFwiPkFuZG9ycmE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkFUXFxcIj5BdXN0cmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCWVxcXCI+QmVsYXJ1czwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQkVcXFwiPkJlbGdpdW08L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJBXFxcIj5Cb3NuaWEgYW5kIEhlcnplZ292aW5hPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCR1xcXCI+QnVsZ2FyaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkhSXFxcIj5Dcm9hdGlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJDWVxcXCI+Q3lwcnVzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJDWlxcXCI+Q3plY2ggUmVwdWJsaWM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkVFXFxcIj5Fc3RvbmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJGSVxcXCI+RmlubGFuZDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiRlJcXFwiPkZyYW5jZTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiREVcXFwiPkdlcm1hbnk8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkdSXFxcIj5HcmVlY2U8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkhVXFxcIj5IdW5nYXJ5PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJJU1xcXCI+SWNlbGFuZDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSUVcXFwiPklyZWxhbmQ8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIklUXFxcIj5JdGFseTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTFZcXFwiPkxhdHZpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTElcXFwiPkxpZWNodGVuc3RlaW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkxUXFxcIj5MaXRodWFuaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkxVXFxcIj5MdXhlbWJvdXJnPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNYWNlZG9uaWFcXFwiPk1hY2Vkb25pYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTVRcXFwiPk1hbHRhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNb2xkb3ZhXFxcIj5Nb2xkb3ZhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNQ1xcXCI+TW9uYWNvPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNRVxcXCI+TW9udGVuZWdybzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTkxcXFwiPk5ldGhlcmxhbmRzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJOT1xcXCI+Tm9yd2F5PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJQTFxcXCI+UG9sYW5kPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJQVFxcXCI+UG9ydHVnYWw8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlJPXFxcIj5Sb21hbmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJSU1xcXCI+U2VyYmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTS1xcXCI+U2xvdmFraWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNJXFxcIj5TbG92ZW5pYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiRVNcXFwiPlNwYWluPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTRVxcXCI+U3dlZGVuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJDSFxcXCI+U3dpdHplcmxhbmQ8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRSXFxcIj5UdXJrZXk8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlVBXFxcIj5Va3JhaW5lPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBRlxcXCI+QWZnaGFuaXN0YW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkFYXFxcIj7DhWxhbmQgSXNsYW5kczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiRFpcXFwiPkFsZ2VyaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkFTXFxcIj5BbWVyaWNhbiBTYW1vYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQU9cXFwiPkFuZ29sYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQUlcXFwiPkFuZ3VpbGxhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBUVxcXCI+QW50YXJjdGljYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQUdcXFwiPkFudGlndWEgYW5kIEJhcmJ1ZGE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkFSXFxcIj5BcmdlbnRpbmE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkFNXFxcIj5Bcm1lbmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBV1xcXCI+QXJ1YmE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkFVXFxcIj5BdXN0cmFsaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkFaXFxcIj5BemVyYmFpamFuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCU1xcXCI+QmFoYW1hczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQkhcXFwiPkJhaHJhaW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJEXFxcIj5CYW5nbGFkZXNoPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCQlxcXCI+QmFyYmFkb3M8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJaXFxcIj5CZWxpemU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJKXFxcIj5CZW5pbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQk1cXFwiPkJlcm11ZGE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJUXFxcIj5CaHV0YW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJvbGl2aWFcXFwiPkJvbGl2aWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJXXFxcIj5Cb3Rzd2FuYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQlZcXFwiPkJvdXZldCBJc2xhbmQ8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJSXFxcIj5CcmF6aWw8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJOXFxcIj5CcnVuZWkgRGFydXNzYWxhbTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQ1VcXFwiPkN1YmE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkRKXFxcIj5Eamlib3V0aTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiRE1cXFwiPkRvbWluaWNhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJET1xcXCI+RG9taW5pY2FuIFJlcHVibGljPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJFQ1xcXCI+RWN1YWRvcjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiRUdcXFwiPkVneXB0PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTVlxcXCI+RWwgU2FsdmFkb3I8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkdRXFxcIj5FcXVhdG9yaWFsIEd1aW5lYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiRVJcXFwiPkVyaXRyZWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkdGXFxcIj5GcmVuY2ggR3VpYW5hPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJQRlxcXCI+RnJlbmNoIFBvbHluZXNpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR0FcXFwiPkdhYm9uPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHTVxcXCI+R2FtYmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHRVxcXCI+R2VvcmdpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR0hcXFwiPkdoYW5hPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHSVxcXCI+R2licmFsdGFyPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHTFxcXCI+R3JlZW5sYW5kPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHRFxcXCI+R3JlbmFkYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR1BcXFwiPkd1YWRlbG91cGU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkdVXFxcIj5HdWFtPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHVFxcXCI+R3VhdGVtYWxhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHR1xcXCI+R3Vlcm5zZXk8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkdOXFxcIj5HdWluZWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkdXXFxcIj5HdWluZWEtQmlzc2F1PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHWVxcXCI+R3V5YW5hPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJIVFxcXCI+SGFpdGk8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkhOXFxcIj5Ib25kdXJhczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSEtcXFwiPkhvbmcgS29uZzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSU5cXFwiPkluZGlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJJRFxcXCI+SW5kb25lc2lhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJJcmFuXFxcIj5JcmFuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJJUVxcXCI+SXJhcTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSU1cXFwiPklzbGUgb2YgTWFuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJJTFxcXCI+SXNyYWVsPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJKTVxcXCI+SmFtYWljYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSlBcXFwiPkphcGFuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJKRVxcXCI+SmVyc2V5PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJKT1xcXCI+Sm9yZGFuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJLWlxcXCI+S2F6YWtoc3Rhbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiS0VcXFwiPktlbnlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJLSVxcXCI+S2lyaWJhdGk8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIktvcmVhXFxcIj5SZXB1YmxpYyBvZiBLb3JlYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiS29yZWFcXFwiPkRlbW9jcmF0aWMgUGVvcGxlJ3MgUmVwdWJsaWMgb2YgS29yZWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIktXXFxcIj5LdXdhaXQ8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIktHXFxcIj5LeXJneXpzdGFuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJMQVxcXCI+TGFvczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTEJcXFwiPkxlYmFub248L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkxTXFxcIj5MZXNvdGhvPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJMUlxcXCI+TGliZXJpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTFlcXFwiPkxpYnlhbiBBcmFiIEphbWFoaXJpeWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1PXFxcIj5NYWNhbzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTUdcXFwiPk1hZGFnYXNjYXI8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1XXFxcIj5NYWxhd2k8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1ZXFxcIj5NYWxheXNpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTVZcXFwiPk1hbGRpdmVzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNTFxcXCI+TWFsaTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTUhcXFwiPk1hcnNoYWxsIElzbGFuZHM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1RXFxcIj5NYXJ0aW5pcXVlPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNUlxcXCI+TWF1cml0YW5pYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTVVcXFwiPk1hdXJpdGl1czwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiWVRcXFwiPk1heW90dGU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1YXFxcIj5NZXhpY288L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1pY3JvbmVzaWFcXFwiPk1pY3JvbmVzaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1OXFxcIj5Nb25nb2xpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTVNcXFwiPk1vbnRzZXJyYXQ8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1BXFxcIj5Nb3JvY2NvPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNWlxcXCI+TW96YW1iaXF1ZTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTU1cXFwiPk15YW5tYXI8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk5BXFxcIj5OYW1pYmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJOUlxcXCI+TmF1cnU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk5QXFxcIj5OZXBhbDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQU5cXFwiPk5ldGhlcmxhbmRzIEFudGlsbGVzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJOQ1xcXCI+TmV3IENhbGVkb25pYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTlpcXFwiPk5ldyBaZWFsYW5kPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJOSVxcXCI+TmljYXJhZ3VhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJORVxcXCI+TmlnZXI8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk5HXFxcIj5OaWdlcmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJOVVxcXCI+Tml1ZTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTkZcXFwiPk5vcmZvbGsgSXNsYW5kPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNUFxcXCI+Tm9ydGhlcm4gTWFyaWFuYSBJc2xhbmRzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJPTVxcXCI+T21hbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUEtcXFwiPlBha2lzdGFuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJQV1xcXCI+UGFsYXU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlBhbGVzdGluZVxcXCI+UGFsZXN0aW5lPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJQQVxcXCI+UGFuYW1hPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJQR1xcXCI+UGFwdWEgTmV3IEd1aW5lYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUFlcXFwiPlBhcmFndWF5PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJQRVxcXCI+UGVydTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUEhcXFwiPlBoaWxpcHBpbmVzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJQTlxcXCI+UGl0Y2Fpcm48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlBSXFxcIj5QdWVydG8gUmljbzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUUFcXFwiPlFhdGFyPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJSRVxcXCI+UsOpdW5pb248L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlJVXFxcIj5SdXNzaWFuIEZlZGVyYXRpb248L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlJXXFxcIj5Sd2FuZGE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJMXFxcIj5TYWludCBCYXJ0aMOpbGVteTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU0hcXFwiPlNhaW50IEhlbGVuYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiS05cXFwiPlNhaW50IEtpdHRzIGFuZCBOZXZpczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTENcXFwiPlNhaW50IEx1Y2lhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNRlxcXCI+U2FpbnQgTWFydGluPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJQTVxcXCI+U2FpbnQgUGllcnJlIGFuZCBNaXF1ZWxvbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVkNcXFwiPlNhaW50IFZpbmNlbnQgYW5kIFRoZSBHcmVuYWRpbmVzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJXU1xcXCI+U2Ftb2E8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNNXFxcIj5TYW4gTWFyaW5vPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTVFxcXCI+U2FvIFRvbWUgYW5kIFByaW5jaXBlPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTQVxcXCI+U2F1ZGkgQXJhYmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTTlxcXCI+U2VuZWdhbDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU0NcXFwiPlNleWNoZWxsZXM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNMXFxcIj5TaWVycmEgTGVvbmU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNHXFxcIj5TaW5nYXBvcmU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNCXFxcIj5Tb2xvbW9uIElzbGFuZHM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNPXFxcIj5Tb21hbGlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJaQVxcXCI+U291dGggQWZyaWNhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJMS1xcXCI+U3JpIExhbmthPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTRFxcXCI+U3VkYW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNSXFxcIj5TdXJpbmFtZTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU0pcXFwiPlN2YWxiYXJkIGFuZCBKYW4gTWF5ZW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNaXFxcIj5Td2F6aWxhbmQ8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRhaXdhblxcXCI+VGFpd2FuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJUSlxcXCI+VGFqaWtpc3Rhbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVGFuemFuaWFcXFwiPlRhbnphbmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJUSFxcXCI+VGhhaWxhbmQ8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRMXFxcIj5UaW1vci1MZXN0ZTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVEdcXFwiPlRvZ288L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRLXFxcIj5Ub2tlbGF1PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJUT1xcXCI+VG9uZ2E8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRUXFxcIj5UcmluaWRhZCBhbmQgVG9iYWdvPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJUTlxcXCI+VHVuaXNpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVE1cXFwiPlR1cmttZW5pc3Rhbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVENcXFwiPlR1cmtzIGFuZCBDYWljb3MgSXNsYW5kczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVFZcXFwiPlR1dmFsdTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVUdcXFwiPlVnYW5kYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQUVcXFwiPlVuaXRlZCBBcmFiIEVtaXJhdGVzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJVU1xcXCI+VW5pdGVkIFN0YXRlczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVVlcXFwiPlVydWd1YXk8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlVaXFxcIj5VemJla2lzdGFuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJWVVxcXCI+VmFudWF0dTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVkFcXFwiPlZhdGljYW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlZlbmV6dWVsYVxcXCI+VmVuZXp1ZWxhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJWTlxcXCI+VmlldCBOYW08L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlZpcmdpbiBJc2xhbmRzXFxcIj5WaXJnaW4gSXNsYW5kczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVmlyZ2luIElzbGFuZHNcXFwiPlZpcmdpbiBJc2xhbmRzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJWSVxcXCI+VS5TLjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiV0ZcXFwiPldhbGxpcyBhbmQgRnV0dW5hPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJFSFxcXCI+V2VzdGVybiBTYWhhcmE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIllFXFxcIj5ZZW1lbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiWk1cXFwiPlphbWJpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiWldcXFwiPlppbWJhYndlPC9vcHRpb24+PC9zZWxlY3Q+XFxuICA8L2Rpdj5cXG4gIFxcbiAgPGJ1dHRvbj5QbGF5ITwvYnV0dG9uPlxcbiAgXFxuPC9mb3JtPlxcblwiO1xuICB9KTtcbiIsInZhciBIYW5kbGViYXJzID0gcmVxdWlyZSgnaGFuZGxlYmFycy1ydW50aW1lJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnMudGVtcGxhdGUoZnVuY3Rpb24gKEhhbmRsZWJhcnMsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICB0aGlzLmNvbXBpbGVySW5mbyA9IFs0LCc+PSAxLjAuMCddO1xuaGVscGVycyA9IHRoaXMubWVyZ2UoaGVscGVycywgSGFuZGxlYmFycy5oZWxwZXJzKTsgZGF0YSA9IGRhdGEgfHwge307XG4gIFxuXG5cbiAgcmV0dXJuIFwiXFxuPGgxPlByZXNzIHN0YXJ0IHRvIGpvaW4gdGhlIGdhbWU8L2gxPlxcblxcbjxidXR0b24gaWQ9XFxcImpvaW5cXFwiIG9udG91Y2hzdGFydD1cXFwiXFxcIj5TdGFydDwvYnV0dG9uPlxcblwiO1xuICB9KTtcbiIsInZhciBIYW5kbGViYXJzID0gcmVxdWlyZSgnaGFuZGxlYmFycy1ydW50aW1lJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnMudGVtcGxhdGUoZnVuY3Rpb24gKEhhbmRsZWJhcnMsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICB0aGlzLmNvbXBpbGVySW5mbyA9IFs0LCc+PSAxLjAuMCddO1xuaGVscGVycyA9IHRoaXMubWVyZ2UoaGVscGVycywgSGFuZGxlYmFycy5oZWxwZXJzKTsgZGF0YSA9IGRhdGEgfHwge307XG4gIFxuXG5cbiAgcmV0dXJuIFwiPGRpdiBjbGFzcz1cXFwicGxheWVyXFxcIj5cXG5cXG48ZGl2IGNsYXNzPVxcXCJkZXZpY2UtYmFja2dyb3VuZFxcXCI+PC9kaXY+XFxuIFxcbiAgPGRpdiBjbGFzcz1cXFwiZGV2aWNlIGNsZWFyZml4XFxcIj5cXG4gICAgPGRpdiBjbGFzcz1cXFwiY29udHJvbGxlciBjbGVhcmZpeFxcXCI+XFxuICAgICAgPGRpdiBjbGFzcz1cXFwiYnV0dG9uXFxcIj5cXG4gICAgICAgIDxkaXYgY2xhc3M9XFxcInVwXFxcIj48aSBjbGFzcz1cXFwiaWNvbi1jYXJldC11cFxcXCI+PC9pPjwvZGl2PlxcbiAgICAgIDwvZGl2PlxcbiAgICAgIDxkaXYgY2xhc3M9XFxcImJ1dHRvblxcXCI+XFxuICAgICAgICA8ZGl2IGNsYXNzPVxcXCJkb3duXFxcIj48aSBjbGFzcz1cXFwiaWNvbi1jYXJldC1kb3duXFxcIj48L2k+PC9kaXY+XFxuICAgICAgPC9kaXY+XFxuICAgIDwvZGl2PlxcbiAgPC9kaXY+XFxuXFxuPC9kaXY+XFxuXFxuXCI7XG4gIH0pO1xuIiwidmFyIEhhbmRsZWJhcnMgPSByZXF1aXJlKCdoYW5kbGViYXJzLXJ1bnRpbWUnKTtcbm1vZHVsZS5leHBvcnRzID0gSGFuZGxlYmFycy50ZW1wbGF0ZShmdW5jdGlvbiAoSGFuZGxlYmFycyxkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gIHRoaXMuY29tcGlsZXJJbmZvID0gWzQsJz49IDEuMC4wJ107XG5oZWxwZXJzID0gdGhpcy5tZXJnZShoZWxwZXJzLCBIYW5kbGViYXJzLmhlbHBlcnMpOyBkYXRhID0gZGF0YSB8fCB7fTtcbiAgXG5cblxuICByZXR1cm4gXCJcXG48aDE+bWF0Y2ggaW4gcHJvZ3Jlc3M8L2gxPlxcblxcbjxwPlxcbiAgQXMgc29vbiBhcyB0aGUgY3VycmVudCBtYXRjaCBpcyBmaW5pc2hlZCxcXG4gIHlvdSdsbCBiZSBhYmxlIHRvIGpvaW4gdGhlIGFjdGlvbiFcXG48L3A+XFxuXCI7XG4gIH0pO1xuIiwidmFyIEhhbmRsZWJhcnMgPSByZXF1aXJlKCdoYW5kbGViYXJzLXJ1bnRpbWUnKTtcbm1vZHVsZS5leHBvcnRzID0gSGFuZGxlYmFycy50ZW1wbGF0ZShmdW5jdGlvbiAoSGFuZGxlYmFycyxkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gIHRoaXMuY29tcGlsZXJJbmZvID0gWzQsJz49IDEuMC4wJ107XG5oZWxwZXJzID0gdGhpcy5tZXJnZShoZWxwZXJzLCBIYW5kbGViYXJzLmhlbHBlcnMpOyBkYXRhID0gZGF0YSB8fCB7fTtcbiAgXG5cblxuICByZXR1cm4gXCJcXG48aDE+dGhhbmtzIGZvciBwbGF5aW5nPC9oMT5cXG5cXG48cD5cXG4gIGJlIHN1cmUgdG8gYXNrIGFib3V0IHdoYXQgd2UgZG8maGVsbGlwOyA8YnIgLz5cXG4gIGFuZCBob3cgd2UgYnVpbHQgdGhpcyBnYW1lXFxuPC9wPlxcblwiO1xuICB9KTtcbiIsIi8qXG5cbkNvcHlyaWdodCAoQykgMjAxMSBieSBZZWh1ZGEgS2F0elxuXG5QZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG5vZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG5pbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG50byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG5jb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbmZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG5cblRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluXG5hbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cblxuVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG5GSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbkFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbkxJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG5PVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG5USEUgU09GVFdBUkUuXG5cbiovXG5cbi8vIGxpYi9oYW5kbGViYXJzL2Jyb3dzZXItcHJlZml4LmpzXG52YXIgSGFuZGxlYmFycyA9IHt9O1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzO1xuXG4oZnVuY3Rpb24oSGFuZGxlYmFycywgdW5kZWZpbmVkKSB7XG47XG4vLyBsaWIvaGFuZGxlYmFycy9iYXNlLmpzXG5cbkhhbmRsZWJhcnMuVkVSU0lPTiA9IFwiMS4wLjBcIjtcbkhhbmRsZWJhcnMuQ09NUElMRVJfUkVWSVNJT04gPSA0O1xuXG5IYW5kbGViYXJzLlJFVklTSU9OX0NIQU5HRVMgPSB7XG4gIDE6ICc8PSAxLjAucmMuMicsIC8vIDEuMC5yYy4yIGlzIGFjdHVhbGx5IHJldjIgYnV0IGRvZXNuJ3QgcmVwb3J0IGl0XG4gIDI6ICc9PSAxLjAuMC1yYy4zJyxcbiAgMzogJz09IDEuMC4wLXJjLjQnLFxuICA0OiAnPj0gMS4wLjAnXG59O1xuXG5IYW5kbGViYXJzLmhlbHBlcnMgID0ge307XG5IYW5kbGViYXJzLnBhcnRpYWxzID0ge307XG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcsXG4gICAgZnVuY3Rpb25UeXBlID0gJ1tvYmplY3QgRnVuY3Rpb25dJyxcbiAgICBvYmplY3RUeXBlID0gJ1tvYmplY3QgT2JqZWN0XSc7XG5cbkhhbmRsZWJhcnMucmVnaXN0ZXJIZWxwZXIgPSBmdW5jdGlvbihuYW1lLCBmbiwgaW52ZXJzZSkge1xuICBpZiAodG9TdHJpbmcuY2FsbChuYW1lKSA9PT0gb2JqZWN0VHlwZSkge1xuICAgIGlmIChpbnZlcnNlIHx8IGZuKSB7IHRocm93IG5ldyBIYW5kbGViYXJzLkV4Y2VwdGlvbignQXJnIG5vdCBzdXBwb3J0ZWQgd2l0aCBtdWx0aXBsZSBoZWxwZXJzJyk7IH1cbiAgICBIYW5kbGViYXJzLlV0aWxzLmV4dGVuZCh0aGlzLmhlbHBlcnMsIG5hbWUpO1xuICB9IGVsc2Uge1xuICAgIGlmIChpbnZlcnNlKSB7IGZuLm5vdCA9IGludmVyc2U7IH1cbiAgICB0aGlzLmhlbHBlcnNbbmFtZV0gPSBmbjtcbiAgfVxufTtcblxuSGFuZGxlYmFycy5yZWdpc3RlclBhcnRpYWwgPSBmdW5jdGlvbihuYW1lLCBzdHIpIHtcbiAgaWYgKHRvU3RyaW5nLmNhbGwobmFtZSkgPT09IG9iamVjdFR5cGUpIHtcbiAgICBIYW5kbGViYXJzLlV0aWxzLmV4dGVuZCh0aGlzLnBhcnRpYWxzLCAgbmFtZSk7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5wYXJ0aWFsc1tuYW1lXSA9IHN0cjtcbiAgfVxufTtcblxuSGFuZGxlYmFycy5yZWdpc3RlckhlbHBlcignaGVscGVyTWlzc2luZycsIGZ1bmN0aW9uKGFyZykge1xuICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAyKSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJNaXNzaW5nIGhlbHBlcjogJ1wiICsgYXJnICsgXCInXCIpO1xuICB9XG59KTtcblxuSGFuZGxlYmFycy5yZWdpc3RlckhlbHBlcignYmxvY2tIZWxwZXJNaXNzaW5nJywgZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICB2YXIgaW52ZXJzZSA9IG9wdGlvbnMuaW52ZXJzZSB8fCBmdW5jdGlvbigpIHt9LCBmbiA9IG9wdGlvbnMuZm47XG5cbiAgdmFyIHR5cGUgPSB0b1N0cmluZy5jYWxsKGNvbnRleHQpO1xuXG4gIGlmKHR5cGUgPT09IGZ1bmN0aW9uVHlwZSkgeyBjb250ZXh0ID0gY29udGV4dC5jYWxsKHRoaXMpOyB9XG5cbiAgaWYoY29udGV4dCA9PT0gdHJ1ZSkge1xuICAgIHJldHVybiBmbih0aGlzKTtcbiAgfSBlbHNlIGlmKGNvbnRleHQgPT09IGZhbHNlIHx8IGNvbnRleHQgPT0gbnVsbCkge1xuICAgIHJldHVybiBpbnZlcnNlKHRoaXMpO1xuICB9IGVsc2UgaWYodHlwZSA9PT0gXCJbb2JqZWN0IEFycmF5XVwiKSB7XG4gICAgaWYoY29udGV4dC5sZW5ndGggPiAwKSB7XG4gICAgICByZXR1cm4gSGFuZGxlYmFycy5oZWxwZXJzLmVhY2goY29udGV4dCwgb3B0aW9ucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBpbnZlcnNlKHRoaXMpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gZm4oY29udGV4dCk7XG4gIH1cbn0pO1xuXG5IYW5kbGViYXJzLksgPSBmdW5jdGlvbigpIHt9O1xuXG5IYW5kbGViYXJzLmNyZWF0ZUZyYW1lID0gT2JqZWN0LmNyZWF0ZSB8fCBmdW5jdGlvbihvYmplY3QpIHtcbiAgSGFuZGxlYmFycy5LLnByb3RvdHlwZSA9IG9iamVjdDtcbiAgdmFyIG9iaiA9IG5ldyBIYW5kbGViYXJzLksoKTtcbiAgSGFuZGxlYmFycy5LLnByb3RvdHlwZSA9IG51bGw7XG4gIHJldHVybiBvYmo7XG59O1xuXG5IYW5kbGViYXJzLmxvZ2dlciA9IHtcbiAgREVCVUc6IDAsIElORk86IDEsIFdBUk46IDIsIEVSUk9SOiAzLCBsZXZlbDogMyxcblxuICBtZXRob2RNYXA6IHswOiAnZGVidWcnLCAxOiAnaW5mbycsIDI6ICd3YXJuJywgMzogJ2Vycm9yJ30sXG5cbiAgLy8gY2FuIGJlIG92ZXJyaWRkZW4gaW4gdGhlIGhvc3QgZW52aXJvbm1lbnRcbiAgbG9nOiBmdW5jdGlvbihsZXZlbCwgb2JqKSB7XG4gICAgaWYgKEhhbmRsZWJhcnMubG9nZ2VyLmxldmVsIDw9IGxldmVsKSB7XG4gICAgICB2YXIgbWV0aG9kID0gSGFuZGxlYmFycy5sb2dnZXIubWV0aG9kTWFwW2xldmVsXTtcbiAgICAgIGlmICh0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcgJiYgY29uc29sZVttZXRob2RdKSB7XG4gICAgICAgIGNvbnNvbGVbbWV0aG9kXS5jYWxsKGNvbnNvbGUsIG9iaik7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5IYW5kbGViYXJzLmxvZyA9IGZ1bmN0aW9uKGxldmVsLCBvYmopIHsgSGFuZGxlYmFycy5sb2dnZXIubG9nKGxldmVsLCBvYmopOyB9O1xuXG5IYW5kbGViYXJzLnJlZ2lzdGVySGVscGVyKCdlYWNoJywgZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICB2YXIgZm4gPSBvcHRpb25zLmZuLCBpbnZlcnNlID0gb3B0aW9ucy5pbnZlcnNlO1xuICB2YXIgaSA9IDAsIHJldCA9IFwiXCIsIGRhdGE7XG5cbiAgdmFyIHR5cGUgPSB0b1N0cmluZy5jYWxsKGNvbnRleHQpO1xuICBpZih0eXBlID09PSBmdW5jdGlvblR5cGUpIHsgY29udGV4dCA9IGNvbnRleHQuY2FsbCh0aGlzKTsgfVxuXG4gIGlmIChvcHRpb25zLmRhdGEpIHtcbiAgICBkYXRhID0gSGFuZGxlYmFycy5jcmVhdGVGcmFtZShvcHRpb25zLmRhdGEpO1xuICB9XG5cbiAgaWYoY29udGV4dCAmJiB0eXBlb2YgY29udGV4dCA9PT0gJ29iamVjdCcpIHtcbiAgICBpZihjb250ZXh0IGluc3RhbmNlb2YgQXJyYXkpe1xuICAgICAgZm9yKHZhciBqID0gY29udGV4dC5sZW5ndGg7IGk8ajsgaSsrKSB7XG4gICAgICAgIGlmIChkYXRhKSB7IGRhdGEuaW5kZXggPSBpOyB9XG4gICAgICAgIHJldCA9IHJldCArIGZuKGNvbnRleHRbaV0sIHsgZGF0YTogZGF0YSB9KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZm9yKHZhciBrZXkgaW4gY29udGV4dCkge1xuICAgICAgICBpZihjb250ZXh0Lmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICBpZihkYXRhKSB7IGRhdGEua2V5ID0ga2V5OyB9XG4gICAgICAgICAgcmV0ID0gcmV0ICsgZm4oY29udGV4dFtrZXldLCB7ZGF0YTogZGF0YX0pO1xuICAgICAgICAgIGkrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmKGkgPT09IDApe1xuICAgIHJldCA9IGludmVyc2UodGhpcyk7XG4gIH1cblxuICByZXR1cm4gcmV0O1xufSk7XG5cbkhhbmRsZWJhcnMucmVnaXN0ZXJIZWxwZXIoJ2lmJywgZnVuY3Rpb24oY29uZGl0aW9uYWwsIG9wdGlvbnMpIHtcbiAgdmFyIHR5cGUgPSB0b1N0cmluZy5jYWxsKGNvbmRpdGlvbmFsKTtcbiAgaWYodHlwZSA9PT0gZnVuY3Rpb25UeXBlKSB7IGNvbmRpdGlvbmFsID0gY29uZGl0aW9uYWwuY2FsbCh0aGlzKTsgfVxuXG4gIGlmKCFjb25kaXRpb25hbCB8fCBIYW5kbGViYXJzLlV0aWxzLmlzRW1wdHkoY29uZGl0aW9uYWwpKSB7XG4gICAgcmV0dXJuIG9wdGlvbnMuaW52ZXJzZSh0aGlzKTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gb3B0aW9ucy5mbih0aGlzKTtcbiAgfVxufSk7XG5cbkhhbmRsZWJhcnMucmVnaXN0ZXJIZWxwZXIoJ3VubGVzcycsIGZ1bmN0aW9uKGNvbmRpdGlvbmFsLCBvcHRpb25zKSB7XG4gIHJldHVybiBIYW5kbGViYXJzLmhlbHBlcnNbJ2lmJ10uY2FsbCh0aGlzLCBjb25kaXRpb25hbCwge2ZuOiBvcHRpb25zLmludmVyc2UsIGludmVyc2U6IG9wdGlvbnMuZm59KTtcbn0pO1xuXG5IYW5kbGViYXJzLnJlZ2lzdGVySGVscGVyKCd3aXRoJywgZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICB2YXIgdHlwZSA9IHRvU3RyaW5nLmNhbGwoY29udGV4dCk7XG4gIGlmKHR5cGUgPT09IGZ1bmN0aW9uVHlwZSkgeyBjb250ZXh0ID0gY29udGV4dC5jYWxsKHRoaXMpOyB9XG5cbiAgaWYgKCFIYW5kbGViYXJzLlV0aWxzLmlzRW1wdHkoY29udGV4dCkpIHJldHVybiBvcHRpb25zLmZuKGNvbnRleHQpO1xufSk7XG5cbkhhbmRsZWJhcnMucmVnaXN0ZXJIZWxwZXIoJ2xvZycsIGZ1bmN0aW9uKGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgdmFyIGxldmVsID0gb3B0aW9ucy5kYXRhICYmIG9wdGlvbnMuZGF0YS5sZXZlbCAhPSBudWxsID8gcGFyc2VJbnQob3B0aW9ucy5kYXRhLmxldmVsLCAxMCkgOiAxO1xuICBIYW5kbGViYXJzLmxvZyhsZXZlbCwgY29udGV4dCk7XG59KTtcbjtcbi8vIGxpYi9oYW5kbGViYXJzL3V0aWxzLmpzXG5cbnZhciBlcnJvclByb3BzID0gWydkZXNjcmlwdGlvbicsICdmaWxlTmFtZScsICdsaW5lTnVtYmVyJywgJ21lc3NhZ2UnLCAnbmFtZScsICdudW1iZXInLCAnc3RhY2snXTtcblxuSGFuZGxlYmFycy5FeGNlcHRpb24gPSBmdW5jdGlvbihtZXNzYWdlKSB7XG4gIHZhciB0bXAgPSBFcnJvci5wcm90b3R5cGUuY29uc3RydWN0b3IuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblxuICAvLyBVbmZvcnR1bmF0ZWx5IGVycm9ycyBhcmUgbm90IGVudW1lcmFibGUgaW4gQ2hyb21lIChhdCBsZWFzdCksIHNvIGBmb3IgcHJvcCBpbiB0bXBgIGRvZXNuJ3Qgd29yay5cbiAgZm9yICh2YXIgaWR4ID0gMDsgaWR4IDwgZXJyb3JQcm9wcy5sZW5ndGg7IGlkeCsrKSB7XG4gICAgdGhpc1tlcnJvclByb3BzW2lkeF1dID0gdG1wW2Vycm9yUHJvcHNbaWR4XV07XG4gIH1cbn07XG5IYW5kbGViYXJzLkV4Y2VwdGlvbi5wcm90b3R5cGUgPSBuZXcgRXJyb3IoKTtcblxuLy8gQnVpbGQgb3V0IG91ciBiYXNpYyBTYWZlU3RyaW5nIHR5cGVcbkhhbmRsZWJhcnMuU2FmZVN0cmluZyA9IGZ1bmN0aW9uKHN0cmluZykge1xuICB0aGlzLnN0cmluZyA9IHN0cmluZztcbn07XG5IYW5kbGViYXJzLlNhZmVTdHJpbmcucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLnN0cmluZy50b1N0cmluZygpO1xufTtcblxudmFyIGVzY2FwZSA9IHtcbiAgXCImXCI6IFwiJmFtcDtcIixcbiAgXCI8XCI6IFwiJmx0O1wiLFxuICBcIj5cIjogXCImZ3Q7XCIsXG4gICdcIic6IFwiJnF1b3Q7XCIsXG4gIFwiJ1wiOiBcIiYjeDI3O1wiLFxuICBcImBcIjogXCImI3g2MDtcIlxufTtcblxudmFyIGJhZENoYXJzID0gL1smPD5cIidgXS9nO1xudmFyIHBvc3NpYmxlID0gL1smPD5cIidgXS87XG5cbnZhciBlc2NhcGVDaGFyID0gZnVuY3Rpb24oY2hyKSB7XG4gIHJldHVybiBlc2NhcGVbY2hyXSB8fCBcIiZhbXA7XCI7XG59O1xuXG5IYW5kbGViYXJzLlV0aWxzID0ge1xuICBleHRlbmQ6IGZ1bmN0aW9uKG9iaiwgdmFsdWUpIHtcbiAgICBmb3IodmFyIGtleSBpbiB2YWx1ZSkge1xuICAgICAgaWYodmFsdWUuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICBvYmpba2V5XSA9IHZhbHVlW2tleV07XG4gICAgICB9XG4gICAgfVxuICB9LFxuXG4gIGVzY2FwZUV4cHJlc3Npb246IGZ1bmN0aW9uKHN0cmluZykge1xuICAgIC8vIGRvbid0IGVzY2FwZSBTYWZlU3RyaW5ncywgc2luY2UgdGhleSdyZSBhbHJlYWR5IHNhZmVcbiAgICBpZiAoc3RyaW5nIGluc3RhbmNlb2YgSGFuZGxlYmFycy5TYWZlU3RyaW5nKSB7XG4gICAgICByZXR1cm4gc3RyaW5nLnRvU3RyaW5nKCk7XG4gICAgfSBlbHNlIGlmIChzdHJpbmcgPT0gbnVsbCB8fCBzdHJpbmcgPT09IGZhbHNlKSB7XG4gICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG5cbiAgICAvLyBGb3JjZSBhIHN0cmluZyBjb252ZXJzaW9uIGFzIHRoaXMgd2lsbCBiZSBkb25lIGJ5IHRoZSBhcHBlbmQgcmVnYXJkbGVzcyBhbmRcbiAgICAvLyB0aGUgcmVnZXggdGVzdCB3aWxsIGRvIHRoaXMgdHJhbnNwYXJlbnRseSBiZWhpbmQgdGhlIHNjZW5lcywgY2F1c2luZyBpc3N1ZXMgaWZcbiAgICAvLyBhbiBvYmplY3QncyB0byBzdHJpbmcgaGFzIGVzY2FwZWQgY2hhcmFjdGVycyBpbiBpdC5cbiAgICBzdHJpbmcgPSBzdHJpbmcudG9TdHJpbmcoKTtcblxuICAgIGlmKCFwb3NzaWJsZS50ZXN0KHN0cmluZykpIHsgcmV0dXJuIHN0cmluZzsgfVxuICAgIHJldHVybiBzdHJpbmcucmVwbGFjZShiYWRDaGFycywgZXNjYXBlQ2hhcik7XG4gIH0sXG5cbiAgaXNFbXB0eTogZnVuY3Rpb24odmFsdWUpIHtcbiAgICBpZiAoIXZhbHVlICYmIHZhbHVlICE9PSAwKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGVsc2UgaWYodG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT09IFwiW29iamVjdCBBcnJheV1cIiAmJiB2YWx1ZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG59O1xuO1xuLy8gbGliL2hhbmRsZWJhcnMvcnVudGltZS5qc1xuXG5IYW5kbGViYXJzLlZNID0ge1xuICB0ZW1wbGF0ZTogZnVuY3Rpb24odGVtcGxhdGVTcGVjKSB7XG4gICAgLy8gSnVzdCBhZGQgd2F0ZXJcbiAgICB2YXIgY29udGFpbmVyID0ge1xuICAgICAgZXNjYXBlRXhwcmVzc2lvbjogSGFuZGxlYmFycy5VdGlscy5lc2NhcGVFeHByZXNzaW9uLFxuICAgICAgaW52b2tlUGFydGlhbDogSGFuZGxlYmFycy5WTS5pbnZva2VQYXJ0aWFsLFxuICAgICAgcHJvZ3JhbXM6IFtdLFxuICAgICAgcHJvZ3JhbTogZnVuY3Rpb24oaSwgZm4sIGRhdGEpIHtcbiAgICAgICAgdmFyIHByb2dyYW1XcmFwcGVyID0gdGhpcy5wcm9ncmFtc1tpXTtcbiAgICAgICAgaWYoZGF0YSkge1xuICAgICAgICAgIHByb2dyYW1XcmFwcGVyID0gSGFuZGxlYmFycy5WTS5wcm9ncmFtKGksIGZuLCBkYXRhKTtcbiAgICAgICAgfSBlbHNlIGlmICghcHJvZ3JhbVdyYXBwZXIpIHtcbiAgICAgICAgICBwcm9ncmFtV3JhcHBlciA9IHRoaXMucHJvZ3JhbXNbaV0gPSBIYW5kbGViYXJzLlZNLnByb2dyYW0oaSwgZm4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBwcm9ncmFtV3JhcHBlcjtcbiAgICAgIH0sXG4gICAgICBtZXJnZTogZnVuY3Rpb24ocGFyYW0sIGNvbW1vbikge1xuICAgICAgICB2YXIgcmV0ID0gcGFyYW0gfHwgY29tbW9uO1xuXG4gICAgICAgIGlmIChwYXJhbSAmJiBjb21tb24pIHtcbiAgICAgICAgICByZXQgPSB7fTtcbiAgICAgICAgICBIYW5kbGViYXJzLlV0aWxzLmV4dGVuZChyZXQsIGNvbW1vbik7XG4gICAgICAgICAgSGFuZGxlYmFycy5VdGlscy5leHRlbmQocmV0LCBwYXJhbSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgIH0sXG4gICAgICBwcm9ncmFtV2l0aERlcHRoOiBIYW5kbGViYXJzLlZNLnByb2dyYW1XaXRoRGVwdGgsXG4gICAgICBub29wOiBIYW5kbGViYXJzLlZNLm5vb3AsXG4gICAgICBjb21waWxlckluZm86IG51bGxcbiAgICB9O1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgdmFyIHJlc3VsdCA9IHRlbXBsYXRlU3BlYy5jYWxsKGNvbnRhaW5lciwgSGFuZGxlYmFycywgY29udGV4dCwgb3B0aW9ucy5oZWxwZXJzLCBvcHRpb25zLnBhcnRpYWxzLCBvcHRpb25zLmRhdGEpO1xuXG4gICAgICB2YXIgY29tcGlsZXJJbmZvID0gY29udGFpbmVyLmNvbXBpbGVySW5mbyB8fCBbXSxcbiAgICAgICAgICBjb21waWxlclJldmlzaW9uID0gY29tcGlsZXJJbmZvWzBdIHx8IDEsXG4gICAgICAgICAgY3VycmVudFJldmlzaW9uID0gSGFuZGxlYmFycy5DT01QSUxFUl9SRVZJU0lPTjtcblxuICAgICAgaWYgKGNvbXBpbGVyUmV2aXNpb24gIT09IGN1cnJlbnRSZXZpc2lvbikge1xuICAgICAgICBpZiAoY29tcGlsZXJSZXZpc2lvbiA8IGN1cnJlbnRSZXZpc2lvbikge1xuICAgICAgICAgIHZhciBydW50aW1lVmVyc2lvbnMgPSBIYW5kbGViYXJzLlJFVklTSU9OX0NIQU5HRVNbY3VycmVudFJldmlzaW9uXSxcbiAgICAgICAgICAgICAgY29tcGlsZXJWZXJzaW9ucyA9IEhhbmRsZWJhcnMuUkVWSVNJT05fQ0hBTkdFU1tjb21waWxlclJldmlzaW9uXTtcbiAgICAgICAgICB0aHJvdyBcIlRlbXBsYXRlIHdhcyBwcmVjb21waWxlZCB3aXRoIGFuIG9sZGVyIHZlcnNpb24gb2YgSGFuZGxlYmFycyB0aGFuIHRoZSBjdXJyZW50IHJ1bnRpbWUuIFwiK1xuICAgICAgICAgICAgICAgIFwiUGxlYXNlIHVwZGF0ZSB5b3VyIHByZWNvbXBpbGVyIHRvIGEgbmV3ZXIgdmVyc2lvbiAoXCIrcnVudGltZVZlcnNpb25zK1wiKSBvciBkb3duZ3JhZGUgeW91ciBydW50aW1lIHRvIGFuIG9sZGVyIHZlcnNpb24gKFwiK2NvbXBpbGVyVmVyc2lvbnMrXCIpLlwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFVzZSB0aGUgZW1iZWRkZWQgdmVyc2lvbiBpbmZvIHNpbmNlIHRoZSBydW50aW1lIGRvZXNuJ3Qga25vdyBhYm91dCB0aGlzIHJldmlzaW9uIHlldFxuICAgICAgICAgIHRocm93IFwiVGVtcGxhdGUgd2FzIHByZWNvbXBpbGVkIHdpdGggYSBuZXdlciB2ZXJzaW9uIG9mIEhhbmRsZWJhcnMgdGhhbiB0aGUgY3VycmVudCBydW50aW1lLiBcIitcbiAgICAgICAgICAgICAgICBcIlBsZWFzZSB1cGRhdGUgeW91ciBydW50aW1lIHRvIGEgbmV3ZXIgdmVyc2lvbiAoXCIrY29tcGlsZXJJbmZvWzFdK1wiKS5cIjtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG4gIH0sXG5cbiAgcHJvZ3JhbVdpdGhEZXB0aDogZnVuY3Rpb24oaSwgZm4sIGRhdGEgLyosICRkZXB0aCAqLykge1xuICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAzKTtcblxuICAgIHZhciBwcm9ncmFtID0gZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBbY29udGV4dCwgb3B0aW9ucy5kYXRhIHx8IGRhdGFdLmNvbmNhdChhcmdzKSk7XG4gICAgfTtcbiAgICBwcm9ncmFtLnByb2dyYW0gPSBpO1xuICAgIHByb2dyYW0uZGVwdGggPSBhcmdzLmxlbmd0aDtcbiAgICByZXR1cm4gcHJvZ3JhbTtcbiAgfSxcbiAgcHJvZ3JhbTogZnVuY3Rpb24oaSwgZm4sIGRhdGEpIHtcbiAgICB2YXIgcHJvZ3JhbSA9IGZ1bmN0aW9uKGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgICByZXR1cm4gZm4oY29udGV4dCwgb3B0aW9ucy5kYXRhIHx8IGRhdGEpO1xuICAgIH07XG4gICAgcHJvZ3JhbS5wcm9ncmFtID0gaTtcbiAgICBwcm9ncmFtLmRlcHRoID0gMDtcbiAgICByZXR1cm4gcHJvZ3JhbTtcbiAgfSxcbiAgbm9vcDogZnVuY3Rpb24oKSB7IHJldHVybiBcIlwiOyB9LFxuICBpbnZva2VQYXJ0aWFsOiBmdW5jdGlvbihwYXJ0aWFsLCBuYW1lLCBjb250ZXh0LCBoZWxwZXJzLCBwYXJ0aWFscywgZGF0YSkge1xuICAgIHZhciBvcHRpb25zID0geyBoZWxwZXJzOiBoZWxwZXJzLCBwYXJ0aWFsczogcGFydGlhbHMsIGRhdGE6IGRhdGEgfTtcblxuICAgIGlmKHBhcnRpYWwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgdGhyb3cgbmV3IEhhbmRsZWJhcnMuRXhjZXB0aW9uKFwiVGhlIHBhcnRpYWwgXCIgKyBuYW1lICsgXCIgY291bGQgbm90IGJlIGZvdW5kXCIpO1xuICAgIH0gZWxzZSBpZihwYXJ0aWFsIGluc3RhbmNlb2YgRnVuY3Rpb24pIHtcbiAgICAgIHJldHVybiBwYXJ0aWFsKGNvbnRleHQsIG9wdGlvbnMpO1xuICAgIH0gZWxzZSBpZiAoIUhhbmRsZWJhcnMuY29tcGlsZSkge1xuICAgICAgdGhyb3cgbmV3IEhhbmRsZWJhcnMuRXhjZXB0aW9uKFwiVGhlIHBhcnRpYWwgXCIgKyBuYW1lICsgXCIgY291bGQgbm90IGJlIGNvbXBpbGVkIHdoZW4gcnVubmluZyBpbiBydW50aW1lLW9ubHkgbW9kZVwiKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcGFydGlhbHNbbmFtZV0gPSBIYW5kbGViYXJzLmNvbXBpbGUocGFydGlhbCwge2RhdGE6IGRhdGEgIT09IHVuZGVmaW5lZH0pO1xuICAgICAgcmV0dXJuIHBhcnRpYWxzW25hbWVdKGNvbnRleHQsIG9wdGlvbnMpO1xuICAgIH1cbiAgfVxufTtcblxuSGFuZGxlYmFycy50ZW1wbGF0ZSA9IEhhbmRsZWJhcnMuVk0udGVtcGxhdGU7XG47XG4vLyBsaWIvaGFuZGxlYmFycy9icm93c2VyLXN1ZmZpeC5qc1xufSkoSGFuZGxlYmFycyk7XG47XG4iLCIoZnVuY3Rpb24oZ2xvYmFsKXtyZXF1aXJlKFwiLi9yeC5taW4uanNcIikoZ2xvYmFsKTtcclxucmVxdWlyZShcIi4vcnguYWdncmVnYXRlcy5taW4uanNcIikoZ2xvYmFsKTtcclxucmVxdWlyZShcIi4vcnguY29pbmNpZGVuY2UubWluLmpzXCIpKGdsb2JhbCk7XHJcbnJlcXVpcmUoXCIuL3J4LmpvaW5wYXR0ZXJucy5taW4uanNcIikoZ2xvYmFsKTtcclxucmVxdWlyZShcIi4vcngudGltZS5taW4uanNcIikoZ2xvYmFsKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gUnhcclxuXG59KSh3aW5kb3cpIiwiLypcbiBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gVGhpcyBjb2RlIGlzIGxpY2Vuc2VkIGJ5IE1pY3Jvc29mdCBDb3Jwb3JhdGlvbiB1bmRlciB0aGUgdGVybXNcbiBvZiB0aGUgTUlDUk9TT0ZUIFJFQUNUSVZFIEVYVEVOU0lPTlMgRk9SIEpBVkFTQ1JJUFQgQU5EIC5ORVQgTElCUkFSSUVTIExpY2Vuc2UuXG4gU2VlIGh0dHA6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/TGlua0lEPTIyMDc2Mi5cbiovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHEsaCl7dmFyIGY7Zj1xLlJ4O3ZhciB6PWYuT2JzZXJ2YWJsZSx1PWYuQ29tcG9zaXRlRGlzcG9zYWJsZSxFPWYuUmVmQ291bnREaXNwb3NhYmxlLHM9Zi5TaW5nbGVBc3NpZ25tZW50RGlzcG9zYWJsZSxLPWYuU2VyaWFsRGlzcG9zYWJsZSxBPWYuU3ViamVjdDtmPXoucHJvdG90eXBlO3ZhciBMPXouZW1wdHksdj16LmNyZWF0ZVdpdGhEaXNwb3NhYmxlLE09ZnVuY3Rpb24oYixhKXtyZXR1cm4gYj09PWF9LE49ZnVuY3Rpb24oKXt9LEI9ZnVuY3Rpb24oYixhKXtyZXR1cm4gdihmdW5jdGlvbihjKXtyZXR1cm4gbmV3IHUoYS5nZXREaXNwb3NhYmxlKCksYi5zdWJzY3JpYmUoYykpfSl9LEMsRixvLEcsdyx4O289WzEsMyw3LDEzLDMxLDYxLDEyNywyNTEsNTA5LDEwMjEsMjAzOSw0MDkzLDgxOTEsMTYzODEsXG4zMjc0OSw2NTUyMSwxMzEwNzEsMjYyMTM5LDUyNDI4NywxMDQ4NTczLDIwOTcxNDMsNDE5NDMwMSw4Mzg4NTkzLDE2Nzc3MjEzLDMzNTU0MzkzLDY3MTA4ODU5LDEzNDIxNzY4OSwyNjg0MzUzOTksNTM2ODcwOTA5LDEwNzM3NDE3ODksMjE0NzQ4MzY0N107Rj1mdW5jdGlvbihiKXt2YXIgYSxjO2lmKGImMClyZXR1cm4gMj09PWI7YT1NYXRoLnNxcnQoYik7Zm9yKGM9MztjPD1hOyl7aWYoMD09PWIlYylyZXR1cm4hMTtjKz0yfXJldHVybiEwfTtDPWZ1bmN0aW9uKGIpe3ZhciBhLGM7Zm9yKGE9MDthPG8ubGVuZ3RoOysrYSlpZihjPW9bYV0sYz49YilyZXR1cm4gYztmb3IoYT1ifDE7YTxvW28ubGVuZ3RoLTFdOyl7aWYoRihhKSlyZXR1cm4gYTthKz0yfXJldHVybiBifTtHPTA7dz1mdW5jdGlvbihiKXt2YXIgYTtpZihiPT09aCl0aHJvd1wibm8gc3VjaCBrZXlcIjtpZihiLmdldEhhc2hDb2RlIT09aClyZXR1cm4gYi5nZXRIYXNoQ29kZSgpO2E9MTcqRysrO2IuZ2V0SGFzaENvZGU9ZnVuY3Rpb24oKXtyZXR1cm4gYX07XG5yZXR1cm4gYX07eD1mdW5jdGlvbigpe3JldHVybntrZXk6bnVsbCx2YWx1ZTpudWxsLG5leHQ6MCxoYXNoQ29kZTowfX07dmFyIHk9ZnVuY3Rpb24oKXtmdW5jdGlvbiBiKGEsYyl7dGhpcy5faW5pdGlhbGl6ZShhKTt0aGlzLmNvbXBhcmVyPWN8fE07dGhpcy5zaXplPXRoaXMuZnJlZUNvdW50PTA7dGhpcy5mcmVlTGlzdD0tMX1iLnByb3RvdHlwZS5faW5pdGlhbGl6ZT1mdW5jdGlvbihhKXt2YXIgYT1DKGEpLGM7dGhpcy5idWNrZXRzPUFycmF5KGEpO3RoaXMuZW50cmllcz1BcnJheShhKTtmb3IoYz0wO2M8YTtjKyspdGhpcy5idWNrZXRzW2NdPS0xLHRoaXMuZW50cmllc1tjXT14KCk7dGhpcy5mcmVlTGlzdD0tMX07Yi5wcm90b3R5cGUuY291bnQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5zaXplfTtiLnByb3RvdHlwZS5hZGQ9ZnVuY3Rpb24oYSxjKXtyZXR1cm4gdGhpcy5faW5zZXJ0KGEsYywhMCl9O2IucHJvdG90eXBlLl9pbnNlcnQ9ZnVuY3Rpb24oYSxjLGIpe3ZhciBlLGQsXG5nO3RoaXMuYnVja2V0cz09PWgmJnRoaXMuX2luaXRpYWxpemUoMCk7Zz13KGEpJjIxNDc0ODM2NDc7ZT1nJXRoaXMuYnVja2V0cy5sZW5ndGg7Zm9yKGQ9dGhpcy5idWNrZXRzW2VdOzA8PWQ7ZD10aGlzLmVudHJpZXNbZF0ubmV4dClpZih0aGlzLmVudHJpZXNbZF0uaGFzaENvZGU9PT1nJiZ0aGlzLmNvbXBhcmVyKHRoaXMuZW50cmllc1tkXS5rZXksYSkpe2lmKGIpdGhyb3dcImR1cGxpY2F0ZSBrZXlcIjt0aGlzLmVudHJpZXNbZF0udmFsdWU9YztyZXR1cm59MDx0aGlzLmZyZWVDb3VudD8oYj10aGlzLmZyZWVMaXN0LHRoaXMuZnJlZUxpc3Q9dGhpcy5lbnRyaWVzW2JdLm5leHQsLS10aGlzLmZyZWVDb3VudCk6KHRoaXMuc2l6ZT09PXRoaXMuZW50cmllcy5sZW5ndGgmJih0aGlzLl9yZXNpemUoKSxlPWcldGhpcy5idWNrZXRzLmxlbmd0aCksYj10aGlzLnNpemUsKyt0aGlzLnNpemUpO3RoaXMuZW50cmllc1tiXS5oYXNoQ29kZT1nO3RoaXMuZW50cmllc1tiXS5uZXh0PXRoaXMuYnVja2V0c1tlXTtcbnRoaXMuZW50cmllc1tiXS5rZXk9YTt0aGlzLmVudHJpZXNbYl0udmFsdWU9Yzt0aGlzLmJ1Y2tldHNbZV09Yn07Yi5wcm90b3R5cGUuX3Jlc2l6ZT1mdW5jdGlvbigpe3ZhciBhLGMsYixlLGQ7ZD1DKDIqdGhpcy5zaXplKTtiPUFycmF5KGQpO2ZvcihhPTA7YTxiLmxlbmd0aDsrK2EpYlthXT0tMTtlPUFycmF5KGQpO2ZvcihhPTA7YTx0aGlzLnNpemU7KythKWVbYV09dGhpcy5lbnRyaWVzW2FdO2ZvcihhPXRoaXMuc2l6ZTthPGQ7KythKWVbYV09eCgpO2ZvcihhPTA7YTx0aGlzLnNpemU7KythKWM9ZVthXS5oYXNoQ29kZSVkLGVbYV0ubmV4dD1iW2NdLGJbY109YTt0aGlzLmJ1Y2tldHM9Yjt0aGlzLmVudHJpZXM9ZX07Yi5wcm90b3R5cGUucmVtb3ZlPWZ1bmN0aW9uKGEpe3ZhciBiLGssZSxkO2lmKHRoaXMuYnVja2V0cyE9PWgpe2Q9dyhhKSYyMTQ3NDgzNjQ3O2I9ZCV0aGlzLmJ1Y2tldHMubGVuZ3RoO2s9LTE7Zm9yKGU9dGhpcy5idWNrZXRzW2JdOzA8PWU7ZT10aGlzLmVudHJpZXNbZV0ubmV4dCl7aWYodGhpcy5lbnRyaWVzW2VdLmhhc2hDb2RlPT09XG5kJiZ0aGlzLmNvbXBhcmVyKHRoaXMuZW50cmllc1tlXS5rZXksYSkpcmV0dXJuIDA+az90aGlzLmJ1Y2tldHNbYl09dGhpcy5lbnRyaWVzW2VdLm5leHQ6dGhpcy5lbnRyaWVzW2tdLm5leHQ9dGhpcy5lbnRyaWVzW2VdLm5leHQsdGhpcy5lbnRyaWVzW2VdLmhhc2hDb2RlPS0xLHRoaXMuZW50cmllc1tlXS5uZXh0PXRoaXMuZnJlZUxpc3QsdGhpcy5lbnRyaWVzW2VdLmtleT1udWxsLHRoaXMuZW50cmllc1tlXS52YWx1ZT1udWxsLHRoaXMuZnJlZUxpc3Q9ZSwrK3RoaXMuZnJlZUNvdW50LCEwO2s9ZX19cmV0dXJuITF9O2IucHJvdG90eXBlLmNsZWFyPWZ1bmN0aW9uKCl7dmFyIGE7aWYoISgwPj10aGlzLnNpemUpKXtmb3IoYT0wO2E8dGhpcy5idWNrZXRzLmxlbmd0aDsrK2EpdGhpcy5idWNrZXRzW2FdPS0xO2ZvcihhPTA7YTx0aGlzLnNpemU7KythKXRoaXMuZW50cmllc1thXT14KCk7dGhpcy5mcmVlTGlzdD0tMTt0aGlzLnNpemU9MH19O2IucHJvdG90eXBlLl9maW5kRW50cnk9XG5mdW5jdGlvbihhKXt2YXIgYixrO2lmKHRoaXMuYnVja2V0cyE9PWgpe2s9dyhhKSYyMTQ3NDgzNjQ3O2ZvcihiPXRoaXMuYnVja2V0c1trJXRoaXMuYnVja2V0cy5sZW5ndGhdOzA8PWI7Yj10aGlzLmVudHJpZXNbYl0ubmV4dClpZih0aGlzLmVudHJpZXNbYl0uaGFzaENvZGU9PT1rJiZ0aGlzLmNvbXBhcmVyKHRoaXMuZW50cmllc1tiXS5rZXksYSkpcmV0dXJuIGJ9cmV0dXJuLTF9O2IucHJvdG90eXBlLmNvdW50PWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuc2l6ZS10aGlzLmZyZWVDb3VudH07Yi5wcm90b3R5cGUudHJ5R2V0RW50cnk9ZnVuY3Rpb24oYSl7YT10aGlzLl9maW5kRW50cnkoYSk7cmV0dXJuIDA8PWE/e2tleTp0aGlzLmVudHJpZXNbYV0ua2V5LHZhbHVlOnRoaXMuZW50cmllc1thXS52YWx1ZX06aH07Yi5wcm90b3R5cGUuZ2V0VmFsdWVzPWZ1bmN0aW9uKCl7dmFyIGE9MCxiLGs9W107aWYodGhpcy5lbnRyaWVzIT09aClmb3IoYj0wO2I8dGhpcy5zaXplO2IrKylpZigwPD1cbnRoaXMuZW50cmllc1tiXS5oYXNoQ29kZSlrW2ErK109dGhpcy5lbnRyaWVzW2JdLnZhbHVlO3JldHVybiBrfTtiLnByb3RvdHlwZS5nZXQ9ZnVuY3Rpb24oYSl7YT10aGlzLl9maW5kRW50cnkoYSk7aWYoMDw9YSlyZXR1cm4gdGhpcy5lbnRyaWVzW2FdLnZhbHVlO3Rocm93IEVycm9yKFwibm8gc3VjaCBrZXlcIik7fTtiLnByb3RvdHlwZS5zZXQ9ZnVuY3Rpb24oYSxiKXt0aGlzLl9pbnNlcnQoYSxiLCExKX07Yi5wcm90b3R5cGUuY29udGFpbnNrZXk9ZnVuY3Rpb24oYSl7cmV0dXJuIDA8PXRoaXMuX2ZpbmRFbnRyeShhKX07cmV0dXJuIGJ9KCk7Zi5qb2luPWZ1bmN0aW9uKGIsYSxjLGspe3ZhciBlPXRoaXM7cmV0dXJuIHYoZnVuY3Rpb24oZCl7dmFyIGc9bmV3IHUsaj0hMSxmPTAsbD1uZXcgeSxoPSExLHI9MCx0PW5ldyB5O2cuYWRkKGUuc3Vic2NyaWJlKGZ1bmN0aW9uKGIpe3ZhciBjLGUscD1mKyssaT1uZXcgcyxIO2wuYWRkKHAsYik7Zy5hZGQoaSk7ZT1mdW5jdGlvbigpe2lmKGwucmVtb3ZlKHApJiZcbjA9PT1sLmNvdW50KCkmJmopZC5vbkNvbXBsZXRlZCgpO3JldHVybiBnLnJlbW92ZShpKX07dHJ5e2M9YShiKX1jYXRjaChoKXtkLm9uRXJyb3IoaCk7cmV0dXJufWkuZGlzcG9zYWJsZShjLnRha2UoMSkuc3Vic2NyaWJlKGZ1bmN0aW9uKCl7fSxmdW5jdGlvbihhKXtkLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7ZSgpfSkpO2M9dC5nZXRWYWx1ZXMoKTtmb3IodmFyIG49MDtuPGMubGVuZ3RoO24rKyl7dHJ5e0g9ayhiLGNbbl0pfWNhdGNoKHIpe2Qub25FcnJvcihyKTticmVha31kLm9uTmV4dChIKX19LGZ1bmN0aW9uKGEpe2Qub25FcnJvcihhKX0sZnVuY3Rpb24oKXtqPSEwO2lmKGh8fDA9PT1sLmNvdW50KCkpZC5vbkNvbXBsZXRlZCgpfSkpO2cuYWRkKGIuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe3ZhciBiLGUscD1yKyssaT1uZXcgcyxqO3QuYWRkKHAsYSk7Zy5hZGQoaSk7ZT1mdW5jdGlvbigpe2lmKHQucmVtb3ZlKHApJiYwPT09dC5jb3VudCgpJiZoKWQub25Db21wbGV0ZWQoKTtcbnJldHVybiBnLnJlbW92ZShpKX07dHJ5e2I9YyhhKX1jYXRjaChmKXtkLm9uRXJyb3IoZik7cmV0dXJufWkuZGlzcG9zYWJsZShiLnRha2UoMSkuc3Vic2NyaWJlKGZ1bmN0aW9uKCl7fSxmdW5jdGlvbihhKXtkLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7ZSgpfSkpO2I9bC5nZXRWYWx1ZXMoKTtmb3IodmFyIG49MDtuPGIubGVuZ3RoO24rKyl7dHJ5e2o9ayhiW25dLGEpfWNhdGNoKE8pe2Qub25FcnJvcihPKTticmVha31kLm9uTmV4dChqKX19LGZ1bmN0aW9uKGEpe2Qub25FcnJvcihhKX0sZnVuY3Rpb24oKXtoPSEwO2lmKGp8fDA9PT10LmNvdW50KCkpZC5vbkNvbXBsZXRlZCgpfSkpO3JldHVybiBnfSl9O2YuZ3JvdXBKb2luPWZ1bmN0aW9uKGIsYSxjLGspe3ZhciBlPXRoaXM7cmV0dXJuIHYoZnVuY3Rpb24oZCl7dmFyIGc9bmV3IHUsaj1uZXcgRShnKSxmPTAsbD1uZXcgeSxoPTAscj1uZXcgeTtnLmFkZChlLnN1YnNjcmliZShmdW5jdGlvbihiKXt2YXIgYyxlLG0scD1mKyssaSxcbmgsRCxuPW5ldyBBO2wuYWRkKHAsbik7dHJ5e209ayhiLEIobixqKSl9Y2F0Y2gobyl7aT1sLmdldFZhbHVlcygpO2ZvcihtPTA7bTxpLmxlbmd0aDttKyspaVttXS5vbkVycm9yKG8pO2Qub25FcnJvcihvKTtyZXR1cm59ZC5vbk5leHQobSk7RD1yLmdldFZhbHVlcygpO2ZvcihtPTA7bTxELmxlbmd0aDttKyspbi5vbk5leHQoRFttXSk7aD1uZXcgcztnLmFkZChoKTtlPWZ1bmN0aW9uKCl7aWYobC5yZW1vdmUocCkpbi5vbkNvbXBsZXRlZCgpO2cucmVtb3ZlKGgpfTt0cnl7Yz1hKGIpfWNhdGNoKHEpe2k9bC5nZXRWYWx1ZXMoKTtmb3IobT0wO208aS5sZW5ndGg7bSsrKWlbbV0ub25FcnJvcihxKTtkLm9uRXJyb3IocSk7cmV0dXJufWguZGlzcG9zYWJsZShjLnRha2UoMSkuc3Vic2NyaWJlKGZ1bmN0aW9uKCl7fSxmdW5jdGlvbihhKXt2YXIgYjtpPWwuZ2V0VmFsdWVzKCk7Zm9yKGI9MDtiPGkubGVuZ3RoO2IrKylpW2JdLm9uRXJyb3IoYSk7ZC5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2UoKX0pKX0sXG5mdW5jdGlvbihhKXt2YXIgYixjO2M9bC5nZXRWYWx1ZXMoKTtmb3IoYj0wO2I8Yy5sZW5ndGg7YisrKWNbYl0ub25FcnJvcihhKTtkLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7ZC5vbkNvbXBsZXRlZCgpfSkpO2cuYWRkKGIuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe3ZhciBiLGUsayxmLGk7az1oKys7ci5hZGQoayxhKTtpPW5ldyBzO2cuYWRkKGkpO2U9ZnVuY3Rpb24oKXtyLnJlbW92ZShrKTtnLnJlbW92ZShpKX07dHJ5e2I9YyhhKX1jYXRjaChqKXtmPWwuZ2V0VmFsdWVzKCk7Zm9yKGI9MDtiPGYubGVuZ3RoO2IrKylmW2JdLm9uRXJyb3Ioaik7ZC5vbkVycm9yKGopO3JldHVybn1pLmRpc3Bvc2FibGUoYi50YWtlKDEpLnN1YnNjcmliZShmdW5jdGlvbigpe30sZnVuY3Rpb24oYSl7dmFyIGI7Zj1sLmdldFZhbHVlcygpO2ZvcihiPTA7YjxmLmxlbmd0aDtiKyspZltiXS5vbkVycm9yKGEpO2Qub25FcnJvcihhKX0sZnVuY3Rpb24oKXtlKCl9KSk7Zj1sLmdldFZhbHVlcygpO2ZvcihiPVxuMDtiPGYubGVuZ3RoO2IrKylmW2JdLm9uTmV4dChhKX0sZnVuY3Rpb24oYil7dmFyIGEsYztjPWwuZ2V0VmFsdWVzKCk7Zm9yKGE9MDthPGMubGVuZ3RoO2ErKyljW2FdLm9uRXJyb3IoYik7ZC5vbkVycm9yKGIpfSkpO3JldHVybiBqfSl9O2YuYnVmZmVyPWZ1bmN0aW9uKGIsYSl7cmV0dXJuXCJmdW5jdGlvblwiPT09dHlwZW9mIGI/SShiKS5zZWxlY3RNYW55KGZ1bmN0aW9uKGEpe3JldHVybiBvYnNlcnZhYmxlVG9BcnJheShhKX0pOkoodGhpcyxiLGEpLnNlbGVjdE1hbnkoZnVuY3Rpb24oYSl7cmV0dXJuIG9ic2VydmFibGVUb0FycmF5KGEpfSl9O2Yud2luZG93PWZ1bmN0aW9uKGIsYSl7cmV0dXJuXCJmdW5jdGlvblwiPT09dHlwZW9mIGI/SS5jYWxsKHRoaXMsYik6Si5jYWxsKHRoaXMsYixhKX07dmFyIEo9ZnVuY3Rpb24oYixhKXtyZXR1cm4gYi5ncm91cEpvaW4odGhpcyxhLGZ1bmN0aW9uKCl7cmV0dXJuIEwoKX0sZnVuY3Rpb24oYSxiKXtyZXR1cm4gYn0pfSxJPWZ1bmN0aW9uKGIpe3ZhciBhPVxudGhpcztyZXR1cm4gdihmdW5jdGlvbihjKXt2YXIgZixlPW5ldyBLLGQ9bmV3IHUoZSksZz1uZXcgRShkKSxqPW5ldyBBO2Mub25OZXh0KEIoaixnKSk7ZC5hZGQoYS5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7ai5vbk5leHQoYSl9LGZ1bmN0aW9uKGEpe2oub25FcnJvcihhKTtjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7ai5vbkNvbXBsZXRlZCgpO2Mub25Db21wbGV0ZWQoKX0pKTtmPWZ1bmN0aW9uKCl7dmFyIGEsZDt0cnl7ZD1iKCl9Y2F0Y2goaCl7Yy5vbkVycm9yKGgpO3JldHVybn1hPW5ldyBzO2UuZGlzcG9zYWJsZShhKTthLmRpc3Bvc2FibGUoZC50YWtlKDEpLnN1YnNjcmliZShOLGZ1bmN0aW9uKGEpe2oub25FcnJvcihhKTtjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7ai5vbkNvbXBsZXRlZCgpO2o9bmV3IEE7Yy5vbk5leHQoQihqLGcpKTtmKCl9KSl9O2YoKTtyZXR1cm4gZ30pfX07XG4iLCIvKlxuIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiAgQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiBUaGlzIGNvZGUgaXMgbGljZW5zZWQgYnkgTWljcm9zb2Z0IENvcnBvcmF0aW9uIHVuZGVyIHRoZSB0ZXJtc1xuIG9mIHRoZSBNSUNST1NPRlQgUkVBQ1RJVkUgRVhURU5TSU9OUyBGT1IgSkFWQVNDUklQVCBBTkQgLk5FVCBMSUJSQVJJRVMgTGljZW5zZS5cbiBTZWUgaHR0cDovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSUQ9MjIwNzYyLlxuKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oayx0KXt2YXIgbDtsPWsuUng7dmFyIG49bC5PYnNlcnZhYmxlLGQ9bi5wcm90b3R5cGUsbT1uLmNyZWF0ZVdpdGhEaXNwb3NhYmxlLHU9bC5Db21wb3NpdGVEaXNwb3NhYmxlLG89ZnVuY3Rpb24oYSxiKXtyZXR1cm4gYT09PWJ9LHA9ZnVuY3Rpb24oYSl7cmV0dXJuIGF9LHE9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gYT5iPzE6YT09PWI/MDotMX0scj1mdW5jdGlvbihhLGIsZCl7cmV0dXJuIG0oZnVuY3Rpb24oYyl7dmFyIGY9ITEsZz1udWxsLGg9W107cmV0dXJuIGEuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe3ZhciBlLGk7dHJ5e2k9YihhKX1jYXRjaCh2KXtjLm9uRXJyb3Iodik7cmV0dXJufWU9MDtpZihmKXRyeXtlPWQoaSxnKX1jYXRjaCh3KXtjLm9uRXJyb3Iodyk7cmV0dXJufWVsc2UgZj0hMCxnPVxuaTswPGUmJihnPWksaD1bXSk7MDw9ZSYmaC5wdXNoKGEpfSxmdW5jdGlvbihhKXtjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Yy5vbk5leHQoaCk7Yy5vbkNvbXBsZXRlZCgpfSl9KX07ZC5hZ2dyZWdhdGU9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gdGhpcy5zY2FuKGEsYikuc3RhcnRXaXRoKGEpLmZpbmFsVmFsdWUoKX07ZC5hZ2dyZWdhdGUxPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLnNjYW4xKGEpLmZpbmFsVmFsdWUoKX07ZC5hbnk9ZnVuY3Rpb24oYSl7dmFyIGI9dGhpcztyZXR1cm4gYSE9PXQ/Yi53aGVyZShhKS5hbnkoKTptKGZ1bmN0aW9uKGEpe3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbigpe2Eub25OZXh0KCEwKTthLm9uQ29tcGxldGVkKCl9LGZ1bmN0aW9uKGIpe2Eub25FcnJvcihiKX0sZnVuY3Rpb24oKXthLm9uTmV4dCghMSk7YS5vbkNvbXBsZXRlZCgpfSl9KX07ZC5hbGw9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMud2hlcmUoZnVuY3Rpb24oYil7cmV0dXJuIWEoYil9KS5hbnkoKS5zZWxlY3QoZnVuY3Rpb24oYSl7cmV0dXJuIWF9KX07XG5kLmNvbnRhaW5zPWZ1bmN0aW9uKGEsYil7Ynx8KGI9byk7cmV0dXJuIHRoaXMud2hlcmUoZnVuY3Rpb24oZCl7cmV0dXJuIGIoZCxhKX0pLmFueSgpfTtkLmNvdW50PWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuYWdncmVnYXRlKDAsZnVuY3Rpb24oYSl7cmV0dXJuIGErMX0pfTtkLnN1bT1mdW5jdGlvbigpe3JldHVybiB0aGlzLmFnZ3JlZ2F0ZSgwLGZ1bmN0aW9uKGEsYil7cmV0dXJuIGErYn0pfTtkLm1pbkJ5PWZ1bmN0aW9uKGEsYil7Ynx8KGI9cSk7cmV0dXJuIHIodGhpcyxhLGZ1bmN0aW9uKGEsYyl7cmV0dXJuLTEqYihhLGMpfSl9O3ZhciBzPWZ1bmN0aW9uKGEpe2lmKDA9PWEubGVuZ3RoKXRocm93IEVycm9yKFwiU2VxdWVuY2UgY29udGFpbnMgbm8gZWxlbWVudHMuXCIpO3JldHVybiBhWzBdfTtkLm1pbj1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5taW5CeShwLGEpLnNlbGVjdChmdW5jdGlvbihhKXtyZXR1cm4gcyhhKX0pfTtkLm1heEJ5PWZ1bmN0aW9uKGEsYil7Ynx8KGI9cSk7XG5yZXR1cm4gcih0aGlzLGEsYil9O2QubWF4PWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLm1heEJ5KHAsYSkuc2VsZWN0KGZ1bmN0aW9uKGEpe3JldHVybiBzKGEpfSl9O2QuYXZlcmFnZT1mdW5jdGlvbigpe3JldHVybiB0aGlzLnNjYW4oe3N1bTowLGNvdW50OjB9LGZ1bmN0aW9uKGEsYil7cmV0dXJue3N1bTphLnN1bStiLGNvdW50OmEuY291bnQrMX19KS5maW5hbFZhbHVlKCkuc2VsZWN0KGZ1bmN0aW9uKGEpe3JldHVybiBhLnN1bS9hLmNvdW50fSl9O2Quc2VxdWVuY2VFcXVhbD1mdW5jdGlvbihhLGIpe3ZhciBkPXRoaXM7Ynx8KGI9byk7cmV0dXJuIG0oZnVuY3Rpb24oYyl7dmFyIGY9ITEsZz0hMSxoPVtdLGo9W10sZT1kLnN1YnNjcmliZShmdW5jdGlvbihhKXt2YXIgZCxmO2lmKDA8ai5sZW5ndGgpe2Y9ai5zaGlmdCgpO3RyeXtkPWIoZixhKX1jYXRjaChlKXtjLm9uRXJyb3IoZSk7cmV0dXJufWR8fChjLm9uTmV4dCghMSksYy5vbkNvbXBsZXRlZCgpKX1lbHNlIGc/KGMub25OZXh0KCExKSxcbmMub25Db21wbGV0ZWQoKSk6aC5wdXNoKGEpfSxmdW5jdGlvbihhKXtjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Zj0hMDswPT09aC5sZW5ndGgmJigwPGoubGVuZ3RoPyhjLm9uTmV4dCghMSksYy5vbkNvbXBsZXRlZCgpKTpnJiYoYy5vbk5leHQoITApLGMub25Db21wbGV0ZWQoKSkpfSksaT1hLnN1YnNjcmliZShmdW5jdGlvbihhKXt2YXIgZCxlO2lmKDA8aC5sZW5ndGgpe2U9aC5zaGlmdCgpO3RyeXtkPWIoZSxhKX1jYXRjaChnKXtjLm9uRXJyb3IoZyk7cmV0dXJufWR8fChjLm9uTmV4dCghMSksYy5vbkNvbXBsZXRlZCgpKX1lbHNlIGY/KGMub25OZXh0KCExKSxjLm9uQ29tcGxldGVkKCkpOmoucHVzaChhKX0sZnVuY3Rpb24oYSl7Yy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2c9ITA7MD09PWoubGVuZ3RoJiYoMDxoLmxlbmd0aD8oYy5vbk5leHQoITEpLGMub25Db21wbGV0ZWQoKSk6ZiYmKGMub25OZXh0KCEwKSxjLm9uQ29tcGxldGVkKCkpKX0pO3JldHVybiBuZXcgdShlLFxuaSl9KX19O1xuIiwiLypcbiBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gVGhpcyBjb2RlIGlzIGxpY2Vuc2VkIGJ5IE1pY3Jvc29mdCBDb3Jwb3JhdGlvbiB1bmRlciB0aGUgdGVybXNcbiBvZiB0aGUgTUlDUk9TT0ZUIFJFQUNUSVZFIEVYVEVOU0lPTlMgRk9SIEpBVkFTQ1JJUFQgQU5EIC5ORVQgTElCUkFSSUVTIExpY2Vuc2UuXG4gU2VlIGh0dHA6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/TGlua0lEPTIyMDc2Mi5cbiovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHgsbil7dmFyIG0saWE9ZnVuY3Rpb24oKXt9LEo9ZnVuY3Rpb24oKXtyZXR1cm4obmV3IERhdGUpLmdldFRpbWUoKX0sVj1mdW5jdGlvbihhLGIpe3JldHVybiBhPT09Yn0sUT1mdW5jdGlvbihhKXtyZXR1cm4gYX0sVz1mdW5jdGlvbihhKXtyZXR1cm4gYS50b1N0cmluZygpfSxYPU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHksbz1mdW5jdGlvbihhLGIpe2Z1bmN0aW9uIGMoKXt0aGlzLmNvbnN0cnVjdG9yPWF9Zm9yKHZhciBkIGluIGIpWC5jYWxsKGIsZCkmJihhW2RdPWJbZF0pO2MucHJvdG90eXBlPWIucHJvdG90eXBlO2EucHJvdG90eXBlPW5ldyBjO2EuYmFzZT1iLnByb3RvdHlwZTtyZXR1cm4gYX0sRT1mdW5jdGlvbihhLGIpe2Zvcih2YXIgYyBpbiBiKVguY2FsbChiLGMpJiYoYVtjXT1iW2NdKX0seT1BcnJheS5wcm90b3R5cGUuc2xpY2UsSz1cIk9iamVjdCBoYXMgYmVlbiBkaXNwb3NlZFwiO209eC5SeD17SW50ZXJuYWxzOnt9fTttLlZFUlNJT049XCIxLjAuMTA2MjFcIjt2YXIgamE9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gaShmdW5jdGlvbihjKXtyZXR1cm4gbmV3IHAoYi5nZXREaXNwb3NhYmxlKCksYS5zdWJzY3JpYmUoYykpfSl9LEY9ZnVuY3Rpb24oYSxiLGMpe3JldHVybiBpKGZ1bmN0aW9uKGQpe3ZhciBlPW5ldyB2LGc9bmV3IHYsZD1jKGQsZSxnKTtlLmRpc3Bvc2FibGUoYS5tYXRlcmlhbGl6ZSgpLnNlbGVjdChmdW5jdGlvbihiKXtyZXR1cm57c3dpdGNoVmFsdWU6ZnVuY3Rpb24oYSl7cmV0dXJuIGEoYil9fX0pLnN1YnNjcmliZShkKSk7Zy5kaXNwb3NhYmxlKGIubWF0ZXJpYWxpemUoKS5zZWxlY3QoZnVuY3Rpb24oYil7cmV0dXJue3N3aXRjaFZhbHVlOmZ1bmN0aW9uKGEsYyl7cmV0dXJuIGMoYil9fX0pLnN1YnNjcmliZShkKSk7cmV0dXJuIG5ldyBwKGUsZyl9KX0sdT1tLkludGVybmFscy5MaXN0PVxuZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGIpe3RoaXMuY29tcGFyZXI9Ynx8Vjt0aGlzLnNpemU9MDt0aGlzLml0ZW1zPVtdfWEuZnJvbUFycmF5PWZ1bmN0aW9uKGIsYyl7dmFyIGQsZT1iLmxlbmd0aCxnPW5ldyBhKGMpO2ZvcihkPTA7ZDxlO2QrKylnLmFkZChiW2RdKTtyZXR1cm4gZ307YS5wcm90b3R5cGUuY291bnQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5zaXplfTthLnByb3RvdHlwZS5hZGQ9ZnVuY3Rpb24oYil7dGhpcy5pdGVtc1t0aGlzLnNpemVdPWI7dGhpcy5zaXplKyt9O2EucHJvdG90eXBlLnJlbW92ZUF0PWZ1bmN0aW9uKGIpe2lmKDA+Ynx8Yj49dGhpcy5zaXplKXRocm93IEVycm9yKFwiQXJndW1lbnQgb3V0IG9mIHJhbmdlXCIpOzA9PT1iP3RoaXMuaXRlbXMuc2hpZnQoKTp0aGlzLml0ZW1zLnNwbGljZShiLDEpO3RoaXMuc2l6ZS0tfTthLnByb3RvdHlwZS5pbmRleE9mPWZ1bmN0aW9uKGIpe3ZhciBhLGQ7Zm9yKGE9MDthPHRoaXMuaXRlbXMubGVuZ3RoO2ErKylpZihkPVxudGhpcy5pdGVtc1thXSx0aGlzLmNvbXBhcmVyKGIsZCkpcmV0dXJuIGE7cmV0dXJuLTF9O2EucHJvdG90eXBlLnJlbW92ZT1mdW5jdGlvbihiKXtiPXRoaXMuaW5kZXhPZihiKTtpZigtMT09PWIpcmV0dXJuITE7dGhpcy5yZW1vdmVBdChiKTtyZXR1cm4hMH07YS5wcm90b3R5cGUuY2xlYXI9ZnVuY3Rpb24oKXt0aGlzLml0ZW1zPVtdO3RoaXMuc2l6ZT0wfTthLnByb3RvdHlwZS5pdGVtPWZ1bmN0aW9uKGIsYSl7aWYoMD5ifHxiPj1jb3VudCl0aHJvdyBFcnJvcihcIkFyZ3VtZW50IG91dCBvZiByYW5nZVwiKTtpZihhPT09bilyZXR1cm4gdGhpcy5pdGVtc1tiXTt0aGlzLml0ZW1zW2JdPWF9O2EucHJvdG90eXBlLnRvQXJyYXk9ZnVuY3Rpb24oKXt2YXIgYj1bXSxhO2ZvcihhPTA7YTx0aGlzLml0ZW1zLmxlbmd0aDthKyspYi5wdXNoKHRoaXMuaXRlbXNbYV0pO3JldHVybiBifTthLnByb3RvdHlwZS5jb250YWlucz1mdW5jdGlvbihiKXtmb3IodmFyIGE9MDthPHRoaXMuaXRlbXMubGVuZ3RoO2ErKylpZih0aGlzLmNvbXBhcmVyKGIsXG50aGlzLml0ZW1zW2FdKSlyZXR1cm4hMDtyZXR1cm4hMX07cmV0dXJuIGF9KCksa2E9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGIsYSl7dGhpcy5pZD1iO3RoaXMudmFsdWU9YX1hLnByb3RvdHlwZS5jb21wYXJlVG89ZnVuY3Rpb24oYil7dmFyIGE9dGhpcy52YWx1ZS5jb21wYXJlVG8oYi52YWx1ZSk7MD09PWEmJihhPXRoaXMuaWQtYi5pZCk7cmV0dXJuIGF9O3JldHVybiBhfSgpLFk9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGIpe3RoaXMuaXRlbXM9QXJyYXkoYik7dGhpcy5zaXplPTB9YS5wcm90b3R5cGUuY291bnQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5zaXplfTthLnByb3RvdHlwZS5pc0hpZ2hlclByaW9yaXR5PWZ1bmN0aW9uKGIsYSl7cmV0dXJuIDA+dGhpcy5pdGVtc1tiXS5jb21wYXJlVG8odGhpcy5pdGVtc1thXSl9O2EucHJvdG90eXBlLnBlcmNvbGF0ZT1mdW5jdGlvbihiKXt2YXIgYSxkO2lmKCEoYj49dGhpcy5zaXplfHwwPmIpKWlmKGE9TWF0aC5mbG9vcigoYi0xKS9cbjIpLCEoMD5hfHxhPT09YikmJnRoaXMuaXNIaWdoZXJQcmlvcml0eShiLGEpKWQ9dGhpcy5pdGVtc1tiXSx0aGlzLml0ZW1zW2JdPXRoaXMuaXRlbXNbYV0sdGhpcy5pdGVtc1thXT1kLHRoaXMucGVyY29sYXRlKGEpfTthLnByb3RvdHlwZS5oZWFwaWZ5PWZ1bmN0aW9uKGIpe3ZhciBhLGQsZTtiPT09biYmKGI9MCk7Yj49dGhpcy5zaXplfHwwPmJ8fChkPTIqYisxLGU9MipiKzIsYT1iLGQ8dGhpcy5zaXplJiZ0aGlzLmlzSGlnaGVyUHJpb3JpdHkoZCxhKSYmKGE9ZCksZTx0aGlzLnNpemUmJnRoaXMuaXNIaWdoZXJQcmlvcml0eShlLGEpJiYoYT1lKSxhIT09YiYmKGQ9dGhpcy5pdGVtc1tiXSx0aGlzLml0ZW1zW2JdPXRoaXMuaXRlbXNbYV0sdGhpcy5pdGVtc1thXT1kLHRoaXMuaGVhcGlmeShhKSkpfTthLnByb3RvdHlwZS5wZWVrPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuaXRlbXNbMF0udmFsdWV9O2EucHJvdG90eXBlLnJlbW92ZUF0PWZ1bmN0aW9uKGIpe3RoaXMuaXRlbXNbYl09XG50aGlzLml0ZW1zWy0tdGhpcy5zaXplXTtkZWxldGUgdGhpcy5pdGVtc1t0aGlzLnNpemVdO3RoaXMuaGVhcGlmeSgpO2lmKHRoaXMuc2l6ZTx0aGlzLml0ZW1zLmxlbmd0aD4+Milmb3IodmFyIGI9dGhpcy5pdGVtcyxhPXRoaXMuaXRlbXM9QXJyYXkodGhpcy5pdGVtcy5sZW5ndGg+PjEpLGQ9dGhpcy5zaXplOzA8ZDspYVtkKzAtMV09YltkKzAtMV0sZC0tfTthLnByb3RvdHlwZS5kZXF1ZXVlPWZ1bmN0aW9uKCl7dmFyIGI9dGhpcy5wZWVrKCk7dGhpcy5yZW1vdmVBdCgwKTtyZXR1cm4gYn07YS5wcm90b3R5cGUuZW5xdWV1ZT1mdW5jdGlvbihiKXt2YXIgYztpZih0aGlzLnNpemU+PXRoaXMuaXRlbXMubGVuZ3RoKXtjPXRoaXMuaXRlbXM7Zm9yKHZhciBkPXRoaXMuaXRlbXM9QXJyYXkoMip0aGlzLml0ZW1zLmxlbmd0aCksZT1jLmxlbmd0aDswPGU7KWRbZSswLTFdPWNbZSswLTFdLGUtLX1jPXRoaXMuc2l6ZSsrO3RoaXMuaXRlbXNbY109bmV3IGthKGEuY291bnQrKyxiKTt0aGlzLnBlcmNvbGF0ZShjKX07XG5hLnByb3RvdHlwZS5yZW1vdmU9ZnVuY3Rpb24oYil7dmFyIGE7Zm9yKGE9MDthPHRoaXMuc2l6ZTthKyspaWYodGhpcy5pdGVtc1thXS52YWx1ZT09PWIpcmV0dXJuIHRoaXMucmVtb3ZlQXQoYSksITA7cmV0dXJuITF9O2EuY291bnQ9MDtyZXR1cm4gYX0oKSxwPW0uQ29tcG9zaXRlRGlzcG9zYWJsZT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXt2YXIgYj0hMSxhPXUuZnJvbUFycmF5KHkuY2FsbChhcmd1bWVudHMpKTt0aGlzLmNvdW50PWZ1bmN0aW9uKCl7cmV0dXJuIGEuY291bnQoKX07dGhpcy5hZGQ9ZnVuY3Rpb24oZCl7Yj9kLmRpc3Bvc2UoKTphLmFkZChkKX07dGhpcy5yZW1vdmU9ZnVuY3Rpb24oZCl7dmFyIGU9ITE7Ynx8KGU9YS5yZW1vdmUoZCkpO2UmJmQuZGlzcG9zZSgpO3JldHVybiBlfTt0aGlzLmRpc3Bvc2U9ZnVuY3Rpb24oKXt2YXIgZCxlO2J8fChiPSEwLGQ9YS50b0FycmF5KCksYS5jbGVhcigpKTtpZihkIT09bilmb3IoZT0wO2U8ZC5sZW5ndGg7ZSsrKWRbZV0uZGlzcG9zZSgpfTtcbnRoaXMuY2xlYXI9ZnVuY3Rpb24oKXt2YXIgYixlO2I9YS50b0FycmF5KCk7YS5jbGVhcigpO2ZvcihlPTA7ZTxiLmxlbmd0aDtlKyspYltlXS5kaXNwb3NlKCl9O3RoaXMuY29udGFpbnM9ZnVuY3Rpb24oYil7cmV0dXJuIGEuY29udGFpbnMoYil9O3RoaXMuaXNEaXNwb3NlZD1mdW5jdGlvbigpe3JldHVybiBifTt0aGlzLnRvQXJyYXk9ZnVuY3Rpb24oKXtyZXR1cm4gYS50b0FycmF5KCl9fWEucHJvdG90eXBlLmNvdW50PWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuY291bnQoKX07YS5wcm90b3R5cGUuYWRkPWZ1bmN0aW9uKGIpe3RoaXMuYWRkKGIpfTthLnByb3RvdHlwZS5yZW1vdmU9ZnVuY3Rpb24oYil7dGhpcy5yZW1vdmUoYil9O2EucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXt0aGlzLmRpc3Bvc2UoKX07YS5wcm90b3R5cGUuY2xlYXI9ZnVuY3Rpb24oKXt0aGlzLmNsZWFyKCl9O2EucHJvdG90eXBlLmNvbnRhaW5zPWZ1bmN0aW9uKGIpe3JldHVybiB0aGlzLmNvbnRhaW5zKGIpfTtcbmEucHJvdG90eXBlLmlzRGlzcG9zZWQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5pc0Rpc3Bvc2VkKCl9O2EucHJvdG90eXBlLnRvQXJyYXk9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy50b0FycmF5KCl9O3JldHVybiBhfSgpLEw9bS5EaXNwb3NhYmxlPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShiKXt2YXIgYT0hMTt0aGlzLmRpc3Bvc2U9ZnVuY3Rpb24oKXthfHwoYigpLGE9ITApfX1hLnByb3RvdHlwZS5kaXNwb3NlPWZ1bmN0aW9uKCl7dGhpcy5kaXNwb3NlKCl9O3JldHVybiBhfSgpLEE9TC5jcmVhdGU9ZnVuY3Rpb24oYSl7cmV0dXJuIG5ldyBMKGEpfSx3PUwuZW1wdHk9bmV3IEwoZnVuY3Rpb24oKXt9KSx2PW0uU2luZ2xlQXNzaWdubWVudERpc3Bvc2FibGU9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKCl7dmFyIGI9ITEsYT1udWxsO3RoaXMuaXNEaXNwb3NlZD1mdW5jdGlvbigpe3JldHVybiBifTt0aGlzLmdldERpc3Bvc2FibGU9ZnVuY3Rpb24oKXtyZXR1cm4gYX07dGhpcy5zZXREaXNwb3NhYmxlPVxuZnVuY3Rpb24oZCl7aWYobnVsbCE9PWEpdGhyb3cgRXJyb3IoXCJEaXNwb3NhYmxlIGhhcyBhbHJlYWR5IGJlZW4gYXNzaWduZWRcIik7dmFyIGU9YjtlfHwoYT1kKTtlJiZudWxsIT09ZCYmZC5kaXNwb3NlKCl9O3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe3ZhciBkPW51bGw7Ynx8KGI9ITAsZD1hLGE9bnVsbCk7bnVsbCE9PWQmJmQuZGlzcG9zZSgpfX1hLnByb3RvdHlwZS5pc0Rpc3Bvc2VkPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuaXNEaXNwb3NlZCgpfTthLnByb3RvdHlwZS5kaXNwb3NhYmxlPWZ1bmN0aW9uKGIpe2lmKGI9PT1uKXJldHVybiB0aGlzLmdldERpc3Bvc2FibGUoKTt0aGlzLnNldERpc3Bvc2FibGUoYil9O2EucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXt0aGlzLmRpc3Bvc2UoKX07cmV0dXJuIGF9KCksQz1tLlNlcmlhbERpc3Bvc2FibGU9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKCl7dmFyIGI9ITEsYT1udWxsO3RoaXMuaXNEaXNwb3NlZD1mdW5jdGlvbigpe3JldHVybiBifTtcbnRoaXMuZ2V0RGlzcG9zYWJsZT1mdW5jdGlvbigpe3JldHVybiBhfTt0aGlzLnNldERpc3Bvc2FibGU9ZnVuY3Rpb24oZCl7dmFyIGU9YixnPW51bGw7ZXx8KGc9YSxhPWQpO251bGwhPT1nJiZnLmRpc3Bvc2UoKTtlJiZudWxsIT09ZCYmZC5kaXNwb3NlKCl9O3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe3ZhciBkPW51bGw7Ynx8KGI9ITAsZD1hLGE9bnVsbCk7bnVsbCE9PWQmJmQuZGlzcG9zZSgpfX1hLnByb3RvdHlwZS5pc0Rpc3Bvc2VkPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuaXNEaXNwb3NlZCgpfTthLnByb3RvdHlwZS5kaXNwb3NhYmxlPWZ1bmN0aW9uKGEpe2lmKGE9PT1uKXJldHVybiB0aGlzLmdldERpc3Bvc2FibGUoKTt0aGlzLnNldERpc3Bvc2FibGUoYSl9O2EucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXt0aGlzLmRpc3Bvc2UoKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe3RoaXMuZGlzcG9zZSgpfTtyZXR1cm4gYX0oKSxaPW0uUmVmQ291bnREaXNwb3NhYmxlPVxuZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGEpe3ZhciBjPSExLGQ9ITEsZT0wO3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe3ZhciBnPSExOyFjJiYhZCYmKGQ9ITAsMD09PWUmJihnPWM9ITApKTtnJiZhLmRpc3Bvc2UoKX07dGhpcy5nZXREaXNwb3NhYmxlPWZ1bmN0aW9uKCl7aWYoYylyZXR1cm4gdztlKys7dmFyIGc9ITE7cmV0dXJue2Rpc3Bvc2U6ZnVuY3Rpb24oKXt2YXIgaD0hMTshYyYmIWcmJihnPSEwLGUtLSwwPT09ZSYmZCYmKGg9Yz0hMCkpO2gmJmEuZGlzcG9zZSgpfX19O3RoaXMuaXNEaXNwb3NlZD1mdW5jdGlvbigpe3JldHVybiBjfX1hLnByb3RvdHlwZS5kaXNwb3NlPWZ1bmN0aW9uKCl7dGhpcy5kaXNwb3NlKCl9O2EucHJvdG90eXBlLmdldERpc3Bvc2FibGU9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5nZXREaXNwb3NhYmxlKCl9O2EucHJvdG90eXBlLmlzRGlzcG9zZWQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5pc0Rpc3Bvc2VkKCl9O3JldHVybiBhfSgpLFI7Uj1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYSxcbmMsZCxlLGcpe3RoaXMuc2NoZWR1bGVyPWE7dGhpcy5zdGF0ZT1jO3RoaXMuYWN0aW9uPWQ7dGhpcy5kdWVUaW1lPWU7dGhpcy5jb21wYXJlcj1nfHxmdW5jdGlvbihhLGIpe3JldHVybiBhLWJ9O3RoaXMuZGlzcG9zYWJsZT1uZXcgdn1hLnByb3RvdHlwZS5pbnZva2U9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5kaXNwb3NhYmxlLmRpc3Bvc2FibGUodGhpcy5pbnZva2VDb3JlKCkpfTthLnByb3RvdHlwZS5jb21wYXJlVG89ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuY29tcGFyZXIodGhpcy5kdWVUaW1lLGEuZHVlVGltZSl9O2EucHJvdG90eXBlLmlzQ2FuY2VsbGVkPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuZGlzcG9zYWJsZS5pc0Rpc3Bvc2VkKCl9O2EucHJvdG90eXBlLmludm9rZUNvcmU9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5hY3Rpb24odGhpcy5zY2hlZHVsZXIsdGhpcy5zdGF0ZSl9O3JldHVybiBhfSgpO3ZhciBzPW0uU2NoZWR1bGVyPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShhLFxuYixjLGQpe3RoaXMubm93PWE7dGhpcy5fc2NoZWR1bGU9Yjt0aGlzLl9zY2hlZHVsZVJlbGF0aXZlPWM7dGhpcy5fc2NoZWR1bGVBYnNvbHV0ZT1kfXZhciBiPWZ1bmN0aW9uKGEsYil7dmFyIGMsZCxlLGs7ZD1uZXcgcDtrPWIuZmlyc3Q7Yz1iLnNlY29uZDtlPW51bGw7ZT1mdW5jdGlvbihiKXtjKGIsZnVuY3Rpb24oYil7dmFyIGMsaCxsO2w9aD0hMTtjPW51bGw7Yz1hLnNjaGVkdWxlV2l0aFN0YXRlKGIsZnVuY3Rpb24oYSxiKXtoP2QucmVtb3ZlKGMpOmw9ITA7ZShiKTtyZXR1cm4gd30pO2x8fChkLmFkZChjKSxoPSEwKX0pfTtlKGspO3JldHVybiBkfSxjPWZ1bmN0aW9uKGEsYil7dmFyIGMsZCxlLGs7ZD1uZXcgcDtrPWIuZmlyc3Q7Yz1iLnNlY29uZDtlPWZ1bmN0aW9uKGIpe2MoYixmdW5jdGlvbihiLGMpe3ZhciBoLGwsaztrPWw9ITE7aD1hLnNjaGVkdWxlV2l0aFJlbGF0aXZlQW5kU3RhdGUoYixjLGZ1bmN0aW9uKGEsYil7bD9kLnJlbW92ZShoKTprPSEwO2UoYik7cmV0dXJuIHd9KTtcbmt8fChkLmFkZChoKSxsPSEwKX0pfTtlKGspO3JldHVybiBkfSxkPWZ1bmN0aW9uKGEsYil7dmFyIGMsZCxlLGs7ZD1uZXcgcDtrPWIuZmlyc3Q7Yz1iLnNlY29uZDtlPWZ1bmN0aW9uKGIpe2MoYixmdW5jdGlvbihiLGMpe3ZhciBoPSExLGw9ITEsaz1hLnNjaGVkdWxlV2l0aEFic29sdXRlQW5kU3RhdGUoYixjLGZ1bmN0aW9uKGEsYil7aD9kLnJlbW92ZShrKTpsPSEwO2UoYik7cmV0dXJuIHd9KTtsfHwoZC5hZGQoayksaD0hMCl9KX07ZShrKTtyZXR1cm4gZH0sZT1mdW5jdGlvbihhLGIpe2IoKTtyZXR1cm4gd307YS5wcm90b3R5cGUuc2NoZWR1bGU9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuX3NjaGVkdWxlKGEsZSl9O2EucHJvdG90eXBlLnNjaGVkdWxlV2l0aFN0YXRlPWZ1bmN0aW9uKGEsYil7cmV0dXJuIHRoaXMuX3NjaGVkdWxlKGEsYil9O2EucHJvdG90eXBlLnNjaGVkdWxlV2l0aFJlbGF0aXZlPWZ1bmN0aW9uKGEsYil7cmV0dXJuIHRoaXMuX3NjaGVkdWxlUmVsYXRpdmUoYixcbmEsZSl9O2EucHJvdG90eXBlLnNjaGVkdWxlV2l0aFJlbGF0aXZlQW5kU3RhdGU9ZnVuY3Rpb24oYSxiLGMpe3JldHVybiB0aGlzLl9zY2hlZHVsZVJlbGF0aXZlKGEsYixjKX07YS5wcm90b3R5cGUuc2NoZWR1bGVXaXRoQWJzb2x1dGU9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gdGhpcy5fc2NoZWR1bGVBYnNvbHV0ZShiLGEsZSl9O2EucHJvdG90eXBlLnNjaGVkdWxlV2l0aEFic29sdXRlQW5kU3RhdGU9ZnVuY3Rpb24oYSxiLGMpe3JldHVybiB0aGlzLl9zY2hlZHVsZUFic29sdXRlKGEsYixjKX07YS5wcm90b3R5cGUuc2NoZWR1bGVSZWN1cnNpdmU9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuc2NoZWR1bGVSZWN1cnNpdmVXaXRoU3RhdGUoYSxmdW5jdGlvbihhLGIpe2EoZnVuY3Rpb24oKXtiKGEpfSl9KX07YS5wcm90b3R5cGUuc2NoZWR1bGVSZWN1cnNpdmVXaXRoU3RhdGU9ZnVuY3Rpb24oYSxjKXtyZXR1cm4gdGhpcy5zY2hlZHVsZVdpdGhTdGF0ZSh7Zmlyc3Q6YSxzZWNvbmQ6Y30sXG5mdW5jdGlvbihhLGMpe3JldHVybiBiKGEsYyl9KX07YS5wcm90b3R5cGUuc2NoZWR1bGVSZWN1cnNpdmVXaXRoUmVsYXRpdmU9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gdGhpcy5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhSZWxhdGl2ZUFuZFN0YXRlKGIsYSxmdW5jdGlvbihhLGIpe2EoZnVuY3Rpb24oYyl7YihhLGMpfSl9KX07YS5wcm90b3R5cGUuc2NoZWR1bGVSZWN1cnNpdmVXaXRoUmVsYXRpdmVBbmRTdGF0ZT1mdW5jdGlvbihhLGIsZCl7cmV0dXJuIHRoaXMuX3NjaGVkdWxlUmVsYXRpdmUoe2ZpcnN0OmEsc2Vjb25kOmR9LGIsZnVuY3Rpb24oYSxiKXtyZXR1cm4gYyhhLGIpfSl9O2EucHJvdG90eXBlLnNjaGVkdWxlUmVjdXJzaXZlV2l0aEFic29sdXRlPWZ1bmN0aW9uKGEsYil7cmV0dXJuIHRoaXMuc2NoZWR1bGVSZWN1cnNpdmVXaXRoQWJzb2x1dGVBbmRTdGF0ZShiLGEsZnVuY3Rpb24oYSxiKXthKGZ1bmN0aW9uKGMpe2IoYSxjKX0pfSl9O2EucHJvdG90eXBlLnNjaGVkdWxlUmVjdXJzaXZlV2l0aEFic29sdXRlQW5kU3RhdGU9XG5mdW5jdGlvbihhLGIsYyl7cmV0dXJuIHRoaXMuX3NjaGVkdWxlQWJzb2x1dGUoe2ZpcnN0OmEsc2Vjb25kOmN9LGIsZnVuY3Rpb24oYSxiKXtyZXR1cm4gZChhLGIpfSl9O2Eubm93PUo7YS5ub3JtYWxpemU9ZnVuY3Rpb24oYSl7MD5hJiYoYT0wKTtyZXR1cm4gYX07cmV0dXJuIGF9KCksZj1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXt2YXIgYj10aGlzO2EuYmFzZS5jb25zdHJ1Y3Rvci5jYWxsKHRoaXMsSixmdW5jdGlvbihhLGQpe3JldHVybiBkKGIsYSl9LGZ1bmN0aW9uKGEsZCxlKXtmb3IoOzA8cy5ub3JtYWxpemUoZCk7KTtyZXR1cm4gZShiLGEpfSxmdW5jdGlvbihhLGQsZSl7cmV0dXJuIGIuc2NoZWR1bGVXaXRoUmVsYXRpdmVBbmRTdGF0ZShhLGQtYi5ub3coKSxlKX0pfW8oYSxzKTtyZXR1cm4gYX0oKSxCPXMuSW1tZWRpYXRlPW5ldyBmLGxhPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYSgpe00ucXVldWU9bmV3IFkoNCl9YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe00ucXVldWU9XG5udWxsfTthLnByb3RvdHlwZS5ydW49ZnVuY3Rpb24oKXtmb3IodmFyIGEsYz1NLnF1ZXVlOzA8Yy5jb3VudCgpOylpZihhPWMuZGVxdWV1ZSgpLCFhLmlzQ2FuY2VsbGVkKCkpe2Zvcig7MDxhLmR1ZVRpbWUtcy5ub3coKTspO2EuaXNDYW5jZWxsZWQoKXx8YS5pbnZva2UoKX19O3JldHVybiBhfSgpLE09ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKCl7dmFyIGI9dGhpczthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzLEosZnVuY3Rpb24oYSxkKXtyZXR1cm4gYi5zY2hlZHVsZVdpdGhSZWxhdGl2ZUFuZFN0YXRlKGEsMCxkKX0sZnVuY3Rpb24oYyxkLGUpe3ZhciBnPWIubm93KCkrcy5ub3JtYWxpemUoZCksZD1hLnF1ZXVlLGM9bmV3IFIoYixjLGUsZyk7aWYobnVsbD09PWQpe2U9bmV3IGxhO3RyeXthLnF1ZXVlLmVucXVldWUoYyksZS5ydW4oKX1maW5hbGx5e2UuZGlzcG9zZSgpfX1lbHNlIGQuZW5xdWV1ZShjKTtyZXR1cm4gYy5kaXNwb3NhYmxlfSxmdW5jdGlvbihhLGQsZSl7cmV0dXJuIGIuc2NoZWR1bGVXaXRoUmVsYXRpdmVBbmRTdGF0ZShhLFxuZC1iLm5vdygpLGUpfSl9byhhLHMpO2EucHJvdG90eXBlLnNjaGVkdWxlUmVxdWlyZWQ9ZnVuY3Rpb24oKXtyZXR1cm4gbnVsbD09PWEucXVldWV9O2EucHJvdG90eXBlLmVuc3VyZVRyYW1wb2xpbmU9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuc2NoZWR1bGVSZXF1aXJlZCgpP3RoaXMuc2NoZWR1bGUoYSk6YSgpfTthLnF1ZXVlPW51bGw7cmV0dXJuIGF9KCksRD1zLkN1cnJlbnRUaHJlYWQ9bmV3IE07bS5WaXJ0dWFsVGltZVNjaGVkdWxlcj1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYixjKXt2YXIgZD10aGlzO3RoaXMuY2xvY2s9Yjt0aGlzLmNvbXBhcmVyPWM7dGhpcy5pc0VuYWJsZWQ9ITE7YS5iYXNlLmNvbnN0cnVjdG9yLmNhbGwodGhpcyxmdW5jdGlvbigpe3JldHVybiBkLnRvRGF0ZVRpbWVPZmZzZXQoZC5jbG9jayl9LGZ1bmN0aW9uKGEsYil7cmV0dXJuIGQuc2NoZWR1bGVBYnNvbHV0ZShhLGQuY2xvY2ssYil9LGZ1bmN0aW9uKGEsYixjKXtyZXR1cm4gZC5zY2hlZHVsZVJlbGF0aXZlKGEsXG5kLnRvUmVsYXRpdmUoYiksYyl9LGZ1bmN0aW9uKGEsYixjKXtyZXR1cm4gZC5zY2hlZHVsZVJlbGF0aXZlKGEsZC50b1JlbGF0aXZlKGItZC5ub3coKSksYyl9KTt0aGlzLnF1ZXVlPW5ldyBZKDEwMjQpfW8oYSxzKTthLnByb3RvdHlwZS5zY2hlZHVsZVJlbGF0aXZlPWZ1bmN0aW9uKGEsYyxkKXtjPXRoaXMuYWRkKHRoaXMuY2xvY2ssYyk7cmV0dXJuIHRoaXMuc2NoZWR1bGVBYnNvbHV0ZShhLGMsZCl9O2EucHJvdG90eXBlLnN0YXJ0PWZ1bmN0aW9uKCl7dmFyIGE7aWYoIXRoaXMuaXNFbmFibGVkKXt0aGlzLmlzRW5hYmxlZD0hMDtkbyBpZihhPXRoaXMuZ2V0TmV4dCgpLG51bGwhPT1hKXtpZigwPHRoaXMuY29tcGFyZXIoYS5kdWVUaW1lLHRoaXMuY2xvY2spKXRoaXMuY2xvY2s9YS5kdWVUaW1lO2EuaW52b2tlKCl9ZWxzZSB0aGlzLmlzRW5hYmxlZD0hMTt3aGlsZSh0aGlzLmlzRW5hYmxlZCl9fTthLnByb3RvdHlwZS5zdG9wPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuaXNFbmFibGVkPVxuITF9O2EucHJvdG90eXBlLmFkdmFuY2VUbz1mdW5jdGlvbihhKXt2YXIgYztpZigwPD10aGlzLmNvbXBhcmVyKHRoaXMuY2xvY2ssYSkpdGhyb3cgRXJyb3IoXCJBcmd1bWVudCBvdXQgb2YgcmFuZ2VcIik7aWYoIXRoaXMuaXNFbmFibGVkKXt0aGlzLmlzRW5hYmxlZD0hMDtkbyBpZihjPXRoaXMuZ2V0TmV4dCgpLG51bGwhPT1jJiYwPj10aGlzLmNvbXBhcmVyKGMuZHVlVGltZSxhKSl7aWYoMDx0aGlzLmNvbXBhcmVyKGMuZHVlVGltZSx0aGlzLmNsb2NrKSl0aGlzLmNsb2NrPWMuZHVlVGltZTtjLmludm9rZSgpfWVsc2UgdGhpcy5pc0VuYWJsZWQ9ITE7d2hpbGUodGhpcy5pc0VuYWJsZWQpO3JldHVybiB0aGlzLmNsb2NrPWF9fTthLnByb3RvdHlwZS5hZHZhbmNlQnk9ZnVuY3Rpb24oYSl7YT10aGlzLmFkZCh0aGlzLmNsb2NrLGEpO2lmKDA8PXRoaXMuY29tcGFyZXIodGhpcy5jbG9jayxhKSl0aHJvdyBFcnJvcihcIkFyZ3VtZW50IG91dCBvZiByYW5nZVwiKTtyZXR1cm4gdGhpcy5hZHZhbmNlVG8oYSl9O1xuYS5wcm90b3R5cGUuZ2V0TmV4dD1mdW5jdGlvbigpe2Zvcih2YXIgYTswPHRoaXMucXVldWUuY291bnQoKTspaWYoYT10aGlzLnF1ZXVlLnBlZWsoKSxhLmlzQ2FuY2VsbGVkKCkpdGhpcy5xdWV1ZS5kZXF1ZXVlKCk7ZWxzZSByZXR1cm4gYTtyZXR1cm4gbnVsbH07YS5wcm90b3R5cGUuc2NoZWR1bGVBYnNvbHV0ZT1mdW5jdGlvbihhLGMsZCl7dmFyIGU9dGhpcyxnPW5ldyBSKGUsYSxmdW5jdGlvbihhLGIpe2UucXVldWUucmVtb3ZlKGcpO3JldHVybiBkKGEsYil9LGMsZS5jb21wYXJlcik7ZS5xdWV1ZS5lbnF1ZXVlKGcpO3JldHVybiBnLmRpc3Bvc2FibGV9O3JldHVybiBhfSgpO3ZhciBmPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYSgpe3ZhciBiPXRoaXM7YS5iYXNlLmNvbnN0cnVjdG9yLmNhbGwodGhpcyxKLGZ1bmN0aW9uKGEsZCl7dmFyIGU9eC5zZXRUaW1lb3V0KGZ1bmN0aW9uKCl7ZChiLGEpfSwwKTtyZXR1cm4gQShmdW5jdGlvbigpe3guY2xlYXJUaW1lb3V0KGUpfSl9LGZ1bmN0aW9uKGEsXG5kLGUpe3ZhciBnLGQ9cy5ub3JtYWxpemUoZCk7Zz14LnNldFRpbWVvdXQoZnVuY3Rpb24oKXtlKGIsYSl9LGQpO3JldHVybiBBKGZ1bmN0aW9uKCl7eC5jbGVhclRpbWVvdXQoZyl9KX0sZnVuY3Rpb24oYSxkLGUpe3JldHVybiBiLnNjaGVkdWxlV2l0aFJlbGF0aXZlQW5kU3RhdGUoYSxkLWIubm93KCksZSl9KX1vKGEscyk7cmV0dXJuIGF9KCksbWE9cy5UaW1lb3V0PW5ldyBmLHQ9bS5Ob3RpZmljYXRpb249ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKCl7fWEucHJvdG90eXBlLmFjY2VwdD1mdW5jdGlvbihhLGMsZCl7cmV0dXJuIDE8YXJndW1lbnRzLmxlbmd0aHx8XCJmdW5jdGlvblwiPT09dHlwZW9mIGE/dGhpcy5fYWNjZXB0KGEsYyxkKTp0aGlzLl9hY2NlcHRPYnNlcnZhYmxlKGEpfTthLnByb3RvdHlwZS50b09ic2VydmFibGU9ZnVuY3Rpb24oYSl7dmFyIGM9dGhpcyxhPWF8fHMuSW1tZWRpYXRlO3JldHVybiBpKGZ1bmN0aW9uKGQpe3JldHVybiBhLnNjaGVkdWxlKGZ1bmN0aW9uKCl7Yy5fYWNjZXB0T2JzZXJ2YWJsZShkKTtcbmlmKFwiTlwiPT09Yy5raW5kKWQub25Db21wbGV0ZWQoKX0pfSl9O2EucHJvdG90eXBlLmhhc1ZhbHVlPSExO2EucHJvdG90eXBlLmVxdWFscz1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy50b1N0cmluZygpPT09KGE9PT1ufHxudWxsPT09YT9cIlwiOmEudG9TdHJpbmcoKSl9O3JldHVybiBhfSgpO3QuY3JlYXRlT25OZXh0PWZ1bmN0aW9uKGEpe3ZhciBiPW5ldyB0O2IudmFsdWU9YTtiLmhhc1ZhbHVlPSEwO2Iua2luZD1cIk5cIjtiLl9hY2NlcHQ9ZnVuY3Rpb24oYSl7cmV0dXJuIGEodGhpcy52YWx1ZSl9O2IuX2FjY2VwdE9ic2VydmFibGU9ZnVuY3Rpb24oYSl7cmV0dXJuIGEub25OZXh0KHRoaXMudmFsdWUpfTtiLnRvU3RyaW5nPWZ1bmN0aW9uKCl7cmV0dXJuXCJPbk5leHQoXCIrdGhpcy52YWx1ZStcIilcIn07cmV0dXJuIGJ9O3QuY3JlYXRlT25FcnJvcj1mdW5jdGlvbihhKXt2YXIgYj1uZXcgdDtiLmV4Y2VwdGlvbj1hO2Iua2luZD1cIkVcIjtiLl9hY2NlcHQ9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gYih0aGlzLmV4Y2VwdGlvbil9O1xuYi5fYWNjZXB0T2JzZXJ2YWJsZT1mdW5jdGlvbihhKXtyZXR1cm4gYS5vbkVycm9yKHRoaXMuZXhjZXB0aW9uKX07Yi50b1N0cmluZz1mdW5jdGlvbigpe3JldHVyblwiT25FcnJvcihcIit0aGlzLmV4Y2VwdGlvbitcIilcIn07cmV0dXJuIGJ9O3QuY3JlYXRlT25Db21wbGV0ZWQ9ZnVuY3Rpb24oKXt2YXIgYT1uZXcgdDthLmtpbmQ9XCJDXCI7YS5fYWNjZXB0PWZ1bmN0aW9uKGEsYyxkKXtyZXR1cm4gZCgpfTthLl9hY2NlcHRPYnNlcnZhYmxlPWZ1bmN0aW9uKGEpe3JldHVybiBhLm9uQ29tcGxldGVkKCl9O2EudG9TdHJpbmc9ZnVuY3Rpb24oKXtyZXR1cm5cIk9uQ29tcGxldGVkKClcIn07cmV0dXJuIGF9O3ZhciBHPWZ1bmN0aW9uKCl7fSxmPUcucHJvdG90eXBlO2YuY29uY2F0PWZ1bmN0aW9uKCl7dmFyIGE9dGhpcztyZXR1cm4gaShmdW5jdGlvbihiKXt2YXIgYyxkPWEuZ2V0RW51bWVyYXRvcigpLGU9ITEsZz1uZXcgQztjPUIuc2NoZWR1bGVSZWN1cnNpdmUoZnVuY3Rpb24oYSl7dmFyIGMsXG56LHE9ITE7aWYoIWUpe3RyeXtpZihxPWQubW92ZU5leHQoKSljPWQuY3VycmVudH1jYXRjaChrKXt6PWt9aWYodm9pZCAwIT09eiliLm9uRXJyb3Ioeik7ZWxzZSBpZihxKXo9bmV3IHYsZy5kaXNwb3NhYmxlKHopLHouZGlzcG9zYWJsZShjLnN1YnNjcmliZShmdW5jdGlvbihhKXtiLm9uTmV4dChhKX0sZnVuY3Rpb24oYSl7Yi5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2EoKX0pKTtlbHNlIGIub25Db21wbGV0ZWQoKX19KTtyZXR1cm4gbmV3IHAoZyxjLEEoZnVuY3Rpb24oKXtlPSEwfSkpfSl9O2YuY2F0Y2hFeGNlcHRpb249ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGIpe3ZhciBjLGQ9YS5nZXRFbnVtZXJhdG9yKCksZT0hMSxnLGg7Zz1uZXcgQztjPUIuc2NoZWR1bGVSZWN1cnNpdmUoZnVuY3Rpb24oYSl7dmFyIGMscSxrO2s9ITE7aWYoIWUpe3RyeXtpZihrPWQubW92ZU5leHQoKSljPWQuY3VycmVudH1jYXRjaChmKXtxPWZ9aWYodm9pZCAwIT09cSliLm9uRXJyb3IocSk7XG5lbHNlIGlmKGspcT1uZXcgdixnLmRpc3Bvc2FibGUocSkscS5kaXNwb3NhYmxlKGMuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2Iub25OZXh0KGEpfSxmdW5jdGlvbihiKXtoPWI7YSgpfSxmdW5jdGlvbigpe2Iub25Db21wbGV0ZWQoKX0pKTtlbHNlIGlmKHZvaWQgMCE9PWgpYi5vbkVycm9yKGgpO2Vsc2UgYi5vbkNvbXBsZXRlZCgpfX0pO3JldHVybiBuZXcgcChnLGMsQShmdW5jdGlvbigpe2U9ITB9KSl9KX07dmFyICQ9Ry5yZXBlYXQ9ZnVuY3Rpb24oYSxiKXtiPT09biYmKGI9LTEpO3ZhciBjPW5ldyBHO2MuZ2V0RW51bWVyYXRvcj1mdW5jdGlvbigpe3JldHVybntsZWZ0OmIsY3VycmVudDpudWxsLG1vdmVOZXh0OmZ1bmN0aW9uKCl7aWYoMD09PXRoaXMubGVmdClyZXR1cm4gdGhpcy5jdXJyZW50PW51bGwsITE7MDx0aGlzLmxlZnQmJnRoaXMubGVmdC0tO3RoaXMuY3VycmVudD1hO3JldHVybiEwfX19O3JldHVybiBjfSxTPUcuZm9yRW51bWVyYXRvcj1mdW5jdGlvbihhKXt2YXIgYj1cbm5ldyBHO2IuZ2V0RW51bWVyYXRvcj1mdW5jdGlvbigpe3JldHVybntfaW5kZXg6LTEsY3VycmVudDpudWxsLG1vdmVOZXh0OmZ1bmN0aW9uKCl7aWYoKyt0aGlzLl9pbmRleDxhLmxlbmd0aClyZXR1cm4gdGhpcy5jdXJyZW50PWFbdGhpcy5faW5kZXhdLCEwO3RoaXMuX2luZGV4PS0xO3RoaXMuY3VycmVudD1udWxsO3JldHVybiExfX19O3JldHVybiBifSxyPW0uT2JzZXJ2ZXI9ZnVuY3Rpb24oKXt9LFQ9bS5JbnRlcm5hbHMuQWJzdHJhY3RPYnNlcnZlcj1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXt0aGlzLmlzU3RvcHBlZD0hMX1vKGEscik7YS5wcm90b3R5cGUub25OZXh0PWZ1bmN0aW9uKGEpe3RoaXMuaXNTdG9wcGVkfHx0aGlzLm5leHQoYSl9O2EucHJvdG90eXBlLm9uRXJyb3I9ZnVuY3Rpb24oYSl7aWYoIXRoaXMuaXNTdG9wcGVkKXRoaXMuaXNTdG9wcGVkPSEwLHRoaXMuZXJyb3IoYSl9O2EucHJvdG90eXBlLm9uQ29tcGxldGVkPWZ1bmN0aW9uKCl7aWYoIXRoaXMuaXNTdG9wcGVkKXRoaXMuaXNTdG9wcGVkPVxuITAsdGhpcy5jb21wbGV0ZWQoKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe3RoaXMuaXNTdG9wcGVkPSEwfTtyZXR1cm4gYX0oKSxOPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShiLGMsZCl7YS5iYXNlLmNvbnN0cnVjdG9yLmNhbGwodGhpcyk7dGhpcy5fb25OZXh0PWI7dGhpcy5fb25FcnJvcj1jO3RoaXMuX29uQ29tcGxldGVkPWR9byhhLFQpO2EucHJvdG90eXBlLm5leHQ9ZnVuY3Rpb24oYSl7dGhpcy5fb25OZXh0KGEpfTthLnByb3RvdHlwZS5lcnJvcj1mdW5jdGlvbihhKXt0aGlzLl9vbkVycm9yKGEpfTthLnByb3RvdHlwZS5jb21wbGV0ZWQ9ZnVuY3Rpb24oKXt0aGlzLl9vbkNvbXBsZXRlZCgpfTtyZXR1cm4gYX0oKSxIPW0uSW50ZXJuYWxzLkJpbmFyeU9ic2VydmVyPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShhLGMpe1wiZnVuY3Rpb25cIj09PXR5cGVvZiBhJiZcImZ1bmN0aW9uXCI9PT10eXBlb2YgYz8odGhpcy5sZWZ0T2JzZXJ2ZXI9YWEoYSksdGhpcy5yaWdodE9ic2VydmVyPVxuYWEoYykpOih0aGlzLmxlZnRPYnNlcnZlcj1hLHRoaXMucmlnaHRPYnNlcnZlcj1jKX1vKGEscik7YS5wcm90b3R5cGUub25OZXh0PWZ1bmN0aW9uKGEpe3ZhciBjPXRoaXM7cmV0dXJuIGEuc3dpdGNoVmFsdWUoZnVuY3Rpb24oYSl7cmV0dXJuIGEuYWNjZXB0KGMubGVmdE9ic2VydmVyKX0sZnVuY3Rpb24oYSl7cmV0dXJuIGEuYWNjZXB0KGMucmlnaHRPYnNlcnZlcil9KX07YS5wcm90b3R5cGUub25FcnJvcj1mdW5jdGlvbigpe307YS5wcm90b3R5cGUub25Db21wbGV0ZWQ9ZnVuY3Rpb24oKXt9O3JldHVybiBhfSgpLG5hPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShhLGMpe3RoaXMuc2NoZWR1bGVyPWE7dGhpcy5vYnNlcnZlcj1jO3RoaXMuaGFzRmF1bHRlZD10aGlzLmlzQWNxdWlyZWQ9ITE7dGhpcy5xdWV1ZT1bXTt0aGlzLmRpc3Bvc2FibGU9bmV3IEN9byhhLFQpO2EucHJvdG90eXBlLmVuc3VyZUFjdGl2ZT1mdW5jdGlvbigpe3ZhciBhPSExLGM9dGhpcztpZighdGhpcy5oYXNGYXVsdGVkJiZcbjA8dGhpcy5xdWV1ZS5sZW5ndGgpYT0hdGhpcy5pc0FjcXVpcmVkLHRoaXMuaXNBY3F1aXJlZD0hMDthJiZ0aGlzLmRpc3Bvc2FibGUuZGlzcG9zYWJsZSh0aGlzLnNjaGVkdWxlci5zY2hlZHVsZVJlY3Vyc2l2ZShmdW5jdGlvbihhKXt2YXIgYjtpZigwPGMucXVldWUubGVuZ3RoKXtiPWMucXVldWUuc2hpZnQoKTt0cnl7YigpfWNhdGNoKGcpe3Rocm93IGMucXVldWU9W10sYy5oYXNGYXVsdGVkPSEwLGc7fWEoKX1lbHNlIGMuaXNBY3F1aXJlZD0hMX0pKX07YS5wcm90b3R5cGUubmV4dD1mdW5jdGlvbihhKXt2YXIgYz10aGlzO3RoaXMucXVldWUucHVzaChmdW5jdGlvbigpe2Mub2JzZXJ2ZXIub25OZXh0KGEpfSl9O2EucHJvdG90eXBlLmVycm9yPWZ1bmN0aW9uKGEpe3ZhciBjPXRoaXM7dGhpcy5xdWV1ZS5wdXNoKGZ1bmN0aW9uKCl7Yy5vYnNlcnZlci5vbkVycm9yKGEpfSl9O2EucHJvdG90eXBlLmNvbXBsZXRlZD1mdW5jdGlvbigpe3ZhciBhPXRoaXM7dGhpcy5xdWV1ZS5wdXNoKGZ1bmN0aW9uKCl7YS5vYnNlcnZlci5vbkNvbXBsZXRlZCgpfSl9O1xuYS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe2EuYmFzZS5kaXNwb3NlLmNhbGwodGhpcyk7dGhpcy5kaXNwb3NhYmxlLmRpc3Bvc2UoKX07cmV0dXJuIGF9KCksST1yLmNyZWF0ZT1mdW5jdGlvbihhLGIsYyl7Ynx8KGI9ZnVuY3Rpb24oYSl7dGhyb3cgYTt9KTtjfHwoYz1mdW5jdGlvbigpe30pO3JldHVybiBuZXcgTihhLGIsYyl9O3IuZnJvbU5vdGlmaWVyPWZ1bmN0aW9uKGEpe3JldHVybiBuZXcgTihmdW5jdGlvbihiKXtyZXR1cm4gYSh0LmNyZWF0ZU9uTmV4dChiKSl9LGZ1bmN0aW9uKGIpe3JldHVybiBhKHQuY3JlYXRlT25FcnJvcihiKSl9LGZ1bmN0aW9uKCl7cmV0dXJuIGEodC5jcmVhdGVPbkNvbXBsZXRlZCgpKX0pfTt2YXIgYWE9ZnVuY3Rpb24oYSl7cmV0dXJuIG5ldyBOKGZ1bmN0aW9uKGIpe2EodC5jcmVhdGVPbk5leHQoYikpfSxmdW5jdGlvbihiKXthKHQuY3JlYXRlT25FcnJvcihiKSl9LGZ1bmN0aW9uKCl7YSh0LmNyZWF0ZU9uQ29tcGxldGVkKCkpfSl9O1xuci5wcm90b3R5cGUudG9Ob3RpZmllcj1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIGZ1bmN0aW9uKGIpe3JldHVybiBiLmFjY2VwdChhKX19O3IucHJvdG90eXBlLmFzT2JzZXJ2ZXI9ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBuZXcgTihmdW5jdGlvbihiKXtyZXR1cm4gYS5vbk5leHQoYil9LGZ1bmN0aW9uKGIpe3JldHVybiBhLm9uRXJyb3IoYil9LGZ1bmN0aW9uKCl7cmV0dXJuIGEub25Db21wbGV0ZWQoKX0pfTt2YXIgaj1tLk9ic2VydmFibGU9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKCl7fWEucHJvdG90eXBlLnN1YnNjcmliZT1mdW5jdGlvbihhLGMsZCl7cmV0dXJuIHRoaXMuX3N1YnNjcmliZSgwPT09YXJndW1lbnRzLmxlbmd0aHx8MTxhcmd1bWVudHMubGVuZ3RofHxcImZ1bmN0aW9uXCI9PT10eXBlb2YgYT9JKGEsYyxkKTphKX07cmV0dXJuIGF9KCksZj1qLnByb3RvdHlwZSxwYT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYil7YS5iYXNlLmNvbnN0cnVjdG9yLmNhbGwodGhpcyk7XG50aGlzLl9zdWJzY3JpYmU9ZnVuY3Rpb24oYSl7dmFyIGQ9bmV3IG9hKGEpO0Quc2NoZWR1bGVSZXF1aXJlZCgpP0Quc2NoZWR1bGUoZnVuY3Rpb24oKXtkLmRpc3Bvc2FibGUoYihkKSl9KTpkLmRpc3Bvc2FibGUoYihkKSk7cmV0dXJuIGR9fW8oYSxqKTthLnByb3RvdHlwZS5fc3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLl9zdWJzY3JpYmUoYSl9O3JldHVybiBhfSgpLG9hPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShiKXthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzKTt0aGlzLm9ic2VydmVyPWI7dGhpcy5tPW5ldyB2fW8oYSxUKTthLnByb3RvdHlwZS5kaXNwb3NhYmxlPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLm0uZGlzcG9zYWJsZShhKX07YS5wcm90b3R5cGUubmV4dD1mdW5jdGlvbihhKXt0aGlzLm9ic2VydmVyLm9uTmV4dChhKX07YS5wcm90b3R5cGUuZXJyb3I9ZnVuY3Rpb24oYSl7dGhpcy5vYnNlcnZlci5vbkVycm9yKGEpO3RoaXMubS5kaXNwb3NlKCl9O1xuYS5wcm90b3R5cGUuY29tcGxldGVkPWZ1bmN0aW9uKCl7dGhpcy5vYnNlcnZlci5vbkNvbXBsZXRlZCgpO3RoaXMubS5kaXNwb3NlKCl9O2EucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXthLmJhc2UuZGlzcG9zZS5jYWxsKHRoaXMpO3RoaXMubS5kaXNwb3NlKCl9O3JldHVybiBhfSgpLGJhPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShiLGMsZCl7YS5iYXNlLmNvbnN0cnVjdG9yLmNhbGwodGhpcyk7dGhpcy5rZXk9Yjt0aGlzLnVuZGVybHlpbmdPYnNlcnZhYmxlPSFkP2M6aShmdW5jdGlvbihhKXtyZXR1cm4gbmV3IHAoZC5nZXREaXNwb3NhYmxlKCksYy5zdWJzY3JpYmUoYSkpfSl9byhhLGopO2EucHJvdG90eXBlLl9zdWJzY3JpYmU9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMudW5kZXJseWluZ09ic2VydmFibGUuc3Vic2NyaWJlKGEpfTtyZXR1cm4gYX0oKSxxYT1tLkNvbm5lY3RhYmxlT2JzZXJ2YWJsZT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYSxjKXt2YXIgZD1hLmFzT2JzZXJ2YWJsZSgpLFxuZT0hMSxnPW51bGw7dGhpcy5jb25uZWN0PWZ1bmN0aW9uKCl7ZXx8KGU9ITAsZz1uZXcgcChkLnN1YnNjcmliZShjKSxBKGZ1bmN0aW9uKCl7ZT0hMX0pKSk7cmV0dXJuIGd9O3RoaXMuX3N1YnNjcmliZT1mdW5jdGlvbihhKXtyZXR1cm4gYy5zdWJzY3JpYmUoYSl9fW8oYSxqKTthLnByb3RvdHlwZS5jb25uZWN0PWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuY29ubmVjdCgpfTthLnByb3RvdHlwZS5yZWZDb3VudD1mdW5jdGlvbigpe3ZhciBhPW51bGwsYz0wLGQ9dGhpcztyZXR1cm4gaShmdW5jdGlvbihlKXt2YXIgZyxoO2MrKztnPTE9PT1jO2g9ZC5zdWJzY3JpYmUoZSk7ZyYmKGE9ZC5jb25uZWN0KCkpO3JldHVybiBBKGZ1bmN0aW9uKCl7aC5kaXNwb3NlKCk7Yy0tOzA9PT1jJiZhLmRpc3Bvc2UoKX0pfSl9O2EucHJvdG90eXBlLl9zdWJzY3JpYmU9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuX3N1YnNjcmliZShhKX07cmV0dXJuIGF9KCksTz1tLlN1YmplY3Q9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKCl7YS5iYXNlLmNvbnN0cnVjdG9yLmNhbGwodGhpcyk7XG52YXIgYj0hMSxjPSExLGQ9bmV3IHUsZT1uLGc9ZnVuY3Rpb24oKXtpZihiKXRocm93IEVycm9yKEspO307dGhpcy5vbkNvbXBsZXRlZD1mdW5jdGlvbigpe3ZhciBhLGI7ZygpO2N8fChhPWQudG9BcnJheSgpLGQ9bmV3IHUsYz0hMCk7aWYoYSE9PW4pZm9yKGI9MDtiPGEubGVuZ3RoO2IrKylhW2JdLm9uQ29tcGxldGVkKCl9O3RoaXMub25FcnJvcj1mdW5jdGlvbihhKXt2YXIgYix6O2coKTtjfHwoYj1kLnRvQXJyYXkoKSxkPW5ldyB1LGM9ITAsZT1hKTtpZihiIT09bilmb3Ioej0wO3o8Yi5sZW5ndGg7eisrKWJbel0ub25FcnJvcihhKX07dGhpcy5vbk5leHQ9ZnVuY3Rpb24oYSl7dmFyIGIsZTtnKCk7Y3x8KGI9ZC50b0FycmF5KCkpO2lmKHZvaWQgMCE9PWIpZm9yKGU9MDtlPGIubGVuZ3RoO2UrKyliW2VdLm9uTmV4dChhKX07dGhpcy5fc3Vic2NyaWJlPWZ1bmN0aW9uKGEpe2coKTtpZighYylyZXR1cm4gZC5hZGQoYSksZnVuY3Rpb24oYSl7cmV0dXJue29ic2VydmVyOmEsZGlzcG9zZTpmdW5jdGlvbigpe2lmKG51bGwhPT1cbnRoaXMub2JzZXJ2ZXImJiFiKWQucmVtb3ZlKHRoaXMub2JzZXJ2ZXIpLHRoaXMub2JzZXJ2ZXI9bnVsbH19fShhKTtpZihlIT09bilyZXR1cm4gYS5vbkVycm9yKGUpLHc7YS5vbkNvbXBsZXRlZCgpO3JldHVybiB3fTt0aGlzLmRpc3Bvc2U9ZnVuY3Rpb24oKXtiPSEwO2Q9bnVsbH19byhhLGopO0UoYSxyKTthLnByb3RvdHlwZS5vbkNvbXBsZXRlZD1mdW5jdGlvbigpe3RoaXMub25Db21wbGV0ZWQoKX07YS5wcm90b3R5cGUub25FcnJvcj1mdW5jdGlvbihhKXt0aGlzLm9uRXJyb3IoYSl9O2EucHJvdG90eXBlLm9uTmV4dD1mdW5jdGlvbihhKXt0aGlzLm9uTmV4dChhKX07YS5wcm90b3R5cGUuX3N1YnNjcmliZT1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5fc3Vic2NyaWJlKGEpfTthLnByb3RvdHlwZS5kaXNwb3NlPWZ1bmN0aW9uKCl7dGhpcy5kaXNwb3NlKCl9O2EuY3JlYXRlPWZ1bmN0aW9uKGEsYyl7cmV0dXJuIG5ldyByYShhLGMpfTtyZXR1cm4gYX0oKSxVPW0uQXN5bmNTdWJqZWN0PVxuZnVuY3Rpb24oKXtmdW5jdGlvbiBhKCl7YS5iYXNlLmNvbnN0cnVjdG9yLmNhbGwodGhpcyk7dmFyIGI9ITEsYz0hMSxkPW51bGwsZT0hMSxnPW5ldyB1LGg9bnVsbCxsPWZ1bmN0aW9uKCl7aWYoYil0aHJvdyBFcnJvcihLKTt9O3RoaXMub25Db21wbGV0ZWQ9ZnVuY3Rpb24oKXt2YXIgYT0hMSxiLGgsZjtsKCk7Y3x8KGI9Zy50b0FycmF5KCksZz1uZXcgdSxjPSEwLGg9ZCxhPWUpO2lmKGIhPT1uKWlmKGEpZm9yKGY9MDtmPGIubGVuZ3RoO2YrKylhPWJbZl0sYS5vbk5leHQoaCksYS5vbkNvbXBsZXRlZCgpO2Vsc2UgZm9yKGY9MDtmPGIubGVuZ3RoO2YrKyliW2ZdLm9uQ29tcGxldGVkKCl9O3RoaXMub25FcnJvcj1mdW5jdGlvbihhKXt2YXIgYixkO2woKTtjfHwoYj1nLnRvQXJyYXkoKSxnPW5ldyB1LGM9ITAsaD1hKTtpZihiIT09bilmb3IoZD0wO2Q8Yi5sZW5ndGg7ZCsrKWJbZF0ub25FcnJvcihhKX07dGhpcy5vbk5leHQ9ZnVuY3Rpb24oYSl7bCgpO2N8fChkPWEsZT0hMCl9O1xudGhpcy5fc3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3ZhciBxLGssZjtsKCk7aWYoIWMpcmV0dXJuIGcuYWRkKGEpLGZ1bmN0aW9uKGEpe3JldHVybntvYnNlcnZlcjphLGRpc3Bvc2U6ZnVuY3Rpb24oKXtpZihudWxsIT09dGhpcy5vYnNlcnZlciYmIWIpZy5yZW1vdmUodGhpcy5vYnNlcnZlciksdGhpcy5vYnNlcnZlcj1udWxsfX19KGEpO3E9aDtrPWU7Zj1kO2lmKG51bGwhPT1xKWEub25FcnJvcihxKTtlbHNle2lmKGspYS5vbk5leHQoZik7YS5vbkNvbXBsZXRlZCgpfXJldHVybiB3fTt0aGlzLmRpc3Bvc2U9ZnVuY3Rpb24oKXtiPSEwO2Q9aD1nPW51bGx9fW8oYSxqKTtFKGEscik7YS5wcm90b3R5cGUub25Db21wbGV0ZWQ9ZnVuY3Rpb24oKXt0aGlzLm9uQ29tcGxldGVkKCl9O2EucHJvdG90eXBlLm9uRXJyb3I9ZnVuY3Rpb24oYSl7dGhpcy5vbkVycm9yKGEpfTthLnByb3RvdHlwZS5vbk5leHQ9ZnVuY3Rpb24oYSl7dGhpcy5vbk5leHQoYSl9O2EucHJvdG90eXBlLl9zdWJzY3JpYmU9XG5mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5fc3Vic2NyaWJlKGEpfTthLnByb3RvdHlwZS5kaXNwb3NlPWZ1bmN0aW9uKCl7dGhpcy5kaXNwb3NlKCl9O3JldHVybiBhfSgpLFA9bS5CZWhhdmlvclN1YmplY3Q9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGIpe2EuYmFzZS5jb25zdHJ1Y3Rvci5jYWxsKHRoaXMpO3ZhciBjPWIsZD1uZXcgdSxlPSExLGc9ITEsaD1udWxsLGw9ZnVuY3Rpb24oKXtpZihlKXRocm93IEVycm9yKEspO307dGhpcy5vbkNvbXBsZXRlZD1mdW5jdGlvbigpe3ZhciBhLGI7YT1udWxsO2woKTtnfHwoYT1kLnRvQXJyYXkoKSxkPW5ldyB1LGc9ITApO2lmKG51bGwhPT1hKWZvcihiPTA7YjxhLmxlbmd0aDtiKyspYVtiXS5vbkNvbXBsZXRlZCgpfTt0aGlzLm9uRXJyb3I9ZnVuY3Rpb24oYSl7dmFyIGIsYztjPW51bGw7bCgpO2d8fChjPWQudG9BcnJheSgpLGQ9bmV3IHUsZz0hMCxoPWEpO2lmKG51bGwhPT1jKWZvcihiPTA7YjxjLmxlbmd0aDtiKyspY1tiXS5vbkVycm9yKGEpfTtcbnRoaXMub25OZXh0PWZ1bmN0aW9uKGEpe3ZhciBiLGU7Yj1udWxsO2woKTtnfHwoYz1hLGI9ZC50b0FycmF5KCkpO2lmKG51bGwhPT1iKWZvcihlPTA7ZTxiLmxlbmd0aDtlKyspYltlXS5vbk5leHQoYSl9O3RoaXMuX3N1YnNjcmliZT1mdW5jdGlvbihhKXt2YXIgYjtsKCk7aWYoIWcpcmV0dXJuIGQuYWRkKGEpLGEub25OZXh0KGMpLGZ1bmN0aW9uKGEpe3JldHVybntvYnNlcnZlcjphLGRpc3Bvc2U6ZnVuY3Rpb24oKXtpZihudWxsIT09dGhpcy5vYnNlcnZlciYmIWUpZC5yZW1vdmUodGhpcy5vYnNlcnZlciksdGhpcy5vYnNlcnZlcj1udWxsfX19KGEpO2I9aDtpZihudWxsIT09YilhLm9uRXJyb3IoYik7ZWxzZSBhLm9uQ29tcGxldGVkKCk7cmV0dXJuIHd9O3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe2U9ITA7aD1jPWQ9bnVsbH19byhhLGopO0UoYSxyKTthLnByb3RvdHlwZS5vbkNvbXBsZXRlZD1mdW5jdGlvbigpe3RoaXMub25Db21wbGV0ZWQoKX07YS5wcm90b3R5cGUub25FcnJvcj1cbmZ1bmN0aW9uKGEpe3RoaXMub25FcnJvcihhKX07YS5wcm90b3R5cGUub25OZXh0PWZ1bmN0aW9uKGEpe3RoaXMub25OZXh0KGEpfTthLnByb3RvdHlwZS5fc3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLl9zdWJzY3JpYmUoYSl9O2EucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXt0aGlzLmRpc3Bvc2UoKX07cmV0dXJuIGF9KCk7UC5wcm90b3R5cGUudG9Ob3RpZmllcj1yLnByb3RvdHlwZS50b05vdGlmaWVyO1AucHJvdG90eXBlLmFzT2JzZXJ2ZXI9ci5wcm90b3R5cGUuQXNPYnNlcnZlcjt2YXIgY2E9bS5SZXBsYXlTdWJqZWN0PWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShhLGMsZCl7dmFyIGU9YT09PW4/TnVtYmVyLk1BWF9WQUxVRTphLGc9Yz09PW4/TnVtYmVyLk1BWF9WQUxVRTpjLGg9ZHx8cy5jdXJyZW50VGhyZWFkLGw9W10sZj1uZXcgdSxxPSExLGs9ITEsaT1mdW5jdGlvbihhKXt2YXIgYj1xPzE6MCxjPWIrZTtmb3IoYzxlJiYoYz1lKTtsLmxlbmd0aD5jOylsLnNoaWZ0KCk7XG5mb3IoO2wubGVuZ3RoPmImJmEtbFswXS50aW1lc3RhbXA+ZzspbC5zaGlmdCgpfSxqPWZ1bmN0aW9uKGEpe3ZhciBiPWgubm93KCk7bC5wdXNoKHt2YWx1ZTphLHRpbWVzdGFtcDpifSk7aShiKX0sbT1mdW5jdGlvbigpe2lmKGspdGhyb3cgRXJyb3IoSyk7fTt0aGlzLm9uTmV4dD1mdW5jdGlvbihhKXt2YXIgYj1udWxsLGMsZDttKCk7aWYoIXEpe2I9Zi50b0FycmF5KCk7aih0LmNyZWF0ZU9uTmV4dChhKSk7Zm9yKGQ9MDtkPGIubGVuZ3RoO2QrKyljPWJbZF0sYy5vbk5leHQoYSl9aWYobnVsbCE9PWIpZm9yKGQ9MDtkPGIubGVuZ3RoO2QrKyljPWJbZF0sYy5lbnN1cmVBY3RpdmUoKX07dGhpcy5vbkVycm9yPWZ1bmN0aW9uKGEpe3ZhciBiPW51bGwsYzttKCk7aWYoIXEpe3E9ITA7aih0LmNyZWF0ZU9uRXJyb3IoYSkpO2I9Zi50b0FycmF5KCk7Zm9yKGM9MDtjPGIubGVuZ3RoO2MrKyliW2NdLm9uRXJyb3IoYSk7Zj1uZXcgdX1pZihudWxsIT09Yilmb3IoYz0wO2M8Yi5sZW5ndGg7YysrKWJbY10uZW5zdXJlQWN0aXZlKCl9O1xudGhpcy5vbkNvbXBsZXRlZD1mdW5jdGlvbigpe3ZhciBhPW51bGwsYjttKCk7aWYoIXEpe3E9ITA7aih0LmNyZWF0ZU9uQ29tcGxldGVkKCkpO2E9Zi50b0FycmF5KCk7Zm9yKGI9MDtiPGEubGVuZ3RoO2IrKylhW2JdLm9uQ29tcGxldGVkKCk7Zj1uZXcgdX1pZihudWxsIT09YSlmb3IoYj0wO2I8YS5sZW5ndGg7YisrKWFbYl0uZW5zdXJlQWN0aXZlKCl9O3RoaXMuX3N1YnNjcmliZT1mdW5jdGlvbihhKXt2YXIgYT1uZXcgbmEoaCxhKSxiPWZ1bmN0aW9uKGEpe3JldHVybntvYnNlcnZlcjphLGRpc3Bvc2U6ZnVuY3Rpb24oKXt0aGlzLm9ic2VydmVyLmRpc3Bvc2UoKTtudWxsIT09dGhpcy5vYnNlcnZlciYmIWsmJmYucmVtb3ZlKHRoaXMub2JzZXJ2ZXIpfX19KGEpLGM7bSgpO2koaC5ub3coKSk7Zi5hZGQoYSk7Zm9yKGM9MDtjPGwubGVuZ3RoO2MrKylsW2NdLnZhbHVlLmFjY2VwdChhKTthLmVuc3VyZUFjdGl2ZSgpO3JldHVybiBifTt0aGlzLmRpc3Bvc2U9ZnVuY3Rpb24oKXtrPVxuITA7Zj1udWxsfX1vKGEsaik7RShhLGopO2EucHJvdG90eXBlLm9uTmV4dD1mdW5jdGlvbihhKXt0aGlzLm9uTmV4dChhKX07YS5wcm90b3R5cGUub25FcnJvcj1mdW5jdGlvbihhKXt0aGlzLm9uRXJyb3IoYSl9O2EucHJvdG90eXBlLm9uQ29tcGxldGVkPWZ1bmN0aW9uKCl7dGhpcy5vbkNvbXBsZXRlZCgpfTthLnByb3RvdHlwZS5fc3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLl9zdWJzY3JpYmUoYSl9O2EucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXt0aGlzLmRpc3Bvc2UoKX07cmV0dXJuIGF9KCkscmE9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGEsYyl7dGhpcy5vYnNlcnZlcj1hO3RoaXMub2JzZXJ2YWJsZT1jfW8oYSxqKTtFKGEscik7YS5wcm90b3R5cGUub25Db21wbGV0ZWQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5vYnNlcnZlci5vbkNvbXBsZXRlZCgpfTthLnByb3RvdHlwZS5vbkVycm9yPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLm9ic2VydmVyLm9uRXJyb3IoYSl9O1xuYS5wcm90b3R5cGUub25OZXh0PWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLm9ic2VydmVyLm9uTmV4dChhKX07YS5wcm90b3R5cGUuX1N1YnNjcmliZT1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5vYnNlcnZhYmxlLlN1YnNjcmliZShhKX07cmV0dXJuIGF9KCk7ai5zdGFydD1mdW5jdGlvbihhLGIsYyxkKXtjfHwoYz1bXSk7cmV0dXJuIHNhKGEsZCkuYXBwbHkoYixjKX07dmFyIHNhPWoudG9Bc3luYz1mdW5jdGlvbihhLGIpe2J8fChiPW1hKTtyZXR1cm4gZnVuY3Rpb24oKXt2YXIgYz1uZXcgVSxkPWZ1bmN0aW9uKCl7dmFyIGI7dHJ5e2I9YS5hcHBseSh0aGlzLGFyZ3VtZW50cyl9Y2F0Y2goZCl7Yy5vbkVycm9yKGQpO3JldHVybn1jLm9uTmV4dChiKTtjLm9uQ29tcGxldGVkKCl9LGU9eS5jYWxsKGFyZ3VtZW50cyksZz10aGlzO2Iuc2NoZWR1bGUoZnVuY3Rpb24oKXtkLmFwcGx5KGcsZSl9KTtyZXR1cm4gY319O2YubXVsdGljYXN0PWZ1bmN0aW9uKGEsYil7dmFyIGM9dGhpcztyZXR1cm5cImZ1bmN0aW9uXCI9PT1cbnR5cGVvZiBhP2koZnVuY3Rpb24oZCl7dmFyIGU9Yy5tdWx0aWNhc3QoYSgpKTtyZXR1cm4gbmV3IHAoYihlKS5zdWJzY3JpYmUoZCksZS5jb25uZWN0KCkpfSk6bmV3IHFhKGMsYSl9O2YucHVibGlzaD1mdW5jdGlvbihhKXtyZXR1cm4hYT90aGlzLm11bHRpY2FzdChuZXcgTyk6dGhpcy5tdWx0aWNhc3QoZnVuY3Rpb24oKXtyZXR1cm4gbmV3IE99LGEpfTtmLnB1Ymxpc2hMYXN0PWZ1bmN0aW9uKGEpe3JldHVybiFhP3RoaXMubXVsdGljYXN0KG5ldyBVKTp0aGlzLm11bHRpY2FzdChmdW5jdGlvbigpe3JldHVybiBuZXcgVX0sYSl9O2YucmVwbGF5PWZ1bmN0aW9uKGEsYixjLGQpe3JldHVybiFhfHxudWxsPT09YT90aGlzLm11bHRpY2FzdChuZXcgY2EoYixjLGQpKTp0aGlzLm11bHRpY2FzdChmdW5jdGlvbigpe3JldHVybiBuZXcgY2EoYixjLGQpfSxhKX07Zi5wdWJsaXNoVmFsdWU9ZnVuY3Rpb24oYSxiKXtyZXR1cm5cImZ1bmN0aW9uXCI9PT10eXBlb2YgYT90aGlzLm11bHRpY2FzdChmdW5jdGlvbigpe3JldHVybiBuZXcgUChiKX0sXG5hKTp0aGlzLm11bHRpY2FzdChuZXcgUChhKSl9O3ZhciBkYT1qLm5ldmVyPWZ1bmN0aW9uKCl7cmV0dXJuIGkoZnVuY3Rpb24oKXtyZXR1cm4gd30pfSx0YT1qLmVtcHR5PWZ1bmN0aW9uKGEpe2F8fChhPUIpO3JldHVybiBpKGZ1bmN0aW9uKGIpe3JldHVybiBhLnNjaGVkdWxlKGZ1bmN0aW9uKCl7cmV0dXJuIGIub25Db21wbGV0ZWQoKX0pfSl9LHVhPWoucmV0dXJuVmFsdWU9ZnVuY3Rpb24oYSxiKXtifHwoYj1CKTtyZXR1cm4gaShmdW5jdGlvbihjKXtyZXR1cm4gYi5zY2hlZHVsZShmdW5jdGlvbigpe2Mub25OZXh0KGEpO3JldHVybiBjLm9uQ29tcGxldGVkKCl9KX0pfSxlYT1qLnRocm93RXhjZXB0aW9uPWZ1bmN0aW9uKGEsYil7Ynx8KGI9Qik7cmV0dXJuIGkoZnVuY3Rpb24oYyl7cmV0dXJuIGIuc2NoZWR1bGUoZnVuY3Rpb24oKXtyZXR1cm4gYy5vbkVycm9yKGEpfSl9KX0sdmE9ai5nZW5lcmF0ZT1mdW5jdGlvbihhLGIsYyxkLGUpe2V8fChlPUQpO3JldHVybiBpKGZ1bmN0aW9uKGcpe3ZhciBoPVxuITAsZj1hO3JldHVybiBlLnNjaGVkdWxlUmVjdXJzaXZlKGZ1bmN0aW9uKGEpe3ZhciBlLGs7dHJ5e2g/aD0hMTpmPWMoZiksKGU9YihmKSkmJihrPWQoZikpfWNhdGNoKGkpe2cub25FcnJvcihpKTtyZXR1cm59aWYoZSlnLm9uTmV4dChrKSxhKCk7ZWxzZSBnLm9uQ29tcGxldGVkKCl9KX0pfSxmYT1qLmRlZmVyPWZ1bmN0aW9uKGEpe3JldHVybiBpKGZ1bmN0aW9uKGIpe3ZhciBjO3RyeXtjPWEoKX1jYXRjaChkKXtyZXR1cm4gZWEoZCkuc3Vic2NyaWJlKGIpfXJldHVybiBjLnN1YnNjcmliZShiKX0pfTtqLnVzaW5nPWZ1bmN0aW9uKGEsYil7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9dyxlLGc7dHJ5e2U9YSgpLG51bGwhPT1lJiYoZD1lKSxnPWIoZSl9Y2F0Y2goaCl7cmV0dXJuIG5ldyBwKGVhKGgpLnN1YnNjcmliZShjKSxkKX1yZXR1cm4gbmV3IHAoZy5zdWJzY3JpYmUoYyksZCl9KX07dmFyIGdhPWouZnJvbUFycmF5PWZ1bmN0aW9uKGEsYil7Ynx8KGI9RCk7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9XG4wO3JldHVybiBiLnNjaGVkdWxlUmVjdXJzaXZlKGZ1bmN0aW9uKGIpe2lmKGQ8YS5sZW5ndGgpYy5vbk5leHQoYVtkKytdKSxiKCk7ZWxzZSBjLm9uQ29tcGxldGVkKCl9KX0pfSxpPWouY3JlYXRlV2l0aERpc3Bvc2FibGU9ZnVuY3Rpb24oYSl7cmV0dXJuIG5ldyBwYShhKX07ai5jcmVhdGU9ZnVuY3Rpb24oYSl7cmV0dXJuIGkoZnVuY3Rpb24oYil7cmV0dXJuIEEoYShiKSl9KX07ai5yYW5nZT1mdW5jdGlvbihhLGIsYyl7Y3x8KGM9RCk7dmFyIGQ9YStiLTE7cmV0dXJuIHZhKGEsZnVuY3Rpb24oYSl7cmV0dXJuIGE8PWR9LGZ1bmN0aW9uKGEpe3JldHVybiBhKzF9LGZ1bmN0aW9uKGEpe3JldHVybiBhfSxjKX07Zi5yZXBlYXQ9ZnVuY3Rpb24oYSl7cmV0dXJuICQodGhpcyxhKS5jb25jYXQoKX07Zi5yZXRyeT1mdW5jdGlvbihhKXtyZXR1cm4gJCh0aGlzLGEpLmNhdGNoRXhjZXB0aW9uKCl9O2oucmVwZWF0PWZ1bmN0aW9uKGEsYixjKXtjfHwoYz1EKTtiPT09biYmKGI9LTEpO3JldHVybiB1YShhLFxuYykucmVwZWF0KGIpfTtmLnNlbGVjdD1mdW5jdGlvbihhKXt2YXIgYj10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGMpe3ZhciBkPTA7cmV0dXJuIGIuc3Vic2NyaWJlKGZ1bmN0aW9uKGIpe3ZhciBnO3RyeXtnPWEoYixkKyspfWNhdGNoKGgpe2Mub25FcnJvcihoKTtyZXR1cm59Yy5vbk5leHQoZyl9LGZ1bmN0aW9uKGEpe2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtjLm9uQ29tcGxldGVkKCl9KX0pfTtmLndoZXJlPWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9MDtyZXR1cm4gYi5zdWJzY3JpYmUoZnVuY3Rpb24oYil7dmFyIGc7dHJ5e2c9YShiLGQrKyl9Y2F0Y2goaCl7Yy5vbkVycm9yKGgpO3JldHVybn1pZihnKWMub25OZXh0KGIpfSxmdW5jdGlvbihhKXtjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Yy5vbkNvbXBsZXRlZCgpfSl9KX07Zi5ncm91cEJ5VW50aWw9ZnVuY3Rpb24oYSxiLGMsZCl7dmFyIGU9dGhpcztifHwoYj1RKTtkfHwoZD1cblcpO3JldHVybiBpKGZ1bmN0aW9uKGcpe3ZhciBoPXt9LGY9bmV3IHAsaT1uZXcgWihmKTtmLmFkZChlLnN1YnNjcmliZShmdW5jdGlvbihlKXt2YXIgayxqLG0sdCxvLHAsdSxzLHI7dHJ5e2o9YShlKSxwPWQoail9Y2F0Y2godyl7Zm9yKHIgaW4gaCloW3JdLm9uRXJyb3Iodyk7Zy5vbkVycm9yKHcpO3JldHVybn1vPSExO3RyeXtzPWhbcF0sc3x8KHM9bmV3IE8saFtwXT1zLG89ITApfWNhdGNoKHgpe2ZvcihyIGluIGgpaFtyXS5vbkVycm9yKHgpO2cub25FcnJvcih4KTtyZXR1cm59aWYobyl7bz1uZXcgYmEoaixzLGkpO2o9bmV3IGJhKGoscyk7dHJ5e2s9YyhqKX1jYXRjaCh5KXtmb3IociBpbiBoKWhbcl0ub25FcnJvcih5KTtnLm9uRXJyb3IoeSk7cmV0dXJufWcub25OZXh0KG8pO3U9bmV3IHY7Zi5hZGQodSk7dD1mdW5jdGlvbigpe2hbcF0hPT1uJiYoZGVsZXRlIGhbcF0scy5vbkNvbXBsZXRlZCgpKTtmLnJlbW92ZSh1KX07dS5kaXNwb3NhYmxlKGsudGFrZSgxKS5zdWJzY3JpYmUoZnVuY3Rpb24oKXt9LFxuZnVuY3Rpb24oYSl7Zm9yKHIgaW4gaCloW3JdLm9uRXJyb3IoYSk7Zy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe3QoKX0pKX10cnl7bT1iKGUpfWNhdGNoKEEpe2ZvcihyIGluIGgpaFtyXS5vbkVycm9yKEEpO2cub25FcnJvcihBKTtyZXR1cm59cy5vbk5leHQobSl9LGZ1bmN0aW9uKGEpe2Zvcih2YXIgYiBpbiBoKWhbYl0ub25FcnJvcihhKTtnLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Zm9yKHZhciBhIGluIGgpaFthXS5vbkNvbXBsZXRlZCgpO2cub25Db21wbGV0ZWQoKX0pKTtyZXR1cm4gaX0pfTtmLmdyb3VwQnk9ZnVuY3Rpb24oYSxiLGMpe3JldHVybiB0aGlzLmdyb3VwQnlVbnRpbChhLGIsZnVuY3Rpb24oKXtyZXR1cm4gZGEoKX0sYyl9O2YudGFrZT1mdW5jdGlvbihhLGIpe2lmKDA+YSl0aHJvdyBFcnJvcihcIkFyZ3VtZW50IG91dCBvZiByYW5nZVwiKTtpZigwPT1hKXJldHVybiB0YShiKTt2YXIgYz10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGIpe3ZhciBlPWE7cmV0dXJuIGMuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2lmKDA8XG5lJiYoZS0tLGIub25OZXh0KGEpLDA9PT1lKSliLm9uQ29tcGxldGVkKCl9LGZ1bmN0aW9uKGEpe3JldHVybiBiLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7cmV0dXJuIGIub25Db21wbGV0ZWQoKX0pfSl9O2Yuc2tpcD1mdW5jdGlvbihhKXtpZigwPmEpdGhyb3cgRXJyb3IoXCJBcmd1bWVudCBvdXQgb2YgcmFuZ2VcIik7dmFyIGI9dGhpcztyZXR1cm4gaShmdW5jdGlvbihjKXt2YXIgZD1hO3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbihhKXtpZigwPj1kKWMub25OZXh0KGEpO2Vsc2UgZC0tfSxmdW5jdGlvbihhKXtyZXR1cm4gYy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe3JldHVybiBjLm9uQ29tcGxldGVkKCl9KX0pfTtmLnRha2VXaGlsZT1mdW5jdGlvbihhKXt2YXIgYj10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGMpe3ZhciBkPTAsZT0hMDtyZXR1cm4gYi5zdWJzY3JpYmUoZnVuY3Rpb24oYil7aWYoZSl7dHJ5e2U9YShiLGQrKyl9Y2F0Y2goaCl7Yy5vbkVycm9yKGgpO3JldHVybn1pZihlKWMub25OZXh0KGIpO1xuZWxzZSBjLm9uQ29tcGxldGVkKCl9fSxmdW5jdGlvbihhKXtyZXR1cm4gYy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe3JldHVybiBjLm9uQ29tcGxldGVkKCl9KX0pfTtmLnNraXBXaGlsZT1mdW5jdGlvbihhKXt2YXIgYj10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGMpe3ZhciBkPTAsZT0hMTtyZXR1cm4gYi5zdWJzY3JpYmUoZnVuY3Rpb24oYil7aWYoIWUpdHJ5e2U9IWEoYixkKyspfWNhdGNoKGgpe2Mub25FcnJvcihoKTtyZXR1cm59aWYoZSljLm9uTmV4dChiKX0sZnVuY3Rpb24oYSl7Yy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2Mub25Db21wbGV0ZWQoKX0pfSl9O2Yuc2VsZWN0TWFueT1mdW5jdGlvbihhLGIpe3JldHVybiBiIT09bj90aGlzLnNlbGVjdE1hbnkoZnVuY3Rpb24oYyl7cmV0dXJuIGEoYykuc2VsZWN0KGZ1bmN0aW9uKGEpe3JldHVybiBiKGMsYSl9KX0pOlwiZnVuY3Rpb25cIj09PXR5cGVvZiBhP3RoaXMuc2VsZWN0KGEpLm1lcmdlT2JzZXJ2YWJsZSgpOnRoaXMuc2VsZWN0KGZ1bmN0aW9uKCl7cmV0dXJuIGF9KS5tZXJnZU9ic2VydmFibGUoKX07XG5mLmZpbmFsVmFsdWU9ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGIpe3ZhciBjPSExLGQ7cmV0dXJuIGEuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2M9ITA7ZD1hfSxmdW5jdGlvbihhKXtiLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7aWYoYyliLm9uTmV4dChkKSxiLm9uQ29tcGxldGVkKCk7ZWxzZSBiLm9uRXJyb3IoRXJyb3IoXCJTZXF1ZW5jZSBjb250YWlucyBubyBlbGVtZW50cy5cIikpfSl9KX07Zi50b0FycmF5PWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuc2NhbihbXSxmdW5jdGlvbihhLGIpe2EucHVzaChiKTtyZXR1cm4gYX0pLnN0YXJ0V2l0aChbXSkuZmluYWxWYWx1ZSgpfTtmLm1hdGVyaWFsaXplPWZ1bmN0aW9uKCl7dmFyIGE9dGhpcztyZXR1cm4gaShmdW5jdGlvbihiKXtyZXR1cm4gYS5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7Yi5vbk5leHQodC5jcmVhdGVPbk5leHQoYSkpfSxmdW5jdGlvbihhKXtiLm9uTmV4dCh0LmNyZWF0ZU9uRXJyb3IoYSkpO1xuYi5vbkNvbXBsZXRlZCgpfSxmdW5jdGlvbigpe2Iub25OZXh0KHQuY3JlYXRlT25Db21wbGV0ZWQoKSk7Yi5vbkNvbXBsZXRlZCgpfSl9KX07Zi5kZW1hdGVyaWFsaXplPWZ1bmN0aW9uKCl7dmFyIGE9dGhpcztyZXR1cm4gaShmdW5jdGlvbihiKXtyZXR1cm4gYS5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7cmV0dXJuIGEuYWNjZXB0KGIpfSxmdW5jdGlvbihhKXtiLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Yi5vbkNvbXBsZXRlZCgpfSl9KX07Zi5hc09ic2VydmFibGU9ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGIpe3JldHVybiBhLnN1YnNjcmliZShiKX0pfTtmLndpbmRvd1dpdGhDb3VudD1mdW5jdGlvbihhLGIpe3ZhciBjPXRoaXM7aWYoMD49YSl0aHJvdyBFcnJvcihcIkFyZ3VtZW50IG91dCBvZiByYW5nZVwiKTtiPT09biYmKGI9YSk7aWYoMD49Yil0aHJvdyBFcnJvcihcIkFyZ3VtZW50IG91dCBvZiByYW5nZVwiKTtyZXR1cm4gaShmdW5jdGlvbihkKXt2YXIgZT1cbm5ldyB2LGc9bmV3IFooZSksaD0wLGY9W10saT1mdW5jdGlvbigpe3ZhciBhPW5ldyBPO2YucHVzaChhKTtkLm9uTmV4dChqYShhLGcpKX07aSgpO2UuZGlzcG9zYWJsZShjLnN1YnNjcmliZShmdW5jdGlvbihjKXt2YXIgZDtmb3IoZD0wO2Q8Zi5sZW5ndGg7ZCsrKWZbZF0ub25OZXh0KGMpO2M9aC1hKzE7MDw9YyYmMD09PWMlYiYmKGM9Zi5zaGlmdCgpLGMub25Db21wbGV0ZWQoKSk7aCsrOzA9PT1oJWImJmkoKX0sZnVuY3Rpb24oYSl7Zm9yKDswPGYubGVuZ3RoOylmLnNoaWZ0KCkub25FcnJvcihhKTtkLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Zm9yKDswPGYubGVuZ3RoOylmLnNoaWZ0KCkub25Db21wbGV0ZWQoKTtkLm9uQ29tcGxldGVkKCl9KSk7cmV0dXJuIGd9KX07Zi5idWZmZXJXaXRoQ291bnQ9ZnVuY3Rpb24oYSxiKXtiPT09biYmKGI9YSk7cmV0dXJuIHRoaXMud2luZG93V2l0aENvdW50KGEsYikuc2VsZWN0TWFueShmdW5jdGlvbihhKXtyZXR1cm4gYS50b0FycmF5KCl9KS53aGVyZShmdW5jdGlvbihhKXtyZXR1cm4gMDxcbmEubGVuZ3RofSl9O2Yuc3RhcnRXaXRoPWZ1bmN0aW9uKCl7dmFyIGEsYjthPTA7MDxhcmd1bWVudHMubGVuZ3RoJiZ2b2lkIDAhPT1hcmd1bWVudHNbMF0ubm93PyhiPWFyZ3VtZW50c1swXSxhPTEpOmI9QjthPXkuY2FsbChhcmd1bWVudHMsYSk7cmV0dXJuIFMoW2dhKGEsYiksdGhpc10pLmNvbmNhdCgpfTtmLnNjYW49ZnVuY3Rpb24oYSxiKXt2YXIgYz10aGlzO3JldHVybiBmYShmdW5jdGlvbigpe3ZhciBkPSExLGU7cmV0dXJuIGMuc2VsZWN0KGZ1bmN0aW9uKGMpe2Q/ZT1iKGUsYyk6KGU9YihhLGMpLGQ9ITApO3JldHVybiBlfSl9KX07Zi5zY2FuMT1mdW5jdGlvbihhKXt2YXIgYj10aGlzO3JldHVybiBmYShmdW5jdGlvbigpe3ZhciBjPSExLGQ7cmV0dXJuIGIuc2VsZWN0KGZ1bmN0aW9uKGIpe2M/ZD1hKGQsYik6KGQ9YixjPSEwKTtyZXR1cm4gZH0pfSl9O2YuZGlzdGluY3RVbnRpbENoYW5nZWQ9ZnVuY3Rpb24oYSxiKXt2YXIgYz10aGlzO2F8fChhPVEpO2J8fChiPVYpO1xucmV0dXJuIGkoZnVuY3Rpb24oZCl7dmFyIGU9ITEsZztyZXR1cm4gYy5zdWJzY3JpYmUoZnVuY3Rpb24oYyl7dmFyIGY9ITEsaTt0cnl7aT1hKGMpfWNhdGNoKGope2Qub25FcnJvcihqKTtyZXR1cm59aWYoZSl0cnl7Zj1iKGcsaSl9Y2F0Y2goayl7ZC5vbkVycm9yKGspO3JldHVybn1pZighZXx8IWYpZT0hMCxnPWksZC5vbk5leHQoYyl9LGZ1bmN0aW9uKGEpe2Qub25FcnJvcihhKX0sZnVuY3Rpb24oKXtkLm9uQ29tcGxldGVkKCl9KX0pfTtmLmZpbmFsbHlBY3Rpb249ZnVuY3Rpb24oYSl7dmFyIGI9dGhpcztyZXR1cm4gaShmdW5jdGlvbihjKXt2YXIgZD1iLnN1YnNjcmliZShjKTtyZXR1cm4gQShmdW5jdGlvbigpe3RyeXtkLmRpc3Bvc2UoKX1maW5hbGx5e2EoKX19KX0pfTtmLmRvQWN0aW9uPWZ1bmN0aW9uKGEsYixjKXt2YXIgZD10aGlzLGU7MD09YXJndW1lbnRzLmxlbmd0aHx8MTxhcmd1bWVudHMubGVuZ3RofHxcImZ1bmN0aW9uXCI9PXR5cGVvZiBhP2U9YTooZT1mdW5jdGlvbihiKXthLm9uTmV4dChiKX0sXG5iPWZ1bmN0aW9uKGIpe2Eub25FcnJvcihiKX0sYz1mdW5jdGlvbigpe2Eub25Db21wbGV0ZWQoKX0pO3JldHVybiBpKGZ1bmN0aW9uKGEpe3JldHVybiBkLnN1YnNjcmliZShmdW5jdGlvbihiKXt0cnl7ZShiKX1jYXRjaChjKXthLm9uRXJyb3IoYyl9YS5vbk5leHQoYil9LGZ1bmN0aW9uKGMpe2lmKGIpdHJ5e2IoYyl9Y2F0Y2goZCl7YS5vbkVycm9yKGQpfWEub25FcnJvcihjKX0sZnVuY3Rpb24oKXtpZihjKXRyeXtjKCl9Y2F0Y2goYil7YS5vbkVycm9yKGIpfWEub25Db21wbGV0ZWQoKX0pfSl9O2Yuc2tpcExhc3Q9ZnVuY3Rpb24oYSl7dmFyIGI9dGhpcztyZXR1cm4gaShmdW5jdGlvbihjKXt2YXIgZD1bXTtyZXR1cm4gYi5zdWJzY3JpYmUoZnVuY3Rpb24oYil7ZC5wdXNoKGIpO2lmKGQubGVuZ3RoPmEpYy5vbk5leHQoZC5zaGlmdCgpKX0sZnVuY3Rpb24oYSl7Yy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2Mub25Db21wbGV0ZWQoKX0pfSl9O2YudGFrZUxhc3Q9ZnVuY3Rpb24oYSl7dmFyIGI9XG50aGlzO3JldHVybiBpKGZ1bmN0aW9uKGMpe3ZhciBkPVtdO3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbihiKXtkLnB1c2goYik7ZC5sZW5ndGg+YSYmZC5zaGlmdCgpfSxmdW5jdGlvbihhKXtjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Zm9yKDswPGQubGVuZ3RoOyljLm9uTmV4dChkLnNoaWZ0KCkpO2Mub25Db21wbGV0ZWQoKX0pfSl9O2YuaWdub3JlRWxlbWVudHM9ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGIpe3JldHVybiBhLnN1YnNjcmliZShpYSxmdW5jdGlvbihhKXtiLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Yi5vbkNvbXBsZXRlZCgpfSl9KX07Zi5lbGVtZW50QXQ9ZnVuY3Rpb24oYSl7aWYoMD5hKXRocm93IEVycm9yKFwiQXJndW1lbnQgb3V0IG9mIHJhbmdlXCIpO3ZhciBiPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9YTtyZXR1cm4gYi5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7MD09PWQmJihjLm9uTmV4dChhKSxjLm9uQ29tcGxldGVkKCkpO1xuZC0tfSxmdW5jdGlvbihhKXtjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Yy5vbkVycm9yKEVycm9yKFwiQXJndW1lbnQgb3V0IG9mIHJhbmdlXCIpKX0pfSl9O2YuZWxlbWVudEF0T3JEZWZhdWx0PWZ1bmN0aW9uKGEsYil7dmFyIGM9dGhpcztpZigwPmEpdGhyb3cgRXJyb3IoXCJBcmd1bWVudCBvdXQgb2YgcmFuZ2VcIik7Yj09PW4mJihiPW51bGwpO3JldHVybiBpKGZ1bmN0aW9uKGQpe3ZhciBlPWE7cmV0dXJuIGMuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpezA9PT1lJiYoZC5vbk5leHQoYSksZC5vbkNvbXBsZXRlZCgpKTtlLS19LGZ1bmN0aW9uKGEpe2Qub25FcnJvcihhKX0sZnVuY3Rpb24oKXtkLm9uTmV4dChiKTtkLm9uQ29tcGxldGVkKCl9KX0pfTtmLmRlZmF1bHRJZkVtcHR5PWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7YT09PW4mJihhPW51bGwpO3JldHVybiBpKGZ1bmN0aW9uKGMpe3ZhciBkPSExO3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbihhKXtkPSEwO2Mub25OZXh0KGEpfSxcbmZ1bmN0aW9uKGEpe2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtpZighZCljLm9uTmV4dChhKTtjLm9uQ29tcGxldGVkKCl9KX0pfTtmLmRpc3RpbmN0PWZ1bmN0aW9uKGEsYil7dmFyIGM9dGhpczthfHwoYT1RKTtifHwoYj1XKTtyZXR1cm4gaShmdW5jdGlvbihkKXt2YXIgZT17fTtyZXR1cm4gYy5zdWJzY3JpYmUoZnVuY3Rpb24oYyl7dmFyIGYsaSxqLHE9ITE7dHJ5e2Y9YShjKSxpPWIoZil9Y2F0Y2goayl7ZC5vbkVycm9yKGspO3JldHVybn1mb3IoaiBpbiBlKWlmKGk9PT1qKXtxPSEwO2JyZWFrfXF8fChlW2ldPW51bGwsZC5vbk5leHQoYykpfSxmdW5jdGlvbihhKXtkLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7ZC5vbkNvbXBsZXRlZCgpfSl9KX07Zi5tZXJnZU9ic2VydmFibGU9ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGIpe3ZhciBjPW5ldyBwLGQ9ITEsZT1uZXcgdjtjLmFkZChlKTtlLmRpc3Bvc2FibGUoYS5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7dmFyIGU9XG5uZXcgdjtjLmFkZChlKTtlLmRpc3Bvc2FibGUoYS5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7Yi5vbk5leHQoYSl9LGZ1bmN0aW9uKGEpe2Iub25FcnJvcihhKX0sZnVuY3Rpb24oKXtjLnJlbW92ZShlKTtpZihkJiYxPT09Yy5jb3VudCgpKWIub25Db21wbGV0ZWQoKX0pKX0sZnVuY3Rpb24oYSl7Yi5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2Q9ITA7aWYoMT09PWMuY291bnQoKSliLm9uQ29tcGxldGVkKCl9KSk7cmV0dXJuIGN9KX07Zi5tZXJnZT1mdW5jdGlvbihhKXt2YXIgYj10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGMpe3ZhciBkPTAsZT1uZXcgcCxnPSExLGY9W10saT1mdW5jdGlvbihhKXt2YXIgYj1uZXcgdjtlLmFkZChiKTtiLmRpc3Bvc2FibGUoYS5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7Yy5vbk5leHQoYSl9LGZ1bmN0aW9uKGEpe2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXt2YXIgYTtlLnJlbW92ZShiKTtpZigwPGYubGVuZ3RoKWE9Zi5zaGlmdCgpLGkoYSk7ZWxzZSBpZihkLS0sXG5nJiYwPT09ZCljLm9uQ29tcGxldGVkKCl9KSl9O2UuYWRkKGIuc3Vic2NyaWJlKGZ1bmN0aW9uKGIpe2Q8YT8oZCsrLGkoYikpOmYucHVzaChiKX0sZnVuY3Rpb24oYSl7Yy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2c9ITA7aWYoMD09PWQpYy5vbkNvbXBsZXRlZCgpfSkpO3JldHVybiBlfSl9O2Yuc3dpdGNoTGF0ZXN0PWZ1bmN0aW9uKCl7dmFyIGE9dGhpcztyZXR1cm4gaShmdW5jdGlvbihiKXt2YXIgYz0hMSxkPW5ldyBDLGU9ITEsZz0wLGY9YS5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7dmFyIGY9bmV3IHYsaD0rK2c7Yz0hMDtkLmRpc3Bvc2FibGUoZik7cmV0dXJuIGYuZGlzcG9zYWJsZShhLnN1YnNjcmliZShmdW5jdGlvbihhKXtpZihnPT09aCliLm9uTmV4dChhKX0sZnVuY3Rpb24oYSl7aWYoZz09PWgpYi5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2lmKGc9PT1oJiYoYz0hMSxlKSliLm9uQ29tcGxldGVkKCl9KSl9LGZ1bmN0aW9uKGEpe2Iub25FcnJvcihhKX0sZnVuY3Rpb24oKXtlPVxuITA7aWYoIWMpYi5vbkNvbXBsZXRlZCgpfSk7cmV0dXJuIG5ldyBwKGYsZCl9KX07ai5tZXJnZT1mdW5jdGlvbihhKXthfHwoYT1CKTt2YXIgYj0xPGFyZ3VtZW50cy5sZW5ndGgmJmFyZ3VtZW50c1sxXWluc3RhbmNlb2YgQXJyYXk/YXJndW1lbnRzWzFdOnkuY2FsbChhcmd1bWVudHMsMSk7cmV0dXJuIGdhKGIsYSkubWVyZ2VPYnNlcnZhYmxlKCl9O2YuY29uY2F0PWZ1bmN0aW9uKCl7dmFyIGE9d2EsYjtiPWFyZ3VtZW50czt2YXIgYyxkO2M9W107Zm9yKGQ9MDtkPGIubGVuZ3RoO2QrKyljLnB1c2goYltkXSk7Yj1jO2IudW5zaGlmdCh0aGlzKTtyZXR1cm4gYS5hcHBseSh0aGlzLGIpfTtmLmNvbmNhdE9ic2VydmFibGU9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5tZXJnZSgxKX07dmFyIHdhPWouY29uY2F0PWZ1bmN0aW9uKCl7dmFyIGE9MT09PWFyZ3VtZW50cy5sZW5ndGgmJmFyZ3VtZW50c1swXWluc3RhbmNlb2YgQXJyYXk/YXJndW1lbnRzWzBdOnkuY2FsbChhcmd1bWVudHMpO1xucmV0dXJuIFMoYSkuY29uY2F0KCl9O2YuY2F0Y2hFeGNlcHRpb249ZnVuY3Rpb24oYSl7cmV0dXJuXCJmdW5jdGlvblwiPT09dHlwZW9mIGE/eGEodGhpcyxhKTp5YShbdGhpcyxhXSl9O3ZhciB4YT1mdW5jdGlvbihhLGIpe3JldHVybiBpKGZ1bmN0aW9uKGMpe3ZhciBkPW5ldyB2LGU9bmV3IEM7ZC5kaXNwb3NhYmxlKGEuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2Mub25OZXh0KGEpfSxmdW5jdGlvbihhKXt2YXIgZDt0cnl7ZD1iKGEpfWNhdGNoKGYpe2Mub25FcnJvcihmKTtyZXR1cm59YT1uZXcgdjtlLmRpc3Bvc2FibGUoYSk7YS5kaXNwb3NhYmxlKGQuc3Vic2NyaWJlKGMpKX0sZnVuY3Rpb24oKXtjLm9uQ29tcGxldGVkKCl9KSk7cmV0dXJuIGV9KX0seWE9ai5jYXRjaEV4Y2VwdGlvbj1mdW5jdGlvbigpe3ZhciBhPTE9PT1hcmd1bWVudHMubGVuZ3RoJiZhcmd1bWVudHNbMF1pbnN0YW5jZW9mIEFycmF5P2FyZ3VtZW50c1swXTp5LmNhbGwoYXJndW1lbnRzKTtyZXR1cm4gUyhhKS5jYXRjaEV4Y2VwdGlvbigpfTtcbmYub25FcnJvclJlc3VtZU5leHQ9ZnVuY3Rpb24oYSl7cmV0dXJuIHphKFt0aGlzLGFdKX07dmFyIHphPWoub25FcnJvclJlc3VtZU5leHQ9ZnVuY3Rpb24oKXt2YXIgYT0xPT09YXJndW1lbnRzLmxlbmd0aCYmYXJndW1lbnRzWzBdaW5zdGFuY2VvZiBBcnJheT9hcmd1bWVudHNbMF06eS5jYWxsKGFyZ3VtZW50cyk7cmV0dXJuIGkoZnVuY3Rpb24oYil7dmFyIGM9MCxkPW5ldyBDLGU9Qi5zY2hlZHVsZVJlY3Vyc2l2ZShmdW5jdGlvbihlKXt2YXIgZixpO2lmKGM8YS5sZW5ndGgpZj1hW2MrK10saT1uZXcgdixkLmRpc3Bvc2FibGUoaSksaS5kaXNwb3NhYmxlKGYuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2Iub25OZXh0KGEpfSxmdW5jdGlvbigpe2UoKX0sZnVuY3Rpb24oKXtlKCl9KSk7ZWxzZSBiLm9uQ29tcGxldGVkKCl9KTtyZXR1cm4gbmV3IHAoZCxlKX0pfSxBYT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYSxjKXt2YXIgZD10aGlzO3RoaXMuc2VsZWN0b3I9YTt0aGlzLm9ic2VydmVyPVxuYzt0aGlzLmxlZnRRPVtdO3RoaXMucmlnaHRRPVtdO3RoaXMubGVmdD1JKGZ1bmN0aW9uKGEpe2lmKFwiRVwiPT09YS5raW5kKWQub2JzZXJ2ZXIub25FcnJvcihhLmV4Y2VwdGlvbik7ZWxzZSBpZigwPT09ZC5yaWdodFEubGVuZ3RoKWQubGVmdFEucHVzaChhKTtlbHNlIGQub25OZXh0KGEsZC5yaWdodFEuc2hpZnQoKSl9KTt0aGlzLnJpZ2h0PUkoZnVuY3Rpb24oYSl7aWYoXCJFXCI9PT1hLmtpbmQpZC5vYnNlcnZlci5vbkVycm9yKGEuZXhjZXB0aW9uKTtlbHNlIGlmKDA9PT1kLmxlZnRRLmxlbmd0aClkLnJpZ2h0US5wdXNoKGEpO2Vsc2UgZC5vbk5leHQoZC5sZWZ0US5zaGlmdCgpLGEpfSl9YS5wcm90b3R5cGUub25OZXh0PWZ1bmN0aW9uKGEsYyl7dmFyIGQ7aWYoXCJDXCI9PT1hLmtpbmR8fFwiQ1wiPT09Yy5raW5kKXRoaXMub2JzZXJ2ZXIub25Db21wbGV0ZWQoKTtlbHNle3RyeXtkPXRoaXMuc2VsZWN0b3IoYS52YWx1ZSxjLnZhbHVlKX1jYXRjaChlKXt0aGlzLm9ic2VydmVyLm9uRXJyb3IoZSk7XG5yZXR1cm59dGhpcy5vYnNlcnZlci5vbk5leHQoZCl9fTtyZXR1cm4gYX0oKTtmLnppcD1mdW5jdGlvbihhLGIpe3JldHVybiBGKHRoaXMsYSxmdW5jdGlvbihhKXt2YXIgZD1uZXcgQWEoYixhKTtyZXR1cm4gbmV3IEgoZnVuY3Rpb24oYSl7cmV0dXJuIGQubGVmdC5vbk5leHQoYSl9LGZ1bmN0aW9uKGEpe3JldHVybiBkLnJpZ2h0Lm9uTmV4dChhKX0pfSl9O3ZhciBoYTtoYT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYSxjKXt2YXIgZD10aGlzO3RoaXMuc2VsZWN0b3I9YTt0aGlzLm9ic2VydmVyPWM7dGhpcy5yaWdodFN0b3BwZWQ9dGhpcy5sZWZ0U3RvcHBlZD0hMTt0aGlzLmxlZnQ9SShmdW5jdGlvbihhKXtpZihcIk5cIj09PWEua2luZClpZihkLmxlZnRWYWx1ZT1hLGQucmlnaHRWYWx1ZSE9PW4pZC5vbk5leHQoKTtlbHNle2lmKGQucmlnaHRTdG9wcGVkKWQub2JzZXJ2ZXIub25Db21wbGV0ZWQoKX1lbHNlIGlmKFwiRVwiPT09YS5raW5kKWQub2JzZXJ2ZXIub25FcnJvcihhLmV4Y2VwdGlvbik7XG5lbHNlIGlmKGQubGVmdFN0b3BwZWQ9ITAsZC5yaWdodFN0b3BwZWQpZC5vYnNlcnZlci5vbkNvbXBsZXRlZCgpfSk7dGhpcy5yaWdodD1JKGZ1bmN0aW9uKGEpe2lmKFwiTlwiPT09YS5raW5kKWlmKGQucmlnaHRWYWx1ZT1hLGQubGVmdFZhbHVlIT09bilkLm9uTmV4dCgpO2Vsc2V7aWYoZC5sZWZ0U3RvcHBlZClkLm9ic2VydmVyLm9uQ29tcGxldGVkKCl9ZWxzZSBpZihcIkVcIj09PWEua2luZClkLm9ic2VydmVyLm9uRXJyb3IoYS5leGNlcHRpb24pO2Vsc2UgaWYoZC5yaWdodFN0b3BwZWQ9ITAsZC5sZWZ0U3RvcHBlZClkLm9ic2VydmVyLm9uQ29tcGxldGVkKCl9KX1hLnByb3RvdHlwZS5vbk5leHQ9ZnVuY3Rpb24oKXt2YXIgYTt0cnl7YT10aGlzLnNlbGVjdG9yKHRoaXMubGVmdFZhbHVlLnZhbHVlLHRoaXMucmlnaHRWYWx1ZS52YWx1ZSl9Y2F0Y2goYyl7dGhpcy5vYnNlcnZlci5vbkVycm9yKGMpO3JldHVybn10aGlzLm9ic2VydmVyLm9uTmV4dChhKX07cmV0dXJuIGF9KCk7Zi5jb21iaW5lTGF0ZXN0PVxuZnVuY3Rpb24oYSxiKXtyZXR1cm4gRih0aGlzLGEsZnVuY3Rpb24oYSl7dmFyIGQ9bmV3IGhhKGIsYSk7cmV0dXJuIG5ldyBIKGZ1bmN0aW9uKGEpe3JldHVybiBkLmxlZnQub25OZXh0KGEpfSxmdW5jdGlvbihhKXtyZXR1cm4gZC5yaWdodC5vbk5leHQoYSl9KX0pfTtmLnRha2VVbnRpbD1mdW5jdGlvbihhKXtyZXR1cm4gRihhLHRoaXMsZnVuY3Rpb24oYSxjKXt2YXIgZD0hMSxlPSExO3JldHVybiBuZXcgSChmdW5jdGlvbihjKXshZSYmIWQmJihcIkNcIj09PWMua2luZD9kPSEwOlwiRVwiPT09Yy5raW5kPyhlPWQ9ITAsYS5vbkVycm9yKGMuZXhjZXB0aW9uKSk6KGU9ITAsYS5vbkNvbXBsZXRlZCgpKSl9LGZ1bmN0aW9uKGQpe2V8fChkLmFjY2VwdChhKSwoZT1cIk5cIiE9PWQua2luZCkmJmMuZGlzcG9zZSgpKX0pfSl9O2Yuc2tpcFVudGlsPWZ1bmN0aW9uKGEpe3JldHVybiBGKHRoaXMsYSxmdW5jdGlvbihhLGMsZCl7dmFyIGU9ITEsZj0hMTtyZXR1cm4gbmV3IEgoZnVuY3Rpb24oYyl7aWYoXCJFXCI9PVxuYy5raW5kKWEub25FcnJvcihjLmV4Y2VwdGlvbik7ZWxzZSBlJiZjLmFjY2VwdChhKX0sZnVuY3Rpb24oYyl7aWYoIWYpe2lmKFwiTlwiPT09Yy5raW5kKWU9ITA7ZWxzZSBpZihcIkVcIj09PWMua2luZClhLm9uRXJyb3IoYy5leGNlcHRpb24pO2Y9ITA7ZC5kaXNwb3NlKCl9fSl9KX07ai5hbWI9ZnVuY3Rpb24oKXt2YXIgYT1kYSgpLGIsYz0xPT09YXJndW1lbnRzLmxlbmd0aCYmYXJndW1lbnRzWzBdaW5zdGFuY2VvZiBBcnJheT9hcmd1bWVudHNbMF06eS5jYWxsKGFyZ3VtZW50cyk7Zm9yKGI9MDtiPGMubGVuZ3RoO2IrKylhPWEuYW1iKGNbYl0pO3JldHVybiBhfTtmLmFtYj1mdW5jdGlvbihhKXtyZXR1cm4gRih0aGlzLGEsZnVuY3Rpb24oYSxjLGQpe3ZhciBlPVwiTlwiO3JldHVybiBuZXcgSChmdW5jdGlvbihjKXtcIk5cIj09PWUmJihlPVwiTFwiLGQuZGlzcG9zZSgpKTtcIkxcIj09PWUmJmMuYWNjZXB0KGEpfSxmdW5jdGlvbihkKXtcIk5cIj09PWUmJihlPVwiUlwiLGMuZGlzcG9zZSgpKTtcIlJcIj09PVxuZSYmZC5hY2NlcHQoYSl9KX0pfX07XG4iLCIvKlxuIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiAgQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiBUaGlzIGNvZGUgaXMgbGljZW5zZWQgYnkgTWljcm9zb2Z0IENvcnBvcmF0aW9uIHVuZGVyIHRoZSB0ZXJtc1xuIG9mIHRoZSBNSUNST1NPRlQgUkVBQ1RJVkUgRVhURU5TSU9OUyBGT1IgSkFWQVNDUklQVCBBTkQgLk5FVCBMSUJSQVJJRVMgTGljZW5zZS5cbiBTZWUgaHR0cDovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSUQ9MjIwNzYyLlxuKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oayxoKXt2YXIgaTtpPWsuUng7dmFyIHc9QXJyYXkucHJvdG90eXBlLnNsaWNlLHg9T2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eSx5PWZ1bmN0aW9uKGIsYSl7ZnVuY3Rpb24gYygpe3RoaXMuY29uc3RydWN0b3I9Yn1mb3IodmFyIGYgaW4gYSl4LmNhbGwoYSxmKSYmKGJbZl09YVtmXSk7Yy5wcm90b3R5cGU9YS5wcm90b3R5cGU7Yi5wcm90b3R5cGU9bmV3IGM7Yi5iYXNlPWEucHJvdG90eXBlO3JldHVybiBifSxsPWkuT2JzZXJ2YWJsZSxwPWwucHJvdG90eXBlLHo9bC5jcmVhdGVXaXRoRGlzcG9zYWJsZSxBPWwudGhyb3dFeGNlcHRpb24sQj1pLk9ic2VydmVyLmNyZWF0ZSxxPWkuSW50ZXJuYWxzLkxpc3QsQz1pLlNpbmdsZUFzc2lnbm1lbnREaXNwb3NhYmxlLEQ9aS5Db21wb3NpdGVEaXNwb3NhYmxlLFxuRT1pLkludGVybmFscy5BYnN0cmFjdE9ic2VydmVyLEY9ZnVuY3Rpb24oYixhKXtyZXR1cm4gYj09PWF9LG8scixqLHMsbSxuO2o9WzEsMyw3LDEzLDMxLDYxLDEyNywyNTEsNTA5LDEwMjEsMjAzOSw0MDkzLDgxOTEsMTYzODEsMzI3NDksNjU1MjEsMTMxMDcxLDI2MjEzOSw1MjQyODcsMTA0ODU3MywyMDk3MTQzLDQxOTQzMDEsODM4ODU5MywxNjc3NzIxMywzMzU1NDM5Myw2NzEwODg1OSwxMzQyMTc2ODksMjY4NDM1Mzk5LDUzNjg3MDkwOSwxMDczNzQxNzg5LDIxNDc0ODM2NDddO3I9ZnVuY3Rpb24oYil7dmFyIGEsYztpZihiJjApcmV0dXJuIDI9PT1iO2E9TWF0aC5zcXJ0KGIpO2ZvcihjPTM7Yzw9YTspe2lmKDA9PT1iJWMpcmV0dXJuITE7Yys9Mn1yZXR1cm4hMH07bz1mdW5jdGlvbihiKXt2YXIgYSxjO2ZvcihhPTA7YTxqLmxlbmd0aDsrK2EpaWYoYz1qW2FdLGM+PWIpcmV0dXJuIGM7Zm9yKGE9YnwxO2E8altqLmxlbmd0aC0xXTspe2lmKHIoYSkpcmV0dXJuIGE7YSs9Mn1yZXR1cm4gYn07XG5zPTA7bT1mdW5jdGlvbihiKXt2YXIgYTtpZihiPT09aCl0aHJvd1wibm8gc3VjaCBrZXlcIjtpZihiLmdldEhhc2hDb2RlIT09aClyZXR1cm4gYi5nZXRIYXNoQ29kZSgpO2E9MTcqcysrO2IuZ2V0SGFzaENvZGU9ZnVuY3Rpb24oKXtyZXR1cm4gYX07cmV0dXJuIGF9O249ZnVuY3Rpb24oKXtyZXR1cm57a2V5Om51bGwsdmFsdWU6bnVsbCxuZXh0OjAsaGFzaENvZGU6MH19O3ZhciB0PWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYihhLGMpe3RoaXMuX2luaXRpYWxpemUoYSk7dGhpcy5jb21wYXJlcj1jfHxGO3RoaXMuc2l6ZT10aGlzLmZyZWVDb3VudD0wO3RoaXMuZnJlZUxpc3Q9LTF9Yi5wcm90b3R5cGUuX2luaXRpYWxpemU9ZnVuY3Rpb24oYSl7dmFyIGE9byhhKSxjO3RoaXMuYnVja2V0cz1BcnJheShhKTt0aGlzLmVudHJpZXM9QXJyYXkoYSk7Zm9yKGM9MDtjPGE7YysrKXRoaXMuYnVja2V0c1tjXT0tMSx0aGlzLmVudHJpZXNbY109bigpO3RoaXMuZnJlZUxpc3Q9LTF9O2IucHJvdG90eXBlLmNvdW50PVxuZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5zaXplfTtiLnByb3RvdHlwZS5hZGQ9ZnVuY3Rpb24oYSxjKXtyZXR1cm4gdGhpcy5faW5zZXJ0KGEsYywhMCl9O2IucHJvdG90eXBlLl9pbnNlcnQ9ZnVuY3Rpb24oYSxjLGIpe3ZhciBkLGUsZzt0aGlzLmJ1Y2tldHM9PT1oJiZ0aGlzLl9pbml0aWFsaXplKDApO2c9bShhKSYyMTQ3NDgzNjQ3O2Q9ZyV0aGlzLmJ1Y2tldHMubGVuZ3RoO2ZvcihlPXRoaXMuYnVja2V0c1tkXTswPD1lO2U9dGhpcy5lbnRyaWVzW2VdLm5leHQpaWYodGhpcy5lbnRyaWVzW2VdLmhhc2hDb2RlPT09ZyYmdGhpcy5jb21wYXJlcih0aGlzLmVudHJpZXNbZV0ua2V5LGEpKXtpZihiKXRocm93XCJkdXBsaWNhdGUga2V5XCI7dGhpcy5lbnRyaWVzW2VdLnZhbHVlPWM7cmV0dXJufTA8dGhpcy5mcmVlQ291bnQ/KGI9dGhpcy5mcmVlTGlzdCx0aGlzLmZyZWVMaXN0PXRoaXMuZW50cmllc1tiXS5uZXh0LC0tdGhpcy5mcmVlQ291bnQpOih0aGlzLnNpemU9PT10aGlzLmVudHJpZXMubGVuZ3RoJiZcbih0aGlzLl9yZXNpemUoKSxkPWcldGhpcy5idWNrZXRzLmxlbmd0aCksYj10aGlzLnNpemUsKyt0aGlzLnNpemUpO3RoaXMuZW50cmllc1tiXS5oYXNoQ29kZT1nO3RoaXMuZW50cmllc1tiXS5uZXh0PXRoaXMuYnVja2V0c1tkXTt0aGlzLmVudHJpZXNbYl0ua2V5PWE7dGhpcy5lbnRyaWVzW2JdLnZhbHVlPWM7dGhpcy5idWNrZXRzW2RdPWJ9O2IucHJvdG90eXBlLl9yZXNpemU9ZnVuY3Rpb24oKXt2YXIgYSxjLGIsZCxlO2U9bygyKnRoaXMuc2l6ZSk7Yj1BcnJheShlKTtmb3IoYT0wO2E8Yi5sZW5ndGg7KythKWJbYV09LTE7ZD1BcnJheShlKTtmb3IoYT0wO2E8dGhpcy5zaXplOysrYSlkW2FdPXRoaXMuZW50cmllc1thXTtmb3IoYT10aGlzLnNpemU7YTxlOysrYSlkW2FdPW4oKTtmb3IoYT0wO2E8dGhpcy5zaXplOysrYSljPWRbYV0uaGFzaENvZGUlZSxkW2FdLm5leHQ9YltjXSxiW2NdPWE7dGhpcy5idWNrZXRzPWI7dGhpcy5lbnRyaWVzPWR9O2IucHJvdG90eXBlLnJlbW92ZT1cbmZ1bmN0aW9uKGEpe3ZhciBjLGIsZCxlO2lmKHRoaXMuYnVja2V0cyE9PWgpe2U9bShhKSYyMTQ3NDgzNjQ3O2M9ZSV0aGlzLmJ1Y2tldHMubGVuZ3RoO2I9LTE7Zm9yKGQ9dGhpcy5idWNrZXRzW2NdOzA8PWQ7ZD10aGlzLmVudHJpZXNbZF0ubmV4dCl7aWYodGhpcy5lbnRyaWVzW2RdLmhhc2hDb2RlPT09ZSYmdGhpcy5jb21wYXJlcih0aGlzLmVudHJpZXNbZF0ua2V5LGEpKXJldHVybiAwPmI/dGhpcy5idWNrZXRzW2NdPXRoaXMuZW50cmllc1tkXS5uZXh0OnRoaXMuZW50cmllc1tiXS5uZXh0PXRoaXMuZW50cmllc1tkXS5uZXh0LHRoaXMuZW50cmllc1tkXS5oYXNoQ29kZT0tMSx0aGlzLmVudHJpZXNbZF0ubmV4dD10aGlzLmZyZWVMaXN0LHRoaXMuZW50cmllc1tkXS5rZXk9bnVsbCx0aGlzLmVudHJpZXNbZF0udmFsdWU9bnVsbCx0aGlzLmZyZWVMaXN0PWQsKyt0aGlzLmZyZWVDb3VudCwhMDtiPWR9fXJldHVybiExfTtiLnByb3RvdHlwZS5jbGVhcj1mdW5jdGlvbigpe3ZhciBhO1xuaWYoISgwPj10aGlzLnNpemUpKXtmb3IoYT0wO2E8dGhpcy5idWNrZXRzLmxlbmd0aDsrK2EpdGhpcy5idWNrZXRzW2FdPS0xO2ZvcihhPTA7YTx0aGlzLnNpemU7KythKXRoaXMuZW50cmllc1thXT1uKCk7dGhpcy5mcmVlTGlzdD0tMTt0aGlzLnNpemU9MH19O2IucHJvdG90eXBlLl9maW5kRW50cnk9ZnVuY3Rpb24oYSl7dmFyIGMsYjtpZih0aGlzLmJ1Y2tldHMhPT1oKXtiPW0oYSkmMjE0NzQ4MzY0Nztmb3IoYz10aGlzLmJ1Y2tldHNbYiV0aGlzLmJ1Y2tldHMubGVuZ3RoXTswPD1jO2M9dGhpcy5lbnRyaWVzW2NdLm5leHQpaWYodGhpcy5lbnRyaWVzW2NdLmhhc2hDb2RlPT09YiYmdGhpcy5jb21wYXJlcih0aGlzLmVudHJpZXNbY10ua2V5LGEpKXJldHVybiBjfXJldHVybi0xfTtiLnByb3RvdHlwZS5jb3VudD1mdW5jdGlvbigpe3JldHVybiB0aGlzLnNpemUtdGhpcy5mcmVlQ291bnR9O2IucHJvdG90eXBlLnRyeUdldEVudHJ5PWZ1bmN0aW9uKGEpe2E9dGhpcy5fZmluZEVudHJ5KGEpO1xucmV0dXJuIDA8PWE/e2tleTp0aGlzLmVudHJpZXNbYV0ua2V5LHZhbHVlOnRoaXMuZW50cmllc1thXS52YWx1ZX06aH07Yi5wcm90b3R5cGUuZ2V0VmFsdWVzPWZ1bmN0aW9uKCl7dmFyIGE9MCxjLGI9W107aWYodGhpcy5lbnRyaWVzIT09aClmb3IoYz0wO2M8dGhpcy5zaXplO2MrKylpZigwPD10aGlzLmVudHJpZXNbY10uaGFzaENvZGUpYlthKytdPXRoaXMuZW50cmllc1tjXS52YWx1ZTtyZXR1cm4gYn07Yi5wcm90b3R5cGUuZ2V0PWZ1bmN0aW9uKGEpe2E9dGhpcy5fZmluZEVudHJ5KGEpO2lmKDA8PWEpcmV0dXJuIHRoaXMuZW50cmllc1thXS52YWx1ZTt0aHJvdyBFcnJvcihcIm5vIHN1Y2gga2V5XCIpO307Yi5wcm90b3R5cGUuc2V0PWZ1bmN0aW9uKGEsYil7dGhpcy5faW5zZXJ0KGEsYiwhMSl9O2IucHJvdG90eXBlLmNvbnRhaW5za2V5PWZ1bmN0aW9uKGEpe3JldHVybiAwPD10aGlzLl9maW5kRW50cnkoYSl9O3JldHVybiBifSgpLHU9ZnVuY3Rpb24oKXtmdW5jdGlvbiBiKGEpe3RoaXMucGF0dGVybnM9XG5hfWIucHJvdG90eXBlLmFuZD1mdW5jdGlvbihhKXt2YXIgYz10aGlzLnBhdHRlcm5zLGYsZDtkPVtdO2ZvcihmPTA7ZjxjLmxlbmd0aDtmKyspZC5wdXNoKGNbZl0pO2QucHVzaChhKTtyZXR1cm4gbmV3IGIoZCl9O2IucHJvdG90eXBlLnRoZW49ZnVuY3Rpb24oYSl7cmV0dXJuIG5ldyBHKHRoaXMsYSl9O3JldHVybiBifSgpLEc9ZnVuY3Rpb24oKXtmdW5jdGlvbiBiKGEsYil7dGhpcy5leHByZXNzaW9uPWE7dGhpcy5zZWxlY3Rvcj1ifWIucHJvdG90eXBlLmFjdGl2YXRlPWZ1bmN0aW9uKGEsYixmKXt2YXIgZCxlLGcsaDtoPXRoaXM7Zz1bXTtmb3IoZT0wO2U8dGhpcy5leHByZXNzaW9uLnBhdHRlcm5zLmxlbmd0aDtlKyspZy5wdXNoKEgoYSx0aGlzLmV4cHJlc3Npb24ucGF0dGVybnNbZV0sZnVuY3Rpb24oYSl7Yi5vbkVycm9yKGEpfSkpO2Q9bmV3IHYoZyxmdW5jdGlvbigpe3ZhciBhO3RyeXthPWguc2VsZWN0b3IuYXBwbHkoaCxhcmd1bWVudHMpfWNhdGNoKGQpe2Iub25FcnJvcihkKTtcbnJldHVybn1iLm9uTmV4dChhKX0sZnVuY3Rpb24oKXt2YXIgYTtmb3IoYT0wO2E8Zy5sZW5ndGg7YSsrKWdbYV0ucmVtb3ZlQWN0aXZlUGxhbihkKTtmKGQpfSk7Zm9yKGU9MDtlPGcubGVuZ3RoO2UrKylnW2VdLmFkZEFjdGl2ZVBsYW4oZCk7cmV0dXJuIGR9O3JldHVybiBifSgpLEg9ZnVuY3Rpb24oYixhLGMpe3ZhciBmO2Y9Yi50cnlHZXRFbnRyeShhKTtyZXR1cm4gZj09PWg/KGM9bmV3IEkoYSxjKSxiLmFkZChhLGMpLGMpOmYudmFsdWV9LHY7dj1mdW5jdGlvbigpe2Z1bmN0aW9uIGIoYSxiLGYpe3RoaXMuam9pbk9ic2VydmVyQXJyYXk9YTt0aGlzLm9uTmV4dD1iO3RoaXMub25Db21wbGV0ZWQ9Zjt0aGlzLmpvaW5PYnNlcnZlcnM9bmV3IHQ7Zm9yKGE9MDthPHRoaXMuam9pbk9ic2VydmVyQXJyYXkubGVuZ3RoO2ErKyliPXRoaXMuam9pbk9ic2VydmVyQXJyYXlbYV0sdGhpcy5qb2luT2JzZXJ2ZXJzLmFkZChiLGIpfWIucHJvdG90eXBlLmRlcXVldWU9ZnVuY3Rpb24oKXt2YXIgYSxcbmI7Yj10aGlzLmpvaW5PYnNlcnZlcnMuZ2V0VmFsdWVzKCk7Zm9yKGE9MDthPGIubGVuZ3RoO2ErKyliW2FdLnF1ZXVlLnNoaWZ0KCl9O2IucHJvdG90eXBlLm1hdGNoPWZ1bmN0aW9uKCl7dmFyIGEsYixmO2E9ITA7Zm9yKGI9MDtiPHRoaXMuam9pbk9ic2VydmVyQXJyYXkubGVuZ3RoO2IrKylpZigwPT09dGhpcy5qb2luT2JzZXJ2ZXJBcnJheVtiXS5xdWV1ZS5sZW5ndGgpe2E9ITE7YnJlYWt9aWYoYSl7YT1bXTtmPSExO2ZvcihiPTA7Yjx0aGlzLmpvaW5PYnNlcnZlckFycmF5Lmxlbmd0aDtiKyspYS5wdXNoKHRoaXMuam9pbk9ic2VydmVyQXJyYXlbYl0ucXVldWVbMF0pLFwiQ1wiPT09dGhpcy5qb2luT2JzZXJ2ZXJBcnJheVtiXS5xdWV1ZVswXS5raW5kJiYoZj0hMCk7aWYoZil0aGlzLm9uQ29tcGxldGVkKCk7ZWxzZXt0aGlzLmRlcXVldWUoKTtmPVtdO2ZvcihiPTA7YjxhLmxlbmd0aDtiKyspZi5wdXNoKGFbYl0udmFsdWUpO3RoaXMub25OZXh0LmFwcGx5KHRoaXMsZil9fX07XG5yZXR1cm4gYn0oKTt2YXIgST1mdW5jdGlvbigpe2Z1bmN0aW9uIGIoYSxiKXt0aGlzLnNvdXJjZT1hO3RoaXMub25FcnJvcj1iO3RoaXMucXVldWU9W107dGhpcy5hY3RpdmVQbGFucz1uZXcgcTt0aGlzLnN1YnNjcmlwdGlvbj1uZXcgQzt0aGlzLmlzRGlzcG9zZWQ9ITF9eShiLEUpO2IucHJvdG90eXBlLmFkZEFjdGl2ZVBsYW49ZnVuY3Rpb24oYSl7dGhpcy5hY3RpdmVQbGFucy5hZGQoYSl9O2IucHJvdG90eXBlLnN1YnNjcmliZT1mdW5jdGlvbigpe3RoaXMuc3Vic2NyaXB0aW9uLmRpc3Bvc2FibGUodGhpcy5zb3VyY2UubWF0ZXJpYWxpemUoKS5zdWJzY3JpYmUodGhpcykpfTtiLnByb3RvdHlwZS5uZXh0PWZ1bmN0aW9uKGEpe3ZhciBiO2lmKCF0aGlzLmlzRGlzcG9zZWQpaWYoXCJFXCI9PT1hLmtpbmQpdGhpcy5vbkVycm9yKGEuZXhjZXB0aW9uKTtlbHNle3RoaXMucXVldWUucHVzaChhKTthPXRoaXMuYWN0aXZlUGxhbnMudG9BcnJheSgpO2ZvcihiPTA7YjxhLmxlbmd0aDtiKyspYVtiXS5tYXRjaCgpfX07XG5iLnByb3RvdHlwZS5lcnJvcj1mdW5jdGlvbigpe307Yi5wcm90b3R5cGUuY29tcGxldGVkPWZ1bmN0aW9uKCl7fTtiLnByb3RvdHlwZS5yZW1vdmVBY3RpdmVQbGFuPWZ1bmN0aW9uKGEpe3RoaXMuYWN0aXZlUGxhbnMucmVtb3ZlKGEpOzA9PT10aGlzLmFjdGl2ZVBsYW5zLmNvdW50KCkmJnRoaXMuZGlzcG9zZSgpfTtiLnByb3RvdHlwZS5kaXNwb3NlPWZ1bmN0aW9uKCl7Yi5iYXNlLmRpc3Bvc2UuY2FsbCh0aGlzKTtpZighdGhpcy5pc0Rpc3Bvc2VkKXRoaXMuaXNEaXNwb3NlZD0hMCx0aGlzLnN1YnNjcmlwdGlvbi5kaXNwb3NlKCl9O3JldHVybiBifSgpO3AuYW5kPWZ1bmN0aW9uKGIpe3JldHVybiBuZXcgdShbdGhpcyxiXSl9O3AudGhlbj1mdW5jdGlvbihiKXtyZXR1cm4obmV3IHUoW3RoaXNdKSkudGhlbihiKX07bC53aGVuPWZ1bmN0aW9uKCl7dmFyIGI9MT09PWFyZ3VtZW50cy5sZW5ndGgmJmFyZ3VtZW50c1swXWluc3RhbmNlb2YgQXJyYXk/YXJndW1lbnRzWzBdOncuY2FsbChhcmd1bWVudHMpO1xucmV0dXJuIHooZnVuY3Rpb24oYSl7dmFyIGM9bmV3IHEsZj1uZXcgdCxkLGUsZyxoLGk7aT1CKGZ1bmN0aW9uKGIpe2Eub25OZXh0KGIpfSxmdW5jdGlvbihiKXtmb3IodmFyIGM9Zi5nZXRWYWx1ZXMoKSxkPTA7ZDxjLmxlbmd0aDtkKyspY1tkXS5vbkVycm9yKGIpO2Eub25FcnJvcihiKX0sZnVuY3Rpb24oKXthLm9uQ29tcGxldGVkKCl9KTt0cnl7Zm9yKGU9MDtlPGIubGVuZ3RoO2UrKyljLmFkZChiW2VdLmFjdGl2YXRlKGYsaSxmdW5jdGlvbihhKXtjLnJlbW92ZShhKTtpZigwPT09Yy5jb3VudCgpKWkub25Db21wbGV0ZWQoKX0pKX1jYXRjaChqKXtBKGopLnN1YnNjcmliZShhKX1kPW5ldyBEO2g9Zi5nZXRWYWx1ZXMoKTtmb3IoZT0wO2U8aC5sZW5ndGg7ZSsrKWc9aFtlXSxnLnN1YnNjcmliZSgpLGQuYWRkKGcpO3JldHVybiBkfSl9fTtcbiIsIi8qXG4gQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uICBBbGwgcmlnaHRzIHJlc2VydmVkLlxuIFRoaXMgY29kZSBpcyBsaWNlbnNlZCBieSBNaWNyb3NvZnQgQ29ycG9yYXRpb24gdW5kZXIgdGhlIHRlcm1zXG4gb2YgdGhlIE1JQ1JPU09GVCBSRUFDVElWRSBFWFRFTlNJT05TIEZPUiBKQVZBU0NSSVBUIEFORCAuTkVUIExJQlJBUklFUyBMaWNlbnNlLlxuIFNlZSBodHRwOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP0xpbmtJRD0yMjA3NjIuXG4qL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbih3LG4pe3ZhciBwO3A9dy5SeDt2YXIgcT1wLk9ic2VydmFibGUsbz1xLnByb3RvdHlwZSxtPXEuY3JlYXRlV2l0aERpc3Bvc2FibGUseT1xLmRlZmVyLEY9cS50aHJvd0V4Y2VwdGlvbixsPXAuU2NoZWR1bGVyLlRpbWVvdXQscj1wLlNpbmdsZUFzc2lnbm1lbnREaXNwb3NhYmxlLHQ9cC5TZXJpYWxEaXNwb3NhYmxlLHM9cC5Db21wb3NpdGVEaXNwb3NhYmxlLHo9cC5SZWZDb3VudERpc3Bvc2FibGUsdT1wLlN1YmplY3QsRz1wLkludGVybmFscy5CaW5hcnlPYnNlcnZlcix2PWZ1bmN0aW9uKGEsYil7cmV0dXJuIG0oZnVuY3Rpb24oYyl7cmV0dXJuIG5ldyBzKGIuZ2V0RGlzcG9zYWJsZSgpLGEuc3Vic2NyaWJlKGMpKX0pfSxIPWZ1bmN0aW9uKGEsYixjKXtyZXR1cm4gbShmdW5jdGlvbihkKXt2YXIgZj1cbm5ldyByLGU9bmV3IHIsZD1jKGQsZixlKTtmLmRpc3Bvc2FibGUoYS5tYXRlcmlhbGl6ZSgpLnNlbGVjdChmdW5jdGlvbihiKXtyZXR1cm57c3dpdGNoVmFsdWU6ZnVuY3Rpb24oYyl7cmV0dXJuIGMoYil9fX0pLnN1YnNjcmliZShkKSk7ZS5kaXNwb3NhYmxlKGIubWF0ZXJpYWxpemUoKS5zZWxlY3QoZnVuY3Rpb24oYil7cmV0dXJue3N3aXRjaFZhbHVlOmZ1bmN0aW9uKGMsYSl7cmV0dXJuIGEoYil9fX0pLnN1YnNjcmliZShkKSk7cmV0dXJuIG5ldyBzKGYsZSl9KX0sST1mdW5jdGlvbihhLGIpe3JldHVybiBtKGZ1bmN0aW9uKGMpe3JldHVybiBiLnNjaGVkdWxlV2l0aEFic29sdXRlKGEsZnVuY3Rpb24oKXtjLm9uTmV4dCgwKTtjLm9uQ29tcGxldGVkKCl9KX0pfSxBPWZ1bmN0aW9uKGEsYixjKXt2YXIgZD0wPmI/MDpiO3JldHVybiBtKGZ1bmN0aW9uKGIpe3ZhciBlPTAsZz1hO3JldHVybiBjLnNjaGVkdWxlUmVjdXJzaXZlV2l0aEFic29sdXRlKGcsZnVuY3Rpb24oYSl7dmFyIGk7XG4wPGQmJihpPWMubm93KCksZys9ZCxnPD1pJiYoZz1pK2QpKTtiLm9uTmV4dChlKyspO2EoZyl9KX0pfSxKPWZ1bmN0aW9uKGEsYil7dmFyIGM9MD5hPzA6YTtyZXR1cm4gbShmdW5jdGlvbihhKXtyZXR1cm4gYi5zY2hlZHVsZVdpdGhSZWxhdGl2ZShjLGZ1bmN0aW9uKCl7YS5vbk5leHQoMCk7YS5vbkNvbXBsZXRlZCgpfSl9KX0sQj1mdW5jdGlvbihhLGIsYyl7cmV0dXJuIHkoZnVuY3Rpb24oKXtyZXR1cm4gQShjLm5vdygpK2EsYixjKX0pfSxLPXEuaW50ZXJ2YWw9ZnVuY3Rpb24oYSxiKXtifHwoYj1sKTtyZXR1cm4gQihhLGEsYil9O3EudGltZXI9ZnVuY3Rpb24oYSxiLGMpe3ZhciBkO2N8fChjPWwpO2IhPT1uJiZcIm51bWJlclwiPT09dHlwZW9mIGI/ZD1iOmIhPT1uJiZcIm9iamVjdFwiPT09dHlwZW9mIGImJihjPWIpO3JldHVybiBhIGluc3RhbmNlb2YgRGF0ZSYmZD09PW4/SShhLmdldFRpbWUoKSxjKTphIGluc3RhbmNlb2YgRGF0ZSYmZCE9PW4/QShhLmdldFRpbWUoKSxiLGMpOlxuZD09PW4/SihhLGMpOkIoYSxkLGMpfTt2YXIgRD1mdW5jdGlvbihhLGIsYyl7cmV0dXJuIG0oZnVuY3Rpb24oZCl7dmFyIGY9ITEsZT1uZXcgdCxnPW51bGwsaD1bXSxpPSExLGo7aj1hLm1hdGVyaWFsaXplKCkudGltZXN0YW1wKGMpLnN1YnNjcmliZShmdW5jdGlvbihhKXtcIkVcIj09PWEudmFsdWUua2luZD8oaD1bXSxoLnB1c2goYSksZz1hLnZhbHVlLmV4Y2VwdGlvbixhPSFpKTooaC5wdXNoKHt2YWx1ZTphLnZhbHVlLHRpbWVzdGFtcDphLnRpbWVzdGFtcCtifSksYT0hZixmPSEwKTtpZihhKWlmKG51bGwhPT1nKWQub25FcnJvcihnKTtlbHNlIGE9bmV3IHIsZS5kaXNwb3NhYmxlKGEpLGEuZGlzcG9zYWJsZShjLnNjaGVkdWxlUmVjdXJzaXZlV2l0aFJlbGF0aXZlKGIsZnVuY3Rpb24oYSl7dmFyIGIsZSxqO2lmKG51bGw9PT1nKXtpPSEwO2Rve2I9bnVsbDtpZigwPGgubGVuZ3RoJiYwPj1oWzBdLnRpbWVzdGFtcC1jLm5vdygpKWI9aC5zaGlmdCgpLnZhbHVlO251bGwhPT1iJiZcbmIuYWNjZXB0KGQpfXdoaWxlKG51bGwhPT1iKTtqPSExO2U9MDswPGgubGVuZ3RoPyhqPSEwLGU9TWF0aC5tYXgoMCxoWzBdLnRpbWVzdGFtcC1jLm5vdygpKSk6Zj0hMTtiPWc7aT0hMTtpZihudWxsIT09YilkLm9uRXJyb3IoYik7ZWxzZSBqJiZhKGUpfX0pKX0pO3JldHVybiBuZXcgcyhqLGUpfSl9LEw9ZnVuY3Rpb24oYSxiLGMpe3JldHVybiB5KGZ1bmN0aW9uKCl7dmFyIGE9Yi1jLm5vdygpO3JldHVybiBEKGEsYyl9KX07by5kZWxheT1mdW5jdGlvbihhLGIpe2J8fChiPWwpO3JldHVybiBhIGluc3RhbmNlb2YgRGF0ZT9MKHRoaXMsYS5nZXRUaW1lKCksYik6RCh0aGlzLGEsYil9O28udGhyb3R0bGU9ZnVuY3Rpb24oYSxiKXtifHwoYj1sKTt2YXIgYz10aGlzO3JldHVybiBtKGZ1bmN0aW9uKGQpe3ZhciBmPW5ldyB0LGU9ITEsZz0wLGgsaT1udWxsO2g9Yy5zdWJzY3JpYmUoZnVuY3Rpb24oYyl7dmFyIGs7ZT0hMDtpPWM7ZysrO2s9ZztjPW5ldyByO2YuZGlzcG9zYWJsZShjKTtcbmMuZGlzcG9zYWJsZShiLnNjaGVkdWxlV2l0aFJlbGF0aXZlKGEsZnVuY3Rpb24oKXtpZihlJiZnPT09aylkLm9uTmV4dChpKTtlPSExfSkpfSxmdW5jdGlvbihhKXtmLmRpc3Bvc2UoKTtkLm9uRXJyb3IoYSk7ZT0hMTtnKyt9LGZ1bmN0aW9uKCl7Zi5kaXNwb3NlKCk7aWYoZSlkLm9uTmV4dChpKTtkLm9uQ29tcGxldGVkKCk7ZT0hMTtnKyt9KTtyZXR1cm4gbmV3IHMoaCxmKX0pfTtvLndpbmRvd1dpdGhUaW1lPWZ1bmN0aW9uKGEsYixjKXt2YXIgZD10aGlzLGY7Yj09PW4mJihmPWEpO2M9PT1uJiYoYz1sKTtcIm51bWJlclwiPT09dHlwZW9mIGI/Zj1iOlwib2JqZWN0XCI9PT10eXBlb2YgYiYmKGY9YSxjPWIpO3JldHVybiBtKGZ1bmN0aW9uKGIpe3ZhciBnLGgsaT1mLGo9YSxrPVtdLHgsQz1uZXcgdCxsPTA7aD1uZXcgcyhDKTt4PW5ldyB6KGgpO2c9ZnVuY3Rpb24oKXt2YXIgYSxkLGgsbSxuO2g9bmV3IHI7Qy5kaXNwb3NhYmxlKGgpO2E9ZD0hMTtqPT09aT9hPWQ9ITA6ajxpP2Q9ITA6XG5hPSEwO209ZD9qOmk7bj1tLWw7bD1tO2QmJihqKz1mKTthJiYoaSs9Zik7aC5kaXNwb3NhYmxlKGMuc2NoZWR1bGVXaXRoUmVsYXRpdmUobixmdW5jdGlvbigpe3ZhciBjO2EmJihjPW5ldyB1LGsucHVzaChjKSxiLm9uTmV4dCh2KGMseCkpKTtkJiYoYz1rLnNoaWZ0KCksYy5vbkNvbXBsZXRlZCgpKTtnKCl9KSl9O2sucHVzaChuZXcgdSk7Yi5vbk5leHQodihrWzBdLHgpKTtnKCk7aC5hZGQoZC5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7dmFyIGIsYztmb3IoYj0wO2I8ay5sZW5ndGg7YisrKWM9a1tiXSxjLm9uTmV4dChhKX0sZnVuY3Rpb24oYSl7dmFyIGMsZDtmb3IoYz0wO2M8ay5sZW5ndGg7YysrKWQ9a1tjXSxkLm9uRXJyb3IoYSk7Yi5vbkVycm9yKGEpfSxmdW5jdGlvbigpe3ZhciBhLGM7Zm9yKGE9MDthPGsubGVuZ3RoO2ErKyljPWtbYV0sYy5vbkNvbXBsZXRlZCgpO2Iub25Db21wbGV0ZWQoKX0pKTtyZXR1cm4geH0pfTtvLndpbmRvd1dpdGhUaW1lT3JDb3VudD1mdW5jdGlvbihhLFxuYixjKXt2YXIgZD10aGlzO2N8fChjPWwpO3JldHVybiBtKGZ1bmN0aW9uKGYpe3ZhciBlLGcsaD0wLGksaixrPW5ldyB0LGw9MDtnPW5ldyBzKGspO2k9bmV3IHooZyk7ZT1mdW5jdGlvbihiKXt2YXIgZD1uZXcgcjtrLmRpc3Bvc2FibGUoZCk7ZC5kaXNwb3NhYmxlKGMuc2NoZWR1bGVXaXRoUmVsYXRpdmUoYSxmdW5jdGlvbigpe3ZhciBhO2I9PT1sJiYoaD0wLGE9KytsLGoub25Db21wbGV0ZWQoKSxqPW5ldyB1LGYub25OZXh0KHYoaixpKSksZShhKSl9KSl9O2o9bmV3IHU7Zi5vbk5leHQodihqLGkpKTtlKDApO2cuYWRkKGQuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe3ZhciBjPTAsZD0hMTtqLm9uTmV4dChhKTtoKys7aD09PWImJihkPSEwLGg9MCxjPSsrbCxqLm9uQ29tcGxldGVkKCksaj1uZXcgdSxmLm9uTmV4dCh2KGosaSkpKTtkJiZlKGMpfSxmdW5jdGlvbihhKXtqLm9uRXJyb3IoYSk7Zi5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2oub25Db21wbGV0ZWQoKTtmLm9uQ29tcGxldGVkKCl9KSk7XG5yZXR1cm4gaX0pfTtvLmJ1ZmZlcldpdGhUaW1lPWZ1bmN0aW9uKGEsYixjKXt2YXIgZDtiPT09biYmKGQ9YSk7Y3x8KGM9bCk7XCJudW1iZXJcIj09PXR5cGVvZiBiP2Q9YjpcIm9iamVjdFwiPT09dHlwZW9mIGImJihkPWEsYz1iKTtyZXR1cm4gdGhpcy53aW5kb3dXaXRoVGltZShhLGQsYykuc2VsZWN0TWFueShmdW5jdGlvbihhKXtyZXR1cm4gYS50b0FycmF5KCl9KX07by5idWZmZXJXaXRoVGltZU9yQ291bnQ9ZnVuY3Rpb24oYSxiLGMpe2N8fChjPWwpO3JldHVybiB0aGlzLndpbmRvd1dpdGhUaW1lT3JDb3VudChhLGIsYykuc2VsZWN0TWFueShmdW5jdGlvbihhKXtyZXR1cm4gYS50b0FycmF5KCl9KX07by50aW1lSW50ZXJ2YWw9ZnVuY3Rpb24oYSl7dmFyIGI9dGhpczthfHwoYT1sKTtyZXR1cm4geShmdW5jdGlvbigpe3ZhciBjPWEubm93KCk7cmV0dXJuIGIuc2VsZWN0KGZ1bmN0aW9uKGIpe3ZhciBmPWEubm93KCksZT1mLWM7Yz1mO3JldHVybnt2YWx1ZTpiLGludGVydmFsOmV9fSl9KX07XG5vLnRpbWVzdGFtcD1mdW5jdGlvbihhKXthfHwoYT1sKTtyZXR1cm4gdGhpcy5zZWxlY3QoZnVuY3Rpb24oYil7cmV0dXJue3ZhbHVlOmIsdGltZXN0YW1wOmEubm93KCl9fSl9O3ZhciBFPWZ1bmN0aW9uKGEsYil7cmV0dXJuIEgoYSxiLGZ1bmN0aW9uKGEpe3ZhciBiPSExLGY7cmV0dXJuIG5ldyBHKGZ1bmN0aW9uKGUpe1wiTlwiPT09ZS5raW5kJiYoZj1lKTtcIkVcIj09PWUua2luZCYmZS5hY2NlcHQoYSk7XCJDXCI9PT1lLmtpbmQmJihiPSEwKX0sZnVuY3Rpb24oKXt2YXIgZT1mO2Y9bjtlIT09biYmZS5hY2NlcHQoYSk7aWYoYilhLm9uQ29tcGxldGVkKCl9KX0pfTtvLnNhbXBsZT1mdW5jdGlvbihhLGIpe2J8fChiPWwpO3JldHVyblwibnVtYmVyXCI9PT10eXBlb2YgYT9FKHRoaXMsSyhhLGIpKTpFKHRoaXMsYSl9O28udGltZW91dD1mdW5jdGlvbihhLGIsYyl7dmFyIGQsZj10aGlzO2I9PT1uJiYoYj1GKEVycm9yKFwiVGltZW91dFwiKSkpO2N8fChjPWwpO2Q9YSBpbnN0YW5jZW9mIERhdGU/XG5mdW5jdGlvbihhLGIpe2Muc2NoZWR1bGVXaXRoQWJzb2x1dGUoYSxiKX06ZnVuY3Rpb24oYSxiKXtjLnNjaGVkdWxlV2l0aFJlbGF0aXZlKGEsYil9O3JldHVybiBtKGZ1bmN0aW9uKGMpe3ZhciBnLGg9MCxpPW5ldyByLGo9bmV3IHQsaz0hMSxsPW5ldyB0O2ouZGlzcG9zYWJsZShpKTtnPWZ1bmN0aW9uKCl7dmFyIGY9aDtsLmRpc3Bvc2FibGUoZChhLGZ1bmN0aW9uKCl7KGs9aD09PWYpJiZqLmRpc3Bvc2FibGUoYi5zdWJzY3JpYmUoYykpfSkpfTtnKCk7aS5kaXNwb3NhYmxlKGYuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2t8fChoKyssYy5vbk5leHQoYSksZygpKX0sZnVuY3Rpb24oYSl7a3x8KGgrKyxjLm9uRXJyb3IoYSkpfSxmdW5jdGlvbigpe2t8fChoKyssYy5vbkNvbXBsZXRlZCgpKX0pKTtyZXR1cm4gbmV3IHMoaixsKX0pfTtxLmdlbmVyYXRlV2l0aEFic29sdXRlVGltZT1mdW5jdGlvbihhLGIsYyxkLGYsZSl7ZXx8KGU9bCk7cmV0dXJuIG0oZnVuY3Rpb24oZyl7dmFyIGg9XG4hMCxpPSExLGosaz1hLGw7cmV0dXJuIGUuc2NoZWR1bGVSZWN1cnNpdmVXaXRoQWJzb2x1dGUoZS5ub3coKSxmdW5jdGlvbihhKXtpZihpKWcub25OZXh0KGopO3RyeXtpZihoP2g9ITE6az1jKGspLGk9YihrKSlqPWQoayksbD1mKGspfWNhdGNoKGUpe2cub25FcnJvcihlKTtyZXR1cm59aWYoaSlhKGwpO2Vsc2UgZy5vbkNvbXBsZXRlZCgpfSl9KX07cS5nZW5lcmF0ZVdpdGhSZWxhdGl2ZVRpbWU9ZnVuY3Rpb24oYSxiLGMsZCxmLGUpe2V8fChlPWwpO3JldHVybiBtKGZ1bmN0aW9uKGcpe3ZhciBoPSEwLGk9ITEsaixrPWEsbDtyZXR1cm4gZS5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhSZWxhdGl2ZSgwLGZ1bmN0aW9uKGEpe2lmKGkpZy5vbk5leHQoaik7dHJ5e2lmKGg/aD0hMTprPWMoayksaT1iKGspKWo9ZChrKSxsPWYoayl9Y2F0Y2goZSl7Zy5vbkVycm9yKGUpO3JldHVybn1pZihpKWEobCk7ZWxzZSBnLm9uQ29tcGxldGVkKCl9KX0pfX07XG4iXX0=
;