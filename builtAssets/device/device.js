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
},{}],7:[function(require,module,exports){
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

},{"../../views/join.hbs":11,"../../../3rdparty/routie":2,"../player":4}],10:[function(require,module,exports){
var routie = require('../../../3rdparty/routie');
var view = require('../../views/thanks.hbs');

module.exports = function() {
  
  $('#page').attr('class', 'thanks');
  $('#page').html(view());
  
  setTimeout(function() {
    routie.navigate('/connect');
  }, 4000);
  
};

},{"../../views/thanks.hbs":12,"../../../3rdparty/routie":2}],4:[function(require,module,exports){
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

},{"underscore":13}],13:[function(require,module,exports){
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
},{}],5:[function(require,module,exports){
var routie = require('../../../3rdparty/routie');
var player = require('../player');
var _ = require('underscore');
var view = require('../../views/register-simple.hbs');

module.exports = function() {
  
  if (player.get().id) {
    return routie.navigate('/wait');
  }
  
  $('#page').attr('class', 'register');
  $('#page').html(view());
  
  $('button').on('click', register);
  
};

function giveFeedback(data){
   _.each(data, function(field, key){
      field[0].parent().removeClass("error");
      if (field[2] === false){
        field[0].parent().addClass("error");
        field[0].parent().get(0).scrollIntoView()
      }
   });
}

function mapData(data){
  return _.inject(data, function(memo, control, key){
    var isInvalid = (control.val() === "" || control.val() === "Select Country" || control.val() === "Select Role" );
    memo[key] = [control, control.val(), !isInvalid];
    return memo;
  }, {});
}

function validate(data){
  return _.every(data, function(field){
    return field[2];
  });
}

function register(e) {
  e.preventDefault();

  var data = {
    firstName:    $('#firstName'),
    lastName:     $('#lastName'),
    company:      $('#company'),
    country:      $('#country'),
    role:         $('#role'),
    email:        $('#email')
  };

  var mappedData = mapData(data);
  var dataIsValid = validate(mappedData);

  if (dataIsValid){
    var formData = _.inject(mappedData, function(m, field, key){ m[key] = field[1]; return m; }, {});
    console.log("FIELDS", formData);
    
    $.ajax({
      type: 'POST',
      url: '/player',
      data: JSON.stringify(formData),
      dataType: 'json',
      contentType: 'application/json; charset=utf-8'
    }).then(go).fail(error);
  
  }
  else {
    giveFeedback(mappedData); 
  }
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

},{"../../views/register-simple.hbs":14,"../../../3rdparty/routie":2,"../player":4,"underscore":13}],6:[function(require,module,exports){
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

  $('.device').height(screen.height - 90);

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
  


  return "\n<h1>match in progress</h1>\n\n<div class='wait-message'>\n	<p>\n	  As soon as the current match is finished,\n	  you'll be able to join the action!\n	</p>\n</div>";
  });

},{"handlebars-runtime":20}],14:[function(require,module,exports){
var Handlebars = require('handlebars-runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "\n<h1>Register To Play</h1>\n\n<form>\n  \n  <div class=\"field\">\n    <label>\n    	First name\n    	<span class=\"required\">*</span>\n    </label>\n    <input id=\"firstName\" type=\"text\" value=\"\" autocorrect=\"off\" />\n  </div>\n  \n  <div class=\"field\">\n    <label>\n   		 Last name\n   	 	<span class=\"required\">*</span>\n    </label>\n    <input id=\"lastName\" type=\"text\" value=\"\" autocorrect=\"off\" />\n  </div>\n\n  <div class=\"field\">\n    <label>\n    	Email\n    	<span class=\"required\">*</span>\n    </label>\n    <input id=\"email\" type=\"email\" value=\"\" autocorrect=\"off\" />\n  </div>\n  \n  <button>Play!</button>\n</form>\n";
  });

},{"handlebars-runtime":20}],11:[function(require,module,exports){
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
  


  return "\n<h1>waiting for 2nd player</h1>\n\n<button id=\"cancel\" ontouchstart=\"\">cancel</button>\n";
  });

},{"handlebars-runtime":20}],19:[function(require,module,exports){
var Handlebars = require('handlebars-runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "<div class=\"player\">\n\n<div class=\"device-background\"></div>\n \n  <div class=\"device clearfix\">\n    <div class=\"controller clearfix\">\n      <div class=\"button\">\n        <div class=\"up\"><i class=\"icon-caret-up\"></i></div>\n      </div>\n      <div class=\"button\">\n        <div class=\"down\"><i class=\"icon-caret-down\"></i></div>\n      </div>\n    </div>\n  </div>\n\n</div>\n\n";
  });

},{"handlebars-runtime":20}],12:[function(require,module,exports){
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
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvdGtsYXNlbmUvcHJvamVjdHMvamV0cGV0cy9icmFuY2hlcy90aG91Z2h0d29ya3MvYXNzZXRzL2RldmljZS9qcy9kZXZpY2UuanMiLCIvVXNlcnMvdGtsYXNlbmUvcHJvamVjdHMvamV0cGV0cy9icmFuY2hlcy90aG91Z2h0d29ya3MvYXNzZXRzLzNyZHBhcnR5L3JvdXRpZS5qcyIsIi9Vc2Vycy90a2xhc2VuZS9wcm9qZWN0cy9qZXRwZXRzL2JyYW5jaGVzL3Rob3VnaHR3b3Jrcy9hc3NldHMvM3JkcGFydHkvdGFwcGFibGUuanMiLCIvVXNlcnMvdGtsYXNlbmUvcHJvamVjdHMvamV0cGV0cy9icmFuY2hlcy90aG91Z2h0d29ya3MvYXNzZXRzL2RldmljZS9qcy9jb250cm9sbGVycy9qb2luLmpzIiwiL1VzZXJzL3RrbGFzZW5lL3Byb2plY3RzL2pldHBldHMvYnJhbmNoZXMvdGhvdWdodHdvcmtzL2Fzc2V0cy9kZXZpY2UvanMvY29udHJvbGxlcnMvdGhhbmtzLmpzIiwiL1VzZXJzL3RrbGFzZW5lL3Byb2plY3RzL2pldHBldHMvYnJhbmNoZXMvdGhvdWdodHdvcmtzL2Fzc2V0cy9kZXZpY2UvanMvcGxheWVyLmpzIiwiL1VzZXJzL3RrbGFzZW5lL3Byb2plY3RzL2pldHBldHMvYnJhbmNoZXMvdGhvdWdodHdvcmtzL25vZGVfbW9kdWxlcy91bmRlcnNjb3JlL3VuZGVyc2NvcmUuanMiLCIvVXNlcnMvdGtsYXNlbmUvcHJvamVjdHMvamV0cGV0cy9icmFuY2hlcy90aG91Z2h0d29ya3MvYXNzZXRzL2RldmljZS9qcy9jb250cm9sbGVycy9yZWdpc3Rlci5qcyIsIi9Vc2Vycy90a2xhc2VuZS9wcm9qZWN0cy9qZXRwZXRzL2JyYW5jaGVzL3Rob3VnaHR3b3Jrcy9hc3NldHMvZGV2aWNlL2pzL2NvbnRyb2xsZXJzL3dhaXQuanMiLCIvVXNlcnMvdGtsYXNlbmUvcHJvamVjdHMvamV0cGV0cy9icmFuY2hlcy90aG91Z2h0d29ya3MvYXNzZXRzL2RldmljZS9qcy9jb250cm9sbGVycy9sb2JieS5qcyIsIi9Vc2Vycy90a2xhc2VuZS9wcm9qZWN0cy9qZXRwZXRzL2JyYW5jaGVzL3Rob3VnaHR3b3Jrcy9hc3NldHMvZGV2aWNlL2pzL2NvbnRyb2xsZXJzL2dhbWVwYWQuanMiLCIvVXNlcnMvdGtsYXNlbmUvcHJvamVjdHMvamV0cGV0cy9icmFuY2hlcy90aG91Z2h0d29ya3MvYXNzZXRzLzNyZHBhcnR5L3J4LnplcHRvLmpzIiwiL1VzZXJzL3RrbGFzZW5lL3Byb2plY3RzL2pldHBldHMvYnJhbmNoZXMvdGhvdWdodHdvcmtzL2Fzc2V0cy9kZXZpY2Uvdmlld3Mvd2FpdC5oYnMiLCIvVXNlcnMvdGtsYXNlbmUvcHJvamVjdHMvamV0cGV0cy9icmFuY2hlcy90aG91Z2h0d29ya3MvYXNzZXRzL2RldmljZS92aWV3cy9yZWdpc3Rlci1zaW1wbGUuaGJzIiwiL1VzZXJzL3RrbGFzZW5lL3Byb2plY3RzL2pldHBldHMvYnJhbmNoZXMvdGhvdWdodHdvcmtzL2Fzc2V0cy9kZXZpY2Uvdmlld3Mvam9pbi5oYnMiLCIvVXNlcnMvdGtsYXNlbmUvcHJvamVjdHMvamV0cGV0cy9icmFuY2hlcy90aG91Z2h0d29ya3MvYXNzZXRzL2RldmljZS92aWV3cy9sb2JieS5oYnMiLCIvVXNlcnMvdGtsYXNlbmUvcHJvamVjdHMvamV0cGV0cy9icmFuY2hlcy90aG91Z2h0d29ya3MvYXNzZXRzL2RldmljZS92aWV3cy9nYW1lcGFkLmhicyIsIi9Vc2Vycy90a2xhc2VuZS9wcm9qZWN0cy9qZXRwZXRzL2JyYW5jaGVzL3Rob3VnaHR3b3Jrcy9hc3NldHMvZGV2aWNlL3ZpZXdzL3RoYW5rcy5oYnMiLCIvVXNlcnMvdGtsYXNlbmUvcHJvamVjdHMvamV0cGV0cy9icmFuY2hlcy90aG91Z2h0d29ya3Mvbm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMtcnVudGltZS9oYW5kbGViYXJzLnJ1bnRpbWUuanMiLCIvVXNlcnMvdGtsYXNlbmUvcHJvamVjdHMvamV0cGV0cy9icmFuY2hlcy90aG91Z2h0d29ya3Mvbm9kZV9tb2R1bGVzL3J4anMvbGliL3J4LmpzIiwiL1VzZXJzL3RrbGFzZW5lL3Byb2plY3RzL2pldHBldHMvYnJhbmNoZXMvdGhvdWdodHdvcmtzL25vZGVfbW9kdWxlcy9yeGpzL2xpYi9yeC5taW4uanMiLCIvVXNlcnMvdGtsYXNlbmUvcHJvamVjdHMvamV0cGV0cy9icmFuY2hlcy90aG91Z2h0d29ya3Mvbm9kZV9tb2R1bGVzL3J4anMvbGliL3J4LmFnZ3JlZ2F0ZXMubWluLmpzIiwiL1VzZXJzL3RrbGFzZW5lL3Byb2plY3RzL2pldHBldHMvYnJhbmNoZXMvdGhvdWdodHdvcmtzL25vZGVfbW9kdWxlcy9yeGpzL2xpYi9yeC5jb2luY2lkZW5jZS5taW4uanMiLCIvVXNlcnMvdGtsYXNlbmUvcHJvamVjdHMvamV0cGV0cy9icmFuY2hlcy90aG91Z2h0d29ya3Mvbm9kZV9tb2R1bGVzL3J4anMvbGliL3J4LmpvaW5wYXR0ZXJucy5taW4uanMiLCIvVXNlcnMvdGtsYXNlbmUvcHJvamVjdHMvamV0cGV0cy9icmFuY2hlcy90aG91Z2h0d29ya3Mvbm9kZV9tb2R1bGVzL3J4anMvbGliL3J4LnRpbWUubWluLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbE5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzV0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsidmFyIHJvdXRpZSA9IHJlcXVpcmUoJy4uLy4uLzNyZHBhcnR5L3JvdXRpZScpO1xudmFyIHRhcHBhYmxlID0gcmVxdWlyZSgnLi4vLi4vM3JkcGFydHkvdGFwcGFibGUnKTtcbnZhciBwbGF5ZXIgPSByZXF1aXJlKCcuL3BsYXllcicpO1xuXG53aW5kb3cuRGV2aWNlID0gZnVuY3Rpb24oKSB7XG4gIFxuICByb3V0aWUoe1xuICAgICAgJyc6ICAgICAgICAgICAgcmVxdWlyZSgnLi9jb250cm9sbGVycy9yZWdpc3RlcicpLFxuICAgICAgJy9yZWdpc3Rlcic6ICAgcmVxdWlyZSgnLi9jb250cm9sbGVycy9yZWdpc3RlcicpLFxuICAgICAgJy93YWl0JzogICAgICAgcmVxdWlyZSgnLi9jb250cm9sbGVycy93YWl0JyksXG4gICAgICAnL2pvaW4nOiAgICAgICByZXF1aXJlKCcuL2NvbnRyb2xsZXJzL2pvaW4nKSxcbiAgICAgICcvbG9iYnknOiAgICAgIHJlcXVpcmUoJy4vY29udHJvbGxlcnMvbG9iYnknKSxcbiAgICAgICcvZ2FtZXBhZCc6ICAgIHJlcXVpcmUoJy4vY29udHJvbGxlcnMvZ2FtZXBhZCcpLFxuICAgICAgJy90aGFua3MnOiAgICAgcmVxdWlyZSgnLi9jb250cm9sbGVycy90aGFua3MnKVxuICB9KTtcbiAgXG4gICQoJyNtZW51Jykub24oJ2NsaWNrJywgZnVuY3Rpb24oKSB7XG4gICAgaWYgKHdpbmRvdy5jb25maXJtKCdkaXNjb25uZWN0IHBsYXllcj8nKSkge1xuICAgICAgcGxheWVyLnJlc2V0KCk7XG4gICAgICByb3V0aWUubmF2aWdhdGUoJy8nKTtcbiAgICB9XG4gIH0pO1xuICBcbn07XG4iLCIoZnVuY3Rpb24gKHJvb3QsIGZhY3RvcnkpIHtcbiAgaWYgKHR5cGVvZiBleHBvcnRzID09PSAnb2JqZWN0Jykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeSh3aW5kb3cpO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgIGRlZmluZShbXSwgZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIChyb290LnJvdXRpZSA9IGZhY3Rvcnkod2luZG93KSk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcm9vdC5yb3V0aWUgPSBmYWN0b3J5KHdpbmRvdyk7XG4gIH1cbn0odGhpcywgZnVuY3Rpb24gKHcpIHtcblxuICB2YXIgcm91dGVzID0gW107XG4gIHZhciBtYXAgPSB7fTtcbiAgdmFyIHJlZmVyZW5jZSA9IFwicm91dGllXCI7XG4gIHZhciBvbGRSZWZlcmVuY2UgPSB3W3JlZmVyZW5jZV07XG5cbiAgdmFyIFJvdXRlID0gZnVuY3Rpb24ocGF0aCwgbmFtZSkge1xuICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgdGhpcy5wYXRoID0gcGF0aDtcbiAgICB0aGlzLmtleXMgPSBbXTtcbiAgICB0aGlzLmZucyA9IFtdO1xuICAgIHRoaXMucGFyYW1zID0ge307XG4gICAgdGhpcy5yZWdleCA9IHBhdGhUb1JlZ2V4cCh0aGlzLnBhdGgsIHRoaXMua2V5cywgZmFsc2UsIGZhbHNlKTtcblxuICB9O1xuXG4gIFJvdXRlLnByb3RvdHlwZS5hZGRIYW5kbGVyID0gZnVuY3Rpb24oZm4pIHtcbiAgICB0aGlzLmZucy5wdXNoKGZuKTtcbiAgfTtcblxuICBSb3V0ZS5wcm90b3R5cGUucmVtb3ZlSGFuZGxlciA9IGZ1bmN0aW9uKGZuKSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGMgPSB0aGlzLmZucy5sZW5ndGg7IGkgPCBjOyBpKyspIHtcbiAgICAgIHZhciBmID0gdGhpcy5mbnNbaV07XG4gICAgICBpZiAoZm4gPT0gZikge1xuICAgICAgICB0aGlzLmZucy5zcGxpY2UoaSwgMSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgUm91dGUucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICAgIGZvciAodmFyIGkgPSAwLCBjID0gdGhpcy5mbnMubGVuZ3RoOyBpIDwgYzsgaSsrKSB7XG4gICAgICB0aGlzLmZuc1tpXS5hcHBseSh0aGlzLCBwYXJhbXMpO1xuICAgIH1cbiAgfTtcblxuICBSb3V0ZS5wcm90b3R5cGUubWF0Y2ggPSBmdW5jdGlvbihwYXRoLCBwYXJhbXMpe1xuICAgIHZhciBtID0gdGhpcy5yZWdleC5leGVjKHBhdGgpO1xuXG4gICAgaWYgKCFtKSByZXR1cm4gZmFsc2U7XG5cblxuICAgIGZvciAodmFyIGkgPSAxLCBsZW4gPSBtLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG4gICAgICB2YXIga2V5ID0gdGhpcy5rZXlzW2kgLSAxXTtcblxuICAgICAgdmFyIHZhbCA9ICgnc3RyaW5nJyA9PSB0eXBlb2YgbVtpXSkgPyBkZWNvZGVVUklDb21wb25lbnQobVtpXSkgOiBtW2ldO1xuXG4gICAgICBpZiAoa2V5KSB7XG4gICAgICAgIHRoaXMucGFyYW1zW2tleS5uYW1lXSA9IHZhbDtcbiAgICAgIH1cbiAgICAgIHBhcmFtcy5wdXNoKHZhbCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG5cbiAgUm91dGUucHJvdG90eXBlLnRvVVJMID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gICAgdmFyIHBhdGggPSB0aGlzLnBhdGg7XG4gICAgZm9yICh2YXIgcGFyYW0gaW4gcGFyYW1zKSB7XG4gICAgICBwYXRoID0gcGF0aC5yZXBsYWNlKCcvOicrcGFyYW0sICcvJytwYXJhbXNbcGFyYW1dKTtcbiAgICB9XG4gICAgcGF0aCA9IHBhdGgucmVwbGFjZSgvXFwvOi4qXFw/L2csICcvJykucmVwbGFjZSgvXFw/L2csICcnKTtcbiAgICBpZiAocGF0aC5pbmRleE9mKCc6JykgIT0gLTEpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbWlzc2luZyBwYXJhbWV0ZXJzIGZvciB1cmw6ICcrcGF0aCk7XG4gICAgfVxuICAgIHJldHVybiBwYXRoO1xuICB9O1xuXG4gIHZhciBwYXRoVG9SZWdleHAgPSBmdW5jdGlvbihwYXRoLCBrZXlzLCBzZW5zaXRpdmUsIHN0cmljdCkge1xuICAgIGlmIChwYXRoIGluc3RhbmNlb2YgUmVnRXhwKSByZXR1cm4gcGF0aDtcbiAgICBpZiAocGF0aCBpbnN0YW5jZW9mIEFycmF5KSBwYXRoID0gJygnICsgcGF0aC5qb2luKCd8JykgKyAnKSc7XG4gICAgcGF0aCA9IHBhdGhcbiAgICAgIC5jb25jYXQoc3RyaWN0ID8gJycgOiAnLz8nKVxuICAgICAgLnJlcGxhY2UoL1xcL1xcKC9nLCAnKD86LycpXG4gICAgICAucmVwbGFjZSgvXFwrL2csICdfX3BsdXNfXycpXG4gICAgICAucmVwbGFjZSgvKFxcLyk/KFxcLik/OihcXHcrKSg/OihcXCguKj9cXCkpKT8oXFw/KT8vZywgZnVuY3Rpb24oXywgc2xhc2gsIGZvcm1hdCwga2V5LCBjYXB0dXJlLCBvcHRpb25hbCl7XG4gICAgICAgIGtleXMucHVzaCh7IG5hbWU6IGtleSwgb3B0aW9uYWw6ICEhIG9wdGlvbmFsIH0pO1xuICAgICAgICBzbGFzaCA9IHNsYXNoIHx8ICcnO1xuICAgICAgICByZXR1cm4gJycgKyAob3B0aW9uYWwgPyAnJyA6IHNsYXNoKSArICcoPzonICsgKG9wdGlvbmFsID8gc2xhc2ggOiAnJykgKyAoZm9ybWF0IHx8ICcnKSArIChjYXB0dXJlIHx8IChmb3JtYXQgJiYgJyhbXi8uXSs/KScgfHwgJyhbXi9dKz8pJykpICsgJyknICsgKG9wdGlvbmFsIHx8ICcnKTtcbiAgICAgIH0pXG4gICAgICAucmVwbGFjZSgvKFtcXC8uXSkvZywgJ1xcXFwkMScpXG4gICAgICAucmVwbGFjZSgvX19wbHVzX18vZywgJyguKyknKVxuICAgICAgLnJlcGxhY2UoL1xcKi9nLCAnKC4qKScpO1xuICAgIHJldHVybiBuZXcgUmVnRXhwKCdeJyArIHBhdGggKyAnJCcsIHNlbnNpdGl2ZSA/ICcnIDogJ2knKTtcbiAgfTtcblxuICB2YXIgYWRkSGFuZGxlciA9IGZ1bmN0aW9uKHBhdGgsIGZuKSB7XG4gICAgdmFyIHMgPSBwYXRoLnNwbGl0KCcgJyk7XG4gICAgdmFyIG5hbWUgPSAocy5sZW5ndGggPT0gMikgPyBzWzBdIDogbnVsbDtcbiAgICBwYXRoID0gKHMubGVuZ3RoID09IDIpID8gc1sxXSA6IHNbMF07XG5cbiAgICBpZiAoIW1hcFtwYXRoXSkge1xuICAgICAgbWFwW3BhdGhdID0gbmV3IFJvdXRlKHBhdGgsIG5hbWUpO1xuICAgICAgcm91dGVzLnB1c2gobWFwW3BhdGhdKTtcbiAgICB9XG4gICAgbWFwW3BhdGhdLmFkZEhhbmRsZXIoZm4pO1xuICB9O1xuXG4gIHZhciByb3V0aWUgPSBmdW5jdGlvbihwYXRoLCBmbikge1xuICAgIGlmICh0eXBlb2YgZm4gPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgYWRkSGFuZGxlcihwYXRoLCBmbik7XG4gICAgICByb3V0aWUucmVsb2FkKCk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcGF0aCA9PSAnb2JqZWN0Jykge1xuICAgICAgZm9yICh2YXIgcCBpbiBwYXRoKSB7XG4gICAgICAgIGFkZEhhbmRsZXIocCwgcGF0aFtwXSk7XG4gICAgICB9XG4gICAgICByb3V0aWUucmVsb2FkKCk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZm4gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByb3V0aWUubmF2aWdhdGUocGF0aCk7XG4gICAgfVxuICB9O1xuXG4gIHJvdXRpZS5sb29rdXAgPSBmdW5jdGlvbihuYW1lLCBvYmopIHtcbiAgICBmb3IgKHZhciBpID0gMCwgYyA9IHJvdXRlcy5sZW5ndGg7IGkgPCBjOyBpKyspIHtcbiAgICAgIHZhciByb3V0ZSA9IHJvdXRlc1tpXTtcbiAgICAgIGlmIChyb3V0ZS5uYW1lID09IG5hbWUpIHtcbiAgICAgICAgcmV0dXJuIHJvdXRlLnRvVVJMKG9iaik7XG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIHJvdXRpZS5yZW1vdmUgPSBmdW5jdGlvbihwYXRoLCBmbikge1xuICAgIHZhciByb3V0ZSA9IG1hcFtwYXRoXTtcbiAgICBpZiAoIXJvdXRlKVxuICAgICAgcmV0dXJuO1xuICAgIHJvdXRlLnJlbW92ZUhhbmRsZXIoZm4pO1xuICB9O1xuXG4gIHJvdXRpZS5yZW1vdmVBbGwgPSBmdW5jdGlvbigpIHtcbiAgICBtYXAgPSB7fTtcbiAgICByb3V0ZXMgPSBbXTtcbiAgfTtcblxuICByb3V0aWUubmF2aWdhdGUgPSBmdW5jdGlvbihwYXRoLCBvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIHNpbGVudCA9IG9wdGlvbnMuc2lsZW50IHx8IGZhbHNlO1xuXG4gICAgaWYgKHNpbGVudCkge1xuICAgICAgcmVtb3ZlTGlzdGVuZXIoKTtcbiAgICB9XG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgIHdpbmRvdy5sb2NhdGlvbi5oYXNoID0gcGF0aDtcblxuICAgICAgaWYgKHNpbGVudCkge1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyBcbiAgICAgICAgICBhZGRMaXN0ZW5lcigpO1xuICAgICAgICB9LCAxKTtcbiAgICAgIH1cblxuICAgIH0sIDEpO1xuICB9O1xuXG4gIHJvdXRpZS5ub0NvbmZsaWN0ID0gZnVuY3Rpb24oKSB7XG4gICAgd1tyZWZlcmVuY2VdID0gb2xkUmVmZXJlbmNlO1xuICAgIHJldHVybiByb3V0aWU7XG4gIH07XG5cbiAgdmFyIGdldEhhc2ggPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gd2luZG93LmxvY2F0aW9uLmhhc2guc3Vic3RyaW5nKDEpO1xuICB9O1xuXG4gIHZhciBjaGVja1JvdXRlID0gZnVuY3Rpb24oaGFzaCwgcm91dGUpIHtcbiAgICB2YXIgcGFyYW1zID0gW107XG4gICAgaWYgKHJvdXRlLm1hdGNoKGhhc2gsIHBhcmFtcykpIHtcbiAgICAgIHJvdXRlLnJ1bihwYXJhbXMpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfTtcblxuICB2YXIgaGFzaENoYW5nZWQgPSByb3V0aWUucmVsb2FkID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGhhc2ggPSBnZXRIYXNoKCk7XG4gICAgZm9yICh2YXIgaSA9IDAsIGMgPSByb3V0ZXMubGVuZ3RoOyBpIDwgYzsgaSsrKSB7XG4gICAgICB2YXIgcm91dGUgPSByb3V0ZXNbaV07XG4gICAgICBpZiAoY2hlY2tSb3V0ZShoYXNoLCByb3V0ZSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICB2YXIgYWRkTGlzdGVuZXIgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAody5hZGRFdmVudExpc3RlbmVyKSB7XG4gICAgICB3LmFkZEV2ZW50TGlzdGVuZXIoJ2hhc2hjaGFuZ2UnLCBoYXNoQ2hhbmdlZCwgZmFsc2UpO1xuICAgIH0gZWxzZSB7XG4gICAgICB3LmF0dGFjaEV2ZW50KCdvbmhhc2hjaGFuZ2UnLCBoYXNoQ2hhbmdlZCk7XG4gICAgfVxuICB9O1xuXG4gIHZhciByZW1vdmVMaXN0ZW5lciA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh3LnJlbW92ZUV2ZW50TGlzdGVuZXIpIHtcbiAgICAgIHcucmVtb3ZlRXZlbnRMaXN0ZW5lcignaGFzaGNoYW5nZScsIGhhc2hDaGFuZ2VkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdy5kZXRhY2hFdmVudCgnb25oYXNoY2hhbmdlJywgaGFzaENoYW5nZWQpO1xuICAgIH1cbiAgfTtcbiAgYWRkTGlzdGVuZXIoKTtcblxuICByZXR1cm4gcm91dGllO1xufSkpO1xuIiwiKGZ1bmN0aW9uKCl7KGZ1bmN0aW9uKHJvb3QsIGZhY3Rvcnkpe1xuICAvLyBTZXQgdXAgVGFwcGFibGUgYXBwcm9wcmlhdGVseSBmb3IgdGhlIGVudmlyb25tZW50LlxuICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKXtcbiAgICAvLyBBTURcbiAgICBkZWZpbmUoJ3RhcHBhYmxlJywgW10sIGZ1bmN0aW9uKCl7XG4gICAgICBmYWN0b3J5KHJvb3QsIHdpbmRvdy5kb2N1bWVudCk7XG4gICAgICByZXR1cm4gcm9vdC50YXBwYWJsZTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICAvLyBCcm93c2VyIGdsb2JhbCBzY29wZVxuICAgIGZhY3Rvcnkocm9vdCwgd2luZG93LmRvY3VtZW50KTtcbiAgfVxufSh0aGlzLCBmdW5jdGlvbih3LCBkKXtcblxuICB2YXIgYWJzID0gTWF0aC5hYnMsXG4gICAgbm9vcCA9IGZ1bmN0aW9uKCl7fSxcbiAgICBkZWZhdWx0cyA9IHtcbiAgICAgIG5vU2Nyb2xsOiBmYWxzZSxcbiAgICAgIGFjdGl2ZUNsYXNzOiAndGFwcGFibGUtYWN0aXZlJyxcbiAgICAgIG9uVGFwOiBub29wLFxuICAgICAgb25TdGFydDogbm9vcCxcbiAgICAgIG9uTW92ZTogbm9vcCxcbiAgICAgIG9uTW92ZU91dDogbm9vcCxcbiAgICAgIG9uTW92ZUluOiBub29wLFxuICAgICAgb25FbmQ6IG5vb3AsXG4gICAgICBvbkNhbmNlbDogbm9vcCxcbiAgICAgIGFsbG93Q2xpY2s6IGZhbHNlLFxuICAgICAgYm91bmRNYXJnaW46IDUwLFxuICAgICAgbm9TY3JvbGxEZWxheTogMCxcbiAgICAgIGFjdGl2ZUNsYXNzRGVsYXk6IDAsXG4gICAgICBpbmFjdGl2ZUNsYXNzRGVsYXk6IDBcbiAgICB9LFxuICAgIHN1cHBvcnRUb3VjaCA9ICdvbnRvdWNoZW5kJyBpbiBkb2N1bWVudCxcbiAgICBldmVudHMgPSB7XG4gICAgICBzdGFydDogc3VwcG9ydFRvdWNoID8gJ3RvdWNoc3RhcnQnIDogJ21vdXNlZG93bicsXG4gICAgICBtb3ZlOiBzdXBwb3J0VG91Y2ggPyAndG91Y2htb3ZlJyA6ICdtb3VzZW1vdmUnLFxuICAgICAgZW5kOiBzdXBwb3J0VG91Y2ggPyAndG91Y2hlbmQnIDogJ21vdXNldXAnXG4gICAgfSxcbiAgICBnZXRUYXJnZXRCeUNvb3JkcyA9IGZ1bmN0aW9uKHgsIHkpe1xuICAgICAgdmFyIGVsID0gZC5lbGVtZW50RnJvbVBvaW50KHgsIHkpO1xuICAgICAgaWYgKGVsLm5vZGVUeXBlID09IDMpIGVsID0gZWwucGFyZW50Tm9kZTtcbiAgICAgIHJldHVybiBlbDtcbiAgICB9LFxuICAgIGdldFRhcmdldCA9IGZ1bmN0aW9uKGUpe1xuICAgICAgdmFyIGVsID0gZS50YXJnZXQ7XG4gICAgICBpZiAoZWwpIHtcbiAgICAgICAgaWYgKGVsLm5vZGVUeXBlID09IDMpIGVsID0gZWwucGFyZW50Tm9kZTtcbiAgICAgICAgcmV0dXJuIGVsO1xuICAgICAgfVxuICAgICAgdmFyIHRvdWNoID0gZS50YXJnZXRUb3VjaGVzWzBdO1xuICAgICAgcmV0dXJuIGdldFRhcmdldEJ5Q29vcmRzKHRvdWNoLmNsaWVudFgsIHRvdWNoLmNsaWVudFkpO1xuICAgIH0sXG4gICAgY2xlYW4gPSBmdW5jdGlvbihzdHIpe1xuICAgICAgcmV0dXJuIHN0ci5yZXBsYWNlKC9cXHMrL2csICcgJykucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpO1xuICAgIH0sXG4gICAgYWRkQ2xhc3MgPSBmdW5jdGlvbihlbCwgY2xhc3NOYW1lKXtcbiAgICAgIGlmICghY2xhc3NOYW1lKSByZXR1cm47XG4gICAgICBpZiAoZWwuY2xhc3NMaXN0KXtcbiAgICAgICAgZWwuY2xhc3NMaXN0LmFkZChjbGFzc05hbWUpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAoY2xlYW4oZWwuY2xhc3NOYW1lKS5pbmRleE9mKGNsYXNzTmFtZSkgPiAtMSkgcmV0dXJuO1xuICAgICAgZWwuY2xhc3NOYW1lID0gY2xlYW4oZWwuY2xhc3NOYW1lICsgJyAnICsgY2xhc3NOYW1lKTtcbiAgICB9LFxuICAgIHJlbW92ZUNsYXNzID0gZnVuY3Rpb24oZWwsIGNsYXNzTmFtZSl7XG4gICAgICBpZiAoIWNsYXNzTmFtZSkgcmV0dXJuO1xuICAgICAgaWYgKGVsLmNsYXNzTGlzdCl7XG4gICAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoY2xhc3NOYW1lKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgZWwuY2xhc3NOYW1lID0gZWwuY2xhc3NOYW1lLnJlcGxhY2UobmV3IFJlZ0V4cCgnKF58XFxcXHMpJyArIGNsYXNzTmFtZSArICcoPzpcXFxcc3wkKScpLCAnJDEnKTtcbiAgICB9LFxuICAgIG1hdGNoZXNTZWxlY3RvciA9IGZ1bmN0aW9uKG5vZGUsIHNlbGVjdG9yKXtcbiAgICAgIHZhciByb290ID0gZC5kb2N1bWVudEVsZW1lbnQsXG4gICAgICAgIG1hdGNoZXMgPSByb290Lm1hdGNoZXNTZWxlY3RvciB8fCByb290Lm1vek1hdGNoZXNTZWxlY3RvciB8fCByb290LndlYmtpdE1hdGNoZXNTZWxlY3RvciB8fCByb290Lm9NYXRjaGVzU2VsZWN0b3IgfHwgcm9vdC5tc01hdGNoZXNTZWxlY3RvcjtcbiAgICAgIHJldHVybiBtYXRjaGVzLmNhbGwobm9kZSwgc2VsZWN0b3IpO1xuICAgIH0sXG4gICAgY2xvc2VzdCA9IGZ1bmN0aW9uKG5vZGUsIHNlbGVjdG9yKXtcbiAgICAgIHZhciBtYXRjaGVzID0gZmFsc2U7XG4gICAgICBkbyB7XG4gICAgICAgIG1hdGNoZXMgPSBtYXRjaGVzU2VsZWN0b3Iobm9kZSwgc2VsZWN0b3IpO1xuICAgICAgfSB3aGlsZSAoIW1hdGNoZXMgJiYgKG5vZGUgPSBub2RlLnBhcmVudE5vZGUpICYmIG5vZGUub3duZXJEb2N1bWVudCk7XG4gICAgICByZXR1cm4gbWF0Y2hlcyA/IG5vZGUgOiBmYWxzZTtcbiAgICB9O1xuXG4gIHcudGFwcGFibGUgPSBmdW5jdGlvbihzZWxlY3Rvciwgb3B0cyl7XG4gICAgaWYgKHR5cGVvZiBvcHRzID09ICdmdW5jdGlvbicpIG9wdHMgPSB7IG9uVGFwOiBvcHRzIH07XG4gICAgdmFyIG9wdGlvbnMgPSB7fTtcbiAgICBmb3IgKHZhciBrZXkgaW4gZGVmYXVsdHMpIG9wdGlvbnNba2V5XSA9IG9wdHNba2V5XSB8fCBkZWZhdWx0c1trZXldO1xuXG4gICAgdmFyIGVsID0gb3B0aW9ucy5jb250YWluZXJFbGVtZW50IHx8IGQuYm9keSxcbiAgICAgIHN0YXJ0VGFyZ2V0LFxuICAgICAgcHJldlRhcmdldCxcbiAgICAgIHN0YXJ0WCxcbiAgICAgIHN0YXJ0WSxcbiAgICAgIGVsQm91bmQsXG4gICAgICBjYW5jZWwgPSBmYWxzZSxcbiAgICAgIG1vdmVPdXQgPSBmYWxzZSxcbiAgICAgIGFjdGl2ZUNsYXNzID0gb3B0aW9ucy5hY3RpdmVDbGFzcyxcbiAgICAgIGFjdGl2ZUNsYXNzRGVsYXkgPSBvcHRpb25zLmFjdGl2ZUNsYXNzRGVsYXksXG4gICAgICBhY3RpdmVDbGFzc1RpbWVvdXQsXG4gICAgICBpbmFjdGl2ZUNsYXNzRGVsYXkgPSBvcHRpb25zLmluYWN0aXZlQ2xhc3NEZWxheSxcbiAgICAgIGluYWN0aXZlQ2xhc3NUaW1lb3V0LFxuICAgICAgbm9TY3JvbGwgPSBvcHRpb25zLm5vU2Nyb2xsLFxuICAgICAgbm9TY3JvbGxEZWxheSA9IG9wdGlvbnMubm9TY3JvbGxEZWxheSxcbiAgICAgIG5vU2Nyb2xsVGltZW91dCxcbiAgICAgIGJvdW5kTWFyZ2luID0gb3B0aW9ucy5ib3VuZE1hcmdpbjtcblxuICAgIHZhciBvblN0YXJ0ID0gZnVuY3Rpb24oZSl7XG4gICAgICB2YXIgdGFyZ2V0ID0gY2xvc2VzdChnZXRUYXJnZXQoZSksIHNlbGVjdG9yKTtcbiAgICAgIGlmICghdGFyZ2V0KSByZXR1cm47XG5cbiAgICAgIGlmIChhY3RpdmVDbGFzc0RlbGF5KXtcbiAgICAgICAgY2xlYXJUaW1lb3V0KGFjdGl2ZUNsYXNzVGltZW91dCk7XG4gICAgICAgIGFjdGl2ZUNsYXNzVGltZW91dCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgICAgICBhZGRDbGFzcyh0YXJnZXQsIGFjdGl2ZUNsYXNzKTtcbiAgICAgICAgfSwgYWN0aXZlQ2xhc3NEZWxheSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhZGRDbGFzcyh0YXJnZXQsIGFjdGl2ZUNsYXNzKTtcbiAgICAgIH1cbiAgICAgIGlmIChpbmFjdGl2ZUNsYXNzRGVsYXkgJiYgdGFyZ2V0ID09IHByZXZUYXJnZXQpIGNsZWFyVGltZW91dChpbmFjdGl2ZUNsYXNzVGltZW91dCk7XG5cbiAgICAgIHN0YXJ0WCA9IGUuY2xpZW50WDtcbiAgICAgIHN0YXJ0WSA9IGUuY2xpZW50WTtcbiAgICAgIGlmICghc3RhcnRYIHx8ICFzdGFydFkpe1xuICAgICAgICB2YXIgdG91Y2ggPSBlLnRhcmdldFRvdWNoZXNbMF07XG4gICAgICAgIHN0YXJ0WCA9IHRvdWNoLmNsaWVudFg7XG4gICAgICAgIHN0YXJ0WSA9IHRvdWNoLmNsaWVudFk7XG4gICAgICB9XG4gICAgICBzdGFydFRhcmdldCA9IHRhcmdldDtcbiAgICAgIGNhbmNlbCA9IGZhbHNlO1xuICAgICAgbW92ZU91dCA9IGZhbHNlO1xuICAgICAgZWxCb3VuZCA9IG5vU2Nyb2xsID8gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpIDogbnVsbDtcblxuICAgICAgaWYgKG5vU2Nyb2xsRGVsYXkpe1xuICAgICAgICBjbGVhclRpbWVvdXQobm9TY3JvbGxUaW1lb3V0KTtcbiAgICAgICAgbm9TY3JvbGwgPSBmYWxzZTsgLy8gc2V0IGZhbHNlIGZpcnN0LCB0aGVuIHRydWUgYWZ0ZXIgYSBkZWxheVxuICAgICAgICBub1Njcm9sbFRpbWVvdXQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICAgICAgbm9TY3JvbGwgPSB0cnVlO1xuICAgICAgICB9LCBub1Njcm9sbERlbGF5KTtcbiAgICAgIH1cbiAgICAgIG9wdGlvbnMub25TdGFydC5jYWxsKGVsLCBlLCB0YXJnZXQpO1xuICAgIH07XG5cbiAgICB2YXIgb25Nb3ZlID0gZnVuY3Rpb24oZSl7XG4gICAgICBpZiAoIXN0YXJ0VGFyZ2V0KSByZXR1cm47XG5cbiAgICAgIGlmIChub1Njcm9sbCl7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNsZWFyVGltZW91dChhY3RpdmVDbGFzc1RpbWVvdXQpO1xuICAgICAgfVxuXG4gICAgICB2YXIgdGFyZ2V0ID0gZS50YXJnZXQsXG4gICAgICAgIHggPSBlLmNsaWVudFgsXG4gICAgICAgIHkgPSBlLmNsaWVudFk7XG4gICAgICBpZiAoIXRhcmdldCB8fCAheCB8fCAheSl7IC8vIFRoZSBldmVudCBtaWdodCBoYXZlIGEgdGFyZ2V0IGJ1dCBubyBjbGllbnRYL1lcbiAgICAgICAgdmFyIHRvdWNoID0gZS5jaGFuZ2VkVG91Y2hlc1swXTtcbiAgICAgICAgaWYgKCF4KSB4ID0gdG91Y2guY2xpZW50WDtcbiAgICAgICAgaWYgKCF5KSB5ID0gdG91Y2guY2xpZW50WTtcbiAgICAgICAgaWYgKCF0YXJnZXQpIHRhcmdldCA9IGdldFRhcmdldEJ5Q29vcmRzKHgsIHkpO1xuICAgICAgfVxuXG4gICAgICBpZiAobm9TY3JvbGwpe1xuICAgICAgICBpZiAoeD5lbEJvdW5kLmxlZnQtYm91bmRNYXJnaW4gJiYgeDxlbEJvdW5kLnJpZ2h0K2JvdW5kTWFyZ2luICYmIHk+ZWxCb3VuZC50b3AtYm91bmRNYXJnaW4gJiYgeTxlbEJvdW5kLmJvdHRvbStib3VuZE1hcmdpbil7IC8vIHdpdGhpbiBlbGVtZW50J3MgYm91bmRhcnlcbiAgICAgICAgICBtb3ZlT3V0ID0gZmFsc2U7XG4gICAgICAgICAgYWRkQ2xhc3Moc3RhcnRUYXJnZXQsIGFjdGl2ZUNsYXNzKTtcbiAgICAgICAgICBvcHRpb25zLm9uTW92ZUluLmNhbGwoZWwsIGUsIHRhcmdldCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbW92ZU91dCA9IHRydWU7XG4gICAgICAgICAgcmVtb3ZlQ2xhc3Moc3RhcnRUYXJnZXQsIGFjdGl2ZUNsYXNzKTtcbiAgICAgICAgICBvcHRpb25zLm9uTW92ZU91dC5jYWxsKGVsLCBlLCB0YXJnZXQpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKCFjYW5jZWwgJiYgYWJzKHkgLSBzdGFydFkpID4gMTApe1xuICAgICAgICBjYW5jZWwgPSB0cnVlO1xuICAgICAgICByZW1vdmVDbGFzcyhzdGFydFRhcmdldCwgYWN0aXZlQ2xhc3MpO1xuICAgICAgICBvcHRpb25zLm9uQ2FuY2VsLmNhbGwodGFyZ2V0LCBlKTtcbiAgICAgIH1cblxuICAgICAgb3B0aW9ucy5vbk1vdmUuY2FsbChlbCwgZSwgdGFyZ2V0KTtcbiAgICB9O1xuXG4gICAgdmFyIG9uRW5kID0gZnVuY3Rpb24oZSl7XG4gICAgICBpZiAoIXN0YXJ0VGFyZ2V0KSByZXR1cm47XG5cbiAgICAgIGNsZWFyVGltZW91dChhY3RpdmVDbGFzc1RpbWVvdXQpO1xuICAgICAgaWYgKGluYWN0aXZlQ2xhc3NEZWxheSl7XG4gICAgICAgIGlmIChhY3RpdmVDbGFzc0RlbGF5ICYmICFjYW5jZWwpIGFkZENsYXNzKHN0YXJ0VGFyZ2V0LCBhY3RpdmVDbGFzcyk7XG4gICAgICAgIHZhciBhY3RpdmVUYXJnZXQgPSBzdGFydFRhcmdldDtcbiAgICAgICAgaW5hY3RpdmVDbGFzc1RpbWVvdXQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICAgICAgcmVtb3ZlQ2xhc3MoYWN0aXZlVGFyZ2V0LCBhY3RpdmVDbGFzcyk7XG4gICAgICAgIH0sIGluYWN0aXZlQ2xhc3NEZWxheSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZW1vdmVDbGFzcyhzdGFydFRhcmdldCwgYWN0aXZlQ2xhc3MpO1xuICAgICAgfVxuXG4gICAgICBvcHRpb25zLm9uRW5kLmNhbGwoZWwsIGUsIHN0YXJ0VGFyZ2V0KTtcblxuICAgICAgdmFyIHJpZ2h0Q2xpY2sgPSBlLndoaWNoID09IDMgfHwgZS5idXR0b24gPT0gMjtcbiAgICAgIGlmICghY2FuY2VsICYmICFtb3ZlT3V0ICYmICFyaWdodENsaWNrKXtcbiAgICAgICAgb3B0aW9ucy5vblRhcC5jYWxsKGVsLCBlLCBzdGFydFRhcmdldCk7XG4gICAgICB9XG5cbiAgICAgIHByZXZUYXJnZXQgPSBzdGFydFRhcmdldDtcbiAgICAgIHN0YXJ0VGFyZ2V0ID0gbnVsbDtcbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgICAgc3RhcnRYID0gc3RhcnRZID0gbnVsbDtcbiAgICAgIH0sIDQwMCk7XG4gICAgfTtcblxuICAgIHZhciBvbkNhbmNlbCA9IGZ1bmN0aW9uKGUpe1xuICAgICAgaWYgKCFzdGFydFRhcmdldCkgcmV0dXJuO1xuICAgICAgcmVtb3ZlQ2xhc3Moc3RhcnRUYXJnZXQsIGFjdGl2ZUNsYXNzKTtcbiAgICAgIHN0YXJ0VGFyZ2V0ID0gc3RhcnRYID0gc3RhcnRZID0gbnVsbDtcbiAgICAgIG9wdGlvbnMub25DYW5jZWwuY2FsbChlbCwgZSk7XG4gICAgfTtcblxuICAgIHZhciBvbkNsaWNrID0gZnVuY3Rpb24oZSl7XG4gICAgICB2YXIgdGFyZ2V0ID0gY2xvc2VzdChlLnRhcmdldCwgc2VsZWN0b3IpO1xuICAgICAgaWYgKHRhcmdldCl7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH0gZWxzZSBpZiAoc3RhcnRYICYmIHN0YXJ0WSAmJiBhYnMoZS5jbGllbnRYIC0gc3RhcnRYKSA8IDI1ICYmIGFicyhlLmNsaWVudFkgLSBzdGFydFkpIDwgMjUpe1xuICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnRzLnN0YXJ0LCBvblN0YXJ0LCBmYWxzZSk7XG5cbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKGV2ZW50cy5tb3ZlLCBvbk1vdmUsIGZhbHNlKTtcblxuICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnRzLmVuZCwgb25FbmQsIGZhbHNlKTtcblxuICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoY2FuY2VsJywgb25DYW5jZWwsIGZhbHNlKTtcblxuICAgIGlmICghb3B0aW9ucy5hbGxvd0NsaWNrKSBlbC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIG9uQ2xpY2ssIGZhbHNlKTtcblxuICAgIHJldHVybiB7XG4gICAgICBlbCA6IGVsLFxuICAgICAgZGVzdHJveSA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudHMuc3RhcnQsIG9uU3RhcnQsIGZhbHNlKTtcbiAgICAgICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudHMubW92ZSwgb25Nb3ZlLCBmYWxzZSk7XG4gICAgICAgIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnRzLmVuZCwgb25FbmQsIGZhbHNlKTtcbiAgICAgICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcigndG91Y2hjYW5jZWwnLCBvbkNhbmNlbCwgZmFsc2UpO1xuICAgICAgICBpZiAoIW9wdGlvbnMuYWxsb3dDbGljaykgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2xpY2snLCBvbkNsaWNrLCBmYWxzZSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9XG4gICAgfTtcblxuICB9O1xuXG59KSk7XG59KSgpIiwidmFyIHJvdXRpZSA9IHJlcXVpcmUoJy4uLy4uLy4uLzNyZHBhcnR5L3JvdXRpZScpO1xudmFyIHBsYXllciA9IHJlcXVpcmUoJy4uL3BsYXllcicpO1xudmFyIHZpZXcgPSByZXF1aXJlKCcuLi8uLi92aWV3cy9qb2luLmhicycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICBcbiAgaWYgKHBsYXllci5nZXQoKS5pZCA9PSB1bmRlZmluZWQpIHtcbiAgICByb3V0aWUubmF2aWdhdGUoJy9jb25uZWN0Jyk7XG4gIH1cbiAgXG4gICQoJyNwYWdlJykuYXR0cignY2xhc3MnLCAnam9pbicpO1xuICAkKCcjcGFnZScpLmh0bWwodmlldygpKTtcbiAgJCgnYnV0dG9uJykub24oJ2NsaWNrJywgam9pbkxvYmJ5KTtcblxufTtcblxuZnVuY3Rpb24gam9pbkxvYmJ5KGUpIHtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICB2YXIgZGF0YSA9IHsgcGxheWVySWQ6IHBsYXllci5nZXQoKS5pZCB9O1xuICAkLnBvc3QoJy9nYW1lL3BsYXllcnMnLCBkYXRhKS50aGVuKGpvaW5lZCkuZmFpbChiYWNrVG9XYWl0KTtcbn1cblxuZnVuY3Rpb24gam9pbmVkKGRhdGEpIHtcbiAgcm91dGllLm5hdmlnYXRlKCcvbG9iYnknKTtcbn1cblxuZnVuY3Rpb24gYmFja1RvV2FpdCgpIHtcbiAgcm91dGllLm5hdmlnYXRlKCcvd2FpdCcpO1xufVxuIiwidmFyIHJvdXRpZSA9IHJlcXVpcmUoJy4uLy4uLy4uLzNyZHBhcnR5L3JvdXRpZScpO1xudmFyIHZpZXcgPSByZXF1aXJlKCcuLi8uLi92aWV3cy90aGFua3MuaGJzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gIFxuICAkKCcjcGFnZScpLmF0dHIoJ2NsYXNzJywgJ3RoYW5rcycpO1xuICAkKCcjcGFnZScpLmh0bWwodmlldygpKTtcbiAgXG4gIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgcm91dGllLm5hdmlnYXRlKCcvY29ubmVjdCcpO1xuICB9LCA0MDAwKTtcbiAgXG59O1xuIiwidmFyIF8gPSByZXF1aXJlKCd1bmRlcnNjb3JlJyk7XG52YXIgcGxheWVyID0gbnVsbDtcblxudmFyIEtFWSA9ICdwbGF5ZXInO1xuXG5leHBvcnRzLmdldCA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIXBsYXllcikge1xuICAgIGxvYWQoKTtcbiAgfVxuICByZXR1cm4gcGxheWVyO1xufTtcblxuZXhwb3J0cy5zZXQgPSBmdW5jdGlvbihhdHRycykge1xuICBwbGF5ZXIgPSBfLmV4dGVuZChwbGF5ZXIgfHwge30sIGF0dHJzKTtcbiAgc2F2ZSgpO1xufTtcblxuZXhwb3J0cy5yZXNldCA9IGZ1bmN0aW9uKCkge1xuICBwbGF5ZXIgPSBudWxsO1xuICB3aW5kb3cubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oS0VZKTtcbn07XG5cbmZ1bmN0aW9uIGxvYWQoKSB7XG4gIHBsYXllciA9IEpTT04ucGFyc2Uod2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKEtFWSkgfHwgJ3t9Jyk7XG59XG5cbmZ1bmN0aW9uIHNhdmUoKSB7XG4gIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbShLRVksIEpTT04uc3RyaW5naWZ5KHBsYXllcikpO1xufVxuIiwiKGZ1bmN0aW9uKCl7Ly8gICAgIFVuZGVyc2NvcmUuanMgMS40LjRcbi8vICAgICBodHRwOi8vdW5kZXJzY29yZWpzLm9yZ1xuLy8gICAgIChjKSAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIEluYy5cbi8vICAgICBVbmRlcnNjb3JlIG1heSBiZSBmcmVlbHkgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxuXG4oZnVuY3Rpb24oKSB7XG5cbiAgLy8gQmFzZWxpbmUgc2V0dXBcbiAgLy8gLS0tLS0tLS0tLS0tLS1cblxuICAvLyBFc3RhYmxpc2ggdGhlIHJvb3Qgb2JqZWN0LCBgd2luZG93YCBpbiB0aGUgYnJvd3Nlciwgb3IgYGdsb2JhbGAgb24gdGhlIHNlcnZlci5cbiAgdmFyIHJvb3QgPSB0aGlzO1xuXG4gIC8vIFNhdmUgdGhlIHByZXZpb3VzIHZhbHVlIG9mIHRoZSBgX2AgdmFyaWFibGUuXG4gIHZhciBwcmV2aW91c1VuZGVyc2NvcmUgPSByb290Ll87XG5cbiAgLy8gRXN0YWJsaXNoIHRoZSBvYmplY3QgdGhhdCBnZXRzIHJldHVybmVkIHRvIGJyZWFrIG91dCBvZiBhIGxvb3AgaXRlcmF0aW9uLlxuICB2YXIgYnJlYWtlciA9IHt9O1xuXG4gIC8vIFNhdmUgYnl0ZXMgaW4gdGhlIG1pbmlmaWVkIChidXQgbm90IGd6aXBwZWQpIHZlcnNpb246XG4gIHZhciBBcnJheVByb3RvID0gQXJyYXkucHJvdG90eXBlLCBPYmpQcm90byA9IE9iamVjdC5wcm90b3R5cGUsIEZ1bmNQcm90byA9IEZ1bmN0aW9uLnByb3RvdHlwZTtcblxuICAvLyBDcmVhdGUgcXVpY2sgcmVmZXJlbmNlIHZhcmlhYmxlcyBmb3Igc3BlZWQgYWNjZXNzIHRvIGNvcmUgcHJvdG90eXBlcy5cbiAgdmFyIHB1c2ggICAgICAgICAgICAgPSBBcnJheVByb3RvLnB1c2gsXG4gICAgICBzbGljZSAgICAgICAgICAgID0gQXJyYXlQcm90by5zbGljZSxcbiAgICAgIGNvbmNhdCAgICAgICAgICAgPSBBcnJheVByb3RvLmNvbmNhdCxcbiAgICAgIHRvU3RyaW5nICAgICAgICAgPSBPYmpQcm90by50b1N0cmluZyxcbiAgICAgIGhhc093blByb3BlcnR5ICAgPSBPYmpQcm90by5oYXNPd25Qcm9wZXJ0eTtcblxuICAvLyBBbGwgKipFQ01BU2NyaXB0IDUqKiBuYXRpdmUgZnVuY3Rpb24gaW1wbGVtZW50YXRpb25zIHRoYXQgd2UgaG9wZSB0byB1c2VcbiAgLy8gYXJlIGRlY2xhcmVkIGhlcmUuXG4gIHZhclxuICAgIG5hdGl2ZUZvckVhY2ggICAgICA9IEFycmF5UHJvdG8uZm9yRWFjaCxcbiAgICBuYXRpdmVNYXAgICAgICAgICAgPSBBcnJheVByb3RvLm1hcCxcbiAgICBuYXRpdmVSZWR1Y2UgICAgICAgPSBBcnJheVByb3RvLnJlZHVjZSxcbiAgICBuYXRpdmVSZWR1Y2VSaWdodCAgPSBBcnJheVByb3RvLnJlZHVjZVJpZ2h0LFxuICAgIG5hdGl2ZUZpbHRlciAgICAgICA9IEFycmF5UHJvdG8uZmlsdGVyLFxuICAgIG5hdGl2ZUV2ZXJ5ICAgICAgICA9IEFycmF5UHJvdG8uZXZlcnksXG4gICAgbmF0aXZlU29tZSAgICAgICAgID0gQXJyYXlQcm90by5zb21lLFxuICAgIG5hdGl2ZUluZGV4T2YgICAgICA9IEFycmF5UHJvdG8uaW5kZXhPZixcbiAgICBuYXRpdmVMYXN0SW5kZXhPZiAgPSBBcnJheVByb3RvLmxhc3RJbmRleE9mLFxuICAgIG5hdGl2ZUlzQXJyYXkgICAgICA9IEFycmF5LmlzQXJyYXksXG4gICAgbmF0aXZlS2V5cyAgICAgICAgID0gT2JqZWN0LmtleXMsXG4gICAgbmF0aXZlQmluZCAgICAgICAgID0gRnVuY1Byb3RvLmJpbmQ7XG5cbiAgLy8gQ3JlYXRlIGEgc2FmZSByZWZlcmVuY2UgdG8gdGhlIFVuZGVyc2NvcmUgb2JqZWN0IGZvciB1c2UgYmVsb3cuXG4gIHZhciBfID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKG9iaiBpbnN0YW5jZW9mIF8pIHJldHVybiBvYmo7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIF8pKSByZXR1cm4gbmV3IF8ob2JqKTtcbiAgICB0aGlzLl93cmFwcGVkID0gb2JqO1xuICB9O1xuXG4gIC8vIEV4cG9ydCB0aGUgVW5kZXJzY29yZSBvYmplY3QgZm9yICoqTm9kZS5qcyoqLCB3aXRoXG4gIC8vIGJhY2t3YXJkcy1jb21wYXRpYmlsaXR5IGZvciB0aGUgb2xkIGByZXF1aXJlKClgIEFQSS4gSWYgd2UncmUgaW5cbiAgLy8gdGhlIGJyb3dzZXIsIGFkZCBgX2AgYXMgYSBnbG9iYWwgb2JqZWN0IHZpYSBhIHN0cmluZyBpZGVudGlmaWVyLFxuICAvLyBmb3IgQ2xvc3VyZSBDb21waWxlciBcImFkdmFuY2VkXCIgbW9kZS5cbiAgaWYgKHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgICAgZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gXztcbiAgICB9XG4gICAgZXhwb3J0cy5fID0gXztcbiAgfSBlbHNlIHtcbiAgICByb290Ll8gPSBfO1xuICB9XG5cbiAgLy8gQ3VycmVudCB2ZXJzaW9uLlxuICBfLlZFUlNJT04gPSAnMS40LjQnO1xuXG4gIC8vIENvbGxlY3Rpb24gRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gVGhlIGNvcm5lcnN0b25lLCBhbiBgZWFjaGAgaW1wbGVtZW50YXRpb24sIGFrYSBgZm9yRWFjaGAuXG4gIC8vIEhhbmRsZXMgb2JqZWN0cyB3aXRoIHRoZSBidWlsdC1pbiBgZm9yRWFjaGAsIGFycmF5cywgYW5kIHJhdyBvYmplY3RzLlxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgZm9yRWFjaGAgaWYgYXZhaWxhYmxlLlxuICB2YXIgZWFjaCA9IF8uZWFjaCA9IF8uZm9yRWFjaCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybjtcbiAgICBpZiAobmF0aXZlRm9yRWFjaCAmJiBvYmouZm9yRWFjaCA9PT0gbmF0aXZlRm9yRWFjaCkge1xuICAgICAgb2JqLmZvckVhY2goaXRlcmF0b3IsIGNvbnRleHQpO1xuICAgIH0gZWxzZSBpZiAob2JqLmxlbmd0aCA9PT0gK29iai5sZW5ndGgpIHtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gb2JqLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICBpZiAoaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpbaV0sIGksIG9iaikgPT09IGJyZWFrZXIpIHJldHVybjtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgICBpZiAoXy5oYXMob2JqLCBrZXkpKSB7XG4gICAgICAgICAgaWYgKGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgb2JqW2tleV0sIGtleSwgb2JqKSA9PT0gYnJlYWtlcikgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgcmVzdWx0cyBvZiBhcHBseWluZyB0aGUgaXRlcmF0b3IgdG8gZWFjaCBlbGVtZW50LlxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgbWFwYCBpZiBhdmFpbGFibGUuXG4gIF8ubWFwID0gXy5jb2xsZWN0ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIHZhciByZXN1bHRzID0gW107XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gcmVzdWx0cztcbiAgICBpZiAobmF0aXZlTWFwICYmIG9iai5tYXAgPT09IG5hdGl2ZU1hcCkgcmV0dXJuIG9iai5tYXAoaXRlcmF0b3IsIGNvbnRleHQpO1xuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGhdID0gaXRlcmF0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpO1xuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9O1xuXG4gIHZhciByZWR1Y2VFcnJvciA9ICdSZWR1Y2Ugb2YgZW1wdHkgYXJyYXkgd2l0aCBubyBpbml0aWFsIHZhbHVlJztcblxuICAvLyAqKlJlZHVjZSoqIGJ1aWxkcyB1cCBhIHNpbmdsZSByZXN1bHQgZnJvbSBhIGxpc3Qgb2YgdmFsdWVzLCBha2EgYGluamVjdGAsXG4gIC8vIG9yIGBmb2xkbGAuIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGByZWR1Y2VgIGlmIGF2YWlsYWJsZS5cbiAgXy5yZWR1Y2UgPSBfLmZvbGRsID0gXy5pbmplY3QgPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBtZW1vLCBjb250ZXh0KSB7XG4gICAgdmFyIGluaXRpYWwgPSBhcmd1bWVudHMubGVuZ3RoID4gMjtcbiAgICBpZiAob2JqID09IG51bGwpIG9iaiA9IFtdO1xuICAgIGlmIChuYXRpdmVSZWR1Y2UgJiYgb2JqLnJlZHVjZSA9PT0gbmF0aXZlUmVkdWNlKSB7XG4gICAgICBpZiAoY29udGV4dCkgaXRlcmF0b3IgPSBfLmJpbmQoaXRlcmF0b3IsIGNvbnRleHQpO1xuICAgICAgcmV0dXJuIGluaXRpYWwgPyBvYmoucmVkdWNlKGl0ZXJhdG9yLCBtZW1vKSA6IG9iai5yZWR1Y2UoaXRlcmF0b3IpO1xuICAgIH1cbiAgICBlYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICBpZiAoIWluaXRpYWwpIHtcbiAgICAgICAgbWVtbyA9IHZhbHVlO1xuICAgICAgICBpbml0aWFsID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1lbW8gPSBpdGVyYXRvci5jYWxsKGNvbnRleHQsIG1lbW8sIHZhbHVlLCBpbmRleCwgbGlzdCk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgaWYgKCFpbml0aWFsKSB0aHJvdyBuZXcgVHlwZUVycm9yKHJlZHVjZUVycm9yKTtcbiAgICByZXR1cm4gbWVtbztcbiAgfTtcblxuICAvLyBUaGUgcmlnaHQtYXNzb2NpYXRpdmUgdmVyc2lvbiBvZiByZWR1Y2UsIGFsc28ga25vd24gYXMgYGZvbGRyYC5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYHJlZHVjZVJpZ2h0YCBpZiBhdmFpbGFibGUuXG4gIF8ucmVkdWNlUmlnaHQgPSBfLmZvbGRyID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgbWVtbywgY29udGV4dCkge1xuICAgIHZhciBpbml0aWFsID0gYXJndW1lbnRzLmxlbmd0aCA+IDI7XG4gICAgaWYgKG9iaiA9PSBudWxsKSBvYmogPSBbXTtcbiAgICBpZiAobmF0aXZlUmVkdWNlUmlnaHQgJiYgb2JqLnJlZHVjZVJpZ2h0ID09PSBuYXRpdmVSZWR1Y2VSaWdodCkge1xuICAgICAgaWYgKGNvbnRleHQpIGl0ZXJhdG9yID0gXy5iaW5kKGl0ZXJhdG9yLCBjb250ZXh0KTtcbiAgICAgIHJldHVybiBpbml0aWFsID8gb2JqLnJlZHVjZVJpZ2h0KGl0ZXJhdG9yLCBtZW1vKSA6IG9iai5yZWR1Y2VSaWdodChpdGVyYXRvcik7XG4gICAgfVxuICAgIHZhciBsZW5ndGggPSBvYmoubGVuZ3RoO1xuICAgIGlmIChsZW5ndGggIT09ICtsZW5ndGgpIHtcbiAgICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaik7XG4gICAgICBsZW5ndGggPSBrZXlzLmxlbmd0aDtcbiAgICB9XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgaW5kZXggPSBrZXlzID8ga2V5c1stLWxlbmd0aF0gOiAtLWxlbmd0aDtcbiAgICAgIGlmICghaW5pdGlhbCkge1xuICAgICAgICBtZW1vID0gb2JqW2luZGV4XTtcbiAgICAgICAgaW5pdGlhbCA9IHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtZW1vID0gaXRlcmF0b3IuY2FsbChjb250ZXh0LCBtZW1vLCBvYmpbaW5kZXhdLCBpbmRleCwgbGlzdCk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgaWYgKCFpbml0aWFsKSB0aHJvdyBuZXcgVHlwZUVycm9yKHJlZHVjZUVycm9yKTtcbiAgICByZXR1cm4gbWVtbztcbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIGZpcnN0IHZhbHVlIHdoaWNoIHBhc3NlcyBhIHRydXRoIHRlc3QuIEFsaWFzZWQgYXMgYGRldGVjdGAuXG4gIF8uZmluZCA9IF8uZGV0ZWN0ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIHZhciByZXN1bHQ7XG4gICAgYW55KG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICBpZiAoaXRlcmF0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpKSB7XG4gICAgICAgIHJlc3VsdCA9IHZhbHVlO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFJldHVybiBhbGwgdGhlIGVsZW1lbnRzIHRoYXQgcGFzcyBhIHRydXRoIHRlc3QuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBmaWx0ZXJgIGlmIGF2YWlsYWJsZS5cbiAgLy8gQWxpYXNlZCBhcyBgc2VsZWN0YC5cbiAgXy5maWx0ZXIgPSBfLnNlbGVjdCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHJlc3VsdHM7XG4gICAgaWYgKG5hdGl2ZUZpbHRlciAmJiBvYmouZmlsdGVyID09PSBuYXRpdmVGaWx0ZXIpIHJldHVybiBvYmouZmlsdGVyKGl0ZXJhdG9yLCBjb250ZXh0KTtcbiAgICBlYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICBpZiAoaXRlcmF0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpKSByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoXSA9IHZhbHVlO1xuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9O1xuXG4gIC8vIFJldHVybiBhbGwgdGhlIGVsZW1lbnRzIGZvciB3aGljaCBhIHRydXRoIHRlc3QgZmFpbHMuXG4gIF8ucmVqZWN0ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIHJldHVybiBfLmZpbHRlcihvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgcmV0dXJuICFpdGVyYXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgbGlzdCk7XG4gICAgfSwgY29udGV4dCk7XG4gIH07XG5cbiAgLy8gRGV0ZXJtaW5lIHdoZXRoZXIgYWxsIG9mIHRoZSBlbGVtZW50cyBtYXRjaCBhIHRydXRoIHRlc3QuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBldmVyeWAgaWYgYXZhaWxhYmxlLlxuICAvLyBBbGlhc2VkIGFzIGBhbGxgLlxuICBfLmV2ZXJ5ID0gXy5hbGwgPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0b3IgfHwgKGl0ZXJhdG9yID0gXy5pZGVudGl0eSk7XG4gICAgdmFyIHJlc3VsdCA9IHRydWU7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChuYXRpdmVFdmVyeSAmJiBvYmouZXZlcnkgPT09IG5hdGl2ZUV2ZXJ5KSByZXR1cm4gb2JqLmV2ZXJ5KGl0ZXJhdG9yLCBjb250ZXh0KTtcbiAgICBlYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICBpZiAoIShyZXN1bHQgPSByZXN1bHQgJiYgaXRlcmF0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpKSkgcmV0dXJuIGJyZWFrZXI7XG4gICAgfSk7XG4gICAgcmV0dXJuICEhcmVzdWx0O1xuICB9O1xuXG4gIC8vIERldGVybWluZSBpZiBhdCBsZWFzdCBvbmUgZWxlbWVudCBpbiB0aGUgb2JqZWN0IG1hdGNoZXMgYSB0cnV0aCB0ZXN0LlxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgc29tZWAgaWYgYXZhaWxhYmxlLlxuICAvLyBBbGlhc2VkIGFzIGBhbnlgLlxuICB2YXIgYW55ID0gXy5zb21lID0gXy5hbnkgPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0b3IgfHwgKGl0ZXJhdG9yID0gXy5pZGVudGl0eSk7XG4gICAgdmFyIHJlc3VsdCA9IGZhbHNlO1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAobmF0aXZlU29tZSAmJiBvYmouc29tZSA9PT0gbmF0aXZlU29tZSkgcmV0dXJuIG9iai5zb21lKGl0ZXJhdG9yLCBjb250ZXh0KTtcbiAgICBlYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICBpZiAocmVzdWx0IHx8IChyZXN1bHQgPSBpdGVyYXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgbGlzdCkpKSByZXR1cm4gYnJlYWtlcjtcbiAgICB9KTtcbiAgICByZXR1cm4gISFyZXN1bHQ7XG4gIH07XG5cbiAgLy8gRGV0ZXJtaW5lIGlmIHRoZSBhcnJheSBvciBvYmplY3QgY29udGFpbnMgYSBnaXZlbiB2YWx1ZSAodXNpbmcgYD09PWApLlxuICAvLyBBbGlhc2VkIGFzIGBpbmNsdWRlYC5cbiAgXy5jb250YWlucyA9IF8uaW5jbHVkZSA9IGZ1bmN0aW9uKG9iaiwgdGFyZ2V0KSB7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gZmFsc2U7XG4gICAgaWYgKG5hdGl2ZUluZGV4T2YgJiYgb2JqLmluZGV4T2YgPT09IG5hdGl2ZUluZGV4T2YpIHJldHVybiBvYmouaW5kZXhPZih0YXJnZXQpICE9IC0xO1xuICAgIHJldHVybiBhbnkob2JqLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgcmV0dXJuIHZhbHVlID09PSB0YXJnZXQ7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gSW52b2tlIGEgbWV0aG9kICh3aXRoIGFyZ3VtZW50cykgb24gZXZlcnkgaXRlbSBpbiBhIGNvbGxlY3Rpb24uXG4gIF8uaW52b2tlID0gZnVuY3Rpb24ob2JqLCBtZXRob2QpIHtcbiAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICB2YXIgaXNGdW5jID0gXy5pc0Z1bmN0aW9uKG1ldGhvZCk7XG4gICAgcmV0dXJuIF8ubWFwKG9iaiwgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIHJldHVybiAoaXNGdW5jID8gbWV0aG9kIDogdmFsdWVbbWV0aG9kXSkuYXBwbHkodmFsdWUsIGFyZ3MpO1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIENvbnZlbmllbmNlIHZlcnNpb24gb2YgYSBjb21tb24gdXNlIGNhc2Ugb2YgYG1hcGA6IGZldGNoaW5nIGEgcHJvcGVydHkuXG4gIF8ucGx1Y2sgPSBmdW5jdGlvbihvYmosIGtleSkge1xuICAgIHJldHVybiBfLm1hcChvYmosIGZ1bmN0aW9uKHZhbHVlKXsgcmV0dXJuIHZhbHVlW2tleV07IH0pO1xuICB9O1xuXG4gIC8vIENvbnZlbmllbmNlIHZlcnNpb24gb2YgYSBjb21tb24gdXNlIGNhc2Ugb2YgYGZpbHRlcmA6IHNlbGVjdGluZyBvbmx5IG9iamVjdHNcbiAgLy8gY29udGFpbmluZyBzcGVjaWZpYyBga2V5OnZhbHVlYCBwYWlycy5cbiAgXy53aGVyZSA9IGZ1bmN0aW9uKG9iaiwgYXR0cnMsIGZpcnN0KSB7XG4gICAgaWYgKF8uaXNFbXB0eShhdHRycykpIHJldHVybiBmaXJzdCA/IG51bGwgOiBbXTtcbiAgICByZXR1cm4gX1tmaXJzdCA/ICdmaW5kJyA6ICdmaWx0ZXInXShvYmosIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICBmb3IgKHZhciBrZXkgaW4gYXR0cnMpIHtcbiAgICAgICAgaWYgKGF0dHJzW2tleV0gIT09IHZhbHVlW2tleV0pIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIENvbnZlbmllbmNlIHZlcnNpb24gb2YgYSBjb21tb24gdXNlIGNhc2Ugb2YgYGZpbmRgOiBnZXR0aW5nIHRoZSBmaXJzdCBvYmplY3RcbiAgLy8gY29udGFpbmluZyBzcGVjaWZpYyBga2V5OnZhbHVlYCBwYWlycy5cbiAgXy5maW5kV2hlcmUgPSBmdW5jdGlvbihvYmosIGF0dHJzKSB7XG4gICAgcmV0dXJuIF8ud2hlcmUob2JqLCBhdHRycywgdHJ1ZSk7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBtYXhpbXVtIGVsZW1lbnQgb3IgKGVsZW1lbnQtYmFzZWQgY29tcHV0YXRpb24pLlxuICAvLyBDYW4ndCBvcHRpbWl6ZSBhcnJheXMgb2YgaW50ZWdlcnMgbG9uZ2VyIHRoYW4gNjUsNTM1IGVsZW1lbnRzLlxuICAvLyBTZWU6IGh0dHBzOi8vYnVncy53ZWJraXQub3JnL3Nob3dfYnVnLmNnaT9pZD04MDc5N1xuICBfLm1heCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBpZiAoIWl0ZXJhdG9yICYmIF8uaXNBcnJheShvYmopICYmIG9ialswXSA9PT0gK29ialswXSAmJiBvYmoubGVuZ3RoIDwgNjU1MzUpIHtcbiAgICAgIHJldHVybiBNYXRoLm1heC5hcHBseShNYXRoLCBvYmopO1xuICAgIH1cbiAgICBpZiAoIWl0ZXJhdG9yICYmIF8uaXNFbXB0eShvYmopKSByZXR1cm4gLUluZmluaXR5O1xuICAgIHZhciByZXN1bHQgPSB7Y29tcHV0ZWQgOiAtSW5maW5pdHksIHZhbHVlOiAtSW5maW5pdHl9O1xuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIHZhciBjb21wdXRlZCA9IGl0ZXJhdG9yID8gaXRlcmF0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpIDogdmFsdWU7XG4gICAgICBjb21wdXRlZCA+PSByZXN1bHQuY29tcHV0ZWQgJiYgKHJlc3VsdCA9IHt2YWx1ZSA6IHZhbHVlLCBjb21wdXRlZCA6IGNvbXB1dGVkfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdC52YWx1ZTtcbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIG1pbmltdW0gZWxlbWVudCAob3IgZWxlbWVudC1iYXNlZCBjb21wdXRhdGlvbikuXG4gIF8ubWluID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGlmICghaXRlcmF0b3IgJiYgXy5pc0FycmF5KG9iaikgJiYgb2JqWzBdID09PSArb2JqWzBdICYmIG9iai5sZW5ndGggPCA2NTUzNSkge1xuICAgICAgcmV0dXJuIE1hdGgubWluLmFwcGx5KE1hdGgsIG9iaik7XG4gICAgfVxuICAgIGlmICghaXRlcmF0b3IgJiYgXy5pc0VtcHR5KG9iaikpIHJldHVybiBJbmZpbml0eTtcbiAgICB2YXIgcmVzdWx0ID0ge2NvbXB1dGVkIDogSW5maW5pdHksIHZhbHVlOiBJbmZpbml0eX07XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgdmFyIGNvbXB1dGVkID0gaXRlcmF0b3IgPyBpdGVyYXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgbGlzdCkgOiB2YWx1ZTtcbiAgICAgIGNvbXB1dGVkIDwgcmVzdWx0LmNvbXB1dGVkICYmIChyZXN1bHQgPSB7dmFsdWUgOiB2YWx1ZSwgY29tcHV0ZWQgOiBjb21wdXRlZH0pO1xuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHQudmFsdWU7XG4gIH07XG5cbiAgLy8gU2h1ZmZsZSBhbiBhcnJheS5cbiAgXy5zaHVmZmxlID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHJhbmQ7XG4gICAgdmFyIGluZGV4ID0gMDtcbiAgICB2YXIgc2h1ZmZsZWQgPSBbXTtcbiAgICBlYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIHJhbmQgPSBfLnJhbmRvbShpbmRleCsrKTtcbiAgICAgIHNodWZmbGVkW2luZGV4IC0gMV0gPSBzaHVmZmxlZFtyYW5kXTtcbiAgICAgIHNodWZmbGVkW3JhbmRdID0gdmFsdWU7XG4gICAgfSk7XG4gICAgcmV0dXJuIHNodWZmbGVkO1xuICB9O1xuXG4gIC8vIEFuIGludGVybmFsIGZ1bmN0aW9uIHRvIGdlbmVyYXRlIGxvb2t1cCBpdGVyYXRvcnMuXG4gIHZhciBsb29rdXBJdGVyYXRvciA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgcmV0dXJuIF8uaXNGdW5jdGlvbih2YWx1ZSkgPyB2YWx1ZSA6IGZ1bmN0aW9uKG9iail7IHJldHVybiBvYmpbdmFsdWVdOyB9O1xuICB9O1xuXG4gIC8vIFNvcnQgdGhlIG9iamVjdCdzIHZhbHVlcyBieSBhIGNyaXRlcmlvbiBwcm9kdWNlZCBieSBhbiBpdGVyYXRvci5cbiAgXy5zb3J0QnkgPSBmdW5jdGlvbihvYmosIHZhbHVlLCBjb250ZXh0KSB7XG4gICAgdmFyIGl0ZXJhdG9yID0gbG9va3VwSXRlcmF0b3IodmFsdWUpO1xuICAgIHJldHVybiBfLnBsdWNrKF8ubWFwKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICB2YWx1ZSA6IHZhbHVlLFxuICAgICAgICBpbmRleCA6IGluZGV4LFxuICAgICAgICBjcml0ZXJpYSA6IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KVxuICAgICAgfTtcbiAgICB9KS5zb3J0KGZ1bmN0aW9uKGxlZnQsIHJpZ2h0KSB7XG4gICAgICB2YXIgYSA9IGxlZnQuY3JpdGVyaWE7XG4gICAgICB2YXIgYiA9IHJpZ2h0LmNyaXRlcmlhO1xuICAgICAgaWYgKGEgIT09IGIpIHtcbiAgICAgICAgaWYgKGEgPiBiIHx8IGEgPT09IHZvaWQgMCkgcmV0dXJuIDE7XG4gICAgICAgIGlmIChhIDwgYiB8fCBiID09PSB2b2lkIDApIHJldHVybiAtMTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBsZWZ0LmluZGV4IDwgcmlnaHQuaW5kZXggPyAtMSA6IDE7XG4gICAgfSksICd2YWx1ZScpO1xuICB9O1xuXG4gIC8vIEFuIGludGVybmFsIGZ1bmN0aW9uIHVzZWQgZm9yIGFnZ3JlZ2F0ZSBcImdyb3VwIGJ5XCIgb3BlcmF0aW9ucy5cbiAgdmFyIGdyb3VwID0gZnVuY3Rpb24ob2JqLCB2YWx1ZSwgY29udGV4dCwgYmVoYXZpb3IpIHtcbiAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgdmFyIGl0ZXJhdG9yID0gbG9va3VwSXRlcmF0b3IodmFsdWUgfHwgXy5pZGVudGl0eSk7XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCkge1xuICAgICAgdmFyIGtleSA9IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBvYmopO1xuICAgICAgYmVoYXZpb3IocmVzdWx0LCBrZXksIHZhbHVlKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIEdyb3VwcyB0aGUgb2JqZWN0J3MgdmFsdWVzIGJ5IGEgY3JpdGVyaW9uLiBQYXNzIGVpdGhlciBhIHN0cmluZyBhdHRyaWJ1dGVcbiAgLy8gdG8gZ3JvdXAgYnksIG9yIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZSBjcml0ZXJpb24uXG4gIF8uZ3JvdXBCeSA9IGZ1bmN0aW9uKG9iaiwgdmFsdWUsIGNvbnRleHQpIHtcbiAgICByZXR1cm4gZ3JvdXAob2JqLCB2YWx1ZSwgY29udGV4dCwgZnVuY3Rpb24ocmVzdWx0LCBrZXksIHZhbHVlKSB7XG4gICAgICAoXy5oYXMocmVzdWx0LCBrZXkpID8gcmVzdWx0W2tleV0gOiAocmVzdWx0W2tleV0gPSBbXSkpLnB1c2godmFsdWUpO1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIENvdW50cyBpbnN0YW5jZXMgb2YgYW4gb2JqZWN0IHRoYXQgZ3JvdXAgYnkgYSBjZXJ0YWluIGNyaXRlcmlvbi4gUGFzc1xuICAvLyBlaXRoZXIgYSBzdHJpbmcgYXR0cmlidXRlIHRvIGNvdW50IGJ5LCBvciBhIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGVcbiAgLy8gY3JpdGVyaW9uLlxuICBfLmNvdW50QnkgPSBmdW5jdGlvbihvYmosIHZhbHVlLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuIGdyb3VwKG9iaiwgdmFsdWUsIGNvbnRleHQsIGZ1bmN0aW9uKHJlc3VsdCwga2V5KSB7XG4gICAgICBpZiAoIV8uaGFzKHJlc3VsdCwga2V5KSkgcmVzdWx0W2tleV0gPSAwO1xuICAgICAgcmVzdWx0W2tleV0rKztcbiAgICB9KTtcbiAgfTtcblxuICAvLyBVc2UgYSBjb21wYXJhdG9yIGZ1bmN0aW9uIHRvIGZpZ3VyZSBvdXQgdGhlIHNtYWxsZXN0IGluZGV4IGF0IHdoaWNoXG4gIC8vIGFuIG9iamVjdCBzaG91bGQgYmUgaW5zZXJ0ZWQgc28gYXMgdG8gbWFpbnRhaW4gb3JkZXIuIFVzZXMgYmluYXJ5IHNlYXJjaC5cbiAgXy5zb3J0ZWRJbmRleCA9IGZ1bmN0aW9uKGFycmF5LCBvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0b3IgPSBpdGVyYXRvciA9PSBudWxsID8gXy5pZGVudGl0eSA6IGxvb2t1cEl0ZXJhdG9yKGl0ZXJhdG9yKTtcbiAgICB2YXIgdmFsdWUgPSBpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9iaik7XG4gICAgdmFyIGxvdyA9IDAsIGhpZ2ggPSBhcnJheS5sZW5ndGg7XG4gICAgd2hpbGUgKGxvdyA8IGhpZ2gpIHtcbiAgICAgIHZhciBtaWQgPSAobG93ICsgaGlnaCkgPj4+IDE7XG4gICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIGFycmF5W21pZF0pIDwgdmFsdWUgPyBsb3cgPSBtaWQgKyAxIDogaGlnaCA9IG1pZDtcbiAgICB9XG4gICAgcmV0dXJuIGxvdztcbiAgfTtcblxuICAvLyBTYWZlbHkgY29udmVydCBhbnl0aGluZyBpdGVyYWJsZSBpbnRvIGEgcmVhbCwgbGl2ZSBhcnJheS5cbiAgXy50b0FycmF5ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFvYmopIHJldHVybiBbXTtcbiAgICBpZiAoXy5pc0FycmF5KG9iaikpIHJldHVybiBzbGljZS5jYWxsKG9iaik7XG4gICAgaWYgKG9iai5sZW5ndGggPT09ICtvYmoubGVuZ3RoKSByZXR1cm4gXy5tYXAob2JqLCBfLmlkZW50aXR5KTtcbiAgICByZXR1cm4gXy52YWx1ZXMob2JqKTtcbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIG51bWJlciBvZiBlbGVtZW50cyBpbiBhbiBvYmplY3QuXG4gIF8uc2l6ZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIDA7XG4gICAgcmV0dXJuIChvYmoubGVuZ3RoID09PSArb2JqLmxlbmd0aCkgPyBvYmoubGVuZ3RoIDogXy5rZXlzKG9iaikubGVuZ3RoO1xuICB9O1xuXG4gIC8vIEFycmF5IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS1cblxuICAvLyBHZXQgdGhlIGZpcnN0IGVsZW1lbnQgb2YgYW4gYXJyYXkuIFBhc3NpbmcgKipuKiogd2lsbCByZXR1cm4gdGhlIGZpcnN0IE5cbiAgLy8gdmFsdWVzIGluIHRoZSBhcnJheS4gQWxpYXNlZCBhcyBgaGVhZGAgYW5kIGB0YWtlYC4gVGhlICoqZ3VhcmQqKiBjaGVja1xuICAvLyBhbGxvd3MgaXQgdG8gd29yayB3aXRoIGBfLm1hcGAuXG4gIF8uZmlyc3QgPSBfLmhlYWQgPSBfLnRha2UgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICBpZiAoYXJyYXkgPT0gbnVsbCkgcmV0dXJuIHZvaWQgMDtcbiAgICByZXR1cm4gKG4gIT0gbnVsbCkgJiYgIWd1YXJkID8gc2xpY2UuY2FsbChhcnJheSwgMCwgbikgOiBhcnJheVswXTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGV2ZXJ5dGhpbmcgYnV0IHRoZSBsYXN0IGVudHJ5IG9mIHRoZSBhcnJheS4gRXNwZWNpYWxseSB1c2VmdWwgb25cbiAgLy8gdGhlIGFyZ3VtZW50cyBvYmplY3QuIFBhc3NpbmcgKipuKiogd2lsbCByZXR1cm4gYWxsIHRoZSB2YWx1ZXMgaW5cbiAgLy8gdGhlIGFycmF5LCBleGNsdWRpbmcgdGhlIGxhc3QgTi4gVGhlICoqZ3VhcmQqKiBjaGVjayBhbGxvd3MgaXQgdG8gd29yayB3aXRoXG4gIC8vIGBfLm1hcGAuXG4gIF8uaW5pdGlhbCA9IGZ1bmN0aW9uKGFycmF5LCBuLCBndWFyZCkge1xuICAgIHJldHVybiBzbGljZS5jYWxsKGFycmF5LCAwLCBhcnJheS5sZW5ndGggLSAoKG4gPT0gbnVsbCkgfHwgZ3VhcmQgPyAxIDogbikpO1xuICB9O1xuXG4gIC8vIEdldCB0aGUgbGFzdCBlbGVtZW50IG9mIGFuIGFycmF5LiBQYXNzaW5nICoqbioqIHdpbGwgcmV0dXJuIHRoZSBsYXN0IE5cbiAgLy8gdmFsdWVzIGluIHRoZSBhcnJheS4gVGhlICoqZ3VhcmQqKiBjaGVjayBhbGxvd3MgaXQgdG8gd29yayB3aXRoIGBfLm1hcGAuXG4gIF8ubGFzdCA9IGZ1bmN0aW9uKGFycmF5LCBuLCBndWFyZCkge1xuICAgIGlmIChhcnJheSA9PSBudWxsKSByZXR1cm4gdm9pZCAwO1xuICAgIGlmICgobiAhPSBudWxsKSAmJiAhZ3VhcmQpIHtcbiAgICAgIHJldHVybiBzbGljZS5jYWxsKGFycmF5LCBNYXRoLm1heChhcnJheS5sZW5ndGggLSBuLCAwKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBhcnJheVthcnJheS5sZW5ndGggLSAxXTtcbiAgICB9XG4gIH07XG5cbiAgLy8gUmV0dXJucyBldmVyeXRoaW5nIGJ1dCB0aGUgZmlyc3QgZW50cnkgb2YgdGhlIGFycmF5LiBBbGlhc2VkIGFzIGB0YWlsYCBhbmQgYGRyb3BgLlxuICAvLyBFc3BlY2lhbGx5IHVzZWZ1bCBvbiB0aGUgYXJndW1lbnRzIG9iamVjdC4gUGFzc2luZyBhbiAqKm4qKiB3aWxsIHJldHVyblxuICAvLyB0aGUgcmVzdCBOIHZhbHVlcyBpbiB0aGUgYXJyYXkuIFRoZSAqKmd1YXJkKipcbiAgLy8gY2hlY2sgYWxsb3dzIGl0IHRvIHdvcmsgd2l0aCBgXy5tYXBgLlxuICBfLnJlc3QgPSBfLnRhaWwgPSBfLmRyb3AgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICByZXR1cm4gc2xpY2UuY2FsbChhcnJheSwgKG4gPT0gbnVsbCkgfHwgZ3VhcmQgPyAxIDogbik7XG4gIH07XG5cbiAgLy8gVHJpbSBvdXQgYWxsIGZhbHN5IHZhbHVlcyBmcm9tIGFuIGFycmF5LlxuICBfLmNvbXBhY3QgPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHJldHVybiBfLmZpbHRlcihhcnJheSwgXy5pZGVudGl0eSk7XG4gIH07XG5cbiAgLy8gSW50ZXJuYWwgaW1wbGVtZW50YXRpb24gb2YgYSByZWN1cnNpdmUgYGZsYXR0ZW5gIGZ1bmN0aW9uLlxuICB2YXIgZmxhdHRlbiA9IGZ1bmN0aW9uKGlucHV0LCBzaGFsbG93LCBvdXRwdXQpIHtcbiAgICBlYWNoKGlucHV0LCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgaWYgKF8uaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgc2hhbGxvdyA/IHB1c2guYXBwbHkob3V0cHV0LCB2YWx1ZSkgOiBmbGF0dGVuKHZhbHVlLCBzaGFsbG93LCBvdXRwdXQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LnB1c2godmFsdWUpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBvdXRwdXQ7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgY29tcGxldGVseSBmbGF0dGVuZWQgdmVyc2lvbiBvZiBhbiBhcnJheS5cbiAgXy5mbGF0dGVuID0gZnVuY3Rpb24oYXJyYXksIHNoYWxsb3cpIHtcbiAgICByZXR1cm4gZmxhdHRlbihhcnJheSwgc2hhbGxvdywgW10pO1xuICB9O1xuXG4gIC8vIFJldHVybiBhIHZlcnNpb24gb2YgdGhlIGFycmF5IHRoYXQgZG9lcyBub3QgY29udGFpbiB0aGUgc3BlY2lmaWVkIHZhbHVlKHMpLlxuICBfLndpdGhvdXQgPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHJldHVybiBfLmRpZmZlcmVuY2UoYXJyYXksIHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XG4gIH07XG5cbiAgLy8gUHJvZHVjZSBhIGR1cGxpY2F0ZS1mcmVlIHZlcnNpb24gb2YgdGhlIGFycmF5LiBJZiB0aGUgYXJyYXkgaGFzIGFscmVhZHlcbiAgLy8gYmVlbiBzb3J0ZWQsIHlvdSBoYXZlIHRoZSBvcHRpb24gb2YgdXNpbmcgYSBmYXN0ZXIgYWxnb3JpdGhtLlxuICAvLyBBbGlhc2VkIGFzIGB1bmlxdWVgLlxuICBfLnVuaXEgPSBfLnVuaXF1ZSA9IGZ1bmN0aW9uKGFycmF5LCBpc1NvcnRlZCwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBpZiAoXy5pc0Z1bmN0aW9uKGlzU29ydGVkKSkge1xuICAgICAgY29udGV4dCA9IGl0ZXJhdG9yO1xuICAgICAgaXRlcmF0b3IgPSBpc1NvcnRlZDtcbiAgICAgIGlzU29ydGVkID0gZmFsc2U7XG4gICAgfVxuICAgIHZhciBpbml0aWFsID0gaXRlcmF0b3IgPyBfLm1hcChhcnJheSwgaXRlcmF0b3IsIGNvbnRleHQpIDogYXJyYXk7XG4gICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICB2YXIgc2VlbiA9IFtdO1xuICAgIGVhY2goaW5pdGlhbCwgZnVuY3Rpb24odmFsdWUsIGluZGV4KSB7XG4gICAgICBpZiAoaXNTb3J0ZWQgPyAoIWluZGV4IHx8IHNlZW5bc2Vlbi5sZW5ndGggLSAxXSAhPT0gdmFsdWUpIDogIV8uY29udGFpbnMoc2VlbiwgdmFsdWUpKSB7XG4gICAgICAgIHNlZW4ucHVzaCh2YWx1ZSk7XG4gICAgICAgIHJlc3VsdHMucHVzaChhcnJheVtpbmRleF0pO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9O1xuXG4gIC8vIFByb2R1Y2UgYW4gYXJyYXkgdGhhdCBjb250YWlucyB0aGUgdW5pb246IGVhY2ggZGlzdGluY3QgZWxlbWVudCBmcm9tIGFsbCBvZlxuICAvLyB0aGUgcGFzc2VkLWluIGFycmF5cy5cbiAgXy51bmlvbiA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBfLnVuaXEoY29uY2F0LmFwcGx5KEFycmF5UHJvdG8sIGFyZ3VtZW50cykpO1xuICB9O1xuXG4gIC8vIFByb2R1Y2UgYW4gYXJyYXkgdGhhdCBjb250YWlucyBldmVyeSBpdGVtIHNoYXJlZCBiZXR3ZWVuIGFsbCB0aGVcbiAgLy8gcGFzc2VkLWluIGFycmF5cy5cbiAgXy5pbnRlcnNlY3Rpb24gPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHZhciByZXN0ID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgIHJldHVybiBfLmZpbHRlcihfLnVuaXEoYXJyYXkpLCBmdW5jdGlvbihpdGVtKSB7XG4gICAgICByZXR1cm4gXy5ldmVyeShyZXN0LCBmdW5jdGlvbihvdGhlcikge1xuICAgICAgICByZXR1cm4gXy5pbmRleE9mKG90aGVyLCBpdGVtKSA+PSAwO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gVGFrZSB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIG9uZSBhcnJheSBhbmQgYSBudW1iZXIgb2Ygb3RoZXIgYXJyYXlzLlxuICAvLyBPbmx5IHRoZSBlbGVtZW50cyBwcmVzZW50IGluIGp1c3QgdGhlIGZpcnN0IGFycmF5IHdpbGwgcmVtYWluLlxuICBfLmRpZmZlcmVuY2UgPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHZhciByZXN0ID0gY29uY2F0LmFwcGx5KEFycmF5UHJvdG8sIHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XG4gICAgcmV0dXJuIF8uZmlsdGVyKGFycmF5LCBmdW5jdGlvbih2YWx1ZSl7IHJldHVybiAhXy5jb250YWlucyhyZXN0LCB2YWx1ZSk7IH0pO1xuICB9O1xuXG4gIC8vIFppcCB0b2dldGhlciBtdWx0aXBsZSBsaXN0cyBpbnRvIGEgc2luZ2xlIGFycmF5IC0tIGVsZW1lbnRzIHRoYXQgc2hhcmVcbiAgLy8gYW4gaW5kZXggZ28gdG9nZXRoZXIuXG4gIF8uemlwID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgdmFyIGxlbmd0aCA9IF8ubWF4KF8ucGx1Y2soYXJncywgJ2xlbmd0aCcpKTtcbiAgICB2YXIgcmVzdWx0cyA9IG5ldyBBcnJheShsZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHJlc3VsdHNbaV0gPSBfLnBsdWNrKGFyZ3MsIFwiXCIgKyBpKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH07XG5cbiAgLy8gQ29udmVydHMgbGlzdHMgaW50byBvYmplY3RzLiBQYXNzIGVpdGhlciBhIHNpbmdsZSBhcnJheSBvZiBgW2tleSwgdmFsdWVdYFxuICAvLyBwYWlycywgb3IgdHdvIHBhcmFsbGVsIGFycmF5cyBvZiB0aGUgc2FtZSBsZW5ndGggLS0gb25lIG9mIGtleXMsIGFuZCBvbmUgb2ZcbiAgLy8gdGhlIGNvcnJlc3BvbmRpbmcgdmFsdWVzLlxuICBfLm9iamVjdCA9IGZ1bmN0aW9uKGxpc3QsIHZhbHVlcykge1xuICAgIGlmIChsaXN0ID09IG51bGwpIHJldHVybiB7fTtcbiAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgZm9yICh2YXIgaSA9IDAsIGwgPSBsaXN0Lmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgaWYgKHZhbHVlcykge1xuICAgICAgICByZXN1bHRbbGlzdFtpXV0gPSB2YWx1ZXNbaV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHRbbGlzdFtpXVswXV0gPSBsaXN0W2ldWzFdO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIElmIHRoZSBicm93c2VyIGRvZXNuJ3Qgc3VwcGx5IHVzIHdpdGggaW5kZXhPZiAoSSdtIGxvb2tpbmcgYXQgeW91LCAqKk1TSUUqKiksXG4gIC8vIHdlIG5lZWQgdGhpcyBmdW5jdGlvbi4gUmV0dXJuIHRoZSBwb3NpdGlvbiBvZiB0aGUgZmlyc3Qgb2NjdXJyZW5jZSBvZiBhblxuICAvLyBpdGVtIGluIGFuIGFycmF5LCBvciAtMSBpZiB0aGUgaXRlbSBpcyBub3QgaW5jbHVkZWQgaW4gdGhlIGFycmF5LlxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgaW5kZXhPZmAgaWYgYXZhaWxhYmxlLlxuICAvLyBJZiB0aGUgYXJyYXkgaXMgbGFyZ2UgYW5kIGFscmVhZHkgaW4gc29ydCBvcmRlciwgcGFzcyBgdHJ1ZWBcbiAgLy8gZm9yICoqaXNTb3J0ZWQqKiB0byB1c2UgYmluYXJ5IHNlYXJjaC5cbiAgXy5pbmRleE9mID0gZnVuY3Rpb24oYXJyYXksIGl0ZW0sIGlzU29ydGVkKSB7XG4gICAgaWYgKGFycmF5ID09IG51bGwpIHJldHVybiAtMTtcbiAgICB2YXIgaSA9IDAsIGwgPSBhcnJheS5sZW5ndGg7XG4gICAgaWYgKGlzU29ydGVkKSB7XG4gICAgICBpZiAodHlwZW9mIGlzU29ydGVkID09ICdudW1iZXInKSB7XG4gICAgICAgIGkgPSAoaXNTb3J0ZWQgPCAwID8gTWF0aC5tYXgoMCwgbCArIGlzU29ydGVkKSA6IGlzU29ydGVkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGkgPSBfLnNvcnRlZEluZGV4KGFycmF5LCBpdGVtKTtcbiAgICAgICAgcmV0dXJuIGFycmF5W2ldID09PSBpdGVtID8gaSA6IC0xO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAobmF0aXZlSW5kZXhPZiAmJiBhcnJheS5pbmRleE9mID09PSBuYXRpdmVJbmRleE9mKSByZXR1cm4gYXJyYXkuaW5kZXhPZihpdGVtLCBpc1NvcnRlZCk7XG4gICAgZm9yICg7IGkgPCBsOyBpKyspIGlmIChhcnJheVtpXSA9PT0gaXRlbSkgcmV0dXJuIGk7XG4gICAgcmV0dXJuIC0xO1xuICB9O1xuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBsYXN0SW5kZXhPZmAgaWYgYXZhaWxhYmxlLlxuICBfLmxhc3RJbmRleE9mID0gZnVuY3Rpb24oYXJyYXksIGl0ZW0sIGZyb20pIHtcbiAgICBpZiAoYXJyYXkgPT0gbnVsbCkgcmV0dXJuIC0xO1xuICAgIHZhciBoYXNJbmRleCA9IGZyb20gIT0gbnVsbDtcbiAgICBpZiAobmF0aXZlTGFzdEluZGV4T2YgJiYgYXJyYXkubGFzdEluZGV4T2YgPT09IG5hdGl2ZUxhc3RJbmRleE9mKSB7XG4gICAgICByZXR1cm4gaGFzSW5kZXggPyBhcnJheS5sYXN0SW5kZXhPZihpdGVtLCBmcm9tKSA6IGFycmF5Lmxhc3RJbmRleE9mKGl0ZW0pO1xuICAgIH1cbiAgICB2YXIgaSA9IChoYXNJbmRleCA/IGZyb20gOiBhcnJheS5sZW5ndGgpO1xuICAgIHdoaWxlIChpLS0pIGlmIChhcnJheVtpXSA9PT0gaXRlbSkgcmV0dXJuIGk7XG4gICAgcmV0dXJuIC0xO1xuICB9O1xuXG4gIC8vIEdlbmVyYXRlIGFuIGludGVnZXIgQXJyYXkgY29udGFpbmluZyBhbiBhcml0aG1ldGljIHByb2dyZXNzaW9uLiBBIHBvcnQgb2ZcbiAgLy8gdGhlIG5hdGl2ZSBQeXRob24gYHJhbmdlKClgIGZ1bmN0aW9uLiBTZWVcbiAgLy8gW3RoZSBQeXRob24gZG9jdW1lbnRhdGlvbl0oaHR0cDovL2RvY3MucHl0aG9uLm9yZy9saWJyYXJ5L2Z1bmN0aW9ucy5odG1sI3JhbmdlKS5cbiAgXy5yYW5nZSA9IGZ1bmN0aW9uKHN0YXJ0LCBzdG9wLCBzdGVwKSB7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPD0gMSkge1xuICAgICAgc3RvcCA9IHN0YXJ0IHx8IDA7XG4gICAgICBzdGFydCA9IDA7XG4gICAgfVxuICAgIHN0ZXAgPSBhcmd1bWVudHNbMl0gfHwgMTtcblxuICAgIHZhciBsZW4gPSBNYXRoLm1heChNYXRoLmNlaWwoKHN0b3AgLSBzdGFydCkgLyBzdGVwKSwgMCk7XG4gICAgdmFyIGlkeCA9IDA7XG4gICAgdmFyIHJhbmdlID0gbmV3IEFycmF5KGxlbik7XG5cbiAgICB3aGlsZShpZHggPCBsZW4pIHtcbiAgICAgIHJhbmdlW2lkeCsrXSA9IHN0YXJ0O1xuICAgICAgc3RhcnQgKz0gc3RlcDtcbiAgICB9XG5cbiAgICByZXR1cm4gcmFuZ2U7XG4gIH07XG5cbiAgLy8gRnVuY3Rpb24gKGFoZW0pIEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBDcmVhdGUgYSBmdW5jdGlvbiBib3VuZCB0byBhIGdpdmVuIG9iamVjdCAoYXNzaWduaW5nIGB0aGlzYCwgYW5kIGFyZ3VtZW50cyxcbiAgLy8gb3B0aW9uYWxseSkuIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBGdW5jdGlvbi5iaW5kYCBpZlxuICAvLyBhdmFpbGFibGUuXG4gIF8uYmluZCA9IGZ1bmN0aW9uKGZ1bmMsIGNvbnRleHQpIHtcbiAgICBpZiAoZnVuYy5iaW5kID09PSBuYXRpdmVCaW5kICYmIG5hdGl2ZUJpbmQpIHJldHVybiBuYXRpdmVCaW5kLmFwcGx5KGZ1bmMsIHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XG4gICAgdmFyIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncy5jb25jYXQoc2xpY2UuY2FsbChhcmd1bWVudHMpKSk7XG4gICAgfTtcbiAgfTtcblxuICAvLyBQYXJ0aWFsbHkgYXBwbHkgYSBmdW5jdGlvbiBieSBjcmVhdGluZyBhIHZlcnNpb24gdGhhdCBoYXMgaGFkIHNvbWUgb2YgaXRzXG4gIC8vIGFyZ3VtZW50cyBwcmUtZmlsbGVkLCB3aXRob3V0IGNoYW5naW5nIGl0cyBkeW5hbWljIGB0aGlzYCBjb250ZXh0LlxuICBfLnBhcnRpYWwgPSBmdW5jdGlvbihmdW5jKSB7XG4gICAgdmFyIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGZ1bmMuYXBwbHkodGhpcywgYXJncy5jb25jYXQoc2xpY2UuY2FsbChhcmd1bWVudHMpKSk7XG4gICAgfTtcbiAgfTtcblxuICAvLyBCaW5kIGFsbCBvZiBhbiBvYmplY3QncyBtZXRob2RzIHRvIHRoYXQgb2JqZWN0LiBVc2VmdWwgZm9yIGVuc3VyaW5nIHRoYXRcbiAgLy8gYWxsIGNhbGxiYWNrcyBkZWZpbmVkIG9uIGFuIG9iamVjdCBiZWxvbmcgdG8gaXQuXG4gIF8uYmluZEFsbCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBmdW5jcyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICBpZiAoZnVuY3MubGVuZ3RoID09PSAwKSBmdW5jcyA9IF8uZnVuY3Rpb25zKG9iaik7XG4gICAgZWFjaChmdW5jcywgZnVuY3Rpb24oZikgeyBvYmpbZl0gPSBfLmJpbmQob2JqW2ZdLCBvYmopOyB9KTtcbiAgICByZXR1cm4gb2JqO1xuICB9O1xuXG4gIC8vIE1lbW9pemUgYW4gZXhwZW5zaXZlIGZ1bmN0aW9uIGJ5IHN0b3JpbmcgaXRzIHJlc3VsdHMuXG4gIF8ubWVtb2l6ZSA9IGZ1bmN0aW9uKGZ1bmMsIGhhc2hlcikge1xuICAgIHZhciBtZW1vID0ge307XG4gICAgaGFzaGVyIHx8IChoYXNoZXIgPSBfLmlkZW50aXR5KTtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIga2V5ID0gaGFzaGVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gXy5oYXMobWVtbywga2V5KSA/IG1lbW9ba2V5XSA6IChtZW1vW2tleV0gPSBmdW5jLmFwcGx5KHRoaXMsIGFyZ3VtZW50cykpO1xuICAgIH07XG4gIH07XG5cbiAgLy8gRGVsYXlzIGEgZnVuY3Rpb24gZm9yIHRoZSBnaXZlbiBudW1iZXIgb2YgbWlsbGlzZWNvbmRzLCBhbmQgdGhlbiBjYWxsc1xuICAvLyBpdCB3aXRoIHRoZSBhcmd1bWVudHMgc3VwcGxpZWQuXG4gIF8uZGVsYXkgPSBmdW5jdGlvbihmdW5jLCB3YWl0KSB7XG4gICAgdmFyIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG4gICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuY3Rpb24oKXsgcmV0dXJuIGZ1bmMuYXBwbHkobnVsbCwgYXJncyk7IH0sIHdhaXQpO1xuICB9O1xuXG4gIC8vIERlZmVycyBhIGZ1bmN0aW9uLCBzY2hlZHVsaW5nIGl0IHRvIHJ1biBhZnRlciB0aGUgY3VycmVudCBjYWxsIHN0YWNrIGhhc1xuICAvLyBjbGVhcmVkLlxuICBfLmRlZmVyID0gZnVuY3Rpb24oZnVuYykge1xuICAgIHJldHVybiBfLmRlbGF5LmFwcGx5KF8sIFtmdW5jLCAxXS5jb25jYXQoc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKSk7XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uLCB0aGF0LCB3aGVuIGludm9rZWQsIHdpbGwgb25seSBiZSB0cmlnZ2VyZWQgYXQgbW9zdCBvbmNlXG4gIC8vIGR1cmluZyBhIGdpdmVuIHdpbmRvdyBvZiB0aW1lLlxuICBfLnRocm90dGxlID0gZnVuY3Rpb24oZnVuYywgd2FpdCkge1xuICAgIHZhciBjb250ZXh0LCBhcmdzLCB0aW1lb3V0LCByZXN1bHQ7XG4gICAgdmFyIHByZXZpb3VzID0gMDtcbiAgICB2YXIgbGF0ZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgIHByZXZpb3VzID0gbmV3IERhdGU7XG4gICAgICB0aW1lb3V0ID0gbnVsbDtcbiAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgfTtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgbm93ID0gbmV3IERhdGU7XG4gICAgICB2YXIgcmVtYWluaW5nID0gd2FpdCAtIChub3cgLSBwcmV2aW91cyk7XG4gICAgICBjb250ZXh0ID0gdGhpcztcbiAgICAgIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICBpZiAocmVtYWluaW5nIDw9IDApIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICB0aW1lb3V0ID0gbnVsbDtcbiAgICAgICAgcHJldmlvdXMgPSBub3c7XG4gICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICB9IGVsc2UgaWYgKCF0aW1lb3V0KSB7XG4gICAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGxhdGVyLCByZW1haW5pbmcpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiwgdGhhdCwgYXMgbG9uZyBhcyBpdCBjb250aW51ZXMgdG8gYmUgaW52b2tlZCwgd2lsbCBub3RcbiAgLy8gYmUgdHJpZ2dlcmVkLiBUaGUgZnVuY3Rpb24gd2lsbCBiZSBjYWxsZWQgYWZ0ZXIgaXQgc3RvcHMgYmVpbmcgY2FsbGVkIGZvclxuICAvLyBOIG1pbGxpc2Vjb25kcy4gSWYgYGltbWVkaWF0ZWAgaXMgcGFzc2VkLCB0cmlnZ2VyIHRoZSBmdW5jdGlvbiBvbiB0aGVcbiAgLy8gbGVhZGluZyBlZGdlLCBpbnN0ZWFkIG9mIHRoZSB0cmFpbGluZy5cbiAgXy5kZWJvdW5jZSA9IGZ1bmN0aW9uKGZ1bmMsIHdhaXQsIGltbWVkaWF0ZSkge1xuICAgIHZhciB0aW1lb3V0LCByZXN1bHQ7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGNvbnRleHQgPSB0aGlzLCBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgdmFyIGxhdGVyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHRpbWVvdXQgPSBudWxsO1xuICAgICAgICBpZiAoIWltbWVkaWF0ZSkgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgIH07XG4gICAgICB2YXIgY2FsbE5vdyA9IGltbWVkaWF0ZSAmJiAhdGltZW91dDtcbiAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGxhdGVyLCB3YWl0KTtcbiAgICAgIGlmIChjYWxsTm93KSByZXN1bHQgPSBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgZXhlY3V0ZWQgYXQgbW9zdCBvbmUgdGltZSwgbm8gbWF0dGVyIGhvd1xuICAvLyBvZnRlbiB5b3UgY2FsbCBpdC4gVXNlZnVsIGZvciBsYXp5IGluaXRpYWxpemF0aW9uLlxuICBfLm9uY2UgPSBmdW5jdGlvbihmdW5jKSB7XG4gICAgdmFyIHJhbiA9IGZhbHNlLCBtZW1vO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIGlmIChyYW4pIHJldHVybiBtZW1vO1xuICAgICAgcmFuID0gdHJ1ZTtcbiAgICAgIG1lbW8gPSBmdW5jLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICBmdW5jID0gbnVsbDtcbiAgICAgIHJldHVybiBtZW1vO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyB0aGUgZmlyc3QgZnVuY3Rpb24gcGFzc2VkIGFzIGFuIGFyZ3VtZW50IHRvIHRoZSBzZWNvbmQsXG4gIC8vIGFsbG93aW5nIHlvdSB0byBhZGp1c3QgYXJndW1lbnRzLCBydW4gY29kZSBiZWZvcmUgYW5kIGFmdGVyLCBhbmRcbiAgLy8gY29uZGl0aW9uYWxseSBleGVjdXRlIHRoZSBvcmlnaW5hbCBmdW5jdGlvbi5cbiAgXy53cmFwID0gZnVuY3Rpb24oZnVuYywgd3JhcHBlcikge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBhcmdzID0gW2Z1bmNdO1xuICAgICAgcHVzaC5hcHBseShhcmdzLCBhcmd1bWVudHMpO1xuICAgICAgcmV0dXJuIHdyYXBwZXIuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCBpcyB0aGUgY29tcG9zaXRpb24gb2YgYSBsaXN0IG9mIGZ1bmN0aW9ucywgZWFjaFxuICAvLyBjb25zdW1pbmcgdGhlIHJldHVybiB2YWx1ZSBvZiB0aGUgZnVuY3Rpb24gdGhhdCBmb2xsb3dzLlxuICBfLmNvbXBvc2UgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgZnVuY3MgPSBhcmd1bWVudHM7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICBmb3IgKHZhciBpID0gZnVuY3MubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgYXJncyA9IFtmdW5jc1tpXS5hcHBseSh0aGlzLCBhcmdzKV07XG4gICAgICB9XG4gICAgICByZXR1cm4gYXJnc1swXTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IHdpbGwgb25seSBiZSBleGVjdXRlZCBhZnRlciBiZWluZyBjYWxsZWQgTiB0aW1lcy5cbiAgXy5hZnRlciA9IGZ1bmN0aW9uKHRpbWVzLCBmdW5jKSB7XG4gICAgaWYgKHRpbWVzIDw9IDApIHJldHVybiBmdW5jKCk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKC0tdGltZXMgPCAxKSB7XG4gICAgICAgIHJldHVybiBmdW5jLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICB9XG4gICAgfTtcbiAgfTtcblxuICAvLyBPYmplY3QgRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBSZXRyaWV2ZSB0aGUgbmFtZXMgb2YgYW4gb2JqZWN0J3MgcHJvcGVydGllcy5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYE9iamVjdC5rZXlzYFxuICBfLmtleXMgPSBuYXRpdmVLZXlzIHx8IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmIChvYmogIT09IE9iamVjdChvYmopKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdJbnZhbGlkIG9iamVjdCcpO1xuICAgIHZhciBrZXlzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikgaWYgKF8uaGFzKG9iaiwga2V5KSkga2V5c1trZXlzLmxlbmd0aF0gPSBrZXk7XG4gICAgcmV0dXJuIGtleXM7XG4gIH07XG5cbiAgLy8gUmV0cmlldmUgdGhlIHZhbHVlcyBvZiBhbiBvYmplY3QncyBwcm9wZXJ0aWVzLlxuICBfLnZhbHVlcyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciB2YWx1ZXMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSBpZiAoXy5oYXMob2JqLCBrZXkpKSB2YWx1ZXMucHVzaChvYmpba2V5XSk7XG4gICAgcmV0dXJuIHZhbHVlcztcbiAgfTtcblxuICAvLyBDb252ZXJ0IGFuIG9iamVjdCBpbnRvIGEgbGlzdCBvZiBgW2tleSwgdmFsdWVdYCBwYWlycy5cbiAgXy5wYWlycyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBwYWlycyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIGlmIChfLmhhcyhvYmosIGtleSkpIHBhaXJzLnB1c2goW2tleSwgb2JqW2tleV1dKTtcbiAgICByZXR1cm4gcGFpcnM7XG4gIH07XG5cbiAgLy8gSW52ZXJ0IHRoZSBrZXlzIGFuZCB2YWx1ZXMgb2YgYW4gb2JqZWN0LiBUaGUgdmFsdWVzIG11c3QgYmUgc2VyaWFsaXphYmxlLlxuICBfLmludmVydCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciByZXN1bHQgPSB7fTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSBpZiAoXy5oYXMob2JqLCBrZXkpKSByZXN1bHRbb2JqW2tleV1dID0ga2V5O1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgc29ydGVkIGxpc3Qgb2YgdGhlIGZ1bmN0aW9uIG5hbWVzIGF2YWlsYWJsZSBvbiB0aGUgb2JqZWN0LlxuICAvLyBBbGlhc2VkIGFzIGBtZXRob2RzYFxuICBfLmZ1bmN0aW9ucyA9IF8ubWV0aG9kcyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBuYW1lcyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgIGlmIChfLmlzRnVuY3Rpb24ob2JqW2tleV0pKSBuYW1lcy5wdXNoKGtleSk7XG4gICAgfVxuICAgIHJldHVybiBuYW1lcy5zb3J0KCk7XG4gIH07XG5cbiAgLy8gRXh0ZW5kIGEgZ2l2ZW4gb2JqZWN0IHdpdGggYWxsIHRoZSBwcm9wZXJ0aWVzIGluIHBhc3NlZC1pbiBvYmplY3QocykuXG4gIF8uZXh0ZW5kID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgZWFjaChzbGljZS5jYWxsKGFyZ3VtZW50cywgMSksIGZ1bmN0aW9uKHNvdXJjZSkge1xuICAgICAgaWYgKHNvdXJjZSkge1xuICAgICAgICBmb3IgKHZhciBwcm9wIGluIHNvdXJjZSkge1xuICAgICAgICAgIG9ialtwcm9wXSA9IHNvdXJjZVtwcm9wXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgY29weSBvZiB0aGUgb2JqZWN0IG9ubHkgY29udGFpbmluZyB0aGUgd2hpdGVsaXN0ZWQgcHJvcGVydGllcy5cbiAgXy5waWNrID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGNvcHkgPSB7fTtcbiAgICB2YXIga2V5cyA9IGNvbmNhdC5hcHBseShBcnJheVByb3RvLCBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICAgIGVhY2goa2V5cywgZnVuY3Rpb24oa2V5KSB7XG4gICAgICBpZiAoa2V5IGluIG9iaikgY29weVtrZXldID0gb2JqW2tleV07XG4gICAgfSk7XG4gICAgcmV0dXJuIGNvcHk7XG4gIH07XG5cbiAgIC8vIFJldHVybiBhIGNvcHkgb2YgdGhlIG9iamVjdCB3aXRob3V0IHRoZSBibGFja2xpc3RlZCBwcm9wZXJ0aWVzLlxuICBfLm9taXQgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgY29weSA9IHt9O1xuICAgIHZhciBrZXlzID0gY29uY2F0LmFwcGx5KEFycmF5UHJvdG8sIHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKCFfLmNvbnRhaW5zKGtleXMsIGtleSkpIGNvcHlba2V5XSA9IG9ialtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gY29weTtcbiAgfTtcblxuICAvLyBGaWxsIGluIGEgZ2l2ZW4gb2JqZWN0IHdpdGggZGVmYXVsdCBwcm9wZXJ0aWVzLlxuICBfLmRlZmF1bHRzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgZWFjaChzbGljZS5jYWxsKGFyZ3VtZW50cywgMSksIGZ1bmN0aW9uKHNvdXJjZSkge1xuICAgICAgaWYgKHNvdXJjZSkge1xuICAgICAgICBmb3IgKHZhciBwcm9wIGluIHNvdXJjZSkge1xuICAgICAgICAgIGlmIChvYmpbcHJvcF0gPT0gbnVsbCkgb2JqW3Byb3BdID0gc291cmNlW3Byb3BdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBDcmVhdGUgYSAoc2hhbGxvdy1jbG9uZWQpIGR1cGxpY2F0ZSBvZiBhbiBvYmplY3QuXG4gIF8uY2xvbmUgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAoIV8uaXNPYmplY3Qob2JqKSkgcmV0dXJuIG9iajtcbiAgICByZXR1cm4gXy5pc0FycmF5KG9iaikgPyBvYmouc2xpY2UoKSA6IF8uZXh0ZW5kKHt9LCBvYmopO1xuICB9O1xuXG4gIC8vIEludm9rZXMgaW50ZXJjZXB0b3Igd2l0aCB0aGUgb2JqLCBhbmQgdGhlbiByZXR1cm5zIG9iai5cbiAgLy8gVGhlIHByaW1hcnkgcHVycG9zZSBvZiB0aGlzIG1ldGhvZCBpcyB0byBcInRhcCBpbnRvXCIgYSBtZXRob2QgY2hhaW4sIGluXG4gIC8vIG9yZGVyIHRvIHBlcmZvcm0gb3BlcmF0aW9ucyBvbiBpbnRlcm1lZGlhdGUgcmVzdWx0cyB3aXRoaW4gdGhlIGNoYWluLlxuICBfLnRhcCA9IGZ1bmN0aW9uKG9iaiwgaW50ZXJjZXB0b3IpIHtcbiAgICBpbnRlcmNlcHRvcihvYmopO1xuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gSW50ZXJuYWwgcmVjdXJzaXZlIGNvbXBhcmlzb24gZnVuY3Rpb24gZm9yIGBpc0VxdWFsYC5cbiAgdmFyIGVxID0gZnVuY3Rpb24oYSwgYiwgYVN0YWNrLCBiU3RhY2spIHtcbiAgICAvLyBJZGVudGljYWwgb2JqZWN0cyBhcmUgZXF1YWwuIGAwID09PSAtMGAsIGJ1dCB0aGV5IGFyZW4ndCBpZGVudGljYWwuXG4gICAgLy8gU2VlIHRoZSBIYXJtb255IGBlZ2FsYCBwcm9wb3NhbDogaHR0cDovL3dpa2kuZWNtYXNjcmlwdC5vcmcvZG9rdS5waHA/aWQ9aGFybW9ueTplZ2FsLlxuICAgIGlmIChhID09PSBiKSByZXR1cm4gYSAhPT0gMCB8fCAxIC8gYSA9PSAxIC8gYjtcbiAgICAvLyBBIHN0cmljdCBjb21wYXJpc29uIGlzIG5lY2Vzc2FyeSBiZWNhdXNlIGBudWxsID09IHVuZGVmaW5lZGAuXG4gICAgaWYgKGEgPT0gbnVsbCB8fCBiID09IG51bGwpIHJldHVybiBhID09PSBiO1xuICAgIC8vIFVud3JhcCBhbnkgd3JhcHBlZCBvYmplY3RzLlxuICAgIGlmIChhIGluc3RhbmNlb2YgXykgYSA9IGEuX3dyYXBwZWQ7XG4gICAgaWYgKGIgaW5zdGFuY2VvZiBfKSBiID0gYi5fd3JhcHBlZDtcbiAgICAvLyBDb21wYXJlIGBbW0NsYXNzXV1gIG5hbWVzLlxuICAgIHZhciBjbGFzc05hbWUgPSB0b1N0cmluZy5jYWxsKGEpO1xuICAgIGlmIChjbGFzc05hbWUgIT0gdG9TdHJpbmcuY2FsbChiKSkgcmV0dXJuIGZhbHNlO1xuICAgIHN3aXRjaCAoY2xhc3NOYW1lKSB7XG4gICAgICAvLyBTdHJpbmdzLCBudW1iZXJzLCBkYXRlcywgYW5kIGJvb2xlYW5zIGFyZSBjb21wYXJlZCBieSB2YWx1ZS5cbiAgICAgIGNhc2UgJ1tvYmplY3QgU3RyaW5nXSc6XG4gICAgICAgIC8vIFByaW1pdGl2ZXMgYW5kIHRoZWlyIGNvcnJlc3BvbmRpbmcgb2JqZWN0IHdyYXBwZXJzIGFyZSBlcXVpdmFsZW50OyB0aHVzLCBgXCI1XCJgIGlzXG4gICAgICAgIC8vIGVxdWl2YWxlbnQgdG8gYG5ldyBTdHJpbmcoXCI1XCIpYC5cbiAgICAgICAgcmV0dXJuIGEgPT0gU3RyaW5nKGIpO1xuICAgICAgY2FzZSAnW29iamVjdCBOdW1iZXJdJzpcbiAgICAgICAgLy8gYE5hTmBzIGFyZSBlcXVpdmFsZW50LCBidXQgbm9uLXJlZmxleGl2ZS4gQW4gYGVnYWxgIGNvbXBhcmlzb24gaXMgcGVyZm9ybWVkIGZvclxuICAgICAgICAvLyBvdGhlciBudW1lcmljIHZhbHVlcy5cbiAgICAgICAgcmV0dXJuIGEgIT0gK2EgPyBiICE9ICtiIDogKGEgPT0gMCA/IDEgLyBhID09IDEgLyBiIDogYSA9PSArYik7XG4gICAgICBjYXNlICdbb2JqZWN0IERhdGVdJzpcbiAgICAgIGNhc2UgJ1tvYmplY3QgQm9vbGVhbl0nOlxuICAgICAgICAvLyBDb2VyY2UgZGF0ZXMgYW5kIGJvb2xlYW5zIHRvIG51bWVyaWMgcHJpbWl0aXZlIHZhbHVlcy4gRGF0ZXMgYXJlIGNvbXBhcmVkIGJ5IHRoZWlyXG4gICAgICAgIC8vIG1pbGxpc2Vjb25kIHJlcHJlc2VudGF0aW9ucy4gTm90ZSB0aGF0IGludmFsaWQgZGF0ZXMgd2l0aCBtaWxsaXNlY29uZCByZXByZXNlbnRhdGlvbnNcbiAgICAgICAgLy8gb2YgYE5hTmAgYXJlIG5vdCBlcXVpdmFsZW50LlxuICAgICAgICByZXR1cm4gK2EgPT0gK2I7XG4gICAgICAvLyBSZWdFeHBzIGFyZSBjb21wYXJlZCBieSB0aGVpciBzb3VyY2UgcGF0dGVybnMgYW5kIGZsYWdzLlxuICAgICAgY2FzZSAnW29iamVjdCBSZWdFeHBdJzpcbiAgICAgICAgcmV0dXJuIGEuc291cmNlID09IGIuc291cmNlICYmXG4gICAgICAgICAgICAgICBhLmdsb2JhbCA9PSBiLmdsb2JhbCAmJlxuICAgICAgICAgICAgICAgYS5tdWx0aWxpbmUgPT0gYi5tdWx0aWxpbmUgJiZcbiAgICAgICAgICAgICAgIGEuaWdub3JlQ2FzZSA9PSBiLmlnbm9yZUNhc2U7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgYSAhPSAnb2JqZWN0JyB8fCB0eXBlb2YgYiAhPSAnb2JqZWN0JykgcmV0dXJuIGZhbHNlO1xuICAgIC8vIEFzc3VtZSBlcXVhbGl0eSBmb3IgY3ljbGljIHN0cnVjdHVyZXMuIFRoZSBhbGdvcml0aG0gZm9yIGRldGVjdGluZyBjeWNsaWNcbiAgICAvLyBzdHJ1Y3R1cmVzIGlzIGFkYXB0ZWQgZnJvbSBFUyA1LjEgc2VjdGlvbiAxNS4xMi4zLCBhYnN0cmFjdCBvcGVyYXRpb24gYEpPYC5cbiAgICB2YXIgbGVuZ3RoID0gYVN0YWNrLmxlbmd0aDtcbiAgICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICAgIC8vIExpbmVhciBzZWFyY2guIFBlcmZvcm1hbmNlIGlzIGludmVyc2VseSBwcm9wb3J0aW9uYWwgdG8gdGhlIG51bWJlciBvZlxuICAgICAgLy8gdW5pcXVlIG5lc3RlZCBzdHJ1Y3R1cmVzLlxuICAgICAgaWYgKGFTdGFja1tsZW5ndGhdID09IGEpIHJldHVybiBiU3RhY2tbbGVuZ3RoXSA9PSBiO1xuICAgIH1cbiAgICAvLyBBZGQgdGhlIGZpcnN0IG9iamVjdCB0byB0aGUgc3RhY2sgb2YgdHJhdmVyc2VkIG9iamVjdHMuXG4gICAgYVN0YWNrLnB1c2goYSk7XG4gICAgYlN0YWNrLnB1c2goYik7XG4gICAgdmFyIHNpemUgPSAwLCByZXN1bHQgPSB0cnVlO1xuICAgIC8vIFJlY3Vyc2l2ZWx5IGNvbXBhcmUgb2JqZWN0cyBhbmQgYXJyYXlzLlxuICAgIGlmIChjbGFzc05hbWUgPT0gJ1tvYmplY3QgQXJyYXldJykge1xuICAgICAgLy8gQ29tcGFyZSBhcnJheSBsZW5ndGhzIHRvIGRldGVybWluZSBpZiBhIGRlZXAgY29tcGFyaXNvbiBpcyBuZWNlc3NhcnkuXG4gICAgICBzaXplID0gYS5sZW5ndGg7XG4gICAgICByZXN1bHQgPSBzaXplID09IGIubGVuZ3RoO1xuICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAvLyBEZWVwIGNvbXBhcmUgdGhlIGNvbnRlbnRzLCBpZ25vcmluZyBub24tbnVtZXJpYyBwcm9wZXJ0aWVzLlxuICAgICAgICB3aGlsZSAoc2l6ZS0tKSB7XG4gICAgICAgICAgaWYgKCEocmVzdWx0ID0gZXEoYVtzaXplXSwgYltzaXplXSwgYVN0YWNrLCBiU3RhY2spKSkgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gT2JqZWN0cyB3aXRoIGRpZmZlcmVudCBjb25zdHJ1Y3RvcnMgYXJlIG5vdCBlcXVpdmFsZW50LCBidXQgYE9iamVjdGBzXG4gICAgICAvLyBmcm9tIGRpZmZlcmVudCBmcmFtZXMgYXJlLlxuICAgICAgdmFyIGFDdG9yID0gYS5jb25zdHJ1Y3RvciwgYkN0b3IgPSBiLmNvbnN0cnVjdG9yO1xuICAgICAgaWYgKGFDdG9yICE9PSBiQ3RvciAmJiAhKF8uaXNGdW5jdGlvbihhQ3RvcikgJiYgKGFDdG9yIGluc3RhbmNlb2YgYUN0b3IpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXy5pc0Z1bmN0aW9uKGJDdG9yKSAmJiAoYkN0b3IgaW5zdGFuY2VvZiBiQ3RvcikpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIC8vIERlZXAgY29tcGFyZSBvYmplY3RzLlxuICAgICAgZm9yICh2YXIga2V5IGluIGEpIHtcbiAgICAgICAgaWYgKF8uaGFzKGEsIGtleSkpIHtcbiAgICAgICAgICAvLyBDb3VudCB0aGUgZXhwZWN0ZWQgbnVtYmVyIG9mIHByb3BlcnRpZXMuXG4gICAgICAgICAgc2l6ZSsrO1xuICAgICAgICAgIC8vIERlZXAgY29tcGFyZSBlYWNoIG1lbWJlci5cbiAgICAgICAgICBpZiAoIShyZXN1bHQgPSBfLmhhcyhiLCBrZXkpICYmIGVxKGFba2V5XSwgYltrZXldLCBhU3RhY2ssIGJTdGFjaykpKSBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gRW5zdXJlIHRoYXQgYm90aCBvYmplY3RzIGNvbnRhaW4gdGhlIHNhbWUgbnVtYmVyIG9mIHByb3BlcnRpZXMuXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIGZvciAoa2V5IGluIGIpIHtcbiAgICAgICAgICBpZiAoXy5oYXMoYiwga2V5KSAmJiAhKHNpemUtLSkpIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHJlc3VsdCA9ICFzaXplO1xuICAgICAgfVxuICAgIH1cbiAgICAvLyBSZW1vdmUgdGhlIGZpcnN0IG9iamVjdCBmcm9tIHRoZSBzdGFjayBvZiB0cmF2ZXJzZWQgb2JqZWN0cy5cbiAgICBhU3RhY2sucG9wKCk7XG4gICAgYlN0YWNrLnBvcCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gUGVyZm9ybSBhIGRlZXAgY29tcGFyaXNvbiB0byBjaGVjayBpZiB0d28gb2JqZWN0cyBhcmUgZXF1YWwuXG4gIF8uaXNFcXVhbCA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICByZXR1cm4gZXEoYSwgYiwgW10sIFtdKTtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIGFycmF5LCBzdHJpbmcsIG9yIG9iamVjdCBlbXB0eT9cbiAgLy8gQW4gXCJlbXB0eVwiIG9iamVjdCBoYXMgbm8gZW51bWVyYWJsZSBvd24tcHJvcGVydGllcy5cbiAgXy5pc0VtcHR5ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gdHJ1ZTtcbiAgICBpZiAoXy5pc0FycmF5KG9iaikgfHwgXy5pc1N0cmluZyhvYmopKSByZXR1cm4gb2JqLmxlbmd0aCA9PT0gMDtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSBpZiAoXy5oYXMob2JqLCBrZXkpKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBhIERPTSBlbGVtZW50P1xuICBfLmlzRWxlbWVudCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiAhIShvYmogJiYgb2JqLm5vZGVUeXBlID09PSAxKTtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGFuIGFycmF5P1xuICAvLyBEZWxlZ2F0ZXMgdG8gRUNNQTUncyBuYXRpdmUgQXJyYXkuaXNBcnJheVxuICBfLmlzQXJyYXkgPSBuYXRpdmVJc0FycmF5IHx8IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiB0b1N0cmluZy5jYWxsKG9iaikgPT0gJ1tvYmplY3QgQXJyYXldJztcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhcmlhYmxlIGFuIG9iamVjdD9cbiAgXy5pc09iamVjdCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT09IE9iamVjdChvYmopO1xuICB9O1xuXG4gIC8vIEFkZCBzb21lIGlzVHlwZSBtZXRob2RzOiBpc0FyZ3VtZW50cywgaXNGdW5jdGlvbiwgaXNTdHJpbmcsIGlzTnVtYmVyLCBpc0RhdGUsIGlzUmVnRXhwLlxuICBlYWNoKFsnQXJndW1lbnRzJywgJ0Z1bmN0aW9uJywgJ1N0cmluZycsICdOdW1iZXInLCAnRGF0ZScsICdSZWdFeHAnXSwgZnVuY3Rpb24obmFtZSkge1xuICAgIF9bJ2lzJyArIG5hbWVdID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gdG9TdHJpbmcuY2FsbChvYmopID09ICdbb2JqZWN0ICcgKyBuYW1lICsgJ10nO1xuICAgIH07XG4gIH0pO1xuXG4gIC8vIERlZmluZSBhIGZhbGxiYWNrIHZlcnNpb24gb2YgdGhlIG1ldGhvZCBpbiBicm93c2VycyAoYWhlbSwgSUUpLCB3aGVyZVxuICAvLyB0aGVyZSBpc24ndCBhbnkgaW5zcGVjdGFibGUgXCJBcmd1bWVudHNcIiB0eXBlLlxuICBpZiAoIV8uaXNBcmd1bWVudHMoYXJndW1lbnRzKSkge1xuICAgIF8uaXNBcmd1bWVudHMgPSBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiAhIShvYmogJiYgXy5oYXMob2JqLCAnY2FsbGVlJykpO1xuICAgIH07XG4gIH1cblxuICAvLyBPcHRpbWl6ZSBgaXNGdW5jdGlvbmAgaWYgYXBwcm9wcmlhdGUuXG4gIGlmICh0eXBlb2YgKC8uLykgIT09ICdmdW5jdGlvbicpIHtcbiAgICBfLmlzRnVuY3Rpb24gPSBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiB0eXBlb2Ygb2JqID09PSAnZnVuY3Rpb24nO1xuICAgIH07XG4gIH1cblxuICAvLyBJcyBhIGdpdmVuIG9iamVjdCBhIGZpbml0ZSBudW1iZXI/XG4gIF8uaXNGaW5pdGUgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gaXNGaW5pdGUob2JqKSAmJiAhaXNOYU4ocGFyc2VGbG9hdChvYmopKTtcbiAgfTtcblxuICAvLyBJcyB0aGUgZ2l2ZW4gdmFsdWUgYE5hTmA/IChOYU4gaXMgdGhlIG9ubHkgbnVtYmVyIHdoaWNoIGRvZXMgbm90IGVxdWFsIGl0c2VsZikuXG4gIF8uaXNOYU4gPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gXy5pc051bWJlcihvYmopICYmIG9iaiAhPSArb2JqO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgYSBib29sZWFuP1xuICBfLmlzQm9vbGVhbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT09IHRydWUgfHwgb2JqID09PSBmYWxzZSB8fCB0b1N0cmluZy5jYWxsKG9iaikgPT0gJ1tvYmplY3QgQm9vbGVhbl0nO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgZXF1YWwgdG8gbnVsbD9cbiAgXy5pc051bGwgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSBudWxsO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFyaWFibGUgdW5kZWZpbmVkP1xuICBfLmlzVW5kZWZpbmVkID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PT0gdm9pZCAwO1xuICB9O1xuXG4gIC8vIFNob3J0Y3V0IGZ1bmN0aW9uIGZvciBjaGVja2luZyBpZiBhbiBvYmplY3QgaGFzIGEgZ2l2ZW4gcHJvcGVydHkgZGlyZWN0bHlcbiAgLy8gb24gaXRzZWxmIChpbiBvdGhlciB3b3Jkcywgbm90IG9uIGEgcHJvdG90eXBlKS5cbiAgXy5oYXMgPSBmdW5jdGlvbihvYmosIGtleSkge1xuICAgIHJldHVybiBoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KTtcbiAgfTtcblxuICAvLyBVdGlsaXR5IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIFJ1biBVbmRlcnNjb3JlLmpzIGluICpub0NvbmZsaWN0KiBtb2RlLCByZXR1cm5pbmcgdGhlIGBfYCB2YXJpYWJsZSB0byBpdHNcbiAgLy8gcHJldmlvdXMgb3duZXIuIFJldHVybnMgYSByZWZlcmVuY2UgdG8gdGhlIFVuZGVyc2NvcmUgb2JqZWN0LlxuICBfLm5vQ29uZmxpY3QgPSBmdW5jdGlvbigpIHtcbiAgICByb290Ll8gPSBwcmV2aW91c1VuZGVyc2NvcmU7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgLy8gS2VlcCB0aGUgaWRlbnRpdHkgZnVuY3Rpb24gYXJvdW5kIGZvciBkZWZhdWx0IGl0ZXJhdG9ycy5cbiAgXy5pZGVudGl0eSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9O1xuXG4gIC8vIFJ1biBhIGZ1bmN0aW9uICoqbioqIHRpbWVzLlxuICBfLnRpbWVzID0gZnVuY3Rpb24obiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICB2YXIgYWNjdW0gPSBBcnJheShuKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG47IGkrKykgYWNjdW1baV0gPSBpdGVyYXRvci5jYWxsKGNvbnRleHQsIGkpO1xuICAgIHJldHVybiBhY2N1bTtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSByYW5kb20gaW50ZWdlciBiZXR3ZWVuIG1pbiBhbmQgbWF4IChpbmNsdXNpdmUpLlxuICBfLnJhbmRvbSA9IGZ1bmN0aW9uKG1pbiwgbWF4KSB7XG4gICAgaWYgKG1heCA9PSBudWxsKSB7XG4gICAgICBtYXggPSBtaW47XG4gICAgICBtaW4gPSAwO1xuICAgIH1cbiAgICByZXR1cm4gbWluICsgTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKG1heCAtIG1pbiArIDEpKTtcbiAgfTtcblxuICAvLyBMaXN0IG9mIEhUTUwgZW50aXRpZXMgZm9yIGVzY2FwaW5nLlxuICB2YXIgZW50aXR5TWFwID0ge1xuICAgIGVzY2FwZToge1xuICAgICAgJyYnOiAnJmFtcDsnLFxuICAgICAgJzwnOiAnJmx0OycsXG4gICAgICAnPic6ICcmZ3Q7JyxcbiAgICAgICdcIic6ICcmcXVvdDsnLFxuICAgICAgXCInXCI6ICcmI3gyNzsnLFxuICAgICAgJy8nOiAnJiN4MkY7J1xuICAgIH1cbiAgfTtcbiAgZW50aXR5TWFwLnVuZXNjYXBlID0gXy5pbnZlcnQoZW50aXR5TWFwLmVzY2FwZSk7XG5cbiAgLy8gUmVnZXhlcyBjb250YWluaW5nIHRoZSBrZXlzIGFuZCB2YWx1ZXMgbGlzdGVkIGltbWVkaWF0ZWx5IGFib3ZlLlxuICB2YXIgZW50aXR5UmVnZXhlcyA9IHtcbiAgICBlc2NhcGU6ICAgbmV3IFJlZ0V4cCgnWycgKyBfLmtleXMoZW50aXR5TWFwLmVzY2FwZSkuam9pbignJykgKyAnXScsICdnJyksXG4gICAgdW5lc2NhcGU6IG5ldyBSZWdFeHAoJygnICsgXy5rZXlzKGVudGl0eU1hcC51bmVzY2FwZSkuam9pbignfCcpICsgJyknLCAnZycpXG4gIH07XG5cbiAgLy8gRnVuY3Rpb25zIGZvciBlc2NhcGluZyBhbmQgdW5lc2NhcGluZyBzdHJpbmdzIHRvL2Zyb20gSFRNTCBpbnRlcnBvbGF0aW9uLlxuICBfLmVhY2goWydlc2NhcGUnLCAndW5lc2NhcGUnXSwgZnVuY3Rpb24obWV0aG9kKSB7XG4gICAgX1ttZXRob2RdID0gZnVuY3Rpb24oc3RyaW5nKSB7XG4gICAgICBpZiAoc3RyaW5nID09IG51bGwpIHJldHVybiAnJztcbiAgICAgIHJldHVybiAoJycgKyBzdHJpbmcpLnJlcGxhY2UoZW50aXR5UmVnZXhlc1ttZXRob2RdLCBmdW5jdGlvbihtYXRjaCkge1xuICAgICAgICByZXR1cm4gZW50aXR5TWFwW21ldGhvZF1bbWF0Y2hdO1xuICAgICAgfSk7XG4gICAgfTtcbiAgfSk7XG5cbiAgLy8gSWYgdGhlIHZhbHVlIG9mIHRoZSBuYW1lZCBwcm9wZXJ0eSBpcyBhIGZ1bmN0aW9uIHRoZW4gaW52b2tlIGl0O1xuICAvLyBvdGhlcndpc2UsIHJldHVybiBpdC5cbiAgXy5yZXN1bHQgPSBmdW5jdGlvbihvYmplY3QsIHByb3BlcnR5KSB7XG4gICAgaWYgKG9iamVjdCA9PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgICB2YXIgdmFsdWUgPSBvYmplY3RbcHJvcGVydHldO1xuICAgIHJldHVybiBfLmlzRnVuY3Rpb24odmFsdWUpID8gdmFsdWUuY2FsbChvYmplY3QpIDogdmFsdWU7XG4gIH07XG5cbiAgLy8gQWRkIHlvdXIgb3duIGN1c3RvbSBmdW5jdGlvbnMgdG8gdGhlIFVuZGVyc2NvcmUgb2JqZWN0LlxuICBfLm1peGluID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgZWFjaChfLmZ1bmN0aW9ucyhvYmopLCBmdW5jdGlvbihuYW1lKXtcbiAgICAgIHZhciBmdW5jID0gX1tuYW1lXSA9IG9ialtuYW1lXTtcbiAgICAgIF8ucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBhcmdzID0gW3RoaXMuX3dyYXBwZWRdO1xuICAgICAgICBwdXNoLmFwcGx5KGFyZ3MsIGFyZ3VtZW50cyk7XG4gICAgICAgIHJldHVybiByZXN1bHQuY2FsbCh0aGlzLCBmdW5jLmFwcGx5KF8sIGFyZ3MpKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gR2VuZXJhdGUgYSB1bmlxdWUgaW50ZWdlciBpZCAodW5pcXVlIHdpdGhpbiB0aGUgZW50aXJlIGNsaWVudCBzZXNzaW9uKS5cbiAgLy8gVXNlZnVsIGZvciB0ZW1wb3JhcnkgRE9NIGlkcy5cbiAgdmFyIGlkQ291bnRlciA9IDA7XG4gIF8udW5pcXVlSWQgPSBmdW5jdGlvbihwcmVmaXgpIHtcbiAgICB2YXIgaWQgPSArK2lkQ291bnRlciArICcnO1xuICAgIHJldHVybiBwcmVmaXggPyBwcmVmaXggKyBpZCA6IGlkO1xuICB9O1xuXG4gIC8vIEJ5IGRlZmF1bHQsIFVuZGVyc2NvcmUgdXNlcyBFUkItc3R5bGUgdGVtcGxhdGUgZGVsaW1pdGVycywgY2hhbmdlIHRoZVxuICAvLyBmb2xsb3dpbmcgdGVtcGxhdGUgc2V0dGluZ3MgdG8gdXNlIGFsdGVybmF0aXZlIGRlbGltaXRlcnMuXG4gIF8udGVtcGxhdGVTZXR0aW5ncyA9IHtcbiAgICBldmFsdWF0ZSAgICA6IC88JShbXFxzXFxTXSs/KSU+L2csXG4gICAgaW50ZXJwb2xhdGUgOiAvPCU9KFtcXHNcXFNdKz8pJT4vZyxcbiAgICBlc2NhcGUgICAgICA6IC88JS0oW1xcc1xcU10rPyklPi9nXG4gIH07XG5cbiAgLy8gV2hlbiBjdXN0b21pemluZyBgdGVtcGxhdGVTZXR0aW5nc2AsIGlmIHlvdSBkb24ndCB3YW50IHRvIGRlZmluZSBhblxuICAvLyBpbnRlcnBvbGF0aW9uLCBldmFsdWF0aW9uIG9yIGVzY2FwaW5nIHJlZ2V4LCB3ZSBuZWVkIG9uZSB0aGF0IGlzXG4gIC8vIGd1YXJhbnRlZWQgbm90IHRvIG1hdGNoLlxuICB2YXIgbm9NYXRjaCA9IC8oLileLztcblxuICAvLyBDZXJ0YWluIGNoYXJhY3RlcnMgbmVlZCB0byBiZSBlc2NhcGVkIHNvIHRoYXQgdGhleSBjYW4gYmUgcHV0IGludG8gYVxuICAvLyBzdHJpbmcgbGl0ZXJhbC5cbiAgdmFyIGVzY2FwZXMgPSB7XG4gICAgXCInXCI6ICAgICAgXCInXCIsXG4gICAgJ1xcXFwnOiAgICAgJ1xcXFwnLFxuICAgICdcXHInOiAgICAgJ3InLFxuICAgICdcXG4nOiAgICAgJ24nLFxuICAgICdcXHQnOiAgICAgJ3QnLFxuICAgICdcXHUyMDI4JzogJ3UyMDI4JyxcbiAgICAnXFx1MjAyOSc6ICd1MjAyOSdcbiAgfTtcblxuICB2YXIgZXNjYXBlciA9IC9cXFxcfCd8XFxyfFxcbnxcXHR8XFx1MjAyOHxcXHUyMDI5L2c7XG5cbiAgLy8gSmF2YVNjcmlwdCBtaWNyby10ZW1wbGF0aW5nLCBzaW1pbGFyIHRvIEpvaG4gUmVzaWcncyBpbXBsZW1lbnRhdGlvbi5cbiAgLy8gVW5kZXJzY29yZSB0ZW1wbGF0aW5nIGhhbmRsZXMgYXJiaXRyYXJ5IGRlbGltaXRlcnMsIHByZXNlcnZlcyB3aGl0ZXNwYWNlLFxuICAvLyBhbmQgY29ycmVjdGx5IGVzY2FwZXMgcXVvdGVzIHdpdGhpbiBpbnRlcnBvbGF0ZWQgY29kZS5cbiAgXy50ZW1wbGF0ZSA9IGZ1bmN0aW9uKHRleHQsIGRhdGEsIHNldHRpbmdzKSB7XG4gICAgdmFyIHJlbmRlcjtcbiAgICBzZXR0aW5ncyA9IF8uZGVmYXVsdHMoe30sIHNldHRpbmdzLCBfLnRlbXBsYXRlU2V0dGluZ3MpO1xuXG4gICAgLy8gQ29tYmluZSBkZWxpbWl0ZXJzIGludG8gb25lIHJlZ3VsYXIgZXhwcmVzc2lvbiB2aWEgYWx0ZXJuYXRpb24uXG4gICAgdmFyIG1hdGNoZXIgPSBuZXcgUmVnRXhwKFtcbiAgICAgIChzZXR0aW5ncy5lc2NhcGUgfHwgbm9NYXRjaCkuc291cmNlLFxuICAgICAgKHNldHRpbmdzLmludGVycG9sYXRlIHx8IG5vTWF0Y2gpLnNvdXJjZSxcbiAgICAgIChzZXR0aW5ncy5ldmFsdWF0ZSB8fCBub01hdGNoKS5zb3VyY2VcbiAgICBdLmpvaW4oJ3wnKSArICd8JCcsICdnJyk7XG5cbiAgICAvLyBDb21waWxlIHRoZSB0ZW1wbGF0ZSBzb3VyY2UsIGVzY2FwaW5nIHN0cmluZyBsaXRlcmFscyBhcHByb3ByaWF0ZWx5LlxuICAgIHZhciBpbmRleCA9IDA7XG4gICAgdmFyIHNvdXJjZSA9IFwiX19wKz0nXCI7XG4gICAgdGV4dC5yZXBsYWNlKG1hdGNoZXIsIGZ1bmN0aW9uKG1hdGNoLCBlc2NhcGUsIGludGVycG9sYXRlLCBldmFsdWF0ZSwgb2Zmc2V0KSB7XG4gICAgICBzb3VyY2UgKz0gdGV4dC5zbGljZShpbmRleCwgb2Zmc2V0KVxuICAgICAgICAucmVwbGFjZShlc2NhcGVyLCBmdW5jdGlvbihtYXRjaCkgeyByZXR1cm4gJ1xcXFwnICsgZXNjYXBlc1ttYXRjaF07IH0pO1xuXG4gICAgICBpZiAoZXNjYXBlKSB7XG4gICAgICAgIHNvdXJjZSArPSBcIicrXFxuKChfX3Q9KFwiICsgZXNjYXBlICsgXCIpKT09bnVsbD8nJzpfLmVzY2FwZShfX3QpKStcXG4nXCI7XG4gICAgICB9XG4gICAgICBpZiAoaW50ZXJwb2xhdGUpIHtcbiAgICAgICAgc291cmNlICs9IFwiJytcXG4oKF9fdD0oXCIgKyBpbnRlcnBvbGF0ZSArIFwiKSk9PW51bGw/Jyc6X190KStcXG4nXCI7XG4gICAgICB9XG4gICAgICBpZiAoZXZhbHVhdGUpIHtcbiAgICAgICAgc291cmNlICs9IFwiJztcXG5cIiArIGV2YWx1YXRlICsgXCJcXG5fX3ArPSdcIjtcbiAgICAgIH1cbiAgICAgIGluZGV4ID0gb2Zmc2V0ICsgbWF0Y2gubGVuZ3RoO1xuICAgICAgcmV0dXJuIG1hdGNoO1xuICAgIH0pO1xuICAgIHNvdXJjZSArPSBcIic7XFxuXCI7XG5cbiAgICAvLyBJZiBhIHZhcmlhYmxlIGlzIG5vdCBzcGVjaWZpZWQsIHBsYWNlIGRhdGEgdmFsdWVzIGluIGxvY2FsIHNjb3BlLlxuICAgIGlmICghc2V0dGluZ3MudmFyaWFibGUpIHNvdXJjZSA9ICd3aXRoKG9ianx8e30pe1xcbicgKyBzb3VyY2UgKyAnfVxcbic7XG5cbiAgICBzb3VyY2UgPSBcInZhciBfX3QsX19wPScnLF9faj1BcnJheS5wcm90b3R5cGUuam9pbixcIiArXG4gICAgICBcInByaW50PWZ1bmN0aW9uKCl7X19wKz1fX2ouY2FsbChhcmd1bWVudHMsJycpO307XFxuXCIgK1xuICAgICAgc291cmNlICsgXCJyZXR1cm4gX19wO1xcblwiO1xuXG4gICAgdHJ5IHtcbiAgICAgIHJlbmRlciA9IG5ldyBGdW5jdGlvbihzZXR0aW5ncy52YXJpYWJsZSB8fCAnb2JqJywgJ18nLCBzb3VyY2UpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGUuc291cmNlID0gc291cmNlO1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG5cbiAgICBpZiAoZGF0YSkgcmV0dXJuIHJlbmRlcihkYXRhLCBfKTtcbiAgICB2YXIgdGVtcGxhdGUgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICByZXR1cm4gcmVuZGVyLmNhbGwodGhpcywgZGF0YSwgXyk7XG4gICAgfTtcblxuICAgIC8vIFByb3ZpZGUgdGhlIGNvbXBpbGVkIGZ1bmN0aW9uIHNvdXJjZSBhcyBhIGNvbnZlbmllbmNlIGZvciBwcmVjb21waWxhdGlvbi5cbiAgICB0ZW1wbGF0ZS5zb3VyY2UgPSAnZnVuY3Rpb24oJyArIChzZXR0aW5ncy52YXJpYWJsZSB8fCAnb2JqJykgKyAnKXtcXG4nICsgc291cmNlICsgJ30nO1xuXG4gICAgcmV0dXJuIHRlbXBsYXRlO1xuICB9O1xuXG4gIC8vIEFkZCBhIFwiY2hhaW5cIiBmdW5jdGlvbiwgd2hpY2ggd2lsbCBkZWxlZ2F0ZSB0byB0aGUgd3JhcHBlci5cbiAgXy5jaGFpbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBfKG9iaikuY2hhaW4oKTtcbiAgfTtcblxuICAvLyBPT1BcbiAgLy8gLS0tLS0tLS0tLS0tLS0tXG4gIC8vIElmIFVuZGVyc2NvcmUgaXMgY2FsbGVkIGFzIGEgZnVuY3Rpb24sIGl0IHJldHVybnMgYSB3cmFwcGVkIG9iamVjdCB0aGF0XG4gIC8vIGNhbiBiZSB1c2VkIE9PLXN0eWxlLiBUaGlzIHdyYXBwZXIgaG9sZHMgYWx0ZXJlZCB2ZXJzaW9ucyBvZiBhbGwgdGhlXG4gIC8vIHVuZGVyc2NvcmUgZnVuY3Rpb25zLiBXcmFwcGVkIG9iamVjdHMgbWF5IGJlIGNoYWluZWQuXG5cbiAgLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGNvbnRpbnVlIGNoYWluaW5nIGludGVybWVkaWF0ZSByZXN1bHRzLlxuICB2YXIgcmVzdWx0ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NoYWluID8gXyhvYmopLmNoYWluKCkgOiBvYmo7XG4gIH07XG5cbiAgLy8gQWRkIGFsbCBvZiB0aGUgVW5kZXJzY29yZSBmdW5jdGlvbnMgdG8gdGhlIHdyYXBwZXIgb2JqZWN0LlxuICBfLm1peGluKF8pO1xuXG4gIC8vIEFkZCBhbGwgbXV0YXRvciBBcnJheSBmdW5jdGlvbnMgdG8gdGhlIHdyYXBwZXIuXG4gIGVhY2goWydwb3AnLCAncHVzaCcsICdyZXZlcnNlJywgJ3NoaWZ0JywgJ3NvcnQnLCAnc3BsaWNlJywgJ3Vuc2hpZnQnXSwgZnVuY3Rpb24obmFtZSkge1xuICAgIHZhciBtZXRob2QgPSBBcnJheVByb3RvW25hbWVdO1xuICAgIF8ucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgb2JqID0gdGhpcy5fd3JhcHBlZDtcbiAgICAgIG1ldGhvZC5hcHBseShvYmosIGFyZ3VtZW50cyk7XG4gICAgICBpZiAoKG5hbWUgPT0gJ3NoaWZ0JyB8fCBuYW1lID09ICdzcGxpY2UnKSAmJiBvYmoubGVuZ3RoID09PSAwKSBkZWxldGUgb2JqWzBdO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jYWxsKHRoaXMsIG9iaik7XG4gICAgfTtcbiAgfSk7XG5cbiAgLy8gQWRkIGFsbCBhY2Nlc3NvciBBcnJheSBmdW5jdGlvbnMgdG8gdGhlIHdyYXBwZXIuXG4gIGVhY2goWydjb25jYXQnLCAnam9pbicsICdzbGljZSddLCBmdW5jdGlvbihuYW1lKSB7XG4gICAgdmFyIG1ldGhvZCA9IEFycmF5UHJvdG9bbmFtZV07XG4gICAgXy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiByZXN1bHQuY2FsbCh0aGlzLCBtZXRob2QuYXBwbHkodGhpcy5fd3JhcHBlZCwgYXJndW1lbnRzKSk7XG4gICAgfTtcbiAgfSk7XG5cbiAgXy5leHRlbmQoXy5wcm90b3R5cGUsIHtcblxuICAgIC8vIFN0YXJ0IGNoYWluaW5nIGEgd3JhcHBlZCBVbmRlcnNjb3JlIG9iamVjdC5cbiAgICBjaGFpbjogZnVuY3Rpb24oKSB7XG4gICAgICB0aGlzLl9jaGFpbiA9IHRydWU7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLy8gRXh0cmFjdHMgdGhlIHJlc3VsdCBmcm9tIGEgd3JhcHBlZCBhbmQgY2hhaW5lZCBvYmplY3QuXG4gICAgdmFsdWU6IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHRoaXMuX3dyYXBwZWQ7XG4gICAgfVxuXG4gIH0pO1xuXG59KS5jYWxsKHRoaXMpO1xuXG59KSgpIiwidmFyIHJvdXRpZSA9IHJlcXVpcmUoJy4uLy4uLy4uLzNyZHBhcnR5L3JvdXRpZScpO1xudmFyIHBsYXllciA9IHJlcXVpcmUoJy4uL3BsYXllcicpO1xudmFyIF8gPSByZXF1aXJlKCd1bmRlcnNjb3JlJyk7XG52YXIgdmlldyA9IHJlcXVpcmUoJy4uLy4uL3ZpZXdzL3JlZ2lzdGVyLXNpbXBsZS5oYnMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgXG4gIGlmIChwbGF5ZXIuZ2V0KCkuaWQpIHtcbiAgICByZXR1cm4gcm91dGllLm5hdmlnYXRlKCcvd2FpdCcpO1xuICB9XG4gIFxuICAkKCcjcGFnZScpLmF0dHIoJ2NsYXNzJywgJ3JlZ2lzdGVyJyk7XG4gICQoJyNwYWdlJykuaHRtbCh2aWV3KCkpO1xuICBcbiAgJCgnYnV0dG9uJykub24oJ2NsaWNrJywgcmVnaXN0ZXIpO1xuICBcbn07XG5cbmZ1bmN0aW9uIGdpdmVGZWVkYmFjayhkYXRhKXtcbiAgIF8uZWFjaChkYXRhLCBmdW5jdGlvbihmaWVsZCwga2V5KXtcbiAgICAgIGZpZWxkWzBdLnBhcmVudCgpLnJlbW92ZUNsYXNzKFwiZXJyb3JcIik7XG4gICAgICBpZiAoZmllbGRbMl0gPT09IGZhbHNlKXtcbiAgICAgICAgZmllbGRbMF0ucGFyZW50KCkuYWRkQ2xhc3MoXCJlcnJvclwiKTtcbiAgICAgICAgZmllbGRbMF0ucGFyZW50KCkuZ2V0KDApLnNjcm9sbEludG9WaWV3KClcbiAgICAgIH1cbiAgIH0pO1xufVxuXG5mdW5jdGlvbiBtYXBEYXRhKGRhdGEpe1xuICByZXR1cm4gXy5pbmplY3QoZGF0YSwgZnVuY3Rpb24obWVtbywgY29udHJvbCwga2V5KXtcbiAgICB2YXIgaXNJbnZhbGlkID0gKGNvbnRyb2wudmFsKCkgPT09IFwiXCIgfHwgY29udHJvbC52YWwoKSA9PT0gXCJTZWxlY3QgQ291bnRyeVwiIHx8IGNvbnRyb2wudmFsKCkgPT09IFwiU2VsZWN0IFJvbGVcIiApO1xuICAgIG1lbW9ba2V5XSA9IFtjb250cm9sLCBjb250cm9sLnZhbCgpLCAhaXNJbnZhbGlkXTtcbiAgICByZXR1cm4gbWVtbztcbiAgfSwge30pO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZShkYXRhKXtcbiAgcmV0dXJuIF8uZXZlcnkoZGF0YSwgZnVuY3Rpb24oZmllbGQpe1xuICAgIHJldHVybiBmaWVsZFsyXTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyKGUpIHtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gIHZhciBkYXRhID0ge1xuICAgIGZpcnN0TmFtZTogICAgJCgnI2ZpcnN0TmFtZScpLFxuICAgIGxhc3ROYW1lOiAgICAgJCgnI2xhc3ROYW1lJyksXG4gICAgY29tcGFueTogICAgICAkKCcjY29tcGFueScpLFxuICAgIGNvdW50cnk6ICAgICAgJCgnI2NvdW50cnknKSxcbiAgICByb2xlOiAgICAgICAgICQoJyNyb2xlJyksXG4gICAgZW1haWw6ICAgICAgICAkKCcjZW1haWwnKVxuICB9O1xuXG4gIHZhciBtYXBwZWREYXRhID0gbWFwRGF0YShkYXRhKTtcbiAgdmFyIGRhdGFJc1ZhbGlkID0gdmFsaWRhdGUobWFwcGVkRGF0YSk7XG5cbiAgaWYgKGRhdGFJc1ZhbGlkKXtcbiAgICB2YXIgZm9ybURhdGEgPSBfLmluamVjdChtYXBwZWREYXRhLCBmdW5jdGlvbihtLCBmaWVsZCwga2V5KXsgbVtrZXldID0gZmllbGRbMV07IHJldHVybiBtOyB9LCB7fSk7XG4gICAgY29uc29sZS5sb2coXCJGSUVMRFNcIiwgZm9ybURhdGEpO1xuICAgIFxuICAgICQuYWpheCh7XG4gICAgICB0eXBlOiAnUE9TVCcsXG4gICAgICB1cmw6ICcvcGxheWVyJyxcbiAgICAgIGRhdGE6IEpTT04uc3RyaW5naWZ5KGZvcm1EYXRhKSxcbiAgICAgIGRhdGFUeXBlOiAnanNvbicsXG4gICAgICBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb247IGNoYXJzZXQ9dXRmLTgnXG4gICAgfSkudGhlbihnbykuZmFpbChlcnJvcik7XG4gIFxuICB9XG4gIGVsc2Uge1xuICAgIGdpdmVGZWVkYmFjayhtYXBwZWREYXRhKTsgXG4gIH1cbn1cblxuZnVuY3Rpb24gZ28oZGF0YSkge1xuICBwbGF5ZXIuc2V0KHtcbiAgICBpZDogZGF0YS5pZCxcbiAgICBuYW1lOiBkYXRhLm5hbWVcbiAgfSk7XG4gIHJvdXRpZS5uYXZpZ2F0ZSgnL3dhaXQnKTtcbn1cblxuZnVuY3Rpb24gZXJyb3IocmVzKSB7XG4gIGFsZXJ0KCdFcnJvcjogJyArIHJlcyk7XG59XG4iLCJ2YXIgcnggPSByZXF1aXJlKCdyeGpzJyk7XG52YXIgcm91dGllID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvcm91dGllJyk7XG52YXIgcGxheWVyID0gcmVxdWlyZSgnLi4vcGxheWVyJyk7XG52YXIgdmlldyA9IHJlcXVpcmUoJy4uLy4uL3ZpZXdzL3dhaXQuaGJzJyk7XG5yZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9yeC56ZXB0bycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICBcbiAgaWYgKHBsYXllci5nZXQoKS5pZCA9PSB1bmRlZmluZWQpIHtcbiAgICByb3V0aWUubmF2aWdhdGUoJy9jb25uZWN0Jyk7XG4gIH1cbiAgXG4gICQoJyNwYWdlJykuYXR0cignY2xhc3MnLCAnd2FpdCcpO1xuICAkKCcjcGFnZScpLmh0bWwodmlldygpKTtcblxuICB2YXIgb2JzZXJ2YWJsZSA9IHJ4Lk9ic2VydmFibGVcbiAgICAuaW50ZXJ2YWwoMzAwMClcbiAgICAuc3RhcnRXaXRoKC0xKVxuICAgIC5zZWxlY3RNYW55KG9ic2VydmFibGVMb2JieSlcbiAgICAuc2tpcFdoaWxlKGdhbWVJblByb2dyZXNzKVxuICAgIC50YWtlKDEpXG4gICAgLnN1YnNjcmliZShzd2l0Y2hTdGF0ZSwgb25FcnJvcik7XG5cbn07XG5cbmZ1bmN0aW9uIG9ic2VydmFibGVMb2JieSgpIHtcbiAgcmV0dXJuICQuZ2V0SlNPTkFzT2JzZXJ2YWJsZSgnL2dhbWUvc3RhdHVzJyk7XG59XG5cbmZ1bmN0aW9uIGdhbWVJblByb2dyZXNzKHJlcykge1xuICByZXR1cm4gcmVzLmRhdGEuaW5Qcm9ncmVzcyA9PT0gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gc3dpdGNoU3RhdGUoKSB7XG4gIHJvdXRpZS5uYXZpZ2F0ZSgnL2pvaW4nKTtcbn1cblxuZnVuY3Rpb24gb25FcnJvcigpIHtcbiAgY29uc29sZS5sb2coJ0dhbWUgbm90IHJlc3BvbmRpbmcnKTtcbn1cbiIsInZhciByeCA9IHJlcXVpcmUoJ3J4anMnKTtcbnZhciByb3V0aWUgPSByZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9yb3V0aWUnKTtcbnZhciBwbGF5ZXIgPSByZXF1aXJlKCcuLi9wbGF5ZXInKTtcbnZhciB2aWV3ID0gcmVxdWlyZSgnLi4vLi4vdmlld3MvbG9iYnkuaGJzJyk7XG5yZXF1aXJlKCcuLi8uLi8uLi8zcmRwYXJ0eS9yeC56ZXB0bycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICBcbiAgaWYgKHBsYXllci5nZXQoKS5pZCA9PSB1bmRlZmluZWQpIHtcbiAgICByb3V0aWUubmF2aWdhdGUoJy9jb25uZWN0Jyk7XG4gIH1cbiAgXG4gICQoJyNwYWdlJykuYXR0cignY2xhc3MnLCAnbG9iYnknKTtcbiAgJCgnI3BhZ2UnKS5odG1sKHZpZXcoKSk7XG4gICQoJyNjYW5jZWwnKS5vbignY2xpY2snLCBleGl0TG9iYnkpO1xuXG4gIHZhciBvYnNlcnZhYmxlID0gcnguT2JzZXJ2YWJsZVxuICAgIC5pbnRlcnZhbCgxMDAwKVxuICAgIC5zdGFydFdpdGgoLTEpXG4gICAgLnNlbGVjdE1hbnkob2JzZXJ2YWJsZUxvYmJ5KVxuICAgIC5za2lwV2hpbGUod2FpdGluZ0Zvck90aGVyUGxheWVyKVxuICAgIC50YWtlKDEpXG4gICAgLnN1YnNjcmliZShzdGFydE1hdGNoLCBvbkVycm9yKTtcblxufTtcblxuZnVuY3Rpb24gb2JzZXJ2YWJsZUxvYmJ5KCkge1xuICByZXR1cm4gJC5nZXRKU09OQXNPYnNlcnZhYmxlKCcvZ2FtZS9zdGF0dXMnKTtcbn1cblxuZnVuY3Rpb24gd2FpdGluZ0Zvck90aGVyUGxheWVyKHJlcykge1xuICByZXR1cm4gcmVzLmRhdGEuaW5Qcm9ncmVzcyA9PT0gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIHN0YXJ0TWF0Y2goKSB7XG4gIHJvdXRpZS5uYXZpZ2F0ZSgnL2dhbWVwYWQnKTtcbn1cblxuZnVuY3Rpb24gb25FcnJvcigpIHtcbiAgY29uc29sZS5sb2coJ0dhbWUgbm90IHJlc3BvbmRpbmcnKTtcbn1cblxuZnVuY3Rpb24gZXhpdExvYmJ5KCkge1xuICAkLmFqYXgoe1xuICAgIHR5cGU6ICdERUxFVEUnLFxuICAgIHVybDogJy9nYW1lL3BsYXllcnMvJyArIHBsYXllci5nZXQoKS5pZFxuICB9KS50aGVuKGJhY2tUb1dhaXQpO1xufVxuXG5mdW5jdGlvbiBiYWNrVG9XYWl0KCkge1xuICByb3V0aWUubmF2aWdhdGUoJy93YWl0Jyk7XG59XG4iLCJ2YXIgcnggPSByZXF1aXJlKCdyeGpzJyk7XG52YXIgcm91dGllID0gcmVxdWlyZSgnLi4vLi4vLi4vM3JkcGFydHkvcm91dGllJyk7XG52YXIgcGxheWVyID0gcmVxdWlyZSgnLi4vcGxheWVyJyk7XG52YXIgdmlldyA9IHJlcXVpcmUoJy4uLy4uL3ZpZXdzL2dhbWVwYWQuaGJzJyk7XG52YXIgb2JzZXJ2YWJsZSA9IG51bGw7XG52YXIgc29ja2V0ID0gbnVsbFxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuXG4gIGlmIChwbGF5ZXIuZ2V0KCkuaWQgPT0gdW5kZWZpbmVkKSB7XG4gICAgcm91dGllLm5hdmlnYXRlKCcvY29ubmVjdCcpO1xuICB9XG5cbiAgc29ja2V0ID0gaW8uY29ubmVjdCgnLycpXG4gIFxuICAkKCcjcGFnZScpLmF0dHIoJ2NsYXNzJywgJ2dhbWVwYWQnKTtcbiAgJCgnI3BhZ2UnKS5odG1sKHZpZXcoKSk7XG5cbiAgJCgnLmRldmljZScpLmhlaWdodChzY3JlZW4uaGVpZ2h0IC0gOTApO1xuXG4gIG9ic2VydmFibGUgPSByeC5PYnNlcnZhYmxlXG4gICAgLmludGVydmFsKDIwMDApXG4gICAgLnN0YXJ0V2l0aCgtMSlcbiAgICAuc2VsZWN0TWFueShvYnNlcnZhYmxlR2FtZSlcbiAgICAuc3Vic2NyaWJlKGNoZWNrR2FtZVN0YXR1cywgb25FcnJvcik7XG5cbiAgaWYgKCdvbnRvdWNoc3RhcnQnIGluIHdpbmRvdykge1xuICAgICQoJy51cCcpLm9uKCd0b3VjaHN0YXJ0JywgZ29VcCk7XG4gICAgJCgnLnVwJykub24oJ3RvdWNoZW5kJywgc3RvcCk7XG4gICAgJCgnLmRvd24nKS5vbigndG91Y2hzdGFydCcsIGdvRG93bik7XG4gICAgJCgnLmRvd24nKS5vbigndG91Y2hlbmQnLCBzdG9wKTtcbiAgfSBlbHNlIHtcbiAgICAkKCcudXAnKS5vbignbW91c2Vkb3duJywgZ29VcCk7XG4gICAgJCgnLnVwJykub24oJ21vdXNldXAnLCBzdG9wKTtcbiAgICAkKCcuZG93bicpLm9uKCdtb3VzZWRvd24nLCBnb0Rvd24pO1xuICAgICQoJy5kb3duJykub24oJ21vdXNldXAnLCBzdG9wKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gZ29VcChlKSB7XG4gIGUucHJldmVudERlZmF1bHQoKTtcbiAgJChlLmN1cnJlbnRUYXJnZXQpLmFkZENsYXNzKCdwcmVzc2VkJyk7XG4gIHNlbmRBY3Rpb24oJ3VwJyk7XG59XG5cbmZ1bmN0aW9uIGdvRG93bihlKSB7XG4gIGUucHJldmVudERlZmF1bHQoKTtcbiAgJChlLmN1cnJlbnRUYXJnZXQpLmFkZENsYXNzKCdwcmVzc2VkJyk7XG4gIHNlbmRBY3Rpb24oJ2Rvd24nKTtcbn1cblxuZnVuY3Rpb24gc3RvcChlKSB7XG4gIGUucHJldmVudERlZmF1bHQoKTtcbiAgJChlLmN1cnJlbnRUYXJnZXQpLnJlbW92ZUNsYXNzKCdwcmVzc2VkJyk7XG59XG5cbmZ1bmN0aW9uIHNlbmRBY3Rpb24oYWN0aW9uTmFtZSkge1xuICBzb2NrZXQuZW1pdCgnbW92ZScsIHsgcGxheWVyOiBwbGF5ZXIuZ2V0KCkuaWQsIGFjdGlvbjogYWN0aW9uTmFtZSB9KVxufVxuXG5mdW5jdGlvbiBvYnNlcnZhYmxlR2FtZSgpIHtcbiAgcmV0dXJuICQuZ2V0SlNPTkFzT2JzZXJ2YWJsZSgnL2dhbWUvc3RhdHVzJyk7XG59XG5cbmZ1bmN0aW9uIGNoZWNrR2FtZVN0YXR1cyhyZXMpIHtcbiAgaWYgKHJlcy5kYXRhLmluUHJvZ3Jlc3MpIHtcbiAgICB2YXIgaWR4ID0gY3VycmVudFBsYXllckluZGV4KHJlcy5kYXRhLnBsYXllcnMpO1xuICAgIGlmIChpZHggPT09IG51bGwpIHtcbiAgICAgIG9ic2VydmFibGUuZGlzcG9zZSgpO1xuICAgICAgcm91dGllLm5hdmlnYXRlKCcvd2FpdCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICAkKCcjcGFnZSAucGxheWVyJykuYWRkQ2xhc3MoJ3AnICsgKGlkeCsxKSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIG9ic2VydmFibGUuZGlzcG9zZSgpO1xuICAgIHJvdXRpZS5uYXZpZ2F0ZSgnL2pvaW4nKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjdXJyZW50UGxheWVySW5kZXgocGxheWVycykge1xuICBpZiAocGxheWVyc1swXS5pZCA9PT0gcGxheWVyLmdldCgpLmlkKSByZXR1cm4gMDtcbiAgaWYgKHBsYXllcnNbMV0uaWQgPT09IHBsYXllci5nZXQoKS5pZCkgcmV0dXJuIDE7XG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBvbkVycm9yKCkge1xuICBjb25zb2xlLmxvZygnR2FtZSBub3QgcmVzcG9uZGluZycpO1xufVxuIiwiKGZ1bmN0aW9uKCl7Ly8gQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgT3BlbiBUZWNobm9sb2dpZXMsIEluYy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4oZnVuY3Rpb24gKHJvb3QsIGZhY3RvcnkpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZhY3Rvcnkocm9vdCwgbW9kdWxlLmV4cG9ydHMsIHJlcXVpcmUoJ3J4anMnKSwgJCk7XG59KHRoaXMsIGZ1bmN0aW9uIChnbG9iYWwsIGV4cCwgcm9vdCwgJCwgdW5kZWZpbmVkKSB7XG4gICAgICAgIC8vIEhlYWRlcnNcbiAgICB2YXIgcm9vdCA9IGdsb2JhbC5SeCxcbiAgICAgICAgb2JzZXJ2YWJsZSA9IHJvb3QuT2JzZXJ2YWJsZSxcbiAgICAgICAgb2JzZXJ2YWJsZVByb3RvID0gb2JzZXJ2YWJsZS5wcm90b3R5cGUsXG4gICAgICAgIEFzeW5jU3ViamVjdCA9IHJvb3QuQXN5bmNTdWJqZWN0LFxuICAgICAgICBvYnNlcnZhYmxlQ3JlYXRlID0gb2JzZXJ2YWJsZS5jcmVhdGUsXG4gICAgICAgIG9ic2VydmFibGVDcmVhdGVXaXRoRGlzcG9zYWJsZSA9IG9ic2VydmFibGUuY3JlYXRlV2l0aERpc3Bvc2FibGUsXG4gICAgICAgIGRpc3Bvc2FibGVFbXB0eSA9IHJvb3QuRGlzcG9zYWJsZS5lbXB0eSxcbiAgICAgICAgc2xpY2UgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UsXG4gICAgICAgIHByb3RvID0gJC5mbjtcbiAgICAgICAgXG4gICAgJC5EZWZlcnJlZC5wcm90b3R5cGUudG9PYnNlcnZhYmxlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc3ViamVjdCA9IG5ldyBBc3luY1N1YmplY3QoKTtcbiAgICAgICAgdGhpcy5kb25lKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHN1YmplY3Qub25OZXh0KHNsaWNlLmNhbGwoYXJndW1lbnRzKSk7XG4gICAgICAgICAgICBzdWJqZWN0Lm9uQ29tcGxldGVkKCk7XG4gICAgICAgIH0pLmZhaWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc3ViamVjdC5vbkVycm9yKHNsaWNlLmNhbGwoYXJndW1lbnRzKSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gc3ViamVjdDtcbiAgICB9O1xuXG4gICAgb2JzZXJ2YWJsZVByb3RvLnRvRGVmZXJyZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9ICQuRGVmZXJyZWQoKTtcbiAgICAgICAgdGhpcy5zdWJzY3JpYmUoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHZhbHVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGUpIHsgXG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQ7XG4gICAgfTtcblxuICAgIHZhciBhamF4QXNPYnNlcnZhYmxlID0gJC5hamF4QXNPYnNlcnZhYmxlID0gZnVuY3Rpb24oc2V0dGluZ3MpIHtcbiAgICAgICAgdmFyIHN1YmplY3QgPSBuZXcgQXN5bmNTdWJqZWN0KCk7XG5cbiAgICAgICAgdmFyIGludGVybmFsU2V0dGluZ3MgPSB7XG4gICAgICAgICAgICBzdWNjZXNzOiBmdW5jdGlvbihkYXRhLCB0ZXh0U3RhdHVzLCBqcVhIUikge1xuICAgICAgICAgICAgICAgIHN1YmplY3Qub25OZXh0KHsgZGF0YTogZGF0YSwgdGV4dFN0YXR1czogdGV4dFN0YXR1cywganFYSFI6IGpxWEhSIH0pO1xuICAgICAgICAgICAgICAgIHN1YmplY3Qub25Db21wbGV0ZWQoKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBlcnJvcjogZnVuY3Rpb24oanFYSFIsIHRleHRTdGF0dXMsIGVycm9yVGhyb3duKSB7XG4gICAgICAgICAgICAgICAgc3ViamVjdC5vbkVycm9yKHsganFYSFI6IGpxWEhSLCB0ZXh0U3RhdHVzOiB0ZXh0U3RhdHVzLCBlcnJvclRocm93bjogZXJyb3JUaHJvd24gfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIFxuICAgICAgICAkLmV4dGVuZCh0cnVlLCBpbnRlcm5hbFNldHRpbmdzLCBzZXR0aW5ncyk7XG5cbiAgICAgICAgJC5hamF4KGludGVybmFsU2V0dGluZ3MpO1xuXG4gICAgICAgIHJldHVybiBzdWJqZWN0O1xuICAgIH07XG5cbiAgICAkLmdldEFzT2JzZXJ2YWJsZSA9IGZ1bmN0aW9uKHVybCwgZGF0YSwgZGF0YVR5cGUpIHtcbiAgICAgICAgcmV0dXJuIGFqYXhBc09ic2VydmFibGUoeyB1cmw6IHVybCwgZGF0YVR5cGU6IGRhdGFUeXBlLCBkYXRhOiBkYXRhIH0pO1xuICAgIH07XG5cbiAgICAkLmdldEpTT05Bc09ic2VydmFibGUgPSBmdW5jdGlvbih1cmwsIGRhdGEpIHtcbiAgICAgICAgcmV0dXJuIGFqYXhBc09ic2VydmFibGUoeyB1cmw6IHVybCwgZGF0YVR5cGU6ICdqc29uJywgZGF0YTogZGF0YSB9KTtcbiAgICB9O1xuXG5cbiAgICAkLnBvc3RBc09ic2VydmFibGUgPSBmdW5jdGlvbih1cmwsIGRhdGEsIGRhdGFUeXBlKSB7XG4gICAgICAgIHJldHVybiBhamF4QXNPYnNlcnZhYmxlKHsgdXJsOiB1cmwsIGRhdGFUeXBlOiBkYXRhVHlwZSwgZGF0YTogZGF0YSwgdHlwZTogJ1BPU1QnfSk7XHRcbiAgICB9O1xuXG4gICAgcmV0dXJuIHJvb3Q7XG5cbn0pKTtcblxufSkoKSIsInZhciBIYW5kbGViYXJzID0gcmVxdWlyZSgnaGFuZGxlYmFycy1ydW50aW1lJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnMudGVtcGxhdGUoZnVuY3Rpb24gKEhhbmRsZWJhcnMsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICB0aGlzLmNvbXBpbGVySW5mbyA9IFs0LCc+PSAxLjAuMCddO1xuaGVscGVycyA9IHRoaXMubWVyZ2UoaGVscGVycywgSGFuZGxlYmFycy5oZWxwZXJzKTsgZGF0YSA9IGRhdGEgfHwge307XG4gIFxuXG5cbiAgcmV0dXJuIFwiXFxuPGgxPm1hdGNoIGluIHByb2dyZXNzPC9oMT5cXG5cXG48ZGl2IGNsYXNzPSd3YWl0LW1lc3NhZ2UnPlxcblx0PHA+XFxuXHQgIEFzIHNvb24gYXMgdGhlIGN1cnJlbnQgbWF0Y2ggaXMgZmluaXNoZWQsXFxuXHQgIHlvdSdsbCBiZSBhYmxlIHRvIGpvaW4gdGhlIGFjdGlvbiFcXG5cdDwvcD5cXG48L2Rpdj5cIjtcbiAgfSk7XG4iLCJ2YXIgSGFuZGxlYmFycyA9IHJlcXVpcmUoJ2hhbmRsZWJhcnMtcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICBcblxuXG4gIHJldHVybiBcIlxcbjxoMT5SZWdpc3RlciBUbyBQbGF5PC9oMT5cXG5cXG48Zm9ybT5cXG4gIFxcbiAgPGRpdiBjbGFzcz1cXFwiZmllbGRcXFwiPlxcbiAgICA8bGFiZWw+XFxuICAgIFx0Rmlyc3QgbmFtZVxcbiAgICBcdDxzcGFuIGNsYXNzPVxcXCJyZXF1aXJlZFxcXCI+Kjwvc3Bhbj5cXG4gICAgPC9sYWJlbD5cXG4gICAgPGlucHV0IGlkPVxcXCJmaXJzdE5hbWVcXFwiIHR5cGU9XFxcInRleHRcXFwiIHZhbHVlPVxcXCJcXFwiIGF1dG9jb3JyZWN0PVxcXCJvZmZcXFwiIC8+XFxuICA8L2Rpdj5cXG4gIFxcbiAgPGRpdiBjbGFzcz1cXFwiZmllbGRcXFwiPlxcbiAgICA8bGFiZWw+XFxuICAgXHRcdCBMYXN0IG5hbWVcXG4gICBcdCBcdDxzcGFuIGNsYXNzPVxcXCJyZXF1aXJlZFxcXCI+Kjwvc3Bhbj5cXG4gICAgPC9sYWJlbD5cXG4gICAgPGlucHV0IGlkPVxcXCJsYXN0TmFtZVxcXCIgdHlwZT1cXFwidGV4dFxcXCIgdmFsdWU9XFxcIlxcXCIgYXV0b2NvcnJlY3Q9XFxcIm9mZlxcXCIgLz5cXG4gIDwvZGl2PlxcblxcbiAgPGRpdiBjbGFzcz1cXFwiZmllbGRcXFwiPlxcbiAgICA8bGFiZWw+XFxuICAgIFx0RW1haWxcXG4gICAgXHQ8c3BhbiBjbGFzcz1cXFwicmVxdWlyZWRcXFwiPio8L3NwYW4+XFxuICAgIDwvbGFiZWw+XFxuICAgIDxpbnB1dCBpZD1cXFwiZW1haWxcXFwiIHR5cGU9XFxcImVtYWlsXFxcIiB2YWx1ZT1cXFwiXFxcIiBhdXRvY29ycmVjdD1cXFwib2ZmXFxcIiAvPlxcbiAgPC9kaXY+XFxuICBcXG4gIDxidXR0b24+UGxheSE8L2J1dHRvbj5cXG48L2Zvcm0+XFxuXCI7XG4gIH0pO1xuIiwidmFyIEhhbmRsZWJhcnMgPSByZXF1aXJlKCdoYW5kbGViYXJzLXJ1bnRpbWUnKTtcbm1vZHVsZS5leHBvcnRzID0gSGFuZGxlYmFycy50ZW1wbGF0ZShmdW5jdGlvbiAoSGFuZGxlYmFycyxkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gIHRoaXMuY29tcGlsZXJJbmZvID0gWzQsJz49IDEuMC4wJ107XG5oZWxwZXJzID0gdGhpcy5tZXJnZShoZWxwZXJzLCBIYW5kbGViYXJzLmhlbHBlcnMpOyBkYXRhID0gZGF0YSB8fCB7fTtcbiAgXG5cblxuICByZXR1cm4gXCJcXG48aDE+UHJlc3Mgc3RhcnQgdG8gam9pbiB0aGUgZ2FtZTwvaDE+XFxuXFxuPGJ1dHRvbiBpZD1cXFwiam9pblxcXCIgb250b3VjaHN0YXJ0PVxcXCJcXFwiPlN0YXJ0PC9idXR0b24+XFxuXCI7XG4gIH0pO1xuIiwidmFyIEhhbmRsZWJhcnMgPSByZXF1aXJlKCdoYW5kbGViYXJzLXJ1bnRpbWUnKTtcbm1vZHVsZS5leHBvcnRzID0gSGFuZGxlYmFycy50ZW1wbGF0ZShmdW5jdGlvbiAoSGFuZGxlYmFycyxkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gIHRoaXMuY29tcGlsZXJJbmZvID0gWzQsJz49IDEuMC4wJ107XG5oZWxwZXJzID0gdGhpcy5tZXJnZShoZWxwZXJzLCBIYW5kbGViYXJzLmhlbHBlcnMpOyBkYXRhID0gZGF0YSB8fCB7fTtcbiAgXG5cblxuICByZXR1cm4gXCJcXG48aDE+d2FpdGluZyBmb3IgMm5kIHBsYXllcjwvaDE+XFxuXFxuPGJ1dHRvbiBpZD1cXFwiY2FuY2VsXFxcIiBvbnRvdWNoc3RhcnQ9XFxcIlxcXCI+Y2FuY2VsPC9idXR0b24+XFxuXCI7XG4gIH0pO1xuIiwidmFyIEhhbmRsZWJhcnMgPSByZXF1aXJlKCdoYW5kbGViYXJzLXJ1bnRpbWUnKTtcbm1vZHVsZS5leHBvcnRzID0gSGFuZGxlYmFycy50ZW1wbGF0ZShmdW5jdGlvbiAoSGFuZGxlYmFycyxkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gIHRoaXMuY29tcGlsZXJJbmZvID0gWzQsJz49IDEuMC4wJ107XG5oZWxwZXJzID0gdGhpcy5tZXJnZShoZWxwZXJzLCBIYW5kbGViYXJzLmhlbHBlcnMpOyBkYXRhID0gZGF0YSB8fCB7fTtcbiAgXG5cblxuICByZXR1cm4gXCI8ZGl2IGNsYXNzPVxcXCJwbGF5ZXJcXFwiPlxcblxcbjxkaXYgY2xhc3M9XFxcImRldmljZS1iYWNrZ3JvdW5kXFxcIj48L2Rpdj5cXG4gXFxuICA8ZGl2IGNsYXNzPVxcXCJkZXZpY2UgY2xlYXJmaXhcXFwiPlxcbiAgICA8ZGl2IGNsYXNzPVxcXCJjb250cm9sbGVyIGNsZWFyZml4XFxcIj5cXG4gICAgICA8ZGl2IGNsYXNzPVxcXCJidXR0b25cXFwiPlxcbiAgICAgICAgPGRpdiBjbGFzcz1cXFwidXBcXFwiPjxpIGNsYXNzPVxcXCJpY29uLWNhcmV0LXVwXFxcIj48L2k+PC9kaXY+XFxuICAgICAgPC9kaXY+XFxuICAgICAgPGRpdiBjbGFzcz1cXFwiYnV0dG9uXFxcIj5cXG4gICAgICAgIDxkaXYgY2xhc3M9XFxcImRvd25cXFwiPjxpIGNsYXNzPVxcXCJpY29uLWNhcmV0LWRvd25cXFwiPjwvaT48L2Rpdj5cXG4gICAgICA8L2Rpdj5cXG4gICAgPC9kaXY+XFxuICA8L2Rpdj5cXG5cXG48L2Rpdj5cXG5cXG5cIjtcbiAgfSk7XG4iLCJ2YXIgSGFuZGxlYmFycyA9IHJlcXVpcmUoJ2hhbmRsZWJhcnMtcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICBcblxuXG4gIHJldHVybiBcIlxcbjxoMT50aGFua3MgZm9yIHBsYXlpbmc8L2gxPlxcblxcbjxwPlxcbiAgYmUgc3VyZSB0byBhc2sgYWJvdXQgd2hhdCB3ZSBkbyZoZWxsaXA7IDxiciAvPlxcbiAgYW5kIGhvdyB3ZSBidWlsdCB0aGlzIGdhbWVcXG48L3A+XFxuXCI7XG4gIH0pO1xuIiwiLypcblxuQ29weXJpZ2h0IChDKSAyMDExIGJ5IFllaHVkYSBLYXR6XG5cblBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbm9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbmluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbnRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbmNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcblxuVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbmFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG5JTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbkZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbk9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU5cblRIRSBTT0ZUV0FSRS5cblxuKi9cblxuLy8gbGliL2hhbmRsZWJhcnMvYnJvd3Nlci1wcmVmaXguanNcbnZhciBIYW5kbGViYXJzID0ge307XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnM7XG5cbihmdW5jdGlvbihIYW5kbGViYXJzLCB1bmRlZmluZWQpIHtcbjtcbi8vIGxpYi9oYW5kbGViYXJzL2Jhc2UuanNcblxuSGFuZGxlYmFycy5WRVJTSU9OID0gXCIxLjAuMFwiO1xuSGFuZGxlYmFycy5DT01QSUxFUl9SRVZJU0lPTiA9IDQ7XG5cbkhhbmRsZWJhcnMuUkVWSVNJT05fQ0hBTkdFUyA9IHtcbiAgMTogJzw9IDEuMC5yYy4yJywgLy8gMS4wLnJjLjIgaXMgYWN0dWFsbHkgcmV2MiBidXQgZG9lc24ndCByZXBvcnQgaXRcbiAgMjogJz09IDEuMC4wLXJjLjMnLFxuICAzOiAnPT0gMS4wLjAtcmMuNCcsXG4gIDQ6ICc+PSAxLjAuMCdcbn07XG5cbkhhbmRsZWJhcnMuaGVscGVycyAgPSB7fTtcbkhhbmRsZWJhcnMucGFydGlhbHMgPSB7fTtcblxudmFyIHRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZyxcbiAgICBmdW5jdGlvblR5cGUgPSAnW29iamVjdCBGdW5jdGlvbl0nLFxuICAgIG9iamVjdFR5cGUgPSAnW29iamVjdCBPYmplY3RdJztcblxuSGFuZGxlYmFycy5yZWdpc3RlckhlbHBlciA9IGZ1bmN0aW9uKG5hbWUsIGZuLCBpbnZlcnNlKSB7XG4gIGlmICh0b1N0cmluZy5jYWxsKG5hbWUpID09PSBvYmplY3RUeXBlKSB7XG4gICAgaWYgKGludmVyc2UgfHwgZm4pIHsgdGhyb3cgbmV3IEhhbmRsZWJhcnMuRXhjZXB0aW9uKCdBcmcgbm90IHN1cHBvcnRlZCB3aXRoIG11bHRpcGxlIGhlbHBlcnMnKTsgfVxuICAgIEhhbmRsZWJhcnMuVXRpbHMuZXh0ZW5kKHRoaXMuaGVscGVycywgbmFtZSk7XG4gIH0gZWxzZSB7XG4gICAgaWYgKGludmVyc2UpIHsgZm4ubm90ID0gaW52ZXJzZTsgfVxuICAgIHRoaXMuaGVscGVyc1tuYW1lXSA9IGZuO1xuICB9XG59O1xuXG5IYW5kbGViYXJzLnJlZ2lzdGVyUGFydGlhbCA9IGZ1bmN0aW9uKG5hbWUsIHN0cikge1xuICBpZiAodG9TdHJpbmcuY2FsbChuYW1lKSA9PT0gb2JqZWN0VHlwZSkge1xuICAgIEhhbmRsZWJhcnMuVXRpbHMuZXh0ZW5kKHRoaXMucGFydGlhbHMsICBuYW1lKTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLnBhcnRpYWxzW25hbWVdID0gc3RyO1xuICB9XG59O1xuXG5IYW5kbGViYXJzLnJlZ2lzdGVySGVscGVyKCdoZWxwZXJNaXNzaW5nJywgZnVuY3Rpb24oYXJnKSB7XG4gIGlmKGFyZ3VtZW50cy5sZW5ndGggPT09IDIpIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcihcIk1pc3NpbmcgaGVscGVyOiAnXCIgKyBhcmcgKyBcIidcIik7XG4gIH1cbn0pO1xuXG5IYW5kbGViYXJzLnJlZ2lzdGVySGVscGVyKCdibG9ja0hlbHBlck1pc3NpbmcnLCBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gIHZhciBpbnZlcnNlID0gb3B0aW9ucy5pbnZlcnNlIHx8IGZ1bmN0aW9uKCkge30sIGZuID0gb3B0aW9ucy5mbjtcblxuICB2YXIgdHlwZSA9IHRvU3RyaW5nLmNhbGwoY29udGV4dCk7XG5cbiAgaWYodHlwZSA9PT0gZnVuY3Rpb25UeXBlKSB7IGNvbnRleHQgPSBjb250ZXh0LmNhbGwodGhpcyk7IH1cblxuICBpZihjb250ZXh0ID09PSB0cnVlKSB7XG4gICAgcmV0dXJuIGZuKHRoaXMpO1xuICB9IGVsc2UgaWYoY29udGV4dCA9PT0gZmFsc2UgfHwgY29udGV4dCA9PSBudWxsKSB7XG4gICAgcmV0dXJuIGludmVyc2UodGhpcyk7XG4gIH0gZWxzZSBpZih0eXBlID09PSBcIltvYmplY3QgQXJyYXldXCIpIHtcbiAgICBpZihjb250ZXh0Lmxlbmd0aCA+IDApIHtcbiAgICAgIHJldHVybiBIYW5kbGViYXJzLmhlbHBlcnMuZWFjaChjb250ZXh0LCBvcHRpb25zKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGludmVyc2UodGhpcyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBmbihjb250ZXh0KTtcbiAgfVxufSk7XG5cbkhhbmRsZWJhcnMuSyA9IGZ1bmN0aW9uKCkge307XG5cbkhhbmRsZWJhcnMuY3JlYXRlRnJhbWUgPSBPYmplY3QuY3JlYXRlIHx8IGZ1bmN0aW9uKG9iamVjdCkge1xuICBIYW5kbGViYXJzLksucHJvdG90eXBlID0gb2JqZWN0O1xuICB2YXIgb2JqID0gbmV3IEhhbmRsZWJhcnMuSygpO1xuICBIYW5kbGViYXJzLksucHJvdG90eXBlID0gbnVsbDtcbiAgcmV0dXJuIG9iajtcbn07XG5cbkhhbmRsZWJhcnMubG9nZ2VyID0ge1xuICBERUJVRzogMCwgSU5GTzogMSwgV0FSTjogMiwgRVJST1I6IDMsIGxldmVsOiAzLFxuXG4gIG1ldGhvZE1hcDogezA6ICdkZWJ1ZycsIDE6ICdpbmZvJywgMjogJ3dhcm4nLCAzOiAnZXJyb3InfSxcblxuICAvLyBjYW4gYmUgb3ZlcnJpZGRlbiBpbiB0aGUgaG9zdCBlbnZpcm9ubWVudFxuICBsb2c6IGZ1bmN0aW9uKGxldmVsLCBvYmopIHtcbiAgICBpZiAoSGFuZGxlYmFycy5sb2dnZXIubGV2ZWwgPD0gbGV2ZWwpIHtcbiAgICAgIHZhciBtZXRob2QgPSBIYW5kbGViYXJzLmxvZ2dlci5tZXRob2RNYXBbbGV2ZWxdO1xuICAgICAgaWYgKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJyAmJiBjb25zb2xlW21ldGhvZF0pIHtcbiAgICAgICAgY29uc29sZVttZXRob2RdLmNhbGwoY29uc29sZSwgb2JqKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbkhhbmRsZWJhcnMubG9nID0gZnVuY3Rpb24obGV2ZWwsIG9iaikgeyBIYW5kbGViYXJzLmxvZ2dlci5sb2cobGV2ZWwsIG9iaik7IH07XG5cbkhhbmRsZWJhcnMucmVnaXN0ZXJIZWxwZXIoJ2VhY2gnLCBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gIHZhciBmbiA9IG9wdGlvbnMuZm4sIGludmVyc2UgPSBvcHRpb25zLmludmVyc2U7XG4gIHZhciBpID0gMCwgcmV0ID0gXCJcIiwgZGF0YTtcblxuICB2YXIgdHlwZSA9IHRvU3RyaW5nLmNhbGwoY29udGV4dCk7XG4gIGlmKHR5cGUgPT09IGZ1bmN0aW9uVHlwZSkgeyBjb250ZXh0ID0gY29udGV4dC5jYWxsKHRoaXMpOyB9XG5cbiAgaWYgKG9wdGlvbnMuZGF0YSkge1xuICAgIGRhdGEgPSBIYW5kbGViYXJzLmNyZWF0ZUZyYW1lKG9wdGlvbnMuZGF0YSk7XG4gIH1cblxuICBpZihjb250ZXh0ICYmIHR5cGVvZiBjb250ZXh0ID09PSAnb2JqZWN0Jykge1xuICAgIGlmKGNvbnRleHQgaW5zdGFuY2VvZiBBcnJheSl7XG4gICAgICBmb3IodmFyIGogPSBjb250ZXh0Lmxlbmd0aDsgaTxqOyBpKyspIHtcbiAgICAgICAgaWYgKGRhdGEpIHsgZGF0YS5pbmRleCA9IGk7IH1cbiAgICAgICAgcmV0ID0gcmV0ICsgZm4oY29udGV4dFtpXSwgeyBkYXRhOiBkYXRhIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBmb3IodmFyIGtleSBpbiBjb250ZXh0KSB7XG4gICAgICAgIGlmKGNvbnRleHQuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgIGlmKGRhdGEpIHsgZGF0YS5rZXkgPSBrZXk7IH1cbiAgICAgICAgICByZXQgPSByZXQgKyBmbihjb250ZXh0W2tleV0sIHtkYXRhOiBkYXRhfSk7XG4gICAgICAgICAgaSsrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYoaSA9PT0gMCl7XG4gICAgcmV0ID0gaW52ZXJzZSh0aGlzKTtcbiAgfVxuXG4gIHJldHVybiByZXQ7XG59KTtcblxuSGFuZGxlYmFycy5yZWdpc3RlckhlbHBlcignaWYnLCBmdW5jdGlvbihjb25kaXRpb25hbCwgb3B0aW9ucykge1xuICB2YXIgdHlwZSA9IHRvU3RyaW5nLmNhbGwoY29uZGl0aW9uYWwpO1xuICBpZih0eXBlID09PSBmdW5jdGlvblR5cGUpIHsgY29uZGl0aW9uYWwgPSBjb25kaXRpb25hbC5jYWxsKHRoaXMpOyB9XG5cbiAgaWYoIWNvbmRpdGlvbmFsIHx8IEhhbmRsZWJhcnMuVXRpbHMuaXNFbXB0eShjb25kaXRpb25hbCkpIHtcbiAgICByZXR1cm4gb3B0aW9ucy5pbnZlcnNlKHRoaXMpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBvcHRpb25zLmZuKHRoaXMpO1xuICB9XG59KTtcblxuSGFuZGxlYmFycy5yZWdpc3RlckhlbHBlcigndW5sZXNzJywgZnVuY3Rpb24oY29uZGl0aW9uYWwsIG9wdGlvbnMpIHtcbiAgcmV0dXJuIEhhbmRsZWJhcnMuaGVscGVyc1snaWYnXS5jYWxsKHRoaXMsIGNvbmRpdGlvbmFsLCB7Zm46IG9wdGlvbnMuaW52ZXJzZSwgaW52ZXJzZTogb3B0aW9ucy5mbn0pO1xufSk7XG5cbkhhbmRsZWJhcnMucmVnaXN0ZXJIZWxwZXIoJ3dpdGgnLCBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gIHZhciB0eXBlID0gdG9TdHJpbmcuY2FsbChjb250ZXh0KTtcbiAgaWYodHlwZSA9PT0gZnVuY3Rpb25UeXBlKSB7IGNvbnRleHQgPSBjb250ZXh0LmNhbGwodGhpcyk7IH1cblxuICBpZiAoIUhhbmRsZWJhcnMuVXRpbHMuaXNFbXB0eShjb250ZXh0KSkgcmV0dXJuIG9wdGlvbnMuZm4oY29udGV4dCk7XG59KTtcblxuSGFuZGxlYmFycy5yZWdpc3RlckhlbHBlcignbG9nJywgZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICB2YXIgbGV2ZWwgPSBvcHRpb25zLmRhdGEgJiYgb3B0aW9ucy5kYXRhLmxldmVsICE9IG51bGwgPyBwYXJzZUludChvcHRpb25zLmRhdGEubGV2ZWwsIDEwKSA6IDE7XG4gIEhhbmRsZWJhcnMubG9nKGxldmVsLCBjb250ZXh0KTtcbn0pO1xuO1xuLy8gbGliL2hhbmRsZWJhcnMvdXRpbHMuanNcblxudmFyIGVycm9yUHJvcHMgPSBbJ2Rlc2NyaXB0aW9uJywgJ2ZpbGVOYW1lJywgJ2xpbmVOdW1iZXInLCAnbWVzc2FnZScsICduYW1lJywgJ251bWJlcicsICdzdGFjayddO1xuXG5IYW5kbGViYXJzLkV4Y2VwdGlvbiA9IGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgdmFyIHRtcCA9IEVycm9yLnByb3RvdHlwZS5jb25zdHJ1Y3Rvci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXG4gIC8vIFVuZm9ydHVuYXRlbHkgZXJyb3JzIGFyZSBub3QgZW51bWVyYWJsZSBpbiBDaHJvbWUgKGF0IGxlYXN0KSwgc28gYGZvciBwcm9wIGluIHRtcGAgZG9lc24ndCB3b3JrLlxuICBmb3IgKHZhciBpZHggPSAwOyBpZHggPCBlcnJvclByb3BzLmxlbmd0aDsgaWR4KyspIHtcbiAgICB0aGlzW2Vycm9yUHJvcHNbaWR4XV0gPSB0bXBbZXJyb3JQcm9wc1tpZHhdXTtcbiAgfVxufTtcbkhhbmRsZWJhcnMuRXhjZXB0aW9uLnByb3RvdHlwZSA9IG5ldyBFcnJvcigpO1xuXG4vLyBCdWlsZCBvdXQgb3VyIGJhc2ljIFNhZmVTdHJpbmcgdHlwZVxuSGFuZGxlYmFycy5TYWZlU3RyaW5nID0gZnVuY3Rpb24oc3RyaW5nKSB7XG4gIHRoaXMuc3RyaW5nID0gc3RyaW5nO1xufTtcbkhhbmRsZWJhcnMuU2FmZVN0cmluZy5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuc3RyaW5nLnRvU3RyaW5nKCk7XG59O1xuXG52YXIgZXNjYXBlID0ge1xuICBcIiZcIjogXCImYW1wO1wiLFxuICBcIjxcIjogXCImbHQ7XCIsXG4gIFwiPlwiOiBcIiZndDtcIixcbiAgJ1wiJzogXCImcXVvdDtcIixcbiAgXCInXCI6IFwiJiN4Mjc7XCIsXG4gIFwiYFwiOiBcIiYjeDYwO1wiXG59O1xuXG52YXIgYmFkQ2hhcnMgPSAvWyY8PlwiJ2BdL2c7XG52YXIgcG9zc2libGUgPSAvWyY8PlwiJ2BdLztcblxudmFyIGVzY2FwZUNoYXIgPSBmdW5jdGlvbihjaHIpIHtcbiAgcmV0dXJuIGVzY2FwZVtjaHJdIHx8IFwiJmFtcDtcIjtcbn07XG5cbkhhbmRsZWJhcnMuVXRpbHMgPSB7XG4gIGV4dGVuZDogZnVuY3Rpb24ob2JqLCB2YWx1ZSkge1xuICAgIGZvcih2YXIga2V5IGluIHZhbHVlKSB7XG4gICAgICBpZih2YWx1ZS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgIG9ialtrZXldID0gdmFsdWVba2V5XTtcbiAgICAgIH1cbiAgICB9XG4gIH0sXG5cbiAgZXNjYXBlRXhwcmVzc2lvbjogZnVuY3Rpb24oc3RyaW5nKSB7XG4gICAgLy8gZG9uJ3QgZXNjYXBlIFNhZmVTdHJpbmdzLCBzaW5jZSB0aGV5J3JlIGFscmVhZHkgc2FmZVxuICAgIGlmIChzdHJpbmcgaW5zdGFuY2VvZiBIYW5kbGViYXJzLlNhZmVTdHJpbmcpIHtcbiAgICAgIHJldHVybiBzdHJpbmcudG9TdHJpbmcoKTtcbiAgICB9IGVsc2UgaWYgKHN0cmluZyA9PSBudWxsIHx8IHN0cmluZyA9PT0gZmFsc2UpIHtcbiAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cblxuICAgIC8vIEZvcmNlIGEgc3RyaW5nIGNvbnZlcnNpb24gYXMgdGhpcyB3aWxsIGJlIGRvbmUgYnkgdGhlIGFwcGVuZCByZWdhcmRsZXNzIGFuZFxuICAgIC8vIHRoZSByZWdleCB0ZXN0IHdpbGwgZG8gdGhpcyB0cmFuc3BhcmVudGx5IGJlaGluZCB0aGUgc2NlbmVzLCBjYXVzaW5nIGlzc3VlcyBpZlxuICAgIC8vIGFuIG9iamVjdCdzIHRvIHN0cmluZyBoYXMgZXNjYXBlZCBjaGFyYWN0ZXJzIGluIGl0LlxuICAgIHN0cmluZyA9IHN0cmluZy50b1N0cmluZygpO1xuXG4gICAgaWYoIXBvc3NpYmxlLnRlc3Qoc3RyaW5nKSkgeyByZXR1cm4gc3RyaW5nOyB9XG4gICAgcmV0dXJuIHN0cmluZy5yZXBsYWNlKGJhZENoYXJzLCBlc2NhcGVDaGFyKTtcbiAgfSxcblxuICBpc0VtcHR5OiBmdW5jdGlvbih2YWx1ZSkge1xuICAgIGlmICghdmFsdWUgJiYgdmFsdWUgIT09IDApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gZWxzZSBpZih0b1N0cmluZy5jYWxsKHZhbHVlKSA9PT0gXCJbb2JqZWN0IEFycmF5XVwiICYmIHZhbHVlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbn07XG47XG4vLyBsaWIvaGFuZGxlYmFycy9ydW50aW1lLmpzXG5cbkhhbmRsZWJhcnMuVk0gPSB7XG4gIHRlbXBsYXRlOiBmdW5jdGlvbih0ZW1wbGF0ZVNwZWMpIHtcbiAgICAvLyBKdXN0IGFkZCB3YXRlclxuICAgIHZhciBjb250YWluZXIgPSB7XG4gICAgICBlc2NhcGVFeHByZXNzaW9uOiBIYW5kbGViYXJzLlV0aWxzLmVzY2FwZUV4cHJlc3Npb24sXG4gICAgICBpbnZva2VQYXJ0aWFsOiBIYW5kbGViYXJzLlZNLmludm9rZVBhcnRpYWwsXG4gICAgICBwcm9ncmFtczogW10sXG4gICAgICBwcm9ncmFtOiBmdW5jdGlvbihpLCBmbiwgZGF0YSkge1xuICAgICAgICB2YXIgcHJvZ3JhbVdyYXBwZXIgPSB0aGlzLnByb2dyYW1zW2ldO1xuICAgICAgICBpZihkYXRhKSB7XG4gICAgICAgICAgcHJvZ3JhbVdyYXBwZXIgPSBIYW5kbGViYXJzLlZNLnByb2dyYW0oaSwgZm4sIGRhdGEpO1xuICAgICAgICB9IGVsc2UgaWYgKCFwcm9ncmFtV3JhcHBlcikge1xuICAgICAgICAgIHByb2dyYW1XcmFwcGVyID0gdGhpcy5wcm9ncmFtc1tpXSA9IEhhbmRsZWJhcnMuVk0ucHJvZ3JhbShpLCBmbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHByb2dyYW1XcmFwcGVyO1xuICAgICAgfSxcbiAgICAgIG1lcmdlOiBmdW5jdGlvbihwYXJhbSwgY29tbW9uKSB7XG4gICAgICAgIHZhciByZXQgPSBwYXJhbSB8fCBjb21tb247XG5cbiAgICAgICAgaWYgKHBhcmFtICYmIGNvbW1vbikge1xuICAgICAgICAgIHJldCA9IHt9O1xuICAgICAgICAgIEhhbmRsZWJhcnMuVXRpbHMuZXh0ZW5kKHJldCwgY29tbW9uKTtcbiAgICAgICAgICBIYW5kbGViYXJzLlV0aWxzLmV4dGVuZChyZXQsIHBhcmFtKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmV0O1xuICAgICAgfSxcbiAgICAgIHByb2dyYW1XaXRoRGVwdGg6IEhhbmRsZWJhcnMuVk0ucHJvZ3JhbVdpdGhEZXB0aCxcbiAgICAgIG5vb3A6IEhhbmRsZWJhcnMuVk0ubm9vcCxcbiAgICAgIGNvbXBpbGVySW5mbzogbnVsbFxuICAgIH07XG5cbiAgICByZXR1cm4gZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICB2YXIgcmVzdWx0ID0gdGVtcGxhdGVTcGVjLmNhbGwoY29udGFpbmVyLCBIYW5kbGViYXJzLCBjb250ZXh0LCBvcHRpb25zLmhlbHBlcnMsIG9wdGlvbnMucGFydGlhbHMsIG9wdGlvbnMuZGF0YSk7XG5cbiAgICAgIHZhciBjb21waWxlckluZm8gPSBjb250YWluZXIuY29tcGlsZXJJbmZvIHx8IFtdLFxuICAgICAgICAgIGNvbXBpbGVyUmV2aXNpb24gPSBjb21waWxlckluZm9bMF0gfHwgMSxcbiAgICAgICAgICBjdXJyZW50UmV2aXNpb24gPSBIYW5kbGViYXJzLkNPTVBJTEVSX1JFVklTSU9OO1xuXG4gICAgICBpZiAoY29tcGlsZXJSZXZpc2lvbiAhPT0gY3VycmVudFJldmlzaW9uKSB7XG4gICAgICAgIGlmIChjb21waWxlclJldmlzaW9uIDwgY3VycmVudFJldmlzaW9uKSB7XG4gICAgICAgICAgdmFyIHJ1bnRpbWVWZXJzaW9ucyA9IEhhbmRsZWJhcnMuUkVWSVNJT05fQ0hBTkdFU1tjdXJyZW50UmV2aXNpb25dLFxuICAgICAgICAgICAgICBjb21waWxlclZlcnNpb25zID0gSGFuZGxlYmFycy5SRVZJU0lPTl9DSEFOR0VTW2NvbXBpbGVyUmV2aXNpb25dO1xuICAgICAgICAgIHRocm93IFwiVGVtcGxhdGUgd2FzIHByZWNvbXBpbGVkIHdpdGggYW4gb2xkZXIgdmVyc2lvbiBvZiBIYW5kbGViYXJzIHRoYW4gdGhlIGN1cnJlbnQgcnVudGltZS4gXCIrXG4gICAgICAgICAgICAgICAgXCJQbGVhc2UgdXBkYXRlIHlvdXIgcHJlY29tcGlsZXIgdG8gYSBuZXdlciB2ZXJzaW9uIChcIitydW50aW1lVmVyc2lvbnMrXCIpIG9yIGRvd25ncmFkZSB5b3VyIHJ1bnRpbWUgdG8gYW4gb2xkZXIgdmVyc2lvbiAoXCIrY29tcGlsZXJWZXJzaW9ucytcIikuXCI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVXNlIHRoZSBlbWJlZGRlZCB2ZXJzaW9uIGluZm8gc2luY2UgdGhlIHJ1bnRpbWUgZG9lc24ndCBrbm93IGFib3V0IHRoaXMgcmV2aXNpb24geWV0XG4gICAgICAgICAgdGhyb3cgXCJUZW1wbGF0ZSB3YXMgcHJlY29tcGlsZWQgd2l0aCBhIG5ld2VyIHZlcnNpb24gb2YgSGFuZGxlYmFycyB0aGFuIHRoZSBjdXJyZW50IHJ1bnRpbWUuIFwiK1xuICAgICAgICAgICAgICAgIFwiUGxlYXNlIHVwZGF0ZSB5b3VyIHJ1bnRpbWUgdG8gYSBuZXdlciB2ZXJzaW9uIChcIitjb21waWxlckluZm9bMV0rXCIpLlwiO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfSxcblxuICBwcm9ncmFtV2l0aERlcHRoOiBmdW5jdGlvbihpLCBmbiwgZGF0YSAvKiwgJGRlcHRoICovKSB7XG4gICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDMpO1xuXG4gICAgdmFyIHByb2dyYW0gPSBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAgICAgcmV0dXJuIGZuLmFwcGx5KHRoaXMsIFtjb250ZXh0LCBvcHRpb25zLmRhdGEgfHwgZGF0YV0uY29uY2F0KGFyZ3MpKTtcbiAgICB9O1xuICAgIHByb2dyYW0ucHJvZ3JhbSA9IGk7XG4gICAgcHJvZ3JhbS5kZXB0aCA9IGFyZ3MubGVuZ3RoO1xuICAgIHJldHVybiBwcm9ncmFtO1xuICB9LFxuICBwcm9ncmFtOiBmdW5jdGlvbihpLCBmbiwgZGF0YSkge1xuICAgIHZhciBwcm9ncmFtID0gZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICAgIHJldHVybiBmbihjb250ZXh0LCBvcHRpb25zLmRhdGEgfHwgZGF0YSk7XG4gICAgfTtcbiAgICBwcm9ncmFtLnByb2dyYW0gPSBpO1xuICAgIHByb2dyYW0uZGVwdGggPSAwO1xuICAgIHJldHVybiBwcm9ncmFtO1xuICB9LFxuICBub29wOiBmdW5jdGlvbigpIHsgcmV0dXJuIFwiXCI7IH0sXG4gIGludm9rZVBhcnRpYWw6IGZ1bmN0aW9uKHBhcnRpYWwsIG5hbWUsIGNvbnRleHQsIGhlbHBlcnMsIHBhcnRpYWxzLCBkYXRhKSB7XG4gICAgdmFyIG9wdGlvbnMgPSB7IGhlbHBlcnM6IGhlbHBlcnMsIHBhcnRpYWxzOiBwYXJ0aWFscywgZGF0YTogZGF0YSB9O1xuXG4gICAgaWYocGFydGlhbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICB0aHJvdyBuZXcgSGFuZGxlYmFycy5FeGNlcHRpb24oXCJUaGUgcGFydGlhbCBcIiArIG5hbWUgKyBcIiBjb3VsZCBub3QgYmUgZm91bmRcIik7XG4gICAgfSBlbHNlIGlmKHBhcnRpYWwgaW5zdGFuY2VvZiBGdW5jdGlvbikge1xuICAgICAgcmV0dXJuIHBhcnRpYWwoY29udGV4dCwgb3B0aW9ucyk7XG4gICAgfSBlbHNlIGlmICghSGFuZGxlYmFycy5jb21waWxlKSB7XG4gICAgICB0aHJvdyBuZXcgSGFuZGxlYmFycy5FeGNlcHRpb24oXCJUaGUgcGFydGlhbCBcIiArIG5hbWUgKyBcIiBjb3VsZCBub3QgYmUgY29tcGlsZWQgd2hlbiBydW5uaW5nIGluIHJ1bnRpbWUtb25seSBtb2RlXCIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBwYXJ0aWFsc1tuYW1lXSA9IEhhbmRsZWJhcnMuY29tcGlsZShwYXJ0aWFsLCB7ZGF0YTogZGF0YSAhPT0gdW5kZWZpbmVkfSk7XG4gICAgICByZXR1cm4gcGFydGlhbHNbbmFtZV0oY29udGV4dCwgb3B0aW9ucyk7XG4gICAgfVxuICB9XG59O1xuXG5IYW5kbGViYXJzLnRlbXBsYXRlID0gSGFuZGxlYmFycy5WTS50ZW1wbGF0ZTtcbjtcbi8vIGxpYi9oYW5kbGViYXJzL2Jyb3dzZXItc3VmZml4LmpzXG59KShIYW5kbGViYXJzKTtcbjtcbiIsIihmdW5jdGlvbihnbG9iYWwpe3JlcXVpcmUoXCIuL3J4Lm1pbi5qc1wiKShnbG9iYWwpO1xyXG5yZXF1aXJlKFwiLi9yeC5hZ2dyZWdhdGVzLm1pbi5qc1wiKShnbG9iYWwpO1xyXG5yZXF1aXJlKFwiLi9yeC5jb2luY2lkZW5jZS5taW4uanNcIikoZ2xvYmFsKTtcclxucmVxdWlyZShcIi4vcnguam9pbnBhdHRlcm5zLm1pbi5qc1wiKShnbG9iYWwpO1xyXG5yZXF1aXJlKFwiLi9yeC50aW1lLm1pbi5qc1wiKShnbG9iYWwpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBSeFxyXG5cbn0pKHdpbmRvdykiLCIvKlxuIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiAgQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiBUaGlzIGNvZGUgaXMgbGljZW5zZWQgYnkgTWljcm9zb2Z0IENvcnBvcmF0aW9uIHVuZGVyIHRoZSB0ZXJtc1xuIG9mIHRoZSBNSUNST1NPRlQgUkVBQ1RJVkUgRVhURU5TSU9OUyBGT1IgSkFWQVNDUklQVCBBTkQgLk5FVCBMSUJSQVJJRVMgTGljZW5zZS5cbiBTZWUgaHR0cDovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSUQ9MjIwNzYyLlxuKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oeCxuKXt2YXIgbSxpYT1mdW5jdGlvbigpe30sSj1mdW5jdGlvbigpe3JldHVybihuZXcgRGF0ZSkuZ2V0VGltZSgpfSxWPWZ1bmN0aW9uKGEsYil7cmV0dXJuIGE9PT1ifSxRPWZ1bmN0aW9uKGEpe3JldHVybiBhfSxXPWZ1bmN0aW9uKGEpe3JldHVybiBhLnRvU3RyaW5nKCl9LFg9T2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eSxvPWZ1bmN0aW9uKGEsYil7ZnVuY3Rpb24gYygpe3RoaXMuY29uc3RydWN0b3I9YX1mb3IodmFyIGQgaW4gYilYLmNhbGwoYixkKSYmKGFbZF09YltkXSk7Yy5wcm90b3R5cGU9Yi5wcm90b3R5cGU7YS5wcm90b3R5cGU9bmV3IGM7YS5iYXNlPWIucHJvdG90eXBlO3JldHVybiBhfSxFPWZ1bmN0aW9uKGEsYil7Zm9yKHZhciBjIGluIGIpWC5jYWxsKGIsYykmJihhW2NdPWJbY10pfSx5PUFycmF5LnByb3RvdHlwZS5zbGljZSxLPVwiT2JqZWN0IGhhcyBiZWVuIGRpc3Bvc2VkXCI7bT14LlJ4PXtJbnRlcm5hbHM6e319O20uVkVSU0lPTj1cIjEuMC4xMDYyMVwiO3ZhciBqYT1mdW5jdGlvbihhLGIpe3JldHVybiBpKGZ1bmN0aW9uKGMpe3JldHVybiBuZXcgcChiLmdldERpc3Bvc2FibGUoKSxhLnN1YnNjcmliZShjKSl9KX0sRj1mdW5jdGlvbihhLGIsYyl7cmV0dXJuIGkoZnVuY3Rpb24oZCl7dmFyIGU9bmV3IHYsZz1uZXcgdixkPWMoZCxlLGcpO2UuZGlzcG9zYWJsZShhLm1hdGVyaWFsaXplKCkuc2VsZWN0KGZ1bmN0aW9uKGIpe3JldHVybntzd2l0Y2hWYWx1ZTpmdW5jdGlvbihhKXtyZXR1cm4gYShiKX19fSkuc3Vic2NyaWJlKGQpKTtnLmRpc3Bvc2FibGUoYi5tYXRlcmlhbGl6ZSgpLnNlbGVjdChmdW5jdGlvbihiKXtyZXR1cm57c3dpdGNoVmFsdWU6ZnVuY3Rpb24oYSxjKXtyZXR1cm4gYyhiKX19fSkuc3Vic2NyaWJlKGQpKTtyZXR1cm4gbmV3IHAoZSxnKX0pfSx1PW0uSW50ZXJuYWxzLkxpc3Q9XG5mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYil7dGhpcy5jb21wYXJlcj1ifHxWO3RoaXMuc2l6ZT0wO3RoaXMuaXRlbXM9W119YS5mcm9tQXJyYXk9ZnVuY3Rpb24oYixjKXt2YXIgZCxlPWIubGVuZ3RoLGc9bmV3IGEoYyk7Zm9yKGQ9MDtkPGU7ZCsrKWcuYWRkKGJbZF0pO3JldHVybiBnfTthLnByb3RvdHlwZS5jb3VudD1mdW5jdGlvbigpe3JldHVybiB0aGlzLnNpemV9O2EucHJvdG90eXBlLmFkZD1mdW5jdGlvbihiKXt0aGlzLml0ZW1zW3RoaXMuc2l6ZV09Yjt0aGlzLnNpemUrK307YS5wcm90b3R5cGUucmVtb3ZlQXQ9ZnVuY3Rpb24oYil7aWYoMD5ifHxiPj10aGlzLnNpemUpdGhyb3cgRXJyb3IoXCJBcmd1bWVudCBvdXQgb2YgcmFuZ2VcIik7MD09PWI/dGhpcy5pdGVtcy5zaGlmdCgpOnRoaXMuaXRlbXMuc3BsaWNlKGIsMSk7dGhpcy5zaXplLS19O2EucHJvdG90eXBlLmluZGV4T2Y9ZnVuY3Rpb24oYil7dmFyIGEsZDtmb3IoYT0wO2E8dGhpcy5pdGVtcy5sZW5ndGg7YSsrKWlmKGQ9XG50aGlzLml0ZW1zW2FdLHRoaXMuY29tcGFyZXIoYixkKSlyZXR1cm4gYTtyZXR1cm4tMX07YS5wcm90b3R5cGUucmVtb3ZlPWZ1bmN0aW9uKGIpe2I9dGhpcy5pbmRleE9mKGIpO2lmKC0xPT09YilyZXR1cm4hMTt0aGlzLnJlbW92ZUF0KGIpO3JldHVybiEwfTthLnByb3RvdHlwZS5jbGVhcj1mdW5jdGlvbigpe3RoaXMuaXRlbXM9W107dGhpcy5zaXplPTB9O2EucHJvdG90eXBlLml0ZW09ZnVuY3Rpb24oYixhKXtpZigwPmJ8fGI+PWNvdW50KXRocm93IEVycm9yKFwiQXJndW1lbnQgb3V0IG9mIHJhbmdlXCIpO2lmKGE9PT1uKXJldHVybiB0aGlzLml0ZW1zW2JdO3RoaXMuaXRlbXNbYl09YX07YS5wcm90b3R5cGUudG9BcnJheT1mdW5jdGlvbigpe3ZhciBiPVtdLGE7Zm9yKGE9MDthPHRoaXMuaXRlbXMubGVuZ3RoO2ErKyliLnB1c2godGhpcy5pdGVtc1thXSk7cmV0dXJuIGJ9O2EucHJvdG90eXBlLmNvbnRhaW5zPWZ1bmN0aW9uKGIpe2Zvcih2YXIgYT0wO2E8dGhpcy5pdGVtcy5sZW5ndGg7YSsrKWlmKHRoaXMuY29tcGFyZXIoYixcbnRoaXMuaXRlbXNbYV0pKXJldHVybiEwO3JldHVybiExfTtyZXR1cm4gYX0oKSxrYT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYixhKXt0aGlzLmlkPWI7dGhpcy52YWx1ZT1hfWEucHJvdG90eXBlLmNvbXBhcmVUbz1mdW5jdGlvbihiKXt2YXIgYT10aGlzLnZhbHVlLmNvbXBhcmVUbyhiLnZhbHVlKTswPT09YSYmKGE9dGhpcy5pZC1iLmlkKTtyZXR1cm4gYX07cmV0dXJuIGF9KCksWT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYil7dGhpcy5pdGVtcz1BcnJheShiKTt0aGlzLnNpemU9MH1hLnByb3RvdHlwZS5jb3VudD1mdW5jdGlvbigpe3JldHVybiB0aGlzLnNpemV9O2EucHJvdG90eXBlLmlzSGlnaGVyUHJpb3JpdHk9ZnVuY3Rpb24oYixhKXtyZXR1cm4gMD50aGlzLml0ZW1zW2JdLmNvbXBhcmVUbyh0aGlzLml0ZW1zW2FdKX07YS5wcm90b3R5cGUucGVyY29sYXRlPWZ1bmN0aW9uKGIpe3ZhciBhLGQ7aWYoIShiPj10aGlzLnNpemV8fDA+YikpaWYoYT1NYXRoLmZsb29yKChiLTEpL1xuMiksISgwPmF8fGE9PT1iKSYmdGhpcy5pc0hpZ2hlclByaW9yaXR5KGIsYSkpZD10aGlzLml0ZW1zW2JdLHRoaXMuaXRlbXNbYl09dGhpcy5pdGVtc1thXSx0aGlzLml0ZW1zW2FdPWQsdGhpcy5wZXJjb2xhdGUoYSl9O2EucHJvdG90eXBlLmhlYXBpZnk9ZnVuY3Rpb24oYil7dmFyIGEsZCxlO2I9PT1uJiYoYj0wKTtiPj10aGlzLnNpemV8fDA+Ynx8KGQ9MipiKzEsZT0yKmIrMixhPWIsZDx0aGlzLnNpemUmJnRoaXMuaXNIaWdoZXJQcmlvcml0eShkLGEpJiYoYT1kKSxlPHRoaXMuc2l6ZSYmdGhpcy5pc0hpZ2hlclByaW9yaXR5KGUsYSkmJihhPWUpLGEhPT1iJiYoZD10aGlzLml0ZW1zW2JdLHRoaXMuaXRlbXNbYl09dGhpcy5pdGVtc1thXSx0aGlzLml0ZW1zW2FdPWQsdGhpcy5oZWFwaWZ5KGEpKSl9O2EucHJvdG90eXBlLnBlZWs9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5pdGVtc1swXS52YWx1ZX07YS5wcm90b3R5cGUucmVtb3ZlQXQ9ZnVuY3Rpb24oYil7dGhpcy5pdGVtc1tiXT1cbnRoaXMuaXRlbXNbLS10aGlzLnNpemVdO2RlbGV0ZSB0aGlzLml0ZW1zW3RoaXMuc2l6ZV07dGhpcy5oZWFwaWZ5KCk7aWYodGhpcy5zaXplPHRoaXMuaXRlbXMubGVuZ3RoPj4yKWZvcih2YXIgYj10aGlzLml0ZW1zLGE9dGhpcy5pdGVtcz1BcnJheSh0aGlzLml0ZW1zLmxlbmd0aD4+MSksZD10aGlzLnNpemU7MDxkOylhW2QrMC0xXT1iW2QrMC0xXSxkLS19O2EucHJvdG90eXBlLmRlcXVldWU9ZnVuY3Rpb24oKXt2YXIgYj10aGlzLnBlZWsoKTt0aGlzLnJlbW92ZUF0KDApO3JldHVybiBifTthLnByb3RvdHlwZS5lbnF1ZXVlPWZ1bmN0aW9uKGIpe3ZhciBjO2lmKHRoaXMuc2l6ZT49dGhpcy5pdGVtcy5sZW5ndGgpe2M9dGhpcy5pdGVtcztmb3IodmFyIGQ9dGhpcy5pdGVtcz1BcnJheSgyKnRoaXMuaXRlbXMubGVuZ3RoKSxlPWMubGVuZ3RoOzA8ZTspZFtlKzAtMV09Y1tlKzAtMV0sZS0tfWM9dGhpcy5zaXplKys7dGhpcy5pdGVtc1tjXT1uZXcga2EoYS5jb3VudCsrLGIpO3RoaXMucGVyY29sYXRlKGMpfTtcbmEucHJvdG90eXBlLnJlbW92ZT1mdW5jdGlvbihiKXt2YXIgYTtmb3IoYT0wO2E8dGhpcy5zaXplO2ErKylpZih0aGlzLml0ZW1zW2FdLnZhbHVlPT09YilyZXR1cm4gdGhpcy5yZW1vdmVBdChhKSwhMDtyZXR1cm4hMX07YS5jb3VudD0wO3JldHVybiBhfSgpLHA9bS5Db21wb3NpdGVEaXNwb3NhYmxlPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYSgpe3ZhciBiPSExLGE9dS5mcm9tQXJyYXkoeS5jYWxsKGFyZ3VtZW50cykpO3RoaXMuY291bnQ9ZnVuY3Rpb24oKXtyZXR1cm4gYS5jb3VudCgpfTt0aGlzLmFkZD1mdW5jdGlvbihkKXtiP2QuZGlzcG9zZSgpOmEuYWRkKGQpfTt0aGlzLnJlbW92ZT1mdW5jdGlvbihkKXt2YXIgZT0hMTtifHwoZT1hLnJlbW92ZShkKSk7ZSYmZC5kaXNwb3NlKCk7cmV0dXJuIGV9O3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe3ZhciBkLGU7Ynx8KGI9ITAsZD1hLnRvQXJyYXkoKSxhLmNsZWFyKCkpO2lmKGQhPT1uKWZvcihlPTA7ZTxkLmxlbmd0aDtlKyspZFtlXS5kaXNwb3NlKCl9O1xudGhpcy5jbGVhcj1mdW5jdGlvbigpe3ZhciBiLGU7Yj1hLnRvQXJyYXkoKTthLmNsZWFyKCk7Zm9yKGU9MDtlPGIubGVuZ3RoO2UrKyliW2VdLmRpc3Bvc2UoKX07dGhpcy5jb250YWlucz1mdW5jdGlvbihiKXtyZXR1cm4gYS5jb250YWlucyhiKX07dGhpcy5pc0Rpc3Bvc2VkPWZ1bmN0aW9uKCl7cmV0dXJuIGJ9O3RoaXMudG9BcnJheT1mdW5jdGlvbigpe3JldHVybiBhLnRvQXJyYXkoKX19YS5wcm90b3R5cGUuY291bnQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5jb3VudCgpfTthLnByb3RvdHlwZS5hZGQ9ZnVuY3Rpb24oYil7dGhpcy5hZGQoYil9O2EucHJvdG90eXBlLnJlbW92ZT1mdW5jdGlvbihiKXt0aGlzLnJlbW92ZShiKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe3RoaXMuZGlzcG9zZSgpfTthLnByb3RvdHlwZS5jbGVhcj1mdW5jdGlvbigpe3RoaXMuY2xlYXIoKX07YS5wcm90b3R5cGUuY29udGFpbnM9ZnVuY3Rpb24oYil7cmV0dXJuIHRoaXMuY29udGFpbnMoYil9O1xuYS5wcm90b3R5cGUuaXNEaXNwb3NlZD1mdW5jdGlvbigpe3JldHVybiB0aGlzLmlzRGlzcG9zZWQoKX07YS5wcm90b3R5cGUudG9BcnJheT1mdW5jdGlvbigpe3JldHVybiB0aGlzLnRvQXJyYXkoKX07cmV0dXJuIGF9KCksTD1tLkRpc3Bvc2FibGU9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGIpe3ZhciBhPSExO3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe2F8fChiKCksYT0hMCl9fWEucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXt0aGlzLmRpc3Bvc2UoKX07cmV0dXJuIGF9KCksQT1MLmNyZWF0ZT1mdW5jdGlvbihhKXtyZXR1cm4gbmV3IEwoYSl9LHc9TC5lbXB0eT1uZXcgTChmdW5jdGlvbigpe30pLHY9bS5TaW5nbGVBc3NpZ25tZW50RGlzcG9zYWJsZT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXt2YXIgYj0hMSxhPW51bGw7dGhpcy5pc0Rpc3Bvc2VkPWZ1bmN0aW9uKCl7cmV0dXJuIGJ9O3RoaXMuZ2V0RGlzcG9zYWJsZT1mdW5jdGlvbigpe3JldHVybiBhfTt0aGlzLnNldERpc3Bvc2FibGU9XG5mdW5jdGlvbihkKXtpZihudWxsIT09YSl0aHJvdyBFcnJvcihcIkRpc3Bvc2FibGUgaGFzIGFscmVhZHkgYmVlbiBhc3NpZ25lZFwiKTt2YXIgZT1iO2V8fChhPWQpO2UmJm51bGwhPT1kJiZkLmRpc3Bvc2UoKX07dGhpcy5kaXNwb3NlPWZ1bmN0aW9uKCl7dmFyIGQ9bnVsbDtifHwoYj0hMCxkPWEsYT1udWxsKTtudWxsIT09ZCYmZC5kaXNwb3NlKCl9fWEucHJvdG90eXBlLmlzRGlzcG9zZWQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5pc0Rpc3Bvc2VkKCl9O2EucHJvdG90eXBlLmRpc3Bvc2FibGU9ZnVuY3Rpb24oYil7aWYoYj09PW4pcmV0dXJuIHRoaXMuZ2V0RGlzcG9zYWJsZSgpO3RoaXMuc2V0RGlzcG9zYWJsZShiKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe3RoaXMuZGlzcG9zZSgpfTtyZXR1cm4gYX0oKSxDPW0uU2VyaWFsRGlzcG9zYWJsZT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXt2YXIgYj0hMSxhPW51bGw7dGhpcy5pc0Rpc3Bvc2VkPWZ1bmN0aW9uKCl7cmV0dXJuIGJ9O1xudGhpcy5nZXREaXNwb3NhYmxlPWZ1bmN0aW9uKCl7cmV0dXJuIGF9O3RoaXMuc2V0RGlzcG9zYWJsZT1mdW5jdGlvbihkKXt2YXIgZT1iLGc9bnVsbDtlfHwoZz1hLGE9ZCk7bnVsbCE9PWcmJmcuZGlzcG9zZSgpO2UmJm51bGwhPT1kJiZkLmRpc3Bvc2UoKX07dGhpcy5kaXNwb3NlPWZ1bmN0aW9uKCl7dmFyIGQ9bnVsbDtifHwoYj0hMCxkPWEsYT1udWxsKTtudWxsIT09ZCYmZC5kaXNwb3NlKCl9fWEucHJvdG90eXBlLmlzRGlzcG9zZWQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5pc0Rpc3Bvc2VkKCl9O2EucHJvdG90eXBlLmRpc3Bvc2FibGU9ZnVuY3Rpb24oYSl7aWYoYT09PW4pcmV0dXJuIHRoaXMuZ2V0RGlzcG9zYWJsZSgpO3RoaXMuc2V0RGlzcG9zYWJsZShhKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe3RoaXMuZGlzcG9zZSgpfTthLnByb3RvdHlwZS5kaXNwb3NlPWZ1bmN0aW9uKCl7dGhpcy5kaXNwb3NlKCl9O3JldHVybiBhfSgpLFo9bS5SZWZDb3VudERpc3Bvc2FibGU9XG5mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYSl7dmFyIGM9ITEsZD0hMSxlPTA7dGhpcy5kaXNwb3NlPWZ1bmN0aW9uKCl7dmFyIGc9ITE7IWMmJiFkJiYoZD0hMCwwPT09ZSYmKGc9Yz0hMCkpO2cmJmEuZGlzcG9zZSgpfTt0aGlzLmdldERpc3Bvc2FibGU9ZnVuY3Rpb24oKXtpZihjKXJldHVybiB3O2UrKzt2YXIgZz0hMTtyZXR1cm57ZGlzcG9zZTpmdW5jdGlvbigpe3ZhciBoPSExOyFjJiYhZyYmKGc9ITAsZS0tLDA9PT1lJiZkJiYoaD1jPSEwKSk7aCYmYS5kaXNwb3NlKCl9fX07dGhpcy5pc0Rpc3Bvc2VkPWZ1bmN0aW9uKCl7cmV0dXJuIGN9fWEucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXt0aGlzLmRpc3Bvc2UoKX07YS5wcm90b3R5cGUuZ2V0RGlzcG9zYWJsZT1mdW5jdGlvbigpe3JldHVybiB0aGlzLmdldERpc3Bvc2FibGUoKX07YS5wcm90b3R5cGUuaXNEaXNwb3NlZD1mdW5jdGlvbigpe3JldHVybiB0aGlzLmlzRGlzcG9zZWQoKX07cmV0dXJuIGF9KCksUjtSPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShhLFxuYyxkLGUsZyl7dGhpcy5zY2hlZHVsZXI9YTt0aGlzLnN0YXRlPWM7dGhpcy5hY3Rpb249ZDt0aGlzLmR1ZVRpbWU9ZTt0aGlzLmNvbXBhcmVyPWd8fGZ1bmN0aW9uKGEsYil7cmV0dXJuIGEtYn07dGhpcy5kaXNwb3NhYmxlPW5ldyB2fWEucHJvdG90eXBlLmludm9rZT1mdW5jdGlvbigpe3JldHVybiB0aGlzLmRpc3Bvc2FibGUuZGlzcG9zYWJsZSh0aGlzLmludm9rZUNvcmUoKSl9O2EucHJvdG90eXBlLmNvbXBhcmVUbz1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5jb21wYXJlcih0aGlzLmR1ZVRpbWUsYS5kdWVUaW1lKX07YS5wcm90b3R5cGUuaXNDYW5jZWxsZWQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5kaXNwb3NhYmxlLmlzRGlzcG9zZWQoKX07YS5wcm90b3R5cGUuaW52b2tlQ29yZT1mdW5jdGlvbigpe3JldHVybiB0aGlzLmFjdGlvbih0aGlzLnNjaGVkdWxlcix0aGlzLnN0YXRlKX07cmV0dXJuIGF9KCk7dmFyIHM9bS5TY2hlZHVsZXI9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGEsXG5iLGMsZCl7dGhpcy5ub3c9YTt0aGlzLl9zY2hlZHVsZT1iO3RoaXMuX3NjaGVkdWxlUmVsYXRpdmU9Yzt0aGlzLl9zY2hlZHVsZUFic29sdXRlPWR9dmFyIGI9ZnVuY3Rpb24oYSxiKXt2YXIgYyxkLGUsaztkPW5ldyBwO2s9Yi5maXJzdDtjPWIuc2Vjb25kO2U9bnVsbDtlPWZ1bmN0aW9uKGIpe2MoYixmdW5jdGlvbihiKXt2YXIgYyxoLGw7bD1oPSExO2M9bnVsbDtjPWEuc2NoZWR1bGVXaXRoU3RhdGUoYixmdW5jdGlvbihhLGIpe2g/ZC5yZW1vdmUoYyk6bD0hMDtlKGIpO3JldHVybiB3fSk7bHx8KGQuYWRkKGMpLGg9ITApfSl9O2Uoayk7cmV0dXJuIGR9LGM9ZnVuY3Rpb24oYSxiKXt2YXIgYyxkLGUsaztkPW5ldyBwO2s9Yi5maXJzdDtjPWIuc2Vjb25kO2U9ZnVuY3Rpb24oYil7YyhiLGZ1bmN0aW9uKGIsYyl7dmFyIGgsbCxrO2s9bD0hMTtoPWEuc2NoZWR1bGVXaXRoUmVsYXRpdmVBbmRTdGF0ZShiLGMsZnVuY3Rpb24oYSxiKXtsP2QucmVtb3ZlKGgpOms9ITA7ZShiKTtyZXR1cm4gd30pO1xua3x8KGQuYWRkKGgpLGw9ITApfSl9O2Uoayk7cmV0dXJuIGR9LGQ9ZnVuY3Rpb24oYSxiKXt2YXIgYyxkLGUsaztkPW5ldyBwO2s9Yi5maXJzdDtjPWIuc2Vjb25kO2U9ZnVuY3Rpb24oYil7YyhiLGZ1bmN0aW9uKGIsYyl7dmFyIGg9ITEsbD0hMSxrPWEuc2NoZWR1bGVXaXRoQWJzb2x1dGVBbmRTdGF0ZShiLGMsZnVuY3Rpb24oYSxiKXtoP2QucmVtb3ZlKGspOmw9ITA7ZShiKTtyZXR1cm4gd30pO2x8fChkLmFkZChrKSxoPSEwKX0pfTtlKGspO3JldHVybiBkfSxlPWZ1bmN0aW9uKGEsYil7YigpO3JldHVybiB3fTthLnByb3RvdHlwZS5zY2hlZHVsZT1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5fc2NoZWR1bGUoYSxlKX07YS5wcm90b3R5cGUuc2NoZWR1bGVXaXRoU3RhdGU9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gdGhpcy5fc2NoZWR1bGUoYSxiKX07YS5wcm90b3R5cGUuc2NoZWR1bGVXaXRoUmVsYXRpdmU9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gdGhpcy5fc2NoZWR1bGVSZWxhdGl2ZShiLFxuYSxlKX07YS5wcm90b3R5cGUuc2NoZWR1bGVXaXRoUmVsYXRpdmVBbmRTdGF0ZT1mdW5jdGlvbihhLGIsYyl7cmV0dXJuIHRoaXMuX3NjaGVkdWxlUmVsYXRpdmUoYSxiLGMpfTthLnByb3RvdHlwZS5zY2hlZHVsZVdpdGhBYnNvbHV0ZT1mdW5jdGlvbihhLGIpe3JldHVybiB0aGlzLl9zY2hlZHVsZUFic29sdXRlKGIsYSxlKX07YS5wcm90b3R5cGUuc2NoZWR1bGVXaXRoQWJzb2x1dGVBbmRTdGF0ZT1mdW5jdGlvbihhLGIsYyl7cmV0dXJuIHRoaXMuX3NjaGVkdWxlQWJzb2x1dGUoYSxiLGMpfTthLnByb3RvdHlwZS5zY2hlZHVsZVJlY3Vyc2l2ZT1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhTdGF0ZShhLGZ1bmN0aW9uKGEsYil7YShmdW5jdGlvbigpe2IoYSl9KX0pfTthLnByb3RvdHlwZS5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhTdGF0ZT1mdW5jdGlvbihhLGMpe3JldHVybiB0aGlzLnNjaGVkdWxlV2l0aFN0YXRlKHtmaXJzdDphLHNlY29uZDpjfSxcbmZ1bmN0aW9uKGEsYyl7cmV0dXJuIGIoYSxjKX0pfTthLnByb3RvdHlwZS5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhSZWxhdGl2ZT1mdW5jdGlvbihhLGIpe3JldHVybiB0aGlzLnNjaGVkdWxlUmVjdXJzaXZlV2l0aFJlbGF0aXZlQW5kU3RhdGUoYixhLGZ1bmN0aW9uKGEsYil7YShmdW5jdGlvbihjKXtiKGEsYyl9KX0pfTthLnByb3RvdHlwZS5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhSZWxhdGl2ZUFuZFN0YXRlPWZ1bmN0aW9uKGEsYixkKXtyZXR1cm4gdGhpcy5fc2NoZWR1bGVSZWxhdGl2ZSh7Zmlyc3Q6YSxzZWNvbmQ6ZH0sYixmdW5jdGlvbihhLGIpe3JldHVybiBjKGEsYil9KX07YS5wcm90b3R5cGUuc2NoZWR1bGVSZWN1cnNpdmVXaXRoQWJzb2x1dGU9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gdGhpcy5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhBYnNvbHV0ZUFuZFN0YXRlKGIsYSxmdW5jdGlvbihhLGIpe2EoZnVuY3Rpb24oYyl7YihhLGMpfSl9KX07YS5wcm90b3R5cGUuc2NoZWR1bGVSZWN1cnNpdmVXaXRoQWJzb2x1dGVBbmRTdGF0ZT1cbmZ1bmN0aW9uKGEsYixjKXtyZXR1cm4gdGhpcy5fc2NoZWR1bGVBYnNvbHV0ZSh7Zmlyc3Q6YSxzZWNvbmQ6Y30sYixmdW5jdGlvbihhLGIpe3JldHVybiBkKGEsYil9KX07YS5ub3c9SjthLm5vcm1hbGl6ZT1mdW5jdGlvbihhKXswPmEmJihhPTApO3JldHVybiBhfTtyZXR1cm4gYX0oKSxmPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYSgpe3ZhciBiPXRoaXM7YS5iYXNlLmNvbnN0cnVjdG9yLmNhbGwodGhpcyxKLGZ1bmN0aW9uKGEsZCl7cmV0dXJuIGQoYixhKX0sZnVuY3Rpb24oYSxkLGUpe2Zvcig7MDxzLm5vcm1hbGl6ZShkKTspO3JldHVybiBlKGIsYSl9LGZ1bmN0aW9uKGEsZCxlKXtyZXR1cm4gYi5zY2hlZHVsZVdpdGhSZWxhdGl2ZUFuZFN0YXRlKGEsZC1iLm5vdygpLGUpfSl9byhhLHMpO3JldHVybiBhfSgpLEI9cy5JbW1lZGlhdGU9bmV3IGYsbGE9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKCl7TS5xdWV1ZT1uZXcgWSg0KX1hLnByb3RvdHlwZS5kaXNwb3NlPWZ1bmN0aW9uKCl7TS5xdWV1ZT1cbm51bGx9O2EucHJvdG90eXBlLnJ1bj1mdW5jdGlvbigpe2Zvcih2YXIgYSxjPU0ucXVldWU7MDxjLmNvdW50KCk7KWlmKGE9Yy5kZXF1ZXVlKCksIWEuaXNDYW5jZWxsZWQoKSl7Zm9yKDswPGEuZHVlVGltZS1zLm5vdygpOyk7YS5pc0NhbmNlbGxlZCgpfHxhLmludm9rZSgpfX07cmV0dXJuIGF9KCksTT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXt2YXIgYj10aGlzO2EuYmFzZS5jb25zdHJ1Y3Rvci5jYWxsKHRoaXMsSixmdW5jdGlvbihhLGQpe3JldHVybiBiLnNjaGVkdWxlV2l0aFJlbGF0aXZlQW5kU3RhdGUoYSwwLGQpfSxmdW5jdGlvbihjLGQsZSl7dmFyIGc9Yi5ub3coKStzLm5vcm1hbGl6ZShkKSxkPWEucXVldWUsYz1uZXcgUihiLGMsZSxnKTtpZihudWxsPT09ZCl7ZT1uZXcgbGE7dHJ5e2EucXVldWUuZW5xdWV1ZShjKSxlLnJ1bigpfWZpbmFsbHl7ZS5kaXNwb3NlKCl9fWVsc2UgZC5lbnF1ZXVlKGMpO3JldHVybiBjLmRpc3Bvc2FibGV9LGZ1bmN0aW9uKGEsZCxlKXtyZXR1cm4gYi5zY2hlZHVsZVdpdGhSZWxhdGl2ZUFuZFN0YXRlKGEsXG5kLWIubm93KCksZSl9KX1vKGEscyk7YS5wcm90b3R5cGUuc2NoZWR1bGVSZXF1aXJlZD1mdW5jdGlvbigpe3JldHVybiBudWxsPT09YS5xdWV1ZX07YS5wcm90b3R5cGUuZW5zdXJlVHJhbXBvbGluZT1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5zY2hlZHVsZVJlcXVpcmVkKCk/dGhpcy5zY2hlZHVsZShhKTphKCl9O2EucXVldWU9bnVsbDtyZXR1cm4gYX0oKSxEPXMuQ3VycmVudFRocmVhZD1uZXcgTTttLlZpcnR1YWxUaW1lU2NoZWR1bGVyPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShiLGMpe3ZhciBkPXRoaXM7dGhpcy5jbG9jaz1iO3RoaXMuY29tcGFyZXI9Yzt0aGlzLmlzRW5hYmxlZD0hMTthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzLGZ1bmN0aW9uKCl7cmV0dXJuIGQudG9EYXRlVGltZU9mZnNldChkLmNsb2NrKX0sZnVuY3Rpb24oYSxiKXtyZXR1cm4gZC5zY2hlZHVsZUFic29sdXRlKGEsZC5jbG9jayxiKX0sZnVuY3Rpb24oYSxiLGMpe3JldHVybiBkLnNjaGVkdWxlUmVsYXRpdmUoYSxcbmQudG9SZWxhdGl2ZShiKSxjKX0sZnVuY3Rpb24oYSxiLGMpe3JldHVybiBkLnNjaGVkdWxlUmVsYXRpdmUoYSxkLnRvUmVsYXRpdmUoYi1kLm5vdygpKSxjKX0pO3RoaXMucXVldWU9bmV3IFkoMTAyNCl9byhhLHMpO2EucHJvdG90eXBlLnNjaGVkdWxlUmVsYXRpdmU9ZnVuY3Rpb24oYSxjLGQpe2M9dGhpcy5hZGQodGhpcy5jbG9jayxjKTtyZXR1cm4gdGhpcy5zY2hlZHVsZUFic29sdXRlKGEsYyxkKX07YS5wcm90b3R5cGUuc3RhcnQ9ZnVuY3Rpb24oKXt2YXIgYTtpZighdGhpcy5pc0VuYWJsZWQpe3RoaXMuaXNFbmFibGVkPSEwO2RvIGlmKGE9dGhpcy5nZXROZXh0KCksbnVsbCE9PWEpe2lmKDA8dGhpcy5jb21wYXJlcihhLmR1ZVRpbWUsdGhpcy5jbG9jaykpdGhpcy5jbG9jaz1hLmR1ZVRpbWU7YS5pbnZva2UoKX1lbHNlIHRoaXMuaXNFbmFibGVkPSExO3doaWxlKHRoaXMuaXNFbmFibGVkKX19O2EucHJvdG90eXBlLnN0b3A9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5pc0VuYWJsZWQ9XG4hMX07YS5wcm90b3R5cGUuYWR2YW5jZVRvPWZ1bmN0aW9uKGEpe3ZhciBjO2lmKDA8PXRoaXMuY29tcGFyZXIodGhpcy5jbG9jayxhKSl0aHJvdyBFcnJvcihcIkFyZ3VtZW50IG91dCBvZiByYW5nZVwiKTtpZighdGhpcy5pc0VuYWJsZWQpe3RoaXMuaXNFbmFibGVkPSEwO2RvIGlmKGM9dGhpcy5nZXROZXh0KCksbnVsbCE9PWMmJjA+PXRoaXMuY29tcGFyZXIoYy5kdWVUaW1lLGEpKXtpZigwPHRoaXMuY29tcGFyZXIoYy5kdWVUaW1lLHRoaXMuY2xvY2spKXRoaXMuY2xvY2s9Yy5kdWVUaW1lO2MuaW52b2tlKCl9ZWxzZSB0aGlzLmlzRW5hYmxlZD0hMTt3aGlsZSh0aGlzLmlzRW5hYmxlZCk7cmV0dXJuIHRoaXMuY2xvY2s9YX19O2EucHJvdG90eXBlLmFkdmFuY2VCeT1mdW5jdGlvbihhKXthPXRoaXMuYWRkKHRoaXMuY2xvY2ssYSk7aWYoMDw9dGhpcy5jb21wYXJlcih0aGlzLmNsb2NrLGEpKXRocm93IEVycm9yKFwiQXJndW1lbnQgb3V0IG9mIHJhbmdlXCIpO3JldHVybiB0aGlzLmFkdmFuY2VUbyhhKX07XG5hLnByb3RvdHlwZS5nZXROZXh0PWZ1bmN0aW9uKCl7Zm9yKHZhciBhOzA8dGhpcy5xdWV1ZS5jb3VudCgpOylpZihhPXRoaXMucXVldWUucGVlaygpLGEuaXNDYW5jZWxsZWQoKSl0aGlzLnF1ZXVlLmRlcXVldWUoKTtlbHNlIHJldHVybiBhO3JldHVybiBudWxsfTthLnByb3RvdHlwZS5zY2hlZHVsZUFic29sdXRlPWZ1bmN0aW9uKGEsYyxkKXt2YXIgZT10aGlzLGc9bmV3IFIoZSxhLGZ1bmN0aW9uKGEsYil7ZS5xdWV1ZS5yZW1vdmUoZyk7cmV0dXJuIGQoYSxiKX0sYyxlLmNvbXBhcmVyKTtlLnF1ZXVlLmVucXVldWUoZyk7cmV0dXJuIGcuZGlzcG9zYWJsZX07cmV0dXJuIGF9KCk7dmFyIGY9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKCl7dmFyIGI9dGhpczthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzLEosZnVuY3Rpb24oYSxkKXt2YXIgZT14LnNldFRpbWVvdXQoZnVuY3Rpb24oKXtkKGIsYSl9LDApO3JldHVybiBBKGZ1bmN0aW9uKCl7eC5jbGVhclRpbWVvdXQoZSl9KX0sZnVuY3Rpb24oYSxcbmQsZSl7dmFyIGcsZD1zLm5vcm1hbGl6ZShkKTtnPXguc2V0VGltZW91dChmdW5jdGlvbigpe2UoYixhKX0sZCk7cmV0dXJuIEEoZnVuY3Rpb24oKXt4LmNsZWFyVGltZW91dChnKX0pfSxmdW5jdGlvbihhLGQsZSl7cmV0dXJuIGIuc2NoZWR1bGVXaXRoUmVsYXRpdmVBbmRTdGF0ZShhLGQtYi5ub3coKSxlKX0pfW8oYSxzKTtyZXR1cm4gYX0oKSxtYT1zLlRpbWVvdXQ9bmV3IGYsdD1tLk5vdGlmaWNhdGlvbj1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXt9YS5wcm90b3R5cGUuYWNjZXB0PWZ1bmN0aW9uKGEsYyxkKXtyZXR1cm4gMTxhcmd1bWVudHMubGVuZ3RofHxcImZ1bmN0aW9uXCI9PT10eXBlb2YgYT90aGlzLl9hY2NlcHQoYSxjLGQpOnRoaXMuX2FjY2VwdE9ic2VydmFibGUoYSl9O2EucHJvdG90eXBlLnRvT2JzZXJ2YWJsZT1mdW5jdGlvbihhKXt2YXIgYz10aGlzLGE9YXx8cy5JbW1lZGlhdGU7cmV0dXJuIGkoZnVuY3Rpb24oZCl7cmV0dXJuIGEuc2NoZWR1bGUoZnVuY3Rpb24oKXtjLl9hY2NlcHRPYnNlcnZhYmxlKGQpO1xuaWYoXCJOXCI9PT1jLmtpbmQpZC5vbkNvbXBsZXRlZCgpfSl9KX07YS5wcm90b3R5cGUuaGFzVmFsdWU9ITE7YS5wcm90b3R5cGUuZXF1YWxzPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLnRvU3RyaW5nKCk9PT0oYT09PW58fG51bGw9PT1hP1wiXCI6YS50b1N0cmluZygpKX07cmV0dXJuIGF9KCk7dC5jcmVhdGVPbk5leHQ9ZnVuY3Rpb24oYSl7dmFyIGI9bmV3IHQ7Yi52YWx1ZT1hO2IuaGFzVmFsdWU9ITA7Yi5raW5kPVwiTlwiO2IuX2FjY2VwdD1mdW5jdGlvbihhKXtyZXR1cm4gYSh0aGlzLnZhbHVlKX07Yi5fYWNjZXB0T2JzZXJ2YWJsZT1mdW5jdGlvbihhKXtyZXR1cm4gYS5vbk5leHQodGhpcy52YWx1ZSl9O2IudG9TdHJpbmc9ZnVuY3Rpb24oKXtyZXR1cm5cIk9uTmV4dChcIit0aGlzLnZhbHVlK1wiKVwifTtyZXR1cm4gYn07dC5jcmVhdGVPbkVycm9yPWZ1bmN0aW9uKGEpe3ZhciBiPW5ldyB0O2IuZXhjZXB0aW9uPWE7Yi5raW5kPVwiRVwiO2IuX2FjY2VwdD1mdW5jdGlvbihhLGIpe3JldHVybiBiKHRoaXMuZXhjZXB0aW9uKX07XG5iLl9hY2NlcHRPYnNlcnZhYmxlPWZ1bmN0aW9uKGEpe3JldHVybiBhLm9uRXJyb3IodGhpcy5leGNlcHRpb24pfTtiLnRvU3RyaW5nPWZ1bmN0aW9uKCl7cmV0dXJuXCJPbkVycm9yKFwiK3RoaXMuZXhjZXB0aW9uK1wiKVwifTtyZXR1cm4gYn07dC5jcmVhdGVPbkNvbXBsZXRlZD1mdW5jdGlvbigpe3ZhciBhPW5ldyB0O2Eua2luZD1cIkNcIjthLl9hY2NlcHQ9ZnVuY3Rpb24oYSxjLGQpe3JldHVybiBkKCl9O2EuX2FjY2VwdE9ic2VydmFibGU9ZnVuY3Rpb24oYSl7cmV0dXJuIGEub25Db21wbGV0ZWQoKX07YS50b1N0cmluZz1mdW5jdGlvbigpe3JldHVyblwiT25Db21wbGV0ZWQoKVwifTtyZXR1cm4gYX07dmFyIEc9ZnVuY3Rpb24oKXt9LGY9Ry5wcm90b3R5cGU7Zi5jb25jYXQ9ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGIpe3ZhciBjLGQ9YS5nZXRFbnVtZXJhdG9yKCksZT0hMSxnPW5ldyBDO2M9Qi5zY2hlZHVsZVJlY3Vyc2l2ZShmdW5jdGlvbihhKXt2YXIgYyxcbnoscT0hMTtpZighZSl7dHJ5e2lmKHE9ZC5tb3ZlTmV4dCgpKWM9ZC5jdXJyZW50fWNhdGNoKGspe3o9a31pZih2b2lkIDAhPT16KWIub25FcnJvcih6KTtlbHNlIGlmKHEpej1uZXcgdixnLmRpc3Bvc2FibGUoeiksei5kaXNwb3NhYmxlKGMuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2Iub25OZXh0KGEpfSxmdW5jdGlvbihhKXtiLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7YSgpfSkpO2Vsc2UgYi5vbkNvbXBsZXRlZCgpfX0pO3JldHVybiBuZXcgcChnLGMsQShmdW5jdGlvbigpe2U9ITB9KSl9KX07Zi5jYXRjaEV4Y2VwdGlvbj1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYil7dmFyIGMsZD1hLmdldEVudW1lcmF0b3IoKSxlPSExLGcsaDtnPW5ldyBDO2M9Qi5zY2hlZHVsZVJlY3Vyc2l2ZShmdW5jdGlvbihhKXt2YXIgYyxxLGs7az0hMTtpZighZSl7dHJ5e2lmKGs9ZC5tb3ZlTmV4dCgpKWM9ZC5jdXJyZW50fWNhdGNoKGYpe3E9Zn1pZih2b2lkIDAhPT1xKWIub25FcnJvcihxKTtcbmVsc2UgaWYoaylxPW5ldyB2LGcuZGlzcG9zYWJsZShxKSxxLmRpc3Bvc2FibGUoYy5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7Yi5vbk5leHQoYSl9LGZ1bmN0aW9uKGIpe2g9YjthKCl9LGZ1bmN0aW9uKCl7Yi5vbkNvbXBsZXRlZCgpfSkpO2Vsc2UgaWYodm9pZCAwIT09aCliLm9uRXJyb3IoaCk7ZWxzZSBiLm9uQ29tcGxldGVkKCl9fSk7cmV0dXJuIG5ldyBwKGcsYyxBKGZ1bmN0aW9uKCl7ZT0hMH0pKX0pfTt2YXIgJD1HLnJlcGVhdD1mdW5jdGlvbihhLGIpe2I9PT1uJiYoYj0tMSk7dmFyIGM9bmV3IEc7Yy5nZXRFbnVtZXJhdG9yPWZ1bmN0aW9uKCl7cmV0dXJue2xlZnQ6YixjdXJyZW50Om51bGwsbW92ZU5leHQ6ZnVuY3Rpb24oKXtpZigwPT09dGhpcy5sZWZ0KXJldHVybiB0aGlzLmN1cnJlbnQ9bnVsbCwhMTswPHRoaXMubGVmdCYmdGhpcy5sZWZ0LS07dGhpcy5jdXJyZW50PWE7cmV0dXJuITB9fX07cmV0dXJuIGN9LFM9Ry5mb3JFbnVtZXJhdG9yPWZ1bmN0aW9uKGEpe3ZhciBiPVxubmV3IEc7Yi5nZXRFbnVtZXJhdG9yPWZ1bmN0aW9uKCl7cmV0dXJue19pbmRleDotMSxjdXJyZW50Om51bGwsbW92ZU5leHQ6ZnVuY3Rpb24oKXtpZigrK3RoaXMuX2luZGV4PGEubGVuZ3RoKXJldHVybiB0aGlzLmN1cnJlbnQ9YVt0aGlzLl9pbmRleF0sITA7dGhpcy5faW5kZXg9LTE7dGhpcy5jdXJyZW50PW51bGw7cmV0dXJuITF9fX07cmV0dXJuIGJ9LHI9bS5PYnNlcnZlcj1mdW5jdGlvbigpe30sVD1tLkludGVybmFscy5BYnN0cmFjdE9ic2VydmVyPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYSgpe3RoaXMuaXNTdG9wcGVkPSExfW8oYSxyKTthLnByb3RvdHlwZS5vbk5leHQ9ZnVuY3Rpb24oYSl7dGhpcy5pc1N0b3BwZWR8fHRoaXMubmV4dChhKX07YS5wcm90b3R5cGUub25FcnJvcj1mdW5jdGlvbihhKXtpZighdGhpcy5pc1N0b3BwZWQpdGhpcy5pc1N0b3BwZWQ9ITAsdGhpcy5lcnJvcihhKX07YS5wcm90b3R5cGUub25Db21wbGV0ZWQ9ZnVuY3Rpb24oKXtpZighdGhpcy5pc1N0b3BwZWQpdGhpcy5pc1N0b3BwZWQ9XG4hMCx0aGlzLmNvbXBsZXRlZCgpfTthLnByb3RvdHlwZS5kaXNwb3NlPWZ1bmN0aW9uKCl7dGhpcy5pc1N0b3BwZWQ9ITB9O3JldHVybiBhfSgpLE49ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGIsYyxkKXthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzKTt0aGlzLl9vbk5leHQ9Yjt0aGlzLl9vbkVycm9yPWM7dGhpcy5fb25Db21wbGV0ZWQ9ZH1vKGEsVCk7YS5wcm90b3R5cGUubmV4dD1mdW5jdGlvbihhKXt0aGlzLl9vbk5leHQoYSl9O2EucHJvdG90eXBlLmVycm9yPWZ1bmN0aW9uKGEpe3RoaXMuX29uRXJyb3IoYSl9O2EucHJvdG90eXBlLmNvbXBsZXRlZD1mdW5jdGlvbigpe3RoaXMuX29uQ29tcGxldGVkKCl9O3JldHVybiBhfSgpLEg9bS5JbnRlcm5hbHMuQmluYXJ5T2JzZXJ2ZXI9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGEsYyl7XCJmdW5jdGlvblwiPT09dHlwZW9mIGEmJlwiZnVuY3Rpb25cIj09PXR5cGVvZiBjPyh0aGlzLmxlZnRPYnNlcnZlcj1hYShhKSx0aGlzLnJpZ2h0T2JzZXJ2ZXI9XG5hYShjKSk6KHRoaXMubGVmdE9ic2VydmVyPWEsdGhpcy5yaWdodE9ic2VydmVyPWMpfW8oYSxyKTthLnByb3RvdHlwZS5vbk5leHQ9ZnVuY3Rpb24oYSl7dmFyIGM9dGhpcztyZXR1cm4gYS5zd2l0Y2hWYWx1ZShmdW5jdGlvbihhKXtyZXR1cm4gYS5hY2NlcHQoYy5sZWZ0T2JzZXJ2ZXIpfSxmdW5jdGlvbihhKXtyZXR1cm4gYS5hY2NlcHQoYy5yaWdodE9ic2VydmVyKX0pfTthLnByb3RvdHlwZS5vbkVycm9yPWZ1bmN0aW9uKCl7fTthLnByb3RvdHlwZS5vbkNvbXBsZXRlZD1mdW5jdGlvbigpe307cmV0dXJuIGF9KCksbmE9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGEsYyl7dGhpcy5zY2hlZHVsZXI9YTt0aGlzLm9ic2VydmVyPWM7dGhpcy5oYXNGYXVsdGVkPXRoaXMuaXNBY3F1aXJlZD0hMTt0aGlzLnF1ZXVlPVtdO3RoaXMuZGlzcG9zYWJsZT1uZXcgQ31vKGEsVCk7YS5wcm90b3R5cGUuZW5zdXJlQWN0aXZlPWZ1bmN0aW9uKCl7dmFyIGE9ITEsYz10aGlzO2lmKCF0aGlzLmhhc0ZhdWx0ZWQmJlxuMDx0aGlzLnF1ZXVlLmxlbmd0aClhPSF0aGlzLmlzQWNxdWlyZWQsdGhpcy5pc0FjcXVpcmVkPSEwO2EmJnRoaXMuZGlzcG9zYWJsZS5kaXNwb3NhYmxlKHRoaXMuc2NoZWR1bGVyLnNjaGVkdWxlUmVjdXJzaXZlKGZ1bmN0aW9uKGEpe3ZhciBiO2lmKDA8Yy5xdWV1ZS5sZW5ndGgpe2I9Yy5xdWV1ZS5zaGlmdCgpO3RyeXtiKCl9Y2F0Y2goZyl7dGhyb3cgYy5xdWV1ZT1bXSxjLmhhc0ZhdWx0ZWQ9ITAsZzt9YSgpfWVsc2UgYy5pc0FjcXVpcmVkPSExfSkpfTthLnByb3RvdHlwZS5uZXh0PWZ1bmN0aW9uKGEpe3ZhciBjPXRoaXM7dGhpcy5xdWV1ZS5wdXNoKGZ1bmN0aW9uKCl7Yy5vYnNlcnZlci5vbk5leHQoYSl9KX07YS5wcm90b3R5cGUuZXJyb3I9ZnVuY3Rpb24oYSl7dmFyIGM9dGhpczt0aGlzLnF1ZXVlLnB1c2goZnVuY3Rpb24oKXtjLm9ic2VydmVyLm9uRXJyb3IoYSl9KX07YS5wcm90b3R5cGUuY29tcGxldGVkPWZ1bmN0aW9uKCl7dmFyIGE9dGhpczt0aGlzLnF1ZXVlLnB1c2goZnVuY3Rpb24oKXthLm9ic2VydmVyLm9uQ29tcGxldGVkKCl9KX07XG5hLnByb3RvdHlwZS5kaXNwb3NlPWZ1bmN0aW9uKCl7YS5iYXNlLmRpc3Bvc2UuY2FsbCh0aGlzKTt0aGlzLmRpc3Bvc2FibGUuZGlzcG9zZSgpfTtyZXR1cm4gYX0oKSxJPXIuY3JlYXRlPWZ1bmN0aW9uKGEsYixjKXtifHwoYj1mdW5jdGlvbihhKXt0aHJvdyBhO30pO2N8fChjPWZ1bmN0aW9uKCl7fSk7cmV0dXJuIG5ldyBOKGEsYixjKX07ci5mcm9tTm90aWZpZXI9ZnVuY3Rpb24oYSl7cmV0dXJuIG5ldyBOKGZ1bmN0aW9uKGIpe3JldHVybiBhKHQuY3JlYXRlT25OZXh0KGIpKX0sZnVuY3Rpb24oYil7cmV0dXJuIGEodC5jcmVhdGVPbkVycm9yKGIpKX0sZnVuY3Rpb24oKXtyZXR1cm4gYSh0LmNyZWF0ZU9uQ29tcGxldGVkKCkpfSl9O3ZhciBhYT1mdW5jdGlvbihhKXtyZXR1cm4gbmV3IE4oZnVuY3Rpb24oYil7YSh0LmNyZWF0ZU9uTmV4dChiKSl9LGZ1bmN0aW9uKGIpe2EodC5jcmVhdGVPbkVycm9yKGIpKX0sZnVuY3Rpb24oKXthKHQuY3JlYXRlT25Db21wbGV0ZWQoKSl9KX07XG5yLnByb3RvdHlwZS50b05vdGlmaWVyPWZ1bmN0aW9uKCl7dmFyIGE9dGhpcztyZXR1cm4gZnVuY3Rpb24oYil7cmV0dXJuIGIuYWNjZXB0KGEpfX07ci5wcm90b3R5cGUuYXNPYnNlcnZlcj1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIG5ldyBOKGZ1bmN0aW9uKGIpe3JldHVybiBhLm9uTmV4dChiKX0sZnVuY3Rpb24oYil7cmV0dXJuIGEub25FcnJvcihiKX0sZnVuY3Rpb24oKXtyZXR1cm4gYS5vbkNvbXBsZXRlZCgpfSl9O3ZhciBqPW0uT2JzZXJ2YWJsZT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXt9YS5wcm90b3R5cGUuc3Vic2NyaWJlPWZ1bmN0aW9uKGEsYyxkKXtyZXR1cm4gdGhpcy5fc3Vic2NyaWJlKDA9PT1hcmd1bWVudHMubGVuZ3RofHwxPGFyZ3VtZW50cy5sZW5ndGh8fFwiZnVuY3Rpb25cIj09PXR5cGVvZiBhP0koYSxjLGQpOmEpfTtyZXR1cm4gYX0oKSxmPWoucHJvdG90eXBlLHBhPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShiKXthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzKTtcbnRoaXMuX3N1YnNjcmliZT1mdW5jdGlvbihhKXt2YXIgZD1uZXcgb2EoYSk7RC5zY2hlZHVsZVJlcXVpcmVkKCk/RC5zY2hlZHVsZShmdW5jdGlvbigpe2QuZGlzcG9zYWJsZShiKGQpKX0pOmQuZGlzcG9zYWJsZShiKGQpKTtyZXR1cm4gZH19byhhLGopO2EucHJvdG90eXBlLl9zdWJzY3JpYmU9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuX3N1YnNjcmliZShhKX07cmV0dXJuIGF9KCksb2E9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGIpe2EuYmFzZS5jb25zdHJ1Y3Rvci5jYWxsKHRoaXMpO3RoaXMub2JzZXJ2ZXI9Yjt0aGlzLm09bmV3IHZ9byhhLFQpO2EucHJvdG90eXBlLmRpc3Bvc2FibGU9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMubS5kaXNwb3NhYmxlKGEpfTthLnByb3RvdHlwZS5uZXh0PWZ1bmN0aW9uKGEpe3RoaXMub2JzZXJ2ZXIub25OZXh0KGEpfTthLnByb3RvdHlwZS5lcnJvcj1mdW5jdGlvbihhKXt0aGlzLm9ic2VydmVyLm9uRXJyb3IoYSk7dGhpcy5tLmRpc3Bvc2UoKX07XG5hLnByb3RvdHlwZS5jb21wbGV0ZWQ9ZnVuY3Rpb24oKXt0aGlzLm9ic2VydmVyLm9uQ29tcGxldGVkKCk7dGhpcy5tLmRpc3Bvc2UoKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe2EuYmFzZS5kaXNwb3NlLmNhbGwodGhpcyk7dGhpcy5tLmRpc3Bvc2UoKX07cmV0dXJuIGF9KCksYmE9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGIsYyxkKXthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzKTt0aGlzLmtleT1iO3RoaXMudW5kZXJseWluZ09ic2VydmFibGU9IWQ/YzppKGZ1bmN0aW9uKGEpe3JldHVybiBuZXcgcChkLmdldERpc3Bvc2FibGUoKSxjLnN1YnNjcmliZShhKSl9KX1vKGEsaik7YS5wcm90b3R5cGUuX3N1YnNjcmliZT1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy51bmRlcmx5aW5nT2JzZXJ2YWJsZS5zdWJzY3JpYmUoYSl9O3JldHVybiBhfSgpLHFhPW0uQ29ubmVjdGFibGVPYnNlcnZhYmxlPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShhLGMpe3ZhciBkPWEuYXNPYnNlcnZhYmxlKCksXG5lPSExLGc9bnVsbDt0aGlzLmNvbm5lY3Q9ZnVuY3Rpb24oKXtlfHwoZT0hMCxnPW5ldyBwKGQuc3Vic2NyaWJlKGMpLEEoZnVuY3Rpb24oKXtlPSExfSkpKTtyZXR1cm4gZ307dGhpcy5fc3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3JldHVybiBjLnN1YnNjcmliZShhKX19byhhLGopO2EucHJvdG90eXBlLmNvbm5lY3Q9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5jb25uZWN0KCl9O2EucHJvdG90eXBlLnJlZkNvdW50PWZ1bmN0aW9uKCl7dmFyIGE9bnVsbCxjPTAsZD10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGUpe3ZhciBnLGg7YysrO2c9MT09PWM7aD1kLnN1YnNjcmliZShlKTtnJiYoYT1kLmNvbm5lY3QoKSk7cmV0dXJuIEEoZnVuY3Rpb24oKXtoLmRpc3Bvc2UoKTtjLS07MD09PWMmJmEuZGlzcG9zZSgpfSl9KX07YS5wcm90b3R5cGUuX3N1YnNjcmliZT1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy5fc3Vic2NyaWJlKGEpfTtyZXR1cm4gYX0oKSxPPW0uU3ViamVjdD1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzKTtcbnZhciBiPSExLGM9ITEsZD1uZXcgdSxlPW4sZz1mdW5jdGlvbigpe2lmKGIpdGhyb3cgRXJyb3IoSyk7fTt0aGlzLm9uQ29tcGxldGVkPWZ1bmN0aW9uKCl7dmFyIGEsYjtnKCk7Y3x8KGE9ZC50b0FycmF5KCksZD1uZXcgdSxjPSEwKTtpZihhIT09bilmb3IoYj0wO2I8YS5sZW5ndGg7YisrKWFbYl0ub25Db21wbGV0ZWQoKX07dGhpcy5vbkVycm9yPWZ1bmN0aW9uKGEpe3ZhciBiLHo7ZygpO2N8fChiPWQudG9BcnJheSgpLGQ9bmV3IHUsYz0hMCxlPWEpO2lmKGIhPT1uKWZvcih6PTA7ejxiLmxlbmd0aDt6KyspYlt6XS5vbkVycm9yKGEpfTt0aGlzLm9uTmV4dD1mdW5jdGlvbihhKXt2YXIgYixlO2coKTtjfHwoYj1kLnRvQXJyYXkoKSk7aWYodm9pZCAwIT09Yilmb3IoZT0wO2U8Yi5sZW5ndGg7ZSsrKWJbZV0ub25OZXh0KGEpfTt0aGlzLl9zdWJzY3JpYmU9ZnVuY3Rpb24oYSl7ZygpO2lmKCFjKXJldHVybiBkLmFkZChhKSxmdW5jdGlvbihhKXtyZXR1cm57b2JzZXJ2ZXI6YSxkaXNwb3NlOmZ1bmN0aW9uKCl7aWYobnVsbCE9PVxudGhpcy5vYnNlcnZlciYmIWIpZC5yZW1vdmUodGhpcy5vYnNlcnZlciksdGhpcy5vYnNlcnZlcj1udWxsfX19KGEpO2lmKGUhPT1uKXJldHVybiBhLm9uRXJyb3IoZSksdzthLm9uQ29tcGxldGVkKCk7cmV0dXJuIHd9O3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe2I9ITA7ZD1udWxsfX1vKGEsaik7RShhLHIpO2EucHJvdG90eXBlLm9uQ29tcGxldGVkPWZ1bmN0aW9uKCl7dGhpcy5vbkNvbXBsZXRlZCgpfTthLnByb3RvdHlwZS5vbkVycm9yPWZ1bmN0aW9uKGEpe3RoaXMub25FcnJvcihhKX07YS5wcm90b3R5cGUub25OZXh0PWZ1bmN0aW9uKGEpe3RoaXMub25OZXh0KGEpfTthLnByb3RvdHlwZS5fc3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLl9zdWJzY3JpYmUoYSl9O2EucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXt0aGlzLmRpc3Bvc2UoKX07YS5jcmVhdGU9ZnVuY3Rpb24oYSxjKXtyZXR1cm4gbmV3IHJhKGEsYyl9O3JldHVybiBhfSgpLFU9bS5Bc3luY1N1YmplY3Q9XG5mdW5jdGlvbigpe2Z1bmN0aW9uIGEoKXthLmJhc2UuY29uc3RydWN0b3IuY2FsbCh0aGlzKTt2YXIgYj0hMSxjPSExLGQ9bnVsbCxlPSExLGc9bmV3IHUsaD1udWxsLGw9ZnVuY3Rpb24oKXtpZihiKXRocm93IEVycm9yKEspO307dGhpcy5vbkNvbXBsZXRlZD1mdW5jdGlvbigpe3ZhciBhPSExLGIsaCxmO2woKTtjfHwoYj1nLnRvQXJyYXkoKSxnPW5ldyB1LGM9ITAsaD1kLGE9ZSk7aWYoYiE9PW4paWYoYSlmb3IoZj0wO2Y8Yi5sZW5ndGg7ZisrKWE9YltmXSxhLm9uTmV4dChoKSxhLm9uQ29tcGxldGVkKCk7ZWxzZSBmb3IoZj0wO2Y8Yi5sZW5ndGg7ZisrKWJbZl0ub25Db21wbGV0ZWQoKX07dGhpcy5vbkVycm9yPWZ1bmN0aW9uKGEpe3ZhciBiLGQ7bCgpO2N8fChiPWcudG9BcnJheSgpLGc9bmV3IHUsYz0hMCxoPWEpO2lmKGIhPT1uKWZvcihkPTA7ZDxiLmxlbmd0aDtkKyspYltkXS5vbkVycm9yKGEpfTt0aGlzLm9uTmV4dD1mdW5jdGlvbihhKXtsKCk7Y3x8KGQ9YSxlPSEwKX07XG50aGlzLl9zdWJzY3JpYmU9ZnVuY3Rpb24oYSl7dmFyIHEsayxmO2woKTtpZighYylyZXR1cm4gZy5hZGQoYSksZnVuY3Rpb24oYSl7cmV0dXJue29ic2VydmVyOmEsZGlzcG9zZTpmdW5jdGlvbigpe2lmKG51bGwhPT10aGlzLm9ic2VydmVyJiYhYilnLnJlbW92ZSh0aGlzLm9ic2VydmVyKSx0aGlzLm9ic2VydmVyPW51bGx9fX0oYSk7cT1oO2s9ZTtmPWQ7aWYobnVsbCE9PXEpYS5vbkVycm9yKHEpO2Vsc2V7aWYoaylhLm9uTmV4dChmKTthLm9uQ29tcGxldGVkKCl9cmV0dXJuIHd9O3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe2I9ITA7ZD1oPWc9bnVsbH19byhhLGopO0UoYSxyKTthLnByb3RvdHlwZS5vbkNvbXBsZXRlZD1mdW5jdGlvbigpe3RoaXMub25Db21wbGV0ZWQoKX07YS5wcm90b3R5cGUub25FcnJvcj1mdW5jdGlvbihhKXt0aGlzLm9uRXJyb3IoYSl9O2EucHJvdG90eXBlLm9uTmV4dD1mdW5jdGlvbihhKXt0aGlzLm9uTmV4dChhKX07YS5wcm90b3R5cGUuX3N1YnNjcmliZT1cbmZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLl9zdWJzY3JpYmUoYSl9O2EucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXt0aGlzLmRpc3Bvc2UoKX07cmV0dXJuIGF9KCksUD1tLkJlaGF2aW9yU3ViamVjdD1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYil7YS5iYXNlLmNvbnN0cnVjdG9yLmNhbGwodGhpcyk7dmFyIGM9YixkPW5ldyB1LGU9ITEsZz0hMSxoPW51bGwsbD1mdW5jdGlvbigpe2lmKGUpdGhyb3cgRXJyb3IoSyk7fTt0aGlzLm9uQ29tcGxldGVkPWZ1bmN0aW9uKCl7dmFyIGEsYjthPW51bGw7bCgpO2d8fChhPWQudG9BcnJheSgpLGQ9bmV3IHUsZz0hMCk7aWYobnVsbCE9PWEpZm9yKGI9MDtiPGEubGVuZ3RoO2IrKylhW2JdLm9uQ29tcGxldGVkKCl9O3RoaXMub25FcnJvcj1mdW5jdGlvbihhKXt2YXIgYixjO2M9bnVsbDtsKCk7Z3x8KGM9ZC50b0FycmF5KCksZD1uZXcgdSxnPSEwLGg9YSk7aWYobnVsbCE9PWMpZm9yKGI9MDtiPGMubGVuZ3RoO2IrKyljW2JdLm9uRXJyb3IoYSl9O1xudGhpcy5vbk5leHQ9ZnVuY3Rpb24oYSl7dmFyIGIsZTtiPW51bGw7bCgpO2d8fChjPWEsYj1kLnRvQXJyYXkoKSk7aWYobnVsbCE9PWIpZm9yKGU9MDtlPGIubGVuZ3RoO2UrKyliW2VdLm9uTmV4dChhKX07dGhpcy5fc3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3ZhciBiO2woKTtpZighZylyZXR1cm4gZC5hZGQoYSksYS5vbk5leHQoYyksZnVuY3Rpb24oYSl7cmV0dXJue29ic2VydmVyOmEsZGlzcG9zZTpmdW5jdGlvbigpe2lmKG51bGwhPT10aGlzLm9ic2VydmVyJiYhZSlkLnJlbW92ZSh0aGlzLm9ic2VydmVyKSx0aGlzLm9ic2VydmVyPW51bGx9fX0oYSk7Yj1oO2lmKG51bGwhPT1iKWEub25FcnJvcihiKTtlbHNlIGEub25Db21wbGV0ZWQoKTtyZXR1cm4gd307dGhpcy5kaXNwb3NlPWZ1bmN0aW9uKCl7ZT0hMDtoPWM9ZD1udWxsfX1vKGEsaik7RShhLHIpO2EucHJvdG90eXBlLm9uQ29tcGxldGVkPWZ1bmN0aW9uKCl7dGhpcy5vbkNvbXBsZXRlZCgpfTthLnByb3RvdHlwZS5vbkVycm9yPVxuZnVuY3Rpb24oYSl7dGhpcy5vbkVycm9yKGEpfTthLnByb3RvdHlwZS5vbk5leHQ9ZnVuY3Rpb24oYSl7dGhpcy5vbk5leHQoYSl9O2EucHJvdG90eXBlLl9zdWJzY3JpYmU9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuX3N1YnNjcmliZShhKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe3RoaXMuZGlzcG9zZSgpfTtyZXR1cm4gYX0oKTtQLnByb3RvdHlwZS50b05vdGlmaWVyPXIucHJvdG90eXBlLnRvTm90aWZpZXI7UC5wcm90b3R5cGUuYXNPYnNlcnZlcj1yLnByb3RvdHlwZS5Bc09ic2VydmVyO3ZhciBjYT1tLlJlcGxheVN1YmplY3Q9ZnVuY3Rpb24oKXtmdW5jdGlvbiBhKGEsYyxkKXt2YXIgZT1hPT09bj9OdW1iZXIuTUFYX1ZBTFVFOmEsZz1jPT09bj9OdW1iZXIuTUFYX1ZBTFVFOmMsaD1kfHxzLmN1cnJlbnRUaHJlYWQsbD1bXSxmPW5ldyB1LHE9ITEsaz0hMSxpPWZ1bmN0aW9uKGEpe3ZhciBiPXE/MTowLGM9YitlO2ZvcihjPGUmJihjPWUpO2wubGVuZ3RoPmM7KWwuc2hpZnQoKTtcbmZvcig7bC5sZW5ndGg+YiYmYS1sWzBdLnRpbWVzdGFtcD5nOylsLnNoaWZ0KCl9LGo9ZnVuY3Rpb24oYSl7dmFyIGI9aC5ub3coKTtsLnB1c2goe3ZhbHVlOmEsdGltZXN0YW1wOmJ9KTtpKGIpfSxtPWZ1bmN0aW9uKCl7aWYoayl0aHJvdyBFcnJvcihLKTt9O3RoaXMub25OZXh0PWZ1bmN0aW9uKGEpe3ZhciBiPW51bGwsYyxkO20oKTtpZighcSl7Yj1mLnRvQXJyYXkoKTtqKHQuY3JlYXRlT25OZXh0KGEpKTtmb3IoZD0wO2Q8Yi5sZW5ndGg7ZCsrKWM9YltkXSxjLm9uTmV4dChhKX1pZihudWxsIT09Yilmb3IoZD0wO2Q8Yi5sZW5ndGg7ZCsrKWM9YltkXSxjLmVuc3VyZUFjdGl2ZSgpfTt0aGlzLm9uRXJyb3I9ZnVuY3Rpb24oYSl7dmFyIGI9bnVsbCxjO20oKTtpZighcSl7cT0hMDtqKHQuY3JlYXRlT25FcnJvcihhKSk7Yj1mLnRvQXJyYXkoKTtmb3IoYz0wO2M8Yi5sZW5ndGg7YysrKWJbY10ub25FcnJvcihhKTtmPW5ldyB1fWlmKG51bGwhPT1iKWZvcihjPTA7YzxiLmxlbmd0aDtjKyspYltjXS5lbnN1cmVBY3RpdmUoKX07XG50aGlzLm9uQ29tcGxldGVkPWZ1bmN0aW9uKCl7dmFyIGE9bnVsbCxiO20oKTtpZighcSl7cT0hMDtqKHQuY3JlYXRlT25Db21wbGV0ZWQoKSk7YT1mLnRvQXJyYXkoKTtmb3IoYj0wO2I8YS5sZW5ndGg7YisrKWFbYl0ub25Db21wbGV0ZWQoKTtmPW5ldyB1fWlmKG51bGwhPT1hKWZvcihiPTA7YjxhLmxlbmd0aDtiKyspYVtiXS5lbnN1cmVBY3RpdmUoKX07dGhpcy5fc3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3ZhciBhPW5ldyBuYShoLGEpLGI9ZnVuY3Rpb24oYSl7cmV0dXJue29ic2VydmVyOmEsZGlzcG9zZTpmdW5jdGlvbigpe3RoaXMub2JzZXJ2ZXIuZGlzcG9zZSgpO251bGwhPT10aGlzLm9ic2VydmVyJiYhayYmZi5yZW1vdmUodGhpcy5vYnNlcnZlcil9fX0oYSksYzttKCk7aShoLm5vdygpKTtmLmFkZChhKTtmb3IoYz0wO2M8bC5sZW5ndGg7YysrKWxbY10udmFsdWUuYWNjZXB0KGEpO2EuZW5zdXJlQWN0aXZlKCk7cmV0dXJuIGJ9O3RoaXMuZGlzcG9zZT1mdW5jdGlvbigpe2s9XG4hMDtmPW51bGx9fW8oYSxqKTtFKGEsaik7YS5wcm90b3R5cGUub25OZXh0PWZ1bmN0aW9uKGEpe3RoaXMub25OZXh0KGEpfTthLnByb3RvdHlwZS5vbkVycm9yPWZ1bmN0aW9uKGEpe3RoaXMub25FcnJvcihhKX07YS5wcm90b3R5cGUub25Db21wbGV0ZWQ9ZnVuY3Rpb24oKXt0aGlzLm9uQ29tcGxldGVkKCl9O2EucHJvdG90eXBlLl9zdWJzY3JpYmU9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuX3N1YnNjcmliZShhKX07YS5wcm90b3R5cGUuZGlzcG9zZT1mdW5jdGlvbigpe3RoaXMuZGlzcG9zZSgpfTtyZXR1cm4gYX0oKSxyYT1mdW5jdGlvbigpe2Z1bmN0aW9uIGEoYSxjKXt0aGlzLm9ic2VydmVyPWE7dGhpcy5vYnNlcnZhYmxlPWN9byhhLGopO0UoYSxyKTthLnByb3RvdHlwZS5vbkNvbXBsZXRlZD1mdW5jdGlvbigpe3JldHVybiB0aGlzLm9ic2VydmVyLm9uQ29tcGxldGVkKCl9O2EucHJvdG90eXBlLm9uRXJyb3I9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMub2JzZXJ2ZXIub25FcnJvcihhKX07XG5hLnByb3RvdHlwZS5vbk5leHQ9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMub2JzZXJ2ZXIub25OZXh0KGEpfTthLnByb3RvdHlwZS5fU3Vic2NyaWJlPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLm9ic2VydmFibGUuU3Vic2NyaWJlKGEpfTtyZXR1cm4gYX0oKTtqLnN0YXJ0PWZ1bmN0aW9uKGEsYixjLGQpe2N8fChjPVtdKTtyZXR1cm4gc2EoYSxkKS5hcHBseShiLGMpfTt2YXIgc2E9ai50b0FzeW5jPWZ1bmN0aW9uKGEsYil7Ynx8KGI9bWEpO3JldHVybiBmdW5jdGlvbigpe3ZhciBjPW5ldyBVLGQ9ZnVuY3Rpb24oKXt2YXIgYjt0cnl7Yj1hLmFwcGx5KHRoaXMsYXJndW1lbnRzKX1jYXRjaChkKXtjLm9uRXJyb3IoZCk7cmV0dXJufWMub25OZXh0KGIpO2Mub25Db21wbGV0ZWQoKX0sZT15LmNhbGwoYXJndW1lbnRzKSxnPXRoaXM7Yi5zY2hlZHVsZShmdW5jdGlvbigpe2QuYXBwbHkoZyxlKX0pO3JldHVybiBjfX07Zi5tdWx0aWNhc3Q9ZnVuY3Rpb24oYSxiKXt2YXIgYz10aGlzO3JldHVyblwiZnVuY3Rpb25cIj09PVxudHlwZW9mIGE/aShmdW5jdGlvbihkKXt2YXIgZT1jLm11bHRpY2FzdChhKCkpO3JldHVybiBuZXcgcChiKGUpLnN1YnNjcmliZShkKSxlLmNvbm5lY3QoKSl9KTpuZXcgcWEoYyxhKX07Zi5wdWJsaXNoPWZ1bmN0aW9uKGEpe3JldHVybiFhP3RoaXMubXVsdGljYXN0KG5ldyBPKTp0aGlzLm11bHRpY2FzdChmdW5jdGlvbigpe3JldHVybiBuZXcgT30sYSl9O2YucHVibGlzaExhc3Q9ZnVuY3Rpb24oYSl7cmV0dXJuIWE/dGhpcy5tdWx0aWNhc3QobmV3IFUpOnRoaXMubXVsdGljYXN0KGZ1bmN0aW9uKCl7cmV0dXJuIG5ldyBVfSxhKX07Zi5yZXBsYXk9ZnVuY3Rpb24oYSxiLGMsZCl7cmV0dXJuIWF8fG51bGw9PT1hP3RoaXMubXVsdGljYXN0KG5ldyBjYShiLGMsZCkpOnRoaXMubXVsdGljYXN0KGZ1bmN0aW9uKCl7cmV0dXJuIG5ldyBjYShiLGMsZCl9LGEpfTtmLnB1Ymxpc2hWYWx1ZT1mdW5jdGlvbihhLGIpe3JldHVyblwiZnVuY3Rpb25cIj09PXR5cGVvZiBhP3RoaXMubXVsdGljYXN0KGZ1bmN0aW9uKCl7cmV0dXJuIG5ldyBQKGIpfSxcbmEpOnRoaXMubXVsdGljYXN0KG5ldyBQKGEpKX07dmFyIGRhPWoubmV2ZXI9ZnVuY3Rpb24oKXtyZXR1cm4gaShmdW5jdGlvbigpe3JldHVybiB3fSl9LHRhPWouZW1wdHk9ZnVuY3Rpb24oYSl7YXx8KGE9Qik7cmV0dXJuIGkoZnVuY3Rpb24oYil7cmV0dXJuIGEuc2NoZWR1bGUoZnVuY3Rpb24oKXtyZXR1cm4gYi5vbkNvbXBsZXRlZCgpfSl9KX0sdWE9ai5yZXR1cm5WYWx1ZT1mdW5jdGlvbihhLGIpe2J8fChiPUIpO3JldHVybiBpKGZ1bmN0aW9uKGMpe3JldHVybiBiLnNjaGVkdWxlKGZ1bmN0aW9uKCl7Yy5vbk5leHQoYSk7cmV0dXJuIGMub25Db21wbGV0ZWQoKX0pfSl9LGVhPWoudGhyb3dFeGNlcHRpb249ZnVuY3Rpb24oYSxiKXtifHwoYj1CKTtyZXR1cm4gaShmdW5jdGlvbihjKXtyZXR1cm4gYi5zY2hlZHVsZShmdW5jdGlvbigpe3JldHVybiBjLm9uRXJyb3IoYSl9KX0pfSx2YT1qLmdlbmVyYXRlPWZ1bmN0aW9uKGEsYixjLGQsZSl7ZXx8KGU9RCk7cmV0dXJuIGkoZnVuY3Rpb24oZyl7dmFyIGg9XG4hMCxmPWE7cmV0dXJuIGUuc2NoZWR1bGVSZWN1cnNpdmUoZnVuY3Rpb24oYSl7dmFyIGUsazt0cnl7aD9oPSExOmY9YyhmKSwoZT1iKGYpKSYmKGs9ZChmKSl9Y2F0Y2goaSl7Zy5vbkVycm9yKGkpO3JldHVybn1pZihlKWcub25OZXh0KGspLGEoKTtlbHNlIGcub25Db21wbGV0ZWQoKX0pfSl9LGZhPWouZGVmZXI9ZnVuY3Rpb24oYSl7cmV0dXJuIGkoZnVuY3Rpb24oYil7dmFyIGM7dHJ5e2M9YSgpfWNhdGNoKGQpe3JldHVybiBlYShkKS5zdWJzY3JpYmUoYil9cmV0dXJuIGMuc3Vic2NyaWJlKGIpfSl9O2oudXNpbmc9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gaShmdW5jdGlvbihjKXt2YXIgZD13LGUsZzt0cnl7ZT1hKCksbnVsbCE9PWUmJihkPWUpLGc9YihlKX1jYXRjaChoKXtyZXR1cm4gbmV3IHAoZWEoaCkuc3Vic2NyaWJlKGMpLGQpfXJldHVybiBuZXcgcChnLnN1YnNjcmliZShjKSxkKX0pfTt2YXIgZ2E9ai5mcm9tQXJyYXk9ZnVuY3Rpb24oYSxiKXtifHwoYj1EKTtyZXR1cm4gaShmdW5jdGlvbihjKXt2YXIgZD1cbjA7cmV0dXJuIGIuc2NoZWR1bGVSZWN1cnNpdmUoZnVuY3Rpb24oYil7aWYoZDxhLmxlbmd0aCljLm9uTmV4dChhW2QrK10pLGIoKTtlbHNlIGMub25Db21wbGV0ZWQoKX0pfSl9LGk9ai5jcmVhdGVXaXRoRGlzcG9zYWJsZT1mdW5jdGlvbihhKXtyZXR1cm4gbmV3IHBhKGEpfTtqLmNyZWF0ZT1mdW5jdGlvbihhKXtyZXR1cm4gaShmdW5jdGlvbihiKXtyZXR1cm4gQShhKGIpKX0pfTtqLnJhbmdlPWZ1bmN0aW9uKGEsYixjKXtjfHwoYz1EKTt2YXIgZD1hK2ItMTtyZXR1cm4gdmEoYSxmdW5jdGlvbihhKXtyZXR1cm4gYTw9ZH0sZnVuY3Rpb24oYSl7cmV0dXJuIGErMX0sZnVuY3Rpb24oYSl7cmV0dXJuIGF9LGMpfTtmLnJlcGVhdD1mdW5jdGlvbihhKXtyZXR1cm4gJCh0aGlzLGEpLmNvbmNhdCgpfTtmLnJldHJ5PWZ1bmN0aW9uKGEpe3JldHVybiAkKHRoaXMsYSkuY2F0Y2hFeGNlcHRpb24oKX07ai5yZXBlYXQ9ZnVuY3Rpb24oYSxiLGMpe2N8fChjPUQpO2I9PT1uJiYoYj0tMSk7cmV0dXJuIHVhKGEsXG5jKS5yZXBlYXQoYil9O2Yuc2VsZWN0PWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9MDtyZXR1cm4gYi5zdWJzY3JpYmUoZnVuY3Rpb24oYil7dmFyIGc7dHJ5e2c9YShiLGQrKyl9Y2F0Y2goaCl7Yy5vbkVycm9yKGgpO3JldHVybn1jLm9uTmV4dChnKX0sZnVuY3Rpb24oYSl7Yy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2Mub25Db21wbGV0ZWQoKX0pfSl9O2Yud2hlcmU9ZnVuY3Rpb24oYSl7dmFyIGI9dGhpcztyZXR1cm4gaShmdW5jdGlvbihjKXt2YXIgZD0wO3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbihiKXt2YXIgZzt0cnl7Zz1hKGIsZCsrKX1jYXRjaChoKXtjLm9uRXJyb3IoaCk7cmV0dXJufWlmKGcpYy5vbk5leHQoYil9LGZ1bmN0aW9uKGEpe2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtjLm9uQ29tcGxldGVkKCl9KX0pfTtmLmdyb3VwQnlVbnRpbD1mdW5jdGlvbihhLGIsYyxkKXt2YXIgZT10aGlzO2J8fChiPVEpO2R8fChkPVxuVyk7cmV0dXJuIGkoZnVuY3Rpb24oZyl7dmFyIGg9e30sZj1uZXcgcCxpPW5ldyBaKGYpO2YuYWRkKGUuc3Vic2NyaWJlKGZ1bmN0aW9uKGUpe3ZhciBrLGosbSx0LG8scCx1LHMscjt0cnl7aj1hKGUpLHA9ZChqKX1jYXRjaCh3KXtmb3IociBpbiBoKWhbcl0ub25FcnJvcih3KTtnLm9uRXJyb3Iodyk7cmV0dXJufW89ITE7dHJ5e3M9aFtwXSxzfHwocz1uZXcgTyxoW3BdPXMsbz0hMCl9Y2F0Y2goeCl7Zm9yKHIgaW4gaCloW3JdLm9uRXJyb3IoeCk7Zy5vbkVycm9yKHgpO3JldHVybn1pZihvKXtvPW5ldyBiYShqLHMsaSk7aj1uZXcgYmEoaixzKTt0cnl7az1jKGopfWNhdGNoKHkpe2ZvcihyIGluIGgpaFtyXS5vbkVycm9yKHkpO2cub25FcnJvcih5KTtyZXR1cm59Zy5vbk5leHQobyk7dT1uZXcgdjtmLmFkZCh1KTt0PWZ1bmN0aW9uKCl7aFtwXSE9PW4mJihkZWxldGUgaFtwXSxzLm9uQ29tcGxldGVkKCkpO2YucmVtb3ZlKHUpfTt1LmRpc3Bvc2FibGUoay50YWtlKDEpLnN1YnNjcmliZShmdW5jdGlvbigpe30sXG5mdW5jdGlvbihhKXtmb3IociBpbiBoKWhbcl0ub25FcnJvcihhKTtnLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7dCgpfSkpfXRyeXttPWIoZSl9Y2F0Y2goQSl7Zm9yKHIgaW4gaCloW3JdLm9uRXJyb3IoQSk7Zy5vbkVycm9yKEEpO3JldHVybn1zLm9uTmV4dChtKX0sZnVuY3Rpb24oYSl7Zm9yKHZhciBiIGluIGgpaFtiXS5vbkVycm9yKGEpO2cub25FcnJvcihhKX0sZnVuY3Rpb24oKXtmb3IodmFyIGEgaW4gaCloW2FdLm9uQ29tcGxldGVkKCk7Zy5vbkNvbXBsZXRlZCgpfSkpO3JldHVybiBpfSl9O2YuZ3JvdXBCeT1mdW5jdGlvbihhLGIsYyl7cmV0dXJuIHRoaXMuZ3JvdXBCeVVudGlsKGEsYixmdW5jdGlvbigpe3JldHVybiBkYSgpfSxjKX07Zi50YWtlPWZ1bmN0aW9uKGEsYil7aWYoMD5hKXRocm93IEVycm9yKFwiQXJndW1lbnQgb3V0IG9mIHJhbmdlXCIpO2lmKDA9PWEpcmV0dXJuIHRhKGIpO3ZhciBjPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYil7dmFyIGU9YTtyZXR1cm4gYy5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7aWYoMDxcbmUmJihlLS0sYi5vbk5leHQoYSksMD09PWUpKWIub25Db21wbGV0ZWQoKX0sZnVuY3Rpb24oYSl7cmV0dXJuIGIub25FcnJvcihhKX0sZnVuY3Rpb24oKXtyZXR1cm4gYi5vbkNvbXBsZXRlZCgpfSl9KX07Zi5za2lwPWZ1bmN0aW9uKGEpe2lmKDA+YSl0aHJvdyBFcnJvcihcIkFyZ3VtZW50IG91dCBvZiByYW5nZVwiKTt2YXIgYj10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGMpe3ZhciBkPWE7cmV0dXJuIGIuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2lmKDA+PWQpYy5vbk5leHQoYSk7ZWxzZSBkLS19LGZ1bmN0aW9uKGEpe3JldHVybiBjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7cmV0dXJuIGMub25Db21wbGV0ZWQoKX0pfSl9O2YudGFrZVdoaWxlPWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9MCxlPSEwO3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbihiKXtpZihlKXt0cnl7ZT1hKGIsZCsrKX1jYXRjaChoKXtjLm9uRXJyb3IoaCk7cmV0dXJufWlmKGUpYy5vbk5leHQoYik7XG5lbHNlIGMub25Db21wbGV0ZWQoKX19LGZ1bmN0aW9uKGEpe3JldHVybiBjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7cmV0dXJuIGMub25Db21wbGV0ZWQoKX0pfSl9O2Yuc2tpcFdoaWxlPWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9MCxlPSExO3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbihiKXtpZighZSl0cnl7ZT0hYShiLGQrKyl9Y2F0Y2goaCl7Yy5vbkVycm9yKGgpO3JldHVybn1pZihlKWMub25OZXh0KGIpfSxmdW5jdGlvbihhKXtjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Yy5vbkNvbXBsZXRlZCgpfSl9KX07Zi5zZWxlY3RNYW55PWZ1bmN0aW9uKGEsYil7cmV0dXJuIGIhPT1uP3RoaXMuc2VsZWN0TWFueShmdW5jdGlvbihjKXtyZXR1cm4gYShjKS5zZWxlY3QoZnVuY3Rpb24oYSl7cmV0dXJuIGIoYyxhKX0pfSk6XCJmdW5jdGlvblwiPT09dHlwZW9mIGE/dGhpcy5zZWxlY3QoYSkubWVyZ2VPYnNlcnZhYmxlKCk6dGhpcy5zZWxlY3QoZnVuY3Rpb24oKXtyZXR1cm4gYX0pLm1lcmdlT2JzZXJ2YWJsZSgpfTtcbmYuZmluYWxWYWx1ZT1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYil7dmFyIGM9ITEsZDtyZXR1cm4gYS5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7Yz0hMDtkPWF9LGZ1bmN0aW9uKGEpe2Iub25FcnJvcihhKX0sZnVuY3Rpb24oKXtpZihjKWIub25OZXh0KGQpLGIub25Db21wbGV0ZWQoKTtlbHNlIGIub25FcnJvcihFcnJvcihcIlNlcXVlbmNlIGNvbnRhaW5zIG5vIGVsZW1lbnRzLlwiKSl9KX0pfTtmLnRvQXJyYXk9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5zY2FuKFtdLGZ1bmN0aW9uKGEsYil7YS5wdXNoKGIpO3JldHVybiBhfSkuc3RhcnRXaXRoKFtdKS5maW5hbFZhbHVlKCl9O2YubWF0ZXJpYWxpemU9ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGIpe3JldHVybiBhLnN1YnNjcmliZShmdW5jdGlvbihhKXtiLm9uTmV4dCh0LmNyZWF0ZU9uTmV4dChhKSl9LGZ1bmN0aW9uKGEpe2Iub25OZXh0KHQuY3JlYXRlT25FcnJvcihhKSk7XG5iLm9uQ29tcGxldGVkKCl9LGZ1bmN0aW9uKCl7Yi5vbk5leHQodC5jcmVhdGVPbkNvbXBsZXRlZCgpKTtiLm9uQ29tcGxldGVkKCl9KX0pfTtmLmRlbWF0ZXJpYWxpemU9ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGIpe3JldHVybiBhLnN1YnNjcmliZShmdW5jdGlvbihhKXtyZXR1cm4gYS5hY2NlcHQoYil9LGZ1bmN0aW9uKGEpe2Iub25FcnJvcihhKX0sZnVuY3Rpb24oKXtiLm9uQ29tcGxldGVkKCl9KX0pfTtmLmFzT2JzZXJ2YWJsZT1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYil7cmV0dXJuIGEuc3Vic2NyaWJlKGIpfSl9O2Yud2luZG93V2l0aENvdW50PWZ1bmN0aW9uKGEsYil7dmFyIGM9dGhpcztpZigwPj1hKXRocm93IEVycm9yKFwiQXJndW1lbnQgb3V0IG9mIHJhbmdlXCIpO2I9PT1uJiYoYj1hKTtpZigwPj1iKXRocm93IEVycm9yKFwiQXJndW1lbnQgb3V0IG9mIHJhbmdlXCIpO3JldHVybiBpKGZ1bmN0aW9uKGQpe3ZhciBlPVxubmV3IHYsZz1uZXcgWihlKSxoPTAsZj1bXSxpPWZ1bmN0aW9uKCl7dmFyIGE9bmV3IE87Zi5wdXNoKGEpO2Qub25OZXh0KGphKGEsZykpfTtpKCk7ZS5kaXNwb3NhYmxlKGMuc3Vic2NyaWJlKGZ1bmN0aW9uKGMpe3ZhciBkO2ZvcihkPTA7ZDxmLmxlbmd0aDtkKyspZltkXS5vbk5leHQoYyk7Yz1oLWErMTswPD1jJiYwPT09YyViJiYoYz1mLnNoaWZ0KCksYy5vbkNvbXBsZXRlZCgpKTtoKys7MD09PWglYiYmaSgpfSxmdW5jdGlvbihhKXtmb3IoOzA8Zi5sZW5ndGg7KWYuc2hpZnQoKS5vbkVycm9yKGEpO2Qub25FcnJvcihhKX0sZnVuY3Rpb24oKXtmb3IoOzA8Zi5sZW5ndGg7KWYuc2hpZnQoKS5vbkNvbXBsZXRlZCgpO2Qub25Db21wbGV0ZWQoKX0pKTtyZXR1cm4gZ30pfTtmLmJ1ZmZlcldpdGhDb3VudD1mdW5jdGlvbihhLGIpe2I9PT1uJiYoYj1hKTtyZXR1cm4gdGhpcy53aW5kb3dXaXRoQ291bnQoYSxiKS5zZWxlY3RNYW55KGZ1bmN0aW9uKGEpe3JldHVybiBhLnRvQXJyYXkoKX0pLndoZXJlKGZ1bmN0aW9uKGEpe3JldHVybiAwPFxuYS5sZW5ndGh9KX07Zi5zdGFydFdpdGg9ZnVuY3Rpb24oKXt2YXIgYSxiO2E9MDswPGFyZ3VtZW50cy5sZW5ndGgmJnZvaWQgMCE9PWFyZ3VtZW50c1swXS5ub3c/KGI9YXJndW1lbnRzWzBdLGE9MSk6Yj1CO2E9eS5jYWxsKGFyZ3VtZW50cyxhKTtyZXR1cm4gUyhbZ2EoYSxiKSx0aGlzXSkuY29uY2F0KCl9O2Yuc2Nhbj1mdW5jdGlvbihhLGIpe3ZhciBjPXRoaXM7cmV0dXJuIGZhKGZ1bmN0aW9uKCl7dmFyIGQ9ITEsZTtyZXR1cm4gYy5zZWxlY3QoZnVuY3Rpb24oYyl7ZD9lPWIoZSxjKTooZT1iKGEsYyksZD0hMCk7cmV0dXJuIGV9KX0pfTtmLnNjYW4xPWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7cmV0dXJuIGZhKGZ1bmN0aW9uKCl7dmFyIGM9ITEsZDtyZXR1cm4gYi5zZWxlY3QoZnVuY3Rpb24oYil7Yz9kPWEoZCxiKTooZD1iLGM9ITApO3JldHVybiBkfSl9KX07Zi5kaXN0aW5jdFVudGlsQ2hhbmdlZD1mdW5jdGlvbihhLGIpe3ZhciBjPXRoaXM7YXx8KGE9USk7Ynx8KGI9Vik7XG5yZXR1cm4gaShmdW5jdGlvbihkKXt2YXIgZT0hMSxnO3JldHVybiBjLnN1YnNjcmliZShmdW5jdGlvbihjKXt2YXIgZj0hMSxpO3RyeXtpPWEoYyl9Y2F0Y2goail7ZC5vbkVycm9yKGopO3JldHVybn1pZihlKXRyeXtmPWIoZyxpKX1jYXRjaChrKXtkLm9uRXJyb3Ioayk7cmV0dXJufWlmKCFlfHwhZillPSEwLGc9aSxkLm9uTmV4dChjKX0sZnVuY3Rpb24oYSl7ZC5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2Qub25Db21wbGV0ZWQoKX0pfSl9O2YuZmluYWxseUFjdGlvbj1mdW5jdGlvbihhKXt2YXIgYj10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGMpe3ZhciBkPWIuc3Vic2NyaWJlKGMpO3JldHVybiBBKGZ1bmN0aW9uKCl7dHJ5e2QuZGlzcG9zZSgpfWZpbmFsbHl7YSgpfX0pfSl9O2YuZG9BY3Rpb249ZnVuY3Rpb24oYSxiLGMpe3ZhciBkPXRoaXMsZTswPT1hcmd1bWVudHMubGVuZ3RofHwxPGFyZ3VtZW50cy5sZW5ndGh8fFwiZnVuY3Rpb25cIj09dHlwZW9mIGE/ZT1hOihlPWZ1bmN0aW9uKGIpe2Eub25OZXh0KGIpfSxcbmI9ZnVuY3Rpb24oYil7YS5vbkVycm9yKGIpfSxjPWZ1bmN0aW9uKCl7YS5vbkNvbXBsZXRlZCgpfSk7cmV0dXJuIGkoZnVuY3Rpb24oYSl7cmV0dXJuIGQuc3Vic2NyaWJlKGZ1bmN0aW9uKGIpe3RyeXtlKGIpfWNhdGNoKGMpe2Eub25FcnJvcihjKX1hLm9uTmV4dChiKX0sZnVuY3Rpb24oYyl7aWYoYil0cnl7YihjKX1jYXRjaChkKXthLm9uRXJyb3IoZCl9YS5vbkVycm9yKGMpfSxmdW5jdGlvbigpe2lmKGMpdHJ5e2MoKX1jYXRjaChiKXthLm9uRXJyb3IoYil9YS5vbkNvbXBsZXRlZCgpfSl9KX07Zi5za2lwTGFzdD1mdW5jdGlvbihhKXt2YXIgYj10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGMpe3ZhciBkPVtdO3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbihiKXtkLnB1c2goYik7aWYoZC5sZW5ndGg+YSljLm9uTmV4dChkLnNoaWZ0KCkpfSxmdW5jdGlvbihhKXtjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Yy5vbkNvbXBsZXRlZCgpfSl9KX07Zi50YWtlTGFzdD1mdW5jdGlvbihhKXt2YXIgYj1cbnRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9W107cmV0dXJuIGIuc3Vic2NyaWJlKGZ1bmN0aW9uKGIpe2QucHVzaChiKTtkLmxlbmd0aD5hJiZkLnNoaWZ0KCl9LGZ1bmN0aW9uKGEpe2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtmb3IoOzA8ZC5sZW5ndGg7KWMub25OZXh0KGQuc2hpZnQoKSk7Yy5vbkNvbXBsZXRlZCgpfSl9KX07Zi5pZ25vcmVFbGVtZW50cz1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYil7cmV0dXJuIGEuc3Vic2NyaWJlKGlhLGZ1bmN0aW9uKGEpe2Iub25FcnJvcihhKX0sZnVuY3Rpb24oKXtiLm9uQ29tcGxldGVkKCl9KX0pfTtmLmVsZW1lbnRBdD1mdW5jdGlvbihhKXtpZigwPmEpdGhyb3cgRXJyb3IoXCJBcmd1bWVudCBvdXQgb2YgcmFuZ2VcIik7dmFyIGI9dGhpcztyZXR1cm4gaShmdW5jdGlvbihjKXt2YXIgZD1hO3JldHVybiBiLnN1YnNjcmliZShmdW5jdGlvbihhKXswPT09ZCYmKGMub25OZXh0KGEpLGMub25Db21wbGV0ZWQoKSk7XG5kLS19LGZ1bmN0aW9uKGEpe2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtjLm9uRXJyb3IoRXJyb3IoXCJBcmd1bWVudCBvdXQgb2YgcmFuZ2VcIikpfSl9KX07Zi5lbGVtZW50QXRPckRlZmF1bHQ9ZnVuY3Rpb24oYSxiKXt2YXIgYz10aGlzO2lmKDA+YSl0aHJvdyBFcnJvcihcIkFyZ3VtZW50IG91dCBvZiByYW5nZVwiKTtiPT09biYmKGI9bnVsbCk7cmV0dXJuIGkoZnVuY3Rpb24oZCl7dmFyIGU9YTtyZXR1cm4gYy5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7MD09PWUmJihkLm9uTmV4dChhKSxkLm9uQ29tcGxldGVkKCkpO2UtLX0sZnVuY3Rpb24oYSl7ZC5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2Qub25OZXh0KGIpO2Qub25Db21wbGV0ZWQoKX0pfSl9O2YuZGVmYXVsdElmRW1wdHk9ZnVuY3Rpb24oYSl7dmFyIGI9dGhpczthPT09biYmKGE9bnVsbCk7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9ITE7cmV0dXJuIGIuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2Q9ITA7Yy5vbk5leHQoYSl9LFxuZnVuY3Rpb24oYSl7Yy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2lmKCFkKWMub25OZXh0KGEpO2Mub25Db21wbGV0ZWQoKX0pfSl9O2YuZGlzdGluY3Q9ZnVuY3Rpb24oYSxiKXt2YXIgYz10aGlzO2F8fChhPVEpO2J8fChiPVcpO3JldHVybiBpKGZ1bmN0aW9uKGQpe3ZhciBlPXt9O3JldHVybiBjLnN1YnNjcmliZShmdW5jdGlvbihjKXt2YXIgZixpLGoscT0hMTt0cnl7Zj1hKGMpLGk9YihmKX1jYXRjaChrKXtkLm9uRXJyb3Ioayk7cmV0dXJufWZvcihqIGluIGUpaWYoaT09PWope3E9ITA7YnJlYWt9cXx8KGVbaV09bnVsbCxkLm9uTmV4dChjKSl9LGZ1bmN0aW9uKGEpe2Qub25FcnJvcihhKX0sZnVuY3Rpb24oKXtkLm9uQ29tcGxldGVkKCl9KX0pfTtmLm1lcmdlT2JzZXJ2YWJsZT1mdW5jdGlvbigpe3ZhciBhPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYil7dmFyIGM9bmV3IHAsZD0hMSxlPW5ldyB2O2MuYWRkKGUpO2UuZGlzcG9zYWJsZShhLnN1YnNjcmliZShmdW5jdGlvbihhKXt2YXIgZT1cbm5ldyB2O2MuYWRkKGUpO2UuZGlzcG9zYWJsZShhLnN1YnNjcmliZShmdW5jdGlvbihhKXtiLm9uTmV4dChhKX0sZnVuY3Rpb24oYSl7Yi5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2MucmVtb3ZlKGUpO2lmKGQmJjE9PT1jLmNvdW50KCkpYi5vbkNvbXBsZXRlZCgpfSkpfSxmdW5jdGlvbihhKXtiLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7ZD0hMDtpZigxPT09Yy5jb3VudCgpKWIub25Db21wbGV0ZWQoKX0pKTtyZXR1cm4gY30pfTtmLm1lcmdlPWZ1bmN0aW9uKGEpe3ZhciBiPXRoaXM7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9MCxlPW5ldyBwLGc9ITEsZj1bXSxpPWZ1bmN0aW9uKGEpe3ZhciBiPW5ldyB2O2UuYWRkKGIpO2IuZGlzcG9zYWJsZShhLnN1YnNjcmliZShmdW5jdGlvbihhKXtjLm9uTmV4dChhKX0sZnVuY3Rpb24oYSl7Yy5vbkVycm9yKGEpfSxmdW5jdGlvbigpe3ZhciBhO2UucmVtb3ZlKGIpO2lmKDA8Zi5sZW5ndGgpYT1mLnNoaWZ0KCksaShhKTtlbHNlIGlmKGQtLSxcbmcmJjA9PT1kKWMub25Db21wbGV0ZWQoKX0pKX07ZS5hZGQoYi5zdWJzY3JpYmUoZnVuY3Rpb24oYil7ZDxhPyhkKyssaShiKSk6Zi5wdXNoKGIpfSxmdW5jdGlvbihhKXtjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Zz0hMDtpZigwPT09ZCljLm9uQ29tcGxldGVkKCl9KSk7cmV0dXJuIGV9KX07Zi5zd2l0Y2hMYXRlc3Q9ZnVuY3Rpb24oKXt2YXIgYT10aGlzO3JldHVybiBpKGZ1bmN0aW9uKGIpe3ZhciBjPSExLGQ9bmV3IEMsZT0hMSxnPTAsZj1hLnN1YnNjcmliZShmdW5jdGlvbihhKXt2YXIgZj1uZXcgdixoPSsrZztjPSEwO2QuZGlzcG9zYWJsZShmKTtyZXR1cm4gZi5kaXNwb3NhYmxlKGEuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe2lmKGc9PT1oKWIub25OZXh0KGEpfSxmdW5jdGlvbihhKXtpZihnPT09aCliLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7aWYoZz09PWgmJihjPSExLGUpKWIub25Db21wbGV0ZWQoKX0pKX0sZnVuY3Rpb24oYSl7Yi5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2U9XG4hMDtpZighYyliLm9uQ29tcGxldGVkKCl9KTtyZXR1cm4gbmV3IHAoZixkKX0pfTtqLm1lcmdlPWZ1bmN0aW9uKGEpe2F8fChhPUIpO3ZhciBiPTE8YXJndW1lbnRzLmxlbmd0aCYmYXJndW1lbnRzWzFdaW5zdGFuY2VvZiBBcnJheT9hcmd1bWVudHNbMV06eS5jYWxsKGFyZ3VtZW50cywxKTtyZXR1cm4gZ2EoYixhKS5tZXJnZU9ic2VydmFibGUoKX07Zi5jb25jYXQ9ZnVuY3Rpb24oKXt2YXIgYT13YSxiO2I9YXJndW1lbnRzO3ZhciBjLGQ7Yz1bXTtmb3IoZD0wO2Q8Yi5sZW5ndGg7ZCsrKWMucHVzaChiW2RdKTtiPWM7Yi51bnNoaWZ0KHRoaXMpO3JldHVybiBhLmFwcGx5KHRoaXMsYil9O2YuY29uY2F0T2JzZXJ2YWJsZT1mdW5jdGlvbigpe3JldHVybiB0aGlzLm1lcmdlKDEpfTt2YXIgd2E9ai5jb25jYXQ9ZnVuY3Rpb24oKXt2YXIgYT0xPT09YXJndW1lbnRzLmxlbmd0aCYmYXJndW1lbnRzWzBdaW5zdGFuY2VvZiBBcnJheT9hcmd1bWVudHNbMF06eS5jYWxsKGFyZ3VtZW50cyk7XG5yZXR1cm4gUyhhKS5jb25jYXQoKX07Zi5jYXRjaEV4Y2VwdGlvbj1mdW5jdGlvbihhKXtyZXR1cm5cImZ1bmN0aW9uXCI9PT10eXBlb2YgYT94YSh0aGlzLGEpOnlhKFt0aGlzLGFdKX07dmFyIHhhPWZ1bmN0aW9uKGEsYil7cmV0dXJuIGkoZnVuY3Rpb24oYyl7dmFyIGQ9bmV3IHYsZT1uZXcgQztkLmRpc3Bvc2FibGUoYS5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7Yy5vbk5leHQoYSl9LGZ1bmN0aW9uKGEpe3ZhciBkO3RyeXtkPWIoYSl9Y2F0Y2goZil7Yy5vbkVycm9yKGYpO3JldHVybn1hPW5ldyB2O2UuZGlzcG9zYWJsZShhKTthLmRpc3Bvc2FibGUoZC5zdWJzY3JpYmUoYykpfSxmdW5jdGlvbigpe2Mub25Db21wbGV0ZWQoKX0pKTtyZXR1cm4gZX0pfSx5YT1qLmNhdGNoRXhjZXB0aW9uPWZ1bmN0aW9uKCl7dmFyIGE9MT09PWFyZ3VtZW50cy5sZW5ndGgmJmFyZ3VtZW50c1swXWluc3RhbmNlb2YgQXJyYXk/YXJndW1lbnRzWzBdOnkuY2FsbChhcmd1bWVudHMpO3JldHVybiBTKGEpLmNhdGNoRXhjZXB0aW9uKCl9O1xuZi5vbkVycm9yUmVzdW1lTmV4dD1mdW5jdGlvbihhKXtyZXR1cm4gemEoW3RoaXMsYV0pfTt2YXIgemE9ai5vbkVycm9yUmVzdW1lTmV4dD1mdW5jdGlvbigpe3ZhciBhPTE9PT1hcmd1bWVudHMubGVuZ3RoJiZhcmd1bWVudHNbMF1pbnN0YW5jZW9mIEFycmF5P2FyZ3VtZW50c1swXTp5LmNhbGwoYXJndW1lbnRzKTtyZXR1cm4gaShmdW5jdGlvbihiKXt2YXIgYz0wLGQ9bmV3IEMsZT1CLnNjaGVkdWxlUmVjdXJzaXZlKGZ1bmN0aW9uKGUpe3ZhciBmLGk7aWYoYzxhLmxlbmd0aClmPWFbYysrXSxpPW5ldyB2LGQuZGlzcG9zYWJsZShpKSxpLmRpc3Bvc2FibGUoZi5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7Yi5vbk5leHQoYSl9LGZ1bmN0aW9uKCl7ZSgpfSxmdW5jdGlvbigpe2UoKX0pKTtlbHNlIGIub25Db21wbGV0ZWQoKX0pO3JldHVybiBuZXcgcChkLGUpfSl9LEFhPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShhLGMpe3ZhciBkPXRoaXM7dGhpcy5zZWxlY3Rvcj1hO3RoaXMub2JzZXJ2ZXI9XG5jO3RoaXMubGVmdFE9W107dGhpcy5yaWdodFE9W107dGhpcy5sZWZ0PUkoZnVuY3Rpb24oYSl7aWYoXCJFXCI9PT1hLmtpbmQpZC5vYnNlcnZlci5vbkVycm9yKGEuZXhjZXB0aW9uKTtlbHNlIGlmKDA9PT1kLnJpZ2h0US5sZW5ndGgpZC5sZWZ0US5wdXNoKGEpO2Vsc2UgZC5vbk5leHQoYSxkLnJpZ2h0US5zaGlmdCgpKX0pO3RoaXMucmlnaHQ9SShmdW5jdGlvbihhKXtpZihcIkVcIj09PWEua2luZClkLm9ic2VydmVyLm9uRXJyb3IoYS5leGNlcHRpb24pO2Vsc2UgaWYoMD09PWQubGVmdFEubGVuZ3RoKWQucmlnaHRRLnB1c2goYSk7ZWxzZSBkLm9uTmV4dChkLmxlZnRRLnNoaWZ0KCksYSl9KX1hLnByb3RvdHlwZS5vbk5leHQ9ZnVuY3Rpb24oYSxjKXt2YXIgZDtpZihcIkNcIj09PWEua2luZHx8XCJDXCI9PT1jLmtpbmQpdGhpcy5vYnNlcnZlci5vbkNvbXBsZXRlZCgpO2Vsc2V7dHJ5e2Q9dGhpcy5zZWxlY3RvcihhLnZhbHVlLGMudmFsdWUpfWNhdGNoKGUpe3RoaXMub2JzZXJ2ZXIub25FcnJvcihlKTtcbnJldHVybn10aGlzLm9ic2VydmVyLm9uTmV4dChkKX19O3JldHVybiBhfSgpO2YuemlwPWZ1bmN0aW9uKGEsYil7cmV0dXJuIEYodGhpcyxhLGZ1bmN0aW9uKGEpe3ZhciBkPW5ldyBBYShiLGEpO3JldHVybiBuZXcgSChmdW5jdGlvbihhKXtyZXR1cm4gZC5sZWZ0Lm9uTmV4dChhKX0sZnVuY3Rpb24oYSl7cmV0dXJuIGQucmlnaHQub25OZXh0KGEpfSl9KX07dmFyIGhhO2hhPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYShhLGMpe3ZhciBkPXRoaXM7dGhpcy5zZWxlY3Rvcj1hO3RoaXMub2JzZXJ2ZXI9Yzt0aGlzLnJpZ2h0U3RvcHBlZD10aGlzLmxlZnRTdG9wcGVkPSExO3RoaXMubGVmdD1JKGZ1bmN0aW9uKGEpe2lmKFwiTlwiPT09YS5raW5kKWlmKGQubGVmdFZhbHVlPWEsZC5yaWdodFZhbHVlIT09bilkLm9uTmV4dCgpO2Vsc2V7aWYoZC5yaWdodFN0b3BwZWQpZC5vYnNlcnZlci5vbkNvbXBsZXRlZCgpfWVsc2UgaWYoXCJFXCI9PT1hLmtpbmQpZC5vYnNlcnZlci5vbkVycm9yKGEuZXhjZXB0aW9uKTtcbmVsc2UgaWYoZC5sZWZ0U3RvcHBlZD0hMCxkLnJpZ2h0U3RvcHBlZClkLm9ic2VydmVyLm9uQ29tcGxldGVkKCl9KTt0aGlzLnJpZ2h0PUkoZnVuY3Rpb24oYSl7aWYoXCJOXCI9PT1hLmtpbmQpaWYoZC5yaWdodFZhbHVlPWEsZC5sZWZ0VmFsdWUhPT1uKWQub25OZXh0KCk7ZWxzZXtpZihkLmxlZnRTdG9wcGVkKWQub2JzZXJ2ZXIub25Db21wbGV0ZWQoKX1lbHNlIGlmKFwiRVwiPT09YS5raW5kKWQub2JzZXJ2ZXIub25FcnJvcihhLmV4Y2VwdGlvbik7ZWxzZSBpZihkLnJpZ2h0U3RvcHBlZD0hMCxkLmxlZnRTdG9wcGVkKWQub2JzZXJ2ZXIub25Db21wbGV0ZWQoKX0pfWEucHJvdG90eXBlLm9uTmV4dD1mdW5jdGlvbigpe3ZhciBhO3RyeXthPXRoaXMuc2VsZWN0b3IodGhpcy5sZWZ0VmFsdWUudmFsdWUsdGhpcy5yaWdodFZhbHVlLnZhbHVlKX1jYXRjaChjKXt0aGlzLm9ic2VydmVyLm9uRXJyb3IoYyk7cmV0dXJufXRoaXMub2JzZXJ2ZXIub25OZXh0KGEpfTtyZXR1cm4gYX0oKTtmLmNvbWJpbmVMYXRlc3Q9XG5mdW5jdGlvbihhLGIpe3JldHVybiBGKHRoaXMsYSxmdW5jdGlvbihhKXt2YXIgZD1uZXcgaGEoYixhKTtyZXR1cm4gbmV3IEgoZnVuY3Rpb24oYSl7cmV0dXJuIGQubGVmdC5vbk5leHQoYSl9LGZ1bmN0aW9uKGEpe3JldHVybiBkLnJpZ2h0Lm9uTmV4dChhKX0pfSl9O2YudGFrZVVudGlsPWZ1bmN0aW9uKGEpe3JldHVybiBGKGEsdGhpcyxmdW5jdGlvbihhLGMpe3ZhciBkPSExLGU9ITE7cmV0dXJuIG5ldyBIKGZ1bmN0aW9uKGMpeyFlJiYhZCYmKFwiQ1wiPT09Yy5raW5kP2Q9ITA6XCJFXCI9PT1jLmtpbmQ/KGU9ZD0hMCxhLm9uRXJyb3IoYy5leGNlcHRpb24pKTooZT0hMCxhLm9uQ29tcGxldGVkKCkpKX0sZnVuY3Rpb24oZCl7ZXx8KGQuYWNjZXB0KGEpLChlPVwiTlwiIT09ZC5raW5kKSYmYy5kaXNwb3NlKCkpfSl9KX07Zi5za2lwVW50aWw9ZnVuY3Rpb24oYSl7cmV0dXJuIEYodGhpcyxhLGZ1bmN0aW9uKGEsYyxkKXt2YXIgZT0hMSxmPSExO3JldHVybiBuZXcgSChmdW5jdGlvbihjKXtpZihcIkVcIj09XG5jLmtpbmQpYS5vbkVycm9yKGMuZXhjZXB0aW9uKTtlbHNlIGUmJmMuYWNjZXB0KGEpfSxmdW5jdGlvbihjKXtpZighZil7aWYoXCJOXCI9PT1jLmtpbmQpZT0hMDtlbHNlIGlmKFwiRVwiPT09Yy5raW5kKWEub25FcnJvcihjLmV4Y2VwdGlvbik7Zj0hMDtkLmRpc3Bvc2UoKX19KX0pfTtqLmFtYj1mdW5jdGlvbigpe3ZhciBhPWRhKCksYixjPTE9PT1hcmd1bWVudHMubGVuZ3RoJiZhcmd1bWVudHNbMF1pbnN0YW5jZW9mIEFycmF5P2FyZ3VtZW50c1swXTp5LmNhbGwoYXJndW1lbnRzKTtmb3IoYj0wO2I8Yy5sZW5ndGg7YisrKWE9YS5hbWIoY1tiXSk7cmV0dXJuIGF9O2YuYW1iPWZ1bmN0aW9uKGEpe3JldHVybiBGKHRoaXMsYSxmdW5jdGlvbihhLGMsZCl7dmFyIGU9XCJOXCI7cmV0dXJuIG5ldyBIKGZ1bmN0aW9uKGMpe1wiTlwiPT09ZSYmKGU9XCJMXCIsZC5kaXNwb3NlKCkpO1wiTFwiPT09ZSYmYy5hY2NlcHQoYSl9LGZ1bmN0aW9uKGQpe1wiTlwiPT09ZSYmKGU9XCJSXCIsYy5kaXNwb3NlKCkpO1wiUlwiPT09XG5lJiZkLmFjY2VwdChhKX0pfSl9fTtcbiIsIi8qXG4gQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uICBBbGwgcmlnaHRzIHJlc2VydmVkLlxuIFRoaXMgY29kZSBpcyBsaWNlbnNlZCBieSBNaWNyb3NvZnQgQ29ycG9yYXRpb24gdW5kZXIgdGhlIHRlcm1zXG4gb2YgdGhlIE1JQ1JPU09GVCBSRUFDVElWRSBFWFRFTlNJT05TIEZPUiBKQVZBU0NSSVBUIEFORCAuTkVUIExJQlJBUklFUyBMaWNlbnNlLlxuIFNlZSBodHRwOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP0xpbmtJRD0yMjA3NjIuXG4qL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihrLHQpe3ZhciBsO2w9ay5SeDt2YXIgbj1sLk9ic2VydmFibGUsZD1uLnByb3RvdHlwZSxtPW4uY3JlYXRlV2l0aERpc3Bvc2FibGUsdT1sLkNvbXBvc2l0ZURpc3Bvc2FibGUsbz1mdW5jdGlvbihhLGIpe3JldHVybiBhPT09Yn0scD1mdW5jdGlvbihhKXtyZXR1cm4gYX0scT1mdW5jdGlvbihhLGIpe3JldHVybiBhPmI/MTphPT09Yj8wOi0xfSxyPWZ1bmN0aW9uKGEsYixkKXtyZXR1cm4gbShmdW5jdGlvbihjKXt2YXIgZj0hMSxnPW51bGwsaD1bXTtyZXR1cm4gYS5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7dmFyIGUsaTt0cnl7aT1iKGEpfWNhdGNoKHYpe2Mub25FcnJvcih2KTtyZXR1cm59ZT0wO2lmKGYpdHJ5e2U9ZChpLGcpfWNhdGNoKHcpe2Mub25FcnJvcih3KTtyZXR1cm59ZWxzZSBmPSEwLGc9XG5pOzA8ZSYmKGc9aSxoPVtdKTswPD1lJiZoLnB1c2goYSl9LGZ1bmN0aW9uKGEpe2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtjLm9uTmV4dChoKTtjLm9uQ29tcGxldGVkKCl9KX0pfTtkLmFnZ3JlZ2F0ZT1mdW5jdGlvbihhLGIpe3JldHVybiB0aGlzLnNjYW4oYSxiKS5zdGFydFdpdGgoYSkuZmluYWxWYWx1ZSgpfTtkLmFnZ3JlZ2F0ZTE9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMuc2NhbjEoYSkuZmluYWxWYWx1ZSgpfTtkLmFueT1mdW5jdGlvbihhKXt2YXIgYj10aGlzO3JldHVybiBhIT09dD9iLndoZXJlKGEpLmFueSgpOm0oZnVuY3Rpb24oYSl7cmV0dXJuIGIuc3Vic2NyaWJlKGZ1bmN0aW9uKCl7YS5vbk5leHQoITApO2Eub25Db21wbGV0ZWQoKX0sZnVuY3Rpb24oYil7YS5vbkVycm9yKGIpfSxmdW5jdGlvbigpe2Eub25OZXh0KCExKTthLm9uQ29tcGxldGVkKCl9KX0pfTtkLmFsbD1mdW5jdGlvbihhKXtyZXR1cm4gdGhpcy53aGVyZShmdW5jdGlvbihiKXtyZXR1cm4hYShiKX0pLmFueSgpLnNlbGVjdChmdW5jdGlvbihhKXtyZXR1cm4hYX0pfTtcbmQuY29udGFpbnM9ZnVuY3Rpb24oYSxiKXtifHwoYj1vKTtyZXR1cm4gdGhpcy53aGVyZShmdW5jdGlvbihkKXtyZXR1cm4gYihkLGEpfSkuYW55KCl9O2QuY291bnQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5hZ2dyZWdhdGUoMCxmdW5jdGlvbihhKXtyZXR1cm4gYSsxfSl9O2Quc3VtPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuYWdncmVnYXRlKDAsZnVuY3Rpb24oYSxiKXtyZXR1cm4gYStifSl9O2QubWluQnk9ZnVuY3Rpb24oYSxiKXtifHwoYj1xKTtyZXR1cm4gcih0aGlzLGEsZnVuY3Rpb24oYSxjKXtyZXR1cm4tMSpiKGEsYyl9KX07dmFyIHM9ZnVuY3Rpb24oYSl7aWYoMD09YS5sZW5ndGgpdGhyb3cgRXJyb3IoXCJTZXF1ZW5jZSBjb250YWlucyBubyBlbGVtZW50cy5cIik7cmV0dXJuIGFbMF19O2QubWluPWZ1bmN0aW9uKGEpe3JldHVybiB0aGlzLm1pbkJ5KHAsYSkuc2VsZWN0KGZ1bmN0aW9uKGEpe3JldHVybiBzKGEpfSl9O2QubWF4Qnk9ZnVuY3Rpb24oYSxiKXtifHwoYj1xKTtcbnJldHVybiByKHRoaXMsYSxiKX07ZC5tYXg9ZnVuY3Rpb24oYSl7cmV0dXJuIHRoaXMubWF4QnkocCxhKS5zZWxlY3QoZnVuY3Rpb24oYSl7cmV0dXJuIHMoYSl9KX07ZC5hdmVyYWdlPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuc2Nhbih7c3VtOjAsY291bnQ6MH0sZnVuY3Rpb24oYSxiKXtyZXR1cm57c3VtOmEuc3VtK2IsY291bnQ6YS5jb3VudCsxfX0pLmZpbmFsVmFsdWUoKS5zZWxlY3QoZnVuY3Rpb24oYSl7cmV0dXJuIGEuc3VtL2EuY291bnR9KX07ZC5zZXF1ZW5jZUVxdWFsPWZ1bmN0aW9uKGEsYil7dmFyIGQ9dGhpcztifHwoYj1vKTtyZXR1cm4gbShmdW5jdGlvbihjKXt2YXIgZj0hMSxnPSExLGg9W10saj1bXSxlPWQuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe3ZhciBkLGY7aWYoMDxqLmxlbmd0aCl7Zj1qLnNoaWZ0KCk7dHJ5e2Q9YihmLGEpfWNhdGNoKGUpe2Mub25FcnJvcihlKTtyZXR1cm59ZHx8KGMub25OZXh0KCExKSxjLm9uQ29tcGxldGVkKCkpfWVsc2UgZz8oYy5vbk5leHQoITEpLFxuYy5vbkNvbXBsZXRlZCgpKTpoLnB1c2goYSl9LGZ1bmN0aW9uKGEpe2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtmPSEwOzA9PT1oLmxlbmd0aCYmKDA8ai5sZW5ndGg/KGMub25OZXh0KCExKSxjLm9uQ29tcGxldGVkKCkpOmcmJihjLm9uTmV4dCghMCksYy5vbkNvbXBsZXRlZCgpKSl9KSxpPWEuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe3ZhciBkLGU7aWYoMDxoLmxlbmd0aCl7ZT1oLnNoaWZ0KCk7dHJ5e2Q9YihlLGEpfWNhdGNoKGcpe2Mub25FcnJvcihnKTtyZXR1cm59ZHx8KGMub25OZXh0KCExKSxjLm9uQ29tcGxldGVkKCkpfWVsc2UgZj8oYy5vbk5leHQoITEpLGMub25Db21wbGV0ZWQoKSk6ai5wdXNoKGEpfSxmdW5jdGlvbihhKXtjLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7Zz0hMDswPT09ai5sZW5ndGgmJigwPGgubGVuZ3RoPyhjLm9uTmV4dCghMSksYy5vbkNvbXBsZXRlZCgpKTpmJiYoYy5vbk5leHQoITApLGMub25Db21wbGV0ZWQoKSkpfSk7cmV0dXJuIG5ldyB1KGUsXG5pKX0pfX07XG4iLCIvKlxuIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiAgQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiBUaGlzIGNvZGUgaXMgbGljZW5zZWQgYnkgTWljcm9zb2Z0IENvcnBvcmF0aW9uIHVuZGVyIHRoZSB0ZXJtc1xuIG9mIHRoZSBNSUNST1NPRlQgUkVBQ1RJVkUgRVhURU5TSU9OUyBGT1IgSkFWQVNDUklQVCBBTkQgLk5FVCBMSUJSQVJJRVMgTGljZW5zZS5cbiBTZWUgaHR0cDovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSUQ9MjIwNzYyLlxuKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ocSxoKXt2YXIgZjtmPXEuUng7dmFyIHo9Zi5PYnNlcnZhYmxlLHU9Zi5Db21wb3NpdGVEaXNwb3NhYmxlLEU9Zi5SZWZDb3VudERpc3Bvc2FibGUscz1mLlNpbmdsZUFzc2lnbm1lbnREaXNwb3NhYmxlLEs9Zi5TZXJpYWxEaXNwb3NhYmxlLEE9Zi5TdWJqZWN0O2Y9ei5wcm90b3R5cGU7dmFyIEw9ei5lbXB0eSx2PXouY3JlYXRlV2l0aERpc3Bvc2FibGUsTT1mdW5jdGlvbihiLGEpe3JldHVybiBiPT09YX0sTj1mdW5jdGlvbigpe30sQj1mdW5jdGlvbihiLGEpe3JldHVybiB2KGZ1bmN0aW9uKGMpe3JldHVybiBuZXcgdShhLmdldERpc3Bvc2FibGUoKSxiLnN1YnNjcmliZShjKSl9KX0sQyxGLG8sRyx3LHg7bz1bMSwzLDcsMTMsMzEsNjEsMTI3LDI1MSw1MDksMTAyMSwyMDM5LDQwOTMsODE5MSwxNjM4MSxcbjMyNzQ5LDY1NTIxLDEzMTA3MSwyNjIxMzksNTI0Mjg3LDEwNDg1NzMsMjA5NzE0Myw0MTk0MzAxLDgzODg1OTMsMTY3NzcyMTMsMzM1NTQzOTMsNjcxMDg4NTksMTM0MjE3Njg5LDI2ODQzNTM5OSw1MzY4NzA5MDksMTA3Mzc0MTc4OSwyMTQ3NDgzNjQ3XTtGPWZ1bmN0aW9uKGIpe3ZhciBhLGM7aWYoYiYwKXJldHVybiAyPT09YjthPU1hdGguc3FydChiKTtmb3IoYz0zO2M8PWE7KXtpZigwPT09YiVjKXJldHVybiExO2MrPTJ9cmV0dXJuITB9O0M9ZnVuY3Rpb24oYil7dmFyIGEsYztmb3IoYT0wO2E8by5sZW5ndGg7KythKWlmKGM9b1thXSxjPj1iKXJldHVybiBjO2ZvcihhPWJ8MTthPG9bby5sZW5ndGgtMV07KXtpZihGKGEpKXJldHVybiBhO2ErPTJ9cmV0dXJuIGJ9O0c9MDt3PWZ1bmN0aW9uKGIpe3ZhciBhO2lmKGI9PT1oKXRocm93XCJubyBzdWNoIGtleVwiO2lmKGIuZ2V0SGFzaENvZGUhPT1oKXJldHVybiBiLmdldEhhc2hDb2RlKCk7YT0xNypHKys7Yi5nZXRIYXNoQ29kZT1mdW5jdGlvbigpe3JldHVybiBhfTtcbnJldHVybiBhfTt4PWZ1bmN0aW9uKCl7cmV0dXJue2tleTpudWxsLHZhbHVlOm51bGwsbmV4dDowLGhhc2hDb2RlOjB9fTt2YXIgeT1mdW5jdGlvbigpe2Z1bmN0aW9uIGIoYSxjKXt0aGlzLl9pbml0aWFsaXplKGEpO3RoaXMuY29tcGFyZXI9Y3x8TTt0aGlzLnNpemU9dGhpcy5mcmVlQ291bnQ9MDt0aGlzLmZyZWVMaXN0PS0xfWIucHJvdG90eXBlLl9pbml0aWFsaXplPWZ1bmN0aW9uKGEpe3ZhciBhPUMoYSksYzt0aGlzLmJ1Y2tldHM9QXJyYXkoYSk7dGhpcy5lbnRyaWVzPUFycmF5KGEpO2ZvcihjPTA7YzxhO2MrKyl0aGlzLmJ1Y2tldHNbY109LTEsdGhpcy5lbnRyaWVzW2NdPXgoKTt0aGlzLmZyZWVMaXN0PS0xfTtiLnByb3RvdHlwZS5jb3VudD1mdW5jdGlvbigpe3JldHVybiB0aGlzLnNpemV9O2IucHJvdG90eXBlLmFkZD1mdW5jdGlvbihhLGMpe3JldHVybiB0aGlzLl9pbnNlcnQoYSxjLCEwKX07Yi5wcm90b3R5cGUuX2luc2VydD1mdW5jdGlvbihhLGMsYil7dmFyIGUsZCxcbmc7dGhpcy5idWNrZXRzPT09aCYmdGhpcy5faW5pdGlhbGl6ZSgwKTtnPXcoYSkmMjE0NzQ4MzY0NztlPWcldGhpcy5idWNrZXRzLmxlbmd0aDtmb3IoZD10aGlzLmJ1Y2tldHNbZV07MDw9ZDtkPXRoaXMuZW50cmllc1tkXS5uZXh0KWlmKHRoaXMuZW50cmllc1tkXS5oYXNoQ29kZT09PWcmJnRoaXMuY29tcGFyZXIodGhpcy5lbnRyaWVzW2RdLmtleSxhKSl7aWYoYil0aHJvd1wiZHVwbGljYXRlIGtleVwiO3RoaXMuZW50cmllc1tkXS52YWx1ZT1jO3JldHVybn0wPHRoaXMuZnJlZUNvdW50PyhiPXRoaXMuZnJlZUxpc3QsdGhpcy5mcmVlTGlzdD10aGlzLmVudHJpZXNbYl0ubmV4dCwtLXRoaXMuZnJlZUNvdW50KToodGhpcy5zaXplPT09dGhpcy5lbnRyaWVzLmxlbmd0aCYmKHRoaXMuX3Jlc2l6ZSgpLGU9ZyV0aGlzLmJ1Y2tldHMubGVuZ3RoKSxiPXRoaXMuc2l6ZSwrK3RoaXMuc2l6ZSk7dGhpcy5lbnRyaWVzW2JdLmhhc2hDb2RlPWc7dGhpcy5lbnRyaWVzW2JdLm5leHQ9dGhpcy5idWNrZXRzW2VdO1xudGhpcy5lbnRyaWVzW2JdLmtleT1hO3RoaXMuZW50cmllc1tiXS52YWx1ZT1jO3RoaXMuYnVja2V0c1tlXT1ifTtiLnByb3RvdHlwZS5fcmVzaXplPWZ1bmN0aW9uKCl7dmFyIGEsYyxiLGUsZDtkPUMoMip0aGlzLnNpemUpO2I9QXJyYXkoZCk7Zm9yKGE9MDthPGIubGVuZ3RoOysrYSliW2FdPS0xO2U9QXJyYXkoZCk7Zm9yKGE9MDthPHRoaXMuc2l6ZTsrK2EpZVthXT10aGlzLmVudHJpZXNbYV07Zm9yKGE9dGhpcy5zaXplO2E8ZDsrK2EpZVthXT14KCk7Zm9yKGE9MDthPHRoaXMuc2l6ZTsrK2EpYz1lW2FdLmhhc2hDb2RlJWQsZVthXS5uZXh0PWJbY10sYltjXT1hO3RoaXMuYnVja2V0cz1iO3RoaXMuZW50cmllcz1lfTtiLnByb3RvdHlwZS5yZW1vdmU9ZnVuY3Rpb24oYSl7dmFyIGIsayxlLGQ7aWYodGhpcy5idWNrZXRzIT09aCl7ZD13KGEpJjIxNDc0ODM2NDc7Yj1kJXRoaXMuYnVja2V0cy5sZW5ndGg7az0tMTtmb3IoZT10aGlzLmJ1Y2tldHNbYl07MDw9ZTtlPXRoaXMuZW50cmllc1tlXS5uZXh0KXtpZih0aGlzLmVudHJpZXNbZV0uaGFzaENvZGU9PT1cbmQmJnRoaXMuY29tcGFyZXIodGhpcy5lbnRyaWVzW2VdLmtleSxhKSlyZXR1cm4gMD5rP3RoaXMuYnVja2V0c1tiXT10aGlzLmVudHJpZXNbZV0ubmV4dDp0aGlzLmVudHJpZXNba10ubmV4dD10aGlzLmVudHJpZXNbZV0ubmV4dCx0aGlzLmVudHJpZXNbZV0uaGFzaENvZGU9LTEsdGhpcy5lbnRyaWVzW2VdLm5leHQ9dGhpcy5mcmVlTGlzdCx0aGlzLmVudHJpZXNbZV0ua2V5PW51bGwsdGhpcy5lbnRyaWVzW2VdLnZhbHVlPW51bGwsdGhpcy5mcmVlTGlzdD1lLCsrdGhpcy5mcmVlQ291bnQsITA7az1lfX1yZXR1cm4hMX07Yi5wcm90b3R5cGUuY2xlYXI9ZnVuY3Rpb24oKXt2YXIgYTtpZighKDA+PXRoaXMuc2l6ZSkpe2ZvcihhPTA7YTx0aGlzLmJ1Y2tldHMubGVuZ3RoOysrYSl0aGlzLmJ1Y2tldHNbYV09LTE7Zm9yKGE9MDthPHRoaXMuc2l6ZTsrK2EpdGhpcy5lbnRyaWVzW2FdPXgoKTt0aGlzLmZyZWVMaXN0PS0xO3RoaXMuc2l6ZT0wfX07Yi5wcm90b3R5cGUuX2ZpbmRFbnRyeT1cbmZ1bmN0aW9uKGEpe3ZhciBiLGs7aWYodGhpcy5idWNrZXRzIT09aCl7az13KGEpJjIxNDc0ODM2NDc7Zm9yKGI9dGhpcy5idWNrZXRzW2sldGhpcy5idWNrZXRzLmxlbmd0aF07MDw9YjtiPXRoaXMuZW50cmllc1tiXS5uZXh0KWlmKHRoaXMuZW50cmllc1tiXS5oYXNoQ29kZT09PWsmJnRoaXMuY29tcGFyZXIodGhpcy5lbnRyaWVzW2JdLmtleSxhKSlyZXR1cm4gYn1yZXR1cm4tMX07Yi5wcm90b3R5cGUuY291bnQ9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5zaXplLXRoaXMuZnJlZUNvdW50fTtiLnByb3RvdHlwZS50cnlHZXRFbnRyeT1mdW5jdGlvbihhKXthPXRoaXMuX2ZpbmRFbnRyeShhKTtyZXR1cm4gMDw9YT97a2V5OnRoaXMuZW50cmllc1thXS5rZXksdmFsdWU6dGhpcy5lbnRyaWVzW2FdLnZhbHVlfTpofTtiLnByb3RvdHlwZS5nZXRWYWx1ZXM9ZnVuY3Rpb24oKXt2YXIgYT0wLGIsaz1bXTtpZih0aGlzLmVudHJpZXMhPT1oKWZvcihiPTA7Yjx0aGlzLnNpemU7YisrKWlmKDA8PVxudGhpcy5lbnRyaWVzW2JdLmhhc2hDb2RlKWtbYSsrXT10aGlzLmVudHJpZXNbYl0udmFsdWU7cmV0dXJuIGt9O2IucHJvdG90eXBlLmdldD1mdW5jdGlvbihhKXthPXRoaXMuX2ZpbmRFbnRyeShhKTtpZigwPD1hKXJldHVybiB0aGlzLmVudHJpZXNbYV0udmFsdWU7dGhyb3cgRXJyb3IoXCJubyBzdWNoIGtleVwiKTt9O2IucHJvdG90eXBlLnNldD1mdW5jdGlvbihhLGIpe3RoaXMuX2luc2VydChhLGIsITEpfTtiLnByb3RvdHlwZS5jb250YWluc2tleT1mdW5jdGlvbihhKXtyZXR1cm4gMDw9dGhpcy5fZmluZEVudHJ5KGEpfTtyZXR1cm4gYn0oKTtmLmpvaW49ZnVuY3Rpb24oYixhLGMsayl7dmFyIGU9dGhpcztyZXR1cm4gdihmdW5jdGlvbihkKXt2YXIgZz1uZXcgdSxqPSExLGY9MCxsPW5ldyB5LGg9ITEscj0wLHQ9bmV3IHk7Zy5hZGQoZS5zdWJzY3JpYmUoZnVuY3Rpb24oYil7dmFyIGMsZSxwPWYrKyxpPW5ldyBzLEg7bC5hZGQocCxiKTtnLmFkZChpKTtlPWZ1bmN0aW9uKCl7aWYobC5yZW1vdmUocCkmJlxuMD09PWwuY291bnQoKSYmailkLm9uQ29tcGxldGVkKCk7cmV0dXJuIGcucmVtb3ZlKGkpfTt0cnl7Yz1hKGIpfWNhdGNoKGgpe2Qub25FcnJvcihoKTtyZXR1cm59aS5kaXNwb3NhYmxlKGMudGFrZSgxKS5zdWJzY3JpYmUoZnVuY3Rpb24oKXt9LGZ1bmN0aW9uKGEpe2Qub25FcnJvcihhKX0sZnVuY3Rpb24oKXtlKCl9KSk7Yz10LmdldFZhbHVlcygpO2Zvcih2YXIgbj0wO248Yy5sZW5ndGg7bisrKXt0cnl7SD1rKGIsY1tuXSl9Y2F0Y2gocil7ZC5vbkVycm9yKHIpO2JyZWFrfWQub25OZXh0KEgpfX0sZnVuY3Rpb24oYSl7ZC5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2o9ITA7aWYoaHx8MD09PWwuY291bnQoKSlkLm9uQ29tcGxldGVkKCl9KSk7Zy5hZGQoYi5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7dmFyIGIsZSxwPXIrKyxpPW5ldyBzLGo7dC5hZGQocCxhKTtnLmFkZChpKTtlPWZ1bmN0aW9uKCl7aWYodC5yZW1vdmUocCkmJjA9PT10LmNvdW50KCkmJmgpZC5vbkNvbXBsZXRlZCgpO1xucmV0dXJuIGcucmVtb3ZlKGkpfTt0cnl7Yj1jKGEpfWNhdGNoKGYpe2Qub25FcnJvcihmKTtyZXR1cm59aS5kaXNwb3NhYmxlKGIudGFrZSgxKS5zdWJzY3JpYmUoZnVuY3Rpb24oKXt9LGZ1bmN0aW9uKGEpe2Qub25FcnJvcihhKX0sZnVuY3Rpb24oKXtlKCl9KSk7Yj1sLmdldFZhbHVlcygpO2Zvcih2YXIgbj0wO248Yi5sZW5ndGg7bisrKXt0cnl7aj1rKGJbbl0sYSl9Y2F0Y2goTyl7ZC5vbkVycm9yKE8pO2JyZWFrfWQub25OZXh0KGopfX0sZnVuY3Rpb24oYSl7ZC5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2g9ITA7aWYoanx8MD09PXQuY291bnQoKSlkLm9uQ29tcGxldGVkKCl9KSk7cmV0dXJuIGd9KX07Zi5ncm91cEpvaW49ZnVuY3Rpb24oYixhLGMsayl7dmFyIGU9dGhpcztyZXR1cm4gdihmdW5jdGlvbihkKXt2YXIgZz1uZXcgdSxqPW5ldyBFKGcpLGY9MCxsPW5ldyB5LGg9MCxyPW5ldyB5O2cuYWRkKGUuc3Vic2NyaWJlKGZ1bmN0aW9uKGIpe3ZhciBjLGUsbSxwPWYrKyxpLFxuaCxELG49bmV3IEE7bC5hZGQocCxuKTt0cnl7bT1rKGIsQihuLGopKX1jYXRjaChvKXtpPWwuZ2V0VmFsdWVzKCk7Zm9yKG09MDttPGkubGVuZ3RoO20rKylpW21dLm9uRXJyb3Iobyk7ZC5vbkVycm9yKG8pO3JldHVybn1kLm9uTmV4dChtKTtEPXIuZ2V0VmFsdWVzKCk7Zm9yKG09MDttPEQubGVuZ3RoO20rKyluLm9uTmV4dChEW21dKTtoPW5ldyBzO2cuYWRkKGgpO2U9ZnVuY3Rpb24oKXtpZihsLnJlbW92ZShwKSluLm9uQ29tcGxldGVkKCk7Zy5yZW1vdmUoaCl9O3RyeXtjPWEoYil9Y2F0Y2gocSl7aT1sLmdldFZhbHVlcygpO2ZvcihtPTA7bTxpLmxlbmd0aDttKyspaVttXS5vbkVycm9yKHEpO2Qub25FcnJvcihxKTtyZXR1cm59aC5kaXNwb3NhYmxlKGMudGFrZSgxKS5zdWJzY3JpYmUoZnVuY3Rpb24oKXt9LGZ1bmN0aW9uKGEpe3ZhciBiO2k9bC5nZXRWYWx1ZXMoKTtmb3IoYj0wO2I8aS5sZW5ndGg7YisrKWlbYl0ub25FcnJvcihhKTtkLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7ZSgpfSkpfSxcbmZ1bmN0aW9uKGEpe3ZhciBiLGM7Yz1sLmdldFZhbHVlcygpO2ZvcihiPTA7YjxjLmxlbmd0aDtiKyspY1tiXS5vbkVycm9yKGEpO2Qub25FcnJvcihhKX0sZnVuY3Rpb24oKXtkLm9uQ29tcGxldGVkKCl9KSk7Zy5hZGQoYi5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7dmFyIGIsZSxrLGYsaTtrPWgrKztyLmFkZChrLGEpO2k9bmV3IHM7Zy5hZGQoaSk7ZT1mdW5jdGlvbigpe3IucmVtb3ZlKGspO2cucmVtb3ZlKGkpfTt0cnl7Yj1jKGEpfWNhdGNoKGope2Y9bC5nZXRWYWx1ZXMoKTtmb3IoYj0wO2I8Zi5sZW5ndGg7YisrKWZbYl0ub25FcnJvcihqKTtkLm9uRXJyb3Ioaik7cmV0dXJufWkuZGlzcG9zYWJsZShiLnRha2UoMSkuc3Vic2NyaWJlKGZ1bmN0aW9uKCl7fSxmdW5jdGlvbihhKXt2YXIgYjtmPWwuZ2V0VmFsdWVzKCk7Zm9yKGI9MDtiPGYubGVuZ3RoO2IrKylmW2JdLm9uRXJyb3IoYSk7ZC5vbkVycm9yKGEpfSxmdW5jdGlvbigpe2UoKX0pKTtmPWwuZ2V0VmFsdWVzKCk7Zm9yKGI9XG4wO2I8Zi5sZW5ndGg7YisrKWZbYl0ub25OZXh0KGEpfSxmdW5jdGlvbihiKXt2YXIgYSxjO2M9bC5nZXRWYWx1ZXMoKTtmb3IoYT0wO2E8Yy5sZW5ndGg7YSsrKWNbYV0ub25FcnJvcihiKTtkLm9uRXJyb3IoYil9KSk7cmV0dXJuIGp9KX07Zi5idWZmZXI9ZnVuY3Rpb24oYixhKXtyZXR1cm5cImZ1bmN0aW9uXCI9PT10eXBlb2YgYj9JKGIpLnNlbGVjdE1hbnkoZnVuY3Rpb24oYSl7cmV0dXJuIG9ic2VydmFibGVUb0FycmF5KGEpfSk6Sih0aGlzLGIsYSkuc2VsZWN0TWFueShmdW5jdGlvbihhKXtyZXR1cm4gb2JzZXJ2YWJsZVRvQXJyYXkoYSl9KX07Zi53aW5kb3c9ZnVuY3Rpb24oYixhKXtyZXR1cm5cImZ1bmN0aW9uXCI9PT10eXBlb2YgYj9JLmNhbGwodGhpcyxiKTpKLmNhbGwodGhpcyxiLGEpfTt2YXIgSj1mdW5jdGlvbihiLGEpe3JldHVybiBiLmdyb3VwSm9pbih0aGlzLGEsZnVuY3Rpb24oKXtyZXR1cm4gTCgpfSxmdW5jdGlvbihhLGIpe3JldHVybiBifSl9LEk9ZnVuY3Rpb24oYil7dmFyIGE9XG50aGlzO3JldHVybiB2KGZ1bmN0aW9uKGMpe3ZhciBmLGU9bmV3IEssZD1uZXcgdShlKSxnPW5ldyBFKGQpLGo9bmV3IEE7Yy5vbk5leHQoQihqLGcpKTtkLmFkZChhLnN1YnNjcmliZShmdW5jdGlvbihhKXtqLm9uTmV4dChhKX0sZnVuY3Rpb24oYSl7ai5vbkVycm9yKGEpO2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtqLm9uQ29tcGxldGVkKCk7Yy5vbkNvbXBsZXRlZCgpfSkpO2Y9ZnVuY3Rpb24oKXt2YXIgYSxkO3RyeXtkPWIoKX1jYXRjaChoKXtjLm9uRXJyb3IoaCk7cmV0dXJufWE9bmV3IHM7ZS5kaXNwb3NhYmxlKGEpO2EuZGlzcG9zYWJsZShkLnRha2UoMSkuc3Vic2NyaWJlKE4sZnVuY3Rpb24oYSl7ai5vbkVycm9yKGEpO2Mub25FcnJvcihhKX0sZnVuY3Rpb24oKXtqLm9uQ29tcGxldGVkKCk7aj1uZXcgQTtjLm9uTmV4dChCKGosZykpO2YoKX0pKX07ZigpO3JldHVybiBnfSl9fTtcbiIsIi8qXG4gQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uICBBbGwgcmlnaHRzIHJlc2VydmVkLlxuIFRoaXMgY29kZSBpcyBsaWNlbnNlZCBieSBNaWNyb3NvZnQgQ29ycG9yYXRpb24gdW5kZXIgdGhlIHRlcm1zXG4gb2YgdGhlIE1JQ1JPU09GVCBSRUFDVElWRSBFWFRFTlNJT05TIEZPUiBKQVZBU0NSSVBUIEFORCAuTkVUIExJQlJBUklFUyBMaWNlbnNlLlxuIFNlZSBodHRwOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP0xpbmtJRD0yMjA3NjIuXG4qL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihrLGgpe3ZhciBpO2k9ay5SeDt2YXIgdz1BcnJheS5wcm90b3R5cGUuc2xpY2UseD1PYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LHk9ZnVuY3Rpb24oYixhKXtmdW5jdGlvbiBjKCl7dGhpcy5jb25zdHJ1Y3Rvcj1ifWZvcih2YXIgZiBpbiBhKXguY2FsbChhLGYpJiYoYltmXT1hW2ZdKTtjLnByb3RvdHlwZT1hLnByb3RvdHlwZTtiLnByb3RvdHlwZT1uZXcgYztiLmJhc2U9YS5wcm90b3R5cGU7cmV0dXJuIGJ9LGw9aS5PYnNlcnZhYmxlLHA9bC5wcm90b3R5cGUsej1sLmNyZWF0ZVdpdGhEaXNwb3NhYmxlLEE9bC50aHJvd0V4Y2VwdGlvbixCPWkuT2JzZXJ2ZXIuY3JlYXRlLHE9aS5JbnRlcm5hbHMuTGlzdCxDPWkuU2luZ2xlQXNzaWdubWVudERpc3Bvc2FibGUsRD1pLkNvbXBvc2l0ZURpc3Bvc2FibGUsXG5FPWkuSW50ZXJuYWxzLkFic3RyYWN0T2JzZXJ2ZXIsRj1mdW5jdGlvbihiLGEpe3JldHVybiBiPT09YX0sbyxyLGoscyxtLG47aj1bMSwzLDcsMTMsMzEsNjEsMTI3LDI1MSw1MDksMTAyMSwyMDM5LDQwOTMsODE5MSwxNjM4MSwzMjc0OSw2NTUyMSwxMzEwNzEsMjYyMTM5LDUyNDI4NywxMDQ4NTczLDIwOTcxNDMsNDE5NDMwMSw4Mzg4NTkzLDE2Nzc3MjEzLDMzNTU0MzkzLDY3MTA4ODU5LDEzNDIxNzY4OSwyNjg0MzUzOTksNTM2ODcwOTA5LDEwNzM3NDE3ODksMjE0NzQ4MzY0N107cj1mdW5jdGlvbihiKXt2YXIgYSxjO2lmKGImMClyZXR1cm4gMj09PWI7YT1NYXRoLnNxcnQoYik7Zm9yKGM9MztjPD1hOyl7aWYoMD09PWIlYylyZXR1cm4hMTtjKz0yfXJldHVybiEwfTtvPWZ1bmN0aW9uKGIpe3ZhciBhLGM7Zm9yKGE9MDthPGoubGVuZ3RoOysrYSlpZihjPWpbYV0sYz49YilyZXR1cm4gYztmb3IoYT1ifDE7YTxqW2oubGVuZ3RoLTFdOyl7aWYocihhKSlyZXR1cm4gYTthKz0yfXJldHVybiBifTtcbnM9MDttPWZ1bmN0aW9uKGIpe3ZhciBhO2lmKGI9PT1oKXRocm93XCJubyBzdWNoIGtleVwiO2lmKGIuZ2V0SGFzaENvZGUhPT1oKXJldHVybiBiLmdldEhhc2hDb2RlKCk7YT0xNypzKys7Yi5nZXRIYXNoQ29kZT1mdW5jdGlvbigpe3JldHVybiBhfTtyZXR1cm4gYX07bj1mdW5jdGlvbigpe3JldHVybntrZXk6bnVsbCx2YWx1ZTpudWxsLG5leHQ6MCxoYXNoQ29kZTowfX07dmFyIHQ9ZnVuY3Rpb24oKXtmdW5jdGlvbiBiKGEsYyl7dGhpcy5faW5pdGlhbGl6ZShhKTt0aGlzLmNvbXBhcmVyPWN8fEY7dGhpcy5zaXplPXRoaXMuZnJlZUNvdW50PTA7dGhpcy5mcmVlTGlzdD0tMX1iLnByb3RvdHlwZS5faW5pdGlhbGl6ZT1mdW5jdGlvbihhKXt2YXIgYT1vKGEpLGM7dGhpcy5idWNrZXRzPUFycmF5KGEpO3RoaXMuZW50cmllcz1BcnJheShhKTtmb3IoYz0wO2M8YTtjKyspdGhpcy5idWNrZXRzW2NdPS0xLHRoaXMuZW50cmllc1tjXT1uKCk7dGhpcy5mcmVlTGlzdD0tMX07Yi5wcm90b3R5cGUuY291bnQ9XG5mdW5jdGlvbigpe3JldHVybiB0aGlzLnNpemV9O2IucHJvdG90eXBlLmFkZD1mdW5jdGlvbihhLGMpe3JldHVybiB0aGlzLl9pbnNlcnQoYSxjLCEwKX07Yi5wcm90b3R5cGUuX2luc2VydD1mdW5jdGlvbihhLGMsYil7dmFyIGQsZSxnO3RoaXMuYnVja2V0cz09PWgmJnRoaXMuX2luaXRpYWxpemUoMCk7Zz1tKGEpJjIxNDc0ODM2NDc7ZD1nJXRoaXMuYnVja2V0cy5sZW5ndGg7Zm9yKGU9dGhpcy5idWNrZXRzW2RdOzA8PWU7ZT10aGlzLmVudHJpZXNbZV0ubmV4dClpZih0aGlzLmVudHJpZXNbZV0uaGFzaENvZGU9PT1nJiZ0aGlzLmNvbXBhcmVyKHRoaXMuZW50cmllc1tlXS5rZXksYSkpe2lmKGIpdGhyb3dcImR1cGxpY2F0ZSBrZXlcIjt0aGlzLmVudHJpZXNbZV0udmFsdWU9YztyZXR1cm59MDx0aGlzLmZyZWVDb3VudD8oYj10aGlzLmZyZWVMaXN0LHRoaXMuZnJlZUxpc3Q9dGhpcy5lbnRyaWVzW2JdLm5leHQsLS10aGlzLmZyZWVDb3VudCk6KHRoaXMuc2l6ZT09PXRoaXMuZW50cmllcy5sZW5ndGgmJlxuKHRoaXMuX3Jlc2l6ZSgpLGQ9ZyV0aGlzLmJ1Y2tldHMubGVuZ3RoKSxiPXRoaXMuc2l6ZSwrK3RoaXMuc2l6ZSk7dGhpcy5lbnRyaWVzW2JdLmhhc2hDb2RlPWc7dGhpcy5lbnRyaWVzW2JdLm5leHQ9dGhpcy5idWNrZXRzW2RdO3RoaXMuZW50cmllc1tiXS5rZXk9YTt0aGlzLmVudHJpZXNbYl0udmFsdWU9Yzt0aGlzLmJ1Y2tldHNbZF09Yn07Yi5wcm90b3R5cGUuX3Jlc2l6ZT1mdW5jdGlvbigpe3ZhciBhLGMsYixkLGU7ZT1vKDIqdGhpcy5zaXplKTtiPUFycmF5KGUpO2ZvcihhPTA7YTxiLmxlbmd0aDsrK2EpYlthXT0tMTtkPUFycmF5KGUpO2ZvcihhPTA7YTx0aGlzLnNpemU7KythKWRbYV09dGhpcy5lbnRyaWVzW2FdO2ZvcihhPXRoaXMuc2l6ZTthPGU7KythKWRbYV09bigpO2ZvcihhPTA7YTx0aGlzLnNpemU7KythKWM9ZFthXS5oYXNoQ29kZSVlLGRbYV0ubmV4dD1iW2NdLGJbY109YTt0aGlzLmJ1Y2tldHM9Yjt0aGlzLmVudHJpZXM9ZH07Yi5wcm90b3R5cGUucmVtb3ZlPVxuZnVuY3Rpb24oYSl7dmFyIGMsYixkLGU7aWYodGhpcy5idWNrZXRzIT09aCl7ZT1tKGEpJjIxNDc0ODM2NDc7Yz1lJXRoaXMuYnVja2V0cy5sZW5ndGg7Yj0tMTtmb3IoZD10aGlzLmJ1Y2tldHNbY107MDw9ZDtkPXRoaXMuZW50cmllc1tkXS5uZXh0KXtpZih0aGlzLmVudHJpZXNbZF0uaGFzaENvZGU9PT1lJiZ0aGlzLmNvbXBhcmVyKHRoaXMuZW50cmllc1tkXS5rZXksYSkpcmV0dXJuIDA+Yj90aGlzLmJ1Y2tldHNbY109dGhpcy5lbnRyaWVzW2RdLm5leHQ6dGhpcy5lbnRyaWVzW2JdLm5leHQ9dGhpcy5lbnRyaWVzW2RdLm5leHQsdGhpcy5lbnRyaWVzW2RdLmhhc2hDb2RlPS0xLHRoaXMuZW50cmllc1tkXS5uZXh0PXRoaXMuZnJlZUxpc3QsdGhpcy5lbnRyaWVzW2RdLmtleT1udWxsLHRoaXMuZW50cmllc1tkXS52YWx1ZT1udWxsLHRoaXMuZnJlZUxpc3Q9ZCwrK3RoaXMuZnJlZUNvdW50LCEwO2I9ZH19cmV0dXJuITF9O2IucHJvdG90eXBlLmNsZWFyPWZ1bmN0aW9uKCl7dmFyIGE7XG5pZighKDA+PXRoaXMuc2l6ZSkpe2ZvcihhPTA7YTx0aGlzLmJ1Y2tldHMubGVuZ3RoOysrYSl0aGlzLmJ1Y2tldHNbYV09LTE7Zm9yKGE9MDthPHRoaXMuc2l6ZTsrK2EpdGhpcy5lbnRyaWVzW2FdPW4oKTt0aGlzLmZyZWVMaXN0PS0xO3RoaXMuc2l6ZT0wfX07Yi5wcm90b3R5cGUuX2ZpbmRFbnRyeT1mdW5jdGlvbihhKXt2YXIgYyxiO2lmKHRoaXMuYnVja2V0cyE9PWgpe2I9bShhKSYyMTQ3NDgzNjQ3O2ZvcihjPXRoaXMuYnVja2V0c1tiJXRoaXMuYnVja2V0cy5sZW5ndGhdOzA8PWM7Yz10aGlzLmVudHJpZXNbY10ubmV4dClpZih0aGlzLmVudHJpZXNbY10uaGFzaENvZGU9PT1iJiZ0aGlzLmNvbXBhcmVyKHRoaXMuZW50cmllc1tjXS5rZXksYSkpcmV0dXJuIGN9cmV0dXJuLTF9O2IucHJvdG90eXBlLmNvdW50PWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuc2l6ZS10aGlzLmZyZWVDb3VudH07Yi5wcm90b3R5cGUudHJ5R2V0RW50cnk9ZnVuY3Rpb24oYSl7YT10aGlzLl9maW5kRW50cnkoYSk7XG5yZXR1cm4gMDw9YT97a2V5OnRoaXMuZW50cmllc1thXS5rZXksdmFsdWU6dGhpcy5lbnRyaWVzW2FdLnZhbHVlfTpofTtiLnByb3RvdHlwZS5nZXRWYWx1ZXM9ZnVuY3Rpb24oKXt2YXIgYT0wLGMsYj1bXTtpZih0aGlzLmVudHJpZXMhPT1oKWZvcihjPTA7Yzx0aGlzLnNpemU7YysrKWlmKDA8PXRoaXMuZW50cmllc1tjXS5oYXNoQ29kZSliW2ErK109dGhpcy5lbnRyaWVzW2NdLnZhbHVlO3JldHVybiBifTtiLnByb3RvdHlwZS5nZXQ9ZnVuY3Rpb24oYSl7YT10aGlzLl9maW5kRW50cnkoYSk7aWYoMDw9YSlyZXR1cm4gdGhpcy5lbnRyaWVzW2FdLnZhbHVlO3Rocm93IEVycm9yKFwibm8gc3VjaCBrZXlcIik7fTtiLnByb3RvdHlwZS5zZXQ9ZnVuY3Rpb24oYSxiKXt0aGlzLl9pbnNlcnQoYSxiLCExKX07Yi5wcm90b3R5cGUuY29udGFpbnNrZXk9ZnVuY3Rpb24oYSl7cmV0dXJuIDA8PXRoaXMuX2ZpbmRFbnRyeShhKX07cmV0dXJuIGJ9KCksdT1mdW5jdGlvbigpe2Z1bmN0aW9uIGIoYSl7dGhpcy5wYXR0ZXJucz1cbmF9Yi5wcm90b3R5cGUuYW5kPWZ1bmN0aW9uKGEpe3ZhciBjPXRoaXMucGF0dGVybnMsZixkO2Q9W107Zm9yKGY9MDtmPGMubGVuZ3RoO2YrKylkLnB1c2goY1tmXSk7ZC5wdXNoKGEpO3JldHVybiBuZXcgYihkKX07Yi5wcm90b3R5cGUudGhlbj1mdW5jdGlvbihhKXtyZXR1cm4gbmV3IEcodGhpcyxhKX07cmV0dXJuIGJ9KCksRz1mdW5jdGlvbigpe2Z1bmN0aW9uIGIoYSxiKXt0aGlzLmV4cHJlc3Npb249YTt0aGlzLnNlbGVjdG9yPWJ9Yi5wcm90b3R5cGUuYWN0aXZhdGU9ZnVuY3Rpb24oYSxiLGYpe3ZhciBkLGUsZyxoO2g9dGhpcztnPVtdO2ZvcihlPTA7ZTx0aGlzLmV4cHJlc3Npb24ucGF0dGVybnMubGVuZ3RoO2UrKylnLnB1c2goSChhLHRoaXMuZXhwcmVzc2lvbi5wYXR0ZXJuc1tlXSxmdW5jdGlvbihhKXtiLm9uRXJyb3IoYSl9KSk7ZD1uZXcgdihnLGZ1bmN0aW9uKCl7dmFyIGE7dHJ5e2E9aC5zZWxlY3Rvci5hcHBseShoLGFyZ3VtZW50cyl9Y2F0Y2goZCl7Yi5vbkVycm9yKGQpO1xucmV0dXJufWIub25OZXh0KGEpfSxmdW5jdGlvbigpe3ZhciBhO2ZvcihhPTA7YTxnLmxlbmd0aDthKyspZ1thXS5yZW1vdmVBY3RpdmVQbGFuKGQpO2YoZCl9KTtmb3IoZT0wO2U8Zy5sZW5ndGg7ZSsrKWdbZV0uYWRkQWN0aXZlUGxhbihkKTtyZXR1cm4gZH07cmV0dXJuIGJ9KCksSD1mdW5jdGlvbihiLGEsYyl7dmFyIGY7Zj1iLnRyeUdldEVudHJ5KGEpO3JldHVybiBmPT09aD8oYz1uZXcgSShhLGMpLGIuYWRkKGEsYyksYyk6Zi52YWx1ZX0sdjt2PWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYihhLGIsZil7dGhpcy5qb2luT2JzZXJ2ZXJBcnJheT1hO3RoaXMub25OZXh0PWI7dGhpcy5vbkNvbXBsZXRlZD1mO3RoaXMuam9pbk9ic2VydmVycz1uZXcgdDtmb3IoYT0wO2E8dGhpcy5qb2luT2JzZXJ2ZXJBcnJheS5sZW5ndGg7YSsrKWI9dGhpcy5qb2luT2JzZXJ2ZXJBcnJheVthXSx0aGlzLmpvaW5PYnNlcnZlcnMuYWRkKGIsYil9Yi5wcm90b3R5cGUuZGVxdWV1ZT1mdW5jdGlvbigpe3ZhciBhLFxuYjtiPXRoaXMuam9pbk9ic2VydmVycy5nZXRWYWx1ZXMoKTtmb3IoYT0wO2E8Yi5sZW5ndGg7YSsrKWJbYV0ucXVldWUuc2hpZnQoKX07Yi5wcm90b3R5cGUubWF0Y2g9ZnVuY3Rpb24oKXt2YXIgYSxiLGY7YT0hMDtmb3IoYj0wO2I8dGhpcy5qb2luT2JzZXJ2ZXJBcnJheS5sZW5ndGg7YisrKWlmKDA9PT10aGlzLmpvaW5PYnNlcnZlckFycmF5W2JdLnF1ZXVlLmxlbmd0aCl7YT0hMTticmVha31pZihhKXthPVtdO2Y9ITE7Zm9yKGI9MDtiPHRoaXMuam9pbk9ic2VydmVyQXJyYXkubGVuZ3RoO2IrKylhLnB1c2godGhpcy5qb2luT2JzZXJ2ZXJBcnJheVtiXS5xdWV1ZVswXSksXCJDXCI9PT10aGlzLmpvaW5PYnNlcnZlckFycmF5W2JdLnF1ZXVlWzBdLmtpbmQmJihmPSEwKTtpZihmKXRoaXMub25Db21wbGV0ZWQoKTtlbHNle3RoaXMuZGVxdWV1ZSgpO2Y9W107Zm9yKGI9MDtiPGEubGVuZ3RoO2IrKylmLnB1c2goYVtiXS52YWx1ZSk7dGhpcy5vbk5leHQuYXBwbHkodGhpcyxmKX19fTtcbnJldHVybiBifSgpO3ZhciBJPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gYihhLGIpe3RoaXMuc291cmNlPWE7dGhpcy5vbkVycm9yPWI7dGhpcy5xdWV1ZT1bXTt0aGlzLmFjdGl2ZVBsYW5zPW5ldyBxO3RoaXMuc3Vic2NyaXB0aW9uPW5ldyBDO3RoaXMuaXNEaXNwb3NlZD0hMX15KGIsRSk7Yi5wcm90b3R5cGUuYWRkQWN0aXZlUGxhbj1mdW5jdGlvbihhKXt0aGlzLmFjdGl2ZVBsYW5zLmFkZChhKX07Yi5wcm90b3R5cGUuc3Vic2NyaWJlPWZ1bmN0aW9uKCl7dGhpcy5zdWJzY3JpcHRpb24uZGlzcG9zYWJsZSh0aGlzLnNvdXJjZS5tYXRlcmlhbGl6ZSgpLnN1YnNjcmliZSh0aGlzKSl9O2IucHJvdG90eXBlLm5leHQ9ZnVuY3Rpb24oYSl7dmFyIGI7aWYoIXRoaXMuaXNEaXNwb3NlZClpZihcIkVcIj09PWEua2luZCl0aGlzLm9uRXJyb3IoYS5leGNlcHRpb24pO2Vsc2V7dGhpcy5xdWV1ZS5wdXNoKGEpO2E9dGhpcy5hY3RpdmVQbGFucy50b0FycmF5KCk7Zm9yKGI9MDtiPGEubGVuZ3RoO2IrKylhW2JdLm1hdGNoKCl9fTtcbmIucHJvdG90eXBlLmVycm9yPWZ1bmN0aW9uKCl7fTtiLnByb3RvdHlwZS5jb21wbGV0ZWQ9ZnVuY3Rpb24oKXt9O2IucHJvdG90eXBlLnJlbW92ZUFjdGl2ZVBsYW49ZnVuY3Rpb24oYSl7dGhpcy5hY3RpdmVQbGFucy5yZW1vdmUoYSk7MD09PXRoaXMuYWN0aXZlUGxhbnMuY291bnQoKSYmdGhpcy5kaXNwb3NlKCl9O2IucHJvdG90eXBlLmRpc3Bvc2U9ZnVuY3Rpb24oKXtiLmJhc2UuZGlzcG9zZS5jYWxsKHRoaXMpO2lmKCF0aGlzLmlzRGlzcG9zZWQpdGhpcy5pc0Rpc3Bvc2VkPSEwLHRoaXMuc3Vic2NyaXB0aW9uLmRpc3Bvc2UoKX07cmV0dXJuIGJ9KCk7cC5hbmQ9ZnVuY3Rpb24oYil7cmV0dXJuIG5ldyB1KFt0aGlzLGJdKX07cC50aGVuPWZ1bmN0aW9uKGIpe3JldHVybihuZXcgdShbdGhpc10pKS50aGVuKGIpfTtsLndoZW49ZnVuY3Rpb24oKXt2YXIgYj0xPT09YXJndW1lbnRzLmxlbmd0aCYmYXJndW1lbnRzWzBdaW5zdGFuY2VvZiBBcnJheT9hcmd1bWVudHNbMF06dy5jYWxsKGFyZ3VtZW50cyk7XG5yZXR1cm4geihmdW5jdGlvbihhKXt2YXIgYz1uZXcgcSxmPW5ldyB0LGQsZSxnLGgsaTtpPUIoZnVuY3Rpb24oYil7YS5vbk5leHQoYil9LGZ1bmN0aW9uKGIpe2Zvcih2YXIgYz1mLmdldFZhbHVlcygpLGQ9MDtkPGMubGVuZ3RoO2QrKyljW2RdLm9uRXJyb3IoYik7YS5vbkVycm9yKGIpfSxmdW5jdGlvbigpe2Eub25Db21wbGV0ZWQoKX0pO3RyeXtmb3IoZT0wO2U8Yi5sZW5ndGg7ZSsrKWMuYWRkKGJbZV0uYWN0aXZhdGUoZixpLGZ1bmN0aW9uKGEpe2MucmVtb3ZlKGEpO2lmKDA9PT1jLmNvdW50KCkpaS5vbkNvbXBsZXRlZCgpfSkpfWNhdGNoKGope0Eoaikuc3Vic2NyaWJlKGEpfWQ9bmV3IEQ7aD1mLmdldFZhbHVlcygpO2ZvcihlPTA7ZTxoLmxlbmd0aDtlKyspZz1oW2VdLGcuc3Vic2NyaWJlKCksZC5hZGQoZyk7cmV0dXJuIGR9KX19O1xuIiwiLypcbiBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gVGhpcyBjb2RlIGlzIGxpY2Vuc2VkIGJ5IE1pY3Jvc29mdCBDb3Jwb3JhdGlvbiB1bmRlciB0aGUgdGVybXNcbiBvZiB0aGUgTUlDUk9TT0ZUIFJFQUNUSVZFIEVYVEVOU0lPTlMgRk9SIEpBVkFTQ1JJUFQgQU5EIC5ORVQgTElCUkFSSUVTIExpY2Vuc2UuXG4gU2VlIGh0dHA6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/TGlua0lEPTIyMDc2Mi5cbiovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHcsbil7dmFyIHA7cD13LlJ4O3ZhciBxPXAuT2JzZXJ2YWJsZSxvPXEucHJvdG90eXBlLG09cS5jcmVhdGVXaXRoRGlzcG9zYWJsZSx5PXEuZGVmZXIsRj1xLnRocm93RXhjZXB0aW9uLGw9cC5TY2hlZHVsZXIuVGltZW91dCxyPXAuU2luZ2xlQXNzaWdubWVudERpc3Bvc2FibGUsdD1wLlNlcmlhbERpc3Bvc2FibGUscz1wLkNvbXBvc2l0ZURpc3Bvc2FibGUsej1wLlJlZkNvdW50RGlzcG9zYWJsZSx1PXAuU3ViamVjdCxHPXAuSW50ZXJuYWxzLkJpbmFyeU9ic2VydmVyLHY9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gbShmdW5jdGlvbihjKXtyZXR1cm4gbmV3IHMoYi5nZXREaXNwb3NhYmxlKCksYS5zdWJzY3JpYmUoYykpfSl9LEg9ZnVuY3Rpb24oYSxiLGMpe3JldHVybiBtKGZ1bmN0aW9uKGQpe3ZhciBmPVxubmV3IHIsZT1uZXcgcixkPWMoZCxmLGUpO2YuZGlzcG9zYWJsZShhLm1hdGVyaWFsaXplKCkuc2VsZWN0KGZ1bmN0aW9uKGIpe3JldHVybntzd2l0Y2hWYWx1ZTpmdW5jdGlvbihjKXtyZXR1cm4gYyhiKX19fSkuc3Vic2NyaWJlKGQpKTtlLmRpc3Bvc2FibGUoYi5tYXRlcmlhbGl6ZSgpLnNlbGVjdChmdW5jdGlvbihiKXtyZXR1cm57c3dpdGNoVmFsdWU6ZnVuY3Rpb24oYyxhKXtyZXR1cm4gYShiKX19fSkuc3Vic2NyaWJlKGQpKTtyZXR1cm4gbmV3IHMoZixlKX0pfSxJPWZ1bmN0aW9uKGEsYil7cmV0dXJuIG0oZnVuY3Rpb24oYyl7cmV0dXJuIGIuc2NoZWR1bGVXaXRoQWJzb2x1dGUoYSxmdW5jdGlvbigpe2Mub25OZXh0KDApO2Mub25Db21wbGV0ZWQoKX0pfSl9LEE9ZnVuY3Rpb24oYSxiLGMpe3ZhciBkPTA+Yj8wOmI7cmV0dXJuIG0oZnVuY3Rpb24oYil7dmFyIGU9MCxnPWE7cmV0dXJuIGMuc2NoZWR1bGVSZWN1cnNpdmVXaXRoQWJzb2x1dGUoZyxmdW5jdGlvbihhKXt2YXIgaTtcbjA8ZCYmKGk9Yy5ub3coKSxnKz1kLGc8PWkmJihnPWkrZCkpO2Iub25OZXh0KGUrKyk7YShnKX0pfSl9LEo9ZnVuY3Rpb24oYSxiKXt2YXIgYz0wPmE/MDphO3JldHVybiBtKGZ1bmN0aW9uKGEpe3JldHVybiBiLnNjaGVkdWxlV2l0aFJlbGF0aXZlKGMsZnVuY3Rpb24oKXthLm9uTmV4dCgwKTthLm9uQ29tcGxldGVkKCl9KX0pfSxCPWZ1bmN0aW9uKGEsYixjKXtyZXR1cm4geShmdW5jdGlvbigpe3JldHVybiBBKGMubm93KCkrYSxiLGMpfSl9LEs9cS5pbnRlcnZhbD1mdW5jdGlvbihhLGIpe2J8fChiPWwpO3JldHVybiBCKGEsYSxiKX07cS50aW1lcj1mdW5jdGlvbihhLGIsYyl7dmFyIGQ7Y3x8KGM9bCk7YiE9PW4mJlwibnVtYmVyXCI9PT10eXBlb2YgYj9kPWI6YiE9PW4mJlwib2JqZWN0XCI9PT10eXBlb2YgYiYmKGM9Yik7cmV0dXJuIGEgaW5zdGFuY2VvZiBEYXRlJiZkPT09bj9JKGEuZ2V0VGltZSgpLGMpOmEgaW5zdGFuY2VvZiBEYXRlJiZkIT09bj9BKGEuZ2V0VGltZSgpLGIsYyk6XG5kPT09bj9KKGEsYyk6QihhLGQsYyl9O3ZhciBEPWZ1bmN0aW9uKGEsYixjKXtyZXR1cm4gbShmdW5jdGlvbihkKXt2YXIgZj0hMSxlPW5ldyB0LGc9bnVsbCxoPVtdLGk9ITEsajtqPWEubWF0ZXJpYWxpemUoKS50aW1lc3RhbXAoYykuc3Vic2NyaWJlKGZ1bmN0aW9uKGEpe1wiRVwiPT09YS52YWx1ZS5raW5kPyhoPVtdLGgucHVzaChhKSxnPWEudmFsdWUuZXhjZXB0aW9uLGE9IWkpOihoLnB1c2goe3ZhbHVlOmEudmFsdWUsdGltZXN0YW1wOmEudGltZXN0YW1wK2J9KSxhPSFmLGY9ITApO2lmKGEpaWYobnVsbCE9PWcpZC5vbkVycm9yKGcpO2Vsc2UgYT1uZXcgcixlLmRpc3Bvc2FibGUoYSksYS5kaXNwb3NhYmxlKGMuc2NoZWR1bGVSZWN1cnNpdmVXaXRoUmVsYXRpdmUoYixmdW5jdGlvbihhKXt2YXIgYixlLGo7aWYobnVsbD09PWcpe2k9ITA7ZG97Yj1udWxsO2lmKDA8aC5sZW5ndGgmJjA+PWhbMF0udGltZXN0YW1wLWMubm93KCkpYj1oLnNoaWZ0KCkudmFsdWU7bnVsbCE9PWImJlxuYi5hY2NlcHQoZCl9d2hpbGUobnVsbCE9PWIpO2o9ITE7ZT0wOzA8aC5sZW5ndGg/KGo9ITAsZT1NYXRoLm1heCgwLGhbMF0udGltZXN0YW1wLWMubm93KCkpKTpmPSExO2I9ZztpPSExO2lmKG51bGwhPT1iKWQub25FcnJvcihiKTtlbHNlIGomJmEoZSl9fSkpfSk7cmV0dXJuIG5ldyBzKGosZSl9KX0sTD1mdW5jdGlvbihhLGIsYyl7cmV0dXJuIHkoZnVuY3Rpb24oKXt2YXIgYT1iLWMubm93KCk7cmV0dXJuIEQoYSxjKX0pfTtvLmRlbGF5PWZ1bmN0aW9uKGEsYil7Ynx8KGI9bCk7cmV0dXJuIGEgaW5zdGFuY2VvZiBEYXRlP0wodGhpcyxhLmdldFRpbWUoKSxiKTpEKHRoaXMsYSxiKX07by50aHJvdHRsZT1mdW5jdGlvbihhLGIpe2J8fChiPWwpO3ZhciBjPXRoaXM7cmV0dXJuIG0oZnVuY3Rpb24oZCl7dmFyIGY9bmV3IHQsZT0hMSxnPTAsaCxpPW51bGw7aD1jLnN1YnNjcmliZShmdW5jdGlvbihjKXt2YXIgaztlPSEwO2k9YztnKys7az1nO2M9bmV3IHI7Zi5kaXNwb3NhYmxlKGMpO1xuYy5kaXNwb3NhYmxlKGIuc2NoZWR1bGVXaXRoUmVsYXRpdmUoYSxmdW5jdGlvbigpe2lmKGUmJmc9PT1rKWQub25OZXh0KGkpO2U9ITF9KSl9LGZ1bmN0aW9uKGEpe2YuZGlzcG9zZSgpO2Qub25FcnJvcihhKTtlPSExO2crK30sZnVuY3Rpb24oKXtmLmRpc3Bvc2UoKTtpZihlKWQub25OZXh0KGkpO2Qub25Db21wbGV0ZWQoKTtlPSExO2crK30pO3JldHVybiBuZXcgcyhoLGYpfSl9O28ud2luZG93V2l0aFRpbWU9ZnVuY3Rpb24oYSxiLGMpe3ZhciBkPXRoaXMsZjtiPT09biYmKGY9YSk7Yz09PW4mJihjPWwpO1wibnVtYmVyXCI9PT10eXBlb2YgYj9mPWI6XCJvYmplY3RcIj09PXR5cGVvZiBiJiYoZj1hLGM9Yik7cmV0dXJuIG0oZnVuY3Rpb24oYil7dmFyIGcsaCxpPWYsaj1hLGs9W10seCxDPW5ldyB0LGw9MDtoPW5ldyBzKEMpO3g9bmV3IHooaCk7Zz1mdW5jdGlvbigpe3ZhciBhLGQsaCxtLG47aD1uZXcgcjtDLmRpc3Bvc2FibGUoaCk7YT1kPSExO2o9PT1pP2E9ZD0hMDpqPGk/ZD0hMDpcbmE9ITA7bT1kP2o6aTtuPW0tbDtsPW07ZCYmKGorPWYpO2EmJihpKz1mKTtoLmRpc3Bvc2FibGUoYy5zY2hlZHVsZVdpdGhSZWxhdGl2ZShuLGZ1bmN0aW9uKCl7dmFyIGM7YSYmKGM9bmV3IHUsay5wdXNoKGMpLGIub25OZXh0KHYoYyx4KSkpO2QmJihjPWsuc2hpZnQoKSxjLm9uQ29tcGxldGVkKCkpO2coKX0pKX07ay5wdXNoKG5ldyB1KTtiLm9uTmV4dCh2KGtbMF0seCkpO2coKTtoLmFkZChkLnN1YnNjcmliZShmdW5jdGlvbihhKXt2YXIgYixjO2ZvcihiPTA7YjxrLmxlbmd0aDtiKyspYz1rW2JdLGMub25OZXh0KGEpfSxmdW5jdGlvbihhKXt2YXIgYyxkO2ZvcihjPTA7YzxrLmxlbmd0aDtjKyspZD1rW2NdLGQub25FcnJvcihhKTtiLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7dmFyIGEsYztmb3IoYT0wO2E8ay5sZW5ndGg7YSsrKWM9a1thXSxjLm9uQ29tcGxldGVkKCk7Yi5vbkNvbXBsZXRlZCgpfSkpO3JldHVybiB4fSl9O28ud2luZG93V2l0aFRpbWVPckNvdW50PWZ1bmN0aW9uKGEsXG5iLGMpe3ZhciBkPXRoaXM7Y3x8KGM9bCk7cmV0dXJuIG0oZnVuY3Rpb24oZil7dmFyIGUsZyxoPTAsaSxqLGs9bmV3IHQsbD0wO2c9bmV3IHMoayk7aT1uZXcgeihnKTtlPWZ1bmN0aW9uKGIpe3ZhciBkPW5ldyByO2suZGlzcG9zYWJsZShkKTtkLmRpc3Bvc2FibGUoYy5zY2hlZHVsZVdpdGhSZWxhdGl2ZShhLGZ1bmN0aW9uKCl7dmFyIGE7Yj09PWwmJihoPTAsYT0rK2wsai5vbkNvbXBsZXRlZCgpLGo9bmV3IHUsZi5vbk5leHQodihqLGkpKSxlKGEpKX0pKX07aj1uZXcgdTtmLm9uTmV4dCh2KGosaSkpO2UoMCk7Zy5hZGQoZC5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7dmFyIGM9MCxkPSExO2oub25OZXh0KGEpO2grKztoPT09YiYmKGQ9ITAsaD0wLGM9KytsLGoub25Db21wbGV0ZWQoKSxqPW5ldyB1LGYub25OZXh0KHYoaixpKSkpO2QmJmUoYyl9LGZ1bmN0aW9uKGEpe2oub25FcnJvcihhKTtmLm9uRXJyb3IoYSl9LGZ1bmN0aW9uKCl7ai5vbkNvbXBsZXRlZCgpO2Yub25Db21wbGV0ZWQoKX0pKTtcbnJldHVybiBpfSl9O28uYnVmZmVyV2l0aFRpbWU9ZnVuY3Rpb24oYSxiLGMpe3ZhciBkO2I9PT1uJiYoZD1hKTtjfHwoYz1sKTtcIm51bWJlclwiPT09dHlwZW9mIGI/ZD1iOlwib2JqZWN0XCI9PT10eXBlb2YgYiYmKGQ9YSxjPWIpO3JldHVybiB0aGlzLndpbmRvd1dpdGhUaW1lKGEsZCxjKS5zZWxlY3RNYW55KGZ1bmN0aW9uKGEpe3JldHVybiBhLnRvQXJyYXkoKX0pfTtvLmJ1ZmZlcldpdGhUaW1lT3JDb3VudD1mdW5jdGlvbihhLGIsYyl7Y3x8KGM9bCk7cmV0dXJuIHRoaXMud2luZG93V2l0aFRpbWVPckNvdW50KGEsYixjKS5zZWxlY3RNYW55KGZ1bmN0aW9uKGEpe3JldHVybiBhLnRvQXJyYXkoKX0pfTtvLnRpbWVJbnRlcnZhbD1mdW5jdGlvbihhKXt2YXIgYj10aGlzO2F8fChhPWwpO3JldHVybiB5KGZ1bmN0aW9uKCl7dmFyIGM9YS5ub3coKTtyZXR1cm4gYi5zZWxlY3QoZnVuY3Rpb24oYil7dmFyIGY9YS5ub3coKSxlPWYtYztjPWY7cmV0dXJue3ZhbHVlOmIsaW50ZXJ2YWw6ZX19KX0pfTtcbm8udGltZXN0YW1wPWZ1bmN0aW9uKGEpe2F8fChhPWwpO3JldHVybiB0aGlzLnNlbGVjdChmdW5jdGlvbihiKXtyZXR1cm57dmFsdWU6Yix0aW1lc3RhbXA6YS5ub3coKX19KX07dmFyIEU9ZnVuY3Rpb24oYSxiKXtyZXR1cm4gSChhLGIsZnVuY3Rpb24oYSl7dmFyIGI9ITEsZjtyZXR1cm4gbmV3IEcoZnVuY3Rpb24oZSl7XCJOXCI9PT1lLmtpbmQmJihmPWUpO1wiRVwiPT09ZS5raW5kJiZlLmFjY2VwdChhKTtcIkNcIj09PWUua2luZCYmKGI9ITApfSxmdW5jdGlvbigpe3ZhciBlPWY7Zj1uO2UhPT1uJiZlLmFjY2VwdChhKTtpZihiKWEub25Db21wbGV0ZWQoKX0pfSl9O28uc2FtcGxlPWZ1bmN0aW9uKGEsYil7Ynx8KGI9bCk7cmV0dXJuXCJudW1iZXJcIj09PXR5cGVvZiBhP0UodGhpcyxLKGEsYikpOkUodGhpcyxhKX07by50aW1lb3V0PWZ1bmN0aW9uKGEsYixjKXt2YXIgZCxmPXRoaXM7Yj09PW4mJihiPUYoRXJyb3IoXCJUaW1lb3V0XCIpKSk7Y3x8KGM9bCk7ZD1hIGluc3RhbmNlb2YgRGF0ZT9cbmZ1bmN0aW9uKGEsYil7Yy5zY2hlZHVsZVdpdGhBYnNvbHV0ZShhLGIpfTpmdW5jdGlvbihhLGIpe2Muc2NoZWR1bGVXaXRoUmVsYXRpdmUoYSxiKX07cmV0dXJuIG0oZnVuY3Rpb24oYyl7dmFyIGcsaD0wLGk9bmV3IHIsaj1uZXcgdCxrPSExLGw9bmV3IHQ7ai5kaXNwb3NhYmxlKGkpO2c9ZnVuY3Rpb24oKXt2YXIgZj1oO2wuZGlzcG9zYWJsZShkKGEsZnVuY3Rpb24oKXsoaz1oPT09ZikmJmouZGlzcG9zYWJsZShiLnN1YnNjcmliZShjKSl9KSl9O2coKTtpLmRpc3Bvc2FibGUoZi5zdWJzY3JpYmUoZnVuY3Rpb24oYSl7a3x8KGgrKyxjLm9uTmV4dChhKSxnKCkpfSxmdW5jdGlvbihhKXtrfHwoaCsrLGMub25FcnJvcihhKSl9LGZ1bmN0aW9uKCl7a3x8KGgrKyxjLm9uQ29tcGxldGVkKCkpfSkpO3JldHVybiBuZXcgcyhqLGwpfSl9O3EuZ2VuZXJhdGVXaXRoQWJzb2x1dGVUaW1lPWZ1bmN0aW9uKGEsYixjLGQsZixlKXtlfHwoZT1sKTtyZXR1cm4gbShmdW5jdGlvbihnKXt2YXIgaD1cbiEwLGk9ITEsaixrPWEsbDtyZXR1cm4gZS5zY2hlZHVsZVJlY3Vyc2l2ZVdpdGhBYnNvbHV0ZShlLm5vdygpLGZ1bmN0aW9uKGEpe2lmKGkpZy5vbk5leHQoaik7dHJ5e2lmKGg/aD0hMTprPWMoayksaT1iKGspKWo9ZChrKSxsPWYoayl9Y2F0Y2goZSl7Zy5vbkVycm9yKGUpO3JldHVybn1pZihpKWEobCk7ZWxzZSBnLm9uQ29tcGxldGVkKCl9KX0pfTtxLmdlbmVyYXRlV2l0aFJlbGF0aXZlVGltZT1mdW5jdGlvbihhLGIsYyxkLGYsZSl7ZXx8KGU9bCk7cmV0dXJuIG0oZnVuY3Rpb24oZyl7dmFyIGg9ITAsaT0hMSxqLGs9YSxsO3JldHVybiBlLnNjaGVkdWxlUmVjdXJzaXZlV2l0aFJlbGF0aXZlKDAsZnVuY3Rpb24oYSl7aWYoaSlnLm9uTmV4dChqKTt0cnl7aWYoaD9oPSExOms9YyhrKSxpPWIoaykpaj1kKGspLGw9ZihrKX1jYXRjaChlKXtnLm9uRXJyb3IoZSk7cmV0dXJufWlmKGkpYShsKTtlbHNlIGcub25Db21wbGV0ZWQoKX0pfSl9fTtcbiJdfQ==
;