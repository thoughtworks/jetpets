'use strict';

var fs = require ('fs');
var knox = require('knox');
require('child_process').exec();

function error(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync('./aws.json')) {
  error('You\'re going to need the \'aws.json\' file from MyTW.');
}

// Get the players.json file from the server
var s3client = knox.createClient(require('../aws.json'));
var conn = s3client.get('./players.json');

conn.on('error', function() {
  error('S3 didn\'t like what we did :(');
});

conn.on('response', function(res) {
  if (res.statusCode === 404) {
    error('Can\'t find the \'players.json\' file in your S3 bucket.');
  }
  var playersData = '';
  res.setEncoding('utf8');

  res.on('data', function(chunk) {
    playersData = playersData + chunk;
  });
  res.on('end', function() {
    // Convert it into a CSV
    var players = JSON.parse(playersData);
    var report = fs.createWriteStream('./report.csv', {flags: 'a'});
    var keys = ['lastName', 'firstName', 'country', 'company', 'role', 'email'];

    keys.forEach(function(k) {
      report.write(k);
      report.write(',');
    });
    report.write('\n');

    players.players.forEach(function(player) {
      keys.forEach(function(k) {
        report.write(String(player[k]));
        report.write(',');
      });
      report.write('\n');
    });
    report.end();

    console.log('Produced \'report.csv\'.');
  });
});
conn.end();
