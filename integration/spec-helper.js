global.SRC = __dirname + '/../src'

Object.defineProperty(global, 'should', {writable: true});

global.should = require('should');

