'use strict';

var knox = require('knox');
var s3client = null;
var DB_FILE = require('config').repository.players.file || './players.json';

var getClient = function () {
  if (s3client === null) {
    if (!process.env.KEY || !process.env.SECRET || !process.env.BUCKET) {
      console.error('AWS credentials not present. Make sure you load them from aws.json.');
      process.exit(1);
    }

    s3client = knox.createClient({
      key: process.env.KEY,
      secret: process.env.SECRET,
      bucket: process.env.BUCKET
    });
  }
  return s3client;
};

exports.loadPlayers = function (callback, fileName) {
  var s3client = getClient();
  var playerFile = fileName || DB_FILE;
  console.log('Loading players from file %s', playerFile);
  s3client.get(playerFile).on('response',function (res) {
    if (res.statusCode === 404) {
      callback(null, []);
    } else {
      var data = '';
      res.setEncoding('utf8');
      res.on('data', function (chunk) {
        data = data + chunk;
      });
      res.on('end', function () {
        callback(null, JSON.parse(data).players);
      });
    }
  }).end();
};

exports.savePlayers = function (players, fileName, callback) {
  var s3client = getClient();
  var playerFile = fileName || DB_FILE;
  console.log('Trying to save players to %s', playerFile);
  var content = JSON.stringify({players: players}, null, '\t');
  var req = s3client.put(playerFile, {
    'Content-Length': new Buffer(content).length,
    'Content-Type': 'application/json'
  });
  req.on('response', function (res) {
    if (res.statusCode === 200) {
      console.log('Saved players to %s', res.url);
      if (callback !== undefined) {
        callback();
      }
    } else {
      console.error('Something went wrong when saving players!');
    }
  });
  req.end(content);
};

exports.deleteAllPlayers = function (fileName, callback) {
  if (!fileName) {
    console.error('This function has to be called with a fileName to prevent accidental deletion of player data');
  }
  console.log('Deleting all players in %s', fileName);
  exports.savePlayers([], fileName, callback);
};
