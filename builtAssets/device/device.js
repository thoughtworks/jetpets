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

},{"../../views/wait.hbs":15,"../../../3rdparty/routie":2,"../player":4,"../../../3rdparty/rx.zepto":16,"rxjs":17}],9:[function(require,module,exports){
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

},{"../../views/gamepad.hbs":18,"../../../3rdparty/routie":2,"../player":4,"rxjs":17}],8:[function(require,module,exports){
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

},{"../../views/lobby.hbs":19,"../../../3rdparty/routie":2,"../player":4,"../../../3rdparty/rx.zepto":16,"rxjs":17}],16:[function(require,module,exports){
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
},{"rxjs":17}],11:[function(require,module,exports){
var Handlebars = require('handlebars-runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "\n<h1>Register To Play</h1>\n\n<form>\n  \n  <div class=\"field\">\n    <label>First name</label>\n    <input id=\"firstName\" type=\"text\" value=\"\" autocorrect=\"off\" />\n  </div>\n  \n  <div class=\"field\">\n    <label>Last name</label>\n    <input id=\"lastName\" type=\"text\" value=\"\" autocorrect=\"off\" />\n  </div>\n\n  <div class=\"field\">\n    <label>Email</label>\n    <input id=\"email\" type=\"email\" value=\"\" autocorrect=\"off\" />\n  </div>\n  \n  <div class=\"field\">\n    <label>Company</label>\n    <input id=\"company\" type=\"text\" value=\"\" autocorrect=\"off\" />\n  </div>\n  \n  <div class=\"field\">\n    <label>Role</label>\n	<select required id=\"role\">\n	<option value=\"Select Role\" selected>Select Role</option>\n	<option value=\"C-Level Executive\">C-Level Executive</option>\n	<option value=\"VP or Director\">VP or Director</option>\n	<option value=\"Manager\">Manager</option>\n	<option value=\"Project Manager\">Project Manager</option>\n	<option value=\"Team Lead\">Team Lead</option>\n	<option value=\"Architect\">Architect</option>\n	<option value=\"Developer\">Developer</option>\n	<option value=\"Consultant\">Consultant</option>\n	<option value=\"Student\">Student</option>\n	<option value=\"Press/Analyst\">Press/Analyst</option>\n	</select>\n  </div>\n\n  <div class=\"field\">\n    <label>Country</label>\n	<select required id=\"country\">\n	<option value=\"Select Country\" selected>Select Country</option>\n	<option value=\"DK\">Denmark</option>\n	<option value=\"GB\">United Kingdom</option>\n	<option value=\"AL\">Albania</option>\n	<option value=\"AD\">Andorra</option>\n	<option value=\"AT\">Austria</option>\n	<option value=\"BY\">Belarus</option>\n	<option value=\"BE\">Belgium</option>\n	<option value=\"BA\">Bosnia and Herzegovina</option>\n	<option value=\"BG\">Bulgaria</option>\n	<option value=\"HR\">Croatia</option>\n	<option value=\"CY\">Cyprus</option>\n	<option value=\"CZ\">Czech Republic</option>\n	<option value=\"EE\">Estonia</option>\n	<option value=\"FI\">Finland</option>\n	<option value=\"FR\">France</option>\n	<option value=\"DE\">Germany</option>\n	<option value=\"GR\">Greece</option>\n	<option value=\"HU\">Hungary</option>\n	<option value=\"IS\">Iceland</option>\n	<option value=\"IE\">Ireland</option>\n	<option value=\"IT\">Italy</option>\n	<option value=\"LV\">Latvia</option>\n	<option value=\"LI\">Liechtenstein</option>\n	<option value=\"LT\">Lithuania</option>\n	<option value=\"LU\">Luxembourg</option>\n	<option value=\"Macedonia\">Macedonia</option>\n	<option value=\"MT\">Malta</option>\n	<option value=\"Moldova\">Moldova</option>\n	<option value=\"MC\">Monaco</option>\n	<option value=\"ME\">Montenegro</option>\n	<option value=\"NL\">Netherlands</option>\n	<option value=\"NO\">Norway</option>\n	<option value=\"PL\">Poland</option>\n	<option value=\"PT\">Portugal</option>\n	<option value=\"RO\">Romania</option>\n	<option value=\"RS\">Serbia</option>\n	<option value=\"SK\">Slovakia</option>\n	<option value=\"SI\">Slovenia</option>\n	<option value=\"ES\">Spain</option>\n	<option value=\"SE\">Sweden</option>\n	<option value=\"CH\">Switzerland</option>\n	<option value=\"TR\">Turkey</option>\n	<option value=\"UA\">Ukraine</option>\n	<option value=\"AF\">Afghanistan</option>\n	<option value=\"AX\">Åland Islands</option>\n	<option value=\"DZ\">Algeria</option>\n	<option value=\"AS\">American Samoa</option>\n	<option value=\"AO\">Angola</option>\n	<option value=\"AI\">Anguilla</option>\n	<option value=\"AQ\">Antarctica</option>\n	<option value=\"AG\">Antigua and Barbuda</option>\n	<option value=\"AR\">Argentina</option>\n	<option value=\"AM\">Armenia</option>\n	<option value=\"AW\">Aruba</option>\n	<option value=\"AU\">Australia</option>\n	<option value=\"AZ\">Azerbaijan</option>\n	<option value=\"BS\">Bahamas</option>\n	<option value=\"BH\">Bahrain</option>\n	<option value=\"BD\">Bangladesh</option>\n	<option value=\"BB\">Barbados</option>\n	<option value=\"BZ\">Belize</option>\n	<option value=\"BJ\">Benin</option>\n	<option value=\"BM\">Bermuda</option>\n	<option value=\"BT\">Bhutan</option>\n	<option value=\"Bolivia\">Bolivia</option>\n	<option value=\"BW\">Botswana</option>\n	<option value=\"BV\">Bouvet Island</option>\n	<option value=\"BR\">Brazil</option>\n	<option value=\"BN\">Brunei Darussalam</option>\n	<option value=\"CU\">Cuba</option>\n	<option value=\"DJ\">Djibouti</option>\n	<option value=\"DM\">Dominica</option>\n	<option value=\"DO\">Dominican Republic</option>\n	<option value=\"EC\">Ecuador</option>\n	<option value=\"EG\">Egypt</option>\n	<option value=\"SV\">El Salvador</option>\n	<option value=\"GQ\">Equatorial Guinea</option>\n	<option value=\"ER\">Eritrea</option>\n	<option value=\"GF\">French Guiana</option>\n	<option value=\"PF\">French Polynesia</option>\n	<option value=\"GA\">Gabon</option>\n	<option value=\"GM\">Gambia</option>\n	<option value=\"GE\">Georgia</option>\n	<option value=\"GH\">Ghana</option>\n	<option value=\"GI\">Gibraltar</option>\n	<option value=\"GL\">Greenland</option>\n	<option value=\"GD\">Grenada</option>\n	<option value=\"GP\">Guadeloupe</option>\n	<option value=\"GU\">Guam</option>\n	<option value=\"GT\">Guatemala</option>\n	<option value=\"GG\">Guernsey</option>\n	<option value=\"GN\">Guinea</option>\n	<option value=\"GW\">Guinea-Bissau</option>\n	<option value=\"GY\">Guyana</option>\n	<option value=\"HT\">Haiti</option>\n	<option value=\"HN\">Honduras</option>\n	<option value=\"HK\">Hong Kong</option>\n	<option value=\"IN\">India</option>\n	<option value=\"ID\">Indonesia</option>\n	<option value=\"Iran\">Iran</option>\n	<option value=\"IQ\">Iraq</option>\n	<option value=\"IM\">Isle of Man</option>\n	<option value=\"IL\">Israel</option>\n	<option value=\"JM\">Jamaica</option>\n	<option value=\"JP\">Japan</option>\n	<option value=\"JE\">Jersey</option>\n	<option value=\"JO\">Jordan</option>\n	<option value=\"KZ\">Kazakhstan</option>\n	<option value=\"KE\">Kenya</option>\n	<option value=\"KI\">Kiribati</option>\n	<option value=\"Korea\">Republic of Korea</option>\n	<option value=\"Korea\">Democratic People's Republic of Korea</option>\n	<option value=\"KW\">Kuwait</option>\n	<option value=\"KG\">Kyrgyzstan</option>\n	<option value=\"LA\">Laos</option>\n	<option value=\"LB\">Lebanon</option>\n	<option value=\"LS\">Lesotho</option>\n	<option value=\"LR\">Liberia</option>\n	<option value=\"LY\">Libyan Arab Jamahiriya</option>\n	<option value=\"MO\">Macao</option>\n	<option value=\"MG\">Madagascar</option>\n	<option value=\"MW\">Malawi</option>\n	<option value=\"MY\">Malaysia</option>\n	<option value=\"MV\">Maldives</option>\n	<option value=\"ML\">Mali</option>\n	<option value=\"MH\">Marshall Islands</option>\n	<option value=\"MQ\">Martinique</option>\n	<option value=\"MR\">Mauritania</option>\n	<option value=\"MU\">Mauritius</option>\n	<option value=\"YT\">Mayotte</option>\n	<option value=\"MX\">Mexico</option>\n	<option value=\"Micronesia\">Micronesia</option>\n	<option value=\"MN\">Mongolia</option>\n	<option value=\"MS\">Montserrat</option>\n	<option value=\"MA\">Morocco</option>\n	<option value=\"MZ\">Mozambique</option>\n	<option value=\"MM\">Myanmar</option>\n	<option value=\"NA\">Namibia</option>\n	<option value=\"NR\">Nauru</option>\n	<option value=\"NP\">Nepal</option>\n	<option value=\"AN\">Netherlands Antilles</option>\n	<option value=\"NC\">New Caledonia</option>\n	<option value=\"NZ\">New Zealand</option>\n	<option value=\"NI\">Nicaragua</option>\n	<option value=\"NE\">Niger</option>\n	<option value=\"NG\">Nigeria</option>\n	<option value=\"NU\">Niue</option>\n	<option value=\"NF\">Norfolk Island</option>\n	<option value=\"MP\">Northern Mariana Islands</option>\n	<option value=\"OM\">Oman</option>\n	<option value=\"PK\">Pakistan</option>\n	<option value=\"PW\">Palau</option>\n	<option value=\"Palestine\">Palestine</option>\n	<option value=\"PA\">Panama</option>\n	<option value=\"PG\">Papua New Guinea</option>\n	<option value=\"PY\">Paraguay</option>\n	<option value=\"PE\">Peru</option>\n	<option value=\"PH\">Philippines</option>\n	<option value=\"PN\">Pitcairn</option>\n	<option value=\"PR\">Puerto Rico</option>\n	<option value=\"QA\">Qatar</option>\n	<option value=\"RE\">Réunion</option>\n	<option value=\"RU\">Russian Federation</option>\n	<option value=\"RW\">Rwanda</option>\n	<option value=\"BL\">Saint Barthélemy</option>\n	<option value=\"SH\">Saint Helena</option>\n	<option value=\"KN\">Saint Kitts and Nevis</option>\n	<option value=\"LC\">Saint Lucia</option>\n	<option value=\"MF\">Saint Martin</option>\n	<option value=\"PM\">Saint Pierre and Miquelon</option>\n	<option value=\"VC\">Saint Vincent and The Grenadines</option>\n	<option value=\"WS\">Samoa</option>\n	<option value=\"SM\">San Marino</option>\n	<option value=\"ST\">Sao Tome and Principe</option>\n	<option value=\"SA\">Saudi Arabia</option>\n	<option value=\"SN\">Senegal</option>\n	<option value=\"SC\">Seychelles</option>\n	<option value=\"SL\">Sierra Leone</option>\n	<option value=\"SG\">Singapore</option>\n	<option value=\"SB\">Solomon Islands</option>\n	<option value=\"SO\">Somalia</option>\n	<option value=\"ZA\">South Africa</option>\n	<option value=\"LK\">Sri Lanka</option>\n	<option value=\"SD\">Sudan</option>\n	<option value=\"SR\">Suriname</option>\n	<option value=\"SJ\">Svalbard and Jan Mayen</option>\n	<option value=\"SZ\">Swaziland</option>\n	<option value=\"Taiwan\">Taiwan</option>\n	<option value=\"TJ\">Tajikistan</option>\n	<option value=\"Tanzania\">Tanzania</option>\n	<option value=\"TH\">Thailand</option>\n	<option value=\"TL\">Timor-Leste</option>\n	<option value=\"TG\">Togo</option>\n	<option value=\"TK\">Tokelau</option>\n	<option value=\"TO\">Tonga</option>\n	<option value=\"TT\">Trinidad and Tobago</option>\n	<option value=\"TN\">Tunisia</option>\n	<option value=\"TM\">Turkmenistan</option>\n	<option value=\"TC\">Turks and Caicos Islands</option>\n	<option value=\"TV\">Tuvalu</option>\n	<option value=\"UG\">Uganda</option>\n	<option value=\"AE\">United Arab Emirates</option>\n	<option value=\"US\">United States</option>\n	<option value=\"UY\">Uruguay</option>\n	<option value=\"UZ\">Uzbekistan</option>\n	<option value=\"VU\">Vanuatu</option>\n	<option value=\"VA\">Vatican</option>\n	<option value=\"Venezuela\">Venezuela</option>\n	<option value=\"VN\">Viet Nam</option>\n	<option value=\"Virgin Islands\">Virgin Islands</option>\n	<option value=\"Virgin Islands\">Virgin Islands</option>\n	<option value=\"VI\">U.S.</option>\n	<option value=\"WF\">Wallis and Futuna</option>\n	<option value=\"EH\">Western Sahara</option>\n	<option value=\"YE\">Yemen</option>\n	<option value=\"ZM\">Zambia</option>\n	<option value=\"ZW\">Zimbabwe</option></select>\n  </div>\n  \n  <button>Play!</button>\n  \n</form>\n";
  });

},{"handlebars-runtime":20}],15:[function(require,module,exports){
var Handlebars = require('handlebars-runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "\n<h1>match in progress</h1>\n\n<p>\n  As soon as the current match is finished,\n  you'll be able to join the action!\n</p>\n";
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
  


  return "<div class=\"player\">\n \n  <div class=\"landscape\">\n    <div class=\"row\">\n      <div class=\"button up\"><i>UP</i></div>\n      <div class=\"button down\"><i>DOWN</i></div>\n    </div>\n  </div>\n \n  <div class=\"portrait\">\n    <div class=\"row\">\n      <div class=\"button up\"><i>UP</i></div>\n    </div>\n    <div class=\"row\">\n      <div class=\"button down\"><i>DOWN</i></div>\n    </div>\n  </div>\n\n</div>\n";
  });

},{"handlebars-runtime":20}],19:[function(require,module,exports){
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
},{"./rx.min.js":21,"./rx.aggregates.min.js":22,"./rx.coincidence.min.js":23,"./rx.joinpatterns.min.js":24,"./rx.time.min.js":25}],21:[function(require,module,exports){
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
module.exports = function(k,t){var l;l=k.Rx;var n=l.Observable,d=n.prototype,m=n.createWithDisposable,u=l.CompositeDisposable,o=function(a,b){return a===b},p=function(a){return a},q=function(a,b){return a>b?1:a===b?0:-1},r=function(a,b,d){return m(function(c){var f=!1,g=null,h=[];return a.subscribe(function(a){var e,i;try{i=b(a)}catch(v){c.onError(v);return}e=0;if(f)try{e=d(i,g)}catch(w){c.onError(w);return}else f=!0,g=
i;0<e&&(g=i,h=[]);0<=e&&h.push(a)},function(a){c.onError(a)},function(){c.onNext(h);c.onCompleted()})})};d.aggregate=function(a,b){return this.scan(a,b).startWith(a).finalValue()};d.aggregate1=function(a){return this.scan1(a).finalValue()};d.any=function(a){var b=this;return a!==t?b.where(a).any():m(function(a){return b.subscribe(function(){a.onNext(!0);a.onCompleted()},function(b){a.onError(b)},function(){a.onNext(!1);a.onCompleted()})})};d.all=function(a){return this.where(function(b){return!a(b)}).any().select(function(a){return!a})};
d.contains=function(a,b){b||(b=o);return this.where(function(d){return b(d,a)}).any()};d.count=function(){return this.aggregate(0,function(a){return a+1})};d.sum=function(){return this.aggregate(0,function(a,b){return a+b})};d.minBy=function(a,b){b||(b=q);return r(this,a,function(a,c){return-1*b(a,c)})};var s=function(a){if(0==a.length)throw Error("Sequence contains no elements.");return a[0]};d.min=function(a){return this.minBy(p,a).select(function(a){return s(a)})};d.maxBy=function(a,b){b||(b=q);
return r(this,a,b)};d.max=function(a){return this.maxBy(p,a).select(function(a){return s(a)})};d.average=function(){return this.scan({sum:0,count:0},function(a,b){return{sum:a.sum+b,count:a.count+1}}).finalValue().select(function(a){return a.sum/a.count})};d.sequenceEqual=function(a,b){var d=this;b||(b=o);return m(function(c){var f=!1,g=!1,h=[],j=[],e=d.subscribe(function(a){var d,f;if(0<j.length){f=j.shift();try{d=b(f,a)}catch(e){c.onError(e);return}d||(c.onNext(!1),c.onCompleted())}else g?(c.onNext(!1),
c.onCompleted()):h.push(a)},function(a){c.onError(a)},function(){f=!0;0===h.length&&(0<j.length?(c.onNext(!1),c.onCompleted()):g&&(c.onNext(!0),c.onCompleted()))}),i=a.subscribe(function(a){var d,e;if(0<h.length){e=h.shift();try{d=b(e,a)}catch(g){c.onError(g);return}d||(c.onNext(!1),c.onCompleted())}else f?(c.onNext(!1),c.onCompleted()):j.push(a)},function(a){c.onError(a)},function(){g=!0;0===j.length&&(0<h.length?(c.onNext(!1),c.onCompleted()):f&&(c.onNext(!0),c.onCompleted()))});return new u(e,
i)})}};

},{}],23:[function(require,module,exports){
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
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZGV2aWNlL2pzL2RldmljZS5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy8zcmRwYXJ0eS9yb3V0aWUuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvM3JkcGFydHkvdGFwcGFibGUuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZGV2aWNlL2pzL2NvbnRyb2xsZXJzL3JlZ2lzdGVyLmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzL2RldmljZS9qcy9jb250cm9sbGVycy9qb2luLmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzL2RldmljZS9qcy9jb250cm9sbGVycy90aGFua3MuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZGV2aWNlL2pzL3BsYXllci5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL25vZGVfbW9kdWxlcy91bmRlcnNjb3JlL3VuZGVyc2NvcmUuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZGV2aWNlL2pzL2NvbnRyb2xsZXJzL3dhaXQuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZGV2aWNlL2pzL2NvbnRyb2xsZXJzL2dhbWVwYWQuanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZGV2aWNlL2pzL2NvbnRyb2xsZXJzL2xvYmJ5LmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzLzNyZHBhcnR5L3J4LnplcHRvLmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzL2RldmljZS92aWV3cy9yZWdpc3Rlci1hZHZhbmNlZC5oYnMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZGV2aWNlL3ZpZXdzL3dhaXQuaGJzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvYXNzZXRzL2RldmljZS92aWV3cy9qb2luLmhicyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy9kZXZpY2Uvdmlld3MvZ2FtZXBhZC5oYnMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9hc3NldHMvZGV2aWNlL3ZpZXdzL2xvYmJ5LmhicyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL2Fzc2V0cy9kZXZpY2Uvdmlld3MvdGhhbmtzLmhicyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL25vZGVfbW9kdWxlcy9oYW5kbGViYXJzLXJ1bnRpbWUvaGFuZGxlYmFycy5ydW50aW1lLmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvbm9kZV9tb2R1bGVzL3J4anMvbGliL3J4LmpzIiwiL1VzZXJzL2dnYS9kZXYvdGhvdWdodHdvcmtzL2pldHBldHMvbm9kZV9tb2R1bGVzL3J4anMvbGliL3J4Lm1pbi5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL25vZGVfbW9kdWxlcy9yeGpzL2xpYi9yeC5hZ2dyZWdhdGVzLm1pbi5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL25vZGVfbW9kdWxlcy9yeGpzL2xpYi9yeC5jb2luY2lkZW5jZS5taW4uanMiLCIvVXNlcnMvZ2dhL2Rldi90aG91Z2h0d29ya3MvamV0cGV0cy9ub2RlX21vZHVsZXMvcnhqcy9saWIvcnguam9pbnBhdHRlcm5zLm1pbi5qcyIsIi9Vc2Vycy9nZ2EvZGV2L3Rob3VnaHR3b3Jrcy9qZXRwZXRzL25vZGVfbW9kdWxlcy9yeGpzL2xpYi9yeC50aW1lLm1pbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNXQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyJ2YXIgcm91dGllID0gcmVxdWlyZSgnLi4vLi4vM3JkcGFydHkvcm91dGllJyk7XG52YXIgdGFwcGFibGUgPSByZXF1aXJlKCcuLi8uLi8zcmRwYXJ0eS90YXBwYWJsZScpO1xudmFyIHBsYXllciA9IHJlcXVpcmUoJy4vcGxheWVyJyk7XG5cbndpbmRvdy5EZXZpY2UgPSBmdW5jdGlvbigpIHtcbiAgXG4gIHJvdXRpZSh7XG4gICAgICAnJzogICAgICAgICAgICByZXF1aXJlKCcuL2NvbnRyb2xsZXJzL3JlZ2lzdGVyJyksXG4gICAgICAnL3JlZ2lzdGVyJzogICByZXF1aXJlKCcuL2NvbnRyb2xsZXJzL3JlZ2lzdGVyJyksXG4gICAgICAnL3dhaXQnOiAgICAgICByZXF1aXJlKCcuL2NvbnRyb2xsZXJzL3dhaXQnKSxcbiAgICAgICcvam9pbic6ICAgICAgIHJlcXVpcmUoJy4vY29udHJvbGxlcnMvam9pbicpLFxuICAgICAgJy9sb2JieSc6ICAgICAgcmVxdWlyZSgnLi9jb250cm9sbGVycy9sb2JieScpLFxuICAgICAgJy9nYW1lcGFkJzogICAgcmVxdWlyZSgnLi9jb250cm9sbGVycy9nYW1lcGFkJyksXG4gICAgICAnL3RoYW5rcyc6ICAgICByZXF1aXJlKCcuL2NvbnRyb2xsZXJzL3RoYW5rcycpXG4gIH0pO1xuICBcbiAgJCgnI21lbnUnKS5vbignY2xpY2snLCBmdW5jdGlvbigpIHtcbiAgICBpZiAod2luZG93LmNvbmZpcm0oJ2Rpc2Nvbm5lY3QgcGxheWVyPycpKSB7XG4gICAgICBwbGF5ZXIucmVzZXQoKTtcbiAgICAgIHJvdXRpZS5uYXZpZ2F0ZSgnLycpO1xuICAgIH1cbiAgfSk7XG4gIFxufTtcbiIsIihmdW5jdGlvbiAocm9vdCwgZmFjdG9yeSkge1xuICBpZiAodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KHdpbmRvdyk7XG4gIH0gZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgZGVmaW5lKFtdLCBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gKHJvb3Qucm91dGllID0gZmFjdG9yeSh3aW5kb3cpKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByb290LnJvdXRpZSA9IGZhY3Rvcnkod2luZG93KTtcbiAgfVxufSh0aGlzLCBmdW5jdGlvbiAodykge1xuXG4gIHZhciByb3V0ZXMgPSBbXTtcbiAgdmFyIG1hcCA9IHt9O1xuICB2YXIgcmVmZXJlbmNlID0gXCJyb3V0aWVcIjtcbiAgdmFyIG9sZFJlZmVyZW5jZSA9IHdbcmVmZXJlbmNlXTtcblxuICB2YXIgUm91dGUgPSBmdW5jdGlvbihwYXRoLCBuYW1lKSB7XG4gICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICB0aGlzLnBhdGggPSBwYXRoO1xuICAgIHRoaXMua2V5cyA9IFtdO1xuICAgIHRoaXMuZm5zID0gW107XG4gICAgdGhpcy5wYXJhbXMgPSB7fTtcbiAgICB0aGlzLnJlZ2V4ID0gcGF0aFRvUmVnZXhwKHRoaXMucGF0aCwgdGhpcy5rZXlzLCBmYWxzZSwgZmFsc2UpO1xuXG4gIH07XG5cbiAgUm91dGUucHJvdG90eXBlLmFkZEhhbmRsZXIgPSBmdW5jdGlvbihmbikge1xuICAgIHRoaXMuZm5zLnB1c2goZm4pO1xuICB9O1xuXG4gIFJvdXRlLnByb3RvdHlwZS5yZW1vdmVIYW5kbGVyID0gZnVuY3Rpb24oZm4pIHtcbiAgICBmb3IgKHZhciBpID0gMCwgYyA9IHRoaXMuZm5zLmxlbmd0aDsgaSA8IGM7IGkrKykge1xuICAgICAgdmFyIGYgPSB0aGlzLmZuc1tpXTtcbiAgICAgIGlmIChmbiA9PSBmKSB7XG4gICAgICAgIHRoaXMuZm5zLnNwbGljZShpLCAxKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICBSb3V0ZS5wcm90b3R5cGUucnVuID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGMgPSB0aGlzLmZucy5sZW5ndGg7IGkgPCBjOyBpKyspIHtcbiAgICAgIHRoaXMuZm5zW2ldLmFwcGx5KHRoaXMsIHBhcmFtcyk7XG4gICAgfVxuICB9O1xuXG4gIFJvdXRlLnByb3RvdHlwZS5tYXRjaCA9IGZ1bmN0aW9uKHBhdGgsIHBhcmFtcyl7XG4gICAgdmFyIG0gPSB0aGlzLnJlZ2V4LmV4ZWMocGF0aCk7XG5cbiAgICBpZiAoIW0pIHJldHVybiBmYWxzZTtcblxuXG4gICAgZm9yICh2YXIgaSA9IDEsIGxlbiA9IG0ubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICAgIHZhciBrZXkgPSB0aGlzLmtleXNbaSAtIDFdO1xuXG4gICAgICB2YXIgdmFsID0gKCdzdHJpbmcnID09IHR5cGVvZiBtW2ldKSA/IGRlY29kZVVSSUNvbXBvbmVudChtW2ldKSA6IG1baV07XG5cbiAgICAgIGlmIChrZXkpIHtcbiAgICAgICAgdGhpcy5wYXJhbXNba2V5Lm5hbWVdID0gdmFsO1xuICAgICAgfVxuICAgICAgcGFyYW1zLnB1c2godmFsKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcblxuICBSb3V0ZS5wcm90b3R5cGUudG9VUkwgPSBmdW5jdGlvbihwYXJhbXMpIHtcbiAgICB2YXIgcGF0aCA9IHRoaXMucGF0aDtcbiAgICBmb3IgKHZhciBwYXJhbSBpbiBwYXJhbXMpIHtcbiAgICAgIHBhdGggPSBwYXRoLnJlcGxhY2UoJy86JytwYXJhbSwgJy8nK3BhcmFtc1twYXJhbV0pO1xuICAgIH1cbiAgICBwYXRoID0gcGF0aC5yZXBsYWNlKC9cXC86LipcXD8vZywgJy8nKS5yZXBsYWNlKC9cXD8vZywgJycpO1xuICAgIGlmIChwYXRoLmluZGV4T2YoJzonKSAhPSAtMSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtaXNzaW5nIHBhcmFtZXRlcnMgZm9yIHVybDogJytwYXRoKTtcbiAgICB9XG4gICAgcmV0dXJuIHBhdGg7XG4gIH07XG5cbiAgdmFyIHBhdGhUb1JlZ2V4cCA9IGZ1bmN0aW9uKHBhdGgsIGtleXMsIHNlbnNpdGl2ZSwgc3RyaWN0KSB7XG4gICAgaWYgKHBhdGggaW5zdGFuY2VvZiBSZWdFeHApIHJldHVybiBwYXRoO1xuICAgIGlmIChwYXRoIGluc3RhbmNlb2YgQXJyYXkpIHBhdGggPSAnKCcgKyBwYXRoLmpvaW4oJ3wnKSArICcpJztcbiAgICBwYXRoID0gcGF0aFxuICAgICAgLmNvbmNhdChzdHJpY3QgPyAnJyA6ICcvPycpXG4gICAgICAucmVwbGFjZSgvXFwvXFwoL2csICcoPzovJylcbiAgICAgIC5yZXBsYWNlKC9cXCsvZywgJ19fcGx1c19fJylcbiAgICAgIC5yZXBsYWNlKC8oXFwvKT8oXFwuKT86KFxcdyspKD86KFxcKC4qP1xcKSkpPyhcXD8pPy9nLCBmdW5jdGlvbihfLCBzbGFzaCwgZm9ybWF0LCBrZXksIGNhcHR1cmUsIG9wdGlvbmFsKXtcbiAgICAgICAga2V5cy5wdXNoKHsgbmFtZToga2V5LCBvcHRpb25hbDogISEgb3B0aW9uYWwgfSk7XG4gICAgICAgIHNsYXNoID0gc2xhc2ggfHwgJyc7XG4gICAgICAgIHJldHVybiAnJyArIChvcHRpb25hbCA/ICcnIDogc2xhc2gpICsgJyg/OicgKyAob3B0aW9uYWwgPyBzbGFzaCA6ICcnKSArIChmb3JtYXQgfHwgJycpICsgKGNhcHR1cmUgfHwgKGZvcm1hdCAmJiAnKFteLy5dKz8pJyB8fCAnKFteL10rPyknKSkgKyAnKScgKyAob3B0aW9uYWwgfHwgJycpO1xuICAgICAgfSlcbiAgICAgIC5yZXBsYWNlKC8oW1xcLy5dKS9nLCAnXFxcXCQxJylcbiAgICAgIC5yZXBsYWNlKC9fX3BsdXNfXy9nLCAnKC4rKScpXG4gICAgICAucmVwbGFjZSgvXFwqL2csICcoLiopJyk7XG4gICAgcmV0dXJuIG5ldyBSZWdFeHAoJ14nICsgcGF0aCArICckJywgc2Vuc2l0aXZlID8gJycgOiAnaScpO1xuICB9O1xuXG4gIHZhciBhZGRIYW5kbGVyID0gZnVuY3Rpb24ocGF0aCwgZm4pIHtcbiAgICB2YXIgcyA9IHBhdGguc3BsaXQoJyAnKTtcbiAgICB2YXIgbmFtZSA9IChzLmxlbmd0aCA9PSAyKSA/IHNbMF0gOiBudWxsO1xuICAgIHBhdGggPSAocy5sZW5ndGggPT0gMikgPyBzWzFdIDogc1swXTtcblxuICAgIGlmICghbWFwW3BhdGhdKSB7XG4gICAgICBtYXBbcGF0aF0gPSBuZXcgUm91dGUocGF0aCwgbmFtZSk7XG4gICAgICByb3V0ZXMucHVzaChtYXBbcGF0aF0pO1xuICAgIH1cbiAgICBtYXBbcGF0aF0uYWRkSGFuZGxlcihmbik7XG4gIH07XG5cbiAgdmFyIHJvdXRpZSA9IGZ1bmN0aW9uKHBhdGgsIGZuKSB7XG4gICAgaWYgKHR5cGVvZiBmbiA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICBhZGRIYW5kbGVyKHBhdGgsIGZuKTtcbiAgICAgIHJvdXRpZS5yZWxvYWQoKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBwYXRoID09ICdvYmplY3QnKSB7XG4gICAgICBmb3IgKHZhciBwIGluIHBhdGgpIHtcbiAgICAgICAgYWRkSGFuZGxlcihwLCBwYXRoW3BdKTtcbiAgICAgIH1cbiAgICAgIHJvdXRpZS5yZWxvYWQoKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmbiA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJvdXRpZS5uYXZpZ2F0ZShwYXRoKTtcbiAgICB9XG4gIH07XG5cbiAgcm91dGllLmxvb2t1cCA9IGZ1bmN0aW9uKG5hbWUsIG9iaikge1xuICAgIGZvciAodmFyIGkgPSAwLCBjID0gcm91dGVzLmxlbmd0aDsgaSA8IGM7IGkrKykge1xuICAgICAgdmFyIHJvdXRlID0gcm91dGVzW2ldO1xuICAgICAgaWYgKHJvdXRlLm5hbWUgPT0gbmFtZSkge1xuICAgICAgICByZXR1cm4gcm91dGUudG9VUkwob2JqKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgcm91dGllLnJlbW92ZSA9IGZ1bmN0aW9uKHBhdGgsIGZuKSB7XG4gICAgdmFyIHJvdXRlID0gbWFwW3BhdGhdO1xuICAgIGlmICghcm91dGUpXG4gICAgICByZXR1cm47XG4gICAgcm91dGUucmVtb3ZlSGFuZGxlcihmbik7XG4gIH07XG5cbiAgcm91dGllLnJlbW92ZUFsbCA9IGZ1bmN0aW9uKCkge1xuICAgIG1hcCA9IHt9O1xuICAgIHJvdXRlcyA9IFtdO1xuICB9O1xuXG4gIHJvdXRpZS5uYXZpZ2F0ZSA9IGZ1bmN0aW9uKHBhdGgsIG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICB2YXIgc2lsZW50ID0gb3B0aW9ucy5zaWxlbnQgfHwgZmFsc2U7XG5cbiAgICBpZiAoc2lsZW50KSB7XG4gICAgICByZW1vdmVMaXN0ZW5lcigpO1xuICAgIH1cbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgd2luZG93LmxvY2F0aW9uLmhhc2ggPSBwYXRoO1xuXG4gICAgICBpZiAoc2lsZW50KSB7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IFxuICAgICAgICAgIGFkZExpc3RlbmVyKCk7XG4gICAgICAgIH0sIDEpO1xuICAgICAgfVxuXG4gICAgfSwgMSk7XG4gIH07XG5cbiAgcm91dGllLm5vQ29uZmxpY3QgPSBmdW5jdGlvbigpIHtcbiAgICB3W3JlZmVyZW5jZV0gPSBvbGRSZWZlcmVuY2U7XG4gICAgcmV0dXJuIHJvdXRpZTtcbiAgfTtcblxuICB2YXIgZ2V0SGFzaCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB3aW5kb3cubG9jYXRpb24uaGFzaC5zdWJzdHJpbmcoMSk7XG4gIH07XG5cbiAgdmFyIGNoZWNrUm91dGUgPSBmdW5jdGlvbihoYXNoLCByb3V0ZSkge1xuICAgIHZhciBwYXJhbXMgPSBbXTtcbiAgICBpZiAocm91dGUubWF0Y2goaGFzaCwgcGFyYW1zKSkge1xuICAgICAgcm91dGUucnVuKHBhcmFtcyk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9O1xuXG4gIHZhciBoYXNoQ2hhbmdlZCA9IHJvdXRpZS5yZWxvYWQgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgaGFzaCA9IGdldEhhc2goKTtcbiAgICBmb3IgKHZhciBpID0gMCwgYyA9IHJvdXRlcy5sZW5ndGg7IGkgPCBjOyBpKyspIHtcbiAgICAgIHZhciByb3V0ZSA9IHJvdXRlc1tpXTtcbiAgICAgIGlmIChjaGVja1JvdXRlKGhhc2gsIHJvdXRlKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIHZhciBhZGRMaXN0ZW5lciA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh3LmFkZEV2ZW50TGlzdGVuZXIpIHtcbiAgICAgIHcuYWRkRXZlbnRMaXN0ZW5lcignaGFzaGNoYW5nZScsIGhhc2hDaGFuZ2VkLCBmYWxzZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHcuYXR0YWNoRXZlbnQoJ29uaGFzaGNoYW5nZScsIGhhc2hDaGFuZ2VkKTtcbiAgICB9XG4gIH07XG5cbiAgdmFyIHJlbW92ZUxpc3RlbmVyID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHcucmVtb3ZlRXZlbnRMaXN0ZW5lcikge1xuICAgICAgdy5yZW1vdmVFdmVudExpc3RlbmVyKCdoYXNoY2hhbmdlJywgaGFzaENoYW5nZWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICB3LmRldGFjaEV2ZW50KCdvbmhhc2hjaGFuZ2UnLCBoYXNoQ2hhbmdlZCk7XG4gICAgfVxuICB9O1xuICBhZGRMaXN0ZW5lcigpO1xuXG4gIHJldHVybiByb3V0aWU7XG59KSk7XG4iLCIoZnVuY3Rpb24oKXsoZnVuY3Rpb24ocm9vdCwgZmFjdG9yeSl7XG4gIC8vIFNldCB1cCBUYXBwYWJsZSBhcHByb3ByaWF0ZWx5IGZvciB0aGUgZW52aXJvbm1lbnQuXG4gIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpe1xuICAgIC8vIEFNRFxuICAgIGRlZmluZSgndGFwcGFibGUnLCBbXSwgZnVuY3Rpb24oKXtcbiAgICAgIGZhY3Rvcnkocm9vdCwgd2luZG93LmRvY3VtZW50KTtcbiAgICAgIHJldHVybiByb290LnRhcHBhYmxlO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIC8vIEJyb3dzZXIgZ2xvYmFsIHNjb3BlXG4gICAgZmFjdG9yeShyb290LCB3aW5kb3cuZG9jdW1lbnQpO1xuICB9XG59KHRoaXMsIGZ1bmN0aW9uKHcsIGQpe1xuXG4gIHZhciBhYnMgPSBNYXRoLmFicyxcbiAgICBub29wID0gZnVuY3Rpb24oKXt9LFxuICAgIGRlZmF1bHRzID0ge1xuICAgICAgbm9TY3JvbGw6IGZhbHNlLFxuICAgICAgYWN0aXZlQ2xhc3M6ICd0YXBwYWJsZS1hY3RpdmUnLFxuICAgICAgb25UYXA6IG5vb3AsXG4gICAgICBvblN0YXJ0OiBub29wLFxuICAgICAgb25Nb3ZlOiBub29wLFxuICAgICAgb25Nb3ZlT3V0OiBub29wLFxuICAgICAgb25Nb3ZlSW46IG5vb3AsXG4gICAgICBvbkVuZDogbm9vcCxcbiAgICAgIG9uQ2FuY2VsOiBub29wLFxuICAgICAgYWxsb3dDbGljazogZmFsc2UsXG4gICAgICBib3VuZE1hcmdpbjogNTAsXG4gICAgICBub1Njcm9sbERlbGF5OiAwLFxuICAgICAgYWN0aXZlQ2xhc3NEZWxheTogMCxcbiAgICAgIGluYWN0aXZlQ2xhc3NEZWxheTogMFxuICAgIH0sXG4gICAgc3VwcG9ydFRvdWNoID0gJ29udG91Y2hlbmQnIGluIGRvY3VtZW50LFxuICAgIGV2ZW50cyA9IHtcbiAgICAgIHN0YXJ0OiBzdXBwb3J0VG91Y2ggPyAndG91Y2hzdGFydCcgOiAnbW91c2Vkb3duJyxcbiAgICAgIG1vdmU6IHN1cHBvcnRUb3VjaCA/ICd0b3VjaG1vdmUnIDogJ21vdXNlbW92ZScsXG4gICAgICBlbmQ6IHN1cHBvcnRUb3VjaCA/ICd0b3VjaGVuZCcgOiAnbW91c2V1cCdcbiAgICB9LFxuICAgIGdldFRhcmdldEJ5Q29vcmRzID0gZnVuY3Rpb24oeCwgeSl7XG4gICAgICB2YXIgZWwgPSBkLmVsZW1lbnRGcm9tUG9pbnQoeCwgeSk7XG4gICAgICBpZiAoZWwubm9kZVR5cGUgPT0gMykgZWwgPSBlbC5wYXJlbnROb2RlO1xuICAgICAgcmV0dXJuIGVsO1xuICAgIH0sXG4gICAgZ2V0VGFyZ2V0ID0gZnVuY3Rpb24oZSl7XG4gICAgICB2YXIgZWwgPSBlLnRhcmdldDtcbiAgICAgIGlmIChlbCkge1xuICAgICAgICBpZiAoZWwubm9kZVR5cGUgPT0gMykgZWwgPSBlbC5wYXJlbnROb2RlO1xuICAgICAgICByZXR1cm4gZWw7XG4gICAgICB9XG4gICAgICB2YXIgdG91Y2ggPSBlLnRhcmdldFRvdWNoZXNbMF07XG4gICAgICByZXR1cm4gZ2V0VGFyZ2V0QnlDb29yZHModG91Y2guY2xpZW50WCwgdG91Y2guY2xpZW50WSk7XG4gICAgfSxcbiAgICBjbGVhbiA9IGZ1bmN0aW9uKHN0cil7XG4gICAgICByZXR1cm4gc3RyLnJlcGxhY2UoL1xccysvZywgJyAnKS5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJyk7XG4gICAgfSxcbiAgICBhZGRDbGFzcyA9IGZ1bmN0aW9uKGVsLCBjbGFzc05hbWUpe1xuICAgICAgaWYgKCFjbGFzc05hbWUpIHJldHVybjtcbiAgICAgIGlmIChlbC5jbGFzc0xpc3Qpe1xuICAgICAgICBlbC5jbGFzc0xpc3QuYWRkKGNsYXNzTmFtZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChjbGVhbihlbC5jbGFzc05hbWUpLmluZGV4T2YoY2xhc3NOYW1lKSA+IC0xKSByZXR1cm47XG4gICAgICBlbC5jbGFzc05hbWUgPSBjbGVhbihlbC5jbGFzc05hbWUgKyAnICcgKyBjbGFzc05hbWUpO1xuICAgIH0sXG4gICAgcmVtb3ZlQ2xhc3MgPSBmdW5jdGlvbihlbCwgY2xhc3NOYW1lKXtcbiAgICAgIGlmICghY2xhc3NOYW1lKSByZXR1cm47XG4gICAgICBpZiAoZWwuY2xhc3NMaXN0KXtcbiAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZShjbGFzc05hbWUpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBlbC5jbGFzc05hbWUgPSBlbC5jbGFzc05hbWUucmVwbGFjZShuZXcgUmVnRXhwKCcoXnxcXFxccyknICsgY2xhc3NOYW1lICsgJyg/OlxcXFxzfCQpJyksICckMScpO1xuICAgIH0sXG4gICAgbWF0Y2hlc1NlbGVjdG9yID0gZnVuY3Rpb24obm9kZSwgc2VsZWN0b3Ipe1xuICAgICAgdmFyIHJvb3QgPSBkLmRvY3VtZW50RWxlbWVudCxcbiAgICAgICAgbWF0Y2hlcyA9IHJvb3QubWF0Y2hlc1NlbGVjdG9yIHx8IHJvb3QubW96TWF0Y2hlc1NlbGVjdG9yIHx8IHJvb3Qud2Via2l0TWF0Y2hlc1NlbGVjdG9yIHx8IHJvb3Qub01hdGNoZXNTZWxlY3RvciB8fCByb290Lm1zTWF0Y2hlc1NlbGVjdG9yO1xuICAgICAgcmV0dXJuIG1hdGNoZXMuY2FsbChub2RlLCBzZWxlY3Rvcik7XG4gICAgfSxcbiAgICBjbG9zZXN0ID0gZnVuY3Rpb24obm9kZSwgc2VsZWN0b3Ipe1xuICAgICAgdmFyIG1hdGNoZXMgPSBmYWxzZTtcbiAgICAgIGRvIHtcbiAgICAgICAgbWF0Y2hlcyA9IG1hdGNoZXNTZWxlY3Rvcihub2RlLCBzZWxlY3Rvcik7XG4gICAgICB9IHdoaWxlICghbWF0Y2hlcyAmJiAobm9kZSA9IG5vZGUucGFyZW50Tm9kZSkgJiYgbm9kZS5vd25lckRvY3VtZW50KTtcbiAgICAgIHJldHVybiBtYXRjaGVzID8gbm9kZSA6IGZhbHNlO1xuICAgIH07XG5cbiAgdy50YXBwYWJsZSA9IGZ1bmN0aW9uKHNlbGVjdG9yLCBvcHRzKXtcbiAgICBpZiAodHlwZW9mIG9wdHMgPT0gJ2Z1bmN0aW9uJykgb3B0cyA9IHsgb25UYXA6IG9wdHMgfTtcbiAgICB2YXIgb3B0aW9ucyA9IHt9O1xuICAgIGZvciAodmFyIGtleSBpbiBkZWZhdWx0cykgb3B0aW9uc1trZXldID0gb3B0c1trZXldIHx8IGRlZmF1bHRzW2tleV07XG5cbiAgICB2YXIgZWwgPSBvcHRpb25zLmNvbnRhaW5lckVsZW1lbnQgfHwgZC5ib2R5LFxuICAgICAgc3RhcnRUYXJnZXQsXG4gICAgICBwcmV2VGFyZ2V0LFxuICAgICAgc3RhcnRYLFxuICAgICAgc3RhcnRZLFxuICAgICAgZWxCb3VuZCxcbiAgICAgIGNhbmNlbCA9IGZhbHNlLFxuICAgICAgbW92ZU91dCA9IGZhbHNlLFxuICAgICAgYWN0aXZlQ2xhc3MgPSBvcHRpb25zLmFjdGl2ZUNsYXNzLFxuICAgICAgYWN0aXZlQ2xhc3NEZWxheSA9IG9wdGlvbnMuYWN0aXZlQ2xhc3NEZWxheSxcbiAgICAgIGFjdGl2ZUNsYXNzVGltZW91dCxcbiAgICAgIGluYWN0aXZlQ2xhc3NEZWxheSA9IG9wdGlvbnMuaW5hY3RpdmVDbGFzc0RlbGF5LFxuICAgICAgaW5hY3RpdmVDbGFzc1RpbWVvdXQsXG4gICAgICBub1Njcm9sbCA9IG9wdGlvbnMubm9TY3JvbGwsXG4gICAgICBub1Njcm9sbERlbGF5ID0gb3B0aW9ucy5ub1Njcm9sbERlbGF5LFxuICAgICAgbm9TY3JvbGxUaW1lb3V0LFxuICAgICAgYm91bmRNYXJnaW4gPSBvcHRpb25zLmJvdW5kTWFyZ2luO1xuXG4gICAgdmFyIG9uU3RhcnQgPSBmdW5jdGlvbihlKXtcbiAgICAgIHZhciB0YXJnZXQgPSBjbG9zZXN0KGdldFRhcmdldChlKSwgc2VsZWN0b3IpO1xuICAgICAgaWYgKCF0YXJnZXQpIHJldHVybjtcblxuICAgICAgaWYgKGFjdGl2ZUNsYXNzRGVsYXkpe1xuICAgICAgICBjbGVhclRpbWVvdXQoYWN0aXZlQ2xhc3NUaW1lb3V0KTtcbiAgICAgICAgYWN0aXZlQ2xhc3NUaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgICAgIGFkZENsYXNzKHRhcmdldCwgYWN0aXZlQ2xhc3MpO1xuICAgICAgICB9LCBhY3RpdmVDbGFzc0RlbGF5KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGFkZENsYXNzKHRhcmdldCwgYWN0aXZlQ2xhc3MpO1xuICAgICAgfVxuICAgICAgaWYgKGluYWN0aXZlQ2xhc3NEZWxheSAmJiB0YXJnZXQgPT0gcHJldlRhcmdldCkgY2xlYXJUaW1lb3V0KGluYWN0aXZlQ2xhc3NUaW1lb3V0KTtcblxuICAgICAgc3RhcnRYID0gZS5jbGllbnRYO1xuICAgICAgc3RhcnRZID0gZS5jbGllbnRZO1xuICAgICAgaWYgKCFzdGFydFggfHwgIXN0YXJ0WSl7XG4gICAgICAgIHZhciB0b3VjaCA9IGUudGFyZ2V0VG91Y2hlc1swXTtcbiAgICAgICAgc3RhcnRYID0gdG91Y2guY2xpZW50WDtcbiAgICAgICAgc3RhcnRZID0gdG91Y2guY2xpZW50WTtcbiAgICAgIH1cbiAgICAgIHN0YXJ0VGFyZ2V0ID0gdGFyZ2V0O1xuICAgICAgY2FuY2VsID0gZmFsc2U7XG4gICAgICBtb3ZlT3V0ID0gZmFsc2U7XG4gICAgICBlbEJvdW5kID0gbm9TY3JvbGwgPyB0YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkgOiBudWxsO1xuXG4gICAgICBpZiAobm9TY3JvbGxEZWxheSl7XG4gICAgICAgIGNsZWFyVGltZW91dChub1Njcm9sbFRpbWVvdXQpO1xuICAgICAgICBub1Njcm9sbCA9IGZhbHNlOyAvLyBzZXQgZmFsc2UgZmlyc3QsIHRoZW4gdHJ1ZSBhZnRlciBhIGRlbGF5XG4gICAgICAgIG5vU2Nyb2xsVGltZW91dCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgICAgICBub1Njcm9sbCA9IHRydWU7XG4gICAgICAgIH0sIG5vU2Nyb2xsRGVsYXkpO1xuICAgICAgfVxuICAgICAgb3B0aW9ucy5vblN0YXJ0LmNhbGwoZWwsIGUsIHRhcmdldCk7XG4gICAgfTtcblxuICAgIHZhciBvbk1vdmUgPSBmdW5jdGlvbihlKXtcbiAgICAgIGlmICghc3RhcnRUYXJnZXQpIHJldHVybjtcblxuICAgICAgaWYgKG5vU2Nyb2xsKXtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KGFjdGl2ZUNsYXNzVGltZW91dCk7XG4gICAgICB9XG5cbiAgICAgIHZhciB0YXJnZXQgPSBlLnRhcmdldCxcbiAgICAgICAgeCA9IGUuY2xpZW50WCxcbiAgICAgICAgeSA9IGUuY2xpZW50WTtcbiAgICAgIGlmICghdGFyZ2V0IHx8ICF4IHx8ICF5KXsgLy8gVGhlIGV2ZW50IG1pZ2h0IGhhdmUgYSB0YXJnZXQgYnV0IG5vIGNsaWVudFgvWVxuICAgICAgICB2YXIgdG91Y2ggPSBlLmNoYW5nZWRUb3VjaGVzWzBdO1xuICAgICAgICBpZiAoIXgpIHggPSB0b3VjaC5jbGllbnRYO1xuICAgICAgICBpZiAoIXkpIHkgPSB0b3VjaC5jbGllbnRZO1xuICAgICAgICBpZiAoIXRhcmdldCkgdGFyZ2V0ID0gZ2V0VGFyZ2V0QnlDb29yZHMoeCwgeSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChub1Njcm9sbCl7XG4gICAgICAgIGlmICh4PmVsQm91bmQubGVmdC1ib3VuZE1hcmdpbiAmJiB4PGVsQm91bmQucmlnaHQrYm91bmRNYXJnaW4gJiYgeT5lbEJvdW5kLnRvcC1ib3VuZE1hcmdpbiAmJiB5PGVsQm91bmQuYm90dG9tK2JvdW5kTWFyZ2luKXsgLy8gd2l0aGluIGVsZW1lbnQncyBib3VuZGFyeVxuICAgICAgICAgIG1vdmVPdXQgPSBmYWxzZTtcbiAgICAgICAgICBhZGRDbGFzcyhzdGFydFRhcmdldCwgYWN0aXZlQ2xhc3MpO1xuICAgICAgICAgIG9wdGlvbnMub25Nb3ZlSW4uY2FsbChlbCwgZSwgdGFyZ2V0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBtb3ZlT3V0ID0gdHJ1ZTtcbiAgICAgICAgICByZW1vdmVDbGFzcyhzdGFydFRhcmdldCwgYWN0aXZlQ2xhc3MpO1xuICAgICAgICAgIG9wdGlvbnMub25Nb3ZlT3V0LmNhbGwoZWwsIGUsIHRhcmdldCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoIWNhbmNlbCAmJiBhYnMoeSAtIHN0YXJ0WSkgPiAxMCl7XG4gICAgICAgIGNhbmNlbCA9IHRydWU7XG4gICAgICAgIHJlbW92ZUNsYXNzKHN0YXJ0VGFyZ2V0LCBhY3RpdmVDbGFzcyk7XG4gICAgICAgIG9wdGlvbnMub25DYW5jZWwuY2FsbCh0YXJnZXQsIGUpO1xuICAgICAgfVxuXG4gICAgICBvcHRpb25zLm9uTW92ZS5jYWxsKGVsLCBlLCB0YXJnZXQpO1xuICAgIH07XG5cbiAgICB2YXIgb25FbmQgPSBmdW5jdGlvbihlKXtcbiAgICAgIGlmICghc3RhcnRUYXJnZXQpIHJldHVybjtcblxuICAgICAgY2xlYXJUaW1lb3V0KGFjdGl2ZUNsYXNzVGltZW91dCk7XG4gICAgICBpZiAoaW5hY3RpdmVDbGFzc0RlbGF5KXtcbiAgICAgICAgaWYgKGFjdGl2ZUNsYXNzRGVsYXkgJiYgIWNhbmNlbCkgYWRkQ2xhc3Moc3RhcnRUYXJnZXQsIGFjdGl2ZUNsYXNzKTtcbiAgICAgICAgdmFyIGFjdGl2ZVRhcmdldCA9IHN0YXJ0VGFyZ2V0O1xuICAgICAgICBpbmFjdGl2ZUNsYXNzVGltZW91dCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgICAgICByZW1vdmVDbGFzcyhhY3RpdmVUYXJnZXQsIGFjdGl2ZUNsYXNzKTtcbiAgICAgICAgfSwgaW5hY3RpdmVDbGFzc0RlbGF5KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlbW92ZUNsYXNzKHN0YXJ0VGFyZ2V0LCBhY3RpdmVDbGFzcyk7XG4gICAgICB9XG5cbiAgICAgIG9wdGlvbnMub25FbmQuY2FsbChlbCwgZSwgc3RhcnRUYXJnZXQpO1xuXG4gICAgICB2YXIgcmlnaHRDbGljayA9IGUud2hpY2ggPT0gMyB8fCBlLmJ1dHRvbiA9PSAyO1xuICAgICAgaWYgKCFjYW5jZWwgJiYgIW1vdmVPdXQgJiYgIXJpZ2h0Q2xpY2spe1xuICAgICAgICBvcHRpb25zLm9uVGFwLmNhbGwoZWwsIGUsIHN0YXJ0VGFyZ2V0KTtcbiAgICAgIH1cblxuICAgICAgcHJldlRhcmdldCA9IHN0YXJ0VGFyZ2V0O1xuICAgICAgc3RhcnRUYXJnZXQgPSBudWxsO1xuICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgICBzdGFydFggPSBzdGFydFkgPSBudWxsO1xuICAgICAgfSwgNDAwKTtcbiAgICB9O1xuXG4gICAgdmFyIG9uQ2FuY2VsID0gZnVuY3Rpb24oZSl7XG4gICAgICBpZiAoIXN0YXJ0VGFyZ2V0KSByZXR1cm47XG4gICAgICByZW1vdmVDbGFzcyhzdGFydFRhcmdldCwgYWN0aXZlQ2xhc3MpO1xuICAgICAgc3RhcnRUYXJnZXQgPSBzdGFydFggPSBzdGFydFkgPSBudWxsO1xuICAgICAgb3B0aW9ucy5vbkNhbmNlbC5jYWxsKGVsLCBlKTtcbiAgICB9O1xuXG4gICAgdmFyIG9uQ2xpY2sgPSBmdW5jdGlvbihlKXtcbiAgICAgIHZhciB0YXJnZXQgPSBjbG9zZXN0KGUudGFyZ2V0LCBzZWxlY3Rvcik7XG4gICAgICBpZiAodGFyZ2V0KXtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgfSBlbHNlIGlmIChzdGFydFggJiYgc3RhcnRZICYmIGFicyhlLmNsaWVudFggLSBzdGFydFgpIDwgMjUgJiYgYWJzKGUuY2xpZW50WSAtIHN0YXJ0WSkgPCAyNSl7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgZWwuYWRkRXZlbnRMaXN0ZW5lcihldmVudHMuc3RhcnQsIG9uU3RhcnQsIGZhbHNlKTtcblxuICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnRzLm1vdmUsIG9uTW92ZSwgZmFsc2UpO1xuXG4gICAgZWwuYWRkRXZlbnRMaXN0ZW5lcihldmVudHMuZW5kLCBvbkVuZCwgZmFsc2UpO1xuXG4gICAgZWwuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hjYW5jZWwnLCBvbkNhbmNlbCwgZmFsc2UpO1xuXG4gICAgaWYgKCFvcHRpb25zLmFsbG93Q2xpY2spIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgb25DbGljaywgZmFsc2UpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGVsIDogZWwsXG4gICAgICBkZXN0cm95IDogZnVuY3Rpb24gKCkge1xuICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50cy5zdGFydCwgb25TdGFydCwgZmFsc2UpO1xuICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50cy5tb3ZlLCBvbk1vdmUsIGZhbHNlKTtcbiAgICAgICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudHMuZW5kLCBvbkVuZCwgZmFsc2UpO1xuICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKCd0b3VjaGNhbmNlbCcsIG9uQ2FuY2VsLCBmYWxzZSk7XG4gICAgICAgIGlmICghb3B0aW9ucy5hbGxvd0NsaWNrKSBlbC5yZW1vdmVFdmVudExpc3RlbmVyKCdjbGljaycsIG9uQ2xpY2ssIGZhbHNlKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cbiAgICB9O1xuXG4gIH07XG5cbn0pKTtcbn0pKCkiLCJ2YXIgcm91dGllID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvcm91dGllJyk7XG52YXIgcGxheWVyID0gcmVxdWlyZSgnLi4vcGxheWVyJyk7XG52YXIgdmlldyA9IHJlcXVpcmUoJy4uLy4uL3ZpZXdzL3JlZ2lzdGVyLWFkdmFuY2VkLmhicycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICBcbiAgaWYgKHBsYXllci5nZXQoKS5pZCkge1xuICAgIHJldHVybiByb3V0aWUubmF2aWdhdGUoJy93YWl0Jyk7XG4gIH1cbiAgXG4gICQoJyNwYWdlJykuYXR0cignY2xhc3MnLCAncmVnaXN0ZXInKTtcbiAgJCgnI3BhZ2UnKS5odG1sKHZpZXcoKSk7XG4gIFxuICAkKCdidXR0b24nKS5vbignY2xpY2snLCByZWdpc3Rlcik7XG4gIFxufTtcblxuZnVuY3Rpb24gcmVnaXN0ZXIoZSkge1xuICB2YXIgZGF0YSA9IHtcbiAgICBmaXJzdE5hbWU6ICAgICQoJyNmaXJzdE5hbWUnKS52YWwoKSxcbiAgICBsYXN0TmFtZTogICAgICQoJyNsYXN0TmFtZScpLnZhbCgpLFxuICAgIGNvbXBhbnk6ICAgICAgJCgnI2NvbXBhbnknKS52YWwoKSxcbiAgICBjb3VudHJ5OiAgICAgICQoJyNjb3VudHJ5JykudmFsKCksXG4gICAgcm9sZTogICAgICAgICAkKCcjcm9sZScpLnZhbCgpLFxuICAgIGVtYWlsOiAgICAgICAgJCgnI2VtYWlsJykudmFsKClcbiAgfTtcbiAgY29uc29sZS5sb2coXCJGSUVMRFNcIiwgZGF0YSk7XG4gICQuYWpheCh7XG4gICAgdHlwZTogJ1BPU1QnLFxuICAgIHVybDogJy9wbGF5ZXInLFxuICAgIGRhdGE6IEpTT04uc3RyaW5naWZ5KGRhdGEpLFxuICAgIGRhdGFUeXBlOiAnanNvbicsXG4gICAgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uOyBjaGFyc2V0PXV0Zi04J1xuICB9KS50aGVuKGdvKS5mYWlsKGVycm9yKTtcbiAgXG4gIC8vICQucG9zdCgnL3BsYXllcicsIGRhdGEpLnRoZW4oZ28pLmZhaWwoZXJyb3IpO1xuICByZXR1cm4gZmFsc2Vcbn1cblxuZnVuY3Rpb24gZ28oZGF0YSkge1xuICBwbGF5ZXIuc2V0KHtcbiAgICBpZDogZGF0YS5pZCxcbiAgICBuYW1lOiBkYXRhLm5hbWVcbiAgfSk7XG4gIHJvdXRpZS5uYXZpZ2F0ZSgnL3dhaXQnKTtcbn1cblxuZnVuY3Rpb24gZXJyb3IocmVzKSB7XG4gIGFsZXJ0KCdFcnJvcjogJyArIHJlcyk7XG59XG4iLCJ2YXIgcm91dGllID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvcm91dGllJyk7XG52YXIgcGxheWVyID0gcmVxdWlyZSgnLi4vcGxheWVyJyk7XG52YXIgdmlldyA9IHJlcXVpcmUoJy4uLy4uL3ZpZXdzL2pvaW4uaGJzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gIFxuICBpZiAocGxheWVyLmdldCgpLmlkID09IHVuZGVmaW5lZCkge1xuICAgIHJvdXRpZS5uYXZpZ2F0ZSgnL2Nvbm5lY3QnKTtcbiAgfVxuICBcbiAgJCgnI3BhZ2UnKS5hdHRyKCdjbGFzcycsICdqb2luJyk7XG4gICQoJyNwYWdlJykuaHRtbCh2aWV3KCkpO1xuICAkKCdidXR0b24nKS5vbignY2xpY2snLCBqb2luTG9iYnkpO1xuXG59O1xuXG5mdW5jdGlvbiBqb2luTG9iYnkoZSkge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG4gIHZhciBkYXRhID0geyBwbGF5ZXJJZDogcGxheWVyLmdldCgpLmlkIH07XG4gICQucG9zdCgnL2dhbWUvcGxheWVycycsIGRhdGEpLnRoZW4oam9pbmVkKS5mYWlsKGJhY2tUb1dhaXQpO1xufVxuXG5mdW5jdGlvbiBqb2luZWQoZGF0YSkge1xuICByb3V0aWUubmF2aWdhdGUoJy9sb2JieScpO1xufVxuXG5mdW5jdGlvbiBiYWNrVG9XYWl0KCkge1xuICByb3V0aWUubmF2aWdhdGUoJy93YWl0Jyk7XG59XG4iLCJ2YXIgcm91dGllID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvcm91dGllJyk7XG52YXIgdmlldyA9IHJlcXVpcmUoJy4uLy4uL3ZpZXdzL3RoYW5rcy5oYnMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgXG4gICQoJyNwYWdlJykuYXR0cignY2xhc3MnLCAndGhhbmtzJyk7XG4gICQoJyNwYWdlJykuaHRtbCh2aWV3KCkpO1xuICBcbiAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICByb3V0aWUubmF2aWdhdGUoJy9jb25uZWN0Jyk7XG4gIH0sIDQwMDApO1xuICBcbn07XG4iLCJ2YXIgXyA9IHJlcXVpcmUoJ3VuZGVyc2NvcmUnKTtcbnZhciBwbGF5ZXIgPSBudWxsO1xuXG52YXIgS0VZID0gJ3BsYXllcic7XG5cbmV4cG9ydHMuZ2V0ID0gZnVuY3Rpb24oKSB7XG4gIGlmICghcGxheWVyKSB7XG4gICAgbG9hZCgpO1xuICB9XG4gIHJldHVybiBwbGF5ZXI7XG59O1xuXG5leHBvcnRzLnNldCA9IGZ1bmN0aW9uKGF0dHJzKSB7XG4gIHBsYXllciA9IF8uZXh0ZW5kKHBsYXllciB8fCB7fSwgYXR0cnMpO1xuICBzYXZlKCk7XG59O1xuXG5leHBvcnRzLnJlc2V0ID0gZnVuY3Rpb24oKSB7XG4gIHBsYXllciA9IG51bGw7XG4gIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShLRVkpO1xufTtcblxuZnVuY3Rpb24gbG9hZCgpIHtcbiAgcGxheWVyID0gSlNPTi5wYXJzZSh3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oS0VZKSB8fCAne30nKTtcbn1cblxuZnVuY3Rpb24gc2F2ZSgpIHtcbiAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKEtFWSwgSlNPTi5zdHJpbmdpZnkocGxheWVyKSk7XG59XG4iLCIoZnVuY3Rpb24oKXsvLyAgICAgVW5kZXJzY29yZS5qcyAxLjQuNFxuLy8gICAgIGh0dHA6Ly91bmRlcnNjb3JlanMub3JnXG4vLyAgICAgKGMpIDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgSW5jLlxuLy8gICAgIFVuZGVyc2NvcmUgbWF5IGJlIGZyZWVseSBkaXN0cmlidXRlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXG5cbihmdW5jdGlvbigpIHtcblxuICAvLyBCYXNlbGluZSBzZXR1cFxuICAvLyAtLS0tLS0tLS0tLS0tLVxuXG4gIC8vIEVzdGFibGlzaCB0aGUgcm9vdCBvYmplY3QsIGB3aW5kb3dgIGluIHRoZSBicm93c2VyLCBvciBgZ2xvYmFsYCBvbiB0aGUgc2VydmVyLlxuICB2YXIgcm9vdCA9IHRoaXM7XG5cbiAgLy8gU2F2ZSB0aGUgcHJldmlvdXMgdmFsdWUgb2YgdGhlIGBfYCB2YXJpYWJsZS5cbiAgdmFyIHByZXZpb3VzVW5kZXJzY29yZSA9IHJvb3QuXztcblxuICAvLyBFc3RhYmxpc2ggdGhlIG9iamVjdCB0aGF0IGdldHMgcmV0dXJuZWQgdG8gYnJlYWsgb3V0IG9mIGEgbG9vcCBpdGVyYXRpb24uXG4gIHZhciBicmVha2VyID0ge307XG5cbiAgLy8gU2F2ZSBieXRlcyBpbiB0aGUgbWluaWZpZWQgKGJ1dCBub3QgZ3ppcHBlZCkgdmVyc2lvbjpcbiAgdmFyIEFycmF5UHJvdG8gPSBBcnJheS5wcm90b3R5cGUsIE9ialByb3RvID0gT2JqZWN0LnByb3RvdHlwZSwgRnVuY1Byb3RvID0gRnVuY3Rpb24ucHJvdG90eXBlO1xuXG4gIC8vIENyZWF0ZSBxdWljayByZWZlcmVuY2UgdmFyaWFibGVzIGZvciBzcGVlZCBhY2Nlc3MgdG8gY29yZSBwcm90b3R5cGVzLlxuICB2YXIgcHVzaCAgICAgICAgICAgICA9IEFycmF5UHJvdG8ucHVzaCxcbiAgICAgIHNsaWNlICAgICAgICAgICAgPSBBcnJheVByb3RvLnNsaWNlLFxuICAgICAgY29uY2F0ICAgICAgICAgICA9IEFycmF5UHJvdG8uY29uY2F0LFxuICAgICAgdG9TdHJpbmcgICAgICAgICA9IE9ialByb3RvLnRvU3RyaW5nLFxuICAgICAgaGFzT3duUHJvcGVydHkgICA9IE9ialByb3RvLmhhc093blByb3BlcnR5O1xuXG4gIC8vIEFsbCAqKkVDTUFTY3JpcHQgNSoqIG5hdGl2ZSBmdW5jdGlvbiBpbXBsZW1lbnRhdGlvbnMgdGhhdCB3ZSBob3BlIHRvIHVzZVxuICAvLyBhcmUgZGVjbGFyZWQgaGVyZS5cbiAgdmFyXG4gICAgbmF0aXZlRm9yRWFjaCAgICAgID0gQXJyYXlQcm90by5mb3JFYWNoLFxuICAgIG5hdGl2ZU1hcCAgICAgICAgICA9IEFycmF5UHJvdG8ubWFwLFxuICAgIG5hdGl2ZVJlZHVjZSAgICAgICA9IEFycmF5UHJvdG8ucmVkdWNlLFxuICAgIG5hdGl2ZVJlZHVjZVJpZ2h0ICA9IEFycmF5UHJvdG8ucmVkdWNlUmlnaHQsXG4gICAgbmF0aXZlRmlsdGVyICAgICAgID0gQXJyYXlQcm90by5maWx0ZXIsXG4gICAgbmF0aXZlRXZlcnkgICAgICAgID0gQXJyYXlQcm90by5ldmVyeSxcbiAgICBuYXRpdmVTb21lICAgICAgICAgPSBBcnJheVByb3RvLnNvbWUsXG4gICAgbmF0aXZlSW5kZXhPZiAgICAgID0gQXJyYXlQcm90by5pbmRleE9mLFxuICAgIG5hdGl2ZUxhc3RJbmRleE9mICA9IEFycmF5UHJvdG8ubGFzdEluZGV4T2YsXG4gICAgbmF0aXZlSXNBcnJheSAgICAgID0gQXJyYXkuaXNBcnJheSxcbiAgICBuYXRpdmVLZXlzICAgICAgICAgPSBPYmplY3Qua2V5cyxcbiAgICBuYXRpdmVCaW5kICAgICAgICAgPSBGdW5jUHJvdG8uYmluZDtcblxuICAvLyBDcmVhdGUgYSBzYWZlIHJlZmVyZW5jZSB0byB0aGUgVW5kZXJzY29yZSBvYmplY3QgZm9yIHVzZSBiZWxvdy5cbiAgdmFyIF8gPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqIGluc3RhbmNlb2YgXykgcmV0dXJuIG9iajtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgXykpIHJldHVybiBuZXcgXyhvYmopO1xuICAgIHRoaXMuX3dyYXBwZWQgPSBvYmo7XG4gIH07XG5cbiAgLy8gRXhwb3J0IHRoZSBVbmRlcnNjb3JlIG9iamVjdCBmb3IgKipOb2RlLmpzKiosIHdpdGhcbiAgLy8gYmFja3dhcmRzLWNvbXBhdGliaWxpdHkgZm9yIHRoZSBvbGQgYHJlcXVpcmUoKWAgQVBJLiBJZiB3ZSdyZSBpblxuICAvLyB0aGUgYnJvd3NlciwgYWRkIGBfYCBhcyBhIGdsb2JhbCBvYmplY3QgdmlhIGEgc3RyaW5nIGlkZW50aWZpZXIsXG4gIC8vIGZvciBDbG9zdXJlIENvbXBpbGVyIFwiYWR2YW5jZWRcIiBtb2RlLlxuICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgICBleHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBfO1xuICAgIH1cbiAgICBleHBvcnRzLl8gPSBfO1xuICB9IGVsc2Uge1xuICAgIHJvb3QuXyA9IF87XG4gIH1cblxuICAvLyBDdXJyZW50IHZlcnNpb24uXG4gIF8uVkVSU0lPTiA9ICcxLjQuNCc7XG5cbiAgLy8gQ29sbGVjdGlvbiBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBUaGUgY29ybmVyc3RvbmUsIGFuIGBlYWNoYCBpbXBsZW1lbnRhdGlvbiwgYWthIGBmb3JFYWNoYC5cbiAgLy8gSGFuZGxlcyBvYmplY3RzIHdpdGggdGhlIGJ1aWx0LWluIGBmb3JFYWNoYCwgYXJyYXlzLCBhbmQgcmF3IG9iamVjdHMuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBmb3JFYWNoYCBpZiBhdmFpbGFibGUuXG4gIHZhciBlYWNoID0gXy5lYWNoID0gXy5mb3JFYWNoID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuO1xuICAgIGlmIChuYXRpdmVGb3JFYWNoICYmIG9iai5mb3JFYWNoID09PSBuYXRpdmVGb3JFYWNoKSB7XG4gICAgICBvYmouZm9yRWFjaChpdGVyYXRvciwgY29udGV4dCk7XG4gICAgfSBlbHNlIGlmIChvYmoubGVuZ3RoID09PSArb2JqLmxlbmd0aCkge1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSBvYmoubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIGlmIChpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtpXSwgaSwgb2JqKSA9PT0gYnJlYWtlcikgcmV0dXJuO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICAgIGlmIChfLmhhcyhvYmosIGtleSkpIHtcbiAgICAgICAgICBpZiAoaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpba2V5XSwga2V5LCBvYmopID09PSBicmVha2VyKSByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSByZXN1bHRzIG9mIGFwcGx5aW5nIHRoZSBpdGVyYXRvciB0byBlYWNoIGVsZW1lbnQuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBtYXBgIGlmIGF2YWlsYWJsZS5cbiAgXy5tYXAgPSBfLmNvbGxlY3QgPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiByZXN1bHRzO1xuICAgIGlmIChuYXRpdmVNYXAgJiYgb2JqLm1hcCA9PT0gbmF0aXZlTWFwKSByZXR1cm4gb2JqLm1hcChpdGVyYXRvciwgY29udGV4dCk7XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgcmVzdWx0c1tyZXN1bHRzLmxlbmd0aF0gPSBpdGVyYXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgbGlzdCk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH07XG5cbiAgdmFyIHJlZHVjZUVycm9yID0gJ1JlZHVjZSBvZiBlbXB0eSBhcnJheSB3aXRoIG5vIGluaXRpYWwgdmFsdWUnO1xuXG4gIC8vICoqUmVkdWNlKiogYnVpbGRzIHVwIGEgc2luZ2xlIHJlc3VsdCBmcm9tIGEgbGlzdCBvZiB2YWx1ZXMsIGFrYSBgaW5qZWN0YCxcbiAgLy8gb3IgYGZvbGRsYC4gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYHJlZHVjZWAgaWYgYXZhaWxhYmxlLlxuICBfLnJlZHVjZSA9IF8uZm9sZGwgPSBfLmluamVjdCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIG1lbW8sIGNvbnRleHQpIHtcbiAgICB2YXIgaW5pdGlhbCA9IGFyZ3VtZW50cy5sZW5ndGggPiAyO1xuICAgIGlmIChvYmogPT0gbnVsbCkgb2JqID0gW107XG4gICAgaWYgKG5hdGl2ZVJlZHVjZSAmJiBvYmoucmVkdWNlID09PSBuYXRpdmVSZWR1Y2UpIHtcbiAgICAgIGlmIChjb250ZXh0KSBpdGVyYXRvciA9IF8uYmluZChpdGVyYXRvciwgY29udGV4dCk7XG4gICAgICByZXR1cm4gaW5pdGlhbCA/IG9iai5yZWR1Y2UoaXRlcmF0b3IsIG1lbW8pIDogb2JqLnJlZHVjZShpdGVyYXRvcik7XG4gICAgfVxuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIGlmICghaW5pdGlhbCkge1xuICAgICAgICBtZW1vID0gdmFsdWU7XG4gICAgICAgIGluaXRpYWwgPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWVtbyA9IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgbWVtbywgdmFsdWUsIGluZGV4LCBsaXN0KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBpZiAoIWluaXRpYWwpIHRocm93IG5ldyBUeXBlRXJyb3IocmVkdWNlRXJyb3IpO1xuICAgIHJldHVybiBtZW1vO1xuICB9O1xuXG4gIC8vIFRoZSByaWdodC1hc3NvY2lhdGl2ZSB2ZXJzaW9uIG9mIHJlZHVjZSwgYWxzbyBrbm93biBhcyBgZm9sZHJgLlxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgcmVkdWNlUmlnaHRgIGlmIGF2YWlsYWJsZS5cbiAgXy5yZWR1Y2VSaWdodCA9IF8uZm9sZHIgPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBtZW1vLCBjb250ZXh0KSB7XG4gICAgdmFyIGluaXRpYWwgPSBhcmd1bWVudHMubGVuZ3RoID4gMjtcbiAgICBpZiAob2JqID09IG51bGwpIG9iaiA9IFtdO1xuICAgIGlmIChuYXRpdmVSZWR1Y2VSaWdodCAmJiBvYmoucmVkdWNlUmlnaHQgPT09IG5hdGl2ZVJlZHVjZVJpZ2h0KSB7XG4gICAgICBpZiAoY29udGV4dCkgaXRlcmF0b3IgPSBfLmJpbmQoaXRlcmF0b3IsIGNvbnRleHQpO1xuICAgICAgcmV0dXJuIGluaXRpYWwgPyBvYmoucmVkdWNlUmlnaHQoaXRlcmF0b3IsIG1lbW8pIDogb2JqLnJlZHVjZVJpZ2h0KGl0ZXJhdG9yKTtcbiAgICB9XG4gICAgdmFyIGxlbmd0aCA9IG9iai5sZW5ndGg7XG4gICAgaWYgKGxlbmd0aCAhPT0gK2xlbmd0aCkge1xuICAgICAgdmFyIGtleXMgPSBfLmtleXMob2JqKTtcbiAgICAgIGxlbmd0aCA9IGtleXMubGVuZ3RoO1xuICAgIH1cbiAgICBlYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICBpbmRleCA9IGtleXMgPyBrZXlzWy0tbGVuZ3RoXSA6IC0tbGVuZ3RoO1xuICAgICAgaWYgKCFpbml0aWFsKSB7XG4gICAgICAgIG1lbW8gPSBvYmpbaW5kZXhdO1xuICAgICAgICBpbml0aWFsID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1lbW8gPSBpdGVyYXRvci5jYWxsKGNvbnRleHQsIG1lbW8sIG9ialtpbmRleF0sIGluZGV4LCBsaXN0KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBpZiAoIWluaXRpYWwpIHRocm93IG5ldyBUeXBlRXJyb3IocmVkdWNlRXJyb3IpO1xuICAgIHJldHVybiBtZW1vO1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgZmlyc3QgdmFsdWUgd2hpY2ggcGFzc2VzIGEgdHJ1dGggdGVzdC4gQWxpYXNlZCBhcyBgZGV0ZWN0YC5cbiAgXy5maW5kID0gXy5kZXRlY3QgPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdDtcbiAgICBhbnkob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIGlmIChpdGVyYXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgbGlzdCkpIHtcbiAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGFsbCB0aGUgZWxlbWVudHMgdGhhdCBwYXNzIGEgdHJ1dGggdGVzdC5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYGZpbHRlcmAgaWYgYXZhaWxhYmxlLlxuICAvLyBBbGlhc2VkIGFzIGBzZWxlY3RgLlxuICBfLmZpbHRlciA9IF8uc2VsZWN0ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIHZhciByZXN1bHRzID0gW107XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gcmVzdWx0cztcbiAgICBpZiAobmF0aXZlRmlsdGVyICYmIG9iai5maWx0ZXIgPT09IG5hdGl2ZUZpbHRlcikgcmV0dXJuIG9iai5maWx0ZXIoaXRlcmF0b3IsIGNvbnRleHQpO1xuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIGlmIChpdGVyYXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgbGlzdCkpIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGhdID0gdmFsdWU7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGFsbCB0aGUgZWxlbWVudHMgZm9yIHdoaWNoIGEgdHJ1dGggdGVzdCBmYWlscy5cbiAgXy5yZWplY3QgPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuIF8uZmlsdGVyKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICByZXR1cm4gIWl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KTtcbiAgICB9LCBjb250ZXh0KTtcbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgd2hldGhlciBhbGwgb2YgdGhlIGVsZW1lbnRzIG1hdGNoIGEgdHJ1dGggdGVzdC5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYGV2ZXJ5YCBpZiBhdmFpbGFibGUuXG4gIC8vIEFsaWFzZWQgYXMgYGFsbGAuXG4gIF8uZXZlcnkgPSBfLmFsbCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBpdGVyYXRvciB8fCAoaXRlcmF0b3IgPSBfLmlkZW50aXR5KTtcbiAgICB2YXIgcmVzdWx0ID0gdHJ1ZTtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKG5hdGl2ZUV2ZXJ5ICYmIG9iai5ldmVyeSA9PT0gbmF0aXZlRXZlcnkpIHJldHVybiBvYmouZXZlcnkoaXRlcmF0b3IsIGNvbnRleHQpO1xuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIGlmICghKHJlc3VsdCA9IHJlc3VsdCAmJiBpdGVyYXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgbGlzdCkpKSByZXR1cm4gYnJlYWtlcjtcbiAgICB9KTtcbiAgICByZXR1cm4gISFyZXN1bHQ7XG4gIH07XG5cbiAgLy8gRGV0ZXJtaW5lIGlmIGF0IGxlYXN0IG9uZSBlbGVtZW50IGluIHRoZSBvYmplY3QgbWF0Y2hlcyBhIHRydXRoIHRlc3QuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBzb21lYCBpZiBhdmFpbGFibGUuXG4gIC8vIEFsaWFzZWQgYXMgYGFueWAuXG4gIHZhciBhbnkgPSBfLnNvbWUgPSBfLmFueSA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBpdGVyYXRvciB8fCAoaXRlcmF0b3IgPSBfLmlkZW50aXR5KTtcbiAgICB2YXIgcmVzdWx0ID0gZmFsc2U7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChuYXRpdmVTb21lICYmIG9iai5zb21lID09PSBuYXRpdmVTb21lKSByZXR1cm4gb2JqLnNvbWUoaXRlcmF0b3IsIGNvbnRleHQpO1xuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIGlmIChyZXN1bHQgfHwgKHJlc3VsdCA9IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KSkpIHJldHVybiBicmVha2VyO1xuICAgIH0pO1xuICAgIHJldHVybiAhIXJlc3VsdDtcbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgaWYgdGhlIGFycmF5IG9yIG9iamVjdCBjb250YWlucyBhIGdpdmVuIHZhbHVlICh1c2luZyBgPT09YCkuXG4gIC8vIEFsaWFzZWQgYXMgYGluY2x1ZGVgLlxuICBfLmNvbnRhaW5zID0gXy5pbmNsdWRlID0gZnVuY3Rpb24ob2JqLCB0YXJnZXQpIHtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiBmYWxzZTtcbiAgICBpZiAobmF0aXZlSW5kZXhPZiAmJiBvYmouaW5kZXhPZiA9PT0gbmF0aXZlSW5kZXhPZikgcmV0dXJuIG9iai5pbmRleE9mKHRhcmdldCkgIT0gLTE7XG4gICAgcmV0dXJuIGFueShvYmosIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICByZXR1cm4gdmFsdWUgPT09IHRhcmdldDtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBJbnZva2UgYSBtZXRob2QgKHdpdGggYXJndW1lbnRzKSBvbiBldmVyeSBpdGVtIGluIGEgY29sbGVjdGlvbi5cbiAgXy5pbnZva2UgPSBmdW5jdGlvbihvYmosIG1ldGhvZCkge1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgIHZhciBpc0Z1bmMgPSBfLmlzRnVuY3Rpb24obWV0aG9kKTtcbiAgICByZXR1cm4gXy5tYXAob2JqLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgcmV0dXJuIChpc0Z1bmMgPyBtZXRob2QgOiB2YWx1ZVttZXRob2RdKS5hcHBseSh2YWx1ZSwgYXJncyk7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gQ29udmVuaWVuY2UgdmVyc2lvbiBvZiBhIGNvbW1vbiB1c2UgY2FzZSBvZiBgbWFwYDogZmV0Y2hpbmcgYSBwcm9wZXJ0eS5cbiAgXy5wbHVjayA9IGZ1bmN0aW9uKG9iaiwga2V5KSB7XG4gICAgcmV0dXJuIF8ubWFwKG9iaiwgZnVuY3Rpb24odmFsdWUpeyByZXR1cm4gdmFsdWVba2V5XTsgfSk7XG4gIH07XG5cbiAgLy8gQ29udmVuaWVuY2UgdmVyc2lvbiBvZiBhIGNvbW1vbiB1c2UgY2FzZSBvZiBgZmlsdGVyYDogc2VsZWN0aW5nIG9ubHkgb2JqZWN0c1xuICAvLyBjb250YWluaW5nIHNwZWNpZmljIGBrZXk6dmFsdWVgIHBhaXJzLlxuICBfLndoZXJlID0gZnVuY3Rpb24ob2JqLCBhdHRycywgZmlyc3QpIHtcbiAgICBpZiAoXy5pc0VtcHR5KGF0dHJzKSkgcmV0dXJuIGZpcnN0ID8gbnVsbCA6IFtdO1xuICAgIHJldHVybiBfW2ZpcnN0ID8gJ2ZpbmQnIDogJ2ZpbHRlciddKG9iaiwgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIGZvciAodmFyIGtleSBpbiBhdHRycykge1xuICAgICAgICBpZiAoYXR0cnNba2V5XSAhPT0gdmFsdWVba2V5XSkgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gQ29udmVuaWVuY2UgdmVyc2lvbiBvZiBhIGNvbW1vbiB1c2UgY2FzZSBvZiBgZmluZGA6IGdldHRpbmcgdGhlIGZpcnN0IG9iamVjdFxuICAvLyBjb250YWluaW5nIHNwZWNpZmljIGBrZXk6dmFsdWVgIHBhaXJzLlxuICBfLmZpbmRXaGVyZSA9IGZ1bmN0aW9uKG9iaiwgYXR0cnMpIHtcbiAgICByZXR1cm4gXy53aGVyZShvYmosIGF0dHJzLCB0cnVlKTtcbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIG1heGltdW0gZWxlbWVudCBvciAoZWxlbWVudC1iYXNlZCBjb21wdXRhdGlvbikuXG4gIC8vIENhbid0IG9wdGltaXplIGFycmF5cyBvZiBpbnRlZ2VycyBsb25nZXIgdGhhbiA2NSw1MzUgZWxlbWVudHMuXG4gIC8vIFNlZTogaHR0cHM6Ly9idWdzLndlYmtpdC5vcmcvc2hvd19idWcuY2dpP2lkPTgwNzk3XG4gIF8ubWF4ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGlmICghaXRlcmF0b3IgJiYgXy5pc0FycmF5KG9iaikgJiYgb2JqWzBdID09PSArb2JqWzBdICYmIG9iai5sZW5ndGggPCA2NTUzNSkge1xuICAgICAgcmV0dXJuIE1hdGgubWF4LmFwcGx5KE1hdGgsIG9iaik7XG4gICAgfVxuICAgIGlmICghaXRlcmF0b3IgJiYgXy5pc0VtcHR5KG9iaikpIHJldHVybiAtSW5maW5pdHk7XG4gICAgdmFyIHJlc3VsdCA9IHtjb21wdXRlZCA6IC1JbmZpbml0eSwgdmFsdWU6IC1JbmZpbml0eX07XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgdmFyIGNvbXB1dGVkID0gaXRlcmF0b3IgPyBpdGVyYXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgbGlzdCkgOiB2YWx1ZTtcbiAgICAgIGNvbXB1dGVkID49IHJlc3VsdC5jb21wdXRlZCAmJiAocmVzdWx0ID0ge3ZhbHVlIDogdmFsdWUsIGNvbXB1dGVkIDogY29tcHV0ZWR9KTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0LnZhbHVlO1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgbWluaW11bSBlbGVtZW50IChvciBlbGVtZW50LWJhc2VkIGNvbXB1dGF0aW9uKS5cbiAgXy5taW4gPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaWYgKCFpdGVyYXRvciAmJiBfLmlzQXJyYXkob2JqKSAmJiBvYmpbMF0gPT09ICtvYmpbMF0gJiYgb2JqLmxlbmd0aCA8IDY1NTM1KSB7XG4gICAgICByZXR1cm4gTWF0aC5taW4uYXBwbHkoTWF0aCwgb2JqKTtcbiAgICB9XG4gICAgaWYgKCFpdGVyYXRvciAmJiBfLmlzRW1wdHkob2JqKSkgcmV0dXJuIEluZmluaXR5O1xuICAgIHZhciByZXN1bHQgPSB7Y29tcHV0ZWQgOiBJbmZpbml0eSwgdmFsdWU6IEluZmluaXR5fTtcbiAgICBlYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICB2YXIgY29tcHV0ZWQgPSBpdGVyYXRvciA/IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KSA6IHZhbHVlO1xuICAgICAgY29tcHV0ZWQgPCByZXN1bHQuY29tcHV0ZWQgJiYgKHJlc3VsdCA9IHt2YWx1ZSA6IHZhbHVlLCBjb21wdXRlZCA6IGNvbXB1dGVkfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdC52YWx1ZTtcbiAgfTtcblxuICAvLyBTaHVmZmxlIGFuIGFycmF5LlxuICBfLnNodWZmbGUgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgcmFuZDtcbiAgICB2YXIgaW5kZXggPSAwO1xuICAgIHZhciBzaHVmZmxlZCA9IFtdO1xuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgcmFuZCA9IF8ucmFuZG9tKGluZGV4KyspO1xuICAgICAgc2h1ZmZsZWRbaW5kZXggLSAxXSA9IHNodWZmbGVkW3JhbmRdO1xuICAgICAgc2h1ZmZsZWRbcmFuZF0gPSB2YWx1ZTtcbiAgICB9KTtcbiAgICByZXR1cm4gc2h1ZmZsZWQ7XG4gIH07XG5cbiAgLy8gQW4gaW50ZXJuYWwgZnVuY3Rpb24gdG8gZ2VuZXJhdGUgbG9va3VwIGl0ZXJhdG9ycy5cbiAgdmFyIGxvb2t1cEl0ZXJhdG9yID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gXy5pc0Z1bmN0aW9uKHZhbHVlKSA/IHZhbHVlIDogZnVuY3Rpb24ob2JqKXsgcmV0dXJuIG9ialt2YWx1ZV07IH07XG4gIH07XG5cbiAgLy8gU29ydCB0aGUgb2JqZWN0J3MgdmFsdWVzIGJ5IGEgY3JpdGVyaW9uIHByb2R1Y2VkIGJ5IGFuIGl0ZXJhdG9yLlxuICBfLnNvcnRCeSA9IGZ1bmN0aW9uKG9iaiwgdmFsdWUsIGNvbnRleHQpIHtcbiAgICB2YXIgaXRlcmF0b3IgPSBsb29rdXBJdGVyYXRvcih2YWx1ZSk7XG4gICAgcmV0dXJuIF8ucGx1Y2soXy5tYXAob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHZhbHVlIDogdmFsdWUsXG4gICAgICAgIGluZGV4IDogaW5kZXgsXG4gICAgICAgIGNyaXRlcmlhIDogaXRlcmF0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpXG4gICAgICB9O1xuICAgIH0pLnNvcnQoZnVuY3Rpb24obGVmdCwgcmlnaHQpIHtcbiAgICAgIHZhciBhID0gbGVmdC5jcml0ZXJpYTtcbiAgICAgIHZhciBiID0gcmlnaHQuY3JpdGVyaWE7XG4gICAgICBpZiAoYSAhPT0gYikge1xuICAgICAgICBpZiAoYSA+IGIgfHwgYSA9PT0gdm9pZCAwKSByZXR1cm4gMTtcbiAgICAgICAgaWYgKGEgPCBiIHx8IGIgPT09IHZvaWQgMCkgcmV0dXJuIC0xO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGxlZnQuaW5kZXggPCByaWdodC5pbmRleCA/IC0xIDogMTtcbiAgICB9KSwgJ3ZhbHVlJyk7XG4gIH07XG5cbiAgLy8gQW4gaW50ZXJuYWwgZnVuY3Rpb24gdXNlZCBmb3IgYWdncmVnYXRlIFwiZ3JvdXAgYnlcIiBvcGVyYXRpb25zLlxuICB2YXIgZ3JvdXAgPSBmdW5jdGlvbihvYmosIHZhbHVlLCBjb250ZXh0LCBiZWhhdmlvcikge1xuICAgIHZhciByZXN1bHQgPSB7fTtcbiAgICB2YXIgaXRlcmF0b3IgPSBsb29rdXBJdGVyYXRvcih2YWx1ZSB8fCBfLmlkZW50aXR5KTtcbiAgICBlYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4KSB7XG4gICAgICB2YXIga2V5ID0gaXRlcmF0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIG9iaik7XG4gICAgICBiZWhhdmlvcihyZXN1bHQsIGtleSwgdmFsdWUpO1xuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gR3JvdXBzIHRoZSBvYmplY3QncyB2YWx1ZXMgYnkgYSBjcml0ZXJpb24uIFBhc3MgZWl0aGVyIGEgc3RyaW5nIGF0dHJpYnV0ZVxuICAvLyB0byBncm91cCBieSwgb3IgYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlIGNyaXRlcmlvbi5cbiAgXy5ncm91cEJ5ID0gZnVuY3Rpb24ob2JqLCB2YWx1ZSwgY29udGV4dCkge1xuICAgIHJldHVybiBncm91cChvYmosIHZhbHVlLCBjb250ZXh0LCBmdW5jdGlvbihyZXN1bHQsIGtleSwgdmFsdWUpIHtcbiAgICAgIChfLmhhcyhyZXN1bHQsIGtleSkgPyByZXN1bHRba2V5XSA6IChyZXN1bHRba2V5XSA9IFtdKSkucHVzaCh2YWx1ZSk7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gQ291bnRzIGluc3RhbmNlcyBvZiBhbiBvYmplY3QgdGhhdCBncm91cCBieSBhIGNlcnRhaW4gY3JpdGVyaW9uLiBQYXNzXG4gIC8vIGVpdGhlciBhIHN0cmluZyBhdHRyaWJ1dGUgdG8gY291bnQgYnksIG9yIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZVxuICAvLyBjcml0ZXJpb24uXG4gIF8uY291bnRCeSA9IGZ1bmN0aW9uKG9iaiwgdmFsdWUsIGNvbnRleHQpIHtcbiAgICByZXR1cm4gZ3JvdXAob2JqLCB2YWx1ZSwgY29udGV4dCwgZnVuY3Rpb24ocmVzdWx0LCBrZXkpIHtcbiAgICAgIGlmICghXy5oYXMocmVzdWx0LCBrZXkpKSByZXN1bHRba2V5XSA9IDA7XG4gICAgICByZXN1bHRba2V5XSsrO1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIFVzZSBhIGNvbXBhcmF0b3IgZnVuY3Rpb24gdG8gZmlndXJlIG91dCB0aGUgc21hbGxlc3QgaW5kZXggYXQgd2hpY2hcbiAgLy8gYW4gb2JqZWN0IHNob3VsZCBiZSBpbnNlcnRlZCBzbyBhcyB0byBtYWludGFpbiBvcmRlci4gVXNlcyBiaW5hcnkgc2VhcmNoLlxuICBfLnNvcnRlZEluZGV4ID0gZnVuY3Rpb24oYXJyYXksIG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBpdGVyYXRvciA9IGl0ZXJhdG9yID09IG51bGwgPyBfLmlkZW50aXR5IDogbG9va3VwSXRlcmF0b3IoaXRlcmF0b3IpO1xuICAgIHZhciB2YWx1ZSA9IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgb2JqKTtcbiAgICB2YXIgbG93ID0gMCwgaGlnaCA9IGFycmF5Lmxlbmd0aDtcbiAgICB3aGlsZSAobG93IDwgaGlnaCkge1xuICAgICAgdmFyIG1pZCA9IChsb3cgKyBoaWdoKSA+Pj4gMTtcbiAgICAgIGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgYXJyYXlbbWlkXSkgPCB2YWx1ZSA/IGxvdyA9IG1pZCArIDEgOiBoaWdoID0gbWlkO1xuICAgIH1cbiAgICByZXR1cm4gbG93O1xuICB9O1xuXG4gIC8vIFNhZmVseSBjb252ZXJ0IGFueXRoaW5nIGl0ZXJhYmxlIGludG8gYSByZWFsLCBsaXZlIGFycmF5LlxuICBfLnRvQXJyYXkgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAoIW9iaikgcmV0dXJuIFtdO1xuICAgIGlmIChfLmlzQXJyYXkob2JqKSkgcmV0dXJuIHNsaWNlLmNhbGwob2JqKTtcbiAgICBpZiAob2JqLmxlbmd0aCA9PT0gK29iai5sZW5ndGgpIHJldHVybiBfLm1hcChvYmosIF8uaWRlbnRpdHkpO1xuICAgIHJldHVybiBfLnZhbHVlcyhvYmopO1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgbnVtYmVyIG9mIGVsZW1lbnRzIGluIGFuIG9iamVjdC5cbiAgXy5zaXplID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gMDtcbiAgICByZXR1cm4gKG9iai5sZW5ndGggPT09ICtvYmoubGVuZ3RoKSA/IG9iai5sZW5ndGggOiBfLmtleXMob2JqKS5sZW5ndGg7XG4gIH07XG5cbiAgLy8gQXJyYXkgRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIEdldCB0aGUgZmlyc3QgZWxlbWVudCBvZiBhbiBhcnJheS4gUGFzc2luZyAqKm4qKiB3aWxsIHJldHVybiB0aGUgZmlyc3QgTlxuICAvLyB2YWx1ZXMgaW4gdGhlIGFycmF5LiBBbGlhc2VkIGFzIGBoZWFkYCBhbmQgYHRha2VgLiBUaGUgKipndWFyZCoqIGNoZWNrXG4gIC8vIGFsbG93cyBpdCB0byB3b3JrIHdpdGggYF8ubWFwYC5cbiAgXy5maXJzdCA9IF8uaGVhZCA9IF8udGFrZSA9IGZ1bmN0aW9uKGFycmF5LCBuLCBndWFyZCkge1xuICAgIGlmIChhcnJheSA9PSBudWxsKSByZXR1cm4gdm9pZCAwO1xuICAgIHJldHVybiAobiAhPSBudWxsKSAmJiAhZ3VhcmQgPyBzbGljZS5jYWxsKGFycmF5LCAwLCBuKSA6IGFycmF5WzBdO1xuICB9O1xuXG4gIC8vIFJldHVybnMgZXZlcnl0aGluZyBidXQgdGhlIGxhc3QgZW50cnkgb2YgdGhlIGFycmF5LiBFc3BlY2lhbGx5IHVzZWZ1bCBvblxuICAvLyB0aGUgYXJndW1lbnRzIG9iamVjdC4gUGFzc2luZyAqKm4qKiB3aWxsIHJldHVybiBhbGwgdGhlIHZhbHVlcyBpblxuICAvLyB0aGUgYXJyYXksIGV4Y2x1ZGluZyB0aGUgbGFzdCBOLiBUaGUgKipndWFyZCoqIGNoZWNrIGFsbG93cyBpdCB0byB3b3JrIHdpdGhcbiAgLy8gYF8ubWFwYC5cbiAgXy5pbml0aWFsID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgcmV0dXJuIHNsaWNlLmNhbGwoYXJyYXksIDAsIGFycmF5Lmxlbmd0aCAtICgobiA9PSBudWxsKSB8fCBndWFyZCA/IDEgOiBuKSk7XG4gIH07XG5cbiAgLy8gR2V0IHRoZSBsYXN0IGVsZW1lbnQgb2YgYW4gYXJyYXkuIFBhc3NpbmcgKipuKiogd2lsbCByZXR1cm4gdGhlIGxhc3QgTlxuICAvLyB2YWx1ZXMgaW4gdGhlIGFycmF5LiBUaGUgKipndWFyZCoqIGNoZWNrIGFsbG93cyBpdCB0byB3b3JrIHdpdGggYF8ubWFwYC5cbiAgXy5sYXN0ID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgaWYgKGFycmF5ID09IG51bGwpIHJldHVybiB2b2lkIDA7XG4gICAgaWYgKChuICE9IG51bGwpICYmICFndWFyZCkge1xuICAgICAgcmV0dXJuIHNsaWNlLmNhbGwoYXJyYXksIE1hdGgubWF4KGFycmF5Lmxlbmd0aCAtIG4sIDApKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGFycmF5W2FycmF5Lmxlbmd0aCAtIDFdO1xuICAgIH1cbiAgfTtcblxuICAvLyBSZXR1cm5zIGV2ZXJ5dGhpbmcgYnV0IHRoZSBmaXJzdCBlbnRyeSBvZiB0aGUgYXJyYXkuIEFsaWFzZWQgYXMgYHRhaWxgIGFuZCBgZHJvcGAuXG4gIC8vIEVzcGVjaWFsbHkgdXNlZnVsIG9uIHRoZSBhcmd1bWVudHMgb2JqZWN0LiBQYXNzaW5nIGFuICoqbioqIHdpbGwgcmV0dXJuXG4gIC8vIHRoZSByZXN0IE4gdmFsdWVzIGluIHRoZSBhcnJheS4gVGhlICoqZ3VhcmQqKlxuICAvLyBjaGVjayBhbGxvd3MgaXQgdG8gd29yayB3aXRoIGBfLm1hcGAuXG4gIF8ucmVzdCA9IF8udGFpbCA9IF8uZHJvcCA9IGZ1bmN0aW9uKGFycmF5LCBuLCBndWFyZCkge1xuICAgIHJldHVybiBzbGljZS5jYWxsKGFycmF5LCAobiA9PSBudWxsKSB8fCBndWFyZCA/IDEgOiBuKTtcbiAgfTtcblxuICAvLyBUcmltIG91dCBhbGwgZmFsc3kgdmFsdWVzIGZyb20gYW4gYXJyYXkuXG4gIF8uY29tcGFjdCA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgcmV0dXJuIF8uZmlsdGVyKGFycmF5LCBfLmlkZW50aXR5KTtcbiAgfTtcblxuICAvLyBJbnRlcm5hbCBpbXBsZW1lbnRhdGlvbiBvZiBhIHJlY3Vyc2l2ZSBgZmxhdHRlbmAgZnVuY3Rpb24uXG4gIHZhciBmbGF0dGVuID0gZnVuY3Rpb24oaW5wdXQsIHNoYWxsb3csIG91dHB1dCkge1xuICAgIGVhY2goaW5wdXQsIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICBpZiAoXy5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICBzaGFsbG93ID8gcHVzaC5hcHBseShvdXRwdXQsIHZhbHVlKSA6IGZsYXR0ZW4odmFsdWUsIHNoYWxsb3csIG91dHB1dCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvdXRwdXQucHVzaCh2YWx1ZSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIG91dHB1dDtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSBjb21wbGV0ZWx5IGZsYXR0ZW5lZCB2ZXJzaW9uIG9mIGFuIGFycmF5LlxuICBfLmZsYXR0ZW4gPSBmdW5jdGlvbihhcnJheSwgc2hhbGxvdykge1xuICAgIHJldHVybiBmbGF0dGVuKGFycmF5LCBzaGFsbG93LCBbXSk7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgdmVyc2lvbiBvZiB0aGUgYXJyYXkgdGhhdCBkb2VzIG5vdCBjb250YWluIHRoZSBzcGVjaWZpZWQgdmFsdWUocykuXG4gIF8ud2l0aG91dCA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgcmV0dXJuIF8uZGlmZmVyZW5jZShhcnJheSwgc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcbiAgfTtcblxuICAvLyBQcm9kdWNlIGEgZHVwbGljYXRlLWZyZWUgdmVyc2lvbiBvZiB0aGUgYXJyYXkuIElmIHRoZSBhcnJheSBoYXMgYWxyZWFkeVxuICAvLyBiZWVuIHNvcnRlZCwgeW91IGhhdmUgdGhlIG9wdGlvbiBvZiB1c2luZyBhIGZhc3RlciBhbGdvcml0aG0uXG4gIC8vIEFsaWFzZWQgYXMgYHVuaXF1ZWAuXG4gIF8udW5pcSA9IF8udW5pcXVlID0gZnVuY3Rpb24oYXJyYXksIGlzU29ydGVkLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGlmIChfLmlzRnVuY3Rpb24oaXNTb3J0ZWQpKSB7XG4gICAgICBjb250ZXh0ID0gaXRlcmF0b3I7XG4gICAgICBpdGVyYXRvciA9IGlzU29ydGVkO1xuICAgICAgaXNTb3J0ZWQgPSBmYWxzZTtcbiAgICB9XG4gICAgdmFyIGluaXRpYWwgPSBpdGVyYXRvciA/IF8ubWFwKGFycmF5LCBpdGVyYXRvciwgY29udGV4dCkgOiBhcnJheTtcbiAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgIHZhciBzZWVuID0gW107XG4gICAgZWFjaChpbml0aWFsLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgpIHtcbiAgICAgIGlmIChpc1NvcnRlZCA/ICghaW5kZXggfHwgc2VlbltzZWVuLmxlbmd0aCAtIDFdICE9PSB2YWx1ZSkgOiAhXy5jb250YWlucyhzZWVuLCB2YWx1ZSkpIHtcbiAgICAgICAgc2Vlbi5wdXNoKHZhbHVlKTtcbiAgICAgICAgcmVzdWx0cy5wdXNoKGFycmF5W2luZGV4XSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH07XG5cbiAgLy8gUHJvZHVjZSBhbiBhcnJheSB0aGF0IGNvbnRhaW5zIHRoZSB1bmlvbjogZWFjaCBkaXN0aW5jdCBlbGVtZW50IGZyb20gYWxsIG9mXG4gIC8vIHRoZSBwYXNzZWQtaW4gYXJyYXlzLlxuICBfLnVuaW9uID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIF8udW5pcShjb25jYXQuYXBwbHkoQXJyYXlQcm90bywgYXJndW1lbnRzKSk7XG4gIH07XG5cbiAgLy8gUHJvZHVjZSBhbiBhcnJheSB0aGF0IGNvbnRhaW5zIGV2ZXJ5IGl0ZW0gc2hhcmVkIGJldHdlZW4gYWxsIHRoZVxuICAvLyBwYXNzZWQtaW4gYXJyYXlzLlxuICBfLmludGVyc2VjdGlvbiA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgdmFyIHJlc3QgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgcmV0dXJuIF8uZmlsdGVyKF8udW5pcShhcnJheSksIGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgIHJldHVybiBfLmV2ZXJ5KHJlc3QsIGZ1bmN0aW9uKG90aGVyKSB7XG4gICAgICAgIHJldHVybiBfLmluZGV4T2Yob3RoZXIsIGl0ZW0pID49IDA7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBUYWtlIHRoZSBkaWZmZXJlbmNlIGJldHdlZW4gb25lIGFycmF5IGFuZCBhIG51bWJlciBvZiBvdGhlciBhcnJheXMuXG4gIC8vIE9ubHkgdGhlIGVsZW1lbnRzIHByZXNlbnQgaW4ganVzdCB0aGUgZmlyc3QgYXJyYXkgd2lsbCByZW1haW4uXG4gIF8uZGlmZmVyZW5jZSA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgdmFyIHJlc3QgPSBjb25jYXQuYXBwbHkoQXJyYXlQcm90bywgc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcbiAgICByZXR1cm4gXy5maWx0ZXIoYXJyYXksIGZ1bmN0aW9uKHZhbHVlKXsgcmV0dXJuICFfLmNvbnRhaW5zKHJlc3QsIHZhbHVlKTsgfSk7XG4gIH07XG5cbiAgLy8gWmlwIHRvZ2V0aGVyIG11bHRpcGxlIGxpc3RzIGludG8gYSBzaW5nbGUgYXJyYXkgLS0gZWxlbWVudHMgdGhhdCBzaGFyZVxuICAvLyBhbiBpbmRleCBnbyB0b2dldGhlci5cbiAgXy56aXAgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICB2YXIgbGVuZ3RoID0gXy5tYXgoXy5wbHVjayhhcmdzLCAnbGVuZ3RoJykpO1xuICAgIHZhciByZXN1bHRzID0gbmV3IEFycmF5KGxlbmd0aCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgcmVzdWx0c1tpXSA9IF8ucGx1Y2soYXJncywgXCJcIiArIGkpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfTtcblxuICAvLyBDb252ZXJ0cyBsaXN0cyBpbnRvIG9iamVjdHMuIFBhc3MgZWl0aGVyIGEgc2luZ2xlIGFycmF5IG9mIGBba2V5LCB2YWx1ZV1gXG4gIC8vIHBhaXJzLCBvciB0d28gcGFyYWxsZWwgYXJyYXlzIG9mIHRoZSBzYW1lIGxlbmd0aCAtLSBvbmUgb2Yga2V5cywgYW5kIG9uZSBvZlxuICAvLyB0aGUgY29ycmVzcG9uZGluZyB2YWx1ZXMuXG4gIF8ub2JqZWN0ID0gZnVuY3Rpb24obGlzdCwgdmFsdWVzKSB7XG4gICAgaWYgKGxpc3QgPT0gbnVsbCkgcmV0dXJuIHt9O1xuICAgIHZhciByZXN1bHQgPSB7fTtcbiAgICBmb3IgKHZhciBpID0gMCwgbCA9IGxpc3QubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICBpZiAodmFsdWVzKSB7XG4gICAgICAgIHJlc3VsdFtsaXN0W2ldXSA9IHZhbHVlc1tpXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdFtsaXN0W2ldWzBdXSA9IGxpc3RbaV1bMV07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gSWYgdGhlIGJyb3dzZXIgZG9lc24ndCBzdXBwbHkgdXMgd2l0aCBpbmRleE9mIChJJ20gbG9va2luZyBhdCB5b3UsICoqTVNJRSoqKSxcbiAgLy8gd2UgbmVlZCB0aGlzIGZ1bmN0aW9uLiBSZXR1cm4gdGhlIHBvc2l0aW9uIG9mIHRoZSBmaXJzdCBvY2N1cnJlbmNlIG9mIGFuXG4gIC8vIGl0ZW0gaW4gYW4gYXJyYXksIG9yIC0xIGlmIHRoZSBpdGVtIGlzIG5vdCBpbmNsdWRlZCBpbiB0aGUgYXJyYXkuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBpbmRleE9mYCBpZiBhdmFpbGFibGUuXG4gIC8vIElmIHRoZSBhcnJheSBpcyBsYXJnZSBhbmQgYWxyZWFkeSBpbiBzb3J0IG9yZGVyLCBwYXNzIGB0cnVlYFxuICAvLyBmb3IgKippc1NvcnRlZCoqIHRvIHVzZSBiaW5hcnkgc2VhcmNoLlxuICBfLmluZGV4T2YgPSBmdW5jdGlvbihhcnJheSwgaXRlbSwgaXNTb3J0ZWQpIHtcbiAgICBpZiAoYXJyYXkgPT0gbnVsbCkgcmV0dXJuIC0xO1xuICAgIHZhciBpID0gMCwgbCA9IGFycmF5Lmxlbmd0aDtcbiAgICBpZiAoaXNTb3J0ZWQpIHtcbiAgICAgIGlmICh0eXBlb2YgaXNTb3J0ZWQgPT0gJ251bWJlcicpIHtcbiAgICAgICAgaSA9IChpc1NvcnRlZCA8IDAgPyBNYXRoLm1heCgwLCBsICsgaXNTb3J0ZWQpIDogaXNTb3J0ZWQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaSA9IF8uc29ydGVkSW5kZXgoYXJyYXksIGl0ZW0pO1xuICAgICAgICByZXR1cm4gYXJyYXlbaV0gPT09IGl0ZW0gPyBpIDogLTE7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChuYXRpdmVJbmRleE9mICYmIGFycmF5LmluZGV4T2YgPT09IG5hdGl2ZUluZGV4T2YpIHJldHVybiBhcnJheS5pbmRleE9mKGl0ZW0sIGlzU29ydGVkKTtcbiAgICBmb3IgKDsgaSA8IGw7IGkrKykgaWYgKGFycmF5W2ldID09PSBpdGVtKSByZXR1cm4gaTtcbiAgICByZXR1cm4gLTE7XG4gIH07XG5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYGxhc3RJbmRleE9mYCBpZiBhdmFpbGFibGUuXG4gIF8ubGFzdEluZGV4T2YgPSBmdW5jdGlvbihhcnJheSwgaXRlbSwgZnJvbSkge1xuICAgIGlmIChhcnJheSA9PSBudWxsKSByZXR1cm4gLTE7XG4gICAgdmFyIGhhc0luZGV4ID0gZnJvbSAhPSBudWxsO1xuICAgIGlmIChuYXRpdmVMYXN0SW5kZXhPZiAmJiBhcnJheS5sYXN0SW5kZXhPZiA9PT0gbmF0aXZlTGFzdEluZGV4T2YpIHtcbiAgICAgIHJldHVybiBoYXNJbmRleCA/IGFycmF5Lmxhc3RJbmRleE9mKGl0ZW0sIGZyb20pIDogYXJyYXkubGFzdEluZGV4T2YoaXRlbSk7XG4gICAgfVxuICAgIHZhciBpID0gKGhhc0luZGV4ID8gZnJvbSA6IGFycmF5Lmxlbmd0aCk7XG4gICAgd2hpbGUgKGktLSkgaWYgKGFycmF5W2ldID09PSBpdGVtKSByZXR1cm4gaTtcbiAgICByZXR1cm4gLTE7XG4gIH07XG5cbiAgLy8gR2VuZXJhdGUgYW4gaW50ZWdlciBBcnJheSBjb250YWluaW5nIGFuIGFyaXRobWV0aWMgcHJvZ3Jlc3Npb24uIEEgcG9ydCBvZlxuICAvLyB0aGUgbmF0aXZlIFB5dGhvbiBgcmFuZ2UoKWAgZnVuY3Rpb24uIFNlZVxuICAvLyBbdGhlIFB5dGhvbiBkb2N1bWVudGF0aW9uXShodHRwOi8vZG9jcy5weXRob24ub3JnL2xpYnJhcnkvZnVuY3Rpb25zLmh0bWwjcmFuZ2UpLlxuICBfLnJhbmdlID0gZnVuY3Rpb24oc3RhcnQsIHN0b3AsIHN0ZXApIHtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA8PSAxKSB7XG4gICAgICBzdG9wID0gc3RhcnQgfHwgMDtcbiAgICAgIHN0YXJ0ID0gMDtcbiAgICB9XG4gICAgc3RlcCA9IGFyZ3VtZW50c1syXSB8fCAxO1xuXG4gICAgdmFyIGxlbiA9IE1hdGgubWF4KE1hdGguY2VpbCgoc3RvcCAtIHN0YXJ0KSAvIHN0ZXApLCAwKTtcbiAgICB2YXIgaWR4ID0gMDtcbiAgICB2YXIgcmFuZ2UgPSBuZXcgQXJyYXkobGVuKTtcblxuICAgIHdoaWxlKGlkeCA8IGxlbikge1xuICAgICAgcmFuZ2VbaWR4KytdID0gc3RhcnQ7XG4gICAgICBzdGFydCArPSBzdGVwO1xuICAgIH1cblxuICAgIHJldHVybiByYW5nZTtcbiAgfTtcblxuICAvLyBGdW5jdGlvbiAoYWhlbSkgRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIENyZWF0ZSBhIGZ1bmN0aW9uIGJvdW5kIHRvIGEgZ2l2ZW4gb2JqZWN0IChhc3NpZ25pbmcgYHRoaXNgLCBhbmQgYXJndW1lbnRzLFxuICAvLyBvcHRpb25hbGx5KS4gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYEZ1bmN0aW9uLmJpbmRgIGlmXG4gIC8vIGF2YWlsYWJsZS5cbiAgXy5iaW5kID0gZnVuY3Rpb24oZnVuYywgY29udGV4dCkge1xuICAgIGlmIChmdW5jLmJpbmQgPT09IG5hdGl2ZUJpbmQgJiYgbmF0aXZlQmluZCkgcmV0dXJuIG5hdGl2ZUJpbmQuYXBwbHkoZnVuYywgc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcbiAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzLmNvbmNhdChzbGljZS5jYWxsKGFyZ3VtZW50cykpKTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFBhcnRpYWxseSBhcHBseSBhIGZ1bmN0aW9uIGJ5IGNyZWF0aW5nIGEgdmVyc2lvbiB0aGF0IGhhcyBoYWQgc29tZSBvZiBpdHNcbiAgLy8gYXJndW1lbnRzIHByZS1maWxsZWQsIHdpdGhvdXQgY2hhbmdpbmcgaXRzIGR5bmFtaWMgYHRoaXNgIGNvbnRleHQuXG4gIF8ucGFydGlhbCA9IGZ1bmN0aW9uKGZ1bmMpIHtcbiAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gZnVuYy5hcHBseSh0aGlzLCBhcmdzLmNvbmNhdChzbGljZS5jYWxsKGFyZ3VtZW50cykpKTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIEJpbmQgYWxsIG9mIGFuIG9iamVjdCdzIG1ldGhvZHMgdG8gdGhhdCBvYmplY3QuIFVzZWZ1bCBmb3IgZW5zdXJpbmcgdGhhdFxuICAvLyBhbGwgY2FsbGJhY2tzIGRlZmluZWQgb24gYW4gb2JqZWN0IGJlbG9uZyB0byBpdC5cbiAgXy5iaW5kQWxsID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGZ1bmNzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgIGlmIChmdW5jcy5sZW5ndGggPT09IDApIGZ1bmNzID0gXy5mdW5jdGlvbnMob2JqKTtcbiAgICBlYWNoKGZ1bmNzLCBmdW5jdGlvbihmKSB7IG9ialtmXSA9IF8uYmluZChvYmpbZl0sIG9iaik7IH0pO1xuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gTWVtb2l6ZSBhbiBleHBlbnNpdmUgZnVuY3Rpb24gYnkgc3RvcmluZyBpdHMgcmVzdWx0cy5cbiAgXy5tZW1vaXplID0gZnVuY3Rpb24oZnVuYywgaGFzaGVyKSB7XG4gICAgdmFyIG1lbW8gPSB7fTtcbiAgICBoYXNoZXIgfHwgKGhhc2hlciA9IF8uaWRlbnRpdHkpO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBrZXkgPSBoYXNoZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiBfLmhhcyhtZW1vLCBrZXkpID8gbWVtb1trZXldIDogKG1lbW9ba2V5XSA9IGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKSk7XG4gICAgfTtcbiAgfTtcblxuICAvLyBEZWxheXMgYSBmdW5jdGlvbiBmb3IgdGhlIGdpdmVuIG51bWJlciBvZiBtaWxsaXNlY29uZHMsIGFuZCB0aGVuIGNhbGxzXG4gIC8vIGl0IHdpdGggdGhlIGFyZ3VtZW50cyBzdXBwbGllZC5cbiAgXy5kZWxheSA9IGZ1bmN0aW9uKGZ1bmMsIHdhaXQpIHtcbiAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICByZXR1cm4gc2V0VGltZW91dChmdW5jdGlvbigpeyByZXR1cm4gZnVuYy5hcHBseShudWxsLCBhcmdzKTsgfSwgd2FpdCk7XG4gIH07XG5cbiAgLy8gRGVmZXJzIGEgZnVuY3Rpb24sIHNjaGVkdWxpbmcgaXQgdG8gcnVuIGFmdGVyIHRoZSBjdXJyZW50IGNhbGwgc3RhY2sgaGFzXG4gIC8vIGNsZWFyZWQuXG4gIF8uZGVmZXIgPSBmdW5jdGlvbihmdW5jKSB7XG4gICAgcmV0dXJuIF8uZGVsYXkuYXBwbHkoXywgW2Z1bmMsIDFdLmNvbmNhdChzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpKTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24sIHRoYXQsIHdoZW4gaW52b2tlZCwgd2lsbCBvbmx5IGJlIHRyaWdnZXJlZCBhdCBtb3N0IG9uY2VcbiAgLy8gZHVyaW5nIGEgZ2l2ZW4gd2luZG93IG9mIHRpbWUuXG4gIF8udGhyb3R0bGUgPSBmdW5jdGlvbihmdW5jLCB3YWl0KSB7XG4gICAgdmFyIGNvbnRleHQsIGFyZ3MsIHRpbWVvdXQsIHJlc3VsdDtcbiAgICB2YXIgcHJldmlvdXMgPSAwO1xuICAgIHZhciBsYXRlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgcHJldmlvdXMgPSBuZXcgRGF0ZTtcbiAgICAgIHRpbWVvdXQgPSBudWxsO1xuICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICB9O1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBub3cgPSBuZXcgRGF0ZTtcbiAgICAgIHZhciByZW1haW5pbmcgPSB3YWl0IC0gKG5vdyAtIHByZXZpb3VzKTtcbiAgICAgIGNvbnRleHQgPSB0aGlzO1xuICAgICAgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIGlmIChyZW1haW5pbmcgPD0gMCkge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgIHRpbWVvdXQgPSBudWxsO1xuICAgICAgICBwcmV2aW91cyA9IG5vdztcbiAgICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgIH0gZWxzZSBpZiAoIXRpbWVvdXQpIHtcbiAgICAgICAgdGltZW91dCA9IHNldFRpbWVvdXQobGF0ZXIsIHJlbWFpbmluZyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uLCB0aGF0LCBhcyBsb25nIGFzIGl0IGNvbnRpbnVlcyB0byBiZSBpbnZva2VkLCB3aWxsIG5vdFxuICAvLyBiZSB0cmlnZ2VyZWQuIFRoZSBmdW5jdGlvbiB3aWxsIGJlIGNhbGxlZCBhZnRlciBpdCBzdG9wcyBiZWluZyBjYWxsZWQgZm9yXG4gIC8vIE4gbWlsbGlzZWNvbmRzLiBJZiBgaW1tZWRpYXRlYCBpcyBwYXNzZWQsIHRyaWdnZXIgdGhlIGZ1bmN0aW9uIG9uIHRoZVxuICAvLyBsZWFkaW5nIGVkZ2UsIGluc3RlYWQgb2YgdGhlIHRyYWlsaW5nLlxuICBfLmRlYm91bmNlID0gZnVuY3Rpb24oZnVuYywgd2FpdCwgaW1tZWRpYXRlKSB7XG4gICAgdmFyIHRpbWVvdXQsIHJlc3VsdDtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgY29udGV4dCA9IHRoaXMsIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICB2YXIgbGF0ZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdGltZW91dCA9IG51bGw7XG4gICAgICAgIGlmICghaW1tZWRpYXRlKSByZXN1bHQgPSBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgICAgfTtcbiAgICAgIHZhciBjYWxsTm93ID0gaW1tZWRpYXRlICYmICF0aW1lb3V0O1xuICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgdGltZW91dCA9IHNldFRpbWVvdXQobGF0ZXIsIHdhaXQpO1xuICAgICAgaWYgKGNhbGxOb3cpIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgd2lsbCBiZSBleGVjdXRlZCBhdCBtb3N0IG9uZSB0aW1lLCBubyBtYXR0ZXIgaG93XG4gIC8vIG9mdGVuIHlvdSBjYWxsIGl0LiBVc2VmdWwgZm9yIGxhenkgaW5pdGlhbGl6YXRpb24uXG4gIF8ub25jZSA9IGZ1bmN0aW9uKGZ1bmMpIHtcbiAgICB2YXIgcmFuID0gZmFsc2UsIG1lbW87XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKHJhbikgcmV0dXJuIG1lbW87XG4gICAgICByYW4gPSB0cnVlO1xuICAgICAgbWVtbyA9IGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIGZ1bmMgPSBudWxsO1xuICAgICAgcmV0dXJuIG1lbW87XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIHRoZSBmaXJzdCBmdW5jdGlvbiBwYXNzZWQgYXMgYW4gYXJndW1lbnQgdG8gdGhlIHNlY29uZCxcbiAgLy8gYWxsb3dpbmcgeW91IHRvIGFkanVzdCBhcmd1bWVudHMsIHJ1biBjb2RlIGJlZm9yZSBhbmQgYWZ0ZXIsIGFuZFxuICAvLyBjb25kaXRpb25hbGx5IGV4ZWN1dGUgdGhlIG9yaWdpbmFsIGZ1bmN0aW9uLlxuICBfLndyYXAgPSBmdW5jdGlvbihmdW5jLCB3cmFwcGVyKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGFyZ3MgPSBbZnVuY107XG4gICAgICBwdXNoLmFwcGx5KGFyZ3MsIGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gd3JhcHBlci5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IGlzIHRoZSBjb21wb3NpdGlvbiBvZiBhIGxpc3Qgb2YgZnVuY3Rpb25zLCBlYWNoXG4gIC8vIGNvbnN1bWluZyB0aGUgcmV0dXJuIHZhbHVlIG9mIHRoZSBmdW5jdGlvbiB0aGF0IGZvbGxvd3MuXG4gIF8uY29tcG9zZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBmdW5jcyA9IGFyZ3VtZW50cztcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIGZvciAodmFyIGkgPSBmdW5jcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICBhcmdzID0gW2Z1bmNzW2ldLmFwcGx5KHRoaXMsIGFyZ3MpXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBhcmdzWzBdO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgd2lsbCBvbmx5IGJlIGV4ZWN1dGVkIGFmdGVyIGJlaW5nIGNhbGxlZCBOIHRpbWVzLlxuICBfLmFmdGVyID0gZnVuY3Rpb24odGltZXMsIGZ1bmMpIHtcbiAgICBpZiAodGltZXMgPD0gMCkgcmV0dXJuIGZ1bmMoKTtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoLS10aW1lcyA8IDEpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIH1cbiAgICB9O1xuICB9O1xuXG4gIC8vIE9iamVjdCBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIFJldHJpZXZlIHRoZSBuYW1lcyBvZiBhbiBvYmplY3QncyBwcm9wZXJ0aWVzLlxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgT2JqZWN0LmtleXNgXG4gIF8ua2V5cyA9IG5hdGl2ZUtleXMgfHwgZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKG9iaiAhPT0gT2JqZWN0KG9iaikpIHRocm93IG5ldyBUeXBlRXJyb3IoJ0ludmFsaWQgb2JqZWN0Jyk7XG4gICAgdmFyIGtleXMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSBpZiAoXy5oYXMob2JqLCBrZXkpKSBrZXlzW2tleXMubGVuZ3RoXSA9IGtleTtcbiAgICByZXR1cm4ga2V5cztcbiAgfTtcblxuICAvLyBSZXRyaWV2ZSB0aGUgdmFsdWVzIG9mIGFuIG9iamVjdCdzIHByb3BlcnRpZXMuXG4gIF8udmFsdWVzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHZhbHVlcyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIGlmIChfLmhhcyhvYmosIGtleSkpIHZhbHVlcy5wdXNoKG9ialtrZXldKTtcbiAgICByZXR1cm4gdmFsdWVzO1xuICB9O1xuXG4gIC8vIENvbnZlcnQgYW4gb2JqZWN0IGludG8gYSBsaXN0IG9mIGBba2V5LCB2YWx1ZV1gIHBhaXJzLlxuICBfLnBhaXJzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHBhaXJzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikgaWYgKF8uaGFzKG9iaiwga2V5KSkgcGFpcnMucHVzaChba2V5LCBvYmpba2V5XV0pO1xuICAgIHJldHVybiBwYWlycztcbiAgfTtcblxuICAvLyBJbnZlcnQgdGhlIGtleXMgYW5kIHZhbHVlcyBvZiBhbiBvYmplY3QuIFRoZSB2YWx1ZXMgbXVzdCBiZSBzZXJpYWxpemFibGUuXG4gIF8uaW52ZXJ0ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIGlmIChfLmhhcyhvYmosIGtleSkpIHJlc3VsdFtvYmpba2V5XV0gPSBrZXk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSBzb3J0ZWQgbGlzdCBvZiB0aGUgZnVuY3Rpb24gbmFtZXMgYXZhaWxhYmxlIG9uIHRoZSBvYmplY3QuXG4gIC8vIEFsaWFzZWQgYXMgYG1ldGhvZHNgXG4gIF8uZnVuY3Rpb25zID0gXy5tZXRob2RzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIG5hbWVzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKF8uaXNGdW5jdGlvbihvYmpba2V5XSkpIG5hbWVzLnB1c2goa2V5KTtcbiAgICB9XG4gICAgcmV0dXJuIG5hbWVzLnNvcnQoKTtcbiAgfTtcblxuICAvLyBFeHRlbmQgYSBnaXZlbiBvYmplY3Qgd2l0aCBhbGwgdGhlIHByb3BlcnRpZXMgaW4gcGFzc2VkLWluIG9iamVjdChzKS5cbiAgXy5leHRlbmQgPSBmdW5jdGlvbihvYmopIHtcbiAgICBlYWNoKHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSwgZnVuY3Rpb24oc291cmNlKSB7XG4gICAgICBpZiAoc291cmNlKSB7XG4gICAgICAgIGZvciAodmFyIHByb3AgaW4gc291cmNlKSB7XG4gICAgICAgICAgb2JqW3Byb3BdID0gc291cmNlW3Byb3BdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSBjb3B5IG9mIHRoZSBvYmplY3Qgb25seSBjb250YWluaW5nIHRoZSB3aGl0ZWxpc3RlZCBwcm9wZXJ0aWVzLlxuICBfLnBpY2sgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgY29weSA9IHt9O1xuICAgIHZhciBrZXlzID0gY29uY2F0LmFwcGx5KEFycmF5UHJvdG8sIHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XG4gICAgZWFjaChrZXlzLCBmdW5jdGlvbihrZXkpIHtcbiAgICAgIGlmIChrZXkgaW4gb2JqKSBjb3B5W2tleV0gPSBvYmpba2V5XTtcbiAgICB9KTtcbiAgICByZXR1cm4gY29weTtcbiAgfTtcblxuICAgLy8gUmV0dXJuIGEgY29weSBvZiB0aGUgb2JqZWN0IHdpdGhvdXQgdGhlIGJsYWNrbGlzdGVkIHByb3BlcnRpZXMuXG4gIF8ub21pdCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBjb3B5ID0ge307XG4gICAgdmFyIGtleXMgPSBjb25jYXQuYXBwbHkoQXJyYXlQcm90bywgc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoIV8uY29udGFpbnMoa2V5cywga2V5KSkgY29weVtrZXldID0gb2JqW2tleV07XG4gICAgfVxuICAgIHJldHVybiBjb3B5O1xuICB9O1xuXG4gIC8vIEZpbGwgaW4gYSBnaXZlbiBvYmplY3Qgd2l0aCBkZWZhdWx0IHByb3BlcnRpZXMuXG4gIF8uZGVmYXVsdHMgPSBmdW5jdGlvbihvYmopIHtcbiAgICBlYWNoKHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSwgZnVuY3Rpb24oc291cmNlKSB7XG4gICAgICBpZiAoc291cmNlKSB7XG4gICAgICAgIGZvciAodmFyIHByb3AgaW4gc291cmNlKSB7XG4gICAgICAgICAgaWYgKG9ialtwcm9wXSA9PSBudWxsKSBvYmpbcHJvcF0gPSBzb3VyY2VbcHJvcF07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gb2JqO1xuICB9O1xuXG4gIC8vIENyZWF0ZSBhIChzaGFsbG93LWNsb25lZCkgZHVwbGljYXRlIG9mIGFuIG9iamVjdC5cbiAgXy5jbG9uZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmICghXy5pc09iamVjdChvYmopKSByZXR1cm4gb2JqO1xuICAgIHJldHVybiBfLmlzQXJyYXkob2JqKSA/IG9iai5zbGljZSgpIDogXy5leHRlbmQoe30sIG9iaik7XG4gIH07XG5cbiAgLy8gSW52b2tlcyBpbnRlcmNlcHRvciB3aXRoIHRoZSBvYmosIGFuZCB0aGVuIHJldHVybnMgb2JqLlxuICAvLyBUaGUgcHJpbWFyeSBwdXJwb3NlIG9mIHRoaXMgbWV0aG9kIGlzIHRvIFwidGFwIGludG9cIiBhIG1ldGhvZCBjaGFpbiwgaW5cbiAgLy8gb3JkZXIgdG8gcGVyZm9ybSBvcGVyYXRpb25zIG9uIGludGVybWVkaWF0ZSByZXN1bHRzIHdpdGhpbiB0aGUgY2hhaW4uXG4gIF8udGFwID0gZnVuY3Rpb24ob2JqLCBpbnRlcmNlcHRvcikge1xuICAgIGludGVyY2VwdG9yKG9iaik7XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBJbnRlcm5hbCByZWN1cnNpdmUgY29tcGFyaXNvbiBmdW5jdGlvbiBmb3IgYGlzRXF1YWxgLlxuICB2YXIgZXEgPSBmdW5jdGlvbihhLCBiLCBhU3RhY2ssIGJTdGFjaykge1xuICAgIC8vIElkZW50aWNhbCBvYmplY3RzIGFyZSBlcXVhbC4gYDAgPT09IC0wYCwgYnV0IHRoZXkgYXJlbid0IGlkZW50aWNhbC5cbiAgICAvLyBTZWUgdGhlIEhhcm1vbnkgYGVnYWxgIHByb3Bvc2FsOiBodHRwOi8vd2lraS5lY21hc2NyaXB0Lm9yZy9kb2t1LnBocD9pZD1oYXJtb255OmVnYWwuXG4gICAgaWYgKGEgPT09IGIpIHJldHVybiBhICE9PSAwIHx8IDEgLyBhID09IDEgLyBiO1xuICAgIC8vIEEgc3RyaWN0IGNvbXBhcmlzb24gaXMgbmVjZXNzYXJ5IGJlY2F1c2UgYG51bGwgPT0gdW5kZWZpbmVkYC5cbiAgICBpZiAoYSA9PSBudWxsIHx8IGIgPT0gbnVsbCkgcmV0dXJuIGEgPT09IGI7XG4gICAgLy8gVW53cmFwIGFueSB3cmFwcGVkIG9iamVjdHMuXG4gICAgaWYgKGEgaW5zdGFuY2VvZiBfKSBhID0gYS5fd3JhcHBlZDtcbiAgICBpZiAoYiBpbnN0YW5jZW9mIF8pIGIgPSBiLl93cmFwcGVkO1xuICAgIC8vIENvbXBhcmUgYFtbQ2xhc3NdXWAgbmFtZXMuXG4gICAgdmFyIGNsYXNzTmFtZSA9IHRvU3RyaW5nLmNhbGwoYSk7XG4gICAgaWYgKGNsYXNzTmFtZSAhPSB0b1N0cmluZy5jYWxsKGIpKSByZXR1cm4gZmFsc2U7XG4gICAgc3dpdGNoIChjbGFzc05hbWUpIHtcbiAgICAgIC8vIFN0cmluZ3MsIG51bWJlcnMsIGRhdGVzLCBhbmQgYm9vbGVhbnMgYXJlIGNvbXBhcmVkIGJ5IHZhbHVlLlxuICAgICAgY2FzZSAnW29iamVjdCBTdHJpbmddJzpcbiAgICAgICAgLy8gUHJpbWl0aXZlcyBhbmQgdGhlaXIgY29ycmVzcG9uZGluZyBvYmplY3Qgd3JhcHBlcnMgYXJlIGVxdWl2YWxlbnQ7IHRodXMsIGBcIjVcImAgaXNcbiAgICAgICAgLy8gZXF1aXZhbGVudCB0byBgbmV3IFN0cmluZyhcIjVcIilgLlxuICAgICAgICByZXR1cm4gYSA9PSBTdHJpbmcoYik7XG4gICAgICBjYXNlICdbb2JqZWN0IE51bWJlcl0nOlxuICAgICAgICAvLyBgTmFOYHMgYXJlIGVxdWl2YWxlbnQsIGJ1dCBub24tcmVmbGV4aXZlLiBBbiBgZWdhbGAgY29tcGFyaXNvbiBpcyBwZXJmb3JtZWQgZm9yXG4gICAgICAgIC8vIG90aGVyIG51bWVyaWMgdmFsdWVzLlxuICAgICAgICByZXR1cm4gYSAhPSArYSA/IGIgIT0gK2IgOiAoYSA9PSAwID8gMSAvIGEgPT0gMSAvIGIgOiBhID09ICtiKTtcbiAgICAgIGNhc2UgJ1tvYmplY3QgRGF0ZV0nOlxuICAgICAgY2FzZSAnW29iamVjdCBCb29sZWFuXSc6XG4gICAgICAgIC8vIENvZXJjZSBkYXRlcyBhbmQgYm9vbGVhbnMgdG8gbnVtZXJpYyBwcmltaXRpdmUgdmFsdWVzLiBEYXRlcyBhcmUgY29tcGFyZWQgYnkgdGhlaXJcbiAgICAgICAgLy8gbWlsbGlzZWNvbmQgcmVwcmVzZW50YXRpb25zLiBOb3RlIHRoYXQgaW52YWxpZCBkYXRlcyB3aXRoIG1pbGxpc2Vjb25kIHJlcHJlc2VudGF0aW9uc1xuICAgICAgICAvLyBvZiBgTmFOYCBhcmUgbm90IGVxdWl2YWxlbnQuXG4gICAgICAgIHJldHVybiArYSA9PSArYjtcbiAgICAgIC8vIFJlZ0V4cHMgYXJlIGNvbXBhcmVkIGJ5IHRoZWlyIHNvdXJjZSBwYXR0ZXJucyBhbmQgZmxhZ3MuXG4gICAgICBjYXNlICdbb2JqZWN0IFJlZ0V4cF0nOlxuICAgICAgICByZXR1cm4gYS5zb3VyY2UgPT0gYi5zb3VyY2UgJiZcbiAgICAgICAgICAgICAgIGEuZ2xvYmFsID09IGIuZ2xvYmFsICYmXG4gICAgICAgICAgICAgICBhLm11bHRpbGluZSA9PSBiLm11bHRpbGluZSAmJlxuICAgICAgICAgICAgICAgYS5pZ25vcmVDYXNlID09IGIuaWdub3JlQ2FzZTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBhICE9ICdvYmplY3QnIHx8IHR5cGVvZiBiICE9ICdvYmplY3QnKSByZXR1cm4gZmFsc2U7XG4gICAgLy8gQXNzdW1lIGVxdWFsaXR5IGZvciBjeWNsaWMgc3RydWN0dXJlcy4gVGhlIGFsZ29yaXRobSBmb3IgZGV0ZWN0aW5nIGN5Y2xpY1xuICAgIC8vIHN0cnVjdHVyZXMgaXMgYWRhcHRlZCBmcm9tIEVTIDUuMSBzZWN0aW9uIDE1LjEyLjMsIGFic3RyYWN0IG9wZXJhdGlvbiBgSk9gLlxuICAgIHZhciBsZW5ndGggPSBhU3RhY2subGVuZ3RoO1xuICAgIHdoaWxlIChsZW5ndGgtLSkge1xuICAgICAgLy8gTGluZWFyIHNlYXJjaC4gUGVyZm9ybWFuY2UgaXMgaW52ZXJzZWx5IHByb3BvcnRpb25hbCB0byB0aGUgbnVtYmVyIG9mXG4gICAgICAvLyB1bmlxdWUgbmVzdGVkIHN0cnVjdHVyZXMuXG4gICAgICBpZiAoYVN0YWNrW2xlbmd0aF0gPT0gYSkgcmV0dXJuIGJTdGFja1tsZW5ndGhdID09IGI7XG4gICAgfVxuICAgIC8vIEFkZCB0aGUgZmlyc3Qgb2JqZWN0IHRvIHRoZSBzdGFjayBvZiB0cmF2ZXJzZWQgb2JqZWN0cy5cbiAgICBhU3RhY2sucHVzaChhKTtcbiAgICBiU3RhY2sucHVzaChiKTtcbiAgICB2YXIgc2l6ZSA9IDAsIHJlc3VsdCA9IHRydWU7XG4gICAgLy8gUmVjdXJzaXZlbHkgY29tcGFyZSBvYmplY3RzIGFuZCBhcnJheXMuXG4gICAgaWYgKGNsYXNzTmFtZSA9PSAnW29iamVjdCBBcnJheV0nKSB7XG4gICAgICAvLyBDb21wYXJlIGFycmF5IGxlbmd0aHMgdG8gZGV0ZXJtaW5lIGlmIGEgZGVlcCBjb21wYXJpc29uIGlzIG5lY2Vzc2FyeS5cbiAgICAgIHNpemUgPSBhLmxlbmd0aDtcbiAgICAgIHJlc3VsdCA9IHNpemUgPT0gYi5sZW5ndGg7XG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIC8vIERlZXAgY29tcGFyZSB0aGUgY29udGVudHMsIGlnbm9yaW5nIG5vbi1udW1lcmljIHByb3BlcnRpZXMuXG4gICAgICAgIHdoaWxlIChzaXplLS0pIHtcbiAgICAgICAgICBpZiAoIShyZXN1bHQgPSBlcShhW3NpemVdLCBiW3NpemVdLCBhU3RhY2ssIGJTdGFjaykpKSBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBPYmplY3RzIHdpdGggZGlmZmVyZW50IGNvbnN0cnVjdG9ycyBhcmUgbm90IGVxdWl2YWxlbnQsIGJ1dCBgT2JqZWN0YHNcbiAgICAgIC8vIGZyb20gZGlmZmVyZW50IGZyYW1lcyBhcmUuXG4gICAgICB2YXIgYUN0b3IgPSBhLmNvbnN0cnVjdG9yLCBiQ3RvciA9IGIuY29uc3RydWN0b3I7XG4gICAgICBpZiAoYUN0b3IgIT09IGJDdG9yICYmICEoXy5pc0Z1bmN0aW9uKGFDdG9yKSAmJiAoYUN0b3IgaW5zdGFuY2VvZiBhQ3RvcikgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBfLmlzRnVuY3Rpb24oYkN0b3IpICYmIChiQ3RvciBpbnN0YW5jZW9mIGJDdG9yKSkpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgLy8gRGVlcCBjb21wYXJlIG9iamVjdHMuXG4gICAgICBmb3IgKHZhciBrZXkgaW4gYSkge1xuICAgICAgICBpZiAoXy5oYXMoYSwga2V5KSkge1xuICAgICAgICAgIC8vIENvdW50IHRoZSBleHBlY3RlZCBudW1iZXIgb2YgcHJvcGVydGllcy5cbiAgICAgICAgICBzaXplKys7XG4gICAgICAgICAgLy8gRGVlcCBjb21wYXJlIGVhY2ggbWVtYmVyLlxuICAgICAgICAgIGlmICghKHJlc3VsdCA9IF8uaGFzKGIsIGtleSkgJiYgZXEoYVtrZXldLCBiW2tleV0sIGFTdGFjaywgYlN0YWNrKSkpIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBFbnN1cmUgdGhhdCBib3RoIG9iamVjdHMgY29udGFpbiB0aGUgc2FtZSBudW1iZXIgb2YgcHJvcGVydGllcy5cbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgZm9yIChrZXkgaW4gYikge1xuICAgICAgICAgIGlmIChfLmhhcyhiLCBrZXkpICYmICEoc2l6ZS0tKSkgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0ID0gIXNpemU7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIFJlbW92ZSB0aGUgZmlyc3Qgb2JqZWN0IGZyb20gdGhlIHN0YWNrIG9mIHRyYXZlcnNlZCBvYmplY3RzLlxuICAgIGFTdGFjay5wb3AoKTtcbiAgICBiU3RhY2sucG9wKCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBQZXJmb3JtIGEgZGVlcCBjb21wYXJpc29uIHRvIGNoZWNrIGlmIHR3byBvYmplY3RzIGFyZSBlcXVhbC5cbiAgXy5pc0VxdWFsID0gZnVuY3Rpb24oYSwgYikge1xuICAgIHJldHVybiBlcShhLCBiLCBbXSwgW10pO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gYXJyYXksIHN0cmluZywgb3Igb2JqZWN0IGVtcHR5P1xuICAvLyBBbiBcImVtcHR5XCIgb2JqZWN0IGhhcyBubyBlbnVtZXJhYmxlIG93bi1wcm9wZXJ0aWVzLlxuICBfLmlzRW1wdHkgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiB0cnVlO1xuICAgIGlmIChfLmlzQXJyYXkob2JqKSB8fCBfLmlzU3RyaW5nKG9iaikpIHJldHVybiBvYmoubGVuZ3RoID09PSAwO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIGlmIChfLmhhcyhvYmosIGtleSkpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGEgRE9NIGVsZW1lbnQ/XG4gIF8uaXNFbGVtZW50ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuICEhKG9iaiAmJiBvYmoubm9kZVR5cGUgPT09IDEpO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgYW4gYXJyYXk/XG4gIC8vIERlbGVnYXRlcyB0byBFQ01BNSdzIG5hdGl2ZSBBcnJheS5pc0FycmF5XG4gIF8uaXNBcnJheSA9IG5hdGl2ZUlzQXJyYXkgfHwgZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIHRvU3RyaW5nLmNhbGwob2JqKSA9PSAnW29iamVjdCBBcnJheV0nO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFyaWFibGUgYW4gb2JqZWN0P1xuICBfLmlzT2JqZWN0ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PT0gT2JqZWN0KG9iaik7XG4gIH07XG5cbiAgLy8gQWRkIHNvbWUgaXNUeXBlIG1ldGhvZHM6IGlzQXJndW1lbnRzLCBpc0Z1bmN0aW9uLCBpc1N0cmluZywgaXNOdW1iZXIsIGlzRGF0ZSwgaXNSZWdFeHAuXG4gIGVhY2goWydBcmd1bWVudHMnLCAnRnVuY3Rpb24nLCAnU3RyaW5nJywgJ051bWJlcicsICdEYXRlJywgJ1JlZ0V4cCddLCBmdW5jdGlvbihuYW1lKSB7XG4gICAgX1snaXMnICsgbmFtZV0gPSBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiB0b1N0cmluZy5jYWxsKG9iaikgPT0gJ1tvYmplY3QgJyArIG5hbWUgKyAnXSc7XG4gICAgfTtcbiAgfSk7XG5cbiAgLy8gRGVmaW5lIGEgZmFsbGJhY2sgdmVyc2lvbiBvZiB0aGUgbWV0aG9kIGluIGJyb3dzZXJzIChhaGVtLCBJRSksIHdoZXJlXG4gIC8vIHRoZXJlIGlzbid0IGFueSBpbnNwZWN0YWJsZSBcIkFyZ3VtZW50c1wiIHR5cGUuXG4gIGlmICghXy5pc0FyZ3VtZW50cyhhcmd1bWVudHMpKSB7XG4gICAgXy5pc0FyZ3VtZW50cyA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuICEhKG9iaiAmJiBfLmhhcyhvYmosICdjYWxsZWUnKSk7XG4gICAgfTtcbiAgfVxuXG4gIC8vIE9wdGltaXplIGBpc0Z1bmN0aW9uYCBpZiBhcHByb3ByaWF0ZS5cbiAgaWYgKHR5cGVvZiAoLy4vKSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIF8uaXNGdW5jdGlvbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIHR5cGVvZiBvYmogPT09ICdmdW5jdGlvbic7XG4gICAgfTtcbiAgfVxuXG4gIC8vIElzIGEgZ2l2ZW4gb2JqZWN0IGEgZmluaXRlIG51bWJlcj9cbiAgXy5pc0Zpbml0ZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBpc0Zpbml0ZShvYmopICYmICFpc05hTihwYXJzZUZsb2F0KG9iaikpO1xuICB9O1xuXG4gIC8vIElzIHRoZSBnaXZlbiB2YWx1ZSBgTmFOYD8gKE5hTiBpcyB0aGUgb25seSBudW1iZXIgd2hpY2ggZG9lcyBub3QgZXF1YWwgaXRzZWxmKS5cbiAgXy5pc05hTiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBfLmlzTnVtYmVyKG9iaikgJiYgb2JqICE9ICtvYmo7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBhIGJvb2xlYW4/XG4gIF8uaXNCb29sZWFuID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PT0gdHJ1ZSB8fCBvYmogPT09IGZhbHNlIHx8IHRvU3RyaW5nLmNhbGwob2JqKSA9PSAnW29iamVjdCBCb29sZWFuXSc7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBlcXVhbCB0byBudWxsP1xuICBfLmlzTnVsbCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT09IG51bGw7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YXJpYWJsZSB1bmRlZmluZWQ/XG4gIF8uaXNVbmRlZmluZWQgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSB2b2lkIDA7XG4gIH07XG5cbiAgLy8gU2hvcnRjdXQgZnVuY3Rpb24gZm9yIGNoZWNraW5nIGlmIGFuIG9iamVjdCBoYXMgYSBnaXZlbiBwcm9wZXJ0eSBkaXJlY3RseVxuICAvLyBvbiBpdHNlbGYgKGluIG90aGVyIHdvcmRzLCBub3Qgb24gYSBwcm90b3R5cGUpLlxuICBfLmhhcyA9IGZ1bmN0aW9uKG9iaiwga2V5KSB7XG4gICAgcmV0dXJuIGhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpO1xuICB9O1xuXG4gIC8vIFV0aWxpdHkgRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gUnVuIFVuZGVyc2NvcmUuanMgaW4gKm5vQ29uZmxpY3QqIG1vZGUsIHJldHVybmluZyB0aGUgYF9gIHZhcmlhYmxlIHRvIGl0c1xuICAvLyBwcmV2aW91cyBvd25lci4gUmV0dXJucyBhIHJlZmVyZW5jZSB0byB0aGUgVW5kZXJzY29yZSBvYmplY3QuXG4gIF8ubm9Db25mbGljdCA9IGZ1bmN0aW9uKCkge1xuICAgIHJvb3QuXyA9IHByZXZpb3VzVW5kZXJzY29yZTtcbiAgICByZXR1cm4gdGhpcztcbiAgfTtcblxuICAvLyBLZWVwIHRoZSBpZGVudGl0eSBmdW5jdGlvbiBhcm91bmQgZm9yIGRlZmF1bHQgaXRlcmF0b3JzLlxuICBfLmlkZW50aXR5ID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH07XG5cbiAgLy8gUnVuIGEgZnVuY3Rpb24gKipuKiogdGltZXMuXG4gIF8udGltZXMgPSBmdW5jdGlvbihuLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIHZhciBhY2N1bSA9IEFycmF5KG4pO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgaSsrKSBhY2N1bVtpXSA9IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgaSk7XG4gICAgcmV0dXJuIGFjY3VtO1xuICB9O1xuXG4gIC8vIFJldHVybiBhIHJhbmRvbSBpbnRlZ2VyIGJldHdlZW4gbWluIGFuZCBtYXggKGluY2x1c2l2ZSkuXG4gIF8ucmFuZG9tID0gZnVuY3Rpb24obWluLCBtYXgpIHtcbiAgICBpZiAobWF4ID09IG51bGwpIHtcbiAgICAgIG1heCA9IG1pbjtcbiAgICAgIG1pbiA9IDA7XG4gICAgfVxuICAgIHJldHVybiBtaW4gKyBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAobWF4IC0gbWluICsgMSkpO1xuICB9O1xuXG4gIC8vIExpc3Qgb2YgSFRNTCBlbnRpdGllcyBmb3IgZXNjYXBpbmcuXG4gIHZhciBlbnRpdHlNYXAgPSB7XG4gICAgZXNjYXBlOiB7XG4gICAgICAnJic6ICcmYW1wOycsXG4gICAgICAnPCc6ICcmbHQ7JyxcbiAgICAgICc+JzogJyZndDsnLFxuICAgICAgJ1wiJzogJyZxdW90OycsXG4gICAgICBcIidcIjogJyYjeDI3OycsXG4gICAgICAnLyc6ICcmI3gyRjsnXG4gICAgfVxuICB9O1xuICBlbnRpdHlNYXAudW5lc2NhcGUgPSBfLmludmVydChlbnRpdHlNYXAuZXNjYXBlKTtcblxuICAvLyBSZWdleGVzIGNvbnRhaW5pbmcgdGhlIGtleXMgYW5kIHZhbHVlcyBsaXN0ZWQgaW1tZWRpYXRlbHkgYWJvdmUuXG4gIHZhciBlbnRpdHlSZWdleGVzID0ge1xuICAgIGVzY2FwZTogICBuZXcgUmVnRXhwKCdbJyArIF8ua2V5cyhlbnRpdHlNYXAuZXNjYXBlKS5qb2luKCcnKSArICddJywgJ2cnKSxcbiAgICB1bmVzY2FwZTogbmV3IFJlZ0V4cCgnKCcgKyBfLmtleXMoZW50aXR5TWFwLnVuZXNjYXBlKS5qb2luKCd8JykgKyAnKScsICdnJylcbiAgfTtcblxuICAvLyBGdW5jdGlvbnMgZm9yIGVzY2FwaW5nIGFuZCB1bmVzY2FwaW5nIHN0cmluZ3MgdG8vZnJvbSBIVE1MIGludGVycG9sYXRpb24uXG4gIF8uZWFjaChbJ2VzY2FwZScsICd1bmVzY2FwZSddLCBmdW5jdGlvbihtZXRob2QpIHtcbiAgICBfW21ldGhvZF0gPSBmdW5jdGlvbihzdHJpbmcpIHtcbiAgICAgIGlmIChzdHJpbmcgPT0gbnVsbCkgcmV0dXJuICcnO1xuICAgICAgcmV0dXJuICgnJyArIHN0cmluZykucmVwbGFjZShlbnRpdHlSZWdleGVzW21ldGhvZF0sIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICAgIHJldHVybiBlbnRpdHlNYXBbbWV0aG9kXVttYXRjaF07XG4gICAgICB9KTtcbiAgICB9O1xuICB9KTtcblxuICAvLyBJZiB0aGUgdmFsdWUgb2YgdGhlIG5hbWVkIHByb3BlcnR5IGlzIGEgZnVuY3Rpb24gdGhlbiBpbnZva2UgaXQ7XG4gIC8vIG90aGVyd2lzZSwgcmV0dXJuIGl0LlxuICBfLnJlc3VsdCA9IGZ1bmN0aW9uKG9iamVjdCwgcHJvcGVydHkpIHtcbiAgICBpZiAob2JqZWN0ID09IG51bGwpIHJldHVybiBudWxsO1xuICAgIHZhciB2YWx1ZSA9IG9iamVjdFtwcm9wZXJ0eV07XG4gICAgcmV0dXJuIF8uaXNGdW5jdGlvbih2YWx1ZSkgPyB2YWx1ZS5jYWxsKG9iamVjdCkgOiB2YWx1ZTtcbiAgfTtcblxuICAvLyBBZGQgeW91ciBvd24gY3VzdG9tIGZ1bmN0aW9ucyB0byB0aGUgVW5kZXJzY29yZSBvYmplY3QuXG4gIF8ubWl4aW4gPSBmdW5jdGlvbihvYmopIHtcbiAgICBlYWNoKF8uZnVuY3Rpb25zKG9iaiksIGZ1bmN0aW9uKG5hbWUpe1xuICAgICAgdmFyIGZ1bmMgPSBfW25hbWVdID0gb2JqW25hbWVdO1xuICAgICAgXy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBbdGhpcy5fd3JhcHBlZF07XG4gICAgICAgIHB1c2guYXBwbHkoYXJncywgYXJndW1lbnRzKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jYWxsKHRoaXMsIGZ1bmMuYXBwbHkoXywgYXJncykpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBHZW5lcmF0ZSBhIHVuaXF1ZSBpbnRlZ2VyIGlkICh1bmlxdWUgd2l0aGluIHRoZSBlbnRpcmUgY2xpZW50IHNlc3Npb24pLlxuICAvLyBVc2VmdWwgZm9yIHRlbXBvcmFyeSBET00gaWRzLlxuICB2YXIgaWRDb3VudGVyID0gMDtcbiAgXy51bmlxdWVJZCA9IGZ1bmN0aW9uKHByZWZpeCkge1xuICAgIHZhciBpZCA9ICsraWRDb3VudGVyICsgJyc7XG4gICAgcmV0dXJuIHByZWZpeCA/IHByZWZpeCArIGlkIDogaWQ7XG4gIH07XG5cbiAgLy8gQnkgZGVmYXVsdCwgVW5kZXJzY29yZSB1c2VzIEVSQi1zdHlsZSB0ZW1wbGF0ZSBkZWxpbWl0ZXJzLCBjaGFuZ2UgdGhlXG4gIC8vIGZvbGxvd2luZyB0ZW1wbGF0ZSBzZXR0aW5ncyB0byB1c2UgYWx0ZXJuYXRpdmUgZGVsaW1pdGVycy5cbiAgXy50ZW1wbGF0ZVNldHRpbmdzID0ge1xuICAgIGV2YWx1YXRlICAgIDogLzwlKFtcXHNcXFNdKz8pJT4vZyxcbiAgICBpbnRlcnBvbGF0ZSA6IC88JT0oW1xcc1xcU10rPyklPi9nLFxuICAgIGVzY2FwZSAgICAgIDogLzwlLShbXFxzXFxTXSs/KSU+L2dcbiAgfTtcblxuICAvLyBXaGVuIGN1c3RvbWl6aW5nIGB0ZW1wbGF0ZVNldHRpbmdzYCwgaWYgeW91IGRvbid0IHdhbnQgdG8gZGVmaW5lIGFuXG4gIC8vIGludGVycG9sYXRpb24sIGV2YWx1YXRpb24gb3IgZXNjYXBpbmcgcmVnZXgsIHdlIG5lZWQgb25lIHRoYXQgaXNcbiAgLy8gZ3VhcmFudGVlZCBub3QgdG8gbWF0Y2guXG4gIHZhciBub01hdGNoID0gLyguKV4vO1xuXG4gIC8vIENlcnRhaW4gY2hhcmFjdGVycyBuZWVkIHRvIGJlIGVzY2FwZWQgc28gdGhhdCB0aGV5IGNhbiBiZSBwdXQgaW50byBhXG4gIC8vIHN0cmluZyBsaXRlcmFsLlxuICB2YXIgZXNjYXBlcyA9IHtcbiAgICBcIidcIjogICAgICBcIidcIixcbiAgICAnXFxcXCc6ICAgICAnXFxcXCcsXG4gICAgJ1xccic6ICAgICAncicsXG4gICAgJ1xcbic6ICAgICAnbicsXG4gICAgJ1xcdCc6ICAgICAndCcsXG4gICAgJ1xcdTIwMjgnOiAndTIwMjgnLFxuICAgICdcXHUyMDI5JzogJ3UyMDI5J1xuICB9O1xuXG4gIHZhciBlc2NhcGVyID0gL1xcXFx8J3xcXHJ8XFxufFxcdHxcXHUyMDI4fFxcdTIwMjkvZztcblxuICAvLyBKYXZhU2NyaXB0IG1pY3JvLXRlbXBsYXRpbmcsIHNpbWlsYXIgdG8gSm9obiBSZXNpZydzIGltcGxlbWVudGF0aW9uLlxuICAvLyBVbmRlcnNjb3JlIHRlbXBsYXRpbmcgaGFuZGxlcyBhcmJpdHJhcnkgZGVsaW1pdGVycywgcHJlc2VydmVzIHdoaXRlc3BhY2UsXG4gIC8vIGFuZCBjb3JyZWN0bHkgZXNjYXBlcyBxdW90ZXMgd2l0aGluIGludGVycG9sYXRlZCBjb2RlLlxuICBfLnRlbXBsYXRlID0gZnVuY3Rpb24odGV4dCwgZGF0YSwgc2V0dGluZ3MpIHtcbiAgICB2YXIgcmVuZGVyO1xuICAgIHNldHRpbmdzID0gXy5kZWZhdWx0cyh7fSwgc2V0dGluZ3MsIF8udGVtcGxhdGVTZXR0aW5ncyk7XG5cbiAgICAvLyBDb21iaW5lIGRlbGltaXRlcnMgaW50byBvbmUgcmVndWxhciBleHByZXNzaW9uIHZpYSBhbHRlcm5hdGlvbi5cbiAgICB2YXIgbWF0Y2hlciA9IG5ldyBSZWdFeHAoW1xuICAgICAgKHNldHRpbmdzLmVzY2FwZSB8fCBub01hdGNoKS5zb3VyY2UsXG4gICAgICAoc2V0dGluZ3MuaW50ZXJwb2xhdGUgfHwgbm9NYXRjaCkuc291cmNlLFxuICAgICAgKHNldHRpbmdzLmV2YWx1YXRlIHx8IG5vTWF0Y2gpLnNvdXJjZVxuICAgIF0uam9pbignfCcpICsgJ3wkJywgJ2cnKTtcblxuICAgIC8vIENvbXBpbGUgdGhlIHRlbXBsYXRlIHNvdXJjZSwgZXNjYXBpbmcgc3RyaW5nIGxpdGVyYWxzIGFwcHJvcHJpYXRlbHkuXG4gICAgdmFyIGluZGV4ID0gMDtcbiAgICB2YXIgc291cmNlID0gXCJfX3ArPSdcIjtcbiAgICB0ZXh0LnJlcGxhY2UobWF0Y2hlciwgZnVuY3Rpb24obWF0Y2gsIGVzY2FwZSwgaW50ZXJwb2xhdGUsIGV2YWx1YXRlLCBvZmZzZXQpIHtcbiAgICAgIHNvdXJjZSArPSB0ZXh0LnNsaWNlKGluZGV4LCBvZmZzZXQpXG4gICAgICAgIC5yZXBsYWNlKGVzY2FwZXIsIGZ1bmN0aW9uKG1hdGNoKSB7IHJldHVybiAnXFxcXCcgKyBlc2NhcGVzW21hdGNoXTsgfSk7XG5cbiAgICAgIGlmIChlc2NhcGUpIHtcbiAgICAgICAgc291cmNlICs9IFwiJytcXG4oKF9fdD0oXCIgKyBlc2NhcGUgKyBcIikpPT1udWxsPycnOl8uZXNjYXBlKF9fdCkpK1xcbidcIjtcbiAgICAgIH1cbiAgICAgIGlmIChpbnRlcnBvbGF0ZSkge1xuICAgICAgICBzb3VyY2UgKz0gXCInK1xcbigoX190PShcIiArIGludGVycG9sYXRlICsgXCIpKT09bnVsbD8nJzpfX3QpK1xcbidcIjtcbiAgICAgIH1cbiAgICAgIGlmIChldmFsdWF0ZSkge1xuICAgICAgICBzb3VyY2UgKz0gXCInO1xcblwiICsgZXZhbHVhdGUgKyBcIlxcbl9fcCs9J1wiO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBvZmZzZXQgKyBtYXRjaC5sZW5ndGg7XG4gICAgICByZXR1cm4gbWF0Y2g7XG4gICAgfSk7XG4gICAgc291cmNlICs9IFwiJztcXG5cIjtcblxuICAgIC8vIElmIGEgdmFyaWFibGUgaXMgbm90IHNwZWNpZmllZCwgcGxhY2UgZGF0YSB2YWx1ZXMgaW4gbG9jYWwgc2NvcGUuXG4gICAgaWYgKCFzZXR0aW5ncy52YXJpYWJsZSkgc291cmNlID0gJ3dpdGgob2JqfHx7fSl7XFxuJyArIHNvdXJjZSArICd9XFxuJztcblxuICAgIHNvdXJjZSA9IFwidmFyIF9fdCxfX3A9JycsX19qPUFycmF5LnByb3RvdHlwZS5qb2luLFwiICtcbiAgICAgIFwicHJpbnQ9ZnVuY3Rpb24oKXtfX3ArPV9fai5jYWxsKGFyZ3VtZW50cywnJyk7fTtcXG5cIiArXG4gICAgICBzb3VyY2UgKyBcInJldHVybiBfX3A7XFxuXCI7XG5cbiAgICB0cnkge1xuICAgICAgcmVuZGVyID0gbmV3IEZ1bmN0aW9uKHNldHRpbmdzLnZhcmlhYmxlIHx8ICdvYmonLCAnXycsIHNvdXJjZSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgZS5zb3VyY2UgPSBzb3VyY2U7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cblxuICAgIGlmIChkYXRhKSByZXR1cm4gcmVuZGVyKGRhdGEsIF8pO1xuICAgIHZhciB0ZW1wbGF0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgIHJldHVybiByZW5kZXIuY2FsbCh0aGlzLCBkYXRhLCBfKTtcbiAgICB9O1xuXG4gICAgLy8gUHJvdmlkZSB0aGUgY29tcGlsZWQgZnVuY3Rpb24gc291cmNlIGFzIGEgY29udmVuaWVuY2UgZm9yIHByZWNvbXBpbGF0aW9uLlxuICAgIHRlbXBsYXRlLnNvdXJjZSA9ICdmdW5jdGlvbignICsgKHNldHRpbmdzLnZhcmlhYmxlIHx8ICdvYmonKSArICcpe1xcbicgKyBzb3VyY2UgKyAnfSc7XG5cbiAgICByZXR1cm4gdGVtcGxhdGU7XG4gIH07XG5cbiAgLy8gQWRkIGEgXCJjaGFpblwiIGZ1bmN0aW9uLCB3aGljaCB3aWxsIGRlbGVnYXRlIHRvIHRoZSB3cmFwcGVyLlxuICBfLmNoYWluID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIF8ob2JqKS5jaGFpbigpO1xuICB9O1xuXG4gIC8vIE9PUFxuICAvLyAtLS0tLS0tLS0tLS0tLS1cbiAgLy8gSWYgVW5kZXJzY29yZSBpcyBjYWxsZWQgYXMgYSBmdW5jdGlvbiwgaXQgcmV0dXJucyBhIHdyYXBwZWQgb2JqZWN0IHRoYXRcbiAgLy8gY2FuIGJlIHVzZWQgT08tc3R5bGUuIFRoaXMgd3JhcHBlciBob2xkcyBhbHRlcmVkIHZlcnNpb25zIG9mIGFsbCB0aGVcbiAgLy8gdW5kZXJzY29yZSBmdW5jdGlvbnMuIFdyYXBwZWQgb2JqZWN0cyBtYXkgYmUgY2hhaW5lZC5cblxuICAvLyBIZWxwZXIgZnVuY3Rpb24gdG8gY29udGludWUgY2hhaW5pbmcgaW50ZXJtZWRpYXRlIHJlc3VsdHMuXG4gIHZhciByZXN1bHQgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gdGhpcy5fY2hhaW4gPyBfKG9iaikuY2hhaW4oKSA6IG9iajtcbiAgfTtcblxuICAvLyBBZGQgYWxsIG9mIHRoZSBVbmRlcnNjb3JlIGZ1bmN0aW9ucyB0byB0aGUgd3JhcHBlciBvYmplY3QuXG4gIF8ubWl4aW4oXyk7XG5cbiAgLy8gQWRkIGFsbCBtdXRhdG9yIEFycmF5IGZ1bmN0aW9ucyB0byB0aGUgd3JhcHBlci5cbiAgZWFjaChbJ3BvcCcsICdwdXNoJywgJ3JldmVyc2UnLCAnc2hpZnQnLCAnc29ydCcsICdzcGxpY2UnLCAndW5zaGlmdCddLCBmdW5jdGlvbihuYW1lKSB7XG4gICAgdmFyIG1ldGhvZCA9IEFycmF5UHJvdG9bbmFtZV07XG4gICAgXy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBvYmogPSB0aGlzLl93cmFwcGVkO1xuICAgICAgbWV0aG9kLmFwcGx5KG9iaiwgYXJndW1lbnRzKTtcbiAgICAgIGlmICgobmFtZSA9PSAnc2hpZnQnIHx8IG5hbWUgPT0gJ3NwbGljZScpICYmIG9iai5sZW5ndGggPT09IDApIGRlbGV0ZSBvYmpbMF07XG4gICAgICByZXR1cm4gcmVzdWx0LmNhbGwodGhpcywgb2JqKTtcbiAgICB9O1xuICB9KTtcblxuICAvLyBBZGQgYWxsIGFjY2Vzc29yIEFycmF5IGZ1bmN0aW9ucyB0byB0aGUgd3JhcHBlci5cbiAgZWFjaChbJ2NvbmNhdCcsICdqb2luJywgJ3NsaWNlJ10sIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICB2YXIgbWV0aG9kID0gQXJyYXlQcm90b1tuYW1lXTtcbiAgICBfLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHJlc3VsdC5jYWxsKHRoaXMsIG1ldGhvZC5hcHBseSh0aGlzLl93cmFwcGVkLCBhcmd1bWVudHMpKTtcbiAgICB9O1xuICB9KTtcblxuICBfLmV4dGVuZChfLnByb3RvdHlwZSwge1xuXG4gICAgLy8gU3RhcnQgY2hhaW5pbmcgYSB3cmFwcGVkIFVuZGVyc2NvcmUgb2JqZWN0LlxuICAgIGNoYWluOiBmdW5jdGlvbigpIHtcbiAgICAgIHRoaXMuX2NoYWluID0gdHJ1ZTtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICAvLyBFeHRyYWN0cyB0aGUgcmVzdWx0IGZyb20gYSB3cmFwcGVkIGFuZCBjaGFpbmVkIG9iamVjdC5cbiAgICB2YWx1ZTogZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gdGhpcy5fd3JhcHBlZDtcbiAgICB9XG5cbiAgfSk7XG5cbn0pLmNhbGwodGhpcyk7XG5cbn0pKCkiLCJ2YXIgcnggPSByZXF1aXJlKCdyeGpzJyk7XG52YXIgcm91dGllID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvcm91dGllJyk7XG52YXIgcGxheWVyID0gcmVxdWlyZSgnLi4vcGxheWVyJyk7XG52YXIgdmlldyA9IHJlcXVpcmUoJy4uLy4uL3ZpZXdzL3dhaXQuaGJzJyk7XG5yZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9yeC56ZXB0bycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICBcbiAgaWYgKHBsYXllci5nZXQoKS5pZCA9PSB1bmRlZmluZWQpIHtcbiAgICByb3V0aWUubmF2aWdhdGUoJy9jb25uZWN0Jyk7XG4gIH1cbiAgXG4gICQoJyNwYWdlJykuYXR0cignY2xhc3MnLCAnd2FpdCcpO1xuICAkKCcjcGFnZScpLmh0bWwodmlldygpKTtcblxuICB2YXIgb2JzZXJ2YWJsZSA9IHJ4Lk9ic2VydmFibGVcbiAgICAuaW50ZXJ2YWwoMzAwMClcbiAgICAuc3RhcnRXaXRoKC0xKVxuICAgIC5zZWxlY3RNYW55KG9ic2VydmFibGVMb2JieSlcbiAgICAuc2tpcFdoaWxlKGdhbWVJblByb2dyZXNzKVxuICAgIC50YWtlKDEpXG4gICAgLnN1YnNjcmliZShzd2l0Y2hTdGF0ZSwgb25FcnJvcik7XG5cbn07XG5cbmZ1bmN0aW9uIG9ic2VydmFibGVMb2JieSgpIHtcbiAgcmV0dXJuICQuZ2V0SlNPTkFzT2JzZXJ2YWJsZSgnL2dhbWUvc3RhdHVzJyk7XG59XG5cbmZ1bmN0aW9uIGdhbWVJblByb2dyZXNzKHJlcykge1xuICByZXR1cm4gcmVzLmRhdGEuaW5Qcm9ncmVzcyA9PT0gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gc3dpdGNoU3RhdGUoKSB7XG4gIHJvdXRpZS5uYXZpZ2F0ZSgnL2pvaW4nKTtcbn1cblxuZnVuY3Rpb24gb25FcnJvcigpIHtcbiAgY29uc29sZS5sb2coJ0dhbWUgbm90IHJlc3BvbmRpbmcnKTtcbn1cbiIsInZhciByeCA9IHJlcXVpcmUoJ3J4anMnKTtcbnZhciByb3V0aWUgPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9yb3V0aWUnKTtcbnZhciBwbGF5ZXIgPSByZXF1aXJlKCcuLi9wbGF5ZXInKTtcbnZhciB2aWV3ID0gcmVxdWlyZSgnLi4vLi4vdmlld3MvZ2FtZXBhZC5oYnMnKTtcbnZhciBvYnNlcnZhYmxlID0gbnVsbDtcbnZhciBzb2NrZXQgPSBudWxsXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG5cbiAgaWYgKHBsYXllci5nZXQoKS5pZCA9PSB1bmRlZmluZWQpIHtcbiAgICByb3V0aWUubmF2aWdhdGUoJy9jb25uZWN0Jyk7XG4gIH1cblxuICBzb2NrZXQgPSBpby5jb25uZWN0KCcvJylcbiAgXG4gICQoJyNwYWdlJykuYXR0cignY2xhc3MnLCAnZ2FtZXBhZCcpO1xuICAkKCcjcGFnZScpLmh0bWwodmlldygpKTtcblxuICBvYnNlcnZhYmxlID0gcnguT2JzZXJ2YWJsZVxuICAgIC5pbnRlcnZhbCgyMDAwKVxuICAgIC5zdGFydFdpdGgoLTEpXG4gICAgLnNlbGVjdE1hbnkob2JzZXJ2YWJsZUdhbWUpXG4gICAgLnN1YnNjcmliZShjaGVja0dhbWVTdGF0dXMsIG9uRXJyb3IpO1xuXG4gIGlmICgnb250b3VjaHN0YXJ0JyBpbiB3aW5kb3cpIHtcbiAgICAkKCcuYnV0dG9uLnVwJykub24oJ3RvdWNoc3RhcnQnLCBnb1VwKTtcbiAgICAkKCcuYnV0dG9uLnVwJykub24oJ3RvdWNoZW5kJywgc3RvcCk7XG4gICAgJCgnLmJ1dHRvbi5kb3duJykub24oJ3RvdWNoc3RhcnQnLCBnb0Rvd24pO1xuICAgICQoJy5idXR0b24uZG93bicpLm9uKCd0b3VjaGVuZCcsIHN0b3ApO1xuICB9IGVsc2Uge1xuICAgICQoJy5idXR0b24udXAnKS5vbignbW91c2Vkb3duJywgZ29VcCk7XG4gICAgJCgnLmJ1dHRvbi51cCcpLm9uKCdtb3VzZXVwJywgc3RvcCk7XG4gICAgJCgnLmJ1dHRvbi5kb3duJykub24oJ21vdXNlZG93bicsIGdvRG93bik7XG4gICAgJCgnLmJ1dHRvbi5kb3duJykub24oJ21vdXNldXAnLCBzdG9wKTtcbiAgfVxuICBcbn07XG5cbmZ1bmN0aW9uIGdvVXAoZSkge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICQoZS5jdXJyZW50VGFyZ2V0KS5hZGRDbGFzcygncHJlc3NlZCcpO1xuICBzZW5kQWN0aW9uKCd1cCcpO1xufVxuXG5mdW5jdGlvbiBnb0Rvd24oZSkge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICQoZS5jdXJyZW50VGFyZ2V0KS5hZGRDbGFzcygncHJlc3NlZCcpO1xuICBzZW5kQWN0aW9uKCdkb3duJyk7XG59XG5cbmZ1bmN0aW9uIHN0b3AoZSkge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICQoZS5jdXJyZW50VGFyZ2V0KS5yZW1vdmVDbGFzcygncHJlc3NlZCcpO1xufVxuXG5mdW5jdGlvbiBzZW5kQWN0aW9uKGFjdGlvbk5hbWUpIHtcbiAgc29ja2V0LmVtaXQoJ21vdmUnLCB7IHBsYXllcjogcGxheWVyLmdldCgpLmlkLCBhY3Rpb246IGFjdGlvbk5hbWUgfSlcbn1cblxuZnVuY3Rpb24gb2JzZXJ2YWJsZUdhbWUoKSB7XG4gIHJldHVybiAkLmdldEpTT05Bc09ic2VydmFibGUoJy9nYW1lL3N0YXR1cycpO1xufVxuXG5mdW5jdGlvbiBjaGVja0dhbWVTdGF0dXMocmVzKSB7XG4gIGlmIChyZXMuZGF0YS5pblByb2dyZXNzKSB7XG4gICAgdmFyIGlkeCA9IGN1cnJlbnRQbGF5ZXJJbmRleChyZXMuZGF0YS5wbGF5ZXJzKTtcbiAgICBpZiAoaWR4ID09PSBudWxsKSB7XG4gICAgICBvYnNlcnZhYmxlLmRpc3Bvc2UoKTtcbiAgICAgIHJvdXRpZS5uYXZpZ2F0ZSgnL3dhaXQnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgJCgnI3BhZ2UgLnBsYXllcicpLmFkZENsYXNzKCdwJyArIChpZHgrMSkpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBvYnNlcnZhYmxlLmRpc3Bvc2UoKTtcbiAgICByb3V0aWUubmF2aWdhdGUoJy9qb2luJyk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY3VycmVudFBsYXllckluZGV4KHBsYXllcnMpIHtcbiAgaWYgKHBsYXllcnNbMF0uaWQgPT09IHBsYXllci5nZXQoKS5pZCkgcmV0dXJuIDA7XG4gIGlmIChwbGF5ZXJzWzFdLmlkID09PSBwbGF5ZXIuZ2V0KCkuaWQpIHJldHVybiAxO1xuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gb25FcnJvcigpIHtcbiAgY29uc29sZS5sb2coJ0dhbWUgbm90IHJlc3BvbmRpbmcnKTtcbn1cbiIsInZhciByeCA9IHJlcXVpcmUoJ3J4anMnKTtcbnZhciByb3V0aWUgPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9yb3V0aWUnKTtcbnZhciBwbGF5ZXIgPSByZXF1aXJlKCcuLi9wbGF5ZXInKTtcbnZhciB2aWV3ID0gcmVxdWlyZSgnLi4vLi4vdmlld3MvbG9iYnkuaGJzJyk7XG5yZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9yeC56ZXB0bycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICBcbiAgaWYgKHBsYXllci5nZXQoKS5pZCA9PSB1bmRlZmluZWQpIHtcbiAgICByb3V0aWUubmF2aWdhdGUoJy9jb25uZWN0Jyk7XG4gIH1cbiAgXG4gICQoJyNwYWdlJykuYXR0cignY2xhc3MnLCAnbG9iYnknKTtcbiAgJCgnI3BhZ2UnKS5odG1sKHZpZXcoKSk7XG4gICQoJyNjYW5jZWwnKS5vbignY2xpY2snLCBleGl0TG9iYnkpO1xuXG4gIHZhciBvYnNlcnZhYmxlID0gcnguT2JzZXJ2YWJsZVxuICAgIC5pbnRlcnZhbCgxMDAwKVxuICAgIC5zdGFydFdpdGgoLTEpXG4gICAgLnNlbGVjdE1hbnkob2JzZXJ2YWJsZUxvYmJ5KVxuICAgIC5za2lwV2hpbGUod2FpdGluZ0Zvck90aGVyUGxheWVyKVxuICAgIC50YWtlKDEpXG4gICAgLnN1YnNjcmliZShzdGFydE1hdGNoLCBvbkVycm9yKTtcblxufTtcblxuZnVuY3Rpb24gb2JzZXJ2YWJsZUxvYmJ5KCkge1xuICByZXR1cm4gJC5nZXRKU09OQXNPYnNlcnZhYmxlKCcvZ2FtZS9zdGF0dXMnKTtcbn1cblxuZnVuY3Rpb24gd2FpdGluZ0Zvck90aGVyUGxheWVyKHJlcykge1xuICByZXR1cm4gcmVzLmRhdGEuaW5Qcm9ncmVzcyA9PT0gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIHN0YXJ0TWF0Y2goKSB7XG4gIHJvdXRpZS5uYXZpZ2F0ZSgnL2dhbWVwYWQnKTtcbn1cblxuZnVuY3Rpb24gb25FcnJvcigpIHtcbiAgY29uc29sZS5sb2coJ0dhbWUgbm90IHJlc3BvbmRpbmcnKTtcbn1cblxuZnVuY3Rpb24gZXhpdExvYmJ5KCkge1xuICAkLmFqYXgoe1xuICAgIHR5cGU6ICdERUxFVEUnLFxuICAgIHVybDogJy9nYW1lL3BsYXllcnMvJyArIHBsYXllci5nZXQoKS5pZFxuICB9KS50aGVuKGJhY2tUb1dhaXQpO1xufVxuXG5mdW5jdGlvbiBiYWNrVG9XYWl0KCkge1xuICByb3V0aWUubmF2aWdhdGUoJy93YWl0Jyk7XG59XG4iLCIoZnVuY3Rpb24oKXsvLyBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBPcGVuIFRlY2hub2xvZ2llcywgSW5jLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbihmdW5jdGlvbiAocm9vdCwgZmFjdG9yeSkge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeShyb290LCBtb2R1bGUuZXhwb3J0cywgcmVxdWlyZSgncnhqcycpLCAkKTtcbn0odGhpcywgZnVuY3Rpb24gKGdsb2JhbCwgZXhwLCByb290LCAkLCB1bmRlZmluZWQpIHtcbiAgICAgICAgLy8gSGVhZGVyc1xuICAgIHZhciByb290ID0gZ2xvYmFsLlJ4LFxuICAgICAgICBvYnNlcnZhYmxlID0gcm9vdC5PYnNlcnZhYmxlLFxuICAgICAgICBvYnNlcnZhYmxlUHJvdG8gPSBvYnNlcnZhYmxlLnByb3RvdHlwZSxcbiAgICAgICAgQXN5bmNTdWJqZWN0ID0gcm9vdC5Bc3luY1N1YmplY3QsXG4gICAgICAgIG9ic2VydmFibGVDcmVhdGUgPSBvYnNlcnZhYmxlLmNyZWF0ZSxcbiAgICAgICAgb2JzZXJ2YWJsZUNyZWF0ZVdpdGhEaXNwb3NhYmxlID0gb2JzZXJ2YWJsZS5jcmVhdGVXaXRoRGlzcG9zYWJsZSxcbiAgICAgICAgZGlzcG9zYWJsZUVtcHR5ID0gcm9vdC5EaXNwb3NhYmxlLmVtcHR5LFxuICAgICAgICBzbGljZSA9IEFycmF5LnByb3RvdHlwZS5zbGljZSxcbiAgICAgICAgcHJvdG8gPSAkLmZuO1xuICAgICAgICBcbiAgICAkLkRlZmVycmVkLnByb3RvdHlwZS50b09ic2VydmFibGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzdWJqZWN0ID0gbmV3IEFzeW5jU3ViamVjdCgpO1xuICAgICAgICB0aGlzLmRvbmUoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc3ViamVjdC5vbk5leHQoc2xpY2UuY2FsbChhcmd1bWVudHMpKTtcbiAgICAgICAgICAgIHN1YmplY3Qub25Db21wbGV0ZWQoKTtcbiAgICAgICAgfSkuZmFpbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzdWJqZWN0Lm9uRXJyb3Ioc2xpY2UuY2FsbChhcmd1bWVudHMpKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBzdWJqZWN0O1xuICAgIH07XG5cbiAgICBvYnNlcnZhYmxlUHJvdG8udG9EZWZlcnJlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gJC5EZWZlcnJlZCgpO1xuICAgICAgICB0aGlzLnN1YnNjcmliZShmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodmFsdWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZSkgeyBcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZDtcbiAgICB9O1xuXG4gICAgdmFyIGFqYXhBc09ic2VydmFibGUgPSAkLmFqYXhBc09ic2VydmFibGUgPSBmdW5jdGlvbihzZXR0aW5ncykge1xuICAgICAgICB2YXIgc3ViamVjdCA9IG5ldyBBc3luY1N1YmplY3QoKTtcblxuICAgICAgICB2YXIgaW50ZXJuYWxTZXR0aW5ncyA9IHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZ1bmN0aW9uKGRhdGEsIHRleHRTdGF0dXMsIGpxWEhSKSB7XG4gICAgICAgICAgICAgICAgc3ViamVjdC5vbk5leHQoeyBkYXRhOiBkYXRhLCB0ZXh0U3RhdHVzOiB0ZXh0U3RhdHVzLCBqcVhIUjoganFYSFIgfSk7XG4gICAgICAgICAgICAgICAgc3ViamVjdC5vbkNvbXBsZXRlZCgpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGVycm9yOiBmdW5jdGlvbihqcVhIUiwgdGV4dFN0YXR1cywgZXJyb3JUaHJvd24pIHtcbiAgICAgICAgICAgICAgICBzdWJqZWN0Lm9uRXJyb3IoeyBqcVhIUjoganFYSFIsIHRleHRTdGF0dXM6IHRleHRTdGF0dXMsIGVycm9yVGhyb3duOiBlcnJvclRocm93biB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgXG4gICAgICAgICQuZXh0ZW5kKHRydWUsIGludGVybmFsU2V0dGluZ3MsIHNldHRpbmdzKTtcblxuICAgICAgICAkLmFqYXgoaW50ZXJuYWxTZXR0aW5ncyk7XG5cbiAgICAgICAgcmV0dXJuIHN1YmplY3Q7XG4gICAgfTtcblxuICAgICQuZ2V0QXNPYnNlcnZhYmxlID0gZnVuY3Rpb24odXJsLCBkYXRhLCBkYXRhVHlwZSkge1xuICAgICAgICByZXR1cm4gYWpheEFzT2JzZXJ2YWJsZSh7IHVybDogdXJsLCBkYXRhVHlwZTogZGF0YVR5cGUsIGRhdGE6IGRhdGEgfSk7XG4gICAgfTtcblxuICAgICQuZ2V0SlNPTkFzT2JzZXJ2YWJsZSA9IGZ1bmN0aW9uKHVybCwgZGF0YSkge1xuICAgICAgICByZXR1cm4gYWpheEFzT2JzZXJ2YWJsZSh7IHVybDogdXJsLCBkYXRhVHlwZTogJ2pzb24nLCBkYXRhOiBkYXRhIH0pO1xuICAgIH07XG5cblxuICAgICQucG9zdEFzT2JzZXJ2YWJsZSA9IGZ1bmN0aW9uKHVybCwgZGF0YSwgZGF0YVR5cGUpIHtcbiAgICAgICAgcmV0dXJuIGFqYXhBc09ic2VydmFibGUoeyB1cmw6IHVybCwgZGF0YVR5cGU6IGRhdGFUeXBlLCBkYXRhOiBkYXRhLCB0eXBlOiAnUE9TVCd9KTtcdFxuICAgIH07XG5cbiAgICByZXR1cm4gcm9vdDtcblxufSkpO1xuXG59KSgpIiwidmFyIEhhbmRsZWJhcnMgPSByZXF1aXJlKCdoYW5kbGViYXJzLXJ1bnRpbWUnKTtcbm1vZHVsZS5leHBvcnRzID0gSGFuZGxlYmFycy50ZW1wbGF0ZShmdW5jdGlvbiAoSGFuZGxlYmFycyxkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gIHRoaXMuY29tcGlsZXJJbmZvID0gWzQsJz49IDEuMC4wJ107XG5oZWxwZXJzID0gdGhpcy5tZXJnZShoZWxwZXJzLCBIYW5kbGViYXJzLmhlbHBlcnMpOyBkYXRhID0gZGF0YSB8fCB7fTtcbiAgXG5cblxuICByZXR1cm4gXCJcXG48aDE+UmVnaXN0ZXIgVG8gUGxheTwvaDE+XFxuXFxuPGZvcm0+XFxuICBcXG4gIDxkaXYgY2xhc3M9XFxcImZpZWxkXFxcIj5cXG4gICAgPGxhYmVsPkZpcnN0IG5hbWU8L2xhYmVsPlxcbiAgICA8aW5wdXQgaWQ9XFxcImZpcnN0TmFtZVxcXCIgdHlwZT1cXFwidGV4dFxcXCIgdmFsdWU9XFxcIlxcXCIgYXV0b2NvcnJlY3Q9XFxcIm9mZlxcXCIgLz5cXG4gIDwvZGl2PlxcbiAgXFxuICA8ZGl2IGNsYXNzPVxcXCJmaWVsZFxcXCI+XFxuICAgIDxsYWJlbD5MYXN0IG5hbWU8L2xhYmVsPlxcbiAgICA8aW5wdXQgaWQ9XFxcImxhc3ROYW1lXFxcIiB0eXBlPVxcXCJ0ZXh0XFxcIiB2YWx1ZT1cXFwiXFxcIiBhdXRvY29ycmVjdD1cXFwib2ZmXFxcIiAvPlxcbiAgPC9kaXY+XFxuXFxuICA8ZGl2IGNsYXNzPVxcXCJmaWVsZFxcXCI+XFxuICAgIDxsYWJlbD5FbWFpbDwvbGFiZWw+XFxuICAgIDxpbnB1dCBpZD1cXFwiZW1haWxcXFwiIHR5cGU9XFxcImVtYWlsXFxcIiB2YWx1ZT1cXFwiXFxcIiBhdXRvY29ycmVjdD1cXFwib2ZmXFxcIiAvPlxcbiAgPC9kaXY+XFxuICBcXG4gIDxkaXYgY2xhc3M9XFxcImZpZWxkXFxcIj5cXG4gICAgPGxhYmVsPkNvbXBhbnk8L2xhYmVsPlxcbiAgICA8aW5wdXQgaWQ9XFxcImNvbXBhbnlcXFwiIHR5cGU9XFxcInRleHRcXFwiIHZhbHVlPVxcXCJcXFwiIGF1dG9jb3JyZWN0PVxcXCJvZmZcXFwiIC8+XFxuICA8L2Rpdj5cXG4gIFxcbiAgPGRpdiBjbGFzcz1cXFwiZmllbGRcXFwiPlxcbiAgICA8bGFiZWw+Um9sZTwvbGFiZWw+XFxuXHQ8c2VsZWN0IHJlcXVpcmVkIGlkPVxcXCJyb2xlXFxcIj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNlbGVjdCBSb2xlXFxcIiBzZWxlY3RlZD5TZWxlY3QgUm9sZTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQy1MZXZlbCBFeGVjdXRpdmVcXFwiPkMtTGV2ZWwgRXhlY3V0aXZlPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJWUCBvciBEaXJlY3RvclxcXCI+VlAgb3IgRGlyZWN0b3I8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1hbmFnZXJcXFwiPk1hbmFnZXI8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlByb2plY3QgTWFuYWdlclxcXCI+UHJvamVjdCBNYW5hZ2VyPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJUZWFtIExlYWRcXFwiPlRlYW0gTGVhZDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQXJjaGl0ZWN0XFxcIj5BcmNoaXRlY3Q8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkRldmVsb3BlclxcXCI+RGV2ZWxvcGVyPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJDb25zdWx0YW50XFxcIj5Db25zdWx0YW50PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTdHVkZW50XFxcIj5TdHVkZW50PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJQcmVzcy9BbmFseXN0XFxcIj5QcmVzcy9BbmFseXN0PC9vcHRpb24+XFxuXHQ8L3NlbGVjdD5cXG4gIDwvZGl2PlxcblxcbiAgPGRpdiBjbGFzcz1cXFwiZmllbGRcXFwiPlxcbiAgICA8bGFiZWw+Q291bnRyeTwvbGFiZWw+XFxuXHQ8c2VsZWN0IHJlcXVpcmVkIGlkPVxcXCJjb3VudHJ5XFxcIj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNlbGVjdCBDb3VudHJ5XFxcIiBzZWxlY3RlZD5TZWxlY3QgQ291bnRyeTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiREtcXFwiPkRlbm1hcms8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkdCXFxcIj5Vbml0ZWQgS2luZ2RvbTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQUxcXFwiPkFsYmFuaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkFEXFxcIj5BbmRvcnJhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBVFxcXCI+QXVzdHJpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQllcXFwiPkJlbGFydXM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJFXFxcIj5CZWxnaXVtPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCQVxcXCI+Qm9zbmlhIGFuZCBIZXJ6ZWdvdmluYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQkdcXFwiPkJ1bGdhcmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJIUlxcXCI+Q3JvYXRpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQ1lcXFwiPkN5cHJ1czwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQ1pcXFwiPkN6ZWNoIFJlcHVibGljPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJFRVxcXCI+RXN0b25pYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiRklcXFwiPkZpbmxhbmQ8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkZSXFxcIj5GcmFuY2U8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkRFXFxcIj5HZXJtYW55PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHUlxcXCI+R3JlZWNlPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJIVVxcXCI+SHVuZ2FyeTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSVNcXFwiPkljZWxhbmQ8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIklFXFxcIj5JcmVsYW5kPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJJVFxcXCI+SXRhbHk8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkxWXFxcIj5MYXR2aWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkxJXFxcIj5MaWVjaHRlbnN0ZWluPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJMVFxcXCI+TGl0aHVhbmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJMVVxcXCI+THV4ZW1ib3VyZzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTWFjZWRvbmlhXFxcIj5NYWNlZG9uaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1UXFxcIj5NYWx0YTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTW9sZG92YVxcXCI+TW9sZG92YTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTUNcXFwiPk1vbmFjbzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTUVcXFwiPk1vbnRlbmVncm88L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk5MXFxcIj5OZXRoZXJsYW5kczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTk9cXFwiPk5vcndheTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUExcXFwiPlBvbGFuZDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUFRcXFwiPlBvcnR1Z2FsPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJST1xcXCI+Um9tYW5pYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUlNcXFwiPlNlcmJpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU0tcXFwiPlNsb3Zha2lhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTSVxcXCI+U2xvdmVuaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkVTXFxcIj5TcGFpbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU0VcXFwiPlN3ZWRlbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQ0hcXFwiPlN3aXR6ZXJsYW5kPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJUUlxcXCI+VHVya2V5PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJVQVxcXCI+VWtyYWluZTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQUZcXFwiPkFmZ2hhbmlzdGFuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBWFxcXCI+w4VsYW5kIElzbGFuZHM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkRaXFxcIj5BbGdlcmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBU1xcXCI+QW1lcmljYW4gU2Ftb2E8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkFPXFxcIj5BbmdvbGE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkFJXFxcIj5Bbmd1aWxsYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQVFcXFwiPkFudGFyY3RpY2E8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkFHXFxcIj5BbnRpZ3VhIGFuZCBCYXJidWRhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBUlxcXCI+QXJnZW50aW5hPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBTVxcXCI+QXJtZW5pYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQVdcXFwiPkFydWJhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBVVxcXCI+QXVzdHJhbGlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJBWlxcXCI+QXplcmJhaWphbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQlNcXFwiPkJhaGFtYXM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJIXFxcIj5CYWhyYWluPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCRFxcXCI+QmFuZ2xhZGVzaDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiQkJcXFwiPkJhcmJhZG9zPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCWlxcXCI+QmVsaXplPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCSlxcXCI+QmVuaW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJNXFxcIj5CZXJtdWRhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCVFxcXCI+Qmh1dGFuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCb2xpdmlhXFxcIj5Cb2xpdmlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCV1xcXCI+Qm90c3dhbmE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkJWXFxcIj5Cb3V2ZXQgSXNsYW5kPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCUlxcXCI+QnJhemlsPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCTlxcXCI+QnJ1bmVpIERhcnVzc2FsYW08L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkNVXFxcIj5DdWJhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJESlxcXCI+RGppYm91dGk8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkRNXFxcIj5Eb21pbmljYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiRE9cXFwiPkRvbWluaWNhbiBSZXB1YmxpYzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiRUNcXFwiPkVjdWFkb3I8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkVHXFxcIj5FZ3lwdDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU1ZcXFwiPkVsIFNhbHZhZG9yPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHUVxcXCI+RXF1YXRvcmlhbCBHdWluZWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkVSXFxcIj5Fcml0cmVhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHRlxcXCI+RnJlbmNoIEd1aWFuYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUEZcXFwiPkZyZW5jaCBQb2x5bmVzaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkdBXFxcIj5HYWJvbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR01cXFwiPkdhbWJpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR0VcXFwiPkdlb3JnaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkdIXFxcIj5HaGFuYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR0lcXFwiPkdpYnJhbHRhcjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR0xcXFwiPkdyZWVubGFuZDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR0RcXFwiPkdyZW5hZGE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkdQXFxcIj5HdWFkZWxvdXBlPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHVVxcXCI+R3VhbTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR1RcXFwiPkd1YXRlbWFsYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR0dcXFwiPkd1ZXJuc2V5PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHTlxcXCI+R3VpbmVhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJHV1xcXCI+R3VpbmVhLUJpc3NhdTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiR1lcXFwiPkd1eWFuYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSFRcXFwiPkhhaXRpPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJITlxcXCI+SG9uZHVyYXM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkhLXFxcIj5Ib25nIEtvbmc8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIklOXFxcIj5JbmRpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSURcXFwiPkluZG9uZXNpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSXJhblxcXCI+SXJhbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSVFcXFwiPklyYXE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIklNXFxcIj5Jc2xlIG9mIE1hbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSUxcXFwiPklzcmFlbDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSk1cXFwiPkphbWFpY2E8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkpQXFxcIj5KYXBhbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSkVcXFwiPkplcnNleTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiSk9cXFwiPkpvcmRhbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiS1pcXFwiPkthemFraHN0YW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIktFXFxcIj5LZW55YTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiS0lcXFwiPktpcmliYXRpPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJLb3JlYVxcXCI+UmVwdWJsaWMgb2YgS29yZWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIktvcmVhXFxcIj5EZW1vY3JhdGljIFBlb3BsZSdzIFJlcHVibGljIG9mIEtvcmVhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJLV1xcXCI+S3V3YWl0PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJLR1xcXCI+S3lyZ3l6c3Rhbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTEFcXFwiPkxhb3M8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkxCXFxcIj5MZWJhbm9uPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJMU1xcXCI+TGVzb3Robzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTFJcXFwiPkxpYmVyaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkxZXFxcIj5MaWJ5YW4gQXJhYiBKYW1haGlyaXlhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNT1xcXCI+TWFjYW88L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1HXFxcIj5NYWRhZ2FzY2FyPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNV1xcXCI+TWFsYXdpPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNWVxcXCI+TWFsYXlzaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1WXFxcIj5NYWxkaXZlczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTUxcXFwiPk1hbGk8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1IXFxcIj5NYXJzaGFsbCBJc2xhbmRzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNUVxcXCI+TWFydGluaXF1ZTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTVJcXFwiPk1hdXJpdGFuaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1VXFxcIj5NYXVyaXRpdXM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIllUXFxcIj5NYXlvdHRlPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNWFxcXCI+TWV4aWNvPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNaWNyb25lc2lhXFxcIj5NaWNyb25lc2lhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNTlxcXCI+TW9uZ29saWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1TXFxcIj5Nb250c2VycmF0PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJNQVxcXCI+TW9yb2Njbzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTVpcXFwiPk1vemFtYmlxdWU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk1NXFxcIj5NeWFubWFyPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJOQVxcXCI+TmFtaWJpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTlJcXFwiPk5hdXJ1PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJOUFxcXCI+TmVwYWw8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkFOXFxcIj5OZXRoZXJsYW5kcyBBbnRpbGxlczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTkNcXFwiPk5ldyBDYWxlZG9uaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk5aXFxcIj5OZXcgWmVhbGFuZDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTklcXFwiPk5pY2FyYWd1YTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTkVcXFwiPk5pZ2VyPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJOR1xcXCI+TmlnZXJpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTlVcXFwiPk5pdWU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIk5GXFxcIj5Ob3Jmb2xrIElzbGFuZDwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTVBcXFwiPk5vcnRoZXJuIE1hcmlhbmEgSXNsYW5kczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiT01cXFwiPk9tYW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlBLXFxcIj5QYWtpc3Rhbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUFdcXFwiPlBhbGF1PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJQYWxlc3RpbmVcXFwiPlBhbGVzdGluZTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUEFcXFwiPlBhbmFtYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUEdcXFwiPlBhcHVhIE5ldyBHdWluZWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlBZXFxcIj5QYXJhZ3VheTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUEVcXFwiPlBlcnU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlBIXFxcIj5QaGlsaXBwaW5lczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUE5cXFwiPlBpdGNhaXJuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJQUlxcXCI+UHVlcnRvIFJpY288L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlFBXFxcIj5RYXRhcjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUkVcXFwiPlLDqXVuaW9uPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJSVVxcXCI+UnVzc2lhbiBGZWRlcmF0aW9uPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJSV1xcXCI+UndhbmRhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJCTFxcXCI+U2FpbnQgQmFydGjDqWxlbXk8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNIXFxcIj5TYWludCBIZWxlbmE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIktOXFxcIj5TYWludCBLaXR0cyBhbmQgTmV2aXM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkxDXFxcIj5TYWludCBMdWNpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTUZcXFwiPlNhaW50IE1hcnRpbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiUE1cXFwiPlNhaW50IFBpZXJyZSBhbmQgTWlxdWVsb248L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlZDXFxcIj5TYWludCBWaW5jZW50IGFuZCBUaGUgR3JlbmFkaW5lczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiV1NcXFwiPlNhbW9hPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTTVxcXCI+U2FuIE1hcmlubzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU1RcXFwiPlNhbyBUb21lIGFuZCBQcmluY2lwZTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU0FcXFwiPlNhdWRpIEFyYWJpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU05cXFwiPlNlbmVnYWw8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNDXFxcIj5TZXljaGVsbGVzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTTFxcXCI+U2llcnJhIExlb25lPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTR1xcXCI+U2luZ2Fwb3JlPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTQlxcXCI+U29sb21vbiBJc2xhbmRzPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTT1xcXCI+U29tYWxpYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiWkFcXFwiPlNvdXRoIEFmcmljYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiTEtcXFwiPlNyaSBMYW5rYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiU0RcXFwiPlN1ZGFuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTUlxcXCI+U3VyaW5hbWU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlNKXFxcIj5TdmFsYmFyZCBhbmQgSmFuIE1heWVuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJTWlxcXCI+U3dhemlsYW5kPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJUYWl3YW5cXFwiPlRhaXdhbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVEpcXFwiPlRhamlraXN0YW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRhbnphbmlhXFxcIj5UYW56YW5pYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVEhcXFwiPlRoYWlsYW5kPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJUTFxcXCI+VGltb3ItTGVzdGU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRHXFxcIj5Ub2dvPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJUS1xcXCI+VG9rZWxhdTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVE9cXFwiPlRvbmdhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJUVFxcXCI+VHJpbmlkYWQgYW5kIFRvYmFnbzwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVE5cXFwiPlR1bmlzaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRNXFxcIj5UdXJrbWVuaXN0YW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRDXFxcIj5UdXJrcyBhbmQgQ2FpY29zIElzbGFuZHM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlRWXFxcIj5UdXZhbHU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlVHXFxcIj5VZ2FuZGE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIkFFXFxcIj5Vbml0ZWQgQXJhYiBFbWlyYXRlczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVVNcXFwiPlVuaXRlZCBTdGF0ZXM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlVZXFxcIj5VcnVndWF5PC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJVWlxcXCI+VXpiZWtpc3Rhbjwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVlVcXFwiPlZhbnVhdHU8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlZBXFxcIj5WYXRpY2FuPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJWZW5lenVlbGFcXFwiPlZlbmV6dWVsYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVk5cXFwiPlZpZXQgTmFtPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJWaXJnaW4gSXNsYW5kc1xcXCI+VmlyZ2luIElzbGFuZHM8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlZpcmdpbiBJc2xhbmRzXFxcIj5WaXJnaW4gSXNsYW5kczwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiVklcXFwiPlUuUy48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIldGXFxcIj5XYWxsaXMgYW5kIEZ1dHVuYTwvb3B0aW9uPlxcblx0PG9wdGlvbiB2YWx1ZT1cXFwiRUhcXFwiPldlc3Rlcm4gU2FoYXJhPC9vcHRpb24+XFxuXHQ8b3B0aW9uIHZhbHVlPVxcXCJZRVxcXCI+WWVtZW48L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlpNXFxcIj5aYW1iaWE8L29wdGlvbj5cXG5cdDxvcHRpb24gdmFsdWU9XFxcIlpXXFxcIj5aaW1iYWJ3ZTwvb3B0aW9uPjwvc2VsZWN0PlxcbiAgPC9kaXY+XFxuICBcXG4gIDxidXR0b24+UGxheSE8L2J1dHRvbj5cXG4gIFxcbjwvZm9ybT5cXG5cIjtcbiAgfSk7XG4iLCJ2YXIgSGFuZGxlYmFycyA9IHJlcXVpcmUoJ2hhbmRsZWJhcnMtcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICBcblxuXG4gIHJldHVybiBcIlxcbjxoMT5tYXRjaCBpbiBwcm9ncmVzczwvaDE+XFxuXFxuPHA+XFxuICBBcyBzb29uIGFzIHRoZSBjdXJyZW50IG1hdGNoIGlzIGZpbmlzaGVkLFxcbiAgeW91J2xsIGJlIGFibGUgdG8gam9pbiB0aGUgYWN0aW9uIVxcbjwvcD5cXG5cIjtcbiAgfSk7XG4iLCJ2YXIgSGFuZGxlYmFycyA9IHJlcXVpcmUoJ2hhbmRsZWJhcnMtcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICBcblxuXG4gIHJldHVybiBcIlxcbjxoMT5QcmVzcyBzdGFydCB0byBqb2luIHRoZSBnYW1lPC9oMT5cXG5cXG48YnV0dG9uIGlkPVxcXCJqb2luXFxcIiBvbnRvdWNoc3RhcnQ9XFxcIlxcXCI+U3RhcnQ8L2J1dHRvbj5cXG5cIjtcbiAgfSk7XG4iLCJ2YXIgSGFuZGxlYmFycyA9IHJlcXVpcmUoJ2hhbmRsZWJhcnMtcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICBcblxuXG4gIHJldHVybiBcIjxkaXYgY2xhc3M9XFxcInBsYXllclxcXCI+XFxuIFxcbiAgPGRpdiBjbGFzcz1cXFwibGFuZHNjYXBlXFxcIj5cXG4gICAgPGRpdiBjbGFzcz1cXFwicm93XFxcIj5cXG4gICAgICA8ZGl2IGNsYXNzPVxcXCJidXR0b24gdXBcXFwiPjxpPlVQPC9pPjwvZGl2PlxcbiAgICAgIDxkaXYgY2xhc3M9XFxcImJ1dHRvbiBkb3duXFxcIj48aT5ET1dOPC9pPjwvZGl2PlxcbiAgICA8L2Rpdj5cXG4gIDwvZGl2PlxcbiBcXG4gIDxkaXYgY2xhc3M9XFxcInBvcnRyYWl0XFxcIj5cXG4gICAgPGRpdiBjbGFzcz1cXFwicm93XFxcIj5cXG4gICAgICA8ZGl2IGNsYXNzPVxcXCJidXR0b24gdXBcXFwiPjxpPlVQPC9pPjwvZGl2PlxcbiAgICA8L2Rpdj5cXG4gICAgPGRpdiBjbGFzcz1cXFwicm93XFxcIj5cXG4gICAgICA8ZGl2IGNsYXNzPVxcXCJidXR0b24gZG93blxcXCI+PGk+RE9XTjwvaT48L2Rpdj5cXG4gICAgPC9kaXY+XFxuICA8L2Rpdj5cXG5cXG48L2Rpdj5cXG5cIjtcbiAgfSk7XG4iLCJ2YXIgSGFuZGxlYmFycyA9IHJlcXVpcmUoJ2hhbmRsZWJhcnMtcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICBcblxuXG4gIHJldHVybiBcIlxcbjxoMT53YWl0aW5nIGZvciAybmQgcGxheWVyPC9oMT5cXG5cXG48YnV0dG9uIGlkPVxcXCJjYW5jZWxcXFwiIG9udG91Y2hzdGFydD1cXFwiXFxcIj5jYW5jZWw8L2J1dHRvbj5cXG5cIjtcbiAgfSk7XG4iLCJ2YXIgSGFuZGxlYmFycyA9IHJlcXVpcmUoJ2hhbmRsZWJhcnMtcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICBcblxuXG4gIHJldHVybiBcIlxcbjxoMT50aGFua3MgZm9yIHBsYXlpbmc8L2gxPlxcblxcbjxwPlxcbiAgYmUgc3VyZSB0byBhc2sgYWJvdXQgd2hhdCB3ZSBkbyZoZWxsaXA7IDxiciAvPlxcbiAgYW5kIGhvdyB3ZSBidWlsdCB0aGlzIGdhbWVcXG48L3A+XFxuXCI7XG4gIH0pO1xuIiwiLypcblxuQ29weXJpZ2h0IChDKSAyMDExIGJ5IFllaHVkYSBLYXR6XG5cblBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbm9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbmluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbnRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbmNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcblxuVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbmFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG5JTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbkZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbk9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU5cblRIRSBTT0ZUV0FSRS5cblxuKi9cblxuLy8gbGliL2hhbmRsZWJhcnMvYnJvd3Nlci1wcmVmaXguanNcbnZhciBIYW5kbGViYXJzID0ge307XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnM7XG5cbihmdW5jdGlvbihIYW5kbGViYXJzLCB1bmRlZmluZWQpIHtcbjtcbi8vIGxpYi9oYW5kbGViYXJzL2Jhc2UuanNcblxuSGFuZGxlYmFycy5WRVJTSU9OID0gXCIxLjAuMFwiO1xuSGFuZGxlYmFycy5DT01QSUxFUl9SRVZJU0lPTiA9IDQ7XG5cbkhhbmRsZWJhcnMuUkVWSVNJT05fQ0hBTkdFUyA9IHtcbiAgMTogJzw9IDEuMC5yYy4yJywgLy8gMS4wLnJjLjIgaXMgYWN0dWFsbHkgcmV2MiBidXQgZG9lc24ndCByZXBvcnQgaXRcbiAgMjogJz09IDEuMC4wLXJjLjMnLFxuICAzOiAnPT0gMS4wLjAtcmMuNCcsXG4gIDQ6ICc+PSAxLjAuMCdcbn07XG5cbkhhbmRsZWJhcnMuaGVscGVycyAgPSB7fTtcbkhhbmRsZWJhcnMucGFydGlhbHMgPSB7fTtcblxudmFyIHRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZyxcbiAgICBmdW5jdGlvblR5cGUgPSAnW29iamVjdCBGdW5jdGlvbl0nLFxuICAgIG9iamVjdFR5cGUgPSAnW29iamVjdCBPYmplY3RdJztcblxuSGFuZGxlYmFycy5yZWdpc3RlckhlbHBlciA9IGZ1bmN0aW9uKG5hbWUsIGZuLCBpbnZlcnNlKSB7XG4gIGlmICh0b1N0cmluZy5jYWxsKG5hbWUpID09PSBvYmplY3RUeXBlKSB7XG4gICAgaWYgKGludmVyc2UgfHwgZm4pIHsgdGhyb3cgbmV3IEhhbmRsZWJhcnMuRXhjZXB0aW9uKCdBcmcgbm90IHN1cHBvcnRlZCB3aXRoIG11bHRpcGxlIGhlbHBlcnMnKTsgfVxuICAgIEhhbmRsZWJhcnMuVXRpbHMuZXh0ZW5kKHRoaXMuaGVscGVycywgbmFtZSk7XG4gIH0gZWxzZSB7XG4gICAgaWYgKGludmVyc2UpIHsgZm4ubm90ID0gaW52ZXJzZTsgfVxuICAgIHRoaXMuaGVscGVyc1tuYW1lXSA9IGZuO1xuICB9XG59O1xuXG5IYW5kbGViYXJzLnJlZ2lzdGVyUGFydGlhbCA9IGZ1bmN0aW9uKG5hbWUsIHN0cikge1xuICBpZiAodG9TdHJpbmcuY2FsbChuYW1lKSA9PT0gb2JqZWN0VHlwZSkge1xuICAgIEhhbmRsZWJhcnMuVXRpbHMuZXh0ZW5kKHRoaXMucGFydGlhbHMsICBuYW1lKTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLnBhcnRpYWxzW25hbWVdID0gc3RyO1xuICB9XG59O1xuXG5IYW5kbGViYXJzLnJlZ2lzdGVySGVscGVyKCdoZWxwZXJNaXNzaW5nJywgZnVuY3Rpb24oYXJnKSB7XG4gIGlmKGFyZ3VtZW50cy5sZW5ndGggPT09IDIpIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcihcIk1pc3NpbmcgaGVscGVyOiAnXCIgKyBhcmcgKyBcIidcIik7XG4gIH1cbn0pO1xuXG5IYW5kbGViYXJzLnJlZ2lzdGVySGVscGVyKCdibG9ja0hlbHBlck1pc3NpbmcnLCBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gIHZhciBpbnZlcnNlID0gb3B0aW9ucy5pbnZlcnNlIHx8IGZ1bmN0aW9uKCkge30sIGZuID0gb3B0aW9ucy5mbjtcblxuICB2YXIgdHlwZSA9IHRvU3RyaW5nLmNhbGwoY29udGV4dCk7XG5cbiAgaWYodHlwZSA9PT0gZnVuY3Rpb25UeXBlKSB7IGNvbnRleHQgPSBjb250ZXh0LmNhbGwodGhpcyk7IH1cblxuICBpZihjb250ZXh0ID09PSB0cnVlKSB7XG4gICAgcmV0dXJuIGZuKHRoaXMpO1xuICB9IGVsc2UgaWYoY29udGV4dCA9PT0gZmFsc2UgfHwgY29udGV4dCA9PSBudWxsKSB7XG4gICAgcmV0dXJuIGludmVyc2UodGhpcyk7XG4gIH0gZWxzZSBpZih0eXBlID09PSBcIltvYmplY3QgQXJyYXldXCIpIHtcbiAgICBpZihjb250ZXh0Lmxlbmd0aCA+IDApIHtcbiAgICAgIHJldHVybiBIYW5kbGViYXJzLmhlbHBlcnMuZWFjaChjb250ZXh0LCBvcHRpb25zKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGludmVyc2UodGhpcyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBmbihjb250ZXh0KTtcbiAgfVxufSk7XG5cbkhhbmRsZWJhcnMuSyA9IGZ1bmN0aW9uKCkge307XG5cbkhhbmRsZWJhcnMuY3JlYXRlRnJhbWUgPSBPYmplY3QuY3JlYXRlIHx8IGZ1bmN0aW9uKG9iamVjdCkge1xuICBIYW5kbGViYXJzLksucHJvdG90eXBlID0gb2JqZWN0O1xuICB2YXIgb2JqID0gbmV3IEhhbmRsZWJhcnMuSygpO1xuICBIYW5kbGViYXJzLksucHJvdG90eXBlID0gbnVsbDtcbiAgcmV0dXJuIG9iajtcbn07XG5cbkhhbmRsZWJhcnMubG9nZ2VyID0ge1xuICBERUJVRzogMCwgSU5GTzogMSwgV0FSTjogMiwgRVJST1I6IDMsIGxldmVsOiAzLFxuXG4gIG1ldGhvZE1hcDogezA6ICdkZWJ1ZycsIDE6ICdpbmZvJywgMjogJ3dhcm4nLCAzOiAnZXJyb3InfSxcblxuICAvLyBjYW4gYmUgb3ZlcnJpZGRlbiBpbiB0aGUgaG9zdCBlbnZpcm9ubWVudFxuICBsb2c6IGZ1bmN0aW9uKGxldmVsLCBvYmopIHtcbiAgICBpZiAoSGFuZGxlYmFycy5sb2dnZXIubGV2ZWwgPD0gbGV2ZWwpIHtcbiAgICAgIHZhciBtZXRob2QgPSBIYW5kbGViYXJzLmxvZ2dlci5tZXRob2RNYXBbbGV2ZWxdO1xuICAgICAgaWYgKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJyAmJiBjb25zb2xlW21ldGhvZF0pIHtcbiAgICAgICAgY29uc29sZVttZXRob2RdLmNhbGwoY29uc29sZSwgb2JqKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbkhhbmRsZWJhcnMubG9nID0gZnVuY3Rpb24obGV2ZWwsIG9iaikgeyBIYW5kbGViYXJzLmxvZ2dlci5sb2cobGV2ZWwsIG9iaik7IH07XG5cbkhhbmRsZWJhcnMucmVnaXN0ZXJIZWxwZXIoJ2VhY2gnLCBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gIHZhciBmbiA9IG9wdGlvbnMuZm4sIGludmVyc2UgPSBvcHRpb25zLmludmVyc2U7XG4gIHZhciBpID0gMCwgcmV0ID0gXCJcIiwgZGF0YTtcblxuICB2YXIgdHlwZSA9IHRvU3RyaW5nLmNhbGwoY29udGV4dCk7XG4gIGlmKHR5cGUgPT09IGZ1bmN0aW9uVHlwZSkgeyBjb250ZXh0ID0gY29udGV4dC5jYWxsKHRoaXMpOyB9XG5cbiAgaWYgKG9wdGlvbnMuZGF0YSkge1xuICAgIGRhdGEgPSBIYW5kbGViYXJzLmNyZWF0ZUZyYW1lKG9wdGlvbnMuZGF0YSk7XG4gIH1cblxuICBpZihjb250ZXh0ICYmIHR5cGVvZiBjb250ZXh0ID09PSAnb2JqZWN0Jykge1xuICAgIGlmKGNvbnRleHQgaW5zdGFuY2VvZiBBcnJheSl7XG4gICAgICBmb3IodmFyIGogPSBjb250ZXh0Lmxlbmd0aDsgaTxqOyBpKyspIHtcbiAgICAgICAgaWYgKGRhdGEpIHsgZGF0YS5pbmRleCA9IGk7IH1cbiAgICAgICAgcmV0ID0gcmV0ICsgZm4oY29udGV4dFtpXSwgeyBkYXRhOiBkYXRhIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBmb3IodmFyIGtleSBpbiBjb250ZXh0KSB7XG4gICAgICAgIGlmKGNvbnRleHQuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgIGlmKGRhdGEpIHsgZGF0YS5rZXkgPSBrZXk7IH1cbiAgICAgICAgICByZXQgPSByZXQgKyBmbihjb250ZXh0W2tleV0sIHtkYXRhOiBkYXRhfSk7XG4gICAgICAgICAgaSsrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYoaSA9PT0gMCl7XG4gICAgcmV0ID0gaW52ZXJzZSh0aGlzKTtcbiAgfVxuXG4gIHJldHVybiByZXQ7XG59KTtcblxuSGFuZGxlYmFycy5yZWdpc3RlckhlbHBlcignaWYnLCBmdW5jdGlvbihjb25kaXRpb25hbCwgb3B0aW9ucykge1xuICB2YXIgdHlwZSA9IHRvU3RyaW5nLmNhbGwoY29uZGl0aW9uYWwpO1xuICBpZih0eXBlID09PSBmdW5jdGlvblR5cGUpIHsgY29uZGl0aW9uYWwgPSBjb25kaXRpb25hbC5jYWxsKHRoaXMpOyB9XG5cbiAgaWYoIWNvbmRpdGlvbmFsIHx8IEhhbmRsZWJhcnMuVXRpbHMuaXNFbXB0eShjb25kaXRpb25hbCkpIHtcbiAgICByZXR1cm4gb3B0aW9ucy5pbnZlcnNlKHRoaXMpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBvcHRpb25zLmZuKHRoaXMpO1xuICB9XG59KTtcblxuSGFuZGxlYmFycy5yZWdpc3RlckhlbHBlcigndW5sZXNzJywgZnVuY3Rpb24oY29uZGl0aW9uYWwsIG9wdGlvbnMpIHtcbiAgcmV0dXJuIEhhbmRsZWJhcnMuaGVscGVyc1snaWYnXS5jYWxsKHRoaXMsIGNvbmRpdGlvbmFsLCB7Zm46IG9wdGlvbnMuaW52ZXJzZSwgaW52ZXJzZTogb3B0aW9ucy5mbn0pO1xufSk7XG5cbkhhbmRsZWJhcnMucmVnaXN0ZXJIZWxwZXIoJ3dpdGgnLCBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gIHZhciB0eXBlID0gdG9TdHJpbmcuY2FsbChjb250ZXh0KTtcbiAgaWYodHlwZSA9PT0gZnVuY3Rpb25UeXBlKSB7IGNvbnRleHQgPSBjb250ZXh0LmNhbGwodGhpcyk7IH1cblxuICBpZiAoIUhhbmRsZWJhcnMuVXRpbHMuaXNFbXB0eShjb250ZXh0KSkgcmV0dXJuIG9wdGlvbnMuZm4oY29udGV4dCk7XG59KTtcblxuSGFuZGxlYmFycy5yZWdpc3RlckhlbHBlcignbG9nJywgZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICB2YXIgbGV2ZWwgPSBvcHRpb25zLmRhdGEgJiYgb3B0aW9ucy5kYXRhLmxldmVsICE9IG51bGwgPyBwYXJzZUludChvcHRpb25zLmRhdGEubGV2ZWwsIDEwKSA6IDE7XG4gIEhhbmRsZWJhcnMubG9nKGxldmVsLCBjb250ZXh0KTtcbn0pO1xuO1xuLy8gbGliL2hhbmRsZWJhcnMvdXRpbHMuanNcblxudmFyIGVycm9yUHJvcHMgPSBbJ2Rlc2NyaXB0aW9uJywgJ2ZpbGVOYW1lJywgJ2xpbmVOdW1iZXInLCAnbWVzc2FnZScsICduYW1lJywgJ251bWJlcicsICdzdGFjayddO1xuXG5IYW5kbGViYXJzLkV4Y2VwdGlvbiA9IGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgdmFyIHRtcCA9IEVycm9yLnByb3RvdHlwZS5jb25zdHJ1Y3Rvci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXG4gIC8vIFVuZm9ydHVuYXRlbHkgZXJyb3JzIGFyZSBub3QgZW51bWVyYWJsZSBpbiBDaHJvbWUgKGF0IGxlYXN0KSwgc28gYGZvciBwcm9wIGluIHRtcGAgZG9lc24ndCB3b3JrLlxuICBmb3IgKHZhciBpZHggPSAwOyBpZHggPCBlcnJvclByb3BzLmxlbmd0aDsgaWR4KyspIHtcbiAgICB0aGlzW2Vycm9yUHJvcHNbaWR4XV0gPSB0bXBbZXJyb3JQcm9wc1tpZHhdXTtcbiAgfVxufTtcbkhhbmRsZWJhcnMuRXhjZXB0aW9uLnByb3RvdHlwZSA9IG5ldyBFcnJvcigpO1xuXG4vLyBCdWlsZCBvdXQgb3VyIGJhc2ljIFNhZmVTdHJpbmcgdHlwZVxuSGFuZGxlYmFycy5TYWZlU3RyaW5nID0gZnVuY3Rpb24oc3RyaW5nKSB7XG4gIHRoaXMuc3RyaW5nID0gc3RyaW5nO1xufTtcbkhhbmRsZWJhcnMuU2FmZVN0cmluZy5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuc3RyaW5nLnRvU3RyaW5nKCk7XG59O1xuXG52YXIgZXNjYXBlID0ge1xuICBcIiZcIjogXCImYW1wO1wiLFxuICBcIjxcIjogXCImbHQ7XCIsXG4gIFwiPlwiOiBcIiZndDtcIixcbiAgJ1wiJzogXCImcXVvdDtcIixcbiAgXCInXCI6IFwiJiN4Mjc7XCIsXG4gIFwiYFwiOiBcIiYjeDYwO1wiXG59O1xuXG52YXIgYmFkQ2hhcnMgPSAvWyY8PlwiJ2BdL2c7XG52YXIgcG9zc2libGUgPSAvWyY8PlwiJ2BdLztcblxudmFyIGVzY2FwZUNoYXIgPSBmdW5jdGlvbihjaHIpIHtcbiAgcmV0dXJuIGVzY2FwZVtjaHJdIHx8IFwiJmFtcDtcIjtcbn07XG5cbkhhbmRsZWJhcnMuVXRpbHMgPSB7XG4gIGV4dGVuZDogZnVuY3Rpb24ob2JqLCB2YWx1ZSkge1xuICAgIGZvcih2YXIga2V5IGluIHZhbHVlKSB7XG4gICAgICBpZih2YWx1ZS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgIG9ialtrZXldID0gdmFsdWVba2V5XTtcbiAgICAgIH1cbiAgICB9XG4gIH0sXG5cbiAgZXNjYXBlRXhwcmVzc2lvbjogZnVuY3Rpb24oc3RyaW5nKSB7XG4gICAgLy8gZG9uJ3QgZXNjYXBlIFNhZmVTdHJpbmdzLCBzaW5jZSB0aGV5J3JlIGFscmVhZHkgc2FmZVxuICAgIGlmIChzdHJpbmcgaW5zdGFuY2VvZiBIYW5kbGViYXJzLlNhZmVTdHJpbmcpIHtcbiAgICAgIHJldHVybiBzdHJpbmcudG9TdHJpbmcoKTtcbiAgICB9IGVsc2UgaWYgKHN0cmluZyA9PSBudWxsIHx8IHN0cmluZyA9PT0gZmFsc2UpIHtcbiAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cblxuICAgIC8vIEZvcmNlIGEgc3RyaW5nIGNvbnZlcnNpb24gYXMgdGhpcyB3aWxsIGJlIGRvbmUgYnkgdGhlIGFwcGVuZCByZWdhcmRsZXNzIGFuZFxuICAgIC8vIHRoZSByZWdleCB0ZXN0IHdpbGwgZG8gdGhpcyB0cmFuc3BhcmVudGx5IGJlaGluZCB0aGUgc2NlbmVzLCBjYXVzaW5nIGlzc3VlcyBpZlxuICAgIC8vIGFuIG9iamVjdCdzIHRvIHN0cmluZyBoYXMgZXNjYXBlZCBjaGFyYWN0ZXJzIGluIGl0LlxuICAgIHN0cmluZyA9IHN0cmluZy50b1N0cmluZygpO1xuXG4gICAgaWYoIXBvc3NpYmxlLnRlc3Qoc3RyaW5nKSkgeyByZXR1cm4gc3RyaW5nOyB9XG4gICAgcmV0dXJuIHN0cmluZy5yZXBsYWNlKGJhZENoYXJzLCBlc2NhcGVDaGFyKTtcbiAgfSxcblxuICBpc0VtcHR5OiBmdW5jdGlvbih2YWx1ZSkge1xuICAgIGlmICghdmFsdWUgJiYgdmFsdWUgIT09IDApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gZWxzZSBpZih0b1N0cmluZy5jYWxsKHZhbHVlKSA9PT0gXCJbb2JqZWN0IEFycmF5XVwiICYmIHZhbHVlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbn07XG47XG4vLyBsaWIvaGFuZGxlYmFycy9ydW50aW1lLmpzXG5cbkhhbmRsZWJhcnMuVk0gPSB7XG4gIHRlbXBsYXRlOiBmdW5jdGlvbih0ZW1wbGF0ZVNwZWMpIHtcbiAgICAvLyBKdXN0IGFkZCB3YXRlclxuICAgIHZhciBjb250YWluZXIgPSB7XG4gICAgICBlc2NhcGVFeHByZXNzaW9uOiBIYW5kbGViYXJzLlV0aWxzLmVzY2FwZUV4cHJlc3Npb24sXG4gICAgICBpbnZva2VQYXJ0aWFsOiBIYW5kbGViYXJzLlZNLmludm9rZVBhcnRpYWwsXG4gICAgICBwcm9ncmFtczogW10sXG4gICAgICBwcm9ncmFtOiBmdW5jdGlvbihpLCBmbiwgZGF0YSkge1xuICAgICAgICB2YXIgcHJvZ3JhbVdyYXBwZXIgPSB0aGlzLnByb2dyYW1zW2ldO1xuICAgICAgICBpZihkYXRhKSB7XG4gICAgICAgICAgcHJvZ3JhbVdyYXBwZXIgPSBIYW5kbGViYXJzLlZNLnByb2dyYW0oaSwgZm4sIGRhdGEpO1xuICAgICAgICB9IGVsc2UgaWYgKCFwcm9ncmFtV3JhcHBlcikge1xuICAgICAgICAgIHByb2dyYW1XcmFwcGVyID0gdGhpcy5wcm9ncmFtc1tpXSA9IEhhbmRsZWJhcnMuVk0ucHJvZ3JhbShpLCBmbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHByb2dyYW1XcmFwcGVyO1xuICAgICAgfSxcbiAgICAgIG1lcmdlOiBmdW5jdGlvbihwYXJhbSwgY29tbW9uKSB7XG4gICAgICAgIHZhciByZXQgPSBwYXJhbSB8fCBjb21tb247XG5cbiAgICAgICAgaWYgKHBhcmFtICYmIGNvbW1vbikge1xuICAgICAgICAgIHJldCA9IHt9O1xuICAgICAgICAgIEhhbmRsZWJhcnMuVXRpbHMuZXh0ZW5kKHJldCwgY29tbW9uKTtcbiAgICAgICAgICBIYW5kbGViYXJzLlV0aWxzLmV4dGVuZChyZXQsIHBhcmFtKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmV0O1xuICAgICAgfSxcbiAgICAgIHByb2dyYW1XaXRoRGVwdGg6IEhhbmRsZWJhcnMuVk0ucHJvZ3JhbVdpdGhEZXB0aCxcbiAgICAgIG5vb3A6IEhhbmRsZWJhcnMuVk0ubm9vcCxcbiAgICAgIGNvbXBpbGVySW5mbzogbnVsbFxuICAgIH07XG5cbiAgICByZXR1cm4gZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICB2YXIgcmVzdWx0ID0gdGVtcGxhdGVTcGVjLmNhbGwoY29udGFpbmVyLCBIYW5kbGViYXJzLCBjb250ZXh0LCBvcHRpb25zLmhlbHBlcnMsIG9wdGlvbnMucGFydGlhbHMsIG9wdGlvbnMuZGF0YSk7XG5cbiAgICAgIHZhciBjb21waWxlckluZm8gPSBjb250YWluZXIuY29tcGlsZXJJbmZvIHx8IFtdLFxuICAgICAgICAgIGNvbXBpbGVyUmV2aXNpb24gPSBjb21waWxlckluZm9bMF0gfHwgMSxcbiAgICAgICAgICBjdXJyZW50UmV2aXNpb24gPSBIYW5kbGViYXJzLkNPTVBJTEVSX1JFVklTSU9OO1xuXG4gICAgICBpZiAoY29tcGlsZXJSZXZpc2lvbiAhPT0gY3VycmVudFJldmlzaW9uKSB7XG4gICAgICAgIGlmIChjb21waWxlclJldmlzaW9uIDwgY3VycmVudFJldmlzaW9uKSB7XG4gICAgICAgICAgdmFyIHJ1bnRpbWVWZXJzaW9ucyA9IEhhbmRsZWJhcnMuUkVWSVNJT05fQ0hBTkdFU1tjdXJyZW50UmV2aXNpb25dLFxuICAgICAgICAgICAgICBjb21waWxlclZlcnNpb25zID0gSGFuZGxlYmFycy5SRVZJU0lPTl9DSEFOR0VTW2NvbXBpbGVyUmV2aXNpb25dO1xuICAgICAgICAgIHRocm93IFwiVGVtcGxhdGUgd2FzIHByZWNvbXBpbGVkIHdpdGggYW4gb2xkZXIgdmVyc2lvbiBvZiBIYW5kbGViYXJzIHRoYW4gdGhlIGN1cnJlbnQgcnVudGltZS4gXCIrXG4gICAgICAgICAgICAgICAgXCJQbGVhc2UgdXBkYXRlIHlvdXIgcHJlY29tcGlsZXIgdG8gYSBuZXdlciB2ZXJzaW9uIChcIitydW50aW1lVmVyc2lvbnMrXCIpIG9yIGRvd25ncmFkZSB5b3VyIHJ1bnRpbWUgdG8gYW4gb2xkZXIgdmVyc2lvbiAoXCIrY29tcGlsZXJWZXJzaW9ucytcIikuXCI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVXNlIHRoZSBlbWJlZGRlZCB2ZXJzaW9uIGluZm8gc2luY2UgdGhlIHJ1bnRpbWUgZG9lc24ndCBrbm93IGFib3V0IHRoaXMgcmV2aXNpb24geWV0XG4gICAgICAgICAgdGhyb3cgXCJUZW1wbGF0ZSB3YXMgcHJlY29tcGlsZWQgd2l0aCBhIG5ld2VyIHZlcnNpb24gb2YgSGFuZGxlYmFycyB0aGFuIHRoZSBjdXJyZW50IHJ1bnRpbWUuIFwiK1xuICAgICAgICAgICAgICAgIFwiUGxlYXNlIHVwZGF0ZSB5b3VyIHJ1bnRpbWUgdG8gYSBuZXdlciB2ZXJzaW9uIChcIitjb21waWxlckluZm9bMV0rXCIpLlwiO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfSxcblxuICBwcm9ncmFtV2l0aERlcHRoOiBmdW5jdGlvbihpLCBmbiwgZGF0YSAvKiwgJGRlcHRoICovKSB7XG4gICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDMpO1xuXG4gICAgdmFyIHByb2dyYW0gPSBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAgICAgcmV0dXJuIGZuLmFwcGx5KHRoaXMsIFtjb250ZXh0LCBvcHRpb25zLmRhdGEgfHwgZGF0YV0uY29uY2F0KGFyZ3MpKTtcbiAgICB9O1xuICAgIHByb2dyYW0ucHJvZ3JhbSA9IGk7XG4gICAgcHJvZ3JhbS5kZXB0aCA9IGFyZ3MubGVuZ3RoO1xuICAgIHJldHVybiBwcm9ncmFtO1xuICB9LFxuICBwcm9ncmFtOiBmdW5jdGlvbihpLCBmbiwgZGF0YSkge1xuICAgIHZhciBwcm9ncmFtID0gZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICAgIHJldHVybiBmbihjb250ZXh0LCBvcHRpb25zLmRhdGEgfHwgZGF0YSk7XG4gICAgfTtcbiAgICBwcm9ncmFtLnByb2dyYW0gPSBpO1xuICAgIHByb2dyYW0uZGVwdGggPSAwO1xuICAgIHJldHVybiBwcm9ncmFtO1xuICB9LFxuICBub29wOiBmdW5jdGlvbigpIHsgcmV0dXJuIFwiXCI7IH0sXG4gIGludm9rZVBhcnRpYWw6IGZ1bmN0aW9uKHBhcnRpYWwsIG5hbWUsIGNvbnRleHQsIGhlbHBlcnMsIHBhcnRpYWxzLCBkYXRhKSB7XG4gICAgdmFyIG9wdGlvbnMgPSB7IGhlbHBlcnM6IGhlbHBlcnMsIHBhcnRpYWxzOiBwYXJ0aWFscywgZGF0YTogZGF0YSB9O1xuXG4gICAgaWYocGFydGlhbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICB0aHJvdyBuZXcgSGFuZGxlYmFycy5FeGNlcHRpb24oXCJUaGUgcGFydGlhbCBcIiArIG5hbWUgKyBcIiBjb3VsZCBub3QgYmUgZm91bmRcIik7XG4gICAgfSBlbHNlIGlmKHBhcnRpYWwgaW5zdGFuY2VvZiBGdW5jdGlvbikge1xuICAgICAgcmV0dXJuIHBhcnRpYWwoY29udGV4dCwgb3B0aW9ucyk7XG4gICAgfSBlbHNlIGlmICghSGFuZGxlYmFycy5jb21waWxlKSB7XG4gICAgICB0aHJvdyBuZXcgSGFuZGxlYmFycy5FeGNlcHRpb24oXCJUaGUgcGFydGlhbCBcIiArIG5hbWUgKyBcIiBjb3VsZCBub3QgYmUgY29tcGlsZWQgd2hlbiBydW5uaW5nIGluIHJ1bnRpbWUtb25seSBtb2RlXCIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBwYXJ0aWFsc1tuYW1lXSA9IEhhbmRsZWJhcnMuY29tcGlsZShwYXJ0aWFsLCB7ZGF0YTogZGF0YSAhPT0gdW5kZWZpbmVkfSk7XG4gICAgICByZXR1cm4gcGFydGlhbHNbbmFtZV0oY29udGV4dCwgb3B0aW9ucyk7XG4gICAgfVxuICB9XG59O1xuXG5IYW5kbGViYXJzLnRlbXBsYXRlID0gSGFuZGxlYmFycy5WTS50ZW1wbGF0ZTtcbjtcbi8vIGxpYi9oYW5kbGViYXJzL2Jyb3dzZXItc3VmZml4LmpzXG59KShIYW5kbGViYXJzKTtcbjtcbiIsIihmdW5jdGlvbihnbG9iYWwpe3JlcXVpcmUoXCIuL3J4Lm1pbi5qc1wiKShnbG9iYWwpO1xyXG5yZXF1aXJlKFwiLi9yeC5hZ2dyZWdhdGVzLm1pbi5qc1wiKShnbG9iYWwpO1xyXG5yZXF1aXJlKFwiLi9yeC5jb2luY2lkZW5jZS5taW4uanNcIikoZ2xvYmFsKTtcclxucmVxdWlyZShcIi4vcnguam9pbnBhdHRlcm5zLm1pbi5qc1wiKShnbG9iYWwpO1xyXG5yZXF1aXJlKFwiLi9yeC50aW1lLm1pbi5qc1wiKShnbG9iYWwpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBSeFxyXG5cbn0pKHdpbmRvdykiLCIvKlxuIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiAgQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiBUaGlzIGNvZGUgaXMgbGljZW5zZWQgYnkgTWljcm9zb2Z0IENvcnBvcmF0aW9uIHVuZGVyIHRoZSB0ZXJtc1xuIG9mIHRoZSBNSUNST1NPRlQgUkVBQ1RJVkUgRVhURU5TSU9OUyBGT1IgSkFWQVNDUklQVCBBTkQgLk5FVCBMSUJSQVJJRVMgTGljZW5zZS5cbiBTZWUgaHR0cDovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSUQ9MjIwNzYyLlxuKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oeCxuKXt2YXIgbSxpYT1mdW5jdGlvbigpe30sSj1mdW5jdGlvbigpe3JldHVybihuZXcgRGF0ZSkuZ2V0VGltZSgpfSxWPWZ1bmN0aW9uKGEsYil7cmV0dXJuIGE9PT1ifSxRPWZ1bmN0aW9uKGEpe3JldHVybiBhfSxXPWZ1bmN0aW9uKGEpe3JldHVybiBhLnRvU3RyaW5nKCl9LFg9T2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eSxvPWZ1bmN0aW9uKGEsYil7ZnVuY3Rpb24gYygpe3RoaXMuY29uc3RydWN0b3I9YX1mb3IodmFyIGQgaW4gYilYLmNhbGwoYixkKSYmKGFbZF09YltkXSk7Yy5wcm90b3R5cGU9Yi5wcm90b3R5cGU7YS5wcm90b3R5cGU9bmV3IGM7YS5iYXNlPWIucHJvdG90eXBlO3JldHVybiBhfSxFPWZ1bmN0aW9uKGEsYil7Zm9yKHZhciBjIGluIGIpWC5jYWxsKGIsYykmJihhW2NdPWJbY10pfSx5PUFycmF5LnByb3RvdHlwZS5zbGljZSxLPVwiT2JqZWN0IGhhcyBiZWVuIGRpc3Bvc2VkXCI7bT14LlJ4PXtJbnRlcm5hbHM6e319O20uVkVSU0lPTj1cIjEuMC4xMDYyMVwiO3ZhciBqYT1mdW5jdGlvbihhLGIpe3JldHVybiBpKGZ1bmN0aW9uKGMpe3JldHVybiBuZXcgcChiLmdldERpc3Bvc2FibGUoKSxhLnN1YnNjcmliZShjKSl9KX0sRj1mdW5jdGlvbihhLGIsYyl7cmV0dXJuIGkoZnVuY3Rpb24oZCl7dmFyIGU9bmV3IHYsZz1uZXcgdixkPWMoZCxlLGcpO2UuZGlzcG9zYWJsZShhLm1hdGVyaWFsaXplKCkuc2VsZWN0KGZ1bmN0aW9uKGIpe3JldHVybntzd2l0Y2hWYWx1ZTpmdW5jdGlvbihhKXtyZXR1cm4gYShiKX19fSkuc3Vic2NyaWJlKGQpKTtnLmRpc3Bvc2FibGUoYi5tYXRlcmlhbGl6ZSgpLnNlbGVjdChmdW5jdGlvbihiKXtyZXR1cm57c3dpdGNoVmFsdWU6ZnVuY3Rpb24oYSxjKXtyZXR1cm4gYyhiKX19fSkuc3Vic2NyaWJlKGQpKTtyZXR1cm4gbmV3IHAoZSxnKX0pfSx1PW0uSW50ZXJuYWxzLkxpc3Q9XG5mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYil7dGhpcy5jb21wYXJlcj1ifHxWO3RoaXMuc2l6ZT0wO3RoaXMuaXRlbXM9W119YS5mcm9tQXJyYXk9ZnVuY3Rpb24oYixjKXt2YXIgZCxlPWIubGVuZ3RoLGc9bmV3IGEoYyk7Zm9yKGQ9MDtkPGU7ZCsrKWcuYWRkKGJbZF0pO3JldHVybiBnfTthLnByb3RvdHlwZS5jb3VudD1mdW5jdGlvbigpe3JldHVybiB0aGlzLnNpemV9O2EucHJvdG90eXBlLmFkZD1mdW5jdGlvbihiKXt0aGlzLml0ZW1zW3RoaXMuc2l6ZV09Yjt0aGlzLnNpemUrK307YS5wcm90b3R5cGUucmVtb3ZlQXQ9ZnVuY3Rpb24oYil7aWYoMD5ifHxiPj10aGlzLnNpemUpdGhyb3cgRXJyb3IoXCJBcmd1bWVudCBvdXQgb2YgcmFuZ2VcIik7MD09PWI/dGhpcy5pdGVtcy5zaGlmdCgpOnRoaXMuaXRlbXMuc3BsaWNlKGIsMSk7dGhpcy5zaXplLS19O2EucHJvdG90eXBlLmluZGV4T2Y9ZnVuY3Rpb24oYil7dmFyIGEsZDtmb3IoYT0wO2E8dGhpcy5pdGVtcy5sZW5ndGg7YSsrKWlmKGQ9XG50aGlzLml0ZW1zW2FdLHRoaXMuY29tcGFyZXIoYixkKSlyZXR1cm4gYTtyZXR1cm4tMX07YS5wcm90b3R5cGUucmVtb3ZlPWZ1bmN0aW9uKGIpe2I9dGhpcy5pbmRleE9mKGIpO2lmKC0xPT09YilyZXR1cm4hMTt0aGlzLnJlbW92ZUF0KGIpO3JldHVybiEwfTthLnByb3RvdHlwZS5jbGVhcj1mdW5jdGlvbigpe3RoaXMuaXRlbXM9W107dGhpcy5zaXplPTB9O2EucHJvdG90eXBlLml0ZW09ZnVuY3Rpb24oYixhKXtpZigwPmJ8fGI+PWNvdW50KXRocm93IEVycm9yKFwiQXJndW1lbnQgb3V0IG9mIHJhbmdlXCIpO2lmKGE9PT1uKXJldHVybiB0aGlzLml0ZW1zW2JdO3RoaXMuaXRlbXNbYl09YX07YS5wcm90b3R5cGUudG9BcnJheT1mdW5jdGlvbigpe3ZhciBiPVtdLGE7Zm9yKGE9MDthPHRoaXMuaXRlbXMubGVuZ3RoO2ErKyliLnB1c2godGhpcy5pdGVtc1thXSk7cmV0dXJuIGJ9O2EucHJvdG90eXBlLmNvbnRhaW5zPWZ1bmN0aW9uKGIpe2Zvcih2YXIgYT0wO2E8dGhpcy5pdGVtcy5sZW5ndGg7YSsrKWlmKHRoaXMuY29tcGFyZXIoYixcbnRoaXMuaXRlbXNbYV0pKXJldHVybiEwO3JldHVybiExfTtyZXR1cm4gYX0oKSxrYT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYixhKXt0aGlzLmlkPWI7dGhpcy52YWx1ZT1hfWEucHJvdG90eXBlLmNvbXBhcmVUbz1mdW5jdGlvbihiKXt2YXIgYT10aGlzLnZhbHVlLmNvbXBhcmVUbyhiLnZhbHVlKTswPT09YSYmKGE9dGhpcy5pZC1iLmlkKTtyZXR1cm4gYX07cmV0dXJuIGF9KCksWT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYil7dGhpcy5pdGVtcz1BcnJheShiKTt0aGlzLnNpemU9MH1hLnByb3RvdHlwZS5jb3VudD1mdW5jdGlvbigpe3JldHVybiB0aGlzLnNpemV9O2EucHJvdG90eXBlLmlzSGlnaGVyUHJpb3JpdHk9ZnVuY3Rpb24oYixhKXtyZXR1cm4gMD50aGlzLml0ZW1zW2JdLmNvbXBhcmVUbyh0aGlzLml0ZW1zW2FdKX07YS5wcm90b3R5cGUucGVyY29sYXRlPWZ1bmN0aW9uKGIpe3ZhciBhLGQ7aWYoIShiPj10aGlzLnNpemV8fDA+YikpaWYoYT1NYXRoLmZsb29yKChiLTEpL1xuMiksISgwPmF8fGE9PT1iKSYmdGhpcy5pc0hpZ2hlclByaW9yaXR5KGIsYSkpZD10aGlzLml0ZW1zW2JdLHRoaXMuaXRlbXNbYl09dGhpcy5pdGVtc1thXSx0aGlzLml0ZW1zW2FdPWQsdGhpcy5wZXJjb2xhdGUoYSl9O2EucHJvdG90eXBlLmhlYXBpZnk9ZnVuY3Rpb24oYil7dmFyIGEsZCxlO2I9PT1uJiYoYj0wKTtiPj10aGlzLnNpemV8fDA+Ynx8KGQ9MipiKzEsZT0yKmIrMixhPWIsZDx0aGlzLnNpemUmJnRoaXMuaXNIaWdoZXJQcmlvcml0eShkLGEpJiYoYT1kKSxlPHRoaXMuc2l6ZSYmdGhpcy5pc0hpZ2hlclByaW9yaXR5KGUsYSkmJihhPWUpLGEhPT1iJiYoZD10aGlzLml0ZW1zW2JdLHRoaXMuaXRlbXNbYl09dGhpcy5pdGVtc1thXSx0aGlzLml0ZW1zW2FdPWQsdGhpcy5oZWFwaWZ5KGEpKSl9O2EucHJvdG90eXBlLnBlZWs9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5pdGVtc1swXS52YWx1ZX07YS5wcm90b3R5cGUucmVtb3ZlQXQ9ZnVuY3Rpb24oYil7dGhpcy5pdGVtc1tiXT1cbnRoaXMuaXRlbXNbLS10aGlzLnNpemVdO2RlbGV0ZSB0aGlzLml0ZW1zW3RoaXMuc2l6ZV07dGhpcy5oZWFwaWZ5KCk7aWYodGhpcy5zaXplPHRoaXMuaXRlbXMubGVuZ3RoPj4yKWZvcih2YXIgYj10aGlzLml0ZW1zLGE9dGhpcy5pdGVtcz1BcnJheSh0aGlzLml0ZW1zLmxlbmd0aD4+MSksZD10aGlzLnNpemU7MDxkOylhW2QrMC0xXT1iW2QrMC0xXSxkLS19O2EucHJvdG90eXBlLmRlcXVldWU9ZnVuY3Rpb24oKXt2YXIgYj10aGlzLnBlZWsoKTt0aGlzLnJlbW92ZUF0KDApO3JldHVybiBifTthLnByb3RvdHlwZS5lbnF1ZXVlPWZ1bmN0aW9uKGIpe3ZhciBjO2lmKHRoaXMuc2l6ZT49dGhpcy5pdGVtcy5sZW5ndGgpe2M9dGhpcy5pdGVtcztmb3IodmFyIGQ9dGhpcy5pdGVtcz1BcnJheSgyKnRoaXMuaXRlbXMubGVuZ3RoKSxlPWMubGVuZ3RoOzA8ZTspZFtlKzAtMV09Y1tlKzAtMV0sZS0tfWM9dGhpcy5zaXplKys7dGhpcy5pdGVtc1tjXT1uZXcga2EoYS5jb3VudCsrLGIpO3RoaXMucGVyY29sYXRlKGMpfTtcbmEucHJvdG90eXBlLnJlbW92ZT1mdW5jdGlvbihiKXt2YXIgYTtmb3IoYT0wO2E8dGhpcy5zaXplO2ErKylpZih0aGlzLml0ZW1zW2FdLnZhbHVlPT09YilyZXR1cm4gdGhpcy5yZW1vdmVBdChhKSwhMDtyZXR1cm4hMX07YS5jb3VudD0wO3JldHVybiBhfSgpLHA9bS5Db21wb3NpdGVEaXNwb3NhYmxlPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYSgpe3ZhciBiPSExLGE9dS5mcm9tQXJyYXkoeS5jYWxsKGFyZ3VtZW50cykpO3RoaXMuY291bnQ9ZnVuY3Rpb24oKXtyZXR1cm4gYS5jb3VudCgpfTt0aGlzLmFkZD1mdW5jdGlvbihkKXtiP2QuZGlzcG9zZSgpOmEuYWRkKGQpfTt0aGlzLnJlbW92ZT1mdW5jdGlvbihkKXt2YXIgZT0hMTtifHwoZT1hLnJlbW92ZShkKSk7ZSYmZC5kaXNwb3NlKCk7cmV0dXJuIGV9O3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe3ZhciBkLGU7Ynx8KGI9ITAsZD1hLnRvQXJyYXkoKSxhLmNsZWFyKCkpO2lmKGQhPT1uKWZvcihlPTA7ZTxkLmxlbmd0aDtlKyspZFtlXS5kaXNwb3NlKCl9O1xudGhpcy5jbGVhcj1mdW5jdGlvbigpe3ZhciBiLGU7Yj1hLnRvQXJyYXkoKTthLmNsZWFyKCk7Zm9yKGU9MDtlPGIubGVuZ3RoO2UrKyliW2VdLmRpc3Bvc2UoKX07dGhpcy5jb250YWlucz1mdW5jdGlvbihiKXtyZXR1cm4gYS5jb250YWlucyhiKX07dGhpcy5pc0Rpc3Bvc2VkPWZ1bmN0aW9uKCl7cmV0dXJuIGJ9O3RoaXMudG9BcnJheT1mdW5jdGlvbigpe3JldHVybiBhLnRvQXJyYXkoKX19YS5wcm90b3R5cGUuY291bnQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5jb3VudCgpfTthLnByb3RvdHlwZS5hZGQ9ZnVuY3Rpb24oYil7dGhpcy5hZGQoYil9O2EucHJvdG90eXBlLnJlbW92ZT1mdW5jdGlvbihiKXt0aGlzLnJlbW92ZShiKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe3RoaXMuZGlzcG9zZSgpfTthLnByb3RvdHlwZS5jbGVhcj1mdW5jdGlvbigpe3RoaXMuY2xlYXIoKX07YS5wcm90b3R5cGUuY29udGFpbnM9ZnVuY3Rpb24oYil7cmV0dXJuIHRoaXMuY29udGFpbnMoYil9O1xuYS5wcm90b3R5cGUuaXNEaXNwb3NlZD1mdW5jdGlvbigpe3JldHVybiB0aGlzLmlzRGlzcG9zZWQoKX07YS5wcm90b3R5cGUudG9BcnJheT1mdW5jdGlvbigpe3JldHVybiB0aGlzLnRvQXJyYXkoKX07cmV0dXJuIGF9KCksTD1tLkRpc3Bvc2FibGU9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGIpe3ZhciBhPSExO3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe2F8fChiKCksYT0hMCl9fWEucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXt0aGlzLmRpc3Bvc2UoKX07cmV0dXJuIGF9KCksQT1MLmNyZWF0ZT1mdW5jdGlvbihhKXtyZXR1cm4gbmV3IEwoYSl9LHc9TC5lbXB0eT1uZXcgTChmdW5jdGlvbigpe30pLHY9bS5TaW5nbGVBc3NpZ25tZW50RGlzcG9zYWJsZT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXt2YXIgYj0hMSxhPW51bGw7dGhpcy5pc0Rpc3Bvc2VkPWZ1bmN0aW9uKCl7cmV0dXJuIGJ9O3RoaXMuZ2V0RGlzcG9zYWJsZT1mdW5jdGlvbigpe3JldHVybiBhfTt0aGlzLnNldERpc3Bvc2FibGU9XG5mdW5jdGlvbihkKXtpZihudWxsIT09YSl0aHJvdyBFcnJvcihcIkRpc3Bvc2FibGUgaGFzIGFscmVhZHkgYmVlbiBhc3NpZ25lZFwiKTt2YXIgZT1iO2V8fChhPWQpO2UmJm51bGwhPT1kJiZkLmRpc3Bvc2UoKX07dGhpcy5kaXNwb3NlPWZ1bmN0aW9uKCl7dmFyIGQ9bnVsbDtifHwoYj0hMCxkPWEsYT1udWxsKTtudWxsIT09ZCYmZC5kaXNwb3NlKCl9fWEucHJvdG90eXBlLmlzRGlzcG9zZWQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5pc0Rpc3Bvc2VkKCl9O2EucHJvdG90eXBlLmRpc3Bvc2FibGU9ZnVuY3Rpb24oYil7aWYoYj09PW4pcmV0dXJuIHRoaXMuZ2V0RGlzcG9zYWJsZSgpO3RoaXMuc2V0RGlzcG9zYWJsZShiKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe3RoaXMuZGlzcG9zZSgpfTtyZXR1cm4gYX0oKSxDPW0uU2VyaWFsRGlzcG9zYWJsZT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXt2YXIgYj0hMSxhPW51bGw7dGhpcy5pc0Rpc3Bvc2VkPWZ1bmN0aW9uKCl7cmV0dXJuIGJ9O1xudGhpcy5nZXREaXNwb3NhYmxlPWZ1bmN0aW9uKCl7cmV0dXJuIGF9O3RoaXMuc2V0RGlzcG9zYWJsZT1mdW5jdGlvbihkKXt2YXIgZT1iLGc9bnVsbDtlfHwoZz1hLGE9ZCk7bnVsbCE9PWcmJmcuZGlzcG9zZSgpO2UmJm51bGwhPT1kJiZkLmRpc3Bvc2UoKX07dGhpcy5kaXNwb3NlPWZ1bmN0aW9uKCl7dmFyIGQ9bnVsbDtifHwoYj0hMCxkPWEsYT1udWxsKTtudWxsIT09ZCYmZC5kaXNwb3NlKCl9fWEucHJvdG90eXBlLmlzRGlzcG9zZWQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5pc0Rpc3Bvc2VkKCl9O2EucHJvdG90eXBlLmRpc3Bvc2FibGU9ZnVuY3Rpb24oYSl7aWYoYT09PW4pcmV0dXJuIHRoaXMuZ2V0RGlzcG9zYWJsZSgpO3RoaXMuc2V0RGlzcG9zYWJsZShhKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe3RoaXMuZGlzcG9zZSgpfTthLnByb3RvdHlwZS5kaXNwb3NlPWZ1bmN0aW9uKCl7dGhpcy5kaXNwb3NlKCl9O3JldHVybiBhfSgpLFo9bS5SZWZDb3VudERpc3Bvc2FibGU9XG5mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYSl7dmFyIGM9ITEsZD0hMSxlPTA7dGhpcy5kaXNwb3NlPWZ1bmN0aW9uKCl7dmFyIGc9ITE7IWMmJiFkJiYoZD0hMCwwPT09ZSYmKGc9Yz0hMCkpO2cmJmEuZGlzcG9zZSgpfTt0aGlzLmdldERpc3Bvc2FibGU9ZnVuY3Rpb24oKXtpZihjKXJldHVybiB3O2UrKzt2YXIgZz0hMTtyZXR1cm57ZGlzcG9zZTpmdW5jdGlvbigpe3ZhciBoPSExOyFjJiYhZyYmKGc9ITAsZS0tLDA9PT1lJiZkJiYoaD1jPSEwKSk7aCYmYS5kaXNwb3NlKCl9fX07dGhpcy5pc0Rpc3Bvc2VkPWZ1bmN0aW9uKCl7cmV0dXJuIGN9fWEucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXt0aGlzLmRpc3Bvc2UoKX07YS5wcm90b3R5cGUuZ2V0RGlzcG9zYWJsZT1mdW5jdGlvbigpe3JldHVybiB0aGlzLmdldERpc3Bvc2FibGUoKX07YS5wcm90b3R5cGUuaXNEaXNwb3NlZD1mdW5jdGlvbigpe3JldHVybiB0aGlzLmlzRGlzcG9zZWQoKX07cmV0dXJuIGF9KCksUjtSPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShhLFxuYyxkLGUsZyl7dGhpcy5zY2hlZHVsZXI9YTt0aGlzLnN0YXRlPWM7dGhpcy5hY3Rpb249ZDt0aGlzLmR1ZVRpbWU9ZTt0aGlzLmNvbXBhcmVyPWd8fGZ1bmN0aW9uKGEsYil7cmV0dXJuIGEtYn07dGhpcy5kaXNwb3NhYmxlPW5ldyB2fWEucHJvdG90eXBlLmludm9rZT1mdW5jdGlvbigpe3JldHVybiB0aGlzLmRpc3Bvc2FibGUuZGlzcG9zYWJsZSh0aGlzLmludm9rZUNvcmUoKSl9O2EucHJvdG90eXBlLmNvbXBhcmVUbz1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5jb21wYXJlcih0aGlzLmR1ZVRpbWUsYS5kdWVUaW1lKX07YS5wcm90b3R5cGUuaXNDYW5jZWxsZWQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5kaXNwb3NhYmxlLmlzRGlzcG9zZWQoKX07YS5wcm90b3R5cGUuaW52b2tlQ29yZT1mdW5jdGlvbigpe3JldHVybiB0aGlzLmFjdGlvbih0aGlzLnNjaGVkdWxlcix0aGlzLnN0YXRlKX07cmV0dXJuIGF9KCk7dmFyIHM9bS5TY2hlZHVsZXI9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGEsXG5iLGMsZCl7dGhpcy5ub3c9YTt0aGlzLl9zY2hlZHVsZT1iO3RoaXMuX3NjaGVkdWxlUmVsYXRpdmU9Yzt0aGlzLl9zY2hlZHVsZUFic29sdXRlPWR9dmFyIGI9ZnVuY3Rpb24oYSxiKXt2YXIgYyxkLGUsaztkPW5ldyBwO2s9Yi5maXJzdDtjPWIuc2Vjb25kO2U9bnVsbDtlPWZ1bmN0aW9uKGIpe2MoYixmdW5jdGlvbihiKXt2YXIgYyxoLGw7bD1oPSExO2M9bnVsbDtjPWEuc2NoZWR1bGVXaXRoU3RhdGUoYixmdW5jdGlvbihhLGIpe2g/ZC5yZW1vdmUoYyk6bD0hMDtlKGIpO3JldHVybiB3fSk7bHx8KGQuYWRkKGMpLGg9ITApfSl9O2Uoayk7cmV0dXJuIGR9LGM9ZnVuY3Rpb24oYSxiKXt2YXIgYyxkLGUsaztkPW5ldyBwO2s9Yi5maXJzdDtjPWIuc2Vjb25kO2U9ZnVuY3Rpb24oYil7YyhiLGZ1bmN0aW9uKGIsYyl7dmFyIGgsbCxrO2s9bD0hMTtoPWEuc2NoZWR1bGVXaXRoUmVsYXRpdmVBbmRTdGF0ZShiLGMsZnVuY3Rpb24oYSxiKXtsP2QucmVtb3ZlKGgpOms9ITA7ZShiKTtyZXR1cm4gd30pO1xua3x8KGQuYWRkKGgpLGw9ITApfSl9O2Uoayk7cmV0dXJuIGR9LGQ9ZnVuY3Rpb24oYSxiKXt2YXIgYyxkLGUsaztkPW5ldyBwO2s9Yi5maXJzdDtjPWIuc2Vjb25kO2U9ZnVuY3Rpb24oYil7YyhiLGZ1bmN0aW9uKGIsYyl7dmFyIGg9ITEsbD0hMSxrPWEuc2NoZWR1bGVXaXRoQWJzb2x1dGVBbmRTdGF0ZShiLGMsZnVuY3Rpb24oYSxiKXtoP2QucmVtb3ZlKGspOmw9ITA7ZShiKTtyZXR1cm4gd30pO2x8fChkLmFkZChrKSxoPSEwKX0pfTtlKGspO3JldHVybiBkfSxlPWZ1bmN0aW9uKGEsYil7YigpO3JldHVybiB3fTthLnByb3RvdHlwZS5zY2hlZHVsZT1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5fc2NoZWR1bGUoYSxlKX07YS5wcm90b3R5cGUuc2NoZWR1bGVXaXRoU3RhdGU9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gdGhpcy5fc2NoZWR1bGUoYSxiKX07YS5wcm90b3R5cGUuc2NoZWR1bGVXaXRoUmVsYXRpdmU9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gdGhpcy5fc2NoZWR1bGVSZWxhdGl2ZShiLFxuYSxlKX07YS5wcm90b3R5cGUuc2NoZWR1bGVXaXRoUmVsYXRpdmVBbmRTdGF0ZT1mdW5jdGlvbihhLGIsYyl7cmV0dXJuIHRoaXMuX3NjaGVkdWxlUmVsYXRpdmUoYSxiLGMpfTthLnByb3RvdHlwZS5zY2hlZHVsZVdpdGhBYnNvbHV0ZT1mdW5jdGlvbihhLGIpe3JldHVybiB0aGlzLl9zY2hlZHVsZUFic29sdXRlKGIsYSxlKX07YS5wcm90b3R5cGUuc2NoZWR1bGVXaXRoQWJzb2x1dGVBbmRTdGF0ZT1mdW5jdGlvbihhLGIsYyl7cmV0dXJuIHRoaXMuX3NjaGVkdWxlQWJzb2x1dGUoYSxiLGMpfTthLnByb3RvdHlwZS5zY2hlZHVsZVJlY3Vyc2l2ZT1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhTdGF0ZShhLGZ1bmN0aW9uKGEsYil7YShmdW5jdGlvbigpe2IoYSl9KX0pfTthLnByb3RvdHlwZS5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhTdGF0ZT1mdW5jdGlvbihhLGMpe3JldHVybiB0aGlzLnNjaGVkdWxlV2l0aFN0YXRlKHtmaXJzdDphLHNlY29uZDpjfSxcbmZ1bmN0aW9uKGEsYyl7cmV0dXJuIGIoYSxjKX0pfTthLnByb3RvdHlwZS5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhSZWxhdGl2ZT1mdW5jdGlvbihhLGIpe3JldHVybiB0aGlzLnNjaGVkdWxlUmVjdXJzaXZlV2l0aFJlbGF0aXZlQW5kU3RhdGUoYixhLGZ1bmN0aW9uKGEsYil7YShmdW5jdGlvbihjKXtiKGEsYyl9KX0pfTthLnByb3RvdHlwZS5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhSZWxhdGl2ZUFuZFN0YXRlPWZ1bmN0aW9uKGEsYixkKXtyZXR1cm4gdGhpcy5fc2NoZWR1bGVSZWxhdGl2ZSh7Zmlyc3Q6YSxzZWNvbmQ6ZH0sYixmdW5jdGlvbihhLGIpe3JldHVybiBjKGEsYil9KX07YS5wcm90b3R5cGUuc2NoZWR1bGVSZWN1cnNpdmVXaXRoQWJzb2x1dGU9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gdGhpcy5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhBYnNvbHV0ZUFuZFN0YXRlKGIsYSxmdW5jdGlvbihhLGIpe2EoZnVuY3Rpb24oYyl7YihhLGMpfSl9KX07YS5wcm90b3R5cGUuc2NoZWR1bGVSZWN1cnNpdmVXaXRoQWJzb2x1dGVBbmRTdGF0ZT1cbmZ1bmN0aW9uKGEsYixjKXtyZXR1cm4gdGhpcy5fc2NoZWR1bGVBYnNvbHV0ZSh7Zmlyc3Q6YSxzZWNvbmQ6Y30sYixmdW5jdGlvbihhLGIpe3JldHVybiBkKGEsYil9KX07YS5ub3c9SjthLm5vcm1hbGl6ZT1mdW5jdGlvbihhKXswPmEmJihhPTApO3JldHVybiBhfTtyZXR1cm4gYX0oKSxmPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYSgpe3ZhciBiPXRoaXM7YS5iYXNlLmNvbnN0cnVjdG9yLmNhbGwodGhpcyxKLGZ1bmN0aW9uKGEsZCl7cmV0dXJuIGQoYixhKX0sZnVuY3Rpb24oYSxkLGUpe2Zvcig7MDxzLm5vcm1hbGl6ZShkKTspO3JldHVybiBlKGIsYSl9LGZ1bmN0aW9uKGEsZCxlKXtyZXR1cm4gYi5zY2hlZHVsZVdpdGhSZWxhdGl2ZUFuZFN0YXRlKGEsZC1iLm5vdygpLGUpfSl9byhhLHMpO3JldHVybiBhfSgpLEI9cy5JbW1lZGlhdGU9bmV3IGYsbGE9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKCl7TS5xdWV1ZT1uZXcgWSg0KX1hLnByb3RvdHlwZS5kaXNwb3NlPWZ1bmN0aW9uKCl7TS5xdWV1ZT1cbm51bGx9O2EucHJvdG90eXBlLnJ1bj1mdW5jdGlvbigpe2Zvcih2YXIgYSxjPU0ucXVldWU7MDxjLmNvdW50KCk7KWlmKGE9Yy5kZXF1ZXVlKCksIWEuaXNDYW5jZWxsZWQoKSl7Zm9yKDswPGEuZHVlVGltZS1zLm5vdygpOyk7YS5pc0NhbmNlbGxlZCgpfHxhLmludm9rZSgpfX07cmV0dXJuIGF9KCksTT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXt2YXIgYj10aGlzO2EuYmFzZS5jb25zdHJ1Y3Rvci5jYWxsKHRoaXMsSixmdW5jdGlvbihhLGQpe3JldHVybiBiLnNjaGVkdWxlV2l0aFJlbGF0aXZlQW5kU3RhdGUoYSwwLGQpfSxmdW5jdGlvbihjLGQsZSl7dmFyIGc9Yi5ub3coKStzLm5vcm1hbGl6ZShkKSxkPWEucXVldWUsYz1uZXcgUihiLGMsZSxnKTtpZihudWxsPT09ZCl7ZT1uZXcgbGE7dHJ5e2EucXVldWUuZW5xdWV1ZShjKSxlLnJ1bigpfWZpbmFsbHl7ZS5kaXNwb3NlKCl9fWVsc2UgZC5lbnF1ZXVlKGMpO3JldHVybiBjLmRpc3Bvc2FibGV9LGZ1bmN0aW9uKGEsZCxlKXtyZXR1cm4gYi5zY2hlZHVsZVdpdGhSZWxhdGl2ZUFuZFN0YXRlKGEsXG5kLWIubm93KCksZSl9KX1vKGEscyk7YS5wcm90b3R5cGUuc2NoZWR1bGVSZXF1aXJlZD1mdW5jdGlvbigpe3JldHVybiBudWxsPT09YS5xdWV1ZX07YS5wcm90b3R5cGUuZW5zdXJlVHJhbXBvbGluZT1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5zY2hlZHVsZVJlcXVpcmVkKCk/dGhpcy5zY2hlZHVsZShhKTphKCl9O2EucXVldWU9bnVsbDtyZXR1cm4gYX0oKSxEPXMuQ3VycmVudFRocmVhZD1uZXcgTTttLlZpcnR1YWxUaW1lU2NoZWR1bGVyPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShiLGMpe3ZhciBkPXRoaXM7dGhpcy5jbG9jaz1iO3RoaXMuY29tcGFyZXI9Yzt0aGlzLmlzRW5hYmxlZD0hMTthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzLGZ1bmN0aW9uKCl7cmV0dXJuIGQudG9EYXRlVGltZU9mZnNldChkLmNsb2NrKX0sZnVuY3Rpb24oYSxiKXtyZXR1cm4gZC5zY2hlZHVsZUFic29sdXRlKGEsZC5jbG9jayxiKX0sZnVuY3Rpb24oYSxiLGMpe3JldHVybiBkLnNjaGVkdWxlUmVsYXRpdmUoYSxcbmQudG9SZWxhdGl2ZShiKSxjKX0sZnVuY3Rpb24oYSxiLGMpe3JldHVybiBkLnNjaGVkdWxlUmVsYXRpdmUoYSxkLnRvUmVsYXRpdmUoYi1kLm5vdygpKSxjKX0pO3RoaXMucXVldWU9bmV3IFkoMTAyNCl9byhhLHMpO2EucHJvdG90eXBlLnNjaGVkdWxlUmVsYXRpdmU9ZnVuY3Rpb24oYSxjLGQpe2M9dGhpcy5hZGQodGhpcy5jbG9jayxjKTtyZXR1cm4gdGhpcy5zY2hlZHVsZUFic29sdXRlKGEsYyxkKX07YS5wcm90b3R5cGUuc3RhcnQ9ZnVuY3Rpb24oKXt2YXIgYTtpZighdGhpcy5pc0VuYWJsZWQpe3RoaXMuaXNFbmFibGVkPSEwO2RvIGlmKGE9dGhpcy5nZXROZXh0KCksbnVsbCE9PWEpe2lmKDA8dGhpcy5jb21wYXJlcihhLmR1ZVRpbWUsdGhpcy5jbG9jaykpdGhpcy5jbG9jaz1hLmR1ZVRpbWU7YS5pbnZva2UoKX1lbHNlIHRoaXMuaXNFbmFibGVkPSExO3doaWxlKHRoaXMuaXNFbmFibGVkKX19O2EucHJvdG90eXBlLnN0b3A9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5pc0VuYWJsZWQ9XG4hMX07YS5wcm90b3R5cGUuYWR2YW5jZVRvPWZ1bmN0aW9uKGEpe3ZhciBjO2lmKDA8PXRoaXMuY29tcGFyZXIodGhpcy5jbG9jayxhKSl0aHJvdyBFcnJvcihcIkFyZ3VtZW50IG91dCBvZiByYW5nZVwiKTtpZighdGhpcy5pc0VuYWJsZWQpe3RoaXMuaXNFbmFibGVkPSEwO2RvIGlmKGM9dGhpcy5nZXROZXh0KCksbnVsbCE9PWMmJjA+PXRoaXMuY29tcGFyZXIoYy5kdWVUaW1lLGEpKXtpZigwPHRoaXMuY29tcGFyZXIoYy5kdWVUaW1lLHRoaXMuY2xvY2spKXRoaXMuY2xvY2s9Yy5kdWVUaW1lO2MuaW52b2tlKCl9ZWxzZSB0aGlzLmlzRW5hYmxlZD0hMTt3aGlsZSh0aGlzLmlzRW5hYmxlZCk7cmV0dXJuIHRoaXMuY2xvY2s9YX19O2EucHJvdG90eXBlLmFkdmFuY2VCeT1mdW5jdGlvbihhKXthPXRoaXMuYWRkKHRoaXMuY2xvY2ssYSk7aWYoMDw9dGhpcy5jb21wYXJlcih0aGlzLmNsb2NrLGEpKXRocm93IEVycm9yKFwiQXJndW1lbnQgb3V0IG9mIHJhbmdlXCIpO3JldHVybiB0aGlzLmFkdmFuY2VUbyhhKX07XG5hLnByb3RvdHlwZS5nZXROZXh0PWZ1bmN0aW9uKCl7Zm9yKHZhciBhOzA8dGhpcy5xdWV1ZS5jb3VudCgpOylpZihhPXRoaXMucXVldWUucGVlaygpLGEuaXNDYW5jZWxsZWQoKSl0aGlzLnF1ZXVlLmRlcXVldWUoKTtlbHNlIHJldHVybiBhO3JldHVybiBudWxsfTthLnByb3RvdHlwZS5zY2hlZHVsZUFic29sdXRlPWZ1bmN0aW9uKGEsYyxkKXt2YXIgZT10aGlzLGc9bmV3IFIoZSxhLGZ1bmN0aW9uKGEsYil7ZS5xdWV1ZS5yZW1vdmUoZyk7cmV0dXJuIGQoYSxiKX0sYyxlLmNvbXBhcmVyKTtlLnF1ZXVlLmVucXVldWUoZyk7cmV0dXJuIGcuZGlzcG9zYWJsZX07cmV0dXJuIGF9KCk7dmFyIGY9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKCl7dmFyIGI9dGhpczthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzLEosZnVuY3Rpb24oYSxkKXt2YXIgZT14LnNldFRpbWVvdXQoZnVuY3Rpb24oKXtkKGIsYSl9LDApO3JldHVybiBBKGZ1bmN0aW9uKCl7eC5jbGVhclRpbWVvdXQoZSl9KX0sZnVuY3Rpb24oYSxcbmQsZSl7dmFyIGcsZD1zLm5vcm1hbGl6ZShkKTtnPXguc2V0VGltZW91dChmdW5jdGlvbigpe2UoYixhKX0sZCk7cmV0dXJuIEEoZnVuY3Rpb24oKXt4LmNsZWFyVGltZW91dChnKX0pfSxmdW5jdGlvbihhLGQsZSl7cmV0dXJuIGIuc2NoZWR1bGVXaXRoUmVsYXRpdmVBbmRTdGF0ZShhLGQtYi5ub3coKSxlKX0pfW8oYSxzKTtyZXR1cm4gYX0oKSxtYT1zLlRpbWVvdXQ9bmV3IGYsdD1tLk5vdGlmaWNhdGlvbj1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXt9YS5wcm90b3R5cGUuYWNjZXB0PWZ1bmN0aW9uKGEsYyxkKXtyZXR1cm4gMTxhcmd1bWVudHMubGVuZ3RofHxcImZ1bmN0aW9uXCI9PT10eXBlb2YgYT90aGlzLl9hY2NlcHQoYSxjLGQpOnRoaXMuX2FjY2VwdE9ic2VydmFibGUoYSl9O2EucHJvdG90eXBlLnRvT2JzZXJ2YWJsZT1mdW5jdGlvbihhKXt2YXIgYz10aGlzLGE9YXx8cy5JbW1lZGlhdGU7cmV0dXJuIGkoZnVuY3Rpb24oZCl7cmV0dXJuIGEuc2NoZWR1bGUoZnVuY3Rpb24oKXtjLl9hY2NlcHRPYnNlcnZhYmxlKGQpO1xuaWYoXCJOXCI9PT1jLmtpbmQpZC5vbkNvbXBsZXRlZCgpfSl9KX07YS5wcm90b3R5cGUuaGFzVmFsdWU9ITE7YS5wcm90b3R5cGUuZXF1YWxzPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLnRvU3RyaW5nKCk9PT0oYT09PW58fG51bGw9PT1hP1wiXCI6YS50b1N0cmluZygpKX07cmV0dXJuIGF9KCk7dC5jcmVhdGVPbk5leHQ9ZnVuY3Rpb24oYSl7dmFyIGI9bmV3IHQ7Yi52YWx1ZT1hO2IuaGFzVmFsdWU9ITA7Yi5raW5kPVwiTlwiO2IuX2FjY2VwdD1mdW5jdGlvbihhKXtyZXR1cm4gYSh0aGlzLnZhbHVlKX07Yi5fYWNjZXB0T2JzZXJ2YWJsZT1mdW5jdGlvbihhKXtyZXR1cm4gYS5vbk5leHQodGhpcy52YWx1ZSl9O2IudG9TdHJpbmc9ZnVuY3Rpb24oKXtyZXR1cm5cIk9uTmV4dChcIit0aGlzLnZhbHVlK1wiKVwifTtyZXR1cm4gYn07dC5jcmVhdGVPbkVycm9yPWZ1bmN0aW9uKGEpe3ZhciBiPW5ldyB0O2IuZXhjZXB0aW9uPWE7Yi5raW5kPVwiRVwiO2IuX2FjY2VwdD1mdW5jdGlvbihhLGIpe3JldHVybiBiKHRoaXMuZXhjZXB0aW9uKX07XG5iLl9hY2NlcHRPYnNlcnZhYmxlPWZ1bmN0aW9uKGEpe3JldHVybiBhLm9uRXJyb3IodGhpcy5leGNlcHRpb24pfTtiLnRvU3RyaW5nPWZ1bmN0aW9uKCl7cmV0dXJuXCJPbkVycm9yKFwiK3RoaXMuZXhjZXB0aW9uK1wiKVwifTtyZXR1cm4gYn07dC5jcmVhdGVPbkNvbXBsZXRlZD1mdW5jdGlvbigpe3ZhciBhPW5ldyB0O2Eua2luZD1cIkNcIjthLl9hY2NlcHQ9ZnVuY3Rpb24oYSxjLGQpe3JldHVybiBkKCl9O2EuX2FjY2VwdE9ic2VydmFibGU9ZnVuY3Rpb24oYSl7cmV0dXJuIGEub25Db21wbGV0ZWQoKX07YS50b1N0cmluZz1mdW5jdGlvbigpe3JldHVyblwiT25Db21wbGV0ZWQoKVwifTtyZXR1cm4gYX07dmFyIEc9ZnVuY3Rpb24oKXt9LGY9Ry5wcm90b3R5cGU7Zi5jb25jYXQ9ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGIpe3ZhciBjLGQ9YS5nZXRFbnVtZXJhdG9yKCksZT0hMSxnPW5ldyBDO2M9Qi5zY2hlZHVsZVJlY3Vyc2l2ZShmdW5jdGlvbihhKXt2YXIgYyxcbnoscT0hMTtpZighZSl7dHJ5e2lmKHE9ZC5tb3ZlTmV4dCgpKWM9ZC5jdXJyZW50fWNhdGNoKGspe3o9a31pZih2b2lkIDAhPT16KWIub25FcnJvcih6KTtlbHNlIGlmKHEpej1uZXcgdixnLmRpc3Bvc2FibGUoeiksei5kaXNwb3NhYmxlKGMuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2Iub25OZXh0KGEpfSxmdW5jdGlvbihhKXtiLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7YSgpfSkpO2Vsc2UgYi5vbkNvbXBsZXRlZCgpfX0pO3JldHVybiBuZXcgcChnLGMsQShmdW5jdGlvbigpe2U9ITB9KSl9KX07Zi5jYXRjaEV4Y2VwdGlvbj1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYil7dmFyIGMsZD1hLmdldEVudW1lcmF0b3IoKSxlPSExLGcsaDtnPW5ldyBDO2M9Qi5zY2hlZHVsZVJlY3Vyc2l2ZShmdW5jdGlvbihhKXt2YXIgYyxxLGs7az0hMTtpZighZSl7dHJ5e2lmKGs9ZC5tb3ZlTmV4dCgpKWM9ZC5jdXJyZW50fWNhdGNoKGYpe3E9Zn1pZih2b2lkIDAhPT1xKWIub25FcnJvcihxKTtcbmVsc2UgaWYoaylxPW5ldyB2LGcuZGlzcG9zYWJsZShxKSxxLmRpc3Bvc2FibGUoYy5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7Yi5vbk5leHQoYSl9LGZ1bmN0aW9uKGIpe2g9YjthKCl9LGZ1bmN0aW9uKCl7Yi5vbkNvbXBsZXRlZCgpfSkpO2Vsc2UgaWYodm9pZCAwIT09aCliLm9uRXJyb3IoaCk7ZWxzZSBiLm9uQ29tcGxldGVkKCl9fSk7cmV0dXJuIG5ldyBwKGcsYyxBKGZ1bmN0aW9uKCl7ZT0hMH0pKX0pfTt2YXIgJD1HLnJlcGVhdD1mdW5jdGlvbihhLGIpe2I9PT1uJiYoYj0tMSk7dmFyIGM9bmV3IEc7Yy5nZXRFbnVtZXJhdG9yPWZ1bmN0aW9uKCl7cmV0dXJue2xlZnQ6YixjdXJyZW50Om51bGwsbW92ZU5leHQ6ZnVuY3Rpb24oKXtpZigwPT09dGhpcy5sZWZ0KXJldHVybiB0aGlzLmN1cnJlbnQ9bnVsbCwhMTswPHRoaXMubGVmdCYmdGhpcy5sZWZ0LS07dGhpcy5jdXJyZW50PWE7cmV0dXJuITB9fX07cmV0dXJuIGN9LFM9Ry5mb3JFbnVtZXJhdG9yPWZ1bmN0aW9uKGEpe3ZhciBiPVxubmV3IEc7Yi5nZXRFbnVtZXJhdG9yPWZ1bmN0aW9uKCl7cmV0dXJue19pbmRleDotMSxjdXJyZW50Om51bGwsbW92ZU5leHQ6ZnVuY3Rpb24oKXtpZigrK3RoaXMuX2luZGV4PGEubGVuZ3RoKXJldHVybiB0aGlzLmN1cnJlbnQ9YVt0aGlzLl9pbmRleF0sITA7dGhpcy5faW5kZXg9LTE7dGhpcy5jdXJyZW50PW51bGw7cmV0dXJuITF9fX07cmV0dXJuIGJ9LHI9bS5PYnNlcnZlcj1mdW5jdGlvbigpe30sVD1tLkludGVybmFscy5BYnN0cmFjdE9ic2VydmVyPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYSgpe3RoaXMuaXNTdG9wcGVkPSExfW8oYSxyKTthLnByb3RvdHlwZS5vbk5leHQ9ZnVuY3Rpb24oYSl7dGhpcy5pc1N0b3BwZWR8fHRoaXMubmV4dChhKX07YS5wcm90b3R5cGUub25FcnJvcj1mdW5jdGlvbihhKXtpZighdGhpcy5pc1N0b3BwZWQpdGhpcy5pc1N0b3BwZWQ9ITAsdGhpcy5lcnJvcihhKX07YS5wcm90b3R5cGUub25Db21wbGV0ZWQ9ZnVuY3Rpb24oKXtpZighdGhpcy5pc1N0b3BwZWQpdGhpcy5pc1N0b3BwZWQ9XG4hMCx0aGlzLmNvbXBsZXRlZCgpfTthLnByb3RvdHlwZS5kaXNwb3NlPWZ1bmN0aW9uKCl7dGhpcy5pc1N0b3BwZWQ9ITB9O3JldHVybiBhfSgpLE49ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGIsYyxkKXthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzKTt0aGlzLl9vbk5leHQ9Yjt0aGlzLl9vbkVycm9yPWM7dGhpcy5fb25Db21wbGV0ZWQ9ZH1vKGEsVCk7YS5wcm90b3R5cGUubmV4dD1mdW5jdGlvbihhKXt0aGlzLl9vbk5leHQoYSl9O2EucHJvdG90eXBlLmVycm9yPWZ1bmN0aW9uKGEpe3RoaXMuX29uRXJyb3IoYSl9O2EucHJvdG90eXBlLmNvbXBsZXRlZD1mdW5jdGlvbigpe3RoaXMuX29uQ29tcGxldGVkKCl9O3JldHVybiBhfSgpLEg9bS5JbnRlcm5hbHMuQmluYXJ5T2JzZXJ2ZXI9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGEsYyl7XCJmdW5jdGlvblwiPT09dHlwZW9mIGEmJlwiZnVuY3Rpb25cIj09PXR5cGVvZiBjPyh0aGlzLmxlZnRPYnNlcnZlcj1hYShhKSx0aGlzLnJpZ2h0T2JzZXJ2ZXI9XG5hYShjKSk6KHRoaXMubGVmdE9ic2VydmVyPWEsdGhpcy5yaWdodE9ic2VydmVyPWMpfW8oYSxyKTthLnByb3RvdHlwZS5vbk5leHQ9ZnVuY3Rpb24oYSl7dmFyIGM9dGhpcztyZXR1cm4gYS5zd2l0Y2hWYWx1ZShmdW5jdGlvbihhKXtyZXR1cm4gYS5hY2NlcHQoYy5sZWZ0T2JzZXJ2ZXIpfSxmdW5jdGlvbihhKXtyZXR1cm4gYS5hY2NlcHQoYy5yaWdodE9ic2VydmVyKX0pfTthLnByb3RvdHlwZS5vbkVycm9yPWZ1bmN0aW9uKCl7fTthLnByb3RvdHlwZS5vbkNvbXBsZXRlZD1mdW5jdGlvbigpe307cmV0dXJuIGF9KCksbmE9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGEsYyl7dGhpcy5zY2hlZHVsZXI9YTt0aGlzLm9ic2VydmVyPWM7dGhpcy5oYXNGYXVsdGVkPXRoaXMuaXNBY3F1aXJlZD0hMTt0aGlzLnF1ZXVlPVtdO3RoaXMuZGlzcG9zYWJsZT1uZXcgQ31vKGEsVCk7YS5wcm90b3R5cGUuZW5zdXJlQWN0aXZlPWZ1bmN0aW9uKCl7dmFyIGE9ITEsYz10aGlzO2lmKCF0aGlzLmhhc0ZhdWx0ZWQmJlxuMDx0aGlzLnF1ZXVlLmxlbmd0aClhPSF0aGlzLmlzQWNxdWlyZWQsdGhpcy5pc0FjcXVpcmVkPSEwO2EmJnRoaXMuZGlzcG9zYWJsZS5kaXNwb3NhYmxlKHRoaXMuc2NoZWR1bGVyLnNjaGVkdWxlUmVjdXJzaXZlKGZ1bmN0aW9uKGEpe3ZhciBiO2lmKDA8Yy5xdWV1ZS5sZW5ndGgpe2I9Yy5xdWV1ZS5zaGlmdCgpO3RyeXtiKCl9Y2F0Y2goZyl7dGhyb3cgYy5xdWV1ZT1bXSxjLmhhc0ZhdWx0ZWQ9ITAsZzt9YSgpfWVsc2UgYy5pc0FjcXVpcmVkPSExfSkpfTthLnByb3RvdHlwZS5uZXh0PWZ1bmN0aW9uKGEpe3ZhciBjPXRoaXM7dGhpcy5xdWV1ZS5wdXNoKGZ1bmN0aW9uKCl7Yy5vYnNlcnZlci5vbk5leHQoYSl9KX07YS5wcm90b3R5cGUuZXJyb3I9ZnVuY3Rpb24oYSl7dmFyIGM9dGhpczt0aGlzLnF1ZXVlLnB1c2goZnVuY3Rpb24oKXtjLm9ic2VydmVyLm9uRXJyb3IoYSl9KX07YS5wcm90b3R5cGUuY29tcGxldGVkPWZ1bmN0aW9uKCl7dmFyIGE9dGhpczt0aGlzLnF1ZXVlLnB1c2goZnVuY3Rpb24oKXthLm9ic2VydmVyLm9uQ29tcGxldGVkKCl9KX07XG5hLnByb3RvdHlwZS5kaXNwb3NlPWZ1bmN0aW9uKCl7YS5iYXNlLmRpc3Bvc2UuY2FsbCh0aGlzKTt0aGlzLmRpc3Bvc2FibGUuZGlzcG9zZSgpfTtyZXR1cm4gYX0oKSxJPXIuY3JlYXRlPWZ1bmN0aW9uKGEsYixjKXtifHwoYj1mdW5jdGlvbihhKXt0aHJvdyBhO30pO2N8fChjPWZ1bmN0aW9uKCl7fSk7cmV0dXJuIG5ldyBOKGEsYixjKX07ci5mcm9tTm90aWZpZXI9ZnVuY3Rpb24oYSl7cmV0dXJuIG5ldyBOKGZ1bmN0aW9uKGIpe3JldHVybiBhKHQuY3JlYXRlT25OZXh0KGIpKX0sZnVuY3Rpb24oYil7cmV0dXJuIGEodC5jcmVhdGVPbkVycm9yKGIpKX0sZnVuY3Rpb24oKXtyZXR1cm4gYSh0LmNyZWF0ZU9uQ29tcGxldGVkKCkpfSl9O3ZhciBhYT1mdW5jdGlvbihhKXtyZXR1cm4gbmV3IE4oZnVuY3Rpb24oYil7YSh0LmNyZWF0ZU9uTmV4dChiKSl9LGZ1bmN0aW9uKGIpe2EodC5jcmVhdGVPbkVycm9yKGIpKX0sZnVuY3Rpb24oKXthKHQuY3JlYXRlT25Db21wbGV0ZWQoKSl9KX07XG5yLnByb3RvdHlwZS50b05vdGlmaWVyPWZ1bmN0aW9uKCl7dmFyIGE9dGhpcztyZXR1cm4gZnVuY3Rpb24oYil7cmV0dXJuIGIuYWNjZXB0KGEpfX07ci5wcm90b3R5cGUuYXNPYnNlcnZlcj1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIG5ldyBOKGZ1bmN0aW9uKGIpe3JldHVybiBhLm9uTmV4dChiKX0sZnVuY3Rpb24oYil7cmV0dXJuIGEub25FcnJvcihiKX0sZnVuY3Rpb24oKXtyZXR1cm4gYS5vbkNvbXBsZXRlZCgpfSl9O3ZhciBqPW0uT2JzZXJ2YWJsZT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXt9YS5wcm90b3R5cGUuc3Vic2NyaWJlPWZ1bmN0aW9uKGEsYyxkKXtyZXR1cm4gdGhpcy5fc3Vic2NyaWJlKDA9PT1hcmd1bWVudHMubGVuZ3RofHwxPGFyZ3VtZW50cy5sZW5ndGh8fFwiZnVuY3Rpb25cIj09PXR5cGVvZiBhP0koYSxjLGQpOmEpfTtyZXR1cm4gYX0oKSxmPWoucHJvdG90eXBlLHBhPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShiKXthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzKTtcbnRoaXMuX3N1YnNjcmliZT1mdW5jdGlvbihhKXt2YXIgZD1uZXcgb2EoYSk7RC5zY2hlZHVsZVJlcXVpcmVkKCk/RC5zY2hlZHVsZShmdW5jdGlvbigpe2QuZGlzcG9zYWJsZShiKGQpKX0pOmQuZGlzcG9zYWJsZShiKGQpKTtyZXR1cm4gZH19byhhLGopO2EucHJvdG90eXBlLl9zdWJzY3JpYmU9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuX3N1YnNjcmliZShhKX07cmV0dXJuIGF9KCksb2E9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGIpe2EuYmFzZS5jb25zdHJ1Y3Rvci5jYWxsKHRoaXMpO3RoaXMub2JzZXJ2ZXI9Yjt0aGlzLm09bmV3IHZ9byhhLFQpO2EucHJvdG90eXBlLmRpc3Bvc2FibGU9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMubS5kaXNwb3NhYmxlKGEpfTthLnByb3RvdHlwZS5uZXh0PWZ1bmN0aW9uKGEpe3RoaXMub2JzZXJ2ZXIub25OZXh0KGEpfTthLnByb3RvdHlwZS5lcnJvcj1mdW5jdGlvbihhKXt0aGlzLm9ic2VydmVyLm9uRXJyb3IoYSk7dGhpcy5tLmRpc3Bvc2UoKX07XG5hLnByb3RvdHlwZS5jb21wbGV0ZWQ9ZnVuY3Rpb24oKXt0aGlzLm9ic2VydmVyLm9uQ29tcGxldGVkKCk7dGhpcy5tLmRpc3Bvc2UoKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe2EuYmFzZS5kaXNwb3NlLmNhbGwodGhpcyk7dGhpcy5tLmRpc3Bvc2UoKX07cmV0dXJuIGF9KCksYmE9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGIsYyxkKXthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzKTt0aGlzLmtleT1iO3RoaXMudW5kZXJseWluZ09ic2VydmFibGU9IWQ/YzppKGZ1bmN0aW9uKGEpe3JldHVybiBuZXcgcChkLmdldERpc3Bvc2FibGUoKSxjLnN1YnNjcmliZShhKSl9KX1vKGEsaik7YS5wcm90b3R5cGUuX3N1YnNjcmliZT1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy51bmRlcmx5aW5nT2JzZXJ2YWJsZS5zdWJzY3JpYmUoYSl9O3JldHVybiBhfSgpLHFhPW0uQ29ubmVjdGFibGVPYnNlcnZhYmxlPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShhLGMpe3ZhciBkPWEuYXNPYnNlcnZhYmxlKCksXG5lPSExLGc9bnVsbDt0aGlzLmNvbm5lY3Q9ZnVuY3Rpb24oKXtlfHwoZT0hMCxnPW5ldyBwKGQuc3Vic2NyaWJlKGMpLEEoZnVuY3Rpb24oKXtlPSExfSkpKTtyZXR1cm4gZ307dGhpcy5fc3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3JldHVybiBjLnN1YnNjcmliZShhKX19byhhLGopO2EucHJvdG90eXBlLmNvbm5lY3Q9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5jb25uZWN0KCl9O2EucHJvdG90eXBlLnJlZkNvdW50PWZ1bmN0aW9uKCl7dmFyIGE9bnVsbCxjPTAsZD10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGUpe3ZhciBnLGg7YysrO2c9MT09PWM7aD1kLnN1YnNjcmliZShlKTtnJiYoYT1kLmNvbm5lY3QoKSk7cmV0dXJuIEEoZnVuY3Rpb24oKXtoLmRpc3Bvc2UoKTtjLS07MD09PWMmJmEuZGlzcG9zZSgpfSl9KX07YS5wcm90b3R5cGUuX3N1YnNjcmliZT1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5fc3Vic2NyaWJlKGEpfTtyZXR1cm4gYX0oKSxPPW0uU3ViamVjdD1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzKTtcbnZhciBiPSExLGM9ITEsZD1uZXcgdSxlPW4sZz1mdW5jdGlvbigpe2lmKGIpdGhyb3cgRXJyb3IoSyk7fTt0aGlzLm9uQ29tcGxldGVkPWZ1bmN0aW9uKCl7dmFyIGEsYjtnKCk7Y3x8KGE9ZC50b0FycmF5KCksZD1uZXcgdSxjPSEwKTtpZihhIT09bilmb3IoYj0wO2I8YS5sZW5ndGg7YisrKWFbYl0ub25Db21wbGV0ZWQoKX07dGhpcy5vbkVycm9yPWZ1bmN0aW9uKGEpe3ZhciBiLHo7ZygpO2N8fChiPWQudG9BcnJheSgpLGQ9bmV3IHUsYz0hMCxlPWEpO2lmKGIhPT1uKWZvcih6PTA7ejxiLmxlbmd0aDt6KyspYlt6XS5vbkVycm9yKGEpfTt0aGlzLm9uTmV4dD1mdW5jdGlvbihhKXt2YXIgYixlO2coKTtjfHwoYj1kLnRvQXJyYXkoKSk7aWYodm9pZCAwIT09Yilmb3IoZT0wO2U8Yi5sZW5ndGg7ZSsrKWJbZV0ub25OZXh0KGEpfTt0aGlzLl9zdWJzY3JpYmU9ZnVuY3Rpb24oYSl7ZygpO2lmKCFjKXJldHVybiBkLmFkZChhKSxmdW5jdGlvbihhKXtyZXR1cm57b2JzZXJ2ZXI6YSxkaXNwb3NlOmZ1bmN0aW9uKCl7aWYobnVsbCE9PVxudGhpcy5vYnNlcnZlciYmIWIpZC5yZW1vdmUodGhpcy5vYnNlcnZlciksdGhpcy5vYnNlcnZlcj1udWxsfX19KGEpO2lmKGUhPT1uKXJldHVybiBhLm9uRXJyb3IoZSksdzthLm9uQ29tcGxldGVkKCk7cmV0dXJuIHd9O3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe2I9ITA7ZD1udWxsfX1vKGEsaik7RShhLHIpO2EucHJvdG90eXBlLm9uQ29tcGxldGVkPWZ1bmN0aW9uKCl7dGhpcy5vbkNvbXBsZXRlZCgpfTthLnByb3RvdHlwZS5vbkVycm9yPWZ1bmN0aW9uKGEpe3RoaXMub25FcnJvcihhKX07YS5wcm90b3R5cGUub25OZXh0PWZ1bmN0aW9uKGEpe3RoaXMub25OZXh0KGEpfTthLnByb3RvdHlwZS5fc3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLl9zdWJzY3JpYmUoYSl9O2EucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXt0aGlzLmRpc3Bvc2UoKX07YS5jcmVhdGU9ZnVuY3Rpb24oYSxjKXtyZXR1cm4gbmV3IHJhKGEsYyl9O3JldHVybiBhfSgpLFU9bS5Bc3luY1N1YmplY3Q9XG5mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzKTt2YXIgYj0hMSxjPSExLGQ9bnVsbCxlPSExLGc9bmV3IHUsaD1udWxsLGw9ZnVuY3Rpb24oKXtpZihiKXRocm93IEVycm9yKEspO307dGhpcy5vbkNvbXBsZXRlZD1mdW5jdGlvbigpe3ZhciBhPSExLGIsaCxmO2woKTtjfHwoYj1nLnRvQXJyYXkoKSxnPW5ldyB1LGM9ITAsaD1kLGE9ZSk7aWYoYiE9PW4paWYoYSlmb3IoZj0wO2Y8Yi5sZW5ndGg7ZisrKWE9YltmXSxhLm9uTmV4dChoKSxhLm9uQ29tcGxldGVkKCk7ZWxzZSBmb3IoZj0wO2Y8Yi5sZW5ndGg7ZisrKWJbZl0ub25Db21wbGV0ZWQoKX07dGhpcy5vbkVycm9yPWZ1bmN0aW9uKGEpe3ZhciBiLGQ7bCgpO2N8fChiPWcudG9BcnJheSgpLGc9bmV3IHUsYz0hMCxoPWEpO2lmKGIhPT1uKWZvcihkPTA7ZDxiLmxlbmd0aDtkKyspYltkXS5vbkVycm9yKGEpfTt0aGlzLm9uTmV4dD1mdW5jdGlvbihhKXtsKCk7Y3x8KGQ9YSxlPSEwKX07XG50aGlzLl9zdWJzY3JpYmU9ZnVuY3Rpb24oYSl7dmFyIHEsayxmO2woKTtpZighYylyZXR1cm4gZy5hZGQoYSksZnVuY3Rpb24oYSl7cmV0dXJue29ic2VydmVyOmEsZGlzcG9zZTpmdW5jdGlvbigpe2lmKG51bGwhPT10aGlzLm9ic2VydmVyJiYhYilnLnJlbW92ZSh0aGlzLm9ic2VydmVyKSx0aGlzLm9ic2VydmVyPW51bGx9fX0oYSk7cT1oO2s9ZTtmPWQ7aWYobnVsbCE9PXEpYS5vbkVycm9yKHEpO2Vsc2V7aWYoaylhLm9uTmV4dChmKTthLm9uQ29tcGxldGVkKCl9cmV0dXJuIHd9O3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe2I9ITA7ZD1oPWc9bnVsbH19byhhLGopO0UoYSxyKTthLnByb3RvdHlwZS5vbkNvbXBsZXRlZD1mdW5jdGlvbigpe3RoaXMub25Db21wbGV0ZWQoKX07YS5wcm90b3R5cGUub25FcnJvcj1mdW5jdGlvbihhKXt0aGlzLm9uRXJyb3IoYSl9O2EucHJvdG90eXBlLm9uTmV4dD1mdW5jdGlvbihhKXt0aGlzLm9uTmV4dChhKX07YS5wcm90b3R5cGUuX3N1YnNjcmliZT1cbmZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLl9zdWJzY3JpYmUoYSl9O2EucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXt0aGlzLmRpc3Bvc2UoKX07cmV0dXJuIGF9KCksUD1tLkJlaGF2aW9yU3ViamVjdD1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYil7YS5iYXNlLmNvbnN0cnVjdG9yLmNhbGwodGhpcyk7dmFyIGM9YixkPW5ldyB1LGU9ITEsZz0hMSxoPW51bGwsbD1mdW5jdGlvbigpe2lmKGUpdGhyb3cgRXJyb3IoSyk7fTt0aGlzLm9uQ29tcGxldGVkPWZ1bmN0aW9uKCl7dmFyIGEsYjthPW51bGw7bCgpO2d8fChhPWQudG9BcnJheSgpLGQ9bmV3IHUsZz0hMCk7aWYobnVsbCE9PWEpZm9yKGI9MDtiPGEubGVuZ3RoO2IrKylhW2JdLm9uQ29tcGxldGVkKCl9O3RoaXMub25FcnJvcj1mdW5jdGlvbihhKXt2YXIgYixjO2M9bnVsbDtsKCk7Z3x8KGM9ZC50b0FycmF5KCksZD1uZXcgdSxnPSEwLGg9YSk7aWYobnVsbCE9PWMpZm9yKGI9MDtiPGMubGVuZ3RoO2IrKyljW2JdLm9uRXJyb3IoYSl9O1xudGhpcy5vbk5leHQ9ZnVuY3Rpb24oYSl7dmFyIGIsZTtiPW51bGw7bCgpO2d8fChjPWEsYj1kLnRvQXJyYXkoKSk7aWYobnVsbCE9PWIpZm9yKGU9MDtlPGIubGVuZ3RoO2UrKyliW2VdLm9uTmV4dChhKX07dGhpcy5fc3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3ZhciBiO2woKTtpZighZylyZXR1cm4gZC5hZGQoYSksYS5vbk5leHQoYyksZnVuY3Rpb24oYSl7cmV0dXJue29ic2VydmVyOmEsZGlzcG9zZTpmdW5jdGlvbigpe2lmKG51bGwhPT10aGlzLm9ic2VydmVyJiYhZSlkLnJlbW92ZSh0aGlzLm9ic2VydmVyKSx0aGlzLm9ic2VydmVyPW51bGx9fX0oYSk7Yj1oO2lmKG51bGwhPT1iKWEub25FcnJvcihiKTtlbHNlIGEub25Db21wbGV0ZWQoKTtyZXR1cm4gd307dGhpcy5kaXNwb3NlPWZ1bmN0aW9uKCl7ZT0hMDtoPWM9ZD1udWxsfX1vKGEsaik7RShhLHIpO2EucHJvdG90eXBlLm9uQ29tcGxldGVkPWZ1bmN0aW9uKCl7dGhpcy5vbkNvbXBsZXRlZCgpfTthLnByb3RvdHlwZS5vbkVycm9yPVxuZnVuY3Rpb24oYSl7dGhpcy5vbkVycm9yKGEpfTthLnByb3RvdHlwZS5vbk5leHQ9ZnVuY3Rpb24oYSl7dGhpcy5vbk5leHQoYSl9O2EucHJvdG90eXBlLl9zdWJzY3JpYmU9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuX3N1YnNjcmliZShhKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe3RoaXMuZGlzcG9zZSgpfTtyZXR1cm4gYX0oKTtQLnByb3RvdHlwZS50b05vdGlmaWVyPXIucHJvdG90eXBlLnRvTm90aWZpZXI7UC5wcm90b3R5cGUuYXNPYnNlcnZlcj1yLnByb3RvdHlwZS5Bc09ic2VydmVyO3ZhciBjYT1tLlJlcGxheVN1YmplY3Q9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGEsYyxkKXt2YXIgZT1hPT09bj9OdW1iZXIuTUFYX1ZBTFVFOmEsZz1jPT09bj9OdW1iZXIuTUFYX1ZBTFVFOmMsaD1kfHxzLmN1cnJlbnRUaHJlYWQsbD1bXSxmPW5ldyB1LHE9ITEsaz0hMSxpPWZ1bmN0aW9uKGEpe3ZhciBiPXE/MTowLGM9YitlO2ZvcihjPGUmJihjPWUpO2wubGVuZ3RoPmM7KWwuc2hpZnQoKTtcbmZvcig7bC5sZW5ndGg+YiYmYS1sWzBdLnRpbWVzdGFtcD5nOylsLnNoaWZ0KCl9LGo9ZnVuY3Rpb24oYSl7dmFyIGI9aC5ub3coKTtsLnB1c2goe3ZhbHVlOmEsdGltZXN0YW1wOmJ9KTtpKGIpfSxtPWZ1bmN0aW9uKCl7aWYoayl0aHJvdyBFcnJvcihLKTt9O3RoaXMub25OZXh0PWZ1bmN0aW9uKGEpe3ZhciBiPW51bGwsYyxkO20oKTtpZighcSl7Yj1mLnRvQXJyYXkoKTtqKHQuY3JlYXRlT25OZXh0KGEpKTtmb3IoZD0wO2Q8Yi5sZW5ndGg7ZCsrKWM9YltkXSxjLm9uTmV4dChhKX1pZihudWxsIT09Yilmb3IoZD0wO2Q8Yi5sZW5ndGg7ZCsrKWM9YltkXSxjLmVuc3VyZUFjdGl2ZSgpfTt0aGlzLm9uRXJyb3I9ZnVuY3Rpb24oYSl7dmFyIGI9bnVsbCxjO20oKTtpZighcSl7cT0hMDtqKHQuY3JlYXRlT25FcnJvcihhKSk7Yj1mLnRvQXJyYXkoKTtmb3IoYz0wO2M8Yi5sZW5ndGg7YysrKWJbY10ub25FcnJvcihhKTtmPW5ldyB1fWlmKG51bGwhPT1iKWZvcihjPTA7YzxiLmxlbmd0aDtjKyspYltjXS5lbnN1cmVBY3RpdmUoKX07XG50aGlzLm9uQ29tcGxldGVkPWZ1bmN0aW9uKCl7dmFyIGE9bnVsbCxiO20oKTtpZighcSl7cT0hMDtqKHQuY3JlYXRlT25Db21wbGV0ZWQoKSk7YT1mLnRvQXJyYXkoKTtmb3IoYj0wO2I8YS5sZW5ndGg7YisrKWFbYl0ub25Db21wbGV0ZWQoKTtmPW5ldyB1fWlmKG51bGwhPT1hKWZvcihiPTA7YjxhLmxlbmd0aDtiKyspYVtiXS5lbnN1cmVBY3RpdmUoKX07dGhpcy5fc3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3ZhciBhPW5ldyBuYShoLGEpLGI9ZnVuY3Rpb24oYSl7cmV0dXJue29ic2VydmVyOmEsZGlzcG9zZTpmdW5jdGlvbigpe3RoaXMub2JzZXJ2ZXIuZGlzcG9zZSgpO251bGwhPT10aGlzLm9ic2VydmVyJiYhayYmZi5yZW1vdmUodGhpcy5vYnNlcnZlcil9fX0oYSksYzttKCk7aShoLm5vdygpKTtmLmFkZChhKTtmb3IoYz0wO2M8bC5sZW5ndGg7YysrKWxbY10udmFsdWUuYWNjZXB0KGEpO2EuZW5zdXJlQWN0aXZlKCk7cmV0dXJuIGJ9O3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe2s9XG4hMDtmPW51bGx9fW8oYSxqKTtFKGEsaik7YS5wcm90b3R5cGUub25OZXh0PWZ1bmN0aW9uKGEpe3RoaXMub25OZXh0KGEpfTthLnByb3RvdHlwZS5vbkVycm9yPWZ1bmN0aW9uKGEpe3RoaXMub25FcnJvcihhKX07YS5wcm90b3R5cGUub25Db21wbGV0ZWQ9ZnVuY3Rpb24oKXt0aGlzLm9uQ29tcGxldGVkKCl9O2EucHJvdG90eXBlLl9zdWJzY3JpYmU9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuX3N1YnNjcmliZShhKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe3RoaXMuZGlzcG9zZSgpfTtyZXR1cm4gYX0oKSxyYT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYSxjKXt0aGlzLm9ic2VydmVyPWE7dGhpcy5vYnNlcnZhYmxlPWN9byhhLGopO0UoYSxyKTthLnByb3RvdHlwZS5vbkNvbXBsZXRlZD1mdW5jdGlvbigpe3JldHVybiB0aGlzLm9ic2VydmVyLm9uQ29tcGxldGVkKCl9O2EucHJvdG90eXBlLm9uRXJyb3I9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMub2JzZXJ2ZXIub25FcnJvcihhKX07XG5hLnByb3RvdHlwZS5vbk5leHQ9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMub2JzZXJ2ZXIub25OZXh0KGEpfTthLnByb3RvdHlwZS5fU3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLm9ic2VydmFibGUuU3Vic2NyaWJlKGEpfTtyZXR1cm4gYX0oKTtqLnN0YXJ0PWZ1bmN0aW9uKGEsYixjLGQpe2N8fChjPVtdKTtyZXR1cm4gc2EoYSxkKS5hcHBseShiLGMpfTt2YXIgc2E9ai50b0FzeW5jPWZ1bmN0aW9uKGEsYil7Ynx8KGI9bWEpO3JldHVybiBmdW5jdGlvbigpe3ZhciBjPW5ldyBVLGQ9ZnVuY3Rpb24oKXt2YXIgYjt0cnl7Yj1hLmFwcGx5KHRoaXMsYXJndW1lbnRzKX1jYXRjaChkKXtjLm9uRXJyb3IoZCk7cmV0dXJufWMub25OZXh0KGIpO2Mub25Db21wbGV0ZWQoKX0sZT15LmNhbGwoYXJndW1lbnRzKSxnPXRoaXM7Yi5zY2hlZHVsZShmdW5jdGlvbigpe2QuYXBwbHkoZyxlKX0pO3JldHVybiBjfX07Zi5tdWx0aWNhc3Q9ZnVuY3Rpb24oYSxiKXt2YXIgYz10aGlzO3JldHVyblwiZnVuY3Rpb25cIj09PVxudHlwZW9mIGE/aShmdW5jdGlvbihkKXt2YXIgZT1jLm11bHRpY2FzdChhKCkpO3JldHVybiBuZXcgcChiKGUpLnN1YnNjcmliZShkKSxlLmNvbm5lY3QoKSl9KTpuZXcgcWEoYyxhKX07Zi5wdWJsaXNoPWZ1bmN0aW9uKGEpe3JldHVybiFhP3RoaXMubXVsdGljYXN0KG5ldyBPKTp0aGlzLm11bHRpY2FzdChmdW5jdGlvbigpe3JldHVybiBuZXcgT30sYSl9O2YucHVibGlzaExhc3Q9ZnVuY3Rpb24oYSl7cmV0dXJuIWE/dGhpcy5tdWx0aWNhc3QobmV3IFUpOnRoaXMubXVsdGljYXN0KGZ1bmN0aW9uKCl7cmV0dXJuIG5ldyBVfSxhKX07Zi5yZXBsYXk9ZnVuY3Rpb24oYSxiLGMsZCl7cmV0dXJuIWF8fG51bGw9PT1hP3RoaXMubXVsdGljYXN0KG5ldyBjYShiLGMsZCkpOnRoaXMubXVsdGljYXN0KGZ1bmN0aW9uKCl7cmV0dXJuIG5ldyBjYShiLGMsZCl9LGEpfTtmLnB1Ymxpc2hWYWx1ZT1mdW5jdGlvbihhLGIpe3JldHVyblwiZnVuY3Rpb25cIj09PXR5cGVvZiBhP3RoaXMubXVsdGljYXN0KGZ1bmN0aW9uKCl7cmV0dXJuIG5ldyBQKGIpfSxcbmEpOnRoaXMubXVsdGljYXN0KG5ldyBQKGEpKX07dmFyIGRhPWoubmV2ZXI9ZnVuY3Rpb24oKXtyZXR1cm4gaShmdW5jdGlvbigpe3JldHVybiB3fSl9LHRhPWouZW1wdHk9ZnVuY3Rpb24oYSl7YXx8KGE9Qik7cmV0dXJuIGkoZnVuY3Rpb24oYil7cmV0dXJuIGEuc2NoZWR1bGUoZnVuY3Rpb24oKXtyZXR1cm4gYi5vbkNvbXBsZXRlZCgpfSl9KX0sdWE9ai5yZXR1cm5WYWx1ZT1mdW5jdGlvbihhLGIpe2J8fChiPUIpO3JldHVybiBpKGZ1bmN0aW9uKGMpe3JldHVybiBiLnNjaGVkdWxlKGZ1bmN0aW9uKCl7Yy5vbk5leHQoYSk7cmV0dXJuIGMub25Db21wbGV0ZWQoKX0pfSl9LGVhPWoudGhyb3dFeGNlcHRpb249ZnVuY3Rpb24oYSxiKXtifHwoYj1CKTtyZXR1cm4gaShmdW5jdGlvbihjKXtyZXR1cm4gYi5zY2hlZHVsZShmdW5jdGlvbigpe3JldHVybiBjLm9uRXJyb3IoYSl9KX0pfSx2YT1qLmdlbmVyYXRlPWZ1bmN0aW9uKGEsYixjLGQsZSl7ZXx8KGU9RCk7cmV0dXJuIGkoZnVuY3Rpb24oZyl7dmFyIGg9XG4hMCxmPWE7cmV0dXJuIGUuc2NoZWR1bGVSZWN1cnNpdmUoZnVuY3Rpb24oYSl7dmFyIGUsazt0cnl7aD9oPSExOmY9YyhmKSwoZT1iKGYpKSYmKGs9ZChmKSl9Y2F0Y2goaSl7Zy5vbkVycm9yKGkpO3JldHVybn1pZihlKWcub25OZXh0KGspLGEoKTtlbHNlIGcub25Db21wbGV0ZWQoKX0pfSl9LGZhPWouZGVmZXI9ZnVuY3Rpb24oYSl7cmV0dXJuIGkoZnVuY3Rpb24oYil7dmFyIGM7dHJ5e2M9YSgpfWNhdGNoKGQpe3JldHVybiBlYShkKS5zdWJzY3JpYmUoYil9cmV0dXJuIGMuc3Vic2NyaWJlKGIpfSl9O2oudXNpbmc9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gaShmdW5jdGlvbihjKXt2YXIgZD13LGUsZzt0cnl7ZT1hKCksbnVsbCE9PWUmJihkPWUpLGc9YihlKX1jYXRjaChoKXtyZXR1cm4gbmV3IHAoZWEoaCkuc3Vic2NyaWJlKGMpLGQpfXJldHVybiBuZXcgcChnLnN1YnNjcmliZShjKSxkKX0pfTt2YXIgZ2E9ai5mcm9tQXJyYXk9ZnVuY3Rpb24oYSxiKXtifHwoYj1EKTtyZXR1cm4gaShmdW5jdGlvbihjKXt2YXIgZD1cbjA7cmV0dXJuIGIuc2NoZWR1bGVSZWN1cnNpdmUoZnVuY3Rpb24oYil7aWYoZDxhLmxlbmd0aCljLm9uTmV4dChhW2QrK10pLGIoKTtlbHNlIGMub25Db21wbGV0ZWQoKX0pfSl9LGk9ai5jcmVhdGVXaXRoRGlzcG9zYWJsZT1mdW5jdGlvbihhKXtyZXR1cm4gbmV3IHBhKGEpfTtqLmNyZWF0ZT1mdW5jdGlvbihhKXtyZXR1cm4gaShmdW5jdGlvbihiKXtyZXR1cm4gQShhKGIpKX0pfTtqLnJhbmdlPWZ1bmN0aW9uKGEsYixjKXtjfHwoYz1EKTt2YXIgZD1hK2ItMTtyZXR1cm4gdmEoYSxmdW5jdGlvbihhKXtyZXR1cm4gYTw9ZH0sZnVuY3Rpb24oYSl7cmV0dXJuIGErMX0sZnVuY3Rpb24oYSl7cmV0dXJuIGF9LGMpfTtmLnJlcGVhdD1mdW5jdGlvbihhKXtyZXR1cm4gJCh0aGlzLGEpLmNvbmNhdCgpfTtmLnJldHJ5PWZ1bmN0aW9uKGEpe3JldHVybiAkKHRoaXMsYSkuY2F0Y2hFeGNlcHRpb24oKX07ai5yZXBlYXQ9ZnVuY3Rpb24oYSxiLGMpe2N8fChjPUQpO2I9PT1uJiYoYj0tMSk7cmV0dXJuIHVhKGEsXG5jKS5yZXBlYXQoYil9O2Yuc2VsZWN0PWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9MDtyZXR1cm4gYi5zdWJzY3JpYmUoZnVuY3Rpb24oYil7dmFyIGc7dHJ5e2c9YShiLGQrKyl9Y2F0Y2goaCl7Yy5vbkVycm9yKGgpO3JldHVybn1jLm9uTmV4dChnKX0sZnVuY3Rpb24oYSl7Yy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2Mub25Db21wbGV0ZWQoKX0pfSl9O2Yud2hlcmU9ZnVuY3Rpb24oYSl7dmFyIGI9dGhpcztyZXR1cm4gaShmdW5jdGlvbihjKXt2YXIgZD0wO3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbihiKXt2YXIgZzt0cnl7Zz1hKGIsZCsrKX1jYXRjaChoKXtjLm9uRXJyb3IoaCk7cmV0dXJufWlmKGcpYy5vbk5leHQoYil9LGZ1bmN0aW9uKGEpe2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtjLm9uQ29tcGxldGVkKCl9KX0pfTtmLmdyb3VwQnlVbnRpbD1mdW5jdGlvbihhLGIsYyxkKXt2YXIgZT10aGlzO2J8fChiPVEpO2R8fChkPVxuVyk7cmV0dXJuIGkoZnVuY3Rpb24oZyl7dmFyIGg9e30sZj1uZXcgcCxpPW5ldyBaKGYpO2YuYWRkKGUuc3Vic2NyaWJlKGZ1bmN0aW9uKGUpe3ZhciBrLGosbSx0LG8scCx1LHMscjt0cnl7aj1hKGUpLHA9ZChqKX1jYXRjaCh3KXtmb3IociBpbiBoKWhbcl0ub25FcnJvcih3KTtnLm9uRXJyb3Iodyk7cmV0dXJufW89ITE7dHJ5e3M9aFtwXSxzfHwocz1uZXcgTyxoW3BdPXMsbz0hMCl9Y2F0Y2goeCl7Zm9yKHIgaW4gaCloW3JdLm9uRXJyb3IoeCk7Zy5vbkVycm9yKHgpO3JldHVybn1pZihvKXtvPW5ldyBiYShqLHMsaSk7aj1uZXcgYmEoaixzKTt0cnl7az1jKGopfWNhdGNoKHkpe2ZvcihyIGluIGgpaFtyXS5vbkVycm9yKHkpO2cub25FcnJvcih5KTtyZXR1cm59Zy5vbk5leHQobyk7dT1uZXcgdjtmLmFkZCh1KTt0PWZ1bmN0aW9uKCl7aFtwXSE9PW4mJihkZWxldGUgaFtwXSxzLm9uQ29tcGxldGVkKCkpO2YucmVtb3ZlKHUpfTt1LmRpc3Bvc2FibGUoay50YWtlKDEpLnN1YnNjcmliZShmdW5jdGlvbigpe30sXG5mdW5jdGlvbihhKXtmb3IociBpbiBoKWhbcl0ub25FcnJvcihhKTtnLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7dCgpfSkpfXRyeXttPWIoZSl9Y2F0Y2goQSl7Zm9yKHIgaW4gaCloW3JdLm9uRXJyb3IoQSk7Zy5vbkVycm9yKEEpO3JldHVybn1zLm9uTmV4dChtKX0sZnVuY3Rpb24oYSl7Zm9yKHZhciBiIGluIGgpaFtiXS5vbkVycm9yKGEpO2cub25FcnJvcihhKX0sZnVuY3Rpb24oKXtmb3IodmFyIGEgaW4gaCloW2FdLm9uQ29tcGxldGVkKCk7Zy5vbkNvbXBsZXRlZCgpfSkpO3JldHVybiBpfSl9O2YuZ3JvdXBCeT1mdW5jdGlvbihhLGIsYyl7cmV0dXJuIHRoaXMuZ3JvdXBCeVVudGlsKGEsYixmdW5jdGlvbigpe3JldHVybiBkYSgpfSxjKX07Zi50YWtlPWZ1bmN0aW9uKGEsYil7aWYoMD5hKXRocm93IEVycm9yKFwiQXJndW1lbnQgb3V0IG9mIHJhbmdlXCIpO2lmKDA9PWEpcmV0dXJuIHRhKGIpO3ZhciBjPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYil7dmFyIGU9YTtyZXR1cm4gYy5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7aWYoMDxcbmUmJihlLS0sYi5vbk5leHQoYSksMD09PWUpKWIub25Db21wbGV0ZWQoKX0sZnVuY3Rpb24oYSl7cmV0dXJuIGIub25FcnJvcihhKX0sZnVuY3Rpb24oKXtyZXR1cm4gYi5vbkNvbXBsZXRlZCgpfSl9KX07Zi5za2lwPWZ1bmN0aW9uKGEpe2lmKDA+YSl0aHJvdyBFcnJvcihcIkFyZ3VtZW50IG91dCBvZiByYW5nZVwiKTt2YXIgYj10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGMpe3ZhciBkPWE7cmV0dXJuIGIuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2lmKDA+PWQpYy5vbk5leHQoYSk7ZWxzZSBkLS19LGZ1bmN0aW9uKGEpe3JldHVybiBjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7cmV0dXJuIGMub25Db21wbGV0ZWQoKX0pfSl9O2YudGFrZVdoaWxlPWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9MCxlPSEwO3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbihiKXtpZihlKXt0cnl7ZT1hKGIsZCsrKX1jYXRjaChoKXtjLm9uRXJyb3IoaCk7cmV0dXJufWlmKGUpYy5vbk5leHQoYik7XG5lbHNlIGMub25Db21wbGV0ZWQoKX19LGZ1bmN0aW9uKGEpe3JldHVybiBjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7cmV0dXJuIGMub25Db21wbGV0ZWQoKX0pfSl9O2Yuc2tpcFdoaWxlPWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9MCxlPSExO3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbihiKXtpZighZSl0cnl7ZT0hYShiLGQrKyl9Y2F0Y2goaCl7Yy5vbkVycm9yKGgpO3JldHVybn1pZihlKWMub25OZXh0KGIpfSxmdW5jdGlvbihhKXtjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Yy5vbkNvbXBsZXRlZCgpfSl9KX07Zi5zZWxlY3RNYW55PWZ1bmN0aW9uKGEsYil7cmV0dXJuIGIhPT1uP3RoaXMuc2VsZWN0TWFueShmdW5jdGlvbihjKXtyZXR1cm4gYShjKS5zZWxlY3QoZnVuY3Rpb24oYSl7cmV0dXJuIGIoYyxhKX0pfSk6XCJmdW5jdGlvblwiPT09dHlwZW9mIGE/dGhpcy5zZWxlY3QoYSkubWVyZ2VPYnNlcnZhYmxlKCk6dGhpcy5zZWxlY3QoZnVuY3Rpb24oKXtyZXR1cm4gYX0pLm1lcmdlT2JzZXJ2YWJsZSgpfTtcbmYuZmluYWxWYWx1ZT1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYil7dmFyIGM9ITEsZDtyZXR1cm4gYS5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7Yz0hMDtkPWF9LGZ1bmN0aW9uKGEpe2Iub25FcnJvcihhKX0sZnVuY3Rpb24oKXtpZihjKWIub25OZXh0KGQpLGIub25Db21wbGV0ZWQoKTtlbHNlIGIub25FcnJvcihFcnJvcihcIlNlcXVlbmNlIGNvbnRhaW5zIG5vIGVsZW1lbnRzLlwiKSl9KX0pfTtmLnRvQXJyYXk9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5zY2FuKFtdLGZ1bmN0aW9uKGEsYil7YS5wdXNoKGIpO3JldHVybiBhfSkuc3RhcnRXaXRoKFtdKS5maW5hbFZhbHVlKCl9O2YubWF0ZXJpYWxpemU9ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGIpe3JldHVybiBhLnN1YnNjcmliZShmdW5jdGlvbihhKXtiLm9uTmV4dCh0LmNyZWF0ZU9uTmV4dChhKSl9LGZ1bmN0aW9uKGEpe2Iub25OZXh0KHQuY3JlYXRlT25FcnJvcihhKSk7XG5iLm9uQ29tcGxldGVkKCl9LGZ1bmN0aW9uKCl7Yi5vbk5leHQodC5jcmVhdGVPbkNvbXBsZXRlZCgpKTtiLm9uQ29tcGxldGVkKCl9KX0pfTtmLmRlbWF0ZXJpYWxpemU9ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGIpe3JldHVybiBhLnN1YnNjcmliZShmdW5jdGlvbihhKXtyZXR1cm4gYS5hY2NlcHQoYil9LGZ1bmN0aW9uKGEpe2Iub25FcnJvcihhKX0sZnVuY3Rpb24oKXtiLm9uQ29tcGxldGVkKCl9KX0pfTtmLmFzT2JzZXJ2YWJsZT1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYil7cmV0dXJuIGEuc3Vic2NyaWJlKGIpfSl9O2Yud2luZG93V2l0aENvdW50PWZ1bmN0aW9uKGEsYil7dmFyIGM9dGhpcztpZigwPj1hKXRocm93IEVycm9yKFwiQXJndW1lbnQgb3V0IG9mIHJhbmdlXCIpO2I9PT1uJiYoYj1hKTtpZigwPj1iKXRocm93IEVycm9yKFwiQXJndW1lbnQgb3V0IG9mIHJhbmdlXCIpO3JldHVybiBpKGZ1bmN0aW9uKGQpe3ZhciBlPVxubmV3IHYsZz1uZXcgWihlKSxoPTAsZj1bXSxpPWZ1bmN0aW9uKCl7dmFyIGE9bmV3IE87Zi5wdXNoKGEpO2Qub25OZXh0KGphKGEsZykpfTtpKCk7ZS5kaXNwb3NhYmxlKGMuc3Vic2NyaWJlKGZ1bmN0aW9uKGMpe3ZhciBkO2ZvcihkPTA7ZDxmLmxlbmd0aDtkKyspZltkXS5vbk5leHQoYyk7Yz1oLWErMTswPD1jJiYwPT09YyViJiYoYz1mLnNoaWZ0KCksYy5vbkNvbXBsZXRlZCgpKTtoKys7MD09PWglYiYmaSgpfSxmdW5jdGlvbihhKXtmb3IoOzA8Zi5sZW5ndGg7KWYuc2hpZnQoKS5vbkVycm9yKGEpO2Qub25FcnJvcihhKX0sZnVuY3Rpb24oKXtmb3IoOzA8Zi5sZW5ndGg7KWYuc2hpZnQoKS5vbkNvbXBsZXRlZCgpO2Qub25Db21wbGV0ZWQoKX0pKTtyZXR1cm4gZ30pfTtmLmJ1ZmZlcldpdGhDb3VudD1mdW5jdGlvbihhLGIpe2I9PT1uJiYoYj1hKTtyZXR1cm4gdGhpcy53aW5kb3dXaXRoQ291bnQoYSxiKS5zZWxlY3RNYW55KGZ1bmN0aW9uKGEpe3JldHVybiBhLnRvQXJyYXkoKX0pLndoZXJlKGZ1bmN0aW9uKGEpe3JldHVybiAwPFxuYS5sZW5ndGh9KX07Zi5zdGFydFdpdGg9ZnVuY3Rpb24oKXt2YXIgYSxiO2E9MDswPGFyZ3VtZW50cy5sZW5ndGgmJnZvaWQgMCE9PWFyZ3VtZW50c1swXS5ub3c/KGI9YXJndW1lbnRzWzBdLGE9MSk6Yj1CO2E9eS5jYWxsKGFyZ3VtZW50cyxhKTtyZXR1cm4gUyhbZ2EoYSxiKSx0aGlzXSkuY29uY2F0KCl9O2Yuc2Nhbj1mdW5jdGlvbihhLGIpe3ZhciBjPXRoaXM7cmV0dXJuIGZhKGZ1bmN0aW9uKCl7dmFyIGQ9ITEsZTtyZXR1cm4gYy5zZWxlY3QoZnVuY3Rpb24oYyl7ZD9lPWIoZSxjKTooZT1iKGEsYyksZD0hMCk7cmV0dXJuIGV9KX0pfTtmLnNjYW4xPWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7cmV0dXJuIGZhKGZ1bmN0aW9uKCl7dmFyIGM9ITEsZDtyZXR1cm4gYi5zZWxlY3QoZnVuY3Rpb24oYil7Yz9kPWEoZCxiKTooZD1iLGM9ITApO3JldHVybiBkfSl9KX07Zi5kaXN0aW5jdFVudGlsQ2hhbmdlZD1mdW5jdGlvbihhLGIpe3ZhciBjPXRoaXM7YXx8KGE9USk7Ynx8KGI9Vik7XG5yZXR1cm4gaShmdW5jdGlvbihkKXt2YXIgZT0hMSxnO3JldHVybiBjLnN1YnNjcmliZShmdW5jdGlvbihjKXt2YXIgZj0hMSxpO3RyeXtpPWEoYyl9Y2F0Y2goail7ZC5vbkVycm9yKGopO3JldHVybn1pZihlKXRyeXtmPWIoZyxpKX1jYXRjaChrKXtkLm9uRXJyb3Ioayk7cmV0dXJufWlmKCFlfHwhZillPSEwLGc9aSxkLm9uTmV4dChjKX0sZnVuY3Rpb24oYSl7ZC5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2Qub25Db21wbGV0ZWQoKX0pfSl9O2YuZmluYWxseUFjdGlvbj1mdW5jdGlvbihhKXt2YXIgYj10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGMpe3ZhciBkPWIuc3Vic2NyaWJlKGMpO3JldHVybiBBKGZ1bmN0aW9uKCl7dHJ5e2QuZGlzcG9zZSgpfWZpbmFsbHl7YSgpfX0pfSl9O2YuZG9BY3Rpb249ZnVuY3Rpb24oYSxiLGMpe3ZhciBkPXRoaXMsZTswPT1hcmd1bWVudHMubGVuZ3RofHwxPGFyZ3VtZW50cy5sZW5ndGh8fFwiZnVuY3Rpb25cIj09dHlwZW9mIGE/ZT1hOihlPWZ1bmN0aW9uKGIpe2Eub25OZXh0KGIpfSxcbmI9ZnVuY3Rpb24oYil7YS5vbkVycm9yKGIpfSxjPWZ1bmN0aW9uKCl7YS5vbkNvbXBsZXRlZCgpfSk7cmV0dXJuIGkoZnVuY3Rpb24oYSl7cmV0dXJuIGQuc3Vic2NyaWJlKGZ1bmN0aW9uKGIpe3RyeXtlKGIpfWNhdGNoKGMpe2Eub25FcnJvcihjKX1hLm9uTmV4dChiKX0sZnVuY3Rpb24oYyl7aWYoYil0cnl7YihjKX1jYXRjaChkKXthLm9uRXJyb3IoZCl9YS5vbkVycm9yKGMpfSxmdW5jdGlvbigpe2lmKGMpdHJ5e2MoKX1jYXRjaChiKXthLm9uRXJyb3IoYil9YS5vbkNvbXBsZXRlZCgpfSl9KX07Zi5za2lwTGFzdD1mdW5jdGlvbihhKXt2YXIgYj10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGMpe3ZhciBkPVtdO3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbihiKXtkLnB1c2goYik7aWYoZC5sZW5ndGg+YSljLm9uTmV4dChkLnNoaWZ0KCkpfSxmdW5jdGlvbihhKXtjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Yy5vbkNvbXBsZXRlZCgpfSl9KX07Zi50YWtlTGFzdD1mdW5jdGlvbihhKXt2YXIgYj1cbnRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9W107cmV0dXJuIGIuc3Vic2NyaWJlKGZ1bmN0aW9uKGIpe2QucHVzaChiKTtkLmxlbmd0aD5hJiZkLnNoaWZ0KCl9LGZ1bmN0aW9uKGEpe2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtmb3IoOzA8ZC5sZW5ndGg7KWMub25OZXh0KGQuc2hpZnQoKSk7Yy5vbkNvbXBsZXRlZCgpfSl9KX07Zi5pZ25vcmVFbGVtZW50cz1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYil7cmV0dXJuIGEuc3Vic2NyaWJlKGlhLGZ1bmN0aW9uKGEpe2Iub25FcnJvcihhKX0sZnVuY3Rpb24oKXtiLm9uQ29tcGxldGVkKCl9KX0pfTtmLmVsZW1lbnRBdD1mdW5jdGlvbihhKXtpZigwPmEpdGhyb3cgRXJyb3IoXCJBcmd1bWVudCBvdXQgb2YgcmFuZ2VcIik7dmFyIGI9dGhpcztyZXR1cm4gaShmdW5jdGlvbihjKXt2YXIgZD1hO3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbihhKXswPT09ZCYmKGMub25OZXh0KGEpLGMub25Db21wbGV0ZWQoKSk7XG5kLS19LGZ1bmN0aW9uKGEpe2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtjLm9uRXJyb3IoRXJyb3IoXCJBcmd1bWVudCBvdXQgb2YgcmFuZ2VcIikpfSl9KX07Zi5lbGVtZW50QXRPckRlZmF1bHQ9ZnVuY3Rpb24oYSxiKXt2YXIgYz10aGlzO2lmKDA+YSl0aHJvdyBFcnJvcihcIkFyZ3VtZW50IG91dCBvZiByYW5nZVwiKTtiPT09biYmKGI9bnVsbCk7cmV0dXJuIGkoZnVuY3Rpb24oZCl7dmFyIGU9YTtyZXR1cm4gYy5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7MD09PWUmJihkLm9uTmV4dChhKSxkLm9uQ29tcGxldGVkKCkpO2UtLX0sZnVuY3Rpb24oYSl7ZC5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2Qub25OZXh0KGIpO2Qub25Db21wbGV0ZWQoKX0pfSl9O2YuZGVmYXVsdElmRW1wdHk9ZnVuY3Rpb24oYSl7dmFyIGI9dGhpczthPT09biYmKGE9bnVsbCk7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9ITE7cmV0dXJuIGIuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2Q9ITA7Yy5vbk5leHQoYSl9LFxuZnVuY3Rpb24oYSl7Yy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2lmKCFkKWMub25OZXh0KGEpO2Mub25Db21wbGV0ZWQoKX0pfSl9O2YuZGlzdGluY3Q9ZnVuY3Rpb24oYSxiKXt2YXIgYz10aGlzO2F8fChhPVEpO2J8fChiPVcpO3JldHVybiBpKGZ1bmN0aW9uKGQpe3ZhciBlPXt9O3JldHVybiBjLnN1YnNjcmliZShmdW5jdGlvbihjKXt2YXIgZixpLGoscT0hMTt0cnl7Zj1hKGMpLGk9YihmKX1jYXRjaChrKXtkLm9uRXJyb3Ioayk7cmV0dXJufWZvcihqIGluIGUpaWYoaT09PWope3E9ITA7YnJlYWt9cXx8KGVbaV09bnVsbCxkLm9uTmV4dChjKSl9LGZ1bmN0aW9uKGEpe2Qub25FcnJvcihhKX0sZnVuY3Rpb24oKXtkLm9uQ29tcGxldGVkKCl9KX0pfTtmLm1lcmdlT2JzZXJ2YWJsZT1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYil7dmFyIGM9bmV3IHAsZD0hMSxlPW5ldyB2O2MuYWRkKGUpO2UuZGlzcG9zYWJsZShhLnN1YnNjcmliZShmdW5jdGlvbihhKXt2YXIgZT1cbm5ldyB2O2MuYWRkKGUpO2UuZGlzcG9zYWJsZShhLnN1YnNjcmliZShmdW5jdGlvbihhKXtiLm9uTmV4dChhKX0sZnVuY3Rpb24oYSl7Yi5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2MucmVtb3ZlKGUpO2lmKGQmJjE9PT1jLmNvdW50KCkpYi5vbkNvbXBsZXRlZCgpfSkpfSxmdW5jdGlvbihhKXtiLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7ZD0hMDtpZigxPT09Yy5jb3VudCgpKWIub25Db21wbGV0ZWQoKX0pKTtyZXR1cm4gY30pfTtmLm1lcmdlPWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9MCxlPW5ldyBwLGc9ITEsZj1bXSxpPWZ1bmN0aW9uKGEpe3ZhciBiPW5ldyB2O2UuYWRkKGIpO2IuZGlzcG9zYWJsZShhLnN1YnNjcmliZShmdW5jdGlvbihhKXtjLm9uTmV4dChhKX0sZnVuY3Rpb24oYSl7Yy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe3ZhciBhO2UucmVtb3ZlKGIpO2lmKDA8Zi5sZW5ndGgpYT1mLnNoaWZ0KCksaShhKTtlbHNlIGlmKGQtLSxcbmcmJjA9PT1kKWMub25Db21wbGV0ZWQoKX0pKX07ZS5hZGQoYi5zdWJzY3JpYmUoZnVuY3Rpb24oYil7ZDxhPyhkKyssaShiKSk6Zi5wdXNoKGIpfSxmdW5jdGlvbihhKXtjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Zz0hMDtpZigwPT09ZCljLm9uQ29tcGxldGVkKCl9KSk7cmV0dXJuIGV9KX07Zi5zd2l0Y2hMYXRlc3Q9ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGIpe3ZhciBjPSExLGQ9bmV3IEMsZT0hMSxnPTAsZj1hLnN1YnNjcmliZShmdW5jdGlvbihhKXt2YXIgZj1uZXcgdixoPSsrZztjPSEwO2QuZGlzcG9zYWJsZShmKTtyZXR1cm4gZi5kaXNwb3NhYmxlKGEuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2lmKGc9PT1oKWIub25OZXh0KGEpfSxmdW5jdGlvbihhKXtpZihnPT09aCliLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7aWYoZz09PWgmJihjPSExLGUpKWIub25Db21wbGV0ZWQoKX0pKX0sZnVuY3Rpb24oYSl7Yi5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2U9XG4hMDtpZighYyliLm9uQ29tcGxldGVkKCl9KTtyZXR1cm4gbmV3IHAoZixkKX0pfTtqLm1lcmdlPWZ1bmN0aW9uKGEpe2F8fChhPUIpO3ZhciBiPTE8YXJndW1lbnRzLmxlbmd0aCYmYXJndW1lbnRzWzFdaW5zdGFuY2VvZiBBcnJheT9hcmd1bWVudHNbMV06eS5jYWxsKGFyZ3VtZW50cywxKTtyZXR1cm4gZ2EoYixhKS5tZXJnZU9ic2VydmFibGUoKX07Zi5jb25jYXQ9ZnVuY3Rpb24oKXt2YXIgYT13YSxiO2I9YXJndW1lbnRzO3ZhciBjLGQ7Yz1bXTtmb3IoZD0wO2Q8Yi5sZW5ndGg7ZCsrKWMucHVzaChiW2RdKTtiPWM7Yi51bnNoaWZ0KHRoaXMpO3JldHVybiBhLmFwcGx5KHRoaXMsYil9O2YuY29uY2F0T2JzZXJ2YWJsZT1mdW5jdGlvbigpe3JldHVybiB0aGlzLm1lcmdlKDEpfTt2YXIgd2E9ai5jb25jYXQ9ZnVuY3Rpb24oKXt2YXIgYT0xPT09YXJndW1lbnRzLmxlbmd0aCYmYXJndW1lbnRzWzBdaW5zdGFuY2VvZiBBcnJheT9hcmd1bWVudHNbMF06eS5jYWxsKGFyZ3VtZW50cyk7XG5yZXR1cm4gUyhhKS5jb25jYXQoKX07Zi5jYXRjaEV4Y2VwdGlvbj1mdW5jdGlvbihhKXtyZXR1cm5cImZ1bmN0aW9uXCI9PT10eXBlb2YgYT94YSh0aGlzLGEpOnlhKFt0aGlzLGFdKX07dmFyIHhhPWZ1bmN0aW9uKGEsYil7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9bmV3IHYsZT1uZXcgQztkLmRpc3Bvc2FibGUoYS5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7Yy5vbk5leHQoYSl9LGZ1bmN0aW9uKGEpe3ZhciBkO3RyeXtkPWIoYSl9Y2F0Y2goZil7Yy5vbkVycm9yKGYpO3JldHVybn1hPW5ldyB2O2UuZGlzcG9zYWJsZShhKTthLmRpc3Bvc2FibGUoZC5zdWJzY3JpYmUoYykpfSxmdW5jdGlvbigpe2Mub25Db21wbGV0ZWQoKX0pKTtyZXR1cm4gZX0pfSx5YT1qLmNhdGNoRXhjZXB0aW9uPWZ1bmN0aW9uKCl7dmFyIGE9MT09PWFyZ3VtZW50cy5sZW5ndGgmJmFyZ3VtZW50c1swXWluc3RhbmNlb2YgQXJyYXk/YXJndW1lbnRzWzBdOnkuY2FsbChhcmd1bWVudHMpO3JldHVybiBTKGEpLmNhdGNoRXhjZXB0aW9uKCl9O1xuZi5vbkVycm9yUmVzdW1lTmV4dD1mdW5jdGlvbihhKXtyZXR1cm4gemEoW3RoaXMsYV0pfTt2YXIgemE9ai5vbkVycm9yUmVzdW1lTmV4dD1mdW5jdGlvbigpe3ZhciBhPTE9PT1hcmd1bWVudHMubGVuZ3RoJiZhcmd1bWVudHNbMF1pbnN0YW5jZW9mIEFycmF5P2FyZ3VtZW50c1swXTp5LmNhbGwoYXJndW1lbnRzKTtyZXR1cm4gaShmdW5jdGlvbihiKXt2YXIgYz0wLGQ9bmV3IEMsZT1CLnNjaGVkdWxlUmVjdXJzaXZlKGZ1bmN0aW9uKGUpe3ZhciBmLGk7aWYoYzxhLmxlbmd0aClmPWFbYysrXSxpPW5ldyB2LGQuZGlzcG9zYWJsZShpKSxpLmRpc3Bvc2FibGUoZi5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7Yi5vbk5leHQoYSl9LGZ1bmN0aW9uKCl7ZSgpfSxmdW5jdGlvbigpe2UoKX0pKTtlbHNlIGIub25Db21wbGV0ZWQoKX0pO3JldHVybiBuZXcgcChkLGUpfSl9LEFhPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShhLGMpe3ZhciBkPXRoaXM7dGhpcy5zZWxlY3Rvcj1hO3RoaXMub2JzZXJ2ZXI9XG5jO3RoaXMubGVmdFE9W107dGhpcy5yaWdodFE9W107dGhpcy5sZWZ0PUkoZnVuY3Rpb24oYSl7aWYoXCJFXCI9PT1hLmtpbmQpZC5vYnNlcnZlci5vbkVycm9yKGEuZXhjZXB0aW9uKTtlbHNlIGlmKDA9PT1kLnJpZ2h0US5sZW5ndGgpZC5sZWZ0US5wdXNoKGEpO2Vsc2UgZC5vbk5leHQoYSxkLnJpZ2h0US5zaGlmdCgpKX0pO3RoaXMucmlnaHQ9SShmdW5jdGlvbihhKXtpZihcIkVcIj09PWEua2luZClkLm9ic2VydmVyLm9uRXJyb3IoYS5leGNlcHRpb24pO2Vsc2UgaWYoMD09PWQubGVmdFEubGVuZ3RoKWQucmlnaHRRLnB1c2goYSk7ZWxzZSBkLm9uTmV4dChkLmxlZnRRLnNoaWZ0KCksYSl9KX1hLnByb3RvdHlwZS5vbk5leHQ9ZnVuY3Rpb24oYSxjKXt2YXIgZDtpZihcIkNcIj09PWEua2luZHx8XCJDXCI9PT1jLmtpbmQpdGhpcy5vYnNlcnZlci5vbkNvbXBsZXRlZCgpO2Vsc2V7dHJ5e2Q9dGhpcy5zZWxlY3RvcihhLnZhbHVlLGMudmFsdWUpfWNhdGNoKGUpe3RoaXMub2JzZXJ2ZXIub25FcnJvcihlKTtcbnJldHVybn10aGlzLm9ic2VydmVyLm9uTmV4dChkKX19O3JldHVybiBhfSgpO2YuemlwPWZ1bmN0aW9uKGEsYil7cmV0dXJuIEYodGhpcyxhLGZ1bmN0aW9uKGEpe3ZhciBkPW5ldyBBYShiLGEpO3JldHVybiBuZXcgSChmdW5jdGlvbihhKXtyZXR1cm4gZC5sZWZ0Lm9uTmV4dChhKX0sZnVuY3Rpb24oYSl7cmV0dXJuIGQucmlnaHQub25OZXh0KGEpfSl9KX07dmFyIGhhO2hhPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShhLGMpe3ZhciBkPXRoaXM7dGhpcy5zZWxlY3Rvcj1hO3RoaXMub2JzZXJ2ZXI9Yzt0aGlzLnJpZ2h0U3RvcHBlZD10aGlzLmxlZnRTdG9wcGVkPSExO3RoaXMubGVmdD1JKGZ1bmN0aW9uKGEpe2lmKFwiTlwiPT09YS5raW5kKWlmKGQubGVmdFZhbHVlPWEsZC5yaWdodFZhbHVlIT09bilkLm9uTmV4dCgpO2Vsc2V7aWYoZC5yaWdodFN0b3BwZWQpZC5vYnNlcnZlci5vbkNvbXBsZXRlZCgpfWVsc2UgaWYoXCJFXCI9PT1hLmtpbmQpZC5vYnNlcnZlci5vbkVycm9yKGEuZXhjZXB0aW9uKTtcbmVsc2UgaWYoZC5sZWZ0U3RvcHBlZD0hMCxkLnJpZ2h0U3RvcHBlZClkLm9ic2VydmVyLm9uQ29tcGxldGVkKCl9KTt0aGlzLnJpZ2h0PUkoZnVuY3Rpb24oYSl7aWYoXCJOXCI9PT1hLmtpbmQpaWYoZC5yaWdodFZhbHVlPWEsZC5sZWZ0VmFsdWUhPT1uKWQub25OZXh0KCk7ZWxzZXtpZihkLmxlZnRTdG9wcGVkKWQub2JzZXJ2ZXIub25Db21wbGV0ZWQoKX1lbHNlIGlmKFwiRVwiPT09YS5raW5kKWQub2JzZXJ2ZXIub25FcnJvcihhLmV4Y2VwdGlvbik7ZWxzZSBpZihkLnJpZ2h0U3RvcHBlZD0hMCxkLmxlZnRTdG9wcGVkKWQub2JzZXJ2ZXIub25Db21wbGV0ZWQoKX0pfWEucHJvdG90eXBlLm9uTmV4dD1mdW5jdGlvbigpe3ZhciBhO3RyeXthPXRoaXMuc2VsZWN0b3IodGhpcy5sZWZ0VmFsdWUudmFsdWUsdGhpcy5yaWdodFZhbHVlLnZhbHVlKX1jYXRjaChjKXt0aGlzLm9ic2VydmVyLm9uRXJyb3IoYyk7cmV0dXJufXRoaXMub2JzZXJ2ZXIub25OZXh0KGEpfTtyZXR1cm4gYX0oKTtmLmNvbWJpbmVMYXRlc3Q9XG5mdW5jdGlvbihhLGIpe3JldHVybiBGKHRoaXMsYSxmdW5jdGlvbihhKXt2YXIgZD1uZXcgaGEoYixhKTtyZXR1cm4gbmV3IEgoZnVuY3Rpb24oYSl7cmV0dXJuIGQubGVmdC5vbk5leHQoYSl9LGZ1bmN0aW9uKGEpe3JldHVybiBkLnJpZ2h0Lm9uTmV4dChhKX0pfSl9O2YudGFrZVVudGlsPWZ1bmN0aW9uKGEpe3JldHVybiBGKGEsdGhpcyxmdW5jdGlvbihhLGMpe3ZhciBkPSExLGU9ITE7cmV0dXJuIG5ldyBIKGZ1bmN0aW9uKGMpeyFlJiYhZCYmKFwiQ1wiPT09Yy5raW5kP2Q9ITA6XCJFXCI9PT1jLmtpbmQ/KGU9ZD0hMCxhLm9uRXJyb3IoYy5leGNlcHRpb24pKTooZT0hMCxhLm9uQ29tcGxldGVkKCkpKX0sZnVuY3Rpb24oZCl7ZXx8KGQuYWNjZXB0KGEpLChlPVwiTlwiIT09ZC5raW5kKSYmYy5kaXNwb3NlKCkpfSl9KX07Zi5za2lwVW50aWw9ZnVuY3Rpb24oYSl7cmV0dXJuIEYodGhpcyxhLGZ1bmN0aW9uKGEsYyxkKXt2YXIgZT0hMSxmPSExO3JldHVybiBuZXcgSChmdW5jdGlvbihjKXtpZihcIkVcIj09XG5jLmtpbmQpYS5vbkVycm9yKGMuZXhjZXB0aW9uKTtlbHNlIGUmJmMuYWNjZXB0KGEpfSxmdW5jdGlvbihjKXtpZighZil7aWYoXCJOXCI9PT1jLmtpbmQpZT0hMDtlbHNlIGlmKFwiRVwiPT09Yy5raW5kKWEub25FcnJvcihjLmV4Y2VwdGlvbik7Zj0hMDtkLmRpc3Bvc2UoKX19KX0pfTtqLmFtYj1mdW5jdGlvbigpe3ZhciBhPWRhKCksYixjPTE9PT1hcmd1bWVudHMubGVuZ3RoJiZhcmd1bWVudHNbMF1pbnN0YW5jZW9mIEFycmF5P2FyZ3VtZW50c1swXTp5LmNhbGwoYXJndW1lbnRzKTtmb3IoYj0wO2I8Yy5sZW5ndGg7YisrKWE9YS5hbWIoY1tiXSk7cmV0dXJuIGF9O2YuYW1iPWZ1bmN0aW9uKGEpe3JldHVybiBGKHRoaXMsYSxmdW5jdGlvbihhLGMsZCl7dmFyIGU9XCJOXCI7cmV0dXJuIG5ldyBIKGZ1bmN0aW9uKGMpe1wiTlwiPT09ZSYmKGU9XCJMXCIsZC5kaXNwb3NlKCkpO1wiTFwiPT09ZSYmYy5hY2NlcHQoYSl9LGZ1bmN0aW9uKGQpe1wiTlwiPT09ZSYmKGU9XCJSXCIsYy5kaXNwb3NlKCkpO1wiUlwiPT09XG5lJiZkLmFjY2VwdChhKX0pfSl9fTtcbiIsIi8qXG4gQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uICBBbGwgcmlnaHRzIHJlc2VydmVkLlxuIFRoaXMgY29kZSBpcyBsaWNlbnNlZCBieSBNaWNyb3NvZnQgQ29ycG9yYXRpb24gdW5kZXIgdGhlIHRlcm1zXG4gb2YgdGhlIE1JQ1JPU09GVCBSRUFDVElWRSBFWFRFTlNJT05TIEZPUiBKQVZBU0NSSVBUIEFORCAuTkVUIExJQlJBUklFUyBMaWNlbnNlLlxuIFNlZSBodHRwOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP0xpbmtJRD0yMjA3NjIuXG4qL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihrLHQpe3ZhciBsO2w9ay5SeDt2YXIgbj1sLk9ic2VydmFibGUsZD1uLnByb3RvdHlwZSxtPW4uY3JlYXRlV2l0aERpc3Bvc2FibGUsdT1sLkNvbXBvc2l0ZURpc3Bvc2FibGUsbz1mdW5jdGlvbihhLGIpe3JldHVybiBhPT09Yn0scD1mdW5jdGlvbihhKXtyZXR1cm4gYX0scT1mdW5jdGlvbihhLGIpe3JldHVybiBhPmI/MTphPT09Yj8wOi0xfSxyPWZ1bmN0aW9uKGEsYixkKXtyZXR1cm4gbShmdW5jdGlvbihjKXt2YXIgZj0hMSxnPW51bGwsaD1bXTtyZXR1cm4gYS5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7dmFyIGUsaTt0cnl7aT1iKGEpfWNhdGNoKHYpe2Mub25FcnJvcih2KTtyZXR1cm59ZT0wO2lmKGYpdHJ5e2U9ZChpLGcpfWNhdGNoKHcpe2Mub25FcnJvcih3KTtyZXR1cm59ZWxzZSBmPSEwLGc9XG5pOzA8ZSYmKGc9aSxoPVtdKTswPD1lJiZoLnB1c2goYSl9LGZ1bmN0aW9uKGEpe2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtjLm9uTmV4dChoKTtjLm9uQ29tcGxldGVkKCl9KX0pfTtkLmFnZ3JlZ2F0ZT1mdW5jdGlvbihhLGIpe3JldHVybiB0aGlzLnNjYW4oYSxiKS5zdGFydFdpdGgoYSkuZmluYWxWYWx1ZSgpfTtkLmFnZ3JlZ2F0ZTE9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuc2NhbjEoYSkuZmluYWxWYWx1ZSgpfTtkLmFueT1mdW5jdGlvbihhKXt2YXIgYj10aGlzO3JldHVybiBhIT09dD9iLndoZXJlKGEpLmFueSgpOm0oZnVuY3Rpb24oYSl7cmV0dXJuIGIuc3Vic2NyaWJlKGZ1bmN0aW9uKCl7YS5vbk5leHQoITApO2Eub25Db21wbGV0ZWQoKX0sZnVuY3Rpb24oYil7YS5vbkVycm9yKGIpfSxmdW5jdGlvbigpe2Eub25OZXh0KCExKTthLm9uQ29tcGxldGVkKCl9KX0pfTtkLmFsbD1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy53aGVyZShmdW5jdGlvbihiKXtyZXR1cm4hYShiKX0pLmFueSgpLnNlbGVjdChmdW5jdGlvbihhKXtyZXR1cm4hYX0pfTtcbmQuY29udGFpbnM9ZnVuY3Rpb24oYSxiKXtifHwoYj1vKTtyZXR1cm4gdGhpcy53aGVyZShmdW5jdGlvbihkKXtyZXR1cm4gYihkLGEpfSkuYW55KCl9O2QuY291bnQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5hZ2dyZWdhdGUoMCxmdW5jdGlvbihhKXtyZXR1cm4gYSsxfSl9O2Quc3VtPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuYWdncmVnYXRlKDAsZnVuY3Rpb24oYSxiKXtyZXR1cm4gYStifSl9O2QubWluQnk9ZnVuY3Rpb24oYSxiKXtifHwoYj1xKTtyZXR1cm4gcih0aGlzLGEsZnVuY3Rpb24oYSxjKXtyZXR1cm4tMSpiKGEsYyl9KX07dmFyIHM9ZnVuY3Rpb24oYSl7aWYoMD09YS5sZW5ndGgpdGhyb3cgRXJyb3IoXCJTZXF1ZW5jZSBjb250YWlucyBubyBlbGVtZW50cy5cIik7cmV0dXJuIGFbMF19O2QubWluPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLm1pbkJ5KHAsYSkuc2VsZWN0KGZ1bmN0aW9uKGEpe3JldHVybiBzKGEpfSl9O2QubWF4Qnk9ZnVuY3Rpb24oYSxiKXtifHwoYj1xKTtcbnJldHVybiByKHRoaXMsYSxiKX07ZC5tYXg9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMubWF4QnkocCxhKS5zZWxlY3QoZnVuY3Rpb24oYSl7cmV0dXJuIHMoYSl9KX07ZC5hdmVyYWdlPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuc2Nhbih7c3VtOjAsY291bnQ6MH0sZnVuY3Rpb24oYSxiKXtyZXR1cm57c3VtOmEuc3VtK2IsY291bnQ6YS5jb3VudCsxfX0pLmZpbmFsVmFsdWUoKS5zZWxlY3QoZnVuY3Rpb24oYSl7cmV0dXJuIGEuc3VtL2EuY291bnR9KX07ZC5zZXF1ZW5jZUVxdWFsPWZ1bmN0aW9uKGEsYil7dmFyIGQ9dGhpcztifHwoYj1vKTtyZXR1cm4gbShmdW5jdGlvbihjKXt2YXIgZj0hMSxnPSExLGg9W10saj1bXSxlPWQuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe3ZhciBkLGY7aWYoMDxqLmxlbmd0aCl7Zj1qLnNoaWZ0KCk7dHJ5e2Q9YihmLGEpfWNhdGNoKGUpe2Mub25FcnJvcihlKTtyZXR1cm59ZHx8KGMub25OZXh0KCExKSxjLm9uQ29tcGxldGVkKCkpfWVsc2UgZz8oYy5vbk5leHQoITEpLFxuYy5vbkNvbXBsZXRlZCgpKTpoLnB1c2goYSl9LGZ1bmN0aW9uKGEpe2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtmPSEwOzA9PT1oLmxlbmd0aCYmKDA8ai5sZW5ndGg/KGMub25OZXh0KCExKSxjLm9uQ29tcGxldGVkKCkpOmcmJihjLm9uTmV4dCghMCksYy5vbkNvbXBsZXRlZCgpKSl9KSxpPWEuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe3ZhciBkLGU7aWYoMDxoLmxlbmd0aCl7ZT1oLnNoaWZ0KCk7dHJ5e2Q9YihlLGEpfWNhdGNoKGcpe2Mub25FcnJvcihnKTtyZXR1cm59ZHx8KGMub25OZXh0KCExKSxjLm9uQ29tcGxldGVkKCkpfWVsc2UgZj8oYy5vbk5leHQoITEpLGMub25Db21wbGV0ZWQoKSk6ai5wdXNoKGEpfSxmdW5jdGlvbihhKXtjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Zz0hMDswPT09ai5sZW5ndGgmJigwPGgubGVuZ3RoPyhjLm9uTmV4dCghMSksYy5vbkNvbXBsZXRlZCgpKTpmJiYoYy5vbk5leHQoITApLGMub25Db21wbGV0ZWQoKSkpfSk7cmV0dXJuIG5ldyB1KGUsXG5pKX0pfX07XG4iLCIvKlxuIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiAgQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiBUaGlzIGNvZGUgaXMgbGljZW5zZWQgYnkgTWljcm9zb2Z0IENvcnBvcmF0aW9uIHVuZGVyIHRoZSB0ZXJtc1xuIG9mIHRoZSBNSUNST1NPRlQgUkVBQ1RJVkUgRVhURU5TSU9OUyBGT1IgSkFWQVNDUklQVCBBTkQgLk5FVCBMSUJSQVJJRVMgTGljZW5zZS5cbiBTZWUgaHR0cDovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSUQ9MjIwNzYyLlxuKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ocSxoKXt2YXIgZjtmPXEuUng7dmFyIHo9Zi5PYnNlcnZhYmxlLHU9Zi5Db21wb3NpdGVEaXNwb3NhYmxlLEU9Zi5SZWZDb3VudERpc3Bvc2FibGUscz1mLlNpbmdsZUFzc2lnbm1lbnREaXNwb3NhYmxlLEs9Zi5TZXJpYWxEaXNwb3NhYmxlLEE9Zi5TdWJqZWN0O2Y9ei5wcm90b3R5cGU7dmFyIEw9ei5lbXB0eSx2PXouY3JlYXRlV2l0aERpc3Bvc2FibGUsTT1mdW5jdGlvbihiLGEpe3JldHVybiBiPT09YX0sTj1mdW5jdGlvbigpe30sQj1mdW5jdGlvbihiLGEpe3JldHVybiB2KGZ1bmN0aW9uKGMpe3JldHVybiBuZXcgdShhLmdldERpc3Bvc2FibGUoKSxiLnN1YnNjcmliZShjKSl9KX0sQyxGLG8sRyx3LHg7bz1bMSwzLDcsMTMsMzEsNjEsMTI3LDI1MSw1MDksMTAyMSwyMDM5LDQwOTMsODE5MSwxNjM4MSxcbjMyNzQ5LDY1NTIxLDEzMTA3MSwyNjIxMzksNTI0Mjg3LDEwNDg1NzMsMjA5NzE0Myw0MTk0MzAxLDgzODg1OTMsMTY3NzcyMTMsMzM1NTQzOTMsNjcxMDg4NTksMTM0MjE3Njg5LDI2ODQzNTM5OSw1MzY4NzA5MDksMTA3Mzc0MTc4OSwyMTQ3NDgzNjQ3XTtGPWZ1bmN0aW9uKGIpe3ZhciBhLGM7aWYoYiYwKXJldHVybiAyPT09YjthPU1hdGguc3FydChiKTtmb3IoYz0zO2M8PWE7KXtpZigwPT09YiVjKXJldHVybiExO2MrPTJ9cmV0dXJuITB9O0M9ZnVuY3Rpb24oYil7dmFyIGEsYztmb3IoYT0wO2E8by5sZW5ndGg7KythKWlmKGM9b1thXSxjPj1iKXJldHVybiBjO2ZvcihhPWJ8MTthPG9bby5sZW5ndGgtMV07KXtpZihGKGEpKXJldHVybiBhO2ErPTJ9cmV0dXJuIGJ9O0c9MDt3PWZ1bmN0aW9uKGIpe3ZhciBhO2lmKGI9PT1oKXRocm93XCJubyBzdWNoIGtleVwiO2lmKGIuZ2V0SGFzaENvZGUhPT1oKXJldHVybiBiLmdldEhhc2hDb2RlKCk7YT0xNypHKys7Yi5nZXRIYXNoQ29kZT1mdW5jdGlvbigpe3JldHVybiBhfTtcbnJldHVybiBhfTt4PWZ1bmN0aW9uKCl7cmV0dXJue2tleTpudWxsLHZhbHVlOm51bGwsbmV4dDowLGhhc2hDb2RlOjB9fTt2YXIgeT1mdW5jdGlvbigpe2Z1bmN0aW9uIGIoYSxjKXt0aGlzLl9pbml0aWFsaXplKGEpO3RoaXMuY29tcGFyZXI9Y3x8TTt0aGlzLnNpemU9dGhpcy5mcmVlQ291bnQ9MDt0aGlzLmZyZWVMaXN0PS0xfWIucHJvdG90eXBlLl9pbml0aWFsaXplPWZ1bmN0aW9uKGEpe3ZhciBhPUMoYSksYzt0aGlzLmJ1Y2tldHM9QXJyYXkoYSk7dGhpcy5lbnRyaWVzPUFycmF5KGEpO2ZvcihjPTA7YzxhO2MrKyl0aGlzLmJ1Y2tldHNbY109LTEsdGhpcy5lbnRyaWVzW2NdPXgoKTt0aGlzLmZyZWVMaXN0PS0xfTtiLnByb3RvdHlwZS5jb3VudD1mdW5jdGlvbigpe3JldHVybiB0aGlzLnNpemV9O2IucHJvdG90eXBlLmFkZD1mdW5jdGlvbihhLGMpe3JldHVybiB0aGlzLl9pbnNlcnQoYSxjLCEwKX07Yi5wcm90b3R5cGUuX2luc2VydD1mdW5jdGlvbihhLGMsYil7dmFyIGUsZCxcbmc7dGhpcy5idWNrZXRzPT09aCYmdGhpcy5faW5pdGlhbGl6ZSgwKTtnPXcoYSkmMjE0NzQ4MzY0NztlPWcldGhpcy5idWNrZXRzLmxlbmd0aDtmb3IoZD10aGlzLmJ1Y2tldHNbZV07MDw9ZDtkPXRoaXMuZW50cmllc1tkXS5uZXh0KWlmKHRoaXMuZW50cmllc1tkXS5oYXNoQ29kZT09PWcmJnRoaXMuY29tcGFyZXIodGhpcy5lbnRyaWVzW2RdLmtleSxhKSl7aWYoYil0aHJvd1wiZHVwbGljYXRlIGtleVwiO3RoaXMuZW50cmllc1tkXS52YWx1ZT1jO3JldHVybn0wPHRoaXMuZnJlZUNvdW50PyhiPXRoaXMuZnJlZUxpc3QsdGhpcy5mcmVlTGlzdD10aGlzLmVudHJpZXNbYl0ubmV4dCwtLXRoaXMuZnJlZUNvdW50KToodGhpcy5zaXplPT09dGhpcy5lbnRyaWVzLmxlbmd0aCYmKHRoaXMuX3Jlc2l6ZSgpLGU9ZyV0aGlzLmJ1Y2tldHMubGVuZ3RoKSxiPXRoaXMuc2l6ZSwrK3RoaXMuc2l6ZSk7dGhpcy5lbnRyaWVzW2JdLmhhc2hDb2RlPWc7dGhpcy5lbnRyaWVzW2JdLm5leHQ9dGhpcy5idWNrZXRzW2VdO1xudGhpcy5lbnRyaWVzW2JdLmtleT1hO3RoaXMuZW50cmllc1tiXS52YWx1ZT1jO3RoaXMuYnVja2V0c1tlXT1ifTtiLnByb3RvdHlwZS5fcmVzaXplPWZ1bmN0aW9uKCl7dmFyIGEsYyxiLGUsZDtkPUMoMip0aGlzLnNpemUpO2I9QXJyYXkoZCk7Zm9yKGE9MDthPGIubGVuZ3RoOysrYSliW2FdPS0xO2U9QXJyYXkoZCk7Zm9yKGE9MDthPHRoaXMuc2l6ZTsrK2EpZVthXT10aGlzLmVudHJpZXNbYV07Zm9yKGE9dGhpcy5zaXplO2E8ZDsrK2EpZVthXT14KCk7Zm9yKGE9MDthPHRoaXMuc2l6ZTsrK2EpYz1lW2FdLmhhc2hDb2RlJWQsZVthXS5uZXh0PWJbY10sYltjXT1hO3RoaXMuYnVja2V0cz1iO3RoaXMuZW50cmllcz1lfTtiLnByb3RvdHlwZS5yZW1vdmU9ZnVuY3Rpb24oYSl7dmFyIGIsayxlLGQ7aWYodGhpcy5idWNrZXRzIT09aCl7ZD13KGEpJjIxNDc0ODM2NDc7Yj1kJXRoaXMuYnVja2V0cy5sZW5ndGg7az0tMTtmb3IoZT10aGlzLmJ1Y2tldHNbYl07MDw9ZTtlPXRoaXMuZW50cmllc1tlXS5uZXh0KXtpZih0aGlzLmVudHJpZXNbZV0uaGFzaENvZGU9PT1cbmQmJnRoaXMuY29tcGFyZXIodGhpcy5lbnRyaWVzW2VdLmtleSxhKSlyZXR1cm4gMD5rP3RoaXMuYnVja2V0c1tiXT10aGlzLmVudHJpZXNbZV0ubmV4dDp0aGlzLmVudHJpZXNba10ubmV4dD10aGlzLmVudHJpZXNbZV0ubmV4dCx0aGlzLmVudHJpZXNbZV0uaGFzaENvZGU9LTEsdGhpcy5lbnRyaWVzW2VdLm5leHQ9dGhpcy5mcmVlTGlzdCx0aGlzLmVudHJpZXNbZV0ua2V5PW51bGwsdGhpcy5lbnRyaWVzW2VdLnZhbHVlPW51bGwsdGhpcy5mcmVlTGlzdD1lLCsrdGhpcy5mcmVlQ291bnQsITA7az1lfX1yZXR1cm4hMX07Yi5wcm90b3R5cGUuY2xlYXI9ZnVuY3Rpb24oKXt2YXIgYTtpZighKDA+PXRoaXMuc2l6ZSkpe2ZvcihhPTA7YTx0aGlzLmJ1Y2tldHMubGVuZ3RoOysrYSl0aGlzLmJ1Y2tldHNbYV09LTE7Zm9yKGE9MDthPHRoaXMuc2l6ZTsrK2EpdGhpcy5lbnRyaWVzW2FdPXgoKTt0aGlzLmZyZWVMaXN0PS0xO3RoaXMuc2l6ZT0wfX07Yi5wcm90b3R5cGUuX2ZpbmRFbnRyeT1cbmZ1bmN0aW9uKGEpe3ZhciBiLGs7aWYodGhpcy5idWNrZXRzIT09aCl7az13KGEpJjIxNDc0ODM2NDc7Zm9yKGI9dGhpcy5idWNrZXRzW2sldGhpcy5idWNrZXRzLmxlbmd0aF07MDw9YjtiPXRoaXMuZW50cmllc1tiXS5uZXh0KWlmKHRoaXMuZW50cmllc1tiXS5oYXNoQ29kZT09PWsmJnRoaXMuY29tcGFyZXIodGhpcy5lbnRyaWVzW2JdLmtleSxhKSlyZXR1cm4gYn1yZXR1cm4tMX07Yi5wcm90b3R5cGUuY291bnQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5zaXplLXRoaXMuZnJlZUNvdW50fTtiLnByb3RvdHlwZS50cnlHZXRFbnRyeT1mdW5jdGlvbihhKXthPXRoaXMuX2ZpbmRFbnRyeShhKTtyZXR1cm4gMDw9YT97a2V5OnRoaXMuZW50cmllc1thXS5rZXksdmFsdWU6dGhpcy5lbnRyaWVzW2FdLnZhbHVlfTpofTtiLnByb3RvdHlwZS5nZXRWYWx1ZXM9ZnVuY3Rpb24oKXt2YXIgYT0wLGIsaz1bXTtpZih0aGlzLmVudHJpZXMhPT1oKWZvcihiPTA7Yjx0aGlzLnNpemU7YisrKWlmKDA8PVxudGhpcy5lbnRyaWVzW2JdLmhhc2hDb2RlKWtbYSsrXT10aGlzLmVudHJpZXNbYl0udmFsdWU7cmV0dXJuIGt9O2IucHJvdG90eXBlLmdldD1mdW5jdGlvbihhKXthPXRoaXMuX2ZpbmRFbnRyeShhKTtpZigwPD1hKXJldHVybiB0aGlzLmVudHJpZXNbYV0udmFsdWU7dGhyb3cgRXJyb3IoXCJubyBzdWNoIGtleVwiKTt9O2IucHJvdG90eXBlLnNldD1mdW5jdGlvbihhLGIpe3RoaXMuX2luc2VydChhLGIsITEpfTtiLnByb3RvdHlwZS5jb250YWluc2tleT1mdW5jdGlvbihhKXtyZXR1cm4gMDw9dGhpcy5fZmluZEVudHJ5KGEpfTtyZXR1cm4gYn0oKTtmLmpvaW49ZnVuY3Rpb24oYixhLGMsayl7dmFyIGU9dGhpcztyZXR1cm4gdihmdW5jdGlvbihkKXt2YXIgZz1uZXcgdSxqPSExLGY9MCxsPW5ldyB5LGg9ITEscj0wLHQ9bmV3IHk7Zy5hZGQoZS5zdWJzY3JpYmUoZnVuY3Rpb24oYil7dmFyIGMsZSxwPWYrKyxpPW5ldyBzLEg7bC5hZGQocCxiKTtnLmFkZChpKTtlPWZ1bmN0aW9uKCl7aWYobC5yZW1vdmUocCkmJlxuMD09PWwuY291bnQoKSYmailkLm9uQ29tcGxldGVkKCk7cmV0dXJuIGcucmVtb3ZlKGkpfTt0cnl7Yz1hKGIpfWNhdGNoKGgpe2Qub25FcnJvcihoKTtyZXR1cm59aS5kaXNwb3NhYmxlKGMudGFrZSgxKS5zdWJzY3JpYmUoZnVuY3Rpb24oKXt9LGZ1bmN0aW9uKGEpe2Qub25FcnJvcihhKX0sZnVuY3Rpb24oKXtlKCl9KSk7Yz10LmdldFZhbHVlcygpO2Zvcih2YXIgbj0wO248Yy5sZW5ndGg7bisrKXt0cnl7SD1rKGIsY1tuXSl9Y2F0Y2gocil7ZC5vbkVycm9yKHIpO2JyZWFrfWQub25OZXh0KEgpfX0sZnVuY3Rpb24oYSl7ZC5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2o9ITA7aWYoaHx8MD09PWwuY291bnQoKSlkLm9uQ29tcGxldGVkKCl9KSk7Zy5hZGQoYi5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7dmFyIGIsZSxwPXIrKyxpPW5ldyBzLGo7dC5hZGQocCxhKTtnLmFkZChpKTtlPWZ1bmN0aW9uKCl7aWYodC5yZW1vdmUocCkmJjA9PT10LmNvdW50KCkmJmgpZC5vbkNvbXBsZXRlZCgpO1xucmV0dXJuIGcucmVtb3ZlKGkpfTt0cnl7Yj1jKGEpfWNhdGNoKGYpe2Qub25FcnJvcihmKTtyZXR1cm59aS5kaXNwb3NhYmxlKGIudGFrZSgxKS5zdWJzY3JpYmUoZnVuY3Rpb24oKXt9LGZ1bmN0aW9uKGEpe2Qub25FcnJvcihhKX0sZnVuY3Rpb24oKXtlKCl9KSk7Yj1sLmdldFZhbHVlcygpO2Zvcih2YXIgbj0wO248Yi5sZW5ndGg7bisrKXt0cnl7aj1rKGJbbl0sYSl9Y2F0Y2goTyl7ZC5vbkVycm9yKE8pO2JyZWFrfWQub25OZXh0KGopfX0sZnVuY3Rpb24oYSl7ZC5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2g9ITA7aWYoanx8MD09PXQuY291bnQoKSlkLm9uQ29tcGxldGVkKCl9KSk7cmV0dXJuIGd9KX07Zi5ncm91cEpvaW49ZnVuY3Rpb24oYixhLGMsayl7dmFyIGU9dGhpcztyZXR1cm4gdihmdW5jdGlvbihkKXt2YXIgZz1uZXcgdSxqPW5ldyBFKGcpLGY9MCxsPW5ldyB5LGg9MCxyPW5ldyB5O2cuYWRkKGUuc3Vic2NyaWJlKGZ1bmN0aW9uKGIpe3ZhciBjLGUsbSxwPWYrKyxpLFxuaCxELG49bmV3IEE7bC5hZGQocCxuKTt0cnl7bT1rKGIsQihuLGopKX1jYXRjaChvKXtpPWwuZ2V0VmFsdWVzKCk7Zm9yKG09MDttPGkubGVuZ3RoO20rKylpW21dLm9uRXJyb3Iobyk7ZC5vbkVycm9yKG8pO3JldHVybn1kLm9uTmV4dChtKTtEPXIuZ2V0VmFsdWVzKCk7Zm9yKG09MDttPEQubGVuZ3RoO20rKyluLm9uTmV4dChEW21dKTtoPW5ldyBzO2cuYWRkKGgpO2U9ZnVuY3Rpb24oKXtpZihsLnJlbW92ZShwKSluLm9uQ29tcGxldGVkKCk7Zy5yZW1vdmUoaCl9O3RyeXtjPWEoYil9Y2F0Y2gocSl7aT1sLmdldFZhbHVlcygpO2ZvcihtPTA7bTxpLmxlbmd0aDttKyspaVttXS5vbkVycm9yKHEpO2Qub25FcnJvcihxKTtyZXR1cm59aC5kaXNwb3NhYmxlKGMudGFrZSgxKS5zdWJzY3JpYmUoZnVuY3Rpb24oKXt9LGZ1bmN0aW9uKGEpe3ZhciBiO2k9bC5nZXRWYWx1ZXMoKTtmb3IoYj0wO2I8aS5sZW5ndGg7YisrKWlbYl0ub25FcnJvcihhKTtkLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7ZSgpfSkpfSxcbmZ1bmN0aW9uKGEpe3ZhciBiLGM7Yz1sLmdldFZhbHVlcygpO2ZvcihiPTA7YjxjLmxlbmd0aDtiKyspY1tiXS5vbkVycm9yKGEpO2Qub25FcnJvcihhKX0sZnVuY3Rpb24oKXtkLm9uQ29tcGxldGVkKCl9KSk7Zy5hZGQoYi5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7dmFyIGIsZSxrLGYsaTtrPWgrKztyLmFkZChrLGEpO2k9bmV3IHM7Zy5hZGQoaSk7ZT1mdW5jdGlvbigpe3IucmVtb3ZlKGspO2cucmVtb3ZlKGkpfTt0cnl7Yj1jKGEpfWNhdGNoKGope2Y9bC5nZXRWYWx1ZXMoKTtmb3IoYj0wO2I8Zi5sZW5ndGg7YisrKWZbYl0ub25FcnJvcihqKTtkLm9uRXJyb3Ioaik7cmV0dXJufWkuZGlzcG9zYWJsZShiLnRha2UoMSkuc3Vic2NyaWJlKGZ1bmN0aW9uKCl7fSxmdW5jdGlvbihhKXt2YXIgYjtmPWwuZ2V0VmFsdWVzKCk7Zm9yKGI9MDtiPGYubGVuZ3RoO2IrKylmW2JdLm9uRXJyb3IoYSk7ZC5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2UoKX0pKTtmPWwuZ2V0VmFsdWVzKCk7Zm9yKGI9XG4wO2I8Zi5sZW5ndGg7YisrKWZbYl0ub25OZXh0KGEpfSxmdW5jdGlvbihiKXt2YXIgYSxjO2M9bC5nZXRWYWx1ZXMoKTtmb3IoYT0wO2E8Yy5sZW5ndGg7YSsrKWNbYV0ub25FcnJvcihiKTtkLm9uRXJyb3IoYil9KSk7cmV0dXJuIGp9KX07Zi5idWZmZXI9ZnVuY3Rpb24oYixhKXtyZXR1cm5cImZ1bmN0aW9uXCI9PT10eXBlb2YgYj9JKGIpLnNlbGVjdE1hbnkoZnVuY3Rpb24oYSl7cmV0dXJuIG9ic2VydmFibGVUb0FycmF5KGEpfSk6Sih0aGlzLGIsYSkuc2VsZWN0TWFueShmdW5jdGlvbihhKXtyZXR1cm4gb2JzZXJ2YWJsZVRvQXJyYXkoYSl9KX07Zi53aW5kb3c9ZnVuY3Rpb24oYixhKXtyZXR1cm5cImZ1bmN0aW9uXCI9PT10eXBlb2YgYj9JLmNhbGwodGhpcyxiKTpKLmNhbGwodGhpcyxiLGEpfTt2YXIgSj1mdW5jdGlvbihiLGEpe3JldHVybiBiLmdyb3VwSm9pbih0aGlzLGEsZnVuY3Rpb24oKXtyZXR1cm4gTCgpfSxmdW5jdGlvbihhLGIpe3JldHVybiBifSl9LEk9ZnVuY3Rpb24oYil7dmFyIGE9XG50aGlzO3JldHVybiB2KGZ1bmN0aW9uKGMpe3ZhciBmLGU9bmV3IEssZD1uZXcgdShlKSxnPW5ldyBFKGQpLGo9bmV3IEE7Yy5vbk5leHQoQihqLGcpKTtkLmFkZChhLnN1YnNjcmliZShmdW5jdGlvbihhKXtqLm9uTmV4dChhKX0sZnVuY3Rpb24oYSl7ai5vbkVycm9yKGEpO2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtqLm9uQ29tcGxldGVkKCk7Yy5vbkNvbXBsZXRlZCgpfSkpO2Y9ZnVuY3Rpb24oKXt2YXIgYSxkO3RyeXtkPWIoKX1jYXRjaChoKXtjLm9uRXJyb3IoaCk7cmV0dXJufWE9bmV3IHM7ZS5kaXNwb3NhYmxlKGEpO2EuZGlzcG9zYWJsZShkLnRha2UoMSkuc3Vic2NyaWJlKE4sZnVuY3Rpb24oYSl7ai5vbkVycm9yKGEpO2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtqLm9uQ29tcGxldGVkKCk7aj1uZXcgQTtjLm9uTmV4dChCKGosZykpO2YoKX0pKX07ZigpO3JldHVybiBnfSl9fTtcbiIsIi8qXG4gQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uICBBbGwgcmlnaHRzIHJlc2VydmVkLlxuIFRoaXMgY29kZSBpcyBsaWNlbnNlZCBieSBNaWNyb3NvZnQgQ29ycG9yYXRpb24gdW5kZXIgdGhlIHRlcm1zXG4gb2YgdGhlIE1JQ1JPU09GVCBSRUFDVElWRSBFWFRFTlNJT05TIEZPUiBKQVZBU0NSSVBUIEFORCAuTkVUIExJQlJBUklFUyBMaWNlbnNlLlxuIFNlZSBodHRwOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP0xpbmtJRD0yMjA3NjIuXG4qL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihrLGgpe3ZhciBpO2k9ay5SeDt2YXIgdz1BcnJheS5wcm90b3R5cGUuc2xpY2UseD1PYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LHk9ZnVuY3Rpb24oYixhKXtmdW5jdGlvbiBjKCl7dGhpcy5jb25zdHJ1Y3Rvcj1ifWZvcih2YXIgZiBpbiBhKXguY2FsbChhLGYpJiYoYltmXT1hW2ZdKTtjLnByb3RvdHlwZT1hLnByb3RvdHlwZTtiLnByb3RvdHlwZT1uZXcgYztiLmJhc2U9YS5wcm90b3R5cGU7cmV0dXJuIGJ9LGw9aS5PYnNlcnZhYmxlLHA9bC5wcm90b3R5cGUsej1sLmNyZWF0ZVdpdGhEaXNwb3NhYmxlLEE9bC50aHJvd0V4Y2VwdGlvbixCPWkuT2JzZXJ2ZXIuY3JlYXRlLHE9aS5JbnRlcm5hbHMuTGlzdCxDPWkuU2luZ2xlQXNzaWdubWVudERpc3Bvc2FibGUsRD1pLkNvbXBvc2l0ZURpc3Bvc2FibGUsXG5FPWkuSW50ZXJuYWxzLkFic3RyYWN0T2JzZXJ2ZXIsRj1mdW5jdGlvbihiLGEpe3JldHVybiBiPT09YX0sbyxyLGoscyxtLG47aj1bMSwzLDcsMTMsMzEsNjEsMTI3LDI1MSw1MDksMTAyMSwyMDM5LDQwOTMsODE5MSwxNjM4MSwzMjc0OSw2NTUyMSwxMzEwNzEsMjYyMTM5LDUyNDI4NywxMDQ4NTczLDIwOTcxNDMsNDE5NDMwMSw4Mzg4NTkzLDE2Nzc3MjEzLDMzNTU0MzkzLDY3MTA4ODU5LDEzNDIxNzY4OSwyNjg0MzUzOTksNTM2ODcwOTA5LDEwNzM3NDE3ODksMjE0NzQ4MzY0N107cj1mdW5jdGlvbihiKXt2YXIgYSxjO2lmKGImMClyZXR1cm4gMj09PWI7YT1NYXRoLnNxcnQoYik7Zm9yKGM9MztjPD1hOyl7aWYoMD09PWIlYylyZXR1cm4hMTtjKz0yfXJldHVybiEwfTtvPWZ1bmN0aW9uKGIpe3ZhciBhLGM7Zm9yKGE9MDthPGoubGVuZ3RoOysrYSlpZihjPWpbYV0sYz49YilyZXR1cm4gYztmb3IoYT1ifDE7YTxqW2oubGVuZ3RoLTFdOyl7aWYocihhKSlyZXR1cm4gYTthKz0yfXJldHVybiBifTtcbnM9MDttPWZ1bmN0aW9uKGIpe3ZhciBhO2lmKGI9PT1oKXRocm93XCJubyBzdWNoIGtleVwiO2lmKGIuZ2V0SGFzaENvZGUhPT1oKXJldHVybiBiLmdldEhhc2hDb2RlKCk7YT0xNypzKys7Yi5nZXRIYXNoQ29kZT1mdW5jdGlvbigpe3JldHVybiBhfTtyZXR1cm4gYX07bj1mdW5jdGlvbigpe3JldHVybntrZXk6bnVsbCx2YWx1ZTpudWxsLG5leHQ6MCxoYXNoQ29kZTowfX07dmFyIHQ9ZnVuY3Rpb24oKXtmdW5jdGlvbiBiKGEsYyl7dGhpcy5faW5pdGlhbGl6ZShhKTt0aGlzLmNvbXBhcmVyPWN8fEY7dGhpcy5zaXplPXRoaXMuZnJlZUNvdW50PTA7dGhpcy5mcmVlTGlzdD0tMX1iLnByb3RvdHlwZS5faW5pdGlhbGl6ZT1mdW5jdGlvbihhKXt2YXIgYT1vKGEpLGM7dGhpcy5idWNrZXRzPUFycmF5KGEpO3RoaXMuZW50cmllcz1BcnJheShhKTtmb3IoYz0wO2M8YTtjKyspdGhpcy5idWNrZXRzW2NdPS0xLHRoaXMuZW50cmllc1tjXT1uKCk7dGhpcy5mcmVlTGlzdD0tMX07Yi5wcm90b3R5cGUuY291bnQ9XG5mdW5jdGlvbigpe3JldHVybiB0aGlzLnNpemV9O2IucHJvdG90eXBlLmFkZD1mdW5jdGlvbihhLGMpe3JldHVybiB0aGlzLl9pbnNlcnQoYSxjLCEwKX07Yi5wcm90b3R5cGUuX2luc2VydD1mdW5jdGlvbihhLGMsYil7dmFyIGQsZSxnO3RoaXMuYnVja2V0cz09PWgmJnRoaXMuX2luaXRpYWxpemUoMCk7Zz1tKGEpJjIxNDc0ODM2NDc7ZD1nJXRoaXMuYnVja2V0cy5sZW5ndGg7Zm9yKGU9dGhpcy5idWNrZXRzW2RdOzA8PWU7ZT10aGlzLmVudHJpZXNbZV0ubmV4dClpZih0aGlzLmVudHJpZXNbZV0uaGFzaENvZGU9PT1nJiZ0aGlzLmNvbXBhcmVyKHRoaXMuZW50cmllc1tlXS5rZXksYSkpe2lmKGIpdGhyb3dcImR1cGxpY2F0ZSBrZXlcIjt0aGlzLmVudHJpZXNbZV0udmFsdWU9YztyZXR1cm59MDx0aGlzLmZyZWVDb3VudD8oYj10aGlzLmZyZWVMaXN0LHRoaXMuZnJlZUxpc3Q9dGhpcy5lbnRyaWVzW2JdLm5leHQsLS10aGlzLmZyZWVDb3VudCk6KHRoaXMuc2l6ZT09PXRoaXMuZW50cmllcy5sZW5ndGgmJlxuKHRoaXMuX3Jlc2l6ZSgpLGQ9ZyV0aGlzLmJ1Y2tldHMubGVuZ3RoKSxiPXRoaXMuc2l6ZSwrK3RoaXMuc2l6ZSk7dGhpcy5lbnRyaWVzW2JdLmhhc2hDb2RlPWc7dGhpcy5lbnRyaWVzW2JdLm5leHQ9dGhpcy5idWNrZXRzW2RdO3RoaXMuZW50cmllc1tiXS5rZXk9YTt0aGlzLmVudHJpZXNbYl0udmFsdWU9Yzt0aGlzLmJ1Y2tldHNbZF09Yn07Yi5wcm90b3R5cGUuX3Jlc2l6ZT1mdW5jdGlvbigpe3ZhciBhLGMsYixkLGU7ZT1vKDIqdGhpcy5zaXplKTtiPUFycmF5KGUpO2ZvcihhPTA7YTxiLmxlbmd0aDsrK2EpYlthXT0tMTtkPUFycmF5KGUpO2ZvcihhPTA7YTx0aGlzLnNpemU7KythKWRbYV09dGhpcy5lbnRyaWVzW2FdO2ZvcihhPXRoaXMuc2l6ZTthPGU7KythKWRbYV09bigpO2ZvcihhPTA7YTx0aGlzLnNpemU7KythKWM9ZFthXS5oYXNoQ29kZSVlLGRbYV0ubmV4dD1iW2NdLGJbY109YTt0aGlzLmJ1Y2tldHM9Yjt0aGlzLmVudHJpZXM9ZH07Yi5wcm90b3R5cGUucmVtb3ZlPVxuZnVuY3Rpb24oYSl7dmFyIGMsYixkLGU7aWYodGhpcy5idWNrZXRzIT09aCl7ZT1tKGEpJjIxNDc0ODM2NDc7Yz1lJXRoaXMuYnVja2V0cy5sZW5ndGg7Yj0tMTtmb3IoZD10aGlzLmJ1Y2tldHNbY107MDw9ZDtkPXRoaXMuZW50cmllc1tkXS5uZXh0KXtpZih0aGlzLmVudHJpZXNbZF0uaGFzaENvZGU9PT1lJiZ0aGlzLmNvbXBhcmVyKHRoaXMuZW50cmllc1tkXS5rZXksYSkpcmV0dXJuIDA+Yj90aGlzLmJ1Y2tldHNbY109dGhpcy5lbnRyaWVzW2RdLm5leHQ6dGhpcy5lbnRyaWVzW2JdLm5leHQ9dGhpcy5lbnRyaWVzW2RdLm5leHQsdGhpcy5lbnRyaWVzW2RdLmhhc2hDb2RlPS0xLHRoaXMuZW50cmllc1tkXS5uZXh0PXRoaXMuZnJlZUxpc3QsdGhpcy5lbnRyaWVzW2RdLmtleT1udWxsLHRoaXMuZW50cmllc1tkXS52YWx1ZT1udWxsLHRoaXMuZnJlZUxpc3Q9ZCwrK3RoaXMuZnJlZUNvdW50LCEwO2I9ZH19cmV0dXJuITF9O2IucHJvdG90eXBlLmNsZWFyPWZ1bmN0aW9uKCl7dmFyIGE7XG5pZighKDA+PXRoaXMuc2l6ZSkpe2ZvcihhPTA7YTx0aGlzLmJ1Y2tldHMubGVuZ3RoOysrYSl0aGlzLmJ1Y2tldHNbYV09LTE7Zm9yKGE9MDthPHRoaXMuc2l6ZTsrK2EpdGhpcy5lbnRyaWVzW2FdPW4oKTt0aGlzLmZyZWVMaXN0PS0xO3RoaXMuc2l6ZT0wfX07Yi5wcm90b3R5cGUuX2ZpbmRFbnRyeT1mdW5jdGlvbihhKXt2YXIgYyxiO2lmKHRoaXMuYnVja2V0cyE9PWgpe2I9bShhKSYyMTQ3NDgzNjQ3O2ZvcihjPXRoaXMuYnVja2V0c1tiJXRoaXMuYnVja2V0cy5sZW5ndGhdOzA8PWM7Yz10aGlzLmVudHJpZXNbY10ubmV4dClpZih0aGlzLmVudHJpZXNbY10uaGFzaENvZGU9PT1iJiZ0aGlzLmNvbXBhcmVyKHRoaXMuZW50cmllc1tjXS5rZXksYSkpcmV0dXJuIGN9cmV0dXJuLTF9O2IucHJvdG90eXBlLmNvdW50PWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuc2l6ZS10aGlzLmZyZWVDb3VudH07Yi5wcm90b3R5cGUudHJ5R2V0RW50cnk9ZnVuY3Rpb24oYSl7YT10aGlzLl9maW5kRW50cnkoYSk7XG5yZXR1cm4gMDw9YT97a2V5OnRoaXMuZW50cmllc1thXS5rZXksdmFsdWU6dGhpcy5lbnRyaWVzW2FdLnZhbHVlfTpofTtiLnByb3RvdHlwZS5nZXRWYWx1ZXM9ZnVuY3Rpb24oKXt2YXIgYT0wLGMsYj1bXTtpZih0aGlzLmVudHJpZXMhPT1oKWZvcihjPTA7Yzx0aGlzLnNpemU7YysrKWlmKDA8PXRoaXMuZW50cmllc1tjXS5oYXNoQ29kZSliW2ErK109dGhpcy5lbnRyaWVzW2NdLnZhbHVlO3JldHVybiBifTtiLnByb3RvdHlwZS5nZXQ9ZnVuY3Rpb24oYSl7YT10aGlzLl9maW5kRW50cnkoYSk7aWYoMDw9YSlyZXR1cm4gdGhpcy5lbnRyaWVzW2FdLnZhbHVlO3Rocm93IEVycm9yKFwibm8gc3VjaCBrZXlcIik7fTtiLnByb3RvdHlwZS5zZXQ9ZnVuY3Rpb24oYSxiKXt0aGlzLl9pbnNlcnQoYSxiLCExKX07Yi5wcm90b3R5cGUuY29udGFpbnNrZXk9ZnVuY3Rpb24oYSl7cmV0dXJuIDA8PXRoaXMuX2ZpbmRFbnRyeShhKX07cmV0dXJuIGJ9KCksdT1mdW5jdGlvbigpe2Z1bmN0aW9uIGIoYSl7dGhpcy5wYXR0ZXJucz1cbmF9Yi5wcm90b3R5cGUuYW5kPWZ1bmN0aW9uKGEpe3ZhciBjPXRoaXMucGF0dGVybnMsZixkO2Q9W107Zm9yKGY9MDtmPGMubGVuZ3RoO2YrKylkLnB1c2goY1tmXSk7ZC5wdXNoKGEpO3JldHVybiBuZXcgYihkKX07Yi5wcm90b3R5cGUudGhlbj1mdW5jdGlvbihhKXtyZXR1cm4gbmV3IEcodGhpcyxhKX07cmV0dXJuIGJ9KCksRz1mdW5jdGlvbigpe2Z1bmN0aW9uIGIoYSxiKXt0aGlzLmV4cHJlc3Npb249YTt0aGlzLnNlbGVjdG9yPWJ9Yi5wcm90b3R5cGUuYWN0aXZhdGU9ZnVuY3Rpb24oYSxiLGYpe3ZhciBkLGUsZyxoO2g9dGhpcztnPVtdO2ZvcihlPTA7ZTx0aGlzLmV4cHJlc3Npb24ucGF0dGVybnMubGVuZ3RoO2UrKylnLnB1c2goSChhLHRoaXMuZXhwcmVzc2lvbi5wYXR0ZXJuc1tlXSxmdW5jdGlvbihhKXtiLm9uRXJyb3IoYSl9KSk7ZD1uZXcgdihnLGZ1bmN0aW9uKCl7dmFyIGE7dHJ5e2E9aC5zZWxlY3Rvci5hcHBseShoLGFyZ3VtZW50cyl9Y2F0Y2goZCl7Yi5vbkVycm9yKGQpO1xucmV0dXJufWIub25OZXh0KGEpfSxmdW5jdGlvbigpe3ZhciBhO2ZvcihhPTA7YTxnLmxlbmd0aDthKyspZ1thXS5yZW1vdmVBY3RpdmVQbGFuKGQpO2YoZCl9KTtmb3IoZT0wO2U8Zy5sZW5ndGg7ZSsrKWdbZV0uYWRkQWN0aXZlUGxhbihkKTtyZXR1cm4gZH07cmV0dXJuIGJ9KCksSD1mdW5jdGlvbihiLGEsYyl7dmFyIGY7Zj1iLnRyeUdldEVudHJ5KGEpO3JldHVybiBmPT09aD8oYz1uZXcgSShhLGMpLGIuYWRkKGEsYyksYyk6Zi52YWx1ZX0sdjt2PWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYihhLGIsZil7dGhpcy5qb2luT2JzZXJ2ZXJBcnJheT1hO3RoaXMub25OZXh0PWI7dGhpcy5vbkNvbXBsZXRlZD1mO3RoaXMuam9pbk9ic2VydmVycz1uZXcgdDtmb3IoYT0wO2E8dGhpcy5qb2luT2JzZXJ2ZXJBcnJheS5sZW5ndGg7YSsrKWI9dGhpcy5qb2luT2JzZXJ2ZXJBcnJheVthXSx0aGlzLmpvaW5PYnNlcnZlcnMuYWRkKGIsYil9Yi5wcm90b3R5cGUuZGVxdWV1ZT1mdW5jdGlvbigpe3ZhciBhLFxuYjtiPXRoaXMuam9pbk9ic2VydmVycy5nZXRWYWx1ZXMoKTtmb3IoYT0wO2E8Yi5sZW5ndGg7YSsrKWJbYV0ucXVldWUuc2hpZnQoKX07Yi5wcm90b3R5cGUubWF0Y2g9ZnVuY3Rpb24oKXt2YXIgYSxiLGY7YT0hMDtmb3IoYj0wO2I8dGhpcy5qb2luT2JzZXJ2ZXJBcnJheS5sZW5ndGg7YisrKWlmKDA9PT10aGlzLmpvaW5PYnNlcnZlckFycmF5W2JdLnF1ZXVlLmxlbmd0aCl7YT0hMTticmVha31pZihhKXthPVtdO2Y9ITE7Zm9yKGI9MDtiPHRoaXMuam9pbk9ic2VydmVyQXJyYXkubGVuZ3RoO2IrKylhLnB1c2godGhpcy5qb2luT2JzZXJ2ZXJBcnJheVtiXS5xdWV1ZVswXSksXCJDXCI9PT10aGlzLmpvaW5PYnNlcnZlckFycmF5W2JdLnF1ZXVlWzBdLmtpbmQmJihmPSEwKTtpZihmKXRoaXMub25Db21wbGV0ZWQoKTtlbHNle3RoaXMuZGVxdWV1ZSgpO2Y9W107Zm9yKGI9MDtiPGEubGVuZ3RoO2IrKylmLnB1c2goYVtiXS52YWx1ZSk7dGhpcy5vbk5leHQuYXBwbHkodGhpcyxmKX19fTtcbnJldHVybiBifSgpO3ZhciBJPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYihhLGIpe3RoaXMuc291cmNlPWE7dGhpcy5vbkVycm9yPWI7dGhpcy5xdWV1ZT1bXTt0aGlzLmFjdGl2ZVBsYW5zPW5ldyBxO3RoaXMuc3Vic2NyaXB0aW9uPW5ldyBDO3RoaXMuaXNEaXNwb3NlZD0hMX15KGIsRSk7Yi5wcm90b3R5cGUuYWRkQWN0aXZlUGxhbj1mdW5jdGlvbihhKXt0aGlzLmFjdGl2ZVBsYW5zLmFkZChhKX07Yi5wcm90b3R5cGUuc3Vic2NyaWJlPWZ1bmN0aW9uKCl7dGhpcy5zdWJzY3JpcHRpb24uZGlzcG9zYWJsZSh0aGlzLnNvdXJjZS5tYXRlcmlhbGl6ZSgpLnN1YnNjcmliZSh0aGlzKSl9O2IucHJvdG90eXBlLm5leHQ9ZnVuY3Rpb24oYSl7dmFyIGI7aWYoIXRoaXMuaXNEaXNwb3NlZClpZihcIkVcIj09PWEua2luZCl0aGlzLm9uRXJyb3IoYS5leGNlcHRpb24pO2Vsc2V7dGhpcy5xdWV1ZS5wdXNoKGEpO2E9dGhpcy5hY3RpdmVQbGFucy50b0FycmF5KCk7Zm9yKGI9MDtiPGEubGVuZ3RoO2IrKylhW2JdLm1hdGNoKCl9fTtcbmIucHJvdG90eXBlLmVycm9yPWZ1bmN0aW9uKCl7fTtiLnByb3RvdHlwZS5jb21wbGV0ZWQ9ZnVuY3Rpb24oKXt9O2IucHJvdG90eXBlLnJlbW92ZUFjdGl2ZVBsYW49ZnVuY3Rpb24oYSl7dGhpcy5hY3RpdmVQbGFucy5yZW1vdmUoYSk7MD09PXRoaXMuYWN0aXZlUGxhbnMuY291bnQoKSYmdGhpcy5kaXNwb3NlKCl9O2IucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXtiLmJhc2UuZGlzcG9zZS5jYWxsKHRoaXMpO2lmKCF0aGlzLmlzRGlzcG9zZWQpdGhpcy5pc0Rpc3Bvc2VkPSEwLHRoaXMuc3Vic2NyaXB0aW9uLmRpc3Bvc2UoKX07cmV0dXJuIGJ9KCk7cC5hbmQ9ZnVuY3Rpb24oYil7cmV0dXJuIG5ldyB1KFt0aGlzLGJdKX07cC50aGVuPWZ1bmN0aW9uKGIpe3JldHVybihuZXcgdShbdGhpc10pKS50aGVuKGIpfTtsLndoZW49ZnVuY3Rpb24oKXt2YXIgYj0xPT09YXJndW1lbnRzLmxlbmd0aCYmYXJndW1lbnRzWzBdaW5zdGFuY2VvZiBBcnJheT9hcmd1bWVudHNbMF06dy5jYWxsKGFyZ3VtZW50cyk7XG5yZXR1cm4geihmdW5jdGlvbihhKXt2YXIgYz1uZXcgcSxmPW5ldyB0LGQsZSxnLGgsaTtpPUIoZnVuY3Rpb24oYil7YS5vbk5leHQoYil9LGZ1bmN0aW9uKGIpe2Zvcih2YXIgYz1mLmdldFZhbHVlcygpLGQ9MDtkPGMubGVuZ3RoO2QrKyljW2RdLm9uRXJyb3IoYik7YS5vbkVycm9yKGIpfSxmdW5jdGlvbigpe2Eub25Db21wbGV0ZWQoKX0pO3RyeXtmb3IoZT0wO2U8Yi5sZW5ndGg7ZSsrKWMuYWRkKGJbZV0uYWN0aXZhdGUoZixpLGZ1bmN0aW9uKGEpe2MucmVtb3ZlKGEpO2lmKDA9PT1jLmNvdW50KCkpaS5vbkNvbXBsZXRlZCgpfSkpfWNhdGNoKGope0Eoaikuc3Vic2NyaWJlKGEpfWQ9bmV3IEQ7aD1mLmdldFZhbHVlcygpO2ZvcihlPTA7ZTxoLmxlbmd0aDtlKyspZz1oW2VdLGcuc3Vic2NyaWJlKCksZC5hZGQoZyk7cmV0dXJuIGR9KX19O1xuIiwiLypcbiBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gVGhpcyBjb2RlIGlzIGxpY2Vuc2VkIGJ5IE1pY3Jvc29mdCBDb3Jwb3JhdGlvbiB1bmRlciB0aGUgdGVybXNcbiBvZiB0aGUgTUlDUk9TT0ZUIFJFQUNUSVZFIEVYVEVOU0lPTlMgRk9SIEpBVkFTQ1JJUFQgQU5EIC5ORVQgTElCUkFSSUVTIExpY2Vuc2UuXG4gU2VlIGh0dHA6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/TGlua0lEPTIyMDc2Mi5cbiovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHcsbil7dmFyIHA7cD13LlJ4O3ZhciBxPXAuT2JzZXJ2YWJsZSxvPXEucHJvdG90eXBlLG09cS5jcmVhdGVXaXRoRGlzcG9zYWJsZSx5PXEuZGVmZXIsRj1xLnRocm93RXhjZXB0aW9uLGw9cC5TY2hlZHVsZXIuVGltZW91dCxyPXAuU2luZ2xlQXNzaWdubWVudERpc3Bvc2FibGUsdD1wLlNlcmlhbERpc3Bvc2FibGUscz1wLkNvbXBvc2l0ZURpc3Bvc2FibGUsej1wLlJlZkNvdW50RGlzcG9zYWJsZSx1PXAuU3ViamVjdCxHPXAuSW50ZXJuYWxzLkJpbmFyeU9ic2VydmVyLHY9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gbShmdW5jdGlvbihjKXtyZXR1cm4gbmV3IHMoYi5nZXREaXNwb3NhYmxlKCksYS5zdWJzY3JpYmUoYykpfSl9LEg9ZnVuY3Rpb24oYSxiLGMpe3JldHVybiBtKGZ1bmN0aW9uKGQpe3ZhciBmPVxubmV3IHIsZT1uZXcgcixkPWMoZCxmLGUpO2YuZGlzcG9zYWJsZShhLm1hdGVyaWFsaXplKCkuc2VsZWN0KGZ1bmN0aW9uKGIpe3JldHVybntzd2l0Y2hWYWx1ZTpmdW5jdGlvbihjKXtyZXR1cm4gYyhiKX19fSkuc3Vic2NyaWJlKGQpKTtlLmRpc3Bvc2FibGUoYi5tYXRlcmlhbGl6ZSgpLnNlbGVjdChmdW5jdGlvbihiKXtyZXR1cm57c3dpdGNoVmFsdWU6ZnVuY3Rpb24oYyxhKXtyZXR1cm4gYShiKX19fSkuc3Vic2NyaWJlKGQpKTtyZXR1cm4gbmV3IHMoZixlKX0pfSxJPWZ1bmN0aW9uKGEsYil7cmV0dXJuIG0oZnVuY3Rpb24oYyl7cmV0dXJuIGIuc2NoZWR1bGVXaXRoQWJzb2x1dGUoYSxmdW5jdGlvbigpe2Mub25OZXh0KDApO2Mub25Db21wbGV0ZWQoKX0pfSl9LEE9ZnVuY3Rpb24oYSxiLGMpe3ZhciBkPTA+Yj8wOmI7cmV0dXJuIG0oZnVuY3Rpb24oYil7dmFyIGU9MCxnPWE7cmV0dXJuIGMuc2NoZWR1bGVSZWN1cnNpdmVXaXRoQWJzb2x1dGUoZyxmdW5jdGlvbihhKXt2YXIgaTtcbjA8ZCYmKGk9Yy5ub3coKSxnKz1kLGc8PWkmJihnPWkrZCkpO2Iub25OZXh0KGUrKyk7YShnKX0pfSl9LEo9ZnVuY3Rpb24oYSxiKXt2YXIgYz0wPmE/MDphO3JldHVybiBtKGZ1bmN0aW9uKGEpe3JldHVybiBiLnNjaGVkdWxlV2l0aFJlbGF0aXZlKGMsZnVuY3Rpb24oKXthLm9uTmV4dCgwKTthLm9uQ29tcGxldGVkKCl9KX0pfSxCPWZ1bmN0aW9uKGEsYixjKXtyZXR1cm4geShmdW5jdGlvbigpe3JldHVybiBBKGMubm93KCkrYSxiLGMpfSl9LEs9cS5pbnRlcnZhbD1mdW5jdGlvbihhLGIpe2J8fChiPWwpO3JldHVybiBCKGEsYSxiKX07cS50aW1lcj1mdW5jdGlvbihhLGIsYyl7dmFyIGQ7Y3x8KGM9bCk7YiE9PW4mJlwibnVtYmVyXCI9PT10eXBlb2YgYj9kPWI6YiE9PW4mJlwib2JqZWN0XCI9PT10eXBlb2YgYiYmKGM9Yik7cmV0dXJuIGEgaW5zdGFuY2VvZiBEYXRlJiZkPT09bj9JKGEuZ2V0VGltZSgpLGMpOmEgaW5zdGFuY2VvZiBEYXRlJiZkIT09bj9BKGEuZ2V0VGltZSgpLGIsYyk6XG5kPT09bj9KKGEsYyk6QihhLGQsYyl9O3ZhciBEPWZ1bmN0aW9uKGEsYixjKXtyZXR1cm4gbShmdW5jdGlvbihkKXt2YXIgZj0hMSxlPW5ldyB0LGc9bnVsbCxoPVtdLGk9ITEsajtqPWEubWF0ZXJpYWxpemUoKS50aW1lc3RhbXAoYykuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe1wiRVwiPT09YS52YWx1ZS5raW5kPyhoPVtdLGgucHVzaChhKSxnPWEudmFsdWUuZXhjZXB0aW9uLGE9IWkpOihoLnB1c2goe3ZhbHVlOmEudmFsdWUsdGltZXN0YW1wOmEudGltZXN0YW1wK2J9KSxhPSFmLGY9ITApO2lmKGEpaWYobnVsbCE9PWcpZC5vbkVycm9yKGcpO2Vsc2UgYT1uZXcgcixlLmRpc3Bvc2FibGUoYSksYS5kaXNwb3NhYmxlKGMuc2NoZWR1bGVSZWN1cnNpdmVXaXRoUmVsYXRpdmUoYixmdW5jdGlvbihhKXt2YXIgYixlLGo7aWYobnVsbD09PWcpe2k9ITA7ZG97Yj1udWxsO2lmKDA8aC5sZW5ndGgmJjA+PWhbMF0udGltZXN0YW1wLWMubm93KCkpYj1oLnNoaWZ0KCkudmFsdWU7bnVsbCE9PWImJlxuYi5hY2NlcHQoZCl9d2hpbGUobnVsbCE9PWIpO2o9ITE7ZT0wOzA8aC5sZW5ndGg/KGo9ITAsZT1NYXRoLm1heCgwLGhbMF0udGltZXN0YW1wLWMubm93KCkpKTpmPSExO2I9ZztpPSExO2lmKG51bGwhPT1iKWQub25FcnJvcihiKTtlbHNlIGomJmEoZSl9fSkpfSk7cmV0dXJuIG5ldyBzKGosZSl9KX0sTD1mdW5jdGlvbihhLGIsYyl7cmV0dXJuIHkoZnVuY3Rpb24oKXt2YXIgYT1iLWMubm93KCk7cmV0dXJuIEQoYSxjKX0pfTtvLmRlbGF5PWZ1bmN0aW9uKGEsYil7Ynx8KGI9bCk7cmV0dXJuIGEgaW5zdGFuY2VvZiBEYXRlP0wodGhpcyxhLmdldFRpbWUoKSxiKTpEKHRoaXMsYSxiKX07by50aHJvdHRsZT1mdW5jdGlvbihhLGIpe2J8fChiPWwpO3ZhciBjPXRoaXM7cmV0dXJuIG0oZnVuY3Rpb24oZCl7dmFyIGY9bmV3IHQsZT0hMSxnPTAsaCxpPW51bGw7aD1jLnN1YnNjcmliZShmdW5jdGlvbihjKXt2YXIgaztlPSEwO2k9YztnKys7az1nO2M9bmV3IHI7Zi5kaXNwb3NhYmxlKGMpO1xuYy5kaXNwb3NhYmxlKGIuc2NoZWR1bGVXaXRoUmVsYXRpdmUoYSxmdW5jdGlvbigpe2lmKGUmJmc9PT1rKWQub25OZXh0KGkpO2U9ITF9KSl9LGZ1bmN0aW9uKGEpe2YuZGlzcG9zZSgpO2Qub25FcnJvcihhKTtlPSExO2crK30sZnVuY3Rpb24oKXtmLmRpc3Bvc2UoKTtpZihlKWQub25OZXh0KGkpO2Qub25Db21wbGV0ZWQoKTtlPSExO2crK30pO3JldHVybiBuZXcgcyhoLGYpfSl9O28ud2luZG93V2l0aFRpbWU9ZnVuY3Rpb24oYSxiLGMpe3ZhciBkPXRoaXMsZjtiPT09biYmKGY9YSk7Yz09PW4mJihjPWwpO1wibnVtYmVyXCI9PT10eXBlb2YgYj9mPWI6XCJvYmplY3RcIj09PXR5cGVvZiBiJiYoZj1hLGM9Yik7cmV0dXJuIG0oZnVuY3Rpb24oYil7dmFyIGcsaCxpPWYsaj1hLGs9W10seCxDPW5ldyB0LGw9MDtoPW5ldyBzKEMpO3g9bmV3IHooaCk7Zz1mdW5jdGlvbigpe3ZhciBhLGQsaCxtLG47aD1uZXcgcjtDLmRpc3Bvc2FibGUoaCk7YT1kPSExO2o9PT1pP2E9ZD0hMDpqPGk/ZD0hMDpcbmE9ITA7bT1kP2o6aTtuPW0tbDtsPW07ZCYmKGorPWYpO2EmJihpKz1mKTtoLmRpc3Bvc2FibGUoYy5zY2hlZHVsZVdpdGhSZWxhdGl2ZShuLGZ1bmN0aW9uKCl7dmFyIGM7YSYmKGM9bmV3IHUsay5wdXNoKGMpLGIub25OZXh0KHYoYyx4KSkpO2QmJihjPWsuc2hpZnQoKSxjLm9uQ29tcGxldGVkKCkpO2coKX0pKX07ay5wdXNoKG5ldyB1KTtiLm9uTmV4dCh2KGtbMF0seCkpO2coKTtoLmFkZChkLnN1YnNjcmliZShmdW5jdGlvbihhKXt2YXIgYixjO2ZvcihiPTA7YjxrLmxlbmd0aDtiKyspYz1rW2JdLGMub25OZXh0KGEpfSxmdW5jdGlvbihhKXt2YXIgYyxkO2ZvcihjPTA7YzxrLmxlbmd0aDtjKyspZD1rW2NdLGQub25FcnJvcihhKTtiLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7dmFyIGEsYztmb3IoYT0wO2E8ay5sZW5ndGg7YSsrKWM9a1thXSxjLm9uQ29tcGxldGVkKCk7Yi5vbkNvbXBsZXRlZCgpfSkpO3JldHVybiB4fSl9O28ud2luZG93V2l0aFRpbWVPckNvdW50PWZ1bmN0aW9uKGEsXG5iLGMpe3ZhciBkPXRoaXM7Y3x8KGM9bCk7cmV0dXJuIG0oZnVuY3Rpb24oZil7dmFyIGUsZyxoPTAsaSxqLGs9bmV3IHQsbD0wO2c9bmV3IHMoayk7aT1uZXcgeihnKTtlPWZ1bmN0aW9uKGIpe3ZhciBkPW5ldyByO2suZGlzcG9zYWJsZShkKTtkLmRpc3Bvc2FibGUoYy5zY2hlZHVsZVdpdGhSZWxhdGl2ZShhLGZ1bmN0aW9uKCl7dmFyIGE7Yj09PWwmJihoPTAsYT0rK2wsai5vbkNvbXBsZXRlZCgpLGo9bmV3IHUsZi5vbk5leHQodihqLGkpKSxlKGEpKX0pKX07aj1uZXcgdTtmLm9uTmV4dCh2KGosaSkpO2UoMCk7Zy5hZGQoZC5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7dmFyIGM9MCxkPSExO2oub25OZXh0KGEpO2grKztoPT09YiYmKGQ9ITAsaD0wLGM9KytsLGoub25Db21wbGV0ZWQoKSxqPW5ldyB1LGYub25OZXh0KHYoaixpKSkpO2QmJmUoYyl9LGZ1bmN0aW9uKGEpe2oub25FcnJvcihhKTtmLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7ai5vbkNvbXBsZXRlZCgpO2Yub25Db21wbGV0ZWQoKX0pKTtcbnJldHVybiBpfSl9O28uYnVmZmVyV2l0aFRpbWU9ZnVuY3Rpb24oYSxiLGMpe3ZhciBkO2I9PT1uJiYoZD1hKTtjfHwoYz1sKTtcIm51bWJlclwiPT09dHlwZW9mIGI/ZD1iOlwib2JqZWN0XCI9PT10eXBlb2YgYiYmKGQ9YSxjPWIpO3JldHVybiB0aGlzLndpbmRvd1dpdGhUaW1lKGEsZCxjKS5zZWxlY3RNYW55KGZ1bmN0aW9uKGEpe3JldHVybiBhLnRvQXJyYXkoKX0pfTtvLmJ1ZmZlcldpdGhUaW1lT3JDb3VudD1mdW5jdGlvbihhLGIsYyl7Y3x8KGM9bCk7cmV0dXJuIHRoaXMud2luZG93V2l0aFRpbWVPckNvdW50KGEsYixjKS5zZWxlY3RNYW55KGZ1bmN0aW9uKGEpe3JldHVybiBhLnRvQXJyYXkoKX0pfTtvLnRpbWVJbnRlcnZhbD1mdW5jdGlvbihhKXt2YXIgYj10aGlzO2F8fChhPWwpO3JldHVybiB5KGZ1bmN0aW9uKCl7dmFyIGM9YS5ub3coKTtyZXR1cm4gYi5zZWxlY3QoZnVuY3Rpb24oYil7dmFyIGY9YS5ub3coKSxlPWYtYztjPWY7cmV0dXJue3ZhbHVlOmIsaW50ZXJ2YWw6ZX19KX0pfTtcbm8udGltZXN0YW1wPWZ1bmN0aW9uKGEpe2F8fChhPWwpO3JldHVybiB0aGlzLnNlbGVjdChmdW5jdGlvbihiKXtyZXR1cm57dmFsdWU6Yix0aW1lc3RhbXA6YS5ub3coKX19KX07dmFyIEU9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gSChhLGIsZnVuY3Rpb24oYSl7dmFyIGI9ITEsZjtyZXR1cm4gbmV3IEcoZnVuY3Rpb24oZSl7XCJOXCI9PT1lLmtpbmQmJihmPWUpO1wiRVwiPT09ZS5raW5kJiZlLmFjY2VwdChhKTtcIkNcIj09PWUua2luZCYmKGI9ITApfSxmdW5jdGlvbigpe3ZhciBlPWY7Zj1uO2UhPT1uJiZlLmFjY2VwdChhKTtpZihiKWEub25Db21wbGV0ZWQoKX0pfSl9O28uc2FtcGxlPWZ1bmN0aW9uKGEsYil7Ynx8KGI9bCk7cmV0dXJuXCJudW1iZXJcIj09PXR5cGVvZiBhP0UodGhpcyxLKGEsYikpOkUodGhpcyxhKX07by50aW1lb3V0PWZ1bmN0aW9uKGEsYixjKXt2YXIgZCxmPXRoaXM7Yj09PW4mJihiPUYoRXJyb3IoXCJUaW1lb3V0XCIpKSk7Y3x8KGM9bCk7ZD1hIGluc3RhbmNlb2YgRGF0ZT9cbmZ1bmN0aW9uKGEsYil7Yy5zY2hlZHVsZVdpdGhBYnNvbHV0ZShhLGIpfTpmdW5jdGlvbihhLGIpe2Muc2NoZWR1bGVXaXRoUmVsYXRpdmUoYSxiKX07cmV0dXJuIG0oZnVuY3Rpb24oYyl7dmFyIGcsaD0wLGk9bmV3IHIsaj1uZXcgdCxrPSExLGw9bmV3IHQ7ai5kaXNwb3NhYmxlKGkpO2c9ZnVuY3Rpb24oKXt2YXIgZj1oO2wuZGlzcG9zYWJsZShkKGEsZnVuY3Rpb24oKXsoaz1oPT09ZikmJmouZGlzcG9zYWJsZShiLnN1YnNjcmliZShjKSl9KSl9O2coKTtpLmRpc3Bvc2FibGUoZi5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7a3x8KGgrKyxjLm9uTmV4dChhKSxnKCkpfSxmdW5jdGlvbihhKXtrfHwoaCsrLGMub25FcnJvcihhKSl9LGZ1bmN0aW9uKCl7a3x8KGgrKyxjLm9uQ29tcGxldGVkKCkpfSkpO3JldHVybiBuZXcgcyhqLGwpfSl9O3EuZ2VuZXJhdGVXaXRoQWJzb2x1dGVUaW1lPWZ1bmN0aW9uKGEsYixjLGQsZixlKXtlfHwoZT1sKTtyZXR1cm4gbShmdW5jdGlvbihnKXt2YXIgaD1cbiEwLGk9ITEsaixrPWEsbDtyZXR1cm4gZS5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhBYnNvbHV0ZShlLm5vdygpLGZ1bmN0aW9uKGEpe2lmKGkpZy5vbk5leHQoaik7dHJ5e2lmKGg/aD0hMTprPWMoayksaT1iKGspKWo9ZChrKSxsPWYoayl9Y2F0Y2goZSl7Zy5vbkVycm9yKGUpO3JldHVybn1pZihpKWEobCk7ZWxzZSBnLm9uQ29tcGxldGVkKCl9KX0pfTtxLmdlbmVyYXRlV2l0aFJlbGF0aXZlVGltZT1mdW5jdGlvbihhLGIsYyxkLGYsZSl7ZXx8KGU9bCk7cmV0dXJuIG0oZnVuY3Rpb24oZyl7dmFyIGg9ITAsaT0hMSxqLGs9YSxsO3JldHVybiBlLnNjaGVkdWxlUmVjdXJzaXZlV2l0aFJlbGF0aXZlKDAsZnVuY3Rpb24oYSl7aWYoaSlnLm9uTmV4dChqKTt0cnl7aWYoaD9oPSExOms9YyhrKSxpPWIoaykpaj1kKGspLGw9ZihrKX1jYXRjaChlKXtnLm9uRXJyb3IoZSk7cmV0dXJufWlmKGkpYShsKTtlbHNlIGcub25Db21wbGV0ZWQoKX0pfSl9fTtcbiJdfQ==
;