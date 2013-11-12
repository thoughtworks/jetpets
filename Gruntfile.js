'use strict';

var config = {};
var fs = require('fs');

var createSystem = function(grunt) {
  return function(cmd, callback) {
    var args = cmd.split(/ /);
    grunt.util.spawn({
      cmd: args[0],
      args: args.slice(1)
    }, function(err, result, code) {
      callback(err, result, code);
    });
  };
};

//
// CSS
//
config.stylus = {
  options: {
    compress: true
  },
  compile: {
    files: {
      'builtAssets/device/device.css':  'assets/device/css/device.styl',
      'builtAssets/admin/admin.css':    'assets/admin/css/admin.styl',
      'builtAssets/game/game.css':      'assets/game/css/game.styl'
    }
  }
};

//
// JS
//
config.browserify2 = {
  admin: {
    entry: __dirname + '/assets/admin/js/admin.js',
    beforeHook: function(bundle) {
      bundle.transform(require('hbsfy'));
    },
    compile: __dirname + '/builtAssets/admin/admin.js',
    debug: true
  },
  device: {
    entry: __dirname + '/assets/device/js/device.js',
    beforeHook: function(bundle) {
      bundle.transform(require('hbsfy'));
    },
    compile: __dirname + '/builtAssets/device/device.js',
    debug: true
  },
  game: {
    entry: __dirname + '/assets/game/js/main.js',
    beforeHook: function(bundle) {
      bundle.transform(require('hbsfy'));
    },
    compile: __dirname + '/builtAssets/game/main.js',
    debug: true
  }
};

config.jshint = {
  options: {
    jshintrc: '.jshintrc'
  },
  all: [
    'Gruntfile.js',
    'src/**/*.js'
  ]
};

//
// Static files
//
config.copy = {
  main: {
    files: [
      { expand: true, cwd: 'files/', src: ['**'], dest: 'builtAssets/' }
    ]
  }
};

//
// Reload when files change
//
config.watch = {
  js: {
    files: ['assets/**/*.js', 'assets/**/*.hbs'],
    tasks: ['browserify2:admin', 'browserify2:device', 'browserify2:game']
  },
  css: {
    files: ['assets/**/*.styl'],
    tasks: ['stylus']
  },
  files: {
    files: ['files/**/*'],
    tasks: ['copy']
  },
  tests: {
    files: ['test/**/*', 'src/**/*'],
    tasks: ['simplemocha']
  }
};

//
// Unit tests
//
config.simplemocha = {
  options: {
    globals: ['should', 'sinon'],
    require: ['test/spec-helper.js'],
    timeout: 3000,
    ignoreLeaks: true,
    ui: 'bdd',
    reporter: 'spec'
  },
  all: { src: ['test/**/*.js'] }
};

// Heroku Setup
config.heroku = {
  prereq: function(grunt) {
    if (!fs.existsSync('aws.json')) {
      grunt.fail.fatal('You need \'aws.json\'. Get it from the JetPets MyTW group.');
    }
  },

  setConfig: function(grunt, signal) {
    var system = createSystem(grunt);
    var aws = require('./aws');
    system('heroku config:set KEY=' + aws.key, function() {
      grunt.log.writeln('Set key');
      system('heroku config:set SECRET=' + aws.secret, function() {
        grunt.log.writeln('Set secret');
        system('heroku config:set BUCKET=' + aws.bucket, function() {
          grunt.log.writeln('Set all config params. App is ready to run.');
          signal();
        });
      });
    });
  },

  createApp: function(grunt) {
    var system = createSystem(grunt);

    return function(appName) {
      var done = grunt.task.current.async();
      config.heroku.prereq(grunt);

      grunt.log.writeln('Creating Heroku app called: ' + appName);
      system('heroku create ' + appName, function(err, result, code) {
        if (code === 0) {
          grunt.log.ok('Created app.');
          config.heroku.setConfig(grunt, done);
        } else {
          grunt.fail.fatal('Heroku app create failed: ' + result);
        }
      });
      grunt.log.writeln('After spawn.');
    };
  },

  configure: function(grunt) {
    return function() {
      config.heroku.setConfig(grunt, grunt.task.current.async());
    };
  }
};

module.exports = function(grunt) {
  
  config.pkg = grunt.file.readJSON('package.json');
  grunt.initConfig(config);

  require('matchdep').filterDev('grunt-*').forEach(grunt.loadNpmTasks);

  grunt.registerTask('default', 'build');
  grunt.registerTask('build', ['jshint', 'stylus', 'browserify2:admin', 'browserify2:device', 'browserify2:game', 'copy']);
  grunt.registerTask('test',  ['jshint', 'simplemocha']);

  grunt.registerTask('app', 'Create Heroku app', config.heroku.createApp(grunt));
  grunt.registerTask('configure',
                     'Configure Heroku app with AWS keys.',
                     config.heroku.configure(grunt));

};
