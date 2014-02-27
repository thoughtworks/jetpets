global.SRC = __dirname + '/../src'
global.DEVICE = __dirname + '/../assets/device'

Object.defineProperty(global, 'should', {writable: true});

global.should = require('should');
global.assert = require('assert');
global.sinon = require('sinon');
